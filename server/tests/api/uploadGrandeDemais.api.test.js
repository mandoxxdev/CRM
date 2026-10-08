/**
 * Etapa 85 / T1 — RN-85.01..03: arquivo acima do `limits.fileSize` do multer vira 413 com mensagem
 * clara, em vez de 500 "Erro interno do servidor".
 *
 * O `MulterError` LIMIT_FILE_SIZE do multer 2.x NAO carrega o limite (so `code`, `field` e a
 * mensagem 'File too large' — ver node_modules/multer/lib/multer-error.js). Por isso o index.js cria
 * os multers por `multerComLimiteNoErro(require('multer'))`, que poe `err.limiteBytes` no erro; o
 * `tratarArquivoGrandeDemais` monta "Arquivo grande demais (maximo N MB)" a partir dele e, sem ele,
 * responde sem numero (nao inventa).
 *
 * Tres partes:
 *  1. formatacao da mensagem;
 *  2. COMPORTAMENTO: express + multer real com limite pequeno + os middlewares reais exportados,
 *     na mesma ordem do index.js (formato -> tamanho -> handler 500);
 *  3. FIACAO no index.js (faz listen no import, nao entra no harness): o `multer` do arquivo e o
 *     embrulhado e o middleware fica depois da ultima rota com multer e antes do handler global.
 *
 * Executar: cd server && node tests/api/uploadGrandeDemais.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multerOriginal = require('multer');
const request = require('supertest');
const {
  filtroImagemMulter, mensagemArquivoGrande, multerComLimiteNoErro, tratarArquivoGrandeDemais,
  tratarErroFormatoImagem,
} = require('../../services/imagemUpload');

let passou = 0; let falhou = 0;
const testes = [];
function test(nome, fn) { testes.push([nome, fn]); }

const SERVER = path.join(__dirname, '..', '..');
const fonteIndex = fs.readFileSync(path.join(SERVER, 'index.js'), 'utf8');
const MB = 1024 * 1024;

/** Captura os console.warn durante `fn` (e devolve-os), restaurando o original sempre. */
async function comWarns(fn) {
  const original = console.warn;
  const warns = [];
  console.warn = (...args) => { warns.push(args.map(String).join(' ')); };
  try { const r = await fn(); return { r, warns }; } finally { console.warn = original; }
}

/**
 * App igual ao index.js: multer (embrulhado ou nao) na rota, depois `tratarErroFormatoImagem`,
 * `tratarArquivoGrandeDemais` e um handler final de 500 no lugar do global.
 */
function appUpload({ limite, embrulhado = true, metodo = 'single' }) {
  const m = embrulhado ? multerComLimiteNoErro(multerOriginal) : multerOriginal;
  const up = m({
    storage: m.memoryStorage(),
    limits: { fileSize: limite },
    fileFilter: filtroImagemMulter('Apenas imagens'),
  });
  const mw = metodo === 'single' ? up.single('foto')
    : metodo === 'array' ? up.array('foto', 2)
      : up.fields([{ name: 'foto', maxCount: 1 }]);
  const app = express();
  app.post('/api/up', mw, (req, res) => res.json({ ok: true }));
  app.post('/api/explode', (req, res, next) => next(new Error('outra coisa')));
  app.use('/api', tratarErroFormatoImagem);
  app.use('/api', tratarArquivoGrandeDemais);
  // eslint-disable-next-line no-unused-vars
  app.use('/api', (err, req, res, next) => res.status(500).json({ error: 'Erro interno do servidor', msg: err.message }));
  return app;
}

// ── 1. mensagem ─────────────────────────────────────────────────────────────────────────

test('mensagem: MB inteiro, MB fracionado (virgula), KB abaixo de 1 MB e sem limite = sem numero', () => {
  assert.strictEqual(mensagemArquivoGrande(10 * MB), 'Arquivo grande demais (máximo 10 MB)');
  assert.strictEqual(mensagemArquivoGrande(5 * MB), 'Arquivo grande demais (máximo 5 MB)');
  assert.strictEqual(mensagemArquivoGrande(15 * MB), 'Arquivo grande demais (máximo 15 MB)');
  assert.strictEqual(mensagemArquivoGrande(1.5 * MB), 'Arquivo grande demais (máximo 1,5 MB)');
  assert.strictEqual(mensagemArquivoGrande(2048), 'Arquivo grande demais (máximo 2 KB)');
  for (const v of [undefined, null, 0, -1, NaN, Infinity, '10']) {
    assert.strictEqual(mensagemArquivoGrande(v), 'Arquivo grande demais', String(v));
  }
});

