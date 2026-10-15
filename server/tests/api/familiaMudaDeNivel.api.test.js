/**
 * Etapa 103 (G10b) — familia com material NAO muda de nivel pelo PUT /api/almoxarifado/familias/:id.
 *
 * A Etapa 100 (G10) fechou a porta do material NOVO com a subfamilia no lugar da familia, mas o
 * mesmo estado nascia por outra porta: dar `parent_id` a uma raiz que ja tem materiais (eles ficam
 * com `familia_id` = uma subfamilia). A sonda da Fase 0 achou mais dois casos com o mesmo efeito —
 * sub com material trocando de familia principal (o material fica com a raiz antiga) e sub com
 * material virando raiz (o `subfamilia_id` dele aponta para uma raiz) — e o dos dois niveis: raiz
 * com subfamilia INATIVA virava sub, e reativar a sub depois deixava tres niveis no banco.
 *
 * RN-103.01: parent_id NOVO + material (qualquer ativo) -> 400 L-F1 (raiz) / L-F2 (sub).
 * RN-103.02: parent_id NOVO numa raiz com sub inativa -> 400 L-F3.
 * RN-103.03: metade positiva (sem material vira sub; renomear com ou sem o mesmo parent_id).
 *
 * Executar: cd server && node tests/api/familiaMudaDeNivel.api.test.js
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
const L_F1 = (n) => `Não é possível transformar em subfamília: a família tem ${n} material(is) cadastrado(s) (contando os inativos)`;
const L_F2 = (n) => `Não é possível mudar a família principal desta subfamília: ela tem ${n} material(is) cadastrado(s) (contando os inativos)`;
const L_F3 = 'Família com subfamília(s) inativa(s) não pode virar subfamília — elas ficariam num terceiro nível';
const L_ATIVA = 'Família com subfamília(s) ativa(s) não pode virar subfamília';

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  let seq = 0;
  const fam = async (parent = null, ativo = 1) => {
    seq += 1;
    return (await dbRun(db,
      'INSERT INTO familias_material_almoxarifado (codigo, nome, ativo, parent_id) VALUES (?,?,?,?)',
      [`F103-${seq}`, `Familia ${seq}`, ativo, parent])).lastID;
  };
  const mat = async (familia, sub = null, ativo = 1) => {
    seq += 1;
    return (await dbRun(db,
      'INSERT INTO materiais_almoxarifado (codigo, nome, unidade, familia_id, subfamilia_id, ativo) VALUES (?,?,?,?,?,?)',
      [`M103-${seq}`, `Material ${seq}`, 'UN', familia, sub, ativo])).lastID;
  };
  const pai = async (id) => (await dbGet(db, 'SELECT parent_id FROM familias_material_almoxarifado WHERE id = ?', [id])).parent_id;
  const put = (id, body) => request(app).put(`/api/almoxarifado/familias/${id}`).send(body);

  const R1 = await fam();
  const R2 = await fam();

  await test('RN-103.01 raiz com material ATIVO recebendo parent_id -> 400 L-F1; continua raiz', async () => {
    const A = await fam();
    await mat(A);
    const r = await put(A, { nome: 'Raiz com material', parent_id: R1 });
    assert.strictEqual(r.status, 400, `esperava 400: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_F1(1));
    assert.strictEqual(await pai(A), null, 'nada gravado: continua raiz');
  });

  await test('RN-103.01 raiz so com material INATIVO tambem recusa (contando os inativos) e conta os dois', async () => {
    const A = await fam();
    await mat(A, null, 0);
    await mat(A, null, 0);
    const r = await put(A, { nome: 'Raiz com inativos', parent_id: String(R1) });
    assert.strictEqual(r.status, 400, `esperava 400: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_F1(2));
    assert.strictEqual(await pai(A), null);
  });

  await test('RN-103.01 sub com material (subfamilia_id) trocando de familia principal -> 400 L-F2; pai intacto', async () => {
    const S = await fam(R1);
    await mat(R1, S);
    const r = await put(S, { nome: 'Sub com material', parent_id: R2 });
    assert.strictEqual(r.status, 400, `esperava 400: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_F2(1));
    assert.strictEqual(await pai(S), R1);
  });

  await test('RN-103.01 sub com material virando raiz (parent_id null) -> 400 L-F2', async () => {
    const S = await fam(R1);
    await mat(R1, S);
    const r = await put(S, { nome: 'Sub vira raiz', parent_id: null });
    assert.strictEqual(r.status, 400, `esperava 400: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_F2(1));
    assert.strictEqual(await pai(S), R1);
  });

  await test('RN-103.01 sub com material LEGADO (familia_id = sub) tambem conta', async () => {
    const S = await fam(R1);
    await mat(S);
    const r = await put(S, { nome: 'Sub com legado', parent_id: R2 });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, L_F2(1));
  });

  await test('RN-103.02 raiz com subfamilia INATIVA recebendo parent_id -> 400 L-F3; sem terceiro nivel', async () => {
    const B = await fam();
    await fam(B, 0);
    const r = await put(B, { nome: 'Raiz com sub inativa', parent_id: R1 });
    assert.strictEqual(r.status, 400, `esperava 400: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_F3);
    assert.strictEqual(await pai(B), null);
  });

  await test("RN-103.02 sub com ativo fora de 0/1 (texto 'false', gravado cru pelo PUT) tambem conta como inativa", async () => {
    const B = await fam();
    await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo, parent_id) VALUES ('F103-TXT', 'Sub texto', 'false', ?)", [B]);
    const r = await put(B, { nome: 'Raiz com sub texto', parent_id: R1 });
    assert.strictEqual(r.status, 400, `esperava 400: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_F3);
  });

  await test('RN-103.01 legado com parent_id = 0 e material e tratado como RAIZ (literal L-F1)', async () => {
    const Z = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo, parent_id) VALUES ('F103-Z', 'Pai zero', 1, 0)")).lastID;
    await mat(Z);
    const r = await put(Z, { nome: 'Pai zero', parent_id: R1 });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, L_F1(1));
  });

  await test('RN-103.03 METADE POSITIVA: sub SEM material vira raiz -> 200', async () => {
    const S = await fam(R1);
    const r = await put(S, { nome: 'Sub vazia vira raiz', parent_id: null });
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(await pai(S), null);
  });

  await test('RN-103.02 a recusa de subfamilia ATIVA nao mudou (mesma literal, vem antes)', async () => {
    const C = await fam();
    await fam(C, 1);
    await fam(C, 0);
    await mat(C);
    const r = await put(C, { nome: 'Raiz com sub ativa', parent_id: R1 });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, L_ATIVA);
  });

  await test('RN-103.03 METADE POSITIVA: raiz sem material e sem filhas vira sub -> 200', async () => {
    const F = await fam();
    const r = await put(F, { nome: 'Raiz vazia', parent_id: R1 });
    assert.strictEqual(r.status, 200, `raiz vazia tem de virar sub: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(await pai(F), R1);
  });

  await test('RN-103.03 METADE POSITIVA: sub com material renomeada (sem parent_id, com o mesmo, mesmo em texto) -> 200', async () => {
    const S = await fam(R1);
    await mat(R1, S);
    const semPai = await put(S, { nome: 'Renomeada' });
    assert.strictEqual(semPai.status, 200, `omitindo: ${semPai.status} ${JSON.stringify(semPai.body)}`);
    const mesmoPai = await put(S, { nome: 'Renomeada 2', parent_id: R1 });
    assert.strictEqual(mesmoPai.status, 200, `mesmo pai: ${mesmoPai.status} ${JSON.stringify(mesmoPai.body)}`);
    const mesmoPaiTexto = await put(S, { nome: 'Renomeada 3', parent_id: String(R1) });
    assert.strictEqual(mesmoPaiTexto.status, 200, `mesmo pai em texto: ${mesmoPaiTexto.status} ${JSON.stringify(mesmoPaiTexto.body)}`);
    const row = await dbGet(db, 'SELECT nome, parent_id FROM familias_material_almoxarifado WHERE id = ?', [S]);
    assert.strictEqual(row.nome, 'Renomeada 3');
    assert.strictEqual(row.parent_id, R1);
  });

  await test('RN-103.03 METADE POSITIVA: raiz com material renomeada com parent_id null explicito -> 200', async () => {
    const A = await fam();
    await mat(A);
    const r = await put(A, { nome: 'Raiz renomeada', parent_id: null });
    assert.strictEqual(r.status, 200, `raiz continua raiz: ${r.status} ${JSON.stringify(r.body)}`);
    const r2 = await put(A, { nome: 'Raiz renomeada 2', parent_id: '' });
    assert.strictEqual(r2.status, 200, `'' tambem e raiz: ${r2.status} ${JSON.stringify(r2.body)}`);
  });

  await test("parent_id nao numerico ('abc') ou '0' -> 400 'Família pai não encontrada'; a sub nao vira raiz calada", async () => {
    const S = await fam(R1);
    for (const ruim of ['abc', '0', 0, '-3', '2.5']) {
      const r = await put(S, { nome: 'Sub', parent_id: ruim });
      assert.strictEqual(r.status, 400, `parent_id ${JSON.stringify(ruim)}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, 'Família pai não encontrada');
    }
    assert.strictEqual(await pai(S), R1, 'continua sub de R1');
    // METADE POSITIVA: numero em texto com espacos e aceito (a raiz vazia vira sub).
    const F = await fam();
    const ok = await put(F, { nome: 'Raiz vazia 2', parent_id: ` ${R2} ` });
    assert.strictEqual(ok.status, 200, `' ${R2} ': ${ok.status} ${JSON.stringify(ok.body)}`);
    assert.strictEqual(await pai(F), R2);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
