/**
 * Etapa 215 (Compras) — RN-215.01/02: categorias e tipos de material se cadastram pelo Compras; o Almoxarifado so consulta.
 * Cenarios pela rota, com as portas reais (`portaCompras.cadastro`, `requirePermission`, `denyUnlessAlmoxAdmin`).
 *
 * Executar: cd server && node tests/api/categoriasETiposNoCompras.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const LITERAL_403 = 'Sem permissão para esta operação';
const MSG_CAT = 'O cadastro de categorias é feito em Compras → Categorias.';
const MSG_TIPO = 'O cadastro de tipos de material é feito em Compras → Tipos de Material.';
const SUPER = { id: 1, nome: 'Super', role: 'usuario', is_superadmin: 1, email: 'super@test.com' };
const ROLE_ADMIN = { id: 2, nome: 'Admin do sistema', role: 'admin', email: 'admin@test.com' };
const ADMIN_COMPRAS = { id: 3, nome: 'Chefe de Compras', role: 'usuario', admin_modulos: ['compras'], email: 'chefe@test.com' };
const ALMOXARIFE = { id: 4, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };
const ADMIN_PERFIL_ALMOX = { id: 6, nome: 'Adm Almox', role: 'usuario', perfil_almoxarifado: 'ADMINISTRADOR', email: 'aa@test.com' };

(async () => {
  delete process.env.ALMOX_CADASTRO_MATERIAL;
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); return fn(); };
  const conta = async (tabela) => (await dbGet(db, `SELECT COUNT(*) AS c FROM ${tabela}`)).c;

  await test('[RN-215.01 integracao] categoria: o admin do Compras cria, renomeia, desativa e reativa pelo Compras; o Almoxarifado le', async () => {
    let r = await as(ADMIN_COMPRAS, () => request(app).post('/api/compras/materiais/categorias').send({ nome: '  Inox  ' }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const id = r.body.id;
    assert.strictEqual(r.body.nome, 'Inox');
    r = await as(ADMIN_COMPRAS, () => request(app).put(`/api/compras/materiais/categorias/${id}`).send({ nome: 'Aço Inox' }));
    assert.deepStrictEqual([r.status, r.body.nome], [200, 'Aço Inox'], JSON.stringify(r.body));
    r = await as(ADMIN_COMPRAS, () => request(app).post('/api/compras/materiais/categorias').send({ nome: 'Aço Inox' }));
    assert.deepStrictEqual([r.status, r.body.error], [400, 'Já existe uma categoria com este nome']);
    r = await as(ADMIN_COMPRAS, () => request(app).delete(`/api/compras/materiais/categorias/${id}`));
    assert.deepStrictEqual([r.status, r.body.success], [200, true]);
    r = await as(ADMIN_COMPRAS, () => request(app).put(`/api/compras/materiais/categorias/${id}`).send({ ativo: 1 }));
    assert.strictEqual(r.body.ativo, 1);
    const pelaLeitura = await as(ALMOXARIFE, () => request(app).get('/api/almoxarifado/categorias'));
    assert.ok(pelaLeitura.body.some((c) => c.id === id && c.nome === 'Aço Inox'), 'o Almoxarifado le o que o Compras gravou');
    const peloCompras = await as(ADMIN_COMPRAS, () => request(app).get('/api/compras/materiais/aux/categorias'));
    assert.ok(peloCompras.body.some((c) => c.id === id));
    const aud = await dbGet(db, "SELECT usuario_id FROM auditoria_log_almoxarifado WHERE entidade = 'categoria' AND entidade_id = ? AND acao = 'CRIACAO'", [id]);
    assert.deepStrictEqual(aud, { usuario_id: ADMIN_COMPRAS.id }, 'a auditoria grava a pessoa');
  });

  await test('[RN-215.01] tipo de material: o admin do Compras cria, edita e exclui pelo Compras; a leitura do Compras traz', async () => {
    let r = await as(ADMIN_COMPRAS, () => request(app).post('/api/compras/materiais/tipos-material').send({ nome: 'Consumível', is_epi: false }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const id = r.body.id;
    r = await as(ADMIN_COMPRAS, () => request(app).post('/api/compras/materiais/tipos-material').send({}));
    assert.deepStrictEqual([r.status, r.body.error], [400, 'Nome obrigatório']);
    r = await as(ADMIN_COMPRAS, () => request(app).put(`/api/compras/materiais/tipos-material/${id}`).send({ nome: 'Consumível de solda' }));
    assert.deepStrictEqual([r.status, r.body.nome], [200, 'Consumível de solda'], JSON.stringify(r.body));
    r = await as(ADMIN_COMPRAS, () => request(app).put('/api/compras/materiais/tipos-material/99999').send({ nome: 'X' }));
    assert.deepStrictEqual([r.status, r.body.error], [404, 'Tipo de material não encontrado']);
    let lista = await as(ADMIN_COMPRAS, () => request(app).get('/api/compras/materiais/aux/tipos-material'));
    assert.strictEqual(lista.status, 200);
    assert.ok(lista.body.some((t) => t.id === id && t.nome === 'Consumível de solda'));
    r = await as(ADMIN_COMPRAS, () => request(app).delete(`/api/compras/materiais/tipos-material/${id}`));
    assert.deepStrictEqual([r.status, r.body.success], [200, true]);
    lista = await as(ADMIN_COMPRAS, () => request(app).get('/api/compras/materiais/aux/tipos-material'));
    assert.ok(!lista.body.some((t) => t.id === id), 'excluido sai da lista');
  });

  await test('[RN-215.01] os administradores do sistema tambem gravam pelo Compras', async () => {
    for (const u of [SUPER, ROLE_ADMIN]) {
      const r = await as(u, () => request(app).post('/api/compras/materiais/categorias').send({ nome: `Cat ${u.id}` }));
      assert.strictEqual(r.status, 201, `${u.nome}: ${JSON.stringify(r.body)}`);
      const t = await as(u, () => request(app).post('/api/compras/materiais/tipos-material').send({ nome: `Tipo ${u.id}` }));
      assert.strictEqual(t.status, 201, `${u.nome}: ${JSON.stringify(t.body)}`);
    }
  });

  await test('[RN-215.01] quem nao administra o Compras -> 403 da porta do Compras, nada gravado', async () => {
    const antesC = await conta('categorias_material_almoxarifado');
    const antesT = await conta('tipos_material_almoxarifado');
    for (const u of [ALMOXARIFE, ADMIN_PERFIL_ALMOX]) {
      let r = await as(u, () => request(app).post('/api/compras/materiais/categorias').send({ nome: 'Nao pode' }));
      assert.deepStrictEqual([r.status, r.body.error], [403, LITERAL_403], `${u.nome} categoria`);
      r = await as(u, () => request(app).post('/api/compras/materiais/tipos-material').send({ nome: 'Nao pode' }));
      assert.deepStrictEqual([r.status, r.body.error], [403, LITERAL_403], `${u.nome} tipo`);
      r = await as(u, () => request(app).get('/api/compras/materiais/aux/tipos-material'));
      assert.strictEqual(r.status, 403, `${u.nome} leitura dos tipos pelo Compras`);
    }
    assert.strictEqual(await conta('categorias_material_almoxarifado'), antesC);
    assert.strictEqual(await conta('tipos_material_almoxarifado'), antesT);
  });

  await test('[RN-215.02] POST, PUT e DELETE pelo Almoxarifado -> 403 literal para todos (super inclusive); nada gravado; a leitura continua', async () => {
    const cat = (await as(SUPER, () => request(app).post('/api/compras/materiais/categorias').send({ nome: 'Alvo' }))).body.id;
    const tipo = (await as(SUPER, () => request(app).post('/api/compras/materiais/tipos-material').send({ nome: 'Alvo' }))).body.id;
    for (const u of [SUPER, ADMIN_PERFIL_ALMOX]) {
      const casos = [
        ['post', '/api/almoxarifado/categorias', { nome: 'Pelo almox' }, MSG_CAT],
        ['put', `/api/almoxarifado/categorias/${cat}`, { nome: 'Renomeada' }, MSG_CAT],
        ['delete', `/api/almoxarifado/categorias/${cat}`, null, MSG_CAT],
        ['post', '/api/almoxarifado/tipos-material', { nome: 'Pelo almox' }, MSG_TIPO],
        ['put', `/api/almoxarifado/tipos-material/${tipo}`, { nome: 'Renomeado' }, MSG_TIPO],
        ['delete', `/api/almoxarifado/tipos-material/${tipo}`, null, MSG_TIPO],
      ];
      for (const [m, url, corpo, msg] of casos) {
        const r = await as(u, () => (corpo ? request(app)[m](url).send(corpo) : request(app)[m](url)));
        assert.deepStrictEqual([r.status, r.body.error], [403, msg], `${u.nome} ${m.toUpperCase()} ${url}`);
      }
    }
    assert.deepStrictEqual(await dbGet(db, 'SELECT nome, ativo FROM categorias_material_almoxarifado WHERE id = ?', [cat]), { nome: 'Alvo', ativo: 1 });
    assert.deepStrictEqual(await dbGet(db, 'SELECT nome, ativo FROM tipos_material_almoxarifado WHERE id = ?', [tipo]), { nome: 'Alvo', ativo: 1 });
    const l = await as(ALMOXARIFE, () => request(app).get('/api/almoxarifado/tipos-material'));
    assert.ok(l.body.some((t) => t.id === tipo), 'a leitura de tipos pelo Almoxarifado continua');
  });

  await test('[RN-215.02] com a chave ALMOX_CADASTRO_MATERIAL=liberado o portao de antes volta', async () => {
    process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
    try {
      let r = await as(ADMIN_PERFIL_ALMOX, () => request(app).post('/api/almoxarifado/categorias').send({ nome: 'Com a chave' }));
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      r = await as(ADMIN_PERFIL_ALMOX, () => request(app).post('/api/almoxarifado/tipos-material').send({ nome: 'Com a chave' }));
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      r = await as(ALMOXARIFE, () => request(app).post('/api/almoxarifado/tipos-material').send({ nome: 'Almoxarife nao' }));
      assert.strictEqual(r.status, 403, 'o portao de antes decide (almoxarife nao configura)');
      assert.notStrictEqual(r.body.error, MSG_TIPO);
    } finally { delete process.env.ALMOX_CADASTRO_MATERIAL; }
  });

  await close();

  await test('[RN-215.01] as portas do Compras exigem o modulo Compras (camada 1)', async () => {
    const checkModulo = (modulo) => (req, res, next) => (((req.user && req.user.modulos) || []).includes(modulo)
      ? next() : res.status(403).json({ error: 'MODULO', modulo }));
    const h = await createTestApp({ user: { ...ADMIN_COMPRAS, modulos: ['almoxarifado'] }, checkModulePermission: checkModulo });
    try {
      for (const [m, url] of [['post', '/api/compras/materiais/categorias'], ['post', '/api/compras/materiais/tipos-material'], ['get', '/api/compras/materiais/aux/tipos-material']]) {
        const r = await request(h.app)[m](url).send({ nome: 'Sem modulo' });
        assert.deepStrictEqual([r.status, r.body.modulo], [403, 'compras'], `${m} ${url}: ${JSON.stringify(r.body)}`);
      }
      h.setUser({ ...ADMIN_COMPRAS, modulos: ['compras'] });
      const r = await request(h.app).post('/api/compras/materiais/tipos-material').send({ nome: 'Com modulo' });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    } finally { await h.close(); }
  });

  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
