/**
 * Frota Etapa 3 — T1: km e horimetro confiaveis no portal (A8, A10) e o "Admin" maiusculo (E5).
 *
 *   RN-F3.01  km menor que o atual do veiculo -> 409 KM_MENOR_QUE_ATUAL, nada gravado (registros e abastecimento)
 *   RN-F3.02  confirmar_km_menor: true (booleano) grava; o km do veiculo nao desce
 *   RN-F3.03  a confirmacao nao passa por cima das recusas duras (RN-F1.07 do retorno)
 *   RN-F3.04  veiculo por horimetro: le `horimetro`, grava em horas (registro, viagem, abastecimento), sobe o horimetro, km intacto
 *   RN-F3.05  horimetro menor que o atual -> 409 HORIMETRO_MENOR_QUE_ATUAL (+ confirmar)
 *   RN-F3.06  retorno por horimetro menor que a saida -> 400
 *   RN-F3.08  km/horimetro do veiculo sobem por um comando so (corrida)
 *   RN-F3.09  /portal/inicio: horimetro_atual e viagem_aberta.horimetro_saida/tipo_medicao
 *   RN-F3.12  role 'Admin' (qualquer caixa) e ADMIN_FROTA
 *   RN-F3.13  as rotas do gestor nao ganham a regua
 *
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa3-km-e-horimetro.md
 * Executar: cd server && node tests/api/frotasKmHorimetro.api.test.js
 */
const assert = require('assert');
const { createFrotasTestApp, ADMIN, MOTORISTA, MOTORISTA2 } = require('../helpers/frotasTestApp');
const { dbGet, dbRun } = require('../../services/frotas/db');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

const CHAVES = ['pneus_estepe', 'farois_lanternas', 'setas_luz_freio', 'parabrisa_vidros', 'espelhos_retrovisores',
  'limpadores_agua', 'oleo_motor', 'arrefecimento', 'freios', 'buzina_cintos', 'documentos_equipamentos', 'carroceria_carga'];
const todosOk = () => Object.fromEntries(CHAVES.map((k) => [k, 'OK']));

const MSG_KM = (n) => `KM menor que o atual do veículo (${n} km). Confira o hodômetro antes de salvar.`;
const MSG_HOR = (n) => `Horímetro menor que o atual do veículo (${n} h). Confira o painel antes de salvar.`;

let ctx;
const S = {};
const ana = (m, u, c) => ctx.como(MOTORISTA)(m, u, c);
const bruno = (m, u, c) => ctx.como(MOTORISTA2)(m, u, c);
const gestor = (m, u, c) => ctx.como(ADMIN)(m, u, c);
const conta = async (sql, p = []) => (await dbGet(ctx.db, sql, p)).n;
const veic = (id) => dbGet(ctx.db, 'SELECT km_atual, horimetro_atual FROM frotas_veiculos WHERE id = ?', [id]);

