/**
 * Etapa 216 (RN-216.03) — a restricao de endereco reconhece o tipo do material escolhido do cadastro de tipos (nome com acento e
 * maiusculo) contra a chave gravada na localizacao (`consumivel`, `componente_pneumatico`): comparacao normalizada dos dois lados.
 * Pela funcao do motor e por uma ENTRADA real pela rota.
 *
 * Executar: cd server && node tests/api/tipoMaterialNormalizado.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');
const { motivoRecusaEndereco, normalizarTipoMaterial } = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, perfil_almoxarifado: 'ADMINISTRADOR', email: 'a@test.com' };

(async () => {
  await test('[RN-216.03] a normalizacao: sem acento, sem caixa, espacos e hifens viram _', async () => {
    assert.deepStrictEqual(['Consumível', 'CONSUMÍVEL', '  Componente pneumático ', 'item-montagem', 'consumivel', null].map(normalizarTipoMaterial),
      ['consumivel', 'consumivel', 'componente_pneumatico', 'item_montagem', 'consumivel', '']);
  });

  await test('[RN-216.03] a funcao do motor: nome do cadastro casa com a chave; tipo diferente continua recusado (com o tipo na frase)', async () => {
    const loc = { codigo: 'L-1', bloqueada: 0, tipos_material_permitidos: JSON.stringify(['consumivel', 'componente_pneumatico']) };
    assert.strictEqual(motivoRecusaEndereco(loc, { tipo_material: 'CONSUMÍVEL' }, 'destino'), null);
    assert.strictEqual(motivoRecusaEndereco(loc, { tipo_material: 'Componente Pneumático' }, 'destino'), null);
    assert.strictEqual(motivoRecusaEndereco(loc, { tipo_material: 'CHAPA' }, 'destino'), "Localização L-1 não aceita o tipo de material 'CHAPA'");
    assert.strictEqual(motivoRecusaEndereco(loc, { tipo_material: '' }, 'destino'), "Localização L-1 não aceita o tipo de material ''");
    assert.strictEqual(motivoRecusaEndereco(loc, { tipo_material: 'CHAPA' }, 'origem'), null, 'a restricao e so de destino');
  });

  const { app, db, close } = await createTestApp({ user: ADMIN });
  const loc = async (codigo, tipos) => (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo, bloqueada, tipos_material_permitidos, tipo)
    VALUES (?, ?, 1, 0, ?, 'Almoxarifado')`, [codigo, codigo, JSON.stringify(tipos)])).lastID;
  const material = async (codigo, tipo) => (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, tipo_material)
    VALUES (?, 'Mat E216', 'UN', 0, 1, ?)`, [codigo, tipo])).lastID;
  const entrada = (m, destino) => request(app).post('/api/almoxarifado/movimentacoes/v2').send({
    material_id: m, tipo: 'ENTRADA', quantidade: 2, motivo: 'e216', localizacao_destino_id: destino,
  });

  await test('[RN-216.03 integracao] entrada pela rota: CONSUMÍVEL entra na posicao que so aceita consumivel; CHAPA e recusada', async () => {
    const L = await loc('E216-CONS', ['consumivel']);
    const ok = await entrada(await material('E216-1', 'CONSUMÍVEL'), L);
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    const nao = await entrada(await material('E216-2', 'CHAPA'), L);
    assert.deepStrictEqual([nao.status, nao.body.error], [400, "Localização E216-CONS não aceita o tipo de material 'CHAPA'"]);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
