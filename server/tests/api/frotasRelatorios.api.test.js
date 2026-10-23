/**
 * Frota Etapa 4 — T1: relatorios fechados (A7, a maquina no relatorio, aba de multas).
 *
 *   RN-F4.01  custo por veiculo: multas pelo periodo pela data da infracao; sem ela, pelo dia (de Brasilia) do lancamento
 *   RN-F4.02  multa contestada nao soma no custo (a regua do painel)
 *   RN-F4.03  periodo com uma data so (os dois relatorios e a planilha)
 *   RN-F4.04  custo devolve tipo_medicao e horimetro_atual
 *   RN-F4.05  litros por hora pela ordem do horimetro (anterior EM HORAS), calculado na leitura; editar/excluir refaz o vizinho
 *   RN-F4.06  linha com km e horimetro tem km/L e L/h
 *   RN-F4.07  relatorio de consumo: uma linha por veiculo com abastecimento no periodo, totais de todas as linhas, ordem por placa
 *   RN-F4.08  o L/h nao depende do filtro (anterior fora do periodo / de outro motorista)
 *   RN-F4.09  GET /abastecimentos traz horas_desde_anterior e consumo_litros_hora
 *   RN-F4.10  planilha: aba Multas no fim, filtrada pelo periodo
 *   RN-F4.11  planilha: aba Abastecimentos com Horas desde Abastec. Anterior e Consumo L/h no fim
 *   RN-F4.14  os dois relatorios contam so veiculos ativos
 *   RN-F4.13  perfis: relatorios para ADMIN_FROTA e CONSULTA; MOTORISTA 403
 *
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa4-relatorios.md
 * Executar: cd server && node tests/api/frotasRelatorios.api.test.js
 */
