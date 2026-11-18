/**
 * Etapa 243 (resto da D (233) 3) — a devolucao para Estoque ou Quarentena de material com serie e SEM controle de lote, com o lote em
 * branco e sem lote herdado da saida citada, grava o lote das series. Antes (sonda da Fase 0) a devolucao avulsa gravava `lote_id` NULL na
 * ENTRADA_DEVOLUCAO e no BLOQUEIO, a serie PERDIA o lote (a reativacao grava o lote da entrada) e a peca ia para o "sem lote atribuido" —
 * a peca de um lote bloqueado voltava sem lote e saia de novo sem a guarda do lote. Sucata nao muda (a serie nao se move ali).
 *
 * Plano: docs/superpowers/plans/2026-11-18-almoxarifado-etapa243-devolucao-quarentena-lote-das-series.md (RN-243.01 a .08).
 * Executar: cd server && node tests/api/devolucaoLoteDasSeries.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 243', role: 'admin', is_superadmin: 1, email: 'a243@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 243: a devolucao para Estoque/Quarentena grava o lote das series ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };

  const material = async ({ lote = 0 } = {}) => {
    const c = `E243-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, ?, 1, 0)`, [c, `Mat ${c}`, lote])).lastID;
    return { id, codigo: c };
  };
  const entrar = (m, numeros, lote) => ok(request(app).post(`${API}/movimentacoes/v2`).send({
    material_id: m.id, tipo: 'ENTRADA', quantidade: numeros.length, motivo: 'e243', series: numeros, ...(lote ? { lote } : {}),
  }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const statusLote = async (m, codigo, st) => ok(request(app).put(`${API}/lotes/${await loteId(m, codigo)}/status`)
    .send({ status: st, justificativa: 'teste 243' }));
  const sid = async (m, n) => (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [m.id, n])).id;
  const serie = async (m, n) => dbGet(db, 'SELECT status, lote_id FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [m.id, n]);
  const fisico = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q);
  const linhaDoLote = async (m, loteIdOuNull) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) q
    FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id IS ?`, [m.id, loteIdOuNull])).q);
  const resumo = async (m) => (await ok(request(app).get(`${API}/materiais/${m.id}/lotes/resumo`))).body;
  const bloqueadoPorLote = async (m) => (await ok(request(app).get(`${API}/materiais/${m.id}/bloqueado-por-lote`))).body;
  const daDevolucao = async (m) => dbAll(db, `SELECT id, tipo, lote_id, lote FROM movimentacoes_almoxarifado
    WHERE material_id = ? AND referencia LIKE 'DEV-%' AND tipo != 'ESTORNO' ORDER BY id`, [m.id]);
  const devolucoes = async (m) => dbAll(db, 'SELECT id, lote_id FROM devolucoes_material_almoxarifado WHERE material_id = ?', [m.id]);
  const sair = async (m, numeros, extra = {}) => request(app).post(`${API}/movimentacoes/v2`).send({
    material_id: m.id, tipo: 'SAIDA', quantidade: numeros.length, motivo: 'e243', justificativa: 'teste 243',
    serie_ids: await Promise.all(numeros.map((n) => sid(m, n))), ...extra,
  });
  const devolver = (m, numeros, destino, extra = {}) => request(app).post(`${API}/devolucoes`).send({
    material_id: m.id, quantidade: numeros.length, motivo: 'DANIFICADO', destino, series: numeros, ...extra,
  });
  // A montagem: A1, A2 no L1 e B1, B2 no L2 (ATIVOS), material SEM controle de lote; B1 e A1 sairam pela Saida avulsa (v2, Etapa 234:
  // cada saida grava o lote da serie).
  const montar = async (opc) => {
    const m = await material(opc);
    await entrar(m, ['A1', 'A2'], 'L1');
    await entrar(m, ['B1', 'B2'], 'L2');
    const sB1 = (await ok(sair(m, ['B1']), 201)).body;
    const sA1 = (await ok(sair(m, ['A1']), 201)).body;
    return { m, sB1, sA1 };
  };
  const nadaGravado = async (m) => {
    assert.strictEqual((await devolucoes(m)).length, 0, 'nenhuma linha de devolucao');
    assert.strictEqual((await daDevolucao(m)).length, 0, 'nenhum movimento da devolucao');
    assert.strictEqual(await fisico(m), 2, 'fisico igual');
    assert.strictEqual((await serie(m, 'B1')).status, 'ENTREGUE');
  };

  // ── RN-243.01 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-243.01] Quarentena avulsa de B1 com o lote em branco -> 201; devolucao, entrada e bloqueio no L2; B1 continua no L2', async () => {
    const { m } = await montar();
    await ok(devolver(m, ['B1'], 'QUARENTENA'), 201);
    const l2 = await loteId(m, 'L2');
    const movs = await daDevolucao(m);
    assert.deepStrictEqual(movs.map((x) => [x.tipo, Number(x.lote_id), x.lote]), [['ENTRADA_DEVOLUCAO', l2, 'L2'], ['BLOQUEIO', l2, 'L2']]);
    assert.strictEqual(Number((await devolucoes(m))[0].lote_id), l2, 'a linha da devolucao diz o lote');
    const s = await serie(m, 'B1');
    assert.strictEqual(s.status, 'EM_ESTOQUE');
    assert.strictEqual(Number(s.lote_id), l2, 'a serie nao perde o lote');
    assert.strictEqual(await linhaDoLote(m, l2), 2);
    assert.strictEqual(await linhaDoLote(m, null), 0, 'o "sem lote" nao ganha a peca');
    const b = await bloqueadoPorLote(m);
    assert.strictEqual(Number(b.sem_lote), 0);
    assert.deepStrictEqual(b.lotes.map((x) => [x.codigo, Number(x.quantidade)]), [['L2', 1]]);
    const r = await resumo(m);
    assert.strictEqual(Number(r.fisico), 3);
    assert.strictEqual(Number(r.sem_lote_atribuido), 0);
  });
  await test('[RN-243.01] Estoque avulsa de B1 -> 201; a entrada e a serie no L2, sem bloqueio', async () => {
    const { m } = await montar();
    await ok(devolver(m, ['B1'], 'ESTOQUE'), 201);
    const l2 = await loteId(m, 'L2');
    const movs = await daDevolucao(m);
    assert.deepStrictEqual(movs.map((x) => [x.tipo, Number(x.lote_id)]), [['ENTRADA_DEVOLUCAO', l2]]);
    assert.strictEqual(Number((await serie(m, 'B1')).lote_id), l2);
    assert.strictEqual(await linhaDoLote(m, l2), 2);
    assert.strictEqual(await linhaDoLote(m, null), 0);
    assert.strictEqual(Number((await resumo(m)).sem_lote_atribuido), 0);
  });
  await test('[RN-243.01] duas series do MESMO lote -> 201 no L2', async () => {
    const { m } = await montar();
    await ok(sair(m, ['B2']), 201);
    await ok(devolver(m, ['B2', 'B1'], 'QUARENTENA'), 201);
    const l2 = await loteId(m, 'L2');
    for (const x of await daDevolucao(m)) assert.strictEqual(Number(x.lote_id), l2);
    assert.strictEqual(await linhaDoLote(m, l2), 2);
    assert.strictEqual(await linhaDoLote(m, null), 0);
  });

  // ── RN-243.02 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-243.02] series de lotes diferentes (B1, A1) -> 400 "(L1, L2)", nada gravado', async () => {
    const { m } = await montar();
    const r = await devolver(m, ['B1', 'A1'], 'QUARENTENA');
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'As séries informadas são de lotes diferentes (L1, L2): registre uma devolução para cada lote.');
    await nadaGravado(m);
    assert.strictEqual((await serie(m, 'A1')).status, 'ENTREGUE');
  });
  await test('[RN-243.02] serie do L2 + serie sem lote -> 400 "(L2, sem lote)", nada gravado (Estoque)', async () => {
    const { m } = await montar();
    await entrar(m, ['S1']);
    await ok(sair(m, ['S1']), 201);
    const r = await devolver(m, ['S1', 'B1'], 'ESTOQUE');
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'As séries informadas são de lotes diferentes (L2, sem lote): registre uma devolução para cada lote.');
    assert.strictEqual((await devolucoes(m)).length, 0);
    assert.strictEqual((await serie(m, 'S1')).status, 'ENTREGUE');
  });

  // ── RN-243.03 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-243.03] lote informado ganha: B1 devolvida informando o L1 -> o L1 (como antes, sem derivar)', async () => {
    const { m } = await montar();
    const l1 = await loteId(m, 'L1');
    await ok(devolver(m, ['B1'], 'QUARENTENA', { lote_id: l1 }), 201);
    for (const x of await daDevolucao(m)) assert.strictEqual(Number(x.lote_id), l1);
    assert.strictEqual(Number((await serie(m, 'B1')).lote_id), l1);
  });
  await test('[RN-243.03] citando a saida (herda o L2): igual a antes', async () => {
    const { m, sB1 } = await montar();
    await ok(devolver(m, ['B1'], 'QUARENTENA', { movimentacao_saida_id: sB1.id }), 201);
    const l2 = await loteId(m, 'L2');
    for (const x of await daDevolucao(m)) assert.strictEqual(Number(x.lote_id), l2);
  });
  await test('[RN-243.03] serie nova (nunca existiu) junto com B1 -> nao deriva: 201 sem lote, como antes', async () => {
    const { m } = await montar();
    await ok(devolver(m, ['B1', 'NOVA9'], 'QUARENTENA'), 201);
    for (const x of await daDevolucao(m)) assert.strictEqual(x.lote_id, null);
    assert.strictEqual((await serie(m, 'NOVA9')).lote_id, null);
  });
  await test('[RN-243.03] serie ja em estoque (B2) junto -> nao deriva: a recusa de sempre do motor, nada fica', async () => {
    const { m } = await montar();
    const r = await devolver(m, ['B1', 'B2'], 'ESTOQUE');
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(/B2 ja esta em estoque/.test(r.body.error), r.body.error);
    await nadaGravado(m);
  });
  await test('[RN-243.03] B1 saiu SEM lote (entrega/v1/saida antiga: o "sem lote" -1) -> nao deriva: volta ao "sem lote", o resumo fecha (Fase 2, 1a)', async () => {
    const m = await material();
    await entrar(m, ['A1', 'A2'], 'L1');
    await entrar(m, ['B1', 'B2'], 'L2');
    // o motor sem `lotePelasSeries` (a entrega, a v1, as saidas de antes da 234) tira da linha "sem lote" com a serie ainda no L2
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m.id, tipo: 'SAIDA', quantidade: 1, motivo: 'e243',
      justificativa: 'teste 243', serie_ids: [await sid(m, 'B1')] }, { exigeLote: true, exigeSerie: true });
    const l2 = await loteId(m, 'L2');
    assert.strictEqual(await linhaDoLote(m, null), -1, 'setup: a saida antiga deixa o "sem lote" em -1');
    assert.strictEqual(Number((await serie(m, 'B1')).lote_id), l2, 'setup: a serie continua marcada no L2');
    await ok(devolver(m, ['B1'], 'QUARENTENA'), 201);
    for (const x of await daDevolucao(m)) assert.strictEqual(x.lote_id, null, 'sem derivar');
    assert.strictEqual(await linhaDoLote(m, l2), 2, 'o L2 nao ganha a peca que nao saiu dele');
    assert.strictEqual(await linhaDoLote(m, null), 0, 'o "sem lote" volta a 0');
    const r = await resumo(m);
    assert.strictEqual(Number(r.fisico), 4);
    assert.strictEqual(Number(r.sem_lote_atribuido), 0, 'o resumo fecha');
  });
  await test('[RN-243.03] series repetidas -> a recusa de sempre do motor, nada fica (Fase 2, 1c)', async () => {
    const { m } = await montar();
    const r = await devolver(m, ['B1', 'B1'], 'QUARENTENA');
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(/repetidos/.test(r.body.error), r.body.error);
    assert.strictEqual((await devolucoes(m)).length, 0);
    assert.strictEqual((await daDevolucao(m)).length, 0);
  });
  await test('[RN-243.03] o lote da saida foi apagado -> "sem lote": 201 sem lote, como antes (Fase 2, 1b)', async () => {
    const m = await material();
    await entrar(m, ['X1', 'X2'], 'LX');
    await ok(sair(m, ['X1']), 201);
    await dbRun(db, 'DELETE FROM lotes_almoxarifado WHERE id = ?', [await loteId(m, 'LX')]);
    await ok(devolver(m, ['X1'], 'ESTOQUE'), 201);
    for (const x of await daDevolucao(m)) assert.strictEqual(x.lote_id, null);
  });
  await test('[RN-243.03] series todas sem lote -> 201 sem lote, como antes', async () => {
    const m = await material();
    await entrar(m, ['N1', 'N2']);
    await ok(sair(m, ['N1']), 201);
    await ok(devolver(m, ['N1'], 'QUARENTENA'), 201);
    for (const x of await daDevolucao(m)) assert.strictEqual(x.lote_id, null);
    assert.strictEqual(await linhaDoLote(m, null), 2);
  });

  // ── RN-243.04 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-243.04] o estorno do bloqueio e da entrada volta ao L2; a linha, o bloqueado por lote e o resumo fecham', async () => {
    const { m } = await montar();
    await ok(devolver(m, ['B1'], 'QUARENTENA'), 201);
    const l2 = await loteId(m, 'L2');
    const movs = await daDevolucao(m);
    for (const x of [...movs].reverse()) {
      await ok(request(app).post(`${API}/movimentacoes/${x.id}/cancelar`).send({ motivo: 'estorno do teste 243' }));
    }
    const est = await dbAll(db, "SELECT lote_id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ESTORNO' ORDER BY id", [m.id]);
    assert.deepStrictEqual(est.map((x) => Number(x.lote_id)), [l2, l2], 'os dois estornos gravam o L2');
    assert.strictEqual(await linhaDoLote(m, l2), 1);
    assert.strictEqual(await linhaDoLote(m, null), 0);
    assert.strictEqual(Number((await bloqueadoPorLote(m)).total), 0);
    const s = await serie(m, 'B1');
    assert.strictEqual(Number(s.lote_id), l2, 'a serie continua no L2');
    assert.strictEqual(s.status, 'ESTORNADA', 'a devolucao avulsa estornada deixa a serie ESTORNADA (a que cita a saida volta a ENTREGUE)');
    const r = await resumo(m);
    assert.strictEqual(Number(r.fisico), 2);
    assert.strictEqual(Number(r.sem_lote_atribuido), 0);
  });

  // ── RN-243.05 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-243.05] B1 de lote BLOQUEADO devolvida avulsa ao Estoque volta ao L2 e a Saida avulsa (v2) dela e recusada (a guarda do lote)', async () => {
    const { m } = await montar();
    await statusLote(m, 'L2', 'BLOQUEADO');
    await ok(devolver(m, ['B1'], 'ESTOQUE'), 201);
    const l2 = await loteId(m, 'L2');
    assert.strictEqual(Number((await serie(m, 'B1')).lote_id), l2);
    const r = await sair(m, ['B1']);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Lote L2 esta bloqueado e nao pode ser utilizado');
    assert.strictEqual((await serie(m, 'B1')).status, 'EM_ESTOQUE');
  });

  // ── RN-243.06 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-243.06] Sucata com serie -> a recusa de sempre; sem serie -> 201 e B1 continua Entregue no L2', async () => {
    const { m } = await montar();
    const r = await devolver(m, ['B1'], 'SUCATA');
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Devolução com número de série não é suportada no destino SUCATA. Devolva ao estoque e, em seguida, '
      + 'registre a baixa na tela Movimentações, que tem seletor de série.');
    await ok(request(app).post(`${API}/devolucoes`).send({ material_id: m.id, quantidade: 1, motivo: 'DANIFICADO', destino: 'SUCATA' }), 201);
    const s = await serie(m, 'B1');
    assert.strictEqual(s.status, 'ENTREGUE');
    assert.strictEqual(Number(s.lote_id), await loteId(m, 'L2'));
    assert.strictEqual(await linhaDoLote(m, null), 0, 'o par entrada + sucata soma zero');
    assert.strictEqual(await fisico(m), 2);
  });
  await test('[RN-243.06] material COM controle de lote e o lote em branco -> "exige lote" de sempre', async () => {
    const m = await material({ lote: 1 });
    await entrar(m, ['B1', 'B2'], 'L2');
    await ok(sair(m, ['B1'], { lote_id: await loteId(m, 'L2') }), 201);
    const r = await devolver(m, ['B1'], 'QUARENTENA');
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `O material ${m.codigo} exige lote nesta movimentacao (controle por lote ligado)`);
    assert.strictEqual((await devolucoes(m)).length, 0);
  });

  // ── RN-243.07 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-243.07] o lote da serie muda entre a validacao e a trava -> 400, nada gravado (a linha da devolucao apagada)', async () => {
    const { m, sA1 } = await montar();
    const b1 = await sid(m, 'B1');
    // o gancho: logo depois do INSERT da devolucao (fora da trava), a serie B1 passa a constar da saida do L1 — o lote dela muda no meio
    const original = db.run; let disparou = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && /^\s*INSERT INTO devolucoes_material_almoxarifado/.test(sql) && params[0] === m.id) {
        disparou = true;
        return original.call(db, sql, params, function (err) {
          const ctx = this;
          original.call(db, 'UPDATE series_almoxarifado SET movimentacao_saida_id = ? WHERE id = ?', [sA1.id, b1], () => cb.call(ctx, err));
        });
      }
      return original.call(db, sql, params, cb);
    };
    let r;
    try { r = await devolver(m, ['B1'], 'QUARENTENA'); } finally { db.run = original; }
    assert.ok(disparou, 'o gancho nao disparou');
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'O lote das séries mudou enquanto a devolução era gravada — nada foi gravado. Registre a devolução de novo.');
    assert.strictEqual((await devolucoes(m)).length, 0, 'a linha da devolucao foi apagada');
    assert.strictEqual((await daDevolucao(m)).length, 0);
    assert.strictEqual((await serie(m, 'B1')).status, 'ENTREGUE');
  });

  // ── RN-243.08 (integracao, pela rota) ───────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-243.08] saida v2 -> devolucao avulsa Quarentena -> resumo e bloqueado por lote -> estorno -> resumo fecha', async () => {
    const m = await material();
    await entrar(m, ['C1', 'C2'], 'LC');
    await ok(sair(m, ['C1']), 201);
    assert.strictEqual(Number((await resumo(m)).sem_lote_atribuido), 0);
    const dev = await ok(devolver(m, ['C1'], 'QUARENTENA'), 201);
    assert.ok(dev.body.id);
    const res = await resumo(m);
    assert.strictEqual(Number(res.fisico), 2);
    assert.strictEqual(Number(res.soma_lotes), 2);
    assert.strictEqual(Number(res.sem_lote_atribuido), 0);
    assert.deepStrictEqual((await bloqueadoPorLote(m)).lotes.map((x) => x.codigo), ['LC']);
    for (const x of [...(await daDevolucao(m))].reverse()) {
      await ok(request(app).post(`${API}/movimentacoes/${x.id}/cancelar`).send({ motivo: 'estorno integracao 243' }));
    }
    const fim = await resumo(m);
    assert.strictEqual(Number(fim.fisico), 1);
    assert.strictEqual(Number(fim.sem_lote_atribuido), 0);
    assert.strictEqual(Number((await serie(m, 'C1')).lote_id), await loteId(m, 'LC'));
  });

  terminou = true;
  await close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
