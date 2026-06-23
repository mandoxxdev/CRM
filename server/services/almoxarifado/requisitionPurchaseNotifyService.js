/**
 * Notificação automática ao setor de Compras quando itens da requisição
 * não estão integralmente em estoque.
 */
const alertService = require('./alertService');
const {
  loadItensComDisponibilidade,
  filterItensSemEstoqueCompleto,
  DISPONIBILIDADE_LABELS,
} = require('./stockAvailabilityService');

const COMPRAS_EMAILS_KEY = 'compras_notificar_emails';

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

async function getComprasNotificationEmails(db) {
  const raw = await alertService.getConfigValue(db, COMPRAS_EMAILS_KEY);
  return parseList(raw);
}

function statusBadgeStyle(disponibilidade) {
  if (disponibilidade === 'em_estoque') return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
  if (disponibilidade === 'parcial') return { bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
  return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
}

function buildComprasMensagem(requisicao, itensPendentes, appBaseUrl) {
  const {
    numero,
    setor,
    departamento,
    solicitante_nome,
    os_referencia,
    observacoes,
  } = requisicao;

  const setorLabel = setor || departamento || '—';
  const projeto = os_referencia || '—';
  const assunto = `Solicitação de compra — Requisição ${numero} — ${setorLabel}`;

  const linhasItens = itensPendentes.map((item, idx) => {
    const un = item.unidade ? ` ${item.unidade}` : '';
    const status = DISPONIBILIDADE_LABELS[item.disponibilidade] || item.disponibilidade;
    return `${idx + 1}. ${item.material_nome || '—'} (${item.material_codigo || '—'}) — Qtd solicitada: ${item.quantidade}${un} — Situação: ${status}`;
  });

  const text = `Solicitação de compra — ORION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Uma requisição de material foi enviada com itens sem estoque suficiente no almoxarifado.
Solicitamos a providência de compra dos materiais listados abaixo.

Requisição: ${numero}
Setor: ${setorLabel}
Projeto / OS / Referência: ${projeto}
Solicitante: ${solicitante_nome || '—'}
${observacoes ? `Observações: ${observacoes}\n` : ''}
Itens para compra:
${linhasItens.join('\n')}

${appBaseUrl ? `Acessar sistema: ${appBaseUrl}\n` : ''}
GMP Industriais — Orion`;

  const itensHtml = itensPendentes.map((item) => {
    const un = item.unidade ? ` ${alertService.escapeHtml(item.unidade)}` : '';
    const statusLabel = DISPONIBILIDADE_LABELS[item.disponibilidade] || item.disponibilidade;
    const style = statusBadgeStyle(item.disponibilidade);
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#374151;">
        ${alertService.escapeHtml(item.material_nome || '—')}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280;">
        ${alertService.escapeHtml(item.material_codigo || '—')}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111827;text-align:right;font-weight:600;">
        ${alertService.escapeHtml(item.quantidade)}${un}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:13px;text-align:center;">
        <span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:${style.bg};color:${style.color};border:1px solid ${style.border};">
          ${alertService.escapeHtml(statusLabel)}
        </span>
      </td>
    </tr>`;
  }).join('');

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
            <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:4px;">Solicitação de compra — itens sem estoque</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;font-family:Arial,Helvetica,sans-serif;">
            <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.5;">
              Uma requisição de material foi registrada com itens <strong>sem estoque suficiente</strong> no almoxarifado.
              Favor providenciar a compra dos materiais abaixo.
            </p>
            <p style="margin:0 0 8px;font-size:13px;color:#374151;"><strong>Requisição:</strong> ${alertService.escapeHtml(numero)}</p>
            <p style="margin:0 0 8px;font-size:13px;color:#374151;"><strong>Setor:</strong> ${alertService.escapeHtml(setorLabel)}</p>
            <p style="margin:0 0 8px;font-size:13px;color:#374151;"><strong>Projeto / OS:</strong> ${alertService.escapeHtml(projeto)}</p>
            <p style="margin:0 0 16px;font-size:13px;color:#374151;"><strong>Solicitante:</strong> ${alertService.escapeHtml(solicitante_nome || '—')}</p>
            ${observacoes ? `<p style="margin:0 0 16px;font-size:13px;color:#374151;"><strong>Observações:</strong> ${alertService.escapeHtml(observacoes)}</p>` : ''}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-top:8px;">
              <tr style="background-color:#f9fafb;">
                <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">Material</th>
                <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">Código</th>
                <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">Qtd solicitada</th>
                <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;">Situação</th>
              </tr>
              ${itensHtml}
            </table>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { assunto, text, html };
}

/**
 * Envia e-mail aos compradores quando há itens parcialmente ou totalmente sem estoque.
 * CC: solicitante (e-mail do usuário logado).
 */
async function notifyComprasItensSemEstoque(db, requisicao, itensRequisicao, solicitanteEmail) {
  const emails = await getComprasNotificationEmails(db);
  if (!emails.length) {
    console.warn('[requisicoes-compras] Nenhum e-mail do setor de Compras configurado.');
    return { enviados: 0, erros: [], skipped: true, motivo: 'sem_destinatarios' };
  }

  const itensComStatus = await loadItensComDisponibilidade(db, itensRequisicao);
  const itensPendentes = filterItensSemEstoqueCompleto(itensComStatus);

  if (!itensPendentes.length) {
    return { enviados: 0, erros: [], skipped: true, motivo: 'todos_em_estoque' };
  }

  const settings = await alertService.getAlertSettings(db);
  const msg = buildComprasMensagem(requisicao, itensPendentes, settings.appUrl);

  const cc = solicitanteEmail ? [String(solicitanteEmail).trim()].filter(Boolean) : [];
  const resultado = await alertService.enviarEmail(db, emails, msg.assunto, msg.html, msg.text, { cc });

  if (resultado.erros.length) {
    console.warn('[requisicoes-compras] Erro ao enviar solicitação de compra:', resultado.erros.join('; '));
  }
  return { ...resultado, itensNotificados: itensPendentes.length };
}

module.exports = {
  COMPRAS_EMAILS_KEY,
  getComprasNotificationEmails,
  buildComprasMensagem,
  notifyComprasItensSemEstoque,
};
