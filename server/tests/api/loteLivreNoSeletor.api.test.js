/**
 * Etapa 241 (C542) — a lista de lotes (`GET /materiais/:id/lotes`) diz quanto de cada lote esta LIVRE para uma saida avulsa:
 * `livre` = max(0, min(saldo do lote, livre do material)) e `livre_do_material`, na regua do motor (livreDeCaixaSql). A reserva nao tem
 * lote (C526): o livre e do material, e nenhum lote sai acima dele. Material com saldo negativo permitido: os dois null.
 *
 * Plano: docs/superpowers/plans/2026-11-18-almoxarifado-etapa241-livre-no-seletor-de-lote.md (RN-241.01, RN-241.06).
 * Executar: cd server && node tests/api/loteLivreNoSeletor.api.test.js
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
const ADMIN = { id: 1, nome: 'Adm 241', role: 'admin', is_superadmin: 1, email: 'a241@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 241: o livre de cada lote na lista de lotes ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const cli = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente 241 LTDA'])).lastID;

  const material = async ({ negativo = 0, cliente = true } = {}) => {
    const c = `E241-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, proprietario_cliente_id)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, 1, 0, ?, ?)`, [c, `Mat ${c}`, negativo, cliente ? cli : null])).lastID;
    return { id, codigo: c };
  };
  const entrar = (m, qtd, lote) => ok(request(app).post(`${API}/movimentacoes/v2`).send({
    material_id: m.id, tipo: 'ENTRADA', quantidade: qtd, motivo: 'e241', lote,
  }), 201);
  const reservar = (m, qtd) => ok(request(app).post(`${API}/reservas`).send({
    material_id: m.id, quantidade: qtd, os_referencia: 'OS-241', observacoes: 'e241',
  }), 201);
  const lotes = async (m) => (await ok(request(app).get(`${API}/materiais/${m.id}/lotes?com_saldo=1`))).body;
  const doLote = (lista, codigo) => {
    const l = lista.find((x) => x.codigo === codigo);
    assert.ok(l, `lote ${codigo} na lista`);
    return l;
  };
  const devolver = (m, qtd, lid) => request(app).post(`${API}/materiais-cliente/devolucoes`).send({
    material_id: m.id, quantidade: qtd, documento_devolucao: `DEV-241-${seq}`, lote_id: lid,
  });

  await test('[RN-241.01] sem reserva: livre = saldo de cada lote; livre_do_material = o disponivel', async () => {
    const m = await material();
    await entrar(m, 3, 'L1');
    await entrar(m, 2, 'L2');
    const lista = await lotes(m);
    assert.strictEqual(doLote(lista, 'L1').livre, 3);
    assert.strictEqual(doLote(lista, 'L2').livre, 2);
    assert.strictEqual(doLote(lista, 'L1').livre_do_material, 5);
    assert.strictEqual(doLote(lista, 'L1').saldo, 3, 'o saldo continua o fisico do lote');
  });

  await test('[RN-241.01] reserva de 4 com 5 no material: livre do material 1, cada lote no maximo 1 (saldo intacto)', async () => {
    const m = await material();
    await entrar(m, 3, 'L1');
    await entrar(m, 2, 'L2');
    await reservar(m, 4);
    const lista = await lotes(m);
    assert.strictEqual(doLote(lista, 'L1').saldo, 3);
    assert.strictEqual(doLote(lista, 'L1').livre, 1);
    assert.strictEqual(doLote(lista, 'L2').livre, 1);
    assert.strictEqual(doLote(lista, 'L2').livre_do_material, 1);
  });

  await test('[RN-241.01] tudo reservado: livre 0 (nunca negativo)', async () => {
    const m = await material();
    await entrar(m, 3, 'L1');
    await reservar(m, 3);
    const l1 = doLote(await lotes(m), 'L1');
    assert.strictEqual(l1.saldo, 3);
    assert.strictEqual(l1.livre, 0);
    assert.strictEqual(l1.livre_do_material, 0);
  });

  await test('[RN-241.01] legado com reservado acima do fisico: livre 0 e livre_do_material 0 (nunca negativo)', async () => {
    const m = await material();
    await entrar(m, 3, 'L1');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = 5 WHERE id = ?', [m.id]);
    const l1 = doLote(await lotes(m), 'L1');
    assert.strictEqual(l1.livre, 0);
    assert.strictEqual(l1.livre_do_material, 0);
  });

  await test('[RN-241.01] lote com mais que o material (baixa gravada sem lote): o livre e o do material', async () => {
    const m = await material();
    await entrar(m, 3, 'L1');
    // a baixa "sem lote" (como o ajuste grava a diferenca) — o lote continua com 3, o material fica com 2
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 2 WHERE id = ?', [m.id]);
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade)
      SELECT material_id, localizacao_id, NULL, -1 FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id IS NOT NULL LIMIT 1`,
    [m.id]);
    const l1 = doLote(await lotes(m), 'L1');
    assert.strictEqual(l1.saldo, 3);
    assert.strictEqual(l1.livre, 2);
  });

  await test('[RN-241.01] saldo negativo permitido: livre e livre_do_material null (o motor nao limita)', async () => {
    const m = await material({ negativo: 1, cliente: false });
    await entrar(m, 3, 'L1');
    await reservar(m, 3);
    const l1 = doLote(await lotes(m), 'L1');
    assert.strictEqual(l1.livre, null);
    assert.strictEqual(l1.livre_do_material, null);
    assert.strictEqual(l1.saldo, 3);
  });

  await test('[RN-241.06] integracao lista x rota: devolver o livre do lote -> 201; livre + 1 -> 400 com o disponivel', async () => {
    const m = await material();
    await entrar(m, 3, 'L1');
    await reservar(m, 2);
    const l1 = doLote(await lotes(m), 'L1');
    assert.strictEqual(l1.livre, 1);
    const r = await devolver(m, l1.livre + 1, l1.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Saldo insuficiente. Disponível: ${l1.livre} UN`);
    await ok(devolver(m, l1.livre, l1.id), 201);
    const depois = (await lotes(m)).find((x) => x.id === l1.id);
    assert.strictEqual(depois.saldo, 2);
    assert.strictEqual(depois.livre, 0, 'o resto esta reservado');
    const fis = await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    assert.strictEqual(Number(fis.q), 2);
  });

  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
