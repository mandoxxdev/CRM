/**
 * Etapa 3, Task 4 — aprovações com regras fixas: segregação de funções, rejeição
 * justificada e decisões auditadas.
 *
 * Cenários (task-4-brief.md): solicitante não pode aprovar a própria requisição (2 lanes,
 * 403); rejeitar/rejeitar-valor NÃO tem segregação — reprovar a própria é desistência
 * legítima (design, "Decisões aprovadas" #1); rejeição sem motivo -> 400; decisões
 * (aprovar/rejeitar/aprovar-valor/rejeitar-valor) gravam auditoria_log_almoxarifado.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

let seq = 0;
function numero() {
  seq += 1;
  return `REQ-APROV-${seq}`;
}

async function criarRequisicao(db, { status, itens, solicitanteId = 1 }) {
  const reqRes = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
    (numero, solicitante_id, solicitante_nome, status) VALUES (?, ?, 'Solicitante Teste', ?)`,
    [numero(), solicitanteId, status]);
  const reqId = reqRes.lastID;
  const itemIds = [];
  for (const item of itens || []) {
    const r = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada) VALUES (?, ?, ?)`,
      [reqId, item.material_id, item.quantidade ?? 1]);
    itemIds.push(r.lastID);
  }
  return { id: reqId, itemIds };
}

async function setupLiberacaoValor(db, { limite = 100, aprovadorIds = [] } = {}) {
  await dbRun(db, `INSERT OR REPLACE INTO configuracoes_almoxarifado (chave, valor) VALUES ('liberacao_valor_ativo', '1')`);
  await dbRun(db, `INSERT OR REPLACE INTO configuracoes_almoxarifado (chave, valor) VALUES ('liberacao_valor_limite', ?)`, [String(limite)]);
  await dbRun(db, `INSERT OR REPLACE INTO configuracoes_almoxarifado (chave, valor) VALUES ('liberacao_valor_aprovadores', ?)`, [JSON.stringify(aprovadorIds)]);
}

(async () => {
  const ADMIN_USER = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN_USER });

  const fam = await request(app).post('/api/almoxarifado/familias')
    .send({ codigo: 'FAMAPROV', nome: 'Família Aprovação Teste' });
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

  // ════════════════════════════ /aprovar — segregação ════════════════════════════

  await test('[aprovar] solicitante tenta aprovar a própria -> 403, status inalterado', async () => {
    const matId = await criarMaterial('MATAPR-01');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 42,
    });

    setUser({ id: 42, nome: 'Solicitante Dono', role: 'user', email: 'dono@test.com' });
    try {
      const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
      assert.strictEqual(res.status, 403, JSON.stringify(res.body));
      assert.strictEqual(res.body.error, 'Solicitante não pode aprovar a própria requisição');

      const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
      assert.strictEqual(row.status, 'PENDENTE', 'status não deveria ter mudado');
    } finally {
      setUser(ADMIN_USER);
    }
  });

  await test('[aprovar] usuário diferente do solicitante -> 200 APROVADO', async () => {
    const matId = await criarMaterial('MATAPR-02');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 42,
    });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'APROVADO');
  });

  await test('[aprovar] decisão auditada (acao APROVACAO)', async () => {
    const matId = await criarMaterial('MATAPR-03');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 42,
    });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const log = await dbGet(db,
      `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao' AND entidade_id = ? AND acao = 'APROVACAO'`,
      [reqId]);
    assert.ok(log, 'deveria existir registro de auditoria para a aprovação');
    assert.strictEqual(log.usuario_id, ADMIN_USER.id);
  });

  // ════════════════════════════ /rejeitar — motivo obrigatório, sem segregação ════════════════════════════

  await test('[rejeitar] sem motivo -> 400', async () => {
    const matId = await criarMaterial('MATAPR-04');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 42,
    });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/rejeitar`).send({});
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));

    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(row.status, 'PENDENTE', 'status não deveria ter mudado');
  });

  await test('[rejeitar] motivo vazio -> 400', async () => {
    const matId = await criarMaterial('MATAPR-05');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 42,
    });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/rejeitar`).send({ motivo: '' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('[rejeitar] motivo só espaços -> 400 (RejeicaoSchema faz trim antes do min)', async () => {
    const matId = await criarMaterial('MATAPR-17');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 42,
    });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/rejeitar`).send({ motivo: '   ' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));

    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(row.status, 'PENDENTE', 'status não deveria ter mudado');
  });

  await test('[rejeitar] com motivo -> 200, motivo gravado em rejeicao_motivo', async () => {
    const matId = await criarMaterial('MATAPR-06');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 42,
    });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/rejeitar`).send({ motivo: 'Sem verba no centro de custo' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const row = await dbGet(db, 'SELECT status, rejeicao_motivo FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(row.status, 'REJEITADO');
    assert.strictEqual(row.rejeicao_motivo, 'Sem verba no centro de custo');
  });

  await test('[rejeitar] pelo próprio solicitante -> 200 (sem segregação — desistência legítima)', async () => {
    const matId = await criarMaterial('MATAPR-07');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 42,
    });

    setUser({ id: 42, nome: 'Solicitante Dono', role: 'user', email: 'dono@test.com' });
    try {
      const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/rejeitar`).send({ motivo: 'Não preciso mais' });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
      assert.strictEqual(row.status, 'REJEITADO');
    } finally {
      setUser(ADMIN_USER);
    }
  });

  await test('[rejeitar] decisão auditada (acao REJEICAO, justificativa=motivo)', async () => {
    const matId = await criarMaterial('MATAPR-08');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 42,
    });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/rejeitar`).send({ motivo: 'Duplicada' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const log = await dbGet(db,
      `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao' AND entidade_id = ? AND acao = 'REJEICAO'`,
      [reqId]);
    assert.ok(log, 'deveria existir registro de auditoria para a rejeição');
    assert.strictEqual(log.justificativa, 'Duplicada');
  });

  // ════════════════════════════ /aprovar-valor — segregação ════════════════════════════

  await test('[aprovar-valor] solicitante (também aprovador de valor) tenta aprovar a própria -> 403', async () => {
    await setupLiberacaoValor(db, { limite: 100, aprovadorIds: [55] });
    const matId = await criarMaterial('MATAPR-09');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'AGUARDANDO_APROVACAO_VALOR', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 55,
    });
    await dbRun(db, `UPDATE requisicoes_almoxarifado SET valor_total=500, requer_aprovacao_valor=1 WHERE id=?`, [reqId]);

    setUser({ id: 55, nome: 'Solicitante Aprovador', role: 'user', email: 'sol-aprov@test.com' });
    try {
      const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar-valor`).send({});
      assert.strictEqual(res.status, 403, JSON.stringify(res.body));
      assert.strictEqual(res.body.error, 'Solicitante não pode aprovar a própria requisição');

      const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
      assert.strictEqual(row.status, 'AGUARDANDO_APROVACAO_VALOR', 'status não deveria ter mudado');
    } finally {
      setUser(ADMIN_USER);
    }
  });

  await test('[aprovar-valor] aprovador diferente do solicitante -> 200 APROVADO, auditado', async () => {
    await setupLiberacaoValor(db, { limite: 100, aprovadorIds: [66] });
    const matId = await criarMaterial('MATAPR-10');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'AGUARDANDO_APROVACAO_VALOR', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 42,
    });
    await dbRun(db, `UPDATE requisicoes_almoxarifado SET valor_total=500, requer_aprovacao_valor=1 WHERE id=?`, [reqId]);

    setUser({ id: 66, nome: 'Aprovador Valor', role: 'user', email: 'aprov@test.com' });
    try {
      const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar-valor`).send({});
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.status, 'APROVADO');

      const log = await dbGet(db,
        `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao' AND entidade_id = ? AND acao = 'APROVACAO_VALOR'`,
        [reqId]);
      assert.ok(log, 'deveria existir registro de auditoria para a aprovação de valor');
      assert.strictEqual(log.usuario_id, 66);
    } finally {
      setUser(ADMIN_USER);
    }
  });

  // ════════════════════════════ /rejeitar-valor — motivo obrigatório, sem segregação ════════════════════════════

  await test('[rejeitar-valor] sem motivo -> 400', async () => {
    await setupLiberacaoValor(db, { limite: 100, aprovadorIds: [66] });
    const matId = await criarMaterial('MATAPR-11');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'AGUARDANDO_APROVACAO_VALOR', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 42,
    });
    await dbRun(db, `UPDATE requisicoes_almoxarifado SET valor_total=500, requer_aprovacao_valor=1 WHERE id=?`, [reqId]);

    setUser({ id: 66, nome: 'Aprovador Valor', role: 'user', email: 'aprov@test.com' });
    try {
      const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/rejeitar-valor`).send({});
      assert.strictEqual(res.status, 400, JSON.stringify(res.body));

      const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
      assert.strictEqual(row.status, 'AGUARDANDO_APROVACAO_VALOR', 'status não deveria ter mudado');
    } finally {
      setUser(ADMIN_USER);
    }
  });

  await test('[rejeitar-valor] com motivo -> 200 REJEITADO, motivo gravado, auditado', async () => {
    await setupLiberacaoValor(db, { limite: 100, aprovadorIds: [66] });
    const matId = await criarMaterial('MATAPR-12');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'AGUARDANDO_APROVACAO_VALOR', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 42,
    });
    await dbRun(db, `UPDATE requisicoes_almoxarifado SET valor_total=500, requer_aprovacao_valor=1 WHERE id=?`, [reqId]);

    setUser({ id: 66, nome: 'Aprovador Valor', role: 'user', email: 'aprov@test.com' });
    try {
      const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/rejeitar-valor`).send({ motivo: 'Valor incompatível com o orçamento' });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.status, 'REJEITADO');

      const row = await dbGet(db, 'SELECT status, rejeicao_motivo, rejeicao_valor_motivo FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
      assert.strictEqual(row.status, 'REJEITADO');
      assert.strictEqual(row.rejeicao_motivo, 'Valor incompatível com o orçamento');
      assert.strictEqual(row.rejeicao_valor_motivo, 'Valor incompatível com o orçamento');

      const log = await dbGet(db,
        `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao' AND entidade_id = ? AND acao = 'REJEICAO_VALOR'`,
        [reqId]);
      assert.ok(log, 'deveria existir registro de auditoria para a rejeição de valor');
      assert.strictEqual(log.justificativa, 'Valor incompatível com o orçamento');
    } finally {
      setUser(ADMIN_USER);
    }
  });

  await test('[rejeitar-valor] pelo próprio solicitante (também aprovador) -> 200 (sem segregação)', async () => {
    await setupLiberacaoValor(db, { limite: 100, aprovadorIds: [55] });
    const matId = await criarMaterial('MATAPR-13');
    const { id: reqId } = await criarRequisicao(db, {
      status: 'AGUARDANDO_APROVACAO_VALOR', itens: [{ material_id: matId, quantidade: 1 }], solicitanteId: 55,
    });
    await dbRun(db, `UPDATE requisicoes_almoxarifado SET valor_total=500, requer_aprovacao_valor=1 WHERE id=?`, [reqId]);

    setUser({ id: 55, nome: 'Solicitante Aprovador', role: 'user', email: 'sol-aprov@test.com' });
    try {
      const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/rejeitar-valor`).send({ motivo: 'Desisti da compra' });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
      assert.strictEqual(row.status, 'REJEITADO');
    } finally {
      setUser(ADMIN_USER);
    }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
