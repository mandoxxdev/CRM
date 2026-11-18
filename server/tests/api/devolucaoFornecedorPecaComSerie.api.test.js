/**
 * Etapa 245 — devolucao ao fornecedor (pela nao conformidade) de peca com numero de serie.
 *
 * A Fase 0 mediu que a execucao da NC recusa material com serie ANTES de mover qualquer coisa (nivel 6, RN-13 da Etapa 45) — nao
 * ha lote a gravar. O defeito era a recusa: ela ensinava so "de baixa pela tela de Movimentacoes", e esse caminho e recusado com tudo
 * reprovado (o reprovado esta bloqueado: "Saldo insuficiente") e, com parte reprovada, deixa uma peca BOA presa no bloqueio. O caminho
 * que funciona tem tres passos: desbloquear a reprovada, Saida com as series, cancelar a NC.
 *
 * Cobre: RN-245.01 (a recusa pelo fluxo real, nada gravado), RN-245.02 (a literal nova), RN-245.03 (o caminho ensinado fecha, pela
 * rota — integracao), RN-245.04 (o campo de leitura `execucao_recusada_por_serie`, amarrado ao `/executar`).
 *
 * Plano: docs/superpowers/plans/2026-11-18-almoxarifado-etapa245-devolucao-fornecedor-peca-com-serie.md
 * Executar: cd server && node tests/api/devolucaoFornecedorPecaComSerie.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const nc = require('../../services/almoxarifado/nonConformityService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 245', role: 'admin', is_superadmin: 1, email: 'a245@t.com' };
const API = '/api/almoxarifado';
// Fase 5 (achado 1): quem registra a execucao (Compras/Qualidade) nao desbloqueia (ajustar_estoque: Gestor) nem da a Saida
// (movimentar: Almoxarife) — a literal diz quem faz cada passo.
const RECUSA_SERIE = 'Material com controle de série não pode ser devolvido por aqui — o Gestor desbloqueia a quantidade reprovada '
  + 'em Inspeções, o Almoxarife dá baixa das peças em Movimentações → Saída escolhendo os números de série, e a Qualidade cancela '
  + 'este documento informando a baixa';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 245: devolucao ao fornecedor de peca com serie ===\n');
  const { app, db, close } = await createTestApp({ user: { ...ADMIN } });
  const post = (u, b) => request(app).post(u).send(b);
  const alm = await post(`${API}/almoxarifados`, { codigo: 'ALM245', nome: 'Almox 245' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  await post(`${API}/localizacoes`, { codigo: 'Z245-01', descricao: 'Z245-01', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z245-01'");

  const estado = async (mid) => {
    const m = await dbGet(db, 'SELECT quantidade_atual a, quantidade_bloqueada b FROM materiais_almoxarifado WHERE id = ?', [mid]);
    const series = (await dbAll(db, 'SELECT numero, status FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [mid]))
      .map((s) => `${s.numero}:${s.status}`).join(' ');
    const livro = (await dbAll(db, 'SELECT tipo FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id', [mid]))
      .map((x) => x.tipo).join(',');
    return { fisico: Number(m.a), bloqueado: Number(m.b), series, livro };
  };

  /** Material com serie (e, se `lote`, com controle de lote), recebido (A1..A4) e inspecionado pela rota; a NC automatica. */
  async function reprovada({ aprovada, reprovadaQtd, lote = 1, serie = 1 }) {
    const c = `S245-${++seq}`;
    const mid = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
      material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
      VALUES (?, ?, 'UN', 0, 0, 1, 1, 1, ?, ?, ?)`, [c, c, lote, serie, P01.id])).lastID;
    const item = { material_id: mid, quantidade: 4, quantidade_recebida: 4 };
    if (serie) item.series = 'A1\nA2\nA3\nA4';
    if (lote) item.lote = 'L1';
    const rec = await post(`${API}/recebimentos`, { tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: `NF${c}`, itens: [item] });
    assert.strictEqual(rec.status, 201, `recebimento: ${JSON.stringify(rec.body)}`);
    const apr = await post(`${API}/recebimentos/${rec.body.id}/aprovar`, {});
    assert.strictEqual(apr.status, 200, `aprovar: ${JSON.stringify(apr.body)}`);
    const it = await dbGet(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [rec.body.id]);
    const insp = await post(`${API}/recebimentos/itens/${it.id}/inspecionar`, { quantidade_aprovada: aprovada,
      quantidade_reprovada: reprovadaQtd, resultado: 'REPROVADO', observacoes: 'trinca' });
    assert.strictEqual(insp.status, 201, `inspecionar: ${JSON.stringify(insp.body)}`);
    const doc = await dbGet(db, 'SELECT id, referencia_id FROM nao_conformidades_almoxarifado WHERE material_id = ? ORDER BY id DESC', [mid]);
    assert.ok(doc, 'a reprovacao nao abriu a NC automatica');
    const L1 = lote ? (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ?', [mid])).id : null;
    return { mid, ncId: doc.id, inspecaoId: doc.referencia_id, L1 };
  }
  const decidir = async (id, decisao = 'DEVOLVER') => {
    const r = await post(`${API}/nao-conformidades/${id}/decidir`, { decisao, justificativa: 'trinca na peca' });
    assert.strictEqual(r.status, 200, `decidir: ${JSON.stringify(r.body)}`);
  };
  const executar = (id) => post(`${API}/nao-conformidades/${id}/executar`, { observacoes: 'coleta 245' });
  const flag = async (id) => {
    const lista = await request(app).get(`${API}/nao-conformidades?limite=500`);
    assert.strictEqual(lista.status, 200);
    const linha = lista.body.itens.find((x) => x.id === id);
    assert.ok(linha, 'a NC nao veio na lista');
    const um = await request(app).get(`${API}/nao-conformidades/${id}`);
    assert.strictEqual(um.status, 200);
    assert.strictEqual(um.body.execucao_recusada_por_serie, linha.execucao_recusada_por_serie, 'a lista e o GET /:id discordam');
    return linha.execucao_recusada_por_serie;
  };
  const serieId = async (mid, numero) => (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = ?',
    [mid, numero])).id;
  const saida = async (ctx, numero) => post(`${API}/movimentacoes/v2`, { material_id: ctx.mid, tipo: 'SAIDA', quantidade: 1,
    motivo: 'devolucao ao fornecedor', justificativa: 'peca reprovada devolvida', localizacao_origem_id: P01.id,
    serie_ids: [await serieId(ctx.mid, numero)], lote_id: ctx.L1 || undefined });

  // ── RN-245.01 / .02 — a recusa, pelo fluxo real, sem gravar nada ──────────────────────────────────────────────────────────────
  for (const lote of [1, 0]) {
    await test(`[RN-245.01/.02] serie ${lote ? 'com' : 'sem'} controle de lote, 3/1 reprovada, DEVOLVER: /executar 400 com o caminho inteiro; nada gravado`, async () => {
      const ctx = await reprovada({ aprovada: 3, reprovadaQtd: 1, lote });
      await decidir(ctx.ncId);
      const antes = await estado(ctx.mid);
      assert.deepStrictEqual([antes.fisico, antes.bloqueado], [4, 1], 'premissa: a reprovacao bloqueou 1');
      const r = await executar(ctx.ncId);
      assert.strictEqual(r.status, 400, `executar: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, RECUSA_SERIE);
      assert.deepStrictEqual(await estado(ctx.mid), antes, 'a recusa gravou alguma coisa');
      const doc = await dbGet(db, 'SELECT status, execucao_estado, execucao_em FROM nao_conformidades_almoxarifado WHERE id = ?', [ctx.ncId]);
      assert.deepStrictEqual([doc.status, doc.execucao_estado, doc.execucao_em], ['DECIDIDA', 'PENDENTE', null]);
    });
  }

  // ── RN-245.03 — o caminho que a recusa ensina fecha (integracao, pela rota) ──────────────────────────────────────────────────
  await test('[RN-245.03 a] 0/4 reprovadas: a Saida direta e recusada (por isso o desbloqueio); desbloquear 1 -> Saida da A4 com L1 -> cancelar: fisico 3, bloqueado 3, resumo fecha', async () => {
    const ctx = await reprovada({ aprovada: 0, reprovadaQtd: 4 });
    await decidir(ctx.ncId);
    const direta = await saida(ctx, 'A4');
    assert.strictEqual(direta.status, 400, `a Saida sem desbloquear passou: ${JSON.stringify(direta.body)}`);
    assert.strictEqual(direta.body.error, 'Saldo insuficiente. Disponível: 0 UN');
    const des = await post(`${API}/materiais/${ctx.mid}/desbloquear`, { quantidade: 1, justificativa: 'peca reprovada vai ao fornecedor' });
    assert.strictEqual(des.status, 200, `desbloquear: ${JSON.stringify(des.body)}`);
    const s = await saida(ctx, 'A4');
    assert.strictEqual(s.status, 201, `saida: ${JSON.stringify(s.body)}`);
    const canc = await post(`${API}/nao-conformidades/${ctx.ncId}/cancelar`, { motivo: 'A4 devolvida, baixa em Movimentacoes' });
    assert.strictEqual(canc.status, 200, `cancelar: ${JSON.stringify(canc.body)}`);
    const e = await estado(ctx.mid);
    assert.deepStrictEqual([e.fisico, e.bloqueado], [3, 3]);
    assert.strictEqual(e.series, 'A1:EM_ESTOQUE A2:EM_ESTOQUE A3:EM_ESTOQUE A4:ENTREGUE');
    const mov = await dbGet(db, "SELECT lote_id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA'", [ctx.mid]);
    assert.strictEqual(mov.lote_id, ctx.L1, 'a Saida nao gravou o lote');
    const resumo = await request(app).get(`${API}/materiais/${ctx.mid}/lotes/resumo`);
    assert.strictEqual(resumo.status, 200);
    assert.deepStrictEqual([resumo.body.fisico, resumo.body.soma_lotes, resumo.body.sem_lote_atribuido], [3, 3, 0]);
  });
  await test('[RN-245.03 b] 3/1 reprovada: desbloquear 1 -> Saida da A4 -> cancelar: bloqueado 0 (nenhuma peca boa presa)', async () => {
    const ctx = await reprovada({ aprovada: 3, reprovadaQtd: 1 });
    await decidir(ctx.ncId);
    const des = await post(`${API}/materiais/${ctx.mid}/desbloquear`, { quantidade: 1, justificativa: 'peca reprovada vai ao fornecedor' });
    assert.strictEqual(des.status, 200, `desbloquear: ${JSON.stringify(des.body)}`);
    assert.strictEqual((await saida(ctx, 'A4')).status, 201);
    assert.strictEqual((await post(`${API}/nao-conformidades/${ctx.ncId}/cancelar`, { motivo: 'A4 devolvida em Movimentacoes' })).status, 200);
    const e = await estado(ctx.mid);
    assert.deepStrictEqual([e.fisico, e.bloqueado], [3, 0]);
  });

  // ── RN-245.04 — o campo de leitura, amarrado ao /executar ────────────────────────────────────────────────────────────────────
  await test('[RN-245.04] automatica da inspecao + serie + DEVOLVER: execucao_recusada_por_serie 1 e o /executar recusa pela serie; ABERTA: 0', async () => {
    const ctx = await reprovada({ aprovada: 3, reprovadaQtd: 1 });
    assert.strictEqual(await flag(ctx.ncId), 0, 'antes de decidir (sem decisao) o campo tem de ser 0');
    await decidir(ctx.ncId);
    assert.strictEqual(await flag(ctx.ncId), 1);
    const r = await executar(ctx.ncId);
    assert.strictEqual(r.body.error, RECUSA_SERIE);
  });
  await test('[RN-245.04] material SEM serie, DEVOLVER: campo 0 e o /executar baixa (200)', async () => {
    const ctx = await reprovada({ aprovada: 3, reprovadaQtd: 1, serie: 0 });
    await decidir(ctx.ncId);
    assert.strictEqual(await flag(ctx.ncId), 0);
    const r = await executar(ctx.ncId);
    assert.strictEqual(r.status, 200, `executar: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.execucao.efeito, 'BAIXADA', JSON.stringify(r.body.execucao));
  });
  await test('[RN-245.04] NC MANUAL apontando para a inspecao, serie, DEVOLVER: campo 0 e o /executar registra sem mover (200)', async () => {
    const ctx = await reprovada({ aprovada: 3, reprovadaQtd: 1 });
    const manual = await nc.abrirNaoConformidadeManual(db, ADMIN, { origem: 'INSPECAO', referencia_tipo: 'INSPECAO',
      referencia_id: ctx.inspecaoId, tipo: 'OUTRO', descricao: 'aberta a mao 245' });
    await decidir(manual.id);
    assert.strictEqual(await flag(manual.id), 0);
    const r = await executar(manual.id);
    assert.strictEqual(r.status, 200, `executar: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.execucao.efeito, 'NENHUMA');
  });
  await test('[RN-245.04] automatica + serie decidida SUBSTITUICAO: campo 0 (so DEVOLVER e recusado pela serie)', async () => {
    const ctx = await reprovada({ aprovada: 3, reprovadaQtd: 1 });
    await decidir(ctx.ncId, 'SUBSTITUICAO');
    assert.strictEqual(await flag(ctx.ncId), 0);
    const r = await executar(ctx.ncId);
    assert.strictEqual(r.status, 200, `executar: ${JSON.stringify(r.body)}`);
  });

  // ── Fase 5 (achados 2 e 3) — o campo fora da inspecao e fora de DECIDIDA pendente ──────────────────────────────────────────
  await test('[RN-245.04 Fase 5] NC automatica de RECEBIMENTO (divergencia de quantidade) de material com serie, DEVOLVER: campo 0 e /executar 200', async () => {
    const c = `S245R-${++seq}`;
    const mid = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
      material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id) VALUES (?, ?, 'UN', 0, 0, 1, 0, 1, 0, 1, ?)`,
      [c, c, P01.id])).lastID;
    const rec = await post(`${API}/recebimentos`, { tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: `NF${c}`,
      itens: [{ material_id: mid, quantidade: 3, quantidade_recebida: 3, series: ['E1', 'E2', 'E3'].join('\n') }] });
    assert.strictEqual(rec.status, 201, JSON.stringify(rec.body));
    const it = await dbGet(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [rec.body.id]);
    const conf = await request(app).put(`${API}/recebimentos/${rec.body.id}/conferir`).send({ itens: [{ id: it.id, quantidade_recebida: 2 }] });
    assert.strictEqual(conf.status, 200, `conferir: ${JSON.stringify(conf.body)}`);
    const doc = await dbGet(db, `SELECT id, origem, aberto_automaticamente FROM nao_conformidades_almoxarifado
      WHERE material_id = ? ORDER BY id DESC`, [mid]);
    assert.ok(doc, 'a divergencia nao abriu NC');
    assert.deepStrictEqual([doc.origem, doc.aberto_automaticamente], ['RECEBIMENTO', 1], 'premissa: NC automatica do recebimento');
    await decidir(doc.id);
    assert.strictEqual(await flag(doc.id), 0);
    const r = await executar(doc.id);
    assert.strictEqual(r.status, 200, `executar: ${JSON.stringify(r.body)}`);
  });
  await test('[RN-245.04 Fase 5] fora de DECIDIDA pendente o campo e 0: cancelada pelo passo 3; executada antes de a serie ser ligada', async () => {
    const ctx = await reprovada({ aprovada: 3, reprovadaQtd: 1 });
    await decidir(ctx.ncId);
    assert.strictEqual(await flag(ctx.ncId), 1, 'metade positiva: decidida e pendente');
    assert.strictEqual((await post(`${API}/nao-conformidades/${ctx.ncId}/cancelar`, { motivo: 'baixa dada em Movimentacoes' })).status, 200);
    assert.strictEqual(await flag(ctx.ncId), 0, 'a cancelada continua dizendo que a execucao vai recusar pela serie');
    const sem = await reprovada({ aprovada: 3, reprovadaQtd: 1, serie: 0 });
    await decidir(sem.ncId);
    assert.strictEqual((await executar(sem.ncId)).status, 200);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_serie = 1 WHERE id = ?', [sem.mid]);
    assert.strictEqual(await flag(sem.ncId), 0, 'a executada diz que a execucao vai recusar pela serie');
  });

  terminou = true;
  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
