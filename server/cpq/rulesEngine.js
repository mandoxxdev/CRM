/**
 * Motor de regras de engenharia CPQ para processo químico.
 * Considera: viscosidade (cPs), densidade, temperatura, base, área classificada,
 * corrosividade, abrasividade. Retorna equipamentos, especificações, regras aplicadas e bloqueios.
 */

function normalizeParams(params) {
  const p = { ...params };
  if (p.viscosity_cps != null && p.viscosidade == null) p.viscosidade = p.viscosity_cps;
  if (p.viscosidade != null && p.viscosity_cps == null) p.viscosity_cps = p.viscosidade;
  if (p.density != null && p.densidade == null) p.densidade = p.density;
  if (p.densidade != null && p.density == null) p.density = p.densidade;
  if (p.volume_util != null && p.volume == null) p.volume = p.volume_util;
  if (p.volume != null && p.volume_util == null) p.volume_util = p.volume;
  if (typeof p.area_classificada === 'string') p.area_classificada = p.area_classificada === 'true' || p.area_classificada === '1';
  if (typeof p.produto_corrosivo === 'string') p.produto_corrosivo = p.produto_corrosivo === 'true' || p.produto_corrosivo === '1';
  if (typeof p.produto_abrasivo === 'string') p.produto_abrasivo = p.produto_abrasivo === 'true' || p.produto_abrasivo === '1';
  return p;
}

function evaluateRule(rule, params) {
  if (!rule || !rule.ativo) return null;
  const p = normalizeParams(params || {});
  let condOk = false;
  if (rule.condicao_tipo === 'expr' && rule.condicao_expr) {
    try {
      const fn = new Function(...Object.keys(p), `return !!(${rule.condicao_expr});`);
      condOk = fn(...Object.values(p));
    } catch (_) {
      return null;
    }
  } else if (rule.condicao_campo) {
    const v = p[rule.condicao_campo];
    const op = rule.condicao_operador || '>';
    const ref = parseFloat(rule.condicao_valor) || rule.condicao_valor;
    if (op === '>') condOk = parseFloat(v) > parseFloat(ref);
    else if (op === '>=') condOk = parseFloat(v) >= parseFloat(ref);
    else if (op === '<') condOk = parseFloat(v) < parseFloat(ref);
    else if (op === '===' || op === '=') condOk = String(v) === String(ref) || parseFloat(v) === parseFloat(ref);
    else if (op === 'eq') condOk = String(v).toLowerCase() === String(ref).toLowerCase();
  }
  if (!condOk) return null;
  return {
    rule_id: rule.id,
    rule_nome: rule.nome,
    justificativa_tecnica: rule.justificativa_tecnica || null,
    bloqueia: !!(rule.bloqueia === 1 || rule.bloqueia === true),
    resultado_tipo: rule.resultado_tipo,
    resultado_equipamento: rule.resultado_equipamento,
    resultado_especificacao: rule.resultado_especificacao,
    resultado_json: rule.resultado_json ? (typeof rule.resultado_json === 'string' ? JSON.parse(rule.resultado_json) : rule.resultado_json) : null
  };
}

function runRules(rules, params) {
  const out = { equipment: [], specifications: {}, applied_rules: [], blocked: false, block_reason: null };
  const p = normalizeParams(params || {});
  const sorted = (rules || []).filter(r => r.ativo).sort((a, b) => (b.prioridade || 0) - (a.prioridade || 0));
  for (const rule of sorted) {
    const r = evaluateRule(rule, p);
    if (!r) continue;
    out.applied_rules.push({
      rule_id: r.rule_id,
      rule_nome: r.rule_nome,
      justificativa_tecnica: r.justificativa_tecnica,
      resultado_tipo: r.resultado_tipo,
      resultado_equipamento: r.resultado_equipamento,
      resultado_especificacao: r.resultado_especificacao
    });
    if (r.bloqueia) {
      out.blocked = true;
      out.block_reason = r.justificativa_tecnica || r.rule_nome;
    }
    if (r.resultado_tipo === 'equipment' && r.resultado_equipamento) out.equipment.push(r.resultado_equipamento);
    if (r.resultado_especificacao) out.specifications[r.resultado_especificacao] = true;
    if (r.resultado_json && typeof r.resultado_json === 'object') Object.assign(out.specifications, r.resultado_json);
  }
  return out;
}

module.exports = { evaluateRule, runRules, normalizeParams };
