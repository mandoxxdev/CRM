/**
 * Orion I.A — agente de consulta do CRM GMP.
 * Backend usa provedor externo via GEMINI_API_KEY (nunca exposto ao frontend).
 * Env: GEMINI_API_KEY, GEMINI_MODEL (default gemini-2.0-flash-lite)
 */

const SQL_PROPOSTA_ATIVA = '(ativo IS NULL OR ativo = 1)';
const MAX_AGENT_ROUNDS = 4;

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

function likeTerm(value) {
  return `%${String(value || '').trim().replace(/%/g, '')}%`;
}

const AGENT_TOOLS = [
  {
    name: 'resumo_crm',
    description:
      'Retorna o painel geral do CRM: totais de clientes, propostas por status, pipeline, projetos e top clientes.',
    parameters: { type: 'OBJECT', properties: {}, required: [] },
  },
  {
    name: 'buscar_clientes',
    description:
      'Busca clientes por nome, razão social, nome fantasia, CNPJ, cidade ou estado. Use quando o usuário perguntar sobre um cliente específico ou listar clientes.',
    parameters: {
      type: 'OBJECT',
      properties: {
        termo: { type: 'STRING', description: 'Texto de busca (nome, CNPJ, cidade, UF)' },
        status: { type: 'STRING', description: "Filtro opcional: 'ativo', 'inativo' ou 'todos'" },
        limite: { type: 'NUMBER', description: 'Máximo de resultados (padrão 15, máx 30)' },
      },
      required: [],
    },
  },
  {
    name: 'detalhe_cliente',
    description: 'Busca um cliente pelo id e retorna dados cadastrais + resumo de propostas e oportunidades.',
    parameters: {
      type: 'OBJECT',
      properties: {
        cliente_id: { type: 'NUMBER', description: 'ID do cliente' },
      },
      required: ['cliente_id'],
    },
  },
  {
    name: 'buscar_propostas',
    description:
      'Lista propostas recentes ou filtra por status, número ou cliente. Use para perguntas sobre propostas comerciais.',
    parameters: {
      type: 'OBJECT',
      properties: {
        termo: { type: 'STRING', description: 'Número da proposta ou nome do cliente' },
        status: { type: 'STRING', description: 'Status da proposta (ex: aprovada, enviada, rascunho, rejeitada)' },
        limite: { type: 'NUMBER', description: 'Máximo de resultados (padrão 15, máx 30)' },
      },
      required: [],
    },
  },
  {
    name: 'buscar_oportunidades',
    description: 'Lista oportunidades de venda / pipeline. Pode filtrar por status ou termo.',
    parameters: {
      type: 'OBJECT',
      properties: {
        termo: { type: 'STRING', description: 'Nome da oportunidade ou cliente' },
        status: { type: 'STRING', description: "Ex: 'ativa', 'ganha', 'perdida'" },
        limite: { type: 'NUMBER', description: 'Máximo de resultados (padrão 15, máx 30)' },
      },
      required: [],
    },
  },
  {
    name: 'buscar_projetos',
    description: 'Lista projetos do CRM por status ou termo.',
    parameters: {
      type: 'OBJECT',
      properties: {
        termo: { type: 'STRING', description: 'Nome do projeto ou cliente' },
        status: { type: 'STRING', description: 'Status do projeto' },
        limite: { type: 'NUMBER', description: 'Máximo de resultados (padrão 15, máx 30)' },
      },
      required: [],
    },
  },
  {
    name: 'buscar_atividades',
    description: 'Lista atividades / tarefas pendentes ou recentes.',
    parameters: {
      type: 'OBJECT',
      properties: {
        termo: { type: 'STRING', description: 'Texto livre na descrição/título' },
        apenas_pendentes: { type: 'BOOLEAN', description: 'Se true, só atividades abertas/pendentes' },
        limite: { type: 'NUMBER', description: 'Máximo de resultados (padrão 15, máx 30)' },
      },
      required: [],
    },
  },
];

function clampLimit(value, fallback = 15) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(30, Math.floor(n));
}

