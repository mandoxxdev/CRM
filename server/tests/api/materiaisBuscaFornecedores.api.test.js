/**
 * Etapa 260 (item 1) — RN-260.01/02: a busca e a lista de materiais com os fornecedores do material (Etapa 212).
 *
 * A busca (`search`) das duas rotas da lista — Almoxarifado e Compras, o mesmo handler — passa a achar o material pelo nome do
 * fornecedor (razao social ou fantasia), pelo codigo que o fornecedor usa e pela descricao comercial dele. Cada linha ganha
 * `fornecedores` (os nomes, sem repeticao, em ordem alfabetica). Sem a tabela core `fornecedores`: 200, `fornecedores: []`.
 *
 * Plano: docs/superpowers/plans/2026-11-23-almoxarifado-etapa260-fornecedores-na-busca-projeto-e-fila-agrupada.md
 * Executar: cd server && node tests/api/materiaisBuscaFornecedores.api.test.js
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

const SUPER = { id: 1, nome: 'Super', role: 'usuario', is_superadmin: 1, email: 'super@test.com' };
const ADMIN_COMPRAS = { id: 3, nome: 'Chefe de Compras', role: 'usuario', admin_modulos: ['compras'], email: 'chefe@test.com' };

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); return fn(); };
  const FAM = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('CHP','Chapas',1)")).lastID;
  const fornecedor = async (razao, fantasia = null) => (await dbRun(db,
    'INSERT INTO fornecedores (razao_social, nome_fantasia) VALUES (?, ?)', [razao, fantasia])).lastID;
  const material = async (codigo, nome, principal = null) => (await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, categoria, familia_id, ativo, quantidade_atual, fornecedor_principal) VALUES (?, ?, 'KG', 'OUTROS', ?, 1, 0, ?)`,
  [codigo, nome, FAM, principal])).lastID;
  const vincular = (m, f, codigo = null, descricao = 'x') => dbRun(db,
    'INSERT INTO itens_fornecedor (fornecedor_id, material_id, codigo, descricao, unidade, preco) VALUES (?, ?, ?, ?, \'UN\', 0)',
    [f, m, codigo, descricao]);

  // BETA antes de Aços: o id (a ordem do indice material x fornecedor) nao e a alfabetica — o sort da resposta aparece
  const FB = await fornecedor('BETA METAIS SA');
  const FA = await fornecedor('AÇOS BRASIL LTDA', 'Aços Brasil');
  const FZ = await fornecedor('ZETA PERFIS');
  const FV = await fornecedor('VAZIO FANTASIA', '   ');
  const M1 = await material('CHP-001', 'Chapa inox 304');
  const M2 = await material('CHP-002', 'Chapa galvanizada', 'TEXTO ANTIGO QUALQUER');
  const M3 = await material('CHP-003', 'Barra chata');
  // FB antes de FA: a ordem de insercao nao e a alfabetica (o sort da resposta aparece)
  await vincular(M1, FB, 'BT-10');
  await vincular(M1, FA, 'AB-778', 'CHAPA INOX 2B LAMINADA');
  await vincular(M2, FZ, 'ZP-55');
  await vincular(M3, FV, 'VZ-1');
  // linha do catalogo SEM material (Etapa 212: o catalogo do fornecedor e livre) — nao liga a nenhum material
  await dbRun(db, "INSERT INTO itens_fornecedor (fornecedor_id, codigo, descricao, unidade, preco) VALUES (?, 'AVULSO-1', 'Chapa inox avulsa', 'UN', 0)", [FZ]);

  const ROTAS = [['Almoxarifado', '/api/almoxarifado/materiais', SUPER], ['Compras', '/api/compras/materiais/cadastro', ADMIN_COMPRAS]];
  const buscar = (rota, u, search) => as(u, () => request(app).get(rota).query(search === undefined ? {} : { search }));
  const ids = (r) => r.body.map((m) => m.id).sort((a, b) => a - b);

  for (const [nome, rota, u] of ROTAS) {
    await test(`[RN-260.01] ${nome}: o nome do fornecedor acha o material (fantasia, razao social, outra caixa)`, async () => {
      for (const termo of ['aços brasil', 'AÇOS BRASIL LTDA', 'beta metais']) {
        const r = await buscar(rota, u, termo);
        assert.strictEqual(r.status, 200, JSON.stringify(r.body));
        assert.deepStrictEqual(ids(r), [M1], `termo ${termo}`);
      }
    });

    await test(`[RN-260.01] ${nome}: o codigo do fornecedor (parcial) e a descricao comercial acham; nada acha o que nao e dele`, async () => {
      let r = await buscar(rota, u, 'ab-77');
      assert.deepStrictEqual(ids(r), [M1], 'codigo parcial em minusculas');
      r = await buscar(rota, u, 'ZP-55');
      assert.deepStrictEqual(ids(r), [M2], 'codigo de outro fornecedor');
      r = await buscar(rota, u, 'laminada');
      assert.deepStrictEqual(ids(r), [M1], 'descricao comercial');
      r = await buscar(rota, u, 'AVULSO-1');
      assert.deepStrictEqual(ids(r), [], 'linha do catalogo sem material nao liga a ninguem');
    });

    await test(`[RN-260.01] ${nome}: as colunas de antes continuam (nome, codigo, fornecedor principal antigo)`, async () => {
      assert.deepStrictEqual(ids(await buscar(rota, u, 'barra')), [M3]);
      assert.deepStrictEqual(ids(await buscar(rota, u, 'CHP-002')), [M2]);
      assert.deepStrictEqual(ids(await buscar(rota, u, 'texto antigo')), [M2]);
    });

    await test(`[RN-260.02] ${nome}: cada material traz os fornecedores, sem repeticao e em ordem alfabetica; sem nenhum, []`, async () => {
      const M4 = await material(`CHP-9${nome.length}`, `Sem fornecedor ${nome}`);
      const r = await buscar(rota, u);
      assert.strictEqual(r.status, 200);
      const por = new Map(r.body.map((m) => [m.id, m.fornecedores]));
      assert.deepStrictEqual(por.get(M1), ['Aços Brasil', 'BETA METAIS SA']);
      assert.deepStrictEqual(por.get(M2), ['ZETA PERFIS']);
      assert.deepStrictEqual(por.get(M3), ['VAZIO FANTASIA'], 'fantasia so com espacos cai na razao social');
      assert.deepStrictEqual(por.get(M4), []);
    });
  }

  await test('[RN-260.02] sem a tabela core `fornecedores`: a lista responde 200, `fornecedores: []`, e a busca usa as colunas de antes', async () => {
    await dbRun(db, 'DROP TABLE fornecedores');
    let r = await buscar('/api/almoxarifado/materiais', SUPER);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.length >= 3, 'a lista continua');
    assert.ok(r.body.every((m) => Array.isArray(m.fornecedores) && m.fornecedores.length === 0), 'fornecedores: []');
    r = await buscar('/api/almoxarifado/materiais', SUPER, 'barra');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(ids(r), [M3]);
    r = await buscar('/api/almoxarifado/materiais', SUPER, 'ZP-55');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(ids(r), [M2], 'o codigo do fornecedor mora em itens_fornecedor e continua achando');
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
