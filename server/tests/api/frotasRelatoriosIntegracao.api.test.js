/**
 * Frota Etapa 4 — T3: integracao que cruza portal, telas do gestor, os dois relatorios e a planilha.
 *
 *   (a) PELA ROTA — a maquina abastece pelo portal (em horas, um lancamento atrasado com confirmacao), o carro pelo gestor; multas em
 *       varios meses (uma contestada, uma sem data); um veiculo excluido com abastecimento e multa no periodo. O relatorio de consumo
 *       traz o L/h e o km/L; a lista do gestor e a planilha trazem o MESMO L/h por linha; e as somas da tela batem com a planilha no
 *       mesmo periodo pela RN-F4.14 (so as placas da aba Cadastro Frota; multas sem as contestadas). O gestor edita e exclui o do
 *       meio e o L/h do vizinho e refeito nos tres lugares.
 *   (b) PELO SERVICO — relatorioConsumo / relatorioCustosPorVeiculo / exportarPlanilha direto, com o mesmo cenario reduzido.
 *
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa4-relatorios.md
 * Executar: cd server && node tests/api/frotasRelatoriosIntegracao.api.test.js
 */
const assert = require('assert');
const XLSX = require('xlsx');
const { createFrotasTestApp, ADMIN, MOTORISTA } = require('../helpers/frotasTestApp');
const frotasService = require('../../services/frotas/frotasService');
const { exportarPlanilha } = require('../../services/frotas/exportacaoService');
const { dbRun } = require('../../services/frotas/db');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

