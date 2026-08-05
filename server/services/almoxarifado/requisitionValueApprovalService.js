/**
 * Aprovação de liberação por valor em requisições de material
 */
const { dbRun, dbGet, dbAll } = require('./db');
const alertService = require('./alertService');

const CONFIG_KEYS = {
  ativo: 'liberacao_valor_ativo',
  limite: 'liberacao_valor_limite',
  aprovadores: 'liberacao_valor_aprovadores',
};

const STATUS_AGUARDANDO = 'AGUARDANDO_APROVACAO_VALOR';

function parseList(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
  } catch (_) {
    return String(value).split(',').map((v) => Number(v.trim())).filter((n) => Number.isFinite(n) && n > 0);
  }
  return [];
}

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value) === '1' || String(value).toLowerCase() === 'true';
}

function formatMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function getConfig(db) {
  const [ativoRaw, limiteRaw, aprovadoresRaw] = await Promise.all([
    alertService.getConfigValue(db, CONFIG_KEYS.ativo),
    alertService.getConfigValue(db, CONFIG_KEYS.limite),
    alertService.getConfigValue(db, CONFIG_KEYS.aprovadores),
  ]);
  const limite = Number(limiteRaw);
  return {
    ativo: parseBool(ativoRaw, false),
    limite: Number.isFinite(limite) && limite >= 0 ? limite : 0,
    aprovadorIds: parseList(aprovadoresRaw),
  };
}

async function getAprovadoresDetalhes(db) {
  const { aprovadorIds } = await getConfig(db);
  if (!aprovadorIds.length) return [];
  const placeholders = aprovadorIds.map(() => '?').join(',');
  const rows = await dbAll(db,
    `SELECT id, nome, email FROM usuarios WHERE id IN (${placeholders}) AND COALESCE(ativo, 1) = 1`,
    aprovadorIds);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return aprovadorIds.map((id) => byId.get(id)).filter(Boolean);
}

async function calcularValorTotal(db, requisicaoId) {
  const row = await dbGet(db, `SELECT COALESCE(SUM(
      ir.quantidade_solicitada * (
        CASE WHEN COALESCE(ma.custo_medio, 0) > 0 THEN ma.custo_medio ELSE COALESCE(ma.custo_unitario, 0) END
      )
    ), 0) as valor_total
    FROM itens_requisicao_almoxarifado ir
    JOIN materiais_almoxarifado ma ON ir.material_id = ma.id
    WHERE ir.requisicao_id = ?`, [requisicaoId]);
  return Math.round((Number(row?.valor_total) || 0) * 100) / 100;
}

async function avaliarRequisicaoValor(db, requisicaoId) {
  const config = await getConfig(db);
  const valor_total = await calcularValorTotal(db, requisicaoId);
  const requer_aprovacao_valor = config.ativo && valor_total > config.limite;
  return { ...config, valor_total, requer_aprovacao_valor };
}

