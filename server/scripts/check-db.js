const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');

const db = new sqlite3.Database(dbPath);

db.get('PRAGMA integrity_check', (err, row) => {
  console.log('integrity_check:', row);
});

db.get('PRAGMA quick_check', (err, row) => {
  console.log('quick_check:', row);
});

const walPath = dbPath + '-wal';
if (fs.existsSync(walPath)) {
  console.log('WAL size bytes:', fs.statSync(walPath).size);
}

db.all(
  "SELECT id, nome, email, is_oculto, ativo, role FROM usuarios WHERE LOWER(nome) LIKE '%andre%'",
  (err, rows) => {
    console.log('andre users:', JSON.stringify(rows, null, 2));
    db.close();
  }
);
