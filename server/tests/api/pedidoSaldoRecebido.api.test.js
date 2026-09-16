/**
 * Etapa 37, Tasks 1 e 3 — a ESTRUTURA que faz o pedido de compra saber que foi recebido, e o
 * ACUMULADOR que a move.
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
 *
 * ── TASK 3 (RN-22/RN-23): o acumulador, e POR QUE ele mora onde mora ──────────────────────────
 * A Task 1 deixou a coluna com ZERO escritores. Os cenarios (4) a (9) sao os escritores, e cada um
 * mede um lugar em que a soma pode estar errada com a suite inteira verde:
 *
 * - (4)/(4b) somar o numero certo, e o MESMO que moveu estoque (`quantidadeDoItem`);
 * - (5)     nao somar DUAS vezes — e o defeito classico desta funcao, que ela ja pagou uma vez
 *           ("a 1a tentativa entrou 10 do A e falhou no B; corrigido o B, a 2a entrou MAIS 10");
 * - (6)     o OUTRO caminho de entrada: `aprovarRecebimento` chama `darEntradaEstoque` DIRETO
 *           (ramo APROVADO, `POST /recebimentos/:id/aprovar`). Somar dentro de `processarNota`
 *           deixaria esse caminho creditando estoque sem contar ao pedido, e NENHUM teste de hoje
 *           pegaria — medido: `itens_pedido_compra` tem INSERT em 4 arquivos de teste e ZERO
 *           SELECT depois de processar;
 * - (7)     RN-23: documento CRIADO e nao processado nao consome saldo (nao existe status
 *           CANCELADO de recebimento — medido; este e o equivalente alcancavel);
 * - (8)     dois processados somam os dois;
 * - (9)     a soma no pedido NAO pode derrubar a entrada de nota (o `try/catch` nao-fatal).
 *
 * ⚠️ Os cenarios (5) e (7) sao VERDES ANTES do conserto, por vacuidade: enquanto ninguem soma,
 * "continua 6" e "nao entra na conta" sao verdadeiros com a coluna parada em 0. Eles so valem
 * DEPOIS, e quem prova que sabem falhar sao as sabotagens 1 e 2 da Task 3.
 *
 * Por qual caminho cada cenario chega a entrada fisica, de proposito:
 * (a) WORKFLOW REAL (`encaminhar_compras` → `finalizar_compras` → `iniciar_faturamento` →
 *     `PUT /fiscal` → `processar`) nos cenarios (4), (4b), (7) e (9) — e o gesto do usuario, e
 *     inventar um UPDATE de status a mao para pular o `/fiscal` foi o que escondeu o Critical da
 *     Etapa 36;
 * (b) `receiptService.darEntradaEstoque` DIRETO (exportada de proposito) nos cenarios (5) e (8),
 *     que medem IDEMPOTENCIA e nao workflow;
 * (c) `POST /recebimentos/:id/aprovar` no (6), que e o proprio objeto do cenario.
 */
