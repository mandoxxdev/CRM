/**
 * Etapa 244 (resto da D (233) 3) — o retalho de peca com numero de serie. A estimativa previa "a baixa do original grava o lote"; a sonda
 * da Fase 0 mediu que a geracao de retalho RECUSA a baixa de origem com controle de serie antes de mover (Etapa 9 — a compensacao nao
 * conseguiria estornar uma saida sem serie), entao nao ha lote a gravar. Este arquivo fixa, pela ROTA, a recusa (literal, nada gravado) e o
 * caminho que ela ensina: Saida avulsa (v2, que grava o lote das series desde a Etapa 234) e o retalho sem baixa.
 *
 * Plano: docs/superpowers/plans/2026-11-18-almoxarifado-etapa244-retalho-peca-com-serie.md (RN-244.01, .02).
 * Executar: cd server && node tests/api/retalhoPecaComSerie.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 244', role: 'admin', is_superadmin: 1, email: 'a244@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const recusa = (codigo) => `O material ${codigo} tem controle de serie e a geracao de retalho nao tem campo para dizer QUAL numero de `
  + 'serie esta sendo cortado. Baixe a peca pela tela de Movimentacoes (que tem seletor de serie) e depois registre o retalho aqui no '
  + 'modo "peca ja baixada do estoque".';

(async () => {
  console.log('\n=== Etapa 244: retalho de peca com numero de serie ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };

  const material = async ({ serie = 1 } = {}) => {
    const c = `E244-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, 0, ?, 0)`, [c, `Mat ${c}`, serie])).lastID;
    return { id, codigo: c };
  };
  const entrar = (m, numeros, lote) => ok(request(app).post(`${API}/movimentacoes/v2`).send({
    material_id: m.id, tipo: 'ENTRADA', quantidade: numeros.length, motivo: 'e244', series: numeros, lote,
  }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const sid = async (m, n) => (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [m.id, n])).id;
  const series = async (m) => dbAll(db, 'SELECT numero, status, lote_id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero',
    [m.id]);
  const fisico = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q);
  const movs = async (m) => dbAll(db, 'SELECT tipo, quantidade, lote_id FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id',
    [m.id]);
  const sobras = async (m) => dbAll(db, 'SELECT * FROM sobras_material_almoxarifado WHERE material_id = ?', [m.id]);
  const resumo = async (m) => (await ok(request(app).get(`${API}/materiais/${m.id}/lotes/resumo`))).body;
  const gerar = (body) => request(app).post(`${API}/sobras/gerar-retalho`).send(body);

  // A montagem: A1, A2 no L1 e B1, B2 no L2, material com serie e SEM controle de lote; o material do retalho, sem serie.
  const montar = async () => {
    const m = await material();
    await entrar(m, ['A1', 'A2'], 'L1');
    await entrar(m, ['B1', 'B2'], 'L2');
    const ret = await material({ serie: 0 });
    return { m, ret };
  };

  // ── RN-244.01 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  for (const comLote of [false, true]) {
    await test(`[RN-244.01] retalho COM baixa de origem com serie${comLote ? ' citando o lote L2' : ''} -> 400 literal, nada gravado`, async () => {
      const { m, ret } = await montar();
      const antesSeries = await series(m);
      const r = await gerar({
        material_origem_id: m.id, material_retalho_id: ret.id, baixar_original: true, quantidade_baixa: 1, justificativa: 'corte 244',
        ...(comLote ? { lote_origem_id: await loteId(m, 'L2') } : {}),
      });
      assert.strictEqual(r.status, 400, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, recusa(m.codigo));
      assert.deepStrictEqual((await movs(m)).map((x) => x.tipo), ['ENTRADA', 'ENTRADA'], 'nenhuma saida na origem');
      assert.strictEqual((await movs(ret)).length, 0, 'nenhuma entrada no retalho');
      assert.strictEqual((await sobras(m)).length, 0, 'nenhuma sobra');
      assert.strictEqual(await fisico(m), 4);
      assert.strictEqual(await fisico(ret), 0);
      assert.deepStrictEqual(await series(m), antesSeries, 'series iguais');
      const rs = await resumo(m);
      assert.strictEqual(Number(rs.fisico), 4);
      assert.strictEqual(Number(rs.sem_lote_atribuido), 0);
    });
  }

  await test('[RN-244.01] (Fase 2, achado 2) origem com serie E retalho com serie -> a recusa e a da origem (vem antes)', async () => {
    const { m } = await montar();
    const retSerie = await material();
    const r = await gerar({ material_origem_id: m.id, material_retalho_id: retSerie.id, baixar_original: true, quantidade_baixa: 1,
      justificativa: 'corte 244' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, recusa(m.codigo));
    assert.strictEqual(await fisico(m), 4);
  });

  await test('[RN-244.01] (Fase 5, achado 10) origem com LOTE e serie, sem lote_origem_id -> a recusa e a da serie (vem antes da do lote)', async () => {
    const { m, ret } = await montar();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 1 WHERE id = ?', [m.id]);
    const r = await gerar({ material_origem_id: m.id, material_retalho_id: ret.id, baixar_original: true, quantidade_baixa: 1,
      justificativa: 'corte 244' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, recusa(m.codigo));
  });

  await test('[RN-244.05] (Fase 5, achado 1) a serie ligada entre a conferencia e a baixa -> o motor recusa a baixa sem serie, nada gravado', async () => {
    const m = await material({ serie: 0 });
    await ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'ENTRADA', quantidade: 4, motivo: 'e244' }), 201);
    const ret = await material({ serie: 0 });
    // O gancho so liga a serie e segue: o gesto concorrente e um UPDATE direto, sem trava (nao herda contexto de secao nenhuma).
    const original = stockService.registrarMovimentacao;
    let ligou = false;
    stockService.registrarMovimentacao = async (...args) => {
      if (!ligou && args[2] && args[2].tipo === 'SAIDA' && Number(args[2].material_id) === m.id) {
        ligou = true;
        await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_serie = 1 WHERE id = ?', [m.id]);
      }
      return original(...args);
    };
    let r;
    try {
      r = await gerar({ material_origem_id: m.id, material_retalho_id: ret.id, baixar_original: true, quantidade_baixa: 1,
        justificativa: 'corte 244' });
    } finally { stockService.registrarMovimentacao = original; }
    assert.ok(ligou, 'o gancho rodou (sem ele o teste prova nada)');
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'material com controle de serie: informe 1 serie(s) para 1 unidade(s) — recebidas 0');
    assert.strictEqual(await fisico(m), 4, 'nada baixado');
    assert.deepStrictEqual((await movs(m)).map((x) => x.tipo), ['ENTRADA']);
    assert.strictEqual((await movs(ret)).length, 0);
    assert.strictEqual((await sobras(m)).length, 0);
  });

  // ── RN-244.02 (integracao, pela rota) ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-244.02] Saida avulsa de B1 (o livro diz L2) -> retalho SEM baixa -> 201, nada baixado, B1 no L2, resumo fecha', async () => {
    const { m, ret } = await montar();
    const l2 = await loteId(m, 'L2');
    const saida = await ok(request(app).post(`${API}/movimentacoes/v2`).send({
      material_id: m.id, tipo: 'SAIDA', quantidade: 1, motivo: 'e244', justificativa: 'peca para corte', serie_ids: [await sid(m, 'B1')],
    }), 201);
    assert.ok(saida.body, 'a saida respondeu');
    const r = await ok(gerar({ material_origem_id: m.id, material_retalho_id: ret.id, baixar_original: false, quantidade_retalho: 1 }), 201);
    assert.strictEqual(r.body.movimentacao_baixa_id, null, 'nada baixado pelo retalho');
    assert.ok(r.body.movimentacao_entrada_id, 'o retalho entrou');
    assert.strictEqual((await sobras(m)).length, 1, 'a sobra existe');
    assert.deepStrictEqual((await movs(m)).map((x) => [x.tipo, x.lote_id == null ? null : Number(x.lote_id)]),
      [['ENTRADA', await loteId(m, 'L1')], ['ENTRADA', l2], ['SAIDA', l2]], 'so a saida avulsa baixou, no L2');
    assert.deepStrictEqual((await movs(ret)).map((x) => [x.tipo, Number(x.quantidade)]), [['ENTRADA_RETALHO', 1]]);
    const b1 = (await series(m)).find((s) => s.numero === 'B1');
    assert.strictEqual(b1.status, 'ENTREGUE');
    assert.strictEqual(Number(b1.lote_id), l2, 'B1 continua no L2');
    assert.strictEqual(await fisico(m), 3);
    const rs = await resumo(m);
    assert.strictEqual(Number(rs.fisico), 3);
    assert.strictEqual(Number(rs.sem_lote_atribuido), 0, 'o "sem lote" nao vai a negativo');
  });

  await test('[RN-244.01 controle] o MESMO retalho com baixa de origem SEM serie passa (a recusa e so da serie)', async () => {
    const m = await material({ serie: 0 });
    await ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'ENTRADA', quantidade: 4, motivo: 'e244' }), 201);
    const ret = await material({ serie: 0 });
    const r = await ok(gerar({ material_origem_id: m.id, material_retalho_id: ret.id, baixar_original: true, quantidade_baixa: 1,
      justificativa: 'corte 244' }), 201);
    assert.ok(r.body.movimentacao_baixa_id, 'baixou');
    assert.strictEqual(await fisico(m), 3);
  });

  terminou = true;
  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
