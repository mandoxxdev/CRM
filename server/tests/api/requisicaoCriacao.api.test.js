/**
 * Etapa 3, Task 1 — criação unificada de requisições (requisitionCreateService).
 * Cobre as DUAS rotas de criação (`/api/almoxarifado/requisicoes` e
 * `/api/requisicoes-material`) que agora delegam ao mesmo serviço + RequisicaoSchema.
 * Fecha o bug conhecido: quantidade <= 0 não era validada em nenhuma das duas rotas.
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

(async () => {
  // is_superadmin: cria família/material via rotas que exigem canConfigureAlmox — ver
  // nota de implementação em schemaUnico.api.test.js (mesmo padrão).
  const { app, db, close } = await createTestApp({
    user: { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' },
  });

  // ── Setup: família com tipo_uso padrão ('ambos') passa na whitelist de QUALQUER setor ──
  const fam = await request(app).post('/api/almoxarifado/familias')
    .send({ codigo: 'FAMREQ', nome: 'Família Requisição Teste' });
  assert.strictEqual(fam.status, 201, JSON.stringify(fam.body));

  const materialRes = await request(app).post('/api/almoxarifado/materiais')
    .send({ codigo: 'MATREQ-1', nome: 'Material Requisição', familia_id: fam.body.id, unidade: 'UN' });
  assert.strictEqual(materialRes.status, 201, JSON.stringify(materialRes.body));
  const materialId = materialRes.body.id;

  const materialInativoRes = await request(app).post('/api/almoxarifado/materiais')
    .send({ codigo: 'MATREQ-INATIVO', nome: 'Material Inativo', familia_id: fam.body.id, unidade: 'UN' });
  assert.strictEqual(materialInativoRes.status, 201, JSON.stringify(materialInativoRes.body));
  const materialInativoId = materialInativoRes.body.id;
  await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [materialInativoId]);

  const ROTAS = [
    { nome: 'almoxarifado', url: '/api/almoxarifado/requisicoes', extra: {} },
    { nome: 'requisicoes-material', url: '/api/requisicoes-material', extra: { setor: 'Produção' } },
  ];

  for (const rota of ROTAS) {
    await test(`[${rota.nome}] quantidade 0 rejeitada — 400 (bug conhecido fechado)`, async () => {
      const res = await request(app).post(rota.url).send({
        ...rota.extra,
        itens: [{ material_id: materialId, quantidade: 0 }],
      });
      assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    });

    await test(`[${rota.nome}] quantidade negativa rejeitada — 400`, async () => {
      const res = await request(app).post(rota.url).send({
        ...rota.extra,
        itens: [{ material_id: materialId, quantidade: -5 }],
      });
      assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    });

    await test(`[${rota.nome}] sem itens — 400`, async () => {
      const res = await request(app).post(rota.url).send({ ...rota.extra, itens: [] });
      assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    });

    await test(`[${rota.nome}] material inexistente/inativo — 400`, async () => {
      const res = await request(app).post(rota.url).send({
        ...rota.extra,
        itens: [{ material_id: materialInativoId, quantidade: 1 }],
      });
      assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    });

    await test(`[${rota.nome}] EMERGENCIAL sem justificativa — 400`, async () => {
      const res = await request(app).post(rota.url).send({
        ...rota.extra,
        tipo_requisicao: 'EMERGENCIAL',
        itens: [{ material_id: materialId, quantidade: 1 }],
      });
      assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    });

    await test(`[${rota.nome}] EMERGENCIAL com justificativa — 201`, async () => {
      const res = await request(app).post(rota.url).send({
        ...rota.extra,
        tipo_requisicao: 'EMERGENCIAL',
        justificativa: 'Linha parada — falta crítica do material',
        itens: [{ material_id: materialId, quantidade: 1 }],
      });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      assert.strictEqual(res.body.status, 'PENDENTE');
    });

    await test(`[${rota.nome}] criação normal — 201 PENDENTE com numero REQ-`, async () => {
      const res = await request(app).post(rota.url).send({
        ...rota.extra,
        itens: [{ material_id: materialId, quantidade: 3 }],
      });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      assert.strictEqual(res.body.status, 'PENDENTE');
      assert.ok(String(res.body.numero).startsWith('REQ-'), `numero inesperado: ${res.body.numero}`);
    });

    await test(`[${rota.nome}] payload estilo form (strings) aceito — 201`, async () => {
      const res = await request(app).post(rota.url).send({
        ...rota.extra,
        itens: [{ material_id: String(materialId), quantidade: '2', observacoes: '' }],
      });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    });

    await test(`[${rota.nome}] salvar_rascunho:true — 201 RASCUNHO, sem avaliação de valor/side effects`, async () => {
      const antes = await dbGet(db, 'SELECT COUNT(*) as c FROM requisicao_lembretes_log');
      const res = await request(app).post(rota.url).send({
        ...rota.extra,
        salvar_rascunho: true,
        itens: [{ material_id: materialId, quantidade: 1 }],
      });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      assert.strictEqual(res.body.status, 'RASCUNHO');

      const row = await dbGet(db,
        'SELECT status, valor_total, requer_aprovacao_valor FROM requisicoes_almoxarifado WHERE id = ?',
        [res.body.id]);
      assert.strictEqual(row.status, 'RASCUNHO');
      assert.strictEqual(Number(row.valor_total), 0);
      assert.strictEqual(Number(row.requer_aprovacao_valor), 0);

      const depois = await dbGet(db, 'SELECT COUNT(*) as c FROM requisicao_lembretes_log');
      assert.strictEqual(depois.c, antes.c, 'rascunho não deve gerar linhas em requisicao_lembretes_log');
    });

    await test(`[${rota.nome}] campos novos persistidos (tipo_requisicao/centro_custo_id/local_entrega)`, async () => {
      const res = await request(app).post(rota.url).send({
        ...rota.extra,
        tipo_requisicao: 'ORDEM_PRODUCAO',
        centro_custo_id: 7,
        local_entrega: 'Bancada 3',
        itens: [{ material_id: materialId, quantidade: 1 }],
      });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));

      const row = await dbGet(db,
        'SELECT tipo_requisicao, centro_custo_id, local_entrega FROM requisicoes_almoxarifado WHERE id = ?',
        [res.body.id]);
      assert.strictEqual(row.tipo_requisicao, 'ORDEM_PRODUCAO');
      assert.strictEqual(row.centro_custo_id, 7);
      assert.strictEqual(row.local_entrega, 'Bancada 3');
    });

    await test(`[${rota.nome}] tipo_requisicao ausente persiste default CONSUMO`, async () => {
      const res = await request(app).post(rota.url).send({
        ...rota.extra,
        itens: [{ material_id: materialId, quantidade: 1 }],
      });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      const row = await dbGet(db, 'SELECT tipo_requisicao FROM requisicoes_almoxarifado WHERE id = ?', [res.body.id]);
      assert.strictEqual(row.tipo_requisicao, 'CONSUMO');
    });

    await test(`[${rota.nome}] tipo_requisicao inválido — 400`, async () => {
      const res = await request(app).post(rota.url).send({
        ...rota.extra,
        tipo_requisicao: 'NAO_EXISTE',
        itens: [{ material_id: materialId, quantidade: 1 }],
      });
      assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    });
  }

  await test('[requisicoes-material] sem setor — 400 Setor é obrigatório', async () => {
    const res = await request(app).post('/api/requisicoes-material').send({
      itens: [{ material_id: materialId, quantidade: 1 }],
    });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('[almoxarifado] itens inserido corretamente (SELECT confirma quantidade_solicitada)', async () => {
    const res = await request(app).post('/api/almoxarifado/requisicoes').send({
      itens: [{ material_id: materialId, quantidade: 5, observacoes: 'obs teste' }],
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const itens = await dbAll(db,
      'SELECT material_id, quantidade_solicitada, observacoes FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?',
      [res.body.id]);
    assert.strictEqual(itens.length, 1);
    assert.strictEqual(itens[0].material_id, materialId);
    assert.strictEqual(Number(itens[0].quantidade_solicitada), 5);
    assert.strictEqual(itens[0].observacoes, 'obs teste');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
