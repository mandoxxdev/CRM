/**
 * Etapa 196 (T5) — integracao da origem da separacao em duas vezes, pela ROTA e pelo SERVICO, cruzando T1 (separacao guarda a parte),
 * T2 (entrega e devolucao a prateleira contam a parte) e T3 (fila/sugestao contam a parte), e passando por dois vizinhos que nao
 * escrevem no item: a devolucao da saida (POST /devolucoes, destino Estoque) e a exclusao da requisicao (o estorno por saida, Etapa 58).
 *
 * Cada cenario confere o livro (de onde saiu cada unidade: `localizacao_origem_id`/`lote_id` das SAIDAs da requisicao) e o saldo de
 * cada endereco. Os "controles sem a feature" refazem a MESMA conferencia com a origem apagada depois da 2a rodada (o que a regra
 * velha "mista -> nula" da Etapa 59 fazia) e mostram que ela da os numeros de antes — a conferencia sabe distinguir.
 *
 * Usuarios reais por header (molde da 189 T4): S sem perfil cria pela rota; ADMIN superadmin aprova, da entrada e exclui; ALMOX separa
 * e entrega. Plano: docs/superpowers/plans/2026-11-05-almoxarifado-etapa196-origem-da-separacao-em-duas-vezes.md (T5 e "Fase 2" item 4).
 *
 * Executar: cd server && node tests/api/origemSeparacaoEmDuasVezesIntegracao.api.test.js
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
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 196', role: 'admin', is_superadmin: 1, email: 'a196@t.com' },
  S: { id: 19621, nome: 'Solic 196', role: 'user', email: 's196@t.com' },
  ALMOX: { id: 19622, nome: 'Almox 196', role: 'user', email: 'x196@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 196 (T5): integracao da origem da separacao em duas vezes ===\n');
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
    del: (u, b = {}) => request(app).delete(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM196I', nome: 'Almox 196 I' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const B01 = await loc('YB-01'); const P01 = await loc('YP-01');
  const A = await loc('YA-01'); const B = await loc('YB-02'); const C = await loc('YC-01');

  const material = async ({ lote = false, padrao = P01.id } = {}) => {
    const c = `E196I-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, localizacao_padrao_id) VALUES (?, ?, 'PC', 0, 0, 1, 0, 0.1, ?, ?)`,
    [c, c, lote ? 1 : 0, padrao])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, destino, q, lote) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA',
    quantidade: q, motivo: 'e196i', localizacao_destino_id: destino, ...(lote ? { lote } : {}) }), 201);
  const req = async (itens) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-196',
      itens: itens.map(([m, q]) => ({ material_id: m, quantidade: q })),
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    await ok(como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/aprovar`, {}));
    return { R: cr.body.id, ids };
  };
  const separar = (R, linhas) => ok(como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: linhas }));
  const entregar = (R, linhas) => ok(como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: linhas }));
  const excluir = (R) => ok(como('ADMIN').del(`${API}/requisicoes/${R}`, { justificativa: 'e196i' }));
  const sugestao = async (R) => (await ok(como('ALMOX').get(`${API}/requisicoes/${R}/sugestao-coleta`))).body.itens[0];

  // O retrato de saldos: cada linha (endereco, lote) nao zero, mais o fisico do material — o "nenhum saldo diferente".
  const retrato = async (m) => {
    const linhas = await dbAll(db, `SELECT l.codigo as loc, lt.codigo as lote, s.quantidade q FROM estoque_saldo_almoxarifado s
        LEFT JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id LEFT JOIN lotes_almoxarifado lt ON lt.id = s.lote_id
        WHERE s.material_id = ? ORDER BY l.codigo, lt.codigo`, [m.id]);
    const fis = await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    return {
      linhas: linhas.filter((x) => Math.abs(Number(x.q)) > 1e-9).map((x) => `${x.loc}/${x.lote || '-'}=${Number(x.q)}`),
      fisico: Number(fis.q),
    };
  };
  // O livro da requisicao (o que move fisico — RESERVA/LIBERACAO ficam de fora): [tipo, endereco, lote, quantidade] em ordem.
  const livro = async (R, m) => (await dbAll(db, `SELECT mv.tipo, l.codigo as loc, lt.codigo as lote, mv.quantidade q
      FROM movimentacoes_almoxarifado mv LEFT JOIN localizacoes_almoxarifado l ON l.id = COALESCE(mv.localizacao_origem_id, mv.localizacao_destino_id)
      LEFT JOIN lotes_almoxarifado lt ON lt.id = mv.lote_id
      WHERE mv.requisicao_id = ? AND mv.material_id = ? AND mv.tipo IN ('SAIDA', 'ENTRADA', 'ENTRADA_DEVOLUCAO') ORDER BY mv.id`, [R, m.id]))
    .map((x) => [x.tipo, x.loc || null, x.lote || null, Number(x.q)]);
  const trocas = (R) => dbAll(db, 'SELECT momento, quantidade FROM substituicoes_origem_requisicao WHERE requisicao_id = ? ORDER BY id', [R]);
  const origem = async (item) => {
    const r = await dbGet(db, `SELECT l.codigo as loc, lt.codigo as lote, i.quantidade_origem_separacao q,
        i.quantidade_separada - COALESCE(i.quantidade_entregue, 0) caixa FROM itens_requisicao_almoxarifado i
        LEFT JOIN localizacoes_almoxarifado l ON l.id = i.origem_separacao_id LEFT JOIN lotes_almoxarifado lt ON lt.id = i.lote_separacao_id
        WHERE i.id = ?`, [item]);
    return { loc: r.loc || null, lote: r.lote || null, q: r.q == null ? null : Number(r.q), caixa: Number(r.caixa) };
  };
  const apagarOrigem = (item) => dbRun(db, `UPDATE itens_requisicao_almoxarifado SET origem_separacao_id = NULL, lote_separacao_id = NULL,
      quantidade_origem_separacao = NULL WHERE id = ?`, [item]);

  // ── Cenario 1: o caso real da 189, ponta a ponta, ate a exclusao ───────────────────────────────────────────────────────────────
  // Material com lote, padrao YP-01. L1 3 em YB-01; requisicao de 6; 1a rodada com o par sugerido; chega L2 3 em YP-01; 2a rodada
  // sem "Sai de" (a janela abre no automatico: a planejada nao cobre). Entrega de um clique 6. Exclusao.
  const casoReal = async ({ semFeature = false } = {}) => {
    const m = await material({ lote: true });
    await entrar(m, B01.id, 3, 'L1');
    const { R, ids } = await req([[m.id, 6]]);
    const s = await sugestao(R);
    assert.deepStrictEqual([s.pegar_em.localizacao_codigo, s.pegar_em.lote_codigo, s.pegar_em.quantidade_sugerida], ['YB-01', 'L1', 3]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: s.pegar_em.localizacao_id, lote_id: s.pegar_em.lote_id }]);
    await entrar(m, P01.id, 3, 'L2');
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    if (semFeature) await apagarOrigem(ids[0]);
    const antes = await retrato(m);
    assert.deepStrictEqual(antes, { linhas: ['YB-01/L1=3', 'YP-01/L2=3'], fisico: 6 }, 'premissa: antes da 1a entrega');
    return { m, R, ids, antes };
  };

  await test('[T5 rota, cenario 1] o caso real: 0 trocas, origem YB-01/L1 parte 3 -> entrega de um clique 6 -> livro: 3 de YB-01/L1, 3 no automatico (sem lote -3, item 5) -> excluir: o estorno devolve por saida e nenhum saldo difere do de antes da 1a entrega', async () => {
    const { m, R, ids, antes } = await casoReal();
    assert.deepStrictEqual(await trocas(R), []);
    assert.deepStrictEqual(await origem(ids[0]), { loc: 'YB-01', lote: 'L1', q: 3, caixa: 6 });
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 6 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'YB-01', 'L1', 3], ['SAIDA', null, null, 3]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['YP-01/-=-3', 'YP-01/L2=3'], fisico: 0 });
    assert.deepStrictEqual(await trocas(R), []);
    assert.deepStrictEqual(await origem(ids[0]), { loc: null, lote: null, q: null, caixa: 0 });
    await excluir(R);
    // o estorno da exclusao e por SAIDA (Etapa 58): uma ENTRADA para cada, com o endereco/lote dela; a automatica, sem endereco no
    // livro, volta sem endereco informado — o motor credita na padrao YP-01 sem lote (D (51)), de onde ela tirou. A exclusao nao grava movimento_estorno_id nas saidas (isso e o estorno pelo livro).
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'YB-01', 'L1', 3], ['SAIDA', null, null, 3],
      ['ENTRADA', 'YB-01', 'L1', 3], ['ENTRADA', null, null, 3]]);
    assert.deepStrictEqual(await retrato(m), antes);
  });

  await test('[T5 rota, cenario 1 — controle sem a feature] a mesma conferencia com a origem apagada depois da 2a rodada (a regra velha) da os numeros de antes: 6 no automatico, YB-01/L1 fica com 3, sem lote -6', async () => {
    const { m, R, ids, antes } = await casoReal({ semFeature: true });
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 6 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, null, 3], ['SAIDA', null, null, 3]], 'sem a origem, tudo no automatico');
    assert.deepStrictEqual(await retrato(m), { linhas: ['YB-01/L1=3', 'YP-01/-=-6', 'YP-01/L2=3'], fisico: 0 });
    await excluir(R);
    assert.deepStrictEqual(await retrato(m), antes, 'a exclusao devolve igual nos dois mundos (por saida)');
  });

  // ── Cenario 2 (Fase 2 item 4: requisicao de 7) — sem lote, A 3 + B 3 escolhido de proposito ────────────────────────────────────
  await test('[T5 rota, cenario 2] A 3 + B 3 (escolhido) -> origem A 3 -> entrega parcial 2 (de A, parte 1) -> devolucao da saida 1 para Estoque em A -> separar mais 1 de A (parte 2) -> entrega do resto 5 (2 de A, 3 automatico) -> excluir: saldos do antes da 1a entrega', async () => {
    const m = await material({ padrao: B.id });
    await entrar(m, A.id, 4); await entrar(m, B.id, 3);
    const { R, ids } = await req([[m.id, 7]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: B.id }]);
    assert.deepStrictEqual(await trocas(R), []);
    assert.deepStrictEqual(await origem(ids[0]), { loc: 'YA-01', lote: null, q: 3, caixa: 6 });
    const antes = await retrato(m);
    assert.deepStrictEqual(antes, { linhas: ['YA-01/-=4', 'YB-02/-=3'], fisico: 7 });

    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'YA-01', null, 2]]);
    assert.deepStrictEqual(await origem(ids[0]), { loc: 'YA-01', lote: null, q: 1, caixa: 4 });
    assert.deepStrictEqual(await retrato(m), { linhas: ['YA-01/-=2', 'YB-02/-=3'], fisico: 5 });

    const saidaA = (await dbGet(db, `SELECT id FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'SAIDA' ORDER BY id DESC LIMIT 1`,
      [R])).id;
    await ok(como('ADMIN').post(`${API}/devolucoes`, { material_id: m.id, quantidade: 1, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE',
      movimentacao_saida_id: saidaA, localizacao_id: A.id }), 201);
    assert.deepStrictEqual(await retrato(m), { linhas: ['YA-01/-=3', 'YB-02/-=3'], fisico: 6 });
    // a devolucao da saida nao escreve no item: a caixa e a parte nao mudam (o entregue tambem nao — por isso a requisicao de 7)
    assert.deepStrictEqual(await origem(ids[0]), { loc: 'YA-01', lote: null, q: 1, caixa: 4 });

    await separar(R, [{ item_id: ids[0], quantidade_separada: 1, localizacao_origem_id: A.id }]);
    assert.deepStrictEqual(await origem(ids[0]), { loc: 'YA-01', lote: null, q: 2, caixa: 5 }, 'RN-196.02: mesmo par soma');

    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 5 }]);
    const l = await livro(R, m);
    // a parte da origem (2) sai estrita de A; o resto (3) no automatico, que tira da padrao B. A devolucao nao entra aqui: a
    // ENTRADA_DEVOLUCAO nao leva requisicao_id.
    assert.deepStrictEqual(l, [['SAIDA', 'YA-01', null, 2], ['SAIDA', 'YA-01', null, 2], ['SAIDA', null, null, 3]]);
    assert.deepStrictEqual(await trocas(R), []);
    assert.deepStrictEqual(await origem(ids[0]), { loc: null, lote: null, q: null, caixa: 0 });
    assert.deepStrictEqual(await retrato(m), { linhas: ['YA-01/-=1'], fisico: 1 });

    await excluir(R);
    // o estorno credita o LIQUIDO de cada saida (a de A, 2, ja teve 1 devolvido): fisico 1 + 6 = 7, e cada endereco de volta
    assert.deepStrictEqual(await retrato(m), antes);
  });

  await test('[T5 rota, cenario 2 — controle sem a feature] origem apagada depois da 2a rodada: a entrega parcial de 2 sai no automatico (nao de A) e a caixa nao tem parte', async () => {
    const m = await material({ padrao: B.id });
    await entrar(m, A.id, 4); await entrar(m, B.id, 3);
    const { R, ids } = await req([[m.id, 7]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: B.id }]);
    await apagarOrigem(ids[0]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, null, 2]], 'sem a origem, a parcial sai no automatico (da padrao B)');
    assert.deepStrictEqual(await retrato(m), { linhas: ['YA-01/-=4', 'YB-02/-=1'], fisico: 5 });
  });

  // ── Cenario 3: separacao parcial que fica pendente; a 3a rodada e a dica da fila ───────────────────────────────────────────────
  await test('[T5 rota, cenario 3] requisicao de 10: A 3 + automatico 2 -> EM_SEPARACAO com 5 a separar -> a dica sugere A (o par planejado, livre pela parte) -> 3a rodada de A 3 cabe -> entrega 8: 6 de A, 2 automatico', async () => {
    const m = await material({ padrao: C.id });
    await entrar(m, A.id, 6); await entrar(m, C.id, 2);
    const { R, ids } = await req([[m.id, 10]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2 }]);
    const st = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R]);
    assert.strictEqual(st.status, 'EM_SEPARACAO');
    assert.deepStrictEqual(await origem(ids[0]), { loc: 'YA-01', lote: null, q: 3, caixa: 5 });
    // A tem 6 fisicos e o comprometido dela e a parte 3 (nao a caixa 5): a dica ve 3 livres em A.
    const s = await sugestao(R);
    assert.ok(s.pegar_em, JSON.stringify(s));
    assert.deepStrictEqual([s.pegar_em.localizacao_codigo, s.pegar_em.quantidade_no_endereco], ['YA-01', 3], JSON.stringify(s));
    const fila = (await ok(como('ALMOX').get(`${API}/fila-separacao`))).body.find((x) => x.id === R).itens[0];
    assert.deepStrictEqual([fila.pegar_em.localizacao_codigo, fila.pegar_em.quantidade_no_endereco], ['YA-01', 3]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]);
    assert.deepStrictEqual(await origem(ids[0]), { loc: 'YA-01', lote: null, q: 6, caixa: 8 });
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 8 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'YA-01', null, 6], ['SAIDA', null, null, 2]]);
    assert.deepStrictEqual(await retrato(m), { linhas: [], fisico: 0 });
  });

  await test('[T5 rota, cenario 3 — controle sem a feature] com a parte pela caixa (dado NULL = a caixa 5), a dica ve so 1 livre em A (6 - 5) e nao cobre — a conferencia distingue', async () => {
    const m = await material({ padrao: C.id });
    await entrar(m, A.id, 6); await entrar(m, C.id, 2);
    const { R, ids } = await req([[m.id, 10]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2 }]);
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_origem_separacao = NULL WHERE id = ?', [ids[0]]);
    const s = await sugestao(R);
    assert.deepStrictEqual([s.pegar_em.localizacao_codigo, s.pegar_em.quantidade_no_endereco, s.pegar_em.cobre, s.pegar_em_aviso],
      ['YA-01', 1, false, 'PLANEJADA_NAO_COBRE'], JSON.stringify(s));
  });

  // ── Cenario 4: dado antigo (origem guardada, quantidade NULL), ponta a ponta ───────────────────────────────────────────────────
  await test('[T5 rota, cenario 4, RN-196.10] dado antigo: origem A com quantidade NULL e caixa 3 -> rodada automatica 3 grava a parte 3 -> entrega de um clique 6: 3 de A, 3 automatico -> excluir: saldos do antes', async () => {
    const m = await material({ padrao: B.id });
    await entrar(m, A.id, 3); await entrar(m, B.id, 3);
    const { R, ids } = await req([[m.id, 6]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]);
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_origem_separacao = NULL WHERE id = ?', [ids[0]]);
    assert.deepStrictEqual(await origem(ids[0]), { loc: 'YA-01', lote: null, q: null, caixa: 3 }, 'premissa: o dado antigo');
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    assert.deepStrictEqual(await origem(ids[0]), { loc: 'YA-01', lote: null, q: 3, caixa: 6 });
    const antes = await retrato(m);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 6 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'YA-01', null, 3], ['SAIDA', null, null, 3]]);
    assert.deepStrictEqual(await retrato(m), { linhas: [], fisico: 0 });
    await excluir(R);
    assert.deepStrictEqual(await retrato(m), antes);
  });

  await test('[T5 rota, cenario 4 — dado antigo sem rodada no meio] origem A NULL, caixa 3: a entrega de um clique tira a caixa inteira de A (vale a caixa, RN-196.10)', async () => {
    const m = await material({ padrao: C.id });
    await entrar(m, A.id, 3); await entrar(m, B.id, 3);
    const { R, ids } = await req([[m.id, 3]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]);
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_origem_separacao = NULL WHERE id = ?', [ids[0]]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'YA-01', null, 3]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['YB-02/-=3'], fisico: 3 });
  });

  // ── Cenario 5: pelo SERVICO (sem rota), o caso real ────────────────────────────────────────────────────────────────────────────
  await test('[T5 servico, cenario 5] separarRequisicao + entregarRequisicao + excluirRequisicao direto: A/L1 3 + automatico 3 -> 0 trocas, 3 de A/L1, 3 automatico, sem lote -3; excluir volta tudo', async () => {
    const m = await material({ lote: true });
    await entrar(m, B01.id, 3, 'L1'); await entrar(m, P01.id, 3, 'L2');
    const l1 = (await dbGet(db, "SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = 'L1'", [m.id])).id;
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E196I-${++seq}`])).lastID;
    const it = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,6,0,0,0)`, [R, m.id])).lastID;
    const antes = await retrato(m);
    await requisitionService.separarRequisicao(db, R, [{ item_id: it, quantidade_separada: 3, localizacao_origem_id: B01.id, lote_id: l1 }],
      USERS.ADMIN);
    await requisitionService.separarRequisicao(db, R, [{ item_id: it, quantidade_separada: 3 }], USERS.ADMIN);
    assert.deepStrictEqual(await requisitionService.listarSubstituicoes(db, R), []);
    assert.deepStrictEqual(await origem(it), { loc: 'YB-01', lote: 'L1', q: 3, caixa: 6 });
    await requisitionService.entregarRequisicao(db, R, [{ item_id: it, quantidade_atendida: 6 }], USERS.ADMIN);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'YB-01', 'L1', 3], ['SAIDA', null, null, 3]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['YP-01/-=-3', 'YP-01/L2=3'], fisico: 0 });
    assert.deepStrictEqual(await requisitionService.listarSubstituicoes(db, R), []);
    await requisitionService.excluirRequisicao(db, R, USERS.ADMIN, 'e196i', null);
    assert.deepStrictEqual(await retrato(m), antes);
  });

  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})();
