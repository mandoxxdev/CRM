/**
 * Etapa 3, Task 2 — máquina de estados de requisições (requisitionStateMachine) +
 * status novos (RASCUNHO, AGUARDANDO_ESTOQUE, AGUARDANDO_COMPRA, PRONTA_PARA_RETIRADA)
 * + rotas novas (enviar, liberar-retirada) + regra pós-aprovação.
 *
 * Cenários do task-2-brief.md (Step 1): entregar PENDENTE -> 400; separar RASCUNHO ->
 * 400; enviar rascunho -> PENDENTE; aprovar sem estoque em nada -> AGUARDANDO_ESTOQUE;
 * com solicitação de compra pendente -> AGUARDANDO_COMPRA; separar de AGUARDANDO_ESTOQUE
 * -> ok; liberar-retirada sem separado -> 400 / com separado -> PRONTA_PARA_RETIRADA;
 * entregar de PRONTA_PARA_RETIRADA -> ok; transição direta inválida -> 400 (via ações,
 * não existe rota de PUT status genérico).
 *
 * Cobertura extra do fix-report (review pós-Task 2): /aprovar grava o status final
 * (APROVADO/AGUARDANDO_ESTOQUE/AGUARDANDO_COMPRA) num único UPDATE — sem janela
 * transitória com status=APROVADO; /enviar exige que quem envia seja o solicitante do
 * rascunho ou admin (mesmo gate do /cancelar) — 403 para terceiros.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { validarTransicao } = require('../../services/almoxarifado/requisitionStateMachine');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

let seq = 0;
function numero() {
  seq += 1;
  return `REQ-ESTADO-${seq}`;
}

async function criarRequisicao(db, { status, itens, solicitanteId = 1 }) {
  const reqRes = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
    (numero, solicitante_id, solicitante_nome, status) VALUES (?, ?, 'Solicitante Teste', ?)`,
    [numero(), solicitanteId, status]);
  const reqId = reqRes.lastID;
  const itemIds = [];
  for (const item of itens) {
    const r = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue)
      VALUES (?, ?, ?, ?, ?)`,
      [reqId, item.material_id, item.quantidade ?? 1,
        item.quantidade_separada ?? 0, item.quantidade_entregue ?? 0]);
    itemIds.push(r.lastID);
  }
  return { id: reqId, itemIds };
}

(async () => {
  // ── Unit: validarTransicao cita ambos os status na mensagem de erro ──
  await test('validarTransicao: transição válida -> {ok:true}', async () => {
    const r = validarTransicao('RASCUNHO', 'PENDENTE');
    assert.deepStrictEqual(r, { ok: true });
  });

  await test('validarTransicao: transição inválida -> {ok:false, erro cita ambos}', async () => {
    const r = validarTransicao('PENDENTE', 'ENTREGUE');
    assert.strictEqual(r.ok, false);
    assert.ok(r.erro.includes('PENDENTE'), r.erro);
    assert.ok(r.erro.includes('ENTREGUE'), r.erro);
  });

  const ADMIN_USER = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN_USER });

  const fam = await request(app).post('/api/almoxarifado/familias')
    .send({ codigo: 'FAMESTADO', nome: 'Família Estados Teste' });
  assert.strictEqual(fam.status, 201, JSON.stringify(fam.body));
  const familiaId = fam.body.id;

  async function criarMaterial(codigo, quantidadeAtual = 0) {
    const res = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo, nome: `Material ${codigo}`, familia_id: familiaId, unidade: 'UN' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const materialId = res.body.id;
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ? WHERE id = ?',
      [quantidadeAtual, materialId]);
    return materialId;
  }

  // ── separar RASCUNHO -> 400 ──
  await test('[separacao] RASCUNHO -> 400 (transição inválida)', async () => {
    const matId = await criarMaterial('MATEST-01', 10);
    const { id: reqId } = await criarRequisicao(db, { status: 'RASCUNHO', itens: [{ material_id: matId, quantidade: 2 }] });
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/separacao`).send({});
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  // ── entregar PENDENTE -> 400 ──
  await test('[entregar] PENDENTE -> 400 (transição inválida)', async () => {
    const matId = await criarMaterial('MATEST-02', 10);
    const { id: reqId, itemIds } = await criarRequisicao(db, { status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 2 }] });
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemIds[0], quantidade_atendida: 1 }] });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  // ── enviar rascunho -> PENDENTE ──
  let idRascunhoEnviado;
  await test('[enviar] rascunho -> PENDENTE', async () => {
    const matId = await criarMaterial('MATEST-03', 10);
    const criacao = await request(app).post('/api/almoxarifado/requisicoes').send({
      salvar_rascunho: true,
      itens: [{ material_id: matId, quantidade: 1 }],
    });
    assert.strictEqual(criacao.status, 201, JSON.stringify(criacao.body));
    assert.strictEqual(criacao.body.status, 'RASCUNHO');
    idRascunhoEnviado = criacao.body.id;

    const res = await request(app).post(`/api/almoxarifado/requisicoes/${idRascunhoEnviado}/enviar`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'PENDENTE');

    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [idRascunhoEnviado]);
    assert.strictEqual(row.status, 'PENDENTE');
  });

  await test('[enviar] já PENDENTE -> 400 (transição inválida via ação, sem rota de PUT status genérico)', async () => {
    const res = await request(app).post(`/api/almoxarifado/requisicoes/${idRascunhoEnviado}/enviar`).send({});
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('[enviar] requisição inexistente -> 404', async () => {
    const res = await request(app).post('/api/almoxarifado/requisicoes/999999/enviar').send({});
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
  });

  // ── /enviar: gate de dono/admin, mesmo padrão do /cancelar (Finding 2 do review) ──
  await test('[enviar] usuário que não é o solicitante nem admin -> 403', async () => {
    const matId = await criarMaterial('MATEST-14', 10);
    const { id: reqId } = await criarRequisicao(db, {
      status: 'RASCUNHO', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 77,
    });

    setUser({ id: 88, nome: 'Outro Usuário', role: 'user', email: 'outro@test.com' });
    try {
      const res = await request(app).post(`/api/almoxarifado/requisicoes/${reqId}/enviar`).send({});
      assert.strictEqual(res.status, 403, JSON.stringify(res.body));
      assert.strictEqual(res.body.error, 'Apenas o solicitante pode enviar o rascunho');

      const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
      assert.strictEqual(row.status, 'RASCUNHO', 'status não deveria ter mudado');
    } finally {
      setUser(ADMIN_USER);
    }
  });

  await test('[enviar] pelo próprio solicitante -> 200', async () => {
    const matId = await criarMaterial('MATEST-15', 10);
    const { id: reqId } = await criarRequisicao(db, {
      status: 'RASCUNHO', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 77,
    });

    setUser({ id: 77, nome: 'Solicitante Dono', role: 'user', email: 'dono@test.com' });
    try {
      const res = await request(app).post(`/api/almoxarifado/requisicoes/${reqId}/enviar`).send({});
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.status, 'PENDENTE');
    } finally {
      setUser(ADMIN_USER);
    }
  });

  await test('[enviar] por admin que não é o solicitante -> 200', async () => {
    const matId = await criarMaterial('MATEST-16', 10);
    const { id: reqId } = await criarRequisicao(db, {
      status: 'RASCUNHO', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 77,
    });

    setUser(ADMIN_USER);
    const res = await request(app).post(`/api/almoxarifado/requisicoes/${reqId}/enviar`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'PENDENTE');
  });

  // ── aprovar sem estoque em nada -> AGUARDANDO_ESTOQUE ──
  // solicitanteId:77 (≠ ADMIN_USER.id) — Task 4 adiciona segregação de funções: quem
  // aprova/rejeita não pode ser quem solicitou (ver requisicaoAprovacao.api.test.js).
  await test('[aprovar] item sem disponível e sem compra pendente -> AGUARDANDO_ESTOQUE', async () => {
    const matId = await criarMaterial('MATEST-04', 0);
    const { id: reqId } = await criarRequisicao(db, { status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 5 }], solicitanteId: 77 });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'AGUARDANDO_ESTOQUE');

    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(row.status, 'AGUARDANDO_ESTOQUE');
  });

  // ── aprovar sem estoque, com solicitação de compra pendente -> AGUARDANDO_COMPRA ──
  await test('[aprovar] item sem disponível, com solicitação de compra PENDENTE -> AGUARDANDO_COMPRA', async () => {
    const matId = await criarMaterial('MATEST-05', 0);
    await dbRun(db, `INSERT INTO solicitacoes_compra_almoxarifado (material_id, quantidade, status) VALUES (?, 10, 'PENDENTE')`, [matId]);
    const { id: reqId } = await criarRequisicao(db, { status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 5 }], solicitanteId: 77 });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'AGUARDANDO_COMPRA');

    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(row.status, 'AGUARDANDO_COMPRA');
  });

  // ── aprovar com estoque disponível -> continua APROVADO (regressão) ──
  await test('[aprovar] item com disponível > 0 -> permanece APROVADO', async () => {
    const matId = await criarMaterial('MATEST-06', 50);
    const { id: reqId } = await criarRequisicao(db, { status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 5 }], solicitanteId: 77 });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'APROVADO');

    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(row.status, 'APROVADO');
  });

  await test('[aprovar] requisição inexistente -> 404', async () => {
    const res = await request(app).put('/api/almoxarifado/requisicoes/999999/aprovar').send({});
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
  });

  // ── AGUARDANDO_APROVACAO_VALOR -> APROVADO é exclusivo da rota /aprovar-valor (design:
  // seta anotada "(aprovar-valor)"), que exige isAprovadorValor. A rota genérica /aprovar
  // não pode ser usada para pular essa checagem de permissão. ──
  await test('[aprovar] NÃO aprova requisição AGUARDANDO_APROVACAO_VALOR (só /aprovar-valor pode) -> 400', async () => {
    const matId = await criarMaterial('MATEST-13', 50);
    const { id: reqId } = await criarRequisicao(db, { status: 'AGUARDANDO_APROVACAO_VALOR', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 77 });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));

    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(row.status, 'AGUARDANDO_APROVACAO_VALOR', 'status não deveria ter mudado');
  });

  // ── separar de AGUARDANDO_ESTOQUE -> ok (estoque chegou) ──
  await test('[separacao] de AGUARDANDO_ESTOQUE -> ok, vira EM_SEPARACAO', async () => {
    const matId = await criarMaterial('MATEST-07', 10);
    const { id: reqId, itemIds } = await criarRequisicao(db, { status: 'AGUARDANDO_ESTOQUE', itens: [{ material_id: matId, quantidade: 3 }] });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/separacao`)
      .send({ itens_separados: [{ item_id: itemIds[0], quantidade_separada: 3 }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'EM_SEPARACAO');

    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(row.status, 'EM_SEPARACAO');
  });

  // ── separar de AGUARDANDO_COMPRA -> ok também (mesma regra) ──
  await test('[separacao] de AGUARDANDO_COMPRA -> ok, vira EM_SEPARACAO', async () => {
    const matId = await criarMaterial('MATEST-08', 10);
    const { id: reqId, itemIds } = await criarRequisicao(db, { status: 'AGUARDANDO_COMPRA', itens: [{ material_id: matId, quantidade: 3 }] });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/separacao`)
      .send({ itens_separados: [{ item_id: itemIds[0], quantidade_separada: 3 }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'EM_SEPARACAO');
  });

  // ── liberar-retirada sem item separado -> 400 ──
  await test('[liberar-retirada] sem item separado -> 400 Nenhum item separado', async () => {
    const matId = await criarMaterial('MATEST-09', 10);
    const { id: reqId } = await criarRequisicao(db, { status: 'EM_SEPARACAO', itens: [{ material_id: matId, quantidade: 3, quantidade_separada: 0 }] });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/liberar-retirada`).send({});
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Nenhum item separado');
  });

  // ── liberar-retirada com item separado -> PRONTA_PARA_RETIRADA ──
  let idProntaParaRetirada;
  let itemIdProntaParaRetirada;
  await test('[liberar-retirada] com item separado -> PRONTA_PARA_RETIRADA', async () => {
    const matId = await criarMaterial('MATEST-10', 10);
    const { id: reqId, itemIds } = await criarRequisicao(db, { status: 'EM_SEPARACAO', itens: [{ material_id: matId, quantidade: 3, quantidade_separada: 3 }] });
    idProntaParaRetirada = reqId;
    [itemIdProntaParaRetirada] = itemIds;

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/liberar-retirada`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'PRONTA_PARA_RETIRADA');

    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(row.status, 'PRONTA_PARA_RETIRADA');
  });

  await test('[liberar-retirada] requisição inexistente -> 404', async () => {
    const res = await request(app).put('/api/almoxarifado/requisicoes/999999/liberar-retirada').send({});
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
  });

  // ── entregar de PRONTA_PARA_RETIRADA -> ok ──
  await test('[entregar] de PRONTA_PARA_RETIRADA -> ok', async () => {
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${idProntaParaRetirada}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemIdProntaParaRetirada, quantidade_atendida: 3 }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'ENTREGUE');

    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [idProntaParaRetirada]);
    assert.strictEqual(row.status, 'ENTREGUE');
  });

  // ── cancelar: máquina de estados agora também permite a partir de AGUARDANDO_ESTOQUE ──
  await test('[cancelar] de AGUARDANDO_ESTOQUE -> ok (novo estado, antes só PENDENTE/APROVADO)', async () => {
    const matId = await criarMaterial('MATEST-11', 0);
    const { id: reqId } = await criarRequisicao(db, { status: 'AGUARDANDO_ESTOQUE', itens: [{ material_id: matId, quantidade: 1 }] });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/cancelar`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(row.status, 'CANCELADO');
  });

  await test('[cancelar] de EM_SEPARACAO -> 400 (continua não permitido)', async () => {
    const matId = await criarMaterial('MATEST-12', 10);
    const { id: reqId } = await criarRequisicao(db, { status: 'EM_SEPARACAO', itens: [{ material_id: matId, quantidade: 1 }] });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/cancelar`).send({});
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