const assert = require('assert');
const XLSX = require('xlsx');
const { createFrotasTestApp, ADMIN, MOTORISTA, CONSULTA, MOTORISTA2 } = require('../helpers/frotasTestApp');
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
async function planilha(gestor, qs = '') {
  const r = await gestor('get', `/api/frotas/exportar.xlsx${qs}`).buffer(true).parse(binario);
  assert.strictEqual(r.status, 200);
  const wb = XLSX.read(r.body, { type: 'buffer' });
  const out = {};
  for (const n of wb.SheetNames) out[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' });
  return { nomes: wb.SheetNames, out };
}
function linhasComo(aba) {
  const [cab, ...resto] = aba;
  return resto.map((l) => Object.fromEntries(cab.map((c, i) => [c, l[i]])));
}
const custoDe = (lista, placa) => lista.find((r) => r.placa === placa);

async function montar() {
  const ctx = await createFrotasTestApp();
  const gestor = ctx.como(ADMIN);
  const car = (await gestor('post', '/api/frotas/veiculos', { placa: 'CAR0001', km_atual: 1000 })).body;
  const maq = (await gestor('post', '/api/frotas/veiculos', { placa: 'EMP0001', tipo_medicao: 'horimetro', horimetro_atual: 100 })).body;
  return { ctx, gestor, car, maq };
}

// ── RN-F4.01 / 02 / 03 — multas no periodo ───────────────────────────────────

test('RN-F4.01 multas pela data da infracao; sem ela, pelo dia de Brasilia do lancamento', async () => {
  const { ctx, gestor, car } = await montar();
  const nova = async (corpo) => (await gestor('post', '/api/frotas/multas', { veiculo_id: car.id, ...corpo })).body;
  await nova({ data_infracao: '2025-03-10', valor: 100 });
  await nova({ data_infracao: '2026-10-05', valor: 200 });
  const semDataOut = await nova({ valor: 50 });
  const semDataVirada = await nova({ valor: 7 });
  const semDataSet = await nova({ valor: 3, data_infracao: '' });
  // lancada em 10/10 ao meio-dia (UTC) — dia 10/10 em Brasilia
  await dbRun(ctx.db, 'UPDATE frotas_multas SET created_at = ? WHERE id = ?', ['2026-10-10 12:00:00', semDataOut.id]);
  // 01/10 02:00 UTC = 30/09 23:00 em Brasilia: fica FORA de outubro
  await dbRun(ctx.db, 'UPDATE frotas_multas SET created_at = ? WHERE id = ?', ['2026-10-01 02:00:00', semDataVirada.id]);
  // data_infracao gravada vazia ('' — o PUT da tela grava assim) conta como sem data
  await dbRun(ctx.db, "UPDATE frotas_multas SET data_infracao = '', created_at = ? WHERE id = ?", ['2026-10-20 15:00:00', semDataSet.id]);

  const out = await gestor('get', '/api/frotas/relatorios/custos-por-veiculo?data_inicio=2026-10-01&data_fim=2026-10-31');
  assert.strictEqual(out.status, 200);
  assert.strictEqual(custoDe(out.body, 'CAR0001').custo_multas, 253, 'outubro: 200 + 50 + 3 (a de 30/09 em Brasilia fica fora)');
  const set = await gestor('get', '/api/frotas/relatorios/custos-por-veiculo?data_inicio=2026-09-01&data_fim=2026-09-30');
  assert.strictEqual(custoDe(set.body, 'CAR0001').custo_multas, 7, 'setembro: so a lancada em 30/09 de Brasilia');
  const tudo = await gestor('get', '/api/frotas/relatorios/custos-por-veiculo');
  assert.strictEqual(custoDe(tudo.body, 'CAR0001').custo_multas, 360, 'sem periodo: todas');
  assert.strictEqual(custoDe(tudo.body, 'CAR0001').custo_total, 360);
});

test('RN-F4.02 multa contestada nao soma no custo (com e sem periodo)', async () => {
  const { gestor, car } = await montar();
  await gestor('post', '/api/frotas/multas', { veiculo_id: car.id, data_infracao: '2026-10-05', valor: 200, status_pagamento: 'pago' });
  await gestor('post', '/api/frotas/multas', { veiculo_id: car.id, data_infracao: '2026-10-06', valor: 500, status_pagamento: 'contestado' });
  await gestor('post', '/api/frotas/multas', { veiculo_id: car.id, data_infracao: '2026-10-07', valor: 30 });
  const tudo = await gestor('get', '/api/frotas/relatorios/custos-por-veiculo');
  assert.strictEqual(custoDe(tudo.body, 'CAR0001').custo_multas, 230);
  const out = await gestor('get', '/api/frotas/relatorios/custos-por-veiculo?data_inicio=2026-10-01&data_fim=2026-10-31');
  assert.strictEqual(custoDe(out.body, 'CAR0001').custo_multas, 230);
});

test('RN-F4.03 periodo com uma data so: manutencao, combustivel e multas no custo', async () => {
  const { gestor, car } = await montar();
  await gestor('post', '/api/frotas/manutencoes', { veiculo_id: car.id, descricao: 'set', custo: 10, data_manutencao: '2026-09-15', status: 'concluida' });
  await gestor('post', '/api/frotas/manutencoes', { veiculo_id: car.id, descricao: 'out', custo: 20, data_manutencao: '2026-10-15', status: 'concluida' });
  await gestor('post', '/api/frotas/abastecimentos', { veiculo_id: car.id, litros: 10, valor_total: 100, data_abastecimento: '2026-09-20' });
  await gestor('post', '/api/frotas/abastecimentos', { veiculo_id: car.id, litros: 10, valor_total: 300, data_abastecimento: '2026-10-02' });
  await gestor('post', '/api/frotas/multas', { veiculo_id: car.id, data_infracao: '2026-09-21', valor: 1000 });
  await gestor('post', '/api/frotas/multas', { veiculo_id: car.id, data_infracao: '2026-10-03', valor: 3000 });

  const desde = custoDe((await gestor('get', '/api/frotas/relatorios/custos-por-veiculo?data_inicio=2026-10-01')).body, 'CAR0001');
  assert.deepStrictEqual([desde.custo_manutencao, desde.custo_combustivel, desde.custo_multas, desde.custo_total], [20, 300, 3000, 3320]);
  const ate = custoDe((await gestor('get', '/api/frotas/relatorios/custos-por-veiculo?data_fim=2026-09-30')).body, 'CAR0001');
  assert.deepStrictEqual([ate.custo_manutencao, ate.custo_combustivel, ate.custo_multas, ate.custo_total], [10, 100, 1000, 1110]);
  // o dia do fim entra inteiro (data com hora)
  await gestor('post', '/api/frotas/manutencoes', { veiculo_id: car.id, descricao: 'hora', custo: 5, data_manutencao: '2026-09-30T18:00', status: 'concluida' });
  const ate2 = custoDe((await gestor('get', '/api/frotas/relatorios/custos-por-veiculo?data_fim=2026-09-30')).body, 'CAR0001');
  assert.strictEqual(ate2.custo_manutencao, 15);
  // e o consumo tambem
  const consDesde = (await gestor('get', '/api/frotas/relatorios/consumo?data_inicio=2026-10-01')).body;
  assert.deepStrictEqual(consDesde.map((r) => [r.placa, r.abastecimentos, r.total_gasto]), [['CAR0001', 1, 300]]);
  const consAte = (await gestor('get', '/api/frotas/relatorios/consumo?data_fim=2026-09-30')).body;
  assert.deepStrictEqual(consAte.map((r) => [r.placa, r.abastecimentos, r.total_gasto]), [['CAR0001', 1, 100]]);
});

test('RN-F4.04 custo por veiculo traz tipo_medicao e horimetro_atual', async () => {
  const { gestor } = await montar();
  const lista = (await gestor('get', '/api/frotas/relatorios/custos-por-veiculo')).body;
  const c = custoDe(lista, 'CAR0001');
  const m = custoDe(lista, 'EMP0001');
  assert.deepStrictEqual([c.tipo_medicao, c.km_atual], ['km', 1000]);
  assert.deepStrictEqual([m.tipo_medicao, m.horimetro_atual], ['horimetro', 100]);
  assert.deepStrictEqual(lista.map((r) => r.placa), ['CAR0001', 'EMP0001']);
});

// ── RN-F4.05..09 — litros por hora ───────────────────────────────────────────

const abastecer = (gestor, corpo) => gestor('post', '/api/frotas/abastecimentos', { data_abastecimento: '2026-10-10', ...corpo });
async function lphPorId(gestor, veiculoId) {
  const r = await gestor('get', `/api/frotas/abastecimentos?veiculo_id=${veiculoId}`);
  assert.strictEqual(r.status, 200);
  return Object.fromEntries(r.body.map((a) => [a.id, [a.horas_desde_anterior, a.consumo_litros_hora]]));
}

test('RN-F4.05 L/h pelo anterior EM HORAS; retroativo, edicao e exclusao refazem o vizinho', async () => {
  const { gestor, maq } = await montar();
  const a = (await abastecer(gestor, { veiculo_id: maq.id, horimetro_abastecimento: 120, litros: 40 })).body;
  const b = (await abastecer(gestor, { veiculo_id: maq.id, horimetro_abastecimento: 130, litros: 50 })).body;
  let m = await lphPorId(gestor, maq.id);
  assert.deepStrictEqual(m[a.id], [null, null], 'o primeiro nao tem anterior');
  assert.deepStrictEqual(m[b.id], [10, 5]);
  // retroativo no meio (lancado depois, data mais nova)
  const c = (await abastecer(gestor, { veiculo_id: maq.id, horimetro_abastecimento: 125, litros: 20, data_abastecimento: '2026-10-20' })).body;
  m = await lphPorId(gestor, maq.id);
  assert.deepStrictEqual([m[c.id], m[b.id]], [[5, 4], [5, 10]]);
  // editar o do meio para cima: b passa a contar de a
  assert.strictEqual((await gestor('put', `/api/frotas/abastecimentos/${c.id}`, { horimetro_abastecimento: 140 })).status, 200);
  m = await lphPorId(gestor, maq.id);
  assert.deepStrictEqual([m[b.id], m[c.id]], [[10, 5], [10, 2]]);
  // excluir b: c conta de a
  assert.strictEqual((await gestor('delete', `/api/frotas/abastecimentos/${b.id}`)).status, 200);
  m = await lphPorId(gestor, maq.id);
  assert.deepStrictEqual(m[c.id], [20, 1]);
  // horas iguais: horas 0, L/h nulo; empate pela ordem do id
  const d = (await abastecer(gestor, { veiculo_id: maq.id, horimetro_abastecimento: 140, litros: 5 })).body;
  m = await lphPorId(gestor, maq.id);
  assert.deepStrictEqual(m[d.id], [0, null]);
  // horas quebradas: 140 -> 149.9 com 19.8 L = 9.9 h, 2 L/h (sem lixo de ponto flutuante)
  const e = (await abastecer(gestor, { veiculo_id: maq.id, horimetro_abastecimento: 149.9, litros: 19.8 })).body;
  m = await lphPorId(gestor, maq.id);
  assert.deepStrictEqual(m[e.id], [9.9, 2]);
  // arredonda o L/h em 2 casas: 10 L em 3 h = 3.33
  const f = (await abastecer(gestor, { veiculo_id: maq.id, horimetro_abastecimento: 152.9, litros: 10 })).body;
  m = await lphPorId(gestor, maq.id);
  assert.deepStrictEqual(m[f.id], [3, 3.33]);
});

test('RN-F4.05 o L/h de um veiculo nao olha o horimetro de outro; linha sem horimetro nao serve de anterior', async () => {
  const { gestor, maq } = await montar();
  const outra = (await gestor('post', '/api/frotas/veiculos', { placa: 'EMP0002', tipo_medicao: 'horimetro' })).body;
  await abastecer(gestor, { veiculo_id: outra.id, horimetro_abastecimento: 110, litros: 99 });
  const a = (await abastecer(gestor, { veiculo_id: maq.id, horimetro_abastecimento: 100, litros: 10 })).body;
  const semHoras = (await abastecer(gestor, { veiculo_id: maq.id, litros: 7 })).body;
  const b = (await abastecer(gestor, { veiculo_id: maq.id, horimetro_abastecimento: 120, litros: 10 })).body;
  const m = await lphPorId(gestor, maq.id);
  assert.deepStrictEqual(m[a.id], [null, null]);
  assert.deepStrictEqual(m[semHoras.id], [null, null]);
  assert.deepStrictEqual(m[b.id], [20, 0.5]);
});

test('RN-F4.06 linha com km e horimetro tem km/L e L/h (cada um pela sua regua)', async () => {
  const { gestor, car } = await montar();
  await abastecer(gestor, { veiculo_id: car.id, km_abastecimento: 1000, horimetro_abastecimento: 10, litros: 40 });
  const b = (await abastecer(gestor, { veiculo_id: car.id, km_abastecimento: 1400, horimetro_abastecimento: 20, litros: 40 })).body;
  const linha = (await gestor('get', `/api/frotas/abastecimentos?veiculo_id=${car.id}`)).body.find((x) => x.id === b.id);
  assert.deepStrictEqual([linha.consumo_medio, linha.km_desde_anterior, linha.horas_desde_anterior, linha.consumo_litros_hora], [10, 400, 10, 4]);
});

test('RN-F4.07 relatorio de consumo: km/L e L/h por veiculo, totais de todas as linhas, ordem por placa, filtro por veiculo', async () => {
  const { gestor, car, maq } = await montar();
  await abastecer(gestor, { veiculo_id: car.id, km_abastecimento: 1000, litros: 40, valor_total: 200 });
  await abastecer(gestor, { veiculo_id: car.id, km_abastecimento: 1400, litros: 40, valor_total: 200 });
  await abastecer(gestor, { veiculo_id: car.id, km_abastecimento: 1700, litros: 20, valor_total: 100 });
  await abastecer(gestor, { veiculo_id: maq.id, horimetro_abastecimento: 100, litros: 30, valor_total: 150 });
  await abastecer(gestor, { veiculo_id: maq.id, horimetro_abastecimento: 110, litros: 30, valor_total: 150 });
  await abastecer(gestor, { veiculo_id: maq.id, horimetro_abastecimento: 120, litros: 50, valor_total: 250 });
  const so = (await gestor('post', '/api/frotas/veiculos', { placa: 'AAA0001' })).body;
  await abastecer(gestor, { veiculo_id: so.id, litros: 5, valor_total: 25 }); // sem km nem horas: aparece com consumos nulos

  const r = await gestor('get', '/api/frotas/relatorios/consumo');
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.map((x) => x.placa), ['AAA0001', 'CAR0001', 'EMP0001']);
  const [s, c, m] = r.body;
  assert.deepStrictEqual(Object.keys(c).sort(), ['abastecimentos', 'consumo_litros_hora', 'consumo_medio', 'placa', 'tipo_medicao',
    'total_gasto', 'total_litros', 'veiculo_id'].sort());
  assert.deepStrictEqual([s.consumo_medio, s.consumo_litros_hora, s.abastecimentos, s.total_litros], [null, null, 1, 5]);
  // carro: km/L 10 e 15 -> media 12.5; totais das 3 linhas
  assert.deepStrictEqual([c.tipo_medicao, c.consumo_medio, c.consumo_litros_hora, c.abastecimentos, c.total_litros, c.total_gasto],
    ['km', 12.5, null, 3, 100, 500]);
  // maquina: L/h 3 e 5 -> media 4
  assert.deepStrictEqual([m.tipo_medicao, m.consumo_medio, m.consumo_litros_hora, m.abastecimentos, m.total_litros, m.total_gasto],
    ['horimetro', null, 4, 3, 110, 550]);
  const f = (await gestor('get', `/api/frotas/relatorios/consumo?veiculo_id=${maq.id}`)).body;
  assert.deepStrictEqual(f.map((x) => x.placa), ['EMP0001']);
  // RN-F4.14: veiculo excluido sai do consumo (como do custo)
  assert.strictEqual((await gestor('delete', `/api/frotas/veiculos/${so.id}`)).status, 200);
  assert.deepStrictEqual((await gestor('get', '/api/frotas/relatorios/consumo')).body.map((x) => x.placa), ['CAR0001', 'EMP0001']);
});

