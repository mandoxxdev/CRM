/**
 * Etapa 99 (T2, C200) — a segunda conferencia conta a caixa.
 *
 * Antes, `PUT /requisicoes/:id/conferir-separacao` (e `requisitionService.conferirSeparacao`) so recusava "Nenhum item
 * separado" quando NENHUM item tinha `quantidade_separada > 0` — mas o separado e acumulado e nunca desce na entrega.
 * Uma EM_SEPARACAO com a caixa vazia (separou 2, entregou 2, "Separar de novo para conferir" com []) era conferida:
 * a conferencia atestava nada. Nao precisa de devolucao nem de material critico (s4 C2 da Fase 0).
 *
 * Agora (B522): a contagem e a do liberar (B512) — `quantidade_separada > 0` E a caixa
 * `ROUND(separado - COALESCE(entregue, atendida, 0), 6) > 1e-9` — com a literal de sempre.
 *
 * Usuarios reais por header (molde 95-98). Casos `[99 RN-09]`. O `[99 RN-10]` (o resíduo do liberar que prova o ROUND)
 * esta em `devolverSeparado.api.test.js`, no `[98 RN-03] (Fase 5)`.
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa99-separacao-recusa-o-inseparavel.md
 *
 * Executar: cd server && node tests/api/conferirCaixaVazia.api.test.js
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
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 99c', role: 'admin', is_superadmin: 1, email: 'a99c@t.com' },
  S: { id: 9911, nome: 'Solic 99c', role: 'user', email: 's99c@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 9912, nome: 'Almox 99c', role: 'user', email: 'x99c@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
  ALMOX2: { id: 9913, nome: 'Almox2 99c', role: 'user', email: 'y99c@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const CONF_SVC = { id: 9914, nome: 'Conf svc 99c', role: 'user', perfil_almoxarifado: PERFIS.ALMOXARIFE };
const API = '/api/almoxarifado';
const VAZIA = 'Nenhum item separado';

let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 99 T2: a conferencia conta a caixa ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
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

  const material = async (critico = 0) => {
    const c = `E99C-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, custo_unitario, material_critico) VALUES (?, ?, 'PC', 0, 0, 1, 0.1, ?)`, [c, c, critico])).lastID;
  };
  const entrar = async (m, q) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e99c' });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const montar = async (pares) => {
    for (const [m, q] of pares) await entrar(m, q); // eslint-disable-line no-await-in-loop
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-99c',
      itens: pares.map(([m, q]) => ({ material_id: m, quantidade: q })),
    });
    assert.strictEqual(cr.status, 201, `criar: ${JSON.stringify(cr.body)}`);
    const ap = await como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/aprovar`, {});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    return { R: cr.body.id, ids };
  };
  const ok = (r, rotulo) => assert.strictEqual(r.status, 200, `${rotulo}: ${r.status} ${JSON.stringify(r.body)}`);
  const separar = (R, pares, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/separar`, {
    itens_separados: pares.map(([item_id, q]) => ({ item_id, quantidade_separada: q })),
  });
  const entregar = (R, pares, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/entregar`, {
    itens_atendidos: pares.map(([item_id, q]) => ({ item_id, quantidade_atendida: q })),
  });
  const devolver = (R, pares) => como('ALMOX').put(`${API}/requisicoes/${R}/devolver-separado`, {
    motivo: 'quebrou na caixa', itens: pares.map(([item_id, quantidade]) => ({ item_id, quantidade })),
  });
  const conferir = (R, u = 'ALMOX2') => como(u).put(`${API}/requisicoes/${R}/conferir-separacao`, {});
  const conferirSvc = async (R) => {
    try { return { status: 200, body: await requisitionService.conferirSeparacao(db, R, CONF_SVC) }; } catch (e) {
      return { status: e.status || 500, body: { error: e.message } };
    }
  };
  const conf = (R) => dbGet(db, 'SELECT status, conferido_por_id, conferido_por_nome, conferido_em FROM requisicoes_almoxarifado WHERE id=?', [R]);
  const trilhaConf = async (R) => (await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade='requisicao'
    AND entidade_id=? AND acao='CONFERENCIA_SEPARACAO'`, [R])).n;
  // Recusa pela rota E pelo servico, com a literal inteira, e a conferencia NAO gravada.
  const recusaVazia = async (R, rotulo) => {
    const antes = await conf(R);
    const n = await trilhaConf(R);
    assert.strictEqual(antes.status, 'EM_SEPARACAO', `${rotulo}: premissa EM_SEPARACAO`);
    assert.strictEqual(antes.conferido_por_id, null, `${rotulo}: premissa sem conferencia`);
    for (const [via, r] of [['rota', await conferir(R)], ['svc', await conferirSvc(R)]]) {
      assert.strictEqual(r.status, 400, `${rotulo} ${via}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, VAZIA, `${rotulo} ${via}: literal`);
    }
    assert.deepStrictEqual(await conf(R), antes, `${rotulo}: conferencia nao gravada`);
    assert.strictEqual(await trilhaConf(R), n, `${rotulo}: sem CONFERENCIA_SEPARACAO na trilha`);
  };
  // C2: material comum, sem devolucao — separa 2 de 4, entrega 2, separar [] -> EM_SEPARACAO com a caixa 0.
  const caixaVaziaComum = async () => {
    const m = await material(0);
    const a = await montar([[m, 4]]);
    ok(await separar(a.R, [[a.ids[0], 2]]), 'separar 2');
    ok(await entregar(a.R, [[a.ids[0], 2]]), 'entregar 2');
    ok(await separar(a.R, []), 'separar []');
    return { m, ...a };
  };

  await test('[99 RN-09] C1 critico: separa 4, confere, entrega 2, devolve 2, separar [] -> conferir 400 "Nenhum item separado"', async () => {
    const m = await material(1);
    const a = await montar([[m, 4]]);
    ok(await separar(a.R, [[a.ids[0], 4]]), 'separar 4');
    ok(await conferir(a.R), 'conferir');
    ok(await entregar(a.R, [[a.ids[0], 2]]), 'entregar 2');
    ok(await devolver(a.R, [[a.ids[0], 2]]), 'devolver 2');
    ok(await separar(a.R, []), 'separar []');
    await recusaVazia(a.R, 'C1');
  });

  await test('[99 RN-09] C2 material comum sem devolucao: separa 2 de 4, entrega 2, separar [] -> conferir 400', async () => {
    const a = await caixaVaziaComum();
    await recusaVazia(a.R, 'C2');
  });

  await test('[99 RN-09] C3 resto 2,0000001 - 2 (1e-7, entre a folga e meia unidade da precisao) -> 400 (prova o ROUND)', async () => {
    const a = await caixaVaziaComum();
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 2.0000001 WHERE id = ?', [a.ids[0]]);
    await recusaVazia(a.R, 'C3');
  });

  await test('[99 RN-09] C4 entregue so em quantidade_atendida (legado) -> 400', async () => {
    const a = await caixaVaziaComum();
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_entregue = NULL, quantidade_atendida = 2 WHERE id = ?', [a.ids[0]]);
    await recusaVazia(a.R, 'C4');
  });

  await test('[99 RN-09] controles: caixa 2 -> 200 (rota); dois itens, um vazio e outro com 1 -> 200 (servico); separado 0 -> 400', async () => {
    const a = await caixaVaziaComum();
    ok(await separar(a.R, [[a.ids[0], 2]]), 'separar mais 2');
    const r = await conferir(a.R);
    ok(r, 'caixa 2 confere');
    assert.strictEqual((await conf(a.R)).conferido_por_id, USERS.ALMOX2.id);

    const m1 = await material(0); const m2 = await material(0);
    const b = await montar([[m1, 2], [m2, 2]]);
    ok(await separar(b.R, [[b.ids[0], 2]]), 'separar A 2');
    ok(await entregar(b.R, [[b.ids[0], 2]]), 'entregar A 2');
    ok(await separar(b.R, [[b.ids[1], 1]]), 'separar B 1');
    const rs = await conferirSvc(b.R);
    assert.strictEqual(rs.status, 200, `um vazio e outro com 1: ${JSON.stringify(rs.body)}`);
    assert.strictEqual((await conf(b.R)).conferido_por_id, CONF_SVC.id);

    const m3 = await material(0);
    const c = await montar([[m3, 2]]);
    ok(await separar(c.R, []), 'separar [] sem nada');
    await recusaVazia(c.R, 'separado 0');
  });

  await test('[99 RN-09] depois da recusa o documento anda: separa 1 -> conferir 200 -> liberar 200', async () => {
    const a = await caixaVaziaComum();
    await recusaVazia(a.R, 'antes');
    ok(await separar(a.R, [[a.ids[0], 1]]), 'separar 1');
    ok(await conferir(a.R), 'conferir');
    ok(await como('ALMOX').put(`${API}/requisicoes/${a.R}/liberar-retirada`, {}), 'liberar');
    assert.strictEqual((await conf(a.R)).status, 'PRONTA_PARA_RETIRADA');
  });

  await test('[99 RN-09] (Fase 5) critico com resto 2,0000001 - 2: a conferencia nao e exigida (fila sem CONFERIR, detalhe sem obrigatoria) — a mesma regua do conferir', async () => {
    const m = await material(1);
    const a = await montar([[m, 4]]);
    ok(await separar(a.R, [[a.ids[0], 2]]), 'separar 2');
    ok(await conferir(a.R), 'conferir');
    ok(await entregar(a.R, [[a.ids[0], 2]]), 'entregar 2');
    ok(await separar(a.R, []), 'separar []');
    await dbRun(db, `UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 2.0000001 WHERE id = ?`, [a.ids[0]]);
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET conferido_por_id = NULL, conferido_por_nome = NULL, conferido_em = NULL WHERE id = ?', [a.R]);
    await recusaVazia(a.R, 'resto critico');
    const fila = await como('ALMOX2').get(`${API}/fila-separacao`);
    assert.strictEqual(fila.status, 200, JSON.stringify(fila.body));
    const linha = fila.body.find((f) => f.id === a.R);
    assert.ok(linha, 'a requisicao continua na fila (tem pendente a separar)');
    assert.ok(!linha.etapas.includes('CONFERIR'), `fila: ${JSON.stringify(linha.etapas)}`);
    assert.strictEqual(linha.conferencia_pendente, false);
    assert.ok(linha.etapas.includes('SEPARAR'), `a metade positiva: ${JSON.stringify(linha.etapas)}`);
    const det = await como('ALMOX2').get(`${API}/requisicoes/${a.R}`);
    assert.strictEqual(det.body.conferencia_obrigatoria, false);
    assert.strictEqual(requisitionService.conferenciaObrigatoria([{ material_critico: 1, quantidade_separada: 2.0000001, quantidade_entregue: 2 }]), false);
    assert.strictEqual(requisitionService.conferenciaObrigatoria([{ material_critico: 1, quantidade_separada: 2.000001, quantidade_entregue: 2 }]), true,
      'controle: 1e-6 e caixa');
  });

  await test('[99 RN-09] (Fase 5) a menor caixa que existe (2,000001 - 2 = 1e-6) confere — o ROUND e de 6 casas, a regua do liberar', async () => {
    const a = await caixaVaziaComum();
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 2.000001 WHERE id = ?', [a.ids[0]]);
    ok(await conferir(a.R), 'caixa 1e-6 confere');
  });

  terminou = true;
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
