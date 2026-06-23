/**
 * Testes básicos do módulo Chat
 * Executar: node server/tests/chat.test.js
 */
const sqlite3 = require('sqlite3').verbose();
const assert = require('assert');
const { initChatSchema } = require('../services/chat/schema');
const { dbRun } = require('../services/chat/db');
const chatService = require('../services/chat/chatService');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn().then(() => {
    passed++;
    console.log(`  ✓ ${name}`);
  }).catch((e) => {
    failed++;
    console.error(`  ✗ ${name}: ${e.message}`);
  });
}

async function setupDb() {
  const db = new sqlite3.Database(':memory:');
  await dbRun(db, `CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    cargo TEXT,
    role TEXT DEFAULT 'usuario',
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await dbRun(db, `INSERT INTO usuarios (nome, email, senha) VALUES ('Mateus', 'm@test.com', 'x')`);
  await dbRun(db, `INSERT INTO usuarios (nome, email, senha) VALUES ('Sheila', 's@test.com', 'x')`);
  await initChatSchema(db);
  return db;
}

async function run() {
  console.log('\n🧪 Testes Chat Orion\n');
  const db = await setupDb();

  await test('Cria conversa direta entre dois usuários', async () => {
    const id = await chatService.createDirectConversation(db, 1, 2);
    assert.ok(id);
    const again = await chatService.createDirectConversation(db, 1, 2);
    assert.strictEqual(id, again);
  });

  await test('Envia e lista mensagens', async () => {
    const conversaId = await chatService.createDirectConversation(db, 1, 2);
    const msg = await chatService.sendMessage(db, conversaId, 1, 'Olá Sheila!');
    assert.strictEqual(msg.conteudo, 'Olá Sheila!');
    const msgs = await chatService.getMessages(db, conversaId, 1);
    assert.ok(msgs.mensagens.some((m) => m.conteudo === 'Olá Sheila!'));
  });

  await test('Conta mensagens não lidas', async () => {
    const conversaId = await chatService.createDirectConversation(db, 1, 2);
    await chatService.sendMessage(db, conversaId, 1, 'Teste unread');
    const total = await chatService.getTotalUnread(db, 2);
    assert.ok(total >= 1);
    await chatService.markAsRead(db, conversaId, 2);
    const after = await chatService.getTotalUnread(db, 2);
    assert.strictEqual(after, 0);
  });

  await test('Cria grupo com participantes', async () => {
    const id = await chatService.createGroupConversation(db, 1, 'Equipe Comercial', [2]);
    const convs = await chatService.listConversations(db, 1);
    const grupo = convs.find((c) => c.id === id);
    assert.strictEqual(grupo.tipo, 'grupo');
    assert.strictEqual(grupo.participantes.length, 2);
  });

  db.close();
  console.log(`\n${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
