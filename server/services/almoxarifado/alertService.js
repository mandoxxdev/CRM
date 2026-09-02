const nodemailer = require('nodemailer');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { dbGet, dbAll, dbRun } = require('./db');

const DEFAULT_INTERVAL_HOURS = 4;
/** Debounce curto (segundos) só para evitar duplo disparo na mesma movimentação; 0 = desligado */
const DEFAULT_DEBOUNCE_SECONDS = 60;
const DEFAULT_APP_URL = 'https://systemgmp.online';
const ESTADO_ACIMA = 'ACIMA';
const ESTADO_ABAIXO = 'ABAIXO';
// Etapa 12, Task 3 (RN-07): maquina de estado IRMA da ACIMA/ABAIXO, coluna propria
// (`estado_zerado`) — ver a nota de `avaliarZerado` abaixo.
const ESTADO_COM_SALDO = 'COM_SALDO';
const ESTADO_ZERADO = 'ZERADO';
const PASSWORD_MASK = '********';

const SMTP_CONFIG_KEYS = {
  host: 'alertas_smtp_host',
  port: 'alertas_smtp_port',
  user: 'alertas_smtp_user',
  pass: 'alertas_smtp_pass',
  from: 'alertas_smtp_from',
  secure: 'alertas_smtp_secure',
};

const WHATSAPP_CONFIG_KEYS = {
  webhookUrl: 'alertas_whatsapp_webhook_url',
  apiKey: 'alertas_whatsapp_api_key',
};

const APP_URL_CONFIG_KEY = 'alertas_app_url';

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value) === '1' || String(value).toLowerCase() === 'true';
}

function parseList(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(v => String(v).trim()).filter(Boolean);
  } catch (_) {
    return String(value).split(',').map(v => v.trim()).filter(Boolean);
  }
  return [];
}

async function getConfigValue(db, chave) {
  const row = await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [chave]);
  return row?.valor;
}

function normalizeBaseUrl(url) {
  if (url === undefined || url === null) return null;
  let base = String(url).trim();
  if (!base) return null;
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return base.replace(/\/$/, '');
}

function resolveAppBaseUrl(dbValue) {
  const fromDb = normalizeBaseUrl(dbValue);
  if (fromDb) return fromDb;
  const fromEnv = normalizeBaseUrl(
    process.env.APP_URL || process.env.CLIENT_URL || process.env.BASE_URL || '',
  );
  if (fromEnv) return fromEnv;
  return DEFAULT_APP_URL;
}

async function getAlertSettings(db) {
  const [emails, whatsapps, notificarEmail, notificarWhatsapp, intervaloHoras, debounceSegundos, appUrlDb] = await Promise.all([
    getConfigValue(db, 'alertas_estoque_emails'),
    getConfigValue(db, 'alertas_estoque_whatsapp_numeros'),
    getConfigValue(db, 'alertas_estoque_notificar_email'),
    getConfigValue(db, 'alertas_estoque_notificar_whatsapp'),
    getConfigValue(db, 'alertas_estoque_intervalo_verificacao_horas'),
    getConfigValue(db, 'alertas_estoque_debounce_segundos'),
    getConfigValue(db, APP_URL_CONFIG_KEY),
  ]);

  const debounceParsed = debounceSegundos !== undefined && debounceSegundos !== null && debounceSegundos !== ''
    ? Number(debounceSegundos)
    : DEFAULT_DEBOUNCE_SECONDS;

  return {
    emails: parseList(emails),
    whatsappNumeros: parseList(whatsapps),
    notificarEmail: parseBool(notificarEmail, true),
    notificarWhatsapp: parseBool(notificarWhatsapp, false),
    intervaloVerificacaoHoras: Number(intervaloHoras) > 0 ? Number(intervaloHoras) : DEFAULT_INTERVAL_HOURS,
    debounceSegundos: Number.isFinite(debounceParsed) && debounceParsed >= 0 ? debounceParsed : DEFAULT_DEBOUNCE_SECONDS,
    appUrl: resolveAppBaseUrl(appUrlDb),
  };
}

async function getSmtpConfig(db) {
  const [host, port, user, pass, from, secure] = await Promise.all([
    getConfigValue(db, SMTP_CONFIG_KEYS.host),
    getConfigValue(db, SMTP_CONFIG_KEYS.port),
    getConfigValue(db, SMTP_CONFIG_KEYS.user),
    getConfigValue(db, SMTP_CONFIG_KEYS.pass),
    getConfigValue(db, SMTP_CONFIG_KEYS.from),
    getConfigValue(db, SMTP_CONFIG_KEYS.secure),
  ]);

  const resolvedPort = Number(port || process.env.SMTP_PORT || 587);
  const resolvedSecure = secure !== undefined && secure !== null && secure !== ''
    ? parseBool(secure, false)
    : resolvedPort === 465;

  return {
    host: host || process.env.SMTP_HOST,
    port: resolvedPort,
    user: user || process.env.SMTP_USER,
    pass: pass || process.env.SMTP_PASS,
    from: from || process.env.SMTP_FROM || process.env.SMTP_USER,
    secure: resolvedSecure,
  };
}

