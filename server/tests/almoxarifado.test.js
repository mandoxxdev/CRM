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
const { can, PERFIS } = require('../services/almoxarifado/permissions');
const alertService = require('../services/almoxarifado/alertService');

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

async function criarMaterial(db, codigo, qtd = 100) {
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, quantidade_minima) VALUES (?,?,?,?)`,
    [codigo, `Material ${codigo}`, qtd, 10]);
  return r.lastID;
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

  console.log(`\n📊 Resultado: ${passed} passou, ${failed} falhou\n`);
  db.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
