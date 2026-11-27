/**
 * Etapa 267 (T1, C471, B1341, B1633) — a entrega com SO O LOTE (lote_id sem localizacao_origem_id) respeita a parte que outra requisicao
 * separou numa prateleira do lote. Antes o so lote ia ao motor sem endereco e o claim do lote drenava a padrao e depois a maior linha — a
 * guardada de R1 —, e a entrega de R1 tomava 400 depois (Fase 0: R2 entregou 2 so L1 e saiu de XB-01, onde R1 guardou 4).
 * Agora (RN-267.10/11): o lote que nao cobre depois da guarda e recusado antes de qualquer baixa com a frase da 218; o que cobre sai pelas
 * prateleiras livres, uma SAIDA por prateleira com o endereco. Sem guarda, ou sem prateleira usavel que cubra, ou com serie: como hoje.
 *
 * Usuarios reais por header (molde da entregaSaiDeRespeitaSeparado): S sem perfil cria; ADMIN aprova e da entrada; ALMOX separa e entrega.
 * Plano: docs/superpowers/plans/2026-11-26-almoxarifado-etapa267-sai-de-atualizado-e-entrega-so-com-lote.md
 *
 * Executar: cd server && node tests/api/entregaSoLoteRespeitaSeparado.api.test.js
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
  ADMIN: { id: 1, nome: 'Adm 267', role: 'admin', is_superadmin: 1, email: 'a267@t.com' },
  S: { id: 26701, nome: 'Solic 267', role: 'user', email: 's267@t.com' },
  ALMOX: { id: 26702, nome: 'Almox 267', role: 'user', email: 'x267@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 267: entrega so com o lote respeita o separado de outras ===\n');
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

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM267', nome: 'Almox 267' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const B01 = await loc('XB-01'); const P01 = await loc('XP-01');

  const material = async () => {
    const c = `E267-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, localizacao_padrao_id) VALUES (?, ?, 'PC', 0, 0, 1, 0, 0.1, 1, ?)`,
    [c, c, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, destino, q, lote) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e267',
      localizacao_destino_id: destino, lote });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const validade = (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE material_id = ? AND codigo = ?',
    [data, m.id, codigo]);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const req = async (itens) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-267',
      itens: itens.map(([mid, q]) => ({ material_id: mid, quantidade: q })),
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    const ap = await como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/aprovar`, {});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    return { R: cr.body.id, ids };
  };
  const separar = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/separar`, { itens_separados: linhas });
  const separacao = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: linhas });
  const entregar = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: linhas });
  const numero = async (R) => (await dbGet(db, 'SELECT numero FROM requisicoes_almoxarifado WHERE id = ?', [R])).numero;
  const statusDe = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status;
  const itemDe = (id) => dbGet(db, `SELECT quantidade_separada, quantidade_entregue, quantidade_atendida, origem_separacao_id,
    lote_separacao_id, quantidade_origem_separacao FROM itens_requisicao_almoxarifado WHERE id = ?`, [id]);
  const saldoDe = async (m, locId, lid) => {
    const s = await dbGet(db, 'SELECT COALESCE(SUM(quantidade), 0) as q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ? AND lote_id IS ?',
      [m.id, locId, lid]);
    return Number(s.q);
  };
  const semLoteNaoZero = async (m) => (await dbAll(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id IS NULL',
    [m.id])).filter((x) => Math.abs(Number(x.quantidade)) > 1e-9);
  const trocas = (R) => dbAll(db, 'SELECT id FROM substituicoes_origem_requisicao WHERE requisicao_id = ?', [R]);
  const nMov = async (m) => Number((await dbGet(db, 'SELECT COUNT(*) as n FROM movimentacoes_almoxarifado WHERE material_id = ?', [m.id])).n);

  const doPar = (item, q, L1, locId = B01.id) => ({ item_id: item, quantidade_separada: q, localizacao_origem_id: locId, lote_id: L1 });
  const auto = (item, q) => ({ item_id: item, quantidade_separada: q });
  const saiDe = (item, q, L1, locId = B01.id) => ({ item_id: item, quantidade_atendida: q, localizacao_origem_id: locId, lote_id: L1 });
  const sepOk = async (R, linhas) => { const r = await separar(R, linhas); assert.strictEqual(r.status, 200, JSON.stringify(r.body)); };
  const entOk = async (R, linhas) => { const r = await entregar(R, linhas); assert.strictEqual(r.status, 200, JSON.stringify(r.body)); };
  const B02 = await loc('XB-02'); const B03 = await loc('XB-03');
  const ALMOX = { ...USERS.ALMOX };
  // L1: XB-01 4 + XB-02 2 (+ XB-03 n); L2 9 na padrao XP-01 (o outro lote). R1 guarda 4 em XB-01/L1; R2 separa no automatico.
  const base = async ({ b03 = 0, qR2 = 2 } = {}) => {
    const m = await material();
    await entrar(m, B01.id, 4, 'L1'); await entrar(m, B02.id, 2, 'L1');
    if (b03) await entrar(m, B03.id, b03, 'L1');
    await entrar(m, P01.id, 9, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    return { m, L1: await loteId(m, 'L1'), L2: await loteId(m, 'L2'), qR2 };
  };
  const comR1 = async (opts) => {
    const c = await base(opts);
    const r1 = await req([[c.m.id, 4]]); const r2 = await req([[c.m.id, c.qR2]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, c.L1)]);
    await sepOk(r2.R, [auto(r2.ids[0], c.qR2)]);
    return { ...c, r1, r2 };
  };
  const soLote = (item, q, L) => ({ item_id: item, quantidade_atendida: q, lote_id: L });
  const saidas = async (m, R) => (await dbAll(db, `SELECT quantidade, localizacao_origem_id as loc, lote_id as lote
    FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA' AND requisicao_id = ? ORDER BY id`, [m.id, R]))
    .map((x) => [Number(x.quantidade), x.loc, x.lote]);
  const fotoL1 = async (m, r, L1) => ({ st: await statusDe(r.R), itens: await Promise.all(r.ids.map(itemDe)),
    b1: await saldoDe(m, B01.id, L1), b2: await saldoDe(m, B02.id, L1), b3: await saldoDe(m, B03.id, L1), mov: await nMov(m),
    trocas: (await trocas(r.R)).length });
  const fraseLote = (m, { saldo, pode, guardado, ja = 0, qty }) => `${m.nome}: no lote L1 há ${saldo} PC, mas só ${pode} `
    + `${pode > 0 && pode < 2 ? 'pode' : 'podem'} sair nesta entrega: ${guardado} PC já separadas dele para outras requisições ou outras peças desta`
    + `${ja ? `; ${ja} PC já ${ja < 2 ? 'pedida' : 'pedidas'} nesta entrega` : ''}; não cobre a quantidade (${qty}). `
    + 'Escolha outro lote ou deixe "Qualquer endereço (automático)"';

  const fraseLivre = (m, { pode, qty }) => `${m.nome}: no lote L1 só ${pode} ${pode > 0 && pode < 2 ? 'pode' : 'podem'} sair de prateleira livre `
    + 'nesta entrega — o resto do lote está separado para outras requisições ou outras peças desta, em prateleira bloqueada ou sem endereço; '
    + `não cobre a quantidade (${qty}). Escolha a prateleira no "Sai de" ou deixe "Qualquer endereço (automático)"`;

  // ---------------------------------------------------------------- RN-267.10
  await test('[RN-267.10 rota] R1 guardou 4 em XB-01/L1; R2 entrega 2 so L1 -> 200 de XB-02 (XB-01 fica 4); R1 entrega pelo par -> 200', async () => {
    const { m, L1, r1, r2 } = await comR1();
    await entOk(r2.R, [soLote(r2.ids[0], 2, L1)]);
    assert.strictEqual(await saldoDe(m, B01.id, L1), 4, 'a guarda de R1 ficou');
    assert.strictEqual(await saldoDe(m, B02.id, L1), 0);
    assert.deepStrictEqual(await saidas(m, r2.R), [[2, B02.id, L1]], 'uma SAIDA, com o endereco');
    await entOk(r1.R, [saiDe(r1.ids[0], 4, L1)]);
    assert.strictEqual(await saldoDe(m, B01.id, L1), 0);
  });

  await test('[RN-267.10 ordem] XB-02 2 e XB-03 3 livres; R2 entrega 4 so L1 -> XB-03 3 (a maior) + XB-02 1, duas SAIDAS', async () => {
    const { m, L1, r2 } = await comR1({ b03: 3, qR2: 4 });
    await entOk(r2.R, [soLote(r2.ids[0], 4, L1)]);
    assert.deepStrictEqual(await saidas(m, r2.R), [[3, B03.id, L1], [1, B02.id, L1]]);
    assert.strictEqual(await saldoDe(m, B01.id, L1), 4);
    assert.strictEqual(Number((await itemDe(r2.ids[0])).quantidade_entregue), 4);
  });

  await test('[RN-267.10 propria] R2 separou 2 de XB-02/L1 e entrega 2 so L1 (troca) -> 200 de XB-02; R1 entrega -> 200', async () => {
    const { m, L1 } = await base();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 2]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    await sepOk(r2.R, [doPar(r2.ids[0], 2, L1, B02.id)]);
    await entOk(r2.R, [soLote(r2.ids[0], 2, L1)]);
    assert.deepStrictEqual(await saidas(m, r2.R), [[2, B02.id, L1]]);
    await entOk(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 4 }]);
    assert.strictEqual(await saldoDe(m, B01.id, L1), 0);
  });

  // ---------------------------------------------------------------- RN-267.11
  await test('[RN-267.11] R2 entrega 4 so L1 (6 no lote, 4 guardadas) -> 400 com a frase da 218, nada gravado', async () => {
    const { m, L1, r2 } = await comR1({ qR2: 4 });
    const antes = await fotoL1(m, r2, L1);
    const b = await entregar(r2.R, [soLote(r2.ids[0], 4, L1)]);
    assert.strictEqual(b.status, 400, JSON.stringify(b.body));
    assert.strictEqual(b.body.error, fraseLote(m, { saldo: 6, pode: 2, guardado: 4, qty: 4 }));
    assert.deepStrictEqual(await fotoL1(m, r2, L1), antes, 'nada gravado');
  });

  await test('[RN-267.11 ja pedido] item 1 "Sai de" XB-02/L1 1 e item 2 so L1 2 -> 400 com "1 PC já pedida nesta entrega", nada gravado', async () => {
    const { m, L1 } = await base();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 1], [m.id, 2]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    await sepOk(r2.R, [auto(r2.ids[0], 1), auto(r2.ids[1], 2)]);
    const antes = await fotoL1(m, r2, L1);
    const b = await entregar(r2.R, [saiDe(r2.ids[0], 1, L1, B02.id), soLote(r2.ids[1], 2, L1)]);
    assert.strictEqual(b.status, 400, JSON.stringify(b.body));
    assert.strictEqual(b.body.error, fraseLote(m, { saldo: 6, pode: 1, guardado: 4, ja: 1, qty: 2 }));
    assert.deepStrictEqual(await fotoL1(m, r2, L1), antes, 'nada gravado');
  });

  // ---------------------------------------------------------------- RN-267.12 / 13
  await test('[RN-267.12] lote sem guarda: R2 entrega 2 so L1 -> como hoje (uma SAIDA sem endereco, o motor tira da maior: XB-01)', async () => {
    const { m, L1 } = await base();
    const r2 = await req([[m.id, 2]]);
    await sepOk(r2.R, [auto(r2.ids[0], 2)]);
    await entOk(r2.R, [soLote(r2.ids[0], 2, L1)]);
    assert.deepStrictEqual(await saidas(m, r2.R), [[2, null, L1]]);
    assert.strictEqual(await saldoDe(m, B01.id, L1), 2);
    assert.strictEqual(await saldoDe(m, B02.id, L1), 2);
  });

  // Fase 2 da 267: a versao do plano era "como hoje" (200, o motor tirava de XB-01 — a guarda de R1); a conferencia do lote passava (6 - 4 = 2)
  // e a baixa nao tinha prateleira livre. Agora a conferencia le a mesma conta da baixa e recusa antes.
  await test('[RN-267.13] o livre do lote esta em prateleira bloqueada (XB-02) -> 400 "so 0 podem sair de prateleira livre", nada gravado', async () => {
    const { m, L1, r2 } = await comR1();
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id = ?', [B02.id]);
    try {
      const antes = await fotoL1(m, r2, L1);
      const b = await entregar(r2.R, [soLote(r2.ids[0], 2, L1)]);
      assert.strictEqual(b.status, 400, JSON.stringify(b.body));
      assert.strictEqual(b.body.error, fraseLivre(m, { pode: 0, qty: 2 }));
      assert.deepStrictEqual(await fotoL1(m, r2, L1), antes, 'nada gravado');
    } finally {
      await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 0 WHERE id = ?', [B02.id]);
    }
  });

  await test('[RN-267.13 parte que fica] R2 guardou 2 em XB-01/L1 e tem 2 sem origem; R1 guardou 2 em XB-02/L1 (3); R2 so L1 2 -> 400 "so 1 pode"', async () => {
    // a troca e 0 (a entrega de outro par consome primeiro a parte sem origem): a guarda de R2 em XB-01 fica inteira. A do lote passa
    // (5 - 2 = 3, a parte do proprio item fora — B1446); as prateleiras livres: XB-01 0 + XB-02 1. Antes da Fase 2 o motor levava a de R1.
    const m = await material();
    await entrar(m, B01.id, 2, 'L1'); await entrar(m, B02.id, 3, 'L1'); await entrar(m, P01.id, 9, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    const L1 = await loteId(m, 'L1');
    const r1 = await req([[m.id, 2]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 2, L1, B02.id)]);
    await sepOk(r2.R, [doPar(r2.ids[0], 2, L1)]);
    await sepOk(r2.R, [auto(r2.ids[0], 2)]);
    const it = await itemDe(r2.ids[0]);
    assert.deepStrictEqual([Number(it.quantidade_separada), it.origem_separacao_id, Number(it.quantidade_origem_separacao)], [4, B01.id, 2],
      'premissa: caixa 4, parte 2 em XB-01');
    const antes = await fotoL1(m, r2, L1);
    const b = await entregar(r2.R, [soLote(r2.ids[0], 2, L1)]);
    assert.strictEqual(b.status, 400, JSON.stringify(b.body));
    assert.strictEqual(b.body.error, fraseLivre(m, { pode: 1, qty: 2 }));
    assert.deepStrictEqual(await fotoL1(m, r2, L1), antes, 'nada gravado');
    await entOk(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 2 }]);
  });

  await test('[RN-267.13 ja pedido] XB-03 (2) bloqueada; item 1 "Sai de" XB-02/L1 1, item 2 so L1 2 -> 400 "so 1 pode" (XB-02 sobra 1)', async () => {
    // a do lote passa (8 - 4 - 1 = 3); a prateleira livre e so XB-02, que o item 1 leva 1. Sem descontar o estrito, a baixa nao cobria e o motor
    // levava a guarda de R1 em XB-01.
    const { m, L1 } = await base({ b03: 2 });
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 1], [m.id, 2]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    await sepOk(r2.R, [auto(r2.ids[0], 1), auto(r2.ids[1], 2)]);
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id = ?', [B03.id]);
    try {
      const antes = await fotoL1(m, r2, L1);
      const b = await entregar(r2.R, [saiDe(r2.ids[0], 1, L1, B02.id), soLote(r2.ids[1], 2, L1)]);
      assert.strictEqual(b.status, 400, JSON.stringify(b.body));
      assert.strictEqual(b.body.error, fraseLivre(m, { pode: 1, qty: 2 }));
      assert.deepStrictEqual(await fotoL1(m, r2, L1), antes, 'nada gravado');
    } finally {
      await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 0 WHERE id = ?', [B03.id]);
    }
  });

  await test('[RN-267.13 dois so lote] XB-03 (2) bloqueada; item 1 so L1 2 e item 2 so L1 1 -> 400 no item 2 "so 0 podem" (XB-02 vai ao item 1)', async () => {
    const { m, L1 } = await base({ b03: 2 });
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 2], [m.id, 1]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    await sepOk(r2.R, [auto(r2.ids[0], 2), auto(r2.ids[1], 1)]);
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id = ?', [B03.id]);
    try {
      const antes = await fotoL1(m, r2, L1);
      const b = await entregar(r2.R, [soLote(r2.ids[0], 2, L1), soLote(r2.ids[1], 1, L1)]);
      assert.strictEqual(b.status, 400, JSON.stringify(b.body));
      assert.strictEqual(b.body.error, fraseLivre(m, { pode: 0, qty: 1 }));
      assert.deepStrictEqual(await fotoL1(m, r2, L1), antes, 'nada gravado');
    } finally {
      await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 0 WHERE id = ?', [B03.id]);
    }
  });

  // Fase 5 da 267 (reproduzido): a conferencia passava (lote 11 - 2 em inspecao - 5 de R1 = 4; prateleira livre XB-03 2) e a baixa, sem o
  // `todos`, nao achava o lote (min(livre - presa, usavel) = 0) e caia no "como hoje": o motor tirava de XB-01, a guarda de R1.
  await test('[RN-267.10 Fase 5] peca em inspecao + guarda que fica do proprio item: R2 so L1 2 -> 200 de XB-03, XB-01 (de R1) intacta', async () => {
    const m = await material();
    await entrar(m, B01.id, 5, 'L1'); await entrar(m, B02.id, 4, 'L1'); await entrar(m, B03.id, 2, 'L1'); await entrar(m, P01.id, 9, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    const L1 = await loteId(m, 'L1');
    const r1 = await req([[m.id, 5]]); const r2 = await req([[m.id, 6]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 5, L1)]);
    await sepOk(r2.R, [doPar(r2.ids[0], 4, L1, B02.id)]);
    await sepOk(r2.R, [auto(r2.ids[0], 2)]);
    const rec = (await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero) VALUES (?)', [`REC267-${m.id}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
      quantidade_recebida, lote_id, quantidade_em_inspecao) VALUES (?, ?, 2, 2, ?, 2)`, [rec, m.id, L1]);
    await entOk(r2.R, [soLote(r2.ids[0], 2, L1)]);
    assert.deepStrictEqual(await saidas(m, r2.R), [[2, B03.id, L1]]);
    assert.strictEqual(await saldoDe(m, B01.id, L1), 5, 'a guarda de R1 ficou (a entrega dela depois depende da peca em inspecao — regra da 218)');
    assert.ok(r1.R);
  });

  // ---------------------------------------------------------------- RN-267.15 (integracao: separacao da tela -> entrega so lote -> um clique)
  const fim = async (m, L1, r1, r2) => {
    assert.deepStrictEqual(await saidas(m, r2.R), [[2, B02.id, L1]]);
    assert.deepStrictEqual(await saidas(m, r1.R), [[4, B01.id, L1]]);
    assert.strictEqual(await saldoDe(m, B01.id, L1), 0);
    assert.strictEqual(await saldoDe(m, B02.id, L1), 0);
    assert.deepStrictEqual(await semLoteNaoZero(m), []);
    assert.strictEqual(await statusDe(r1.R), 'ENTREGUE');
    assert.strictEqual(await statusDe(r2.R), 'ENTREGUE');
  };
  await test('[RN-267.15 rota] R1 /separacao XB-01/L1 4; R2 /separacao automatico 2; R2 so L1 2 -> 200; R1 um clique -> 200', async () => {
    const { m, L1 } = await base();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 2]]);
    const a = await separacao(r1.R, [doPar(r1.ids[0], 4, L1)]);
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    const b = await separacao(r2.R, [auto(r2.ids[0], 2)]);
    assert.strictEqual(b.status, 200, JSON.stringify(b.body));
    await entOk(r2.R, [soLote(r2.ids[0], 2, L1)]);
    await entOk(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 4 }]);
    await fim(m, L1, r1, r2);
  });

  await test('[RN-267.15 servico] o mesmo por separarRequisicao / entregarRequisicao', async () => {
    const { m, L1 } = await base();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 2]]);
    await requisitionService.separarRequisicao(db, r1.R, [doPar(r1.ids[0], 4, L1)], ALMOX);
    await requisitionService.separarRequisicao(db, r2.R, [auto(r2.ids[0], 2)], ALMOX);
    await requisitionService.entregarRequisicao(db, r2.R, [soLote(r2.ids[0], 2, L1)], ALMOX, null);
    await requisitionService.entregarRequisicao(db, r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 4 }], ALMOX, null);
    await fim(m, L1, r1, r2);
  });

  // ---------------------------------------------------------------- RN-267.16 (corrida)
  const placar = { sep: 0, ent: 0 };
  await test('[RN-267.16 corrida] R1 separa 4 de XB-01/L1 e R2 entrega 4 so L1 ao mesmo tempo (10x): nunca as duas', async () => {
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop
      const { m, L1 } = await base();
      // eslint-disable-next-line no-await-in-loop
      const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
      // eslint-disable-next-line no-await-in-loop
      await sepOk(r2.R, [auto(r2.ids[0], 4)]);
      const sep = () => requisitionService.separarRequisicao(db, r1.R, [doPar(r1.ids[0], 4, L1)], ALMOX);
      const ent = () => requisitionService.entregarRequisicao(db, r2.R, [soLote(r2.ids[0], 4, L1)], ALMOX, null);
      const lancadas = i % 2 === 0 ? [sep(), ent()] : [ent(), sep()];
      // eslint-disable-next-line no-await-in-loop
      const res = await Promise.allSettled(lancadas);
      const [rSep, rEnt] = i % 2 === 0 ? res : [res[1], res[0]];
      assert.strictEqual(res.filter((x) => x.status === 'fulfilled').length, 1, `volta ${i}: ${res.map((x) => x.reason && x.reason.message)}`);
      if (rSep.status === 'fulfilled') {
        placar.sep++;
        assert.strictEqual(rEnt.reason.message, fraseLote(m, { saldo: 6, pode: 2, guardado: 4, qty: 4 }));
      } else placar.ent++;
      // eslint-disable-next-line no-await-in-loop
      const soma = await dbGet(db, `SELECT COALESCE(SUM(quantidade_origem_separacao), 0) as q FROM itens_requisicao_almoxarifado
        WHERE material_id = ? AND origem_separacao_id = ? AND lote_separacao_id = ?`, [m.id, B01.id, L1]);
      // eslint-disable-next-line no-await-in-loop
      assert.ok(Number(soma.q) <= (await saldoDe(m, B01.id, L1)) + 1e-9, `volta ${i}: parte ${soma.q} > fisico`);
    }
    console.log(`    separacao venceu ${placar.sep}, entrega venceu ${placar.ent}`);
  });

  await close();
  terminou = true;
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
