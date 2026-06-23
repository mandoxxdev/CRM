const nodemailer = require('nodemailer');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { dbGet, dbAll, dbRun } = require('./db');

const DEFAULT_COOLDOWN_HOURS = 24;
const DEFAULT_INTERVAL_HOURS = 4;
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

async function getAlertSettings(db) {
  const [emails, whatsapps, notificarEmail, notificarWhatsapp, intervaloHoras, cooldownHoras] = await Promise.all([
    getConfigValue(db, 'alertas_estoque_emails'),
    getConfigValue(db, 'alertas_estoque_whatsapp_numeros'),
    getConfigValue(db, 'alertas_estoque_notificar_email'),
    getConfigValue(db, 'alertas_estoque_notificar_whatsapp'),
    getConfigValue(db, 'alertas_estoque_intervalo_verificacao_horas'),
    getConfigValue(db, 'alertas_estoque_cooldown_horas'),
  ]);

  return {
    emails: parseList(emails),
    whatsappNumeros: parseList(whatsapps),
    notificarEmail: parseBool(notificarEmail, true),
    notificarWhatsapp: parseBool(notificarWhatsapp, false),
    intervaloVerificacaoHoras: Number(intervaloHoras) > 0 ? Number(intervaloHoras) : DEFAULT_INTERVAL_HOURS,
    cooldownHoras: Number(cooldownHoras) > 0 ? Number(cooldownHoras) : DEFAULT_COOLDOWN_HOURS,
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
  const [settings, smtp, whatsapp] = await Promise.all([
    getAlertSettings(db),
    getSmtpConfig(db),
    getWhatsappConfig(db),
  ]);

  const smtpPassDb = await getConfigValue(db, SMTP_CONFIG_KEYS.pass);
  const whatsappApiKeyDb = await getConfigValue(db, WHATSAPP_CONFIG_KEYS.apiKey);

  return {
    ...settings,
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

function buildMensagem(material, isTeste = false) {
  const prefix = isTeste ? '[TESTE] ' : '';
  const assunto = `${prefix}Alerta de estoque mínimo - ${material.nome}`;
  const text = `${prefix}Material em estoque mínimo:
Código: ${material.codigo}
Material: ${material.nome}
Saldo atual: ${material.quantidade_atual} ${material.unidade || ''}
Estoque mínimo: ${material.quantidade_minima} ${material.unidade || ''}
Localização: ${material.localizacao || 'Não informada'}
Data: ${new Date().toLocaleString('pt-BR')}`;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.5;">
    <h3 style="margin-bottom:8px;">${prefix}Alerta de estoque mínimo</h3>
    <p><strong>Material:</strong> ${material.nome} (${material.codigo})</p>
    <p><strong>Saldo atual:</strong> ${material.quantidade_atual} ${material.unidade || ''}</p>
    <p><strong>Estoque mínimo:</strong> ${material.quantidade_minima} ${material.unidade || ''}</p>
    <p><strong>Localização:</strong> ${material.localizacao || 'Não informada'}</p>
    <p style="color:#666;">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
  </div>`;
  const whatsapp = `${prefix}*Alerta de estoque mínimo*\nMaterial: ${material.nome} (${material.codigo})\nSaldo atual: ${material.quantidade_atual} ${material.unidade || ''}\nMínimo: ${material.quantidade_minima} ${material.unidade || ''}\nLocalização: ${material.localizacao || 'Não informada'}`;
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
  await dbRun(db, `INSERT INTO alertas_estoque_historico_almoxarifado
    (material_id, canal, destinatario, status, erro, teste)
    VALUES (?, ?, ?, ?, ?, ?)`, [
    materialId,
    canal,
    destinatario,
    status,
    erro || null,
    teste ? 1 : 0,
  ]);
}

async function enviarEmail(db, destinatarios, assunto, html, text) {
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

  try {
    await transporter.sendMail({
      from: smtp.from,
      to: destinatarios.join(','),
      subject: assunto,
      html,
      text,
    });
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

async function shouldSkipByCooldown(db, materialId, cooldownHours, forceSend = false) {
  if (forceSend) return false;
  const row = await dbGet(db, 'SELECT ultimo_alerta_enviado FROM alertas_estoque_material_almoxarifado WHERE material_id = ?', [materialId]);
  if (!row?.ultimo_alerta_enviado) return false;
  const ultimo = new Date(row.ultimo_alerta_enviado).getTime();
  if (Number.isNaN(ultimo)) return false;
  const diffHours = (Date.now() - ultimo) / (1000 * 60 * 60);
  return diffHours < cooldownHours;
}

async function markAlertSent(db, materialId) {
  await dbRun(db, `INSERT INTO alertas_estoque_material_almoxarifado (material_id, ultimo_alerta_enviado)
    VALUES (?, CURRENT_TIMESTAMP)
    ON CONFLICT(material_id) DO UPDATE SET ultimo_alerta_enviado = CURRENT_TIMESTAMP`, [materialId]);
}

async function processarAlertaMaterial(db, material, opts = {}) {
  const { forceSend = false, teste = false } = opts;
  if (!isMaterialCritico(material) && !teste) {
    return { material_id: material.id, enviado: false, motivo: 'material fora da condição de mínimo' };
  }

  const settings = await getAlertSettings(db);
  const skipByCooldown = await shouldSkipByCooldown(db, material.id, settings.cooldownHoras, forceSend || teste);
  if (skipByCooldown) {
    return { material_id: material.id, enviado: false, motivo: 'cooldown ativo' };
  }

  const msg = buildMensagem(material, teste);
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
  if (houveEnvio) await markAlertSent(db, material.id);
  return { ...resultado, enviado: houveEnvio };
}

async function verificarAlertasEstoque(db, opts = {}) {
  const materiais = await dbAll(db, `SELECT id, codigo, nome, localizacao, unidade, quantidade_atual, quantidade_minima
    FROM materiais_almoxarifado
    WHERE ativo = 1 AND quantidade_minima > 0 AND quantidade_atual <= quantidade_minima`);
  const resultados = [];
  for (const material of materiais) {
    resultados.push(await processarAlertaMaterial(db, material, opts));
  }
  return resultados;
}

async function verificarAlertaPorMaterialId(db, materialId, opts = {}) {
  const material = await dbGet(db, `SELECT id, codigo, nome, localizacao, unidade, quantidade_atual, quantidade_minima
    FROM materiais_almoxarifado WHERE id = ?`, [materialId]);
  if (!material) return null;
  return processarAlertaMaterial(db, material, opts);
}

module.exports = {
  getAlertSettings,
  getAlertSettingsForApi,
  getSmtpConfig,
  getWhatsappConfig,
  shouldUpdateSecret,
  PASSWORD_MASK,
  SMTP_CONFIG_KEYS,
  WHATSAPP_CONFIG_KEYS,
  verificarAlertasEstoque,
  verificarAlertaPorMaterialId,
  processarAlertaMaterial,
};
