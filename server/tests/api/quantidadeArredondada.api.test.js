/**
 * Etapa 96 — o motor grava a quantidade arredondada e nao recusa o que existe por ponto flutuante (C176, features 03
 * com a 05 e a 07).
 *
 * As colunas de quantidade sao REAL. 0,7 + 0,2 + 0,1 gravava 0.9999999999999999 e o pedido de 1 era recusado; e o
 * disponivel, sendo uma DIFERENCA de colunas (fisico - retencoes), saia torto mesmo com as colunas limpas
 * (0,3 - 0,1 = 0.19999999999999998). A regra unica (server/services/almoxarifado/quantidade.js, namespace `Q`):
 * arredondar a 1e-6 ao gravar (`Q.qtd`, `Q.qtdSql`) e comparar com folga de 1e-9 ao recusar (`Q.cabe`, `Q.FOLGA_SQL`).
 *
 * Usuarios reais por header (molde 92-95): S sem perfil (PRODUCAO) cria a requisicao pela rota; ADMIN superadmin aprova
 * e movimenta por /movimentacoes/v2. O LEGADO torto e montado por ESCRITOR DIRETO (`UPDATE ... = 0.9999999999999999`),
 * nunca pelo motor — depois da T1 o motor nao produz mais deriva, e um teste que a fabricasse pelo motor ficaria vazio.
 *
 * T0: RN-00 (o helper) e a parte da RN-02 que o disponivel arredondado resolve (colunas limpas; o legado na SAIDA sem
 * origem, na reserva manual e na aprovacao — Fase 2, I2). Casos `[96 RN-xx]`.
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa96-motor-quantidade-arredondada.md
 *
 * Executar: cd server && node tests/api/quantidadeArredondada.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const Q = require('../../services/almoxarifado/quantidade');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 96', role: 'admin', is_superadmin: 1, email: 'a96@t.com' },
  S: { id: 9601, nome: 'Solic 96', role: 'user', email: 's96@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 9602, nome: 'Almox 96', role: 'user', email: 'x96@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const TORTO = 0.9999999999999999; // 0,7 + 0,2 + 0,1 somados em ponto flutuante
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 96: o motor grava a quantidade arredondada e nao recusa o que existe ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
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

  const material = async (fisico = 0) => {
    const c = `E96-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, material_critico, custo_unitario) VALUES (?, ?, 'PC', ?, 0, 1, 0, 0.1)`, [c, c, fisico])).lastID;
  };
  // Legado: a coluna do material escrita direto, como o motor antigo a deixava.
  const legado = async (valor = TORTO) => {
    const m = await material(0);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ? WHERE id = ?', [valor, m]);
    const lido = await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m]);
    assert.strictEqual(lido.q, valor, 'premissa: o legado ficou torto');
    return m;
  };
  const mov = (m, tipo, quantidade, extra = {}) => como('ADMIN').post(`${API}/movimentacoes/v2`, {
    material_id: m, tipo, quantidade, motivo: 'e96', justificativa: 'teste da etapa 96', ...extra,
  });
  const entrar = async (m, q) => { const r = await mov(m, 'ENTRADA', q); assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`); };
  const reservar = (m, q) => como('ADMIN').post(`${API}/reservas`, { material_id: m, quantidade: q, os_referencia: 'OS-96' });
  const bloquear = (m, q) => como('ADMIN').post(`${API}/materiais/${m}/bloquear`, { quantidade: q, motivo: 'e96', justificativa: 'teste da etapa 96' });
  const mat = (m) => dbGet(db, 'SELECT quantidade_atual, quantidade_reservada, quantidade_bloqueada FROM materiais_almoxarifado WHERE id=?', [m]);
  const sqlRound = async (v) => (await dbGet(db, 'SELECT ROUND(?, 6) r', [v])).r;

  // ─────────────────────────── T0: o helper ───────────────────────────
  await test('[96 RN-00] Q.qtd arredonda a 1e-6 e concorda com o ROUND do SQLite (inclusive no meio 0,0000005)', async () => {
    assert.strictEqual(Q.qtd(0.1 + 0.2), 0.3);
    assert.strictEqual(Q.qtd(TORTO), 1);
    assert.strictEqual(Q.qtd(-0.30000000000000004), -0.3);
    assert.strictEqual(Q.qtd(0.0000004), 0);
    assert.strictEqual(Q.qtd(1.0000004), 1);
    // Fase 2, I6: o binario de 5e-7 fica ABAIXO do meio — o SQLite da 0, e o helper tem de dar o mesmo.
    assert.strictEqual(Q.qtd(0.0000005), 0);
    assert.strictEqual(Q.qtd(1.0000005), 1.000001);
    for (const v of [0.1 + 0.2, TORTO, -0.30000000000000004, 0.0000004, 0.0000005, 1.0000005, 0.0000015, 123456.1234565]) {
      assert.strictEqual(Q.qtd(v), (await sqlRound(v)) + 0, `qtd(${v}) x ROUND do SQLite`);
    }
  });
  await test('[96 RN-00] Q.qtd nunca devolve -0', async () => {
    assert.ok(Object.is(Q.qtd(-0.0000004), 0), `veio ${Object.is(Q.qtd(-0.0000004), -0) ? '-0' : Q.qtd(-0.0000004)}`);
    assert.ok(Object.is(Q.qtd(-0), 0));
  });
  await test('[96 RN-00] Q.qtd nao inventa numero: null, \'\', booleano, texto e nao-finito -> NaN; texto numerico vale', async () => {
    for (const v of [null, undefined, '', '  ', true, false, 'abc', NaN, Infinity, -Infinity, {}, []]) {
      assert.ok(Number.isNaN(Q.qtd(v)), `Q.qtd(${JSON.stringify(v)}) devia ser NaN, veio ${Q.qtd(v)}`);
    }
    assert.strictEqual(Q.qtd('0.7'), 0.7);
    assert.strictEqual(Q.qtd(' 2 '), 2);
  });
  await test('[96 RN-00] Q.cabe tem folga de ponto flutuante e nao aceita o que nao existe', async () => {
    assert.ok(Q.cabe(1, TORTO));
    assert.ok(Q.cabe(0.2, 0.3 - 0.1));
    assert.ok(Q.cabe('1', '1'));
    assert.ok(!Q.cabe(0.200001, 0.2));
    assert.ok(!Q.cabe(1.000001, 1));
    assert.ok(Q.QTD_FOLGA < 5e-7, 'a folga tem de ser menor que meia unidade da precisao');
  });
  await test('[96 RN-00] Q.qtdSql e Q.FOLGA_SQL sao SQL valido e fazem a conta', async () => {
    assert.strictEqual(Q.qtdSql('a + ?'), 'ROUND((a + ?), 6)');
    const r = await dbGet(db, `SELECT ${Q.qtdSql('? + ? + ?')} s, (? >= ? ${Q.FOLGA_SQL}) cabe, (? >= ? ${Q.FOLGA_SQL}) naoCabe`,
      [0.7, 0.2, 0.1, TORTO, 1, 0.2, 0.200001]);
    assert.deepStrictEqual({ ...r }, { s: 1, cabe: 1, naoCabe: 0 });
  });

  // ─────────────────── T0: o disponivel arredondado (B486) ───────────────────
  await test('[96 RN-02] colunas limpas: fisico 0,3 e reservado 0,1 -> SAIDA 0,2 -> 201 (o disponivel e uma diferenca)', async () => {
    const m = await material(0);
    await entrar(m, 0.3);
    const rv = await reservar(m, 0.1);
    assert.strictEqual(rv.status, 201, `reserva 0,1: ${JSON.stringify(rv.body)}`);
    assert.deepStrictEqual({ ...(await mat(m)) }, { quantidade_atual: 0.3, quantidade_reservada: 0.1, quantidade_bloqueada: 0 },
      'premissa: as duas colunas estao limpas');
    const s = await mov(m, 'SAIDA', 0.2);
    assert.strictEqual(s.status, 201, `SAIDA 0,2: ${JSON.stringify(s.body)}`);
  });
  await test('[96 RN-02] colunas limpas: fisico 0,3 e bloqueado 0,1 -> reserva 0,2 -> 201', async () => {
    const m = await material(0);
    await entrar(m, 0.3);
    const b = await bloquear(m, 0.1);
    assert.strictEqual(b.status, 200, `bloquear 0,1: ${JSON.stringify(b.body)}`);
    assert.strictEqual((await mat(m)).quantidade_bloqueada, 0.1, 'premissa: bloqueado limpo');
    const rv = await reservar(m, 0.2);
    assert.strictEqual(rv.status, 201, `reserva 0,2: ${JSON.stringify(rv.body)}`);
  });
  await test('[96 RN-02] o extrato do material le o disponivel arredondado (fisico 0,3 e reservado 0,1 -> 0,2)', async () => {
    const m = await material(0);
    await entrar(m, 0.3);
    assert.strictEqual((await reservar(m, 0.1)).status, 201);
    const ex = await como('ADMIN').get(`${API}/materiais/${m}/extrato`);
    assert.strictEqual(ex.status, 200, JSON.stringify(ex.body));
    assert.strictEqual(ex.body.material.quantidade_disponivel, 0.2);
  });
  await test('[96 RN-02] legado torto (escrito direto): SAIDA 1 sem origem -> 201 (a pre-checagem e o claim leem o disponivel arredondado)', async () => {
    const m = await legado();
    const s = await mov(m, 'SAIDA', 1);
    assert.strictEqual(s.status, 201, `SAIDA 1: ${JSON.stringify(s.body)}`);
  });
  await test('[96 RN-02] legado torto: POST /reservas 1 -> 201', async () => {
    const m = await legado();
    const rv = await reservar(m, 1);
    assert.strictEqual(rv.status, 201, `reserva 1: ${JSON.stringify(rv.body)}`);
  });
  await test('[96 RN-02] legado torto: aprovar a requisicao de 1 reserva 1 (TOTALMENTE_RESERVADA — fecha a ressalva do 6e0fae83)', async () => {
    const m = await legado();
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-96', itens: [{ material_id: m, quantidade: 1 }],
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ap = await como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/aprovar`, {});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    const rs = await dbAll(db, `SELECT quantidade, status FROM reservas_material_almoxarifado WHERE requisicao_id = ?`, [cr.body.id]);
    assert.deepStrictEqual(rs.map((r) => [r.quantidade, r.status]), [[1, 'ATIVA']]);
    const st = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [cr.body.id]);
    assert.strictEqual(st.status, 'TOTALMENTE_RESERVADA');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
