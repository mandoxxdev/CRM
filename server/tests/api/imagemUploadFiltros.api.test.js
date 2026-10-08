/**
 * Etapa 82 / T3 — RN-82.06: tipo e extensao das imagens enviadas fora do almoxarifado.
 *
 * Tres partes:
 *  1. MODULO `services/imagemUpload.js` (a decisao): `data:image/html`, `svg+xml`, `x-icon`, texto
 *     sem prefixo e `pjpeg` -> erro; jpeg/png/gif/webp -> extensao do mapa do `extensaoSegura`.
 *  2. ROTA REAL no harness: `POST /api/compras/grupos/:id/foto-base64` e
 *     `/api/compras/fornecedores/:id/foto-base64` (routes/compras.js) — 400 com a mensagem exata e
 *     NENHUM arquivo gravado; e multer real com `filtroImagemMulter` + `extensaoSegura(mimetype)`
 *     (nome `x.html` com `image/png` grava `.png`; `image/svg+xml` e recusado).
 *  3. FIACAO no index.js (nao esta no harness, faz listen no import): as 3 rotas base64 usam o
 *     decodificador; os 4 multers usam o filtro e a extensao pelo MIME; o regex velho sumiu.
 *
 * Executar: cd server && node tests/api/imagemUploadFiltros.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const multer = require('multer');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const {
  CODIGO_FORMATO_IMAGEM, decodificarImagemBase64, ehMimeImagemAceito, filtroImagemMulter, MSG_FORMATO_NAO_SUPORTADO,
  tratarErroFormatoImagem,
} = require('../../services/imagemUpload');
const { extensaoSegura } = require('../../services/almoxarifado/urlUpload');

let passou = 0; let falhou = 0;
const testes = [];
function test(nome, fn) { testes.push([nome, fn]); }

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG = Buffer.from(PNG_B64, 'base64');
const HTML_B64 = Buffer.from('<script>alert(document.cookie)</script>').toString('base64');

const SERVER = path.join(__dirname, '..', '..');
const fonteIndex = fs.readFileSync(path.join(SERVER, 'index.js'), 'utf8');
const fonteCompras = fs.readFileSync(path.join(SERVER, 'routes', 'compras.js'), 'utf8');

// ── 1. modulo ────────────────────────────────────────────────────────────────────────────

test('aceitos: png/jpeg/jpg/gif/webp (maiuscula tambem) -> extensao do mapa e o buffer decodificado', () => {
  const casos = [['png', '.png'], ['jpeg', '.jpg'], ['jpg', '.jpg'], ['gif', '.gif'], ['webp', '.webp'], ['PNG', '.png']];
  for (const [tipo, ext] of casos) {
    const r = decodificarImagemBase64(`data:image/${tipo};base64,${PNG_B64}`);
    assert.ok(!r.erro, `${tipo}: ${r.erro}`);
    assert.strictEqual(r.ext, ext, tipo);
    assert.ok(r.buf.equals(PNG), `${tipo}: buffer diferente`);
  }
});

test('base64 com quebra de linha/espaco continua aceito (o familia ja tirava \\s)', () => {
  const r = decodificarImagemBase64(`data:image/png;base64,${PNG_B64.slice(0, 20)}\n ${PNG_B64.slice(20)}`);
  assert.strictEqual(r.ext, '.png');
  assert.ok(r.buf.equals(PNG));
});

test('recusados: html, svg+xml, x-icon, pjpeg, x-png, octet, pdf disfarcado -> erro exato', () => {
  for (const tipo of ['html', 'svg+xml', 'x-icon', 'pjpeg', 'x-png', 'bmp']) {
    const r = decodificarImagemBase64(`data:image/${tipo};base64,${HTML_B64}`);
    assert.deepStrictEqual(r, { erro: MSG_FORMATO_NAO_SUPORTADO }, tipo);
  }
  assert.deepStrictEqual(decodificarImagemBase64(`data:application/pdf;base64,${PNG_B64}`),
    { erro: MSG_FORMATO_NAO_SUPORTADO });
  assert.strictEqual(MSG_FORMATO_NAO_SUPORTADO, 'Formato de imagem não suportado');
});

test('recusados: sem prefixo data: (antes decodificava cru e gravava .jpg), vazio, nao-string', () => {
  for (const v of [PNG_B64, HTML_B64, '', 'data:image/png;base64,', null, undefined, 42, {}]) {
    assert.deepStrictEqual(decodificarImagemBase64(v), { erro: MSG_FORMATO_NAO_SUPORTADO }, String(v).slice(0, 30));
  }
});

test('ehMimeImagemAceito e ancorado no mapa do extensaoSegura (pdf esta no mapa mas nao e imagem)', () => {
  for (const m of ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'IMAGE/PNG']) {
    assert.ok(ehMimeImagemAceito(m), m);
    assert.notStrictEqual(extensaoSegura(m), '.bin', m);
  }
  for (const m of ['application/pdf', 'image/pjpeg', 'image/x-png', 'image/svg+xml', 'text/html', '', undefined]) {
    assert.ok(!ehMimeImagemAceito(m), String(m));
  }
});

// ── multer real com o filtro e a extensao do index.js ───────────────────────────────────

function appMulter(dir) {
  const up = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, dir),
      // Igual ao storage de avatar do index.js (Etapa 82): extensao pelo MIME, nunca pelo nome.
      filename: (req, file, cb) => cb(null, `avatar_1_${Date.now()}${extensaoSegura(file.mimetype)}`),
    }),
    fileFilter: filtroImagemMulter('Apenas imagens'),
  });
  const app = express();
  app.post('/up', up.single('foto'), (req, res) => res.json({ arquivo: req.file && req.file.filename }));
  app.use((err, req, res, next) => res.status(400).json({ error: err.message })); // eslint-disable-line no-unused-vars
  return app;
}

test('multer: image/png com nome payload.html grava .png (a extensao nao vem do nome)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c82b-multer-'));
  try {
    const r = await request(appMulter(dir)).post('/up')
      .attach('foto', PNG, { filename: 'payload.html', contentType: 'image/png' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.match(r.body.arquivo, /\.png$/);
    assert.deepStrictEqual(fs.readdirSync(dir).map((f) => path.extname(f)), ['.png']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('multer: image/svg+xml e image/pjpeg recusados, nada gravado', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c82b-multer-'));
  try {
    for (const contentType of ['image/svg+xml', 'image/pjpeg', 'text/html']) {
      const r = await request(appMulter(dir)).post('/up')
        .attach('foto', Buffer.from('<svg onload="alert(1)"/>'), { filename: 'a.png', contentType });
      assert.strictEqual(r.status, 400, `${contentType}: ${r.status}`);
      assert.strictEqual(r.body.error, 'Apenas imagens');
    }
    assert.deepStrictEqual(fs.readdirSync(dir), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── 2. rota real (routes/compras.js no harness) ─────────────────────────────────────────

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', email: 'admin@test.com' };
// UM app para os cenarios de rota (fechado no fim): criar e fechar um por teste deixava o
// initSchema em segundo plano reclamando de banco fechado.
let appCompartilhado = null;
async function harness() {
  if (!appCompartilhado) appCompartilhado = await createTestApp();
  appCompartilhado.setUser(ADMIN);
  return appCompartilhado;
}

for (const [rotulo, rota] of [['grupos', '/api/compras/grupos/1/foto-base64'], ['fornecedores', '/api/compras/fornecedores/1/foto-base64']]) {
  test(`rota ${rotulo}/foto-base64: html, svg+xml e sem prefixo -> 400 exato, nenhum arquivo gravado`, async () => {
    const t = await harness();
    {
      const dir = path.join(path.dirname(t.uploadsAlmoxDir), 'compras');
      const antes = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
      for (const foto of [`data:image/html;base64,${HTML_B64}`, `data:image/svg+xml;base64,${HTML_B64}`, HTML_B64]) {
        const r = await request(t.app).post(rota).send({ foto_base64: foto });
        assert.strictEqual(r.status, 400, `${foto.slice(0, 25)} -> ${r.status} ${JSON.stringify(r.body)}`);
        assert.deepStrictEqual(r.body, { error: 'Formato de imagem não suportado' });
      }
      const depois = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
      assert.strictEqual(depois, antes, 'gravou arquivo antes de recusar');
    }
  });

  test(`rota ${rotulo}/foto-base64 (controle): png valido passa da validacao e grava .png`, async () => {
    const t = await harness();
    {
      const dir = path.join(path.dirname(t.uploadsAlmoxDir), 'compras');
      const r = await request(t.app).post(rota).send({ foto_base64: `data:image/png;base64,${PNG_B64}` });
      // A tabela core (grupos_compras/fornecedores) pode nao existir no harness: o que importa e
      // que NAO foi o 400 da validacao e que o arquivo gravado tem a extensao do mapa.
      assert.notStrictEqual(r.status, 400, JSON.stringify(r.body));
      const gravados = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
      assert.ok(gravados.length >= 1 && gravados.every((f) => f.endsWith('.png')), JSON.stringify(gravados));
    }
  });
}

// ── 3. fiacao no index.js / compras.js ──────────────────────────────────────────────────

/** Bloco `app.post('<rota>'` ate o `});` de fecho no inicio de linha. */
function bloco(src, rota) {
  const i = src.indexOf(`app.post('${rota}'`);
  assert.ok(i >= 0, `rota ${rota} nao encontrada`);
  const fim = src.indexOf('\n});', i);
  return src.slice(i, fim);
}

