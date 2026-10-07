/**
 * Etapa 50 (C71) — o resumo da tela de Lotes: `{ fisico, soma_lotes, sem_lote_atribuido }`.
 *
 * Plano: docs/superpowers/plans/2026-09-30-almoxarifado-etapa50-lotes-fisico.md
 *
 * A invariante que vale é a da Fase 2 da Etapa 50: para TODO material, o "sem lote atribuído" do
 * resumo (a tela) é igual ao do relatório "Saldo por lote" (Etapa 49) — o mesmo helper, o mesmo
 * critério de quando mostrar. Cada caso que a revisão mediu é um cenário, e cada cenário compara
 * as DUAS fontes.
 *
 * Executar: cd server && node tests/api/lotesResumo.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');
const lotService = require('../../services/almoxarifado/lotService');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin' };
const PRODUCAO = { id: 9, nome: 'Producao', role: 'usuario' };

(async () => {
  console.log('\n=== Etapa 50: resumo da tela de Lotes ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const resumo = async (id) => {
    const r = await request(app).get(`/api/almoxarifado/materiais/${id}/lotes/resumo`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const semLoteNoRelatorio = async (codigo) => {
    const r = await request(app).get('/api/almoxarifado/relatorios/saldo-por-lote');
    const linha = r.body.find((l) => l.material_codigo === codigo && l.lote === 'Sem lote atribuído');
    return linha ? linha.quantidade : 0;
  };
  const material = async (codigo, { controle = 1, fisico = 0, ativo = 1, negativo = 0 } = {}) => (await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote, permite_saldo_negativo)
     VALUES (?, ?, 'UN', ?, ?, ?, ?)`, [codigo, `Mat ${codigo}`, fisico, ativo, controle, negativo])).lastID;
  const entrada = (materialId, loteId, q) => request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: materialId, tipo: 'ENTRADA', quantidade: q, lote_id: loteId, motivo: 'e50' });
  const confere = async (id, codigo, esperado) => {
    const r = await resumo(id);
    assert.deepStrictEqual(r, esperado, `resumo de ${codigo}`);
    assert.strictEqual(r.sem_lote_atribuido, await semLoteNoRelatorio(codigo),
      `${codigo}: tela e relatorio divergem`);
  };

  await test('(1) entrega sem lote: fisico 70, lote 100, sem lote -30 — igual ao relatorio', async () => {
    const m = await material('E50-ENT');
    const a = await lotService.criarOuObterLote(db, ADMIN, { material_id: m, codigo: 'A' });
    assert.strictEqual((await entrada(m, a.id, 100)).status, 201);
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m, tipo: 'SAIDA', quantidade: 30, motivo: 'entrega', justificativa: 'entrega' });
    await confere(m, 'E50-ENT', { fisico: 70, soma_lotes: 100, sem_lote_atribuido: -30 });
  });

  await test('(2) tudo atribuido: residuo 0 nas duas fontes', async () => {
    const m = await material('E50-OK');
    const a = await lotService.criarOuObterLote(db, ADMIN, { material_id: m, codigo: 'A' });
    assert.strictEqual((await entrada(m, a.id, 8)).status, 201);
    await confere(m, 'E50-OK', { fisico: 8, soma_lotes: 8, sem_lote_atribuido: 0 });
  });

  await test('(3) SEM controle e SEM lote: residuo 0 (o relatorio nao mostra) — Fase 2 (a)', async () => {
    const m = await material('E50-SEMCTRL', { controle: 0, fisico: 50 });
    await confere(m, 'E50-SEMCTRL', { fisico: 50, soma_lotes: 0, sem_lote_atribuido: 0 });
  });

  await test('(4) SEM controle com LOTE ANTIGO: mostra o residuo, como o relatorio (Fase 2, P3)', async () => {
    const m = await material('E50-ANTIGO');
    const a = await lotService.criarOuObterLote(db, ADMIN, { material_id: m, codigo: 'OLD' });
    assert.strictEqual((await entrada(m, a.id, 10)).status, 201);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 0, quantidade_atual = 15 WHERE id = ?', [m]);
    await confere(m, 'E50-ANTIGO', { fisico: 15, soma_lotes: 10, sem_lote_atribuido: 5 });
  });

  await test('(5) LEGADO com controle e sem lote nenhum: o fisico inteiro sem lote — Fase 2 (b)', async () => {
    const m = await material('E50-LEGADO', { fisico: 40 });
    await confere(m, 'E50-LEGADO', { fisico: 40, soma_lotes: 0, sem_lote_atribuido: 40 });
  });

  await test('(6) lote NEGATIVO entra na soma, como no relatorio', async () => {
    const m = await material('E50-NEG', { negativo: 1 });
    const a = await lotService.criarOuObterLote(db, ADMIN, { material_id: m, codigo: 'A' });
    const b = await lotService.criarOuObterLote(db, ADMIN, { material_id: m, codigo: 'B' });
    assert.strictEqual((await entrada(m, a.id, 10)).status, 201);
    assert.strictEqual((await entrada(m, b.id, 10)).status, 201);
    const s = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: m, tipo: 'SAIDA', quantidade: 15, lote_id: a.id, motivo: 'e50', justificativa: 'e50' });
    assert.strictEqual(s.status, 201, JSON.stringify(s.body));
    await confere(m, 'E50-NEG', { fisico: 5, soma_lotes: 5, sem_lote_atribuido: 0 });
  });

  await test('(7) material INATIVO: residuo 0 (o relatorio exclui inativo)', async () => {
    const m = await material('E50-INATIVO', { fisico: 40, ativo: 0 });
    await confere(m, 'E50-INATIVO', { fisico: 40, soma_lotes: 0, sem_lote_atribuido: 0 });
  });

  await test('(8) 404 literal para material inexistente, e PRODUCAO le (gate visualizar)', async () => {
    const r = await request(app).get('/api/almoxarifado/materiais/999999/lotes/resumo');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'Material não encontrado');
    setUser(PRODUCAO);
    const m = await material('E50-PROD');
    const p = await request(app).get(`/api/almoxarifado/materiais/${m}/lotes/resumo`);
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    setUser(ADMIN);
  });

  await test('(9) a rota /lotes continua ARRAY (quatro seletores dependem disso)', async () => {
    const m = await material('E50-ARR');
    const r = await request(app).get(`/api/almoxarifado/materiais/${m}/lotes`);
    assert.ok(Array.isArray(r.body), JSON.stringify(r.body));
  });

  // ── Fase 5: os três casos em que tela e relatório divergiam ──────────────────────────────
  await test('(11) linha de saldo de OUTRO material apontando para um lote: cada material com o seu (I1)', async () => {
    const x = await material('E50-X');
    const y = await material('E50-Y');
    const lx = await lotService.criarOuObterLote(db, ADMIN, { material_id: x, codigo: 'LX' });
    assert.strictEqual((await entrada(x, lx.id, 10)).status, 201);
    // Dado inconsistente: saldo de Y com o lote de X.
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, lote_id, quantidade) VALUES (?, ?, 7)', [y, lx.id]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 7 WHERE id = ?', [y]);
    await confere(x, 'E50-X', { fisico: 10, soma_lotes: 10, sem_lote_atribuido: 0 });
    await confere(y, 'E50-Y', { fisico: 7, soma_lotes: 7, sem_lote_atribuido: 0 });
    const linhasX = (await request(app).get('/api/almoxarifado/relatorios/saldo-por-lote')).body
      .filter((l) => l.material_codigo === 'E50-X');
    assert.deepStrictEqual(linhasX.map((l) => [l.lote, l.quantidade]), [['LX', 10]], 'o relatorio somou o saldo de Y no lote de X');
  });

  await test('(12) lote APAGADO (lote_id orfao): as duas fontes tratam como sem lote (M1)', async () => {
    const m = await material('E50-ORFAO', { fisico: 40 });
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, lote_id, quantidade) VALUES (?, 987654, 40)', [m]);
    await confere(m, 'E50-ORFAO', { fisico: 40, soma_lotes: 0, sem_lote_atribuido: 40 });
  });

  await test('(13) fracoes: 0.1 + 0.2 contra 0.3 da residuo 0, e 7 casas arredondam IGUAL nas duas fontes (M2)', async () => {
    const m = await material('E50-FRAC');
    const a = await lotService.criarOuObterLote(db, ADMIN, { material_id: m, codigo: 'A' });
    const b = await lotService.criarOuObterLote(db, ADMIN, { material_id: m, codigo: 'B' });
    assert.strictEqual((await entrada(m, a.id, 0.1)).status, 201);
    assert.strictEqual((await entrada(m, b.id, 0.2)).status, 201);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 0.3 WHERE id = ?', [m]);
    const r = await resumo(m);
    assert.strictEqual(r.sem_lote_atribuido, 0, `ponto flutuante virou residuo: ${JSON.stringify(r)}`);
    assert.strictEqual(await semLoteNoRelatorio('E50-FRAC'), 0);

    const m2 = await material('E50-7CASAS');
    const c = await lotService.criarOuObterLote(db, ADMIN, { material_id: m2, codigo: 'C' });
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, lote_id, quantidade) VALUES (?, ?, 902.0429811)', [m2, c.id]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 188.7657825 WHERE id = ?', [m2]);
    assert.strictEqual((await resumo(m2)).sem_lote_atribuido, await semLoteNoRelatorio('E50-7CASAS'),
      'tela e relatorio arredondam diferente');
  });

  await test('(10) T3 — a ENTREGA DE REQUISICAO pela rota real produz o residuo que a tela mostra', async () => {
    const m = await material('E50-REAL');
    const a = await lotService.criarOuObterLote(db, ADMIN, { material_id: m, codigo: 'A' });
    assert.strictEqual((await entrada(m, a.id, 100)).status, 201);
    setUser(ADMIN);
    const cr = await request(app).post('/api/almoxarifado/requisicoes').send({ os_referencia: 'OS-INT', itens: [{ material_id: m, quantidade: 30 }] });
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    // O solicitante não aprova a própria requisição (segregação): outro admin aprova.
    setUser({ id: 2, nome: 'Aprovador', role: 'admin' });
    const ap = await request(app).put(`/api/almoxarifado/requisicoes/${cr.body.id}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    setUser(ADMIN);
    const det = await request(app).get(`/api/almoxarifado/requisicoes/${cr.body.id}`);
    const itemId = det.body.itens[0].id;
    const sep = await request(app).put(`/api/almoxarifado/requisicoes/${cr.body.id}/separar`)
      .send({ itens_separados: [{ item_id: itemId, quantidade_separada: 30 }] });
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));
    const ent = await request(app).put(`/api/almoxarifado/requisicoes/${cr.body.id}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemId, quantidade_atendida: 30 }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
    await confere(m, 'E50-REAL', { fisico: 70, soma_lotes: 100, sem_lote_atribuido: -30 });
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
