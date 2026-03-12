/**
 * Motor de composição de propostas técnicas/comerciais
 * - Blocos técnicos e comerciais
 * - Regras condicionais de exibição e geração de texto
 * - Separação: dados brutos (biblioteca) → campos exibidos → texto renderizado
 * - Placeholders avançados: {{#if}}, {{#each}}, {{path}}
 * - Agrupamento de itens por categoria técnica/comercial
 */

const BLOCK_TYPES = { technical: 'technical', commercial: 'commercial' };

/**
 * Separa dados brutos (proposta + itens do BD), biblioteca (labels, defaults) e produz
 * modelo de exibição com campos prontos para template e texto renderizado por bloco.
 * @param {Object} raw - { proposta, itens, totais }
 * @param {Object} library - { variaveis_tecnicas, clausulas, descritivos_padrao }
 * @returns {Object} displayModel - { proposal, items, itemsByCategory, commercialBlocks, technicalBlocks, totals }
 */
function buildDisplayModel(raw, library = {}) {
  const proposta = raw.proposta || {};
  const itens = Array.isArray(raw.itens) ? raw.itens : [];
  const totais = raw.totais || {};

  const proposal = {
    number: proposta.numero_proposta || '',
    revision: proposta.revisao != null ? `R${String(proposta.revisao).padStart(2, '0')}` : 'R00',
    date: totais.dataEmissao || (proposta.created_at ? new Date(proposta.created_at).toLocaleDateString('pt-BR') : ''),
    title: proposta.titulo || '',
    client: {
      name: proposta.nome_fantasia || proposta.razao_social || proposta.cliente_nome || '',
      cnpj: proposta.cnpj || '',
      contact: proposta.cliente_contato || '',
      email: proposta.cliente_email || '',
      phone: proposta.cliente_telefone || ''
    },
    commercial: {
      delivery_time: proposta.prazo_entrega || '',
      payment_terms: proposta.condicoes_pagamento || '',
      warranty: proposta.garantia || '',
      incoterm: proposta.incoterm || '',
      validity: proposta.validade ? new Date(proposta.validade).toLocaleDateString('pt-BR') : ''
    },
    totals: {
      grand_total: formatMoney(totais.total),
      subtotal: formatMoney(totais.subtotal),
      icms: formatMoney(totais.icms),
      ipi: formatMoney(totais.ipi)
    },
    _raw: proposta
  };

  const parseJson = (v) => {
    if (v == null || v === '') return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v) || {}; } catch (_) { return {}; }
  };
  const items = itens.map((item, idx) => {
    const processData = parseJson(item.dados_processo) || {};
    const specs = parseJson(item.specs_json) || {};
    return {
      index: idx + 1,
      tag: item.tag || '',
      model: item.modelo || item.produto_codigo || '',
      category: item.categoria || item.familia_produto || 'Geral',
      quantity: item.quantidade != null ? item.quantidade : 1,
      unit: item.unidade || 'UN',
      description: item.descritivo_tecnico || item.descricao || item.produto_nome || item.nome || '',
      description_short: item.descricao_resumida || '',
      unit_price: formatMoney(item.valor_unitario),
      total: formatMoney(item.valor_total),
      delivery: item.prazo_individual || '',
      process: {
        viscosity_cps: processData.viscosity_cps ?? processData.viscosidade ?? item.viscosidade,
        density: processData.density ?? processData.densidade ?? item.densidade,
        volume: processData.volume ?? processData.volume_util ?? item.volume_util,
        temperature: processData.temperature ?? processData.temperatura ?? item.temperatura,
        product: processData.product ?? processData.produto ?? item.produto,
        base_quimica: processData.base_quimica ?? item.base_quimica,
        area_classificada: processData.area_classificada ?? item.area_classificada
      },
      specifications: {
        power: specs.power ?? specs.potencia ?? item.potencia,
        volume: specs.volume ?? specs.volume_util ?? item.volume_util,
        main: specs.materials_main ?? specs.material_contato ?? item.materiais_construtivos
      },
      materials: item.materiais_construtivos || specs.materials_main || '',
      _raw: item
    };
  });

  const itemsByCategory = groupItemsByCategory(items);

  const technicalBlocks = buildTechnicalBlocks(proposta, items, library);
  const commercialBlocks = buildCommercialBlocks(proposta, totais, library);

  return {
    proposal,
    items,
    itemsByCategory,
    technicalBlocks,
    commercialBlocks,
    totals: proposal.totals,
    _raw: raw
  };
}

/**
 * Contexto para placeholders: expõe proposal, items, itemsByCategory e totals no mesmo nível
 * para {{totals.grand_total}}, {{proposal.number}}, {{#each items}}, {{#each itemsByCategory}}
 */
function getPlaceholderContext(displayModel) {
  return {
    proposal: displayModel.proposal,
    client: displayModel.proposal ? displayModel.proposal.client : {},
    commercial: displayModel.proposal ? displayModel.proposal.commercial : {},
    items: displayModel.items,
    itemsByCategory: displayModel.itemsByCategory,
    totals: displayModel.totals || (displayModel.proposal && displayModel.proposal.totals)
  };
}

