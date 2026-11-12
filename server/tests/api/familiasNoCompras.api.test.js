/**
 * Etapa 211 (Compras) T1 — RN-211.01, RN-211.02 e RN-211.04: famílias e subfamílias cadastradas no Compras.
 *
 *  - RN-211.01: `POST /api/compras/materiais/familias`, `PUT` e `DELETE .../:id` gravam com as MESMAS regras do almoxarifado
 *    (handlers compartilhados) para o administrador do módulo Compras e os administradores do sistema; a auditoria grava a pessoa.
 *  - RN-211.02: as gravações de família do almoxarifado recusam para TODOS (403 literal, nada gravado); a chave
 *    `ALMOX_CADASTRO_MATERIAL=liberado` devolve o portão de antes.
 *  - RN-211.04: quem não administra o Compras recebe o 403 da porta do cadastro.
 *  - Itens da família pelo Compras: `GET /api/compras/materiais/aux/familias/:id/itens`.
 *
 * Executar: cd server && node tests/api/familiasNoCompras.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const MSG_FAMILIAS_NO_COMPRAS = 'O cadastro de famílias é feito em Compras → Famílias.';
const LITERAL_403 = 'Sem permissão para esta operação';
const MSG_ADMIN_ALMOX = 'Acesso restrito — administrador do Almoxarifado ou Super Administrador';

const SUPER = { id: 1, nome: 'Super', role: 'usuario', is_superadmin: 1, email: 'super@test.com' };
const ROLE_ADMIN = { id: 2, nome: 'Admin do sistema', role: 'admin', email: 'admin@test.com' };
const ADMIN_COMPRAS = { id: 3, nome: 'Chefe de Compras', role: 'usuario', admin_modulos: ['compras'], email: 'chefe@test.com' };
const ALMOXARIFE = { id: 4, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };
const ADMIN_PERFIL_ALMOX = { id: 6, nome: 'Adm Almox', role: 'usuario', perfil_almoxarifado: 'ADMINISTRADOR', email: 'aa@test.com' };
const ADMIN_MODULO_ALMOX = { id: 7, nome: 'Adm Modulo Almox', role: 'usuario', admin_modulos: ['almoxarifado'], email: 'am@test.com' };

(async () => {
  delete process.env.ALMOX_CADASTRO_MATERIAL;
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); return fn(); };
  const familia = (id) => dbGet(db, 'SELECT nome, descricao, ativo, parent_id FROM familias_material_almoxarifado WHERE id = ?', [id]);
  const total = async () => (await dbGet(db, 'SELECT COUNT(*) AS c FROM familias_material_almoxarifado')).c;

  // ── RN-211.01 ─────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-211.01] o admin do Compras cria familia e subfamilia, edita, inativa e reativa pelo Compras; auditoria com a pessoa', async () => {
    const r1 = await as(ADMIN_COMPRAS, () => request(app).post('/api/compras/materiais/familias')
      .send({ nome: 'Parafusos', codigo: 'PAF', tipo_uso: 'industrial' }));
    assert.strictEqual(r1.status, 201, JSON.stringify(r1.body));
    const RAIZ = r1.body.id;
    const r2 = await as(ADMIN_COMPRAS, () => request(app).post('/api/compras/materiais/familias')
      .send({ nome: 'Sextavados', parent_id: RAIZ }));
    assert.strictEqual(r2.status, 201, JSON.stringify(r2.body));
    const SUB = r2.body.id;
    assert.strictEqual((await familia(SUB)).parent_id, RAIZ);

    const r3 = await as(ADMIN_COMPRAS, () => request(app).put(`/api/compras/materiais/familias/${SUB}`)
      .send({ nome: 'Sextavados inox', descricao: 'M6 a M12', tipo_uso: 'ambos',
        campos_lidos: { nome: 'Sextavados', tipo_uso: 'ambos', descricao: null } }));
    assert.strictEqual(r3.status, 200, JSON.stringify(r3.body));
    const r4 = await as(ADMIN_COMPRAS, () => request(app).delete(`/api/compras/materiais/familias/${SUB}`));
    assert.strictEqual(r4.status, 200, JSON.stringify(r4.body));
    assert.strictEqual((await familia(SUB)).ativo, 0);
    const r5 = await as(ADMIN_COMPRAS, () => request(app).put(`/api/compras/materiais/familias/${SUB}`).send({ ativo: 1 }));
    assert.strictEqual(r5.status, 200, JSON.stringify(r5.body));
    assert.deepStrictEqual(await familia(SUB), { nome: 'Sextavados inox', descricao: 'M6 a M12', ativo: 1, parent_id: RAIZ });

    const aud = await dbAll(db, `SELECT acao, usuario_id FROM auditoria_log_almoxarifado WHERE entidade = 'familia' AND entidade_id IN (?, ?)
      ORDER BY id`, [RAIZ, SUB]);
    assert.ok(aud.length >= 4, `auditoria: ${JSON.stringify(aud)}`);
    assert.ok(aud.every((a) => a.usuario_id === ADMIN_COMPRAS.id), `a auditoria grava a pessoa de verdade: ${JSON.stringify(aud)}`);
  });

  await test('[RN-211.01] as regras de sempre valem pelo Compras: sem nome -> 400; inativar raiz com subfamilia ativa -> 400', async () => {
    const r = await as(ADMIN_COMPRAS, () => request(app).post('/api/compras/materiais/familias').send({ nome: '  ' }));
    assert.deepStrictEqual([r.status, r.body.error], [400, 'Nome é obrigatório']);
    const RAIZ = (await as(ADMIN_COMPRAS, () => request(app).post('/api/compras/materiais/familias').send({ nome: 'Raiz R2' }))).body.id;
    await as(ADMIN_COMPRAS, () => request(app).post('/api/compras/materiais/familias').send({ nome: 'Filha R2', parent_id: RAIZ }));
    const d = await as(ADMIN_COMPRAS, () => request(app).delete(`/api/compras/materiais/familias/${RAIZ}`));
    assert.strictEqual(d.status, 400, JSON.stringify(d.body));
    assert.strictEqual((await familia(RAIZ)).ativo, 1);
  });

  await test('[RN-211.01] os administradores do sistema (superadmin e role admin) tambem gravam pelo Compras', async () => {
    for (const u of [SUPER, ROLE_ADMIN]) {
      const r = await as(u, () => request(app).post('/api/compras/materiais/familias').send({ nome: `Familia de ${u.nome}` }));
      assert.strictEqual(r.status, 201, `${u.nome}: ${JSON.stringify(r.body)}`);
    }
  });

  // ── RN-211.04 ─────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-211.04] quem nao administra o Compras (almoxarife, perfil e modulo do almoxarifado) -> 403 da porta, nada gravado', async () => {
    const ALVO = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('ALV','Alvo',1)")).lastID;
    const antes = await total();
    for (const u of [ALMOXARIFE, ADMIN_PERFIL_ALMOX, ADMIN_MODULO_ALMOX]) {
      for (const [nome, fn] of [
        ['POST', () => request(app).post('/api/compras/materiais/familias').send({ nome: 'Nao entra' })],
        ['PUT', () => request(app).put(`/api/compras/materiais/familias/${ALVO}`).send({ nome: 'Mudado' })],
        ['DELETE', () => request(app).delete(`/api/compras/materiais/familias/${ALVO}`)],
      ]) {
        const r = await as(u, fn);
        assert.deepStrictEqual([r.status, r.body.error], [403, LITERAL_403], `${u.nome} ${nome}: ${JSON.stringify(r.body)}`);
      }
    }
    assert.strictEqual(await total(), antes);
    assert.deepStrictEqual(await familia(ALVO), { nome: 'Alvo', descricao: null, ativo: 1, parent_id: null });
  });

  // ── RN-211.02 ─────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-211.02] POST, PUT e DELETE de familia pelo almoxarifado -> 403 literal para todos; nada gravado', async () => {
    const ALVO = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('AL2','Alvo 2',1)")).lastID;
    const antes = await total();
    for (const u of [SUPER, ROLE_ADMIN, ADMIN_PERFIL_ALMOX, ADMIN_MODULO_ALMOX, ADMIN_COMPRAS]) {
      for (const [nome, fn] of [
        ['POST', () => request(app).post('/api/almoxarifado/familias').send({ nome: 'Nao entra' })],
        ['PUT', () => request(app).put(`/api/almoxarifado/familias/${ALVO}`).send({ nome: 'Mudado' })],
        ['DELETE', () => request(app).delete(`/api/almoxarifado/familias/${ALVO}`)],
      ]) {
        const r = await as(u, fn);
        assert.deepStrictEqual([r.status, r.body.error], [403, MSG_FAMILIAS_NO_COMPRAS], `${u.nome} ${nome}: ${JSON.stringify(r.body)}`);
      }
    }
    assert.strictEqual(await total(), antes);
    assert.deepStrictEqual(await familia(ALVO), { nome: 'Alvo 2', descricao: null, ativo: 1, parent_id: null });
  });

  await test('[RN-211.02] a leitura de familias pelo almoxarifado continua (lista e itens)', async () => {
    const r = await as(ALMOXARIFE, () => request(app).get('/api/almoxarifado/familias?ativo=all'));
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.some((f) => f.nome === 'Parafusos'), 'a familia criada pelo Compras aparece no almoxarifado');
  });

  await test('[RN-211.02] com a chave ALMOX_CADASTRO_MATERIAL=liberado o portao de antes volta (admin do almoxarifado grava; Compras nao)', async () => {
    process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
    try {
      const ok = await as(ADMIN_MODULO_ALMOX, () => request(app).post('/api/almoxarifado/familias').send({ nome: 'Pela chave' }));
      assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
      const nao = await as(ADMIN_COMPRAS, () => request(app).post('/api/almoxarifado/familias').send({ nome: 'Compras pelo almox' }));
      assert.deepStrictEqual([nao.status, nao.body.error], [403, MSG_ADMIN_ALMOX]);
    } finally { delete process.env.ALMOX_CADASTRO_MATERIAL; }
  });

  // ── itens pela porta do Compras ──────────────────────────────────────────────────────────────────
  await test('[RN-211.01] GET dos itens da familia pelo Compras: o material da subfamilia aparece na sub e na raiz', async () => {
    const RAIZ = (await as(ADMIN_COMPRAS, () => request(app).post('/api/compras/materiais/familias').send({ nome: 'Raiz itens' }))).body.id;
    const SUB = (await as(ADMIN_COMPRAS, () => request(app).post('/api/compras/materiais/familias').send({ nome: 'Sub itens', parent_id: RAIZ }))).body.id;
    await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, categoria, familia_id, subfamilia_id, ativo, quantidade_atual)
      VALUES ('IT-1', 'Item da sub', 'PC', 'OUTROS', ?, ?, 1, 0)`, [RAIZ, SUB]);
    for (const id of [SUB, RAIZ]) {
      const r = await as(ADMIN_COMPRAS, () => request(app).get(`/api/compras/materiais/aux/familias/${id}/itens`));
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.deepStrictEqual(r.body.map((m) => m.codigo), ['IT-1']);
    }
    const nao = await as(ALMOXARIFE, () => request(app).get(`/api/compras/materiais/aux/familias/${SUB}/itens`));
    assert.strictEqual(nao.status, 403, 'a leitura da tela do cadastro e de quem cadastra (porta leitura)');
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
