/**
 * Configurador técnico CPQ para processo químico.
 * Entrada: tipo de solução + dados de processo (viscosidade cPs, densidade, volume, produto, base, área classificada, etc.).
 * Saída: dimensionamento preliminar, regras aplicadas, equipamentos sugeridos, composição por tipo de solução.
 */

const { runRules } = require('./rulesEngine');
const { sizing } = require('./sizingEngine');

const DEFAULT_GROUPS = [
  'equipamentos_principais', 'tubulacao', 'valvulas', 'instrumentacao',
  'automacao', 'paineis_eletricos', 'servicos', 'montagem', 'comissionamento'
];

function normalizeProcessParams(params) {
  const norm = (v) => (v != null && v !== '' ? (typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.,]/g, '').replace(',', '.')) || 0) : 0);
  return {
    volume: norm(params.volume ?? params.volume_util),
    volume_util: norm(params.volume_util ?? params.volume),
    viscosidade: norm(params.viscosidade ?? params.viscosity_cps),
    viscosity_cps: norm(params.viscosity_cps ?? params.viscosidade),
    densidade: norm(params.densidade ?? params.density),
    density: norm(params.density ?? params.densidade),
    vazao: norm(params.vazao),
    temperatura: norm(params.temperatura ?? params.temperature),
    pressao: norm(params.pressao),
    produto: String(params.produto || '').toLowerCase(),
    base_quimica: String(params.base_quimica || '').toLowerCase(),
    area_classificada: !!(params.area_classificada === true || params.area_classificada === 'true' || params.area_classificada === '1'),
    produto_corrosivo: !!(params.produto_corrosivo === true || params.produto_corrosivo === 'true' || params.produto_corrosivo === '1'),
    produto_abrasivo: !!(params.produto_abrasivo === true || params.produto_abrasivo === 'true' || params.produto_abrasivo === '1'),
    necessidade_dispersao: params.necessidade_dispersao !== false && params.necessidade_dispersao !== 'false',
    necessidade_moagem: !!(params.necessidade_moagem === true || params.necessidade_moagem === 'true')
  };
}

function configure(db, payload, callback) {
  const { system_type, params = {} } = payload;
  const p = normalizeProcessParams(params);

  db.all('SELECT * FROM cpq_engineering_rules WHERE ativo = 1 ORDER BY prioridade DESC', [], (err, rules) => {
    if (err) return callback(err, null);
    const ruleResult = runRules(rules || [], p);
    const sizingResult = sizing({
      viscosity_cps: p.viscosity_cps || p.viscosidade,
      density: p.density || p.densidade,
      volume_util: p.volume_util || p.volume,
      temperatura: p.temperatura,
      base_quimica: p.base_quimica,
      produto: p.produto,
      area_classificada: p.area_classificada,
      produto_corrosivo: p.produto_corrosivo,
      produto_abrasivo: p.produto_abrasivo,
      necessidade_dispersao: p.necessidade_dispersao,
      necessidade_moagem: p.necessidade_moagem
    });

    db.all('SELECT id, codigo, nome, ordem FROM cpq_composition_groups WHERE ativo = 1 ORDER BY ordem, id', [], (err2, groups) => {
      if (err2) return callback(err2, null);
      const groupList = (groups && groups.length) ? groups : DEFAULT_GROUPS.map((c, i) => ({ id: i + 1, codigo: c, nome: c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), ordem: i }));

      const suggested = (ruleResult.equipment || []).map(cod => ({ composition_group: 'equipamentos_principais', produto_codigo: cod, quantidade: 1 }));
      if (ruleResult.specifications && Object.keys(ruleResult.specifications).length) {
        suggested.push({ _specs: ruleResult.specifications });
      }

      const systemCode = system_type || payload.sistema_tipo_codigo || '';
      db.all(
        'SELECT sistema_tipo_codigo, group_codigo, item_sugerido, ordem FROM cpq_solution_suggestions WHERE ativo = 1 AND sistema_tipo_codigo = ? ORDER BY ordem',
        [systemCode],
        (err3, solutionSuggestions) => {
          const composition_suggestions = (err3 ? [] : (solutionSuggestions || [])).map(s => ({
            group_codigo: s.group_codigo,
            item_sugerido: s.item_sugerido,
            ordem: s.ordem
          }));

          return callback(null, {
            params: p,
            rules_applied: ruleResult,
            sizing_result: sizingResult,
            composition_groups: groupList,
            suggested_equipment: suggested,
            composition_suggestions
          });
        }
      );
    });
  });
}

module.exports = { configure, normalizeProcessParams };
