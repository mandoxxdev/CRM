/**
 * Etapa 76 (T1, C127) — liberar a mao a reserva de uma requisicao recalcula o status dela.
 *
 * Ate a 75, `POST /reservas/:id/liberar` devolvia o saldo ao disponivel e a requisicao continuava
 * "Totalmente Reservada" sem nada seguro (sonda A2). Agora a rota chama, depois da liberacao que deu
 * certo e antes de responder, `reservaChegadaService.recalcularRequisicoesDasReservas` (T0: sob a trava
 * dos materiais, best-effort). A resposta NAO muda (D4) e o liberado NAO e redistribuido (D2).
 *
 * Entra PELA ROTA, com o gate real: ALMOXARIFE libera, QUALIDADE nao (403).
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa76-liberar-expirar-recalcula-status.md (T1)
 *
 * Executar: cd server && node tests/api/reservaLiberarRecalculaStatus.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const rcs = require('../../services/almoxarifado/reservaChegadaService');
const rsm = require('../../services/almoxarifado/requisitionStateMachine');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message.replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Adm 76L', role: 'admin', is_superadmin: 1, email: 'a76l@t.com' };
const ALMOXARIFE = { id: 7611, nome: 'Almox 76L', perfil_almoxarifado: 'ALMOXARIFE', email: 'x76l@t.com' };
const QUALIDADE = { id: 7612, nome: 'Qual 76L', perfil_almoxarifado: 'QUALIDADE', email: 'q76l@t.com' };
const API = '/api/almoxarifado';
const CHAVES = ['quantidade_liberada', 'reserva_id', 'status', 'success'];
let seq = 0;
// Rede contra teste vazio: se o event loop esvaziar no meio, o Node sairia com 0 sem placar.
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 76 (T1): liberar a mao recalcula o status da requisicao ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('F76L','76000000000191','ativo')")).lastID;
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };
  const comLimite = (p, ms = 15000) => {
    let t;
    const limite = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`PRESA: passou de ${ms} ms (a trava do material nao soltou?)`)), ms);
    });
    return Promise.race([p, limite]).finally(() => clearTimeout(t));
  };
  const dormir = (ms) => new Promise((r) => { setTimeout(r, ms); });

  const material = async (q) => {
    const c = `E76L-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'PC', ?, 0, 1, ?, 0)`, [c, `Mat ${c}`, q, forn])).lastID;
  };
  const reqPend = async (itens, status = 'PENDENTE') => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo, data_aprovacao_valor)
      VALUES (?, 99, 'Sol 76L', ?, 'NORMAL', '2026-09-01 10:00:00', 1, '2026-09-01 10:00:00')`,
    [`REQ-E76L-${++seq}`, status])).lastID;
    for (const [m, q, sep = 0, ent = 0] of itens) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
        (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
        VALUES (?,?,?,?,?,?)`, [id, m, q, sep, ent, ent]);
    }
    return id;
  };
  const aprovar = async (id) => {
    const r = await request(app).put(`${API}/requisicoes/${id}/aprovar`).send({});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  };
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const reservas = (rid) => dbAll(db, `SELECT * FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'
    ORDER BY material_id, id`, [rid]);
  const reserva = (id) => dbGet(db, 'SELECT * FROM reservas_material_almoxarifado WHERE id = ?', [id]);
  const hold = async (rid) => (await reservas(rid))
    .reduce((s, x) => s + Number(x.quantidade) - Number(x.quantidade_utilizada || 0), 0);
  const totalReservas = async () => (await dbGet(db, 'SELECT COUNT(*) n FROM reservas_material_almoxarifado')).n;
  // supertest so dispara no `.then`: `.then((x) => x)` poe a requisicao no ar sem esperar.
  const liberarRota = (id, body = {}) => request(app).post(`${API}/reservas/${id}/liberar`).send({ motivo: 'teste 76', ...body }).then((x) => x);
  const liberarComo = (u, id, body) => as(u, () => liberarRota(id, body));
  const espiao = () => {
    const orig = rcs.recalcularStatusSobTrava;
    const chamadas = [];
    rcs.recalcularStatusSobTrava = (dbx, id) => { chamadas.push(id); return orig(dbx, id); };
    return { chamadas, restaurar: () => { rcs.recalcularStatusSobTrava = orig; } };
  };
  const capturarWarn = async (fn) => {
    const orig = console.warn; const msgs = [];
    console.warn = (...a) => { msgs.push(a.join(' ')); };
    try { return { valor: await fn(), msgs }; } finally { console.warn = orig; }
  };

  // ══════════════ RN-01 ══════════════

  await test('RN-01 liberar tudo: 200 com as mesmas quatro chaves, a requisicao vira APROVADO e nenhuma reserva nova nasce', async () => {
    const m = await material(4);
    const R = await reqPend([[m, 4]]);
    await aprovar(R);
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA');
    const [r] = await reservas(R);
    const antes = await totalReservas();
    const lib = await liberarComo(ALMOXARIFE, r.id);
    assert.strictEqual(lib.status, 200, JSON.stringify(lib.body));
    assert.deepStrictEqual(Object.keys(lib.body).sort(), CHAVES);
    assert.deepStrictEqual(lib.body, { success: true, reserva_id: r.id, quantidade_liberada: 4, status: 'LIBERADA' });
    assert.strictEqual(await st(R), 'APROVADO', 'o status acompanha a reserva liberada (a C127)');
    assert.strictEqual(await totalReservas(), antes, 'D2: o liberado nao e redistribuido');
  });

  await test('RN-01 positiva: a R2 que esperava o mesmo material continua AGUARDANDO_ESTOQUE sem reserva (so a dona e recalculada)', async () => {
    const m = await material(4);
    const R = await reqPend([[m, 4]]);
    await aprovar(R);
    const R2 = await reqPend([[m, 4]]);
    await aprovar(R2);
    assert.strictEqual(await st(R2), 'AGUARDANDO_ESTOQUE');
    const [r] = await reservas(R);
    const lib = await liberarComo(ALMOXARIFE, r.id);
    assert.strictEqual(lib.status, 200);
    assert.deepStrictEqual([await st(R), await st(R2), await hold(R2)], ['APROVADO', 'AGUARDANDO_ESTOQUE', 0]);
  });

  // ══════════════ RN-02 ══════════════

  await test('RN-02 liberar 2 de 4: a reserva fica ATIVA com 2 e a requisicao vira PARCIALMENTE_RESERVADA', async () => {
    const m = await material(4);
    const R = await reqPend([[m, 4]]);
    await aprovar(R);
    const [r] = await reservas(R);
    const lib = await liberarComo(ALMOXARIFE, r.id, { quantidade: 2 });
    assert.strictEqual(lib.status, 200, JSON.stringify(lib.body));
    assert.deepStrictEqual(lib.body, { success: true, reserva_id: r.id, quantidade_liberada: 2, status: 'ATIVA' });
    assert.strictEqual(Number((await reserva(r.id)).quantidade), 2);
    assert.strictEqual(await st(R), 'PARCIALMENTE_RESERVADA');
  });

  await test('RN-02 dois itens (4 e 3), liberar a reserva do segundo: PARCIALMENTE_RESERVADA', async () => {
    const m1 = await material(4);
    const m2 = await material(3);
    const R = await reqPend([[m1, 4], [m2, 3]]);
    await aprovar(R);
    const rs = await reservas(R);
    const lib = await liberarComo(ALMOXARIFE, rs[1].id);
    assert.strictEqual(lib.status, 200);
    assert.strictEqual(await st(R), 'PARCIALMENTE_RESERVADA');
  });

  await test('RN-02 positiva: liberar 2 de uma PARCIALMENTE_RESERVADA que continua com hold: continua PARCIALMENTE_RESERVADA', async () => {
    const m = await material(4);
    const R = await reqPend([[m, 8]]);
    await aprovar(R);
    assert.strictEqual(await st(R), 'PARCIALMENTE_RESERVADA');
    const [r] = await reservas(R);
    const lib = await liberarComo(ALMOXARIFE, r.id, { quantidade: 2 });
    assert.strictEqual(lib.status, 200);
    assert.deepStrictEqual([await st(R), await hold(R)], ['PARCIALMENTE_RESERVADA', 2]);
  });

  // ══════════════ RN-04 ══════════════

  await test('RN-04 PARCIALMENTE_ATENDIDA: liberar a reserva nao muda o status', async () => {
    const m = await material(10);
    const R = await reqPend([[m, 10, 4, 4]], 'PARCIALMENTE_ATENDIDA');
    const it = await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R]);
    const r = await stockService.criarReserva(db, ADMIN, { material_id: m, quantidade: 6 },
      { sistema: true, requisicao_id: R, item_requisicao_id: it.id });
    const lib = await liberarComo(ALMOXARIFE, r.id);
    assert.strictEqual(lib.status, 200);
    assert.strictEqual(await st(R), 'PARCIALMENTE_ATENDIDA');
  });

  await test('RN-04 EM_SEPARACAO: liberar a reserva nao muda o status', async () => {
    const m = await material(4);
    const R = await reqPend([[m, 4]]);
    await aprovar(R);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'EM_SEPARACAO' WHERE id = ?", [R]);
    const [r] = await reservas(R);
    const lib = await liberarComo(ALMOXARIFE, r.id);
    assert.strictEqual(lib.status, 200);
    assert.strictEqual(await st(R), 'EM_SEPARACAO');
  });

  await test('RN-04 reserva MANUAL: 200 como hoje e o recalculo nao e chamado', async () => {
    const m = await material(5);
    const c = await request(app).post(`${API}/reservas`).send({ material_id: m, quantidade: 2 });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const spy = espiao();
    let lib;
    try { lib = await liberarComo(ALMOXARIFE, c.body.id); } finally { spy.restaurar(); }
    assert.strictEqual(lib.status, 200);
    assert.deepStrictEqual(Object.keys(lib.body).sort(), CHAVES);
    assert.deepStrictEqual(spy.chamadas, []);
  });

  // ══════════════ RN-05 ══════════════

  await test('RN-05 o recalculo da requisicao lanca: 200 com o corpo de hoje, reserva LIBERADA, saldo devolvido, warn com a literal', async () => {
    const m = await material(4);
    const R = await reqPend([[m, 4]]);
    await aprovar(R);
    const [r] = await reservas(R);
    const orig = rcs.recalcularStatusSobTrava;
    rcs.recalcularStatusSobTrava = async () => { throw new Error('falha simulada 76L'); };
    let res;
    try { res = await capturarWarn(() => liberarComo(ALMOXARIFE, r.id)); } finally { rcs.recalcularStatusSobTrava = orig; }
    assert.strictEqual(res.valor.status, 200, JSON.stringify(res.valor.body));
    assert.deepStrictEqual(res.valor.body, { success: true, reserva_id: r.id, quantidade_liberada: 4, status: 'LIBERADA' });
    assert.strictEqual((await reserva(r.id)).status, 'LIBERADA');
    assert.strictEqual(Number((await dbGet(db, 'SELECT quantidade_reservada q FROM materiais_almoxarifado WHERE id = ?', [m])).q), 0);
    assert.ok(res.msgs.some((x) => x.includes(`[almoxarifado-reservas] recalculo do status apos liberacao manual da reserva falhou (requisicao ${R}): falha simulada 76L`)),
      JSON.stringify(res.msgs));
  });

  await test('RN-05 o gancho inteiro lanca: a rota responde 200 com o corpo de hoje e avisa com o id da reserva', async () => {
    const m = await material(4);
    const R = await reqPend([[m, 4]]);
    await aprovar(R);
    const [r] = await reservas(R);
    const orig = rcs.recalcularRequisicoesDasReservas;
    rcs.recalcularRequisicoesDasReservas = async () => { throw new Error('gancho simulado 76L'); };
    let res;
    try { res = await capturarWarn(() => liberarComo(ALMOXARIFE, r.id)); } finally { rcs.recalcularRequisicoesDasReservas = orig; }
    assert.strictEqual(res.valor.status, 200, JSON.stringify(res.valor.body));
    assert.deepStrictEqual(res.valor.body, { success: true, reserva_id: r.id, quantidade_liberada: 4, status: 'LIBERADA' });
    assert.ok(res.msgs.some((x) => x.includes(`[almoxarifado-reservas] recalculo do status apos liberacao manual da reserva falhou (reserva ${r.id}): gancho simulado 76L`)),
      JSON.stringify(res.msgs));
  });

  // ══════════════ RN-06 ══════════════

  await test('RN-06 QUALIDADE (sem reservar): 403, reserva ATIVA e status inalterado', async () => {
    const m = await material(4);
    const R = await reqPend([[m, 4]]);
    await aprovar(R);
    const [r] = await reservas(R);
    const lib = await liberarComo(QUALIDADE, r.id);
    assert.strictEqual(lib.status, 403, JSON.stringify(lib.body));
    assert.strictEqual((await reserva(r.id)).status, 'ATIVA');
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA');
  });

  // ══════════════ RN-07 (a) pela rota ══════════════

  await test('RN-07 (a) pela rota: liberar a mao x nota do mesmo material — o status final condiz com o hold (PARCIALMENTE com 4)', async () => {
    const m = await material(4);
    const R = await reqPend([[m, 8]]);
    await aprovar(R);
    assert.strictEqual(await st(R), 'PARCIALMENTE_RESERVADA');
    const [r] = await reservas(R);
    const rec = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F76L', '2026-09-01', '2026-09-02', 10)`, [`REC-E76L-${++seq}`, `NF-E76L-${seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,4,4)`, [rec, m]);
    let abrir; const portao = new Promise((x) => { abrir = x; });
    let chegou; const noPortao = new Promise((x) => { chegou = x; });
    const orig = rsm.calcularStatusPosAprovacao;
    let primeira = true;
    rsm.calcularStatusPosAprovacao = async (...a) => {
      if (primeira) { primeira = false; chegou(); await portao; }
      return orig(...a);
    };
    try {
      setUser({ ...ALMOXARIFE });
      const pLib = liberarRota(r.id);
      await comLimite(noPortao, 5000); // a liberacao ja passou do motor e esta no recalculo
      setUser({ ...ADMIN });
      const pNota = request(app).post(`${API}/recebimentos/${rec}/processar`).send({}).then((x) => x);
      await Promise.race([pNota, dormir(300)]);
      abrir();
      const [lib, nota] = await comLimite(Promise.all([pLib, pNota]));
      assert.strictEqual(lib.status, 200, JSON.stringify(lib.body));
      assert.strictEqual(nota.status, 200, JSON.stringify(nota.body));
    } finally { rsm.calcularStatusPosAprovacao = orig; abrir(); setUser({ ...ADMIN }); }
    assert.deepStrictEqual([await st(R), await hold(R)], ['PARCIALMENTE_RESERVADA', 4]);
  });

  // ══════════════ RN-08 ══════════════

  // Etapa 77, Fase 5 (F2): este caso afirmava 200 — a 76 DECLAROU que transferir reserva de requisicao era
  // aceito (so conferia que o status da requisicao nao mudava). A revisao da 77 mostrou o defeito: a reserva
  // seguia presa a requisicao (e consumida pela entrega dela) dizendo que o material era de outra OS. Agora
  // e 400; o que este caso protegia (requisicao_id mantido, status inalterado, hold continua) segue igual.
  await test('RN-08 transferir reserva de requisicao: 400 desde a Etapa 77 (F2), requisicao_id mantido, status inalterado (o hold continua)', async () => {
    const m = await material(4);
    const R = await reqPend([[m, 4]]);
    await aprovar(R);
    const [r] = await reservas(R);
    const t = await request(app).put(`${API}/reservas/${r.id}/transferir`).send({ os_referencia: 'OS-76L' });
    assert.strictEqual(t.status, 400, JSON.stringify(t.body));
    assert.strictEqual((await reserva(r.id)).os_referencia, r.os_referencia);
    assert.strictEqual((await reserva(r.id)).status, 'ATIVA');
    assert.strictEqual(Number((await reserva(r.id)).requisicao_id), R);
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA');
  });

  terminou = true;
  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
