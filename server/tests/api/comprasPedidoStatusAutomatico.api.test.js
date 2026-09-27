/**
 * Etapa 42, T2 (RN-E01..RN-E07) — o RECEBIMENTO FECHA O PEDIDO DE COMPRA.
 *
 * ── O BECO QUE ESTE ARQUIVO FECHA ─────────────────────────────────────────────────────────────
 * A Etapa 37 fez o pedido SABER o que chegou (`itens_pedido_compra.quantidade_recebida`) mas
 * deixou o `status` do CORE intocado — decisao 4 / RN-24 daquela etapa, e ela estava certa enquanto
 * nao havia gesto automatico nenhum. Consequencia medida e testada pela Etapa 39: o pedido recebido
 * DEPOIS da data prometida ficava "Atrasado" PARA SEMPRE na aba Compras, e o unico jeito de sair era
 * o comprador lembrar de usar o `PATCH .../status` a mao. Esta task poe o gancho automatico.
 *
 * ⚠️ ESTA TASK REVOGA A RN-24 DA ETAPA 37 (`specs/.../08-recebimento/README.md:107` e `:329`, que
 * dizem "nada e escrito em `pedidos_compra`"). A revogacao esta declarada na spec, no plano e no
 * guia — nao em silencio.
 *
 * ── AS DUAS ARMADILHAS QUE ESTE ARQUIVO EXISTE PARA PRENDER ───────────────────────────────────
 * (i) `RECEBIDO` e AGREGADO POR PEDIDO, e o laco da entrada anda ITEM A ITEM. Um gancho colocado
 *     dentro do laco fecharia um pedido de 2 linhas na PRIMEIRA linha. Cenario (2) prende isso.
 * (ii) Ha DOIS caminhos de entrada fisica (`processarNota` e `aprovarRecebimento`), e a Etapa 37 ja
 *     pagou uma vez por esquecer o segundo. Cenario (6) entra pelo ramo de `aprovarRecebimento` que
 *     NAO delega para `processarNota` — e afirma qual ramo foi exercitado, senao o proprio controle
 *     positivo passaria provando nada (achado F12 da Fase 2).
 *
 * Executar: cd server && node tests/api/comprasPedidoStatusAutomatico.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 143, nome: 'Admin E42 T2', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

/** Captura o que o gancho nao-fatal escreve no log — e parte do contrato 2.5, nao decoracao. */
function capturarWarn(fn) {
  const original = console.warn;
  const linhas = [];
  console.warn = (...args) => { linhas.push(args.join(' ')); };
  return Promise.resolve().then(fn).finally(() => { console.warn = original; }).then(() => linhas);
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  const forn = await dbRun(db,
    "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Fornecedor E42 T2','55666777000188','ativo')");

  let seq = 0;
  async function novoMaterial() {
    seq += 1;
    const m = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'PC',0,1)`,
    [`MAT-E42T2-${String(seq).padStart(3, '0')}`, `Chapa E42 T2 ${seq}`]);
    return m.lastID;
  }

  /** O pedido nasce pela PORTA REAL da Etapa 38 — nunca por `INSERT` na mao. */
  async function novoPedido({ status = 'pendente', itens }) {
    const r = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: forn.lastID, status, itens,
    });
    assert.strictEqual(r.status, 201, `fixture: POST do pedido falhou ${r.status} ${JSON.stringify(r.body)}`);
    const linhas = await dbAll(db,
      'SELECT id, material_id, quantidade FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id',
      [r.body.id]);
    return { pedido: r.body, linhas };
  }

  const statusDoPedido = async (id) => (await dbGet(db,
    'SELECT status FROM pedidos_compra WHERE id = ?', [id])).status;
  const auditoriasDoPedido = (id) => dbAll(db, `SELECT acao, usuario_id, usuario_nome, dados_anteriores,
      dados_novos FROM auditoria_log_almoxarifado
    WHERE entidade = 'pedido_compra' AND entidade_id = ? ORDER BY id`, [id]);
  const saldoDoMaterial = async (materialId) => (await dbGet(db,
    'SELECT COALESCE(SUM(quantidade),0) AS q FROM estoque_saldo_almoxarifado WHERE material_id = ?',
    [materialId])).q;

  /**
   * As SEIS PORTAS REAIS do recebimento contra pedido, ponta a ponta — nenhum `UPDATE` de status a
   * mao. E o caminho que o operador percorre, e e o unico jeito de provar que o gancho roda DENTRO
   * do claim da entrada fisica e nao num atalho de teste.
   */
  async function receberPeloFluxo(pedido, itensDaTela, { valorNota = 100 } = {}) {
    setUser(ADMIN);
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, itens: itensDaTela,
    });
    assert.strictEqual(criado.status, 201, `POST /recebimentos: ${JSON.stringify(criado.body)}`);
    const recId = criado.body.id;

    const conf = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/conferir`)
      .send({ itens: itensDaTela });
    assert.strictEqual(conf.status, 200, `PUT /conferir: ${JSON.stringify(conf.body)}`);

    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      const r = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao });
      assert.strictEqual(r.status, 200, `workflow ${acao}: ${JSON.stringify(r.body)}`);
    }
    const fiscal = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`).send({
      nota_fiscal: `NF-E42T2-${recId}`, fornecedor_id: forn.lastID,
      fornecedor_nome: 'Fornecedor E42 T2', data_emissao_nf: '2026-09-01',
      data_entrada_nf: '2026-09-02', valor_total_nota: valorNota, itens: itensDaTela,
    });
    assert.strictEqual(fiscal.status, 200, `PUT /fiscal: ${JSON.stringify(fiscal.body)}`);
    return recId;
  }

  const processar = (recId) => request(app)
    .post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao: 'processar' });

  const itemDaTela = (materialId, linhaId, qtd) => ({
    material_id: materialId, pedido_item_id: linhaId, quantidade: qtd, quantidade_recebida: qtd,
  });

  // ── (1) RN-E01: O PEDIDO FECHA ──────────────────────────────────────────────────────────────
  await test('(1) RN-E01 pedido de 10 recebido por inteiro pelas SEIS PORTAS -> status do CORE vira recebido', async () => {
    const materialId = await novoMaterial();
    const { pedido, linhas } = await novoPedido({ itens: [{ material_id: materialId, quantidade: 10, valor_unitario: 10 }] });
    assert.strictEqual(await statusDoPedido(pedido.id), 'pendente', 'fixture: o pedido tinha de nascer pendente');

    const recId = await receberPeloFluxo(pedido, [itemDaTela(materialId, linhas[0].id, 10)]);
    const r = await processar(recId);
    assert.strictEqual(r.status, 200, `workflow processar: ${JSON.stringify(r.body)}`);

    assert.strictEqual(await statusDoPedido(pedido.id), 'recebido',
      'o pedido recebido por inteiro continuou com o status antigo — o beco da RN-D12 nao fechou');
    // O estoque entrou de verdade: sem isto o cenario poderia passar com o motor desligado.
    assert.strictEqual(await saldoDoMaterial(materialId), 10, 'o estoque nao foi creditado');
  });

  // ── (2) RN-E02: A ARMADILHA DO LACO ─────────────────────────────────────────────────────────
  await test('(2) RN-E02 pedido de DUAS linhas: receber so a primeira NAO fecha o pedido; a segunda fecha', async () => {
    const matA = await novoMaterial();
    const matB = await novoMaterial();
    const { pedido, linhas } = await novoPedido({
      itens: [
        { material_id: matA, quantidade: 10, valor_unitario: 1 },
        { material_id: matB, quantidade: 10, valor_unitario: 1 },
      ],
    });
    assert.strictEqual(linhas.length, 2, 'fixture: o pedido tinha de ter 2 linhas');

    const rec1 = await receberPeloFluxo(pedido, [itemDaTela(matA, linhas[0].id, 10)]);
    assert.strictEqual((await processar(rec1)).status, 200);
    assert.strictEqual(await statusDoPedido(pedido.id), 'pendente',
      'o pedido fechou com METADE do material — o gancho esta dentro do laco de itens, e nao depois dele');

    const rec2 = await receberPeloFluxo(pedido, [itemDaTela(matB, linhas[1].id, 10)]);
    assert.strictEqual((await processar(rec2)).status, 200);
    assert.strictEqual(await statusDoPedido(pedido.id), 'recebido',
      'a segunda linha completou o pedido e o status nao acompanhou');
  });

  // ── (3) RN-E07: A TRILHA ────────────────────────────────────────────────────────────────────
  await test('(3) RN-E07 a mudanca automatica deixa UMA linha de auditoria, com o autor de quem processou a nota', async () => {
    const materialId = await novoMaterial();
    const { pedido, linhas } = await novoPedido({ itens: [{ material_id: materialId, quantidade: 5, valor_unitario: 2 }] });
    const recId = await receberPeloFluxo(pedido, [itemDaTela(materialId, linhas[0].id, 5)]);
    assert.strictEqual((await processar(recId)).status, 200);

    const trilha = await auditoriasDoPedido(pedido.id);
    assert.strictEqual(trilha.length, 1, `esperava 1 linha de auditoria, veio ${trilha.length}`);
    assert.strictEqual(trilha[0].acao, 'STATUS_AUTOMATICO_RECEBIDO', JSON.stringify(trilha[0]));
    assert.strictEqual(trilha[0].usuario_id, ADMIN.id, 'o autor nao e quem processou a nota');
    assert.strictEqual(trilha[0].usuario_nome, ADMIN.nome, JSON.stringify(trilha[0]));
    assert.deepStrictEqual(JSON.parse(trilha[0].dados_anteriores), { status: 'pendente' });
    assert.deepStrictEqual(JSON.parse(trilha[0].dados_novos), { status: 'recebido' });

    // ⚠️ RN-E04 (idempotencia) NO MESMO CENARIO: reprocessar nao reescreve nem re-audita. O claim
    // `entrada_estoque_em IS NULL` ja barra o item, mas a assercao vale pelo gancho: um gancho que
    // lesse a soma FORA do claim escreveria de novo e a trilha teria 2 linhas para 1 fato.
    const segundo = await processar(recId);
    assert.strictEqual(segundo.status, 400, 'reprocessar tinha de bater na guarda de nota ja processada');
    assert.strictEqual((await auditoriasDoPedido(pedido.id)).length, 1,
      'a segunda passada duplicou a trilha do mesmo fato');
  });

  // ── (4) RN-E04: OS STATUS QUE O COMPRADOR DECIDIU ───────────────────────────────────────────
  await test('(4) RN-E04 pedido CANCELADO recebido por inteiro NAO ressuscita para recebido, e o log diz o motivo', async () => {
    const materialId = await novoMaterial();
    const { pedido, linhas } = await novoPedido({ itens: [{ material_id: materialId, quantidade: 4, valor_unitario: 3 }] });
    const recId = await receberPeloFluxo(pedido, [itemDaTela(materialId, linhas[0].id, 4)]);
    // O comprador cancela pela porta real da Etapa 39, DEPOIS de o documento existir.
    const patch = await request(app).patch(`/api/compras/pedidos/${pedido.id}/status`).send({ status: 'cancelado' });
    assert.strictEqual(patch.status, 200, JSON.stringify(patch.body));

    const linhasLog = await capturarWarn(async () => {
      assert.strictEqual((await processar(recId)).status, 200, 'a nota tinha de processar mesmo assim');
    });

    assert.strictEqual(await statusDoPedido(pedido.id), 'cancelado',
      'o gancho ressuscitou um pedido que o comprador cancelou');
    assert.strictEqual((await auditoriasDoPedido(pedido.id)).length, 0,
      'auditou uma mudanca que nao aconteceu');
    // O estoque ENTROU: o material esta fisicamente no galpao, e barrar a entrada seria o erro que
    // a Etapa 5 corrigiu.
    assert.strictEqual(await saldoDoMaterial(materialId), 4, 'o estoque devia ter entrado mesmo com o pedido cancelado');
    const avisou = linhasLog.some((l) => /nao e sobrescrito automaticamente/.test(l) && l.includes('cancelado'));
    assert.ok(avisou, `o log nao registrou o pedido completo com status terminal: ${JSON.stringify(linhasLog)}`);
  });

  await test('(5) RN-E04 pedido REJEITADO tambem nao e sobrescrito; e um pedido JA recebido nao re-audita NEM loga', async () => {
    const matR = await novoMaterial();
    const rej = await novoPedido({ itens: [{ material_id: matR, quantidade: 3, valor_unitario: 1 }] });
    const recRej = await receberPeloFluxo(rej.pedido, [itemDaTela(matR, rej.linhas[0].id, 3)]);
    assert.strictEqual((await request(app).patch(`/api/compras/pedidos/${rej.pedido.id}/status`)
      .send({ status: 'rejeitado' })).status, 200);
    assert.strictEqual((await processar(recRej)).status, 200);
    assert.strictEqual(await statusDoPedido(rej.pedido.id), 'rejeitado');
    assert.strictEqual((await auditoriasDoPedido(rej.pedido.id)).length, 0);

    // A metade SILENCIOSA (F11 da Fase 2): `recebido` esta na lista de respeitados por
    // IDEMPOTENCIA, e ele e o caminho ESPERADO — avisar aqui treinaria o operador a ignorar o log,
    // que e onde o aviso do `cancelado` mora. Pedido de 2 linhas: a 1a fecha... nao; use o excedente.
    const matJ = await novoMaterial();
    const ja = await novoPedido({ itens: [{ material_id: matJ, quantidade: 6, valor_unitario: 1 }] });
    const rec1 = await receberPeloFluxo(ja.pedido, [itemDaTela(matJ, ja.linhas[0].id, 6)]);
    assert.strictEqual((await processar(rec1)).status, 200);
    assert.strictEqual(await statusDoPedido(ja.pedido.id), 'recebido', 'fixture: o pedido tinha de ter fechado');
    assert.strictEqual((await auditoriasDoPedido(ja.pedido.id)).length, 1);

    // SEGUNDO recebimento contra o pedido JA fechado — excedente autorizado da Etapa 36, que a
    // porta deixa passar de proposito. O gancho encontra `RECEBIDO` + status `recebido`.
    setUser(ADMIN);
    const extra = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: ja.pedido.id,
      autorizar_excedente: true,
      itens: [itemDaTela(matJ, ja.linhas[0].id, 2)],
    });
    if (extra.status === 201) {
      const linhasLog = await capturarWarn(async () => {
        const conf = await request(app).put(`/api/almoxarifado/recebimentos/${extra.body.id}/conferir`)
          .send({ itens: [itemDaTela(matJ, ja.linhas[0].id, 2)] });
        assert.strictEqual(conf.status, 200, JSON.stringify(conf.body));
        for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
          await request(app).post(`/api/almoxarifado/recebimentos/${extra.body.id}/workflow`).send({ acao });
        }
        await request(app).put(`/api/almoxarifado/recebimentos/${extra.body.id}/fiscal`).send({
          nota_fiscal: `NF-E42T2-X${extra.body.id}`, fornecedor_id: forn.lastID,
          fornecedor_nome: 'Fornecedor E42 T2', data_emissao_nf: '2026-09-01',
          data_entrada_nf: '2026-09-02', valor_total_nota: 2,
          itens: [itemDaTela(matJ, ja.linhas[0].id, 2)],
        });
        assert.strictEqual((await processar(extra.body.id)).status, 200);
      });
      assert.strictEqual((await auditoriasDoPedido(ja.pedido.id)).length, 1,
        'o excedente contra pedido JA recebido duplicou a trilha');
      const ruido = linhasLog.filter((l) => /nao e sobrescrito automaticamente/.test(l));
      assert.deepStrictEqual(ruido, [],
        `o caminho FELIZ (pedido ja recebido) escreveu aviso no log: ${JSON.stringify(ruido)}`);
    }
  });

  // ── (6) RN-E06: O SEGUNDO CAMINHO DE ENTRADA FISICA ─────────────────────────────────────────
  await test('(6) RN-E06 o ramo de aprovarRecebimento que NAO delega para processarNota tambem fecha o pedido', async () => {
    const materialId = await novoMaterial();
    const { pedido, linhas } = await novoPedido({ itens: [{ material_id: materialId, quantidade: 7, valor_unitario: 1 }] });
    setUser(ADMIN);
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id,
      itens: [itemDaTela(materialId, linhas[0].id, 7)],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const recId = criado.body.id;

    // ⚠️ F12 DA FASE 2 — O STATUS DE PARTIDA E O QUE FAZ ESTE CENARIO VALER.
    // `aprovarRecebimento` DELEGA para `processarNota` quando o status esta em
    // {EM_ENTRADA_NF, ENCAMINHADO_FATURAMENTO}. Um cenario montado num daqueles status exercitaria
    // o MESMO caminho de (1) e o controle positivo "chamar o gancho so em processarNota" ficaria
    // VERDE provando nada. Aqui o recebimento fica no status de criacao, e a assercao abaixo prende
    // o ramo: a resposta NAO pode ser `PROCESSADO`.
    const statusAntes = (await dbGet(db,
      'SELECT status FROM recebimentos_material_almoxarifado WHERE id = ?', [recId])).status;
    assert.ok(!['EM_ENTRADA_NF', 'ENCAMINHADO_FATURAMENTO'].includes(statusAntes),
      `o cenario tem de partir FORA do ramo que delega para processarNota; partiu de ${statusAntes}`);

    const r = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/aprovar`).send({});
    assert.strictEqual(r.status, 200, `POST /aprovar: ${JSON.stringify(r.body)}`);
    // A FORMA DA RESPOSTA E O QUE PROVA O RAMO (medido): o ramo que DELEGA devolve o contrato de
    // `processarNota` (`{ success, status: 'PROCESSADO', contas_pagar_id }`, `:1355`); o ramo desta
    // etapa devolve `{ success: true }` SECO (`:1406`). Sem esta assercao o cenario poderia estar
    // medindo o mesmo caminho de (1) e o controle positivo passaria provando nada (F12).
    assert.deepStrictEqual(r.body, { success: true },
      `o ramo exercitado delegou para processarNota — o cenario nao mede o 2o caminho: ${JSON.stringify(r.body)}`);
    assert.strictEqual((await dbGet(db,
      'SELECT status FROM recebimentos_material_almoxarifado WHERE id = ?', [recId])).status, 'APROVADO',
    'o recebimento tinha de terminar APROVADO (e nao PROCESSADO) — e a marca do 2o caminho');

    assert.strictEqual(await statusDoPedido(pedido.id), 'recebido',
      'o pedido fechado por /aprovar ficou com o status antigo — o gancho nao cobre o 2o caminho de entrada fisica');
    assert.strictEqual((await auditoriasDoPedido(pedido.id)).length, 1, 'a trilha do 2o caminho faltou');
    assert.strictEqual(await saldoDoMaterial(materialId), 7, 'o estoque nao entrou pelo 2o caminho');
  });

  // ── (7) RN-E05: O GANCHO E NAO-FATAL ───────────────────────────────────────────────────────
  //
  // ⚠️ ESTE CENARIO JA NASCEU ERRADO UMA VEZ, e a correcao fica escrita porque e a licao.
  // A primeira versao renomeava `pedidos_compra` para forcar a falha. Nao forcava nada: a guarda
  // `sqlite_master` do proprio gancho ve a tabela ausente e devolve `[]` SEM excecao — nao ha o que
  // ser fatal. Medido pelo controle positivo: com `throw eStatus` no lugar do `warn`, o cenario
  // continuava VERDE (9/9). Era teste vazio — a quinta ocorrencia documentada nesta base.
  //
  // A falha de verdade precisa acontecer DEPOIS da guarda: `itens_pedido_compra` ausente com
  // `pedidos_compra` presente. E um estado de esquema PARCIAL realista (as duas tabelas nascem em
  // arquivos diferentes: `index.js` e `services/almoxarifado/schema.js`), e ai o `SELECT DISTINCT`
  // do gancho lanca de verdade.
  await test('(7) RN-E05 o gancho que LANCA de verdade nao trava a nota: 200, estoque creditado e a literal do log', async () => {
    const materialId = await novoMaterial();
    const { pedido, linhas } = await novoPedido({ itens: [{ material_id: materialId, quantidade: 8, valor_unitario: 1 }] });
    const recId = await receberPeloFluxo(pedido, [itemDaTela(materialId, linhas[0].id, 8)]);

    await dbRun(db, 'ALTER TABLE itens_pedido_compra RENAME TO itens_pedido_compra_escondido');
    let linhasLog;
    try {
      linhasLog = await capturarWarn(async () => {
        const r = await processar(recId);
        assert.strictEqual(r.status, 200,
          'a nota travou porque o gancho do pedido lancou — um throw aqui deixa material no galpao '
          + `com o documento preso e o claim impedindo o reprocessamento: ${JSON.stringify(r.body)}`);
      });
    } finally {
      await dbRun(db, 'ALTER TABLE itens_pedido_compra_escondido RENAME TO itens_pedido_compra');
    }
    assert.strictEqual(await saldoDoMaterial(materialId), 8, 'o estoque tinha de ter entrado');
    const avisou = linhasLog.some((l) => /status automatico do pedido de compra falhou/.test(l)
      && l.includes(`recebimento ${recId}`));
    assert.ok(avisou,
      `o gancho falhou em SILENCIO — sem a literal ninguem descobre o pedido que ficou sem fechar: ${JSON.stringify(linhasLog)}`);
  });

  await test('(7b) RN-E05 tabela pedidos_compra AUSENTE: a guarda sai limpa, sem excecao e sem aviso de falha', async () => {
    const materialId = await novoMaterial();
    const { pedido, linhas } = await novoPedido({ itens: [{ material_id: materialId, quantidade: 2, valor_unitario: 1 }] });
    const recId = await receberPeloFluxo(pedido, [itemDaTela(materialId, linhas[0].id, 2)]);

    // A METADE COMPLEMENTAR de (7): aqui o caminho e o da guarda `sqlite_master`, e o contrato e
    // sair CALADO — o modulo ASSUME que as tabelas de compras podem nao existir, e um `warn` por
    // nota processada num banco sem o modulo Compras seria ruido permanente.
    await dbRun(db, 'ALTER TABLE pedidos_compra RENAME TO pedidos_compra_escondido');
    let linhasLog;
    try {
      linhasLog = await capturarWarn(async () => {
        assert.strictEqual((await processar(recId)).status, 200, 'a nota travou sem a tabela de compras');
      });
    } finally {
      await dbRun(db, 'ALTER TABLE pedidos_compra_escondido RENAME TO pedidos_compra');
    }
    assert.strictEqual(await saldoDoMaterial(materialId), 2, 'o estoque tinha de ter entrado');
    const falhas = linhasLog.filter((l) => /status automatico do pedido de compra falhou/.test(l));
    assert.deepStrictEqual(falhas, [],
      `a guarda de tabela ausente virou aviso de FALHA: ${JSON.stringify(falhas)}`);
  });

  // ── (8) RN-E03: SO SOBE ────────────────────────────────────────────────────────────────────
  await test('(8) RN-E03 o gancho nunca DESCE: pedido marcado recebido a mao e depois recebido parcialmente segue recebido', async () => {
    const materialId = await novoMaterial();
    const { pedido, linhas } = await novoPedido({ itens: [{ material_id: materialId, quantidade: 20, valor_unitario: 1 }] });
    assert.strictEqual((await request(app).patch(`/api/compras/pedidos/${pedido.id}/status`)
      .send({ status: 'recebido' })).status, 200);

    const recId = await receberPeloFluxo(pedido, [itemDaTela(materialId, linhas[0].id, 5)]);
    assert.strictEqual((await processar(recId)).status, 200);

    assert.strictEqual(await statusDoPedido(pedido.id), 'recebido',
      'o gancho rebaixou um pedido que o comprador havia fechado a mao — RN-E03 diz que ele so SOBE');
    const situacao = (await receiptService.situacaoDosPedidosCompra(db)).find((l) => l.id === pedido.id);
    assert.strictEqual(situacao.situacao_recebimento, 'PARCIAL',
      'a situacao DERIVADA continua contando a verdade fisica, independente do status do CORE');
  });

  // ── (9) RN-E01 no EXCEDENTE: recebida > pedida tambem fecha (o clamp da regua) ──────────────
  await test('(9) RN-E01 excedente autorizado (12 de 10) fecha o pedido — a regua clampa o saldo em 0', async () => {
    const materialId = await novoMaterial();
    const { pedido, linhas } = await novoPedido({ itens: [{ material_id: materialId, quantidade: 10, valor_unitario: 1 }] });
    setUser(ADMIN);
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, autorizar_excedente: true,
      itens: [itemDaTela(materialId, linhas[0].id, 12)],
    });
    assert.strictEqual(criado.status, 201, `o excedente autorizado da Etapa 36 tinha de passar: ${JSON.stringify(criado.body)}`);
    const itens = [itemDaTela(materialId, linhas[0].id, 12)];
    assert.strictEqual((await request(app).put(`/api/almoxarifado/recebimentos/${criado.body.id}/conferir`)
      .send({ itens })).status, 200);
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      await request(app).post(`/api/almoxarifado/recebimentos/${criado.body.id}/workflow`).send({ acao });
    }
    assert.strictEqual((await request(app).put(`/api/almoxarifado/recebimentos/${criado.body.id}/fiscal`).send({
      nota_fiscal: `NF-E42T2-E${criado.body.id}`, fornecedor_id: forn.lastID,
      fornecedor_nome: 'Fornecedor E42 T2', data_emissao_nf: '2026-09-01',
      data_entrada_nf: '2026-09-02', valor_total_nota: 12, itens,
    })).status, 200);
    assert.strictEqual((await processar(criado.body.id)).status, 200);

    assert.strictEqual(await statusDoPedido(pedido.id), 'recebido',
      'chegou MAIS que o pedido e ele nao fechou — o gancho esta comparando por igualdade em vez de usar a regua');
  });

  await close();
  console.log(`\ncomprasPedidoStatusAutomatico: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
