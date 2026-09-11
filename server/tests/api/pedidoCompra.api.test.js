/**
 * Etapa 32 — Pedido de compra, PELA ROTA.
 * Executar: cd server && node tests/api/pedidoCompra.api.test.js
 *
 * Por que pela rota e não pelo serviço: esta etapa é fiação. Ordem de registro (o DELETE
 * genérico `/api/compras/:tipo/:id` engoliria o nosso), colisão de nome entre o snapshot e
 * os aliases do JOIN, e o filtro `.filter(i => i.material_id)` do recebimento são defeitos
 * que NENHUM teste de unidade pega — os três passariam verdes com a feature morta.
 *
 * Cobre RN-01, RN-02, RN-06, RN-07, RN-08, RN-09, RN-10 e RN-11.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const COMPRAS = { id: 5, nome: 'Comprador', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'compras@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };

let seq = 0;
async function novoMaterial(db) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, quantidade_minima, quantidade_maxima,
       ponto_reposicao, lote_economico, prazo_reposicao_dias, controle_lote)
     VALUES (?,?,?,0,1,0,0,0,0,0,0)`, [`PC-E32-${seq}`, `Material E32 ${seq}`, 'PC']);
  return r.lastID;
}

/** Corpo de pedido válido, com os números REAIS do pedido TECNOPAR 28433. */
function corpoPedido(materialId, over = {}) {
  seq += 1;
  return {
    numero: `28433-${seq}`,
    fornecedor_id: 1,
    data_pedido: '2025-12-16',
    previsao_entrega: '2025-12-18',
    condicao_pagamento: '28 D.D.L.',
    frete_modalidade: '2-Contratação do Frete por conta de Terceiros',
    via_transporte: 'Rodoviário',
    observacoes: 'OS 1714 TQVS-4_INOX 304',
    local_entrega: 'AVENIDA ANGELO DEMARCHI, 130 - SAO BERNARDO DO CAMPO - SP',
    itens: [
      { material_id: materialId, codigo: 'MP-936', descricao: 'PARAFUSO SEXTAVADO M10 X 35 INOX 304',
        ncm: '73181500', quantidade: 13, unidade: 'PC', valor_unitario: 2.191, ipi_percentual: 6.5,
        data_entrega: '2025-12-18' },
      { material_id: materialId, codigo: 'MP-952', descricao: 'PARAFUSO ALLEN C/C M20 X 150 INOX 304',
        ncm: '73181500', quantidade: 2, unidade: 'PC', valor_unitario: 85.11, ipi_percentual: 6.5 },
    ],
    ...over,
  };
}