const assert = require('assert');
const request = require('supertest');
const sqlite3 = require('sqlite3').verbose();
const { createTestApp } = require('../helpers/testApp');
const { initSchema } = require('../../services/almoxarifado/schema');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');

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

  // ── Fixtures da Task 3 ──────────────────────────────────────────────────────────────────────
  // `validarDadosProcessamento` exige fornecedor (CNPJ OU nome) para processar, e o `POST` por
  // pedido herda o fornecedor DO PEDIDO — entao o pedido nasce com um fornecedor de verdade.
  const forn = await dbRun(db, `INSERT INTO fornecedores (razao_social, cnpj)
    VALUES ('Forn E37 T3','88.888.888/0001-88')`);

  let seq = 0;
  async function novoMaterial() {
    seq += 1;
    const codigo = `E37-T3-${seq}`;
    const m = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',0,1)`,
    [codigo, `Chapa acumulador ${seq}`]);
    return { id: m.lastID, codigo };
  }

  /**
   * Pedido de compra com as linhas que o cenario precisa. Se a linha trouxer a chave `recebida`, a
   * coluna vai EXPLICITA no INSERT (inclusive `null` — e o que o cenario (4b) precisa, porque o
   * DEFAULT 0 nunca produz NULL); sem a chave, a coluna nasce pelo DEFAULT da Task 1.
   */
  async function novoPedido(linhas) {
    seq += 1;
    const numero = `PC-E37-T3-${seq}`;
    const p = await dbRun(db, `INSERT INTO pedidos_compra (numero, fornecedor_id, status)
      VALUES (?,?,'pendente')`, [numero, forn.lastID]);
    const ids = [];
    for (const l of linhas) {
      const explicita = Object.prototype.hasOwnProperty.call(l, 'recebida');
      const cols = ['pedido_id', 'material_id', 'codigo', 'descricao', 'quantidade',
        'valor_unitario', 'unidade'];
      const vals = [p.lastID, l.material_id, l.codigo || null, l.descricao || 'Linha do pedido',
        l.quantidade, l.valor_unitario != null ? l.valor_unitario : 10, 'UN'];
      if (explicita) { cols.push('quantidade_recebida'); vals.push(l.recebida); }
      const r = await dbRun(db, `INSERT INTO itens_pedido_compra (${cols.join(',')})
        VALUES (${cols.map(() => '?').join(',')})`, vals);
      ids.push(r.lastID);
    }
    return { id: p.lastID, numero, linhas: ids };
  }

  const post = (body) => request(app).post('/api/almoxarifado/recebimentos').send(body);
  // ⚠️ MODO DE FALHA 3 DESTA ETAPA: todo cenario le a linha do pedido PELO ID que o INSERT
  // devolveu e afirma o VALOR — nunca "nao deu erro".
  const recebidaDaLinha = async (linhaId) => (await dbGet(db,
    'SELECT quantidade_recebida FROM itens_pedido_compra WHERE id = ?', [linhaId])).quantidade_recebida;
  const estoqueDoMaterial = async (matId) => (await dbGet(db,
    'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId])).quantidade_atual;
  const itensDo = (recId) => dbAll(db, `SELECT id, quantidade_esperada, quantidade_recebida,
    pedido_item_id, entrada_estoque_em FROM recebimentos_material_itens_almoxarifado
    WHERE recebimento_id = ? ORDER BY id`, [recId]);
  const statusDo = async (recId) => (await dbGet(db,
    'SELECT status FROM recebimentos_material_almoxarifado WHERE id = ?', [recId])).status;

  // Caminho (a): o WORKFLOW REAL ate `processar`. Nenhum UPDATE de status a mao — e no `/fiscal`
  // que vive a barreira da Etapa 36, e pular por ali foi o que escondeu o Critical dela.
  async function processarPeloWorkflow(recId) {
    const wf = (acao) => request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`)
      .send({ acao });
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      const r = await wf(acao);
      assert.strictEqual(r.status, 200, `workflow ${acao}: ${JSON.stringify(r.body)}`);
    }
    const fiscal = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`).send({
      nota_fiscal: `NF-E37T3-${recId}`, fornecedor_id: forn.lastID, fornecedor_nome: 'Forn E37 T3',
      data_emissao_nf: '2026-09-10', data_entrada_nf: '2026-09-11', valor_total_nota: 600,
    });
    assert.strictEqual(fiscal.status, 200, JSON.stringify(fiscal.body));
    return wf('processar');
  }

  // Caminho (b): `darEntradaEstoque` DIRETO, para medir idempotencia sem passar pelo workflow.
  async function entrarDireto(recId) {
    const rec = await dbGet(db,
      'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recId]);
    return receiptService.darEntradaEstoque(db, ADMIN, rec, recId, {});
  }

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

  // ── (4) RN-22: o numero certo, no momento certo, pelo caminho do usuario ────────────────────
  await test('(4) RN-22: pedido de 10, recebimento de 6 — 0 ANTES de processar, 6 DEPOIS, e o estoque concorda', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10 }]);

    const criado = await post({
      pedido_compra_id: pedido.id,
      itens: [{ material_id: mat.id, quantidade: 6, quantidade_recebida: 6 }],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const recId = criado.body.id;

    const [item] = await itensDo(recId);
    assert.strictEqual(item.pedido_item_id, pedido.linhas[0],
      'sem o link da T2 nao ha onde somar — o cenario mediria outra coisa');
    // A DIFERENCA que faz a sabotagem 3 legivel: a esperada e o saldo (10) e a recebida e 6. Somar
    // a esperada em vez de `qtd` faria o pedido e o estoque discordarem em 4.
    assert.strictEqual(item.quantidade_esperada, 10);
    assert.strictEqual(item.quantidade_recebida, 6);

    // ANTES: criar documento NAO consome saldo (RN-23). Quem consome e a entrada FISICA.
    assert.strictEqual(await recebidaDaLinha(pedido.linhas[0]), 0,
      'criar o recebimento nao pode somar no pedido — a soma e da entrada fisica');
    const estoqueAntes = await estoqueDoMaterial(mat.id);

    const proc = await processarPeloWorkflow(recId);
    assert.strictEqual(proc.status, 200, JSON.stringify(proc.body));
    assert.strictEqual(await statusDo(recId), 'PROCESSADO');

    assert.strictEqual(await recebidaDaLinha(pedido.linhas[0]), 6,
      'a linha do pedido tem de somar os 6 que entraram no estoque');
    assert.strictEqual(await estoqueDoMaterial(mat.id) - estoqueAntes, 6,
      'as DUAS contas tem de concordar: o pedido soma o MESMO numero que moveu estoque');
  });

  // ── (4b) a linha com `quantidade_recebida` NULL EXPLICITO ───────────────────────────────────
  /**
   * O unico produtor de NULL nesta base, e existe porque producao pode ter linha anterior ao ALTER
   * da Task 1 (ou inserida a mao com NULL). Sem este cenario a sabotagem 4 (tirar o `COALESCE`)
   * seria NO-OP: a coluna nasce com DEFAULT 0 e `0 + 6` nao precisa de COALESCE nenhum. Em SQLite
   * `null + 6` e NULL — a linha ficaria com o saldo NULL para sempre, e o saldo NULL desliga a
   * barreira da T2 em silencio (`Number.isFinite(NaN)` e falso, toda comparacao vira falsa).
   */
  await test('(4b) linha do pedido com quantidade_recebida NULL explicito: depois de processar vale 6, nao NULL', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10, recebida: null }]);
    assert.strictEqual(await recebidaDaLinha(pedido.linhas[0]), null,
      'controle: o cenario exige a coluna NULL de verdade, senao nao mede o COALESCE');

    const criado = await post({
      pedido_compra_id: pedido.id,
      itens: [{ material_id: mat.id, quantidade: 6, quantidade_recebida: 6 }],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));

    const proc = await processarPeloWorkflow(criado.body.id);
    assert.strictEqual(proc.status, 200, JSON.stringify(proc.body));
    assert.strictEqual(await recebidaDaLinha(pedido.linhas[0]), 6,
      'null + 6 em SQLite e NULL: sem COALESCE a linha mais antiga do acervo nunca soma');
  });

  // ── (5) IDEMPOTENCIA: o defeito classico desta funcao ───────────────────────────────────────
  await test('(5) reprocessar a MESMA nota: continua 6, nao 12', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10 }]);
    const criado = await post({
      pedido_compra_id: pedido.id,
      itens: [{ material_id: mat.id, quantidade: 6, quantidade_recebida: 6 }],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));

    // Caminho (b): duas passadas por `darEntradaEstoque`, que e exatamente o que o
    // reprocessamento (ou dois cliques em "Processar Nota") faz.
    await entrarDireto(criado.body.id);
    assert.strictEqual(await recebidaDaLinha(pedido.linhas[0]), 6, 'a 1a passada soma 6');
    const [item] = await itensDo(criado.body.id);
    assert.ok(item.entrada_estoque_em, 'controle: a 1a passada tem de ter RECLAMADO o item');

    await entrarDireto(criado.body.id);
    assert.strictEqual(await recebidaDaLinha(pedido.linhas[0]), 6,
      'somar FORA do claim `entrada_estoque_em IS NULL` faria 6 virar 12 — o defeito que esta '
      + 'funcao ja pagou uma vez (10 viraram 20)');
    // A metade que prova que o claim e quem segura: o estoque tambem nao dobrou.
    assert.strictEqual(await estoqueDoMaterial(mat.id), 6,
      'controle: se o estoque tivesse dobrado, o cenario mediria o claim e nao o acumulador');
  });

  // ── (6) O OUTRO caminho de entrada, o que nenhum teste de hoje cobria ───────────────────────
  await test('(6) POST /recebimentos/:id/aprovar (sem processarNota): o pedido tambem soma', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10 }]);
    const criado = await post({
      pedido_compra_id: pedido.id,
      itens: [{ material_id: mat.id, quantidade: 6, quantidade_recebida: 6 }],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));

    // Status nasce RECEBIDO (fora de [EM_ENTRADA_NF, ENCAMINHADO_FATURAMENTO]), entao
    // `aprovarRecebimento` cai no ramo que chama `darEntradaEstoque` DIRETO e grava APROVADO.
    const aprovado = await request(app)
      .post(`/api/almoxarifado/recebimentos/${criado.body.id}/aprovar`).send({});
    assert.strictEqual(aprovado.status, 200, JSON.stringify(aprovado.body));
    assert.strictEqual(await statusDo(criado.body.id), 'APROVADO',
      'controle: se este ramo delegasse para processarNota, o cenario nao mediria o OUTRO caminho');

    assert.strictEqual(await recebidaDaLinha(pedido.linhas[0]), 6,
      'somar dentro de processarNota deixaria ESTE caminho creditando estoque sem contar ao pedido');
    assert.strictEqual(await estoqueDoMaterial(mat.id), 6);
  });

  // ── (7) RN-23: documento aberto nao consome saldo ───────────────────────────────────────────
  await test('(7) RN-23: dois recebimentos de 5, so o primeiro processado — a linha soma 5, nao 10', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10 }]);
    const corpo = { pedido_compra_id: pedido.id,
      itens: [{ material_id: mat.id, quantidade: 5, quantidade_recebida: 5 }] };

    const um = await post(corpo);
    assert.strictEqual(um.status, 201, JSON.stringify(um.body));
    const dois = await post(corpo);
    assert.strictEqual(dois.status, 201,
      'dois documentos de 5 contra um pedido de 10 sao legitimos: o saldo so anda na entrada fisica');

    const proc = await processarPeloWorkflow(um.body.id);
    assert.strictEqual(proc.status, 200, JSON.stringify(proc.body));

    assert.strictEqual(await recebidaDaLinha(pedido.linhas[0]), 5,
      'o segundo documento existe mas NAO entrou no estoque — ele nao pode entrar na conta');
    assert.strictEqual(await statusDo(dois.body.id), 'RECEBIDO',
      'controle: o segundo tem de estar parado em RECEBIDO (nao existe status CANCELADO de '
      + 'recebimento — medido; este e o equivalente alcancavel)');
    assert.strictEqual(await estoqueDoMaterial(mat.id), 5);
  });

  // ── (8) os dois processados somam os dois ───────────────────────────────────────────────────
  await test('(8) dois recebimentos de 5, os DOIS processados: a linha do pedido fecha em 10', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10 }]);
    const corpo = { pedido_compra_id: pedido.id,
      itens: [{ material_id: mat.id, quantidade: 5, quantidade_recebida: 5 }] };

    const um = await post(corpo);
    const dois = await post(corpo);
    assert.strictEqual(um.status, 201, JSON.stringify(um.body));
    assert.strictEqual(dois.status, 201, JSON.stringify(dois.body));

    // Caminho (b) nos dois: o que se mede aqui e a SOMA de duas entradas, nao o workflow.
    await entrarDireto(um.body.id);
    assert.strictEqual(await recebidaDaLinha(pedido.linhas[0]), 5);
    await entrarDireto(dois.body.id);
    assert.strictEqual(await recebidaDaLinha(pedido.linhas[0]), 10,
      'o acumulador SOMA (`+ ?`); um UPDATE que SOBRESCREVE deixaria o pedido em 5 para sempre');
    assert.strictEqual(await estoqueDoMaterial(mat.id), 10);
  });

  // ── (9) NAO-FATAL: a contagem do pedido nao pode derrubar a entrada de nota ─────────────────
  /**
   * O lugar combinado para o UPDATE e DEPOIS de `entrouFisicamente = true`, e dali para baixo o
   * `catch` de `darEntradaEstoque` NAO devolve o claim. Se o UPDATE lancar — e o modulo ASSUME que
   * as tabelas de compras podem nao existir (`listarPedidosCompraAux` e `gerarContaPagar` tem
   * guarda de tabela ausente) —, o throw faria `processarNota` falhar DEPOIS de o estoque ter
   * entrado: material no estoque, documento fora de PROCESSADO e o reprocessamento PULANDO o item
   * pelo claim. Perder a contagem com um `warn` e reparavel por SQL; travar a nota nao e.
   */
  await test('(9) com itens_pedido_compra INDISPONIVEL o processar continua 200/PROCESSADO e o estoque sobe', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10 }]);
    const criado = await post({
      pedido_compra_id: pedido.id,
      itens: [{ material_id: mat.id, quantidade: 6, quantidade_recebida: 6 }],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const [item] = await itensDo(criado.body.id);
    assert.strictEqual(item.pedido_item_id, pedido.linhas[0],
      'controle: sem o link o UPDATE nem seria tentado e o cenario passaria por vacuidade');

    // A tabela sai de cena DEPOIS da criacao (a criacao le o saldo) e ANTES do processar.
    await dbRun(db, 'ALTER TABLE itens_pedido_compra RENAME TO itens_pedido_compra_off');
    let proc;
    try {
      proc = await processarPeloWorkflow(criado.body.id);
    } finally {
      await dbRun(db, 'ALTER TABLE itens_pedido_compra_off RENAME TO itens_pedido_compra');
    }

    assert.strictEqual(proc.status, 200,
      `a soma no pedido e NAO-FATAL: ${JSON.stringify(proc.body)}`);
    assert.strictEqual(await statusDo(criado.body.id), 'PROCESSADO');
    assert.strictEqual(await estoqueDoMaterial(mat.id), 6, 'o estoque entrou mesmo assim');
    // O preco declarado (letra G): a contagem daquele pedido fica por fazer, com um `warn` no
    // console — reparavel por SQL, ao contrario de uma nota travada.
    assert.strictEqual(await recebidaDaLinha(pedido.linhas[0]), 0,
      'o preco do nao-fatal e a contagem perdida, e ela e o que o warn anuncia');
  });

  // ── (10) (revisao final, F5) o `pedido_item_id` HONRADO: a soma cai na linha que o payload disse ─
  /**
   * Achado F5 da revisao da branch: nenhum cenario da etapa media o `pedido_item_id` explicito
   * sendo OBEDECIDO. Os que existiam mediam o contrario — id forjado de outro pedido (cenario (6)
   * de `recebimentoExcedentePedido`) e id de outro material (cenario (16), da mesma onda) — e o
   * caminho normal da tela (a T5 manda `pedido_item_id` em toda linha) ficava sem prova. Com duas
   * linhas PENDENTES do mesmo material, uma regressao para "menor id com saldo" poria as duas
   * contagens na linha C e ficaria VERDE em tudo: a regua do saldo e agregada por material, e o
   * estoque sobe igual. Quem sente e o PEDIDO — a linha D nunca fecharia, e a tela continuaria
   * oferecendo 6 de um material que ja chegou.
   *
   * As duas metades (um item explicito na linha D; e dois itens com ids DISTINTOS) porque a
   * primeira sozinha nao distingue "obedeceu o id" de "resolveu pelo unico item do payload".
   */
  await test('(10) RN-22 com duas linhas pendentes do mesmo material: a soma cai na linha do pedido_item_id enviado', async () => {
    const mat = await novoMaterial();
    // C (menor id, saldo 10) e D (saldo 6). "Menor id com saldo" sempre escolheria C.
    const pedido = await novoPedido([
      { material_id: mat.id, quantidade: 10 },
      { material_id: mat.id, quantidade: 6 },
    ]);
    const [linhaC, linhaD] = pedido.linhas;

    const criado = await post({
      pedido_compra_id: pedido.id,
      itens: [{ material_id: mat.id, pedido_item_id: linhaD, quantidade: 6, quantidade_recebida: 6 }],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const [item] = await itensDo(criado.body.id);
    assert.strictEqual(item.pedido_item_id, linhaD,
      'o link gravado tem de ser a linha que o payload declarou, nao a de menor id com saldo');

    const proc = await processarPeloWorkflow(criado.body.id);
    assert.strictEqual(proc.status, 200, JSON.stringify(proc.body));
    assert.strictEqual(await recebidaDaLinha(linhaD), 6, 'a linha D e que recebeu os 6');
    assert.strictEqual(await recebidaDaLinha(linhaC), 0,
      'somar em C fecharia a linha errada: D continuaria sendo oferecida com saldo que ja chegou');

    // ── segunda metade: DOIS itens, ids DISTINTOS, cada um na sua linha ────────────────────────
    const outro = await novoPedido([
      { material_id: mat.id, quantidade: 10 },
      { material_id: mat.id, quantidade: 6 },
    ]);
    const [outroC, outroD] = outro.linhas;
    const dois = await post({
      pedido_compra_id: outro.id,
      itens: [
        { material_id: mat.id, pedido_item_id: outroC, quantidade: 4, quantidade_recebida: 4 },
        { material_id: mat.id, pedido_item_id: outroD, quantidade: 6, quantidade_recebida: 6 },
      ],
    });
    assert.strictEqual(dois.status, 201, JSON.stringify(dois.body));
    assert.deepStrictEqual((await itensDo(dois.body.id)).map((i) => i.pedido_item_id),
      [outroC, outroD], 'dois itens do MESMO material tem de guardar DOIS links diferentes');

    const proc2 = await processarPeloWorkflow(dois.body.id);
    assert.strictEqual(proc2.status, 200, JSON.stringify(proc2.body));
    assert.strictEqual(await recebidaDaLinha(outroC), 4);
    assert.strictEqual(await recebidaDaLinha(outroD), 6);
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
