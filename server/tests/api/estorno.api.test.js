const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

// Mesmo usuário do stub de auth do harness — os movimentos de retenção nascem dos serviços
// (a rota v2 não aceita tipo de retenção), então precisam de um `user` na chamada direta.
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };

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

  // ── Estorno x tipos de retenção (achado do review final da Etapa 5) ───────────
  // cancelarMovimentacao só sabia reverter BLOQUEIO/DESBLOQUEIO. Os tipos da quarentena caíam
  // no vazio: gravava-se a linha ESTORNO e marcava-se a original cancelada, mas nenhuma coluna
  // de retenção mudava — o livro afirmava uma reversão que não aconteceu.

  await test('estorno de QUARENTENA e recusado sem marcar cancelado nem mexer no retido', async () => {
    const mat = await criarMaterial(db, 'EST-010', 100);
    const quar = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'QUARENTENA', quantidade: 40, justificativa: 'material critico' });

    const est = await request(app).post(`/api/almoxarifado/movimentacoes/${quar.id}/cancelar`)
      .send({ motivo: 'estornando a quarentena' });
    assert.strictEqual(est.status, 400, JSON.stringify(est.body));
    assert.match(est.body.error || '', /inspe/i, 'a mensagem tem de apontar a tela de Inspeções');

    const m = await dbGet(db, 'SELECT quantidade_em_inspecao FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_em_inspecao, 40, 'a quarentena tem de continuar de pe');
    const mov = await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [quar.id]);
    assert.strictEqual(mov.cancelado, 0, 'marcou cancelado sem reverter nada');
    const estornos = await dbGet(db,
      `SELECT COUNT(*) as n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ESTORNO'`, [mat]);
    assert.strictEqual(estornos.n, 0, 'gravou ESTORNO de uma reversao que nao aconteceu');
  });

  await test('estorno de DECISAO_INSPECAO e recusado (reversao e pela tela de Inspecoes)', async () => {
    const mat = await criarMaterial(db, 'EST-011', 100);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'QUARENTENA', quantidade: 20, justificativa: 'material critico' });
    const dec = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'DECISAO_INSPECAO', quantidade: 20, quantidade_reprovada: 5,
      justificativa: 'inspecao parcial' });

    const est = await request(app).post(`/api/almoxarifado/movimentacoes/${dec.id}/cancelar`)
      .send({ motivo: 'estornando a decisao' });
    assert.strictEqual(est.status, 400, JSON.stringify(est.body));

    const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_em_inspecao, 0);
    assert.strictEqual(m.quantidade_bloqueada, 5, 'a decisao tem de continuar valendo');
  });

  await test('estorno de BLOQUEIO ja desfeito recusa em vez de saturar (bloqueio fantasma)', async () => {
    const mat = await criarMaterial(db, 'EST-012', 100);
    const blq = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'BLOQUEIO', quantidade: 10, justificativa: 'avaria' });
    const des = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'DESBLOQUEIO', quantidade: 10, justificativa: 'peca recuperada' });

    // O bloqueio já foi desfeito pelo DESBLOQUEIO: não há o que reverter. Com MAX(0,...) isto
    // "passava" saturando em 0, e o estorno seguinte do DESBLOQUEIO ressuscitava 10 bloqueados
    // sem NENHUM bloqueio vivo por trás — dois cliques na tela do livro.
    const estBlq = await request(app).post(`/api/almoxarifado/movimentacoes/${blq.id}/cancelar`)
      .send({ motivo: 'lancamento errado' });
    assert.strictEqual(estBlq.status, 400, `estorno de bloqueio ja desfeito deveria recusar: ${JSON.stringify(estBlq.body)}`);
    const blqRow = await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [blq.id]);
    assert.strictEqual(blqRow.cancelado, 0, 'o BLOQUEIO nao pode ficar preso como cancelado');

    const estDes = await request(app).post(`/api/almoxarifado/movimentacoes/${des.id}/cancelar`)
      .send({ motivo: 'desbloqueio errado' });
    assert.strictEqual(estDes.status, 200, JSON.stringify(estDes.body));
    const m1 = await dbGet(db, 'SELECT quantidade_bloqueada FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m1.quantidade_bloqueada, 10, 'o BLOQUEIO original voltou a valer, o bloqueado tem lastro');

    // e agora, com o bloqueio de novo vivo, estornar o BLOQUEIO funciona e zera.
    const estBlq2 = await request(app).post(`/api/almoxarifado/movimentacoes/${blq.id}/cancelar`)
      .send({ motivo: 'agora sim' });
    assert.strictEqual(estBlq2.status, 200, JSON.stringify(estBlq2.body));
    const m2 = await dbGet(db, 'SELECT quantidade_bloqueada FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m2.quantidade_bloqueada, 0);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