async function toolResumoCrm(db) {
  const [
    clientesAtivos,
    clientesTotal,
    propostasPorStatus,
    oportunidadesAtivas,
    pipeline,
    projetosPorStatus,
    topClientes,
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
      `SELECT COALESCE(SUM(valor_estimado), 0) AS total FROM oportunidades WHERE status = 'ativa'`
    ),
    dbAll(db, `SELECT status, COUNT(*) AS total FROM projetos GROUP BY status`),
    dbAll(
      db,
      `SELECT c.id, c.razao_social AS cliente, c.nome_fantasia,
              COUNT(p.id) AS total_propostas,
              COALESCE(SUM(CASE WHEN p.status = 'aprovada' THEN p.valor_total ELSE 0 END), 0) AS valor_aprovado
       FROM clientes c
       LEFT JOIN propostas p ON c.id = p.cliente_id AND (p.ativo IS NULL OR p.ativo = 1)
       WHERE c.status = 'ativo'
       GROUP BY c.id
       ORDER BY valor_aprovado DESC
       LIMIT 10`
    ),
  ]);

  return {
    clientes: { ativos: clientesAtivos.total || 0, total: clientesTotal.total || 0 },
    propostas_por_status: propostasPorStatus,
    oportunidades_ativas: oportunidadesAtivas.total || 0,
    pipeline_estimado: pipeline.total || 0,
    projetos_por_status: projetosPorStatus,
    top_clientes_por_valor: topClientes,
  };
}

