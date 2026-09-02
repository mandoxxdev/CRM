/**
 * Etapa 6b, Task 5, fix round 1 — `cancelarMovimentacao` compensa SALDO e SERIE quando o INSERT
 * do ledger de ESTORNO falha DEPOIS que o efeito inverso ja tinha rodado com sucesso.
 *
 * Achado do review (sonda): ate este fix, o `catch` de `cancelarMovimentacao` so desfazia o CLAIM
 * (`cancelado = 0`) — nunca o saldo nem a serie. Entrada de 2 series -> saida das 2 -> cancelar a
 * saida com o INSERT do ledger forcado a falhar -> saldo volta a 2 e series voltam a EM_ESTOQUE
 * (efeito aplicado com sucesso), mas `cancelado` volta a 0 (o claim foi desfeito). Um SEGUNDO
 * `/cancelar` na MESMA movimentacao tem sucesso (nada mais bloqueia) e soma o saldo de novo
 * (2 -> 4) sem tocar serie (que ja estava EM_ESTOQUE, fora do filtro de `reverterSaida`) —
 * `presentes=2 != quantidade_atual=4`, invariante corrompido PERMANENTEMENTE (nao ha mais claim
 * pra barrar essa segunda chamada — ela e legitima do ponto de vista dela).
 *
 * Molde: `serieLedgerFalha.api.test.js` (tecnica de interceptacao de `db.run` pra forcar o INSERT
 * do ledger a falhar DEPOIS que o efeito ja rodou) + `serieEstornoDevolucao.api.test.js` (setup
 * via ENTRADA/SAIDA v2, `assertInvarianteSerie`).
 *
 * Cada teste cobre os dois lados do cenario: (a) cancelamento com o ledger falhando -> 500, e
 * TUDO volta ao estado pre-cancelamento (saldo, series, `cancelado=0` — o estorno nao aconteceu
 * de verdade, entao a movimentacao original continua ativa); (b) o retry legitimo (novo
 * `/cancelar`, sem interceptacao) tem sucesso e produz o resultado correto.
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

let seq = 0;
async function novoMaterial(db, { controle_serie = 1, qtd = 0 } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_serie)
     VALUES (?,?,'UN',?,1,?)`,
    [`MAT-ESTLED-${seq}`, `Material estorno+ledger ${seq}`, qtd, controle_serie ? 1 : 0]);
  return r.lastID;
}
const totalDoMaterial = async (db, id) => (await dbGet(db,
  'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;

async function entrarComSeries(app, db, materialId, numeros, extra = {}) {
  const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: materialId, tipo: 'ENTRADA', quantidade: numeros.length, motivo: 'setup', series: numeros, ...extra });
  assert.strictEqual(res.status, 201, `setup de entrada falhou: ${JSON.stringify(res.body)}`);
  const linhas = await dbAll(db, 'SELECT * FROM series_almoxarifado WHERE movimentacao_entrada_id = ? ORDER BY id', [res.body.id]);
  return { movId: res.body.id, series: linhas };
}

// Intercepta db.run para o INSERT do ESTORNO em movimentacoes_almoxarifado falhar — simula o
// ledger quebrando DEPOIS que o efeito inverso (saldo + serie) ja rodou. So o INSERT de dentro do
// wrapper e afetado (o setup, fora dele, roda com db.run normal). Restaura no finally.
async function comFalhaNoInsertDoLedger(db, fn) {
  const original = db.run.bind(db);
  db.run = function interceptado(sql, params, callback) {
    if (typeof sql === 'string' && sql.includes('INSERT INTO movimentacoes_almoxarifado')) {
      return callback(new Error('falha forcada no INSERT do ledger de ESTORNO (teste)'));
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

  await test('estorno de SAIDA: falha do ledger nao deixa saldo/serie revertidos com o claim desfeito (sonda do review)', async () => {
    const mat = await novoMaterial(db, { controle_serie: 1 });
    const { series } = await entrarComSeries(app, db, mat, ['SN-EL-A', 'SN-EL-B']);
    const sai = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({
        material_id: mat, tipo: 'SAIDA', quantidade: 2,
        serie_ids: [series[0].id, series[1].id], justificativa: 'saida para o cenario da sonda',
      });
    assert.strictEqual(sai.status, 201, JSON.stringify(sai.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 0);

    // (a) cancelamento com o INSERT do ledger de ESTORNO forcado a falhar
    const falhou = await comFalhaNoInsertDoLedger(db, () => request(app)
      .post(`/api/almoxarifado/movimentacoes/${sai.body.id}/cancelar`)
      .send({ motivo: 'estorno que vai falhar no ledger' }));
    assert.strictEqual(falhou.status, 500, JSON.stringify(falhou.body));

    // saldo e series precisam ter voltado ao estado ANTES desta tentativa de cancelamento —
    // o efeito inverso (saldo devolvido, series EM_ESTOQUE) tinha rodado com sucesso antes do
    // INSERT falhar, e o catch agora desfaz isso tambem, nao so o claim.
    assert.strictEqual(await totalDoMaterial(db, mat), 0, 'saldo NAO devia ter ficado devolvido — a compensacao devolve ao estado pre-cancelamento');
    const a1 = await dbGet(db, 'SELECT status, movimentacao_saida_id FROM series_almoxarifado WHERE id = ?', [series[0].id]);
    const b1 = await dbGet(db, 'SELECT status, movimentacao_saida_id FROM series_almoxarifado WHERE id = ?', [series[1].id]);
    assert.strictEqual(a1.status, 'ENTREGUE', 'serie NAO devia ter ficado EM_ESTOQUE com o cancelamento desfeito');
    assert.strictEqual(b1.status, 'ENTREGUE');
    assert.strictEqual(a1.movimentacao_saida_id, sai.body.id, 'vinculo com a saida devia ter sido restaurado');
    assert.strictEqual(b1.movimentacao_saida_id, sai.body.id);
    const movOriginal = await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [sai.body.id]);
    assert.strictEqual(movOriginal.cancelado, 0, 'o claim precisa ter sido desfeito — o estorno nao aconteceu de verdade');
    await assertInvarianteSerie(db, mat);

    // (b) retry legitimo, sem interceptacao: agora tem que funcionar de verdade
    const ok = await request(app).post(`/api/almoxarifado/movimentacoes/${sai.body.id}/cancelar`)
      .send({ motivo: 'estorno de verdade, sem falha' });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 2, 'saldo devia ter voltado a 2 no cancelamento que deu certo');
    const a2 = await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE id = ?', [series[0].id]);
    const b2 = await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE id = ?', [series[1].id]);
    assert.strictEqual(a2.status, 'EM_ESTOQUE');
    assert.strictEqual(b2.status, 'EM_ESTOQUE');
    await assertInvarianteSerie(db, mat);
  });

  await test('estorno de ENTRADA: falha do ledger nao deixa saldo/serie revertidos com o claim desfeito', async () => {
    const mat = await novoMaterial(db, { controle_serie: 1 });
    const { movId, series } = await entrarComSeries(app, db, mat, ['SN-EL-C', 'SN-EL-D']);
    assert.strictEqual(await totalDoMaterial(db, mat), 2);

    // (a) cancelamento com o INSERT do ledger de ESTORNO forcado a falhar
    const falhou = await comFalhaNoInsertDoLedger(db, () => request(app)
      .post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`)
      .send({ motivo: 'estorno de entrada que vai falhar no ledger' }));
    assert.strictEqual(falhou.status, 500, JSON.stringify(falhou.body));

    assert.strictEqual(await totalDoMaterial(db, mat), 2, 'saldo NAO devia ter ficado debitado — a compensacao devolve ao estado pre-cancelamento');
    const c1 = await dbGet(db, 'SELECT status, status_motivo FROM series_almoxarifado WHERE id = ?', [series[0].id]);
    const d1 = await dbGet(db, 'SELECT status, status_motivo FROM series_almoxarifado WHERE id = ?', [series[1].id]);
    assert.strictEqual(c1.status, 'EM_ESTOQUE', 'serie NAO devia ter ficado ESTORNADA com o cancelamento desfeito');
    assert.strictEqual(d1.status, 'EM_ESTOQUE');
    const movOriginal = await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [movId]);
    assert.strictEqual(movOriginal.cancelado, 0, 'o claim precisa ter sido desfeito — o estorno nao aconteceu de verdade');
    await assertInvarianteSerie(db, mat);

    // (b) retry legitimo, sem interceptacao
    const ok = await request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`)
      .send({ motivo: 'estorno de entrada de verdade, sem falha' });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 0, 'saldo devia ter voltado a 0 no cancelamento que deu certo');
    const c2 = await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE id = ?', [series[0].id]);
    const d2 = await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE id = ?', [series[1].id]);
    assert.strictEqual(c2.status, 'ESTORNADA');
    assert.strictEqual(d2.status, 'ESTORNADA');
    await assertInvarianteSerie(db, mat);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
