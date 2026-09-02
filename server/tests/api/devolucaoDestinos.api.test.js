/**
 * Etapa 7, Task 1 — o bug do SUCATA na devolucao.
 *
 * Devolver material para sucata baixava o estoque DUAS vezes: o material ja tinha saido na
 * entrega, e o returnService emitia um SUCATA (tipo de saida para o motor), que descontava de
 * novo um saldo que nunca voltou. Nenhum teste existente pegava isso — a leitura do codigo nao
 * mostrava o problema, so a execucao.
 *
 * Correcao adotada: destino SUCATA emite ENTRADA_DEVOLUCAO seguida de SUCATA (entra e sai). O
 * saldo fecha certo e o livro conta as duas coisas: voltou, e foi sucateada. A alternativa
 * descartada era nao movimentar nada no destino SUCATA — o saldo tambem ficaria certo, mas a
 * sucata sumiria do livro, e a feature 15 (retalhos e sucatas) vai precisar dela la.
 *
 * CONTROLE POSITIVO OBRIGATORIO: o teste 'devolucao para ESTOQUE soma ao saldo' existe para
 * provar que esta medicao SABE falhar. Teste de saldo que passa de primeira nesta base ja
 * enganou tres vezes.
 *
 * Executar: cd server && node tests/api/devolucaoDestinos.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function novoMaterial(db, qtd = 0) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote)
     VALUES (?,?,'UN',?,1,0)`, [`DEVD-${seq}`, `Material devolucao ${seq}`, qtd]);
  return r.lastID;
}
const totalDoMaterial = async (db, id) => (await dbGet(db,
  'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;
const movimentosDoMaterial = (db, id) => dbAll(db,
  'SELECT tipo, quantidade, referencia FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id', [id]);

async function entregar(db, materialId, qtd) {
  await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: materialId, tipo: 'SAIDA', quantidade: qtd, justificativa: 'entrega para a producao' });
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  // A sonda exata do design: 100 -> saida 10 -> 90 -> devolucao 3 para SUCATA -> tem de continuar
  // 90 (o material ja tinha saido; a sucata nao pode descontar de novo).
  await test('devolucao para SUCATA nao baixa estoque duas vezes', async () => {
    const mat = await novoMaterial(db, 100);
    await entregar(db, mat, 10);
    assert.strictEqual(await totalDoMaterial(db, mat), 90, 'setup errado: a saida nao baixou 10');

    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 3, motivo: 'DANIFICADO', destino: 'SUCATA' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 90,
      'o estoque foi baixado duas vezes: a entrega ja tinha descontado, e o SUCATA descontou de novo');
  });

  // CONTROLE POSITIVO: se a medicao acima estivesse cega (por exemplo lendo a coluna errada ou
  // um material que nunca se move), este teste passaria igual. Ele so passa se o numero mudar.
  await test('[controle positivo] devolucao para ESTOQUE soma ao saldo', async () => {
    const mat = await novoMaterial(db, 100);
    await entregar(db, mat, 10);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 2, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 92,
      'a devolucao ao estoque nao somou — a medicao deste arquivo esta cega');
  });

  await test('devolucao para SUCATA registra ENTRADA_DEVOLUCAO e SUCATA no livro', async () => {
    const mat = await novoMaterial(db, 50);
    await entregar(db, mat, 5);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 5, motivo: 'DANIFICADO', destino: 'SUCATA' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const movs = await movimentosDoMaterial(db, mat);
    const tipos = movs.map((m) => m.tipo);
    assert.deepStrictEqual(tipos, ['SAIDA', 'ENTRADA_DEVOLUCAO', 'SUCATA'],
      `a sucata precisa aparecer no livro como entrada seguida de saida, veio ${tipos.join(',')}`);
  });

  // Sem `referencia`, a devolucao que virou sucata fica sem NENHUM fio ligando o lancamento do
  // livro ao registro da devolucao. Ate esta task so ESTOQUE/QUARENTENA gravavam.
  await test('todos os destinos gravam referencia DEV-<id> nas movimentacoes que emitem', async () => {
    for (const destino of ['ESTOQUE', 'QUARENTENA', 'SUCATA', 'RETRABALHO']) {
      const mat = await novoMaterial(db, 50);
      await entregar(db, mat, 5);
      const res = await request(app).post('/api/almoxarifado/devolucoes')
        .send({ material_id: mat, quantidade: 5, motivo: 'DANIFICADO', destino });
      assert.strictEqual(res.status, 201, `${destino}: ${JSON.stringify(res.body)}`);

      const movs = (await movimentosDoMaterial(db, mat)).filter((m) => m.tipo !== 'SAIDA');
      assert.ok(movs.length > 0, `${destino} nao emitiu movimentacao nenhuma`);
      for (const m of movs) {
        assert.strictEqual(m.referencia, `DEV-${res.body.id}`,
          `${destino}/${m.tipo}: referencia veio ${m.referencia}, esperava DEV-${res.body.id}`);
      }
    }
  });

  // Regressao: RETRABALHO ja estava correto (tipo neutro ao saldo desde a Etapa 6). Se alguem
  // "consertar" o RETRABALHO junto com o SUCATA, este teste pega.
  await test('devolucao para RETRABALHO continua neutra ao saldo', async () => {
    const mat = await novoMaterial(db, 50);
    await entregar(db, mat, 5);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 5, motivo: 'RECUPERAVEL', destino: 'RETRABALHO' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 45, 'RETRABALHO mexeu no saldo');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
