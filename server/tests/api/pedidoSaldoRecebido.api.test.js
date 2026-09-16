/**
 * Etapa 37, Task 1 — a ESTRUTURA que faz o pedido de compra saber que foi recebido.
 *
 * Achado medido na Fase 0 (sonda executada): `itens_pedido_compra` tem 8 colunas, **1 leitor e
 * ZERO escritores**. Um pedido de 10 unidades recebeu **25 em tres recebimentos** e continuou
 * `ABERTO` com `quantidade = 10` — nao havia onde guardar o que chegou. E o item do recebimento
 * (`recebimentos_material_itens_almoxarifado`) nao guardava QUAL linha do pedido ele atendeu,
 * entao nem depois dava para reconstruir a conta.
 *
 * Esta task e so a fundacao: duas colunas aditivas por `safeAlter` (sem ledger — decisao 2 do
 * design: os 4 ids do ledger sao reconstrucao/backfill/seed, `safeAlter` ja e idempotente e
 * `COUNT itens_pedido_compra = 0`, nao ha backfill a marcar), o indice em `pedido_id`, e a tabela
 * CORE `pedidos_compra` entrando no harness (decisao 8) porque sete arquivos de teste a criavam
 * com DDLs DIVERGENTES e `CREATE TABLE IF NOT EXISTS` faz "quem cria primeiro vence".
 *
 * O cenario (1) afirma `=== 0` e NAO `!= null`: `REAL DEFAULT 0` e o que faz a aritmetica do saldo
 * (`quantidade - COALESCE(quantidade_recebida, 0)`) nao virar `NaN` no primeiro pedido.
 * O cenario (3) e o que impede a decisao 8 de ser uma mudanca de harness sem regua.
 *
 * ⚠️ Fragilidade declarada (letra G): a regua ESTRUTURAL destes cenarios nao protege o
 * anti-padrao `db.run(sql, () => {})` no lugar de `safeAlter` — medido pela sabotagem 1 desta
 * task, que NAO derrubou nenhuma assercao. Quem guarda o padrao e `npm run test:safealter`.
 */
const assert = require('assert');
const request = require('supertest');
const sqlite3 = require('sqlite3').verbose();
const { createTestApp } = require('../helpers/testApp');
const { initSchema } = require('../../services/almoxarifado/schema');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 64, nome: 'Admin Etapa 37', role: 'admin' };

// As 8 colunas ORIGINAIS de `itens_pedido_compra` (schema.js antes desta etapa), usadas para
// montar o caminho de BANCO JA EXISTENTE no cenario (2): a tabela nasce sem a coluna nova e o
// `safeAlter` do initSchema tem de acrescenta-la.
const DDL_ITENS_PEDIDO_8_COLUNAS = `CREATE TABLE IF NOT EXISTS itens_pedido_compra (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL,
  material_id INTEGER,
  codigo TEXT,
  descricao TEXT,
  quantidade REAL NOT NULL DEFAULT 1,
  valor_unitario REAL DEFAULT 0,
  unidade TEXT DEFAULT 'UN'
)`;

