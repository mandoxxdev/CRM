/**
 * Etapa 180 — T2, RN-180.02 (+ I4 e menores da revisao da Fase 2): o TEXTO do termo de responsabilidade, versionado.
 *
 * Semente v1 provisoria marcada como tal; `POST /termos/FERRAMENTA` (so `editar_termos` = ADMINISTRADOR) cria a proxima versao;
 * vazio e igual a vigente -> 400; dois administradores salvando juntos -> 409 (nao 500); a tabela e append-only.
 *
 * Executar: cd server && node tests/api/termoFerramentaVersao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll } = require('../../services/almoxarifado/db');
const { wrapDatabase } = require('../../services/sqliteConcurrency');

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${String(e && e.message).replace(/\s*\n\s*/g, ' ').slice(0, 800)}`);
  }
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 2, nome: 'Almox', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const PRODUCAO = { id: 3, nome: 'Chao', email: 'chao@test.com' };
const URL = '/api/almoxarifado/termos/FERRAMENTA';

(async () => {
  const t = await createTestApp({ user: ADMIN });
  wrapDatabase(t.db);
  const { app, db } = t;
  const como = async (user, fn) => { t.setUser(user); try { return await fn(); } finally { t.setUser(ADMIN); } };

  await test('[RN-180.02] a semente: v1 FERRAMENTA, provisoria, texto comecando pela marca; historico com ela so', async () => {
    const r = await request(app).get(URL);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.vigente.versao, 1);
    assert.strictEqual(r.body.vigente.provisorio, true);
    assert.ok(r.body.vigente.texto.startsWith('TEXTO PROVISÓRIO — substituir pelo termo da empresa.'), r.body.vigente.texto);
    assert.strictEqual(r.body.vigente.criado_por_nome, 'Sistema (texto provisório)');
    assert.ok(r.body.vigente.criado_em);
    assert.strictEqual(r.body.historico.length, 1);
  });

  await test('[RN-180.02] nova versao: 201, versao 2 nao provisoria; a vigente e a maior; historico 2, 1', async () => {
    const r = await request(app).post(URL).send({ texto: '  Termo da empresa, versão A.  ' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual({ versao: r.body.versao, texto: r.body.texto, provisorio: r.body.provisorio, por: r.body.criado_por_nome },
      { versao: 2, texto: 'Termo da empresa, versão A.', provisorio: false, por: 'Admin Teste' });
    const g = (await request(app).get(URL)).body;
    assert.strictEqual(g.vigente.versao, 2);
    assert.deepStrictEqual(g.historico.map((v) => v.versao), [2, 1]);
    const linhas = await dbAll(db, "SELECT versao, texto_sha256 FROM termos_responsabilidade_versao WHERE tipo = 'FERRAMENTA' ORDER BY versao");
    assert.match(linhas[1].texto_sha256, /^[0-9a-f]{64}$/);
  });

  await test('[RN-180.02] texto igual ao vigente -> 400 literal; nada gravado', async () => {
    const r = await request(app).post(URL).send({ texto: 'Termo da empresa, versão A.' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'O texto é igual ao da versão vigente');
    assert.strictEqual((await dbAll(db, 'SELECT id FROM termos_responsabilidade_versao')).length, 2);
  });

  await test('[RN-180.02] texto vazio, so espacos ou ausente -> 400 literal', async () => {
    for (const corpo of [{ texto: '' }, { texto: '   ' }, {}]) {
      const r = await request(app).post(URL).send(corpo);
      assert.strictEqual(r.status, 400, JSON.stringify(corpo));
      assert.strictEqual(r.body.error, 'O texto do termo é obrigatório');
    }
  });

  await test('[menores] dois administradores salvando juntos (mesma versao_base) -> um 201, outro 409 literal; nunca 500', async () => {
    const [a, b] = await Promise.all([
      request(app).post(URL).send({ texto: 'Versão do admin 1', versao_base: 2 }),
      request(app).post(URL).send({ texto: 'Versão do admin 2', versao_base: 2 }),
    ]);
    assert.deepStrictEqual([a.status, b.status].sort(), [201, 409], JSON.stringify([a.body, b.body]));
    const perdedor = a.status === 409 ? a : b;
    assert.strictEqual(perdedor.body.error, 'Outra versão do termo acabou de ser salva — recarregue');
    assert.deepStrictEqual((await dbAll(db, 'SELECT versao FROM termos_responsabilidade_versao ORDER BY versao')).map((v) => v.versao), [1, 2, 3]);
  });

  await test('[menores] versao_base antiga (a tela do admin ficou aberta) -> 409, nada gravado', async () => {
    const r = await request(app).post(URL).send({ texto: 'Outra coisa', versao_base: 1 });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.body.error, 'Outra versão do termo acabou de ser salva — recarregue');
    assert.strictEqual((await dbAll(db, 'SELECT id FROM termos_responsabilidade_versao')).length, 3);
  });

  await test('[I4] so ADMINISTRADOR cria versao (ALMOXARIFE 403); GET exige gerenciar_ferramentas (ALMOXARIFE 200, PRODUCAO 403)', async () => {
    await como(ALMOXARIFE, async () => {
      assert.strictEqual((await request(app).post(URL).send({ texto: 'do almoxarife' })).status, 403);
      assert.strictEqual((await request(app).get(URL)).status, 200);
    });
    await como(PRODUCAO, async () => {
      assert.strictEqual((await request(app).get(URL)).status, 403);
      assert.strictEqual((await request(app).post(URL).send({ texto: 'do chao' })).status, 403);
    });
    assert.strictEqual((await dbAll(db, 'SELECT id FROM termos_responsabilidade_versao')).length, 3);
  });

  await test('[I4] minhas-permissoes expoe editar_termos: ADMIN true, ALMOXARIFE false', async () => {
    assert.strictEqual((await request(app).get('/api/almoxarifado/minhas-permissoes')).body.acoes.editar_termos, true);
    await como(ALMOXARIFE, async () => {
      const r = (await request(app).get('/api/almoxarifado/minhas-permissoes')).body;
      assert.strictEqual(r.acoes.editar_termos, false);
      assert.strictEqual(r.acoes.gerenciar_ferramentas, true);
    });
  });

  await test('[RN-180.02] tipo desconhecido -> 404', async () => {
    const r = await request(app).get('/api/almoxarifado/termos/OUTRO');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'Tipo de termo desconhecido: OUTRO');
  });

  await test('[RN-180.02] append-only: UPDATE e DELETE nas versoes sao recusados pelo banco', async () => {
    await assert.rejects(dbRun(db, "UPDATE termos_responsabilidade_versao SET texto = 'x' WHERE versao = 1"), /nao pode ser alterado/);
    await assert.rejects(dbRun(db, 'DELETE FROM termos_responsabilidade_versao WHERE versao = 1'), /nao pode ser alterado/);
  });

  console.log(`\ntermoFerramentaVersao: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
