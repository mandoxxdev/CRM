/**
 * SQLite startup recovery: backup WAL artifacts, integrity check, checkpoint.
 * Mitigates OneDrive sync + hard-refresh burst corruption risk.
 */

const fs = require('fs');
const path = require('path');

function fileSizeIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) return fs.statSync(filePath).size;
  } catch {
    /* ignore */
  }
  return 0;
}

function promisifyDb(db, method, sql, params = []) {
  return new Promise((resolve, reject) => {
    if (method === 'get') {
      db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    } else if (method === 'run') {
      db.run(sql, params, function onRun(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    } else {
      reject(new Error(`Unsupported method: ${method}`));
    }
  });
}

function backupDatabaseFiles(dbPath) {
  const dir = path.dirname(dbPath);
  const backupDir = path.join(dir, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const copied = [];

  for (const suffix of ['', '-wal', '-shm']) {
    const src = dbPath + suffix;
    if (!fs.existsSync(src)) continue;
    const dest = path.join(backupDir, `database-${stamp}${suffix || '.sqlite'}`);
    fs.copyFileSync(src, dest);
    copied.push(dest);
  }

  if (copied.length) {
    console.log(`[DB Recovery] Backup criado (${copied.length} arquivo(s)) em server/data/backups/`);
  }
  return copied;
}

async function runIntegrityCheck(db) {
  const row = await promisifyDb(db, 'get', 'PRAGMA integrity_check');
  const value = row?.integrity_check ?? row;
  const ok = String(value).toLowerCase() === 'ok';
  return { ok, result: value };
}

async function checkpointWal(db) {
  await promisifyDb(db, 'run', 'PRAGMA wal_checkpoint(TRUNCATE)');
}

/**
 * Run before migrations / heavy traffic. Returns integrity result.
 */
async function prepareDatabaseOnStartup(db, dbPath) {
  const walBefore = fileSizeIfExists(dbPath + '-wal');
  if (walBefore > 1024 * 1024) {
    console.warn(`[DB Recovery] WAL grande (${Math.round(walBefore / 1024)} KB) — checkpoint antes de migrations`);
  }

  backupDatabaseFiles(dbPath);

  const integrity = await runIntegrityCheck(db);
  if (!integrity.ok) {
    console.error('[DB Recovery] FALHA integrity_check:', integrity.result);
    console.error('[DB Recovery] Restaure a partir de server/data/backups/ mais recente');
    throw new Error(`Database integrity check failed: ${integrity.result}`);
  }

  try {
    await checkpointWal(db);
    const walAfter = fileSizeIfExists(dbPath + '-wal');
    console.log(`[DB Recovery] integrity OK | WAL ${walBefore} → ${walAfter} bytes`);
  } catch (err) {
    console.warn('[DB Recovery] WAL checkpoint falhou (não fatal):', err.message);
  }

  return integrity;
}

function pruneOldBackups(dbPath, keep = 10) {
  const backupDir = path.join(path.dirname(dbPath), 'backups');
  if (!fs.existsSync(backupDir)) return;
  const files = fs.readdirSync(backupDir)
    .filter((f) => f.startsWith('database-') && f.endsWith('.sqlite'))
    .map((f) => ({ f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  files.slice(keep).forEach(({ f }) => {
    try {
      fs.unlinkSync(path.join(backupDir, f));
    } catch {
      /* ignore */
    }
  });
}

module.exports = {
  backupDatabaseFiles,
  runIntegrityCheck,
  checkpointWal,
  prepareDatabaseOnStartup,
  pruneOldBackups,
  fileSizeIfExists,
};