function binario(res, cb) {
  res.setEncoding('binary');
  let d = '';
  res.on('data', (c) => { d += c; });
  res.on('end', () => cb(null, Buffer.from(d, 'binary')));
}
function abas(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const out = {};
  for (const n of wb.SheetNames) out[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' });
  return out;
}
function linhasComo(aba) {
  const [cab, ...resto] = aba;
  return resto.map((l) => Object.fromEntries(cab.map((c, i) => [c, l[i]])));
}
const soma = (xs) => Math.round(xs.reduce((s, x) => s + (Number(x) || 0), 0) * 100) / 100;

/** As somas da tela contra a planilha no mesmo periodo (RN-F4.14). Devolve os totais para o chamador conferir valores fixos. */
function conferirReconciliacao(custos, consumo, p) {
  const placas = new Set(linhasComo(p['Cadastro Frota']).map((l) => l.Placa));
  const daFrota = (aba) => linhasComo(p[aba]).filter((l) => placas.has(l['Veículo']));
  const tela = {
    man: soma(custos.map((c) => c.custo_manutencao)),
    comb: soma(custos.map((c) => c.custo_combustivel)),
    mult: soma(custos.map((c) => c.custo_multas)),
    total: soma(custos.map((c) => c.custo_total)),
    gastoConsumo: soma(consumo.map((c) => c.total_gasto)),
  };
  const planilhaT = {
    man: soma(daFrota('Manutenções').map((l) => l['Custo R$'])),
    comb: soma(daFrota('Abastecimentos').map((l) => l['Valor Total R$'])),
    mult: soma(daFrota('Multas').filter((l) => l.Status !== 'Contestado').map((l) => l['Valor R$'])),
  };
  assert.strictEqual(tela.man, planilhaT.man, 'manutencao: tela x planilha');
  assert.strictEqual(tela.comb, planilhaT.comb, 'combustivel: tela x planilha');
  assert.strictEqual(tela.mult, planilhaT.mult, 'multas: tela x planilha');
  assert.strictEqual(tela.gastoConsumo, tela.comb, 'total gasto do consumo = combustivel do custo');
  assert.strictEqual(tela.total, soma([tela.man, tela.comb, tela.mult]), 'total = soma das colunas');
  return tela;
}

test('(a) pela rota: portal + gestor -> relatorios, lista e planilha batem; editar/excluir refaz o vizinho nos tres', async () => {
  const ctx = await createFrotasTestApp();
  const gestor = ctx.como(ADMIN);
  const ana = ctx.como(MOTORISTA);
  const maq = (await gestor('post', '/api/frotas/veiculos', { placa: 'EMP0001', tipo_medicao: 'horimetro', horimetro_atual: 100 })).body;
  const car = (await gestor('post', '/api/frotas/veiculos', { placa: 'CAR0001', km_atual: 1000 })).body;
  const velho = (await gestor('post', '/api/frotas/veiculos', { placa: 'OLD0001', km_atual: 10 })).body;
  assert.strictEqual((await gestor('post', '/api/frotas/motoristas', { nome: 'Ana Motorista', usuario_id: MOTORISTA.id })).status, 201);

  // maquina pelo portal: 110 h (setembro), 120 h, 140 h; e um atrasado de 130 h (pergunta e confirma)
  const porPortal = async (corpo) => {
    const r = await ana('post', '/api/frotas/portal/abastecimentos', corpo);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body.abastecimento || r.body;
  };
  await porPortal({ veiculo_id: maq.id, horimetro: 110, litros: 30, valor_total: 180, data: '2026-09-25' });
  const m2 = await porPortal({ veiculo_id: maq.id, horimetro: 120, litros: 40, valor_total: 240, data: '2026-10-02' });
  const m3 = await porPortal({ veiculo_id: maq.id, horimetro: 140, litros: 60, valor_total: 360, data: '2026-10-09' });
  const atrasado = await ana('post', '/api/frotas/portal/abastecimentos', { veiculo_id: maq.id, horimetro: 130, litros: 25, valor_total: 150, data: '2026-10-05' });
  assert.strictEqual(atrasado.status, 409);
  assert.strictEqual(atrasado.body.code, 'HORIMETRO_MENOR_QUE_ATUAL');
  const m4 = await porPortal({ veiculo_id: maq.id, horimetro: 130, litros: 25, valor_total: 150, data: '2026-10-05', confirmar_km_menor: true });
  assert.deepStrictEqual([m2.horimetro_abastecimento, m4.km_abastecimento], [120, null]);

  // carro pelo gestor
  await gestor('post', '/api/frotas/abastecimentos', { veiculo_id: car.id, km_abastecimento: 1000, litros: 40, valor_total: 250, data_abastecimento: '2026-10-01' });
  await gestor('post', '/api/frotas/abastecimentos', { veiculo_id: car.id, km_abastecimento: 1400, litros: 40, valor_total: 260, data_abastecimento: '2026-10-10' });
  await gestor('post', '/api/frotas/manutencoes', { veiculo_id: car.id, descricao: 'Oleo', custo: 333.33, data_manutencao: '2026-10-12', status: 'concluida' });
  await gestor('post', '/api/frotas/manutencoes', { veiculo_id: maq.id, descricao: 'Garfo', custo: 90, data_manutencao: '2026-08-12', status: 'concluida' });
  // multas
  await gestor('post', '/api/frotas/multas', { veiculo_id: car.id, data_infracao: '2026-10-03', valor: 195.23 });
  await gestor('post', '/api/frotas/multas', { veiculo_id: car.id, data_infracao: '2026-10-04', valor: 500, status_pagamento: 'contestado' });
  await gestor('post', '/api/frotas/multas', { veiculo_id: car.id, data_infracao: '2025-01-04', valor: 88 });
  const semData = (await gestor('post', '/api/frotas/multas', { veiculo_id: maq.id, valor: 40 })).body;
  await dbRun(ctx.db, 'UPDATE frotas_multas SET created_at = ? WHERE id = ?', ['2026-10-15 14:00:00', semData.id]);
  // veiculo excluido com lancamentos no periodo: sai da tela, fica no historico da planilha
  await gestor('post', '/api/frotas/abastecimentos', { veiculo_id: velho.id, km_abastecimento: 20, litros: 10, valor_total: 999, data_abastecimento: '2026-10-07' });
  await gestor('post', '/api/frotas/multas', { veiculo_id: velho.id, data_infracao: '2026-10-07', valor: 777 });
  assert.strictEqual((await gestor('delete', `/api/frotas/veiculos/${velho.id}`)).status, 200);

  const Q = '?data_inicio=2026-10-01&data_fim=2026-10-31';
  const carregar = async () => {
    const custos = (await gestor('get', `/api/frotas/relatorios/custos-por-veiculo${Q}`)).body;
    const consumo = (await gestor('get', `/api/frotas/relatorios/consumo${Q}`)).body;
    const x = await gestor('get', `/api/frotas/exportar.xlsx${Q}`).buffer(true).parse(binario);
    assert.strictEqual(x.status, 200);
    const lista = (await gestor('get', `/api/frotas/abastecimentos?veiculo_id=${maq.id}`)).body;
    return { custos, consumo, p: abas(x.body), lista };
  };

  let { custos, consumo, p, lista } = await carregar();
  const t = conferirReconciliacao(custos, consumo, p);
  assert.deepStrictEqual([t.man, t.comb, t.mult, t.total], [333.33, 1260, 235.23, 1828.56]);
  assert.ok(linhasComo(p.Multas).some((l) => l['Veículo'] === 'OLD0001'), 'a planilha guarda o historico do excluido');
  assert.deepStrictEqual(custos.map((c) => c.placa), ['CAR0001', 'EMP0001']);

  // L/h: 120 (de 110, fora do periodo) = 4; 130 (atrasado) = 2.5; 140 = 6
  const cm = consumo.find((c) => c.placa === 'EMP0001');
  assert.deepStrictEqual([cm.tipo_medicao, cm.abastecimentos, cm.consumo_litros_hora, cm.consumo_medio], ['horimetro', 3, 12.5 / 3, null]);
  const cc = consumo.find((c) => c.placa === 'CAR0001');
  assert.deepStrictEqual([cc.consumo_medio, cc.consumo_litros_hora, cc.abastecimentos], [10, null, 2]);
  // o mesmo L/h por linha na lista do gestor e na planilha
  const lphLista = Object.fromEntries(lista.map((a) => [a.horimetro_abastecimento, a.consumo_litros_hora]));
  const lphPlan = Object.fromEntries(linhasComo(p.Abastecimentos).filter((l) => l['Veículo'] === 'EMP0001')
    .map((l) => [l['Horímetro'], l['Consumo L/h'] === '' ? null : l['Consumo L/h']]));
  assert.deepStrictEqual(lphLista, { 110: null, 120: 4, 130: 2.5, 140: 6 });
  assert.deepStrictEqual(lphPlan, { 120: 4, 130: 2.5, 140: 6 });

  // o gestor corrige o atrasado para 135 h e depois exclui o de 120 h: os vizinhos sao refeitos nos tres lugares
  assert.strictEqual((await gestor('put', `/api/frotas/abastecimentos/${m4.id}`, { horimetro_abastecimento: 135 })).status, 200);
  ({ consumo, p, lista } = await carregar());
  assert.deepStrictEqual(Object.fromEntries(lista.map((a) => [a.horimetro_abastecimento, a.consumo_litros_hora])), { 110: null, 120: 4, 135: 1.67, 140: 12 });
  assert.strictEqual((await gestor('delete', `/api/frotas/abastecimentos/${m2.id}`)).status, 200);
  ({ custos, consumo, p, lista } = await carregar());
  assert.deepStrictEqual(Object.fromEntries(lista.map((a) => [a.horimetro_abastecimento, a.consumo_litros_hora])), { 110: null, 135: 1, 140: 12 });
  assert.deepStrictEqual(Object.fromEntries(linhasComo(p.Abastecimentos).filter((l) => l['Veículo'] === 'EMP0001')
    .map((l) => [l['Horímetro'], l['Consumo L/h']])), { 135: 1, 140: 12 });
  assert.strictEqual(consumo.find((c) => c.placa === 'EMP0001').consumo_litros_hora, 6.5);
  conferirReconciliacao(custos, consumo, p);

  // m3 nao mudou de horas, mas o anterior dele sim: tambem conferido acima (140 -> 12 L/h)
  assert.ok(m3.id);
});

test('(b) pelo servico: as mesmas reguas chamadas direto', async () => {
  const ctx = await createFrotasTestApp();
  const { db } = ctx;
  const maq = await frotasService.createVeiculo(db, { placa: 'SRV0002', tipo_medicao: 'horimetro', horimetro_atual: 0 });
  await frotasService.createAbastecimento(db, ADMIN, { veiculo_id: maq.id, horimetro_abastecimento: 10, litros: 8, valor_total: 50, data_abastecimento: '2026-09-30' });
  await frotasService.createAbastecimento(db, ADMIN, { veiculo_id: maq.id, horimetro_abastecimento: 14, litros: 10, valor_total: 60, data_abastecimento: '2026-10-01' });
  await frotasService.createMulta(db, ADMIN, { veiculo_id: maq.id, data_infracao: '2026-10-02', valor: 70 });
  await frotasService.createMulta(db, ADMIN, { veiculo_id: maq.id, data_infracao: '2026-09-02', valor: 1 });
  const periodo = { data_inicio: '2026-10-01' };
  const consumo = await frotasService.relatorioConsumo(db, periodo);
  assert.deepStrictEqual(consumo.map((c) => [c.placa, c.abastecimentos, c.consumo_litros_hora, c.total_gasto]), [['SRV0002', 1, 2.5, 60]]);
  const custos = await frotasService.relatorioCustosPorVeiculo(db, periodo);
  assert.deepStrictEqual(custos.map((c) => [c.placa, c.custo_combustivel, c.custo_multas, c.tipo_medicao, c.horimetro_atual]),
    [['SRV0002', 60, 70, 'horimetro', 14]]);
  const { buffer } = await exportarPlanilha(db, periodo);
  const p = abas(buffer);
  conferirReconciliacao(custos, consumo, p);
  assert.deepStrictEqual(linhasComo(p.Abastecimentos).map((l) => l['Consumo L/h']), [2.5]);
});

(async () => {
  console.log('\nFrota Etapa 4 — T3 (integracao dos relatorios)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.stack || e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
