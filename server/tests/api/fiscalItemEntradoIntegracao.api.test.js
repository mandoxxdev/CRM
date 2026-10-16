/**
 * Etapa 130 (C267; RN-08) — integracao: a nota parcial de verdade, pelo fluxo inteiro, e a consulta A78.
 *
 * A nota parcial nasce como em producao: o processamento falha NO MEIO (o motor recusa a serie do item B, que ja esta em estoque
 * por uma Entrada anterior — a pre-checagem so conta as series, nao as procura), depois de o item A ter entrado com lote e series.
 * Dai em diante: o eco que a tela monta passa; mudar lote, serie ou valor de A recusa pela rota E pelo servico; o ICMS de A e
 * tudo de B continuam aceitos; o segundo Processar leva B; o lote, as series, o custo medio e o ultimo custo de entrada de A ficam
 * os da entrada; o caminho que a L8 diz (estornar a entrada + nova Entrada) funciona; e a A78 acha o que o /fiscal antigo deixou.
 *
 * Executar: cd server && node tests/api/fiscalItemEntradoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const API = '/api/almoxarifado';
const L8 = 'Item já deu entrada no estoque — o lote e as séries dele ficaram registrados no estoque com o que a nota tinha na entrada e não mudam mais pela nota; para corrigir o estoque, o Administrador do almoxarifado estorna a entrada e dá a entrada de novo (o documento da nota continua como entrou, e o pedido de compra e a reserva de quem esperava voltam a esperar)';
const L9 = 'Item já deu entrada no estoque — o valor unitário e o total dele não mudam mais: a entrada no estoque já foi feita com o valor que a nota tinha';

/** A78 (a) — o lote do documento que nao bate com o lote do estoque (o mesmo texto do documento de novidades). */
const A78_LOTE = `
SELECT CASE WHEN ri.lote_id IS NULL THEN 'LOTE_SEM_REGISTRO' ELSE 'LOTE_DIFERENTE' END AS achado,
       r.id AS recebimento_id, r.numero, ri.id AS item_id, m.codigo AS material,
       ri.lote AS lote_no_documento, l.codigo AS lote_no_estoque,
       ri.data_validade_lote AS validade_no_documento, l.data_validade AS validade_no_estoque,
       ri.data_fabricacao_lote AS fabricacao_no_documento, l.data_fabricacao AS fabricacao_no_estoque,
       ri.corrida_lote AS corrida_no_documento, l.corrida AS corrida_no_estoque
  FROM recebimentos_material_itens_almoxarifado ri
  JOIN recebimentos_material_almoxarifado r ON r.id = ri.recebimento_id
  JOIN materiais_almoxarifado m ON m.id = ri.material_id
  LEFT JOIN lotes_almoxarifado l ON l.id = ri.lote_id
 WHERE ri.entrada_estoque_em IS NOT NULL
   AND ((ri.lote_id IS NULL AND TRIM(COALESCE(ri.lote, '')) <> '')
     OR (l.id IS NOT NULL AND (TRIM(COALESCE(ri.lote, '')) <> TRIM(COALESCE(l.codigo, ''))
       OR COALESCE(SUBSTR(TRIM(ri.data_validade_lote), 1, 10), '') <> COALESCE(SUBSTR(TRIM(l.data_validade), 1, 10), '')
       OR COALESCE(SUBSTR(TRIM(ri.data_fabricacao_lote), 1, 10), '') <> COALESCE(SUBSTR(TRIM(l.data_fabricacao), 1, 10), '')
       OR TRIM(COALESCE(ri.corrida_lote, '')) <> TRIM(COALESCE(l.corrida, '')))))
 ORDER BY r.id, ri.id;`;

