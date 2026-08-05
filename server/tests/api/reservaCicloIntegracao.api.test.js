/**
 * Etapa 4 — as duas pontas que ficariam "implementadas e nunca disparando".
 *
 * 1. EXPIRAÇÃO SEM `expira_em`. O job de expiração nasceu correto e testado, mas ninguém
 *    populava `expira_em` na criação da reserva — então na prática ele nunca teria o que
 *    processar. Mesma classe do `reserva_id` que o Zod descartava em silêncio.
 *    O vencimento é OPT-IN pela config `reserva_dias_validade`: sem ela e sem valor explícito
 *    a reserva não expira, senão as reservas manuais que já existem começariam a ser
 *    liberadas sozinhas.
 *
 * 2. CANCELAR REQUISIÇÃO DEIXAVA O HOLD PRESO. A aprovação reserva; o cancelamento não
 *    soltava. Como a expiração é opt-in, o saldo ficaria reservado para sempre numa
 *    requisição morta — a mesma armadilha de saldo inutilizável que esta etapa fecha.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };

let seq = 0;
async function novoMaterial(db, qtd = 100) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',?,1)`,
    [`CICLO-${seq}`, `Material ciclo ${seq}`, qtd]);
  return r.lastID;
}
const disponivel = async (db, id) => {
  const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
  return stockService.getSaldoDisponivel(m);
};
const setConfig = (db, chave, valor) => dbRun(db,
  `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
   ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  // ── 1. expira_em na criação ──

  await test('sem config e sem valor explícito, a reserva NÃO ganha expira_em (opt-in)', async () => {
    const mat = await novoMaterial(db);
    const r = await request(app).post('/api/almoxarifado/reservas')
      .send({ material_id: mat, quantidade: 5, projeto_id: 1 });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const row = await dbGet(db, 'SELECT expira_em FROM reservas_material_almoxarifado WHERE id = ?', [r.body.id]);
    assert.strictEqual(row.expira_em, null, 'reserva ganhou vencimento sem ninguém pedir');
  });

  await test('expira_em explícito no payload é gravado', async () => {
    const mat = await novoMaterial(db);
    const r = await request(app).post('/api/almoxarifado/reservas')
      .send({ material_id: mat, quantidade: 5, projeto_id: 1, expira_em: '2030-01-15', data_necessidade: '2029-12-01' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const row = await dbGet(db, 'SELECT expira_em, data_necessidade FROM reservas_material_almoxarifado WHERE id = ?', [r.body.id]);
    assert.strictEqual(row.expira_em, '2030-01-15');
    assert.strictEqual(row.data_necessidade, '2029-12-01');
  });

  await test('com a config `reserva_dias_validade`, expira_em é calculado', async () => {
    await setConfig(db, 'reserva_dias_validade', '10');
    const mat = await novoMaterial(db);
    const r = await request(app).post('/api/almoxarifado/reservas')
      .send({ material_id: mat, quantidade: 5, projeto_id: 1 });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const row = await dbGet(db, 'SELECT expira_em FROM reservas_material_almoxarifado WHERE id = ?', [r.body.id]);
    assert.ok(row.expira_em, 'config existe mas expira_em não foi calculado');
    const dias = Math.round((new Date(row.expira_em) - new Date()) / 86400000);
    assert.ok(dias >= 9 && dias <= 10, `esperava ~10 dias, veio ${dias} (${row.expira_em})`);
    await setConfig(db, 'reserva_dias_validade', '');  // volta ao opt-out para os testes seguintes
  });

  await test('[ponta a ponta] reserva criada com vencimento passado é expirada pelo job', async () => {
    const mat = await novoMaterial(db, 50);
    const r = await request(app).post('/api/almoxarifado/reservas')
      .send({ material_id: mat, quantidade: 20, projeto_id: 1, expira_em: '2020-01-01' });
    assert.strictEqual(await disponivel(db, mat), 30, 'reserva deveria ter reduzido o disponível');

    const job = await request(app).post('/api/almoxarifado/reservas/processar-expiracao').send({});
    assert.strictEqual(job.status, 200, JSON.stringify(job.body));
    assert.ok(job.body.processadas >= 1, `job não processou nada: ${JSON.stringify(job.body)}`);

    assert.strictEqual(await disponivel(db, mat), 50, 'saldo não voltou ao disponível');
    const row = await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [r.body.id]);
    assert.strictEqual(row.status, 'EXPIRADA');
  });

  // ── 2. cancelar requisição solta as reservas ──

  // A segregação (solicitante não aprova a própria) obriga DOIS usuários. SOLICITANTE cai no
  // fallback PRODUCAO, que tem `requisitar`; a aprovação volta para o ADMIN.
  const SOLICITANTE = { id: 500, nome: 'Solicitante Ciclo', role: 'usuario' };
  async function requisicaoAprovadaComReserva(db, mat, qtd) {
    setUser(SOLICITANTE);
    const req1 = await request(app).post('/api/almoxarifado/requisicoes')
      .send({ setor: 'Almoxarifado', departamento: 'Almoxarifado', itens: [{ material_id: mat, quantidade: qtd }] });
    assert.ok(req1.status < 400, `criação falhou: ${JSON.stringify(req1.body)}`);
    const reqId = req1.body.id || req1.body.requisicao?.id;
    assert.ok(reqId, `id da requisição não veio: ${JSON.stringify(req1.body)}`);

    setUser(ADMIN);
    const apr = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(apr.status, 200, `aprovação falhou: ${JSON.stringify(apr.body)}`);
    return reqId;
  }

  await test('cancelar requisição libera as reservas dela e devolve ao disponível', async () => {
    const mat = await novoMaterial(db, 100);
    const reqId = await requisicaoAprovadaComReserva(db, mat, 30);

    const ativas = await dbAll(db,
      `SELECT id FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'`, [reqId]);
    assert.ok(ativas.length >= 1, 'aprovação não criou reserva — setup inválido');
    assert.strictEqual(await disponivel(db, mat), 70, 'reserva deveria ter reduzido o disponível');

    const cancel = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/cancelar`).send({ motivo: 'desistiu' });
    assert.strictEqual(cancel.status, 200, JSON.stringify(cancel.body));

    assert.strictEqual(await disponivel(db, mat), 100, 'hold ficou preso após o cancelamento');
    const depois = await dbAll(db,
      `SELECT status, motivo_liberacao FROM reservas_material_almoxarifado WHERE requisicao_id = ?`, [reqId]);
    depois.forEach((row) => {
      assert.strictEqual(row.status, 'LIBERADA', `reserva ficou ${row.status}`);
      assert.ok(row.motivo_liberacao, 'liberação sem motivo registrado');
    });
  });

  await test('cancelar NÃO mexe em reserva manual de outro dono do mesmo material', async () => {
    const mat = await novoMaterial(db, 100);
    const manual = await request(app).post('/api/almoxarifado/reservas')
      .send({ material_id: mat, quantidade: 10, projeto_id: 99 });
    const reqId = await requisicaoAprovadaComReserva(db, mat, 20);
    assert.strictEqual(await disponivel(db, mat), 70, 'setup: 10 manual + 20 da requisição');

    await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/cancelar`).send({ motivo: 'x' });

    assert.strictEqual(await disponivel(db, mat), 90, 'deveria devolver só os 20 da requisição');
    const m = await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [manual.body.id]);
    assert.strictEqual(m.status, 'ATIVA', 'a reserva manual de terceiro foi liberada indevidamente');
  });

  await test('cancelar é idempotente do ponto de vista do saldo', async () => {
    const mat = await novoMaterial(db, 100);
    const reqId = await requisicaoAprovadaComReserva(db, mat, 40);
    await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/cancelar`).send({ motivo: 'um' });
    const dispDepois = await disponivel(db, mat);
    // segundo cancelamento é recusado pela máquina de estados, mas o saldo não pode mudar
    await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/cancelar`).send({ motivo: 'dois' });
    assert.strictEqual(await disponivel(db, mat), dispDepois, 'saldo mudou no segundo cancelamento');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
