/**
 * Etapa 269 (T2, item 21 — C457, B1282, C460) — a Entrada num lote vencido avisa, mesmo sem digitar a validade; e o lote antigo com a
 * validade em branco deixa de recusar a Entrada com uma data vazia na mensagem.
 *
 * Antes: o aviso de vencido saia so com a data digitada (B1282) — a Entrada sem a data num lote vencido era registrada calada; e o lote
 * com `data_validade = ''` (cadastro antigo) com saldo recusava a Entrada com a data: "O lote L já tem validade . …" (C460).
 * Agora: a v2 (a tela de Movimentacoes; opcao `avisaLoteVencido` do motor, so no 4o argumento) avisa o lote existente vencido (B1641); o
 * branco e "sem validade" e a data digitada o preenche (B1642). As entradas internas e a v1 ficam como estavam.
 * Fuso: TZ=UTC e o "hoje" pelo dia de Brasilia (a regua do motor), como a Etapa 190.
 * Plano: docs/superpowers/plans/2026-11-26-almoxarifado-etapa269-lote-em-inspecao-e-lote-vencido.md (RN-269.10 a 12).
 *
 * Executar: cd server && node tests/api/entradaLoteVencidoAvisa.api.test.js
 */
process.env.TZ = 'UTC';
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
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

const ADMIN = { id: 1, nome: 'Adm 269', role: 'admin', is_superadmin: 1, email: 'a269v@t.com' };
const API = '/api/almoxarifado';
const BR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
// As literais (copiadas do contrato, nao importadas do servico)
const MSG = {
  AVISO_VENCIDO: (c, d) => `O lote ${c} entrou já vencido (validade ${BR(d)}). A saída para consumo fica bloqueada até liberar o vencimento na tela de Lotes e Séries.`,
  AVISO_VENCIDO_LIBERADO: (c, d) => `O lote ${c} entrou já vencido (validade ${BR(d)}); o vencimento já foi liberado para consumo.`,
  AVISO_PREENCHIDA: (c, d) => `O lote ${c} não tinha validade; ela foi gravada agora (${BR(d)}) e vale também para o saldo que já estava nele.`,
};
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);

