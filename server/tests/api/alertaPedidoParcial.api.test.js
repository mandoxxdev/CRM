/**
 * Etapa 42, T3 (RN-E09) — a entrada PEDIDO_COMPRA_PARCIAL, a 13a do registro de alertas.
 *
 * ── O BLOQUEIO QUE ESTA ENTRADA DESFAZ ────────────────────────────────────────────────────────
 * `specs/modulo-almoxarifado/20-alertas/README.md` mantinha "Pedido recebido parcialmente" como
 * `[ ]` por DECISAO, nao por esquecimento: a regua de situacao/saldo da Etapa 37
 * (`derivarRecebimentoDoPedido`) nao era exportada, e a unica fonte exportada era
 * `listarPedidosCompraAux` — com `LIMIT 50` (contrato de TELA) e sem `previsao_entrega`. Um alerta
 * por e-mail construido sobre o aux ignoraria o 51o pedido parcial EM SILENCIO, e recalcular a
 * situacao aqui criaria a SEGUNDA formula de saldo. A T1 desta etapa (`dcda360`) resolveu os dois
 * lados com `situacaoDosPedidosCompra` (SEM `LIMIT`, com `previsao_entrega`/`status`, guarda
 * `sqlite_master`); esta entrada CONSOME essa fonte e nao escreve SQL novo nenhum.
 *
 * ⚠️ TODA assercao filtra a fila por `evento` (nota de cabecalho de alertaRegistro.api.test.js:6-8):
 * materiais/ferramentas semeados caem AUTOMATICAMENTE em outros alertas do registro, e um contador
 * global mediria o alerta errado.
 *
 * ⚠️ A ORDEM DOS CENARIOS E CONTRATO DESTE ARQUIVO: (5) e (6) afirmam `enfileiradas`/`duplicadas`
 * EXATOS da varredura, que contam TODOS os parciais enfileiraveis do banco. Os cenarios (2) e (3)
 * vem antes de proposito porque nao criam nenhum parcial enfileiravel (status terminal, ABERTO,
 * RECEBIDO), e o (4) reusa o P1 em vez de criar outro. Inserir um cenario novo com parcial
 * enfileiravel ANTES do (6) desalinha os numeros — acrescente depois.
 *
 * Executar: cd server && node tests/api/alertaPedidoParcial.api.test.js
 */
