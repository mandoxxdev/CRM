/**
 * Etapa 264 (C546, C547; B1621-B1623) — a Saida e a Perda escolhendo o lote respeitam as pecas presas no lote (a regua da entrega,
 * `retidoDoLote.situacaoDosLotes`), o seletor de lote desconta e diz as bloqueadas, e o estorno da entrada de um lote com pecas
 * bloqueadas nele e recusado.
 *
 * Cobre: RN-264.01 (v1 e v2, todo tipo de saida), .02 (ordem), .03 (devolucao ao cliente), .04 (o que nao muda), .05 (o seletor),
 * .06 (o estorno da entrada), .07 (o que nao trava), .08 (corrida e claim provisorio) e o fluxo cruzado (T4).
 *
 * Plano: docs/superpowers/plans/2026-11-26-almoxarifado-etapa264-saida-perda-e-estorno-com-lote-bloqueado.md
 * Executar: cd server && node tests/api/saidaEEstornoComLoteBloqueado.api.test.js
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

const ADMIN = { id: 1, nome: 'Adm 264', role: 'admin', is_superadmin: 1, email: 'a264@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const SAIDA_LIT = (L, saldo, livre, q, parcelas) => `No lote ${L} há ${saldo} UN, mas só ${livre} ${livre > 0 && livre < 2 ? 'pode' : 'podem'} `
  + `sair: ${parcelas}; não cobre a quantidade (${q}). Escolha outro lote ou diminua a quantidade.`;
const BLOQ = (n) => `${n} UN ${n > 0 && n < 2 ? 'está bloqueada' : 'estão bloqueadas'} nele (quarentena, reprovação na inspeção ou com terceiro)`;
const ESTORNO_LIT = (L, bloq, fica, n) => `Não é possível estornar: o lote ${L} tem ${bloq} UN ${bloq > 0 && bloq < 2 ? 'bloqueada' : 'bloqueadas'} `
  + `e, sem esta entrada, ficaria com ${fica} UN — o bloqueio ficaria apontando para peças que não estão no lote. Desbloqueie ${n} UN do lote `
  + `${L} (Desbloquear Material, escolhendo o lote ${L}) e depois estorne esta entrada.`;

(async () => {
  console.log('\n=== Etapa 264: saida e perda com lote bloqueado (C546) e estorno da entrada de lote bloqueado (C547) ===\n');
  const { app, db } = await createTestApp({ user: { ...ADMIN } });
  const post = (u, b = {}) => request(app).post(u).send(b).then((x) => x);
  const get = (u) => request(app).get(u).then((x) => x);

  const alm = await post(`${API}/almoxarifados`, { codigo: 'ALM264', nome: 'Almox 264' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const r0 = await post(`${API}/localizacoes`, { codigo: 'Z264-01', descricao: 'Z264', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  assert.ok(r0.status === 201 || r0.status === 200, JSON.stringify(r0.body));
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z264-01'");
  const cli = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente 264 LTDA'])).lastID;

  const material = async ({ lote = 1, negativo = 0, cliente = null } = {}) => {
    const c = `E264-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id, permite_saldo_negativo, proprietario_cliente_id)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, ?, 0, ?, ?, ?)`, [c, c, lote, P01.id, negativo, cliente])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, q, lote) => {
    const r = await post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e264',
      localizacao_destino_id: P01.id, ...(lote ? { lote } : {}) });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
    return r.body.id || (await dbGet(db, 'SELECT MAX(id) AS id FROM movimentacoes_almoxarifado WHERE material_id = ?', [m.id])).id;
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const cenario = async (opts = {}) => {
    const m = await material(opts);
    const e1 = await entrar(m, 4, 'L1');
    const e2 = await entrar(m, 4, 'L2');
    return { m, e1, e2, L1: await loteId(m, 'L1'), L2: await loteId(m, 'L2') };
  };
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const bloquear = (m, q, lid) => post(`${API}/materiais/${m.id}/bloquear`, { quantidade: q, justificativa: 'avaria 264', lote_id: lid });
  const desbloquear = (m, q, lid) => post(`${API}/materiais/${m.id}/desbloquear`, { quantidade: q, justificativa: 'libera 264', lote_id: lid });
  const saida = (m, q, extra = {}, tipo = 'SAIDA') => post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo, quantidade: q,
    motivo: 's264', justificativa: 'saida 264', ...extra });
  const estornar = (id) => post(`${API}/movimentacoes/${id}/cancelar`, { motivo: 'estorno 264' });
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
  const saldoLote = async (m, lid) => Number((await dbGet(db, 'SELECT COALESCE(SUM(quantidade),0) AS q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id = ?', [m.id, lid])).q);

  // ---------------------------------------------------------------- RN-264.01 / .02
  await test('[RN-264.01 v2] L1 4 com 2 bloqueados em L1: Saida de 4 e de 3 do L1 -> 400 com a literal, nada gravado; de 2 -> 201', async () => {
    const { m, L1 } = await cenario();
    await ok(bloquear(m, 2, L1));
    await recusa(m, saida(m, 4, { lote_id: L1 }), SAIDA_LIT('L1', 4, 2, 4, BLOQ(2)));
    await recusa(m, saida(m, 3, { lote_id: L1 }), SAIDA_LIT('L1', 4, 2, 3, BLOQ(2)));
    await ok(saida(m, 2, { lote_id: L1 }), 201);
    assert.strictEqual(await saldoLote(m, L1), 2);
  });
  await test('[RN-264.01 tipos] Perda e Ajuste negativo de 3 do L1 (2 bloqueados) -> 400 com a mesma literal', async () => {
    const { m, L1 } = await cenario();
    await ok(bloquear(m, 2, L1));
    await recusa(m, saida(m, 3, { lote_id: L1 }, 'PERDA'), SAIDA_LIT('L1', 4, 2, 3, BLOQ(2)));
    await recusa(m, saida(m, 3, { lote_id: L1 }, 'AJUSTE_NEGATIVO'), SAIDA_LIT('L1', 4, 2, 3, BLOQ(2)));
  });
  await test('[RN-264.01 v1] o modal rapido (POST /movimentacoes) com lote_id: Saida de 4 do L1 -> 400 com a literal', async () => {
    const { m, L1 } = await cenario();
    await ok(bloquear(m, 2, L1));
    await recusa(m, post(`${API}/movimentacoes`, { material_id: m.id, tipo: 'SAIDA', quantidade: 4, motivo: 'v1 264', lote_id: L1 }),
      SAIDA_LIT('L1', 4, 2, 4, BLOQ(2)));
  });
  await test('[RN-264.01 singular] 1 bloqueado: "1 UN está bloqueada"; 3 bloqueados: "só 1 pode sair"', async () => {
    const a = await cenario();
    await ok(bloquear(a.m, 1, a.L1));
    await recusa(a.m, saida(a.m, 4, { lote_id: a.L1 }), SAIDA_LIT('L1', 4, 3, 4, BLOQ(1)));
    const b = await cenario();
    await ok(bloquear(b.m, 3, b.L1));
    await recusa(b.m, saida(b.m, 2, { lote_id: b.L1 }), SAIDA_LIT('L1', 4, 1, 2, BLOQ(3)));
  });
  await test('[RN-264.01 outro lote] o L2 (sem bloqueio) sai inteiro: Saida de 4 do L2 -> 201', async () => {
    const { m, L1, L2 } = await cenario();
    await ok(bloquear(m, 2, L1));
    await ok(saida(m, 4, { lote_id: L2 }), 201);
    assert.deepStrictEqual([await saldoLote(m, L1), await saldoLote(m, L2)], [4, 0]);
  });
  await test('[RN-264.02 ordem] as guardas do material vem antes: L1 2 e L2 4 bloqueados, Saida de 3 do L1 -> a mensagem de sempre', async () => {
    const { m, L1, L2 } = await cenario();
    await ok(bloquear(m, 2, L1));
    await ok(bloquear(m, 4, L2));
    const r = await saida(m, 3, { lote_id: L1 });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(/^Saldo insuficiente\. Disponível: 2 UN|^Material bloqueado não pode ser utilizado$/.test(r.body.error), r.body.error);
  });

  // ---------------------------------------------------------------- RN-264.03
  await test('[RN-264.03] devolucao ao cliente com lote_id: 4 do L1 (2 bloqueados) -> 400 com a literal; 2 -> 201', async () => {
    const { m, L1 } = await cenario({ cliente: cli });
    await ok(bloquear(m, 2, L1));
    const dev = (q) => post(`${API}/materiais-cliente/devolucoes`, { material_id: m.id, quantidade: q, documento_devolucao: 'ND-264', lote_id: L1 });
    await recusa(m, dev(4), SAIDA_LIT('L1', 4, 2, 4, BLOQ(2)));
    await ok(dev(2), 201);
  });

  // ---------------------------------------------------------------- RN-264.04
  await test('[RN-264.04 negativo] material que permite saldo negativo: a Saida de 4 do L1 com 2 bloqueados passa (como antes)', async () => {
    const { m, L1 } = await cenario({ negativo: 1 });
    await ok(bloquear(m, 2, L1));
    await ok(saida(m, 4, { lote_id: L1 }), 201);
  });
  await test('[RN-264.04 sem peca presa] lote sem bloqueio: Saida de 5 do L1 (4) -> a recusa de sempre (nao a nova)', async () => {
    const { m, L1 } = await cenario();
    const r = await saida(m, 5, { lote_id: L1 });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(!/^No lote L1 há/.test(r.body.error), r.body.error);
  });
  await test('[RN-264.04 motor interno] o motor sem a opcao (chamador interno) nao confere o lote: Saida de 4 do L1 com 2 bloqueados passa', async () => {
    const { m, L1 } = await cenario();
    await ok(bloquear(m, 2, L1));
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m.id, tipo: 'SAIDA', quantidade: 4, motivo: 'interno', justificativa: 'x',
      lote_id: L1 }, { exigeLote: true });
    assert.strictEqual(await saldoLote(m, L1), 0);
  });

  // ---------------------------------------------------------------- RN-264.05
  await test('[RN-264.05 seletor] GET /lotes: L1 livre 2 e bloqueado_no_lote 2; L2 livre 4 e 0; material sem lote: bloqueado_no_lote 0', async () => {
    const { m, L1 } = await cenario();
    await ok(bloquear(m, 2, L1));
    const lst = (await ok(get(`${API}/materiais/${m.id}/lotes?com_saldo=1`))).body
      .map((l) => [l.codigo, Number(l.saldo), l.livre, l.bloqueado_no_lote]);
    assert.deepStrictEqual(lst.sort(), [['L1', 4, 2, 2], ['L2', 4, 4, 0]]);
    const n = await cenario({ negativo: 1 });
    await ok(bloquear(n.m, 2, n.L1));
    const lstN = (await ok(get(`${API}/materiais/${n.m.id}/lotes?com_saldo=1`))).body.map((l) => [l.codigo, l.bloqueado_no_lote]);
    assert.deepStrictEqual(lstN.sort(), [['L1', 0], ['L2', 0]], 'com negativo o motor nao confere o lote: o seletor tambem nao');
  });

  // ---------------------------------------------------------------- RN-264.06 / .07
  await test('[RN-264.06] L1 4 todo bloqueado no lote: estornar a entrada do L1 -> 400 com a literal; nada muda (cancelado 0, sem ESTORNO)', async () => {
    const { m, e1, L1 } = await cenario();
    await ok(bloquear(m, 4, L1));
    await recusa(m, estornar(e1), ESTORNO_LIT('L1', 4, 0, 4));
  });
  await test('[RN-264.06 parte] L1 6 (4 + 2) com 3 bloqueados: estornar a de 4 -> "ficaria com 2", desbloqueie 1; desbloqueado 1 -> 200', async () => {
    const { m, L1 } = await cenario();
    const e3 = await entrar(m, 2, 'L1');
    const e1 = (await dbGet(db, "SELECT MIN(id) AS id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ENTRADA' AND lote_id = ?", [m.id, L1])).id;
    assert.ok(e1 < e3);
    await ok(bloquear(m, 3, L1));
    await recusa(m, estornar(e1), ESTORNO_LIT('L1', 3, 2, 1));
    await ok(desbloquear(m, 1, L1));
    await ok(estornar(e1));
    assert.strictEqual(await saldoLote(m, L1), 2);
  });
  await test('[RN-264.06 singular] 1 bloqueado no L1 4: "tem 1 UN bloqueada"', async () => {
    const { m, e1, L1 } = await cenario();
    await ok(bloquear(m, 1, L1));
    await recusa(m, estornar(e1), ESTORNO_LIT('L1', 1, 0, 1));
  });
  await test('[RN-264.07] o resto cobre (L1 6, 2 bloqueados, estorno da de 4) -> 200; desbloqueado tudo -> 200; bloqueio estornado -> 200', async () => {
    const a = await cenario();
    await entrar(a.m, 2, 'L1');
    await ok(bloquear(a.m, 2, a.L1));
    await ok(estornar(a.e1));
    const b = await cenario();
    await ok(bloquear(b.m, 4, b.L1));
    await ok(desbloquear(b.m, 4, b.L1));
    await ok(estornar(b.e1));
    const c = await cenario();
    const bl = (await ok(bloquear(c.m, 4, c.L1))).body;
    const blId = bl.id || bl.movimentacao_id || (await dbGet(db, "SELECT MAX(id) AS id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'BLOQUEIO'", [c.m.id])).id;
    await ok(estornar(blId));
    await ok(estornar(c.e1));
  });
  await test('[RN-264.07 compensacao] a compensacao interna nao passa pela guarda', async () => {
    const { m, e1, L1 } = await cenario();
    await ok(bloquear(m, 4, L1));
    await stockService.cancelarMovimentacao(db, ADMIN, e1, 'compensacao 264', { compensacao: true });
    assert.strictEqual(await saldoLote(m, L1), 0);
  });

  // ---------------------------------------------------------------- RN-264.08
  await test('[RN-264.08 claim provisorio] o BLOQUEIO com o estorno em andamento (cancelado 1, sem movimento_estorno_id) continua contando', async () => {
    const { m, e1, L1 } = await cenario();
    await ok(bloquear(m, 4, L1));
    await dbRun(db, "UPDATE movimentacoes_almoxarifado SET cancelado = 1 WHERE material_id = ? AND tipo = 'BLOQUEIO'", [m.id]);
    await recusa(m, estornar(e1), ESTORNO_LIT('L1', 4, 0, 4));
  });
  await test('[RN-264.08 corrida] 15 rodadas: Bloquear 4 no L1 x estorno da entrada do L1 ao mesmo tempo -> nunca os dois 200', async () => {
    for (let i = 0; i < 15; i++) {
      // eslint-disable-next-line no-await-in-loop
      const { m, e1, L1 } = await cenario();
      // eslint-disable-next-line no-await-in-loop
      const [b, e] = await Promise.all([bloquear(m, 4, L1), estornar(e1)]);
      assert.ok(!(b.status === 200 && e.status === 200), `rodada ${i}: os dois passaram (${JSON.stringify(b.body)} / ${JSON.stringify(e.body)})`);
      assert.ok(b.status === 200 || e.status === 200, `rodada ${i}: nenhum passou`);
    }
  });
  await test('[RN-264.08 corrida saida] 15 rodadas: Bloquear 2 no L1 x Saida de 4 do L1 -> nunca os dois', async () => {
    for (let i = 0; i < 15; i++) {
      // eslint-disable-next-line no-await-in-loop
      const { m, L1 } = await cenario();
      // eslint-disable-next-line no-await-in-loop
      const [b, s] = await Promise.all([bloquear(m, 2, L1), saida(m, 4, { lote_id: L1 })]);
      assert.ok(!(b.status === 200 && s.status === 201), `rodada ${i}: os dois passaram`);
    }
  });

  // ---------------------------------------------------------------- Fase 2 (achado 1): as duas portas manuais de Sobras
  const SCRAP = require('../../services/almoxarifado/scrapService');
  const DISP = require('../../services/almoxarifado/scrapDisposalService');
  await test('[RN-264.03 retalho] gerar retalho baixando 4 do L1 (2 bloqueados) -> 400 com a literal; nada baixado', async () => {
    const { m, L1 } = await cenario();
    await ok(bloquear(m, 2, L1));
    const ret = await material({ lote: 0 });
    const antes = await foto(m);
    await assert.rejects(SCRAP.gerarRetalho(db, ADMIN, { material_origem_id: m.id, material_retalho_id: ret.id, baixar_original: true,
      quantidade_baixa: 4, lote_origem_id: L1, localizacao_id: P01.id, quantidade_retalho: 1, justificativa: 'corte 264' }),
    (e) => { assert.strictEqual(e.message, SAIDA_LIT('L1', 4, 2, 4, BLOQ(2))); return true; });
    assert.deepStrictEqual(await foto(m), antes);
  });
  await test('[RN-264.03 sucateamento] o sucateamento comum de 4 do L1 (2 bloqueados) recusa na 2a assinatura com a literal; o L1 fica 4', async () => {
    const { m, L1 } = await cenario();
    await ok(bloquear(m, 2, L1));
    const s = await DISP.solicitar(db, ADMIN, { material_id: m.id, lote_id: L1, quantidade: 4, justificativa: 'quebrou 264' });
    let msg = null;
    try {
      await DISP.aprovar(db, { ...ADMIN, id: 2, email: 'b264@t.com' }, s.id, 'almoxarifado');
      await DISP.aprovar(db, { ...ADMIN, id: 3, email: 'c264@t.com' }, s.id, 'gestao');
    } catch (e) { msg = e.message; }
    assert.strictEqual(msg, SAIDA_LIT('L1', 4, 2, 4, BLOQ(2)));
    assert.strictEqual(await saldoLote(m, L1), 4);
  });

  // ---------------------------------------------------------------- Fase 2 (achado 2): a reprovacao no estorno
  await test('[RN-264.06 reprovacao] L1 6 (2 + 4) com 3 reprovadas no L1: estornar a de 4 -> 400 com a literal geral', async () => {
    const m = await material();
    await entrar(m, 2, 'L1');
    const e4 = await entrar(m, 4, 'L1');
    await entrar(m, 4, 'L2');
    const L1 = await loteId(m, 'L1');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 3 WHERE id = ?', [m.id]);
    const rec = await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal) VALUES (?,?,?)', [`REC-264-${m.id}`, 'RECEBIDO', 'NF-264']);
    const it = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida,
      lote_id, lote) VALUES (?,?,?,?,?,?)`, [rec.lastID, m.id, 3, 3, L1, 'L1']);
    await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado (recebimento_item_id, conforme, quantidade_aprovada, quantidade_reprovada,
      responsavel_id, responsavel_nome) VALUES (?,?,?,?,?,?)`, [it.lastID, 0, 0, 3, 9, 'Q']);
    await recusa(m, estornar(e4), 'Não é possível estornar: o lote L1 tem 3 UN presas nele (3 reprovadas na inspeção) e, sem esta entrada, '
      + 'ficaria com 2 UN — o lote ficaria apontando para peças que não estão nele. Libere 1 UN do lote L1 (a reprovação pela não '
      + 'conformidade) e depois estorne esta entrada.');
  });

  // ---------------------------------------------------------------- Fase 5
  const reprovarNoLote = async (m, L, q) => {
    const rec = await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal) VALUES (?,?,?)', [`REC-264R-${m.id}`, 'RECEBIDO', 'NF-264R']);
    const it = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida,
      lote_id, lote) VALUES (?,?,?,?,?,?)`, [rec.lastID, m.id, q, q, L, 'L1']);
    await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado (recebimento_item_id, conforme, quantidade_aprovada, quantidade_reprovada,
      responsavel_id, responsavel_nome) VALUES (?,?,?,?,?,?)`, [it.lastID, 0, 0, q, 9, 'Q']);
  };
  await test('[Fase 5 achado 1] reprovacao ja liberada pelo "Sem lote" (bloqueado 0, documento sem carimbo): o estorno da entrada do L1 passa', async () => {
    const m = await material();
    await entrar(m, 2, 'L1');
    const e4 = await entrar(m, 4, 'L1');
    await entrar(m, 4, 'L2');
    const L1 = await loteId(m, 'L1');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 3 WHERE id = ?', [m.id]);
    await reprovarNoLote(m, L1, 3);
    await ok(desbloquear(m, 3, undefined));
    assert.strictEqual(Number((await foto(m)).mat.b), 0);
    await ok(estornar(e4));
  });
  await test('[Fase 5 achado 2] a Saida de 4 do L1 consumindo uma reserva manual tambem respeita as 2 bloqueadas do L1', async () => {
    const { m, L1 } = await cenario();
    await ok(bloquear(m, 2, L1));
    const rv = await ok(post(`${API}/reservas`, { material_id: m.id, quantidade: 4, motivo: 'reserva 264' }), 201);
    const rid = rv.body.id || (await dbGet(db, 'SELECT MAX(id) AS id FROM reservas_material_almoxarifado WHERE material_id = ?', [m.id])).id;
    await recusa(m, saida(m, 4, { lote_id: L1, reserva_id: rid }), SAIDA_LIT('L1', 4, 2, 4, BLOQ(2)));
  });
  await test('[Fase 5 achado 3a] L1 com 3 em inspecao: a Saida de 4 do L1 -> "só 1 pode sair: 3 UN em inspeção"', async () => {
    const { m, L1 } = await cenario();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_inspecao = 3 WHERE id = ?', [m.id]);
    const rec = await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal) VALUES (?,?,?)', [`REC-264I-${m.id}`, 'RECEBIDO', 'NF-264I']);
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida,
      lote_id, lote, quantidade_em_inspecao) VALUES (?,?,?,?,?,?,?)`, [rec.lastID, m.id, 3, 3, L1, 'L1', 3]);
    await recusa(m, saida(m, 4, { lote_id: L1 }), SAIDA_LIT('L1', 4, 1, 4, '3 UN em inspeção'));
  });
  await test('[Fase 5 achado 3b] L1 4 + 2 com 3 com terceiro: estornar a de 4 -> 400 "3 com terceiro … o retorno da remessa"', async () => {
    const m = await material();
    const e4 = await entrar(m, 4, 'L1');
    await entrar(m, 2, 'L1');
    const L1 = await loteId(m, 'L1');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_terceiros = 3 WHERE id = ?', [m.id]);
    await dbRun(db, `INSERT INTO itens_remessa_terceiro_almoxarifado (remessa_id, material_id, quantidade, quantidade_retornada, lote_id, enviado_em)
      VALUES (999, ?, 3, 0, ?, CURRENT_TIMESTAMP)`, [m.id, L1]);
    await recusa(m, estornar(e4), 'Não é possível estornar: o lote L1 tem 3 UN presas nele (3 com terceiro) e, sem esta entrada, ficaria com '
      + '2 UN — o lote ficaria apontando para peças que não estão nele. Libere 1 UN do lote L1 (a peça com terceiro pelo retorno da remessa) '
      + 'e depois estorne esta entrada.');
  });

  // ---------------------------------------------------------------- T4 integracao
  await test('[T4 fluxo] bloquear 2 no L1 -> seletor livre 2 -> Saida 3 recusa -> Saida 2 passa -> estorno da entrada recusa -> Desbloquear, estorno da Saida -> o da entrada passa', async () => {
    const { m, e1, L1 } = await cenario();
    await ok(bloquear(m, 2, L1));
    const l1 = (await ok(get(`${API}/materiais/${m.id}/lotes?com_saldo=1`))).body.find((l) => l.codigo === 'L1');
    assert.deepStrictEqual([l1.livre, l1.bloqueado_no_lote], [2, 2]);
    await recusa(m, saida(m, 3, { lote_id: L1 }), SAIDA_LIT('L1', 4, 2, 3, BLOQ(2)));
    const s2 = await ok(saida(m, 2, { lote_id: L1 }), 201);
    await recusa(m, estornar(e1), ESTORNO_LIT('L1', 2, 0, 2));
    await ok(desbloquear(m, 2, L1));
    await ok(estornar(s2.body.id));
    await ok(estornar(e1));
    assert.deepStrictEqual(await foto(m).then((f) => f.mat), { q: 4, b: 0 });
    assert.strictEqual(await saldoLote(m, L1), 0);
  });

  terminou = true;
  console.log(`\n${passed} passou, ${failed} falhou\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
