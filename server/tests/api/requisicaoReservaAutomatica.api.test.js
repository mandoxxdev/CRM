/**
 * Etapa 4 — reserva automática na aprovação (ligação 04→07).
 *
 * Design: docs/superpowers/specs/2026-08-05-almoxarifado-etapa4-reservas-design.md,
 * decisão 2. O núcleo (consumo de estoque contra reserva) veio no commit 0e37dea; aqui a
 * aprovação da requisição passa a RESERVAR o que existe de saldo para cada item e a
 * entrega passa a CONSUMIR essa reserva em vez de disputar o disponível geral — é isso que
 * fecha a corrida aprovar→entregar (entre a aprovação e a entrega, ninguém mais leva o
 * material que já foi prometido a esta requisição).
 *
 * Regressão importante coberta aqui: quando NENHUM item tem saldo, nada muda — a
 * requisição continua indo para AGUARDANDO_ESTOQUE/AGUARDANDO_COMPRA como antes.
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

// Admin default do harness: perfil ADMINISTRADOR, que tem aprovar_requisicao E
// separar_emitir (requirePermission real roda nas rotas — usuário sem perfil daria 403).
const ADMIN = {
  id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com',
};
const SOLICITANTE_ID = 99; // ≠ ADMIN.id: segregação de funções na /aprovar

let seq = 0;

async function criarMaterial(db, qtd) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
     VALUES (?,?,'UN',?,1)`,
    [`RESAUTO-MAT-${seq}`, `Material Reserva Auto ${seq}`, qtd]);
  return r.lastID;
}

async function criarRequisicao(db, itens, status = 'PENDENTE') {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
     VALUES (?, ?, 'Solicitante Teste', ?)`,
    [`REQ-RESAUTO-${seq}`, SOLICITANTE_ID, status]);
  const reqId = r.lastID;
  const itemIds = [];
  for (const item of itens) {
    // eslint-disable-next-line no-await-in-loop
    const ri = await dbRun(db,
      `INSERT INTO itens_requisicao_almoxarifado
        (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
       VALUES (?,?,?,?,?,?)`,
      [reqId, item.material_id, item.quantidade,
        item.quantidade_separada ?? 0, item.quantidade_entregue ?? 0, item.quantidade_entregue ?? 0]);
    itemIds.push(ri.lastID);
  }
  return { id: reqId, itemIds };
}

const reservasDaRequisicao = (db, reqId) => dbAll(db,
  `SELECT * FROM reservas_material_almoxarifado WHERE requisicao_id = ? ORDER BY id`, [reqId]);

const material = (db, id) => dbGet(db,
  `SELECT quantidade_atual, COALESCE(quantidade_reservada,0) as reservada
   FROM materiais_almoxarifado WHERE id = ?`, [id]);

const disponivel = async (db, id) => {
  const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
  return stockService.getSaldoDisponivel(m);
};

const statusDe = async (db, reqId) => (await dbGet(db,
  'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId])).status;

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  // ── saldo total para todos os itens → TOTALMENTE_RESERVADA ──
  await test('[aprovar] saldo total em todos os itens -> TOTALMENTE_RESERVADA com uma reserva por item', async () => {
    const matA = await criarMaterial(db, 100);
    const matB = await criarMaterial(db, 50);
    const { id: reqId, itemIds } = await criarRequisicao(db, [
      { material_id: matA, quantidade: 10 },
      { material_id: matB, quantidade: 4 },
    ]);

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'TOTALMENTE_RESERVADA', JSON.stringify(res.body));
    assert.strictEqual(await statusDe(db, reqId), 'TOTALMENTE_RESERVADA');

    const reservas = await reservasDaRequisicao(db, reqId);
    assert.strictEqual(reservas.length, 2, `esperava 2 reservas, veio ${reservas.length}`);
    assert.deepStrictEqual(reservas.map((r) => r.quantidade), [10, 4]);
    assert.deepStrictEqual(reservas.map((r) => Number(r.item_requisicao_id)), itemIds.map(Number));
    for (const r of reservas) {
      assert.strictEqual(Number(r.requisicao_id), Number(reqId), 'reserva sem vínculo com a requisição');
      assert.strictEqual(r.origem, 'REQUISICAO', `origem deveria ser REQUISICAO, veio ${r.origem}`);
      assert.strictEqual(r.status, 'ATIVA');
    }
  });

  // ── saldo parcial → PARCIALMENTE_RESERVADA, reserva só do que havia ──
  await test('[aprovar] saldo parcial -> PARCIALMENTE_RESERVADA e reserva só do disponível', async () => {
    const matCheio = await criarMaterial(db, 100);
    const matCurto = await criarMaterial(db, 4); // pedido de 10, só 4 no estoque
    const { id: reqId, itemIds } = await criarRequisicao(db, [
      { material_id: matCheio, quantidade: 6 },
      { material_id: matCurto, quantidade: 10 },
    ]);

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'PARCIALMENTE_RESERVADA', JSON.stringify(res.body));

    const reservas = await reservasDaRequisicao(db, reqId);
    assert.strictEqual(reservas.length, 2);
    const doCurto = reservas.find((r) => Number(r.item_requisicao_id) === Number(itemIds[1]));
    assert.strictEqual(doCurto.quantidade, 4, 'não deveria reservar mais que o disponível');
    const doCheio = reservas.find((r) => Number(r.item_requisicao_id) === Number(itemIds[0]));
    assert.strictEqual(doCheio.quantidade, 6);
  });

  // ── nenhum item com saldo → comportamento ANTIGO preservado (regressão) ──
  await test('[aprovar] nenhum item com saldo -> AGUARDANDO_ESTOQUE e nenhuma reserva (regressão)', async () => {
    const mat = await criarMaterial(db, 0);
    const { id: reqId } = await criarRequisicao(db, [{ material_id: mat, quantidade: 5 }]);

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'AGUARDANDO_ESTOQUE', JSON.stringify(res.body));
    assert.strictEqual((await reservasDaRequisicao(db, reqId)).length, 0, 'não deveria reservar nada');
  });

  await test('[aprovar] sem saldo e com compra PENDENTE -> AGUARDANDO_COMPRA (regressão)', async () => {
    const mat = await criarMaterial(db, 0);
    await dbRun(db,
      `INSERT INTO solicitacoes_compra_almoxarifado (material_id, quantidade, status) VALUES (?, 10, 'PENDENTE')`,
      [mat]);
    const { id: reqId } = await criarRequisicao(db, [{ material_id: mat, quantidade: 5 }]);

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'AGUARDANDO_COMPRA', JSON.stringify(res.body));
    assert.strictEqual((await reservasDaRequisicao(db, reqId)).length, 0);
  });

  // ── a reserva criada segura saldo: cai o disponível, não o físico ──
  await test('[aprovar] a reserva reduz o disponível do material e não toca no físico', async () => {
    const mat = await criarMaterial(db, 30);
    const { id: reqId } = await criarRequisicao(db, [{ material_id: mat, quantidade: 12 }]);

    await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});

    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_atual, 30, 'reservar não move estoque físico');
    assert.strictEqual(m.reservada, 12);
    assert.strictEqual(await disponivel(db, mat), 18);

    // E o saldo prometido não pode ser levado por outro: disponível é 18, pedir 19 falha.
    const saida = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 19, projeto_id: 3, motivo: 'outro projeto' });
    assert.strictEqual(saida.status, 400, `esperava 400, veio ${saida.status}: ${JSON.stringify(saida.body)}`);
  });

  // ── entrega consome a reserva da própria requisição ──
  await test('[entregar] consome a reserva da requisição: CONSUMIDA e disponível debitado UMA vez', async () => {
    const mat = await criarMaterial(db, 40);
    const { id: reqId, itemIds } = await criarRequisicao(db, [{ material_id: mat, quantidade: 10 }]);

    const aprov = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(aprov.body.status, 'TOTALMENTE_RESERVADA', JSON.stringify(aprov.body));
    const [reserva] = await reservasDaRequisicao(db, reqId);
    assert.strictEqual(await disponivel(db, mat), 30, 'reserva deveria estar segurando 10');

    // separar precisa enxergar a PRÓPRIA reserva como disponível (senão o hold da aprovação
    // travaria a requisição que o criou — a armadilha que a Etapa 4 fecha)
    const sep = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/separacao`)
      .send({ itens_separados: [{ item_id: itemIds[0], quantidade_separada: 10 }] });
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));

    const ent = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemIds[0], quantidade_atendida: 10 }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
    assert.strictEqual(ent.body.status, 'ENTREGUE');

    const r = await dbGet(db,
      'SELECT quantidade, COALESCE(quantidade_utilizada,0) as utilizada, status FROM reservas_material_almoxarifado WHERE id = ?',
      [reserva.id]);
    assert.strictEqual(r.utilizada, 10, 'a entrega deveria ter consumido a reserva');
    assert.strictEqual(r.status, 'CONSUMIDA');

    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_atual, 30, 'físico deveria cair exatamente a quantidade entregue');
    assert.strictEqual(m.reservada, 0, 'reserva zumbi: ainda segurando saldo após a entrega');
    assert.strictEqual(await disponivel(db, mat), 30, 'disponível não pode ser debitado duas vezes');

    // rastro: a saída cita a reserva consumida
    const mov = await dbGet(db,
      `SELECT reserva_id, quantidade FROM movimentacoes_almoxarifado
       WHERE requisicao_id = ? AND tipo = 'SAIDA' ORDER BY id DESC LIMIT 1`, [reqId]);
    assert.strictEqual(Number(mov.reserva_id), Number(reserva.id), 'saída da entrega não citou a reserva');
  });

  // ── entrega acima do reservado: consome a reserva e o resto pelo caminho normal ──
  await test('[entregar] quantidade acima da reserva: consome a reserva + o excedente sem reserva', async () => {
    const mat = await criarMaterial(db, 4); // reserva nasce com 4 (pedido de 10)
    const { id: reqId, itemIds } = await criarRequisicao(db, [{ material_id: mat, quantidade: 10 }]);

    const aprov = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(aprov.body.status, 'PARCIALMENTE_RESERVADA', JSON.stringify(aprov.body));
    const [reserva] = await reservasDaRequisicao(db, reqId);
    assert.strictEqual(reserva.quantidade, 4);

    // estoque chega depois (físico 4 -> 14; disponível 10, mais os 4 reservados desta req)
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 14 WHERE id = ?', [mat]);

    const sep = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/separacao`)
      .send({ itens_separados: [{ item_id: itemIds[0], quantidade_separada: 10 }] });
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));

    const ent = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemIds[0], quantidade_atendida: 10 }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));

    const r = await dbGet(db,
      'SELECT COALESCE(quantidade_utilizada,0) as utilizada, status FROM reservas_material_almoxarifado WHERE id = ?',
      [reserva.id]);
    assert.strictEqual(r.utilizada, 4, 'a reserva deveria ter sido consumida por inteiro');
    assert.strictEqual(r.status, 'CONSUMIDA');

    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_atual, 4, 'físico deveria cair os 10 entregues (14-10)');
    assert.strictEqual(m.reservada, 0);
  });

  // ── status novos na máquina de estados ──
  await test('[máquina] TOTALMENTE_RESERVADA -> EM_SEPARACAO é válido', async () => {
    const mat = await criarMaterial(db, 20);
    const { id: reqId, itemIds } = await criarRequisicao(db, [{ material_id: mat, quantidade: 5 }]);
    await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/separacao`)
      .send({ itens_separados: [{ item_id: itemIds[0], quantidade_separada: 5 }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'EM_SEPARACAO');
  });

  await test('[máquina] PARCIALMENTE_RESERVADA -> CANCELADO é válido', async () => {
    const mat = await criarMaterial(db, 2);
    const { id: reqId } = await criarRequisicao(db, [{ material_id: mat, quantidade: 9 }]);
    const aprov = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(aprov.body.status, 'PARCIALMENTE_RESERVADA', JSON.stringify(aprov.body));

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/cancelar`)
      .send({ motivo: 'não precisa mais' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(await statusDe(db, reqId), 'CANCELADO');
  });

  await test('[máquina] transição inválida a partir de TOTALMENTE_RESERVADA -> 400', async () => {
    const mat = await criarMaterial(db, 20);
    const { id: reqId } = await criarRequisicao(db, [{ material_id: mat, quantidade: 5 }]);
    await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});

    // liberar-retirada exige EM_SEPARACAO (TRANSICOES); direto do status novo é inválido
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/liberar-retirada`).send({});
    assert.strictEqual(res.status, 400, `esperava 400, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(/Transição inválida/i.test(res.body.error || ''), res.body.error);
    assert.strictEqual(await statusDe(db, reqId), 'TOTALMENTE_RESERVADA', 'status mudou apesar do 400');

    // encerrar também: ENCERRADA só sai de ENTREGUE/PARCIALMENTE_ATENDIDA
    const enc = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/encerrar`)
      .send({ observacoes: 'tentativa' });
    assert.strictEqual(enc.status, 400, `esperava 400, veio ${enc.status}: ${JSON.stringify(enc.body)}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
