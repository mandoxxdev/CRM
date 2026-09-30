/**
 * Etapa 52 — localizações vazias pela regra de ocupação do mapa, e a guarda de apagar/desativar.
 *
 * Plano: docs/superpowers/plans/2026-09-30-almoxarifado-etapa52-localizacoes-vazias.md
 *
 * A invariante que cada cenário confere, para TODAS as localizações ativas: está na lista de vazias
 * ⇔ `qtd_itens == 0` no mapa. Antes, as duas usavam réguas diferentes e o legado (S8 da Fase 0 da
 * Etapa 51) aparecia ocupado no mapa e vazio na lista.
 *
 * Executar: cd server && node tests/api/localizacoesVazias.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1 };
const PRODUCAO = { id: 9, nome: 'Producao', role: 'usuario' };
let seq = 0;

(async () => {
  console.log('\n=== Etapa 52: localizacoes vazias ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const loc = async (codigo, extra = {}) => (await dbRun(db,
    'INSERT INTO localizacoes_almoxarifado (codigo, descricao, setor, ativo, bloqueada, parent_id) VALUES (?,?,?,?,?,?)',
    [`E52-${codigo}-${++seq}`, codigo, extra.setor || null, extra.ativo ?? 1, extra.bloqueada || 0, extra.parent || null])).lastID;
  const material = async (extra = {}) => (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, controle_lote, localizacao_padrao_id)
      VALUES (?, 'Mat E52', 'UN', ?, 1, ?, ?)`,
  [`E52-M${++seq}`, extra.fisico || 0, extra.lote ? 1 : 0, extra.padrao || null])).lastID;
  const entrada = async (m, locId, q, loteId = null) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({
      material_id: m, tipo: 'ENTRADA', quantidade: q, localizacao_destino_id: locId, motivo: 'e52',
      ...(loteId ? { lote_id: loteId } : {}),
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const entrega = (m, q) => stockService.registrarMovimentacao(db, ADMIN, {
    material_id: m, tipo: 'SAIDA', quantidade: q, motivo: 'entrega', justificativa: 'entrega',
  });
  const vazias = async () => {
    const r = await request(app).get('/api/almoxarifado/localizacoes/vazias');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const vazia = async (id) => (await vazias()).some((l) => l.id === id);
  const invariante = async () => {
    const mapa = (await request(app).get('/api/almoxarifado/mapa/localizacoes')).body;
    const lista = mapa.localizacoes || mapa.dados || mapa;
    const ids = new Set((await vazias()).map((l) => l.id));
    for (const l of lista.filter((x) => Number(x.ativo) === 1)) {
      assert.strictEqual(ids.has(l.id), Number(l.qtd_itens) === 0,
        `mapa e lista discordam na localizacao ${l.codigo}: qtd_itens=${l.qtd_itens}, na lista=${ids.has(l.id)}`);
    }
  };

  await test('(1) com saldo nao e vazia; sem nada e vazia', async () => {
    const A = await loc('A'); const B = await loc('B');
    await entrada(await material(), A, 10);
    assert.strictEqual(await vazia(A), false);
    assert.strictEqual(await vazia(B), true);
    await invariante();
  });

  await test('(2) LEGADO (padrao com fisico e sem linha) NAO e vazia — antes a lista dizia que era', async () => {
    const LEG = await loc('LEG');
    await material({ padrao: LEG, fisico: 40 });
    assert.strictEqual(await vazia(LEG), false, 'o legado apareceu como vazio');
    await invariante();
  });

  await test('(3) endereco DRENADO pela entrega (Etapa 51) aparece vazio', async () => {
    const A = await loc('DREN'); const m = await material();
    await entrada(m, A, 30); await entrega(m, 30);
    assert.strictEqual(await vazia(A), true);
    await invariante();
  });

  await test('(4) bloqueado vazio aparece com bloqueada = 1; inativo nao aparece', async () => {
    const BL = await loc('BLQ', { bloqueada: 1 }); const IN = await loc('INA', { ativo: 0 });
    const lista = await vazias();
    assert.strictEqual(lista.find((l) => l.id === BL)?.bloqueada, 1);
    assert.ok(!lista.some((l) => l.id === IN));
  });

  await test('(5) material com LOTE: o endereco continua OCUPADO apos a entrega (C72) — e mapa e lista concordam', async () => {
    const A = await loc('LOTE'); const m = await material({ lote: 1 });
    const L = await lotService.criarOuObterLote(db, ADMIN, { material_id: m, codigo: 'L' });
    await entrada(m, A, 30, L.id); await entrega(m, 30);
    assert.strictEqual(await vazia(A), false);
    await invariante();
  });

  await test('(6) PAI sem saldo proprio aparece, com sub_ocupadas contando as filhas ocupadas', async () => {
    const PAI = await loc('PAI'); const FILHA = await loc('FILHA', { parent: PAI }); await loc('FILHA2', { parent: PAI });
    await entrada(await material(), FILHA, 5);
    const pai = (await vazias()).find((l) => l.id === PAI);
    assert.ok(pai, 'o pai sumiu da lista');
    assert.strictEqual(pai.sub_ocupadas, 1);
    await invariante();
  });

  await test('(7) a rota e a chave do relatorio devolvem as MESMAS localizacoes, com o endereco montado', async () => {
    const S = await loc('END', { setor: 'Setor X' });
    const rota = (await vazias()).map((l) => l.id).sort();
    const rel = (await request(app).get('/api/almoxarifado/relatorios/localizacoes-vazias')).body.map((l) => l.id).sort();
    assert.deepStrictEqual(rel, rota);
    const linha = (await vazias()).find((l) => l.id === S);
    assert.ok(/Setor X \/ E52-END/.test(linha.endereco_completo), linha.endereco_completo);
  });

  await test('(8) PRODUCAO le a lista e o relatorio', async () => {
    setUser(PRODUCAO);
    assert.strictEqual((await request(app).get('/api/almoxarifado/localizacoes/vazias')).status, 200);
    assert.strictEqual((await request(app).get('/api/almoxarifado/relatorios/localizacoes-vazias')).status, 200);
    setUser(ADMIN);
  });

  const MSG_OCUPADA = (n) => `Localização ocupada: há material nela (${n} item(ns)). Transfira o saldo antes de apagar ou desativar.`;

  await test('(9) APAGAR localizacao ocupada so pelo legado e recusado (antes: 200 e o material sumia)', async () => {
    const LEG = await loc('LEGDEL');
    await material({ padrao: LEG, fisico: 40 });
    const r = await request(app).delete(`/api/almoxarifado/localizacoes/${LEG}`);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, MSG_OCUPADA(1));
    assert.strictEqual((await dbGet(db, 'SELECT ativo FROM localizacoes_almoxarifado WHERE id = ?', [LEG])).ativo, 1);
  });

  await test('(10) DESATIVAR pelo PUT uma localizacao ocupada e recusado; a vazia desativa (metade positiva)', async () => {
    const A = await loc('PUTOC'); await entrada(await material(), A, 7);
    const cur = await dbGet(db, 'SELECT * FROM localizacoes_almoxarifado WHERE id = ?', [A]);
    const r = await request(app).put(`/api/almoxarifado/localizacoes/${A}`).send({ ...cur, ativo: 0 });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, MSG_OCUPADA(1));
    const V = await loc('PUTVAZ');
    const cur2 = await dbGet(db, 'SELECT * FROM localizacoes_almoxarifado WHERE id = ?', [V]);
    const ok = await request(app).put(`/api/almoxarifado/localizacoes/${V}`).send({ ...cur2, ativo: 0 });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    // E editar SEM desativar uma ocupada continua passando.
    const edit = await request(app).put(`/api/almoxarifado/localizacoes/${A}`).send({ ...cur, descricao: 'nova' });
    assert.strictEqual(edit.status, 200, JSON.stringify(edit.body));
  });

  await test('(11) apagar localizacao VAZIA continua passando', async () => {
    const V = await loc('DELVAZ');
    const r = await request(app).delete(`/api/almoxarifado/localizacoes/${V}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
