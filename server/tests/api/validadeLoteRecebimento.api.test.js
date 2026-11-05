/**
 * Etapa 194 — a validade da nota no recebimento (B1296, B1277, C456).
 *
 * Antes: com um lote que ja existia, `darEntradaEstoque` chamava `criarOuObterLote` (que devolve o existente sem tocar) e a validade
 * da nota era jogada fora calada — lote com outra validade ficava com a primeira, lote sem validade continuava sem. Agora a regua
 * `lotService.avaliarValidadeDaNota` decide (NADA / PREENCHER / DIVERGENTE / INVALIDA / LEGADO), o `GET /recebimentos/:id` mostra a
 * previa por item (`avisos_validade_lote`, sempre presente) e o processamento preenche o lote sem validade, mantem a validade do que
 * tem e responde `avisos_validade` (so quando ha aviso — a resposta sem aviso e a de hoje).
 *
 * As literais sao COPIADAS do contrato congelado (plano da 194, "Contrato" + "Fase 2"), nao importadas do servico.
 * Usuario ADMIN superadmin (`receber_material` pelo `requirePermission` real do harness).
 * Plano: docs/superpowers/plans/2026-11-05-almoxarifado-etapa194-validade-do-lote-no-recebimento.md
 *
 * Executar: cd server && node tests/api/validadeLoteRecebimento.api.test.js
 */
process.env.TZ = 'UTC';
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');
const receiptService = require('../../services/almoxarifado/receiptService');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const ADMIN = { id: 1, nome: 'Adm 194', role: 'admin', is_superadmin: 1, email: 'a194@t.com' };
const API = '/api/almoxarifado';

const BR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const ETIQUETA = ' A etiqueta do recebimento sai com a data da nota — imprima a do lote em Lotes e Séries.';
const MSG = {
  PREVIA_PREENCHER: (c, n, vencida = false) => `O lote ${c} não tem validade; ao processar, ele recebe a validade da nota (${BR(n)}). `
    + 'Confira a data antes de processar.' + (vencida ? ' Essa data já venceu: o saldo do lote fica bloqueado para consumo.' : ''),
  PREVIA_DIVERGENTE: (c, l, n) => `O lote ${c} já tem validade ${BR(l)}, e a nota informa ${BR(n)}. Ao processar, a validade do lote é `
    + 'mantida — confira a data da nota em Dados fiscais; se a do lote está errada, corrija-a em Lotes e Séries → "Corrigir validade".'
    + ETIQUETA,
  PREVIA_DUAS_NA_NOTA: (c, ds) => `Esta nota traz o lote ${c} com validades diferentes (${ds.map(BR).join(', ')}). O lote fica com uma `
    + 'só — confira as datas em Dados fiscais antes de processar.',
  PREVIA_LEGADO: (c) => `O lote ${c} tem a validade em branco (cadastro antigo) e a nota não consegue preenchê-la — informe-a em Lotes `
    + 'e Séries → "Corrigir validade".',
  NOTA_DIVERGENTE: (c, l, n) => `O lote ${c} já tinha validade ${BR(l)}; a nota informou ${BR(n)}. A validade do lote foi mantida — se `
    + 'a da nota é a certa, corrija-a em Lotes e Séries → "Corrigir validade".' + ETIQUETA,
  NOTA_INVALIDA: (c, v) => `A validade da nota para o lote ${c} (${v}) não é uma data válida; o lote continua sem validade — informe-a `
    + 'em Lotes e Séries → "Corrigir validade".',
  // Da 190, reaproveitadas sem mudar o texto
  AVISO_PREENCHIDA: (c, d) => `O lote ${c} não tinha validade; ela foi gravada agora (${BR(d)}) e vale também para o saldo que já estava nele.`,
  AVISO_FALHA: (c, d) => `A entrada foi registrada, mas a validade do lote ${c} não pôde ser gravada (${BR(d)}). Não repita a entrada; corrija a validade em Lotes e Séries → "Corrigir validade".`,
  AVISO_VENCIDO: (c, d) => `O lote ${c} entrou já vencido (validade ${BR(d)}). A saída para consumo fica bloqueada até liberar o vencimento na tela de Lotes e Séries.`,
  AVISO_SEPARACAO: (c, n) => `Há ${n} item(ns) de requisição separado(s) do lote ${c} ainda não entregue(s); a entrega pela origem planejada vai recusar o lote vencido — libere o vencimento ou entregue escolhendo outro lote (a troca fica registrada).`,
};

