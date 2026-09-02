/**
 * Etapa 3, Task 3 — entrega e estorno de requisição via motor de estoque
 * (stockService.registrarMovimentacao), fechando o bypass de SQL cru anotado desde a
 * Etapa 1 (docs/superpowers/specs/2026-08-05-almoxarifado-etapa3-requisicoes-design.md,
 * seção "O problema central").
 *
 * RED (antes do fix): requisitionService.entregarRequisicao/excluirRequisicao faziam
 * UPDATE+INSERT cru — baixavam pelo FÍSICO (ignorando quantidade_reservada de terceiros),
 * não gravavam auditoria e não respeitavam localização bloqueada. Os cenários abaixo
 * provam isso (ver task-3-brief.md, Step 1) e travam o comportamento correto pós-fix.
 *
 * Fix round (review pós-Task 3): GET /requisicoes/:id ainda expunha saldo_atual/
 * quantidade_entregavel pelo FÍSICO (SELECT próprio em routes/almoxarifado.js e
 * routes/requisicoesMaterial.js, fora de carregarItensRequisicao) — front podia anunciar
 * um "entregável" maior do que a entrega de fato aceita quando há reserva de terceiro.
 * Cenário "[GET detalhe]" abaixo prova a correção.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

let seq = 0;
function numero() {
  seq += 1;
  return `REQ-MOTOR-${seq}`;
}

async function criarMaterial(db, codigo, overrides = {}) {
  const {
    qtd = 50, reservada = 0, bloqueada = 0, emInspecao = 0, localizacaoPadraoId = null,
  } = overrides;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, quantidade_atual, quantidade_reservada, quantidade_bloqueada, quantidade_em_inspecao,
     localizacao_padrao_id, ativo)
    VALUES (?,?,?,?,?,?,?,1)`,
    [codigo, `Material ${codigo}`, qtd, reservada, bloqueada, emInspecao, localizacaoPadraoId]);
  const materialId = r.lastID;
  if (localizacaoPadraoId) {
    // Sincroniza estoque_saldo_almoxarifado com quantidade_atual, como faria o fluxo real
    // (rota PUT /materiais/:id chama isso após qualquer alteração) — sem isto a localização
    // nasceria "vazia" mesmo com o material tendo saldo físico.
    await stockService.syncSaldoLocalizacaoPadrao(db, materialId);
  }
  return materialId;
}

async function criarRequisicao(db, { status, itens, solicitanteId = 1 }) {
  const reqRes = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
    (numero, solicitante_id, solicitante_nome, status) VALUES (?, ?, 'Solicitante Teste', ?)`,
    [numero(), solicitanteId, status]);
  const reqId = reqRes.lastID;
  const itemIds = [];
  for (const item of itens) {
    const r = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [reqId, item.material_id, item.quantidade ?? 1,
        item.quantidade_separada ?? 0, item.quantidade_entregue ?? 0, item.quantidade_entregue ?? 0]);
    itemIds.push(r.lastID);
  }
  return { id: reqId, itemIds };
}

async function criarLocalizacao(app, codigo, overrides = {}) {
  const res = await request(app).post('/api/almoxarifado/localizacoes')
    .send({ codigo, descricao: `Localização ${codigo}`, ...overrides });
  if (res.status !== 201) throw new Error(`Falha ao criar localização ${codigo}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

(async () => {
  const ADMIN_USER = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
  const { app, db, close } = await createTestApp({ user: ADMIN_USER });

  // ── entrega grava movimentação com auditoria e atualiza saldo por localização padrão ──
  await test('[entregar] grava movimentação SAIDA auditada e atualiza saldo por localização padrão', async () => {
    const loc = await criarLocalizacao(app, 'MOTOR-LOC-A');
    const matId = await criarMaterial(db, 'MOTOR-MAT-A', { qtd: 50, localizacaoPadraoId: loc.id });
    const { id: reqId, itemIds } = await criarRequisicao(db, {
      status: 'EM_SEPARACAO', itens: [{ material_id: matId, quantidade: 10, quantidade_separada: 10 }],
    });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemIds[0], quantidade_atendida: 10 }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'ENTREGUE');

    const mat = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(mat.quantidade_atual, 40);

    const mov = await dbGet(db,
      `SELECT * FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'SAIDA'`, [reqId]);
    assert.ok(mov, 'deveria existir movimentação SAIDA vinculada à requisição');
    assert.strictEqual(mov.quantidade, 10);
    assert.strictEqual(mov.saldo_anterior, 50);
    assert.strictEqual(mov.saldo_posterior, 40);

    const auditLog = await dbGet(db,
      `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'movimentacao' AND entidade_id = ?`, [mov.id]);
    assert.ok(auditLog, 'movimentação de entrega deveria estar auditada (bypass fechado)');

    const saldoLoc = await dbGet(db,
      'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?', [matId, loc.id]);
    assert.strictEqual(saldoLoc.quantidade, 40, 'saldo por localização padrão deveria refletir a baixa');
  });

  // ── entrega maior que DISPONÍVEL (reserva de terceiro) → 400, nada muda ──
  await test('[entregar] bloqueado pelo DISPONÍVEL quando há reserva de terceiro (hoje ignora — RED)', async () => {
    const matId = await criarMaterial(db, 'MOTOR-MAT-B', { qtd: 50, reservada: 45 }); // disponível = 5
    const { id: reqId, itemIds } = await criarRequisicao(db, {
      status: 'EM_SEPARACAO', itens: [{ material_id: matId, quantidade: 10, quantidade_separada: 10 }],
    });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemIds[0], quantidade_atendida: 10 }] });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));

    const mat = await dbGet(db,
      'SELECT quantidade_atual, quantidade_reservada FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(mat.quantidade_atual, 50, 'saldo físico não deveria ter mudado');
    assert.strictEqual(mat.quantidade_reservada, 45, 'reserva de terceiro não deveria ter mudado');

    const item = await dbGet(db, 'SELECT quantidade_entregue FROM itens_requisicao_almoxarifado WHERE id = ?', [itemIds[0]]);
    assert.strictEqual(item.quantidade_entregue, 0, 'item não deveria ter sido marcado como entregue');

    const mov = await dbGet(db, `SELECT * FROM movimentacoes_almoxarifado WHERE requisicao_id = ?`, [reqId]);
    assert.ok(!mov, 'nenhuma movimentação deveria ter sido gravada');
  });

  // ── detalhe da requisição expõe saldo/entregável pelo DISPONÍVEL, não pelo físico ──
  // (fix round: routes/almoxarifado.js:1719 e routes/requisicoesMaterial.js:257 faziam
  // SELECT próprio com ma.quantidade_atual as saldo_atual — físico — que alimentava
  // normalizarItem e mostrava um "entregável" maior do que a entrega de fato aceita.)
  await test('[GET detalhe] saldo_atual/quantidade_entregavel refletem o DISPONÍVEL com reserva de terceiro', async () => {
    const matId = await criarMaterial(db, 'MOTOR-MAT-F', { qtd: 50, reservada: 45 }); // disponível = 5
    const { id: reqId, itemIds } = await criarRequisicao(db, {
      status: 'EM_SEPARACAO', itens: [{ material_id: matId, quantidade: 10, quantidade_separada: 10 }],
    });

    const res = await request(app).get(`/api/almoxarifado/requisicoes/${reqId}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const item = res.body.itens.find((i) => Number(i.id) === Number(itemIds[0]));
    assert.ok(item, 'item deveria estar no detalhe');
    assert.strictEqual(item.saldo_atual, 5, 'saldo_atual deveria carregar o disponível (50-45), não o físico (50)');
    assert.strictEqual(item.quantidade_entregavel, 5, 'entregável deveria respeitar o disponível');

    // Coerência: o que o detalhe anuncia como entregável (5) a entrega aceita; acima disso, rejeita.
    const aceito = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemIds[0], quantidade_atendida: 5 }] });
    assert.strictEqual(aceito.status, 200, JSON.stringify(aceito.body));
  });

  // ── entregas concorrentes não estouram o disponível ──
  await test('[entregar] entregas concorrentes de requisições distintas no mesmo material: só uma passa', async () => {
    const matId = await criarMaterial(db, 'MOTOR-MAT-C', { qtd: 100 });
    const { id: reqIdA, itemIds: itemIdsA } = await criarRequisicao(db, {
      status: 'EM_SEPARACAO', itens: [{ material_id: matId, quantidade: 60, quantidade_separada: 60 }],
    });
    const { id: reqIdB, itemIds: itemIdsB } = await criarRequisicao(db, {
      status: 'EM_SEPARACAO', itens: [{ material_id: matId, quantidade: 60, quantidade_separada: 60 }],
    });

    const [resA, resB] = await Promise.all([
      request(app).put(`/api/almoxarifado/requisicoes/${reqIdA}/entregar`)
        .send({ itens_atendidos: [{ item_id: itemIdsA[0], quantidade_atendida: 60 }] }),
      request(app).put(`/api/almoxarifado/requisicoes/${reqIdB}/entregar`)
        .send({ itens_atendidos: [{ item_id: itemIdsB[0], quantidade_atendida: 60 }] }),
    ]);

    const sucessos = [resA, resB].filter((r) => r.status === 200).length;
    assert.strictEqual(sucessos, 1, `esperado exatamente 1 sucesso, houve ${sucessos} (${resA.status}/${resB.status})`);

    const mat = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(mat.quantidade_atual, 40, 'saldo final deveria refletir só a entrega bem-sucedida (100-60)');
  });

  // ── exclusão estorna via motor (movimentação ENTRADA auditada) ──
  await test('[excluir] estorna via motor: movimentação ENTRADA auditada e saldo restaurado', async () => {
    const matId = await criarMaterial(db, 'MOTOR-MAT-D', { qtd: 47 });
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PARCIALMENTE_ATENDIDA',
      itens: [{ material_id: matId, quantidade: 10, quantidade_separada: 3, quantidade_entregue: 3 }],
    });

    const res = await request(app).delete(`/api/almoxarifado/requisicoes/${reqId}`)
      .send({ justificativa: 'Teste estorno via motor' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const mat = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(mat.quantidade_atual, 50, 'estorno deveria devolver os 3 entregues');

    const mov = await dbGet(db,
      `SELECT * FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'ENTRADA'`, [reqId]);
    assert.ok(mov, 'deveria existir movimentação ENTRADA de estorno vinculada à requisição');
    assert.strictEqual(mov.quantidade, 3);

    const auditLog = await dbGet(db,
      `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'movimentacao' AND entidade_id = ?`, [mov.id]);
    assert.ok(auditLog, 'estorno de exclusão deveria estar auditado (bypass fechado)');

    const req = await dbGet(db, 'SELECT status, ativo FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(req.status, 'CANCELADO');
    assert.strictEqual(req.ativo, 0);
  });

  // ── entrega para material com localização padrão bloqueada → 400 (comportamento NOVO) ──
  await test('[entregar] localização padrão bloqueada → 400, saldo intacto', async () => {
    const loc = await criarLocalizacao(app, 'MOTOR-LOC-E', { bloqueada: true });
    const matId = await criarMaterial(db, 'MOTOR-MAT-E', { qtd: 30, localizacaoPadraoId: loc.id });
    const { id: reqId, itemIds } = await criarRequisicao(db, {
      status: 'EM_SEPARACAO', itens: [{ material_id: matId, quantidade: 10, quantidade_separada: 10 }],
    });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemIds[0], quantidade_atendida: 10 }] });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/bloqueada/i.test(res.body.error), `mensagem deveria citar bloqueio: ${res.body.error}`);

    const mat = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(mat.quantidade_atual, 30, 'saldo não deveria ter sido alterado');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
