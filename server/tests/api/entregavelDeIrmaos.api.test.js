/**
 * Etapa 135 (feature 05, D (127)) — o entregavel de IRMAOS (itens do mesmo material na mesma requisicao).
 *
 * Fase 0 (scratchpad/e135/sonda-f0.js): no cenario da spec (reservados 4 + 4) nao diverge; diverge na SEGUNDA RODADA (item ja entregue em
 * parte, a caixa abaixo do pendente) de dois irmaos que tiram do mesmo livre: o detalhe prometia o livre inteiro a cada um, a previa da
 * entrega lia cada irmao sozinho e passava, e o laco — que rele depois de cada baixa — recusava o segundo DEPOIS de baixar o primeiro
 * (400 com metade da entrega feita).
 *
 *   RN-01 a previa conta o que os irmaos anteriores da mesma entrega levam (a recusa sai antes de qualquer baixa)
 *   RN-02 o detalhe manda saldo_entregavel e saldo_entregavel_proprio (aditivos)
 *   RN-02b o critico entrega so a caixa, tambem no detalhe (C286, Fase 2 I3)
 *   RN-03 a conta que divide e a da 127 (dividirSeparavel) — o numero exato passa, um centesimo a mais recusa
 *   RN-04 o cenario da spec (reservados 4 + 4, separados 4 e 3, entrega parcial) nao diverge — preso
 *   RN-05 a fila nao passa da caixa (nao divide porque nao precisa) — preso
 *   RN-07 integracao pela rota e pelo servico
 *
 * Plano: docs/superpowers/plans/2026-10-16-almoxarifado-etapa135-o-entregavel-de-irmaos.md
 * Executar: cd server && node tests/api/entregavelDeIrmaos.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll, dbGet } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}
const USERS = {
  ADMIN: { id: 1, nome: 'Adm 135', role: 'admin', is_superadmin: 1, email: 'a135@t.com' },
  S: { id: 13511, nome: 'Solic 135', role: 'user', email: 's135@t.com' },
  ALMOX: { id: 13512, nome: 'Almox 135', role: 'user', email: 'x135@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 135: o entregavel de irmaos ===\n');
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
  const nomeDe = {};
  /** material com `fisico` antes da aprovacao (a aprovacao reserva o que houver, na ordem dos itens), requisicao com `sols`. */
  const montar = async (fisico, sols = [4, 4]) => {
    const nome = `E135I-${++seq}`;
    const m = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario) VALUES (?, ?, 'PC', ?, 0, 1, 0, 0.1)`, [nome, nome, fisico])).lastID;
    const cr = await como('S').post('/api/requisicoes-material', { setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-135',
      itens: sols.map((q) => ({ material_id: m, quantidade: q })) });
    assert.ok(cr.body.id, JSON.stringify(cr.body));
    const R = cr.body.id;
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [R])).map((r) => r.id);
    const ap = await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {});
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    nomeDe[R] = nome;
    return { m, R, ids, nome };
  };
  const entrada = async (m, q) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e135' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const separar = async (R, pares) => {
    const r = await como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, {
      itens_separados: pares.map(([item_id, q]) => ({ item_id, quantidade_separada: q })) });
    assert.strictEqual(r.status, 200, `separar ${JSON.stringify(pares)}: ${JSON.stringify(r.body)}`);
  };
  const entregar = (R, pares) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, {
    itens_atendidos: pares.filter(([, q]) => q > 0).map(([item_id, q]) => ({ item_id, quantidade_atendida: q })) });
  const entregarOk = async (R, pares) => {
    const r = await entregar(R, pares);
    assert.strictEqual(r.status, 200, `entregar ${JSON.stringify(pares)}: ${JSON.stringify(r.body)}`);
  };
  /** o estado que uma recusa nao pode mudar: fisico, reservado, itens, movimentacoes, status. */
  const foto = async ({ m, R }) => ({
    mat: await dbGet(db, 'SELECT quantidade_atual f, quantidade_reservada r FROM materiais_almoxarifado WHERE id=?', [m]),
    itens: await dbAll(db, `SELECT quantidade_separada s, quantidade_entregue e FROM itens_requisicao_almoxarifado
      WHERE requisicao_id=? ORDER BY id`, [R]),
    movs: (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id=?', [m])).n,
    status: (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id=?', [R])).status,
  });
  const detalhe = async (R, ids) => {
    const d = (await como('ALMOX').get(`${API}/requisicoes/${R}`)).body;
    return ids.map((id) => d.itens.find((i) => i.id === id));
  };
  /** a conta da janela (RN-03/RN-06): a da 127, com os campos do detalhe. */
  const daJanela = async (R, ids) => {
    const itens = await detalhe(R, ids);
    const mp = requisitionService.dividirSeparavel(itens.map((i) => ({ id: i.id, material_id: i.material_id,
      pendente: i.quantidade_entregavel, teto: i.saldo_entregavel, propria: i.saldo_entregavel_proprio })));
    return ids.map((id) => mp.get(id));
  };
  const daFila = async (R) => (await como('ALMOX').get(`${API}/fila-separacao`)).body.find((x) => Number(x.id) === Number(R));
  const E1 = (nome, q, m, p, d) => `${nome}: não é possível entregar ${q} PC. Máximo: ${m} (pendente: ${p}, disponível: ${d})`;

  /** S2: sem reserva, 4 entram, separados 2 e 2, entregues 2 e 2; depois `livres` entram (segunda rodada dos dois). */
  const s2 = async (livres, sols = [4, 4]) => {
    const c = await montar(0, sols);
    await entrada(c.m, 2 * sols.length);
    await separar(c.R, c.ids.map((id) => [id, 2]));
    await entregarOk(c.R, c.ids.map((id) => [id, 2]));
    await entrada(c.m, livres);
    return c;
  };

  await test('[135 RN-01] S2: 2 + 2 no mesmo livre de 2 recusa ANTES de baixar o primeiro (E1 com os numeros dele) e nada muda', async () => {
    const c = await s2(2);
    const antes = await foto(c);
    assert.deepStrictEqual([antes.mat.f, antes.status], [2, 'PARCIALMENTE_ATENDIDA'], 'premissa');
    const r = await entregar(c.R, [[c.ids[0], 2], [c.ids[1], 2]]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(c.nome, 2, 0, 2, 0));
    assert.deepStrictEqual(await foto(c), antes, 'a recusa baixou o primeiro irmao');
    // metade positiva: dividido, passa
    await entregarOk(c.R, [[c.ids[0], 1], [c.ids[1], 1]]);
    const depois = await foto(c);
    assert.deepStrictEqual([depois.mat.f, depois.itens.map((i) => i.e)], [0, [3, 3]]);
  });

  await test('[135 RN-01] pelo servico (entregarRequisicao direto): 2 + 2 recusa sem baixar; 2 + 0 passa', async () => {
    const c = await s2(2);
    const antes = await foto(c);
    let erro = null;
    try {
      await requisitionService.entregarRequisicao(db, c.R, [{ item_id: c.ids[0], quantidade_atendida: 2 },
        { item_id: c.ids[1], quantidade_atendida: 2 }], { ...USERS.ALMOX });
    } catch (e) { erro = e; }
    assert.ok(erro, 'o servico aceitou 2 + 2');
    assert.deepStrictEqual([erro.status, erro.message], [400, E1(c.nome, 2, 0, 2, 0)]);
    assert.deepStrictEqual(await foto(c), antes, 'o servico baixou o primeiro irmao');
    await requisitionService.entregarRequisicao(db, c.R, [{ item_id: c.ids[0], quantidade_atendida: 2 }], { ...USERS.ALMOX });
    assert.deepStrictEqual((await foto(c)).itens.map((i) => i.e), [4, 2]);
  });

  await test('[135 RN-01] S5: o irmao anterior entrega a caixa SEM reserva e o seguinte (segunda rodada) leva o livre — passa (a caixa que saiu nao conta duas vezes)', async () => {
    const c = await montar(0);
    await entrada(c.m, 2);
    await separar(c.R, [[c.ids[1], 2]]);
    await entregarOk(c.R, [[c.ids[1], 2]]); // o 2o na segunda rodada: entregue 2, caixa 0, pendente 2
    await entrada(c.m, 2);
    await separar(c.R, [[c.ids[0], 2]]); // o 1o com 2 na caixa sem reserva; o livre depois da caixa: 0
    await entrada(c.m, 1); // livre 1
    const it = await detalhe(c.R, c.ids);
    assert.deepStrictEqual(it.map((i) => i.quantidade_entregavel), [2, 1], 'premissa: o detalhe');
    await entregarOk(c.R, [[c.ids[0], 2], [c.ids[1], 1]]);
    const f = await foto(c);
    assert.deepStrictEqual([f.mat.f, f.itens.map((i) => i.e)], [0, [2, 3]]);
  });

  await test('[135 RN-01] P1 (Fase 2 I1): primeira rodada com o fisico abaixo da caixa sem reserva — 2 + 2 recusa antes de baixar', async () => {
    const c = await montar(0);
    await entrada(c.m, 4);
    await separar(c.R, [[c.ids[0], 2], [c.ids[1], 2]]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 2 WHERE id = ?', [c.m]); // o efeito da contagem por endereco (C186)
    const antes = await foto(c);
    const r = await entregar(c.R, [[c.ids[0], 2], [c.ids[1], 2]]);
    assert.deepStrictEqual([r.status, r.body.error], [400, E1(c.nome, 2, 0, 4, 0)]);
    assert.deepStrictEqual(await foto(c), antes, 'a recusa baixou o primeiro irmao');
    await entregarOk(c.R, [[c.ids[0], 2]]);
  });

  await test('[135 RN-01] M2: a conta dos irmaos e por material — um item de outro material no meio da entrega nao perde o disponivel dele', async () => {
    const nome = (x) => `E135M-${++seq}${x}`;
    const mat = async () => { const n = nome(''); return { id: (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade,
      quantidade_atual, quantidade_minima, ativo, material_critico, custo_unitario) VALUES (?, ?, 'PC', 0, 0, 1, 0, 0.1)`, [n, n])).lastID, n }; };
    const A = await mat(); const B = await mat();
    const cr = await como('S').post('/api/requisicoes-material', { setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-135',
      itens: [{ material_id: A.id, quantidade: 4 }, { material_id: B.id, quantidade: 4 }, { material_id: A.id, quantidade: 4 }] });
    const R = cr.body.id;
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [R])).map((x) => x.id);
    assert.strictEqual((await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {})).status, 200);
    await entrada(A.id, 4); await entrada(B.id, 4);
    await separar(R, ids.map((id) => [id, 2]));
    await entregarOk(R, ids.map((id) => [id, 2])); // A: fisico 0; B: fisico 2, o item B na segunda rodada
    await entrada(A.id, 2);
    await entregarOk(R, [[ids[0], 2], [ids[1], 2]]); // o 1o de A leva os 2 livres de A; o B leva os 2 dele
    const f = await dbAll(db, 'SELECT id, quantidade_atual f FROM materiais_almoxarifado WHERE id IN (?, ?) ORDER BY id', [A.id, B.id]);
    assert.deepStrictEqual(f.map((x) => x.f), [0, 0]);
  });

  await test('[135 RN-02] o detalhe: na segunda rodada o teto e a parte propria; fora dela, os dois iguais ao entregavel', async () => {
    const c = await s2(2);
    const it = await detalhe(c.R, c.ids);
    assert.deepStrictEqual(it.map((i) => [i.quantidade_entregavel, i.saldo_entregavel, i.saldo_entregavel_proprio]), [[2, 2, 0], [2, 2, 0]]);
    const s1 = await montar(8);
    await separar(s1.R, [[s1.ids[0], 4], [s1.ids[1], 3]]);
    await entregarOk(s1.R, [[s1.ids[0], 2]]);
    const i1 = await detalhe(s1.R, s1.ids);
    assert.deepStrictEqual(i1.map((i) => [i.quantidade_entregavel, i.saldo_entregavel, i.saldo_entregavel_proprio]), [[2, 2, 2], [3, 3, 3]]);
  });

  await test('[135 RN-02b] critico na segunda rodada: o detalhe entrega so a caixa (0), como a porta (C286)', async () => {
    const c = await s2(2);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET material_critico = 1 WHERE id = ?', [c.m]);
    const it = await detalhe(c.R, c.ids);
    assert.deepStrictEqual(it.map((i) => [i.quantidade_entregavel, i.saldo_entregavel, i.saldo_entregavel_proprio]), [[0, 0, 0], [0, 0, 0]]);
    const r = await entregar(c.R, [[c.ids[0], 2]]);
    assert.deepStrictEqual([r.status, r.body.error], [400, `${c.nome}: material crítico só sai depois de separado e conferido — 2 excede `
      + 'o separado ainda não entregue (0). Separe o restante e peça a segunda conferência.']);
    // metade positiva: o mesmo estado sem o critico promete 2 (o numero muda pelo critico, nao por outra coisa)
    await dbRun(db, 'UPDATE materiais_almoxarifado SET material_critico = 0 WHERE id = ?', [c.m]);
    assert.deepStrictEqual((await detalhe(c.R, c.ids)).map((i) => i.quantidade_entregavel), [2, 2]);
  });

  /** RN-03: a conta da janela; o numero exato passa e um centesimo a mais recusa sem baixar — no ultimo item cuja conta ficou ABAIXO do
   * entregavel dele (Fase 2 I2: no item que ja passa do proprio maximo a previa de hoje tambem recusa, e o cenario nao provaria nada);
   * sem divisao (nenhum abaixo), no ultimo com conta > 0. */
  const confereConta = async (c, esperado, recusa) => {
    const conta = await daJanela(c.R, c.ids);
    assert.deepStrictEqual(conta, esperado, 'a conta da janela');
    const sozinho = (await detalhe(c.R, c.ids)).map((i) => i.quantidade_entregavel);
    const abaixo = conta.map((q, i) => (q < sozinho[i] - 1e-9 ? i : -1)).filter((i) => i >= 0);
    const iUlt = abaixo.length ? abaixo.pop() : conta.map((q, i) => (q > 0 ? i : -1)).filter((i) => i >= 0).pop();
    const mais = conta.map((q, i) => (i === iUlt ? Math.round((q + 0.01) * 1e6) / 1e6 : q));
    const antes = await foto(c);
    const r1 = await entregar(c.R, c.ids.map((id, i) => [id, mais[i]]));
    assert.strictEqual(r1.status, 400, `um centesimo a mais: ${r1.status} ${JSON.stringify(r1.body)}`);
    assert.strictEqual(r1.body.error, recusa(mais[iUlt]));
    assert.deepStrictEqual(await foto(c), antes, 'o centesimo a mais baixou algo');
    await entregarOk(c.R, c.ids.map((id, i) => [id, conta[i]]));
  };

  await test('[135 RN-03] S2 +2 livres: a janela da 2 e 0; 0,01 no segundo recusa', async () => {
    const c = await s2(2);
    await confereConta(c, [2, 0], (q) => E1(c.nome, q, 0, 2, 0));
  });
  await test('[135 RN-03] S2 +3 livres: 2 e 1; o segundo com 1,01 recusa com o disponivel que o primeiro deixa', async () => {
    const c = await s2(3);
    await confereConta(c, [2, 1], (q) => E1(c.nome, q, 1, 2, 1));
  });
  await test('[135 RN-03] tres irmaos na segunda rodada, 3 livres: 2, 1 e 0', async () => {
    const c = await s2(3, [4, 4, 4]);
    await confereConta(c, [2, 1, 0], (q) => E1(c.nome, q, 0, 2, 0));
  });
  await test('[135 RN-03] S1 e S1p (reservados): nada a dividir — a janela e o detalhe dao o mesmo', async () => {
    const a = await montar(8);
    await separar(a.R, [[a.ids[0], 4], [a.ids[1], 3]]);
    await entregarOk(a.R, [[a.ids[0], 2]]);
    await confereConta(a, [2, 3], (q) => E1(a.nome, q, 3, 4, 4));
    const b = await montar(8);
    await separar(b.R, [[b.ids[0], 4], [b.ids[1], 3]]);
    await entregarOk(b.R, [[b.ids[1], 2]]);
    await confereConta(b, [4, 2], (q) => E1(b.nome, q, 2, 2, 2));
  });
  await test('[135 RN-03] S6: a caixa sem reserva de um irmao na segunda rodada e propria dele — a janela da 3 e 1', async () => {
    const c = await montar(0);
    await entrada(c.m, 4);
    await separar(c.R, [[c.ids[0], 3], [c.ids[1], 1]]);
    await entregarOk(c.R, [[c.ids[0], 1], [c.ids[1], 1]]); // o 1o com 2 na caixa sem reserva, pendente 3; o 2o com a caixa vazia
    await entrada(c.m, 2);
    const it = await detalhe(c.R, c.ids);
    assert.deepStrictEqual(it.map((i) => [i.quantidade_entregavel, i.saldo_entregavel, i.saldo_entregavel_proprio]), [[3, 4, 2], [2, 2, 0]]);
    await confereConta(c, [3, 1], (q) => E1(c.nome, q, 1, 3, 1));
  });
  await test('[135 RN-03] S4: a reserva propria fora da caixa nao e dividida — a janela da 2 e 0, e 1 + 1 tambem passa', async () => {
    const c = await montar(2); // o 1o reserva 2, o 2o nada
    await entrada(c.m, 3);
    await separar(c.R, [[c.ids[0], 1], [c.ids[1], 2]]);
    await entregarOk(c.R, [[c.ids[0], 1], [c.ids[1], 2]]); // o 1o: reserva 1 fora da caixa; o livre: 1
    const it = await detalhe(c.R, c.ids);
    assert.deepStrictEqual(it.map((i) => [i.quantidade_entregavel, i.saldo_entregavel, i.saldo_entregavel_proprio]), [[2, 2, 1], [1, 1, 0]]);
    const antes = await foto(c);
    const r = await entregar(c.R, [[c.ids[0], 2], [c.ids[1], 1]]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(c.nome, 1, 0, 2, 0));
    assert.deepStrictEqual(await foto(c), antes);
    await confereConta(c, [2, 0], (q) => E1(c.nome, q, 0, 2, 0));
    const d = await montar(2);
    await entrada(d.m, 3);
    await separar(d.R, [[d.ids[0], 1], [d.ids[1], 2]]);
    await entregarOk(d.R, [[d.ids[0], 1], [d.ids[1], 2]]);
    await entregarOk(d.R, [[d.ids[0], 1], [d.ids[1], 1]]);
  });

  await test('[135 RN-04] o cenario da spec (reservados 4 + 4, separados 4 e 3, entrega de 2 do primeiro): fila = detalhe = porta', async () => {
    const c = await montar(8);
    await separar(c.R, [[c.ids[0], 4], [c.ids[1], 3]]);
    await entregarOk(c.R, [[c.ids[0], 2]]);
    const f = await daFila(c.R);
    assert.ok(f.etapas.includes('ENTREGAR'), JSON.stringify(f.etapas));
    assert.deepStrictEqual(c.ids.map((id) => f.itens.find((i) => i.item_id === id).entregavel), [2, 3], 'a fila');
    assert.deepStrictEqual((await detalhe(c.R, c.ids)).map((i) => i.quantidade_entregavel), [2, 3], 'o detalhe');
    const antes = await foto(c);
    const r = await entregar(c.R, [[c.ids[0], 2], [c.ids[1], 4]]);
    assert.deepStrictEqual([r.status, r.body.error], [400, E1(c.nome, 4, 3, 4, 4)]);
    assert.deepStrictEqual(await foto(c), antes);
    await entregarOk(c.R, [[c.ids[0], 2], [c.ids[1], 3]]);
    assert.strictEqual((await foto(c)).status, 'PARCIALMENTE_ATENDIDA');
  });

  await test('[135 RN-05] a fila nao passa da caixa: S2 +2 livres mostra entregavel 0 e 0, sem ENTREGAR (oferece separar)', async () => {
    const c = await s2(2);
    const f = await daFila(c.R);
    assert.deepStrictEqual(f.etapas, ['SEPARAR', 'AGUARDANDO_SALDO']);
    assert.deepStrictEqual(c.ids.map((id) => { const i = f.itens.find((x) => x.item_id === id); return [i.a_entregar, i.entregavel]; }),
      [[0, 0], [0, 0]]);
  });

  await test('[135 RN-07] integracao: separar (rota) -> entregar parcial (rota) -> entrada -> detalhe -> a conta da janela -> entregar (rota); +0,01 pelo SERVICO recusa', async () => {
    const c = await s2(3);
    const conta = await daJanela(c.R, c.ids);
    assert.deepStrictEqual(conta, [2, 1]);
    const antes = await foto(c);
    let erro = null;
    try {
      await requisitionService.entregarRequisicao(db, c.R, [{ item_id: c.ids[0], quantidade_atendida: 2 },
        { item_id: c.ids[1], quantidade_atendida: 1.01 }], { ...USERS.ALMOX });
    } catch (e) { erro = e; }
    assert.deepStrictEqual(erro && [erro.status, erro.message], [400, E1(c.nome, 1.01, 1, 2, 1)]);
    assert.deepStrictEqual(await foto(c), antes);
    await entregarOk(c.R, [[c.ids[0], conta[0]], [c.ids[1], conta[1]]]);
    const f = await foto(c);
    assert.deepStrictEqual([f.mat.f, f.itens.map((i) => i.e), f.status], [0, [4, 3], 'PARCIALMENTE_ATENDIDA']);
    const d = await detalhe(c.R, c.ids);
    assert.deepStrictEqual(d.map((i) => i.quantidade_entregavel), [0, 0], 'o detalhe depois');
  });

  // ── Fase 5 (r3): os cenarios que as sabotagens sobreviventes pediram (reserva dentro da caixa, tres irmaos, a caixa de um terceiro,
  // a reserva que cobre a caixa na segunda rodada, os campos fora da segunda rodada, o critico com caixa, o legado) ──
  const tres = (itens) => itens.map((i) => [i.quantidade_entregavel, i.saldo_entregavel, i.saldo_entregavel_proprio]);
  const recusaSemBaixar = async (c, pares, msg) => {
    const antes = await foto(c);
    const r = await entregar(c.R, pares);
    assert.deepStrictEqual([r.status, r.body.error], [400, msg]);
    assert.deepStrictEqual(await foto(c), antes, 'a recusa baixou algo');
  };

  await test('[135 Fase 5 r3] a conta pura do efeito: (caixa, reserva, q) -> o que sai do disponivel e da caixa sem reserva', async () => {
    const ef = requisitionService.efeitoDaEntregaNoMaterial;
    assert.deepStrictEqual(ef(3, 1, 1), { disponivel: 0, caixaSemReserva: 0 }, 'a reserva dentro da caixa sai primeiro');
    assert.deepStrictEqual(ef(2, 0, 2), { disponivel: 2, caixaSemReserva: 2 });
    assert.deepStrictEqual(ef(0, 1, 2), { disponivel: 1, caixaSemReserva: 0 }, 'segunda rodada com reserva');
    assert.deepStrictEqual(ef(1, 3, 2), { disponivel: 0, caixaSemReserva: 0 });
    assert.deepStrictEqual(ef(3, 1, 2), { disponivel: 1, caixaSemReserva: 1 });
    const aj = requisitionService.saldoAjustadoPelosIrmaos({ disponivel: 5, disponivel_material: 3, caixa_outros_itens: 2, reservado_para_item: 2 },
      { disponivel: 1, caixaSemReserva: 2 });
    assert.deepStrictEqual([aj.disponivel, aj.disponivel_material, aj.caixa_outros_itens, aj.reservado_para_item], [4, 2, 0, 2]);
  });

  await test('[135 Fase 5 r3, Z1] reserva 1 dentro da caixa 3: entregar 1 dela nao tira caixa sem reserva — o irmao na segunda rodada 2 recusa antes; 1 passa', async () => {
    const c = await montar(1); // i1 reserva 1
    await entrada(c.m, 2);
    await separar(c.R, [[c.ids[1], 2]]);
    await entregarOk(c.R, [[c.ids[1], 2]]); // i2: entregue 2, caixa 0, pendente 2
    await entrada(c.m, 3); // fisico 4, reservado 1
    await separar(c.R, [[c.ids[0], 3]]); // i1: caixa 3, reserva 1 -> caixa sem reserva 2; livre do i2: 3 - 2 = 1
    assert.deepStrictEqual(tres(await detalhe(c.R, c.ids)), [[3, 3, 3], [1, 1, 0]], 'premissa: o detalhe');
    await recusaSemBaixar(c, [[c.ids[0], 1], [c.ids[1], 2]], E1(c.nome, 2, 1, 2, 3));
    await entregarOk(c.R, [[c.ids[0], 1], [c.ids[1], 1]]);
  });

  await test('[135 Fase 5 r3, Z2] dois irmaos anteriores entregam a caixa sem reserva; o terceiro (segunda rodada) leva o livre — passa', async () => {
    const c = await montar(0, [4, 4, 4]);
    await entrada(c.m, 1);
    await separar(c.R, [[c.ids[2], 1]]);
    await entregarOk(c.R, [[c.ids[2], 1]]); // i3: entregue 1, caixa 0
    await entrada(c.m, 2);
    await separar(c.R, [[c.ids[0], 1], [c.ids[1], 1]]); // caixas sem reserva 1 e 1
    await entrada(c.m, 1); // fisico 3, livre 1
    await entregarOk(c.R, [[c.ids[0], 1], [c.ids[1], 1], [c.ids[2], 1]]);
    const f = await foto(c);
    assert.deepStrictEqual([f.mat.f, f.itens.map((i) => i.e)], [0, [1, 1, 2]]);
  });

  await test('[135 Fase 5 r3, Z3] caixa sem reserva de um TERCEIRO irmao fora da entrega: o 2o na segunda rodada recusa antes (o teto ve o que o 1o levou)', async () => {
    const c = await montar(0, [4, 4, 4]);
    await entrada(c.m, 2);
    await separar(c.R, [[c.ids[0], 1], [c.ids[1], 1]]);
    await entregarOk(c.R, [[c.ids[0], 1], [c.ids[1], 1]]); // i1, i2: entregue 1, caixa 0, pendente 3
    await entrada(c.m, 2);
    await separar(c.R, [[c.ids[2], 2]]); // i3: caixa 2 sem reserva
    await entrada(c.m, 1); // fisico 3, livre depois da caixa: 1
    await recusaSemBaixar(c, [[c.ids[0], 1], [c.ids[1], 1]], E1(c.nome, 1, 0, 3, 2));
    await entregarOk(c.R, [[c.ids[0], 1]]);
  });

  await test('[135 Fase 5 r3, Z4] legado com separado abaixo do entregue: o detalhe nao fica com caixa negativa (saldo_entregavel 2, propria 0)', async () => {
    const c = await montar(0);
    await entrada(c.m, 4);
    await separar(c.R, c.ids.map((id) => [id, 2]));
    await entregarOk(c.R, c.ids.map((id) => [id, 2]));
    await entrada(c.m, 2);
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 0 WHERE requisicao_id = ?', [c.R]); // legado
    assert.deepStrictEqual(tres(await detalhe(c.R, c.ids)), [[2, 2, 0], [2, 2, 0]]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET material_critico = 1 WHERE id = ?', [c.m]);
    assert.deepStrictEqual(tres(await detalhe(c.R, c.ids)), [[0, 0, 0], [0, 0, 0]], 'critico com caixa negativa');
  });

  await test('[135 Fase 5 r3, Z5] caixa igual ao pendente com livre sobrando: fora da segunda rodada os dois campos sao o entregavel', async () => {
    const c = await montar(8);
    await separar(c.R, [[c.ids[0], 4], [c.ids[1], 3]]);
    await entregarOk(c.R, [[c.ids[0], 2]]); // i1: caixa 2 = pendente 2
    await entrada(c.m, 2);
    assert.deepStrictEqual(tres(await detalhe(c.R, c.ids))[0], [2, 2, 2]);
  });

  await test('[135 Fase 5 r3, Z6] critico com caixa 1 na segunda rodada e livre: os dois campos sao a caixa (1, 1, 1)', async () => {
    const c = await montar(0);
    await entrada(c.m, 4);
    await separar(c.R, c.ids.map((id) => [id, 2]));
    await entregarOk(c.R, c.ids.map((id) => [id, 2]));
    await entrada(c.m, 3);
    await separar(c.R, [[c.ids[0], 1]]); // i1: caixa 1 sem reserva, pendente 2
    await dbRun(db, 'UPDATE materiais_almoxarifado SET material_critico = 1 WHERE id = ?', [c.m]);
    assert.deepStrictEqual(tres(await detalhe(c.R, c.ids))[0], [1, 1, 1]);
  });

  await test('[135 Fase 5 r3, Z7] reserva que cobre a caixa (c=1, r=3) na segunda rodada, 1 livre: a propria e max(c,r)=3 e a janela da 4 e 0', async () => {
    const c = await montar(4, [5, 4]); // i1 reserva 4
    await entrada(c.m, 1);
    await separar(c.R, [[c.ids[1], 1]]);
    await entregarOk(c.R, [[c.ids[1], 1]]); // i2: entregue 1, caixa 0
    await separar(c.R, [[c.ids[0], 2]]);
    await entregarOk(c.R, [[c.ids[0], 1]]); // i1: entregue 1, caixa 1, reserva 3
    await entrada(c.m, 1); // livre 1
    assert.deepStrictEqual(tres(await detalhe(c.R, c.ids)), [[4, 4, 3], [1, 1, 0]]);
    assert.deepStrictEqual(await daJanela(c.R, c.ids), [4, 0]);
  });

  terminou = true;
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
