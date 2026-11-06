/**
 * Etapa 202 (T1) — a rota antiga de movimentacao (v1, POST /api/almoxarifado/movimentacoes) respeita o lote informado.
 *
 * Ate a 202 a v1 desestruturava so `material_id, tipo, quantidade, motivo, referencia, observacoes`: um sistema de fora que mandava
 * "tire 1 do lote LV" (vencido) recebia 201, a peca saia "de lugar nenhum" e a linha "Sem lote atribuido" do saldo por lote ficava
 * negativa (C458). Agora a v1 repassa `lote`, `lote_id` e `data_validade` ao motor (B1350), com a forma de `lote`/`lote_id` validada
 * pelo schema da v2 (B1351), `null`/vazio = sem lote (B1352), e — Fase 2 — SEM repassar nada de lote no AJUSTE (o AJUSTE com lote
 * deixa a linha do lote negativa no motor: C475, documentado aqui pela v2).
 *
 * Cuidado com teste vazio: a saida com lote bom TAMBEM dava 201 antes (saia sem lote) — so o livro (`lote_id`/`lote`) e as linhas
 * de `estoque_saldo_almoxarifado` distinguem. Todo cenario confere o livro e as linhas, nao so o status.
 *
 * Plano: docs/superpowers/plans/2026-11-05-almoxarifado-etapa202-rota-antiga-respeita-o-lote.md
 * Executar: cd server && node tests/api/movimentacaoV1Lote.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const ADMIN = { id: 1, nome: 'Adm 202', role: 'admin', is_superadmin: 1, email: 'a202@t.com' };
const V1 = '/api/almoxarifado/movimentacoes';
const V2 = '/api/almoxarifado/movimentacoes/v2';
const PASSADO = '2020-01-01';
const FUTURO = '2099-12-31';
// JSON nao leva chave undefined: os cenarios de chave mandam motivo, referencia e observacoes, para as 9 aparecerem.
const CHAVES_201 = ['id', 'material_id', 'tipo', 'quantidade', 'saldo_anterior', 'saldo_posterior', 'motivo', 'referencia',
  'observacoes'].sort();
const MSG_VENCIDO = (c, d) => `Lote ${c} vencido em ${d} nao pode sair para consumo. Libere o vencimento do lote (PUT `
  + '/api/almoxarifado/lotes/:id/liberar-vencimento) com justificativa, ou baixe por SUCATA/PERDA ou corrija por AJUSTE.';

(async () => {
  console.log('\n=== Etapa 202 (T1): a v1 respeita o lote ===\n');
  const { app, db } = await createTestApp({ user: { ...ADMIN } });
  const v1 = (corpo) => request(app).post(V1).send(corpo);
  const v2 = (corpo) => request(app).post(V2).send(corpo);

  let seq = 0;
  const material = async (controle = false) => {
    const c = `V1L-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote)
      VALUES (?, ?, 'UN', 0, 1, ?)`, [c, c, controle ? 1 : 0])).lastID;
  };
  const entrada = (m, quantidade, extra = {}) => stockService.registrarMovimentacao(db, ADMIN, {
    material_id: m, tipo: 'ENTRADA', quantidade, motivo: 'setup 202', ...extra });
  const loteDe = async (m, codigo) => dbGet(db, 'SELECT * FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m, codigo]);
  const linhaLote = async (m, loteId) => Number((await dbGet(db,
    'SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id = ?', [m, loteId])).q);
  const linhaSemLote = async (m) => Number((await dbGet(db,
    'SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id IS NULL', [m])).q);
  const fisico = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m])).q);
  const nLivro = async (m) => (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ?', [m])).n;
  const ultima = async (m) => dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id DESC LIMIT 1', [m]);
  const foto = async (m, ...lotes) => ({
    fisico: await fisico(m), semLote: await linhaSemLote(m), livro: await nLivro(m),
    lotes: await Promise.all(lotes.map((l) => linhaLote(m, l.id))),
  });

  // Cenario-base: material SEM controle de lote; LV vencido com 5, LB bom com 5, 3 sem lote (fisico 13).
  const cenario = async () => {
    const m = await material(false);
    await entrada(m, 5, { lote: 'LV', data_validade: PASSADO });
    await entrada(m, 5, { lote: 'LB', data_validade: FUTURO });
    await entrada(m, 3);
    return { m, LV: await loteDe(m, 'LV'), LB: await loteDe(m, 'LB') };
  };
  const recusaSemEfeito = async (m, lotes, corpo, msg) => {
    const antes = await foto(m, ...lotes);
    const r = await v1({ material_id: m, ...corpo });
    assert.strictEqual(r.status, 400, `esperava 400, veio ${r.status}: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, msg);
    assert.deepStrictEqual(await foto(m, ...lotes), antes, 'a recusa mexeu em estoque ou no livro');
  };

  // ── RN-202.01 — saida citando lote vencido e recusada ────────────────────────────────────────────────────────────────────
  await test('[RN-202.01] saida v1 com lote_id de lote vencido -> 400 vencido, nada gravado', async () => {
    const { m, LV, LB } = await cenario();
    await recusaSemEfeito(m, [LV, LB], { tipo: 'SAIDA', quantidade: 1, motivo: 'consumo', lote_id: LV.id }, MSG_VENCIDO('LV', PASSADO));
    assert.strictEqual(await linhaLote(m, LV.id), 5);
  });
  await test('[RN-202.01] saida v1 com lote (codigo) vencido -> 400 vencido, nada gravado', async () => {
    const { m, LV, LB } = await cenario();
    await recusaSemEfeito(m, [LV, LB], { tipo: 'SAIDA', quantidade: 1, motivo: 'consumo', lote: 'LV' }, MSG_VENCIDO('LV', PASSADO));
  });

  // ── RN-202.02 — saida citando lote bom sai do lote ───────────────────────────────────────────────────────────────────────
  for (const via of ['codigo', 'id']) {
    await test(`[RN-202.02] saida v1 com lote bom (por ${via}) sai do lote; a linha sem lote nao muda`, async () => {
      const { m, LV, LB } = await cenario();
      const r = await v1({ material_id: m, tipo: 'SAIDA', quantidade: 1, motivo: 'consumo', ...(via === 'id' ? { lote_id: LB.id } : { lote: 'LB' }) });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      assert.strictEqual(await fisico(m), 12);
      assert.strictEqual(await linhaLote(m, LB.id), 4, 'a peca nao saiu do lote LB');
      assert.strictEqual(await linhaLote(m, LV.id), 5);
      assert.strictEqual(await linhaSemLote(m), 3, 'a linha sem lote mudou (C458)');
      const mov = await ultima(m);
      assert.strictEqual(mov.id, r.body.id);
      assert.strictEqual(mov.lote_id, LB.id);
      assert.strictEqual(mov.lote, 'LB');
    });
  }

  // ── RN-202.03 — as recusas de lote do motor chegam pela v1 ───────────────────────────────────────────────────────────────
  await test('[RN-202.03] saida v1 com lote (codigo) inexistente -> 400 "Lote nao encontrado para este material"', async () => {
    const { m, LV, LB } = await cenario();
    await recusaSemEfeito(m, [LV, LB], { tipo: 'SAIDA', quantidade: 1, motivo: 'x', lote: ' NAOEXISTE ' },
      'Lote nao encontrado para este material: NAOEXISTE');
    assert.strictEqual(await loteDe(m, 'NAOEXISTE'), undefined, 'a saida inventou o lote');
  });
  await test('[RN-202.03] saida v1 com lote_id inexistente -> 400 "Lote nao encontrado"', async () => {
    const { m, LV, LB } = await cenario();
    await recusaSemEfeito(m, [LV, LB], { tipo: 'SAIDA', quantidade: 1, motivo: 'x', lote_id: 99999999 }, 'Lote nao encontrado');
  });
  await test('[RN-202.03] saida v1 com lote_id de outro material -> 400 "pertence a outro material"', async () => {
    const { m, LV, LB } = await cenario();
    const outro = await cenario();
    await recusaSemEfeito(m, [LV, LB], { tipo: 'SAIDA', quantidade: 1, motivo: 'x', lote_id: outro.LB.id },
      'O lote informado pertence a outro material');
    assert.strictEqual(await linhaLote(outro.m, outro.LB.id), 5);
  });
  await test('[RN-202.03] saida v1 com lote BLOQUEADO -> 400 "esta bloqueado"', async () => {
    const { m, LV, LB } = await cenario();
    await dbRun(db, "UPDATE lotes_almoxarifado SET status = 'BLOQUEADO' WHERE id = ?", [LB.id]);
    await recusaSemEfeito(m, [LV, LB], { tipo: 'SAIDA', quantidade: 1, motivo: 'x', lote_id: LB.id },
      'Lote LB esta bloqueado e nao pode ser utilizado');
  });
  await test('[RN-202.03] saida v1 maior que o lote -> 400 "Saldo insuficiente no lote", fisico revertido', async () => {
    const { m, LV, LB } = await cenario();
    await recusaSemEfeito(m, [LV, LB], { tipo: 'SAIDA', quantidade: 6, motivo: 'x', lote: 'LB' },
      'Saldo insuficiente no lote LB. Disponível: 5 UN');
  });

  // ── RN-202.04 — forma do lote = a da v2; null/vazio = sem lote ───────────────────────────────────────────────────────────
  for (const [campo, valor, msg] of [
    ['lote_id', '12', 'Dados inválidos — lote_id: Invalid input: expected number, received string'],
    ['lote_id', 0, 'Dados inválidos — lote_id: Too small: expected number to be >0'],
    ['lote_id', 1.5, 'Dados inválidos — lote_id: Invalid input: expected int, received number'],
    ['lote', 5, 'Dados inválidos — lote: Invalid input: expected string, received number'],
  ]) {
    await test(`[RN-202.04] forma: ${campo} = ${JSON.stringify(valor)} -> 400 literal do zod, nada gravado`, async () => {
      const { m, LV, LB } = await cenario();
      await recusaSemEfeito(m, [LV, LB], { tipo: 'SAIDA', quantidade: 1, motivo: 'x', [campo]: valor }, msg);
    });
  }
  for (const [campo, valor] of [['lote', null], ['lote_id', null], ['lote', ''], ['lote', '   ']]) {
    await test(`[RN-202.04] ${campo} = ${JSON.stringify(valor)} -> sem lote (201, livro sem lote)`, async () => {
      const { m, LV, LB } = await cenario();
      const r = await v1({ material_id: m, tipo: 'SAIDA', quantidade: 1, motivo: 'x', [campo]: valor });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      const mov = await ultima(m);
      assert.strictEqual(mov.lote_id, null);
      assert.strictEqual(mov.lote, null, `o livro gravou lote ${JSON.stringify(mov.lote)}`);
      assert.strictEqual(await linhaLote(m, LB.id), 5);
      assert.strictEqual(await linhaLote(m, LV.id), 5);
      assert.strictEqual(await fisico(m), 12);
    });
  }
  await test('[RN-202.04] data_validade: null numa SAIDA -> ausente (201)', async () => {
    const { m } = await cenario();
    const r = await v1({ material_id: m, tipo: 'SAIDA', quantidade: 1, motivo: 'x', data_validade: null });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  });

  // ── Ordem das recusas: tipo e motivo vem antes da forma do lote ──────────────────────────────────────────────────────────
  await test('[ordem] tipo invalido com lote_id em texto -> a recusa do tipo (como hoje), nao a do zod', async () => {
    const { m, LV, LB } = await cenario();
    await recusaSemEfeito(m, [LV, LB], { tipo: 'XPTO', quantidade: 1, motivo: 'x', lote_id: '12' },
      'Tipo inválido. Use ENTRADA, SAIDA, AJUSTE ou DEVOLUCAO');
  });
  await test('[ordem] saida sem motivo com lote_id em texto -> a recusa do motivo (como hoje)', async () => {
    const { m, LV, LB } = await cenario();
    await recusaSemEfeito(m, [LV, LB], { tipo: 'SAIDA', quantidade: 1, lote_id: '12' }, 'Motivo é obrigatório para saída e ajuste');
  });

  // ── B1350 (Fase 2): as recusas de validade do motor chegam pela v1 ───────────────────────────────────────────────────────
  await test('[B1350] data_validade em formato errado numa entrada -> 400 FORMATO, lote nao criado', async () => {
    const { m, LV, LB } = await cenario();
    await recusaSemEfeito(m, [LV, LB], { tipo: 'ENTRADA', quantidade: 2, lote: 'LF', data_validade: '31/03/2027' },
      lotService.MSG_VALIDADE.FORMATO);
    assert.strictEqual(await loteDe(m, 'LF'), undefined, 'o lote nasceu de uma entrada recusada');
  });
  await test('[B1350] data_validade numa SAIDA -> 400 SO_ENTRADA', async () => {
    const { m, LV, LB } = await cenario();
    await recusaSemEfeito(m, [LV, LB], { tipo: 'SAIDA', quantidade: 1, motivo: 'x', lote: 'LB', data_validade: FUTURO },
      lotService.MSG_VALIDADE.SO_ENTRADA);
  });
  await test('[B1350] data_validade sem lote -> 400 SEM_LOTE', async () => {
    const { m, LV, LB } = await cenario();
    await recusaSemEfeito(m, [LV, LB], { tipo: 'ENTRADA', quantidade: 1, data_validade: FUTURO }, lotService.MSG_VALIDADE.SEM_LOTE);
  });
  await test('[B1350] data_validade com lote so de espacos -> 400 SEM_LOTE (espacos = sem lote)', async () => {
    const { m, LV, LB } = await cenario();
    await recusaSemEfeito(m, [LV, LB], { tipo: 'ENTRADA', quantidade: 1, lote: '  ', data_validade: FUTURO },
      lotService.MSG_VALIDADE.SEM_LOTE);
  });
  await test('[B1350] data_validade diferente da de um lote vivo -> 400 CONFLITO', async () => {
    const { m, LV, LB } = await cenario();
    await recusaSemEfeito(m, [LV, LB], { tipo: 'ENTRADA', quantidade: 1, lote: 'LB', data_validade: '2098-01-01' },
      lotService.MSG_VALIDADE.CONFLITO('LB', FUTURO));
  });

  // ── RN-202.05 — material com controle de lote ────────────────────────────────────────────────────────────────────────────
  await test('[RN-202.05] controle_lote: sem lote pela v1 continua 400 "exige lote"', async () => {
    const m = await material(true);
    const r = await v1({ material_id: m, tipo: 'ENTRADA', quantidade: 10, motivo: 'sem lote' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.match(r.body.error, /exige lote/);
    assert.strictEqual(await fisico(m), 0);
  });
  await test('[RN-202.05] controle_lote: ENTRADA v1 com lote cria o lote; SAIDA v1 com lote_id sai dele', async () => {
    const m = await material(true);
    const e = await v1({ material_id: m, tipo: 'ENTRADA', quantidade: 10, lote: 'LC' });
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
    const LC = await loteDe(m, 'LC');
    assert.ok(LC, 'o lote nao foi criado');
    assert.strictEqual(await linhaLote(m, LC.id), 10);
    assert.strictEqual((await ultima(m)).lote_id, LC.id);
    const s = await v1({ material_id: m, tipo: 'SAIDA', quantidade: 3, motivo: 'consumo', lote_id: LC.id });
    assert.strictEqual(s.status, 201, JSON.stringify(s.body));
    assert.strictEqual(await linhaLote(m, LC.id), 7);
    assert.strictEqual(await linhaSemLote(m), 0);
    assert.strictEqual(await fisico(m), 7);
    assert.strictEqual((await ultima(m)).lote_id, LC.id);
  });

  // ── RN-202.06 — entrada com lote novo cria o lote com a validade ─────────────────────────────────────────────────────────
  await test('[RN-202.06] ENTRADA v1 com lote novo e data_validade -> lote nasce com a validade', async () => {
    const m = await material(false);
    const r = await v1({ material_id: m, tipo: 'ENTRADA', quantidade: 4, lote: 'LN', data_validade: '2027-03-31' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const LN = await loteDe(m, 'LN');
    assert.ok(LN, 'o lote nao foi criado');
    assert.strictEqual(LN.data_validade, '2027-03-31');
    assert.strictEqual(await linhaLote(m, LN.id), 4);
  });
  await test('[RN-202.06] DEVOLUCAO v1 com lote novo tambem cria o lote', async () => {
    const m = await material(false);
    const r = await v1({ material_id: m, tipo: 'DEVOLUCAO', quantidade: 2, lote: 'LD' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const LD = await loteDe(m, 'LD');
    assert.ok(LD, 'o lote nao foi criado');
    assert.strictEqual(await linhaLote(m, LD.id), 2);
  });

  // ── RN-202.07 / 08 — sem lote, tudo igual; a resposta 201 ────────────────────────────────────────────────────────────────
  await test('[RN-202.07] corpo do modal (sem lote) -> 201 como hoje, sem lote no livro', async () => {
    const m = await material(false);
    const r = await v1({ material_id: m, tipo: 'ENTRADA', quantidade: 3, motivo: 'modal', referencia: 'REF-1', observacoes: 'obs' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual(Object.keys(r.body).sort(), CHAVES_201);
    assert.strictEqual(r.body.saldo_posterior, 3);
    assert.strictEqual((await ultima(m)).lote_id, null);
  });
  await test('[RN-202.08] resposta 201 com lote citado: as 9 chaves de hoje (sem aviso quando o motor nao avisa)', async () => {
    const { m, LB } = await cenario();
    const r = await v1({ material_id: m, tipo: 'SAIDA', quantidade: 1, motivo: 'x', lote_id: LB.id, referencia: 'R', observacoes: 'O' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual(Object.keys(r.body).sort(), CHAVES_201);
    assert.strictEqual(r.body.material_id, m);
    assert.strictEqual(r.body.tipo, 'SAIDA');
    assert.strictEqual(r.body.saldo_anterior, 13);
    assert.strictEqual(r.body.saldo_posterior, 12);
  });
  await test('[RN-202.08] resposta 201 ecoa aviso_validade quando o motor avisa (entrada de lote ja vencido)', async () => {
    const m = await material(false);
    const r = await v1({ material_id: m, tipo: 'ENTRADA', quantidade: 2, lote: 'LVV', data_validade: PASSADO, motivo: 'm', referencia: 'R', observacoes: 'O' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual(Object.keys(r.body).sort(), [...CHAVES_201, 'aviso_validade'].sort());
    assert.strictEqual(r.body.aviso_validade, lotService.MSG_VALIDADE.AVISO_VENCIDO('LVV', PASSADO));
  });

  // ── RN-202.09 — C474 consertado: material_id em texto com lote_id do proprio material ────────────────────────────────────
  await test('[RN-202.09, C474] material_id em texto + lote_id do proprio material -> 201, sai do lote', async () => {
    const { m, LB } = await cenario();
    const r = await v1({ material_id: String(m), tipo: 'SAIDA', quantidade: 1, motivo: 'x', lote_id: LB.id });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await linhaLote(m, LB.id), 4);
    assert.strictEqual((await ultima(m)).lote_id, LB.id);
  });
  await test('[RN-202.09, C474] material_id em texto + lote_id de OUTRO material -> continua 400', async () => {
    const { m, LV, LB } = await cenario();
    const outro = await cenario();
    await recusaSemEfeito(m, [LV, LB], { material_id: String(m), tipo: 'SAIDA', quantidade: 1, motivo: 'x', lote_id: outro.LB.id },
      'O lote informado pertence a outro material');
  });

  // ── Fase 2 (item 1): AJUSTE pela v1 nao repassa lote; C475 documentado pela v2 ──────────────────────────────────────────
  await test('[Fase 2, AJUSTE] AJUSTE v1 com lote_id -> igual a hoje: livro sem lote, linha do lote intocada', async () => {
    const { m, LV, LB } = await cenario();
    const r = await v1({ material_id: m, tipo: 'AJUSTE', quantidade: 12, motivo: 'contagem', lote_id: LB.id, data_validade: FUTURO });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const mov = await ultima(m);
    assert.strictEqual(mov.lote_id, null, 'o AJUSTE da v1 repassou o lote (C475 aberto pela v1)');
    assert.strictEqual(mov.lote, null);
    assert.strictEqual(await linhaLote(m, LB.id), 5);
    assert.strictEqual(await linhaLote(m, LV.id), 5);
    assert.strictEqual(await fisico(m), 12);
  });
  await test('[Fase 2, AJUSTE] AJUSTE v1 com lote_id em texto -> nao e julgado (igual a hoje, 201)', async () => {
    const { m } = await cenario();
    const r = await v1({ material_id: m, tipo: 'AJUSTE', quantidade: 12, motivo: 'contagem', lote_id: 'abc' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  });
  await test('[C475, documenta] AJUSTE v2 com lote_id: a linha do lote fica negativa (defeito do motor, nao consertado)', async () => {
    const m = await material(false);
    await entrada(m, 5, { lote: 'LB', data_validade: FUTURO });
    await entrada(m, 3);
    const LB = await loteDe(m, 'LB');
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 1, motivo: 'contagem', justificativa: 'contagem', lote_id: LB.id });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await fisico(m), 1);
    // Se um dia o motor consertar o AJUSTE com lote, este teste muda junto (e o C475 fecha).
    assert.ok(await linhaLote(m, LB.id) < 0, `C475 mudou: linha do LB = ${await linhaLote(m, LB.id)}`);
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
