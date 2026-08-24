/**
 * Etapa 12, Task 3 — RN-07: alertas novos (estoque zerado, lote vencendo, remessa a terceiro
 * vencida) — maquina de estado/dedupe, disparo pela fila (RN-01/02).
 *
 * Executar: cd server && node tests/api/alertasNovos.api.test.js
 */
const assert = require('assert');
const crypto = require('crypto');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const alertService = require('../../services/almoxarifado/alertService');
const queueService = require('../../services/almoxarifado/notificationQueueService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

async function setConfig(db, chave, valor) {
  await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = ? WHERE chave = ?`, [valor, chave]);
}

function hashDedupe(evento, dedupeChave) {
  return crypto.createHash('sha256').update(`${evento}|${dedupeChave}`).digest('hex');
}

let seq = 0;
async function novoMaterial(db, over = {}) {
  seq += 1;
  const m = { codigo: `ALN-${seq}`, nome: `Material Alerta ${seq}`, unidade: 'UN', qtd: 10,
    cliente_id: null, ...over };
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, proprietario_cliente_id)
     VALUES (?,?,?,?,1,?)`,
    [m.codigo, m.nome, m.unidade, m.qtd, m.cliente_id]);
  return { id: r.lastID, codigo: m.codigo, nome: m.nome };
}

async function setQuantidade(db, materialId, qtd) {
  await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_atual = ? WHERE id = ?`, [qtd, materialId]);
}

async function filaZeradoDoMaterial(db, materialId) {
  const todas = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = 'ESTOQUE_ZERADO' ORDER BY id ASC`);
  return todas.filter((row) => {
    try { return JSON.parse(row.payload).material_id === materialId; } catch (e) { return false; }
  });
}

async function criarLote(db, materialId, over = {}) {
  const codigo = over.codigo || `LOTE-ALN-${materialId}-${over.sufixo || 1}`;
  const r = await dbRun(db, `INSERT INTO lotes_almoxarifado
    (material_id, codigo, status, data_validade, vencimento_liberado_em)
    VALUES (?,?,?,?,?)`, [
    materialId, codigo, over.status || 'ATIVO', over.data_validade || null, over.liberado || null,
  ]);
  return r.lastID;
}

