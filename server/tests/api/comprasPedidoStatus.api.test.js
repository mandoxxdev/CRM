/**
 * Etapa 39, onda de correcao F4 — `PATCH /api/compras/pedidos/:id/status`, a saida do beco da
 * RN-D12.
 *
 * ── O QUE ESTE ARQUIVO EXISTE PARA MEDIR ──────────────────────────────────────────────────────
 * Todo pedido que o almoxarifado recebe DEPOIS da data prometida ficava "Atrasado" para sempre: o
 * `processar` da Etapa 37 nao escreve `pedidos_compra.status` (decisao 4 da E37, RN-24), entao o
 * CORE continua `pendente`, o badge cresce sem teto e o pedido mora dentro de `?atrasados=1` — a
 * feature-titulo da etapa. E o comprador NAO tinha gesto de tela que corrigisse: o `PUT` com
 * `status:'recebido'` bate na guarda da Etapa 38 e volta 400.
 *
 * ── A ASSERCAO QUE NENHUM `assert` DE STATUS PEGA ─────────────────────────────────────────────
 * A porta nova nao pode ser um `PUT` disfarcado. `atualizarPedido` faz `DELETE` + `INSERT` das
 * linhas e o `INSERT` omite `quantidade_recebida` (`REAL DEFAULT 0`): um caminho que reaproveitasse
 * aquele codigo responderia **200** e, em silencio, zeraria o recebido — o `?pendentes=1` da 37
 * voltaria a mostrar o pedido ABERTO com o saldo inteiro e o operador receberia o mesmo material
 * duas vezes. Por isso o cenario (1) mede `quantidade_recebida` (era 10, segue 10) e os **ids** das
 * linhas, nao so o codigo HTTP.
 *
 * ⚠️ NENHUMA DATA LITERAL: todas derivam de `hojeLocalISO()`, a MESMA funcao da rota (R3).
 *
 * Executar: cd server && node tests/api/comprasPedidoStatus.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const pedidoCompraService = require('../../services/compras/pedidoCompraService');
const { STATUS_PEDIDO_INVALIDO } = require('../../services/compras/schemas');
const { hojeLocalISO, PEDIDO_NAO_ENCONTRADO } = require('../../services/compras/pedidoCompraService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 96, nome: 'Admin E39 F4', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

/** A literal da guarda da Etapa 38, congelada aqui: o cenario (5) afirma que ela NAO afrouxou. */
const jaTeveRecebimento = (numero) => `Pedido de compra ${numero} já teve recebimento — não pode mais ser editado`;

