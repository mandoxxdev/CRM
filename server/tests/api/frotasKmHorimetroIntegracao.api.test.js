/**
 * Frota Etapa 3 — T4: integracao que cruza portal, telas do gestor, km/L e planilha (A8, A10).
 *
 *   (a) PELA ROTA — maquina por horimetro: saida -> abastecimento -> retorno (portal) -> o gestor corrige o abastecimento -> a planilha
 *       traz as horas nas colunas novas, o km da maquina nao anda e o km/L nao conta a maquina. Carro por km: abastecimento -> um
 *       retroativo abaixo do atual leva 409 -> confirmado entra na conta do km/L pela ordem do km (RN-F1.11) e o vizinho e refeito.
 *   (b) PELO SERVICO — portalService direto: o mesmo 409 (com code) e a mesma confirmacao.
 *
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa3-km-e-horimetro.md
 * Executar: cd server && node tests/api/frotasKmHorimetroIntegracao.api.test.js
 */
const assert = require('assert');
const XLSX = require('xlsx');
const { createFrotasTestApp, ADMIN, MOTORISTA, MOTORISTA2 } = require('../helpers/frotasTestApp');
const portalService = require('../../services/frotas/portalService');
const frotasService = require('../../services/frotas/frotasService');
const { exportarPlanilha } = require('../../services/frotas/exportacaoService');
const { dbGet } = require('../../services/frotas/db');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

const CHAVES = ['pneus_estepe', 'farois_lanternas', 'setas_luz_freio', 'parabrisa_vidros', 'espelhos_retrovisores',
  'limpadores_agua', 'oleo_motor', 'arrefecimento', 'freios', 'buzina_cintos', 'documentos_equipamentos', 'carroceria_carga'];
const todosOk = () => Object.fromEntries(CHAVES.map((k) => [k, 'OK']));

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
/** linha da aba como objeto {cabecalho: valor} — a coluna nova e lida pelo NOME, nao pela posicao */
function linhasComo(aba) {
  const [cab, ...resto] = aba;
  return resto.map((l) => Object.fromEntries(cab.map((c, i) => [c, l[i]])));
}

test('(a) pela rota: maquina por horimetro do portal ao gestor e a planilha; carro com o retroativo confirmado e o km/L', async () => {
  const ctx = await createFrotasTestApp();
  const gestor = ctx.como(ADMIN);
  const ana = ctx.como(MOTORISTA);
  const maq = (await gestor('post', '/api/frotas/veiculos', { placa: 'EMP0001', tipo_medicao: 'horimetro', horimetro_atual: 90, km_atual: 0 })).body;
  const car = (await gestor('post', '/api/frotas/veiculos', { placa: 'CAR0001', km_atual: 5000 })).body;
  assert((await gestor('post', '/api/frotas/motoristas', { nome: 'Ana Motorista', usuario_id: MOTORISTA.id })).status === 201);

  // a tela do motorista sabe a regua e o ultimo registrado
  const ini = await ana('get', '/api/frotas/portal/inicio');
  const vm = ini.body.veiculos.find((v) => v.id === maq.id);
  assert.deepStrictEqual([vm.tipo_medicao, vm.horimetro_atual], ['horimetro', 90]);

  // maquina: saida -> abastecimento no meio -> retorno
  const s = await ana('post', '/api/frotas/portal/registros', {
    tipo: 'saida', veiculo_id: maq.id, horimetro: 100, data: '2026-10-22', horario: '07:00', itens: todosOk(),
  });
  assert.strictEqual(s.status, 201, JSON.stringify(s.body));
  const ab = await ana('post', '/api/frotas/portal/abastecimentos', { veiculo_id: maq.id, horimetro: 103, litros: 30, data: '2026-10-22' });
  assert.strictEqual(ab.status, 201, JSON.stringify(ab.body));
  const retMenor = await ana('post', '/api/frotas/portal/registros', { tipo: 'retorno', horimetro: 102, data: '2026-10-22', horario: '15:00', itens: todosOk() });
  assert.deepStrictEqual([retMenor.status, retMenor.body.code], [409, 'HORIMETRO_MENOR_QUE_ATUAL'], 'o abastecimento no meio subiu o horimetro');
  const ret = await ana('post', '/api/frotas/portal/registros', { tipo: 'retorno', horimetro: 108, data: '2026-10-22', horario: '15:00', itens: todosOk() });
  assert.strictEqual(ret.status, 201, JSON.stringify(ret.body));

  // o gestor corrige a leitura do abastecimento (RN-F3.15) — continua fora do km/L
  const corr = await gestor('put', `/api/frotas/abastecimentos/${ab.body.id}`, { ...ab.body, km_abastecimento: null, horimetro_abastecimento: 104 });
  assert.strictEqual(corr.status, 200, JSON.stringify(corr.body));
  assert.deepStrictEqual([corr.body.horimetro_abastecimento, corr.body.km_abastecimento, corr.body.consumo_medio], [104, null, null]);

  // carro: abastecimento em 5100, depois um retroativo em 5050 (409 -> confirmado)
  const a1 = await ana('post', '/api/frotas/portal/abastecimentos', { veiculo_id: car.id, km: 5100, litros: 10, data: '2026-10-22' });
  assert.strictEqual(a1.status, 201, JSON.stringify(a1.body));
  const corpo = { veiculo_id: car.id, km: 5050, litros: 5, data: '2026-10-21' };
  const recusa = await ana('post', '/api/frotas/portal/abastecimentos', corpo);
  assert.deepStrictEqual(recusa.body, { error: 'KM menor que o atual do veículo (5.100 km). Confira o hodômetro antes de salvar.', code: 'KM_MENOR_QUE_ATUAL' });
  const a0 = await ana('post', '/api/frotas/portal/abastecimentos', { ...corpo, confirmar_km_menor: true });
  assert.strictEqual(a0.status, 201, JSON.stringify(a0.body));
  // RN-F1.11: o retroativo nao tem anterior; o de 5100 passa a contar dele: (5100 - 5050) / 10 = 5
  assert.strictEqual(a0.body.consumo_medio, null);
  const a1depois = await dbGet(ctx.db, 'SELECT km_desde_anterior, consumo_medio FROM frotas_abastecimentos WHERE id = ?', [a1.body.id]);
  assert.deepStrictEqual(a1depois, { km_desde_anterior: 50, consumo_medio: 5 });

  // os veiculos: maquina so em horas; carro no maior km
  const vMaq = await dbGet(ctx.db, 'SELECT km_atual, horimetro_atual FROM frotas_veiculos WHERE id = ?', [maq.id]);
  assert.deepStrictEqual(vMaq, { km_atual: 0, horimetro_atual: 108 });
  assert.strictEqual((await dbGet(ctx.db, 'SELECT km_atual FROM frotas_veiculos WHERE id = ?', [car.id])).km_atual, 5100);

  // meus registros traz as horas
  const meus = await ana('get', '/api/frotas/portal/meus-registros');
  assert(meus.body.registros.some((r) => r.horimetro === 108 && r.km == null), 'retorno em horas nos meus registros');

  // a planilha do gestor
  const x = await ctx.como(ADMIN)('get', '/api/frotas/exportar.xlsx').buffer(true).parse(binario);
  assert.strictEqual(x.status, 200);
  const p = abas(x.body);
  const cad = linhasComo(p['Cadastro Frota']).find((l) => l.Placa === 'EMP0001');
  assert.deepStrictEqual([cad['KM Atual'], cad['Horímetro Atual']], [0, 108]);
  const vi = linhasComo(p['Viagens e KM']).find((l) => l['Veículo'] === 'EMP0001');
  assert.deepStrictEqual([vi['KM Inicial'], vi['KM Final'], vi['KM Percorrido'], vi['Horímetro Inicial'], vi['Horímetro Final']], ['', '', '', 100, 108]);
  const ck = linhasComo(p.Checklist).filter((l) => l['Veículo'] === 'EMP0001');
  assert.deepStrictEqual(ck.map((l) => [l.Tipo, l.KM, l['Horímetro']]), [['Saída', '', 100], ['Retorno', '', 108]]);
  const abs = linhasComo(p.Abastecimentos);
  const abMaq = abs.find((l) => l['Veículo'] === 'EMP0001');
  assert.deepStrictEqual([abMaq.KM, abMaq['Consumo km/L'], abMaq['Horímetro']], ['', '', 104]);
  const abCar = abs.filter((l) => l['Veículo'] === 'CAR0001').map((l) => [l.KM, l['Consumo km/L'], l['Horímetro']]);
  assert.deepStrictEqual(abCar, [[5050, '', ''], [5100, 5, '']]);
});

