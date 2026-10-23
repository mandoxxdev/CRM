/**
 * Etapa 188 (T4) — integracao da sugestao de coleta pela rota e pelo servico: cadastro -> entrada com lote -> criar e aprovar
 * pela rota -> GET /fila-separacao -> separar do par sugerido -> a fila de novo. E a dica velha (a porta continua decidindo), a
 * emenda C1 pela porta real (a planejada pendente nao vira "troque de endereco") e a B821 pela integracao.
 *
 * Usuarios reais por header (molde da 127): S sem perfil cria pela rota; ADMIN superadmin aprova e da entrada; ALMOX separa.
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa188-sugestao-de-coleta-na-fila-de-separacao.md
 *
 * Executar: cd server && node tests/api/filaSugestaoColetaIntegracao.api.test.js
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
  ADMIN: { id: 1, nome: 'Adm 188', role: 'admin', is_superadmin: 1, email: 'a188@t.com' },
  S: { id: 18811, nome: 'Solic 188', role: 'user', email: 's188@t.com' },
  ALMOX: { id: 18812, nome: 'Almox 188', role: 'user', email: 'x188@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 188 (T4): integracao da sugestao de coleta ===\n');
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

  // Cadastro pela rota: ALM188 com ZA-01 (pai) > ZA-03 (filha), ZB-01 e ZP-01.
  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM188', nome: 'Almox 188' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const almId = alm.body.id;
  const loc = async (codigo, parent = null) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: almId, parent_id: parent,
      tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    const row = await dbGet(db, 'SELECT id, codigo, parent_id, almoxarifado_id FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
    assert.ok(row, `localizacao ${codigo} gravada`);
    return row;
  };
  const A01 = await loc('ZA-01');
  const A03 = await loc('ZA-03', A01.id);
  const B01 = await loc('ZB-01');
  const P01 = await loc('ZP-01');
  assert.strictEqual(Number(A03.parent_id), Number(A01.id), 'premissa: ZA-03 filha de ZA-01');
  assert.strictEqual(Number(A03.almoxarifado_id), Number(almId), 'premissa: no ALM188');

  const material = async ({ lote = false } = {}) => {
    const c = `E188I-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, material_critico, custo_unitario, controle_lote) VALUES (?, ?, 'PC', 0, 0, 1, 0, 0.1, ?)`, [c, c, lote ? 1 : 0])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, destino, q, lote) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e188',
      localizacao_destino_id: destino, ...(lote ? { lote } : {}) });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  // A validade e gravada direto no lote. Este comentario dizia "a entrada manual nao grava a validade do lote" — era verdade na
  // Etapa 188 e deixou de ser na 190 (C450: a Entrada grava `data_validade`). O UPDATE direto continua certo aqui: o cenario mede a
  // fila, nao a Entrada, e precisa de validades em lotes que ja existem.
  const validade = (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE material_id = ? AND codigo = ?',
    [data, m.id, codigo]);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const req = async (itens) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-188',
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
  const separar = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: linhas });
  const filaRota = async () => {
    const r = await como('ALMOX').get(`${API}/fila-separacao`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const daFila = async (R) => {
    const f = (await filaRota()).find((x) => x.id === R);
    assert.ok(f, `requisicao ${R} na fila`);
    return f;
  };

  // ── Pela rota: o fluxo inteiro ───────────────────────────────────────────────────────────────────────────────────────────
  const m1 = await material({ lote: true });
  await entrar(m1, B01.id, 6, 'L1');
  await entrar(m1, A03.id, 9, 'L2');
  await validade(m1, 'L1', '2026-11-10'); await validade(m1, 'L2', '2026-12-20');
  const L1 = await loteId(m1, 'L1'); const L2 = await loteId(m1, 'L2');
  const r1 = await req([[m1.id, 5]]);
  await aprovar(r1.R);
  let filaR1 = null;

  await test('[T4 rota] fila -> pegar_em ZB-01/L1 5 cobre; separar do sugerido -> 200 e a planejada; a fila de novo -> ENTREGAR sem pegar_em', async () => {
    filaR1 = await daFila(r1.R);
    const it = filaR1.itens[0];
    assert.strictEqual(it.separavel, 5);
    assert.deepStrictEqual(it.pegar_em, {
      localizacao_id: B01.id, localizacao_codigo: 'ZB-01', caminho: 'ALM188 / ZB-01', lote_id: L1, lote_codigo: 'L1',
      lote_validade: '2026-11-10', quantidade_no_endereco: 6, quantidade_sugerida: 5, cobre: true,
    });
    assert.strictEqual(it.pegar_em_aviso, null);
    const s = await separar(r1.R, [{ item_id: it.item_id, quantidade_separada: it.pegar_em.quantidade_sugerida,
      localizacao_origem_id: it.pegar_em.localizacao_id, lote_id: it.pegar_em.lote_id }]);
    assert.strictEqual(s.status, 200, JSON.stringify(s.body));
    const row = await dbGet(db, 'SELECT origem_separacao_id, lote_separacao_id FROM itens_requisicao_almoxarifado WHERE id = ?', [it.item_id]);
    assert.deepStrictEqual([Number(row.origem_separacao_id), Number(row.lote_separacao_id)], [B01.id, L1]);
    const depois = await daFila(r1.R);
    assert.ok(depois.etapas.includes('ENTREGAR'), JSON.stringify(depois.etapas));
    assert.strictEqual(depois.itens[0].origem_separacao_codigo, 'ZB-01');
    assert.strictEqual(depois.itens[0].separavel, 0);
    assert.deepStrictEqual([depois.itens[0].pegar_em, depois.itens[0].pegar_em_aviso], [null, null]);
    assert.deepStrictEqual(depois.ordem_coleta, []);
  });

  await test('[T4 rota, RN-188.03] a segunda requisicao do mesmo material ve ZB-01/L1 com livre 1 (6 - 5 planejados) e recebe ZA-03/L2 5', async () => {
    const r2 = await req([[m1.id, 5]]);
    await aprovar(r2.R);
    const it = (await daFila(r2.R)).itens[0];
    assert.strictEqual(it.separavel, 5, 'premissa');
    assert.strictEqual(it.pegar_em.localizacao_codigo, 'ZA-03');
    assert.strictEqual(it.pegar_em.lote_codigo, 'L2');
    assert.strictEqual(it.pegar_em.caminho, 'ALM188 / ZA-01 / ZA-03');
    assert.strictEqual(it.pegar_em.quantidade_sugerida, 5);
    assert.strictEqual(it.pegar_em.cobre, true);
  });

  await test('[T4 servico] listarFilaSeparacao direto da o mesmo pegar_em e a mesma ordem_coleta que a rota', async () => {
    // Uma requisicao com duas paradas (ZB-01 pedida antes de ZA-01): a ordem_coleta inverte o pedido.
    const mb = await material(); const ma = await material();
    await entrar(mb, B01.id, 3); await entrar(ma, A01.id, 3);
    const r3 = await req([[mb.id, 2], [ma.id, 2]]);
    await aprovar(r3.R);
    const doServico = (await requisitionService.listarFilaSeparacao(db, USERS.ALMOX)).find((x) => x.id === r3.R);
    assert.deepStrictEqual(doServico.ordem_coleta.map((p) => p.item_id), [r3.ids[1], r3.ids[0]], 'premissa: duas paradas (pelo servico)');
    const pelaRota = (await filaRota()).map((f) => [f.id, f.itens.map((i) => [i.item_id, i.pegar_em, i.pegar_em_aviso]), f.ordem_coleta]);
    const peloServico = (await requisitionService.listarFilaSeparacao(db, USERS.ALMOX))
      .map((f) => [f.id, f.itens.map((i) => [i.item_id, i.pegar_em, i.pegar_em_aviso]), f.ordem_coleta]);
    assert.ok(pelaRota.some(([, itens]) => itens.some(([, p]) => p)), 'premissa: ha pegar_em na fila');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(peloServico)), pelaRota);
    // E o primeiro cenario, antes de separar, ja tinha vindo pela rota com o mesmo formato do servico.
    assert.ok(filaR1 && filaR1.itens[0].pegar_em, 'premissa: o cenario da rota rodou');
  });

  // ── Pela rota: a dica velha ──────────────────────────────────────────────────────────────────────────────────────────────
  await test('[T4 rota, RN-188.07] dica velha: saida avulsa tira 4 de ZB-01 depois de listar; separar 5 do sugerido -> 400 da porta; listar -> ZA-03', async () => {
    const m = await material({ lote: true });
    await entrar(m, B01.id, 6, 'V1');
    await entrar(m, A03.id, 9, 'V2');
    await validade(m, 'V1', '2026-11-10'); await validade(m, 'V2', '2026-12-20');
    const V1 = await loteId(m, 'V1');
    const r = await req([[m.id, 5]]);
    await aprovar(r.R);
    const it = (await daFila(r.R)).itens[0];
    assert.deepStrictEqual([it.pegar_em.localizacao_codigo, it.pegar_em.lote_id, it.pegar_em.quantidade_sugerida], ['ZB-01', V1, 5]);
    const saida = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'SAIDA', quantidade: 4, motivo: 'e188 velha', justificativa: 'e188 dica velha',
      localizacao_origem_id: B01.id, lote: 'V1' });
    assert.strictEqual(saida.status, 201, `saida: ${JSON.stringify(saida.body)}`);
    const s = await separar(r.R, [{ item_id: it.item_id, quantidade_separada: 5, localizacao_origem_id: B01.id, lote_id: V1 }]);
    assert.strictEqual(s.status, 400, JSON.stringify(s.body));
    assert.strictEqual(s.body.error, `${m.nome}: O saldo em ZB-01 (2) não cobre a quantidade (5) — a saída tiraria de outros endereços`);
    const de = (await daFila(r.R)).itens[0];
    assert.strictEqual(de.pegar_em.localizacao_codigo, 'ZA-03');
    assert.strictEqual(de.pegar_em.lote_codigo, 'V2');
  });

  // ── Emenda C1 pela porta real (a sonda f2r188-sonda1) ────────────────────────────────────────────────────────────────────
  await test('[T4 rota, C1] separou 3 de ZA-01; a fila -> pegar_em ZA-01 (1) com PLANEJADA_NAO_COBRE, nunca a padrao; listar nao grava troca; seguir a dica nao gera troca', async () => {
    const m = await material();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET localizacao_padrao_id = ? WHERE id = ?', [P01.id, m.id]);
    await entrar(m, P01.id, 20); await entrar(m, A01.id, 4); await entrar(m, B01.id, 10);
    const r = await req([[m.id, 6]]);
    await aprovar(r.R);
    const s1 = await separar(r.R, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A01.id }]);
    assert.strictEqual(s1.status, 200, JSON.stringify(s1.body));
    const trocas = async () => Number((await dbGet(db, 'SELECT COUNT(*) as n FROM substituicoes_origem_requisicao WHERE requisicao_id = ?',
      [r.R])).n);
    const trocasAntes = await trocas();
    const it = (await daFila(r.R)).itens[0];
    assert.strictEqual(it.separavel, 3, 'premissa');
    assert.strictEqual(it.origem_separacao_codigo, 'ZA-01');
    assert.strictEqual(it.pegar_em_aviso, 'PLANEJADA_NAO_COBRE');
    assert.strictEqual(it.pegar_em.localizacao_codigo, 'ZA-01', 'a dica nunca e outro par (a padrao ZP-01 cobriria)');
    assert.deepStrictEqual([it.pegar_em.quantidade_no_endereco, it.pegar_em.quantidade_sugerida, it.pegar_em.cobre], [1, 1, false]);
    await filaRota();
    assert.strictEqual(await trocas(), trocasAntes, 'listar nao grava substituicao');
    const s2 = await separar(r.R, [{ item_id: r.ids[0], quantidade_separada: it.pegar_em.quantidade_sugerida,
      localizacao_origem_id: it.pegar_em.localizacao_id }]);
    assert.strictEqual(s2.status, 200, JSON.stringify(s2.body));
    assert.strictEqual(await trocas(), trocasAntes, 'seguir a dica (o mesmo par) nao gera troca');
    const row = await dbGet(db, 'SELECT origem_separacao_id, quantidade_separada FROM itens_requisicao_almoxarifado WHERE id = ?', [r.ids[0]]);
    assert.deepStrictEqual([Number(row.origem_separacao_id), Number(row.quantidade_separada)], [A01.id, 4]);
    const fim = (await daFila(r.R)).itens[0];
    assert.deepStrictEqual([fim.separavel, fim.pegar_em, fim.pegar_em_aviso], [2, null, 'PLANEJADA_NAO_COBRE']);
  });

  // ── B821 pela integracao ─────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[T4 B821] dois itens de 4 com 4 livres -> separavel 4 e 0 na ordem do pedido; separar 4+0 do sugerido -> 200', async () => {
    const m = await material();
    const r = await req([[m.id, 4], [m.id, 4]]);
    await aprovar(r.R);
    await entrar(m, B01.id, 4);
    const f = await daFila(r.R);
    assert.deepStrictEqual(f.itens.map((i) => i.item_id), r.ids);
    assert.deepStrictEqual(f.itens.map((i) => i.separavel), [4, 0]);
    assert.strictEqual(f.itens[0].pegar_em.localizacao_codigo, 'ZB-01');
    assert.strictEqual(f.itens[1].pegar_em, null);
    const s = await separar(r.R, [{ item_id: r.ids[0], quantidade_separada: f.itens[0].pegar_em.quantidade_sugerida,
      localizacao_origem_id: f.itens[0].pegar_em.localizacao_id }, { item_id: r.ids[1], quantidade_separada: 0 }]);
    assert.strictEqual(s.status, 200, JSON.stringify(s.body));
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
