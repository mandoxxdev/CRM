/**
 * Etapa 274 (C557) — a devolucao ao fornecedor (NC DEVOLVER) da reprovacao de uma inspecao depois que o Desbloquear "Sem lote" ja a tirou.
 *
 * A reprovacao mora no bloqueado SEM lote (B1418). Antes: L1 4 + 1, L2 4; reprovacao de 2 no L1 liberada pelo "Sem lote"; bloquear 4 do L2;
 * executar a NC -> 200 BAIXADA: 2 pecas livres saiam do L1 e o bloqueado caia para 2 com as 4 do L2 ainda bloqueadas no livro. Com a entrada
 * de 4 do L1 estornada antes (o C557 como foi escrito na 273), o motor recusava com a frase crua "Saldo insuficiente no lote L1. Disponivel: 1
 * UN" — nenhum negativo (o C557 dizia que podia tirar pecas que o lote nao tem: tenta, mas o motor recusa). Agora a mesma conferencia da
 * liberacao (Etapa 249, C501), antes de qualquer efeito: 400 L1, a NC volta a PENDENTE.
 *
 * Cobre: RN-274.06 (servico e rota), .07 (o C557 como escrito), .08 (como antes sem bloqueio em lote ou com a reprovacao presa), .09 (o fluxo
 * Bloquear sem lote -> executar; cancelar).
 * Plano: docs/superpowers/plans/2026-11-27-almoxarifado-etapa274-entregavel-do-detalhe-e-nao-conformidade.md
 * Executar: cd server && node tests/api/ncDevolucaoDepoisDoSemLote.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const nc = require('../../services/almoxarifado/nonConformityService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`); });
}

const ADMIN = { id: 1, nome: 'Adm 274', role: 'admin', is_superadmin: 1, email: 'a274@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});


(async () => {
  console.log('\n=== Etapa 274: a NC DEVOLVER depois do "Sem lote" (C557) ===\n');
  const { app, db } = await createTestApp({ user: { ...ADMIN } });
  const post = (u, b = {}) => request(app).post(u).send(b).then((x) => x);

  const alm = await post(`${API}/almoxarifados`, { codigo: 'ALM274', nome: 'Almox 273' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const r0 = await post(`${API}/localizacoes`, { codigo: 'Z274-01', descricao: 'Z274', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  assert.ok(r0.status === 201 || r0.status === 200, JSON.stringify(r0.body));
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z274-01'");

  const material = async ({ lote = 1 } = {}) => {
    const c = `E274-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id, permite_saldo_negativo)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, ?, 0, ?, 0)`, [c, c, lote, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, q, lote) => {
    const r = await post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e274',
      localizacao_destino_id: P01.id, ...(lote ? { lote } : {}) });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
    return r.body.id || (await dbGet(db, 'SELECT MAX(id) AS id FROM movimentacoes_almoxarifado WHERE material_id = ?', [m.id])).id;
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const bloquear = (m, q, lid) => post(`${API}/materiais/${m.id}/bloquear`, { quantidade: q, justificativa: 'avaria 274', lote_id: lid });
  const desbloquear = (m, q, lid) => post(`${API}/materiais/${m.id}/desbloquear`, { quantidade: q, justificativa: 'libera 274', lote_id: lid });
  const saida = (m, q, extra = {}) => post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'SAIDA', quantidade: q,
    motivo: 's273', justificativa: 'saida 273', ...extra });
  const estornar = (id) => post(`${API}/movimentacoes/${id}/cancelar`, { motivo: 'estorno 274' });
  const ultimo = async (m, tipo) => (await dbGet(db, 'SELECT MAX(id) AS id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ?',
    [m.id, tipo])).id;
  const foto = async (m) => ({
    mat: await dbGet(db, 'SELECT quantidade_atual AS q, quantidade_bloqueada AS b FROM materiais_almoxarifado WHERE id = ?', [m.id]),
    linhas: await dbAll(db, 'SELECT localizacao_id, lote_id, quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? ORDER BY id', [m.id]),
    livro: await dbAll(db, 'SELECT id, tipo, cancelado, movimento_estorno_id FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id', [m.id]),
  });
  const recusa = async (m, p, esperado) => {
    const antes = await foto(m);
    const r = await p;
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, esperado);
    assert.deepStrictEqual(await foto(m), antes, 'nada gravado');
  };
  const bloqueadoNoLote = async (m, lid) => Number((await dbGet(db, `SELECT COALESCE(SUM(CASE WHEN tipo = 'BLOQUEIO' THEN quantidade
      ELSE -quantidade END), 0) AS q FROM movimentacoes_almoxarifado WHERE material_id = ? AND lote_id = ? AND cancelado = 0
      AND tipo IN ('BLOQUEIO','DESBLOQUEIO')`, [m.id, lid])).q);
  const QUALIDADE = { id: 27423, nome: 'Qualidade 274', perfil_almoxarifado: 'QUALIDADE', email: 'q274@t.com' };
  // a reprovacao de 2 no L1 (bloqueado sem lote, como a decisao da inspecao deixa) e a NC automatica dela, decidida DEVOLVER
  const reprovarComNc = async (m, L1, q) => {
    const rec = await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal) VALUES (?,?,?)',
      [`REC-274-${m.id}-${++seq}`, 'RECEBIDO', 'NF-274']);
    const it = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
      quantidade_recebida, lote_id, lote) VALUES (?,?,?,?,?,?)`, [rec.lastID, m.id, q, q, L1, 'L1']);
    const insp = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado (recebimento_item_id, conforme, quantidade_aprovada,
      quantidade_reprovada, responsavel_id, responsavel_nome) VALUES (?,?,?,?,?,?)`, [it.lastID, 0, 0, q, 9, 'Q']);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = quantidade_bloqueada + ? WHERE id = ?', [q, m.id]);
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, insp.lastID);
    assert.ok(doc && doc.id, 'premissa: a NC automatica abriu');
    await nc.decidirNaoConformidade(db, QUALIDADE, doc.id, { decisao: 'DEVOLVER', justificativa: 'devolve 274' });
    return { ncId: doc.id, inspId: insp.lastID };
  };
  // L1 4 + 1, L2 4; reprovacao de 2 no L1 (liberada pelo "Sem lote" se `liberar`); 4 do L2 bloqueadas se `l2`; a entrada de 4 do L1
  // estornada se `estornar`
  const montar = async ({ liberar = true, l2 = true, estornar: est = false } = {}) => {
    const m = await material();
    const e4 = await entrar(m, 4, 'L1');
    await entrar(m, 1, 'L1');
    await entrar(m, 4, 'L2');
    const L1 = await loteId(m, 'L1'); const L2 = await loteId(m, 'L2');
    const { ncId, inspId } = await reprovarComNc(m, L1, 2);
    if (liberar) {
      await ok(desbloquear(m, 2, undefined));
      assert.strictEqual(Number((await foto(m)).mat.b), 0, 'premissa: a reprovacao saiu pelo "Sem lote"');
    }
    if (l2) await ok(bloquear(m, 4, L2));
    if (est) await ok(estornar(e4));
    return { m, e4, L1, L2, ncId, inspId };
  };
  const saldoLote = async (m, lid) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) AS q FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND lote_id = ?`, [m.id, lid])).q);
  const estadoNc = async (ncId, inspId) => ({
    nc: await dbGet(db, 'SELECT status, execucao_estado, execucao_em IS NOT NULL AS exec FROM nao_conformidades_almoxarifado WHERE id = ?', [ncId]),
    insp: (await dbGet(db, 'SELECT devolucao_fornecedor_em IS NOT NULL AS d FROM inspecoes_recebimento_almoxarifado WHERE id = ?', [inspId])).d,
  });
  const executarRota = (ncId) => post(`${API}/nao-conformidades/${ncId}/executar`, { observacoes: 'exec 274' });
  const executarServico = async (ncId) => {
    try { return { ok: await nc.registrarExecucao(db, QUALIDADE, ncId, { observacoes: 'exec 274' }) }; } catch (e) { return { erro: e }; }
  };
  // L1 (contrato congelado no plano)
  const L1MSG = (s, q, lista, fim) => `Não é possível devolver pela não conformidade: só ${s} UN do bloqueado está sem lote e a reprovação tem `
    + `${q} UN — parte dela pode já ter sido liberada pelo Desbloquear (o resto do bloqueado está em lote: ${lista}). ${fim}`;
  const FIM_BLOQUEIE = 'Bloqueie de novo, sem lote, o que falta e registre a execução outra vez, ou cancele a não conformidade';
  const FIM_LOTE = (L, n) => `O lote ${L} tem só ${n} UN, menos que a reprovação: cancele a não conformidade`;
  const pendente = async ({ ncId, inspId }) => assert.deepStrictEqual(await estadoNc(ncId, inspId),
    { nc: { status: 'DECIDIDA', execucao_estado: 'PENDENTE', exec: 0 }, insp: 0 }, 'a NC volta a PENDENTE, a inspecao sem carimbo');

  // ---------------------------------------------------------------- RN-274.06 (a variante 2 da Fase 0: o furo real)
  await test('[RN-274.06 servico] reprovacao liberada pelo "Sem lote" + 4 bloqueadas no L2: executar a devolucao -> 400 L1, nada se move', async () => {
    const x = await montar();
    const antes = await foto(x.m);
    const r = await executarServico(x.ncId);
    assert.ok(r.erro, `esperava a recusa: ${JSON.stringify(r.ok && r.ok.execucao)}`);
    assert.deepStrictEqual([r.erro.status, r.erro.message], [400, L1MSG(0, 2, 'L2: 4', FIM_BLOQUEIE)]);
    assert.deepStrictEqual(await foto(x.m), antes, 'nada gravado');
    await pendente(x);
  });
  await test('[RN-274.06 rota] o mesmo por POST /nao-conformidades/:id/executar -> 400 L1', async () => {
    const x = await montar();
    const antes = await foto(x.m);
    const r = await executarRota(x.ncId);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, L1MSG(0, 2, 'L2: 4', FIM_BLOQUEIE));
    assert.deepStrictEqual(await foto(x.m), antes, 'nada gravado');
    await pendente(x);
  });

  // ---------------------------------------------------------------- RN-274.07 (o C557 como escrito)
  await test('[RN-274.07] depois do estorno da entrada de 4 do L1 (L1 fica 1): -> 400 L1 com "cancele" (antes: a frase crua do motor)', async () => {
    const x = await montar({ estornar: true });
    assert.strictEqual(await saldoLote(x.m, x.L1), 1, 'premissa: o L1 ficou com 1');
    const antes = await foto(x.m);
    const r = await executarRota(x.ncId);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, L1MSG(0, 2, 'L2: 4', FIM_LOTE('L1', 1)));
    assert.deepStrictEqual(await foto(x.m), antes, 'nada gravado');
    await pendente(x);
  });

  // ---------------------------------------------------------------- RN-274.08 (sem bloqueio em lote, ou reprovacao ainda presa: como antes)
  await test('[RN-274.08 controle] reprovacao NAO liberada + 4 no L2 (sem lote 2): a devolucao passa — BAIXADA, L1 3, bloqueado 4 (o do L2)', async () => {
    const x = await montar({ liberar: false });
    const r = await executarRota(x.ncId);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.execucao.efeito, 'BAIXADA');
    assert.strictEqual(await saldoLote(x.m, x.L1), 3);
    assert.deepStrictEqual((await foto(x.m)).mat, { q: 7, b: 4 });
    assert.strictEqual(await bloqueadoNoLote(x.m, x.L2), 4);
  });
  await test('[RN-274.08 sem lote] reprovacao liberada e nenhum bloqueio em lote: o "registra sem mover" de sempre (SEM_SALDO)', async () => {
    const x = await montar({ l2: false });
    const antes = await foto(x.m);
    const r = await executarRota(x.ncId);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.execucao.efeito, 'SEM_SALDO');
    assert.deepStrictEqual(await foto(x.m), antes, 'nada se move');
  });

  // ---------------------------------------------------------------- RN-274.09 (fluxo)
  await test('[RN-274.09 fluxo] recusa -> Bloquear 2 sem lote -> executar -> BAIXADA (L1 3, bloqueado 4, as 4 do L2 seguem bloqueadas)', async () => {
    const x = await montar();
    assert.strictEqual((await executarRota(x.ncId)).status, 400);
    await ok(bloquear(x.m, 2, undefined));
    const r = await executarRota(x.ncId);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.execucao.efeito, 'BAIXADA');
    assert.strictEqual(await saldoLote(x.m, x.L1), 3);
    assert.deepStrictEqual((await foto(x.m)).mat, { q: 7, b: 4 });
    assert.strictEqual(await bloqueadoNoLote(x.m, x.L2), 4);
  });
  await test('[RN-274.09 cancelar] depois da recusa do RN-274.07 a NC pode ser cancelada (o caminho que a frase indica)', async () => {
    const x = await montar({ estornar: true });
    assert.strictEqual((await executarRota(x.ncId)).status, 400);
    const r = await post(`${API}/nao-conformidades/${x.ncId}/cancelar`, { motivo: 'o lote nao tem mais as pecas' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await dbGet(db, 'SELECT status FROM nao_conformidades_almoxarifado WHERE id = ?', [x.ncId])).status, 'CANCELADA');
  });

  // ---------------------------------------------------------------- Fase 5 (achado 1): a segunda NC da mesma inspecao ja devolvida
  await test('[RN-274.08 segunda NC] reprovacao presa + 4 no L2: a NC A devolve; a NC B (mesma inspecao) -> JA_DEVOLVIDA como antes, nao a recusa nova', async () => {
    const x = await montar({ liberar: false });
    const row = await dbGet(db, 'SELECT * FROM nao_conformidades_almoxarifado WHERE id = ?', [x.ncId]);
    delete row.id;
    row.numero = `${row.numero}-B`;
    row.tipo = row.tipo === 'QUALIDADE' ? 'QUANTIDADE' : 'QUALIDADE';
    const cols = Object.keys(row);
    const ncB = (await dbRun(db, `INSERT INTO nao_conformidades_almoxarifado (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      cols.map((c) => row[c]))).lastID;
    const a = await executarRota(x.ncId);
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    assert.strictEqual(a.body.execucao.efeito, 'BAIXADA');
    const antes = await foto(x.m);
    const b = await executarRota(ncB);
    assert.strictEqual(b.status, 200, JSON.stringify(b.body));
    assert.strictEqual(b.body.execucao.efeito, 'JA_DEVOLVIDA');
    assert.deepStrictEqual(await foto(x.m), antes, 'nada se move');
    assert.strictEqual((await estadoNc(x.ncId, x.inspId)).insp, 1, 'o carimbo da inspecao fica (o da NC A)');
  });

  terminou = true;
  console.log(`\n${passed} passou, ${failed} falhou\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
