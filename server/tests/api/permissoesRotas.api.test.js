/**
 * Autorização por PERFIL nas rotas mutantes de routes/almoxarifado.js.
 *
 * Bug coberto (mesma classe do movimentacaoV1Permissao.api.test.js, agora no resto do
 * arquivo): o router é montado com um gate global `authenticateToken +
 * checkModulePermission('almoxarifado')`, que só verifica ACESSO ao módulo — nunca o
 * perfil. Antes deste hardening, qualquer usuário com acesso ao módulo podia concluir um
 * inventário aplicando ajustes de saldo, separar/entregar requisição (baixando estoque
 * real), aprovar/rejeitar requisição de terceiros e criar/editar/inativar material —
 * contornando inteiramente ACAO_PERFIS (services/almoxarifado/permissions.js).
 *
 * Perfis relevantes (permissions.js):
 *   inventario:         [ADMINISTRADOR, ALMOXARIFE, GESTOR]
 *   ajustar_estoque:    [ADMINISTRADOR, GESTOR]
 *   separar_emitir:     [ADMINISTRADOR, ALMOXARIFE]
 *   aprovar_requisicao: [ADMINISTRADOR, ALMOXARIFE, GESTOR]
 *   criar_material:     [ADMINISTRADOR, ALMOXARIFE, ENGENHARIA]
 *   editar_material:    [ADMINISTRADOR, ALMOXARIFE, ENGENHARIA]
 *   requisitar:         [ADMINISTRADOR, PRODUCAO, ENGENHARIA, ALMOXARIFE]
 *
 * getPerfilFromUser faz fallback para PRODUCAO quando o usuário não tem
 * perfil_almoxarifado — então o usuário comum do sistema é o caso negativo natural de
 * todas as ações acima MENOS `requisitar` (PRODUCAO está nela por design: quem pede
 * material é o chão de fábrica). Para `requisitar` o caso negativo é CONSULTA.
 */
