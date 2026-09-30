/**
 * Etapa 51 — a saída baixa o endereço de onde o material sai.
 *
 * Plano:  docs/superpowers/plans/2026-09-30-almoxarifado-etapa51-saida-por-localizacao.md
 * Design: docs/superpowers/specs/2026-09-30-almoxarifado-etapa51-saida-por-localizacao-design.md
 *
 * Os cenários são os da sonda da Fase 0 (`scratchpad/e51-sonda-localizacao.js`) e os que a Fase 2
 * acrescentou. A invariante que cada um confere: a soma das linhas é igual a `quantidade_atual`, e
 * — em material sem lote que não permite negativo — nenhuma linha de ENDEREÇO fica com saldo que
 * não existe.
 *
 * Executar: cd server && node tests/api/saidaPorLocalizacao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin' };
let seq = 0;

(async () => {
  console.log('\n=== Etapa 51: a saida baixa o endereco ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const loc = async (codigo) => (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES (?, ?)',
    [`E51-${codigo}-${++seq}`, codigo])).lastID;
  const material = async (extra = {}) => (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, controle_lote, permite_saldo_negativo, localizacao_padrao_id)
      VALUES (?, ?, 'UN', 0, 1, ?, ?, ?)`,
  [`E51-M${++seq}`, 'Mat E51', extra.lote ? 1 : 0, extra.negativo ? 1 : 0, extra.padrao || null])).lastID;
  const entrada = async (m, locId, q, loteId = null) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({
      material_id: m, tipo: 'ENTRADA', quantidade: q, localizacao_destino_id: locId, motivo: 'e51',
      ...(loteId ? { lote_id: loteId } : {}),
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  // A chamada EXATA da entrega de requisição (sem origem, sem lote).
  const entregaSemOrigem = (m, q) => stockService.registrarMovimentacao(db, ADMIN, {
    material_id: m, tipo: 'SAIDA', quantidade: q, motivo: 'entrega', justificativa: 'entrega',
  });
  const linhas = async (m) => Object.fromEntries((await dbAll(db, `SELECT COALESCE(l.descricao, 'NULL') ||
      CASE WHEN s.lote_id IS NULL THEN '' ELSE '/L' END as k, s.quantidade q
    FROM estoque_saldo_almoxarifado s LEFT JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id
    WHERE s.material_id = ? ORDER BY s.id`, [m])).map((r) => [r.k, r.q]));
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m])).q;
  const invariante = async (m) => {
    const soma = Object.values(await linhas(m)).reduce((s, q) => s + q, 0);
    assert.ok(Math.abs(soma - await fisico(m)) < 1e-9, `soma das linhas ${soma} != fisico ${await fisico(m)}`);
  };

  await test('(1) entrada de 100 em A, entrega sem origem de 100 -> A:0, nenhuma linha negativa (RN-01)', async () => {
    const m = await material(); const A = await loc('A');
    await entrada(m, A, 100);
    await entregaSemOrigem(m, 100);
    assert.deepStrictEqual(await linhas(m), { A: 0 });
    assert.strictEqual(await fisico(m), 0);
  });

  await test('(2) saida com origem B vazia: B nao negativa, A cede (RN-02)', async () => {
    const m = await material(); const A = await loc('A'); const B = await loc('B');
    await entrada(m, A, 40);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: m, tipo: 'SAIDA', quantidade: 5, localizacao_origem_id: B, motivo: 'x', justificativa: 'x',
    });
    const l = await linhas(m);
    assert.strictEqual(l.A, 35, JSON.stringify(l));
    assert.ok(!(l.B < 0), `a origem declarada vazia negativou: ${JSON.stringify(l)}`);
    await invariante(m);
  });

  await test('(3) A:60 e B:40, saida de 70 sem origem: a maior primeiro, nenhuma negativa', async () => {
    const m = await material(); const A = await loc('A'); const B = await loc('B');
    await entrada(m, A, 60); await entrada(m, B, 40);
    await entregaSemOrigem(m, 70);
    assert.deepStrictEqual(await linhas(m), { A: 0, B: 30 });
    await invariante(m);
  });

  await test('(4) com localizacao PADRAO: a padrao cede primeiro', async () => {
    const P = await loc('P'); const Q = await loc('Q');
    const m = await material({ padrao: P });
    await entrada(m, P, 20); await entrada(m, Q, 50);
    await entregaSemOrigem(m, 30);
    assert.deepStrictEqual(await linhas(m), { P: 0, Q: 40 });
    await invariante(m);
  });

  await test('(5) o que SOBRA sem endereco vai para a linha "sem localizacao atribuida" (material que permite negativo)', async () => {
    const m = await material({ negativo: 1 }); const A = await loc('A');
    await entrada(m, A, 10);
    await entregaSemOrigem(m, 15);
    assert.deepStrictEqual(await linhas(m), { A: 0, NULL: -5 });
    await invariante(m);
  });

  await test('(6) material LEGADO sem nenhuma linha: a saida sem origem se comporta como antes', async () => {
    const m = await material();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 50 WHERE id = ?', [m]);
    await entregaSemOrigem(m, 10);
    assert.strictEqual(await fisico(m), 40);
    assert.deepStrictEqual(await linhas(m), { NULL: -10 });
  });

  await test('(7) material com LOTE: a entrega sem lote NAO toca a linha de lote (B204) - declarado', async () => {
    const m = await material({ lote: 1 }); const A = await loc('A');
    const L = await lotService.criarOuObterLote(db, ADMIN, { material_id: m, codigo: 'L' });
    await entrada(m, A, 100, L.id);
    await entregaSemOrigem(m, 100);
    assert.deepStrictEqual(await linhas(m), { 'A/L': 100, NULL: -100 });
    await invariante(m);
  });

  await test('(8) AJUSTE absoluto sem localizacao PARA BAIXO drena os enderecos (RN-03)', async () => {
    const m = await material(); const A = await loc('A'); const B = await loc('B');
    await entrada(m, A, 30); await entrada(m, B, 20);
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m, tipo: 'AJUSTE', quantidade: 5, motivo: 'x', justificativa: 'x' });
    const l = await linhas(m);
    assert.ok(Object.values(l).every((q) => q >= 0), `linha negativa: ${JSON.stringify(l)}`);
    assert.strictEqual(await fisico(m), 5);
    await invariante(m);
  });

  await test('(9) AJUSTE absoluto PARA CIMA vai para a linha padrao/NULL, como antes', async () => {
    const m = await material(); const A = await loc('A');
    await entrada(m, A, 10);
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m, tipo: 'AJUSTE', quantidade: 25, motivo: 'x', justificativa: 'x' });
    assert.deepStrictEqual(await linhas(m), { A: 10, NULL: 15 });
    await invariante(m);
  });

  await test('(10) contagem "L em A = 0" do material com lote ABSORVE o sem-localizacao negativo (RN-04, Fase 2 CRITICAL)', async () => {
    const m = await material({ lote: 1 }); const A = await loc('A');
    const L = await lotService.criarOuObterLote(db, ADMIN, { material_id: m, codigo: 'L2' });
    await entrada(m, A, 100, L.id);
    await entregaSemOrigem(m, 100); // A/L:100, NULL:-100, fisico 0
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: m, tipo: 'AJUSTE', quantidade: 0, localizacao_destino_id: A, lote_id: L.id, motivo: 'contagem', justificativa: 'contagem',
    });
    assert.strictEqual(await fisico(m), 0, 'o fisico ficou negativo');
    assert.ok(Object.values(await linhas(m)).every((q) => Math.abs(q) < 1e-9), JSON.stringify(await linhas(m)));
  });

  await test('(11) transferencia de endereco ja esvaziado pela entrega e RECUSADA (antes: aceita, fantasma)', async () => {
    const m = await material(); const A = await loc('A'); const B = await loc('B');
    await entrada(m, A, 100);
    await entregaSemOrigem(m, 100);
    const t = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: m, quantidade: 100, localizacao_origem_id: A, localizacao_destino_id: B, motivo: 'x' });
    assert.ok(t.status >= 400, `a transferencia de um endereco vazio foi aceita: ${t.status} ${JSON.stringify(t.body)}`);
    assert.strictEqual(await fisico(m), 0);
  });

  await test('(12) concorrencia: duas saidas simultaneas de 60 com A:100 e B:50 -> A:0, B:30, sem fantasma', async () => {
    // Fase 2 (IMPORTANT 2): o claim copiado do lote PULAVA a linha quando o débito condicional não
    // casava — o perdedor mandava o resto para a linha negativa com A ainda em 40.
    const m = await material(); const A = await loc('A'); const B = await loc('B');
    await entrada(m, A, 100); await entrada(m, B, 50);
    await Promise.all([entregaSemOrigem(m, 60), entregaSemOrigem(m, 60)]);
    const l = await linhas(m);
    assert.deepStrictEqual(l, { A: 0, B: 30 }, `o perdedor pulou a linha com saldo: ${JSON.stringify(l)}`);
    await invariante(m);
  });

  await test('(13) o mapa mostra o endereco VAZIO depois da entrega', async () => {
    const m = await material(); const A = await loc('MAPA');
    await entrada(m, A, 30);
    await entregaSemOrigem(m, 30);
    const r = await request(app).get('/api/almoxarifado/mapa/localizacoes');
    assert.strictEqual(r.status, 200);
    const lista = Array.isArray(r.body) ? r.body : (r.body.localizacoes || r.body.dados || []);
    const noMapa = lista.find((x) => x.id === A || x.localizacao_id === A);
    assert.ok(noMapa, `o endereco sumiu do mapa: ${JSON.stringify(lista).slice(0, 300)}`);
    assert.ok(!(Number(noMapa.qtd_itens) > 0), `o endereco vazio aparece ocupado: ${JSON.stringify(noMapa)}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
