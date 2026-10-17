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

/**
 * Etapa 105 (G12, RN-105.05): o WAL entra no PRIMEIRO boot.
 *
 * O index.js chama isto no callback do open, e ANTES do open os modulos ja enfileiraram dezenas de
 * CREATE TABLE IF NOT EXISTS / SELECT em sqlite_master. O PRAGMA ia por `db.run` (nao exclusivo): o
 * driver soltava a fila em paralelo e o PRAGMA caia com outra instrucao ativa na conexao — "cannot
 * change into wal mode from within a transaction". Medido: o banco ficava em `delete` em 6 de 6 boots
 * (nao "entrava no boot seguinte", como o doc dizia), e so virava WAL se um boot ganhasse a corrida.
 *
 * `db.exec` e exclusivo no driver (`Schedule(..., exclusive = true)`): no callback do open nada roda
 * ainda (`pending == 0`), ele sai na hora, trava a conexao, e o `Process()` que o driver chama depois do
 * callback nao solta a fila ate o PRAGMA terminar. Os outros PRAGMAs vem em seguida, um `exec` por PRAGMA,
 * cada um de dentro do callback do anterior (ali `pending` voltou a 0: tambem furam a fila), e a leitura do
 * modo no fim — `WAL mode enabled` so quando o modo LIDO e `wal` (o `:memory:` dizia "enabled" mentindo).
 * `exec`/`get` CRUS, capturados aqui, porque o `wrapDatabase` (que o index.js aplica logo depois) poe o exec
 * atras de uma promise. Isto e precaucao, nao prova: o controle que ADIA o exec nao derrubou o teste (o exec
 * exclusivo adiado ainda espera a fila esvaziar e trava antes do proximo) — ver o plano da Etapa 105. Todo
 * exec com callback: sem ele o erro vira evento 'error' sem ouvinte e derruba o processo.
 *
 * Banco existente ja em WAL: o PRAGMA e no-op (o SQLite so confere a transacao quando o modo MUDA). Em
 * `delete`: passa a WAL (B53 do doc de Compras). Descartado: repetir o PRAGMA com espera (continua
 * disputando com a carga do boot) e uma segunda conexao so para ele (o `db` principal precisa existir
 * de forma sincrona e as duas disputariam o lock).
 */