test('fiacao: as 5 rotas base64 usam decodificarImagemBase64 e respondem 400 com img.erro', () => {
  const rotas = [
    [fonteIndex, '/api/grupos/:id/foto-base64'],
    [fonteIndex, '/api/familias/:id/foto-base64'],
    [fonteIndex, '/api/familias/:id/esquematico-base64'],
    [fonteCompras, '/api/compras/grupos/:id/foto-base64'],
    [fonteCompras, '/api/compras/fornecedores/:id/foto-base64'],
  ];
  for (const [src, rota] of rotas) {
    const b = bloco(src, rota);
    assert.match(b, /(var|const) img = decodificarImagemBase64\(b64\);\n\s*if \(img\.erro\) return res\.status\(400\)\.json\(\{ error: img\.erro \}\);/, rota);
    assert.match(b, /(var|const) ext = img\.ext;/, rota);
    assert.ok(!/b64\.match\(|Buffer\.from\(b64/.test(b), `${rota}: ainda decodifica por conta propria`);
  }
});

test('fiacao: o regex velho data:image/(\\w+) sumiu de index.js e routes/', () => {
  const velho = 'data:image\\/(\\w+)';
  const rotas = fs.readdirSync(path.join(SERVER, 'routes')).filter((f) => f.endsWith('.js'))
    .map((f) => [f, fs.readFileSync(path.join(SERVER, 'routes', f), 'utf8')]);
  const achados = [['index.js', fonteIndex], ...rotas].filter(([, s]) => s.includes(velho)).map(([f]) => f);
  assert.deepStrictEqual(achados, []);
  // controle do proprio scanner: a string que ele procura existe no git (o texto antigo).
  assert.ok('var match = b64.match(/^data:image\\/(\\w+);base64,(.+)$/);'.includes(velho));
});

function blocoMulter(nome) {
  const i = fonteIndex.indexOf(`const ${nome} = multer(`);
  assert.ok(i >= 0, `${nome} nao encontrado`);
  return fonteIndex.slice(i, fonteIndex.indexOf('\n});', i));
}
function blocoStorage(nome) {
  const i = fonteIndex.indexOf(`const ${nome} = multer.diskStorage(`);
  assert.ok(i >= 0, `${nome} nao encontrado`);
  return fonteIndex.slice(i, fonteIndex.indexOf('\n});', i));
}

test('fiacao: os 4 multers (grupos-compras, fornecedores, avatar, foto da proposta) — filtro e extensao pelo MIME', () => {
  const pares = [['uploadGrupoCompras', 'storageGruposCompras'], ['uploadFornecedor', 'storageFornecedor'],
    ['uploadAvatar', 'storageAvatar'], ['uploadPropostaFoto', 'storagePropostaFoto']];
  for (const [up, st] of pares) {
    const bu = blocoMulter(up);
    assert.match(bu, new RegExp(`storage: ${st},`), up);
    assert.match(bu, /fileFilter: filtroImagemMulter\(/, up);
    assert.ok(!/allowed(Types)?\s*=\s*\//.test(bu), `${up}: regex solto ainda presente`);
    const bs = blocoStorage(st);
    assert.match(bs, /const ext = extensaoSegura\(file\.mimetype\);/, st);
    assert.ok(!/const ext = path\.extname\(file\.originalname\)/.test(bs), `${st}: extensao ainda vem do nome`);
  }
});

test('fiacao: index.js importa extensaoSegura de urlUpload e o filtro/decodificador de imagemUpload', () => {
  assert.match(fonteIndex, /const \{ cabecalhosUploadSeguro, cabecalhosUploadLogo, extensaoSegura \} = require\('\.\/services\/almoxarifado\/urlUpload'\);/);
  // Etapa 83: o mesmo require ganhou o tratarErroFormatoImagem.
  // Etapa 85: o require ganhou multerComLimiteNoErro/tratarArquivoGrandeDemais e subiu no arquivo.
  assert.ok(/const \{ decodificarImagemBase64, filtroImagemMulter, [\w, ]*tratarErroFormatoImagem \} = require\('\.\/services\/imagemUpload'\);/
    .test(fonteIndex), 'require do imagemUpload sem tratarErroFormatoImagem');
  assert.match(fonteCompras, /const \{ decodificarImagemBase64 \} = require\('\.\.\/services\/imagemUpload'\);/);
});

// ── 4. Etapa 83 — os outros 10 multers de imagem, o erro 400 e a regua do index.js inteiro ──

test('83: o filtro marca a recusa com codigo FORMATO_IMAGEM (e aceita so o mapa)', async () => {
  const filtro = filtroImagemMulter('msg do log');
  const chamar = (mimetype) => new Promise((resolve) => filtro({}, { mimetype, originalname: 'x.png' }, (err, ok) => resolve({ err, ok })));
  for (const m of ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg', 'IMAGE/JPEG']) {
    const r = await chamar(m);
    assert.ok(!r.err && r.ok === true, m);
  }
  for (const m of ['image/svg+xml', 'image/pjpeg', 'image/x-png', 'image/apng', 'image/x-citrix-jpeg', 'text/html', '', undefined]) {
    const r = await chamar(m);
    assert.ok(r.err, `${m}: aceito`);
    assert.strictEqual(r.err.codigo, CODIGO_FORMATO_IMAGEM, String(m));
    assert.strictEqual(r.err.message, 'msg do log');
  }
  assert.strictEqual(CODIGO_FORMATO_IMAGEM, 'FORMATO_IMAGEM');
});

test('83: SVG e excecao LOCAL (mimesExtras) — fora do mapa compartilhado do extensaoSegura', async () => {
  // O mapa e compartilhado com almoxarifado, chat e os multers da 82: SVG nele abriria todos.
  assert.strictEqual(extensaoSegura('image/svg+xml'), '.bin');
  assert.ok(!ehMimeImagemAceito('image/svg+xml'));
  const comSvg = filtroImagemMulter('x', { mimesExtras: ['image/svg+xml'] });
  const semSvg = filtroImagemMulter('x');
  const r1 = await new Promise((res) => comSvg({}, { mimetype: 'image/svg+xml' }, (err, ok) => res({ err, ok })));
  const r2 = await new Promise((res) => semSvg({}, { mimetype: 'image/svg+xml' }, (err, ok) => res({ err, ok })));
  assert.ok(!r1.err && r1.ok === true, 'logo da empresa deveria aceitar SVG');
  assert.ok(r2.err && r2.err.codigo === CODIGO_FORMATO_IMAGEM, 'sem a excecao, SVG tem de ser recusado');
});

/** App com o middleware de erro REAL (exportado) antes de um "global" que responde 500 como o do index.js. */
function appComMiddlewareReal(dir) {
  const up = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, dir),
      filename: (req, file, cb) => {
        const name = path.basename(file.originalname, path.extname(file.originalname));
        const ext = extensaoSegura(file.mimetype);
        cb(null, `produto_1_${Date.now()}_${name.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`);
      },
    }),
    fileFilter: filtroImagemMulter('Apenas imagens são permitidas (jpeg, jpg, png, gif, webp)'),
  });
  const app = express();
  app.post('/api/up', up.single('imagem'), (req, res) => res.json({ arquivo: req.file && req.file.filename }));
  app.post('/api/explode', (req, res, next) => next(new Error('outro erro qualquer')));
  app.use('/api', tratarErroFormatoImagem);
  // eslint-disable-next-line no-unused-vars
  app.use('/api', (err, req, res, next) => res.status(500).json({ error: 'Erro interno do servidor' }));
  return app;
}

