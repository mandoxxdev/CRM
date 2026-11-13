/**
 * Etapa 218 (Fase 5, revisao das travas; B1452) — quem muda o retido do lote fora da trava do material deixava a separacao com lote
 * escolhido (C513) levar a peca presa. Os dois achados reproduzidos:
 *  - RN-218.22 (F1): cancelar/encerrar remessa rodava o motor (baixa `quantidade_em_terceiros`) e SO DEPOIS, fora da trava, liquidava o
 *    item: no meio, a soma por lote passava do total, a familia "terceiros" deixava de caber (B1436) e TODO lote soltava o retido;
 *  - RN-218.23 (F2): a devolucao ao fornecedor carimbava a inspecao (tira a reprovacao do retido) e so depois o motor baixava o lote.
 * Gancho: so sinaliza e segura; o gesto concorrente (a separacao) e disparado do contexto do TESTE (CLAUDE.md: de dentro do gancho
 * herdaria a secao e passaria direto pela trava).
 *
 * Executar: cd server && node tests/api/loteEscolhidoTravas.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const stockService = require('../../services/almoxarifado/stockService');
const inspectionService = require('../../services/almoxarifado/inspectionService');
const thirdPartyService = require('../../services/almoxarifado/thirdPartyService');
const nonConformityService = require('../../services/almoxarifado/nonConformityService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 218T', role: 'admin', is_superadmin: 1, email: 'a218t@t.com' };
const ALMOX = { id: 21842, nome: 'Almox 218T', role: 'user', email: 'x218t@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('\n=== Etapa 218 (Fase 5): os escritores do retido do lote sob a trava do material ===\n');
  const { app, db, close } = await createTestApp({ user: { ...ADMIN } });
  const alm = await request(app).post(`${API}/almoxarifados`).send({ codigo: 'ALM218T', nome: 'Almox 218T' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  await request(app).post(`${API}/localizacoes`).send({ codigo: 'Z218T-P01', descricao: 'p', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z218T-P01'");
  const material = async () => {
    const c = `E218T-${++seq}`;
    return { id: (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
      material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id) VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, 1, 0, ?)`,
    [c, c, P01.id])).lastID, nome: c };
  };
  const entrar = async (m, q, lote) => {
    const r = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e218t',
      localizacao_destino_id: P01.id, lote });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const loteId = async (m, c) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m.id, c])).id;
  const reqDireta = async (m, q) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E218T-${++seq}`])).lastID;
    const item = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m.id, q])).lastID;
    return { R, item };
  };
  // o gancho: depois (ou antes) do motor do tipo pedido, sinaliza e segura ate o teste soltar
  const gancho = (tipo, depois) => {
    let sinal; const chegou = new Promise((r) => { sinal = r; });
    let soltar; const portao = new Promise((r) => { soltar = r; });
    const orig = stockService.registrarMovimentacao;
    stockService.registrarMovimentacao = async function ganchado(...a) {
      const meu = a[2] && a[2].tipo === tipo;
      if (meu && !depois) { sinal(); await portao; }
      const res = await orig.apply(this, a);
      if (meu && depois) { sinal(); await portao; }
      return res;
    };
    return { chegou, soltar, restaurar: () => { stockService.registrarMovimentacao = orig; } };
  };
  const separar = (R, item, L) => {
    const s = { fim: null };
    s.p = requisitionService.separarRequisicao(db, R, [{ item_id: item, quantidade_separada: 5, localizacao_origem_id: P01.id, lote_id: L }], ALMOX)
      .then(() => 'SEPAROU').catch((e) => `${e.status}: ${e.message}`).then((x) => { s.fim = x; return x; });
    return s;
  };

  await test('[RN-218.22, F1] cancelar a remessa do L2 no meio: a separacao de 5 do L1 (2 no terceiro por outra remessa) espera e recusa "só 3"', async () => {
    const m = await material();
    await entrar(m, 5, 'L1'); await entrar(m, 5, 'L2');
    const L1 = await loteId(m, 'L1'); const L2 = await loteId(m, 'L2');
    const remessa = async (L) => {
      const r = await thirdPartyService.criarRemessa(db, ADMIN, { fornecedor_nome: 'G', tipo_servico: 'Galv', itens: [{ material_id: m.id, quantidade: 2, lote_id: L }] });
      await thirdPartyService.enviarRemessa(db, ADMIN, r.id);
      return r.id;
    };
    await remessa(L1);
    const remB = await remessa(L2);
    const { R, item } = await reqDireta(m, 5);
    const g = gancho('RETORNO_TERCEIRO', true);
    let canc;
    try {
      canc = thirdPartyService.cancelarRemessa(db, ADMIN, remB, { motivo: 'teste 218' });
      await g.chegou;
      const s = separar(R, item, L1);
      await espera(250);
      assert.strictEqual(s.fim, null, `a separacao nao esperou o cancelamento: ${s.fim}`);
      g.soltar();
      await canc;
      const r = await s.p;
      assert.ok(r.startsWith('400: ') && r.includes('no lote L1 há 5 un, mas só 3 podem sair nesta separação'), r);
    } finally { g.restaurar(); g.soltar(); }
  });

  await test('[RN-218.23, F2] devolver ao fornecedor (2 reprovadas do L1) no meio: a separacao de 5 do L1 espera; depois o fisico do par recusa', async () => {
    const m = await material();
    await entrar(m, 5, 'L1');
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m.id, tipo: 'QUARENTENA', quantidade: 5, motivo: 'e218t' });
    const L1 = await loteId(m, 'L1');
    const rec = (await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero) VALUES (?)', [`REC-218T-${++seq}`])).lastID;
    const ri = (await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
      quantidade_recebida, lote_id, quantidade_em_inspecao) VALUES (?,?,5,5,?,5)`, [rec, m.id, L1])).lastID;
    await inspectionService.decidirInspecao(db, ADMIN, ri, { quantidade_aprovada: 3, quantidade_reprovada: 2, observacoes: 'e218t',
      encaminhamento: 'DEVOLVER' });
    await entrar(m, 5, 'L2');
    const nc = await dbGet(db, `SELECT n.id FROM nao_conformidades_almoxarifado n JOIN inspecoes_recebimento_almoxarifado i ON i.id = n.referencia_id
      WHERE i.recebimento_item_id = ?`, [ri]);
    assert.ok(nc, 'premissa: a reprovacao abriu a nao conformidade');
    await nonConformityService.decidirNaoConformidade(db, ADMIN, nc.id, { decisao: 'DEVOLVER', justificativa: 'devolver ao fornecedor 218' });
    const { R, item } = await reqDireta(m, 5);
    const g = gancho('DEVOLUCAO_FORNECEDOR', false);
    let exec;
    try {
      exec = nonConformityService.registrarExecucao(db, ADMIN, nc.id, { observacoes: 'coleta 218' });
      await g.chegou;
      const s = separar(R, item, L1);
      await espera(250);
      assert.strictEqual(s.fim, null, `a separacao levou as reprovadas no meio da devolucao: ${s.fim}`);
      g.soltar();
      await exec;
      const r = await s.p;
      assert.ok(r.startsWith('400: ') && r.includes('O saldo em Z218T-P01 (3) não cobre a quantidade (5)'), r);
    } finally { g.restaurar(); g.soltar(); }
  });

  console.log(`\n${passed} passou, ${failed} falhou\n`);
  terminou = true;
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
