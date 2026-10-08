/**
 * Etapa 87 (fix-round da revisao) — resolvedor de assets do client (services/assetsDoClient.js).
 *
 * Teste de SERVICO em tests/api/ porque o runner so descobre `*.api.test.js`.
 *
 * O bug: o PDF da OS (gerarHTMLOS) lia o logo so de `client/public/Logo_MY.jpg`. A imagem Docker de
 * producao so tem `client/build` (Dockerfile: COPY --from=client-builder /app/client/build), entao
 * em producao o logo nao era embutido em base64: virava URL e o Chromium o buscava pela rede
 * DENTRO da fila de PDFs. O caso "so build" abaixo e o de producao.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolverAssetDoClient } = require('../../services/assetsDoClient');

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-client-'));
function raiz(nome, arquivos) {
  const r = path.join(tmp, nome);
  for (const rel of arquivos) {
    const p = path.join(r, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, rel);
  }
  return r;
}

try {
  test('producao: so client/build (sem public) -> acha no build', () => {
    const r = raiz('prod', ['build/Logo_MY.jpg', 'build/index.html']);
    assert.strictEqual(resolverAssetDoClient(r, 'Logo_MY.jpg'), path.join(r, 'build', 'Logo_MY.jpg'));
  });

  test('dev sem build: so client/public -> acha no public', () => {
    const r = raiz('dev', ['public/Logo_MY.jpg']);
    assert.strictEqual(resolverAssetDoClient(r, 'Logo_MY.jpg'), path.join(r, 'public', 'Logo_MY.jpg'));
  });

  test('os dois: build vence (mesma ordem da rota /Logo_MY.jpg)', () => {
    const r = raiz('ambos', ['build/Logo_MY.jpg', 'public/Logo_MY.jpg']);
    assert.strictEqual(resolverAssetDoClient(r, 'Logo_MY.jpg'), path.join(r, 'build', 'Logo_MY.jpg'));
  });

  test('nenhum: null (o chamador cai no fallback por URL)', () => {
    const r = raiz('vazio', ['build/outro.png']);
    assert.strictEqual(resolverAssetDoClient(r, 'Logo_MY.jpg'), null);
    assert.strictEqual(resolverAssetDoClient(path.join(tmp, 'nao-existe'), 'Logo_MY.jpg'), null);
  });

  test('varios nomes: na mesma base, o primeiro nome que existir; base antes de nome', () => {
    const r = raiz('nomes', ['build/logo.png', 'public/Logo_MY.jpg']);
    assert.strictEqual(resolverAssetDoClient(r, 'Logo_MY.jpg', 'logo.png'), path.join(r, 'build', 'logo.png'));
  });

  test('index.js: gerarHTMLOS resolve o logo por resolveClientAsset, nao pelo caminho fixo de public', () => {
    const fonte = fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8');
    const ini = fonte.indexOf('function gerarHTMLOS(');
    assert.ok(ini > 0, 'gerarHTMLOS sumiu');
    const trecho = fonte.slice(ini, fonte.indexOf('global.baseURLForPDF', ini));
    assert.ok(/resolveClientAsset\('Logo_MY\.jpg'\)/.test(trecho), 'gerarHTMLOS nao usa resolveClientAsset(\'Logo_MY.jpg\')');
    assert.ok(!/'client',\s*'public'/.test(trecho), "gerarHTMLOS voltou a ler so de client/public (nao existe na imagem de producao)");
    assert.ok(/function resolveClientAsset\([^)]*\)\s*\{\s*return resolverAssetDoClient\(/.test(fonte),
      'resolveClientAsset nao delega a services/assetsDoClient');
  });
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
