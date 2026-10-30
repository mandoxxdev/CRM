/**
 * Etapa 114 (Fase 5) — os cenarios que a revisao adversarial achou sem prova (sabotagem verde) e os dois defeitos que
 * ela reproduziu: I1 (a requisicao ja aprovada que volta a alcada de valor na separacao nao pode ser presa pela recusa
 * de material inativo) e M1 (a fila de separacao diz 0 como o detalhe para o item de material inativo).
 *
 * Executar: cd server && node tests/api/requisicaoMaterialInativoFase5.api.test.js
 */
const W = '../../';
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
// Etapa 193 (RN-193.02): PUT, DELETE e foto de /api/almoxarifado/materiais recusam para todos por padrao (o cadastro e so do
// Compras). Este arquivo prova o handler e as guardas que ficam ATRAS da recusa pela porta do almoxarifado (os perfis do
// almoxarifado, as guardas de estoque de quem pode), com a chave de reversao ligada (`ALMOX_CADASTRO_MATERIAL=liberado`,
// services/compras/cadastroDeMaterial.js) — sem ela nenhum desses gestos tem porta (letra C). A recusa: cadastroSoNoCompras.
process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
const { dbRun, dbGet, dbAll } = require(W + 'services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOX = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const REATIVE = 'Reative o material em Materiais → Inativos (Administrador, Almoxarife ou Engenharia)';
const E1 = (n, c) => `A requisição ${n} tem material inativo: ${c}. ${REATIVE} ou rejeite a requisição.`;
const E1V = (n, c) => `A requisição ${n} tem material inativo: ${c}. ${REATIVE} ou reprove a liberação por valor.`;

(async () => {
  const { app, db, setUser } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  const cfg = (chave, valor) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
  await cfg('aprovacao_automatica', '0');
  let seq = 0;
  async function material(saldo = 0) {
    seq += 1;
    const codigo = `P114-${seq}`; const nome = `Peca P114 ${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 1, 1)`, [codigo, nome])).lastID;
    if (saldo) {
      const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: id, tipo: 'ENTRADA',
        quantidade: saldo, motivo: 'p114', justificativa: 'saldo p114', documento_vinculado: 'NF-P114' });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    }
    return { id, codigo, nome };
  }
  const inativarNoBanco = (m) => dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [m.id]);
  const criar = async (itens, extra = {}) => {
    const r = await request(app).post('/api/almoxarifado/requisicoes')
      .send({ os_referencia: 'OS-P114', itens: itens.map(([m, q]) => ({ material_id: m.id, quantidade: q })), ...extra });
    assert.strictEqual(r.status, 201, `criar: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const aprovar = (R, u = ADM) => as(u, () => request(app).put(`/api/almoxarifado/requisicoes/${R}/aprovar`).send({}));
  const itensDe = (R) => dbAll(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id', [R]);
  const separar = (R, entradas) => as(ALMOX, () => request(app).put(`/api/almoxarifado/requisicoes/${R}/separar`)
    .send({ itens_separados: entradas.map(([item, q]) => ({ item_id: item.id, quantidade_separada: q })) }));

  // P9 (S33): no /aprovar, a ordem dos itens com lista NAO palindroma (a do RN-01 [m2, a, m1, m2] invertida da o mesmo).
  await test('P9 RN-01 codigos na ordem dos itens, lista nao palindroma', async () => {
    const m1 = await material(0); const m2 = await material(0);
    const r0 = await criar([[m2, 1], [m1, 1], [m1, 1]]);
    await inativarNoBanco(m1); await inativarNoBanco(m2);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(r0.numero, `${m2.codigo}, ${m1.codigo}`));
  });

  // P1 (S10): a regua de 6 casas do pendente em JS — o resto de 1e-16 do legado torto NAO e pendente.
  await test('P1 RN-06 legado torto (1 - (0,7+0,2+0,1) = 1e-16) nao conta -> /aprovar 200', async () => {
    const a = await material(5); const m = await material(0);
    const r0 = await criar([[a, 1], [m, 1]]);
    const [, im] = await itensDe(r0.id);
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_entregue = ? WHERE id = ?', [0.7 + 0.2 + 0.1, im.id]);
    await inativarNoBanco(m);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });

  // P2 (S11): a mesma regua em SQL, pelo /aprovar-valor.
  await cfg('liberacao_valor_ativo', '1'); await cfg('liberacao_valor_limite', '1');
  await cfg('liberacao_valor_aprovadores', JSON.stringify([ADM.id]));
  const aprovarValor = (R) => as(ADM, () => request(app).put(`/api/almoxarifado/requisicoes/${R}/aprovar-valor`).send({}));
  await test('P2 RN-02/RN-06 legado torto (1e-16) no SQL -> /aprovar-valor 200', async () => {
    const a = await material(5); const m = await material(0);
    const r0 = await criar([[a, 2], [m, 1]]);
    assert.strictEqual(r0.status, 'AGUARDANDO_APROVACAO_VALOR');
    const [, im] = await itensDe(r0.id);
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_entregue = ? WHERE id = ?', [0.7 + 0.2 + 0.1, im.id]);
    await inativarNoBanco(m);
    const r = await aprovarValor(r0.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });

  // P3 (S24): a releitura do valor lista os codigos na ordem dos itens.
  await test('P3 RN-02 dois inativos no /aprovar-valor -> codigos na ordem dos itens', async () => {
    const m1 = await material(0); const m2 = await material(0);
    // nao palindromo: a ordem invertida daria m1, m2
    const r0 = await criar([[m2, 1], [m1, 1], [m1, 1]]);
    await inativarNoBanco(m1); await inativarNoBanco(m2);
    const r = await aprovarValor(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1V(r0.numero, `${m2.codigo}, ${m1.codigo}`));
  });

  // P4 (S23): o gate de regras aberto NA JANELA vem antes do E1v (a pre-checagem ja passou).
  await test('P4 RN-02 regra aberta entre a pre-checagem e o UPDATE (com inativo) -> a mensagem do gate, nao E1v', async () => {
    const m = await material(5);
    const r0 = await criar([[m, 2]]);
    await inativarNoBanco(m);
    const approvalRulesService = require(W + 'services/almoxarifado/approvalRulesService');
    const original = approvalRulesService.exigirSemPendenciaAberta;
    approvalRulesService.exigirSemPendenciaAberta = async (dbx, row) => {
      await original(dbx, row);
      await dbRun(db, `INSERT INTO requisicao_aprovacoes_regra (requisicao_id, regra_id, regra_nome, aprovadores, status)
        VALUES (?, 99115, 'Regra P114', '[4]', 'ABERTA')`, [r0.id]);
    };
    let r;
    try { r = await aprovarValor(r0.id); } finally { approvalRulesService.exigirSemPendenciaAberta = original; }
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Requisição tem aprovação de regra pendente: Regra P114');
  });
  await cfg('liberacao_valor_ativo', '0');


  // I1 (Fase 5, Important, reproduzido): aprovada com o material ativo, inativado DEPOIS (zerado, B734), a separacao com 0
  // no inativo (o que a E3 manda) cai na alcada de valor -> a liberacao NAO pode recusar pela E1v (ja foi aprovada uma vez).
  await test('I1 aprovada, inativado depois, separar com 0 cai na alcada -> /aprovar-valor 200 e o ativo separa', async () => {
    const a = await material(5); const m = await material(0);
    const r0 = await criar([[a, 2], [m, 2]]);
    let r = await aprovar(r0.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.status, 'PARCIALMENTE_RESERVADA');
    r = await as(ALMOX, () => request(app).delete(`/api/almoxarifado/materiais/${m.id}`));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    await cfg('liberacao_valor_ativo', '1'); await cfg('liberacao_valor_limite', '1');
    await cfg('liberacao_valor_aprovadores', JSON.stringify([ADM.id]));
    try {
      const [ia, im] = await itensDe(r0.id);
      r = await separar(r0.id, [[ia, 2], [im, 0]]);
      assert.strictEqual(r.status, 403, JSON.stringify(r.body));
      assert.strictEqual((await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [r0.id])).status,
        'AGUARDANDO_APROVACAO_VALOR', 'premissa: a separacao levou a alcada');
      r = await aprovarValor(r0.id);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      r = await separar(r0.id, [[ia, 2], [im, 0]]);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      // a metade positiva: uma requisicao NUNCA aprovada com o mesmo material inativo continua recusada (E1v)
      await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 1 WHERE id = ?', [m.id]);
      const r1 = await criar([[a, 1], [m, 1]]);
      assert.strictEqual(r1.status, 'AGUARDANDO_APROVACAO_VALOR');
      await inativarNoBanco(m);
      r = await aprovarValor(r1.id);
      assert.strictEqual(r.status, 400, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, E1V(r1.numero, m.codigo));
    } finally { await cfg('liberacao_valor_ativo', '0'); }
  });

  // M1 (Fase 5, Minor, reproduzido): a fila de separacao diz 0 separavel e 0 entregavel no item inativo (RN-08).
  await test('M1 fila: item de material inativo -> separavel 0 (sem SEPARAR); caixa de material inativado -> entregavel 0', async () => {
    const m = await material(5);
    const r0 = await criar([[m, 2]]);
    assert.strictEqual((await aprovar(r0.id)).status, 200);
    const linhaDaFila = async () => {
      const f = await as(ALMOX, () => request(app).get('/api/almoxarifado/fila-separacao'));
      assert.strictEqual(f.status, 200, JSON.stringify(f.body));
      return f.body.find((x) => x.id === r0.id);
    };
    let linha = await linhaDaFila();
    assert.ok(linha, 'premissa: a requisicao esta na fila');
    assert.strictEqual(linha.itens[0].separavel, 2, 'premissa: ativo, separavel 2');
    await inativarNoBanco(m);
    linha = await linhaDaFila();
    assert.strictEqual(linha.itens[0].separavel, 0);
    assert.ok(!linha.etapas.includes('SEPARAR'), JSON.stringify(linha.etapas));
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 1 WHERE id = ?', [m.id]);
    const [item] = await itensDe(r0.id);
    assert.strictEqual((await separar(r0.id, [[item, 2]])).status, 200);
    linha = await linhaDaFila();
    assert.strictEqual(linha.itens[0].entregavel, 2, 'premissa: ativo, entregavel 2');
    await inativarNoBanco(m);
    linha = await linhaDaFila();
    assert.strictEqual(linha.itens[0].entregavel, 0);
    assert.ok(!linha.etapas.includes('ENTREGAR'), JSON.stringify(linha.etapas));
  });

  // P5 (S15): no envio, a fracao de serie (101) vem antes do E2.
  await test('P5 RN-04 a ordem: fracao de serie (Etapa 101) vem antes do E2', async () => {
    const m = await material(0);
    const r0 = await criar([[m, 1]], { salvar_rascunho: true });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_serie = 1, ativo = 0 WHERE id = ?', [m.id]);
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_solicitada = 1.5 WHERE requisicao_id = ?', [r0.id]);
    const r = await request(app).post(`/api/almoxarifado/requisicoes/${r0.id}/enviar`).send({});
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `${m.nome}: material com controle de série exige quantidade inteira na requisição (informado: 1.5)`);
  });

  // P6 (S08/S31): o detalhe trata ativo NULL como inativo (a mesma leitura do motor e da porta).
  await test('P6 RN-08 detalhe com ativo NULL -> separavel 0 e entregavel 0', async () => {
    const m = await material(0);
    const r0 = await criar([[m, 2]]);
    assert.strictEqual((await aprovar(r0.id)).status, 200);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = NULL, quantidade_atual = 5 WHERE id = ?', [m.id]);
    const d = await request(app).get(`/api/almoxarifado/requisicoes/${r0.id}`);
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.strictEqual(d.body.itens[0].quantidade_separavel, 0);
    assert.strictEqual(d.body.itens[0].quantidade_entregavel, 0);
    // e a porta concorda com o detalhe
    const [item] = await itensDe(r0.id);
    assert.strictEqual((await separar(r0.id, [[item, 2]])).status, 400);
  });

  // P7 (S29): o veredito de inativo so e lido de material travado — fora da trava, 409 TRAVA_INCOMPLETA antes do E1.
  await test('P7 RN-01 item fora da secao da trava + inativo -> TRAVA_INCOMPLETA (nao E1 lido sem trava)', async () => {
    const travaPorMaterial = require(W + 'services/almoxarifado/travaPorMaterial');
    const requisitionService = require(W + 'services/almoxarifado/requisitionService');
    const a = await material(5); const m = await material(5);
    const r0 = await criar([[a, 1], [m, 1]]);
    await inativarNoBanco(m);
    const row = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [r0.id]);
    let erro = null;
    try {
      await travaPorMaterial.comLockDosMateriais([a.id], () => requisitionService.prepararPosAprovacao(db, r0.id, ADM, row));
    } catch (e) { erro = e; }
    assert.ok(erro, 'tinha de lancar');
    assert.strictEqual(erro.code, 'TRAVA_INCOMPLETA');
    assert.strictEqual(erro.status, 409);
  });

  // P8 (S16): na separacao, E3 vem antes da fracao de serie (plano, RN-05 R4).
  await test('P8 RN-05 a ordem: material inativo com serie e fracao -> E3, nao a de serie', async () => {
    const m = await material(0);
    const r0 = await criar([[m, 2]]);
    assert.strictEqual((await aprovar(r0.id)).status, 200);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_serie = 1, ativo = 0, quantidade_atual = 5 WHERE id = ?', [m.id]);
    const [item] = await itensDe(r0.id);
    const r = await separar(r0.id, [[item, 1.5]]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `${m.nome}: material inativo não pode ser separado. ${REATIVE} ou separe os outros itens com 0 neste.`);
  });

  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
