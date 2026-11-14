/**
 * Etapa 236 (D (235) 1; B1539 a B1541) — a janela de devolucao ao cliente ganha o seletor de lote. O servidor NAO muda: este arquivo prova o
 * contrato que a janela consome. Material de cliente com controle de lote e SEM serie (o caso que a 235 nao cobria): `lote_id` de lote ATIVO
 * sai dele; bloqueado, vencido sem liberacao e quantidade acima da linha do lote sao recusados com as mensagens do motor; o vencido liberado
 * sai. E a integracao lista x rota: a lista `?com_saldo=1` que a janela mostra marca `elegivel` exatamente nos lotes que a rota aceita.
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa236-devolucao-cliente-seletor-de-lote.md (RN-236.08).
 * Executar: cd server && node tests/api/devolucaoClienteSeletorDeLote.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 236', role: 'admin', is_superadmin: 1, email: 'a236@t.com' };
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 236: a devolucao ao cliente de material com controle de lote, pelo lote escolhido ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const cli = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente 236 LTDA'])).lastID;

  const material = async () => {
    const c = `E236-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, proprietario_cliente_id)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, 1, 0, 0, ?)`, [c, `Mat ${c}`, cli])).lastID;
    return { id, codigo: c };
  };
  const entrar = (m, qtd, lote) => ok(request(app).post(`${API}/movimentacoes/v2`).send({
    material_id: m.id, tipo: 'ENTRADA', quantidade: qtd, motivo: 'e236', lote,
  }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const linhaDoLote = async (m, lid) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) q
    FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id IS ?`, [m.id, lid])).q);
  const fisico = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q);
  const devolucoes = async (m) => dbAll(db, `SELECT id, lote_id, quantidade FROM movimentacoes_almoxarifado
    WHERE material_id = ? AND tipo = 'DEVOLUCAO_CLIENTE' ORDER BY id`, [m.id]);
  const devolver = (m, qtd, lid) => request(app).post(`${API}/materiais-cliente/devolucoes`).send({
    material_id: m.id, quantidade: qtd, documento_devolucao: `DEV-236-${seq}`, lote_id: lid,
  });
  const lotes = async (m) => (await ok(request(app).get(`${API}/materiais/${m.id}/lotes?com_saldo=1`))).body;
  // A montagem: L1 com 3 e L2 com 2, os dois ATIVOS e sem validade.
  const montar = async () => {
    const m = await material();
    await entrar(m, 3, 'L1');
    await entrar(m, 2, 'L2');
    return m;
  };
  const nadaSaiu = async (m) => {
    assert.strictEqual(await fisico(m), 5, 'fisico igual');
    assert.strictEqual((await devolucoes(m)).length, 0, 'nenhuma devolucao no livro');
    assert.strictEqual(await linhaDoLote(m, await loteId(m, 'L1')), 3, 'L1 igual');
    assert.strictEqual(await linhaDoLote(m, await loteId(m, 'L2')), 2, 'L2 igual');
  };

  await test('[RN-236.08] lote ATIVO escolhido -> 201, o livro grava o lote e so a linha dele baixa', async () => {
    const m = await montar();
    const l2 = await loteId(m, 'L2');
    await ok(devolver(m, 2, l2), 201);
    const [d] = await devolucoes(m);
    assert.strictEqual(Number(d.lote_id), l2);
    assert.strictEqual(await linhaDoLote(m, l2), 0, 'L2 baixou');
    assert.strictEqual(await linhaDoLote(m, await loteId(m, 'L1')), 3, 'L1 intocado');
    assert.strictEqual(await fisico(m), 3);
  });

  for (const st of ['BLOQUEADO', 'REPROVADO']) {
    await test(`[RN-236.08] lote ${st} -> 400 com a mensagem do motor, nada sai`, async () => {
      const m = await montar();
      await ok(request(app).put(`${API}/lotes/${await loteId(m, 'L2')}/status`).send({ status: st, justificativa: 'teste 236' }));
      const r = await devolver(m, 1, await loteId(m, 'L2'));
      assert.strictEqual(r.status, 400, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, `Lote L2 esta ${st.toLowerCase()} e nao pode ser utilizado`);
      await nadaSaiu(m);
    });
  }

  await test('[RN-236.08] lote vencido sem liberacao -> 400 vencido (B1537), nada sai', async () => {
    const m = await montar();
    await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?', [dia(-1), await loteId(m, 'L2')]);
    const r = await devolver(m, 1, await loteId(m, 'L2'));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(r.body.error.startsWith(`Lote L2 vencido em ${dia(-1)} nao pode sair para consumo.`), r.body.error);
    await nadaSaiu(m);
  });

  await test('[RN-236.08] lote vencido COM liberacao -> 201 pelo lote', async () => {
    const m = await montar();
    const l2 = await loteId(m, 'L2');
    await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?', [dia(-1), l2]);
    await ok(request(app).put(`${API}/lotes/${l2}/liberar-vencimento`).send({ justificativa: 'devolver ao dono' }));
    await ok(devolver(m, 1, l2), 201);
    assert.strictEqual(Number((await devolucoes(m))[0].lote_id), l2);
    assert.strictEqual(await linhaDoLote(m, l2), 1);
  });

  await test('[RN-236.08] quantidade acima da linha do lote -> 400 "Saldo insuficiente no lote", nada sai', async () => {
    const m = await montar();
    const r = await devolver(m, 3, await loteId(m, 'L2'));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Saldo insuficiente no lote L2. Disponível: 2 UN');
    await nadaSaiu(m);
  });

  await test('[RN-236.08] integracao: a rota aceita exatamente os lotes que a lista marca como elegiveis', async () => {
    // L1 ATIVO, L2 BLOQUEADO, L3 vencido, L4 vencido liberado, L5 REPROVADO — 1 de cada.
    const m = await material();
    for (const c of ['L1', 'L2', 'L3', 'L4', 'L5']) await entrar(m, 1, c);
    await ok(request(app).put(`${API}/lotes/${await loteId(m, 'L2')}/status`).send({ status: 'BLOQUEADO', justificativa: 't' }));
    await ok(request(app).put(`${API}/lotes/${await loteId(m, 'L5')}/status`).send({ status: 'REPROVADO', justificativa: 't' }));
    for (const c of ['L3', 'L4']) {
      await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?', [dia(-2), await loteId(m, c)]);
    }
    await ok(request(app).put(`${API}/lotes/${await loteId(m, 'L4')}/liberar-vencimento`).send({ justificativa: 't' }));
    const lista = await lotes(m);
    assert.deepStrictEqual(lista.map((l) => l.codigo).sort(), ['L1', 'L2', 'L3', 'L4', 'L5']);
    const aceitos = [];
    for (const l of lista) {
      const r = await devolver(m, 1, l.id);
      if (r.status === 201) aceitos.push(l.codigo);
      else assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    }
    assert.deepStrictEqual(aceitos.sort(), lista.filter((l) => l.elegivel === true).map((l) => l.codigo).sort());
    assert.deepStrictEqual(aceitos.sort(), ['L1', 'L4'], 'controle: a lista marcou os dois certos');
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  terminou = true;
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
