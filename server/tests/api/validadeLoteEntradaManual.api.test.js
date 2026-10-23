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

  // ── T2 (marcador) ───────────────────────────────────────────────────────────────────────────────────────────────────

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
