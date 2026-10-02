/**
 * Etapa 76 (T2, C127) — a reserva de uma requisicao que VENCE recalcula o status dela.
 *
 * Ate a 75, `POST /reservas/processar-expiracao` (config `reserva_dias_validade`) devolvia o saldo ao
 * disponivel e a requisicao continuava "Totalmente Reservada" sem nada seguro (sonda D2) — e a reserva
 * da APROVACAO tambem vence (Surpresa 4), entao com a config ligada toda requisicao reservada virava
 * mentira em N dias. Agora o job, depois do lote, chama `recalcularRequisicoesDasReservas` UMA vez com os
 * ids das reservas que de fato expiraram (D6) — require LAZY (o ciclo de require, plano §7).
 *
 * Entra PELA ROTA do job (ADMINISTRADOR; quem nao tem `configurar` toma 403) e PELO SERVICO
 * (`reservationService.processarExpiracao` direto).
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa76-liberar-expirar-recalcula-status.md (T2)
 *
 * Executar: cd server && node tests/api/reservaExpiracaoRecalculaStatus.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const rcs = require('../../services/almoxarifado/reservaChegadaService');
const reservationService = require('../../services/almoxarifado/reservationService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message.replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Adm 76X', role: 'admin', is_superadmin: 1, email: 'a76x@t.com' };
const ALMOXARIFE = { id: 7621, nome: 'Almox 76X', perfil_almoxarifado: 'ALMOXARIFE', email: 'x76x@t.com' };
const API = '/api/almoxarifado';
const REF = '2099-01-01';
let seq = 0;
// Rede contra teste vazio: se o event loop esvaziar no meio, o Node sairia com 0 sem placar.
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 76 (T2): a expiracao recalcula o status da requisicao ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('F76X','76000000000192','ativo')")).lastID;
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };

  // A validade so fica ligada durante a criacao das reservas de cada cenario: as reservas dos outros
  // cenarios nao ganham `expira_em` e o lote de cada rodada do job e so o do cenario.
  const comValidade = async (fn) => {
    await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES ('reserva_dias_validade', '1')
      ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`);
    try { return await fn(); } finally { await dbRun(db, "DELETE FROM configuracoes_almoxarifado WHERE chave = 'reserva_dias_validade'"); }
  };
  const material = async (q) => {
    const c = `E76X-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'PC', ?, 0, 1, ?, 0)`, [c, `Mat ${c}`, q, forn])).lastID;
  };
  const reqPend = async (itens) => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo, data_aprovacao_valor)
      VALUES (?, 99, 'Sol 76X', 'PENDENTE', 'NORMAL', '2026-09-01 10:00:00', 1, '2026-09-01 10:00:00')`,
    [`REQ-E76X-${++seq}`])).lastID;
    for (const [m, q] of itens) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
        (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
        VALUES (?,?,?,0,0,0)`, [id, m, q]);
    }
    return id;
  };
  const aprovar = async (id) => {
    const r = await request(app).put(`${API}/requisicoes/${id}/aprovar`).send({});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  };
  // Requisicao aprovada com a validade ligada: as reservas da APROVACAO nascem com expira_em.
  const reservadaQueVence = async (itens) => comValidade(async () => {
    const mats = [];
    for (const q of itens) mats.push([await material(q), q]); // eslint-disable-line no-await-in-loop
    const R = await reqPend(mats);
    await aprovar(R);
    return R;
  });
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const reservasDe = (rid) => dbAll(db, 'SELECT * FROM reservas_material_almoxarifado WHERE requisicao_id = ? ORDER BY material_id, id', [rid]);
  const job = (body = { referencia: REF }) => request(app).post(`${API}/reservas/processar-expiracao`).send(body);
  // Espiao no gancho (pelo objeto — o job o resolve na hora da chamada) e no recalculo sob a trava.
  const espioes = () => {
    const origG = rcs.recalcularRequisicoesDasReservas;
    const origT = rcs.recalcularStatusSobTrava;
    const gancho = []; const trava = [];
    rcs.recalcularRequisicoesDasReservas = (dbx, ids, rotulo) => { gancho.push({ ids: [...ids].sort((a, b) => a - b), rotulo }); return origG(dbx, ids, rotulo); };
    rcs.recalcularStatusSobTrava = (dbx, id) => { trava.push(id); return origT(dbx, id); };
    return { gancho, trava, restaurar: () => { rcs.recalcularRequisicoesDasReservas = origG; rcs.recalcularStatusSobTrava = origT; } };
  };
  const capturarWarn = async (fn) => {
    const orig = console.warn; const msgs = [];
    console.warn = (...a) => { msgs.push(a.join(' ')); };
    try { return { valor: await fn(), msgs }; } finally { console.warn = orig; }
  };

  // ══════════════ RN-03 ══════════════

  await test('RN-03 a reserva da aprovacao vence: 200 com as mesmas chaves, processadas 1, a requisicao vira APROVADO', async () => {
    const R = await reservadaQueVence([4]);
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA');
    const [r] = await reservasDe(R);
    assert.ok(r.expira_em, 'a reserva da aprovacao nasce com expira_em (Surpresa 4)');
    const spy = espioes();
    let p;
    try { p = await job(); } finally { spy.restaurar(); }
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    assert.deepStrictEqual(Object.keys(p.body).sort(), ['erros', 'liberadas', 'processadas', 'success']);
    assert.deepStrictEqual([p.body.processadas, p.body.erros], [1, []]);
    assert.strictEqual((await reservasDe(R))[0].status, 'EXPIRADA');
    assert.strictEqual(await st(R), 'APROVADO', 'o status acompanha a reserva vencida (a C127 pela outra porta)');
    assert.deepStrictEqual(spy.gancho, [{ ids: [r.id], rotulo: 'expiracao da reserva' }]);
  });

  await test('RN-03 dois itens vencidos no mesmo lote: UM recalculo da requisicao (uma chamada do gancho com os dois ids) e APROVADO', async () => {
    const R = await reservadaQueVence([4, 3]);
    const rs = await reservasDe(R);
    assert.strictEqual(rs.length, 2);
    const spy = espioes();
    let p;
    try { p = await job(); } finally { spy.restaurar(); }
    assert.strictEqual(p.status, 200);
    assert.strictEqual(p.body.processadas, 2);
    assert.deepStrictEqual(spy.gancho, [{ ids: rs.map((x) => x.id).sort((a, b) => a - b), rotulo: 'expiracao da reserva' }],
      'uma chamada por lote, com os ids das duas reservas');
    assert.deepStrictEqual(spy.trava, [R], 'o recalculo sob a trava uma vez para a requisicao');
    assert.strictEqual(await st(R), 'APROVADO');
  });

  await test('RN-03 (pelo servico) so uma de duas vencida: PARCIALMENTE_RESERVADA e o retorno do servico nao muda de forma', async () => {
    const R = await reservadaQueVence([4, 3]);
    const rs = await reservasDe(R);
    await dbRun(db, 'UPDATE reservas_material_almoxarifado SET expira_em = NULL WHERE id = ?', [rs[1].id]);
    const out = await reservationService.processarExpiracao(db, ADMIN, { referencia: REF });
    assert.deepStrictEqual(Object.keys(out).sort(), ['erros', 'liberadas', 'processadas']);
    assert.deepStrictEqual([out.processadas, out.liberadas.map((l) => l.id)], [1, [rs[0].id]]);
    assert.strictEqual(await st(R), 'PARCIALMENTE_RESERVADA');
  });

  await test('RN-03 a liberacao de uma reserva falha: ela vai para erros, a requisicao DELA nao e recalculada, a da outra e', async () => {
    const RA = await reservadaQueVence([4]);
    const RB = await reservadaQueVence([4]);
    const [ra] = await reservasDe(RA);
    const [rb] = await reservasDe(RB);
    const origLib = stockService.liberarReserva;
    stockService.liberarReserva = (dbx, u, id, ...resto) => {
      if (Number(id) === ra.id) return Promise.reject(new Error('liberacao simulada 76X'));
      return origLib(dbx, u, id, ...resto);
    };
    const spy = espioes();
    let p;
    try {
      p = (await capturarWarn(() => job())).valor;
    } finally { spy.restaurar(); stockService.liberarReserva = origLib; }
    try {
      assert.strictEqual(p.status, 200, JSON.stringify(p.body));
      assert.deepStrictEqual([p.body.processadas, p.body.erros], [1, [{ id: ra.id, erro: 'liberacao simulada 76X' }]]);
      assert.deepStrictEqual(spy.gancho, [{ ids: [rb.id], rotulo: 'expiracao da reserva' }], 'so o id da reserva que de fato expirou');
      assert.deepStrictEqual([await st(RA), await st(RB)], ['TOTALMENTE_RESERVADA', 'APROVADO']);
      assert.strictEqual((await reservasDe(RA))[0].status, 'ATIVA');
    } finally {
      // a reserva que falhou continua ATIVA e vencida: sai do caminho dos proximos lotes
      await dbRun(db, 'UPDATE reservas_material_almoxarifado SET expira_em = NULL WHERE id = ?', [ra.id]);
    }
  });

  // ══════════════ RN-04 ══════════════

  await test('RN-04 EM_SEPARACAO: a reserva vence e o status nao muda', async () => {
    const R = await reservadaQueVence([4]);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'EM_SEPARACAO' WHERE id = ?", [R]);
    const p = await job();
    assert.strictEqual(p.status, 200);
    assert.strictEqual(p.body.processadas, 1);
    assert.strictEqual(await st(R), 'EM_SEPARACAO');
  });

  await test('RN-04 reserva MANUAL vence: resposta como hoje e o recalculo sob a trava nao e chamado (o gancho e, com o id dela)', async () => {
    const m = await material(5);
    const c = await request(app).post(`${API}/reservas`).send({ material_id: m, quantidade: 2, expira_em: '2026-09-30' });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const spy = espioes();
    let p;
    try { p = await job(); } finally { spy.restaurar(); }
    assert.strictEqual(p.status, 200);
    assert.deepStrictEqual(Object.keys(p.body).sort(), ['erros', 'liberadas', 'processadas', 'success']);
    assert.deepStrictEqual(p.body.liberadas.map((l) => l.id), [c.body.id]);
    assert.deepStrictEqual(spy.gancho, [{ ids: [c.body.id], rotulo: 'expiracao da reserva' }]);
    assert.deepStrictEqual(spy.trava, [], 'nenhuma requisicao tocada');
  });

  await test('RN-04 nada venceu: o gancho nem e chamado', async () => {
    const spy = espioes();
    let p;
    try { p = await job(); } finally { spy.restaurar(); }
    assert.strictEqual(p.status, 200);
    assert.deepStrictEqual([p.body.processadas, spy.gancho], [0, []]);
  });

  // ══════════════ RN-05 ══════════════

  await test('RN-05 o recalculo da requisicao lanca: 200, processadas certo, erros VAZIO, warn com a literal', async () => {
    const R = await reservadaQueVence([4]);
    const origT = rcs.recalcularStatusSobTrava;
    rcs.recalcularStatusSobTrava = async () => { throw new Error('falha simulada 76X'); };
    let res;
    try { res = await capturarWarn(() => job()); } finally { rcs.recalcularStatusSobTrava = origT; }
    assert.strictEqual(res.valor.status, 200, JSON.stringify(res.valor.body));
    assert.deepStrictEqual([res.valor.body.processadas, res.valor.body.erros], [1, []]);
    assert.ok(res.msgs.some((x) => x.includes(`[almoxarifado-reservas] recalculo do status apos expiracao da reserva falhou (requisicao ${R}): falha simulada 76X`)),
      JSON.stringify(res.msgs));
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA', 'nada gravado');
  });

  await test('RN-05 o gancho inteiro lanca: o job responde 200 com processadas certo e erros vazio, e avisa', async () => {
    const R = await reservadaQueVence([4]);
    const origG = rcs.recalcularRequisicoesDasReservas;
    rcs.recalcularRequisicoesDasReservas = async () => { throw new Error('gancho simulado 76X'); };
    let res;
    try { res = await capturarWarn(() => job()); } finally { rcs.recalcularRequisicoesDasReservas = origG; }
    assert.strictEqual(res.valor.status, 200, JSON.stringify(res.valor.body));
    assert.deepStrictEqual([res.valor.body.processadas, res.valor.body.erros], [1, []]);
    assert.ok(res.msgs.some((x) => x.includes('[almoxarifado-reservas] recalculo do status apos expiracao da reserva falhou: gancho simulado 76X')),
      JSON.stringify(res.msgs));
    assert.strictEqual((await reservasDe(R))[0].status, 'EXPIRADA');
  });

  // ══════════════ RN-06 ══════════════

  await test('RN-06 nao-ADMINISTRADOR (ALMOXARIFE) no job: 403 e nada expira', async () => {
    const R = await reservadaQueVence([4]);
    const p = await as(ALMOXARIFE, () => job());
    assert.strictEqual(p.status, 403, JSON.stringify(p.body));
    assert.strictEqual((await reservasDe(R))[0].status, 'ATIVA');
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA');
    // e o ADMINISTRADOR, depois, expira e recalcula
    const q = await job();
    assert.strictEqual(q.status, 200);
    assert.strictEqual(await st(R), 'APROVADO');
  });

  terminou = true;
  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
