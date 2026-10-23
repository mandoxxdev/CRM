/**
 * Etapa 190 — a Entrada manual grava a validade do lote (C450).
 *
 * Antes: `POST /movimentacoes/v2` com `data_validade` respondia 201 e o `z.object` do `MovimentacaoSchema` descartava a chave em
 * silencio — o lote nascia sem validade (fim do FEFO, nunca vencido, nunca no e-mail "Lote vencendo"). Agora a chave chega ao
 * motor, que julga o formato, so aceita em entrada com lote, grava no lote novo, preenche o lote sem validade, recusa a outra
 * validade de um lote vivo e redefine a de um lote vazio (RN-190.06b, Fase 2 I-2).
 *
 * Usuario ADMIN superadmin (tem `movimentar` e `ajustar_estoque` pelo `requirePermission` real do harness).
 * Fuso: os cenarios de "ontem/hoje" leem `diaLocal.hojeLocalISO()` (dia de Brasilia, Etapa 170) — a mesma regua do motor; o
 * processo roda com TZ=UTC (declarado abaixo) para o dia do processo NAO coincidir com o de Brasilia por acaso das 21h a 0h.
 * Plano: docs/superpowers/plans/2026-10-23-almoxarifado-etapa190-validade-do-lote-na-entrada-manual.md
 *
 * Executar: cd server && node tests/api/validadeLoteEntradaManual.api.test.js
 */
process.env.TZ = 'UTC';
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');
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

const ADMIN = { id: 1, nome: 'Adm 190', role: 'admin', is_superadmin: 1, email: 'a190@t.com' };
const API = '/api/almoxarifado';

// As literais do contrato congelado (plano, "Contrato" + "Emendas da Fase 2") — copiadas, NAO importadas do servico.
const BR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const MSG = {
  FORMATO: 'A validade do lote deve ser uma data no formato AAAA-MM-DD (ex.: 2027-03-31).',
  SO_ENTRADA: 'A validade do lote só pode ser informada numa entrada — numa saída, transferência ou ajuste o lote já existe e a validade é a dele.',
  SEM_LOTE: 'Informe o lote para gravar a validade — a validade é do lote.',
  CONFLITO: (c, d) => `O lote ${c} já tem validade ${BR(d)}. A validade é do lote, não da entrada: deixe o campo em branco ou informe a mesma data. Se a validade gravada está errada, peça a correção do lote.`,
  AVISO_PREENCHIDA: (c, d) => `O lote ${c} não tinha validade; ela foi gravada agora (${BR(d)}) e vale também para o saldo que já estava nele.`,
  AVISO_VENCIDO: (c, d) => `O lote ${c} entrou já vencido (validade ${BR(d)}). A saída para consumo fica bloqueada até liberar o vencimento na tela de Lotes e Séries.`,
  AVISO_CORRIDA: (c, d) => `A validade do lote ${c} foi gravada por outra operação (${BR(d)}) enquanto esta entrada era registrada; a entrada valeu e a validade do lote não foi alterada.`,
  AVISO_FALHA: (c, d) => `A entrada foi registrada, mas a validade do lote ${c} não pôde ser gravada (${BR(d)}). Não repita a entrada; peça a correção da validade do lote.`,
  AVISO_REDEFINIDA: (c, a, n) => `O lote ${c} estava vazio com a validade ${BR(a)}; ela foi trocada por ${BR(n)}.`,
};

