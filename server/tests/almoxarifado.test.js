/**
 * Testes do módulo Almoxarifado v3
 * Executar: node server/tests/almoxarifado.test.js
 */
const sqlite3 = require('sqlite3').verbose();
const assert = require('assert');
const { initSchema } = require('../services/almoxarifado/schema');
const { dbRun, dbGet, dbAll } = require('../services/almoxarifado/db');
const stockService = require('../services/almoxarifado/stockService');
const returnService = require('../services/almoxarifado/returnService');
const clientMaterialService = require('../services/almoxarifado/clientMaterialService');
const receiptService = require('../services/almoxarifado/receiptService');
const requisitionService = require('../services/almoxarifado/requisitionService');
const sectorMaterialService = require('../services/almoxarifado/sectorMaterialService');
const { can, PERFIS } = require('../services/almoxarifado/permissions');
const alertService = require('../services/almoxarifado/alertService');
const reminderService = require('../services/almoxarifado/requisitionReminderService');
const valueApprovalService = require('../services/almoxarifado/requisitionValueApprovalService');

const userAdmin = { id: 1, nome: 'Admin Test', role: 'admin' };
const userAlmox = { id: 2, nome: 'Almox Test', role: 'user', perfil_almoxarifado: PERFIS.ALMOXARIFE };
const userProd = { id: 3, nome: 'Prod Test', role: 'user', perfil_almoxarifado: PERFIS.PRODUCAO };

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn().then(() => {
    passed++;
    console.log(`  ✓ ${name}`);
  }).catch((e) => {
    failed++;
    console.error(`  ✗ ${name}: ${e.message}`);
  });
}

async function setupDb() {
  const db = new sqlite3.Database(':memory:');
  await dbRun(db, `CREATE TABLE materiais_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT UNIQUE, nome TEXT, unidade TEXT DEFAULT 'UN',
    quantidade_atual REAL DEFAULT 0, quantidade_minima REAL DEFAULT 0, quantidade_maxima REAL DEFAULT 0,
    quantidade_reservada REAL DEFAULT 0, quantidade_bloqueada REAL DEFAULT 0, quantidade_em_inspecao REAL DEFAULT 0,
    custo_unitario REAL DEFAULT 0, custo_medio REAL DEFAULT 0, ativo INTEGER DEFAULT 1, categoria TEXT DEFAULT 'OUTROS',
    material_critico INTEGER DEFAULT 0, controle_certificado INTEGER DEFAULT 0, permite_saldo_negativo INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await dbRun(db, `CREATE TABLE movimentacoes_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT, material_id INTEGER, tipo TEXT, quantidade REAL,
    saldo_anterior REAL, saldo_posterior REAL, motivo TEXT, referencia TEXT, observacoes TEXT,
    usuario_id INTEGER, usuario_nome TEXT, cancelado INTEGER DEFAULT 0,
    localizacao_origem_id INTEGER, localizacao_destino_id INTEGER, lote TEXT, unidade TEXT,
    projeto_id INTEGER, os_id INTEGER, cliente_id INTEGER, documento_vinculado TEXT, justificativa TEXT,
    reserva_id INTEGER, recebimento_id INTEGER, requisicao_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await dbRun(db, `CREATE TABLE configuracoes_almoxarifado (chave TEXT UNIQUE, valor TEXT, descricao TEXT)`);
  await dbRun(db, `CREATE TABLE localizacoes_almoxarifado (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, descricao TEXT, tipo TEXT, setor TEXT, parent_id INTEGER, subgrupo TEXT, ativo INTEGER DEFAULT 1)`);
  await dbRun(db, `CREATE TABLE conferencias_almoxarifado (id INTEGER PRIMARY KEY, numero TEXT, status TEXT)`);
  await dbRun(db, `CREATE TABLE itens_conferencia_almoxarifado (id INTEGER PRIMARY KEY, conferencia_id INTEGER, material_id INTEGER, quantidade_sistema REAL, divergencia REAL)`);
  await dbRun(db, `CREATE TABLE tipos_material_almoxarifado (id INTEGER PRIMARY KEY, nome TEXT)`);
  await dbRun(db, `CREATE TABLE clientes (id INTEGER PRIMARY KEY, razao_social TEXT)`);
  await initSchema(db);
  await dbRun(db, `INSERT OR IGNORE INTO configuracoes_almoxarifado (chave, valor) VALUES ('permite_saldo_negativo_global', '0')`);
  await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('A-01', 'Prateleira A')`);
  return db;
}

async function criarMaterial(db, codigo, qtd = 100, custo = 0) {
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, quantidade_minima, custo_unitario) VALUES (?,?,?,?,?)`,
    [codigo, `Material ${codigo}`, qtd, 10, custo]);
  return r.lastID;
}

