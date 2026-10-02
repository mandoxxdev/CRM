/**
 * Etapa 75 (T0) — o miolo da reserva na chegada com teto injetado, e a retomada que nao reconta o
 * item ja inspecionado (D8/B390).
 *
 * Fase 0 (Surpresa 2): depois da inspecao o item tem `quantidade_em_inspecao = 0`, entao chamar a
 * funcao da 74 de novo para a nota contava o item INTEIRO como livre — inclusive o reprovado — e o
 * teto `min(livre, disponivel)` completava com saldo de ajuste (aprovou 1, reservou 4). A retomada
 * da nota (molde da 74 RN-08: a primeira execucao falha antes do gancho) tem o mesmo furo.
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa75-inspecao-libera-reserva.md
 *
 * Executar: cd server && node tests/api/reservaLiberacaoBase.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { execFileSync } = require('child_process');
const path = require('path');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const lotService = require('../../services/almoxarifado/lotService');
const reservaChegadaService = require('../../services/almoxarifado/reservaChegadaService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Faturista 75', role: 'admin', is_superadmin: 1, email: 'fat75@t.com' };
const QUALIDADE = { id: 7503, nome: 'Inspetora 75', perfil_almoxarifado: 'QUALIDADE', email: 'q75@t.com' };
const API = '/api/almoxarifado';
let seq = 0;

(async () => {
  console.log('\n=== Etapa 75 (T0): miolo com teto e retomada sem recontar o inspecionado ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('F75B','75000000000275','ativo')")).lastID;
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };

  const material = async ({ critico = 0 } = {}) => {
    const c = `E75B-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'PC', 0, 0, 1, ?, ?)`, [c, `Mat ${c}`, forn, critico])).lastID;
  };
  const entradaManual = async (m, q) => {
    const e = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'setup 75' });
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
  };
  const reqDireta = async (status, itens) => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo)
      VALUES (?, 7501, 'Sol 75', ?, 'NORMAL', ?, 1)`,
    [`REQ-E75B-${++seq}`, status, `2026-09-01 10:${String(seq % 60).padStart(2, '0')}:00`])).lastID;
    for (const [m, q] of itens) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada)
        VALUES (?,?,?)`, [id, m, q]);
    }
    return id;
  };
  async function notaDireta(linhas) {
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F75B', '2026-09-01', '2026-09-02', 10)`, [`REC-E75B-${++seq}`, `NF-E75B-${seq}`])).lastID;
    for (const [m, q, lote] of linhas) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
        (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote) VALUES (?,?,?,?,?)`, [r, m, q, q, lote || null]);
    }
    return r;
  }
  const processar = (recId) => request(app).post(`${API}/recebimentos/${recId}/processar`).send({});
  const itemRec = (rec, m) => dbGet(db, 'SELECT id, quantidade_em_inspecao FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? AND material_id = ?', [rec, m]);
  const inspecionar = (itemId, a, r) => as(QUALIDADE, () => request(app).post(`${API}/recebimentos/itens/${itemId}/inspecionar`)
    .send({ quantidade_aprovada: a, quantidade_reprovada: r, encaminhamento: r > 0 ? 'DEVOLVER' : undefined }));
  const ativasDe = async (reqId, m) => (await dbAll(db, `SELECT quantidade, observacoes FROM reservas_material_almoxarifado
    WHERE requisicao_id = ? AND material_id = ? AND status = 'ATIVA' ORDER BY id`, [reqId, m]));
  const daChegada = async (m) => dbAll(db, `SELECT requisicao_id, quantidade FROM reservas_material_almoxarifado
    WHERE material_id = ? AND observacoes LIKE 'Reserva na chegada%'`, [m]);
  const saldo = (m) => dbGet(db, `SELECT quantidade_atual q, quantidade_em_inspecao i, quantidade_bloqueada b
    FROM materiais_almoxarifado WHERE id = ?`, [m]);

  await cfg('inspecao_material_critico', '1');
  try {
    // ══════════════ RN-07 (parte D8), pelo servico ══════════════
    await test('[RN-07/D8] nota mista: depois da inspecao 1/3, chamar a reserva da chegada de novo NAO reserva o critico (saldo alheio); o comum que ainda falta SIM', async () => {
      const crit = await material({ critico: 1 }); const comum = await material();
      const V1 = await reqDireta('AGUARDANDO_ESTOQUE', [[crit, 4]]);
      const V2 = await reqDireta('AGUARDANDO_ESTOQUE', [[comum, 2]]);
      const rec = await notaDireta([[crit, 4], [comum, 5]]);
      assert.strictEqual((await processar(rec)).status, 200);
      assert.deepStrictEqual((await ativasDe(V2, comum)).map((x) => Number(x.quantidade)), [2], 'premissa: a 74 reservou o comum livre');
      assert.deepStrictEqual(await daChegada(crit), [], 'premissa: o retido nao se reserva na chegada (74 RN-03)');
      await entradaManual(crit, 5); // saldo livre de ajuste do critico: e o que a funcao antiga completava
      const it = await itemRec(rec, crit);
      assert.strictEqual(Number(it.quantidade_em_inspecao), 4);
      const ins = await inspecionar(it.id, 1, 3);
      assert.strictEqual(ins.status, 201, JSON.stringify(ins.body));
      assert.deepStrictEqual({ ...(await saldo(crit)) }, { q: 9, i: 0, b: 3 });
      // Uma requisicao NOVA do comum (os 3 livres da nota ainda estao la) — a retomada a atende.
      const V3 = await reqDireta('AGUARDANDO_ESTOQUE', [[comum, 3]]);

      const r = await reservaChegadaService.reservarChegadaParaQuemEspera(db, ADMIN, rec);

      assert.deepStrictEqual(await daChegada(crit), [], 'D8: o item inspecionado nao conta como livre da nota');
      assert.ok(!r.reservas.some((x) => x.material_id === crit), JSON.stringify(r));
      assert.deepStrictEqual((await ativasDe(V3, comum)).map((x) => Number(x.quantidade)), [3], 'o comum livre continua sendo distribuido');
      assert.ok((await ativasDe(V3, comum))[0].observacoes.startsWith('Reserva na chegada do recebimento REC-E75B-'), 'literal da 74 inalterada');
      assert.deepStrictEqual((await ativasDe(V2, comum)).map((x) => Number(x.quantidade)), [2], 'quem ja tinha nao ganha de novo');
    });

    // ══════════════ RN-07 (parte D8), pela rota: a retomada de verdade ══════════════
    await test('[RN-07/D8] retomada pela rota: a 1a execucao falha antes do gancho, o critico e inspecionado (1/3), a 2a execucao reserva o comum e NAO o critico', async () => {
      const crit = await material({ critico: 1 }); const comum = await material();
      const W1 = await reqDireta('AGUARDANDO_ESTOQUE', [[crit, 4]]);
      const W2 = await reqDireta('AGUARDANDO_ESTOQUE', [[comum, 3]]);
      const rec = await notaDireta([[crit, 4], [comum, 3, 'L-E75B']]);
      const original = lotService.criarOuObterLote;
      lotService.criarOuObterLote = async () => { throw Object.assign(new Error('falha simulada no lote 75'), { status: 400 }); };
      try {
        assert.strictEqual((await processar(rec)).status, 400);
      } finally { lotService.criarOuObterLote = original; }
      const it = await itemRec(rec, crit);
      assert.strictEqual(Number(it.quantidade_em_inspecao), 4, 'premissa: o critico entrou retido na 1a execucao');
      assert.deepStrictEqual(await ativasDe(W2, comum), [], 'premissa: a nota nao terminou, o gancho nao rodou');
      await entradaManual(crit, 5);
      const ins = await inspecionar(it.id, 1, 3);
      assert.strictEqual(ins.status, 201, JSON.stringify(ins.body));

      const p2 = await processar(rec);
      assert.strictEqual(p2.status, 200, JSON.stringify(p2.body));

      assert.deepStrictEqual(await daChegada(crit), [], 'D8: a retomada nao reconta o item inspecionado como livre');
      const totalCrit = (await ativasDe(W1, crit)).reduce((s, x) => s + Number(x.quantidade), 0);
      assert.ok(totalCrit <= 1 + 1e-9, `W1 nunca passa do que a inspecao aprovou (1): ${totalCrit}`);
      assert.deepStrictEqual((await ativasDe(W2, comum)).map((x) => Number(x.quantidade)), [3]);
    });
  } finally { await cfg('inspecao_material_critico', '0'); }

  // ══════════════ carga fria nas duas ordens ══════════════
  await test('[carga] reservaChegadaService e inspectionService carregam a frio nas duas ordens (sem ciclo)', async () => {
    const dir = path.join(__dirname, '../../services/almoxarifado');
    for (const ordem of [['reservaChegadaService', 'inspectionService'], ['inspectionService', 'reservaChegadaService']]) {
      const js = ordem.map((n) => `const ${n} = require(${JSON.stringify(path.join(dir, n))});`).join('')
        + "if (typeof reservaChegadaService.reservarChegadaParaQuemEspera !== 'function') throw new Error('rcs incompleto');"
        + "if (typeof inspectionService.decidirInspecao !== 'function') throw new Error('ins incompleto');"
        + "console.log('ok');";
      const out = execFileSync(process.execPath, ['-e', js], { encoding: 'utf8' }).trim();
      assert.strictEqual(out.split('\n').pop(), 'ok', ordem.join(' -> '));
    }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
