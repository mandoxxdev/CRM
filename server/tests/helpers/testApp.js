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
// Etapa 38: `multer` passa a ser requerido AQUI porque o registrador de Compras recebe as duas
// instancias de upload por DI (elas ficam em `server/index.js`, fechando sobre os diretorios de
// upload de producao). Sem este require o harness INTEIRO quebra no carregamento e todos os
// arquivos de `tests/api/` caem juntos — nao so os de Compras.
const multer = require('multer');
const { initSchema } = require('../../services/almoxarifado/schema');
const { dbRun } = require('../../services/almoxarifado/db');

async function createTestApp(options = {}) {
  // Etapa 33: FIXA o segredo antes de qualquer registrador rodar. Sem isto, `resolveJwtSecret`
  // GERA um segredo novo por `dataDir` — e o harness cria um `mkdtempSync` por app —, então dois
  // apps vivos no mesmo processo assinam com chaves diferentes e o primeiro passa a devolver 404
  // nas URLs que ele mesmo minou. 14 arquivos de `tests/api/` criam mais de um app por processo.
  // De quebra, cala os `console.log` de `runtimeSecrets.js`, que ainda por cima imprimem um
  // caminho errado (dizem `server/data/` quando o segredo foi para o temporário).
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-almoxarifado';

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
  // Etapa 38: o stub deixou de ser "subconjunto minimo" e passou a espelhar a forma de PRODUCAO
  // (`index.js:19213` + os 5 `ALTER TABLE` de `:19269-19281`). Motivo medido: com o registrador de
  // Compras montado no harness, `GET /api/compras/fornecedores` termina em `ORDER BY created_at
  // DESC` e morria com "no such column: created_at" — um erro que NAO existe em producao, que era
  // exatamente o que a licao da Etapa 8 (escrita no paragrafo acima) mandou evitar. As colunas
  // novas sao anulaveis e todos os INSERT dos testes sao NOMEADOS, entao nada mais muda.
  // A FK de `grupo_id` para `grupos_compras` fica FORA: essa tabela e core e nao existe aqui — os
  // testes que precisam dela a criam por conta propria.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS fornecedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    cnpj TEXT,
    contato TEXT,
    email TEXT,
    telefone TEXT,
    endereco TEXT,
    cidade TEXT,
    estado TEXT,
    cep TEXT,
    status TEXT DEFAULT 'ativo',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    grupo_id INTEGER,
    planilha_dados TEXT,
    planilha_nome TEXT,
    planilha_atualizado_em DATETIME,
    foto TEXT
  )`);

  // `pedidos_compra` é tabela CORE (criada por server/index.js:19230 no boot), fora do initSchema
  // do almoxarifado — mesmo caso de `clientes` (Etapa 8) e `fornecedores` (Etapa 8b). Entra no
  // harness na Etapa 37 porque SETE arquivos de teste a criavam por conta própria, com DDLs
  // DIVERGENTES, e `CREATE TABLE IF NOT EXISTS` faz "quem cria primeiro vence": o de
  // `recebimentoTipoEnum` não declara `created_at`, e `listarPedidosCompraAux` termina em
  // `ORDER BY p.created_at DESC` — com o DDL dele valendo, a rota aux morria com "no such column".
  // Este stub roda ANTES de qualquer arquivo de teste (o DDL deles corre depois de
  // `createTestApp()` retornar), então os sete viram no-op e a forma é UMA só.
  // Espelha a DDL de produção MENOS a FOREIGN KEY para `fornecedores`, e a FK fica fora DE
  // PROPÓSITO: `solicitacaoCicloVida`, `reposicaoJornada`, `reposicaoGerarSolicitacoes` e
  // `integracaoComprasJornada` inserem `fornecedor_id: 1` sem linha de fornecedor, e duas
  // migrações de `schema.js` terminam em `PRAGMA foreign_keys=ON` — com a FK, os quatro cairiam
  // de uma vez. `fornecedor_id` também é NULÁVEL aqui (NOT NULL em produção):
  // `tests/almoxarifado.test.js:247` declara a tabela sem ele.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS pedidos_compra (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE,
    fornecedor_id INTEGER,
    valor_total REAL DEFAULT 0,
    data_pedido DATE,
    previsao_entrega DATE,
    status TEXT DEFAULT 'pendente',
    observacoes TEXT,
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

  // Etapa 38: o modulo CORE Compras. Ate aqui o harness montava DOIS registradores e nenhum era
  // Compras — as 26 rotas de `/api/compras/*` viviam soltas em `server/index.js`, que nenhum teste
  // carrega, e por isso ZERO testes batiam nelas. Esta linha e o que torna a suite de Compras
  // possivel; removida, todo cenario de `comprasPedidosRotas.api.test.js` volta a 404.
  // Os uploads sao STUB: em producao as duas instancias de multer gravam em
  // `uploadsGruposComprasDir`/`uploadsFornecedoresDir` (variaveis de modulo do `index.js`); aqui
  // gravam no diretorio temporario deste app. As duas rotas de foto nao tem cenario — o stub
  // existe para o registrador poder ser montado, nao para ser exercido.
  const uploadsComprasDir = path.join(dataDir, 'uploads', 'compras');
  const uploadComprasStub = multer({ dest: uploadsComprasDir });
  require('../../routes/compras')(app, db, fakeAuth, fakeCheckModulePermission, {
    uploadGrupoCompras: uploadComprasStub,
    uploadFornecedor: uploadComprasStub,
    uploadsGruposComprasDir: uploadsComprasDir,
    uploadsFornecedoresDir: uploadsComprasDir,
  });

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
    // Etapa 32: diretorio IRMAO, nunca subpasta de `uploadsAlmoxDir` — `express.static(root)`
    // serve as subpastas de root, entao um anexo guardado la dentro sairia publico pelos dois
    // mounts de routes/almoxarifado.js. O teste da RN-03 mede exatamente a POSICAO RELATIVA
    // entre os dois caminhos expostos aqui, e nao um GET pelo basename.
    uploadsAnexosDir: path.join(dataDir, 'uploads', 'almoxarifado-anexos'),
    // Etapa 33: o MESMO assinador que as rotas usam, para o teste poder minar uma URL válida sem
    // reimplementar o HMAC — reimplementar provaria só que o teste sabe assinar.
    assinadorUpload: require('../../services/almoxarifado/urlUpload')
      .criarAssinadorUpload(process.env.JWT_SECRET),
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
