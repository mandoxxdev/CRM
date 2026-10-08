/**
 * Etapa 86 / T1 — RN-86.01..03: erro das rotas dos modulos montados por ultimo vira JSON.
 *
 * Ate a 85 os handlers de erro do `/api` (formato -> tamanho -> global) eram registrados no
 * `index.js` ANTES dos registradores do almoxarifado/extended/frotas/producao/todolist/chat — e o
 * extended e o chat registram ate depois do `listen`. Um `next(err)` dessas rotas (multer acima do
 * limite, fileFilter recusando) caia no finalhandler do Express: 500 `text/html` com stack. Agora os
 * registradores recebem o Router `rotasModulos`, montado antes dos handlers.
 *
 * Duas partes:
 *  1. ROTAS DE VERDADE pelo harness (tests/helpers/testApp.js monta o mesmo Router e os mesmos tres
 *     handlers exportados, ANTES de a extended registrar — que registra num callback do sqlite);
 *  2. o handler global ISOLADO (`tratarErroGlobalApi`): 4xx preservado em portugues, nunca o
 *     `err.message` cru de terceiros; SQLITE_BUSY 503; 500 com `message` so em development.
 *
 * Executar: cd server && node tests/api/errosModulosJson.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { tratarArquivoGrandeDemais, tratarErroFormatoImagem } = require('../../services/imagemUpload');
const { tratarErroGlobalApi, erroComMensagemUsuario } = require('../../services/errosApi');

let passou = 0; let falhou = 0;
const testes = [];
function test(nome, fn) { testes.push([nome, fn]); }

const MB = 1024 * 1024;
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

/** Silencia console.warn/error durante `fn` (os handlers logam cada recusa). */
async function quieto(fn) {
  const w = console.warn; const e = console.error;
  console.warn = () => {}; console.error = () => {};
  try { return await fn(); } finally { console.warn = w; console.error = e; }
}

function ehJson(r) {
  assert.match(String(r.headers['content-type'] || ''), /application\/json/, `content-type: ${r.headers['content-type']} corpo: ${String(r.text).slice(0, 120)}`);
}

let ctx;

// ── 1. rotas de verdade (harness) ───────────────────────────────────────────────────────

test('foto de material acima de 10 MB -> 413 JSON "maximo 10 MB" (almoxarifado.js, registro sincrono)', async () => {
  const r = await quieto(() => request(ctx.app).post('/api/almoxarifado/materiais/1/foto')
    .attach('foto', Buffer.alloc(11 * MB, 1), { filename: 'a.png', contentType: 'image/png' }));
  assert.strictEqual(r.status, 413, r.text.slice(0, 200));
  ehJson(r);
  assert.strictEqual(r.body.error, 'Arquivo grande demais (máximo 10 MB)');
});

test('foto de material em campo inesperado -> 400 JSON "Upload inválido" (MulterError nao-tamanho)', async () => {
  const r = await quieto(() => request(ctx.app).post('/api/almoxarifado/materiais/1/foto')
    .attach('outro', PNG, { filename: 'a.png', contentType: 'image/png' }));
  assert.strictEqual(r.status, 400, r.text.slice(0, 200));
  ehJson(r);
  assert.strictEqual(r.body.error, 'Upload inválido');
});

test('foto de material com formato recusado -> 400 JSON com a mensagem do filtro', async () => {
  const r = await quieto(() => request(ctx.app).post('/api/almoxarifado/materiais/1/foto')
    .attach('foto', Buffer.from('<svg/>'), { filename: 'a.svg', contentType: 'image/svg+xml' }));
  assert.strictEqual(r.status, 400, r.text.slice(0, 200));
  ehJson(r);
  assert.strictEqual(r.body.error, 'Apenas imagens são permitidas');
});

test('certificado de lote com formato recusado -> 400 JSON com a mensagem do filtro, nada gravado', async () => {
  const antes = fs.readdirSync(ctx.uploadsAlmoxDir).filter((n) => n.startsWith('certificado-')).length;
  const r = await quieto(() => request(ctx.app).post('/api/almoxarifado/lotes/1/certificado')
    .attach('certificado', Buffer.from('texto'), { filename: 'c.txt', contentType: 'text/plain' }));
  assert.strictEqual(r.status, 400, r.text.slice(0, 200));
  ehJson(r);
  assert.strictEqual(r.body.error, 'Certificado deve ser PDF ou imagem');
  assert.strictEqual(fs.readdirSync(ctx.uploadsAlmoxDir).filter((n) => n.startsWith('certificado-')).length, antes);
});

