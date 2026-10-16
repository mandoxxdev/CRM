/**
 * Etapa 125 (D (124) item 2, B807) — o `PUT /familias/:id` com o `nome` OMITIDO preserva o nome gravado, e o *Reativar* da aba
 * Familias passa a mandar so `{ativo: 1}` (RN-10..RN-11 do plano da Etapa 125).
 *
 * Antes: o *Reativar* mandava `{nome: <o da lista>, ativo: 1}` — se outro Administrador tinha renomeado a familia depois de a lista
 * carregar, o *Reativar* devolvia o nome antigo (medido na Fase 0: 200, "Nome velho"); e `{ativo: 1}` sem nome era 400 *"Nome e
 * obrigatorio"*.
 *
 * Executar: cd server && node tests/api/familiaReativarSemNome.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOX = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const L_NOME = 'Nome é obrigatório';
const L_PAI_INATIVO = 'Não é possível reativar: a família principal desta subfamília está inativa — reative a família principal antes';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  let seq = 0;
  const familia = async ({ parent = null, ativo = 0, descricao = 'desc', tipo_uso = 'industrial' } = {}) => {
    seq += 1;
    const id = (await dbRun(db, `INSERT INTO familias_material_almoxarifado (codigo, nome, parent_id, ativo, descricao, tipo_uso)
      VALUES (?, ?, ?, ?, ?, ?)`, [`R125-${seq}`, `Familia R125 ${seq}`, parent, ativo, descricao, tipo_uso])).lastID;
    return { id, nome: `Familia R125 ${seq}` };
  };
  const put = (u, id, body) => as(u, () => request(app).put(`/api/almoxarifado/familias/${id}`).send(body));
  const linha = (id) => dbGet(db, 'SELECT nome, ativo, descricao, tipo_uso FROM familias_material_almoxarifado WHERE id = ?', [id]);

  await test('[RN-10] {ativo: 1} sem nome numa inativa -> 200; nome, descricao e tipo de uso como estavam', async () => {
    const f = await familia();
    const r = await put(ADM, f.id, { ativo: 1 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await linha(f.id), { nome: f.nome, ativo: 1, descricao: 'desc', tipo_uso: 'industrial' });
  });

  await test('[RN-10] renomeada por outro Administrador depois de a lista carregar: o Reativar sem nome mantem o nome NOVO', async () => {
    const f = await familia();
    let r = await put(SUPER, f.id, { nome: 'Nome novo do outro', descricao: 'desc', tipo_uso: 'industrial' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    r = await put(ADM, f.id, { ativo: 1 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(f.id)).nome, 'Nome novo do outro');
    assert.strictEqual(r.body.nome, 'Nome novo do outro', 'a resposta devolve a linha relida');
  });

  await test('[RN-10] a Auditoria da reativacao: EDICAO com ativo 0 -> 1 e o nome igual nos dois lados', async () => {
    const f = await familia();
    const r = await put(ADM, f.id, { ativo: 1 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const log = await dbGet(db, `SELECT acao, dados_anteriores, dados_novos FROM auditoria_log_almoxarifado
      WHERE entidade = 'familia' AND entidade_id = ? ORDER BY id DESC LIMIT 1`, [f.id]);
    assert.ok(log, 'sem linha de auditoria');
    assert.strictEqual(log.acao, 'EDICAO');
    const de = JSON.parse(log.dados_anteriores); const para = JSON.parse(log.dados_novos);
    assert.deepStrictEqual([de.ativo, para.ativo, de.nome, para.nome], [0, 1, f.nome, f.nome]);
  });

  await test('[RN-11] nome informado vazio, so espacos, null ou nao texto -> 400 "Nome é obrigatório", nada gravado', async () => {
    const f = await familia();
    for (const nome of ['', '   ', null, 5]) { // 5: Fase 5, r1 M3 (era 500)
      const r = await put(ADM, f.id, { nome, ativo: 1 });
      assert.strictEqual(r.status, 400, `nome ${JSON.stringify(nome)}: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, L_NOME);
    }
    assert.strictEqual((await linha(f.id)).ativo, 0);
  });

  await test('[RN-11] nome informado grava (o Editar continua igual)', async () => {
    const f = await familia({ ativo: 1 });
    const r = await put(ADM, f.id, { nome: '  Renomeada  ', descricao: 'd2', tipo_uso: 'administrativo' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await linha(f.id), { nome: 'Renomeada', ativo: 1, descricao: 'd2', tipo_uso: 'administrativo' });
  });

  await test('[RN-11] subfamilia de familia principal inativa, sem nome -> a recusa da reativacao de sempre', async () => {
    const raiz = await familia();
    const sub = await familia({ parent: raiz.id });
    const r = await put(ADM, sub.id, { ativo: 1 });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, L_PAI_INATIVO);
    assert.strictEqual((await linha(sub.id)).ativo, 0);
  });

  await test('[RN-11] o Almoxarife sem nome -> 403, nada gravado', async () => {
    const f = await familia();
    const r = await put(ALMOX, f.id, { ativo: 1 });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual((await linha(f.id)).ativo, 0);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
