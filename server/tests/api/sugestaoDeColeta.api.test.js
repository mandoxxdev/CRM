/**
 * Etapa 188 (T1) — a regra pura da sugestao de coleta (services/almoxarifado/sugestaoDeColeta.js): candidatos, ordem,
 * escolha e a ordem de coleta. Sem banco: recebe os dados ja lidos.
 *
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa188-sugestao-de-coleta-na-fila-de-separacao.md
 *
 * Executar: cd server && node tests/api/sugestaoDeColeta.api.test.js
 */
const assert = require('assert');
const sc = require('../../services/almoxarifado/sugestaoDeColeta');

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}

const HOJE = '2026-10-22';
const MAT = 100;

// Arvore: ALM1 (id 1) com A-01 (10) > A-03 (11); B-01 (20), B-02 (21), C-01 (30), P-01 (40, a padrao), Q-01 (50, quarentena),
// Q-01-01 (51, filha da quarentena, tipo Prateleira), CLI (60, area de cliente), BLQ (70, bloqueada), INA (80, inativa),
// ALM2 (id 2, inativo) com X-01 (90); SEMALM (95, sem almoxarifado); A-2 (12) e A-10 (13) no ALM1.
function arvoreBase() {
  const l = (id, codigo, extra = {}) => [id, { id, codigo, parent_id: null, tipo: 'Prateleira', ativo: 1, bloqueada: 0,
    almoxarifado_id: 1, almoxarifado_codigo: 'ALM1', almoxarifado_ativo: 1, ...extra }];
  return new Map([
    l(10, 'A-01'), l(11, 'A-03', { parent_id: 10 }), l(12, 'A-2'), l(13, 'A-10'),
    l(20, 'B-01'), l(21, 'B-02'), l(30, 'C-01'), l(40, 'P-01'),
    l(50, 'Q-01', { tipo: 'Área de quarentena/inspeção' }), l(51, 'Q-01-01', { parent_id: 50 }),
    l(60, 'CLI', { tipo: 'Área de materiais do cliente' }), l(70, 'BLQ', { bloqueada: 1 }), l(80, 'INA', { ativo: 0 }),
    l(90, 'X-01', { almoxarifado_id: 2, almoxarifado_codigo: 'ALM2', almoxarifado_ativo: 0 }),
    l(95, 'SEMALM', { almoxarifado_id: null, almoxarifado_codigo: null, almoxarifado_ativo: null }),
  ]);
}
const linha = (localizacao_id, quantidade, lote = null) => ({
  material_id: MAT, localizacao_id, quantidade,
  lote_id: lote ? lote.id : null, lote_codigo: lote ? lote.codigo : null, lote_status: lote ? (lote.status || 'ATIVO') : null,
  lote_validade: lote ? (lote.validade || null) : null, lote_vencimento_liberado_em: lote ? (lote.liberado || null) : null,
});
const item = (item_id, separavel, extra = {}) => ({ item_id, material_id: MAT, material_codigo: 'MAT-9', separavel, ...extra });
function rodar({ itens, linhas, planejado = [], material = {}, arvore = arvoreBase(), series = null }) {
  const planejadoPorPar = new Map(planejado.map(([loc, lote, q]) => [sc.chavePar(MAT, loc, lote), q]));
  return sc.sugerirColeta({
    itens,
    candidatosPorMaterial: new Map([[MAT, linhas]]),
    planejadoPorPar,
    arvore,
    material: new Map([[MAT, { id: MAT, localizacao_padrao_id: null, proprietario_cliente_id: null, controle_serie: 0, ...material }]]),
    seriesPorLote: series ? new Map(series.map(([lote, n]) => [sc.chaveLote(MAT, lote), n])) : new Map(),
    hojeISO: HOJE,
  });
}
const de = (r, id) => r.porItem.get(id);

console.log('\n=== Etapa 188 (T1): sugestao de coleta (regra pura) ===\n');

