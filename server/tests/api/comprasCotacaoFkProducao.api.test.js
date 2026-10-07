/**
 * Etapa 41, onda de correcao F2 (achado I2 da revisao final de RN) — a ORDEM das escritas de
 * `excluirPedido` / `excluirCotacao` / `gerarPedidoDaCotacao` sob a FK LIGADA, como em producao.
 *
 * ⚠️ POR QUE ESTE ARQUIVO EXISTE: o harness (`testApp.js`) roda com `foreign_keys = 0` e com stubs de
 * `cotacoes`/`pedidos_compra` SEM FK. Sabotagem medida pelo revisor: mover o
 * `UPDATE cotacoes SET pedido_id = NULL` de `excluirPedido` para DEPOIS do `DELETE FROM pedidos_compra`
 * deixa a suite inteira VERDE (20/20 nas duas de cotacao) e da `500 FOREIGN KEY constraint failed` em
 * producao — e a classe de defeito do cabecalho do plano da 41, e nenhum cenario a via.
 *
 * Aqui NAO se usa `createTestApp`: abre-se um SEGUNDO banco em memoria com a DDL DE PRODUCAO lida do
 * proprio `server/index.js` (`fornecedores`, `pedidos_compra`, `cotacoes` + o `ALTER … pedido_id
 * REFERENCES`) e de `schema.js` (`itens_pedido_compra` + `quantidade_recebida`, `itens_cotacao`),
 * `materiais_almoxarifado` minima, e `PRAGMA foreign_keys = ON`. `initSchema` NAO roda: so o que os
 * servicos tocam. As tabelas do almoxarifado que `excluirPedido` consulta
 * (`recebimentos_material_almoxarifado`, `solicitacoes_compra_almoxarifado`) ficam de fora de
 * proposito — ele tem guarda de tabela ausente e e isso que se exercita num banco so-core.
 *
 * Cada cenario tem CONTROLE POSITIVO antes da chamada ao servico (um `DELETE`/`UPDATE` cru que a FK
 * TEM de recusar): sem ele, um `PRAGMA foreign_keys` ignorado (ex.: dentro de transacao) faria tudo
 * passar provando nada. Os servicos sao chamados DIRETO (sem HTTP): a rota so traduz `e.status`.
 *
 * Executar: cd server && node tests/api/comprasCotacaoFkProducao.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const pedidoCompraService = require('../../services/compras/pedidoCompraService');
const cotacaoService = require('../../services/compras/cotacaoService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 102, nome: 'Admin E41 FK', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

/** A DDL de PRODUCAO, lida do arquivo que a cria — copia-la aqui faria o teste divergir na primeira edicao. */
function ddlDe(arquivo, tabela) {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', arquivo), 'utf8');
  const marca = `CREATE TABLE IF NOT EXISTS ${tabela} (`;
  const ini = src.indexOf(marca);
  assert.ok(ini >= 0, `DDL de ${tabela} nao encontrada em ${arquivo}`);
  const fim = src.indexOf(')`', ini);
  assert.ok(fim > ini, `fim da DDL de ${tabela} nao encontrado em ${arquivo}`);
  return src.slice(ini, fim + 1);
}
const fkFalhou = (e) => e && /SQLITE_CONSTRAINT.*FOREIGN KEY/.test(e.message);
/** Roda um SQL cru que a FK TEM de recusar — o controle positivo de cada cenario. */
async function deveFalharPorFk(db, sql, params, rotulo) {
  let e; try { await dbRun(db, sql, params); } catch (x) { e = x; }
  assert.ok(fkFalhou(e), `${rotulo}: a FK NAO vigiou (${e ? e.message : 'passou'}) — o banco deste teste nao prova nada`);
}
const fkCheck = (db) => dbAll(db, 'PRAGMA foreign_key_check');

