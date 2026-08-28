/**
 * Etapa 16, Task 4 — jornada de INTEGRACAO dos alertas, ponta a ponta e com motor REAL
 * (plano docs/superpowers/plans/2026-08-28-almoxarifado-etapa16-alertas.md, Task 4).
 *
 * O que este arquivo prova e a COMPOSICAO (os testes de Task 1/2 ja provam cada peca):
 * 3 condicoes reais semeadas -> varrerAlertasRegistrados -> fila -> GET /alertas/central ->
 * resolver UMA condicao ENTREGANDO DE VERDADE pela rota (separar + entregar, motor de
 * estoque real, nada de UPDATE de status na mao) -> central ao vivo mostra a requisicao
 * atrasada A MENOS e a fila NAO encolhe (RN-05) -> 2a varredura -> 0 novas (RN-02).
 *
 * NOTA (achado da revisao do plano, herdado da Task 1): materiais semeados sem movimentacao
 * caem AUTOMATICAMENTE em ESTOQUE_SEM_CONSUMO/MATERIAL_SEM_ENDERECO — por isso TODA assercao
 * de fila aqui filtra por evento/hash de dedupe, NUNCA por total global.
 *
 * Executar: cd server && node tests/api/alertaJornada.api.test.js
 */
const assert = require('assert');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const queueService = require('../../services/almoxarifado/notificationQueueService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Jornada', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

function hashDedupe(evento, dedupeChave) {
  return crypto.createHash('sha256').update(`${evento}|${dedupeChave}`).digest('hex');
}
function diasAtras(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function filaCount(db, evento) {
  const row = await dbGet(db,
    `SELECT COUNT(*) AS n FROM fila_notificacoes_almoxarifado WHERE evento = ?`, [evento]);
  return row.n;
}
async function filaPorHash(db, hash) {
  const row = await dbGet(db,
    `SELECT COUNT(*) AS n FROM fila_notificacoes_almoxarifado WHERE hash_dedupe = ?`, [hash]);
  return row.n;
}
function resultadoDe(resultados, chave) {
  const r = resultados.find((x) => x.chave === chave);
  assert.ok(r, `varredura nao devolveu entrada para ${chave}: ${JSON.stringify(resultados)}`);
  return r;
}
function entradaCentral(body, chave) {
  const e = body.alertas.find((a) => a.chave === chave);
  assert.ok(e, `central sem entrada ${chave}: ${JSON.stringify(body.alertas.map((a) => a.chave))}`);
  return e;
}

const EVENTOS_DA_JORNADA = ['CALIBRACAO_VENCENDO', 'REQUISICAO_ATRASADA', 'RESERVA_PARADA'];

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = '["a@b.c"]' WHERE chave = 'alertas_estoque_emails'`);
  await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = '1' WHERE chave = 'alertas_estoque_notificar_email'`);

  // ── Estado compartilhado da jornada ─────────────────────────────────────────────────────────
  let ferramentaId; let validadeVencida;
  let reqId; let reqItemId; let materialReqId;
  let reservaId;
  let hashCalibracao; let hashRequisicao; let hashReserva;
  let totalReqAtrasadaAntes; // total da central ANTES da entrega
  let filaReqAposVarredura1; // linhas de REQUISICAO_ATRASADA na fila apos a 1a varredura
  const filaAposVarredura1 = {}; // por evento da jornada, apos a 1a varredura

  // ── Passo 1: semear as 3 condicoes reais e varrer ───────────────────────────────────────────
  await test('1. semeadas 3 condicoes reais, a varredura enfileira os 3 eventos (assercao por evento, nunca total global)', async () => {
    // Condicao A: ferramenta exige_calibracao com calibracao VENCIDA (ontem).
    validadeVencida = diasAtras(1);
    const fer = await dbRun(db, `INSERT INTO ferramentas_almoxarifado
        (codigo_patrimonio, nome, exige_calibracao, ativo) VALUES ('FER-JOR-1', 'Paquimetro Jornada', 1, 1)`);
    ferramentaId = fer.lastID;
    await dbRun(db, `INSERT INTO calibracoes_ferramenta_almoxarifado
        (ferramenta_id, data_calibracao, data_validade) VALUES (?,?,?)`,
      [ferramentaId, diasAtras(300), validadeVencida]);

    // Condicao B: requisicao ATRASADA em APROVADO (literal masculino do banco) com item
    // separavel — material COM saldo, porque o passo 3 entrega DE VERDADE pelo motor.
    const mat = await dbRun(db, `INSERT INTO materiais_almoxarifado
        (codigo, nome, unidade, quantidade_atual, ativo) VALUES ('JOR-MAT-1', 'Material Jornada', 'UN', 50, 1)`);
    materialReqId = mat.lastID;
    const req = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, data_necessidade, ativo)
       VALUES ('REQ-JOR-1', 1, 'Solicitante Jornada', 'APROVADO', ?, 1)`, [diasAtras(1)]);
    reqId = req.lastID;
    const item = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
        (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
       VALUES (?,?,?,0,0,0)`, [reqId, materialReqId, 10]);
    reqItemId = item.lastID;

    // Condicao C: reserva ATIVA parada ha 40 dias (config default 30).
    const res = await dbRun(db, `INSERT INTO reservas_material_almoxarifado
        (material_id, quantidade, status, created_at) VALUES (?, 2, 'ATIVA', datetime('now', '-40 days'))`,
      [materialReqId]);
    reservaId = res.lastID;

    hashCalibracao = hashDedupe('CALIBRACAO_VENCENDO', `calibracao-${ferramentaId}-${validadeVencida}`);
    hashRequisicao = hashDedupe('REQUISICAO_ATRASADA', `req-atrasada-${reqId}`);
    hashReserva = hashDedupe('RESERVA_PARADA', `reserva-parada-${reservaId}`);

    const resultados = await queueService.varrerAlertasRegistrados(db);
    for (const chave of EVENTOS_DA_JORNADA) {
      const r = resultadoDe(resultados, chave);
      assert.ok(r.enfileiradas >= 1, `${chave} devia ter enfileirado: ${JSON.stringify(r)}`);
      assert.strictEqual(r.sem_destinatario, 0, JSON.stringify(r));
    }
    // Cada condicao semeada esta na fila com o SEU hash de dedupe (C3) — por evento.
    assert.strictEqual(await filaPorHash(db, hashCalibracao), 1, 'calibracao vencida tinha de estar na fila');
    assert.strictEqual(await filaPorHash(db, hashRequisicao), 1, 'requisicao atrasada tinha de estar na fila');
    assert.strictEqual(await filaPorHash(db, hashReserva), 1, 'reserva parada tinha de estar na fila');

    for (const evento of EVENTOS_DA_JORNADA) {
      filaAposVarredura1[evento] = await filaCount(db, evento);
    }
    filaReqAposVarredura1 = filaAposVarredura1.REQUISICAO_ATRASADA;
  });

  // ── Passo 2: central ao vivo mostra os 3 (fonte unica — o MESMO registro da varredura) ──────
  await test('2. GET /alertas/central: os 3 totais >= 1 e as linhas sao as condicoes semeadas (RN-01 na jornada)', async () => {
    const res = await request(app).get('/api/almoxarifado/alertas/central');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const cal = entradaCentral(res.body, 'CALIBRACAO_VENCENDO');
    assert.ok(cal.total >= 1, `calibracao: total ${cal.total}`);
    assert.ok(cal.linhas.some((l) => l.id === ferramentaId), 'ferramenta vencida tinha de estar na central');

    const reqEnt = entradaCentral(res.body, 'REQUISICAO_ATRASADA');
    assert.ok(reqEnt.total >= 1, `requisicao: total ${reqEnt.total}`);
    assert.ok(reqEnt.linhas.some((l) => l.id === reqId), 'requisicao atrasada tinha de estar na central');
    totalReqAtrasadaAntes = reqEnt.total;

    const resv = entradaCentral(res.body, 'RESERVA_PARADA');
    assert.ok(resv.total >= 1, `reserva: total ${resv.total}`);
    assert.ok(resv.linhas.some((l) => l.id === reservaId), 'reserva parada tinha de estar na central');
  });

  // ── Passo 3: resolver a requisicao ENTREGANDO de verdade pela rota (motor real) ─────────────
  await test('3. separar + entregar pela rota: status ENTREGUE, saldo baixado e movimentacao SAIDA auditavel (motor real)', async () => {
    // APROVADO nao esta em PODE_ENTREGAR — o caminho real passa pela separacao, como o
    // almoxarife faria: separar (APROVADO -> EM_SEPARACAO) e depois entregar.
    const sep = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/separar`)
      .send({ itens_separados: [{ item_id: reqItemId, quantidade_separada: 10 }] });
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));
    assert.strictEqual(sep.body.status, 'EM_SEPARACAO');

    const ent = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: reqItemId, quantidade_atendida: 10 }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
    assert.strictEqual(ent.body.status, 'ENTREGUE');

    // Prova de que foi o motor, nao UPDATE de status na mao: saldo baixou e ha SAIDA gravada.
    const mat = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [materialReqId]);
    assert.strictEqual(mat.quantidade_atual, 40, 'entrega real tinha de baixar o saldo (50-10)');
    const mov = await dbGet(db,
      `SELECT * FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'SAIDA'`, [reqId]);
    assert.ok(mov, 'entrega real tinha de gravar movimentacao SAIDA');
    assert.strictEqual(mov.quantidade, 10);
  });

  // ── Passo 4: RN-05 — central ao vivo mostra a requisicao A MENOS; a fila NAO encolhe ────────
  await test('4. RN-05: central mostra requisicao atrasada a menos (total-1, linha sumiu); a fila NAO encolheu', async () => {
    const res = await request(app).get('/api/almoxarifado/alertas/central');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const reqEnt = entradaCentral(res.body, 'REQUISICAO_ATRASADA');
    assert.ok(!reqEnt.linhas.some((l) => l.id === reqId), 'requisicao ENTREGUE tinha de SUMIR da central (ao vivo)');
    assert.strictEqual(reqEnt.total, totalReqAtrasadaAntes - 1,
      `total tinha de cair de ${totalReqAtrasadaAntes} para ${totalReqAtrasadaAntes - 1}, veio ${reqEnt.total}`);

    // As outras duas condicoes NAO foram resolvidas: continuam na central.
    assert.ok(entradaCentral(res.body, 'CALIBRACAO_VENCENDO').linhas.some((l) => l.id === ferramentaId),
      'calibracao segue vencida, tinha de continuar na central');
    assert.ok(entradaCentral(res.body, 'RESERVA_PARADA').linhas.some((l) => l.id === reservaId),
      'reserva segue parada, tinha de continuar na central');

    // A fila e historico de notificacao, nao espelho da condicao: resolver NAO apaga linha.
    assert.strictEqual(await filaCount(db, 'REQUISICAO_ATRASADA'), filaReqAposVarredura1,
      'a fila NAO pode encolher quando a condicao resolve (RN-05)');
    assert.strictEqual(await filaPorHash(db, hashRequisicao), 1, 'a notificacao ja enviada permanece na fila');
  });

  // ── Passo 5: RN-02 ponta a ponta — 2a varredura no estado novo nao gera NADA novo ───────────
  await test('5. RN-02 ponta a ponta: 2a varredura -> 0 enfileiradas nos 3 eventos e a fila por evento nao cresce', async () => {
    const resultados = await queueService.varrerAlertasRegistrados(db);

    for (const chave of EVENTOS_DA_JORNADA) {
      const r = resultadoDe(resultados, chave);
      assert.strictEqual(r.enfileiradas, 0, `${chave}: 2a varredura nao pode enfileirar nada novo: ${JSON.stringify(r)}`);
    }
    // Condicoes que persistem batem no dedupe (duplicadas); a resolvida nem lista mais.
    assert.ok(resultadoDe(resultados, 'CALIBRACAO_VENCENDO').duplicadas >= 1, 'calibracao persiste -> duplicada');
    assert.ok(resultadoDe(resultados, 'RESERVA_PARADA').duplicadas >= 1, 'reserva persiste -> duplicada');
    assert.strictEqual(resultadoDe(resultados, 'REQUISICAO_ATRASADA').duplicadas, 0,
      'requisicao entregue saiu da condicao — nem duplicada deveria contar');

    for (const evento of EVENTOS_DA_JORNADA) {
      assert.strictEqual(await filaCount(db, evento), filaAposVarredura1[evento],
        `${evento}: fila nao pode crescer na 2a varredura no mesmo estado`);
    }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
