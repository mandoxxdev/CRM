/**
 * Etapa 196 — separar em duas vezes: a parte separada primeiro continua saindo de onde foi separada. O item guarda, alem do par
 * (endereco, lote) da separacao, QUANTO da caixa saiu dele (`quantidade_origem_separacao`); a rodada de outro par nao apaga a origem
 * nem grava troca; a entrega consome a parte; a fila e a sugestao contam a parte, nao a caixa.
 *
 * Plano: docs/superpowers/plans/2026-11-05-almoxarifado-etapa196-origem-da-separacao-em-duas-vezes.md (o bloco "Fase 2" manda).
 *
 * Executar: cd server && node tests/api/origemSeparacaoEmDuasVezes.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { initSchema } = require('../../services/almoxarifado/schema');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 196: origem da separacao em duas vezes ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const loc = async (nome) => {
    const c = `E196-${nome}-${++seq}`;
    return { id: (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', [c, nome])).lastID, codigo: c };
  };
  const material = async ({ serie = false } = {}) => {
    const c = `E196-M${++seq}`;
    return { id: (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_serie)
      VALUES (?, ?, 'UN', 0, 1, ?)`, [c, `Mat ${c}`, serie ? 1 : 0])).lastID, codigo: c };
  };
  const entrar = async (m, destino, q, lote, series) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({
      material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e196', localizacao_destino_id: destino,
      ...(lote ? { lote } : {}), ...(series ? { series } : {}),
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m, codigo])).id;
  const req = async (itens) => {
    const r = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E196-${++seq}`])).lastID;
    const ids = [];
    for (const [m, q] of itens) {
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
        (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
        VALUES (?,?,?,0,0,0)`, [r, m, q])).lastID);
    }
    return { id: r, ids };
  };
  const separar = (reqId, itens) => request(app).put(`/api/almoxarifado/requisicoes/${reqId}/separacao`).send({ itens_separados: itens });
  const entregar = (reqId, itens) => request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`).send({ itens_atendidos: itens });
  const devolver = (reqId, itens) => request(app).put(`/api/almoxarifado/requisicoes/${reqId}/devolver-separado`)
    .send({ motivo: 'e196', itens });
  const subs = async (reqId) => dbAll(db, 'SELECT * FROM substituicoes_origem_requisicao WHERE requisicao_id = ? ORDER BY id', [reqId]);
  const origem = async (itemId) => dbGet(db, `SELECT origem_separacao_id o, lote_separacao_id l, quantidade_origem_separacao q,
      quantidade_separada - COALESCE(quantidade_entregue, 0) caixa FROM itens_requisicao_almoxarifado WHERE id = ?`, [itemId]);
  const ok = async (p) => { const r = await p; assert.strictEqual(r.status, 200, JSON.stringify(r.body)); return r; };
  const saldo = async (m, l, lote = null) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) q FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND localizacao_id = ? AND lote_id IS ?`, [m, l, lote])).q);

  // ── T0 — a coluna ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[T0] banco novo: itens_requisicao_almoxarifado tem quantidade_origem_separacao (REAL), e o initSchema de novo nao quebra', async () => {
    const cols = await dbAll(db, 'PRAGMA table_info(itens_requisicao_almoxarifado)');
    const c = cols.find((x) => x.name === 'quantidade_origem_separacao');
    assert.ok(c, `coluna ausente: ${cols.map((x) => x.name).join(',')}`);
    assert.strictEqual(c.type, 'REAL');
    await initSchema(db);
    const cols2 = await dbAll(db, 'PRAGMA table_info(itens_requisicao_almoxarifado)');
    assert.strictEqual(cols2.filter((x) => x.name === 'quantidade_origem_separacao').length, 1);
  });

  await test('[T0] parteDaOrigem: sem origem 0; origem com quantidade = a quantidade (limitada a caixa); origem antiga NULL = a caixa', async () => {
    const { parteDaOrigem } = requisitionService;
    assert.strictEqual(parteDaOrigem({ origem_separacao_id: null, quantidade_separada: 5, quantidade_entregue: 0 }), 0);
    assert.strictEqual(parteDaOrigem({ origem_separacao_id: 7, quantidade_origem_separacao: 3, quantidade_separada: 6, quantidade_entregue: 0 }), 3);
    assert.strictEqual(parteDaOrigem({ origem_separacao_id: 7, quantidade_origem_separacao: 5, quantidade_separada: 6, quantidade_entregue: 4 }), 2);
    assert.strictEqual(parteDaOrigem({ origem_separacao_id: 7, quantidade_origem_separacao: null, quantidade_separada: 6, quantidade_entregue: 2 }), 4);
    const r = await dbGet(db, `SELECT ${requisitionService.parteOrigemSql('x')} AS p FROM (SELECT 7 AS origem_separacao_id, NULL AS quantidade_origem_separacao,
      6 AS quantidade_separada, 2 AS quantidade_entregue, NULL AS quantidade_atendida) x`);
    assert.strictEqual(Number(r.p), 4);
    const r2 = await dbGet(db, `SELECT ${requisitionService.parteOrigemSql('x')} AS p FROM (SELECT 7 AS origem_separacao_id, 9 AS quantidade_origem_separacao,
      6 AS quantidade_separada, 2 AS quantidade_entregue, NULL AS quantidade_atendida) x`);
    assert.strictEqual(Number(r2.p), 4);
    const r3 = await dbGet(db, `SELECT ${requisitionService.parteOrigemSql('x')} AS p FROM (SELECT NULL AS origem_separacao_id, 9 AS quantidade_origem_separacao,
      6 AS quantidade_separada, 2 AS quantidade_entregue, NULL AS quantidade_atendida) x`);
    assert.strictEqual(Number(r3.p), 0);
  });

  // ── T1 — a separacao (RN-196.01..05, 196.09 na rodada, 196.10) ───────────────────────────────────────────────────────────────────
  await test('[RN-196.01] sem nada separado, separa 3 de A -> origem A, parte 3; com 2 na caixa sem origem, separa 3 de B -> origem B, parte 3', async () => {
    const A = await loc('A'); const B = await loc('B'); const m = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10);
    const r1 = await req([[m.id, 8]]);
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    assert.deepStrictEqual(await origem(r1.ids[0]), { o: A.id, l: null, q: 3, caixa: 3 });
    const r2 = await req([[m.id, 8]]);
    await ok(separar(r2.id, [{ item_id: r2.ids[0], quantidade_separada: 2 }]));
    assert.deepStrictEqual(await origem(r2.ids[0]), { o: null, l: null, q: null, caixa: 2 });
    await ok(separar(r2.id, [{ item_id: r2.ids[0], quantidade_separada: 3, localizacao_origem_id: B.id }]));
    assert.deepStrictEqual(await origem(r2.ids[0]), { o: B.id, l: null, q: 3, caixa: 5 });
    assert.deepStrictEqual(await subs(r2.id), []);
  });

  await test('[RN-196.01] so lote (sem endereco) nao vira origem', async () => {
    const A = await loc('SL'); const m = await material(); const c = `LS-${seq}`;
    await entrar(m.id, A.id, 5, c);
    const l = await loteId(m.id, c);
    const r = await req([[m.id, 4]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 2, lote_id: l }]));
    assert.deepStrictEqual(await origem(r.ids[0]), { o: null, l: null, q: null, caixa: 2 });
  });

  await test('[RN-196.02] A 3, depois A 2 -> origem A, parte 5; nenhuma troca', async () => {
    const A = await loc('MA'); const m = await material();
    await entrar(m.id, A.id, 10);
    const r = await req([[m.id, 8]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]));
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: null, q: 5, caixa: 5 });
    assert.deepStrictEqual(await subs(r.id), []);
  });

  await test('[RN-196.03] o caso real: A/L1 3, depois automatico 3 -> origem A/L1, parte 3, caixa 6; outro par (B) e so lote tambem mantem', async () => {
    const A = await loc('RA'); const B = await loc('RB'); const m = await material(); const c1 = `L1-${seq}`; const c2 = `L2-${seq}`;
    await entrar(m.id, A.id, 3, c1); await entrar(m.id, B.id, 10, c2);
    const l1 = await loteId(m.id, c1); const l2 = await loteId(m.id, c2);
    const r = await req([[m.id, 12]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id, lote_id: l1 }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3 }]));
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: l1, q: 3, caixa: 6 });
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: B.id, lote_id: l2 }]));
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: l1, q: 3, caixa: 8 });
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 1, lote_id: l2 }]));
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: l1, q: 3, caixa: 9 });
    assert.deepStrictEqual(await subs(r.id), []);
  });

  await test('[RN-196.04] a separacao nao grava troca; motivo_substituicao e ignorado sem 400', async () => {
    const A = await loc('TA'); const B = await loc('TB'); const m = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10);
    const r = await req([[m.id, 8]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: B.id, motivo_substituicao: 'A acabou' }]));
    assert.deepStrictEqual(await subs(r.id), []);
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: null, q: 3, caixa: 5 });
  });

  await test('[RN-196.05] sem origem, rodada com A 1, A 1, B 2 -> origem A, parte 2; caixa 4', async () => {
    const A = await loc('VA'); const B = await loc('VB'); const m = await material();
    await entrar(m.id, A.id, 5); await entrar(m.id, B.id, 5);
    const r = await req([[m.id, 9]]);
    await ok(separar(r.id, [
      { item_id: r.ids[0], quantidade_separada: 1, localizacao_origem_id: A.id },
      { item_id: r.ids[0], quantidade_separada: 1, localizacao_origem_id: A.id },
      { item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: B.id },
    ]));
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: null, q: 2, caixa: 4 });
    assert.deepStrictEqual(await subs(r.id), []);
  });

  await test('[RN-196.09] 3a rodada de A com 2 livres la (A 3 + automatico 2 antes) passa: o comprometido de A e a parte 3, nao a caixa 5', async () => {
    const A = await loc('PA'); const B = await loc('PB'); const m = await material();
    await entrar(m.id, A.id, 5); await entrar(m.id, B.id, 2);
    const r = await req([[m.id, 10]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 2 }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]));
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: null, q: 5, caixa: 7 });
  });

  await test('[RN-196.09] a regua da divergencia de OUTRA requisicao conta a parte: A 5 com 3 comprometidos (caixa 6) -> separar 1 de A com 2 la e divergente', async () => {
    const A = await loc('DA'); const B = await loc('DB'); const m = await material();
    await entrar(m.id, A.id, 5); await entrar(m.id, B.id, 10);
    const r1 = await req([[m.id, 6]]);
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 3 }]));
    const r2 = await req([[m.id, 2]]);
    const s = await ok(separar(r2.id, [{ item_id: r2.ids[0], quantidade_separada: 1, localizacao_origem_id: A.id }]));
    const rod = await dbGet(db, 'SELECT itens_json FROM separacoes_requisicao_almoxarifado WHERE id = ?', [s.body.rodada_id]);
    const t = JSON.parse(rod.itens_json)[0];
    assert.deepStrictEqual([t.maximo, t.divergente], [2, true], rod.itens_json);
  });

  await test('[RN-196.10] origem antiga sem quantidade (NULL, caixa 3) + rodada automatica 3 -> grava a parte 3 (nunca NULL com origem)', async () => {
    const A = await loc('NA'); const B = await loc('NB'); const m = await material();
    await entrar(m.id, A.id, 3); await entrar(m.id, B.id, 3);
    const r = await req([[m.id, 6]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_origem_separacao = NULL WHERE id = ?', [r.ids[0]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3 }]));
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: null, q: 3, caixa: 6 });
  });

  await test('[RN-196.01..03] pelo SERVICO (sem a rota): A 2 + B 2 -> origem A, parte 2, nenhuma troca', async () => {
    const A = await loc('SA'); const B = await loc('SB'); const m = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10);
    const r = await req([[m.id, 6]]);
    await requisitionService.separarRequisicao(db, r.id, [{ item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }], ADMIN);
    await requisitionService.separarRequisicao(db, r.id, [{ item_id: r.ids[0], quantidade_separada: 2, localizacao_origem_id: B.id }], ADMIN);
    assert.deepStrictEqual(await requisitionService.listarSubstituicoes(db, r.id), []);
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: null, q: 2, caixa: 4 });
  });

  // ── T2 — a entrega e a devolucao a prateleira (RN-196.06..08, 196.10) ───────────────────────────────────────────────────────────
  const saidas = async (reqId) => (await dbAll(db, `SELECT localizacao_origem_id loc, quantidade q FROM movimentacoes_almoxarifado
    WHERE requisicao_id = ? AND tipo = 'SAIDA' ORDER BY id`, [reqId])).map((x) => [x.loc, Number(x.q)]);
  const duasVezes = async ({ a = 3, b = 3, pedido = 6 } = {}) => {
    const A = await loc('EA'); const B = await loc('EB'); const m = await material();
    await entrar(m.id, A.id, a); await entrar(m.id, B.id, b);
    const r = await req([[m.id, pedido]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3 }]));
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: null, q: 3, caixa: 6 }, 'premissa: parte 3, caixa 6');
    return { A, B, m, ...r };
  };

  await test('[RN-196.06] parte 3 em A + 3 no automatico, entrega de um clique 6 -> 3 de A (estrito), 3 no automatico, 0 trocas; a origem zera', async () => {
    const { A, B, m, id, ids } = await duasVezes();
    await ok(entregar(id, [{ item_id: ids[0], quantidade_atendida: 6 }]));
    assert.deepStrictEqual(await saidas(id), [[A.id, 3], [null, 3]]);
    assert.deepStrictEqual([await saldo(m.id, A.id), await saldo(m.id, B.id)], [0, 0]);
    assert.deepStrictEqual(await subs(id), []);
    assert.deepStrictEqual(await origem(ids[0]), { o: null, l: null, q: null, caixa: 0 });
  });

  await test('[RN-196.07] entrega de um clique 3 e depois 3: a 1a sai de A e consome a parte (a origem zera); a 2a sai no automatico', async () => {
    const { A, B, id, ids } = await duasVezes();
    await ok(entregar(id, [{ item_id: ids[0], quantidade_atendida: 3 }]));
    assert.deepStrictEqual(await origem(ids[0]), { o: null, l: null, q: null, caixa: 3 });
    await ok(entregar(id, [{ item_id: ids[0], quantidade_atendida: 3 }]));
    assert.deepStrictEqual(await saidas(id), [[A.id, 3], [null, 3]]);
    assert.deepStrictEqual(await subs(id), []);
  });

  await test('[RN-196.07] entrega de um clique 2 de 6: sai de A, a parte cai para 1 (o que saiu dela)', async () => {
    const { A, id, ids } = await duasVezes();
    await ok(entregar(id, [{ item_id: ids[0], quantidade_atendida: 2 }]));
    assert.deepStrictEqual(await saidas(id), [[A.id, 2]]);
    assert.deepStrictEqual(await origem(ids[0]), { o: A.id, l: null, q: 1, caixa: 4 });
  });

  await test('[RN-196.07, Fase 2] entrega de 3 escolhendo B (caixa 6, parte 3) consome a parte SEM origem: 0 trocas, A fica com 3; depois o um clique tira 3 de A', async () => {
    const { A, B, id, ids } = await duasVezes();
    await ok(entregar(id, [{ item_id: ids[0], quantidade_atendida: 3, localizacao_origem_id: B.id }]));
    assert.deepStrictEqual(await subs(id), []);
    assert.deepStrictEqual(await origem(ids[0]), { o: A.id, l: null, q: 3, caixa: 3 });
    await ok(entregar(id, [{ item_id: ids[0], quantidade_atendida: 3 }]));
    assert.deepStrictEqual(await saidas(id), [[B.id, 3], [A.id, 3]]);
    assert.deepStrictEqual(await subs(id), []);
  });

  await test('[RN-196.07, Fase 2] entrega de 4 escolhendo B (caixa 6, parte 3): troca de 1 (o que passou da parte sem origem), A fica com 2', async () => {
    const { A, B, id, ids } = await duasVezes({ b: 5 });
    await ok(entregar(id, [{ item_id: ids[0], quantidade_atendida: 4, localizacao_origem_id: B.id, motivo_substituicao: 'mais perto' }]));
    const s = await subs(id);
    assert.deepStrictEqual(s.map((x) => [x.momento, Number(x.quantidade), x.localizacao_planejada_id, x.localizacao_saida_id]),
      [['ENTREGA', 1, A.id, B.id]]);
    assert.deepStrictEqual(await origem(ids[0]), { o: A.id, l: null, q: 2, caixa: 2 });
  });

  await test('[RN-196.07, Fase 2] com SERIE: parte 3 em A/L1, entrega de 3 com series de L2 em B -> 0 trocas, A/L1 fica com 3', async () => {
    const A = await loc('SEA'); const B = await loc('SEB'); const m = await material({ serie: true });
    const c1 = `SL1-${seq}`; const c2 = `SL2-${seq}`; const p = `S${seq}`;
    await entrar(m.id, A.id, 3, c1, [`${p}a1`, `${p}a2`, `${p}a3`]); await entrar(m.id, B.id, 3, c2, [`${p}b1`, `${p}b2`, `${p}b3`]);
    const l1 = await loteId(m.id, c1);
    const r = await req([[m.id, 6]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id, lote_id: l1 }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3 }]));
    const sids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero LIKE ? ORDER BY id', [m.id, `${p}b%`])).map((x) => x.id);
    await ok(entregar(r.id, [{ item_id: r.ids[0], quantidade_atendida: 3, localizacao_origem_id: B.id, serie_ids: sids }]));
    assert.deepStrictEqual(await subs(r.id), []);
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: l1, q: 3, caixa: 3 });
  });

  await test('[RN-196.08] devolver a prateleira tira primeiro a parte sem origem: caixa 6 parte 3 -> devolve 2 (parte 3), devolve 3 (parte 1), devolve 1 (zera)', async () => {
    const { A, id, ids } = await duasVezes();
    await ok(devolver(id, [{ item_id: ids[0], quantidade: 2 }]));
    assert.deepStrictEqual(await origem(ids[0]), { o: A.id, l: null, q: 3, caixa: 4 });
    await ok(devolver(id, [{ item_id: ids[0], quantidade: 3 }]));
    assert.deepStrictEqual(await origem(ids[0]), { o: A.id, l: null, q: 1, caixa: 1 });
    await ok(devolver(id, [{ item_id: ids[0], quantidade: 1 }]));
    assert.deepStrictEqual(await origem(ids[0]), { o: null, l: null, q: null, caixa: 0 });
  });

  await test('[RN-196.10] origem antiga sem quantidade (NULL): a entrega de um clique tira a caixa inteira de A; com uma rodada automatica no meio, 3 de A e 3 no automatico', async () => {
    const A = await loc('OA'); const B = await loc('OB'); const m = await material();
    await entrar(m.id, A.id, 6); await entrar(m.id, B.id, 3);
    const r1 = await req([[m.id, 3]]);
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_origem_separacao = NULL WHERE id = ?', [r1.ids[0]]);
    await ok(entregar(r1.id, [{ item_id: r1.ids[0], quantidade_atendida: 3 }]));
    assert.deepStrictEqual(await saidas(r1.id), [[A.id, 3]]);
    const r2 = await req([[m.id, 6]]);
    await ok(separar(r2.id, [{ item_id: r2.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_origem_separacao = NULL WHERE id = ?', [r2.ids[0]]);
    await ok(separar(r2.id, [{ item_id: r2.ids[0], quantidade_separada: 3 }]));
    await ok(entregar(r2.id, [{ item_id: r2.ids[0], quantidade_atendida: 6 }]));
    assert.deepStrictEqual(await saidas(r2.id), [[A.id, 3], [null, 3]]);
  });

  await test('[RN-196.07, Fase 2 item 3] a entrega que falha no meio decrementa a parte pelo que SAIU com origem, nao pelo pedido', async () => {
    const { A, id, ids } = await duasVezes({ a: 3, b: 3 });
    await requisitionService.reservarItensAprovacao(db, id, ADMIN, {});
    const resv = await dbGet(db, "SELECT id, material_id FROM reservas_material_almoxarifado WHERE item_requisicao_id = ? AND status = 'ATIVA'", [ids[0]]);
    assert.ok(resv, 'premissa: a aprovacao reservou');
    await dbRun(db, 'UPDATE reservas_material_almoxarifado SET quantidade = 4 WHERE id = ?', [resv.id]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = 4 WHERE id = ?', [resv.material_id]);
    // baixas: 2 sem reserva + 4 da reserva; com origem: 2 (sem reserva) + 1 (reserva) — a 2a, com reserva, falha.
    await dbRun(db, `CREATE TRIGGER e196_falha BEFORE INSERT ON movimentacoes_almoxarifado
      WHEN NEW.requisicao_id = ${Number(id)} AND NEW.reserva_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'falha forcada 196'); END`);
    let r;
    try {
      r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 6 }]);
    } finally {
      await dbRun(db, 'DROP TRIGGER e196_falha');
    }
    assert.notStrictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await saidas(id), [[A.id, 2]], 'premissa: so o 1o pedaco com origem saiu');
    assert.deepStrictEqual(await origem(ids[0]), { o: A.id, l: null, q: 1, caixa: 4 });
  });

  // ── Fase 5 (K1..K3) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[Fase 5 K1] SERIE: parte 3 em A/L1 + 3 no automatico; entrega de um clique 3 com series de L2 (sem "Sai de") -> 200 (como antes da 196), 0 trocas, A/L1 fica com 3; um clique 3 com as de L1 tira de A/L1', async () => {
    const A = await loc('KA'); const B = await loc('KB'); const m = await material({ serie: true });
    const c1 = `KL1-${seq}`; const c2 = `KL2-${seq}`; const p = `K${seq}`;
    await entrar(m.id, A.id, 3, c1, [`${p}a1`, `${p}a2`, `${p}a3`]); await entrar(m.id, B.id, 4, c2, [`${p}b1`, `${p}b2`, `${p}b3`, `${p}b4`]);
    const l1 = await loteId(m.id, c1); const l2 = await loteId(m.id, c2);
    const sids = async (pre) => (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero LIKE ? ORDER BY id', [m.id, `${p}${pre}%`])).map((x) => x.id);
    const r = await req([[m.id, 6]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id, lote_id: l1 }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3 }]));
    const bs = await sids('b');
    // series mistas (L1 e L2 na mesma entrega): recusa clara de antes (Etapa 61), nada sai — B1319
    const mista = await entregar(r.id, [{ item_id: r.ids[0], quantidade_atendida: 2, serie_ids: [(await sids('a'))[0], bs[0]] }]);
    assert.strictEqual(mista.status, 400, JSON.stringify(mista.body));
    assert.strictEqual(mista.body.error, `Mat ${m.codigo}: escolha series de um lote so`);
    await ok(entregar(r.id, [{ item_id: r.ids[0], quantidade_atendida: 3, serie_ids: bs.slice(0, 3) }]));
    assert.deepStrictEqual(await subs(r.id), []);
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: l1, q: 3, caixa: 3 });
    assert.deepStrictEqual([await saldo(m.id, A.id, l1), await saldo(m.id, B.id, l2)], [3, 1]);
    await ok(entregar(r.id, [{ item_id: r.ids[0], quantidade_atendida: 3, serie_ids: await sids('a') }]));
    assert.deepStrictEqual(await saidas(r.id), [[null, 3], [A.id, 3]]); // a de L2 sai pelo "so lote" (o motor acha B), como antes da 196
    assert.deepStrictEqual([await saldo(m.id, A.id, l1), await saldo(m.id, B.id, l2)], [0, 1]);
    assert.deepStrictEqual(await subs(r.id), []);
    assert.deepStrictEqual(await origem(r.ids[0]), { o: null, l: null, q: null, caixa: 0 });
  });

  await test('[Fase 5 K1] SERIE: um clique 4 com series de L2 (caixa 6, parte 3) passa da parte sem origem -> troca de 1, A/L1 fica com 2; caixa toda de A/L1 + series de L2 -> 400 de antes (pede "Sai de")', async () => {
    const A = await loc('KC'); const B = await loc('KD'); const m = await material({ serie: true });
    const c1 = `KM1-${seq}`; const c2 = `KM2-${seq}`; const p = `KK${seq}`;
    await entrar(m.id, A.id, 4, c1, [`${p}a1`, `${p}a2`, `${p}a3`, `${p}a4`]); await entrar(m.id, B.id, 4, c2, [`${p}b1`, `${p}b2`, `${p}b3`, `${p}b4`]);
    const l1 = await loteId(m.id, c1); const l2 = await loteId(m.id, c2);
    const bs = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero LIKE ? ORDER BY id', [m.id, `${p}b%`])).map((x) => x.id);
    const r = await req([[m.id, 6]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id, lote_id: l1 }]));
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3 }]));
    await ok(entregar(r.id, [{ item_id: r.ids[0], quantidade_atendida: 4, serie_ids: bs }]));
    const s = await subs(r.id);
    assert.deepStrictEqual(s.map((x) => [x.momento, Number(x.quantidade), x.localizacao_planejada_id, x.lote_planejado_id, x.lote_saida_id, x.automatica]),
      [['ENTREGA', 1, A.id, l1, l2, 1]]); // um clique sem "Sai de": automatica
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: l1, q: 2, caixa: 2 });
    assert.deepStrictEqual([await saldo(m.id, A.id, l1), await saldo(m.id, B.id, l2)], [4, 0]);
    // caixa toda de A/L1 (parte = caixa): series de outro lote num clique continuam recusadas, como antes da 196
    const r2 = await req([[m.id, 1]]);
    await ok(separar(r2.id, [{ item_id: r2.ids[0], quantidade_separada: 1, localizacao_origem_id: A.id, lote_id: l1 }]));
    await entrar(m.id, B.id, 1, c2, [`${p}b5`]);
    const b5 = (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [m.id, `${p}b5`])).id;
    const rec = await entregar(r2.id, [{ item_id: r2.ids[0], quantidade_atendida: 1, serie_ids: [b5] }]);
    assert.strictEqual(rec.status, 400, JSON.stringify(rec.body));
    assert.ok(/a origem da separação não serve mais \(as series escolhidas nao sao do lote dela\)/.test(rec.body.error), rec.body.error);
  });

  await test('[Fase 5 K2] entrega escolhendo a PROPRIA origem: 2 de A (caixa 6, parte 3) -> parte 1, caixa 4; o um clique 4 tira 1 de A e 3 no automatico', async () => {
    const { A, id, ids } = await duasVezes();
    await ok(entregar(id, [{ item_id: ids[0], quantidade_atendida: 2, localizacao_origem_id: A.id }]));
    assert.deepStrictEqual(await origem(ids[0]), { o: A.id, l: null, q: 1, caixa: 4 });
    await ok(entregar(id, [{ item_id: ids[0], quantidade_atendida: 4 }]));
    assert.deepStrictEqual(await saidas(id), [[A.id, 2], [A.id, 1], [null, 3]]);
    assert.deepStrictEqual(await subs(id), []);
  });

  await test('[Fase 5 K3] dado antigo (parte NULL, caixa 3): entrega de um clique 2 -> sai de A, parte 1 (a caixa de ANTES menos o que saiu)', async () => {
    const A = await loc('KN'); const m = await material();
    await entrar(m.id, A.id, 5);
    const r = await req([[m.id, 3]]);
    await ok(separar(r.id, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_origem_separacao = NULL WHERE id = ?', [r.ids[0]]);
    await ok(entregar(r.id, [{ item_id: r.ids[0], quantidade_atendida: 2 }]));
    assert.deepStrictEqual(await saidas(r.id), [[A.id, 2]]);
    assert.deepStrictEqual(await origem(r.ids[0]), { o: A.id, l: null, q: 1, caixa: 1 });
  });

  // ── T3 — os leitores da fila (RN-196.09) ──────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-196.09] fila e sugestao: outra requisicao ve A com 3 comprometidos (a parte de R1), nao 6 (a caixa) -> "Pegar em" A com 2 livres', async () => {
    const A = await loc('FA'); const C = await loc('FC'); const m = await material();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET localizacao_padrao_id = ? WHERE id = ?', [A.id, m.id]);
    await entrar(m.id, A.id, 5); await entrar(m.id, C.id, 10);
    const r1 = await req([[m.id, 6]]);
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]));
    await ok(separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 3 }]));
    const r2 = await req([[m.id, 2]]);
    const sug = await request(app).get(`/api/almoxarifado/requisicoes/${r2.id}/sugestao-coleta`);
    assert.strictEqual(sug.status, 200, JSON.stringify(sug.body));
    const p = sug.body.itens[0].pegar_em;
    assert.ok(p, JSON.stringify(sug.body));
    assert.deepStrictEqual([p.localizacao_id, p.quantidade_no_endereco, p.quantidade_sugerida, p.cobre], [A.id, 2, 2, true]);
    const fila = await request(app).get('/api/almoxarifado/fila-separacao');
    assert.strictEqual(fila.status, 200, JSON.stringify(fila.body));
    const linha = fila.body.find((x) => x.id === r2.id).itens[0];
    assert.deepStrictEqual([linha.pegar_em.localizacao_id, linha.pegar_em.quantidade_no_endereco], [A.id, 2]);
    // a propria R1 (origem A, parte 3, 0 a separar) — sem dica; o separado_pendente pela parte so serve ao "> 0" (NO-OP declarado)
  });


  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})();
