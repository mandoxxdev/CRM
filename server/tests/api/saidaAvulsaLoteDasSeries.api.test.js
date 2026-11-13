/**
 * Etapa 234 (D (233) 2; B1531, B1532, B1534) — a saida avulsa (Movimentacoes, rota v2) de material com serie e SEM controle de lote, com o
 * lote em BRANCO, grava o lote das series: o livro diz o lote, a linha de saldo baixada e a do lote e o "sem lote atribuido" nao fica
 * negativo. Series de lotes diferentes numa saida so sao recusadas (uma saida por lote, como a entrega). Antes desta etapa (sonda da Fase 0)
 * a saida gravava `lote_id` NULL e baixava a linha "sem lote" (-1), e o lote ficava com a peca que ja tinha saido.
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa234-saida-avulsa-lote-das-series.md (RN-234.01 a .05).
 * Executar: cd server && node tests/api/saidaAvulsaLoteDasSeries.api.test.js
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
const ADMIN = { id: 1, nome: 'Adm 234', role: 'admin', is_superadmin: 1, email: 'a234@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

// B1534: a consulta da letra A (rodar em producao antes do deploy) — as saidas gravadas "sem lote" cujas series sao de um lote. A MESMA
// literal que vai no documento de novidades; a RN-234.05 prova que ela acha o caso antigo e nao acha o novo.
const CONSULTA_LETRA_A = `SELECT mv.id AS movimentacao_id, mv.created_at, mv.tipo, mat.codigo AS material, s.numero AS serie,
       l.codigo AS lote_da_serie
  FROM movimentacoes_almoxarifado mv
  JOIN series_almoxarifado s ON s.movimentacao_saida_id = mv.id
  JOIN lotes_almoxarifado l ON l.id = s.lote_id
  JOIN materiais_almoxarifado mat ON mat.id = mv.material_id
 WHERE mv.lote_id IS NULL AND COALESCE(mv.cancelado, 0) = 0
 ORDER BY mat.codigo, mv.id, s.numero`;

(async () => {
  console.log('\n=== Etapa 234: a saida avulsa com o lote em branco grava o lote das series ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };

  const material = async ({ lote = 0 } = {}) => {
    const c = `E234-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, ?, 1, 0)`, [c, `Mat ${c}`, lote])).lastID;
    return { id, codigo: c };
  };
  const entrar = (m, numeros, lote) => ok(request(app).post(`${API}/movimentacoes/v2`).send({
    material_id: m.id, tipo: 'ENTRADA', quantidade: numeros.length, motivo: 'e234', series: numeros, ...(lote ? { lote } : {}),
  }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const statusLote = async (m, codigo, st) => ok(request(app).put(`${API}/lotes/${await loteId(m, codigo)}/status`)
    .send({ status: st, justificativa: 'teste 234' }));
  const sid = async (m, n) => (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [m.id, n])).id;
  const serie = async (m, n) => dbGet(db, 'SELECT status, lote_id FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [m.id, n]);
  const fisico = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q);
  const linhaDoLote = async (m, loteIdOuNull) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) q
    FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id IS ?`, [m.id, loteIdOuNull])).q);
  const resumo = async (m) => (await ok(request(app).get(`${API}/materiais/${m.id}/lotes/resumo`))).body;
  const saidas = async (m) => dbAll(db, `SELECT id, tipo, lote_id, lote FROM movimentacoes_almoxarifado
    WHERE material_id = ? AND tipo NOT IN ('ENTRADA', 'ESTORNO') ORDER BY id`, [m.id]);
  const sair = async (m, tipo, numeros, extra = {}) => request(app).post(`${API}/movimentacoes/v2`).send({
    material_id: m.id, tipo, quantidade: numeros.length, motivo: 'e234', justificativa: 'teste 234',
    serie_ids: await Promise.all(numeros.map((n) => sid(m, n))), ...extra,
  });
  // A montagem: A1, A2 em L1 e B1, B2 em L2 (ATIVOS), material SEM controle de lote (o lote em branco e aceito).
  const montar = async (opc) => {
    const m = await material(opc);
    await entrar(m, ['A1', 'A2'], 'L1');
    await entrar(m, ['B1', 'B2'], 'L2');
    return m;
  };
  const nadaSaiu = async (m, numeros) => {
    for (const n of numeros) assert.strictEqual((await serie(m, n)).status, 'EM_ESTOQUE', `${n} continua em estoque`);
    assert.strictEqual(await fisico(m), 4, 'fisico igual');
    assert.strictEqual((await saidas(m)).length, 0, 'nenhuma saida no livro');
    assert.strictEqual(await linhaDoLote(m, null), 0, 'nenhuma linha sem lote mexida');
  };

  // ── RN-234.01 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-234.01] SAIDA [B1] com o lote em branco -> 201, o livro e a linha baixada sao do L2, o resumo fecha', async () => {
    const m = await montar();
    await ok(sair(m, 'SAIDA', ['B1']), 201);
    const [s] = await saidas(m);
    const l2 = await loteId(m, 'L2');
    assert.strictEqual(Number(s.lote_id), l2, 'o livro grava o lote das series');
    assert.strictEqual(s.lote, 'L2');
    assert.strictEqual(await linhaDoLote(m, l2), 1, 'a linha do L2 baixou');
    assert.strictEqual(await linhaDoLote(m, await loteId(m, 'L1')), 2, 'o L1 nao mexeu');
    assert.strictEqual(await linhaDoLote(m, null), 0, 'nenhuma linha sem lote negativa');
    const r = await resumo(m);
    assert.strictEqual(Number(r.fisico), 3);
    assert.strictEqual(Number(r.soma_lotes), 3);
    assert.strictEqual(Number(r.sem_lote_atribuido), 0);
    assert.strictEqual((await serie(m, 'B1')).status, 'ENTREGUE');
  });
  await test('[RN-234.01] PERDA [B2] com o lote em branco -> grava o L2 (o L2 zera)', async () => {
    const m = await montar();
    await ok(sair(m, 'PERDA', ['B2']), 201);
    await ok(sair(m, 'PERDA', ['B1']), 201);
    const l2 = await loteId(m, 'L2');
    for (const s of await saidas(m)) assert.strictEqual(Number(s.lote_id), l2);
    assert.strictEqual(await linhaDoLote(m, l2), 0);
    assert.strictEqual(await linhaDoLote(m, null), 0);
    assert.strictEqual(Number((await resumo(m)).sem_lote_atribuido), 0);
  });

  await test('[RN-234.01] outro tipo de saida da v2 (SAIDA_PRODUCAO) tambem grava o L2 (Fase 2, achado 6)', async () => {
    const m = await montar();
    await ok(sair(m, 'SAIDA_PRODUCAO', ['B1'], { emergencial: true }), 201);
    assert.strictEqual(Number((await saidas(m))[0].lote_id), await loteId(m, 'L2'));
    assert.strictEqual(await linhaDoLote(m, null), 0);
  });
  await test('[RN-234.01] serie ja entregue no meio -> nao deriva: a recusa do claim de sempre, nao "nao pertence ao lote" (Fase 2, achado 1)', async () => {
    const m = await montar();
    await ok(sair(m, 'SAIDA', ['B1']), 201);
    const r = await sair(m, 'SAIDA', ['A1', 'B1']);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(!/pertence ao lote|lotes diferentes|no lote/.test(r.body.error), r.body.error);
    assert.ok(/B1/.test(r.body.error), r.body.error);
    assert.strictEqual((await serie(m, 'A1')).status, 'EM_ESTOQUE');
    assert.strictEqual(await fisico(m), 3);
  });

  // ── RN-234.02 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-234.02] o estorno da saida derivada devolve ao L2', async () => {
    const m = await montar();
    const r = await ok(sair(m, 'SAIDA', ['B1']), 201);
    await ok(request(app).post(`${API}/movimentacoes/${r.body.id}/cancelar`).send({ motivo: 'estorno do teste 234' }));
    const l2 = await loteId(m, 'L2');
    // o livro do estorno diz o lote (antes desta etapa: NULL — o estorno voltava ao "sem lote" e o L2 nunca tinha baixado)
    const est = await dbGet(db, "SELECT lote_id, lote FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ESTORNO'", [m.id]);
    assert.strictEqual(Number(est.lote_id), l2, 'o estorno grava o L2');
    assert.strictEqual(est.lote, 'L2');
    assert.strictEqual(await linhaDoLote(m, l2), 2);
    assert.strictEqual(await linhaDoLote(m, null), 0);
    const s = await serie(m, 'B1');
    assert.strictEqual(s.status, 'EM_ESTOQUE');
    assert.strictEqual(Number(s.lote_id), l2);
    const res = await resumo(m);
    assert.strictEqual(Number(res.fisico), 4);
    assert.strictEqual(Number(res.sem_lote_atribuido), 0);
  });

  // ── RN-234.03 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-234.03] SAIDA [A1, B2] (dois lotes) -> 400 "lotes diferentes (L1, L2)", nada sai', async () => {
    const m = await montar();
    const r = await sair(m, 'SAIDA', ['B2', 'A1']);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'As series escolhidas sao de lotes diferentes (L1, L2): faca uma saida para cada lote');
    await nadaSaiu(m, ['A1', 'B2']);
  });
  await test('[RN-234.03] serie sem lote + serie do L1 -> 400 "(L1, sem lote)"', async () => {
    const m = await montar();
    await entrar(m, ['S1']);
    const r = await sair(m, 'PERDA', ['S1', 'A1']);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'As series escolhidas sao de lotes diferentes (L1, sem lote): faca uma saida para cada lote');
    assert.strictEqual((await serie(m, 'S1')).status, 'EM_ESTOQUE');
    assert.strictEqual((await serie(m, 'A1')).status, 'EM_ESTOQUE');
    assert.strictEqual(await fisico(m), 5);
  });
  await test('[RN-234.03] dois lotes com o L2 BLOQUEADO -> a recusa do lote bloqueado vem antes (a guarda da 233)', async () => {
    const m = await montar();
    await statusLote(m, 'L2', 'BLOQUEADO');
    const r = await sair(m, 'SAIDA', ['A1', 'B2']);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Lote L2 esta bloqueado e nao pode ser utilizado');
    await nadaSaiu(m, ['A1', 'B2']);
  });

  // Fase 5 (revisor de testes): os lotes criados em ordem INVERSA a do codigo (L2 com id menor) — a ordem da mensagem e a da guarda tem de
  // vir do codigo, nao do id nem da ordem das series.
  const montarInvertido = async () => {
    const m = await material();
    await entrar(m, ['B1', 'B2'], 'L2');
    await entrar(m, ['A1', 'A2'], 'L1');
    return m;
  };
  await test('[RN-234.03] lotes criados em ordem inversa -> "(L1, L2)"; os dois impedidos -> a recusa do L1 (Fase 5)', async () => {
    const m = await montarInvertido();
    const r = await sair(m, 'SAIDA', ['B1', 'A1']);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'As series escolhidas sao de lotes diferentes (L1, L2): faca uma saida para cada lote');
    await statusLote(m, 'L2', 'BLOQUEADO');
    await statusLote(m, 'L1', 'REPROVADO');
    const r2 = await sair(m, 'SAIDA', ['B1', 'A1']);
    assert.strictEqual(r2.body.error, 'Lote L1 esta reprovado e nao pode ser utilizado');
    await nadaSaiu(m, ['A1', 'B1']);
  });
  await test('[RN-234.01] duas series do MESMO lote numa saida -> 201, grava o L1 (Fase 5)', async () => {
    const m = await montar();
    await ok(sair(m, 'SAIDA', ['A2', 'A1']), 201);
    const l1 = await loteId(m, 'L1');
    assert.strictEqual(Number((await saidas(m))[0].lote_id), l1);
    assert.strictEqual(await linhaDoLote(m, l1), 0);
    assert.strictEqual(await linhaDoLote(m, null), 0);
  });
  await test('[RN-234.03] serie de lote apagado conta como "sem lote" (Fase 5)', async () => {
    const m = await montar();
    await entrar(m, ['X1'], 'LX');
    await dbRun(db, 'DELETE FROM lotes_almoxarifado WHERE id = ?', [await loteId(m, 'LX')]);
    const r = await sair(m, 'SAIDA', ['X1', 'A1']);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'As series escolhidas sao de lotes diferentes (L1, sem lote): faca uma saida para cada lote');
  });
  await test('[RN-234.01] serie de OUTRO material junto -> nao deriva: a recusa do claim, nao "nao pertence ao lote" (Fase 5)', async () => {
    const m = await montar();
    const outro = await montar();
    const r = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'SAIDA', quantidade: 2, motivo: 'e234',
      justificativa: 'teste 234', serie_ids: [await sid(m, 'B1'), await sid(outro, 'B2')] });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'serie B2 nao pertence a este material');
    await nadaSaiu(m, ['B1']);
  });

  await test('[RN-234.04] serie com lote mas a peca no "sem lote" (regularizada) -> nao deriva, sai do "sem lote" como antes (Fase 5)', async () => {
    const m = await material();
    await entrar(m, ['S1'], 'L1');
    const l1 = await loteId(m, 'L1');
    // o saldo antigo sem serie (linha sem lote) e a serie X1 regularizada com o lote L1 — o que a tela Lotes e Series permite
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade) VALUES (?, NULL, NULL, 1)`,
      [m.id]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = quantidade_atual + 1 WHERE id = ?', [m.id]);
    await dbRun(db, `INSERT INTO series_almoxarifado (material_id, numero, status, lote_id) VALUES (?, 'X1', 'EM_ESTOQUE', ?)`, [m.id, l1]);
    await ok(sair(m, 'SAIDA', ['S1']), 201);
    assert.strictEqual(await linhaDoLote(m, l1), 0);
    const r = await sair(m, 'SAIDA', ['X1']);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual((await saidas(m))[1].lote_id, null, 'sem derivar: o "sem lote" de antes');
    assert.strictEqual(await linhaDoLote(m, null), 0);
    assert.strictEqual(await fisico(m), 0);
  });

  // ── RN-234.04 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-234.04] series todas sem lote -> 201 com lote NULL, como antes', async () => {
    const m = await material();
    await entrar(m, ['N1', 'N2']);
    await ok(sair(m, 'SAIDA', ['N1']), 201);
    const [s] = await saidas(m);
    assert.strictEqual(s.lote_id, null);
    assert.strictEqual(await linhaDoLote(m, null), 1);
  });
  await test('[RN-234.04] lote escolhido -> igual a antes (grava o L2)', async () => {
    const m = await montar();
    const l2 = await loteId(m, 'L2');
    await ok(sair(m, 'SAIDA', ['B1'], { lote_id: l2 }), 201);
    assert.strictEqual(Number((await saidas(m))[0].lote_id), l2);
    assert.strictEqual(await linhaDoLote(m, l2), 1);
  });
  await test('[RN-234.04] o motor sem a opcao (outro chamador) -> lote NULL e a linha sem lote, como antes', async () => {
    const m = await montar();
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m.id, tipo: 'SAIDA', quantidade: 1, motivo: 'e234',
      justificativa: 'teste 234', serie_ids: [await sid(m, 'B1')] }, { exigeLote: true, exigeSerie: true });
    assert.strictEqual((await saidas(m))[0].lote_id, null);
    assert.strictEqual(await linhaDoLote(m, await loteId(m, 'L2')), 2);
    assert.strictEqual(await linhaDoLote(m, null), -1);
  });
  await test('[RN-234.04] material COM controle de lote e o lote em branco -> a recusa de "exige lote" de sempre', async () => {
    const m = await montar({ lote: 1 });
    const r = await sair(m, 'SAIDA', ['B1']);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `O material ${m.codigo} exige lote nesta movimentacao (controle por lote ligado)`);
    await nadaSaiu(m, ['B1']);
  });
  await test('[RN-234.04] AJUSTE (valor absoluto) com a serie do L2 -> sem lote derivado, como antes', async () => {
    const m = await montar();
    await ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'AJUSTE', quantidade: 3, motivo: 'e234',
      justificativa: 'teste 234', serie_ids: [await sid(m, 'B1')] }), 201);
    const aj = await dbGet(db, "SELECT lote_id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'AJUSTE'", [m.id]);
    assert.strictEqual(aj.lote_id, null);
    assert.strictEqual((await serie(m, 'B1')).status, 'BAIXADA');
  });

  // ── RN-234.05 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-234.05] a consulta da letra A acha a saida antiga ("sem lote") e nao acha a nova', async () => {
    const m = await montar();
    // o jeito antigo: o motor sem a opcao grava "sem lote"
    const antiga = await stockService.registrarMovimentacao(db, ADMIN, { material_id: m.id, tipo: 'SAIDA', quantidade: 1, motivo: 'e234',
      justificativa: 'teste 234', serie_ids: [await sid(m, 'B1')] }, { exigeLote: true, exigeSerie: true });
    const nova = await ok(sair(m, 'SAIDA', ['B2']), 201);
    const linhas = (await dbAll(db, CONSULTA_LETRA_A)).filter((x) => x.material === m.codigo);
    assert.deepStrictEqual(linhas.map((x) => [x.movimentacao_id, x.serie, x.lote_da_serie]), [[antiga.id, 'B1', 'L2']]);
    assert.ok(!linhas.some((x) => x.movimentacao_id === nova.body.id), 'a saida nova grava o lote e nao aparece');
    // o dado antigo nao e corrigido sozinho: a nova baixou do L2 (que tinha 2) e o "sem lote" continua -1
    assert.strictEqual(await linhaDoLote(m, await loteId(m, 'L2')), 1);
    assert.strictEqual(await linhaDoLote(m, null), -1);
  });

  terminou = true;
  await close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