// 1. RN-188.01
test('[RN-188.01] cobre sozinho -> o primeiro que cobre', () => {
  // L1 (vence antes) tem 2 em C-01 e nao cobre 5; L2 tem 10 em A-01 e cobre: o FEFO poe L1 na frente, a regra escolhe L2.
  const L1 = { id: 1, codigo: 'L1', validade: '2026-11-10' }; const L2 = { id: 2, codigo: 'L2', validade: '2026-12-20' };
  const r = rodar({ itens: [item(1, 5)], linhas: [linha(30, 2, L1), linha(10, 10, L2)] });
  const s = de(r, 1);
  assert.strictEqual(s.pegar_em_aviso, null);
  assert.strictEqual(s.pegar_em.localizacao_codigo, 'A-01');
  assert.strictEqual(s.pegar_em.lote_codigo, 'L2');
  assert.strictEqual(s.pegar_em.quantidade_sugerida, 5);
  assert.strictEqual(s.pegar_em.quantidade_no_endereco, 10);
  assert.strictEqual(s.pegar_em.cobre, true);
});
test('[RN-188.01] material sem lote: A-01 3, B-02 10, separavel 5 -> B-02 5 cobre', () => {
  const r = rodar({ itens: [item(1, 5)], linhas: [linha(10, 3), linha(21, 10)] });
  const s = de(r, 1);
  assert.deepStrictEqual({ c: s.pegar_em.localizacao_codigo, q: s.pegar_em.quantidade_sugerida, cobre: s.pegar_em.cobre, l: s.pegar_em.lote_id },
    { c: 'B-02', q: 5, cobre: true, l: null });
  assert.strictEqual(s.pegar_em.caminho, 'ALM1 / B-02');
});
test('[RN-188.01] nenhum cobre -> o de maior livre, cobre false, NENHUM_ENDERECO_COBRE (emenda C1)', () => {
  // A-01 3 vem antes na ordem (padrao); B-02 10 tem o maior livre e e a dica.
  const r = rodar({ itens: [item(1, 12)], linhas: [linha(10, 3), linha(21, 10)], material: { localizacao_padrao_id: 10 } });
  const s = de(r, 1);
  assert.strictEqual(s.pegar_em_aviso, 'NENHUM_ENDERECO_COBRE');
  assert.strictEqual(s.pegar_em.localizacao_codigo, 'B-02');
  assert.strictEqual(s.pegar_em.quantidade_sugerida, 10);
  assert.strictEqual(s.pegar_em.cobre, false);
});
test('[RN-188.01] separavel 0 -> pegar_em null e aviso null', () => {
  const r = rodar({ itens: [item(1, 0)], linhas: [linha(10, 3)] });
  assert.deepStrictEqual(de(r, 1), { pegar_em: null, pegar_em_aviso: null });
});