async function colunas(db, tabela) {
  return (await dbAll(db, `PRAGMA table_info(${tabela})`)).map((c) => c.name);
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('(1) depois do initSchema as duas colunas e o indice existem, e o DEFAULT 0 vale', async () => {
    const itensPedido = await colunas(db, 'itens_pedido_compra');
    assert.ok(itensPedido.includes('quantidade_recebida'),
      `itens_pedido_compra sem quantidade_recebida — colunas: ${itensPedido.join(', ')}`);

    const recebItens = await colunas(db, 'recebimentos_material_itens_almoxarifado');
    assert.ok(recebItens.includes('pedido_item_id'),
      `recebimentos_material_itens_almoxarifado sem pedido_item_id — colunas: ${recebItens.join(', ')}`);

    const indices = (await dbAll(db, 'PRAGMA index_list(itens_pedido_compra)')).map((i) => i.name);
    assert.ok(indices.includes('idx_itens_pedido_compra_pedido'),
      `indice de pedido_id ausente — indices: ${indices.join(', ') || '(nenhum)'}`);

    // O DEFAULT importa de verdade: a linha do pedido que o Compras lancou ANTES desta etapa
    // (e a que ele lanca agora, sem passar a coluna) tem de ler 0, nao null.
    const pedido = await dbRun(db, `INSERT INTO pedidos_compra (numero, fornecedor_id, status)
      VALUES ('PC-E37-DEFAULT', 4242, 'pendente')`);
    const linha = await dbRun(db, `INSERT INTO itens_pedido_compra
      (pedido_id, material_id, codigo, descricao, quantidade, valor_unitario, unidade)
      VALUES (?, NULL, 'MAT-E37', 'Chapa Etapa 37', 10, 5, 'UN')`, [pedido.lastID]);
    const col = await dbGet(db,
      'SELECT quantidade, quantidade_recebida FROM itens_pedido_compra WHERE id = ?',
      [linha.lastID]);
    assert.strictEqual(col.quantidade_recebida, 0,
      'INSERT sem a coluna tem de ler 0 (DEFAULT 0); null faria o saldo virar NaN');
    // A metade positiva do DEFAULT: a aritmetica do saldo funciona na PRIMEIRA leitura.
    assert.strictEqual(col.quantidade - (col.quantidade_recebida || 0), 10);
  });

  await test('(2) IDEMPOTENTE: initSchema duas vezes, e banco JA EXISTENTE ganha a coluna', async () => {
    // (a) banco do harness: rodar initSchema DE NOVO nao lanca e nao duplica a coluna.
    await initSchema(db);
    const duplicadas = (await dbAll(db, 'PRAGMA table_info(itens_pedido_compra)'))
      .filter((c) => c.name === 'quantidade_recebida');
    assert.strictEqual(duplicadas.length, 1,
      `a coluna tem de existir UMA vez depois de duas passadas — achei ${duplicadas.length}`);
    const recebDuplicadas = (await dbAll(db, 'PRAGMA table_info(recebimentos_material_itens_almoxarifado)'))
      .filter((c) => c.name === 'pedido_item_id');
    assert.strictEqual(recebDuplicadas.length, 1);

    // (b) BANCO MIGRADO, montado a mao: a tabela existe com as 8 colunas antigas ANTES do
    // initSchema (o `CREATE TABLE IF NOT EXISTS` dele vira no-op) e o ALTER tem de acrescentar
    // a nona. Sem esta metade, o cenario provaria so o caminho de banco NOVO.
    const dbMigrado = new sqlite3.Database(':memory:');
    try {
      await dbRun(dbMigrado, DDL_ITENS_PEDIDO_8_COLUNAS);
      const antes = await colunas(dbMigrado, 'itens_pedido_compra');
      assert.strictEqual(antes.length, 8, `controle: a tabela tem de nascer com 8 colunas, tem ${antes.length}`);
      assert.ok(!antes.includes('quantidade_recebida'), 'controle: a coluna NAO pode existir antes');

      await initSchema(dbMigrado);

      const depois = await colunas(dbMigrado, 'itens_pedido_compra');
      assert.ok(depois.includes('quantidade_recebida'),
        `banco migrado nao ganhou a coluna — colunas: ${depois.join(', ')}`);
      assert.strictEqual(depois.length, 9, `8 + 1 = 9 colunas, achei ${depois.length}`);
      const idx = (await dbAll(dbMigrado, 'PRAGMA index_list(itens_pedido_compra)')).map((i) => i.name);
      assert.ok(idx.includes('idx_itens_pedido_compra_pedido'), 'banco migrado nao ganhou o indice');
    } finally {
      dbMigrado.close();
    }
  });

  await test('(3) o stub de pedidos_compra no harness serve: sem FK, e com created_at', async () => {
    // Sem FK de proposito (decisao 8): QUATRO arquivos de teste inserem `fornecedor_id: 1` sem
    // linha em `fornecedores`, e duas migracoes de schema.js terminam em PRAGMA foreign_keys=ON.
    const semFornecedor = await dbRun(db, `INSERT INTO pedidos_compra
      (numero, fornecedor_id, valor_total, status) VALUES ('PC-E37-SEM-FORN', 987654, 1500, 'pendente')`);
    assert.ok(semFornecedor.lastID > 0, 'INSERT com fornecedor_id inexistente tem de passar');

    // E `created_at` tem de existir: `listarPedidosCompraAux` termina em
    // `ORDER BY p.created_at DESC LIMIT 50` — sem a coluna a rota morre com "no such column".
    const res = await request(app).get('/api/almoxarifado/recebimentos-aux/pedidos-compra');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body), 'a rota aux devolve lista');
    // Metade positiva: a rota nao pode responder 200 com `[]` por fallback de tabela ausente
    // (`if (!tableExists) return []`, receiptService.js) — o pedido inserido TEM de aparecer.
    const encontrado = res.body.find((p) => p.numero === 'PC-E37-SEM-FORN');
    assert.ok(encontrado, `o pedido inserido nao voltou na rota aux: ${JSON.stringify(res.body)}`);
    assert.strictEqual(encontrado.id, semFornecedor.lastID);
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
