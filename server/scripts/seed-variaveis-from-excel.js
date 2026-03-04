/**
 * Script para importar variáveis técnicas da planilha GMP_LISTA_DE_PRODUTOS.
 * Lê a linha 2 a partir da coluna F (índice 5) e cadastra cada célula não vazia
 * como variável técnica na tabela variaveis_tecnicas.
 *
 * Uso: node server/scripts/seed-variaveis-from-excel.js "caminho/para/planilha.xlsx"
 * Ou: npm run seed-variaveis -- "caminho/para/planilha.xlsx"
 */

const path = require('path');
const fs = require('fs');

// Caminho do Excel: primeiro argumento ou variável de ambiente
const excelPath = process.argv[2] || process.env.EXCEL_VARIAVEIS_PATH;
if (!excelPath || !fs.existsSync(excelPath)) {
  console.error('Uso: node seed-variaveis-from-excel.js "caminho/para/GMP_LISTA_DE_PRODUTOS_rev00.xlsx"');
  console.error('Ou defina EXCEL_VARIAVEIS_PATH com o caminho da planilha.');
  process.exit(1);
}

let XLSX;
try {
  XLSX = require('xlsx');
} catch (e) {
  console.error('Instale a dependência xlsx no servidor: npm install xlsx --save');
  process.exit(1);
}

const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');

if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco:', err.message);
    process.exit(1);
  }
});

function slug(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    || 'var_' + Date.now();
}

function run() {
  let workbook;
  try {
    workbook = XLSX.readFile(excelPath);
  } catch (e) {
    console.error('Erro ao ler planilha:', e.message);
    db.close();
    process.exit(1);
  }

  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) {
    console.error('Planilha não encontrada.');
    db.close();
    process.exit(1);
  }

  // Linha 2 em termos de planilha = índice 1 em 0-based; coluna F = índice 5 (A=0, B=1, ..., F=5)
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const rowIndex = 1; // linha 2
  const startCol = 5;  // coluna F

  const nomes = [];
  for (let c = startCol; c <= range.e.c; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c });
    const cell = sheet[cellRef];
    const value = cell ? (cell.w != null ? cell.w : (cell.v != null ? String(cell.v).trim() : '')) : '';
    const nome = (value && typeof value === 'string') ? value.trim() : (cell && cell.v != null ? String(cell.v).trim() : '');
    if (nome) nomes.push({ nome, ordem: c - startCol });
  }

  if (nomes.length === 0) {
    console.log('Nenhum valor encontrado na linha 2 a partir da coluna F. Verifique a planilha.');
    db.close();
    process.exit(0);
  }

  console.log(`Encontradas ${nomes.length} variáveis na planilha (linha 2, coluna F em diante).`);

  db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS variaveis_tecnicas (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, chave TEXT NOT NULL UNIQUE, categoria TEXT, tipo TEXT DEFAULT \'texto\', opcoes TEXT, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)', (err) => {
      if (err) {
        console.error('Erro ao garantir tabela:', err.message);
        db.close();
        process.exit(1);
      }

      const stmt = db.prepare('INSERT OR IGNORE INTO variaveis_tecnicas (nome, chave, categoria, tipo, opcoes, ordem, ativo) VALUES (?, ?, NULL, \'texto\', NULL, ?, 1)');
      let inserted = 0;
      let skipped = 0;
      const total = nomes.length;
      let done = 0;

      const dataDir = path.join(__dirname, '..', 'data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const baseJsonPath = path.join(dataDir, 'variaveis-base.json');

      function maybeFinish() {
        done++;
        if (done < total) return;
        stmt.finalize(() => {
          db.get('SELECT COUNT(*) AS total FROM variaveis_tecnicas WHERE ativo = 1', [], (err, row) => {
            if (err) console.error('Erro ao contar:', err.message);
            else console.log(`Variáveis inseridas: ${inserted}. Já existiam (ignoradas): ${skipped}. Total ativas no banco: ${row.total}.`);
            try {
              fs.writeFileSync(baseJsonPath, JSON.stringify(nomes, null, 2), 'utf8');
              console.log('Lista de variáveis base salva em data/variaveis-base.json (usada na inicialização do servidor).');
            } catch (e) {
              console.warn('Aviso: não foi possível salvar variaveis-base.json:', e.message);
            }
            db.close();
          });
        });
      }

      if (total === 0) {
        stmt.finalize(() => db.close());
        return;
      }

      nomes.forEach(({ nome, ordem }) => {
        const chave = slug(nome);
        if (!chave) {
          maybeFinish();
          return;
        }
        stmt.run(nome, chave, ordem, function (err) {
          if (err) {
            console.warn('Aviso ao inserir', nome, err.message);
            skipped++;
          } else if (this.changes > 0) {
            inserted++;
          } else {
            skipped++;
          }
          maybeFinish();
        });
      });
    });
  });
}

run();
