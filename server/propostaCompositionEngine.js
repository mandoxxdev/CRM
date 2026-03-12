/**
 * Motor de composição de propostas por blocos técnicos e comerciais.
 * - Composição por blocos (técnico/comercial)
 * - Regras condicionais de exibição e geração de texto
 * - Separação: dados brutos | biblioteca | campos exibidos | texto renderizado
 * - Placeholders avançados: {{#if}}, {{#unless}}, {{#each}}, {{item.xxx}}
 */

const crypto = require('crypto');

// --- Tipos de bloco ---
const BLOCK_TYPE_TECNICO = 'tecnico';
const BLOCK_TYPE_COMERCIAL = 'comercial';

/**
 * Avalia uma regra condicional.
 * regra: { campo: string, op: 'eq'|'ne'|'empty'|'not_empty'|'in'|'gt'|'lt', valor?: any }
 * ctx: contexto com proposta, itens, totais, etc.
 */
function evaluateCondition(regra, ctx) {
  if (!regra || !regra.campo) return true;
  const path = String(regra.campo).split('.');
  let val = ctx;
  for (const p of path) {
    val = val != null && typeof val === 'object' ? val[p] : undefined;
  }
  const op = (regra.op || 'eq').toLowerCase();
  const valor = regra.valor;

  switch (op) {
    case 'eq': return val === valor;
    case 'ne': return val !== valor;
    case 'empty': return val == null || val === '';
    case 'not_empty': return val != null && val !== '';
    case 'in': return Array.isArray(valor) && valor.includes(val);
    case 'gt': return Number(val) > Number(valor);
    case 'lt': return Number(val) < Number(valor);
    default: return true;
  }
}

/**
 * Verifica se um bloco deve ser exibido conforme regras condicionais.
 * regras: array de { campo, op, valor } (AND entre todas)
 */
function shouldShowBlock(regras, ctx) {
  if (!Array.isArray(regras) || regras.length === 0) return true;
  return regras.every(r => evaluateCondition(r, ctx));
}

/**
 * Separa e prepara dados para composição.
 * - rawData: dados brutos da proposta/itens (sem formatação)
 * - displayFields: campos prontos para exibição (formatados, com fallback da biblioteca)
 * - renderedText: textos gerados por regras (descritivos automáticos, etc.)
 */
function prepareCompositionData(proposta, itens, totais, biblioteca = {}) {
  const rawData = {
    proposal: proposta || {},
    items: Array.isArray(itens) ? itens : [],
    totals: totais || {}
  };

  const fmtMoney = (v) => (v != null && v !== '' ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00');
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '');

  const displayFields = {
    proposal: {
      number: proposta?.numero_proposta || '',
      date: fmtDate(totais?.dataEmissao || proposta?.created_at),
      revision: proposta?.revisao != null ? `R${String(proposta.revisao).padStart(2, '0')}` : 'R00',
      title: proposta?.titulo || ''
    },
    client: {
      name: proposta?.nome_fantasia || proposta?.razao_social || proposta?.cliente_nome || '',
      cnpj: proposta?.cnpj || '',
      contact: proposta?.cliente_contato || ''
    },
    commercial: {
      delivery_time: proposta?.prazo_entrega || '',
      payment_terms: proposta?.condicoes_pagamento || '',
      warranty: proposta?.garantia || ''
    },
    totals: {
      grand_total: fmtMoney(totais?.total),
      subtotal: fmtMoney(totais?.subtotal)
    }
  };

  // Textos da biblioteca sobrescrevem display quando chave existe
  const renderedText = { ...(biblioteca || {}) };
  return { rawData, displayFields, renderedText };
}

/**
 * Resolve placeholders avançados no HTML:
 * - {{path}} → valor simples (ex: {{proposal.number}})
 * - {{#if path}}...{{/if}} → exibe se path truthy
 * - {{#unless path}}...{{/unless}} → exibe se path falsy
 * - {{#each items}}...{{/each}} → repete para cada item (contexto item.*)
 * - {{item.xxx}} dentro de #each
 */