async function cenario() {
  const v = async (placa, extra = {}) => {
    const r = await gestor('post', '/api/frotas/veiculos', { placa, ...extra });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  S.c1 = await v('KMH0001', { km_atual: 1800 });
  S.c2 = await v('KMH0002', { km_atual: 1800 });
  S.c3 = await v('KMH0003', { km_atual: 1000 });
  S.c4 = await v('KMH0004', { km_atual: 1234.5 });
  S.c5 = await v('KMH0005', { km_atual: 2000 });
  S.m1 = await v('MAQ0001', { tipo_medicao: 'horimetro', horimetro_atual: 120, km_atual: 0 });
  S.m2 = await v('MAQ0002', { tipo_medicao: 'horimetro', horimetro_atual: 50, km_atual: 0 });
  S.m3 = await v('MAQ0003', { tipo_medicao: 'horimetro', horimetro_atual: 0 });
  S.ma = (await gestor('post', '/api/frotas/motoristas', { nome: 'Ana Motorista', usuario_id: 2 })).body;
  S.mb = (await gestor('post', '/api/frotas/motoristas', { nome: 'Bruno Motorista', usuario_id: 4 })).body;
  assert(S.ma.id && S.mb.id);
}

// ── RN-F3.01 / RN-F3.02 ─────────────────────────────────────────────────────
test('RN-F3.01 inspecao com km menor que o atual -> 409 literal, nada gravado; igual ao atual passa', async () => {
  const antes = await conta('SELECT COUNT(*) n FROM frotas_checklists WHERE veiculo_id = ?', [S.c1.id]);
  const r = await ana('post', '/api/frotas/portal/registros', { tipo: 'inspecao', veiculo_id: S.c1.id, km: 900, itens: todosOk() });
  assert.strictEqual(r.status, 409, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body, { error: MSG_KM('1.800'), code: 'KM_MENOR_QUE_ATUAL' });
  assert.strictEqual(await conta('SELECT COUNT(*) n FROM frotas_checklists WHERE veiculo_id = ?', [S.c1.id]), antes, 'nada gravado');
  const igual = await ana('post', '/api/frotas/portal/registros', { tipo: 'inspecao', veiculo_id: S.c1.id, km: 1800, itens: todosOk() });
  assert.strictEqual(igual.status, 201, JSON.stringify(igual.body));
});

test('RN-F3.01 abastecimento do portal com km menor -> 409, nenhum abastecimento gravado', async () => {
  const antes = await conta('SELECT COUNT(*) n FROM frotas_abastecimentos');
  const r = await ana('post', '/api/frotas/portal/abastecimentos', { veiculo_id: S.c1.id, km: 900, litros: 30 });
  assert.strictEqual(r.status, 409, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body, { error: MSG_KM('1.800'), code: 'KM_MENOR_QUE_ATUAL' });
  assert.strictEqual(await conta('SELECT COUNT(*) n FROM frotas_abastecimentos'), antes);
});

test('RN-F3.02 confirmar_km_menor: true grava; o km do veiculo nao desce; "true" e 1 nao confirmam', async () => {
  for (const torto of ['true', 1, 'sim']) {
    const r = await ana('post', '/api/frotas/portal/abastecimentos', { veiculo_id: S.c1.id, km: 900, litros: 30, confirmar_km_menor: torto });
    assert.strictEqual(r.status, 409, `confirmar ${JSON.stringify(torto)} -> ${r.status}`);
  }
  const ok = await ana('post', '/api/frotas/portal/abastecimentos', { veiculo_id: S.c1.id, km: 900, litros: 30, confirmar_km_menor: true });
  assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  assert.strictEqual(ok.body.km_abastecimento, 900);
  assert.strictEqual((await veic(S.c1.id)).km_atual, 1800, 'o km do veiculo nao desce');
  const reg = await ana('post', '/api/frotas/portal/registros', {
    tipo: 'inspecao', veiculo_id: S.c1.id, km: 1700, itens: todosOk(), confirmar_km_menor: true,
  });
  assert.strictEqual(reg.status, 201, JSON.stringify(reg.body));
  assert.strictEqual(reg.body.registro.km, 1700);
});

test('RN-F3.01 numero no formato brasileiro (1.234,5)', async () => {
  const r = await ana('post', '/api/frotas/portal/registros', { tipo: 'inspecao', veiculo_id: S.c4.id, km: 1000, itens: todosOk() });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.body.error, MSG_KM('1.234,5'));
});

test('RN-F3.01 saida com km menor -> 409 e nenhuma viagem aberta; confirmada abre', async () => {
  const r = await ana('post', '/api/frotas/portal/registros', { tipo: 'saida', veiculo_id: S.c2.id, km: 1500, itens: todosOk() });
  assert.strictEqual(r.status, 409, JSON.stringify(r.body));
  assert.strictEqual(r.body.code, 'KM_MENOR_QUE_ATUAL');
  assert.strictEqual(await conta("SELECT COUNT(*) n FROM frotas_viagens WHERE veiculo_id = ?", [S.c2.id]), 0, 'nenhuma viagem');
  const ok = await ana('post', '/api/frotas/portal/registros', {
    tipo: 'saida', veiculo_id: S.c2.id, km: 1500, itens: todosOk(), confirmar_km_menor: true,
  });
  assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  assert.strictEqual(ok.body.viagem.km_saida, 1500);
  assert.strictEqual(ok.body.viagem.status, 'em_andamento');
});