test('(b) pelo servico: portalService direto da o mesmo 409 com code e a mesma confirmacao', async () => {
  const ctx = await createFrotasTestApp();
  const { db } = ctx;
  const car = await frotasService.createVeiculo(db, { placa: 'SRV0001', km_atual: 800 });
  const maq = await frotasService.createVeiculo(db, { placa: 'SRV0002', tipo_medicao: 'horimetro', horimetro_atual: 40 });
  await frotasService.createMotorista(db, { nome: 'Bruno Motorista', usuario_id: MOTORISTA2.id });
  await assert.rejects(portalService.registrar(db, MOTORISTA2, { tipo: 'inspecao', veiculo_id: car.id, km: 700, itens: todosOk() }),
    (e) => e.status === 409 && e.code === 'KM_MENOR_QUE_ATUAL' && e.message === 'KM menor que o atual do veículo (800 km). Confira o hodômetro antes de salvar.');
  await assert.rejects(portalService.registrarAbastecimento(db, MOTORISTA2, { veiculo_id: maq.id, horimetro: 39.5, litros: 3 }),
    (e) => e.status === 409 && e.code === 'HORIMETRO_MENOR_QUE_ATUAL');
  const ok = await portalService.registrarAbastecimento(db, MOTORISTA2, { veiculo_id: maq.id, horimetro: 39.5, litros: 3, confirmar_km_menor: true });
  assert.deepStrictEqual([ok.horimetro_abastecimento, ok.km_abastecimento], [39.5, null]);
  const reg = await portalService.registrar(db, MOTORISTA2, { tipo: 'inspecao', veiculo_id: car.id, km: 700, itens: todosOk(), confirmar_km_menor: true });
  assert.strictEqual(reg.registro.km, 700);
  // a mesma planilha pelo servico
  const { buffer } = await exportarPlanilha(db, {});
  const p = abas(buffer);
  assert.deepStrictEqual(linhasComo(p.Abastecimentos).map((l) => [l['Veículo'], l.KM, l['Horímetro']]), [['SRV0002', '', 39.5]]);
  assert.strictEqual(linhasComo(p['Cadastro Frota']).find((l) => l.Placa === 'SRV0002')['Horímetro Atual'], 40);
});

(async () => {
  console.log('\nFrota Etapa 3 — T4 (integracao km e horimetro)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.stack || e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