function resolveAdvancedPlaceholders(html, context) {
  if (!html || typeof html !== 'string') return html;
  const ctx = context || {};
  let out = html;

  // Obter valor por path (ex: "proposal.number" ou "client.name")
  function getByPath(obj, pathStr) {
    const path = String(pathStr).trim().split('.');
    let v = obj;
    for (const p of path) {
      v = v != null && typeof v === 'object' ? v[p] : undefined;
    }
    return v;
  }

  // Substituições simples {{path}}
  const simpleRegex = /\{\{([^{}#/]+)\}\}/g;
  out = out.replace(simpleRegex, (_, path) => {
    const val = getByPath(ctx, path.trim());
    return val != null ? String(val) : '';
  });

  // {{#each items}}...{{/each}} — context.items = array; dentro do bloco {{item.xxx}} ou {{xxx}} = item.xxx
  const eachRegex = /\{\{#each\s+(\S+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  out = out.replace(eachRegex, (_, key, body) => {
    const arr = getByPath(ctx, key.trim());
    if (!Array.isArray(arr) || arr.length === 0) return '';
    return arr.map((item, index) => {
      let block = body;
      const itemCtx = { ...ctx, item, index, first: index === 0, last: index === arr.length - 1 };
      const itemSimple = /\{\{(?:item\.)?([^}#]+)\}\}/g;
      block = block.replace(itemSimple, (__, path) => {
        const p = path.trim().replace(/^item\./, '');
        const v = getByPath({ item }, p);
        return v != null ? String(v) : '';
      });
      return block;
    }).join('');
  });

  // {{#if path}}...{{/if}}
  const ifRegex = /\{\{#if\s+(\S+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  out = out.replace(ifRegex, (_, path, body) => {
    const val = getByPath(ctx, path.trim());
    return val ? body : '';
  });

  // {{#unless path}}...{{/unless}}
  const unlessRegex = /\{\{#unless\s+(\S+)\}\}([\s\S]*?)\{\{\/unless\}\}/g;
  out = out.replace(unlessRegex, (_, path, body) => {
    const val = getByPath(ctx, path.trim());
    return !val ? body : '';
  });

  return out;
}

/**
 * Monta o contexto único para placeholders (proposal, client, commercial, totals, items com campos exibição).
 */
function buildPlaceholderContext(proposta, itens, totais, displayFields, rawData) {
  const itemsForTemplate = (Array.isArray(itens) ? itens : []).map((item, i) => ({
    tag: item.tag || '',
    model: item.modelo || item.produto_codigo || '',
    quantity: `${item.quantidade || 1} ${item.unidade || 'UN'}`,
    description: item.descritivo_tecnico || item.descricao || item.produto_nome || '',
    category: item.categoria || item.familia_produto || '',
    index: i + 1
  }));
  return {
    proposal: displayFields?.proposal || {},
    client: displayFields?.client || {},
    commercial: displayFields?.commercial || {},
    totals: displayFields?.totals || {},
    items: itemsForTemplate,
    raw: rawData
  };
}

/**
 * Agrupa itens por categoria técnica/comercial.
 * Retorna { grupos: [ { categoria, label, itens: [] } ], semGrupo: [] }
 */
function groupItemsByCategory(itens, defaultCategoryLabel = 'Outros') {
  const list = Array.isArray(itens) ? itens : [];
  const map = new Map();
  const semGrupo = [];
  for (const item of list) {
    const cat = (item.categoria || item.familia_produto || '').trim() || null;
    if (!cat) {
      semGrupo.push(item);
      continue;
    }
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(item);
  }
  const grupos = Array.from(map.entries()).map(([categoria, itensGrupo]) => ({
    categoria,
    label: categoria,
    itens: itensGrupo
  }));
  if (semGrupo.length > 0) {
    grupos.push({ categoria: null, label: defaultCategoryLabel, itens: semGrupo });
  }
  return { grupos, semGrupo };
}

/**
 * Compõe os blocos em ordem, aplicando regras condicionais e placeholders.
 * blocos: [ { tipo, familia, nome, conteudo_html, ordem, regras_condicionais } ]
 * ctx: contexto completo (proposta, itens, totais, displayFields, rawData)
 */
function composeBlocks(blocos, ctx) {
  const sorted = (blocos || []).slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const parts = [];
  for (const bloco of sorted) {
    let regras = bloco.regras_condicionais;
    if (typeof regras === 'string') {
      try { regras = JSON.parse(regras); } catch (_) { regras = []; }
    }
    if (!shouldShowBlock(regras, ctx)) continue;
    let html = bloco.conteudo_html || '';
    const phContext = buildPlaceholderContext(
      ctx.proposta, ctx.itens, ctx.totais, ctx.displayFields, ctx.rawData
    );
    html = resolveAdvancedPlaceholders(html, phContext);
    parts.push(html);
  }
  return parts.join('\n');
}

/**
 * Gera checksum do conteúdo para snapshot imutável.
 */
function snapshotChecksum(html, css = '') {
  const payload = (html || '') + '\n' + (css || '');
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

module.exports = {
  BLOCK_TYPE_TECNICO,
  BLOCK_TYPE_COMERCIAL,
  evaluateCondition,
  shouldShowBlock,
  prepareCompositionData,
  resolveAdvancedPlaceholders,
  buildPlaceholderContext,
  groupItemsByCategory,
  composeBlocks,
  snapshotChecksum
};