// ── 2. comportamento (multer real) ──────────────────────────────────────────────────────

test('acima do limite (2 KB) -> 413 { error: "...maximo 2 KB" } e UM console.warn com metodo e caminho', async () => {
  const { r, warns } = await comWarns(() => request(appUpload({ limite: 2048 })).post('/api/up')
    .attach('foto', Buffer.alloc(3000, 1), { filename: 'a.png', contentType: 'image/png' }));
  assert.strictEqual(r.status, 413, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body, { error: 'Arquivo grande demais (máximo 2 KB)' });
  assert.strictEqual(warns.length, 1, `warns: ${JSON.stringify(warns)}`);
  assert.match(warns[0], /POST/);
  assert.match(warns[0], /\/api\/up/);
});

test('acima do limite de 1 MB -> 413 "maximo 1 MB" (o N vem do limits.fileSize do multer que recusou)', async () => {
  const { r } = await comWarns(() => request(appUpload({ limite: MB })).post('/api/up')
    .attach('foto', Buffer.alloc(MB + 1, 1), { filename: 'a.png', contentType: 'image/png' }));
  assert.strictEqual(r.status, 413, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body, { error: 'Arquivo grande demais (máximo 1 MB)' });
});

test('array() e fields() tambem levam o limite ao erro', async () => {
  for (const metodo of ['array', 'fields']) {
    const { r } = await comWarns(() => request(appUpload({ limite: 2048, metodo })).post('/api/up')
      .attach('foto', Buffer.alloc(3000, 1), { filename: 'a.png', contentType: 'image/png' }));
    assert.strictEqual(r.status, 413, `${metodo}: ${r.status}`);
    assert.deepStrictEqual(r.body, { error: 'Arquivo grande demais (máximo 2 KB)' }, metodo);
  }
});

test('abaixo do limite -> 200 e nenhum warn', async () => {
  const { r, warns } = await comWarns(() => request(appUpload({ limite: 2048 })).post('/api/up')
    .attach('foto', Buffer.alloc(1000, 1), { filename: 'a.png', contentType: 'image/png' }));
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body, { ok: true });
  assert.deepStrictEqual(warns, []);
});

test('multer NAO embrulhado (sem limiteBytes) -> 413 sem numero, nao inventa', async () => {
  const { r } = await comWarns(() => request(appUpload({ limite: 2048, embrulhado: false })).post('/api/up')
    .attach('foto', Buffer.alloc(3000, 1), { filename: 'a.png', contentType: 'image/png' }));
  assert.strictEqual(r.status, 413);
  assert.deepStrictEqual(r.body, { error: 'Arquivo grande demais' });
});

test('outro erro segue adiante: chega ao handler 500; formato recusado continua 400', async () => {
  const app = appUpload({ limite: 2048 });
  const a = await request(app).post('/api/explode');
  assert.strictEqual(a.status, 500);
  assert.strictEqual(a.body.msg, 'outra coisa');
  const { r: b } = await comWarns(() => request(app).post('/api/up')
    .attach('foto', Buffer.alloc(10, 1), { filename: 'a.svg', contentType: 'image/svg+xml' }));
  assert.strictEqual(b.status, 400);
  assert.deepStrictEqual(b.body, { error: 'Formato de imagem não suportado' });
});

test('o embrulho preserva diskStorage/memoryStorage/MulterError e multer sem limits', async () => {
  const m = multerComLimiteNoErro(multerOriginal);
  assert.strictEqual(m.diskStorage, multerOriginal.diskStorage);
  assert.strictEqual(m.memoryStorage, multerOriginal.memoryStorage);
  assert.strictEqual(m.MulterError, multerOriginal.MulterError);
  const up = m({ storage: m.memoryStorage() });
  const app = express();
  app.post('/api/up', up.single('foto'), (req, res) => res.json({ tam: req.file.size }));
  const r = await request(app).post('/api/up').attach('foto', Buffer.alloc(5000, 1), 'a.png');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.tam, 5000);
});

// ── 3. fiacao no index.js ───────────────────────────────────────────────────────────────

