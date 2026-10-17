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

  // ---------------------------------------------------------------------------
  // Etapa 105 (G12, RN-105.05): o WAL entra no PRIMEIRO boot.
  //
  // No index.js os modulos enfileiram dezenas de CREATE TABLE IF NOT EXISTS e SELECT em
  // sqlite_master ANTES de o open terminar; o PRAGMA journal_mode = WAL ia depois, por db.run
  // (nao exclusivo), e caia com outra instrucao ativa na conexao: "cannot change into wal mode
  // from within a transaction" — e o banco ficava em `delete` em todo boot (medido: 6 de 6).
  // O que segura a "transaction" e o db.get que devolve linha (o statement fica ativo ate o
  // finalize); com db.all o defeito NAO aparece (achado A1 da revisao do plano) — por isso get.
  // O modo e lido por OUTRA conexao, com a principal ja fechada: e o arquivo que importa.
  // ---------------------------------------------------------------------------

  const arquivoNovo = (nome) => path.join(os.tmpdir(), `orion-rn105-${nome}-${process.pid}-${Date.now()}.db`);
  const apagarBanco = (arquivo) => {
    for (const sufixo of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(arquivo + sufixo); } catch (e) { /* nao existe */ }
    }
  };
  const modoGravado = async (arquivo) => {
    const leitor = new sqlite3.Database(arquivo);
    const linha = await getCru(leitor, 'PRAGMA journal_mode');
    await fecharCru(leitor);
    return linha && linha.journal_mode;
  };

  /** Abre como o index.js: configureSqlite + wrapDatabase no callback do open, com a rajada
   *  dos modulos enfileirada ANTES do open. Devolve as linhas de log do [SQLite]. */
  const bootComoOIndex = async (arquivo) => {
    const logs = [];
    const logOriginal = console.log;
    const warnOriginal = console.warn;
    console.log = (...a) => { if (String(a[0]).startsWith('[SQLite]')) logs.push(a.join(' ')); else logOriginal(...a); };
    console.warn = (...a) => { if (String(a[0]).startsWith('[SQLite]')) logs.push(a.join(' ')); else warnOriginal(...a); };
    try {
      const abriu = new Promise((resolve, reject) => {
        const db = new sqlite3.Database(arquivo, (err) => {
          if (err) return reject(err);
          configureSqlite(db);
          wrapDatabase(db);
          resolve(db);
        });
        const pendentes = [];
        for (let k = 0; k < 40; k += 1) {
          pendentes.push(new Promise((r) => db.run(`CREATE TABLE IF NOT EXISTS t${k} (id INTEGER PRIMARY KEY, v TEXT)`, () => r())));
          pendentes.push(new Promise((r) => db.get("SELECT name FROM sqlite_master WHERE type='table'", () => r())));
        }
        db.__pendentes = pendentes;
      });
      const db = await abriu;
      await Promise.all(db.__pendentes);
      await esperar(150); // a leitura do modo e o log saem no callback do exec
      await fecharCru(db);
    } finally {
      console.log = logOriginal;
      console.warn = warnOriginal;
    }
    return logs;
  };

  await test('RN-105.05 banco NOVO com a rajada dos modulos antes do open: o arquivo fica em wal', async () => {
    const arquivo = arquivoNovo('novo');
    try {
      const logs = await bootComoOIndex(arquivo);
      const modo = await modoGravado(arquivo);
      assert(modo === 'wal', `journal_mode gravado deveria ser wal, veio ${modo} — logs: ${JSON.stringify(logs)}`);
      assert(logs.includes('[SQLite] WAL mode enabled'), `log deveria dizer "WAL mode enabled": ${JSON.stringify(logs)}`);
      assert(!logs.some((l) => l.includes('unavailable')), `nenhum "unavailable" no log: ${JSON.stringify(logs)}`);
    } finally {
      apagarBanco(arquivo);
    }
  });

  await test('RN-105.05 os outros PRAGMAs continuam valendo na conexao (foreign_keys, synchronous)', async () => {
    const arquivo = arquivoNovo('pragmas');
    try {
      const db = await new Promise((resolve, reject) => {
        const d = new sqlite3.Database(arquivo, (err) => (err ? reject(err) : (configureSqlite(d), resolve(d))));
      });
      await esperar(100);
      const fk = await getCru(db, 'PRAGMA foreign_keys');
      const sync = await getCru(db, 'PRAGMA synchronous');
      await fecharCru(db);
      assert(fk && fk.foreign_keys === 1, `foreign_keys deveria ser 1: ${JSON.stringify(fk)}`);
      assert(sync && sync.synchronous === 1, `synchronous deveria ser 1 (NORMAL): ${JSON.stringify(sync)}`);
    } finally {
      apagarBanco(arquivo);
    }
  });

  await test('RN-105.05 banco existente em WAL continua wal; em delete passa a wal (B53)', async () => {
    const emWal = arquivoNovo('jawal');
    const emDelete = arquivoNovo('delete');
    try {
      const prepara = async (arquivo, modo) => {
        const d = new sqlite3.Database(arquivo);
        await runCru(d, `PRAGMA journal_mode = ${modo}`);
        await runCru(d, 'CREATE TABLE ja_existia (id INTEGER PRIMARY KEY)');
        await fecharCru(d);
      };
      await prepara(emWal, 'WAL');
      await prepara(emDelete, 'DELETE');
      assert((await modoGravado(emDelete)) === 'delete', 'setup: o banco "delete" tem de comecar em delete');
      await bootComoOIndex(emWal);
      await bootComoOIndex(emDelete);
      assert((await modoGravado(emWal)) === 'wal', 'o banco que ja era wal tem de continuar wal');
      assert((await modoGravado(emDelete)) === 'wal', 'o banco em delete tem de passar a wal no boot');
    } finally {
      apagarBanco(emWal);
      apagarBanco(emDelete);
    }
  });

  // Fase 5 (achado medio): os PRAGMAs iam num exec so; com o arquivo travado por outro processo,
  // `synchronous` (que le o schema) caia em SQLITE_BUSY e o sqlite3_exec parava ali — foreign_keys
  // nunca ligava e o processo seguia sem FK, so com um warn. Cada PRAGMA no seu exec.
  await test('RN-105.05 (Fase 5) arquivo travado por outro processo no boot: foreign_keys continua ligado', async () => {
    const arquivo = arquivoNovo('travado');
    const rival = new sqlite3.Database(arquivo);
    try {
      await runCru(rival, 'CREATE TABLE ja_existia (id INTEGER PRIMARY KEY)');
      await runCru(rival, 'BEGIN EXCLUSIVE');
      const logs = [];
      const warnOriginal = console.warn;
      const logOriginal = console.log;
      console.warn = (...a) => { if (String(a[0]).startsWith('[SQLite]')) logs.push(a.join(' ')); else warnOriginal(...a); };
      console.log = (...a) => { if (String(a[0]).startsWith('[SQLite]')) logs.push(a.join(' ')); else logOriginal(...a); };
      let db;
      try {
        db = await new Promise((resolve, reject) => {
          const d = new sqlite3.Database(arquivo, (err) => (err ? reject(err) : (configureSqlite(d), resolve(d))));
        });
        await esperar(150);
      } finally {
        console.warn = warnOriginal;
        console.log = logOriginal;
      }
      await runCru(rival, 'ROLLBACK');
      assert(logs.some((l) => l.includes('WAL mode unavailable')), `setup: o lock tinha de derrubar o WAL: ${JSON.stringify(logs)}`);
      const fk = await getCru(db, 'PRAGMA foreign_keys');
      await fecharCru(db);
      assert(fk && fk.foreign_keys === 1, `foreign_keys deveria ser 1 mesmo com o boot travado: ${JSON.stringify(fk)} — logs: ${JSON.stringify(logs)}`);
    } finally {
      await fecharCru(rival);
      apagarBanco(arquivo);
    }
  });

  await test('RN-105.05 :memory: nao mente: loga "unavailable: journal_mode=memory", nao "enabled"', async () => {
    const logs = [];
    const logOriginal = console.log;
    const warnOriginal = console.warn;
    console.log = (...a) => { if (String(a[0]).startsWith('[SQLite]')) logs.push(a.join(' ')); else logOriginal(...a); };
    console.warn = (...a) => { if (String(a[0]).startsWith('[SQLite]')) logs.push(a.join(' ')); else warnOriginal(...a); };
    try {
      const db = new sqlite3.Database(':memory:');
      configureSqlite(db);
      await esperar(150);
      await fecharCru(db);
    } finally {
      console.log = logOriginal;
      console.warn = warnOriginal;
    }
    assert(logs.includes('[SQLite] WAL mode unavailable: journal_mode=memory'), `logs: ${JSON.stringify(logs)}`);
    assert(!logs.includes('[SQLite] WAL mode enabled'), `nao pode dizer enabled: ${JSON.stringify(logs)}`);
  });

  // ---------------------------------------------------------------------------
  // Etapa 137 (C292, RN-04): `db.execEmTransacao(corpo)` — BEGIN IMMEDIATE + corpo + COMMIT num exec so (exclusivo no driver), numa vaga
  // da fila; se falha, o ROLLBACK roda NA MESMA VAGA. Antes, a rota de exclusao mandava o ROLLBACK pela fila, depois das escritas que
  // entraram nela enquanto o exec falhava: elas rodavam dentro da transacao aberta e o ROLLBACK as desfazia (Fase 2 I6).
  // Plano: docs/superpowers/plans/2026-10-17-almoxarifado-etapa137-a-exclusao-do-ultimo-super.md
  // ---------------------------------------------------------------------------

  const bancoDeArquivo = async (nome) => {
    const arquivo = path.join(os.tmpdir(), `orion-rn137-${nome}-${process.pid}-${Date.now()}.db`);
    const db = new sqlite3.Database(arquivo);
    db.configure('busyTimeout', 0);
    await runCru(db, 'CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    await runCru(db, "INSERT INTO t (id, v) VALUES (1, 'a')");
    wrapDatabase(db);
    return { db, arquivo };
  };
  const apagar137 = async ({ db, arquivo }) => {
    await fecharCru(db);
    for (const sufixo of ['', '-wal', '-shm']) { try { fs.unlinkSync(arquivo + sufixo); } catch (e) { /* nao existe */ } }
  };
  const semTransacaoAberta = async (db) => { await db.exec('BEGIN IMMEDIATE; ROLLBACK;'); }; // "within a transaction" se ficou aberta
  const todas = (db) => new Promise((r, j) => db.all('SELECT id, v FROM t ORDER BY id', [], (e, x) => (e ? j(e) : r(x))));

  await test('[RN-04a] execEmTransacao: o corpo inteiro grava, numa transacao', async () => {
    const b = await bancoDeArquivo('a');
    try {
      assert(typeof b.db.execEmTransacao === 'function', 'wrapDatabase nao expoe execEmTransacao');
      await b.db.execEmTransacao("UPDATE t SET v = 'b' WHERE id = 1;\nINSERT INTO t (v) VALUES ('c');");
      assert(JSON.stringify(await todas(b.db)) === JSON.stringify([{ id: 1, v: 'b' }, { id: 2, v: 'c' }]), JSON.stringify(await todas(b.db)));
      await semTransacaoAberta(b.db);
    } finally { await apagar137(b); }
  });

  await test('[RN-04b] execEmTransacao: o corpo que falha no meio -> ROLLBACK na mesma vaga; a escrita enfileirada enquanto isso GRAVA', async () => {
    const b = await bancoDeArquivo('b');
    try {
      const corpoGrande = Array.from({ length: 400 }, (_, k) => `INSERT INTO t (v) VALUES ('meio-${k}');`).join('\n');
      const pTx = b.db.execEmTransacao(`UPDATE t SET v = 'meio' WHERE id = 1;\n${corpoGrande}\nINSERT INTO tabela_que_nao_existe (x) VALUES (1);`);
      const pFora = b.db.run("INSERT INTO t (v) VALUES ('fora')"); // enfileirada enquanto o corpo roda
      let pego = null;
      try { await pTx; } catch (e) { pego = e; }
      await pFora;
      assert(pego && /no such table/i.test(pego.message), `o erro do corpo nao chegou: ${pego && pego.message}`);
      assert(JSON.stringify(await todas(b.db)) === JSON.stringify([{ id: 1, v: 'a' }, { id: 2, v: 'fora' }]),
        `o ROLLBACK nao desfez o corpo ou desfez a escrita de fora: ${JSON.stringify((await todas(b.db)).slice(0, 4))}`);
      await semTransacaoAberta(b.db);
    } finally { await apagar137(b); }
  });

  await test('[RN-04c] execEmTransacao: BEGIN IMMEDIATE com o lock de outra conexao tenta de novo ate soltar', async () => {
    await comLockDeEscrita('rn137c', async ({ principal, rival }) => {
      const tr = principal.execEmTransacao('UPDATE t SET ativo = 7 WHERE id = 1;');
      await esperar(120);
      await runCru(rival, 'COMMIT');
      await tr;
      const l = await getCru(rival, 'SELECT ativo FROM t WHERE id = 1');
      assert(l.ativo === 7, `nao gravou depois do retry: ${JSON.stringify(l)}`);
      await semTransacaoAberta(principal);
    });
  });

  await test('[RN-04d] execEmTransacao: o lock que nunca solta -> SQLITE_BUSY chega e nada fica aberto', async () => {
    await comLockDeEscrita('rn137d', async ({ principal, rival }) => {
      let pego = null;
      try { await principal.execEmTransacao('UPDATE t SET ativo = 9 WHERE id = 1;'); } catch (e) { pego = e; }
      assert(pego && isSqliteBusy(pego), `esperado SQLITE_BUSY: ${pego && pego.message}`);
      await runCru(rival, 'ROLLBACK');
      await semTransacaoAberta(principal);
      await runCru(rival, 'BEGIN IMMEDIATE'); // o comLockDeEscrita solta no finally
    });
  });

  await test('[RN-04e] execEmTransacao: o COMMIT que falha (FK adiada) -> ROLLBACK e o erro chega', async () => {
    const b = await bancoDeArquivo('e');
    try {
      await b.db.exec('PRAGMA foreign_keys = ON;');
      await b.db.exec('CREATE TABLE pai (id INTEGER PRIMARY KEY); CREATE TABLE filho (id INTEGER PRIMARY KEY, pai_id INTEGER REFERENCES pai(id) DEFERRABLE INITIALLY DEFERRED);');
      let pego = null;
      try { await b.db.execEmTransacao('INSERT INTO filho (pai_id) VALUES (42);'); } catch (e) { pego = e; }
      assert(pego && /FOREIGN KEY/i.test(pego.message), `o erro do COMMIT nao chegou: ${pego && pego.message}`);
      const n = await getCru(b.db, 'SELECT COUNT(*) AS n FROM filho');
      assert(n.n === 0, `o COMMIT que falhou deixou a linha: ${JSON.stringify(n)}`);
      await semTransacaoAberta(b.db);
    } finally { await apagar137(b); }
  });

  console.log(`\nsqliteConcurrency: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