// hoje + N dias, em data LOCAL, pela MESMA regua do servidor. Nao usa toISOString (UTC).
function diasDeHoje(n) {
  const [a, m, d] = hojeLocalISO().split('-').map(Number);
  const dt = new Date(a, m - 1, d + n);
  return [dt.getFullYear(), String(dt.getMonth() + 1).padStart(2, '0'),
    String(dt.getDate()).padStart(2, '0')].join('-');
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  const forn = await dbRun(db,
    "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Fornecedor F4 E39','22333444000155','ativo')");

  let seq = 0;
  async function novoMaterial() {
    seq += 1;
    const m = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'PC',0,1)`,
    [`MAT-F4-${String(seq).padStart(3, '0')}`, `Chapa F4 ${seq}`]);
    return m.lastID;
  }

  /** O pedido nasce pela PORTA REAL da Etapa 38 — nunca por `INSERT` na mao. */
  async function novoPedido({ previsao = null, status = 'pendente', quantidade = 10 } = {}) {
    const materialId = await novoMaterial();
    const r = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: forn.lastID,
      previsao_entrega: previsao,
      status,
      itens: [{ material_id: materialId, quantidade, valor_unitario: 50 }],
    });
    assert.strictEqual(r.status, 201, `fixture: POST do pedido falhou ${r.status} ${JSON.stringify(r.body)}`);
    return { pedido: r.body, materialId };
  }

  /**
   * O recebimento CRIADO pela PORTA REAL da Etapa 37 — e a perna 2 da regua (documento vinculado).
   *
   * Depois dele, o `quantidade_recebida` da LINHA e escrito a mao, e isto e declarado: em producao
   * quem escreve e o `processar` da E37 (seis portas), e o caminho inteiro por aquelas seis portas
   * ja e medido pelo BLOCO D de `comprasPedidoAtrasoIntegracao.api.test.js`. O que ESTE arquivo
   * precisa e do ESTADO (linha com 10 recebidos + documento vinculado), porque e ele que um
   * DELETE+INSERT destruiria — repetir as seis portas aqui mediria a Etapa 37, nao esta porta.
   */
  async function comRecebimento(pedido, materialId, quantidade) {
    const linha = await dbGet(db,
      'SELECT id FROM itens_pedido_compra WHERE pedido_id = ? LIMIT 1', [pedido.id]);
    const r = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA',
      pedido_compra_id: pedido.id,
      itens: [{
        material_id: materialId, pedido_item_id: linha.id, quantidade, quantidade_recebida: quantidade,
      }],
    });
    assert.strictEqual(r.status, 201, `fixture: POST do recebimento da E37 falhou ${r.status} ${JSON.stringify(r.body)}`);
    await dbRun(db, 'UPDATE itens_pedido_compra SET quantidade_recebida = ? WHERE id = ?',
      [quantidade, linha.id]);
    return linha.id;
  }

  const idsDasLinhas = async (pedidoId) => (await dbAll(db,
    'SELECT id FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id', [pedidoId])).map((l) => l.id);
  const recebidoDaLinha = async (linhaId) => (await dbGet(db,
    'SELECT quantidade_recebida FROM itens_pedido_compra WHERE id = ?', [linhaId])).quantidade_recebida;
  const naLista = async (qs, id) => (await request(app).get(`/api/compras/pedidos${qs || ''}`))
    .body.find((p) => p.id === id);
  const patchStatus = (id, corpo) => request(app).patch(`/api/compras/pedidos/${id}/status`).send(corpo);

  // ── (1) O CENARIO DO BECO, ponta a ponta ────────────────────────────────────────────────────
  await test('(1) F4 PATCH em pedido COM recebimento -> 200, o atraso some da lista e quantidade_recebida fica INTACTA', async () => {
    const { pedido, materialId } = await novoPedido({ previsao: diasDeHoje(-4) });
    const linhaId = await comRecebimento(pedido, materialId, 10);
    const idsAntes = await idsDasLinhas(pedido.id);
    assert.strictEqual(await recebidoDaLinha(linhaId), 10, 'fixture: a linha tinha de comecar com 10 recebidos');

    // O BECO: antes do PATCH o pedido recebido continua acusando atraso, e cresce sem teto.
    const preso = await naLista('?atrasados=1', pedido.id);
    assert.ok(preso, 'fixture: o pedido recebido tinha de estar dentro de ?atrasados=1 (o beco da RN-D12)');
    assert.strictEqual(preso.atrasado, 1, JSON.stringify(preso));
    assert.strictEqual(preso.dias_atraso, 4, JSON.stringify(preso));

    const r = await patchStatus(pedido.id, { status: 'recebido' });
    assert.strictEqual(r.status, 200, `PATCH devia responder 200, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(r.body, { id: pedido.id, numero: pedido.numero, status: 'recebido' },
      `resposta fora do contrato { id, numero, status }: ${JSON.stringify(r.body)}`);

    // ⚠️ A ASSERCAO QUE MEDE O DANO, e nao o codigo HTTP: um caminho que reaproveitasse o
    // `atualizarPedido` responderia 200 e zeraria isto em silencio — estoque recebido duas vezes.
    assert.strictEqual(await recebidoDaLinha(linhaId), 10,
      'quantidade_recebida foi ZERADA — a porta tocou itens_pedido_compra');
    assert.deepStrictEqual(await idsDasLinhas(pedido.id), idsAntes,
      'os ids das linhas mudaram — houve DELETE+INSERT e o `pedido_item_id` do recebimento ficou orfao');

    // E A SAIDA DO BECO: o pedido deixa de ser atrasado na MESMA regua da tela.
    const depois = await naLista('', pedido.id);
    assert.strictEqual(depois.status, 'recebido', JSON.stringify(depois));
    assert.strictEqual(depois.atrasado, 0, `o pedido recebido continua atrasado: ${JSON.stringify(depois)}`);
    assert.strictEqual(depois.dias_atraso, null, JSON.stringify(depois));
    assert.strictEqual(await naLista('?atrasados=1', pedido.id), undefined,
      'o pedido recebido continua dentro de ?atrasados=1');
  });

  // ── (2) status invalido ─────────────────────────────────────────────────────────────────────
  await test('(2) F4 PATCH com status invalido -> 400 com a literal do MESMO enum das outras portas', async () => {
    const { pedido } = await novoPedido({ previsao: diasDeHoje(-1) });
    const r = await patchStatus(pedido.id, { status: 'entregue' });
    assert.strictEqual(r.status, 400, `esperava 400, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.ok(String(r.body.error).includes(STATUS_PEDIDO_INVALIDO),
      `a literal do 400 divergiu: ${JSON.stringify(r.body)}`);

    // Corpo sem `status` nenhum tambem e 400: a porta existe SO para mudar o status.
    const vazio = await patchStatus(pedido.id, {});
    assert.strictEqual(vazio.status, 400, `corpo vazio devia ser 400, veio ${vazio.status} ${JSON.stringify(vazio.body)}`);

    // METADE POSITIVA: o status do pedido NAO mudou em nenhum dos dois.
    const linha = await dbGet(db, 'SELECT status FROM pedidos_compra WHERE id = ?', [pedido.id]);
    assert.strictEqual(linha.status, 'pendente', `o 400 gravou assim mesmo: ${JSON.stringify(linha)}`);
  });

  // ── (3) 404 ─────────────────────────────────────────────────────────────────────────────────
  await test('(3) F4 PATCH em id inexistente -> 404 com a MESMA literal das outras portas de pedido', async () => {
    const r = await patchStatus(99999, { status: 'recebido' });
    assert.strictEqual(r.status, 404, `esperava 404, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, PEDIDO_NAO_ENCONTRADO, JSON.stringify(r.body));
  });

  // ── (4) `teve_recebimento` no GET do detalhe ────────────────────────────────────────────────
  await test('(4) F4 GET /compras/pedidos/:id devolve teve_recebimento 0|1, pelas DUAS pernas da regua', async () => {
    const limpo = await novoPedido({ previsao: diasDeHoje(-2) });
    const detLimpo = await request(app).get(`/api/compras/pedidos/${limpo.pedido.id}`);
    assert.strictEqual(detLimpo.status, 200, JSON.stringify(detLimpo.body));
    assert.strictEqual(detLimpo.body.teve_recebimento, 0,
      `pedido sem recebimento devia vir 0: ${JSON.stringify(detLimpo.body.teve_recebimento)}`);
    assert.strictEqual(typeof detLimpo.body.teve_recebimento, 'number',
      'teve_recebimento tem de ser NUMERO (0|1), como `atrasado` — o SQLite nao tem boolean');

    // ⚠️ PERNA 2 SOZINHA: documento de recebimento CRIADO e nao processado. `quantidade_recebida`
    // continua 0 nas linhas, entao a perna 1 nao veria nada — e a tela habilitaria um formulario
    // que o `PUT` recusa. E esta a metade que uma leitura so de `quantidade_recebida` perderia.
    const aberto = await novoPedido({ previsao: diasDeHoje(-2) });
    const linha = await dbGet(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ? LIMIT 1', [aberto.pedido.id]);
    const rec = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA',
      pedido_compra_id: aberto.pedido.id,
      itens: [{ material_id: aberto.materialId, pedido_item_id: linha.id, quantidade: 10, quantidade_recebida: 10 }],
    });
    assert.strictEqual(rec.status, 201, JSON.stringify(rec.body));
    assert.strictEqual(await recebidoDaLinha(linha.id), 0,
      'fixture: o recebimento ABERTO nao pode ter escrito quantidade_recebida (RN-23 da E37)');

    const detAberto = await request(app).get(`/api/compras/pedidos/${aberto.pedido.id}`);
    assert.strictEqual(detAberto.body.teve_recebimento, 1,
      'a perna 2 (documento vinculado) nao foi vista — a tela habilitaria o que o PUT recusa');

    // PERNA 1: linha com material ja recebido.
    const processado = await novoPedido({ previsao: diasDeHoje(-2) });
    await comRecebimento(processado.pedido, processado.materialId, 7);
    const detProc = await request(app).get(`/api/compras/pedidos/${processado.pedido.id}`);
    assert.strictEqual(detProc.body.teve_recebimento, 1, JSON.stringify(detProc.body.teve_recebimento));
  });

  // ── (5) A GUARDA DO `PUT` NAO AFROUXOU ──────────────────────────────────────────────────────
  await test('(5) F4 a guarda do PUT continua 400 — a saida e a porta nova, nao um relaxamento', async () => {
    // ⚠️ SEM ESTE CENARIO a onda de correcao poderia "resolver" o beco afrouxando a guarda, e a
    // suite ficaria verde enquanto `quantidade_recebida` voltava a zero em producao.
    const { pedido, materialId } = await novoPedido({ previsao: diasDeHoje(-3) });
    const linhaId = await comRecebimento(pedido, materialId, 10);
    const r = await request(app).put(`/api/compras/pedidos/${pedido.id}`).send({
      fornecedor_id: forn.lastID,
      status: 'recebido',
      itens: [{ material_id: materialId, quantidade: 10, valor_unitario: 50 }],
    });
    assert.strictEqual(r.status, 400, `o PUT tinha de continuar 400, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, jaTeveRecebimento(pedido.numero), JSON.stringify(r.body));
    assert.strictEqual(await recebidoDaLinha(linhaId), 10, 'o PUT recusado nao pode ter tocado nas linhas');

    // E o PATCH, no MESMO pedido, passa — as duas metades no mesmo cenario.
    const ok = await patchStatus(pedido.id, { status: 'recebido' });
    assert.strictEqual(ok.status, 200, `o PATCH devia passar no mesmo pedido: ${JSON.stringify(ok.body)}`);
    assert.strictEqual(await recebidoDaLinha(linhaId), 10, 'o PATCH tocou nas linhas');
  });

  // ── (6) contrato do corpo e gate ────────────────────────────────────────────────────────────
  await test('(6) F4 o corpo e STRIPADO para { status } e o gate e o mesmo das outras (401 sem token)', async () => {
    const { pedido, materialId } = await novoPedido({ previsao: diasDeHoje(-1) });
    const linhaId = await comRecebimento(pedido, materialId, 10);
    const fornecedorAntes = (await dbGet(db, 'SELECT fornecedor_id, previsao_entrega FROM pedidos_compra WHERE id = ?', [pedido.id]));

    // ⚠️ `validate()` SUBSTITUI `req.body` por `parsed.data`, e o schema e `z.object` (strip): um
    // corpo com `itens`/`fornecedor_id` nao pode virar edicao por uma porta que promete so status.
    const outroMaterial = await novoMaterial();
    const r = await patchStatus(pedido.id, {
      status: 'cancelado',
      fornecedor_id: 999999,
      previsao_entrega: diasDeHoje(90),
      itens: [{ material_id: outroMaterial, quantidade: 1, valor_unitario: 1 }],
      quantidade_recebida: 0,
    });
    assert.strictEqual(r.status, 200, `esperava 200, veio ${r.status} ${JSON.stringify(r.body)}`);
    const depois = await dbGet(db, 'SELECT fornecedor_id, previsao_entrega, status FROM pedidos_compra WHERE id = ?', [pedido.id]);
    assert.strictEqual(depois.status, 'cancelado', JSON.stringify(depois));
    assert.strictEqual(depois.fornecedor_id, fornecedorAntes.fornecedor_id,
      `o corpo extra mudou o fornecedor: ${JSON.stringify(depois)}`);
    assert.strictEqual(depois.previsao_entrega, fornecedorAntes.previsao_entrega,
      `o corpo extra mudou a previsao: ${JSON.stringify(depois)}`);
    assert.strictEqual(await recebidoDaLinha(linhaId), 10, 'o corpo extra tocou nas linhas');
    assert.strictEqual((await idsDasLinhas(pedido.id)).length, 1, 'o corpo extra acrescentou linha ao pedido');

    setUser(null);
    const semToken = await patchStatus(pedido.id, { status: 'recebido' });
    assert.strictEqual(semToken.status, 401, `sem usuario: esperava 401, veio ${semToken.status}`);
    setUser(ADMIN);
  });

  // ── (7) pelo SERVICO, sem HTTP ──────────────────────────────────────────────────────────────
  await test('(7) F4 alterarStatusPedido e exportada e responde pelo servico, sem passar pela rota', async () => {
    // A Reposicao e a importacao chamam o servico direto; a porta nova tem de ser alcancavel do
    // mesmo jeito que `criarPedido`/`atualizarPedido`.
    assert.strictEqual(typeof pedidoCompraService.alterarStatusPedido, 'function',
      'alterarStatusPedido nao foi exportada');
    const { pedido, materialId } = await novoPedido({ previsao: diasDeHoje(-5) });
    const linhaId = await comRecebimento(pedido, materialId, 10);

    const r = await pedidoCompraService.alterarStatusPedido(db, pedido.id, 'recebido');
    assert.deepStrictEqual(r, { id: pedido.id, numero: pedido.numero, status: 'recebido' }, JSON.stringify(r));
    assert.strictEqual(await recebidoDaLinha(linhaId), 10, 'o servico tocou nas linhas');

    await assert.rejects(
      () => pedidoCompraService.alterarStatusPedido(db, 99999, 'recebido'),
      (e) => e.message === PEDIDO_NAO_ENCONTRADO && e.status === 404,
      'o servico devia lancar 404 com a literal de pedido nao encontrado',
    );
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
