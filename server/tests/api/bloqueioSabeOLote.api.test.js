/**
 * Etapa 209 (T0) — o bloqueio passa a saber o lote (C466, 1a parte; B1416-B1422). Parte do TRONCO T1+T2:
 * a devolucao para Quarentena grava o lote herdado no BLOQUEIO interno e o helper `bloqueioPorLote.js` soma o bloqueado por
 * lote a partir do livro (BLOQUEIO + / DESBLOQUEIO -, `cancelado = 0`).
 *
 * Cobre: RN-209.01 (a rota, b servico, c lote informado), RN-209.02 (sem lote; destinos sem BLOQUEIO), RN-209.02b (Fase 2 item 1:
 * material SEM controle de lote que saiu com lote), RN-209.03 (avulso e linha antiga = "sem lote"), RN-209.06 b (o estorno do
 * BLOQUEIO com o lote intacto zera o lote pelo `cancelado = 1`), RN-209.09 (quem le nao muda — inclusive o cenario do estorno da
 * ENTRADA_DEVOLUCAO da Fase 2 item 2, C504).
 *
 * Desde a T3/T4 cobre tambem o motor (M1/M2 no DESBLOQUEIO, M3 no estorno do BLOQUEIO) e o `lote_id` no desbloqueio avulso
 * (B1422): RN-209.04 a-d, .05, .06 a/c, .10 e .07 pelo servico. Os dois que chamam a rota GET (RN-209.08 e .07 pela rota, T5)
 * continuam em `bloqueioSabeOLote.pendente-t3.js` — fora do runner (que so descobre *.api.test.js) ate a T5.
 *
 * Plano: docs/superpowers/plans/2026-11-07-almoxarifado-etapa209-bloqueio-sabe-o-lote.md
 * Executar: cd server && node tests/api/bloqueioSabeOLote.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const returnService = require('../../services/almoxarifado/returnService');
const inspectionService = require('../../services/almoxarifado/inspectionService');
const stockService = require('../../services/almoxarifado/stockService');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const lotService = require('../../services/almoxarifado/lotService');
const { loteImpedidoSql } = require('../../services/almoxarifado/loteImpedido');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 209', role: 'admin', is_superadmin: 1, email: 'a209@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 209 (T0): o bloqueio sabe o lote — devolucao e helper ===\n');
  // Sem o modulo (antes da T1) os testes ainda rodam: cada um confere o LIVRO primeiro (vermelho real da T2) e so depois o helper.
  let bpl = {};
  try { bpl = require('../../services/almoxarifado/bloqueioPorLote'); } catch (e) { /* vermelho no [T1] */ }
  const helper = () => {
    if (typeof bpl.bloqueadoPorLote !== 'function') throw new Error('bloqueioPorLote.js ainda nao existe (T1)');
    return bpl;
  };

  const { app, db, close } = await createTestApp({ user: { ...ADMIN } });
  const post = (u, b) => request(app).post(u).send(b);
  const alm = await post(`${API}/almoxarifados`, { codigo: 'ALM209', nome: 'Almox 209' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  await post(`${API}/localizacoes`, { codigo: 'Z209-01', descricao: 'Z209-01', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z209-01'");

  const material = async ({ lote = 1 } = {}) => {
    const c = `E209-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, ?, 0, ?)`, [c, c, lote, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, q, lote) => {
    const r = await post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e209',
      localizacao_destino_id: P01.id, lote });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const sair = async (m, q, codigo) => {
    const r = await post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'SAIDA', quantidade: q, motivo: 'e209',
      justificativa: 'teste 209', localizacao_origem_id: P01.id, lote_id: codigo ? await loteId(m, codigo) : undefined });
    assert.strictEqual(r.status, 201, `saida: ${JSON.stringify(r.body)}`);
    return (await dbGet(db, "SELECT id, lote_id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA' ORDER BY id DESC",
      [m.id]));
  };
  const devolverRota = async (m, q, saida, extra = {}) => {
    const r = await post(`${API}/devolucoes`, { material_id: m.id, quantidade: q, motivo: 'DEFEITO', condicao: 'SUSPEITA',
      destino: 'QUARENTENA', movimentacao_saida_id: saida.id, localizacao_id: P01.id, ...extra });
    assert.strictEqual(r.status, 201, `devolucao: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const livro = async (m, tipos = ['ENTRADA_DEVOLUCAO', 'BLOQUEIO', 'DESBLOQUEIO']) => (await dbAll(db,
    `SELECT tipo, lote_id, quantidade, cancelado FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo IN (${tipos.map(() => '?').join(',')})
      ORDER BY id`, [m.id, ...tipos])).map((x) => [x.tipo, x.lote_id, Number(x.quantidade), Number(x.cancelado || 0)]);
  const bloqueada = async (m) => Number((await dbGet(db, 'SELECT quantidade_bloqueada b FROM materiais_almoxarifado WHERE id = ?', [m.id])).b);
  const porLote = async (m) => helper().bloqueadoPorLote(db, m.id);
  // o fragmento SQL, com o lote como parametro (Fase 2 item 5)
  const fragmentos = async (m, lote) => dbGet(db, `SELECT ${helper().bloqueadoDoLoteSql('mm.id', '?')} AS no_lote,
      ${helper().bloqueadoComLoteSql('mm.id')} AS com_lote FROM materiais_almoxarifado mm WHERE mm.id = ?`, [lote, m.id]);

  // ── T1: o modulo e o contrato ────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[T1] bloqueioPorLote.js exporta bloqueadoDoLoteSql, bloqueadoComLoteSql e bloqueadoPorLote', async () => {
    assert.strictEqual(typeof bpl.bloqueadoDoLoteSql, 'function', 'bloqueadoDoLoteSql');
    assert.strictEqual(typeof bpl.bloqueadoComLoteSql, 'function', 'bloqueadoComLoteSql');
    assert.strictEqual(typeof bpl.bloqueadoPorLote, 'function', 'bloqueadoPorLote');
  });
  await test('[T1] material sem nenhum bloqueio: { total 0, sem_lote 0, lotes [] }; material inexistente -> null', async () => {
    const m = await material();
    assert.deepStrictEqual(await porLote(m), { material_id: m.id, total: 0, sem_lote: 0, lotes: [] });
    assert.strictEqual(await helper().bloqueadoPorLote(db, 999999), null);
  });

  // ── RN-209.01: a quarentena grava o lote ─────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-209.01 a, rota] devolucao de 2 para Quarentena citando saida de L1: ENTRADA_DEVOLUCAO e BLOQUEIO com L1; por lote { total 2, sem_lote 0, L1 2 }', async () => {
    const m = await material();
    await entrar(m, 5, 'L1');
    const s = await sair(m, 3, 'L1');
    const L1 = await loteId(m, 'L1');
    assert.strictEqual(s.lote_id, L1, 'premissa: a saida saiu de L1');
    await devolverRota(m, 2, s);
    assert.deepStrictEqual(await livro(m), [['ENTRADA_DEVOLUCAO', L1, 2, 0], ['BLOQUEIO', L1, 2, 0]]);
    assert.strictEqual(await bloqueada(m), 2, 'o total do material sobe como hoje');
    assert.deepStrictEqual(await porLote(m), { material_id: m.id, total: 2, sem_lote: 0, lotes: [{ lote_id: L1, codigo: 'L1', quantidade: 2 }] });
    const f = await fragmentos(m, L1);
    assert.deepStrictEqual([Number(f.no_lote), Number(f.com_lote)], [2, 2], 'os fragmentos SQL');
  });
  await test('[RN-209.01 b, servico] registrarDevolucao direto: o BLOQUEIO herda L1; duas devolucoes de lotes diferentes ficam separadas (ordem por codigo)', async () => {
    const m = await material();
    await entrar(m, 4, 'LB'); await entrar(m, 4, 'LA');
    const sB = await sair(m, 2, 'LB');
    const sA = await sair(m, 3, 'LA');
    await returnService.registrarDevolucao(db, ADMIN, { material_id: m.id, quantidade: 1, motivo: 'DEFEITO', destino: 'QUARENTENA',
      movimentacao_saida_id: sB.id, localizacao_id: P01.id });
    await returnService.registrarDevolucao(db, ADMIN, { material_id: m.id, quantidade: 3, motivo: 'DEFEITO', destino: 'QUARENTENA',
      movimentacao_saida_id: sA.id, localizacao_id: P01.id });
    const LA = await loteId(m, 'LA'); const LB = await loteId(m, 'LB');
    assert.deepStrictEqual((await livro(m, ['BLOQUEIO'])).map((x) => x[1]), [LB, LA], 'cada BLOQUEIO com o lote da sua saida');
    assert.deepStrictEqual(await porLote(m), { material_id: m.id, total: 4, sem_lote: 0,
      lotes: [{ lote_id: LA, codigo: 'LA', quantidade: 3 }, { lote_id: LB, codigo: 'LB', quantidade: 1 }] });
  });
  await test('[RN-209.01 c] lote_id informado no corpo vence o herdado: o BLOQUEIO usa o informado', async () => {
    const m = await material();
    await entrar(m, 5, 'L1'); await entrar(m, 1, 'L2');
    const s = await sair(m, 2, 'L1');
    const L2 = await loteId(m, 'L2');
    await devolverRota(m, 1, s, { lote_id: L2 });
    assert.deepStrictEqual(await livro(m), [['ENTRADA_DEVOLUCAO', L2, 1, 0], ['BLOQUEIO', L2, 1, 0]]);
    assert.deepStrictEqual((await porLote(m)).lotes, [{ lote_id: L2, codigo: 'L2', quantidade: 1 }]);
  });

  // ── RN-209.02 / 02b: sem lote continua sem lote; o lote vem da saida, nao do controle ─────────────────────────────────────────
  await test('[RN-209.02] material sem controle de lote, saida sem lote: BLOQUEIO sem lote, tudo em sem_lote', async () => {
    const m = await material({ lote: 0 });
    await entrar(m, 5);
    const s = await sair(m, 3);
    assert.strictEqual(s.lote_id, null, 'premissa');
    await devolverRota(m, 2, s);
    assert.deepStrictEqual(await livro(m), [['ENTRADA_DEVOLUCAO', null, 2, 0], ['BLOQUEIO', null, 2, 0]]);
    assert.deepStrictEqual(await porLote(m), { material_id: m.id, total: 2, sem_lote: 2, lotes: [] });
  });
  await test('[RN-209.02] destinos ESTOQUE, SUCATA e RETRABALHO nao gravam BLOQUEIO (nada muda)', async () => {
    for (const destino of ['ESTOQUE', 'SUCATA', 'RETRABALHO']) { // eslint-disable-line no-restricted-syntax
      const m = await material(); // eslint-disable-line no-await-in-loop
      await entrar(m, 5, 'L1'); // eslint-disable-line no-await-in-loop
      const s = await sair(m, 3, 'L1'); // eslint-disable-line no-await-in-loop
      await devolverRota(m, 1, s, { destino, motivo: 'NAO_UTILIZADO' }); // eslint-disable-line no-await-in-loop
      assert.deepStrictEqual(await livro(m, ['BLOQUEIO', 'DESBLOQUEIO']), [], `${destino}: sem BLOQUEIO`); // eslint-disable-line no-await-in-loop
      assert.deepStrictEqual(await porLote(m), { material_id: m.id, total: 0, sem_lote: 0, lotes: [] }, destino); // eslint-disable-line no-await-in-loop
    }
  });
  await test('[RN-209.02b, Fase 2 item 1] material SEM controle de lote que saiu de L1 (Etapa 58): a Quarentena grava o BLOQUEIO com L1', async () => {
    const m = await material({ lote: 0 });
    await entrar(m, 5, 'L1');
    const L1 = await loteId(m, 'L1');
    assert.ok(L1, 'premissa: a entrada criou o lote L1 mesmo sem controle');
    const s = await sair(m, 3, 'L1');
    assert.strictEqual(s.lote_id, L1, 'premissa: a saida saiu de L1');
    await devolverRota(m, 2, s);
    assert.deepStrictEqual(await livro(m), [['ENTRADA_DEVOLUCAO', L1, 2, 0], ['BLOQUEIO', L1, 2, 0]]);
    assert.deepStrictEqual(await porLote(m), { material_id: m.id, total: 2, sem_lote: 0, lotes: [{ lote_id: L1, codigo: 'L1', quantidade: 2 }] });
  });

  // ── RN-209.03: o avulso e a linha antiga sao "sem lote" ──────────────────────────────────────────────────────────────────────
  await test('[RN-209.03] devolucao L1 2 + bloqueio avulso 3: total 5 = L1 2 + sem lote 3; o avulso fica sem lote', async () => {
    const m = await material();
    await entrar(m, 10, 'L1');
    const s = await sair(m, 3, 'L1');
    await devolverRota(m, 2, s);
    await inspectionService.bloquearMaterial(db, ADMIN, m.id, { quantidade: 3, justificativa: 'avulso 209' });
    const L1 = await loteId(m, 'L1');
    assert.deepStrictEqual(await livro(m, ['BLOQUEIO']), [['BLOQUEIO', L1, 2, 0], ['BLOQUEIO', null, 3, 0]]);
    assert.deepStrictEqual(await porLote(m), { material_id: m.id, total: 5, sem_lote: 3, lotes: [{ lote_id: L1, codigo: 'L1', quantidade: 2 }] });
  });
  await test('[RN-209.03] so bloqueio sem lote (avulso/linha antiga): desbloqueio sem lote passa como hoje e o sem_lote desce', async () => {
    const m = await material();
    await entrar(m, 10, 'L1');
    await inspectionService.bloquearMaterial(db, ADMIN, m.id, { quantidade: 4, justificativa: 'avulso 209' });
    await inspectionService.desbloquearMaterial(db, ADMIN, m.id, { quantidade: 3, justificativa: 'libera 209' });
    assert.deepStrictEqual(await livro(m, ['BLOQUEIO', 'DESBLOQUEIO']), [['BLOQUEIO', null, 4, 0], ['DESBLOQUEIO', null, 3, 0]]);
    assert.deepStrictEqual(await porLote(m), { material_id: m.id, total: 1, sem_lote: 1, lotes: [] });
  });

  // ── RN-209.06 b: o estorno do BLOQUEIO com o lote intacto (o helper le cancelado = 0) ─────────────────────────────────────────
  await test('[RN-209.06 b] estornar o BLOQUEIO de L1 com L1 intacto: 200, L1 some (cancelado = 1), total desce', async () => {
    const m = await material();
    await entrar(m, 5, 'L1');
    const s = await sair(m, 3, 'L1');
    await devolverRota(m, 2, s);
    const L1 = await loteId(m, 'L1');
    const bl = await dbGet(db, "SELECT id, lote_id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'BLOQUEIO'", [m.id]);
    assert.strictEqual(bl.lote_id, L1, 'premissa: o BLOQUEIO tem L1');
    const r = await post(`${API}/movimentacoes/${bl.id}/cancelar`, { motivo: 'estorno 209 b' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await bloqueada(m), 0);
    assert.deepStrictEqual(await porLote(m), { material_id: m.id, total: 0, sem_lote: 0, lotes: [] });
    const f = await fragmentos(m, L1);
    assert.deepStrictEqual([Number(f.no_lote), Number(f.com_lote)], [0, 0], 'o fragmento le cancelado = 0');
  });

  // ── RN-209.09: quem le nao muda (regressao explicita) ────────────────────────────────────────────────────────────────────────
  // Os leitores do item 9 (`loteImpedidoSql`, a 205; `listarLotesDoMaterial`, de onde `lotesParaOAutomatico` da 197 tira o livre
  // por lote — a funcao nao e exportada, entao a regressao fica na entrada dela) dao o MESMO numero com o BLOQUEIO com L1 e com o
  // mesmo BLOQUEIO sem lote (UPDATE so da linha do livro — o material nao muda).
  const leitores = async (m) => {
    const imp = await dbGet(db, `SELECT ${loteImpedidoSql('m')} AS q FROM materiais_almoxarifado m WHERE m.id = ?`, [m.id]);
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E209-${++seq}`])).lastID;
    const itId = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,1,0,0,0)`, [R, m.id])).lastID;
    const sd = await requisitionService.saldoDisponivelParaItem(db, await dbGet(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE id = ?', [itId]));
    const lotes = (await lotService.listarLotesDoMaterial(db, m.id, { apenasComSaldo: true }))
      .map((l) => [l.codigo, Number(l.saldo), !!l.elegivel]);
    return { lote_impedido_sql: Number(imp.q), disponivel: sd.disponivel, lote_impedido: sd.lote_impedido,
      disponivel_liberado: sd.disponivel_liberado, lotes };
  };
  const comESemLote = async (m, L) => {
    const bl = await dbGet(db, "SELECT id, lote_id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'BLOQUEIO' AND cancelado = 0", [m.id]);
    assert.strictEqual(bl.lote_id, L, 'premissa: o BLOQUEIO da quarentena tem o lote');
    const com = await leitores(m);
    await dbRun(db, 'UPDATE movimentacoes_almoxarifado SET lote_id = NULL WHERE id = ?', [bl.id]);
    const sem = await leitores(m);
    await dbRun(db, 'UPDATE movimentacoes_almoxarifado SET lote_id = ? WHERE id = ?', [L, bl.id]);
    return { com, sem };
  };
  await test('[RN-209.09] L1 2 bloqueado por quarentena: loteImpedidoSql, saldoDisponivelParaItem e os lotes do automatico iguais com e sem lote no BLOQUEIO', async () => {
    const m = await material();
    await entrar(m, 5, 'L1'); await entrar(m, 4, 'L2');
    await lotService.mudarStatusLote(db, ADMIN, await loteId(m, 'L2'), 'BLOQUEADO', 'teste 209');
    const s = await sair(m, 3, 'L1');
    await devolverRota(m, 2, s);
    const { com, sem } = await comESemLote(m, await loteId(m, 'L1'));
    assert.deepStrictEqual(com, sem);
    assert.ok(com.lote_impedido_sql > 0, `premissa: ha lote impedido para a conta ler (${JSON.stringify(com)})`);
  });
  await test('[RN-209.09, Fase 2 item 2, C504] L1 0 e L2 5; voltam 2 de L1 para Quarentena; estorno da ENTRADA_DEVOLUCAO: fisico 5 todo em L2, o BLOQUEIO vivo, a soma diz L1 2 — e os leitores nao mudam', async () => {
    const m = await material();
    await entrar(m, 2, 'L1'); await entrar(m, 5, 'L2');
    const s = await sair(m, 2, 'L1');
    await devolverRota(m, 2, s);
    const L1 = await loteId(m, 'L1'); const L2 = await loteId(m, 'L2');
    const ed = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ENTRADA_DEVOLUCAO'", [m.id]);
    const r = await post(`${API}/movimentacoes/${ed.id}/cancelar`, { motivo: 'estorno 209 c504' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const linhas = (await dbAll(db, 'SELECT lote_id, SUM(quantidade) q FROM estoque_saldo_almoxarifado WHERE material_id = ? GROUP BY lote_id', [m.id]))
      .filter((x) => Math.abs(Number(x.q)) > 1e-9).map((x) => [x.lote_id, Number(x.q)]);
    assert.deepStrictEqual(linhas, [[L2, 5]], 'fisico 5 todo em L2');
    assert.strictEqual(await bloqueada(m), 2, 'o BLOQUEIO continua vivo (o estorno da entrada nao o estorna)');
    assert.deepStrictEqual(await porLote(m), { material_id: m.id, total: 2, sem_lote: 0, lotes: [{ lote_id: L1, codigo: 'L1', quantidade: 2 }] },
      'C504: L1 com bloqueado maior que o saldo dele (o limite e do item 9)');
    const { com, sem } = await comESemLote(m, L1);
    assert.deepStrictEqual(com, sem);
  });

  // ── T3 (o motor confere o lote no DESBLOQUEIO e no estorno do BLOQUEIO) — vindos do bloqueioSabeOLote.pendente-t3.js ─────────
  const M1 = (semLote, lista) => `Informe o lote: só ${semLote} UN bloqueado(s) sem lote — o resto está em lote (${lista})`;
  const quarentena = async (m, q, codigo = 'L1') => {
    await entrar(m, 5 + q, codigo);
    const s = await sair(m, q, codigo);
    await returnService.registrarDevolucao(db, ADMIN, { material_id: m.id, quantidade: q, motivo: 'DEFEITO', destino: 'QUARENTENA',
      movimentacao_saida_id: s.id, localizacao_id: P01.id });
    return loteId(m, codigo);
  };
  const desbloquear = (m, corpo) => post(`${API}/materiais/${m.id}/desbloquear`, { justificativa: 'libera 209', ...corpo });
  const recusou = (r, msg) => { assert.strictEqual(r.status, 400, JSON.stringify(r.body)); assert.strictEqual(r.body.error, msg); };
  const contaDesbloqueios = async (m) => Number((await dbGet(db,
    "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'DESBLOQUEIO'", [m.id])).n);

  // RN-209.05: sem lote so do "sem lote" (B1417) e a ordem das recusas (B1420)
  await test('[RN-209.05] total 5 = L1 2 + sem lote 3: sem lote q=4 -> M1; q=6 -> a literal de hoje; q=3 -> 200 (L1 fica 2)', async () => {
    const m = await material(); const L1 = await quarentena(m, 2);
    await inspectionService.bloquearMaterial(db, ADMIN, m.id, { quantidade: 3, justificativa: 'avulso' });
    recusou(await desbloquear(m, { quantidade: 4 }), M1(3, 'L1: 2'));
    recusou(await desbloquear(m, { quantidade: 6 }), 'Quantidade bloqueada insuficiente: 5');
    assert.strictEqual(await contaDesbloqueios(m), 0);
    assert.strictEqual((await desbloquear(m, { quantidade: 3 })).status, 200);
    assert.deepStrictEqual(await porLote(m), { material_id: m.id, total: 2, sem_lote: 0, lotes: [{ lote_id: L1, codigo: 'L1', quantidade: 2 }] });
  });

  // ── T4 (o desbloqueio avulso aceita lote_id, B1422) + o motor da T3 pelo lote — vindos do pendente ───────────────────────────
  const M2 = (codigo, noLote) => `Quantidade bloqueada insuficiente no lote ${codigo}: ${noLote} UN`;
  // M3: o numero e MAX(0, noLote + q) = o que o lote tinha bloqueado antes do estorno (contrato do plano). O T0 esperava 2 no
  // cenario da RN-209.06 c, mas ali L1 ja tinha sido todo liberado (0) — o teste estava errado contra o contrato (corrigido na T4).
  const M3 = (codigo, n) => `Não é possível estornar: o bloqueio do lote ${codigo} já foi desfeito (bloqueado no lote: ${n} UN)`;
  const B1422 = 'lote_id deve ser um número inteiro positivo';
  const estornar = (id) => post(`${API}/movimentacoes/${id}/cancelar`, { motivo: 'estorno 209' });
  const bloqueadoPorLote = (dbx, id) => helper().bloqueadoPorLote(dbx, id);

  await test('[RN-209.04 a] desbloquear L1 2 de L1 2: 200, DESBLOQUEIO com L1, total e L1 descem', async () => {
    const m = await material(); const L1 = await quarentena(m, 2);
    const r = await desbloquear(m, { quantidade: 2, lote_id: L1 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const d = await dbGet(db, "SELECT lote_id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'DESBLOQUEIO'", [m.id]);
    assert.strictEqual(d.lote_id, L1);
    assert.deepStrictEqual(await bloqueadoPorLote(db, m.id), { material_id: m.id, total: 0, sem_lote: 0, lotes: [] });
  });

  await test('[RN-209.04 b] L1 2 + avulso 3: desbloquear 3 de L1 -> 400 M2, nada gravado', async () => {
    const m = await material(); const L1 = await quarentena(m, 2);
    await inspectionService.bloquearMaterial(db, ADMIN, m.id, { quantidade: 3, justificativa: 'avulso' });
    recusou(await desbloquear(m, { quantidade: 3, lote_id: L1 }), M2('L1', 2));
    assert.strictEqual(await contaDesbloqueios(m), 0); assert.strictEqual(await bloqueada(m), 5);
  });

  await test('[RN-209.04 c] lote de outro material / inexistente -> as literais do motor', async () => {
    const m = await material(); await quarentena(m, 2);
    const outro = await material(); await entrar(outro, 1, 'LX');
    recusou(await desbloquear(m, { quantidade: 1, lote_id: await loteId(outro, 'LX') }), 'O lote informado pertence a outro material');
    recusou(await desbloquear(m, { quantidade: 1, lote_id: 999999 }), 'Lote nao encontrado');
    assert.strictEqual(await contaDesbloqueios(m), 0);
  });

  await test('[RN-209.04 d, B1422] lote_id "x" / 0 / 1.5 -> 400; vazio e null = sem lote', async () => {
    const m = await material(); await entrar(m, 5, 'L1');
    await inspectionService.bloquearMaterial(db, ADMIN, m.id, { quantidade: 3, justificativa: 'avulso' });
    for (const v of ['x', 0, 1.5, -2]) recusou(await desbloquear(m, { quantidade: 1, lote_id: v }), B1422); // eslint-disable-line no-await-in-loop
    assert.strictEqual((await desbloquear(m, { quantidade: 1, lote_id: '' })).status, 200);
    assert.strictEqual((await desbloquear(m, { quantidade: 1, lote_id: null })).status, 200);
    assert.strictEqual(await bloqueada(m), 1);
  });

  await test('[RN-209.06 a] estornar o DESBLOQUEIO de L1 -> L1 volta (cancelado = 1), sem guarda nova', async () => {
    const m = await material(); const L1 = await quarentena(m, 2);
    assert.strictEqual((await desbloquear(m, { quantidade: 2, lote_id: L1 })).status, 200);
    const d = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'DESBLOQUEIO'", [m.id]);
    assert.strictEqual((await estornar(d.id)).status, 200);
    assert.deepStrictEqual((await bloqueadoPorLote(db, m.id)).lotes, [{ lote_id: L1, codigo: 'L1', quantidade: 2 }]);
  });

  await test('[RN-209.06 c] L1 2 + sem lote 2, desbloqueia L1 2, estorna o BLOQUEIO de L1 -> 400 M3; BLOQUEIO vivo, sem ESTORNO, total 2 = sem lote 2', async () => {
    const m = await material(); const L1 = await quarentena(m, 2);
    await inspectionService.bloquearMaterial(db, ADMIN, m.id, { quantidade: 2, justificativa: 'avulso' });
    assert.strictEqual((await desbloquear(m, { quantidade: 2, lote_id: L1 })).status, 200);
    const bl = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'BLOQUEIO' AND lote_id = ?", [m.id, L1]);
    recusou(await estornar(bl.id), M3('L1', 0));
    const depois = await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [bl.id]);
    assert.strictEqual(Number(depois.cancelado), 0, 'o BLOQUEIO continua vivo');
    assert.strictEqual(Number((await dbGet(db, "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ESTORNO'", [m.id])).n), 0);
    assert.deepStrictEqual(await bloqueadoPorLote(db, m.id), { material_id: m.id, total: 2, sem_lote: 2, lotes: [] });
  });

  await test('[RN-209.10] dois desbloqueios simultaneos de L1 2 (total 4) pedindo 2 cada: um 200, um 400 M2; total 2, L1 0', async () => {
    const m = await material(); const L1 = await quarentena(m, 2);
    await inspectionService.bloquearMaterial(db, ADMIN, m.id, { quantidade: 2, justificativa: 'avulso' });
    const rs = await Promise.allSettled([1, 2].map(() => inspectionService.desbloquearMaterial(db, ADMIN, m.id,
      { quantidade: 2, lote_id: L1, justificativa: 'corrida' })));
    assert.deepStrictEqual(rs.map((x) => x.status).sort(), ['fulfilled', 'rejected']);
    assert.strictEqual(rs.find((x) => x.status === 'rejected').reason.message, M2('L1', 0));
    assert.deepStrictEqual(await bloqueadoPorLote(db, m.id), { material_id: m.id, total: 2, sem_lote: 2, lotes: [] });
  });

  await test('[RN-209.07, servico] registrarDevolucao -> desbloquearMaterial(L1) -> registrarMovimentacao SUCATA L1 2', async () => {
    const m = await material(); const L1 = await quarentena(m, 2);
    await inspectionService.desbloquearMaterial(db, ADMIN, m.id, { quantidade: 2, lote_id: L1, justificativa: 'descarte' });
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m.id, tipo: 'SUCATA', quantidade: 2, motivo: 'descarte 209',
      justificativa: 'peca da quarentena', localizacao_origem_id: P01.id, lote_id: L1 });
    const l = await dbAll(db, `SELECT tipo, lote_id FROM movimentacoes_almoxarifado WHERE material_id = ?
      AND tipo IN ('ENTRADA_DEVOLUCAO','BLOQUEIO','DESBLOQUEIO','SUCATA') ORDER BY id`, [m.id]);
    assert.deepStrictEqual(l.map((x) => [x.tipo, x.lote_id]), [['ENTRADA_DEVOLUCAO', L1], ['BLOQUEIO', L1], ['DESBLOQUEIO', L1], ['SUCATA', L1]]);
    assert.deepStrictEqual((await bloqueadoPorLote(db, m.id)).lotes, []);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  terminou = true;
  process.exit(failed > 0 ? 1 : 0);
})();
