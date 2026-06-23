/**
 * Lembretes diários por e-mail para requisições PENDENTE sem resposta do aprovador.
 */
const { dbGet, dbAll, dbRun } = require('./db');
const alertService = require('./alertService');
const requisitionNotificationService = require('./requisitionNotificationService');

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

  return {
    ativo: parseBool(ativo, true),
    intervaloHoras: Number(intervaloHoras) > 0 ? Number(intervaloHoras) : DEFAULT_INTERVAL_HOURS,
    emails,
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

function diasAguardando(updatedAt) {
  const ts = new Date(updatedAt).getTime();
  if (Number.isNaN(ts)) return 1;
  const diffMs = Date.now() - ts;
  return Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

function getRequisicoesUrl(appBaseUrl) {
  const base = alertService.resolveAppBaseUrl(appBaseUrl);
  return `${base}/almoxarifado/requisicoes`;
}

function buildMensagemLembrete(requisicao, itens, dias, appBaseUrl) {
  const numero = requisicao.numero || `REQ-${requisicao.id}`;
  const assunto = `Lembrete: Requisição ${numero} aguardando aprovação há ${dias} dia${dias === 1 ? '' : 's'}`;
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

  const text = `LEMBRETE — REQUISIÇÃO AGUARDANDO APROVAÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Requisição: ${numero}
Aguardando há: ${dias} dia(s)
Solicitante: ${requisicao.solicitante_nome}
Setor: ${setor}
Urgência: ${urgencia}
OS/Referência: ${osRef}

Itens:
${itensTexto || '—'}

Acesse o sistema para aprovar ou rejeitar:
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
              <div style="font-size:15px;font-weight:bold;color:#1d4ed8;">📋 Requisição aguardando aprovação há ${dias} dia${dias === 1 ? '' : 's'}</div>
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
                    <strong>OS/Referência:</strong> ${alertService.escapeHtml(osRef)}
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
  const destinatarios = new Set(settings.emails.map((e) => e.toLowerCase()));

  if (requisicao.aprovador_id) {
    const aprovador = await dbGet(db,
      'SELECT email FROM usuarios WHERE id = ? AND ativo = 1 AND email IS NOT NULL',
      [requisicao.aprovador_id]);
    if (aprovador?.email) destinatarios.add(String(aprovador.email).trim().toLowerCase());
  }

  return [...destinatarios].filter(Boolean);
}

async function registrarLog(db, requisicaoId, destinatario, status, erro, dias) {
  try {
    await dbRun(db, `INSERT INTO requisicao_lembretes_log
      (requisicao_id, destinatario, status, erro, dias_aguardando)
      VALUES (?, ?, ?, ?, ?)`,
    [requisicaoId, destinatario, status, erro || null, dias]);
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
  return dbAll(db, `SELECT * FROM requisicoes_almoxarifado
    WHERE status = 'PENDENTE'
      AND COALESCE(ativo, 1) = 1
      AND datetime(updated_at) <= datetime('now', ?)
      AND (
        ultimo_lembrete_enviado IS NULL
        OR datetime(ultimo_lembrete_enviado) <= datetime('now', ?)
      )
    ORDER BY updated_at ASC`, [cutoff, cutoff]);
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

  const msg = buildMensagemLembrete(requisicao, itens, dias, settings.appUrl);
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

async function processarLembretesPendentes(db) {
  const settings = await getReminderSettings(db);
  if (!settings.ativo) {
    return { ativo: false, processados: 0, enviados: 0, resultados: [] };
  }

  const elegiveis = await buscarRequisicoesElegiveis(db, settings.intervaloHoras);
  const resultados = [];

  for (const requisicao of elegiveis) {
    resultados.push(await processarLembreteRequisicao(db, requisicao, settings));
  }

  return {
    ativo: true,
    processados: resultados.length,
    enviados: resultados.filter((r) => r.enviado).length,
    resultados,
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
  resetLembreteRequisicao,
  buildMensagemLembrete,
  diasAguardando,
};