(async () => {
  const db = new sqlite3.Database(':memory:');
  await dbRun(db, ddlDe('index.js', 'fornecedores'));
  await dbRun(db, ddlDe('index.js', 'pedidos_compra'));
  await dbRun(db, ddlDe('index.js', 'cotacoes'));
  // O mesmo ALTER de `index.js` (Etapa 41): e ELE que poe a FK `cotacoes.pedido_id -> pedidos_compra`.
  await dbRun(db, 'ALTER TABLE cotacoes ADD COLUMN pedido_id INTEGER REFERENCES pedidos_compra(id)');
  await dbRun(db, `CREATE TABLE materiais_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT UNIQUE NOT NULL, nome TEXT NOT NULL,
    descricao TEXT, unidade TEXT DEFAULT 'UN', ativo INTEGER DEFAULT 1)`);
  await dbRun(db, ddlDe('services/almoxarifado/schema.js', 'itens_pedido_compra'));
  await dbRun(db, 'ALTER TABLE itens_pedido_compra ADD COLUMN quantidade_recebida REAL DEFAULT 0');
  await dbRun(db, ddlDe('services/almoxarifado/schema.js', 'itens_cotacao'));
  await dbRun(db, 'PRAGMA foreign_keys = ON');
  assert.strictEqual((await dbGet(db, 'PRAGMA foreign_keys')).foreign_keys, 1, 'PRAGMA foreign_keys nao ligou');
  const fkCotacao = await dbAll(db, 'PRAGMA foreign_key_list(cotacoes)');
  assert.ok(fkCotacao.some((f) => f.from === 'pedido_id' && f.table === 'pedidos_compra'), 'cotacoes.pedido_id sem FK — a DDL lida nao e a de producao');

  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, status) VALUES ('Forn FK E41', 'ativo')")).lastID;
  const mA = (await dbRun(db, "INSERT INTO materiais_almoxarifado (codigo, nome, unidade) VALUES ('MAT-FK-A', 'Chapa FK', 'KG')")).lastID;
  let seq = 0;
  const cotar = (itens) => cotacaoService.criarCotacao(db, { numero: `COT-FK-${++seq}`, fornecedor_id: forn, itens });
  const gerar = (id) => cotacaoService.gerarPedidoDaCotacao(db, id, ADMIN);
  const contaPedidos = async () => (await dbGet(db, 'SELECT COUNT(*) AS n FROM pedidos_compra')).n;

  await test('(1) excluirPedido sob FK ON: controle positivo (DELETE cru do pedido apontado FALHA; UPDATE pedido_id=999 FALHA), depois o servico resolve, cotacoes_liberadas 1, pedido_id NULL, foreign_key_check vazio, e regenerar da PC novo', async () => {
    const c = await cotar([{ material_id: mA, quantidade: 2, valor_unitario: 10 }]);
    const p = await gerar(c.id);
    assert.strictEqual((await dbGet(db, 'SELECT pedido_id FROM cotacoes WHERE id = ?', [c.id])).pedido_id, p.id);
    await deveFalharPorFk(db, 'UPDATE cotacoes SET pedido_id = 999 WHERE id = ?', [c.id], 'controle+ UPDATE pedido_id inexistente');
    await deveFalharPorFk(db, 'DELETE FROM pedidos_compra WHERE id = ?', [p.id], 'controle+ DELETE cru do pedido com a cotacao apontando');
    // O servico: UPDATE cotacoes (libera) ANTES do DELETE do cabecalho — a sabotagem de ordem cai AQUI.
    const r = await pedidoCompraService.excluirPedido(db, p.id);
    assert.strictEqual(r.cotacoes_liberadas, 1, JSON.stringify(r));
    assert.strictEqual((await dbGet(db, 'SELECT pedido_id FROM cotacoes WHERE id = ?', [c.id])).pedido_id, null);
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) AS n FROM pedidos_compra WHERE id = ?', [p.id])).n, 0, 'cabecalho apagado');
    assert.deepStrictEqual(await fkCheck(db), []);
    const p2 = await gerar(c.id);
    assert.ok(/^PC-/.test(p2.numero) && p2.numero !== p.numero, 'ciclo gerar -> excluir -> gerar com FK ON');
    assert.deepStrictEqual(await fkCheck(db), []);
  });
  await test('(2) excluirCotacao com itens sob FK ON: controle positivo (DELETE cru da cotacao com itens FALHA), depois o servico resolve, 0 itens_cotacao, foreign_key_check vazio', async () => {
    const c = await cotar([{ material_id: mA, quantidade: 1, valor_unitario: 3 }, { material_id: mA, quantidade: 4, valor_unitario: 1 }]);
    await deveFalharPorFk(db, 'DELETE FROM cotacoes WHERE id = ?', [c.id], 'controle+ DELETE cru da cotacao com itens');
    const r = await cotacaoService.excluirCotacao(db, c.id);
    assert.strictEqual(r.message, 'Cotação excluída com sucesso');
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) AS n FROM itens_cotacao WHERE cotacao_id = ?', [c.id])).n, 0, 'itens_cotacao orfaos');
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) AS n FROM cotacoes WHERE id = ?', [c.id])).n, 0);
    assert.deepStrictEqual(await fkCheck(db), []);
  });
  await test('(3) F1 sob FK ON: 2 gerar concorrentes pelo servico -> 1 pedido + 1 x 409; a COMPENSACAO (excluirPedido do perdedor) passa com a FK ligada; foreign_key_check vazio', async () => {
    const c = await cotar([{ material_id: mA, quantidade: 5, valor_unitario: 2 }]);
    const antes = await contaPedidos();
    const rs = await Promise.allSettled([gerar(c.id), gerar(c.id)]);
    const ok = rs.filter((r) => r.status === 'fulfilled');
    const erros = rs.filter((r) => r.status === 'rejected').map((r) => r.reason);
    assert.strictEqual(ok.length, 1, `esperava 1 vencedor: ${rs.map((r) => r.status).join(',')} ${erros.map((e) => e.message).join(' | ')}`);
    assert.strictEqual(erros.length, 1);
    assert.strictEqual(erros[0].status, 409, erros[0].message);
    assert.strictEqual(erros[0].message, `Cotação ${c.numero} já gerou o pedido ${ok[0].value.numero}`);
    assert.strictEqual(await contaPedidos(), antes + 1, 'o perdedor foi compensado sob FK ON');
    assert.strictEqual((await dbGet(db, 'SELECT pedido_id FROM cotacoes WHERE id = ?', [c.id])).pedido_id, ok[0].value.id);
    assert.deepStrictEqual(await fkCheck(db), []);
  });

  await new Promise((r) => db.close(r));
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERRO na montagem do banco:', e.message); process.exit(1); });
