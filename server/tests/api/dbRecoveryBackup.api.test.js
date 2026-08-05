/**
 * Backup do SQLite: nome dos acompanhantes (-wal/-shm) e limpeza dos antigos.
 *
 * Teste de serviço, não de rota — mora aqui porque o runner (tests/api/run-all.js) só
 * descobre arquivos `*.api.test.js`, e cobertura que roda vale mais que cobertura com o
 * nome perfeito.
 *
 * Bug coberto (dbRecovery.js): `database-${stamp}${suffix || '.sqlite'}` gerava
 * `database-X.sqlite` para o banco, mas `database-X-wal` / `database-X-shm` para os
 * acompanhantes — SEM o `.sqlite` no meio. O SQLite pareia `F` com `F-wal`, então
 * `database-X.sqlite` procurava `database-X.sqlite-wal`, que não existia. Duas
 * consequências:
 *   1. o backup era INCOMPLETO: transações que estavam só no WAL não voltavam na
 *      restauração, mesmo com o arquivo ali do lado;
 *   2. pruneOldBackups só apaga o que termina em `.sqlite`, então os órfãos acumulavam
 *      para sempre (no repo real: 154 acompanhantes para 10 backups).
 *
 * NOTA DE SETUP: o backup tem de ser tirado com a conexão ABERTA. Fechar a conexão faz
 * checkpoint e apaga o -wal, e aí o teste passaria vazio — o dado já estaria no .sqlite e
 * não haveria nada para o acompanhante provar. Conexão aberta é também o cenário real: o
 * backup roda no startup, com a aplicação de pé.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { backupDatabaseFiles, pruneOldBackups } = require('../../services/dbRecovery');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const run = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, (e) => (e ? rej(e) : res())));
const get = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const close = (db) => new Promise((res) => db.close(res));

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dbrec-'));

/**
 * Banco em WAL com uma linha COMMITADA que ainda mora no -wal. Devolve a conexão ABERTA —
 * quem chama fecha depois de tirar o backup.
 */