async function setupLiberacaoValor(db, { limite = 500, aprovadorIds = [10] } = {}) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1
  )`);
  await dbRun(db, `INSERT OR IGNORE INTO usuarios (id, nome, email) VALUES (10, 'Aprovador Valor', 'aprovador@test.com')`);
  await dbRun(db, `INSERT OR IGNORE INTO usuarios (id, nome, email) VALUES (1, 'Solicitante', 'sol@test.com')`);
  await dbRun(db, `INSERT OR REPLACE INTO configuracoes_almoxarifado (chave, valor) VALUES ('liberacao_valor_ativo', '1')`);
  await dbRun(db, `INSERT OR REPLACE INTO configuracoes_almoxarifado (chave, valor) VALUES ('liberacao_valor_limite', ?)`, [String(limite)]);
  await dbRun(db, `INSERT OR REPLACE INTO configuracoes_almoxarifado (chave, valor) VALUES ('liberacao_valor_aprovadores', ?)`, [JSON.stringify(aprovadorIds)]);
}

async function criarRequisicaoComItens(db, { numero, status = 'PENDENTE', itens = [] }) {
  const reqRes = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
    (numero, solicitante_id, solicitante_nome, status) VALUES (?, 1, 'Teste', ?)`, [numero, status]);
  for (const item of itens) {
    await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada) VALUES (?, ?, ?)`,
      [reqRes.lastID, item.material_id, item.qty]);
  }
  return reqRes.lastID;
}

async function criarRequisicaoPendente(db, { numero, updatedOffset = '-25 hours', ultimoLembreteOffset = null } = {}) {
  const matId = await criarMaterial(db, `RM-${Date.now()}-${Math.random()}`, 50);
  const n = numero || `REQ-L-${Date.now()}`;
  const ultimoSql = ultimoLembreteOffset
    ? `datetime('now', '${ultimoLembreteOffset}')`
    : 'NULL';
  const reqRes = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
    (numero, solicitante_id, solicitante_nome, setor, status, updated_at, ultimo_lembrete_enviado)
    VALUES (?,?,?,?, 'PENDENTE', datetime('now', ?), ${ultimoSql})`,
    [n, 1, 'Solicitante Test', 'Produção', updatedOffset]);
  await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada)
    VALUES (?,?,5)`, [reqRes.lastID, matId]);
  return dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [reqRes.lastID]);
}

async function run() {
  console.log('\n🧪 Testes Almoxarifado v3\n');
  const db = await setupDb();

  await test('Entrada de material aumenta saldo', async () => {
    const id = await criarMaterial(db, 'T-001', 50);
    await stockService.registrarMovimentacao(db, userAlmox, { material_id: id, tipo: 'ENTRADA', quantidade: 25, motivo: 'Teste' });
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(m.quantidade_atual, 75);
  });

  await test('Saída de material reduz saldo', async () => {
    const id = await criarMaterial(db, 'T-002', 100);
    await stockService.registrarMovimentacao(db, userAlmox, {
      material_id: id, tipo: 'SAIDA_PRODUCAO', quantidade: 30, os_id: 1, motivo: 'OS-1',
    });
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(m.quantidade_atual, 70);
  });

  await test('Bloqueia saldo negativo', async () => {
    const id = await criarMaterial(db, 'T-003', 5);
    let erro = false;
    try {
      await stockService.registrarMovimentacao(db, userAlmox, {
        material_id: id, tipo: 'SAIDA', quantidade: 10, os_id: 1,
      });
    } catch (e) { erro = e.status === 400; }
    assert.strictEqual(erro, true);
  });

  await test('Reserva por OS reduz disponível', async () => {
    const id = await criarMaterial(db, 'T-004', 100);
    await stockService.criarReserva(db, userAlmox, { material_id: id, quantidade: 20, os_id: 5 });
    const m = await dbGet(db, 'SELECT quantidade_reservada FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(m.quantidade_reservada, 20);
  });

  await test('Liberação de reserva', async () => {
    const id = await criarMaterial(db, 'T-005', 100);
    const res = await stockService.criarReserva(db, userAlmox, { material_id: id, quantidade: 15, os_id: 6 });
    await stockService.liberarReserva(db, userAlmox, res.id);
    const r = await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [res.id]);
    assert.strictEqual(r.status, 'LIBERADA');
  });

  await test('Devolução ao estoque', async () => {
    const id = await criarMaterial(db, 'T-006', 80);
    await returnService.registrarDevolucao(db, userAlmox, {
      material_id: id, quantidade: 10, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', origem_os_id: 1,
    });
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(m.quantidade_atual, 90);
  });

  await test('Transferência entre locais', async () => {
    const id = await criarMaterial(db, 'T-007', 50);
    const locs = await dbAll(db, 'SELECT id FROM localizacoes_almoxarifado');
    const loc2 = await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo) VALUES ('B-01')`);
    await stockService.getOrCreateSaldo(db, id, locs[0].id);
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = 50 WHERE material_id = ? AND localizacao_id = ?', [id, locs[0].id]);
    await stockService.registrarMovimentacao(db, userAlmox, {
      material_id: id, tipo: 'TRANSFERENCIA', quantidade: 20,
      localizacao_origem_id: locs[0].id, localizacao_destino_id: loc2.lastID,
    });
    const saldoOrigem = await dbGet(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?',
      [id, locs[0].id]);
    assert.strictEqual(saldoOrigem.quantidade, 30);
  });

  await test('Material bloqueado não pode sair', async () => {
    const id = await criarMaterial(db, 'T-008', 100);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 100 WHERE id = ?', [id]);
    let erro = false;
    try {
      await stockService.registrarMovimentacao(db, userAlmox, {
        material_id: id, tipo: 'SAIDA_PRODUCAO', quantidade: 10, os_id: 1,
      });
    } catch (e) { erro = e.status === 400; }
    assert.strictEqual(erro, true);
  });

  await test('Material inativo não movimenta', async () => {
    const id = await criarMaterial(db, 'T-009', 50);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [id]);
    let erro = false;
    try {
      await stockService.registrarMovimentacao(db, userAlmox, { material_id: id, tipo: 'ENTRADA', quantidade: 5 });
    } catch (e) { erro = e.status === 400; }
    assert.strictEqual(erro, true);
  });

  await test('Material do cliente — consumo', async () => {
    await dbRun(db, `INSERT INTO clientes (id, razao_social) VALUES (1, 'Cliente Teste')`);
    const r = await clientMaterialService.registrarMaterialCliente(db, userAlmox, {
      cliente_id: 1, descricao: 'Chapa cliente', quantidade_recebida: 100,
    });
    await clientMaterialService.consumirMaterialCliente(db, userAlmox, r.id, 30);
    const m = await dbGet(db, 'SELECT quantidade_saldo FROM materiais_cliente_almoxarifado WHERE id = ?', [r.id]);
    assert.strictEqual(m.quantidade_saldo, 70);
  });

  await test('Permissões — produção pode requisitar', async () => {
    assert.strictEqual(can(userProd, 'requisitar'), true);
    assert.strictEqual(can(userProd, 'ajustar_estoque'), false);
  });

  await test('Permissões — admin pode ajustar', async () => {
    assert.strictEqual(can(userAdmin, 'ajustar_estoque'), true);
    assert.strictEqual(can(userAdmin, 'separar_emitir'), true);
  });

  await test('Auditoria registrada em movimentação', async () => {
    const id = await criarMaterial(db, 'T-010', 10);
    await stockService.registrarMovimentacao(db, userAlmox, { material_id: id, tipo: 'ENTRADA', quantidade: 5, motivo: 'Audit' });
    const logs = await dbAll(db, "SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'movimentacao'");
    assert.ok(logs.length > 0);
  });

  await test('Recebimento e aprovação', async () => {
    const id = await criarMaterial(db, 'T-011', 0);
    const rec = await receiptService.criarRecebimento(db, userAlmox, {
      nota_fiscal: 'NF-123', itens: [{ material_id: id, quantidade: 25 }],
    });
    await receiptService.aprovarRecebimento(db, userAlmox, rec.id);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(m.quantidade_atual, 25);
  });

  await test('Workflow NF — almoxarifado até contas a pagar', async () => {
    await dbRun(db, `CREATE TABLE IF NOT EXISTS contas_pagar (
      id INTEGER PRIMARY KEY AUTOINCREMENT, descricao TEXT, fornecedor TEXT, valor REAL,
      data_vencimento DATE, status TEXT DEFAULT 'pendente', categoria TEXT, observacoes TEXT
    )`);
    await dbRun(db, `CREATE TABLE IF NOT EXISTS fornecedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, razao_social TEXT, cnpj TEXT, status TEXT DEFAULT 'ativo'
    )`);
    await dbRun(db, `CREATE TABLE IF NOT EXISTS pedidos_compra (
      id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT UNIQUE, fornecedor_id INTEGER, valor_total REAL DEFAULT 0
    )`);
    const forn = await dbRun(db, `INSERT INTO fornecedores (razao_social, cnpj) VALUES ('Forn Test', '12.345.678/0001-90')`);
    const ped = await dbRun(db, `INSERT INTO pedidos_compra (numero, fornecedor_id, valor_total) VALUES ('PC-001', ?, 500)`, [forn.lastID]);
    const matId = await criarMaterial(db, 'T-NF-01', 0);
    await dbRun(db, `INSERT INTO itens_pedido_compra (pedido_id, material_id, quantidade, valor_unitario) VALUES (?,?,10,50)`, [ped.lastID, matId]);

    const rec = await receiptService.criarRecebimento(db, userAlmox, {
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: ped.lastID,
    });
    await receiptService.avancarWorkflow(db, userAlmox, rec.id, 'iniciar_conferencia');
    await receiptService.avancarWorkflow(db, userAlmox, rec.id, 'finalizar_conferencia');
    await receiptService.avancarWorkflow(db, userAlmox, rec.id, 'encaminhar_compras');
    await receiptService.avancarWorkflow(db, userAlmox, rec.id, 'finalizar_compras');
    await receiptService.salvarDadosFiscal(db, userAlmox, rec.id, {
      nota_fiscal: '9999', data_emissao_nf: '2026-01-15', data_entrada_nf: '2026-01-16',
      valor_total_nota: 500, fornecedor_cnpj: '12.345.678/0001-90',
    });
    const result = await receiptService.processarNota(db, userAlmox, rec.id);
    assert.ok(result.contas_pagar_id);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(m.quantidade_atual, 10);
    const cp = await dbGet(db, 'SELECT * FROM contas_pagar WHERE id = ?', [result.contas_pagar_id]);
    assert.strictEqual(cp.valor, 500);
  });

  await test('Requisição — bloqueia separação acima do estoque', async () => {
    const matId = await criarMaterial(db, 'T-REQ-01', 2);
    const reqRes = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, status) VALUES ('REQ-TEST-01', 1, 'Teste', 'APROVADO')`);
    const itemRes = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada) VALUES (?, ?, 3)`, [reqRes.lastID, matId]);

    let erro = false;
    try {
      await requisitionService.separarRequisicao(db, reqRes.lastID, [{
        item_id: itemRes.lastID,
        quantidade_separada: 3,
      }]);
    } catch (e) {
      erro = e.status === 400 && /não é possível separar 3/i.test(e.message);
    }
    assert.strictEqual(erro, true);
  });

  await test('Requisição — entrega parcial baixa só o entregue', async () => {
    const matId = await criarMaterial(db, 'T-REQ-02', 2);
    const reqRes = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, status) VALUES ('REQ-TEST-02', 1, 'Teste', 'EM_SEPARACAO')`);
    const itemRes = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada, quantidade_separada) VALUES (?, ?, 3, 2)`,
      [reqRes.lastID, matId]);

    const result = await requisitionService.entregarRequisicao(db, reqRes.lastID, [{
      item_id: itemRes.lastID,
      quantidade_atendida: 2,
    }], userAlmox);

    const item = await dbGet(db, 'SELECT quantidade_entregue, quantidade_atendida FROM itens_requisicao_almoxarifado WHERE id = ?',
      [itemRes.lastID]);
    const mat = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId]);
    const req = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqRes.lastID]);

    assert.strictEqual(result.parcial, true);
    assert.strictEqual(result.status, 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual(item.quantidade_entregue, 2);
    assert.strictEqual(item.quantidade_atendida, 2);
    assert.strictEqual(mat.quantidade_atual, 0);
    assert.strictEqual(req.status, 'PARCIALMENTE_ATENDIDA');
  });

  await test('Requisição — bloqueia entrega acima do estoque', async () => {
    const matId = await criarMaterial(db, 'T-REQ-03', 1);
    const reqRes = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, status) VALUES ('REQ-TEST-03', 1, 'Teste', 'EM_SEPARACAO')`);
    const itemRes = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada, quantidade_separada) VALUES (?, ?, 3, 3)`,
      [reqRes.lastID, matId]);

    let erro = false;
    try {
      await requisitionService.entregarRequisicao(db, reqRes.lastID, [{
        item_id: itemRes.lastID,
        quantidade_atendida: 2,
      }], userAlmox);
    } catch (e) {
      erro = e.status === 400 && /não é possível entregar 2/i.test(e.message);
    }
    assert.strictEqual(erro, true);
  });

  await test('Requisição — segunda rodada completa atendimento', async () => {
    const matId = await criarMaterial(db, 'T-REQ-04', 0);
    const reqRes = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, status) VALUES ('REQ-TEST-04', 1, 'Teste', 'PARCIALMENTE_ATENDIDA')`);
    const itemRes = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
      VALUES (?, ?, 3, 2, 2, 2)`, [reqRes.lastID, matId]);

    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 1 WHERE id = ?', [matId]);
    await requisitionService.separarRequisicao(db, reqRes.lastID, [{
      item_id: itemRes.lastID,
      quantidade_separada: 1,
    }]);

    const result = await requisitionService.entregarRequisicao(db, reqRes.lastID, [{
      item_id: itemRes.lastID,
      quantidade_atendida: 1,
    }], userAlmox);

    const req = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqRes.lastID]);
    const item = await dbGet(db, 'SELECT quantidade_entregue FROM itens_requisicao_almoxarifado WHERE id = ?',
      [itemRes.lastID]);

    assert.strictEqual(result.parcial, false);
    assert.strictEqual(result.status, 'ENTREGUE');
    assert.strictEqual(req.status, 'ENTREGUE');
    assert.strictEqual(item.quantidade_entregue, 3);
  });

  await test('Requisição — entrega parcial quando estoque < pendente', async () => {
    const matId = await criarMaterial(db, 'T-REQ-05', 8);
    const reqRes = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, status) VALUES ('REQ-TEST-05', 1, 'Teste', 'EM_SEPARACAO')`);
    const itemRes = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada, quantidade_separada) VALUES (?, ?, 10, 8)`,
      [reqRes.lastID, matId]);

    const result = await requisitionService.entregarRequisicao(db, reqRes.lastID, [{
      item_id: itemRes.lastID,
      quantidade_atendida: 8,
    }], userAlmox);

    const item = await dbGet(db,
      'SELECT quantidade_entregue, quantidade_atendida, quantidade_solicitada FROM itens_requisicao_almoxarifado WHERE id = ?',
      [itemRes.lastID]);
    const mat = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId]);
    const req = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqRes.lastID]);

    assert.strictEqual(result.parcial, true);
    assert.strictEqual(result.status, 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual(item.quantidade_entregue, 8);
    assert.strictEqual(requisitionService.pendenteEntrega(item), 2);
    assert.strictEqual(mat.quantidade_atual, 0);
    assert.strictEqual(req.status, 'PARCIALMENTE_ATENDIDA');
  });

  await test('Requisição — segunda rodada entrega direta após reposição (REQ-45657788)', async () => {
    const matId = await criarMaterial(db, 'T-REQ-07', 0);
    const reqRes = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, status) VALUES ('REQ-TEST-07', 1, 'Teste', 'PARCIALMENTE_ATENDIDA')`);
    const itemRes = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
      VALUES (?, ?, 10, 8, 8, 8)`, [reqRes.lastID, matId]);

    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 15 WHERE id = ?', [matId]);

    const itemRow = await dbGet(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE id = ?', [itemRes.lastID]);
    assert.strictEqual(requisitionService.maxEntregar(itemRow, 15), 2);

    const result = await requisitionService.entregarRequisicao(db, reqRes.lastID, [{
      item_id: itemRes.lastID,
      quantidade_atendida: 2,
    }], userAlmox);

    const req = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqRes.lastID]);
    const item = await dbGet(db,
      'SELECT quantidade_entregue, quantidade_separada FROM itens_requisicao_almoxarifado WHERE id = ?',
      [itemRes.lastID]);
    const mat = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId]);

    assert.strictEqual(result.parcial, false);
    assert.strictEqual(result.status, 'ENTREGUE');
    assert.strictEqual(req.status, 'ENTREGUE');
    assert.strictEqual(item.quantidade_entregue, 10);
    assert.strictEqual(item.quantidade_separada, 10);
    assert.strictEqual(mat.quantidade_atual, 13);
  });

  await test('Requisição — admin exclui com estorno de estoque', async () => {
    const matId = await criarMaterial(db, 'T-REQ-06', 5);
    const reqRes = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, status, ativo) VALUES ('REQ-TEST-06', 1, 'Teste', 'PARCIALMENTE_ATENDIDA', 1)`);
    const itemRes = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
      VALUES (?, ?, 10, 8, 3, 3)`, [reqRes.lastID, matId]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 2 WHERE id = ?', [matId]);

    const result = await requisitionService.excluirRequisicao(db, reqRes.lastID, userAdmin, 'Teste exclusão');
    const req = await dbGet(db, 'SELECT status, ativo FROM requisicoes_almoxarifado WHERE id = ?', [reqRes.lastID]);
    const mat = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId]);
    const movs = await dbAll(db,
      'SELECT tipo, quantidade FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = ?',
      [reqRes.lastID, 'ENTRADA']);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.estornos.length, 1);
    assert.strictEqual(req.ativo, 0);
    assert.strictEqual(req.status, 'CANCELADO');
    assert.strictEqual(mat.quantidade_atual, 5);
    assert.strictEqual(movs[0].quantidade, 3);
  });

  await test('Alerta estoque — dispara ao cruzar mínimo', async () => {
    const id = await criarMaterial(db, 'T-ALERT-1', 20);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_minima = 10 WHERE id = ?', [id]);
    const matAcima = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
    const r1 = await alertService.avaliarCruzamentoMinimo(db, matAcima);
    assert.strictEqual(r1.deveAlertar, false);

    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 8 WHERE id = ?', [id]);
    const matAbaixo = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
    const r2 = await alertService.avaliarCruzamentoMinimo(db, matAbaixo);
    assert.strictEqual(r2.deveAlertar, true);

    await alertService.marcarAlertaEnviado(db, id);
    const r3 = await alertService.avaliarCruzamentoMinimo(db, matAbaixo);
    assert.strictEqual(r3.deveAlertar, false);
    assert.ok(r3.motivo.includes('abaixo do mínimo'));
  });

  await test('Alerta estoque — novo alerta após reposição', async () => {
    const id = await criarMaterial(db, 'T-ALERT-2', 5);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_minima = 10 WHERE id = ?', [id]);
    await alertService.marcarAlertaEnviado(db, id);

    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 15 WHERE id = ?', [id]);
    const matReposto = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
    const r1 = await alertService.avaliarCruzamentoMinimo(db, matReposto);
    assert.strictEqual(r1.deveAlertar, false);

    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 9 WHERE id = ?', [id]);
    const matAbaixo = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
    const r2 = await alertService.avaliarCruzamentoMinimo(db, matAbaixo);
    assert.strictEqual(r2.deveAlertar, true);
  });

  await test('Mapa — material com localizacao_padrao_id aparece na localização', async () => {
    const locRes = await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES ('C-01', 'Corredor C', 1)`);
    const locId = locRes.lastID;
    await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, localizacao_padrao_id, ativo)
      VALUES ('MAP-1', 'Item Mapa', 5, ?, 1)`, [locId]);

    const mapa = await stockService.consultarMapaLocalizacoes(db);
    const loc = mapa.find((l) => l.id === locId);
    assert.ok(loc, 'localização C-01 deve existir no mapa');
    assert.strictEqual(loc.qtd_itens, 1);
    assert.strictEqual(loc.quantidade_total, 5);
  });

  await test('syncSaldoLocalizacaoPadrao — cria saldo na localização padrão', async () => {
    const locRes = await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES ('D-01', 'Depósito', 1)`);
    const matId = await criarMaterial(db, 'MAP-2', 12);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET localizacao_padrao_id = ? WHERE id = ?', [locRes.lastID, matId]);

    await stockService.syncSaldoLocalizacaoPadrao(db, matId);
    const saldo = await dbGet(db,
      'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?',
      [matId, locRes.lastID]);
    assert.strictEqual(saldo.quantidade, 12);
  });

  await test('Movimentação ENTRADA — atualiza saldo na localização padrão', async () => {
    const locRes = await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES ('E-01', 'Estante', 1)`);
    const matId = await criarMaterial(db, 'MAP-3', 0);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET localizacao_padrao_id = ? WHERE id = ?', [locRes.lastID, matId]);

    await stockService.registrarMovimentacao(db, userAlmox, { material_id: matId, tipo: 'ENTRADA', quantidade: 7, motivo: 'Teste mapa' });
    const saldo = await dbGet(db,
      'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?',
      [matId, locRes.lastID]);
    assert.strictEqual(saldo.quantidade, 7);
  });

  await test('Filtro por setor — sem permissões retorna todos os materiais', async () => {
    const id = await criarMaterial(db, 'SEC-1', 10);
    const clause = await sectorMaterialService.buildMaterialFilterClause(db, 'Compras');
    assert.strictEqual(clause, null);
    const rows = await dbAll(db, `SELECT id FROM materiais_almoxarifado m WHERE m.ativo = 1${clause ? ` AND ${clause}` : ''}`);
    assert.ok(rows.some((r) => r.id === id));
  });

  await test('Filtro por setor — permissões sem match liberam todos (retrocompat)', async () => {
    const id = await criarMaterial(db, 'SEC-2', 10);
    const clause = await sectorMaterialService.buildMaterialFilterClause(db, 'Engenharia');
    assert.strictEqual(clause, null);
    const rows = await dbAll(db, 'SELECT id FROM materiais_almoxarifado m WHERE m.ativo = 1');
    assert.ok(rows.some((r) => r.id === id));
  });

  await test('resolveSetor encontra setor por modulo_origem', async () => {
    const setor = await sectorMaterialService.resolveSetor(db, 'engenharia_projetos');
    assert.strictEqual(setor?.nome, 'Engenharia / Projetos');
  });

  await test('Lembrete requisição — recente não é elegível', async () => {
    await criarRequisicaoPendente(db, { updatedOffset: '-2 hours' });
    const elegiveis = await reminderService.buscarRequisicoesElegiveis(db, 24);
    assert.strictEqual(elegiveis.length, 0);
  });

  await test('Lembrete requisição — antiga sem resposta é elegível', async () => {
    const req = await criarRequisicaoPendente(db, { numero: 'REQ-OLD-1', updatedOffset: '-30 hours' });
    const elegiveis = await reminderService.buscarRequisicoesElegiveis(db, 24);
    assert.ok(elegiveis.some((r) => r.id === req.id));
  });

  await test('Lembrete requisição — não reenvia antes do intervalo', async () => {
    const req = await criarRequisicaoPendente(db, {
      numero: 'REQ-RECENT-REM',
      updatedOffset: '-30 hours',
      ultimoLembreteOffset: '-2 hours',
    });
    const elegiveis = await reminderService.buscarRequisicoesElegiveis(db, 24);
    assert.ok(!elegiveis.some((r) => r.id === req.id));
  });

  await test('Lembrete requisição — desativado não processa', async () => {
    await dbRun(db, `INSERT OR REPLACE INTO configuracoes_almoxarifado (chave, valor) VALUES ('requisicoes_lembrete_ativo', '0')`);
    await criarRequisicaoPendente(db, { numero: 'REQ-OFF-1', updatedOffset: '-48 hours' });
    const resultado = await reminderService.processarLembretesPendentes(db);
    assert.strictEqual(resultado.ativo, false);
    assert.strictEqual(resultado.processados, 0);
    await dbRun(db, `INSERT OR REPLACE INTO configuracoes_almoxarifado (chave, valor) VALUES ('requisicoes_lembrete_ativo', '1')`);
  });

  await test('Lembrete requisição — assunto do e-mail', async () => {
    const req = {
      numero: 'REQ-999',
      solicitante_nome: 'João',
      setor: 'Caldeiraria',
      urgencia: 'URGENTE',
      os_referencia: 'OS-42',
      updated_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    };
    const msg = reminderService.buildMensagemLembrete(req, [{
      material_nome: 'Parafuso M8',
      material_codigo: 'PAR-08',
      quantidade_solicitada: 10,
      unidade: 'UN',
    }], 2, 'https://systemgmp.online');
    assert.ok(msg.assunto.includes('REQ-999'));
    assert.ok(msg.assunto.includes('2 dias'));
    assert.ok(msg.html.includes('Parafuso M8'));
  });

  await test('Lembrete requisição — processa sem SMTP (sem envio)', async () => {
    await dbRun(db, `INSERT OR REPLACE INTO configuracoes_almoxarifado (chave, valor) VALUES ('alertas_estoque_emails', '["almox@test.com"]')`);
    const req = await criarRequisicaoPendente(db, { numero: 'REQ-NO-SMTP', updatedOffset: '-26 hours' });
    const resultado = await reminderService.processarLembretesPendentes(db);
    assert.ok(resultado.processados >= 1);
    const item = resultado.resultados.find((r) => r.requisicao_id === req.id);
    assert.ok(item);
    assert.strictEqual(item.enviado, false);
    const logs = await dbAll(db, 'SELECT * FROM requisicao_lembretes_log WHERE requisicao_id = ?', [req.id]);
    assert.ok(logs.length >= 1);
  });

  await test('Liberação por valor — calcula valor total dos itens', async () => {
    await setupLiberacaoValor(db);
    const matId = await criarMaterial(db, 'T-VAL-01', 10, 100);
    const reqId = await criarRequisicaoComItens(db, {
      numero: 'REQ-VAL-01',
      itens: [{ material_id: matId, qty: 3 }],
    });
    const total = await valueApprovalService.calcularValorTotal(db, reqId);
    assert.strictEqual(total, 300);
  });

  await test('Liberação por valor — abaixo do limite não exige aprovação', async () => {
    await setupLiberacaoValor(db, { limite: 500 });
    const matId = await criarMaterial(db, 'T-VAL-02', 10, 50);
    const reqId = await criarRequisicaoComItens(db, {
      numero: 'REQ-VAL-02',
      itens: [{ material_id: matId, qty: 5 }],
    });
    const result = await valueApprovalService.aplicarAvaliacaoNaCriacao(db, reqId);
    assert.strictEqual(result.status, 'PENDENTE');
    assert.strictEqual(result.requer_aprovacao_valor, false);
    const req = await dbGet(db, 'SELECT status, valor_total FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(req.status, 'PENDENTE');
    assert.strictEqual(req.valor_total, 250);
  });

  await test('Liberação por valor — acima do limite fica aguardando aprovação', async () => {
    await setupLiberacaoValor(db, { limite: 500 });
    const matId = await criarMaterial(db, 'T-VAL-03', 10, 200);
    const reqId = await criarRequisicaoComItens(db, {
      numero: 'REQ-VAL-03',
      itens: [{ material_id: matId, qty: 4 }],
    });
    const result = await valueApprovalService.aplicarAvaliacaoNaCriacao(db, reqId);
    assert.strictEqual(result.status, valueApprovalService.STATUS_AGUARDANDO);
    assert.strictEqual(result.requer_aprovacao_valor, true);
    const req = await dbGet(db, 'SELECT status, valor_total, requer_aprovacao_valor FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(req.status, 'AGUARDANDO_APROVACAO_VALOR');
    assert.strictEqual(req.valor_total, 800);
    assert.strictEqual(req.requer_aprovacao_valor, 1);
  });

  await test('Liberação por valor — bloqueia separação sem aprovação', async () => {
    await setupLiberacaoValor(db, { limite: 100 });
    const matId = await criarMaterial(db, 'T-VAL-04', 10, 50);
    const reqId = await criarRequisicaoComItens(db, {
      numero: 'REQ-VAL-04',
      status: 'APROVADO',
      itens: [{ material_id: matId, qty: 5 }],
    });
    await dbRun(db, `UPDATE requisicoes_almoxarifado SET valor_total=250, requer_aprovacao_valor=1 WHERE id=?`, [reqId]);
    let bloqueado = false;
    try {
      await requisitionService.separarRequisicao(db, reqId, []);
    } catch (e) {
      bloqueado = e.status === 403 && e.code === 'AGUARDANDO_APROVACAO_VALOR';
    }
    assert.strictEqual(bloqueado, true);
  });

  await test('Liberação por valor — aprovador libera requisição', async () => {
    await setupLiberacaoValor(db, { limite: 100 });
    const matId = await criarMaterial(db, 'T-VAL-05', 10, 50);
    const reqId = await criarRequisicaoComItens(db, {
      numero: 'REQ-VAL-05',
      status: 'AGUARDANDO_APROVACAO_VALOR',
      itens: [{ material_id: matId, qty: 5 }],
    });
    await dbRun(db, `UPDATE requisicoes_almoxarifado SET valor_total=250, requer_aprovacao_valor=1 WHERE id=?`, [reqId]);
    const aprovador = { id: 10, nome: 'Aprovador Valor', role: 'user' };
    const result = await valueApprovalService.aprovarValor(db, reqId, aprovador);
    assert.strictEqual(result.status, 'APROVADO');
    const req = await dbGet(db, 'SELECT status, aprovador_valor_id, data_aprovacao_valor FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(req.status, 'APROVADO');
    assert.strictEqual(req.aprovador_valor_id, 10);
    assert.ok(req.data_aprovacao_valor);
  });

  await test('Liberação por valor — reprovação com motivo', async () => {
    await setupLiberacaoValor(db, { limite: 100 });
    const matId = await criarMaterial(db, 'T-VAL-06', 10, 50);
    const reqId = await criarRequisicaoComItens(db, {
      numero: 'REQ-VAL-06',
      status: 'AGUARDANDO_APROVACAO_VALOR',
      itens: [{ material_id: matId, qty: 5 }],
    });
    await dbRun(db, `UPDATE requisicoes_almoxarifado SET valor_total=250, requer_aprovacao_valor=1 WHERE id=?`, [reqId]);
    const aprovador = { id: 10, nome: 'Aprovador Valor', role: 'user' };
    const result = await valueApprovalService.rejeitarValor(db, reqId, aprovador, 'Valor não justificado');
    assert.strictEqual(result.status, 'REJEITADO');
    const req = await dbGet(db, 'SELECT status, rejeicao_valor_motivo FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(req.status, 'REJEITADO');
    assert.strictEqual(req.rejeicao_valor_motivo, 'Valor não justificado');
  });

  await test('Liberação por valor — isAprovadorValor respeita configuração', async () => {
    await setupLiberacaoValor(db, { aprovadorIds: [10] });
    const sim = await valueApprovalService.isAprovadorValor(db, { id: 10, role: 'user' });
    const nao = await valueApprovalService.isAprovadorValor(db, { id: 99, role: 'user' });
    const admin = await valueApprovalService.isAprovadorValor(db, { id: 99, role: 'admin' });
    assert.strictEqual(sim, true);
    assert.strictEqual(nao, false);
    assert.strictEqual(admin, true);
  });

  console.log(`\n📊 Resultado: ${passed} passou, ${failed} falhou\n`);
  db.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
