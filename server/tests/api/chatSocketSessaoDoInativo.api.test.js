/**
 * Etapa 132 (C271) — o usuario desativado ou apagado no chat em tempo real (servico).
 *
 * Ate a 131 o handshake do socket so conferia a assinatura do JWT, e `join_conversa`/`typing` so conferiam
 * `chat_participantes`: o desativado (e o apagado com o socket aberto) continuava recebendo o conteudo das
 * mensagens por ate 24 h, e uma conexao nova com o token velho era aceita (medido no servidor real, Fase 0).
 *
 *   RN-01 o handshake confere a linha ativa (a regua do enrichUserFromDb); banco com erro -> conecta (como hoje)
 *   RN-02 join_conversa rele a linha: sem linha ativa -> sessao_encerrada + desconecta, sem entrar
 *   RN-03 typing rele a linha
 *   RN-04 encerrarSocketsDoUsuario / encerrarSocketsSeInativo (erro na releitura -> derruba)
 *   RN-05 (parte do socket.js) a fiacao do io.use e o db obrigatorio
 *
 * Servidor HTTP de verdade + `initChatSocket` de producao + SQLite :memory: + cliente socket.io minimo (ws).
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const sqlite3 = require('sqlite3');
const jwt = require('jsonwebtoken');

const { initChatSocket, criarAuthSocket, PAYLOAD_SESSAO_ENCERRADA } = require('../../services/chat/socket');
const { initChatSchema } = require('../../services/chat/schema');
const { LITERAL_SESSAO_ENCERRADA: L11 } = require('../../services/systemPermissions');
const { conectar, ate, pausa } = require('../helpers/clienteSocketIo');

const SEGREDO = 'segredo-de-teste-e132-socket';
const tok = (payload) => jwt.sign(payload, SEGREDO, { expiresIn: '1h' });
const ENCERRADA = { error: L11, code: 'USUARIO_INATIVO' };

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

const real = new sqlite3.Database(':memory:');
const run = (sql, p = []) => new Promise((res, rej) => real.run(sql, p, (e) => (e ? rej(e) : res())));

// Proxy do banco: conta as leituras de `usuarios` e injeta erro nelas (BUSY ou outro) quando pedido.
const sonda = { leiturasUsuarios: 0, falha: null };
function erroInjetado() {
  if (sonda.falha === 'busy') return Object.assign(new Error('SQLITE_BUSY: database is locked'), { code: 'SQLITE_BUSY' });
  return Object.assign(new Error('SQLITE_IOERR: disk I/O error'), { code: 'SQLITE_IOERR' });
}
const db = {
  get(sql, params, cb) {
    if (/usuarios/i.test(sql)) {
      sonda.leiturasUsuarios++;
      if (sonda.falha) { const e = erroInjetado(); return setImmediate(() => cb(e)); }
    }
    return real.get(sql, params, cb);
  },
  all(sql, params, cb) { return real.all(sql, params, cb); },
  run(sql, params, cb) { return real.run(sql, params, cb); },
};

let porta; let chat; let server;
const abertos = [];
function abre(payload) { const c = conectar(porta, payload === null ? undefined : tok(payload)); abertos.push(c); return c; }
async function abreConectado(payload) { const c = abre(payload); assert.strictEqual(await c.pronto, 'conectado', `deveria conectar ${JSON.stringify(payload)}`); return c; }
const msgs = (c) => c.recebeu('nova_mensagem').map((e) => e[1].conteudo);

// ── RN-05 (socket.js) ─────────────────────────────────────────────────────────────────────
test('[RN-05] criarAuthSocket sem db LANCA (fiacao errada nao vira "so o token" em silencio)', async () => {
  assert.throws(() => criarAuthSocket(SEGREDO), /criarAuthSocket: db obrigatorio/);
  assert.doesNotThrow(() => criarAuthSocket(SEGREDO, db));
});

test('[RN-05] io.use(criarAuthSocket(jwtSecret, db)) e o unico io.use do socket.js', async () => {
  const fonte = fs.readFileSync(path.join(__dirname, '../../services/chat/socket.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(/io\.use\(criarAuthSocket\(jwtSecret, db\)\);/.test(fonte), 'io.use tem de passar o db');
  assert.strictEqual((fonte.match(/io\.use\(/g) || []).length, 1);
});

test('[contrato] PAYLOAD_SESSAO_ENCERRADA = { error: L11, code: USUARIO_INATIVO }', async () => {
  assert.deepStrictEqual(PAYLOAD_SESSAO_ENCERRADA, ENCERRADA);
});

// ── RN-01 — o handshake ───────────────────────────────────────────────────────────────────
test('[RN-01] ativo conecta', async () => {
  const c = await abreConectado({ id: 2 });
  assert.strictEqual(c.recusa, null);
  c.fechar();
});

for (const [rotulo, id] of [['desativado (ativo = 0)', 3], ['apagado (sem linha)', 404], ['ativo NULL', 5], ["ativo = 'true'", 6]]) {
  test(`[RN-01] ${rotulo} -> connect_error L11 com data.code USUARIO_INATIVO`, async () => {
    const c = abre({ id });
    assert.strictEqual(await c.pronto, 'recusado');
    assert.deepStrictEqual(c.recusa, { message: L11, data: { code: 'USUARIO_INATIVO' } });
    assert.strictEqual(c.conectado, false);
  });
}

for (const [rotulo, payload] of [['sem id', { email: 'x@t.com', role: 'admin' }], ['id 0', { id: 0 }], ["id 'abc'", { id: 'abc' }]]) {
  test(`[RN-01] token ${rotulo} -> L11 SEM ler o banco`, async () => {
    const antes = sonda.leiturasUsuarios;
    const c = abre(payload);
    assert.strictEqual(await c.pronto, 'recusado');
    assert.deepStrictEqual(c.recusa, { message: L11, data: { code: 'USUARIO_INATIVO' } });
    assert.strictEqual(sonda.leiturasUsuarios, antes, 'nao podia ler usuarios');
  });
}

test('[RN-01] sem token -> Token não fornecido; assinatura errada -> Token inválido (sem data)', async () => {
  const a = abre(null);
  assert.strictEqual(await a.pronto, 'recusado');
  assert.deepStrictEqual(a.recusa, { message: 'Token não fornecido' });
  const b = conectar(porta, jwt.sign({ id: 2 }, 'outro-segredo'));
  abertos.push(b);
  assert.strictEqual(await b.pronto, 'recusado');
  assert.deepStrictEqual(b.recusa, { message: 'Token inválido' });
  const v = conectar(porta, jwt.sign({ id: 2, exp: Math.floor(Date.now() / 1000) - 10 }, SEGREDO));
  abertos.push(v);
  assert.strictEqual(await v.pronto, 'recusado');
  assert.deepStrictEqual(v.recusa, { message: 'Token inválido' });
});

for (const tipo of ['busy', 'outro']) {
  test(`[RN-01] banco com erro (${tipo}) no handshake -> o ativo E o desativado conectam; o desativado nao entra na conversa (RN-02)`, async () => {
    sonda.falha = tipo;
    let ativo; let inativo;
    try {
      ativo = await abreConectado({ id: 2 });
      inativo = await abreConectado({ id: 3 });
    } finally { sonda.falha = null; }
    ativo.emit('join_conversa', 1);
    inativo.emit('join_conversa', 1);
    assert.ok(await ate(() => inativo.recebeu('sessao_encerrada').length === 1), 'o desativado devia levar sessao_encerrada no join');
    assert.deepStrictEqual(inativo.recebeu('sessao_encerrada')[0][1], ENCERRADA);
    assert.ok(await ate(() => inativo.desconectadoPeloServidor), 'o desativado devia cair');
    await pausa(100);
    await chat.emitNewMessage(1, { conversa_id: 1, conteudo: `S-busy-${tipo}` });
    assert.ok(await ate(() => msgs(ativo).includes(`S-busy-${tipo}`)), 'metade positiva: o ativo recebe');
    assert.deepStrictEqual(msgs(inativo), []);
    assert.strictEqual(ativo.conectado, true);
    ativo.fechar();
  });
}

// ── RN-02 — join_conversa ─────────────────────────────────────────────────────────────────
test('[RN-02] socket aberto antes de desativar: join -> sessao_encerrada + desconectado, nao recebe; o ativo recebe', async () => {
  await run('UPDATE usuarios SET ativo = 1 WHERE id = 8');
  const ex = await abreConectado({ id: 8 });
  const ativo = await abreConectado({ id: 2 });
  await run('UPDATE usuarios SET ativo = 0 WHERE id = 8');
  ativo.emit('join_conversa', 1);
  ex.emit('join_conversa', 1);
  assert.ok(await ate(() => ex.recebeu('sessao_encerrada').length === 1));
  assert.deepStrictEqual(ex.recebeu('sessao_encerrada')[0][1], ENCERRADA);
  assert.ok(await ate(() => ex.desconectadoPeloServidor), 'desconectado pelo servidor');
  await chat.emitNewMessage(1, { conversa_id: 1, conteudo: 'S-rn02' });
  assert.ok(await ate(() => msgs(ativo).includes('S-rn02')));
  assert.deepStrictEqual(msgs(ex), []);
  ativo.fechar();
});

test('[RN-02] apagado com o socket aberto: join -> sessao_encerrada + desconectado', async () => {
  await run("INSERT INTO usuarios (id, nome, email, senha, ativo) VALUES (9, 'Nove', 'nove@t.com', 'x', 1)");
  await run('INSERT INTO chat_participantes (conversa_id, usuario_id) VALUES (1, 9)');
  const ap = await abreConectado({ id: 9 });
  await run('DELETE FROM chat_participantes WHERE usuario_id = 9');
  await run('DELETE FROM usuarios WHERE id = 9');
  ap.emit('join_conversa', 1);
  assert.ok(await ate(() => ap.recebeu('sessao_encerrada').length === 1));
  assert.ok(await ate(() => ap.desconectadoPeloServidor));
});

test('[RN-02] ativo NAO participante: nao entra e continua conectado, sem sessao_encerrada', async () => {
  const fora = await abreConectado({ id: 7 });
  const ativo = await abreConectado({ id: 2 });
  fora.emit('join_conversa', 1);
  ativo.emit('join_conversa', 1);
  await pausa(150);
  await chat.emitNewMessage(1, { conversa_id: 1, conteudo: 'S-fora' });
  assert.ok(await ate(() => msgs(ativo).includes('S-fora')));
  assert.deepStrictEqual(msgs(fora), []);
  assert.deepStrictEqual(fora.recebeu('sessao_encerrada'), []);
  assert.strictEqual(fora.conectado, true);
  fora.fechar(); ativo.fechar();
});

test('[RN-02] erro do banco no join: nao entra e o socket continua; conversaId invalido e ignorado', async () => {
  const a = await abreConectado({ id: 2 });
  const b = await abreConectado({ id: 1 });
  b.emit('join_conversa', 1);
  await pausa(150);
  sonda.falha = 'busy';
  a.emit('join_conversa', 1);
  await pausa(150);
  sonda.falha = null;
  a.emit('join_conversa', 'abc');
  a.emit('join_conversa', 0);
  await pausa(150);
  await chat.emitNewMessage(1, { conversa_id: 1, conteudo: 'S-erro-join' });
  assert.ok(await ate(() => msgs(b).includes('S-erro-join')), 'metade positiva');
  assert.deepStrictEqual(msgs(a), []);
  assert.deepStrictEqual(a.recebeu('sessao_encerrada'), []);
  assert.strictEqual(a.conectado, true);
  a.fechar(); b.fechar();
});

// ── RN-03 — typing ────────────────────────────────────────────────────────────────────────
test('[RN-03] typing: o ativo participante chega aos outros; o desativado leva sessao_encerrada e nada chega; o de fora nada', async () => {
  await run('UPDATE usuarios SET ativo = 1 WHERE id = 8');
  const ex = await abreConectado({ id: 8 });
  const um = await abreConectado({ id: 1 });
  const dois = await abreConectado({ id: 2 });
  const fora = await abreConectado({ id: 7 });
  um.emit('join_conversa', 1); dois.emit('join_conversa', 1); ex.emit('join_conversa', 1);
  await pausa(150);
  await run('UPDATE usuarios SET ativo = 0 WHERE id = 8');
  ex.emit('typing', { conversa_id: 1, typing: true });
  fora.emit('typing', { conversa_id: 1, typing: true });
  assert.ok(await ate(() => ex.recebeu('sessao_encerrada').length === 1), 'o desativado leva sessao_encerrada');
  assert.ok(await ate(() => ex.desconectadoPeloServidor));
  dois.emit('typing', { conversa_id: 1, typing: true });
  assert.ok(await ate(() => um.recebeu('typing').length >= 1));
  await pausa(100);
  assert.deepStrictEqual(um.recebeu('typing').map((e) => e[1]), [{ conversa_id: 1, usuario_id: 2, typing: true }]);
  um.fechar(); dois.fechar(); fora.fechar();
});

// ── RN-04 — derrubar na hora ──────────────────────────────────────────────────────────────
test("[RN-04] encerrarSocketsDoUsuario('02'): os dois sockets do 2 levam sessao_encerrada e caem pelo servidor (41); o do 1 nao", async () => {
  const d1 = await abreConectado({ id: 2 });
  const d2 = await abreConectado({ id: 2 });
  const um = await abreConectado({ id: 1 });
  chat.encerrarSocketsDoUsuario('02');
  assert.ok(await ate(() => d1.fechado && d2.fechado), 'os dois caem');
  assert.ok(d1.desconectadoPeloServidor && d2.desconectadoPeloServidor, 'o pacote 41 (io server disconnect) tem de chegar');
  assert.deepStrictEqual(d1.recebeu('sessao_encerrada').map((e) => e[1]), [ENCERRADA]);
  assert.deepStrictEqual(d2.recebeu('sessao_encerrada').map((e) => e[1]), [ENCERRADA]);
  await pausa(100);
  assert.strictEqual(um.conectado, true);
  assert.deepStrictEqual(um.recebeu('sessao_encerrada'), []);
  um.fechar();
});

test('[RN-04] encerrarSocketsSeInativo: ativo -> ninguem cai; desativado -> cai e a conexao nova e recusada', async () => {
  const ativo = await abreConectado({ id: 2 });
  await chat.encerrarSocketsSeInativo(2);
  await pausa(150);
  assert.strictEqual(ativo.conectado, true, 'o ativo nao cai');
  await run('UPDATE usuarios SET ativo = 1 WHERE id = 8');
  const ex = await abreConectado({ id: 8 });
  await run('UPDATE usuarios SET ativo = 0 WHERE id = 8');
  await chat.encerrarSocketsSeInativo('8');
  assert.ok(await ate(() => ex.fechado), 'o desativado cai');
  assert.strictEqual(ex.desconectadoPeloServidor, true, '41');
  assert.deepStrictEqual(ex.recebeu('sessao_encerrada').map((e) => e[1]), [ENCERRADA]);
  const de_novo = abre({ id: 8 });
  assert.strictEqual(await de_novo.pronto, 'recusado');
  ativo.fechar();
});

test('[RN-04] encerrarSocketsSeInativo com erro na releitura -> derruba SEM sessao_encerrada (Fase 2 I1) e resolve (M1)', async () => {
  const ativo = await abreConectado({ id: 2 });
  const outro = await abreConectado({ id: 1 });
  sonda.falha = 'outro';
  let resolveu;
  try { resolveu = await chat.encerrarSocketsSeInativo(2).then(() => 'resolveu', () => 'rejeitou'); } finally { sonda.falha = null; }
  assert.strictEqual(resolveu, 'resolveu', 'a Promise nunca rejeita');
  assert.ok(await ate(() => ativo.fechado), 'cai no erro');
  assert.strictEqual(ativo.desconectadoPeloServidor, true, '41');
  assert.deepStrictEqual(ativo.recebeu('sessao_encerrada'), [], 'sem o evento: o client nao desloga o ativo');
  const volta = await abreConectado({ id: 2 });
  volta.fechar();
  await pausa(100);
  assert.strictEqual(outro.conectado, true, 'o de outro usuario nao cai');
  outro.fechar();
});

(async () => {
  await new Promise((res, rej) => real.run(`CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL, senha TEXT NOT NULL,
    cargo TEXT, role TEXT DEFAULT 'usuario', ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (e) => (e ? rej(e) : res())));
  await initChatSchema(real);
  for (const [id, ativo] of [[1, 1], [2, 1], [3, 0], [5, null], [6, 'true'], [7, 1], [8, 1]]) {
    await run('INSERT INTO usuarios (id, nome, email, senha, ativo) VALUES (?, ?, ?, ?, ?)', [id, `U${id}`, `u${id}@t.com`, 'x', ativo]);
  }
  await run("INSERT INTO chat_conversas (id, tipo, nome) VALUES (1, 'grupo', 'G')");
  for (const u of [1, 2, 3, 5, 6, 8]) await run('INSERT INTO chat_participantes (conversa_id, usuario_id) VALUES (1, ?)', [u]);

  server = http.createServer();
  chat = initChatSocket(server, db, SEGREDO);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  porta = server.address().port;

  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  for (const c of abertos) c.fechar();
  chat.io.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
