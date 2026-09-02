/**
 * Etapa 6b, Task 4, fix round 1 — motor: catch amplo compensa o FISICO (nao so a serie) quando o
 * INSERT do ledger (`movimentacoes_almoxarifado`) falha DEPOIS que o credito/debito ja rodou.
 *
 * Achado do review: o catch amplo de `registrarMovimentacao` so desfazia serie
 * (`desfazerEntrada`/`desfazerSaida`), nunca o fisico. Na ENTRADA isso furava o proprio invariante
 * que a etapa promete: a serie sumia (desfeita) e `quantidade_atual` continuava creditada —
 * presentes=0 != quantidade_atual=N. Na SAIDA o buraco era o inverso (serie reivindicada e debito
 * fisico orfaos do movimento). Os testes abaixo forcam o INSERT do ledger a falhar depois que o
 * efeito ja aconteceu, interceptando `db.run` — e sao o controle positivo natural: sem o fix, o
 * caso de entrada falha (quantidade_atual fica +N com as series apagadas).
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { assertInvarianteSerie } = require('../helpers/serieInvariante');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const JUST = { justificativa: 'teste de falha do ledger' };

let seq = 0;
async function novoMaterial(db, { controle_serie = 1, qtd = 0 } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_serie)
     VALUES (?,?,'UN',?,1,?)`, [`MAT-LEDGER-${seq}`, `Material falha ledger ${seq}`, qtd, controle_serie ? 1 : 0]);
  return r.lastID;
}
const totalDoMaterial = async (db, id) => (await dbGet(db,
  'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;
const somaDasLinhas = async (db, id) => (await dbGet(db,
  'SELECT COALESCE(SUM(quantidade),0) as total FROM estoque_saldo_almoxarifado WHERE material_id = ?', [id])).total;

async function entrarComSeries(app, db, materialId, numeros, extra = {}) {
  const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: materialId, tipo: 'ENTRADA', quantidade: numeros.length, motivo: 'setup', series: numeros, ...extra });
  assert.strictEqual(res.status, 201, `setup de entrada falhou: ${JSON.stringify(res.body)}`);
  return dbAll(db, 'SELECT * FROM series_almoxarifado WHERE movimentacao_entrada_id = ? ORDER BY id', [res.body.id]);
}

// Intercepta db.run para o INSERT em movimentacoes_almoxarifado falhar — simula o ledger
// quebrando DEPOIS que o efeito fisico (e o claim/creditos de serie) ja rodaram. Restaura no
// finally, mesmo se `fn` lancar.
async function comFalhaNoInsertDoLedger(db, fn) {
  const original = db.run.bind(db);
  db.run = function interceptado(sql, params, callback) {
    if (typeof sql === 'string' && sql.includes('INSERT INTO movimentacoes_almoxarifado')) {
      return callback(new Error('falha forcada no INSERT do ledger (teste)'));
    }
    return original(sql, params, callback);
  };
  try {
    return await fn();
  } finally {
    db.run = original;
  }
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('entrada com series: falha do ledger reverte quantidade_atual E desfaz as series (sem o fix, so a serie voltava)', async () => {
    const mat = await novoMaterial(db, { controle_serie: 1 });

    const res = await comFalhaNoInsertDoLedger(db, () => request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 2, motivo: 'teste', series: ['SN-LED-A', 'SN-LED-B'] }));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));

    assert.strictEqual(await totalDoMaterial(db, mat), 0, 'quantidade_atual deveria ter voltado a 0 apos a falha do ledger');
    assert.strictEqual(await somaDasLinhas(db, mat), 0, 'a linha de saldo deveria ter voltado a 0');
    const series = await dbAll(db, 'SELECT * FROM series_almoxarifado WHERE material_id = ?', [mat]);
    assert.strictEqual(series.length, 0, 'as series criadas deveriam ter sido apagadas pela compensacao (CRIACAO)');
    const mov = await dbGet(db, 'SELECT COUNT(*) as n FROM movimentacoes_almoxarifado WHERE material_id = ?', [mat]);
    assert.strictEqual(mov.n, 0, 'nenhuma movimentacao deveria ter sido gravada');

    await assertInvarianteSerie(db, mat);
  });

  await test('entrada com series (custo informado): falha do ledger restaura quantidade_atual e custo_medio/custo_unitario anteriores', async () => {
    const mat = await novoMaterial(db, { controle_serie: 1 });
    // custo inicial: uma entrada de sucesso, sem serie, so pra dar um custo_medio "anterior" != 0
    await dbRun(db, 'UPDATE materiais_almoxarifado SET custo_medio = 10, custo_unitario = 10 WHERE id = ?', [mat]);
    const antes = await dbGet(db, 'SELECT custo_medio, custo_unitario FROM materiais_almoxarifado WHERE id = ?', [mat]);

    const res = await comFalhaNoInsertDoLedger(db, () => request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({
        material_id: mat, tipo: 'ENTRADA', quantidade: 1, motivo: 'teste',
        series: ['SN-LED-C'], custo_unitario: 50,
      }));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));

    const depois = await dbGet(db, 'SELECT quantidade_atual, custo_medio, custo_unitario FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(depois.quantidade_atual, 0);
    assert.strictEqual(depois.custo_medio, antes.custo_medio, 'custo_medio deveria ter voltado ao valor anterior ao movimento');
    assert.strictEqual(depois.custo_unitario, antes.custo_unitario, 'custo_unitario deveria ter voltado ao valor anterior ao movimento');
    await assertInvarianteSerie(db, mat);
  });

  await test('saida com series: falha do ledger devolve as series a EM_ESTOQUE e o debito fisico', async () => {
    const mat = await novoMaterial(db, { controle_serie: 1 });
    const series = await entrarComSeries(app, db, mat, ['SN-LED-D', 'SN-LED-E']);

    const res = await comFalhaNoInsertDoLedger(db, () => request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({
        material_id: mat, tipo: 'SAIDA', quantidade: 1,
        serie_ids: [series[0].id], ...JUST,
      }));
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));

    assert.strictEqual(await totalDoMaterial(db, mat), 2, 'quantidade_atual deveria ter voltado a 2 apos a falha do ledger');
    assert.strictEqual(await somaDasLinhas(db, mat), 2, 'a linha de saldo deveria ter voltado a 2');
    const a = await dbGet(db, 'SELECT status, movimentacao_saida_id FROM series_almoxarifado WHERE id = ?', [series[0].id]);
    assert.strictEqual(a.status, 'EM_ESTOQUE', 'a serie reivindicada deveria ter voltado a EM_ESTOQUE');
    assert.strictEqual(a.movimentacao_saida_id, null, 'o vinculo com a movimentacao deveria ter sido desfeito');
    const movsSaida = await dbGet(db, "SELECT COUNT(*) as n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA'", [mat]);
    assert.strictEqual(movsSaida.n, 0, 'nenhuma movimentacao de saida deveria ter sido gravada');

    await assertInvarianteSerie(db, mat);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
