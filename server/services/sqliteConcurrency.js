/**
 * SQLite concurrency helpers: PRAGMA tuning, write serialization, SQLITE_BUSY retry.
 */

const BUSY_TIMEOUT_MS = parseInt(process.env.SQLITE_BUSY_TIMEOUT_MS || '30000', 10);
const MAX_RETRIES = parseInt(process.env.SQLITE_MAX_RETRIES || '5', 10);
const RETRY_BASE_MS = 50;

let busyEventCount = 0;
let lastBusyAt = null;

function isSqliteBusy(err) {
  if (!err) return false;
  if (err.code === 'SQLITE_BUSY') return true;
  const msg = String(err.message || '');
  return msg.includes('SQLITE_BUSY') || msg.includes('database is locked');
}

function logBusy(context, attempt, maxRetries) {
  busyEventCount += 1;
  lastBusyAt = new Date().toISOString();
  console.warn(
    `[SQLITE_BUSY] ${context} — retry ${attempt}/${maxRetries} (total events: ${busyEventCount})`
  );
}

function getDbHealthStats() {
  return {
    busy_timeout_ms: BUSY_TIMEOUT_MS,
    busy_events: busyEventCount,
    last_busy_at: lastBusyAt,
  };
}

function configureSqlite(db) {
  if (!db) return;

  db.configure('busyTimeout', BUSY_TIMEOUT_MS);

  db.run('PRAGMA journal_mode = WAL;', (err) => {
    if (err) {
      console.warn('[SQLite] WAL mode unavailable:', err.message);
    } else {
      console.log('[SQLite] WAL mode enabled');
    }
  });

  db.run('PRAGMA synchronous = NORMAL;');
  db.run('PRAGMA cache_size = -64000;');
  db.run('PRAGMA foreign_keys = ON;');
  db.run('PRAGMA temp_store = MEMORY;');
  db.run('PRAGMA mmap_size = 268435456;');

  console.log(`[SQLite] busy_timeout=${BUSY_TIMEOUT_MS}ms, synchronous=NORMAL`);
}

function retryAsync(executor, context) {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const run = () => {
      attempt += 1;
      executor((err, result) => {
        if (err && isSqliteBusy(err) && attempt < MAX_RETRIES) {
          logBusy(context, attempt, MAX_RETRIES);
          const delay = Math.min(RETRY_BASE_MS * Math.pow(2, attempt - 1), 2000);
          setTimeout(run, delay);
          return;
        }
        if (err) reject(err);
        else resolve(result);
      });
    };

    run();
  });
}

/**
 * Serialize writes and retry reads/writes on SQLITE_BUSY.
 * Preserves sqlite3 `this` context on db.run callbacks (lastID / changes).
 */
function wrapDatabase(db) {
  if (!db || db.__orionWrapped) return db;

  let writeChain = Promise.resolve();

  function enqueueWrite(fn) {
    const run = writeChain.then(fn);
    writeChain = run.catch(() => {});
    return run;
  }

  const originalRun = db.run.bind(db);
  const originalGet = db.get.bind(db);
  const originalAll = db.all.bind(db);
  const originalExec = db.exec.bind(db);

  db.run = function patchedRun(sql, params, callback) {
    let p = params;
    let cb = callback;
    if (typeof p === 'function') {
      cb = p;
      p = [];
    }
    if (!Array.isArray(p)) p = p != null ? [p] : [];

    const promise = enqueueWrite(() =>
      retryAsync((done) => {
        originalRun(sql, p, function onRun(err) {
          if (typeof cb === 'function') {
            cb.call(this, err);
          }
          done(err, err ? undefined : this);
        });
      }, `run:${String(sql).slice(0, 80)}`)
    );

    if (typeof cb === 'function') {
      return db;
    }
    return promise;
  };

  db.get = function patchedGet(sql, params, callback) {
    let p = params;
    let cb = callback;
    if (typeof p === 'function') {
      cb = p;
      p = [];
    }
    if (!Array.isArray(p)) p = p != null ? [p] : [];

    const promise = retryAsync((done) => {
      originalGet(sql, p, (err, row) => done(err, row));
    }, `get:${String(sql).slice(0, 80)}`);

    if (typeof cb === 'function') {
      promise.then((row) => cb(null, row)).catch((err) => cb(err, null));
      return db;
    }
    return promise;
  };

  db.all = function patchedAll(sql, params, callback) {
    let p = params;
    let cb = callback;
    if (typeof p === 'function') {
      cb = p;
      p = [];
    }
    if (!Array.isArray(p)) p = p != null ? [p] : [];

    const promise = retryAsync((done) => {
      originalAll(sql, p, (err, rows) => done(err, rows));
    }, `all:${String(sql).slice(0, 80)}`);

    if (typeof cb === 'function') {
      promise.then((rows) => cb(null, rows)).catch((err) => cb(err, null));
      return db;
    }
    return promise;
  };

  db.exec = function patchedExec(sql, callback) {
    const promise = enqueueWrite(() =>
      retryAsync((done) => {
        originalExec(sql, (err) => done(err));
      }, 'exec')
    );

    if (typeof callback === 'function') {
      promise.then(() => callback(null)).catch((err) => callback(err));
      return db;
    }
    return promise;
  };

  db.__orionWrapped = true;
  return db;
}

function installProcessGuards() {
  process.on('unhandledRejection', (reason) => {
    console.error('[FATAL GUARD] unhandledRejection — process kept alive:', reason);
    if (reason && isSqliteBusy(reason)) {
      console.warn('[FATAL GUARD] SQLITE_BUSY in unhandled rejection (non-fatal)');
    }
  });

  process.on('uncaughtException', (err) => {
    console.error('[FATAL GUARD] uncaughtException:', err);
    if (isSqliteBusy(err)) {
      console.warn('[FATAL GUARD] SQLITE_BUSY uncaught — process kept alive');
      return;
    }
    if (process.env.NODE_ENV === 'production') {
      console.error('[FATAL GUARD] Non-SQLite error logged; not calling process.exit');
      return;
    }
  });
}

module.exports = {
  BUSY_TIMEOUT_MS,
  MAX_RETRIES,
  isSqliteBusy,
  configureSqlite,
  wrapDatabase,
  installProcessGuards,
  getDbHealthStats,
};
