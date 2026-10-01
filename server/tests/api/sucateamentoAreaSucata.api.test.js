/**
 * Etapa 68, T3 (tronco) — o sucateamento aprovado baixa da AREA DE SUCATA quando ela cobre tudo.
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa68-areas-especiais.md. Vale o D6
 * REVISTO na Fase 2 (sonda68-d6.js / sonda68-bloq.js): a area de sucata EFETIVA (tipo proprio ou do
 * ancestral mais proximo) so vira origem quando o saldo sem lote NELA cobre a quantidade INTEIRA, e
 * entao com `origemEstrita`; senao, o comportamento de hoje (sem origem). Sem dreno parcial: com a
 * origem S nao-estrita, S:4 + P:10 e sucata de 6 gravava "origem S" com 2 vindos de P, e o estorno
 * devolvia 6 para S (material bom jogado na sucata).
 *
 * As duas pernas sao aprovadas PELA ROTA, em ordens diferentes, com usuarios distintos; um cenario
 * entra PELO SERVICO (o default de origem depende de quem chama o motor).
 *
 * Executar: cd server && node tests/api/sucateamentoAreaSucata.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stock = require('../../services/almoxarifado/stockService');
const scrap = require('../../services/almoxarifado/scrapDisposalService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin E68', role: 'admin', is_superadmin: 1, email: 'e68s@test.com' };
const SOLICITANTE = { id: 682, nome: 'Ana Almoxarife', perfil_almoxarifado: 'ALMOXARIFE' };
const APROV_ALM = { id: 683, nome: 'Bia Almoxarife', perfil_almoxarifado: 'ALMOXARIFE' };
const GESTOR = { id: 684, nome: 'Gil Gestor', perfil_almoxarifado: 'GESTOR' };

let seq = 0;
const cod = (p) => `E68S-${p}-${++seq}`;

(async () => {
  console.log('\n=== Etapa 68 T3: sucateamento baixa da area de sucata ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });

  const loc = async (tipo, extra = {}) => (await dbRun(db, `INSERT INTO localizacoes_almoxarifado
      (codigo, tipo, ativo, bloqueada, parent_id) VALUES (?,?,?,?,?)`,
  [cod('L'), tipo, extra.ativo ?? 1, extra.bloqueada || 0, extra.parent || null])).lastID;
  const entrada = (m, destino, q, extra = {}) => stock.registrarMovimentacao(db, ADMIN,
    { material_id: m, tipo: 'ENTRADA', quantidade: q, localizacao_destino_id: destino, justificativa: 'setup e68', ...extra });
  /** Material com padrao P (Prateleira) e os saldos dados: [[locId, q], ...]. */
  const cenario = async (saldos, extra = {}) => {
    const P = extra.P || await loc('Prateleira');
    const m = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, tipo_material, ativo, localizacao_padrao_id)
      VALUES (?, 'Mat E68S', 'UN', 0, 'ACO', 1, ?)`, [cod('M'), P])).lastID;
    for (const [d, q] of saldos(P)) await entrada(m, d, q);
    return { P, m };
  };
  const saldoEm = async (m, l) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND localizacao_id = ?`, [m, l])).q);
  const livro = (movId) => dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [movId]);

  const solicitarRota = async (m, q, extra = {}) => {
    setUser({ ...SOLICITANTE });
    const r = await request(app).post('/api/almoxarifado/sucateamentos')
      .send({ material_id: m, quantidade: q, justificativa: 'sucata e68', ...extra });
    assert.strictEqual(r.status, 201, `solicitar: ${JSON.stringify(r.body)}`);
    return r.body.id;
  };
  const perna = async (id, qual) => {
    setUser(qual === 'gestao' ? { ...GESTOR } : { ...APROV_ALM });
    return request(app).post(`/api/almoxarifado/sucateamentos/${id}/aprovar-${qual === 'gestao' ? 'gestao' : 'almoxarifado'}`).send({});
  };
  /** Aprova as duas pernas pela rota; `ordem` = a primeira perna. Devolve a resposta da 2a. */
  const aprovarRota = async (id, ordem = 'almoxarifado') => {
    const [a, b] = ordem === 'almoxarifado' ? ['almoxarifado', 'gestao'] : ['gestao', 'almoxarifado'];
    const r1 = await perna(id, a);
    assert.strictEqual(r1.status, 200, `1a perna: ${JSON.stringify(r1.body)}`);
    return perna(id, b);
  };
  const movDo = async (id) => (await dbGet(db, 'SELECT movimentacao_sucata_id x FROM sucateamentos_almoxarifado WHERE id = ?', [id])).x;

  await test('RN-08 (rota): S:4 cobre a sucata de 4 → baixa de S (estrita), P intacta, livro com origem S', async () => {
    const S = await loc('Área de sucata');
    const { P, m } = await cenario((p) => [[p, 10], [S, 4]]);
    const id = await solicitarRota(m, 4);
    const r = await aprovarRota(id, 'almoxarifado');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m, S), 0);
    assert.strictEqual(await saldoEm(m, P), 10);
    const mv = await livro(await movDo(id));
    assert.strictEqual(mv.tipo, 'SUCATA');
    assert.strictEqual(mv.localizacao_origem_id, S);
  });

  await test('RN-08 (rota) metade positiva: sem area de sucata com saldo, baixa da padrao como hoje', async () => {
    await loc('Área de sucata'); // area existe, mas sem saldo deste material
    const { P, m } = await cenario((p) => [[p, 10]]);
    const id = await solicitarRota(m, 4);
    const r = await aprovarRota(id, 'gestao');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m, P), 6);
    assert.strictEqual((await livro(await movDo(id))).localizacao_origem_id, null, 'hoje a SUCATA sai sem origem');
  });

  await test('RN-08 (rota): area de sucata BLOQUEADA entre solicitar e aprovar → ignorada, baixa de P, 200', async () => {
    const S = await loc('Área de sucata');
    const { P, m } = await cenario((p) => [[p, 10], [S, 4]]);
    const id = await solicitarRota(m, 4);
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id = ?', [S]);
    const r = await aprovarRota(id, 'gestao');
    assert.strictEqual(r.status, 200, `a aprovacao travou: ${JSON.stringify(r.body)}`);
    assert.strictEqual(await saldoEm(m, S), 4);
    assert.strictEqual(await saldoEm(m, P), 6);
    assert.strictEqual((await livro(await movDo(id))).localizacao_origem_id, null);
  });

  await test('RN-08 revisto (rota): S:4 NAO cobre a sucata de 6 → como hoje (S:4, P:4), e o estorno nao joga nada em S', async () => {
    const S = await loc('Área de sucata');
    const { P, m } = await cenario((p) => [[p, 10], [S, 4]]);
    const id = await solicitarRota(m, 6);
    const r = await aprovarRota(id, 'almoxarifado');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m, S), 4);
    assert.strictEqual(await saldoEm(m, P), 4);
    const movId = await movDo(id);
    assert.notStrictEqual((await livro(movId)).localizacao_origem_id, S, 'livro diria "saiu de S" com 6 de P');
    await stock.cancelarMovimentacao(db, ADMIN, movId, 'estorno e68');
    assert.strictEqual(await saldoEm(m, S), 4, 'o estorno pos material bom na sucata');
    assert.strictEqual(await saldoEm(m, P), 10);
  });

  await test('RN-08 revisto: P bloqueada + S parcial → o 400 de hoje, assinatura compensada', async () => {
    const S = await loc('Área de sucata');
    const { P, m } = await cenario((p) => [[p, 10], [S, 4]]);
    const id = await solicitarRota(m, 6);
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id = ?', [P]);
    const r = await aprovarRota(id, 'almoxarifado');
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    const codP = (await dbGet(db, 'SELECT codigo FROM localizacoes_almoxarifado WHERE id = ?', [P])).codigo;
    assert.strictEqual(r.body.error, `Localização ${codP} está bloqueada`);
    assert.strictEqual(await saldoEm(m, S), 4);
    assert.strictEqual(await saldoEm(m, P), 10);
    const suc = await dbGet(db, 'SELECT status, movimentacao_sucata_id FROM sucateamentos_almoxarifado WHERE id = ?', [id]);
    assert.deepStrictEqual(suc, { status: 'SOLICITADO', movimentacao_sucata_id: null });
  });

  await test('RN-08: duas areas que cobrem → a de MAIOR saldo; empate → a de menor id', async () => {
    const S1 = await loc('Área de sucata'); const S2 = await loc('Área de sucata');
    const a = await cenario((p) => [[p, 10], [S1, 5], [S2, 8]]);
    const ida = await solicitarRota(a.m, 4);
    assert.strictEqual((await aprovarRota(ida)).status, 200);
    assert.strictEqual((await livro(await movDo(ida))).localizacao_origem_id, S2);
    assert.deepStrictEqual([await saldoEm(a.m, S1), await saldoEm(a.m, S2)], [5, 4]);
    // Empate: S3 e S4 com 6 — vence o menor id (S3).
    const S3 = await loc('Área de sucata'); const S4 = await loc('Área de sucata');
    const b = await cenario((p) => [[p, 10], [S4, 6], [S3, 6]]);
    const idb = await solicitarRota(b.m, 4);
    assert.strictEqual((await aprovarRota(idb, 'gestao')).status, 200);
    assert.strictEqual((await livro(await movDo(idb))).localizacao_origem_id, S3);
  });

  await test('RN-08: area de sucata INATIVA com saldo e ignorada (como hoje)', async () => {
    const S = await loc('Área de sucata');
    const { P, m } = await cenario((p) => [[p, 10], [S, 4]]);
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET ativo = 0 WHERE id = ?', [S]);
    const id = await solicitarRota(m, 4);
    assert.strictEqual((await aprovarRota(id)).status, 200);
    assert.strictEqual(await saldoEm(m, S), 4);
    assert.strictEqual(await saldoEm(m, P), 6);
  });

  await test('RN-08 (area EFETIVA): posicao Box dentro da area de sucata cobre → origem e a posicao; espalhado em duas → como hoje', async () => {
    const S = await loc('Área de sucata');
    const B1 = await loc('Box', { parent: S });
    const a = await cenario((p) => [[p, 10], [B1, 4]]);
    const ida = await solicitarRota(a.m, 4);
    assert.strictEqual((await aprovarRota(ida)).status, 200);
    assert.strictEqual((await livro(await movDo(ida))).localizacao_origem_id, B1);
    assert.strictEqual(await saldoEm(a.m, B1), 0);
    // 2 + 2 em duas posicoes da area: nenhuma cobre 4 sozinha → comportamento de hoje (declarado).
    const B2 = await loc('Box', { parent: S }); const B3 = await loc('Box', { parent: S });
    const b = await cenario((p) => [[p, 10], [B2, 2], [B3, 2]]);
    const idb = await solicitarRota(b.m, 4);
    assert.strictEqual((await aprovarRota(idb)).status, 200);
    assert.strictEqual((await livro(await movDo(idb))).localizacao_origem_id, null);
    assert.deepStrictEqual([await saldoEm(b.m, B2), await saldoEm(b.m, B3), await saldoEm(b.m, b.P)], [2, 2, 6]);
  });

  await test('RN-08: sucateamento COM lote fica como hoje (sem origem de area — B204/C72)', async () => {
    const S = await loc('Área de sucata');
    // O lote precisa existir antes da entrada: monta na mao (o `cenario` nao cobre lote).
    const P = await loc('Prateleira');
    const mid = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, tipo_material, ativo, localizacao_padrao_id, controle_lote)
      VALUES (?, 'Mat lote E68S', 'UN', 0, 'ACO', 1, ?, 1)`, [cod('ML'), P])).lastID;
    const loteId = (await dbRun(db, "INSERT INTO lotes_almoxarifado (material_id, codigo, status) VALUES (?,?,'ATIVO')", [mid, cod('LT')])).lastID;
    await entrada(mid, P, 10, { lote_id: loteId });
    await entrada(mid, S, 4, { lote_id: loteId });
    const id = await solicitarRota(mid, 4, { lote_id: loteId });
    const r = await aprovarRota(id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await livro(await movDo(id))).localizacao_origem_id, null);
  });

  await test('RN-08 (SERVICO): solicitar + aprovar as duas pernas direto no scrapDisposalService → origem S', async () => {
    const S = await loc('Área de sucata');
    const { P, m } = await cenario((p) => [[p, 10], [S, 4]]);
    const s = await scrap.solicitar(db, SOLICITANTE, { material_id: m, quantidade: 4, justificativa: 'sucata servico' });
    await scrap.aprovar(db, GESTOR, s.id, 'gestao');
    await scrap.aprovar(db, APROV_ALM, s.id, 'almoxarifado');
    const mv = await livro(await movDo(s.id));
    assert.strictEqual(mv.localizacao_origem_id, S);
    assert.deepStrictEqual([await saldoEm(m, S), await saldoEm(m, P)], [0, 10]);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
