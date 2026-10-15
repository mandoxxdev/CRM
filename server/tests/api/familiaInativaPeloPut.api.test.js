/**
 * Etapa 105 (G10c) — inativar pelo PUT /api/almoxarifado/familias/:id segue a regra do "Inativar" da tela.
 *
 * O "Inativar" da aba Familias chama o DELETE, que recusa familia com item ativo. O PUT com `ativo: 0`
 * nao conferia nada: a familia sumia das listas com os materiais ativos dentro (medido: 200). E o inverso:
 * reativar pelo PUT uma subfamilia cuja raiz esta inativa deixava a sub ativa sob raiz inativa — o estado
 * que a tela mostra como "Subfamilias sem familia ativa" e no qual nenhum material novo entra.
 *
 * RN-105.01: transicao ativa -> inativa com item ativo -> 400 L-I (a mesma string do DELETE).
 * RN-105.02: metade positiva (so inativos, ja inativa, ativo omitido, ativo: 1).
 * RN-105.03: `ativo: 'false'` conta como inativo tambem para a regra de subfamilia ativa.
 * RN-105.04: reativar sub sem mudar de pai com pai inativo -> 400 L-R; pai inexistente -> 'Familia pai nao encontrada'.
 *
 * Executar: cd server && node tests/api/familiaInativaPeloPut.api.test.js
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
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

/** Literais do contrato escritas AQUI por extenso. */
const L_I = (n) => `Não é possível remover: família possui ${n} item(ns) ativo(s)`;
const L_SUB_ATIVA = 'Não é possível inativar: família possui subfamília(s) ativa(s)';
const L_R = 'Não é possível reativar: a família principal desta subfamília está inativa — reative a família principal antes';
const L_PAI = 'Família pai não encontrada';

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  let seq = 0;
  const fam = async (parent = null, ativo = 1) => {
    seq += 1;
    return (await dbRun(db,
      'INSERT INTO familias_material_almoxarifado (codigo, nome, ativo, parent_id) VALUES (?,?,?,?)',
      [`F105-${seq}`, `Familia ${seq}`, ativo, parent])).lastID;
  };
  const mat = async (familia, sub = null, ativo = 1) => {
    seq += 1;
    return (await dbRun(db,
      'INSERT INTO materiais_almoxarifado (codigo, nome, unidade, familia_id, subfamilia_id, ativo) VALUES (?,?,?,?,?,?)',
      [`M105-${seq}`, `Material ${seq}`, 'UN', familia, sub, ativo])).lastID;
  };
  const linha = (id) => dbGet(db, 'SELECT ativo, typeof(ativo) AS tipo, parent_id, nome FROM familias_material_almoxarifado WHERE id = ?', [id]);
  const put = (id, body) => request(app).put(`/api/almoxarifado/familias/${id}`).send(body);
  const del = (id) => request(app).delete(`/api/almoxarifado/familias/${id}`);
  const recusa = (r, literal) => {
    assert.strictEqual(r.status, 400, `esperava 400: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, literal);
  };
  const aceita = (r) => assert.strictEqual(r.status, 200, `esperava 200: ${r.status} ${JSON.stringify(r.body)}`);

  // ── RN-105.01 ────────────────────────────────────────────────────────────────
  await test('RN-105.01 raiz com 1 material ativo + ativo:0 -> 400 L-I(1); continua ativa e com o nome antigo', async () => {
    const R = await fam();
    await mat(R);
    const antes = await linha(R);
    recusa(await put(R, { nome: 'Nome novo', ativo: 0 }), L_I(1));
    const depois = await linha(R);
    assert.strictEqual(depois.ativo, 1, 'nada gravado: continua ativa');
    assert.strictEqual(depois.nome, antes.nome, 'nada gravado: nem o nome');
  });

  await test('RN-105.01 conta os itens ativos da raiz pela familia e pelas subs (2 ativos + 1 inativo -> L-I(2))', async () => {
    const R = await fam();
    const S = await fam(R);
    await mat(R);
    await mat(R, S);
    await mat(R, null, 0);
    // a sub ativa daria a outra recusa; inativa-se a sub direto no banco para isolar a contagem
    await dbRun(db, 'UPDATE familias_material_almoxarifado SET ativo = 0 WHERE id = ?', [S]);
    recusa(await put(R, { nome: 'x', ativo: 0 }), L_I(2));
  });

  await test('RN-105.01 subfamilia com material (subfamilia_id) + ativo:0 -> 400 L-I(1); continua ativa', async () => {
    const R = await fam();
    const S = await fam(R);
    await mat(R, S);
    recusa(await put(S, { nome: 'Sub', ativo: 0 }), L_I(1));
    assert.strictEqual((await linha(S)).ativo, 1);
  });

  for (const valor of [false, '0', 'false', null]) {
    await test(`RN-105.01 ativo: ${JSON.stringify(valor)} tambem e inativar -> 400 L-I(1); nada gravado`, async () => {
      const R = await fam();
      await mat(R);
      recusa(await put(R, { nome: 'x', ativo: valor }), L_I(1));
      const depois = await linha(R);
      assert.strictEqual(depois.ativo, 1);
      assert.strictEqual(depois.tipo, 'integer', 'nada gravado: nem o texto');
    });
  }

  await test('RN-105.01 integracao entre portas: o PUT e o DELETE ("Inativar" da tela) devolvem a MESMA string', async () => {
    const R = await fam();
    await mat(R);
    await mat(R);
    await mat(R);
    const pelaTela = await del(R);
    const pelaApi = await put(R, { nome: 'x', ativo: 0 });
    recusa(pelaTela, L_I(3));
    recusa(pelaApi, pelaTela.body.error);
  });

  await test('RN-105.01 material ativo vem ANTES da subfamilia ativa (ordem do DELETE)', async () => {
    const R = await fam();
    await fam(R);
    await mat(R);
    recusa(await put(R, { nome: 'x', ativo: 0 }), L_I(1));
    assert.strictEqual((await del(R)).body.error, L_I(1), 'o DELETE tambem fala dos itens primeiro');
  });

  // ── RN-105.02 (metade positiva) ──────────────────────────────────────────────
  await test('RN-105.02 so material INATIVO + ativo:0 -> 200 e grava 0', async () => {
    const R = await fam();
    await mat(R, null, 0);
    aceita(await put(R, { nome: 'x', ativo: 0 }));
    assert.strictEqual((await linha(R)).ativo, 0);
  });

  await test('RN-105.02 familia JA inativa com material ativo (legado) renomeada com ativo:0 -> 200 (nao e transicao)', async () => {
    const R = await fam(null, 0);
    await mat(R);
    aceita(await put(R, { nome: 'Renomeada', ativo: 0 }));
    const depois = await linha(R);
    assert.strictEqual(depois.nome, 'Renomeada');
    assert.strictEqual(depois.ativo, 0);
  });

  await test('RN-105.02 corpo da tela (sem ativo) numa familia com material ativo -> 200 e continua ativa', async () => {
    const R = await fam();
    await mat(R);
    aceita(await put(R, { nome: 'Pela tela', descricao: 'd', tipo_uso: 'ambos' }));
    assert.strictEqual((await linha(R)).ativo, 1);
  });

  await test('RN-105.02 ativo:1 numa ativa com material -> 200', async () => {
    const R = await fam();
    await mat(R);
    aceita(await put(R, { nome: 'x', ativo: 1 }));
    assert.strictEqual((await linha(R)).ativo, 1);
  });

  // ── RN-105.03 ────────────────────────────────────────────────────────────────
  await test("RN-105.03 raiz com sub ativa + ativo:'false' -> 400 (literal de sub ativa); nada gravado", async () => {
    const R = await fam();
    await fam(R);
    recusa(await put(R, { nome: 'x', ativo: 'false' }), L_SUB_ATIVA);
    const depois = await linha(R);
    assert.strictEqual(depois.ativo, 1);
    assert.strictEqual(depois.tipo, 'integer');
  });

  await test('RN-105.03 (M2) raiz JA inativa com sub ativa (legado) renomeia: sem ativo -> 200; com ativo:0 -> 200', async () => {
    const R = await fam(null, 0);
    await fam(R, 1);
    aceita(await put(R, { nome: 'Renomeada 1' }));
    aceita(await put(R, { nome: 'Renomeada 2', ativo: 0 }));
    const depois = await linha(R);
    assert.strictEqual(depois.nome, 'Renomeada 2');
    assert.strictEqual(depois.ativo, 0);
  });

  // ── RN-105.00 (M1) `ativo` normalizado ──────────────────────────────────────
  await test("RN-105.00 ativo:'false' sem material -> 200, grava 0 INTEIRO e aparece em ?ativo=0", async () => {
    const R = await fam();
    aceita(await put(R, { nome: 'x', ativo: 'false' }));
    const depois = await linha(R);
    assert.strictEqual(depois.ativo, 0);
    assert.strictEqual(depois.tipo, 'integer');
    const inativas = await request(app).get('/api/almoxarifado/familias?ativo=0');
    assert.ok(inativas.body.some((f) => f.id === R), 'a inativada tem de aparecer na lista de inativas');
  });

  await test("RN-105.00 ativo:'true' numa inativa (raiz) -> 200 e grava 1 INTEIRO", async () => {
    const R = await fam(null, 0);
    aceita(await put(R, { nome: 'x', ativo: 'true' }));
    const depois = await linha(R);
    assert.strictEqual(depois.ativo, 1);
    assert.strictEqual(depois.tipo, 'integer');
  });

  for (const valor of [2, 'sim', '', {}]) {
    await test(`RN-105.00 ativo: ${JSON.stringify(valor)} -> 400 'Ativo inválido: use 0 ou 1'; nada gravado`, async () => {
      const R = await fam();
      recusa(await put(R, { nome: 'Nao grava', ativo: valor }), 'Ativo inválido: use 0 ou 1');
      const depois = await linha(R);
      assert.strictEqual(depois.ativo, 1);
      assert.notStrictEqual(depois.nome, 'Nao grava');
    });
  }

  await test('RN-105.00 ativo invalido numa familia que nao existe -> 404 (o 404 vem antes)', async () => {
    const r = await put(999999, { nome: 'x', ativo: 2 });
    assert.strictEqual(r.status, 404, JSON.stringify(r.body));
  });

  // ── RN-105.04 (o inverso) ────────────────────────────────────────────────────
  await test('RN-105.04 reativar sub (ativo:1) com a raiz inativa -> 400 L-R; continua inativa', async () => {
    const R = await fam(null, 0);
    const S = await fam(R, 0);
    recusa(await put(S, { nome: 'Sub', ativo: 1 }), L_R);
    assert.strictEqual((await linha(S)).ativo, 0);
  });

  await test('RN-105.04 reativar sub repetindo o parent_id da raiz inativa -> L-R (nao a de "maximo 2 niveis")', async () => {
    const R = await fam(null, 0);
    const S = await fam(R, 0);
    recusa(await put(S, { nome: 'Sub', ativo: 1, parent_id: String(R) }), L_R);
    assert.strictEqual((await linha(S)).ativo, 0);
  });

  for (const valor of ['1', true]) {
    await test(`RN-105.04 ativo: ${JSON.stringify(valor)} tambem e reativar -> L-R`, async () => {
      const R = await fam(null, 0);
      const S = await fam(R, 0);
      recusa(await put(S, { nome: 'Sub', ativo: valor }), L_R);
    });
  }

  await test('RN-105.04 sub cujo pai gravado nao existe + ativo:1 -> 400 Familia pai nao encontrada', async () => {
    const S = await fam(987654, 0);
    recusa(await put(S, { nome: 'Sub', ativo: 1 }), L_PAI);
    assert.strictEqual((await linha(S)).ativo, 0);
  });

  await test('RN-105.04 metade positiva: reativar a raiz e depois a sub -> 200 e 200; a sub volta a aceitar material', async () => {
    const R = await fam(null, 0);
    const S = await fam(R, 0);
    aceita(await put(R, { nome: 'Raiz', ativo: 1 }));
    aceita(await put(S, { nome: 'Sub', ativo: 1 }));
    assert.strictEqual((await linha(S)).ativo, 1);
    const novo = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: `M105-N${seq}`, nome: 'Novo na sub', unidade: 'UN', familia_id: R, subfamilia_id: S });
    assert.ok([200, 201].includes(novo.status), `material novo na sub reativada: ${novo.status} ${JSON.stringify(novo.body)}`);
  });

  await test('RN-105.04 metade positiva: sub inativa de raiz ATIVA + ativo:1 -> 200', async () => {
    const R = await fam();
    const S = await fam(R, 0);
    aceita(await put(S, { nome: 'Sub', ativo: 1 }));
    assert.strictEqual((await linha(S)).ativo, 1);
  });

  await test('RN-105.04 metade positiva: renomear a sub inativa SEM ativo (raiz inativa) -> 200 e continua inativa', async () => {
    const R = await fam(null, 0);
    const S = await fam(R, 0);
    aceita(await put(S, { nome: 'Renomeada' }));
    const depois = await linha(S);
    assert.strictEqual(depois.nome, 'Renomeada');
    assert.strictEqual(depois.ativo, 0);
  });

  await test('RN-105.04 metade positiva: sub JA ativa sob raiz inativa (legado) com ativo:1 -> 200 (nao e reativacao)', async () => {
    const R = await fam(null, 0);
    const S = await fam(R, 1);
    aceita(await put(S, { nome: 'Sub', ativo: 1 }));
  });

  await test('RN-105.04 reativar a sub MUDANDO para outra raiz ativa -> 200 (decide a validacao do pai novo, nao a L-R)', async () => {
    const Rinativa = await fam(null, 0);
    const Rativa = await fam();
    const S = await fam(Rinativa, 0);
    aceita(await put(S, { nome: 'Sub movida', ativo: 1, parent_id: Rativa }));
    const depois = await linha(S);
    assert.strictEqual(depois.ativo, 1);
    assert.strictEqual(depois.parent_id, Rativa);
  });

  await test('RN-105.04 (B1) legado com parent_id = 0 e raiz: reativar -> 200 (nao procura o pai 0)', async () => {
    const R = await fam(0, 0);
    aceita(await put(R, { nome: 'Legado zero', ativo: 1 }));
    assert.strictEqual((await linha(R)).ativo, 1);
  });

  await test('RN-105.04 (B2) DELETE com id nao numerico continua 404 (o helper recebe o id cru)', async () => {
    const R = await fam();
    await mat(R);
    const r = await request(app).delete(`/api/almoxarifado/familias/${R}abc`);
    assert.strictEqual(r.status, 404, JSON.stringify(r.body));
  });

  await test('RN-105.04 reativar raiz (sem pai) -> 200', async () => {
    const R = await fam(null, 0);
    aceita(await put(R, { nome: 'Raiz', ativo: 1 }));
    assert.strictEqual((await linha(R)).ativo, 1);
  });

  await close();
  console.log(`\nfamiliaInativaPeloPut: ${passed} passou, ${failed} falhou`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