async function getWhatsappConfig(db) {
  const [webhookUrl, apiKey] = await Promise.all([
    getConfigValue(db, WHATSAPP_CONFIG_KEYS.webhookUrl),
    getConfigValue(db, WHATSAPP_CONFIG_KEYS.apiKey),
  ]);

  return {
    webhookUrl: webhookUrl || process.env.WHATSAPP_WEBHOOK_URL,
    apiKey: apiKey || process.env.WHATSAPP_API_KEY || process.env.WHATSAPP_WEBHOOK_TOKEN,
  };
}

async function getAlertSettingsForApi(db) {
  const [settings, smtp, whatsapp, requisicoesEmails, requisicoesNotificar, comprasEmails] = await Promise.all([
    getAlertSettings(db),
    getSmtpConfig(db),
    getWhatsappConfig(db),
    getConfigValue(db, 'requisicoes_notificar_emails'),
    getConfigValue(db, 'requisicoes_notificar_email'),
    getConfigValue(db, 'compras_notificar_emails'),
  ]);

  const smtpPassDb = await getConfigValue(db, SMTP_CONFIG_KEYS.pass);
  const whatsappApiKeyDb = await getConfigValue(db, WHATSAPP_CONFIG_KEYS.apiKey);

  return {
    ...settings,
    requisicoesEmails: parseList(requisicoesEmails),
    requisicoesNotificarEmail: requisicoesNotificar === undefined || requisicoesNotificar === null || requisicoesNotificar === ''
      ? null
      : parseBool(requisicoesNotificar, true),
    comprasEmails: parseList(comprasEmails),
    smtpHost: smtp.host || '',
    smtpPort: smtp.port,
    smtpUser: smtp.user || '',
    smtpFrom: smtp.from || '',
    smtpSecure: smtp.secure,
    smtpPass: smtpPassDb ? PASSWORD_MASK : '',
    whatsappWebhookUrl: whatsapp.webhookUrl || '',
    whatsappApiKey: whatsappApiKeyDb ? PASSWORD_MASK : '',
  };
}

function shouldUpdateSecret(value) {
  if (value === undefined || value === null) return false;
  const trimmed = String(value).trim();
  return trimmed !== '' && trimmed !== PASSWORD_MASK;
}

function isMaterialCritico(material) {
  return material
    && Number(material.quantidade_minima) > 0
    && Number(material.quantidade_atual) <= Number(material.quantidade_minima);
}

