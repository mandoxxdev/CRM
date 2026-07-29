/**
 * Orion I.A — agente de consulta do CRM GMP.
 * Provedor preferencial: Ollama (local/grátis). Gemini só como fallback opcional.
 * Env:
 *   AI_PROVIDER=ollama|gemini|auto (default: auto)
 *   OLLAMA_BASE_URL=http://127.0.0.1:11434
 *   OLLAMA_MODEL=llama3.2
 *   GEMINI_API_KEY / GEMINI_MODEL (opcional)
 */

const SQL_PROPOSTA_ATIVA = '(ativo IS NULL OR ativo = 1)';
const MAX_AGENT_ROUNDS = 2;

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
  },
  {
    name: 'buscar_clientes',
    description: 'Busca clientes por nome, razão social, CNPJ, cidade ou estado.',
  },
  {
    name: 'detalhe_cliente',
    description: 'Detalhe de um cliente por id + propostas/oportunidades.',
  },
  {
    name: 'buscar_propostas',
    description: 'Lista propostas por status, número ou cliente.',
  },
  {
    name: 'buscar_oportunidades',
    description: 'Lista oportunidades / pipeline.',
  },
  {
    name: 'buscar_projetos',
    description: 'Lista projetos do CRM.',
  },
  {
    name: 'buscar_atividades',
    description: 'Lista atividades / tarefas.',
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
    top_clientes_por_valor: (topClientes || []).slice(0, 5),
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
  let sql = `SELECT p.id, p.nome, p.status, p.created_at, c.razao_social AS cliente
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
  return {
    provider: String(process.env.AI_PROVIDER || 'auto').trim().toLowerCase(),
    ollamaBaseUrl: (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_URL || 'http://127.0.0.1:11434')
      .trim()
      .replace(/\/$/, ''),
    ollamaModel: (process.env.OLLAMA_MODEL || 'llama3.2:1b').trim(),
    geminiKey: (process.env.GEMINI_API_KEY || '').trim(),
    geminiModel: (process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite').trim(),
  };
}

async function probeOllama(baseUrl) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${baseUrl}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function resolveProvider() {
  const cfg = getProviderConfig();

  if (cfg.provider === 'ollama') {
    const ok = await probeOllama(cfg.ollamaBaseUrl);
    return {
      configured: ok,
      kind: 'ollama',
      model: cfg.ollamaModel,
      baseUrl: cfg.ollamaBaseUrl,
    };
  }

  if (cfg.provider === 'gemini') {
    return {
      configured: Boolean(cfg.geminiKey),
      kind: 'gemini',
      model: cfg.geminiModel,
      apiKey: cfg.geminiKey,
    };
  }

  if (await probeOllama(cfg.ollamaBaseUrl)) {
    return {
      configured: true,
      kind: 'ollama',
      model: cfg.ollamaModel,
      baseUrl: cfg.ollamaBaseUrl,
    };
  }

  if (cfg.geminiKey) {
    return {
      configured: true,
      kind: 'gemini',
      model: cfg.geminiModel,
      apiKey: cfg.geminiKey,
    };
  }

  return { configured: false, kind: null };
}

function sanitizePublicError(message, status) {
  const raw = String(message || '');
  if (status === 429 || /quota|rate|exhausted|429|limit:\s*0/i.test(raw)) {
    return 'Orion I.A está temporariamente indisponível. Configure o Ollama no servidor para uso gratuito sem cota.';
  }
  if (status === 504 || /demorou demais|timeout|AbortError/i.test(raw)) {
    return 'Orion I.A demorou demais (servidor sem GPU fica lento). Tente de novo ou use o modelo llama3.2:1b.';
  }
  if (/ECONNREFUSED|fetch failed|aborted|ollama/i.test(raw)) {
    return 'Orion I.A não encontrou o Ollama no servidor. Verifique se o serviço está rodando.';
  }
  if (/no longer available|not found|model/i.test(raw)) {
    return 'Orion I.A está sem o modelo configurado. Contate o administrador.';
  }
  if (/API key|permission|403|401/i.test(raw)) {
    return 'Orion I.A não está autenticada no servidor. Contate o administrador.';
  }
  return 'Orion I.A não conseguiu processar sua pergunta agora. Tente novamente.';
}

function extractSearchTerm(message) {
  return String(message || '')
    .replace(/[?!.,;:]+/g, ' ')
    .replace(
      /\b(quantos?|quais|qual|como|está|esta|mostrar?|mostre|buscar?|busque|liste|listar|cliente|clientes|proposta|propostas|oportunidade|oportunidades|projeto|projetos|atividade|atividades|pipeline|resumo|status|ativos?|aprovadas?|do|da|de|os|as|um|uma|o|a|me|sobre|temos|tem|no|na|crm|orion|teste|online)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

async function gatherLiveCrmContext(db, message) {
  const toolsUsed = ['resumo_crm'];
  const live = {
    gerado_em: new Date().toISOString(),
    resumo: await toolResumoCrm(db),
  };

  const m = String(message || '').toLowerCase();
  const termo = extractSearchTerm(message);

  if (/cliente|cnpj|empresa|raz[aã]o/.test(m)) {
    live.clientes = await toolBuscarClientes(db, {
      termo: termo || undefined,
      status: /inativ/.test(m) ? 'todos' : 'ativo',
      limite: 12,
    });
    toolsUsed.push('buscar_clientes');
  }
  if (/proposta/.test(m)) {
    live.propostas = await toolBuscarPropostas(db, {
      termo: termo || undefined,
      status: /aprovad/.test(m)
        ? 'aprovada'
        : /rejeit|recus/.test(m)
          ? 'rejeitada'
          : /enviad/.test(m)
            ? 'enviada'
            : undefined,
      limite: 12,
    });
    toolsUsed.push('buscar_propostas');
  }
  if (/oportun|pipeline/.test(m)) {
    live.oportunidades = await toolBuscarOportunidades(db, {
      termo: termo || undefined,
      status: /ativa|pipeline/.test(m) ? 'ativa' : undefined,
      limite: 12,
    });
    toolsUsed.push('buscar_oportunidades');
  }
  if (/projeto/.test(m)) {
    live.projetos = await toolBuscarProjetos(db, { termo: termo || undefined, limite: 12 });
    toolsUsed.push('buscar_projetos');
  }
  if (/atividad|tarefa|lembrete|agenda/.test(m)) {
    live.atividades = await toolBuscarAtividades(db, {
      termo: termo || undefined,
      apenas_pendentes: !/todas|conclu/.test(m),
      limite: 12,
    });
    toolsUsed.push('buscar_atividades');
  }

  return { live, toolsUsed };
}

function parseToolDirective(text) {
  const raw = String(text || '').trim();
  const match =
    raw.match(/TOOL\s*:\s*(\{[\s\S]*\})/i) ||
    raw.match(/```(?:json)?\s*(\{\s*"name"\s*:\s*"[^"]+"[\s\S]*?\})\s*```/i);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (!parsed?.name) return null;
    return { name: parsed.name, args: parsed.args || parsed.arguments || {} };
  } catch {
    return null;
  }
}

