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
  decodificarImagemBase64, ehMimeImagemAceito, filtroImagemMulter, MSG_FORMATO_NAO_SUPORTADO,
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
  assert.match(fonteIndex, /const \{ decodificarImagemBase64, filtroImagemMulter \} = require\('\.\/services\/imagemUpload'\);/);
  assert.match(fonteCompras, /const \{ decodificarImagemBase64 \} = require\('\.\.\/services\/imagemUpload'\);/);
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
