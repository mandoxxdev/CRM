/**
 * Etapa 72, T4 (integracao, cruza o tronco T0-T2) — a JORNADA DO COMPRADOR com a solicitacao de compra
 * que fecha por MATERIAL, ponta a ponta, TUDO PELAS ROTAS.
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa72-solicitacao-fecha-por-material.md (T4 e a
 * secao "Fase 2 — revisao do plano", que PREVALECE).
 *
 * T1 (fecha por material, a caminho = o que falta, verificar-minimos nao duplica) e T2 (o estorno reabre)
 * foram provadas cada uma no seu arquivo, com atalhos (material e solicitacao gravados direto, minimo
 * alterado por UPDATE, sem iniciar/finalizar conferencia). Aqui se prova que conversam numa operacao real,
 * do jeito que as telas fazem:
 *
 *  - fornecedor pela rota de Compras, familia e material pela rota de Materiais (com minimo e maxima);
 *  - a solicitacao nasce pelo `POST /compras/verificar-minimos`; o pedido pelo `POST /api/compras/pedidos`
 *    com `solicitacao_id`; a segunda solicitacao entra pelo `vincular-pedido`;
 *  - a nota: POST /recebimentos -> iniciar_conferencia -> PUT /conferir -> finalizar_conferencia ->
 *    encaminhar_compras -> finalizar_compras -> iniciar_faturamento -> PUT /fiscal -> POST /processar;
 *  - a ENTRADA_COMPRA e achada pelo livro (`GET /movimentacoes`) e estornada pela rota do livro;
 *  - os sinais pelas rotas que as telas leem: `GET /reposicao/sugestoes`, `GET /compras/contexto-material`,
 *    `GET /compras/solicitacoes`, `GET /api/compras/pedidos/:id`, `GET /auditoria`;
 *  - a mudanca de minimo (para ENXERGAR o a_caminho de um material que a sugestao corretamente omite)
 *    pelo `PUT /materiais/:id`; o cancelamento pelo `PATCH /api/compras/pedidos/:id/status`.
 *
 * Nenhum UPDATE/INSERT a mao. As leituras do banco (`dbGet`) sao so para achar ids.
 *
 * Por que minimo 9 e maxima 10: o `verificar-minimos` dispara com `quantidade_atual <= quantidade_minima`;
 * com minimo 10 o material completo (saldo 10) ganharia uma solicitacao NOVA assim que a dele fechasse, e
 * a jornada passaria a medir isso. Com minimo 9 e maxima 10 a solicitacao e de 10 (max(maxima - atual,
 * minimo)) e o saldo 10 fica fora do gatilho.
 *
 * Fora daqui (declarado): o "chegou X de Y" do relatorio de solicitacoes (T3, outro executor, em
 * paralelo; este arquivo nao le `reportService`).
 *
 * Executar: cd server && node tests/api/solicitacaoPorMaterialIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 7240, nome: 'Admin E72T4', role: 'admin', is_superadmin: 1, email: 'admin-e72t4@x.com' };
const ALMOX = { id: 7241, nome: 'Alan Almox E72T4', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'alan-e72t4@x.com' };

let seq = 0;

(async () => {
  console.log('\n=== Etapa 72 T4: a solicitacao que fecha por material, ponta a ponta (rotas) ===\n');
  const { app, db, setUser, close } = await createTestApp({ user: { ...ADMIN } });
  const API = '/api/almoxarifado';
  const como = (u) => { setUser({ ...u }); return request(app); };
  const ok = (r, status, oque) => {
    assert.strictEqual(r.status, status, `${oque}: esperava ${status}, veio ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };

  const forn = ok(await como(ADMIN).post('/api/compras/fornecedores')
    .send({ razao_social: 'Forn E72T4', cnpj: '72.724.724/0001-72' }), 201, 'POST fornecedor').id;
  const familia = ok(await como(ADMIN).post(`${API}/familias`).send({ nome: 'Fam E72T4' }), 201, 'POST familia').id;

  /** Material proprio, saldo 0, pela rota de Materiais. */
  async function novoMat(rotulo, minimo, maxima) {
    seq += 1;
    const codigo = `E72T4-${rotulo}-${seq}`;
    const b = ok(await como(ADMIN).post(`${API}/materiais`).send({
      codigo, nome: `Material ${rotulo} ${seq}`, unidade: 'UN', familia_id: familia, fornecedor_id: forn,
      quantidade_minima: minimo, quantidade_maxima: maxima,
    }), 201, `POST material ${rotulo}`);
    return { id: b.id, codigo };
  }
  const mudarMinimo = async (mat, minimo) => ok(await como(ADMIN).put(`${API}/materiais/${mat.id}`)
    .send({ quantidade_minima: minimo }), 200, `PUT minimo ${minimo}`);

  /** As solicitacoes que o verificar-minimos abriu AGORA para este material. */
  const verificarMinimos = async (mat) => ok(await como(ADMIN).post(`${API}/compras/verificar-minimos`).send({}),
    200, 'verificar-minimos').criadas.filter((c) => c.material_id === mat.id);

  async function novoPedido(itens, solicitacaoId) {
    const pedido = ok(await como(ADMIN).post('/api/compras/pedidos').send({
      fornecedor_id: forn, status: 'pendente', solicitacao_id: solicitacaoId, itens,
    }), 201, 'POST /api/compras/pedidos');
    const linha = (mat) => pedido.itens.find((i) => i.material_id === mat.id).id;
    return { pedido, linha };
  }
  const vincular = async (solId, pedidoId) => ok(await como(ADMIN)
    .post(`${API}/compras/solicitacoes/${solId}/vincular-pedido`).send({ pedido_compra_id: pedidoId }), 200, 'vincular-pedido');

  const itemDaTela = (mat, linhaId, q) => ({ material_id: mat.id, pedido_item_id: linhaId, quantidade: q, quantidade_recebida: q });

  /** Do recebimento criado ate PROCESSADO, pelas portas reais, com a conferencia inteira. */
  async function levarAteProcessado(rec, notaFiscal) {
    const wf = async (acao) => ok(await como(ADMIN).post(`${API}/recebimentos/${rec}/workflow`).send({ acao }), 200, `workflow ${acao}`);
    await wf('iniciar_conferencia');
    const itensRec = await dbAll(db, `SELECT id, quantidade_recebida FROM recebimentos_material_itens_almoxarifado
      WHERE recebimento_id = ? ORDER BY id`, [rec]);
    ok(await como(ALMOX).put(`${API}/recebimentos/${rec}/conferir`)
      .send({ itens: itensRec.map((i) => ({ id: i.id, quantidade_recebida: i.quantidade_recebida })) }), 200, 'conferir');
    await wf('finalizar_conferencia');
    await wf('encaminhar_compras');
    await wf('finalizar_compras');
    await wf('iniciar_faturamento');
    ok(await como(ADMIN).put(`${API}/recebimentos/${rec}/fiscal`).send({
      nota_fiscal: notaFiscal, data_emissao_nf: '2026-09-28', data_entrada_nf: '2026-09-29', valor_total_nota: 100,
    }), 200, `PUT fiscal ${notaFiscal}`);
    const proc = ok(await como(ADMIN).post(`${API}/recebimentos/${rec}/processar`).send({}), 200, 'processar');
    assert.strictEqual(proc.status, 'PROCESSADO');
  }

  let nf = 0;
  async function receber(pedido, itens) {
    nf += 1;
    const numeroNf = `NF-E72T4-${nf}`;
    const rec = ok(await como(ALMOX).post(`${API}/recebimentos`).send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, itens,
    }), 201, `POST recebimento ${numeroNf}`).id;
    await levarAteProcessado(rec, numeroNf);
    return rec;
  }

  /** A ENTRADA_COMPRA de um recebimento+material, achada pelo LIVRO (o que a tela de Movimentacoes lista). */
  const entradaNoLivro = async (rec, mat) => {
    const livro = ok(await como(ADMIN).get(`${API}/movimentacoes?tipo=ENTRADA_COMPRA&material_id=${mat.id}`), 200, 'GET livro');
    const achadas = livro.filter((m) => m.recebimento_id === rec);
    assert.strictEqual(achadas.length, 1, `uma ENTRADA_COMPRA do recebimento ${rec}: ${JSON.stringify(achadas)}`);
    return achadas[0];
  };
  const estornar = (movId) => como(ADMIN).post(`${API}/movimentacoes/${movId}/cancelar`).send({ motivo: 'lancado errado' });

  // Leituras PELAS ROTAS que as telas leem.
  const abertasNoContexto = async (mat) => ok(await como(ADMIN).get(`${API}/compras/contexto-material/${mat.id}`), 200,
    'GET contexto-material').solicitacoes_abertas.map((s) => [s.id, s.status]);
  const statusPedido = async (id) => ok(await como(ADMIN).get(`/api/compras/pedidos/${id}`), 200, 'GET pedido').status;
  /**
   * Status da solicitacao PELAS ROTAS (nao ha GET de solicitacao no modulo): aberta (PENDENTE/VINCULADO)
   * pela lista `solicitacoes_abertas` do contexto-material; fora dela, a ultima acao da trilha pela
   * GET /auditoria (RECEBIDA ou CANCELADA). Sem trilha e fora das abertas = erro.
   */
  const statusSol = async (mat, id) => {
    const aberta = (await abertasNoContexto(mat)).find(([sid]) => sid === id);
    if (aberta) return aberta[1];
    const t = ok(await como(ADMIN).get(`${API}/auditoria?entidade=solicitacao_compra&entidade_id=${id}&limite=1000`), 200,
      'GET auditoria').itens;
    assert.ok(t.length, `solicitacao ${id} fora das abertas e sem trilha`);
    return t[0].acao;
  };
  const naSugestao = async (mat) => {
    const r = ok(await como(ADMIN).get(`${API}/reposicao/sugestoes`), 200, 'GET sugestoes');
    for (const g of r.fornecedores) {
      const i = g.itens.find((it) => it.material_id === mat.id);
      if (i) return { a_caminho: i.a_caminho, disponivel: i.disponivel, posicao: i.posicao, quantidade_sugerida: i.quantidade_sugerida };
    }
    return null;
  };
  /** O a_caminho de um material que a sugestao (corretamente) omite: sobe o minimo pela rota, le, volta. */
  const aCaminhoComMinimo = async (mat, minimoParaVer, minimoOriginal) => {
    await mudarMinimo(mat, minimoParaVer);
    try { return await naSugestao(mat); } finally { await mudarMinimo(mat, minimoOriginal); }
  };
  /** Trilha da solicitacao pela rota da auditoria, em ordem cronologica (a rota devolve DESC). */
  const trilhaDaSol = async (solId) => ok(await como(ADMIN)
    .get(`${API}/auditoria?entidade=solicitacao_compra&entidade_id=${solId}&acao=RECEBIDA,REABERTA&limite=1000`), 200,
  'GET auditoria').itens.reverse();

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // (A) A jornada inteira: X(10) + Y(5) no mesmo pedido, nota parcial de X, nota que completa X,
  // estorno, nota de novo, nota de Y.
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  const A = {};
  await test('(A1) verificar-minimos abre X(10) e Y(5); pedido X+Y pela rota de Compras vincula as duas; verificar-minimos de novo NAO duplica', async () => {
    A.X = await novoMat('X', 9, 10);
    A.Y = await novoMat('Y', 4, 5);
    // O verificar-minimos e global: UMA chamada abre as duas.
    const criadas = ok(await como(ADMIN).post(`${API}/compras/verificar-minimos`).send({}), 200, 'verificar-minimos').criadas;
    const sx = criadas.find((c) => c.material_id === A.X.id);
    const sy = criadas.find((c) => c.material_id === A.Y.id);
    assert.ok(sx && sy, `fixture: ${JSON.stringify(criadas)}`);
    assert.deepStrictEqual([sx.quantidade, sy.quantidade], [10, 5]);
    A.sx = sx.solicitacao_id; A.sy = sy.solicitacao_id;

    Object.assign(A, await novoPedido([
      { material_id: A.X.id, quantidade: 10, valor_unitario: 2 },
      { material_id: A.Y.id, quantidade: 5, valor_unitario: 3 },
    ], A.sx));
    await vincular(A.sy, A.pedido.id);
    assert.deepStrictEqual([await statusSol(A.X, A.sx), await statusSol(A.Y, A.sy)], ['VINCULADO', 'VINCULADO']);

    assert.deepStrictEqual(await verificarMinimos(A.X), [], 'X VINCULADO de pedido vivo duplicou (C114)');
    assert.deepStrictEqual(await verificarMinimos(A.Y), [], 'Y VINCULADO de pedido vivo duplicou (C114)');
  });

  await test('(A2) nota de 4 de X: X segue VINCULADO, a sugestao NAO manda comprar X (a_caminho 6), verificar-minimos nao duplica, contexto mostra X; Y intocado', async () => {
    A.rec4 = await receber(A.pedido, [itemDaTela(A.X, A.linha(A.X), 4)]);
    assert.strictEqual(await statusSol(A.X, A.sx), 'VINCULADO', 'a nota PARCIAL fechou a solicitacao de X');
    assert.strictEqual(await statusSol(A.Y, A.sy), 'VINCULADO', 'a nota de X fechou a de Y (Surpresa 2)');
    assert.strictEqual(await statusPedido(A.pedido.id), 'pendente');

    assert.strictEqual(await naSugestao(A.X), null, 'disponivel 4 + 6 a caminho cobre o minimo 9 e a sugestao mandou comprar');
    assert.deepStrictEqual(await aCaminhoComMinimo(A.X, 16, 9),
      { a_caminho: 6, disponivel: 4, posicao: 10, quantidade_sugerida: 6 }, 'o a caminho nao e o que falta (6)');
    assert.deepStrictEqual(await verificarMinimos(A.X), [], 'verificar-minimos duplicou depois da nota parcial (saldo 4 <= 9)');
    assert.deepStrictEqual(await abertasNoContexto(A.X), [[A.sx, 'VINCULADO']]);
    assert.deepStrictEqual(await abertasNoContexto(A.Y), [[A.sy, 'VINCULADO']]);
    assert.strictEqual((await trilhaDaSol(A.sx)).length, 0, 'trilha RECEBIDA na nota parcial');
  });

  await test('(A3) nota de 6 de X: X RECEBIDA (MATERIAL_COMPLETO na trilha), sai do contexto; pedido segue pendente (Y falta), Y VINCULADO', async () => {
    A.rec6 = await receber(A.pedido, [itemDaTela(A.X, A.linha(A.X), 6)]);
    assert.strictEqual(await statusSol(A.X, A.sx), 'RECEBIDA', 'X completou no pedido e nao fechou');
    assert.strictEqual(await statusSol(A.Y, A.sy), 'VINCULADO');
    assert.strictEqual(await statusPedido(A.pedido.id), 'pendente', 'o pedido fechou com Y faltando');
    const t = await trilhaDaSol(A.sx);
    assert.deepStrictEqual(t.map((x) => x.acao), ['RECEBIDA']);
    assert.deepStrictEqual(JSON.parse(t[0].dados_novos), {
      pedido_compra_id: A.pedido.id, material_id: A.X.id, regra: 'MATERIAL_COMPLETO', recebido_no_pedido: 10, solicitado: 10,
    });
    assert.deepStrictEqual(await abertasNoContexto(A.X), [], 'a RECEBIDA continuou aberta no contexto');
    assert.strictEqual((await trilhaDaSol(A.sy)).length, 0, 'a nota de X auditou Y');
  });

  await test('(A4) estorno da entrada de 6 pela rota do livro: X reabre (VINCULADO), solicitacoes_reabertas [X], a_caminho 6 de novo, verificar-minimos nao duplica', async () => {
    const mov = await entradaNoLivro(A.rec6, A.X);
    const r = ok(await estornar(mov.id), 200, 'estorno');
    assert.ok(r.pedido_compra, `o estorno nao passou pelo pedido: ${JSON.stringify(r)}`);
    assert.deepStrictEqual(r.pedido_compra.solicitacoes_reabertas, [A.sx], JSON.stringify(r.pedido_compra));
    assert.strictEqual(await statusSol(A.X, A.sx), 'VINCULADO', 'o estorno nao reabriu a solicitacao');
    assert.strictEqual(await statusSol(A.Y, A.sy), 'VINCULADO', 'o estorno de X mexeu em Y');
    assert.deepStrictEqual(await aCaminhoComMinimo(A.X, 16, 9),
      { a_caminho: 6, disponivel: 4, posicao: 10, quantidade_sugerida: 6 }, 'a reaberta nao voltou ao a caminho');
    assert.strictEqual(await naSugestao(A.X), null, 'com a reaberta, a sugestao mandou comprar X de novo');
    assert.deepStrictEqual(await verificarMinimos(A.X), [], 'verificar-minimos abriu outra por cima da reaberta');
    assert.deepStrictEqual(await abertasNoContexto(A.X), [[A.sx, 'VINCULADO']]);
  });

  await test('(A5) nota de 6 de X outra vez + nota de 5 de Y: as duas RECEBIDA, pedido recebido', async () => {
    await receber(A.pedido, [itemDaTela(A.X, A.linha(A.X), 6)]);
    assert.strictEqual(await statusSol(A.X, A.sx), 'RECEBIDA', 'a nota nova nao fechou X de novo');
    assert.strictEqual(await statusSol(A.Y, A.sy), 'VINCULADO');
    assert.strictEqual(await statusPedido(A.pedido.id), 'pendente');
    await receber(A.pedido, [itemDaTela(A.Y, A.linha(A.Y), 5)]);
    assert.strictEqual(await statusSol(A.Y, A.sy), 'RECEBIDA', 'Y completou e nao fechou');
    assert.strictEqual(await statusPedido(A.pedido.id), 'recebido');
    assert.deepStrictEqual(await verificarMinimos(A.X), [], 'fixture: saldo 10 > minimo 9');
  });

  await test('(A6) trilha das solicitacoes pela GET /auditoria: X = RECEBIDA, REABERTA, RECEBIDA com o rotulo novo; Y = uma RECEBIDA', async () => {
    const t = await trilhaDaSol(A.sx);
    assert.deepStrictEqual(t.map((x) => x.acao), ['RECEBIDA', 'REABERTA', 'RECEBIDA'], JSON.stringify(t.map((x) => x.acao)));
    assert.strictEqual(t[1].acao_rotulo, 'Solicitação reaberta (estorno)');
    assert.deepStrictEqual(JSON.parse(t[1].dados_anteriores), { status: 'RECEBIDA' });
    assert.strictEqual(JSON.parse(t[1].dados_novos).status, 'VINCULADO');
    assert.deepStrictEqual(t.filter((x) => x.acao === 'RECEBIDA').map((x) => JSON.parse(x.dados_novos).regra),
      ['MATERIAL_COMPLETO', 'MATERIAL_COMPLETO']);
    const ty = await trilhaDaSol(A.sy);
    assert.deepStrictEqual(ty.map((x) => [x.acao, JSON.parse(x.dados_novos).regra]), [['RECEBIDA', 'MATERIAL_COMPLETO']]);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // (B) Pedido cancelado pelo comprador com parte recebida: o que faltava deixa de estar a caminho.
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('(B) pedido cancelado pelo PATCH com 4 de 10 recebidos: a sugestao volta a pedir 6 (a_caminho 0) e o verificar-minimos abre solicitacao nova', async () => {
    const Z = await novoMat('Z', 9, 10);
    const [sz] = await verificarMinimos(Z);
    assert.ok(sz, 'fixture: verificar-minimos nao abriu a de Z');
    const { pedido, linha } = await novoPedido([{ material_id: Z.id, quantidade: 10, valor_unitario: 1 }], sz.solicitacao_id);
    await receber(pedido, [itemDaTela(Z, linha(Z), 4)]);
    assert.strictEqual(await naSugestao(Z), null, 'fixture: com o pedido vivo, Z nao podia ser sugerido');
    assert.deepStrictEqual(await verificarMinimos(Z), [], 'fixture: com o pedido vivo, o minimo nao podia duplicar');

    ok(await como(ADMIN).patch(`/api/compras/pedidos/${pedido.id}/status`).send({ status: 'cancelado' }), 200, 'PATCH cancelado');
    assert.deepStrictEqual(await naSugestao(Z), { a_caminho: 0, disponivel: 4, posicao: 4, quantidade_sugerida: 6 },
      'o pedido cancelado continuou contando a caminho');
    const novas = await verificarMinimos(Z);
    assert.strictEqual(novas.length, 1, `o pedido cancelado continuou bloqueando o minimo: ${JSON.stringify(novas)}`);
    assert.strictEqual(novas[0].quantidade, 9, 'max(maxima 10 - saldo 4, minimo 9)');
    // C117 (declarado): a antiga fica VINCULADO com pedido encerrado ate o comprador cancelar.
    assert.strictEqual(await statusSol(Z, sz.solicitacao_id), 'VINCULADO');
    assert.deepStrictEqual((await abertasNoContexto(Z)).map(([, s]) => s).sort(), ['PENDENTE', 'VINCULADO']);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
