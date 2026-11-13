/**
 * Etapa 222 (T1, T4) — o extrato do material diz quanto esta em lote impedido (C481, 1a parte; RN-222.01 a .07).
 *
 * `GET /api/almoxarifado/materiais/:id/extrato` devolve `material.lote_impedido` = `loteImpedido.loteImpedidoSql('m')` (a regua da
 * aprovacao e da reserva manual), aditivo: o `quantidade_disponivel` continua o de sempre (B1476).
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa222-extrato-lote-impedido.md
 *
 * Executar: cd server && node tests/api/extratoLoteImpedido.api.test.js
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
const ADMIN = { id: 1, nome: 'Adm 222', role: 'admin', is_superadmin: 1, email: 'a222@t.com' };
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 222: o extrato diz quanto esta em lote impedido ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const get = (u) => request(app).get(u);
  const post = (u, b = {}) => request(app).post(u).send(b);
  const put = (u, b = {}) => request(app).put(u).send(b);
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [ADMIN.id, ADMIN.nome, ADMIN.email]);

  const alm = await post(`${API}/almoxarifados`, { codigo: 'ALM222', nome: 'Almox 222' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  await post(`${API}/localizacoes`, { codigo: 'Z222-01', descricao: 'Z222-01', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z222-01'");

  const material = async ({ lote = 1, cliente = null } = {}) => {
    const c = `E222-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id, proprietario_cliente_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, 0, ?, ?)`, [c, c, lote, P01.id, cliente])).lastID;
  };
  const entrar = (m, q, lote) => ok(post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e222', localizacao_destino_id: P01.id, lote }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m, codigo])).id;
  const status = async (m, codigo, st) => ok(put(`${API}/lotes/${await loteId(m, codigo)}/status`,
    { status: st, justificativa: 'teste 222' }));
  const validade = async (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?',
    [data, await loteId(m, codigo)]);
  const extrato = async (m) => (await ok(get(`${API}/materiais/${m}/extrato`))).body.material;
  const impedido = async (m) => {
    const mat = await extrato(m);
    assert.ok(Object.prototype.hasOwnProperty.call(mat, 'lote_impedido'), 'o extrato nao trouxe lote_impedido');
    return mat.lote_impedido;
  };
  const regua = async (m) => (await dbGet(db, `SELECT ${loteImpedidoSql('m')} AS v FROM materiais_almoxarifado m WHERE m.id = ?`, [m])).v;
  const l1l2 = async (opts) => {
    const m = await material(opts);
    await entrar(m, 4, 'L1'); await entrar(m, 6, 'L2');
    return m;
  };
  const vistos = [];

  // ── RN-222.01 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-222.01] L1 ATIVO 4 + L2 BLOQUEADO 6: lote_impedido 6 e o Disponivel continua 10', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO'); vistos.push(m);
    const mat = await extrato(m);
    assert.strictEqual(mat.lote_impedido, 6);
    assert.strictEqual(Number(mat.quantidade_disponivel), 10);
  });

  // ── RN-222.02 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-222.02 a] L2 REPROVADO -> 6', async () => {
    const m = await l1l2(); await status(m, 'L2', 'REPROVADO'); vistos.push(m);
    assert.strictEqual(await impedido(m), 6);
  });
  await test('[RN-222.02 b] L2 ATIVO vencido ontem -> 6', async () => {
    const m = await l1l2(); await validade(m, 'L2', dia(-1)); vistos.push(m);
    assert.strictEqual(await impedido(m), 6);
  });
  await test('[RN-222.02 c] vencido com o vencimento liberado -> 0', async () => {
    const m = await l1l2(); await validade(m, 'L2', dia(-1)); vistos.push(m);
    await ok(put(`${API}/lotes/${await loteId(m, 'L2')}/liberar-vencimento`, { justificativa: 'teste 222' }));
    assert.strictEqual(await impedido(m), 0);
  });
  await test('[RN-222.02 d] o lote que vence hoje ainda nao esta vencido -> 0', async () => {
    const m = await l1l2(); await validade(m, 'L2', dia(0)); vistos.push(m);
    assert.strictEqual(await impedido(m), 0);
  });

  // ── RN-222.03 / .04 ───────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-222.03] sem controle de lote, lote BLOQUEADO 6 -> 0', async () => {
    const m = await material(); await entrar(m, 6, 'L2'); vistos.push(m);
    await dbRun(db, "UPDATE lotes_almoxarifado SET status = 'BLOQUEADO' WHERE material_id = ?", [m]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 0 WHERE id = ?', [m]);
    const mat = await extrato(m);
    assert.strictEqual(mat.lote_impedido, 0);
    assert.strictEqual(Number(mat.quantidade_disponivel), 6);
  });
  await test('[RN-222.04] so lote ATIVO -> 0; material sem lote nem saldo -> 0', async () => {
    const m = await material(); await entrar(m, 4, 'L1'); vistos.push(m);
    assert.strictEqual(await impedido(m), 0);
    const vazio = await material(); vistos.push(vazio);
    assert.strictEqual(await impedido(vazio), 0);
  });

  // ── RN-222.05 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-222.05] a parte bloqueada sem lote conhecido sai do impedido (6 - 2 = 4), como na regua da aprovacao', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO'); vistos.push(m);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 2 WHERE id = ?', [m]);
    assert.strictEqual(await impedido(m), 4);
  });
  await test('[RN-222.05 b] em todo material visto, o extrato e a regua loteImpedidoSql dizem o mesmo numero', async () => {
    assert.ok(vistos.length >= 8, `poucos materiais: ${vistos.length}`);
    for (const m of vistos) {
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual(await impedido(m), await regua(m), `material ${m}`);
    }
  });

  // ── RN-222.06 (T4, integracao) ────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-222.06] extrato 6 -> a recusa da reserva diz 6 -> liberar o lote -> extrato 0 -> a reserva passa', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO');
    assert.strictEqual(await impedido(m), 6);
    const r = await post(`${API}/reservas`, { material_id: m, quantidade: 5, os_referencia: 'OS-222', observacoes: 'e222' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Saldo disponível insuficiente: 4. Não entram 6 un em lote bloqueado, reprovado ou vencido.');
    await status(m, 'L2', 'ATIVO');
    assert.strictEqual(await impedido(m), 0);
    await ok(post(`${API}/reservas`, { material_id: m, quantidade: 5, os_referencia: 'OS-222', observacoes: 'e222' }), 201);
    const mat = await extrato(m);
    assert.strictEqual(Number(mat.quantidade_reservada), 5);
    assert.strictEqual(Number(mat.quantidade_disponivel), 5);
  });

  // ── RN-222.06 b / RN-222.11 (Fase 2) ─────────────────────────────────────────────────────────────────────────────
  // A reserva do sistema (a da OS, B1381) fica SOBRE o lote bloqueado: o impedido passa do disponivel, e a recusa da reserva manual diz o
  // que o lote CORTOU (min(impedido, base), B1470) — menor que o numero do extrato (C527, declarado).
  await test('[RN-222.11] impedido maior que o Disponivel: L1 5 + L2 BLOQUEADO 10 + reserva do sistema de 8 -> impedido 10, disponivel 7', async () => {
    const m = await material(); await entrar(m, 5, 'L1'); await entrar(m, 10, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    const stockService = require('../../services/almoxarifado/stockService');
    await stockService.criarReserva(db, ADMIN, { material_id: m, quantidade: 8, os_referencia: 'OS-SIS-222' }, { sistema: true });
    const mat = await extrato(m);
    assert.strictEqual(mat.lote_impedido, 10);
    assert.strictEqual(Number(mat.quantidade_disponivel), 7);
    assert.strictEqual(mat.lote_impedido, await regua(m));
    // RN-222.06 b: a recusa diz o corte (7), nao o numero do extrato (10) — C527
    const r = await post(`${API}/reservas`, { material_id: m, quantidade: 1, os_referencia: 'OS-222', observacoes: 'e222' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Saldo disponível insuficiente: 0. Não entram 7 un em lote bloqueado, reprovado ou vencido.');
  });

  // ── RN-222.07 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-222.07] material de cliente: o campo vem (o extrato nao filtra o dono)', async () => {
    await dbRun(db, `CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY, razao_social TEXT)`);
    const cli = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente 222')")).lastID;
    const m = await l1l2({ cliente: cli }); await status(m, 'L2', 'BLOQUEADO');
    const mat = await extrato(m);
    assert.strictEqual(mat.lote_impedido, 6);
    assert.strictEqual(mat.proprietario_cliente_nome, 'Cliente 222');
  });

  await test('[contrato] 404 igual: material inexistente', async () => {
    const r = await get(`${API}/materiais/999999/extrato`);
    assert.strictEqual(r.status, 404);
    assert.deepStrictEqual(r.body, { error: 'Material não encontrado' });
  });

  terminou = true;
  console.log(`\n  ${passed} passou, ${failed} falhou\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
