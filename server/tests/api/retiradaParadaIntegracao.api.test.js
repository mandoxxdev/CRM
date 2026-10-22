/**
 * Etapa 182 (T4) — integracao do alerta SEPARADO_AGUARDANDO_RETIRADA pela ROTA e pelo SERVICO, cada documento ate o ultimo
 * gesto (feature 20, com a 05).
 *
 * (A) pela rota: requisicao real -> aprovar -> separar -> PUT liberar-retirada -> envelhecer a coluna (UPDATE de teste: o
 *     relogio da suite nao anda 3 dias) -> GET /alertas/central mostra -> varrerAlertasRegistrados enfileira 1 -> PUT
 *     devolver-separado (B504) -> some -> separar e liberar de novo -> envelhecer (valor DIFERENTE, I2) -> a varredura
 *     enfileira a 2a (dedupe novo) -> entregar parcial -> some e a varredura nao enfileira mais nada.
 * (B) pelo servico: o mesmo B504 chamado por `requisitionService.devolverSeparado` tira do cartao.
 * Material NAO critico (M5 da revisao): o B504 limpa a conferencia (B505), e com critico a reliberacao recusaria.
 *
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa182-alerta-de-retirada-parada.md
 * Executar: cd server && node tests/api/retiradaParadaIntegracao.api.test.js
 */