test('85: o multer do index.js e o embrulhado (e nao ha outro require de multer no arquivo)', () => {
  // assert.ok + regex.test (e nao assert.match): na falha, assert.match despeja o index.js inteiro.
  assert.ok(/\nconst multer = multerComLimiteNoErro\(require\('multer'\)\);\n/.test(fonteIndex),
    'index.js nao cria os multers pelo embrulho multerComLimiteNoErro');
  assert.strictEqual(fonteIndex.split("require('multer')").length - 1, 1, "require('multer') extra no index.js");
  assert.ok(/const \{ decodificarImagemBase64, filtroImagemMulter, multerComLimiteNoErro, tratarArquivoGrandeDemais, tratarErroFormatoImagem \} = require\('\.\/services\/imagemUpload'\);/
    .test(fonteIndex), 'require do imagemUpload sem multerComLimiteNoErro/tratarArquivoGrandeDemais');
  // O require do imagemUpload tem de vir ANTES do uso em `const multer = ...` (senao TDZ no boot).
  assert.ok(fonteIndex.indexOf("require('./services/imagemUpload')") < fonteIndex.indexOf('const multer = multerComLimiteNoErro('),
    'imagemUpload requerido depois do multer: ReferenceError no boot');
});

test('85: middleware de tamanho registrado uma vez, DEPOIS da ultima rota com multer e ANTES do global', () => {
  const iMw = fonteIndex.indexOf("app.use('/api', tratarArquivoGrandeDemais);");
  // Etapa 86: o global virou modulo (services/errosApi.js); o texto inline que esta regua procurava
  // sumiu — acha o registro dele.
  const iGlobal = fonteIndex.indexOf("app.use('/api', tratarErroGlobalApi);");
  assert.ok(iMw > 0, 'tratarArquivoGrandeDemais nao registrado');
  assert.ok(iGlobal > 0, 'handler global nao encontrado (a regua ficou cega)');
  assert.ok(iMw < iGlobal, 'middleware registrado depois do global: o LIMIT_FILE_SIZE vira 500');
  assert.strictEqual(fonteIndex.split('tratarArquivoGrandeDemais);').length - 1, 1, 'registrado mais de uma vez');

  // Todos os multers do index.js com limits.fileSize (medicao da Fase 0 + os que ela nao listou).
  const multers = [...fonteIndex.matchAll(/const (\w+) = multer\(\{([\s\S]*?)\n\}\);/g)]
    .filter((m) => /fileSize:/.test(m[2])).map((m) => m[1]);
  assert.strictEqual(multers.length, 18, `multers com fileSize: ${multers.length} (${multers.join(', ')})`);
  const iCompras = fonteIndex.indexOf("require('./routes/compras')(app,");
  assert.ok(iCompras > 0, 'montagem de routes/compras nao encontrada');
  const blocoCompras = fonteIndex.slice(iCompras, fonteIndex.indexOf('});', iCompras));
  let iUltimoUso = -1;
  for (const up of multers) {
    const usos = ['single', 'array', 'fields', 'any', 'none'].map((s) => fonteIndex.lastIndexOf(`${up}.${s}(`));
    // uploadGrupoCompras/uploadFornecedor sao usados em routes/compras.js: o "uso" e a montagem.
    if (new RegExp(`\\n  ${up},\\n`).test(blocoCompras)) usos.push(iCompras);
    const ultimo = Math.max(...usos);
    assert.ok(ultimo > 0, `${up}: nenhum uso encontrado (a regua ficou cega)`);
    iUltimoUso = Math.max(iUltimoUso, ultimo);
  }
  assert.ok(iMw > iUltimoUso, `middleware registrado antes da ultima rota com multer (idx ${iUltimoUso}): o erro dela vira 500`);
});

// Etapa 86: a RN-85.03 foi REVISTA e este teste INVERTIDO. Antes afirmava que chat/extended NAO
// usavam o embrulho; agora os tres arquivos de rotas tardias com multer usam (o LIMIT_FILE_SIZE
// deles chega ao tratarArquivoGrandeDemais pelo rotasModulos), e o chat e o /anexos continuam com
// a mensagem propria no callback inline.
test('86 (RN-85.03 revista): multers tardios embrulhados; chat e /anexos continuam com a mensagem propria', () => {
  const chat = fs.readFileSync(path.join(SERVER, 'routes', 'chat.js'), 'utf8');
  const ext = fs.readFileSync(path.join(SERVER, 'routes', 'almoxarifado', 'extended.js'), 'utf8');
  const almox = fs.readFileSync(path.join(SERVER, 'routes', 'almoxarifado.js'), 'utf8');
  assert.match(chat, /err\.code === 'LIMIT_FILE_SIZE'/);
  assert.match(chat, /'Imagem muito grande\. Máximo 10MB\.'/);
  assert.match(ext, /'Arquivo excede o limite de 10 MB'/);
  for (const [nome, fonte] of [['chat.js', chat], ['extended.js', ext], ['almoxarifado.js', almox]]) {
    assert.ok(/\nconst multer = multerComLimiteNoErro\(require\('multer'\)\);\n/.test(fonte), `${nome}: multer sem o embrulho`);
    assert.strictEqual(fonte.split("require('multer')").length - 1, 1, `${nome}: require('multer') extra (cru)`);
  }
});