test('RN-F3.03 retorno: RN-F1.07 (menor que a saida) e dura mesmo confirmado; menor que o atual pede confirmacao', async () => {
  // Ana saiu com o c2 em 1500 (cenario anterior); o veiculo esta em 1800. Abastece no meio da viagem em 1900.
  const ab = await ana('post', '/api/frotas/portal/abastecimentos', { veiculo_id: S.c2.id, km: 1900, litros: 20 });
  assert.strictEqual(ab.status, 201, JSON.stringify(ab.body));
  const dura = await ana('post', '/api/frotas/portal/registros', { tipo: 'retorno', km: 1400, itens: todosOk(), confirmar_km_menor: true });
  assert.strictEqual(dura.status, 400, JSON.stringify(dura.body));
  assert.strictEqual(dura.body.error, 'KM do retorno (1400) menor que o KM da saída (1500). Confira o hodômetro.');
  const menor = await ana('post', '/api/frotas/portal/registros', { tipo: 'retorno', km: 1850, itens: todosOk() });
  assert.strictEqual(menor.status, 409, JSON.stringify(menor.body));
  assert.deepStrictEqual(menor.body, { error: MSG_KM('1.900'), code: 'KM_MENOR_QUE_ATUAL' });
  assert.strictEqual(await conta("SELECT COUNT(*) n FROM frotas_viagens WHERE veiculo_id = ? AND status = 'em_andamento'", [S.c2.id]), 1,
    'a viagem continua aberta');
  const ok = await ana('post', '/api/frotas/portal/registros', { tipo: 'retorno', km: 1950, itens: todosOk() });
  assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  assert.strictEqual(ok.body.viagem.km_rodado, 450);
});

// ── RN-F3.04 .. RN-F3.06 (horimetro) ────────────────────────────────────────
test('RN-F3.04 maquina por horimetro: le `horimetro`; so `km` -> 400 literal', async () => {
  const r = await ana('post', '/api/frotas/portal/registros', { tipo: 'inspecao', veiculo_id: S.m1.id, km: 125, itens: todosOk() });
  assert.strictEqual(r.status, 400, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body, { error: 'Informe o horímetro atual' });
  for (const torto of [-1, 'abc', '', null, true]) {
    const t = await ana('post', '/api/frotas/portal/registros', { tipo: 'inspecao', veiculo_id: S.m1.id, horimetro: torto, itens: todosOk() });
    assert.strictEqual(t.body.error, 'Informe o horímetro atual', `horimetro ${JSON.stringify(torto)}`);
  }
  const a = await ana('post', '/api/frotas/portal/abastecimentos', { veiculo_id: S.m1.id, km: 125, litros: 10 });
  assert.deepStrictEqual([a.status, a.body.error], [400, 'Informe o horímetro atual']);
});