test('RN-F4.08 o L/h nao depende do filtro: anterior fora do periodo ou de outro motorista', async () => {
  const { ctx, gestor, maq } = await montar();
  const mAna = (await gestor('post', '/api/frotas/motoristas', { nome: 'Ana Motorista', usuario_id: MOTORISTA.id })).body;
  const mBruno = (await gestor('post', '/api/frotas/motoristas', { nome: 'Bruno Motorista', usuario_id: MOTORISTA2.id })).body;
  await abastecer(gestor, { veiculo_id: maq.id, horimetro_abastecimento: 100, litros: 10, data_abastecimento: '2026-09-28', motorista_id: mBruno.id });
  const b = (await abastecer(gestor, { veiculo_id: maq.id, horimetro_abastecimento: 108, litros: 24, data_abastecimento: '2026-10-02', motorista_id: mAna.id })).body;
  const out = (await gestor('get', '/api/frotas/relatorios/consumo?data_inicio=2026-10-01&data_fim=2026-10-31')).body;
  assert.deepStrictEqual(out.map((x) => [x.placa, x.abastecimentos, x.consumo_litros_hora]), [['EMP0001', 1, 3]]);
  // a Ana ve so a linha dela, com o L/h contado da linha do Bruno
  const daAna = await ctx.como(MOTORISTA)('get', '/api/frotas/abastecimentos');
  assert.strictEqual(daAna.status, 200);
  assert.deepStrictEqual(daAna.body.map((a) => [a.id, a.horas_desde_anterior, a.consumo_litros_hora]), [[b.id, 8, 3]]);
  // a busca (por posto) tambem nao corta o anterior
  await gestor('put', `/api/frotas/abastecimentos/${b.id}`, { posto: 'Posto Azul' });
  const busca = await gestor('get', '/api/frotas/abastecimentos?search=Azul');
  assert.deepStrictEqual(busca.body.map((a) => [a.id, a.consumo_litros_hora]), [[b.id, 3]]);
});

