/**
 * SQLite concurrency unit tests (in-memory)
 */
const sqlite3 = require('sqlite3').verbose();
const { configureSqlite, wrapDatabase, isSqliteBusy } = require('../services/sqliteConcurrency');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
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

  console.log(`\nsqliteConcurrency: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
