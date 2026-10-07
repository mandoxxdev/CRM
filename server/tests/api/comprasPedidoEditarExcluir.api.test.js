/**
 * RN-C06, RN-C07 e RN-C08 (Etapa 38, Task 3) — `GET /:id`, `PUT` e `DELETE` do pedido de compra:
 * a REGUA QUE PERGUNTA AO RECEBIMENTO.
 *
 * ── OS DOIS FUROS QUE ESTE ARQUIVO EXISTE PARA PAGAR ──────────────────────────────────────────
 *
 * 1. **Nao havia como ler nem editar UM pedido.** O modulo tinha `GET /api/compras/pedidos`
 *    (lista) e, desde a Task 2, o `POST`. `GET /api/compras/pedidos/:id` e
 *    `PUT /api/compras/pedidos/:id` **nao existiam** — o `<Link>` "Editar" de cada linha da tela
 *    (`Compras.js:277`) caia no `path="*"` do `App.js` e piscava de volta para a lista.
 *
 * 2. **O `DELETE` que existia apagava a CABECA e deixava os ITENS orfaos.** Quem responde
 *    `DELETE /api/compras/pedidos/7` hoje e o generico `app.delete('/api/compras/:tipo/:id')`
 *    (`routes/compras.js`, o antigo `index.js:20060`): ele faz `DELETE FROM pedidos_compra WHERE
 *    id = ?` e **nada mais**. Antes da Etapa 38 isso era inofensivo porque
 *    `COUNT(itens_pedido_compra) = 0` em producao — a partir da Task 2 ha itens de verdade para
 *    ficar apontando para pedido inexistente. E, pior: ele **nao pergunta nada ao recebimento**,
 *    entao um pedido com material ja recebido era apagavel por um clique na lixeira da lista.
 *
 * ── ⚠️ A ORDEM DE REGISTRO E COMPORTAMENTO, e este arquivo e a regua dela ─────────────────────
 * `/api/compras/pedidos/7` tem **dois segmentos** e casa o padrao `/:tipo/:id` do generico. As
 * rotas novas de pedido entram **ANTES** dele no arquivo; registradas depois, o 409 desta task
 * **nunca seria alcancado** e a lixeira continuaria apagando. O cenario (5) mede isso pelo status
 * (409 vs 200) e o cenario (8) guarda a metade positiva: o generico **continua** respondendo pelas
 * outras abas (`cotacoes`) e **continua** sombreando `DELETE /api/compras/grupos/:id` com
 * `400 'Tipo inválido'` — a caracterizacao da Task 1, que este arquivo NAO conserta.
 *
 * ── ⚠️ AS DUAS PERNAS DA REGUA, e por que uma so nao basta ────────────────────────────────────
 * Perna 1: alguma linha com `COALESCE(quantidade_recebida, 0) > 0` (material ja entrou no estoque).
 * Perna 2: existe `recebimentos_material_almoxarifado WHERE pedido_compra_id = ?` — o recebimento
 * **criado e nao processado**, que pela RN-23 da Etapa 37 tem `quantidade_recebida` ainda **0** e
 * por isso **passa pela perna 1**.
 *
 * O dano que a perna 2 evita no `PUT` foi medido por sonda executada antes de implementar, e e o
 * achado mais caro desta revisao: o `PUT` **apaga e reinsere** as linhas, e os ids novos nao sao os
 * antigos. O recebimento aberto guarda `pedido_item_id` (`schema.js:1306`, INTEGER **sem FK** de
 * proposito) apontando para a linha **antiga**. Ao processar, o acumulador da Etapa 37 e
 * `UPDATE itens_pedido_compra … WHERE id = ?` (`receiptService.js:1261-1268`): **0 linhas alteradas
 * nao e erro em SQLite**, o `catch` nao dispara e nao sai nem `warn`. O material entra no estoque e
 * o pedido fica `ABERTO` com o saldo **cheio, para sempre**. Cenario (4b).
 *
 * ── ⚠️ O QUE O CENARIO (7) MEDE E O COMPORTAMENTO DO HARNESS, e isso esta declarado ───────────
 * O harness roda com `PRAGMA foreign_keys = 0` (`planoInspecao.api.test.js:233` **assere** isso),
 * entao apagar a cabeca sem os filhos **deixa linha orfa** e a segunda assercao do (7) acusa. Em
 * PRODUCAO a FK esta **ON** (`sqliteConcurrency.js:50`) e `itens_pedido_compra` declara
 * `FOREIGN KEY (pedido_id)` (`schema.js:1319`): la o mesmo codigo **falharia** com
 * `FOREIGN KEY constraint failed` -> 500 `'Erro ao excluir item'`. Ou seja, o defeito de hoje tem
 * duas caras (orfao no harness, 500 em producao) e o conserto e o mesmo: `excluirPedido` apaga os
 * **filhos primeiro**.
 *
 * ⚠️ GATE: o modulo core Compras tem **UMA** camada de autorizacao (`authenticateToken` +
 * `checkModulePermission('compras')`, medido nas 26 rotas). O harness libera a camada 2, entao o
 * unico gate de rota exercitavel aqui e o **401 sem usuario** (cenario 10). Nao ha `requirePermission`
 * nestas tres portas — e o `PUT`/`DELETE` **nao escrevem** em tabela do almoxarifado, so a LEEM,
 * entao nao ha o gate condicional que o `POST` ganhou no fix 1 da Task 2.
 *
 * Executar: cd server && node tests/api/comprasPedidoEditarExcluir.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
// Onda de correcao, F2: o servico e chamado DIRETO no cenario (11) porque a perna que libera a
// solicitacao mora nele, e ha chamadores sem HTTP (a importacao da T4 e a Reposicao da T6).
const pedidoCompraService = require('../../services/compras/pedidoCompraService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// (iii) das regras herdadas: nenhum id de fixture escrito a mao — todos lidos do `INSERT` ou da
// resposta do `POST`. Usuarios na numeracao de `comprasPedidoCriar` (64/65/66), com o 65 livre.
const ADMIN = { id: 64, nome: 'Admin Compras E38 T3', role: 'admin' };
const COMPRADOR = { id: 66, nome: 'Comprador E38 T3', role: 'user' };

// As literais dos contratos 3 e 4 do plano, VERBATIM e em constante — o `grep` de uma frase acha o
// dono e o teste na mesma varredura.
const NAO_ENCONTRADO = 'Pedido de compra não encontrado';
const jaRecebeuEdicao = (numero) => `Pedido de compra ${numero} já teve recebimento — não pode mais ser editado`;
const jaRecebeuExclusao = (numero) => `Pedido de compra ${numero} já teve recebimento — não pode ser excluído`;
const EXCLUIDO = 'Pedido de compra excluído com sucesso';
// Onda de correcao, F5: a literal do 409 do DELETE generico de fornecedor.
const FORNECEDOR_COM_PEDIDOS = 'Fornecedor possui pedidos de compra — não pode ser excluído';
// A MESMA literal de status do contrato 2 (o `PUT` reusa o schema do `POST`): os 7 valores, e
// `PARCIAL`/`RECEBIDO` de fora porque sao a DERIVACAO do almoxarifado, nao valor gravavel.
const ERRO_STATUS = 'Dados inválidos — status: status do pedido inválido (use pendente, aprovado, rejeitado, em_analise, enviado, recebido ou cancelado)';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  // `cotacoes` e tabela CORE que o harness nao stuba (como `grupos_compras` na Task 1). Criada
  // aqui porque o cenario (8) precisa de uma linha para o generico apagar — e e ele que prova que
  // registrar as rotas de pedido antes do generico NAO quebrou as outras abas. Sem FK para
  // `fornecedores`: o harness roda `foreign_keys = 0` e a FK de producao nao muda o que se mede.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS cotacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE,
    fornecedor_id INTEGER,
    valor_total REAL DEFAULT 0,
    data_cotacao DATE,
    validade DATE,
    status TEXT DEFAULT 'em_analise',
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // `grupos_compras`, pelo mesmo motivo: o cenario (8) reafirma a CARACTERIZACAO da Task 1 (o
  // generico sombreia `DELETE /api/compras/grupos/:id` e responde 400). Mesmo DDL de
  // `comprasPedidosRotas.api.test.js`.
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

  // ---- Fixtures. `validarDadosProcessamento` exige fornecedor no recebimento por pedido, e o
  // `POST` da Etapa 37 herda o fornecedor DO PEDIDO — entao o fornecedor e de verdade.
  const forn = await dbRun(db,
    "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Fornecedor Edicao E38','22333444000155','ativo')");
  const fornecedorId = forn.lastID;

  const matA = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, ativo) VALUES ('MAT-T3-A','Chapa de aco T3','PC',0,1)`);
  const materialIdA = matA.lastID;
  const matB = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, ativo) VALUES ('MAT-T3-B','Rebite T3','CX',0,1)`);
  const materialIdB = matB.lastID;

  // Todo pedido nasce pela PORTA REAL da Task 2 — nao por `INSERT` na mao. E o que garante que a
  // regua desta task mede o pedido que o comprador consegue criar de fato.
  const payload = (itens, extra = {}) => ({ fornecedor_id: fornecedorId, itens, ...extra });
  async function novoPedido(itens, extra = {}) {
    const r = await request(app).post('/api/compras/pedidos').send(payload(itens, extra));
    assert.strictEqual(r.status, 201, `fixture: POST do pedido falhou ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  }
  const doisItens = () => ([
    { material_id: materialIdA, quantidade: 10, valor_unitario: 50 },
    { material_id: materialIdB, quantidade: 4, valor_unitario: 25 },
  ]);

  const idsDasLinhas = async (pedidoId) => (await dbAll(db,
    'SELECT id FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id', [pedidoId])).map((l) => l.id);
  const contarItens = async (pedidoId) => (await dbGet(db,
    'SELECT COUNT(*) as n FROM itens_pedido_compra WHERE pedido_id = ?', [pedidoId])).n;
  const contarPedidos = async () => (await dbGet(db, 'SELECT COUNT(*) as n FROM pedidos_compra')).n;
  const cabecalho = (pedidoId) => dbGet(db, 'SELECT * FROM pedidos_compra WHERE id = ?', [pedidoId]);

  /**
   * O recebimento CRIADO E NAO PROCESSADO, pela PORTA REAL da Etapa 37 (molde da T7 de la,
   * `recebimentoContraPedidoIntegracao.api.test.js:148`) — nao por `INSERT` na mao.
   *
   * A diferenca importa: e o `POST` do almoxarifado que grava `pedido_item_id` apontando para a
   * linha do pedido, e e exatamente esse elo que a perna 2 protege. Um `INSERT` manual mediria um
   * documento que a tela nunca produz, e o `pedido_item_id` (que e o centro do achado) poderia
   * estar errado sem ninguem notar.
   */
  async function recebimentoAbertoPara(pedido, linhaId, materialId, quantidade) {
    const r = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id,
      itens: [{
        material_id: materialId, pedido_item_id: linhaId, quantidade, quantidade_recebida: quantidade,
      }],
    });
    assert.strictEqual(r.status, 201, `fixture: POST do recebimento da E37 falhou ${r.status} ${JSON.stringify(r.body)}`);
    const itens = await dbAll(db, `SELECT pedido_item_id, quantidade_recebida
      FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?`, [r.body.id]);
    assert.strictEqual(itens.length, 1, 'fixture: o recebimento nasceu sem item');
    assert.strictEqual(itens[0].pedido_item_id, linhaId,
      'fixture: o recebimento tem de guardar o pedido_item_id da linha (e o elo que a perna 2 protege)');
    // RN-23 da Etapa 37: CRIAR documento nao consome saldo — a linha do PEDIDO continua com 0, e e
    // por isso que este documento PASSA pela perna 1 da regua.
    const linha = await dbGet(db, 'SELECT quantidade_recebida FROM itens_pedido_compra WHERE id = ?', [linhaId]);
    assert.strictEqual(linha.quantidade_recebida, 0,
      'fixture: um recebimento nao processado tem de deixar a linha do pedido com 0 (senao o cenario mede a perna 1)');
    return r.body.id;
  }

  // (1) ------------------------------------------------------------------------------------
  await test('(1) GET /api/compras/pedidos/:id -> 200 com o cabecalho, o fornecedor_nome e as DUAS linhas', async () => {
    const criado = await novoPedido(doisItens(), { data_pedido: '2026-09-16', observacoes: 'Retirar na doca T3' });

    const r = await request(app).get(`/api/compras/pedidos/${criado.id}`);
    assert.strictEqual(r.status, 200, `esperava 200, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.id, criado.id, 'id divergente');
    assert.strictEqual(r.body.numero, criado.numero, 'o numero lido nao e o que o POST gerou');
    assert.strictEqual(r.body.fornecedor_nome, 'Fornecedor Edicao E38',
      'fornecedor_nome vem do LEFT JOIN em fornecedores — sem ele a tela de edicao abre sem fornecedor');
    assert.strictEqual(r.body.valor_total, 600, `10x50 + 4x25 = 600, veio ${r.body.valor_total}`);
    assert.strictEqual(r.body.data_pedido, '2026-09-16', 'data_pedido nao voltou no cabecalho');
    assert.strictEqual(r.body.observacoes, 'Retirar na doca T3', 'observacoes nao voltou no cabecalho');

    // O QUE MEDE O DANO: o 200 nao prova nada. Um `GET` que devolvesse so o cabecalho abriria a
    // tela de edicao com a tabela de itens VAZIA, e o `PUT` seguinte apagaria as linhas do pedido.
    assert.strictEqual((r.body.itens || []).length, 2, `esperava 2 itens, vieram ${(r.body.itens || []).length}`);
    assert.strictEqual(r.body.itens[0].material_id, materialIdA, 'ORDER BY id: a primeira linha e a primeira lancada');
    assert.strictEqual(r.body.itens[0].codigo, 'MAT-T3-A', 'codigo do material nao veio na linha');
    assert.strictEqual(r.body.itens[0].descricao, 'Chapa de aco T3', 'descricao (materiais_almoxarifado.nome) nao veio');
    assert.strictEqual(r.body.itens[0].unidade, 'PC', 'unidade nao veio na linha');
    assert.strictEqual(r.body.itens[0].quantidade, 10, 'quantidade da primeira linha errada');
    assert.strictEqual(r.body.itens[0].valor_unitario, 50, 'valor_unitario da primeira linha errado');
    assert.strictEqual(r.body.itens[0].quantidade_recebida, 0,
      'quantidade_recebida tem de VIR na linha: e o que faz a tela saber que o pedido ainda e editavel');
    assert.strictEqual(r.body.itens[1].material_id, materialIdB, 'segunda linha errada');
    assert.ok(r.body.itens[0].id && r.body.itens[1].id, 'a linha sem `id` nao pode ser editada nem recebida');

    // ⚠️ OS DERIVADOS (`saldo_pendente`, `situacao_recebimento`) NAO SAO DAQUI, e a ausencia e
    // decisao declarada: quem os calcula e `derivarRecebimentoDoPedido` de
    // `services/almoxarifado/receiptService.js`, que **nao e exportada** — e aquele arquivo e
    // CONTRATO DE NAO-TOQUE nas Global Constraints desta etapa. Duplicar a conta aqui daria duas
    // formulas de saldo divergindo na primeira edicao (o smell que a re-revisao da 37 acusou).
    // Entao o derivado se mede onde ele mora, pela rota da 37, e este cruzamento e a prova de que
    // o pedido criado/lido por esta task e o MESMO objeto que o recebimento ve.
    const aux = await request(app).get(`/api/almoxarifado/recebimentos-aux/pedidos-compra/${criado.id}/itens`);
    assert.strictEqual(aux.status, 200, `rota de itens da E37: ${aux.status} ${JSON.stringify(aux.body)}`);
    const linhaAux = aux.body.find((l) => l.id === r.body.itens[0].id);
    assert.ok(linhaAux, 'a linha lida pelo GET do Compras tem de ser a MESMA que a E37 oferece (mesmo id)');
    assert.strictEqual(linhaAux.saldo_pendente, 10, `saldo_pendente derivado errado: ${linhaAux.saldo_pendente}`);
    // `situacao_recebimento` e derivado POR PEDIDO e mora na rota de LISTA da 37 (a de itens
    // publica `saldo_pendente` por linha, medido) — mais uma razao para nao reproduzir a conta
    // aqui: nem a forma dos derivados e a mesma nas duas leituras de lá.
    const lista = await request(app).get(`/api/almoxarifado/recebimentos-aux/pedidos-compra?search=${criado.numero}`);
    assert.strictEqual(lista.status, 200, `rota de lista da E37: ${lista.status}`);
    const pedidoAux = lista.body.find((p) => p.id === criado.id);
    assert.ok(pedidoAux, 'o pedido lido pelo GET do Compras tem de aparecer na lista da E37');
    assert.strictEqual(pedidoAux.saldo_pendente, 14, `saldo do pedido derivado errado: ${pedidoAux.saldo_pendente}`);
    assert.strictEqual(pedidoAux.situacao_recebimento, 'ABERTO', `situacao derivada errada: ${pedidoAux.situacao_recebimento}`);
  });

  // (2) ------------------------------------------------------------------------------------
  await test('(2) id inexistente -> 404 com UMA literal so, nas TRES portas', async () => {
    const inexistente = (await contarPedidos()) + 98765;

    const g = await request(app).get(`/api/compras/pedidos/${inexistente}`);
    assert.strictEqual(g.status, 404, `GET: esperava 404, veio ${g.status}`);
    assert.strictEqual(g.body.error, NAO_ENCONTRADO, 'GET: literal divergente');

    const p = await request(app).put(`/api/compras/pedidos/${inexistente}`).send(payload(doisItens()));
    assert.strictEqual(p.status, 404, `PUT: esperava 404, veio ${p.status} ${JSON.stringify(p.body)}`);
    assert.strictEqual(p.body.error, NAO_ENCONTRADO, 'PUT: literal divergente');

    // ⚠️ AQUI ESTA O ACHADO DA ORDEM DE REGISTRO: hoje quem responde este DELETE e o generico, e
    // ele diz `'Item não encontrado'`. Uma literal nova ("Pedido nao existe") seria a TERCEIRA
    // frase para o mesmo fato — ja ha uma em `extended.js` (E37) e em `purchaseService:62`.
    const d = await request(app).delete(`/api/compras/pedidos/${inexistente}`);
    assert.strictEqual(d.status, 404, `DELETE: esperava 404, veio ${d.status}`);
    assert.strictEqual(d.body.error, NAO_ENCONTRADO, 'DELETE: literal divergente');

    // METADE POSITIVA no mesmo test(): as tres portas respondem 200 para um pedido que EXISTE.
    // Sem ela, tres rotas que respondessem 404 SEMPRE passariam neste cenario.
    const vivo = await novoPedido([{ material_id: materialIdA, quantidade: 1, valor_unitario: 1 }]);
    assert.strictEqual((await request(app).get(`/api/compras/pedidos/${vivo.id}`)).status, 200, 'GET do pedido existente');
    assert.strictEqual((await request(app).put(`/api/compras/pedidos/${vivo.id}`)
      .send(payload([{ material_id: materialIdA, quantidade: 2, valor_unitario: 1 }]))).status, 200, 'PUT do pedido existente');
    assert.strictEqual((await request(app).delete(`/api/compras/pedidos/${vivo.id}`)).status, 200, 'DELETE do pedido existente');
  });

  // Este pedido atravessa os cenarios (3) e (4) na ordem: o (3) o edita, o (4) lanca recebimento
  // nele e afirma que a edicao recusada NAO desfez o que o (3) gravou.
  const pedidoEditavel = await novoPedido(doisItens());

  // (3) ------------------------------------------------------------------------------------
  await test('(3) PUT com nada recebido -> 200: quantidade muda, itens sao SUBSTITUIDOS e valor_total e recalculado', async () => {
    const idsAntes = await idsDasLinhas(pedidoEditavel.id);
    assert.strictEqual(idsAntes.length, 2, 'o pedido de fixture tem de comecar com duas linhas');

    // UM item onde havia DOIS — e o teste da SUBSTITUICAO, nao do UPDATE campo a campo.
    const r = await request(app).put(`/api/compras/pedidos/${pedidoEditavel.id}`).send(payload(
      [{ material_id: materialIdA, quantidade: 12, valor_unitario: 50 }],
      { status: 'aprovado', observacoes: 'Editado na T3' },
    ));
    assert.strictEqual(r.status, 200, `esperava 200, veio ${r.status} ${JSON.stringify(r.body)}`);

    const linhas = await dbAll(db, 'SELECT * FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id', [pedidoEditavel.id]);
    assert.strictEqual(linhas.length, 1, `esperava 1 linha depois da substituicao, vieram ${linhas.length}`);
    assert.strictEqual(linhas[0].quantidade, 12, `quantidade deveria ser 12, veio ${linhas[0].quantidade}`);
    assert.strictEqual(linhas[0].material_id, materialIdA, 'material da linha sobrevivente errado');
    assert.strictEqual(linhas[0].codigo, 'MAT-T3-A', 'a linha reinserida tem de recopiar codigo do material');
    assert.strictEqual(linhas[0].quantidade_recebida, 0,
      'a linha reinserida nasce 0 pelo DEFAULT — esta task NAO escreve quantidade_recebida');

    // ⚠️ E O QUE MOTIVA A PERNA 2: os ids NAO sao os antigos. Se houvesse recebimento aberto
    // apontando para as linhas velhas, ele ficaria orfao aqui — cenario (4b).
    assert.ok(!idsAntes.includes(linhas[0].id),
      `o PUT reinsere (id novo); com id reaproveitado este cenario nao provaria a substituicao: ${linhas[0].id}`);

    const cab = await cabecalho(pedidoEditavel.id);
    assert.strictEqual(cab.valor_total, 600, `12x50 = 600, veio ${cab.valor_total}`);
    assert.strictEqual(cab.status, 'aprovado', `status nao foi atualizado: ${cab.status}`);
    assert.strictEqual(cab.observacoes, 'Editado na T3', `observacoes nao foi atualizada: ${cab.observacoes}`);
    // `numero` NAO e editavel (contrato 4): ele e do servidor desde a Task 2.
    assert.strictEqual(cab.numero, pedidoEditavel.numero, 'o PUT nao pode trocar o numero do pedido');

    // A resposta e o pedido RELIDO (a tela redesenha com ela).
    assert.strictEqual(r.body.itens.length, 1, 'a resposta do PUT tem de trazer os itens relidos');
    assert.strictEqual(r.body.valor_total, 600, 'a resposta do PUT tem de trazer o valor_total derivado');
  });

  // (4) ------------------------------------------------------------------------------------
  await test('(4) PUT depois de recebimento PROCESSADO -> 400, e o que estava gravado FICA', async () => {
    // Perna 1 da regua: o acumulador da Etapa 37 (`darEntradaEstoque`) e quem escreve aqui em
    // producao. O `UPDATE` direto simula o pedido que JA teve entrada fisica — e isola a perna 1
    // do documento aberto (perna 2), que e o cenario (4b).
    const [linhaId] = await idsDasLinhas(pedidoEditavel.id);
    await dbRun(db, 'UPDATE itens_pedido_compra SET quantidade_recebida = 6 WHERE id = ?', [linhaId]);

    const r = await request(app).put(`/api/compras/pedidos/${pedidoEditavel.id}`)
      .send(payload([{ material_id: materialIdA, quantidade: 99, valor_unitario: 50 }]));
    assert.strictEqual(r.status, 400, `esperava 400, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, jaRecebeuEdicao(pedidoEditavel.numero), 'literal do 400 divergente');

    // ⚠️ E O QUE MEDE O DANO — o status 400 nao prova que nada foi escrito. Reinserir as linhas
    // APAGARIA a `quantidade_recebida` acumulada pela Etapa 37: perda de dado de estoque,
    // irreversivel sem SQL na mao.
    const linha = await dbGet(db, 'SELECT quantidade, quantidade_recebida FROM itens_pedido_compra WHERE id = ?', [linhaId]);
    assert.ok(linha, 'a linha nao pode ter sido apagada pelo PUT recusado');
    assert.strictEqual(linha.quantidade, 12, `quantidade tinha de continuar 12, veio ${linha.quantidade}`);
    assert.strictEqual(linha.quantidade_recebida, 6,
      `quantidade_recebida tinha de continuar 6, veio ${linha.quantidade_recebida} — o PUT apagou dado da E37`);
    assert.strictEqual(await contarItens(pedidoEditavel.id), 1, 'o PUT recusado nao pode mexer no numero de linhas');

    // METADE POSITIVA no mesmo test(): um SEGUNDO pedido, sem recebimento, aceita o MESMO PUT.
    // Sem ela, uma regua que recusasse TODO pedido (comparador `>= 0`) passaria aqui.
    const limpo = await novoPedido(doisItens());
    const ok = await request(app).put(`/api/compras/pedidos/${limpo.id}`)
      .send(payload([{ material_id: materialIdA, quantidade: 99, valor_unitario: 50 }]));
    assert.strictEqual(ok.status, 200, `o pedido SEM recebimento tem de aceitar o PUT, veio ${ok.status} ${JSON.stringify(ok.body)}`);
    const linhaOk = await dbGet(db, 'SELECT quantidade FROM itens_pedido_compra WHERE pedido_id = ?', [limpo.id]);
    assert.strictEqual(linhaOk.quantidade, 99, 'o PUT aceito tem de ter gravado a quantidade nova');
  });

  // (4b) -----------------------------------------------------------------------------------
  await test('(4b) PUT com recebimento CRIADO E NAO PROCESSADO -> 400 com a MESMA literal, e os ids das linhas FICAM', async () => {
    const pedido = await novoPedido([{ material_id: materialIdA, quantidade: 10, valor_unitario: 50 }]);
    const idsAntes = await idsDasLinhas(pedido.id);
    // O documento nasce pela porta real da E37, com `pedido_item_id` apontando para a linha e a
    // linha do pedido ainda em 0 — ou seja, ele PASSA pela perna 1.
    await recebimentoAbertoPara(pedido, idsAntes[0], materialIdA, 6);

    const r = await request(app).put(`/api/compras/pedidos/${pedido.id}`)
      .send(payload([{ material_id: materialIdB, quantidade: 3, valor_unitario: 25 }]));
    assert.strictEqual(r.status, 400, `esperava 400, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, jaRecebeuEdicao(pedido.numero),
      'a literal e a MESMA da perna 1: "ja teve recebimento" inclui o criado e nao processado');

    // ⚠️ E O QUE MEDE O DANO, e e o achado mais caro desta revisao: se o PUT tivesse passado, as
    // linhas seriam OUTRAS (ids novos) e o `pedido_item_id` do recebimento apontaria para linha
    // inexistente. Ao processar, o acumulador da 37 (`UPDATE … WHERE id = ?`) alteraria ZERO
    // linhas — e zero linhas NAO e erro em SQLite: sem excecao, sem `warn`. O material entraria no
    // estoque e o pedido ficaria `ABERTO` com o saldo CHEIO, para sempre.
    assert.deepStrictEqual(await idsDasLinhas(pedido.id), idsAntes,
      'os ids das linhas tem de ser os MESMOS — o PUT recusado nao pode ter reinserido nada');
    const elo = await dbGet(db, `SELECT r.pedido_item_id FROM recebimentos_material_itens_almoxarifado r
      JOIN recebimentos_material_almoxarifado c ON c.id = r.recebimento_id WHERE c.pedido_compra_id = ?`, [pedido.id]);
    const aindaExiste = await dbGet(db, 'SELECT id FROM itens_pedido_compra WHERE id = ?', [elo.pedido_item_id]);
    assert.ok(aindaExiste, `o pedido_item_id ${elo.pedido_item_id} do recebimento ficou apontando para o VAZIO`);

    // METADE POSITIVA no mesmo test(): pedido SEM recebimento nenhum aceita o mesmo PUT.
    const limpo = await novoPedido([{ material_id: materialIdA, quantidade: 10, valor_unitario: 50 }]);
    const ok = await request(app).put(`/api/compras/pedidos/${limpo.id}`)
      .send(payload([{ material_id: materialIdB, quantidade: 3, valor_unitario: 25 }]));
    assert.strictEqual(ok.status, 200, `pedido sem recebimento tem de aceitar o PUT, veio ${ok.status} ${JSON.stringify(ok.body)}`);
  });

  // (5) ------------------------------------------------------------------------------------
  await test('(5) DELETE de pedido com quantidade_recebida > 0 -> 409, e NADA e apagado', async () => {
    const pedido = await novoPedido(doisItens());
    const [linhaId] = await idsDasLinhas(pedido.id);
    await dbRun(db, 'UPDATE itens_pedido_compra SET quantidade_recebida = 3 WHERE id = ?', [linhaId]);
    const pedidosAntes = await contarPedidos();

    const r = await request(app).delete(`/api/compras/pedidos/${pedido.id}`);
    // ⚠️ SE ISTO VIER 200 A CAUSA MAIS PROVAVEL E A ORDEM DE REGISTRO: o generico `/:tipo/:id`
    // casou a chamada e apagou a cabeca sem perguntar nada ao recebimento.
    assert.strictEqual(r.status, 409, `esperava 409, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, jaRecebeuExclusao(pedido.numero), 'literal do 409 divergente');

    assert.strictEqual(await contarPedidos(), pedidosAntes, 'o 409 apagou o pedido mesmo assim');
    assert.ok(await cabecalho(pedido.id), 'o cabecalho do pedido tem de continuar no banco');
    assert.strictEqual(await contarItens(pedido.id), 2, 'o 409 nao pode ter apagado as linhas');

    // METADE POSITIVA no mesmo test(): o MESMO pedido, com a recebida de volta a 0, e excluivel.
    // Sem ela, um 409 incondicional passaria neste cenario.
    await dbRun(db, 'UPDATE itens_pedido_compra SET quantidade_recebida = 0 WHERE id = ?', [linhaId]);
    const ok = await request(app).delete(`/api/compras/pedidos/${pedido.id}`);
    assert.strictEqual(ok.status, 200, `com a recebida em 0 o DELETE tem de passar, veio ${ok.status} ${JSON.stringify(ok.body)}`);
  });

  // (6) ------------------------------------------------------------------------------------
  await test('(6) DELETE com recebimento CRIADO E NAO PROCESSADO -> 409 com a MESMA literal (perna 2)', async () => {
    const pedido = await novoPedido([{ material_id: materialIdA, quantidade: 8, valor_unitario: 10 }]);
    const [linhaId] = await idsDasLinhas(pedido.id);
    await recebimentoAbertoPara(pedido, linhaId, materialIdA, 5);
    const pedidosAntes = await contarPedidos();

    const r = await request(app).delete(`/api/compras/pedidos/${pedido.id}`);
    assert.strictEqual(r.status, 409, `esperava 409, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, jaRecebeuExclusao(pedido.numero),
      'a literal e a MESMA da perna 1 — e um fato so: "ja teve recebimento"');
    assert.strictEqual(await contarPedidos(), pedidosAntes, 'o 409 da perna 2 apagou o pedido mesmo assim');
    assert.strictEqual(await contarItens(pedido.id), 1, 'o 409 da perna 2 nao pode ter apagado as linhas');

    // E o documento do almoxarifado continua apontando para um pedido que EXISTE — que e o dano
    // que a perna 2 evita (RN-23: apagar o pedido debaixo de um recebimento aberto deixaria o
    // documento apontando para o vazio, e o operador conferiria uma nota contra nada).
    const doc = await dbGet(db,
      'SELECT pedido_compra_id FROM recebimentos_material_almoxarifado WHERE pedido_compra_id = ?', [pedido.id]);
    assert.ok(doc, 'o recebimento tem de continuar vinculado ao pedido');
    assert.ok(await cabecalho(doc.pedido_compra_id), 'o pedido apontado pelo recebimento tem de existir');
  });

  // (7) ------------------------------------------------------------------------------------
  await test('(7) DELETE de pedido limpo -> 200: a cabeca E as linhas somem (a segunda assercao e a do orfao)', async () => {
    const pedido = await novoPedido(doisItens());
    assert.strictEqual(await contarItens(pedido.id), 2, 'o pedido tem de comecar com duas linhas');

    const r = await request(app).delete(`/api/compras/pedidos/${pedido.id}`);
    assert.strictEqual(r.status, 200, `esperava 200, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.message, EXCLUIDO, 'literal do 200 divergente');

    assert.strictEqual(await cabecalho(pedido.id), undefined, 'o cabecalho tinha de sumir de pedidos_compra');
    // ⚠️ A ASSERCAO DO ORFAO — e sem ela este cenario passa com o comportamento de HOJE, porque o
    // generico apaga a cabeca e nada mais. No harness (`foreign_keys = 0`) o defeito aparece como
    // linha orfa; em PRODUCAO (`sqliteConcurrency.js:50` liga a FK) o mesmo codigo falharia com
    // `FOREIGN KEY constraint failed` -> 500 'Erro ao excluir item'. Dois sintomas, um conserto:
    // apagar os FILHOS primeiro.
    assert.strictEqual(await contarItens(pedido.id), 0,
      'as linhas do pedido tinham de sumir junto — orfao no harness, 500 por FK em producao');
    const orfas = await dbGet(db,
      'SELECT COUNT(*) as n FROM itens_pedido_compra WHERE pedido_id NOT IN (SELECT id FROM pedidos_compra)');
    assert.strictEqual(orfas.n, 0, `sobraram ${orfas.n} linhas de item apontando para pedido inexistente`);
  });

  // (8) ------------------------------------------------------------------------------------
  await test('(8) o generico continua respondendo pelas outras abas — e continua sombreando grupos', async () => {
    // METADE POSITIVA DA ORDEM DE REGISTRO: registrar `DELETE /api/compras/pedidos/:id` ANTES do
    // generico nao pode ter tirado o generico do ar para as abas que ele AINDA serve.
    //
    // ⚠️ CORRECAO DA ETAPA 41 (T2): ate a 40 esta metade media `cotacoes` pelo generico e afirmava a
    // literal `'Item excluído com sucesso'`. Desde a 41 `cotacoes` TAMBEM tem rota propria
    // (`DELETE /api/compras/cotacoes/:id`, registrada acima do generico — RN-F06, D9), entao o
    // generico so alcanca `fornecedores`. A metade positiva passa a usar um fornecedor sem vinculo;
    // a cotacao continua aqui, agora afirmando a literal PROPRIA — se um dia o generico voltar a
    // responder por ela, e esta assercao que acusa.
    const fornSolto = await dbRun(db, "INSERT INTO fornecedores (razao_social) VALUES ('Forn solto T3-8')");
    const rf = await request(app).delete(`/api/compras/fornecedores/${fornSolto.lastID}`);
    assert.strictEqual(rf.status, 200, `DELETE de fornecedor pelo generico: ${rf.status} ${JSON.stringify(rf.body)}`);
    assert.strictEqual(rf.body.message, 'Item excluído com sucesso', 'a literal do generico mudou de dono');
    const cot = await dbRun(db,
      "INSERT INTO cotacoes (numero, fornecedor_id, status) VALUES ('COT-T3-1', ?, 'em_analise')", [fornecedorId]);
    const r = await request(app).delete(`/api/compras/cotacoes/${cot.lastID}`);
    assert.strictEqual(r.status, 200, `DELETE de cotacao pela rota propria: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.message, 'Cotação excluída com sucesso', 'desde a Etapa 41 a cotacao sai pela rota propria, nao pelo generico');
    assert.strictEqual(await dbGet(db, 'SELECT id FROM cotacoes WHERE id = ?', [cot.lastID]), undefined,
      'a cotacao tinha de ter sumido');

    // E A CARACTERIZACAO DA TASK 1, INTACTA: o generico `/:tipo/:id` esta registrado ANTES de
    // `DELETE /api/compras/grupos/:id` e o sombreia; `tables['grupos']` nao existe no mapa dele,
    // entao apagar um grupo responde 400 e o grupo segue ativo. NAO E O DESEJADO — e o que existe,
    // e consertar e etapa propria (muda o comportamento de outra aba). Esta assercao esta aqui
    // para acusar quem "organizar as rotas por recurso" ao inserir as tres rotas de pedido.
    const grupo = await dbRun(db, "INSERT INTO grupos_compras (nome, numero) VALUES ('Grupo T3', 43)");
    const g = await request(app).delete(`/api/compras/grupos/${grupo.lastID}`);
    assert.strictEqual(g.status, 400, `grupo continua caindo no generico: ${g.status} ${JSON.stringify(g.body)}`);
    assert.strictEqual(g.body.error, 'Tipo inválido', 'a caracterizacao da Task 1 mudou');
    const ativo = await dbGet(db, 'SELECT ativo FROM grupos_compras WHERE id = ?', [grupo.lastID]);
    assert.strictEqual(ativo.ativo, 1, 'o soft-delete de grupo NAO roda hoje (o generico vence)');
  });

  // (9) ------------------------------------------------------------------------------------
  await test('(9) o PUT usa o MESMO vocabulario de 7 status do POST — PARCIAL e RECEBIDO recusados', async () => {
    const pedido = await novoPedido([{ material_id: materialIdA, quantidade: 5, valor_unitario: 2 }]);

    // `PARCIAL` e `RECEBIDO` (maiusculos) sao a DERIVACAO do almoxarifado
    // (`situacaoRecebimentoPedido`, decisao 4 da Etapa 37), calculada de `quantidade_recebida`.
    // Grava-los nesta coluna faria o core AFIRMAR um fato que so as linhas podem dizer.
    for (const ruim of ['PARCIAL', 'RECEBIDO', 'meio_recebido']) {
      const r = await request(app).put(`/api/compras/pedidos/${pedido.id}`)
        .send(payload([{ material_id: materialIdA, quantidade: 5, valor_unitario: 2 }], { status: ruim }));
      assert.strictEqual(r.status, 400, `status ${ruim}: esperava 400, veio ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, ERRO_STATUS, `status ${ruim}: literal divergente`);
    }
    // A recusa do Zod acontece ANTES do handler: nem o status nem as linhas mudaram.
    assert.strictEqual((await cabecalho(pedido.id)).status, 'pendente', 'o status invalido foi gravado');
    assert.strictEqual(await contarItens(pedido.id), 1, 'o PUT recusado pelo Zod substituiu as linhas');

    // METADE POSITIVA: a transicao valida grava (senao "recusa todo status" passaria).
    for (const bom of ['pendente', 'aprovado', 'rejeitado', 'em_analise', 'enviado', 'recebido', 'cancelado']) {
      const r = await request(app).put(`/api/compras/pedidos/${pedido.id}`)
        .send(payload([{ material_id: materialIdA, quantidade: 5, valor_unitario: 2 }], { status: bom }));
      assert.strictEqual(r.status, 200, `status ${bom}: esperava 200, veio ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual((await cabecalho(pedido.id)).status, bom, `status ${bom} nao foi gravado`);
    }
  });

  // (10) -----------------------------------------------------------------------------------
  await test('(10) 401 sem usuario nas tres portas — o unico gate exercitavel no harness', async () => {
    const pedido = await novoPedido([{ material_id: materialIdA, quantidade: 1, valor_unitario: 1 }]);

    setUser(null);
    assert.strictEqual((await request(app).get(`/api/compras/pedidos/${pedido.id}`)).status, 401, 'GET sem usuario');
    assert.strictEqual((await request(app).put(`/api/compras/pedidos/${pedido.id}`)
      .send(payload([{ material_id: materialIdA, quantidade: 2, valor_unitario: 1 }]))).status, 401, 'PUT sem usuario');
    assert.strictEqual((await request(app).delete(`/api/compras/pedidos/${pedido.id}`)).status, 401, 'DELETE sem usuario');
    // O 401 e ANTES de tudo: o pedido continua intacto.
    assert.ok(await cabecalho(pedido.id), 'o 401 apagou o pedido');
    assert.strictEqual((await dbGet(db, 'SELECT quantidade FROM itens_pedido_compra WHERE pedido_id = ?', [pedido.id])).quantidade, 1,
      'o 401 editou o pedido');

    // METADE POSITIVA: com usuario (sem perfil de almoxarifado nenhum — o core tem UMA camada) as
    // tres passam. Sem ela, "401 sempre" passaria neste cenario.
    setUser(COMPRADOR);
    assert.strictEqual((await request(app).get(`/api/compras/pedidos/${pedido.id}`)).status, 200, 'GET com usuario');
    assert.strictEqual((await request(app).put(`/api/compras/pedidos/${pedido.id}`)
      .send(payload([{ material_id: materialIdA, quantidade: 2, valor_unitario: 1 }]))).status, 200, 'PUT com usuario');
    assert.strictEqual((await request(app).delete(`/api/compras/pedidos/${pedido.id}`)).status, 200, 'DELETE com usuario');
    setUser(ADMIN);
  });

  // (11) -----------------------------------------------------------------------------------
  //
  // ONDA DE CORRECAO, F2 — achado I1 da revisao final, reproduzido por sonda executada:
  //   POST /api/compras/pedidos {…, solicitacao_id: 1}  -> 201, solicitacao VINCULADO/pedido 1
  //   DELETE /api/compras/pedidos/1                     -> 200 "excluido com sucesso"
  //   solicitacao 1: status VINCULADO, pedido_compra_id 1  <- PENDURADA no vazio
  // O dano nao e a coluna: `ReposicaoAlmoxarifado.js:849` so oferece "Gerar pedido" em
  // `PENDENTE`, e `:839` pinta o badge VERDE para `VINCULADO` — a tela AFIRMAVA que a solicitacao
  // tinha pedido, ela nao tinha mais, e nao havia como gerar outro. A unica saida era o almoxarife
  // CANCELAR e esperar a reposicao regerar, e nada na tela dizia isso.
  //
  // Esta etapa e a PRIMEIRA consumidora de `vincularPedidoCompra` pela porta do Compras (T6),
  // entao esta terceira ponta foi criada por ela — nao e divida antiga.
  await test('(11) DELETE de pedido vinculado LIBERA a solicitacao da reposicao (rota e servico)', async () => {
    const mat = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES ('MAT-T3-SOL','Chapa da reposicao T3','UN',0,1)`);
    const sol = await dbRun(db, `INSERT INTO solicitacoes_compra_almoxarifado
      (material_id, quantidade, motivo, status) VALUES (?,?,'ESTOQUE_MINIMO','PENDENTE')`, [mat.lastID, 12]);
    const leSolicitacao = () => dbGet(db,
      'SELECT status, pedido_compra_id FROM solicitacoes_compra_almoxarifado WHERE id = ?', [sol.lastID]);

    // `ADMIN` e `role: 'admin'` -> perfil ADMINISTRADOR, que tem `gerenciar_reposicao` (o gate
    // condicional do vinculo, fix 1 da Task 2). Sem isso o POST responderia 403 e o cenario
    // mediria o gate, nao a liberacao.
    const pedido = await novoPedido([{ material_id: mat.lastID, quantidade: 12, valor_unitario: 3 }],
      { solicitacao_id: sol.lastID });

    // ⚠️ A METADE POSITIVA VEM PRIMEIRO, e ela e a fixture do achado: sem este par de asserçoes,
    // "voltou para PENDENTE" passaria numa solicitacao que nunca foi vinculada.
    const antes = await leSolicitacao();
    assert.strictEqual(antes.status, 'VINCULADO', `fixture: a solicitacao ficou ${antes.status}`);
    assert.strictEqual(antes.pedido_compra_id, pedido.id, 'fixture: o vinculo tem de apontar para o pedido criado');

    const r = await request(app).delete(`/api/compras/pedidos/${pedido.id}`);
    assert.strictEqual(r.status, 200, `esperava 200, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.message, EXCLUIDO, 'literal do 200 divergente');
    // A resposta CONTA quantas voltaram para a fila: apagar um pedido muda o estado de outro
    // modulo, e quem clicou na lixeira precisa saber.
    assert.strictEqual(r.body.solicitacoes_liberadas, 1,
      `esperava solicitacoes_liberadas 1, veio ${JSON.stringify(r.body.solicitacoes_liberadas)}`);

    // ⚠️ AS DUAS ASSERCOES QUE MEDEM O DANO.
    const depois = await leSolicitacao();
    assert.strictEqual(depois.status, 'PENDENTE',
      `a solicitacao tinha de voltar para PENDENTE (ficou ${depois.status}) — em VINCULADO ela nunca `
      + 'mais vira pedido: a Reposicao so oferece "Gerar pedido" em PENDENTE');
    assert.strictEqual(depois.pedido_compra_id, null,
      'o ponteiro tinha de ser limpo: ele aponta para um pedido que nao existe mais');
    assert.strictEqual(await cabecalho(pedido.id), undefined, 'o pedido tinha de ter sido apagado');

    // PELO SERVICO, sem HTTP: a perna mora nele, e a importacao/Reposicao o chamam direto.
    const sol2 = await dbRun(db, `INSERT INTO solicitacoes_compra_almoxarifado
      (material_id, quantidade, motivo, status) VALUES (?,?,'ESTOQUE_MINIMO','PENDENTE')`, [mat.lastID, 7]);
    const pedido2 = await pedidoCompraService.criarPedido(db, {
      fornecedor_id: fornecedorId,
      itens: [{ material_id: mat.lastID, quantidade: 7, valor_unitario: 1 }],
      solicitacao_id: sol2.lastID,
    }, ADMIN);
    assert.strictEqual((await dbGet(db, 'SELECT status FROM solicitacoes_compra_almoxarifado WHERE id = ?',
      [sol2.lastID])).status, 'VINCULADO', 'fixture do servico: o vinculo tem de ter acontecido');
    const resultado = await pedidoCompraService.excluirPedido(db, pedido2.id);
    assert.strictEqual(resultado.solicitacoes_liberadas, 1,
      `pelo servico tambem: esperava 1, veio ${resultado.solicitacoes_liberadas}`);
    const depois2 = await dbGet(db,
      'SELECT status, pedido_compra_id FROM solicitacoes_compra_almoxarifado WHERE id = ?', [sol2.lastID]);
    assert.strictEqual(depois2.status, 'PENDENTE', `pelo servico a solicitacao ficou ${depois2.status}`);
    assert.strictEqual(depois2.pedido_compra_id, null, 'pelo servico o ponteiro nao foi limpo');

    // METADE NEGATIVA: estado TERMINAL nao ressuscita. Uma solicitacao CANCELADA que aponte para o
    // pedido apagado continua CANCELADA — senao a reposicao ofereceria de novo um pedido que o
    // almoxarife cancelou a mao.
    const sol3 = await dbRun(db, `INSERT INTO solicitacoes_compra_almoxarifado
      (material_id, quantidade, motivo, status) VALUES (?,?,'ESTOQUE_MINIMO','PENDENTE')`, [mat.lastID, 4]);
    const pedido3 = await novoPedido([{ material_id: mat.lastID, quantidade: 4, valor_unitario: 1 }],
      { solicitacao_id: sol3.lastID });
    await dbRun(db, "UPDATE solicitacoes_compra_almoxarifado SET status = 'CANCELADA' WHERE id = ?", [sol3.lastID]);
    const r3 = await request(app).delete(`/api/compras/pedidos/${pedido3.id}`);
    assert.strictEqual(r3.status, 200, `esperava 200, veio ${r3.status}`);
    assert.strictEqual(r3.body.solicitacoes_liberadas, 0, 'a CANCELADA nao conta como liberada');
    const depois3 = await dbGet(db,
      'SELECT status, pedido_compra_id FROM solicitacoes_compra_almoxarifado WHERE id = ?', [sol3.lastID]);
    assert.strictEqual(depois3.status, 'CANCELADA', `a solicitacao terminal virou ${depois3.status}`);
    assert.strictEqual(depois3.pedido_compra_id, pedido3.id,
      'o ponteiro da terminal e HISTORICO: fica como estava (declarado no servico)');
  });

  // (12) -----------------------------------------------------------------------------------
  //
  // ONDA DE CORRECAO, F5 — achado I2 da revisao de UX, reproduzido por sonda contra o esquema de
  // PRODUCAO (`PRAGMA foreign_keys = ON`): `DELETE FROM fornecedores` com pedido vinculado morria
  // com `SQLITE_CONSTRAINT: FOREIGN KEY constraint failed`, caia no `catch` do generico e respondia
  // **500 'Erro ao excluir item'**. O comprador lia a frase generica e nunca ficava sabendo que
  // existe pedido vinculado — e foi ESTA etapa que tornou o caminho alcancavel (antes dela
  // `COUNT(pedidos_compra) = 0` e nenhum codigo inseria pedido, entao nenhuma linha referenciava
  // `fornecedores`).
  //
  // ⚠️ O QUE ESTE CENARIO PODE E NAO PODE PROVAR: o harness roda `foreign_keys = 0` e o stub de
  // `pedidos_compra` nem declara a FK, entao aqui o `DELETE` sem a guarda NAO daria 500 — daria
  // 200, apagando o fornecedor e deixando o pedido apontando para o vazio. Sao dois sintomas do
  // mesmo defeito (500 em producao, referencia quebrada no harness) e o conserto e um: o 409 vem
  // ANTES do `DELETE`, e por isso a MESMA frase chega ao operador nos dois ambientes.
  await test('(12) DELETE de fornecedor COM pedido -> 409 com literal propria (nao 500 generico)', async () => {
    const fornF5 = await dbRun(db,
      "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Fornecedor com pedido F5','33444555000166','ativo')");
    const fornecedorF5 = fornF5.lastID;
    const criado = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: fornecedorF5,
      itens: [{ material_id: materialIdA, quantidade: 2, valor_unitario: 3 }],
    });
    assert.strictEqual(criado.status, 201, `fixture: POST do pedido falhou ${JSON.stringify(criado.body)}`);

    const r = await request(app).delete(`/api/compras/fornecedores/${fornecedorF5}`);
    assert.strictEqual(r.status, 409, `esperava 409, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, FORNECEDOR_COM_PEDIDOS, 'literal do 409 divergente');
    assert.notStrictEqual(r.body.error, 'Erro ao excluir item',
      'a frase generica do 500 e exatamente o que este conserto tira do caminho do comprador');
    // ⚠️ AS ASSERCOES QUE MEDEM O DANO: o fornecedor FICA, e o pedido continua com um
    // `fornecedor_id` que resolve (no harness, sem FK, o `DELETE` cru teria apagado o fornecedor e
    // deixado o pedido orfao; em producao teria dado 500).
    assert.ok(await dbGet(db, 'SELECT id FROM fornecedores WHERE id = ?', [fornecedorF5]),
      'o fornecedor com pedido NAO pode ter sido apagado');
    const cab = await cabecalho(criado.body.id);
    assert.strictEqual(cab.fornecedor_id, fornecedorF5, 'o pedido continua apontando para o fornecedor');
    assert.ok(await dbGet(db, 'SELECT id FROM fornecedores WHERE id = ?', [cab.fornecedor_id]),
      'o fornecedor apontado pelo pedido tem de existir');

    // METADE POSITIVA 1: fornecedor SEM pedido continua apagavel pelo generico (senao "recusa todo
    // fornecedor" passaria nas asserçoes acima).
    const fornLimpo = await dbRun(db,
      "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Fornecedor sem pedido F5','33444555000267','ativo')");
    const semPedido = await request(app).delete(`/api/compras/fornecedores/${fornLimpo.lastID}`);
    assert.strictEqual(semPedido.status, 200, `fornecedor sem pedido: ${semPedido.status} ${JSON.stringify(semPedido.body)}`);
    assert.strictEqual(semPedido.body.message, 'Item excluído com sucesso', 'a literal do generico mudou de dono');
    assert.strictEqual(await dbGet(db, 'SELECT id FROM fornecedores WHERE id = ?', [fornLimpo.lastID]), undefined,
      'o fornecedor sem pedido tinha de ter sido apagado');

    // METADE POSITIVA 2: apagado o pedido, o MESMO fornecedor passa a ser apagavel — a recusa e
    // sobre a referencia, nao sobre o fornecedor.
    assert.strictEqual((await request(app).delete(`/api/compras/pedidos/${criado.body.id}`)).status, 200,
      'fixture: o DELETE do pedido tinha de passar');
    const depois = await request(app).delete(`/api/compras/fornecedores/${fornecedorF5}`);
    assert.strictEqual(depois.status, 200, `sem pedidos o fornecedor tem de sair: ${JSON.stringify(depois.body)}`);
    assert.strictEqual(await dbGet(db, 'SELECT id FROM fornecedores WHERE id = ?', [fornecedorF5]), undefined,
      'o fornecedor tinha de ter sido apagado depois que o pedido saiu');

    // E o 404 do generico continua sendo 404 (id que nao existe), nao 409.
    const inexistente = await request(app).delete(`/api/compras/fornecedores/${fornecedorF5 + 9876}`);
    assert.strictEqual(inexistente.status, 404, `esperava 404, veio ${inexistente.status}`);
    assert.strictEqual(inexistente.body.error, 'Item não encontrado', 'literal do 404 do generico divergente');
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