const assert = require('assert');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const queueService = require('../../services/almoxarifado/notificationQueueService');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 182i', role: 'admin', is_superadmin: 1, email: 'a182i@t.com' },
  S: { id: 18221, nome: 'Solic 182i', role: 'user', email: 's182i@t.com' },
  ALMOX: { id: 18222, nome: 'Almox 182i', role: 'user', email: 'x182i@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const EVENTO = 'SEPARADO_AGUARDANDO_RETIRADA';
const hash = (chave) => crypto.createHash('sha256').update(`${EVENTO}|${chave}`).digest('hex');
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 182 (T4): integracao do alerta de retirada parada ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    get: (u) => request(app).get(u).set('x-teste-usuario', k).then((x) => x),
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
    post: (u, b = {}) => request(app).post(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });
  const setConfig = (chave, valor) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
  await setConfig('alertas_estoque_emails', 'almox@gmp.ind.br');
  await setConfig('alertas_estoque_notificar_email', '1');

  const ok = (r, st, msg) => { assert.strictEqual(r.status, st, `${msg}: ${r.status} ${JSON.stringify(r.body)}`); return r; };
  const montar = async (q = 4) => {
    const c = `E182I-${++seq}`;
    const m = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, custo_unitario, material_critico) VALUES (?, ?, 'PC', 0, 0, 1, 0.1, 0)`, [c, c])).lastID;
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Montagem', urgencia: 'NORMAL', os_referencia: 'OS-182I', itens: [{ material_id: m, quantidade: q }],
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const R = cr.body.id;
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=?', [R])).id;
    ok(await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {}), 200, 'aprovar');
    ok(await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e182i' }), 201, 'entrada');
    return { m, R, item };
  };
  const separar = (R, item, q) => como('ALMOX').put(`${API}/requisicoes/${R}/separar`, { itens_separados: [{ item_id: item, quantidade_separada: q }] });
  const liberar = (R) => como('ALMOX').put(`${API}/requisicoes/${R}/liberar-retirada`, {});
  const envelhecer = (R, s) => dbRun(db,
    "UPDATE requisicoes_almoxarifado SET pronta_para_retirada_em = datetime('now', ?) WHERE id = ?", [`-${s} seconds`, R]);
  const recente = async (R) => {
    const r = await dbGet(db, "SELECT pronta_para_retirada_em AS e, (julianday('now') - julianday(pronta_para_retirada_em)) * 86400 AS s FROM requisicoes_almoxarifado WHERE id=?", [R]);
    assert.ok(r.e && r.s >= -1 && r.s < 60, `a liberacao pela rota tinha de gravar agora: ${JSON.stringify(r)}`);
  };
  const D = 86400;
  const naCentral = async (R) => {
    const r = ok(await como('ADMIN').get(`${API}/alertas/central`), 200, 'central');
    const c = r.body.alertas.find((a) => a.chave === EVENTO);
    assert.ok(c && !c.erro, `cartao: ${JSON.stringify(c)}`);
    return c.linhas.find((l) => l.id === R) || null;
  };
  const chave = async (R) => `retirada-parada-${R}-${(await dbGet(db,
    'SELECT pronta_para_retirada_em AS e FROM requisicoes_almoxarifado WHERE id=?', [R])).e}`;
  const naFila = async (k) => (await dbAll(db, 'SELECT id FROM fila_notificacoes_almoxarifado WHERE hash_dedupe = ?', [hash(k)])).length;
  const daRequisicao = async (R) => (await dbAll(db,
    "SELECT payload FROM fila_notificacoes_almoxarifado WHERE evento = ?", [EVENTO]))
    .filter((f) => JSON.parse(f.payload).requisicao_id === R).length;

  await test('(A) pela rota: liberar -> central -> fila -> B504 some -> reliberar -> 2a na fila -> entrega parcial some', async () => {
    const { R, item } = await montar(4);
    ok(await separar(R, item, 4), 200, 'separar');
    ok(await liberar(R), 200, 'liberar');
    assert.strictEqual(await naCentral(R), null, 'recem-liberada nao esta parada');
    await recente(R);
    await envelhecer(R, 4 * D + 101);
    const l = await naCentral(R);
    assert.ok(l, 'envelhecida 4 d: no cartao');
    assert.deepStrictEqual([l.setor, l.os_referencia, l.itens_na_caixa, l.dias_aguardando, l.status],
      ['Montagem', 'OS-182I', 1, 4, 'PRONTA_PARA_RETIRADA']);
    const k1 = await chave(R);
    await queueService.varrerAlertasRegistrados(db);
    assert.strictEqual(await naFila(k1), 1, 'a varredura enfileira 1');
    await queueService.varrerAlertasRegistrados(db);
    assert.strictEqual(await daRequisicao(R), 1, 'a varredura do dia seguinte e duplicada');

    ok(await como('ALMOX').put(`${API}/requisicoes/${R}/devolver-separado`, {
      motivo: 'peca trocada', itens: [{ item_id: item, quantidade: 1 }],
    }), 200, 'devolver (B504)');
    assert.strictEqual((await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id=?', [R])).status, 'EM_SEPARACAO');
    assert.strictEqual(await naCentral(R), null, 'o B504 tira do cartao');

    ok(await separar(R, item, 1), 200, 'separar de novo');
    ok(await liberar(R), 200, 'liberar de novo');
    await recente(R); // a reliberacao regravou (a coluna estava envelhecida em 4 d)
    await envelhecer(R, 5 * D + 203);
    const k2 = await chave(R);
    assert.notStrictEqual(k2, k1);
    assert.ok(await naCentral(R), 'reliberada e envelhecida: volta ao cartao');
    await queueService.varrerAlertasRegistrados(db);
    assert.deepStrictEqual([await naFila(k1), await naFila(k2), await daRequisicao(R)], [1, 1, 2], 'a 2a liberacao avisa de novo');

    ok(await como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, {
      itens_atendidos: [{ item_id: item, quantidade_atendida: 2 }],
    }), 200, 'entregar parcial');
    assert.strictEqual((await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id=?', [R])).status, 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual(await naCentral(R), null, 'a entrega parcial tira do cartao');
    await queueService.varrerAlertasRegistrados(db);
    assert.strictEqual(await daRequisicao(R), 2, 'nada novo na fila depois da entrega');
  });

  await test('(B) pelo servico: requisitionService.devolverSeparado (B504) tira do cartao', async () => {
    const { R, item } = await montar(3);
    ok(await separar(R, item, 3), 200, 'separar');
    ok(await liberar(R), 200, 'liberar');
    await envelhecer(R, 6 * D + 307);
    assert.ok(await naCentral(R), 'premissa: no cartao');
    const r = await requisitionService.devolverSeparado(db, R, { motivo: 'servico', itens: [{ item_id: item, quantidade: 3 }] },
      { id: USERS.ALMOX.id, nome: USERS.ALMOX.nome, perfil_almoxarifado: PERFIS.ALMOXARIFE });
    assert.strictEqual(r.success, true, JSON.stringify(r));
    assert.strictEqual((await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id=?', [R])).status, 'EM_SEPARACAO');
    assert.strictEqual(await naCentral(R), null, 'o B504 pelo servico tira do cartao');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
