/**
 * Etapa 212 (Compras) — RN-212.01 a RN-212.05: varios fornecedores para o mesmo material.
 *
 * O vinculo e `itens_fornecedor.material_id` (a linha do catalogo do fornecedor que e aquele material). Cenarios pela rota, com a
 * porta do cadastro do Compras real (`portaCompras`), e a migracao do "Fornecedor Principal" antigo pelo servico.
 *
 * Executar: cd server && node tests/api/fornecedoresDoMaterial.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { migrarFornecedorPrincipal, MSG } = require('../../services/compras/fornecedoresDoMaterial');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const LITERAL_403 = 'Sem permissão para esta operação';
const SUPER = { id: 1, nome: 'Super', role: 'usuario', is_superadmin: 1, email: 'super@test.com' };
const ADMIN_COMPRAS = { id: 3, nome: 'Chefe de Compras', role: 'usuario', admin_modulos: ['compras'], email: 'chefe@test.com' };
const ALMOXARIFE = { id: 4, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); return fn(); };
  const FAM = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('CHP','Chapas',1)")).lastID;
  const fornecedor = async (razao, fantasia = null) => (await dbRun(db,
    'INSERT INTO fornecedores (razao_social, nome_fantasia) VALUES (?, ?)', [razao, fantasia])).lastID;
  let seq = 0;
  const material = async (over = {}) => {
    seq += 1;
    const c = { codigo: `CHP-${String(seq).padStart(3, '0')}`, nome: `Chapa inox 304 #${seq}`, familia_id: FAM, ativo: 1, quantidade_atual: 0, ...over };
    const cols = Object.keys(c);
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (unidade, categoria, ${cols.join(', ')})
      VALUES ('KG', 'OUTROS', ${cols.map(() => '?').join(', ')})`, cols.map((k) => c[k]))).lastID;
  };
  const url = (m, l) => `/api/compras/materiais/cadastro/${m}/fornecedores${l ? `/${l}` : ''}`;

  const FA = await fornecedor('Aços Alfa Ltda', 'Alfa');
  const FB = await fornecedor('Beta Metais SA');
  const FC = await fornecedor('Gama Inox');

  await test('[RN-212.01] o admin do Compras vincula dois fornecedores, cada um com codigo e descricao; a lista vem pelo nome', async () => {
    const M = await material();
    let r = await as(ADMIN_COMPRAS, () => request(app).post(url(M)).send({ fornecedor_id: FB, codigo: 'CH-304', descricao: 'CHAPA 304 2B', preco: '45,90' }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual([r.body.fornecedor_nome, r.body.codigo, r.body.preco], ['Beta Metais SA', 'CH-304', 45.9]);
    r = await as(ADMIN_COMPRAS, () => request(app).post(url(M)).send({ fornecedor_id: FA, codigo: 'INX-001' }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const l = await as(ADMIN_COMPRAS, () => request(app).get(url(M)));
    assert.strictEqual(l.status, 200);
    assert.deepStrictEqual(l.body.map((x) => [x.fornecedor_nome, x.codigo]), [['Alfa', 'INX-001'], ['Beta Metais SA', 'CH-304']]);
  });

  await test('[RN-212.01] editar muda so o que veio; remover apaga a linha; o codigo GMP do material nao muda', async () => {
    const M = await material();
    const v = (await as(ADMIN_COMPRAS, () => request(app).post(url(M)).send({ fornecedor_id: FC, codigo: '45879', preco: 10 }))).body;
    let r = await as(ADMIN_COMPRAS, () => request(app).put(url(M, v.id)).send({ preco: 12.5 }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual([r.body.codigo, r.body.preco], ['45879', 12.5]);
    r = await as(ADMIN_COMPRAS, () => request(app).delete(url(M, v.id)));
    assert.deepStrictEqual([r.status, r.body], [200, { ok: true }]);
    assert.strictEqual(await dbGet(db, 'SELECT id FROM itens_fornecedor WHERE id = ?', [v.id]), undefined);
    assert.strictEqual((await dbGet(db, 'SELECT codigo FROM materiais_almoxarifado WHERE id = ?', [M])).codigo, `CHP-${String(seq).padStart(3, '0')}`);
  });

  await test('[RN-212.02] mesmo fornecedor duas vezes -> 409; fornecedor inexistente, sem fornecedor, preco negativo -> 400', async () => {
    const M = await material();
    await as(ADMIN_COMPRAS, () => request(app).post(url(M)).send({ fornecedor_id: FA }));
    const casos = [
      [{ fornecedor_id: FA }, 409, MSG.JA_VINCULADO],
      [{ fornecedor_id: 99999 }, 400, MSG.FORNECEDOR_NAO_ENCONTRADO],
      [{}, 400, MSG.ESCOLHA_FORNECEDOR],
      [{ fornecedor_id: FB, preco: -1 }, 400, MSG.PRECO_INVALIDO],
      [{ fornecedor_id: FB, preco: 'abc' }, 400, MSG.PRECO_INVALIDO],
    ];
    for (const [corpo, status, msg] of casos) {
      // eslint-disable-next-line no-await-in-loop
      const r = await as(ADMIN_COMPRAS, () => request(app).post(url(M)).send(corpo));
      assert.deepStrictEqual([r.status, r.body.error], [status, msg], JSON.stringify(corpo));
    }
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) AS c FROM itens_fornecedor WHERE material_id = ?', [M])).c, 1);
    // o mesmo fornecedor em OUTRO material pode
    const M2 = await material();
    const r = await as(ADMIN_COMPRAS, () => request(app).post(url(M2)).send({ fornecedor_id: FA }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  });

  await test('[Fase 5] preco com milhar e virgula ("1.234,56") grava 1234.56; com ponto decimal ("12.5") grava 12.5', async () => {
    const M = await material();
    let r = await as(ADMIN_COMPRAS, () => request(app).post(url(M)).send({ fornecedor_id: FA, preco: '1.234,56' }));
    assert.deepStrictEqual([r.status, r.body.preco], [201, 1234.56], JSON.stringify(r.body));
    r = await as(ADMIN_COMPRAS, () => request(app).put(url(M, r.body.id)).send({ preco: '12.5' }));
    assert.strictEqual(r.body.preco, 12.5);
  });

  await test('[RN-212.03] descricao comercial vazia grava o nome do material', async () => {
    const M = await material({ nome: 'Barra redonda 1020' });
    const r = await as(ADMIN_COMPRAS, () => request(app).post(url(M)).send({ fornecedor_id: FC, descricao: '  ' }));
    assert.strictEqual(r.body.descricao, 'Barra redonda 1020');
  });

  await test('[porta] almoxarife -> 403 na leitura e na gravacao; material inexistente -> 404; vinculo de outro material -> 404', async () => {
    const M = await material();
    const v = (await as(ADMIN_COMPRAS, () => request(app).post(url(M)).send({ fornecedor_id: FB }))).body;
    for (const fn of [() => request(app).get(url(M)), () => request(app).post(url(M)).send({ fornecedor_id: FC }),
      () => request(app).put(url(M, v.id)).send({ preco: 1 }), () => request(app).delete(url(M, v.id))]) {
      // eslint-disable-next-line no-await-in-loop
      const r = await as(ALMOXARIFE, fn);
      assert.deepStrictEqual([r.status, r.body.error], [403, LITERAL_403]);
    }
    let r = await as(ADMIN_COMPRAS, () => request(app).get(url(987654)));
    assert.deepStrictEqual([r.status, r.body.error], [404, MSG.MATERIAL_NAO_ENCONTRADO]);
    const OUTRO = await material();
    r = await as(ADMIN_COMPRAS, () => request(app).put(url(OUTRO, v.id)).send({ preco: 1 }));
    assert.deepStrictEqual([r.status, r.body.error], [404, MSG.VINCULO_NAO_ENCONTRADO]);
    r = await as(ADMIN_COMPRAS, () => request(app).delete(url(OUTRO, v.id)));
    assert.deepStrictEqual([r.status, r.body.error], [404, MSG.VINCULO_NAO_ENCONTRADO]);
    assert.ok(await dbGet(db, 'SELECT id FROM itens_fornecedor WHERE id = ?', [v.id]), 'a linha do outro material ficou');
  });

  await test('[RN-212.04] a migracao: o texto que bate com UM fornecedor vira linha (com o codigo), sem acento e sem caixa; idempotente', async () => {
    const BATE = await material({ fornecedor_principal: '  gama   INOX ', codigo_fornecedor: 'G-77' });
    const FANTASIA = await material({ fornecedor_principal: 'alfa' });
    await fornecedor('Duplicado SA'); await fornecedor('Outro', 'Duplicado SA');
    const AMBIGUO = await material({ fornecedor_principal: 'Duplicado SA' });
    const NAO_BATE = await material({ fornecedor_principal: 'Fornecedor que nao existe' });
    const ACENTO = await material({ fornecedor_principal: 'acos alfa ltda' });
    const n1 = await migrarFornecedorPrincipal(db);
    const linhas = async (m) => dbAll(db, 'SELECT fornecedor_id, codigo FROM itens_fornecedor WHERE material_id = ?', [m]);
    assert.deepStrictEqual(await linhas(BATE), [{ fornecedor_id: FC, codigo: 'G-77' }]);
    assert.deepStrictEqual(await linhas(FANTASIA), [{ fornecedor_id: FA, codigo: null }]);
    assert.deepStrictEqual(await linhas(ACENTO), [{ fornecedor_id: FA, codigo: null }]);
    assert.deepStrictEqual(await linhas(AMBIGUO), []);
    assert.deepStrictEqual(await linhas(NAO_BATE), []);
    assert.strictEqual(n1, 3);
    assert.strictEqual(await migrarFornecedorPrincipal(db), 0, 'segunda rodada nao duplica');
    assert.strictEqual((await dbGet(db, 'SELECT fornecedor_principal FROM materiais_almoxarifado WHERE id = ?', [NAO_BATE])).fornecedor_principal,
      'Fornecedor que nao existe', 'o texto antigo nao e apagado');
  });

  await test('[T4 integracao] vinculado pelo material aparece no catalogo do fornecedor; o preco mudado no catalogo aparece no material', async () => {
    const M = await material({ nome: 'Chapa xadrez' });
    const v = (await as(ADMIN_COMPRAS, () => request(app).post(url(M)).send({ fornecedor_id: FB, codigo: 'XZ-1', preco: 30 }))).body;
    let r = await as(ADMIN_COMPRAS, () => request(app).get(`/api/compras/fornecedores/${FB}/itens`));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const noCatalogo = r.body.find((x) => x.id === v.id);
    assert.ok(noCatalogo, 'a linha esta no catalogo');
    assert.strictEqual(noCatalogo.material_id, M);
    r = await as(ADMIN_COMPRAS, () => request(app).put(`/api/compras/fornecedores/${FB}/itens/${v.id}`)
      .send({ codigo: 'XZ-1', descricao: 'CHAPA XADREZ 3MM', unidade: 'UN', preco: 33 }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    r = await as(ADMIN_COMPRAS, () => request(app).get(url(M)));
    assert.deepStrictEqual(r.body.map((x) => [x.descricao, x.preco]), [['CHAPA XADREZ 3MM', 33]]);
  });

  await test('[Fase 2, 5] fornecedor inativo -> 400 literal', async () => {
    const M = await material();
    const FI = await fornecedor('Inativo Ltda');
    await dbRun(db, "UPDATE fornecedores SET status = 'inativo' WHERE id = ?", [FI]);
    const r = await as(ADMIN_COMPRAS, () => request(app).post(url(M)).send({ fornecedor_id: FI }));
    assert.deepStrictEqual([r.status, r.body.error], [400, MSG.FORNECEDOR_INATIVO]);
  });

  await test('[Fase 2, 3] pelo catalogo, quem nao cadastra material nao muda nem apaga a linha do material; a linha solta continua livre', async () => {
    const COMPRADOR = { id: 8, nome: 'Comprador', role: 'usuario', email: 'comp@test.com' };
    const M = await material();
    const v = (await as(ADMIN_COMPRAS, () => request(app).post(url(M)).send({ fornecedor_id: FC, preco: 5 }))).body;
    let r = await as(COMPRADOR, () => request(app).put(`/api/compras/fornecedores/${FC}/itens/${v.id}`).send({ descricao: 'X', preco: 1 }));
    assert.deepStrictEqual([r.status, r.body.error], [403, MSG.CATALOGO_DO_MATERIAL]);
    r = await as(COMPRADOR, () => request(app).delete(`/api/compras/fornecedores/${FC}/itens/${v.id}`));
    assert.deepStrictEqual([r.status, r.body.error], [403, MSG.CATALOGO_DO_MATERIAL]);
    assert.strictEqual((await dbGet(db, 'SELECT preco FROM itens_fornecedor WHERE id = ?', [v.id])).preco, 5);
    const solta = (await dbRun(db, "INSERT INTO itens_fornecedor (fornecedor_id, descricao, preco) VALUES (?, 'Item solto', 1)", [FC])).lastID;
    r = await as(COMPRADOR, () => request(app).put(`/api/compras/fornecedores/${FC}/itens/${solta}`).send({ descricao: 'Item solto 2', preco: 2 }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    r = await as(COMPRADOR, () => request(app).get(`/api/compras/fornecedores/${FC}/itens`));
    const lida = r.body.find((x) => x.id === v.id);
    assert.ok(lida.material_codigo && lida.material_codigo.startsWith('CHP-'), `codigo GMP no catalogo: ${JSON.stringify(lida)}`);
  });

  await test('[Fase 2, 2] a migracao do boot roda uma vez so: o vinculo removido depois nao volta', async () => {
    const { garantirSchema, MARCA_MIGRACAO } = require('../../services/compras/fornecedoresDoMaterial');
    await dbRun(db, 'DELETE FROM configuracoes_almoxarifado WHERE chave = ?', [MARCA_MIGRACAO]);
    const M = await material({ fornecedor_principal: 'Beta Metais SA' });
    await garantirSchema(db);
    const l = await dbGet(db, 'SELECT id FROM itens_fornecedor WHERE material_id = ? AND fornecedor_id = ?', [M, FB]);
    assert.ok(l, 'a primeira rodada cria');
    assert.ok(await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [MARCA_MIGRACAO]), 'e marca');
    await as(ADMIN_COMPRAS, () => request(app).delete(url(M, l.id)));
    await garantirSchema(db);
    assert.strictEqual(await dbGet(db, 'SELECT id FROM itens_fornecedor WHERE material_id = ?', [M]), undefined, 'removido nao volta');
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
