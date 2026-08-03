/** Roda todos os *.api.test.js desta pasta em sequência. */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.api.test.js')).sort();
let failed = 0;
for (const f of files) {
  console.log(`\n━━ ${f} ━━`);
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(`\n${files.length - failed}/${files.length} arquivos de teste OK`);
process.exit(failed > 0 ? 1 : 0);
