/**
 * RN-C01 (Etapa 38) — a REGUA da extracao de `/api/compras/*` para `server/routes/compras.js`.
 *
 * O ACHADO QUE ESTE ARQUIVO EXISTE PARA PAGAR, medido na Fase 0 da Etapa 38: **ZERO** testes
 * batiam em `/api/compras/*` nesta base. O harness (`tests/helpers/testApp.js`) montava DOIS
 * registradores — `routes/almoxarifado` e `routes/requisicoesMaterial` — e nenhum dos dois e
 * Compras, porque as 26 rotas do modulo viviam soltas dentro de `server/index.js`, que nenhum
 * teste carrega (subir o `index.js` sobe o servidor inteiro). O modulo core com o maior numero de
 * rotas do sistema nao tinha ONDE ser exercido. Sem esta montagem, nenhuma task da Etapa 38 tem
 * regua — e por isso a extracao e a Task 1, antes do `POST` que a etapa inteira quer entregar.
 *
 * Esta task e SO MOVIMENTACAO: mesmos handlers, mesma ORDEM de registro, mesmos gates
 * (`authenticateToken` + `checkModulePermission('compras')` — o core tem UMA camada de
 * autorizacao, nao duas: nenhum `requirePermission`, nenhum `ACAO_PERFIS`). Por isso o unico gate
 * exercitavel aqui e o **401 sem usuario**; um cenario de 403 de perfil mediria uma camada que
 * este modulo nao tem.
 *
 * ⚠️ O CENARIO (4) CONGELA UM DEFEITO, DE PROPOSITO. `app.delete('/api/compras/:tipo/:id')` foi
 * registrado ANTES de `app.delete('/api/compras/grupos/:id')`, e `tables['grupos']` nao existe no
 * mapa do generico: apagar um grupo responde hoje **400 `'Tipo inválido'`** e o grupo continua
 * ativo. **Nao e o que queremos; e o que existe.** Consertar e etapa propria (muda o
 * comportamento de outra aba). O cenario existe para detectar REORDENACAO durante a extracao: um
 * copiar-colar que "organize as rotas por recurso" consertaria o defeito SEM QUERER, dentro de
 * uma task que promete "sem mudar comportamento" — e e exatamente esse tipo de divergencia que
 * ninguem audita depois.
 *
 * ⚠️ O pedido ORFAO do cenario (1) tambem nao e enfeite: sem uma linha de `pedidos_compra` cujo
 * `fornecedor_id` nao existe, trocar o `LEFT JOIN fornecedores` por `JOIN` na
 * `GET /api/compras/pedidos` nao derruba assercao nenhuma (medido pela sabotagem 3 da Task 1). O
 * stub do harness declara `pedidos_compra` SEM a FK para `fornecedores` (Etapa 37, decisao 8),
 * entao a linha orfa e inserivel — e e ela que prova que o JOIN e o da esquerda.
 *
 * Executar: cd server && node tests/api/comprasPedidosRotas.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// (iii) Nenhum id de fixture `1`, nem o primeiro da lista: os ids sao SEMPRE lidos do `INSERT`.
// Usuario na mesma numeracao de `recebimentoExcedente.api.test.js` (64/65/66).
const ADMIN = { id: 64, nome: 'Admin Compras E38', role: 'admin' };

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  // `grupos_compras` e tabela CORE (`server/index.js:19259`), fora do initSchema do almoxarifado e
  // fora do stub do harness. Criada AQUI porque o cenario (4) precisa de um grupo REAL: o 400 do
  // generico sai antes de qualquer SQL, mas a assercao "o grupo continua ativo" so vale contra uma
  // linha que existe — e a sabotagem 1 (mover o generico para depois do bloco de grupos) precisa
  // encontrar a tabela para responder 200 em vez de 500.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS grupos_compras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    numero INTEGER DEFAULT 10,
    ordem INTEGER DEFAULT 0,
    foto TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ---- Fixtures: ids lidos do INSERT, nunca escritos a mao ----
  const fornecedor = await dbRun(db,
    "INSERT INTO fornecedores (razao_social, nome_fantasia, cnpj, status) VALUES (?,?,?,'ativo')",
    ['Fornecedor Teste 38', 'FT38', '38.000.000/0001-38']);
  const fornecedorId = fornecedor.lastID;

  const pedido = await dbRun(db,
    "INSERT INTO pedidos_compra (numero, fornecedor_id, status, valor_total) VALUES (?,?,?,?)",
    ['PC-FIXTURE-38', fornecedorId, 'aprovado', 250.5]);
  const pedidoId = pedido.lastID;

  // Pedido ORFAO: `fornecedor_id` que nao tem linha em `fornecedores`. E a unica assercao capaz de
  // distinguir `LEFT JOIN` de `JOIN` (ver cabecalho). Status e numero diferentes do fixture para
  // nao contaminar os filtros do cenario (2).
  const fornecedorInexistente = fornecedorId + 9000;
  const orfao = await dbRun(db,
    "INSERT INTO pedidos_compra (numero, fornecedor_id, status, valor_total) VALUES (?,?,?,?)",
    ['PC-ORFAO-38', fornecedorInexistente, 'cancelado', 10]);
  const orfaoId = orfao.lastID;

  const grupo = await dbRun(db,
    'INSERT INTO grupos_compras (nome, numero, ordem, ativo) VALUES (?,?,?,1)',
    ['Grupo Teste 38', 42, 0]);
  const grupoId = grupo.lastID;

  await test('(1) GET /api/compras/pedidos responde 200, traz o pedido inserido e o LEFT JOIN resolve o fornecedor', async () => {
    const res = await request(app).get('/api/compras/pedidos');
    assert.strictEqual(res.status, 200, `body: ${JSON.stringify(res.body)}`);
    assert.strictEqual(Array.isArray(res.body), true, 'a rota devolve array');
    assert.strictEqual(res.body.length, 2, `esperava os dois pedidos, veio ${res.body.length}`);

    // Lido pelo `numero`, nao pelo indice: `ORDER BY p.created_at DESC` nao desempata duas linhas
    // inseridas no mesmo segundo.
    const fixture = res.body.find((p) => p.numero === 'PC-FIXTURE-38');
    assert.ok(fixture, 'o pedido PC-FIXTURE-38 tem de aparecer na listagem');
    assert.strictEqual(fixture.id, pedidoId);
    assert.strictEqual(fixture.fornecedor_id, fornecedorId);
    assert.strictEqual(fixture.status, 'aprovado');
    assert.strictEqual(fixture.fornecedor_nome, 'Fornecedor Teste 38',
      'o LEFT JOIN com fornecedores tem de trazer razao_social como fornecedor_nome');

    // A METADE QUE PROVA O `LEFT`: o pedido sem fornecedor CONTINUA aparecendo, com nome nulo.
    // Com `JOIN` simples esta linha sumiria e `res.body.length` cairia para 1.
    const semFornecedor = res.body.find((p) => p.numero === 'PC-ORFAO-38');
    assert.ok(semFornecedor, 'pedido com fornecedor_id inexistente TEM de continuar na listagem (LEFT JOIN)');
    assert.strictEqual(semFornecedor.id, orfaoId);
    assert.strictEqual(semFornecedor.fornecedor_nome, null,
      'sem fornecedor casado, fornecedor_nome e null — nao ausente, nao string vazia');
  });

  await test('(2) os filtros ?search e ?status continuam filtrando (positivo e negativo no mesmo cenario)', async () => {
    const achou = await request(app).get('/api/compras/pedidos?search=FIXTURE');
    assert.strictEqual(achou.status, 200);
    assert.strictEqual(achou.body.length, 1, `?search=FIXTURE: ${JSON.stringify(achou.body)}`);
    assert.strictEqual(achou.body[0].numero, 'PC-FIXTURE-38');

    const naoAchou = await request(app).get('/api/compras/pedidos?search=naoexiste');
    assert.strictEqual(naoAchou.status, 200);
    assert.strictEqual(naoAchou.body.length, 0, 'search sem casamento devolve lista vazia, nao tudo');

    // `search` tambem casa a razao social do fornecedor (`p.numero LIKE ? OR f.razao_social LIKE ?`)
    const porFornecedor = await request(app).get('/api/compras/pedidos?search=Fornecedor Teste 38');
    assert.strictEqual(porFornecedor.body.length, 1, 'search casa a razao_social do fornecedor');
    assert.strictEqual(porFornecedor.body[0].numero, 'PC-FIXTURE-38');

    const aprovados = await request(app).get('/api/compras/pedidos?status=aprovado');
    assert.strictEqual(aprovados.body.length, 1, `?status=aprovado: ${JSON.stringify(aprovados.body)}`);
    assert.strictEqual(aprovados.body[0].numero, 'PC-FIXTURE-38');

    const pendentes = await request(app).get('/api/compras/pedidos?status=pendente');
    assert.strictEqual(pendentes.body.length, 0, 'status sem pedido devolve 0 — o filtro e igualdade exata');
  });

  await test('(3) o gate continua: sem usuario -> 401; com usuario -> 200 (as duas metades juntas)', async () => {
    setUser(null);
    const semToken = await request(app).get('/api/compras/pedidos');
    assert.strictEqual(semToken.status, 401, `sem usuario tem de dar 401: ${JSON.stringify(semToken.body)}`);

    // METADE POSITIVA: sem ela, uma rota que respondesse 401 SEMPRE (ou que nem estivesse montada,
    // se o 404 virasse 401 por acidente) passaria neste cenario.
    setUser(ADMIN);
    const comToken = await request(app).get('/api/compras/pedidos');
    assert.strictEqual(comToken.status, 200, `com usuario tem de dar 200: ${JSON.stringify(comToken.body)}`);
    assert.strictEqual(comToken.body.length, 2);
  });

  await test('(4) CARACTERIZACAO da ordem de registro: o DELETE generico sombreia o de grupos', async () => {
    // O generico `/:tipo/:id` esta registrado ANTES de `/grupos/:id`. `tables['grupos']` nao
    // existe, entao Express entrega a chamada ao generico e ele recusa o tipo.
    // NAO E O COMPORTAMENTO DESEJADO — e o que existe hoje, e esta assercao esta aqui para
    // acusar reordenacao durante a extracao.
    const res = await request(app).delete(`/api/compras/grupos/${grupoId}`);
    assert.strictEqual(res.status, 400,
      `apagar grupo cai no generico e responde 400 hoje: ${res.status} ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error, 'Tipo inválido');

    const aindaAtivo = await dbGet(db, 'SELECT ativo FROM grupos_compras WHERE id = ?', [grupoId]);
    assert.strictEqual(aindaAtivo.ativo, 1,
      'como o generico venceu, o soft-delete de grupo NAO rodou e o grupo segue ativo');

    // METADE POSITIVA: o generico funciona para um tipo que ele CONHECE. Sem esta metade, um
    // 400 vindo de qualquer outro motivo (rota derrubada, middleware quebrado) passaria pelo
    // cenario. Afirma o STATUS e a linha sumida — NAO a mensagem: a Task 3 registra um DELETE
    // especifico de pedido ANTES do generico e o texto da resposta muda de dono.
    const del = await request(app).delete(`/api/compras/pedidos/${orfaoId}`);
    assert.strictEqual(del.status, 200, `DELETE de pedido: ${JSON.stringify(del.body)}`);
    const sumiu = await dbGet(db, 'SELECT id FROM pedidos_compra WHERE id = ?', [orfaoId]);
    assert.strictEqual(sumiu, undefined, 'a linha do pedido tem de ter sumido de pedidos_compra');

    // E o generico recusa tipo desconhecido com a mesma literal (a regua do proprio 400).
    const tipoBobo = await request(app).delete(`/api/compras/inexistente/${pedidoId}`);
    assert.strictEqual(tipoBobo.status, 400);
    assert.strictEqual(tipoBobo.body.error, 'Tipo inválido');
  });

  await test('(5) as outras familias de rota movidas respondem pelo harness (fornecedores, grupos, itens)', async () => {
    // Uma familia de rota por assercao: o que esta sob regua aqui e "a rota esta montada e
    // responde o que respondia", nao a regra de negocio de cada uma.
    const forn = await request(app).get('/api/compras/fornecedores');
    assert.strictEqual(forn.status, 200, `GET fornecedores: ${JSON.stringify(forn.body)}`);
    assert.strictEqual(forn.body.length, 1);
    assert.strictEqual(forn.body[0].razao_social, 'Fornecedor Teste 38');

    const grupos = await request(app).get('/api/compras/grupos');
    assert.strictEqual(grupos.status, 200, `GET grupos: ${JSON.stringify(grupos.body)}`);
    assert.strictEqual(grupos.body.length, 1);
    assert.strictEqual(grupos.body[0].nome, 'Grupo Teste 38');

    const grupoUm = await request(app).get(`/api/compras/grupos/${grupoId}`);
    assert.strictEqual(grupoUm.status, 200);
    assert.strictEqual(grupoUm.body.numero, 42);

    // POST de grupo: prova que a escrita tambem atravessou a extracao (e o 400 do nome vazio,
    // que e validacao na mao — esta task NAO troca isso por Zod).
    const criado = await request(app).post('/api/compras/grupos').send({ nome: 'Grupo Novo 38', numero: 55 });
    assert.strictEqual(criado.status, 201, `POST grupos: ${JSON.stringify(criado.body)}`);
    assert.ok(criado.body.id, 'o POST devolve o id do grupo criado');
    const gravado = await dbGet(db, 'SELECT nome, numero FROM grupos_compras WHERE id = ?', [criado.body.id]);
    assert.strictEqual(gravado.nome, 'Grupo Novo 38');
    assert.strictEqual(gravado.numero, 55);

    const semNome = await request(app).post('/api/compras/grupos').send({ numero: 55 });
    assert.strictEqual(semNome.status, 400);
    assert.strictEqual(semNome.body.error, 'Nome do grupo é obrigatório');

    // Itens do fornecedor: `itens_fornecedor` e tabela core que o harness nao stuba. Criada aqui
    // pelo mesmo motivo de `grupos_compras`, e so com as colunas que as rotas movidas tocam.
    await dbRun(db, `CREATE TABLE IF NOT EXISTS itens_fornecedor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fornecedor_id INTEGER,
      codigo TEXT,
      descricao TEXT,
      unidade TEXT DEFAULT 'UN',
      preco REAL DEFAULT 0,
      observacoes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    const item = await request(app).post(`/api/compras/fornecedores/${fornecedorId}/itens`)
      .send({ codigo: 'IT-38', descricao: 'Parafuso sextavado', unidade: 'PC', preco: 3.5 });
    assert.strictEqual(item.status, 201, `POST itens: ${JSON.stringify(item.body)}`);
    const listaItens = await request(app).get(`/api/compras/fornecedores/${fornecedorId}/itens`);
    assert.strictEqual(listaItens.status, 200);
    assert.strictEqual(listaItens.body.length, 1);
    assert.strictEqual(listaItens.body[0].descricao, 'Parafuso sextavado');
    assert.strictEqual(listaItens.body[0].preco, 3.5);

    // A importacao de planilha depende dos 5 helpers (`extrairDescricaoDoRow`, `extrairDoRow`,
    // `extrairPrecoDoRow`, `parsePrecoBackend`, `normalizarCampo`) que moram no mesmo bloco
    // extraido: se algum tivesse ficado para tras, este POST cairia com ReferenceError -> 500.
    const importado = await request(app).post(`/api/compras/fornecedores/${fornecedorId}/itens/importar`)
      .send({ linhas: [{ 'descrição': 'Chapa de aco 3mm', 'código': 'CH-3', unidade: 'KG', 'preço': '1.234,56' }] });
    assert.strictEqual(importado.status, 200, `POST importar: ${JSON.stringify(importado.body)}`);
    assert.strictEqual(importado.body.inseridos, 1);
    const linha = await dbGet(db,
      'SELECT codigo, descricao, unidade, preco FROM itens_fornecedor WHERE codigo = ?', ['CH-3']);
    assert.ok(linha, 'a linha importada tem de existir — prova que os 5 helpers vieram junto');
    assert.strictEqual(linha.descricao, 'Chapa de aco 3mm');
    assert.strictEqual(linha.unidade, 'KG');
    assert.strictEqual(linha.preco, 1234.56, 'parsePrecoBackend converte o formato pt-BR');

    const vazio = await request(app).post(`/api/compras/fornecedores/${fornecedorId}/itens/importar`).send({});
    assert.strictEqual(vazio.status, 400);
    assert.strictEqual(vazio.body.error,
      'Envie "linhas" ou "rows" com array de objetos (qualquer formato de planilha)');

    const todos = await dbAll(db, 'SELECT id FROM itens_fornecedor WHERE fornecedor_id = ?', [fornecedorId]);
    assert.strictEqual(todos.length, 2, 'o payload recusado NAO pode ter gravado linha');
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
