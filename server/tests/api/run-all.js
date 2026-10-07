/**
 * Roda todos os *.api.test.js desta pasta em sequencia (ou so os arquivos passados como argumento).
 *
 * Etapa 76 (Fase 5) — o exit code sozinho nao basta (sonda76f-runner):
 *  - cada arquivo roda com o preload `tests/helpers/guardaProcessExit.js`: terminar com 0 SEM chamar
 *    `process.exit` (event loop vazio no meio do arquivo, sem placar) vira FALHA;
 *  - cada arquivo tem limite de tempo (RUN_ALL_TIMEOUT_MS, padrao 120000): um arquivo que prende com timer
 *    vivo vira FALHA em vez de travar a suite. Medido na Fase 5: o mais lento dos 291 levou 4,0 s (anexoDocumento);
 *    120 s da 30x de folga para maquina lenta sem deixar um arquivo pendurado segurar a suite por muito tempo.
 *
 * Executar: cd server && npm run test:api   |   node tests/api/run-all.js tests/api/x.api.test.js
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const GUARDA = path.join(__dirname, '..', 'helpers', 'guardaProcessExit.js');
const TIMEOUT_MS = Number(process.env.RUN_ALL_TIMEOUT_MS) || 120000;

const args = process.argv.slice(2);
const files = args.length
  ? args.map((a) => path.resolve(a))
  : fs.readdirSync(dir).filter((f) => f.endsWith('.api.test.js')).sort().map((f) => path.join(dir, f));
let failed = 0;
let maisLento = { f: null, ms: 0 };
for (const arq of files) {
  const f = path.basename(arq);
  console.log(`\n━━ ${f} ━━`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['-r', GUARDA, arq], {
    stdio: 'inherit',
    timeout: TIMEOUT_MS,
    env: { ...process.env, RUN_ALL_GUARDA_EXIT: '1' },
  });
  const ms = Date.now() - t0;
  if (ms > maisLento.ms) maisLento = { f, ms };
  if (r.error && r.error.code === 'ETIMEDOUT') {
    console.error(`[run-all] o arquivo passou de ${TIMEOUT_MS} ms e foi interrompido (timeout): ${f}`);
    failed++;
  } else if (r.status !== 0) {
    failed++;
  }
}
console.log(`\n${files.length - failed}/${files.length} arquivos de teste OK`
  + (maisLento.f ? ` (mais lento: ${maisLento.f}, ${(maisLento.ms / 1000).toFixed(1)} s)` : ''));
process.exit(failed > 0 ? 1 : 0);
