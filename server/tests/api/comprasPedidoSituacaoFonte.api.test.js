/**
 * Etapa 42, T1 (RN-E08) — a REGUA EXPORTADA e a FONTE SEM `LIMIT` do saldo do pedido de compra.
 *
 * ── O QUE ESTE ARQUIVO EXISTE PARA MEDIR ──────────────────────────────────────────────────────
 * A Etapa 37 criou a regua de situacao do pedido (`ABERTO`/`PARCIAL`/`RECEBIDO` + `saldo_pendente`)
 * DENTRO de `receiptService.js` e NAO a exportou. A unica fonte exportada e
 * `listarPedidosCompraAux`, que tem `LIMIT 50` (contrato de TELA: a aba lista os 50 mais novos) e
 * nao devolve `previsao_entrega`. A `specs/modulo-almoxarifado/20-alertas/README.md` registrou isso
 * como o bloqueio REAL do alerta "pedido recebido parcialmente": consumir o aux daria um alerta que
 * ignora o 51o pedido EM SILENCIO, e recalcular a situacao no alertRegistry criaria a SEGUNDA
 * formula de saldo — a classe de bug que a regua unica existe para matar.
 *
 * Esta task resolve pelos dois lados, sem tocar a porta da tela:
 *   1. `derivarRecebimentoDoPedido` passa a ser EXPORTADA (um dono para a regua);
 *   2. nasce `situacaoDosPedidosCompra`, SEM `LIMIT`, com `previsao_entrega`/`status`, reusando a
 *      regua exportada e COMPARTILHANDO o SQL da soma com o aux por constante (um dono para a
 *      agregacao tambem).
 *
 * ── O CENARIO (2) E O CORACAO DO ARQUIVO ──────────────────────────────────────────────────────
 * Ele mede as DUAS fontes no MESMO banco com 51 pedidos parciais: a nova devolve 51, o aux devolve
 * 50. Um teste que medisse so a nova passaria com `LIMIT 50` colado nela; a assercao PAREADA e o
 * que prende a diferenca que a task existe para criar. E ele tambem prende o aux: quem "consertar"
 * o `LIMIT 50` da tela quebra este arquivo e le aqui por que ele e intencional.
 *
 * Executar: cd server && node tests/api/comprasPedidoSituacaoFonte.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const sqlite3 = require('sqlite3');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 142, nome: 'Admin E42 T1', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

// hoje + N dias em data LOCAL (nunca `toISOString`, que e UTC) — a mesma convencao da Etapa 39.
function diasDeHoje(n) {
  const dt = new Date();
  dt.setDate(dt.getDate() + n);
  return [dt.getFullYear(), String(dt.getMonth() + 1).padStart(2, '0'),
    String(dt.getDate()).padStart(2, '0')].join('-');
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  const forn = await dbRun(db,
    "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Fornecedor E42 T1','44555666000177','ativo')");

  let seq = 0;
  async function novoMaterial() {
    seq += 1;
    const m = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'PC',0,1)`,
    [`MAT-E42T1-${String(seq).padStart(3, '0')}`, `Chapa E42 T1 ${seq}`]);
    return m.lastID;
  }

  /** O pedido nasce pela PORTA REAL da Etapa 38 — nunca por `INSERT` na mao. */
  async function novoPedido({ previsao = null, status = 'pendente', quantidade = 10 } = {}) {
    const materialId = await novoMaterial();
    const r = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: forn.lastID, previsao_entrega: previsao, status,
      itens: [{ material_id: materialId, quantidade, valor_unitario: 7 }],
    });
    assert.strictEqual(r.status, 201, `fixture: POST do pedido falhou ${r.status} ${JSON.stringify(r.body)}`);
    return { pedido: r.body, materialId };
  }

  /**
   * O recebido da LINHA escrito direto, e isto e declarado: em producao quem escreve e o
   * acumulador da Etapa 37 (`receiptService.js:1261`), e o caminho pelas seis portas ja e medido
   * por `recebimentoContraPedidoIntegracao` e pelo bloco D de `comprasPedidoAtrasoIntegracao`.
   * O que ESTE arquivo mede e a LEITURA (regua + fonte), e para isso o que importa e o ESTADO.
   */
  const receber = (linhaId, qtd) => dbRun(db,
    'UPDATE itens_pedido_compra SET quantidade_recebida = ? WHERE id = ?', [qtd, linhaId]);
  const linhaDo = async (pedidoId) => (await dbGet(db,
    'SELECT id FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id LIMIT 1', [pedidoId])).id;

  // ── (1) A REGUA EXPORTADA ───────────────────────────────────────────────────────────────────
  await test('(1) RN-E08 derivarRecebimentoDoPedido e EXPORTADA e devolve os 4 campos, com o clamp do saldo', async () => {
    const { derivarRecebimentoDoPedido } = receiptService;
    assert.strictEqual(typeof derivarRecebimentoDoPedido, 'function',
      'a regua nao esta no module.exports de receiptService — o alertRegistry teria de copia-la, '
      + 'e duas copias divergem na primeira edicao (o bloqueio que a spec 20 registrou)');
    assert.deepStrictEqual(derivarRecebimentoDoPedido(10, 0),
      { quantidade_pedida: 10, quantidade_recebida: 0, saldo_pendente: 10, situacao_recebimento: 'ABERTO' });
    assert.deepStrictEqual(derivarRecebimentoDoPedido(10, 4),
      { quantidade_pedida: 10, quantidade_recebida: 4, saldo_pendente: 6, situacao_recebimento: 'PARCIAL' });
    assert.deepStrictEqual(derivarRecebimentoDoPedido(10, 10),
      { quantidade_pedida: 10, quantidade_recebida: 10, saldo_pendente: 0, situacao_recebimento: 'RECEBIDO' });
    // Excedente autorizado (Etapa 36): 12 de 10 — `RECEBIDO` e saldo CLAMPADO em 0, nunca -2.
    assert.deepStrictEqual(derivarRecebimentoDoPedido(10, 12),
      { quantidade_pedida: 10, quantidade_recebida: 12, saldo_pendente: 0, situacao_recebimento: 'RECEBIDO' });
    // Pedido cujas linhas o Compras ainda nao lancou: total 0 NAO e "recebido".
    assert.strictEqual(derivarRecebimentoDoPedido(0, 0).situacao_recebimento, 'ABERTO');
    // Linha antiga com `quantidade_recebida` NULL (anterior ao ALTER da E37) nao viraliza NULL.
    assert.deepStrictEqual(derivarRecebimentoDoPedido(10, null),
      { quantidade_pedida: 10, quantidade_recebida: 0, saldo_pendente: 10, situacao_recebimento: 'ABERTO' });
  });

  // ── (1b) O FLOAT: pedido FISICAMENTE completo tem de FECHAR ────────────────────────────────
  //
  // Achado CRITICAL de revisao adversarial, reproduzido por sonda pelas portas reais: `recebida >=
  // pedida` sobre `SUM(REAL)` sem epsilon NAO fecha um pedido que chegou inteiro. Uma casa decimal em
  // KG basta — 20,1 recebido em 2,2 + 17,9 da 20.099999999999998 —, e o modulo tem KG/M por
  // construcao. O efeito medido era exatamente o beco que a Etapa 42 existe para fechar: pedido
  // fisicamente completo, `pendente`, dentro de `?atrasados=1` PARA SEMPRE. E pior, o e-mail do
  // alerta saia com `Saldo pendente: 3.552713678800501e-15` enquanto o cartao, que formata com 4
  // casas, mostrava `Saldo pendente 0` — duas partes lendo o MESMO numero de modos diferentes.
  //
  // O conserto reusa o epsilon que a base JA tem (`divergencia.js`, `EPSILON_DIVERGENCIA = 1e-9`),
  // que existe desde a Etapa 10b pela MESMA razao (subtracao REAL gerando divergencia de 7e-16 e
  // cada consumidor com `!= 0` cru tratando o operador que ACERTOU como divergente). Um dono para o
  // epsilon, como ja ha um dono para a regua e um para a agregacao.
  await test('(1b) RN-E08 float: 2,2 + 17,9 contra 20,1 e RECEBIDO com saldo 0 — nao PARCIAL com saldo 3,5e-15', async () => {
    const { derivarRecebimentoDoPedido } = receiptService;
    const somaReal = 2.2 + 17.9;
    // Guarda que prende o proprio cenario: se um dia o JS somar isso exato, o teste deixa de medir o
    // que pretende e tem de dizer isso em voz alta, em vez de passar por sorte.
    assert.notStrictEqual(somaReal, 20.1,
      `este cenario depende de 2.2 + 17.9 !== 20.1 neste runtime; deu ${somaReal}`);

    const r = derivarRecebimentoDoPedido(20.1, somaReal);
    assert.strictEqual(r.situacao_recebimento, 'RECEBIDO',
      `pedido fisicamente completo ficou ${r.situacao_recebimento} por ruido de float: ${JSON.stringify(r)}`);
    assert.strictEqual(r.saldo_pendente, 0,
      `o saldo tinha de ser ZERO, nao residuo: ${JSON.stringify(r.saldo_pendente)}`);
    // O residuo tambem nao pode vazar para o campo de exibicao: o e-mail escreve este numero cru.
    assert.strictEqual(r.quantidade_recebida, 20.1,
      `a recebida tinha de vir limpa para o corpo do e-mail: ${JSON.stringify(r.quantidade_recebida)}`);

    // E o PARCIAL de verdade continua parcial, com saldo legivel (a metade positiva: sem ela, um
    // epsilon grande demais faria tudo virar RECEBIDO e o cenario passaria).
    const parcial = derivarRecebimentoDoPedido(20.1, 2.2);
    assert.strictEqual(parcial.situacao_recebimento, 'PARCIAL', JSON.stringify(parcial));
    assert.strictEqual(parcial.saldo_pendente, 17.9,
      `saldo de parcial fracionario tinha de vir limpo: ${JSON.stringify(parcial.saldo_pendente)}`);
  });

  // ── (1c) O EXCEDENTE CRUZADO: excesso de A nao paga o saldo de B ───────────────────────────
  //
  // Achado IMPORTANT da mesma revisao, reproduzido por sonda: a agregacao do "completo" era por
  // PEDIDO, mas a regua da ESCRITA (`assertSaldoDoPedidoPermitido`) e por MATERIAL. Com excedente
  // autorizado, uma nota de 25 de A num pedido A(10)+B(10) fechava o pedido com B em ZERO — o pedido
  // saia de `?atrasados=1`, saia de `?pendentes=1` e nao entrava no alerta de parcial, enquanto a
  // rota de itens continuava oferecendo 10 de B. A MESMA base afirmando "completo" e "faltam 10".
  //
  // O "completo" passou a ser medido na unidade que a escrita ja usa: soma dos deficits POR MATERIAL,
  // cada um clampado em zero antes de somar. Excesso de um material nao compensa falta de outro.
  await test('(1c) RN-E08 excedente de um material NAO paga o saldo de outro (deficit por material)', async () => {
    const matA = await novoMaterial();
    const matB = await novoMaterial();
    const r = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: forn.lastID,
      itens: [
        { material_id: matA, quantidade: 10, valor_unitario: 1 },
        { material_id: matB, quantidade: 10, valor_unitario: 1 },
      ],
    });
    assert.strictEqual(r.status, 201, `fixture: ${JSON.stringify(r.body)}`);
    const linhas = await dbAll(db,
      'SELECT id, material_id FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id', [r.body.id]);
    // 25 de A (excedente) e 0 de B. A soma por PEDIDO da 25 >= 20 e diria "completo".
    await dbRun(db, 'UPDATE itens_pedido_compra SET quantidade_recebida = 25 WHERE id = ?', [linhas[0].id]);

    const linha = (await receiptService.situacaoDosPedidosCompra(db)).find((l) => l.id === r.body.id);
    assert.strictEqual(linha.situacao_recebimento, 'PARCIAL',
      `o material B nunca chegou e o pedido foi dado por completo: ${JSON.stringify(linha)}`);
    assert.strictEqual(linha.saldo_pendente, 10,
      `o saldo tinha de ser os 10 de B que faltam, nao o agregado do pedido: ${JSON.stringify(linha)}`);
    // A metade que prende a exibicao: pedida e recebida continuam sendo os totais CRUS do pedido —
    // o que mudou e so a regua do "completo" e do saldo.
    assert.strictEqual(linha.quantidade_pedida, 20, JSON.stringify(linha));
    assert.strictEqual(linha.quantidade_recebida, 25, JSON.stringify(linha));

    // E a metade POSITIVA: chegando os 10 de B, agora fecha.
    await dbRun(db, 'UPDATE itens_pedido_compra SET quantidade_recebida = 10 WHERE id = ?', [linhas[1].id]);
    const fechado = (await receiptService.situacaoDosPedidosCompra(db)).find((l) => l.id === r.body.id);
    assert.strictEqual(fechado.situacao_recebimento, 'RECEBIDO', JSON.stringify(fechado));
    assert.strictEqual(fechado.saldo_pendente, 0, JSON.stringify(fechado));
  });

  // ── (2) O CORACAO: 51 PARCIAIS, AS DUAS FONTES NO MESMO BANCO ───────────────────────────────
  await test('(2) RN-E08 com 51 pedidos parciais a fonte NOVA devolve 51 e o aux da TELA devolve 50 (o LIMIT dele e intencional)', async () => {
    const idsCriados = [];
    for (let i = 0; i < 51; i += 1) {
      const { pedido } = await novoPedido({ quantidade: 10 });
      await receber(await linhaDo(pedido.id), 4);
      idsCriados.push(pedido.id);
    }
    const fonte = await receiptService.situacaoDosPedidosCompra(db, { situacao: 'PARCIAL' });
    const idsDaFonte = new Set(fonte.map((l) => l.id));
    const faltando = idsCriados.filter((id) => !idsDaFonte.has(id));
    assert.deepStrictEqual(faltando, [],
      `a fonte do alerta perdeu ${faltando.length} pedido(s) parcial(is) — e exatamente o silencio `
      + `do 51o que a spec 20 registrou como bloqueio`);
    assert.strictEqual(fonte.length, 51, `esperava 51 parciais na fonte nova, veio ${fonte.length}`);

    // A METADE PAREADA: o aux da tela continua com 50. Se este assert cair, alguem "consertou" o
    // LIMIT 50 da aba de recebimento — e ele e contrato de tela, com `?pendentes=1` dependendo da
    // POSICAO do filtro (comentario em `listarPedidosCompraAux`).
    const aux = await receiptService.listarPedidosCompraAux(db, { pendentes: '1' });
    assert.strictEqual(aux.length, 50,
      `o aux da TELA tinha de continuar em 50 (LIMIT intencional), veio ${aux.length}`);
  });

  // ── (3) O CAMPO QUE O ALERTA PRECISA E O AUX NAO TEM ───────────────────────────────────────
  await test('(3) RN-E08 a fonte nova leva previsao_entrega e status; o aux da tela NAO leva previsao_entrega', async () => {
    const previsao = diasDeHoje(-3);
    const { pedido } = await novoPedido({ previsao, quantidade: 8 });
    await receber(await linhaDo(pedido.id), 3);

    const linha = (await receiptService.situacaoDosPedidosCompra(db, { situacao: 'PARCIAL' }))
      .find((l) => l.id === pedido.id);
    assert.ok(linha, 'o pedido parcial recem-criado nao veio na fonte');
    assert.strictEqual(linha.previsao_entrega, previsao, JSON.stringify(linha));
    assert.strictEqual(linha.status, 'pendente', JSON.stringify(linha));
    assert.strictEqual(linha.numero, pedido.numero, JSON.stringify(linha));
    assert.strictEqual(linha.fornecedor_nome, 'Fornecedor E42 T1', JSON.stringify(linha));
    assert.strictEqual(linha.quantidade_pedida, 8, JSON.stringify(linha));
    assert.strictEqual(linha.quantidade_recebida, 3, JSON.stringify(linha));
    assert.strictEqual(linha.saldo_pendente, 5, JSON.stringify(linha));

    // ⚠️ COLUNAS PROJETADAS, nunca `p.*`: a linha CRUA viaja para a central de alertas, cujo gate
    // (`ver_alertas`) NAO inclui `checkModulePermission('compras')` — o mesmo vazamento que o F3
    // da Etapa 39 fechou na entrada do pedido atrasado.
    for (const proibida of ['valor_total', 'observacoes', 'fornecedor_id', 'created_at']) {
      assert.ok(!(proibida in linha),
        `a fonte vazou a coluna ${proibida} para quem le a central sem o modulo compras: ${JSON.stringify(linha)}`);
    }

    const aux = (await receiptService.listarPedidosCompraAux(db, { search: pedido.numero }))[0];
    assert.ok(aux, 'fixture: o aux nao achou o pedido pelo numero');
    assert.ok(!('previsao_entrega' in aux),
      'o aux da tela passou a levar previsao_entrega — se foi de proposito, a fonte nova perdeu o motivo de existir');
  });

  // ── (4) O FILTRO PELA REGUA, NAO POR SQL PARALELO ──────────────────────────────────────────
  await test('(4) RN-E08 o filtro { situacao } usa a regua unica: ABERTO e RECEBIDO ficam fora de PARCIAL', async () => {
    const { pedido: aberto } = await novoPedido({ quantidade: 5 });
    const { pedido: cheio } = await novoPedido({ quantidade: 5 });
    await receber(await linhaDo(cheio.id), 5);
    const { pedido: meio } = await novoPedido({ quantidade: 5 });
    await receber(await linhaDo(meio.id), 2);

    const parciais = (await receiptService.situacaoDosPedidosCompra(db, { situacao: 'PARCIAL' }))
      .map((l) => l.id);
    assert.ok(parciais.includes(meio.id), 'o parcial ficou fora do filtro PARCIAL');
    assert.ok(!parciais.includes(aberto.id), 'o ABERTO entrou no filtro PARCIAL');
    assert.ok(!parciais.includes(cheio.id), 'o RECEBIDO entrou no filtro PARCIAL');

    const todos = (await receiptService.situacaoDosPedidosCompra(db)).map((l) => l.id);
    for (const id of [aberto.id, cheio.id, meio.id]) {
      assert.ok(todos.includes(id), `sem filtro, o pedido ${id} tinha de vir`);
    }
    const situacoes = new Set((await receiptService.situacaoDosPedidosCompra(db))
      .filter((l) => [aberto.id, cheio.id, meio.id].includes(l.id))
      .map((l) => l.situacao_recebimento));
    assert.deepStrictEqual([...situacoes].sort(), ['ABERTO', 'PARCIAL', 'RECEBIDO']);
  });

  // ── (5) O RECORTE `material_id IS NOT NULL`, o MESMO do aux ────────────────────────────────
  await test('(5) RN-E08 linha de TEXTO LIVRE (sem material_id) nao conta — mesmo recorte do aux e da regua do POST', async () => {
    const { pedido } = await novoPedido({ quantidade: 6 });
    await receber(await linhaDo(pedido.id), 6);
    // A linha de texto livre que o Compras digita sem material: sem material nao ha o que dar
    // entrada, e conta-la faria a fonte dizer PARCIAL num pedido que ja chegou inteiro.
    await dbRun(db, `INSERT INTO itens_pedido_compra
      (pedido_id, material_id, descricao, quantidade, valor_unitario)
      VALUES (?, NULL, 'Frete', 1, 30)`, [pedido.id]);

    const linha = (await receiptService.situacaoDosPedidosCompra(db)).find((l) => l.id === pedido.id);
    assert.strictEqual(linha.situacao_recebimento, 'RECEBIDO',
      `a linha de texto livre reabriu o pedido: ${JSON.stringify(linha)}`);
    assert.strictEqual(linha.saldo_pendente, 0, JSON.stringify(linha));
  });

  // ── (5b) PEDIDO ORFAO DE FORNECEDOR — `LEFT JOIN`, nao `JOIN` ──────────────────────────────
  await test('(5b) RN-E08 pedido SEM fornecedor vem na fonte com fornecedor_nome null (LEFT JOIN, R9 da Etapa 39)', async () => {
    // O mesmo achado Important que a Etapa 39 pagou na entrada do pedido atrasado (`8f3db94`): com
    // `JOIN`, o pedido cujo `fornecedor_id` foi apagado (ou nunca preenchido) DESAPARECE do alerta
    // em silencio — e ele e justamente o pedido que ninguem esta acompanhando.
    const { pedido } = await novoPedido({ quantidade: 4 });
    await receber(await linhaDo(pedido.id), 1);
    await dbRun(db, 'UPDATE pedidos_compra SET fornecedor_id = NULL WHERE id = ?', [pedido.id]);

    const linha = (await receiptService.situacaoDosPedidosCompra(db, { situacao: 'PARCIAL' }))
      .find((l) => l.id === pedido.id);
    assert.ok(linha,
      'o pedido orfao de fornecedor sumiu da fonte — e o sintoma exato de `JOIN` em vez de `LEFT JOIN`');
    assert.strictEqual(linha.fornecedor_nome, null, JSON.stringify(linha));
    assert.strictEqual(linha.saldo_pendente, 3, JSON.stringify(linha));
  });

  // ── (6) TABELA AUSENTE — o mesmo contrato do aux e do gerarContaPagar ──────────────────────
  await test('(6) RN-E05/E08 sem a tabela pedidos_compra a fonte devolve [] em vez de quebrar', async () => {
    const vazio = new sqlite3.Database(':memory:');
    try {
      const r = await receiptService.situacaoDosPedidosCompra(vazio);
      assert.deepStrictEqual(r, [],
        'a fonte tem de devolver [] num banco sem a tabela de compras — a central de alertas roda '
        + 'no mesmo handle e o modulo ASSUME que as tabelas de compras podem nao existir');
    } finally {
      await new Promise((r) => vazio.close(r));
    }
  });

  // ── (7) O SQL DA SOMA TEM UM DONO SO ──────────────────────────────────────────────────────
  await test('(7) RN-E08 as duas fontes concordam no saldo do MESMO pedido (uma agregacao, um dono)', async () => {
    const { pedido } = await novoPedido({ quantidade: 9 });
    await receber(await linhaDo(pedido.id), 4);
    const daFonte = (await receiptService.situacaoDosPedidosCompra(db)).find((l) => l.id === pedido.id);
    const doAux = (await receiptService.listarPedidosCompraAux(db, { search: pedido.numero }))[0];
    assert.strictEqual(daFonte.quantidade_pedida, doAux.quantidade_pedida, 'pedida divergiu entre as fontes');
    assert.strictEqual(daFonte.quantidade_recebida, doAux.quantidade_recebida, 'recebida divergiu');
    assert.strictEqual(daFonte.saldo_pendente, doAux.saldo_pendente, 'saldo divergiu');
    assert.strictEqual(daFonte.situacao_recebimento, doAux.situacao_recebimento, 'situacao divergiu');
  });

  // Guarda de sanidade do proprio arquivo: sem isto, um `dbAll` que devolvesse [] em tudo deixaria
  // os cenarios de "nao inclui" passarem provando nada.
  const totalPedidos = (await dbGet(db, 'SELECT COUNT(*) AS n FROM pedidos_compra')).n;
  assert.ok(totalPedidos >= 56, `o banco do teste tinha de ter os pedidos das fixtures, tem ${totalPedidos}`);
  const totalLinhas = (await dbAll(db, 'SELECT id FROM itens_pedido_compra')).length;
  assert.ok(totalLinhas >= 57, `as linhas das fixtures nao entraram (${totalLinhas})`);

  await close();
  console.log(`\ncomprasPedidoSituacaoFonte: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