const assert = require('assert');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const queueService = require('../../services/almoxarifado/notificationQueueService');
const alertRegistry = require('../../services/almoxarifado/alertRegistry');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const EVENTO = 'PEDIDO_COMPRA_PARCIAL';
const ADMIN = { id: 143, nome: 'Admin E42 T3', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

function hashDedupe(evento, dedupeChave) {
  return crypto.createHash('sha256').update(`${evento}|${dedupeChave}`).digest('hex');
}

/** A chave ESPERADA, escrita a mao aqui: se a implementacao mudar de formula, este arquivo acusa. */
const chaveEsperada = (id, saldo) => `pedido-parcial-${id}-${Math.round(saldo * 1000)}`;

// hoje + N dias em data LOCAL (nunca `toISOString`, que e UTC) — convencao da Etapa 39.
function diasDeHoje(n) {
  const dt = new Date();
  dt.setDate(dt.getDate() + n);
  return [dt.getFullYear(), String(dt.getMonth() + 1).padStart(2, '0'),
    String(dt.getDate()).padStart(2, '0')].join('-');
}

async function setConfig(db, chave, valor) {
  await dbRun(db, 'UPDATE configuracoes_almoxarifado SET valor = ? WHERE chave = ?', [valor, chave]);
}

const filaDoParcial = (db) => dbAll(db,
  'SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = ? ORDER BY id ASC', [EVENTO]);

function resultadoDe(resultados, chave) {
  const r = resultados.find((x) => x.chave === chave);
  assert.ok(r, `a varredura nao devolveu entrada para ${chave}: ${JSON.stringify(resultados)}`);
  return r;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  await setConfig(db, 'alertas_estoque_emails', 'compras@gmp.ind.br');
  await setConfig(db, 'alertas_estoque_notificar_email', '1');

  const forn = await dbRun(db,
    "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Fornecedor E42 T3','44555666000177','ativo')");

  let seq = 0;
  async function novoMaterial() {
    seq += 1;
    const m = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'PC',0,1)`,
    [`MAT-E42T3-${String(seq).padStart(3, '0')}`, `Chapa E42 T3 ${seq}`]);
    return m.lastID;
  }

  /** O pedido nasce pela PORTA REAL da Etapa 38 — nunca por `INSERT` na mao. */
  async function novoPedido({ previsao = null, status = 'pendente', quantidades = [10] } = {}) {
    const itens = [];
    for (const quantidade of quantidades) {
      itens.push({ material_id: await novoMaterial(), quantidade, valor_unitario: 7 });
    }
    const r = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: forn.lastID, previsao_entrega: previsao, status, itens,
    });
    assert.strictEqual(r.status, 201, `fixture: POST do pedido falhou ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  }

  /**
   * O recebido da LINHA escrito direto, e isto e declarado (mesma nota de
   * comprasPedidoSituacaoFonte): em producao quem escreve e o acumulador da Etapa 37
   * (`receiptService.js`), e o caminho pelas portas ja e medido por
   * `recebimentoContraPedidoIntegracao` e pelo bloco D de `comprasPedidoAtrasoIntegracao`. O que
   * ESTE arquivo mede e a LEITURA (a entrada do registro), e para isso o que importa e o ESTADO.
   */
  async function receber(pedidoId, quantidades) {
    const linhas = await dbAll(db,
      'SELECT id FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id ASC', [pedidoId]);
    for (let i = 0; i < quantidades.length; i += 1) {
      await dbRun(db, 'UPDATE itens_pedido_compra SET quantidade_recebida = ? WHERE id = ?',
        [quantidades[i], linhas[i].id]);
    }
  }

  const entradaDoParcial = () => {
    const e = alertRegistry.ALERT_REGISTRY.find((x) => x.chave === EVENTO);
    assert.ok(e, `ALERT_REGISTRY nao tem ${EVENTO} — a 13a entrada nao existe`);
    return e;
  };

  async function cartaoDaCentral(chave = EVENTO) {
    const { alertas } = await alertRegistry.montarCentral(db);
    return { alertas, cartao: alertas.find((a) => a.chave === chave) };
  }

  const previsaoP1 = diasDeHoje(-4);
  let P1;

  // ── (1) A POPULACAO: pedido 10 com 4 recebidos entra, com os campos que o e-mail e o cartao leem
  await test('(1) RN-E09 pedido de 10 com 4 recebidos entra na central com pedida/recebida/saldo/situacao', async () => {
    P1 = await novoPedido({ previsao: previsaoP1, quantidades: [10] });
    await receber(P1.id, [4]);

    const { cartao } = await cartaoDaCentral();
    assert.ok(cartao, 'a central nao tem o cartao PEDIDO_COMPRA_PARCIAL');
    // ⚠️ E ESTA a assercao que acusa um `{}` capturado mid-load pelo require de TOPO: sem ela, o
    // `situacaoDosPedidosCompra` undefined faria o `listar` lancar, a central devolveria
    // `erro: true` (try/catch por entrada) e a suite ficaria VERDE com o alerta morto.
    assert.strictEqual(cartao.erro, undefined, `listar lancou: ${cartao.erro_mensagem}`);
    assert.strictEqual(cartao.titulo, 'Pedido de compra recebido parcialmente');
    assert.strictEqual(cartao.descricao, 'Pedidos de compra com entrega parcial e saldo ainda pendente.');
    assert.strictEqual(cartao.dias, null, 'a entrada nao tem janela de dias (configDias: null)');
    assert.strictEqual(cartao.total, 1, `esperava 1 parcial na central, veio ${cartao.total}`);

    const linha = cartao.linhas.find((l) => l.id === P1.id);
    assert.ok(linha, `o pedido ${P1.numero} nao veio nas linhas do cartao`);
    assert.strictEqual(linha.numero, P1.numero, JSON.stringify(linha));
    assert.strictEqual(linha.fornecedor_nome, 'Fornecedor E42 T3', JSON.stringify(linha));
    assert.strictEqual(linha.quantidade_pedida, 10, JSON.stringify(linha));
    assert.strictEqual(linha.quantidade_recebida, 4, JSON.stringify(linha));
    assert.strictEqual(linha.saldo_pendente, 6, JSON.stringify(linha));
    assert.strictEqual(linha.previsao_entrega, previsaoP1, JSON.stringify(linha));
    assert.strictEqual(linha.situacao_recebimento, 'PARCIAL', JSON.stringify(linha));
  });

  // ── (2) STATUS DECIDIDO PELO COMPRADOR FICA FORA ────────────────────────────────────────────
  await test('(2) RN-E09 parcial com status cancelado, rejeitado ou recebido NAO entra (nao e pendencia)', async () => {
    // `cancelado`/`rejeitado`: o pedido foi abandonado no meio, e o saldo pendente dele nao e
    // pendencia de ninguem. `recebido`: o comprador JA declarou o pedido encerrado a mao (a saida
    // manual que o `PATCH .../status` da Etapa 39 abriu) — insistir por e-mail seria discutir com
    // a decisao humana. Sem este filtro, os tres viram e-mail diario ate o fim dos tempos.
    const decididos = [];
    for (const status of ['cancelado', 'rejeitado', 'recebido']) {
      const p = await novoPedido({ previsao: diasDeHoje(-2), status, quantidades: [10] });
      await receber(p.id, [4]);
      decididos.push({ status, ...p });
    }

    // METADE POSITIVA: a fonte os enxerga como PARCIAL — quem os tira e o filtro da ENTRADA, nao
    // um efeito colateral da fonte. Sem isto, um fixture que nem chegasse a `PARCIAL` deixaria o
    // cenario passar provando nada.
    const daFonte = (await receiptService.situacaoDosPedidosCompra(db, { situacao: 'PARCIAL' }))
      .map((l) => l.id);
    for (const p of decididos) {
      assert.ok(daFonte.includes(p.id),
        `fixture vazia: o pedido ${p.status} nem chegou a PARCIAL na fonte`);
    }

    const doAlerta = (await entradaDoParcial().listar(db, { dias: null })).map((l) => l.id);
    for (const p of decididos) {
      assert.ok(!doAlerta.includes(p.id),
        `pedido com status ${p.status} entrou no alerta de parcial`);
    }
    assert.deepStrictEqual(doAlerta, [P1.id],
      `o alerta tinha de listar so o P1: ${JSON.stringify(doAlerta)}`);
  });

  // ── (3) A POPULACAO E SO `PARCIAL` ──────────────────────────────────────────────────────────
  await test('(3) RN-E09 pedido ABERTO (0 recebidos) e pedido RECEBIDO por inteiro ficam fora', async () => {
    const aberto = await novoPedido({ previsao: diasDeHoje(-1), quantidades: [10] });
    const cheio = await novoPedido({ previsao: diasDeHoje(-1), quantidades: [10] });
    await receber(cheio.id, [10]);

    const doAlerta = (await entradaDoParcial().listar(db, { dias: null })).map((l) => l.id);
    assert.ok(!doAlerta.includes(aberto.id), 'pedido ABERTO entrou no alerta de PARCIAL');
    assert.ok(!doAlerta.includes(cheio.id), 'pedido recebido por inteiro entrou no alerta de PARCIAL');
    assert.deepStrictEqual(doAlerta, [P1.id], `o alerta tinha de listar so o P1: ${JSON.stringify(doAlerta)}`);
  });

  // ── (4) VAZAMENTO DE COLUNA ─────────────────────────────────────────────────────────────────
  await test('(4) F3/E39 a central nao leva valor_total, observacoes nem fornecedor_id do pedido CORE', async () => {
    // ── O DEFEITO QUE ESTE CENARIO EXISTE PARA PEGAR ───────────────────────────────────────────
    // `montarCentral` devolve as linhas CRUAS (ate 50) na resposta de
    // `GET /api/almoxarifado/alertas/central`, cujo gate e `requirePermission('ver_alertas')` —
    // que NAO inclui `checkModulePermission('compras')`. Com `p.*` na fonte, um ALMOXARIFE (403 em
    // `GET /api/compras/pedidos`) receberia `valor_total` e `observacoes` de pedidos CORE na aba
    // Network, ainda que a tela desenhe 6 colunas. E a mesma classe de dado que tirou
    // PRODUCAO/ENGENHARIA/CONSULTA de `ver_alertas` na Etapa 16 (`valor_parado`).
    //
    // ⚠️ O FIXTURE PRECISA TER OS CAMPOS PREENCHIDOS: com `valor_total`/`observacoes` NULL o `p.*`
    // ainda TRARIA as chaves, mas quem lesse o teste acharia que ele mede ausencia de DADO.
    const SIGILO = 'Comissao de 8% combinada por fora — nao repassar';
    await dbRun(db, 'UPDATE pedidos_compra SET valor_total = ?, observacoes = ? WHERE id = ?',
      [123456.78, SIGILO, P1.id]);

    const resp = await request(app).get('/api/almoxarifado/alertas/central');
    assert.strictEqual(resp.status, 200, `central respondeu ${resp.status}: ${JSON.stringify(resp.body)}`);
    const cartao = (resp.body.alertas || []).find((a) => a.chave === EVENTO);
    assert.ok(cartao, 'a central nao trouxe o cartao PEDIDO_COMPRA_PARCIAL');
    assert.strictEqual(cartao.erro, undefined, `listar lancou: ${cartao.erro_mensagem}`);
    assert.ok(cartao.linhas.length > 0, 'fixture vazia: este cenario nao mediria nada');

    for (const l of cartao.linhas) {
      for (const coluna of ['valor_total', 'observacoes', 'fornecedor_id', 'created_at', 'updated_at',
        'total_pedido', 'soma_recebida']) {
        assert.ok(!(coluna in l),
          `a central esta levando \`${coluna}\` de pedidos_compra: ${JSON.stringify(l)}`);
      }
    }
    // A prova de que o vazamento seria REAL e nao teorico: o texto sigiloso nao aparece em lugar
    // nenhum da resposta inteira (nem numa chave que o loop acima nao conheca).
    assert.ok(!JSON.stringify(resp.body).includes(SIGILO),
      'a observacao do pedido apareceu no corpo da central');

    // METADE POSITIVA: as colunas que o cartao DESENHA continuam chegando — sem isto, uma projecao
    // que esquecesse `numero` deixaria a tela mostrando `#id` e a suite verde.
    const doP1 = cartao.linhas.find((l) => l.id === P1.id);
    for (const campo of ['id', 'numero', 'status', 'previsao_entrega', 'fornecedor_nome',
      'quantidade_pedida', 'quantidade_recebida', 'saldo_pendente', 'situacao_recebimento']) {
      assert.ok(campo in doP1, `a projecao derrubou o campo \`${campo}\`: ${JSON.stringify(doP1)}`);
    }
  });

  // ── (5) O DEDUPE CARREGA O SALDO ────────────────────────────────────────────────────────────
  await test('(5) RN-E09 1 aviso por SALDO: 2a varredura no mesmo saldo duplica, saldo novo gera aviso NOVO', async () => {
    // ── O DEFEITO QUE ESTE CENARIO EXISTE PARA PEGAR ───────────────────────────────────────────
    // Com `dedupeChave = pedido-parcial-<id>`, o hash do primeiro aviso ficava gravado num indice
    // UNIQUE e o `INSERT OR IGNORE` do `enfileirar` devolvia DUPLICADA para sempre: o pedido
    // recebia MAIS material (o evento que o comprador precisa acompanhar) e nenhum e-mail saia,
    // nunca mais. Nao ha expurgo da fila, entao o silencio e permanente — a mesma licao que o
    // `pedido-atrasado-<id>` da Etapa 39 pagou (`33031ac`).
    const v1 = resultadoDe(await queueService.varrerAlertasRegistrados(db), EVENTO);
    assert.deepStrictEqual({ enfileiradas: v1.enfileiradas, duplicadas: v1.duplicadas },
      { enfileiradas: 1, duplicadas: 0 }, JSON.stringify(v1));
    let fila = await filaDoParcial(db);
    assert.strictEqual(fila.length, 1, `esperava 1 linha na fila, veio ${fila.length}`);
    assert.strictEqual(JSON.parse(fila[0].payload).pedido_compra_id, P1.id, fila[0].payload);
    assert.strictEqual(JSON.parse(fila[0].payload).saldo_pendente, 6, fila[0].payload);
    assert.strictEqual(fila[0].hash_dedupe, hashDedupe(EVENTO, chaveEsperada(P1.id, 6)),
      'o dedupe deveria ser pedido-parcial-<id>-<saldo arredondado a 3 casas>');

    // 2a varredura, MESMO saldo: nada novo (o objetivo original da RN-01, preservado inteiro).
    const v2 = resultadoDe(await queueService.varrerAlertasRegistrados(db), EVENTO);
    assert.deepStrictEqual({ enfileiradas: v2.enfileiradas, duplicadas: v2.duplicadas },
      { enfileiradas: 0, duplicadas: 1 }, JSON.stringify(v2));
    assert.strictEqual((await filaDoParcial(db)).length, 1, 'a 2a varredura duplicou a fila');

    // CHEGOU MAIS MATERIAL: 4 -> 6 de 10, saldo 6 -> 4. Tem de sair um aviso NOVO.
    await receber(P1.id, [6]);
    const v3 = resultadoDe(await queueService.varrerAlertasRegistrados(db), EVENTO);
    assert.strictEqual(v3.enfileiradas, 1,
      `remessa parcial nova tinha de gerar um SEGUNDO aviso: ${JSON.stringify(v3)}`);
    fila = await filaDoParcial(db);
    assert.strictEqual(fila.length, 2, `esperava 2 linhas (uma por saldo), veio ${fila.length}`);
    assert.deepStrictEqual(fila.map((l) => l.hash_dedupe).sort(),
      [hashDedupe(EVENTO, chaveEsperada(P1.id, 6)), hashDedupe(EVENTO, chaveEsperada(P1.id, 4))].sort(),
      'as duas linhas tinham de ser uma por saldo pendente');

    // ⚠️ A METADE QUE IMPEDE O CONSERTO DE VIRAR "avisa todo dia": com o MESMO saldo, a varredura
    // seguinte nao pode enfileirar nada.
    const v4 = resultadoDe(await queueService.varrerAlertasRegistrados(db), EVENTO);
    assert.strictEqual(v4.enfileiradas, 0,
      `pedido parado no MESMO saldo nao pode ser relembrado: ${JSON.stringify(v4)}`);
    assert.ok(v4.duplicadas >= 1, `esperava duplicadas na varredura seguinte: ${JSON.stringify(v4)}`);
  });

  // ── (6) SALDO FRACIONARIO: A CHAVE ARREDONDA ────────────────────────────────────────────────
  await test('(6) F14 dois estados fisicos IGUAIS com saldo REAL diferente geram a MESMA chave (arredondada)', async () => {
    // ── O DEFEITO QUE ESTE CENARIO EXISTE PARA PEGAR ───────────────────────────────────────────
    // `saldo_pendente` e `Math.max(0, pedida - recebida)` sobre `SUM(REAL)`, SEM arredondamento.
    // Dois pedidos com o MESMO estado fisico (10 pedidos, 3,3 recebidos) dao saldos diferentes em
    // ponto flutuante conforme o numero de LINHAS que a soma percorre — MEDIDO abaixo, nao
    // teorizado. Uma chave crua (`${saldo}`) mandaria dois e-mails para o mesmo estado, e o pior:
    // o segundo e-mail chegaria sem nada ter acontecido no pedido.
    const umaLinha = await novoPedido({ previsao: diasDeHoje(-1), quantidades: [10] });
    await receber(umaLinha.id, [3.3]);
    const duasLinhas = await novoPedido({ previsao: diasDeHoje(-1), quantidades: [4, 6] });
    await receber(duasLinhas.id, [1.1, 2.2]);

    const fonte = await receiptService.situacaoDosPedidosCompra(db, { situacao: 'PARCIAL' });
    const a = fonte.find((l) => l.id === umaLinha.id);
    const b = fonte.find((l) => l.id === duasLinhas.id);
    assert.ok(a && b, 'fixture: os dois pedidos fracionarios tinham de vir na fonte como PARCIAL');
    // Os dois receberam 3,3 do total de 10 — o MESMO estado fisico, por caminhos diferentes.
    assert.strictEqual(Math.round(a.quantidade_recebida * 1000), 3300, JSON.stringify(a));
    assert.strictEqual(Math.round(b.quantidade_recebida * 1000), 3300, JSON.stringify(b));
    assert.strictEqual(a.quantidade_pedida, b.quantidade_pedida, 'fixture: as pedidas tinham de bater');
    // A MEDIDA que justifica o arredondamento: os dois saldos NAO sao o mesmo double.
    assert.notStrictEqual(a.saldo_pendente, b.saldo_pendente,
      `fixture perdeu a poeira de ponto flutuante (${a.saldo_pendente} vs ${b.saldo_pendente}) — `
      + 'sem ela este cenario nao mede nada');

    const entrada = entradaDoParcial();
    assert.strictEqual(
      entrada.dedupeChave({ id: 99, saldo_pendente: a.saldo_pendente }),
      entrada.dedupeChave({ id: 99, saldo_pendente: b.saldo_pendente }),
      'o mesmo estado fisico gerou duas chaves de dedupe — dois e-mails pelo mesmo saldo',
    );
    // E a metade negativa: a chave CRUA teria divergido (o dano e real, nao hipotetico).
    assert.notStrictEqual(`pedido-parcial-99-${a.saldo_pendente}`, `pedido-parcial-99-${b.saldo_pendente}`,
      'a fixture nao reproduz a divergencia que o arredondamento existe para absorver');
    // E o arredondamento NAO pode calar uma chegada de verdade: 0,001 ainda muda a chave.
    assert.notStrictEqual(entrada.dedupeChave({ id: 99, saldo_pendente: 6.7 }),
      entrada.dedupeChave({ id: 99, saldo_pendente: 6.699 }),
      'o arredondamento engoliu uma diferenca REAL de saldo');

    // E a varredura enfileira UMA linha por pedido fracionario, com a chave arredondada.
    const v = resultadoDe(await queueService.varrerAlertasRegistrados(db), EVENTO);
    assert.strictEqual(v.enfileiradas, 2, `esperava 2 avisos novos (os dois fracionarios): ${JSON.stringify(v)}`);
    const fila = await filaDoParcial(db);
    for (const p of [a, b]) {
      const linhas = fila.filter((l) => JSON.parse(l.payload).pedido_compra_id === p.id);
      assert.strictEqual(linhas.length, 1, `o pedido ${p.numero} tinha de ter 1 linha, tem ${linhas.length}`);
      assert.strictEqual(linhas[0].hash_dedupe, hashDedupe(EVENTO, chaveEsperada(p.id, p.saldo_pendente)),
        `a chave do pedido fracionario ${p.numero} divergiu da formula arredondada`);
    }
    // 2a varredura no mesmo estado: nada novo para NENHUM dos dois.
    const v2 = resultadoDe(await queueService.varrerAlertasRegistrados(db), EVENTO);
    assert.strictEqual(v2.enfileiradas, 0, `saldo fracionario parado nao pode reavisar: ${JSON.stringify(v2)}`);
  });

  // ── (7) SEM PREVISAO DE ENTREGA ─────────────────────────────────────────────────────────────
  await test('(7) F4 parcial SEM previsao (null e string vazia) entra e o corpo diz "nao informada"', async () => {
    // ── POR QUE ESTE CENARIO EXISTE ───────────────────────────────────────────────────────────
    // O alerta de ATRASO nunca passou por isto porque a regua dele FILTRA por
    // `/^\d{4}-\d{2}-\d{2}$/` (`pedidoCompraService.js:753`). A populacao do PARCIAL nao filtra
    // previsao nenhuma — de proposito: um pedido importado sem previsao com saldo pendente e
    // exatamente o que ninguem esta acompanhando. Sem tratar o vazio, o e-mail sairia
    // `Previsão de entrega: null` (ou vazio) para o comprador.
    //
    // `''` e `null` sao o MESMO caso: a base tem a string vazia gravada na coluna `DATE` porque
    // ate a onda F3 da Etapa 38 o formulario mandava `''` sempre (`pedidoCompraService.js:744-746`).
    // O `''` vai por `UPDATE` porque a porta da Etapa 38 hoje VALIDA o formato e recusaria.
    const semNada = await novoPedido({ previsao: null, quantidades: [10] });
    await receber(semNada.id, [2]);
    const comVazio = await novoPedido({ previsao: diasDeHoje(-1), quantidades: [10] });
    await receber(comVazio.id, [2]);
    await dbRun(db, "UPDATE pedidos_compra SET previsao_entrega = '' WHERE id = ?", [comVazio.id]);

    const entrada = entradaDoParcial();
    const linhas = await entrada.listar(db, { dias: null });
    for (const p of [semNada, comVazio]) {
      const l = linhas.find((x) => x.id === p.id);
      assert.ok(l, `o parcial sem previsao (${p.numero}) ficou fora do alerta`);
      const corpo = entrada.corpo(l);
      assert.ok(corpo.includes('Previsão de entrega: não informada'),
        `o corpo tinha de dizer "não informada": ${JSON.stringify(corpo)}`);
      assert.ok(!/Previsão de entrega: (null|undefined|\s*$)/m.test(corpo),
        `o corpo vazou o valor cru da previsao: ${JSON.stringify(corpo)}`);
    }
    // METADE POSITIVA: com previsao de verdade, a data CRUA continua saindo (o tratamento do vazio
    // nao pode ter virado um "nao informada" universal).
    const doP1 = linhas.find((l) => l.id === P1.id);
    assert.ok(entrada.corpo(doP1).includes(`Previsão de entrega: ${previsaoP1}`),
      `o corpo do P1 perdeu a data: ${JSON.stringify(entrada.corpo(doP1))}`);
  });

  // ── (8) ASSUNTO E AS 7 LINHAS DO CORPO ──────────────────────────────────────────────────────
  await test('(8) RN-E09 assunto com prefixo [Compras] e o numero; corpo com as 7 literais congeladas', async () => {
    const fila = await filaDoParcial(db);
    const doP1 = fila.find((l) => JSON.parse(l.payload).pedido_compra_id === P1.id
      && JSON.parse(l.payload).saldo_pendente === 4);
    assert.ok(doP1, 'a fila nao tem a linha do P1 com saldo 4');
    assert.strictEqual(doP1.assunto, `[Compras] Pedido de compra recebido parcialmente — ${P1.numero}`,
      `assunto literal divergiu: ${JSON.stringify(doP1.assunto)}`);
    // O documento e de COMPRAS e a lista de destinatarios e compartilhada — o prefixo e o que
    // deixa o leitor filtrar (mesma decisao do pedido atrasado, Etapa 39).
    assert.ok(!doP1.assunto.includes('[Almoxarifado]'), `prefixo errado: ${doP1.assunto}`);

    const esperadas = [
      `Pedido: ${P1.numero}`,
      'Fornecedor: Fornecedor E42 T3',
      'Quantidade pedida: 10',
      'Quantidade recebida: 6',
      'Saldo pendente: 4',
      `Previsão de entrega: ${previsaoP1}`,
      'Status: pendente',
    ];
    assert.deepStrictEqual(doP1.corpo_texto.split('\n'), esperadas,
      `as 7 linhas do corpo sao contrato congelado: ${JSON.stringify(doP1.corpo_texto)}`);
  });

  // ── (9) PEDIDO ORFAO DE FORNECEDOR ──────────────────────────────────────────────────────────
  await test('(9) R9/E39 parcial SEM fornecedor entra e o corpo traz "Fornecedor: -"', async () => {
    // Com `JOIN` no lugar do `LEFT JOIN` da fonte, o pedido cujo `fornecedor_id` foi apagado
    // DESAPARECE do alerta em silencio — e ele e justamente o pedido que ninguem acompanha. A
    // fonte e testada por `comprasPedidoSituacaoFonte (5b)`; aqui mede-se o que o E-MAIL escreve.
    const orfao = await novoPedido({ previsao: diasDeHoje(-3), quantidades: [10] });
    await receber(orfao.id, [1]);
    await dbRun(db, 'UPDATE pedidos_compra SET fornecedor_id = NULL WHERE id = ?', [orfao.id]);

    const entrada = entradaDoParcial();
    const l = (await entrada.listar(db, { dias: null })).find((x) => x.id === orfao.id);
    assert.ok(l, 'o parcial orfao de fornecedor sumiu do alerta (JOIN em vez de LEFT JOIN?)');
    assert.strictEqual(l.fornecedor_nome, null, JSON.stringify(l));
    assert.ok(/^Fornecedor: -$/m.test(entrada.corpo(l)),
      `o corpo do orfao tinha de trazer 'Fornecedor: -': ${JSON.stringify(entrada.corpo(l))}`);

    const v = resultadoDe(await queueService.varrerAlertasRegistrados(db), EVENTO);
    assert.ok(v.enfileiradas >= 1, `o orfao tinha de ser enfileirado: ${JSON.stringify(v)}`);
    const doOrfao = (await filaDoParcial(db))
      .filter((x) => JSON.parse(x.payload).pedido_compra_id === orfao.id);
    assert.strictEqual(doOrfao.length, 1, `esperava 1 linha para o orfao, veio ${doOrfao.length}`);
    assert.ok(/^Fornecedor: -$/m.test(doOrfao[0].corpo_texto), doOrfao[0].corpo_texto);
  });

  // ── (10) O REGISTRO TEM 13 ENTRADAS, INCLUSIVE NUM PROCESSO FRIO ────────────────────────────
  await test('(10) F17 a 13a entrada carrega num processo FRIO com listar function (require lazy)', async () => {
    assert.strictEqual(alertRegistry.ALERT_REGISTRY.length, 13,
      `o registro tinha de ter 13 entradas, tem ${alertRegistry.ALERT_REGISTRY.length}`);
    const { cartao, alertas } = await cartaoDaCentral();
    assert.strictEqual(alertas.length, 13, `a central tem ${alertas.length} cartoes`);
    assert.strictEqual(cartao.erro, undefined, `listar lancou: ${cartao.erro_mensagem}`);
    // Nenhuma das 12 anteriores caiu por causa da nova.
    const comErro = alertas.filter((a) => a.erro).map((a) => a.chave);
    assert.deepStrictEqual(comErro, [], `entradas com erro na central: ${JSON.stringify(comErro)}`);

    // Processo NOVO, cache de modulos vazio, e o alertRegistry como PRIMEIRO require: e a ordem de
    // carga que um require de TOPO de `receiptService` tornaria arriscada — `receiptService.js:31`
    // requer ESTE arquivo no topo, entao o ciclo FECHA e um dos lados captura `{}` mid-load.
    // `{}` nao lanca: `situacaoDosPedidosCompra` viria `undefined`, o `listar` lancaria e o cartao
    // apareceria com `erro: true` sem quebrar a suite. Modo de falha silencioso.
    const { execFileSync } = require('child_process');
    const saida = execFileSync(process.execPath, ['-e', `
      const r = require('./services/almoxarifado/alertRegistry');
      const e = r.ALERT_REGISTRY.find((x) => x.chave === 'PEDIDO_COMPRA_PARCIAL');
      console.log(JSON.stringify({ total: r.ALERT_REGISTRY.length, tem: !!e, listar: typeof (e && e.listar) }));
    `], { cwd: require('path').join(__dirname, '..', '..'), encoding: 'utf8' });
    const medido = JSON.parse(saida.trim().split('\n').pop());
    assert.deepStrictEqual(medido, { total: 13, tem: true, listar: 'function' },
      `carga a frio devolveu ${saida.trim()}`);
  });

  // ── (10b) A ORDEM DE CARGA INVERSA — O ÚNICO CENÁRIO QUE ACUSA O REQUIRE DE TOPO ────────────
  await test('(10b) F17 com receiptService carregado PRIMEIRO o listar ainda resolve (o ciclo FECHA nessa ordem)', async () => {
    // ── POR QUE ESTE CENARIO EXISTE, E COMO ELE FOI MEDIDO ────────────────────────────────────
    // Na revisao desta task, a sabotagem "require de TOPO em vez de lazy" passou por TODOS os
    // outros cenarios deste arquivo — inclusive o (10), a carga a frio. O motivo, medido com sonda:
    //   • `receiptService.js:31` captura este registro pelo OBJETO do modulo
    //     (`const alertRegistry = require('./alertRegistry')`), entao ELE sobrevive ao ciclo;
    //   • um require de topo AQUI seria uma DESESTRUTURACAO, e desestruturar um modulo mid-load
    //     captura `undefined` (Node avisa "Accessing non-existent property ... inside circular
    //     dependency" e segue em frente);
    //   • quem captura `undefined` depende de QUEM CARREGA PRIMEIRO. Com o `alertRegistry` na
    //     frente (a ordem do cenario (10) e a do processo de teste) o require de topo FUNCIONA;
    //     com `receiptService` na frente, `listar` lanca "is not a function", `montarCentral`
    //     traduz em `erro: true` e a suite fica VERDE com o alerta morto.
    // Ou seja: sem esta sonda, o contrato do require lazy nao tinha nenhuma rede — e a ordem de
    // carga de producao depende de qual rota do servidor e registrada primeiro, que muda sem aviso.
    const { execFileSync } = require('child_process');
    const saida = execFileSync(process.execPath, ['-e', `
      require('./services/almoxarifado/receiptService');
      const r = require('./services/almoxarifado/alertRegistry');
      const e = r.ALERT_REGISTRY.find((x) => x.chave === 'PEDIDO_COMPRA_PARCIAL');
      const db = new (require('sqlite3').Database)(':memory:');
      e.listar(db, { dias: null })
        .then((l) => console.log(JSON.stringify({ ok: true, linhas: l.length })))
        .catch((err) => console.log(JSON.stringify({ ok: false, erro: err.message })));
    `], { cwd: require('path').join(__dirname, '..', '..'), encoding: 'utf8' });
    const medido = JSON.parse(saida.trim().split('\n').pop());
    // `linhas: 0` porque o banco e `:memory:` sem a tabela de compras — o que se mede aqui e que o
    // `listar` RESOLVEU (a guarda `sqlite_master` da fonte devolveu `[]`), nao que ele achou algo.
    assert.deepStrictEqual(medido, { ok: true, linhas: 0 },
      `o listar nao sobreviveu a ordem de carga inversa — require de TOPO? ${saida.trim()}`);
  });

  // ── (11) TABELA `pedidos_compra` AUSENTE ────────────────────────────────────────────────────
  // ⚠️ ULTIMO CENARIO DE PROPOSITO: ele RENOMEIA a tabela de compras. Fica no fim para nao
  // contaminar os anteriores, e desfaz a renomeacao no `finally`.
  await test('(11) RN-E05 sem a tabela pedidos_compra a central responde e as entradas de almoxarifado seguem vivas', async () => {
    await dbRun(db, 'ALTER TABLE pedidos_compra RENAME TO pedidos_compra_fora_e42t3');
    try {
      const { alertas, cartao } = await cartaoDaCentral();
      assert.strictEqual(alertas.length, 13, 'a central perdeu cartoes com a tabela ausente');
      assert.ok(cartao, 'o cartao do parcial desapareceu');
      // A guarda `sqlite_master` e da fonte (T1): sem a tabela, ela devolve `[]` e o cartao vem
      // VAZIO, nao com erro.
      assert.strictEqual(cartao.erro, undefined,
        `o parcial tinha de sobreviver pela guarda sqlite_master: ${cartao.erro_mensagem}`);
      assert.strictEqual(cartao.total, 0, `esperava 0 parciais, veio ${cartao.total}`);

      // As 11 entradas que so leem tabelas `*_almoxarifado` continuam respondendo.
      const semCompras = alertas.filter((a) => !a.chave.startsWith('PEDIDO_COMPRA_'));
      assert.strictEqual(semCompras.length, 11, JSON.stringify(semCompras.map((a) => a.chave)));
      const quebradas = semCompras.filter((a) => a.erro).map((a) => a.chave);
      assert.deepStrictEqual(quebradas, [],
        `entradas de almoxarifado quebraram por falta de tabela de compras: ${JSON.stringify(quebradas)}`);

      // ⚠️ DIVERGENCIA DECLARADA, nao defeito desta task: `PEDIDO_COMPRA_ATRASADO` (Etapa 39) NAO
      // tem a guarda `sqlite_master` e vem `erro: true` aqui. Esta na letra G e o design da Etapa
      // 42 diz explicitamente que nao a conserta ("Nao conserta a falta de guarda `sqlite_master`
      // da entrada `PEDIDO_COMPRA_ATRASADO`"). A assercao fica AFIRMATIVA para que o dia em que
      // alguem por a guarda la este arquivo acuse e o leitor venha ler isto.
      const atrasado = alertas.find((a) => a.chave === 'PEDIDO_COMPRA_ATRASADO');
      assert.strictEqual(atrasado.erro, true,
        'PEDIDO_COMPRA_ATRASADO passou a sobreviver a falta da tabela — se a guarda foi acrescentada '
        + 'de proposito (letra G), atualize esta assercao e a nota acima');

      // A varredura tambem nao quebra, e nao enfileira nada pelo parcial.
      const v = resultadoDe(await queueService.varrerAlertasRegistrados(db), EVENTO);
      assert.deepStrictEqual({ enfileiradas: v.enfileiradas, erro: v.erro },
        { enfileiradas: 0, erro: undefined }, JSON.stringify(v));
    } finally {
      await dbRun(db, 'ALTER TABLE pedidos_compra_fora_e42t3 RENAME TO pedidos_compra');
    }
  });

  // Guarda de sanidade do proprio arquivo: sem isto, um banco vazio deixaria os cenarios de
  // "nao inclui" passarem provando nada.
  const totalPedidos = (await dbGet(db, 'SELECT COUNT(*) AS n FROM pedidos_compra')).n;
  assert.ok(totalPedidos >= 10, `as fixtures de pedido nao entraram (${totalPedidos})`);
  const totalFila = (await filaDoParcial(db)).length;
  assert.ok(totalFila >= 5, `a fila do parcial ficou vazia demais (${totalFila})`);

  await close();
  console.log(`\nalertaPedidoParcial: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
