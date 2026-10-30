/**
 * Etapa 124 (T4) — integracao que cruza os galhos: o par familia/subfamilia lido pelo formulario (D (123), T1) e a recusa
 * que manda reativar a familia (C231, T2), seguida ate o ultimo gesto com os corpos que as telas mandam (T3, T6).
 *
 * (i) PELA ROTA, de ponta a ponta: familias e material cadastrados pelas rotas; duas "abas" no mesmo material; a requisicao,
 * o Inativar do material e das familias pelas rotas; a recusa; a reativacao na ordem da frase; a aprovacao.
 * (ii) PELO SERVICO: `materialService.familiaDesfeita` e as mensagens de `requisicaoMaterialInativo`.
 *
 * Executar: cd server && node tests/api/familiaLidaIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
// Etapa 193 (RN-193.02): PUT, DELETE e foto de /api/almoxarifado/materiais recusam para todos por padrao (o cadastro e so do
// Compras). Este arquivo prova o handler e as guardas que ficam ATRAS da recusa pela porta do almoxarifado (os perfis do
// almoxarifado, as guardas de estoque de quem pode), com a chave de reversao ligada (`ALMOX_CADASTRO_MATERIAL=liberado`,
// services/compras/cadastroDeMaterial.js) — sem ela nenhum desses gestos tem porta (letra C). A recusa: cadastroSoNoCompras.
process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const materialService = require('../../services/almoxarifado/materialService');
const materialInativo = require('../../services/almoxarifado/requisicaoMaterialInativo');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOX = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };

const CAUDA = ' foi mudada por outra pessoa depois que você abriu o cadastro — salvar desfaria essa mudança, e nada foi '
  + 'gravado. Recarregue o material e salve de novo.';
const QUEM = '(Administrador, Almoxarife ou Engenharia)';
const REATIVE_F = (quais) => `Reative ${quais} em Configurações → Famílias (Administrador do almoxarifado) e depois o material `
  + `em Materiais → Inativos ${QUEM}`;

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES ('aprovacao_automatica', '0')
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`);

  /** O payload que o formulario monta a partir do GET (handleSubmit): o par do form e o `familia_lida` do carregado. */
  const abrirFormulario = async (id) => {
    const r = await as(ALMOX, () => request(app).get(`/api/almoxarifado/materiais/${id}`));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const m = r.body;
    return {
      form: { nome: m.nome, familia_id: m.familia_id || null, subfamilia_id: m.subfamilia_id || null },
      familia_lida: { familia_id: m.familia_id ? Number(m.familia_id) : null, subfamilia_id: m.subfamilia_id ? Number(m.subfamilia_id) : null },
    };
  };
  const putMaterial = (u, id, body) => as(u, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send(body));

  console.log('\n(i) pela rota');

  await test('duas abas, o 409 da subfamilia, recarregar e salvar; depois a C231 seguida ate aprovar', async () => {
    // familias e material pelas rotas
    const novaFam = async (body) => {
      const r = await request(app).post('/api/almoxarifado/familias').send(body);
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      return { id: r.body.id, nome: body.nome };
    };
    const R = await novaFam({ nome: 'Integra 124', codigo: 'I124' });
    const S1 = await novaFam({ nome: 'Integra 124 A', codigo: 'I124A', parent_id: R.id });
    const S2 = await novaFam({ nome: 'Integra 124 B', codigo: 'I124B', parent_id: R.id });
    const cm = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: 'I124-001', nome: 'Junta 124', familia_id: R.id, subfamilia_id: S1.id, categoria: 'CONSUMÍVEL' });
    assert.strictEqual(cm.status, 201, JSON.stringify(cm.body));
    const id = cm.body.id;

    // aba A abre; aba B abre, troca para S2 e salva (200)
    const abaA = await abrirFormulario(id);
    const abaB = await abrirFormulario(id);
    let r = await putMaterial(ALMOX, id, { ...abaB.form, subfamilia_id: S2.id, familia_lida: abaB.familia_lida });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    // aba A renomeia com o que mostrava -> 409, S2 continua
    r = await putMaterial(ALMOX, id, { ...abaA.form, nome: 'Junta renomeada', familia_lida: abaA.familia_lida });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `A subfamília do material I124-001${CAUDA}`);
    let row = await dbGet(db, 'SELECT nome, subfamilia_id FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.deepStrictEqual([row.nome, row.subfamilia_id], ['Junta 124', S2.id]);
    // recarrega e salva -> 200, com a S2
    const abaA2 = await abrirFormulario(id);
    r = await putMaterial(ALMOX, id, { ...abaA2.form, nome: 'Junta renomeada', familia_lida: abaA2.familia_lida });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    row = await dbGet(db, 'SELECT nome, subfamilia_id FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.deepStrictEqual([row.nome, row.subfamilia_id], ['Junta renomeada', S2.id]);

    // a requisicao pendente; o Inativar do material (zerado) e das familias pelas rotas
    const cr = await request(app).post('/api/almoxarifado/requisicoes')
      .send({ os_referencia: 'OS-I124', itens: [{ material_id: id, quantidade: 1 }] });
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    const req0 = cr.body;
    r = await as(ALMOX, () => request(app).delete(`/api/almoxarifado/materiais/${id}`));
    assert.strictEqual(r.status, 200, `inativar material: ${JSON.stringify(r.body)}`);
    for (const f of [S1, S2, R]) {
      // eslint-disable-next-line no-await-in-loop
      r = await request(app).delete(`/api/almoxarifado/familias/${f.id}`);
      assert.strictEqual(r.status, 200, `inativar familia ${f.nome}: ${JSON.stringify(r.body)}`);
    }

    // a recusa nomeia as duas
    r = await as(ADM, () => request(app).put(`/api/almoxarifado/requisicoes/${req0.id}/aprovar`).send({}));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `A requisição ${req0.numero} tem material inativo: I124-001. `
      + `${REATIVE_F('a família e a subfamília de I124-001')} ou rejeite a requisição.`);

    // a aba Familias (T6) lista as inativas: o GET que ela faz
    r = await as(ADM, () => request(app).get('/api/almoxarifado/familias?ativo=all'));
    const ids = r.body.filter((f) => Number(f.ativo) !== 1).map((f) => f.id);
    assert.ok([R.id, S2.id].every((x) => ids.includes(x)), 'a aba nao veria as inativas');

    // seguir a frase: a subfamilia antes da raiz recusa (a literal da 105) ...
    r = await as(ADM, () => request(app).put(`/api/almoxarifado/familias/${S2.id}`).send({ nome: S2.nome, ativo: 1 }));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Não é possível reativar: a família principal desta subfamília está inativa — reative a família principal antes');
    // ... a raiz, depois a sub (o corpo do Reativar da aba), depois o material (o corpo do Reativar da tela)
    for (const f of [R, S2]) {
      // eslint-disable-next-line no-await-in-loop
      r = await as(ADM, () => request(app).put(`/api/almoxarifado/familias/${f.id}`).send({ nome: f.nome, ativo: 1 }));
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    }
    r = await putMaterial(ALMOX, id, { ativo: 1 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    r = await as(ADM, () => request(app).put(`/api/almoxarifado/requisicoes/${req0.id}/aprovar`).send({}));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });

  console.log('\n(ii) pelo servico');

  await test('materialService.familiaDesfeita e a mensagem', async () => {
    const g = { familia_id: 1, subfamilia_id: 2 };
    assert.strictEqual(materialService.familiaDesfeita({ familia_id: 1, subfamilia_id: 3 }, g, { familia_id: 1, subfamilia_id: 3 }), 'subfamilia');
    assert.strictEqual(materialService.familiaDesfeita({ familia_id: 9, subfamilia_id: 3 }, g, { familia_id: 9, subfamilia_id: 3 }), 'familia');
    assert.strictEqual(materialService.familiaDesfeita({ familia_id: 1, subfamilia_id: 3 }, g, g), null);
    assert.strictEqual(materialService.familiaDesfeita(undefined, g, { familia_id: 9 }), null);
    assert.strictEqual(materialService.familiaDesfeita({ subfamilia_id: null }, g, { familia_id: 1, subfamilia_id: null }), 'subfamilia');
    assert.strictEqual(materialService.mensagemFamiliaMudadaPorOutro('X-1', 'familia'), `A família do material X-1${CAUDA}`);
  });

  await test('requisicaoMaterialInativo: as variantes de aprovar e separar', async () => {
    const fam = [['a família', ['A1', 'A2']], ['a subfamília', ['B1']]];
    assert.strictEqual(materialInativo.mensagemAprovar('R-1', ['A1', 'A2', 'B1', 'C1'], { familias: fam }),
      `A requisição R-1 tem material inativo: A1, A2, B1, C1. ${REATIVE_F('a família de A1, A2 e a subfamília de B1')} `
      + 'ou rejeite a requisição.');
    assert.strictEqual(materialInativo.mensagemAprovar('R-1', ['C1']),
      `A requisição R-1 tem material inativo: C1. Reative o material em Materiais → Inativos ${QUEM} ou rejeite a requisição.`);
    assert.strictEqual(materialInativo.mensagemSeparar('Junta', 3),
      `Junta: material inativo não pode ser separado. ${REATIVE_F('a família e a subfamília do material')} `
      + 'ou separe os outros itens com 0 neste.');
    assert.deepStrictEqual(materialInativo.gruposFamiliaInativa([
      { material_ativo: 0, material_codigo: 'Z', quantidade_solicitada: 1, quantidade_entregue: 0, material_familia_inativa: 2 },
      { material_ativo: 1, material_codigo: 'Y', quantidade_solicitada: 1, quantidade_entregue: 0, material_familia_inativa: 1 },
    ]), [['a subfamília', ['Z']]]);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
