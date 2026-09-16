/**
 * RN-C02 a RN-C05 e RN-C13 (Etapa 38, Task 2) — `POST /api/compras/pedidos`: a porta que CRIA o
 * pedido de compra com os itens.
 *
 * O ACHADO QUE ESTE ARQUIVO EXISTE PARA PAGAR, medido na Fase 0: `COUNT(pedidos_compra) = 0` no
 * banco de producao de 161 MB, e **nao existe codigo de aplicacao que insira um pedido**. Havia
 * `app.get('/api/compras/pedidos')` e mais nada: nenhum `app.post`, nenhum `app.put`. O unico
 * escritor de producao de `itens_pedido_compra` e o acumulador da Etapa 37
 * (`receiptService.js:1246`), que so sabe SUBTRAIR de uma linha que ninguem cria. Consequencia: a
 * Etapa 37 inteira — sete arquivos de teste, duas colunas de migration, tres portas com regua de
 * saldo — era **inalcancavel por um clique em qualquer ambiente**, porque o roteiro dela comeca
 * com "criar pedido no modulo Compras".
 *
 * ⚠️ O MODO DE FALHA DESTA ETAPA E O `201` QUE NAO GRAVOU ITEM NENHUM. Dois `INSERT` em SQLite sem
 * transacao: o primeiro passa, o segundo falha num callback que ninguem le, e o `res.status(201)`
 * ja saiu. **Nenhuma assercao sobre o codigo de status pega isso.** Por isso todo cenario daqui le
 * `SELECT * FROM itens_pedido_compra WHERE pedido_id = <o id devolvido>` e **conta linhas** — e a
 * sabotagem obrigatoria da task e remover o laco de `INSERT` dos itens.
 *
 * ⚠️ GATE: o modulo core Compras tem **UMA** camada de autorizacao, nao duas — `authenticateToken`
 * + `checkModulePermission('compras')`, nenhum `requirePermission`, nenhum `ACAO_PERFIS` (medido
 * nas 26 rotas). O harness libera a camada 2 (`fakeCheckModulePermission` = `next()`), entao o
 * **unico gate exercitavel aqui e o 401 sem usuario** (cenario 8). Um cenario de 403 de perfil
 * mediria uma camada que este modulo nao tem.
 *
 * ⚠️ E O QUE A ETAPA 37 LE DESTAS LINHAS, para ninguem "simplificar" o INSERT: `material_id` e o
 * filtro `IS NOT NULL` de `listarPedidosCompraAux` (item sem material e INVISIVEL ao recebimento),
 * `quantidade` vira o saldo, `valor_unitario` vira o PRECO do recebimento (U1 da 37) e por ele o
 * custo medio, `codigo`/`descricao` aparecem na linha da tela. O cenario (10) fecha a composicao:
 * o pedido criado por esta porta aparece em `?pendentes=1` da 37 com o saldo certo.
 *
 * Executar: cd server && node tests/api/comprasPedidoCriar.api.test.js
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

// (iii) das regras herdadas: nenhum id de fixture escrito a mao — todos lidos do `INSERT`.
// Usuarios na mesma numeracao de `recebimentoExcedente.api.test.js` (64/65/66).
const ADMIN = { id: 64, nome: 'Admin Compras E38', role: 'admin' };
const COMPRADOR = { id: 66, nome: 'Comprador E38', role: 'user' };

// As literais do contrato 2 do plano, VERBATIM. Estao aqui em constante para que o `grep` de uma
// frase ache o dono e o teste na mesma varredura.
const ERRO_FORNECEDOR = 'Dados inválidos — fornecedor_id: fornecedor do pedido é obrigatório';
const ERRO_ITENS = 'Dados inválidos — itens: inclua ao menos um item no pedido de compra';
const ERRO_MATERIAL_ITEM = 'Dados inválidos — itens.0.material_id: material do item é obrigatório';
const ERRO_QTD = 'Dados inválidos — itens.0.quantidade: quantidade do item do pedido deve ser um número maior que zero';
const ERRO_VALOR = 'Dados inválidos — itens.0.valor_unitario: valor unitário do item não pode ser negativo';
const ERRO_STATUS = 'Dados inválidos — status: status do pedido inválido (use pendente, aprovado, rejeitado, em_analise, enviado, recebido ou cancelado)';

const contarPedidos = async (db) => (await dbGet(db, 'SELECT COUNT(*) as n FROM pedidos_compra')).n;

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  // ---- Fixtures: ids SEMPRE lidos do INSERT (regra (iii) e modo de falha 3: `COUNT` de 0 contra
  // 0 passa dos dois lados se as fixtures nao existirem de verdade).
  const forn = await dbRun(db,
    "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Fornecedor Pedido E38','11222333000144','ativo')");
  const fornecedorId = forn.lastID;

  const matA = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, ativo) VALUES ('MAT-E38-A','Parafuso sextavado E38','PC',1)`);
  const materialIdA = matA.lastID;
  const matB = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, ativo) VALUES ('MAT-E38-B','Arruela lisa E38','CX',1)`);
  const materialIdB = matB.lastID;

  const payloadValido = (extra = {}) => ({
    fornecedor_id: fornecedorId,
    itens: [
      { material_id: materialIdA, quantidade: 2, valor_unitario: 50 },
      { material_id: materialIdB, quantidade: 3, valor_unitario: 10 },
    ],
    ...extra,
  });

  // (1) ------------------------------------------------------------------------------------
  await test('(1) POST com fornecedor e DOIS itens cria cabecalho E as duas linhas', async () => {
    const r = await request(app).post('/api/compras/pedidos').send(payloadValido({
      data_pedido: '2026-09-16', previsao_entrega: '2026-10-01', observacoes: 'Entregar na portaria E38',
    }));
    assert.strictEqual(r.status, 201, `esperava 201, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.ok(r.body.id, 'resposta sem id do pedido');
    assert.match(r.body.numero || '', /^PC-[0-9A-Z]+$/, `numero fora do formato: ${r.body.numero}`);

    // O QUE MEDE O DANO: o 201 nao prova nada; a contagem de linhas prova.
    const linhas = await dbAll(db, 'SELECT * FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id', [r.body.id]);
    assert.strictEqual(linhas.length, 2, `esperava 2 linhas de item, vieram ${linhas.length}`);
    assert.strictEqual(linhas[0].material_id, materialIdA, 'material_id da primeira linha errado');
    assert.strictEqual(linhas[0].quantidade, 2, 'quantidade da primeira linha errada');
    assert.strictEqual(linhas[0].valor_unitario, 50, 'valor_unitario da primeira linha errado');
    // codigo/descricao/unidade sao COPIADOS do material, nao inventados nem vindos do payload.
    assert.strictEqual(linhas[0].codigo, 'MAT-E38-A', 'codigo nao foi copiado do material');
    assert.strictEqual(linhas[0].descricao, 'Parafuso sextavado E38',
      'descricao tem de vir de materiais_almoxarifado.nome (o NOT NULL), nao da coluna descricao');
    assert.strictEqual(linhas[0].unidade, 'PC', 'unidade nao foi copiada do material');
    assert.strictEqual(linhas[1].material_id, materialIdB, 'material_id da segunda linha errado');
    // E a resposta tambem leva os itens (o client monta a tela com ela).
    assert.strictEqual((r.body.itens || []).length, 2, 'a resposta nao trouxe os dois itens');

    // ⚠️ Os tres campos OPCIONAIS do cabecalho tem assercao propria, e nao e enfeite: eles NAO sao
    // declarados no schema (passam pelo `looseObject`), entao sao exatamente o que um `z.object`
    // descartaria em silencio. Medido pela sabotagem 2: com `z.object` o cenario continua 201 —
    // `itens` esta declarado e sobrevive —, e sem estas linhas nada acusaria a troca aqui.
    const cab = await dbGet(db, 'SELECT data_pedido, previsao_entrega, observacoes FROM pedidos_compra WHERE id = ?', [r.body.id]);
    assert.strictEqual(cab.data_pedido, '2026-09-16', `data_pedido nao foi gravada: ${cab.data_pedido}`);
    assert.strictEqual(cab.previsao_entrega, '2026-10-01', `previsao_entrega nao foi gravada: ${cab.previsao_entrega}`);
    assert.strictEqual(cab.observacoes, 'Entregar na portaria E38', `observacoes nao foi gravada: ${cab.observacoes}`);
  });

  // (2) ------------------------------------------------------------------------------------
  await test('(2) quantidade_recebida NASCE 0 pelo DEFAULT do DDL (a porta nunca a escreve)', async () => {
    const r = await request(app).post('/api/compras/pedidos').send(payloadValido());
    assert.strictEqual(r.status, 201, `esperava 201, veio ${r.status}`);
    const linhas = await dbAll(db, 'SELECT * FROM itens_pedido_compra WHERE pedido_id = ?', [r.body.id]);
    assert.strictEqual(linhas.length, 2, 'sem as duas linhas o resto deste cenario nao afirma nada');
    // `=== 0`, NAO `!= null`: e o que faz `quantidade - COALESCE(quantidade_recebida,0)` nao virar
    // NaN na primeira leitura de saldo do pedido (Etapa 37).
    assert.ok(linhas.every((l) => l.quantidade_recebida === 0),
      `quantidade_recebida deveria nascer 0: ${JSON.stringify(linhas.map((l) => l.quantidade_recebida))}`);
  });

  // (3) ------------------------------------------------------------------------------------
  await test('(3) o numero e do SERVIDOR — o payload nao escolhe, e dois POST nao colidem', async () => {
    const r = await request(app).post('/api/compras/pedidos').send(payloadValido({ numero: 'EU-ESCOLHI' }));
    assert.strictEqual(r.status, 201, `esperava 201, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.notStrictEqual(r.body.numero, 'EU-ESCOLHI', 'o numero do payload venceu o do servidor');
    assert.match(r.body.numero || '', /^PC-[0-9A-Z]+$/, `numero fora do formato: ${r.body.numero}`);
    const gravado = await dbGet(db, 'SELECT numero FROM pedidos_compra WHERE id = ?', [r.body.id]);
    assert.strictEqual(gravado.numero, r.body.numero, 'o numero devolvido nao e o gravado');

    // Metade positiva: dois POST seguidos dao numeros DIFERENTES (senao "numero fixo" passaria).
    const r2 = await request(app).post('/api/compras/pedidos').send(payloadValido());
    assert.strictEqual(r2.status, 201, `esperava 201 no segundo, veio ${r2.status}`);
    assert.notStrictEqual(r2.body.numero, r.body.numero, 'dois pedidos com o MESMO numero');
  });

  // (4) ------------------------------------------------------------------------------------
  await test('(4) validacao Zod: cada recusa com a literal do contrato e COUNT inalterado', async () => {
    // UM defeito por payload: `formatZodError` junta as issues com '; ', entao um payload com
    // dois defeitos nao casa a igualdade literal.
    const casos = [
      ['sem fornecedor_id', { ...payloadValido(), fornecedor_id: undefined }, ERRO_FORNECEDOR],
      ['itens ausente', { fornecedor_id: fornecedorId }, ERRO_ITENS],
      ['itens vazio', payloadValido({ itens: [] }), ERRO_ITENS],
      ['item sem material_id', { fornecedor_id: fornecedorId, itens: [{ quantidade: 1, valor_unitario: 1 }] }, ERRO_MATERIAL_ITEM],
      ['quantidade 0', { fornecedor_id: fornecedorId, itens: [{ material_id: materialIdA, quantidade: 0 }] }, ERRO_QTD],
      ['quantidade -3', { fornecedor_id: fornecedorId, itens: [{ material_id: materialIdA, quantidade: -3 }] }, ERRO_QTD],
      // 'abc' so sai em portugues porque a literal esta TAMBEM no construtor do tipo
      // (`z.number({ error: MSG })`): `z.number().gt(0, MSG)` devolveria o ingles do Zod.
      ['quantidade "abc"', { fornecedor_id: fornecedorId, itens: [{ material_id: materialIdA, quantidade: 'abc' }] }, ERRO_QTD],
      // STRING numerica tambem e 400: NAO ha coercao no servidor, e e por isso que o formulario
      // da T5 coage com `Number()` antes do POST — sem isso todo submit real tomaria 400.
      ['quantidade "4" (string)', { fornecedor_id: fornecedorId, itens: [{ material_id: materialIdA, quantidade: '4' }] }, ERRO_QTD],
      ['valor_unitario -1', { fornecedor_id: fornecedorId, itens: [{ material_id: materialIdA, quantidade: 1, valor_unitario: -1 }] }, ERRO_VALOR],
    ];
    const antes = await contarPedidos(db);
    for (const [nome, payload, literal] of casos) {
      const r = await request(app).post('/api/compras/pedidos').send(payload);
      assert.strictEqual(r.status, 400, `${nome}: esperava 400, veio ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, literal, `${nome}: literal divergente`);
    }
    const depois = await contarPedidos(db);
    assert.strictEqual(depois, antes, `recusa gravou pedido: ${antes} -> ${depois}`);

    // METADE POSITIVA no mesmo test(): preco opcional e DECISAO — `valor_unitario: 0` passa, e
    // omitir tambem. (Regra (iv): um schema escrito errado recusa TUDO e o bloco acima passaria.)
    const ok = await request(app).post('/api/compras/pedidos')
      .send({ fornecedor_id: fornecedorId, itens: [{ material_id: materialIdA, quantidade: 1, valor_unitario: 0 }] });
    assert.strictEqual(ok.status, 201, `valor_unitario 0 deveria ser 201, veio ${ok.status} ${JSON.stringify(ok.body)}`);
    const semPreco = await request(app).post('/api/compras/pedidos')
      .send({ fornecedor_id: fornecedorId, itens: [{ material_id: materialIdA, quantidade: 1 }] });
    assert.strictEqual(semPreco.status, 201, `valor_unitario ausente deveria ser 201, veio ${semPreco.status}`);
    const linha = await dbGet(db, 'SELECT valor_unitario FROM itens_pedido_compra WHERE pedido_id = ?', [semPreco.body.id]);
    assert.strictEqual(linha.valor_unitario, 0, 'sem preco a linha tem de nascer 0 (fragilidade declarada, letra G)');
  });

  // (5) ------------------------------------------------------------------------------------
  await test('(5) valor_total e DERIVADO da soma dos itens — o payload nao o decide', async () => {
    const r = await request(app).post('/api/compras/pedidos').send(payloadValido({ valor_total: 999 }));
    assert.strictEqual(r.status, 201, `esperava 201, veio ${r.status}`);
    const p = await dbGet(db, 'SELECT valor_total FROM pedidos_compra WHERE id = ?', [r.body.id]);
    assert.strictEqual(p.valor_total, 130, `2x50 + 3x10 = 130, veio ${p.valor_total}`);
    assert.strictEqual(r.body.valor_total, 130, `a resposta tem de levar o derivado, veio ${r.body.valor_total}`);
  });

  // (6) ------------------------------------------------------------------------------------
  await test('(6) status: enum de SETE valores, default pendente, PARCIAL recusado', async () => {
    const antes = await contarPedidos(db);
    // 'PARCIAL'/'RECEBIDO' sao a DERIVACAO do almoxarifado (decisao 4 da Etapa 37) e nao podem
    // virar valor gravado no core por esta porta.
    for (const ruim of ['PARCIAL', 'RECEBIDO', 'qualquer']) {
      const r = await request(app).post('/api/compras/pedidos').send(payloadValido({ status: ruim }));
      assert.strictEqual(r.status, 400, `status ${ruim}: esperava 400, veio ${r.status}`);
      assert.strictEqual(r.body.error, ERRO_STATUS, `status ${ruim}: literal divergente`);
    }
    assert.strictEqual(await contarPedidos(db), antes, 'status invalido gravou pedido');

    const semStatus = await request(app).post('/api/compras/pedidos').send(payloadValido());
    assert.strictEqual(semStatus.status, 201, `sem status esperava 201, veio ${semStatus.status}`);
    const p = await dbGet(db, 'SELECT status FROM pedidos_compra WHERE id = ?', [semStatus.body.id]);
    assert.strictEqual(p.status, 'pendente', `default deveria ser pendente, veio ${p.status}`);

    // Metade positiva: os SETE valores do enum passam (laco).
    for (const bom of ['pendente', 'aprovado', 'rejeitado', 'em_analise', 'enviado', 'recebido', 'cancelado']) {
      const r = await request(app).post('/api/compras/pedidos').send(payloadValido({ status: bom }));
      assert.strictEqual(r.status, 201, `status ${bom}: esperava 201, veio ${r.status} ${JSON.stringify(r.body)}`);
      const g = await dbGet(db, 'SELECT status FROM pedidos_compra WHERE id = ?', [r.body.id]);
      assert.strictEqual(g.status, bom, `status ${bom} nao foi gravado (veio ${g.status})`);
    }
  });

  // (7) ------------------------------------------------------------------------------------
  await test('(7) guardas de servico: fornecedor e material inexistentes recusam ANTES de gravar', async () => {
    const antes = await contarPedidos(db);
    const inexistente = fornecedorId + 9876;

    const r1 = await request(app).post('/api/compras/pedidos').send(payloadValido({ fornecedor_id: inexistente }));
    assert.strictEqual(r1.status, 400, `fornecedor inexistente: esperava 400, veio ${r1.status}`);
    assert.strictEqual(r1.body.error, 'Fornecedor não encontrado', 'literal do fornecedor divergente');

    const r2 = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: fornecedorId,
      itens: [{ material_id: materialIdA, quantidade: 1 }, { material_id: materialIdB + 5432, quantidade: 1 }],
    });
    assert.strictEqual(r2.status, 400, `material inexistente: esperava 400, veio ${r2.status}`);
    assert.strictEqual(r2.body.error, 'Material não encontrado', 'literal do material divergente');

    assert.strictEqual(await contarPedidos(db), antes, 'guarda de servico gravou pedido mesmo assim');
    // E nem linha de item ficou solta (o material bom do segundo payload nao pode ter entrado).
    const orfas = await dbGet(db,
      'SELECT COUNT(*) as n FROM itens_pedido_compra WHERE pedido_id NOT IN (SELECT id FROM pedidos_compra)');
    assert.strictEqual(orfas.n, 0, `sobraram ${orfas.n} linhas de item orfas`);
  });

  // (8) ------------------------------------------------------------------------------------
  await test('(8) 401 sem usuario — o unico gate exercitavel no harness', async () => {
    setUser(null);
    const r = await request(app).post('/api/compras/pedidos').send(payloadValido());
    assert.strictEqual(r.status, 401, `esperava 401 sem usuario, veio ${r.status}`);
    // Metade positiva: com usuario o MESMO payload passa (senao "401 sempre" passaria).
    setUser(COMPRADOR);
    const ok = await request(app).post('/api/compras/pedidos').send(payloadValido());
    assert.strictEqual(ok.status, 201, `com usuario esperava 201, veio ${ok.status}`);
    setUser(ADMIN);
  });

  // (9) ------------------------------------------------------------------------------------
  await test('(9) solicitacao_id (RN-C13): vincula a solicitacao, e o vinculo e NAO-FATAL', async () => {
    const sol = await dbRun(db,
      "INSERT INTO solicitacoes_compra_almoxarifado (material_id, quantidade, motivo, status) VALUES (?,?,'ESTOQUE_MINIMO','PENDENTE')",
      [materialIdA, 7]);
    const solicitacaoId = sol.lastID;

    const r = await request(app).post('/api/compras/pedidos').send(payloadValido({ solicitacao_id: solicitacaoId }));
    assert.strictEqual(r.status, 201, `esperava 201, veio ${r.status} ${JSON.stringify(r.body)}`);
    const depois = await dbGet(db,
      'SELECT status, pedido_compra_id FROM solicitacoes_compra_almoxarifado WHERE id = ?', [solicitacaoId]);
    assert.strictEqual(depois.status, 'VINCULADO', `solicitacao ficou ${depois.status}`);
    assert.strictEqual(depois.pedido_compra_id, r.body.id, 'pedido_compra_id nao aponta para o pedido criado');
    assert.strictEqual(r.body.vinculo_solicitacao, 'ok', `esperava vinculo_solicitacao 'ok', veio ${r.body.vinculo_solicitacao}`);

    // A metade NAO-FATAL (decisao 10): solicitacao inexistente NAO derruba o POST — o pedido e
    // criado, a resposta diz 'falhou' e o COUNT SOBE. Sem esta assercao "nao-fatal" seria so uma
    // frase no design.
    const antes = await contarPedidos(db);
    const r2 = await request(app).post('/api/compras/pedidos')
      .send(payloadValido({ solicitacao_id: solicitacaoId + 4321 }));
    assert.strictEqual(r2.status, 201, `vinculo falho deveria manter 201, veio ${r2.status} ${JSON.stringify(r2.body)}`);
    assert.strictEqual(r2.body.vinculo_solicitacao, 'falhou', `esperava 'falhou', veio ${r2.body.vinculo_solicitacao}`);
    assert.strictEqual(await contarPedidos(db), antes + 1, 'o pedido do vinculo falho nao foi criado');
  });

  // (10) -----------------------------------------------------------------------------------
  await test('(10) composicao com a Etapa 37: o pedido criado aparece em ?pendentes=1 com o saldo', async () => {
    const r = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: fornecedorId,
      itens: [{ material_id: materialIdA, quantidade: 10, valor_unitario: 4 }],
    });
    assert.strictEqual(r.status, 201, `esperava 201, veio ${r.status}`);

    const aux = await request(app).get('/api/almoxarifado/recebimentos-aux/pedidos-compra?pendentes=1');
    assert.strictEqual(aux.status, 200, `aux da E37 esperava 200, veio ${aux.status}`);
    const linha = (aux.body || []).find((p) => p.id === r.body.id);
    assert.ok(linha, 'o pedido criado pela porta nova NAO aparece na lista de pendentes da Etapa 37');
    assert.strictEqual(linha.quantidade_pedida, 10, `quantidade_pedida deveria ser 10, veio ${linha.quantidade_pedida}`);
    assert.strictEqual(linha.quantidade_recebida, 0, `quantidade_recebida deveria ser 0, veio ${linha.quantidade_recebida}`);
    assert.strictEqual(linha.saldo_pendente, 10, `saldo_pendente deveria ser 10, veio ${linha.saldo_pendente}`);
    assert.strictEqual(linha.situacao_recebimento, 'ABERTO', `situacao deveria ser ABERTO, veio ${linha.situacao_recebimento}`);
    assert.strictEqual(linha.fornecedor_nome, 'Fornecedor Pedido E38', 'fornecedor_nome nao resolveu');

    // E as LINHAS do pedido, que a tela de recebimento carrega: o `material_id` resolvido e o que
    // torna a linha VISIVEL (o recorte `material_id IS NOT NULL` das duas leituras da 37).
    const itens = await request(app).get(`/api/almoxarifado/recebimentos-aux/pedidos-compra/${r.body.id}/itens`);
    assert.strictEqual(itens.status, 200, `itens aux esperava 200, veio ${itens.status}`);
    assert.strictEqual(itens.body.length, 1, `esperava 1 linha com saldo, vieram ${itens.body.length}`);
    assert.strictEqual(itens.body[0].saldo_pendente, 10, 'saldo da linha errado');
    assert.strictEqual(itens.body[0].valor_unitario, 4, 'o preco da linha (U1 da E37) nao chegou ao recebimento');
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
