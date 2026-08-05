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

let reqSeq = 0;
function reqNumero() {
  reqSeq += 1;
  return `EST-REQ-${reqSeq}`;
}
async function criarRequisicaoEmSeparacao(db, materialId, quantidade) {
  const reqRes = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
    (numero, solicitante_id, solicitante_nome, status) VALUES (?, 1, 'Solicitante Teste', 'EM_SEPARACAO')`,
    [reqNumero()]);
  const reqId = reqRes.lastID;
  const itemRes = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
    (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
    VALUES (?, ?, ?, ?, 0, 0)`,
    [reqId, materialId, quantidade, quantidade]);
  return { reqId, itemId: itemRes.lastID };
}

(async () => {
  const { app, db, close } = await createTestApp();

  await test('estorno de ENTRADA baixa o saldo e vincula os movimentos', async () => {
    const mat = await criarMaterial(db, 'EST-001', 100);
    const ent = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 50 });
    const est = await request(app).post(`/api/almoxarifado/movimentacoes/${ent.body.id}/cancelar`)
      .send({ motivo: 'Lançamento errado' });
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 100);
    const orig = await dbGet(db, 'SELECT cancelado, movimento_estorno_id FROM movimentacoes_almoxarifado WHERE id = ?', [ent.body.id]);
    assert.strictEqual(orig.cancelado, 1);
    const estMov = await dbGet(db, 'SELECT tipo, quantidade FROM movimentacoes_almoxarifado WHERE id = ?', [orig.movimento_estorno_id]);
    assert.strictEqual(estMov.tipo, 'ESTORNO');
    assert.strictEqual(estMov.quantidade, 50);
  });

  await test('estorno de SAIDA devolve o saldo', async () => {
    const mat = await criarMaterial(db, 'EST-002', 100);
    const sai = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 30, justificativa: 'x' });
    await request(app).post(`/api/almoxarifado/movimentacoes/${sai.body.id}/cancelar`).send({ motivo: 'devolver' });
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 100);
  });

  await test('estorno de AJUSTE restaura o saldo anterior', async () => {
    const mat = await criarMaterial(db, 'EST-003', 80);
    const aj = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 55, justificativa: 'inventário' });
    await request(app).post(`/api/almoxarifado/movimentacoes/${aj.body.id}/cancelar`).send({ motivo: 'inventário errado' });
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 80);
  });

  await test('estorno de TRANSFERENCIA devolve o saldo para a origem', async () => {
    const locA = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('EST-A','A')`)).lastID;
    const locB = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('EST-B','B')`)).lastID;
    const mat = await criarMaterial(db, 'EST-004', 40);
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,40)`, [mat, locA]);
    const tr = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 15, localizacao_origem_id: locA, localizacao_destino_id: locB });
    assert.strictEqual(tr.status, 201, JSON.stringify(tr.body));
    await request(app).post(`/api/almoxarifado/movimentacoes/${tr.body.id}/cancelar`).send({ motivo: 'voltar' });
    const sa = await dbGet(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id=? AND localizacao_id=?', [mat, locA]);
    const sb = await dbGet(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id=? AND localizacao_id=?', [mat, locB]);
    assert.strictEqual(sa.quantidade, 40);
    assert.strictEqual(sb.quantidade, 0);
  });

  await test('estorno duplo falha; estornar um ESTORNO falha; sem motivo falha', async () => {
    const mat = await criarMaterial(db, 'EST-005', 10);
    const ent = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 5 });
    const semMotivo = await request(app).post(`/api/almoxarifado/movimentacoes/${ent.body.id}/cancelar`).send({});
    assert.strictEqual(semMotivo.status, 400);
    const ok = await request(app).post(`/api/almoxarifado/movimentacoes/${ent.body.id}/cancelar`).send({ motivo: 'x' });
    assert.strictEqual(ok.status, 200);
    const duplo = await request(app).post(`/api/almoxarifado/movimentacoes/${ent.body.id}/cancelar`).send({ motivo: 'de novo' });
    assert.strictEqual(duplo.status, 400);
    const doEstorno = await request(app).post(`/api/almoxarifado/movimentacoes/${ok.body.estorno_id}/cancelar`).send({ motivo: 'estorno do estorno' });
    assert.strictEqual(doEstorno.status, 400);
  });

  await test('estorno de entrada ja consumida falha com saldo insuficiente', async () => {
    const mat = await criarMaterial(db, 'EST-006', 0);
    const ent = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 20 });
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 15, justificativa: 'consumo' });
    const est = await request(app).post(`/api/almoxarifado/movimentacoes/${ent.body.id}/cancelar`).send({ motivo: 'cancelar compra' });
    assert.strictEqual(est.status, 400, JSON.stringify(est.body));
  });

  await test('estornar saida emergencial zera regularizacao_pendente e bloqueia regularizacao', async () => {
    const mat = await criarMaterial(db, 'EST-007', 50);
    const sai = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 10, emergencial: true, justificativa: 'urgente' });
    assert.strictEqual(sai.status, 201, JSON.stringify(sai.body));
    const antes = await dbGet(db, 'SELECT regularizacao_pendente FROM movimentacoes_almoxarifado WHERE id = ?', [sai.body.id]);
    assert.strictEqual(antes.regularizacao_pendente, 1);

    const est = await request(app).post(`/api/almoxarifado/movimentacoes/${sai.body.id}/cancelar`)
      .send({ motivo: 'saida emergencial errada' });
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));

    const depois = await dbGet(db, 'SELECT regularizacao_pendente, cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [sai.body.id]);
    assert.strictEqual(depois.regularizacao_pendente, 0);
    assert.strictEqual(depois.cancelado, 1);

    const reg = await request(app).put(`/api/almoxarifado/movimentacoes/${sai.body.id}/regularizar`)
      .send({ projeto_id: 1 });
    assert.strictEqual(reg.status, 400, JSON.stringify(reg.body));
  });

  await test('cancelamentos concorrentes: exatamente um vence', async () => {
    const mat = await criarMaterial(db, 'EST-008', 100);
    const ent = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 20 });
    assert.strictEqual(ent.status, 201, JSON.stringify(ent.body));

    const [a, b] = await Promise.all([
      request(app).post(`/api/almoxarifado/movimentacoes/${ent.body.id}/cancelar`).send({ motivo: 'corrida 1' }),
      request(app).post(`/api/almoxarifado/movimentacoes/${ent.body.id}/cancelar`).send({ motivo: 'corrida 2' }),
    ]);
    const statuses = [a.status, b.status].sort();
    assert.deepStrictEqual(statuses, [200, 400], `esperado [200,400], foi ${JSON.stringify(statuses)}`);

    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 100, 'saldo deveria ter sido revertido exatamente uma vez');
  });

  await test('estorno de SAIDA vinculada a requisição é bloqueado (use os fluxos da requisição)', async () => {
    const mat = await criarMaterial(db, 'EST-009', 50);
    const { reqId, itemId } = await criarRequisicaoEmSeparacao(db, mat, 10);

    const entrega = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemId, quantidade_atendida: 10 }] });
    assert.strictEqual(entrega.status, 200, JSON.stringify(entrega.body));

    const mov = await dbGet(db,
      `SELECT * FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'SAIDA'`, [reqId]);
    assert.ok(mov, 'deveria existir movimentação SAIDA vinculada à requisição');

    const est = await request(app).post(`/api/almoxarifado/movimentacoes/${mov.id}/cancelar`)
      .send({ motivo: 'tentando estornar avulso' });
    assert.strictEqual(est.status, 400, JSON.stringify(est.body));

    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 40, 'saldo não deveria ter sido alterado pela tentativa de estorno bloqueada');

    const item = await dbGet(db, 'SELECT quantidade_entregue FROM itens_requisicao_almoxarifado WHERE id = ?', [itemId]);
    assert.strictEqual(item.quantidade_entregue, 10, 'quantidade_entregue não deveria ter sido alterada');

    const movDepois = await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [mov.id]);
    assert.strictEqual(movDepois.cancelado, 0, 'movimentação não deveria estar marcada como cancelada');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
