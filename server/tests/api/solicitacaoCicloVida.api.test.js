/**
 * Etapa 14, Task 1 — RN-01/RN-01b/RN-02/RN-03: ciclo de vida da solicitacao de compra.
 * PENDENTE -> VINCULADO (E11, inalterado) -> RECEBIDA (automatica, D2) | CANCELADA (manual, D3).
 *
 * MOLDE DO HARNESS (Global Constraints da Etapa 14, Fase 2 C5 — pedidos_compra NAO existe no
 * testApp): stub minimo abaixo. itens_pedido_compra JA vem do initSchema.
 *
 * Executar: cd server && node tests/api/solicitacaoCicloVida.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');
const purchaseService = require('../../services/almoxarifado/purchaseService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };
const COMPRAS = { id: 5, nome: 'Comprador', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'compras@test.com' };

let seq = 0;
async function novoMaterial(db, over = {}) {
  seq += 1;
  const m = { codigo: `SCV-${seq}`, nome: `Material SCV ${seq}`, unidade: 'UN', qtd: 0,
    minima: 0, maxima: 0, ponto: 0, lote: 0, prazo: 0, ...over };
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, quantidade_minima, quantidade_maxima,
       ponto_reposicao, lote_economico, prazo_reposicao_dias, controle_lote)
     VALUES (?,?,?,?,1,?,?,?,?,?,0)`,
    [m.codigo, m.nome, m.unidade, m.qtd, m.minima, m.maxima, m.ponto, m.lote, m.prazo]);
  return r.lastID;
}

async function novoPedido(db, over = {}) {
  seq += 1;
  const p = { numero: `PC-SCV-${seq}`, fornecedor_id: null, valor_total: 0, status: 'ABERTO',
    data_pedido: '2026-08-01', ...over };
  const r = await dbRun(db, `INSERT INTO pedidos_compra
      (numero, fornecedor_id, valor_total, status, data_pedido) VALUES (?,?,?,?,?)`,
    [p.numero, p.fornecedor_id, p.valor_total, p.status, p.data_pedido]);
  return r.lastID;
}

async function novoItemPedido(db, pedidoId, materialId, quantidade, valorUnitario) {
  await dbRun(db, `INSERT INTO itens_pedido_compra
      (pedido_id, material_id, quantidade, valor_unitario) VALUES (?,?,?,?)`,
    [pedidoId, materialId, quantidade, valorUnitario]);
}

async function novaSolicitacao(db, materialId, over = {}) {
  const s = { quantidade: 10, motivo: 'PONTO_REPOSICAO', status: 'PENDENTE', pedido_compra_id: null, ...over };
  const r = await dbRun(db, `INSERT INTO solicitacoes_compra_almoxarifado
      (material_id, quantidade, motivo, status, pedido_compra_id) VALUES (?,?,?,?,?)`,
    [materialId, s.quantidade, s.motivo, s.status, s.pedido_compra_id]);
  return r.lastID;
}

function itemDe(res, materialId) {
  for (const g of res.body.fornecedores) {
    const it = g.itens.find((i) => i.material_id === materialId);
    if (it) return it;
  }
  return undefined;
}

// MOLDE DO HARNESS (Global Constraints): caminho MINIMO real ate PROCESSADO.
async function caminhoAteProcessado(db, user, pedidoId, { valorUnitario = 10 } = {}) {
  const rec = await receiptService.criarRecebimento(db, user,
    { tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedidoId });
  await receiptService.avancarWorkflow(db, user, rec.id, 'encaminhar_compras');
  await receiptService.avancarWorkflow(db, user, rec.id, 'finalizar_compras');
  await receiptService.salvarDadosFiscal(db, user, rec.id, {
    nota_fiscal: `NF-${rec.id}`, data_emissao_nf: '2026-08-01', data_entrada_nf: '2026-08-02',
    valor_total_nota: valorUnitario, fornecedor_nome: 'Fornecedor Teste SCV',
  });
  return receiptService.processarNota(db, user, rec.id);
}

// (5b, Fase 2 C4): recebimento aprovado por POST /recebimentos/:id/aprovar SEM processarNota —
// status nasce RECEBIDO (fora de [EM_ENTRADA_NF, ENCAMINHADO_FATURAMENTO]), entao
// aprovarRecebimento cai no ramo que grava APROVADO direto.
async function caminhoAteAprovado(db, user, pedidoId) {
  const rec = await receiptService.criarRecebimento(db, user,
    { tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedidoId });
  const resultado = await receiptService.aprovarRecebimento(db, user, rec.id, {});
  return { recId: rec.id, resultado };
}

const LITERAL_TERMINAL_CANCELAR = 'Solicitação já finalizada (RECEBIDA ou CANCELADA) — não pode ser cancelada';
const LITERAL_TERMINAL_VINCULAR = 'Solicitação já finalizada (RECEBIDA ou CANCELADA) — não pode ser vinculada a um pedido';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  // MOLDE DO HARNESS (Global Constraints da Etapa 14, Fase 2 C5): pedidos_compra NAO existe no
  // testApp e nenhum teste de tests/api/ o cria.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS pedidos_compra (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE,
    fornecedor_id INTEGER,
    valor_total REAL DEFAULT 0,
    status TEXT,
    data_pedido DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── (1) cancelar PENDENTE ──
  await test('(1) cancelar PENDENTE: 200, status CANCELADA, colunas preenchidas, auditoria objeto', async () => {
    setUser(COMPRAS);
    const mat = await novoMaterial(db);
    const solId = await novaSolicitacao(db, mat);

    const res = await request(app).post(`/api/almoxarifado/compras/solicitacoes/${solId}/cancelar`)
      .send({ motivo: 'Duplicada por engano' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body, { success: true, status: 'CANCELADA' });

    const row = await dbGet(db, 'SELECT * FROM solicitacoes_compra_almoxarifado WHERE id = ?', [solId]);
    assert.strictEqual(row.status, 'CANCELADA', JSON.stringify(row));
    assert.ok(row.cancelada_em, 'cancelada_em deveria estar preenchido');
    assert.strictEqual(row.cancelada_por, COMPRAS.nome, JSON.stringify(row));
    assert.strictEqual(row.cancelamento_motivo, 'Duplicada por engano', JSON.stringify(row));
    assert.strictEqual(row.recebida_em, null, JSON.stringify(row));

    const auditRow = await dbGet(db, `SELECT dados_novos FROM auditoria_log_almoxarifado
      WHERE entidade = 'solicitacao_compra' AND entidade_id = ? AND acao = 'CANCELAMENTO'`, [solId]);
    assert.ok(auditRow, 'deveria ter auditado o cancelamento');
    const dadosNovos = JSON.parse(auditRow.dados_novos);
    assert.strictEqual(dadosNovos.motivo, 'Duplicada por engano', JSON.stringify(dadosNovos));
  });

  await test('(1b) cancelar sem motivo -> 400 literal, nada muda', async () => {
    setUser(COMPRAS);
    const mat = await novoMaterial(db);
    const solId = await novaSolicitacao(db, mat);

    const res = await request(app).post(`/api/almoxarifado/compras/solicitacoes/${solId}/cancelar`).send({});
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Justificativa obrigatória para cancelar a solicitação');

    const row = await dbGet(db, 'SELECT status FROM solicitacoes_compra_almoxarifado WHERE id = ?', [solId]);
    assert.strictEqual(row.status, 'PENDENTE', 'nao deveria ter mudado nada');
  });

  await test('(1c) cancelar id inexistente -> 404 literal', async () => {
    setUser(COMPRAS);
    const res = await request(app).post('/api/almoxarifado/compras/solicitacoes/999999/cancelar')
      .send({ motivo: 'x' });
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Solicitação não encontrada');
  });

  // ── (2) cancelar VINCULADO ──
  await test('(2) cancelar VINCULADO: 200, vinculo e informativo (pedido do core intocado)', async () => {
    setUser(COMPRAS);
    const mat = await novoMaterial(db);
    const pedidoId = await novoPedido(db);
    const solId = await novaSolicitacao(db, mat, { status: 'VINCULADO', pedido_compra_id: pedidoId });
    const antesPedido = await dbGet(db, 'SELECT * FROM pedidos_compra WHERE id = ?', [pedidoId]);

    const res = await request(app).post(`/api/almoxarifado/compras/solicitacoes/${solId}/cancelar`)
      .send({ motivo: 'Cancelado pelo comprador' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const row = await dbGet(db, 'SELECT * FROM solicitacoes_compra_almoxarifado WHERE id = ?', [solId]);
    assert.strictEqual(row.status, 'CANCELADA', JSON.stringify(row));
    assert.strictEqual(row.pedido_compra_id, pedidoId, 'o vinculo informativo permanece gravado');

    const depoisPedido = await dbGet(db, 'SELECT * FROM pedidos_compra WHERE id = ?', [pedidoId]);
    assert.deepStrictEqual(depoisPedido, antesPedido, 'cancelar nao pode mexer no pedido do core');
  });

  // ── (3) cancelar terminal ──
  await test('(3) cancelar CANCELADA/RECEBIDA -> 400 literal', async () => {
    setUser(COMPRAS);
    const mat = await novoMaterial(db);
    const solCancelada = await novaSolicitacao(db, mat, { status: 'CANCELADA' });
    const solRecebida = await novaSolicitacao(db, mat, { status: 'RECEBIDA' });

    for (const id of [solCancelada, solRecebida]) {
      const res = await request(app).post(`/api/almoxarifado/compras/solicitacoes/${id}/cancelar`)
        .send({ motivo: 'tentativa' });
      assert.strictEqual(res.status, 400, JSON.stringify(res.body));
      assert.strictEqual(res.body.error, LITERAL_TERMINAL_CANCELAR);
    }
  });

  // ── RN-01b: vincular valida as DUAS pontas ──
  await test('RN-01b: vincular valida as DUAS pontas (solicitacao e pedido)', async () => {
    setUser(COMPRAS);

    let res = await request(app).post('/api/almoxarifado/compras/solicitacoes/999999/vincular-pedido')
      .send({ pedido_compra_id: 1 });
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Solicitação não encontrada');

    const mat = await novoMaterial(db);
    const solCancelada = await novaSolicitacao(db, mat, { status: 'CANCELADA' });
    res = await request(app).post(`/api/almoxarifado/compras/solicitacoes/${solCancelada}/vincular-pedido`)
      .send({ pedido_compra_id: 1 });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, LITERAL_TERMINAL_VINCULAR);

    const solPendente = await novaSolicitacao(db, mat);
    res = await request(app).post(`/api/almoxarifado/compras/solicitacoes/${solPendente}/vincular-pedido`)
      .send({ pedido_compra_id: 888888 });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Pedido de compra não encontrado');
    const rowFantasma = await dbGet(db,
      'SELECT status, pedido_compra_id FROM solicitacoes_compra_almoxarifado WHERE id = ?', [solPendente]);
    assert.strictEqual(rowFantasma.status, 'PENDENTE', 'nao pode ter gravado pedido fantasma');
    assert.strictEqual(rowFantasma.pedido_compra_id, null, JSON.stringify(rowFantasma));

    const pedidoId = await novoPedido(db);
    res = await request(app).post(`/api/almoxarifado/compras/solicitacoes/${solPendente}/vincular-pedido`)
      .send({ pedido_compra_id: pedidoId });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const rowOk = await dbGet(db,
      'SELECT status, pedido_compra_id FROM solicitacoes_compra_almoxarifado WHERE id = ?', [solPendente]);
    assert.strictEqual(rowOk.status, 'VINCULADO', JSON.stringify(rowOk));
    assert.strictEqual(rowOk.pedido_compra_id, pedidoId, JSON.stringify(rowOk));
  });

  // ── (4) gates das tres rotas do pipeline + regressao D9 ──
  await test('(4) gates par positivo+negativo nas tres rotas do pipeline (D9)', async () => {
    const mat = await novoMaterial(db);
    const pedidoId = await novoPedido(db);

    setUser(ALMOXARIFE);
    let res = await request(app).post('/api/almoxarifado/compras/verificar-minimos').send({});
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    setUser(COMPRAS);
    res = await request(app).post('/api/almoxarifado/compras/verificar-minimos').send({});
    // D9: regressao explicita — antes ('configurar', ADMIN-only) COMPRAS levava 403 aqui.
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const solVincular = await novaSolicitacao(db, mat);
    setUser(ALMOXARIFE);
    res = await request(app).post(`/api/almoxarifado/compras/solicitacoes/${solVincular}/vincular-pedido`)
      .send({ pedido_compra_id: pedidoId });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    setUser(COMPRAS);
    res = await request(app).post(`/api/almoxarifado/compras/solicitacoes/${solVincular}/vincular-pedido`)
      .send({ pedido_compra_id: pedidoId });
    // D9: regressao explicita — vincular deixou de ser ADMIN-only.
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const solCancelar = await novaSolicitacao(db, mat);
    setUser(ALMOXARIFE);
    res = await request(app).post(`/api/almoxarifado/compras/solicitacoes/${solCancelar}/cancelar`)
      .send({ motivo: 'x' });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    setUser(COMPRAS);
    res = await request(app).post(`/api/almoxarifado/compras/solicitacoes/${solCancelar}/cancelar`)
      .send({ motivo: 'x' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  // ── (5) RECEBIDA automatica pelo caminho MINIMO real ──
  await test('(5) RECEBIDA automatica pelo caminho MINIMO real; PENDENTE nao vinculada nao fecha', async () => {
    setUser(ADMIN);
    const mat = await novoMaterial(db);
    const pedidoId = await novoPedido(db);
    await novoItemPedido(db, pedidoId, mat, 5, 10);

    const solVinculada = await novaSolicitacao(db, mat, { status: 'VINCULADO', pedido_compra_id: pedidoId });
    const solPendenteSolta = await novaSolicitacao(db, mat, { status: 'PENDENTE' }); // mesmo material, sem pedido

    const resultado = await caminhoAteProcessado(db, ADMIN, pedidoId);
    assert.strictEqual(resultado.status, 'PROCESSADO', JSON.stringify(resultado));

    const rowVinc = await dbGet(db,
      'SELECT status, recebida_em FROM solicitacoes_compra_almoxarifado WHERE id = ?', [solVinculada]);
    assert.strictEqual(rowVinc.status, 'RECEBIDA', JSON.stringify(rowVinc));
    assert.ok(rowVinc.recebida_em, 'recebida_em deveria estar preenchido');

    const auditRow = await dbGet(db, `SELECT dados_novos FROM auditoria_log_almoxarifado
      WHERE entidade = 'solicitacao_compra' AND entidade_id = ? AND acao = 'RECEBIDA'`, [solVinculada]);
    assert.ok(auditRow, 'deveria ter auditado o fechamento automatico');
    const dadosNovos = JSON.parse(auditRow.dados_novos);
    assert.strictEqual(dadosNovos.pedido_compra_id, pedidoId, JSON.stringify(dadosNovos));

    const rowSolta = await dbGet(db,
      'SELECT status FROM solicitacoes_compra_almoxarifado WHERE id = ?', [solPendenteSolta]);
    assert.strictEqual(rowSolta.status, 'PENDENTE', 'PENDENTE nunca vinculada nao fecha');
  });

  // ── (5b) aprovar direto tambem fecha; dedupe do segundo recebimento ──
  await test('(5b) aprovar SEM processarNota tambem fecha; 2o recebimento do mesmo pedido: 0 novas auditorias', async () => {
    setUser(ADMIN);
    const mat = await novoMaterial(db);
    const pedidoId = await novoPedido(db);
    await novoItemPedido(db, pedidoId, mat, 3, 10);

    const solVinculada = await novaSolicitacao(db, mat, { status: 'VINCULADO', pedido_compra_id: pedidoId });

    const { resultado } = await caminhoAteAprovado(db, ADMIN, pedidoId);
    assert.strictEqual(resultado.success, true, JSON.stringify(resultado));

    const rowDepois1 = await dbGet(db,
      'SELECT status, recebida_em FROM solicitacoes_compra_almoxarifado WHERE id = ?', [solVinculada]);
    assert.strictEqual(rowDepois1.status, 'RECEBIDA', JSON.stringify(rowDepois1));
    assert.ok(rowDepois1.recebida_em, 'recebida_em deveria estar preenchido');

    const auditAntes = await dbAll(db, `SELECT id FROM auditoria_log_almoxarifado
      WHERE entidade = 'solicitacao_compra' AND entidade_id = ? AND acao = 'RECEBIDA'`, [solVinculada]);
    assert.strictEqual(auditAntes.length, 1, JSON.stringify(auditAntes));

    // Aproximacao DECLARADA (I1, medida): o workflow nao guarda "pedido ja recebido" — um
    // segundo recebimento do MESMO pedido tambem entra no estoque, mas o AND status='VINCULADO'
    // do helper e o dedupe: nao ha mais linha VINCULADO para fechar, entao 0 auditorias novas.
    await novoItemPedido(db, pedidoId, mat, 2, 10);
    await caminhoAteAprovado(db, ADMIN, pedidoId);

    const auditDepois = await dbAll(db, `SELECT id FROM auditoria_log_almoxarifado
      WHERE entidade = 'solicitacao_compra' AND entidade_id = ? AND acao = 'RECEBIDA'`, [solVinculada]);
    assert.strictEqual(auditDepois.length, 1, 'segundo recebimento do mesmo pedido nao pode duplicar auditoria');
  });

  // ── (6) gancho nao derruba o processamento/aprovacao ──
  await test('(6) gancho nao derruba: monkeypatch fecharSolicitacoesDoPedido lancando', async () => {
    setUser(ADMIN);
    const mat = await novoMaterial(db);

    const pedidoId1 = await novoPedido(db);
    await novoItemPedido(db, pedidoId1, mat, 4, 10);
    await novaSolicitacao(db, mat, { status: 'VINCULADO', pedido_compra_id: pedidoId1 });

    const pedidoId2 = await novoPedido(db);
    await novoItemPedido(db, pedidoId2, mat, 4, 10);
    await novaSolicitacao(db, mat, { status: 'VINCULADO', pedido_compra_id: pedidoId2 });

    const original = purchaseService.fecharSolicitacoesDoPedido;
    purchaseService.fecharSolicitacoesDoPedido = async () => { throw new Error('boom'); };
    try {
      const resultadoProcessado = await caminhoAteProcessado(db, ADMIN, pedidoId1);
      assert.strictEqual(resultadoProcessado.status, 'PROCESSADO', JSON.stringify(resultadoProcessado));

      const { resultado: resultadoAprovado } = await caminhoAteAprovado(db, ADMIN, pedidoId2);
      assert.strictEqual(resultadoAprovado.success, true, JSON.stringify(resultadoAprovado));
    } finally {
      purchaseService.fecharSolicitacoesDoPedido = original;
    }
  });

  // ── (I6) o ramo de aprovar que DELEGA para processarNota nao pode chamar o gancho de novo —
  // exercita aprovarRecebimento quando o status JA e EM_ENTRADA_NF/ENCAMINHADO_FATURAMENTO
  // (o ramo delegante, linha ~688), diferente do (5b) que exercita o ramo direto (status
  // RECEBIDO). Uma so auditoria RECEBIDA, mesmo passando por aprovar (que delega) em vez de
  // processarNota direto.
  await test('(I6) aprovar que delega para processarNota nao duplica o fechamento', async () => {
    setUser(ADMIN);
    const mat = await novoMaterial(db);
    const pedidoId = await novoPedido(db);
    await novoItemPedido(db, pedidoId, mat, 4, 10);
    const solId = await novaSolicitacao(db, mat, { status: 'VINCULADO', pedido_compra_id: pedidoId });

    const rec = await receiptService.criarRecebimento(db, ADMIN,
      { tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedidoId });
    await receiptService.avancarWorkflow(db, ADMIN, rec.id, 'encaminhar_compras');
    await receiptService.avancarWorkflow(db, ADMIN, rec.id, 'finalizar_compras');
    await receiptService.salvarDadosFiscal(db, ADMIN, rec.id, {
      nota_fiscal: `NF-${rec.id}`, data_emissao_nf: '2026-08-01', data_entrada_nf: '2026-08-02',
      valor_total_nota: 10, fornecedor_nome: 'Fornecedor Teste SCV',
    });
    // Aqui o status e ENCAMINHADO_FATURAMENTO -> EM_ENTRADA_NF (salvarDadosFiscal move para
    // EM_ENTRADA_NF). aprovarRecebimento cai no ramo que DELEGA para processarNota.
    // Espiao de CHAMADAS (nao so de resultado): o `AND status='VINCULADO'` do proprio helper
    // deduplica o EFEITO de uma segunda chamada, entao contar auditorias nao provaria que o
    // ramo delegante deixou de chamar de novo (I6) — só a contagem de INVOCACOES prova.
    const original = purchaseService.fecharSolicitacoesDoPedido;
    let chamadas = 0;
    purchaseService.fecharSolicitacoesDoPedido = async (...args) => {
      chamadas += 1;
      return original(...args);
    };
    let resultado;
    try {
      resultado = await receiptService.aprovarRecebimento(db, ADMIN, rec.id, {});
    } finally {
      purchaseService.fecharSolicitacoesDoPedido = original;
    }
    assert.strictEqual(resultado.status, 'PROCESSADO', JSON.stringify(resultado));
    assert.strictEqual(chamadas, 1,
      'o ramo delegante NAO pode chamar fecharSolicitacoesDoPedido de novo — ja rodou dentro de processarNota (I6)');

    const rowSol = await dbGet(db,
      'SELECT status, recebida_em FROM solicitacoes_compra_almoxarifado WHERE id = ?', [solId]);
    assert.strictEqual(rowSol.status, 'RECEBIDA', JSON.stringify(rowSol));

    const audit = await dbAll(db, `SELECT id FROM auditoria_log_almoxarifado
      WHERE entidade = 'solicitacao_compra' AND entidade_id = ? AND acao = 'RECEBIDA'`, [solId]);
    assert.strictEqual(audit.length, 1, JSON.stringify(audit));
  });

  // ── controle (i): o gancho so pode fechar a solicitacao DEPOIS que o recebimento realmente
  // chegou a PROCESSADO — se a entrada de estoque falhar (nota recusada por item invalido), a
  // solicitacao TEM de continuar VINCULADO. Prova que a posicao do gancho (depois de
  // darEntradaEstoque e do UPDATE de status) importa de verdade.
  await test('(i, controle) falha em darEntradaEstoque nao fecha a solicitacao antes da hora', async () => {
    setUser(ADMIN);
    const mat = await novoMaterial(db);
    const pedidoId = await novoPedido(db);
    await novoItemPedido(db, pedidoId, mat, 5, 10);
    const solId = await novaSolicitacao(db, mat, { status: 'VINCULADO', pedido_compra_id: pedidoId });

    const rec = await receiptService.criarRecebimento(db, ADMIN,
      { tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedidoId });
    await receiptService.avancarWorkflow(db, ADMIN, rec.id, 'encaminhar_compras');
    await receiptService.avancarWorkflow(db, ADMIN, rec.id, 'finalizar_compras');
    await receiptService.salvarDadosFiscal(db, ADMIN, rec.id, {
      nota_fiscal: `NF-${rec.id}`, data_emissao_nf: '2026-08-01', data_entrada_nf: '2026-08-02',
      valor_total_nota: 10, fornecedor_nome: 'Fornecedor Teste SCV',
    });

    // Material fica inativo DEPOIS de tudo pronto — darEntradaEstoque recusa a nota inteira.
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [mat]);

    await assert.rejects(() => receiptService.processarNota(db, ADMIN, rec.id), /inativo/i);

    const rowSol = await dbGet(db,
      'SELECT status, recebida_em FROM solicitacoes_compra_almoxarifado WHERE id = ?', [solId]);
    assert.strictEqual(rowSol.status, 'VINCULADO',
      'a solicitacao nao pode fechar se o recebimento nao chegou a PROCESSADO');
    assert.strictEqual(rowSol.recebida_em, null, JSON.stringify(rowSol));
  });

  // ── (7) posicao: material com falta volta a sugestao ──
  await test('(7) posicao: material com falta volta a sugestao apos RECEBIDA e apos CANCELADA', async () => {
    setUser(ADMIN);

    // 7a: RECEBIDA — a solicitacao pede 100 (cobre o ponto enquanto VINCULADO), mas o pedido
    // real so entrega 5 no estoque: o material continua faltando depois de RECEBIDA.
    const matA = await novoMaterial(db, { minima: 100, maxima: 100 });
    const pedidoA = await novoPedido(db);
    await novoItemPedido(db, pedidoA, matA, 5, 10);
    await novaSolicitacao(db, matA, { quantidade: 100, status: 'VINCULADO', pedido_compra_id: pedidoA });

    let sug = await request(app).get('/api/almoxarifado/reposicao/sugestoes');
    assert.strictEqual(itemDe(sug, matA), undefined, 'a_caminho deveria cobrir o ponto enquanto VINCULADO');

    await caminhoAteProcessado(db, ADMIN, pedidoA);

    sug = await request(app).get('/api/almoxarifado/reposicao/sugestoes');
    const itemA = itemDe(sug, matA);
    assert.ok(itemA, 'material com falta deveria voltar a sugestao apos RECEBIDA');

    // 7b: CANCELADA.
    const matB = await novoMaterial(db, { minima: 50, maxima: 50 });
    const solB = await novaSolicitacao(db, matB, { quantidade: 50, status: 'PENDENTE' });

    sug = await request(app).get('/api/almoxarifado/reposicao/sugestoes');
    assert.strictEqual(itemDe(sug, matB), undefined, 'a_caminho deveria cobrir o ponto enquanto PENDENTE');

    setUser(COMPRAS);
    const resCancel = await request(app).post(`/api/almoxarifado/compras/solicitacoes/${solB}/cancelar`)
      .send({ motivo: 'nao precisa mais' });
    assert.strictEqual(resCancel.status, 200, JSON.stringify(resCancel.body));

    sug = await request(app).get('/api/almoxarifado/reposicao/sugestoes');
    const itemB = itemDe(sug, matB);
    assert.ok(itemB, 'material deveria voltar a sugestao apos CANCELADA');
  });

  await test('(I-1, revisao) DUAS solicitacoes VINCULADO no mesmo pedido: as duas fecham, DUAS auditorias', async () => {
    // Sabotagem sobrevivente da revisao: mover a auditoria para FORA do laco (uma por chamada
    // em vez de uma por linha) ficava 13/13 verde — e "o pedido agrupa N solicitacoes" e o
    // caso PRINCIPAL do design (D2). Este teste porta o probe P3 do revisor.
    setUser(ADMIN);
    const mat1 = await novoMaterial(db);
    const mat2 = await novoMaterial(db);
    const ped = await novoPedido(db);
    const solA = await novaSolicitacao(db, mat1, { status: 'VINCULADO', pedido_compra_id: ped });
    const solB = await novaSolicitacao(db, mat2, { status: 'VINCULADO', pedido_compra_id: ped });

    await purchaseService.fecharSolicitacoesDoPedido(db, ADMIN, ped);

    for (const solId of [solA, solB]) {
      const row = await dbGet(db, 'SELECT status, recebida_em FROM solicitacoes_compra_almoxarifado WHERE id = ?', [solId]);
      assert.strictEqual(row.status, 'RECEBIDA', JSON.stringify(row));
      assert.ok(row.recebida_em, `sol ${solId}: recebida_em ausente`);
      const aud = await dbAll(db,
        `SELECT id FROM auditoria_log_almoxarifado WHERE entidade = 'solicitacao_compra' AND entidade_id = ? AND acao = 'RECEBIDA'`,
        [solId]);
      assert.strictEqual(aud.length, 1, `sol ${solId}: esperava exatamente 1 auditoria, veio ${aud.length}`);
    }
  });

  await test('(N-1, revisao) motivo so-espacos NAO cancela', async () => {
    setUser(COMPRAS);
    const mat = await novoMaterial(db);
    const solId = await novaSolicitacao(db, mat);
    const res = await request(app).post(`/api/almoxarifado/compras/solicitacoes/${solId}/cancelar`)
      .send({ motivo: '   ' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Justificativa obrigatória para cancelar a solicitação');
    const row = await dbGet(db, 'SELECT status FROM solicitacoes_compra_almoxarifado WHERE id = ?', [solId]);
    assert.strictEqual(row.status, 'PENDENTE', JSON.stringify(row));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
