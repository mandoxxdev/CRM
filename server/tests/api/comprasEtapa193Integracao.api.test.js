/**
 * Etapa 193 (Compras), I1 — integracao que cruza K1 (cadastro so no Compras) e O1 (OS por item), pelas rotas:
 *   1. o administrador do Compras cadastra o material pela porta do Compras (201);
 *   2. o almoxarife NAO edita esse material pelo Almoxarifado (403 literal) e nada muda no banco;
 *   3. o almoxarife continua lendo o material (a tela de consulta usa o GET do almoxarifado);
 *   4. o pedido de compra leva esse material em dois itens com OS diferentes (justificativa por item);
 *   5. o documento do pedido mostra as duas OS; nada fica reservado por OS.
 * Plano: docs/superpowers/plans/2026-10-30-compras-etapa193-cadastro-so-no-compras-e-os-por-item.md
 *
 * Executar: cd server && node tests/api/comprasEtapa193Integracao.api.test.js
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

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ADMIN_COMPRAS = { id: 3, nome: 'Chefe de Compras', role: 'usuario', admin_modulos: ['compras'], email: 'chefe@test.com' };
const ALMOXARIFE = { id: 4, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };
const MSG_SO_NO_COMPRAS = 'O cadastro de material é feito em Compras → Materiais.';
const textoDoHtml = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });
  const FAM = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('VLV','Valvulas',1)")).lastID;
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('FORNECEDOR E193','19319319000193','ativo')")).lastID;

  console.log('\n═══ Etapa 193 — integracao: cadastro so no Compras + OS por item ═══\n');

  let materialId; let pedidoId;

  await test('1. admin do Compras cadastra o material pela porta do Compras (201)', async () => {
    setUser(ADMIN_COMPRAS);
    const r = await request(app).post('/api/compras/materiais/cadastro').send({
      codigo: 'VLV-E193', nome: 'Valvula esfera 2pol E193', unidade: 'PC', categoria: 'OUTROS', familia_id: FAM, ncm: '8481.80.95',
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    materialId = r.body.id;
    assert.ok(materialId);
  });

  await test('2. almoxarife NAO edita pelo Almoxarifado: 403 literal, nome nao muda', async () => {
    setUser(ALMOXARIFE);
    const r = await request(app).put(`/api/almoxarifado/materiais/${materialId}`).send({ nome: 'Renomeado pelo almox' });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, MSG_SO_NO_COMPRAS);
    const m = await dbGet(db, 'SELECT nome FROM materiais_almoxarifado WHERE id = ?', [materialId]);
    assert.strictEqual(m.nome, 'Valvula esfera 2pol E193');
  });

  await test('3. almoxarife continua LENDO o material (consulta)', async () => {
    setUser(ALMOXARIFE);
    const r = await request(app).get(`/api/almoxarifado/materiais/${materialId}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.codigo, 'VLV-E193');
  });

  await test('4. pedido com o material em dois itens, OS diferentes por item (201)', async () => {
    setUser(ADMIN);
    const r = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: forn,
      itens: [
        { material_id: materialId, quantidade: 2, valor_unitario: 100, os_texto: 'OS 5101' },
        { material_id: materialId, quantidade: 1, valor_unitario: 100, os_texto: 'OS 5102 obra norte' },
      ],
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    pedidoId = r.body.id;
    const g = await request(app).get(`/api/compras/pedidos/${pedidoId}`);
    assert.deepStrictEqual(g.body.itens.map((i) => i.os_texto).sort(), ['OS 5101', 'OS 5102 obra norte']);
  });

  await test('5. documento mostra as duas OS por item; nenhuma reserva nasce', async () => {
    const r = await request(app).get(`/api/compras/pedidos/${pedidoId}/documento`);
    assert.strictEqual(r.status, 200, r.text.slice(0, 300));
    const t = textoDoHtml(r.text);
    assert.ok(t.includes('OS 5101'), 'documento sem a OS do item 1');
    assert.ok(t.includes('OS 5102 obra norte'), 'documento sem a OS do item 2');
    const res = await dbGet(db, 'SELECT COUNT(*) AS n FROM reservas_material_almoxarifado');
    assert.strictEqual(res.n, 0);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
