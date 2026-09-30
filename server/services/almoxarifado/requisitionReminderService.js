/**
 * Lembretes diários por e-mail para requisições paradas esperando um gesto de aprovação:
 *  - PENDENTE → a aprovação normal; plateia = lista geral de notificação;
 *  - AGUARDANDO_APROVACAO_VALOR (Etapa 47, T1) → a LIBERAÇÃO POR VALOR; plateia = os aprovadores
 *    de valor configurados (`getEmailsAprovadores`, que cai na lista geral se não houver nenhum).
 *
 * A liberação por valor NÃO é regra de aprovação: é mecanismo próprio, com colunas e plateia
 * próprias, e para ele o `status` é chave legítima. As pendências de regra (T4 em diante) são
 * cobradas por OUTRO lembrete, dirigido por pendência — nunca por `status`.
 */
const { dbGet, dbAll, dbRun } = require('./db');
const alertService = require('./alertService');
const requisitionNotificationService = require('./requisitionNotificationService');
// Sem ciclo: o serviço de valor não importa este módulo. A chamada é sempre pela propriedade do
// módulo (`requisitionValueApprovalService.getEmailsAprovadores`), não por desestruturação.
const requisitionValueApprovalService = require('./requisitionValueApprovalService');
// Sem ciclo: o serviço de regras não importa este módulo.
const approvalRulesService = require('./approvalRulesService');

const STATUS_AGUARDANDO_VALOR = requisitionValueApprovalService.STATUS_AGUARDANDO;

const DEFAULT_INTERVAL_HOURS = 24;

const CONFIG_KEYS = {
  ativo: 'requisicoes_lembrete_ativo',
  intervaloHoras: 'requisicoes_lembrete_intervalo_horas',
  emails: 'requisicoes_notificar_emails',
};

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value) === '1' || String(value).toLowerCase() === 'true';
}

function parseList(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
  } catch (_) {
    return String(value).split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

async function getConfigValue(db, chave) {
  const row = await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [chave]);
  return row?.valor;
}

async function getReminderSettings(db) {
  const [ativo, intervaloHoras, appUrlDb] = await Promise.all([
    getConfigValue(db, CONFIG_KEYS.ativo),
    getConfigValue(db, CONFIG_KEYS.intervaloHoras),
    getConfigValue(db, alertService.APP_URL_CONFIG_KEY),
  ]);

  const emails = await requisitionNotificationService.getRequisicaoNotificationEmails(db);
  // O limite mora aqui, e não dentro de `buildMensagemLembrete`: ela é síncrona e exportada.
  const { limite: limiteValor } = await requisitionValueApprovalService.getConfig(db);

  return {
    ativo: parseBool(ativo, true),
    intervaloHoras: Number(intervaloHoras) > 0 ? Number(intervaloHoras) : DEFAULT_INTERVAL_HOURS,
    emails,
    limiteValor,
    appUrl: alertService.resolveAppBaseUrl(appUrlDb),
  };
}

async function getReminderSettingsForApi(db) {
  const settings = await getReminderSettings(db);
  const emailsDb = await getConfigValue(db, CONFIG_KEYS.emails);
  return {
    requisicoesLembreteAtivo: settings.ativo,
    requisicoesLembreteIntervaloHoras: settings.intervaloHoras,
    requisicoesNotificarEmails: parseList(emailsDb),
    requisicoesUsaEmailsAlertaEstoque: !parseList(emailsDb).length,
  };
}

/**
 * `updated_at` do SQLite vem "YYYY-MM-DD HH:MM:SS" em UTC e sem "Z": o `new Date` lia como hora
 * LOCAL (UTC-3 no servidor) e o lembrete dizia "há 2 dias" com 50h de espera. Mesma solução de
 * `alertRegistry.maisVelhoQueDias`: só acrescenta "Z" quando não há "T", senão um ISO já válido
 * viraria "...ZZ".
 */
