/**
 * SQLite concurrency unit tests (in-memory)
 *
 * SQLITE_BUSY_TIMEOUT_MS=0 ANTES do require: o modulo le a env uma vez, no load.
 * Com busy_timeout zero o SQLITE_BUSY volta na hora, sem esperar o lock — e os
 * cenarios de retry da RN-05 deixam de depender de tempo de parede.
 */
process.env.SQLITE_BUSY_TIMEOUT_MS = '0';

const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { configureSqlite, wrapDatabase, isSqliteBusy } = require('../services/sqliteConcurrency');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** run sem passar pelo wrapper (usado no setup e na conexao rival) */
function runCru(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getCru(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function fecharCru(db) {
  return new Promise((resolve) => db.close(() => resolve()));
}

/**
 * Monta um banco em ARQUIVO (":memory:" nao pode ser travado por outra conexao),
 * com uma conexao embrulhada e uma conexao "rival" que segura o lock de escrita.
 */
async function comLockDeEscrita(nome, corpo) {
  const arquivo = path.join(os.tmpdir(), `orion-rn05-${nome}-${process.pid}-${Date.now()}.db`);
  const principal = new sqlite3.Database(arquivo);
  const rival = new sqlite3.Database(arquivo);
  principal.configure('busyTimeout', 0);
  rival.configure('busyTimeout', 0);
  try {
    await runCru(principal, 'CREATE TABLE t (id INTEGER PRIMARY KEY, ativo INTEGER)');
    await runCru(principal, 'INSERT INTO t (id, ativo) VALUES (1, 1)');
    wrapDatabase(principal);
    // BEGIN IMMEDIATE toma o lock de escrita: qualquer UPDATE pela outra conexao
    // volta SQLITE_BUSY na hora (busy_timeout = 0).
    await runCru(rival, 'BEGIN IMMEDIATE');
    await corpo({ principal, rival });
  } finally {
    try {
      await runCru(rival, 'ROLLBACK');
    } catch (e) {
      /* ja soltou */
    }
    await fecharCru(principal);
    await fecharCru(rival);
    for (const sufixo of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(arquivo + sufixo);
      } catch (e) {
        /* nao existe */
      }
    }
  }
}

async function run() {
  let passed = 0;
  let failed = 0;

  const test = async (name, fn) => {
    try {
      await fn();
      passed += 1;
      console.log(`  OK ${name}`);
    } catch (e) {
      failed += 1;
      console.error(`  FAIL ${name}:`, e.message);
    }
  };

  await test('isSqliteBusy detects lock messages', () => {
    assert(isSqliteBusy({ code: 'SQLITE_BUSY' }));
    assert(isSqliteBusy(new Error('database is locked')));
    assert(!isSqliteBusy(new Error('no such table')));
  });

  await test('wrapDatabase preserves run callback this.lastID', () => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(':memory:');
      configureSqlite(db);
      wrapDatabase(db);
      db.serialize(() => {
        db.run('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
        db.run('INSERT INTO t (v) VALUES (?)', ['x'], function (err) {
          if (err) return reject(err);
          assert(this.lastID === 1, `expected lastID 1, got ${this.lastID}`);
          db.close(() => resolve());
        });
      });
    });
  });

  await test('concurrent reads succeed on wrapped in-memory db', () => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(':memory:');
      wrapDatabase(db);
      db.serialize(() => {
        db.run('CREATE TABLE t2 (id INTEGER PRIMARY KEY)');
        db.run('INSERT INTO t2 (id) VALUES (1)', [], (err) => {
          if (err) return reject(err);
          let pending = 20;
          for (let i = 0; i < 20; i += 1) {
            db.get('SELECT id FROM t2 WHERE id = 1', [], (err2, row) => {
              if (err2) return reject(err2);
              assert(row && row.id === 1);
              pending -= 1;
              if (pending === 0) db.close(() => resolve());
            });
          }
        });
      });
    });
  });

  // ---------------------------------------------------------------------------
  // RN-05: o retry de SQLITE_BUSY e TRANSPARENTE para quem pediu a escrita.
  // O callback e chamado UMA vez, na tentativa final. A assercao de peso e a
  // CONTAGEM: sem ela o cenario passa com o defeito presente, porque o ultimo
  // valor entregue ao callback ja era o certo — o problema e o que veio ANTES.
  // ---------------------------------------------------------------------------

  await test('RN-05 db.run: retry bem-sucedido chama o callback UMA vez, sem erro', async () => {
    await comLockDeEscrita('ok', async ({ principal, rival }) => {
      const chamadas = [];
      principal.run('UPDATE t SET ativo = 0 WHERE id = 1', [], function (err) {
        chamadas.push({
          err: err ? err.code || err.message : null,
          changes: this ? this.changes : undefined,
          lastID: this ? this.lastID : undefined,
        });
      });

      // solta o lock a tempo de a 3a tentativa (t~150ms) passar
      await esperar(120);
      await runCru(rival, 'COMMIT');
      await esperar(900);

      const resumo = JSON.stringify(chamadas);
      assert(
        chamadas.length === 1,
        `callback de quem pediu a escrita foi chamado ${chamadas.length} vezes, esperado 1 — ${resumo}`
      );
      assert(chamadas[0].err === null, `callback recebeu erro na tentativa final: ${resumo}`);
      // se o conserto perder o `this` do sqlite3, dbRun() do almoxarifado quebra
      assert(
        chamadas[0].changes === 1,
        `this.changes deveria ser 1 na tentativa final, veio ${chamadas[0].changes} — ${resumo}`
      );

      const linha = await getCru(rival, 'SELECT ativo FROM t WHERE id = 1');
      assert(linha && linha.ativo === 0, 'a escrita nao chegou ao banco depois do retry');
    });
  });

  await test('RN-05 db.run: quando TODAS as tentativas falham, o erro chega UMA vez', async () => {
    await comLockDeEscrita('erro', async ({ principal }) => {
      const chamadas = [];
      principal.run('UPDATE t SET ativo = 0 WHERE id = 1', [], function (err) {
        chamadas.push(err ? err.code || err.message : null);
      });

      // lock nunca e solto: 5 tentativas (t = 0, 50, 150, 350, 750ms)
      await esperar(1500);

      const resumo = JSON.stringify(chamadas);
      assert(
        chamadas.length === 1,
        `callback foi chamado ${chamadas.length} vezes, esperado 1 — ${resumo}`
      );
      assert(isSqliteBusy({ code: chamadas[0] }), `callback deveria receber SQLITE_BUSY — ${resumo}`);
    });
  });

  console.log(`\nsqliteConcurrency: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
