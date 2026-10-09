/**
 * Etapa 92 (T3, C148 (1), B438) — o desfazer da aprovacao que perde nao acusa falha a toa.
 *
 * O `/aprovar` reserva (prepararPosAprovacao) e grava o status num UPDATE guardado; se perde, chama
 * `requisitionService.desfazerReservas` para soltar SO as reservas que criou. Quando quem venceu foi o
 * cancelamento, ele ja tinha soltado essas reservas — e o desfazer chamava `liberarReserva` numa reserva
 * LIBERADA, que lanca, e o log dizia "Falha ao desfazer reserva" (sonda da Fase 0: 5/5) num desfecho que
 * estava certo. Parecia incidente.
 *
 * Agora o desfazer le o status da reserva antes: nao ATIVA -> `console.info` I1 e segue; a falha REAL
 * (reserva ativa que nao solta) continua no `console.warn` W1. Residual declarado (B438): o cancelamento
 * que solta entre a leitura e o liberarReserva ainda produz o W1.
 *
 * RN-05 (a)-(c). Plano: docs/superpowers/plans/2026-10-08-almoxarifado-etapa92-cancelar-outros-modulos.md (T3)
 *
 * Executar: cd server && node tests/api/aprovarPerdedorReservaJaSolta.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 92T3', role: 'admin', is_superadmin: 1, email: 'a92t3@t.com' },
  S: { id: 9231, nome: 'Solicitante 92T3', role: 'user', email: 's92t3@t.com' }, // sem perfil
};
// Literais congeladas do plano (Contrato, W1 e I1).
const W1_PREFIXO = '[almoxarifado-aprovar] Falha ao desfazer reserva';
const I1 = (id, status) => `[almoxarifado-aprovar] Reserva ${id} ja estava ${status} — nada a desfazer`;
const RE_APROVAR = /SET\s+status\s*=\s*\?,\s*aprovador_id/;
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});
const comPrazo = (p, ms, rotulo) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error(`prazo de ${ms}ms estourado: ${rotulo}`)), ms).unref()),
]);

(async () => {
  console.log('\n=== Etapa 92 (T3): o desfazer da aprovacao que perde nao acusa falha a toa (C148 (1)) ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    post: (u, body = {}) => request(app).post(u).set('x-teste-usuario', k).send(body).then((x) => x),
    put: (u, body = {}) => request(app).put(u).set('x-teste-usuario', k).send(body).then((x) => x),
  });

  const material = async (q) => {
    const c = `E92T3-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, material_critico)
      VALUES (?, ?, 'PC', ?, 0, 1, 0)`, [c, `Mat ${c}`, q])).lastID;
  };
  const criarDeS = async (m) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-92T3', itens: [{ material_id: m, quantidade: 4 }],
    });
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    return cr.body.id;
  };
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const reservasDe = (R) => dbAll(db, 'SELECT * FROM reservas_material_almoxarifado WHERE requisicao_id = ? ORDER BY id', [R]);
  const reservada = async (m) => Number((await dbGet(db, 'SELECT COALESCE(quantidade_reservada,0) r FROM materiais_almoxarifado WHERE id = ?', [m])).r);
  const capturar = async (fn) => {
    const ow = console.warn; const oi = console.info; const warns = []; const infos = [];
    console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
    console.info = (...a) => { infos.push(a.map(String).join(' ')); };
    try { return { out: await fn(), warns, infos }; } finally { console.warn = ow; console.info = oi; }
  };

  // ══════════════ (a) pela rota: o cancelamento vence o /aprovar ══════════════
  await test('[92 RN-05] (a) S cancela no instante do UPDATE guardado do /aprovar -> aprovar 400, CANCELADO, 0 ATIVA, uma LIBERACAO_RESERVA, nenhum W1, um I1', async () => {
    const m = await material(4);
    const R = await criarDeS(m);
    assert.strictEqual(await st(R), 'PENDENTE');
    const origRun = db.run;
    const run = origRun.bind(db);
    let disparos = 0; let cancel = null; let erroGancho = null;
    db.run = function (sql, ...rest) {
      if (disparos === 0 && RE_APROVAR.test(String(sql))) {
        disparos++;
        comPrazo(como('S').put(`/api/requisicoes-material/${R}/cancelar`), 5000, 'cancelamento no gancho')
          .then((c) => { cancel = c; }, (e) => { erroGancho = e; })
          .then(() => run(sql, ...rest));
        return this;
      }
      return run(sql, ...rest);
    };
    let res;
    try {
      res = await capturar(() => comPrazo(como('ADMIN').put(`/api/almoxarifado/requisicoes/${R}/aprovar`), 10000, 'aprovar'));
    } finally { db.run = origRun; }
    const { out: ap, warns, infos } = res;
    assert.strictEqual(disparos, 1, `o gancho disparou ${disparos} vez(es)`);
    assert.ok(!erroGancho, `o cancelamento lancou: ${erroGancho && erroGancho.message}`);
    assert.strictEqual(cancel && cancel.status, 200, `cancelamento: ${cancel && JSON.stringify(cancel.body)}`);
    assert.strictEqual(ap.status, 400, `aprovar: ${ap.status} ${JSON.stringify(ap.body)}`);
    assert.strictEqual(ap.body.error, 'Transição inválida: CANCELADO → APROVADO');
    assert.strictEqual(await st(R), 'CANCELADO');
    const rs = await reservasDe(R);
    assert.strictEqual(rs.length, 1, `reservas: ${JSON.stringify(rs)}`);
    assert.strictEqual(rs[0].status, 'LIBERADA');
    assert.strictEqual(await reservada(m), 0);
    const libs = await dbAll(db, "SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'LIBERACAO_RESERVA'", [m]);
    assert.strictEqual(libs.length, 1, `LIBERACAO_RESERVA: ${libs.length}`);
    const w1 = warns.filter((l) => l.startsWith(W1_PREFIXO));
    assert.strictEqual(w1.length, 0, `W1 enganoso: ${JSON.stringify(w1)}`);
    const esperado = I1(rs[0].id, 'LIBERADA');
    assert.strictEqual(infos.filter((l) => l === esperado).length, 1, `sem a linha I1 "${esperado}": ${JSON.stringify(infos)}`);
  });

  // Reserva ATIVA de 4 de uma requisicao, pelo motor (o que o /aprovar teria criado).
  const reservaAtiva = async () => {
    const m = await material(4);
    const R = await criarDeS(m);
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R])).id;
    const rv = await stockService.criarReserva(db, USERS.ADMIN, { material_id: m, quantidade: 4 }, { requisicao_id: R, item_requisicao_id: item });
    return { m, R, rid: rv.id };
  };

  // ══════════════ (b) controle de regra: a falha real continua no W1 ══════════════
  await test('[92 RN-05] (b) reserva ATIVA cujo liberarReserva lanca -> o W1 de sempre continua (a falha real nao foi calada)', async () => {
    const { rid } = await reservaAtiva();
    const orig = stockService.liberarReserva;
    let chamadas = 0;
    stockService.liberarReserva = async () => { chamadas++; throw new Error('falha injetada 92T3'); };
    let res;
    try { res = await capturar(() => requisitionService.desfazerReservas(db, { ...USERS.ADMIN }, [{ reserva_id: rid }])); } finally { stockService.liberarReserva = orig; }
    assert.strictEqual(chamadas, 1, 'o patch nao mordeu: desfazerReservas nao chama liberarReserva pelo objeto');
    const esperado = `${W1_PREFIXO} ${rid} — falha injetada 92T3`;
    assert.ok(res.warns.includes(esperado), `sem o W1 "${esperado}": ${JSON.stringify(res.warns)}`);
    assert.strictEqual(res.infos.length, 0, `I1 indevido: ${JSON.stringify(res.infos)}`);
    assert.strictEqual((await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [rid])).status, 'ATIVA');
  });

  // ══════════════ (c) o caminho de sempre ══════════════
  await test('[92 RN-05] (c) reserva ATIVA -> LIBERADA, hold devolvido, sem W1 nem I1', async () => {
    const { m, rid } = await reservaAtiva();
    assert.strictEqual(await reservada(m), 4);
    const res = await capturar(() => requisitionService.desfazerReservas(db, { ...USERS.ADMIN }, [{ reserva_id: rid }]));
    assert.strictEqual((await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [rid])).status, 'LIBERADA');
    assert.strictEqual(await reservada(m), 0);
    assert.strictEqual(res.warns.filter((l) => l.startsWith(W1_PREFIXO)).length, 0, JSON.stringify(res.warns));
    assert.strictEqual(res.infos.length, 0, JSON.stringify(res.infos));
  });

  // ══════════════ (Fase 5) a leitura do status que falha nao aborta o laco ══════════════
  await test('[92 RN-05] (d) duas reservas ATIVA, a leitura do status da primeira falha -> nao lanca, as duas LIBERADA (a leitura que falha segue para o liberarReserva)', async () => {
    const a = await reservaAtiva();
    const b = await reservaAtiva();
    const RE_LEITURA = /^SELECT status FROM reservas_material_almoxarifado WHERE id = \?$/;
    const origGet = db.get;
    let disparos = 0;
    db.get = function (sql, params, ...rest) {
      if (disparos === 0 && RE_LEITURA.test(String(sql)) && Array.isArray(params) && Number(params[0]) === Number(a.rid)) {
        disparos++;
        const cb = [params, ...rest].find((x) => typeof x === 'function');
        process.nextTick(() => cb && cb.call({}, new Error('falha injetada 92F5 leitura')));
        return this;
      }
      return origGet.call(db, sql, params, ...rest);
    };
    let res; let erro = null;
    try {
      res = await capturar(() => requisitionService.desfazerReservas(db, { ...USERS.ADMIN }, [{ reserva_id: a.rid }, { reserva_id: b.rid }]));
    } catch (e) { erro = e; } finally { db.get = origGet; }
    assert.strictEqual(disparos, 1, `o stub da leitura disparou ${disparos} vez(es) — rodada sem valor`);
    assert.ok(!erro, `desfazerReservas lancou: ${erro && erro.message}`);
    const status = async (id) => (await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [id])).status;
    assert.strictEqual(await status(b.rid), 'LIBERADA', 'a segunda reserva ficou presa');
    assert.strictEqual(await reservada(b.m), 0);
    assert.strictEqual(await status(a.rid), 'LIBERADA', 'a primeira (leitura falhou) devia seguir para o liberarReserva');
    assert.strictEqual(await reservada(a.m), 0);
    assert.strictEqual(res.warns.filter((l) => l.startsWith(W1_PREFIXO)).length, 0, JSON.stringify(res.warns));
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