async function atualizarValorRequisicao(db, requisicaoId, avaliacao) {
  await dbRun(db,
    `UPDATE requisicoes_almoxarifado
     SET valor_total = ?, requer_aprovacao_valor = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [avaliacao.valor_total, avaliacao.requer_aprovacao_valor ? 1 : 0, requisicaoId]);
}

function isAdmin(user) {
  return user?.role === 'admin';
}

async function isAprovadorValor(db, user) {
  if (!user?.id) return false;
  if (isAdmin(user)) return true;
  const { aprovadorIds } = await getConfig(db);
  return aprovadorIds.includes(Number(user.id));
}

async function aplicarAvaliacaoNaCriacao(db, requisicaoId) {
  const avaliacao = await avaliarRequisicaoValor(db, requisicaoId);
  await atualizarValorRequisicao(db, requisicaoId, avaliacao);

  if (!avaliacao.requer_aprovacao_valor) {
    return { status: 'PENDENTE', ...avaliacao };
  }

  await dbRun(db,
    `UPDATE requisicoes_almoxarifado
     SET status = ?, updated_at = CURRENT_TIMESTAMP, ultimo_lembrete_enviado = NULL
     WHERE id = ?`,
    [STATUS_AGUARDANDO, requisicaoId]);

  const req = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  notificarAprovadoresValor(db, req, avaliacao).catch((err) => {
    console.warn('[liberacao-valor] Falha ao notificar aprovadores:', err.message);
  });

  return { status: STATUS_AGUARDANDO, ...avaliacao };
}

async function verificarBloqueioLiberacao(db, requisicaoId) {
  const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  if (!reqRow) {
    const err = new Error('Requisição não encontrada');
    err.status = 404;
    throw err;
  }

  if (reqRow.status === STATUS_AGUARDANDO) {
    const err = new Error(
      `Requisição aguardando aprovação de valor (${formatMoeda(reqRow.valor_total)}). `
      + 'Um aprovador autorizado deve liberar antes da separação ou entrega.'
    );
    err.status = 403;
    err.code = 'AGUARDANDO_APROVACAO_VALOR';
    throw err;
  }

  const avaliacao = await avaliarRequisicaoValor(db, requisicaoId);
  await atualizarValorRequisicao(db, requisicaoId, avaliacao);

  if (!avaliacao.requer_aprovacao_valor) return reqRow;

  if (reqRow.data_aprovacao_valor) return reqRow;

  await dbRun(db,
    `UPDATE requisicoes_almoxarifado
     SET status = ?, requer_aprovacao_valor = 1, updated_at = CURRENT_TIMESTAMP, ultimo_lembrete_enviado = NULL
     WHERE id = ?`,
    [STATUS_AGUARDANDO, requisicaoId]);

  const atualizado = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  notificarAprovadoresValor(db, atualizado, avaliacao).catch((err) => {
    console.warn('[liberacao-valor] Falha ao notificar aprovadores:', err.message);
  });

  const err = new Error(
    `Valor total (${formatMoeda(avaliacao.valor_total)}) excede o limite de liberação automática `
    + `(${formatMoeda(avaliacao.limite)}). Aprovação de alto valor necessária.`
  );
  err.status = 403;
  err.code = 'AGUARDANDO_APROVACAO_VALOR';
  throw err;
}

async function aprovarValor(db, requisicaoId, user) {
  if (!(await isAprovadorValor(db, user))) {
    const err = new Error('Sem permissão para aprovar liberação por valor');
    err.status = 403;
    throw err;
  }

  const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  if (!reqRow) {
    const err = new Error('Requisição não encontrada');
    err.status = 404;
    throw err;
  }

  // Segregação de funções (design, "Decisões aprovadas" #1): o solicitante não pode
  // liberar por valor a própria requisição, mesmo quando também é um aprovador de valor
  // configurado ou admin. NÃO se aplica a rejeitarValor (abaixo) — reprovar a própria
  // requisição é desistência, decisão legítima do solicitante.
  if (Number(user.id) === Number(reqRow.solicitante_id)) {
    const err = new Error('Solicitante não pode aprovar a própria requisição');
    err.status = 403;
    throw err;
  }

  if (reqRow.status !== STATUS_AGUARDANDO) {
    const err = new Error('Apenas requisições aguardando aprovação de valor podem ser liberadas');
    err.status = 400;
    throw err;
  }

  await dbRun(db,
    `UPDATE requisicoes_almoxarifado
     SET status = 'APROVADO', aprovador_valor_id = ?, aprovador_valor_nome = ?,
         data_aprovacao_valor = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
         ultimo_lembrete_enviado = NULL, rejeicao_valor_motivo = NULL
     WHERE id = ?`,
    [user.id, user.nome || user.email, requisicaoId]);

  const atualizado = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  notificarSolicitanteValor(db, atualizado, 'aprovado').catch((err) => {
    console.warn('[liberacao-valor] Falha ao notificar solicitante (aprovação):', err.message);
  });

  return { success: true, status: 'APROVADO' };
}

// Sem segregação de funções aqui de propósito (design, "Decisões aprovadas" #1): um
// solicitante que também seja aprovador de valor pode reprovar a própria requisição —
// reprovar é desistência, decisão legítima do solicitante. O motivo em si é exigido na
// rota (RejeicaoSchema/validate, server/routes/almoxarifado.js) antes de chegar aqui; o
// fallback abaixo é só defesa para chamadas diretas ao serviço (ex.: testes/scripts).
async function rejeitarValor(db, requisicaoId, user, motivo) {
  if (!(await isAprovadorValor(db, user))) {
    const err = new Error('Sem permissão para reprovar liberação por valor');
    err.status = 403;
    throw err;
  }

  const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  if (!reqRow) {
    const err = new Error('Requisição não encontrada');
    err.status = 404;
    throw err;
  }
  if (reqRow.status !== STATUS_AGUARDANDO) {
    const err = new Error('Apenas requisições aguardando aprovação de valor podem ser reprovadas');
    err.status = 400;
    throw err;
  }

  const motivoFinal = motivo?.trim() || 'Reprovada pelo aprovador de alto valor';

  await dbRun(db,
    `UPDATE requisicoes_almoxarifado
     SET status = 'REJEITADO', rejeicao_motivo = ?, rejeicao_valor_motivo = ?,
         aprovador_valor_id = ?, aprovador_valor_nome = ?,
         updated_at = CURRENT_TIMESTAMP, ultimo_lembrete_enviado = NULL
     WHERE id = ?`,
    [motivoFinal, motivoFinal, user.id, user.nome || user.email, requisicaoId]);

  const atualizado = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  notificarSolicitanteValor(db, atualizado, 'rejeitado', motivoFinal).catch((err) => {
    console.warn('[liberacao-valor] Falha ao notificar solicitante (rejeição):', err.message);
  });

  return { success: true, status: 'REJEITADO' };
}

async function listarAguardandoAprovacao(db) {
  return dbAll(db,
    `SELECT r.*,
       (SELECT COUNT(*) FROM itens_requisicao_almoxarifado WHERE requisicao_id = r.id) as total_itens
     FROM requisicoes_almoxarifado r
     WHERE COALESCE(r.ativo, 1) = 1 AND r.status = ?
     ORDER BY r.created_at ASC`,
    [STATUS_AGUARDANDO]);
}

function buildEmailBase(requisicao, titulo, corpoHtml, appBaseUrl) {
  const { numero, setor, solicitante_nome, valor_total } = requisicao;
  const assunto = `${titulo} — ${numero}`;
  const valorFmt = formatMoeda(valor_total);
  const appUrl = appBaseUrl ? `${String(appBaseUrl).replace(/\/$/, '')}/almoxarifado/requisicoes?status=AGUARDANDO_APROVACAO_VALOR` : null;

  const text = `${titulo} — ORION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Número: ${numero}
Setor: ${setor || '—'}
Solicitante: ${solicitante_nome || '—'}
Valor total: ${valorFmt}

${corpoHtml.replace(/<[^>]+>/g, ' ')}

${appUrl ? `Acessar: ${appUrl}\n` : ''}
GMP Industriais — Orion`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>${alertService.escapeHtml(assunto)}</title></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;border:1px solid #e5e7eb;">
        <tr>
          <td style="padding:20px 24px;background-color:#0a1929;">
            <div style="font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:2px;">ORION</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:4px;">${alertService.escapeHtml(titulo)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;font-family:Arial,Helvetica,sans-serif;">
            <p style="margin:0 0 8px;font-size:15px;color:#111827;"><strong>${alertService.escapeHtml(numero)}</strong></p>
            <p style="margin:0 0 8px;font-size:13px;color:#374151;"><strong>Setor:</strong> ${alertService.escapeHtml(setor || '—')}</p>
            <p style="margin:0 0 8px;font-size:13px;color:#374151;"><strong>Solicitante:</strong> ${alertService.escapeHtml(solicitante_nome || '—')}</p>
            <p style="margin:0 0 16px;font-size:13px;color:#374151;"><strong>Valor total:</strong> <span style="color:#e59800;font-weight:700;">${alertService.escapeHtml(valorFmt)}</span></p>
            ${corpoHtml}
            ${appUrl ? `<p style="margin:20px 0 0;text-align:center;"><a href="${alertService.escapeHtml(appUrl)}" style="display:inline-block;padding:12px 28px;background-color:#ff6b00;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px;">Ver Aprovações de Valor</a></p>` : ''}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { assunto, text, html };
}

async function getEmailsAprovadores(db) {
  const aprovadores = await getAprovadoresDetalhes(db);
  const emails = aprovadores.map((a) => a.email).filter(Boolean);
  if (emails.length) return emails;

  const requisitionNotificationService = require('./requisitionNotificationService');
  return requisitionNotificationService.getRequisicaoNotificationEmails(db);
}

async function notificarAprovadoresValor(db, requisicao, avaliacao) {
  const emails = await getEmailsAprovadores(db);
  if (!emails.length) {
    console.warn('[liberacao-valor] Nenhum e-mail de aprovador configurado.');
    return { enviados: 0, skipped: true };
  }

  const settings = await alertService.getAlertSettings(db);
  const limiteFmt = formatMoeda(avaliacao?.limite ?? 0);
  const corpo = `<p style="margin:0;font-size:13px;color:#374151;">Esta requisição excede o limite de liberação automática (${alertService.escapeHtml(limiteFmt)}). Acesse o Almoxarifado para <strong>aprovar ou reprovar</strong> a liberação.</p>`;
  const msg = buildEmailBase(requisicao, 'Aprovação de valor necessária', corpo, settings.appUrl);
  return alertService.enviarEmail(db, emails, msg.assunto, msg.html, msg.text);
}

async function notificarSolicitanteValor(db, requisicao, tipo, motivo) {
  const solicitante = await dbGet(db, 'SELECT email FROM usuarios WHERE id = ?', [requisicao.solicitante_id]);
  if (!solicitante?.email) return { enviados: 0, skipped: true };

  const settings = await alertService.getAlertSettings(db);
  const aprovador = requisicao.aprovador_valor_nome || 'Aprovador';
  let titulo;
  let corpo;

  if (tipo === 'aprovado') {
    titulo = 'Liberação por valor aprovada';
    corpo = `<p style="margin:0;font-size:13px;color:#374151;">Sua requisição foi <strong style="color:#27ae60;">aprovada</strong> para liberação por <strong>${alertService.escapeHtml(aprovador)}</strong>. O almoxarifado pode prosseguir com separação e entrega.</p>`;
  } else {
    titulo = 'Liberação por valor reprovada';
    corpo = `<p style="margin:0 0 8px;font-size:13px;color:#374151;">Sua requisição foi <strong style="color:#e5193a;">reprovada</strong> por <strong>${alertService.escapeHtml(aprovador)}</strong>.</p>`
      + (motivo ? `<p style="margin:0;font-size:13px;color:#6b7280;"><strong>Motivo:</strong> ${alertService.escapeHtml(motivo)}</p>` : '');
  }

  const msg = buildEmailBase(requisicao, titulo, corpo, settings.appUrl);
  return alertService.enviarEmail(db, [solicitante.email], msg.assunto, msg.html, msg.text);
}

async function getConfigForApi(db, user) {
  const config = await getConfig(db);
  const aprovadores = await getAprovadoresDetalhes(db);
  const souAprovador = user ? await isAprovadorValor(db, user) : false;
  return {
    ativo: config.ativo,
    limite: config.limite,
    aprovadores,
    aprovadorIds: config.aprovadorIds,
    souAprovador,
  };
}

async function saveConfig(db, payload, userName) {
  const ativo = payload.ativo === false || payload.ativo === '0' ? '0' : '1';
  const limite = Number(payload.limite);
  const limiteStr = Number.isFinite(limite) && limite >= 0 ? String(limite) : '0';
  const ids = Array.isArray(payload.aprovadorIds)
    ? payload.aprovadorIds.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)
    : [];

  const entries = [
    [CONFIG_KEYS.ativo, ativo, 'Habilita liberação automática por valor em requisições'],
    [CONFIG_KEYS.limite, limiteStr, 'Valor máximo (R$) para liberação automática sem aprovação extra'],
    [CONFIG_KEYS.aprovadores, JSON.stringify(ids), 'IDs dos usuários aprovadores de alto valor (JSON)'],
  ];

  for (const [chave, valor, descricao] of entries) {
    await dbRun(db,
      `INSERT INTO configuracoes_almoxarifado (chave, valor, descricao, updated_at, updated_by)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by`,
      [chave, valor, descricao, userName || null]);
  }

  return getConfigForApi(db, null);
}

module.exports = {
  CONFIG_KEYS,
  STATUS_AGUARDANDO,
  parseList,
  getConfig,
  getConfigForApi,
  saveConfig,
  calcularValorTotal,
  avaliarRequisicaoValor,
  aplicarAvaliacaoNaCriacao,
  verificarBloqueioLiberacao,
  isAprovadorValor,
  aprovarValor,
  rejeitarValor,
  listarAguardandoAprovacao,
  notificarAprovadoresValor,
  notificarSolicitanteValor,
  formatMoeda,
};