async function darSaldoAoLote(db, materialId, loteId, quantidade) {
  await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, lote_id, quantidade) VALUES (?,?,?)`,
    [materialId, loteId, quantidade]);
}

let numeroRemessa = 0;
async function criarRemessa(db, over = {}) {
  numeroRemessa += 1;
  const r = await dbRun(db, `INSERT INTO remessas_terceiro_almoxarifado
    (numero, status, prazo_previsto) VALUES (?,?,?)`,
    [over.numero || `REM-ALN-${numeroRemessa}`, over.status || 'ENVIADA', over.prazo_previsto]);
  return r.lastID;
}

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });
  await setConfig(db, 'alertas_estoque_emails', '["admin-zerado@teste.com"]');

  // ── ESTOQUE ZERADO (RN-07) ──────────────────────────────────────────────────────────────────

  await test('RN-07: regua e quantidade_atual, NUNCA "disponivel" — material com saldo positivo nao e zerado', async () => {
    const r = await alertService.avaliarZerado(db, { id: 999999, quantidade_atual: 5 });
    assert.deepStrictEqual(r, { deveAlertar: false, motivo: 'com saldo' });
  });

  await test('RN-07: ZERADO dispara na transicao e rearma (par completo)', async () => {
    const mat = await novoMaterial(db, { qtd: 10 });

    // Ainda com saldo: nao dispara.
    const r0 = await alertService.verificarAlertaPorMaterialId(db, mat.id);
    assert.ok(r0, 'material sem cliente deveria devolver resultado do alerta de minimo');
    assert.strictEqual((await filaZeradoDoMaterial(db, mat.id)).length, 0, 'nao pode ter alertado com saldo positivo');

    // Zera: dispara UMA vez.
    await setQuantidade(db, mat.id, 0);
    await alertService.verificarAlertaPorMaterialId(db, mat.id);
    const primeiraLeva = await filaZeradoDoMaterial(db, mat.id);
    assert.strictEqual(primeiraLeva.length, 1, JSON.stringify(primeiraLeva));
    assert.ok(primeiraLeva[0].assunto.includes(mat.codigo), primeiraLeva[0].assunto);
    assert.deepStrictEqual(JSON.parse(primeiraLeva[0].destinatarios), ['admin-zerado@teste.com']);

    // Continua zerado (chamado de novo, ex.: outra movimentacao no mesmo material): NAO dispara
    // segunda vez — o estado ZERADO ja bloqueia.
    await alertService.verificarAlertaPorMaterialId(db, mat.id);
    assert.strictEqual((await filaZeradoDoMaterial(db, mat.id)).length, 1, 'nao pode ter disparado 2x seguidas zerado');

    const estadoZerado = await dbGet(db, `SELECT estado_zerado FROM alertas_estoque_material_almoxarifado WHERE material_id = ?`, [mat.id]);
    assert.strictEqual(estadoZerado.estado_zerado, 'ZERADO', JSON.stringify(estadoZerado));

    // Repoe: rearma o estado (sem novo alerta ainda, so a transicao de volta).
    await setQuantidade(db, mat.id, 15);
    await alertService.verificarAlertaPorMaterialId(db, mat.id);
    assert.strictEqual((await filaZeradoDoMaterial(db, mat.id)).length, 1, 'reposicao nao pode gerar alerta de zerado');
    const estadoComSaldo = await dbGet(db, `SELECT estado_zerado FROM alertas_estoque_material_almoxarifado WHERE material_id = ?`, [mat.id]);
    assert.strictEqual(estadoComSaldo.estado_zerado, 'COM_SALDO', JSON.stringify(estadoComSaldo));

    // Zera de NOVO: rearmado, dispara a SEGUNDA vez (par completo de transicoes).
    await setQuantidade(db, mat.id, 0);
    await alertService.verificarAlertaPorMaterialId(db, mat.id);
    const segundaLeva = await filaZeradoDoMaterial(db, mat.id);
    assert.strictEqual(segundaLeva.length, 2, JSON.stringify(segundaLeva));
  });

  await test('RN-07: material de cliente (proprietario_cliente_id) nunca alerta zerado', async () => {
    const clienteRow = await dbRun(db, `INSERT INTO clientes (razao_social) VALUES ('Cliente Zerado Teste')`);
    const mat = await novoMaterial(db, { qtd: 0, cliente_id: clienteRow.lastID });

    const r = await alertService.verificarAlertaPorMaterialId(db, mat.id);
    assert.strictEqual(r, null, 'material de cliente nao deveria nem ser encontrado pela consulta');
    assert.strictEqual((await filaZeradoDoMaterial(db, mat.id)).length, 0);
  });

  await test('RN-01: falha ao enfileirar zerado NAO derruba verificarAlertaPorMaterialId', async () => {
    const mat = await novoMaterial(db, { qtd: 0 });
    const original = queueService.enfileirar;
    queueService.enfileirar = async () => { throw new Error('SABOTAGEM: enfileirar explodiu'); };
    try {
      const r = await alertService.verificarAlertaPorMaterialId(db, mat.id);
      assert.ok(r, 'a chamada nao pode ter lancado nem devolvido algo falsy por causa da fila');
    } finally {
      queueService.enfileirar = original;
    }
  });

  // ── LOTE VENCENDO (RN-07) ───────────────────────────────────────────────────────────────────

  await test('RN-07: lote dentro da janela com saldo entra; 2a varredura mesmo lote/validade nao duplica', async () => {
    const mat = await novoMaterial(db, { qtd: 50 });
    const validade = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const loteId = await criarLote(db, mat.id, { data_validade: validade });
    await darSaldoAoLote(db, mat.id, loteId, 20);

    const r1 = await queueService.varrerLotesVencendo(db);
    assert.ok(r1.enfileiradas >= 1, JSON.stringify(r1));

    const linhas1 = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = 'LOTE_VENCENDO' AND payload LIKE ?`, [`%"lote_id":${loteId}%`]);
    assert.strictEqual(linhas1.length, 1, JSON.stringify(linhas1));
    const hash = hashDedupe('LOTE_VENCENDO', `lote-vencendo-${loteId}-${validade}`);
    assert.strictEqual(linhas1[0].hash_dedupe, hash, 'dedupe deveria ser lote-vencendo-<id>-<data_validade>');

    const r2 = await queueService.varrerLotesVencendo(db);
    const linhas2 = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = 'LOTE_VENCENDO' AND payload LIKE ?`, [`%"lote_id":${loteId}%`]);
    assert.strictEqual(linhas2.length, 1, 'segunda varredura do mesmo lote/validade NAO pode duplicar');
  });

  await test('RN-07: regua da janela — lote FORA da janela (config default 30 dias) nao entra', async () => {
    const mat = await novoMaterial(db, { qtd: 50 });
    const validadeLonge = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const loteId = await criarLote(db, mat.id, { data_validade: validadeLonge });
    await darSaldoAoLote(db, mat.id, loteId, 20);

    await queueService.varrerLotesVencendo(db);
    const linhas = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = 'LOTE_VENCENDO' AND payload LIKE ?`, [`%"lote_id":${loteId}%`]);
    assert.strictEqual(linhas.length, 0, 'lote fora da janela de alerta_lote_vencendo_dias nao pode entrar');
  });

  await test('RN-07: lote sem saldo nao entra', async () => {
    const mat = await novoMaterial(db, { qtd: 50 });
    const validade = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const loteId = await criarLote(db, mat.id, { data_validade: validade });
    // Sem darSaldoAoLote: saldo agregado 0.

    await queueService.varrerLotesVencendo(db);
    const linhas = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = 'LOTE_VENCENDO' AND payload LIKE ?`, [`%"lote_id":${loteId}%`]);
    assert.strictEqual(linhas.length, 0, 'lote sem saldo nao pode entrar');
  });

  await test('RN-07: lote BLOQUEADO/REPROVADO nao entra mesmo na janela com saldo', async () => {
    const mat = await novoMaterial(db, { qtd: 50 });
    const validade = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const loteBloq = await criarLote(db, mat.id, { data_validade: validade, status: 'BLOQUEADO', sufixo: 'b' });
    await darSaldoAoLote(db, mat.id, loteBloq, 10);
    const loteRep = await criarLote(db, mat.id, { data_validade: validade, status: 'REPROVADO', sufixo: 'r' });
    await darSaldoAoLote(db, mat.id, loteRep, 10);

    await queueService.varrerLotesVencendo(db);
    for (const loteId of [loteBloq, loteRep]) {
      const linhas = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = 'LOTE_VENCENDO' AND payload LIKE ?`, [`%"lote_id":${loteId}%`]);
      assert.strictEqual(linhas.length, 0, `lote ${loteId} nao ATIVO nao pode entrar`);
    }
  });

  await test('RN-07/D-item: lote com vencimento_liberado_em preenchido SAI da varredura', async () => {
    const mat = await novoMaterial(db, { qtd: 50 });
    const validade = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const loteId = await criarLote(db, mat.id, { data_validade: validade, liberado: '2026-01-01 10:00:00' });
    await darSaldoAoLote(db, mat.id, loteId, 20);

    await queueService.varrerLotesVencendo(db);
    const linhas = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = 'LOTE_VENCENDO' AND payload LIKE ?`, [`%"lote_id":${loteId}%`]);
    assert.strictEqual(linhas.length, 0, 'lote com vencimento liberado nao pode reentrar na varredura');
  });

  // ── REMESSA A TERCEIRO VENCIDA (RN-07) ──────────────────────────────────────────────────────

  await test('RN-07: remessa vencida pela regua unica de listarRemessas entra; 2a varredura nao duplica', async () => {
    const prazoPassado = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const remessaId = await criarRemessa(db, { status: 'ENVIADA', prazo_previsto: prazoPassado });

    const r1 = await queueService.varrerRemessasVencidas(db);
    assert.ok(r1.enfileiradas >= 1, JSON.stringify(r1));

    const linhas1 = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = 'REMESSA_VENCIDA' AND payload LIKE ?`, [`%"remessa_id":${remessaId}%`]);
    assert.strictEqual(linhas1.length, 1, JSON.stringify(linhas1));
    const hash = hashDedupe('REMESSA_VENCIDA', `remessa-vencida-${remessaId}-${prazoPassado}`);
    assert.strictEqual(linhas1[0].hash_dedupe, hash);

    await queueService.varrerRemessasVencidas(db);
    const linhas2 = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = 'REMESSA_VENCIDA' AND payload LIKE ?`, [`%"remessa_id":${remessaId}%`]);
    assert.strictEqual(linhas2.length, 1, 'segunda varredura da mesma remessa/prazo NAO pode duplicar');
  });

  await test('RN-07: remessa no prazo nao entra', async () => {
    const prazoFuturo = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const remessaId = await criarRemessa(db, { status: 'ENVIADA', prazo_previsto: prazoFuturo });

    await queueService.varrerRemessasVencidas(db);
    const linhas = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = 'REMESSA_VENCIDA' AND payload LIKE ?`, [`%"remessa_id":${remessaId}%`]);
    assert.strictEqual(linhas.length, 0, 'remessa no prazo nao pode entrar');
  });

  await test('RN-07: remessa ENCERRADA com prazo passado nao entra (fora da regua de listarRemessas)', async () => {
    const prazoPassado = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const remessaId = await criarRemessa(db, { status: 'ENCERRADA', prazo_previsto: prazoPassado });

    await queueService.varrerRemessasVencidas(db);
    const linhas = await dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = 'REMESSA_VENCIDA' AND payload LIKE ?`, [`%"remessa_id":${remessaId}%`]);
    assert.strictEqual(linhas.length, 0, 'remessa encerrada nao pode entrar mesmo com prazo no passado');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