async function toolBuscarClientes(db, args = {}) {
  const limite = clampLimit(args.limite);
  const status = String(args.status || 'ativo').toLowerCase();
  const params = [];
  let sql = `SELECT id, razao_social, nome_fantasia, cnpj, cidade, estado, status, telefone, email
             FROM clientes WHERE 1=1`;

  if (status && status !== 'todos') {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (args.termo) {
    sql += ' AND (razao_social LIKE ? OR nome_fantasia LIKE ? OR cnpj LIKE ? OR cidade LIKE ? OR estado LIKE ?)';
    const t = likeTerm(args.termo);
    params.push(t, t, t, t, t);
  }
  sql += ' ORDER BY razao_social LIMIT ?';
  params.push(limite);

  return { clientes: await dbAll(db, sql, params) };
}

async function toolDetalheCliente(db, args = {}) {
  const id = Number(args.cliente_id);
  if (!Number.isFinite(id)) return { erro: 'cliente_id inválido' };

  const cliente = await dbGet(
    db,
    `SELECT id, razao_social, nome_fantasia, cnpj, cidade, estado, status, telefone, email, endereco
     FROM clientes WHERE id = ?`,
    [id]
  );
  if (!cliente?.id) return { erro: 'Cliente não encontrado' };

  const [propostas, oportunidades] = await Promise.all([
    dbAll(
      db,
      `SELECT id, numero_proposta, status, valor_total, created_at
       FROM propostas WHERE cliente_id = ? AND ${SQL_PROPOSTA_ATIVA}
       ORDER BY created_at DESC LIMIT 10`,
      [id]
    ),
    dbAll(
      db,
      `SELECT id, titulo, status, valor_estimado, etapa, created_at
       FROM oportunidades WHERE cliente_id = ?
       ORDER BY created_at DESC LIMIT 10`,
      [id]
    ),
  ]);

  return { cliente, propostas, oportunidades };
}

async function toolBuscarPropostas(db, args = {}) {
  const limite = clampLimit(args.limite);
  const params = [];
  let sql = `SELECT pr.id, pr.numero_proposta, pr.status, pr.valor_total, pr.created_at,
                    c.razao_social AS cliente, c.id AS cliente_id
             FROM propostas pr
             LEFT JOIN clientes c ON c.id = pr.cliente_id
             WHERE (pr.ativo IS NULL OR pr.ativo = 1)`;

  if (args.status) {
    sql += ' AND pr.status = ?';
    params.push(String(args.status).toLowerCase());
  }
  if (args.termo) {
    sql += ' AND (pr.numero_proposta LIKE ? OR c.razao_social LIKE ? OR c.nome_fantasia LIKE ?)';
    const t = likeTerm(args.termo);
    params.push(t, t, t);
  }
  sql += ' ORDER BY pr.created_at DESC LIMIT ?';
  params.push(limite);

  return { propostas: await dbAll(db, sql, params) };
}

async function toolBuscarOportunidades(db, args = {}) {
  const limite = clampLimit(args.limite);
  const params = [];
  let sql = `SELECT o.id, o.titulo, o.status, o.valor_estimado, o.created_at,
                    c.razao_social AS cliente, c.id AS cliente_id
             FROM oportunidades o
             LEFT JOIN clientes c ON c.id = o.cliente_id
             WHERE 1=1`;

  try {
    if (args.status) {
      sql += ' AND o.status = ?';
      params.push(String(args.status).toLowerCase());
    }
    if (args.termo) {
      sql += ' AND (o.titulo LIKE ? OR c.razao_social LIKE ? OR c.nome_fantasia LIKE ?)';
      const t = likeTerm(args.termo);
      params.push(t, t, t);
    }
    sql += ' ORDER BY o.created_at DESC LIMIT ?';
    params.push(limite);
    return { oportunidades: await dbAll(db, sql, params) };
  } catch (e) {
    return { oportunidades: [], aviso: e.message };
  }
}

async function toolBuscarProjetos(db, args = {}) {
  const limite = clampLimit(args.limite);
  const params = [];
  let sql = `SELECT p.id, p.nome, p.status, p.created_at,
                    c.razao_social AS cliente
             FROM projetos p
             LEFT JOIN clientes c ON c.id = p.cliente_id
             WHERE 1=1`;

  if (args.status) {
    sql += ' AND p.status = ?';
    params.push(String(args.status).toLowerCase());
  }
  if (args.termo) {
    sql += ' AND (p.nome LIKE ? OR p.descricao LIKE ? OR c.razao_social LIKE ?)';
    const t = likeTerm(args.termo);
    params.push(t, t, t);
  }
  sql += ' ORDER BY p.created_at DESC LIMIT ?';
  params.push(limite);
  return { projetos: await dbAll(db, sql, params) };
}

async function toolBuscarAtividades(db, args = {}) {
  const limite = clampLimit(args.limite);
  const apenasPendentes = args.apenas_pendentes !== false;
  const params = [];
  let sql = `SELECT id, titulo, descricao, tipo, status, data_agendada, prioridade, created_at
             FROM atividades WHERE 1=1`;

  if (apenasPendentes) {
    sql += ` AND status IN ('pendente','em_andamento','aberta')`;
  }
  if (args.termo) {
    sql += ' AND (titulo LIKE ? OR descricao LIKE ?)';
    const t = likeTerm(args.termo);
    params.push(t, t);
  }
  sql += ' ORDER BY COALESCE(data_agendada, created_at) DESC LIMIT ?';
  params.push(limite);
  return { atividades: await dbAll(db, sql, params) };
}

async function executeTool(db, name, args) {
  switch (name) {
    case 'resumo_crm':
      return toolResumoCrm(db);
    case 'buscar_clientes':
      return toolBuscarClientes(db, args);
    case 'detalhe_cliente':
      return toolDetalheCliente(db, args);
    case 'buscar_propostas':
      return toolBuscarPropostas(db, args);
    case 'buscar_oportunidades':
      return toolBuscarOportunidades(db, args);
    case 'buscar_projetos':
      return toolBuscarProjetos(db, args);
    case 'buscar_atividades':
      return toolBuscarAtividades(db, args);
    default:
      return { erro: `Ferramenta desconhecida: ${name}` };
  }
}

function getProviderConfig() {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const model = (process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite').trim();
  return { apiKey, model, configured: Boolean(apiKey) };
}

function sanitizePublicError(message, status) {
  const raw = String(message || '');
  if (status === 429 || /quota|rate|exhausted|429/i.test(raw)) {
    return 'Orion I.A está temporariamente indisponível por limite de uso. Tente novamente em alguns minutos.';
  }
  if (/no longer available|not found|model/i.test(raw)) {
    return 'Orion I.A está em manutenção de modelo. Contate o administrador do sistema.';
  }
  if (/API key|permission|403|401/i.test(raw)) {
    return 'Orion I.A não está autenticada no servidor. Contate o administrador.';
  }
  return 'Orion I.A não conseguiu processar sua pergunta agora. Tente novamente.';
}

async function callProvider({ apiKey, model, systemInstruction, contents, tools }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048,
    },
  };

  if (tools?.length) {
    body.tools = [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data?.error?.message || `provider_error_${response.status}`);
    err.status = response.status === 429 ? 429 : 502;
    throw err;
  }

  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const functionCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);
  const text = parts
    .map((p) => p?.text || '')
    .join('')
    .trim();

  return {
    text,
    functionCalls,
    modelContent: candidate?.content || { role: 'model', parts },
  };
}

