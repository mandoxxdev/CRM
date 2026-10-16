/**
 * Etapa 132 (C272) — a Lista de Tarefas devolvia o papel (`role`) de todos os usuarios ativos a quem tem o modulo `todolist`
 * (`GET /api/todolist/usuarios` e o `usuarios` do `GET /api/todolist/board`). A tela so le `id` e `nome` (o seletor de
 * responsavel, `TodolistBoard.js`); ninguem le `role`.
 *
 *   RN-08 cada linha com exatamente id, nome, email; so os ativos; por nome sem diferenca de caixa — pela rota e pelo servico
 *
 * Registrador de producao (`routes/todolist.js`) sobre SQLite real; o portao de modulo e o `authenticateToken` sao de fora
 * desta regra (cobertos em portaoDeModulo/modulosClienteServidor) e entram como passagem.
 */
const assert = require('assert');
const express = require('express');
const request = require('supertest');
const sqlite3 = require('sqlite3');

const registerTodolistRoutes = require('../../routes/todolist');
const todolistService = require('../../services/todolist/todolistService');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

const db = new sqlite3.Database(':memory:');
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, (e) => (e ? rej(e) : res())));

let app; let quem = null;
const ESPERADO = [
  { id: 2, nome: 'ana', email: 'ana@t.com' },
  { id: 1, nome: 'Bruno', email: 'bruno@t.com' },
  { id: 4, nome: 'carla', email: 'carla@t.com' },
];

// supertest, nao fetch: o keep-alive do fetch com process.exit derruba o node no Windows (assert de libuv no fim).
async function get(url) {
  const r = await request(app).get(url);
  return [r.status, r.body];
}

for (const [rotulo, user] of [['administrador', { id: 1, role: 'admin', is_superadmin: 1 }], ['comum', { id: 2, role: 'usuario' }]]) {
  test(`[RN-08] GET /api/todolist/usuarios (${rotulo}) -> id, nome, email; sem role; sem o inativo; por nome`, async () => {
    quem = user;
    const [s, x] = await get('/api/todolist/usuarios');
    assert.strictEqual(s, 200);
    assert.deepStrictEqual(x, ESPERADO);
    for (const l of x) assert.deepStrictEqual(Object.keys(l), ['id', 'nome', 'email']);
  });
  test(`[RN-08] GET /api/todolist/board (${rotulo}) -> usuarios com id, nome, email; o resto do quadro igual`, async () => {
    quem = user;
    const [s, x] = await get('/api/todolist/board');
    assert.strictEqual(s, 200);
    assert.deepStrictEqual(x.usuarios, ESPERADO);
    assert.ok(Array.isArray(x.colunas) && x.colunas.length === 4, 'metade positiva: o quadro veio');
    assert.strictEqual(x.tarefas.length, 1);
    assert.strictEqual(x.tarefas[0].responsavel_nome, 'carla');
  });
}

test('[RN-08] servico: listUsuariosAtivos devolve as mesmas linhas', async () => {
  assert.deepStrictEqual(await todolistService.listUsuariosAtivos(db), ESPERADO);
});

(async () => {
  await run(`CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL, senha TEXT NOT NULL,
    cargo TEXT, role TEXT DEFAULT 'usuario', ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  for (const [id, nome, role, ativo] of [[1, 'Bruno', 'admin', 1], [2, 'ana', 'usuario', 1], [3, 'Davi', 'admin', 0], [4, 'carla', 'gerente', 1]]) {
    await run('INSERT INTO usuarios (id, nome, email, senha, role, ativo) VALUES (?, ?, ?, ?, ?, ?)', [id, nome, `${nome.toLowerCase()}@t.com`, 'x', role, ativo]);
  }
  app = express();
  app.use(express.json());
  const auth = (req, res, next) => { req.user = { ...quem }; next(); };
  const portao = () => (req, res, next) => next();
  registerTodolistRoutes(app, db, auth, portao);
  // o schema da Lista de Tarefas sobe no primeiro pedido (ensureSchema); a tarefa entra depois dele
  quem = { id: 1, role: 'admin' };
  await get('/api/todolist/usuarios');
  await run("INSERT INTO todolist_tarefas (titulo, status, responsavel_id, created_by) VALUES ('T1', 'a_fazer', 4, 1)");

  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
