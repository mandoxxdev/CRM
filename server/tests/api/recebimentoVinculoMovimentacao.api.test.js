/**
 * Etapa 71, T1 (D4/B332) — o VINCULO item do recebimento -> movimentacao de entrada.
 *
 * ── POR QUE ESTE ARQUIVO EXISTE ──────────────────────────────────────────────────────────────
 * O estorno de uma `ENTRADA_COMPRA` (T2) precisa descontar a LINHA DO PEDIDO que aquela entrada
 * somou. Ate a 71 o caminho era movimentacao -> (`recebimento_id`, `material_id`) -> item ->
 * `pedido_item_id`, e ele e AMBIGUO quando a nota tem dois itens do mesmo material (duas linhas do
 * mesmo pedido, caso legitimo da Etapa 37): a sonda da Fase 0 gerou duas `ENTRADA_COMPRA` (3 e 5)
 * do mesmo material no mesmo recebimento, e nada dizia qual era de qual linha. E o mesmo problema
 * que a Etapa 57 resolveu para o endereco gravando `localizacao_entrada_id` no item.
 *
 * O contrato: `darEntradaEstoque` guarda o id que `registrarMovimentacao` devolve em
 * `recebimentos_material_itens_almoxarifado.movimentacao_entrada_id`, logo depois da entrada, em
 * try/catch proprio (rastro nao desfaz entrada que ja aconteceu).
 *
 * Os DOIS caminhos de entrada fisica (`processarNota` e o ramo de `aprovarRecebimento` que nao
 * delega) passam por `darEntradaEstoque` — e a Etapa 37 ja pagou por esquecer o segundo, entao os
 * dois sao medidos aqui.
 *
 * Executar: cd server && node tests/api/recebimentoVinculoMovimentacao.api.test.js
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

const ADMIN = { id: 171, nome: 'Admin E71 T1', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  const forn = await dbRun(db,
    "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Fornecedor E71 T1','71000111000171','ativo')");

  let seq = 0;
  async function novoMaterial() {
    seq += 1;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'PC',0,1)`,
    [`MAT-E71T1-${String(seq).padStart(3, '0')}`, `Chapa E71 T1 ${seq}`])).lastID;
  }

  async function novoPedido(itens) {
    const r = await request(app).post('/api/compras/pedidos').send({ fornecedor_id: forn.lastID, itens });
    assert.strictEqual(r.status, 201, `fixture: POST do pedido ${r.status} ${JSON.stringify(r.body)}`);
    const linhas = await dbAll(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id', [r.body.id]);
    return { pedido: r.body, linhas };
  }

  const itemDaTela = (materialId, linhaId, qtd) => ({
    material_id: materialId, pedido_item_id: linhaId, quantidade: qtd, quantidade_recebida: qtd,
  });

  /** As portas reais ate o ponto de processar (sem processar). */
  async function prepararNota(pedido, itens) {
    setUser(ADMIN);
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, itens,
    });
    assert.strictEqual(criado.status, 201, `POST /recebimentos: ${JSON.stringify(criado.body)}`);
    const recId = criado.body.id;
    const conf = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/conferir`).send({ itens });
    assert.strictEqual(conf.status, 200, `PUT /conferir: ${JSON.stringify(conf.body)}`);
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      const r = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao });
      assert.strictEqual(r.status, 200, `workflow ${acao}: ${JSON.stringify(r.body)}`);
    }
    const fiscal = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`).send({
      nota_fiscal: `NF-E71T1-${recId}`, fornecedor_id: forn.lastID, fornecedor_nome: 'Fornecedor E71 T1',
      data_emissao_nf: '2026-09-01', data_entrada_nf: '2026-09-02', valor_total_nota: 100, itens,
    });
    assert.strictEqual(fiscal.status, 200, `PUT /fiscal: ${JSON.stringify(fiscal.body)}`);
    return recId;
  }
  const processar = (recId) => request(app)
    .post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao: 'processar' });

  const itensDoRecebimento = (recId) => dbAll(db, `SELECT id, material_id, pedido_item_id, quantidade_recebida,
      entrada_estoque_em, movimentacao_entrada_id
    FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? ORDER BY id`, [recId]);
  const entradasDoRecebimento = (recId) => dbAll(db, `SELECT id, material_id, quantidade
    FROM movimentacoes_almoxarifado WHERE recebimento_id = ? AND tipo = 'ENTRADA_COMPRA' ORDER BY id`, [recId]);

  /**
   * O que o vinculo tem de provar, item a item: aponta para uma `ENTRADA_COMPRA` DESTE recebimento,
   * do MESMO material e com a MESMA quantidade do item — e nenhum id se repete.
   */
  async function conferirVinculos(recId, qtdItensComEntrada) {
    const itens = await itensDoRecebimento(recId);
    const movs = await entradasDoRecebimento(recId);
    assert.strictEqual(movs.length, qtdItensComEntrada,
      `fixture: esperava ${qtdItensComEntrada} ENTRADA_COMPRA, vieram ${JSON.stringify(movs)}`);
    const porId = new Map(movs.map((m) => [m.id, m]));
    const usados = new Set();
    for (const it of itens) {
      if (!(Number(it.quantidade_recebida) > 0)) continue;
      assert.ok(it.movimentacao_entrada_id != null,
        `item ${it.id} entrou e ficou sem movimentacao_entrada_id: ${JSON.stringify(itens)}`);
      const mov = porId.get(it.movimentacao_entrada_id);
      assert.ok(mov, `item ${it.id} aponta para ${it.movimentacao_entrada_id}, que nao e ENTRADA_COMPRA deste recebimento`);
      assert.strictEqual(mov.material_id, it.material_id, `item ${it.id}: material da movimentacao diferente`);
      assert.strictEqual(Number(mov.quantidade), Number(it.quantidade_recebida),
        `item ${it.id} (${it.quantidade_recebida}) aponta para a movimentacao de ${mov.quantidade} — vinculo trocado`);
      assert.ok(!usados.has(mov.id), `dois itens apontam para a mesma movimentacao ${mov.id}`);
      usados.add(mov.id);
    }
    return itens;
  }

  // ── (1) /processar: dois itens do MESMO material (3 e 5) + um de outro material ───────────────
  await test('(1) D4 pelo /processar: cada item com entrada aponta para a SUA ENTRADA_COMPRA (mesmo material: ids diferentes)', async () => {
    const matA = await novoMaterial();
    const matB = await novoMaterial();
    const { pedido, linhas } = await novoPedido([
      { material_id: matA, quantidade: 3, valor_unitario: 1 },
      { material_id: matA, quantidade: 5, valor_unitario: 2 },
      { material_id: matB, quantidade: 4, valor_unitario: 1 },
    ]);
    const recId = await prepararNota(pedido, [
      itemDaTela(matA, linhas[0].id, 3), itemDaTela(matA, linhas[1].id, 5), itemDaTela(matB, linhas[2].id, 4),
    ]);
    const r = await processar(recId);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const itens = await conferirVinculos(recId, 3);
    // O par ambiguo, dito em voz alta: a linha 3 e a linha 5 do mesmo material apontam cada uma
    // para a movimentacao da SUA quantidade.
    const doA = itens.filter((i) => i.material_id === matA);
    assert.strictEqual(doA.length, 2);
    assert.notStrictEqual(doA[0].movimentacao_entrada_id, doA[1].movimentacao_entrada_id);
  });

  // ── (2) /aprovar direto: o SEGUNDO caminho de entrada fisica ──────────────────────────────────
  await test('(2) D4 pelo /aprovar direto (ramo que NAO delega para processarNota): o vinculo tambem nasce', async () => {
    const matA = await novoMaterial();
    const { pedido, linhas } = await novoPedido([
      { material_id: matA, quantidade: 2, valor_unitario: 1 },
      { material_id: matA, quantidade: 6, valor_unitario: 1 },
    ]);
    setUser(ADMIN);
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id,
      itens: [itemDaTela(matA, linhas[0].id, 2), itemDaTela(matA, linhas[1].id, 6)],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const r = await request(app).post(`/api/almoxarifado/recebimentos/${criado.body.id}/aprovar`).send({});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    // A forma da resposta prova o ramo (F12 da Etapa 42): o que delega devolve o contrato do processar.
    assert.deepStrictEqual(r.body, { success: true }, `o ramo exercitado delegou para processarNota: ${JSON.stringify(r.body)}`);
    await conferirVinculos(criado.body.id, 2);
  });

  // ── (3) item com quantidade 0: nao entra, nao ganha vinculo ───────────────────────────────────
  await test('(3) D4 item com 0 recebido nao gera ENTRADA_COMPRA e fica com movimentacao_entrada_id NULL', async () => {
    const matA = await novoMaterial();
    const matB = await novoMaterial();
    const { pedido, linhas } = await novoPedido([
      { material_id: matA, quantidade: 4, valor_unitario: 1 },
      { material_id: matB, quantidade: 4, valor_unitario: 1 },
    ]);
    // `quantidade` (a esperada) tem de ser > 0 pelo schema; o 0 e o RECEBIDO — o caso real do
    // fornecedor que nao mandou aquela linha nesta nota.
    const recId = await prepararNota(pedido, [itemDaTela(matA, linhas[0].id, 4),
      { ...itemDaTela(matB, linhas[1].id, 4), quantidade_recebida: 0 }]);
    assert.strictEqual((await processar(recId)).status, 200);
    const itens = await conferirVinculos(recId, 1);
    const zero = itens.find((i) => i.material_id === matB);
    assert.ok(zero, `fixture: o item de 0 tinha de existir: ${JSON.stringify(itens)}`);
    assert.strictEqual(zero.movimentacao_entrada_id, null, `item de 0 ganhou vinculo: ${JSON.stringify(zero)}`);
    // Metade positiva: o outro item ganhou (sem ela, "ninguem grava" passaria aqui).
    assert.ok(itens.find((i) => i.material_id === matA).movimentacao_entrada_id != null);
  });

  // ── (4) reprocessamento: o item que ja entrou NAO tem o vinculo reescrito ─────────────────────
  //
  // A falha parcial REAL (a mesma do (5c) de `comprasPedidoStatusAutomatico`): o item 2 e de material
  // com serie cujo numero ja esta em estoque, o motor recusa e o processar volta 400 DEPOIS de o
  // item 1 ter entrado. O operador conserta a serie e reprocessa: o item 1 e pulado pelo claim
  // (`entrada_estoque_em`) e o vinculo dele continua apontando para a entrada da PRIMEIRA passada.
  await test('(4) D4 reprocessar depois de falha parcial nao reescreve o vinculo do item que ja entrou', async () => {
    const matA = await novoMaterial();
    const matSerie = await novoMaterial();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_serie = 1 WHERE id = ?', [matSerie]);
    setUser(ADMIN);
    const base = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: 'NF-E71T1-SERIE-BASE',
      itens: [{ material_id: matSerie, quantidade: 1, quantidade_recebida: 1, series: 'SN-E71-DUP' }],
    });
    assert.strictEqual(base.status, 201, JSON.stringify(base.body));
    assert.strictEqual((await request(app).post(`/api/almoxarifado/recebimentos/${base.body.id}/aprovar`).send({})).status, 200);

    const { pedido, linhas } = await novoPedido([
      { material_id: matA, quantidade: 5, valor_unitario: 1 },
      { material_id: matSerie, quantidade: 1, valor_unitario: 1 },
    ]);
    const recId = await prepararNota(pedido, [
      itemDaTela(matA, linhas[0].id, 5),
      { ...itemDaTela(matSerie, linhas[1].id, 1), series: 'SN-E71-DUP' },
    ]);
    const falhou = await processar(recId);
    assert.strictEqual(falhou.status, 400, `o motor tinha de recusar a serie duplicada: ${JSON.stringify(falhou.body)}`);
    const depoisDaFalha = await itensDoRecebimento(recId);
    const item1 = depoisDaFalha.find((i) => i.material_id === matA);
    assert.ok(item1.movimentacao_entrada_id != null,
      `o item 1 entrou na passada que falhou e tinha de ter o vinculo: ${JSON.stringify(item1)}`);
    const vinculoOriginal = item1.movimentacao_entrada_id;

    await dbRun(db, `UPDATE recebimentos_material_itens_almoxarifado SET series = 'SN-E71-NOVA'
      WHERE recebimento_id = ? AND material_id = ?`, [recId, matSerie]);
    const ok = await processar(recId);
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));

    const itens = await conferirVinculos(recId, 2);
    assert.strictEqual(itens.find((i) => i.material_id === matA).movimentacao_entrada_id, vinculoOriginal,
      'o reprocessamento reescreveu o vinculo do item que ja tinha entrado');
  });

  await close();
  console.log(`\nrecebimentoVinculoMovimentacao: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
