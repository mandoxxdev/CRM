/**
 * Etapa 273 (C556) — o estorno da ENTRADA de um lote (Etapa 264) nao conta como presa uma reprovacao ja liberada quando OUTRO lote tem bloqueio.
 *
 * Antes: L1 4 + 1, L2 4; reprovacao de 2 no L1 liberada pelo "Sem lote" (bloqueado 0, documento sem carimbo — C501); bloquear 4 do L2;
 * estornar a entrada de 4 do L1 -> 400 "2 UN presas nele (2 reprovadas na inspecao) ... Libere 1 UN ... pela nao conformidade" (a NC nao
 * destrava nada). O teto da reprovacao era `total - bloqueado DESTE lote`: o bloqueio do L2 no total devolvia a reprovacao liberada. Agora:
 * `total - max(bloqueado deste lote, soma por lote do bloqueado com lote)` — a mesma regua da Fase 5 da 272, numa funcao so.
 *
 * Cobre: RN-273.01 (passa), .02 (reprovacao nao liberada continua presa: a literal geral), .03 (bloqueio de outro lote sozinho nao prende),
 * .05 (servico e rota; a recusa volta o claim) e o fluxo.
 * Plano: docs/superpowers/plans/2026-11-27-almoxarifado-etapa273-estorno-entrada-lote-e-guarda-de-outra-caixa.md
 * Executar: cd server && node tests/api/estornoEntradaLoteReprovacaoLiberada.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`); });
}

const ADMIN = { id: 1, nome: 'Adm 273', role: 'admin', is_superadmin: 1, email: 'a273@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

// a literal geral da 264 (so reprovacao)
const GERAL = (L, presa, fica, libere) => `Não é possível estornar: o lote ${L} tem ${presa} UN presas nele (${presa} reprovadas na inspeção) e, `
  + `sem esta entrada, ficaria com ${fica} UN — o lote ficaria apontando para peças que não estão nele. Libere ${libere} UN do lote ${L} `
  + '(a reprovação pela não conformidade) e depois estorne esta entrada.';

(async () => {
  console.log('\n=== Etapa 273: o estorno da entrada de lote nao conta a reprovacao ja liberada (C556) ===\n');
  const { app, db } = await createTestApp({ user: { ...ADMIN } });
  const post = (u, b = {}) => request(app).post(u).send(b).then((x) => x);

  const alm = await post(`${API}/almoxarifados`, { codigo: 'ALM273', nome: 'Almox 273' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const r0 = await post(`${API}/localizacoes`, { codigo: 'Z273-01', descricao: 'Z273', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  assert.ok(r0.status === 201 || r0.status === 200, JSON.stringify(r0.body));
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z273-01'");

  const material = async ({ lote = 1 } = {}) => {
    const c = `E273-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id, permite_saldo_negativo)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, ?, 0, ?, 0)`, [c, c, lote, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, q, lote) => {
    const r = await post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e273',
      localizacao_destino_id: P01.id, ...(lote ? { lote } : {}) });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
    return r.body.id || (await dbGet(db, 'SELECT MAX(id) AS id FROM movimentacoes_almoxarifado WHERE material_id = ?', [m.id])).id;
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const bloquear = (m, q, lid) => post(`${API}/materiais/${m.id}/bloquear`, { quantidade: q, justificativa: 'avaria 273', lote_id: lid });
  const desbloquear = (m, q, lid) => post(`${API}/materiais/${m.id}/desbloquear`, { quantidade: q, justificativa: 'libera 273', lote_id: lid });
  const saida = (m, q, extra = {}) => post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'SAIDA', quantidade: q,
    motivo: 's273', justificativa: 'saida 273', ...extra });
  const estornar = (id) => post(`${API}/movimentacoes/${id}/cancelar`, { motivo: 'estorno 273' });
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
  const reprovarNoL1 = async (m, L1, q) => {
    const rec = await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal) VALUES (?,?,?)',
      [`REC-273-${m.id}-${++seq}`, 'RECEBIDO', 'NF-273']);
    const it = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
      quantidade_recebida, lote_id, lote) VALUES (?,?,?,?,?,?)`, [rec.lastID, m.id, q, q, L1, 'L1']);
    await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado (recebimento_item_id, conforme, quantidade_aprovada, quantidade_reprovada,
      responsavel_id, responsavel_nome) VALUES (?,?,?,?,?,?)`, [it.lastID, 0, 0, q, 9, 'Q']);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = quantidade_bloqueada + ? WHERE id = ?', [q, m.id]);
  };
  // L1 4 + 1, L2 4; reprovacao de 2 no L1 (liberada pelo "Sem lote" se `liberar`)
  const montar = async ({ liberar = true, reprovar = true } = {}) => {
    const m = await material();
    const e4 = await entrar(m, 4, 'L1');
    await entrar(m, 1, 'L1');
    await entrar(m, 4, 'L2');
    const L1 = await loteId(m, 'L1'); const L2 = await loteId(m, 'L2');
    if (reprovar) await reprovarNoL1(m, L1, 2);
    if (reprovar && liberar) {
      await ok(desbloquear(m, 2, undefined));
      assert.strictEqual(Number((await foto(m)).mat.b), 0, 'premissa: a reprovacao saiu pelo "Sem lote" (documento sem carimbo)');
    }
    return { m, e4, L1, L2 };
  };
  const saldoLote = async (m, lid) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) AS q FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND lote_id = ?`, [m.id, lid])).q);

  // ---------------------------------------------------------------- RN-273.01
  await test('[RN-273.01 rota] reprovacao de 2 no L1 ja liberada, 4 bloqueadas no L2: estornar a entrada de 4 do L1 -> 200 (L1 1, bloqueado 4)', async () => {
    const { m, e4, L1, L2 } = await montar();
    await ok(bloquear(m, 4, L2));
    await ok(estornar(e4));
    assert.strictEqual(await saldoLote(m, L1), 1);
    assert.deepStrictEqual((await foto(m)).mat, { q: 5, b: 4 });
    assert.strictEqual(await bloqueadoNoLote(m, L2), 4, 'o bloqueio do L2 fica');
  });
  await test('[RN-273.01 servico] o mesmo pelo servico: cancelarMovimentacao passa', async () => {
    const { m, e4, L2 } = await montar();
    await ok(bloquear(m, 4, L2));
    await stockService.cancelarMovimentacao(db, ADMIN, e4, 'estorno 273');
    const mov = await dbGet(db, 'SELECT cancelado, movimento_estorno_id FROM movimentacoes_almoxarifado WHERE id = ?', [e4]);
    assert.strictEqual(mov.cancelado, 1);
    assert.ok(mov.movimento_estorno_id, 'o estorno concluiu');
  });
  await test('[RN-273.01 parcial] 4 bloqueadas no L2 e 1 no L1: o teto olha todos os lotes -> o estorno passa (L1 fica 1, com 1 bloqueada)', async () => {
    const { m, e4, L1, L2 } = await montar();
    await ok(bloquear(m, 4, L2));
    await ok(bloquear(m, 1, L1));
    await ok(estornar(e4));
    assert.strictEqual(await saldoLote(m, L1), 1);
  });

  // ---------------------------------------------------------------- RN-273.02
  await test('[RN-273.02 rota] a reprovacao NAO liberada (bloqueado 2 + 4 do L2) continua presa -> 400 com a literal geral, nada gravado', async () => {
    const { m, e4, L2 } = await montar({ liberar: false });
    await ok(bloquear(m, 4, L2));
    await recusa(m, estornar(e4), GERAL('L1', 2, 1, 1));
  });
  await test('[RN-273.02 servico] o mesmo pelo servico: 400 com a literal geral e o claim volta', async () => {
    const { m, e4, L2 } = await montar({ liberar: false });
    await ok(bloquear(m, 4, L2));
    let erro = null;
    try { await stockService.cancelarMovimentacao(db, ADMIN, e4, 'estorno 273'); } catch (e) { erro = e; }
    assert.ok(erro, 'esperava a recusa');
    assert.deepStrictEqual([erro.status, erro.message], [400, GERAL('L1', 2, 1, 1)]);
    const mov = await dbGet(db, 'SELECT cancelado, movimento_estorno_id FROM movimentacoes_almoxarifado WHERE id = ?', [e4]);
    assert.deepStrictEqual([mov.cancelado, mov.movimento_estorno_id], [0, null], 'o claim volta');
  });
  await test('[RN-273.02 sem outro lote] reprovacao de 2 nao liberada, sem bloqueio no L2 -> 400 (como na 264)', async () => {
    const { m, e4 } = await montar({ liberar: false });
    await recusa(m, estornar(e4), GERAL('L1', 2, 1, 1));
  });

  // ---------------------------------------------------------------- RN-273.03
  await test('[RN-273.03] sem reprovacao, 4 bloqueadas no L2: o estorno da entrada de 4 do L1 passa', async () => {
    const { m, e4, L2 } = await montar({ reprovar: false });
    await ok(bloquear(m, 4, L2));
    await ok(estornar(e4));
  });
  await test('[RN-273.03 controle] 2 bloqueadas no proprio L1: o estorno de 4 (fica 1) -> 400 com a literal "so o bloqueio" da 264', async () => {
    const { m, e4, L1 } = await montar({ reprovar: false });
    await ok(bloquear(m, 2, L1));
    await recusa(m, estornar(e4), 'Não é possível estornar: o lote L1 tem 2 UN bloqueadas e, sem esta entrada, ficaria com 1 UN — o bloqueio '
      + 'ficaria apontando para peças que não estão no lote. Desbloqueie 1 UN do lote L1 (Desbloquear Material, escolhendo o lote L1) e '
      + 'depois estorne esta entrada.');
  });

  // ---------------------------------------------------------------- fluxo
  await test('[fluxo] o estorno passa -> estornar o bloqueio do L2 -> Bloquear 1 sem lote passa; com o L1 indicado, a recusa segura do C516', async () => {
    const { m, e4, L1, L2 } = await montar();
    await ok(bloquear(m, 4, L2));
    await ok(estornar(e4));
    await ok(estornar(await ultimo(m, 'BLOQUEIO')));
    assert.deepStrictEqual((await foto(m)).mat, { q: 5, b: 0 });
    assert.strictEqual(await bloqueadoNoLote(m, L2), 0);
    // o Bloquear indicando o lote le a reprovacao CRUA (Etapa 249, de proposito: nunca deixa bloquear peca reprovada) — a reprovacao
    // liberada pelo "Sem lote" ainda conta ali (C516, recusa segura). Nao muda nesta etapa (B1651).
    const r = await bloquear(m, 1, L1);
    assert.deepStrictEqual([r.status, r.body.error], [400, 'Saldo livre do lote L1 insuficiente para bloquear: 0 UN']);
    await ok(bloquear(m, 1, undefined));
  });

  terminou = true;
  console.log(`\n${passed} passou, ${failed} falhou\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
