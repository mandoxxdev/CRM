/**
 * Etapa 69, T1 — a `SUCATA` do material REPROVADO baixa do BLOQUEADO (`opcoes.doBloqueado`).
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa69-sucatear-reprovado.md (T1, RN-01, RN-02)
 * Molde: devolucaoFornecedorMotor.api.test.js (Etapa 45 — o mesmo claim de `baixandoBloqueado`).
 *
 * ── O QUE CADA CENARIO PRENDE ────────────────────────────────────────────────────────────────
 *   (1)  RN-01: a baixa tira do fisico E do bloqueado, exatamente — o disponivel (aprovado) intacto
 *   (2)  RN-01 metade positiva: SEM a opcao, `SUCATA` e a de hoje (recusa pelo disponivel)
 *   (3)  bloqueado insuficiente recusa com a literal da SUCATA e os DOIS numeros
 *   (4)  fisico insuficiente recusa (`bloqueada > atual` e alcancavel)
 *   (5)  a opcao com tipo != SUCATA -> 400 literal, nada muda
 *   (6)  a v2 recusa `SUCATA`; e `doBloqueado` no BODY nao vale nada (a PERDA nao baixa do bloqueado)
 *   (7)  falha DEPOIS do claim devolve o estado anterior com igualdade EXATA (sem compensar em dobro)
 *   (8)  RN-02: o estorno da SUCATA de um sucateamento LIGADO a NC e recusado, nada muda
 *   (9)  RN-02 metade positiva: o estorno da SUCATA de um sucateamento COMUM continua aceito
 *   (10) `exigeSerie` continua recusando material serializado com a opcao ligada
 *
 * Executar: cd server && node tests/api/sucataBloqueadoMotor.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stock = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 6910, nome: 'Admin E69', role: 'admin', is_superadmin: 1, email: 'admin69@test.com' };

let seq = 0;
const uniq = (p) => `${p}-${Date.now() % 1000000}-${++seq}`;

async function erroDe(fn) {
  try { await fn(); return null; } catch (e) { return { message: e.message, status: e.status }; }
}

const LITERAL_ESTORNO = 'Sucateamento de material reprovado não pode ser estornado pelo livro — o material voltaria ao estoque disponível com a não conformidade dizendo que foi sucateado';

(async () => {
  console.log('\n=== Etapa 69 T1: SUCATA do bloqueado no motor ===\n');
  const { app, db, close } = await createTestApp({ user: { ...ADMIN } });

  async function novoMaterial({ atual = 10, bloqueada = 3, serie = 0 } = {}) {
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_bloqueada, ativo, controle_serie)
      VALUES (?,?,'KG',?,?,1,?)`,
      [uniq('MAT-E69'), 'Chapa da Etapa 69', atual, bloqueada, serie]);
    return r.lastID;
  }

  const saldos = (id) => dbGet(db, `SELECT quantidade_atual, quantidade_bloqueada,
      quantidade_atual - COALESCE(quantidade_bloqueada,0) AS livre
    FROM materiais_almoxarifado WHERE id = ?`, [id]);

  const sucatear = (materialId, quantidade, extra = {}, opcoes = { doBloqueado: true }) =>
    stock.registrarMovimentacao(db, ADMIN, {
      material_id: materialId, tipo: 'SUCATA', quantidade,
      justificativa: 'material reprovado na inspecao, sucateado', motivo: 'Sucateamento de material reprovado',
      ...extra,
    }, opcoes);

  async function novoSucateamento(materialId, quantidade, ncId) {
    const r = await dbRun(db, `INSERT INTO sucateamentos_almoxarifado
      (material_id, quantidade, justificativa, status, solicitante_id, nao_conformidade_id)
      VALUES (?,?,'teste','APROVADO',1,?)`, [materialId, quantidade, ncId]);
    return r.lastID;
  }

  // ── (1) ───────────────────────────────────────────────────────────────────────────────────
  await test('(1) RN-01: SUCATA doBloqueado tira do fisico E do bloqueado; o aprovado nao e tocado', async () => {
    const id = await novoMaterial({ atual: 10, bloqueada: 3 });

    await sucatear(id, 3);

    const s = await saldos(id);
    assert.strictEqual(s.quantidade_atual, 7, `fisico ${s.quantidade_atual}`);
    assert.strictEqual(s.quantidade_bloqueada, 0, `bloqueado ${s.quantidade_bloqueada}`);
    assert.strictEqual(s.livre, 7, `o disponivel (o APROVADO) mudou: ${s.livre}`);
    const mov = await dbGet(db, `SELECT tipo, quantidade, saldo_anterior, saldo_posterior
      FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id DESC LIMIT 1`, [id]);
    assert.strictEqual(mov.tipo, 'SUCATA', 'o livro nao ganhou a linha SUCATA (o tipo continua SUCATA — D2)');
    assert.strictEqual(mov.saldo_anterior, 10);
    assert.strictEqual(mov.saldo_posterior, 7);
  });

  // ── (2) metade positiva ───────────────────────────────────────────────────────────────────
  await test('(2) RN-01: sem a opcao, SUCATA de material todo bloqueado recusa como hoje', async () => {
    const id = await novoMaterial({ atual: 3, bloqueada: 3 });

    const e = await erroDe(() => sucatear(id, 3, {}, {}));

    assert.ok(e, 'SUCATA sem a opcao baixou material bloqueado');
    assert.strictEqual(e.status, 400);
    assert.strictEqual(e.message, 'Saldo insuficiente. Disponível: 0 KG');
    const s = await saldos(id);
    assert.strictEqual(s.quantidade_atual, 3);
    assert.strictEqual(s.quantidade_bloqueada, 3);

    // `doBloqueado: false` explicito tambem e "sem a opcao".
    const e2 = await erroDe(() => sucatear(id, 3, {}, { doBloqueado: false }));
    assert.ok(e2 && e2.message === 'Saldo insuficiente. Disponível: 0 KG', `doBloqueado:false: ${e2 && e2.message}`);
  });

  // ── (3) e (4) — as duas guardas do claim ──────────────────────────────────────────────────
  await test('(3) bloqueado insuficiente recusa com a literal da SUCATA e os dois numeros', async () => {
    const id = await novoMaterial({ atual: 10, bloqueada: 2 });

    const e = await erroDe(() => sucatear(id, 3));

    assert.ok(e, 'a sucata passou com bloqueado menor que o pedido');
    assert.strictEqual(e.status, 400);
    assert.strictEqual(e.message, 'Sucateamento acima do que está bloqueado: há 2 KG bloqueado(s) (físico: 10)');
    const s = await saldos(id);
    assert.strictEqual(s.quantidade_atual, 10, 'a recusa mexeu no fisico');
    assert.strictEqual(s.quantidade_bloqueada, 2, 'a recusa mexeu no bloqueado');
  });

  await test('(4) fisico insuficiente recusa, mesmo com bloqueado suficiente', async () => {
    const id = await novoMaterial({ atual: 2, bloqueada: 5 });

    const e = await erroDe(() => sucatear(id, 4));

    assert.ok(e, 'a sucata passou com fisico menor que o pedido');
    assert.strictEqual(e.status, 400);
    assert.ok(/^Sucateamento acima do que está bloqueado: há 5 KG bloqueado\(s\) \(físico: 2\)$/.test(e.message), e.message);
    const s = await saldos(id);
    assert.strictEqual(s.quantidade_atual, 2);
    assert.strictEqual(s.quantidade_bloqueada, 5);
  });

  // ── (5) ───────────────────────────────────────────────────────────────────────────────────
  await test('(5) doBloqueado com tipo diferente de SUCATA -> 400 literal, nada muda', async () => {
    const id = await novoMaterial({ atual: 10, bloqueada: 3 });

    const e = await erroDe(() => stock.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'PERDA', quantidade: 3, justificativa: 'perda', motivo: 'perda',
    }, { doBloqueado: true }));

    assert.ok(e, 'PERDA com doBloqueado passou');
    assert.strictEqual(e.status, 400);
    assert.strictEqual(e.message, 'doBloqueado só vale para SUCATA');
    const s = await saldos(id);
    assert.strictEqual(s.quantidade_atual, 10);
    assert.strictEqual(s.quantidade_bloqueada, 3);

    // Metade positiva: a mesma PERDA sem a opcao segue o caminho de hoje (sai do disponivel).
    await stock.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'PERDA', quantidade: 3, justificativa: 'perda', motivo: 'perda',
    });
    const s2 = await saldos(id);
    assert.strictEqual(s2.quantidade_atual, 7);
    assert.strictEqual(s2.quantidade_bloqueada, 3, 'PERDA comum mexeu no bloqueado');
  });

  // ── (6) ───────────────────────────────────────────────────────────────────────────────────
  await test('(6) a v2 recusa SUCATA, e doBloqueado no BODY nao baixa do bloqueado', async () => {
    const id = await novoMaterial({ atual: 3, bloqueada: 3 });

    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({
      material_id: id, tipo: 'SUCATA', quantidade: 3, justificativa: 'por fora', doBloqueado: true,
    });
    assert.strictEqual(r.status, 400, `SUCATA na v2: ${r.status} ${JSON.stringify(r.body)}`);

    // PERDA (publica na v2) com `doBloqueado` no body: se o motor lesse a opcao do body, a perda
    // baixaria o bloqueado; lendo so do 4o argumento, ela toma a recusa do disponivel (0).
    const r2 = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({
      material_id: id, tipo: 'PERDA', quantidade: 3, justificativa: 'por fora', motivo: 'perda', doBloqueado: true,
    });
    assert.strictEqual(r2.status, 400, `PERDA com doBloqueado no body: ${r2.status} ${JSON.stringify(r2.body)}`);
    const s = await saldos(id);
    assert.strictEqual(s.quantidade_atual, 3, 'a v2 mexeu no fisico');
    assert.strictEqual(s.quantidade_bloqueada, 3, 'a v2 mexeu no bloqueado');
  });

  // ── (7) — a compensacao, com igualdade EXATA ──────────────────────────────────────────────
  await test('(7) falha DEPOIS do claim devolve o estado anterior — sem compensar em dobro', async () => {
    const id = await novoMaterial({ atual: 100, bloqueada: 3 });
    await dbRun(db, `CREATE TRIGGER trg_e69_falha_ledger BEFORE INSERT ON movimentacoes_almoxarifado
      WHEN NEW.tipo = 'SUCATA' AND NEW.material_id = ${id}
      BEGIN SELECT RAISE(ABORT, 'disco cheio'); END`);

    const e = await erroDe(() => sucatear(id, 3));
    await dbRun(db, 'DROP TRIGGER trg_e69_falha_ledger');

    assert.ok(e, 'a sucata passou com o ledger abortando');
    const s = await saldos(id);
    assert.strictEqual(s.quantidade_atual, 100, `fisico ${s.quantidade_atual}, esperava exatamente 100`);
    assert.strictEqual(s.quantidade_bloqueada, 3, `bloqueado ${s.quantidade_bloqueada}, esperava exatamente 3`);
  });

  // ── (8) e (9) — o estorno ─────────────────────────────────────────────────────────────────
  await test('(8) RN-02: estornar a SUCATA de um sucateamento LIGADO a NC e recusado, nada muda', async () => {
    const id = await novoMaterial({ atual: 10, bloqueada: 3 });
    const sucId = await novoSucateamento(id, 3, 999);
    const mov = await sucatear(id, 3, { referencia: `SUC-${sucId}` });

    const e = await erroDe(() => stock.cancelarMovimentacao(db, ADMIN, mov.id, 'engano'));

    assert.ok(e, 'o estorno da sucata do reprovado passou');
    assert.strictEqual(e.status, 400);
    assert.strictEqual(e.message, LITERAL_ESTORNO);
    const s = await saldos(id);
    assert.strictEqual(s.quantidade_atual, 7, 'o estorno recusado mexeu no fisico');
    assert.strictEqual(s.quantidade_bloqueada, 0, 'o estorno recusado mexeu no bloqueado');
    const linha = await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [mov.id]);
    assert.ok(!linha.cancelado, 'a linha original ficou marcada cancelada');

    // E pela ROTA do livro, a mesma literal.
    const r = await request(app).post(`/api/almoxarifado/movimentacoes/${mov.id}/cancelar`).send({ motivo: 'engano' });
    assert.strictEqual(r.status, 400, `rota: ${r.status} ${JSON.stringify(r.body)}`);
    assert.ok(JSON.stringify(r.body).includes('Sucateamento de material reprovado não pode ser estornado'), JSON.stringify(r.body));
  });

  await test('(9) RN-02 metade positiva: a SUCATA de um sucateamento COMUM continua estornavel', async () => {
    const id = await novoMaterial({ atual: 10, bloqueada: 0 });
    const sucId = await novoSucateamento(id, 3, null);
    const mov = await sucatear(id, 3, { referencia: `SUC-${sucId}` }, {});
    assert.strictEqual((await saldos(id)).quantidade_atual, 7);

    await stock.cancelarMovimentacao(db, ADMIN, mov.id, 'sucateado por engano');

    const s = await saldos(id);
    assert.strictEqual(s.quantidade_atual, 10, 'o estorno comum nao devolveu ao fisico');
    assert.strictEqual(s.livre, 10, 'o estorno comum nao voltou ao disponivel');
  });

  // ── (10) ──────────────────────────────────────────────────────────────────────────────────
  await test('(10) exigeSerie recusa material serializado com doBloqueado; sem serie passa', async () => {
    const id = await novoMaterial({ atual: 10, bloqueada: 3, serie: 1 });
    const e = await erroDe(() => sucatear(id, 3, {}, { doBloqueado: true, exigeSerie: true }));
    assert.ok(e, 'o motor baixou material serializado sem exigir as series');
    const s = await saldos(id);
    assert.strictEqual(s.quantidade_atual, 10);
    assert.strictEqual(s.quantidade_bloqueada, 3);

    const semSerie = await novoMaterial({ atual: 10, bloqueada: 3 });
    await sucatear(semSerie, 3, {}, { doBloqueado: true, exigeSerie: true });
    const ok = await saldos(semSerie);
    assert.strictEqual(ok.quantidade_atual, 7);
    assert.strictEqual(ok.quantidade_bloqueada, 0);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
