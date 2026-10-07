/**
 * Etapa 74 (T0) — a base da reserva na chegada: a coluna `recebimento_id` da reserva (so pelo 4o
 * argumento do motor, nunca pelo body), as setas novas da maquina de estados da requisicao e a
 * funcao unica de prioridade (`compararPrioridade`), extraida da fila de separacao da 64.
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa74-reserva-na-chegada.md
 *
 * Executar: cd server && node tests/api/reservaChegadaBase.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const sm = require('../../services/almoxarifado/requisitionStateMachine');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
let seq = 0;

(async () => {
  console.log('\n=== Etapa 74 (T0): base da reserva na chegada ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const material = async (qtd = 0) => {
    const c = `E74B-M${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
      VALUES (?, ?, 'UN', ?, 1)`, [c, `Mat ${c}`, qtd])).lastID;
  };
  const req = async (m, extra = {}) => {
    const r = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, data_necessidade, created_at, ativo)
      VALUES (?, 1, 'Sol', 'APROVADO', ?, ?, ?, 1)`,
    [`REQ-E74B-${++seq}`, extra.urgencia || 'NORMAL', extra.data || null, extra.criado])).lastID;
    await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada)
      VALUES (?, ?, 1)`, [r, m]);
    return { id: r, urgencia: extra.urgencia || 'NORMAL', data_necessidade: extra.data || null, created_at: extra.criado };
  };

  // ── (a) a coluna nova, so pelo 4o argumento ──
  await test('[a] criarReserva com opcoes.recebimento_id grava a coluna (origem REQUISICAO com requisicao_id)', async () => {
    const m = await material(10);
    const r = await stockService.criarReserva(db, ADMIN, { material_id: m, quantidade: 3 },
      { sistema: true, requisicao_id: 999, item_requisicao_id: 998, recebimento_id: 4242 });
    const row = await dbGet(db, 'SELECT recebimento_id, origem, requisicao_id FROM reservas_material_almoxarifado WHERE id = ?', [r.id]);
    assert.deepStrictEqual({ ...row }, { recebimento_id: 4242, origem: 'REQUISICAO', requisicao_id: 999 });
  });

  await test('[a] sem opcoes.recebimento_id a coluna fica NULL (a reserva da aprovacao nao e "da chegada")', async () => {
    const m = await material(10);
    const r = await stockService.criarReserva(db, ADMIN, { material_id: m, quantidade: 1 }, { sistema: true, requisicao_id: 7 });
    const row = await dbGet(db, 'SELECT recebimento_id FROM reservas_material_almoxarifado WHERE id = ?', [r.id]);
    assert.strictEqual(row.recebimento_id, null);
  });

  await test('[a] POST /reservas com recebimento_id no BODY: 201 e a coluna fica NULL (nao forjavel)', async () => {
    const m = await material(10);
    const r = await request(app).post('/api/almoxarifado/reservas').send({ material_id: m, quantidade: 2, recebimento_id: 4242 });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const row = await dbGet(db, 'SELECT recebimento_id, origem FROM reservas_material_almoxarifado WHERE id = ?', [r.body.id]);
    assert.deepStrictEqual({ ...row }, { recebimento_id: null, origem: 'MANUAL' });
  });

  // ── (b) as setas novas da maquina ──
  await test('[b] validarTransicao aceita as setas da chegada e do estorno (D5)', async () => {
    const setas = [
      ['AGUARDANDO_ESTOQUE', 'PARCIALMENTE_RESERVADA'], ['AGUARDANDO_ESTOQUE', 'TOTALMENTE_RESERVADA'],
      ['AGUARDANDO_COMPRA', 'PARCIALMENTE_RESERVADA'], ['AGUARDANDO_COMPRA', 'TOTALMENTE_RESERVADA'],
      ['PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA'],
      ['PARCIALMENTE_RESERVADA', 'AGUARDANDO_ESTOQUE'], ['PARCIALMENTE_RESERVADA', 'AGUARDANDO_COMPRA'],
      ['PARCIALMENTE_RESERVADA', 'APROVADO'],
      ['TOTALMENTE_RESERVADA', 'AGUARDANDO_ESTOQUE'], ['TOTALMENTE_RESERVADA', 'AGUARDANDO_COMPRA'],
      ['TOTALMENTE_RESERVADA', 'APROVADO'], ['TOTALMENTE_RESERVADA', 'PARCIALMENTE_RESERVADA'],
      // as que ja existiam continuam
      ['APROVADO', 'TOTALMENTE_RESERVADA'], ['AGUARDANDO_ESTOQUE', 'EM_SEPARACAO'], ['TOTALMENTE_RESERVADA', 'CANCELADO'],
    ];
    for (const [de, para] of setas) assert.deepStrictEqual(sm.validarTransicao(de, para), { ok: true }, `${de} -> ${para}`);
  });

  await test('[b] e continua recusando o que nao e seta (AGUARDANDO_ESTOQUE -> ENTREGUE; EM_SEPARACAO/CANCELADO -> AGUARDANDO_*)', async () => {
    for (const [de, para] of [['AGUARDANDO_ESTOQUE', 'ENTREGUE'], ['EM_SEPARACAO', 'AGUARDANDO_ESTOQUE'],
      ['CANCELADO', 'AGUARDANDO_ESTOQUE'], ['PARCIALMENTE_ATENDIDA', 'TOTALMENTE_RESERVADA'],
      ['TOTALMENTE_RESERVADA', 'ENTREGUE'], ['AGUARDANDO_ESTOQUE', 'APROVADO']]) {
      const r = sm.validarTransicao(de, para);
      assert.strictEqual(r.ok, false, `${de} -> ${para} devia ser recusada`);
      assert.strictEqual(r.erro, `Transição inválida: ${de} → ${para}`);
    }
  });

  await test('[b] PODE_SEPARAR e PODE_ENTREGAR inalterados', async () => {
    assert.deepStrictEqual(sm.PODE_SEPARAR, ['APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA',
      'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA', 'EM_SEPARACAO', 'PARCIALMENTE_ATENDIDA']);
    assert.deepStrictEqual(sm.PODE_ENTREGAR, ['EM_SEPARACAO', 'PRONTA_PARA_RETIRADA', 'PARCIALMENTE_ATENDIDA']);
  });

  // ── (c) a ordem unica ──
  const m = await material(100);
  const normalSemDataAntiga = await req(m, { criado: '2026-07-01 08:00:00' });
  const normalCedo = await req(m, { data: '2026-10-05', criado: '2026-09-20 08:00:00' });
  const urgenteMinusculo = await req(m, { urgencia: 'urgente', criado: '2026-08-01 08:00:00' });
  const urgente = await req(m, { urgencia: 'URGENTE', criado: '2026-09-01 08:00:00' });
  const criticoNova = await req(m, { urgencia: 'CRITICO', criado: '2026-09-30 08:00:00' });
  const esperada = [criticoNova, urgenteMinusculo, urgente, normalCedo, normalSemDataAntiga].map((x) => x.id);

  await test('[c] compararPrioridade: CRITICO > URGENTE (minusculo legado conta) > resto; data cedo antes de sem data; mais antiga; id', async () => {
    assert.strictEqual(typeof requisitionService.compararPrioridade, 'function', 'compararPrioridade nao exportada');
    const embaralhada = [normalSemDataAntiga, urgente, criticoNova, normalCedo, urgenteMinusculo];
    const ordenada = [...embaralhada].sort(requisitionService.compararPrioridade).map((x) => x.id);
    assert.deepStrictEqual(ordenada, esperada);
    // desempate final por id
    const a = { urgencia: 'NORMAL', data_necessidade: null, created_at: '2026-01-01 00:00:00', id: 5 };
    const b = { ...a, id: 4 };
    assert.deepStrictEqual([a, b].sort(requisitionService.compararPrioridade).map((x) => x.id), [4, 5]);
  });

  await test('[c] GET /fila-separacao devolve as mesmas cinco na mesma ordem (regua unica)', async () => {
    const r = await request(app).get('/api/almoxarifado/fila-separacao');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const ids = r.body.map((x) => x.id).filter((id) => esperada.includes(id));
    assert.deepStrictEqual(ids, esperada);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