// RN-188.01a (emenda C1)
test('[RN-188.01a] planejada cobre -> ela', () => {
  // Item de 6 com 3 separados de A-01 (planejada); A-01 tem 10 -> livre 10 - 3 = 7 >= 3. P-01 (padrao) 20 nao conta.
  const r = rodar({ itens: [item(1, 3, { origem_separacao_id: 10, lote_separacao_id: null, separado_pendente: 3 })],
    linhas: [linha(40, 20), linha(10, 10)], planejado: [[10, null, 3]], material: { localizacao_padrao_id: 40 } });
  const s = de(r, 1);
  assert.strictEqual(s.pegar_em_aviso, null);
  assert.strictEqual(s.pegar_em.localizacao_codigo, 'A-01');
  assert.strictEqual(s.pegar_em.quantidade_sugerida, 3);
  assert.strictEqual(s.pegar_em.cobre, true);
});
test('[RN-188.01a] planejada nao cobre -> ela, PLANEJADA_NAO_COBRE, nunca outro par', () => {
  // A sonda f2r188-sonda1: P 20 (padrao), A 4, B 10; item de 6 com 3 separados de A. Livre de A = 4 - 3 = 1.
  const r = rodar({ itens: [item(1, 3, { origem_separacao_id: 10, lote_separacao_id: null, separado_pendente: 3 })],
    linhas: [linha(40, 20), linha(10, 4), linha(21, 10)], planejado: [[10, null, 3]], material: { localizacao_padrao_id: 40 } });
  const s = de(r, 1);
  assert.strictEqual(s.pegar_em_aviso, 'PLANEJADA_NAO_COBRE');
  assert.strictEqual(s.pegar_em.localizacao_codigo, 'A-01', 'nunca outro par: a P-01 cobriria e nao pode ser a dica');
  assert.strictEqual(s.pegar_em.quantidade_sugerida, 1);
  assert.strictEqual(s.pegar_em.cobre, false);
});
test('[RN-188.01a] planejada sem livre -> null, PLANEJADA_NAO_COBRE; nao sugerivel -> null, PLANEJADA_INDISPONIVEL (Fase 5, M-d)', () => {
  const r1 = rodar({ itens: [item(1, 3, { origem_separacao_id: 10, lote_separacao_id: null, separado_pendente: 3 })],
    linhas: [linha(40, 20), linha(10, 3)], planejado: [[10, null, 3]] });
  assert.deepStrictEqual(de(r1, 1), { pegar_em: null, pegar_em_aviso: 'PLANEJADA_NAO_COBRE' });
  // Ate a Fase 5 este caso (planejada em BLQ, bloqueada, com 10) dizia PLANEJADA_NAO_COBRE — "o resto nao cabe la" com 10 la.
  const r2 = rodar({ itens: [item(1, 3, { origem_separacao_id: 70, lote_separacao_id: null, separado_pendente: 3 })],
    linhas: [linha(40, 20), linha(70, 10)], planejado: [[70, null, 3]] });
  assert.deepStrictEqual(de(r2, 1), { pegar_em: null, pegar_em_aviso: 'PLANEJADA_INDISPONIVEL' });
  assert.deepStrictEqual(r2.ordem_coleta, []);
});
test('[M-d] planejada indisponivel: inativa sem linha de saldo, area especial e lote vencido -> PLANEJADA_INDISPONIVEL', () => {
  // Inativa (80) e sem linha de saldo: o endereco e conferido mesmo sem a linha.
  const r1 = rodar({ itens: [item(1, 3, { origem_separacao_id: 80, lote_separacao_id: null, separado_pendente: 3 })],
    linhas: [linha(40, 20)] });
  assert.deepStrictEqual(de(r1, 1), { pegar_em: null, pegar_em_aviso: 'PLANEJADA_INDISPONIVEL' });
  // Quarentena efetiva pelo pai (51), com saldo.
  const r2 = rodar({ itens: [item(1, 3, { origem_separacao_id: 51, lote_separacao_id: null, separado_pendente: 3 })],
    linhas: [linha(40, 20), linha(51, 10)], planejado: [[51, null, 3]] });
  assert.deepStrictEqual(de(r2, 1), { pegar_em: null, pegar_em_aviso: 'PLANEJADA_INDISPONIVEL' });
  // Lote vencido no endereco bom.
  const LV = { id: 5, codigo: 'LV', validade: '2026-10-01' };
  const r3 = rodar({ itens: [item(1, 3, { origem_separacao_id: 10, lote_separacao_id: 5, separado_pendente: 3 })],
    linhas: [linha(40, 20), linha(10, 10, LV)], planejado: [[10, 5, 3]] });
  assert.deepStrictEqual(de(r3, 1), { pegar_em: null, pegar_em_aviso: 'PLANEJADA_INDISPONIVEL' });
  // Metade positiva: o mesmo endereco bom, sem saldo livre, continua PLANEJADA_NAO_COBRE (nao e "indisponivel").
  const r4 = rodar({ itens: [item(1, 3, { origem_separacao_id: 10, lote_separacao_id: null, separado_pendente: 3 })],
    linhas: [linha(40, 20)] });
  assert.deepStrictEqual(de(r4, 1), { pegar_em: null, pegar_em_aviso: 'PLANEJADA_NAO_COBRE' });
});
test('[M-b] planejada COM lote: A tem L2 (vence antes) e L1; planejada A/L1 -> a dica e A/L1, nunca A/L2', () => {
  // A sonda rev188-s5 (i): A-01 com L2 3 (vence antes) e L1 10; separou 2 de A-01/L1; item de 6 -> separavel 4; livre A/L1 = 8.
  // A linha de L2 vem PRIMEIRO no array: sem a condicao do lote, o find pegaria A-01/L2 (3 < 4).
  const L2 = { id: 2, codigo: 'L2', validade: '2027-01-01' }; const L1 = { id: 1, codigo: 'L1' };
  const r = rodar({ itens: [item(1, 4, { origem_separacao_id: 10, lote_separacao_id: 1, separado_pendente: 2 })],
    linhas: [linha(10, 3, L2), linha(10, 10, L1)], planejado: [[10, 1, 2]], material: { localizacao_padrao_id: 10 } });
  const s = de(r, 1);
  assert.strictEqual(s.pegar_em.lote_codigo, 'L1');
  assert.strictEqual(s.pegar_em_aviso, null);
  assert.strictEqual(s.pegar_em.localizacao_codigo, 'A-01');
  assert.strictEqual(s.pegar_em.quantidade_no_endereco, 8);
  assert.strictEqual(s.pegar_em.quantidade_sugerida, 4);
});
test('[I-a] alertaDeRetencao: retido > 0 com dica -> RETENCAO_NO_MATERIAL; sem retido ou sem dica -> null', () => {
  const dica = { localizacao_id: 40 };
  assert.strictEqual(sc.alertaDeRetencao(dica, { retido: 10 }), 'RETENCAO_NO_MATERIAL');
  assert.strictEqual(sc.alertaDeRetencao(dica, { retido: 0.5 }), 'RETENCAO_NO_MATERIAL');
  assert.strictEqual(sc.alertaDeRetencao(dica, { retido: 0 }), null);
  assert.strictEqual(sc.alertaDeRetencao(dica, {}), null);
  assert.strictEqual(sc.alertaDeRetencao(null, { retido: 10 }), null);
});
test('[RN-188.01a] planejada ja entregue (pendente 0) -> volta a regra normal', () => {
  const r = rodar({ itens: [item(1, 3, { origem_separacao_id: 10, lote_separacao_id: null, separado_pendente: 0 })],
    linhas: [linha(40, 20), linha(10, 1)], material: { localizacao_padrao_id: 40 } });
  assert.strictEqual(de(r, 1).pegar_em.localizacao_codigo, 'P-01');
});

