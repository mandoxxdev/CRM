/**
 * Etapa 240 (D (236) 1, B1541) — a devolucao ao cliente escolhe de onde sai. A rota dedicada ja aceitava `localizacao_origem_id`, mas so
 * PREFERIA a origem: a que nao cobria deixava o motor drenar os outros enderecos e o livro gravar "saiu de A" para o que saiu de B (o
 * mesmo defeito que a Etapa 58 fechou na entrega). Desde a 240 a origem informada e ESTRITA (`opcoes.origemEstrita`, a da entrega), e a
 * lista de saldos por endereco diz qual endereco esta bloqueado (`localizacao_bloqueada`), para a janela apagar a opcao.
 *
 * Plano: docs/superpowers/plans/2026-11-18-almoxarifado-etapa240-origem-devolucao-cliente.md (RN-240.01 a .05).
 * Executar: cd server && node tests/api/devolucaoClienteOrigem.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 240', role: 'admin', is_superadmin: 1, email: 'a240@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 240: a devolucao ao cliente escolhe de onde sai (origem estrita) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const cli = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente 240 LTDA'])).lastID;

  const loc = async () => {
    const codigo = `E240-L${++seq}`;
    return { id: (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?, 'e240', 1)", [codigo])).lastID, codigo };
  };
  const bloquear = (l, b = true) => dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = ? WHERE id = ?', [b ? 1 : 0, l.id]);
  const material = async (padrao, { lote = 0 } = {}) => {
    const c = `E240-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, proprietario_cliente_id, localizacao_padrao_id)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, ?, 0, 0, ?, ?)`, [c, `Mat ${c}`, lote, cli, padrao ? padrao.id : null])).lastID;
  };
  const ok = async (p, st) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const entrar = (m, l, q, lote) => ok(request(app).post(`${API}/movimentacoes/v2`).send({
    material_id: m, tipo: 'ENTRADA', quantidade: q, ...(lote ? { lote } : {}), localizacao_destino_id: l.id, motivo: 'e240' }), 201);
  const loteDe = async (m, cod = 'L1') => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m, cod])).id;
  const devolver = (m, q, extra = {}) => request(app).post(`${API}/materiais-cliente/devolucoes`).send({
    material_id: m, quantidade: q, documento_devolucao: `DEV-240-${++seq}`, ...extra });
  const em = async (m, l) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) q FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND localizacao_id IS ?`, [m, l ? l.id : null])).q);
  const fisico = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m])).q);
  const devolucoes = async (m) => Number((await dbGet(db, `SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ?
    AND tipo = 'DEVOLUCAO_CLIENTE'`, [m])).n);
  const naoCobre = (l, tem, q) => `O saldo em ${l.codigo} (${tem}) não cobre a quantidade (${q}) — a saída tiraria de outros endereços`;

  await test('[RN-240.01] sem lote, padrao P bloqueada, saldo em A: com origem A sai 201 de A e o livro grava A (sem origem: a recusa de sempre)', async () => {
    const P = await loc(); const A = await loc();
    const m = await material(P);
    await entrar(m, A, 5);
    await bloquear(P);
    const semOrigem = await devolver(m, 2);
    assert.strictEqual(semOrigem.status, 400, JSON.stringify(semOrigem.body));
    assert.strictEqual(semOrigem.body.error, `Localização ${P.codigo} está bloqueada`);
    await ok(devolver(m, 2, { localizacao_origem_id: A.id }), 201);
    assert.strictEqual(await em(m, A), 3);
    assert.strictEqual(await fisico(m), 3);
    const mov = await dbGet(db, `SELECT localizacao_origem_id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'DEVOLUCAO_CLIENTE'`, [m]);
    assert.strictEqual(Number(mov.localizacao_origem_id), A.id);
  });

  await test('[RN-240.02] origem que nao cobre: 400 com a literal da origem estrita, nada sai de outro endereco (antes: drenava B)', async () => {
    const A = await loc(); const B = await loc();
    const m = await material(B);
    await entrar(m, A, 2);
    await entrar(m, B, 5);
    const r = await devolver(m, 3, { localizacao_origem_id: A.id });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, naoCobre(A, 2, 3));
    assert.strictEqual(await em(m, A), 2);
    assert.strictEqual(await em(m, B), 5);
    assert.strictEqual(await fisico(m), 7);
    assert.strictEqual(await devolucoes(m), 0);
  });

  await test('[RN-240.03] sem origem continua automatico: A 2 + B 5, devolucao de 3 sem origem sai 201 (drena como antes)', async () => {
    const A = await loc(); const B = await loc();
    const m = await material(A);
    await entrar(m, A, 2);
    await entrar(m, B, 5);
    await ok(devolver(m, 3), 201);
    assert.strictEqual(await em(m, A) + await em(m, B), 4);
    assert.strictEqual(await fisico(m), 4);
  });

  await test('[RN-240.02] com lote: L1 em A 3 e em B 4; origem A com 3 sai so de A; com 4 a recusa estrita conta so o lote em A', async () => {
    const A = await loc(); const B = await loc();
    const m = await material(A, { lote: 1 });
    await entrar(m, A, 3, 'L1');
    await entrar(m, B, 4, 'L1');
    const l1 = await loteDe(m);
    const r = await devolver(m, 4, { localizacao_origem_id: A.id, lote_id: l1 });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, naoCobre(A, 3, 4));
    await ok(devolver(m, 3, { localizacao_origem_id: A.id, lote_id: l1 }), 201);
    assert.strictEqual(await em(m, A), 0);
    assert.strictEqual(await em(m, B), 4);
  });

  await test('[RN-240.04] origem bloqueada: 400 "Localização A está bloqueada", nada sai', async () => {
    const A = await loc(); const B = await loc();
    const m = await material(B);
    await entrar(m, A, 5);
    await bloquear(A);
    const r = await devolver(m, 1, { localizacao_origem_id: A.id });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Localização ${A.codigo} está bloqueada`);
    assert.strictEqual(await em(m, A), 5);
  });

  await test('[RN-240.05] saldos por endereco dizem `localizacao_bloqueada` (true na bloqueada, false na livre e na linha sem endereco)', async () => {
    const A = await loc(); const B = await loc();
    const m = await material(null);
    await entrar(m, A, 1);
    await entrar(m, B, 1);
    await bloquear(B);
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade) VALUES (?, NULL, NULL, 0)', [m]);
    const r = await ok(request(app).get(`${API}/estoque/${m}/saldos`), 200);
    const de = (l) => r.body.find((s) => s.localizacao_id === (l ? l.id : null));
    assert.strictEqual(de(A).localizacao_bloqueada, false);
    assert.strictEqual(de(B).localizacao_bloqueada, true);
    assert.strictEqual(de(null).localizacao_bloqueada, false);
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
