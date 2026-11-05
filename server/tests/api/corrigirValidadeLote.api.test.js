/**
 * Etapa 191 — corrigir a validade de um lote que ja tem saldo (`PUT /api/almoxarifado/lotes/:id/validade`).
 *
 * Hoje a validade gravada nao muda mais (so a "redefinicao" da 190, em lote vazio). Quem digitou 2025 no lugar de 2027 deixava a
 * cola boa barrada na saida, ou o contrario. Esta suite cobre a rota nova: as recusas na ordem do contrato, a permissao
 * `inspecionar` pelo `requirePermission` real, a gravacao com guarda, a liberacao anulada, a auditoria `VALIDADE_CORRIGIDA`
 * (T1) — e a trava por material, os avisos e as literais da 190 (T2).
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');
const trava = require('../../services/almoxarifado/travaPorMaterial');
const diaLocal = require('../../services/diaLocal');

const { MSG_VALIDADE } = lotService;

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };
const QUALIDADE = { id: 81, nome: 'Qualidade Teste', role: 'user', email: 'q@test.com', perfil_almoxarifado: 'QUALIDADE' };
const ALMOXARIFE = { id: 82, nome: 'Almoxarife Teste', role: 'user', email: 'a@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const GESTOR = { id: 83, nome: 'Gestor Teste', role: 'user', email: 'g@test.com', perfil_almoxarifado: 'GESTOR' };
const PRODUCAO = { id: 84, nome: 'Producao Teste', role: 'user', email: 'p@test.com', perfil_almoxarifado: 'PRODUCAO' };

const hoje = () => diaLocal.hojeLocalISO();
const dia = (n) => diaLocal.somarDiasISO(hoje(), n);

let seq = 0;
async function novoMaterial(db) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',0,1)`,
    [`CORRVAL-${seq}`, `Material corrigir validade ${seq}`]);
  return r.lastID;
}
async function loteComSaldo(db, { validade = '2025-03-10', qtd = 10, codigo } = {}) {
  const mat = await novoMaterial(db);
  const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: codigo || `L-${seq}`, data_validade: validade });
  if (qtd) {
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: qtd, lote_id: lote.id, motivo: 'setup' });
  }
  return { mat, lote: await lotService.getLote(db, lote.id) };
}
const saldoDoLote = async (db, loteId) => (await dbGet(db,
  'SELECT COALESCE(SUM(quantidade), 0) as q FROM estoque_saldo_almoxarifado WHERE lote_id = ?', [loteId])).q;
const fisico = async (db, mat) => (await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat])).quantidade_atual;
const auditorias = (db, loteId) => dbAll(db,
  `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'lote' AND entidade_id = ? AND acao = 'VALIDADE_CORRIGIDA' ORDER BY id`,
  [loteId]);
const put = (app, id, body) => request(app).put(`/api/almoxarifado/lotes/${id}/validade`).send(body);
const CORPO = (extra = {}) => ({ data_validade: '2027-03-10', validade_vista: '2025-03-10', justificativa: 'NF diz 2027', ...extra });

(async () => {
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  const comoAdmin = () => setUser(ADMIN);

  // ── T1 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-191.01] corrige lote com saldo pela rota', async () => {
    comoAdmin();
    const { mat, lote } = await loteComSaldo(db);
    const res = await put(app, lote.id, CORPO());
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const banco = await lotService.getLote(db, lote.id);
    assert.strictEqual(banco.data_validade, '2027-03-10');
    assert.strictEqual(await saldoDoLote(db, lote.id), 10);
    assert.strictEqual(await fisico(db, mat), 10);
    assert.deepStrictEqual(res.body.lote, banco);
    assert.ok(Array.isArray(res.body.avisos), 'avisos tem de ser array');
  });

  await test('[RN-191.01] pelo servico tambem', async () => {
    const { lote } = await loteComSaldo(db);
    const r = await lotService.corrigirValidadeDoLote(db, ADMIN, lote.id, CORPO());
    assert.strictEqual(r.lote.data_validade, '2027-03-10');
    assert.strictEqual((await lotService.getLote(db, lote.id)).data_validade, '2027-03-10');
    assert.ok(Array.isArray(r.avisos));
  });

  await test('[RN-191.01] lote sem validade recebe validade', async () => {
    comoAdmin();
    const { lote } = await loteComSaldo(db, { validade: null });
    assert.strictEqual(lote.data_validade, null);
    const res = await put(app, lote.id, CORPO({ validade_vista: null }));
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual((await lotService.getLote(db, lote.id)).data_validade, '2027-03-10');
    const [a] = await auditorias(db, lote.id);
    assert.ok(a, 'sem auditoria');
    assert.strictEqual(JSON.parse(a.dados_anteriores).data_validade, null);
  });

  await test('[RN-191.01] lote BLOQUEADO, REPROVADO e de material inativo', async () => {
    comoAdmin();
    for (const status of ['BLOQUEADO', 'REPROVADO']) {
      const { lote } = await loteComSaldo(db);
      await lotService.mudarStatusLote(db, ADMIN, lote.id, status, 'laudo');
      const res = await put(app, lote.id, CORPO());
      assert.strictEqual(res.status, 200, `${status}: ${JSON.stringify(res.body)}`);
      const banco = await lotService.getLote(db, lote.id);
      assert.strictEqual(banco.status, status, 'status mexido');
      assert.strictEqual(banco.data_validade, '2027-03-10');
    }
    const { mat, lote } = await loteComSaldo(db);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [mat]);
    const res = await put(app, lote.id, CORPO());
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await test('[RN-191.02] quem pode', async () => {
    for (const u of [QUALIDADE, ALMOXARIFE]) {
      const { lote } = await loteComSaldo(db);
      setUser(u);
      const res = await put(app, lote.id, CORPO());
      assert.strictEqual(res.status, 200, `${u.perfil_almoxarifado}: ${JSON.stringify(res.body)}`);
    }
    for (const u of [PRODUCAO, GESTOR]) {
      comoAdmin();
      const { lote } = await loteComSaldo(db);
      setUser(u);
      const res = await put(app, lote.id, CORPO());
      assert.strictEqual(res.status, 403, `${u.perfil_almoxarifado}: ${res.status} ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.error, 'Sem permissão para esta operação');
      assert.strictEqual(res.body.acao, 'inspecionar');
      assert.strictEqual((await lotService.getLote(db, lote.id)).data_validade, '2025-03-10', 'gravou no 403');
      assert.strictEqual((await auditorias(db, lote.id)).length, 0, 'auditou no 403');
    }
    comoAdmin();
  });

  async function recusa(lote, body, status, msg) {
    const res = await put(app, lote.id, body);
    assert.strictEqual(res.status, status, `${JSON.stringify(body)} -> ${res.status} ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error, msg, JSON.stringify(body));
    const banco = await lotService.getLote(db, lote.id);
    assert.strictEqual(banco.data_validade, lote.data_validade, `lote mexido com ${JSON.stringify(body)}`);
    assert.strictEqual((await auditorias(db, lote.id)).length, 0, `auditou com ${JSON.stringify(body)}`);
  }

  await test('[RN-191.03] data', async () => {
    comoAdmin();
    const { lote } = await loteComSaldo(db);
    const semData = CORPO(); delete semData.data_validade;
    await recusa(lote, semData, 400, MSG_VALIDADE.OBRIGATORIA);
    await recusa(lote, CORPO({ data_validade: '' }), 400, MSG_VALIDADE.OBRIGATORIA);
    await recusa(lote, CORPO({ data_validade: null }), 400, MSG_VALIDADE.OBRIGATORIA);
    for (const d of ['10/03/2027', '2027-02-30', 20270310, ['2027-03-10']]) {
      await recusa(lote, CORPO({ data_validade: d }), 400, MSG_VALIDADE.FORMATO);
    }
    for (const d of ['0202-03-10', '2101-01-01']) await recusa(lote, CORPO({ data_validade: d }), 400, MSG_VALIDADE.ANO);
    assert.strictEqual(MSG_VALIDADE.OBRIGATORIA, 'Informe a nova validade do lote (AAAA-MM-DD).');
  });

  await test('[RN-191.04] justificativa', async () => {
    comoAdmin();
    const { lote } = await loteComSaldo(db);
    const sem = CORPO(); delete sem.justificativa;
    await recusa(lote, sem, 400, MSG_VALIDADE.JUSTIFICATIVA);
    await recusa(lote, CORPO({ justificativa: '' }), 400, MSG_VALIDADE.JUSTIFICATIVA);
    await recusa(lote, CORPO({ justificativa: '   ' }), 400, MSG_VALIDADE.JUSTIFICATIVA);
    assert.strictEqual(MSG_VALIDADE.JUSTIFICATIVA,
      'Informe a justificativa da correção da validade — ela fica na auditoria do lote.');
  });

  await test('[RN-191.05] validade_vista', async () => {
    comoAdmin();
    const { lote } = await loteComSaldo(db);
    const sem = CORPO(); delete sem.validade_vista;
    await recusa(lote, sem, 400, MSG_VALIDADE.VISTA_OBRIGATORIA);
    for (const v of [20250310, ['2025-03-10'], { a: 1 }, true]) await recusa(lote, CORPO({ validade_vista: v }), 400, MSG_VALIDADE.VISTA_OBRIGATORIA);
    // "lixo" e string: a vista NAO e validada como data (Fase 2, achado 1) — so nao casa a gravada -> 409
    await recusa(lote, CORPO({ validade_vista: 'lixo' }), 409, MSG_VALIDADE.MUDOU(lote.codigo, '2025-03-10'));
    await recusa(lote, CORPO({ validade_vista: '2025-03-11' }), 409,
      `A validade do lote ${lote.codigo} mudou enquanto a tela estava aberta (agora 10/03/2025). Recarregue e confira antes de corrigir.`);
    await recusa(lote, CORPO({ validade_vista: null }), 409, MSG_VALIDADE.MUDOU(lote.codigo, '2025-03-10'));

    const { lote: semVal } = await loteComSaldo(db, { validade: null });
    await recusa(semVal, CORPO({ validade_vista: '2027-01-01' }), 409,
      `A validade do lote ${semVal.codigo} mudou enquanto a tela estava aberta (agora sem validade). Recarregue e confira antes de corrigir.`);

    // M-2: o recebimento grava `2027-03-10 00:00:00` — a regua e slice(0,10)
    const { lote: m2 } = await loteComSaldo(db);
    await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?', ['2027-03-10 00:00:00', m2.id]);
    const r1 = await put(app, m2.id, CORPO({ data_validade: '2027-04-10', validade_vista: '2027-03-10' }));
    assert.strictEqual(r1.status, 200, `M-2: ${JSON.stringify(r1.body)}`);

    // Fase 2, achado 1: lixo do recebimento gravado direto, a vista igual ao lixo -> 200
    const { lote: lixo } = await loteComSaldo(db);
    await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?', ['31/03/2027', lixo.id]);
    const r2 = await put(app, lixo.id, CORPO({ data_validade: '2027-03-31', validade_vista: '31/03/2027' }));
    assert.strictEqual(r2.status, 200, `lixo: ${JSON.stringify(r2.body)}`);
    assert.strictEqual((await lotService.getLote(db, lixo.id)).data_validade, '2027-03-31');
  });

  await test('[RN-191.06] mesma data', async () => {
    comoAdmin();
    const { lote } = await loteComSaldo(db, { validade: '2027-03-10' });
    await recusa(lote, CORPO({ data_validade: '2027-03-10', validade_vista: '2027-03-10' }), 400,
      `O lote ${lote.codigo} já tem a validade 10/03/2027. Nada a corrigir.`);
    const { lote: m2 } = await loteComSaldo(db);
    await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?', ['2027-03-10 00:00:00', m2.id]);
    const res = await put(app, m2.id, CORPO({ data_validade: '2027-03-10', validade_vista: '2027-03-10' }));
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, MSG_VALIDADE.MESMA(m2.codigo, '2027-03-10'));
  });

  await test('[RN-191.0x] ordem', async () => {
    comoAdmin();
    const inv = await put(app, 99999999, CORPO({ data_validade: null }));
    assert.strictEqual(inv.status, 400, `payload invalido + lote inexistente: ${inv.status} ${JSON.stringify(inv.body)}`);
    assert.strictEqual(inv.body.error, MSG_VALIDADE.OBRIGATORIA);
    const semVista = CORPO(); delete semVista.validade_vista;
    const inv2 = await put(app, 99999999, semVista);
    assert.strictEqual(inv2.status, 400, JSON.stringify(inv2.body));
    const nf = await put(app, 99999999, CORPO());
    assert.strictEqual(nf.status, 404, JSON.stringify(nf.body));
    assert.strictEqual(nf.body.error, 'Lote nao encontrado');
    const abc = await put(app, 'abc', CORPO());
    assert.strictEqual(abc.status, 404, JSON.stringify(abc.body));
    const frac = await put(app, '1.5', CORPO());
    assert.strictEqual(frac.status, 404, JSON.stringify(frac.body));
  });

  await test('[RN-191.09] auditoria', async () => {
    comoAdmin();
    const { lote } = await loteComSaldo(db); // vencido (2025) -> futuro: desvencido
    const res = await put(app, lote.id, CORPO({ justificativa: '  NF 1234 diz 03/2027  ' }));
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const lista = await auditorias(db, lote.id);
    assert.strictEqual(lista.length, 1);
    const [a] = lista;
    assert.strictEqual(a.justificativa, 'NF 1234 diz 03/2027');
    assert.deepStrictEqual(JSON.parse(a.dados_anteriores), {
      data_validade: '2025-03-10', vencimento_liberado_em: null, vencimento_liberado_por: null, vencimento_liberado_motivo: null });
    assert.deepStrictEqual(JSON.parse(a.dados_novos), { data_validade: '2027-03-10', liberacao_anulada: false, desvencido: true });

    // futuro -> futuro: nao desvence
    const { lote: f } = await loteComSaldo(db, { validade: '2027-01-01' });
    assert.strictEqual((await put(app, f.id, CORPO({ data_validade: '2028-01-01', validade_vista: '2027-01-01' }))).status, 200);
    assert.strictEqual(JSON.parse((await auditorias(db, f.id))[0].dados_novos).desvencido, false);
    // vencido -> outro passado: nao desvence
    const { lote: p } = await loteComSaldo(db, { validade: '2025-01-01' });
    assert.strictEqual((await put(app, p.id, CORPO({ data_validade: '2025-02-01', validade_vista: '2025-01-01' }))).status, 200);
    assert.strictEqual(JSON.parse((await auditorias(db, p.id))[0].dados_novos).desvencido, false);
  });

  await test('[RN-191.08] liberacao anulada', async () => {
    comoAdmin();
    const { mat, lote } = await loteComSaldo(db, { validade: '2025-01-10' });
    const lib = await request(app).put(`/api/almoxarifado/lotes/${lote.id}/liberar-vencimento`).send({ justificativa: 'uso ok' });
    assert.strictEqual(lib.status, 200, JSON.stringify(lib.body));
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: mat, tipo: 'SAIDA', quantidade: 1, lote_id: lote.id, justificativa: 'consumo' });

    const res = await put(app, lote.id, CORPO({ data_validade: '2025-01-20', validade_vista: '2025-01-10' }));
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const banco = await lotService.getLote(db, lote.id);
    assert.strictEqual(banco.vencimento_liberado_em, null);
    assert.strictEqual(banco.vencimento_liberado_por, null);
    assert.strictEqual(banco.vencimento_liberado_motivo, null);
    const a = (await auditorias(db, lote.id))[0];
    assert.strictEqual(JSON.parse(a.dados_novos).liberacao_anulada, true);
    assert.strictEqual(JSON.parse(a.dados_anteriores).vencimento_liberado_motivo, 'uso ok');
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, lote_id: lote.id, justificativa: 'consumo' }), /vencid/i);

    const { lote: l1 } = await loteComSaldo(db);
    assert.strictEqual((await put(app, l1.id, CORPO())).status, 200);
    assert.strictEqual(JSON.parse((await auditorias(db, l1.id))[0].dados_novos).liberacao_anulada, false);
  });

  // ── T2 ── (cenarios 13-19 entram aqui)

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