// 2. RN-188.02
test('[RN-188.02] FEFO: o lote que vence antes ganha da padrao', () => {
  const L1 = { id: 1, codigo: 'L1', validade: '2026-11-10' }; const L2 = { id: 2, codigo: 'L2', validade: '2026-12-20' };
  const r = rodar({ itens: [item(1, 5)], linhas: [linha(10, 9, L2), linha(30, 6, L1)], material: { localizacao_padrao_id: 10 } });
  assert.strictEqual(de(r, 1).pegar_em.localizacao_codigo, 'C-01');
  assert.strictEqual(de(r, 1).pegar_em.lote_validade, '2026-11-10');
  const r7 = rodar({ itens: [item(1, 7)], linhas: [linha(10, 9, L2), linha(30, 6, L1)], material: { localizacao_padrao_id: 10 } });
  assert.strictEqual(r7.porItem.get(1).pegar_em.localizacao_codigo, 'A-01');
  assert.strictEqual(r7.porItem.get(1).pegar_em.lote_codigo, 'L2');
});
test('[RN-188.02] sem lote: a padrao antes da maior', () => {
  const r = rodar({ itens: [item(1, 5)], linhas: [linha(21, 50), linha(40, 6)], material: { localizacao_padrao_id: 40 } });
  assert.strictEqual(de(r, 1).pegar_em.localizacao_codigo, 'P-01');
  const sem = rodar({ itens: [item(1, 5)], linhas: [linha(40, 6), linha(21, 50)] });
  assert.strictEqual(sem.porItem.get(1).pegar_em.localizacao_codigo, 'B-02', 'sem padrao: a maior');
});
test('[RN-188.02] lote sem validade e linha sem lote depois do lote com validade', () => {
  const L1 = { id: 1, codigo: 'L1', validade: '2027-01-01' }; const L9 = { id: 9, codigo: 'L9' };
  const r = rodar({ itens: [item(1, 2)], linhas: [linha(21, 50), linha(20, 40, L9), linha(30, 3, L1)] });
  assert.strictEqual(de(r, 1).pegar_em.lote_codigo, 'L1');
});
test('[RN-188.02] empate de tudo -> a ordem de percurso, depois menor localizacao_id', () => {
  // B-02 (21) e A-01 (10), mesma quantidade: A-01 vem antes no caminho.
  const r = rodar({ itens: [item(1, 5)], linhas: [linha(21, 8), linha(10, 8)] });
  assert.strictEqual(de(r, 1).pegar_em.localizacao_codigo, 'A-01');
  // Mesmo caminho (dois codigos iguais, que o UNIQUE nao deixa, simulados): o menor id.
  const arv = arvoreBase(); arv.set(22, { ...arv.get(21), id: 22 });
  const r2 = rodar({ itens: [item(1, 5)], linhas: [linha(22, 8), linha(21, 8)], arvore: arv });
  assert.strictEqual(r2.porItem.get(1).pegar_em.localizacao_id, 21);
});

