/**
 * Etapa 192 (RN-192.11) — "quem administra o Compras" cria e edita material, nao so o almoxarife.
 *
 * DECISAO (letra B): existe uma nocao REAL de administrador do modulo Compras — `admin_modulos` contem 'compras'
 * (`services/modulosSistema.js`, `aceitaAdminDeModulo: true`; o cadastro de usuario oferece o botao), lida por
 * `isModuleAdmin(user, 'compras')`. E ela que libera, e SO nas portas do Compras (`services/compras/cadastroDeMaterial.js`).
 * Descartado: pôr PERFIS.COMPRAS em `criar_material`/`editar_material` de ACAO_PERFIS — `editar_material` tambem guarda o
 * DELETE (inativar) e a foto de `routes/almoxarifado.js`, e o perfil COMPRAS (dado a todo comprador) passaria a excluir e
 * trocar foto dentro do Almoxarifado. Descartado tambem mapear o admin do Compras para um perfil do almoxarifado em
 * `getPerfilFromUser`: mudaria o perfil dele em TODO o modulo (receber material, alertas...).
 *
 * Consequencia declarada: o admin do Compras continua com o perfil de almoxarifado que tiver (sem perfil = PRODUCAO), entao
 * as guardas de estoque DENTRO do handler (saldo inicial exige `movimentar`; ligar controle com saldo sem identificar exige
 * `ajustar_estoque`; trocar dono com historico exige `ajustar_material_cliente`) continuam recusando para ele.
 *
 * O harness libera a camada 2 (modulo) — ver o cabecalho de `comprasCadastroMaterial.api.test.js`.
 *
 * Executar: cd server && node tests/api/comprasAdminCadastraMaterial.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { ACAO_PERFIS, PERFIS } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
// Administrador do modulo Compras, sem perfil de almoxarifado (fallback PRODUCAO).
const ADMIN_COMPRAS = { id: 2, nome: 'Chefe de Compras', role: 'usuario', admin_modulos: ['compras'], email: 'chefe@test.com' };
// O mesmo, como o banco guarda (texto JSON) — `enrichUserFromDb` ja converte, mas `isModuleAdmin` aceita os dois.
const ADMIN_COMPRAS_TEXTO = { ...ADMIN_COMPRAS, id: 3, admin_modulos: '["compras"]' };
const ADMIN_FROTA = { id: 4, nome: 'Chefe da Frota', role: 'usuario', admin_modulos: ['frota'], email: 'frota@test.com' };
const COMPRADOR_PERFIL_COMPRAS = { id: 5, nome: 'Comprador', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'c@test.com' };

const LITERAL_403 = 'Sem permissão para esta operação';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });
  const as = async (u, fn) => { setUser(u); return fn(); };

  const FAM = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('VLV','Valvulas',1)")).lastID;
  const corpo = (over = {}) => ({ nome: 'Valvula esfera', unidade: 'PC', categoria: 'OUTROS', familia_id: FAM, ncm: '8481.80.95', ...over });
  const MAT = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, categoria, familia_id, ativo)
    VALUES ('VLV-001','Valvula gaveta','PC','OUTROS',?, 1)`, [FAM])).lastID;

  await test('[admin do Compras] minhas-permissoes: cria e edita; o perfil do almoxarifado continua PRODUCAO', async () => {
    for (const u of [ADMIN_COMPRAS, ADMIN_COMPRAS_TEXTO]) {
      const r = await as(u, () => request(app).get('/api/compras/materiais/aux/minhas-permissoes'));
      assert.deepStrictEqual(r.body, { perfil: 'PRODUCAO', acoes: { criar_material: true, editar_material: true } });
    }
  });

  await test('[admin do Compras] le a lista, o detalhe e os auxiliares (200)', async () => {
    for (const url of ['/api/compras/materiais/cadastro', `/api/compras/materiais/cadastro/${MAT}`,
      '/api/compras/materiais/aux/familias', '/api/compras/materiais/aux/categorias', '/api/compras/materiais/aux/almoxarifados',
      '/api/compras/materiais/aux/localizacoes', '/api/compras/materiais/aux/proximo-codigo']) {
      const r = await as(ADMIN_COMPRAS, () => request(app).get(url));
      assert.strictEqual(r.status, 200, `${url}: ${r.status} ${JSON.stringify(r.body)}`);
    }
  });

  await test('[admin do Compras] cria (201) e edita (200) pelo Compras', async () => {
    const c = await as(ADMIN_COMPRAS, () => request(app).post('/api/compras/materiais/cadastro').send(corpo({ codigo: 'VLV-ADM' })));
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const e = await as(ADMIN_COMPRAS_TEXTO, () => request(app).put(`/api/compras/materiais/cadastro/${c.body.id}`).send({ ncm: '8481.80.99' }));
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.strictEqual((await dbGet(db, 'SELECT ncm FROM materiais_almoxarifado WHERE id = ?', [c.body.id])).ncm, '8481.80.99');
  });

  await test('[admin do Compras] saldo inicial pelo Compras -> 400 (Fase 5 X1: o saldo e lancado no Almoxarifado)', async () => {
    const r = await as(ADMIN_COMPRAS, () => request(app).post('/api/compras/materiais/cadastro').send(corpo({ codigo: 'VLV-SALDO', quantidade_atual: 3 })));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Saldo inicial é lançado no Almoxarifado.');
    assert.strictEqual((await dbGet(db, "SELECT COUNT(*) n FROM materiais_almoxarifado WHERE codigo = 'VLV-SALDO'")).n, 0);
  });

  // Etapa 193 (RN-193.02): editar, excluir e foto do almoxarifado recusam para TODOS com a literal do cadastro no Compras (antes,
  // o 403 do perfil); o criar do almoxarifado continua no perfil (a sobra e a remessa o usam) e segue recusando o admin do Compras.
  await test('[sem alargar o almoxarifado] o admin do Compras segue 403 nas rotas do almoxarifado: criar (perfil); editar, excluir, foto (Etapa 193)', async () => {
    const SO_NO_COMPRAS = 'O cadastro de material é feito em Compras → Materiais.';
    const chamadas = [
      [[LITERAL_403, 'criar_material'], () => request(app).post('/api/almoxarifado/materiais').send(corpo({ codigo: 'VLV-ALM' }))],
      [[SO_NO_COMPRAS, undefined], () => request(app).put(`/api/almoxarifado/materiais/${MAT}`).send({ ncm: '1' })],
      [[SO_NO_COMPRAS, undefined], () => request(app).delete(`/api/almoxarifado/materiais/${MAT}`)],
      [[SO_NO_COMPRAS, undefined], () => request(app).post(`/api/almoxarifado/materiais/${MAT}/foto`)],
    ];
    for (const [esperado, fn] of chamadas) {
      const r = await as(ADMIN_COMPRAS, fn);
      assert.strictEqual(r.status, 403, `${esperado[0]}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.deepStrictEqual([r.body.error, r.body.acao], esperado);
    }
    const m = await dbGet(db, 'SELECT ativo, ncm FROM materiais_almoxarifado WHERE id = ?', [MAT]);
    assert.deepStrictEqual(m, { ativo: 1, ncm: null });
  });

  await test('[so o Compras] admin de OUTRO modulo e o perfil COMPRAS sem ser admin -> 403 no Compras', async () => {
    for (const u of [ADMIN_FROTA, COMPRADOR_PERFIL_COMPRAS]) {
      const c = await as(u, () => request(app).post('/api/compras/materiais/cadastro').send(corpo({ codigo: `NEG-${u.id}` })));
      assert.deepStrictEqual([c.status, c.body.error, c.body.acao], [403, LITERAL_403, 'criar_material'], `${u.nome}: ${JSON.stringify(c.body)}`);
      const e = await as(u, () => request(app).put(`/api/compras/materiais/cadastro/${MAT}`).send({ ncm: '2' }));
      assert.deepStrictEqual([e.status, e.body.acao], [403, 'editar_material'], `${u.nome}: ${JSON.stringify(e.body)}`);
    }
  });

  await test('[ACAO_PERFIS intacto] criar_material e editar_material seguem ADMINISTRADOR, ALMOXARIFE, ENGENHARIA', async () => {
    const tres = [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE, PERFIS.ENGENHARIA];
    assert.deepStrictEqual(ACAO_PERFIS.criar_material, tres);
    assert.deepStrictEqual(ACAO_PERFIS.editar_material, tres);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