const assert = require('assert');
const fs = require('fs');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// Sem is_superadmin, sem admin_modulos, role != 'admin' e sem perfil_almoxarifado
// => fallback PRODUCAO em getPerfilFromUser.
const PRODUCAO_FALLBACK = { id: 50, nome: 'Chão de Fábrica', role: 'usuario', email: 'prod@test.com' };
const CONSULTA = { id: 51, nome: 'Consulta', role: 'usuario', perfil_almoxarifado: 'CONSULTA', email: 'consulta@test.com' };
const ALMOXARIFE = { id: 52, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };
const GESTOR = { id: 53, nome: 'Gestor', role: 'usuario', perfil_almoxarifado: 'GESTOR', email: 'gestor@test.com' };
const ENGENHARIA = { id: 54, nome: 'Engenharia', role: 'usuario', perfil_almoxarifado: 'ENGENHARIA', email: 'eng@test.com' };
const ADMIN = { id: 55, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seqMat = 0; let seqReq = 0; let seqConf = 0;

async function criarMaterial(db, { qtd = 100 } = {}) {
  seqMat += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, unidade, ativo)
     VALUES (?,?,?,'UN',1)`,
    [`PERM-MAT-${seqMat}`, `Material Perm ${seqMat}`, qtd]);
  return r.lastID;
}

async function criarRequisicao(db, { status, itens = [], solicitanteId = 999 }) {
  seqReq += 1;
  const r = await dbRun(db,
    `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
     VALUES (?,?,'Solicitante Perm',?)`,
    [`REQ-PERM-${seqReq}`, solicitanteId, status]);
  const reqId = r.lastID;
  const itemIds = [];
  for (const item of itens) {
    const ri = await dbRun(db,
      `INSERT INTO itens_requisicao_almoxarifado
       (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue)
       VALUES (?,?,?,?,?)`,
      [reqId, item.material_id, item.quantidade ?? 1, item.quantidade_separada ?? 0, item.quantidade_entregue ?? 0]);
    itemIds.push(ri.lastID);
  }
  return { id: reqId, itemIds };
}

async function criarConferencia(db, { materialId, quantidadeSistema = 100, quantidadeContada = null, status = 'ABERTO' }) {
  seqConf += 1;
  const r = await dbRun(db,
    `INSERT INTO conferencias_almoxarifado (numero, status, responsavel_id, responsavel_nome)
     VALUES (?,?,?, 'Responsável Perm')`,
    [`INV-PERM-${seqConf}`, status, ADMIN.id]);
  const confId = r.lastID;
  const divergencia = quantidadeContada === null ? null : quantidadeContada - quantidadeSistema;
  // Etapa 10 (RN-04/RN-05): os testes deste arquivo medem PERFIL (quem pode concluir/aplicar
  // ajuste), não a regra de tolerância — mas a rota agora valida RN-05 de verdade, e a
  // divergência de teste que este helper grava (100 -> 5, 95%) sem tolerância configurada
  // estourava qualquer limite. `recontado = 1` reaproveita a mesma saída que RN-04 dá ao
  // operador de verdade (a segunda contagem libera qualquer que seja o valor) sem mudar a
  // divergência que os testes de PERMISSÃO realmente verificam (ex.: saldo virando 5 depois do
  // ajuste do GESTOR).
  const ri = await dbRun(db,
    `INSERT INTO itens_conferencia_almoxarifado
     (conferencia_id, material_id, quantidade_sistema, quantidade_contada, divergencia, recontado)
     VALUES (?,?,?,?,?,?)`,
    [confId, materialId, quantidadeSistema, quantidadeContada, divergencia, quantidadeContada === null ? 0 : 1]);
  return { id: confId, itemId: ri.lastID };
}

const statusDe = (db, reqId) => dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId])
  .then((r) => r.status);
const saldoDe = (db, matId) => dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId])
  .then((r) => r.quantidade_atual);

(async () => {
  const { app, db, setUser, close, uploadsAlmoxDir } = await createTestApp({ user: ADMIN });

  const contarArquivosUpload = () => {
    try { return fs.readdirSync(uploadsAlmoxDir).length; } catch (e) { return 0; }
  };

  // ══════════════════════════ INVENTÁRIO (inventario) ══════════════════════════

  await test('[POST /conferencias] PRODUCAO (fallback) -> 403, nenhuma conferência criada', async () => {
    const antes = await dbGet(db, 'SELECT COUNT(*) as c FROM conferencias_almoxarifado');
    setUser(PRODUCAO_FALLBACK);
    const res = await request(app).post('/api/almoxarifado/conferencias').send({});
    assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.acao, 'inventario', JSON.stringify(res.body));
    const depois = await dbGet(db, 'SELECT COUNT(*) as c FROM conferencias_almoxarifado');
    assert.strictEqual(depois.c, antes.c, 'conferência foi criada apesar do 403');
  });

  await test('[POST /conferencias] CONSULTA -> 403', async () => {
    setUser(CONSULTA);
    const res = await request(app).post('/api/almoxarifado/conferencias').send({});
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
  });

  await test('[POST /conferencias] ALMOXARIFE -> 201', async () => {
    await criarMaterial(db);
    setUser(ALMOXARIFE);
    const res = await request(app).post('/api/almoxarifado/conferencias').send({});
    assert.strictEqual(res.status, 201, `esperava 201, veio ${res.status}: ${JSON.stringify(res.body)}`);
  });

  await test('[POST /conferencias] GESTOR -> 201 (inventario inclui GESTOR)', async () => {
    setUser(GESTOR);
    const res = await request(app).post('/api/almoxarifado/conferencias').send({});
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  await test('[PUT /conferencias/:id/item/:itemId] PRODUCAO -> 403, contagem não gravada', async () => {
    const matId = await criarMaterial(db);
    const { id: confId, itemId } = await criarConferencia(db, { materialId: matId });

    setUser(PRODUCAO_FALLBACK);
    const res = await request(app).put(`/api/almoxarifado/conferencias/${confId}/item/${itemId}`)
      .send({ quantidade_contada: 7 });
    assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);

    const item = await dbGet(db, 'SELECT quantidade_contada FROM itens_conferencia_almoxarifado WHERE id = ?', [itemId]);
    assert.strictEqual(item.quantidade_contada, null, 'contagem gravada apesar do 403');
  });

  await test('[PUT /conferencias/:id/item/:itemId] ALMOXARIFE -> 200', async () => {
    const matId = await criarMaterial(db);
    const { id: confId, itemId } = await criarConferencia(db, { materialId: matId });

    setUser(ALMOXARIFE);
    const res = await request(app).put(`/api/almoxarifado/conferencias/${confId}/item/${itemId}`)
      .send({ quantidade_contada: 7 });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const item = await dbGet(db, 'SELECT quantidade_contada FROM itens_conferencia_almoxarifado WHERE id = ?', [itemId]);
    assert.strictEqual(Number(item.quantidade_contada), 7);
  });

  await test('[PUT /conferencias/:id/cancelar] PRODUCAO -> 403, status ABERTO intacto', async () => {
    const matId = await criarMaterial(db);
    const { id: confId } = await criarConferencia(db, { materialId: matId });

    setUser(PRODUCAO_FALLBACK);
    const res = await request(app).put(`/api/almoxarifado/conferencias/${confId}/cancelar`).send({});
    assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);

    const conf = await dbGet(db, 'SELECT status FROM conferencias_almoxarifado WHERE id = ?', [confId]);
    assert.strictEqual(conf.status, 'ABERTO', 'conferência cancelada apesar do 403');
  });

  await test('[PUT /conferencias/:id/cancelar] GESTOR -> 200', async () => {
    const matId = await criarMaterial(db);
    const { id: confId } = await criarConferencia(db, { materialId: matId });

    setUser(GESTOR);
    const res = await request(app).put(`/api/almoxarifado/conferencias/${confId}/cancelar`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  // /concluir é o vetor mais destrutivo do arquivo: com aplicar_ajustes:true faz
  // `UPDATE materiais_almoxarifado SET quantidade_atual = ?` direto, por fora do
  // stockService (sem validação de saldo/localização bloqueada). Daí a dupla exigência.
  await test('[PUT /conferencias/:id/concluir] PRODUCAO com aplicar_ajustes -> 403, saldo e status intactos', async () => {
    const matId = await criarMaterial(db, { qtd: 100 });
    const { id: confId } = await criarConferencia(db, { materialId: matId, quantidadeSistema: 100, quantidadeContada: 5 });

    setUser(PRODUCAO_FALLBACK);
    const res = await request(app).put(`/api/almoxarifado/conferencias/${confId}/concluir`)
      .send({ aplicar_ajustes: true });
    assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(Number(await saldoDe(db, matId)), 100, 'saldo ajustado apesar do 403');

    const conf = await dbGet(db, 'SELECT status FROM conferencias_almoxarifado WHERE id = ?', [confId]);
    assert.strictEqual(conf.status, 'ABERTO', 'conferência concluída apesar do 403');
  });

  await test('[PUT /conferencias/:id/concluir] PRODUCAO sem aplicar_ajustes -> 403 (inventario já barra)', async () => {
    const matId = await criarMaterial(db, { qtd: 100 });
    const { id: confId } = await criarConferencia(db, { materialId: matId, quantidadeSistema: 100, quantidadeContada: 5 });

    setUser(PRODUCAO_FALLBACK);
    const res = await request(app).put(`/api/almoxarifado/conferencias/${confId}/concluir`).send({});
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.strictEqual(res.body.acao, 'inventario', JSON.stringify(res.body));
  });

  await test('[PUT /conferencias/:id/concluir] ALMOXARIFE sem aplicar_ajustes -> 200, saldo intacto', async () => {
    const matId = await criarMaterial(db, { qtd: 100 });
    const { id: confId } = await criarConferencia(db, { materialId: matId, quantidadeSistema: 100, quantidadeContada: 5 });

    setUser(ALMOXARIFE);
    const res = await request(app).put(`/api/almoxarifado/conferencias/${confId}/concluir`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(Number(await saldoDe(db, matId)), 100, 'saldo não deveria mudar sem aplicar_ajustes');
  });

  // Segregação: contar (inventario) e mexer no saldo (ajustar_estoque) são permissões
  // diferentes — ALMOXARIFE conta, mas só ADMINISTRADOR/GESTOR homologam o ajuste.
  await test('[PUT /conferencias/:id/concluir] ALMOXARIFE com aplicar_ajustes -> 403 (falta ajustar_estoque), saldo intacto', async () => {
    const matId = await criarMaterial(db, { qtd: 100 });
    const { id: confId } = await criarConferencia(db, { materialId: matId, quantidadeSistema: 100, quantidadeContada: 5 });

    setUser(ALMOXARIFE);
    const res = await request(app).put(`/api/almoxarifado/conferencias/${confId}/concluir`)
      .send({ aplicar_ajustes: true });
    assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(Number(await saldoDe(db, matId)), 100, 'saldo ajustado apesar do 403');

    const conf = await dbGet(db, 'SELECT status FROM conferencias_almoxarifado WHERE id = ?', [confId]);
    assert.strictEqual(conf.status, 'ABERTO', 'conferência concluída apesar do 403');
  });

  await test('[PUT /conferencias/:id/concluir] GESTOR com aplicar_ajustes -> 200, saldo ajustado', async () => {
    const matId = await criarMaterial(db, { qtd: 100 });
    const { id: confId } = await criarConferencia(db, { materialId: matId, quantidadeSistema: 100, quantidadeContada: 5 });

    setUser(GESTOR);
    // Etapa 10 (RN-06b): aplicar_ajustes agora exige justificativa_ajuste (min 5 caracteres) —
    // sem isto o motor recusaria com 400 antes de tocar no saldo, e este teste NÃO é sobre essa
    // regra (tem arquivo próprio: conferenciaTolerancia.api.test.js).
    const res = await request(app).put(`/api/almoxarifado/conferencias/${confId}/concluir`)
      .send({ aplicar_ajustes: true, justificativa_ajuste: 'Ajuste homologado pelo gestor' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.ajustesAplicados, 1, JSON.stringify(res.body));
    assert.strictEqual(Number(await saldoDe(db, matId)), 5, 'GESTOR deveria conseguir aplicar o ajuste');
  });

  // ══════════════════════ SEPARAÇÃO / ENTREGA (separar_emitir) ══════════════════════

  for (const rota of ['separacao', 'separar']) {
    await test(`[PUT /requisicoes/:id/${rota}] PRODUCAO -> 403, status APROVADO intacto`, async () => {
      const matId = await criarMaterial(db);
      const { id: reqId, itemIds } = await criarRequisicao(db, {
        status: 'APROVADO', itens: [{ material_id: matId, quantidade: 3 }],
      });

      setUser(PRODUCAO_FALLBACK);
      const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/${rota}`)
        .send({ itens_separados: [{ item_id: itemIds[0], quantidade_separada: 3 }] });
      assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.acao, 'separar_emitir', JSON.stringify(res.body));
      assert.strictEqual(await statusDe(db, reqId), 'APROVADO', 'status mudou apesar do 403');
    });

    await test(`[PUT /requisicoes/:id/${rota}] GESTOR -> 403 (separar_emitir não inclui GESTOR)`, async () => {
      const matId = await criarMaterial(db);
      const { id: reqId, itemIds } = await criarRequisicao(db, {
        status: 'APROVADO', itens: [{ material_id: matId, quantidade: 3 }],
      });

      setUser(GESTOR);
      const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/${rota}`)
        .send({ itens_separados: [{ item_id: itemIds[0], quantidade_separada: 3 }] });
      assert.strictEqual(res.status, 403, JSON.stringify(res.body));
      assert.strictEqual(await statusDe(db, reqId), 'APROVADO');
    });

    await test(`[PUT /requisicoes/:id/${rota}] ALMOXARIFE -> 200 EM_SEPARACAO`, async () => {
      const matId = await criarMaterial(db);
      const { id: reqId, itemIds } = await criarRequisicao(db, {
        status: 'APROVADO', itens: [{ material_id: matId, quantidade: 3 }],
      });

      setUser(ALMOXARIFE);
      const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/${rota}`)
        .send({ itens_separados: [{ item_id: itemIds[0], quantidade_separada: 3 }] });
      assert.strictEqual(res.status, 200, `esperava 200, veio ${res.status}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(await statusDe(db, reqId), 'EM_SEPARACAO');
    });
  }

  await test('[PUT /requisicoes/:id/liberar-retirada] PRODUCAO -> 403, status EM_SEPARACAO intacto', async () => {
    const matId = await criarMaterial(db);
    const { id: reqId } = await criarRequisicao(db, {
      status: 'EM_SEPARACAO', itens: [{ material_id: matId, quantidade: 3, quantidade_separada: 3 }],
    });

    setUser(PRODUCAO_FALLBACK);
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/liberar-retirada`).send({});
    assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(await statusDe(db, reqId), 'EM_SEPARACAO', 'status mudou apesar do 403');
  });

  await test('[PUT /requisicoes/:id/liberar-retirada] ALMOXARIFE -> 200 PRONTA_PARA_RETIRADA', async () => {
    const matId = await criarMaterial(db);
    const { id: reqId } = await criarRequisicao(db, {
      status: 'EM_SEPARACAO', itens: [{ material_id: matId, quantidade: 3, quantidade_separada: 3 }],
    });

    setUser(ALMOXARIFE);
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/liberar-retirada`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(await statusDe(db, reqId), 'PRONTA_PARA_RETIRADA');
  });

  await test('[PUT /requisicoes/:id/entregar] PRODUCAO -> 403, saldo e status intactos', async () => {
    const matId = await criarMaterial(db, { qtd: 100 });
    const { id: reqId, itemIds } = await criarRequisicao(db, {
      status: 'PRONTA_PARA_RETIRADA', itens: [{ material_id: matId, quantidade: 3, quantidade_separada: 3 }],
    });

    setUser(PRODUCAO_FALLBACK);
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemIds[0], quantidade_atendida: 3 }] });
    assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(Number(await saldoDe(db, matId)), 100, 'estoque baixado apesar do 403');
    assert.strictEqual(await statusDe(db, reqId), 'PRONTA_PARA_RETIRADA', 'status mudou apesar do 403');
  });

  await test('[PUT /requisicoes/:id/entregar] ALMOXARIFE -> 200, estoque baixado', async () => {
    const matId = await criarMaterial(db, { qtd: 100 });
    const { id: reqId, itemIds } = await criarRequisicao(db, {
      status: 'PRONTA_PARA_RETIRADA', itens: [{ material_id: matId, quantidade: 3, quantidade_separada: 3 }],
    });

    setUser(ALMOXARIFE);
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemIds[0], quantidade_atendida: 3 }] });
    assert.strictEqual(res.status, 200, `esperava 200, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(Number(await saldoDe(db, matId)), 97, 'estoque deveria ter sido baixado');
  });

  // ══════════════════════ APROVAÇÃO (aprovar_requisicao) ══════════════════════

  await test('[PUT /requisicoes/:id/aprovar] PRODUCAO (não solicitante) -> 403, status PENDENTE intacto', async () => {
    const matId = await criarMaterial(db);
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 999,
    });

    setUser(PRODUCAO_FALLBACK);
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.acao, 'aprovar_requisicao', JSON.stringify(res.body));
    assert.strictEqual(await statusDe(db, reqId), 'PENDENTE', 'status mudou apesar do 403');
  });

  // Etapa 4: com saldo, aprovar também reserva, e o status de sucesso é TOTALMENTE_RESERVADA.
  // GESTOR é o caso interessante: tem `aprovar_requisicao` mas NÃO tem `reservar`. A reserva
  // automática é ação do fluxo, não do usuário — quem a barrasse aqui faria o GESTOR tomar 403
  // no meio da própria aprovação que a permissão dele autoriza.
  await test('[PUT /requisicoes/:id/aprovar] GESTOR (não solicitante) -> 200 e reserva automática', async () => {
    const matId = await criarMaterial(db);
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 999,
    });

    setUser(GESTOR);
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'TOTALMENTE_RESERVADA', JSON.stringify(res.body));
    const reserva = await dbGet(db,
      `SELECT quantidade, origem FROM reservas_material_almoxarifado WHERE requisicao_id = ?`, [reqId]);
    assert.ok(reserva, 'aprovação do GESTOR deveria ter criado a reserva do item');
    assert.strictEqual(reserva.origem, 'REQUISICAO');
  });

  // A segregação de funções (solicitante não aprova a própria) continua valendo e é
  // INDEPENDENTE da permissão de perfil — um GESTOR não aprova a requisição dele.
  await test('[PUT /requisicoes/:id/aprovar] GESTOR que é o solicitante -> 403 (segregação preservada)', async () => {
    const matId = await criarMaterial(db);
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: GESTOR.id,
    });

    setUser(GESTOR);
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Solicitante não pode aprovar a própria requisição');
    assert.strictEqual(await statusDe(db, reqId), 'PENDENTE');
  });

  await test('[PUT /requisicoes/:id/rejeitar] PRODUCAO (não solicitante) -> 403, status PENDENTE intacto', async () => {
    const matId = await criarMaterial(db);
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 999,
    });

    setUser(PRODUCAO_FALLBACK);
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/rejeitar`)
      .send({ motivo: 'não quero que aprovem' });
    assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(await statusDe(db, reqId), 'PENDENTE', 'status mudou apesar do 403');
  });

  // Desistência: o solicitante SEMPRE pode rejeitar a própria requisição, mesmo sem
  // aprovar_requisicao (decisão de design documentada na rota /rejeitar).
  await test('[PUT /requisicoes/:id/rejeitar] PRODUCAO que é o solicitante -> 200 (desistência preservada)', async () => {
    const matId = await criarMaterial(db);
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: PRODUCAO_FALLBACK.id,
    });

    setUser(PRODUCAO_FALLBACK);
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/rejeitar`)
      .send({ motivo: 'Não preciso mais' });
    assert.strictEqual(res.status, 200, `esperava 200, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(await statusDe(db, reqId), 'REJEITADO');
  });

  await test('[PUT /requisicoes/:id/rejeitar] ALMOXARIFE (não solicitante) -> 200 REJEITADO', async () => {
    const matId = await criarMaterial(db);
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 999,
    });

    setUser(ALMOXARIFE);
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/rejeitar`)
      .send({ motivo: 'Material indisponível' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(await statusDe(db, reqId), 'REJEITADO');
  });

  // ═════════════════ CADASTRO DE MATERIAL (criar_material / editar_material) ═════════════════

  const familia = await dbGet(db, 'SELECT id FROM familias_material_almoxarifado LIMIT 1');
  assert.ok(familia, 'seed de famílias deveria existir');
  const familiaId = familia.id;

  await test('[POST /materiais] PRODUCAO -> 403, material não criado', async () => {
    setUser(PRODUCAO_FALLBACK);
    const res = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: 'PERM-NEG-01', nome: 'Não deveria existir', familia_id: familiaId, unidade: 'UN' });
    assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.acao, 'criar_material', JSON.stringify(res.body));

    const row = await dbGet(db, 'SELECT id FROM materiais_almoxarifado WHERE codigo = ?', ['PERM-NEG-01']);
    assert.strictEqual(row, undefined, 'material criado apesar do 403');
  });

  await test('[POST /materiais] CONSULTA -> 403', async () => {
    setUser(CONSULTA);
    const res = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: 'PERM-NEG-02', nome: 'Não deveria existir', familia_id: familiaId, unidade: 'UN' });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
  });

  await test('[POST /materiais] ENGENHARIA -> 201', async () => {
    setUser(ENGENHARIA);
    const res = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: 'PERM-OK-01', nome: 'Material Engenharia', familia_id: familiaId, unidade: 'UN' });
    assert.strictEqual(res.status, 201, `esperava 201, veio ${res.status}: ${JSON.stringify(res.body)}`);
  });

  await test('[POST /materiais] ALMOXARIFE -> 201', async () => {
    setUser(ALMOXARIFE);
    const res = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: 'PERM-OK-02', nome: 'Material Almoxarife', familia_id: familiaId, unidade: 'UN' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  await test('[PUT /materiais/:id] PRODUCAO -> 403, nome inalterado', async () => {
    const matId = await criarMaterial(db);
    const antes = await dbGet(db, 'SELECT nome FROM materiais_almoxarifado WHERE id = ?', [matId]);

    setUser(PRODUCAO_FALLBACK);
    const res = await request(app).put(`/api/almoxarifado/materiais/${matId}`)
      .send({ nome: 'Renomeado sem permissão' });
    assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.acao, 'editar_material', JSON.stringify(res.body));

    const depois = await dbGet(db, 'SELECT nome FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(depois.nome, antes.nome, 'material editado apesar do 403');
  });

  await test('[PUT /materiais/:id] ENGENHARIA -> 200', async () => {
    const matId = await criarMaterial(db);
    setUser(ENGENHARIA);
    const res = await request(app).put(`/api/almoxarifado/materiais/${matId}`)
      .send({ nome: 'Renomeado pela engenharia' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const depois = await dbGet(db, 'SELECT nome FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(depois.nome, 'Renomeado pela engenharia');
  });

  await test('[DELETE /materiais/:id] PRODUCAO -> 403, material continua ativo', async () => {
    const matId = await criarMaterial(db);

    setUser(PRODUCAO_FALLBACK);
    const res = await request(app).delete(`/api/almoxarifado/materiais/${matId}`);
    assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);

    const row = await dbGet(db, 'SELECT ativo FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(Number(row.ativo), 1, 'material inativado apesar do 403');
  });

  await test('[DELETE /materiais/:id] ALMOXARIFE -> 200, material inativado', async () => {
    const matId = await criarMaterial(db);
    setUser(ALMOXARIFE);
    const res = await request(app).delete(`/api/almoxarifado/materiais/${matId}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const row = await dbGet(db, 'SELECT ativo FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(Number(row.ativo), 0);
  });

  // O gate tem de rodar ANTES do multer — senão o arquivo de quem não tem permissão já
  // está gravado em disco quando o 403 sai (upload não autorizado + arquivo órfão).
  const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');

  await test('[POST /materiais/:id/foto] PRODUCAO -> 403, foto não gravada e nenhum arquivo em disco', async () => {
    const matId = await criarMaterial(db);
    const arquivosAntes = contarArquivosUpload();

    setUser(PRODUCAO_FALLBACK);
    const res = await request(app).post(`/api/almoxarifado/materiais/${matId}/foto`)
      .attach('foto', PNG_1x1, 'sem-permissao.png');
    assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.acao, 'editar_material', JSON.stringify(res.body));

    const row = await dbGet(db, 'SELECT foto FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(row.foto, null, 'foto gravada apesar do 403');
    assert.strictEqual(contarArquivosUpload(), arquivosAntes,
      'multer gravou o arquivo antes do 403 — requirePermission deve vir ANTES do upload');
  });

  await test('[POST /materiais/:id/foto] ALMOXARIFE -> 200, foto gravada', async () => {
    const matId = await criarMaterial(db);
    setUser(ALMOXARIFE);
    const res = await request(app).post(`/api/almoxarifado/materiais/${matId}/foto`)
      .attach('foto', PNG_1x1, 'com-permissao.png');
    assert.strictEqual(res.status, 200, `esperava 200, veio ${res.status}: ${JSON.stringify(res.body)}`);
    const row = await dbGet(db, 'SELECT foto FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.ok(row.foto, 'foto deveria ter sido gravada');
  });

  // ══════════════════════════ REQUISIÇÃO (requisitar) ══════════════════════════
  // PRODUCAO É um perfil válido aqui (chão de fábrica pede material) — o caso negativo
  // é CONSULTA, que só visualiza.

  await test('[POST /requisicoes] CONSULTA -> 403, nenhuma requisição criada', async () => {
    const matId = await criarMaterial(db);
    const antes = await dbGet(db, 'SELECT COUNT(*) as c FROM requisicoes_almoxarifado');

    setUser(CONSULTA);
    const res = await request(app).post('/api/almoxarifado/requisicoes')
      .send({ itens: [{ material_id: matId, quantidade: 1 }] });
    assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.acao, 'requisitar', JSON.stringify(res.body));

    const depois = await dbGet(db, 'SELECT COUNT(*) as c FROM requisicoes_almoxarifado');
    assert.strictEqual(depois.c, antes.c, 'requisição criada apesar do 403');
  });

  await test('[POST /requisicoes] PRODUCAO (fallback) -> 201 (requisitar inclui PRODUCAO)', async () => {
    const matId = await criarMaterial(db);
    setUser(PRODUCAO_FALLBACK);
    const res = await request(app).post('/api/almoxarifado/requisicoes')
      .send({ itens: [{ material_id: matId, quantidade: 1 }] });
    assert.strictEqual(res.status, 201, `esperava 201, veio ${res.status}: ${JSON.stringify(res.body)}`);
  });

  await test('[POST /requisicoes/:id/copiar] CONSULTA -> 403, nenhum rascunho criado', async () => {
    const matId = await criarMaterial(db);
    const { id: reqId } = await criarRequisicao(db, {
      status: 'ENTREGUE', itens: [{ material_id: matId, quantidade: 2, quantidade_entregue: 2 }],
    });
    const antes = await dbGet(db, 'SELECT COUNT(*) as c FROM requisicoes_almoxarifado');

    setUser(CONSULTA);
    const res = await request(app).post(`/api/almoxarifado/requisicoes/${reqId}/copiar`).send({});
    assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.acao, 'requisitar', JSON.stringify(res.body));

    const depois = await dbGet(db, 'SELECT COUNT(*) as c FROM requisicoes_almoxarifado');
    assert.strictEqual(depois.c, antes.c, 'rascunho criado apesar do 403');
  });

  await test('[POST /requisicoes/:id/copiar] PRODUCAO (fallback) -> 201 RASCUNHO', async () => {
    const matId = await criarMaterial(db);
    const { id: reqId } = await criarRequisicao(db, {
      status: 'ENTREGUE', itens: [{ material_id: matId, quantidade: 2, quantidade_entregue: 2 }],
    });

    setUser(PRODUCAO_FALLBACK);
    const res = await request(app).post(`/api/almoxarifado/requisicoes/${reqId}/copiar`).send({});
    assert.strictEqual(res.status, 201, `esperava 201, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.status, 'RASCUNHO');
  });

  // ══════════════════ REGRESSÃO: rotas fora do escopo não mudaram ══════════════════

  await test('[regressão] GET /materiais continua liberado para CONSULTA (só visualizar)', async () => {
    setUser(CONSULTA);
    const res = await request(app).get('/api/almoxarifado/materiais');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await test('[regressão] confirmar-recebimento continua sendo do solicitante, sem exigir perfil', async () => {
    const matId = await criarMaterial(db);
    const { id: reqId } = await criarRequisicao(db, {
      status: 'ENTREGUE', itens: [{ material_id: matId, quantidade: 1, quantidade_entregue: 1 }],
      solicitanteId: PRODUCAO_FALLBACK.id,
    });

    setUser(PRODUCAO_FALLBACK);
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/confirmar-recebimento`).send({});
    assert.strictEqual(res.status, 200, `esperava 200, veio ${res.status}: ${JSON.stringify(res.body)}`);
  });

  await test('[regressão] /enviar continua sendo do dono do rascunho, sem exigir perfil', async () => {
    const matId = await criarMaterial(db);
    const { id: reqId } = await criarRequisicao(db, {
      status: 'RASCUNHO', itens: [{ material_id: matId, quantidade: 1 }],
      solicitanteId: PRODUCAO_FALLBACK.id,
    });

    setUser(PRODUCAO_FALLBACK);
    const res = await request(app).post(`/api/almoxarifado/requisicoes/${reqId}/enviar`).send({});
    assert.strictEqual(res.status, 200, `esperava 200, veio ${res.status}: ${JSON.stringify(res.body)}`);
  });

  setUser(ADMIN);
  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
