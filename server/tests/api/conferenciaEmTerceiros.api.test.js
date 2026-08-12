/**
 * Etapa 8b, Task 2 — a contagem de inventario nao cobra o que esta no terceiro.
 *
 * A conferencia monta `quantidade_sistema` a partir de m.quantidade_atual, POR MATERIAL (nao por
 * localizacao). Com a coluna nova, material no galvanizador continua somando em quantidade_atual —
 * correto, e nosso — mas NAO esta na prateleira para ser contado. Sem este desconto, toda contagem
 * acusa uma diferenca fantasma e o operador "corrige" o saldo para menos.
 *
 * O par de testes aqui e o CONTROLE POSITIVO BILATERAL exigido pelo design: um teste so de
 * desconto seria aprovado por uma implementacao que descontasse as QUATRO retencoes — e as outras
 * tres estao na prateleira e TEM de ser contadas. "Bloqueado" e um estado administrativo, nao uma
 * ausencia fisica.
 *
 * Executar: cd server && node tests/api/conferenciaEmTerceiros.api.test.js
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

let seq = 0;
/** Material com 100 no fisico e as retencoes pedidas. */
async function novoMaterial(db, { emTerceiros = 0, bloqueada = 0, emInspecao = 0, reservada = 0 } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_em_terceiros, quantidade_bloqueada,
       quantidade_em_inspecao, quantidade_reservada, ativo)
     VALUES (?,?,'UN',100,?,?,?,?,1)`,
    [`CONF-${seq}`, `Material conferencia ${seq}`, emTerceiros, bloqueada, emInspecao, reservada]);
  return r.lastID;
}

/** Abre uma conferencia e devolve o `quantidade_sistema` (o esperado) daquele material. */
async function esperadoNaConferencia(app, db, materialId) {
  const res = await request(app).post('/api/almoxarifado/conferencias').send({});
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  const item = await dbGet(db,
    'SELECT quantidade_sistema FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND material_id = ?',
    [res.body.id, materialId]);
  assert.ok(item, 'o material nao entrou na conferencia');
  return item.quantidade_sistema;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('conferencia desconta o que esta em terceiros do esperado', async () => {
    const id = await novoMaterial(db, { emTerceiros: 30 });
    assert.strictEqual(await esperadoNaConferencia(app, db, id), 70,
      'a contagem cobra do almoxarife 100 unidades quando 30 estao a 40 km');
  });

  await test('[CONTROLE POSITIVO] conferencia continua cobrando material bloqueado e em quarentena', async () => {
    // A metade que falta: descontar as QUATRO retencoes passaria no teste acima e estaria ERRADO.
    // Bloqueado e em quarentena ESTAO na prateleira — sao estados administrativos, nao ausencia
    // fisica —, e nao contar o que esta na prateleira e como esconder material do inventario.
    const id = await novoMaterial(db, { bloqueada: 40, emInspecao: 25, reservada: 15 });
    assert.strictEqual(await esperadoNaConferencia(app, db, id), 100,
      'a contagem deixou de cobrar material bloqueado/em quarentena/reservado, que esta na prateleira');
  });

  await test('[CONTROLE POSITIVO] as duas coisas juntas descontam SO o terceiro', async () => {
    const id = await novoMaterial(db, { emTerceiros: 30, bloqueada: 40, emInspecao: 25, reservada: 15 });
    assert.strictEqual(await esperadoNaConferencia(app, db, id), 70,
      'com as quatro retencoes preenchidas o esperado tem de descontar apenas em_terceiros');
  });

  await test('material sem nada retido continua sendo cobrado pelo total', async () => {
    const id = await novoMaterial(db, {});
    assert.strictEqual(await esperadoNaConferencia(app, db, id), 100);
  });

  await test('material legado com em_terceiros NULL continua sendo cobrado pelo total', async () => {
    // A coluna nasceu com DEFAULT 0, mas NULL continua sendo um valor possivel na linha. Sem
    // COALESCE a subtracao devolve NULL e o esperado da conferencia vira "sem valor": toda
    // divergencia daquele material passaria a ser NaN, silenciosamente.
    const id = await novoMaterial(db, { emTerceiros: 0 });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_terceiros = NULL WHERE id = ?', [id]);
    assert.strictEqual(await esperadoNaConferencia(app, db, id), 100,
      'em_terceiros NULL apagou o esperado da conferencia — falta COALESCE');
  });

  await test('a divergencia da contagem e medida contra o esperado JA descontado', async () => {
    // Consequencia pratica: quem conta 70 na prateleira de um material com 30 no terceiro tem de
    // ver divergencia ZERO. Se o esperado nao descontasse, ele veria -30 e "corrigiria" o saldo.
    const id = await novoMaterial(db, { emTerceiros: 30 });
    const conf = await request(app).post('/api/almoxarifado/conferencias').send({});
    const item = await dbGet(db,
      'SELECT id FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND material_id = ?',
      [conf.body.id, id]);
    const res = await request(app)
      .put(`/api/almoxarifado/conferencias/${conf.body.id}/item/${item.id}`)
      .send({ quantidade_contada: 70 });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.divergencia, 0,
      'contar exatamente o que esta na prateleira acusou divergencia');
  });

  await test('[CONTROLE POSITIVO] contar o total fisico de material no terceiro ACUSA divergencia', async () => {
    // O par do teste acima: se a divergencia zerasse para qualquer contagem, o teste anterior
    // passaria com o esperado quebrado. Contar 100 (o patrimonio, nao a prateleira) tem de dar +30.
    const id = await novoMaterial(db, { emTerceiros: 30 });
    const conf = await request(app).post('/api/almoxarifado/conferencias').send({});
    const item = await dbGet(db,
      'SELECT id FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND material_id = ?',
      [conf.body.id, id]);
    const res = await request(app)
      .put(`/api/almoxarifado/conferencias/${conf.body.id}/item/${item.id}`)
      .send({ quantidade_contada: 100 });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.divergencia, 30,
      'contar 100 num material com 30 no terceiro tinha de acusar sobra de 30');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