async function bancoComDadoNoWal(dbPath) {
  const db = new sqlite3.Database(dbPath);
  await run(db, 'PRAGMA journal_mode=WAL');
  await run(db, 'CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
  await run(db, "INSERT INTO t (v) VALUES ('gravado-no-wal')");
  return db;
}

(async () => {
  // ── 0. Controle do setup: sem isto, os testes abaixo passariam vazios ──
  await test('[setup] com a conexão aberta, o dado fica no -wal e NÃO no .sqlite', async () => {
    const dir = tmpDir();
    const dbPath = path.join(dir, 'database.sqlite');
    const db = await bancoComDadoNoWal(dbPath);

    assert.ok(fs.existsSync(dbPath + '-wal'), '-wal deveria existir com a conexão aberta');
    assert.ok(fs.statSync(dbPath + '-wal').size > 0, '-wal está vazio: o dado não está lá');

    // cópia só do .sqlite (sem acompanhantes) não deve ver a linha
    const soDb = path.join(dir, 'apenas-db.sqlite');
    fs.copyFileSync(dbPath, soDb);
    const isolado = new sqlite3.Database(soDb, sqlite3.OPEN_READONLY);
    let achou = null;
    try { achou = await get(isolado, "SELECT v FROM t WHERE v = 'gravado-no-wal'"); }
    catch { achou = null; }  // sem o WAL a própria tabela pode não existir
    await close(isolado);
    assert.ok(!achou, 'o dado já estava no .sqtite — setup não isolou o WAL');

    await close(db);
  });

  // ── 1. Nomeação dos acompanhantes ──
  await test('acompanhantes são nomeados <base>.sqlite-wal / -shm (parear com o backup)', async () => {
    const dir = tmpDir();
    const dbPath = path.join(dir, 'database.sqlite');
    const db = await bancoComDadoNoWal(dbPath);

    const copiados = backupDatabaseFiles(dbPath);
    await close(db);

    const nomes = copiados.map((f) => path.basename(f));
    assert.ok(copiados.length >= 2, `esperava banco + acompanhantes, veio ${JSON.stringify(nomes)}`);

    const principal = nomes.find((n) => n.endsWith('.sqlite'));
    assert.ok(principal, `nenhum .sqlite entre ${JSON.stringify(nomes)}`);
    const base = principal.replace(/\.sqlite$/, '');

    assert.ok(nomes.includes(`${base}.sqlite-wal`),
      `esperava ${base}.sqlite-wal, veio ${JSON.stringify(nomes)}`);
    assert.ok(!nomes.includes(`${base}-wal`), `acompanhante órfão ainda gerado: ${base}-wal`);
  });

  // ── 2. O que realmente importa: o backup restaura o dado do WAL ──
  await test('backup restaurado recupera a linha que estava SÓ no WAL', async () => {
    const dir = tmpDir();
    const dbPath = path.join(dir, 'database.sqlite');
    const db = await bancoComDadoNoWal(dbPath);

    const copiados = backupDatabaseFiles(dbPath);
    await close(db);

    const backupSqlite = copiados.find((f) => f.endsWith('.sqlite'));
    assert.ok(backupSqlite, 'backup .sqlite não foi criado');

    const restaurado = new sqlite3.Database(backupSqlite, sqlite3.OPEN_READONLY);
    const row = await get(restaurado, "SELECT v FROM t WHERE v = 'gravado-no-wal'");
    await close(restaurado);

    assert.ok(row, 'a linha commitada no WAL não voltou na restauração — backup incompleto');
    assert.strictEqual(row.v, 'gravado-no-wal');
  });

  // ── 3. Limpeza: acompanhantes vão junto com o backup a que pertencem ──
  await test('pruneOldBackups remove os acompanhantes junto com o .sqlite descartado', async () => {
    const dir = tmpDir();
    const dbPath = path.join(dir, 'database.sqlite');
    const db = await bancoComDadoNoWal(dbPath);

    for (let i = 0; i < 3; i++) {
      const c = backupDatabaseFiles(dbPath);
      const principal = c.find((f) => f.endsWith('.sqlite'));
      const t = new Date(2020, 0, 1 + i);
      fs.utimesSync(principal, t, t);
      await new Promise((r) => setTimeout(r, 1100));  // stamp tem resolução de segundo
    }
    await close(db);

    const backupDir = path.join(dir, 'backups');
    const antes = fs.readdirSync(backupDir);
    assert.strictEqual(antes.filter((f) => f.endsWith('.sqlite')).length, 3, `setup: ${JSON.stringify(antes)}`);
    assert.ok(antes.some((f) => f.endsWith('-wal')), 'setup: nenhum acompanhante foi copiado');

    pruneOldBackups(dbPath, 1);

    const depois = fs.readdirSync(backupDir);
    const sqlites = depois.filter((f) => f.endsWith('.sqlite'));
    assert.strictEqual(sqlites.length, 1, `deveria sobrar 1 backup, sobraram ${JSON.stringify(depois)}`);

    const baseMantida = sqlites[0].replace(/\.sqlite$/, '');
    depois.filter((f) => f.endsWith('-wal') || f.endsWith('-shm')).forEach((f) => {
      assert.ok(f.startsWith(baseMantida),
        `acompanhante órfão sobrou após o prune: ${f} (backup mantido: ${sqlites[0]})`);
    });
  });

  await test('pruneOldBackups não apaga nada quando cabe no limite', async () => {
    const dir = tmpDir();
    const dbPath = path.join(dir, 'database.sqlite');
    const db = await bancoComDadoNoWal(dbPath);
    backupDatabaseFiles(dbPath);
    await close(db);

    const backupDir = path.join(dir, 'backups');
    const antes = fs.readdirSync(backupDir).sort();
    pruneOldBackups(dbPath, 10);
    assert.deepStrictEqual(fs.readdirSync(backupDir).sort(), antes);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
