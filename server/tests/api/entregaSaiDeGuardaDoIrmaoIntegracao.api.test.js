/**
 * Etapa 208 (T3) — integracao pela ROTA e pelo SERVICO: o "Sai de" da entrega respeita a guarda do irmao (o C496).
 * Material sem lote, A 3 e B 5 (padrao P vazia); requisicao com dois itens do mesmo material (2 e 2, item repetido aceito — B521),
 * aprovada; item 1 separado 1 de A e depois 1 sem origem (parte 1), item 2 separado 2 de A. O /saldos continua dizendo sobra 3 em A
 * (B1411: o servidor nao muda; a tela desconta os irmaos). Entregar o item 1 2 com "Sai de" A -> 400 com a E1 estendida, nada gravado;
 * com "Sai de" B -> 200 (troca de 1); o item 2 num clique (ou com A explicito, o que a tela manda — Fase 2 item 7) -> 200; A 1, B 3.
 * Plano: docs/superpowers/plans/2026-11-06-almoxarifado-etapa208-sai-de-respeita-guarda-do-irmao.md (T3).
 *
 * Executar: cd server && node tests/api/entregaSaiDeGuardaDoIrmaoIntegracao.api.test.js
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
  ADMIN: { id: 1, nome: 'Adm 208i', role: 'admin', is_superadmin: 1, email: 'a208i@t.com' },
  SOL: { id: 20831, nome: 'Solic 208i', email: 's208i@t.com' },
  ALMOX: { id: 20832, nome: 'Almox 208i', role: 'user', email: 'x208i@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 208 (T3): integracao pela rota e pelo servico ===\n');
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

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM208I', nome: 'Almox 208i' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  const loc = async (codigo) => {
    await ok(como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' }), 201)
      .catch(() => null);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A = await loc('IZ-A'); const B = await loc('IZ-B'); const P = await loc('IZ-P');
  assert.ok(A && B && P, 'premissa: os tres enderecos');
  const nomeLoc = { [A.id]: 'IZ-A', [B.id]: 'IZ-B', [P.id]: 'IZ-P' };

  const material = async () => {
    const c = `E208I-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, 0, 0, ?)`, [c, c, P.id])).lastID;
    return { id, nome: c };
  };
  const entrar = (m, destino, q) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e208i', localizacao_destino_id: destino }), 201);
  const criar = async (m) => {
    const r = await como('SOL').post(`${API}/requisicoes`, { os_referencia: 'OS-208', itens: [{ material_id: m.id, quantidade: 2 },
      { material_id: m.id, quantidade: 2 }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id', [r.body.id])).map((x) => x.id);
    assert.strictEqual(ids.length, 2, 'premissa: dois itens do mesmo material');
    return { R: r.body.id, ids };
  };
  const st = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status;
  const livro = async (R, m) => (await dbAll(db, `SELECT localizacao_origem_id o, quantidade q, tipo FROM movimentacoes_almoxarifado
      WHERE requisicao_id = ? AND material_id = ? AND tipo IN ('SAIDA', 'ENTRADA') ORDER BY id`, [R, m.id]))
    .map((x) => [x.tipo, nomeLoc[x.o] || null, Number(x.q)]);
  const linhas = async (m) => (await dbAll(db, `SELECT localizacao_id o, quantidade q FROM estoque_saldo_almoxarifado WHERE material_id = ?
      ORDER BY localizacao_id`, [m.id])).filter((x) => Math.abs(Number(x.q)) > 1e-9).map((x) => `${nomeLoc[x.o] || '-'}=${Number(x.q)}`);
  const fisicoBate = async (m) => {
    const f = Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q);
    const s = Number((await dbGet(db, 'SELECT COALESCE(SUM(quantidade), 0) q FROM estoque_saldo_almoxarifado WHERE material_id = ?', [m.id])).q);
    const neg = (await dbAll(db, 'SELECT id FROM estoque_saldo_almoxarifado WHERE material_id = ? AND quantidade < -1e-9', [m.id])).length;
    return { fisico: f, soma: s, negativas: neg };
  };
  const trocas = async (R, ids) => (await dbAll(db, 'SELECT item_id, quantidade FROM substituicoes_origem_requisicao WHERE requisicao_id = ? ORDER BY id', [R]))
    .map((x) => [ids.indexOf(x.item_id), Number(x.quantidade)]);
  const foto = async (m, R, ids) => ({
    st: await st(R), linhas: await linhas(m), livro: await livro(R, m), trocas: await trocas(R, ids),
    itens: await dbAll(db, `SELECT quantidade_separada, quantidade_entregue, quantidade_origem_separacao FROM itens_requisicao_almoxarifado
      WHERE requisicao_id = ? ORDER BY id`, [R]),
  });
  const E1 = (m) => `${m.nome}: em IZ-A há 3 para esta entrega, mas 2 já está separado dali para outra peça desta requisição; sobra 1, que não `
    + 'cobre a quantidade (2). Escolha outro endereço ou deixe "Qualquer endereço (automático)"';
  const item1DeA = (ids) => [{ item_id: ids[0], quantidade_atendida: 2, localizacao_origem_id: A.id }];
  const item1DeB = (ids) => [{ item_id: ids[0], quantidade_atendida: 2, localizacao_origem_id: B.id }];
  const item2 = (ids, explicito) => [{ item_id: ids[1], quantidade_atendida: 2, ...(explicito ? { localizacao_origem_id: A.id } : {}) }];
  const resultados = {};
  const conferirFim = async (m, R, ids) => {
    const r = { livro: await livro(R, m), linhas: await linhas(m), fisico: await fisicoBate(m), trocas: await trocas(R, ids), status: await st(R) };
    assert.deepStrictEqual(r.livro, [['SAIDA', 'IZ-B', 2], ['SAIDA', 'IZ-A', 2]]);
    assert.deepStrictEqual(r.linhas, ['IZ-A=1', 'IZ-B=3']);
    assert.deepStrictEqual(r.fisico, { fisico: 4, soma: 4, negativas: 0 });
    assert.deepStrictEqual(r.trocas, [[0, 1]], 'a troca e so o que passou da parte sem origem (1)');
    assert.ok(!['PARCIALMENTE_ATENDIDA', 'EM_SEPARACAO', 'SEPARADA'].includes(r.status), `requisicao atendida: ${r.status}`);
    return r;
  };

  // ── pela ROTA ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  for (const explicito of [false, true]) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[T3 rota${explicito ? ', item 2 com A explicito' : ''}] POST -> aprovar -> separacao -> /saldos sobra 3 -> item 1 Sai de A 400 (E1, nada gravado) -> Sai de B 200 -> item 2 200; A 1, B 3`, async () => {
      const m = await material();
      await entrar(m, A.id, 3); await entrar(m, B.id, 5);
      const { R, ids } = await criar(m);
      await ok(como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {}));
      const sep = (ls) => ok(como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: ls }));
      await sep([{ item_id: ids[0], quantidade_separada: 1, localizacao_origem_id: A.id }]);
      await sep([{ item_id: ids[0], quantidade_separada: 1 }]);
      await sep([{ item_id: ids[1], quantidade_separada: 2, localizacao_origem_id: A.id }]);
      const saldos = (await ok(como('ALMOX').get(`${API}/estoque/${m.id}/saldos?requisicao_id=${R}`))).body;
      const linhaA = saldos.find((s) => Number(s.localizacao_id) === Number(A.id));
      assert.deepStrictEqual([Number(linhaA.quantidade), Number(linhaA.separado_outras), Number(linhaA.sobra)], [3, 0, 3], 'B1411: o /saldos nao muda');
      const antes = await foto(m, R, ids);
      const r = await como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: item1DeA(ids) });
      assert.strictEqual(r.status, 400, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, E1(m));
      assert.deepStrictEqual(await foto(m, R, ids), antes, 'nada gravado');
      await ok(como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: item1DeB(ids) }));
      await ok(como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: item2(ids, explicito) }));
      resultados[explicito ? 'explicito' : 'rota'] = await conferirFim(m, R, ids);
    });
  }

  // ── pelo SERVICO ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[T3 servico] o mesmo por prepararPosAprovacao (na trava), separarRequisicao e entregarRequisicao x3 — mesmos numeros e mesma literal', async () => {
    const m = await material();
    await entrar(m, A.id, 3); await entrar(m, B.id, 5);
    const { R, ids } = await criar(m);
    const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [R]);
    await requisitionService.comTravaDaRequisicao(db, R, async () => {
      const p = await requisitionService.prepararPosAprovacao(db, R, USERS.ADMIN, reqRow);
      await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = ?, aprovador_id = 1 WHERE id = ? AND status = 'PENDENTE'", [p.status, R]);
      return p;
    });
    await requisitionService.separarRequisicao(db, R, [{ item_id: ids[0], quantidade_separada: 1, localizacao_origem_id: A.id }], USERS.ALMOX);
    await requisitionService.separarRequisicao(db, R, [{ item_id: ids[0], quantidade_separada: 1 }], USERS.ALMOX);
    await requisitionService.separarRequisicao(db, R, [{ item_id: ids[1], quantidade_separada: 2, localizacao_origem_id: A.id }], USERS.ALMOX);
    const antes = await foto(m, R, ids);
    let erro = null;
    try { await requisitionService.entregarRequisicao(db, R, item1DeA(ids), USERS.ALMOX, null); } catch (e) { erro = e; }
    assert.ok(erro && erro.status === 400, `tinha de recusar: ${erro && erro.message}`);
    assert.strictEqual(erro.message, E1(m));
    assert.deepStrictEqual(await foto(m, R, ids), antes, 'nada gravado');
    await requisitionService.entregarRequisicao(db, R, item1DeB(ids), USERS.ALMOX, null);
    await requisitionService.entregarRequisicao(db, R, item2(ids, false), USERS.ALMOX, null);
    const servico = await conferirFim(m, R, ids);
    assert.ok(resultados.rota, 'premissa: o teste pela rota rodou');
    assert.deepStrictEqual(servico, resultados.rota);
    assert.deepStrictEqual(resultados.explicito, resultados.rota);
  });

  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
