/**
 * Etapa 235 (D (233) 3, parte da devolucao ao cliente; B1535, B1536, B1537) — a devolucao ao cliente (`POST /materiais-cliente/devolucoes`)
 * de material com serie confere e grava o lote das series, com a mesma regua da saida avulsa (233 e 234): a serie de lote bloqueado,
 * reprovado ou vencido nao sai; com o lote em branco e as series de um lote so, o livro e a linha baixada sao desse lote; series de lotes
 * diferentes sao recusadas. Antes desta etapa (sonda da Fase 0) a devolucao de B1 (lote L2 BLOQUEADO) saia com 201 e gravava "sem lote"
 * (-1), e `[A1, B1]` passava. A posicao do cliente passa a dizer se o item pede serie/lote (a janela de devolucao precisa saber).
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa235-devolucao-cliente-lote-das-series.md (RN-235.01 a .06).
 * Executar: cd server && node tests/api/devolucaoClienteLoteDasSeries.api.test.js
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
const ADMIN = { id: 1, nome: 'Adm 235', role: 'admin', is_superadmin: 1, email: 'a235@t.com' };
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 235: a devolucao ao cliente confere e grava o lote das series ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const cli = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente 235 LTDA'])).lastID;

  const material = async ({ lote = 0, serie = 1 } = {}) => {
    const c = `E235-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, proprietario_cliente_id)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, ?, ?, 0, ?)`, [c, `Mat ${c}`, lote, serie, cli])).lastID;
    return { id, codigo: c };
  };
  const entrar = (m, numeros, lote) => ok(request(app).post(`${API}/movimentacoes/v2`).send({
    material_id: m.id, tipo: 'ENTRADA', quantidade: numeros.length, motivo: 'e235', series: numeros, ...(lote ? { lote } : {}),
  }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const statusLote = async (m, codigo, st) => ok(request(app).put(`${API}/lotes/${await loteId(m, codigo)}/status`)
    .send({ status: st, justificativa: 'teste 235' }));
  const sid = async (m, n) => (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [m.id, n])).id;
  const serie = async (m, n) => dbGet(db, 'SELECT status, lote_id FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [m.id, n]);
  const fisico = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q);
  const linhaDoLote = async (m, loteIdOuNull) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) q
    FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id IS ?`, [m.id, loteIdOuNull])).q);
  const resumo = async (m) => (await ok(request(app).get(`${API}/materiais/${m.id}/lotes/resumo`))).body;
  const devolucoes = async (m) => dbAll(db, `SELECT id, lote_id, lote, documento_vinculado FROM movimentacoes_almoxarifado
    WHERE material_id = ? AND tipo = 'DEVOLUCAO_CLIENTE' ORDER BY id`, [m.id]);
  const devolver = async (m, numeros, extra = {}) => request(app).post(`${API}/materiais-cliente/devolucoes`).send({
    material_id: m.id, quantidade: numeros.length, documento_devolucao: `DEV-235-${seq}`,
    serie_ids: await Promise.all(numeros.map((n) => sid(m, n))), ...extra,
  });
  // A montagem: A1 em L1 e B1, B2 em L2 (ATIVOS), material de cliente com serie e SEM controle de lote.
  const montar = async (opc) => {
    const m = await material(opc);
    await entrar(m, ['A1'], 'L1');
    await entrar(m, ['B1', 'B2'], 'L2');
    return m;
  };
  const nadaSaiu = async (m, numeros) => {
    for (const n of numeros) assert.strictEqual((await serie(m, n)).status, 'EM_ESTOQUE', `${n} continua em estoque`);
    assert.strictEqual(await fisico(m), 3, 'fisico igual');
    assert.strictEqual((await devolucoes(m)).length, 0, 'nenhuma devolucao no livro');
    assert.strictEqual(await linhaDoLote(m, null), 0, 'nenhuma linha sem lote mexida');
  };

  // ── RN-235.01 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-235.01] devolucao [B1] com o lote em branco -> 201, o livro e a linha baixada sao do L2, o resumo fecha', async () => {
    const m = await montar();
    await ok(devolver(m, ['B1']), 201);
    const [d] = await devolucoes(m);
    const l2 = await loteId(m, 'L2');
    assert.strictEqual(Number(d.lote_id), l2, 'o livro grava o lote das series');
    assert.strictEqual(d.lote, 'L2');
    assert.ok(/^DEV-235-/.test(d.documento_vinculado), 'o documento continua no livro');
    assert.strictEqual(await linhaDoLote(m, l2), 1, 'a linha do L2 baixou');
    assert.strictEqual(await linhaDoLote(m, await loteId(m, 'L1')), 1, 'o L1 nao mexeu');
    assert.strictEqual(await linhaDoLote(m, null), 0, 'nenhuma linha sem lote negativa');
    const r = await resumo(m);
    assert.strictEqual(Number(r.fisico), 2);
    assert.strictEqual(Number(r.soma_lotes), 2);
    assert.strictEqual(Number(r.sem_lote_atribuido), 0);
    assert.strictEqual((await serie(m, 'B1')).status, 'ENTREGUE');
  });

  // ── RN-235.02 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-235.02] o estorno da devolucao derivada devolve ao L2', async () => {
    const m = await montar();
    const r = await ok(devolver(m, ['B1']), 201);
    await ok(request(app).post(`${API}/movimentacoes/${r.body.id}/cancelar`).send({ motivo: 'estorno do teste 235' }));
    const l2 = await loteId(m, 'L2');
    const est = await dbGet(db, "SELECT lote_id, lote FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ESTORNO'", [m.id]);
    assert.strictEqual(Number(est.lote_id), l2, 'o estorno grava o L2');
    assert.strictEqual(await linhaDoLote(m, l2), 2);
    assert.strictEqual(await linhaDoLote(m, null), 0);
    const b1 = await serie(m, 'B1');
    assert.strictEqual(b1.status, 'EM_ESTOQUE');
    assert.strictEqual(Number(b1.lote_id), l2);
    assert.strictEqual(Number((await resumo(m)).sem_lote_atribuido), 0);
  });

  // ── RN-235.03 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  for (const st of ['BLOQUEADO', 'REPROVADO']) {
    await test(`[RN-235.03] L2 ${st} -> a serie B1 nao sai (a mensagem da guarda), nada sai`, async () => {
      const m = await montar();
      await statusLote(m, 'L2', st);
      const r = await devolver(m, ['B1']);
      assert.strictEqual(r.status, 400, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, `Lote L2 esta ${st.toLowerCase()} e nao pode ser utilizado`);
      await nadaSaiu(m, ['B1']);
    });
  }
  await test('[RN-235.03] L2 vencido ontem -> 400 vencido (B1537: a devolucao ao cliente nao e descarte), nada sai', async () => {
    const m = await montar();
    await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?', [dia(-1), await loteId(m, 'L2')]);
    const r = await devolver(m, ['B1']);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(r.body.error.startsWith(`Lote L2 vencido em ${dia(-1)} nao pode sair para consumo.`), r.body.error);
    await nadaSaiu(m, ['B1']);
  });

  // ── RN-235.04 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-235.04] [A1, B1] -> 400 lotes diferentes, nada sai', async () => {
    const m = await montar();
    const r = await devolver(m, ['A1', 'B1']);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'As series escolhidas sao de lotes diferentes (L1, L2): faca uma saida para cada lote');
    await nadaSaiu(m, ['A1', 'B1']);
  });
  await test('[RN-235.04] serie sem lote + A1 -> 400 "(L1, sem lote)"', async () => {
    const m = await montar();
    await entrar(m, ['S1']);
    const r = await devolver(m, ['S1', 'A1']);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'As series escolhidas sao de lotes diferentes (L1, sem lote): faca uma saida para cada lote');
    assert.strictEqual((await serie(m, 'S1')).status, 'EM_ESTOQUE');
    assert.strictEqual((await serie(m, 'A1')).status, 'EM_ESTOQUE');
  });

  // ── RN-235.05 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-235.05] lote escolhido (L2) -> 201 com o L2, como antes', async () => {
    const m = await montar();
    await ok(devolver(m, ['B2'], { lote_id: await loteId(m, 'L2') }), 201);
    assert.strictEqual(Number((await devolucoes(m))[0].lote_id), await loteId(m, 'L2'));
  });
  await test('[RN-235.05] series todas sem lote -> 201 com lote NULL, como antes', async () => {
    const m = await material();
    await entrar(m, ['S1', 'S2']);
    await ok(devolver(m, ['S1']), 201);
    assert.strictEqual((await devolucoes(m))[0].lote_id, null);
    assert.strictEqual(await linhaDoLote(m, null), 1);
  });
  await test('[RN-235.05] material de cliente com controle de lote e o lote em branco -> exige lote, como antes', async () => {
    const m = await material({ lote: 1 });
    await entrar(m, ['C1'], 'L9');
    const r = await devolver(m, ['C1']);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(/exige lote/.test(r.body.error), r.body.error);
    assert.strictEqual((await serie(m, 'C1')).status, 'EM_ESTOQUE');
  });

  // ── RN-235.06 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-235.06] a posicao do cliente diz controle_serie e controle_lote de cada item', async () => {
    // tabelas CORE fora do initSchema do almoxarifado (precedente de materialClientePosicao) — so aqui, no ultimo teste
    await dbRun(db, 'CREATE TABLE IF NOT EXISTS projetos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)');
    await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT, cliente_id INTEGER,
      projeto_id INTEGER, status TEXT)`);
    const comSerie = await material();
    const comLote = await material({ lote: 1, serie: 0 });
    const r = await ok(request(app).get(`${API}/materiais-cliente/posicao?cliente_id=${cli}`));
    const item = (id) => r.body.itens.find((i) => i.material_id === id);
    assert.ok(item(comSerie.id), JSON.stringify(r.body.itens.map((i) => i.material_id)));
    assert.strictEqual(item(comSerie.id).controle_serie, 1);
    assert.strictEqual(item(comSerie.id).controle_lote, 0);
    assert.strictEqual(item(comLote.id).controle_serie, 0);
    assert.strictEqual(item(comLote.id).controle_lote, 1);
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  terminou = true;
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
