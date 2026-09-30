/**
 * Etapa 49 — relatórios de saldo (T1/T2) e o histórico por usuário/centro de custo/grupo (T3).
 *
 * Plano:  docs/superpowers/plans/2026-09-30-almoxarifado-etapa49-relatorios-saldos.md
 * Design: docs/superpowers/specs/2026-09-30-almoxarifado-etapa49-relatorios-saldos-design.md (seção 6)
 *
 * O cenário (1) é o da sonda da Fase 2 que derrubou a primeira versão da RN-01: a entrega de
 * requisição NÃO informa lote e baixa da linha `lote_id NULL` — o lote continua "com 100" com o
 * material em 70. O relatório não pode mostrar 100 como se estivesse na prateleira.
 *
 * Executar: cd server && node tests/api/relatoriosSaldos.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const lotService = require('../../services/almoxarifado/lotService');
const stockService = require('../../services/almoxarifado/stockService');
const { COLUNAS_RETENCAO } = require('../../services/almoxarifado/availabilitySql');
const { RELATORIOS } = require('../../services/almoxarifado/reportRegistry');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };

(async () => {
  console.log('\n=== Etapa 49: relatorios de saldo ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const rel = async (tipo, q = {}) => {
    const res = await request(app).get(`/api/almoxarifado/relatorios/${tipo}`).query(q);
    assert.strictEqual(res.status, 200, `${tipo}: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.dados || res.body.linhas || res.body;
  };
  const material = async (codigo, extra = '') => (await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote ${extra ? `, ${extra.split('=')[0]}` : ''})
     VALUES (?, ?, 'UN', 0, 1, 1 ${extra ? `, ${extra.split('=')[1]}` : ''})`, [codigo, `Material ${codigo}`])).lastID;

  // ── T1: saldo por lote ────────────────────────────────────────────────────────────────────
  const matLote = await material('E49-LOTE');
  const loteA = await lotService.criarOuObterLote(db, ADMIN, { material_id: matLote, codigo: 'A' });
  const loteB = await lotService.criarOuObterLote(db, ADMIN, { material_id: matLote, codigo: 'B' });
  let r = await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: matLote, tipo: 'ENTRADA', quantidade: 100, lote_id: loteA.id, motivo: 'e49' });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  r = await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: matLote, tipo: 'ENTRADA', quantidade: 20, lote_id: loteB.id, motivo: 'e49' });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  // Saída de B inteira: lote zerado NÃO aparece.
  r = await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: matLote, tipo: 'SAIDA', quantidade: 20, lote_id: loteB.id, motivo: 'e49', justificativa: 'e49' });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  // A chamada EXATA da entrega de requisição: sem lote.
  await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: matLote, tipo: 'SAIDA', quantidade: 30, motivo: 'entrega req', justificativa: 'entrega req',
  });

  await test('(1) saldo por lote: o lote mostra o ATRIBUIDO, e "Sem lote atribuido" fecha a conta com o fisico', async () => {
    const linhas = (await rel('saldo-por-lote')).filter((l) => l.material_codigo === 'E49-LOTE');
    const fisico = (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [matLote])).q;
    assert.strictEqual(fisico, 70);
    const porLote = Object.fromEntries(linhas.map((l) => [l.lote, l.quantidade]));
    assert.deepStrictEqual(porLote, { A: 100, 'Sem lote atribuído': -30 },
      `linhas: ${JSON.stringify(linhas)}`);
    assert.ok(linhas.every((l) => l.fisico_material === 70), 'a coluna do fisico total nao veio');
    const soma = linhas.reduce((s, l) => s + l.quantidade, 0);
    assert.strictEqual(soma, fisico, 'lote + sem lote nao fecha com o fisico');
  });

  await test('(2) material com lote em que tudo esta atribuido NAO ganha a linha residual', async () => {
    const m2 = await material('E49-LOTE2');
    const l2 = await lotService.criarOuObterLote(db, ADMIN, { material_id: m2, codigo: 'X' });
    const e = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: m2, tipo: 'ENTRADA', quantidade: 5, lote_id: l2.id, motivo: 'e49' });
    assert.strictEqual(e.status, 201);
    const linhas = (await rel('saldo-por-lote')).filter((l) => l.material_codigo === 'E49-LOTE2');
    assert.deepStrictEqual(linhas.map((l) => [l.lote, l.quantidade]), [['X', 5]]);
  });

  await test('(3) series em estoque: presentes (EM_ESTOQUE, BLOQUEADA) aparecem; ENTREGUE nao', async () => {
    const m = await material('E49-SERIE');
    for (const [numero, status] of [['S1', 'EM_ESTOQUE'], ['S2', 'BLOQUEADA'], ['S3', 'ENTREGUE']]) {
      await dbRun(db, 'INSERT INTO series_almoxarifado (material_id, numero, status) VALUES (?,?,?)', [m, numero, status]);
    }
    const linhas = (await rel('series-em-estoque')).filter((l) => l.material_codigo === 'E49-SERIE');
    assert.deepStrictEqual(linhas.map((l) => [l.numero, l.status]), [['S1', 'EM_ESTOQUE'], ['S2', 'BLOQUEADA']]);
  });

  // ── T2: saldos comprometidos ──────────────────────────────────────────────────────────────
  await test('(4) saldos comprometidos: cada retencao na sua coluna, disponivel igual ao do estoque-atual', async () => {
    const m = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo,
        quantidade_reservada, quantidade_bloqueada, quantidade_em_inspecao, quantidade_em_terceiros)
      VALUES ('E49-RET', 'Retido', 'UN', 50, 1, 5, 4, 3, 2)`)).lastID;
    await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
      VALUES ('E49-LIVRE', 'Livre', 'UN', 50, 1)`);
    const linhas = await rel('saldos-comprometidos');
    const ret = linhas.find((l) => l.material_codigo === 'E49-RET');
    assert.ok(ret, 'o material retido nao apareceu');
    assert.deepStrictEqual(
      [ret.fisico, ret.quantidade_reservada, ret.quantidade_bloqueada, ret.quantidade_em_inspecao, ret.quantidade_em_terceiros, ret.disponivel],
      [50, 5, 4, 3, 2, 36]);
    assert.ok(!linhas.some((l) => l.material_codigo === 'E49-LIVRE'), 'material sem retencao apareceu');
    const atual = (await rel('estoque-atual')).find((l) => l.id === m || l.codigo === 'E49-RET');
    assert.strictEqual(atual.disponivel, ret.disponivel, 'disponivel divergente do estoque-atual');
  });

  await test('(5) o registro declara TODA coluna de COLUNAS_RETENCAO (as colunas dele sao estaticas)', async () => {
    const chaves = RELATORIOS['saldos-comprometidos'].colunas.map((c) => c.chave);
    for (const c of [...COLUNAS_RETENCAO, 'disponivel']) {
      assert.ok(chaves.includes(c), `retencao "${c}" some da tabela e do XLSX — acrescente a coluna no registro`);
    }
  });

  // ── T3: histórico por grupo, usuário e centro de custo ────────────────────────────────────
  const cc = (await dbRun(db, "INSERT INTO centros_custo_almoxarifado (codigo, nome) VALUES ('CC-49', 'Manutenção 49')")).lastID;
  const mH = (await dbRun(db, "INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES ('E49-HIST','Hist','UN',0,1)")).lastID;
  const mov = (tipo, usuario, centro) => dbRun(db, `INSERT INTO movimentacoes_almoxarifado
      (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, usuario_id, usuario_nome, centro_custo_id, cancelado)
      VALUES (?,?,1,0,0,?,?,?,0)`, [mH, tipo, 1, usuario, centro]);
  await mov('ENTRADA_COMPRA', 'Ana Souza', cc);
  await mov('ENTRADA_MANUAL', 'Bruno 100%', null);
  await mov('SAIDA_PRODUCAO', 'Ana Souza', null);
  await mov('AJUSTE_INVENTARIO', 'Carla', null);
  const hist = (q) => rel('historico-movimentacoes', { material_id: mH, ...q });

  await test('(6) grupo ENTRADA pega todos os tipos de entrada; AJUSTE pelo prefixo; grupo invalido -> 400 literal', async () => {
    assert.deepStrictEqual((await hist({ grupo: 'ENTRADA' })).map((l) => l.tipo).sort(), ['ENTRADA_COMPRA', 'ENTRADA_MANUAL']);
    assert.deepStrictEqual((await hist({ grupo: 'AJUSTE' })).map((l) => l.tipo), ['AJUSTE_INVENTARIO']);
    const bad = await request(app).get('/api/almoxarifado/relatorios/historico-movimentacoes').query({ grupo: 'COMPRAS' });
    assert.strictEqual(bad.status, 400);
    assert.strictEqual(bad.body.error, 'Grupo de movimento inválido: COMPRAS (use ENTRADA, SAIDA, AJUSTE, DEVOLUCAO ou TRANSFERENCIA)');
  });

  await test('(7) usuario por parte do nome, e o % digitado vale como texto (ESCAPE)', async () => {
    assert.deepStrictEqual((await hist({ usuario: 'ana' })).map((l) => l.tipo).sort(), ['ENTRADA_COMPRA', 'SAIDA_PRODUCAO']);
    assert.deepStrictEqual((await hist({ usuario: '100%' })).map((l) => l.usuario_nome), ['Bruno 100%']);
    assert.deepStrictEqual((await hist({ usuario: '%' })).map((l) => l.usuario_nome), ['Bruno 100%'],
      'o % virou curinga e trouxe todo mundo');
  });

  await test('(8) centro de custo: filtro e coluna com codigo e nome; sem filtro nada muda (aditivo)', async () => {
    const soCC = await hist({ centro_custo_id: cc });
    assert.deepStrictEqual(soCC.map((l) => [l.tipo, l.centro_custo]), [['ENTRADA_COMPRA', 'CC-49 — Manutenção 49']]);
    assert.strictEqual((await hist({})).length, 4, 'sem filtro o resultado mudou');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
