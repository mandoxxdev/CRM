/**
 * Etapa 10b, Task 2 — RN-03/RN-04: dupla contagem por duas pessoas + autoria.
 *
 * RN-04: autoria e sempre gravada no PUT /item, com ou sem a flag `dupla_contagem` da
 * conferencia — a primeira contagem preenche `contado_por_*`, cada contagem seguinte
 * sobrescreve `recontado_por_*` (fica o ultimo recontador). `GET /conferencias/:id` ecoa os
 * quatro campos por item (SELECT ic.* ja carrega por arrastao, sem mudanca no GET).
 *
 * RN-03: com `dupla_contagem: true` na conferencia, o autor da PRIMEIRA contagem nunca pode
 * recontar o mesmo item — 400 literal. A comparacao e sempre contra `contado_por_id` (o
 * PRIMEIRO contador), nunca contra o contador anterior: senao o primeiro contador poderia
 * sobrescrever a recontagem do colega e anular os quatro olhos (testado explicitamente na
 * terceira contagem). Sem a flag, o comportamento da Etapa 10 fica intacto (mesma pessoa pode
 * recontar).
 *
 * Executar: cd server && node tests/api/conferenciaDuplaContagem.api.test.js
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
  const codigo = `DUPLA-${seq}`;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
     VALUES (?,?,'UN',?,1)`, [codigo, `Material Dupla ${seq}`, qtd]);
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

async function contarItem(app, confId, itemId, quantidade) {
  return request(app).put(`/api/almoxarifado/conferencias/${confId}/item/${itemId}`)
    .send({ quantidade_contada: quantidade });
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  await test('RN-04: primeira contagem grava contado_por e o GET ecoa', async () => {
    setUser(ALMOXARIFE);
    const mat = await novoMaterial(db);
    const conf = await abrirConferencia(app, {});
    const itemRow = await itemDoMaterial(db, conf.id, mat.id);

    const res = await contarItem(app, conf.id, itemRow.id, 90);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const itemBanco = await itemDoMaterial(db, conf.id, mat.id);
    assert.strictEqual(itemBanco.contado_por_id, 3, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.contado_por_nome, 'Almoxarife', JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_id, null, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_nome, null, JSON.stringify(itemBanco));

    const detalhe = await getConferencia(app, conf.id);
    const itemGet = detalhe.itens.find((i) => i.material_id === mat.id);
    assert.strictEqual(itemGet.contado_por_id, 3, JSON.stringify(itemGet));
    assert.strictEqual(itemGet.contado_por_nome, 'Almoxarife', JSON.stringify(itemGet));
    assert.strictEqual(itemGet.recontado_por_id, null, JSON.stringify(itemGet));
    assert.strictEqual(itemGet.recontado_por_nome, null, JSON.stringify(itemGet));
  });

  await test('RN-04: recontagem grava recontado_por sem tocar contado_por', async () => {
    setUser(ALMOXARIFE);
    const mat = await novoMaterial(db);
    const conf = await abrirConferencia(app, {});
    const itemRow = await itemDoMaterial(db, conf.id, mat.id);
    await contarItem(app, conf.id, itemRow.id, 90);

    setUser(GESTOR);
    const res = await contarItem(app, conf.id, itemRow.id, 88);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.recontagem, true, JSON.stringify(res.body));

    const itemBanco = await itemDoMaterial(db, conf.id, mat.id);
    assert.strictEqual(itemBanco.contado_por_id, 3, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.contado_por_nome, 'Almoxarife', JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_id, 2, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_nome, 'Gestor', JSON.stringify(itemBanco));
  });

  await test('RN-03: com dupla_contagem o primeiro contador nao reconta — 400 literal', async () => {
    setUser(ALMOXARIFE);
    const mat = await novoMaterial(db);
    const conf = await abrirConferencia(app, { dupla_contagem: true });
    assert.strictEqual(conf.dupla_contagem, 1, JSON.stringify(conf));
    const itemRow = await itemDoMaterial(db, conf.id, mat.id);
    await contarItem(app, conf.id, itemRow.id, 90);

    const res = await contarItem(app, conf.id, itemRow.id, 91);
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error,
      'Dupla contagem: a recontagem deve ser feita por outra pessoa (primeira contagem: Almoxarife)',
      JSON.stringify(res.body));

    // Nao pode ter mexido no banco: continua so com a primeira contagem.
    const itemBanco = await itemDoMaterial(db, conf.id, mat.id);
    assert.strictEqual(Number(itemBanco.quantidade_contada), 90, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_id, null, JSON.stringify(itemBanco));
  });

  await test('RN-03: outra pessoa reconta normalmente', async () => {
    setUser(ALMOXARIFE);
    const mat = await novoMaterial(db);
    const conf = await abrirConferencia(app, { dupla_contagem: true });
    const itemRow = await itemDoMaterial(db, conf.id, mat.id);
    await contarItem(app, conf.id, itemRow.id, 90);

    setUser(GESTOR);
    const res = await contarItem(app, conf.id, itemRow.id, 88);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.recontagem, true, JSON.stringify(res.body));

    const itemBanco = await itemDoMaterial(db, conf.id, mat.id);
    assert.strictEqual(itemBanco.recontado, 1, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_id, 2, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_nome, 'Gestor', JSON.stringify(itemBanco));
  });

  await test('RN-03: o primeiro contador segue barrado na terceira contagem', async () => {
    setUser(ALMOXARIFE);
    const mat = await novoMaterial(db);
    const conf = await abrirConferencia(app, { dupla_contagem: true });
    const itemRow = await itemDoMaterial(db, conf.id, mat.id);
    await contarItem(app, conf.id, itemRow.id, 90);

    setUser(GESTOR);
    const resGestor = await contarItem(app, conf.id, itemRow.id, 88);
    assert.strictEqual(resGestor.status, 200, JSON.stringify(resGestor.body));

    // A comparacao e contra o PRIMEIRO contador, nao o anterior: se fosse contra o anterior
    // (Gestor), o Almoxarife poderia recontar agora e sobrescrever a contagem do colega.
    setUser(ALMOXARIFE);
    const resAlmox = await contarItem(app, conf.id, itemRow.id, 92);
    assert.strictEqual(resAlmox.status, 400, JSON.stringify(resAlmox.body));
    assert.strictEqual(resAlmox.body.error,
      'Dupla contagem: a recontagem deve ser feita por outra pessoa (primeira contagem: Almoxarife)',
      JSON.stringify(resAlmox.body));

    // A recontagem do Gestor continua intacta no banco.
    const itemBanco = await itemDoMaterial(db, conf.id, mat.id);
    assert.strictEqual(Number(itemBanco.quantidade_contada), 88, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_id, 2, JSON.stringify(itemBanco));
  });

  await test('[CONTROLE] sem a flag, a mesma pessoa reconta como na Etapa 10', async () => {
    setUser(ALMOXARIFE);
    const mat = await novoMaterial(db);
    const conf = await abrirConferencia(app, {});
    assert.strictEqual(conf.dupla_contagem, 0, JSON.stringify(conf));
    const itemRow = await itemDoMaterial(db, conf.id, mat.id);

    const res1 = await contarItem(app, conf.id, itemRow.id, 90);
    assert.strictEqual(res1.status, 200, JSON.stringify(res1.body));

    const res2 = await contarItem(app, conf.id, itemRow.id, 89);
    assert.strictEqual(res2.status, 200, JSON.stringify(res2.body));
    assert.strictEqual(res2.body.recontagem, true, JSON.stringify(res2.body));

    const itemBanco = await itemDoMaterial(db, conf.id, mat.id);
    assert.strictEqual(itemBanco.contado_por_id, 3, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_id, 3, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_nome, 'Almoxarife', JSON.stringify(itemBanco));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