test('83: middleware real -> recusa de formato vira 400 literal (antes caia no global = 500); nada gravado', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c83-mw-'));
  // A mensagem especifica do filtro vai para o log (console.warn) — capturada aqui, sem poluir a saida.
  const warnOriginal = console.warn;
  const avisos = [];
  console.warn = (...args) => avisos.push(args);
  try {
    const app = appComMiddlewareReal(dir);
    for (const contentType of ['image/svg+xml', 'text/html', 'image/pjpeg']) {
      const r = await request(app).post('/api/up')
        .attach('imagem', Buffer.from('<svg onload="alert(1)"/>'), { filename: 'x.svg', contentType });
      assert.strictEqual(r.status, 400, `${contentType}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.deepStrictEqual(r.body, { error: 'Formato de imagem não suportado' });
    }
    assert.deepStrictEqual(fs.readdirSync(dir), []);
    assert.strictEqual(avisos.length, 3, `esperado 1 warn por recusa: ${JSON.stringify(avisos)}`);
    assert.deepStrictEqual(avisos[0], ['[upload] formato recusado:',
      'Apenas imagens são permitidas (jpeg, jpg, png, gif, webp)', 'POST', '/api/up']);
    // Controle: outro erro NAO e engolido pelo middleware — segue para o global (500), sem warn.
    const outro = await request(app).post('/api/explode');
    assert.strictEqual(outro.status, 500);
    assert.strictEqual(avisos.length, 3);
  } finally {
    console.warn = warnOriginal;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('83: foto.html com image/png grava produto_<id>_<ms>_foto.png; foto.jfif image/jpeg -> _foto.jpg (miolo sem extensao)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c83-mw-'));
  try {
    const app = appComMiddlewareReal(dir);
    const r1 = await request(app).post('/api/up').attach('imagem', PNG, { filename: 'foto.html', contentType: 'image/png' });
    assert.strictEqual(r1.status, 200, JSON.stringify(r1.body));
    assert.match(r1.body.arquivo, /^produto_1_\d+_foto\.png$/);
    const r2 = await request(app).post('/api/up').attach('imagem', PNG, { filename: 'foto.jfif', contentType: 'image/jpeg' });
    assert.match(r2.body.arquivo, /^produto_1_\d+_foto\.jpg$/, 'miolo nao pode virar foto_jfif nem foto_jpeg');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Listas EXPLICITAS (RN-83.02). Um storage novo no index.js tem de entrar numa delas, senao a regua
// de completude abaixo fica vermelha — e quem o adicionar decide de que lado ele esta.
const STORAGES_IMAGEM = [
  'storageProdutos', 'storageMateriaisEscritorio', 'storageFamilias', 'storageGrupos',
  'storageGruposCompras', 'storageFornecedor', 'storageLogos', 'storageAvatar', 'storageClienteLogo',
  'storageHeader', 'storageFooter', 'storageCover', 'storagePropostaFoto', 'storageFamiliaEsquematico',
];
const STORAGES_DOCUMENTO = ['storage', 'storagePropostaPdf', 'storageComprovantes', 'storageContrato'];

// [multer, storage, prefixo do nome gravado (RN-83.03: inalterado), tem miolo do nome original]
const MULTERS_83 = [
  ['uploadProduto', 'storageProdutos', '`produto_${produtoId}_${timestamp}_', true],
  ['uploadMaterialEscritorioFoto', 'storageMateriaisEscritorio', '`material_escritorio_${materialId}_${timestamp}_', true],
  ['uploadFamilia', 'storageFamilias', '`familia_${familiaId}_${timestamp}_', true],
  ['uploadGrupo', 'storageGrupos', '`grupo_${grupoId}_${timestamp}_', true],
  ['uploadLogo', 'storageLogos', '`logo_${timestamp}_', true],
  ['uploadClienteLogo', 'storageClienteLogo', '`cliente_${clienteId}_${timestamp}_', true],
  ['uploadHeader', 'storageHeader', '`header_${timestamp}_', true],
  ['uploadFooter', 'storageFooter', '`footer_${timestamp}_', true],
  ['uploadCover', 'storageCover', '`cover_${timestamp}_', true],
  ['uploadFamiliaEsquematico', 'storageFamiliaEsquematico', '`esquematico_${familiaId}_${Date.now()}', false],
];

test('83: os 10 multers — filtroImagemMulter, sem regex solto, extensao pelo MIME, prefixo e miolo preservados', () => {
  const MIOLO = 'const name = path.basename(file.originalname, path.extname(file.originalname));';
  for (const [up, st, prefixo, temMiolo] of MULTERS_83) {
    const bu = blocoMulter(up);
    assert.match(bu, new RegExp(`storage: ${st},`), up);
    assert.match(bu, /fileFilter: filtroImagemMulter\(/, up);
    assert.ok(!/allowed(Types)?\s*=\s*\/|\.test\(file\.mimetype\)|\.test\(path\.extname/.test(bu), `${up}: regex solto ainda presente`);
    const bs = blocoStorage(st);
    if (up === 'uploadLogo') {
      assert.match(bs, /const ext = String\(file\.mimetype \|\| ''\)\.toLowerCase\(\) === MIME_SVG_LOGO_EMPRESA \? '\.svg' : extensaoSegura\(file\.mimetype\);/, st);
    } else {
      assert.match(bs, /const ext = extensaoSegura\(file\.mimetype\);/, st);
    }
    assert.ok(bs.includes(prefixo), `${st}: prefixo ${prefixo} mudou`);
    if (temMiolo) {
      assert.ok(bs.includes(MIOLO), `${st}: miolo nao vem de basename(originalname, extname(originalname))`);
      assert.ok(!/path\.basename\(file\.originalname, ext\)/.test(bs), `${st}: miolo pela extensao do MIME gera foto_jpeg`);
    }
  }
});

test('83: SVG so no uploadLogo (mimesExtras local); nenhum outro multer/storage fala de svg', () => {
  assert.match(fonteIndex, /const MIME_SVG_LOGO_EMPRESA = 'image\/svg\+xml';/);
  assert.match(blocoMulter('uploadLogo'), /filtroImagemMulter\([^\n]*\{ mimesExtras: \[MIME_SVG_LOGO_EMPRESA\] \}\)/);
  for (const [up, st] of MULTERS_83.filter(([u]) => u !== 'uploadLogo')) {
    assert.ok(!/svg|mimesExtras/i.test(blocoMulter(up)), `${up}: aceita SVG`);
    assert.ok(!/svg/i.test(blocoStorage(st)), `${st}: grava .svg`);
  }
  const fonteUrlUpload = fs.readFileSync(path.join(SERVER, 'services', 'almoxarifado', 'urlUpload.js'), 'utf8');
  const mapa = fonteUrlUpload.slice(fonteUrlUpload.indexOf('const EXTENSAO_POR_MIME'), fonteUrlUpload.indexOf('});', fonteUrlUpload.indexOf('const EXTENSAO_POR_MIME')));
  assert.ok(mapa.length > 0 && !/svg/i.test(mapa), 'SVG entrou no mapa compartilhado');
});

test('83 (RN-83.02): todo multer.diskStorage do index.js esta numa lista; nos de imagem a extensao nao vem do nome', () => {
  const total = fonteIndex.split('multer.diskStorage(').length - 1;
  const nomes = [...fonteIndex.matchAll(/const (\w+) = multer\.diskStorage\(/g)].map((m) => m[1]);
  assert.strictEqual(nomes.length, total, 'ha multer.diskStorage( fora do padrao "const X = multer.diskStorage("');
  assert.ok(total >= 18, `so ${total} storages — a varredura esta lendo o arquivo certo?`);
  const listados = [...STORAGES_IMAGEM, ...STORAGES_DOCUMENTO];
  assert.deepStrictEqual(nomes.filter((n) => !listados.includes(n)), [], 'storage novo sem lista (imagem ou documento?)');
  assert.deepStrictEqual(listados.filter((n) => !nomes.includes(n)), [], 'storage listado sumiu do index.js');
  for (const st of STORAGES_IMAGEM) {
    const bs = blocoStorage(st);
    assert.ok(!bs.includes('const ext = path.extname(file.originalname)'), `${st}: extensao ainda vem do nome`);
    assert.match(bs, /const ext = [^\n]*extensaoSegura\(file\.mimetype\);/, st);
  }
  // Controle do scanner: os de documento AINDA usam a extensao do nome — se a busca nao achasse
  // isso, ela tambem nao acharia o defeito num storage de imagem.
  assert.ok(STORAGES_DOCUMENTO.some((st) => blocoStorage(st).includes('const ext = path.extname(file.originalname)')));
});

/**
 * Expressao do nome gravado: o argumento do `cb(null, ...)` da funcao `filename:` — ou, quando ele e
 * a variavel `filename`, o lado direito do `const filename = ...;`.
 */
function expressaoNomeGravado(st) {
  const bs = blocoStorage(st);
  const corpo = bs.slice(bs.indexOf('filename: (req, file, cb) =>'));
  assert.ok(corpo.length < bs.length, `${st}: funcao filename nao encontrada`);
  const cbs = [...corpo.matchAll(/\bcb\(null, (.+)\);/g)].map((m) => m[1]);
  assert.strictEqual(cbs.length, 1, `${st}: esperado 1 cb(null, ...) no filename, achou ${cbs.length}`);
  let expr = cbs[0];
  if (expr === 'filename') {
    const m = corpo.match(/const filename = (.+);/);
    assert.ok(m, `${st}: cb(null, filename) sem const filename`);
    expr = m[1];
  }
  return { corpo, expr };
}

test('83 (mutacao A): nos 14 storages de imagem o nome gravado TERMINA com a ext segura; extname(originalname) so no miolo', () => {
  const MIOLO = 'path.basename(file.originalname, path.extname(file.originalname))';
  for (const st of STORAGES_IMAGEM) {
    const { corpo, expr } = expressaoNomeGravado(st);
    // Declarar `const ext = extensaoSegura(...)` nao basta: o nome tem de USAR `ext`, e no fim.
    assert.ok(/\$\{ext\}`$/.test(expr) || /\+ ext$/.test(expr), `${st}: nome gravado nao termina com a ext segura: ${expr}`);
    assert.ok(!expr.includes('extname(file.originalname)'), `${st}: nome gravado usa extname(originalname): ${expr}`);
    // Fora do miolo `basename(originalname, extname(originalname))`, nada na funcao le a extensao do nome.
    assert.ok(!corpo.split(MIOLO).join('').includes('extname(file.originalname)'), `${st}: extname(originalname) fora do miolo`);
  }
  // Controle positivo: a mutacao A (`${ext}` -> `${path.extname(file.originalname)}`) e pega por ambas as checagens.
  const mutante = '`produto_${produtoId}_${timestamp}_${name.replace(/[^a-zA-Z0-9]/g, \'_\')}${path.extname(file.originalname)}`';
  assert.ok(!/\$\{ext\}`$/.test(mutante) && mutante.includes('extname(file.originalname)'));
});

test('83: todo multer( de storage de imagem usa filtroImagemMulter', () => {
  const multers = [...fonteIndex.matchAll(/const (\w+) = multer\(\{\n\s*storage: (\w+),/g)];
  assert.strictEqual(multers.length, fonteIndex.split(' = multer({').length - 1, 'multer( fora do padrao');
  const deImagem = multers.filter((m) => STORAGES_IMAGEM.includes(m[2]));
  assert.strictEqual(deImagem.length, STORAGES_IMAGEM.length);
  for (const [, up] of deImagem) assert.match(blocoMulter(up), /fileFilter: filtroImagemMulter\(/, up);
});

test('83: middleware de formato registrado no /api ANTES do handler global (que responde 500)', () => {
  const iMw = fonteIndex.indexOf("app.use('/api', tratarErroFormatoImagem);");
  // Etapa 86: o global saiu do index.js para services/errosApi.js; a regua da 83 procurava o texto
  // inline `app.use('/api', (err, req, res, next) => {` e ficaria cega. Agora acha o registro dele.
  const iGlobal = fonteIndex.indexOf("app.use('/api', tratarErroGlobalApi);");
  assert.ok(iMw > 0, 'tratarErroFormatoImagem nao registrado');
  assert.ok(iGlobal > 0, 'handler global nao encontrado (a regua ficou cega)');
  assert.ok(iMw < iGlobal, 'middleware registrado depois do global: a recusa vira 500');
  assert.strictEqual(fonteIndex.split('tratarErroFormatoImagem);').length - 1, 1, 'registrado mais de uma vez');
  assert.ok(!fonteIndex.includes("app.use('/api', (err, req, res, next) => {"), 'handler global inline voltou ao index.js');
  // Etapa 86: o Router dos modulos vem ANTES dos handlers (senao as rotas dele nao chegam a eles).
  const iRotas = fonteIndex.indexOf('app.use(rotasModulos);');
  assert.ok(iRotas > 0 && iRotas < iMw, 'app.use(rotasModulos) ausente ou depois do tratarErroFormatoImagem');
  // Mutacao B: registrado ANTES das rotas, o Express nunca o alcanca depois do erro do multer (error
  // middleware so pega erro de quem foi registrado antes dele) e a recusa volta a ser 500. Tem de vir
  // DEPOIS do ultimo uso de qualquer um dos 14 multers de imagem.
  const multersImagem = [...fonteIndex.matchAll(/const (\w+) = multer\(\{\n\s*storage: (\w+),/g)]
    .filter((m) => STORAGES_IMAGEM.includes(m[2])).map((m) => m[1]);
  assert.strictEqual(multersImagem.length, 14, `multers de imagem: ${multersImagem.length}`);
  const iCompras = fonteIndex.indexOf("require('./routes/compras')(app,");
  assert.ok(iCompras > 0, 'montagem de routes/compras nao encontrada');
  let iUltimoUso = -1;
  for (const up of multersImagem) {
    const usos = [`${up}.single(`, `${up}.array(`, `${up}.fields(`].map((s) => fonteIndex.lastIndexOf(s));
    // uploadGrupoCompras/uploadFornecedor sao usados em routes/compras.js: o "uso" e a montagem.
    if (new RegExp(`\\n  ${up},\\n`).test(fonteIndex.slice(iCompras, fonteIndex.indexOf('});', iCompras)))) usos.push(iCompras);
    const ultimo = Math.max(...usos);
    assert.ok(ultimo > 0, `${up}: nenhum uso encontrado (a regua ficou cega)`);
    iUltimoUso = Math.max(iUltimoUso, ultimo);
  }
  assert.ok(iMw > iUltimoUso, `middleware registrado antes da ultima rota com multer de imagem (idx ${iUltimoUso}): a recusa vira 500`);
  // Etapa 85: o require ganhou multerComLimiteNoErro/tratarArquivoGrandeDemais e subiu no arquivo.
  assert.ok(/const \{ decodificarImagemBase64, filtroImagemMulter, [\w, ]*tratarErroFormatoImagem \} = require\('\.\/services\/imagemUpload'\);/
    .test(fonteIndex), 'require do imagemUpload sem tratarErroFormatoImagem');
});

test('83: o multer morto uploadChat sumiu (o chat usa o de routes/chat.js)', () => {
  assert.ok(!/\buploadChat\b|\bstorageChat\b/.test(fonteIndex));
  assert.match(fs.readFileSync(path.join(SERVER, 'routes', 'chat.js'), 'utf8'), /multer/);
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
  if (appCompartilhado) await appCompartilhado.close();
  console.log(`\nimagemUploadFiltros: ${passou} passou, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
