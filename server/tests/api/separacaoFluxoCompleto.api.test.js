/**
 * Etapa 28, Task 4 — o fluxo inteiro pela rota, com três pessoas.
 *
 * As Tasks 1 e 2 provaram cada regra isolada (RN-01..RN-09), quase sempre com a requisição
 * INSERTada direto no banco. Este arquivo cruza as rotas na ordem em que o almoxarifado as usa:
 * requisição criada pelo solicitante (PRODUCAO), enviada, aprovada com reserva real, separada em
 * rodadas por pessoas diferentes (A, B), conferida por uma terceira (C), liberada, entregue em
 * partes — e o que cada rota diz no meio do caminho. Nada aqui é INSERT direto em requisição,
 * item, rodada ou conferência: se uma rota discorda da outra, é aqui que aparece.
 *
 * Executar: cd server && node tests/api/separacaoFluxoCompleto.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN_USER = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOX_A = { id: 41, nome: 'Almox A', role: 'user', email: 'a@test.com', perfil_almoxarifado: PERFIS.ALMOXARIFE };
const ALMOX_B = { id: 42, nome: 'Almox B', role: 'user', email: 'b@test.com', perfil_almoxarifado: PERFIS.ALMOXARIFE };
const ALMOX_C = { id: 43, nome: 'Almox C', role: 'user', email: 'c@test.com', perfil_almoxarifado: PERFIS.ALMOXARIFE };
const PRODUCAO = { id: 45, nome: 'Solicitante Producao', role: 'user', email: 'p@test.com', perfil_almoxarifado: PERFIS.PRODUCAO };

const MSG_RN06 = 'Esta requisição tem material crítico separado e ainda não passou pela segunda '
  + 'conferência. Peça a outra pessoa do almoxarifado para conferir a separação antes de liberar ou entregar.';

const VERBOS_ETAPA_28 = ['SEPARACAO', 'CONFERENCIA_SEPARACAO', 'LIBERACAO_RETIRADA'];

(async () => {
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN_USER });

  const saldoDe = (matId) => dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId])
    .then((r) => Number(r.quantidade_atual));
  const trilhaEtapa28 = (reqId) => dbAll(db,
    `SELECT acao, usuario_id FROM auditoria_log_almoxarifado
      WHERE entidade = 'requisicao' AND entidade_id = ? AND acao IN (${VERBOS_ETAPA_28.map(() => '?').join(',')})
      ORDER BY id ASC`, [reqId, ...VERBOS_ETAPA_28]);

  // Um usuário por vez no harness: toda chamada "como fulano" restaura o admin ao sair, para
  // que um passo que falhe no meio não contamine o seguinte com o usuário errado.
  async function como(user, fn) {
    setUser(user);
    try { return await fn(); } finally { setUser(ADMIN_USER); }
  }
  const base = '/api/almoxarifado/requisicoes';
  const separar = (user, reqId, itens) => como(user, () => request(app).put(`${base}/${reqId}/separacao`)
    .send({ itens_separados: itens }));
  const conferir = (user, reqId) => como(user, () => request(app).put(`${base}/${reqId}/conferir-separacao`).send({}));
  const liberar = (user, reqId) => como(user, () => request(app).put(`${base}/${reqId}/liberar-retirada`).send({}));
  const entregar = (user, reqId, itens) => como(user, () => request(app).put(`${base}/${reqId}/entregar`)
    .send({ itens_atendidos: itens }));
  const detalhe = (user, reqId) => como(user, () => request(app).get(`${base}/${reqId}`));

  const fam = await request(app).post('/api/almoxarifado/familias')
    .send({ codigo: 'FAMFLUXO', nome: 'Família Fluxo Completo' });
  assert.strictEqual(fam.status, 201, JSON.stringify(fam.body));
  const familiaId = fam.body.id;

  async function criarMaterial(codigo, quantidadeAtual = 50, { critico = 0 } = {}) {
    const res = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo, nome: `Material ${codigo}`, familia_id: familiaId, unidade: 'UN' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    // Saldo inicial e criticidade: as duas colunas não têm rota de escrita própria no harness
    // (saldo entra por recebimento; crítico é atributo cadastral), então ficam como nos testes
    // das Tasks 1 e 2. Requisição, rodada, conferência e entrega — o objeto desta task — nunca.
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ?, material_critico = ? WHERE id = ?',
      [quantidadeAtual, critico, res.body.id]);
    return res.body.id;
  }

  /**
   * Requisição pela porta da frente: PRODUCAO salva rascunho, envia, e um ALMOXARIFE (≠ solicitante,
   * pela segregação da /aprovar) aprova — a aprovação cria a reserva real de cada item.
   * Devolve { id, itemPor: { [material_id]: item_id } }.
   */
  async function criarRequisicaoAprovada({ matC, matN, qtdC = 4, qtdN = 5 }) {
    const criacao = await como(PRODUCAO, () => request(app).post(base).send({
      salvar_rascunho: true,
      setor: null,
      itens: [{ material_id: matC, quantidade: qtdC }, { material_id: matN, quantidade: qtdN }],
    }));
    assert.strictEqual(criacao.status, 201, `criar: ${JSON.stringify(criacao.body)}`);
    assert.strictEqual(criacao.body.status, 'RASCUNHO');
    const reqId = criacao.body.id;

    const envio = await como(PRODUCAO, () => request(app).post(`${base}/${reqId}/enviar`).send({}));
    assert.strictEqual(envio.status, 200, `enviar: ${JSON.stringify(envio.body)}`);
    assert.strictEqual(envio.body.status, 'PENDENTE');

    const aprov = await como(ALMOX_A, () => request(app).put(`${base}/${reqId}/aprovar`).send({}));
    assert.strictEqual(aprov.status, 200, `aprovar: ${JSON.stringify(aprov.body)}`);
    assert.strictEqual(aprov.body.status, 'TOTALMENTE_RESERVADA', JSON.stringify(aprov.body));
    assert.strictEqual(aprov.body.reservas.length, 2, 'uma reserva real por item');

    const det = await detalhe(ALMOX_A, reqId);
    assert.strictEqual(det.status, 200, JSON.stringify(det.body));
    const itemPor = {};
    for (const it of det.body.itens) itemPor[it.material_id] = it.id;
    assert.ok(itemPor[matC] && itemPor[matN], `itens no detalhe: ${JSON.stringify(det.body.itens)}`);
    return { id: reqId, itemPor };
  }

  // ── Fluxo 1: sem crítico separado, a RN-06 não vale (comportamento de hoje) ────────────────
  await test('[Fluxo 1] critico + comum aprovados por reserva; A separa SO o comum -> entregar direto 200, sem conferencia', async () => {
    const matC = await criarMaterial('FLUXO1-C', 50, { critico: 1 });
    const matN = await criarMaterial('FLUXO1-N', 50);
    const { id: reqId, itemPor } = await criarRequisicaoAprovada({ matC, matN });

    const sep = await separar(ALMOX_A, reqId, [{ item_id: itemPor[matN], quantidade_separada: 2 }]);
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));
    assert.strictEqual(sep.body.status, 'EM_SEPARACAO');
    assert.strictEqual(sep.body.itens_tocados, 1);

    const det = await detalhe(ALMOX_A, reqId);
    assert.strictEqual(det.body.separacoes.length, 1);
    assert.strictEqual(det.body.separacoes[0].usuario_id, ALMOX_A.id);
    assert.strictEqual(det.body.conferencia, null);
    assert.strictEqual(det.body.conferencia_obrigatoria, false, 'critico com quantidade_separada = 0 nao esta na caixa');

    const ent = await entregar(ALMOX_A, reqId, [{ item_id: itemPor[matN], quantidade_atendida: 2 }]);
    assert.strictEqual(ent.status, 200, `esperava 200 sem critico separado, veio ${ent.status}: ${JSON.stringify(ent.body)}`);
    assert.strictEqual(ent.body.status, 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual(await saldoDe(matN), 48, 'a entrega do comum baixa saldo');
    assert.strictEqual(await saldoDe(matC), 50, 'o critico nao foi entregue');
  });

  // ── Fluxo 2: o principal ───────────────────────────────────────────────────────────────────
  await test('[Fluxo 2] duas rodadas (A, B), tres 403/400 no meio, C confere, libera, entrega em partes, rodada nova limpa e o ciclo fecha em ENTREGUE', async () => {
    const matC = await criarMaterial('FLUXO2-C', 50, { critico: 1 });
    const matN = await criarMaterial('FLUXO2-N', 50);
    const { id: reqId, itemPor } = await criarRequisicaoAprovada({ matC, matN, qtdC: 4, qtdN: 5 });
    const itemC = itemPor[matC];
    const itemN = itemPor[matN];

    // A separa os dois; B separa mais uma unidade do comum (segunda rodada).
    const rA = await separar(ALMOX_A, reqId, [
      { item_id: itemC, quantidade_separada: 2 }, { item_id: itemN, quantidade_separada: 2 },
    ]);
    assert.strictEqual(rA.status, 200, JSON.stringify(rA.body));
    assert.strictEqual(rA.body.itens_tocados, 2);
    const rB = await separar(ALMOX_B, reqId, [{ item_id: itemN, quantidade_separada: 1 }]);
    assert.strictEqual(rB.status, 200, JSON.stringify(rB.body));
    assert.ok(rA.body.rodada_id && rB.body.rodada_id && rA.body.rodada_id !== rB.body.rodada_id, 'duas rodadas distintas');

    let det = await detalhe(ALMOX_C, reqId);
    assert.strictEqual(det.status, 200, JSON.stringify(det.body));
    assert.strictEqual(det.body.status, 'EM_SEPARACAO');
    assert.strictEqual(det.body.separacoes.length, 2, `esperava 2 rodadas, veio ${det.body.separacoes.length}`);
    assert.deepStrictEqual(det.body.separacoes.map((s) => s.usuario_id), [ALMOX_A.id, ALMOX_B.id]);
    assert.strictEqual(det.body.conferencia, null);
    assert.strictEqual(det.body.conferencia_obrigatoria, true, 'critico separado exige conferencia');

    // Quem separou não confere — rota + status + mensagem citando a rodada de cada um.
    const confA = await conferir(ALMOX_A, reqId);
    assert.strictEqual(confA.status, 403, `A: esperava 403, veio ${confA.status}: ${JSON.stringify(confA.body)}`);
    assert.strictEqual(confA.body.error,
      `Quem separou não confere: você registrou a rodada de separação #${rA.body.rodada_id} desta requisição. `
      + 'A segunda conferência tem de ser de outra pessoa.');
    const confB = await conferir(ALMOX_B, reqId);
    assert.strictEqual(confB.status, 403, `B: esperava 403, veio ${confB.status}: ${JSON.stringify(confB.body)}`);
    assert.ok(confB.body.error.includes(`#${rB.body.rodada_id}`), confB.body.error);

    // As DUAS saídas barram: entregar (com saldo intacto) e liberar. Conferimos a mensagem da
    // RN-06 literal — `'Nenhum item separado'` existe nas duas rotas e um 400 genérico não prova nada.
    const entSem = await entregar(ALMOX_A, reqId, [{ item_id: itemC, quantidade_atendida: 1 }]);
    assert.strictEqual(await saldoDe(matC), 50, `a entrega baixou saldo sem conferencia (resposta ${entSem.status})`);
    assert.strictEqual(entSem.status, 400, `entregar: esperava 400, veio ${entSem.status}: ${JSON.stringify(entSem.body)}`);
    assert.strictEqual(entSem.body.error, MSG_RN06);
    const libSem = await liberar(ALMOX_A, reqId);
    assert.strictEqual(libSem.status, 400, `liberar: esperava 400, veio ${libSem.status}: ${JSON.stringify(libSem.body)}`);
    assert.strictEqual(libSem.body.error, MSG_RN06);
    det = await detalhe(ALMOX_C, reqId);
    assert.strictEqual(det.body.status, 'EM_SEPARACAO', 'liberar/entregar mudaram o status apesar do 400');

    // C (não separou) confere.
    const confC = await conferir(ALMOX_C, reqId);
    assert.strictEqual(confC.status, 200, JSON.stringify(confC.body));
    det = await detalhe(ALMOX_A, reqId);
    assert.ok(det.body.conferencia, 'GET sem conferencia depois do 200 de C');
    assert.strictEqual(det.body.conferencia.usuario_id, ALMOX_C.id);
    assert.strictEqual(det.body.conferencia.usuario_nome, 'Almox C');

    const lib = await liberar(ALMOX_A, reqId);
    assert.strictEqual(lib.status, 200, JSON.stringify(lib.body));
    assert.strictEqual(lib.body.status, 'PRONTA_PARA_RETIRADA');

    let trilha = await trilhaEtapa28(reqId);
    assert.deepStrictEqual(trilha.map((t) => t.acao),
      ['SEPARACAO', 'SEPARACAO', 'CONFERENCIA_SEPARACAO', 'LIBERACAO_RETIRADA'],
      `trilha fora de ordem: ${JSON.stringify(trilha)}`);
    assert.deepStrictEqual(trilha.map((t) => t.usuario_id), [ALMOX_A.id, ALMOX_B.id, ALMOX_C.id, ALMOX_A.id]);

    // Entrega parcial: só parte do crítico.
    const ent1 = await entregar(ALMOX_A, reqId, [{ item_id: itemC, quantidade_atendida: 1 }]);
    assert.strictEqual(ent1.status, 200, JSON.stringify(ent1.body));
    assert.strictEqual(ent1.body.status, 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual(await saldoDe(matC), 49, 'a entrega parcial baixa o saldo do critico');

    // Entregar de novo SEM rodada nova: a conferência de C continua valendo.
    const ent2 = await entregar(ALMOX_B, reqId, [{ item_id: itemN, quantidade_atendida: 1 }]);
    assert.strictEqual(ent2.status, 200, `sem rodada nova a conferencia vale: ${JSON.stringify(ent2.body)}`);
    assert.strictEqual(ent2.body.status, 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual(await saldoDe(matN), 49);
    det = await detalhe(ALMOX_A, reqId);
    assert.strictEqual(det.body.conferencia && det.body.conferencia.usuario_id, ALMOX_C.id, 'entregar nao apaga a conferencia');

    // A separa de novo (rodada com item efetivo): a caixa mudou, a conferência cai (RN-07).
    const rA2 = await separar(ALMOX_A, reqId, [{ item_id: itemC, quantidade_separada: 1 }]);
    assert.strictEqual(rA2.status, 200, JSON.stringify(rA2.body));
    assert.strictEqual(rA2.body.status, 'EM_SEPARACAO');
    assert.ok(rA2.body.rodada_id > rB.body.rodada_id, 'rodada nova');
    det = await detalhe(ALMOX_B, reqId);
    assert.strictEqual(det.body.status, 'EM_SEPARACAO');
    assert.strictEqual(det.body.conferencia, null, 'RN-07: rodada nova tem de limpar a conferencia');
    assert.strictEqual(det.body.separacoes.length, 3);
    assert.strictEqual(det.body.conferencia_obrigatoria, true);

    const ent3 = await entregar(ALMOX_A, reqId, [{ item_id: itemC, quantidade_atendida: 1 }]);
    assert.strictEqual(await saldoDe(matC), 49, `entregou sem conferencia depois da rodada nova (resposta ${ent3.status})`);
    assert.strictEqual(ent3.status, 400, `esperava 400 de novo, veio ${ent3.status}: ${JSON.stringify(ent3.body)}`);
    assert.strictEqual(ent3.body.error, MSG_RN06);

    // C confere de novo (a conferência anterior foi limpa, então não é "segunda conferência" -> 409).
    const confC2 = await conferir(ALMOX_C, reqId);
    assert.strictEqual(confC2.status, 200, `C de novo: ${JSON.stringify(confC2.body)}`);

    // Entrega o resto: crítico pendente 3 (4 - 1), comum pendente 4 (5 - 1).
    const ent4 = await entregar(ALMOX_A, reqId, [
      { item_id: itemC, quantidade_atendida: 3 }, { item_id: itemN, quantidade_atendida: 4 },
    ]);
    assert.strictEqual(ent4.status, 200, JSON.stringify(ent4.body));
    assert.strictEqual(ent4.body.status, 'ENTREGUE');
    assert.strictEqual(await saldoDe(matC), 46);
    assert.strictEqual(await saldoDe(matN), 45);
    det = await detalhe(ALMOX_A, reqId);
    assert.strictEqual(det.body.status, 'ENTREGUE');

    trilha = await trilhaEtapa28(reqId);
    assert.deepStrictEqual(trilha.map((t) => t.acao), [
      'SEPARACAO', 'SEPARACAO', 'CONFERENCIA_SEPARACAO', 'LIBERACAO_RETIRADA',
      'SEPARACAO', 'CONFERENCIA_SEPARACAO',
    ], `trilha final: ${JSON.stringify(trilha)}`);
  });

  // ── Fluxo 3: fiação de perfil — o requirePermission fala antes de qualquer regra ───────────
  await test('[Fluxo 3] PRODUCAO -> 403 do requirePermission em conferir-separacao e em separacao, nada gravado', async () => {
    const matC = await criarMaterial('FLUXO3-C', 50, { critico: 1 });
    const matN = await criarMaterial('FLUXO3-N', 50);
    const { id: reqId, itemPor } = await criarRequisicaoAprovada({ matC, matN });

    // Sem rodada nenhuma: se a regra de negócio falasse antes do perfil, viria 400 ('Nenhum item
    // separado' / status TOTALMENTE_RESERVADA), não 403.
    const conf = await conferir(PRODUCAO, reqId);
    assert.strictEqual(conf.status, 403, `conferir: ${JSON.stringify(conf.body)}`);
    assert.strictEqual(conf.body.acao, 'conferir_separacao', JSON.stringify(conf.body));

    const sep = await separar(PRODUCAO, reqId, [{ item_id: itemPor[matN], quantidade_separada: 1 }]);
    assert.strictEqual(sep.status, 403, `separar: ${JSON.stringify(sep.body)}`);
    assert.strictEqual(sep.body.acao, 'separar_emitir', JSON.stringify(sep.body));

    const det = await detalhe(ALMOX_A, reqId);
    assert.strictEqual(det.body.status, 'TOTALMENTE_RESERVADA', 'o 403 nao pode ter mudado o status');
    assert.strictEqual(det.body.separacoes.length, 0, 'o 403 nao pode ter gravado rodada');
    assert.strictEqual(det.body.conferencia, null);
    assert.strictEqual(det.body.itens.find((i) => i.id === itemPor[matN]).quantidade_separada, 0);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
