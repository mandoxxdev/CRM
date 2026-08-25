/**
 * Etapa 14, Task 2 — RN-04: contexto do comprador.
 * GET /api/almoxarifado/compras/contexto-material/:id (gate gerenciar_reposicao).
 *
 * MOLDE DO HARNESS (Global Constraints da Etapa 14, Fase 2 C5 — pedidos_compra NAO existe no
 * testApp): stub ENDURECIDO (fornecedor_id INTEGER NOT NULL, status TEXT DEFAULT 'pendente' —
 * pedido N-2 da revisao da Task 1). itens_pedido_compra JA vem do initSchema.
 *
 * A regua do ultimo_custo_entrada e a EMENDADA da Fase 2 (design RN-04): par (movimentacao de
 * entrada nao-cancelada x recebimentos_material_itens_almoxarifado.valor_unitario > 0), com
 * `ORDER BY mv.created_at DESC, mv.id DESC LIMIT 1`. NUNCA custo_medio nem
 * materiais.custo_unitario.
 *
 * Executar: cd server && node tests/api/compraContextoMaterial.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');
const stockService = require('../../services/almoxarifado/stockService');

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
  const m = { codigo: `CCM-${seq}`, nome: `Material CCM ${seq}`, unidade: 'UN', qtd: 0,
    reservada: 0, bloqueada: 0, inspecao: 0, terceiros: 0,
    custo_unitario: 0, custo_medio: 0, cliente_id: null, ...over };
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, quantidade_reservada, quantidade_bloqueada,
       quantidade_em_inspecao, quantidade_em_terceiros, custo_unitario, custo_medio,
       proprietario_cliente_id)
     VALUES (?,?,?,?,1,?,?,?,?,?,?,?)`,
    [m.codigo, m.nome, m.unidade, m.qtd, m.reservada, m.bloqueada, m.inspecao, m.terceiros,
     m.custo_unitario, m.custo_medio, m.cliente_id]);
  return r.lastID;
}

async function novoPedido(db, over = {}) {
  seq += 1;
  const p = { numero: `PC-CCM-${seq}`, fornecedor_id: 1, valor_total: 0, status: 'pendente',
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

async function saidaNoLivro(db, materialId, quantidade, { diasAtras = 1, tipo = 'SAIDA', cancelado = 0 } = {}) {
  await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
      (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, usuario_id, cancelado, created_at)
     VALUES (?,?,?,0,0,1,?, datetime('now', ?))`,
    [materialId, tipo, quantidade, cancelado, `-${diasAtras} days`]);
}

// Fixture crua da entrada x item de recebimento (RN-04): usada quando o teste precisa controlar
// o `created_at` a dedo (empate no mesmo segundo) — o par nao exige linha real em
// recebimentos_material_almoxarifado, so o JOIN por recebimento_id+material_id importa.
async function entradaCrua(db, materialId, { recebimentoId, valorUnitario, createdAt, cancelado = 0, tipo = 'ENTRADA_COMPRA' }) {
  const r = await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
      (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, usuario_id, cancelado, recebimento_id, created_at)
     VALUES (?,?,1,0,1,1,?,?,?)`,
    [materialId, tipo, cancelado, recebimentoId, createdAt]);
  await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, valor_unitario)
     VALUES (?,?,1,1,?)`,
    [recebimentoId, materialId, valorUnitario]);
  return r.lastID;
}

// MOLDE DO HARNESS (Global Constraints): caminho MINIMO real ate PROCESSADO.
async function caminhoAteProcessado(db, user, pedidoId) {
  const rec = await receiptService.criarRecebimento(db, user,
    { tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedidoId });
  await receiptService.avancarWorkflow(db, user, rec.id, 'encaminhar_compras');
  await receiptService.avancarWorkflow(db, user, rec.id, 'finalizar_compras');
  await receiptService.salvarDadosFiscal(db, user, rec.id, {
    nota_fiscal: `NF-${rec.id}`, data_emissao_nf: '2026-08-01', data_entrada_nf: '2026-08-02',
    valor_total_nota: 10, fornecedor_nome: 'Fornecedor Teste CCM',
  });
  const resultado = await receiptService.processarNota(db, user, rec.id);
  return { recId: rec.id, resultado };
}

function contexto(app, materialId) {
  return request(app).get(`/api/almoxarifado/compras/contexto-material/${materialId}`);
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  // MOLDE DO HARNESS ENDURECIDO (N-2 da revisao da Task 1): fornecedor_id NOT NULL, status com
  // default 'pendente' — mais fiel ao schema real de pedidos_compra do core.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS pedidos_compra (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE,
    fornecedor_id INTEGER NOT NULL,
    valor_total REAL DEFAULT 0,
    status TEXT DEFAULT 'pendente',
    data_pedido DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await dbRun(db, `INSERT INTO fornecedores (id, razao_social, nome_fantasia, cnpj) VALUES (1, 'Fornecedor CCM', 'Fornecedor CCM', '00000000000000')`);

  setUser(COMPRAS);

  // ── (1) shape completo com numeros EXATOS ──
  await test('(1) shape completo com numeros exatos (disponivel/reservado/em_terceiros/consumo/solicitacoes)', async () => {
    const mat = await novoMaterial(db, { qtd: 100, reservada: 10, bloqueada: 2, inspecao: 3, terceiros: 5 });
    // disponivel = 100 - 10 - 2 - 3 - 5 = 80

    await saidaNoLivro(db, mat, 90, { diasAtras: 1 });   // dentro da janela default (90 dias)
    await saidaNoLivro(db, mat, 900, { diasAtras: 200 }); // fora da janela
    await saidaNoLivro(db, mat, 900, { diasAtras: 5, cancelado: 1 }); // cancelada, fora
    // consumo_janela = 90; janela = 90 dias => consumo_medio_diario = 1

    const solAberta1 = await novaSolicitacao(db, mat, { quantidade: 20, status: 'PENDENTE' });
    const pedidoVinc = await novoPedido(db);
    const solAberta2 = await novaSolicitacao(db, mat, { quantidade: 30, status: 'VINCULADO', pedido_compra_id: pedidoVinc });
    await novaSolicitacao(db, mat, { quantidade: 40, status: 'CANCELADA' }); // fora

    const res = await contexto(app, mat);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.disponivel, 80, JSON.stringify(res.body));
    assert.strictEqual(res.body.reservado, 10, JSON.stringify(res.body));
    assert.strictEqual(res.body.em_terceiros, 5, JSON.stringify(res.body));
    assert.strictEqual(res.body.consumo_medio_diario, 1, JSON.stringify(res.body));
    assert.strictEqual(res.body.janela_dias, 90, JSON.stringify(res.body));
    assert.strictEqual(res.body.ultimo_custo_entrada, null, JSON.stringify(res.body));
    assert.strictEqual(res.body.proprietario_cliente, null, JSON.stringify(res.body));
    const matRow = await dbGet(db, 'SELECT codigo, nome, unidade FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.deepStrictEqual(res.body.material,
      { id: mat, codigo: matRow.codigo, nome: matRow.nome, unidade: matRow.unidade },
      JSON.stringify(res.body.material));

    const ids = res.body.solicitacoes_abertas.map((s) => s.id).sort((a, b) => a - b);
    assert.deepStrictEqual(ids, [solAberta1, solAberta2].sort((a, b) => a - b), JSON.stringify(res.body.solicitacoes_abertas));
    const s2 = res.body.solicitacoes_abertas.find((s) => s.id === solAberta2);
    assert.strictEqual(s2.status, 'VINCULADO', JSON.stringify(s2));
    assert.strictEqual(s2.quantidade, 30, JSON.stringify(s2));
    assert.strictEqual(s2.pedido_compra_id, pedidoVinc, JSON.stringify(s2));
    assert.ok(s2.created_at, 'created_at deveria vir preenchido');
  });

  // ── (2) ultimo_custo_entrada da NF REAL, distinto de custo_medio e de custo_unitario (fixture tripla) ──
  await test('(2) ultimo_custo_entrada vem da NF real, distinto de custo_medio (fixture com DUAS entradas)', async () => {
    const mat = await novoMaterial(db, { qtd: 0, custo_unitario: 999 }); // decoy no cadastro

    const pedido1 = await novoPedido(db);
    await novoItemPedido(db, pedido1, mat, 10, 10); // entrada 1: 10 un a R$10 -> custo_medio vira 10
    await caminhoAteProcessado(db, ADMIN, pedido1);

    const pedido2 = await novoPedido(db);
    await novoItemPedido(db, pedido2, mat, 10, 25); // entrada 2 (ULTIMA): 10 un a R$25
    await caminhoAteProcessado(db, ADMIN, pedido2);
    // custo_medio ponderado = (10*10 + 10*25) / 20 = 17.5 -> DISTINTO de 25 (ultimo) e de 999 (cadastro)

    const materialRow = await dbGet(db, 'SELECT custo_medio, custo_unitario FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(materialRow.custo_medio, 17.5, JSON.stringify(materialRow));
    assert.notStrictEqual(materialRow.custo_medio, 25, 'controle: custo_medio TEM de ser distinto do ultimo valor da NF');

    const res = await contexto(app, mat);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.ultimo_custo_entrada, 'ultimo_custo_entrada nao pode ser null');
    assert.strictEqual(res.body.ultimo_custo_entrada.valor, 25, JSON.stringify(res.body.ultimo_custo_entrada));
    assert.ok(res.body.ultimo_custo_entrada.data, 'data deveria vir preenchida');
  });

  // ── (3) duas entradas no MESMO segundo -> mv.id DESC decide ──
  await test('(3) duas entradas no MESMO segundo (mesmo created_at): mv.id DESC decide', async () => {
    const mat = await novoMaterial(db, { qtd: 0 });
    const mesmoInstante = '2026-08-10 12:00:00';
    await entradaCrua(db, mat, { recebimentoId: 90001, valorUnitario: 11, createdAt: mesmoInstante });
    // A segunda linha tem o MESMO created_at mas mv.id MAIOR (inserida depois) -> deveria vencer.
    await entradaCrua(db, mat, { recebimentoId: 90002, valorUnitario: 33, createdAt: mesmoInstante });

    const res = await contexto(app, mat);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.ultimo_custo_entrada.valor, 33,
      'sem o desempate por mv.id DESC o teste seria intermitente (created_at empatado)');
  });

  // ── (4) entrada CANCELADA nao e o ultimo custo (cancelar a movimentacao da NF real) ──
  await test('(4) entrada CANCELADA nao conta: cancelar a movimentacao da NF e ver o anterior voltar', async () => {
    const mat = await novoMaterial(db, { qtd: 0 });

    const pedido1 = await novoPedido(db);
    await novoItemPedido(db, pedido1, mat, 10, 10);
    await caminhoAteProcessado(db, ADMIN, pedido1);

    const pedido2 = await novoPedido(db);
    await novoItemPedido(db, pedido2, mat, 10, 25);
    const { recId: recId2 } = await caminhoAteProcessado(db, ADMIN, pedido2);

    let res = await contexto(app, mat);
    assert.strictEqual(res.body.ultimo_custo_entrada.valor, 25, JSON.stringify(res.body));

    const mov2 = await dbGet(db,
      `SELECT id FROM movimentacoes_almoxarifado WHERE recebimento_id = ? AND material_id = ? AND tipo = 'ENTRADA_COMPRA'`,
      [recId2, mat]);
    assert.ok(mov2, 'deveria existir a movimentacao da segunda NF');
    await stockService.cancelarMovimentacao(db, ADMIN, mov2.id, 'NF lancada com valor errado');

    res = await contexto(app, mat);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.ultimo_custo_entrada.valor, 10,
      'com a entrada de 25 cancelada, o ultimo custo tem de voltar para o da entrada anterior (10)');
  });

  // ── (5) consumo muda com a config da janela ──
  await test('(5) consumo_medio_diario e janela_dias mudam quando a config muda', async () => {
    const mat = await novoMaterial(db, { qtd: 0 });
    await saidaNoLivro(db, mat, 30, { diasAtras: 1 }); // 30 em 30 dias = 1/dia se janela=30

    const antes = await contexto(app, mat);
    assert.strictEqual(antes.body.janela_dias, 90, JSON.stringify(antes.body));
    assert.strictEqual(antes.body.consumo_medio_diario, Number((30 / 90).toFixed(4)), JSON.stringify(antes.body));

    await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = '30' WHERE chave = 'reposicao_janela_consumo_dias'`);
    try {
      const depois = await contexto(app, mat);
      assert.strictEqual(depois.body.janela_dias, 30, JSON.stringify(depois.body));
      assert.strictEqual(depois.body.consumo_medio_diario, 1, JSON.stringify(depois.body));
    } finally {
      await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = '90' WHERE chave = 'reposicao_janela_consumo_dias'`);
    }
  });

  // ── (6) solicitacoes abertas SO PENDENTE/VINCULADO (terminais fora) ──
  await test('(6) solicitacoes_abertas SO PENDENTE/VINCULADO — CANCELADA e RECEBIDA ficam fora', async () => {
    const mat = await novoMaterial(db, { qtd: 0 });
    const pend = await novaSolicitacao(db, mat, { status: 'PENDENTE' });
    const vinc = await novaSolicitacao(db, mat, { status: 'VINCULADO', pedido_compra_id: await novoPedido(db) });
    await novaSolicitacao(db, mat, { status: 'CANCELADA' });
    await novaSolicitacao(db, mat, { status: 'RECEBIDA' });

    const res = await contexto(app, mat);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const ids = res.body.solicitacoes_abertas.map((s) => s.id).sort((a, b) => a - b);
    assert.deepStrictEqual(ids, [pend, vinc].sort((a, b) => a - b),
      'terminais (CANCELADA/RECEBIDA) nao podem aparecer em solicitacoes_abertas');
  });

  // ── (7) material de cliente -> 200 com proprietario_cliente e solicitacoes_abertas [] ──
  await test('(7) material de cliente -> 200 com proprietario_cliente e solicitacoes_abertas []', async () => {
    const cli = await dbRun(db, `INSERT INTO clientes (razao_social) VALUES ('Cliente CCM Ltda')`);
    const clienteId = cli.lastID;
    const mat = await novoMaterial(db, { qtd: 50, reservada: 0, terceiros: 0, cliente_id: clienteId });

    const res = await contexto(app, mat);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body.proprietario_cliente, { id: clienteId, razao_social: 'Cliente CCM Ltda' },
      JSON.stringify(res.body.proprietario_cliente));
    assert.deepStrictEqual(res.body.solicitacoes_abertas, [], JSON.stringify(res.body.solicitacoes_abertas));
    assert.strictEqual(res.body.disponivel, 50, JSON.stringify(res.body));
  });

  // ── (8) id inexistente -> 404 literal ──
  await test('(8) id inexistente -> 404 Material não encontrado', async () => {
    const res = await contexto(app, 999999);
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Material não encontrado');
  });

  // ── (9) gates par positivo+negativo ──
  await test('(9) gate gerenciar_reposicao: ALMOXARIFE 403, COMPRAS 200', async () => {
    const mat = await novoMaterial(db, { qtd: 10 });

    setUser(ALMOXARIFE);
    let res = await contexto(app, mat);
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));

    setUser(COMPRAS);
    res = await contexto(app, mat);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
