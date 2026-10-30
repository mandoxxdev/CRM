/**
 * Etapa 114 (T1, C229) — a requisicao com item pendente de material inativo nao e aprovada (RN-01 /aprovar, RN-02
 * /aprovar-valor, RN-03 aprovacao automatica), o rascunho nao e enviado (RN-04) e o item nao e separado (RN-05). Item ja
 * entregue nao conta (RN-06); a ordem das recusas do /aprovar (RN-07).
 *
 * As literais estao escritas aqui por extenso (contrato congelado no plano da Etapa 114), nao importadas do servico.
 *
 * Executar: cd server && node tests/api/requisicaoMaterialInativo.api.test.js
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
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOX = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };

const REATIVE = 'Reative o material em Compras → Materiais, filtro Inativos (administrador do módulo Compras)';
const E1 = (numero, codigos) => `A requisição ${numero} tem material inativo: ${codigos}. ${REATIVE} ou rejeite a requisição.`;
const E1V = (numero, codigos) => `A requisição ${numero} tem material inativo: ${codigos}. ${REATIVE} `
  + 'ou reprove a liberação por valor.';
const E2 = (numero, codigos) => `O rascunho ${numero} tem material inativo: ${codigos}. ${REATIVE} `
  + 'ou cancele o rascunho e faça outro sem ele.';
const E3 = (nome) => `${nome}: material inativo não pode ser separado. ${REATIVE} ou separe os outros itens com 0 neste.`;

(async () => {
  const { app, db, setUser } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  const cfg = (chave, valor) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
  await cfg('aprovacao_automatica', '0');
  let seq = 0;
  async function material(saldo = 0) {
    seq += 1;
    const codigo = `R114-${seq}`;
    const nome = `Peca R114 ${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 1, 1)`, [codigo, nome])).lastID;
    if (saldo) {
      const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: id, tipo: 'ENTRADA',
        quantidade: saldo, motivo: 'e114', justificativa: 'saldo e114', documento_vinculado: 'NF-R114' });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    }
    return { id, codigo, nome };
  }
  /** O estado que a Etapa 113 ja nao deixa criar pela tela (inativo com saldo), ou o caminho oficial (zerado). */
  const inativarNoBanco = (m, ativo = 0) => dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = ? WHERE id = ?', [ativo, m.id]);
  const inativarPelaRota = async (m) => {
    const r = await as(ALMOX, () => request(app).delete(`/api/almoxarifado/materiais/${m.id}`));
    assert.strictEqual(r.status, 200, `inativar: ${JSON.stringify(r.body)}`);
  };
  const reativar = async (m) => {
    const r = await as(ALMOX, () => request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ ativo: 1 }));
    assert.strictEqual(r.status, 200, `reativar: ${JSON.stringify(r.body)}`);
  };
  const criar = async (itens, extra = {}) => {
    const r = await request(app).post('/api/almoxarifado/requisicoes')
      .send({ os_referencia: 'OS-R114', itens: itens.map(([m, q]) => ({ material_id: m.id, quantidade: q })), ...extra });
    assert.strictEqual(r.status, 201, `criar: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const aprovar = (R, u = ADM) => as(u, () => request(app).put(`/api/almoxarifado/requisicoes/${R}/aprovar`).send({}));
  const lerReq = (R) => dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [R]);
  const reservasDe = (R) => dbAll(db, "SELECT * FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'", [R]);
  const reservado = async (m) => (await dbGet(db, 'SELECT quantidade_reservada AS q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q;
  const auditorias = async (R, acao) => (await dbGet(db, `SELECT COUNT(*) AS n FROM auditoria_log_almoxarifado
    WHERE entidade = 'requisicao' AND entidade_id = ? AND acao = ?`, [R, acao])).n;
  const itensDe = (R) => dbAll(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id', [R]);
  const separar = (R, entradas) => as(ALMOX, () => request(app).put(`/api/almoxarifado/requisicoes/${R}/separar`)
    .send({ itens_separados: entradas.map(([item, q]) => ({ item_id: item.id, quantidade_separada: q })) }));

  console.log('\nRN-01 — o /aprovar recusa requisicao com item pendente de material inativo');

  await test('RN-01 inativo com saldo 5 (legado) -> 400 E1, continua PENDENTE, nada reservado, sem auditoria', async () => {
    const m = await material(5);
    const r0 = await criar([[m, 2]]);
    await inativarNoBanco(m);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(r0.numero, m.codigo));
    const row = await lerReq(r0.id);
    assert.strictEqual(row.status, 'PENDENTE');
    assert.strictEqual(row.aprovador_id, null, 'aprovador nao pode ser gravado');
    assert.strictEqual((await reservasDe(r0.id)).length, 0);
    assert.strictEqual(await reservado(m), 0);
    assert.strictEqual(await auditorias(r0.id, 'APROVACAO'), 0);
  });

  await test('RN-01 inativado zerado pela rota (o caminho oficial) -> 400 E1, nao AGUARDANDO_ESTOQUE', async () => {
    const m = await material(0);
    const r0 = await criar([[m, 2]]);
    await inativarPelaRota(m);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(r0.numero, m.codigo));
    assert.strictEqual((await lerReq(r0.id)).status, 'PENDENTE');
  });

  await test('RN-01 misto (ativo com 5 + inativo) -> E1 e o ativo SEM reserva (antes: PARCIALMENTE_RESERVADA)', async () => {
    const a = await material(5);
    const m = await material(5);
    const r0 = await criar([[a, 2], [m, 2]]);
    await inativarNoBanco(m);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(r0.numero, m.codigo));
    assert.strictEqual(await reservado(a), 0, 'o item ativo nao pode ficar com hold');
    assert.strictEqual((await reservasDe(r0.id)).length, 0);
    assert.strictEqual((await lerReq(r0.id)).status, 'PENDENTE');
  });

  await test('RN-01 dois inativos, um repetido -> os codigos na ordem dos itens, sem repetir', async () => {
    const m1 = await material(0);
    const a = await material(5);
    const m2 = await material(0);
    const r0 = await criar([[m2, 1], [a, 1], [m1, 1], [m2, 1]]);
    await inativarNoBanco(m1);
    await inativarNoBanco(m2);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(r0.numero, `${m2.codigo}, ${m1.codigo}`));
  });

  await test('RN-01 ativo NULL e inativo (a leitura do motor)', async () => {
    const m = await material(3);
    const r0 = await criar([[m, 1]]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = NULL WHERE id = ?', [m.id]);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(r0.numero, m.codigo));
  });

  await test('RN-01 reativado -> 200 TOTALMENTE_RESERVADA (a recusa nao deixa nada para tras)', async () => {
    const m = await material(5);
    const r0 = await criar([[m, 2]]);
    await inativarNoBanco(m);
    assert.strictEqual((await aprovar(r0.id)).status, 400);
    await reativar(m);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.status, 'TOTALMENTE_RESERVADA');
    assert.strictEqual(await reservado(m), 2);
    assert.strictEqual(await auditorias(r0.id, 'APROVACAO'), 1);
  });

  console.log('\nRN-02 — o /aprovar-valor recusa igual');
  await cfg('liberacao_valor_ativo', '1');
  await cfg('liberacao_valor_limite', '1');
  await cfg('liberacao_valor_aprovadores', JSON.stringify([ADM.id]));
  const aprovarValor = (R, u = ADM) => as(u, () => request(app).put(`/api/almoxarifado/requisicoes/${R}/aprovar-valor`).send({}));

  await test('RN-02 acima da alcada, inativo com 5 -> 400 E1, continua AGUARDANDO_APROVACAO_VALOR, nada gravado', async () => {
    const m = await material(5);
    const r0 = await criar([[m, 2]]);
    assert.strictEqual(r0.status, 'AGUARDANDO_APROVACAO_VALOR', 'premissa: a alcada segurou');
    await inativarNoBanco(m);
    const r = await aprovarValor(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1V(r0.numero, m.codigo));
    const row = await lerReq(r0.id);
    assert.strictEqual(row.status, 'AGUARDANDO_APROVACAO_VALOR');
    assert.strictEqual(row.aprovador_valor_id, null);
    assert.strictEqual(row.data_aprovacao_valor, null);
    assert.strictEqual((await reservasDe(r0.id)).length, 0);
    assert.strictEqual(await auditorias(r0.id, 'APROVACAO_VALOR'), 0);
  });

  await test('RN-02 inativo zerado -> E1; reativado -> 200 com reserva', async () => {
    const m = await material(0);
    const r0 = await criar([[m, 2]]);
    await inativarPelaRota(m);
    let r = await aprovarValor(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1V(r0.numero, m.codigo));
    await reativar(m);
    r = await aprovarValor(r0.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.status, 'AGUARDANDO_ESTOQUE', 'sem saldo, a liberacao vai a AGUARDANDO_ESTOQUE (Etapa 73)');
  });

  await test('RN-02 a ordem: o solicitante (403) e o status errado (400 de hoje) vem antes do E1', async () => {
    const m = await material(5);
    const r0 = await criar([[m, 2]]);
    await inativarNoBanco(m);
    let r = await aprovarValor(r0.id, SUPER);
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Solicitante não pode aprovar a própria requisição');
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'PENDENTE' WHERE id = ?", [r0.id]);
    r = await aprovarValor(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Apenas requisições aguardando aprovação de valor podem ser liberadas');
  });

  await test('RN-02 a releitura respeita a ordem: status mudou na janela (com material inativo) -> a recusa de status', async () => {
    const m = await material(5);
    const r0 = await criar([[m, 2]]);
    await inativarNoBanco(m);
    const approvalRulesService = require('../../services/almoxarifado/approvalRulesService');
    const original = approvalRulesService.exigirSemPendenciaAberta;
    approvalRulesService.exigirSemPendenciaAberta = async (dbx, row) => {
      await original(dbx, row);
      // a requisicao e reprovada por outra aba entre a leitura e o UPDATE de aprovarValor
      await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'REJEITADO' WHERE id = ?", [r0.id]);
    };
    let r;
    try { r = await aprovarValor(r0.id); } finally { approvalRulesService.exigirSemPendenciaAberta = original; }
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Apenas requisições aguardando aprovação de valor podem ser liberadas');
    assert.strictEqual((await lerReq(r0.id)).status, 'REJEITADO');
  });

  await test('RN-02 a condicao vai no UPDATE: pelo servico, sem passar pela rota, nada e gravado', async () => {
    const m = await material(5);
    const r0 = await criar([[m, 2]]);
    await inativarNoBanco(m);
    const valueApprovalService = require('../../services/almoxarifado/requisitionValueApprovalService');
    let erro = null;
    try { await valueApprovalService.aprovarValor(db, r0.id, ADM); } catch (e) { erro = e; }
    assert.ok(erro, 'aprovarValor tinha de lancar');
    assert.strictEqual(erro.status, 400);
    assert.strictEqual(erro.message, E1V(r0.numero, m.codigo));
    assert.strictEqual((await lerReq(r0.id)).status, 'AGUARDANDO_APROVACAO_VALOR');
  });

  await test('RN-02 inativado DEPOIS do APROVADO gravado (zerado): o pos-aprovacao do valor segue (recusarInativo false)', async () => {
    const m = await material(0);
    const r0 = await criar([[m, 2]]);
    // a janela entre o UPDATE de aprovarValor (fora da trava) e o pos-aprovacao: o material inativado ali
    const original = requisitionService.prepararPosAprovacao;
    let opcoesVistas = null;
    requisitionService.prepararPosAprovacao = async (dbx, id, user, row, opcoes) => {
      opcoesVistas = opcoes;
      await inativarNoBanco(m);
      return original(dbx, id, user, row, opcoes);
    };
    let r;
    try { r = await aprovarValor(r0.id); } finally { requisitionService.prepararPosAprovacao = original; }
    assert.ok(opcoesVistas && opcoesVistas.recusarInativo === false, `opcoes: ${JSON.stringify(opcoesVistas)}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.status, 'AGUARDANDO_ESTOQUE');
    assert.strictEqual((await lerReq(r0.id)).status, 'AGUARDANDO_ESTOQUE');
  });
  await test('RN-02/RN-06 a regua em SQL: ativo NULL recusa; item inativo ja entregue nao conta', async () => {
    const m = await material(5);
    const a = await material(5);
    const r0 = await criar([[m, 2]]);
    const r1 = await criar([[a, 2], [m, 2]]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = NULL WHERE id = ?', [m.id]);
    let r = await aprovarValor(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1V(r0.numero, m.codigo));
    const [, im] = await itensDe(r1.id);
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_entregue = 2 WHERE id = ?', [im.id]);
    r = await aprovarValor(r1.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await lerReq(r1.id)).status, 'TOTALMENTE_RESERVADA');
  });
  await cfg('liberacao_valor_ativo', '0');

  console.log('\nRN-03 — a aprovacao automatica nao aprova');

  await test('RN-03 pelo servico: prepararPosAprovacao lanca MATERIAL_INATIVO sem reservar o item ativo', async () => {
    const a = await material(5);
    const m = await material(5);
    const r0 = await criar([[a, 1], [m, 1]]);
    await inativarNoBanco(m);
    const row = await lerReq(r0.id);
    let erro = null;
    try {
      await requisitionService.comTravaDaRequisicao(db, r0.id,
        () => requisitionService.prepararPosAprovacao(db, r0.id, ADM, row));
    } catch (e) { erro = e; }
    assert.ok(erro, 'tinha de lancar');
    assert.strictEqual(erro.code, 'MATERIAL_INATIVO');
    assert.strictEqual(erro.status, 400);
    assert.strictEqual(erro.message, E1(r0.numero, m.codigo));
    assert.strictEqual(await reservado(a), 0);
  });

  await test('RN-03 pela rota: inativado na janela da criacao -> 201 PENDENTE, sem `aprovacao`, sem reserva', async () => {
    await cfg('aprovacao_automatica', '1');
    const a = await material(5);
    const m = await material(5);
    const original = requisitionService.prepararPosAprovacao;
    requisitionService.prepararPosAprovacao = async (dbx, id, user, row, opcoes) => {
      await inativarNoBanco(m);
      return original(dbx, id, user, row, opcoes);
    };
    let r;
    try {
      r = await request(app).post('/api/almoxarifado/requisicoes')
        .send({ os_referencia: 'OS-R114', itens: [{ material_id: a.id, quantidade: 1 }, { material_id: m.id, quantidade: 1 }] });
    } finally {
      requisitionService.prepararPosAprovacao = original;
      await cfg('aprovacao_automatica', '0');
    }
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.status, 'PENDENTE');
    assert.strictEqual(r.body.aprovacao, undefined);
    assert.strictEqual((await lerReq(r.body.id)).status, 'PENDENTE');
    assert.strictEqual(await reservado(a), 0);
    // controle: sem o material inativo, a mesma porta aprova sozinha (prova que o cenario passou pela automatica)
    await cfg('aprovacao_automatica', '1');
    try {
      const ok = await request(app).post('/api/almoxarifado/requisicoes')
        .send({ os_referencia: 'OS-R114', itens: [{ material_id: a.id, quantidade: 1 }] });
      assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
      assert.strictEqual(ok.body.aprovacao, 'automatica');
    } finally { await cfg('aprovacao_automatica', '0'); }
  });

  console.log('\nRN-04 — enviar rascunho com material inativo e recusado');

  await test('RN-04 rascunho -> inativar -> enviar 400 E2, continua RASCUNHO; reativado -> envia', async () => {
    await cfg('aprovacao_automatica', '1');
    try {
      const a = await material(5);
      const m = await material(5);
      const r0 = await criar([[a, 1], [m, 1]], { salvar_rascunho: true });
      assert.strictEqual(r0.status, 'RASCUNHO');
      await inativarNoBanco(m);
      let r = await request(app).post(`/api/almoxarifado/requisicoes/${r0.id}/enviar`).send({});
      assert.strictEqual(r.status, 400, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, E2(r0.numero, m.codigo));
      const row = await lerReq(r0.id);
      assert.strictEqual(row.status, 'RASCUNHO');
      assert.strictEqual(await reservado(a), 0);
      await reativar(m);
      r = await request(app).post(`/api/almoxarifado/requisicoes/${r0.id}/enviar`).send({});
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.aprovacao, 'automatica');
    } finally { await cfg('aprovacao_automatica', '0'); }
  });

  await test('RN-04 a ordem: o dono (403) e o status (400) vem antes do E2', async () => {
    const m = await material(0);
    const r0 = await criar([[m, 1]], { salvar_rascunho: true });
    await inativarNoBanco(m);
    let r = await as(ALMOX, () => request(app).post(`/api/almoxarifado/requisicoes/${r0.id}/enviar`).send({}));
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'PENDENTE' WHERE id = ?", [r0.id]);
    r = await request(app).post(`/api/almoxarifado/requisicoes/${r0.id}/enviar`).send({});
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Apenas rascunhos podem ser enviados');
  });

  console.log('\nRN-05 — a separacao recusa o item de material inativo');

  /** Aprovada sem saldo (AGUARDANDO_ESTOQUE) com o material ativo; depois o legado: inativo com saldo 5 no banco. */
  async function aprovadaELegado(itens) {
    const r0 = await criar(itens.map(([m, q]) => [m, q]));
    const ap = await aprovar(r0.id);
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    return r0;
  }

  await test('RN-05 separar o item inativo -> 400 E3, nada gravado, status nao muda', async () => {
    const m = await material(0);
    const r0 = await aprovadaELegado([[m, 2]]);
    const antes = (await lerReq(r0.id)).status;
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0, quantidade_atual = 5 WHERE id = ?', [m.id]);
    const [item] = await itensDe(r0.id);
    const r = await separar(r0.id, [[item, 2]]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E3(m.nome));
    assert.strictEqual(Number((await itensDe(r0.id))[0].quantidade_separada) || 0, 0);
    assert.strictEqual((await lerReq(r0.id)).status, antes);
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) AS n FROM separacoes_requisicao_almoxarifado WHERE requisicao_id = ?', [r0.id])).n, 0);
  });

  await test('RN-05 misto: o item inativo com 0 e o ativo com 2 -> 200; o inativo com 1 -> E3 e nem o ativo grava', async () => {
    const a = await material(5);
    const m = await material(5);
    const r0 = await aprovadaELegado([[a, 2], [m, 2]]);
    await inativarNoBanco(m);
    const [ia, im] = await itensDe(r0.id);
    let r = await separar(r0.id, [[ia, 1], [im, 1]]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E3(m.nome));
    assert.strictEqual(Number((await itensDe(r0.id))[0].quantidade_separada) || 0, 0, 'tudo ou nada');
    r = await separar(r0.id, [[ia, 2], [im, 0]]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(Number((await itensDe(r0.id))[0].quantidade_separada), 2);
  });

  await test('RN-05 a ordem: E3 vem antes do maximo de saldo (inativo zerado) e depois da quantidade invalida', async () => {
    const m = await material(0);
    const r0 = await aprovadaELegado([[m, 2]]);
    await inativarPelaRota(m);
    const [item] = await itensDe(r0.id);
    let r = await separar(r0.id, [[item, 2]]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E3(m.nome));
    r = await separar(r0.id, [[item, -1]]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(r.body.error.startsWith(`${m.nome}: quantidade inválida para separar`), r.body.error);
  });

  console.log('\nRN-08 — o detalhe diz 0 separavel e 0 entregavel para o item de material inativo');

  await test('RN-08 detalhe: o item inativo com saldo 5 -> separavel 0, entregavel 0, material_ativo 0; o ativo segue', async () => {
    const a = await material(5);
    const m = await material(5);
    const r0 = await aprovadaELegado([[a, 2], [m, 2]]);
    await inativarNoBanco(m);
    const d = await request(app).get(`/api/almoxarifado/requisicoes/${r0.id}`);
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    const [ia, im] = d.body.itens;
    assert.strictEqual(im.saldo_separavel, 0);
    assert.strictEqual(im.quantidade_separavel, 0);
    assert.strictEqual(im.quantidade_entregavel, 0);
    assert.strictEqual(Number(im.material_ativo), 0);
    // a metade positiva: o item ativo continua com o separavel de verdade
    assert.strictEqual(ia.quantidade_separavel, 2);
    assert.strictEqual(Number(ia.material_ativo), 1);
    await reativar(m);
    const d2 = await request(app).get(`/api/almoxarifado/requisicoes/${r0.id}`);
    assert.strictEqual(d2.body.itens[1].quantidade_separavel, 2);
  });

  await test('RN-08 detalhe: separado com o material ativo e inativado depois (legado na caixa) -> entregavel 0', async () => {
    const m = await material(5);
    const r0 = await aprovadaELegado([[m, 2]]);
    const [item] = await itensDe(r0.id);
    const sep = await separar(r0.id, [[item, 2]]);
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));
    let d = await request(app).get(`/api/almoxarifado/requisicoes/${r0.id}`);
    assert.strictEqual(d.body.itens[0].quantidade_entregavel, 2, 'premissa: com o material ativo a caixa e entregavel');
    await inativarNoBanco(m);
    d = await request(app).get(`/api/almoxarifado/requisicoes/${r0.id}`);
    assert.strictEqual(d.body.itens[0].quantidade_entregavel, 0);
  });

  console.log('\nRN-06 / RN-07');

  await test('RN-06 item de material inativo ja entregue nao conta -> /aprovar 200', async () => {
    const a = await material(5);
    const m = await material(0);
    const r0 = await criar([[a, 1], [m, 2]]);
    const [, im] = await itensDe(r0.id);
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_entregue = 2 WHERE id = ?', [im.id]);
    await inativarNoBanco(m);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    // e com 1 de 2 entregue (pendente 1) o mesmo item recusa (a metade positiva)
    const r1 = await criar([[a, 1]]);
    await reativar(m);
    const outra = await criar([[m, 2]]);
    const [io] = await itensDe(outra.id);
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_entregue = 1 WHERE id = ?', [io.id]);
    await inativarNoBanco(m);
    const r2 = await aprovar(outra.id);
    assert.strictEqual(r2.status, 400, JSON.stringify(r2.body));
    assert.strictEqual(r2.body.error, E1(outra.numero, m.codigo));
    assert.ok(r1.id);
  });

  await test('RN-07 a ordem do /aprovar: solicitante 403, transicao 400 e o gate de regras 400 vem antes do E1', async () => {
    const m = await material(0);
    const r0 = await criar([[m, 1]]);
    await inativarNoBanco(m);
    let r = await aprovar(r0.id, SUPER);
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Solicitante não pode aprovar a própria requisição');
    await dbRun(db, `INSERT INTO requisicao_aprovacoes_regra (requisicao_id, regra_id, regra_nome, aprovadores, status)
      VALUES (?, 99114, 'Regra R114', '[4]', 'ABERTA')`, [r0.id]);
    r = await aprovar(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Requisição tem aprovação de regra pendente: Regra R114');
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'REJEITADO' WHERE id = ?", [r0.id]);
    r = await aprovar(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Transição inválida: REJEITADO → APROVADO');
  });

  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
