/**
 * Etapa 128, T6 (integracao, RN-10) — o tempo de recebimento pela ROTA de ponta a ponta: o recebimento criado pelo `POST
 * /recebimentos` (a `data_recebimento` e a do DEFAULT) e entrado pelo `POST /recebimentos/:id/aprovar` ou pelo `/processar` (a
 * `entrada_estoque_em` e a do claim do motor), as horas reescritas no banco para valores conhecidos (nenhuma rota escreve uma hora
 * escolhida) — e o `GET /relatorios/indicadores` igual ao `reportService.relatorioIndicadores` chamado direto. E a nota que falhou no
 * meio (falha injetada no lote do segundo item, depois de o primeiro entrar — a montagem de recebimentoEntradaAtomica) aparece em
 * `incompletos` e, reprocessada, passa a `considerados`.
 *
 * Executar: cd server && node tests/api/tempoRecebimentoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const reportService = require('../../services/almoxarifado/reportService');
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
const ADMIN = { id: 1, nome: 'Admin E128i', role: 'admin', is_superadmin: 1, email: 'e128i@t.com' };
const API = '/api/almoxarifado';
let seq = 0;

(async () => {
  console.log('\n=== Etapa 128 T6: tempo de recebimento pela rota ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const material = async (controleLote = 0) => {
    const c = `E128R-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote)
      VALUES (?, ?, 'PC', 0, 1, ?)`, [c, c, controleLote])).lastID;
  };
  const horas = async (recId, chegou, entrou) => {
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET data_recebimento = datetime('now', ?) WHERE id = ?", [`${chegou} hours`, recId]);
    await dbRun(db, `UPDATE recebimentos_material_itens_almoxarifado SET entrada_estoque_em = datetime('now', ?)
      WHERE recebimento_id = ? AND entrada_estoque_em IS NOT NULL`, [`${entrou} hours`, recId]);
  };
  const ambos = async () => {
    const r = await request(app).get(`${API}/relatorios/indicadores?janela_dias=30`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const direto = (await reportService.relatorioIndicadores(db, { janela_dias: 30 })).tempo_recebimento;
    assert.deepStrictEqual(r.body.tempo_recebimento, direto, 'a rota e o servico');
    return direto;
  };

  await test('[RN-10] criar pela rota -> data_recebimento do DEFAULT; aprovar pela rota -> entrada; o bloco conta 1 (rota = servico)', async () => {
    assert.deepStrictEqual(await ambos(), { media_horas: null, mediana_horas: null, considerados: 0, incompletos: 0 });
    const cr = await request(app).post(`${API}/recebimentos`).send({ nota_fiscal: 'NF-E128R-1', fornecedor_nome: 'F E128',
      itens: [{ material_id: await material(), quantidade: 5 }] });
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    const cab = await dbGet(db, 'SELECT data_recebimento FROM recebimentos_material_almoxarifado WHERE id = ?', [cr.body.id]);
    assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(cab.data_recebimento), `o DEFAULT: ${cab.data_recebimento}`);
    assert.deepStrictEqual(await ambos(), { media_horas: null, mediana_horas: null, considerados: 0, incompletos: 0 }, 'sem entrada nao aparece');
    const ap = await request(app).post(`${API}/recebimentos/${cr.body.id}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    const it = await dbGet(db, 'SELECT entrada_estoque_em FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [cr.body.id]);
    assert.ok(it.entrada_estoque_em, 'o claim do motor marcou a entrada');
    const b = await ambos();
    assert.strictEqual(b.considerados, 1, JSON.stringify(b));
    assert.ok(b.media_horas >= 0 && b.media_horas < 0.1, `entrou logo depois de chegar: ${b.media_horas}`);
    await horas(cr.body.id, -5, -1);
    assert.deepStrictEqual(await ambos(), { media_horas: 4, mediana_horas: 4, considerados: 1, incompletos: 0 });
  });

  await test('[RN-10] a nota que falha no meio (/processar): incompleta; reprocessada pela rota, considerada com a ULTIMA entrada', async () => {
    const a = await material(); const b = await material(1);
    const rec = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F E128', '2026-08-01', '2026-08-02', 100)`, [`REC-E128R-${++seq}`, `NF-E128R-${seq}`])).lastID;
    await dbRun(db, 'INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)', [rec, a, 10, 10]);
    await dbRun(db, 'INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote) VALUES (?,?,?,?,?)', [rec, b, 5, 5, 'LOTE-E128']);
    const original = lotService.criarOuObterLote;
    lotService.criarOuObterLote = async () => { throw Object.assign(new Error('falha simulada no lote do item B'), { status: 400 }); };
    let p1;
    try { p1 = await request(app).post(`${API}/recebimentos/${rec}/processar`).send({}); } finally { lotService.criarOuObterLote = original; }
    assert.strictEqual(p1.status, 400, JSON.stringify(p1.body));
    const st = await dbGet(db, 'SELECT status FROM recebimentos_material_almoxarifado WHERE id = ?', [rec]);
    assert.strictEqual(st.status, 'EM_ENTRADA_NF', 'premissa: a nota continua esperando');
    await horas(rec, -10, -8);
    let blk = await ambos();
    assert.deepStrictEqual([blk.considerados, blk.incompletos], [1, 1], JSON.stringify(blk));
    assert.strictEqual(blk.media_horas, 4, 'o incompleto nao entra na media');
    const p2 = await request(app).post(`${API}/recebimentos/${rec}/processar`).send({});
    assert.strictEqual(p2.status, 200, JSON.stringify(p2.body));
    await dbRun(db, "UPDATE recebimentos_material_itens_almoxarifado SET entrada_estoque_em = datetime('now', '-2 hours') WHERE recebimento_id = ? AND material_id = ?", [rec, b]);
    blk = await ambos();
    assert.deepStrictEqual(blk, { media_horas: 6, mediana_horas: 6, considerados: 2, incompletos: 0 }, 'a ULTIMA entrada (T-2h) e o fim: 8 h; media (4 + 8) / 2');
  });

  terminou = true;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