(async () => {
  console.log('\n═══ Pedido de compra (API) ═══\n');
  const ctx = await createTestApp({ user: COMPRAS });
  const { app, db, setUser } = ctx;

  await dbRun(db, `INSERT INTO fornecedores
    (id, razao_social, nome_fantasia, cnpj, inscricao_estadual, endereco, cidade, estado, cep, telefone, email)
    VALUES (1, 'TECNOPAR FIXADORES LTDA', 'TECNOPAR', '54.984.382/0001-64', '799850123110',
            'AV. WINSTON CHURCHILL, 596 - RUDGE RAMOS', 'SAO BERNARDO DO CAMPO', 'SP',
            '00000-000', '(11) 4177-2311', 'contato@tecnopar.com.br')`);

  const materialId = await novoMaterial(db);

  /* ── criação e totais ─────────────────────────────────────────────── */
  console.log('Criação');
  let criadoId = null;

  await test('POST cria o pedido e devolve os seis totais calculados', async () => {
    const r = await request(app).post('/api/compras/pedidos').send(corpoPedido(materialId));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    criadoId = r.body.id;
    // 13 × 2,191 = 28,48 e 2 × 85,11 = 170,22 → 198,70; IPI 6,5% = 1,85 + 11,06 = 12,91
    assert.strictEqual(r.body.totais.total_produtos, 198.70);
    assert.strictEqual(r.body.totais.total_ipi, 12.91);
    assert.strictEqual(r.body.totais.total_geral, 211.61);
  });

  await test('os dados complementares do documento voltam gravados', async () => {
    const r = await request(app).get(`/api/compras/pedidos/${criadoId}`);
    assert.strictEqual(r.body.condicao_pagamento, '28 D.D.L.');
    assert.strictEqual(r.body.via_transporte, 'Rodoviário');
    assert.ok(String(r.body.frete_modalidade).startsWith('2-Contrata'));
    assert.strictEqual(r.body.observacoes, 'OS 1714 TQVS-4_INOX 304');
  });

  await test('os itens voltam com NCM, data de entrega e IPI (colunas da Etapa 32)', async () => {
    const r = await request(app).get(`/api/compras/pedidos/${criadoId}`);
    const item = r.body.itens[0];
    assert.strictEqual(item.ncm, '73181500');
    assert.strictEqual(item.data_entrega, '2025-12-18');
    assert.strictEqual(item.ipi_percentual, 6.5);
    assert.strictEqual(item.item_numero, 1);
    assert.strictEqual(item.valor_linha, 28.48);
    assert.strictEqual(item.ipi_linha, 1.85);
  });

  await test('RN-10: valor_total é gravado como espelho de total_geral', async () => {
    const row = await dbGet(db, 'SELECT valor_total FROM pedidos_compra WHERE id = ?', [criadoId]);
    assert.strictEqual(row.valor_total, 211.61);
  });

  await test('a lista traz total_itens e total_geral sem perder as colunas antigas', async () => {
    const r = await request(app).get('/api/compras/pedidos');
    const linha = r.body.find((p) => p.id === criadoId);
    assert.strictEqual(linha.total_itens, 2);
    assert.strictEqual(linha.total_geral, 211.61);
    assert.ok('fornecedor_nome' in linha, 'a lista perdeu fornecedor_nome (consumidor atual)');
    assert.ok('valor_total' in linha, 'a lista perdeu valor_total (Compras.js:264 e :149)');
  });

  /* ── validações ───────────────────────────────────────────────────── */
  console.log('\nValidações');

  await test('RN-01: número repetido é recusado com a mensagem literal', async () => {
    const corpo = corpoPedido(materialId, { numero: 'PC-DUP-E32' });
    await request(app).post('/api/compras/pedidos').send(corpo);
    const r = await request(app).post('/api/compras/pedidos').send({ ...corpo, itens: corpo.itens });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Já existe um pedido de compra com este número');
  });

  await test('RN-01: número vazio é recusado', async () => {
    const r = await request(app).post('/api/compras/pedidos').send(corpoPedido(materialId, { numero: '  ' }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Informe o número do pedido');
  });

  await test('RN-01 vale no PUT: manter o próprio número é permitido', async () => {
    const atual = await request(app).get(`/api/compras/pedidos/${criadoId}`);
    const r = await request(app).put(`/api/compras/pedidos/${criadoId}`).send({
      numero: atual.body.numero, fornecedor_id: 1, itens: atual.body.itens,
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });

  await test('RN-01 vale no PUT: usar o número de OUTRO pedido é recusado', async () => {
    const outro = await request(app).post('/api/compras/pedidos').send(corpoPedido(materialId));
    const atual = await request(app).get(`/api/compras/pedidos/${criadoId}`);
    const r = await request(app).put(`/api/compras/pedidos/${criadoId}`).send({
      numero: outro.body.numero, fornecedor_id: 1, itens: atual.body.itens,
    });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Já existe um pedido de compra com este número');
  });

  await test('RN-02: pedido sem itens é recusado', async () => {
    const r = await request(app).post('/api/compras/pedidos').send(corpoPedido(materialId, { itens: [] }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Adicione ao menos um item ao pedido');
  });

  await test('RN-02: pedido sem fornecedor é recusado', async () => {
    const r = await request(app).post('/api/compras/pedidos').send(corpoPedido(materialId, { fornecedor_id: null }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Selecione o fornecedor');
  });

  await test('RN-09: item sem material é recusado NA ENTRADA, não no recebimento', async () => {
    const corpo = corpoPedido(materialId);
    corpo.itens = [{ codigo: 'MP-000', descricao: 'Item solto', quantidade: 1, valor_unitario: 10 }];
    const r = await request(app).post('/api/compras/pedidos').send(corpo);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Item sem material: selecione o material do cadastro');
  });

  await test('404 reusa o literal da base, não inventa um segundo', async () => {
    const r = await request(app).get('/api/compras/pedidos/999999');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'Pedido de compra não encontrado');
  });

  /* ── RN-06: snapshot fiscal ───────────────────────────────────────── */
  console.log('\nRN-06 — snapshot fiscal do fornecedor');

  await test('o pedido congela o bloco fiscal do fornecedor na criação', async () => {
    const r = await request(app).get(`/api/compras/pedidos/${criadoId}`);
    assert.strictEqual(r.body.fornecedor.nome, 'TECNOPAR FIXADORES LTDA');
    assert.strictEqual(r.body.fornecedor.cnpj, '54.984.382/0001-64');
    assert.strictEqual(r.body.fornecedor.inscricao_estadual, '799850123110');
    assert.strictEqual(r.body.fornecedor.municipio, 'SAO BERNARDO DO CAMPO');
    assert.strictEqual(r.body.fornecedor.uf, 'SP');
    assert.strictEqual(r.body.fornecedor.origem, 'snapshot');
  });

  await test('renomear o fornecedor NÃO reescreve o pedido já emitido', async () => {
    await dbRun(db, `UPDATE fornecedores SET razao_social = 'TECNOPAR RENOMEADA SA' WHERE id = 1`);
    const r = await request(app).get(`/api/compras/pedidos/${criadoId}`);
    assert.strictEqual(r.body.fornecedor.nome, 'TECNOPAR FIXADORES LTDA',
      'o snapshot foi sobrescrito pelo JOIN vivo — é a colisão de nome que a RN-06 previne');
    await dbRun(db, `UPDATE fornecedores SET razao_social = 'TECNOPAR FIXADORES LTDA' WHERE id = 1`);
  });

  await test('pedido SEM snapshot (anterior à etapa) cai no cadastro vivo', async () => {
    const r = await dbRun(db, `INSERT INTO pedidos_compra (numero, fornecedor_id, status)
      VALUES ('PC-LEGADO-E32', 1, 'pendente')`);
    const resp = await request(app).get(`/api/compras/pedidos/${r.lastID}`);
    assert.strictEqual(resp.body.fornecedor.origem, 'cadastro');
    assert.strictEqual(resp.body.fornecedor.nome, 'TECNOPAR FIXADORES LTDA');
    assert.strictEqual(resp.body.totais.total_geral, 0, 'pedido legado sem itens deve dar zero, não NaN');
  });

  /* ── RN-07: status ────────────────────────────────────────────────── */
  console.log('\nRN-07 — status');

  await test('status inválido é recusado', async () => {
    const r = await request(app).put(`/api/compras/pedidos/${criadoId}/status`).send({ status: 'voando' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Status inválido');
  });

  await test('pedido finalizado não aceita mais alteração', async () => {
    const corpo = corpoPedido(materialId);
    const novo = await request(app).post('/api/compras/pedidos').send(corpo);
    await request(app).put(`/api/compras/pedidos/${novo.body.id}/status`).send({ status: 'finalizado' });
    const r = await request(app).put(`/api/compras/pedidos/${novo.body.id}`).send({
      numero: corpo.numero, fornecedor_id: 1, itens: corpo.itens,
    });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.body.error, 'Pedido finalizado não pode ser alterado');
  });

  /* ── RN-08 e o DELETE que quase virou código morto ────────────────── */
  console.log('\nRN-08 — exclusão');

  await test('o DELETE atendido é o do MÓDULO, não o genérico /:tipo/:id', async () => {
    const novo = await request(app).post('/api/compras/pedidos').send(corpoPedido(materialId));
    const r = await request(app).delete(`/api/compras/pedidos/${novo.body.id}`);
    assert.strictEqual(r.status, 200);
    // A genérica responderia 'Item excluído com sucesso'. Este literal é a prova da ordem.
    assert.strictEqual(r.body.message, 'Pedido excluído');
  });

  await test('excluir o pedido leva os itens junto (sem órfão e sem estourar FK)', async () => {
    const novo = await request(app).post('/api/compras/pedidos').send(corpoPedido(materialId));
    const antes = await dbAll(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ?', [novo.body.id]);
    assert.strictEqual(antes.length, 2, 'o pedido deveria ter 2 itens antes da exclusão');
    await request(app).delete(`/api/compras/pedidos/${novo.body.id}`);
    const depois = await dbAll(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ?', [novo.body.id]);
    assert.strictEqual(depois.length, 0, 'itens ficaram órfãos');
  });

  await test('pedido com recebimento lançado NÃO pode ser excluído', async () => {
    const novo = await request(app).post('/api/compras/pedidos').send(corpoPedido(materialId));
    setUser(ALMOXARIFE);
    await receiptService.criarRecebimento(db, ALMOXARIFE, {
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: novo.body.id,
    });
    setUser(COMPRAS);
    const r = await request(app).delete(`/api/compras/pedidos/${novo.body.id}`);
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.body.error, 'Pedido já tem recebimento lançado e não pode ser excluído');
  });

  await test('DELETE de pedido inexistente é 404 com o literal da base', async () => {
    const r = await request(app).delete('/api/compras/pedidos/999999');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'Pedido de compra não encontrado');
  });

  /* ── RN-11: a divergência declarada com o recebimento ─────────────── */
  console.log('\nRN-11 — o recebimento ignora o IPI, de propósito');

  await test('recebimento gerado do pedido soma SEM IPI (divergência declarada)', async () => {
    const novo = await request(app).post('/api/compras/pedidos').send(corpoPedido(materialId));
    assert.strictEqual(novo.body.totais.total_geral, 211.61);

    setUser(ALMOXARIFE);
    const rec = await receiptService.criarRecebimento(db, ALMOXARIFE, {
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: novo.body.id,
    });
    setUser(COMPRAS);

    const itens = await dbAll(db,
      'SELECT valor_total FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?',
      [rec.id]);
    const soma = Math.round(itens.reduce((s, i) => s + (i.valor_total || 0), 0) * 100) / 100;

    assert.strictEqual(soma, 198.70,
      'o recebimento passou a somar com IPI — a RN-11 mudou e o plano precisa ser atualizado');
    assert.notStrictEqual(soma, novo.body.totais.total_geral);
  });

  await test('RN-09 na prática: o recebimento ENXERGA os itens do pedido', async () => {
    const novo = await request(app).post('/api/compras/pedidos').send(corpoPedido(materialId));
    setUser(ALMOXARIFE);
    const rec = await receiptService.criarRecebimento(db, ALMOXARIFE, {
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: novo.body.id,
    });
    setUser(COMPRAS);
    const itens = await dbAll(db,
      'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [rec.id]);
    assert.strictEqual(itens.length, 2,
      'itens sumiram na carga — é o .filter(i => i.material_id) de receiptService.js:85');
  });

  await ctx.close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