// ── RN-F4.10 / 11 — planilha ─────────────────────────────────────────────────

test('RN-F4.10 aba Multas no fim, com cabecalho, rotulos e o periodo da RN-F4.01', async () => {
  const { ctx, gestor, car } = await montar();
  const mot = (await gestor('post', '/api/frotas/motoristas', { nome: 'Ana Motorista' })).body;
  await gestor('post', '/api/frotas/multas', { veiculo_id: car.id, data_infracao: '2025-03-10', valor: 100, descricao: 'antiga' });
  await gestor('post', '/api/frotas/multas', {
    veiculo_id: car.id, motorista_id: mot.id, data_infracao: '2026-10-05', descricao: 'Velocidade', valor: 195.23, pontos: 5,
    status_pagamento: 'pago', data_vencimento: '2026-11-05', data_pagamento: '2026-10-20', numero_auto: 'AUTO-1', observacoes: 'obs',
  });
  await gestor('post', '/api/frotas/multas', { veiculo_id: car.id, data_infracao: '2026-10-04', descricao: 'Contestada', valor: 500, status_pagamento: 'contestado' });
  const semData = (await gestor('post', '/api/frotas/multas', { veiculo_id: car.id, descricao: 'Sem data', valor: 9 })).body;
  await dbRun(ctx.db, 'UPDATE frotas_multas SET created_at = ? WHERE id = ?', ['2026-10-12 12:00:00', semData.id]);

  const tudo = await planilha(gestor);
  assert.deepStrictEqual(tudo.nomes, ['Cadastro Frota', 'Viagens e KM', 'Checklist', 'Abastecimentos', 'Manutenções', 'Documentos', 'Multas']);
  assert.deepStrictEqual(tudo.out.Multas[0], ['Data', 'Veículo', 'Condutor', 'Infração', 'Valor R$', 'Pontos', 'Vencimento', 'Status',
    'Nº do Auto', 'Observações']);
  assert.strictEqual(tudo.out.Multas.length - 1, 4);

  const out = await planilha(gestor, '?data_inicio=2026-10-01&data_fim=2026-10-31');
  const linhas = linhasComo(out.out.Multas);
  assert.deepStrictEqual(linhas.map((l) => l['Infração']), ['Contestada', 'Velocidade', 'Sem data'], 'ordem pela data da regua');
  assert.deepStrictEqual(linhas[1], {
    Data: '2026-10-05', 'Veículo': 'CAR0001', Condutor: 'Ana Motorista', 'Infração': 'Velocidade', 'Valor R$': 195.23, Pontos: 5,
    Vencimento: '2026-11-05', Status: 'Pago', 'Nº do Auto': 'AUTO-1', 'Observações': 'obs',
  });
  assert.deepStrictEqual([linhas[0].Status, linhas[2].Status, linhas[2].Data], ['Contestado', 'Pendente', '']);
  const so = await planilha(gestor, '?data_fim=2025-12-31');
  assert.deepStrictEqual(linhasComo(so.out.Multas).map((l) => l['Infração']), ['antiga']);
});

