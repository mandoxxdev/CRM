/**
 * Etapa 115 (T2) — integracao: o ligar/desligar do controle cruzando Materiais, Movimentacoes e Series pelas rotas reais.
 *
 * (i)   o caminho que a E1 manda: o Administrador desliga, a Saida sem serie deixa as series (o declarado da RN-04), e ao
 *       religar ele regulariza pela tela de Series ate o fisico e as series baterem;
 * (ii)  o Almoxarife sem pedir a ninguem: tira as series COM serie, e entao desliga;
 * (iii) legado (controle ligado, fisico 0, 2 presentes): E1 -> o Administrador baixa as 2 -> o Almoxarife desliga;
 * (iv)  pelo motor real (C226): uma Entrada sem lote pela v2 com o PUT que liga o lote disparado NO MEIO dela (gancho na
 *       leitura do material pelo motor, ja sob a trava) -> Entrada 201 e o PUT do Almoxarife 403 da 112; o do Administrador
 *       200 depois da Entrada, e a Entrada SEGUINTE sem lote e recusada.
 *
 * Executar: cd server && node tests/api/controleSobATravaIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const trava = require('../../services/almoxarifado/travaPorMaterial');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 400)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM_PERFIL = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };

const E1 = (codigo, n, perfil) => `Desligar o controle por número de série no material ${codigo} exige a permissão `
  + `"ajustar_estoque" (seu perfil: ${perfil}): há ${n} série(s) em estoque. Depois de desligar, a saída não baixa essas `
  + 'séries, e elas continuam "Em estoque" depois que o material sai. Peça ao Administrador do almoxarifado para desligar '
  + 'o controle.';
const E1b = (codigo, n, fisico, perfil) => `Desligar o controle por número de série no material ${codigo} exige a `
  + `permissão "ajustar_estoque" (seu perfil: ${perfil}): há ${n} série(s) em estoque e o físico é ${fisico}. Peça ao `
  + 'Administrador do almoxarifado para baixá-las em Lotes e Séries → Séries → Regularizar séries; sem série em estoque, o '
  + 'controle pode ser desligado.';
const e112Lote = (codigo, partes, perfil) => `Ligar o controle por lote no material ${codigo} exige a permissão `
  + `"ajustar_estoque" (seu perfil: ${perfil}): ${partes}. Depois de ligar, a saída desse saldo é recusada até ele ser `
  + 'regularizado, e regularizar é do Administrador do almoxarifado. Peça a ele para ligar o controle e regularizar o saldo.';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `I115-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, `Peca ${seq}`])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  const mov = (u, m, body) => as(u, () => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id,
    motivo: 'i115', justificativa: 'jornada i115', documento_vinculado: 'NF-I115', ...body }));
  const put = (u, m, body) => as(u, () => request(app).put(`/api/almoxarifado/materiais/${m.id}`).send(body));
  const series = (u, m) => as(u, () => request(app).get(`/api/almoxarifado/materiais/${m.id}/series`));
  const regularizar = (u, m, body) => as(u, () => request(app).post(`/api/almoxarifado/materiais/${m.id}/series/regularizar`)
    .send({ justificativa: 'regularizacao i115', ...body }));
  const ok = (r, st, o) => assert.strictEqual(r.status, st, `${o}: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q;
  const controle = async (m) => dbGet(db, 'SELECT controle_lote, controle_serie FROM materiais_almoxarifado WHERE id = ?', [m.id]);
  const presentesIds = async (m) => (await dbAll(db, `SELECT id FROM series_almoxarifado WHERE material_id = ?
    AND status IN ('EM_ESTOQUE','BLOQUEADA') ORDER BY numero`, [m.id])).map((r) => r.id);

  await test('(i) E1 -> o Administrador desliga -> Saida sem serie deixa as series -> religa e regulariza: fisico e series batem', async () => {
    const m = await material({ controle_serie: 1 });
    ok(await mov(SUPER, m, { tipo: 'ENTRADA', quantidade: 2, series: ['A1', 'A2'] }), 201, 'entrada');
    const r1 = await put(ALMOXARIFE, m, { controle_serie: 0 });
    ok(r1, 403, 'almoxarife desliga');
    assert.strictEqual(r1.body.error, E1(m.codigo, 2, 'ALMOXARIFE'));
    ok(await put(ADM_PERFIL, m, { controle_serie: 0 }), 200, 'administrador desliga');
    ok(await mov(ALMOXARIFE, m, { tipo: 'SAIDA', quantidade: 2 }), 201, 'saida sem serie');
    assert.strictEqual(await fisico(m), 0);
    const ls = await series(ALMOXARIFE, m);
    ok(ls, 200, 'lista series');
    assert.deepStrictEqual(ls.body.map((s) => s.status), ['EM_ESTOQUE', 'EM_ESTOQUE'], 'as series ficaram (declarado)');
    ok(await put(ADM_PERFIL, m, { controle_serie: 1 }), 200, 'administrador religa');
    ok(await regularizar(ADM_PERFIL, m, { baixar: await presentesIds(m) }), 200, 'regulariza');
    assert.deepStrictEqual(await presentesIds(m), [], 'sobrou serie presente');
    assert.strictEqual(await fisico(m), 0);
  });

  await test('(ii) o Almoxarife tira as 2 series COM serie e entao desliga (200)', async () => {
    const m = await material({ controle_serie: 1 });
    ok(await mov(SUPER, m, { tipo: 'ENTRADA', quantidade: 2, series: ['B1', 'B2'] }), 201, 'entrada');
    ok(await mov(ALMOXARIFE, m, { tipo: 'SAIDA', quantidade: 2, serie_ids: await presentesIds(m) }), 201, 'saida com serie');
    ok(await put(ALMOXARIFE, m, { controle_serie: 0 }), 200, 'desliga');
    assert.strictEqual((await controle(m)).controle_serie, 0);
  });

  await test('(iii) legado: controle ligado, fisico 0, 2 presentes -> E1 -> o Administrador baixa -> o Almoxarife desliga', async () => {
    const m = await material({ controle_serie: 1 });
    ok(await mov(SUPER, m, { tipo: 'ENTRADA', quantidade: 2, series: ['C1', 'C2'] }), 201, 'entrada');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 0 WHERE id = ?', [m.id]); // o legado de antes da 61
    const r1 = await put(ALMOXARIFE, m, { controle_serie: 0 });
    ok(r1, 403, 'almoxarife desliga');
    assert.strictEqual(r1.body.error, E1b(m.codigo, 2, 0, 'ALMOXARIFE'));
    const reg = await regularizar(ALMOXARIFE, m, { baixar: await presentesIds(m) });
    ok(reg, 403, 'o Almoxarife nao regulariza');
    ok(await regularizar(ADM_PERFIL, m, { baixar: await presentesIds(m) }), 200, 'administrador regulariza');
    ok(await put(ALMOXARIFE, m, { controle_serie: 0 }), 200, 'almoxarife desliga depois');
  });

  // (iv) gancho: a primeira leitura do material feita COM a trava presa (a do motor, dentro de registrarMovimentacao).
  let gancho = null;
  const getOriginal = db.get.bind(db);
  db.get = function (sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    const s = String(sql).replace(/\s+/g, ' ').trim();
    if (gancho && /^SELECT \* FROM materiais_almoxarifado WHERE id = \?$/.test(s) && Number(params[0]) === gancho.id
      && trava.travado(gancho.id)) {
      const g = gancho; gancho = null;
      return getOriginal(sql, params, (err, row) => { g.depois().then(() => cb(err, row), (e) => cb(e)); });
    }
    return getOriginal(sql, params, cb);
  };
  // Dispara o PUT como `u` no meio da Entrada e segura a Entrada 80 ms (o PUT fora da trava terminaria nesse tempo).
  const disparaPutNoMeio = (m, u, body, estado) => async () => {
    setUser(u);
    estado.feito = false;
    estado.promessa = request(app).put(`/api/almoxarifado/materiais/${m.id}`).send(body)
      .then((r) => { estado.feito = true; return r; });
    await espera(80);
    estado.feitoNoMeio = estado.feito; // Fase 2 (R5): o PUT saiu DURANTE a Entrada e nao terminou antes dela
  };

  for (let rodada = 1; rodada <= 3; rodada += 1) {
    await test(`(iv.${rodada}) Entrada sem lote pela v2 com o PUT do Almoxarife que liga o lote no meio: Entrada 201, PUT 403 da 112`, async () => {
      const m = await material();
      const estado = {};
      gancho = { id: m.id, depois: disparaPutNoMeio(m, ALMOXARIFE, { controle_lote: 1 }, estado) };
      const e = await mov(SUPER, m, { tipo: 'ENTRADA', quantidade: 5 });
      assert.strictEqual(gancho, null, 'o gancho nao disparou (a leitura do motor nao foi achada)');
      ok(e, 201, 'entrada');
      const r = await estado.promessa;
      setUser(SUPER);
      assert.strictEqual(estado.feitoNoMeio, false, 'o PUT terminou no meio da Entrada (fora da trava)');
      ok(r, 403, 'put');
      assert.strictEqual(r.body.error, e112Lote(m.codigo, 'há 5 sem lote atribuído', 'ALMOXARIFE'));
      assert.strictEqual((await controle(m)).controle_lote, 0, 'ligou o lote com saldo sem lote');
    });
  }

  await test('(iv) o Administrador no mesmo cenario: 200 depois da Entrada (5 sem lote, a C224) e a Entrada seguinte sem lote e recusada', async () => {
    const m = await material();
    const estado = {};
    gancho = { id: m.id, depois: disparaPutNoMeio(m, ADM_PERFIL, { controle_lote: 1 }, estado) };
    const e = await mov(SUPER, m, { tipo: 'ENTRADA', quantidade: 5 });
    assert.strictEqual(gancho, null, 'o gancho nao disparou');
    ok(e, 201, 'entrada');
    const r = await estado.promessa;
    setUser(SUPER);
    assert.strictEqual(estado.feitoNoMeio, false, 'o PUT do Administrador terminou no meio da Entrada');
    ok(r, 200, 'put do administrador');
    assert.strictEqual((await controle(m)).controle_lote, 1);
    assert.strictEqual(await fisico(m), 5);
    const e2 = await mov(ALMOXARIFE, m, { tipo: 'ENTRADA', quantidade: 1 });
    ok(e2, 400, 'entrada seguinte sem lote');
    assert.strictEqual(e2.body.error, `O material ${m.codigo} exige lote nesta movimentacao (controle por lote ligado)`);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
