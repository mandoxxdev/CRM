const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { initSchema } = require('../../services/almoxarifado/schema');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };

let seq = 0;
async function novoMaterial(db, qtd = 100) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',?,1)`,
    [`MIG-${seq}`, `Material migracao ${seq}`, qtd]);
  return r.lastID;
}
const colunas = (db) => dbAll(db, `SELECT name FROM pragma_table_info('estoque_saldo_almoxarifado')`);

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('saldo referencia o lote por id, nao por texto', async () => {
    const nomes = (await colunas(db)).map((c) => c.name);
    assert.ok(nomes.includes('lote_id'), 'faltou a coluna lote_id');
    assert.ok(!nomes.includes('lote'), 'a coluna lote TEXT deveria ter sido removida do saldo');
  });

  await test('as tres colunas de retencao sem escritor sumiram do saldo', async () => {
    const nomes = (await colunas(db)).map((c) => c.name);
    for (const morta of ['quantidade_reservada', 'quantidade_bloqueada', 'quantidade_em_inspecao']) {
      assert.ok(!nomes.includes(morta), `${morta} continua em estoque_saldo_almoxarifado`);
    }
  });

  await test('a chave unica impede duplicata mesmo com localizacao e lote nulos', async () => {
    const mat = await novoMaterial(db);
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, quantidade) VALUES (?, 10)', [mat]);
    await assert.rejects(
      () => dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, quantidade) VALUES (?, 20)', [mat]),
      /UNIQUE|constraint/i,
      'dois NULL sao distintos para UNIQUE no SQLite — o indice com COALESCE deveria barrar');
  });

  await test('getOrCreateSaldo chaveia por lote_id e nao duplica', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'MIG-L1' });
    const a = await stockService.getOrCreateSaldo(db, mat, null, lote.id);
    const b = await stockService.getOrCreateSaldo(db, mat, null, lote.id);
    assert.strictEqual(a.id, b.id, 'criou duas linhas para o mesmo lote');
    const semLote = await stockService.getOrCreateSaldo(db, mat, null, null);
    assert.notStrictEqual(semLote.id, a.id, 'saldo sem lote e saldo com lote sao linhas diferentes');
  });

  // Nome precisa ser honesto sobre o que cobre: o banco do createTestApp já nasce na forma NOVA
  // (initSchema já rodou uma vez dentro dele), então migrateSaldoLoteId sempre sai pelo
  // early-return aqui — isto prova só que rodar de novo sobre um banco JÁ migrado não quebra.
  // Quem prova a reconstrução em si (o corpo que só roda uma vez, em produção) é o teste
  // "migracao reconstroi banco antigo" abaixo, que monta o shape pré-Etapa-6 à mão.
  await test('initSchema roda duas vezes sem quebrar quando o banco ja nasceu na forma nova', async () => {
    await initSchema(db);
    await initSchema(db);
    const nomes = (await colunas(db)).map((c) => c.name);
    assert.ok(nomes.includes('lote_id'));
    assert.ok(!nomes.includes('quantidade_bloqueada'));
  });

  // ── Corpo da migração de verdade (achado de review, fix round 1) ──────────────────────────
  // O teste acima nunca exercita schema.js:migrateSaldoLoteId além do early-return, porque
  // createTestApp já entrega um banco na forma nova. Este teste monta o shape ANTIGO (pré-Etapa 6)
  // à mão — `lote TEXT`, as três colunas de retenção, a UNIQUE de tabela que deixa passar
  // NULL x NULL — com dados que espelham o achado real da sonda (linhas com lote NULL que
  // colidem na chave nova) e um caso que a sonda NÃO viu mas dev pode ter (lote em texto livre).
  // É o único trecho do diff da Task 2 capaz de destruir dado, e roda uma única vez em produção,
  // sem repetição possível — por isso precisa de cobertura direta, não só de um teste com nome
  // parecido que nunca entra nesse caminho.
  await test('migracao reconstroi banco antigo: converge, preserva quantidade das duplicatas e converte lote em texto', async () => {
    const dbAntigo = new sqlite3.Database(':memory:');
    try {
      // Minimo de materiais_almoxarifado que a migração precisa (ela não lê a tabela, só o FK é
      // conceitual — mas ensureBaseTables/ALTER rodam sobre ela mais adiante no initSchema).
      await dbRun(dbAntigo, `CREATE TABLE materiais_almoxarifado (
        id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT UNIQUE NOT NULL, nome TEXT NOT NULL,
        quantidade_atual REAL DEFAULT 0, ativo INTEGER DEFAULT 1
      )`);
      const matId = (await dbRun(dbAntigo,
        `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual) VALUES ('OLD-1','Material antigo',15)`)).lastID;

      await dbRun(dbAntigo, `CREATE TABLE estoque_saldo_almoxarifado (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        material_id INTEGER NOT NULL,
        localizacao_id INTEGER,
        lote TEXT,
        quantidade REAL DEFAULT 0,
        quantidade_reservada REAL DEFAULT 0,
        quantidade_bloqueada REAL DEFAULT 0,
        quantidade_em_inspecao REAL DEFAULT 0,
        custo_medio REAL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(material_id, localizacao_id, lote)
      )`);
      // Duas linhas que COLIDEM na chave nova (mesmo material, localizacao NULL, lote NULL) mas
      // que a UNIQUE antiga deixou passar — dois NULL são distintos para UNIQUE no SQLite. É
      // exatamente o achado da sonda em produção (3 linhas, todas lote IS NULL).
      await dbRun(dbAntigo,
        'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote, quantidade) VALUES (?, NULL, NULL, 10)', [matId]);
      await dbRun(dbAntigo,
        'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote, quantidade) VALUES (?, NULL, NULL, 5)', [matId]);
      // Uma linha com lote em texto livre — produção não tinha nenhuma, mas banco de dev pode
      // ter, e perder o dado em silêncio seria pior que a coluna morta que está sendo removida.
      await dbRun(dbAntigo,
        "INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote, quantidade) VALUES (?, NULL, 'L-777', 20)", [matId]);

      await initSchema(dbAntigo);

      // 1) as colunas convergem com o banco novo (incluindo o índice único)
      const colsAntigo = (await colunas(dbAntigo)).map((c) => c.name).sort();
      const colsNovo = (await colunas(db)).map((c) => c.name).sort();
      assert.deepStrictEqual(colsAntigo, colsNovo, 'banco migrado nao convergiu para o mesmo shape do banco novo');
      const indices = await dbAll(dbAntigo,
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='estoque_saldo_almoxarifado'`);
      assert.ok(indices.some((i) => i.name === 'idx_saldo_almox_chave'), 'indice unico nao foi criado na reconstrucao');

      // 2) o SUM preservou a quantidade das duas linhas duplicadas (nao descartou uma)
      const semLote = await dbGet(dbAntigo,
        'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id IS NULL AND lote_id IS NULL', [matId]);
      assert.ok(semLote, 'linha sem lote sumiu na reconstrucao');
      assert.strictEqual(semLote.quantidade, 15, 'SUM das duas linhas duplicadas deveria preservar 10+5=15, nao descartar uma');

      // 3) o texto virou linha em lotes_almoxarifado, com lote_id apontando para ela
      const loteConvertido = await dbGet(dbAntigo,
        `SELECT * FROM lotes_almoxarifado WHERE material_id = ? AND codigo = 'L-777'`, [matId]);
      assert.ok(loteConvertido, 'lote em texto livre nao foi convertido para lotes_almoxarifado');
      const linhaComLote = await dbGet(dbAntigo,
        'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id = ?', [matId, loteConvertido.id]);
      assert.ok(linhaComLote, 'nenhuma linha de saldo aponta lote_id para o lote convertido');
      assert.strictEqual(linhaComLote.quantidade, 20, 'quantidade da linha com lote convertido deveria ser preservada (20)');

      // 4) o indice unico rejeita duplicata depois da migracao
      await assert.rejects(
        () => dbRun(dbAntigo, 'INSERT INTO estoque_saldo_almoxarifado (material_id, quantidade) VALUES (?, 999)', [matId]),
        /UNIQUE|constraint/i,
        'indice unico nao esta ativo no banco reconstruido');

      // 5) initSchema mais duas vezes nao reprocessa (o ledger marca a migracao como aplicada)
      const antes = await dbGet(dbAntigo,
        'SELECT COUNT(*) as n, SUM(quantidade) as total FROM estoque_saldo_almoxarifado WHERE material_id = ?', [matId]);
      await initSchema(dbAntigo);
      await initSchema(dbAntigo);
      const depois = await dbGet(dbAntigo,
        'SELECT COUNT(*) as n, SUM(quantidade) as total FROM estoque_saldo_almoxarifado WHERE material_id = ?', [matId]);
      assert.strictEqual(depois.n, antes.n, 'reexecutar initSchema mudou a quantidade de linhas (reprocessou a migracao)');
      assert.strictEqual(depois.total, antes.total, 'reexecutar initSchema mudou o total (reprocessou a migracao)');
    } finally {
      await new Promise((resolve) => dbAntigo.close(resolve));
    }
  });

  // REGRESSAO da Etapa 5: AJUSTE com localizacao recalcula quantidade_atual (hoje: aplica o delta
  // da propria linha — ver stockService.js). A retencao mora em materiais_almoxarifado e tem de
  // continuar intacta depois de mexer no saldo por localizacao.
  await test('AJUSTE por localizacao continua nao evaporando a quarentena', async () => {
    const loc = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('MIG-L','L')`)).lastID;
    const mat = await novoMaterial(db, 100);
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,100)', [mat, loc]);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'QUARENTENA', quantidade: 100, justificativa: 'material critico aguardando inspecao' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 100, localizacao_destino_id: loc, justificativa: 'contagem' });
    const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_em_inspecao, 100, 'AJUSTE liberou a quarentena');
  });

  // ── Leitor órfão no cliente (achado de review, fix round 1) ───────────────────────────────
  // consultarSaldosPorLocalizacao faz SELECT s.* — sem JOIN em lotes_almoxarifado, o campo
  // `lote` (texto) que ExtratoMaterialModal.js le simplesmente sumiu da resposta (virou
  // undefined), porque a coluna agora e lote_id. Hoje isso nao muda nada visivel (lote_id
  // sempre null, ver Task 3), mas sem o JOIN a coluna "Lote" do extrato ficaria em "—" para
  // sempre assim que a Task 3 comecasse a gravar o vinculo, em silencio.
  await test('consultarSaldosPorLocalizacao devolve o codigo do lote (nao so o lote_id)', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'MIG-L2' });
    await stockService.getOrCreateSaldo(db, mat, null, lote.id);
    const saldos = await stockService.consultarSaldosPorLocalizacao(db, mat);
    const linha = saldos.find((s) => s.lote_id === lote.id);
    assert.ok(linha, 'saldo com lote_id preenchido nao apareceu na consulta');
    assert.strictEqual(linha.lote, 'MIG-L2', 'campo lote deveria trazer o codigo do lote, nao ficar undefined/null');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
