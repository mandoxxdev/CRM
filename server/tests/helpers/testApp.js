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

  // `clientes` é tabela CORE (criada por server/index.js no boot), fora do initSchema do
  // almoxarifado — que por isso nunca a criava aqui. A partir da Etapa 8 as rotas do módulo
  // fazem LEFT JOIN nela para resolver o nome do proprietário do material
  // (stockService.consultarEstoque), então o harness precisa refletir a produção: sem a tabela,
  // GET /almoxarifado/estoque falharia com "no such table: clientes" em TODO teste, num erro que
  // não existe em produção. Subconjunto mínimo das colunas de index.js — o módulo só lê
  // razao_social (convenção fixada no plano da Etapa 8).
  await dbRun(db, `CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    cnpj TEXT,
    status TEXT DEFAULT 'ativo'
  )`);

  // `fornecedores` é tabela CORE (criada por server/index.js no boot), fora do initSchema do
  // almoxarifado — mesmo caso de `clientes` na Etapa 8. A partir da Etapa 8b as rotas de remessa
  // fazem LEFT JOIN nela para resolver o nome do terceiro, então o harness precisa refletir a
  // produção. STUB AQUI, NUNCA FALLBACK NA QUERY: um `if (!tableExists) return []` na query
  // esconderia em teste um erro que existiria em produção — foi a lição registrada na Etapa 8.
  // Subconjunto mínimo das colunas de index.js: o módulo só lê razao_social, nome_fantasia, cnpj
  // e filtra por status (ver receiptService.listarFornecedoresAux).
  // Etapa 32: o pedido de compra lê o bloco fiscal do fornecedor para congelar no documento
  // (RN-06), então o stub cresceu. Continua sendo subconjunto do index.js — nada aqui é
  // "tabela de teste": são as mesmas colunas, com os mesmos nomes.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS fornecedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    cnpj TEXT,
    inscricao_estadual TEXT,
    endereco TEXT,
    cidade TEXT,
    estado TEXT,
    cep TEXT,
    telefone TEXT,
    celular TEXT,
    email TEXT,
    status TEXT DEFAULT 'ativo'
  )`);

  // `pedidos_compra` é tabela CORE (index.js), fora do initSchema do almoxarifado. Até a
  // Etapa 32 cada teste a criava na mão com um subconjunto diferente de colunas, e NENHUM
  // teste alcançava as rotas de /api/compras — elas moravam inline no index.js. O stub aqui
  // reflete a produção (colunas do CREATE + as da migration da Etapa 32); os
  // `CREATE TABLE IF NOT EXISTS` dos testes antigos viram no-op e seus INSERTs, que nomeiam
  // as colunas, continuam válidos.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS pedidos_compra (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE,
    fornecedor_id INTEGER NOT NULL,
    valor_total REAL DEFAULT 0,
    data_pedido DATE,
    previsao_entrega DATE,
    status TEXT DEFAULT 'pendente',
    observacoes TEXT,
    condicao_pagamento TEXT,
    frete_modalidade TEXT,
    transportadora TEXT,
    transportadora_telefone TEXT,
    via_transporte TEXT,
    tabela_preco TEXT,
    contato TEXT,
    local_entrega TEXT,
    local_cobranca TEXT,
    total_produtos REAL DEFAULT 0,
    total_ipi REAL DEFAULT 0,
    total_icms_st REAL DEFAULT 0,
    total_desconto REAL DEFAULT 0,
    valor_frete REAL DEFAULT 0,
    snap_fornecedor_nome TEXT,
    snap_fornecedor_cnpj TEXT,
    snap_fornecedor_ie TEXT,
    snap_fornecedor_endereco TEXT,
    snap_fornecedor_municipio TEXT,
    snap_fornecedor_uf TEXT,
    snap_fornecedor_cep TEXT,
    snap_fornecedor_telefone TEXT,
    snap_fornecedor_email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

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
  // Etapa 32 — compras/pedidos: é o que permite o teste de integração entrar PELA ROTA.
  // Sem isto, provar a fiação do pedido de compra seria impossível (o INSERT direto que os
  // testes antigos faziam nunca exerce middleware, ordem de registro nem validação).
  require('../../routes/compras/pedidos')(app, db, fakeAuth, fakeCheckModulePermission);

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
