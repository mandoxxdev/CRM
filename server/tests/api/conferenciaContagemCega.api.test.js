/**
 * Etapa 10, Task 2 — RN-01/RN-02: contagem cega (`modo_cego`).
 *
 * Com `modo_cego = true` e a conferencia `ABERTO`, quem NAO tem `ajustar_estoque` conta sem ver
 * quanto o sistema diz que tem — o esperado (`quantidade_sistema`) e a `divergencia` somem do
 * item. Quem homologa (`ajustar_estoque`) continua vendo tudo, porque precisa decidir. Concluida
 * ou cancelada, os dois campos voltam para todo mundo — e o registro historico.
 *
 * `recontagem_necessaria` e SEMPRE calculada no servidor e SEMPRE aparece no item, mesmo em modo
 * cego — quem so conta precisa saber que precisa recontar, mesmo sem ver o numero.
 *
 * Executar: cd server && node tests/api/conferenciaContagemCega.api.test.js
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

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const GESTOR = { id: 2, nome: 'Gestor', role: 'usuario', perfil_almoxarifado: 'GESTOR', email: 'gestor@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };

let seq = 0;
async function novoMaterial(db, { qtd = 100 } = {}) {
  seq += 1;
  const codigo = `CEGA-${seq}`;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
     VALUES (?,?,'UN',?,1)`, [codigo, `Material Cega ${seq}`, qtd]);
  return { id: r.lastID, codigo };
}

async function abrirConferencia(app, body = {}) {
  const res = await request(app).post('/api/almoxarifado/conferencias').send(body);
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

async function itemDoMaterial(db, confId, materialId) {
  const item = await dbGet(db,
    `SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND material_id = ?`,
    [confId, materialId]);
  assert.ok(item, 'item nao encontrado na conferencia');
  return item;
}

async function getConferencia(app, confId) {
  const res = await request(app).get(`/api/almoxarifado/conferencias/${confId}`);
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  await test('RN-02: modo_cego omite quantidade_sistema para quem nao tem ajustar_estoque, mostra para quem tem', async () => {
    setUser(ALMOXARIFE);
    const mat = await novoMaterial(db, { qtd: 100 });
    const conf = await abrirConferencia(app, { modo_cego: true, tolerancia_percentual: 50 });
    assert.strictEqual(conf.modo_cego, 1, JSON.stringify(conf));
    const itemRow = await itemDoMaterial(db, conf.id, mat.id);
    await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${itemRow.id}`)
      .send({ quantidade_contada: 90 });

    const comoAlmoxarife = await getConferencia(app, conf.id);
    const itemAlmox = comoAlmoxarife.itens.find((i) => i.material_id === mat.id);
    assert.ok(itemAlmox, 'item nao encontrado na resposta');
    assert.ok(!('quantidade_sistema' in itemAlmox), 'ALMOXARIFE sem ajustar_estoque nao deveria ver quantidade_sistema');
    assert.ok(!('divergencia' in itemAlmox), 'ALMOXARIFE sem ajustar_estoque nao deveria ver divergencia');
    assert.strictEqual(typeof itemAlmox.recontagem_necessaria, 'boolean', 'recontagem_necessaria tem de aparecer mesmo em modo cego');

    setUser(GESTOR);
    const comoGestor = await getConferencia(app, conf.id);
    const itemGestor = comoGestor.itens.find((i) => i.material_id === mat.id);
    assert.strictEqual(itemGestor.quantidade_sistema, 100, JSON.stringify(itemGestor));
    assert.strictEqual(Number(itemGestor.divergencia), -10, JSON.stringify(itemGestor));
    assert.strictEqual(typeof itemGestor.recontagem_necessaria, 'boolean');
  });

  await test('modo_cego=false (default): comportamento identico ao de hoje para todo mundo', async () => {
    setUser(ALMOXARIFE);
    const mat = await novoMaterial(db, { qtd: 100 });
    const conf = await abrirConferencia(app, { tolerancia_percentual: 50 });
    assert.strictEqual(conf.modo_cego, 0, JSON.stringify(conf));

    const comoAlmoxarife = await getConferencia(app, conf.id);
    const itemAlmox = comoAlmoxarife.itens.find((i) => i.material_id === mat.id);
    assert.ok('quantidade_sistema' in itemAlmox, 'sem modo_cego o esperado deveria continuar visivel');
    assert.ok('divergencia' in itemAlmox);
  });

  await test('conferencia CONCLUIDA sempre mostra quantidade_sistema, mesmo modo_cego (e o registro historico)', async () => {
    setUser(ALMOXARIFE);
    const mat = await novoMaterial(db, { qtd: 100 });
    const conf = await abrirConferencia(app, { modo_cego: true, tolerancia_percentual: 50 });

    const resConcluir = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/concluir`).send({});
    assert.strictEqual(resConcluir.status, 200, JSON.stringify(resConcluir.body));

    const depois = await getConferencia(app, conf.id);
    const item = depois.itens.find((i) => i.material_id === mat.id);
    assert.ok('quantidade_sistema' in item, 'conferencia concluida e o registro historico — sempre mostra o esperado');
  });

  await test('POST /conferencias ecoa modo_cego e tolerancia_percentual na resposta 201', async () => {
    setUser(ALMOXARIFE);
    const comValores = await abrirConferencia(app, { modo_cego: true, tolerancia_percentual: 7.5 });
    assert.strictEqual(comValores.modo_cego, 1, JSON.stringify(comValores));
    assert.strictEqual(comValores.tolerancia_percentual, 7.5, JSON.stringify(comValores));

    const semValores = await abrirConferencia(app, {});
    assert.strictEqual(semValores.modo_cego, 0, JSON.stringify(semValores));
    assert.strictEqual(semValores.tolerancia_percentual, 2, 'sem config nem body, o default declarado e 2');
  });

  await test('achado da revisao final: categoria sem material ativo devolve totalItens:0 (nao undefined)', async () => {
    setUser(ALMOXARIFE);
    const vazia = await abrirConferencia(app, { categoria: 'CATEGORIA-QUE-NAO-EXISTE-NUNCA' });
    assert.strictEqual(vazia.itens.length, 0);
    assert.strictEqual(vazia.totalItens, 0, JSON.stringify(vazia));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