test('RN-F4.11 aba Abastecimentos com Horas desde Abastec. Anterior e Consumo L/h no fim', async () => {
  const { gestor, maq, car } = await montar();
  await abastecer(gestor, { veiculo_id: maq.id, horimetro_abastecimento: 120, litros: 40, data_abastecimento: '2026-09-28' });
  await abastecer(gestor, { veiculo_id: maq.id, horimetro_abastecimento: 130, litros: 50, data_abastecimento: '2026-10-02' });
  await abastecer(gestor, { veiculo_id: car.id, km_abastecimento: 1100, litros: 10, data_abastecimento: '2026-10-03' });
  const p = await planilha(gestor, '?data_inicio=2026-10-01');
  const cab = p.out.Abastecimentos[0];
  assert.deepStrictEqual(cab.slice(-3), ['Horímetro', 'Horas desde Abastec. Anterior', 'Consumo L/h']);
  const linhas = linhasComo(p.out.Abastecimentos);
  assert.deepStrictEqual(linhas.map((l) => [l['Veículo'], l['Horímetro'], l['Horas desde Abastec. Anterior'], l['Consumo L/h']]),
    [['EMP0001', 130, 10, 5], ['CAR0001', '', '', '']]);
});

// ── Fase 5 (revisor de regras, achados reproduzidos) ─────────────────────────

