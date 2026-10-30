/**
 * Etapa 192 (RN-192.10, RN-192.11) — a tela Materiais do Compras: lista, incluir e editar material por portas do proprio
 * Compras (`/api/compras/materiais/cadastro...` e `/api/compras/materiais/aux/...`), com os MESMOS handlers das rotas do
 * almoxarifado (`routes/almoxarifado.js`, `routes/almoxarifado/extended.js`) e a regra de quem pode em
 * `services/compras/cadastroDeMaterial.js`.
 *
 * O QUE ESTA SUITE NAO PROVA (o harness libera a camada 2 — `fakeCheckModulePermission`, `tests/helpers/testApp.js`):
 *  - que o comprador SEM o modulo almoxarifado toma 403 em `/api/almoxarifado/materiais` em producao (e o motivo destas
 *    portas existirem). A prova e a leitura do `app.use('/api/almoxarifado', authenticateToken,
 *    checkModulePermission('almoxarifado'))` de `routes/almoxarifado.js` — o mesmo declarado na Etapa 38
 *    (`comprasPedidoImportar.api.test.js`, cenario 5);
 *  - que as portas do Compras exigem o modulo `compras` (`checkModulePermission('compras')` em `criarPortaCompras`).
 * O que ela prova e a camada 3 (perfil/administrador do Compras), real, e que as respostas sao as mesmas do almoxarifado.
 *
 * Executar: cd server && node tests/api/comprasCadastroMaterial.api.test.js
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
// Sem perfil -> fallback PRODUCAO (getPerfilFromUser): o comprador comum, o caso negativo natural.
const COMPRADOR = { id: 2, nome: 'Comprador', role: 'usuario', email: 'comprador@test.com' };
const CONSULTA = { id: 3, nome: 'Consulta', role: 'usuario', perfil_almoxarifado: 'CONSULTA', email: 'consulta@test.com' };
const ALMOXARIFE = { id: 4, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };
const ENGENHARIA = { id: 5, nome: 'Engenharia', role: 'usuario', perfil_almoxarifado: 'ENGENHARIA', email: 'eng@test.com' };

const LITERAL_403 = 'Sem permissão para esta operação';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });
  const as = async (u, fn) => { setUser(u); return fn(); };

  const FAM = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('VLV','Valvulas',1)")).lastID;
  const FAM_MORTA = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('OLD','Morta',0)")).lastID;
  const corpo = (over = {}) => ({ nome: 'Valvula esfera 1/2', unidade: 'PC', categoria: 'OUTROS', familia_id: FAM,
    ncm: '8481.80.95', custo_unitario: 10, ...over });
  const MAT = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, categoria, familia_id, ncm, ativo)
    VALUES ('VLV-001','Valvula gaveta','PC','OUTROS',?, '8481.80.00', 1)`, [FAM])).lastID;

  // ══ Leitura: a lista, o detalhe e os auxiliares sao os do almoxarifado ═══════════════════════════════════════════

  const PARES_LEITURA = [
    ['/api/compras/materiais/cadastro', '/api/almoxarifado/materiais'],
    [`/api/compras/materiais/cadastro/${MAT}`, `/api/almoxarifado/materiais/${MAT}`],
    ['/api/compras/materiais/aux/familias', '/api/almoxarifado/familias'],
    ['/api/compras/materiais/aux/categorias', '/api/almoxarifado/categorias'],
    ['/api/compras/materiais/aux/almoxarifados', '/api/almoxarifado/almoxarifados'],
    ['/api/compras/materiais/aux/localizacoes', '/api/almoxarifado/localizacoes'],
    [`/api/compras/materiais/aux/proximo-codigo?familia_id=${FAM}`, `/api/almoxarifado/proximo-codigo?familia_id=${FAM}`],
  ];

  await test('[leitura] as 7 portas do Compras devolvem o MESMO corpo das rotas do almoxarifado (ALMOXARIFE)', async () => {
    for (const [compras, almox] of PARES_LEITURA) {
      const a = await as(ALMOXARIFE, () => request(app).get(compras));
      const b = await as(ALMOXARIFE, () => request(app).get(almox));
      assert.strictEqual(a.status, 200, `${compras}: ${a.status} ${JSON.stringify(a.body)}`);
      assert.strictEqual(b.status, 200, `${almox}: ${b.status}`);
      assert.deepStrictEqual(a.body, b.body, `${compras} difere de ${almox}`);
    }
    const lista = await as(ALMOXARIFE, () => request(app).get('/api/compras/materiais/cadastro?search=gaveta'));
    assert.deepStrictEqual(lista.body.map((m) => m.codigo), ['VLV-001']);
  });

  await test('[leitura] comprador sem perfil (PRODUCAO) e CONSULTA -> 403 com a literal, nas 7 portas', async () => {
    for (const u of [COMPRADOR, CONSULTA]) {
      for (const [compras] of PARES_LEITURA) {
        const r = await as(u, () => request(app).get(compras));
        assert.strictEqual(r.status, 403, `${u.nome} ${compras}: ${r.status} ${JSON.stringify(r.body)}`);
        assert.strictEqual(r.body.error, LITERAL_403);
        assert.deepStrictEqual(r.body.acoes, ['criar_material', 'editar_material'], JSON.stringify(r.body));
      }
    }
  });

  await test('[leitura] detalhe de material inexistente -> 404 com a literal do almoxarifado', async () => {
    const r = await as(ALMOXARIFE, () => request(app).get('/api/compras/materiais/cadastro/999999'));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'Material não encontrado');
  });

  await test('[minhas-permissoes] responde o que a tela pode mostrar, sem 403 para quem nao pode', async () => {
    const c = await as(COMPRADOR, () => request(app).get('/api/compras/materiais/aux/minhas-permissoes'));
    assert.strictEqual(c.status, 200);
    assert.deepStrictEqual(c.body, { perfil: 'PRODUCAO', acoes: { criar_material: false, editar_material: false } });
    const a = await as(ALMOXARIFE, () => request(app).get('/api/compras/materiais/aux/minhas-permissoes'));
    assert.deepStrictEqual(a.body, { perfil: 'ALMOXARIFE', acoes: { criar_material: true, editar_material: true } });
  });

  // ══ Incluir ═══════════════════════════════════════════════════════════════════════════════════════════════════

  await test('[POST] ENGENHARIA cria pelo Compras -> 201, com NCM, e o material aparece na busca do pedido', async () => {
    const r = await as(ENGENHARIA, () => request(app).post('/api/compras/materiais/cadastro').send(corpo({ codigo: 'VLV-COMPRAS' })));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const gravado = await dbGet(db, 'SELECT ncm, familia_id, ativo FROM materiais_almoxarifado WHERE id = ?', [r.body.id]);
    assert.deepStrictEqual(gravado, { ncm: '8481.80.95', familia_id: FAM, ativo: 1 });
    const busca = await as(ENGENHARIA, () => request(app).get('/api/compras/materiais?search=VLV-COMPRAS'));
    assert.strictEqual(busca.status, 200);
    assert.ok(busca.body.some((m) => m.id === r.body.id), JSON.stringify(busca.body));
  });

  await test('[POST] comprador sem perfil e CONSULTA -> 403 criar_material, nada gravado', async () => {
    for (const u of [COMPRADOR, CONSULTA]) {
      const r = await as(u, () => request(app).post('/api/compras/materiais/cadastro').send(corpo({ codigo: `NEG-${u.id}` })));
      assert.strictEqual(r.status, 403, `${u.nome}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, LITERAL_403);
      assert.strictEqual(r.body.acao, 'criar_material');
      assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM materiais_almoxarifado WHERE codigo = ?', [`NEG-${u.id}`])).n, 0);
    }
  });

  await test('[POST] as recusas sao as do almoxarifado: familia inativa, codigo repetido, Zod e saldo inicial sem movimentar', async () => {
    const casos = [
      corpo({ codigo: 'REC-1', familia_id: FAM_MORTA }),
      corpo({ codigo: 'VLV-001' }),
      corpo({ codigo: 'REC-3', classe_abc: 'Z' }),
      corpo({ codigo: 'REC-4', quantidade_atual: 5 }), // ENGENHARIA nao tem `movimentar`
    ];
    for (const c of casos) {
      const a = await as(ENGENHARIA, () => request(app).post('/api/compras/materiais/cadastro').send(c));
      const b = await as(ENGENHARIA, () => request(app).post('/api/almoxarifado/materiais').send(c));
      assert.ok(a.status >= 400, `${c.codigo}: o Compras aceitou (${a.status})`);
      assert.strictEqual(a.status, b.status, `${c.codigo}: ${a.status} x ${b.status}`);
      assert.deepStrictEqual(a.body, b.body, `${c.codigo}: mensagens diferentes`);
    }
  });

  // ══ Editar ════════════════════════════════════════════════════════════════════════════════════════════════════

  await test('[PUT] ALMOXARIFE edita pelo Compras -> 200 e grava; a resposta tem a forma da do almoxarifado', async () => {
    const r = await as(ALMOXARIFE, () => request(app).put(`/api/compras/materiais/cadastro/${MAT}`).send({ ncm: '8481.80.99', nome: 'Valvula gaveta 1"' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.ncm, '8481.80.99');
    const b = await as(ALMOXARIFE, () => request(app).put(`/api/almoxarifado/materiais/${MAT}`).send({ ncm: '8481.80.99', nome: 'Valvula gaveta 1"' }));
    assert.deepStrictEqual(Object.keys(r.body).sort(), Object.keys(b.body).sort());
  });

  await test('[PUT] comprador sem perfil e CONSULTA -> 403 editar_material, nada gravado', async () => {
    for (const u of [COMPRADOR, CONSULTA]) {
      const r = await as(u, () => request(app).put(`/api/compras/materiais/cadastro/${MAT}`).send({ ncm: '0000.00.00' }));
      assert.strictEqual(r.status, 403, `${u.nome}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, LITERAL_403);
      assert.strictEqual(r.body.acao, 'editar_material');
    }
    assert.strictEqual((await dbGet(db, 'SELECT ncm FROM materiais_almoxarifado WHERE id = ?', [MAT])).ncm, '8481.80.99');
  });

  await test('[PUT] o 409 de "mudou enquanto editava" e o 404 sao os do almoxarifado', async () => {
    const lidos = { campos_lidos: { ncm: 'valor-que-ninguem-gravou' }, ncm: '1111.11.11' };
    const a = await as(ALMOXARIFE, () => request(app).put(`/api/compras/materiais/cadastro/${MAT}`).send(lidos));
    const b = await as(ALMOXARIFE, () => request(app).put(`/api/almoxarifado/materiais/${MAT}`).send(lidos));
    assert.strictEqual(a.status, 409, JSON.stringify(a.body));
    assert.deepStrictEqual([a.status, a.body], [b.status, b.body]);
    const n = await as(ALMOXARIFE, () => request(app).put('/api/compras/materiais/cadastro/999999').send({ ncm: '1' }));
    assert.deepStrictEqual([n.status, n.body.error], [404, 'Material não encontrado']);
  });

  await test('[PUT] inativar/reativar pelo Compras -> 400 com a literal, material segue ativo', async () => {
    for (const ativo of [0, 1, false]) {
      const r = await as(ADMIN, () => request(app).put(`/api/compras/materiais/cadastro/${MAT}`).send({ ativo }));
      assert.strictEqual(r.status, 400, `ativo=${ativo}: ${r.status}`);
      assert.strictEqual(r.body.error, 'Inativar ou reativar material é feito no Almoxarifado.');
    }
    assert.strictEqual((await dbGet(db, 'SELECT ativo FROM materiais_almoxarifado WHERE id = ?', [MAT])).ativo, 1);
  });

  await test('[fora do Compras] excluir e foto nao tem porta: DELETE e POST /foto -> 404, material intacto', async () => {
    const d = await as(ADMIN, () => request(app).delete(`/api/compras/materiais/cadastro/${MAT}`));
    assert.strictEqual(d.status, 404, `DELETE: ${d.status}`);
    const f = await as(ADMIN, () => request(app).post(`/api/compras/materiais/cadastro/${MAT}/foto`));
    assert.strictEqual(f.status, 404, `foto: ${f.status}`);
    const m = await dbGet(db, 'SELECT ativo, foto FROM materiais_almoxarifado WHERE id = ?', [MAT]);
    assert.strictEqual(m.ativo, 1);
    assert.ok(!m.foto);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
