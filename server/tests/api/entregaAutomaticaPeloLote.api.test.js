/**
 * Etapa 197 (T0) — a parte AUTOMATICA da entrega de requisicao, em material com controle de lote, baixa do lote que vence primeiro
 * (FEFO), uma SAIDA por lote; o que os lotes elegiveis nao cobrem sai sem lote, como antes. O saldo de cada lote desconta a parte
 * guardada de outras caixas (RN-197.11, Fase 2 item 1) e o que esta em inspecao no lote (Fase 2 item 2).
 *
 * Cada cenario confere o livro da requisicao ([tipo, endereco, lote, quantidade] das SAIDAs/ENTRADAs) e o retrato das linhas de
 * saldo. Validades sempre RELATIVAS a hoje (a bomba-relogio de data da Fase 0). Usuarios reais por header (molde da 196 T5).
 * Plano: docs/superpowers/plans/2026-11-05-almoxarifado-etapa197-entrega-automatica-pelo-lote.md (T0).
 *
 * Executar: cd server && node tests/api/entregaAutomaticaPeloLote.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const stockService = require('../../services/almoxarifado/stockService');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 197', role: 'admin', is_superadmin: 1, email: 'a197@t.com' },
  S: { id: 19721, nome: 'Solic 197', role: 'user', email: 's197@t.com' },
  ALMOX: { id: 19722, nome: 'Almox 197', role: 'user', email: 'x197@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 197 (T0): a parte automatica da entrega pelo lote ===\n');

  // ── dividirPorLotes, pura ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const { dividirPorLotes } = requisitionService;
  await test('[T0 puro] dividirPorLotes: vazio, um lote cobre, dois lotes, sobra resto, 0,1 + 0,2, residuo 3e-7 vira zero fatias', async () => {
    assert.strictEqual(typeof dividirPorLotes, 'function', 'dividirPorLotes exportada');
    assert.deepStrictEqual(dividirPorLotes([], 5), { fatias: [], resto: 5 });
    assert.deepStrictEqual(dividirPorLotes([{ lote_id: 1, saldo: 10 }], 4), { fatias: [{ lote_id: 1, quantidade: 4 }], resto: 0 });
    assert.deepStrictEqual(dividirPorLotes([{ lote_id: 1, saldo: 2 }, { lote_id: 2, saldo: 9 }], 4),
      { fatias: [{ lote_id: 1, quantidade: 2 }, { lote_id: 2, quantidade: 2 }], resto: 0 });
    assert.deepStrictEqual(dividirPorLotes([{ lote_id: 1, saldo: 2 }], 5), { fatias: [{ lote_id: 1, quantidade: 2 }], resto: 3 });
    assert.deepStrictEqual(dividirPorLotes([{ lote_id: 1, saldo: 0.1 }, { lote_id: 2, saldo: 0.2 }], 0.3),
      { fatias: [{ lote_id: 1, quantidade: 0.1 }, { lote_id: 2, quantidade: 0.2 }], resto: 0 });
    assert.deepStrictEqual(dividirPorLotes([{ lote_id: 1, saldo: 3e-7 }], 2), { fatias: [], resto: 2 }, 'fatia de zero derrubaria a entrega');
    assert.deepStrictEqual(dividirPorLotes([{ lote_id: 1, saldo: 0.7 }, { lote_id: 2, saldo: 5 }], 0.9),
      { fatias: [{ lote_id: 1, quantidade: 0.7 }, { lote_id: 2, quantidade: 0.2 }], resto: 0 });
  });

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

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM197', nome: 'Almox 197' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const B01 = await loc('ZB-01'); const P01 = await loc('ZP-01');

  const material = async ({ lote = true, serie = false, negativo = false } = {}) => {
    const c = `E197-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, localizacao_padrao_id)
        VALUES (?, ?, 'PC', 0, 0, 1, 0, 0.1, ?, ?, ?, ?)`, [c, c, lote ? 1 : 0, serie ? 1 : 0, negativo ? 1 : 0, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, destino, q, lote, extra = {}) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id,
    tipo: 'ENTRADA', quantidade: q, motivo: 'e197', localizacao_destino_id: destino, ...(lote ? { lote } : {}), ...extra }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const validade = async (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?',
    [data, await loteId(m, codigo)]);
  const req = async (itens) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-197',
      itens: itens.map(([m, q]) => ({ material_id: m, quantidade: q })),
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    await ok(como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/aprovar`, {}));
    return { R: cr.body.id, ids };
  };
  // requisicao gravada direto (APROVADO, sem reserva) — para dois itens do mesmo material e o teste pelo servico
  const reqDireta = async (itens) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E197-${++seq}`])).lastID;
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
  const excluir = (R) => ok(como('ADMIN').del(`${API}/requisicoes/${R}`, { justificativa: 'e197' }));

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
  const livro = async (R, m) => (await dbAll(db, `SELECT mv.tipo, l.codigo as loc, lt.codigo as lote, mv.quantidade q
      FROM movimentacoes_almoxarifado mv LEFT JOIN localizacoes_almoxarifado l ON l.id = COALESCE(mv.localizacao_origem_id, mv.localizacao_destino_id)
      LEFT JOIN lotes_almoxarifado lt ON lt.id = mv.lote_id
      WHERE mv.requisicao_id = ? AND mv.material_id = ? AND mv.tipo IN ('SAIDA', 'ENTRADA', 'ENTRADA_DEVOLUCAO') ORDER BY mv.id`, [R, m.id]))
    .map((x) => [x.tipo, x.loc || null, x.lote || null, Number(x.q)]);
  const entregue = async (item) => Number((await dbGet(db, 'SELECT quantidade_entregue q FROM itens_requisicao_almoxarifado WHERE id = ?',
    [item])).q);

  // ── RN-197.01/06/10: o caso real ──────────────────────────────────────────────────────────────────────────────────────────────
  // L1 3 em ZB-01; requisicao de 6 (aprovada com 3: reserva 3); 1a rodada do par ZB-01/L1; chega L2 3 na padrao ZP-01; 2a rodada sem
  // "Sai de". Entrega de um clique 6: a parte da origem (3) estrita, o automatico (3) pelo lote.
  const casoReal = async () => {
    const m = await material();
    await entrar(m, B01.id, 3, 'L1');
    const { R, ids } = await req([[m.id, 6]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: B01.id, lote_id: await loteId(m, 'L1') }]);
    await entrar(m, P01.id, 3, 'L2');
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    const antes = await retrato(m);
    assert.deepStrictEqual(antes, { linhas: ['ZB-01/L1=3', 'ZP-01/L2=3'], fisico: 6 }, 'premissa');
    return { m, R, ids, antes };
  };

  await test('[RN-197.01/06] o caso real: livro ZB-01/L1 3 (estrita) + — /L2 3 (automatico pelo lote); L1 0, L2 0, nenhuma linha sem lote', async () => {
    const { m, R, ids } = await casoReal();
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 6 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'ZB-01', 'L1', 3], ['SAIDA', null, 'L2', 3]]);
    assert.deepStrictEqual(await retrato(m), { linhas: [], fisico: 0 });
  });

  await test('[RN-197.10] excluir devolve cada fatia ao seu lote (L1 3 em ZB-01, L2 3 na padrao), nenhuma linha sem lote', async () => {
    const { m, R, ids, antes } = await casoReal();
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 6 }]);
    await excluir(R);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'ZB-01', 'L1', 3], ['SAIDA', null, 'L2', 3],
      ['ENTRADA', 'ZB-01', 'L1', 3], ['ENTRADA', null, 'L2', 3]]);
    assert.deepStrictEqual(await retrato(m), antes);
  });

  await test('[RN-197.10] devolucao de 1 citando a SAIDA automatica de L2 -> ENTRADA_DEVOLUCAO com o lote L2', async () => {
    const { m, R, ids } = await casoReal();
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 6 }]);
    const l2 = await loteId(m, 'L2');
    const saida = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'SAIDA' AND lote_id = ?", [R, l2]);
    assert.ok(saida, 'premissa: a SAIDA de L2');
    const dv = await ok(como('ADMIN').post(`${API}/devolucoes`, { material_id: m.id, quantidade: 1, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE',
      movimentacao_saida_id: saida.id, localizacao_id: P01.id }), 201);
    const ent = await dbGet(db, "SELECT lote_id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ENTRADA_DEVOLUCAO' ORDER BY id DESC LIMIT 1",
      [m.id]);
    assert.strictEqual(ent.lote_id, l2, JSON.stringify(dv.body));
    assert.deepStrictEqual(await retrato(m), { linhas: ['ZP-01/L2=1'], fisico: 1 });
  });

  // ── RN-197.02: maior que um lote, FEFO e nao o codigo ─────────────────────────────────────────────────────────────────────────
  // L2 vence em +5 dias (2), L1 em +45 (9): o codigo daria L1 primeiro, o FEFO da L2.
  await test('[RN-197.02] automatico 4 com L2 2 (+5 dias) e L1 9 (+45): SAIDA L2 2 + SAIDA L1 2 (FEFO, nao o codigo); L2 0, L1 7; a reserva consumida', async () => {
    const m = await material();
    await entrar(m, B01.id, 2, 'L2'); await entrar(m, P01.id, 9, 'L1');
    await validade(m, 'L2', dia(5)); await validade(m, 'L1', dia(45));
    const { R, ids } = await req([[m.id, 4]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 4 }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 4 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, 'L2', 2], ['SAIDA', null, 'L1', 2]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['ZP-01/L1=7'], fisico: 7 });
    const mat = await dbGet(db, 'SELECT quantidade_reservada q FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    assert.strictEqual(Number(mat.q || 0), 0, 'a reserva saiu com as fatias');
  });

  // ── RN-197.03: lote nao elegivel nunca; o resto sem lote (Etapa 206: o resto que iria NEGATIVO recusa) ──────────────────────────────────────────────────────────────────────
  const naoElegivel = async (tornar, motivoEsperado) => {
    const m = await material();
    await entrar(m, B01.id, 2, 'L1'); await entrar(m, P01.id, 3, 'L2');
    // Etapa 205 (RN-205.08): com o lote ja impedido a separacao de 4 recusa (so 2 podem sair). O automatico da entrega so encontra lote
    // impedido quando o lote fica impedido DEPOIS de separar — o caso que chega a entrega (RN-205.10, item 7). Antes a ordem era
    // tornar -> separar, e a separacao aceitava os 4 (a recusa: loteImpedidoSeparacao.api.test.js, RN-205.08).
    const { R, ids } = await reqDireta([[m.id, 4]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 4 }]);
    await tornar(m);
    // Etapa 206 (RN-206.01/03, B1383): a entrega que tiraria do lote impedido RECUSA antes de baixar — antes saia L1 2 + sem lote 2
    // (a linha sem lote ficava -2 e L2 continuava 3: o C484). "Lote nao elegivel nunca sai" continua provado: L2 intacto.
    const antes = await retrato(m);
    assert.deepStrictEqual(antes, { linhas: ['ZB-01/L1=2', 'ZP-01/L2=3'], fisico: 5 }, 'premissa');
    const l2 = await dbGet(db, 'SELECT codigo, status, data_validade FROM lotes_almoxarifado WHERE id = ?', [await loteId(m, 'L2')]);
    const r = await entregar(R, [{ item_id: ids[0], quantidade_atendida: 4 }], 400);
    assert.strictEqual(r.body.error, requisitionService.fraseEntregaLoteImpedido(m.nome, 4, 'PC', 2,
      [{ codigo: 'L2', status: l2.status, data_validade: l2.data_validade, quantidade: 3 }]));
    assert.ok(r.body.error.includes(`L2 (${motivoEsperado}, 3 PC)`), r.body.error);
    assert.ok(r.body.error.includes('faltam 2 PC') && r.body.error.includes('entregue 2 PC a menos'), r.body.error);
    assert.deepStrictEqual(await livro(R, m), [], 'nada baixado');
    assert.deepStrictEqual(await retrato(m), antes);
    assert.strictEqual(await entregue(ids[0]), 0);
  };
  await test('[RN-197.03 -> RN-206.01] L1 2 elegivel, L2 3 BLOQUEADO, automatico 4 -> 400 nomeando L2 (bloqueado, 3 PC), nada baixado, L2 intacto, nenhuma linha sem lote', async () => {
    await naoElegivel(async (m) => dbRun(db, "UPDATE lotes_almoxarifado SET status = 'BLOQUEADO' WHERE id = ?", [await loteId(m, 'L2')]),
      'bloqueado');
  });
  await test('[RN-197.03 -> RN-206.03 a] o mesmo com L2 VENCIDO sem liberacao (validade de 3 dias atras) -> "vencido em DD/MM/AAAA"', async () => {
    const [a, mm, d] = dia(-3).split('-');
    await naoElegivel(async (m) => { await validade(m, 'L1', dia(30)); await validade(m, 'L2', dia(-3)); }, `vencido em ${d}/${mm}/${a}`);
  });
  await test('[RN-197.03, cenario 2] L2 vencido COM liberacao e L1 valido -> L2 sai primeiro (vence antes)', async () => {
    const m = await material();
    await entrar(m, B01.id, 3, 'L1'); await entrar(m, P01.id, 2, 'L2');
    await validade(m, 'L1', dia(30)); await validade(m, 'L2', dia(-3));
    await dbRun(db, 'UPDATE lotes_almoxarifado SET vencimento_liberado_em = CURRENT_TIMESTAMP WHERE id = ?', [await loteId(m, 'L2')]);
    const { R, ids } = await reqDireta([[m.id, 3]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, 'L2', 2], ['SAIDA', null, 'L1', 1]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['ZB-01/L1=2'], fisico: 2 });
  });

  // ── RN-197.04: sem controle de lote, nada muda ────────────────────────────────────────────────────────────────────────────────
  await test('[RN-197.04] material SEM controle_lote com saldo em lote: o automatico continua sem lote (B204): L1 3 intacto, sem lote -3', async () => {
    const m = await material({ lote: false });
    await entrar(m, B01.id, 3, 'L1');
    const { R, ids } = await req([[m.id, 3]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, null, 3]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['ZB-01/L1=3', 'ZP-01/-=-3'], fisico: 0 });
  });

  // ── RN-197.05: com serie, o lote vem das series ───────────────────────────────────────────────────────────────────────────────
  await test('[RN-197.05] material com lote e serie: series de L2 (L1 vence antes) -> uma SAIDA de L2 com as series, como antes', async () => {
    const m = await material({ serie: true });
    await entrar(m, B01.id, 2, 'L1', { series: ['S1A', 'S1B'] }); await entrar(m, P01.id, 2, 'L2', { series: ['S2A', 'S2B'] });
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    const { R, ids } = await reqDireta([[m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2 }]);
    const s = await dbAll(db, "SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero IN ('S2A', 'S2B') ORDER BY id", [m.id]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 2, serie_ids: s.map((x) => x.id) }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, 'L2', 2]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['ZB-01/L1=2'], fisico: 2 });
  });

  // ── RN-197.07: reserva parcial + excedente ────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-197.07] reserva 4 + excedente 2 que chegou depois, L1 3 e L2 3: excedente L1 2; reserva L1 1 + L2 3; reserva 4/4 e quantidade_reservada 0', async () => {
    const m = await material();
    await entrar(m, B01.id, 3, 'L1'); await entrar(m, P01.id, 1, 'L2');
    const { R, ids } = await req([[m.id, 6]]);
    const rz = await dbGet(db, "SELECT id, quantidade FROM reservas_material_almoxarifado WHERE item_requisicao_id = ? AND status = 'ATIVA'", [ids[0]]);
    assert.strictEqual(Number(rz.quantidade), 4, 'premissa: reserva parcial 4');
    await entrar(m, P01.id, 2, 'L2');
    await separar(R, [{ item_id: ids[0], quantidade_separada: 6 }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 6 }]);
    const saidas = await dbAll(db, `SELECT lt.codigo lote, mv.quantidade q, mv.reserva_id FROM movimentacoes_almoxarifado mv
      LEFT JOIN lotes_almoxarifado lt ON lt.id = mv.lote_id WHERE mv.requisicao_id = ? AND mv.tipo = 'SAIDA' ORDER BY mv.id`, [R]);
    assert.deepStrictEqual(saidas.map((x) => [x.lote, Number(x.q), x.reserva_id || null]),
      [['L1', 2, null], ['L1', 1, rz.id], ['L2', 3, rz.id]]);
    const rz2 = await dbGet(db, 'SELECT quantidade_utilizada u, status FROM reservas_material_almoxarifado WHERE id = ?', [rz.id]);
    assert.strictEqual(Number(rz2.u), 4, JSON.stringify(rz2));
    const mat = await dbGet(db, 'SELECT quantidade_reservada q FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    assert.strictEqual(Number(mat.q || 0), 0);
    assert.deepStrictEqual(await retrato(m), { linhas: [], fisico: 0 });
  });

  // ── RN-197.08: os lotes lidos na hora de cada fatia ───────────────────────────────────────────────────────────────────────────
  await test('[RN-197.08] dois itens do mesmo material, ambos automaticos, L1 3 e L2 3, 2 + 2 -> item 1: L1 2; item 2: L1 1 + L2 1', async () => {
    const m = await material();
    await entrar(m, B01.id, 3, 'L1'); await entrar(m, P01.id, 3, 'L2');
    const { R, ids } = await reqDireta([[m.id, 2], [m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2 }, { item_id: ids[1], quantidade_separada: 2 }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }, { item_id: ids[1], quantidade_atendida: 2 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, 'L1', 2], ['SAIDA', null, 'L1', 1], ['SAIDA', null, 'L2', 1]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['ZP-01/L2=2'], fisico: 2 });
    assert.deepStrictEqual([await entregue(ids[0]), await entregue(ids[1])], [2, 2]);
  });

  // ── RN-197.11 (Fase 2 item 1): a parte guardada de outra caixa nao e baixada pelo automatico ─────────────────────────────────
  const guardada = async ({ l1 }) => {
    const m = await material();
    await entrar(m, B01.id, l1, 'L1'); await entrar(m, P01.id, 9, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await separar(r1.R, [{ item_id: r1.ids[0], quantidade_separada: 4, localizacao_origem_id: B01.id, lote_id: await loteId(m, 'L1') }]);
    await separar(r2.R, [{ item_id: r2.ids[0], quantidade_separada: 4 }]);
    return { m, r1, r2 };
  };
  await test('[RN-197.11] R1 separou 4 de ZB-01/L1 (L1 4, vence antes); R2 automatico 4 entrega primeiro -> R2 tira L2 4; R1 entrega 200 de ZB-01/L1', async () => {
    const { m, r1, r2 } = await guardada({ l1: 4 });
    await entregar(r2.R, [{ item_id: r2.ids[0], quantidade_atendida: 4 }]);
    assert.deepStrictEqual(await livro(r2.R, m), [['SAIDA', null, 'L2', 4]]);
    await entregar(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 4 }]);
    assert.deepStrictEqual(await livro(r1.R, m), [['SAIDA', 'ZB-01', 'L1', 4]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['ZP-01/L2=5'], fisico: 5 });
  });
  await test('[RN-197.11] L1 6 com 4 guardados por R1: o automatico de R2 tira so os 2 livres de L1 e 2 de L2; R1 entrega 200', async () => {
    const { m, r1, r2 } = await guardada({ l1: 6 });
    await entregar(r2.R, [{ item_id: r2.ids[0], quantidade_atendida: 4 }]);
    assert.deepStrictEqual(await livro(r2.R, m), [['SAIDA', 'ZB-01', 'L1', 2], ['SAIDA', null, 'L2', 2]], 'Fase 5 M1: com parte guardada no lote, a fatia leva o endereco');
    await entregar(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 4 }]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['ZP-01/L2=7'], fisico: 7 });
  });

  await test('[RN-197.11, desta entrega] L1 5: a parte guardada do proprio item (3) ja saiu na passada 0 -> o automatico ve os 2 que sobram em L1 (nao desconta duas vezes): ZB-01/L1 3 + L1 2 + L2 1', async () => {
    const m = await material();
    await entrar(m, B01.id, 5, 'L1');
    const { R, ids } = await req([[m.id, 6]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: B01.id, lote_id: await loteId(m, 'L1') }]);
    await entrar(m, P01.id, 3, 'L2');
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 6 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'ZB-01', 'L1', 1], ['SAIDA', 'ZB-01', 'L1', 2],
      ['SAIDA', null, 'L1', 2], ['SAIDA', null, 'L2', 1]], 'a parte da origem (3) sai em dois pedacos (excedente 1 + reserva 2)');
    assert.deepStrictEqual(await retrato(m), { linhas: ['ZP-01/L2=2'], fisico: 2 });
  });

  // ── Fase 2 item 2 (T0.2): o que esta em inspecao no lote nao e baixado ────────────────────────────────────────────────────────
  await test('[T0.2] L1 3 (vence antes) com 2 em inspecao no lote, L2 5: automatico 3 -> L1 1 + L2 2', async () => {
    const m = await material();
    await entrar(m, B01.id, 3, 'L1'); await entrar(m, P01.id, 5, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    const rec = (await dbRun(db, "INSERT INTO recebimentos_material_almoxarifado (numero, status) VALUES (?, 'CONFERIDO')", [`REC-E197-${++seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida,
      lote_id, quantidade_em_inspecao) VALUES (?, ?, 3, 3, ?, 2)`, [rec, m.id, await loteId(m, 'L1')]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_inspecao = 2 WHERE id = ?', [m.id]);
    const { R, ids } = await reqDireta([[m.id, 3]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, 'L1', 1], ['SAIDA', null, 'L2', 2]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['ZB-01/L1=2', 'ZP-01/L2=3'], fisico: 5 });
  });

  // ── C466 (Fase 2 item 2, cenario A) -> RN-217.01 a (Etapa 217, MUDANCA DE REGRA registrada) ────────────────────────────────────
  // Ate a 216 este teste fixava a limitacao documentada: o R2 automatico tirava do L1 a peca da quarentena. Desde a 209 o BLOQUEIO da
  // devolucao grava o lote, e desde a 217 o automatico desconta o bloqueado do lote (B1439): o R2 sai do L2 e a peca fica no L1.
  await test('[RN-217.01 a, era C466 limitacao documentada] entrega automatica sai L1 3; devolucao de 1 para QUARENTENA citando a saida volta a L1 (BLOQUEIO com L1); R2 automatico 1 -> sai do L2, a peca da quarentena fica no L1', async () => {
    const m = await material();
    await entrar(m, B01.id, 3, 'L1'); await entrar(m, P01.id, 3, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    const r1 = await reqDireta([[m.id, 3]]);
    await separar(r1.R, [{ item_id: r1.ids[0], quantidade_separada: 3 }]);
    await entregar(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 3 }]);
    assert.deepStrictEqual(await livro(r1.R, m), [['SAIDA', null, 'L1', 3]]);
    const saida = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'SAIDA'", [r1.R]);
    await ok(como('ADMIN').post(`${API}/devolucoes`, { material_id: m.id, quantidade: 1, motivo: 'DEFEITO', destino: 'QUARENTENA',
      movimentacao_saida_id: saida.id, localizacao_id: B01.id }), 201);
    const mat = await dbGet(db, 'SELECT quantidade_bloqueada b FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    assert.strictEqual(Number(mat.b), 1, 'premissa: o bloqueio e do material');
    const bl = await dbGet(db, "SELECT lote_id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'BLOQUEIO'", [m.id]);
    assert.strictEqual(bl.lote_id, await loteId(m, 'L1'), 'premissa: o BLOQUEIO tem o lote (Etapa 209)');
    const r2 = await reqDireta([[m.id, 1]]);
    await separar(r2.R, [{ item_id: r2.ids[0], quantidade_separada: 1 }]);
    await entregar(r2.R, [{ item_id: r2.ids[0], quantidade_atendida: 1 }]);
    assert.deepStrictEqual(await livro(r2.R, m), [['SAIDA', null, 'L2', 1]], 'RN-217.01: o automatico nao tira a peca da quarentena');
    assert.deepStrictEqual(await retrato(m), { linhas: ['ZB-01/L1=1', 'ZP-01/L2=2'], fisico: 3 });
  });

  // ── Fase 2 item 6: negativo permitido ─────────────────────────────────────────────────────────────────────────────────────────
  await test('[Fase 2 item 6] material com lote e saldo negativo permitido: a fatia de L1 3 (em ZB-01) grava -3 em (padrao, L1) — o total do lote certo, ZB-01 nao drena (o motor de hoje)', async () => {
    const m = await material({ negativo: true });
    await entrar(m, B01.id, 3, 'L1');
    const { R, ids } = await reqDireta([[m.id, 3]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, 'L1', 3]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['ZB-01/L1=3', 'ZP-01/L1=-3'], fisico: 0 });
  });

  // ── RN-197.09 pelo servico: falha na 2a fatia ─────────────────────────────────────────────────────────────────────────────────
  await test('[RN-197.09 servico] automatico 4 em L1 2 + L2 2, o motor lanca na 2a chamada -> erro "<material>: motor caiu"; L1 0, L2 2, entregue 2, uma SAIDA', async () => {
    const m = await material();
    await entrar(m, B01.id, 2, 'L1'); await entrar(m, P01.id, 2, 'L2');
    const { R, ids } = await reqDireta([[m.id, 4]]);
    await requisitionService.separarRequisicao(db, R, [{ item_id: ids[0], quantidade_separada: 4 }], USERS.ADMIN);
    const original = stockService.registrarMovimentacao;
    let saidas = 0;
    stockService.registrarMovimentacao = async (...args) => {
      if (args[2] && args[2].tipo === 'SAIDA' && ++saidas === 2) throw Object.assign(new Error('motor caiu'), { status: 500 });
      return original(...args);
    };
    try {
      await requisitionService.entregarRequisicao(db, R, [{ item_id: ids[0], quantidade_atendida: 4 }], USERS.ADMIN)
        .then(() => { throw new Error('a falha do motor nao subiu'); }, (e) => assert.strictEqual(e.message, `${m.nome}: motor caiu`));
    } finally {
      stockService.registrarMovimentacao = original;
    }
    assert.strictEqual(saidas, 2, 'premissa: duas chamadas de SAIDA');
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, 'L1', 2]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['ZP-01/L2=2'], fisico: 2 });
    assert.strictEqual(await entregue(ids[0]), 2);
  });

  // ── Fase 5 M1 (B1329): a parte guardada de outra caixa no nivel do ENDERECO ─────────────────────────────────────────────────────
  // O desconto por lote (Fase 2 item 1) nao basta quando o lote tem saldo em dois enderecos: o claim do lote drena a padrao e depois a
  // maior linha — justo a guardada. A fatia vai ao motor com o endereco (origem estrita) quando o lote tem parte guardada.
  const C01 = await loc('ZC-01');
  const enderecoGuardado = async ({ lote = true, guardadoEm, outros }) => {
    const m = await material({ lote });
    await entrar(m, guardadoEm.id, 4, 'L1');
    for (const [l, q] of outros) await entrar(m, l.id, q, 'L1'); // eslint-disable-line no-await-in-loop
    return { m, r1: await req([[m.id, 4]]) };
  };
  const doisEnderecos = async (opts, r2q) => {
    const { m, r1 } = await enderecoGuardado(opts);
    const r2 = await req([[m.id, r2q]]);
    await separar(r1.R, [{ item_id: r1.ids[0], quantidade_separada: 4, localizacao_origem_id: opts.guardadoEm.id,
      lote_id: await loteId(m, 'L1') }]);
    await separar(r2.R, [{ item_id: r2.ids[0], quantidade_separada: r2q }]);
    await entregar(r2.R, [{ item_id: r2.ids[0], quantidade_atendida: r2q }]);
    return { m, r1, r2 };
  };
  await test('[Fase 5 M1, S1] L1 4 em ZB-01 (guardados por R1) e 2 em ZC-01; R2 automatico 2 -> sai de ZC-01; R1 entrega 200 de ZB-01', async () => {
    const { m, r1, r2 } = await doisEnderecos({ guardadoEm: B01, outros: [[C01, 2]] }, 2);
    await entregar(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 4 }]);
    assert.deepStrictEqual(await livro(r2.R, m), [['SAIDA', 'ZC-01', 'L1', 2]]);
    assert.deepStrictEqual(await livro(r1.R, m), [['SAIDA', 'ZB-01', 'L1', 4]]);
    assert.deepStrictEqual(await retrato(m), { linhas: [], fisico: 0 });
  });
  await test('[Fase 5 M1, S5] a parte guardada na PADRAO ZP-01 (4) e L1 3 em ZC-01; R2 automatico 2 -> sai de ZC-01; R1 entrega 200 de ZP-01', async () => {
    const { m, r1, r2 } = await doisEnderecos({ guardadoEm: P01, outros: [[C01, 3]] }, 2);
    await entregar(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 4 }]);
    assert.deepStrictEqual(await livro(r2.R, m), [['SAIDA', 'ZC-01', 'L1', 2]]);
    assert.deepStrictEqual(await livro(r1.R, m), [['SAIDA', 'ZP-01', 'L1', 4]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['ZC-01/L1=1'], fisico: 1 });
  });
  await test('[Fase 5 M1, S6 controle] o S1 com material SEM controle_lote: R2 sai sem lote e R1 entrega 200 (o que a 197 nao pode quebrar)', async () => {
    const { m, r1, r2 } = await doisEnderecos({ lote: false, guardadoEm: B01, outros: [[C01, 2]] }, 2);
    assert.deepStrictEqual(await livro(r2.R, m), [['SAIDA', null, null, 2]]);
    await entregar(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 4 }]);
    assert.deepStrictEqual(await livro(r1.R, m), [['SAIDA', 'ZB-01', 'L1', 4]]);
  });
  await test('[Fase 5 M1] a fatia atravessa dois enderecos do mesmo lote: L1 2 na padrao ZP-01, 4 guardados em ZB-01, 3 em ZC-01; R2 automatico 4 -> ZP-01 L1 2 + ZC-01 L1 2; R1 200', async () => {
    const { m, r1, r2 } = await doisEnderecos({ guardadoEm: B01, outros: [[P01, 2], [C01, 3]] }, 4);
    assert.deepStrictEqual(await livro(r2.R, m), [['SAIDA', 'ZP-01', 'L1', 2], ['SAIDA', 'ZC-01', 'L1', 2]]);
    await entregar(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 4 }]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['ZC-01/L1=1'], fisico: 1 });
  });

  await test('[Fase 5 M1, endereco bloqueado] L1 4 guardados em ZB-01, 3 em ZD-01 BLOQUEADA e 2 em ZC-01; R2 automatico 2 -> pula a bloqueada (o motor recusaria a origem) e sai de ZC-01; 200', async () => {
    const D01 = (await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'ZD-01'")) || await loc('ZD-01');
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 0 WHERE id = ?', [D01.id]);
    const { m, r1 } = await enderecoGuardado({ guardadoEm: B01, outros: [[D01, 3], [C01, 2]] });
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id = ?', [D01.id]);
    try {
      const r2 = await req([[m.id, 2]]);
      await separar(r1.R, [{ item_id: r1.ids[0], quantidade_separada: 4, localizacao_origem_id: B01.id, lote_id: await loteId(m, 'L1') }]);
      await separar(r2.R, [{ item_id: r2.ids[0], quantidade_separada: 2 }]);
      await entregar(r2.R, [{ item_id: r2.ids[0], quantidade_atendida: 2 }]);
      assert.deepStrictEqual(await livro(r2.R, m), [['SAIDA', 'ZC-01', 'L1', 2]]);
    } finally {
      await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 0 WHERE id = ?', [D01.id]);
    }
  });

  // ── Fase 5 M2: o resto sem lote leva a reserva ─────────────────────────────────────────────────────────────────────────────────
  // Etapa 206 (B1385): o resto sem lote que sai e o do saldo sem lote POSITIVO (estoque de antes de ligar o controle, montado por SQL) —
  // o resto que iria NEGATIVO com o saldo em lote impedido recusa (RN-206.01; o cenario de antes, L2 3 BLOQUEADO, ficou como o segundo
  // teste abaixo: 400, a reserva intacta).
  await test('[Fase 5 M2] aprovada (reserva 4), L1 1 elegivel e sem lote +3 (legado): SAIDA L1 1 + sem lote 3, as duas com a reserva; reserva 4/4; reservado 0', async () => {
    const m = await material();
    await entrar(m, B01.id, 1, 'L1');
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade) VALUES (?, ?, NULL, 3)', [m.id, P01.id]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = quantidade_atual + 3 WHERE id = ?', [m.id]);
    const { R, ids } = await req([[m.id, 4]]);
    const rz = await dbGet(db, "SELECT id, quantidade FROM reservas_material_almoxarifado WHERE item_requisicao_id = ? AND status = 'ATIVA'", [ids[0]]);
    assert.strictEqual(Number(rz.quantidade), 4, 'premissa: reserva 4');
    await separar(R, [{ item_id: ids[0], quantidade_separada: 4 }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 4 }]);
    assert.deepStrictEqual(await retrato(m), { linhas: [], fisico: 0 }, 'o sem lote positivo saiu e nao ficou negativo');
    const saidas = await dbAll(db, `SELECT lt.codigo lote, mv.quantidade q, mv.reserva_id FROM movimentacoes_almoxarifado mv
      LEFT JOIN lotes_almoxarifado lt ON lt.id = mv.lote_id WHERE mv.requisicao_id = ? AND mv.tipo = 'SAIDA' ORDER BY mv.id`, [R]);
    assert.deepStrictEqual(saidas.map((x) => [x.lote, Number(x.q), x.reserva_id || null]), [['L1', 1, rz.id], [null, 3, rz.id]]);
    const rz2 = await dbGet(db, 'SELECT quantidade_utilizada u FROM reservas_material_almoxarifado WHERE id = ?', [rz.id]);
    assert.strictEqual(Number(rz2.u), 4);
    const mat = await dbGet(db, 'SELECT quantidade_reservada q FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    assert.strictEqual(Number(mat.q || 0), 0);
  });
  await test('[Fase 5 M2 -> RN-206.01] aprovada (reserva 4), L1 1 elegivel e L2 3 BLOQUEADO depois: 400 "faltam 3", nada baixado, reserva 4 ATIVA sem uso', async () => {
    const m = await material();
    await entrar(m, B01.id, 1, 'L1'); await entrar(m, P01.id, 3, 'L2');
    const { R, ids } = await req([[m.id, 4]]);
    const rz = await dbGet(db, "SELECT id, quantidade FROM reservas_material_almoxarifado WHERE item_requisicao_id = ? AND status = 'ATIVA'", [ids[0]]);
    assert.strictEqual(Number(rz.quantidade), 4, 'premissa: reserva 4');
    await dbRun(db, "UPDATE lotes_almoxarifado SET status = 'BLOQUEADO' WHERE id = ?", [await loteId(m, 'L2')]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 4 }]);
    const r = await entregar(R, [{ item_id: ids[0], quantidade_atendida: 4 }], 400);
    assert.strictEqual(r.body.error, requisitionService.fraseEntregaLoteImpedido(m.nome, 4, 'PC', 3,
      [{ codigo: 'L2', status: 'BLOQUEADO', data_validade: null, quantidade: 3 }]));
    assert.deepStrictEqual(await livro(R, m), []);
    const rz2 = await dbGet(db, 'SELECT status, COALESCE(quantidade_utilizada, 0) u FROM reservas_material_almoxarifado WHERE id = ?', [rz.id]);
    assert.deepStrictEqual([rz2.status, Number(rz2.u)], ['ATIVA', 0]);
  });

  // ── Fase 5 M3: a parte guardada de requisicao EXCLUIDA nao conta ──────────────────────────────────────────────────────────────
  // Etapa 203 (C467, B1362): a exclusao passou a limpar a origem — pela rota a origem some; o filtro da excluida (a parte guardada de
  // excluida nao conta) e provado pela versao por SQL (a excluida de antes da 203, com a origem gravada, B1361).
  const m3 = async (excluirComo) => {
    const m = await material();
    await entrar(m, B01.id, 4, 'L1'); await entrar(m, P01.id, 9, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    const r1 = await req([[m.id, 4]]);
    await separar(r1.R, [{ item_id: r1.ids[0], quantidade_separada: 4, localizacao_origem_id: B01.id, lote_id: await loteId(m, 'L1') }]);
    await excluirComo(r1.R);
    const it = await dbGet(db, `SELECT ir.origem_separacao_id o, r.status, r.ativo FROM itens_requisicao_almoxarifado ir
      JOIN requisicoes_almoxarifado r ON r.id = ir.requisicao_id WHERE ir.id = ?`, [r1.ids[0]]);
    const r2 = await req([[m.id, 4]]);
    await separar(r2.R, [{ item_id: r2.ids[0], quantidade_separada: 4 }]);
    await entregar(r2.R, [{ item_id: r2.ids[0], quantidade_atendida: 4 }]);
    assert.deepStrictEqual(await livro(r2.R, m), [['SAIDA', null, 'L1', 4]]);
    return it;
  };
  await test('[Fase 5 M3 -> RN-203.06] R1 separa 4 de ZB-01/L1 e e excluida (a origem e limpa); R2 automatico 4 tira L1 4 (vence antes)', async () => {
    const it = await m3(excluir);
    assert.ok(it.o === null && Number(it.ativo) === 0 && it.status === 'CANCELADO', `a exclusao limpa a origem (Etapa 203) ${JSON.stringify(it)}`);
  });
  await test('[Fase 5 M3 legada, por SQL, RN-203.06] excluida de antes da 203 (ativo 0, CANCELADO, a origem gravada): R2 automatico 4 tira L1 4', async () => {
    const it = await m3((R) => dbRun(db, "UPDATE requisicoes_almoxarifado SET ativo = 0, status = 'CANCELADO' WHERE id = ?", [R]));
    assert.ok(it.o && Number(it.ativo) === 0, `premissa: a origem guardada fica na excluida legada ${JSON.stringify(it)}`);
  });

  // ── Fase 5 M4: a inspecao desconta do lote dela ───────────────────────────────────────────────────────────────────────────────
  await test('[Fase 5 M4] L1 3 (vence antes), L2 3 com 2 em inspecao NO L2: automatico 4 -> L1 3 + L2 1', async () => {
    const m = await material();
    await entrar(m, B01.id, 3, 'L1'); await entrar(m, P01.id, 3, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    const rec = (await dbRun(db, "INSERT INTO recebimentos_material_almoxarifado (numero, status) VALUES (?, 'CONFERIDO')", [`REC-E197-${++seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida,
      lote_id, quantidade_em_inspecao) VALUES (?, ?, 3, 3, ?, 2)`, [rec, m.id, await loteId(m, 'L2')]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_inspecao = 2 WHERE id = ?', [m.id]);
    const { R, ids } = await reqDireta([[m.id, 4]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 4 }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 4 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, 'L1', 3], ['SAIDA', null, 'L2', 1]]);
  });

  // ── Fase 5 M5: lote sem validade por ultimo ───────────────────────────────────────────────────────────────────────────────────
  await test('[Fase 5 M5] LA sem validade e LB com validade (+30): automatico 2 -> LB 2 (sem validade por ultimo)', async () => {
    const m = await material();
    await entrar(m, B01.id, 3, 'LA'); await entrar(m, P01.id, 3, 'LB');
    await validade(m, 'LB', dia(30));
    const { R, ids } = await reqDireta([[m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2 }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, 'LB', 2]]);
  });

  // ── Fase 5, 2o fix-round: a parte guardada da PROPRIA requisicao nao desconta do automatico dela (ela cai no finally) ────────────
  // R1 (aprovada, reserva 4) separa 4 de ZB-01/L1; uma saida avulsa tira 1 de ZB-01 (a planejada nao serve mais); ha L1 2 em ZC-01.
  // R1 entrega 4 com origem_automatica. Antes: SAIDA ZC-01/L1 2 + SAIDA sem lote 2 -> ZP-01/- = -2 (permite_saldo_negativo = 0) e
  // ZB-01/L1 3 sobrando — a parte de R1 contava contra a propria entrega de R1.
  const casoPropria = async (lote) => {
    const m = await material({ lote });
    await entrar(m, B01.id, 4, lote ? 'L1' : null); await entrar(m, C01.id, 2, lote ? 'L1' : null);
    const { R, ids } = await req([[m.id, 4]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 4, localizacao_origem_id: B01.id,
      ...(lote ? { lote_id: await loteId(m, 'L1') } : {}) }]);
    await ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'SAIDA', quantidade: 1, motivo: 'e197',
      justificativa: 'saida avulsa e197', localizacao_origem_id: B01.id, ...(lote ? { lote_id: await loteId(m, 'L1') } : {}) }), 201);
    assert.deepStrictEqual(await retrato(m), { linhas: [`ZB-01/${lote ? 'L1' : '-'}=3`, `ZC-01/${lote ? 'L1' : '-'}=2`], fisico: 5 }, 'premissa');
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 4, origem_automatica: true }]);
    return { m, R, ids };
  };
  await test('[Fase 5, propria parte] R1 guardou 4 em ZB-01/L1, avulsa tira 1, L1 2 em ZC-01; R1 automatico 4 -> sai tudo de L1, nenhuma linha negativa, nenhuma sem lote', async () => {
    const { m, R } = await casoPropria(true);
    const lv = await livro(R, m);
    assert.ok(lv.every(([t, , lt]) => t === 'SAIDA' && lt === 'L1'), `so SAIDA de L1: ${JSON.stringify(lv)}`);
    assert.strictEqual(lv.reduce((s2, x) => s2 + x[3], 0), 4, JSON.stringify(lv));
    const rt = await retrato(m);
    assert.strictEqual(rt.fisico, 1);
    assert.strictEqual(rt.linhas.length, 1, JSON.stringify(rt));
    assert.ok(/^Z[BC]-01\/L1=1$/.test(rt.linhas[0]), `sobra 1 em L1 num endereco: ${JSON.stringify(rt)}`);
  });
  await test('[Fase 5, propria parte, controle] o mesmo com material SEM controle_lote: SAIDA 4, ZC-01 = 1, sem negativa', async () => {
    const { m, R } = await casoPropria(false);
    assert.deepStrictEqual(await retrato(m), { linhas: ['ZC-01/-=1'], fisico: 1 });
    assert.strictEqual((await livro(R, m)).reduce((s2, x) => s2 + x[3], 0), 4);
  });
  await test('[Fase 5, propria parte, misto] dois itens do mesmo material guardaram 2 + 2 em ZB-01/L1: o 1o sai da planejada, o 2o automatico -> L1 4 inteiro, nenhuma sem lote', async () => {
    const m = await material();
    await entrar(m, B01.id, 4, 'L1');
    const { R, ids } = await reqDireta([[m.id, 2], [m.id, 2]]);
    const l1 = await loteId(m, 'L1');
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: B01.id, lote_id: l1 },
      { item_id: ids[1], quantidade_separada: 2, localizacao_origem_id: B01.id, lote_id: l1 }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }, { item_id: ids[1], quantidade_atendida: 2, origem_automatica: true }]);
    const lv = await livro(R, m);
    assert.ok(lv.every(([t, , lt]) => t === 'SAIDA' && lt === 'L1'), `so SAIDA de L1: ${JSON.stringify(lv)}`);
    assert.deepStrictEqual(await retrato(m), { linhas: [], fisico: 0 });
  });
  await test('[Fase 5, propria parte, parcial] R1 guardou 4 em ZB-01/L1, L1 3 em ZC-01; R1 automatico 2 (a parte que fica e 2) -> sai de L1; R1 entrega o resto 200 da planejada', async () => {
    const m = await material();
    await entrar(m, B01.id, 4, 'L1'); await entrar(m, C01.id, 3, 'L1');
    const { R, ids } = await reqDireta([[m.id, 4]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 4, localizacao_origem_id: B01.id, lote_id: await loteId(m, 'L1') }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 2, origem_automatica: true }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }]);
    const lv = await livro(R, m);
    assert.ok(lv.every(([t, , lt]) => t === 'SAIDA' && lt === 'L1'), JSON.stringify(lv));
    const rt = await retrato(m);
    assert.strictEqual(rt.fisico, 3); assert.ok(rt.linhas.every((x) => !x.includes('/-=') && Number(x.split('=')[1]) > 0), JSON.stringify(rt));
  });

  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