// 3. RN-188.03
test('[RN-188.03] o separado pendente de outra requisicao no par desconta', () => {
  // A-01 10, 4 planejados (outra requisicao) -> livre 6; B-02 7. Separavel 7: A-01 nao cobre mais -> B-02.
  const r = rodar({ itens: [item(1, 7)], linhas: [linha(10, 10), linha(21, 7)], planejado: [[10, null, 4]], material: { localizacao_padrao_id: 10 } });
  assert.strictEqual(de(r, 1).pegar_em.localizacao_codigo, 'B-02');
  const r6 = rodar({ itens: [item(1, 6)], linhas: [linha(10, 10), linha(21, 7)], planejado: [[10, null, 4]], material: { localizacao_padrao_id: 10 } });
  assert.strictEqual(r6.porItem.get(1).pegar_em.localizacao_codigo, 'A-01');
  assert.strictEqual(r6.porItem.get(1).pegar_em.quantidade_no_endereco, 6);
});
test('[RN-188.03] dois irmaos do mesmo material: o segundo ve o par descontado', () => {
  // A-01 livre 6 (10 - 4), B-01 livre 5; separaveis 4 e 4 -> 1o A-01 4; 2o A-01 tem 2 -> B-01 4.
  const r = rodar({ itens: [item(1, 4), item(2, 4)], linhas: [linha(10, 10), linha(20, 5)], planejado: [[10, null, 4]],
    material: { localizacao_padrao_id: 10 } });
  assert.strictEqual(de(r, 1).pegar_em.localizacao_codigo, 'A-01');
  assert.strictEqual(de(r, 2).pegar_em.localizacao_codigo, 'B-01');
  assert.strictEqual(de(r, 2).pegar_em.quantidade_no_endereco, 5);
});
test('[RN-188.03] requisicoes diferentes nao descontam o sugerido uma da outra', () => {
  const l = [linha(10, 6)];
  const r1 = rodar({ itens: [item(1, 5)], linhas: l });
  const r2 = rodar({ itens: [item(2, 5)], linhas: l });
  assert.strictEqual(de(r1, 1).pegar_em.quantidade_no_endereco, 6);
  assert.strictEqual(de(r2, 2).pegar_em.quantidade_no_endereco, 6);
});
test('[RN-188.03] serie: lote com series bloqueadas nao e sugerido (emenda I3)', () => {
  // L1 (vence antes) 2 em C-01, as duas series BLOQUEADA (0 EM_ESTOQUE); L2 5 em A-01 com 5 EM_ESTOQUE.
  const L1 = { id: 1, codigo: 'L1', validade: '2026-11-10' }; const L2 = { id: 2, codigo: 'L2', validade: '2026-12-20' };
  const r = rodar({ itens: [item(1, 2)], linhas: [linha(30, 2, L1), linha(10, 5, L2)], material: { controle_serie: 1 },
    series: [[2, 5]] });
  assert.strictEqual(de(r, 1).pegar_em.lote_codigo, 'L2');
  // Series EM_ESTOQUE do lote descontam o planejado de TODOS os pares do lote: L2 com 5 series, 4 planejadas em outro par de L2.
  const r2 = rodar({ itens: [item(1, 2)], linhas: [linha(10, 5, L2), linha(20, 4, L2)], material: { controle_serie: 1 },
    series: [[2, 5]], planejado: [[20, 2, 4]] });
  assert.deepStrictEqual({ q: r2.porItem.get(1).pegar_em.quantidade_no_endereco, a: r2.porItem.get(1).pegar_em_aviso },
    { q: 1, a: 'NENHUM_ENDERECO_COBRE' });
});

