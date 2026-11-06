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

  // ── RN-207.08: sorteio com invariantes (o fuzz da 196/197/206, modo G do revisor da 206) ────────────────────────────────────────
  // Semente fixa (mulberry32). Cada caso: material sem lote (70%) ou com lote + linhas sem lote por SQL (30%); linhas em 2-3 enderecos
  // + padrao as vezes; em 25% uma linha sem lote SEM endereco ou num endereco BLOQUEADO (Fase 2 I2); 0-1 guarda de outra requisicao;
  // 2-3 itens com guarda (60%) ou sem; 1a entrega aleatoria as vezes; depois uma entrega aleatoria (origem_automatica e origem planejada
  // as vezes). Espioes: `stockService.registrarMovimentacao` (cada SAIDA desta requisicao: da origem, fatia por lote, fatia sem lote com
  // endereco, ou a baixa sem endereco) e `db.all` (as duas leituras de `fatiasSemLoteParaOAutomatico`: guardas e linhas) — cada chamada da
  // regua abre um BLOCO. Invariantes depois de cada entrega ACEITA:
  //  T — tudo ou como hoje: bloco sem a leitura das linhas (sem guarda) = uma baixa sem endereco; bloco com a leitura = so fatias com
  //      endereco OU uma baixa sem endereco (o C492, nao cobriu), nunca misturado (Fase 2 I1);
  //  G — (entrega sem bloco "nao cobriu") toda guarda viva (endereco, lote — INCLUSIVE lote nulo) que cobria antes cobre depois;
  //  N — (idem) a proxima entrega de cada item com guarda, num clique, nao toma "nao serve mais";
  //  L — material sem guarda sem lote viva antes: nenhuma SAIDA sem lote COM endereco fora da origem planejada (B1397);
  //  F — fisico = soma das linhas.
  const stockService = require('../../services/almoxarifado/stockService');
  const C = await loc('GZ-C'); const X = await loc('GZ-X');
  await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id = ?', [X.id]);
  const SEMENTE = Number(process.env.SEMENTE207 || 207); const CASOS = 400;
  const sorteio = async () => {
    let seed = SEMENTE;
    const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const st = { casos: 0, medidos: 0, aceitos: 0, recusas: 0, comLote: 0, i2: 0, guardaSL: 0, L: 0, T: 0, cobriu: 0, semGuardaBloco: 0,
      explicitaAlem: 0, G_viol: 0, N_testes: 0, N_viol: 0, L_viol: 0, T_viol: 0, F_viol: 0, orfas: 0 };
    const ex = [];
    const PARTE = requisitionService.parteOrigemSql('ir');
    for (let caso = 0; caso < CASOS; caso++) {
      const cl = rnd() < 0.3 ? 1 : 0; if (cl) st.comLote++;
      const c = `S207-${caso}`;
      const m = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, 0, 0, ?)`, [c, c, cl, P.id])).lastID;
      const i2 = rnd() < 0.25; // Fase 2 I2: linha sem lote sem endereco ou em endereco bloqueado (e as boas pequenas: o livre usavel nao cobre)
      const qb = (a, b) => (i2 ? ri(2, 3) : ri(a, b));
      const ends = [A.id, B.id, C.id].sort(() => rnd() - 0.5).slice(0, ri(2, 3));
      if (rnd() < 0.4) ends.push(P.id);
      const ins = (l, lote, q) => dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade) VALUES (?,?,?,?)', [m, l, lote, q]);
      if (cl) {
        for (let k = 0; k < ri(1, 2); k++) {
          const lid = (await dbRun(db, "INSERT INTO lotes_almoxarifado (material_id, codigo, status) VALUES (?, ?, 'ATIVO')", [m, `L${k + 1}`])).lastID;
          for (const l of [...ends].sort(() => rnd() - 0.5).slice(0, ri(1, 2))) await ins(l, lid, ri(1, 4));
        }
        for (const l of [...ends].sort(() => rnd() - 0.5).slice(0, ri(1, 2))) await ins(l, null, qb(1, 4));
      } else for (const l of ends) await ins(l, null, qb(1, 5));
      if (i2) { st.i2++; if (rnd() < 0.7) await ins(null, null, ri(4, 8)); else await ins(X.id, null, ri(4, 8)); }
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = (SELECT COALESCE(SUM(quantidade),0) FROM estoque_saldo_almoxarifado WHERE material_id = ?) WHERE id = ?', [m, m]);
      const linhasBoas = async () => dbAll(db, `SELECT localizacao_id loc, lote_id lote, quantidade q FROM estoque_saldo_almoxarifado
        WHERE material_id = ? AND quantidade >= 1 AND localizacao_id IS NOT NULL AND localizacao_id <> ?`, [m, X.id]);
      const novaReq = async (qs) => {
        const R = (await dbRun(db, "INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status) VALUES (?, 1, 'S', 'APROVADO')",
          [`RS207-${caso}-${++seq}`])).lastID;
        const ids = [];
        for (const q of qs) ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
          quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m, q])).lastID);
        return { R, ids };
      };
      const sepGuarda = async (R, id, q, ln) => requisitionService.separarRequisicao(db, R, [{ item_id: id, quantidade_separada: q,
        localizacao_origem_id: ln.loc, lote_id: ln.lote || undefined }], { ...USERS.ADMIN });
      if (rnd() < 0.35 || i2) { const ln = pick(await linhasBoas()); if (ln) { const g = i2 ? 1 : ri(1, Math.floor(ln.q)); const o = await novaReq([g]);
        try { await sepGuarda(o.R, o.ids[0], g, ln); } catch (e) { /* teto: sem guarda */ } } }
      const { R, ids } = await novaReq(Array.from({ length: ri(2, 3) }, () => (i2 ? ri(3, 5) : ri(1, 5))));
      const comGuarda = rnd() < 0.4 || i2;
      for (const id of ids) {
        const it = await dbGet(db, 'SELECT quantidade_solicitada q FROM itens_requisicao_almoxarifado WHERE id = ?', [id]);
        const sq = i2 ? it.q : ri(1, it.q); const ln = pick(await linhasBoas());
        const gq = comGuarda && (rnd() < 0.7 || (i2 && id === ids[0])) && ln ? Math.min(sq, i2 ? 1 : Math.floor(ln.q)) : 0;
        try {
          if (gq > 0) await sepGuarda(R, id, gq, ln);
          if (sq - gq > 0 && (i2 || rnd() < 0.5)) await requisitionService.separarRequisicao(db, R, [{ item_id: id, quantidade_separada: sq - gq }], { ...USERS.ADMIN });
        } catch (e) { /* teto */ }
      }
      if (rnd() < 0.3 && !i2) { const its = await requisitionService.carregarItensRequisicao(db, R);
        const pl = its.map((i) => ({ item_id: i.id, quantidade_atendida: ri(0, Math.max(0, requisitionService.getSeparado(i) - requisitionService.getEntregue(i))) }));
        try { await requisitionService.entregarRequisicao(db, R, pl, { ...USERS.ADMIN }, null); } catch (e) { /* */ } }
      const reqSt = (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status;
      if (!['EM_SEPARACAO', 'PRONTA_RETIRADA', 'PARCIALMENTE_ATENDIDA', 'SEPARADA', 'PRONTO_RETIRADA'].includes(reqSt)) continue;
      st.casos++;
      const its = await requisitionService.carregarItensRequisicao(db, R);
      const payload = []; let explicitaAlem = false;
      for (const i of its) {
        const caixa = Math.max(0, requisitionService.getSeparado(i) - requisitionService.getEntregue(i)); if (caixa <= 0 && rnd() < 0.7) continue;
        if (i2 && i.origem_separacao_id && rnd() < 0.8) continue; // I2: a guarda fica viva para o automatico do irmao
        const q = i2 && rnd() < 0.7 ? Math.ceil(caixa) : ri(0, Math.ceil(caixa) + (rnd() < 0.2 ? 1 : 0)); if (q === 0) continue;
        const e = { item_id: i.id, quantidade_atendida: q }; const md = rnd();
        if (md < 0.2) e.origem_automatica = true;
        else if (md < 0.3 && i.origem_separacao_id) { e.localizacao_origem_id = i.origem_separacao_id; if (i.lote_separacao_id) e.lote_id = i.lote_separacao_id; }
        // a origem ESCOLHIDA alem da parte guardada do item tira do endereco o que o irmao guardou ali — escolha de quem entrega, na
        // passada 0 (que esta etapa nao toca): fora do G e do N (que medem o automatico)
        if (e.localizacao_origem_id && q > requisitionService.parteDaOrigem(i) + 1e-9) explicitaAlem = true;
        payload.push(e);
      }
      if (!payload.length) continue;
      st.medidos++;
      const guardas = async () => dbAll(db, `SELECT ir.id, ir.origem_separacao_id loc, ir.lote_separacao_id lote, ${PARTE} q
        FROM itens_requisicao_almoxarifado ir JOIN requisicoes_almoxarifado r ON r.id = ir.requisicao_id WHERE ir.material_id = ?
          AND ir.origem_separacao_id IS NOT NULL AND COALESCE(r.ativo, 1) = 1 AND r.status NOT IN ('CANCELADO', 'ENTREGUE', 'ENCERRADA', 'REJEITADO')`, [m]);
      const cobre = async () => {
        const gs = await guardas();
        const ls = await dbAll(db, 'SELECT localizacao_id loc, lote_id lote, SUM(quantidade) q FROM estoque_saldo_almoxarifado WHERE material_id = ? GROUP BY localizacao_id, lote_id', [m]);
        const v = new Map();
        for (const g of gs) { if (!(Number(g.q) > 1e-9)) continue; const k = `${g.loc}|${g.lote ?? ''}`; v.set(k, (v.get(k) || 0) + Number(g.q)); }
        const res = {};
        for (const [k, need] of v) { const [lc, lt] = k.split('|'); const have = ls.filter((x) => String(x.loc) === lc && String(x.lote ?? '') === lt)
          .reduce((s, x) => s + Number(x.q), 0); res[k] = { need, have }; }
        return res;
      };
      const antes = await cobre();
      const temGuardaSL = (await guardas()).some((g) => g.lote == null && Number(g.q) > 1e-9);
      const desde = (await dbGet(db, 'SELECT COALESCE(MAX(id), 0) x FROM movimentacoes_almoxarifado')).x;
      // espioes, so durante a entrega medida
      const ev = [];
      const origAll = db.all; const origReg = stockService.registrarMovimentacao;
      db.all = function (sql, ...rest) {
        if (typeof sql === 'string' && sql.includes('ir.lote_separacao_id IS NULL AND') && sql.includes('as loc_id') && rest[0] && rest[0][0] === m) ev.push('GQ');
        else if (typeof sql === 'string' && sql.includes('lc.id as lc_id') && rest[0] && rest[0][0] === m) ev.push('LQ');
        return origAll.call(this, sql, ...rest);
      };
      stockService.registrarMovimentacao = async (dbx, user, p, ...r) => {
        if (p && p.tipo === 'SAIDA' && Number(p.requisicao_id) === Number(R)) {
          ev.push(p.serie_ids ? 'SERIE' : ('codigo_lido_origem' in p) ? 'ORIGEM' : p.lote_id ? 'FLOTE' : p.localizacao_origem_id ? 'FSL' : 'FALLBACK');
        }
        return origReg(dbx, user, p, ...r);
      };
      let erro = null;
      try { await requisitionService.entregarRequisicao(db, R, payload, { ...USERS.ADMIN }, null); } catch (e) { erro = e; } finally {
        db.all = origAll; stockService.registrarMovimentacao = origReg;
      }
      if (erro) { st.recusas++; continue; }
      st.aceitos++;
      if (temGuardaSL) st.guardaSL++;
      // T: os blocos da regua
      const blocos = []; let cur = null;
      for (const e of ev) {
        if (e === 'GQ') { cur = { lq: false, calls: [] }; blocos.push(cur); continue; }
        if (e === 'LQ') { if (cur) cur.lq = true; continue; }
        if (e === 'FSL' || e === 'FALLBACK') { if (cur) cur.calls.push(e); else st.orfas++; continue; }
        cur = null;
      }
      let naoCobriu = false; let tviol = false;
      for (const b of blocos) {
        const nF = b.calls.filter((x) => x === 'FSL').length; const nB = b.calls.filter((x) => x === 'FALLBACK').length;
        if (!b.lq) { st.semGuardaBloco++; if (!(nB === 1 && nF === 0)) tviol = true; } else if (nB === 0 && nF >= 1) st.cobriu++;
        else if (nB === 1 && nF === 0) naoCobriu = true;
        else tviol = true;
      }
      if (naoCobriu) st.T++;
      if (tviol) { st.T_viol++; if (ex.length < 6) ex.push({ caso, k: 'T', ev }); }
      // L
      if (!temGuardaSL) {
        st.L++;
        const ruins = await dbAll(db, `SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND id > ? AND tipo = 'SAIDA'
          AND lote_id IS NULL AND localizacao_origem_id IS NOT NULL`, [m, desde]);
        if (ruins.length) { st.L_viol++; if (ex.length < 6) ex.push({ caso, k: 'L', ev }); }
      }
      // F
      const f = await dbGet(db, `SELECT (SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?) fis,
        (SELECT COALESCE(SUM(quantidade), 0) FROM estoque_saldo_almoxarifado WHERE material_id = ?) soma`, [m, m]);
      if (Math.abs(Number(f.fis) - Number(f.soma)) > 1e-9) { st.F_viol++; if (ex.length < 6) ex.push({ caso, k: 'F', f }); }
      if (naoCobriu) continue; // o C492: G e N nao valem (I1)
      if (explicitaAlem) { st.explicitaAlem++; continue; }
      // G
      const depois = await cobre();
      const vg = Object.entries(depois).filter(([k, x]) => x.have + 1e-9 < x.need && (!antes[k] || antes[k].have + 1e-9 >= antes[k].need));
      if (vg.length) { st.G_viol++; if (ex.length < 6) ex.push({ caso, k: 'G', payload, vg, ev }); }
      // N
      for (const i of await requisitionService.carregarItensRequisicao(db, R)) {
        if (!i.origem_separacao_id) continue;
        const q = requisitionService.parteDaOrigem(i);
        if (!(q > 1e-9)) continue;
        st.N_testes++;
        try { await requisitionService.entregarRequisicao(db, R, [{ item_id: i.id, quantidade_atendida: q }], { ...USERS.ADMIN }, null); } catch (e) {
          if (/não serve mais/.test(e.message)) { st.N_viol++; if (ex.length < 6) ex.push({ caso, k: 'N', item: i.id, lote: i.lote_separacao_id, msg: e.message.slice(0, 160) }); }
        }
      }
    }
    return { st, ex };
  };
  await test(`[RN-207.08, sorteio] ${CASOS} casos, semente ${SEMENTE}: T, G, N, L, F sem violacao; premissas (guarda sem lote >= 30, L >= 20, T >= 10)`, async () => {
    const { st, ex } = await sorteio();
    console.log(`    sorteio: ${JSON.stringify(st)}`);
    if (ex.length) console.log(`    exemplos: ${JSON.stringify(ex).slice(0, 1500)}`);
    assert.deepStrictEqual({ G: st.G_viol, N: st.N_viol, L: st.L_viol, T: st.T_viol, F: st.F_viol, orfas: st.orfas },
      { G: 0, N: 0, L: 0, T: 0, F: 0, orfas: 0 }, 'violacoes');
    assert.ok(st.guardaSL >= 30, `premissa: >= 30 entregas aceitas com guarda sem lote viva (${st.guardaSL})`);
    assert.ok(st.L >= 20, `premissa: >= 20 casos do L (${st.L})`);
    assert.ok(st.T >= 10, `premissa: >= 10 casos de T, o livre nao cobriu (${st.T})`);
    assert.ok(st.cobriu >= 10, `premissa: >= 10 blocos que cobriram com fatias (${st.cobriu})`);
  });

  void requisitionService;
  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
