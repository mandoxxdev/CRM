/**
 * Etapa 123, Fase 5 (revisor de concorrencia, r2) — tres janelas ANTERIORES a esta etapa, da mesma forma da C221, achadas e
 * fechadas aqui (B796, B797, B798). Todas so pela API ou por duas abas; nenhuma pelo gesto unico da tela.
 *
 *  - RN-06d (B796): o PUT de familia com `ativo` INFORMADO e igual ao lido gravava sem condicao (o COALESCE so protege o
 *    omitido): `{ativo: 1}` numa sub ativa com a sub e a raiz inativadas no meio deixava a sub ativa sob raiz inativa;
 *    `{ativo: 0}` numa familia inativa reativada com material no meio a reinativava com o material dentro.
 *  - RN-06e (B798): o PUT de material grava o par familia/subfamilia lido mesmo sem mudar — um salvar lido antes de outra
 *    aba mover o material, gravado depois de a familia antiga ser inativada (ou a subfamilia antiga virar raiz), devolvia o
 *    par velho.
 *  - RN-06f (B797): o "Inativar" que nao grava porque uma subfamilia nasceu e sumiu na janela respondia "ja inativa" com a
 *    familia ATIVA.
 *
 * Executar: cd server && node tests/api/familiaCorridaFase5.api.test.js
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
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const L_409_PUT = 'A família mudou enquanto era salva — nada foi gravado. Recarregue a família e salve de novo.';
const L_409_DEL = 'A família mudou enquanto era inativada — nada foi gravado. Tente de novo.';
const E4 = (codigo) => `O cadastro do material ${codigo} mudou enquanto era salvo — nada foi gravado. Recarregue o material e salve de novo.`;

const SQL_SUBS_ATIVAS = /^SELECT COUNT\(\*\) as c FROM familias_material_almoxarifado WHERE parent_id = \? AND ativo = 1$/;
const SQL_LER_MATERIAL = /^SELECT \* FROM materiais_almoxarifado WHERE id = \?$/;
const SQL_ANTERIOR_FAMILIA = /^SELECT \* FROM familias_material_almoxarifado WHERE id = \?$/;
const SQL_RELEITURA_SUBS_DELETE = /^SELECT COUNT\(\*\) AS c FROM familias_material_almoxarifado WHERE parent_id = \? AND ativo = 1$/;

(async () => {
  console.log('\n═══ Etapa 123, Fase 5: o valor lido no WHERE (B796, B797, B798) ═══\n');
  const { app, db, close } = await createTestApp({ user: SUPER });
  const srv = app.listen(0);
  let seq = 0;
  const familia = async (ativo = 1, parentId = null) => {
    seq += 1;
    return (await dbRun(db, 'INSERT INTO familias_material_almoxarifado (codigo, nome, ativo, parent_id) VALUES (?, ?, ?, ?)',
      [`F5-${seq}`, `Familia f5 ${seq}`, ativo, parentId])).lastID;
  };
  const material = async (familiaId, sub = null) => {
    seq += 1;
    const codigo = `M5-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, familia_id, subfamilia_id, ativo)
      VALUES (?, ?, 'PC', ?, ?, 1)`, [codigo, `Material f5 ${seq}`, familiaId, sub])).lastID;
    return { id, codigo };
  };
  const fam = (id) => dbGet(db, 'SELECT id, ativo, parent_id FROM familias_material_almoxarifado WHERE id = ?', [id]);
  const mat = (id) => dbGet(db, 'SELECT familia_id, subfamilia_id, ativo FROM materiais_almoxarifado WHERE id = ?', [id]);
  const set = (tabela, id, campos) => () => dbRun(db, `UPDATE ${tabela} SET ${Object.keys(campos).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    [...Object.values(campos), id]);
  const F = 'familias_material_almoxarifado'; const M = 'materiais_almoxarifado';

  let injecoes = []; let rodadas = 0;
  const getOriginal = db.get.bind(db);
  db.get = function (sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    const s = String(sql).replace(/\s+/g, ' ').trim();
    const i = injecoes.findIndex((inj) => inj.sql.test(s));
    if (i >= 0) {
      const inj = injecoes[i]; injecoes.splice(i, 1);
      const ler = () => getOriginal(sql, params, (err, row) => {
        if (!inj.depois) { rodadas++; return cb(err, row); }
        inj.depois().then(() => { rodadas++; cb(err, row); }, (e) => cb(e));
      });
      if (inj.antes) return inj.antes().then(ler, (e) => cb(e));
      return ler();
    }
    return getOriginal(sql, params, cb);
  };
  const injetar = (...lista) => { injecoes = lista; rodadas = 0; };
  const conferirInjecao = (n) => {
    assert.strictEqual(injecoes.length, 0, `injecao nao consumida (teste vazio): ${injecoes.map((x) => x.sql).join(', ')}`);
    assert.strictEqual(rodadas, n, `injecoes rodadas ${rodadas}, esperado ${n}`);
  };

  /* ── RN-06d (B796): o ativo informado sem transicao ───────────────────────────────────── */
  await test('[RN-06d] PUT {ativo: 1} numa sub ativa, a sub e a raiz inativadas no meio -> 409, sub continua inativa', async () => {
    const R = await familia(); const S = await familia(1, R);
    injetar({ sql: SQL_SUBS_ATIVAS, depois: async () => { await set(F, S, { ativo: 0 })(); await set(F, R, { ativo: 0 })(); } });
    const r = await request(srv).put(`/api/almoxarifado/familias/${S}`).send({ nome: 'sub 06d', ativo: 1 });
    conferirInjecao(1);
    assert.strictEqual(r.status, 409, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_409_PUT);
    assert.strictEqual(Number((await fam(S)).ativo), 0, 'sub ativa sob raiz inativa');
  });

  await test('[RN-06d] PUT {ativo: 0} numa familia inativa, reativada com material no meio -> 409, continua ativa com o material', async () => {
    const X = await familia(0);
    injetar({ sql: SQL_SUBS_ATIVAS, depois: async () => { await set(F, X, { ativo: 1 })(); await material(X); } });
    const r = await request(srv).put(`/api/almoxarifado/familias/${X}`).send({ nome: 'x 06d', ativo: 0 });
    conferirInjecao(1);
    assert.strictEqual(r.status, 409, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(Number((await fam(X)).ativo), 1, 'familia inativa com material ativo');
  });

  await test('[RN-06d] metade positiva: sem janela, {ativo: 1} numa ativa e {ativo: 0} numa inativa gravam (200)', async () => {
    const R = await familia(); const S = await familia(1, R); const X = await familia(0);
    const a = await request(srv).put(`/api/almoxarifado/familias/${S}`).send({ nome: 'sub 06d ok', ativo: 1 });
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    const b = await request(srv).put(`/api/almoxarifado/familias/${X}`).send({ nome: 'x 06d ok', ativo: 0 });
    assert.strictEqual(b.status, 200, JSON.stringify(b.body));
    assert.strictEqual((await dbGet(db, 'SELECT nome FROM familias_material_almoxarifado WHERE id = ?', [X])).nome, 'x 06d ok');
  });

  /* ── RN-06e (B798): o par lido do material ─────────────────────────────────────────────── */
  await test('[RN-06e] PUT de material sem mexer na familia, outra aba o move F1 -> F2 e inativa F1 no meio -> 409 E4, fica em F2', async () => {
    const F1 = await familia(); const F2 = await familia(); const m = await material(F1);
    injetar({ sql: SQL_LER_MATERIAL, depois: async () => { await set(M, m.id, { familia_id: F2 })(); await set(F, F1, { ativo: 0 })(); } });
    const r = await request(srv).put(`/api/almoxarifado/materiais/${m.id}`).send({ nome: 'renomeado 06e', familia_id: F1 });
    conferirInjecao(1);
    assert.strictEqual(r.status, 409, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, E4(m.codigo));
    assert.strictEqual((await mat(m.id)).familia_id, F2);
  });

  await test('[RN-06e] o formulario manda (R, S1) lidos; outra aba move para (R, S2) e S1 vira raiz no meio -> 409 E4, par (R, S2)', async () => {
    const R = await familia(); const S1 = await familia(1, R); const S2 = await familia(1, R); const m = await material(R, S1);
    injetar({ sql: SQL_LER_MATERIAL, depois: async () => { await set(M, m.id, { subfamilia_id: S2 })(); await set(F, S1, { parent_id: null })(); } });
    const r = await request(srv).put(`/api/almoxarifado/materiais/${m.id}`).send({ nome: 'renomeado 06e2', familia_id: R, subfamilia_id: S1 });
    conferirInjecao(1);
    assert.strictEqual(r.status, 409, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, E4(m.codigo));
    const l = await mat(m.id);
    assert.strictEqual(l.familia_id, R); assert.strictEqual(l.subfamilia_id, S2);
  });

  await test('[RN-06e] metade positiva: sem janela, renomear repetindo o par grava (200)', async () => {
    const R = await familia(); const S1 = await familia(1, R); const m = await material(R, S1);
    const r = await request(srv).put(`/api/almoxarifado/materiais/${m.id}`).send({ nome: 'renomeado 06e ok', familia_id: R, subfamilia_id: S1 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await dbGet(db, 'SELECT nome FROM materiais_almoxarifado WHERE id = ?', [m.id])).nome, 'renomeado 06e ok');
  });

  /* ── RN-06f (B797): o "Inativar" que nao grava e nao pode dizer "ja inativa" ──────────── */
  await test('[RN-06f] Inativar a raiz, uma sub nasce e some na janela -> 409, a raiz continua ativa (nao "ja inativa")', async () => {
    const R = await familia(); let sub = null;
    injetar({ sql: SQL_ANTERIOR_FAMILIA, depois: async () => { sub = await familia(1, R); } },
      { sql: SQL_RELEITURA_SUBS_DELETE, antes: async () => { await set(F, sub, { ativo: 0 })(); } });
    const r = await request(srv).delete(`/api/almoxarifado/familias/${R}`);
    conferirInjecao(2);
    assert.strictEqual(r.status, 409, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_409_DEL);
    assert.strictEqual(Number((await fam(R)).ativo), 1);
    // metade positiva: clicar de novo inativa
    const r2 = await request(srv).delete(`/api/almoxarifado/familias/${R}`);
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.body));
    assert.strictEqual(r2.body.ja_inativo, undefined);
    assert.strictEqual(Number((await fam(R)).ativo), 0);
    // e a de verdade ja inativa continua respondendo "ja inativa"
    const r3 = await request(srv).delete(`/api/almoxarifado/familias/${R}`);
    assert.strictEqual(r3.status, 200, JSON.stringify(r3.body));
    assert.strictEqual(r3.body.ja_inativo, true);
  });

  srv.close();
  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
