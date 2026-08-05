/**
 * Etapa 3 (review final) — GET /api/almoxarifado/dashboard/requisicoes ignorava os status
 * novos da máquina de estados (AGUARDANDO_ESTOQUE, AGUARDANDO_COMPRA, PRONTA_PARA_RETIRADA,
 * AGUARDANDO_APROVACAO_VALOR): a lista "abertas" e o KPI requisicoesEncerradas só conheciam
 * o conjunto de status pré-Etapa-3. Arquivo isolado (db próprio) porque a rota real usa
 * ORDER BY created_at ASC + LIMIT 5 na lista "abertas" — dividir estado com outros arquivos
 * tornaria o teste dependente da ordem/volume de requisições criadas em outro lugar.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

let seq = 0;
function numero() {
  seq += 1;
  return `REQ-DASH-${seq}`;
}

async function criarRequisicao(db, { status, itens, solicitanteId = 1 }) {
  const reqRes = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
    (numero, solicitante_id, solicitante_nome, status) VALUES (?, ?, 'Solicitante Teste', ?)`,
    [numero(), solicitanteId, status]);
  const reqId = reqRes.lastID;
  for (const item of itens) {
    await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue)
      VALUES (?, ?, ?, 0, 0)`,
      [reqId, item.material_id, item.quantidade ?? 1]);
  }
  return { id: reqId };
}

(async () => {
  const ADMIN_USER = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
  const { app, db, close } = await createTestApp({ user: ADMIN_USER });

  const matId = (await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, ativo) VALUES ('MATDASH-01','Material Dashboard',0,1)`)).lastID;

  await test('[dashboard] AGUARDANDO_ESTOQUE aparece em "abertas"', async () => {
    const { id: reqId } = await criarRequisicao(db, { status: 'AGUARDANDO_ESTOQUE', itens: [{ material_id: matId }] });
    const res = await request(app).get('/api/almoxarifado/dashboard/requisicoes');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const ids = res.body.abertas.map((r) => Number(r.id));
    assert.ok(ids.includes(reqId), `esperava ${reqId} (AGUARDANDO_ESTOQUE) em abertas: ${JSON.stringify(ids)}`);
  });

  await test('[dashboard] AGUARDANDO_COMPRA aparece em "abertas"', async () => {
    const { id: reqId } = await criarRequisicao(db, { status: 'AGUARDANDO_COMPRA', itens: [{ material_id: matId }] });
    const res = await request(app).get('/api/almoxarifado/dashboard/requisicoes');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const ids = res.body.abertas.map((r) => Number(r.id));
    assert.ok(ids.includes(reqId), `esperava ${reqId} (AGUARDANDO_COMPRA) em abertas: ${JSON.stringify(ids)}`);
  });

  await test('[dashboard] PRONTA_PARA_RETIRADA aparece em "abertas"', async () => {
    const { id: reqId } = await criarRequisicao(db, { status: 'PRONTA_PARA_RETIRADA', itens: [{ material_id: matId }] });
    const res = await request(app).get('/api/almoxarifado/dashboard/requisicoes');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const ids = res.body.abertas.map((r) => Number(r.id));
    assert.ok(ids.includes(reqId), `esperava ${reqId} (PRONTA_PARA_RETIRADA) em abertas: ${JSON.stringify(ids)}`);
  });

  await test('[dashboard] AGUARDANDO_APROVACAO_VALOR aparece em "abertas"', async () => {
    const { id: reqId } = await criarRequisicao(db, { status: 'AGUARDANDO_APROVACAO_VALOR', itens: [{ material_id: matId }] });
    const res = await request(app).get('/api/almoxarifado/dashboard/requisicoes');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const ids = res.body.abertas.map((r) => Number(r.id));
    assert.ok(ids.includes(reqId), `esperava ${reqId} (AGUARDANDO_APROVACAO_VALOR) em abertas: ${JSON.stringify(ids)}`);
  });

  await test('[dashboard] ENCERRADA conta no KPI requisicoesEncerradas (junto com ENTREGUE)', async () => {
    await criarRequisicao(db, { status: 'ENTREGUE', itens: [{ material_id: matId }] });
    await criarRequisicao(db, { status: 'ENCERRADA', itens: [{ material_id: matId }] });

    const esperado = await dbGet(db,
      `SELECT COUNT(*) as n FROM requisicoes_almoxarifado WHERE status IN ('ENTREGUE','ENCERRADA')`);
    const res = await request(app).get('/api/almoxarifado/dashboard/requisicoes');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.requisicoesEncerradas, esperado.n);
    assert.ok(esperado.n >= 2, 'sanity: deveria haver ao menos as 2 requisições recém-criadas');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
