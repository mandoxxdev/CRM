/**
 * Etapa 102 (T4, C204, RN-01/RN-05/RN-06) — o documento ate o fim, pela rota E pelo servico.
 *
 * J1: pelo SERVICO (separarRequisicao, entregarRequisicao) a Parcialmente Atendida com caixa; encerrar pela rota -> E1;
 *     devolver pela rota -> encerrar 200; reserva LIBERADA, quantidade_reservada 0, some da fila (servico e rota).
 * J2: material perdido da caixa — a perda avulsa e recusada com o sufixo novo (sem "encerre"); seguir o caminho que a
 *     recusa ensina (devolver, lancar a perda, entregar o resto) leva a Entregue -> encerrar 200.
 * J3: o caminho que SAIU do sufixo ("entregue o que existe e encerre") de fato recusa: entregar o que existe deixa a
 *     perdida na caixa e o encerramento toma E1.
 *
 * Plano: docs/superpowers/plans/2026-10-15-almoxarifado-etapa102-encerrar-com-caixa-recusa.md (T4)
 * Executar: cd server && node tests/api/encerrarComCaixaIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Adm 102I', role: 'admin', is_superadmin: 1, email: 'a102i@t.com' };
const S = { id: 10221, nome: 'Solic 102I', role: 'user', email: 's102i@t.com' };
const ALMOX = { id: 10223, nome: 'Almox 102I', role: 'user', email: 'x102i@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE };
const E1 = 'Esta requisição tem material separado na caixa; entregue-o ou devolva-o à prateleira antes de encerrar.';
// RN-06: o sufixo novo, inteiro (saiu "entregue o que existe e encerre a requisição, ").
const SUFIXO = (c, numero) => ` — ${c} PC estão separados para a requisição ${numero} e só saem pela entrega (material perdido `
  + 'da caixa: devolva-o à prateleira na requisição e dê a baixa, ou peça ao administrador do almoxarifado para excluí-la)';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 102 (T4): integracao — encerrar com caixa, pela rota e pelo servico ===\n');
  const { app, db, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };
  const API = '/api/almoxarifado';
  const ok = (r, st, rot) => { assert.strictEqual(r.status, st, `${rot}: ${r.status} ${JSON.stringify(r.body)}`); return r; };

  const material = async (fisico) => {
    const c = `E102I-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
      ativo, custo_unitario, material_critico) VALUES (?, ?, 'PC', ?, 0, 1, 0.1, 0)`, [c, c, fisico])).lastID;
  };
  const montar = async (pede, fisico) => {
    const m = await material(fisico);
    const cr = await as(S, () => request(app).post('/api/requisicoes-material').send({
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-102I', itens: [{ material_id: m, quantidade: pede }],
    }).then((x) => x));
    ok(cr, 201, 'criar');
    const R = cr.body.id;
    ok(await request(app).put(`${API}/requisicoes/${R}/aprovar`).send({}), 200, 'aprovar');
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R])).id;
    const { numero } = await dbGet(db, 'SELECT numero FROM requisicoes_almoxarifado WHERE id = ?', [R]);
    return { m, R, item, numero };
  };
  const mov = (m, tipo, q) => as(ALMOX, () => request(app).post(`${API}/movimentacoes/v2`).send({
    material_id: m, tipo, quantidade: q, motivo: 'e102 T4', justificativa: 'teste da etapa 102 T4', os_referencia: 'OS-102I',
  }).then((x) => x));
  const separar = (x, q) => as(ALMOX, () => request(app).put(`${API}/requisicoes/${x.R}/separar`)
    .send({ itens_separados: [{ item_id: x.item, quantidade_separada: q }] }).then((r) => r));
  const entregar = (x, q) => as(ALMOX, () => request(app).put(`${API}/requisicoes/${x.R}/entregar`)
    .send({ itens_atendidos: [{ item_id: x.item, quantidade_atendida: q }] }).then((r) => r));
  const devolver = (x, q, motivo) => as(ALMOX, () => request(app).put(`${API}/requisicoes/${x.R}/devolver-separado`)
    .send({ motivo, itens: [{ item_id: x.item, quantidade: q }] }).then((r) => r));
  const encerrar = (x) => request(app).put(`${API}/requisicoes/${x.R}/encerrar`).send({ motivo: 'fim' }).then((r) => r);
  const st = async (x) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [x.R])).status;
  const reservas = async (x) => (await dbAll(db, 'SELECT status FROM reservas_material_almoxarifado WHERE requisicao_id = ?', [x.R])).map((r) => r.status);
  const reservado = async (x) => Number((await dbGet(db, 'SELECT COALESCE(quantidade_reservada,0) r FROM materiais_almoxarifado WHERE id = ?', [x.m])).r);
  const naFilaServico = async (x) => (await requisitionService.listarFilaSeparacao(db, { ...ALMOX })).find((f) => f.id === x.R) || null;
  const naFilaRota = async (x) => {
    const r = ok(await as(ALMOX, () => request(app).get(`${API}/fila-separacao`).then((y) => y)), 200, 'GET fila');
    return r.body.find((f) => f.id === x.R) || null;
  };

  await test('[102 J1] servico: separa 4, entrega 1 (Parcialmente Atendida, 3 na caixa, na fila); rota: encerrar E1, nada muda; devolver 3 -> encerrar 200; reserva LIBERADA, reservado 0; sai da fila (servico e rota)', async () => {
    const x = await montar(4, 10);
    await requisitionService.separarRequisicao(db, x.R, [{ item_id: x.item, quantidade_separada: 4 }], { ...ALMOX });
    const e = await requisitionService.entregarRequisicao(db, x.R, [{ item_id: x.item, quantidade_atendida: 1 }], { ...ALMOX });
    assert.strictEqual(e.status, 'PARCIALMENTE_ATENDIDA', JSON.stringify(e));
    assert.ok(await naFilaServico(x), 'premissa: a Parcialmente Atendida esta na fila (servico)');
    assert.ok(await naFilaRota(x), 'premissa: a Parcialmente Atendida esta na fila (rota)');
    const r = await encerrar(x);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body)); assert.strictEqual(r.body.error, E1);
    assert.strictEqual(await st(x), 'PARCIALMENTE_ATENDIDA');
    assert.deepStrictEqual(await reservas(x), ['ATIVA']);
    assert.strictEqual(await reservado(x), 3);
    ok(await devolver(x, 3, 'nao vai sair'), 200, 'devolver');
    ok(await encerrar(x), 200, 'encerrar');
    assert.strictEqual(await st(x), 'ENCERRADA');
    assert.deepStrictEqual(await reservas(x), ['LIBERADA']);
    assert.strictEqual(await reservado(x), 0);
    assert.strictEqual(await naFilaServico(x), null, 'ainda na fila (servico)');
    assert.strictEqual(await naFilaRota(x), null, 'ainda na fila (rota)');
    const s2 = await separar(x, 1);
    assert.strictEqual(s2.status, 400, 'a encerrada nao separa');
  });

  // Sem reserva (material sem saldo na aprovacao; a ENTRADA vem depois): a caixa e sem reserva e a perda recusa com o sufixo.
  const perdeuNaCaixa = async () => {
    const x = await montar(4, 0);
    ok(await mov(x.m, 'ENTRADA', 4), 201, 'entrada');
    ok(await separar(x, 4), 200, 'separar 4');
    ok(await entregar(x, 1), 200, 'entregar 1');
    assert.strictEqual(await st(x), 'PARCIALMENTE_ATENDIDA');
    assert.deepStrictEqual(await reservas(x), [], 'premissa: sem reserva');
    return x;
  };

  await test('[102 J2] perderam-se 2 dos 3 da caixa: a PERDA 2 recusa com o sufixo novo; devolver 2, PERDA 2 (201), entregar 1 -> Entregue -> encerrar 200', async () => {
    const x = await perdeuNaCaixa();
    const p = await mov(x.m, 'PERDA', 2);
    assert.strictEqual(p.status, 400, JSON.stringify(p.body));
    assert.ok(p.body.error.endsWith(SUFIXO(3, x.numero)), `sufixo: ${p.body.error}`);
    assert.ok(!p.body.error.includes('encerre'), 'o sufixo ainda ensina encerrar');
    ok(await devolver(x, 2, 'perdeu'), 200, 'devolver 2');
    ok(await mov(x.m, 'PERDA', 2), 201, 'PERDA 2');
    const e = ok(await entregar(x, 1), 200, 'entregar 1');
    assert.strictEqual(e.body.status, 'PARCIALMENTE_ATENDIDA', 'pede 4, entregou 2: ainda parcial');
    ok(await encerrar(x), 200, 'encerrar com a caixa vazia');
    assert.strictEqual(await st(x), 'ENCERRADA');
  });

  await test('[102 J3] o caminho que saiu do sufixo recusa: perderam-se 2, "entregue o que existe" (1) e encerre -> E1 (2 na caixa); a requisicao continua Parcialmente Atendida', async () => {
    const x = await perdeuNaCaixa();
    ok(await entregar(x, 1), 200, 'entregar o que existe');
    const r = await encerrar(x);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body)); assert.strictEqual(r.body.error, E1);
    assert.strictEqual(await st(x), 'PARCIALMENTE_ATENDIDA');
  });

  terminou = true;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
