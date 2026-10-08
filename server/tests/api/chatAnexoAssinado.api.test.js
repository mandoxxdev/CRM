/**
 * Imagem do chat sob URL assinada — Etapa 82, T2 (RN-82.02 e RN-82.03).
 *
 * Teste de ROTA de verdade: express + SQLite `:memory:` + `initChatSchema` + `registerChatRoutes`
 * (o chat nao esta no `testApp.js`). A autenticacao e um `authFake` que le o usuario do header
 * `x-user` — o que se testa aqui e a montagem do static, o filtro do upload e a rota de reassinar,
 * nao o JWT.
 *
 * O que se prova:
 *  - caminho cru `/api/uploads/chat/<arquivo>` (o que o banco guarda) -> 404;
 *  - a `anexo_url` devolvida por GET /mensagens -> 200 image/png, com os cabecalhos seguros;
 *  - assinatura de OUTRA pasta (almoxarifado, mesmo segredo raiz) no caminho do chat -> 404;
 *  - assinatura valida de nome inexistente -> 404 (fecho final, nao desce para o proximo handler);
 *  - GET /api/chat/mensagens/:id/anexo: participante -> URL nova que funciona; nao participante,
 *    mensagem sem anexo e id inexistente -> o MESMO 404 { error: 'Mensagem não encontrada' };
 *  - filtro: `image/png` + nome `x.html` grava `.png` (extensao pelo MIME); `text/html` + nome
 *    `x.png` -> 400 (antes passava pela extensao do nome).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const sqlite3 = require('sqlite3');

process.env.JWT_SECRET = 'segredo-de-teste-chat-82';

const { initChatSchema } = require('../../services/chat/schema');
const { dbRun } = require('../../services/chat/db');
const registerChatRoutes = require('../../routes/chat');
const { criarAssinadorUpload } = require('../../services/almoxarifado/urlUpload');

let passou = 0, falhou = 0;
const testes = [];
function test(nome, fn) { testes.push([nome, fn]); }

// PNG 1x1 valido.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat82-'));
const db = new sqlite3.Database(':memory:');
const app = express();
app.use(express.json());
const authFake = (req, res, next) => {
  const id = Number(req.headers['x-user']);
  if (!id) return res.status(401).json({ error: 'sem usuario' });
  req.user = { id, role: 'usuario' };
  next();
};

let conversaId;
let msgImagemId;
let msgTextoId;
let urlAssinada;
let arquivoGravado;

async function preparar() {
  await dbRun(db, `CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL, cargo TEXT, role TEXT DEFAULT 'usuario', ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  for (const [n, e] of [['Ana', 'a@t'], ['Bia', 'b@t'], ['Caio', 'c@t']]) {
    await dbRun(db, 'INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)', [n, e, 'x']);
  }
  await initChatSchema(db);
  registerChatRoutes(app, db, authFake, null, tmpDir);
  // Se um handler deixar a requisicao descer, ela cai aqui com um status que o teste reconhece.
  app.use((req, res) => res.status(418).end());

  const r = await request(app).post('/api/chat/conversas/direta').set('x-user', '1').send({ usuario_id: 2 });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  conversaId = r.body.conversa_id;

  const img = await request(app)
    .post(`/api/chat/conversas/${conversaId}/mensagens/imagem`)
    .set('x-user', '1')
    .attach('imagem', PNG, { filename: 'foto.png', contentType: 'image/png' });
  assert.strictEqual(img.status, 200, JSON.stringify(img.body));
  msgImagemId = img.body.mensagem.id;

  const txt = await request(app)
    .post(`/api/chat/conversas/${conversaId}/mensagens`)
    .set('x-user', '1')
    .send({ conteudo: 'sem anexo' });
  assert.strictEqual(txt.status, 200);
  msgTextoId = txt.body.mensagem.id;

  const lista = await request(app).get(`/api/chat/conversas/${conversaId}/mensagens`).set('x-user', '2');
  assert.strictEqual(lista.status, 200);
  urlAssinada = lista.body.mensagens.find((m) => m.id === msgImagemId).anexo_url;
  arquivoGravado = fs.readdirSync(path.join(tmpDir, 'uploads', 'chat'))[0];
}

test('POST da imagem ja devolve anexo_url assinada (resposta e socket passam por mapMessage)', async () => {
  const img = await request(app)
    .post(`/api/chat/conversas/${conversaId}/mensagens/imagem`)
    .set('x-user', '2')
    .attach('imagem', PNG, { filename: 'b.png', contentType: 'image/png' });
  assert.strictEqual(img.status, 200);
  assert.match(img.body.mensagem.anexo_url, /^\/api\/uploads\/chat\/chat-[^?]+\.png\?exp=\d+&sig=[0-9a-f]{32}$/);
});

test('caminho cru (o que o banco guarda) -> 404', async () => {
  const r = await request(app).get(`/api/uploads/chat/${arquivoGravado}`);
  assert.strictEqual(r.status, 404);
});

test('anexo_url do GET /mensagens -> 200 image/png com os cabecalhos seguros', async () => {
  assert.ok(urlAssinada.startsWith(`/api/uploads/chat/${arquivoGravado}?exp=`), urlAssinada);
  const r = await request(app).get(urlAssinada);
  assert.strictEqual(r.status, 200);
  assert.match(r.headers['content-type'], /^image\/png/);
  assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
  assert.match(r.headers['content-security-policy'], /sandbox/);
});

test('sig adulterado -> 404', async () => {
  const u = urlAssinada.replace(/sig=([0-9a-f])/, (m, c) => `sig=${c === '0' ? '1' : '0'}`);
  assert.notStrictEqual(u, urlAssinada);
  const r = await request(app).get(u);
  assert.strictEqual(r.status, 404);
});

test('assinatura de outra pasta (almoxarifado, mesmo segredo raiz) no caminho do chat -> 404', async () => {
  const almox = criarAssinadorUpload(process.env.JWT_SECRET);
  const q = almox.assinar(arquivoGravado).split('?')[1];
  const r = await request(app).get(`/api/uploads/chat/${arquivoGravado}?${q}`);
  assert.strictEqual(r.status, 404);
  // E a assinatura de uma pasta com o MESMO prefixo e outro dominio tambem nao vale.
  const outro = criarAssinadorUpload(process.env.JWT_SECRET, {
    prefixo: '/api/uploads/chat', dominio: 'avatares-uploads-v1', minutos: 480, baldeMinutos: 60,
  });
  const r2 = await request(app).get(outro.assinar(arquivoGravado));
  assert.strictEqual(r2.status, 404);
});

test('assinatura valida de nome inexistente -> 404 (fecho final, nao desce)', async () => {
  const chat = criarAssinadorUpload(process.env.JWT_SECRET, {
    prefixo: '/api/uploads/chat', dominio: 'chat-uploads-v1', minutos: 480, baldeMinutos: 60,
  });
  const r = await request(app).get(chat.assinar('nao-existe.png'));
  assert.strictEqual(r.status, 404);
});

test('reassinar: participante recebe URL nova que funciona', async () => {
  const r = await request(app).get(`/api/chat/mensagens/${msgImagemId}/anexo`).set('x-user', '2');
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.anexo_url.startsWith(`/api/uploads/chat/${arquivoGravado}?exp=`), r.body.anexo_url);
  const img = await request(app).get(r.body.anexo_url);
  assert.strictEqual(img.status, 200);
  assert.match(img.headers['content-type'], /^image\//);
});

test('reassinar: nao participante, sem anexo, inexistente e sem auth -> 404/401 sem vazar', async () => {
  const esperado = { error: 'Mensagem não encontrada' };
  const fora = await request(app).get(`/api/chat/mensagens/${msgImagemId}/anexo`).set('x-user', '3');
  assert.strictEqual(fora.status, 404);
  assert.deepStrictEqual(fora.body, esperado);
  const semAnexo = await request(app).get(`/api/chat/mensagens/${msgTextoId}/anexo`).set('x-user', '1');
  assert.strictEqual(semAnexo.status, 404);
  assert.deepStrictEqual(semAnexo.body, esperado);
  const inexistente = await request(app).get('/api/chat/mensagens/99999/anexo').set('x-user', '1');
  assert.strictEqual(inexistente.status, 404);
  assert.deepStrictEqual(inexistente.body, esperado);
  const lixo = await request(app).get('/api/chat/mensagens/abc/anexo').set('x-user', '1');
  assert.strictEqual(lixo.status, 404);
  const anon = await request(app).get(`/api/chat/mensagens/${msgImagemId}/anexo`);
  assert.strictEqual(anon.status, 401);
});

test('reassinar: mensagem apagada -> 404', async () => {
  const img = await request(app)
    .post(`/api/chat/conversas/${conversaId}/mensagens/imagem`)
    .set('x-user', '1')
    .attach('imagem', PNG, { filename: 'apagar.png', contentType: 'image/png' });
  const id = img.body.mensagem.id;
  const del = await request(app).delete(`/api/chat/conversas/${conversaId}/mensagens/${id}`).set('x-user', '1');
  assert.strictEqual(del.status, 200);
  const r = await request(app).get(`/api/chat/mensagens/${id}/anexo`).set('x-user', '1');
  assert.strictEqual(r.status, 404);
});

test('filtro: image/png com nome .html grava .png (extensao pelo MIME, nao pelo nome)', async () => {
  const r = await request(app)
    .post(`/api/chat/conversas/${conversaId}/mensagens/imagem`)
    .set('x-user', '1')
    .attach('imagem', PNG, { filename: 'payload.html', contentType: 'image/png' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.mensagem.anexo_url, /^\/api\/uploads\/chat\/chat-[^/?]+\.png\?/);
  const htmls = fs.readdirSync(path.join(tmpDir, 'uploads', 'chat')).filter((f) => !f.endsWith('.png'));
  assert.deepStrictEqual(htmls, []);
});

test('filtro: text/html com nome .png -> 400 (antes passava pela extensao do nome)', async () => {
  const r = await request(app)
    .post(`/api/chat/conversas/${conversaId}/mensagens/imagem`)
    .set('x-user', '1')
    .attach('imagem', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'text/html' });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /Formato não permitido/);
});

test('filtro: image/svg+xml -> 400 (fora do mapa do extensaoSegura)', async () => {
  const r = await request(app)
    .post(`/api/chat/conversas/${conversaId}/mensagens/imagem`)
    .set('x-user', '1')
    .attach('imagem', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), {
      filename: 'x.svg', contentType: 'image/svg+xml',
    });
  assert.strictEqual(r.status, 400);
});

(async () => {
  try {
    await preparar();
  } catch (e) {
    console.error('  ✗ preparar:', e.stack || e.message);
    process.exit(1);
  }
  for (const [nome, fn] of testes) {
    try {
      await fn();
      passou++;
      console.log(`  ✓ ${nome}`);
    } catch (e) {
      falhou++;
      console.error(`  ✗ ${nome}: ${e.message}`);
    }
  }
  db.close();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* windows */ }
  console.log(`\n${passou} passou, ${falhou} falhou\n`);
  process.exit(falhou > 0 ? 1 : 0);
})();