function diasAguardando(updatedAt) {
  const s = String(updatedAt ?? '');
  const ts = new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`).getTime();
  if (Number.isNaN(ts)) return 1;
  const diffMs = Date.now() - ts;
  return Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

function getRequisicoesUrl(appBaseUrl) {
  const base = alertService.resolveAppBaseUrl(appBaseUrl);
  return `${base}/almoxarifado/requisicoes`;
}

/**
 * `settings` é opcional para não quebrar quem já chama com quatro argumentos; só a variante de
 * liberação por valor o usa (para o limite).
 * `pendencia` (Etapa 47, T5) escolhe a terceira variante: a cobrança de UMA pendência de regra,
 * que nomeia a regra. Ela ganha de `porValor`: quando há pendência, é ela o gesto que falta.
 */
function buildMensagemLembrete(requisicao, itens, dias, appBaseUrl, settings = {}, pendencia = null) {
  const numero = requisicao.numero || `REQ-${requisicao.id}`;
  const porRegra = !!pendencia;
  const porValor = !porRegra && requisicao.status === STATUS_AGUARDANDO_VALOR;
  let gesto = 'aprovação';
  let tituloGesto = 'APROVAÇÃO';
  let chamada = 'aprovar ou rejeitar';
  if (porRegra) {
    gesto = `aprovação da regra "${pendencia.regra_nome}"`;
    tituloGesto = 'APROVAÇÃO DE REGRA';
    chamada = 'assinar a aprovação da regra';
  } else if (porValor) {
    gesto = 'liberação por valor';
    tituloGesto = 'LIBERAÇÃO POR VALOR';
    chamada = 'aprovar ou reprovar a liberação';
  }
  const diasFlex = `${dias} dia${dias === 1 ? '' : 's'}`;
  const assunto = `Lembrete: Requisição ${numero} aguardando ${gesto} há ${diasFlex}`;
  // `formatMoeda` já emite o "R$" — a literal não o repete.
  const valorComLimite = porValor
    ? `${requisitionValueApprovalService.formatMoeda(requisicao.valor_total)}`
      + ` (limite de liberação automática: ${requisitionValueApprovalService.formatMoeda(settings.limiteValor)})`
    : null;
  const geradoEm = alertService.formatDateTimePtBr();
  const appUrl = getRequisicoesUrl(appBaseUrl);
  const setor = requisicao.setor || requisicao.departamento || 'Não informado';
  const urgencia = requisicao.urgencia || 'NORMAL';
  const osRef = requisicao.os_referencia || '—';

  const itensTexto = itens.map((item) => {
    const un = item.unidade ? ` ${item.unidade}` : '';
    return `• ${item.material_nome || item.material_codigo} — ${item.quantidade_solicitada}${un}`;
  }).join('\n');

  const itensHtml = itens.map((item) => {
    const un = item.unidade ? ` ${alertService.escapeHtml(item.unidade)}` : '';
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#374151;">
        ${alertService.escapeHtml(item.material_nome || item.material_codigo)}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:Consolas,Monaco,monospace;font-size:12px;color:#6b7280;">
        ${alertService.escapeHtml(item.material_codigo || '—')}
      </td>
      <td align="right" style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:600;color:#111827;">
        ${alertService.escapeHtml(item.quantidade_solicitada)}${un}
      </td>
    </tr>`;
  }).join('');

  const text = `LEMBRETE — REQUISIÇÃO AGUARDANDO ${tituloGesto}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Requisição: ${numero}
Aguardando há: ${dias} dia(s)${porRegra ? `\nRegra: ${pendencia.regra_nome}` : ''}${valorComLimite ? `\nValor total: ${valorComLimite}` : ''}
Solicitante: ${requisicao.solicitante_nome}
Setor: ${setor}
Urgência: ${urgencia}
OS/Referência: ${osRef}

Itens:
${itensTexto || '—'}

Acesse o sistema para ${chamada}:
${appUrl}

Gerado em ${geradoEm}
GMP Industriais — Orion`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${alertService.escapeHtml(assunto)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="padding:20px 24px;background-color:#0a1929;background-image:linear-gradient(135deg,#0a1929 0%,#1a365d 100%);">
              <div style="font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:2px;">ORION</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:4px;">Sistema de Gestão Industrial</div>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px;background-color:#eff6ff;border-bottom:3px solid #2563eb;font-family:Arial,Helvetica,sans-serif;">
              <div style="font-size:15px;font-weight:bold;color:#1d4ed8;">📋 Requisição aguardando ${gesto} há ${diasFlex}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;font-family:Arial,Helvetica,sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:16px;">
                <tr>
                  <td style="padding:12px 16px;background-color:#f9fafb;border-bottom:1px solid #e5e7eb;">
                    <div style="font-size:11px;font-weight:bold;color:#6b7280;text-transform:uppercase;">Requisição</div>
                    <div style="font-size:18px;font-weight:bold;color:#111827;margin-top:4px;">${alertService.escapeHtml(numero)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;line-height:1.7;">
                    <strong>Solicitante:</strong> ${alertService.escapeHtml(requisicao.solicitante_nome)}<br>
                    <strong>Setor:</strong> ${alertService.escapeHtml(setor)}<br>
                    <strong>Urgência:</strong> ${alertService.escapeHtml(urgencia)}<br>
                    <strong>OS/Referência:</strong> ${alertService.escapeHtml(osRef)}${valorComLimite ? `<br>
                    <strong>Valor total:</strong> ${alertService.escapeHtml(valorComLimite)}` : ''}${porRegra ? `<br>
                    <strong>Regra:</strong> ${alertService.escapeHtml(pendencia.regra_nome)}` : ''}
                  </td>
                </tr>
              </table>
              <div style="font-size:12px;font-weight:bold;color:#6b7280;text-transform:uppercase;margin-bottom:8px;">Itens solicitados</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                <tr style="background-color:#f9fafb;">
                  <th align="left" style="padding:8px 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6b7280;text-transform:uppercase;">Material</th>
                  <th align="left" style="padding:8px 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6b7280;text-transform:uppercase;">Código</th>
                  <th align="right" style="padding:8px 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6b7280;text-transform:uppercase;">Qtd</th>
                </tr>
                ${itensHtml || '<tr><td colspan="3" style="padding:12px;color:#6b7280;">Sem itens</td></tr>'}
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 24px 28px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="border-radius:6px;background-color:#2563eb;">
                    <a href="${alertService.escapeHtml(appUrl)}" target="_blank" style="display:inline-block;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">
                      Ver requisições pendentes
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e5e7eb;background-color:#f9fafb;font-family:Arial,Helvetica,sans-serif;text-align:center;font-size:12px;color:#6b7280;">
              Gerado em ${alertService.escapeHtml(geradoEm)} — GMP Industriais — Orion
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { assunto, text, html };
}

async function carregarItens(db, requisicaoId) {
  return dbAll(db, `SELECT ir.*, m.nome as material_nome, m.codigo as material_codigo, m.unidade
    FROM itens_requisicao_almoxarifado ir
    JOIN materiais_almoxarifado m ON ir.material_id = m.id
    WHERE ir.requisicao_id = ?`, [requisicaoId]);
}

async function resolverDestinatarios(db, requisicao, settings) {
  // A plateia é por status: quem LIBERA POR VALOR é lista própria de configuração, e não a
  // lista geral. Somar as duas seria cobrar de quem não pode fazer o gesto pendente.
  if (requisicao.status === STATUS_AGUARDANDO_VALOR) {
    const emails = await requisitionValueApprovalService.getEmailsAprovadores(db);
    return [...new Set(emails.map((e) => String(e).trim().toLowerCase()))].filter(Boolean);
  }

  const destinatarios = new Set(settings.emails.map((e) => e.toLowerCase()));

  if (requisicao.aprovador_id) {
    const aprovador = await dbGet(db,
      'SELECT email FROM usuarios WHERE id = ? AND ativo = 1 AND email IS NOT NULL',
      [requisicao.aprovador_id]);
    if (aprovador?.email) destinatarios.add(String(aprovador.email).trim().toLowerCase());
  }

  return [...destinatarios].filter(Boolean);
}

async function registrarLog(db, requisicaoId, destinatario, status, erro, dias, pendenciaId = null) {
  try {
    await dbRun(db, `INSERT INTO requisicao_lembretes_log
      (requisicao_id, destinatario, status, erro, dias_aguardando, pendencia_regra_id)
      VALUES (?, ?, ?, ?, ?, ?)`,
    [requisicaoId, destinatario, status, erro || null, dias, pendenciaId]);
  } catch (err) {
    console.warn('[almoxarifado-lembretes] Falha ao registrar log:', err.message);
  }
}

async function marcarLembreteEnviado(db, requisicaoId) {
  await dbRun(db,
    'UPDATE requisicoes_almoxarifado SET ultimo_lembrete_enviado = CURRENT_TIMESTAMP WHERE id = ?',
    [requisicaoId]);
}

async function resetLembreteRequisicao(db, requisicaoId) {
  await dbRun(db,
    'UPDATE requisicoes_almoxarifado SET ultimo_lembrete_enviado = NULL WHERE id = ?',
    [requisicaoId]);
}

async function buscarRequisicoesElegiveis(db, intervaloHoras) {
  const horas = Math.max(1, Number(intervaloHoras) || DEFAULT_INTERVAL_HOURS);
  const cutoff = `-${horas} hours`;
  // `data_aprovacao IS NULL` restringe o status de valor à procedência de NASCIMENTO. A de
  // descarrilamento (requisição já aprovada que caiu no status quando a liberação foi ligada
  // depois, por UPDATE fora da máquina de estados) fica de fora: nela "aguardando há N dias"
  // mentiria. O bypass em si é achado próprio (letra C da Etapa 47).
  return dbAll(db, `SELECT * FROM requisicoes_almoxarifado
    WHERE (status = 'PENDENTE'
           OR (status = ? AND data_aprovacao IS NULL))
      AND COALESCE(ativo, 1) = 1
      -- Etapa 47 (T5): com pendencia de regra ABERTA o /aprovar e o /aprovar-valor estao barrados;
      -- cobrar por status seria cobrar de quem nao pode agir. A lane de pendencia cobra.
      AND NOT EXISTS (SELECT 1 FROM requisicao_aprovacoes_regra p
                      WHERE p.requisicao_id = requisicoes_almoxarifado.id AND p.status = 'ABERTA')
      AND datetime(updated_at) <= datetime('now', ?)
      AND (
        ultimo_lembrete_enviado IS NULL
        OR datetime(ultimo_lembrete_enviado) <= datetime('now', ?)
      )
    ORDER BY updated_at ASC`, [STATUS_AGUARDANDO_VALOR, cutoff, cutoff]);
}

async function processarLembreteRequisicao(db, requisicao, settings) {
  const dias = diasAguardando(requisicao.updated_at);
  const itens = await carregarItens(db, requisicao.id);
  const destinatarios = await resolverDestinatarios(db, requisicao, settings);

  if (!destinatarios.length) {
    return {
      requisicao_id: requisicao.id,
      numero: requisicao.numero,
      enviado: false,
      motivo: 'nenhum destinatário configurado',
    };
  }

  const msg = buildMensagemLembrete(requisicao, itens, dias, settings.appUrl, settings);
  const resultado = await alertService.enviarEmail(db, destinatarios, msg.assunto, msg.html, msg.text);
  const hasError = resultado.erros.length > 0 && resultado.enviados === 0;

  for (const destinatario of destinatarios) {
    await registrarLog(db, requisicao.id, destinatario,
      hasError ? 'ERRO' : 'ENVIADO',
      hasError ? resultado.erros.join('; ') : null,
      dias);
  }

  if (!hasError && resultado.enviados > 0) {
    await marcarLembreteEnviado(db, requisicao.id);
  }

  return {
    requisicao_id: requisicao.id,
    numero: requisicao.numero,
    enviado: resultado.enviados > 0,
    destinatarios,
    erros: resultado.erros,
    dias_aguardando: dias,
  };
}

// ── Etapa 47, T5 — o lembrete POR PENDÊNCIA de regra ────────────────────────────────────────
// Outro lembrete, e não uma variante do de status (desenho 7.2): a chave é a PENDÊNCIA, com
// maturação e reincidência próprias. O status da requisição entra só para excluir a já decidida.

async function buscarPendenciasRegraElegiveis(db, intervaloHoras) {
  const horas = Math.max(1, Number(intervaloHoras) || DEFAULT_INTERVAL_HOURS);
  const cutoff = `-${horas} hours`;
  const aguardando = approvalRulesService.STATUS_REQUISICAO_AGUARDANDO;
  return dbAll(db, `SELECT p.*, q.numero, q.solicitante_id, q.solicitante_nome, q.setor, q.departamento,
      q.urgencia, q.os_referencia, q.status AS requisicao_status
    FROM requisicao_aprovacoes_regra p
    JOIN requisicoes_almoxarifado q ON q.id = p.requisicao_id
    WHERE p.status = 'ABERTA'
      AND q.status IN (${aguardando.map(() => '?').join(',')})
      AND COALESCE(q.ativo, 1) = 1
      AND datetime(p.created_at) <= datetime('now', ?)
      AND (p.ultimo_lembrete_enviado IS NULL OR datetime(p.ultimo_lembrete_enviado) <= datetime('now', ?))
    ORDER BY p.created_at ASC, p.id ASC`, [...aguardando, cutoff, cutoff]);
}

/**
 * Plateia de UMA pendência: o snapshot de aprovadores dela, MENOS quem não pode assinar — o
 * solicitante e quem já assinou outra perna da mesma requisição (RN-07). Sem ninguém que possa,
 * cai na lista geral: melhor cobrar alguém que resolva (um admin, desativar a regra) do que
 * ninguém — o silêncio é o defeito que esta linhagem de etapas veio fechar.
 */
async function resolverDestinatariosPendencia(db, pendencia, settings) {
  let ids = [];
  try { ids = JSON.parse(pendencia.aprovadores || '[]').map(Number); } catch (_) { ids = []; }
  const jaAssinaram = new Set((await dbAll(db, `SELECT aprovador_id FROM requisicao_aprovacoes_regra
    WHERE requisicao_id = ? AND status = 'APROVADA' AND aprovador_id IS NOT NULL`,
  [pendencia.requisicao_id])).map((r) => Number(r.aprovador_id)));
  const podem = ids.filter((id) => id !== Number(pendencia.solicitante_id) && !jaAssinaram.has(id));

  let emails = [];
  if (podem.length) {
    const rows = await dbAll(db, `SELECT email FROM usuarios
      WHERE id IN (${podem.map(() => '?').join(',')}) AND COALESCE(ativo, 1) = 1 AND email IS NOT NULL`, podem);
    emails = rows.map((r) => r.email);
  }
  if (!emails.length) emails = settings.emails;
  return [...new Set(emails.map((e) => String(e).trim().toLowerCase()))].filter(Boolean);
}

async function processarLembretePendencia(db, pendencia, settings) {
  const dias = diasAguardando(pendencia.created_at);
  const requisicao = {
    id: pendencia.requisicao_id, numero: pendencia.numero, status: pendencia.requisicao_status,
    solicitante_nome: pendencia.solicitante_nome, setor: pendencia.setor,
    departamento: pendencia.departamento, urgencia: pendencia.urgencia, os_referencia: pendencia.os_referencia,
  };
  const base = {
    pendencia_id: pendencia.id, requisicao_id: pendencia.requisicao_id,
    numero: pendencia.numero, regra_nome: pendencia.regra_nome,
  };
  const itens = await carregarItens(db, pendencia.requisicao_id);
  const destinatarios = await resolverDestinatariosPendencia(db, pendencia, settings);
  if (!destinatarios.length) return { ...base, enviado: false, motivo: 'nenhum destinatário configurado' };

  const msg = buildMensagemLembrete(requisicao, itens, dias, settings.appUrl, settings, pendencia);
  const resultado = await alertService.enviarEmail(db, destinatarios, msg.assunto, msg.html, msg.text);
  const hasError = resultado.erros.length > 0 && resultado.enviados === 0;
  for (const destinatario of destinatarios) {
    await registrarLog(db, pendencia.requisicao_id, destinatario,
      hasError ? 'ERRO' : 'ENVIADO', hasError ? resultado.erros.join('; ') : null, dias, pendencia.id);
  }
  if (!hasError && resultado.enviados > 0) {
    await dbRun(db, 'UPDATE requisicao_aprovacoes_regra SET ultimo_lembrete_enviado = CURRENT_TIMESTAMP WHERE id = ?',
      [pendencia.id]);
  }
  return { ...base, enviado: resultado.enviados > 0, destinatarios, erros: resultado.erros, dias_aguardando: dias };
}

async function processarLembretesRegra(db, settings) {
  const elegiveis = await buscarPendenciasRegraElegiveis(db, settings.intervaloHoras);
  const resultados = [];
  // Mesmo motivo do try/catch da lane de status: uma pendência ruim não mata as outras.
  for (const pendencia of elegiveis) {
    try {
      resultados.push(await processarLembretePendencia(db, pendencia, settings));
    } catch (err) {
      console.warn(`[almoxarifado-lembretes] Falha na pendência ${pendencia.id} (${pendencia.regra_nome}):`, err.message);
      resultados.push({
        pendencia_id: pendencia.id, requisicao_id: pendencia.requisicao_id, numero: pendencia.numero,
        regra_nome: pendencia.regra_nome, enviado: false, erros: [err.message],
      });
    }
  }
  return {
    processados: resultados.length,
    enviados: resultados.filter((r) => r.enviado).length,
    resultados,
  };
}

async function processarLembretesPendentes(db) {
  const settings = await getReminderSettings(db);
  if (!settings.ativo) {
    return {
      ativo: false, processados: 0, enviados: 0, resultados: [],
      lembretes_regra: { processados: 0, enviados: 0, resultados: [] },
    };
  }

  const elegiveis = await buscarRequisicoesElegiveis(db, settings.intervaloHoras);
  const resultados = [];

  // Uma requisição que lança NÃO pode abortar o lote: a busca ordena `updated_at ASC`, então a
  // mais antiga vem primeiro, e sem este try/catch ela mataria o lembrete de todas as posteriores
  // — de hora em hora, em silêncio, porque o job engole o erro no console.warn.
  for (const requisicao of elegiveis) {
    try {
      resultados.push(await processarLembreteRequisicao(db, requisicao, settings));
    } catch (err) {
      console.warn(`[almoxarifado-lembretes] Falha na requisição ${requisicao.numero || requisicao.id}:`, err.message);
      resultados.push({
        requisicao_id: requisicao.id,
        numero: requisicao.numero,
        enviado: false,
        erros: [err.message],
      });
    }
  }

  // A lane de pendência roda no MESMO gesto: o job horário e a rota manual chamam só esta
  // função, então não há segunda fiação para esquecer. Uma falha dela não apaga o resultado
  // da lane de status.
  let lembretesRegra;
  try {
    lembretesRegra = await processarLembretesRegra(db, settings);
  } catch (err) {
    console.warn('[almoxarifado-lembretes] Falha na lane de pendências de regra:', err.message);
    lembretesRegra = { processados: 0, enviados: 0, resultados: [], erro: err.message };
  }

  return {
    ativo: true,
    processados: resultados.length,
    enviados: resultados.filter((r) => r.enviado).length,
    resultados,
    lembretes_regra: lembretesRegra,
  };
}

module.exports = {
  CONFIG_KEYS,
  DEFAULT_INTERVAL_HOURS,
  getReminderSettings,
  getReminderSettingsForApi,
  buscarRequisicoesElegiveis,
  processarLembretesPendentes,
  processarLembreteRequisicao,
  resolverDestinatarios,
  resolverDestinatariosPendencia,
  buscarPendenciasRegraElegiveis,
  processarLembretesRegra,
  resetLembreteRequisicao,
  buildMensagemLembrete,
  diasAguardando,
};