test('Fase5-R1 status de multa fora da lista e recusado (a contestada nao pode escapar da regua por caixa ou espaco)', async () => {
  const { gestor, car } = await montar();
  for (const st of ['Contestado', 'contestado ', 'quitada']) {
    const r = await gestor('post', '/api/frotas/multas', { veiculo_id: car.id, data_infracao: '2026-10-06', valor: 1000, status_pagamento: st });
    assert.strictEqual(r.status, 400, st);
    assert.strictEqual(r.body.error, 'Status de pagamento inválido');
  }
  const ok = (await gestor('post', '/api/frotas/multas', { veiculo_id: car.id, data_infracao: '2026-10-06', valor: 10 })).body;
  assert.strictEqual(ok.status_pagamento, 'pendente');
  const put = await gestor('put', `/api/frotas/multas/${ok.id}`, { status_pagamento: 'CONTESTADO' });
  assert.strictEqual(put.status, 400);
  assert.strictEqual((await gestor('put', `/api/frotas/multas/${ok.id}`, { status_pagamento: 'contestado' })).status, 200);
  const custo = custoDe((await gestor('get', '/api/frotas/relatorios/custos-por-veiculo')).body, 'CAR0001');
  assert.strictEqual(custo.custo_multas, 0, 'a unica gravada esta contestada');
});

