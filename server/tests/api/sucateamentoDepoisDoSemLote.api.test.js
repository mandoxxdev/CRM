/**
 * Etapa 275 (C559) — o sucateamento da reprovacao de uma inspecao (NC SUCATEAR -> solicitar -> duas assinaturas) depois que o Desbloquear
 * "Sem lote" ja a tirou.
 *
 * A reprovacao mora no bloqueado SEM lote (B1418). Antes: L1 4 + 1, L2 4; reprovacao de 2 no L1 liberada pelo "Sem lote"; bloquear 4 do L2;
 * solicitar e assinar -> APROVADO: 2 pecas LIVRES do L1 sucateadas e o bloqueado caia para 2 com as 4 do L2 ainda bloqueadas no livro — o
 * mesmo furo da devolucao consertado na 274 (B1655). Agora a mesma conferencia nas duas portas do sucateamento: na solicitacao (S2) e na
 * assinatura que fecha (S1, a garantia, dentro da trava e depois do claim da inspecao).
 *
 * Cobre: RN-275.01 (assinatura, servico e rota), .02 (a segunda solicitacao da mesma inspecao), .03 (solicitacao), .04 (como antes), .05 (fluxo).
 * Plano: docs/superpowers/plans/2026-11-27-almoxarifado-etapa275-sucateamento-e-entrega-dos-dois-itens.md
 * Executar: cd server && node tests/api/sucateamentoDepoisDoSemLote.api.test.js
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

  const scrap = require('../../services/almoxarifado/scrapDisposalService');
  const ALMOX1 = { id: 27531, nome: 'Almox Um 275', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'a1-275@t.com' };
  const ALMOX2 = { id: 27532, nome: 'Almox Dois 275', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'a2-275@t.com' };
  const GESTOR = { id: 27533, nome: 'Gestor 275', role: 'usuario', perfil_almoxarifado: 'GESTOR', email: 'g-275@t.com' };
  // a NC automatica decidida SUCATEAR (o mesmo montar da 274, com a decisao trocada)
  const montarSuc = async ({ liberar = true, l2 = true } = {}) => {
    const m = await material();
    await entrar(m, 4, 'L1'); await entrar(m, 1, 'L1'); await entrar(m, 4, 'L2');
    const L1 = await loteId(m, 'L1'); const L2 = await loteId(m, 'L2');
    const rec = await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal) VALUES (?,?,?)',
      [`REC-275-${m.id}`, 'RECEBIDO', 'NF-275']);
    const it = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
      quantidade_recebida, lote_id, lote) VALUES (?,?,?,?,?,?)`, [rec.lastID, m.id, 2, 2, L1, 'L1']);
    const insp = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado (recebimento_item_id, conforme, quantidade_aprovada,
      quantidade_reprovada, responsavel_id, responsavel_nome) VALUES (?,?,?,?,?,?)`, [it.lastID, 0, 0, 2, 9, 'Q']);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = quantidade_bloqueada + 2 WHERE id = ?', [m.id]);
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, insp.lastID);
    await nc.decidirNaoConformidade(db, QUALIDADE, doc.id, { decisao: 'SUCATEAR', justificativa: 'sucata 275' });
    if (liberar) await ok(desbloquear(m, 2, undefined));
    if (l2) await ok(bloquear(m, 4, L2));
    return { m, L1, L2, ncId: doc.id, inspId: insp.lastID };
  };
  const erroDe = async (fn) => { try { await fn(); } catch (e) { return e; } throw new Error('esperava erro'); };
  const solicitar = (ncId) => scrap.solicitarDoReprovado(db, ALMOX1, ncId, { justificativa: 'reprovado 275' });
  const S = (s, q, lista, fim) => `Não é possível sucatear pela não conformidade: só ${s} UN do bloqueado está sem lote e a reprovação tem `
    + `${q} UN — parte dela pode já ter sido liberada pelo Desbloquear (o resto do bloqueado está em lote: ${lista}). ${fim}`;
  const FIM_S1 = 'Bloqueie de novo, sem lote, o que falta e assine outra vez, ou rejeite o sucateamento';
  const FIM_S2 = 'Bloqueie de novo, sem lote, o que falta e solicite outra vez, ou cancele a não conformidade';
  const suc = (id) => dbGet(db, `SELECT status, aprovador_almox_id AS a, aprovador_gestao_id AS g, movimentacao_sucata_id AS mov
    FROM sucateamentos_almoxarifado WHERE id = ?`, [id]);
  const carimbo = async (inspId) => (await dbGet(db, 'SELECT sucateamento_em IS NOT NULL AS c FROM inspecoes_recebimento_almoxarifado WHERE id = ?',
    [inspId])).c;
  // solicitado com a reprovacao presa; o "Sem lote" e o L2 DEPOIS (o caminho que so a assinatura pega)
  const solicitadoAntes = async () => {
    const x = await montarSuc({ liberar: false, l2: false });
    const s = await solicitar(x.ncId);
    await ok(desbloquear(x.m, 2, undefined));
    await ok(bloquear(x.m, 4, x.L2));
    return { ...x, sucId: s.id };
  };

  // ---------------------------------------------------------------- RN-275.03 (a solicitacao)
  await test('[RN-275.03] reprovacao liberada pelo "Sem lote" + 4 no L2: solicitar -> 400 S2, nenhuma solicitacao gravada', async () => {
    const x = await montarSuc();
    const antes = await foto(x.m);
    const e = await erroDe(() => solicitar(x.ncId));
    assert.deepStrictEqual([e.status, e.message], [400, S(0, 2, 'L2: 4', FIM_S2)]);
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) AS n FROM sucateamentos_almoxarifado WHERE nao_conformidade_id = ?', [x.ncId])).n, 0);
    assert.deepStrictEqual(await foto(x.m), antes, 'nada gravado');
  });
  await test('[RN-275.03 rota] o mesmo por POST /nao-conformidades/:id/solicitar-sucateamento -> 400 S2', async () => {
    const x = await montarSuc();
    const r = await post(`${API}/nao-conformidades/${x.ncId}/solicitar-sucateamento`, { justificativa: 'reprovado 275' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, S(0, 2, 'L2: 4', FIM_S2));
  });

  // ---------------------------------------------------------------- RN-275.01 (a assinatura que fecha: a garantia)
  await test('[RN-275.01 servico] solicitado antes, liberado e L2 bloqueado depois: a 2a assinatura -> 400 S1, nada baixa, volta a SOLICITADO', async () => {
    const x = await solicitadoAntes();
    await scrap.aprovar(db, GESTOR, x.sucId, 'gestao');
    const antes = await foto(x.m);
    const e = await erroDe(() => scrap.aprovar(db, ALMOX2, x.sucId, 'almoxarifado'));
    assert.deepStrictEqual([e.status, e.message], [400, S(0, 2, 'L2: 4', FIM_S1)]);
    assert.deepStrictEqual(await foto(x.m), antes, 'nada gravado');
    assert.deepStrictEqual(await suc(x.sucId), { status: 'SOLICITADO', a: null, g: GESTOR.id, mov: null }, 'a perna do gestor fica');
    assert.strictEqual(await carimbo(x.inspId), 0, 'o carimbo da inspecao volta');
  });
  await test('[RN-275.01 rota] o mesmo por POST /sucateamentos/:id/aprovar-almoxarifado -> 400 S1', async () => {
    const x = await solicitadoAntes();
    await scrap.aprovar(db, GESTOR, x.sucId, 'gestao');
    const r = await post(`${API}/sucateamentos/${x.sucId}/aprovar-almoxarifado`, {});
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, S(0, 2, 'L2: 4', FIM_S1));
    assert.strictEqual((await suc(x.sucId)).status, 'SOLICITADO');
  });

  // ---------------------------------------------------------------- RN-275.04 (como antes)
  await test('[RN-275.04 controle] reprovacao presa + 4 no L2: solicitar e assinar -> APROVADO, L1 3, bloqueado 4 (o do L2)', async () => {
    const x = await montarSuc({ liberar: false });
    const s = await solicitar(x.ncId);
    await scrap.aprovar(db, GESTOR, s.id, 'gestao');
    const r = await scrap.aprovar(db, ALMOX2, s.id, 'almoxarifado');
    assert.strictEqual(r.sucateamento.status, 'APROVADO');
    assert.strictEqual(await saldoLote(x.m, x.L1), 3);
    assert.deepStrictEqual((await foto(x.m)).mat, { q: 7, b: 4 });
    assert.strictEqual(await bloqueadoNoLote(x.m, x.L2), 4);
  });
  await test('[RN-275.04 sem lote] liberada e nenhum bloqueio em lote: a solicitacao recusa como antes ("ja havia saido do bloqueio")', async () => {
    const x = await montarSuc({ l2: false });
    const e = await erroDe(() => solicitar(x.ncId));
    assert.strictEqual(e.message, 'O material já havia saído do bloqueio — há 0 UN bloqueado(s), a reprovação foi de 2');
  });

  // ---------------------------------------------------------------- RN-275.05 (fluxo)
  await test('[RN-275.05 fluxo] recusa S1 -> Bloquear 2 sem lote -> assinar de novo -> APROVADO (L1 3, bloqueado 4, as 4 do L2 seguem)', async () => {
    const x = await solicitadoAntes();
    await scrap.aprovar(db, GESTOR, x.sucId, 'gestao');
    await erroDe(() => scrap.aprovar(db, ALMOX2, x.sucId, 'almoxarifado'));
    await ok(bloquear(x.m, 2, undefined));
    const r = await scrap.aprovar(db, ALMOX2, x.sucId, 'almoxarifado');
    assert.strictEqual(r.sucateamento.status, 'APROVADO');
    assert.strictEqual(await saldoLote(x.m, x.L1), 3);
    assert.deepStrictEqual((await foto(x.m)).mat, { q: 7, b: 4 });
    assert.strictEqual(await bloqueadoNoLote(x.m, x.L2), 4);
  });

  await test('[RN-275.01 lote curto] solicitado, a entrada de 4 do L1 estornada, liberado e L2 depois: S1 com "rejeite o sucateamento"', async () => {
    const m = await material();
    const e4 = await entrar(m, 4, 'L1'); await entrar(m, 1, 'L1'); await entrar(m, 4, 'L2');
    const L1 = await loteId(m, 'L1'); const L2 = await loteId(m, 'L2');
    const rec = await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal) VALUES (?,?,?)',
      [`REC-275c-${m.id}`, 'RECEBIDO', 'NF-275']);
    const it = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
      quantidade_recebida, lote_id, lote) VALUES (?,?,?,?,?,?)`, [rec.lastID, m.id, 2, 2, L1, 'L1']);
    const insp = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado (recebimento_item_id, conforme, quantidade_aprovada,
      quantidade_reprovada, responsavel_id, responsavel_nome) VALUES (?,?,?,?,?,?)`, [it.lastID, 0, 0, 2, 9, 'Q']);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = quantidade_bloqueada + 2 WHERE id = ?', [m.id]);
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, insp.lastID);
    await nc.decidirNaoConformidade(db, QUALIDADE, doc.id, { decisao: 'SUCATEAR', justificativa: 'sucata 275' });
    const s = await solicitar(doc.id);
    await ok(desbloquear(m, 2, undefined));
    await ok(estornar(e4));
    await ok(bloquear(m, 4, L2));
    await scrap.aprovar(db, GESTOR, s.id, 'gestao');
    const antes = await foto(m);
    const e = await erroDe(() => scrap.aprovar(db, ALMOX2, s.id, 'almoxarifado'));
    assert.deepStrictEqual([e.status, e.message],
      [400, S(0, 2, 'L2: 4', 'O lote L1 tem só 1 UN, menos que a reprovação: rejeite o sucateamento')]);
    assert.deepStrictEqual(await foto(m), antes, 'nada gravado');
    assert.strictEqual((await suc(s.id)).status, 'SOLICITADO');
    const aud = await dbGet(db, `SELECT justificativa FROM auditoria_log_almoxarifado WHERE entidade = 'sucateamento' AND entidade_id = ?
      AND acao = 'compensacao' ORDER BY id DESC LIMIT 1`, [s.id]);
    assert.ok(aud, 'a trilha da compensacao');
    assert.ok(/liberada pelo Desbloquear sem lote/.test(aud.justificativa), aud.justificativa);
  });

  // ---------------------------------------------------------------- RN-275.02 (a segunda da mesma inspecao: o 409 de sempre)
  await test('[RN-275.02] duas NCs da mesma inspecao, as duas solicitadas; A sucateia (presa + L2); B assina -> 409 "ja foi sucateado", nao S1', async () => {
    const x = await montarSuc({ liberar: false });
    const row = await dbGet(db, 'SELECT * FROM nao_conformidades_almoxarifado WHERE id = ?', [x.ncId]);
    delete row.id;
    row.numero = `${row.numero}-B`;
    row.tipo = row.tipo === 'QUALIDADE' ? 'QUANTIDADE' : 'QUALIDADE';
    const cols = Object.keys(row);
    const ncB = (await dbRun(db, `INSERT INTO nao_conformidades_almoxarifado (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      cols.map((c) => row[c]))).lastID;
    const sa = await solicitar(x.ncId);
    const sb = await solicitar(ncB);
    await scrap.aprovar(db, GESTOR, sa.id, 'gestao');
    assert.strictEqual((await scrap.aprovar(db, ALMOX2, sa.id, 'almoxarifado')).sucateamento.status, 'APROVADO');
    await scrap.aprovar(db, GESTOR, sb.id, 'gestao');
    const antes = await foto(x.m);
    const e = await erroDe(() => scrap.aprovar(db, ALMOX2, sb.id, 'almoxarifado'));
    assert.deepStrictEqual([e.status, e.message], [409, 'O material desta inspeção já foi sucateado — a assinatura foi desfeita']);
    assert.deepStrictEqual(await foto(x.m), antes, 'nada se move');
    assert.strictEqual(await carimbo(x.inspId), 1, 'o carimbo da inspecao fica (o da A)');
  });

  terminou = true;
  console.log(`\n${passed} passou, ${failed} falhou\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