(async () => {
  console.log('\n=== Etapa 194: a validade da nota no recebimento ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const get = (u) => request(app).get(u).then((x) => x);
  const post = (u, b = {}) => request(app).post(u).send(b).then((x) => x);

  let seq = 0;
  const material = async ({ serie = false } = {}) => {
    const c = `V194-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        custo_unitario, controle_serie) VALUES (?, ?, 'UN', 0, 0, 1, 1, ?)`, [c, c, serie ? 1 : 0])).lastID;
  };
  const lote = (m, codigo) => dbGet(db, 'SELECT * FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m, codigo]);
  const fisico = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual AS q FROM materiais_almoxarifado WHERE id = ?', [m])).q);
  /** Lote com saldo pela Entrada manual (validade opcional). */
  const loteComSaldo = async (m, codigo, validade, qtd = 2) => {
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: m, tipo: 'ENTRADA', quantidade: qtd, lote: codigo, motivo: 'setup e194',
      ...(validade ? { data_validade: validade } : {}) });
    return lote(m, codigo);
  };
  /** Lote sem movimento (vazio), com a validade gravada como vier (inclusive '' legado). */
  const loteVazio = async (m, codigo, validade) => {
    await dbRun(db, "INSERT INTO lotes_almoxarifado (material_id, codigo, data_validade, status) VALUES (?, ?, ?, 'ATIVO')",
      [m, codigo, validade]);
    return lote(m, codigo);
  };
  /** Nota direta no banco. itens: { m, lote, val, qtd = 3, series, entrou } — inseridos NESTA ordem (ORDER BY ri.id). */
  const nota = async (itens, { status = 'EM_ENTRADA_NF' } = {}) => {
    const rec = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, ?, ?, 'Acme', '2026-11-01', '2026-11-02', 1000)`, [`REC-E194-${++seq}`, status, `NF-E194-${seq}`])).lastID;
    const ids = [];
    for (const it of itens) {
      const qtd = it.qtd === undefined ? 3 : it.qtd;
      ids.push((await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
        (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote, data_validade_lote, series, entrada_estoque_em)
        VALUES (?,?,?,?,?,?,?,?)`, [rec, it.m, qtd, qtd, it.lote === undefined ? null : it.lote,
        it.val === undefined ? null : it.val, it.series || null, it.entrou ? '2026-11-01 10:00:00' : null])).lastID);
    }
    return { rec, ids };
  };
  const previa = async (rec) => {
    const r = await get(`${API}/recebimentos/${rec}`);
    assert.strictEqual(r.status, 200, `GET ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.itens.map((i) => i.avisos_validade_lote);
  };
  const processar = (rec) => receiptService.processarNota(db, ADMIN, rec, {});
  const auditoriasPreenchida = (loteId) => dbAll(db, `SELECT * FROM auditoria_log_almoxarifado
    WHERE entidade = 'lote' AND entidade_id = ? AND acao = 'VALIDADE_PREENCHIDA' ORDER BY id`, [loteId]);
  const hoje = diaLocal.hojeLocalISO();
  const ontem = new Date(Date.parse(`${hoje}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);

  // ── RN-194.01 — a regua, pura ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-194.01] a regua: os ramos, hora no texto, espaco, DD/MM/AAAA, legado e lote ausente', async () => {
    const av = lotService.avaliarValidadeDaNota;
    const L = (v) => ({ codigo: 'L', data_validade: v });
    for (const n of [null, undefined, '']) assert.deepStrictEqual(av(L('2027-03-31'), n), { acao: 'NADA' }, `nota ${JSON.stringify(n)}`);
    assert.deepStrictEqual(av(L(null), null), { acao: 'NADA' }, 'sem validade dos dois lados');
    assert.deepStrictEqual(av(L(null), '2027-01-31'), { acao: 'PREENCHER', data: '2027-01-31' });
    assert.deepStrictEqual(av(L(null), '31/03/2027'), { acao: 'PREENCHER', data: '2027-03-31' }, 'DD/MM/AAAA vira ISO (Fase 2, achado 2)');
    assert.deepStrictEqual(av(L(null), '1999-01-01'), { acao: 'INVALIDA', valor: '1999-01-01' }, 'ano fora de 2000-2100');
    assert.deepStrictEqual(av(L(null), '2027-02-30'), { acao: 'INVALIDA', valor: '2027-02-30' }, 'data que nao existe');
    assert.deepStrictEqual(av(L(null), 'lixo'), { acao: 'INVALIDA', valor: 'lixo' });
    assert.deepStrictEqual(av(L('2027-03-31'), '2027-03-31'), { acao: 'NADA' });
    assert.deepStrictEqual(av(L('2027-03-31 00:00:00'), '2027-03-31'), { acao: 'NADA' }, 'hora no texto do lote');
    assert.deepStrictEqual(av(L('2027-03-31'), '2027-03-31 00:00:00'), { acao: 'NADA' }, 'hora no texto da nota');
    assert.deepStrictEqual(av(L('2027-03-31'), '31/03/2027'), { acao: 'NADA' }, 'DD/MM/AAAA igual');
    assert.deepStrictEqual(av(L('2027-03-31'), '2027-06-30'), { acao: 'DIVERGENTE', loteISO: '2027-03-31', notaISO: '2027-06-30' });
    assert.deepStrictEqual(av(L(''), '2027-06-30'), { acao: 'LEGADO', data: '2027-06-30' }, "'' legado (Fase 2, achado 3)");
    assert.deepStrictEqual(av(undefined, '2027-06-30'), { acao: 'NADA' }, 'lote ausente');
  });

  await test('[RN-194.01/Fase 2 achado 2] o texto do /fiscal com espaco: aparado dos dois lados', async () => {
    const av = lotService.avaliarValidadeDaNota;
    const L = (v) => ({ codigo: 'L', data_validade: v });
    assert.deepStrictEqual(av(L('2027-01-31'), ' 2027-01-31 '), { acao: 'NADA' }, 'espaco na nota');
    assert.deepStrictEqual(av(L(' 2027-01-31 '), '2027-01-31'), { acao: 'NADA' }, 'espaco no lote');
    assert.deepStrictEqual(av(L(null), ' 2027-01-31 '), { acao: 'PREENCHER', data: '2027-01-31' }, 'preenche aparada');
    assert.deepStrictEqual(av(L('2027-03-31'), '   '), { acao: 'NADA' }, 'nota so com espacos');
  });

  // ── RN-194.02 — a previa no GET ───────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-194.02] previa por item: divergente, preencher, invalida, legado; inexistente, ja entrado, qtd 0 e sem lote -> []', async () => {
    const m = []; for (let i = 0; i < 8; i++) m.push(await material());
    await loteComSaldo(m[0], 'L-DIV', '2027-03-31');
    await loteComSaldo(m[1], 'L-PRE', null);
    await loteComSaldo(m[2], 'L-INV', null);
    await loteVazio(m[3], 'L-LEG', '');
    await loteComSaldo(m[5], 'L-DIV5', '2027-03-31');
    await loteComSaldo(m[6], 'L-DIV6', '2027-03-31');
    const { rec } = await nota([
      { m: m[0], lote: 'L-DIV', val: '2027-06-30' },
      { m: m[1], lote: 'L-PRE', val: '2030-06-30' },
      { m: m[2], lote: 'L-INV', val: '1999-01-01' },
      { m: m[3], lote: 'L-LEG', val: '2030-06-30' },
      { m: m[4], lote: 'L-NOVO', val: '2027-01-01' },
      { m: m[5], lote: 'L-DIV5', val: '2027-06-30', entrou: true },
      { m: m[6], lote: 'L-DIV6', val: '2027-06-30', qtd: 0 },
      { m: m[7], val: '2027-06-30' },
    ]);
    const p = await previa(rec);
    assert.deepStrictEqual(p[0], [MSG.PREVIA_DIVERGENTE('L-DIV', '2027-03-31', '2027-06-30')], 'divergente');
    assert.deepStrictEqual(p[1], [MSG.PREVIA_PREENCHER('L-PRE', '2030-06-30')], 'preencher');
    assert.deepStrictEqual(p[2], [MSG.NOTA_INVALIDA('L-INV', '1999-01-01')], 'invalida');
    assert.deepStrictEqual(p[3], [MSG.PREVIA_LEGADO('L-LEG')], 'legado');
    assert.deepStrictEqual(p[4], [], 'lote inexistente');
    assert.deepStrictEqual(p[5], [], 'item ja entrado');
    assert.deepStrictEqual(p[6], [], 'quantidade 0');
    assert.deepStrictEqual(p[7], [], 'sem lote');
    assert.strictEqual((await lote(m[1], 'L-PRE')).data_validade, null, 'a previa nao grava');
  });

  await test('[RN-194.02] previa de PREENCHER com data ja vencida ganha o fim do bloqueio (Fase 2, achado 4)', async () => {
    const m = await material();
    await loteComSaldo(m, 'L-VEN', null);
    const { rec } = await nota([{ m, lote: 'L-VEN', val: ontem }]);
    assert.deepStrictEqual((await previa(rec))[0], [MSG.PREVIA_PREENCHER('L-VEN', ontem, true)]);
  });

  // ── RN-194.03 — duas linhas do mesmo lote ─────────────────────────────────────────────────────────────────────────────────
  await test('[RN-194.03] lote inexistente em duas linhas (uma com espaco): previa nas duas; processar -> a 1a vence, divergente da 2a', async () => {
    const m = await material();
    const { rec } = await nota([{ m, lote: 'L-X', val: '2027-06-30' }, { m, lote: ' L-X ', val: '2027-03-31' }]);
    const duas = MSG.PREVIA_DUAS_NA_NOTA('L-X', ['2027-03-31', '2027-06-30']);
    const p = await previa(rec);
    assert.deepStrictEqual(p[0], [duas], 'linha 1');
    assert.deepStrictEqual(p[1], [MSG.PREVIA_DIVERGENTE('L-X', '2027-06-30', '2027-03-31'), duas], 'linha 2 (simula o laco)');
    const r = await processar(rec);
    assert.strictEqual((await lote(m, 'L-X')).data_validade, '2027-06-30', 'a 1a linha vence');
    assert.deepStrictEqual(r.avisos_validade, [MSG.NOTA_DIVERGENTE('L-X', '2027-06-30', '2027-03-31')]);
    assert.strictEqual(await fisico(m), 6);
  });

  await test('[RN-194.03/Fase 2 achado 7] lote sem validade + linhas A e B: previa e processar dizem o mesmo', async () => {
    const m = await material();
    await loteComSaldo(m, 'L-AB', null);
    const { rec } = await nota([{ m, lote: 'L-AB', val: '2027-03-31' }, { m, lote: 'L-AB', val: '2027-06-30' }]);
    const duas = MSG.PREVIA_DUAS_NA_NOTA('L-AB', ['2027-03-31', '2027-06-30']);
    const p = await previa(rec);
    assert.deepStrictEqual(p[0], [MSG.PREVIA_PREENCHER('L-AB', '2027-03-31'), duas]);
    assert.deepStrictEqual(p[1], [MSG.PREVIA_DIVERGENTE('L-AB', '2027-03-31', '2027-06-30'), duas]);
    const r = await processar(rec);
    assert.deepStrictEqual(r.avisos_validade, [MSG.AVISO_PREENCHIDA('L-AB', '2027-03-31'),
      MSG.NOTA_DIVERGENTE('L-AB', '2027-03-31', '2027-06-30')]);
    assert.strictEqual((await lote(m, 'L-AB')).data_validade, '2027-03-31');
  });

  await test('[RN-194.03] duas linhas com a MESMA data (uma com hora): sem aviso de duas validades', async () => {
    const m = await material();
    const { rec } = await nota([{ m, lote: 'L-IG', val: '2027-06-30' }, { m, lote: 'L-IG', val: '2027-06-30 00:00:00' }]);
    assert.deepStrictEqual(await previa(rec), [[], []]);
  });

  // ── RN-194.04 — preencher ─────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-194.04] lote sem validade: a nota preenche, avisa e audita com o movimento do item', async () => {
    const m = await material();
    const l = await loteComSaldo(m, 'L-NF', null);
    const { rec, ids } = await nota([{ m, lote: 'L-NF', val: '2030-06-30' }]);
    const r = await processar(rec);
    assert.deepStrictEqual(r.avisos_validade, [MSG.AVISO_PREENCHIDA('L-NF', '2030-06-30')]);
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.status, 'PROCESSADO');
    assert.strictEqual(await fisico(m), 5);
    assert.strictEqual((await lote(m, 'L-NF')).data_validade, '2030-06-30');
    const item = await dbGet(db, 'SELECT movimentacao_entrada_id FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [ids[0]]);
    const aud = await auditoriasPreenchida(l.id);
    assert.strictEqual(aud.length, 1, 'uma auditoria VALIDADE_PREENCHIDA');
    assert.ok(item.movimentacao_entrada_id, 'premissa: o item tem o movimento');
    assert.strictEqual(JSON.parse(aud[0].dados_novos).movimento_id, item.movimentacao_entrada_id);
    assert.strictEqual(JSON.parse(aud[0].dados_novos).data_validade, '2030-06-30');
  });

  await test('[RN-194.04] nota 31/03/2027 num lote sem validade: grava o ISO (Fase 2, achado 2)', async () => {
    const m = await material();
    await loteComSaldo(m, 'L-BR', null);
    const { rec } = await nota([{ m, lote: 'L-BR', val: '31/03/2027' }]);
    assert.deepStrictEqual((await previa(rec))[0], [MSG.PREVIA_PREENCHER('L-BR', '2027-03-31')]);
    const r = await processar(rec);
    assert.deepStrictEqual(r.avisos_validade, [MSG.AVISO_PREENCHIDA('L-BR', '2027-03-31')]);
    assert.strictEqual((await lote(m, 'L-BR')).data_validade, '2027-03-31');
  });

  await test("[RN-194.04] lote legado '' -> AVISO_FALHA sem tocar o lote; fisico creditado", async () => {
    const m = await material();
    const l = await loteVazio(m, 'L-LEG2', '');
    const { rec } = await nota([{ m, lote: 'L-LEG2', val: '2030-06-30' }]);
    const r = await processar(rec);
    assert.deepStrictEqual(r.avisos_validade, [MSG.AVISO_FALHA('L-LEG2', '2030-06-30')]);
    assert.strictEqual((await lote(m, 'L-LEG2')).data_validade, '');
    assert.strictEqual(await fisico(m), 3);
    assert.strictEqual((await auditoriasPreenchida(l.id)).length, 0);
  });

  await test('[RN-194.04] o preencher que lanca: 200 + AVISO_FALHA, fisico creditado, lote sem validade', async () => {
    const m = await material();
    await loteComSaldo(m, 'L-ERR', null);
    const { rec } = await nota([{ m, lote: 'L-ERR', val: '2030-06-30' }]);
    const original = lotService.preencherValidadeSeVazia;
    const warn = console.warn; const avisos = [];
    lotService.preencherValidadeSeVazia = async () => { throw new Error('disco cheio (teste)'); };
    console.warn = (...a) => avisos.push(a.join(' '));
    let r;
    try { r = await processar(rec); } finally { lotService.preencherValidadeSeVazia = original; console.warn = warn; }
    assert.deepStrictEqual(r.avisos_validade, [MSG.AVISO_FALHA('L-ERR', '2030-06-30')]);
    assert.strictEqual(r.status, 'PROCESSADO');
    assert.strictEqual(await fisico(m), 5);
    assert.strictEqual((await lote(m, 'L-ERR')).data_validade, null);
    assert.ok(avisos.some((a) => a.includes('disco cheio')), 'console.warn com o erro');
  });

  await test('[RN-194.04/Fase 2 achado 4] preencher com data vencida: avisa o vencido e a separacao pendente', async () => {
    const m = await material();
    const l = await loteComSaldo(m, 'L-VEN2', null);
    const req = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E194-${++seq}`])).lastID;
    await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada, quantidade_separada,
      quantidade_entregue, quantidade_atendida, lote_separacao_id) VALUES (?,?,1,1,0,0,?)`, [req, m, l.id]);
    const { rec } = await nota([{ m, lote: 'L-VEN2', val: ontem }]);
    const r = await processar(rec);
    assert.deepStrictEqual(r.avisos_validade, [MSG.AVISO_PREENCHIDA('L-VEN2', ontem), MSG.AVISO_VENCIDO('L-VEN2', ontem),
      MSG.AVISO_SEPARACAO('L-VEN2', 1)]);
    assert.strictEqual((await lote(m, 'L-VEN2')).data_validade, ontem);
  });

  await test('[B1274] recusa do motor no item com PREENCHER: o lote continua sem validade', async () => {
    const m = await material({ serie: true });
    const l = await loteVazio(m, 'L-SER', null);
    await dbRun(db, "INSERT INTO series_almoxarifado (material_id, numero, status) VALUES (?, 'S194-1', 'EM_ESTOQUE')", [m]);
    const { rec } = await nota([{ m, lote: 'L-SER', val: '2030-06-30', qtd: 1, series: 'S194-1' }]);
    await assert.rejects(() => processar(rec), /ja esta em estoque/);
    assert.strictEqual((await lote(m, 'L-SER')).data_validade, null, 'o preencher rodou antes do motor');
    assert.strictEqual((await auditoriasPreenchida(l.id)).length, 0);
  });

  // ── RN-194.05 — divergente ────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-194.05] divergente com saldo: 200, fisico somado, validade intacta, aviso literal, item intacto', async () => {
    const m = await material();
    await loteComSaldo(m, 'L-D', '2027-03-31');
    const { rec, ids } = await nota([{ m, lote: 'L-D', val: '2027-06-30' }]);
    const r = await processar(rec);
    assert.deepStrictEqual(r.avisos_validade, [MSG.NOTA_DIVERGENTE('L-D', '2027-03-31', '2027-06-30')]);
    assert.strictEqual(await fisico(m), 5);
    assert.strictEqual((await lote(m, 'L-D')).data_validade, '2027-03-31');
    assert.strictEqual((await dbGet(db, 'SELECT data_validade_lote AS v FROM recebimentos_material_itens_almoxarifado WHERE id = ?',
      [ids[0]])).v, '2027-06-30');
  });

  await test('[RN-194.05/B1302] divergente com lote vazio: so avisa, nao redefine', async () => {
    const m = await material();
    await loteVazio(m, 'L-DV', '2027-03-31');
    const { rec } = await nota([{ m, lote: 'L-DV', val: '2027-06-30' }]);
    const r = await processar(rec);
    assert.deepStrictEqual(r.avisos_validade, [MSG.NOTA_DIVERGENTE('L-DV', '2027-03-31', '2027-06-30')]);
    assert.strictEqual((await lote(m, 'L-DV')).data_validade, '2027-03-31');
    assert.strictEqual(await fisico(m), 3);
  });

  // ── RN-194.06 — invalida ──────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-194.06] nota com 1999-01-01 ou lixo num lote sem validade: 200, lote null, NOTA_INVALIDA com o texto gravado', async () => {
    for (const val of ['1999-01-01', '31-03-2027']) {
      const m = await material();
      await loteComSaldo(m, 'L-I', null);
      const { rec } = await nota([{ m, lote: 'L-I', val }]);
      const r = await processar(rec);
      assert.deepStrictEqual(r.avisos_validade, [MSG.NOTA_INVALIDA('L-I', val)], val);
      assert.strictEqual((await lote(m, 'L-I')).data_validade, null, val);
      assert.strictEqual(await fisico(m), 5, val);
    }
  });

  // ── RN-194.07 — a resposta nas tres portas ────────────────────────────────────────────────────────────────────────────────
  await test('[RN-194.07] sem aviso a resposta e exatamente a de hoje (processar e aprovar direto)', async () => {
    const m = await material();
    await loteComSaldo(m, 'L-OK', '2027-03-31');
    const a = await nota([{ m, lote: 'L-OK', val: '2027-03-31' }, { m, lote: 'L-NOVO-OK', val: '2028-01-01' }]);
    const r = await processar(a.rec);
    assert.deepStrictEqual(r, { success: true, status: 'PROCESSADO', contas_pagar_id: r.contas_pagar_id });
    assert.ok(!('avisos_validade' in r));
    const b = await nota([{ m, lote: 'L-OK', val: '2027-03-31 00:00:00' }], { status: 'RECEBIDO' });
    assert.deepStrictEqual(await receiptService.aprovarRecebimento(db, ADMIN, b.rec, {}), { success: true });
  });

  await test('[RN-194.07] as tres portas pela rota com divergencia: /processar, /workflow processar, /aprovar direto', async () => {
    const m = await material();
    await loteComSaldo(m, 'L-P', '2027-03-31');
    const esperado = [MSG.NOTA_DIVERGENTE('L-P', '2027-03-31', '2027-06-30')];
    const a = await nota([{ m, lote: 'L-P', val: '2027-06-30' }]);
    const ra = await post(`${API}/recebimentos/${a.rec}/processar`, {});
    assert.strictEqual(ra.status, 200, JSON.stringify(ra.body));
    assert.deepStrictEqual(ra.body.avisos_validade, esperado, '/processar');
    assert.strictEqual(ra.body.status, 'PROCESSADO');
    const b = await nota([{ m, lote: 'L-P', val: '2027-06-30' }], { status: 'EM_ENTRADA_NF' }); // a transicao `processar` do workflow sai so de EM_ENTRADA_NF
    const rb = await post(`${API}/recebimentos/${b.rec}/workflow`, { acao: 'processar' });
    assert.strictEqual(rb.status, 200, JSON.stringify(rb.body));
    assert.deepStrictEqual(rb.body.avisos_validade, esperado, '/workflow');
    const c = await nota([{ m, lote: 'L-P', val: '2027-06-30' }], { status: 'RECEBIDO' });
    const rc = await post(`${API}/recebimentos/${c.rec}/aprovar`, {});
    assert.strictEqual(rc.status, 200, JSON.stringify(rc.body));
    assert.deepStrictEqual(rc.body, { success: true, avisos_validade: esperado }, '/aprovar direto');
    assert.strictEqual((await lote(m, 'L-P')).data_validade, '2027-03-31');
  });

  await test('[RN-194.02] o GET sem lote nenhum: todo item tem avisos_validade_lote = []', async () => {
    const m = await material();
    const { rec } = await nota([{ m }, { m, qtd: 0 }]);
    assert.deepStrictEqual(await previa(rec), [[], []]);
    assert.deepStrictEqual((await receiptService.getRecebimento(db, rec)).itens.map((i) => i.avisos_validade_lote), [[], []]);
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
