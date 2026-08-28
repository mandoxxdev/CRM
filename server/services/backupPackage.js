/**
 * O que entra e o que NAO entra no zip de `GET /api/backup` (server/index.js).
 *
 * Antes desta etapa a rota fazia `archive.directory(PERSISTENT_DATA_DIR, false)` — o
 * diretorio de dados INTEIRO. Isso publicava `.runtime-secrets.json`, que carrega o
 * `jwtSecret` em claro; quem baixasse o zip forjaria token de superadmin (index.js:318
 * assina com esse mesmo segredo). Nao era vazamento de dado, era escalada de privilegio.
 * E arrastava junto ~188 MB de copias historicas do banco.
 *
 * Funcao pura de proposito: `server/index.js` tem 23 mil linhas, abre banco em disco e faz
 * `listen` no import, entao nao ha harness de core. A regua fica aqui, testada em
 * `tests/api/backupExposicao.api.test.js`; a fiacao HTTP fica declarada sem teste.
 */
const fs = require('fs');
const path = require('path');

// Cada exclusao com o porque, porque backup que exclui demais deixa de ser backup.
const EXCLUIDOS = [
  '.runtime-secrets.json', // jwtSecret + credencial do admin semeado: quem baixa FORJA token
                           // de superadmin (server/index.js:318 assina com esse segredo).
  'backups',               // ~188 MB de copias historicas. NAO some do zip: a rota soma de
                           // volta a MAIS RECENTE via backupMaisRecente() — dbRecovery.js:86
                           // manda restaurar dali, e o cenario do diretorio e justamente
                           // "database.sqlite corrompido", que e o arquivo que vai no zip.
                           // Tirar o diretorio inteiro removeria o fallback bem no unico
                           // cenario em que ele existe para servir.
];

/**
 * @param {string} nomeRelativo caminho relativo a raiz do backup, como o archiver entrega
 *   em `entry.name` no 3o argumento de `archive.directory(dir, false, fn)`.
 * @returns {boolean} false = pular.
 *
 * Compara o PRIMEIRO SEGMENTO do caminho, nao so o nome do arquivo: o glob do archiver
 * DESCE dentro de `backups/` mesmo quando a entrada do proprio diretorio e recusada, entao
 * recusar apenas `'backups'` deixaria as 188 copias entrarem uma a uma. O nome do arquivo
 * tambem e comparado, para pegar uma copia aninhada do segredo.
 */
function deveIncluirNoBackup(nomeRelativo) {
  if (!nomeRelativo) return true;
  const partes = String(nomeRelativo).split(/[\\/]/).filter(Boolean);
  if (!partes.length) return true;
  const primeiroSegmento = partes[0];
  const nomeArquivo = partes[partes.length - 1];
  if (EXCLUIDOS.includes(primeiroSegmento)) return false;
  if (EXCLUIDOS.includes(nomeArquivo)) return false;
  return true;
}

/**
 * Nome da copia de backup mais recente em `<dir>/backups`, ou null.
 *
 * So considera `database-*.sqlite`: o mesmo filtro de `dbRecovery.pruneOldBackups`. Um
 * `-wal`/`-shm` solto e mais novo nao e uma copia — sozinho ele nao restaura nada, e
 * escolher ele deixaria o zip com um fallback que nao abre.
 */
function backupMaisRecente(dir) {
  const backupDir = path.join(dir, 'backups');
  let arquivos;
  try {
    if (!fs.existsSync(backupDir)) return null;
    arquivos = fs.readdirSync(backupDir);
  } catch {
    return null;
  }
  const copias = arquivos
    .filter((f) => f.startsWith('database-') && f.endsWith('.sqlite'))
    .map((f) => {
      let mtime = 0;
      try { mtime = fs.statSync(path.join(backupDir, f)).mtimeMs; } catch { /* sumiu no meio */ }
      return { f, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return copias.length ? copias[0].f : null;
}

module.exports = { deveIncluirNoBackup, backupMaisRecente, EXCLUIDOS };
