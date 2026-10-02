/**
 * Etapa 72, T3 (RN-10) — a aba Solicitacoes mostra QUANTO do material ja chegou.
 *
 * Com a T1, a solicitacao VINCULADO nao fecha mais na primeira nota parcial: ela fica na aba ate o
 * material dela chegar. Sem estes campos a aba mostraria a mesma linha "VINCULADO" antes e depois da
 * nota de 4 de 10, e o comprador nao saberia que metade ja entrou (nem que o pedido foi cancelado e
 * nada mais vem).
 *
 * O relatorio `solicitacoes-compra` ganha por linha, ADITIVOS (export e tela de Relatorios projetam
 * `colunas` do registro e nao mudam):
 *   - `recebido_no_pedido` = o `recebido_atribuido` da solicitacao (o que o LIVRO de atribuicao deu
 *     a ela, Fase 5 — ate ela, o recebido do par rateado em ordem de id) — nao o recebido do par
 *     inteiro; `null` em PENDENTE ou par sem linha;
 *   - `a_caminho` — a parte da solicitacao no que ainda falta chegar;
 *   - `pedido_encerrado` — pedido recebido/cancelado/rejeitado.
 *
 * A FONTE e `purchaseService.posicaoDasSolicitacoes` (a mesma que a sugestao soma). O teste (2)
 * compara a soma do `a_caminho` das linhas do relatorio com o `a_caminho` da sugestao: uma terceira
 * conta no relatorio (ex.: quantidade − recebido do par por linha) diverge exatamente no cenario de
 * duas solicitacoes no mesmo par.
 *
 * Executar: cd server && node tests/api/relatorioSolicitacoesChegou.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 273, nome: 'Admin E72 T3', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  const forn = await dbRun(db,
    "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Fornecedor E72 T3','72000333000173','ativo')");

  let seq = 0;
  async function novoMaterial(minimo) {
    seq += 1;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, ativo, fornecedor_id)
      VALUES (?,?,'PC',0,?,0,1,?)`,
    [`MAT-E72T3-${String(seq).padStart(3, '0')}`, `Arruela E72 T3 ${seq}`, minimo, forn.lastID])).lastID;
  }

  async function solicitacaoPeloMinimo(materialId) {
    setUser(ADMIN);
    const r = await request(app).post('/api/almoxarifado/compras/verificar-minimos').send({});
    assert.strictEqual(r.status, 200, `verificar-minimos: ${JSON.stringify(r.body)}`);
    const criada = r.body.criadas.find((c) => c.material_id === materialId);
    assert.ok(criada, `fixture: verificar-minimos nao abriu solicitacao do material ${materialId}`);
    return criada.solicitacao_id;
  }

  const solicitacaoDireta = async (materialId, quantidade) => (await dbRun(db,
    `INSERT INTO solicitacoes_compra_almoxarifado (material_id, quantidade, motivo, status)
     VALUES (?,?,'PONTO_REPOSICAO','PENDENTE')`, [materialId, quantidade])).lastID;

  async function novoPedido(itens, solicitacaoId) {
    setUser(ADMIN);
    const r = await request(app).post('/api/compras/pedidos')
      .send({ fornecedor_id: forn.lastID, status: 'pendente', itens, solicitacao_id: solicitacaoId });
    assert.strictEqual(r.status, 201, `fixture: POST do pedido ${r.status} ${JSON.stringify(r.body)}`);
    const linhas = await dbAll(db, 'SELECT id, material_id FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id',
      [r.body.id]);
    return { pedido: r.body, linhaDe: (materialId) => linhas.find((l) => l.material_id === materialId).id };
  }

  async function vincular(solicitacaoId, pedidoId) {
    setUser(ADMIN);
    const r = await request(app).post(`/api/almoxarifado/compras/solicitacoes/${solicitacaoId}/vincular-pedido`)
      .send({ pedido_compra_id: pedidoId });
    assert.strictEqual(r.status, 200, `vincular-pedido: ${JSON.stringify(r.body)}`);
  }

  const itemDaTela = (materialId, linhaId, qtd) => ({
    material_id: materialId, pedido_item_id: linhaId, quantidade: qtd, quantidade_recebida: qtd,
  });

  let nf = 0;
  async function receber(pedido, itens) {
    setUser(ADMIN);
    nf += 1;
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, itens,
    });
    assert.strictEqual(criado.status, 201, `POST /recebimentos: ${JSON.stringify(criado.body)}`);
    const recId = criado.body.id;
    assert.strictEqual((await request(app).put(`/api/almoxarifado/recebimentos/${recId}/conferir`).send({ itens })).status, 200);
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      const r = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao });
      assert.strictEqual(r.status, 200, `workflow ${acao}: ${JSON.stringify(r.body)}`);
    }
    const fiscal = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`).send({
      nota_fiscal: `NF-E72T3-${nf}`, fornecedor_id: forn.lastID, fornecedor_nome: 'Fornecedor E72 T3',
      data_emissao_nf: '2026-09-01', data_entrada_nf: '2026-09-02', valor_total_nota: 100, itens,
    });
    assert.strictEqual(fiscal.status, 200, `PUT /fiscal: ${JSON.stringify(fiscal.body)}`);
    const p = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(p.status, 200, `processar: ${JSON.stringify(p.body)}`);
  }

  async function relatorio() {
    setUser(ADMIN);
    const r = await request(app).get('/api/almoxarifado/relatorios/solicitacoes-compra');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.ok(Array.isArray(r.body), 'o relatorio deixou de ser array');
    return r.body;
  }
  const linhaDe = async (solId) => {
    const l = (await relatorio()).find((x) => x.id === solId);
    assert.ok(l, `solicitacao ${solId} sumiu do relatorio`);
    return l;
  };
  const tres = (l) => ({ status: l.status, recebido_no_pedido: l.recebido_no_pedido, a_caminho: l.a_caminho,
    pedido_encerrado: l.pedido_encerrado });

  async function sugestaoDe(materialId) {
    setUser(ADMIN);
    const r = await request(app).get('/api/almoxarifado/reposicao/sugestoes');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    for (const g of r.body.fornecedores) {
      const i = g.itens.find((it) => it.material_id === materialId);
      if (i) return i;
    }
    return null;
  }

  await test('(1) PENDENTE: recebido_no_pedido null, a_caminho = quantidade, pedido_encerrado false; campos antigos intactos', async () => {
    const mat = await novoMaterial(10);
    const solId = await solicitacaoPeloMinimo(mat);
    const l = await linhaDe(solId);
    assert.deepStrictEqual(tres(l), { status: 'PENDENTE', recebido_no_pedido: null, a_caminho: 10, pedido_encerrado: false });
    assert.strictEqual(l.material_id, mat);
    assert.strictEqual(l.material_codigo, 'MAT-E72T3-001');
    assert.strictEqual(l.quantidade, 10);
  });

  await test('(1b) VINCULADO sem nota: recebido 0, a_caminho = quantidade (a aba nao mostra "chegou")', async () => {
    const mat = await novoMaterial(10);
    const solId = await solicitacaoPeloMinimo(mat);
    await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }], solId);
    assert.deepStrictEqual(tres(await linhaDe(solId)),
      { status: 'VINCULADO', recebido_no_pedido: 0, a_caminho: 10, pedido_encerrado: false });
  });

  await test('(2) duas solicitacoes (6 + 4) no pedido de 10, nota de 5: o relatorio mostra o do LIVRO [5, 0] e a soma do a_caminho bate com a sugestao', async () => {
    const mat = await novoMaterial(6);
    const s6 = await solicitacaoPeloMinimo(mat);
    const s4 = await solicitacaoDireta(mat, 4);
    const { pedido, linhaDe: linha } = await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }], s6);
    await vincular(s4, pedido.id);
    // Etapa 72, Fase 5: era nota de 7 -> [6, 1]. Com o livro a de 6 recebe 6 e FECHA sozinha
    // (SOLICITADO_RECEBIDO por solicitacao) e sai da aba; a nota de 5 mantem as duas na aba e continua
    // separando o atribuido (5, 0) do recebido do par (5, 5).
    await receber(pedido, [itemDaTela(mat, linha(mat), 5)]);
    const linhas = (await relatorio()).filter((x) => x.material_id === mat);
    assert.deepStrictEqual(linhas.map((l) => [l.id, l.status, l.recebido_no_pedido, l.a_caminho, l.pedido_encerrado]),
      [[s6, 'VINCULADO', 5, 1, false], [s4, 'VINCULADO', 0, 4, false]]);
    // Mesma fonte da sugestao: sobe o minimo para o material aparecer nela e compara.
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_minima = 20 WHERE id = ?', [mat]);
    const item = await sugestaoDe(mat);
    assert.ok(item, 'fixture: o material tinha de aparecer na sugestao');
    assert.strictEqual(linhas.reduce((s, l) => s + l.a_caminho, 0), item.a_caminho,
      `relatorio e sugestao divergem no a_caminho (${JSON.stringify(linhas)} x ${item.a_caminho})`);
  });

  await test('(3) VINCULADO com pedido cancelado depois da nota de 4: pedido_encerrado true, a_caminho 0, recebido 4', async () => {
    const mat = await novoMaterial(10);
    const solId = await solicitacaoPeloMinimo(mat);
    const { pedido, linhaDe: linha } = await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }], solId);
    await receber(pedido, [itemDaTela(mat, linha(mat), 4)]);
    assert.deepStrictEqual(tres(await linhaDe(solId)),
      { status: 'VINCULADO', recebido_no_pedido: 4, a_caminho: 6, pedido_encerrado: false });
    setUser(ADMIN);
    const c = await request(app).patch(`/api/compras/pedidos/${pedido.id}/status`).send({ status: 'cancelado' });
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.deepStrictEqual(tres(await linhaDe(solId)),
      { status: 'VINCULADO', recebido_no_pedido: 4, a_caminho: 0, pedido_encerrado: true });
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
