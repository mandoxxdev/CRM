/**
 * Etapa 196 — separar em duas vezes: a parte separada primeiro continua saindo de onde foi separada. O item guarda, alem do par
 * (endereco, lote) da separacao, QUANTO da caixa saiu dele (`quantidade_origem_separacao`); a rodada de outro par nao apaga a origem
 * nem grava troca; a entrega consome a parte; a fila e a sugestao contam a parte, nao a caixa.
 *
 * Plano: docs/superpowers/plans/2026-11-05-almoxarifado-etapa196-origem-da-separacao-em-duas-vezes.md (o bloco "Fase 2" manda).
 *
 * Executar: cd server && node tests/api/origemSeparacaoEmDuasVezes.api.test.js
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
  console.log('\n=== Etapa 196: origem da separacao em duas vezes ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const loc = async (nome) => {
    const c = `E196-${nome}-${++seq}`;
    return { id: (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', [c, nome])).lastID, codigo: c };
  };
  const material = async ({ serie = false } = {}) => {
    const c = `E196-M${++seq}`;
    return { id: (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_serie)
      VALUES (?, ?, 'UN', 0, 1, ?)`, [c, `Mat ${c}`, serie ? 1 : 0])).lastID, codigo: c };
  };
  const entrar = async (m, destino, q, lote, series) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({
      material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e196', localizacao_destino_id: destino,
      ...(lote ? { lote } : {}), ...(series ? { series } : {}),
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m, codigo])).id;
  const req = async (itens) => {
    const r = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E196-${++seq}`])).lastID;
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
  const devolver = (reqId, itens) => request(app).put(`/api/almoxarifado/requisicoes/${reqId}/devolver-separado`)
    .send({ motivo: 'e196', itens });
  const subs = async (reqId) => dbAll(db, 'SELECT * FROM substituicoes_origem_requisicao WHERE requisicao_id = ? ORDER BY id', [reqId]);
  const origem = async (itemId) => dbGet(db, `SELECT origem_separacao_id o, lote_separacao_id l, quantidade_origem_separacao q,
      quantidade_separada - COALESCE(quantidade_entregue, 0) caixa FROM itens_requisicao_almoxarifado WHERE id = ?`, [itemId]);
  const ok = async (p) => { const r = await p; assert.strictEqual(r.status, 200, JSON.stringify(r.body)); return r; };
  const saldo = async (m, l, lote = null) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) q FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND localizacao_id = ? AND lote_id IS ?`, [m, l, lote])).q);

  // ── T0 — a coluna ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[T0] banco novo: itens_requisicao_almoxarifado tem quantidade_origem_separacao (REAL), e o initSchema de novo nao quebra', async () => {
    const cols = await dbAll(db, 'PRAGMA table_info(itens_requisicao_almoxarifado)');
    const c = cols.find((x) => x.name === 'quantidade_origem_separacao');
    assert.ok(c, `coluna ausente: ${cols.map((x) => x.name).join(',')}`);
    assert.strictEqual(c.type, 'REAL');
    await initSchema(db);
    const cols2 = await dbAll(db, 'PRAGMA table_info(itens_requisicao_almoxarifado)');
    assert.strictEqual(cols2.filter((x) => x.name === 'quantidade_origem_separacao').length, 1);
  });

  await test('[T0] parteDaOrigem: sem origem 0; origem com quantidade = a quantidade (limitada a caixa); origem antiga NULL = a caixa', async () => {
    const { parteDaOrigem } = requisitionService;
    assert.strictEqual(parteDaOrigem({ origem_separacao_id: null, quantidade_separada: 5, quantidade_entregue: 0 }), 0);
    assert.strictEqual(parteDaOrigem({ origem_separacao_id: 7, quantidade_origem_separacao: 3, quantidade_separada: 6, quantidade_entregue: 0 }), 3);
    assert.strictEqual(parteDaOrigem({ origem_separacao_id: 7, quantidade_origem_separacao: 5, quantidade_separada: 6, quantidade_entregue: 4 }), 2);
    assert.strictEqual(parteDaOrigem({ origem_separacao_id: 7, quantidade_origem_separacao: null, quantidade_separada: 6, quantidade_entregue: 2 }), 4);
    const r = await dbGet(db, `SELECT ${requisitionService.parteOrigemSql('x')} AS p FROM (SELECT 7 AS origem_separacao_id, NULL AS quantidade_origem_separacao,
      6 AS quantidade_separada, 2 AS quantidade_entregue, NULL AS quantidade_atendida) x`);
    assert.strictEqual(Number(r.p), 4);
    const r2 = await dbGet(db, `SELECT ${requisitionService.parteOrigemSql('x')} AS p FROM (SELECT 7 AS origem_separacao_id, 9 AS quantidade_origem_separacao,
      6 AS quantidade_separada, 2 AS quantidade_entregue, NULL AS quantidade_atendida) x`);
    assert.strictEqual(Number(r2.p), 4);
    const r3 = await dbGet(db, `SELECT ${requisitionService.parteOrigemSql('x')} AS p FROM (SELECT NULL AS origem_separacao_id, 9 AS quantidade_origem_separacao,
      6 AS quantidade_separada, 2 AS quantidade_entregue, NULL AS quantidade_atendida) x`);
    assert.strictEqual(Number(r3.p), 0);
  });

  // ── T1 — a separacao (RN-196.01..05, 196.09 na rodada, 196.10) ───────────────────────────────────────────────────────────────────
  await test('[RN-196.01] sem nada separado, separa 3 de A -> origem A, parte 3; com 2 na caixa sem origem, separa 3 de B -> origem B, parte 3', async () => {
    const A = await loc('A'); const B = await loc('B'); const m = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10);
    const r1 = await req([[m.id, 8]]);
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    assert.deepStrictEqual(await origem(r1.ids[0]), { o: A.id, l: null, q: 3, caixa: 3 });
    const r2 = await req([[m.id, 8]]);
    await ok(separar(r2.id, [{ item_id: r2.ids[0], quantidade_separada: 2 }]));
    assert.deepStrictEqual(await origem(r2.ids[0]), { o: null, l: null, q: null, caixa: 2 });
    await ok(separar(r2.id, [{ item_id: r2.ids[0], quantidade_separada: 3, localizacao_origem_id: B.id }]));
    assert.deepStrictEqual(await origem(r2.ids[0]), { o: B.id, l: null, q: 3, caixa: 5 });
    assert.deepStrictEqual(await subs(r2.id), []);
  });

  await test('[RN-196.01] so lote (sem endereco) nao vira origem', async () => {
    const A = await loc('SL'); const m = await material(); const c = `LS-${seq}`;
    await entrar(m.id, A.id, 5, c);
    const l = await loteId(m.id, c);
    const r = await req([[m.id, 4]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 2, lote_id: l }]));
    assert.deepStrictEqual(await origem(r.ids[0]), { o: null, l: null, q: null, caixa: 2 });
  });

  await test('[RN-196.02] A 3, depois A 2 -> origem A, parte 5; nenhuma troca', async () => {
    const A = await loc('MA'); const m = await material();
    await entrar(m.id, A.id, 10);
    const r = await req([[m.id, 8]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]));
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: null, q: 5, caixa: 5 });
    assert.deepStrictEqual(await subs(r.id), []);
  });

  await test('[RN-196.03] o caso real: A/L1 3, depois automatico 3 -> origem A/L1, parte 3, caixa 6; outro par (B) e so lote tambem mantem', async () => {
    const A = await loc('RA'); const B = await loc('RB'); const m = await material(); const c1 = `L1-${seq}`; const c2 = `L2-${seq}`;
    await entrar(m.id, A.id, 3, c1); await entrar(m.id, B.id, 10, c2);
    const l1 = await loteId(m.id, c1); const l2 = await loteId(m.id, c2);
    const r = await req([[m.id, 12]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id, lote_id: l1 }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3 }]));
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: l1, q: 3, caixa: 6 });
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: B.id, lote_id: l2 }]));
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: l1, q: 3, caixa: 8 });
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 1, lote_id: l2 }]));
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: l1, q: 3, caixa: 9 });
    assert.deepStrictEqual(await subs(r.id), []);
  });

  await test('[RN-196.04] a separacao nao grava troca; motivo_substituicao e ignorado sem 400', async () => {
    const A = await loc('TA'); const B = await loc('TB'); const m = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10);
    const r = await req([[m.id, 8]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: B.id, motivo_substituicao: 'A acabou' }]));
    assert.deepStrictEqual(await subs(r.id), []);
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: null, q: 3, caixa: 5 });
  });

  await test('[RN-196.05] sem origem, rodada com A 1, A 1, B 2 -> origem A, parte 2; caixa 4', async () => {
    const A = await loc('VA'); const B = await loc('VB'); const m = await material();
    await entrar(m.id, A.id, 5); await entrar(m.id, B.id, 5);
    const r = await req([[m.id, 9]]);
    await ok(separar(r.id, [
      { item_id: r.ids[0], quantidade_separada: 1, localizacao_origem_id: A.id },
      { item_id: r.ids[0], quantidade_separada: 1, localizacao_origem_id: A.id },
      { item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: B.id },
    ]));
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: null, q: 2, caixa: 4 });
    assert.deepStrictEqual(await subs(r.id), []);
  });

  await test('[RN-196.09] 3a rodada de A com 2 livres la (A 3 + automatico 2 antes) passa: o comprometido de A e a parte 3, nao a caixa 5', async () => {
    const A = await loc('PA'); const B = await loc('PB'); const m = await material();
    await entrar(m.id, A.id, 5); await entrar(m.id, B.id, 2);
    const r = await req([[m.id, 10]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 2 }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]));
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: null, q: 5, caixa: 7 });
  });

  await test('[RN-196.09] a regua da divergencia de OUTRA requisicao conta a parte: A 5 com 3 comprometidos (caixa 6) -> separar 1 de A com 2 la e divergente', async () => {
    const A = await loc('DA'); const B = await loc('DB'); const m = await material();
    await entrar(m.id, A.id, 5); await entrar(m.id, B.id, 10);
    const r1 = await req([[m.id, 6]]);
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 3 }]));
    const r2 = await req([[m.id, 2]]);
    const s = await ok(separar(r2.id, [{ item_id: r2.ids[0], quantidade_separada: 1, localizacao_origem_id: A.id }]));
    const rod = await dbGet(db, 'SELECT itens_json FROM separacoes_requisicao_almoxarifado WHERE id = ?', [s.body.rodada_id]);
    const t = JSON.parse(rod.itens_json)[0];
    assert.deepStrictEqual([t.maximo, t.divergente], [2, true], rod.itens_json);
  });

  await test('[RN-196.10] origem antiga sem quantidade (NULL, caixa 3) + rodada automatica 3 -> grava a parte 3 (nunca NULL com origem)', async () => {
    const A = await loc('NA'); const B = await loc('NB'); const m = await material();
    await entrar(m.id, A.id, 3); await entrar(m.id, B.id, 3);
    const r = await req([[m.id, 6]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_origem_separacao = NULL WHERE id = ?', [r.ids[0]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3 }]));
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: null, q: 3, caixa: 6 });
  });

  await test('[RN-196.01..03] pelo SERVICO (sem a rota): A 2 + B 2 -> origem A, parte 2, nenhuma troca', async () => {
    const A = await loc('SA'); const B = await loc('SB'); const m = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10);
    const r = await req([[m.id, 6]]);
    await requisitionService.separarRequisicao(db, r.id, [{ item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }], ADMIN);
    await requisitionService.separarRequisicao(db, r.id, [{ item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: B.id }], ADMIN);
    assert.deepStrictEqual(await requisitionService.listarSubstituicoes(db, r.id), []);
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: null, q: 2, caixa: 4 });
  });

  //@@T2@@

  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})();
