/**
 * Etapa 207 — a entrega respeita a guarda SEM lote (o C490 da 206). A parte AUTOMATICA da entrega (passada 2) de material sem lote (ou o
 * resto sem lote de material com controle de lote) pula o que outra caixa deixou separado num endereco: sai por fatias com endereco, cada
 * uma com origem estrita (B1396). Sem guarda sem lote viva -> uma baixa so, sem endereco, como antes (B1397). O livre por endereco nao
 * cobre -> como antes, nunca recusa nova (B1398).
 *
 * Livro = [tipo, endereco, lote, quantidade] das SAIDAs/ENTRADAs da requisicao, na ordem do id. Retrato = linhas de saldo nao nulas.
 * Plano: docs/superpowers/plans/2026-11-06-almoxarifado-etapa207-entrega-respeita-guarda-sem-lote.md
 *
 * Executar: cd server && node tests/api/entregaGuardaSemLote.api.test.js
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
  ADMIN: { id: 1, nome: 'Adm 207', role: 'admin', is_superadmin: 1, email: 'a207@t.com' },
  ALMOX: { id: 20722, nome: 'Almox 207', role: 'user', email: 'x207@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const NAO_SERVE = /a origem da separação \(GZ-A\) não serve mais/;
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 207: a entrega respeita a guarda sem lote ===\n');

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
  await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES ('aprovacao_automatica','0')
    ON CONFLICT(chave) DO UPDATE SET valor='0'`);

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM207', nome: 'Almox 207' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A = await loc('GZ-A'); const B = await loc('GZ-B'); const P = await loc('GZ-P');

  const material = async ({ lote = false, serie = false } = {}) => {
    const c = `E207-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, ?, 0, ?)`, [c, c, lote ? 1 : 0, serie ? 1 : 0, P.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, destino, q, lote, extra = {}) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id,
    tipo: 'ENTRADA', quantidade: q, motivo: 'e207', localizacao_destino_id: destino, ...(lote ? { lote } : {}), ...extra }), 201);
  // linha sem lote gravada direto (estoque de antes do controle / legado sem endereco), com o fisico acertado pela soma
  const linhaSql = async (m, locId, q) => {
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade) VALUES (?,?,NULL,?)', [m.id, locId, q]);
    await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_atual = (SELECT COALESCE(SUM(quantidade), 0) FROM estoque_saldo_almoxarifado
      WHERE material_id = ?) WHERE id = ?`, [m.id, m.id]);
  };
  const reqDireta = async (itens) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E207-${++seq}`])).lastID;
    const ids = [];
    for (const [m, q] of itens) {
      // eslint-disable-next-line no-await-in-loop
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
        quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m, q])).lastID);
    }
    return { R, ids };
  };
  const separar = (R, linhas) => ok(como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: linhas }));
  const entregar = (R, linhas, st = 200) => ok(como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: linhas }), st);
  const retrato = async (m) => {
    const linhas = await dbAll(db, `SELECT l.codigo as loc, lt.codigo as lote, s.quantidade q FROM estoque_saldo_almoxarifado s
        LEFT JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id LEFT JOIN lotes_almoxarifado lt ON lt.id = s.lote_id
        WHERE s.material_id = ? ORDER BY l.codigo, lt.codigo`, [m.id]);
    const fis = await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    return {
      linhas: linhas.filter((x) => Math.abs(Number(x.q)) > 1e-9).map((x) => `${x.loc || '-'}/${x.lote || '-'}=${Number(x.q)}`),
      fisico: Number(fis.q),
    };
  };
  const livro = async (R, m) => (await dbAll(db, `SELECT mv.tipo, l.codigo as loc, lt.codigo as lote, mv.quantidade q
      FROM movimentacoes_almoxarifado mv LEFT JOIN localizacoes_almoxarifado l ON l.id = COALESCE(mv.localizacao_origem_id, mv.localizacao_destino_id)
      LEFT JOIN lotes_almoxarifado lt ON lt.id = mv.lote_id
      WHERE mv.requisicao_id = ? AND mv.material_id = ? AND mv.tipo IN ('SAIDA', 'ENTRADA', 'ENTRADA_DEVOLUCAO') ORDER BY mv.id`, [R, m.id]))
    .map((x) => [x.tipo, x.loc || null, x.lote || null, Number(x.q)]);

  // ── RN-207.01: o C490 — a entrega do item 1 pula a guarda do irmao ──────────────────────────────────────────────────────────────
  // A 3, B 2 (padrao P vazia); item 1 (3) separado sem origem, item 2 (2) separado de A.
  const cenario01 = async () => {
    const m = await material();
    await entrar(m, A.id, 3); await entrar(m, B.id, 2);
    const { R, ids } = await reqDireta([[m.id, 3], [m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['GZ-A/-=3', 'GZ-B/-=2'], fisico: 5 }, 'premissa');
    return { m, R, ids };
  };
  await test('[RN-207.01] item 1 (3) sem origem sai A 1 + B 2 (fatias com endereco); o item 2 (2) depois sai de A num clique', async () => {
    const { m, R, ids } = await cenario01();
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'GZ-A', null, 1], ['SAIDA', 'GZ-B', null, 2]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['GZ-A/-=2'], fisico: 2 });
    await entregar(R, [{ item_id: ids[1], quantidade_atendida: 2 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'GZ-A', null, 1], ['SAIDA', 'GZ-B', null, 2], ['SAIDA', 'GZ-A', null, 2]]);
    assert.deepStrictEqual(await retrato(m), { linhas: [], fisico: 0 });
  });

  // ── RN-207.02: sem guarda sem lote, nada muda (B1397) ───────────────────────────────────────────────────────────────────────────
  await test('[RN-207.02 a] sem guarda: A 3, B 2, um item de 3 sem origem -> uma SAIDA sem endereco (o claim de hoje), A 0, B 2', async () => {
    const m = await material();
    await entrar(m, A.id, 3); await entrar(m, B.id, 2);
    const { R, ids } = await reqDireta([[m.id, 3]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, null, 3]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['GZ-B/-=2'], fisico: 2 });
  });
  await test('[RN-207.02 c] item COM serie no material sem lote, guarda sem lote do irmao em A -> o livro de hoje (B1404: uma SAIDA sem endereco)', async () => {
    const m = await material({ serie: true });
    await entrar(m, A.id, 3, null, { series: [`S${seq}A1`, `S${seq}A2`, `S${seq}A3`] });
    await entrar(m, B.id, 2, null, { series: [`S${seq}B1`, `S${seq}B2`] });
    const { R, ids } = await reqDireta([[m.id, 1], [m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 1 }]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    const s = await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND localizacao_id = ? ORDER BY id', [m.id, B.id]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 1, serie_ids: [s[0].id] }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, null, 1]]);
  });
  await test('[RN-207.02 d] a V1 da 136: A 3, B 2, item 1 (3) sem origem + item 2 (2) de A NA MESMA entrega -> o livro de hoje (a guarda que fica e 0)', async () => {
    const { m, R, ids } = await cenario01();
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }, { item_id: ids[1], quantidade_atendida: 2 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'GZ-A', null, 2], ['SAIDA', null, null, 3]]);
    assert.deepStrictEqual(await retrato(m), { linhas: [], fisico: 0 });
  });

  // ── RN-207.03: material COM controle de lote, guarda numa linha sem lote (B1400) ────────────────────────────────────────────────
  await test('[RN-207.03] com lote: L1 1 em A + sem lote A 2 e B 2; item 2 guarda (A, sem lote) 2; item 1 (3) -> L1 1 + B 2; item 2 sai de A', async () => {
    const m = await material({ lote: true });
    await entrar(m, A.id, 1, 'L1');
    await linhaSql(m, A.id, 2); await linhaSql(m, B.id, 2);
    const { R, ids } = await reqDireta([[m.id, 3], [m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    const it2 = await dbGet(db, 'SELECT origem_separacao_id o, lote_separacao_id l FROM itens_requisicao_almoxarifado WHERE id = ?', [ids[1]]);
    assert.deepStrictEqual([it2.o, it2.l], [A.id, null], 'premissa: guarda em (A, sem lote)');
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, 'L1', 1], ['SAIDA', 'GZ-B', null, 2]]);
    await entregar(R, [{ item_id: ids[1], quantidade_atendida: 2 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, 'L1', 1], ['SAIDA', 'GZ-B', null, 2], ['SAIDA', 'GZ-A', null, 2]]);
    assert.deepStrictEqual(await retrato(m), { linhas: [], fisico: 0 });
  });

  // ── RN-207.04: a guarda de outra requisicao (B1399) ─────────────────────────────────────────────────────────────────────────────
  await test('[RN-207.04] R1 guarda 2 em A; R2 (3) sem origem -> A 1 + B 2; R1 entrega 2 de A', async () => {
    const m = await material();
    await entrar(m, A.id, 3); await entrar(m, B.id, 2);
    const r1 = await reqDireta([[m.id, 2]]); const r2 = await reqDireta([[m.id, 3]]);
    await separar(r1.R, [{ item_id: r1.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    await separar(r2.R, [{ item_id: r2.ids[0], quantidade_separada: 3 }]);
    await entregar(r2.R, [{ item_id: r2.ids[0], quantidade_atendida: 3 }]);
    assert.deepStrictEqual(await livro(r2.R, m), [['SAIDA', 'GZ-A', null, 1], ['SAIDA', 'GZ-B', null, 2]]);
    await entregar(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 2 }]);
    assert.deepStrictEqual(await livro(r1.R, m), [['SAIDA', 'GZ-A', null, 2]]);
    assert.deepStrictEqual(await retrato(m), { linhas: [], fisico: 0 });
  });

  // ── RN-207.05: o livre por endereco nao cobre -> como hoje (B1398, o C492 visivel) ──────────────────────────────────────────────
  await test('[RN-207.05 a] A 3 (guarda 2) + linha SEM endereco 2: livre usavel 1 < 3 -> uma SAIDA sem endereco (hoje); A 0 e o item 2 recusa (C492)', async () => {
    const m = await material();
    await entrar(m, A.id, 3); await linhaSql(m, null, 2);
    const { R, ids } = await reqDireta([[m.id, 3], [m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, null, 3]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['-/-=2'], fisico: 2 });
    const r = await entregar(R, [{ item_id: ids[1], quantidade_atendida: 2 }], 400);
    assert.match(r.body.error || r.body.message || JSON.stringify(r.body), NAO_SERVE);
  });
  await test('[RN-207.05 b] A 3 (guarda 2) + B 2 BLOQUEADA: livre usavel 1 < 3 -> uma SAIDA sem endereco (hoje), 200', async () => {
    const m = await material();
    await entrar(m, A.id, 3); await entrar(m, B.id, 2);
    const { R, ids } = await reqDireta([[m.id, 3], [m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id = ?', [B.id]);
    try {
      await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]);
    } finally { await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 0 WHERE id = ?', [B.id]); }
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, null, 3]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['GZ-B/-=2'], fisico: 2 });
  });

  // ── RN-207.07: a guarda que fica desta entrega (a B1394, sem lote) ──────────────────────────────────────────────────────────────
  await test('[RN-207.07] A 5, B 1; item 1 guarda 3 em A, item 2 (3) sem origem; entrega item 1 2 + item 2 3 -> A 2, A 2, B 1; item 1 depois sai 1 de A', async () => {
    const m = await material();
    await entrar(m, A.id, 5); await entrar(m, B.id, 1);
    const { R, ids } = await reqDireta([[m.id, 3], [m.id, 3]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: 3 }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }, { item_id: ids[1], quantidade_atendida: 3 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'GZ-A', null, 2], ['SAIDA', 'GZ-A', null, 2], ['SAIDA', 'GZ-B', null, 1]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['GZ-A/-=1'], fisico: 1 });
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 1 }]);
    assert.deepStrictEqual((await livro(R, m)).slice(3), [['SAIDA', 'GZ-A', null, 1]]);
    assert.deepStrictEqual(await retrato(m), { linhas: [], fisico: 0 });
  });

  // ── RN-207.06: o livro e o desfazer (B1402, Achado 1) ───────────────────────────────────────────────────────────────────────────
  const excluir = (R) => ok(como('ADMIN').del(`${API}/requisicoes/${R}`, { justificativa: 'e207' }));
  await test('[RN-207.06] depois da 1a entrega da RN-207.01, excluir pela rota: cada ENTRADA volta ao endereco da SAIDA (A 3, B 2, P 0)', async () => {
    const { m, R, ids } = await cenario01();
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]);
    await excluir(R);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'GZ-A', null, 1], ['SAIDA', 'GZ-B', null, 2],
      ['ENTRADA', 'GZ-A', null, 1], ['ENTRADA', 'GZ-B', null, 2]]);
    const destinos = await dbAll(db, `SELECT localizacao_destino_id d FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND material_id = ?
      AND tipo = 'ENTRADA' ORDER BY id`, [R, m.id]);
    assert.deepStrictEqual(destinos.map((x) => x.d), [A.id, B.id]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['GZ-A/-=3', 'GZ-B/-=2'], fisico: 5 });
  });
  await test('[RN-207.06 controle] a SAIDA sem endereco da RN-207.02 a: a exclusao devolve para a padrao P (o teste distingue)', async () => {
    const m = await material();
    await entrar(m, A.id, 3); await entrar(m, B.id, 2);
    const { R, ids } = await reqDireta([[m.id, 3]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]);
    await excluir(R);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, null, 3], ['ENTRADA', null, null, 3]], 'a ENTRADA sem endereco no livro: o motor credita na padrao');
    assert.deepStrictEqual(await retrato(m), { linhas: ['GZ-B/-=2', 'GZ-P/-=3'], fisico: 5 });
  });

  void requisitionService;
  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