function formatMoney(v) {
  if (v == null || v === '') return '0,00';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function groupItemsByCategory(items) {
  const byCategory = {};
  items.forEach((item) => {
    const cat = item.category || 'Geral';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  });
  return Object.entries(byCategory).map(([name, list]) => ({ categoryName: name, items: list }));
}

function buildTechnicalBlocks(proposta, items, library) {
  const blocks = [
    { id: 'objetivo', type: BLOCK_TYPES.technical, visible: true, content: 'Apresentar condições técnicas e comerciais, para fornecimento de peças e acessórios para equipamentos.' },
    { id: 'elaboracao', type: BLOCK_TYPES.technical, visible: true, content: 'A proposta apresentada a seguir, foi elaborada atendendo às solicitações e especificações informadas pelo CONTRATANTE.' },
    { id: 'escopo', type: BLOCK_TYPES.technical, visible: items.length > 0, content: null }
  ];
  return blocks;
}

function buildCommercialBlocks(proposta, totais, library) {
  const blocks = [
    { id: 'condicoes_pagamento', type: BLOCK_TYPES.commercial, visible: !!(proposta.condicoes_pagamento), content: proposta.condicoes_pagamento },
    { id: 'prazo_entrega', type: BLOCK_TYPES.commercial, visible: !!(proposta.prazo_entrega), content: proposta.prazo_entrega },
    { id: 'garantia', type: BLOCK_TYPES.commercial, visible: !!(proposta.garantia), content: proposta.garantia }
  ];
  return blocks;
}

/**
 * Regras condicionais: quando exibir um bloco ou campo.
 * rule: { blockId, when: 'always' | 'has_field' | 'expr', field?: string, expr?: string }
 * context: displayModel
 */
function evaluateCondition(rule, context) {
  if (!rule) return true;
  if (rule.when === 'always') return true;
  if (rule.when === 'has_field' && rule.field) {
    const v = getByPath(context, rule.field);
    return v != null && v !== '';
  }
  if (rule.when === 'expr' && rule.expr) {
    try {
      const fn = new Function('ctx', `with(ctx) { return !!(${rule.expr}); }`);
      return !!fn(context);
    } catch (_) {
      return false;
    }
  }
  return true;
}

function getByPath(obj, path) {
  const parts = path.replace(/^\./, '').split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * Filtra blocos que devem ser exibidos conforme regras.
 */
function getBlocksToRender(blocks, rules, context) {
  const ruleMap = (rules || []).reduce((acc, r) => { acc[r.blockId] = r; return acc; }, {});
  return blocks.filter((b) => {
    const rule = ruleMap[b.id];
    return b.visible !== false && evaluateCondition(rule, context);
  });
}

/**
 * Placeholders avançados:
 * - {{path}} ou {{path.sub}}
 * - {{#if path}}...{{/if}}
 * - {{#each path}}...{{/each}} (path = array)
 * - {{#unless path}}...{{/unless}}
 * context = displayModel (proposal, items, itemsByCategory, totals)
 */
function resolvePlaceholdersAdvanced(html, context) {
  if (!html || typeof html !== 'string') return html;
  let out = html;

  const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function get(path) {
    const v = getByPath(context, path.trim());
    return v == null ? '' : String(v);
  }

  const simpleRegex = /\{\{([^#/][^}]*)\}\}/g;
  out = out.replace(simpleRegex, (_, path) => get(path));

  const eachRegex = /\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  out = out.replace(eachRegex, (_, path, body) => {
    const arr = getByPath(context, path.trim());
    if (!Array.isArray(arr)) return '';
    return arr.map((item, i) => {
      const scope = { ...context, item, index: i + 1, first: i === 0, last: i === arr.length - 1 };
      return resolvePlaceholdersAdvanced(body, scope);
    }).join('');
  });

  const ifRegex = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  out = out.replace(ifRegex, (_, path, body) => {
    const v = getByPath(context, path.trim());
    if (v != null && v !== '' && v !== false && (typeof v !== 'number' || !isNaN(v))) {
      return resolvePlaceholdersAdvanced(body, context);
    }
    return '';
  });

  const unlessRegex = /\{\{#unless\s+([^}]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g;
  out = out.replace(unlessRegex, (_, path, body) => {
    const v = getByPath(context, path.trim());
    if (v == null || v === '' || v === false) {
      return resolvePlaceholdersAdvanced(body, context);
    }
    return '';
  });

  return out;
}

/**
 * Aplica substituição simples (retrocompatível) + avançada.
 */
function resolveAllPlaceholders(html, displayModel) {
  if (!html || typeof html !== 'string') return html;
  let out = html;
  const ctx = getPlaceholderContext(displayModel);
  const p = ctx.proposal || {};
  const simple = {
    '{{proposal.number}}': p.number || '',
    '{{proposal.date}}': p.date || '',
    '{{proposal.revision}}': p.revision || '',
    '{{client.name}}': (p.client && p.client.name) || ctx.client.name || '',
    '{{client.cnpj}}': (p.client && p.client.cnpj) || ctx.client.cnpj || '',
    '{{client.contact}}': (p.client && p.client.contact) || ctx.client.contact || '',
    '{{commercial.delivery_time}}': (p.commercial && p.commercial.delivery_time) || ctx.commercial.delivery_time || '',
    '{{commercial.payment_terms}}': (p.commercial && p.commercial.payment_terms) || ctx.commercial.payment_terms || '',
    '{{totals.grand_total}}': (ctx.totals && ctx.totals.grand_total) || (p.totals && p.totals.grand_total) || ''
  };
  Object.keys(simple).forEach(ph => { out = out.split(ph).join(simple[ph]); });
  return resolvePlaceholdersAdvanced(out, ctx);
}

module.exports = {
  BLOCK_TYPES,
  buildDisplayModel,
  getPlaceholderContext,
  evaluateCondition,
  getBlocksToRender,
  resolvePlaceholdersAdvanced,
  resolveAllPlaceholders,
  getByPath,
  groupItemsByCategory
};
