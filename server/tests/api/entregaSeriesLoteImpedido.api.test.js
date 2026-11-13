/**
 * Etapa 232 (D (231) 1; B1523) — a listagem de series diz a situacao do lote de cada serie, para a janela de entrega apagar a serie de lote
 * impedido (bloqueado, reprovado ou vencido sem a liberacao) ANTES do clique. E a porta recusa a serie impedida e aceita a boa: a serie que a
 * tela apaga e a que seria recusada.
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa232-entrega-series-lote-impedido.md (RN-232.01, RN-232.02).
 * Executar: cd server && node tests/api/entregaSeriesLoteImpedido.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 232', role: 'admin', is_superadmin: 1, email: 'a232@t.com' };
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 232: a listagem de series diz a situacao do lote ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');

  const material = async ({ lote = 1 } = {}) => {
    const c = `E232-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, ?, 1, 0)`, [c, `Mat ${c}`, lote])).lastID;
    return { id, nome: `Mat ${c}` };
  };
  const entrar = (m, numeros, lote) => ok(request(app).post(`${API}/movimentacoes/v2`).send({
    material_id: m.id, tipo: 'ENTRADA', quantidade: numeros.length, motivo: 'e232', series: numeros, ...(lote ? { lote } : {}),
  }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const statusLote = async (m, codigo, st) => ok(request(app).put(`${API}/lotes/${await loteId(m, codigo)}/status`)
    .send({ status: st, justificativa: 'teste 232' }));
  const listar = async (m) => (await ok(request(app).get(`${API}/materiais/${m.id}/series?status=EM_ESTOQUE`))).body;
  const sit = (s) => ({ status: s.lote_status, impedido: s.lote_esta_impedido, vencido: s.lote_vencido_sem_liberacao });
  const porNumero = (lista, n) => lista.find((s) => s.numero === n);
  const serieId = async (m, n) => (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [m.id, n])).id;

  // A montagem: S1 e S2 em L1, S3 e S4 em L2 (ATIVOS).
  const montar = async () => {
    const m = await material();
    await entrar(m, ['S1', 'S2'], 'L1');
    await entrar(m, ['S3', 'S4'], 'L2');
    return m;
  };

  // ── RN-232.01 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-232.01] L2 BLOQUEADO -> a serie de L2 diz BLOQUEADO, impedido true; a de L1 ATIVO, false; lote_codigo continua', async () => {
    const m = await montar();
    const antes = await listar(m);
    assert.deepStrictEqual(sit(porNumero(antes, 'S3')), { status: 'ATIVO', impedido: false, vencido: false }, 'controle: L2 ATIVO');
    await statusLote(m, 'L2', 'BLOQUEADO');
    const l = await listar(m);
    assert.deepStrictEqual(sit(porNumero(l, 'S3')), { status: 'BLOQUEADO', impedido: true, vencido: false });
    assert.deepStrictEqual(sit(porNumero(l, 'S4')), { status: 'BLOQUEADO', impedido: true, vencido: false });
    assert.deepStrictEqual(sit(porNumero(l, 'S1')), { status: 'ATIVO', impedido: false, vencido: false });
    assert.strictEqual(porNumero(l, 'S3').lote_codigo, 'L2');
    assert.strictEqual(porNumero(l, 'S1').lote_validade, null);
    await statusLote(m, 'L2', 'ATIVO');
    assert.deepStrictEqual(sit(porNumero(await listar(m), 'S3')), { status: 'ATIVO', impedido: false, vencido: false }, 'liberado: volta');
  });
  await test('[RN-232.01] L2 REPROVADO -> impedido true', async () => {
    const m = await montar();
    await statusLote(m, 'L2', 'REPROVADO');
    assert.deepStrictEqual(sit(porNumero(await listar(m), 'S3')), { status: 'REPROVADO', impedido: true, vencido: false });
  });
  await test('[RN-232.01] L2 ATIVO vencido ontem -> impedido e vencido true, a validade crua; vence hoje -> false', async () => {
    const m = await montar();
    await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?', [dia(-1), await loteId(m, 'L2')]);
    const s = porNumero(await listar(m), 'S3');
    assert.deepStrictEqual(sit(s), { status: 'ATIVO', impedido: true, vencido: true });
    assert.strictEqual(String(s.lote_validade).slice(0, 10), dia(-1));
    await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?', [dia(0), await loteId(m, 'L2')]);
    assert.deepStrictEqual(sit(porNumero(await listar(m), 'S3')), { status: 'ATIVO', impedido: false, vencido: false }, 'vence hoje: sai');
  });
  await test('[RN-232.01] vencido ontem COM o vencimento liberado -> false (a regua da 224)', async () => {
    const m = await montar();
    await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ?, vencimento_liberado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [dia(-1), await loteId(m, 'L2')]);
    assert.deepStrictEqual(sit(porNumero(await listar(m), 'S3')), { status: 'ATIVO', impedido: false, vencido: false });
  });
  await test('[RN-232.01] serie sem lote -> false, false, status null; a listagem sem filtro tambem traz os campos', async () => {
    const m = await material({ lote: 0 });
    await entrar(m, ['N1']);
    const s = porNumero(await listar(m), 'N1');
    assert.strictEqual(s.lote_id ?? null, null, 'premissa: sem lote');
    assert.deepStrictEqual(sit(s), { status: null, impedido: false, vencido: false });
    assert.strictEqual(s.lote_validade, null);
    const m2 = await montar();
    await statusLote(m2, 'L2', 'BLOQUEADO');
    const todas = (await ok(request(app).get(`${API}/materiais/${m2.id}/series`))).body;
    assert.strictEqual(porNumero(todas, 'S3').lote_esta_impedido, true);
  });

  // ── RN-232.02 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const req = async (m, q) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E232-${++seq}`])).lastID;
    const item = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m.id, q])).lastID;
    await requisitionService.separarRequisicao(db, R, [{ item_id: item, quantidade_separada: q }], ADMIN);
    return { R, item };
  };
  const entregar = (R, linhas) => request(app).put(`${API}/requisicoes/${R}/entregar`).send({ itens_atendidos: linhas });
  const entregue = async (item) => Number((await dbGet(db, 'SELECT quantidade_entregue q FROM itens_requisicao_almoxarifado WHERE id = ?',
    [item])).q);
  const statusSeries = async (m) => (await dbAll(db, 'SELECT numero, status FROM series_almoxarifado WHERE material_id = ? ORDER BY numero',
    [m.id])).map((s) => [s.numero, s.status]);

  await test('[RN-232.02] L2 BLOQUEADO: series de L2 no automatico -> 400 e nada baixa; series de L1 -> 200 e ficam ENTREGUE', async () => {
    const m = await montar();
    const { R, item } = await req(m, 2);
    await statusLote(m, 'L2', 'BLOQUEADO');
    const r = await entregar(R, [{ item_id: item, quantidade_atendida: 2, origem_automatica: true,
      serie_ids: [await serieId(m, 'S3'), await serieId(m, 'S4')] }]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `${m.nome}: Lote L2 esta bloqueado e nao pode ser utilizado`);
    assert.strictEqual(await entregue(item), 0);
    assert.deepStrictEqual(await statusSeries(m), [['S1', 'EM_ESTOQUE'], ['S2', 'EM_ESTOQUE'], ['S3', 'EM_ESTOQUE'], ['S4', 'EM_ESTOQUE']]);
    await ok(entregar(R, [{ item_id: item, quantidade_atendida: 2, origem_automatica: true,
      serie_ids: [await serieId(m, 'S1'), await serieId(m, 'S2')] }]));
    assert.strictEqual(await entregue(item), 2);
    assert.deepStrictEqual(await statusSeries(m), [['S1', 'ENTREGUE'], ['S2', 'ENTREGUE'], ['S3', 'EM_ESTOQUE'], ['S4', 'EM_ESTOQUE']]);
  });
  await test('[RN-232.02] L2 vencido ontem: series de L2 -> 400 (o vencido tambem nao sai); com o vencimento liberado -> 200', async () => {
    const m = await montar();
    const { R, item } = await req(m, 1);
    await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?', [dia(-1), await loteId(m, 'L2')]);
    const r = await entregar(R, [{ item_id: item, quantidade_atendida: 1, origem_automatica: true, serie_ids: [await serieId(m, 'S3')] }]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(r.body.error.startsWith(`${m.nome}: Lote L2 vencido em `), r.body.error);
    assert.strictEqual(await entregue(item), 0);
    await dbRun(db, 'UPDATE lotes_almoxarifado SET vencimento_liberado_em = CURRENT_TIMESTAMP WHERE id = ?', [await loteId(m, 'L2')]);
    await ok(entregar(R, [{ item_id: item, quantidade_atendida: 1, origem_automatica: true, serie_ids: [await serieId(m, 'S3')] }]));
    assert.strictEqual(await entregue(item), 1);
  });

  terminou = true;
  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