function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTimePtBr(date = new Date()) {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getAppAlmoxarifadoUrl(appBaseUrl) {
  const base = resolveAppBaseUrl(appBaseUrl);
  return `${base}/almoxarifado`;
}

function buildMensagem(material, isTeste = false, appBaseUrl = null) {
  const prefix = isTeste ? '[TESTE] ' : '';
  const assunto = `${prefix}Alerta de estoque mínimo - ${material.nome}`;
  const geradoEm = formatDateTimePtBr();
  const unidade = material.unidade ? ` ${material.unidade}` : '';
  const localizacao = material.localizacao || 'Não informada';
  const saldoAtual = Number(material.quantidade_atual);
  const estoqueMinimo = Number(material.quantidade_minima);
  const abaixoMinimo = saldoAtual <= estoqueMinimo;
  const appUrl = getAppAlmoxarifadoUrl(appBaseUrl);

  const text = `${prefix}⚠ ALERTA DE ESTOQUE MÍNIMO — ORION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Material: ${material.nome}
Código: ${material.codigo}
Saldo atual: ${material.quantidade_atual}${unidade}${abaixoMinimo ? ' (ABAIXO DO MÍNIMO)' : ''}
Estoque mínimo: ${material.quantidade_minima}${unidade}
Localização: ${localizacao}

${appUrl ? `Acessar Almoxarifado: ${appUrl}\n\n` : ''}Gerado em ${geradoEm}
GMP Industriais — Orion`;

  const testeBadgeHtml = isTeste
    ? `<tr>
        <td style="padding:10px 24px;background-color:#fef3c7;border-bottom:1px solid #fcd34d;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;color:#92400e;text-align:center;">
          MODO TESTE — este alerta não indica uma condição real de estoque
        </td>
      </tr>`
    : '';

  const ctaHtml = appUrl
    ? `<tr>
        <td align="center" style="padding:0 24px 28px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" style="border-radius:6px;background-color:#ff6b00;">
                <a href="${escapeHtml(appUrl)}" target="_blank" style="display:inline-block;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">
                  Acessar Almoxarifado
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : '';

  const saldoColor = abaixoMinimo ? '#dc2626' : '#111827';
  const saldoBg = abaixoMinimo ? '#fef2f2' : '#ffffff';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(assunto)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">

          <!-- Header -->
          <tr>
            <td style="padding:20px 24px;background-color:#0a1929;background-image:linear-gradient(135deg,#0a1929 0%,#1a365d 100%);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;">
                    <div style="font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:2px;line-height:1.2;">ORION</div>
                    <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:4px;">Sistema de Gestão Industrial</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px;">GMP Industriais</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${testeBadgeHtml}

          <!-- Alert banner -->
          <tr>
            <td style="padding:14px 24px;background-color:#fff7ed;border-bottom:3px solid #ea580c;font-family:Arial,Helvetica,sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:15px;font-weight:bold;color:#c2410c;line-height:1.4;">
                    ⚠️ Estoque abaixo do mínimo
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card body -->
          <tr>
            <td style="padding:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                <tr>
                  <td colspan="2" style="padding:14px 16px;background-color:#f9fafb;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;">
                    <div style="font-size:11px;font-weight:bold;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Material</div>
                    <div style="font-size:16px;font-weight:bold;color:#111827;line-height:1.3;">${escapeHtml(material.nome)}</div>
                    <div style="font-size:13px;color:#6b7280;margin-top:4px;">Código: <span style="font-family:Consolas,Monaco,monospace;color:#374151;">${escapeHtml(material.codigo)}</span></div>
                  </td>
                </tr>
                <tr>
                  <td width="50%" style="padding:14px 16px;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;background-color:${saldoBg};font-family:Arial,Helvetica,sans-serif;vertical-align:top;">
                    <div style="font-size:11px;font-weight:bold;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Saldo atual</div>
                    <div style="font-size:20px;font-weight:bold;color:${saldoColor};line-height:1.2;">${escapeHtml(material.quantidade_atual)}${escapeHtml(unidade)}</div>
                    ${abaixoMinimo ? '<div style="font-size:11px;font-weight:bold;color:#dc2626;margin-top:4px;">Abaixo do mínimo</div>' : ''}
                  </td>
                  <td width="50%" style="padding:14px 16px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;vertical-align:top;">
                    <div style="font-size:11px;font-weight:bold;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Estoque mínimo</div>
                    <div style="font-size:20px;font-weight:bold;color:#111827;line-height:1.2;">${escapeHtml(material.quantidade_minima)}${escapeHtml(unidade)}</div>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif;">
                    <div style="font-size:11px;font-weight:bold;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Localização</div>
                    <div style="font-size:14px;color:#374151;line-height:1.4;">${escapeHtml(localizacao)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${ctaHtml}

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px 24px 24px;border-top:1px solid #e5e7eb;background-color:#f9fafb;font-family:Arial,Helvetica,sans-serif;text-align:center;">
              <div style="font-size:12px;color:#6b7280;line-height:1.6;">
                Gerado em ${escapeHtml(geradoEm)}
              </div>
              <div style="font-size:12px;color:#9ca3af;margin-top:4px;">
                GMP Industriais — Orion
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const whatsapp = `${prefix}⚠️ *ALERTA DE ESTOQUE MÍNIMO*
━━━━━━━━━━━━━━━━━━
📦 *${material.nome}*
🔖 Código: ${material.codigo}

📉 Saldo atual: *${material.quantidade_atual}${unidade}*
📊 Estoque mínimo: ${material.quantidade_minima}${unidade}
📍 Localização: ${localizacao}

${appUrl ? `🔗 ${appUrl}\n\n` : ''}_GMP Industriais — Orion_
_${geradoEm}_`;

  return { assunto, text, html, whatsapp };
}

function postJson(urlString, payload, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    const body = JSON.stringify(payload);
    const lib = parsed.protocol === 'https:' ? https : http;
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      ...extraHeaders,
    };
    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: `${parsed.pathname}${parsed.search || ''}`,
      method: 'POST',
      headers,
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(data);
        return reject(new Error(`Webhook WhatsApp retornou status ${res.statusCode}`));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Timeout ao chamar webhook WhatsApp')));
    req.write(body);
    req.end();
  });
}

async function registrarHistorico(db, materialId, canal, destinatario, status, erro = null, teste = false) {
  const resolvedMaterialId = teste || !materialId ? null : materialId;
  try {
    await dbRun(db, `INSERT INTO alertas_estoque_historico_almoxarifado
      (material_id, canal, destinatario, status, erro, teste)
      VALUES (?, ?, ?, ?, ?, ?)`, [
      resolvedMaterialId,
      canal,
      destinatario,
      status,
      erro || null,
      teste ? 1 : 0,
    ]);
  } catch (err) {
    console.warn('[almoxarifado-alertas] Falha ao registrar histórico de alerta:', err.message);
  }
}

async function enviarEmail(db, destinatarios, assunto, html, text, options = {}) {
  if (!destinatarios.length) return { enviados: 0, erros: [] };
  const smtp = await getSmtpConfig(db);
  if (!smtp.host || !smtp.from) {
    console.warn('[almoxarifado-alertas] SMTP não configurado. Configure em Almoxarifado → Configurações → Alertas de Estoque.');
    return { enviados: 0, erros: ['SMTP não configurado'] };
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });

  const ccList = Array.isArray(options.cc)
    ? options.cc.map((v) => String(v).trim()).filter(Boolean)
    : [];

  try {
    const mailOptions = {
      from: smtp.from,
      to: destinatarios.join(','),
      subject: assunto,
      html,
      text,
    };
    if (ccList.length) mailOptions.cc = ccList.join(',');
    await transporter.sendMail(mailOptions);
    return { enviados: destinatarios.length, erros: [] };
  } catch (err) {
    return { enviados: 0, erros: [err.message] };
  }
}

async function enviarWhatsapp(db, destinatarios, mensagem, metadata) {
  if (!destinatarios.length) return { enviados: 0, erros: [] };
  const { webhookUrl, apiKey } = await getWhatsappConfig(db);
  if (!webhookUrl) {
    console.warn('[almoxarifado-alertas] Webhook WhatsApp não configurado. Configure em Almoxarifado → Configurações → Alertas de Estoque.');
    return { enviados: 0, erros: ['Webhook WhatsApp não configurado'] };
  }

  const headers = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers['X-API-Key'] = apiKey;
  }

  const erros = [];
  let enviados = 0;
  for (const to of destinatarios) {
    try {
      await postJson(webhookUrl, { to, message: mensagem, source: 'almoxarifado', ...metadata }, headers);
      enviados += 1;
    } catch (err) {
      erros.push(`${to}: ${err.message}`);
    }
  }
  return { enviados, erros };
}

/**
 * Avalia se o material cruzou a borda do estoque mínimo (de acima para no/abaixo).
 * Reposição acima do mínimo reseta o estado para permitir novo alerta na próxima queda.
 */
async function avaliarCruzamentoMinimo(db, material) {
  const qtd = Number(material.quantidade_atual);
  const min = Number(material.quantidade_minima);

  if (min <= 0) {
    return { deveAlertar: false, motivo: 'sem estoque mínimo configurado' };
  }

  const acimaMinimo = qtd > min;
  const row = await dbGet(db,
    'SELECT estado_estoque FROM alertas_estoque_material_almoxarifado WHERE material_id = ?',
    [material.id]);
  const estadoAnterior = row?.estado_estoque || ESTADO_ACIMA;

  if (acimaMinimo) {
    if (estadoAnterior !== ESTADO_ACIMA) {
      await dbRun(db, `INSERT INTO alertas_estoque_material_almoxarifado (material_id, estado_estoque)
        VALUES (?, ?)
        ON CONFLICT(material_id) DO UPDATE SET estado_estoque = ?`,
      [material.id, ESTADO_ACIMA, ESTADO_ACIMA]);
    }
    return { deveAlertar: false, motivo: 'estoque acima do mínimo' };
  }

  if (estadoAnterior === ESTADO_ABAIXO) {
    return { deveAlertar: false, motivo: 'já alertado neste período abaixo do mínimo' };
  }

  return { deveAlertar: true, motivo: null };
}

/** Debounce curto contra duplo envio na mesma operação (não limita alertas ao longo do dia). */
async function shouldSkipByDebounce(db, materialId, debounceSeconds, forceSend = false) {
  if (forceSend || debounceSeconds <= 0) return false;
  const row = await dbGet(db,
    'SELECT ultimo_alerta_enviado FROM alertas_estoque_material_almoxarifado WHERE material_id = ?',
    [materialId]);
  if (!row?.ultimo_alerta_enviado) return false;
  const ultimo = new Date(row.ultimo_alerta_enviado).getTime();
  if (Number.isNaN(ultimo)) return false;
  const diffSeconds = (Date.now() - ultimo) / 1000;
  return diffSeconds < debounceSeconds;
}

async function marcarAlertaEnviado(db, materialId) {
  await dbRun(db, `INSERT INTO alertas_estoque_material_almoxarifado (material_id, estado_estoque, ultimo_alerta_enviado)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(material_id) DO UPDATE SET
      estado_estoque = ?,
      ultimo_alerta_enviado = CURRENT_TIMESTAMP`,
  [materialId, ESTADO_ABAIXO, ESTADO_ABAIXO]);
}

/**
 * RN-07 (Etapa 12, Task 3) — estoque ZERADO: função SEPARADA de `avaliarCruzamentoMinimo`, de
 * propósito. Emendas da Fase 2, medidas: (1) a coluna `estado_estoque` é ÚNICA — um terceiro
 * valor além de ACIMA/ABAIXO quebraria o alerta de mínimo nos dois sentidos; (2) a guarda
 * `min <= 0` de `avaliarCruzamentoMinimo` retornaria cedo justamente nos materiais SEM mínimo
 * configurado, onde o zerado mais vale (nada os cobre hoje); (3) a régua é
 * `quantidade_atual <= 0`, NUNCA "disponível" — 100% reservado ainda está na prateleira, não
 * zerado. Cliente sempre fora (quem chama já filtra `proprietario_cliente_id IS NULL`, mesmo
 * padrão de `avaliarCruzamentoMinimo`). Só alerta na transição COM_SALDO -> ZERADO; enquanto
 * ZERADO, no-op; repor (quantidade volta a ser > 0) rearma o estado para a próxima queda.
 *
 * Revisão da Task 3 (C1): a transição de estado É o claim contra corrida — um UPDATE atômico
 * condicionado a `estado_zerado = 'COM_SALDO'`, e só quem viu `changes === 1` alerta. A versão
 * anterior lia o estado (dbGet, cede o event loop) e marcava DEPOIS de enfileirar, com dedupe
 * por `Date.now()` (nonce que nunca colide): duas chamadas concorrentes — reais, o
 * PUT /configuracoes/estoques-minimos faz Promise.all pelos ids do payload — enfileiravam dois
 * e-mails idênticos. Mesma classe do Critical da Task 1, do outro lado da fila. O claim
 * carimba `ultimo_alerta_zerado` e um anti-flap fixo de 60s (material oscilando 0↔1 por
 * movimentações em rajada não spamma; o debounce configurável do mínimo governa só o canal do
 * mínimo). Custo aceito: o estado marca ANTES do enfileirar — se o enfileirar falhar, o
 * episódio não re-alerta até rearmar; a alternativa (marcar depois) é o que duplicava.
 *
 * Revisão da Task 3 (I2, semeadura): material visto pela PRIMEIRA vez já zerado (linha de
 * estado inexistente) é SEMEADO como ZERADO sem alertar — a máquina alerta transições que
 * OBSERVOU, não estados pré-existentes. Sem isso, a primeira gravação em lote da tela de
 * estoques-mínimos em produção despejava um aviso por material zerado do catálogo.
 */
async function avaliarZerado(db, material, opcoes = {}) {
  const qtd = Number(material.quantidade_atual);

  if (qtd > 0) {
    // Semeia COM_SALDO se a linha ainda nao existe (a maquina precisa CONHECER o material com
    // saldo para que o zeramento futuro seja uma transicao observada, nao "primeiro contato");
    // se existe, rearma quando estava ZERADO.
    await dbRun(db, `INSERT OR IGNORE INTO alertas_estoque_material_almoxarifado
      (material_id, estado_zerado) VALUES (?, ?)`, [material.id, ESTADO_COM_SALDO]);
    const rearme = await dbRun(db, `UPDATE alertas_estoque_material_almoxarifado
      SET estado_zerado = ? WHERE material_id = ? AND estado_zerado = ?`,
    [ESTADO_COM_SALDO, material.id, ESTADO_ZERADO]);
    return { deveAlertar: false, motivo: rearme.changes > 0 ? 'com saldo (rearmado)' : 'com saldo' };
  }

  // Linha de estado ainda não existe. Revisão final (lente A, Critical 1): a heurística "a
  // linha existe?" ESTAVA ERRADA como régua de transição — material sem mínimo (a população-
  // alvo do zerado) nunca ganha linha por outro caminho, então a PRIMEIRA zeragem observada
  // caía no ramo "primeiro contato" e era engolida (medido: transição 10->0 real, zero
  // alertas; atinge toda a coorte do deploy e todo material criado com saldo inicial, cujo
  // POST não passa pelo hook). O fato que decide é `saldo_anterior` do próprio motor: se ele
  // era > 0, a zeragem FOI observada agora e alerta; sem essa evidência, semeia em silêncio.
  const semente = await dbRun(db, `INSERT OR IGNORE INTO alertas_estoque_material_almoxarifado
    (material_id, estado_zerado) VALUES (?, ?)`, [material.id, ESTADO_ZERADO]);
  if (semente.changes === 1) {
    if (Number(opcoes.saldo_anterior) > 0) {
      await dbRun(db, `UPDATE alertas_estoque_material_almoxarifado
        SET ultimo_alerta_zerado = CURRENT_TIMESTAMP WHERE material_id = ?`, [material.id]);
      return { deveAlertar: true, motivo: null };
    }
    return { deveAlertar: false, motivo: 'primeiro contato já zerado — estado semeado sem alerta' };
  }

  // Claim atômico: só UM chamador concorrente vê changes === 1 (C1). O anti-flap de 60s lê
  // `ultimo_alerta_zerado` (que sem isto seria write-only — M4 da revisão).
  const claim = await dbRun(db, `UPDATE alertas_estoque_material_almoxarifado
    SET estado_zerado = ?, ultimo_alerta_zerado = CURRENT_TIMESTAMP
    WHERE material_id = ? AND estado_zerado = ?
      AND (ultimo_alerta_zerado IS NULL OR ultimo_alerta_zerado <= datetime('now', '-60 seconds'))`,
  [ESTADO_ZERADO, material.id, ESTADO_COM_SALDO]);
  if (claim.changes === 0) {
    return { deveAlertar: false, motivo: 'já alertado neste período zerado (ou anti-flap de 60s)' };
  }

  return { deveAlertar: true, motivo: null };
}

/**
 * Revisão da Task 3 (I1): `alertas_estoque_notificar_email` é o checkbox "Notificar por
 * e-mail" da tela de Alertas de Estoque, e a lista `alertas_estoque_emails` fica logo abaixo
 * dele. DECISÃO: o toggle governa TODO aviso destinado a essa lista (zerado, lote vencendo,
 * remessa vencida, lembrete de ferramenta, devolução parcial) — quem desligou "notificar por
 * e-mail" não volta a receber e-mail nos mesmos endereços por um canal novo. Solicitações de
 * compra ficam FORA (canal próprio: notificacoes_dest_compras/compras_notificar_emails).
 * Default ligado (mesmo parseBool/fallback da máquina do mínimo).
 */
async function alertasEmailLigado(db) {
  return parseBool(await getConfigValue(db, 'alertas_estoque_notificar_email'), true);
}

/**
 * RN-07: monta o aviso de zerado e ENFILEIRA (nunca envia direto — RN-01). Destino
 * `alertas_estoque_emails` (mesma chave da máquina do mínimo). Require LAZY do queue service:
 * mesmo motivo/padrão documentado em `notificationQueueService.processarFila` — o queue service
 * já requer este arquivo lazy (para `enviarEmail`); um require de topo aqui fecharia o ciclo na
 * ordem errada dependendo de quem carrega primeiro (ver a nota no topo de
 * `notificationQueueService.js`).
 */
async function processarAlertaZerado(db, material, opcoes = {}) {
  // Revisão da Task 3 (I2): material INATIVO fica fora — catálogo desativado é justamente o
  // que está zerado; alertar reposição de material morto é ruído puro.
  if (material.ativo !== undefined && !material.ativo) {
    return { material_id: material.id, enviado: false, motivo: 'material inativo' };
  }
  // Revisão da Task 3 (I3): material COM mínimo configurado fica fora — o canal do mínimo já
  // alertou "abaixo do mínimo" antes de zerar (zerado ⊂ abaixo), e os dois canais mandavam
  // dois e-mails do mesmo fato para a mesma lista. O zerado existe para o material SEM mínimo,
  // que nada cobria (é o racional escrito do próprio design). Descartado: suprimir o mínimo
  // quando zerar (inverteria a máquina estável da Etapa 4). Reversível, letra B.
  if (Number(material.quantidade_minima) > 0) {
    return { material_id: material.id, enviado: false, motivo: 'coberto pela máquina do mínimo' };
  }
  // Revisão da Task 3 (I1): respeita o toggle "Notificar por e-mail" dos alertas de estoque.
  if (!(await alertasEmailLigado(db))) {
    return { material_id: material.id, enviado: false, motivo: 'notificação por e-mail desligada' };
  }

  const cruzamento = await avaliarZerado(db, material, { saldo_anterior: opcoes.saldo_anterior });
  if (!cruzamento.deveAlertar) {
    return { material_id: material.id, enviado: false, motivo: cruzamento.motivo };
  }

  const queueService = require('./notificationQueueService');
  const destinatarios = parseList(await getConfigValue(db, 'alertas_estoque_emails'));
  const appUrlDb = await getConfigValue(db, APP_URL_CONFIG_KEY);
  const appUrl = getAppAlmoxarifadoUrl(appUrlDb);
  const geradoEm = formatDateTimePtBr();
  const unidade = material.unidade ? ` ${material.unidade}` : '';
  const assunto = `[Almoxarifado] Estoque zerado — ${material.codigo}`;
  const linhas = [
    `Material: ${material.nome}`,
    `Código: ${material.codigo}`,
    `Localização: ${material.localizacao || 'Não informada'}`,
    `Saldo atual: 0${unidade}`,
    `Gerado em: ${geradoEm}`,
  ];
  if (appUrl) linhas.push(`Acessar Almoxarifado: ${appUrl}`);
  const corpo_texto = linhas.join('\n');
  const corpo_html = `<div>${linhas.map((l) => `<p>${escapeHtml(l)}</p>`).join('\n')}</div>`;

  const resultado = await queueService.enfileirar(db, {
    evento: 'ESTOQUE_ZERADO',
    // A unicidade e responsabilidade do CLAIM atomico em avaliarZerado (revisao C1) — quem
    // chega aqui ja ganhou a transicao. Esta chave so precisa nao colidir entre EPISODIOS
    // distintos do mesmo material (zera -> repoe -> zera de novo), por isso o timestamp; ela
    // NAO e a guarda de duplicidade e um teste nao deve fixa-la.
    dedupe_chave: `zerado-${material.id}-${Date.now()}`,
    destinatarios,
    assunto,
    corpo_html,
    corpo_texto,
    payload: { material_id: material.id },
  });

  return { material_id: material.id, enviado: resultado.enfileirada, motivo: resultado.enfileirada ? null : resultado.motivo };
}

/** Sincroniza estado ACIMA para materiais repostos (verificação periódica). */
async function sincronizarEstadoAcimaMinimo(db) {
  await dbRun(db, `UPDATE alertas_estoque_material_almoxarifado
    SET estado_estoque = ?
    WHERE material_id IN (
      SELECT m.id FROM materiais_almoxarifado m
      WHERE m.ativo = 1 AND m.quantidade_minima > 0 AND m.quantidade_atual > m.quantidade_minima
        -- Etapa 8, Task 1 (classe A): alerta de estoque e maquina de REPOSICAO. Material de
        -- cliente (proprietario_cliente_id NOT NULL) nao se repoe: quem manda mais chapa e o
        -- dono dela.
        AND m.proprietario_cliente_id IS NULL
    ) AND estado_estoque = ?`, [ESTADO_ACIMA, ESTADO_ABAIXO]);
}

async function processarAlertaMaterial(db, material, opts = {}) {
  const { forceSend = false, teste = false } = opts;

  if (!teste) {
    const cruzamento = await avaliarCruzamentoMinimo(db, material);
    if (!cruzamento.deveAlertar) {
      return { material_id: material.id, enviado: false, motivo: cruzamento.motivo };
    }
  }

  const settings = await getAlertSettings(db);
  if (!teste) {
    const skipDebounce = await shouldSkipByDebounce(db, material.id, settings.debounceSegundos, forceSend);
    if (skipDebounce) {
      return { material_id: material.id, enviado: false, motivo: 'debounce ativo (envio duplicado recente)' };
    }
  }

  const msg = buildMensagem(material, teste, settings.appUrl);
  const resultado = {
    material_id: material.id,
    material_nome: material.nome,
    email: { enviados: 0, erros: [] },
    whatsapp: { enviados: 0, erros: [] },
  };

  if (settings.notificarEmail && settings.emails.length) {
    resultado.email = await enviarEmail(db, settings.emails, msg.assunto, msg.html, msg.text);
    for (const destinatario of settings.emails) {
      const hasError = resultado.email.erros.length > 0 && resultado.email.enviados === 0;
      await registrarHistorico(db, material.id, 'EMAIL', destinatario, hasError ? 'ERRO' : 'ENVIADO', hasError ? resultado.email.erros.join('; ') : null, teste);
    }
  }

  if (settings.notificarWhatsapp && settings.whatsappNumeros.length) {
    resultado.whatsapp = await enviarWhatsapp(db, settings.whatsappNumeros, msg.whatsapp, {
      material_id: material.id,
      codigo: material.codigo,
      quantidade_atual: material.quantidade_atual,
      quantidade_minima: material.quantidade_minima,
      teste,
    });
    for (const destinatario of settings.whatsappNumeros) {
      const erro = resultado.whatsapp.erros.find(e => e.startsWith(`${destinatario}:`));
      await registrarHistorico(db, material.id, 'WHATSAPP', destinatario, erro ? 'ERRO' : 'ENVIADO', erro || null, teste);
    }
  }

  const houveEnvio = (resultado.email.enviados + resultado.whatsapp.enviados) > 0;
  if (houveEnvio && !teste) await marcarAlertaEnviado(db, material.id);
  return { ...resultado, enviado: houveEnvio };
}

async function verificarAlertasEstoque(db, opts = {}) {
  await sincronizarEstadoAcimaMinimo(db);
  const materiais = await dbAll(db, `SELECT id, codigo, nome, localizacao, unidade, quantidade_atual, quantidade_minima
    FROM materiais_almoxarifado
    WHERE ativo = 1 AND quantidade_minima > 0 AND quantidade_atual <= quantidade_minima
      -- Etapa 8, Task 1 (classe A): ver a nota em sincronizarEstadoAcimaMinimo. Disparar
      -- "acabando, compre mais" sobre material de terceiro manda o alerta errado para a
      -- pessoa errada.
      AND proprietario_cliente_id IS NULL`);
  const resultados = [];
  for (const material of materiais) {
    resultados.push(await processarAlertaMaterial(db, material, opts));
  }
  return resultados;
}

async function verificarAlertaPorMaterialId(db, materialId, opts = {}) {
  // Etapa 8, excecao declarada da auditoria da Task 1: pela FORMA esta e uma leitura por id
  // (classe B, nao filtraria). Pela SEMANTICA e alerta de reposicao (classe A). Quem manda
  // aqui e a semantica: chamada depois de editar material (routes/almoxarifado.js), ela existe
  // so para disparar o alerta de minimo. Material de cliente devolve null e nenhum alerta sai.
  // E o unico ponto do modulo onde forma e semantica discordam — quem revisar por grep vai
  // estranhar um IS NULL numa busca por id, e este comentario e a resposta.
  // `ativo` entra no SELECT para a guarda do zerado (revisao da Task 3, I2) — o alerta de
  // minimo abaixo nunca dispara para inativo de fato (quantidade_minima costuma ser 0), mas a
  // guarda do zerado precisa do valor explicito.
  const material = await dbGet(db, `SELECT id, codigo, nome, localizacao, unidade, quantidade_atual, quantidade_minima, ativo
    FROM materiais_almoxarifado WHERE id = ? AND proprietario_cliente_id IS NULL`, [materialId]);
  if (!material) return null;
  // RN-07 (Etapa 12, Task 3): mesmo hook em tempo real que o alerta de minimo ja usa — chamado
  // depois de TODA movimentacao (stockService) e depois de editar material (routes) — e o que
  // cobre material SEM minimo configurado (a query periodica de `verificarAlertasEstoque` exige
  // `quantidade_minima > 0` e nunca o pegaria). RN-01: falha aqui nunca derruba quem chamou.
  // Fora do modo `teste` (mesmo motivo do alerta de minimo: teste nao deve gerar fila real).
  if (!opts.teste) {
    try {
      // `saldo_anterior` (quando o chamador e o motor de estoque) e o fato que decide a
      // primeira zeragem observada — ver o comentario em avaliarZerado (Critical 1 da
      // revisao final).
      await processarAlertaZerado(db, material, { saldo_anterior: opts.saldo_anterior });
    } catch (e) {
      console.warn('[almoxarifado-alertas] Falha ao avaliar alerta de zerado:', e.message);
    }
  }
  return processarAlertaMaterial(db, material, opts);
}

module.exports = {
  getAlertSettings,
  getAlertSettingsForApi,
  getSmtpConfig,
  getWhatsappConfig,
  getConfigValue,
  enviarEmail,
  parseList,
  escapeHtml,
  shouldUpdateSecret,
  PASSWORD_MASK,
  SMTP_CONFIG_KEYS,
  WHATSAPP_CONFIG_KEYS,
  APP_URL_CONFIG_KEY,
  DEFAULT_APP_URL,
  resolveAppBaseUrl,
  formatDateTimePtBr,
  verificarAlertasEstoque,
  verificarAlertaPorMaterialId,
  processarAlertaMaterial,
  avaliarCruzamentoMinimo,
  marcarAlertaEnviado,
  avaliarZerado,
  alertasEmailLigado,
  processarAlertaZerado,
};
