/**
 * Etapa 268 (item 16, C498, B1410, B1634) — a parte separada SEM lote num material com controle de lote e o "Sai de" com lote.
 *
 * O C498 dizia que a parte separada de A sem lote era "qualquer lote em A" e que a entrega com Sai de (A, L1) a levava. A Fase 0 mediu o
 * contrario: a separacao com endereco e sem lote confere o par EXATO (a linha sem lote de A), e a saida por (A, L1) so baixa a linha de L1.
 * Sem codigo: este arquivo e a prova permanente (RN-268.01..04, pela rota e pelo servico).
 *
 * Montagem: material criado sem controle de lote, Entrada sem lote em A (a linha sem lote), controle de lote ligado, Entradas com lote.
 * Plano: docs/superpowers/plans/2026-11-26-almoxarifado-etapa268-sai-de-com-lote-e-limite-da-entrega.md
 *
 * Executar: cd server && node tests/api/saiDeComLoteParteSemLote.api.test.js
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
  ADMIN: { id: 1, nome: 'Adm 268', role: 'admin', is_superadmin: 1, email: 'a268@t.com' },
  ALMOX: { id: 26822, nome: 'Almox 268', role: 'user', email: 'x268@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 268: o "Sai de" com lote e a parte separada sem lote ===\n');

  const { app, db, close, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    post: (u, b = {}) => request(app).post(u).set('x-teste-usuario', k).send(b).then((x) => x),
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
    get: (u) => request(app).get(u).set('x-teste-usuario', k).then((x) => x),
  });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES ('aprovacao_automatica','0')
    ON CONFLICT(chave) DO UPDATE SET valor='0'`);

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM268', nome: 'Almox 268' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A = await loc('SL-A'); const B = await loc('SL-B'); const P = await loc('SL-P');

  const material = async ({ lote = true } = {}) => {
    const c = `E268-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, 0, 0, ?)`, [c, c, lote ? 1 : 0, P.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, destino, q, lote) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id,
    tipo: 'ENTRADA', quantidade: q, motivo: 'e268', localizacao_destino_id: destino, ...(lote ? { lote } : {}) }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  // A sem lote 3 (saldo de antes do controle de lote), A/L1 4, B/L1 5.
  const comLinhaSemLote = async () => {
    const m = await material({ lote: false });
    await entrar(m, A.id, 3);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 1 WHERE id = ?', [m.id]);
    await entrar(m, A.id, 4, 'L1'); await entrar(m, B.id, 5, 'L1');
    return { m, L1: await loteId(m, 'L1') };
  };
  const reqDireta = async (itens) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E268-${++seq}`])).lastID;
    const ids = [];
    for (const [m, q] of itens) {
      // eslint-disable-next-line no-await-in-loop
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
        quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m, q])).lastID);
    }
    return { R, ids };
  };
  const separar = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: linhas });
  const entregar = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: linhas });
  const deA = (id, q, extra = {}) => ({ item_id: id, quantidade_separada: q, localizacao_origem_id: A.id, ...extra });
  const semOrigem = (id, q) => ({ item_id: id, quantidade_separada: q });
  const saiDe = (id, q, onde, extra = {}) => ({ item_id: id, quantidade_atendida: q, localizacao_origem_id: onde.id, ...extra });
  const clique = (id, q) => ({ item_id: id, quantidade_atendida: q });
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
  const saidas = async (m) => (await dbAll(db, `SELECT l.codigo as loc, lt.codigo as lote, mv.quantidade q FROM movimentacoes_almoxarifado mv
      LEFT JOIN localizacoes_almoxarifado l ON l.id = mv.localizacao_origem_id LEFT JOIN lotes_almoxarifado lt ON lt.id = mv.lote_id
      WHERE mv.material_id = ? AND mv.tipo = 'SAIDA' ORDER BY mv.id`, [m.id])).map((x) => `${x.loc || '-'}/${x.lote || '-'}=${Number(x.q)}`);
  const item = (id) => dbGet(db, `SELECT origem_separacao_id o, lote_separacao_id l, quantidade_origem_separacao p
    FROM itens_requisicao_almoxarifado WHERE id = ?`, [id]);

  // ── RN-268.01: a separacao com endereco e sem lote confere a linha sem lote do endereco, nunca o endereco inteiro ──────────────
  await test('[RN-268.01] A so com lotes (L1 4, L2 2): separar 4 de A sem lote -> 400 fisica do par (A, sem lote) = 0, nada gravado', async () => {
    const m = await material();
    await entrar(m, A.id, 4, 'L1'); await entrar(m, A.id, 2, 'L2');
    const { R, ids } = await reqDireta([[m.id, 4]]);
    const r = await separar(R, [deA(ids[0], 4)]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `${m.nome}: O saldo em SL-A (0) não cobre a quantidade (4) — a saída tiraria de outros endereços`);
    const it = await item(ids[0]);
    assert.deepStrictEqual([it.o, it.l, it.p], [null, null, null], 'nada gravado no item');
    assert.strictEqual((await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status, 'APROVADO');
  });

  // ── RN-268.02: outra requisicao, pela rota ──────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-268.02 rota] R1 separou 3 de A sem lote; R2 entrega 4 Sai de (A, L1) -> 200 de A/L1; R1 num clique -> 200 da linha sem lote', async () => {
    const { m, L1 } = await comLinhaSemLote();
    const r1 = await reqDireta([[m.id, 3]]); const r2 = await reqDireta([[m.id, 4]]);
    await ok(separar(r1.R, [deA(r1.ids[0], 3)]));
    const it = await item(r1.ids[0]);
    assert.deepStrictEqual([Number(it.o), it.l, Number(it.p)], [A.id, null, 3], 'premissa: origem A, sem lote, parte 3');
    await ok(separar(r2.R, [semOrigem(r2.ids[0], 4)]));
    await ok(entregar(r2.R, [saiDe(r2.ids[0], 4, A, { lote_id: L1 })]));
    assert.deepStrictEqual(await retrato(m), { linhas: ['SL-A/-=3', 'SL-B/L1=5'], fisico: 8 }, 'a linha sem lote ficou inteira');
    await ok(entregar(r1.R, [clique(r1.ids[0], 3)]));
    assert.deepStrictEqual(await retrato(m), { linhas: ['SL-B/L1=5'], fisico: 5 });
    assert.deepStrictEqual(await saidas(m), ['SL-A/L1=4', 'SL-A/-=3']);
  });

  // ── RN-268.02 pelo servico ──────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-268.02 servico] o mesmo por separarRequisicao/entregarRequisicao', async () => {
    const { m, L1 } = await comLinhaSemLote();
    const ALMOX = { ...USERS.ALMOX };
    const r1 = await reqDireta([[m.id, 3]]); const r2 = await reqDireta([[m.id, 4]]);
    await requisitionService.separarRequisicao(db, r1.R, [deA(r1.ids[0], 3)], ALMOX);
    await requisitionService.separarRequisicao(db, r2.R, [semOrigem(r2.ids[0], 4)], ALMOX);
    await requisitionService.entregarRequisicao(db, r2.R, [saiDe(r2.ids[0], 4, A, { lote_id: L1 })], ALMOX, null);
    await requisitionService.entregarRequisicao(db, r1.R, [clique(r1.ids[0], 3)], ALMOX, null);
    assert.deepStrictEqual(await retrato(m), { linhas: ['SL-B/L1=5'], fisico: 5 });
    assert.deepStrictEqual(await saidas(m), ['SL-A/L1=4', 'SL-A/-=3']);
  });

  // ── RN-268.03: a mesma requisicao (B1410) ───────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-268.03] irmao separou 3 de A sem lote; o outro item entrega 4 Sai de (A, L1) -> 200; o irmao num clique -> 200', async () => {
    const { m, L1 } = await comLinhaSemLote();
    const { R, ids } = await reqDireta([[m.id, 3], [m.id, 4]]);
    await ok(separar(R, [deA(ids[0], 3)]));
    await ok(separar(R, [semOrigem(ids[1], 4)]));
    await ok(entregar(R, [saiDe(ids[1], 4, A, { lote_id: L1 })]));
    await ok(entregar(R, [clique(ids[0], 3)]));
    assert.deepStrictEqual(await retrato(m), { linhas: ['SL-B/L1=5'], fisico: 5 });
    assert.deepStrictEqual(await saidas(m), ['SL-A/L1=4', 'SL-A/-=3']);
  });

  // ── RN-268.03 juntos: as duas pecas na mesma entrega ────────────────────────────────────────────────────────────────────────────
  await test('[RN-268.03 juntos] as duas pecas na mesma entrega (o irmao pela planejada, o outro Sai de (A, L1)) -> 200', async () => {
    const { m, L1 } = await comLinhaSemLote();
    const { R, ids } = await reqDireta([[m.id, 3], [m.id, 4]]);
    await ok(separar(R, [deA(ids[0], 3)]));
    await ok(separar(R, [semOrigem(ids[1], 4)]));
    await ok(entregar(R, [clique(ids[0], 3), saiDe(ids[1], 4, A, { lote_id: L1 })]));
    assert.deepStrictEqual(await retrato(m), { linhas: ['SL-B/L1=5'], fisico: 5 });
  });

  // ── RN-268.04: o "Sai de" mostra a sobra no par exato ───────────────────────────────────────────────────────────────────────────
  await test('[RN-268.04] saldos?requisicao_id=R2: A sem lote separado_outras 3 sobra 0; A/L1 0 e 4; B/L1 0 e 5', async () => {
    const { m } = await comLinhaSemLote();
    const r1 = await reqDireta([[m.id, 3]]); const r2 = await reqDireta([[m.id, 4]]);
    await ok(separar(r1.R, [deA(r1.ids[0], 3)]));
    const r = await ok(como('ALMOX').get(`${API}/estoque/${m.id}/saldos?requisicao_id=${r2.R}`));
    const linhas = r.body.map((s) => `${s.localizacao_codigo}/${s.lote || '-'}:${s.quantidade}|${s.separado_outras}|${s.sobra}`).sort();
    assert.deepStrictEqual(linhas, ['SL-A/-:3|3|0', 'SL-A/L1:4|0|4', 'SL-B/L1:5|0|5']);
  });

  // ── RN-268.05 (Fase 2, achado 3): a origem guardada SEM lote e o Sai de com lote no mesmo endereco ───────────────────────────────
  // A Etapa 63 trata (A, sem lote) como "qualquer lote em A" para a troca: escolher (A, L1) nao era outro par, e a entrega so conferia o
  // fisico de (A, L1) — levava a guarda que R3 separou de (A, L1) (R1 200, A/L1 1; R3 depois "nao serve mais"). Agora a E1 do par escolhido.
  const cenario05 = async () => {
    const { m, L1 } = await comLinhaSemLote();
    const r1 = await reqDireta([[m.id, 3]]); const r3 = await reqDireta([[m.id, 2]]);
    await ok(separar(r1.R, [deA(r1.ids[0], 3)]));
    await ok(separar(r3.R, [deA(r3.ids[0], 2, { lote_id: L1 })]));
    return { m, L1, r1, r3 };
  };
  const fotoDe = async (m, R) => ({
    itens: await dbAll(db, `SELECT quantidade_entregue, origem_separacao_id, lote_separacao_id, quantidade_origem_separacao
      FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?`, [R]),
    saldo: await retrato(m),
    mov: Number((await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ?', [m.id])).n),
  });
  await test('[RN-268.05] R1 guardou 3 em (A, sem lote); R3 guardou 2 em (A, L1); R1 entrega 3 Sai de (A, L1) -> 400 E1, nada gravado', async () => {
    const { m, L1, r1, r3 } = await cenario05();
    const antes = await fotoDe(m, r1.R);
    const r = await entregar(r1.R, [saiDe(r1.ids[0], 3, A, { lote_id: L1 })]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    const num3 = (await dbGet(db, 'SELECT numero FROM requisicoes_almoxarifado WHERE id = ?', [r3.R])).numero;
    assert.strictEqual(r.body.error, `${m.nome}: em SL-A, lote L1 há 4 para esta entrega, mas 2 já está separado dali para outra requisição `
      + `(${num3}); sobra 2, que não cobre a quantidade (3). Escolha outro endereço ou deixe "Qualquer endereço (automático)"`);
    assert.deepStrictEqual(await fotoDe(m, r1.R), antes, 'nada gravado');
  });
  await test('[RN-268.05 depois] R1 entrega 2 Sai de (A, L1) -> 200; R3 num clique -> 200 (a guarda dele ficou); R1 o resto num clique -> 200', async () => {
    const { m, L1, r1, r3 } = await cenario05();
    await ok(entregar(r1.R, [saiDe(r1.ids[0], 2, A, { lote_id: L1 })]));
    await ok(entregar(r3.R, [clique(r3.ids[0], 2)]));
    await ok(entregar(r1.R, [clique(r1.ids[0], 1)]));
    assert.deepStrictEqual(await retrato(m), { linhas: ['SL-A/-=2', 'SL-B/L1=5'], fisico: 7 });
  });
  await test('[RN-268.05 servico] o mesmo pelo entregarRequisicao: 3 de (A, L1) recusado; a planejada (A, sem lote) num clique -> 200', async () => {
    const { m, L1, r1 } = await cenario05();
    const ALMOX = { ...USERS.ALMOX };
    await assert.rejects(requisitionService.entregarRequisicao(db, r1.R, [saiDe(r1.ids[0], 3, A, { lote_id: L1 })], ALMOX, null),
      (e) => e.status === 400 && /sobra 2, que não cobre a quantidade \(3\)/.test(e.message));
    await requisitionService.entregarRequisicao(db, r1.R, [clique(r1.ids[0], 3)], ALMOX, null);
    assert.deepStrictEqual(await retrato(m), { linhas: ['SL-A/L1=4', 'SL-B/L1=5'], fisico: 9 });
  });
  await test('[RN-268.05 sem guarda] sem a guarda de R3: R1 entrega 3 Sai de (A, L1) -> 200 (nenhuma recusa nova sem guarda que conte)', async () => {
    const { m, L1 } = await comLinhaSemLote();
    const r1 = await reqDireta([[m.id, 3]]);
    await ok(separar(r1.R, [deA(r1.ids[0], 3)]));
    await ok(entregar(r1.R, [saiDe(r1.ids[0], 3, A, { lote_id: L1 })]));
    assert.deepStrictEqual(await retrato(m), { linhas: ['SL-A/-=3', 'SL-A/L1=1', 'SL-B/L1=5'], fisico: 9 });
  });

  terminou = true;
  await close();
  console.log(`\n  ${passed} passou, ${failed} falhou\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
