/**
 * POST /api/almoxarifado/movimentacoes (rota v1 de compatibilidade) exige o mesmo
 * perfil da v2.
 *
 * Bug coberto: a v1 nasceu em 2026-06-22 (719e80e) sem checagem de perfil e nunca
 * ganhou uma. O gate global do módulo (checkModulePermission('almoxarifado')) só
 * verifica ACESSO ao módulo, não o perfil — então qualquer usuário do módulo
 * gravava estoque por essa rota, contornando movimentar: [ADMINISTRADOR, ALMOXARIFE].
 *
 * A v1 continua viva: a entrada/saída rápida em MateriaisAlmoxarifado.js:104 usa ela.
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

// Perfis resolvidos por getPerfilFromUser (services/almoxarifado/permissions.js):
// sem is_superadmin, sem admin_modulos, role != 'admin' e sem perfil_almoxarifado
// => cai no fallback PRODUCAO, que NÃO está em `movimentar`.
const PRODUCAO = { id: 50, nome: 'Chão de Fábrica', role: 'usuario' };
const ALMOXARIFE = { id: 51, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE' };
const ADMIN = { id: 52, nome: 'Admin', role: 'admin' };
const CONSULTA = { id: 53, nome: 'Consulta', role: 'usuario', perfil_almoxarifado: 'CONSULTA' };

const saldo = (db, id) => dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id]);

(async () => {
  const { app, db, setUser, close } = await createTestApp();

  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, ativo) VALUES (?,?,?,1)`,
    ['V1-PERM-001', 'Material v1 permissão', 100]);
  const mat = r.lastID;

  await test('PRODUCAO (fallback) não movimenta pela v1 -> 403 e saldo intacto', async () => {
    setUser(PRODUCAO);
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10 });
    assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual((await saldo(db, mat)).quantidade_atual, 100, 'saldo mudou apesar do 403');
  });

  await test('CONSULTA não movimenta pela v1 -> 403', async () => {
    setUser(CONSULTA);
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10 });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.strictEqual((await saldo(db, mat)).quantidade_atual, 100);
  });

  await test('403 da v1 traz o mesmo contrato de erro da v2 (acao + perfil)', async () => {
    setUser(PRODUCAO);
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10 });
    assert.strictEqual(res.body.acao, 'movimentar', JSON.stringify(res.body));
    assert.strictEqual(res.body.perfil, 'PRODUCAO', JSON.stringify(res.body));
  });

  await test('ALMOXARIFE continua movimentando pela v1 (não quebrou a entrada rápida)', async () => {
    setUser(ALMOXARIFE);
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10 });
    assert.ok(res.status === 200 || res.status === 201, `esperava 2xx, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual((await saldo(db, mat)).quantidade_atual, 110);
  });

  await test('ADMINISTRADOR continua movimentando pela v1', async () => {
    setUser(ADMIN);
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 5, motivo: 'consumo teste' });
    assert.ok(res.status === 200 || res.status === 201, `esperava 2xx, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual((await saldo(db, mat)).quantidade_atual, 105);
  });

  await test('v1 e v2 recusam o mesmo perfil (paridade entre as duas rotas)', async () => {
    setUser(PRODUCAO);
    const v1 = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 1 });
    const v2 = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 1 });
    assert.strictEqual(v1.status, 403, 'v1 deveria recusar');
    assert.strictEqual(v2.status, 403, 'v2 deveria recusar');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
