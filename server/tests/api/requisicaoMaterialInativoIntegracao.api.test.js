/**
 * Etapa 114 (T2) — integracao: a recusa da requisicao de material inativo (C229) so vale se o caminho que a mensagem
 * manda seguir EXISTE e leva ao fim do fluxo. Cruza a aprovacao (/aprovar, /aprovar-valor, envio), a tela de Materiais
 * (Reativar = PUT { ativo: 1 }), o motor (Entrada) e a separacao/entrega/encerramento — e quem recebe a mensagem consegue
 * dar o gesto que ela nomeia (Fase 2, R1/R2: Gestor rejeita, aprovador de valor reprova, Almoxarife separa com 0).
 *
 * Executar: cd server && node tests/api/requisicaoMaterialInativoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
// Etapa 193 (RN-193.02): PUT, DELETE e foto de /api/almoxarifado/materiais recusam para todos por padrao (o cadastro e so do
// Compras). Este arquivo prova o handler e as guardas que ficam ATRAS da recusa pela porta do almoxarifado (os perfis do
// almoxarifado, as guardas de estoque de quem pode), com a chave de reversao ligada (`ALMOX_CADASTRO_MATERIAL=liberado`,
// services/compras/cadastroDeMaterial.js) — sem ela nenhum desses gestos tem porta (letra C). A recusa: cadastroSoNoCompras.
process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOX = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const GESTOR = { id: 7, nome: 'Gestor Teste', role: 'user', email: 'gestor@test.com', perfil_almoxarifado: 'GESTOR' };
const APROV_VALOR = { id: 8, nome: 'Aprov Valor', role: 'user', email: 'valor@test.com', perfil_almoxarifado: 'CONSULTA' };

const REATIVE = 'Reative o material em Materiais → Inativos (Administrador, Almoxarife ou Engenharia)';
const E1 = (n, c) => `A requisição ${n} tem material inativo: ${c}. ${REATIVE} ou rejeite a requisição.`;
const E1V = (n, c) => `A requisição ${n} tem material inativo: ${c}. ${REATIVE} ou reprove a liberação por valor.`;
const E2 = (n, c) => `O rascunho ${n} tem material inativo: ${c}. ${REATIVE} ou cancele o rascunho e faça outro sem ele.`;
const E3 = (nome) => `${nome}: material inativo não pode ser separado. ${REATIVE} ou separe os outros itens com 0 neste.`;

(async () => {
  const { app, db, setUser } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  const cfg = (chave, valor) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
  await cfg('aprovacao_automatica', '0');
  const ok = (r, status = 200, rotulo = '') => assert.strictEqual(r.status, status, `${rotulo} ${JSON.stringify(r.body)}`);
  let seq = 0;
  async function material() {
    seq += 1;
    const codigo = `I114-${seq}`;
    const nome = `Peca I114 ${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 1, 1)`, [codigo, nome])).lastID;
    return { id, codigo, nome };
  }
  const entrada = (m, q, u = ALMOX) => as(u, () => request(app).post('/api/almoxarifado/movimentacoes/v2').send({
    material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e114', justificativa: 'integracao e114', documento_vinculado: 'NF-I114' }));
  const inativar = (m) => as(ALMOX, () => request(app).delete(`/api/almoxarifado/materiais/${m.id}`));
  const reativar = (m) => as(ALMOX, () => request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ ativo: 1 }));
  const criar = (itens, extra = {}) => request(app).post('/api/almoxarifado/requisicoes')
    .send({ os_referencia: 'OS-I114', itens: itens.map(([m, q]) => ({ material_id: m.id, quantidade: q })), ...extra });
  const aprovar = (R, u = ADM) => as(u, () => request(app).put(`/api/almoxarifado/requisicoes/${R}/aprovar`).send({}));
  const itensDe = (R) => dbAll(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id', [R]);
  const separar = (R, entradas) => as(ALMOX, () => request(app).put(`/api/almoxarifado/requisicoes/${R}/separar`)
    .send({ itens_separados: entradas.map(([item, q]) => ({ item_id: item.id, quantidade_separada: q })) }));
  const entregar = (R, entradas) => as(ALMOX, () => request(app).put(`/api/almoxarifado/requisicoes/${R}/entregar`)
    .send({ itens_atendidos: entradas.map(([item, q]) => ({ item_id: item.id, quantidade_atendida: q })) }));
  const status = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status;
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual AS q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q;

  await test('(i) pendente -> inativar zerado -> aprovar E1 -> Reativar -> Entrada 5 -> aprovar reserva -> separar -> entregar', async () => {
    const m = await material();
    const cr = await criar([[m, 2]]);
    ok(cr, 201, 'criar');
    ok(await inativar(m), 200, 'inativar');
    let r = await aprovar(cr.body.id);
    ok(r, 400, 'aprovar');
    assert.strictEqual(r.body.error, E1(cr.body.numero, m.codigo));
    ok(await reativar(m), 200, 'reativar');
    ok(await entrada(m, 5), 201, 'entrada');
    r = await aprovar(cr.body.id);
    ok(r, 200, 'aprovar de novo');
    assert.strictEqual(r.body.status, 'TOTALMENTE_RESERVADA');
    const [item] = await itensDe(cr.body.id);
    ok(await separar(cr.body.id, [[item, 2]]), 200, 'separar');
    ok(await entregar(cr.body.id, [[item, 2]]), 200, 'entregar');
    assert.strictEqual(await fisico(m), 3);
    assert.strictEqual(await status(cr.body.id), 'ENTREGUE');
  });

  await test('(ii)+(vii) o Gestor recebe a E1 (nao reativa: 403 no Reativar) e rejeita -> 200 REJEITADO', async () => {
    const m = await material();
    const cr = await criar([[m, 1]]);
    ok(cr, 201);
    ok(await inativar(m));
    let r = await aprovar(cr.body.id, GESTOR);
    ok(r, 400, 'aprovar pelo Gestor');
    assert.strictEqual(r.body.error, E1(cr.body.numero, m.codigo));
    // a mensagem diz quem reativa porque o Gestor nao reativa (Fase 2, R2)
    r = await as(GESTOR, () => request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ ativo: 1 }));
    ok(r, 403, 'Reativar pelo Gestor');
    r = await as(GESTOR, () => request(app).put(`/api/almoxarifado/requisicoes/${cr.body.id}/rejeitar`)
      .send({ motivo: 'material inativado' }));
    ok(r, 200, 'rejeitar');
    assert.strictEqual(await status(cr.body.id), 'REJEITADO');
  });

  await test('(iii) rascunho -> inativar -> enviar E2 -> cancelar o rascunho 200', async () => {
    const m = await material();
    const cr = await criar([[m, 1]], { salvar_rascunho: true });
    ok(cr, 201);
    ok(await inativar(m));
    let r = await request(app).post(`/api/almoxarifado/requisicoes/${cr.body.id}/enviar`).send({});
    ok(r, 400, 'enviar');
    assert.strictEqual(r.body.error, E2(cr.body.numero, m.codigo));
    r = await request(app).put(`/api/almoxarifado/requisicoes/${cr.body.id}/cancelar`).send({ motivo: 'material inativado' });
    ok(r, 200, 'cancelar o rascunho');
    assert.strictEqual(await status(cr.body.id), 'CANCELADO');
  });

  await test('(iv)+(vii) alcada: aprovar-valor E1v -> reprovar 200; outra: reativar -> aprovar-valor 200', async () => {
    await cfg('liberacao_valor_ativo', '1');
    await cfg('liberacao_valor_limite', '1');
    await cfg('liberacao_valor_aprovadores', JSON.stringify([APROV_VALOR.id]));
    try {
      const m = await material();
      ok(await entrada(m, 5), 201);
      const a = await criar([[m, 2]]);
      const b = await criar([[m, 2]]);
      ok(a, 201); ok(b, 201);
      assert.strictEqual(a.body.status, 'AGUARDANDO_APROVACAO_VALOR', 'premissa: a alcada segurou');
      // zera e inativa pela rota (o caminho oficial)
      ok(await as(ALMOX, () => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, tipo: 'SAIDA',
        quantidade: 5, motivo: 'e114', justificativa: 'zerar', documento_vinculado: 'NF-I114' })), 201, 'saida');
      ok(await inativar(m));
      const av = (R) => as(APROV_VALOR, () => request(app).put(`/api/almoxarifado/requisicoes/${R}/aprovar-valor`).send({}));
      let r = await av(a.body.id);
      ok(r, 400, 'aprovar-valor');
      assert.strictEqual(r.body.error, E1V(a.body.numero, m.codigo));
      // o gesto que a E1v nomeia, pelo mesmo usuario (o /rejeitar so aceita PENDENTE — Fase 2, R2)
      r = await as(APROV_VALOR, () => request(app).put(`/api/almoxarifado/requisicoes/${a.body.id}/rejeitar`).send({ motivo: 'x' }));
      ok(r, 403, '/rejeitar pelo aprovador de valor (sem perfil de aprovar)');
      r = await as(APROV_VALOR, () => request(app).put(`/api/almoxarifado/requisicoes/${a.body.id}/rejeitar-valor`)
        .send({ motivo: 'material inativado' }));
      ok(r, 200, 'reprovar a liberacao');
      ok(await reativar(m));
      ok(await entrada(m, 5), 201);
      r = await av(b.body.id);
      ok(r, 200, 'aprovar-valor depois de reativar');
      assert.strictEqual(r.body.status, 'TOTALMENTE_RESERVADA');
    } finally { await cfg('liberacao_valor_ativo', '0'); }
  });

  await test('(v) legado aprovado (inativo com saldo) -> separar E3 -> reativar -> separar -> entregar 200', async () => {
    const m = await material();
    const cr = await criar([[m, 2]]);
    ok(cr, 201);
    let r = await aprovar(cr.body.id);
    ok(r, 200, 'aprovar sem saldo');
    assert.strictEqual(r.body.status, 'AGUARDANDO_ESTOQUE');
    // o legado que a A60/A61 acham: inativo com saldo (anterior a Etapa 113)
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 5, ativo = 0 WHERE id = ?', [m.id]);
    const [item] = await itensDe(cr.body.id);
    r = await separar(cr.body.id, [[item, 2]]);
    ok(r, 400, 'separar');
    assert.strictEqual(r.body.error, E3(m.nome));
    ok(await reativar(m));
    ok(await separar(cr.body.id, [[item, 2]]), 200, 'separar depois de reativar');
    ok(await entregar(cr.body.id, [[item, 2]]), 200, 'entregar');
    assert.strictEqual(await status(cr.body.id), 'ENTREGUE');
  });

  await test('(vi) legado misto: detalhe 0 no inativo -> separar o ativo com 0 no inativo -> entregar -> encerrar 200', async () => {
    const a = await material();
    const m = await material();
    ok(await entrada(a, 5), 201);
    ok(await entrada(m, 5), 201);
    const cr = await criar([[a, 2], [m, 2]]);
    ok(cr, 201);
    ok(await aprovar(cr.body.id), 200, 'aprovar');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [m.id]);
    const d = await request(app).get(`/api/almoxarifado/requisicoes/${cr.body.id}`);
    ok(d, 200, 'detalhe');
    const [da, dm] = d.body.itens;
    assert.strictEqual(dm.quantidade_separavel, 0, 'o modal pre-preenche 0 no inativo');
    assert.strictEqual(da.quantidade_separavel, 2);
    const [ia, im] = await itensDe(cr.body.id);
    // o que o modal manda com o pre-preenchimento do detalhe
    let r = await separar(cr.body.id, [[ia, da.quantidade_separavel], [im, dm.quantidade_separavel]]);
    ok(r, 200, 'separar com 0 no inativo');
    ok(await entregar(cr.body.id, [[ia, 2]]), 200, 'entregar o ativo');
    assert.strictEqual(await status(cr.body.id), 'PARCIALMENTE_ATENDIDA');
    r = await as(ADM, () => request(app).put(`/api/almoxarifado/requisicoes/${cr.body.id}/encerrar`).send({ motivo: 'inativo' }));
    ok(r, 200, 'encerrar');
    assert.strictEqual(await status(cr.body.id), 'ENCERRADA');
  });

  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