function buildContents(history, message) {
  const contents = [];
  const safeHistory = Array.isArray(history) ? history.slice(-10) : [];

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

async function runAgent({ db, apiKey, model, userName, message, history }) {
  const systemInstruction = `Você é a Orion I.A, agente inteligente oficial do CRM GMP (Moinho Ypiranga / GMP Industriais).
Nunca diga que é Gemini, Google, ChatGPT ou qualquer outro provedor. Seu nome é Orion I.A.
Responda sempre em português do Brasil, clara, objetiva e profissional.
Você TEM ferramentas para consultar o banco do CRM em tempo real. Use-as sempre que a pergunta envolver dados (clientes, propostas, oportunidades, projetos, atividades, totais, pipeline).
Não invente números, clientes ou propostas. Se a ferramenta não trouxer o dado, diga que não encontrou.
Também pode explicar como usar o CRM (cadastros, propostas, dashboard, busca Ctrl+K, etc.).
Usuário logado: ${userName}.
Quando listar resultados, seja útil: cite nomes, status e valores principais.`;

  const contents = buildContents(history, message);
  const toolsUsed = [];

  for (let round = 0; round < MAX_AGENT_ROUNDS; round += 1) {
    const result = await callProvider({
      apiKey,
      model,
      systemInstruction,
      contents,
      tools: AGENT_TOOLS,
    });

    if (!result.functionCalls.length) {
      if (!result.text) {
        throw Object.assign(new Error('empty_response'), { status: 502 });
      }
      return { reply: result.text, toolsUsed };
    }

    contents.push(result.modelContent);

    const functionResponses = [];
    for (const fc of result.functionCalls) {
      const name = fc.name;
      let args = fc.args || {};
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch {
          args = {};
        }
      }

      let toolResult;
      try {
        toolResult = await executeTool(db, name, args);
        toolsUsed.push(name);
      } catch (e) {
        toolResult = { erro: e.message || 'falha na consulta' };
      }

      functionResponses.push({
        functionResponse: {
          name,
          response: toolResult,
        },
      });
    }

    contents.push({
      role: 'user',
      parts: functionResponses,
    });
  }

  throw Object.assign(new Error('agent_max_rounds'), { status: 502 });
}

module.exports = function registerAiAssistantRoutes(app, db, authenticateToken) {
  if (!db) return;

  app.get('/api/ai/status', authenticateToken, (req, res) => {
    const { configured } = getProviderConfig();
    res.json({
      configured,
      name: 'Orion I.A',
      agent: true,
    });
  });

  app.post('/api/ai/chat', authenticateToken, async (req, res) => {
    try {
      const { apiKey, model, configured } = getProviderConfig();
      if (!configured) {
        return res.status(503).json({
          error: 'Orion I.A ainda não está disponível neste servidor. Contate o administrador.',
          code: 'ORION_NOT_CONFIGURED',
        });
      }

      const message = String(req.body?.message || '').trim();
      if (!message) {
        return res.status(400).json({ error: 'Informe a mensagem.' });
      }
      if (message.length > 4000) {
        return res.status(400).json({ error: 'Mensagem muito longa (máx. 4000 caracteres).' });
      }

      const userName = req.user?.nome || req.user?.name || req.user?.email || 'usuário';
      const { reply, toolsUsed } = await runAgent({
        db,
        apiKey,
        model,
        userName,
        message,
        history: req.body?.history,
      });

      res.json({
        reply,
        name: 'Orion I.A',
        agent: true,
        toolsUsed,
      });
    } catch (err) {
      console.error('[orion-ia] chat:', err.message);
      res.status(err.status || 500).json({
        error: sanitizePublicError(err.message, err.status),
      });
    }
  });
};