function configureSqlite(db) {
  if (!db) return;

  db.configure('busyTimeout', BUSY_TIMEOUT_MS);

  const execCru = db.exec.bind(db);
  const getCru = db.get.bind(db);

  execCru('PRAGMA journal_mode = WAL;', (errWal) => {
    if (errWal) console.warn('[SQLite] WAL mode unavailable:', errWal.message);
    // Fase 5 (achado medio): UM exec por PRAGMA, encadeados (cada callback roda com pending == 0 e ainda
    // fura a fila), foreign_keys PRIMEIRO. Num exec so, o sqlite3_exec parava no primeiro erro: com o arquivo
    // travado por outro processo alem do busy_timeout, `synchronous` (que le o schema) caia em SQLITE_BUSY e
    // foreign_keys nunca ligava — o processo seguia sem FK, so com um warn.
    const pragmas = [
      'PRAGMA foreign_keys = ON;',
      'PRAGMA synchronous = NORMAL;',
      'PRAGMA cache_size = -64000;',
      'PRAGMA temp_store = MEMORY;',
      'PRAGMA mmap_size = 268435456;',
    ];
    const proximo = (i, fim) => {
      if (i >= pragmas.length) return fim();
      execCru(pragmas[i], (errPragma) => {
        if (errPragma) console.warn(`[SQLite] ${pragmas[i]} falhou:`, errPragma.message);
        proximo(i + 1, fim);
      });
    };
    proximo(0, () => {
        if (errWal) return;
        getCru('PRAGMA journal_mode', (errModo, linha) => {
          const modo = !errModo && linha ? String(linha.journal_mode || '').toLowerCase() : null;
          if (modo === 'wal') {
            console.log('[SQLite] WAL mode enabled');
          } else {
            console.warn(`[SQLite] WAL mode unavailable: journal_mode=${errModo ? errModo.message : modo}`);
          }
        });
    });
  });

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
 * Entrega o resultado ao callback de quem pediu a operacao UMA vez so (RN-05).
 *
 * Fecha duas armadilhas:
 *  - `promise.then(ok).catch(erro)` ENCADEADO chama o callback DUAS vezes quando o
 *    proprio callback lanca: a excecao do `ok` cai no `.catch`, que chama de novo,
 *    agora com o erro errado. Por isso as duas maos vao no MESMO `then`.
 *  - o `.catch` final existe para nao deixar rejeicao orfa: excecao vinda de dentro
 *    do callback de quem pediu e reemitida FORA da cadeia, virando uncaughtException
 *    (que e o que ja acontecia quando o cb rodava dentro do callback do sqlite3),
 *    e nunca unhandledRejection.
 */
function entregarUmaVez(promise, aoResolver, aoRejeitar) {
  promise.then(aoResolver, aoRejeitar).catch((e) => {
    setImmediate(() => {
      throw e;
    });
  });
}

/**
 * Serialize writes and retry reads/writes on SQLITE_BUSY.
 * Preserves sqlite3 `this` context on db.run callbacks (lastID / changes).
 *
 * O callback de quem pediu e chamado UMA vez, na tentativa FINAL — nunca dentro do
 * executor do retryAsync, que roda uma vez por tentativa. Chamar la dentro entregava
 * o SQLITE_BUSY de uma tentativa que ainda ia ser refeita: a rota respondia 500 e a
 * escrita acontecia depois, sem auditoria (RN-05 / Etapa 23 Task 0).
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

    // `this` do sqlite3 (lastID / changes) so existe dentro do callback do driver.
    // Guardamos o da ultima tentativa para repassar a quem pediu — por isso `function`
    // e nao arrow aqui e no cb.call() abaixo.
    let ctxFinal = null;

    const promise = enqueueWrite(() =>
      retryAsync((done) => {
        originalRun(sql, p, function onRun(err) {
          ctxFinal = this;
          done(err, err ? undefined : this);
        });
      }, `run:${String(sql).slice(0, 80)}`)
    );

    if (typeof cb === 'function') {
      entregarUmaVez(
        promise,
        (ctx) => cb.call(ctx || ctxFinal || {}, null),
        (err) => cb.call(ctxFinal || {}, err)
      );
      return db; // contrato do sqlite3: com callback, o retorno sincrono e o db
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
      entregarUmaVez(promise, (row) => cb(null, row), (err) => cb(err, null));
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
      entregarUmaVez(promise, (rows) => cb(null, rows), (err) => cb(err, null));
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
      entregarUmaVez(promise, () => callback(null), (err) => callback(err));
      return db;
    }
    return promise;
  };

  /**
   * Etapa 137 (C292, RN-04): `BEGIN IMMEDIATE` + corpo + `COMMIT` num `exec` so — exclusivo no driver (nenhum `db.get`/`db.all` da
   * conexao entra no meio) — numa vaga da fila de escrita. Se o `exec` falha, o `ROLLBACK` roda NA MESMA VAGA, antes de soltar a fila:
   * mandado depois pela fila (como a exclusao de usuario fazia), ele rodava depois das escritas que entraram enquanto o `exec` falhava —
   * elas caiam dentro da transacao aberta e eram desfeitas. O ROLLBACK que falha ("no transaction is active": o BUSY no BEGIN nao abriu
   * nada) e engolido e o erro original sobe; o BUSY tenta de novo (retryAsync). O corpo NAO leva BEGIN/COMMIT.
   * Fica (D (137)): a escrita de `db.prepare` nao passa pela fila e pode entrar entre dois comandos do `exec`; o ROLLBACK de um erro
   * inesperado a desfaz. Quem precisa recusar sem erro decide DENTRO do corpo, antes de escrever, e termina em COMMIT (a exclusao).
   */
  db.execEmTransacao = function execEmTransacao(corpo) {
    const sql = `BEGIN IMMEDIATE;\n${corpo}\nCOMMIT;`;
    return enqueueWrite(() =>
      retryAsync((done) => {
        originalExec(sql, (err) => {
          if (!err) return done(null);
          originalExec('ROLLBACK;', () => done(err));
        });
      }, 'execEmTransacao')
    );
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
    if (err && err.code === 'EADDRINUSE') {
      console.error('[FATAL GUARD] Porta em uso — encerre instância duplicada');
      process.exit(1);
    }
    if (process.env.NODE_ENV === 'production') {
      console.error('[FATAL GUARD] Non-SQLite error logged; not calling process.exit');
      return;
    }
  });
}

/** Express helper: 503 + Retry-After on SQLITE_BUSY instead of 500/crash. */
function respondDbError(res, err, context = 'database') {
  if (isSqliteBusy(err)) {
    return res.status(503).json({
      error: 'Banco temporariamente ocupado. Tente novamente em alguns segundos.',
      code: 'SQLITE_BUSY',
      retryAfter: 3,
      context,
    });
  }
  return res.status(500).json({ error: err?.message || 'Erro interno do banco de dados' });
}

module.exports = {
  BUSY_TIMEOUT_MS,
  MAX_RETRIES,
  isSqliteBusy,
  configureSqlite,
  wrapDatabase,
  installProcessGuards,
  getDbHealthStats,
  respondDbError,
};