/** A78 (b) — a serie que o documento lista e o estoque nao tem para aquele item. */
const A78_SERIE = `
WITH RECURSIVE partes(item_id, resto, numero) AS (
  SELECT ri.id, REPLACE(COALESCE(ri.series, ''), char(13), '') || char(10), NULL
    FROM recebimentos_material_itens_almoxarifado ri
    JOIN materiais_almoxarifado m ON m.id = ri.material_id
   WHERE ri.entrada_estoque_em IS NOT NULL AND m.controle_serie = 1
  UNION ALL
  SELECT item_id, SUBSTR(resto, INSTR(resto, char(10)) + 1), TRIM(SUBSTR(resto, 1, INSTR(resto, char(10)) - 1))
    FROM partes WHERE resto <> ''
)
SELECT 'SERIE_SEM_REGISTRO' AS achado, ri.recebimento_id, r.numero, ri.id AS item_id, p.numero AS serie_no_documento
  FROM partes p
  JOIN recebimentos_material_itens_almoxarifado ri ON ri.id = p.item_id
  JOIN recebimentos_material_almoxarifado r ON r.id = ri.recebimento_id
 WHERE p.numero IS NOT NULL AND p.numero <> ''
   AND NOT EXISTS (SELECT 1 FROM series_almoxarifado s WHERE s.recebimento_item_id = ri.id AND s.numero = p.numero)
 ORDER BY ri.recebimento_id, ri.id, p.numero;`;

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  setUser(SUPER);
  const ok = async (req, status = 200) => {
    const r = await req;
    assert.strictEqual(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
    return r;
  };
  const recusa = (r, status, literal) => {
    assert.strictEqual(r.status, status, `esperava ${status}: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, literal);
  };
  const recusaServico = async (fn, literal) => {
    let erro = null;
    try { await fn(); } catch (e) { erro = e; }
    assert.ok(erro, 'o servico nao recusou');
    assert.strictEqual(erro.status, 409, `${erro.status} ${erro.message}`);
    assert.strictEqual(erro.message, literal);
  };

  const loc = (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES ('FII130-L','FII130-L',1)")).lastID;
  const mA = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, tipo_material,
    localizacao_padrao_id, controle_lote, controle_serie) VALUES ('FII130-A','FII130-A','UN',0,1,'ACO',?,1,1)`, [loc])).lastID;
  const mB = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, tipo_material,
    localizacao_padrao_id, controle_serie) VALUES ('FII130-B','FII130-B','UN',0,1,'ACO',?,1)`, [loc])).lastID;
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m])).q;
  let id; let its;

  console.log('\n=== Etapa 130: integracao — a nota parcial de verdade e a A78 ===\n');

  await test('[RN-08] a nota parcial nasce do processamento que falha no meio: A entra com lote e series, B nao', async () => {
    // a serie X1 de B ja esta em estoque por uma Entrada anterior — o motor recusa a entrada de B depois de A
    await ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: mB, tipo: 'ENTRADA', quantidade: 1, series: ['X1'],
      localizacao_destino_id: loc, motivo: 'saldo anterior' }), 201);
    const r = await ok(request(app).post(`${API}/recebimentos`).send({ tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: 'NF-FII130',
      fornecedor_nome: 'FORN-FII130', itens: [{ material_id: mA, quantidade: 2 }, { material_id: mB, quantidade: 1 }] }), 201);
    id = r.body.id;
    its = (await dbAll(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? ORDER BY id', [id])).map((x) => x.id);
    for (const a of ['iniciar_conferencia', 'finalizar_conferencia', 'encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      await ok(request(app).post(`${API}/recebimentos/${id}/workflow`).send({ acao: a }));
    }
    await ok(request(app).put(`${API}/recebimentos/${id}/fiscal`).send({ data_emissao_nf: '2026-10-16', data_entrada_nf: '2026-10-16',
      valor_total_nota: 27, itens: [
        { id: its[0], lote: 'L-ORIG', data_validade_lote: '2027-01-31', data_fabricacao_lote: '2026-09-01', corrida_lote: 'C1',
          series: 'S1\nS2', valor_unitario: 10 },
        { id: its[1], series: 'X1', valor_unitario: 7 }] }));
    const p = await request(app).post(`${API}/recebimentos/${id}/processar`).send({});
    assert.notStrictEqual(p.status, 200, `o processamento deveria falhar em B: ${JSON.stringify(p.body)}`);
    const st = await dbGet(db, 'SELECT status, processando_em FROM recebimentos_material_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(st.status, 'EM_ENTRADA_NF');
    const [a, b] = await Promise.all(its.map((i) => dbGet(db, 'SELECT * FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [i])));
    assert.ok(a.entrada_estoque_em && a.lote_id, 'A deveria ter entrado com lote');
    assert.strictEqual(b.entrada_estoque_em, null);
    assert.strictEqual(await fisico(mA), 2);
  });

  await test('[RN-08] o eco que a tela monta (GET -> os 14 campos de cada item + o cabecalho) passa 200', async () => {
    const det = (await ok(request(app).get(`${API}/recebimentos/${id}`))).body;
    const itens = det.itens.map((item) => ({
      id: item.id, quantidade_recebida: item.quantidade_recebida, valor_unitario: item.valor_unitario, valor_total: item.valor_total,
      valor_icms: item.valor_icms, valor_ipi: item.valor_ipi, reducao_icms_percent: item.reducao_icms_percent,
      conferencia_quantidade: item.conferencia_quantidade, conferencia_descricao: item.conferencia_descricao, lote: item.lote,
      data_validade_lote: item.data_validade_lote, data_fabricacao_lote: item.data_fabricacao_lote, corrida_lote: item.corrida_lote,
      series: item.series,
    }));
    await ok(request(app).put(`${API}/recebimentos/${id}/fiscal`).send({ nota_fiscal: det.nota_fiscal, nota_serie: det.nota_serie || '',
      data_emissao_nf: det.data_emissao_nf.slice(0, 10), data_entrada_nf: det.data_entrada_nf.slice(0, 10), base_icms: 0,
      valor_icms: 0, valor_produtos: 0, frete: 0, desconto: 0, outras_despesas: 0, valor_ipi: 0,
      valor_total_nota: Number(det.valor_total_nota) || 0, itens }));
  });

  await test('[RN-08] lote, serie e valor de A recusam pela rota E pelo servico; o ICMS de A e tudo de B passam', async () => {
    const fiscal = (body) => request(app).put(`${API}/recebimentos/${id}/fiscal`).send(body);
    recusa(await fiscal({ itens: [{ id: its[0], lote: 'L-NOVO' }] }), 409, L8);
    recusa(await fiscal({ itens: [{ id: its[0], series: 'S8\nS9' }] }), 409, L8);
    recusa(await fiscal({ itens: [{ id: its[0], valor_unitario: 99 }] }), 409, L9);
    await recusaServico(() => receiptService.salvarDadosFiscal(db, SUPER, id, { itens: [{ id: its[0], corrida_lote: 'C9' }] }), L8);
    await recusaServico(() => receiptService.salvarDadosFiscal(db, SUPER, id, { itens: [{ id: its[0], valor_total: 198 }] }), L9);
    await ok(fiscal({ itens: [{ id: its[0], valor_icms: 5 }, { id: its[1], series: 'X2', valor_unitario: 8 }] }));
    const b = await dbGet(db, 'SELECT series, valor_unitario FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [its[1]]);
    assert.deepStrictEqual([b.series, b.valor_unitario], ['X2', 8]);
  });

  await test('[RN-08] o segundo Processar leva B; A fica com o lote, as series, o custo medio e o ultimo custo da entrada', async () => {
    const p = await ok(request(app).post(`${API}/recebimentos/${id}/processar`).send({}));
    assert.strictEqual(p.body.status, 'PROCESSADO');
    assert.strictEqual(await fisico(mB), 2);
    const lotes = await dbAll(db, 'SELECT codigo, data_validade, corrida FROM lotes_almoxarifado WHERE material_id = ?', [mA]);
    assert.deepStrictEqual(lotes, [{ codigo: 'L-ORIG', data_validade: '2027-01-31', corrida: 'C1' }]);
    const series = await dbAll(db, 'SELECT numero, status, recebimento_item_id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [mA]);
    assert.deepStrictEqual(series.map((s) => [s.numero, s.status, s.recebimento_item_id]), [['S1', 'EM_ESTOQUE', its[0]], ['S2', 'EM_ESTOQUE', its[0]]]);
    assert.strictEqual((await dbGet(db, 'SELECT custo_medio c FROM materiais_almoxarifado WHERE id = ?', [mA])).c, 10);
    const ctx = await ok(request(app).get(`${API}/compras/contexto-material/${mA}`));
    assert.strictEqual(ctx.body.ultimo_custo_entrada.valor, 10);
    // processado: o /fiscal recusa pelo status, como sempre
    assert.strictEqual((await request(app).put(`${API}/recebimentos/${id}/fiscal`).send({ itens: [] })).status, 400);
    assert.deepStrictEqual((await dbAll(db, A78_LOTE)).filter((l) => l.recebimento_id === id), [], 'a A78 acusou o recebimento limpo');
    assert.deepStrictEqual((await dbAll(db, A78_SERIE)).filter((l) => l.recebimento_id === id), [], 'a A78 acusou as series limpas');
  });

  await test('[RN-08] o caminho que a L8 diz: o Administrador estorna a entrada de A e da a entrada de novo com o lote e as series certos', async () => {
    const mov = await dbGet(db, 'SELECT movimentacao_entrada_id m FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [its[0]]);
    await ok(request(app).post(`${API}/movimentacoes/${mov.m}/cancelar`).send({ motivo: 'lote e series digitados errados na nota' }));
    await ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: mA, tipo: 'ENTRADA', quantidade: 2, lote: 'L-CERTO',
      series: ['S8', 'S9'], localizacao_destino_id: loc, motivo: 'entrada certa da NF-FII130' }), 201);
    assert.strictEqual(await fisico(mA), 2);
    const vivas = await dbAll(db, "SELECT numero FROM series_almoxarifado WHERE material_id = ? AND status = 'EM_ESTOQUE' ORDER BY numero", [mA]);
    assert.deepStrictEqual(vivas.map((s) => s.numero), ['S8', 'S9']);
    // Fase 5 (r1 I1, declarado na L8 e na C269): o caminho corrige o ESTOQUE; o documento da nota continua como entrou
    const docA = await dbGet(db, 'SELECT lote, series, entrada_estoque_em FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [its[0]]);
    assert.deepStrictEqual([docA.lote, docA.series], ['L-ORIG', 'S1\nS2']);
    assert.ok(docA.entrada_estoque_em, 'o estorno nao limpa a entrada do item');
  });

  await test('[RN-08] A78 acha o que o /fiscal antigo deixou (lote diferente, validade diferente, lote sem registro, serie sem registro) e nao acha o limpo', async () => {
    // o /fiscal de antes da 130 mudava o texto do item entrado: o estado e montado por SQL
    await dbRun(db, "UPDATE recebimentos_material_itens_almoxarifado SET lote = 'L-NOVO', series = 'S1\nS9' WHERE id = ?", [its[0]]);
    let lotes = (await dbAll(db, A78_LOTE)).filter((l) => l.recebimento_id === id);
    assert.deepStrictEqual(lotes.map((l) => [l.achado, l.item_id, l.lote_no_documento, l.lote_no_estoque]),
      [['LOTE_DIFERENTE', its[0], 'L-NOVO', 'L-ORIG']]);
    const series = (await dbAll(db, A78_SERIE)).filter((l) => l.recebimento_id === id);
    assert.deepStrictEqual(series.map((s) => [s.item_id, s.serie_no_documento]), [[its[0], 'S9']], 'so a S9 (a S1 existe para o item)');
    // so a validade diferente
    await dbRun(db, "UPDATE recebimentos_material_itens_almoxarifado SET lote = 'L-ORIG', data_validade_lote = '2028-12-31' WHERE id = ?", [its[0]]);
    lotes = (await dbAll(db, A78_LOTE)).filter((l) => l.recebimento_id === id);
    assert.deepStrictEqual(lotes.map((l) => [l.achado, l.validade_no_documento, l.validade_no_estoque]), [['LOTE_DIFERENTE', '2028-12-31', '2027-01-31']]);
    // a validade com hora no documento nao e achado
    await dbRun(db, "UPDATE recebimentos_material_itens_almoxarifado SET data_validade_lote = '2027-01-31T00:00:00.000Z' WHERE id = ?", [its[0]]);
    assert.deepStrictEqual((await dbAll(db, A78_LOTE)).filter((l) => l.recebimento_id === id), []);
    // B (sem controle de lote) ganhou um lote de texto depois da entrada: LOTE_SEM_REGISTRO
    await dbRun(db, "UPDATE recebimentos_material_itens_almoxarifado SET lote = 'L-B' WHERE id = ?", [its[1]]);
    lotes = (await dbAll(db, A78_LOTE)).filter((l) => l.recebimento_id === id);
    assert.deepStrictEqual(lotes.map((l) => [l.achado, l.item_id]), [['LOTE_SEM_REGISTRO', its[1]]]);
    // CRLF e linhas vazias no documento nao viram achado
    await dbRun(db, "UPDATE recebimentos_material_itens_almoxarifado SET series = 'S2\r\n\r\nS1\r\n' WHERE id = ?", [its[0]]);
    assert.deepStrictEqual((await dbAll(db, A78_SERIE)).filter((l) => l.recebimento_id === id), []);
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
