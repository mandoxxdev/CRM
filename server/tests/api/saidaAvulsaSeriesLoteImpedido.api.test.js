/**
 * Etapa 233 (D (232) 1; B1527) — a saida avulsa (Movimentacoes, rota v2) com o lote em BRANCO checa o lote das series: a serie de lote
 * bloqueado/reprovado nao sai por nenhuma saida; a de lote vencido sem liberacao nao sai para consumo (SAIDA), mas sai por PERDA (descarte);
 * o AJUSTE nao muda; o motor chamado sem a opcao (outros chamadores) tambem nao muda. Antes desta etapa, com o lote em branco, o motor nao
 * olhava o lote das series (sonda da Fase 0: 201 nos quatro casos).
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa233-saida-avulsa-series-lote-impedido.md (RN-233.01 a .04).
 * Executar: cd server && node tests/api/saidaAvulsaSeriesLoteImpedido.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 233', role: 'admin', is_superadmin: 1, email: 'a233@t.com' };
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 233: a saida avulsa checa o lote das series com o lote em branco ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };

  const material = async ({ lote = 0 } = {}) => {
    const c = `E233-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, ?, 1, 0)`, [c, `Mat ${c}`, lote])).lastID;
    return { id, codigo: c };
  };
  const entrar = (m, numeros, lote) => ok(request(app).post(`${API}/movimentacoes/v2`).send({
    material_id: m.id, tipo: 'ENTRADA', quantidade: numeros.length, motivo: 'e233', series: numeros, ...(lote ? { lote } : {}),
  }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const statusLote = async (m, codigo, st) => ok(request(app).put(`${API}/lotes/${await loteId(m, codigo)}/status`)
    .send({ status: st, justificativa: 'teste 233' }));
  const vencerOntem = async (m, codigo) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?',
    [dia(-1), await loteId(m, codigo)]);
  const sid = async (m, n) => (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [m.id, n])).id;
  const statusSerie = async (m, n) => (await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE material_id = ? AND numero = ?',
    [m.id, n])).status;
  const fisico = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q);
  const livro = async (m) => (await dbAll(db, `SELECT tipo FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo <> 'ENTRADA'`,
    [m.id])).length;
  const sair = async (m, tipo, numeros, extra = {}) => request(app).post(`${API}/movimentacoes/v2`).send({
    material_id: m.id, tipo, quantidade: numeros.length, motivo: 'e233', justificativa: 'teste 233',
    serie_ids: await Promise.all(numeros.map((n) => sid(m, n))), ...extra,
  });
  // A montagem: A1, A2 em L1 e B1, B2 em L2 (ATIVOS), material SEM controle de lote (o lote em branco e aceito).
  const montar = async (opc) => {
    const m = await material(opc);
    await entrar(m, ['A1', 'A2'], 'L1');
    await entrar(m, ['B1', 'B2'], 'L2');
    return m;
  };
  const nadaSaiu = async (m) => {
    assert.strictEqual(await statusSerie(m, 'B1'), 'EM_ESTOQUE', 'B1 continua em estoque');
    assert.strictEqual(await fisico(m), 4, 'fisico igual');
    assert.strictEqual(await livro(m), 0, 'nenhuma linha no livro');
  };

  // ── RN-233.01 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-233.01] SAIDA com o lote em branco e serie de L2 BLOQUEADO -> 400 a mensagem do lote escolhido, nada sai', async () => {
    const m = await montar();
    await statusLote(m, 'L2', 'BLOQUEADO');
    const r = await sair(m, 'SAIDA', ['B1']);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Lote L2 esta bloqueado e nao pode ser utilizado');
    await nadaSaiu(m);
    // a mesma literal do lote escolhido (a mesma funcao)
    const r2 = await sair(m, 'SAIDA', ['B1'], { lote_id: await loteId(m, 'L2') });
    assert.strictEqual(r2.body.error, r.body.error);
    // controle: a serie de L1 sai
    await ok(sair(m, 'SAIDA', ['A1']), 201);
    assert.strictEqual(await statusSerie(m, 'A1'), 'ENTREGUE');
  });
  await test('[RN-233.01] SAIDA e PERDA com L2 REPROVADO -> 400 "esta reprovado"; PERDA com L2 BLOQUEADO -> 400', async () => {
    const m = await montar();
    await statusLote(m, 'L2', 'REPROVADO');
    for (const tipo of ['SAIDA', 'PERDA']) {
      const r = await sair(m, tipo, ['B1']);
      assert.strictEqual(r.status, 400, `${tipo}: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, 'Lote L2 esta reprovado e nao pode ser utilizado');
    }
    await nadaSaiu(m);
    const m2 = await montar();
    await statusLote(m2, 'L2', 'BLOQUEADO');
    const r = await sair(m2, 'PERDA', ['B2']);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Lote L2 esta bloqueado e nao pode ser utilizado');
  });

  // ── RN-233.02 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-233.02] L2 vencido ontem: SAIDA -> 400 vencido; PERDA -> 201 (o descarte tira o vencido)', async () => {
    const m = await montar();
    await vencerOntem(m, 'L2');
    const r = await sair(m, 'SAIDA', ['B1']);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(r.body.error.startsWith(`Lote L2 vencido em ${dia(-1)} nao pode sair para consumo.`), r.body.error);
    await nadaSaiu(m);
    await ok(sair(m, 'PERDA', ['B1']), 201);
    assert.notStrictEqual(await statusSerie(m, 'B1'), 'EM_ESTOQUE', 'a PERDA baixou a serie');
  });
  await test('[RN-233.02] outro tipo de consumo da v2 (SAIDA_PRODUCAO) com L2 vencido -> 400 vencido (Fase 2 M6)', async () => {
    const m = await montar();
    await vencerOntem(m, 'L2');
    const r = await sair(m, 'SAIDA_PRODUCAO', ['B1'], { emergencial: true });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(r.body.error.startsWith(`Lote L2 vencido em ${dia(-1)} nao pode sair para consumo.`), r.body.error);
    await nadaSaiu(m);
  });
  await test('[RN-233.04] serie ja entregue de lote bloqueado -> a recusa do claim, nao a do lote (Fase 2 M4)', async () => {
    const m = await montar();
    await ok(sair(m, 'SAIDA', ['B1']), 201);
    await statusLote(m, 'L2', 'BLOQUEADO');
    const r = await sair(m, 'SAIDA', ['B1']);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(!/^Lote L2/.test(r.body.error), r.body.error);
  });
  await test('[RN-233.02] vencido com o vencimento liberado -> SAIDA 201', async () => {
    const m = await montar();
    await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ?, vencimento_liberado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [dia(-1), await loteId(m, 'L2')]);
    await ok(sair(m, 'SAIDA', ['B1']), 201);
  });

  // ── RN-233.03 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-233.03] series de dois lotes, L2 BLOQUEADO -> 400 e A1 continua em estoque', async () => {
    const m = await montar();
    await statusLote(m, 'L2', 'BLOQUEADO');
    const r = await sair(m, 'SAIDA', ['A1', 'B1']);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Lote L2 esta bloqueado e nao pode ser utilizado');
    assert.strictEqual(await statusSerie(m, 'A1'), 'EM_ESTOQUE');
    await nadaSaiu(m);
  });

  // ── RN-233.04 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-233.04] serie sem lote -> 201; AJUSTE -1 com a serie de L2 BLOQUEADO -> 201 (nao muda)', async () => {
    const m = await material();
    await entrar(m, ['N1', 'N2']);
    await ok(sair(m, 'SAIDA', ['N1']), 201);
    const m2 = await montar();
    await statusLote(m2, 'L2', 'BLOQUEADO');
    await ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m2.id, tipo: 'AJUSTE', quantidade: 3, motivo: 'e233',
      justificativa: 'teste 233', serie_ids: [await sid(m2, 'B1')] }), 201);
    assert.strictEqual(await statusSerie(m2, 'B1'), 'BAIXADA');
  });
  await test('[RN-233.04] o motor sem a opcao (outro chamador) -> como antes, a serie de L2 BLOQUEADO sai', async () => {
    const m = await montar();
    await statusLote(m, 'L2', 'BLOQUEADO');
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m.id, tipo: 'SAIDA', quantidade: 1, motivo: 'e233',
      justificativa: 'teste 233', serie_ids: [await sid(m, 'B1')] }, { exigeLote: true, exigeSerie: true });
    assert.strictEqual(await statusSerie(m, 'B1'), 'ENTREGUE');
  });
  await test('[RN-233.04] material COM controle de lote e o lote em branco -> a recusa de "exige lote" de sempre', async () => {
    const m = await montar({ lote: 1 });
    await statusLote(m, 'L2', 'BLOQUEADO');
    const r = await sair(m, 'SAIDA', ['B1']);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `O material ${m.codigo} exige lote nesta movimentacao (controle por lote ligado)`);
  });

  terminou = true;
  await close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
