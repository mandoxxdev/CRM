/**
 * Etapa 136 (feature 05, D (135)) — a ordem das baixas da entrega: o automatico de um item nao esvazia mais a origem planejada do irmao.
 *
 * Fase 0 (scratchpad/e136/sonda-f0.js): o pedaco automatico (sem endereco) de um item tira do endereco padrao e depois do de mais saldo; se
 * esse endereco era a origem planejada de um irmao que vinha DEPOIS no laco, a recusa estrita do motor saia no irmao com o primeiro ja
 * baixado (400 "O saldo em A (1) nao cobre a quantidade (2)" e metade da entrega feita). Ja na primeira rodada.
 *
 *   RN-01 os estritos (com endereco) de todos os itens saem antes de qualquer automatico
 *   RN-02 o "so lote" (lote sem endereco) sai depois dos estritos
 *   RN-03 a previa conta, no so lote, o que os estritos do mesmo lote levam (a recusa sai antes de qualquer baixa)
 *   RN-04 o que ja funcionava nao muda (o planejado primeiro no laco; dois automaticos)
 *   RN-05 a falha numa passada posterior deixa a substituicao registrada e a origem limpa
 *   RN-06 integracao pela rota e pelo servico
 *
 * Plano: docs/superpowers/plans/2026-10-17-almoxarifado-etapa136-a-ordem-das-baixas.md
 * Executar: cd server && node tests/api/entregaOrdemDasBaixas.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll, dbGet } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}
const USERS = {
  ADMIN: { id: 1, nome: 'Adm 136', role: 'admin', is_superadmin: 1, email: 'a136@t.com' },
  S: { id: 13611, nome: 'Solic 136', role: 'user', email: 's136@t.com' },
  ALMOX: { id: 13612, nome: 'Almox 136', role: 'user', email: 'x136@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const E_END = (mat, cod, s, q) => `${mat}: O saldo em ${cod} (${s}) não cobre a quantidade (${q}) — a saída tiraria de outros endereços`;
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 136: a ordem das baixas da entrega ===\n');
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
  const loc = async (n) => {
    const c = `E136-${n}-${++seq}`;
    return { id: (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', [c, n])).lastID, codigo: c };
  };
  /** material novo (padrao opcional), requisicao do solicitante com `sols`; `antes` roda antes da aprovacao (entradas que viram reserva). */
  const montar = async ({ sols = [2, 2], padrao = null, antes = null } = {}) => {
    const codigo = `E136-${++seq}`;
    const m = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
      material_critico, custo_unitario, localizacao_padrao_id) VALUES (?, ?, 'PC', 0, 0, 1, 0, 0.1, ?)`, [codigo, codigo, padrao])).lastID;
    if (antes) await antes(m);
    const cr = await como('S').post('/api/requisicoes-material', { setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-136',
      itens: sols.map((q) => ({ material_id: m, quantidade: q })) });
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    const R = cr.body.id;
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [R])).map((r) => r.id);
    const ap = await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {});
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    return { m, nome: codigo, R, ids };
  };
  const entrada = async (m, q, destino, lote) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e136',
      ...(destino ? { localizacao_destino_id: destino } : {}), ...(lote ? { lote } : {}) });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id=? AND codigo=?', [m, codigo])).id;
  const separar = async (R, linhas) => {
    const r = await como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: linhas });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  };
  const entregar = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: linhas });
  const saldoEm = async (m, l, lote = undefined) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND localizacao_id IS ?${lote === undefined ? '' : ' AND lote_id IS ?'}`, [m, l, ...(lote === undefined ? [] : [lote])])).q);
  const foto = async (c) => {
    const mat = await dbGet(db, 'SELECT quantidade_atual f, quantidade_reservada r FROM materiais_almoxarifado WHERE id=?', [c.m]);
    const its = await dbAll(db, `SELECT quantidade_separada sep, quantidade_entregue ent, origem_separacao_id o FROM itens_requisicao_almoxarifado
      WHERE requisicao_id=? ORDER BY id`, [c.R]);
    const saidas = (await dbGet(db, "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id=? AND tipo='SAIDA'", [c.m])).n;
    const linhas = await dbAll(db, 'SELECT localizacao_id l, lote_id t, quantidade q FROM estoque_saldo_almoxarifado WHERE material_id=? ORDER BY id', [c.m]);
    const st = (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id=?', [c.R])).status;
    return { f: mat.f, r: mat.r, its: its.map((i) => [i.sep, i.ent, i.o]), saidas, linhas, st };
  };
  const saidasDoItem = async (c, itemId) => dbAll(db, `SELECT m.localizacao_origem_id o, m.lote_id t, m.quantidade q FROM movimentacoes_almoxarifado m
    WHERE m.material_id = ? AND m.tipo = 'SAIDA' AND m.requisicao_id = ? ORDER BY m.id`, [c.m, c.R]).then((rows) => rows);
  const status = async (c) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id=?', [c.R])).status;

  // V1 — a primeira rodada: item 1 separado sem origem (automatico), item 2 separado de A; A o de mais saldo
  const v1 = async ({ reservado }) => {
    const A = await loc('A'); const B = await loc('B');
    const c = await montar({ antes: reservado ? async (m) => { await entrada(m, 3, A.id); await entrada(m, 2, B.id); } : null });
    if (!reservado) { await entrada(c.m, 3, A.id); await entrada(c.m, 2, B.id); }
    await separar(c.R, [{ item_id: c.ids[0], quantidade_separada: 2 }, { item_id: c.ids[1], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    return { c, A, B };
  };

  await test('[RN-01] V1 (reservados 2 + 2): o automatico do item 1 nao esvazia a origem planejada do item 2 — 200, A da 2 ao item 2', async () => {
    const { c, A, B } = await v1({ reservado: true });
    assert.strictEqual((await foto(c)).r, 4, 'premissa: reservados 2 + 2');
    const r = await entregar(c.R, [{ item_id: c.ids[0], quantidade_atendida: 2 }, { item_id: c.ids[1], quantidade_atendida: 2 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const f = await foto(c);
    assert.strictEqual(f.st, 'ENTREGUE');
    assert.deepStrictEqual([f.f, f.r, await saldoEm(c.m, A.id), await saldoEm(c.m, B.id)], [1, 0, 1, 0]);
    // a saida estrita (item 2) diz "saiu de A" no livro; nenhuma linha sem endereco negativa
    const s = await saidasDoItem(c);
    assert.ok(s.some((x) => Number(x.o) === A.id && Number(x.q) === 2), JSON.stringify(s));
    assert.ok(f.linhas.every((l) => Number(l.q) >= 0), JSON.stringify(f.linhas));
  });

  await test('[RN-01] V1b (sem reserva): o mesmo — 200', async () => {
    const { c, A, B } = await v1({ reservado: false });
    assert.strictEqual((await foto(c)).r, 0, 'premissa: sem reserva');
    const r = await entregar(c.R, [{ item_id: c.ids[0], quantidade_atendida: 2 }, { item_id: c.ids[1], quantidade_atendida: 2 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual([(await foto(c)).f, await saldoEm(c.m, A.id), await saldoEm(c.m, B.id), await status(c)], [1, 1, 0, 'ENTREGUE']);
  });

  await test('[RN-01] V3 (o caso da D (135)): item 1 na segunda rodada sem origem, item 2 de A — 200', async () => {
    const A = await loc('A'); const B = await loc('B'); const X = await loc('X');
    const c = await montar({ sols: [4, 2] });
    await entrada(c.m, 2, X.id);
    await separar(c.R, [{ item_id: c.ids[0], quantidade_separada: 2 }]);
    assert.strictEqual((await entregar(c.R, [{ item_id: c.ids[0], quantidade_atendida: 2 }])).status, 200);
    await entrada(c.m, 3, A.id); await entrada(c.m, 2, B.id);
    await separar(c.R, [{ item_id: c.ids[1], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    const r = await entregar(c.R, [{ item_id: c.ids[0], quantidade_atendida: 2 }, { item_id: c.ids[1], quantidade_atendida: 2 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const f = await foto(c);
    assert.deepStrictEqual([f.st, f.f, await saldoEm(c.m, A.id), await saldoEm(c.m, B.id)], ['ENTREGUE', 1, 1, 0]);
    assert.deepStrictEqual(f.its.map((i) => i[1]), [4, 2]);
  });

  await test('[RN-01] V4: A e o endereco PADRAO (o automatico o prefere) — 200, A da 2 ao item 2 e o automatico sai de B', async () => {
    const A = await loc('A'); const B = await loc('B');
    const c = await montar({ padrao: A.id });
    await entrada(c.m, 3, A.id); await entrada(c.m, 5, B.id);
    await separar(c.R, [{ item_id: c.ids[0], quantidade_separada: 2 }, { item_id: c.ids[1], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    const r = await entregar(c.R, [{ item_id: c.ids[0], quantidade_atendida: 2 }, { item_id: c.ids[1], quantidade_atendida: 2 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    // passada 0: A 3 -> 1; passada 2: o automatico prefere o padrao (A 1) e completa do de mais saldo (B 5 -> 4)
    assert.deepStrictEqual([(await foto(c)).f, await saldoEm(c.m, A.id), await saldoEm(c.m, B.id)], [4, 0, 4]);
  });

  await test('[RN-01] V6: o EXCEDENTE automatico do proprio item planejado nao esvazia a origem do irmao — 200', async () => {
    const A = await loc('A'); const B = await loc('B');
    const c = await montar({ sols: [4, 2] });
    await entrada(c.m, 1, B.id);
    await separar(c.R, [{ item_id: c.ids[0], quantidade_separada: 1, localizacao_origem_id: B.id }]);
    assert.strictEqual((await entregar(c.R, [{ item_id: c.ids[0], quantidade_atendida: 0.5 }])).status, 200);
    await entrada(c.m, 4, A.id); await entrada(c.m, 1, B.id);
    await separar(c.R, [{ item_id: c.ids[1], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    assert.deepStrictEqual([await saldoEm(c.m, A.id), await saldoEm(c.m, B.id)], [4, 1.5], 'premissa');
    const r = await entregar(c.R, [{ item_id: c.ids[0], quantidade_atendida: 3 }, { item_id: c.ids[1], quantidade_atendida: 2 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    // passada 0: B 0,5 (caixa do item 1) e A 2 (item 2) -> B 1, A 2; passada 2: o automatico 2,5 tira A 2 e B 0,5
    const f = await foto(c);
    assert.deepStrictEqual([f.st, f.f, await saldoEm(c.m, A.id), await saldoEm(c.m, B.id)], ['PARCIALMENTE_ATENDIDA', 0.5, 0, 0.5]);
    assert.deepStrictEqual(f.its.map((i) => i[1]), [3.5, 2]); // 4 pedidos: 0,5 + 3 entregues
  });

  await test('[RN-02] V7: o "so lote" (lote escolhido sem endereco) do item 1 sai depois do estrito (A, L) do item 2 — 200', async () => {
    const A = await loc('A'); const B = await loc('B');
    const c = await montar();
    const L = `L7-${seq}`;
    await entrada(c.m, 3, A.id, L); await entrada(c.m, 2, B.id, L);
    const l1 = await loteId(c.m, L);
    await separar(c.R, [{ item_id: c.ids[0], quantidade_separada: 2 }, { item_id: c.ids[1], quantidade_separada: 2, localizacao_origem_id: A.id, lote_id: l1 }]);
    const r = await entregar(c.R, [{ item_id: c.ids[0], quantidade_atendida: 2, lote_id: l1 }, { item_id: c.ids[1], quantidade_atendida: 2 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    // passada 0: (A, L) 3 -> 1; passada 1: o lote L tira do de mais saldo (B 2 -> 0)
    assert.deepStrictEqual([await status(c), await saldoEm(c.m, A.id, l1), await saldoEm(c.m, B.id, l1)], ['ENTREGUE', 1, 0]);
  });

  await test('[RN-03] V7b: so lote + estrito do mesmo lote que NAO cabem juntos — 400 antes de qualquer baixa, nada mudou', async () => {
    const A = await loc('A');
    const c = await montar();
    const L = `L7b-${seq}`;
    await entrada(c.m, 2, A.id, L); await entrada(c.m, 5, null);
    const l1 = await loteId(c.m, L);
    await separar(c.R, [{ item_id: c.ids[0], quantidade_separada: 2 }, { item_id: c.ids[1], quantidade_separada: 2, localizacao_origem_id: A.id, lote_id: l1 }]);
    const antes = await foto(c);
    const r = await entregar(c.R, [{ item_id: c.ids[0], quantidade_atendida: 2, lote_id: l1 }, { item_id: c.ids[1], quantidade_atendida: 2 }]);
    assert.deepStrictEqual([r.status, r.body.error], [400, `${c.nome}: Saldo insuficiente no lote ${L}. Disponível: 0 PC`]);
    assert.deepStrictEqual(await foto(c), antes, 'a recusa baixou alguma coisa');
    assert.strictEqual(antes.saidas, 0, 'premissa: nenhuma saida');
    // metade positiva: com L em A 4, os dois cabem
    await entrada(c.m, 2, A.id, L);
    const ok = await entregar(c.R, [{ item_id: c.ids[0], quantidade_atendida: 2, lote_id: l1 }, { item_id: c.ids[1], quantidade_atendida: 2 }]);
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.strictEqual(await saldoEm(c.m, A.id, l1), 0);
  });

  await test('[RN-03] N1 (Fase 2 I2): o mesmo V7b em material que PERMITE saldo negativo nao soma — 200 (o motor grava a linha do lote negativa)', async () => {
    const A = await loc('A');
    const c = await montar();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET permite_saldo_negativo = 1 WHERE id = ?', [c.m]);
    const L = `L7n-${seq}`;
    await entrada(c.m, 2, A.id, L); await entrada(c.m, 5, null);
    const l1 = await loteId(c.m, L);
    await separar(c.R, [{ item_id: c.ids[0], quantidade_separada: 2 }, { item_id: c.ids[1], quantidade_separada: 2, localizacao_origem_id: A.id, lote_id: l1 }]);
    const r = await entregar(c.R, [{ item_id: c.ids[0], quantidade_atendida: 2, lote_id: l1 }, { item_id: c.ids[1], quantidade_atendida: 2 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual([await status(c), await saldoEm(c.m, A.id, l1), (await foto(c)).f], ['ENTREGUE', 0, 3]);
  });

  await test('[RN-03] o estrito de OUTRO lote no mesmo endereco nao entra na conta do so lote (a chave e o lote)', async () => {
    const A = await loc('A');
    const c = await montar();
    const L1 = `L1-${seq}`; const L2 = `L2-${seq}`;
    await entrada(c.m, 2, A.id, L1); await entrada(c.m, 2, A.id, L2);
    const l1 = await loteId(c.m, L1); const l2 = await loteId(c.m, L2);
    await separar(c.R, [{ item_id: c.ids[0], quantidade_separada: 2 }, { item_id: c.ids[1], quantidade_separada: 2, localizacao_origem_id: A.id, lote_id: l2 }]);
    const r = await entregar(c.R, [{ item_id: c.ids[0], quantidade_atendida: 2, lote_id: l1 }, { item_id: c.ids[1], quantidade_atendida: 2 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual([await saldoEm(c.m, A.id, l1), await saldoEm(c.m, A.id, l2)], [0, 0]);
  });

  await test('[RN-04] V2 (o planejado ja vinha primeiro no laco) e V8 (dois automaticos): os mesmos saldos de antes', async () => {
    {
      const A = await loc('A'); const B = await loc('B');
      const c = await montar();
      await entrada(c.m, 3, A.id); await entrada(c.m, 2, B.id);
      await separar(c.R, [{ item_id: c.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }, { item_id: c.ids[1], quantidade_separada: 2 }]);
      const r = await entregar(c.R, [{ item_id: c.ids[0], quantidade_atendida: 2 }, { item_id: c.ids[1], quantidade_atendida: 2 }]);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.deepStrictEqual([await saldoEm(c.m, A.id), await saldoEm(c.m, B.id)], [1, 0], 'V2');
    }
    {
      const A = await loc('A'); const B = await loc('B');
      const c = await montar();
      await entrada(c.m, 3, A.id); await entrada(c.m, 2, B.id);
      await separar(c.R, [{ item_id: c.ids[0], quantidade_separada: 2 }, { item_id: c.ids[1], quantidade_separada: 2 }]);
      const r = await entregar(c.R, [{ item_id: c.ids[0], quantidade_atendida: 2 }, { item_id: c.ids[1], quantidade_atendida: 2 }]);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      // item 1 tira A 2 (o de mais saldo) -> A 1, B 2; item 2 tira B 2 (agora o de mais saldo) -> A 1, B 0
      assert.deepStrictEqual([await saldoEm(c.m, A.id), await saldoEm(c.m, B.id)], [1, 0], 'V8');
    }
  });

  await test('[RN-04] dois estritos no mesmo endereco que nao cabem juntos: a recusa de antes, antes de qualquer baixa', async () => {
    const A = await loc('A'); const B = await loc('B');
    const c = await montar();
    await entrada(c.m, 4, A.id); await entrada(c.m, 5, B.id);
    await separar(c.R, [{ item_id: c.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }, { item_id: c.ids[1], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    // A cai a 3 por uma saida avulsa de 1 depois da separacao
    const s = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: c.m, tipo: 'SAIDA', quantidade: 1, motivo: 'e136', justificativa: 'e136 avulsa', localizacao_origem_id: A.id });
    assert.ok([200, 201].includes(s.status), JSON.stringify(s.body));
    const antes = await foto(c);
    const r = await entregar(c.R, [{ item_id: c.ids[0], quantidade_atendida: 2 }, { item_id: c.ids[1], quantidade_atendida: 2 }]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(/a origem da separação \(E136-A-\d+\) não serve mais/.test(r.body.error), r.body.error);
    assert.deepStrictEqual(await foto(c), antes);
  });

  await test('[RN-05] a falha na passada dos automaticos deixa a substituicao do estrito registrada e a origem dele limpa', async () => {
    const A = await loc('A'); const B = await loc('B');
    const c = await montar();
    await entrada(c.m, 5, A.id); await entrada(c.m, 5, B.id);
    await separar(c.R, [{ item_id: c.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }, { item_id: c.ids[1], quantidade_separada: 2 }]);
    const original = stockService.registrarMovimentacao;
    let n = 0;
    stockService.registrarMovimentacao = async (...args) => {
      n += 1;
      if (!args[2].localizacao_origem_id) throw Object.assign(new Error('falha injetada no automatico'), { status: 400 });
      return original(...args);
    };
    let r;
    try {
      r = await entregar(c.R, [{ item_id: c.ids[0], quantidade_atendida: 2, localizacao_origem_id: B.id, motivo_substituicao: 'A interditada' },
        { item_id: c.ids[1], quantidade_atendida: 2 }]);
    } finally { stockService.registrarMovimentacao = original; }
    assert.deepStrictEqual([r.status, r.body.error], [400, `${c.nome}: falha injetada no automatico`]);
    assert.strictEqual(n, 2, 'premissa: o estrito saiu e o automatico falhou');
    const f = await foto(c);
    assert.deepStrictEqual(f.its.map((i) => i[1]), [2, 0], 'o estrito do item 1 saiu');
    assert.strictEqual(f.its[0][2], null, 'a origem planejada do item 1 (todo o separado entregue) nao foi limpa');
    const subs = await dbAll(db, 'SELECT item_id, localizacao_planejada_id p, localizacao_saida_id s, motivo FROM substituicoes_origem_requisicao WHERE requisicao_id = ?', [c.R]);
    assert.deepStrictEqual(subs.map((x) => [x.item_id, x.p, x.s, x.motivo]), [[c.ids[0], A.id, B.id, 'A interditada']]);
  });

  await test('[RN-06] integracao pelo SERVICO: o V6 por requisitionService.entregarRequisicao — as mesmas baixas', async () => {
    const A = await loc('A'); const B = await loc('B');
    const c = await montar({ sols: [4, 2] });
    await entrada(c.m, 1, B.id);
    await separar(c.R, [{ item_id: c.ids[0], quantidade_separada: 1, localizacao_origem_id: B.id }]);
    await requisitionService.entregarRequisicao(db, c.R, [{ item_id: c.ids[0], quantidade_atendida: 0.5 }], USERS.ALMOX);
    await entrada(c.m, 4, A.id); await entrada(c.m, 1, B.id);
    await separar(c.R, [{ item_id: c.ids[1], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    await requisitionService.entregarRequisicao(db, c.R, [{ item_id: c.ids[0], quantidade_atendida: 3 }, { item_id: c.ids[1], quantidade_atendida: 2 }], USERS.ALMOX);
    const f = await foto(c);
    assert.deepStrictEqual([f.st, f.f, await saldoEm(c.m, A.id), await saldoEm(c.m, B.id)], ['PARCIALMENTE_ATENDIDA', 0.5, 0, 0.5]);
  });

  await test('[RN-06] integracao pela ROTA: separar -> entregar -> livro (A no estrito, sem endereco no automatico) -> detalhe e fila', async () => {
    const { c, A } = await v1({ reservado: true });
    const r = await entregar(c.R, [{ item_id: c.ids[0], quantidade_atendida: 2 }, { item_id: c.ids[1], quantidade_atendida: 2 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const s = await saidasDoItem(c);
    assert.deepStrictEqual(s.map((x) => [x.o === null ? null : Number(x.o), Number(x.q)]).sort((a, b) => String(a).localeCompare(String(b))),
      [[A.id, 2], [null, 2]].sort((a, b) => String(a).localeCompare(String(b))), JSON.stringify(s));
    const d = (await como('ALMOX').get(`${API}/requisicoes/${c.R}`)).body;
    assert.strictEqual(d.status, 'ENTREGUE');
    assert.deepStrictEqual(d.itens.map((i) => Number(i.quantidade_entregue)), [2, 2]);
    assert.deepStrictEqual(d.substituicoes || [], []);
    const fila = (await como('ALMOX').get(`${API}/fila-separacao`)).body;
    assert.ok(!fila.some((x) => Number(x.id) === Number(c.R)), 'a entregue continua na fila');
  });

  terminou = true;
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
