/**
 * Etapa 89 (B44, RN-89.01..02) — nome do arquivo do PDF da OS.
 *
 * O bug: a rota gerar-pdf gravava `OS_${numero_os || id}_${Date.now()}.pdf` com o `numero_os` CRU
 * (texto livre). Com `/` ou `\` o caminho ganhava uma pasta inexistente (ENOENT); com `"`, `:`, `*`,
 * `?`, `<`, `>`, `|` o Windows recusa o nome. Nos dois casos o PDF ja tinha sido renderizado na fila
 * do Chromium e o usuario recebia 500 "Erro ao gerar PDF" (prova real no plano da Etapa 89:
 * `numero_os = 'OS 1/2 "A"'` -> ENOENT em `...\ordens-servico\OS_OS 1\2 "A"_<ms>.pdf`).
 *
 * Parte pura: `nomeArquivoPdfOs` em services/pdfOs. Parte de TEXTO no index.js (abre banco e faz
 * listen no import — mesmo precedente de pdfOsRodape.api.test.js): a rota monta o caminho pela
 * funcao e nenhum `numero_os` cru entra no `path.join`.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { nomeArquivoPdfOs } = require('../../services/pdfOs');

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}

const fonte = fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8');
const semComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

const MS = 1791457678041;
/** Todo nome gerado tem de ser um basename seguro no Windows e no Linux. */
function assertNomeSeguro(nome) {
  assert.ok(/^OS_[A-Za-z0-9._-]+_\d+\.pdf$/.test(nome), `formato: ${nome}`);
  assert.strictEqual(path.basename(nome), nome, `nao e basename: ${nome}`);
  assert.strictEqual(path.win32.basename(nome), nome, `nao e basename no Windows: ${nome}`);
  assert.ok(!/[\\/:*?"<>|\s]/.test(nome), `caractere proibido: ${nome}`);
  assert.ok(!nome.includes('..'), `contem "..": ${nome}`);
}

console.log('pdfOsNomeArquivo (Etapa 89)');

test('RN-89.01: OS-001 (numero normal) fica igual', () => {
  assert.strictEqual(nomeArquivoPdfOs('OS-001', 7, MS), `OS_OS-001_${MS}.pdf`);
});

test('RN-89.01: o caso real da prova, OS 1/2 "A", vira um nome valido', () => {
  const n = nomeArquivoPdfOs('OS 1/2 "A"', 3, MS);
  assertNomeSeguro(n);
  assert.strictEqual(n, `OS_OS_1_2_A_${MS}.pdf`);
});

test('RN-89.01: ..\\x nao sobe de pasta nem comeca com ponto', () => {
  const n = nomeArquivoPdfOs('..\\x', 3, MS);
  assertNomeSeguro(n);
  assert.strictEqual(n, `OS_x_${MS}.pdf`);
  assertNomeSeguro(nomeArquivoPdfOs('../../etc/passwd', 3, MS));
});

test('RN-89.01: todos os caracteres que o Windows recusa', () => {
  for (const c of ['"', ':', '*', '?', '<', '>', '|', '/', '\\']) {
    const n = nomeArquivoPdfOs(`OS${c}9`, 3, MS);
    assertNomeSeguro(n);
    assert.strictEqual(n, `OS_OS_9_${MS}.pdf`, `caractere ${c}`);
  }
});

test('RN-89.01: acento perde a marca, nao vira lixo (Manutencao, travessao)', () => {
  assert.strictEqual(nomeArquivoPdfOs('Manutenção Á', 3, MS), `OS_Manutencao_A_${MS}.pdf`);
  const n = nomeArquivoPdfOs('OS—12', 3, MS);
  assertNomeSeguro(n);
  assert.strictEqual(n, `OS_OS_12_${MS}.pdf`);
});

test('RN-89.01: vazio, null, undefined, so espacos ou so simbolos -> id da OS', () => {
  // '-' e ' - ' sobrevivem ao corte das pontas: so a exigencia de letra/digito manda para o id.
  for (const v of ['', null, undefined, '   ', '///', '...', '"*"', '-', ' - ', '-_-']) {
    assert.strictEqual(nomeArquivoPdfOs(v, 42, MS), `OS_42_${MS}.pdf`, `valor ${JSON.stringify(v)}`);
  }
});

test('RN-89.01: numero muito longo e cortado em 80', () => {
  const n = nomeArquivoPdfOs('A'.repeat(500), 3, MS);
  assertNomeSeguro(n);
  assert.strictEqual(n, `OS_${'A'.repeat(80)}_${MS}.pdf`);
  // o corte nao deixa ponto/sublinhado pendurado no fim
  const n2 = nomeArquivoPdfOs(`${'B'.repeat(79)}.x`, 3, MS);
  assert.strictEqual(n2, `OS_${'B'.repeat(79)}_${MS}.pdf`);
});

test('RN-89.01: numero numerico e o ms entram como texto', () => {
  assert.strictEqual(nomeArquivoPdfOs(123, 3, MS), `OS_123_${MS}.pdf`);
});

test('controle: o verificador da rota acusa o path.join com numero_os cru (fonte sintetica)', () => {
  const velho = "app.post('/api/operacional/ordens-servico/:id/gerar-pdf', x, async () => {\n"
    + '    const pdfPath = path.join(uploadsOSDir, `OS_${os.numero_os || id}_${Date.now()}.pdf`);\n});\napp.get(';
  assert.ok(problemasDaRota(velho).length >= 2, JSON.stringify(problemasDaRota(velho)));
});

function problemasDaRota(src) {
  const ini = src.indexOf("app.post('/api/operacional/ordens-servico/:id/gerar-pdf'");
  if (ini < 0) return ['rota gerar-pdf da OS sumiu'];
  const fim = src.indexOf('\napp.', ini + 10);
  const rota = semComentarios(src.slice(ini, fim));
  const probs = [];
  const joins = rota.match(/path\.join\([^;]*\)/g) || [];
  // numero_os so pode entrar no path.join DENTRO de nomeArquivoPdfOs(...)
  const semFuncao = (j) => j.replace(/nomeArquivoPdfOs\((?:[^()]|\([^()]*\))*\)/g, '');
  if (joins.some((j) => /numero_os/.test(semFuncao(j)))) probs.push('numero_os cru no path.join');
  if (/OS_\$\{/.test(rota)) probs.push('nome OS_${...} montado a mao na rota');
  if (!/path\.join\(\s*uploadsOSDir\s*,\s*nomeArquivoPdfOs\(\s*os\.numero_os\s*,\s*id\s*,\s*Date\.now\(\)\s*\)\s*\)/.test(rota)) {
    probs.push('a rota nao monta o caminho por nomeArquivoPdfOs(os.numero_os, id, Date.now())');
  }
  return probs;
}

test('RN-89.01: a rota gerar-pdf monta o caminho por nomeArquivoPdfOs, sem numero_os cru', () => {
  assert.deepStrictEqual(problemasDaRota(fonte), []);
  assert.ok(/const \{[^}]*\bnomeArquivoPdfOs\b[^}]*\} = require\('\.\/services\/pdfOs'\);/.test(fonte), 'require de nomeArquivoPdfOs');
});

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
