/**
 * Etapa 127 (feature 05, D (95) e C265; B819-B821) — o separavel dividido entre itens do MESMO material da mesma requisicao.
 *
 * A porta (`separarRequisicao`) ja dividia (B468): na ordem do payload, cada item ve a caixa sem reserva que os irmaos da rodada
 * acabaram de criar. A fila calculava cada linha sozinha (4 livres, dois itens de 4 -> "4" e "4", e a porta recusava o 4 + 4), e o
 * modal dividia tirando do segundo item TUDO o que o primeiro separava, inclusive a reserva propria dele (reservados 4 + 4 -> o modal
 * abria 4 e 0, e a porta aceitava 4 + 4). A conta unica (plano, RN-16):
 *   propria = max(0, r - c); livre = teto - propria (o mesmo pote para os irmaos);
 *   separavel_i = min(pendente_i, propria_i + max(0, livre_i - consumido)); consumido += max(0, separavel_i - propria_i).
 *
 * Usuarios reais por header (molde da 95): S sem perfil cria pela rota; ADMIN superadmin aprova e da entrada solta; ALMOX separa.
 * Casos `[127 RN-xx]`. Plano: docs/superpowers/plans/2026-10-16-almoxarifado-etapa127-o-perfil-que-saiu-e-o-separavel-dividido.md
 *
 * Executar: cd server && node tests/api/separavelDividido.api.test.js
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
  ADMIN: { id: 1, nome: 'Adm 127', role: 'admin', is_superadmin: 1, email: 'a127@t.com' },
  S: { id: 12701, nome: 'Solic 127', role: 'user', email: 's127@t.com' },
  ALMOX: { id: 12702, nome: 'Almox 127', role: 'user', email: 'x127@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});
const S2 = (nome, q, max, pend, disp) => `${nome}: não é possível separar ${q} PC. Máximo: ${max} (pendente: ${pend}, disponível: ${disp})`;

(async () => {
  console.log('\n=== Etapa 127: o separavel dividido entre itens do mesmo material ===\n');

  // ---- RN-16: a funcao pura (sem banco) ----
  const div = (itens) => Object.fromEntries([...requisitionService.dividirSeparavel(itens)].map(([k, v]) => [k, v]));
  await test('[127 RN-16] dividirSeparavel: C1 sem reserva (teto 4 e 4, propria 0) -> 4 e 0', async () => {
    assert.deepStrictEqual(div([{ id: 1, material_id: 9, pendente: 4, teto: 4, propria: 0 },
      { id: 2, material_id: 9, pendente: 4, teto: 4, propria: 0 }]), { 1: 4, 2: 0 });
  });
  await test('[127 RN-16] dividirSeparavel: C2 reservados (teto 4 e 4, propria 4 e 4) -> 4 e 4', async () => {
    assert.deepStrictEqual(div([{ id: 1, material_id: 9, pendente: 4, teto: 4, propria: 4 },
      { id: 2, material_id: 9, pendente: 4, teto: 4, propria: 4 }]), { 1: 4, 2: 4 });
  });
  await test('[127 RN-16] dividirSeparavel: C3 reserva parcial (teto 6 e 2, propria 4 e 0) -> 4 e 2; a ordem inversa -> 2 e 4', async () => {
    assert.deepStrictEqual(div([{ id: 1, material_id: 9, pendente: 4, teto: 6, propria: 4 },
      { id: 2, material_id: 9, pendente: 4, teto: 2, propria: 0 }]), { 1: 4, 2: 2 });
    assert.deepStrictEqual(div([{ id: 1, material_id: 9, pendente: 4, teto: 2, propria: 0 },
      { id: 2, material_id: 9, pendente: 4, teto: 6, propria: 4 }]), { 1: 2, 2: 4 });
  });
  await test('[127 RN-16] dividirSeparavel: fracao (livre 0,5, dois de 0,3) -> 0,3 e 0,2 (arredondado); materiais diferentes nao dividem', async () => {
    assert.deepStrictEqual(div([{ id: 1, material_id: 9, pendente: 0.3, teto: 0.5, propria: 0 },
      { id: 2, material_id: 9, pendente: 0.3, teto: 0.5, propria: 0 }]), { 1: 0.3, 2: 0.2 });
    assert.deepStrictEqual(div([{ id: 1, material_id: 9, pendente: 4, teto: 4, propria: 0 },
      { id: 2, material_id: 8, pendente: 4, teto: 4, propria: 0 }]), { 1: 4, 2: 4 });
  });
  await test('[127 RN-16] dividirSeparavel: pendente 0 da 0 e nao consome; propria maior que o teto nao passa do teto', async () => {
    assert.deepStrictEqual(div([{ id: 1, material_id: 9, pendente: 0, teto: 4, propria: 0 },
      { id: 2, material_id: 9, pendente: 4, teto: 4, propria: 0 }]), { 1: 0, 2: 4 });
    assert.deepStrictEqual(div([{ id: 1, material_id: 9, pendente: 4, teto: 1, propria: 3 }]), { 1: 1 });
  });
  await test('[127 RN-16, Fase 2 I1] dividirSeparavel: o inativo reservado (teto 0, propria 4) da 0 e nao consome', async () => {
    assert.deepStrictEqual(div([{ id: 1, material_id: 9, pendente: 4, teto: 0, propria: 4 },
      { id: 2, material_id: 9, pendente: 4, teto: 0, propria: 4 }]), { 1: 0, 2: 0 });
  });

  // ---- pelas rotas ----
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
  const material = async (fisico = 0) => {
    const c = `E127-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, material_critico, custo_unitario) VALUES (?, ?, 'PC', ?, 0, 1, 0, 0.1)`, [c, c, fisico])).lastID;
    return { id, nome: c };
  };
  const req = async (itens) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-127',
      itens: itens.map(([m, q]) => ({ material_id: m, quantidade: q })),
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    return { R: cr.body.id, ids };
  };
  const aprovar = async (R) => {
    const r = await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {});
    assert.strictEqual(r.status, 200, `aprovar: ${JSON.stringify(r.body)}`);
  };
  const entrar = async (m, q) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e127' });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const separar = (R, pares) => como('ALMOX').put(`${API}/requisicoes/${R}/separar`, {
    itens_separados: pares.map(([item_id, q]) => ({ item_id, quantidade_separada: q })),
  });
  const daFila = async (R) => {
    const r = await como('ALMOX').get(`${API}/fila-separacao`);
    assert.strictEqual(r.status, 200, `fila: ${JSON.stringify(r.body)}`);
    return r.body.find((l) => Number(l.id) === Number(R));
  };
  const separavelDaFila = async (R, ids) => {
    const l = await daFila(R);
    assert.ok(l, `a requisicao ${R} nao esta na fila`);
    return ids.map((id) => { const it = l.itens.find((i) => i.item_id === id); return it ? it.separavel : 'ausente'; });
  };
  const doDetalhe = async (R, ids, campo) => {
    const r = await como('ALMOX').get(`${API}/requisicoes/${R}`);
    assert.strictEqual(r.status, 200, `detalhe: ${JSON.stringify(r.body)}`);
    return ids.map((id) => (r.body.itens.find((i) => i.id === id) || {})[campo]);
  };
  const itemRow = (id) => dbGet(db, 'SELECT quantidade_separada FROM itens_requisicao_almoxarifado WHERE id=?', [id]);

  await test('[127 RN-10] C1 sem reserva: 4 livres, dois itens de 4 -> a fila diz 4 e 0, com Separar e Aguardando saldo; a porta recusa 4+4 e aceita 4+0', async () => {
    const m = await material(0);
    const { R, ids } = await req([[m.id, 4], [m.id, 4]]);
    await aprovar(R);
    await entrar(m.id, 4);
    assert.deepStrictEqual(await separavelDaFila(R, ids), [4, 0]);
    assert.deepStrictEqual((await daFila(R)).etapas, ['SEPARAR', 'AGUARDANDO_SALDO']);
    const r44 = await separar(R, [[ids[0], 4], [ids[1], 4]]);
    assert.strictEqual(r44.status, 400, JSON.stringify(r44.body));
    assert.strictEqual(r44.body.error, S2(m.nome, 4, 0, 4, 0));
    assert.strictEqual(Number((await itemRow(ids[0])).quantidade_separada || 0), 0, 'nada gravado na recusa');
    const r40 = await separar(R, [[ids[0], 4]]);
    assert.strictEqual(r40.status, 200, JSON.stringify(r40.body));
  });

  await test('[127 RN-11] C2 reservados 4+4 (controle): a fila 4 e 4, so Separar; o detalhe saldo_separavel 4 e 4, saldo_separavel_reserva 4 e 4; a porta aceita 4+4', async () => {
    const m = await material(8);
    const { R, ids } = await req([[m.id, 4], [m.id, 4]]);
    await aprovar(R);
    assert.deepStrictEqual(await separavelDaFila(R, ids), [4, 4]);
    assert.deepStrictEqual((await daFila(R)).etapas, ['SEPARAR']);
    assert.deepStrictEqual(await doDetalhe(R, ids, 'saldo_separavel'), [4, 4]);
    assert.deepStrictEqual(await doDetalhe(R, ids, 'saldo_separavel_reserva'), [4, 4]);
    const r = await separar(R, [[ids[0], 4], [ids[1], 4]]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });

  await test('[127 RN-12] C3 reserva parcial (4 reservados no primeiro, +2 livres): a fila 4 e 2; o detalhe 6/2 e reserva 4/0; a porta aceita 4+2 e recusa 4+3', async () => {
    const m = await material(4);
    const { R, ids } = await req([[m.id, 4], [m.id, 4]]);
    await aprovar(R);
    await entrar(m.id, 2);
    assert.deepStrictEqual(await separavelDaFila(R, ids), [4, 2]);
    assert.deepStrictEqual(await doDetalhe(R, ids, 'saldo_separavel'), [6, 2]);
    assert.deepStrictEqual(await doDetalhe(R, ids, 'saldo_separavel_reserva'), [4, 0]);
    const r43 = await separar(R, [[ids[0], 4], [ids[1], 3]]);
    assert.strictEqual(r43.status, 400, JSON.stringify(r43.body));
    const r42 = await separar(R, [[ids[0], 4], [ids[1], 2]]);
    assert.strictEqual(r42.status, 200, JSON.stringify(r42.body));
  });

  await test('[127 RN-13] a ordem do pedido: o item SEM reserva primeiro (a reserva no segundo, montada no banco), livre 2 -> a fila 2 e 4; a porta aceita 2+4 e recusa 3+4', async () => {
    const m = await material(4);
    const { R, ids } = await req([[m.id, 4], [m.id, 4]]);
    await aprovar(R);
    // a aprovacao reserva no primeiro item; o estado com a reserva no segundo e montado aqui (a conta nao depende de como chegou)
    const mov = await dbRun(db, `UPDATE reservas_material_almoxarifado SET item_requisicao_id = ? WHERE requisicao_id = ? AND item_requisicao_id = ?
      AND status = 'ATIVA'`, [ids[1], R, ids[0]]);
    assert.strictEqual(mov.changes, 1, 'premissa: uma reserva ativa no primeiro item');
    await entrar(m.id, 2);
    assert.deepStrictEqual(await doDetalhe(R, ids, 'saldo_separavel_reserva'), [0, 4]);
    assert.deepStrictEqual(await separavelDaFila(R, ids), [2, 4]);
    const r34 = await separar(R, [[ids[0], 3], [ids[1], 4]]);
    assert.strictEqual(r34.status, 400, JSON.stringify(r34.body));
    assert.strictEqual(r34.body.error, S2(m.nome, 3, 2, 4, 2));
    const r24 = await separar(R, [[ids[0], 2], [ids[1], 4]]);
    assert.strictEqual(r24.status, 200, JSON.stringify(r24.body));
  });

  await test('[127 RN-14] materiais diferentes nao dividem; o item ja todo separado da 0 e a caixa dele nao conta duas vezes', async () => {
    const a = await material(0); const b = await material(0);
    const r1 = await req([[a.id, 4], [b.id, 4]]);
    await aprovar(r1.R);
    await entrar(a.id, 4); await entrar(b.id, 4);
    assert.deepStrictEqual(await separavelDaFila(r1.R, r1.ids), [4, 4]);
    const m = await material(0);
    const { R, ids } = await req([[m.id, 4], [m.id, 4]]);
    await aprovar(R);
    await entrar(m.id, 6);
    assert.deepStrictEqual(await separavelDaFila(R, ids), [4, 2]);
    const s = await separar(R, [[ids[0], 4]]);
    assert.strictEqual(s.status, 200, JSON.stringify(s.body));
    // o primeiro (todo separado, pendente 0) some da linha de separar; o segundo continua 2 (6 fisicos - 4 na caixa), nao 6 - 4 - 4
    const l = await daFila(R);
    const segundo = l.itens.find((i) => i.item_id === ids[1]);
    assert.strictEqual(segundo.separavel, 2);
    const primeiro = l.itens.find((i) => i.item_id === ids[0]);
    assert.ok(!primeiro || primeiro.separavel === 0, `o primeiro item: ${JSON.stringify(primeiro)}`);
  });

  await test('[127 RN-15] o detalhe: material inativo -> saldo_separavel 0 e saldo_separavel_reserva 0; os campos de antes nao mudam de valor', async () => {
    const m = await material(8);
    const { R, ids } = await req([[m.id, 4], [m.id, 4]]);
    await aprovar(R);
    assert.deepStrictEqual(await doDetalhe(R, ids, 'quantidade_separavel'), [4, 4]); // o item sozinho, como antes
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [m.id]);
    assert.deepStrictEqual(await doDetalhe(R, ids, 'saldo_separavel'), [0, 0]);
    assert.deepStrictEqual(await doDetalhe(R, ids, 'saldo_separavel_reserva'), [0, 0]);
  });

  terminou = true;
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
