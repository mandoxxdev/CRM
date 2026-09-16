/**
 * RN-11 (Etapa 36) — `tipo_recebimento` validado nas DUAS portas de escrita.
 *
 * Antes desta etapa, medido por sonda executada na Fase 0:
 *   POST /recebimentos  com tipo_recebimento 'BANANA<script>'  -> 201, gravado cru
 *   PUT  /:id/fiscal    com tipo_recebimento 'QUALQUER_COISA'  -> 200, gravado
 * A coluna e WRITE-ONLY no servidor (ninguem a le depois — `avancarWorkflow`, `gerarContaPagar`,
 * `reportService` e `alertRegistry` nao a olham), e o unico ramo de comportamento e
 * `receiptService.js:108`: valor invalido se comporta como NOTA_FISCAL, em silencio.
 *
 * O cenario (3) e o que importa, e nao os negativos: `validate()` substitui `req.body` por
 * `parsed.data`, e `z.object` DESCARTA chave nao declarada. Com um `z.object` ingenuo aqui, TODO
 * POST valido passa a responder 400 "Inclua ao menos um item". Por isso os dois schemas sao
 * `z.looseObject` — e por isso este arquivo afirma QUATRO colunas gravadas com o valor enviado.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 64, nome: 'Admin Etapa 36', role: 'admin' };
const SEM_PERFIL = { id: 65, nome: 'Chao de Fabrica', role: 'usuario' };   // cai em PRODUCAO
const LITERAL = 'Dados inválidos — tipo_recebimento: '
  + 'forma de recebimento inválida (use NOTA_FISCAL ou PEDIDO_COMPRA)';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  const material = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, ativo) VALUES ('E36-01','Chapa E36','UN',0,1)`);

  await test('(1) POST com tipo_recebimento fora do enum responde 400 com a literal em portugues', async () => {
    const res = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'BANANA<script>',
      nota_fiscal: 'NF-E36-1',
      itens: [{ material_id: material.lastID, quantidade: 5 }],
    });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, LITERAL);
    // E nao gravou nada: a recusa e ANTES do servico.
    const qtd = await dbGet(db, 'SELECT COUNT(*) AS n FROM recebimentos_material_almoxarifado');
    assert.strictEqual(qtd.n, 0, 'o POST recusado nao pode ter criado documento');
  });

  await test('(2) a SEGUNDA porta: PUT /:id/fiscal recusa o enum e NAO altera a coluna', async () => {
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: 'NF-E36-2',
      itens: [{ material_id: material.lastID, quantidade: 5 }],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const id = criado.body.id;

    // (Fase 2) OBRIGATORIO: `salvarDadosFiscal` recusa status RECEBIDO antes de tudo
    // (`receiptService.js:253-259`). Sem este avanco, o 400 vem do guard de status
    // ("Dados fiscais so podem ser editados antes do processamento") e o cenario nao mede o enum.
    const wf = await request(app).post(`/api/almoxarifado/recebimentos/${id}/workflow`)
      .send({ acao: 'iniciar_conferencia' });
    assert.strictEqual(wf.status, 200, JSON.stringify(wf.body));

    const res = await request(app).put(`/api/almoxarifado/recebimentos/${id}/fiscal`)
      .send({ tipo_recebimento: 'QUALQUER_COISA', nota_serie: '9' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, LITERAL);

    const rec = await dbGet(db,
      'SELECT tipo_recebimento, nota_serie FROM recebimentos_material_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(rec.tipo_recebimento, 'NOTA_FISCAL', 'a coluna tinha de continuar intacta');
    assert.strictEqual(rec.nota_serie, null, 'a recusa e do PUT INTEIRO, nao so do campo invalido');
  });

  await test('(3) CONTROLE DO STRIP: POST valido grava as QUATRO colunas que nao estao no schema', async () => {
    const res = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL',
      nota_fiscal: 'NF-E36-3',
      observacoes: 'Caixa amassada no canto',
      fornecedor_cnpj: '33.333.333/0001-33',
      itens: [{ material_id: material.lastID, quantidade: 5, lote: 'L-E36' }],
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const rec = await dbGet(db, `SELECT tipo_recebimento, nota_fiscal, observacoes, fornecedor_cnpj
      FROM recebimentos_material_almoxarifado WHERE id = ?`, [res.body.id]);
    assert.strictEqual(rec.tipo_recebimento, 'NOTA_FISCAL');
    assert.strictEqual(rec.nota_fiscal, 'NF-E36-3');
    assert.strictEqual(rec.observacoes, 'Caixa amassada no canto');
    assert.strictEqual(rec.fornecedor_cnpj, '33.333.333/0001-33');
    const item = await dbGet(db, `SELECT lote FROM recebimentos_material_itens_almoxarifado
      WHERE recebimento_id = ?`, [res.body.id]);
    assert.strictEqual(item.lote, 'L-E36', 'o `itens` sobreviveu ao parse (looseObject, nao object)');
  });

  await test('(4) sem tipo no body, o default DERIVADO continua vivo', async () => {
    // (Fase 2) MEDIDO: `pedidos_compra` NAO existe no harness — nem `initSchema` nem
    // `testApp.js` a criam (so `itens_pedido_compra`, com FK para ela). Sonda executada:
    // `INSERT INTO pedidos_compra ...` -> "SQLITE_ERROR: no such table: pedidos_compra".
    // Cinco arquivos de tests/api/ a criam no proprio arquivo (molde:
    // `solicitacaoCicloVida.api.test.js:103`); DDL de producao em `server/index.js:19230-19242`,
    // onde `fornecedor_id` e NOT NULL. Sem este CREATE o cenario (4) nasce VERMELHO pelo motivo
    // errado e continua vermelho depois do conserto.
    await dbRun(db, `CREATE TABLE IF NOT EXISTS pedidos_compra (
      id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT UNIQUE, fornecedor_id INTEGER NOT NULL,
      valor_total REAL DEFAULT 0, data_pedido DATE, previsao_entrega DATE,
      status TEXT DEFAULT 'pendente', observacoes TEXT
    )`);
    const forn = await dbRun(db,
      `INSERT INTO fornecedores (razao_social, cnpj) VALUES ('Forn E36','44.444.444/0001-44')`);
    const pedido = await dbRun(db,
      `INSERT INTO pedidos_compra (numero, fornecedor_id, status) VALUES ('PC-E36', ?, 'ABERTO')`,
      [forn.lastID]);
    const res = await request(app).post('/api/almoxarifado/recebimentos').send({
      pedido_compra_id: pedido.lastID,
      itens: [{ material_id: material.lastID, quantidade: 3 }],
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const rec = await dbGet(db,
      'SELECT tipo_recebimento FROM recebimentos_material_almoxarifado WHERE id = ?', [res.body.id]);
    assert.strictEqual(rec.tipo_recebimento, 'PEDIDO_COMPRA');
  });

  await test('(5) 403 vem ANTES do 400: usuario sem perfil nem chega na validacao', async () => {
    setUser(SEM_PERFIL);
    const res = await request(app).post('/api/almoxarifado/recebimentos')
      .send({ tipo_recebimento: 'BANANA', itens: [] });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.strictEqual(res.body.acao, 'receber_material');
    assert.strictEqual(res.body.perfil, 'PRODUCAO');
    setUser(ADMIN);
  });

  // (Fase 2) CENARIO NOVO — a metade POSITIVA da SEGUNDA porta, que faltava.
  // Sem ele, um `z.object` aplicado SO ao RecebimentoFiscalSchema nao derruba nada neste arquivo:
  // o (3) cobre o strip do POST, e nenhum cenario cobria o strip do PUT. A sabotagem 1 da tabela
  // troca os DOIS schemas, mas a regua tem de existir para cada porta separadamente.
  await test('(6) CONTROLE DO STRIP NA SEGUNDA PORTA: PUT /fiscal valido grava os campos que nao estao no schema', async () => {
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: 'NF-E36-6',
      itens: [{ material_id: material.lastID, quantidade: 4 }],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const id = criado.body.id;
    const wf = await request(app).post(`/api/almoxarifado/recebimentos/${id}/workflow`)
      .send({ acao: 'iniciar_conferencia' });
    assert.strictEqual(wf.status, 200, JSON.stringify(wf.body));

    const res = await request(app).put(`/api/almoxarifado/recebimentos/${id}/fiscal`).send({
      tipo_recebimento: 'PEDIDO_COMPRA',
      nota_serie: '7', cfop_nota: '1102', valor_total_nota: 123.45,
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const rec = await dbGet(db, `SELECT tipo_recebimento, nota_serie, cfop_nota, valor_total_nota
      FROM recebimentos_material_almoxarifado WHERE id = ?`, [id]);
    assert.strictEqual(rec.tipo_recebimento, 'PEDIDO_COMPRA');
    assert.strictEqual(rec.nota_serie, '7', 'o PUT sobreviveu ao parse (looseObject, nao object)');
    assert.strictEqual(rec.cfop_nota, '1102');
    assert.strictEqual(rec.valor_total_nota, 123.45);
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
