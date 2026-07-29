/**
 * Assistente IA (Gemini free tier) — consulta de dados do CRM + conversa.
 * Env: GEMINI_API_KEY (obrigatória), GEMINI_MODEL (opcional, default gemini-2.5-flash)
 */

const SQL_PROPOSTA_ATIVA = '(ativo IS NULL OR ativo = 1)';

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || {})));
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

async function getCrmSnapshot(db) {
  const [
    clientesAtivos,
    clientesTotal,
    propostasPorStatus,
    oportunidadesAtivas,
    pipeline,
    projetosPorStatus,
    atividadesPendentes,
    topClientes,
    propostasRecentes,
  ] = await Promise.all([
    dbGet(db, `SELECT COUNT(*) AS total FROM clientes WHERE status = 'ativo'`),
    dbGet(db, `SELECT COUNT(*) AS total FROM clientes`),
    dbAll(
      db,
      `SELECT status, COUNT(*) AS total, COALESCE(SUM(valor_total), 0) AS valor
       FROM propostas WHERE ${SQL_PROPOSTA_ATIVA} GROUP BY status`
    ),
    dbGet(db, `SELECT COUNT(*) AS total FROM oportunidades WHERE status = 'ativa'`),
    dbGet(
      db,
      `SELECT COALESCE(SUM(valor_estimado), 0) AS total
       FROM oportunidades WHERE status = 'ativa'`
    ),
    dbAll(db, `SELECT status, COUNT(*) AS total FROM projetos GROUP BY status`),
    dbGet(
      db,
      `SELECT COUNT(*) AS total FROM atividades
       WHERE status IN ('pendente', 'em_andamento', 'aberta')`
    ).catch(() =>
      dbGet(db, `SELECT COUNT(*) AS total FROM atividades WHERE concluida = 0 OR concluida IS NULL`).catch(
        () => ({ total: null })
      )
    ),
    dbAll(
      db,
      `SELECT c.razao_social AS cliente, c.nome_fantasia,
              COUNT(p.id) AS total_propostas,
              COALESCE(SUM(CASE WHEN p.status = 'aprovada' THEN p.valor_total ELSE 0 END), 0) AS valor_aprovado
       FROM clientes c
       LEFT JOIN propostas p ON c.id = p.cliente_id AND (p.ativo IS NULL OR p.ativo = 1)
       WHERE c.status = 'ativo'
       GROUP BY c.id
       ORDER BY valor_aprovado DESC
       LIMIT 8`
    ),
    dbAll(
      db,
      `SELECT pr.numero_proposta, pr.status, pr.valor_total, pr.created_at,
              c.razao_social AS cliente
       FROM propostas pr
       LEFT JOIN clientes c ON c.id = pr.cliente_id
       WHERE (pr.ativo IS NULL OR pr.ativo = 1)
       ORDER BY pr.created_at DESC
       LIMIT 10`
    ),
  ]);

  return {
    gerado_em: new Date().toISOString(),
    clientes: {
      ativos: clientesAtivos.total || 0,
      total: clientesTotal.total || 0,
    },
    propostas_por_status: propostasPorStatus,
    oportunidades_ativas: oportunidadesAtivas.total || 0,
    pipeline_estimado: pipeline.total || 0,
    projetos_por_status: projetosPorStatus,
    atividades_pendentes: atividadesPendentes.total,
    top_clientes_por_valor: topClientes,
    propostas_recentes: propostasRecentes,
  };
}

function getGeminiConfig() {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const model = (process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite').trim();
  return { apiKey, model, configured: Boolean(apiKey) };
}

async function callGemini({ apiKey, model, systemInstruction, contents }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    contents,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 2048,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const msg =
      data?.error?.message ||
      (response.status === 429
        ? 'Cota gratuita do Gemini esgotada no momento. Tente novamente mais tarde.'
        : `Erro Gemini (${response.status})`);
    const err = new Error(msg);
    err.status = response.status === 429 ? 429 : 502;
    throw err;
  }

  const text = (data?.candidates || [])
    .flatMap((c) => c?.content?.parts || [])
    .map((p) => p?.text || '')
    .join('')
    .trim();

  if (!text) {
    throw Object.assign(new Error('A IA não retornou uma resposta útil.'), { status: 502 });
  }

  return text;
}

function buildContents(history, message) {
  const contents = [];
  const safeHistory = Array.isArray(history) ? history.slice(-12) : [];

  for (const item of safeHistory) {
    const role = item.role === 'model' || item.role === 'bot' || item.role === 'assistant' ? 'model' : 'user';
    const text = String(item.text || item.content || '').trim();
    if (!text) continue;
    contents.push({ role, parts: [{ text }] });
  }

  contents.push({
    role: 'user',
    parts: [{ text: String(message || '').trim() }],
  });

  return contents;
}

module.exports = function registerAiAssistantRoutes(app, db, authenticateToken) {
  if (!db) return;

  app.get('/api/ai/status', authenticateToken, (req, res) => {
    const { configured, model } = getGeminiConfig();
    res.json({
      configured,
      provider: 'gemini',
      model: configured ? model : null,
      freeTier: true,
    });
  });

  app.post('/api/ai/chat', authenticateToken, async (req, res) => {
    try {
      const { apiKey, model, configured } = getGeminiConfig();
      if (!configured) {
        return res.status(503).json({
          error:
            'Assistente IA não configurado. Defina a variável GEMINI_API_KEY no servidor (chave gratuita em https://aistudio.google.com/apikey).',
          code: 'GEMINI_NOT_CONFIGURED',
        });
      }

      const message = String(req.body?.message || '').trim();
      if (!message) {
        return res.status(400).json({ error: 'Informe a mensagem.' });
      }
      if (message.length > 4000) {
        return res.status(400).json({ error: 'Mensagem muito longa (máx. 4000 caracteres).' });
      }

      let snapshot;
      try {
        snapshot = await getCrmSnapshot(db);
      } catch (e) {
        console.error('[aiAssistant] snapshot CRM:', e.message);
        snapshot = { aviso: 'Não foi possível carregar o resumo completo do CRM neste momento.' };
      }

      const userName = req.user?.nome || req.user?.name || req.user?.email || 'usuário';
      const systemInstruction = `Você é a assistente IA do CRM GMP (Moinho Ypiranga / GMP Industriais).
Responda sempre em português do Brasil, de forma clara, objetiva e profissional.
Use APENAS os dados do JSON de contexto abaixo para números e fatos do sistema. Se o dado não estiver no contexto, diga que não tem essa informação no resumo atual e sugira onde o usuário pode olhar no CRM (clientes, propostas, oportunidades, projetos, atividades, dashboard).
Não invente valores, clientes ou propostas.
Pode explicar como usar o CRM (cadastros, propostas, dashboard, busca Ctrl+K, etc.).
Usuário logado: ${userName}.

CONTEXTO DO CRM (resumo seguro):
${JSON.stringify(snapshot, null, 2)}`;

      const contents = buildContents(req.body?.history, message);
      const reply = await callGemini({ apiKey, model, systemInstruction, contents });

      res.json({
        reply,
        provider: 'gemini',
        model,
        usedCrmContext: true,
      });
    } catch (err) {
      console.error('[aiAssistant] chat:', err.message);
      res.status(err.status || 500).json({
        error: err.message || 'Erro ao consultar a assistente IA.',
      });
    }
  });
};
