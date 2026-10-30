/**
 * Etapa 193, O1 — a OS POR ITEM do pedido de compra (RN-193.07 a RN-193.09).
 * Plano: `docs/superpowers/plans/2026-10-30-compras-etapa193-cadastro-so-no-compras-e-os-por-item.md`.
 *
 * O gesto do comprador ate o fim:
 * - criar com 2 itens de OS diferentes (`itens[].os_texto`): grava o texto aparado por linha; a OS do cabecalho nao muda;
 * - mais de 60 caracteres -> 400 `OS do item: no máximo 60 caracteres.` (nada gravado); tipo errado -> 400
 *   `OS do item inválida.`; numero vira texto; so espacos = sem OS;
 * - `PUT`: os itens sao SUBSTITUIDOS — a OS do item vai e volta com a linha (trocar a de um item mantem a do outro);
 *   item sem a chave = sem OS (nao herda: nao ha linha a herdar);
 * - documento: coluna `OS` nos itens SO quando algum item tem OS (escapada);
 * - lista: a busca textual acha pela OS do item;
 * - cotacao: o pedido gerado nasce com os itens sem OS;
 * - importacao: coluna `OS do item` (o export do CRM) ou `OS` (planilha de fora) vira a OS da linha; acima de 60 -> aviso e a
 *   linha entra sem OS;
 * - almoxarifado: receber o pedido nao reserva nada pela OS do item; a OS do item nao conta como pedido da OS.
 *
 * Executar: cd server && node tests/api/comprasPedidoOsPorItem.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const pedidoCompraService = require('../../services/compras/pedidoCompraService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1931, nome: 'Admin E193O', role: 'admin', is_superadmin: 1, email: 'e193o@test.com' };
const OS_ITEM_LONGA = 'OS do item: no máximo 60 caracteres.';
const OS_ITEM_INVALIDA = 'OS do item inválida.';
const API = '/api/almoxarifado';
const textoDoHtml = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

(async () => {
  const { app, db, close } = await createTestApp({ user: { ...ADMIN } });
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('liberacao_valor_ativo', '0');
  await cfg('aprovacao_automatica', '0');

  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL, cliente_id INTEGER,
    tipo_os TEXT NOT NULL DEFAULT 'producao', status TEXT DEFAULT 'pendente', data_abertura DATE NOT NULL DEFAULT '2026-10-30')`);
  const osCad = (await dbRun(db, "INSERT INTO ordens_servico (numero_os, status) VALUES ('E193-OS-A', 'em_andamento')")).lastID;

  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('FORNECEDOR E193O','19319319000193','ativo')")).lastID;
  const m1 = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, ativo, quantidade_atual, custo_unitario)
    VALUES ('E193O-M1','Chapa E193O','PC',1,0,10)`)).lastID;
  const m2 = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, ativo, quantidade_atual, custo_unitario)
    VALUES ('E193O-M2','Parafuso E193O','PC',1,0,10)`)).lastID;

  const item = (m, extra = {}) => ({ material_id: m, quantidade: 2, valor_unitario: 5, ...extra });
  const payload = (itens, extra = {}) => ({ fornecedor_id: forn, itens, ...extra });
  const osDasLinhas = async (pedidoId) => (await dbAll(db,
    'SELECT os_texto FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY item_numero, id', [pedidoId])).map((l) => l.os_texto);
  const contar = async () => ({
    p: (await dbGet(db, 'SELECT COUNT(*) AS n FROM pedidos_compra')).n,
    i: (await dbGet(db, 'SELECT COUNT(*) AS n FROM itens_pedido_compra')).n,
  });

  console.log('\n═══ Etapa 193 O1 — OS por item do pedido de compra ═══\n');

  let pid;

  await test('RN-193.07 POST com 2 itens de OS diferentes grava cada uma (aparada); GET devolve por item; cabecalho intacto', async () => {
    const r = await request(app).post('/api/compras/pedidos').send(payload([
      item(m1, { os_texto: '  OS 5001  ' }), item(m2, { os_texto: 'OS 5002 (cliente B)' }),
    ], { os_id: osCad }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    pid = r.body.id;
    assert.deepStrictEqual(await osDasLinhas(pid), ['OS 5001', 'OS 5002 (cliente B)']);
    assert.deepStrictEqual(r.body.itens.map((i) => i.os_texto), ['OS 5001', 'OS 5002 (cliente B)']);
    const g = await request(app).get(`/api/compras/pedidos/${pid}`);
    assert.deepStrictEqual(g.body.itens.map((i) => i.os_texto), ['OS 5001', 'OS 5002 (cliente B)']);
    assert.strictEqual(g.body.os_id, osCad, 'a OS do cabecalho tem de continuar a da lista');
    assert.strictEqual(g.body.os_texto, null);
  });

  await test('RN-193.07 61 caracteres -> 400 literal e nada gravado (rota e criarPedido direto); 60 exatos passam; so espacos = sem OS', async () => {
    const antes = await contar();
    const r = await request(app).post('/api/compras/pedidos').send(payload([item(m1), item(m2, { os_texto: 'x'.repeat(61) })]));
    assert.deepStrictEqual([r.status, r.body.error], [400, OS_ITEM_LONGA], JSON.stringify(r.body));
    let e; try { await pedidoCompraService.criarPedido(db, payload([item(m1, { os_texto: 'y'.repeat(61) })]), ADMIN); } catch (x) { e = x; }
    assert.ok(e, 'criarPedido aceitou 61');
    assert.deepStrictEqual([e.status, e.message], [400, OS_ITEM_LONGA]);
    assert.deepStrictEqual(await contar(), antes);
    const ok = await request(app).post('/api/compras/pedidos').send(payload([item(m1, { os_texto: '😀'.repeat(60) }), item(m2, { os_texto: '   ' })]));
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    assert.deepStrictEqual(await osDasLinhas(ok.body.id), ['😀'.repeat(60), null]);
  });

  await test('RN-193.07 OS do item objeto/booleano -> 400 "OS do item inválida."; numero 4471 grava "4471"; null = sem OS', async () => {
    for (const ruim of [{ a: 1 }, true, ['OS 1']]) {
      const antes = await contar();
      const r = await request(app).post('/api/compras/pedidos').send(payload([item(m1, { os_texto: ruim })]));
      assert.deepStrictEqual([r.status, r.body.error], [400, OS_ITEM_INVALIDA], `${JSON.stringify(ruim)}: ${JSON.stringify(r.body)}`);
      assert.deepStrictEqual(await contar(), antes);
    }
    const n = await request(app).post('/api/compras/pedidos').send(payload([item(m1, { os_texto: 4471 }), item(m2, { os_texto: null })]));
    assert.strictEqual(n.status, 201, JSON.stringify(n.body));
    assert.deepStrictEqual(await osDasLinhas(n.body.id), ['4471', null]);
  });

  await test('RN-193.09 PUT: trocar a OS de UM item mantem a do outro; item sem a chave fica sem OS; 61 -> 400 e nada muda', async () => {
    const a = await request(app).put(`/api/compras/pedidos/${pid}`).send(payload([
      item(m1, { os_texto: 'OS 5001' }), item(m2, { os_texto: 'OS 5099' }),
    ], { os_id: osCad }));
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    assert.deepStrictEqual(await osDasLinhas(pid), ['OS 5001', 'OS 5099']);
    assert.deepStrictEqual(a.body.itens.map((i) => i.os_texto), ['OS 5001', 'OS 5099']);
    const longa = await request(app).put(`/api/compras/pedidos/${pid}`).send(payload([item(m1, { os_texto: 'z'.repeat(61) }), item(m2)]));
    assert.deepStrictEqual([longa.status, longa.body.error], [400, OS_ITEM_LONGA]);
    assert.deepStrictEqual(await osDasLinhas(pid), ['OS 5001', 'OS 5099'], 'a recusa nao pode ter apagado as linhas');
    const sem = await request(app).put(`/api/compras/pedidos/${pid}`).send(payload([item(m1, { os_texto: 'OS 5001' }), item(m2)]));
    assert.strictEqual(sem.status, 200, JSON.stringify(sem.body));
    assert.deepStrictEqual(await osDasLinhas(pid), ['OS 5001', null]);
    // volta ao cenario de duas OS para os testes seguintes
    await request(app).put(`/api/compras/pedidos/${pid}`).send(payload([item(m1, { os_texto: 'OS 5001' }), item(m2, { os_texto: 'OS <5002> & cia' })]));
    assert.deepStrictEqual(await osDasLinhas(pid), ['OS 5001', 'OS <5002> & cia']);
  });

  await test('RN-193.09 documento: coluna OS nos itens com o texto escapado; pedido sem OS em item nenhum nao tem a coluna', async () => {
    const r = await request(app).get(`/api/compras/pedidos/${pid}/documento`);
    assert.strictEqual(r.status, 200);
    const thead = (r.text.match(/<table class="itens">[\s\S]*?<\/thead>/) || [''])[0];
    assert.ok(/<th[^>]*>OS<\/th>/.test(thead), 'documento sem a coluna OS');
    assert.ok(r.text.includes('OS &lt;5002&gt; &amp; cia'), 'OS do item nao escapada');
    assert.ok(textoDoHtml(r.text).includes('OS 5001'), 'documento sem a OS do item 1');
    const semOs = await request(app).post('/api/compras/pedidos').send(payload([item(m1), item(m2)]));
    const d = await request(app).get(`/api/compras/pedidos/${semOs.body.id}/documento`);
    const thead2 = (d.text.match(/<table class="itens">[\s\S]*?<\/thead>/) || [''])[0];
    assert.ok(thead2.includes('Valor Total'), 'premissa: achou o cabecalho da tabela de itens');
    assert.ok(!/<th[^>]*>OS<\/th>/.test(thead2), 'pedido sem OS por item ganhou a coluna');
  });

  await test('RN-193.09 lista: a busca textual acha o pedido pela OS do item (qualquer caixa)', async () => {
    const s = await request(app).get('/api/compras/pedidos').query({ search: '5099' });
    assert.deepStrictEqual(s.body.map((x) => x.id), [], 'a OS antiga do item 2 nao pode mais achar');
    const a = await request(app).get('/api/compras/pedidos').query({ search: '<5002>' });
    assert.deepStrictEqual(a.body.map((x) => x.id), [pid]);
    const b = await request(app).get('/api/compras/pedidos').query({ search: 'os 5001' });
    assert.deepStrictEqual(b.body.map((x) => x.id), [pid]);
  });

  await test('RN-193.09 cotacao: o pedido gerado nasce com os itens sem OS', async () => {
    const c = await request(app).post('/api/compras/cotacoes').send({
      fornecedor_id: forn, numero: 'COT-E193O', status: 'em_analise',
      itens: [{ material_id: m1, quantidade: 1, valor_unitario: 3, os_texto: 'OS 7777' }],
    });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const g = await request(app).post(`/api/compras/cotacoes/${c.body.id}/gerar-pedido`).send({});
    assert.ok([200, 201].includes(g.status), JSON.stringify(g.body));
    const pedidoId = g.body.pedido_id || (g.body.pedido && g.body.pedido.id) || g.body.id;
    const linhas = await dbAll(db, 'SELECT os_texto FROM itens_pedido_compra WHERE pedido_id = ?', [pedidoId]);
    assert.strictEqual(linhas.length, 1, `premissa: o pedido da cotacao tem 1 linha (${JSON.stringify(g.body)})`);
    assert.strictEqual(linhas[0].os_texto, null);
  });

  await test('RN-193.09 importacao: "OS do item" (export do CRM) vence "OS"; "OS" sozinha (planilha de fora) vale; >60 -> aviso e entra sem OS', async () => {
    const r = await request(app).post('/api/compras/pedidos/importar').send({ linhas: [
      { 'Número': 'IMP-1', 'Fornecedor': 'FORNECEDOR E193O', 'Código': 'E193O-M1', 'Quantidade': 1, 'OS': 'CABECALHO', 'OS do item': 'OS 6001' },
      { 'Número': 'IMP-1', 'Fornecedor': 'FORNECEDOR E193O', 'Código': 'E193O-M2', 'Quantidade': 1, 'OS': 'CABECALHO', 'OS do item': '' },
      { 'Número': 'IMP-2', 'Fornecedor': 'FORNECEDOR E193O', 'Código': 'E193O-M1', 'Quantidade': 1, 'OS': ' OS 6002 ' },
      { 'Número': 'IMP-2', 'Fornecedor': 'FORNECEDOR E193O', 'Código': 'E193O-M2', 'Quantidade': 1, 'OS': 'w'.repeat(61) },
    ] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.pedidos.length, 2, JSON.stringify(r.body));
    assert.deepStrictEqual(await osDasLinhas(r.body.pedidos[0].id), ['OS 6001', null]);
    assert.deepStrictEqual(await osDasLinhas(r.body.pedidos[1].id), ['OS 6002', null]);
    const aviso = (r.body.avisos || []).find((a) => a.linha === 4);
    assert.ok(aviso, `sem aviso da OS longa: ${JSON.stringify(r.body.avisos)}`);
    assert.strictEqual(aviso.campo, 'os_texto');
    assert.strictEqual(aviso.motivo, 'OS do item com mais de 60 caracteres — a linha entrou sem OS');
  });

  await test('RN-193.08 almoxarifado: receber o pedido de OS por item nao reserva nada; a OS do item nao e pedido da OS', async () => {
    const osencerrada = require('../../services/almoxarifado/osEncerradaService');
    const osItem = (await dbRun(db, "INSERT INTO ordens_servico (numero_os, status) VALUES ('E193-OS-ITEM', 'em_andamento')")).lastID;
    const p = await request(app).post('/api/compras/pedidos').send(payload([
      item(m1, { os_texto: 'E193-OS-ITEM', quantidade: 3, valor_unitario: 1 }),
      item(m2, { os_texto: String(osItem), quantidade: 2, valor_unitario: 1 }),
    ], { status: 'pendente' }));
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    const linhas = await dbAll(db, 'SELECT id, material_id, quantidade FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY item_numero', [p.body.id]);
    const itens = linhas.map((l) => ({ material_id: l.material_id, pedido_item_id: l.id, quantidade: l.quantidade, quantidade_recebida: l.quantidade }));
    const aux = await request(app).get(`${API}/recebimentos-aux/pedidos-compra/${p.body.id}/itens`);
    assert.strictEqual(aux.status, 200, JSON.stringify(aux.body));
    const c = await request(app).post(`${API}/recebimentos`).send({ tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: p.body.id, itens });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const rec = c.body.id;
    assert.strictEqual((await request(app).put(`${API}/recebimentos/${rec}/conferir`).send({ itens })).status, 200);
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      // eslint-disable-next-line no-await-in-loop
      const w = await request(app).post(`${API}/recebimentos/${rec}/workflow`).send({ acao });
      assert.strictEqual(w.status, 200, acao + JSON.stringify(w.body));
    }
    const f = await request(app).put(`${API}/recebimentos/${rec}/fiscal`).send({
      nota_fiscal: 'NF-E193O-1', fornecedor_id: forn, fornecedor_nome: 'FORNECEDOR E193O',
      data_emissao_nf: '2026-10-29', data_entrada_nf: '2026-10-30', valor_total_nota: 5, itens,
    });
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    const proc = await request(app).post(`${API}/recebimentos/${rec}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(proc.status, 200, JSON.stringify(proc.body));
    // a entrada foi feita (controle: o recebimento andou de verdade)
    const q = await dbAll(db, 'SELECT id, quantidade_atual, COALESCE(quantidade_reservada, 0) AS r FROM materiais_almoxarifado WHERE id IN (?, ?) ORDER BY id', [m1, m2]);
    assert.deepStrictEqual(q.map((x) => [x.quantidade_atual, x.r]), [[3, 0], [2, 0]]);
    const reservas = await dbAll(db, 'SELECT id FROM reservas_material_almoxarifado WHERE material_id IN (?, ?)', [m1, m2]);
    assert.deepStrictEqual(reservas, [], 'nasceu reserva pela OS do item');
    const mov = await dbAll(db, "SELECT os_id FROM movimentacoes_almoxarifado WHERE recebimento_id = ? AND tipo = 'ENTRADA_COMPRA'", [rec]);
    assert.ok(mov.length === 2 && mov.every((x) => x.os_id == null), `entrada marcada com OS: ${JSON.stringify(mov)}`);
    assert.deepStrictEqual(await osencerrada.pedidosDaOs(db, osItem), []);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
