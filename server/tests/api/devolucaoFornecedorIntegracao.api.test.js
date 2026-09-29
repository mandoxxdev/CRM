/**
 * Etapa 45, T6 — INTEGRAÇÃO: o ciclo inteiro da devolução ao fornecedor, pelas ROTAS HTTP reais.
 *
 * Plano:  docs/superpowers/plans/2026-09-28-almoxarifado-etapa45-devolucao-ao-fornecedor.md (T6)
 * Design: docs/superpowers/specs/2026-09-28-almoxarifado-etapa45-devolucao-ao-fornecedor-design.md
 *
 * ── POR QUE ESTE ARQUIVO EXISTE ──────────────────────────────────────────────────────────────
 * A T1 mediu o motor, a T2 mediu a regra e a T3 mediu a porta — cada uma com fixture montado por
 * SQL. Nenhuma delas prova que o ciclo COMPÕE: que o material crítico entra retido, que a
 * inspeção reprovada abre o documento sozinha, que o bloqueio que ela cria é o MESMO que a
 * execução baixa, e que o lote da nota é o MESMO que o débito encontra. Nesta base já houve etapa
 * com toda a unidade verde e a feature morta em produção, por fiação.
 *
 *   (1) O CICLO: receber crítico com lote -> reprovar 3 encaminhando DEVOLVER -> a NC nasce ->
 *       a QUALIDADE decide -> ⚠️ **O MATERIAL NÃO SAI** (RN-02, e é o que distingue esta etapa
 *       da 44) -> o COMPRAS registra a execução -> aí sim o material sai do físico E do
 *       bloqueado, a linha do LOTE é debitada, e a NC sai da fila de pendentes.
 *   (2) O CORTE DECLARADO: o pedido de compra continua *Recebido*. Não é bug — é decisão escrita,
 *       e fica FIXADA POR TESTE para ninguém "consertar" sem ler a razão.
 *   (3) O TIPO CONTINUA DEDICADO NO CICLO REAL: depois de tudo, a rota genérica ainda recusa
 *       `DEVOLUCAO_FORNECEDOR` e manda o operador para a tela certa.
 *
 * ── GUARDA ANTI-TESTE-VAZIO ──────────────────────────────────────────────────────────────────
 * O cenário (1) afirma DUAS vezes o mesmo saldo com sentidos opostos: depois da decisão ele tem
 * de estar INTACTO (a etapa falharia se copiasse a 44) e depois da execução ele tem de ter caído
 * EXATAMENTE 3. Um erro que fizesse a decisão já baixar o material derrubaria a primeira metade;
 * um que fizesse a execução não baixar derrubaria a segunda. Nenhuma das duas passa com a outra.
 *
 * Executar: cd server && node tests/api/devolucaoFornecedorIntegracao.api.test.js
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

const ADMIN = { id: 4560, nome: 'Admin E45 T6', role: 'admin', is_superadmin: 1, email: 'admin45t6@test.com' };
const QUALIDADE = { id: 4561, nome: 'Qualidade E45 T6', role: 'usuario', perfil_almoxarifado: 'QUALIDADE' };
const COMPRAS = { id: 4562, nome: 'Compras E45 T6', role: 'usuario', perfil_almoxarifado: 'COMPRAS' };

(async () => {
  console.log('\n=== Etapa 45 T6: integracao da devolucao ao fornecedor ===\n');
  const { app, db, setUser, close } = await createTestApp({ user: { ...ADMIN } });

  const fornecedor = (await dbRun(db, `INSERT INTO fornecedores (razao_social, cnpj, status)
    VALUES ('Acos Integra E45','45.450.450/0001-45','ativo')`)).lastID;

  let seq = 0;
  async function novoMaterialCritico({ controleLote = true } = {}) {
    seq += 1;
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, material_critico, controle_lote)
      VALUES (?,?,'KG',0,1,1,?)`,
      [`DVF-${String(seq).padStart(3, '0')}`, `Chapa integracao 45 ${seq}`, controleLote ? 1 : 0]);
    return r.lastID;
  }

  const setConfig = (chave, valor) => dbRun(db,
    `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);

  const saldosDe = (materialId) => dbGet(db, `SELECT quantidade_atual, quantidade_bloqueada,
    quantidade_em_inspecao FROM materiais_almoxarifado WHERE id = ?`, [materialId]);

  const linhasDeSaldo = (materialId) => dbAll(db, `SELECT lote_id, quantidade
    FROM estoque_saldo_almoxarifado WHERE material_id = ?`, [materialId]);

  /** Recebe 10 de um material critico pela ROTA, e devolve o item ja retido em inspecao. */
  async function receberCriticoRetido(materialId, loteCodigo) {
    seq += 1;
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: `NF-DVF-${seq}`,
      fornecedor_id: fornecedor, fornecedor_nome: 'Acos Integra E45',
      itens: [{ material_id: materialId, quantidade: 10, ...(loteCodigo ? { lote: loteCodigo } : {}) }],
    });
    assert.strictEqual(criado.status, 201, `POST /recebimentos: ${JSON.stringify(criado.body)}`);
    const item = await dbGet(db,
      'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [criado.body.id]);
    return { recebimentoId: criado.body.id, itemId: item.id };
  }

  async function aprovar(recebimentoId, itemId) {
    const ap = await request(app).post(`/api/almoxarifado/recebimentos/${recebimentoId}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, `POST /aprovar: ${JSON.stringify(ap.body)}`);
    const retido = await dbGet(db,
      'SELECT quantidade_em_inspecao FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [itemId]);
    assert.strictEqual(retido.quantidade_em_inspecao, 10,
      `fixture: o critico tinha de entrar retido, veio ${retido.quantidade_em_inspecao}`);
  }

  await setConfig('inspecao_material_critico', '1');

  // ── (1) O CICLO INTEIRO ────────────────────────────────────────────────────────────────────
  await test('(1) receber -> reprovar DEVOLVER -> decidir NAO move -> executar move, e o lote e debitado', async () => {
    const materialId = await novoMaterialCritico();
    const loteCodigo = `L-DVF-${Date.now() % 100000}`;
    const { recebimentoId, itemId } = await receberCriticoRetido(materialId, loteCodigo);
    await aprovar(recebimentoId, itemId);

    // A QUALIDADE reprova 3 de 10 e encaminha DEVOLVER. O motor tira os 10 de `em_inspecao`, soma
    // 3 em `bloqueada` e devolve 7 ao disponivel.
    setUser({ ...QUALIDADE });
    const insp = await request(app).post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`)
      .send({ quantidade_aprovada: 7, quantidade_reprovada: 3, dano_fisico: 1, encaminhamento: 'DEVOLVER' });
    assert.strictEqual(insp.status, 201, `POST /inspecionar: ${JSON.stringify(insp.body)}`);

    const aposInspecao = await saldosDe(materialId);
    assert.strictEqual(aposInspecao.quantidade_bloqueada, 3, `bloqueada apos inspecao: ${aposInspecao.quantidade_bloqueada}`);
    assert.strictEqual(aposInspecao.quantidade_em_inspecao, 0);
    assert.strictEqual(aposInspecao.quantidade_atual, 10, 'o fisico nao e 10 depois da entrada');

    // O documento nasceu SOZINHO.
    const lista = await request(app).get('/api/almoxarifado/nao-conformidades?origem=INSPECAO&limite=500');
    const doc = lista.body.itens.find((n) => n.referencia_id === insp.body.id && n.referencia_tipo === 'INSPECAO');
    assert.ok(doc, 'a reprovacao nao abriu documento');
    assert.strictEqual(doc.status, 'ABERTA');
    assert.strictEqual(doc.execucao_estado, null, 'NC ABERTA nasceu com estado de execucao');

    // ── A DECISAO. ⚠️ E AQUI QUE ESTA ETAPA SE SEPARA DA 44: decidir NAO move o material. ──
    const dec = await request(app).post(`/api/almoxarifado/nao-conformidades/${doc.id}/decidir`)
      .send({ decisao: 'DEVOLVER', justificativa: 'chapa empenada, devolver ao fornecedor' });
    assert.strictEqual(dec.status, 200, `POST /decidir: ${JSON.stringify(dec.body)}`);
    assert.strictEqual(dec.body.liberacao.efeito, 'NENHUMA', 'a decisao DEVOLVER liberou saldo');
    assert.strictEqual(dec.body.execucao_estado, 'PENDENTE', 'a decisao nao entrou na fila de execucao');

    const aposDecisao = await saldosDe(materialId);
    assert.strictEqual(aposDecisao.quantidade_atual, 10,
      'a DECISAO baixou o fisico — o sistema afirmaria uma remessa que nao aconteceu');
    assert.strictEqual(aposDecisao.quantidade_bloqueada, 3, 'a DECISAO mexeu no bloqueado');
    const inspAposDecisao = await dbGet(db,
      'SELECT devolucao_fornecedor_em FROM inspecoes_recebimento_almoxarifado WHERE id = ?', [insp.body.id]);
    assert.strictEqual(inspAposDecisao.devolucao_fornecedor_em, null, 'a DECISAO carimbou a inspecao');

    // E a NC aparece na FILA do que falta executar, que e a resposta ao requisito da feature 09.
    const fila = await request(app).get('/api/almoxarifado/nao-conformidades?execucao=PENDENTE&limite=500');
    assert.ok(fila.body.itens.some((n) => n.id === doc.id), 'a NC decidida nao entrou na fila de execucao');

    // ── A EXECUCAO, pelo COMPRAS — que e quem trata com o fornecedor, e NAO decide NC. ──
    setUser({ ...COMPRAS });
    const exec = await request(app).post(`/api/almoxarifado/nao-conformidades/${doc.id}/executar`)
      .send({ observacoes: 'coleta 442, conhecimento 8871' });
    assert.strictEqual(exec.status, 200, `POST /executar: ${JSON.stringify(exec.body)}`);
    assert.strictEqual(exec.body.execucao.efeito, 'BAIXADA', JSON.stringify(exec.body.execucao));
    assert.strictEqual(exec.body.execucao.mensagem, '3 devolvido(s) ao fornecedor');
    assert.strictEqual(exec.body.execucao_por_nome, COMPRAS.nome, 'o autor da execucao nao e quem executou');

    const aposExecucao = await saldosDe(materialId);
    assert.strictEqual(aposExecucao.quantidade_atual, 7, 'o fisico nao caiu exatamente 3');
    assert.strictEqual(aposExecucao.quantidade_bloqueada, 0, 'o bloqueado nao caiu exatamente 3');

    // O LOTE: a linha do lote da nota tem de ser a debitada, e nenhuma linha pode ficar negativa.
    const lote = await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
      [materialId, loteCodigo]);
    assert.ok(lote, 'o lote da nota nao foi criado na entrada');
    const linhas = await linhasDeSaldo(materialId);
    const doLote = linhas.filter((l) => Number(l.lote_id) === Number(lote.id));
    assert.strictEqual(doLote.length, 1, `esperava 1 linha do lote, veio ${JSON.stringify(linhas)}`);
    assert.strictEqual(Number(doLote[0].quantidade), 7, 'a linha do lote nao caiu de 10 para 7');
    for (const l of linhas) {
      assert.ok(Number(l.quantidade) >= 0,
        `linha de saldo NEGATIVA (lote ${l.lote_id}: ${l.quantidade}) — o debito caiu no lugar errado`);
    }

    // O livro, e o elo com o documento.
    const mov = await dbGet(db, `SELECT tipo, quantidade, motivo, documento_vinculado, lote_id
      FROM movimentacoes_almoxarifado
      WHERE material_id = ? AND tipo = 'DEVOLUCAO_FORNECEDOR'`, [materialId]);
    assert.ok(mov, 'nao nasceu linha de DEVOLUCAO_FORNECEDOR no livro');
    assert.strictEqual(Number(mov.quantidade), 3);
    assert.strictEqual(mov.motivo, 'Devolução ao fornecedor');
    assert.strictEqual(mov.documento_vinculado, doc.numero, 'a movimentacao nao cita a NC');
    assert.strictEqual(Number(mov.lote_id), Number(lote.id), 'o livro nao registrou o lote');

    // E a NC SAI da fila.
    setUser({ ...ADMIN });
    const filaDepois = await request(app).get('/api/almoxarifado/nao-conformidades?execucao=PENDENTE&limite=500');
    assert.ok(!filaDepois.body.itens.some((n) => n.id === doc.id),
      'a NC executada continua cobrando na fila de pendentes');
  });

  // ── (2) O CORTE DECLARADO: o pedido NAO reabre ─────────────────────────────────────────────
  await test('(2) corte declarado: o pedido de compra continua Recebido depois da devolucao', async () => {
    // Nao e bug — `quantidade_recebida` so SOBE, decisao escrita em receiptService.js:1755-1760, e
    // a Etapa 45 cria um segundo gesto dessa familia e o DECLARA. O teste fixa o comportamento
    // para ninguem "consertar" sem ler a razao; o dia em que o cliente pedir a reabertura, este
    // cenario e o lugar onde a mudanca aparece.
    setUser({ ...ADMIN });
    const materialId = await novoMaterialCritico({ controleLote: false });
    const pedido = await dbRun(db, `INSERT INTO pedidos_compra (numero, fornecedor_id, status)
      VALUES (?,?,'aprovado')`, [`PC-DVF-${Date.now() % 100000}`, fornecedor]);
    const linhaPedido = await dbRun(db, `INSERT INTO itens_pedido_compra
      (pedido_id, material_id, quantidade, unidade) VALUES (?,?,?,'KG')`, [pedido.lastID, materialId, 10]);

    const { recebimentoId, itemId } = await receberCriticoRetido(materialId, null);
    await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET pedido_item_id = ? WHERE id = ?',
      [linhaPedido.lastID, itemId]);
    await aprovar(recebimentoId, itemId);

    const aposEntrada = await dbGet(db, 'SELECT status FROM pedidos_compra WHERE id = ?', [pedido.lastID]);
    assert.strictEqual(String(aposEntrada.status).toLowerCase(), 'recebido',
      `fixture: a entrada tinha de fechar o pedido, veio ${aposEntrada.status}`);
    const recebidaAntes = (await dbGet(db,
      'SELECT quantidade_recebida FROM itens_pedido_compra WHERE id = ?', [linhaPedido.lastID])).quantidade_recebida;

    setUser({ ...QUALIDADE });
    const insp = await request(app).post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`)
      .send({ quantidade_aprovada: 7, quantidade_reprovada: 3, dano_fisico: 1, encaminhamento: 'DEVOLVER' });
    assert.strictEqual(insp.status, 201, JSON.stringify(insp.body));
    const lista = await request(app).get('/api/almoxarifado/nao-conformidades?origem=INSPECAO&limite=500');
    const doc = lista.body.itens.find((n) => n.referencia_id === insp.body.id && n.referencia_tipo === 'INSPECAO');
    await request(app).post(`/api/almoxarifado/nao-conformidades/${doc.id}/decidir`)
      .send({ decisao: 'DEVOLVER', justificativa: 'devolver ao fornecedor' });
    setUser({ ...COMPRAS });
    const exec = await request(app).post(`/api/almoxarifado/nao-conformidades/${doc.id}/executar`).send({});
    assert.strictEqual(exec.body.execucao.efeito, 'BAIXADA', JSON.stringify(exec.body.execucao));
    // A metade positiva: a devolucao ACONTECEU de verdade. Sem ela, "o pedido continua recebido"
    // passaria verde com a devolucao nao tendo ocorrido.
    assert.strictEqual((await saldosDe(materialId)).quantidade_atual, 7);

    const aposDevolucao = await dbGet(db, 'SELECT status FROM pedidos_compra WHERE id = ?', [pedido.lastID]);
    assert.strictEqual(String(aposDevolucao.status).toLowerCase(), 'recebido',
      'o pedido mudou de status por causa da devolucao — o corte declarado deixou de valer');
    const recebidaDepois = (await dbGet(db,
      'SELECT quantidade_recebida FROM itens_pedido_compra WHERE id = ?', [linhaPedido.lastID])).quantidade_recebida;
    assert.strictEqual(Number(recebidaDepois), Number(recebidaAntes),
      'a devolucao baixou `quantidade_recebida` do pedido — ela so sobe, por decisao escrita');
  });

  // ── (3) o tipo continua DEDICADO no ciclo real ─────────────────────────────────────────────
  await test('(3) a rota generica continua recusando o tipo, e nomeia a tela de Nao Conformidades', async () => {
    setUser({ ...ADMIN });
    const materialId = await novoMaterialCritico({ controleLote: false });
    await dbRun(db, `UPDATE materiais_almoxarifado
      SET quantidade_atual = 10, quantidade_bloqueada = 3 WHERE id = ?`, [materialId]);
    const antes = await saldosDe(materialId);

    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({
      material_id: materialId, tipo: 'DEVOLUCAO_FORNECEDOR', quantidade: 3,
      justificativa: 'tentando pela porta generica', motivo: 'Devolução ao fornecedor',
    });
    assert.strictEqual(res.status, 400, `a rota generica aceitou o tipo: ${JSON.stringify(res.body)}`);
    assert.ok(/[Nn]ão [Cc]onformidade/.test(String(res.body.error || '')),
      `a recusa nao nomeia a tela certa: ${JSON.stringify(res.body)}`);

    const depois = await saldosDe(materialId);
    assert.strictEqual(depois.quantidade_atual, antes.quantidade_atual, 'a recusa mexeu no fisico');
    assert.strictEqual(depois.quantidade_bloqueada, antes.quantidade_bloqueada, 'a recusa mexeu no bloqueado');
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