(async () => {
  console.log('\n=== Etapa 269: entrada num lote vencido avisa ===\n');
  const { app, db, setUser, close } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const post = (u, b = {}) => request(app).post(u).send(b).then((x) => x);

  let seq = 0;
  const material = async () => {
    const c = `V269-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        custo_unitario, controle_serie) VALUES (?, ?, 'UN', 0, 0, 1, 1, 0)`, [c, c])).lastID;
  };
  const lote = (m, codigo) => dbGet(db, 'SELECT * FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m, codigo]);
  const entrada = (m, corpo) => post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: 1, motivo: 'e269', ...corpo });
  const ok201 = (r, o = '') => { assert.strictEqual(r.status, 201, `${o} ${r.status} ${JSON.stringify(r.body)}`); return r; };
  // lote existente com saldo e a validade gravada direto (o lote antigo)
  const loteCom = async (validade) => {
    const m = await material();
    ok201(await entrada(m, { quantidade: 5, lote: 'LV' }));
    await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE material_id = ? AND codigo = ?', [validade, m, 'LV']);
    return m;
  };

  await test('[RN-269.10] lote existente vencido, Entrada pela v2 SEM a validade -> 201 com o aviso de vencido', async () => {
    const venc = dia(-3);
    const m = await loteCom(venc);
    const r = ok201(await entrada(m, { lote: 'LV' }));
    assert.strictEqual(r.body.aviso_validade, MSG.AVISO_VENCIDO('LV', venc));
    assert.strictEqual(Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m])).q), 6);
  });
  await test('[RN-269.10 b] com o vencimento liberado -> o aviso "ja foi liberado"', async () => {
    const venc = dia(-3);
    const m = await loteCom(venc);
    await dbRun(db, "UPDATE lotes_almoxarifado SET vencimento_liberado_em = CURRENT_TIMESTAMP, vencimento_liberado_por = 1, vencimento_liberado_motivo = 't' WHERE material_id = ?", [m]);
    const r = ok201(await entrada(m, { lote: 'LV' }));
    assert.strictEqual(r.body.aviso_validade, MSG.AVISO_VENCIDO_LIBERADO('LV', venc));
  });
  await test('[RN-269.10 c] pelo lote_id (sem o codigo) -> o mesmo aviso', async () => {
    const venc = dia(-1);
    const m = await loteCom(venc);
    const r = ok201(await entrada(m, { lote_id: (await lote(m, 'LV')).id }));
    assert.strictEqual(r.body.aviso_validade, MSG.AVISO_VENCIDO('LV', venc));
  });
  await test('[RN-269.11] sem aviso: vence hoje, validade futura, sem validade, validade em branco, lote novo, sem lote', async () => {
    for (const v of [dia(0), dia(10), null, '', '  ']) {
      // eslint-disable-next-line no-await-in-loop
      const m = await loteCom(v);
      // eslint-disable-next-line no-await-in-loop
      const r = ok201(await entrada(m, { lote: 'LV' }), `validade ${JSON.stringify(v)}`);
      assert.strictEqual(r.body.aviso_validade, undefined, `validade ${JSON.stringify(v)}: ${r.body.aviso_validade}`);
    }
    const m = await material();
    assert.strictEqual(ok201(await entrada(m, { lote: 'NOVO' })).body.aviso_validade, undefined);
    assert.strictEqual(ok201(await entrada(m, {})).body.aviso_validade, undefined);
  });
  await test('[RN-269.11 b] a v1 e o motor sem a opcao (as entradas internas) nao avisam', async () => {
    const m = await loteCom(dia(-3));
    const v1 = await post(`${API}/movimentacoes`, { material_id: m, tipo: 'ENTRADA', quantidade: 1, motivo: 'e269', lote: 'LV' });
    assert.strictEqual(v1.status, 201, JSON.stringify(v1.body));
    assert.strictEqual(v1.body.aviso_validade, undefined);
    const r = await stockService.registrarMovimentacao(db, { ...ADMIN }, { material_id: m, tipo: 'ENTRADA', quantidade: 1, motivo: 'e269', lote: 'LV' });
    assert.strictEqual(r.aviso_validade, undefined);
  });
  await test('[RN-269.11 c] com a mesma data digitada: um aviso so (o da Etapa 190)', async () => {
    const venc = dia(-3);
    const m = await loteCom(venc);
    const r = ok201(await entrada(m, { lote: 'LV', data_validade: venc }));
    assert.strictEqual(r.body.aviso_validade, MSG.AVISO_VENCIDO('LV', venc));
  });
  await test('[RN-269.12] validade em branco com saldo + Entrada com data futura -> 201, preenche, aviso de preenchida, auditoria com o anterior ""', async () => {
    const m = await loteCom('');
    const nova = dia(30);
    const r = ok201(await entrada(m, { lote: 'LV', data_validade: nova }));
    assert.strictEqual(r.body.aviso_validade, MSG.AVISO_PREENCHIDA('LV', nova));
    const l = await lote(m, 'LV');
    assert.strictEqual(String(l.data_validade).slice(0, 10), nova);
    const aud = await dbAll(db, "SELECT dados_anteriores FROM auditoria_log_almoxarifado WHERE entidade = 'lote' AND entidade_id = ? AND acao = 'VALIDADE_PREENCHIDA'", [l.id]);
    assert.strictEqual(aud.length, 1);
    assert.deepStrictEqual(JSON.parse(aud[0].dados_anteriores), { data_validade: '' });
  });
  await test('[RN-269.12 b] validade em branco + data passada -> preenchida + vencido; espacos tambem sao branco', async () => {
    const m = await loteCom('');
    const venc = dia(-2);
    const r = ok201(await entrada(m, { lote: 'LV', data_validade: venc }));
    assert.strictEqual(r.body.aviso_validade, `${MSG.AVISO_PREENCHIDA('LV', venc)} ${MSG.AVISO_VENCIDO('LV', venc)}`);
    const m2 = await loteCom('  ');
    const nova = dia(5);
    const r2 = ok201(await entrada(m2, { lote: 'LV', data_validade: nova }));
    assert.strictEqual(r2.body.aviso_validade, MSG.AVISO_PREENCHIDA('LV', nova));
  });

  if (close) await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
