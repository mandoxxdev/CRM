/**
 * Envio de WhatsApp para o gateway escolhido.
 * Provedor definido por env WHATSAPP_PROVIDER = 'zapi' (padrão) | 'meta'.
 *
 * Z-API  (recomendado p/ usar o SEU número via QR Code):
 *   WHATSAPP_PROVIDER=zapi
 *   ZAPI_INSTANCE_ID=...        (ID da instância)
 *   ZAPI_TOKEN=...              (token da instância)
 *   ZAPI_CLIENT_TOKEN=...       (Account Security Token — header Client-Token)
 *
 * Meta WhatsApp Cloud API (oficial — número dedicado + template aprovado):
 *   WHATSAPP_PROVIDER=meta
 *   WHATSAPP_PHONE_NUMBER_ID=...
 *   WHATSAPP_ACCESS_TOKEN=...
 *   WHATSAPP_TEMPLATE_NAME=...      (template aprovado, 1 variável no corpo)
 *   WHATSAPP_TEMPLATE_LANG=pt_BR    (opcional)
 *   WHATSAPP_GRAPH_VERSION=v21.0    (opcional)
 */
const https = require('https');
const { URL } = require('url');

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function httpPostJson(urlString, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: `${u.pathname}${u.search || ''}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(data);
        reject(new Error(`Provedor retornou HTTP ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Timeout na chamada ao provedor de WhatsApp')));
    req.write(body);
    req.end();
  });
}

// Parâmetro de template da Meta não aceita quebras de linha / tabs / múltiplos espaços.
function flattenParaTemplate(text) {
  return String(text || '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
}

async function sendViaZapi(to, message) {
  const instance = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!instance || !token) {
    throw new Error('Z-API não configurado (defina ZAPI_INSTANCE_ID e ZAPI_TOKEN).');
  }
  const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
  const headers = clientToken ? { 'Client-Token': clientToken } : {};
  return httpPostJson(url, { phone: onlyDigits(to), message: String(message || '') }, headers);
}

async function sendViaMeta(to, message) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneId || !accessToken) {
    throw new Error('Meta Cloud API não configurada (defina WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_ACCESS_TOKEN).');
  }
  const version = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;

  let payload;
  if (templateName) {
    // Mensagem proativa (alerta) → precisa de template aprovado com 1 variável no corpo.
    payload = {
      messaging_product: 'whatsapp',
      to: onlyDigits(to),
      type: 'template',
      template: {
        name: templateName,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: flattenParaTemplate(message).slice(0, 1024) }] }],
      },
    };
  } else {
    // Texto livre (só funciona dentro da janela de 24h de conversa).
    payload = {
      messaging_product: 'whatsapp',
      to: onlyDigits(to),
      type: 'text',
      text: { body: String(message || '').slice(0, 4096) },
    };
  }
  return httpPostJson(url, payload, { Authorization: `Bearer ${accessToken}` });
}

async function sendWhatsapp({ to, message }) {
  const provider = (process.env.WHATSAPP_PROVIDER || 'zapi').toLowerCase();
  if (provider === 'meta' || provider === 'cloud') return sendViaMeta(to, message);
  return sendViaZapi(to, message);
}

module.exports = { sendWhatsapp };
