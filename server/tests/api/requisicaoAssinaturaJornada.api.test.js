/**
 * Etapa 15, Task 5 — jornada de integração entregar → assinar, cruzando rotas REAIS
 * (plano 2026-08-28-almoxarifado-etapa15-mobilidade.md, Task 5; design, seção "Testes",
 * item "Integração cruzando galhos").
 *
 * Por que existe: a Task 1 prova a assinatura por unidade (status semeado direto no INSERT)
 * e o motor de entrega tem suíte própria — mas verde por unidade não prova que as partes
 * COMPÕEM. Aqui o status que habilita a assinatura vem do PUT /entregar de verdade (motor
 * de estoque real, stockService), e o ENCERRADA do RN-03 vem do PUT /encerrar de verdade.
 * Zero mock, zero UPDATE de status na mão.
 *
 * Jornada: EM_SEPARACAO (item 10 separado, material qtd 50) → entregar 4
 * (PARCIALMENTE_ATENDIDA) → assinar "Maria Recebedora" → entregar 6 (ENTREGUE) → assinar
 * "João Turno 2" → detalhe com 2 assinaturas em ordem → encerrar → terceira assinatura
 * ainda aceita (ENCERRADA, RN-03) → detalhe com 3 → saldo do material terminou 40.
 *
 * Executar: cd server && node tests/api/requisicaoAssinaturaJornada.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

// PNG 1x1 válido para anexar sem depender de arquivo em disco (mesmo da Task 1)
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

async function criarMaterial(db, codigo, qtd) {
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, quantidade_atual, ativo) VALUES (?,?,?,1)`,
    [codigo, `Material ${codigo}`, qtd]);
  return r.lastID;
}

async function criarRequisicaoEmSeparacao(db, materialId) {
  const reqRes = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
    (numero, solicitante_id, solicitante_nome, status) VALUES (?, 1, 'Solicitante Teste', 'EM_SEPARACAO')`,
    ['REQ-JORNADA-1']);
  const reqId = reqRes.lastID;
  const r = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
    (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
    VALUES (?, ?, 10, 10, 0, 0)`, [reqId, materialId]);
  return { id: reqId, itemId: r.lastID };
}

function entregar(app, reqId, itemId, quantidade) {
  return request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
    .send({ itens_atendidos: [{ item_id: itemId, quantidade_atendida: quantidade }] });
}

function postAssinatura(app, reqId, recebedor) {
  return request(app).post(`/api/almoxarifado/requisicoes/${reqId}/assinatura-entrega`)
    .field('recebedor_nome', recebedor)
    .attach('assinatura', PNG_1PX, 'assinatura.png');
}

(async () => {
  const ADMIN_USER = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
  const { app, db, close } = await createTestApp({ user: ADMIN_USER });

  const matId = await criarMaterial(db, 'JORNADA-MAT-1', 50);
  const { id: reqId, itemId } = await criarRequisicaoEmSeparacao(db, matId);

  // ── 1. entrega parcial pelo motor real → PARCIALMENTE_ATENDIDA ──
  await test('[entregar 4] motor real: 200 e status PARCIALMENTE_ATENDIDA', async () => {
    const res = await entregar(app, reqId, itemId, 4);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'PARCIALMENTE_ATENDIDA');
  });

  // ── 2. primeira assinatura sobre o status que a entrega REAL produziu ──
  await test('[assinar 1] "Maria Recebedora" sobre PARCIALMENTE_ATENDIDA vinda do motor → 201', async () => {
    const res = await postAssinatura(app, reqId, 'Maria Recebedora');
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.assinatura.recebedor_nome, 'Maria Recebedora');
  });

  // ── 3. entrega do resto → ENTREGUE ──
  await test('[entregar 6] segunda rodada do motor: 200 e status ENTREGUE', async () => {
    const res = await entregar(app, reqId, itemId, 6);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'ENTREGUE');
  });

  // ── 4. segunda assinatura (RN-04: append) ──
  await test('[assinar 2] "João Turno 2" sobre ENTREGUE → 201', async () => {
    const res = await postAssinatura(app, reqId, 'João Turno 2');
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.assinatura.recebedor_nome, 'João Turno 2');
  });

  // ── 5. detalhe traz as duas em ordem cronológica ──
  await test('[detalhe] GET traz 2 assinaturas na ordem (Maria antes de João)', async () => {
    const res = await request(app).get(`/api/almoxarifado/requisicoes/${reqId}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const lista = res.body.assinaturas_entrega;
    assert.ok(Array.isArray(lista), 'assinaturas_entrega deveria ser array');
    assert.strictEqual(lista.length, 2, `esperava 2 assinaturas, veio ${lista.length}`);
    assert.strictEqual(lista[0].recebedor_nome, 'Maria Recebedora', 'ordem deveria ser criado_em ASC, id ASC');
    assert.strictEqual(lista[1].recebedor_nome, 'João Turno 2');
  });

  // ── 6. encerramento pela rota real (gate aprovar_requisicao via can() inline) ──
  await test('[encerrar] PUT /encerrar → 200 e status ENCERRADA', async () => {
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/encerrar`)
      .send({ motivo: 'Fim da jornada de teste' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'ENCERRADA');
  });

  // ── 7. RN-03: ENCERRADA ainda assina (assinatura tardia do canhoto) ──
  await test('[assinar 3] requisição ENCERRADA ainda aceita assinatura (RN-03) → 201', async () => {
    const res = await postAssinatura(app, reqId, 'Carlos Conferente');
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  // ── 8. detalhe final com 3 assinaturas ──
  await test('[detalhe] após encerrar, GET traz 3 assinaturas', async () => {
    const res = await request(app).get(`/api/almoxarifado/requisicoes/${reqId}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const lista = res.body.assinaturas_entrega;
    assert.strictEqual(lista.length, 3, `esperava 3 assinaturas, veio ${lista.length}`);
    assert.strictEqual(lista[2].recebedor_nome, 'Carlos Conferente');
  });

  // ── 9. saldo do material provou que as entregas passaram pelo motor de verdade ──
  await test('[saldo] quantidade_atual do material terminou 40 (50 - 4 - 6)', async () => {
    const mat = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(mat.quantidade_atual, 40);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
