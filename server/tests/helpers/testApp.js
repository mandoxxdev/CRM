/**
 * Harness de testes de API do almoxarifado.
 * Monta um express() real com as rotas de produção sobre SQLite :memory:.
 * Auth é substituída por stub injetado via os parâmetros de DI dos registradores.
 */
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const os = require('os');
const path = require('path');
const fs = require('fs');
const { initSchema } = require('../../services/almoxarifado/schema');
const { dbRun } = require('../../services/almoxarifado/db');

async function createTestApp(options = {}) {
  const app = express();
  app.use(express.json());

  const db = new sqlite3.Database(':memory:');
  await initSchema(db);

  // Diretório temporário para uploads (multer do módulo exige um PERSISTENT_DATA_DIR)
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'almox-test-'));

  // Stub de autenticação: usuário trocável por teste; null => 401
  let currentUser = options.user !== undefined ? options.user : { id: 1, nome: 'Admin Teste', role: 'admin' };
  const fakeAuth = (req, res, next) => {
    if (!currentUser) return res.status(401).json({ error: 'Token não fornecido' });
    req.user = { ...currentUser };
    next();
  };
  // Camada 2 (permissão de módulo) liberada no harness; a camada 3
  // (requirePermission por perfil) roda o código REAL das rotas extended.
  const fakeCheckModulePermission = () => (req, res, next) => next();

  require('../../routes/almoxarifado')(app, db, fakeAuth, dataDir, fakeCheckModulePermission);
  require('../../routes/requisicoesMaterial')(app, db, fakeAuth);

  // O registrador principal agenda a extended num callback do sqlite
  // (almoxarifado.js:1663). Roundtrip no sqlite: garante que a extended
  // registrou as rotas (fila FIFO). Não garante que TODO o initSchema em
  // background terminou — ele é idempotente.
  await dbRun(db, 'SELECT 1');

  return {
    app,
    db,
    // Exposto para os testes que precisam inspecionar o que o multer gravou (ou NÃO
    // gravou) em disco — ex.: permissoesRotas.api.test.js prova que um 403 na rota de
    // foto acontece ANTES do upload, sem deixar arquivo órfão.
    uploadsAlmoxDir: path.join(dataDir, 'uploads', 'almoxarifado'),
    setUser(user) { currentUser = user; },
    close() {
      return new Promise((resolve) => db.close(() => {
        try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
        resolve();
      }));
    },
  };
}

module.exports = { createTestApp };
