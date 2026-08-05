/**
 * Etapa 3, Task 5 — confirmação de recebimento pelo solicitante, encerramento
 * (perfil aprovar_requisicao) e copiar requisição (novo RASCUNHO fiel).
 *
 * Cenários (task-5-brief.md, Step 1): confirmar por outro usuário -> 403; pelo
 * solicitante -> 200 e campos setados; confirmar duas vezes -> 400; encerrar
 * PARCIALMENTE_ATENDIDA -> ENCERRADA e entregar depois -> 400; encerrar por perfil
 * PRODUCAO -> 403; copiar -> novo RASCUNHO com itens iguais e entregues zerados.
 *
 * Decisão de design (registrada no código das rotas): confirmação de recebimento é o
 * testemunho do próprio solicitante — diferente de /cancelar e /enviar, admin NÃO faz
 * bypass aqui.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

let seq = 0;
function numero() {
  seq += 1;
  return `REQ-CICLO-${seq}`;
}

async function criarRequisicao(db, {
  status, itens, solicitanteId = 1, solicitanteNome = 'Solicitante Teste',
  tipoRequisicao = 'CONSUMO', centroCustoId = null, localEntrega = null,
  projetoId = null, clienteId = null, osReferencia = null, setor = null,
  departamento = null, justificativa = null,
}) {
  const reqRes = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
    (numero, solicitante_id, solicitante_nome, status, tipo_requisicao, centro_custo_id,
     local_entrega, projeto_id, cliente_id, os_referencia, setor, departamento, justificativa)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [numero(), solicitanteId, solicitanteNome, status, tipoRequisicao, centroCustoId,
      localEntrega, projetoId, clienteId, osReferencia, setor, departamento, justificativa]);
  const reqId = reqRes.lastID;
  const itemIds = [];
  for (const item of itens || []) {
    const r = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, observacoes)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [reqId, item.material_id, item.quantidade ?? 1, item.quantidade_separada ?? 0,
        item.quantidade_entregue ?? 0, item.observacoes ?? null]);
    itemIds.push(r.lastID);
  }
  return { id: reqId, itemIds };
}

(async () => {
  const ADMIN_USER = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN_USER });

  const fam = await request(app).post('/api/almoxarifado/familias')
    .send({ codigo: 'FAMCICLO', nome: 'Família Ciclo Final Teste' });
  assert.strictEqual(fam.status, 201, JSON.stringify(fam.body));
  const familiaId = fam.body.id;

  async function criarMaterial(codigo, quantidadeAtual = 50) {
    const res = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo, nome: `Material ${codigo}`, familia_id: familiaId, unidade: 'UN' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const materialId = res.body.id;
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ? WHERE id = ?',
      [quantidadeAtual, materialId]);
    return materialId;
  }

  // ════════════════════════════ /confirmar-recebimento ════════════════════════════

  await test('[confirmar-recebimento] outro usuário (não solicitante) -> 403, status inalterado', async () => {
    const matId = await criarMaterial('MATCICLO-01');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'ENTREGUE', itens: [{ material_id: matId, quantidade: 2 }], solicitanteId: 42,
    });

    setUser({ id: 99, nome: 'Outro Usuário', role: 'user', email: 'outro@test.com' });
    try {
      const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/confirmar-recebimento`).send({});
      assert.strictEqual(res.status, 403, JSON.stringify(res.body));

      const row = await dbGet(db, 'SELECT recebimento_confirmado_por FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
      assert.strictEqual(row.recebimento_confirmado_por, null);
    } finally {
      setUser(ADMIN_USER);
    }
  });

  await test('[confirmar-recebimento] admin que NÃO é o solicitante -> 403 (sem bypass de admin)', async () => {
    const matId = await criarMaterial('MATCICLO-02');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'ENTREGUE', itens: [{ material_id: matId, quantidade: 2 }], solicitanteId: 42,
    });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/confirmar-recebimento`).send({});
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
  });

  await test('[confirmar-recebimento] pelo solicitante em ENTREGUE -> 200, campos setados', async () => {
    const matId = await criarMaterial('MATCICLO-03');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'ENTREGUE', itens: [{ material_id: matId, quantidade: 2 }], solicitanteId: 42,
    });

    setUser({ id: 42, nome: 'Solicitante Dono', role: 'user', email: 'dono@test.com' });
    try {
      const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/confirmar-recebimento`).send({});
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.success, true);

      const row = await dbGet(db, 'SELECT recebimento_confirmado_por, recebimento_confirmado_em FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
      assert.strictEqual(row.recebimento_confirmado_por, 42);
      assert.ok(row.recebimento_confirmado_em, 'recebimento_confirmado_em deveria estar setado');
    } finally {
      setUser(ADMIN_USER);
    }
  });

  await test('[confirmar-recebimento] duas vezes -> 400 "Recebimento já confirmado"', async () => {
    const matId = await criarMaterial('MATCICLO-04');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'ENTREGUE', itens: [{ material_id: matId, quantidade: 2 }], solicitanteId: 42,
    });

    setUser({ id: 42, nome: 'Solicitante Dono', role: 'user', email: 'dono@test.com' });
    try {
      const primeira = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/confirmar-recebimento`).send({});
      assert.strictEqual(primeira.status, 200, JSON.stringify(primeira.body));

      const segunda = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/confirmar-recebimento`).send({});
      assert.strictEqual(segunda.status, 400, JSON.stringify(segunda.body));
      assert.strictEqual(segunda.body.error, 'Recebimento já confirmado');
    } finally {
      setUser(ADMIN_USER);
    }
  });

  await test('[confirmar-recebimento] em PARCIALMENTE_ATENDIDA -> 200', async () => {
    const matId = await criarMaterial('MATCICLO-05');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PARCIALMENTE_ATENDIDA', itens: [{ material_id: matId, quantidade: 5, quantidade_entregue: 2 }], solicitanteId: 42,
    });

    setUser({ id: 42, nome: 'Solicitante Dono', role: 'user', email: 'dono@test.com' });
    try {
      const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/confirmar-recebimento`).send({});
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    } finally {
      setUser(ADMIN_USER);
    }
  });

  await test('[confirmar-recebimento] em ENCERRADA -> 200', async () => {
    const matId = await criarMaterial('MATCICLO-06');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'ENCERRADA', itens: [{ material_id: matId, quantidade: 2, quantidade_entregue: 2 }], solicitanteId: 42,
    });

    setUser({ id: 42, nome: 'Solicitante Dono', role: 'user', email: 'dono@test.com' });
    try {
      const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/confirmar-recebimento`).send({});
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    } finally {
      setUser(ADMIN_USER);
    }
  });

  await test('[confirmar-recebimento] status não permitido (PENDENTE) -> 400', async () => {
    const matId = await criarMaterial('MATCICLO-07');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 2 }], solicitanteId: 42,
    });

    setUser({ id: 42, nome: 'Solicitante Dono', role: 'user', email: 'dono@test.com' });
    try {
      const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/confirmar-recebimento`).send({});
      assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    } finally {
      setUser(ADMIN_USER);
    }
  });

  await test('[confirmar-recebimento] requisição inexistente -> 404', async () => {
    const res = await request(app).put('/api/almoxarifado/requisicoes/999999/confirmar-recebimento').send({});
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
  });

  await test('[confirmar-recebimento] decisão auditada (acao CONFIRMACAO_RECEBIMENTO)', async () => {
    const matId = await criarMaterial('MATCICLO-08');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'ENTREGUE', itens: [{ material_id: matId, quantidade: 2 }], solicitanteId: 42,
    });

    setUser({ id: 42, nome: 'Solicitante Dono', role: 'user', email: 'dono@test.com' });
    try {
      const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/confirmar-recebimento`).send({});
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));

      const log = await dbGet(db,
        `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao' AND entidade_id = ? AND acao = 'CONFIRMACAO_RECEBIMENTO'`,
        [reqId]);
      assert.ok(log, 'deveria existir registro de auditoria para a confirmação');
      assert.strictEqual(log.usuario_id, 42);
    } finally {
      setUser(ADMIN_USER);
    }
  });

  // ════════════════════════════ /encerrar ════════════════════════════

  await test('[encerrar] perfil aprovar_requisicao (admin) em ENTREGUE -> 200 ENCERRADA, campos setados, auditado', async () => {
    const matId = await criarMaterial('MATCICLO-09');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'ENTREGUE', itens: [{ material_id: matId, quantidade: 2, quantidade_entregue: 2 }], solicitanteId: 42,
    });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/encerrar`).send({ motivo: 'Ciclo concluído' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'ENCERRADA');

    const row = await dbGet(db, 'SELECT status, encerrado_por, encerrado_em FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(row.status, 'ENCERRADA');
    assert.strictEqual(row.encerrado_por, ADMIN_USER.id);
    assert.ok(row.encerrado_em, 'encerrado_em deveria estar setado');

    const log = await dbGet(db,
      `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao' AND entidade_id = ? AND acao = 'ENCERRAMENTO'`,
      [reqId]);
    assert.ok(log, 'deveria existir registro de auditoria para o encerramento');
    assert.strictEqual(log.justificativa, 'Ciclo concluído');
  });

  await test('[encerrar] PARCIALMENTE_ATENDIDA -> ENCERRADA e entregar depois -> 400', async () => {
    const matId = await criarMaterial('MATCICLO-10');
    const { id: reqId, itemIds } = await criarRequisicao(db, {
      status: 'PARCIALMENTE_ATENDIDA',
      itens: [{ material_id: matId, quantidade: 5, quantidade_separada: 5, quantidade_entregue: 2 }],
      solicitanteId: 42,
    });

    const encerra = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/encerrar`).send({});
    assert.strictEqual(encerra.status, 200, JSON.stringify(encerra.body));
    assert.strictEqual(encerra.body.status, 'ENCERRADA');

    const entrega = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemIds[0], quantidade_atendida: 1 }] });
    assert.strictEqual(entrega.status, 400, JSON.stringify(entrega.body));

    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(row.status, 'ENCERRADA', 'status não deveria ter mudado com a tentativa de entrega');
  });

  await test('[encerrar] perfil PRODUCAO -> 403, status inalterado', async () => {
    const matId = await criarMaterial('MATCICLO-11');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'ENTREGUE', itens: [{ material_id: matId, quantidade: 2, quantidade_entregue: 2 }], solicitanteId: 42,
    });

    setUser({
      id: 88, nome: 'Produção Teste', role: 'user', perfil_almoxarifado: 'PRODUCAO', email: 'prod@test.com',
    });
    try {
      const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/encerrar`).send({});
      assert.strictEqual(res.status, 403, JSON.stringify(res.body));

      const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
      assert.strictEqual(row.status, 'ENTREGUE', 'status não deveria ter mudado');
    } finally {
      setUser(ADMIN_USER);
    }
  });

  await test('[encerrar] perfil GESTOR -> 200 (também tem aprovar_requisicao)', async () => {
    const matId = await criarMaterial('MATCICLO-12');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'ENTREGUE', itens: [{ material_id: matId, quantidade: 2, quantidade_entregue: 2 }], solicitanteId: 42,
    });

    setUser({
      id: 89, nome: 'Gestor Teste', role: 'user', perfil_almoxarifado: 'GESTOR', email: 'gestor@test.com',
    });
    try {
      const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/encerrar`).send({});
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    } finally {
      setUser(ADMIN_USER);
    }
  });

  await test('[encerrar] transição inválida (PENDENTE) -> 400', async () => {
    const matId = await criarMaterial('MATCICLO-13');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 2 }], solicitanteId: 42,
    });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/encerrar`).send({});
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));

    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(row.status, 'PENDENTE', 'status não deveria ter mudado');
  });

  await test('[encerrar] requisição inexistente -> 404', async () => {
    const res = await request(app).put('/api/almoxarifado/requisicoes/999999/encerrar').send({});
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
  });

  // ════════════════════════════ /copiar ════════════════════════════

  await test('[copiar] gera novo RASCUNHO fiel (itens/tipo/vínculos), entregues zerados', async () => {
    const matId = await criarMaterial('MATCICLO-14');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'ENTREGUE',
      itens: [{
        material_id: matId, quantidade: 7, quantidade_separada: 7, quantidade_entregue: 7, observacoes: 'obs original',
      }],
      solicitanteId: 42,
      tipoRequisicao: 'ORDEM_PRODUCAO',
      centroCustoId: null,
      localEntrega: 'Galpão 2',
      osReferencia: 'OS-9001',
      // Nome de setor reconhecido pelo whitelist de materiais por setor
      // (sectorMaterialService.SETORES_MODULO_SEED) — createRequisicao (reaproveitado
      // pelo /copiar) valida o material contra este setor; um valor arbitrário como
      // 'PRODUCAO' não bateria com nenhum setor seedado e seria bloqueado com 400.
      setor: 'Produção',
    });

    setUser({ id: 77, nome: 'Outro Solicitante', role: 'user', email: 'copiador@test.com' });
    try {
      const res = await request(app).post(`/api/almoxarifado/requisicoes/${reqId}/copiar`).send({});
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      assert.strictEqual(res.body.status, 'RASCUNHO');
      assert.notStrictEqual(res.body.id, reqId);
      assert.ok(res.body.numero);

      const novaReq = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [res.body.id]);
      assert.strictEqual(novaReq.status, 'RASCUNHO');
      assert.strictEqual(novaReq.solicitante_id, 77);
      assert.strictEqual(novaReq.tipo_requisicao, 'ORDEM_PRODUCAO');
      assert.strictEqual(novaReq.local_entrega, 'Galpão 2');
      assert.strictEqual(novaReq.os_referencia, 'OS-9001');
      assert.strictEqual(novaReq.setor, 'Produção');

      const novosItens = await dbAll(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [res.body.id]);
      assert.strictEqual(novosItens.length, 1);
      assert.strictEqual(novosItens[0].material_id, matId);
      assert.strictEqual(novosItens[0].quantidade_solicitada, 7);
      assert.strictEqual(Number(novosItens[0].quantidade_entregue) || 0, 0);
      assert.strictEqual(Number(novosItens[0].quantidade_separada) || 0, 0);

      const log = await dbGet(db,
        `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao' AND entidade_id = ? AND acao = 'COPIA'`,
        [res.body.id]);
      assert.ok(log, 'deveria existir registro de auditoria para a cópia');
      assert.strictEqual(log.usuario_id, 77);
    } finally {
      setUser(ADMIN_USER);
    }
  });

  await test('[copiar] tipo EMERGENCIAL copia a justificativa', async () => {
    const matId = await criarMaterial('MATCICLO-15');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'APROVADO',
      itens: [{ material_id: matId, quantidade: 3 }],
      solicitanteId: 42,
      tipoRequisicao: 'EMERGENCIAL',
      justificativa: 'Parada de linha crítica',
    });

    const res = await request(app).post(`/api/almoxarifado/requisicoes/${reqId}/copiar`).send({});
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const novaReq = await dbGet(db, 'SELECT tipo_requisicao, justificativa FROM requisicoes_almoxarifado WHERE id = ?', [res.body.id]);
    assert.strictEqual(novaReq.tipo_requisicao, 'EMERGENCIAL');
    assert.strictEqual(novaReq.justificativa, 'Parada de linha crítica');
  });

  await test('[copiar] requisição inexistente -> 404', async () => {
    const res = await request(app).post('/api/almoxarifado/requisicoes/999999/copiar').send({});
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
  });

  await test('[copiar] requisição de origem sem itens -> 400 (guarda defensiva, evita SQL "IN ()")', async () => {
    const { id: reqId } = await criarRequisicao(db, { status: 'CANCELADO', itens: [], solicitanteId: 42 });

    const res = await request(app).post(`/api/almoxarifado/requisicoes/${reqId}/copiar`).send({});
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