(async () => {
  console.log('\n=== Etapa 190: a Entrada manual grava a validade do lote ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const post = (u, b = {}) => request(app).post(u).send(b).then((x) => x);
  const get = (u) => request(app).get(u).then((x) => x);

  let seq = 0;
  const material = async (extra = {}) => {
    const c = `V190-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        custo_unitario, controle_serie) VALUES (?, ?, 'UN', 0, 0, 1, 1, ?)`, [c, c, extra.serie ? 1 : 0])).lastID;
    return id;
  };
  const loc = async () => (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?, 'e190', 1)",
    [`L190-${++seq}`])).lastID;
  const lote = (m, codigo) => dbGet(db, 'SELECT * FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m, codigo]);
  const contar = async (sql, p = []) => Number((await dbGet(db, sql, p)).n);
  const nLotes = () => contar('SELECT COUNT(*) AS n FROM lotes_almoxarifado');
  const nMovs = () => contar('SELECT COUNT(*) AS n FROM movimentacoes_almoxarifado');
  const fisico = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual AS q FROM materiais_almoxarifado WHERE id = ?', [m])).q);
  const entrada = (m, corpo) => post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: 1, motivo: 'e190', ...corpo });
  const ok201 = (r, o = '') => assert.strictEqual(r.status, 201, `${o} ${r.status} ${JSON.stringify(r.body)}`);
  const recusa = (r, literal, o = '') => {
    assert.strictEqual(r.status, 400, `${o} esperava 400, veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, literal, `${o} mensagem`);
  };
  const auditorias = (loteId, acao) => dbAll(db, `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'lote' AND entidade_id = ?
    AND acao = ? ORDER BY id`, [loteId, acao]);

  // ── T1 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-190.01] entrada pela v2 grava a validade no lote novo', async () => {
    const m = await material();
    const r = await entrada(m, { quantidade: 10, lote: 'L-NOVO', data_validade: '2027-03-31' });
    ok201(r);
    const l = await lote(m, 'L-NOVO');
    assert.ok(l, 'o lote nao nasceu');
    assert.strictEqual(l.data_validade, '2027-03-31', 'a validade foi descartada no caminho (C450)');
    assert.strictEqual(r.body.aviso_validade, undefined, 'lote novo com validade futura nao avisa');
  });

  await test('[RN-190.01] pelo servico tambem', async () => {
    const m = await material();
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: m, tipo: 'ENTRADA', quantidade: 3, lote: 'L-SRV', data_validade: '2027-04-30', motivo: 'e190' });
    assert.strictEqual((await lote(m, 'L-SRV')).data_validade, '2027-04-30');
  });

  await test('[RN-190.04] auditoria CRIACAO leva a validade', async () => {
    const m = await material();
    ok201(await entrada(m, { lote: 'L-AUD', data_validade: '2027-05-31' }));
    const l = await lote(m, 'L-AUD');
    const a = await auditorias(l.id, 'CRIACAO');
    assert.strictEqual(a.length, 1);
    assert.strictEqual(JSON.parse(a[0].dados_novos).data_validade, '2027-05-31');
  });

  await test('[RN-190.02] formato: 400 FORMATO sem lote nem movimentacao; "" e null = nao informado', async () => {
    const m = await material();
    for (const ruim of ['31/03/2027', '2027-02-30', 20270331, ['2027-03-31'], '2027-3-31', ' 2027-03-31']) {
      const lotes0 = await nLotes(); const movs0 = await nMovs();
      const r = await entrada(m, { lote: `L-FMT-${seq}`, data_validade: ruim });
      recusa(r, MSG.FORMATO, `valor ${JSON.stringify(ruim)}:`);
      assert.strictEqual(await nLotes(), lotes0, `valor ${JSON.stringify(ruim)}: criou lote`);
      assert.strictEqual(await nMovs(), movs0, `valor ${JSON.stringify(ruim)}: gravou movimento`);
    }
    for (const [i, vazio] of [[1, ''], [2, null]]) {
      const r = await entrada(m, { lote: `L-VAZIO-${i}`, data_validade: vazio });
      ok201(r, `valor ${JSON.stringify(vazio)}:`);
      assert.strictEqual((await lote(m, `L-VAZIO-${i}`)).data_validade, null);
      assert.strictEqual(r.body.aviso_validade, undefined);
    }
  });

  await test('[RN-190.03] so entrada: SAIDA e /transferencias com validade -> 400 SO_ENTRADA', async () => {
    const m = await material();
    const A = await loc(); const B = await loc();
    ok201(await entrada(m, { quantidade: 10, lote: 'L-SAI', localizacao_destino_id: A }));
    const l = await lote(m, 'L-SAI');
    const saida = { material_id: m, tipo: 'SAIDA', quantidade: 1, lote_id: l.id, localizacao_origem_id: A,
      motivo: 'e190', justificativa: 'teste e190' };
    // controle no proprio teste: a mesma saida SEM a validade passa (a recusa abaixo e da validade, nao de outra guarda)
    ok201(await post(`${API}/movimentacoes/v2`, saida), 'saida sem validade:');
    const movs0 = await nMovs();
    recusa(await post(`${API}/movimentacoes/v2`, { ...saida, data_validade: '2027-03-31' }), MSG.SO_ENTRADA, 'v2 SAIDA:');
    recusa(await post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'AJUSTE', quantidade: 5, lote_id: l.id,
      justificativa: 'teste e190', data_validade: '2027-03-31' }), MSG.SO_ENTRADA, 'v2 AJUSTE:');
    const tr = { material_id: m, quantidade: 1, lote_id: l.id, localizacao_origem_id: A, localizacao_destino_id: B, motivo: 'e190' };
    recusa(await post(`${API}/transferencias`, { ...tr, data_validade: '2027-03-31' }), MSG.SO_ENTRADA, '/transferencias:');
    assert.strictEqual(await nMovs(), movs0, 'uma recusa gravou movimento');
    ok201(await post(`${API}/transferencias`, tr), 'transferencia sem validade:');
  });

  await test('[RN-190.03] sem lote: ENTRADA sem lote (ou lote so com espacos) com validade -> 400 SEM_LOTE', async () => {
    const m = await material();
    const movs0 = await nMovs();
    recusa(await entrada(m, { data_validade: '2027-03-31' }), MSG.SEM_LOTE, 'sem lote:');
    recusa(await entrada(m, { lote: '   ', data_validade: '2027-03-31' }), MSG.SEM_LOTE, 'lote "   ":');
    assert.strictEqual(await nMovs(), movs0);
    assert.strictEqual(await fisico(m), 0);
  });

  await test('[RN-190.03] AJUSTE_POSITIVO pela v2 com lote novo e validade -> grava (e tipo de entrada)', async () => {
    const m = await material();
    const r = await post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'AJUSTE_POSITIVO', quantidade: 2, lote: 'L-AJP',
      data_validade: '2027-06-30', motivo: 'e190', justificativa: 'teste e190' });
    ok201(r);
    assert.strictEqual((await lote(m, 'L-AJP')).data_validade, '2027-06-30');
  });

  // ── T2 — lote existente: preencher, conferir, redefinir o vazio, avisar ───────────────────────────────────────────────
  const hoje = diaLocal.hojeLocalISO();
  const ontem = diaLocal.somarDiasISO(hoje, -1);
  // guarda do relogio: a regua e o dia de Brasilia, e "ontem" tem de ser < "hoje" nela (senao os cenarios 12/13 provam nada)
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(hoje) && ontem < hoje, `premissa do relogio: hoje=${hoje} ontem=${ontem}`);
  const todasAuditoriasDoLote = async (loteId) => contar(`SELECT COUNT(*) AS n FROM auditoria_log_almoxarifado
    WHERE entidade = 'lote' AND entidade_id = ?`, [loteId]);
  const loteComSaldo = async (m, codigo, qtd, extra = {}) => {
    ok201(await entrada(m, { quantidade: qtd, lote: codigo, ...extra }), `setup ${codigo}:`);
    return lote(m, codigo);
  };
  const estornar = (movId) => post(`${API}/movimentacoes/${movId}/cancelar`, { motivo: 'teste e190' });
  const nMovsDoMaterial = (m) => contar('SELECT COUNT(*) AS n FROM movimentacoes_almoxarifado WHERE material_id = ?', [m]);

  await test('[RN-190.05] lote sem validade e preenchido (aviso, auditoria com movimento_id)', async () => {
    const m = await material();
    const l1 = await loteComSaldo(m, 'L1', 6);
    assert.strictEqual(l1.data_validade, null, 'premissa: L1 sem validade');
    const r = await entrada(m, { quantidade: 4, lote: 'L1', data_validade: '2027-01-31' });
    ok201(r);
    assert.strictEqual(r.body.aviso_validade, MSG.AVISO_PREENCHIDA('L1', '2027-01-31'));
    assert.strictEqual((await lote(m, 'L1')).data_validade, '2027-01-31');
    assert.strictEqual(await fisico(m), 10);
    const a = await auditorias(l1.id, 'VALIDADE_PREENCHIDA');
    assert.strictEqual(a.length, 1, 'auditoria VALIDADE_PREENCHIDA');
    assert.deepStrictEqual(JSON.parse(a[0].dados_anteriores), { data_validade: null });
    assert.deepStrictEqual(JSON.parse(a[0].dados_novos), { data_validade: '2027-01-31', movimento_id: r.body.id });
  });

  await test('[RN-190.05] entrada recusada nao preenche (serie errada num material de serie)', async () => {
    const m = await material({ serie: true });
    ok201(await entrada(m, { quantidade: 1, lote: 'L9', series: ['S9-1'] }), 'setup L9:');
    const r = await entrada(m, { quantidade: 2, lote: 'L9', series: ['S9-2'], data_validade: '2027-01-31' });
    assert.strictEqual(r.status, 400, `esperava a recusa de serie de hoje: ${r.status} ${JSON.stringify(r.body)}`);
    assert.notStrictEqual(r.body.error, MSG.CONFLITO('L9', '2027-01-31'));
    assert.strictEqual((await lote(m, 'L9')).data_validade, null, 'a entrada recusada preencheu a validade');
  });

  await test('[RN-190.06] mesma validade passa sem aviso e sem auditoria nova', async () => {
    const m = await material();
    const l = await loteComSaldo(m, 'L-MESMA', 5, { data_validade: '2027-01-31' });
    const aud0 = await todasAuditoriasDoLote(l.id);
    const r = await entrada(m, { quantidade: 2, lote: 'L-MESMA', data_validade: '2027-01-31' });
    ok201(r);
    assert.strictEqual(r.body.aviso_validade, undefined);
    assert.strictEqual(await todasAuditoriasDoLote(l.id), aud0, 'auditoria nova no lote');
  });

  await test('[RN-190.06] outra validade num lote com saldo -> 400 CONFLITO (por codigo e por lote_id), tudo intacto', async () => {
    const m = await material();
    const l2 = await loteComSaldo(m, 'L2', 5, { data_validade: '2027-01-31' });
    const movs0 = await nMovsDoMaterial(m);
    recusa(await entrada(m, { quantidade: 3, lote: 'L2', data_validade: '2027-02-28' }), MSG.CONFLITO('L2', '2027-01-31'), 'por codigo:');
    recusa(await entrada(m, { quantidade: 3, lote_id: l2.id, data_validade: '2027-02-28' }), MSG.CONFLITO('L2', '2027-01-31'),
      'por lote_id:');
    assert.strictEqual(await nMovsDoMaterial(m), movs0, 'o livro ganhou linha');
    assert.strictEqual(await fisico(m), 5, 'o saldo mudou');
    assert.strictEqual((await lote(m, 'L2')).data_validade, '2027-01-31', 'a validade mudou');
  });

  await test('[RN-190.06b] lote vazio por recusa de serie: a entrada certa com outra data redefine (AVISO_REDEFINIDA)', async () => {
    const m = await material({ serie: true });
    const r0 = await entrada(m, { quantidade: 2, lote: 'LORF', series: ['SO-1'], data_validade: '2027-03-31' });
    assert.strictEqual(r0.status, 400, `premissa (serie errada): ${r0.status}`);
    const orfao = await lote(m, 'LORF');
    assert.ok(orfao, 'premissa B1275: o lote nasce antes da recusa de serie');
    assert.strictEqual(orfao.data_validade, '2027-03-31');
    const r = await entrada(m, { quantidade: 2, lote: 'LORF', series: ['SO-1', 'SO-2'], data_validade: '2027-08-31' });
    ok201(r);
    assert.strictEqual(r.body.aviso_validade, MSG.AVISO_REDEFINIDA('LORF', '2027-03-31', '2027-08-31'));
    assert.strictEqual((await lote(m, 'LORF')).data_validade, '2027-08-31');
    const a = await auditorias(orfao.id, 'VALIDADE_REDEFINIDA');
    assert.strictEqual(a.length, 1, 'auditoria VALIDADE_REDEFINIDA');
    assert.deepStrictEqual(JSON.parse(a[0].dados_anteriores), { data_validade: '2027-03-31' });
    assert.deepStrictEqual(JSON.parse(a[0].dados_novos), { data_validade: '2027-08-31', movimento_id: r.body.id });
  });

  await test('[RN-190.06b] lote com entrada e saida total (saldo 0, movimentos vivos) -> CONFLITO', async () => {
    const m = await material();
    const l = await loteComSaldo(m, 'L-ZERO', 3, { data_validade: '2027-01-31' });
    ok201(await post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'SAIDA', quantidade: 3, lote_id: l.id, motivo: 'e190',
      justificativa: 'teste e190' }), 'saida total:');
    assert.strictEqual(await fisico(m), 0, 'premissa: saldo 0');
    recusa(await entrada(m, { quantidade: 1, lote: 'L-ZERO', data_validade: '2027-02-28' }), MSG.CONFLITO('L-ZERO', '2027-01-31'));
  });

  await test('[RN-190.07] vencida aceita com aviso ("ontem" de Brasilia); hoje nao e passado', async () => {
    const m = await material();
    const r = await entrada(m, { quantidade: 2, lote: 'L-ONTEM', data_validade: ontem });
    ok201(r);
    assert.strictEqual(r.body.aviso_validade, MSG.AVISO_VENCIDO('L-ONTEM', ontem));
    assert.strictEqual((await lote(m, 'L-ONTEM')).data_validade, ontem);
    const r2 = await entrada(m, { quantidade: 2, lote: 'L-HOJE', data_validade: hoje });
    ok201(r2);
    assert.strictEqual(r2.body.aviso_validade, undefined, `hoje (${hoje}) avisou como vencido`);
  });

  await test('[RN-190.07] preenchida e vencida -> os dois avisos, nessa ordem, separados por espaco', async () => {
    const m = await material();
    await loteComSaldo(m, 'L-PV', 6);
    const r = await entrada(m, { quantidade: 1, lote: 'L-PV', data_validade: ontem });
    ok201(r);
    assert.strictEqual(r.body.aviso_validade, `${MSG.AVISO_PREENCHIDA('L-PV', ontem)} ${MSG.AVISO_VENCIDO('L-PV', ontem)}`);
  });

  await test('[RN-190.08] corrida: outra validade gravada antes do preenchimento -> 201 + AVISO_CORRIDA, sem sobrescrever', async () => {
    const m = await material();
    const l = await loteComSaldo(m, 'L-CORR', 6);
    const original = lotService.preencherValidadeSeVazia;
    assert.strictEqual(typeof original, 'function', 'lotService.preencherValidadeSeVazia existe');
    // Molde do CLAUDE.md: o gancho so SINALIZA e segura; o gesto concorrente (a outra gravacao) roda do contexto do teste.
    let sinalizar; const chegou = new Promise((res) => { sinalizar = res; });
    let soltar; const solto = new Promise((res) => { soltar = res; });
    let chamado = 0;
    lotService.preencherValidadeSeVazia = async (...args) => { chamado += 1; sinalizar(); await solto; return original(...args); };
    try {
      const pedido = entrada(m, { quantidade: 4, lote: 'L-CORR', data_validade: '2027-01-31' });
      await chegou;
      await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?', ['2028-01-31', l.id]);
      soltar();
      const r = await pedido;
      ok201(r);
      assert.strictEqual(chamado, 1, 'o motor nao chamou lotService.preencherValidadeSeVazia pelo objeto do modulo');
      assert.strictEqual(r.body.aviso_validade, MSG.AVISO_CORRIDA('L-CORR', '2028-01-31'));
      assert.strictEqual((await lote(m, 'L-CORR')).data_validade, '2028-01-31', 'o preenchimento sobrescreveu');
      assert.strictEqual(await fisico(m), 10, 'a entrada valeu');
    } finally {
      lotService.preencherValidadeSeVazia = original;
    }
  });

  await test('[RN-190.08/I-1] o preenchimento que falha nao derruba a entrada: 201 + AVISO_FALHA, um movimento, lote sem validade', async () => {
    const m = await material();
    const l = await loteComSaldo(m, 'L-FALHA', 6);
    const movs0 = await nMovsDoMaterial(m);
    const re = /UPDATE\s+lotes_almoxarifado\s+SET\s+data_validade/i;
    const origRun = db.run; const origGet = db.get; let injetadas = 0;
    const comFalha = (orig) => function (sql, ...rest) {
      if (re.test(String(sql))) {
        injetadas += 1;
        const cb = rest.find((x) => typeof x === 'function');
        setImmediate(() => cb.call({}, new Error('SQLITE_BUSY: falha injetada pelo teste e190')));
        return this;
      }
      return orig.call(this, sql, ...rest);
    };
    db.run = comFalha(origRun); db.get = comFalha(origGet);
    const warn = console.warn; const avisosLog = []; console.warn = (...a) => avisosLog.push(a.join(' '));
    let r;
    try {
      r = await entrada(m, { quantidade: 4, lote: 'L-FALHA', data_validade: '2027-01-31' });
    } finally {
      db.run = origRun; db.get = origGet; console.warn = warn;
    }
    assert.ok(injetadas >= 1, 'a falha nao foi injetada (o UPDATE nao rodou?)');
    ok201(r);
    assert.strictEqual(r.body.aviso_validade, MSG.AVISO_FALHA('L-FALHA', '2027-01-31'));
    assert.strictEqual(await nMovsDoMaterial(m), movs0 + 1, 'o livro tem de ter UM movimento novo');
    assert.strictEqual(await fisico(m), 10, 'fisico +4');
    assert.strictEqual((await lote(m, 'L-FALHA')).data_validade, null);
    assert.ok(avisosLog.some((s) => s.includes(String(r.body.id))), `o log nao cita a movimentacao: ${avisosLog.join(' | ')}`);
    assert.strictEqual(l.data_validade, null);
  });

  await test('[RN-190.08/I-1] UPDATE perdido com o lote ainda sem validade -> AVISO_FALHA (nao "outra operacao ()")', async () => {
    const m = await material();
    await loteComSaldo(m, 'L-PERDEU', 6);
    const original = lotService.preencherValidadeSeVazia;
    lotService.preencherValidadeSeVazia = async () => ({ preenchida: false, atual: null });
    const warn = console.warn; console.warn = () => {};
    let r;
    try {
      r = await entrada(m, { quantidade: 4, lote: 'L-PERDEU', data_validade: '2027-01-31' });
    } finally {
      lotService.preencherValidadeSeVazia = original; console.warn = warn;
    }
    ok201(r);
    assert.strictEqual(r.body.aviso_validade, MSG.AVISO_FALHA('L-PERDEU', '2027-01-31'));
    assert.strictEqual(await fisico(m), 10);
  });

  await test('[RN-190.09] o estorno nao desfaz a validade preenchida', async () => {
    const m = await material();
    await loteComSaldo(m, 'L-EST', 6);
    const r = await entrada(m, { quantidade: 4, lote: 'L-EST', data_validade: '2027-01-31' });
    ok201(r);
    const c = await estornar(r.body.id);
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.strictEqual(await fisico(m), 6);
    assert.strictEqual((await lote(m, 'L-EST')).data_validade, '2027-01-31');
  });

  await test('[RN-190.06b] entrada, estorno, entrada com outra data -> redefine; liberacao de vencimento do lote vazio e zerada', async () => {
    const m = await material();
    const r1 = await entrada(m, { quantidade: 2, lote: 'LEST', data_validade: '2027-03-31' });
    ok201(r1);
    assert.strictEqual((await estornar(r1.body.id)).status, 200);
    const r2 = await entrada(m, { quantidade: 2, lote: 'LEST', data_validade: '2027-09-30' });
    ok201(r2);
    assert.strictEqual(r2.body.aviso_validade, MSG.AVISO_REDEFINIDA('LEST', '2027-03-31', '2027-09-30'));
    assert.strictEqual((await lote(m, 'LEST')).data_validade, '2027-09-30');

    // lote liberado vencido, esvaziado pelo estorno, redefinido -> a liberacao era daquela validade
    const m2 = await material();
    const r3 = await entrada(m2, { quantidade: 2, lote: 'LLIB', data_validade: ontem });
    ok201(r3);
    const llib = await lote(m2, 'LLIB');
    const lib = await request(app).put(`${API}/lotes/${llib.id}/liberar-vencimento`).send({ justificativa: 'teste e190' });
    assert.strictEqual(lib.status, 200, JSON.stringify(lib.body));
    assert.ok((await lote(m2, 'LLIB')).vencimento_liberado_em, 'premissa: liberado');
    assert.strictEqual((await estornar(r3.body.id)).status, 200);
    const r4 = await entrada(m2, { quantidade: 1, lote: 'LLIB', data_validade: '2027-12-31' });
    ok201(r4);
    assert.strictEqual(r4.body.aviso_validade, MSG.AVISO_REDEFINIDA('LLIB', ontem, '2027-12-31'));
    const depois = await lote(m2, 'LLIB');
    assert.strictEqual(depois.data_validade, '2027-12-31');
    assert.strictEqual(depois.vencimento_liberado_em, null, 'a liberacao da validade antiga ficou');
    assert.strictEqual(depois.vencimento_liberado_por, null);
    assert.strictEqual(depois.vencimento_liberado_motivo, null);
  });

  await test('[B1277] recebimento intacto: lote nascido sem validade pela Entrada continua sem depois da nota com validade', async () => {
    const m = await material();
    await loteComSaldo(m, 'L-NF', 2);
    const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'Acme', '2026-08-01', '2026-08-02', 1000)`, [`REC-E190-${++seq}`, `NF-E190-${seq}`]);
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote, data_validade_lote) VALUES (?,?,?,?,?,?)`,
    [rec.lastID, m, 3, 3, 'L-NF', '2030-06-30']);
    await require('../../services/almoxarifado/receiptService').processarNota(db, ADMIN, rec.lastID, {});
    assert.strictEqual(await fisico(m), 5, 'premissa: a nota entrou');
    assert.strictEqual((await lote(m, 'L-NF')).data_validade, null, 'o recebimento mudou de comportamento (B1277 — e a 191)');
  });

  await test('[RN-190.05] pelo servico: o preenchimento e o aviso sem passar pelo schema', async () => {
    const m = await material();
    await loteComSaldo(m, 'L-SRV2', 6);
    const r = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: m, tipo: 'ENTRADA', quantidade: 1, lote: 'L-SRV2', data_validade: '2027-01-31', motivo: 'e190' });
    assert.strictEqual(r.aviso_validade, MSG.AVISO_PREENCHIDA('L-SRV2', '2027-01-31'));
    assert.strictEqual((await lote(m, 'L-SRV2')).data_validade, '2027-01-31');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
