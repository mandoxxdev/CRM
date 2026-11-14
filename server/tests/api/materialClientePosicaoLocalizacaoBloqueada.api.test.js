/**
 * Etapa 237 (C543, B1542) — a posicao de Materiais de Clientes diz, por item, o codigo da localizacao padrao e se ela esta bloqueada. A
 * janela de devolucao ao cliente usa isso para avisar antes de confirmar: com a padrao bloqueada a devolucao sem origem e recusada pelo motor
 * ("Localizacao X esta bloqueada"), mesmo com a peca em outro endereco. O motor NAO muda nesta etapa.
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa237-devolucao-cliente-localizacao-bloqueada.md (RN-237.01 e .02).
 * Executar: cd server && node tests/api/materialClientePosicaoLocalizacaoBloqueada.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 237', role: 'admin', is_superadmin: 1, email: 'a237@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 237: a posicao do material de cliente diz se a localizacao padrao esta bloqueada ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  // `projetos` e `ordens_servico` sao CORE (fora do initSchema do almoxarifado); a posicao as le. Molde: materialClientePosicao.
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS projetos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)');
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT, cliente_id INTEGER,
    projeto_id INTEGER, status TEXT)`);
  const cli = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente 237 LTDA'])).lastID;
  const loc = async () => {
    const codigo = `E237-L${++seq}`;
    return { id: (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?, 'e237', 1)", [codigo])).lastID, codigo };
  };
  const material = async (locId) => {
    const c = `E237-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, proprietario_cliente_id, localizacao_padrao_id)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, 0, 0, 0, ?, ?)`, [c, `Mat ${c}`, cli, locId])).lastID;
    return { id, codigo: c };
  };
  const bloquear = (l, b) => dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = ? WHERE id = ?', [b ? 1 : 0, l.id]);
  const posicao = async () => (await ok(request(app).get(`${API}/materiais-cliente/posicao?cliente_id=${cli}`))).body;
  const itemDe = async (m) => (await posicao()).itens.find((i) => i.material_id === m.id);
  const devolver = (m) => request(app).post(`${API}/materiais-cliente/devolucoes`).send({
    material_id: m.id, quantidade: 1, documento_devolucao: `DEV-237-${++seq}`,
  });

  const lA = await loc();
  const lB = await loc();
  const mA = await material(lA.id);
  const mB = await material(lB.id);
  const mSem = await material(null);
  for (const m of [mA, mB]) {
    await ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'ENTRADA', quantidade: 3, motivo: 'e237' }), 201);
  }
  await bloquear(lB, true);

  await test('[RN-237.01] cada item traz o codigo da localizacao padrao e se ela esta bloqueada', async () => {
    const a = await itemDe(mA);
    const b = await itemDe(mB);
    assert.strictEqual(a.localizacao_padrao_codigo, lA.codigo);
    assert.strictEqual(a.localizacao_padrao_bloqueada, false);
    assert.strictEqual(b.localizacao_padrao_codigo, lB.codigo);
    assert.strictEqual(b.localizacao_padrao_bloqueada, true);
  });

  await test('[RN-237.01] sem localizacao padrao: codigo null e bloqueada false', async () => {
    const s = await itemDe(mSem);
    assert.strictEqual(s.localizacao_padrao_codigo, null);
    assert.strictEqual(s.localizacao_padrao_bloqueada, false);
  });

  await test('[RN-237.01] os campos antigos continuam (saldo, controle de lote/serie)', async () => {
    const a = await itemDe(mA);
    assert.strictEqual(Number(a.saldo), 3);
    assert.strictEqual(a.controle_lote, 0);
    assert.strictEqual(a.controle_serie, 0);
  });

  await test('[RN-237.02] bloqueada=true <=> a devolucao e recusada com a mensagem do motor; desbloqueada, sai', async () => {
    const r = await devolver(mB);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Localização ${lB.codigo} está bloqueada`);
    await ok(devolver(mA), 201);
    await bloquear(lB, false);
    assert.strictEqual((await itemDe(mB)).localizacao_padrao_bloqueada, false);
    await ok(devolver(mB), 201);
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  terminou = true;
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
