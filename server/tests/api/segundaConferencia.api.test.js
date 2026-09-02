/**
 * Etapa 28, Task 2 — segunda conferência da separação, com a barreira no WHERE.
 *
 * Quem separou não confere (RN-03): a checagem em JS existe pela MENSAGEM; quem GARANTE é o
 * `NOT EXISTS` dentro do WHERE do claim (`claimConferencia`, exportado e provado direto — é o
 * único jeito determinístico de provar o WHERE, porque com a D3 o estado final da corrida é
 * seguro mesmo sem ele). A conferência é obrigatória quando há material crítico SEPARADO
 * (RN-06), e vale para as DUAS saídas: `liberar-retirada` e `entregar` — a entrega sai direto de
 * EM_SEPARACAO sem passar pela liberação (achado 1 da Fase 2).
 *
 * Executar: cd server && node tests/api/segundaConferencia.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const { PERFIS, ACAO_PERFIS } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN_USER = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOX_A = { id: 31, nome: 'Almox A', role: 'user', email: 'a@test.com', perfil_almoxarifado: PERFIS.ALMOXARIFE };
const ALMOX_B = { id: 32, nome: 'Almox B', role: 'user', email: 'b@test.com', perfil_almoxarifado: PERFIS.ALMOXARIFE };
const ALMOX_C = { id: 33, nome: 'Almox C', role: 'user', email: 'c@test.com', perfil_almoxarifado: PERFIS.ALMOXARIFE };
const ALMOX_D = { id: 34, nome: 'Almox D', role: 'user', email: 'd@test.com', perfil_almoxarifado: PERFIS.ALMOXARIFE };
const PRODUCAO = { id: 35, nome: 'Producao', role: 'user', email: 'p@test.com', perfil_almoxarifado: PERFIS.PRODUCAO };

const MSG_RN06 = 'Esta requisição tem material crítico separado e ainda não passou pela segunda '
  + 'conferência. Peça a outra pessoa do almoxarifado para conferir a separação antes de liberar ou entregar.';

let seq = 0;
function numero() {
  seq += 1;
  return `REQ-SEGCONF-${seq}`;
}

async function criarRequisicao(db, { status = 'EM_SEPARACAO', itens }) {
  const reqRes = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
    (numero, solicitante_id, solicitante_nome, status) VALUES (?, 77, 'Solicitante Teste', ?)`,
    [numero(), status]);
  const reqId = reqRes.lastID;
  const itemIds = [];
  for (const item of itens) {
    const r = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue)
      VALUES (?, ?, ?, ?, ?)`,
      [reqId, item.material_id, item.quantidade ?? 5, item.quantidade_separada ?? 0, item.quantidade_entregue ?? 0]);
    itemIds.push(r.lastID);
  }
  return { id: reqId, itemIds };
}

const linha = (db, reqId) => dbGet(db,
  'SELECT status, conferido_por_id, conferido_por_nome, conferido_em FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
const saldoDe = (db, matId) => dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId])
  .then((r) => Number(r.quantidade_atual));
const rodadasDe = (db, reqId) => dbAll(db,
  'SELECT id, usuario_id FROM separacoes_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id', [reqId]);
const auditoria = (db, reqId, acao) => dbAll(db,
  `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao' AND entidade_id = ? AND acao = ?
   ORDER BY id ASC`, [reqId, acao]);
const inserirRodada = (db, reqId, user) => dbRun(db, `INSERT INTO separacoes_requisicao_almoxarifado
  (requisicao_id, usuario_id, usuario_nome, itens_tocados, itens_json) VALUES (?, ?, ?, 1, '[]')`,
[reqId, user.id, user.nome]).then((r) => r.lastID);
const conferirDireto = (db, reqId, user) => dbRun(db, `UPDATE requisicoes_almoxarifado
  SET conferido_por_id = ?, conferido_por_nome = ?, conferido_em = '2026-08-30 09:00:00' WHERE id = ?`,
[user.id, user.nome, reqId]);

(async () => {
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN_USER });

  const fam = await request(app).post('/api/almoxarifado/familias')
    .send({ codigo: 'FAMSEGCONF', nome: 'Família Segunda Conferência' });
  assert.strictEqual(fam.status, 201, JSON.stringify(fam.body));
  const familiaId = fam.body.id;

  async function criarMaterial(codigo, quantidadeAtual = 50, { critico = 0 } = {}) {
    const res = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo, nome: `Material ${codigo}`, familia_id: familiaId, unidade: 'UN' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ?, material_critico = ? WHERE id = ?',
      [quantidadeAtual, critico, res.body.id]);
    return res.body.id;
  }

  async function conferirPelaRota(reqId, user) {
    setUser(user);
    try {
      return await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/conferir-separacao`).send({});
    } finally {
      setUser(ADMIN_USER);
    }
  }

  // ── C4 ─────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-05] conferir_separacao existe em ACAO_PERFIS para ADMINISTRADOR e ALMOXARIFE, e so', async () => {
    assert.deepStrictEqual(ACAO_PERFIS.conferir_separacao, [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE]);
  });

  // ── RN-05 ──────────────────────────────────────────────────────────────────────────────────
  await test('[RN-05] PRODUCAO (sem conferir_separacao) -> 403 do requirePermission, nada gravado', async () => {
    const matId = await criarMaterial('SEGCONF-01');
    const { id: reqId } = await criarRequisicao(db, { itens: [{ material_id: matId, quantidade_separada: 2 }] });
    await inserirRodada(db, reqId, ALMOX_A);

    const res = await conferirPelaRota(reqId, PRODUCAO);
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.strictEqual(res.body.acao, 'conferir_separacao', JSON.stringify(res.body));
    assert.strictEqual((await linha(db, reqId)).conferido_por_id, null);
  });

  await test('[RN-05] sem user o servico lanca 400 e nao grava', async () => {
    const matId = await criarMaterial('SEGCONF-02');
    const { id: reqId } = await criarRequisicao(db, { itens: [{ material_id: matId, quantidade_separada: 2 }] });
    for (const user of [undefined, {}, { nome: 'Sem Id' }]) {
      let erro = null;
      try {
        // eslint-disable-next-line no-await-in-loop
        await requisitionService.conferirSeparacao(db, reqId, user);
      } catch (e) { erro = e; }
      assert.ok(erro, `esperava erro sem usuario (${JSON.stringify(user)}), mas conferiu`);
      assert.strictEqual(erro.status, 400, `status ${erro.status}: ${erro.message}`);
      assert.strictEqual(erro.message, 'Conferência exige usuário identificado');
    }
    assert.strictEqual((await linha(db, reqId)).conferido_por_id, null);
  });

  await test('[RN-05] ALMOXARIFE que nao separou confere -> 200, conferido_por_* gravados, auditoria CONFERENCIA_SEPARACAO', async () => {
    const matId = await criarMaterial('SEGCONF-03');
    const { id: reqId, itemIds } = await criarRequisicao(db, { status: 'APROVADO', itens: [{ material_id: matId }] });
    await requisitionService.separarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_separada: 2 }], ALMOX_A);

    const res = await conferirPelaRota(reqId, ALMOX_B);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.conferencia.usuario_id, ALMOX_B.id);
    assert.strictEqual(res.body.conferencia.usuario_nome, 'Almox B');
    assert.ok(res.body.conferencia.em, 'conferencia.em preenchido');

    const row = await linha(db, reqId);
    assert.strictEqual(row.status, 'EM_SEPARACAO', 'conferir nao muda status');
    assert.strictEqual(row.conferido_por_id, ALMOX_B.id, 'conferido_por_id tem de ser o de req.user');
    assert.strictEqual(row.conferido_por_nome, 'Almox B');
    assert.ok(row.conferido_em, 'conferido_em gravado');

    const logs = await auditoria(db, reqId, 'CONFERENCIA_SEPARACAO');
    assert.strictEqual(logs.length, 1, `esperava 1 linha CONFERENCIA_SEPARACAO, veio ${logs.length}`);
    assert.strictEqual(logs[0].usuario_id, ALMOX_B.id);
    assert.strictEqual(logs[0].usuario_nome, 'Almox B');
    const novos = JSON.parse(logs[0].dados_novos);
    assert.strictEqual(novos.conferido_por_id, ALMOX_B.id);
    assert.strictEqual(novos.conferido_por_nome, 'Almox B');
  });

  await test('[RN-05] requisicao inexistente -> 404', async () => {
    const res = await conferirPelaRota(999999, ALMOX_B);
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Requisição não encontrada');
  });

  await test('[RN-05] status fora de EM_SEPARACAO -> 400 citando o status', async () => {
    const matId = await criarMaterial('SEGCONF-04');
    for (const status of ['APROVADO', 'PRONTA_PARA_RETIRADA', 'PARCIALMENTE_ATENDIDA']) {
      // eslint-disable-next-line no-await-in-loop
      const { id: reqId } = await criarRequisicao(db, { status, itens: [{ material_id: matId, quantidade_separada: 2 }] });
      // eslint-disable-next-line no-await-in-loop
      const res = await conferirPelaRota(reqId, ALMOX_B);
      assert.strictEqual(res.status, 400, `${status}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.error, `Só é possível conferir uma requisição em separação (status atual: ${status})`);
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual((await linha(db, reqId)).conferido_por_id, null);
    }
  });

  await test('[RN-05] sem item separado -> 400 Nenhum item separado', async () => {
    const matId = await criarMaterial('SEGCONF-05');
    const { id: reqId } = await criarRequisicao(db, { itens: [{ material_id: matId, quantidade_separada: 0 }] });
    const res = await conferirPelaRota(reqId, ALMOX_B);
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Nenhum item separado');
    assert.strictEqual((await linha(db, reqId)).conferido_por_id, null);
  });

  await test('[RN-05] segunda conferencia -> 409, a primeira fica', async () => {
    const matId = await criarMaterial('SEGCONF-06');
    const { id: reqId } = await criarRequisicao(db, { itens: [{ material_id: matId, quantidade_separada: 2 }] });
    await inserirRodada(db, reqId, ALMOX_A);

    const primeira = await conferirPelaRota(reqId, ALMOX_B);
    assert.strictEqual(primeira.status, 200, JSON.stringify(primeira.body));
    const antes = await linha(db, reqId);

    const segunda = await conferirPelaRota(reqId, ALMOX_C);
    assert.strictEqual(segunda.status, 409, JSON.stringify(segunda.body));
    assert.ok(segunda.body.error.startsWith('Esta requisição não pode ser conferida agora'), segunda.body.error);

    const depois = await linha(db, reqId);
    assert.deepStrictEqual(depois, antes, 'a segunda conferencia sobrescreveu a primeira');
    assert.strictEqual((await auditoria(db, reqId, 'CONFERENCIA_SEPARACAO')).length, 1, 'so a primeira audita');
  });

  // ── RN-03 ──────────────────────────────────────────────────────────────────────────────────
  await test('[RN-03] PESO: separador da PRIMEIRA rodada tenta conferir -> 403 citando #<rodada.id>; B -> 403; C -> 200', async () => {
    const matId = await criarMaterial('SEGCONF-07');
    const { id: reqId, itemIds } = await criarRequisicao(db, { status: 'APROVADO', itens: [{ material_id: matId, quantidade: 5 }] });
    const rA = await requisitionService.separarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_separada: 1 }], ALMOX_A);
    const rB = await requisitionService.separarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_separada: 1 }], ALMOX_B);
    assert.ok(rA.rodada_id && rB.rodada_id && rA.rodada_id !== rB.rodada_id, 'duas rodadas');

    // A e o separador da PRIMEIRA rodada — comparar so com "o ultimo" deixaria A passar.
    const resA = await conferirPelaRota(reqId, ALMOX_A);
    assert.strictEqual(resA.status, 403, `A deveria levar 403, veio ${resA.status}: ${JSON.stringify(resA.body)}`);
    assert.strictEqual(resA.body.error,
      `Quem separou não confere: você registrou a rodada de separação #${rA.rodada_id} desta requisição. `
      + 'A segunda conferência tem de ser de outra pessoa.');
    assert.strictEqual((await linha(db, reqId)).conferido_por_id, null, 'A conferiu apesar do 403');

    const resB = await conferirPelaRota(reqId, ALMOX_B);
    assert.strictEqual(resB.status, 403, JSON.stringify(resB.body));
    assert.ok(resB.body.error.includes(`#${rB.rodada_id}`), resB.body.error);
    assert.strictEqual((await linha(db, reqId)).conferido_por_id, null, 'B conferiu apesar do 403');

    // Pelo servico direto, o erro e o mesmo (status 403 no Error).
    let erroA = null;
    try { await requisitionService.conferirSeparacao(db, reqId, ALMOX_A); } catch (e) { erroA = e; }
    assert.strictEqual(erroA && erroA.status, 403, `servico: ${erroA && erroA.message}`);

    const resC = await conferirPelaRota(reqId, ALMOX_C);
    assert.strictEqual(resC.status, 200, JSON.stringify(resC.body));
    assert.strictEqual((await linha(db, reqId)).conferido_por_id, ALMOX_C.id);
    assert.strictEqual((await auditoria(db, reqId, 'CONFERENCIA_SEPARACAO')).length, 1, 'so C audita');
  });

  await test('[RN-03] o claim sozinho segura: claimConferencia com rodada do mesmo usuario -> undefined e colunas NULL', async () => {
    // Sem checagem JS na frente: e ESTE teste que fica vermelho quando o NOT EXISTS sai do WHERE.
    assert.strictEqual(typeof requisitionService.claimConferencia, 'function', 'claimConferencia exportado');
    const matId = await criarMaterial('SEGCONF-08');
    const { id: reqId } = await criarRequisicao(db, { itens: [{ material_id: matId, quantidade_separada: 2 }] });
    await inserirRodada(db, reqId, ALMOX_A);

    const claimA = await requisitionService.claimConferencia(db, reqId, ALMOX_A);
    assert.strictEqual(claimA, undefined, `o claim de quem separou passou: ${JSON.stringify(claimA)}`);
    const rowA = await linha(db, reqId);
    assert.strictEqual(rowA.conferido_por_id, null, 'o WHERE deixou quem separou conferir');
    assert.strictEqual(rowA.conferido_por_nome, null);
    assert.strictEqual(rowA.conferido_em, null);

    const claimC = await requisitionService.claimConferencia(db, reqId, ALMOX_C);
    assert.ok(claimC, 'o claim de outra pessoa tem de passar');
    assert.strictEqual(claimC.id, reqId);
    assert.ok(claimC.conferido_em, 'RETURNING conferido_em');
    const rowC = await linha(db, reqId);
    assert.strictEqual(rowC.conferido_por_id, ALMOX_C.id);
    assert.strictEqual(rowC.conferido_por_nome, 'Almox C');

    // Segundo claim (mesmo de outra pessoa) -> undefined: conferido_por_id IS NULL no WHERE.
    assert.strictEqual(await requisitionService.claimConferencia(db, reqId, ALMOX_D), undefined);
    assert.strictEqual((await linha(db, reqId)).conferido_por_id, ALMOX_C.id);
  });

  await test('[RN-03] claimConferencia fora de EM_SEPARACAO -> undefined', async () => {
    const matId = await criarMaterial('SEGCONF-09');
    const { id: reqId } = await criarRequisicao(db, { status: 'PRONTA_PARA_RETIRADA', itens: [{ material_id: matId, quantidade_separada: 2 }] });
    assert.strictEqual(await requisitionService.claimConferencia(db, reqId, ALMOX_C), undefined);
    assert.strictEqual((await linha(db, reqId)).conferido_por_id, null);
  });

  // ── RN-03b ─────────────────────────────────────────────────────────────────────────────────
  await test('[RN-03b] corrida separar(B) x conferir(B) no servico, 10x: nunca "conferida por B" com rodada de B', async () => {
    const matId = await criarMaterial('SEGCONF-10', 500);
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop
      const { id: reqId, itemIds } = await criarRequisicao(db, { status: 'APROVADO', itens: [{ material_id: matId, quantidade: 10 }] });
      // A separa antes: sem item separado a conferencia nem chega ao claim.
      // eslint-disable-next-line no-await-in-loop
      await requisitionService.separarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_separada: 1 }], ALMOX_A);

      // eslint-disable-next-line no-await-in-loop
      const [sep, conf] = await Promise.allSettled([
        requisitionService.separarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_separada: 1 }], ALMOX_B),
        requisitionService.conferirSeparacao(db, reqId, ALMOX_B),
      ]);
      assert.strictEqual(sep.status, 'fulfilled', `iteracao ${i}: separar falhou: ${sep.reason && sep.reason.message}`);
      if (conf.status === 'rejected') {
        assert.ok([403, 409].includes(conf.reason.status), `iteracao ${i}: conferir caiu com ${conf.reason.status}: ${conf.reason.message}`);
      } else {
        // Fix-round 1 (F6): "B conferiu com sucesso" so e aceitavel se a rodada de B REGISTROU a
        // conferencia que apagou — o claim passou antes do INSERT da rodada, logo a releitura
        // (compare-and-clear, F4) tem de ter visto B e posto B em dados_anteriores.
        // eslint-disable-next-line no-await-in-loop
        const logsB = (await auditoria(db, reqId, 'SEPARACAO')).filter((l) => l.usuario_id === ALMOX_B.id);
        assert.strictEqual(logsB.length, 1, `iteracao ${i}: esperava 1 SEPARACAO de B, veio ${logsB.length}`);
        const anteriores = JSON.parse(logsB[0].dados_anteriores || 'null');
        assert.strictEqual(anteriores && anteriores.conferencia && anteriores.conferencia.usuario_id, ALMOX_B.id,
          `iteracao ${i}: B conferiu (fulfilled) mas a rodada de B nao registrou a conferencia apagada: ${logsB[0].dados_anteriores}`);
      }

      // eslint-disable-next-line no-await-in-loop
      const row = await linha(db, reqId);
      // eslint-disable-next-line no-await-in-loop
      const rodadas = await rodadasDe(db, reqId);
      const temRodadaB = rodadas.some((r) => r.usuario_id === ALMOX_B.id);
      assert.ok(temRodadaB, `iteracao ${i}: a rodada de B tem de existir`);
      assert.notStrictEqual(row.conferido_por_id, ALMOX_B.id,
        `iteracao ${i}: estado final "conferida por B" COM rodada de B (conferir ${conf.status})`);
    }
  });

  await test('[RN-05] duas conferencias simultaneas (C, D) no servico -> exatamente 1 cumprida, a outra 409', async () => {
    const matId = await criarMaterial('SEGCONF-11');
    const { id: reqId } = await criarRequisicao(db, { itens: [{ material_id: matId, quantidade_separada: 2 }] });
    await inserirRodada(db, reqId, ALMOX_A);

    const [c, d] = await Promise.allSettled([
      requisitionService.conferirSeparacao(db, reqId, ALMOX_C),
      requisitionService.conferirSeparacao(db, reqId, ALMOX_D),
    ]);
    const cumpridas = [c, d].filter((r) => r.status === 'fulfilled');
    assert.strictEqual(cumpridas.length, 1, `a corrida deixou ${cumpridas.length} conferencias passarem`);
    const recusada = [c, d].find((r) => r.status === 'rejected');
    assert.strictEqual(recusada.reason.status, 409, `a perdedora nao levou 409: ${recusada.reason.message}`);

    const row = await linha(db, reqId);
    const vencedor = cumpridas[0].value.conferencia.usuario_id;
    assert.ok([ALMOX_C.id, ALMOX_D.id].includes(vencedor));
    assert.strictEqual(row.conferido_por_id, vencedor, 'a linha nao bate com quem ganhou');
    assert.strictEqual((await auditoria(db, reqId, 'CONFERENCIA_SEPARACAO')).length, 1, 'so a vencedora audita');
  });

  // ── RN-06: liberar-retirada ────────────────────────────────────────────────────────────────
  await test('[RN-06] liberar-retirada com critico SEPARADO e sem conferencia -> 400 mensagem literal, status intacto', async () => {
    const matC = await criarMaterial('SEGCONF-12C', 50, { critico: 1 });
    const { id: reqId } = await criarRequisicao(db, { itens: [{ material_id: matC, quantidade_separada: 2 }] });

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/liberar-retirada`).send({});
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, MSG_RN06);
    assert.strictEqual((await linha(db, reqId)).status, 'EM_SEPARACAO', 'liberou apesar do 400');
    assert.strictEqual((await auditoria(db, reqId, 'LIBERACAO_RETIRADA')).length, 0, 'auditou uma liberacao que nao houve');
  });

  await test('[RN-06] liberar-retirada com critico separado E conferencia -> 200 PRONTA_PARA_RETIRADA', async () => {
    const matC = await criarMaterial('SEGCONF-13C', 50, { critico: 1 });
    const { id: reqId } = await criarRequisicao(db, { itens: [{ material_id: matC, quantidade_separada: 2 }] });
    await conferirDireto(db, reqId, ALMOX_C);

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/liberar-retirada`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'PRONTA_PARA_RETIRADA');
    const row = await linha(db, reqId);
    assert.strictEqual(row.status, 'PRONTA_PARA_RETIRADA');
    assert.strictEqual(row.conferido_por_id, ALMOX_C.id, 'liberar nao apaga a conferencia');
  });

  await test('[RN-06] liberar-retirada sem critico e sem conferencia -> 200 (comportamento de hoje)', async () => {
    const matN = await criarMaterial('SEGCONF-14N');
    const { id: reqId } = await criarRequisicao(db, { itens: [{ material_id: matN, quantidade_separada: 2 }] });
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/liberar-retirada`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual((await linha(db, reqId)).status, 'PRONTA_PARA_RETIRADA');
  });

  await test('[RN-06] universo: critico com quantidade_separada = 0 + comum separado -> 200 (achado 7)', async () => {
    const matC = await criarMaterial('SEGCONF-15C', 50, { critico: 1 });
    const matN = await criarMaterial('SEGCONF-15N');
    const { id: reqId } = await criarRequisicao(db, {
      itens: [{ material_id: matC, quantidade_separada: 0 }, { material_id: matN, quantidade_separada: 3 }],
    });
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/liberar-retirada`).send({});
    assert.strictEqual(res.status, 200, `critico nao separado nao esta na caixa: ${JSON.stringify(res.body)}`);
    assert.strictEqual((await linha(db, reqId)).status, 'PRONTA_PARA_RETIRADA');
  });

  await test('[RN-06] liberar-retirada: a ordem dos erros — Nenhum item separado vem ANTES da barreira de conferencia', async () => {
    const matC = await criarMaterial('SEGCONF-16C', 50, { critico: 1 });
    const { id: reqId } = await criarRequisicao(db, { itens: [{ material_id: matC, quantidade_separada: 0 }] });
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/liberar-retirada`).send({});
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Nenhum item separado');
  });

  // ── RN-06: entregar (achado 1 — a entrega sai direto de EM_SEPARACAO) ──────────────────────
  await test('[RN-06] entregar direto de EM_SEPARACAO com critico separado e sem conferencia -> 400 e saldo intacto', async () => {
    const matC = await criarMaterial('SEGCONF-17C', 50, { critico: 1 });
    const { id: reqId, itemIds } = await criarRequisicao(db, { itens: [{ material_id: matC, quantidade_separada: 2 }] });
    const saldoAntes = await saldoDe(db, matC);
    assert.strictEqual(saldoAntes, 50);

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemIds[0], quantidade_atendida: 2 }] });

    // A assercao de SALDO vem antes da de status DE PROPOSITO: e ela que o controle positivo (c)
    // — assertConferidaSeObrigatorio removido de entregarRequisicao — tem de derrubar, provando
    // que sem a barreira o material critico SAI do estoque, nao so que o codigo de resposta muda.
    const saldoDepois = await saldoDe(db, matC);
    assert.strictEqual(saldoDepois, saldoAntes,
      `a entrega baixou o saldo sem conferencia (${saldoAntes} -> ${saldoDepois}); resposta ${res.status}`);
    assert.strictEqual(res.status, 400, `esperava 400, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error, MSG_RN06);
    const item = await dbGet(db, 'SELECT quantidade_entregue FROM itens_requisicao_almoxarifado WHERE id = ?', [itemIds[0]]);
    assert.strictEqual(Number(item.quantidade_entregue), 0, 'quantidade_entregue mudou');
    assert.strictEqual((await linha(db, reqId)).status, 'EM_SEPARACAO', 'status mudou apesar do 400');
    const movs = await dbAll(db, 'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ?', [matC]);
    assert.strictEqual(movs.length, 0, 'saiu movimentacao sem conferencia');

    // Pelo servico direto tambem (a barreira mora em entregarRequisicao, nao na rota).
    let erro = null;
    try {
      await requisitionService.entregarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_atendida: 2 }], ALMOX_A);
    } catch (e) { erro = e; }
    assert.strictEqual(erro && erro.status, 400, `servico: ${erro && erro.message}`);
    assert.strictEqual(erro.message, MSG_RN06);
    assert.strictEqual(await saldoDe(db, matC), 50);
  });

  await test('[RN-06] entregar com critico separado E conferencia -> 200 e baixa', async () => {
    const matC = await criarMaterial('SEGCONF-18C', 50, { critico: 1 });
    const { id: reqId, itemIds } = await criarRequisicao(db, { itens: [{ material_id: matC, quantidade: 5, quantidade_separada: 2 }] });
    await conferirDireto(db, reqId, ALMOX_C);

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemIds[0], quantidade_atendida: 2 }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual(await saldoDe(db, matC), 48, 'a baixa tem de sair com conferencia');
    assert.strictEqual((await linha(db, reqId)).conferido_por_id, ALMOX_C.id, 'entregar nao apaga a conferencia');
  });

  await test('[RN-06] entregar sem critico e sem conferencia -> 200 (comportamento de hoje)', async () => {
    const matN = await criarMaterial('SEGCONF-19N');
    const { id: reqId, itemIds } = await criarRequisicao(db, { itens: [{ material_id: matN, quantidade: 2, quantidade_separada: 2 }] });
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemIds[0], quantidade_atendida: 2 }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'ENTREGUE');
    assert.strictEqual(await saldoDe(db, matN), 48);
  });

  await test('[RN-06] em PARCIALMENTE_ATENDIDA sem rodada nova a conferencia continua valendo -> 200', async () => {
    const matC = await criarMaterial('SEGCONF-20C', 50, { critico: 1 });
    const { id: reqId, itemIds } = await criarRequisicao(db, {
      status: 'PARCIALMENTE_ATENDIDA',
      itens: [{ material_id: matC, quantidade: 5, quantidade_separada: 4, quantidade_entregue: 2 }],
    });
    await conferirDireto(db, reqId, ALMOX_C);

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemIds[0], quantidade_atendida: 2 }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(await saldoDe(db, matC), 48);
  });

  await test('[RN-06] em PARCIALMENTE_ATENDIDA com critico separado e SEM conferencia -> 400 (a regra vale nos tres status de entrega)', async () => {
    const matC = await criarMaterial('SEGCONF-21C', 50, { critico: 1 });
    const { id: reqId, itemIds } = await criarRequisicao(db, {
      status: 'PARCIALMENTE_ATENDIDA',
      itens: [{ material_id: matC, quantidade: 5, quantidade_separada: 4, quantidade_entregue: 2 }],
    });
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemIds[0], quantidade_atendida: 2 }] });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, MSG_RN06);
    assert.strictEqual(await saldoDe(db, matC), 50);
  });

  // ── Fix-round 1, F2: critico nao sai alem do separado (maxEntregar da Etapa 3 soltava o teto) ──
  const msgF2 = (nome, qty, naCaixa) => `${nome}: material crítico só sai depois de separado e conferido — ${qty} excede `
    + `o separado ainda não entregue (${naCaixa}). Separe o restante e peça a segunda conferência.`;

  await test('[RN-06] critico nao sai alem do separado na segunda entrega -> 400 e saldo intacto (fix-round 1, F2)', async () => {
    // maxEntregar (Etapa 3) solta o teto do separado depois de uma entrega parcial — para material
    // comum e o comportamento desejado (reposicao chegou, entrega direta). Para critico isso
    // furava a barreira inteira: 9 unidades saiam sem rodada e sem conferencia.
    const matC = await criarMaterial('SEGCONF-24C', 50, { critico: 1 });
    const { id: reqId, itemIds } = await criarRequisicao(db, { status: 'APROVADO', itens: [{ material_id: matC, quantidade: 10 }] });
    await requisitionService.separarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_separada: 1 }], ALMOX_A);
    await requisitionService.conferirSeparacao(db, reqId, ALMOX_C);
    const ent1 = await requisitionService.entregarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_atendida: 1 }], ALMOX_A);
    assert.strictEqual(ent1.status, 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual(await saldoDe(db, matC), 49);

    let erro = null;
    try {
      await requisitionService.entregarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_atendida: 9 }], ALMOX_A);
    } catch (e) { erro = e; }
    // Saldo ANTES do status, de proposito: sem a guarda o critico SAI do estoque.
    assert.strictEqual(await saldoDe(db, matC), 49,
      `o critico saiu sem ser separado (saldo ${await saldoDe(db, matC)}); resposta ${erro ? erro.status : '200'}`);
    assert.ok(erro, 'esperava 400, entregou 9 criticos nunca separados');
    assert.strictEqual(erro.status, 400, `${erro.status}: ${erro.message}`);
    assert.strictEqual(erro.message, msgF2('Material SEGCONF-24C', 9, 0));
    let item = await dbGet(db, 'SELECT quantidade_separada, quantidade_entregue FROM itens_requisicao_almoxarifado WHERE id = ?', [itemIds[0]]);
    assert.strictEqual(Number(item.quantidade_entregue), 1);
    assert.strictEqual(Number(item.quantidade_separada), 1);
    assert.strictEqual((await linha(db, reqId)).status, 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual((await dbAll(db, 'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ?', [matC])).length, 1, 'saiu movimentacao');

    // Pela rota, o mesmo 400 (a guarda mora no servico).
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemIds[0], quantidade_atendida: 9 }] });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, msgF2('Material SEGCONF-24C', 9, 0));
    assert.strictEqual(await saldoDe(db, matC), 49);

    // O caminho certo: separar o restante (rodada nova limpa a conferencia), C confere, sai SO o separado.
    await requisitionService.separarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_separada: 3 }], ALMOX_A);
    assert.strictEqual((await linha(db, reqId)).conferido_por_id, null, 'RN-07: rodada nova limpa');
    await requisitionService.conferirSeparacao(db, reqId, ALMOX_C);
    erro = null;
    try {
      await requisitionService.entregarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_atendida: 4 }], ALMOX_A);
    } catch (e) { erro = e; }
    assert.strictEqual(erro && erro.status, 400, `4 > 3 na caixa: ${erro && erro.message}`);
    assert.strictEqual(erro.message, msgF2('Material SEGCONF-24C', 4, 3));
    assert.strictEqual(await saldoDe(db, matC), 49);
    const ent2 = await requisitionService.entregarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_atendida: 3 }], ALMOX_A);
    assert.strictEqual(ent2.status, 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual(await saldoDe(db, matC), 46, 'o separado e conferido sai');
    item = await dbGet(db, 'SELECT quantidade_separada, quantidade_entregue FROM itens_requisicao_almoxarifado WHERE id = ?', [itemIds[0]]);
    assert.strictEqual(Number(item.quantidade_entregue), 4);
  });

  await test('[RN-06] material COMUM na mesma situacao continua saindo alem do separado -> 200 (Etapa 3 preservada)', async () => {
    const matN = await criarMaterial('SEGCONF-25N', 50);
    const { id: reqId, itemIds } = await criarRequisicao(db, { status: 'APROVADO', itens: [{ material_id: matN, quantidade: 10 }] });
    await requisitionService.separarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_separada: 1 }], ALMOX_A);
    const ent1 = await requisitionService.entregarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_atendida: 1 }], ALMOX_A);
    assert.strictEqual(ent1.status, 'PARCIALMENTE_ATENDIDA');
    const ent2 = await requisitionService.entregarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_atendida: 9 }], ALMOX_A);
    assert.strictEqual(ent2.status, 'ENTREGUE', 'comum: a segunda rodada entrega direto, como na Etapa 3');
    assert.strictEqual(await saldoDe(db, matN), 40);
  });

  // ── Fix-round 1, F5: o universo da conferencia e "critico AINDA NA CAIXA", nao "critico ja separado um dia" ──
  await test('[RN-06] critico ja ENTREGUE nao esta mais na caixa: rodada nova so de comum -> conferencia_obrigatoria false e entregar o comum 200 (fix-round 1, F5)', async () => {
    const matC = await criarMaterial('SEGCONF-26C', 50, { critico: 1 });
    const matN = await criarMaterial('SEGCONF-26N', 50);
    const { id: reqId, itemIds } = await criarRequisicao(db, {
      status: 'APROVADO', itens: [{ material_id: matC, quantidade: 1 }, { material_id: matN, quantidade: 5 }],
    });
    await requisitionService.separarRequisicao(db, reqId, [
      { item_id: itemIds[0], quantidade_separada: 1 }, { item_id: itemIds[1], quantidade_separada: 2 },
    ], ALMOX_A);
    await requisitionService.conferirSeparacao(db, reqId, ALMOX_C);
    const ent1 = await requisitionService.entregarRequisicao(db, reqId, [
      { item_id: itemIds[0], quantidade_atendida: 1 }, { item_id: itemIds[1], quantidade_atendida: 2 },
    ], ALMOX_A);
    assert.strictEqual(ent1.status, 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual(await saldoDe(db, matC), 49, 'o critico saiu todo');

    // A separa mais comum: rodada nova, conferencia limpa (RN-07). O critico ja saiu — nao ha
    // critico na caixa, entao a conferencia NAO e obrigatoria para entregar o comum.
    await requisitionService.separarRequisicao(db, reqId, [{ item_id: itemIds[1], quantidade_separada: 3 }], ALMOX_A);
    const det = await request(app).get(`/api/almoxarifado/requisicoes/${reqId}`);
    assert.strictEqual(det.status, 200, JSON.stringify(det.body));
    assert.strictEqual(det.body.conferencia, null, 'rodada nova limpa a conferencia');
    assert.strictEqual(det.body.conferencia_obrigatoria, false,
      'critico separado 1 / entregue 1 nao esta na caixa: a conferencia nao pode ser exigida pelo que ja saiu');

    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemIds[1], quantidade_atendida: 3 }] });
    assert.strictEqual(res.status, 200, `entregar so o comum: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.status, 'ENTREGUE');
    assert.strictEqual(await saldoDe(db, matN), 45);
  });

  await test('[RN-06] assertConferidaSeObrigatorio e a funcao unica: lanca 400 literal so quando obrigatoria e nao conferida', async () => {
    const { assertConferidaSeObrigatorio } = requisitionService;
    assert.strictEqual(typeof assertConferidaSeObrigatorio, 'function');
    const critico = [{ material_critico: 1, quantidade_separada: 2 }];
    assert.doesNotThrow(() => assertConferidaSeObrigatorio({ conferido_por_id: 33 }, critico));
    assert.doesNotThrow(() => assertConferidaSeObrigatorio({ conferido_por_id: null }, [{ material_critico: 0, quantidade_separada: 2 }]));
    assert.doesNotThrow(() => assertConferidaSeObrigatorio({ conferido_por_id: null }, [{ material_critico: 1, quantidade_separada: 0 }]));
    // Fix-round 1 (F5): critico separado e ja entregue nao esta na caixa.
    assert.doesNotThrow(() => assertConferidaSeObrigatorio({ conferido_por_id: null }, [{ material_critico: 1, quantidade_separada: 2, quantidade_entregue: 2 }]));
    assert.throws(() => assertConferidaSeObrigatorio({ conferido_por_id: null }, critico), (e) => {
      assert.strictEqual(e.status, 400);
      assert.strictEqual(e.message, MSG_RN06);
      return true;
    });
  });

  // ── RN-08 ──────────────────────────────────────────────────────────────────────────────────
  await test('[RN-08] liberar-retirada audita LIBERACAO_RETIRADA com dados_anteriores.status e dados_novos.{status, conferido_por_id}', async () => {
    const matC = await criarMaterial('SEGCONF-22C', 50, { critico: 1 });
    const { id: reqId } = await criarRequisicao(db, { itens: [{ material_id: matC, quantidade_separada: 2 }] });
    await conferirDireto(db, reqId, ALMOX_C);

    setUser(ALMOX_B);
    let res;
    try {
      res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/liberar-retirada`).send({});
    } finally {
      setUser(ADMIN_USER);
    }
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const logs = await auditoria(db, reqId, 'LIBERACAO_RETIRADA');
    assert.strictEqual(logs.length, 1, `esperava 1 linha LIBERACAO_RETIRADA, veio ${logs.length}`);
    assert.strictEqual(logs[0].usuario_id, ALMOX_B.id);
    assert.strictEqual(logs[0].usuario_nome, 'Almox B');
    assert.deepStrictEqual(JSON.parse(logs[0].dados_anteriores), { status: 'EM_SEPARACAO' });
    assert.deepStrictEqual(JSON.parse(logs[0].dados_novos), { status: 'PRONTA_PARA_RETIRADA', conferido_por_id: ALMOX_C.id });
  });

  await test('[RN-08] liberar-retirada sem conferencia (sem critico) audita conferido_por_id null', async () => {
    const matN = await criarMaterial('SEGCONF-23N');
    const { id: reqId } = await criarRequisicao(db, { itens: [{ material_id: matN, quantidade_separada: 2 }] });
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/liberar-retirada`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const logs = await auditoria(db, reqId, 'LIBERACAO_RETIRADA');
    assert.strictEqual(logs.length, 1);
    assert.deepStrictEqual(JSON.parse(logs[0].dados_novos), { status: 'PRONTA_PARA_RETIRADA', conferido_por_id: null });
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