// Etapa 86 (RN-86.01): os tres handlers registrados UMA vez, nesta ordem, depois do Router dos
// modulos; e todo registrador `require('./routes/...')(` depois do Router recebe `rotasModulos`.
test('86 (RN-86.01): handlers uma vez, em ordem, depois de app.use(rotasModulos); registradores tardios no Router', () => {
  const iRotas = fonteIndex.indexOf('app.use(rotasModulos);');
  assert.ok(iRotas > 0, 'app.use(rotasModulos) nao encontrado (a regua ficou cega)');
  assert.strictEqual(fonteIndex.split('app.use(rotasModulos);').length - 1, 1, 'rotasModulos montado mais de uma vez');
  assert.ok(/\nconst rotasModulos = express\.Router\(\);\napp\.use\(rotasModulos\);\n/.test(fonteIndex), 'rotasModulos nao e um express.Router montado logo apos a criacao');
  const linhas = ["app.use('/api', tratarErroFormatoImagem);", "app.use('/api', tratarArquivoGrandeDemais);", "app.use('/api', tratarErroGlobalApi);"];
  let anterior = iRotas;
  for (const l of linhas) {
    assert.strictEqual(fonteIndex.split(l).length - 1, 1, `${l} registrado ${fonteIndex.split(l).length - 1} vezes`);
    const i = fonteIndex.indexOf(l);
    assert.ok(i > anterior, `${l} fora de ordem (ou antes do app.use(rotasModulos))`);
    anterior = i;
  }
  // Nenhum outro registro de handler de erro global no index.js (nem a versao inline antiga).
  assert.strictEqual(fonteIndex.split('tratarErroGlobalApi').length - 1, 2, 'tratarErroGlobalApi: require + 1 registro');
  assert.ok(!fonteIndex.includes('(err, req, res, next) =>'), 'handler de erro inline no index.js');
  const depois = fonteIndex.slice(iRotas);
  const regs = [...depois.matchAll(/require\('\.\/routes\/([\w/]+)'\)\((\w+)/g)];
  const nomes = regs.map((m) => m[1]);
  for (const esperado of ['modulosTipoConfig', 'requisicoesMaterial', 'almoxarifado', 'frotas', 'producao', 'todolist', 'whatsappGateway', 'chat']) {
    assert.ok(nomes.includes(esperado), `registrador ${esperado} nao encontrado depois do Router (a regua ficou cega)`);
  }
  for (const [, nome, arg] of regs) assert.strictEqual(arg, 'rotasModulos', `routes/${nome} registrado em ${arg}, nao no rotasModulos`);
  // O chat registra dentro do `.then` do initChatSchema: confere que e o require de dentro dele.
  const iThen = fonteIndex.indexOf('initChatSchema(db)');
  assert.ok(iThen > iRotas && fonteIndex.indexOf("require('./routes/chat')(rotasModulos,", iThen) > iThen, 'chat fora do rotasModulos');
  // A extended recebe o `app` do almoxarifado (que agora e o Router) — nada de require('express')() nela.
  const almox = fs.readFileSync(path.join(SERVER, 'routes', 'almoxarifado.js'), 'utf8');
  assert.ok(/require\('\.\/almoxarifado\/extended'\)\(app, db,/.test(almox), 'extended nao recebe o app (Router) do almoxarifado');
});

(async () => {
  for (const [nome, fn] of testes) {
    try {
      await fn();
      passou++;
      console.log(`  ok  ${nome}`);
    } catch (e) {
      falhou++;
      console.log(`  FALHOU  ${nome}\n    ${e && e.stack ? e.stack : e}`);
    }
  }
  console.log(`\nuploadGrandeDemais: ${passou} passou, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
