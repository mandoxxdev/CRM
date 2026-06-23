/**
 * Notificação por e-mail de novas requisições de material
 */
const { dbAll } = require('./db');
const alertService = require('./alertService');

const REQUISICOES_EMAILS_KEY = 'requisicoes_notificar_emails';
const REQUISICOES_NOTIFICAR_KEY = 'requisicoes_notificar_email';

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

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value) === '1' || String(value).toLowerCase() === 'true';
}

async function getRequisicaoNotificationEmails(db) {
  const specific = parseList(await alertService.getConfigValue(db, REQUISICOES_EMAILS_KEY));
  if (specific.length) return specific;
  const settings = await alertService.getAlertSettings(db);
  return settings.emails;
}

async function isRequisicaoNotificationEnabled(db) {
  const flag = await alertService.getConfigValue(db, REQUISICOES_NOTIFICAR_KEY);
  if (flag !== undefined && flag !== null && flag !== '') {
    return parseBool(flag, true);
  }
  const settings = await alertService.getAlertSettings(db);
  return settings.notificarEmail;
}

function buildRequisicaoMensagem(requisicao, itens, appBaseUrl) {
  const { numero, setor, solicitante_nome, observacoes } = requisicao;
  const assunto = `Nova requisição de material — ${setor || 'Setor'} — ${solicitante_nome || 'Solicitante'} — ${numero}`;

  const linhasItens = (itens || []).map((item, idx) => {
    const un = item.unidade ? ` ${item.unidade}` : '';
    return `${idx + 1}. ${item.nome || item.material_nome} (${item.codigo || item.material_codigo || '—'}) — ${item.quantidade_solicitada || item.quantidade}${un}`;
  });

  const text = `Nova requisição de material — ORION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Número: ${numero}
Setor: ${setor || '—'}
Solicitante: ${solicitante_nome || '—'}
${observacoes ? `Observações: ${observacoes}\n` : ''}
Itens:
${linhasItens.join('\n')}

${appBaseUrl ? `Acessar Almoxarifado: ${appBaseUrl}/almoxarifado\n` : ''}
GMP Industriais — Orion`;

  const itensHtml = (itens || []).map((item) => {
    const un = item.unidade ? ` ${alertService.escapeHtml(item.unidade)}` : '';
    const qty = item.quantidade_solicitada || item.quantidade;
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#374151;">
        ${alertService.escapeHtml(item.nome || item.material_nome || '—')}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280;">
        ${alertService.escapeHtml(item.codigo || item.material_codigo || '—')}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111827;text-align:right;font-weight:600;">
        ${alertService.escapeHtml(qty)}${un}
      </td>
    </tr>`;
  }).join('');

  const appUrl = appBaseUrl ? `${String(appBaseUrl).replace(/\/$/, '')}/almoxarifado` : null;

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
            <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:4px;">Nova requisição de material</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;font-family:Arial,Helvetica,sans-serif;">
            <p style="margin:0 0 16px;font-size:15px;color:#111827;"><strong>${alertService.escapeHtml(numero)}</strong></p>
            <p style="margin:0 0 8px;font-size:13px;color:#374151;"><strong>Setor:</strong> ${alertService.escapeHtml(setor || '—')}</p>
            <p style="margin:0 0 16px;font-size:13px;color:#374151;"><strong>Solicitante:</strong> ${alertService.escapeHtml(solicitante_nome || '—')}</p>
            ${observacoes ? `<p style="margin:0 0 16px;font-size:13px;color:#374151;"><strong>Observações:</strong> ${alertService.escapeHtml(observacoes)}</p>` : ''}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-top:8px;">
              <tr style="background-color:#f9fafb;">
                <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">Material</th>
                <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">Código</th>
                <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">Qtd</th>
              </tr>
              ${itensHtml}
            </table>
            ${appUrl ? `<p style="margin:20px 0 0;text-align:center;"><a href="${alertService.escapeHtml(appUrl)}" style="display:inline-block;padding:12px 28px;background-color:#ff6b00;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px;">Acessar Almoxarifado</a></p>` : ''}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { assunto, text, html };
}

async function loadItensRequisicao(db, requisicaoId) {
  return dbAll(db,
    `SELECT ir.quantidade_solicitada, ma.nome as material_nome, ma.codigo as material_codigo, ma.unidade
     FROM itens_requisicao_almoxarifado ir
     JOIN materiais_almoxarifado ma ON ir.material_id = ma.id
     WHERE ir.requisicao_id = ?`,
    [requisicaoId]);
}

async function notificarNovaRequisicao(db, requisicao, itensPreCarregados = null) {
  const enabled = await isRequisicaoNotificationEnabled(db);
  if (!enabled) return { enviados: 0, erros: [], skipped: true };

  const emails = await getRequisicaoNotificationEmails(db);
  if (!emails.length) {
    console.warn('[requisicoes] Nenhum e-mail configurado para notificação de requisições.');
    return { enviados: 0, erros: ['Nenhum destinatário configurado'], skipped: true };
  }

  const itens = itensPreCarregados || await loadItensRequisicao(db, requisicao.id);
  const settings = await alertService.getAlertSettings(db);
  const msg = buildRequisicaoMensagem(requisicao, itens, settings.appUrl);

  const resultado = await alertService.enviarEmail(db, emails, msg.assunto, msg.html, msg.text);
  if (resultado.erros.length) {
    console.warn('[requisicoes] Erro ao enviar notificação:', resultado.erros.join('; '));
  }
  return resultado;
}

module.exports = {
  REQUISICOES_EMAILS_KEY,
  REQUISICOES_NOTIFICAR_KEY,
  getRequisicaoNotificationEmails,
  isRequisicaoNotificationEnabled,
  notificarNovaRequisicao,
};
