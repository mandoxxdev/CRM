/**
 * Etapa 96 T3 — a requisicao: as colunas do item e a entrega (C176, C178; features 05 e 07).
 *
 * A T1 deixou o motor gravando arredondado e recusando com folga, mas o ITEM da requisicao tem colunas proprias que o
 * motor nao escreve: `quantidade_separada` (soma em JS na separacao) e `quantidade_entregue`/`quantidade_atendida`
 * (soma relativa no SQL na entrega). Separar 0,7 + 0,2 + 0,1 gravava `quantidade_separada = 0.9999999999999999` e a
 * entrega de 1 era recusada COM O ESTOQUE LIMPO ("Maximo: 0.9999999999999999"); entregar 0,7 + 0,2 + 0,1 deixava o
 * fisico em 2,8e-17 e o entregue em 0.9999999999999999 (sonda 10 da Fase 0). E a fila e o detalhe mandavam o
 * entregavel cru com colunas limpas (separa 0,3, entrega 0,1 -> 0.19999999999999998; Fase 2, I5).
 *
 * O legado torto e montado por ESCRITOR DIRETO. Usuarios reais por header (molde 92-95): S sem perfil cria pela rota;
 * ADMIN aprova; ALMOX separa e entrega; ALMOX2 confere o critico. Casos `[96 RN-xx]`; RN-06 (a)-(d) pela rota e
 * pelo servico (`separarRequisicao`, `entregarRequisicao` chamados direto).
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa96-motor-quantidade-arredondada.md
 *
 * Executar: cd server && node tests/api/quantidadeArredondadaRequisicao.api.test.js
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

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 96 T3', role: 'admin', is_superadmin: 1, email: 'a96t3@t.com' },
  S: { id: 9611, nome: 'Solic 96 T3', role: 'user', email: 's96t3@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 9612, nome: 'Almox 96 T3', role: 'user', email: 'x96t3@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
  ALMOX2: { id: 9613, nome: 'Almox2 96 T3', role: 'user', email: 'y96t3@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const TORTO = 0.9999999999999999; // 0,7 + 0,2 + 0,1
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 96 T3: a requisicao — as colunas do item e a entrega ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    get: (u) => request(app).get(u).set('x-teste-usuario', k).then((x) => x),
    post: (u, b = {}) => request(app).post(u).set('x-teste-usuario', k).send(b).then((x) => x),
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });

  const material = async (fisico = 0, critico = 0) => {
    const c = `E96R-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, material_critico, custo_unitario) VALUES (?, ?, 'PC', ?, 0, 1, ?, 0.1)`, [c, c, fisico, critico])).lastID;
  };
  const entrar = async (m, q) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e96' });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const legado = async () => {
    const m = await material(0);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ? WHERE id = ?', [TORTO, m]);
    return m;
  };
  // Requisicao de `q` do material `m`, criada pelo solicitante e aprovada pela rota.
  const aprovada = async (m, q) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-96', itens: [{ material_id: m, quantidade: q }],
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ap = await como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/aprovar`, {});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    const it = await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [cr.body.id]);
    return { R: cr.body.id, I: it.id };
  };
  const separar = (R, I, q, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/separar`, { itens_separados: [{ item_id: I, quantidade_separada: q }] });
  const entregar = (R, I, q, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: I, quantidade_atendida: q }] });
  const ok = (r, msg = '') => assert.strictEqual(r.status, 200, `${msg} ${JSON.stringify(r.body)}`);
  const item = (I) => dbGet(db, 'SELECT quantidade_separada, quantidade_entregue, quantidade_atendida FROM itens_requisicao_almoxarifado WHERE id = ?', [I]);
  const statusReq = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status;
  const mat = (m) => dbGet(db, 'SELECT quantidade_atual, quantidade_reservada FROM materiais_almoxarifado WHERE id = ?', [m]);
  const reservas = (R) => dbAll(db, 'SELECT quantidade, quantidade_utilizada, status FROM reservas_material_almoxarifado WHERE requisicao_id = ? ORDER BY id', [R]);
  const daFila = async (R, I) => {
    const f = await como('ALMOX').get(`${API}/fila-separacao`);
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    const l = f.body.find((x) => Number(x.id) === Number(R));
    assert.ok(l, `a requisicao ${R} nao esta na fila`);
    return l.itens.find((i) => Number(i.item_id) === Number(I));
  };
  const detalhe = async (R, I) => {
    const d = await como('ALMOX').get(`${API}/requisicoes/${R}`);
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    return d.body.itens.find((i) => Number(i.id) === Number(I));
  };

  // ─────────────────────────── RN-06 (a) — o legado do comeco ao fim ───────────────────────────
  await test('[96 RN-06 a] legado torto 0.9999…, requisicao de 1: aprovar reserva 1, separar 1, entregar 1 -> ENTREGUE, fisico 0, reserva CONSUMIDA', async () => {
    const m = await legado();
    const { R, I } = await aprovada(m, 1);
    assert.strictEqual(await statusReq(R), 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual((await reservas(R)).map((r) => r.quantidade), [1]);
    ok(await separar(R, I, 1), 'separar 1');
    ok(await entregar(R, I, 1), 'entregar 1');
    assert.strictEqual(await statusReq(R), 'ENTREGUE');
    assert.deepStrictEqual({ ...(await mat(m)) }, { quantidade_atual: 0, quantidade_reservada: 0 });
    assert.deepStrictEqual((await reservas(R)).map((r) => [r.quantidade_utilizada, r.status]), [[1, 'CONSUMIDA']]);
  });
  await test('[96 RN-06 a] a RESERVA legada torta (0.9999… escrita direto): entregar 1 -> ENTREGUE, sem uma baixa de "zero" pelo resto de 1e-16', async () => {
    const m = await material(0); await entrar(m, 1);
    const { R, I } = await aprovada(m, 1);
    await dbRun(db, 'UPDATE reservas_material_almoxarifado SET quantidade = ? WHERE requisicao_id = ?', [TORTO, R]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = ? WHERE id = ?', [TORTO, m]);
    ok(await separar(R, I, 1), 'separar 1');
    ok(await entregar(R, I, 1), 'entregar 1');
    assert.strictEqual(await statusReq(R), 'ENTREGUE');
    assert.deepStrictEqual({ ...(await mat(m)) }, { quantidade_atual: 0, quantidade_reservada: 0 });
    const n = await dbGet(db, "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA'", [m]);
    assert.strictEqual(n.n, 1, 'uma saida so (a da reserva)');
  });
  // ─────────────────────────── RN-06 (b) — separar em rodadas fracionadas ───────────────────────────
  await test('[96 RN-06 b] fisico 1 limpo, separar 0,7 + 0,2 + 0,1 -> quantidade_separada 1; entregar 1 -> ENTREGUE', async () => {
    const m = await material(0); await entrar(m, 1);
    const { R, I } = await aprovada(m, 1);
    for (const q of [0.7, 0.2, 0.1]) ok(await separar(R, I, q), `separar ${q}`);
    assert.strictEqual((await item(I)).quantidade_separada, 1);
    ok(await entregar(R, I, 1), 'entregar 1');
    assert.strictEqual(await statusReq(R), 'ENTREGUE');
    assert.strictEqual((await mat(m)).quantidade_atual, 0);
  });
  // ─────────────────────────── RN-06 (c) — entregar em rodadas fracionadas ───────────────────────────
  await test('[96 RN-06 c] separar 1, entregar 0,7 + 0,2 + 0,1 -> ENTREGUE, fisico 0 (nao 2,8e-17), entregue 1, utilizada 1', async () => {
    const m = await material(0); await entrar(m, 1);
    const { R, I } = await aprovada(m, 1);
    ok(await separar(R, I, 1));
    for (const q of [0.7, 0.2, 0.1]) ok(await entregar(R, I, q), `entregar ${q}`);
    assert.strictEqual(await statusReq(R), 'ENTREGUE');
    assert.strictEqual((await mat(m)).quantidade_atual, 0);
    assert.deepStrictEqual({ ...(await item(I)) }, { quantidade_separada: 1, quantidade_entregue: 1, quantidade_atendida: 1 });
    assert.deepStrictEqual((await reservas(R)).map((r) => [r.quantidade_utilizada, r.status]), [[1, 'CONSUMIDA']]);
  });
  // ─────────────────────────── RN-06 (d) — a fila e o detalhe ───────────────────────────
  await test('[96 RN-06 d] legado separado: a fila diz entregavel 1 e o detalhe quantidade_entregavel 1', async () => {
    const m = await legado();
    const { R, I } = await aprovada(m, 1);
    ok(await separar(R, I, 1));
    assert.strictEqual((await daFila(R, I)).entregavel, 1);
    assert.strictEqual((await detalhe(R, I)).quantidade_entregavel, 1);
  });
  await test('[96 RN-06 d] (Fase 2, I5) colunas limpas: fisico 1, separa 0,3, entrega 0,1 -> fila entregavel 0,2 e a_entregar 0,2', async () => {
    const m = await material(0); await entrar(m, 1);
    const { R, I } = await aprovada(m, 1);
    ok(await separar(R, I, 0.3));
    ok(await entregar(R, I, 0.1));
    assert.deepStrictEqual({ ...(await item(I)) }, { quantidade_separada: 0.3, quantidade_entregue: 0.1, quantidade_atendida: 0.1 }, 'premissa: colunas limpas');
    const f = await daFila(R, I);
    assert.deepStrictEqual([f.entregavel, f.a_entregar], [0.2, 0.2]);
    // o detalhe, com 1 no fisico, oferece a segunda rodada alem da caixa (Etapa 95, B477): 0,9 = o pendente
    assert.strictEqual((await detalhe(R, I)).quantidade_entregavel, 0.9);
  });
  await test('[96 RN-06 d] (Fase 2, I5) o fisico limita: fisico 0,3, pede 1, separa 0,3, entrega 0,1 -> fila e detalhe dizem 0,2 (a reserva do item e uma diferenca)', async () => {
    const m = await material(0); await entrar(m, 0.3);
    const { R, I } = await aprovada(m, 1);
    ok(await separar(R, I, 0.3));
    ok(await entregar(R, I, 0.1));
    const rs = await reservas(R);
    assert.deepStrictEqual(rs.map((r) => [r.quantidade, r.quantidade_utilizada]), [[0.3, 0.1]], 'premissa: reserva 0,3 com 0,1 usado (o saldo dela e 0,3 - 0,1 no SQL)');
    const f = await daFila(R, I);
    assert.deepStrictEqual([f.entregavel, f.disponivel], [0.2, 0.2]);
    const d = await detalhe(R, I);
    assert.deepStrictEqual([d.quantidade_entregavel, d.saldo_atual, d.quantidade_pendente], [0.2, 0.2, 0.9]);
  });

  // ─────────────────────────── pelo servico ───────────────────────────
  await test('[96 RN-06 b/c] pelo servico: separarRequisicao 0,7 + 0,2 + 0,1 e entregarRequisicao 0,7 + 0,2 + 0,1 -> separado 1, entregue 1, fisico 0', async () => {
    const m = await material(0); await entrar(m, 1);
    const { R, I } = await aprovada(m, 1);
    for (const q of [0.7, 0.2, 0.1]) await requisitionService.separarRequisicao(db, R, [{ item_id: I, quantidade_separada: q }], { ...USERS.ALMOX });
    assert.strictEqual((await item(I)).quantidade_separada, 1);
    for (const q of [0.7, 0.2, 0.1]) await requisitionService.entregarRequisicao(db, R, [{ item_id: I, quantidade_atendida: q }], { ...USERS.ALMOX });
    assert.deepStrictEqual({ ...(await item(I)) }, { quantidade_separada: 1, quantidade_entregue: 1, quantidade_atendida: 1 });
    assert.strictEqual((await mat(m)).quantidade_atual, 0);
    assert.strictEqual(await statusReq(R), 'ENTREGUE');
  });

  // ─────────────────────────── RN-03 / RN-05 — a folga nao inventa, a mensagem diz o arredondado ───────────────────────────
  await test('[96 RN-03] entregar 0,200001 com 0,2 separado -> 400 (literal E1), nada gravado', async () => {
    const m = await material(0); await entrar(m, 1);
    const { R, I } = await aprovada(m, 0.2);
    ok(await separar(R, I, 0.2));
    const antes = JSON.stringify([await item(I), await mat(m)]);
    const r = await entregar(R, I, 0.200001);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `E96R-${seq}: não é possível entregar 0.200001 PC. Máximo: 0.2 (pendente: 0.2, disponível: 1)`);
    assert.strictEqual(JSON.stringify([await item(I), await mat(m)]), antes);
  });
  await test('[96 RN-05] literal E1 com a caixa como diferenca: separado 0,3, entregue 0,1, entregar 0,3 -> "Maximo: 0.2 (pendente: 0.2, …)"', async () => {
    const m = await material(0); await entrar(m, 0.3);
    const { R, I } = await aprovada(m, 0.3);
    ok(await separar(R, I, 0.3));
    ok(await entregar(R, I, 0.1));
    const r = await entregar(R, I, 0.3);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `E96R-${seq}: não é possível entregar 0.3 PC. Máximo: 0.2 (pendente: 0.2, disponível: 0.2)`);
  });

  await test('[96 RN-02] comum com a caixa como diferenca: pede 0,3, separado 0,3, entregue 0,1, entregar 0,2 -> 200 ENTREGUE', async () => {
    const m = await material(0); await entrar(m, 0.3);
    const { R, I } = await aprovada(m, 0.3);
    ok(await separar(R, I, 0.3));
    ok(await entregar(R, I, 0.1), 'entregar 0,1');
    ok(await entregar(R, I, 0.2), 'entregar 0,2');
    assert.strictEqual(await statusReq(R), 'ENTREGUE');
    assert.deepStrictEqual({ ...(await mat(m)) }, { quantidade_atual: 0, quantidade_reservada: 0 });
  });

  // ─────────────────────────── o critico (Fase 2, I1) ───────────────────────────
  await test('[96 RN-02] (Fase 2, I1) critico com a caixa como diferenca: separado 0,3, entregue 0,1, entregar 0,2 -> 200', async () => {
    const m = await material(0, 1); await entrar(m, 0.3);
    const { R, I } = await aprovada(m, 0.3);
    ok(await separar(R, I, 0.3));
    ok(await como('ALMOX2').put(`${API}/requisicoes/${R}/conferir-separacao`, {}), 'conferir');
    ok(await entregar(R, I, 0.1), 'entregar 0,1');
    const r = await entregar(R, I, 0.2);
    assert.strictEqual(r.status, 200, `entregar 0,2: ${JSON.stringify(r.body)}`);
    assert.strictEqual(await statusReq(R), 'ENTREGUE');
    assert.strictEqual((await mat(m)).quantidade_atual, 0);
  });
  await test('[96 RN-05] literal R3: critico, separado 0,3, entregue 0,1, entregar 0,3 -> "(0.2)", nao 0.19999999999999998', async () => {
    const m = await material(0, 1); await entrar(m, 0.5);
    const { R, I } = await aprovada(m, 0.5);
    ok(await separar(R, I, 0.3));
    ok(await como('ALMOX2').put(`${API}/requisicoes/${R}/conferir-separacao`, {}), 'conferir');
    ok(await entregar(R, I, 0.1), 'entregar 0,1');
    const r = await entregar(R, I, 0.3);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `E96R-${seq}: material crítico só sai depois de separado e conferido — 0.3 excede `
      + 'o separado ainda não entregue (0.2). Separe o restante e peça a segunda conferência.');
  });

  // ─────────────────────────── Fase 5, R1 — quantidade com mais de 6 casas ───────────────────────────
  // A separacao e a entrega arredondam (T3); o item gravava o solicitado CRU. 0,3333333 (ou o 1/3 legado) nunca era
  // alcancado: PARCIALMENTE_ATENDIDA com pendente 0, fora da fila, reserva ATIVA com 3e-7 (zumbi). Antes da 96: ENTREGUE.
  const statusERes = async (R) => [await statusReq(R), (await reservas(R)).map((r) => r.status)];
  await test('[96 RN-04] (Fase 5, R1) requisicao nova de 0,3333333: o item grava 0,333333; separar e entregar 0,3333333 -> ENTREGUE, reserva CONSUMIDA, reservado 0', async () => {
    const m = await material(0); await entrar(m, 5);
    const { R, I } = await aprovada(m, 0.3333333);
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_solicitada q FROM itens_requisicao_almoxarifado WHERE id = ?', [I])).q, 0.333333);
    ok(await separar(R, I, 0.3333333), 'separar 0,3333333');
    ok(await entregar(R, I, 0.3333333), 'entregar 0,3333333');
    assert.deepStrictEqual(await statusERes(R), ['ENTREGUE', ['CONSUMIDA']]);
    assert.deepStrictEqual({ ...(await mat(m)) }, { quantidade_atual: 4.666667, quantidade_reservada: 0 });
  });
  await test('[96 RN-04] (Fase 5, R1) requisicao nova de 1,0000004: o item grava 1; separar 1, entregar 1 -> ENTREGUE', async () => {
    const m = await material(0); await entrar(m, 5);
    const { R, I } = await aprovada(m, 1.0000004);
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_solicitada q FROM itens_requisicao_almoxarifado WHERE id = ?', [I])).q, 1);
    ok(await separar(R, I, 1), 'separar 1');
    ok(await entregar(R, I, 1), 'entregar 1');
    assert.deepStrictEqual(await statusERes(R), ['ENTREGUE', ['CONSUMIDA']]);
  });
  await test('[96 RN-04] (Fase 5, R1) requisicao de 0,0000004 (arredonda a 0) -> 400 com a recusa de quantidade invalida de sempre, nada gravado', async () => {
    const m = await material(0); await entrar(m, 5);
    const antes = (await dbGet(db, 'SELECT COUNT(*) n FROM requisicoes_almoxarifado')).n;
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-96', itens: [{ material_id: m, quantidade: 1 }, { material_id: m, quantidade: 0.0000004 }],
    });
    assert.strictEqual(cr.status, 400, JSON.stringify(cr.body));
    assert.strictEqual(cr.body.error, 'Dados inválidos — itens.1.quantidade: quantidade deve ser maior que zero');
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM requisicoes_almoxarifado')).n, antes);
  });
  await test('[96 RN-06] (Fase 5, R1) legado 1/3 (item, reserva e reservado crus): separar o pendente e entregar o entregavel -> ENTREGUE, reserva CONSUMIDA, reservado 0, fora da fila', async () => {
    const T = 1 / 3;
    const m = await material(0); await entrar(m, 5);
    const { R, I } = await aprovada(m, 0.5);
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_solicitada = ? WHERE id = ?', [T, I]);
    await dbRun(db, 'UPDATE reservas_material_almoxarifado SET quantidade = ? WHERE requisicao_id = ?', [T, R]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = ? WHERE id = ?', [T, m]);
    const d0 = await detalhe(R, I);
    assert.strictEqual(d0.quantidade_pendente, 0.333333);
    ok(await separar(R, I, d0.quantidade_pendente), 'separar o pendente');
    const d1 = await detalhe(R, I);
    ok(await entregar(R, I, d1.quantidade_entregavel), 'entregar o entregavel');
    assert.deepStrictEqual(await statusERes(R), ['ENTREGUE', ['CONSUMIDA']]);
    assert.deepStrictEqual({ ...(await mat(m)) }, { quantidade_atual: 4.666667, quantidade_reservada: 0 });
    const f = await como('ALMOX').get(`${API}/fila-separacao`);
    assert.ok(!f.body.some((x) => Number(x.id) === Number(R)), 'a requisicao ENTREGUE nao fica na fila');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