function buildChatMessages(systemInstruction, history, message) {
  const messages = [{ role: 'system', content: systemInstruction }];
  const safeHistory = Array.isArray(history) ? history.slice(-8) : [];
  for (const item of safeHistory) {
    const text = String(item.text || item.content || '').trim();
    if (!text) continue;
    const role =
      item.role === 'model' || item.role === 'bot' || item.role === 'assistant' ? 'assistant' : 'user';
    messages.push({ role, content: text });
  }
  messages.push({ role: 'user', content: String(message || '').trim() });
  return messages;
}

async function callOllamaChat({ baseUrl, model, messages }) {
  const timeoutMs = Math.max(
    30000,
    parseInt(process.env.OLLAMA_TIMEOUT_MS || '120000', 10) || 120000
  );
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        keep_alive: '10m',
        options: {
          temperature: 0.2,
          num_predict: 400,
        },
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data?.error || `ollama_error_${response.status}`);
      err.status = 502;
      throw err;
    }

    const text = String(data?.message?.content || '').trim();
    if (!text) throw Object.assign(new Error('empty_response'), { status: 502 });
    return text;
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw Object.assign(
        new Error('Orion I.A demorou demais para responder. Tente de novo ou use um modelo menor (llama3.2:1b).'),
        { status: 504 }
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiChat({ apiKey, model, systemInstruction, messages }) {
  const contents = [];
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data?.error?.message || `provider_error_${response.status}`);
    err.status = response.status === 429 ? 429 : 502;
    throw err;
  }

  const text = (data?.candidates || [])
    .flatMap((c) => c?.content?.parts || [])
    .map((p) => p?.text || '')
    .join('')
    .trim();

  if (!text) throw Object.assign(new Error('empty_response'), { status: 502 });
  return text;
}