test('Fase5-R2 litros zero ou negativos sao recusados no POST e no PUT do gestor; L/h com litros 0 gravado (dado antigo) e nulo', async () => {
  const { ctx, gestor, maq } = await montar();
  const a = (await abastecer(gestor, { veiculo_id: maq.id, horimetro_abastecimento: 100, litros: 10 })).body;
  const b = (await abastecer(gestor, { veiculo_id: maq.id, horimetro_abastecimento: 110, litros: 20 })).body;
  for (const l of [-10, 0, 'abc']) {
    const r = await gestor('put', `/api/frotas/abastecimentos/${b.id}`, { litros: l });
    assert.strictEqual(r.status, 400, String(l));
    assert.strictEqual(r.body.error, 'Informe os litros');
  }
  const neg = await abastecer(gestor, { veiculo_id: maq.id, horimetro_abastecimento: 120, litros: -5 });
  assert.strictEqual(neg.status, 400);
  assert.strictEqual(neg.body.error, 'Informe os litros');
  let m = await lphPorId(gestor, maq.id);
  assert.deepStrictEqual(m[b.id], [10, 2], 'nada mudou com as recusas');
  await dbRun(ctx.db, 'UPDATE frotas_abastecimentos SET litros = 0 WHERE id = ?', [b.id]);
  m = await lphPorId(gestor, maq.id);
  assert.deepStrictEqual(m[b.id], [10, null]);
  assert.ok(a.id);
});

// ── RN-F4.13 — perfis ────────────────────────────────────────────────────────

test('RN-F4.13 relatorios: gestor e Consulta 200; motorista 403', async () => {
  const { ctx } = await montar();
  for (const url of ['/api/frotas/relatorios/custos-por-veiculo', '/api/frotas/relatorios/consumo']) {
    assert.strictEqual((await ctx.como(CONSULTA)('get', url)).status, 200, url);
    assert.strictEqual((await ctx.como(MOTORISTA)('get', url)).status, 403, url);
  }
});

(async () => {
  console.log('\nFrota Etapa 4 — T1 (relatorios fechados)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.stack || e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