test('extended (registrada ASSINCRONA, depois dos handlers): assinatura de 3 MB -> 413 JSON "maximo 2 MB"', async () => {
  const r = await quieto(() => request(ctx.app).post('/api/almoxarifado/requisicoes/1/assinatura-entrega')
    .field('recebedor_nome', 'Fulano')
    .attach('assinatura', Buffer.alloc(3 * MB, 1), { filename: 'a.png', contentType: 'image/png' }));
  assert.strictEqual(r.status, 413, r.text.slice(0, 200));
  ehJson(r);
  assert.strictEqual(r.body.error, 'Arquivo grande demais (máximo 2 MB)');
});

test('extended: calibracao com formato recusado -> 400 JSON com a mensagem do filtro', async () => {
  const r = await quieto(() => request(ctx.app).post('/api/almoxarifado/ferramentas/1/calibracoes')
    .attach('certificado', Buffer.from('texto'), { filename: 'c.txt', contentType: 'text/plain' }));
  // Se a rota de calibracao mudar de caminho, o teste falha com 404 (nao passa vazio).
  assert.strictEqual(r.status, 400, r.text.slice(0, 200));
  ehJson(r);
  assert.strictEqual(r.body.error, 'Certificado deve ser PDF ou imagem');
});

test('extended /anexos continua com a mensagem PROPRIA (400 "Arquivo excede o limite de 10 MB")', async () => {
  const r = await quieto(() => request(ctx.app).post('/api/almoxarifado/anexos')
    .attach('arquivo', Buffer.alloc(11 * MB, 1), { filename: 'a.pdf', contentType: 'application/pdf' }));
  assert.strictEqual(r.status, 400, r.text.slice(0, 200));
  ehJson(r);
  assert.strictEqual(r.body.error, 'Arquivo excede o limite de 10 MB');
});

// O antigo "JSON malformado numa rota do modulo" nao provava nada do Router: o `express.json` roda
// ANTES de qualquer rota (no `app`), entao o 400 dele chegaria ao handler com ou sem `rotasModulos`.
// O que prova o Router e uma rota registrada nele DEPOIS dos handlers (como a extended e o chat) —
// e o controle, a mesma rota no `app`, que cai no finalhandler.
test('rota registrada TARDE no rotasModulos (depois dos handlers) -> erro dela chega ao handler: JSON', async () => {
  ctx.rotasModulos.get('/api/almoxarifado/__erro-tardio-86', (req, res, next) => next(erroComMensagemUsuario('Erro tardio do modulo', 422)));
  const r = await quieto(() => request(ctx.app).get('/api/almoxarifado/__erro-tardio-86'));
  assert.strictEqual(r.status, 422, r.text.slice(0, 200));
  ehJson(r);
  assert.deepStrictEqual(r.body, { error: 'Erro tardio do modulo' });
});

test('controle: a MESMA rota tardia no `app` (sem Router) cai no finalhandler -> nao JSON', async () => {
  ctx.app.get('/api/almoxarifado/__erro-tardio-86-app', (req, res, next) => next(erroComMensagemUsuario('Erro tardio do modulo', 422)));
  const r = await quieto(() => request(ctx.app).get('/api/almoxarifado/__erro-tardio-86-app'));
  assert.doesNotMatch(String(r.headers['content-type'] || ''), /application\/json/, 'sem o Router o erro nao deveria virar JSON');
});

test('JSON malformado (body-parser, antes de qualquer rota) -> 400 "JSON inválido no corpo da requisição"', async () => {
  const r = await quieto(() => request(ctx.app).post('/api/almoxarifado/materiais')
    .set('Content-Type', 'application/json').send('{"nome": "x",}'));
  assert.strictEqual(r.status, 400, r.text.slice(0, 200));
  ehJson(r);
  assert.strictEqual(r.body.error, 'JSON inválido no corpo da requisição');
  assert.ok(!/Unexpected|JSON at position|token/i.test(r.text), `texto do parser vazou: ${r.text}`);
});

