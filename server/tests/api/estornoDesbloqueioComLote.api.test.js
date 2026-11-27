/**
 * Etapa 272 (C504, D (264) 5, D (249) 2) — o estorno de um Desbloquear com lote confere se o lote ainda tem as pecas para bloquear de novo.
 *
 * Antes: bloquear 4 no L1, desbloquear 4 do L1, estornar a entrada do L1 (passa, certo) e estornar o Desbloquear -> passava, e o bloqueio
 * voltava apontando para o L1 vazio. Agora: a regua do Bloquear indicando o lote (as pecas presas no lote — caixa de requisicao, inspecao,
 * bloqueado no lote, reprovado, terceiros — nao podem passar do saldo do lote), conferida dentro da secao do estorno, depois do material.
 *
 * Cobre: RN-272.01 (recusa com a literal E1, nada gravado), .02 (parte do lote saiu; o lote intacto passa), .03 (a caixa separada conta),
 * .04 (o material primeiro: a literal de sempre), .05 (sem lote: como antes), .06 (corrida com a Saida do lote) e o fluxo (T1).
 *
 * Plano: docs/superpowers/plans/2026-11-27-almoxarifado-etapa272-estorno-desbloqueio-e-lote-na-entrega.md
 * Executar: cd server && node tests/api/estornoDesbloqueioComLote.api.test.js
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

const ADMIN = { id: 1, nome: 'Adm 272', role: 'admin', is_superadmin: 1, email: 'a272@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

// E1 (contrato congelado no plano)
const E1 = (L, livre, q) => `Não é possível estornar o desbloqueio: o lote ${L} tem ${livre} UN ${livre > 0 && livre < 2 ? 'livre' : 'livres'} `
  + `para bloquear de novo e o estorno bloquearia ${q} UN nele — o bloqueio ficaria apontando para peças que não estão no lote. Para `
  + 'bloquear de novo, use Bloquear Material escolhendo um lote que tenha as peças.';

(async () => {
  console.log('\n=== Etapa 272: o estorno do Desbloquear com lote confere o lote (C504) ===\n');
  const { app, db } = await createTestApp({ user: { ...ADMIN } });
  const post = (u, b = {}) => request(app).post(u).send(b).then((x) => x);

  const alm = await post(`${API}/almoxarifados`, { codigo: 'ALM272', nome: 'Almox 272' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const r0 = await post(`${API}/localizacoes`, { codigo: 'Z272-01', descricao: 'Z272', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  assert.ok(r0.status === 201 || r0.status === 200, JSON.stringify(r0.body));
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z272-01'");

  const material = async ({ lote = 1 } = {}) => {
    const c = `E272-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id, permite_saldo_negativo)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, ?, 0, ?, 0)`, [c, c, lote, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, q, lote) => {
    const r = await post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e272',
      localizacao_destino_id: P01.id, ...(lote ? { lote } : {}) });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
    return r.body.id || (await dbGet(db, 'SELECT MAX(id) AS id FROM movimentacoes_almoxarifado WHERE material_id = ?', [m.id])).id;
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const bloquear = (m, q, lid) => post(`${API}/materiais/${m.id}/bloquear`, { quantidade: q, justificativa: 'avaria 272', lote_id: lid });
  const desbloquear = (m, q, lid) => post(`${API}/materiais/${m.id}/desbloquear`, { quantidade: q, justificativa: 'libera 272', lote_id: lid });
  const saida = (m, q, extra = {}) => post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'SAIDA', quantidade: q,
    motivo: 's272', justificativa: 'saida 272', ...extra });
  const estornar = (id) => post(`${API}/movimentacoes/${id}/cancelar`, { motivo: 'estorno 272' });
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
  // L1 4 e L2 4; bloquear 4 no L1 e desbloquear 4 do L1
  const montar = async () => {
    const m = await material();
    const e1 = await entrar(m, 4, 'L1');
    await entrar(m, 4, 'L2');
    const L1 = await loteId(m, 'L1');
    await ok(bloquear(m, 4, L1));
    await ok(desbloquear(m, 4, L1));
    return { m, e1, L1, L2: await loteId(m, 'L2'), d: await ultimo(m, 'DESBLOQUEIO') };
  };

  // ---------------------------------------------------------------- RN-272.01
  await test('[RN-272.01] o cenario da 264: estornada a entrada do L1, estornar o Desbloquear -> 400 E1 (0 livres, 4); nada gravado', async () => {
    const { m, e1, d, L1 } = await montar();
    await ok(estornar(e1));
    await recusa(m, estornar(d), E1('L1', 0, 4));
    assert.strictEqual(await bloqueadoNoLote(m, L1), 0, 'o bloqueio nao volta para o L1 vazio');
  });
  await test('[RN-272.01 servico] o mesmo pelo servico: cancelarMovimentacao lanca 400 com a E1', async () => {
    const { m, e1, d } = await montar();
    await ok(estornar(e1));
    let erro = null;
    try { await stockService.cancelarMovimentacao(db, ADMIN, d, 'estorno 272'); } catch (e) { erro = e; }
    assert.ok(erro, 'esperava a recusa');
    assert.deepStrictEqual([erro.status, erro.message], [400, E1('L1', 0, 4)]);
    const mov = await dbGet(db, 'SELECT cancelado, movimento_estorno_id FROM movimentacoes_almoxarifado WHERE id = ?', [d]);
    assert.deepStrictEqual([mov.cancelado, mov.movimento_estorno_id], [0, null], 'o claim volta');
  });

  // ---------------------------------------------------------------- RN-272.02
  await test('[RN-272.02 parte] saiu 3 do L1 (fica 1): estornar o Desbloquear de 4 -> 400 E1 "1 UN livre"', async () => {
    const { m, d, L1 } = await montar();
    await ok(saida(m, 3, { lote_id: L1 }), 201);
    await recusa(m, estornar(d), E1('L1', 1, 4));
  });
  await test('[RN-272.02 intacto] o L1 com as 4: estornar o Desbloquear -> 200 e o bloqueio volta para o L1 (4); bloqueado 4', async () => {
    const { m, d, L1 } = await montar();
    await ok(estornar(d));
    assert.strictEqual(await bloqueadoNoLote(m, L1), 4);
    assert.strictEqual(Number((await foto(m)).mat.b), 4);
  });
  await test('[RN-272.02 de 2] desbloqueio parcial de 2 (2 continuam bloqueadas) e o L1 intacto: estorno -> 200, L1 bloqueado 4', async () => {
    const m = await material();
    await entrar(m, 4, 'L1'); await entrar(m, 4, 'L2');
    const L1 = await loteId(m, 'L1');
    await ok(bloquear(m, 4, L1));
    await ok(desbloquear(m, 2, L1));
    await ok(estornar(await ultimo(m, 'DESBLOQUEIO')));
    assert.strictEqual(await bloqueadoNoLote(m, L1), 4);
  });

  // ---------------------------------------------------------------- RN-272.03
  await test('[RN-272.03 caixa] a caixa de uma requisicao separou 3 do L1: estornar o Desbloquear de 4 -> 400 E1 "1 UN livre"', async () => {
    const { m, d, L1 } = await montar();
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'EM_SEPARACAO')`, [`REQ-E272-${++seq}`])).lastID;
    await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada, quantidade_separada,
      quantidade_entregue, quantidade_atendida, origem_separacao_id, lote_separacao_id, quantidade_origem_separacao)
      VALUES (?, ?, 3, 3, 0, 0, ?, ?, 3)`, [R, m.id, P01.id, L1]);
    await recusa(m, estornar(d), E1('L1', 1, 4));
  });

  // ---------------------------------------------------------------- RN-272.04 / .05
  await test('[RN-272.04 ordem] o material nao tem livre (L2 todo bloqueado e a saida do L1): a literal de sempre do material, nao a E1', async () => {
    const { m, e1, d, L2 } = await montar();
    await ok(estornar(e1));
    await ok(bloquear(m, 4, L2));
    const r = await estornar(d);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(/^Não é possível estornar o desbloqueio: saldo disponível insuficiente para bloquear de novo: 0 UN/.test(r.body.error), r.body.error);
  });
  await test('[RN-272.05 sem lote] o Desbloquear sem lote continua como antes (estorno -> 200)', async () => {
    const m = await material({ lote: 0 });
    await entrar(m, 4, null);
    await ok(bloquear(m, 4));
    await ok(desbloquear(m, 4));
    await ok(estornar(await ultimo(m, 'DESBLOQUEIO')));
    assert.strictEqual(Number((await foto(m)).mat.b), 4);
  });

  // ---------------------------------------------------------------- Fase 2 (achados 1 e 2)
  await test('[RN-272.05 sem bloquear com lote, Fase 2 achado 1] material sem controle de lote com Desbloquear de lote: o caminho e "sem indicar o lote"', async () => {
    const { m, e1, d } = await montar();
    await ok(estornar(e1));
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 0 WHERE id = ?', [m.id]);
    await recusa(m, estornar(d), E1('L1', 0, 4).replace('use Bloquear Material escolhendo um lote que tenha as peças.',
      'use Bloquear Material sem indicar o lote.'));
  });
  await test('[RN-272.03 teto, Fase 2 achado 2] reprovacao de 2 no L1 ja liberada pelo "Sem lote": L1 6, bloquear/desbloquear 4, Saida 1 -> o estorno passa', async () => {
    const m = await material();
    await entrar(m, 6, 'L1'); await entrar(m, 4, 'L2');
    const L1 = await loteId(m, 'L1');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 2 WHERE id = ?', [m.id]);
    const rec = await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal) VALUES (?,?,?)', [`REC-272-${m.id}`, 'RECEBIDO', 'NF-272']);
    const it = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida,
      lote_id, lote) VALUES (?,?,?,?,?,?)`, [rec.lastID, m.id, 2, 2, L1, 'L1']);
    await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado (recebimento_item_id, conforme, quantidade_aprovada, quantidade_reprovada,
      responsavel_id, responsavel_nome) VALUES (?,?,?,?,?,?)`, [it.lastID, 0, 0, 2, 9, 'Q']);
    await ok(desbloquear(m, 2, undefined));
    assert.strictEqual(Number((await foto(m)).mat.b), 0, 'premissa: a reprovacao saiu pelo "Sem lote" (documento sem carimbo)');
    await ok(bloquear(m, 4, L1));
    await ok(desbloquear(m, 4, L1));
    await ok(saida(m, 1, { lote_id: L1 }), 201);
    await ok(estornar(await ultimo(m, 'DESBLOQUEIO')));
    assert.strictEqual(await bloqueadoNoLote(m, L1), 4);
  });

  // ---------------------------------------------------------------- RN-272.06
  await test('[RN-272.06 corrida] 15 rodadas: Saida de 4 do L1 x estorno do Desbloquear ao mesmo tempo -> nunca os dois', async () => {
    for (let i = 0; i < 15; i++) {
      // eslint-disable-next-line no-await-in-loop
      const { m, d, L1 } = await montar();
      // eslint-disable-next-line no-await-in-loop
      const [s, e] = await Promise.all([saida(m, 4, { lote_id: L1 }), estornar(d)]);
      assert.ok(!(s.status === 201 && e.status === 200), `rodada ${i}: os dois passaram (${JSON.stringify(s.body)} / ${JSON.stringify(e.body)})`);
      assert.ok(s.status === 201 || e.status === 200, `rodada ${i}: nenhum passou`);
    }
  });

  // ---------------------------------------------------------------- T1 fluxo
  await test('[T1 fluxo] bloquear -> desbloquear -> Saida 4 do L1 -> estorno do Desbloquear recusa -> estorno da Saida -> o do Desbloquear passa', async () => {
    const { m, d, L1 } = await montar();
    const s = await ok(saida(m, 4, { lote_id: L1 }), 201);
    await recusa(m, estornar(d), E1('L1', 0, 4));
    await ok(estornar(s.body.id || await ultimo(m, 'SAIDA')));
    await ok(estornar(d));
    assert.strictEqual(await bloqueadoNoLote(m, L1), 4);
    assert.deepStrictEqual((await foto(m)).mat, { q: 8, b: 4 });
  });

  terminou = true;
  console.log(`\n${passed} passou, ${failed} falhou\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