test('RN-F3.04 inspecao por horimetro grava em horas; o horimetro sobe e o km nao muda', async () => {
  const r = await ana('post', '/api/frotas/portal/registros', {
    tipo: 'inspecao', veiculo_id: S.m1.id, horimetro: '125', km: 99999, itens: todosOk(),
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  assert.strictEqual(r.body.registro.horimetro, 125);
  assert.strictEqual(r.body.registro.km, null);
  assert.deepStrictEqual(await veic(S.m1.id), { km_atual: 0, horimetro_atual: 125 });
});

test('RN-F3.05 horimetro menor que o atual -> 409 literal; confirmado grava e o horimetro nao desce', async () => {
  const r = await ana('post', '/api/frotas/portal/registros', { tipo: 'inspecao', veiculo_id: S.m1.id, horimetro: 110, itens: todosOk() });
  assert.strictEqual(r.status, 409, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body, { error: MSG_HOR('125'), code: 'HORIMETRO_MENOR_QUE_ATUAL' });
  const ok = await ana('post', '/api/frotas/portal/registros', {
    tipo: 'inspecao', veiculo_id: S.m1.id, horimetro: 110, itens: todosOk(), confirmar_km_menor: true,
  });
  assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  assert.strictEqual((await veic(S.m1.id)).horimetro_atual, 125);
});

test('RN-F3.04 abastecimento por horimetro: horas fora do km/L; nada no km', async () => {
  const r = await ana('post', '/api/frotas/portal/abastecimentos', { veiculo_id: S.m1.id, horimetro: 130.5, litros: 40 });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  assert.strictEqual(r.body.horimetro_abastecimento, 130.5);
  assert.strictEqual(r.body.km_abastecimento, null);
  assert.strictEqual(r.body.consumo_medio, null);
  assert.strictEqual(r.body.km_desde_anterior, null);
  assert.deepStrictEqual(await veic(S.m1.id), { km_atual: 0, horimetro_atual: 130.5 });
  const menor = await ana('post', '/api/frotas/portal/abastecimentos', { veiculo_id: S.m1.id, horimetro: 100, litros: 40 });
  assert.deepStrictEqual(menor.body, { error: MSG_HOR('130,5'), code: 'HORIMETRO_MENOR_QUE_ATUAL' });
});

test('RN-F3.04/06 saida e retorno por horimetro: viagem em horas; retorno menor que a saida -> 400 (dura)', async () => {
  const s = await bruno('post', '/api/frotas/portal/registros', { tipo: 'saida', veiculo_id: S.m2.id, horimetro: 55, itens: todosOk() });
  assert.strictEqual(s.status, 201, JSON.stringify(s.body));
  assert.strictEqual(s.body.viagem.horimetro_saida, 55);
  assert.strictEqual(s.body.viagem.km_saida, null);
  assert.strictEqual(s.body.registro.horimetro, 55);
  const ini = await bruno('get', '/api/frotas/portal/inicio');
  assert.strictEqual(ini.body.viagem_aberta.horimetro_saida, 55, 'RN-F3.09');
  assert.strictEqual(ini.body.viagem_aberta.tipo_medicao, 'horimetro', 'RN-F3.09');
  const dura = await bruno('post', '/api/frotas/portal/registros', { tipo: 'retorno', horimetro: 54, itens: todosOk(), confirmar_km_menor: true });
  assert.strictEqual(dura.status, 400, JSON.stringify(dura.body));
  assert.deepStrictEqual(dura.body, { error: 'Horímetro do retorno (54 h) menor que o da saída (55 h). Confira o painel.' });
  const ok = await bruno('post', '/api/frotas/portal/registros', { tipo: 'retorno', horimetro: 58.25, km: 5000, itens: todosOk() });
  assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  assert.strictEqual(ok.body.viagem.horimetro_retorno, 58.25);
  assert.strictEqual(ok.body.viagem.km_retorno, null);
  assert.strictEqual(ok.body.viagem.km_rodado, null);
  assert.strictEqual(ok.body.viagem.status, 'concluida');
  assert.deepStrictEqual(await veic(S.m2.id), { km_atual: 0, horimetro_atual: 58.25 });
});

test('RN-F3.09 /portal/inicio traz horimetro_atual em cada veiculo', async () => {
  const r = await ana('get', '/api/frotas/portal/inicio');
  const m1 = r.body.veiculos.find((x) => x.id === S.m1.id);
  assert.strictEqual(m1.horimetro_atual, 130.5);
  assert.strictEqual(m1.tipo_medicao, 'horimetro');
  const c1 = r.body.veiculos.find((x) => x.id === S.c1.id);
  assert.strictEqual(c1.km_atual, 1800);
});

// ── RN-F3.08 corrida ────────────────────────────────────────────────────────
test('RN-F3.08 8 abastecimentos simultaneos (gestor) com km diferentes -> o veiculo fica com o maior', async () => {
  const kms = [2003, 2008, 2001, 2006, 2002, 2007, 2004, 2005];
  const rs = await Promise.all(kms.map((km) => gestor('post', '/api/frotas/abastecimentos', {
    veiculo_id: S.c5.id, litros: 10, data_abastecimento: '2026-10-20', km_abastecimento: km,
  })));
  rs.forEach((r) => assert.strictEqual(r.status, 201, JSON.stringify(r.body)));
  assert.strictEqual((await veic(S.c5.id)).km_atual, 2008);
});

test('RN-F3.08 horimetro simultaneo pelo portal (confirmado) -> o maior', async () => {
  const hs = [3, 8, 1, 6, 2, 7, 4, 5];
  const rs = await Promise.all(hs.map((h, i) => (i % 2 ? ana : bruno)('post', '/api/frotas/portal/abastecimentos', {
    veiculo_id: S.m3.id, horimetro: h, litros: 5, confirmar_km_menor: true,
  })));
  rs.forEach((r) => assert.strictEqual(r.status, 201, JSON.stringify(r.body)));
  assert.strictEqual((await veic(S.m3.id)).horimetro_atual, 8);
});

// ── RN-F3.13 gestor sem a regua ─────────────────────────────────────────────
test('RN-F3.13 o gestor lanca km menor que o atual sem 409 (lancamento atrasado)', async () => {
  const r = await gestor('post', '/api/frotas/abastecimentos', {
    veiculo_id: S.c3.id, litros: 10, data_abastecimento: '2026-10-01', km_abastecimento: 500,
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  assert.strictEqual((await veic(S.c3.id)).km_atual, 1000);
});

// ── RN-F3.12 (E5) ───────────────────────────────────────────────────────────
test("RN-F3.12 role 'Admin' (maiuscula) e ADMIN_FROTA no servidor, como na tela; 'usuario' segue MOTORISTA", async () => {
  const { getPerfilFromUser } = require('../../services/frotas/permissions');
  assert.strictEqual(getPerfilFromUser({ id: 50, role: 'Admin' }), 'ADMIN_FROTA');
  assert.strictEqual(getPerfilFromUser({ id: 50, role: 'ADMIN' }), 'ADMIN_FROTA');
  assert.strictEqual(getPerfilFromUser({ id: 50, role: 'usuario' }), 'MOTORISTA', 'metade positiva: nao vira admin quem nao e');
  const r = await ctx.como({ id: 50, nome: 'Admin Maiusculo', role: 'Admin' })('get', '/api/frotas/dashboard');
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const m = await ctx.como({ id: 51, nome: 'Usuario', role: 'usuario' })('get', '/api/frotas/dashboard');
  assert.strictEqual(m.status, 403);
});

// ── Ajustes da Fase 2 ───────────────────────────────────────────────────────
test('RN-F3.08 (T-3) duas subidas no mesmo tique pelo servico: fica a maior (ler-e-gravar deixava a menor)', async () => {
  const fs = require('../../services/frotas/frotasService');
  await dbRun(ctx.db, 'UPDATE frotas_veiculos SET km_atual = 100, horimetro_atual = 10 WHERE id = ?', [S.c3.id]);
  await Promise.all([fs.updateKmVeiculoSeMaior(ctx.db, S.c3.id, 900), fs.updateKmVeiculoSeMaior(ctx.db, S.c3.id, 300)]);
  await Promise.all([fs.updateHorimetroVeiculoSeMaior(ctx.db, S.c3.id, 90), fs.updateHorimetroVeiculoSeMaior(ctx.db, S.c3.id, 30)]);
  assert.deepStrictEqual(await veic(S.c3.id), { km_atual: 900, horimetro_atual: 90 });
  await dbRun(ctx.db, 'UPDATE frotas_veiculos SET km_atual = 1000, horimetro_atual = 0 WHERE id = ?', [S.c3.id]);
});

test('RN-F3.07 (T-2) o retorno segue a regua com que a viagem abriu, nao a medicao de hoje do veiculo', async () => {
  const v = (await gestor('post', '/api/frotas/veiculos', { placa: 'TRC0001', km_atual: 300 })).body;
  const s = await ana('post', '/api/frotas/portal/registros', { tipo: 'saida', veiculo_id: v.id, km: 310, itens: todosOk() });
  assert.strictEqual(s.status, 201, JSON.stringify(s.body));
  await dbRun(ctx.db, "UPDATE frotas_veiculos SET tipo_medicao = 'horimetro' WHERE id = ?", [v.id]); // o gestor troca no meio
  const ini = await ana('get', '/api/frotas/portal/inicio');
  assert.strictEqual(ini.body.viagem_aberta.tipo_medicao, 'km', 'a regua da viagem');
  const soHoras = await ana('post', '/api/frotas/portal/registros', { tipo: 'retorno', horimetro: 400, itens: todosOk() });
  assert.deepStrictEqual([soHoras.status, soHoras.body.error], [400, 'Informe o KM atual']);
  const ok = await ana('post', '/api/frotas/portal/registros', { tipo: 'retorno', km: 350, itens: todosOk() });
  assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  assert.deepStrictEqual([ok.body.viagem.km_retorno, ok.body.viagem.km_rodado, ok.body.viagem.horimetro_retorno], [350, 40, null]);
});

test('Fase 2 (6) retorno sem saida aberta mandando so horimetro -> 409 "sem saida", nao "Informe o KM"', async () => {
  const r = await ana('post', '/api/frotas/portal/registros', { tipo: 'retorno', horimetro: 10, itens: todosOk() });
  assert.deepStrictEqual([r.status, r.body.error], [409, 'Você não tem saída aberta para registrar o retorno.']);
  const vazio = await ana('post', '/api/frotas/portal/registros', { tipo: 'retorno', itens: todosOk() });
  assert.deepStrictEqual([vazio.status, vazio.body.error], [400, 'Informe o KM atual']);
});

test('Fase 2 (5) B8 na maquina: a saida que consome a viagem aprovada grava horimetro_saida e o km fica nulo', async () => {
  const m = (await gestor('post', '/api/frotas/veiculos', { placa: 'MAQ0009', tipo_medicao: 'horimetro', horimetro_atual: 10 })).body;
  const ap = await gestor('post', '/api/frotas/viagens', { veiculo_id: m.id, motorista_id: S.ma.id, status: 'aprovada', km_saida: 999 });
  assert.strictEqual(ap.status, 201, JSON.stringify(ap.body));
  const s = await ana('post', '/api/frotas/portal/registros', { tipo: 'saida', veiculo_id: m.id, horimetro: 12, itens: todosOk() });
  assert.strictEqual(s.status, 201, JSON.stringify(s.body));
  assert.strictEqual(s.body.viagem.id, ap.body.id, 'consumiu a aprovada');
  assert.deepStrictEqual([s.body.viagem.horimetro_saida, s.body.viagem.km_saida], [12, null]);
  const r = await ana('post', '/api/frotas/portal/registros', { tipo: 'retorno', horimetro: 15, itens: todosOk() });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  assert.deepStrictEqual(await veic(m.id), { km_atual: 0, horimetro_atual: 15 });
});

test('RN-F3.15 gestor fecha a viagem da maquina com horimetro_retorno (o horimetro sobe, o km nao); menor que a saida -> 400', async () => {
  const m = (await gestor('post', '/api/frotas/veiculos', { placa: 'MAQ0010', tipo_medicao: 'horimetro', horimetro_atual: 20 })).body;
  const s = await bruno('post', '/api/frotas/portal/registros', { tipo: 'saida', veiculo_id: m.id, horimetro: 25, itens: todosOk() });
  assert.strictEqual(s.status, 201, JSON.stringify(s.body));
  const corpo = { ...s.body.viagem, km_retorno: null, horimetro_retorno: 24, status: 'concluida' };
  const menor = await gestor('put', `/api/frotas/viagens/${s.body.viagem.id}`, corpo);
  assert.deepStrictEqual([menor.status, menor.body.error], [400, 'Horímetro do retorno (24 h) menor que o da saída (25 h). Confira o painel.']);
  const ok = await gestor('put', `/api/frotas/viagens/${s.body.viagem.id}`, { ...corpo, horimetro_retorno: 31.5 });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  assert.deepStrictEqual([ok.body.horimetro_saida, ok.body.horimetro_retorno, ok.body.km_retorno], [25, 31.5, null]);
  assert.deepStrictEqual(await veic(m.id), { km_atual: 0, horimetro_atual: 31.5 });
  const novo = await gestor('post', '/api/frotas/viagens', { veiculo_id: m.id, status: 'concluida', horimetro_saida: 40, horimetro_retorno: 39 });
  assert.strictEqual(novo.status, 400, 'POST com retorno menor em horas');
});

test('RN-F3.15 gestor cria e corrige abastecimento em horas (fora do km/L); ausente no PUT mantem', async () => {
  const m = (await gestor('post', '/api/frotas/veiculos', { placa: 'MAQ0011', tipo_medicao: 'horimetro', horimetro_atual: 5 })).body;
  const c = await gestor('post', '/api/frotas/abastecimentos', {
    veiculo_id: m.id, litros: 20, data_abastecimento: '2026-10-22', km_abastecimento: '', horimetro_abastecimento: 8,
  });
  assert.strictEqual(c.status, 201, JSON.stringify(c.body));
  assert.deepStrictEqual([c.body.horimetro_abastecimento, c.body.km_abastecimento, c.body.consumo_medio], [8, null, null]);
  const obs = await gestor('put', `/api/frotas/abastecimentos/${c.body.id}`, { observacoes: 'so a observacao' });
  assert.strictEqual(obs.body.horimetro_abastecimento, 8, 'ausente no corpo mantem');
  const up = await gestor('put', `/api/frotas/abastecimentos/${c.body.id}`, { horimetro_abastecimento: 9.5 });
  assert.strictEqual(up.body.horimetro_abastecimento, 9.5);
  assert.deepStrictEqual(await veic(m.id), { km_atual: 0, horimetro_atual: 9.5 });
});

test('RN-F3.14 alerta de revisao da maquina compara com o horimetro (folga 50 h); o do carro segue no km (folga 500)', async () => {
  const m = (await gestor('post', '/api/frotas/veiculos', { placa: 'MAQ0012', tipo_medicao: 'horimetro', horimetro_atual: 160, km_atual: 0 })).body;
  const longe = (await gestor('post', '/api/frotas/veiculos', { placa: 'MAQ0013', tipo_medicao: 'horimetro', horimetro_atual: 100, km_atual: 5000 })).body;
  const car = (await gestor('post', '/api/frotas/veiculos', { placa: 'KMH0099', km_atual: 1600 })).body;
  for (const v of [m, longe, car]) {
    const r = await gestor('post', '/api/frotas/manutencoes', { veiculo_id: v.id, descricao: 'revisao', proxima_revisao_km: 200 + (v === car ? 1800 : 0) });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  }
  ctx.limparCacheDashboard();
  const al = await gestor('get', '/api/frotas/alertas');
  assert.strictEqual(al.status, 200, JSON.stringify(al.body));
  const lista = Array.isArray(al.body) ? al.body : al.body.alertas;
  const placas = lista.filter((a) => a.tipo === 'manutencao').map((a) => a.titulo);
  assert(placas.includes('Manutenção — MAQ0012'), `maquina a 40 h da revisao: ${JSON.stringify(placas)}`);
  assert(!placas.includes('Manutenção — MAQ0013'), 'maquina longe (100 h de 200) nao alerta, mesmo com km 5000');
  assert(placas.includes('Manutenção — KMH0099'), 'metade positiva: o carro a 400 km alerta pelo km');
});

test('B37 (fixado) o motorista pela rota do gestor nao passa pela regua (D10)', async () => {
  const r = await ana('post', '/api/frotas/abastecimentos', { veiculo_id: S.c1.id, litros: 10, data_abastecimento: '2026-10-21', km_abastecimento: 900 });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
});

test("RN-F3.12 'Admin' ligado a motorista le todas as listas e grava no portal; a linha CONSULTA antiga dele e ignorada", async () => {
  const { classificarPerfilFrota } = require('../../services/frotas/permissions');
  assert.deepStrictEqual(classificarPerfilFrota({ role: 'Admin' }, 'CONSULTA'), { efetivo: 'ADMIN_FROTA', origem: 'forcado' });
  assert.deepStrictEqual(classificarPerfilFrota({ role: 'usuario' }, 'CONSULTA'), { efetivo: 'CONSULTA', origem: 'explicito' });
  await dbRun(ctx.db, "INSERT INTO usuarios (id, nome, email, ativo, role) VALUES (60, 'Adm Maiusculo', 'am@x.com', 1, 'Admin')");
  const adm = { id: 60, nome: 'Adm Maiusculo', role: 'Admin' };
  const mot = await gestor('post', '/api/frotas/motoristas', { nome: 'Adm Motorista', usuario_id: 60 });
  assert.strictEqual(mot.status, 201, JSON.stringify(mot.body));
  const lista = await ctx.como(adm)('get', '/api/frotas/abastecimentos');
  assert(lista.body.some((a) => a.motorista_id !== mot.body.id), 'le os abastecimentos de todos');
  const reg = await ctx.como(adm)('post', '/api/frotas/portal/registros', { tipo: 'inspecao', veiculo_id: S.c1.id, km: 1800, itens: todosOk() });
  assert.strictEqual(reg.status, 201, JSON.stringify(reg.body));
});

(async () => {
  ctx = await createFrotasTestApp();
  await cenario();
  console.log('\nFrota Etapa 3 — T1 (km e horimetro no portal; E5)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
