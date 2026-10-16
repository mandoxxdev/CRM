/**
 * Etapa 132 (Fase 2 I3) — preload do `index.js` que um teste sobe como filho (`node -r morreComOPai.js index.js`).
 *
 * No Windows, quando o arquivo de teste estoura o prazo do `run-all.js` (o `spawnSync` mata so o filho direto) ou morre por
 * excecao antes da limpeza, o `index.js` neto ficaria vivo para sempre, com a porta, o SQLite e os timers. Aqui o filho le o
 * stdin (que o teste abre em `pipe`): morto o pai, o pipe fecha e o filho sai.
 */
if (process.stdin && typeof process.stdin.on === 'function') {
  process.stdin.on('end', () => process.exit(0));
  process.stdin.on('close', () => process.exit(0));
  process.stdin.on('error', () => process.exit(0));
  process.stdin.resume();
}
