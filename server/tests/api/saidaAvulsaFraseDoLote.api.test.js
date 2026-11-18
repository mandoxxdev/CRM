/**
 * Etapa 246 (C539, item 9 da estimativa de 18/11) — a lista de series traz o saldo do lote da serie na REGUA DO MOTOR (a soma das linhas
 * positivas do lote), para a tela so dizer "As series marcadas saem do lote L1." quando o motor de fato usa o lote. Cada cenario amarra a
 * leitura ao que a Saida avulsa (rota v2, lote em branco) grava.
 *
 * Plano: docs/superpowers/plans/2026-11-18-almoxarifado-etapa246-saida-avulsa-frase-e-recarga-das-series.md (RN-246.01).
 * Executar: cd server && node tests/api/saidaAvulsaFraseDoLote.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 246', role: 'admin', is_superadmin: 1, email: 'a246@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 246: o saldo do lote da serie na lista de series (a regua do motor) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };

  const material = async () => {
    const c = `E246-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, 0, 1, 0)`, [c, `Mat ${c}`])).lastID;
    return { id, codigo: c };
  };
  const entrar = (m, numeros, lote) => ok(request(app).post(`${API}/movimentacoes/v2`).send({
    material_id: m.id, tipo: 'ENTRADA', quantidade: numeros.length, motivo: 'e246', series: numeros, ...(lote ? { lote } : {}),
  }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const sid = async (m, n) => (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [m.id, n])).id;
  const sair = async (m, numeros) => request(app).post(`${API}/movimentacoes/v2`).send({
    material_id: m.id, tipo: 'SAIDA', quantidade: numeros.length, motivo: 'e246', justificativa: 'teste 246',
    serie_ids: await Promise.all(numeros.map((n) => sid(m, n))),
  });
  const ultimaSaida = async (m) => dbGet(db, `SELECT lote_id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA'
    ORDER BY id DESC LIMIT 1`, [m.id]);
  const lista = async (m) => (await ok(request(app).get(`${API}/materiais/${m.id}/series?status=EM_ESTOQUE`))).body;
  const daSerie = (series, numero) => series.find((s) => s.numero === numero);
  // A serie X regularizada com o lote L e a peca no "sem lote" — o que a tela Lotes e Series permite (o mesmo molde do [RN-234.04] da 234)
  const regularizada = async (m, numero, loteCodigo) => {
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade) VALUES (?, NULL, NULL, 1)',
      [m.id]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = quantidade_atual + 1 WHERE id = ?', [m.id]);
    await dbRun(db, "INSERT INTO series_almoxarifado (material_id, numero, status, lote_id) VALUES (?, ?, 'EM_ESTOQUE', ?)",
      [m.id, numero, await loteId(m, loteCodigo)]);
  };

  await test('[RN-246.01] serie normal do L2 (2 pecas) -> lote_saldo_positivo 2 e a Saida grava o L2; sem lote -> null', async () => {
    const m = await material();
    await entrar(m, ['B1', 'B2'], 'L2');
    await entrar(m, ['N1']);
    const s = await lista(m);
    assert.strictEqual(daSerie(s, 'B1').lote_saldo_positivo, 2, JSON.stringify(daSerie(s, 'B1')));
    assert.strictEqual(daSerie(s, 'N1').lote_saldo_positivo, null, 'serie sem lote -> null');
    await ok(sair(m, ['B1']), 201);
    assert.strictEqual(Number((await ultimaSaida(m)).lote_id), await loteId(m, 'L2'), 'o motor usou o lote');
    assert.strictEqual(daSerie(await lista(m), 'B2').lote_saldo_positivo, 1, 'depois da saida: 1');
  });

  await test('[RN-246.01] serie regularizada com a peca no "sem lote" -> 0 e a Saida grava sem lote (C539)', async () => {
    const m = await material();
    await entrar(m, ['S1'], 'L1');
    await regularizada(m, 'X1', 'L1');
    await ok(sair(m, ['S1']), 201);
    const x1 = daSerie(await lista(m), 'X1');
    assert.strictEqual(x1.lote_codigo, 'L1', 'a serie diz o L1');
    assert.strictEqual(x1.lote_saldo_positivo, 0, JSON.stringify(x1));
    await ok(sair(m, ['X1']), 201);
    assert.strictEqual((await ultimaSaida(m)).lote_id, null, 'o motor nao usou o lote');
  });

  await test('[RN-246.01] duas series do L1 com 1 peca na linha do lote -> 1 (nao cobre 2) e a Saida das duas grava sem lote', async () => {
    const m = await material();
    await entrar(m, ['S1'], 'L1');
    await regularizada(m, 'X1', 'L1');
    const s = await lista(m);
    assert.strictEqual(daSerie(s, 'S1').lote_saldo_positivo, 1);
    assert.strictEqual(daSerie(s, 'X1').lote_saldo_positivo, 1);
    await ok(sair(m, ['S1', 'X1']), 201);
    assert.strictEqual((await ultimaSaida(m)).lote_id, null, 'nao cobre: o motor nao usou o lote');
  });

  await test('[RN-246.01] linha negativa de legado no lote nao entra na soma (a regua do motor: so as positivas)', async () => {
    const m = await material();
    await entrar(m, ['A1'], 'L1');
    const l1 = await loteId(m, 'L1');
    // uma segunda linha do mesmo lote, negativa (legado), em outra localizacao
    const loc = (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?, 'leg 246', 1)",
      [`LEG246-${seq}`])).lastID;
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade) VALUES (?, ?, ?, -1)',
      [m.id, loc, l1]);
    assert.strictEqual(daSerie(await lista(m), 'A1').lote_saldo_positivo, 1, 'a negativa fica fora');
    await ok(sair(m, ['A1']), 201);
    assert.strictEqual(Number((await ultimaSaida(m)).lote_id), l1, 'o motor usou o lote (a positiva cobre)');
  });

  terminou = true;
  await close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