async function runAgent({ db, provider, userName, message, history }) {
  const { live, toolsUsed } = await gatherLiveCrmContext(db, message);
  const toolCatalog = AGENT_TOOLS.map((t) => `- ${t.name}: ${t.description}`).join('\n');

  const systemInstruction = `Você é a Orion I.A, agente inteligente oficial do CRM GMP (Moinho Ypiranga / GMP Industriais).
Nunca revele provedor técnico. Seu nome é Orion I.A.
Responda sempre em português do Brasil, clara e objetiva.

Os dados abaixo foram lidos AGORA do banco do CRM (tempo real). Use-os. Não invente.
Se precisar de mais detalhe, responda APENAS com uma linha:
TOOL:{"name":"nome_da_ferramenta","args":{...}}
Ferramentas:
${toolCatalog}

Usuário logado: ${userName}.

DADOS AO VIVO DO CRM:
${JSON.stringify(live, null, 2)}`;

  const messages = buildChatMessages(systemInstruction, history, message);

  for (let round = 0; round < MAX_AGENT_ROUNDS; round += 1) {
    const text =
      provider.kind === 'ollama'
        ? await callOllamaChat({
            baseUrl: provider.baseUrl,
            model: provider.model,
            messages,
          })
        : await callGeminiChat({
            apiKey: provider.apiKey,
            model: provider.model,
            systemInstruction,
            messages,
          });

    const toolCall = parseToolDirective(text);
    if (!toolCall) {
      return { reply: text.replace(/^TOOL:.*$/gim, '').trim() || text, toolsUsed };
    }

    let toolResult;
    try {
      toolResult = await executeTool(db, toolCall.name, toolCall.args);
      toolsUsed.push(toolCall.name);
    } catch (e) {
      toolResult = { erro: e.message || 'falha na consulta' };
    }

    messages.push({ role: 'assistant', content: text });
    messages.push({
      role: 'user',
      content: `Resultado da ferramenta ${toolCall.name}:\n${JSON.stringify(toolResult, null, 2)}\n\nAgora responda ao usuário em português, sem mencionar ferramentas.`,
    });
  }

  throw Object.assign(new Error('agent_max_rounds'), { status: 502 });
}

function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Respostas instantâneas de dados do CRM (sem LLM) — rápidas para o usuário.
 */
