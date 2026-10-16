/**
 * Etapa 130 (C267; RN-01..RN-06) — os dados fiscais nao mudam o lote, as series nem o valor de um item que ja deu entrada no estoque.
 *
 * Medido na Fase 0 (sonda e130fase0): numa nota parcial (EM_ENTRADA_NF com um item ja entrado), o `PUT /recebimentos/:id/fiscal`
 * aceitava trocar lote, validade, corrida, series, valor unitario e total do item entrado (200): o documento passava a dizer L-NOVO,
 * S8/S9 e 99, enquanto o lote do estoque continuava L-ORIG, as series S1/S2, o custo medio 10 — e o painel de Compras mostrava 99 como
 * o ultimo custo de entrada. Agora o eco passa (a tela reenvia todos os campos de todos os itens) e a mudanca recusa antes de gravar.
 *
 * Executar: cd server && node tests/api/fiscalItemEntrado.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const API = '/api/almoxarifado';

const L7 = 'Item já deu entrada no estoque — a quantidade dele não muda mais; se a contagem estava errada, corrija o estoque por um ajuste (perfil Administrador ou Almoxarife do almoxarifado)';
const L8 = 'Item já deu entrada no estoque — o lote e as séries dele ficaram registrados no estoque com o que a nota tinha na entrada e não mudam mais pela nota; para corrigir o estoque, o Administrador do almoxarifado estorna a entrada e dá a entrada de novo (o documento da nota continua como entrou, e o pedido de compra e a reserva de quem esperava voltam a esperar)';
const L9 = 'Item já deu entrada no estoque — o valor unitário e o total dele não mudam mais: a entrada no estoque já foi feita com o valor que a nota tinha';
const L3 = 'Esta nota já está sendo processada';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  setUser(SUPER);

  let seq = 0;
  const material = async () => (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
    VALUES (?, ?, 'UN', 0, 1)`, [`FIE130-${++seq}`, `FIE130-${seq}`])).lastID;
  /**
   * Nota parcial: recebimento pela porta real, EM_ENTRADA_NF, os itens de `entrados` com `entrada_estoque_em`, e o estado gravado de
   * cada item (lote, datas, series, valores) posto por SQL — o que a entrada deixou.
   */
  const notaParcial = async (itensGravados, entrados) => {
    const itens = [];
    for (const g of itensGravados) itens.push({ material_id: await material(), quantidade: g.qtd || 2 });
    const r = await request(app).post(`${API}/recebimentos`).send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: `NF-FIE130-${++seq}`, fornecedor_nome: 'FORN-FIE130', itens });
    assert.strictEqual(r.status, 201, `POST /recebimentos: ${JSON.stringify(r.body)}`);
    const its = (await dbAll(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? ORDER BY id',
      [r.body.id])).map((i) => i.id);
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET status = 'EM_ENTRADA_NF' WHERE id = ?", [r.body.id]);
    for (const [i, g] of itensGravados.entries()) {
      const cols = Object.keys(g).filter((k) => k !== 'qtd');
      if (cols.length) {
        await dbRun(db, `UPDATE recebimentos_material_itens_almoxarifado SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
          [...cols.map((c) => g[c]), its[i]]);
      }
    }
    for (const i of entrados) {
      await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET entrada_estoque_em = CURRENT_TIMESTAMP WHERE id = ?', [its[i]]);
    }
    return { id: r.body.id, its };
  };
  const PADRAO = { lote: 'L-ORIG', data_validade_lote: '2027-01-31', data_fabricacao_lote: '2026-09-01', corrida_lote: 'C1',
    series: 'S1\nS2', valor_unitario: 10, valor_total: 20, valor_icms: 1, valor_ipi: 0, reducao_icms_percent: 0 };
  const fiscal = (id, body) => request(app).put(`${API}/recebimentos/${id}/fiscal`).send(body);
  const item = (id) => dbGet(db, 'SELECT * FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [id]);
  const cabSerie = async (id) => (await dbGet(db, 'SELECT nota_serie s FROM recebimentos_material_almoxarifado WHERE id = ?', [id])).s;
  const recusa = (r, status, literal) => {
    assert.strictEqual(r.status, status, `esperava ${status}: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, literal);
  };
  const aceita = (r) => assert.strictEqual(r.status, 200, `esperava 200: ${r.status} ${JSON.stringify(r.body)}`);
  const recusaServico = async (fn, status, literal) => {
    let erro = null;
    try { await fn(); } catch (e) { erro = e; }
    assert.ok(erro, 'o servico nao recusou');
    assert.strictEqual(erro.status, status, `status do erro: ${erro.status} ${erro.message}`);
    assert.strictEqual(erro.message, literal);
  };
  /** O item gravado continua com os campos de PADRAO (nada mudou). */
  const intacto = async (itemId, base = PADRAO) => {
    const it = await item(itemId);
    for (const k of Object.keys(base)) assert.strictEqual(it[k], base[k], `${k} mudou: ${it[k]}`);
  };

  console.log('\n=== Etapa 130: o item que entrou nao muda pela nota (C267) ===\n');

  await test('[RN-01 a] lote trocado no item entrado recusa 409 L8 antes de gravar (nem o cabecalho, nem o outro item que vinha antes)', async () => {
    const r = await notaParcial([{ ...PADRAO }, { ...PADRAO }], [1]);
    const serieAntes = await cabSerie(r.id);
    recusa(await fiscal(r.id, { nota_serie: 'S-TROCADA', itens: [{ id: r.its[0], lote: 'L-OUTRO-NAO-ENTRADO' }, { id: r.its[1], lote: 'L-NOVO' }] }), 409, L8);
    await intacto(r.its[1]);
    assert.strictEqual((await item(r.its[0])).lote, 'L-ORIG', 'o item nao entrado que vinha antes foi gravado');
    assert.strictEqual(await cabSerie(r.id), serieAntes, 'o cabecalho foi gravado');
    await recusaServico(() => receiptService.salvarDadosFiscal(db, SUPER, r.id, { itens: [{ id: r.its[1], lote: 'L-NOVO' }] }), 409, L8);
    await intacto(r.its[1]);
  });

  await test('[RN-01 b] o eco do lote passa: espacos, validade em ISO com hora e em DD/MM/AAAA, corrida igual', async () => {
    const r = await notaParcial([{ ...PADRAO }], [0]);
    aceita(await fiscal(r.id, { itens: [{ id: r.its[0], lote: 'L-ORIG ', data_validade_lote: '2027-01-31T00:00:00.000Z',
      data_fabricacao_lote: '01/09/2026', corrida_lote: ' C1', series: 'S1\nS2' }] }));
    await intacto(r.its[0]);
  });

  await test('[RN-01 c] lote vazio sobre NULL passa; lote vazio sobre L-ORIG (apagar) recusa', async () => {
    const r = await notaParcial([{ ...PADRAO, lote: null }, { ...PADRAO }], [0, 1]);
    aceita(await fiscal(r.id, { itens: [{ id: r.its[0], lote: '' }] }));
    assert.strictEqual((await item(r.its[0])).lote, null, 'o vazio foi gravado no item entrado');
    recusa(await fiscal(r.id, { itens: [{ id: r.its[1], lote: '' }] }), 409, L8);
    assert.strictEqual((await item(r.its[1])).lote, 'L-ORIG');
    // ausente (null) nao e mudanca — o COALESCE manteria; o mesmo para as datas, a corrida e as series
    aceita(await fiscal(r.id, { itens: [{ id: r.its[1], lote: null, data_validade_lote: null, data_fabricacao_lote: null,
      corrida_lote: null, series: null, valor_unitario: null, valor_total: null }] }));
    await intacto(r.its[1]);
  });

  await test('[RN-01 d] preencher o lote de um item entrado sem lote (NULL -> L1) recusa', async () => {
    const r = await notaParcial([{ ...PADRAO, lote: null }], [0]);
    recusa(await fiscal(r.id, { itens: [{ id: r.its[0], lote: 'L1' }] }), 409, L8);
    assert.strictEqual((await item(r.its[0])).lote, null);
  });

  await test('[RN-01 e/f] so a validade, so a fabricacao ou so a corrida diferente recusa', async () => {
    const r = await notaParcial([{ ...PADRAO }], [0]);
    recusa(await fiscal(r.id, { itens: [{ id: r.its[0], data_validade_lote: '2028-12-31' }] }), 409, L8);
    recusa(await fiscal(r.id, { itens: [{ id: r.its[0], data_fabricacao_lote: '2026-09-02' }] }), 409, L8);
    recusa(await fiscal(r.id, { itens: [{ id: r.its[0], corrida_lote: 'C9' }] }), 409, L8);
    recusa(await fiscal(r.id, { itens: [{ id: r.its[0], data_validade_lote: '' }] }), 409, L8);
    await intacto(r.its[0]);
  });

  await test('[RN-02] series: o conjunto igual passa (ordem, CRLF, lista, texto JSON); outro conjunto, uma a menos ou vazio recusa', async () => {
    const r = await notaParcial([{ ...PADRAO }], [0]);
    for (const series of ['S2\r\nS1\n', ['S1', 'S2'], '["S2","S1"]', ' S1 \n\n S2 ']) {
      aceita(await fiscal(r.id, { itens: [{ id: r.its[0], series }] }));
    }
    for (const series of ['S1\nS3', 'S1', '', ['S1', 'S2', 'S3']]) {
      recusa(await fiscal(r.id, { itens: [{ id: r.its[0], series }] }), 409, L8);
    }
    await intacto(r.its[0]);
  });

  await test('[RN-03] valor unitario trocado recusa L9 (rota e servico); o eco e o nao-informado passam', async () => {
    const r = await notaParcial([{ ...PADRAO }], [0]);
    recusa(await fiscal(r.id, { itens: [{ id: r.its[0], valor_unitario: 99 }] }), 409, L9);
    recusa(await fiscal(r.id, { itens: [{ id: r.its[0], valor_unitario: 10.01 }] }), 409, L9);
    await recusaServico(() => receiptService.salvarDadosFiscal(db, SUPER, r.id, { itens: [{ id: r.its[0], valor_unitario: 11 }] }), 409, L9);
    for (const valor_unitario of ['10', 10.0000001, 0, '', null, 'abc']) {
      aceita(await fiscal(r.id, { itens: [{ id: r.its[0], valor_unitario }] }));
    }
    await intacto(r.its[0]);
  });

  await test('[RN-03] valor total: trocado recusa; 0 sobre 25 passa (0 = nao informado); preencher o unitario que era 0 recusa', async () => {
    const r = await notaParcial([{ ...PADRAO, valor_total: 0 }, { ...PADRAO, valor_total: 25 }, { ...PADRAO, valor_unitario: 0, valor_total: 0 }], [0, 1, 2]);
    recusa(await fiscal(r.id, { itens: [{ id: r.its[0], valor_total: 198 }] }), 409, L9);
    assert.strictEqual((await item(r.its[0])).valor_total, 0);
    aceita(await fiscal(r.id, { itens: [{ id: r.its[1], valor_total: 0 }] }));
    assert.strictEqual((await item(r.its[1])).valor_total, 25);
    recusa(await fiscal(r.id, { itens: [{ id: r.its[2], valor_unitario: 5 }] }), 409, L9);
    assert.strictEqual((await item(r.its[2])).valor_unitario, 0);
    // o eco do item 0 (total 0 com unitario 10 — o que o /fiscal sem total deixa) passa
    aceita(await fiscal(r.id, { itens: [{ id: r.its[0], valor_unitario: 10, valor_total: 0 }] }));
  });

  await test('[RN-03 F2-M7] a regua vale dos dois lados (texto legado 10,50) e o total calculado pelo comando nao e "informado"', async () => {
    const r = await notaParcial([{ ...PADRAO, valor_unitario: '10,50' }, { ...PADRAO, valor_total: 0 }], [0, 1]);
    aceita(await fiscal(r.id, { itens: [{ id: r.its[0], valor_unitario: '10,50' }] }));
    assert.strictEqual((await item(r.its[0])).valor_unitario, '10,50');
    // o eco da tela: quantidade 2, unitario '10' (texto do input), total 0 — o comando calcularia 2 x 10 = 20
    aceita(await fiscal(r.id, { itens: [{ id: r.its[1], quantidade_recebida: 2, valor_unitario: '10', valor_total: 0 }] }));
    assert.strictEqual((await item(r.its[1])).valor_total, 0, 'o total calculado foi gravado no item entrado');
  });

  await test('[RN-05 F2-M7] a ordem entre itens e a do payload: item 1 com valor e item 2 com quantidade -> L9; invertido -> L7', async () => {
    const r = await notaParcial([{ ...PADRAO }, { ...PADRAO }], [0, 1]);
    recusa(await fiscal(r.id, { itens: [{ id: r.its[0], valor_unitario: 99 }, { id: r.its[1], quantidade_recebida: 1 }] }), 409, L9);
    recusa(await fiscal(r.id, { itens: [{ id: r.its[1], quantidade_recebida: 1 }, { id: r.its[0], valor_unitario: 99 }] }), 409, L7);
    await intacto(r.its[0]);
    await intacto(r.its[1]);
  });

  // ── Fase 5 (r1 M2, r3 R11/R16/R3/R4): os cenarios que faltavam ──
  await test('[RN-03 F5 r3-R11/R16] valor MENOR tambem recusa (unitario 5 sobre 10, total 1 sobre 20); "99,5" vale 99 (a regua do comando) e recusa', async () => {
    const r = await notaParcial([{ ...PADRAO }], [0]);
    recusa(await fiscal(r.id, { itens: [{ id: r.its[0], valor_unitario: 5 }] }), 409, L9);
    recusa(await fiscal(r.id, { itens: [{ id: r.its[0], valor_total: 1 }] }), 409, L9);
    recusa(await fiscal(r.id, { itens: [{ id: r.its[0], valor_unitario: '99,5' }] }), 409, L9);
    await intacto(r.its[0]);
  });

  await test('[RN-01 F5 r1-M2] data com lixo antes ou depois nao e eco (409); a data com hora e com espaco continua eco', async () => {
    const r = await notaParcial([{ ...PADRAO }], [0]);
    for (const data_validade_lote of ['2027-01-31lixo', 'x2027-01-31', 'x31/01/2027', '31/01/2027x']) {
      recusa(await fiscal(r.id, { itens: [{ id: r.its[0], data_validade_lote }] }), 409, L8);
    }
    for (const data_validade_lote of ['2027-01-31 00:00:00', '2027-01-31T03:00:00-03:00', ' 2027-01-31 ']) {
      aceita(await fiscal(r.id, { itens: [{ id: r.its[0], data_validade_lote }] }));
    }
    await intacto(r.its[0]);
  });

  await test('[RN-04] ICMS, IPI e reducao do item entrado continuam aceitos e gravados', async () => {
    const r = await notaParcial([{ ...PADRAO }], [0]);
    aceita(await fiscal(r.id, { itens: [{ id: r.its[0], valor_icms: 7, valor_ipi: 3, reducao_icms_percent: 12 }] }));
    const it = await item(r.its[0]);
    assert.deepStrictEqual([it.valor_icms, it.valor_ipi, it.reducao_icms_percent], [7, 3, 12]);
    await intacto(r.its[0], { lote: 'L-ORIG', series: 'S1\nS2', valor_unitario: 10, valor_total: 20 });
  });

  await test('[RN-05] o item nao entrado da mesma nota continua editavel em tudo; o de outro recebimento e ignorado; so cabecalho passa', async () => {
    const outro = await notaParcial([{ ...PADRAO }], [0]);
    const r = await notaParcial([{ ...PADRAO }, { ...PADRAO }], [0]);
    aceita(await fiscal(r.id, { nota_serie: 'S-OK', itens: [
      { id: outro.its[0], lote: 'L-INTRUSO', valor_unitario: 77 },
      { id: r.its[1], lote: 'L-NOVO', data_validade_lote: '2028-12-31', series: 'S8\nS9', valor_unitario: 99, valor_total: 198 }] }));
    const b = await item(r.its[1]);
    assert.deepStrictEqual([b.lote, b.data_validade_lote, b.series, b.valor_unitario, b.valor_total], ['L-NOVO', '2028-12-31', 'S8\nS9', 99, 198]);
    await intacto(outro.its[0]);
    assert.strictEqual(await cabSerie(r.id), 'S-OK');
    aceita(await fiscal(r.id, { nota_serie: 'S-SO-CAB' }));
  });

  await test('[RN-05] a quantidade (L7) vem antes do lote; o lote (L8) antes do valor (L9); a marca viva (L3) antes de tudo', async () => {
    const r = await notaParcial([{ ...PADRAO }], [0]);
    recusa(await fiscal(r.id, { itens: [{ id: r.its[0], quantidade_recebida: 1, lote: 'L-NOVO', valor_unitario: 99 }] }), 409, L7);
    recusa(await fiscal(r.id, { itens: [{ id: r.its[0], lote: 'L-NOVO', valor_unitario: 99 }] }), 409, L8);
    recusa(await fiscal(r.id, { itens: [{ id: r.its[0], series: 'S9', valor_unitario: 99 }] }), 409, L8);
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET processando_em = strftime('%Y-%m-%d %H:%M:%S','now') || ' #e130' WHERE id = ?", [r.id]);
    recusa(await fiscal(r.id, { itens: [{ id: r.its[0], lote: 'L-NOVO' }] }), 409, L3);
    await intacto(r.its[0]);
  });

  // ── RN-06: a defesa no comando ──
  const comGancho = async (casa, antes, fn) => {
    const original = db.run;
    let disparou = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && casa(sql)) {
        disparou = true;
        antes(original).then(() => original.call(db, sql, params, cb), (e) => cb.call({}, e));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    try { return await fn(); } finally { db.run = original; assert.ok(disparou, 'o gancho nao disparou'); }
  };
  const runOriginal = (original, sql, params = []) => new Promise((res, rej) => {
    original.call(db, sql, params, function (e) { if (e) rej(e); else res(this); });
  });
  const ehItemFiscal = (sql) => sql.includes('UPDATE recebimentos_material_itens_almoxarifado SET') && sql.includes('reducao_icms_percent');

  await test('[RN-06] corrida: o item ganha a entrada logo antes do UPDATE dele — lote, datas, corrida, series, unitario e total ficam; o ICMS grava', async () => {
    const r = await notaParcial([{ ...PADRAO }], []);
    await comGancho(ehItemFiscal,
      (orig) => runOriginal(orig, 'UPDATE recebimentos_material_itens_almoxarifado SET entrada_estoque_em = CURRENT_TIMESTAMP WHERE id = ?', [r.its[0]]),
      () => fiscal(r.id, { itens: [{ id: r.its[0], lote: 'L-NOVO', data_validade_lote: '2028-12-31', data_fabricacao_lote: '2028-01-01',
        corrida_lote: 'C9', series: 'S8\nS9', valor_unitario: 99, valor_total: 198, valor_icms: 7 }] }));
    const it = await item(r.its[0]);
    await intacto(r.its[0], { lote: 'L-ORIG', data_validade_lote: '2027-01-31', data_fabricacao_lote: '2026-09-01', corrida_lote: 'C1',
      series: 'S1\nS2', valor_unitario: 10, valor_total: 20 });
    assert.strictEqual(it.valor_icms, 7, 'o ICMS (coluna nao defendida) deveria gravar');
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
