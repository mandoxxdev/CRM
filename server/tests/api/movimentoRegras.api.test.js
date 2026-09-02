const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
async function criarMaterial(db, codigo, qtd = 100) {
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, ativo) VALUES (?,?,?,1)`,
    [codigo, `Material ${codigo}`, qtd]);
  return r.lastID;
}

(async () => {
  const { app, db, close } = await createTestApp();
  const mat = await criarMaterial(db, 'REG-001', 100);

  await test('SAIDA_PRODUCAO sem OS nem projeto falha 400', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 5, justificativa: 'só justificativa não basta' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/OS|projeto/i.test(res.body.error), res.body.error);
  });

  await test('SAIDA_PRODUCAO com os_id passa', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 5, os_id: 1 });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  await test('SAIDA avulsa passa com centro de custo (sem justificativa)', async () => {
    const cc = await request(app).post('/api/almoxarifado/centros-custo')
      .send({ codigo: 'CC-REG', nome: 'Regras' });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 2, centro_custo_id: cc.body.id });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  await test('SAIDA avulsa sem nenhum vinculo nem justificativa falha', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 2 });
    assert.strictEqual(res.status, 400);
  });

  // SUCATA saiu da v2 na Etapa 9 Task 5 (virou TIPOS_DEDICADOS): a partir daqui a rota recusa o
  // tipo SEMPRE, com ou sem justificativa, entao o teste "com justificativa passa" nao faz mais
  // sentido aqui. A recusa da v2 esta coberta em sucataDedicada.api.test.js; a regra de negocio
  // "SUCATA exige justificativa" (movementRules.REGRAS_VINCULO) nao mudou de lugar — continua
  // valendo para quem chama o motor por dentro, e a prova disso tambem migrou para la (o teste
  // "SUCATA via motor direto ainda exige justificativa").

  await test('[controle da migracao acima] v2 recusa SUCATA mesmo com justificativa (nao e mais so falta dela)', async () => {
    const com = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SUCATA', quantidade: 1, justificativa: 'Material danificado' });
    assert.strictEqual(com.status, 400, `SUCATA nao devia mais passar pela v2 nem com justificativa: ${JSON.stringify(com.body)}`);
  });

  let emergId;
  await test('emergencial sem justificativa falha; com justificativa passa e fica pendente', async () => {
    const sem = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 3, emergencial: true });
    assert.strictEqual(sem.status, 400);
    const com = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 3, emergencial: true, justificativa: 'Parada de máquina — regularizo depois' });
    assert.strictEqual(com.status, 201, JSON.stringify(com.body));
    emergId = com.body.id;
    const mov = await dbGet(db, 'SELECT emergencial, regularizacao_pendente FROM movimentacoes_almoxarifado WHERE id = ?', [emergId]);
    assert.strictEqual(mov.emergencial, 1);
    assert.strictEqual(mov.regularizacao_pendente, 1);
  });

  await test('regularizar exige um vinculo e limpa a pendencia', async () => {
    const sem = await request(app).put(`/api/almoxarifado/movimentacoes/${emergId}/regularizar`).send({});
    assert.strictEqual(sem.status, 400);
    const com = await request(app).put(`/api/almoxarifado/movimentacoes/${emergId}/regularizar`).send({ os_id: 42 });
    assert.strictEqual(com.status, 200, JSON.stringify(com.body));
    const mov = await dbGet(db, 'SELECT os_id, regularizacao_pendente FROM movimentacoes_almoxarifado WHERE id = ?', [emergId]);
    assert.strictEqual(mov.os_id, 42);
    assert.strictEqual(mov.regularizacao_pendente, 0);
  });

  await test('v1 delegada continua funcionando (SAIDA com motivo = justificativa)', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 1, motivo: 'Consumo bancada' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  await test('payload com shape invalido (quantidade string) retorna 400 Zod', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 'dez' });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('quantidade'), res.body.error);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