async function tryFastCrmAnswer(db, message) {
  const m = String(message || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

  const wantsCountClientes =
    /quantos?.{0,20}clientes/.test(m) ||
    (/clientes/.test(m) && /(ativos?|total|quantos?|qtd|quantidade)/.test(m));
  if (wantsCountClientes) {
    const ativos = await dbGet(db, `SELECT COUNT(*) AS total FROM clientes WHERE status = 'ativo'`);
    const total = await dbGet(db, `SELECT COUNT(*) AS total FROM clientes`);
    return {
      reply: `Temos **${ativos.total || 0} clientes ativos** no CRM (de ${total.total || 0} no total).`,
      toolsUsed: ['resumo_crm'],
      fast: true,
    };
  }

  if (/pipeline|oportunidades?\s+ativas?|como\s+esta\s+o\s+pipeline/.test(m)) {
    const qtd = await dbGet(db, `SELECT COUNT(*) AS total FROM oportunidades WHERE status = 'ativa'`);
    const valor = await dbGet(
      db,
      `SELECT COALESCE(SUM(valor_estimado), 0) AS total FROM oportunidades WHERE status = 'ativa'`
    );
    return {
      reply: `Pipeline atual: **${qtd.total || 0} oportunidades ativas**, valor estimado **${formatMoney(valor.total)}**.`,
      toolsUsed: ['buscar_oportunidades'],
      fast: true,
    };
  }

  if (/propostas?.{0,30}(por\s+)?status|resumo.{0,20}propostas|propostas?\s+recentes/.test(m)) {
    const porStatus = await dbAll(
      db,
      `SELECT status, COUNT(*) AS total, COALESCE(SUM(valor_total), 0) AS valor
       FROM propostas WHERE ${SQL_PROPOSTA_ATIVA} GROUP BY status ORDER BY total DESC`
    );
    const recentes = await dbAll(
      db,
      `SELECT pr.numero_proposta, pr.status, pr.valor_total, c.razao_social AS cliente
       FROM propostas pr
       LEFT JOIN clientes c ON c.id = pr.cliente_id
       WHERE (pr.ativo IS NULL OR pr.ativo = 1)
       ORDER BY pr.created_at DESC LIMIT 5`
    );
    const linhasStatus = (porStatus || [])
      .map((r) => `• ${r.status || 'sem status'}: ${r.total} (${formatMoney(r.valor)})`)
      .join('\n');
    const linhasRecentes = (recentes || [])
      .map(
        (r) =>
          `• ${r.numero_proposta || '-'} — ${r.cliente || 'sem cliente'} — ${r.status} — ${formatMoney(r.valor_total)}`
      )
      .join('\n');
    return {
      reply: `Propostas por status:\n${linhasStatus || '• Nenhuma proposta encontrada'}\n\nÚltimas propostas:\n${linhasRecentes || '• Nenhuma'}`,
      toolsUsed: ['buscar_propostas'],
      fast: true,
    };
  }

  if (/atividades?\s+pendentes?|tarefas?\s+pendentes?|quantas?\s+atividades/.test(m)) {
    const row = await dbGet(
      db,
      `SELECT COUNT(*) AS total FROM atividades WHERE status IN ('pendente','em_andamento','aberta')`
    );
    return {
      reply: `Há **${row.total || 0} atividades pendentes/em andamento** no CRM.`,
      toolsUsed: ['buscar_atividades'],
      fast: true,
    };
  }

  // Busca rápida de cliente: "busque/procure o cliente X" ou "cliente X"
  const buscaCliente = m.match(
    /(?:busque|busca|procure|mostra|mostre|encontre|ver)\s+(?:o\s+|a\s+)?cliente\s+(.+)$/i
  ) || m.match(/^cliente\s+(.+)$/i);
  if (buscaCliente) {
    const termo = String(buscaCliente[1] || '').trim().replace(/[?.!]+$/, '');
    if (termo.length >= 2) {
      const clientes = await toolBuscarClientes(db, { termo, status: 'todos', limite: 8 });
      const lista = clientes.clientes || [];
      if (!lista.length) {
        return {
          reply: `Não encontrei cliente com “${termo}”.`,
          toolsUsed: ['buscar_clientes'],
          fast: true,
        };
      }
      const linhas = lista
        .map(
          (c) =>
            `• #${c.id} ${c.razao_social || c.nome_fantasia || '-'}${c.cidade ? ` (${c.cidade}/${c.estado || '-'})` : ''} — ${c.status || '-'}`
        )
        .join('\n');
      return {
        reply: `Encontrei ${lista.length} cliente(s):\n${linhas}`,
        toolsUsed: ['buscar_clientes'],
        fast: true,
      };
    }
  }

  return null;
}

module.exports = function registerAiAssistantRoutes(app, db, authenticateToken) {
  if (!db) return;

  app.get('/api/ai/status', authenticateToken, async (req, res) => {
    const provider = await resolveProvider();
    // Mesmo sem LLM, consultas rápidas do CRM funcionam
    res.json({
      configured: true,
      name: 'Orion I.A',
      agent: true,
      mode: provider.configured ? provider.kind : 'crm-fast',
      llmReady: Boolean(provider.configured),
      learnsFromCrmLive: true,
    });
  });

  app.post('/api/ai/chat', authenticateToken, async (req, res) => {
    try {
      const message = String(req.body?.message || '').trim();
      if (!message) return res.status(400).json({ error: 'Informe a mensagem.' });
      if (message.length > 4000) {
        return res.status(400).json({ error: 'Mensagem muito longa (máx. 4000 caracteres).' });
      }

      const fast = await tryFastCrmAnswer(db, message);
      if (fast) {
        return res.json({
          reply: fast.reply,
          name: 'Orion I.A',
          agent: true,
          toolsUsed: fast.toolsUsed,
          fast: true,
        });
      }

      const provider = await resolveProvider();
      if (!provider.configured) {
        return res.json({
          reply:
            'Para essa pergunta eu preciso do motor de conversa (Ollama). Consultas de clientes, propostas e pipeline eu já respondo na hora — tente uma delas, ou peça ao administrador para ativar o modelo llama3.2:1b no servidor.',
          name: 'Orion I.A',
          agent: true,
          toolsUsed: [],
          fast: false,
        });
      }

      const userName = req.user?.nome || req.user?.name || req.user?.email || 'usuário';
      const { reply, toolsUsed } = await runAgent({
        db,
        provider,
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
