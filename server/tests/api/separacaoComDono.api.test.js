/**
 * Etapa 28, Task 1 — a separação ganha dono, rodada e rastro.
 *
 * Antes desta etapa `separarRequisicao(db, id, itens)` não recebia `user`, não gravava quem
 * separou e não auditava: num almoxarifado, "quem separou?" é a primeira pergunta quando falta
 * material na caixa, e o sistema não sabia responder. Como a separação ACUMULA em rodadas, cada
 * rodada vira UMA linha append-only em `separacoes_requisicao_almoxarifado` (RN-02), o serviço
 * exige identidade (RN-01), deixa rastro na trilha (RN-04), e uma rodada nova com item efetivo
 * limpa a segunda conferência (RN-07) — a caixa mudou, a conferência anterior não vale.
 *
 * Executar: cd server && node tests/api/separacaoComDono.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const { PERFIS } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN_USER = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOX_A = { id: 21, nome: 'Almox A', role: 'user', email: 'a@test.com', perfil_almoxarifado: PERFIS.ALMOXARIFE };
const ALMOX_B = { id: 22, nome: 'Almox B', role: 'user', email: 'b@test.com', perfil_almoxarifado: PERFIS.ALMOXARIFE };

let seq = 0;
function numero() {
  seq += 1;
  return `REQ-SEPDONO-${seq}`;
}

async function criarRequisicao(db, { status = 'APROVADO', itens }) {
  const reqRes = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
    (numero, solicitante_id, solicitante_nome, status) VALUES (?, 77, 'Solicitante Teste', ?)`,
    [numero(), status]);
  const reqId = reqRes.lastID;
  const itemIds = [];
  for (const item of itens) {
    const r = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue)
      VALUES (?, ?, ?, ?, 0)`,
      [reqId, item.material_id, item.quantidade ?? 5, item.quantidade_separada ?? 0]);
    itemIds.push(r.lastID);
  }
  return { id: reqId, itemIds };
}

const contarRodadas = (db, reqId) => dbGet(db,
  'SELECT COUNT(*) AS n FROM separacoes_requisicao_almoxarifado WHERE requisicao_id = ?', [reqId])
  .then((r) => r.n);

const auditoriaSeparacao = (db, reqId) => dbAll(db,
  `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao' AND entidade_id = ?
     AND acao = 'SEPARACAO' ORDER BY id ASC`, [reqId]);

(async () => {
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN_USER });

  const fam = await request(app).post('/api/almoxarifado/familias')
    .send({ codigo: 'FAMSEPDONO', nome: 'Família Separação com Dono' });
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

  // ── RN-01 ──────────────────────────────────────────────────────────────────────────────────
  await test('[RN-01] separar sem user lanca 400 e nao grava item nem rodada', async () => {
    const matId = await criarMaterial('SEPDONO-01');
    const { id: reqId, itemIds } = await criarRequisicao(db, { itens: [{ material_id: matId }] });

    let erro = null;
    try {
      await requisitionService.separarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_separada: 2 }], undefined);
    } catch (e) { erro = e; }
    assert.ok(erro, 'esperava erro sem usuario, mas separou');
    assert.strictEqual(erro.status, 400, `status ${erro.status}: ${erro.message}`);
    assert.strictEqual(erro.message, 'Separação exige usuário identificado');

    const item = await dbGet(db, 'SELECT quantidade_separada FROM itens_requisicao_almoxarifado WHERE id = ?', [itemIds[0]]);
    assert.strictEqual(Number(item.quantidade_separada), 0, 'item nao pode ter sido separado');
    const reqRow = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(reqRow.status, 'APROVADO', 'status nao pode ter mudado');
    assert.strictEqual(await contarRodadas(db, reqId), 0, 'nenhuma rodada pode ter sido gravada');

    // `{}` (user sem id) e a mesma coisa que undefined
    let erro2 = null;
    try {
      await requisitionService.separarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_separada: 2 }], { nome: 'Sem Id' });
    } catch (e) { erro2 = e; }
    assert.strictEqual(erro2 && erro2.status, 400, 'user sem id tambem e recusado');
  });

  await test('[RN-01] pela ROTA, req.user chega ao servico (rodada com usuario_id do ALMOX)', async () => {
    const matId = await criarMaterial('SEPDONO-02');
    const { id: reqId, itemIds } = await criarRequisicao(db, { itens: [{ material_id: matId }] });

    setUser(ALMOX_A);
    try {
      const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/separacao`)
        .send({ itens_separados: [{ item_id: itemIds[0], quantidade_separada: 3 }] });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.status, 'EM_SEPARACAO');
      assert.ok(Number.isInteger(res.body.rodada_id) && res.body.rodada_id > 0, `rodada_id: ${res.body.rodada_id}`);
      assert.strictEqual(res.body.itens_tocados, 1);

      const rodada = await dbGet(db, 'SELECT * FROM separacoes_requisicao_almoxarifado WHERE id = ?', [res.body.rodada_id]);
      assert.ok(rodada, 'rodada gravada');
      assert.strictEqual(rodada.usuario_id, ALMOX_A.id, 'usuario_id da rodada tem de ser o de req.user');
      assert.strictEqual(rodada.usuario_nome, ALMOX_A.nome);
      assert.strictEqual(rodada.requisicao_id, reqId);
    } finally {
      setUser(ADMIN_USER);
    }
  });

  await test('[RN-01] payload misto valido+invalido -> 400 e NADA gravado (fix-round 1, F1)', async () => {
    // Antes do fix-round o laco gravava item a item e lancava 400 no meio: o item valido ficava
    // gravado SEM rodada — e sem rodada nao ha dono, quem separou confere a propria caixa, e a
    // conferencia preexistente sobrevive a uma caixa que mudou. A separacao tem de ser tudo ou nada.
    const matCritico = await criarMaterial('SEPDONO-F1C', 50, { critico: 1 });
    const matComum = await criarMaterial('SEPDONO-F1N', 50);
    const { id: reqId, itemIds } = await criarRequisicao(db, {
      status: 'APROVADO',
      itens: [
        { material_id: matCritico, quantidade: 10, quantidade_separada: 1 },
        { material_id: matComum, quantidade: 10 },
      ],
    });
    await dbRun(db, `UPDATE requisicoes_almoxarifado
      SET conferido_por_id = 99, conferido_por_nome = 'Conferente', conferido_em = '2026-08-30 08:00:00' WHERE id = ?`, [reqId]);

    const payload = [
      { item_id: itemIds[0], quantidade_separada: 2 }, // valido sozinho
      { item_id: itemIds[1], quantidade_separada: 99999 }, // estoura o maximo
    ];
    let erro = null;
    try {
      await requisitionService.separarRequisicao(db, reqId, payload, ALMOX_A);
    } catch (e) { erro = e; }
    assert.ok(erro, 'esperava 400 pelo item que estoura, mas separou');
    assert.strictEqual(erro.status, 400, `status ${erro.status}: ${erro.message}`);
    assert.ok(erro.message.startsWith('Material SEPDONO-F1N:'), `o 400 tem de citar o item que estourou: ${erro.message}`);

    const critico = await dbGet(db, 'SELECT quantidade_separada FROM itens_requisicao_almoxarifado WHERE id = ?', [itemIds[0]]);
    assert.strictEqual(Number(critico.quantidade_separada), 1,
      `o item valido foi gravado apesar do 400 (quantidade_separada = ${critico.quantidade_separada})`);
    const comum = await dbGet(db, 'SELECT quantidade_separada FROM itens_requisicao_almoxarifado WHERE id = ?', [itemIds[1]]);
    assert.strictEqual(Number(comum.quantidade_separada), 0);
    assert.strictEqual(await contarRodadas(db, reqId), 0, 'rodada gravada apesar do 400');
    const row = await dbGet(db, 'SELECT status, conferido_por_id FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(row.status, 'APROVADO', 'status mudou apesar do 400');
    assert.strictEqual(row.conferido_por_id, 99, 'a conferencia preexistente foi apagada apesar do 400');
    assert.strictEqual((await auditoriaSeparacao(db, reqId)).length, 0, 'auditou uma rodada que nao houve');

    // Pela rota, o mesmo — e o status do 400 e o do servico, nao um 500.
    setUser(ALMOX_A);
    let res;
    try {
      res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/separacao`).send({ itens_separados: payload });
    } finally {
      setUser(ADMIN_USER);
    }
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    const criticoDepois = await dbGet(db, 'SELECT quantidade_separada FROM itens_requisicao_almoxarifado WHERE id = ?', [itemIds[0]]);
    assert.strictEqual(Number(criticoDepois.quantidade_separada), 1, 'pela rota o item valido foi gravado apesar do 400');
    assert.strictEqual(await contarRodadas(db, reqId), 0);
  });

  // ── RN-02 ──────────────────────────────────────────────────────────────────────────────────
  await test('[RN-02] duas rodadas, duas pessoas, duas linhas — nenhuma apaga a outra', async () => {
    const matId = await criarMaterial('SEPDONO-03');
    const { id: reqId, itemIds } = await criarRequisicao(db, { itens: [{ material_id: matId, quantidade: 5 }] });

    const r1 = await requisitionService.separarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_separada: 1 }], ALMOX_A);
    const r2 = await requisitionService.separarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_separada: 1 }], ALMOX_B);
    assert.ok(r1.rodada_id && r2.rodada_id && r1.rodada_id !== r2.rodada_id, 'ids diferentes');

    const rodadas = await requisitionService.listarSeparacoes(db, reqId);
    assert.strictEqual(rodadas.length, 2, `esperava 2 rodadas, veio ${rodadas.length}`);
    assert.deepStrictEqual(rodadas.map((r) => r.usuario_id), [ALMOX_A.id, ALMOX_B.id], 'ordem ASC');
    assert.deepStrictEqual(rodadas.map((r) => r.id), [r1.rodada_id, r2.rodada_id]);
    assert.strictEqual(rodadas[0].usuario_nome, 'Almox A');
    assert.strictEqual(rodadas[1].usuario_nome, 'Almox B');
    assert.strictEqual(rodadas[0].itens_tocados, 1);
    assert.deepStrictEqual(rodadas[0].itens, [{ item_id: itemIds[0], material_id: matId, quantidade: 1 }]);
    assert.deepStrictEqual(rodadas[1].itens, [{ item_id: itemIds[0], material_id: matId, quantidade: 1 }]);
    assert.ok(rodadas[0].created_at, 'created_at preenchido');

    const item = await dbGet(db, 'SELECT quantidade_separada FROM itens_requisicao_almoxarifado WHERE id = ?', [itemIds[0]]);
    assert.strictEqual(Number(item.quantidade_separada), 2, 'as duas rodadas somam');
  });

  await test('[RN-02] rodada sem item efetivo nao gera linha, mas o status vira EM_SEPARACAO (e a conferencia fica)', async () => {
    const matId = await criarMaterial('SEPDONO-04');
    const { id: reqId, itemIds } = await criarRequisicao(db, { itens: [{ material_id: matId, quantidade: 5 }] });
    await dbRun(db, `UPDATE requisicoes_almoxarifado
      SET conferido_por_id = 99, conferido_por_nome = 'Conferente', conferido_em = '2026-08-29 10:00:00' WHERE id = ?`, [reqId]);

    const rVazia = await requisitionService.separarRequisicao(db, reqId, [], ALMOX_A);
    assert.strictEqual(rVazia.status, 'EM_SEPARACAO');
    assert.strictEqual(rVazia.rodada_id, null, '[] nao e rodada');
    assert.strictEqual(rVazia.itens_tocados, 0);

    const rZero = await requisitionService.separarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_separada: 0 }], ALMOX_A);
    assert.strictEqual(rZero.rodada_id, null, 'quantidade 0 nao e rodada');
    assert.strictEqual(rZero.itens_tocados, 0);

    // item inexistente tambem nao conta
    const rFantasma = await requisitionService.separarRequisicao(db, reqId, [{ item_id: 999999, quantidade_separada: 3 }], ALMOX_A);
    assert.strictEqual(rFantasma.rodada_id, null, 'item inexistente nao e rodada');

    assert.strictEqual(await contarRodadas(db, reqId), 0, 'nenhuma linha de rodada');
    const row = await dbGet(db, 'SELECT status, conferido_por_id, conferido_por_nome, conferido_em FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(row.status, 'EM_SEPARACAO', 'o UPDATE de status continua incondicional (Iniciar Separacao com quantidades zeradas)');
    assert.strictEqual(row.conferido_por_id, 99, 'sem item efetivo a caixa nao mudou: a conferencia FICA');
    assert.strictEqual(row.conferido_por_nome, 'Conferente');
    assert.strictEqual(row.conferido_em, '2026-08-29 10:00:00');
    assert.strictEqual((await auditoriaSeparacao(db, reqId)).length, 0, 'sem rodada nao ha SEPARACAO na trilha');
  });

  // ── RN-04 ──────────────────────────────────────────────────────────────────────────────────
  await test('[RN-04] a trilha mostra SEPARACAO com dados_novos.rodada_id e os itens', async () => {
    const matA = await criarMaterial('SEPDONO-05A');
    const matB = await criarMaterial('SEPDONO-05B');
    const { id: reqId, itemIds } = await criarRequisicao(db, {
      itens: [{ material_id: matA, quantidade: 5 }, { material_id: matB, quantidade: 5 }],
    });

    const r = await requisitionService.separarRequisicao(db, reqId, [
      { item_id: itemIds[0], quantidade_separada: 2 },
      { item_id: itemIds[1], quantidade_separada: 0 },
    ], ALMOX_B);
    assert.strictEqual(r.itens_tocados, 1, 'so o item com quantidade > 0 conta');

    const logs = await auditoriaSeparacao(db, reqId);
    assert.strictEqual(logs.length, 1, `esperava 1 linha SEPARACAO, veio ${logs.length}`);
    const log = logs[0];
    assert.strictEqual(log.usuario_id, ALMOX_B.id);
    assert.strictEqual(log.usuario_nome, 'Almox B');
    const novos = JSON.parse(log.dados_novos);
    assert.strictEqual(novos.rodada_id, r.rodada_id, 'dados_novos.rodada_id aponta para a rodada');
    assert.strictEqual(novos.itens_tocados, 1);
    assert.deepStrictEqual(novos.itens, [{ item_id: itemIds[0], quantidade: 2 }]);
    assert.strictEqual(log.dados_anteriores, null, 'sem conferencia anterior nao ha dados_anteriores');
  });

  // ── RN-07 ──────────────────────────────────────────────────────────────────────────────────
  await test('[RN-07] rodada nova com item efetivo limpa a conferencia e a registra em dados_anteriores', async () => {
    const matId = await criarMaterial('SEPDONO-06');
    const { id: reqId, itemIds } = await criarRequisicao(db, {
      status: 'EM_SEPARACAO', itens: [{ material_id: matId, quantidade: 5, quantidade_separada: 1 }],
    });
    await dbRun(db, `UPDATE requisicoes_almoxarifado
      SET conferido_por_id = 99, conferido_por_nome = 'Conferente Anterior', conferido_em = '2026-08-29 11:00:00'
      WHERE id = ?`, [reqId]);

    const r = await requisitionService.separarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_separada: 2 }], ALMOX_A);
    assert.ok(r.rodada_id, 'rodada gravada');

    const row = await dbGet(db, 'SELECT conferido_por_id, conferido_por_nome, conferido_em FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(row.conferido_por_id, null, 'conferido_por_id tem de voltar a NULL: a caixa mudou');
    assert.strictEqual(row.conferido_por_nome, null);
    assert.strictEqual(row.conferido_em, null);

    const logs = await auditoriaSeparacao(db, reqId);
    assert.strictEqual(logs.length, 1);
    const anteriores = JSON.parse(logs[0].dados_anteriores || 'null');
    assert.ok(anteriores && anteriores.conferencia, 'dados_anteriores.conferencia registra o que foi apagado');
    assert.strictEqual(anteriores.conferencia.usuario_id, 99);
    assert.strictEqual(anteriores.conferencia.usuario_nome, 'Conferente Anterior');
    assert.strictEqual(anteriores.conferencia.em, '2026-08-29 11:00:00');
  });

  await test('[RN-07] compare-and-clear: conferencia que entra ENTRE a releitura e o UPDATE vai para dados_anteriores e e limpa (fix-round 1, F4)', async () => {
    // Antes do fix-round a releitura "imediatamente antes do UPDATE" nao provava nada: uma
    // conferencia que entrasse entre as duas era apagada com dados_anteriores null — e a mutacao
    // "usar o reqRow inicial" passava 38/38. O UPDATE agora e compare-and-clear
    // (`WHERE conferido_por_id IS <valor relido>`): se a linha mudou, changes = 0, rele e repete.
    const matId = await criarMaterial('SEPDONO-F4');
    const { id: reqId, itemIds } = await criarRequisicao(db, {
      status: 'EM_SEPARACAO', itens: [{ material_id: matId, quantidade: 10, quantidade_separada: 1 }],
    });
    const CONFERENTE_C = 33;
    const RELEITURA = 'SELECT conferido_por_id, conferido_por_nome, conferido_em FROM requisicoes_almoxarifado';

    // Hook one-shot em db.get: na PRIMEIRA releitura (que ve NULL), C confere por UPDATE direto
    // antes de a linha relida chegar ao servico — exatamente a janela do achado.
    const origGet = db.get.bind(db);
    let disparos = 0;
    db.get = function (sql, params, cb) {
      if (disparos === 0 && typeof sql === 'string' && sql.includes(RELEITURA)) {
        disparos += 1;
        return origGet(sql, params, (err, row) => {
          dbRun(db, `UPDATE requisicoes_almoxarifado
            SET conferido_por_id = ?, conferido_por_nome = 'Almox C', conferido_em = '2026-08-30 09:30:00' WHERE id = ?`,
          [CONFERENTE_C, reqId]).then(() => cb(err, row), (e) => cb(e));
        });
      }
      return origGet(sql, params, cb);
    };

    let r;
    try {
      r = await requisitionService.separarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_separada: 1 }], ALMOX_A);
    } finally {
      db.get = origGet;
    }
    assert.strictEqual(disparos, 1, 'a releitura da conferencia nao aconteceu (o hook nao disparou)');
    assert.ok(r.rodada_id, 'rodada gravada');

    const row = await dbGet(db, 'SELECT conferido_por_id, conferido_por_nome, conferido_em FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(row.conferido_por_id, null, 'estado final tem de ser limpo: a caixa mudou');
    assert.strictEqual(row.conferido_por_nome, null);

    const logs = await auditoriaSeparacao(db, reqId);
    assert.strictEqual(logs.length, 1);
    const anteriores = JSON.parse(logs[0].dados_anteriores || 'null');
    assert.ok(anteriores && anteriores.conferencia,
      `a conferencia de C foi apagada sem aparecer na trilha (dados_anteriores = ${logs[0].dados_anteriores})`);
    assert.strictEqual(anteriores.conferencia.usuario_id, CONFERENTE_C, 'dados_anteriores tem de trazer a conferencia que entrou na janela');
    assert.strictEqual(anteriores.conferencia.usuario_nome, 'Almox C');
    assert.strictEqual(anteriores.conferencia.em, '2026-08-30 09:30:00');
  });

  // ── RN-09 ──────────────────────────────────────────────────────────────────────────────────
  await test('[RN-09] GET /requisicoes/:id devolve separacoes, conferencia null e conferencia_obrigatoria=true com critico separado', async () => {
    const matCritico = await criarMaterial('SEPDONO-07C', 50, { critico: 1 });
    const matComum = await criarMaterial('SEPDONO-07N', 50);
    const { id: reqId, itemIds } = await criarRequisicao(db, {
      itens: [{ material_id: matCritico, quantidade: 5 }, { material_id: matComum, quantidade: 5 }],
    });

    // antes de separar: sem rodada, sem conferencia, e nada critico SEPARADO -> false
    const antes = await request(app).get(`/api/almoxarifado/requisicoes/${reqId}`);
    assert.strictEqual(antes.status, 200, JSON.stringify(antes.body));
    assert.deepStrictEqual(antes.body.separacoes, [], 'separacoes vazio antes de separar');
    assert.strictEqual(antes.body.conferencia, null);
    assert.strictEqual(antes.body.conferencia_obrigatoria, false,
      'critico com quantidade_separada = 0 nao esta na caixa (universo, achado 7)');
    assert.ok(antes.body.itens.every((i) => 'material_critico' in i), 'itens trazem material_critico');

    await requisitionService.separarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_separada: 1 }], ALMOX_A);

    const depois = await request(app).get(`/api/almoxarifado/requisicoes/${reqId}`);
    assert.strictEqual(depois.status, 200, JSON.stringify(depois.body));
    assert.strictEqual(depois.body.separacoes.length, 1);
    assert.strictEqual(depois.body.separacoes[0].usuario_id, ALMOX_A.id);
    assert.strictEqual(depois.body.separacoes[0].usuario_nome, 'Almox A');
    assert.strictEqual(depois.body.separacoes[0].itens_tocados, 1);
    assert.strictEqual(depois.body.conferencia, null, 'ninguem conferiu');
    assert.strictEqual(depois.body.conferencia_obrigatoria, true, 'critico separado -> conferencia obrigatoria');
  });

  await test('[RN-09] GET: sem material critico conferencia_obrigatoria=false; com conferencia gravada devolve o objeto', async () => {
    const matComum = await criarMaterial('SEPDONO-08');
    const { id: reqId, itemIds } = await criarRequisicao(db, { itens: [{ material_id: matComum, quantidade: 5 }] });
    await requisitionService.separarRequisicao(db, reqId, [{ item_id: itemIds[0], quantidade_separada: 2 }], ALMOX_A);

    const semCritico = await request(app).get(`/api/almoxarifado/requisicoes/${reqId}`);
    assert.strictEqual(semCritico.status, 200);
    assert.strictEqual(semCritico.body.conferencia_obrigatoria, false, 'sem critico -> opcional');

    await dbRun(db, `UPDATE requisicoes_almoxarifado
      SET conferido_por_id = 33, conferido_por_nome = 'Conferente C', conferido_em = '2026-08-29 12:00:00' WHERE id = ?`, [reqId]);
    const conferida = await request(app).get(`/api/almoxarifado/requisicoes/${reqId}`);
    assert.deepStrictEqual(conferida.body.conferencia, { usuario_id: 33, usuario_nome: 'Conferente C', em: '2026-08-29 12:00:00' });
  });

  await test('[RN-09] conferenciaObrigatoria(itens) e a regua unica: critico AND (separado - entregue) > 0', async () => {
    const { conferenciaObrigatoria } = requisitionService;
    assert.strictEqual(conferenciaObrigatoria([]), false);
    assert.strictEqual(conferenciaObrigatoria([{ material_critico: 1, quantidade_separada: 0 }]), false);
    assert.strictEqual(conferenciaObrigatoria([{ material_critico: 0, quantidade_separada: 3 }]), false);
    assert.strictEqual(conferenciaObrigatoria([{ material_critico: 1, quantidade_separada: 3 }]), true);
    assert.strictEqual(conferenciaObrigatoria([{ material_critico: '1', quantidade_separada: '2' }]), true, 'texto do sqlite conta');
    // Fix-round 1 (F5): critico ja ENTREGUE nao esta mais na caixa — o universo e "critico ainda na caixa".
    assert.strictEqual(conferenciaObrigatoria([{ material_critico: 1, quantidade_separada: 3, quantidade_entregue: 3 }]), false,
      'critico separado 3 / entregue 3: nada na caixa');
    assert.strictEqual(conferenciaObrigatoria([{ material_critico: 1, quantidade_separada: 3, quantidade_entregue: 2 }]), true,
      'critico separado 3 / entregue 2: ainda ha 1 na caixa');
    assert.strictEqual(conferenciaObrigatoria([{ material_critico: '1', quantidade_separada: '2', quantidade_entregue: '2' }]), false,
      'texto do sqlite no entregue tambem conta');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
