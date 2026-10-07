/**
 * Etapa 41, Task 2 — a CONVERSAO: `POST /api/compras/cotacoes/:id/gerar-pedido` (RN-F07…RN-F12,
 * RN-F15). O servico chama `pedidoCompraService.criarPedido` (numero `PC-` gerado, total derivado,
 * `resolverItens`), grava `cotacoes.pedido_id` + `status = 'aprovado'` e devolve o pedido relido.
 *
 * ⚠️ O (10) afirma que EXCLUIR o pedido gerado LIBERA a cotacao (`pedido_id` volta a NULL,
 * `cotacoes_liberadas` na resposta — Fase 2 I2). A FK `cotacoes.pedido_id` nao dispara no harness
 * (`foreign_keys = 0`), entao sem o `UPDATE` em `excluirPedido` nada quebraria por status: e a
 * asserção `pedido_id === null` + a segunda geracao dar 201 que prova.
 *
 * Executar: cd server && node tests/api/comprasCotacaoGerarPedido.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const pedidoCompraService = require('../../services/compras/pedidoCompraService');
const cotacaoService = require('../../services/compras/cotacaoService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 101, nome: 'Admin E41 T2 Gerar', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  const fA = (await dbRun(db, "INSERT INTO fornecedores (razao_social, status) VALUES ('Forn Ativo E41', 'ativo')")).lastID;
  const fB = (await dbRun(db, "INSERT INTO fornecedores (razao_social, status) VALUES ('Forn Inativo E41', 'inativo')")).lastID;
  async function material(codigo, nome, unidade = 'KG') {
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,?,0,1)`, [codigo, nome, unidade])).lastID;
  }
  const mA = await material('MAT-E41-A', 'Chapa A E41');
  const mB = await material('MAT-E41-B', 'Tubo B E41', 'PC');
  let seq = 0; const num = () => `COT-E41-G-${String(++seq).padStart(3, '0')}`;
  const get = (id) => request(app).get(`/api/compras/cotacoes/${id}`);
  /** Cria a cotacao pela rota e devolve o corpo (201 afirmado — a fixture nao pode falhar em silencio). */
  async function cotar(itens, extra = {}) {
    const corpo = { numero: num(), fornecedor_id: fA, ...extra };
    if (itens && itens.length) corpo.itens = itens;
    const r = await request(app).post('/api/compras/cotacoes').send(corpo);
    assert.strictEqual(r.status, 201, `fixture cotacao: ${JSON.stringify(r.body)}`);
    return r.body;
  }
  const gerar = (id) => request(app).post(`/api/compras/cotacoes/${id}/gerar-pedido`).send();
  const contaPedidos = async () => (await dbGet(db, 'SELECT COUNT(*) AS n FROM pedidos_compra')).n;
  const contaLinhas = async () => (await dbGet(db, 'SELECT COUNT(*) AS n FROM itens_pedido_compra')).n;
  // Pedido VIVO que nenhuma cotacao aponta. Neste arquivo TODO pedido nasce de `gerar-pedido`, entao
  // o numero certo e sempre 0 — um orfao aqui e um pedido que a RN-F10 prometeu nao criar.
  const contaOrfaos = async () => (await dbGet(db,
    'SELECT COUNT(*) AS n FROM pedidos_compra WHERE id NOT IN (SELECT pedido_id FROM cotacoes WHERE pedido_id IS NOT NULL)')).n;

  await test('(1) RN-F07 gerar -> 201 pedido PC-, total = soma, 2 linhas com codigo/descricao/unidade e recebida 0; cotacao ganha pedido_id e status aprovado; cabecalho: observacoes da cotacao, status pendente, previsao_entrega null', async () => {
    const c = await cotar([{ material_id: mA, quantidade: 2, valor_unitario: 10 }, { material_id: mB, quantidade: 1, valor_unitario: 5 }], { status: 'em_analise', observacoes: 'frete incluso E41' });
    const r = await gerar(c.id);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.ok(/^PC-/.test(r.body.numero), r.body.numero);
    assert.strictEqual(r.body.valor_total, 25);
    assert.strictEqual(r.body.fornecedor_id, fA);
    assert.deepStrictEqual(r.body.itens.map((i) => [i.material_id, i.quantidade, i.valor_unitario, i.codigo, i.quantidade_recebida]),
      [[mA, 2, 10, 'MAT-E41-A', 0], [mB, 1, 5, 'MAT-E41-B', 0]]);
    assert.strictEqual(r.body.data_pedido, pedidoCompraService.hojeLocalISO(), 'data_pedido nasce HOJE local (Fase 2 I4) — sem isso nascia NULL');
    // Onda de correcao da 41 (F3 = RN M2): o CABECALHO do pedido gerado. RN-F07 diz que so
    // `fornecedor_id, data_pedido, observacoes, itens` viajam para `criarPedido` — afirmado pelo
    // resultado: `observacoes` e a da cotacao, `status` e o DEFAULT do DDL e `previsao_entrega` nasce
    // NULL. Antes, injetar `status: 'cancelado'` + `previsao_entrega` ou tirar `observacoes` passava 20/20.
    assert.strictEqual(r.body.observacoes, 'frete incluso E41', 'observacoes da cotacao vai para o pedido (RN-F07)');
    assert.strictEqual(r.body.status, 'pendente', 'status e o DEFAULT do DDL — nada alem do contrato viaja para criarPedido');
    assert.strictEqual(r.body.previsao_entrega, null, 'previsao_entrega nasce NULL');
    const g = await get(c.id);
    assert.strictEqual(g.body.pedido_id, r.body.id);
    assert.strictEqual(g.body.pedido_numero, r.body.numero);
    assert.strictEqual(g.body.status, 'aprovado', 'gerar o pedido E aprovar (D7)');
    // e o pedido e um pedido NORMAL da lista
    const lista = await request(app).get('/api/compras/pedidos');
    assert.ok(lista.body.some((p) => p.id === r.body.id));
  });
  await test('(2) RN-F10 segunda conversao -> 409 com numero e PC; COUNT(pedidos) inalterado', async () => {
    const c = await cotar([{ material_id: mA, quantidade: 1 }]);
    const a = await gerar(c.id); assert.strictEqual(a.status, 201);
    const antes = await contaPedidos();
    const r = await gerar(c.id);
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Cotação ${c.numero} já gerou o pedido ${a.body.numero}`);
    assert.strictEqual(await contaPedidos(), antes);
  });
  await test('(3) RN-F08 sem itens -> 400 literal, pedido_id continua null', async () => {
    const c = await cotar([]);
    const r = await gerar(c.id);
    assert.strictEqual(r.status, 400); assert.deepStrictEqual(r.body, { error: 'cotação sem itens não pode gerar pedido' });
    assert.strictEqual((await get(c.id)).body.pedido_id, null);
  });
  await test('(4) RN-F09 rejeitado e cancelado -> 400 com o status na frase; em_analise -> 201', async () => {
    for (const s of ['rejeitado', 'cancelado']) {
      const c = await cotar([{ material_id: mA, quantidade: 1 }], { status: s });
      const r = await gerar(c.id);
      assert.strictEqual(r.status, 400, s); assert.strictEqual(r.body.error, `cotação ${s} não pode gerar pedido`);
    }
    const ok = await cotar([{ material_id: mA, quantidade: 1 }], { status: 'em_analise' });
    assert.strictEqual((await gerar(ok.id)).status, 201);
  });
  await test('(5) RN-F11 fornecedor inativo -> 400 literal; reativado -> 201; fornecedor APAGADO -> 400 "Fornecedor não encontrado"', async () => {
    const c = await cotar([{ material_id: mA, quantidade: 1 }], { fornecedor_id: fB });
    const r = await gerar(c.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Fornecedor inativo — reative-o em Compras → Fornecedores antes de gerar o pedido');
    await dbRun(db, "UPDATE fornecedores SET status = 'ativo' WHERE id = ?", [fB]);
    assert.strictEqual((await gerar(c.id)).status, 201);
    // A metade "fornecedor apagado" so e alcancavel no harness (FK desligada) — em producao a FK e a
    // lixeira propria de fornecedor (409 com cotacao) impedem o DELETE (Fase 2 M5). O cenario fica
    // porque e o caminho do SERVICO: `assertFornecedor` tem de vir ANTES do `SELECT status`.
    const fC = (await dbRun(db, "INSERT INTO fornecedores (razao_social) VALUES ('Some E41')")).lastID;
    const c2 = await cotar([{ material_id: mA, quantidade: 1 }], { fornecedor_id: fC });
    await dbRun(db, 'DELETE FROM fornecedores WHERE id = ?', [fC]);
    const r2 = await gerar(c2.id);
    assert.strictEqual(r2.status, 400); assert.deepStrictEqual(r2.body, { error: 'Fornecedor não encontrado' });
  });
  await test('(6) 404 para cotacao inexistente', async () => {
    const r = await gerar(999999); assert.strictEqual(r.status, 404); assert.deepStrictEqual(r.body, { error: 'Cotação não encontrada' });
  });
  await test('(7) RN-F06 cotacao convertida -> DELETE 409 com a literal de exclusao', async () => {
    const c = await cotar([{ material_id: mA, quantidade: 1 }]);
    const a = await gerar(c.id);
    const r = await request(app).delete(`/api/compras/cotacoes/${c.id}`);
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.body.error, `Cotação ${c.numero} já gerou o pedido ${a.body.numero} — não pode ser excluída`);
  });
  await test('(8) pelo SERVICO: gerarPedidoDaCotacao direto produz o mesmo pedido que a rota', async () => {
    const c = await cotar([{ material_id: mB, quantidade: 3, valor_unitario: 2 }]);
    const p = await cotacaoService.gerarPedidoDaCotacao(db, c.id, ADMIN);
    assert.ok(/^PC-/.test(p.numero)); assert.strictEqual(p.valor_total, 6);
    assert.strictEqual((await get(c.id)).body.pedido_id, p.id);
    let e; try { await cotacaoService.gerarPedidoDaCotacao(db, c.id, ADMIN); } catch (x) { e = x; }
    assert.strictEqual(e && e.status, 409);
  });
  await test('(9) RN-F15 cotacao convertida nao pode mais ser editada: PUT -> 409 literal, linha intacta', async () => {
    const c = await cotar([{ material_id: mA, quantidade: 1, valor_unitario: 10 }]);
    const a = await gerar(c.id); assert.strictEqual(a.status, 201);
    const r = await request(app).put(`/api/compras/cotacoes/${c.id}`).send({ numero: c.numero, fornecedor_id: fA, status: 'rejeitado', itens: [{ material_id: mA, quantidade: 99, valor_unitario: 1 }] });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Cotação ${c.numero} já gerou o pedido ${a.body.numero} — não pode mais ser editada`);
    const g = await get(c.id);
    assert.strictEqual(g.body.status, 'aprovado'); assert.strictEqual(g.body.itens[0].quantidade, 1); assert.strictEqual(g.body.valor_total, 10);
  });
  await test('(10) RN-F12 excluir o pedido gerado LIBERA a cotacao: pedido_id volta a NULL, resposta traz cotacoes_liberadas, e gerar de novo -> 201 com PC novo', async () => {
    const c = await cotar([{ material_id: mA, quantidade: 1, valor_unitario: 3 }]);
    const a = await gerar(c.id); assert.strictEqual(a.status, 201);
    const d = await request(app).delete(`/api/compras/pedidos/${a.body.id}`);
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.strictEqual(d.body.cotacoes_liberadas, 1, JSON.stringify(d.body));
    const g = await get(c.id);
    assert.strictEqual(g.body.pedido_id, null); assert.strictEqual(g.body.pedido_numero, null);
    const b = await gerar(c.id);
    assert.strictEqual(b.status, 201, JSON.stringify(b.body));
    assert.notStrictEqual(b.body.numero, a.body.numero, 'PC novo');
    // e agora a cotacao volta a ser inexcluivel
    assert.strictEqual((await request(app).delete(`/api/compras/cotacoes/${c.id}`)).status, 409);
  });
  // Onda de correcao da 41 (F1 = RN I1 = UX C1): a conversao NAO era atomica. O 409 era lido em
  // `obterCotacao` antes de varios `await` e o `UPDATE` do vinculo era incondicional — 6 POSTs em
  // paralelo davam 6 x 201, seis pedidos, cinco sem cotacao apontando (todos visiveis no aux do
  // recebimento). Duplo clique na tela reproduz com dois. O conserto e o `UPDATE … WHERE id = ? AND
  // pedido_id IS NULL` como guarda + compensacao (`excluirPedido` do perdedor) + 409 com o vencedor.
  await test('(11) RN-F10 CORRIDA: 6 gerar-pedido em paralelo na MESMA cotacao -> exatamente 1 x 201 e 5 x 409 com o PC do vencedor; COUNT(pedidos) +1; pedido_id aponta para o unico pedido; linhas = itens da cotacao; 0 orfaos', async () => {
    const c = await cotar([{ material_id: mA, quantidade: 2, valor_unitario: 10 }, { material_id: mB, quantidade: 1, valor_unitario: 5 }]);
    const pedidosAntes = await contaPedidos();
    const linhasAntes = await contaLinhas();
    const rs = await Promise.all(Array.from({ length: 6 }, () => gerar(c.id)));
    const codigos = rs.map((r) => r.status);
    assert.deepStrictEqual([...codigos].sort(), [201, 409, 409, 409, 409, 409], `status: ${codigos.join(',')}`);
    const vencedor = rs.find((r) => r.status === 201).body;
    assert.ok(/^PC-/.test(vencedor.numero), vencedor.numero);
    for (const r of rs.filter((x) => x.status === 409)) {
      assert.strictEqual(r.body.error, `Cotação ${c.numero} já gerou o pedido ${vencedor.numero}`, JSON.stringify(r.body));
    }
    assert.strictEqual(await contaPedidos(), pedidosAntes + 1, 'os perdedores tem de ser COMPENSADOS (excluirPedido) — sem isso ficam 6 pedidos');
    const g = await get(c.id);
    assert.strictEqual(g.body.pedido_id, vencedor.id, 'pedido_id aponta para o unico pedido que existe');
    assert.strictEqual(g.body.pedido_numero, vencedor.numero);
    assert.strictEqual(g.body.status, 'aprovado');
    assert.strictEqual(await contaLinhas(), linhasAntes + 2, 'itens_pedido_compra: so as 2 linhas do vencedor, nenhuma orfa');
    assert.strictEqual(await contaOrfaos(), 0, 'pedido vivo sem cotacao apontando');
  });
  // F1, segunda metade (RN M3): `DELETE /cotacoes/:id` concorrente com `gerar-pedido`. Antes, o
  // `UPDATE` afetava 0 linhas sem ninguem olhar `changes` e sobrava um pedido vivo com a cotacao
  // apagada. Os dois resultados legitimos: a exclusao venceu (200 + 404/409, nenhum pedido sobra)
  // ou a conversao venceu (409 + 201, a cotacao aponta para o pedido). O invariante e um so: 0 orfaos.
  await test('(12) CORRIDA DELETE /cotacoes/:id x gerar-pedido -> (200 + 404/409) ou (409 + 201); nunca pedido vivo com cotacao apagada', async () => {
    const c = await cotar([{ material_id: mA, quantidade: 1, valor_unitario: 7 }]);
    const pedidosAntes = await contaPedidos();
    const [d, g] = await Promise.all([request(app).delete(`/api/compras/cotacoes/${c.id}`), gerar(c.id)]);
    const par = `delete ${d.status} + gerar ${g.status}: ${JSON.stringify(d.body)} / ${JSON.stringify(g.body)}`;
    if (d.status === 200) {
      assert.ok([404, 409].includes(g.status), par);
      assert.strictEqual(await contaPedidos(), pedidosAntes, `cotacao apagada: nenhum pedido pode sobrar (${par})`);
      assert.strictEqual((await get(c.id)).status, 404);
    } else {
      assert.strictEqual(d.status, 409, par);
      assert.strictEqual(g.status, 201, par);
      assert.strictEqual(await contaPedidos(), pedidosAntes + 1, par);
      assert.strictEqual((await get(c.id)).body.pedido_id, g.body.id);
    }
    assert.strictEqual(await contaOrfaos(), 0, `pedido vivo sem cotacao apontando (${par})`);
  });

  // ── (13) O ENTRELACAMENTO QUE O (12) NAO VE (re-revisao da onda, I1) ────────────────────────
  // O (12) dispara os dois no MESMO tick e observa sempre `200 + 404`. Com o DELETE chegando algumas
  // voltas do event loop DEPOIS do gerar, `excluirCotacao` le `pedido_id NULL`, o CAS do gerar vence,
  // e o `DELETE FROM cotacoes` cru apaga a cotacao por baixo do pedido: pedido vivo, orfao, no aux do
  // recebimento (28 de 301 janelas na sonda do revisor). O conserto e simetrico ao F1: a exclusao
  // tambem REIVINDICA a cotacao por CAS (`status = 'cancelado' WHERE pedido_id IS NULL`) antes de
  // apagar, e o CAS do gerar recusa cotacao cancelada. Este cenario varre d = 0..300 voltas (a sonda achou os orfaos entre ~40 e ~300).
  await test('(13) DELETE chegando d voltas do event loop DEPOIS do gerar: em NENHUMA janela sobra pedido orfao', async () => {
    const dormir = async (n) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };
    const pares = {};
    for (let d = 0; d <= 300; d += 1) {
      const c = await cotar([{ material_id: mA, quantidade: 2, valor_unitario: 10 }]);
      const antes = await contaPedidos();
      const pg = gerar(c.id).then((r) => r);            // supertest e lazy: o .then dispara agora
      await dormir(d);
      const pd = request(app).delete(`/api/compras/cotacoes/${c.id}`).then((r) => r);
      const [g, dl] = await Promise.all([pg, pd]);
      const par = `gerar ${g.status} + delete ${dl.status}`;
      pares[par] = (pares[par] || 0) + 1;
      const cot = await dbGet(db, 'SELECT id, pedido_id, status FROM cotacoes WHERE id = ?', [c.id]);
      assert.strictEqual(await contaOrfaos(), 0, `d=${d}: pedido vivo sem cotacao apontando (${par}; cotacao ${cot ? JSON.stringify(cot) : 'APAGADA'})`);
      // e as duas saidas legitimas sao as unicas: ou o gerar venceu (201 + 409, cotacao viva apontando)
      // ou a exclusao venceu (404/409 + 200, cotacao apagada, nenhum pedido nasceu)
      if (g.status === 201) {
        assert.strictEqual(dl.status, 409, `d=${d}: ${par}`);
        assert.ok(cot && cot.pedido_id === g.body.id, `d=${d}: a cotacao tem de apontar para o pedido`);
        assert.strictEqual(await contaPedidos(), antes + 1);
      } else {
        assert.strictEqual(dl.status, 200, `d=${d}: ${par}`);
        assert.ok([400, 404, 409].includes(g.status), `d=${d}: ${par}`); // 400 = perdeu para a exclusao (frase de status), 404 = ja apagada
        assert.strictEqual(cot, undefined, `d=${d}: a cotacao tinha de ter sido apagada`);
        assert.strictEqual(await contaPedidos(), antes, `d=${d}: nenhum pedido pode ter sobrado`);
      }
    }
    console.log(`      pares observados: ${JSON.stringify(pares)}`);
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
