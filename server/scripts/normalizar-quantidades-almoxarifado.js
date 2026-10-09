#!/usr/bin/env node
/**
 * Etapa 96 T4 (B483) — lista, e so com --aplicar normaliza, as quantidades do almoxarifado gravadas com residuo de
 * ponto flutuante antes da 96 (0.9999999999999999 no lugar de 1).
 *
 *   cd server && node scripts/normalizar-quantidades-almoxarifado.js            # so lista; nada gravado
 *   cd server && node scripts/normalizar-quantidades-almoxarifado.js --aplicar  # grava ROUND(col, 6)
 *
 * Opcional: depois da 96 o legado nao prende gesto nenhum (a folga); a normalizacao so limpa o numero exibido. Rodar com
 * o servidor PARADO, como qualquer escrita direta no banco. O banco e o de config/paths.js (respeita CRM_DATA_DIR). O
 * livro (movimentacoes_almoxarifado) nao e tocado (B484).
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { PERSISTENT_DATA_DIR } = require('../config/paths');
const { listarTortos, normalizar } = require('../services/almoxarifado/quantidadeLegado');

async function main() {
  const aplicar = process.argv.slice(2).includes('--aplicar');
  const dbPath = path.join(PERSISTENT_DATA_DIR, 'database.sqlite'); // o mesmo nome que server/index.js monta
  if (!fs.existsSync(dbPath)) {
    console.error(`Banco nao encontrado: ${dbPath} (confira CRM_DATA_DIR). Nada feito.`);
    return 1;
  }
  console.log(`Banco: ${dbPath}`);
  const db = await new Promise((ok, falha) => {
    const d = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (e) => (e ? falha(e) : ok(d)));
  });
  try {
    db.configure('busyTimeout', 5000);
    const tortos = aplicar ? [] : await listarTortos(db);
    const r = await normalizar(db, { aplicar });
    for (const c of r.porColuna) {
      console.log(`${c.tabela}.${c.coluna}: ${c.linhas} linha(s)`);
      for (const t of tortos.filter((x) => x.tabela === c.tabela && x.coluna === c.coluna)) {
        console.log(`  id ${t.id}: ${t.valor} -> ${t.arredondado}`);
      }
    }
    // Etapa 96 (Fase 5, R2): o agregado do material sai da fonte onde a invariante valia (linhas; reservas ativas).
    for (const c of r.recalculados) {
      console.log(`${c.tabela}.${c.coluna} recalculado da ${c.fonte}: ${c.materiais} material(is)`);
    }
    console.log(r.aplicado ? 'Normalizado.' : 'Nada gravado. Rode com --aplicar para normalizar.');
    return 0;
  } finally {
    await new Promise((ok) => db.close(() => ok()));
  }
}

main().then((code) => { process.exitCode = code; }).catch((e) => {
  console.error(`Falhou: ${e.message}`);
  process.exitCode = 1;
});
