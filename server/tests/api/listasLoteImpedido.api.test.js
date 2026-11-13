/**
 * Etapa 223 (T1, T4) — as listas de saldo dizem quanto esta em lote impedido (C481, 2a parte; RN-223.01 a .07).
 *
 * `GET /api/almoxarifado/estoque` devolve `lote_impedido` em toda linha (B1480); `GET /api/almoxarifado/materiais` so com
 * `com_lote_impedido=1` (B1481, opt-in — sem ele a resposta e a de hoje, sem a chave). O numero e `loteImpedido.loteImpedidoSql('m')`,
 * a regua da aprovacao, da reserva manual e do extrato (222). O `quantidade_disponivel` nao muda (B1476).
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa223-listas-lote-impedido.md
 *
 * Executar: cd server && node tests/api/listasLoteImpedido.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { loteImpedidoSql } = require('../../services/almoxarifado/loteImpedido');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 223', role: 'admin', is_superadmin: 1, email: 'a223@t.com' };
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
const tem = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 223: as listas de saldo dizem quanto esta em lote impedido ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const get = (u, q) => request(app).get(u).query(q || {});
  const post = (u, b = {}) => request(app).post(u).send(b);
  const put = (u, b = {}) => request(app).put(u).send(b);
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [ADMIN.id, ADMIN.nome, ADMIN.email]);
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY, razao_social TEXT)');

  const alm = await post(`${API}/almoxarifados`, { codigo: 'ALM223', nome: 'Almox 223' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  await post(`${API}/localizacoes`, { codigo: 'Z223-01', descricao: 'Z223-01', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z223-01'");

  const material = async ({ lote = 1, cliente = null } = {}) => {
    const c = `E223-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id, proprietario_cliente_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, 0, ?, ?)`, [c, c, lote, P01.id, cliente])).lastID;
  };
  const entrar = (m, q, lote) => ok(post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e223', localizacao_destino_id: P01.id, lote }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m, codigo])).id;
  const status = async (m, codigo, st) => ok(put(`${API}/lotes/${await loteId(m, codigo)}/status`,
    { status: st, justificativa: 'teste 223' }));
  const validade = async (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?',
    [data, await loteId(m, codigo)]);
  const linhaDe = (rows, m) => {
    assert.ok(Array.isArray(rows), `a lista nao e um array: ${JSON.stringify(rows).slice(0, 200)}`);
    const l = rows.find((x) => Number(x.id) === Number(m));
    assert.ok(l, `material ${m} fora da lista`);
    return l;
  };
  const estoque = async (m, q) => linhaDe((await ok(get(`${API}/estoque`, q))).body, m);
  const impEstoque = async (m, q) => {
    const l = await estoque(m, q);
    assert.ok(tem(l, 'lote_impedido'), '/estoque nao trouxe lote_impedido');
    return l.lote_impedido;
  };
  const impMateriais = async (m, q = {}) => {
    const l = linhaDe((await ok(get(`${API}/materiais`, { com_lote_impedido: '1', ...q }))).body, m);
    assert.ok(tem(l, 'lote_impedido'), '/materiais?com_lote_impedido=1 nao trouxe lote_impedido');
    return l.lote_impedido;
  };
  const extrato = async (m) => (await ok(get(`${API}/materiais/${m}/extrato`))).body.material.lote_impedido;
  const regua = async (m) => (await dbGet(db, `SELECT ${loteImpedidoSql('m')} AS v FROM materiais_almoxarifado m WHERE m.id = ?`, [m])).v;
  const l1l2 = async (opts) => {
    const m = await material(opts);
    await entrar(m, 4, 'L1'); await entrar(m, 6, 'L2');
    return m;
  };

  // ── RN-223.01 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  let M01;
  await test('[RN-223.01] /estoque: L1 ATIVO 4 + L2 BLOQUEADO 6 -> lote_impedido 6 e o Disponivel continua 10', async () => {
    M01 = await l1l2(); await status(M01, 'L2', 'BLOQUEADO');
    const l = await estoque(M01);
    assert.strictEqual(l.lote_impedido, 6);
    assert.strictEqual(Number(l.quantidade_disponivel), 10);
  });

  // ── RN-223.02 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-223.02 a] /estoque: L2 REPROVADO -> 6', async () => {
    const m = await l1l2(); await status(m, 'L2', 'REPROVADO');
    assert.strictEqual(await impEstoque(m), 6);
  });
  await test('[RN-223.02 b] /estoque: L2 ATIVO vencido ontem -> 6', async () => {
    const m = await l1l2(); await validade(m, 'L2', dia(-1));
    assert.strictEqual(await impEstoque(m), 6);
  });
  await test('[RN-223.02 c] /estoque: vencido com o vencimento liberado -> 0', async () => {
    const m = await l1l2(); await validade(m, 'L2', dia(-1));
    assert.strictEqual(await impEstoque(m), 6);
    await ok(put(`${API}/lotes/${await loteId(m, 'L2')}/liberar-vencimento`, { justificativa: 'teste 223' }));
    assert.strictEqual(await impEstoque(m), 0);
  });
  await test('[RN-223.02 d] /estoque: o lote que vence hoje ainda nao esta vencido -> 0 (e ontem, no vizinho, 6)', async () => {
    const m = await l1l2(); await validade(m, 'L2', dia(0));
    assert.strictEqual(await impEstoque(m), 0);
    const v = await l1l2(); await validade(v, 'L2', dia(-1));
    assert.strictEqual(await impEstoque(v), 6);
  });
  await test('[RN-223.02 e] /estoque: sem controle de lote, lote BLOQUEADO 6 -> 0', async () => {
    const m = await material(); await entrar(m, 6, 'L2');
    await dbRun(db, "UPDATE lotes_almoxarifado SET status = 'BLOQUEADO' WHERE material_id = ?", [m]);
    assert.strictEqual(await impEstoque(m), 6);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 0 WHERE id = ?', [m]);
    const l = await estoque(m);
    assert.strictEqual(l.lote_impedido, 0);
    assert.strictEqual(Number(l.quantidade_disponivel), 6);
  });
  await test('[RN-223.02 f] /estoque: so lote ATIVO -> 0; material sem lote nem saldo -> 0', async () => {
    const m = await material(); await entrar(m, 4, 'L1');
    assert.strictEqual(await impEstoque(m), 0);
    assert.strictEqual(await impEstoque(await material()), 0);
  });

  // ── RN-223.03 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-223.03] /estoque: a parte bloqueada sem lote conhecido sai do impedido (6 - 2 = 4); toda linha tem o campo = a regua', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 2 WHERE id = ?', [m]);
    assert.strictEqual(await impEstoque(m), 4);
    const rows = (await ok(get(`${API}/estoque`))).body;
    assert.ok(rows.length >= 8, `poucas linhas: ${rows.length}`);
    assert.ok(rows.some((r) => r.lote_impedido > 0) && rows.some((r) => r.lote_impedido === 0), 'sem os dois casos na lista');
    for (const r of rows) {
      assert.ok(tem(r, 'lote_impedido'), `linha ${r.id} sem o campo`);
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual(r.lote_impedido, await regua(r.id), `material ${r.id}`);
    }
  });

  // ── RN-223.04 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-223.04] /estoque: material de cliente traz o campo (incluir_clientes=1 e proprietario_cliente_id=)', async () => {
    const cli = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente 223')")).lastID;
    const m = await l1l2({ cliente: cli }); await status(m, 'L2', 'BLOQUEADO');
    assert.strictEqual(await impEstoque(m, { incluir_clientes: '1' }), 6);
    assert.strictEqual(await impEstoque(m, { proprietario_cliente_id: String(cli) }), 6);
    assert.strictEqual(await impEstoque(m, { material_id: String(m) }), 6);
  });

  // ── RN-223.05 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-223.05] /materiais sem o parametro (ou com outro valor): a resposta de hoje, sem a chave', async () => {
    for (const q of [{}, { com_lote_impedido: '0' }, { com_lote_impedido: 'true' }, { com_lote_impedido: '' }]) {
      // eslint-disable-next-line no-await-in-loop
      const rows = (await ok(get(`${API}/materiais`, q))).body;
      linhaDe(rows, M01);
      assert.ok(rows.length >= 8, `poucas linhas: ${rows.length}`);
      const com = rows.filter((r) => tem(r, 'lote_impedido'));
      assert.strictEqual(com.length, 0, `${JSON.stringify(q)}: ${com.length} linha(s) com lote_impedido`);
    }
    // a metade positiva no mesmo teste: com '1' a chave vem
    assert.strictEqual(await impMateriais(M01), 6);
  });

  // ── RN-223.06 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-223.06] /materiais?com_lote_impedido=1: o campo = a regua em toda linha, com busca e com o filtro de inativos', async () => {
    assert.strictEqual(await impMateriais(M01), 6);
    const nome = (await dbGet(db, 'SELECT nome FROM materiais_almoxarifado WHERE id = ?', [M01])).nome;
    assert.strictEqual(await impMateriais(M01, { search: nome }), 6);
    const inativo = await l1l2(); await status(inativo, 'L2', 'BLOQUEADO');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [inativo]);
    assert.strictEqual(await impMateriais(inativo, { status: 'inativo' }), 6);
    const rows = (await ok(get(`${API}/materiais`, { com_lote_impedido: '1' }))).body;
    assert.ok(rows.length >= 8, `poucas linhas: ${rows.length}`);
    for (const r of rows) {
      assert.ok(tem(r, 'lote_impedido'), `linha ${r.id} sem o campo`);
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual(r.lote_impedido, await regua(r.id), `material ${r.id}`);
    }
  });

  // ── RN-223.07 (T4, integracao) ────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-223.07] lista, extrato e reserva dizem 6 -> liberar o lote -> as tres leituras 0 -> a reserva passa', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO');
    assert.strictEqual(await impEstoque(m), 6);
    assert.strictEqual(await impMateriais(m), 6);
    assert.strictEqual(await extrato(m), 6);
    const r = await post(`${API}/reservas`, { material_id: m, quantidade: 5, os_referencia: 'OS-223', observacoes: 'e223' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Saldo disponível insuficiente: 4. Não entram 6 un em lote bloqueado, reprovado ou vencido.');
    await status(m, 'L2', 'ATIVO');
    assert.strictEqual(await impEstoque(m), 0);
    assert.strictEqual(await impMateriais(m), 0);
    assert.strictEqual(await extrato(m), 0);
    await ok(post(`${API}/reservas`, { material_id: m, quantidade: 5, os_referencia: 'OS-223', observacoes: 'e223' }), 201);
    const l = await estoque(m);
    assert.strictEqual(Number(l.quantidade_disponivel), 5);
    assert.strictEqual(l.lote_impedido, 0);
  });

  terminou = true;
  console.log(`\n  ${passed} passou, ${failed} falhou\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
