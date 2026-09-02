/**
 * RN-07 (Etapa 20, C5) — LER o mapa de materiais permitidos de um setor exige o mesmo que
 * ESCREVÊ-lo.
 *
 * Buraco coberto: `GET /api/almoxarifado/setores-requisicao/:id/permissoes`
 * (routes/almoxarifado/extended.js) tinha só `auth` — qualquer usuário com acesso ao módulo
 * (inclusive o fallback PRODUCAO, que é "sem perfil") lia o mapa inteiro de controle de acesso
 * de QUALQUER setor, enquanto o PUT e o POST /bulk-tipo irmãos já exigiam
 * `isSystemAdmin || canConfigureAlmox`. Ler quem pode requisitar o quê é reconhecimento: diz
 * qual setor tem brecha para pedir material fora da sua alçada.
 *
 * O endpoint NÃO tinha nenhum teste antes deste arquivo — fechar o gate sem a matriz seria
 * fechar às cegas, sem saber quem parou de conseguir ler.
 *
 * Gate copiado LITERALMENTE do PUT irmão (extended.js), mensagem inclusive — se as duas
 * mensagens divergirem, a tela mostra textos diferentes para a mesma negativa.
 *
 * Harness: `setUser` grava req.user direto (não passa por enrichUserFromDb), então o perfil vem
 * do objeto. `getPerfilFromUser` faz fallback para PRODUCAO — por isso "sem perfil" é um caso
 * de teste próprio e não sinônimo de "sem acesso".
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const MSG_403 = 'Acesso restrito — administrador do Almoxarifado ou Super Administrador';

// Quem PODE ler (o gate é isSystemAdmin || canConfigureAlmox)
const PODEM = [
  ['super admin (sem role=admin)', { id: 1, nome: 'Super', role: 'usuario', is_superadmin: 1 }],
  ['admin do módulo almoxarifado', { id: 2, nome: 'AdminModulo', role: 'usuario', admin_modulos: ['almoxarifado'] }],
  ['role=admin do sistema', { id: 3, nome: 'AdminSistema', role: 'admin' }],
  ['perfil ADMINISTRADOR do almoxarifado', { id: 4, nome: 'AdminAlmox', role: 'usuario', perfil_almoxarifado: 'ADMINISTRADOR' }],
];

// Quem NÃO pode — todos têm acesso AO MÓDULO (camada 2 liberada no harness, como em produção
// para quem tem o módulo): o que muda é só o perfil.
const NAO_PODEM = [
  ['ALMOXARIFE', { id: 11, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE' }],
  ['GESTOR', { id: 12, nome: 'Gestor', role: 'usuario', perfil_almoxarifado: 'GESTOR' }],
  ['COMPRAS', { id: 13, nome: 'Compras', role: 'usuario', perfil_almoxarifado: 'COMPRAS' }],
  ['PRODUCAO', { id: 14, nome: 'Producao', role: 'usuario', perfil_almoxarifado: 'PRODUCAO' }],
  ['CONSULTA', { id: 15, nome: 'Consulta', role: 'usuario', perfil_almoxarifado: 'CONSULTA' }],
  ['sem perfil (fallback PRODUCAO)', { id: 16, nome: 'Comum', role: 'usuario' }],
];

// Forma da linha devolvida por sectorMaterialService.getPermissoesSetor: `p.*` da tabela
// setor_material_permitido + os campos dos 3 LEFT JOINs. Congelada aqui para que o gate não
// possa "passar" mudando o corpo da resposta.
const CHAVES_ESPERADAS = [
  'categoria_id', 'categoria_nome', 'categoria_tipo_uso',
  'created_at',
  'familia_codigo', 'familia_id', 'familia_nome', 'familia_tipo_uso',
  'id',
  'material_codigo', 'material_id', 'material_nome',
  'setor_id',
];

(async () => {
  const { app, db, setUser, close } = await createTestApp();

  const ADMIN_SETUP = { id: 99, nome: 'Setup', role: 'admin' };
  setUser(ADMIN_SETUP);

  // A listagem roda o ensureSetoresRequisicao (cria as tabelas + seed). O GET de permissões
  // NÃO chama o ensure, então esta chamada é pré-requisito do arquivo inteiro.
  const setores = await request(app).get('/api/almoxarifado/setores-requisicao');
  assert.strictEqual(setores.status, 200, JSON.stringify(setores.body));
  const setorId = setores.body[0].id;

  const fam = await dbRun(db,
    `INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('RN07F','Familia RN07',1)`);
  const mat = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, unidade, ativo)
     VALUES ('RN07M','Material RN07',0,'UN',1)`);

  const gravado = await request(app)
    .put(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes`)
    .send({ permissoes: [{ familia_id: fam.lastID }, { material_id: mat.lastID }] });
  assert.strictEqual(gravado.status, 200, JSON.stringify(gravado.body));
  assert.strictEqual(gravado.body.length, 2, 'setup: deveria ter gravado 2 permissoes');

  for (const [rotulo, user] of PODEM) {
    await test(`${rotulo} lê o mapa (200)`, async () => {
      setUser(user);
      const res = await request(app).get(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes`);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(Array.isArray(res.body), true, 'resposta deveria ser array');
      assert.strictEqual(res.body.length, 2, JSON.stringify(res.body));
    });
  }

  await test('o 200 devolve a MESMA forma de antes do gate', async () => {
    setUser(PODEM[0][1]);
    const res = await request(app).get(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    for (const linha of res.body) {
      assert.deepStrictEqual(
        Object.keys(linha).sort(), CHAVES_ESPERADAS,
        `chaves da linha mudaram: ${JSON.stringify(Object.keys(linha).sort())}`);
    }

    const porFamilia = res.body.find((r) => r.familia_id === fam.lastID);
    assert.ok(porFamilia, 'linha da familia sumiu');
    assert.strictEqual(porFamilia.familia_nome, 'Familia RN07');
    assert.strictEqual(porFamilia.familia_codigo, 'RN07F');
    assert.strictEqual(porFamilia.setor_id, setorId);
    assert.strictEqual(porFamilia.material_id, null);

    const porMaterial = res.body.find((r) => r.material_id === mat.lastID);
    assert.ok(porMaterial, 'linha do material sumiu');
    assert.strictEqual(porMaterial.material_nome, 'Material RN07');
    assert.strictEqual(porMaterial.material_codigo, 'RN07M');
    assert.strictEqual(porMaterial.familia_id, null);
  });

  for (const [rotulo, user] of NAO_PODEM) {
    await test(`${rotulo} recebe 403 com a mensagem do PUT irmão`, async () => {
      setUser(user);
      const res = await request(app).get(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes`);
      assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.error, MSG_403);
      // Nada do mapa pode vazar junto do 403.
      assert.strictEqual(Array.isArray(res.body), false);
      assert.strictEqual(JSON.stringify(res.body).includes('Material RN07'), false, 'vazou material no corpo do 403');
      assert.strictEqual(JSON.stringify(res.body).includes('Familia RN07'), false, 'vazou familia no corpo do 403');
    });
  }

  await test('a mensagem do 403 do GET é IDÊNTICA à do PUT irmão', async () => {
    setUser(NAO_PODEM[0][1]);
    const doGet = await request(app).get(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes`);
    const doPut = await request(app)
      .put(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes`)
      .send({ permissoes: [] });
    assert.strictEqual(doPut.status, 403, JSON.stringify(doPut.body));
    assert.strictEqual(doGet.status, 403, JSON.stringify(doGet.body));
    assert.deepStrictEqual(doGet.body, doPut.body);
  });

  await test('403 não apaga nada: o mapa continua com as 2 permissões', async () => {
    setUser(PODEM[0][1]);
    const res = await request(app).get(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.length, 2, JSON.stringify(res.body));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
