/**
 * Etapa 91 (T5, C141, B426) — o cancelamento pelos outros modulos solta as reservas.
 *
 * `PUT /api/requisicoes-material/:id/cancelar` (o solicitante cancela a propria requisicao fora do
 * almoxarifado) so fazia o `UPDATE` guardado para CANCELADO: a reserva ATIVA da requisicao ficava presa
 * (sonda da Fase 0: de APROVADO -> 200, CANCELADO, reserva ainda ATIVA 4, material r=4, disponivel 0) —
 * e como o recalculo da 76 nao toca requisicao cancelada e a expiracao e opt-in, presa para sempre. O
 * cancelamento do almoxarifado (`routes/almoxarifado.js`) ja soltava desde a Etapa 4.
 *
 * Agora a rota e `async`: mantem o `UPDATE` guardado e o 400 de hoje; depois solta as reservas por
 * `reservationService.liberarReservasDaRequisicao` (best-effort: L2 se lancar, L2b se voltar com erros) e
 * grava a auditoria CANCELAMENTO (best-effort: L3). Resposta inalterada: `{ success: true }`.
 *
 * RN-10 (a)-(e). Plano: docs/superpowers/plans/2026-10-08-almoxarifado-etapa91-inversao-inspecao-aprovar.md (T5)
 *
 * Executar: cd server && node tests/api/requisicaoCancelarOutrosModulosReserva.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const reservationService = require('../../services/almoxarifado/reservationService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Adm 91T5', role: 'admin', is_superadmin: 1, email: 'a91t5@t.com' };
const S = { id: 9151, nome: 'Solicitante 91T5', role: 'user', email: 's91t5@t.com' }; // sem perfil
const OUTRO = { id: 9152, nome: 'Outro 91T5', role: 'user', email: 'o91t5@t.com' };
const RECUSA = 'Requisição não encontrada ou não pode ser cancelada';
const MOTIVO_MOV = 'Liberação por cancelamento de requisição';
// Literais congeladas do plano (Contrato, L2/L2b).
const L2 = (id, msg) => `[requisicoes-material] liberacao das reservas no cancelamento falhou (requisicao ${id}): ${msg}`;
const L2b = (id, erros) => `[requisicoes-material] liberacao das reservas no cancelamento deixou ${erros.length} reserva(s) presa(s) (requisicao ${id}): ${erros.map((x) => `${x.id}: ${x.erro}`).join('; ')}`;
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 91 (T5): o cancelamento pelos outros modulos solta as reservas (C141) ===\n');
  const { app, db, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };

  const material = async (q) => {
    const c = `E91T5-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, material_critico)
      VALUES (?, ?, 'PC', ?, 0, 1, 0)`, [c, `Mat ${c}`, q])).lastID;
  };
  // Requisicao criada por S pela rota dos outros modulos; o status e a reserva de 4 sao montados pelo
  // servico (estado de janela/falha — Fase 0 §5: no fluxo normal APROVADO ja seria TOTALMENTE_RESERVADA).
  const montar = async (status) => {
    const m = await material(4);
    const cr = await as(S, () => request(app).post('/api/requisicoes-material').send({
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-91T5', itens: [{ material_id: m, quantidade: 4 }],
    }).then((x) => x));
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    const R = cr.body.id;
    assert.strictEqual(Number((await dbGet(db, 'SELECT solicitante_id FROM requisicoes_almoxarifado WHERE id = ?', [R])).solicitante_id), S.id);
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R])).id;
    const rv = await stockService.criarReserva(db, ADMIN, { material_id: m, quantidade: 4 }, { requisicao_id: R, item_requisicao_id: item });
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET status = ? WHERE id = ?', [status, R]);
    const r = await dbGet(db, 'SELECT * FROM reservas_material_almoxarifado WHERE id = ?', [rv.id]);
    assert.deepStrictEqual([r.status, r.origem, Number(r.quantidade)], ['ATIVA', 'REQUISICAO', 4]);
    return { m, R, rid: rv.id };
  };
  const cancelar = (u, R) => as(u, () => request(app).put(`/api/requisicoes-material/${R}/cancelar`).send({}).then((x) => x));
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const reserva = (id) => dbGet(db, 'SELECT * FROM reservas_material_almoxarifado WHERE id = ?', [id]);
  const reservada = async (m) => Number((await dbGet(db, 'SELECT COALESCE(quantidade_reservada,0) r FROM materiais_almoxarifado WHERE id = ?', [m])).r);
  const liberacoes = (m) => dbAll(db, `SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'LIBERACAO_RESERVA'`, [m]);
  const trilha = (R) => dbAll(db, `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao' AND entidade_id = ? AND acao = 'CANCELAMENTO'`, [R]);
  const comWarns = async (fn) => {
    const orig = console.warn; const linhas = [];
    console.warn = (...a) => { linhas.push(a.map(String).join(' ')); };
    try { return { out: await fn(), linhas }; } finally { console.warn = orig; }
  };

  // ══════════════ (a)/(b) — cancela e solta ══════════════
  for (const [rotulo, status] of [['(a)', 'APROVADO'], ['(b)', 'PENDENTE']]) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[91 RN-10] ${rotulo} de ${status} com reserva ATIVA 4: S cancela -> 200 {success:true}, CANCELADO, reserva LIBERADA, r=0, uma LIBERACAO_RESERVA, auditoria CANCELAMENTO`, async () => {
      const { m, R, rid } = await montar(status);
      assert.strictEqual(await reservada(m), 4);
      const c = await cancelar(S, R);
      assert.strictEqual(c.status, 200, JSON.stringify(c.body));
      assert.deepStrictEqual(c.body, { success: true });
      assert.strictEqual(await st(R), 'CANCELADO');
      const rv = await reserva(rid);
      assert.strictEqual(rv.status, 'LIBERADA', `a reserva ficou ${rv.status} (presa)`);
      assert.strictEqual(await reservada(m), 0, 'o material ficou com hold preso');
      const libs = await liberacoes(m);
      assert.strictEqual(libs.length, 1, JSON.stringify(libs));
      assert.strictEqual(libs[0].motivo, MOTIVO_MOV);
      assert.strictEqual(Number(libs[0].reserva_id), rid);
      const t = await trilha(R);
      assert.strictEqual(t.length, 1, `trilha de cancelamento: ${JSON.stringify(t)}`);
      assert.strictEqual(JSON.parse(t[0].dados_anteriores).status, status);
      const novos = JSON.parse(t[0].dados_novos);
      assert.strictEqual(novos.status, 'CANCELADO');
      assert.strictEqual(novos.via, 'requisicoes-material');
      assert.strictEqual(Number(t[0].usuario_id), S.id);
    });
  }

  // ══════════════ (c)/(d) — recusas inalteradas ══════════════
  await test('[91 RN-10] (c) outro usuario (nao S) -> 400 de hoje, reserva ATIVA, status igual, sem trilha', async () => {
    const { m, R, rid } = await montar('APROVADO');
    const c = await cancelar(OUTRO, R);
    assert.strictEqual(c.status, 400, JSON.stringify(c.body));
    assert.strictEqual(c.body.error, RECUSA);
    assert.strictEqual(await st(R), 'APROVADO');
    assert.strictEqual((await reserva(rid)).status, 'ATIVA');
    assert.strictEqual(await reservada(m), 4);
    assert.strictEqual((await trilha(R)).length, 0);
  });

  // Invertido na Etapa 92 (B434) — a regra mudou: a 91 declarava o 400 aqui (B426, "cancelar ja reservada
  // pelos outros modulos fica de fora"); a tela sempre ofereceu o botao nesse status, e agora a rota aceita.
  await test('[91 RN-10] (d) TOTALMENTE_RESERVADA -> 200, CANCELADO, reserva LIBERADA (invertido na Etapa 92, B434)', async () => {
    const { m, R, rid } = await montar('TOTALMENTE_RESERVADA');
    const c = await cancelar(S, R);
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.deepStrictEqual(c.body, { success: true });
    assert.strictEqual(await st(R), 'CANCELADO');
    assert.strictEqual((await reserva(rid)).status, 'LIBERADA');
    assert.strictEqual(await reservada(m), 0);
  });

  // ══════════════ (e) — falhas best-effort ══════════════
  await test('[91 RN-10] (e1) stockService.liberarReserva falha -> 200, CANCELADO, reserva ainda ATIVA, warn do servico E warn L2b da rota', async () => {
    const { R, rid } = await montar('APROVADO');
    const orig = stockService.liberarReserva;
    stockService.liberarReserva = async () => { throw new Error('falha injetada 91T5'); };
    let res;
    try { res = await comWarns(() => cancelar(S, R)); } finally { stockService.liberarReserva = orig; }
    const { out: c, linhas } = res;
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.deepStrictEqual(c.body, { success: true });
    assert.strictEqual(await st(R), 'CANCELADO');
    assert.strictEqual((await reserva(rid)).status, 'ATIVA');
    assert.ok(linhas.some((l) => l.startsWith('[almoxarifado-reservas] Falha ao liberar reserva') && l.includes('falha injetada 91T5')),
      `sem o warn do servico: ${JSON.stringify(linhas)}`);
    const esperado = L2b(R, [{ id: rid, erro: 'falha injetada 91T5' }]);
    assert.ok(linhas.includes(esperado), `sem o warn L2b "${esperado}": ${JSON.stringify(linhas)}`);
    assert.strictEqual((await trilha(R)).length, 1, 'a auditoria tem de sair mesmo com a liberacao falhando');
  });

  await test('[91 RN-10] (e2) reservationService.liberarReservasDaRequisicao LANCA -> 200, CANCELADO, warn L2', async () => {
    const { R, rid } = await montar('APROVADO');
    const orig = reservationService.liberarReservasDaRequisicao;
    let chamada = 0;
    reservationService.liberarReservasDaRequisicao = async () => { chamada++; throw new Error('banco caiu 91T5'); };
    let res;
    try { res = await comWarns(() => cancelar(S, R)); } finally { reservationService.liberarReservasDaRequisicao = orig; }
    const { out: c, linhas } = res;
    assert.strictEqual(chamada, 1, 'o patch nao mordeu: a rota nao chama liberarReservasDaRequisicao pelo objeto do modulo');
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.deepStrictEqual(c.body, { success: true });
    assert.strictEqual(await st(R), 'CANCELADO');
    assert.strictEqual((await reserva(rid)).status, 'ATIVA');
    assert.ok(linhas.includes(L2(R, 'banco caiu 91T5')), `sem o warn L2: ${JSON.stringify(linhas)}`);
    assert.strictEqual((await trilha(R)).length, 1, 'a auditoria tem de sair mesmo com a liberacao lancando');
  });


  // ══════════════ Etapa 92 (T1, C149, B434/B435) — os seis status da tela, compare-and-set ══════════════
  const CANCELAVEIS = ['PENDENTE', 'APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA', 'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA'];
  const SEM_RESERVA = ['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'];
  // Requisicao de S no status, com reserva ATIVA de 4 (menos nos AGUARDANDO_*, que esperam saldo).
  const montar92 = async (status, { reservar = !SEM_RESERVA.includes(status) } = {}) => {
    if (reservar) return montar(status);
    const m = await material(4);
    const cr = await as(S, () => request(app).post('/api/requisicoes-material').send({
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-92T1', itens: [{ material_id: m, quantidade: 4 }],
    }).then((x) => x));
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET status = ? WHERE id = ?', [status, cr.body.id]);
    return { m, R: cr.body.id, rid: null };
  };

  for (const status of CANCELAVEIS) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[92 RN-01] (a) ${status}: S cancela pelos outros modulos -> 200, CANCELADO, reserva solta, r=0, uma trilha com o status de antes`, async () => {
      const { m, R, rid } = await montar92(status);
      const c = await cancelar(S, R);
      assert.strictEqual(c.status, 200, JSON.stringify(c.body));
      assert.deepStrictEqual(c.body, { success: true });
      assert.strictEqual(await st(R), 'CANCELADO');
      if (rid) {
        assert.strictEqual((await reserva(rid)).status, 'LIBERADA');
        const libs = await liberacoes(m);
        assert.strictEqual(libs.length, 1, JSON.stringify(libs));
        assert.strictEqual(libs[0].motivo, MOTIVO_MOV);
      } else {
        assert.strictEqual((await liberacoes(m)).length, 0);
      }
      assert.strictEqual(await reservada(m), 0);
      const t = await trilha(R);
      assert.strictEqual(t.length, 1, JSON.stringify(t));
      assert.strictEqual(JSON.parse(t[0].dados_anteriores).status, status);
      const novos = JSON.parse(t[0].dados_novos);
      assert.strictEqual(novos.status, 'CANCELADO');
      assert.strictEqual(novos.via, 'requisicoes-material');
      assert.strictEqual(Number(t[0].usuario_id), S.id);
    });
  }

  for (const status of ['RASCUNHO', 'AGUARDANDO_APROVACAO_VALOR', 'EM_SEPARACAO', 'PRONTA_PARA_RETIRADA',
    'PARCIALMENTE_ATENDIDA', 'ENTREGUE', 'ENCERRADA', 'REJEITADO', 'CANCELADO']) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[92 RN-01] (b) ${status}: S tenta cancelar -> 400 R1, nada muda, sem trilha`, async () => {
      const { R } = await montar92(status, { reservar: false });
      const c = await cancelar(S, R);
      assert.strictEqual(c.status, 400, JSON.stringify(c.body));
      assert.strictEqual(c.body.error, RECUSA);
      assert.strictEqual(await st(R), status);
      assert.strictEqual((await trilha(R)).length, 0);
    });
  }

  for (const status of CANCELAVEIS) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[92 RN-01] (c) ${status}: OUTRO usuario -> 400 R1, status igual, reserva ATIVA`, async () => {
      const { m, R, rid } = await montar92(status);
      const c = await cancelar(OUTRO, R);
      assert.strictEqual(c.status, 400, JSON.stringify(c.body));
      assert.strictEqual(c.body.error, RECUSA);
      assert.strictEqual(await st(R), status);
      if (rid) {
        assert.strictEqual((await reserva(rid)).status, 'ATIVA');
        assert.strictEqual(await reservada(m), 4);
      }
      assert.strictEqual((await trilha(R)).length, 0);
    });
  }

  // (Fase 5, B439) o administrador que NAO pediu tambem nao cancela por esta porta — so pela do
  // almoxarifado. Um superadmin e um role 'admin' sem superadmin, nos seis status.
  const ADM_ROLE = { id: 9153, nome: 'Admin role 92', role: 'admin', email: 'ar92@t.com' };
  for (const [rotulo, u] of [['superadmin', ADMIN], ["role 'admin'", ADM_ROLE]]) {
    for (const status of CANCELAVEIS) {
      // eslint-disable-next-line no-await-in-loop
      await test(`[92 RN-01] (c') ${status}: ${rotulo} que nao e S -> 400 R1, status igual, reserva ATIVA, sem trilha (B439)`, async () => {
        const { m, R, rid } = await montar92(status);
        const c = await cancelar(u, R);
        assert.strictEqual(c.status, 400, JSON.stringify(c.body));
        assert.strictEqual(c.body.error, RECUSA);
        assert.strictEqual(await st(R), status);
        if (rid) {
          assert.strictEqual((await reserva(rid)).status, 'ATIVA');
          assert.strictEqual(await reservada(m), 4);
        }
        assert.strictEqual((await trilha(R)).length, 0);
      });
    }
  }

  await test('[92 RN-01] (d) id inexistente -> 400 R1', async () => {
    const c = await cancelar(S, 987654);
    assert.strictEqual(c.status, 400, JSON.stringify(c.body));
    assert.strictEqual(c.body.error, RECUSA);
  });

  // ── RN-02: gancho no UPDATE ... SET status='CANCELADO' da rota; o status muda no instante ──
  const RE_CANCELADO = /SET\s+status\s*=\s*'CANCELADO'/;
  const comGancho = async (trocas, fn) => {
    // trocas: lista de status a gravar, um por emissao do UPDATE (na ordem); depois disso, emissao livre.
    const origRun = db.run;
    const run = origRun.bind(db);
    let emissoes = 0;
    const fila = [...trocas];
    db.run = function (sql, ...rest) {
      if (RE_CANCELADO.test(String(sql))) {
        emissoes++;
        if (fila.length) {
          const novo = fila.shift();
          const params = rest[0];
          const R = Array.isArray(params) ? params[0] : null;
          run('UPDATE requisicoes_almoxarifado SET status = ? WHERE id = ?', [novo, R], () => run(sql, ...rest));
          return this;
        }
      }
      return run(sql, ...rest);
    };
    try { const out = await fn(); return { out, emissoes: () => emissoes }; } finally { db.run = origRun; }
  };

  await test('[92 RN-02] (a) TOTALMENTE -> PARCIALMENTE no instante do UPDATE -> 200, CANCELADO, trilha PARCIALMENTE_RESERVADA, UPDATE emitido 2 vezes', async () => {
    const { m, R, rid } = await montar92('TOTALMENTE_RESERVADA');
    const { out: c, emissoes } = await comGancho(['PARCIALMENTE_RESERVADA'], () => cancelar(S, R));
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.strictEqual(await st(R), 'CANCELADO');
    assert.strictEqual(emissoes(), 2, `UPDATE emitido ${emissoes()} vez(es)`);
    const t = await trilha(R);
    assert.strictEqual(t.length, 1);
    assert.strictEqual(JSON.parse(t[0].dados_anteriores).status, 'PARCIALMENTE_RESERVADA', 'a trilha tem de gravar o status que o UPDATE trocou');
    assert.strictEqual((await reserva(rid)).status, 'LIBERADA');
    assert.strictEqual(await reservada(m), 0);
  });

  await test('[92 RN-02] (b) duas trocas seguidas (TOTALMENTE -> PARCIALMENTE -> TOTALMENTE) -> 400 R1, TOTALMENTE_RESERVADA, reserva ATIVA, sem trilha, UPDATE emitido 2 vezes (uma nova tentativa so)', async () => {
    const { m, R, rid } = await montar92('TOTALMENTE_RESERVADA');
    const { out: c, emissoes } = await comGancho(['PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA'], () => cancelar(S, R));
    assert.strictEqual(c.status, 400, JSON.stringify(c.body));
    assert.strictEqual(c.body.error, RECUSA);
    assert.strictEqual(emissoes(), 2, `UPDATE emitido ${emissoes()} vez(es)`);
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA');
    assert.strictEqual((await reserva(rid)).status, 'ATIVA');
    assert.strictEqual(await reservada(m), 4);
    assert.strictEqual((await trilha(R)).length, 0);
  });

  await test('[92 RN-02] (c) vira EM_SEPARACAO no instante -> 400 R1, EM_SEPARACAO, reserva ATIVA, UPDATE emitido 1 vez', async () => {
    const { R, rid } = await montar92('TOTALMENTE_RESERVADA');
    const { out: c, emissoes } = await comGancho(['EM_SEPARACAO'], () => cancelar(S, R));
    assert.strictEqual(c.status, 400, JSON.stringify(c.body));
    assert.strictEqual(c.body.error, RECUSA);
    assert.strictEqual(emissoes(), 1, `UPDATE emitido ${emissoes()} vez(es)`);
    assert.strictEqual(await st(R), 'EM_SEPARACAO');
    assert.strictEqual((await reserva(rid)).status, 'ATIVA');
    assert.strictEqual((await trilha(R)).length, 0);
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
