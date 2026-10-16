/**
 * Etapa 126 (T4, integracao) — o *Editar* da aba Familias com os campos lidos, de ponta a ponta: (i) PELA ROTA, dois Administradores
 * com a aba aberta (a criacao, a leitura da lista, o corpo da tela, o 409, a releitura, o Inativar e o Reativar); (ii) PELO SERVICO, as
 * funcoes do contrato direto.
 *
 * Executar: cd server && node tests/api/familiaCamposLidosIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbGet } = require('../../services/almoxarifado/db');
const svc = require('../../services/almoxarifado/familiaCamposLidos');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM_A = { id: 4, nome: 'Adm A', role: 'user', email: 'a@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ADM_B = { id: 6, nome: 'Adm B', role: 'user', email: 'b@test.com', admin_modulos: '["almoxarifado"]' };

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  // A aba: le a lista e monta o corpo do Editar como `TabFamilias.handleSalvar` (o formulario preenchido da lista, os lidos crus).
  const abrirAba = async (u, id) => {
    const r = await as(u, () => request(app).get('/api/almoxarifado/familias?ativo=all'));
    assert.strictEqual(r.status, 200);
    const fam = r.body.find((f) => f.id === id);
    const lidos = { nome: fam.nome ?? null, tipo_uso: fam.tipo_uso ?? null, descricao: fam.descricao ?? null };
    const form = { nome: fam.nome, descricao: fam.descricao || '', tipo_uso: fam.tipo_uso || 'ambos' };
    return {
      salvar: (mudancas) => as(u, () => request(app).put(`/api/almoxarifado/familias/${id}`)
        .send({ ...form, ...mudancas, campos_lidos: lidos })),
    };
  };
  const linha = (id) => dbGet(db, 'SELECT nome, descricao, tipo_uso, ativo FROM familias_material_almoxarifado WHERE id = ?', [id]);

  await test('[T4 (i) pela rota] B muda a descricao; A renomeia com a aba velha -> 409; A rele e salva; Inativar e Reativar', async () => {
    const criada = await as(ADM_A, () => request(app).post('/api/almoxarifado/familias')
      .send({ nome: 'Rolamentos T4', descricao: 'original', tipo_uso: 'industrial', codigo: 'RT4' }));
    assert.ok([200, 201].includes(criada.status), JSON.stringify(criada.body));
    const id = criada.body.id;
    assert.ok(id, 'sem id na criacao');
    const codigo = (await dbGet(db, 'SELECT codigo FROM familias_material_almoxarifado WHERE id = ?', [id])).codigo;

    const abaA = await abrirAba(ADM_A, id);
    const abaB = await abrirAba(ADM_B, id);
    let r = await abaB.salvar({ descricao: 'descricao de B' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));

    r = await abaA.salvar({ nome: 'Rolamentos de A' });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, svc.mensagemCamposFamiliaMudadosPorOutro(false, codigo, ['Descrição']));
    assert.strictEqual(r.body.error, `O campo "Descrição" da família ${codigo} foi mudado por outra pessoa depois que você abriu a edição — `
      + 'salvar desfaria essa mudança, e nada foi gravado. Recarregue a lista e edite de novo.');
    assert.deepStrictEqual(await linha(id), { nome: 'Rolamentos T4', descricao: 'descricao de B', tipo_uso: 'industrial', ativo: 1 });

    // o segundo salvar com a mesma aba (os mesmos lidos) -> 409 de novo (Fase 2, I2)
    r = await abaA.salvar({ nome: 'Rolamentos de A' });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));

    const abaA2 = await abrirAba(ADM_A, id);
    r = await abaA2.salvar({ nome: 'Rolamentos de A' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await linha(id), { nome: 'Rolamentos de A', descricao: 'descricao de B', tipo_uso: 'industrial', ativo: 1 });

    r = await as(ADM_B, () => request(app).delete(`/api/almoxarifado/familias/${id}`));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    r = await as(ADM_A, () => request(app).put(`/api/almoxarifado/familias/${id}`).send({ ativo: 1 }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await linha(id), { nome: 'Rolamentos de A', descricao: 'descricao de B', tipo_uso: 'industrial', ativo: 1 });
  });

  await test('[T4 (ii) pelo servico] camposDesfeitosFamilia, a forma e a mensagem', async () => {
    const gravado = { nome: 'Legado', tipo_uso: 'ambos', descricao: null };
    // o legado normalizado: lido "  Legado  "/NULL = gravado "Legado"/"ambos" (Fase 2, I1)
    assert.deepStrictEqual(svc.camposDesfeitosFamilia({ nome: '  Legado  ', tipo_uso: null, descricao: '' }, gravado,
      { nome: 'Novo', tipo_uso: 'industrial', descricao: 'x' }), []);
    assert.deepStrictEqual(svc.camposDesfeitosFamilia({ nome: 'Velho', tipo_uso: 'industrial', descricao: 'd' }, gravado,
      { nome: 'Novo', tipo_uso: 'administrativo', descricao: 'y' }), ['Nome', 'Tipo de uso', 'Descrição']);
    // o que gravaria = gravado (digitou o mesmo): nada a desfazer
    assert.deepStrictEqual(svc.camposDesfeitosFamilia({ nome: 'Velho' }, gravado, { nome: 'Legado' }), []);
    assert.deepStrictEqual(svc.camposDesfeitosFamilia(null, gravado, gravado), []);
    assert.strictEqual(svc.camposLidosFamiliaInvalidos(undefined), false);
    for (const v of [null, [], 'x', 3, { nome: {} }, { nome: [] }]) assert.strictEqual(svc.camposLidosFamiliaInvalidos(v), true, JSON.stringify(v));
    assert.strictEqual(svc.camposLidosFamiliaInvalidos({ nome: 'a', tipo_uso: null, descricao: 3, x: true }), false);
    assert.strictEqual(svc.mensagemCamposFamiliaMudadosPorOutro(true, 'ROL-ESF', ['Nome', 'Descrição']),
      'Os campos "Nome" e "Descrição" da subfamília ROL-ESF foram mudados por outra pessoa depois que você abriu a edição — salvar '
      + 'desfaria essas mudanças, e nada foi gravado. Recarregue a lista e edite de novo.');
    assert.strictEqual(svc.mensagemCamposFamiliaMudadosPorOutro(false, 'ROL', ['Nome', 'Tipo de uso', 'Descrição']).slice(0, 52),
      'Os campos "Nome", "Tipo de uso" e "Descrição" da fam');
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
