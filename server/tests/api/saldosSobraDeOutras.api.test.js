/**
 * Etapa 201 (T2/T4) — o "Sai de" mostra o que sobra depois do separado para outras requisicoes (C469).
 * `GET /api/almoxarifado/estoque/:materialId/saldos[?requisicao_id=N]` ganha, por linha, `separado_outras` (a PARTE guardada das
 * caixas vivas de OUTRAS requisicoes no par endereco+lote da linha — a regua da C1/E1) e `sobra` = max(0, quantidade - separado_outras).
 * A funcao do extrato (`consultarSaldosPorLocalizacao`) nao muda (RN-201.05).
 *
 * Todo cenario que separa tem estoque em OUTRO endereco (XP-01, L2 9 — licao da Fase 2 da 198): sem ele o teto do item bate antes.
 * Plano: docs/superpowers/plans/2026-11-05-almoxarifado-etapa201-sai-de-mostra-o-que-sobra.md
 *
 * Executar: cd server && node tests/api/saldosSobraDeOutras.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const diaLocal = require('../../services/diaLocal');

const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 201', role: 'admin', is_superadmin: 1, email: 'a201@t.com' },
  S: { id: 20121, nome: 'Solic 201', role: 'user', email: 's201@t.com' },
  ALMOX: { id: 20122, nome: 'Almox 201', role: 'user', email: 'x201@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 201: saldos com o separado de outras e a sobra ===\n');
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
  const ALMOX = { ...USERS.ALMOX };

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM201', nome: 'Almox 201' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const B01 = await loc('XB-01'); const P01 = await loc('XP-01');

  const material = async ({ lote = 1 } = {}) => {
    const c = `E201-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, localizacao_padrao_id) VALUES (?, ?, 'PC', 0, 0, 1, 0, 0.1, ?, ?)`,
    [c, c, lote, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, destino, q, lote) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e201',
      localizacao_destino_id: destino, lote });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const validade = (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE material_id = ? AND codigo = ?',
    [data, m.id, codigo]);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const req = async (itens) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-201',
      itens: itens.map(([mid, q]) => ({ material_id: mid, quantidade: q })),
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    const ap = await como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/aprovar`, {});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    return { R: cr.body.id, ids };
  };
  const separacao = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: linhas });
  const sepOk = async (R, linhas) => { const r = await separacao(R, linhas); assert.strictEqual(r.status, 200, JSON.stringify(r.body)); };
  const numero = async (R) => (await dbGet(db, 'SELECT numero FROM requisicoes_almoxarifado WHERE id = ?', [R])).numero;
  const saldos = async (m, q = '') => {
    const r = await como('ALMOX').get(`${API}/estoque/${m.id}/saldos${q}`);
    assert.strictEqual(r.status, 200, `saldos ${q}: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const linha = (rows, locId, lid) => {
    const l = rows.find((s) => Number(s.localizacao_id) === Number(locId) && (s.lote_id == null ? null : Number(s.lote_id)) === lid);
    assert.ok(l, `linha ${locId}/${lid} na resposta: ${JSON.stringify(rows)}`);
    return l;
  };
  const par = (rows, locId, lid) => { const l = linha(rows, locId, lid); return [l.quantidade, l.separado_outras, l.sobra]; };
  // A caixa de um item escrita a mao (cenarios legados e de regua): separado, entregue, par e parte.
  const caixa = (itemId, { sep, ent = 0, origem, lote, parte }) => dbRun(db, `UPDATE itens_requisicao_almoxarifado SET quantidade_separada = ?,
      quantidade_entregue = ?, origem_separacao_id = ?, lote_separacao_id = ?, quantidade_origem_separacao = ? WHERE id = ?`,
  [sep, ent, origem, lote, parte, itemId]);

  // L1 6 em XB-01 (vence antes), L2 9 na padrao XP-01 (o outro endereco).
  const cenario = async ({ l1 = 6 } = {}) => {
    const m = await material();
    await entrar(m, B01.id, l1, 'L1'); await entrar(m, P01.id, 9, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    return { m, L1: await loteId(m, 'L1'), L2: await loteId(m, 'L2') };
  };
  const doPar = (item, q, L1) => ({ item_id: item, quantidade_separada: q, localizacao_origem_id: B01.id, lote_id: L1 });
  // A prova de equivalencia (RN-201.03): para cada linha com endereco, a rota (com o mesmo requisicao_id) == parteGuardadaDeOutras(...).q,
  // e o mapa agrupado do servico == a mesma.
  const equivalente = async (m, rows, R) => {
    const mapa = await requisitionService.parteGuardadaDeOutrasPorPar(db, m.id, R);
    for (const l of rows.filter((s) => s.localizacao_id != null)) {
      const um = await requisitionService.parteGuardadaDeOutras(db, m.id, l.localizacao_id, l.lote_id, R);
      assert.strictEqual(l.separado_outras, um.q, `rota x parteGuardadaDeOutras em ${l.localizacao_id}/${l.lote_id} (R ${R})`);
      assert.strictEqual(mapa.get(`${l.localizacao_id}|${l.lote_id ?? ''}`) || 0, um.q, `PorPar x parteGuardadaDeOutras (R ${R})`);
    }
  };

  // ---------------------------------------------------------------- RN-201.01
  await test('[RN-201.01] R1 separou 4 de XB-01/L1 (6): a linha diz separado_outras 4, sobra 2; XP-01/L2 sem separado -> 0 e sobra 9', async () => {
    const { m, L1, L2 } = await cenario();
    const r1 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    const rows = await saldos(m);
    assert.deepStrictEqual(par(rows, B01.id, L1), [6, 4, 2]);
    assert.deepStrictEqual(par(rows, P01.id, L2), [9, 0, 9]);
  });

  // ---------------------------------------------------------------- RN-201.02
  await test('[RN-201.02] a propria nao conta: ?requisicao_id=R1 -> 0; =R2 -> 4; sem parametro -> 4', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    assert.deepStrictEqual(par(await saldos(m, `?requisicao_id=${r1.R}`), B01.id, L1), [6, 0, 6]);
    assert.deepStrictEqual(par(await saldos(m, `?requisicao_id=${r2.R}`), B01.id, L1), [6, 4, 2]);
    assert.deepStrictEqual(par(await saldos(m), B01.id, L1), [6, 4, 2]);
    await equivalente(m, await saldos(m, `?requisicao_id=${r1.R}`), r1.R);
    await equivalente(m, await saldos(m, `?requisicao_id=${r2.R}`), r2.R);
  });

  // ---------------------------------------------------------------- RN-201.03
  await test('[RN-201.03 excluida] R1 separou 4 e foi excluida (DELETE) -> 0', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    assert.deepStrictEqual(par(await saldos(m, `?requisicao_id=${r2.R}`), B01.id, L1), [6, 4, 2], 'premissa: contava antes');
    const d = await como('ADMIN').del(`${API}/requisicoes/${r1.R}`, { justificativa: 'exclusao 201' });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.strictEqual(Number((await dbGet(db, 'SELECT ativo FROM requisicoes_almoxarifado WHERE id = ?', [r1.R])).ativo), 0, 'premissa: ativo 0');
    // Etapa 203 (C467, B1362): a exclusao limpa a origem — o 0 aqui vem da origem vazia; o filtro e provado pela versao por SQL abaixo.
    assert.strictEqual((await dbGet(db, 'SELECT origem_separacao_id o FROM itens_requisicao_almoxarifado WHERE id = ?', [r1.ids[0]])).o, null,
      'a exclusao limpa a origem (Etapa 203)');
    const rows = await saldos(m, `?requisicao_id=${r2.R}`);
    assert.deepStrictEqual(par(rows, B01.id, L1), [6, 0, 6]);
    await equivalente(m, rows, r2.R);
  });

  await test('[RN-201.03 excluida legada, por SQL, RN-203.06] ativo 0 e CANCELADO com a origem gravada (antes da 203) -> 0', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    assert.deepStrictEqual(par(await saldos(m, `?requisicao_id=${r2.R}`), B01.id, L1), [6, 4, 2], 'premissa: contava antes');
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET ativo = 0, status = 'CANCELADO' WHERE id = ?", [r1.R]);
    assert.strictEqual((await dbGet(db, 'SELECT origem_separacao_id o FROM itens_requisicao_almoxarifado WHERE id = ?', [r1.ids[0]])).o, B01.id,
      'premissa: a origem gravada');
    const rows = await saldos(m, `?requisicao_id=${r2.R}`);
    assert.deepStrictEqual(par(rows, B01.id, L1), [6, 0, 6]);
    await equivalente(m, rows, r2.R);
  });

  await test('[RN-201.03 cancelada legada] caixa de requisicao CANCELADO (por SQL) nao conta', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await caixa(r1.ids[0], { sep: 4, origem: B01.id, lote: L1, parte: 4 });
    assert.deepStrictEqual(par(await saldos(m, `?requisicao_id=${r2.R}`), B01.id, L1), [6, 4, 2], 'premissa: viva conta');
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'CANCELADO' WHERE id = ?", [r1.R]);
    const rows = await saldos(m, `?requisicao_id=${r2.R}`);
    assert.deepStrictEqual(par(rows, B01.id, L1), [6, 0, 6]);
    await equivalente(m, rows, r2.R);
  });

  await test('[RN-201.03 parte limitada] caixa 4 com parte 1 no par -> conta 1; NULL legado -> conta a caixa (4)', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await caixa(r1.ids[0], { sep: 4, origem: B01.id, lote: L1, parte: 1 });
    let rows = await saldos(m, `?requisicao_id=${r2.R}`);
    assert.deepStrictEqual(par(rows, B01.id, L1), [6, 1, 5]);
    await equivalente(m, rows, r2.R);
    await caixa(r1.ids[0], { sep: 4, ent: 1, origem: B01.id, lote: L1, parte: null });
    rows = await saldos(m, `?requisicao_id=${r2.R}`);
    assert.deepStrictEqual(par(rows, B01.id, L1), [6, 3, 3], 'NULL legado = caixa (4 separados - 1 entregue)');
    await equivalente(m, rows, r2.R);
  });

  await test('[RN-201.03 folga] parte exatamente 1e-9 nao conta (rota e parteGuardadaDeOutras); 0,5 conta', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await caixa(r1.ids[0], { sep: 4, origem: B01.id, lote: L1, parte: 1e-9 });
    let rows = await saldos(m, `?requisicao_id=${r2.R}`);
    assert.deepStrictEqual(par(rows, B01.id, L1), [6, 0, 6]);
    assert.deepStrictEqual(await requisitionService.parteGuardadaDeOutras(db, m.id, B01.id, L1, r2.R), { q: 0, numeros: [] });
    assert.strictEqual((await requisitionService.parteGuardadaDeOutrasPorPar(db, m.id, r2.R)).has(`${B01.id}|${L1}`), false, 'PorPar sem o par');
    await equivalente(m, rows, r2.R);
    await caixa(r1.ids[0], { sep: 4, origem: B01.id, lote: L1, parte: 0.5 });
    rows = await saldos(m, `?requisicao_id=${r2.R}`);
    assert.deepStrictEqual(par(rows, B01.id, L1), [6, 0.5, 5.5]);
    await equivalente(m, rows, r2.R);
  });

  await test('[RN-201.03 tres pares] XB-01 com L1, L2 e sem lote: cada linha so conta o proprio par; linha sem endereco -> 0', async () => {
    const { m, L1, L2 } = await cenario();
    await entrar(m, B01.id, 5, 'L2');
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade) VALUES (?, ?, NULL, 7)', [m.id, B01.id]);
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade) VALUES (?, NULL, NULL, 3)', [m.id]);
    const r1 = await req([[m.id, 4], [m.id, 4], [m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await caixa(r1.ids[0], { sep: 1, origem: B01.id, lote: L1, parte: 1 });
    await caixa(r1.ids[1], { sep: 2, origem: B01.id, lote: L2, parte: 2 });
    await caixa(r1.ids[2], { sep: 3, origem: B01.id, lote: null, parte: 3 });
    const rows = await saldos(m, `?requisicao_id=${r2.R}`);
    assert.deepStrictEqual(par(rows, B01.id, L1), [6, 1, 5]);
    assert.deepStrictEqual(par(rows, B01.id, L2), [5, 2, 3]);
    assert.deepStrictEqual(par(rows, B01.id, null), [7, 3, 4]);
    assert.deepStrictEqual(par(rows, P01.id, L2), [9, 0, 9]);
    const semEndereco = rows.find((s) => s.localizacao_id == null);
    assert.ok(semEndereco, 'premissa: linha sem endereco');
    assert.deepStrictEqual([semEndereco.quantidade, semEndereco.separado_outras, semEndereco.sobra], [3, 0, 3]);
    await equivalente(m, rows, r2.R);
  });

  await test('[RN-201.03 sobra nunca negativa] fisico 2 com 4 guardados por outra -> sobra 0', async () => {
    const { m, L1 } = await cenario({ l1: 2 });
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await caixa(r1.ids[0], { sep: 4, origem: B01.id, lote: L1, parte: 4 });
    assert.deepStrictEqual(par(await saldos(m, `?requisicao_id=${r2.R}`), B01.id, L1), [2, 4, 0]);
  });

  // Fase 5 (item 1): o filtro de material da regua agrupada. Sem lote dos dois lados, o par (XB-01, NULL) e o MESMO para os dois
  // materiais — so `ir.material_id = ?` separa o que R1 guardou de A do que a linha de B mostra.
  await test('[RN-201.03 outro material] A e B sem lote em XB-01; R1 separa A dali -> a linha de B diz separado_outras 0', async () => {
    const A = await material({ lote: 0 }); const B = await material({ lote: 0 });
    await entrar(A, B01.id, 6); await entrar(A, P01.id, 9); await entrar(B, B01.id, 5);
    const r1 = await req([[A.id, 4]]); const r2 = await req([[B.id, 2]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, null)]);
    const rowsB = await saldos(B, `?requisicao_id=${r2.R}`);
    assert.deepStrictEqual(par(rowsB, B01.id, null), [5, 0, 5]);
    const rowsA = await saldos(A, `?requisicao_id=${r2.R}`);
    assert.deepStrictEqual(par(rowsA, B01.id, null), [6, 4, 2], 'premissa: R1 guardou 4 de A em XB-01 sem lote');
    await equivalente(A, rowsA, r2.R);
    await equivalente(B, rowsB, r2.R);
  });

  // ---------------------------------------------------------------- RN-201.04
  await test('[RN-201.04] requisicao_id invalido -> 400 literal (vazio, abc, 0, -1, 1.5, array); inexistente -> 200 conta todas', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    for (const q of ['', 'abc', '0', '-1', '1.5', ' 1', '01']) {
      const r = await como('ALMOX').get(`${API}/estoque/${m.id}/saldos?requisicao_id=${encodeURIComponent(q)}`);
      assert.strictEqual(r.status, 400, `"${q}": ${r.status}`);
      assert.deepStrictEqual(r.body, { error: 'requisicao_id inválido' }, `"${q}"`);
    }
    const arr = await como('ALMOX').get(`${API}/estoque/${m.id}/saldos?requisicao_id=1&requisicao_id=2`);
    assert.strictEqual(arr.status, 400, `array: ${arr.status}`);
    assert.deepStrictEqual(arr.body, { error: 'requisicao_id inválido' });
    assert.deepStrictEqual(par(await saldos(m, '?requisicao_id=999999'), B01.id, L1), [6, 4, 2]);
  });

  await test('[RN-201.04] sem perfil (S) le como hoje (200); material inexistente -> []', async () => {
    const { m, L1 } = await cenario();
    const r = await como('S').get(`${API}/estoque/${m.id}/saldos`);
    assert.strictEqual(r.status, 200, `sem perfil: ${r.status}`);
    assert.deepStrictEqual(par(r.body, B01.id, L1), [6, 0, 6]);
    const nada = await como('ALMOX').get(`${API}/estoque/99999999/saldos?requisicao_id=1`);
    assert.strictEqual(nada.status, 200);
    assert.deepStrictEqual(nada.body, []);
  });

  // ---------------------------------------------------------------- RN-201.05
  await test('[RN-201.05] o extrato nao ganha os campos; consultarSaldosPorLocalizacao tambem nao', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    const ex = await como('ADMIN').get(`${API}/materiais/${m.id}/extrato`);
    assert.strictEqual(ex.status, 200, JSON.stringify(ex.body));
    assert.ok(Array.isArray(ex.body.saldos_localizacao) && ex.body.saldos_localizacao.length >= 2, 'premissa: saldos no extrato');
    for (const s of ex.body.saldos_localizacao) {
      assert.ok(!('separado_outras' in s) && !('sobra' in s), `extrato com campo novo: ${JSON.stringify(s)}`);
    }
    const crus = await require('../../services/almoxarifado/stockService').consultarSaldosPorLocalizacao(db, m.id);
    for (const s of crus) assert.ok(!('separado_outras' in s) && !('sobra' in s), 'funcao do extrato mudou');
    // A rota devolve os mesmos campos da funcao, mais os dois — e, desde a Etapa 218 (B1449, mudanca de contrato aditiva e declarada),
    // mais os tres do lote com peca presa (`lote_livre`, `lote_bloqueado`, `lote_inspecao`; null sem peca presa). Esta asserção dizia
    // "mais os dois" e foi ampliada, nao apagada: a funcao do extrato continua sem nenhum deles (acima).
    const DA_ROTA = ['separado_outras', 'sobra', 'lote_livre', 'lote_bloqueado', 'lote_inspecao'];
    const rows = await saldos(m);
    assert.deepStrictEqual(rows.map((s) => Object.keys(s).filter((k) => !DA_ROTA.includes(k)).sort()),
      crus.map((s) => Object.keys(s).sort()));
    for (const s of rows) assert.ok(DA_ROTA.every((k) => k in s), `rota sem um dos campos: ${JSON.stringify(s)}`);
    for (const s of [...crus, ...ex.body.saldos_localizacao]) assert.ok(!('lote_livre' in s), 'extrato com lote_livre');
  });

  // ---------------------------------------------------------------- RN-201.09 (T4)
  // A literal C1 da Etapa 198 (sem mudar nesta etapa): o numero da lista tem de ser o "sobra" dela.
  const c1 = (m, { saldo, contando = 0, outras, numeros, sobra, qty }) => `${m.nome}: em XB-01, lote L1 há ${saldo}`
    + `${contando ? ` (já contando ${contando} desta requisição)` : ''} para esta separação, mas ${outras} `
    + `${numeros.length > 1 ? 'já estão separados dali para outras requisições' : 'já está separado dali para outra requisição'} `
    + `(${numeros.join(', ')}); sobra ${sobra}, que não cobre a quantidade (${qty}). Escolha outro endereço ou reabra a janela para ver a sugestão atual`;
  // A sobra que a tela mostra na janela de SEPARACAO (RN-201.06 com a Fase 2): a sobra da rota menos a parte desta requisicao no par.
  const sobraNaSeparacao = async (rows, R, locId, lid) => {
    const itens = await dbAll(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R]);
    const propria = itens.filter((i) => Number(i.origem_separacao_id) === Number(locId)
      && (i.lote_separacao_id == null ? null : Number(i.lote_separacao_id)) === lid)
      .reduce((s, i) => s + requisitionService.parteDaOrigem(i), 0);
    return Math.max(0, linha(rows, locId, lid).sobra - propria);
  };
  const recusa = async (R, linhas) => {
    const r = await separacao(R, linhas);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    return r.body.error;
  };

  await test('[RN-201.09 rota] R1 separou 4; a lista de R2 diz sobra 2; 3 -> C1 "sobra 2"; 2 -> 200; R3 le 6 e sobra 0; R1 nao se conta', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]); const r3 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    let rows = await saldos(m, `?requisicao_id=${r2.R}`);
    assert.deepStrictEqual(par(rows, B01.id, L1), [6, 4, 2]);
    const sobra = await sobraNaSeparacao(rows, r2.R, B01.id, L1);
    assert.strictEqual(sobra, 2);
    assert.strictEqual(await recusa(r2.R, [doPar(r2.ids[0], 3, L1)]),
      c1(m, { saldo: 6, outras: 4, numeros: [await numero(r1.R)], sobra, qty: 3 }));
    await sepOk(r2.R, [doPar(r2.ids[0], 2, L1)]);
    rows = await saldos(m, `?requisicao_id=${r3.R}`);
    assert.deepStrictEqual(par(rows, B01.id, L1), [6, 6, 0]);
    await equivalente(m, rows, r3.R);
    rows = await saldos(m, `?requisicao_id=${r1.R}`);
    assert.deepStrictEqual(par(rows, B01.id, L1), [6, 2, 4], 'R1 le so o de R2');
    await equivalente(m, rows, r1.R);
  });

  await test('[RN-201.09 rota, Fase 2] R2 separou 1 dali: a lista diz sobra 1 (1 desta); 2 -> C1 "sobra 1"; 1 -> 200', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    await sepOk(r2.R, [doPar(r2.ids[0], 1, L1)]);
    const rows = await saldos(m, `?requisicao_id=${r2.R}`);
    assert.deepStrictEqual(par(rows, B01.id, L1), [6, 4, 2], 'a rota nao conta a propria');
    const sobra = await sobraNaSeparacao(rows, r2.R, B01.id, L1);
    assert.strictEqual(sobra, 1);
    assert.strictEqual(await recusa(r2.R, [doPar(r2.ids[0], 2, L1)]),
      c1(m, { saldo: 5, contando: 1, outras: 4, numeros: [await numero(r1.R)], sobra, qty: 2 }));
    await sepOk(r2.R, [doPar(r2.ids[0], 1, L1)]);
  });

  await test('[RN-201.09 servico] separarRequisicao + parteGuardadaDeOutrasPorPar: o mesmo numero da recusa', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]); const r3 = await req([[m.id, 4]]);
    const k = `${B01.id}|${L1}`;
    await requisitionService.separarRequisicao(db, r1.R, [doPar(r1.ids[0], 4, L1)], ALMOX);
    const fisico = 6;
    let mapa = await requisitionService.parteGuardadaDeOutrasPorPar(db, m.id, r2.R);
    assert.strictEqual(mapa.get(k), 4);
    assert.strictEqual(fisico - mapa.get(k), 2);
    let erro = null;
    try { await requisitionService.separarRequisicao(db, r2.R, [doPar(r2.ids[0], 3, L1)], ALMOX); } catch (e) { erro = e; }
    assert.ok(erro && erro.status === 400, `tinha de recusar: ${erro && erro.message}`);
    assert.strictEqual(erro.message, c1(m, { saldo: 6, outras: 4, numeros: [await numero(r1.R)], sobra: fisico - mapa.get(k), qty: 3 }));
    await requisitionService.separarRequisicao(db, r2.R, [doPar(r2.ids[0], 2, L1)], ALMOX);
    mapa = await requisitionService.parteGuardadaDeOutrasPorPar(db, m.id, r3.R);
    assert.strictEqual(mapa.get(k), 6);
    assert.strictEqual((await requisitionService.parteGuardadaDeOutras(db, m.id, B01.id, L1, r3.R)).q, 6);
    mapa = await requisitionService.parteGuardadaDeOutrasPorPar(db, m.id, r1.R);
    assert.strictEqual(mapa.get(k), 2, 'R1 nao se conta');
  });
  await close();
  terminou = true;
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
