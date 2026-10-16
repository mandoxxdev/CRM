/**
 * Etapa 124 (Fase 5, r2 I1; B803) — o `PUT /familias/:id` preserva `descricao` e `tipo_uso` OMITIDOS.
 *
 * Antes: omitidos, viravam NULL e 'ambos'. Nenhuma tela os omitia ate o Reativar da aba Familias (T6), que manda
 * `{nome, ativo: 1}` — reativar apagava a descricao e mudava o tipo de uso (o que distribui familia por setor,
 * `bulkAssignFamiliasPorTipo`). Informados, gravam como sempre (o Editar da aba manda os dois).
 *
 * Executar: cd server && node tests/api/familiaReativarPreserva.api.test.js
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

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  let seq = 0;
  const familia = async (parent = null, extra = {}) => {
    seq += 1;
    const id = (await dbRun(db, `INSERT INTO familias_material_almoxarifado (codigo, nome, parent_id, ativo, descricao, tipo_uso)
      VALUES (?, ?, ?, ?, ?, ?)`, [`P124-${seq}`, `Familia P124 ${seq}`, parent, extra.ativo ?? 1, extra.descricao ?? null,
      extra.tipo_uso ?? 'ambos'])).lastID;
    return { id, nome: `Familia P124 ${seq}` };
  };
  const put = (f, body) => as(ADM, () => request(app).put(`/api/almoxarifado/familias/${f.id}`).send(body));
  const linha = (f) => dbGet(db, 'SELECT nome, descricao, tipo_uso, ativo FROM familias_material_almoxarifado WHERE id = ?', [f.id]);

  await test('Reativar com o corpo da aba ({nome, ativo: 1}): 200, a descricao e o tipo de uso ficam', async () => {
    const R = await familia(null, { ativo: 0, descricao: 'Fixadores em geral', tipo_uso: 'industrial' });
    const S = await familia(R.id, { ativo: 0, descricao: 'Cabeca sextavada', tipo_uso: 'administrativo' });
    for (const f of [R, S]) {
      // eslint-disable-next-line no-await-in-loop
      const r = await put(f, { nome: f.nome, ativo: 1 });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    }
    assert.deepStrictEqual(await linha(R), { nome: R.nome, descricao: 'Fixadores em geral', tipo_uso: 'industrial', ativo: 1 });
    assert.deepStrictEqual(await linha(S), { nome: S.nome, descricao: 'Cabeca sextavada', tipo_uso: 'administrativo', ativo: 1 });
  });

  await test('so o nome (renomear pela API): 200, a descricao e o tipo de uso ficam', async () => {
    const F = await familia(null, { descricao: 'Antes', tipo_uso: 'industrial' });
    const r = await put(F, { nome: 'Renomeada P124' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await linha(F), { nome: 'Renomeada P124', descricao: 'Antes', tipo_uso: 'industrial', ativo: 1 });
  });

  await test('informados (o Editar da aba): gravam como sempre — descricao "" limpa, tipo_uso trocado', async () => {
    const F = await familia(null, { descricao: 'Antes', tipo_uso: 'industrial' });
    const r = await put(F, { nome: F.nome, descricao: '', tipo_uso: 'administrativo' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await linha(F), { nome: F.nome, descricao: null, tipo_uso: 'administrativo', ativo: 1 });
  });

  await test('informados: descricao null limpa; tipo_uso invalido vira "ambos" (o de sempre)', async () => {
    const F = await familia(null, { descricao: 'Antes', tipo_uso: 'industrial' });
    const r = await put(F, { nome: F.nome, descricao: null, tipo_uso: 'xyz' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await linha(F), { nome: F.nome, descricao: null, tipo_uso: 'ambos', ativo: 1 });
  });

  await test('a Auditoria do Reativar mostra a descricao e o tipo de uso intactos no "depois"', async () => {
    const F = await familia(null, { ativo: 0, descricao: 'Aud', tipo_uso: 'industrial' });
    const r = await put(F, { nome: F.nome, ativo: 1 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const log = await dbGet(db, `SELECT dados_novos FROM auditoria_log_almoxarifado WHERE entidade = 'familia' AND entidade_id = ?
      ORDER BY id DESC LIMIT 1`, [F.id]);
    const novos = JSON.parse(log.dados_novos);
    assert.deepStrictEqual([novos.descricao, novos.tipo_uso, novos.ativo], ['Aud', 'industrial', 1]);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
