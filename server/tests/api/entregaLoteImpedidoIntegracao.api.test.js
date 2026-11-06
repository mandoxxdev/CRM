/**
 * Etapa 206 (T3) — integracao: a entrega que tiraria de lote impedido, do comeco ao fim, pela ROTA e pelo SERVICO, com os mesmos numeros
 * e o mesmo livro.
 *
 * Fluxo: Entrada v2 L1 2 e L2 3 -> requisicao de 4 -> aprovar (reserva 4, antes do bloqueio) -> separar 4 -> L2 BLOQUEADO -> detalhe
 * (quantidade_entregavel 2) -> fila (entregavel 2) -> entregar 4 (400, a literal) -> entregar 2 (200, sai de L1) -> L2 ATIVO -> entregar 2
 * (200, sai de L2) -> nenhuma linha negativa; requisicao atendida.
 * Plano: docs/superpowers/plans/2026-11-06-almoxarifado-etapa206-entrega-recusa-lote-impedido.md (T3).
 *
 * Executar: cd server && node tests/api/entregaLoteImpedidoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const USERS = {
  ADMIN: { id: 1, nome: 'Adm 206i', role: 'admin', is_superadmin: 1, email: 'a206i@t.com' },
  SOL: { id: 20631, nome: 'Solic 206i', email: 's206i@t.com' },
  ALMOX: { id: 20632, nome: 'Almox 206i', role: 'user', email: 'x206i@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});
const MSG_4 = (nome) => `${nome}: não é possível entregar 4 un — faltam 2 un em lote que pode sair. Em lote impedido: L2 (bloqueado, 3 un). `
  + 'Libere o lote (mude o status ou libere o vencimento) ou entregue 2 un a menos.';

(async () => {
  console.log('\n=== Etapa 206 (T3): integracao pela rota e pelo servico ===\n');
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

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM206I', nome: 'Almox 206i' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  await como('ADMIN').post(`${API}/localizacoes`, { codigo: 'Z206I-01', descricao: 'Z206I-01', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z206I-01'");

  const material = async () => {
    const c = `E206I-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, 1, 0, ?)`, [c, c, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = (m, q, lote) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e206i', localizacao_destino_id: P01.id, lote }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const statusRota = async (m, codigo, st) => ok(como('ADMIN').put(`${API}/lotes/${await loteId(m, codigo)}/status`,
    { status: st, justificativa: 'teste 206' }));
  const criar = async (m, q) => {
    const r = await como('SOL').post(`${API}/requisicoes`, { os_referencia: 'OS-206', itens: [{ material_id: m.id, quantidade: q }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [r.body.id])).id;
    return { R: r.body.id, item };
  };
  const st = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status;
  const reservas = async (R) => (await dbAll(db, `SELECT quantidade, COALESCE(quantidade_utilizada, 0) u, status FROM reservas_material_almoxarifado
    WHERE requisicao_id = ? ORDER BY id`, [R])).map((x) => [Number(x.quantidade), Number(x.u), x.status]);
  const livro = async (R, m) => (await dbAll(db, `SELECT mv.tipo, lt.codigo as lote, mv.quantidade q FROM movimentacoes_almoxarifado mv
      LEFT JOIN lotes_almoxarifado lt ON lt.id = mv.lote_id
      WHERE mv.requisicao_id = ? AND mv.material_id = ? AND mv.tipo IN ('SAIDA', 'ENTRADA') ORDER BY mv.id`, [R, m.id]))
    .map((x) => [x.tipo, x.lote || null, Number(x.q)]);
  const linhas = async (m) => (await dbAll(db, `SELECT lt.codigo as lote, SUM(s.quantidade) q FROM estoque_saldo_almoxarifado s
      LEFT JOIN lotes_almoxarifado lt ON lt.id = s.lote_id WHERE s.material_id = ? GROUP BY lt.codigo ORDER BY lt.codigo`, [m.id]))
    .filter((x) => Math.abs(Number(x.q)) > 1e-9).map((x) => `${x.lote || '-'}=${Number(x.q)}`);
  const negativas = async (m) => (await dbAll(db, 'SELECT id FROM estoque_saldo_almoxarifado WHERE material_id = ? AND quantidade < -1e-9',
    [m.id])).length;
  const entregue = async (item) => Number((await dbGet(db, 'SELECT COALESCE(quantidade_entregue, 0) q FROM itens_requisicao_almoxarifado WHERE id = ?',
    [item])).q);
  const montar = async () => { const m = await material(); await entrar(m, 2, 'L1'); await entrar(m, 3, 'L2'); return m; };
  const resultados = {};

  // ── pela ROTA ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[T3 rota] Entrada L1 2 + L2 3 -> requisicao 4 -> aprovar (reserva 4) -> separar 4 -> L2 BLOQUEADO -> detalhe 2 -> fila 2 -> entregar 4 (400) / 2 (L1) -> L2 ATIVO -> entregar 2 (L2) -> atendida, nada negativo', async () => {
    const m = await montar();
    const { R, item } = await criar(m, 4);
    assert.strictEqual((await ok(como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {}))).body.status, 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual(await reservas(R), [[4, 0, 'ATIVA']]);
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: [{ item_id: item, quantidade_separada: 4 }] }));
    await statusRota(m, 'L2', 'BLOQUEADO');
    const det = (await ok(como('ADMIN').get(`${API}/requisicoes/${R}`))).body.itens[0];
    assert.deepStrictEqual([det.quantidade_entregavel, det.saldo_entregavel, det.lote_impedido], [2, 2, 3], JSON.stringify(det));
    const fila = (await ok(como('ALMOX').get(`${API}/fila-separacao`))).body.find((f) => Number(f.id) === Number(R));
    assert.strictEqual(fila.itens[0].entregavel, 2, JSON.stringify(fila.itens[0]));
    const statusAntes = await st(R);
    const r4 = await como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: 4 }] });
    assert.strictEqual(r4.status, 400, JSON.stringify(r4.body));
    assert.strictEqual(r4.body.error, MSG_4(m.nome));
    assert.strictEqual(r4.body.error, requisitionService.fraseEntregaLoteImpedido(m.nome, 4, 'un', 2,
      [{ codigo: 'L2', status: 'BLOQUEADO', data_validade: null, quantidade: 3 }]));
    assert.deepStrictEqual([await livro(R, m), await linhas(m), await entregue(item), await st(R), await reservas(R)],
      [[], ['L1=2', 'L2=3'], 0, statusAntes, [[4, 0, 'ATIVA']]], 'nada baixado');
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: 2 }] }));
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'L1', 2]]);
    assert.strictEqual(await st(R), 'PARCIALMENTE_ATENDIDA');
    await statusRota(m, 'L2', 'ATIVO');
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: 2 }] }));
    resultados.rota = { livro: await livro(R, m), linhas: await linhas(m), entregue: await entregue(item), status: await st(R),
      reservas: await reservas(R), negativas: await negativas(m) };
    assert.deepStrictEqual(resultados.rota.livro, [['SAIDA', 'L1', 2], ['SAIDA', 'L2', 2]]);
    assert.deepStrictEqual(resultados.rota.linhas, ['L2=1']);
    assert.strictEqual(resultados.rota.entregue, 4);
    assert.strictEqual(resultados.rota.negativas, 0);
    assert.notStrictEqual(resultados.rota.status, 'PARCIALMENTE_ATENDIDA');
    assert.deepStrictEqual(resultados.rota.reservas.map((x) => x[1]), [4], 'a reserva consumida inteira');
  });

  // ── pelo SERVICO ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[T3 servico] o mesmo por prepararPosAprovacao (na trava), separarRequisicao, mudarStatusLote, listarFilaSeparacao e entregarRequisicao — mesmos numeros e mesmo livro', async () => {
    const m = await montar();
    const { R, item } = await criar(m, 4);
    const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [R]);
    const pos = await requisitionService.comTravaDaRequisicao(db, R, async () => {
      const p = await requisitionService.prepararPosAprovacao(db, R, USERS.ADMIN, reqRow);
      await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = ?, aprovador_id = 1 WHERE id = ? AND status = 'PENDENTE'", [p.status, R]);
      return p;
    });
    assert.strictEqual(pos.status, 'TOTALMENTE_RESERVADA');
    await requisitionService.separarRequisicao(db, R, [{ item_id: item, quantidade_separada: 4 }], USERS.ALMOX);
    await lotService.mudarStatusLote(db, USERS.ADMIN, await loteId(m, 'L2'), 'BLOQUEADO', 'teste 206');
    const [f] = await requisitionService.listarFilaSeparacao(db, USERS.ALMOX, { requisicaoId: R });
    assert.strictEqual(f.itens[0].entregavel, 2);
    await assert.rejects(requisitionService.entregarRequisicao(db, R, [{ item_id: item, quantidade_atendida: 4 }], USERS.ALMOX, null),
      (e) => e.status === 400 && e.message === MSG_4(m.nome));
    assert.deepStrictEqual([await livro(R, m), await linhas(m), await entregue(item)], [[], ['L1=2', 'L2=3'], 0], 'nada baixado');
    await requisitionService.entregarRequisicao(db, R, [{ item_id: item, quantidade_atendida: 2 }], USERS.ALMOX, null);
    assert.strictEqual(await st(R), 'PARCIALMENTE_ATENDIDA');
    await lotService.mudarStatusLote(db, USERS.ADMIN, await loteId(m, 'L2'), 'ATIVO', 'teste 206');
    await requisitionService.entregarRequisicao(db, R, [{ item_id: item, quantidade_atendida: 2 }], USERS.ALMOX, null);
    const servico = { livro: await livro(R, m), linhas: await linhas(m), entregue: await entregue(item), status: await st(R),
      reservas: await reservas(R), negativas: await negativas(m) };
    assert.ok(resultados.rota, 'premissa: o teste pela rota rodou');
    assert.deepStrictEqual(servico, resultados.rota);
  });

  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
