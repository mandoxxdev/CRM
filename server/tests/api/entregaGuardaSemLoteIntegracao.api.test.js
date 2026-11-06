/**
 * Etapa 207 (T3) — integracao pela ROTA e pelo SERVICO: a entrega respeita a guarda sem lote (o C490 da 206).
 * Material sem controle de lote, A 3 e B 2 (padrao P vazia); requisicao com dois itens do mesmo material (3 e 2, item repetido aceito —
 * B521), aprovada (reserva 3 + 2); item 1 separado sem origem, item 2 separado de A. Entrega do item 1: A 1 + B 2, cada SAIDA com o
 * endereco e o reserva_id do pedaco; entrega do item 2: A 2. A reserva sai inteira; o historico de movimentacoes mostra a origem.
 * Plano: docs/superpowers/plans/2026-11-06-almoxarifado-etapa207-entrega-respeita-guarda-sem-lote.md (T3).
 *
 * Executar: cd server && node tests/api/entregaGuardaSemLoteIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 207i', role: 'admin', is_superadmin: 1, email: 'a207i@t.com' },
  SOL: { id: 20731, nome: 'Solic 207i', email: 's207i@t.com' },
  ALMOX: { id: 20732, nome: 'Almox 207i', role: 'user', email: 'x207i@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 207 (T3): integracao pela rota e pelo servico ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    get: (u) => request(app).get(u).set('x-teste-usuario', k).then((x) => x),
    post: (u, b = {}) => request(app).post(u).set('x-teste-usuario', k).send(b).then((x) => x),
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM207I', nome: 'Almox 207i' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  const loc = async (codigo) => {
    await ok(como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' }), 201)
      .catch(() => null);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A = await loc('HZ-A'); const B = await loc('HZ-B'); const P = await loc('HZ-P');
  assert.ok(A && B && P, 'premissa: os tres enderecos');
  const nomeLoc = { [A.id]: 'HZ-A', [B.id]: 'HZ-B', [P.id]: 'HZ-P' };

  const material = async () => {
    const c = `E207I-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, 0, 0, ?)`, [c, c, P.id])).lastID;
    return { id, nome: c };
  };
  const entrar = (m, destino, q) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e207i', localizacao_destino_id: destino }), 201);
  const criar = async (m) => {
    const r = await como('SOL').post(`${API}/requisicoes`, { os_referencia: 'OS-207', itens: [{ material_id: m.id, quantidade: 3 },
      { material_id: m.id, quantidade: 2 }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id', [r.body.id])).map((x) => x.id);
    assert.strictEqual(ids.length, 2, 'premissa: dois itens do mesmo material');
    return { R: r.body.id, ids };
  };
  const st = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status;
  // [endereco, quantidade, o pedaco da reserva de qual item (0/1), ou null]
  const livro = async (R, m, ids) => {
    const rz = await dbAll(db, 'SELECT id, item_requisicao_id it FROM reservas_material_almoxarifado WHERE requisicao_id = ?', [R]);
    return (await dbAll(db, `SELECT tipo, localizacao_origem_id o, lote_id l, quantidade q, reserva_id r FROM movimentacoes_almoxarifado
      WHERE requisicao_id = ? AND material_id = ? AND tipo IN ('SAIDA', 'ENTRADA') ORDER BY id`, [R, m.id]))
      .map((x) => { const z = rz.find((y) => y.id === x.r); return [x.tipo, nomeLoc[x.o] || null, x.l, Number(x.q), z ? ids.indexOf(z.it) : null]; });
  };
  const linhas = async (m) => (await dbAll(db, `SELECT localizacao_id o, quantidade q FROM estoque_saldo_almoxarifado WHERE material_id = ?
      ORDER BY localizacao_id`, [m.id])).filter((x) => Math.abs(Number(x.q)) > 1e-9).map((x) => `${nomeLoc[x.o] || '-'}=${Number(x.q)}`);
  const fisicoBate = async (m) => {
    const f = Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q);
    const s = Number((await dbGet(db, 'SELECT COALESCE(SUM(quantidade), 0) q FROM estoque_saldo_almoxarifado WHERE material_id = ?', [m.id])).q);
    const neg = (await dbAll(db, 'SELECT id FROM estoque_saldo_almoxarifado WHERE material_id = ? AND quantidade < -1e-9', [m.id])).length;
    return { fisico: f, soma: s, negativas: neg };
  };
  const reservas = async (R) => (await dbAll(db, `SELECT quantidade, COALESCE(quantidade_utilizada, 0) u, status FROM reservas_material_almoxarifado
    WHERE requisicao_id = ? ORDER BY id`, [R])).map((x) => [Number(x.quantidade), Number(x.u), x.status]);
  const resultados = {};
  const LIVRO_1 = [['SAIDA', 'HZ-A', null, 1, 0], ['SAIDA', 'HZ-B', null, 2, 0]];
  const LIVRO_2 = [...LIVRO_1, ['SAIDA', 'HZ-A', null, 2, 1]];

  // ── pela ROTA ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[T3 rota] POST -> aprovar -> separacao (item 1 sem origem, item 2 de A) -> detalhe 3 e 2 -> entregar item 1 (A 1 + B 2) -> entregar item 2 (A 2); reserva inteira; o historico mostra a origem', async () => {
    const m = await material();
    await entrar(m, A.id, 3); await entrar(m, B.id, 2);
    const { R, ids } = await criar(m);
    await ok(como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {}));
    assert.deepStrictEqual((await reservas(R)).map((x) => x[0]), [3, 2], 'premissa: a aprovacao reservou 3 + 2');
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: [{ item_id: ids[0], quantidade_separada: 3 },
      { item_id: ids[1], quantidade_separada: 2, localizacao_origem_id: A.id }] }));
    const det = (await ok(como('ALMOX').get(`${API}/requisicoes/${R}`))).body;
    assert.deepStrictEqual(ids.map((id) => Number(det.itens.find((x) => Number(x.id) === id).saldo_entregavel)), [3, 2], 'B1401: o detalhe nao muda');
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: ids[0], quantidade_atendida: 3 }] }));
    assert.deepStrictEqual(await livro(R, m, ids), LIVRO_1);
    assert.deepStrictEqual(await linhas(m), ['HZ-A=2']);
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: ids[1], quantidade_atendida: 2 }] }));
    const hist = (await ok(como('ADMIN').get(`${API}/movimentacoes?material_id=${m.id}`))).body;
    const saidas = (Array.isArray(hist) ? hist : hist.movimentacoes || hist.rows || []).filter((x) => x.tipo === 'SAIDA')
      .sort((a, b) => a.id - b.id).map((x) => [nomeLoc[x.localizacao_origem_id] || null, Number(x.quantidade)]);
    assert.deepStrictEqual(saidas, [['HZ-A', 1], ['HZ-B', 2], ['HZ-A', 2]], 'a fatia visivel: o historico diz de onde saiu');
    resultados.rota = { livro: await livro(R, m, ids), linhas: await linhas(m), fisico: await fisicoBate(m), status: await st(R),
      reservas: await reservas(R) };
    assert.deepStrictEqual(resultados.rota.livro, LIVRO_2);
    assert.deepStrictEqual(resultados.rota.linhas, []);
    assert.deepStrictEqual(resultados.rota.fisico, { fisico: 0, soma: 0, negativas: 0 });
    assert.ok(!['PARCIALMENTE_ATENDIDA', 'EM_SEPARACAO', 'SEPARADA'].includes(resultados.rota.status), resultados.rota.status);
    assert.deepStrictEqual(resultados.rota.reservas.map((x) => [x[0], x[1]]), [[3, 3], [2, 2]], 'a reserva consumida inteira');
  });

  // ── pelo SERVICO ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[T3 servico] o mesmo por prepararPosAprovacao (na trava), separarRequisicao e entregarRequisicao x2 — mesmos numeros e mesmo livro', async () => {
    const m = await material();
    await entrar(m, A.id, 3); await entrar(m, B.id, 2);
    const { R, ids } = await criar(m);
    const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [R]);
    const pos = await requisitionService.comTravaDaRequisicao(db, R, async () => {
      const p = await requisitionService.prepararPosAprovacao(db, R, USERS.ADMIN, reqRow);
      await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = ?, aprovador_id = 1 WHERE id = ? AND status = 'PENDENTE'", [p.status, R]);
      return p;
    });
    assert.strictEqual(pos.status, 'TOTALMENTE_RESERVADA');
    await requisitionService.separarRequisicao(db, R, [{ item_id: ids[0], quantidade_separada: 3 },
      { item_id: ids[1], quantidade_separada: 2, localizacao_origem_id: A.id }], USERS.ALMOX);
    await requisitionService.entregarRequisicao(db, R, [{ item_id: ids[0], quantidade_atendida: 3 }], USERS.ALMOX, null);
    assert.deepStrictEqual(await livro(R, m, ids), LIVRO_1);
    await requisitionService.entregarRequisicao(db, R, [{ item_id: ids[1], quantidade_atendida: 2 }], USERS.ALMOX, null);
    const servico = { livro: await livro(R, m, ids), linhas: await linhas(m), fisico: await fisicoBate(m), status: await st(R),
      reservas: await reservas(R) };
    assert.ok(resultados.rota, 'premissa: o teste pela rota rodou');
    assert.deepStrictEqual(servico, resultados.rota);
  });

  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