test('corpo acima do limite do express.json (app proprio, 15mb como producao) -> 413 em portugues', async () => {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.post('/api/x', (req, res) => res.json({ ok: true }));
  app.use('/api', tratarErroFormatoImagem);
  app.use('/api', tratarArquivoGrandeDemais);
  app.use('/api', tratarErroGlobalApi);
  const corpo = JSON.stringify({ d: 'a'.repeat(16 * MB) });
  const r = await quieto(() => request(app).post('/api/x').set('Content-Type', 'application/json').send(corpo));
  assert.strictEqual(r.status, 413, r.text.slice(0, 200));
  ehJson(r);
  assert.strictEqual(r.body.error, 'Requisição grande demais (máximo 15 MB)');
  assert.ok(!/entity too large/i.test(r.text), r.text);
});

// ── 2. handler global isolado ───────────────────────────────────────────────────────────

function appComErro(err) {
  const app = express();
  app.get('/api/x', (req, res, next) => next(err));
  app.use('/api', tratarErroGlobalApi);
  return app;
}

const CORPO_503 = {
  error: 'Banco de dados temporariamente ocupado. Tente novamente em alguns segundos.',
  retryAfter: 2,
};

test('SQLITE_BUSY so pelo code (mensagem neutra) -> 503 com o texto exato', async () => {
  const err = Object.assign(new Error('falha ao gravar'), { code: 'SQLITE_BUSY' });
  const r = await quieto(() => request(appComErro(err)).get('/api/x'));
  assert.strictEqual(r.status, 503);
  assert.deepStrictEqual(r.body, CORPO_503);
});

test('"database is locked" so pela mensagem (sem code) -> 503 com o texto exato', async () => {
  const r = await quieto(() => request(appComErro(new Error('database is locked'))).get('/api/x'));
  assert.strictEqual(r.status, 503);
  assert.deepStrictEqual(r.body, CORPO_503);
});

test('erro sem status -> 500 "Erro interno do servidor"; message so em development', async () => {
  const orig = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    let r = await quieto(() => request(appComErro(new Error('detalhe interno'))).get('/api/x'));
    assert.strictEqual(r.status, 500);
    assert.deepStrictEqual(r.body, { error: 'Erro interno do servidor' });
    process.env.NODE_ENV = 'development';
    r = await quieto(() => request(appComErro(new Error('detalhe interno'))).get('/api/x'));
    assert.strictEqual(r.status, 500);
    assert.strictEqual(r.body.message, 'detalhe interno');
  } finally { if (orig === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = orig; }
});

test('4xx de terceiro com texto em ingles -> mesmo status, "Requisição inválida", nunca o err.message', async () => {
  const err = Object.assign(new Error('request aborted by upstream'), { status: 409, expose: true });
  const r = await quieto(() => request(appComErro(err)).get('/api/x'));
  assert.strictEqual(r.status, 409);
  assert.deepStrictEqual(r.body, { error: 'Requisição inválida' });
});

test('erroComMensagemUsuario -> 400 com a mensagem; statusCode tambem e respeitado', async () => {
  let r = await quieto(() => request(appComErro(erroComMensagemUsuario('Formato X recusado'))).get('/api/x'));
  assert.strictEqual(r.status, 400);
  assert.deepStrictEqual(r.body, { error: 'Formato X recusado' });
  r = await quieto(() => request(appComErro(Object.assign(new Error('x'), { statusCode: 422 }))).get('/api/x'));
  assert.strictEqual(r.status, 422);
  assert.deepStrictEqual(r.body, { error: 'Requisição inválida' });
});

test('404 de terceiro sem ENOENT -> 404 "Recurso não encontrado" (nao "Requisição inválida")', async () => {
  const r = await quieto(() => request(appComErro(Object.assign(new Error('Not Found'), { statusCode: 404 }))).get('/api/x'));
  assert.strictEqual(r.status, 404);
  assert.deepStrictEqual(r.body, { error: 'Recurso não encontrado' });
});

