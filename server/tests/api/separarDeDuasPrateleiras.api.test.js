/**
 * Etapa 270 — separar de duas prateleiras (C461, B1313 caminho (b), B1643-B1645). O item guarda, alem da origem (a 1a parte, a unica que
 * guarda a prateleira), as OUTRAS prateleiras de onde a caixa foi separada (`partes_separacao_almoxarifado`); o detalhe mostra; a entrega sem
 * "Sai de" tira cada parte de la quando ainda esta livre.
 *
 * Plano: docs/superpowers/plans/2026-11-27-almoxarifado-etapa270-separar-de-duas-prateleiras.md
 *
 * Executar: cd server && node tests/api/separarDeDuasPrateleiras.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { initSchema } = require('../../services/almoxarifado/schema');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 270: separar de duas prateleiras ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const loc = async (nome) => {
    const c = `E270-${nome}-${++seq}`;
    return { id: (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', [c, nome])).lastID, codigo: c };
  };
  const material = async ({ serie = false, lote = false } = {}) => {
    const c = `E270-M${++seq}`;
    return { id: (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_serie, controle_lote)
      VALUES (?, ?, 'UN', 0, 1, ?, ?)`, [c, `Mat ${c}`, serie ? 1 : 0, lote ? 1 : 0])).lastID, codigo: c };
  };
  const entrar = async (m, destino, q, lote) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({
      material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e270', localizacao_destino_id: destino, ...(lote ? { lote } : {}),
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m, codigo])).id;
  const req = async (itens, status = 'APROVADO') => {
    const r = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', ?)`, [`REQ-E270-${++seq}`, status])).lastID;
    const ids = [];
    for (const [m, q] of itens) {
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
        (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
        VALUES (?,?,?,0,0,0)`, [r, m, q])).lastID);
    }
    return { id: r, ids };
  };
  const separar = (reqId, itens) => request(app).put(`/api/almoxarifado/requisicoes/${reqId}/separacao`).send({ itens_separados: itens });
  const entregar = (reqId, itens) => request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`).send({ itens_atendidos: itens });
  const devolver = (reqId, itens) => request(app).put(`/api/almoxarifado/requisicoes/${reqId}/devolver-separado`).send({ motivo: 'e270', itens });
  const detalhe = async (reqId) => {
    const r = await request(app).get(`/api/almoxarifado/requisicoes/${reqId}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const ok = async (p) => { const r = await p; assert.strictEqual(r.status, 200, JSON.stringify(r.body)); return r; };
  const origem = async (itemId) => dbGet(db, `SELECT origem_separacao_id o, lote_separacao_id l, quantidade_origem_separacao q,
      quantidade_separada - COALESCE(quantidade_entregue, 0) caixa FROM itens_requisicao_almoxarifado WHERE id = ?`, [itemId]);
  const linhas = async (itemId) => (await dbAll(db, `SELECT localizacao_id loc, lote_id lote, quantidade q FROM partes_separacao_almoxarifado
    WHERE item_requisicao_id = ? ORDER BY id`, [itemId])).map((x) => [x.loc, x.lote, Number(x.q)]);
  const partes = async (reqId, itemId) => {
    const d = await detalhe(reqId);
    return d.itens.find((i) => i.id === itemId).partes_separacao.map((p) => [p.localizacao_codigo, p.lote_codigo, p.quantidade]);
  };
  const subs = async (reqId) => dbAll(db, 'SELECT * FROM substituicoes_origem_requisicao WHERE requisicao_id = ? ORDER BY id', [reqId]);
  const saidas = async (reqId) => (await dbAll(db, `SELECT localizacao_origem_id loc, lote_id lote, quantidade q FROM movimentacoes_almoxarifado
    WHERE requisicao_id = ? AND tipo = 'SAIDA' AND COALESCE(cancelado, 0) = 0 ORDER BY id`, [reqId])).map((x) => [x.loc, x.lote, Number(x.q)]);
  const saldo = async (m, l, lote = null) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) q FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND localizacao_id = ? AND lote_id IS ?`, [m, l, lote])).q);
  // A 3 + B 2 (escolhido) num item sem lote; padrao = P (o automatico de hoje tira de P)
  const cenarioAB = async ({ a = 5, b = 5, p = 10, pedido = 8, qb = 2 } = {}) => {
    const A = await loc('A'); const B = await loc('B'); const P = await loc('P'); const m = await material();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET localizacao_padrao_id = ? WHERE id = ?', [P.id, m.id]);
    await entrar(m.id, A.id, a); await entrar(m.id, B.id, b); await entrar(m.id, P.id, p);
    const r = await req([[m.id, pedido]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: qb, localizacao_origem_id: B.id }]));
    return { A, B, P, m, ...r };
  };

  // ── T1 — guardar e mostrar (RN-270.01..06) ─────────────────────────────────────────────────────────────────────────────────────
  await test('[T1] banco novo: a tabela partes_separacao_almoxarifado existe, e o initSchema de novo nao quebra', async () => {
    const cols = (await dbAll(db, 'PRAGMA table_info(partes_separacao_almoxarifado)')).map((c) => c.name);
    for (const c of ['item_requisicao_id', 'requisicao_id', 'material_id', 'localizacao_id', 'lote_id', 'quantidade']) assert.ok(cols.includes(c), c);
    await initSchema(db);
    assert.strictEqual((await dbAll(db, 'PRAGMA table_info(partes_separacao_almoxarifado)')).length, cols.length);
  });

  await test('[RN-270.03] partesEfetivas: limita pela caixa menos a parte da origem, na ordem do id, sem as zeradas', async () => {
    const { partesEfetivas } = requisitionService;
    const item = { origem_separacao_id: 7, quantidade_origem_separacao: 3, quantidade_separada: 8, quantidade_entregue: 0 };
    const ls = [{ id: 2, quantidade: 2 }, { id: 5, quantidade: 2 }];
    assert.deepStrictEqual(partesEfetivas(item, ls).map((x) => [x.id, x.quantidade]), [[2, 2], [5, 2]]);
    assert.deepStrictEqual(partesEfetivas({ ...item, quantidade_separada: 6 }, ls).map((x) => [x.id, x.quantidade]), [[2, 2], [5, 1]]);
    assert.deepStrictEqual(partesEfetivas({ ...item, quantidade_separada: 4 }, [ls[1], ls[0]]).map((x) => [x.id, x.quantidade]), [[2, 1]]);
    assert.deepStrictEqual(partesEfetivas({ ...item, quantidade_separada: 3 }, ls), []);
    // origem zerada (entregue): a caixa toda e das outras partes
    assert.deepStrictEqual(partesEfetivas({ origem_separacao_id: null, quantidade_separada: 5, quantidade_entregue: 3 }, ls).map((x) => x.quantidade), [2]);
  });

  await test('[RN-270.01] A 3 e depois B 2 escolhido -> origem A parte 3 (como na 196), a tabela ganha (B, 2); sem troca; o detalhe mostra B 2', async () => {
    const { A, B, id, ids } = await cenarioAB();
    assert.deepStrictEqual(await origem(ids[0]), { o: A.id, l: null, q: 3, caixa: 5 });
    assert.deepStrictEqual(await linhas(ids[0]), [[B.id, null, 2]]);
    assert.deepStrictEqual(await subs(id), []);
    assert.deepStrictEqual(await partes(id, ids[0]), [[B.codigo, null, 2]]);
  });

  await test('[RN-270.01] rodada automatica e de so lote sobre item com origem nao gravam parte; item sem outra parte -> partes_separacao []', async () => {
    const A = await loc('SA'); const B = await loc('SB'); const m = await material(); const c = `LS-${seq}`;
    await entrar(m.id, A.id, 5); await entrar(m.id, B.id, 5, c);
    const l = await loteId(m.id, c);
    const r = await req([[m.id, 9]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    assert.deepStrictEqual(await partes(r.id, r.ids[0]), []);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 2 }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 1, lote_id: l }]));
    assert.deepStrictEqual(await linhas(r.ids[0]), []);
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: null, q: 3, caixa: 6 });
  });

  await test('[RN-270.02] mesmo par soma; par diferente (mesmo endereco, outro lote) e outra linha; o mesmo item duas vezes no envio', async () => {
    const A = await loc('PA'); const B = await loc('PB'); const m = await material(); const c1 = `L1-${seq}`; const c2 = `L2-${seq}`;
    await entrar(m.id, A.id, 5, c1); await entrar(m.id, B.id, 5, c1); await entrar(m.id, B.id, 5, c2);
    const l1 = await loteId(m.id, c1); const l2 = await loteId(m.id, c2);
    const r = await req([[m.id, 12]]);
    await ok(separar(r.id, [
      { item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id, lote_id: l1 },
      { item_id: r.ids[0], quantidade_separada: 1, localizacao_origem_id: B.id, lote_id: l1 },
    ]));
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: l1, q: 3, caixa: 4 });
    assert.deepStrictEqual(await linhas(r.ids[0]), [[B.id, l1, 1]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: B.id, lote_id: l1 }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: B.id, lote_id: l2 }]));
    assert.deepStrictEqual(await linhas(r.ids[0]), [[B.id, l1, 3], [B.id, l2, 2]]);
    const d = await partes(r.id, r.ids[0]);
    assert.deepStrictEqual(d, [[B.codigo, c1, 3], [B.codigo, c2, 2]]);
  });

  await test('[RN-270.03] devolver a prateleira tira primeiro o sem prateleira, depois as outras partes da ultima para a primeira, por ultimo a origem', async () => {
    const A = await loc('DA'); const B = await loc('DB'); const C = await loc('DC'); const m = await material();
    await entrar(m.id, A.id, 5); await entrar(m.id, B.id, 5); await entrar(m.id, C.id, 5);
    const r = await req([[m.id, 10]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: B.id }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: C.id }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 1 }]));
    await ok(devolver(r.id, [{ item_id: r.ids[0], quantidade: 2 }]));
    assert.deepStrictEqual(await partes(r.id, r.ids[0]), [[B.codigo, null, 2], [C.codigo, null, 1]]);
    await ok(devolver(r.id, [{ item_id: r.ids[0], quantidade: 3 }]));
    assert.deepStrictEqual(await partes(r.id, r.ids[0]), []);
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: null, q: 3, caixa: 3 });
    // separar de B de novo depois: a linha morta sai e a nova entra no fim (nao herda o numero velho)
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 1, localizacao_origem_id: B.id }]));
    assert.deepStrictEqual(await linhas(r.ids[0]), [[B.id, null, 1]]);
  });

  await test('[RN-270.04] origem zerada (A entregue escolhendo A) com B na caixa -> o detalhe mostra so B', async () => {
    const { A, B, id, ids } = await cenarioAB();
    await ok(entregar(id, [{ item_id: ids[0], quantidade_atendida: 3, localizacao_origem_id: A.id }]));
    assert.deepStrictEqual(await origem(ids[0]), { o: null, l: null, q: null, caixa: 2 });
    assert.deepStrictEqual(await partes(id, ids[0]), [[B.codigo, null, 2]]);
  });

  await test('[RN-270.05] outra requisicao separando de B ve o livre de B como hoje (a parte de B de R1 nao guarda); a parte de A guarda (controle)', async () => {
    const { A, B, m } = await cenarioAB({ a: 4, b: 3 });
    const r2 = await req([[m.id, 3]]);
    // B tem 3 no fisico; R1 separou 2 de la (sem guardar): R2 separa 3 de B sem recusa
    await ok(separar(r2.id, [{ item_id: r2.ids[0], quantidade_separada: 3, localizacao_origem_id: B.id }]));
    // controle: A tem 4 e R1 guarda 3 -> R2 separar 2 de A e recusado
    const r3 = await req([[m.id, 2]]);
    const x = await separar(r3.id, [{ item_id: r3.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    assert.strictEqual(x.status, 400, JSON.stringify(x.body));
  });

  await test('[RN-270.06] excluir a requisicao apaga as outras partes (e a origem, como na 203)', async () => {
    const { id, ids } = await cenarioAB();
    const r = await request(app).delete(`/api/almoxarifado/requisicoes/${id}`).send({ justificativa: 'e270' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await linhas(ids[0]), []);
  });

  await test('[RN-270.01] pelo SERVICO (sem a rota): A 2 + B 2 -> origem A 2, parte B 2', async () => {
    const A = await loc('VA'); const B = await loc('VB'); const m = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10);
    const r = await req([[m.id, 6]]);
    await requisitionService.separarRequisicao(db, r.id, [{ item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }], ADMIN);
    await requisitionService.separarRequisicao(db, r.id, [{ item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: B.id }], ADMIN);
    assert.deepStrictEqual(await linhas(r.ids[0]), [[B.id, null, 2]]);
  });

  // ── T2 — a entrega sai de cada uma (RN-270.10..15) ──────────────────────────────────────────────────────────────────────────────
  //@@T2@@

  terminou = true;
  await close();
  console.log(`\n${passed} passou, ${failed} falhou\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