// 4. RN-188.04
const so = (loc, extra = {}) => rodar({ itens: [item(1, 2)], linhas: [linha(loc, 5, extra.lote)], material: extra.material || {} });
const semSugestao = (r) => assert.deepStrictEqual(de(r, 1), { pegar_em: null, pegar_em_aviso: 'SEM_ENDERECO_SUGERIVEL' });
test('[RN-188.04] sem endereco nunca e candidato', () => semSugestao(so(null)));
test('[RN-188.04] endereco bloqueado', () => semSugestao(so(70)));
test('[RN-188.04] endereco inativo', () => semSugestao(so(80)));
test('[RN-188.04] almoxarifado inativo', () => semSugestao(so(90)));
test('[RN-188.04] quarentena efetiva (pelo pai)', () => semSugestao(so(51)));
test('[RN-188.04] area de cliente com material proprio fica fora', () => semSugestao(so(60)));
test('[RN-188.04] area de cliente com material de cliente entra', () => {
  assert.strictEqual(de(so(60, { material: { proprietario_cliente_id: 5 } }), 1).pegar_em.localizacao_codigo, 'CLI');
});
test('[RN-188.04] lote BLOQUEADO', () => semSugestao(so(10, { lote: { id: 3, codigo: 'LB', status: 'BLOQUEADO' } })));
test('[RN-188.04] lote vencido', () => semSugestao(so(10, { lote: { id: 3, codigo: 'LV', validade: '2026-10-21' } })));
test('[RN-188.04] lote vencido liberado entra', () => {
  const r = so(10, { lote: { id: 3, codigo: 'LV', validade: '2026-10-21', liberado: '2026-10-21 10:00:00' } });
  assert.strictEqual(de(r, 1).pegar_em.lote_codigo, 'LV');
});
test('[RN-188.04] saldo zerado pelo planejado nao e candidato', () => {
  const r = rodar({ itens: [item(1, 2)], linhas: [linha(10, 4)], planejado: [[10, null, 4]] });
  semSugestao(r);
});
test('[RN-188.04] tudo excluido -> SEM_ENDERECO_SUGERIVEL, ordem_coleta vazia', () => {
  const r = rodar({ itens: [item(1, 2)], linhas: [linha(null, 5), linha(70, 5), linha(51, 5), linha(80, 5)] });
  semSugestao(r);
  assert.deepStrictEqual(r.ordem_coleta, []);
});