test('res.sendFile de arquivo ausente (ENOENT, como extended.js anexos) -> 404 "Arquivo não encontrado", sem Content-Disposition', async () => {
  const app = express();
  app.get('/api/baixar', (req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio.pdf"');
    res.sendFile(require('path').join(require('os').tmpdir(), `nao-existe-${Date.now()}-${Math.random()}.pdf`));
  });
  app.use('/api', tratarErroGlobalApi);
  const r = await quieto(() => request(app).get('/api/baixar'));
  assert.strictEqual(r.status, 404, r.text.slice(0, 200));
  ehJson(r);
  assert.deepStrictEqual(r.body, { error: 'Arquivo não encontrado' });
  assert.strictEqual(r.headers['content-disposition'], undefined, `content-disposition: ${r.headers['content-disposition']}`);
});

test('401 de terceiro (sem mensagemUsuario) NAO passa -> 500 generico (o client deslogaria)', async () => {
  const r = await quieto(() => request(appComErro(Object.assign(new Error('Unauthorized'), { status: 401 }))).get('/api/x'));
  assert.strictEqual(r.status, 500);
  assert.strictEqual(r.body.error, 'Erro interno do servidor');
});

test('403 de terceiro (sem mensagemUsuario) NAO passa -> 500 generico', async () => {
  const r = await quieto(() => request(appComErro(Object.assign(new Error('Forbidden'), { statusCode: 403 }))).get('/api/x'));
  assert.strictEqual(r.status, 500);
  assert.strictEqual(r.body.error, 'Erro interno do servidor');
});

test('403 do NOSSO codigo (erroComMensagemUsuario) passa com a mensagem', async () => {
  const r = await quieto(() => request(appComErro(erroComMensagemUsuario('Sem permissão para X', 403))).get('/api/x'));
  assert.strictEqual(r.status, 403);
  assert.deepStrictEqual(r.body, { error: 'Sem permissão para X' });
});

test('urlencoded acima do parameterLimit (parameters.too.many) -> 413 "Requisição grande demais"', async () => {
  const app = express();
  app.use(express.urlencoded({ extended: false, parameterLimit: 2 }));
  app.post('/api/x', (req, res) => res.json({ ok: true }));
  app.use('/api', tratarErroGlobalApi);
  const r = await quieto(() => request(app).post('/api/x').type('form').send('a=1&b=2&c=3&d=4'));
  assert.strictEqual(r.status, 413, r.text.slice(0, 200));
  ehJson(r);
  assert.deepStrictEqual(r.body, { error: 'Requisição grande demais' });
});

test('status 500 explicito nao e tratado como 4xx -> 500 generico', async () => {
  const orig = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const err = Object.assign(new Error('falha interna'), { status: 500, mensagemUsuario: 'nao deve sair' });
    const r = await quieto(() => request(appComErro(err)).get('/api/x'));
    assert.strictEqual(r.status, 500);
    assert.deepStrictEqual(r.body, { error: 'Erro interno do servidor' });
  } finally { if (orig === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = orig; }
});

test('headersSent -> delega ao next(err) (nao tenta responder de novo)', async () => {
  const erro = new Error('quebrou no meio do stream');
  let recebido = null;
  const app = express();
  app.get('/api/x', (req, res, next) => { res.status(200); res.write('parcial'); next(erro); });
  app.use('/api', tratarErroGlobalApi);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => { recebido = err; res.end(); });
  const r = await quieto(() => request(app).get('/api/x'));
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.text, 'parcial');
  assert.strictEqual(recebido, erro, 'o erro tem de seguir adiante pelo next(err)');
});

test('mensagemUsuario SEM status 4xx nao vira 4xx (o 500 continua generico)', async () => {
  const err = Object.assign(new Error('x'), { mensagemUsuario: 'nao deve sair' });
  const r = await quieto(() => request(appComErro(err)).get('/api/x'));
  assert.strictEqual(r.status, 500);
  assert.strictEqual(r.body.error, 'Erro interno do servidor');
});

test('MulterError nao-tamanho -> 400 "Upload inválido"', async () => {
  const r = await quieto(() => request(appComErro(new multer.MulterError('LIMIT_FIELD_COUNT'))).get('/api/x'));
  assert.strictEqual(r.status, 400);
  assert.deepStrictEqual(r.body, { error: 'Upload inválido' });
});

(async () => {
  ctx = await createTestApp();
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
  await ctx.close();
  console.log(`\nerrosModulosJson: ${passou} passou, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
