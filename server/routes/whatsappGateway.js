const { sendWhatsapp } = require('../services/whatsappSender');

/**
 * Adaptador de WhatsApp.
 * O alertService do Orion faz POST { to, message, ... } para a "Webhook URL"
 * configurada em Almoxarifado → Configurações → Alertas de Estoque.
 * Aponte essa URL para este endpoint que ele repassa ao gateway (Z-API/Meta).
 *
 * Segurança: protegido por WHATSAPP_GATEWAY_SECRET (mesmo valor da "API Key"
 * configurada no Orion). Sem o segredo definido, o endpoint fica desligado.
 */
module.exports = function registerWhatsappGateway(app) {
  app.post('/api/integracoes/whatsapp/enviar', async (req, res) => {
    const secret = process.env.WHATSAPP_GATEWAY_SECRET;
    if (!secret) {
      return res.status(503).json({
        error: 'Gateway de WhatsApp desativado. Defina WHATSAPP_GATEWAY_SECRET no servidor.',
      });
    }

    const auth = req.headers['authorization'] || '';
    const key = (req.headers['x-api-key'] || auth.replace(/^Bearer\s+/i, '')).trim();
    if (key !== secret) {
      return res.status(401).json({ error: 'Não autorizado' });
    }

    const { to, message } = req.body || {};
    if (!to || !message) {
      return res.status(400).json({ error: 'Campos "to" e "message" são obrigatórios' });
    }

    try {
      const raw = await sendWhatsapp({ to, message });
      let resposta;
      try { resposta = JSON.parse(raw); } catch (_) { resposta = raw; }
      res.json({ success: true, provider: process.env.WHATSAPP_PROVIDER || 'zapi', resposta });
    } catch (e) {
      console.error('[whatsapp-gateway] Falha ao enviar:', e.message);
      res.status(502).json({ error: e.message });
    }
  });
};
