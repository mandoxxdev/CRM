/**
 * Etapa 41, Task 5 — a INTEGRACAO que cruza: pela ROTA e pelo SERVICO, ate o recebimento.
 *
 * (A) e a jornada inteira do comprador pelas rotas: fornecedor criado pelo POST da tela da 40 ->
 *     cotacao com 2 itens -> gerar pedido -> o pedido e um pedido NORMAL (lista de Compras E o aux
 *     do recebimento da Etapa 37, com `saldo_pendente` cheio) -> segunda conversao 409 -> lixeira
 *     da cotacao 409 -> PUT do pedido 200 -> DELETE do pedido LIBERA a cotacao (RN-F12, Fase 2 I2:
 *     `cotacoes_liberadas: 1`, `pedido_id` volta a NULL, `status` aprovado FICA) -> gera de novo 201
 *     com PC novo -> exclui tudo.
 * (B) e o mesmo gesto pelo SERVICO (`criarCotacao` + `gerarPedidoDaCotacao`), e a ROTA le o mesmo
 *     que o servico devolveu (`deepStrictEqual` do pedido; `pedido_id` na cotacao).
 * (C) e a RN-F11 pela rota REAL de inativacao: `PUT /fornecedores/:id` da 40 (7 textos + status)
 *     inativa -> gerar 400 com a literal -> reativa -> 201.
 *
 * ⚠️ As FKs `itens_cotacao.cotacao_id` e `cotacoes.pedido_id` NAO disparam no harness
 * (`foreign_keys = 0`, ver o cabecalho do plano da 41). E por isso que o (A) afirma `pedido_id === null`
 * depois do DELETE do pedido e que a cotacao se exclui com 200 no fim: sem o `UPDATE` de
 * `excluirPedido`, nada quebraria por status.
 *
 * Executar: cd server && node tests/api/comprasCotacaoPedidoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const cotacaoService = require('../../services/compras/cotacaoService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 102, nome: 'Admin E41 T5 Integracao', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
// O payload que a tela da 40 manda no PUT do fornecedor: os SETE textos (substituicao total, RN-E02).
const SETE = { razao_social: 'Integração E41', nome_fantasia: '', cnpj: '', contato: '', email: '', telefone: '', endereco: '' };

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  async function material(codigo, nome, unidade = 'KG') {
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,?,0,1)`, [codigo, nome, unidade])).lastID;
  }
  const mA = await material('MAT-E41-INT-A', 'Chapa A E41 INT');
  const mB = await material('MAT-E41-INT-B', 'Tubo B E41 INT', 'PC');
  let seq = 0; const num = () => `COT-E41-INT-${String(++seq).padStart(3, '0')}`;
  const getCotacao = (id) => request(app).get(`/api/compras/cotacoes/${id}`);
  const gerar = (id) => request(app).post(`/api/compras/cotacoes/${id}/gerar-pedido`).send();
  /** Fornecedor criado pela ROTA da tela da 40 (201 afirmado — a fixture nao pode falhar em silencio). */
  async function fornecedor(razao_social) {
    const f = await request(app).post('/api/compras/fornecedores').send({ razao_social, nome_fantasia: '', cnpj: '', contato: '', email: '', telefone: '', endereco: '', grupo_id: '' });
    assert.strictEqual(f.status, 201, `fixture fornecedor: ${JSON.stringify(f.body)}`);
    return f.body.id;
  }
  /** Cotacao criada pela ROTA (201 afirmado). */
  async function cotar(fornecedor_id, itens, extra = {}) {
    const corpo = { numero: num(), fornecedor_id, ...extra };
    if (itens && itens.length) corpo.itens = itens;
    const r = await request(app).post('/api/compras/cotacoes').send(corpo);
    assert.strictEqual(r.status, 201, `fixture cotacao: ${JSON.stringify(r.body)}`);
    return r.body;
  }

  await test('(A) pela ROTA: fornecedor (tela da 40) -> cotacao com 2 itens -> gerar -> pedido na lista e no aux do recebimento com saldo cheio -> 409 na segunda -> DELETE cotacao 409 -> PUT pedido 200 -> DELETE pedido LIBERA (cotacoes_liberadas 1) -> gera de novo 201 -> exclui tudo', async () => {
    const fId = await fornecedor('Integração E41');
    const c = await cotar(fId, [{ material_id: mA, quantidade: 2, valor_unitario: 10 }, { material_id: mB, quantidade: 1, valor_unitario: 5 }],
      { data_cotacao: '2026-09-22', validade: '', status: 'em_analise', observacoes: 'frete incluso' });
    assert.strictEqual(c.valor_total, 25, 'RN-F03: total derivado (2x10 + 1x5)');
    assert.strictEqual(c.itens.length, 2);
    const g = await gerar(c.id);
    assert.strictEqual(g.status, 201, JSON.stringify(g.body));
    assert.ok(/^PC-/.test(g.body.numero), g.body.numero);
    assert.strictEqual(g.body.observacoes, 'frete incluso');
    assert.strictEqual(g.body.fornecedor_id, fId);
    // o pedido gerado e um pedido NORMAL: lista de Compras e aux do recebimento da Etapa 37
    const lista = await request(app).get('/api/compras/pedidos');
    assert.strictEqual(lista.status, 200);
    assert.ok(lista.body.some((p) => p.id === g.body.id && p.valor_total === 25), 'o pedido gerado esta na lista de Compras com o total da cotacao');
    const aux = await request(app).get('/api/almoxarifado/recebimentos-aux/pedidos-compra?pendentes=1');
    assert.strictEqual(aux.status, 200, JSON.stringify(aux.body));
    const noAux = (aux.body || []).find((p) => p.id === g.body.id);
    assert.ok(noAux, 'o pedido gerado tem de aparecer para o recebimento');
    assert.strictEqual(noAux.saldo_pendente, 3, `saldo cheio (2+1): ${JSON.stringify(noAux)}`);
    assert.strictEqual(noAux.quantidade_recebida, 0);
    // segunda conversao
    const g2 = await gerar(c.id);
    assert.strictEqual(g2.status, 409, `segunda conversao: ${JSON.stringify(g2.body)}`);
    assert.strictEqual(g2.body.error, `Cotação ${c.numero} já gerou o pedido ${g.body.numero}`);
    // lixeira da cotacao convertida
    const dc = await request(app).delete(`/api/compras/cotacoes/${c.id}`);
    assert.strictEqual(dc.status, 409, `lixeira da convertida: ${JSON.stringify(dc.body)}`);
    // o pedido pode ser editado (troca a quantidade) e excluido
    const put = await request(app).put(`/api/compras/pedidos/${g.body.id}`).send({ fornecedor_id: fId, itens: [{ material_id: mA, quantidade: 5, valor_unitario: 10 }] });
    assert.strictEqual(put.status, 200, JSON.stringify(put.body));
    assert.strictEqual(put.body.valor_total, 50);
    const dp = await request(app).delete(`/api/compras/pedidos/${g.body.id}`);
    assert.strictEqual(dp.status, 200, JSON.stringify(dp.body));
    assert.strictEqual(dp.body.cotacoes_liberadas, 1, `cotacoes_liberadas: ${JSON.stringify(dp.body)}`);
    // RN-F12 (Fase 2, I2): excluir o pedido LIBERA a cotacao — pedido_id volta a NULL, ela pode gerar
    // de novo e pode ser excluida. Sem isto ela ficava num beco que so SQL resolvia.
    const depois = await getCotacao(c.id);
    assert.strictEqual(depois.status, 200);
    assert.strictEqual(depois.body.pedido_id, null, 'pedido_id null depois de excluir o pedido');
    assert.strictEqual(depois.body.pedido_numero, null);
    assert.strictEqual(depois.body.status, 'aprovado', 'o status aprovado FICA (a aprovacao aconteceu; so o vinculo cai) — declarado');
    assert.strictEqual(depois.body.itens.length, 2, 'os itens da cotacao nao sao tocados pela exclusao do pedido');
    const g3 = await gerar(c.id);
    assert.strictEqual(g3.status, 201, `gera de novo: ${JSON.stringify(g3.body)}`);
    assert.notStrictEqual(g3.body.numero, g.body.numero, 'PC novo');
    assert.strictEqual(g3.body.valor_total, 25, 'o pedido novo nasce da cotacao, nao do pedido editado');
    assert.strictEqual((await request(app).delete(`/api/compras/pedidos/${g3.body.id}`)).status, 200);
    assert.strictEqual((await request(app).delete(`/api/compras/cotacoes/${c.id}`)).status, 200, 'liberada, a cotacao se exclui com os itens');
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) AS n FROM itens_cotacao WHERE cotacao_id = ?', [c.id])).n, 0, 'itens_cotacao orfaos');
    assert.strictEqual((await getCotacao(c.id)).status, 404);
  });

  await test('(B) pelo SERVICO: criarCotacao com itens + gerarPedidoDaCotacao, e a rota le o mesmo', async () => {
    const fId = await fornecedor('Servico E41 INT');
    const c = await cotacaoService.criarCotacao(db, { numero: num(), fornecedor_id: fId, status: 'em_analise', observacoes: 'pelo servico',
      itens: [{ material_id: mA, quantidade: 4, valor_unitario: 2.5 }, { material_id: mB, quantidade: 3, valor_unitario: 1 }] });
    assert.strictEqual(c.valor_total, 13);
    assert.strictEqual(c.itens.length, 2);
    const p = await cotacaoService.gerarPedidoDaCotacao(db, c.id, ADMIN);
    assert.ok(/^PC-/.test(p.numero), p.numero);
    assert.strictEqual(p.valor_total, 13);
    assert.strictEqual(p.observacoes, 'pelo servico');
    // a ROTA le o MESMO pedido que o servico devolveu
    const rp = await request(app).get(`/api/compras/pedidos/${p.id}`);
    assert.strictEqual(rp.status, 200, JSON.stringify(rp.body));
    assert.deepStrictEqual(rp.body, JSON.parse(JSON.stringify(p)), 'GET /pedidos/:id e o pedido devolvido por gerarPedidoDaCotacao');
    assert.deepStrictEqual(rp.body.itens.map((i) => [i.material_id, i.quantidade, i.valor_unitario, i.codigo]),
      [[mA, 4, 2.5, 'MAT-E41-INT-A'], [mB, 3, 1, 'MAT-E41-INT-B']]);
    // e a cotacao pela rota aponta para ele, aprovada
    const rc = await getCotacao(c.id);
    assert.strictEqual(rc.status, 200);
    assert.strictEqual(rc.body.pedido_id, p.id);
    assert.strictEqual(rc.body.pedido_numero, p.numero);
    assert.strictEqual(rc.body.status, 'aprovado');
    // a lista de cotacoes tambem (RN-F04: pedido_id/pedido_numero na lista)
    const lc = await request(app).get('/api/compras/cotacoes');
    const naLista = lc.body.find((x) => x.id === c.id);
    assert.ok(naLista, 'cotacao na lista');
    assert.strictEqual(naLista.pedido_numero, p.numero);
    // e a segunda pelo servico e 409, como pela rota
    let e; try { await cotacaoService.gerarPedidoDaCotacao(db, c.id, ADMIN); } catch (x) { e = x; }
    assert.strictEqual(e && e.status, 409, 'segunda conversao pelo servico');
  });

  await test('(C) RN-F11 pela rota: inativa pelo PUT da 40 -> gerar 400 literal -> reativa -> 201', async () => {
    const fId = await fornecedor('Inativavel E41 INT');
    const c = await cotar(fId, [{ material_id: mA, quantidade: 1, valor_unitario: 7 }]);
    const inativa = await request(app).put(`/api/compras/fornecedores/${fId}`).send({ ...SETE, razao_social: 'Inativavel E41 INT', status: 'inativo' });
    assert.strictEqual(inativa.status, 200, JSON.stringify(inativa.body));
    assert.strictEqual((await dbGet(db, 'SELECT status FROM fornecedores WHERE id = ?', [fId])).status, 'inativo', 'a regua: o PUT inativou de verdade');
    const r = await gerar(c.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Fornecedor inativo — reative-o em Compras → Fornecedores antes de gerar o pedido');
    assert.strictEqual((await getCotacao(c.id)).body.pedido_id, null, 'nada gravado na recusa');
    const reativa = await request(app).put(`/api/compras/fornecedores/${fId}`).send({ ...SETE, razao_social: 'Inativavel E41 INT', status: 'ativo' });
    assert.strictEqual(reativa.status, 200, JSON.stringify(reativa.body));
    const ok = await gerar(c.id);
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    assert.strictEqual(ok.body.valor_total, 7);
    assert.strictEqual((await getCotacao(c.id)).body.pedido_id, ok.body.id);
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