// 5. RN-188.05
test('[RN-188.05] A-2 antes de A-10', () => {
  const arv = arvoreBase();
  assert.ok(sc.compararCaminho(sc.caminhoDaLocalizacao(arv, 12), sc.caminhoDaLocalizacao(arv, 13)) < 0);
  const r = rodar({ itens: [item(1, 1), item(2, 1, { material_id: MAT })], linhas: [linha(13, 1), linha(12, 1)] });
  assert.deepStrictEqual(r.ordem_coleta.map((p) => p.localizacao_codigo), ['A-2', 'A-10']);
});
test('[RN-188.05] pai antes do filho; caminho pela arvore', () => {
  const arv = arvoreBase();
  const filho = sc.caminhoDaLocalizacao(arv, 11);
  assert.deepStrictEqual(filho.segmentos, ['ALM1', 'A-01', 'A-03']);
  assert.ok(sc.compararCaminho(sc.caminhoDaLocalizacao(arv, 10), filho) < 0);
  assert.ok(sc.compararCaminho(filho, sc.caminhoDaLocalizacao(arv, 10)) > 0);
});
test('[RN-188.05] ALM1 / B-01 antes de ALM2 / A-01; sem almoxarifado por ultimo', () => {
  const arv = arvoreBase();
  arv.set(91, { ...arv.get(90), id: 91, codigo: 'A-01', almoxarifado_ativo: 1 });
  assert.ok(sc.compararCaminho(sc.caminhoDaLocalizacao(arv, 20), sc.caminhoDaLocalizacao(arv, 91)) < 0);
  const semAlm = sc.caminhoDaLocalizacao(arv, 95);
  assert.strictEqual(semAlm.temAlmoxarifado, false);
  assert.deepStrictEqual(semAlm.segmentos, ['SEMALM']);
  assert.ok(sc.compararCaminho(semAlm, sc.caminhoDaLocalizacao(arv, 91)) > 0);
  assert.ok(sc.compararCaminho(sc.caminhoDaLocalizacao(arv, 91), semAlm) < 0);
});
test('[RN-188.05] ciclo em parent_id nao trava', () => {
  const arv = arvoreBase();
  arv.set(10, { ...arv.get(10), parent_id: 11 }); // A-01 <-> A-03
  const c = sc.caminhoDaLocalizacao(arv, 11);
  assert.ok(c.segmentos.length <= 3, JSON.stringify(c));
  assert.strictEqual(c.segmentos[c.segmentos.length - 1], 'A-03');
});

// 6. RN-188.06
test('[RN-188.06] ordem_coleta pelo caminho, empate pela ordem do pedido; itens fora sem pegar_em', () => {
  // Pedido: #1 em B-01, #2 em A-01, #3 em A-01 (materiais diferentes), #4 sem separavel.
  const m2 = 101; const m3 = 102; const m4 = 103;
  const mat = (id, extra = {}) => [id, { id, localizacao_padrao_id: null, proprietario_cliente_id: null, controle_serie: 0, ...extra }];
  const r = sc.sugerirColeta({
    itens: [item(1, 2), { ...item(2, 2), material_id: m2, material_codigo: 'M2' }, { ...item(3, 2), material_id: m3, material_codigo: 'M3' },
      { ...item(4, 0), material_id: m4 }],
    candidatosPorMaterial: new Map([[MAT, [linha(20, 5)]], [m2, [{ ...linha(10, 5), material_id: m2 }]],
      [m3, [{ ...linha(10, 5), material_id: m3 }]], [m4, [{ ...linha(10, 5), material_id: m4 }]]]),
    planejadoPorPar: new Map(), arvore: arvoreBase(), material: new Map([mat(MAT), mat(m2), mat(m3), mat(m4)]),
    seriesPorLote: new Map(), hojeISO: HOJE,
  });
  assert.deepStrictEqual(r.ordem_coleta.map((p) => p.item_id), [2, 3, 1]);
  assert.deepStrictEqual(r.ordem_coleta[0], { item_id: 2, material_codigo: 'M2', localizacao_id: 10, localizacao_codigo: 'A-01',
    caminho: 'ALM1 / A-01', lote_codigo: null, quantidade_sugerida: 2 });
  assert.strictEqual(r.porItem.get(4).pegar_em, null);
});

console.log(`\n${passed} passaram, ${failed} falharam\n`);
process.exit(failed ? 1 : 0);
