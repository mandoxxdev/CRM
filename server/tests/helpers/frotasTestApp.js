/**
 * Harness de testes de API do modulo Frotas (Frotas Etapa 1, T1).
 *
 * express() real + SQLite :memory: + o registrador REAL `routes/frotas.js`, com o `requirePermission` real do modulo
 * (`services/frotas/permissions.js`). A autenticacao e um stub: `setUser(user)` define quem faz a proxima requisicao
 * (null -> 401). O acesso ao modulo (`checkModulePermission`) fica liberado — quem decide o que cada um faz e o perfil.
 *
 * `usuarios` e tabela CORE (criada por server/index.js); aqui so o subconjunto que o modulo le (vinculo usuario<->motorista):
 * id, nome, email, ativo, role. Usuarios semeados: 1 Gestor (admin), 2 Ana, 3 Consulta, 4 Bruno, 5 Inativo (ativo = 0).
 *
 * Uso:
 *   const { createFrotasTestApp, ADMIN, MOTORISTA, CONSULTA } = require('../helpers/frotasTestApp');
 *   const ctx = await createFrotasTestApp();   // ja espera o schema do modulo
 *   ctx.setUser(ADMIN); const r = await ctx.req('post', '/api/frotas/veiculos', { placa: 'ABC1D23' });
 */
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const request = require('supertest');
const { dbRun } = require('../../services/frotas/db');

const ADMIN = { id: 1, nome: 'Gestor', role: 'admin' };
const MOTORISTA = { id: 2, nome: 'Ana', role: 'usuario' }; // sem perfil_frota: o fallback e MOTORISTA
const CONSULTA = { id: 3, nome: 'Consulta', role: 'usuario', perfil_frota: 'CONSULTA' };
const MOTORISTA2 = { id: 4, nome: 'Bruno', role: 'usuario' };

async function createFrotasTestApp() {
  const app = express();
  app.use(express.json());
  const db = new sqlite3.Database(':memory:');

  await dbRun(db, `CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT,
    ativo INTEGER DEFAULT 1,
    role TEXT DEFAULT 'usuario'
  )`);
  const semente = [
    [1, 'Gestor', 'gestor@x.com', 1, 'admin'],
    [2, 'Ana', 'ana@x.com', 1, 'usuario'],
    [3, 'Consulta', 'consulta@x.com', 1, 'usuario'],
    [4, 'Bruno', 'bruno@x.com', 1, 'usuario'],
    [5, 'Inativo', 'inativo@x.com', 0, 'usuario'],
  ];
  for (const u of semente) {
    await dbRun(db, 'INSERT INTO usuarios (id, nome, email, ativo, role) VALUES (?,?,?,?,?)', u);
  }

  let usuarioAtual = null;
  const authStub = (req, res, next) => {
    if (!usuarioAtual) return res.status(401).json({ error: 'Não autenticado' });
    req.user = { ...usuarioAtual };
    next();
  };
  const registrar = require('../../routes/frotas');
  registrar(app, db, authStub, () => (req, res, next) => next());
  registrar.limparCacheDashboard();

  const setUser = (u) => { usuarioAtual = u; };
  const req = (metodo, url, corpo) => {
    let r = request(app)[metodo](url);
    if (corpo !== undefined) r = r.send(corpo);
    return r;
  };

  // Espera o schema do modulo: o `ensureSchema` de toda rota aguarda a mesma promessa.
  setUser(ADMIN);
  const meta = await req('get', '/api/frotas/meta');
  if (meta.status !== 200) throw new Error(`schema frotas nao subiu no harness: ${meta.status} ${JSON.stringify(meta.body)}`);
  setUser(null);

  return { app, db, setUser, req, limparCacheDashboard: registrar.limparCacheDashboard };
}

module.exports = { createFrotasTestApp, ADMIN, MOTORISTA, CONSULTA, MOTORISTA2 };
