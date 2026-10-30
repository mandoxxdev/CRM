/**
 * Etapa 192 (Compras) Fase 5, X3 — a corrida do CPF x CNPJ no PUT do fornecedor (RN-192.03: um ou outro, nao os dois).
 *
 * O bug: o PUT lia o cpf/cnpj gravados (SELECT) e gravava (UPDATE) em dois comandos. Dois PUTs juntos — um poe o CPF, o
 * outro poe o CNPJ sem mandar a chave cpf (o modal do grupo faz assim) — passavam os dois pela conferencia e o fornecedor
 * ficava com CPF e CNPJ (sonda da revisao: varias rodadas de 30).
 *
 * Correcao: a exclusividade vai tambem no WHERE do proprio UPDATE (como a do grupo ativo da Etapa 109): quem grava so um dos
 * dois exige no comando que o outro esteja vazio. Quando o comando nao grava e o fornecedor existe, 400 com a mesma literal.
 *
 * Como prova sem sleep: `db.get` embrulhado roda a acao concorrente ENTRE a leitura do cpf/cnpj e o UPDATE (molde:
 * comprasGrupoDesativadoCorrida.api.test.js, Etapa 109), e a corrida real pela rota (Promise.all) nunca deixa os dois.
 *
 * Executar: cd server && node tests/api/comprasFornecedorCpfCnpjCorrida.api.test.js
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
const CPF_E_CNPJ = 'Preencha o CPF ou o CNPJ, não os dois.';
const CPF = '529.982.247-25';
const CNPJ = '11.222.333/0001-81';
const RODADAS = 20;

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  const forn = async (razao, { cpf = null, cnpj = null } = {}) =>
    (await dbRun(db, "INSERT INTO fornecedores (razao_social, status, cpf, cnpj) VALUES (?, 'ativo', ?, ?)", [razao, cpf, cnpj])).lastID;
  const ler = (id) => dbGet(db, 'SELECT razao_social, cpf, cnpj FROM fornecedores WHERE id = ?', [id]);

  let injetar = null; let injetado = false;
  const getOriginal = db.get.bind(db);
  db.get = function (sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    if (injetar && /SELECT cnpj, cpf FROM fornecedores WHERE id = \?/.test(String(sql))) {
      const acao = injetar; injetar = null;
      return getOriginal(sql, params, (err, row) => {
        acao().then(() => { injetado = true; cb(err, row); }, (e) => cb(e));
      });
    }
    return getOriginal(sql, params, cb);
  };

  await test('PUT so com cnpj; o CPF gravado entre a conferencia e o UPDATE -> 400 a literal, nada gravado', async () => {
    const id = await forn('JANELA CNPJ');
    injetar = () => dbRun(db, 'UPDATE fornecedores SET cpf = ? WHERE id = ?', [CPF, id]); injetado = false;
    const r = await request(app).put(`/api/compras/fornecedores/${id}`).send({ razao_social: 'Janela renomeado', cnpj: CNPJ });
    assert.ok(injetado, 'a injecao nao rodou (teste vazio)');
    assert.deepStrictEqual([r.status, r.body.error], [400, CPF_E_CNPJ], JSON.stringify(r.body));
    assert.deepStrictEqual({ ...(await ler(id)) }, { razao_social: 'JANELA CNPJ', cpf: CPF, cnpj: null });
  });

  await test('PUT so com cpf; o CNPJ gravado entre a conferencia e o UPDATE -> 400 a literal, nada gravado', async () => {
    const id = await forn('JANELA CPF');
    injetar = () => dbRun(db, 'UPDATE fornecedores SET cnpj = ? WHERE id = ?', [CNPJ, id]); injetado = false;
    const r = await request(app).put(`/api/compras/fornecedores/${id}`).send({ razao_social: 'JANELA CPF', cpf: CPF });
    assert.ok(injetado, 'a injecao nao rodou (teste vazio)');
    assert.deepStrictEqual([r.status, r.body.error], [400, CPF_E_CNPJ], JSON.stringify(r.body));
    assert.deepStrictEqual({ ...(await ler(id)) }, { razao_social: 'JANELA CPF', cpf: null, cnpj: CNPJ });
  });

  await test('PUT so com cnpj; o fornecedor apagado na janela -> 404', async () => {
    const id = await forn('JANELA APAGADO');
    injetar = () => dbRun(db, 'DELETE FROM fornecedores WHERE id = ?', [id]); injetado = false;
    const r = await request(app).put(`/api/compras/fornecedores/${id}`).send({ razao_social: 'X', cnpj: CNPJ });
    assert.ok(injetado, 'a injecao nao rodou (teste vazio)');
    assert.deepStrictEqual([r.status, r.body.error], [404, 'Fornecedor não encontrado']);
  });

  await test('limpar o cpf e por o cnpj no mesmo PUT continua valendo (o WHERE so entra quando a chave do outro falta)', async () => {
    const id = await forn('TROCA', { cpf: CPF });
    const r = await request(app).put(`/api/compras/fornecedores/${id}`).send({ razao_social: 'TROCA', cpf: '', cnpj: CNPJ });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual({ ...(await ler(id)) }, { razao_social: 'TROCA', cpf: null, cnpj: CNPJ });
  });

  await test(`corrida real (${RODADAS} rodadas): PUT com cpf x PUT com cnpj sem a chave cpf -> nunca os dois`, async () => {
    let ambos = 0;
    for (let i = 0; i < RODADAS; i++) {
      const id = await forn(`RACE ${i}`);
      const rs = await Promise.all([
        request(app).put(`/api/compras/fornecedores/${id}`).send({ razao_social: 'RACE', cpf: CPF, cnpj: '' }),
        request(app).put(`/api/compras/fornecedores/${id}`).send({ razao_social: 'RACE', cnpj: CNPJ }),
      ]);
      const f = await ler(id);
      if (f.cpf && f.cnpj) ambos++;
      for (const r of rs) assert.ok(r.status === 200 || (r.status === 400 && r.body.error === CPF_E_CNPJ), JSON.stringify(r.body));
    }
    assert.strictEqual(ambos, 0, `${ambos}/${RODADAS} com CPF e CNPJ`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
