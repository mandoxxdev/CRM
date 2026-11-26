/**
 * Etapa 266 (B1255, D (250) 4; B1628-B1630) — a dica da Fila de separacao ("Pegar em") divide o saldo de cada prateleira entre as
 * requisicoes, na ordem em que a Fila as mostra: o que foi indicado as da frente desconta para as de tras. Antes duas requisicoes do
 * mesmo material recebiam a mesma prateleira e a segunda era recusada ao separar (sonda da Fase 0). A janela de separacao
 * (GET /requisicoes/:id/sugestao-coleta) le a fila inteira e devolve o mesmo.
 *
 * RN-266.10 a RN-266.14. Plano: docs/superpowers/plans/2026-11-26-almoxarifado-etapa266-entrega-confere-lote-e-dica-da-fila.md
 * Executar: cd server && node tests/api/dicaDaFilaDivideAsPrateleiras.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 266', role: 'admin', is_superadmin: 1, email: 'a266@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 266: a dica da Fila divide as prateleiras entre as requisicoes ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');

  const alm = await ok(request(app).post(`${API}/almoxarifados`).send({ codigo: 'ALM266F', nome: 'Almox 266' }), 201);
  const prateleira = async (codigo) => {
    await ok(request(app).post(`${API}/localizacoes`).send({ codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' }), 201);
    return (await dbGet(db, 'SELECT id FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo])).id;
  };
  const SA = await prateleira('SA-01');
  const SB = await prateleira('SB-01');

  // Cada cenario usa material proprio (a fila e global: os materiais nao se misturam) e limpa as requisicoes do anterior.
  const material = async (saldos) => {
    const c = `F266-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote) VALUES (?, ?, 'PC', 0, 0, 1, 0, 0.1, 0)`, [c, c])).lastID;
    for (const [destino, q] of saldos) {
      // eslint-disable-next-line no-await-in-loop
      await ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: id, tipo: 'ENTRADA', quantidade: q, motivo: 'f266',
        localizacao_destino_id: destino }), 201);
    }
    return id;
  };
  const requisicao = async (m, q, { urgencia = 'NORMAL', necessidade = null } = {}) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, urgencia,
      data_necessidade) VALUES (?, 1, 'Sol', 'APROVADO', ?, ?)`, [`R266-${++seq}`, urgencia, necessidade])).lastID;
    const item = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m, q])).lastID;
    return { R, item };
  };
  const limpar = () => dbRun(db, 'UPDATE requisicoes_almoxarifado SET ativo = 0');
  const fila = async () => (await ok(request(app).get(`${API}/fila-separacao`))).body;
  const daFila = (f, R) => {
    const x = f.find((y) => y.id === R);
    assert.ok(x, `requisicao ${R} na fila`);
    return x.itens[0];
  };
  const dica = (it) => [it.pegar_em ? it.pegar_em.localizacao_codigo : null, it.pegar_em ? it.pegar_em.quantidade_sugerida : null,
    it.pegar_em_aviso];
  const janela = async (R) => (await ok(request(app).get(`${API}/requisicoes/${R}/sugestao-coleta`))).body.itens[0];
  const separarPelaDica = (R, it) => request(app).put(`${API}/requisicoes/${R}/separacao`).send({ itens_separados: [{
    item_id: it.item_id, quantidade_separada: it.pegar_em.quantidade_sugerida, localizacao_origem_id: it.pegar_em.localizacao_id }] });

  await test('[RN-266.10, RN-266.14] SA-01 3 e SB-01 3; R1 NORMAL e R2 URGENTE: R2 SA-01, R1 SB-01; a janela igual; separar as duas -> 200 e 200', async () => {
    await limpar();
    const m = await material([[SA, 3], [SB, 3]]);
    const r1 = await requisicao(m, 3);
    const r2 = await requisicao(m, 3, { urgencia: 'URGENTE' });
    const f = await fila();
    assert.deepStrictEqual(f.map((x) => x.id), [r2.R, r1.R], 'premissa: a URGENTE na frente');
    assert.deepStrictEqual(dica(daFila(f, r2.R)), ['SA-01', 3, null]);
    assert.deepStrictEqual(dica(daFila(f, r1.R)), ['SB-01', 3, null]);
    assert.strictEqual(daFila(f, r1.R).pegar_em.cobre, true);
    assert.deepStrictEqual(f.find((x) => x.id === r1.R).ordem_coleta.map((p) => p.localizacao_codigo), ['SB-01']);
    // RN-266.13: a janela de cada uma devolve o que a Fila mostra.
    assert.deepStrictEqual((await janela(r1.R)).pegar_em, daFila(f, r1.R).pegar_em);
    assert.deepStrictEqual((await janela(r2.R)).pegar_em, daFila(f, r2.R).pegar_em);
    // RN-266.14: a de tras separa primeiro (a dica e so dica) e a da frente depois — as duas passam.
    await ok(separarPelaDica(r1.R, daFila(f, r1.R)));
    await ok(separarPelaDica(r2.R, daFila(f, r2.R)));
    const depois = await fila();
    for (const R of [r1.R, r2.R]) {
      const x = depois.find((y) => y.id === R);
      assert.ok(x.etapas.includes('ENTREGAR'), JSON.stringify(x.etapas));
      assert.deepStrictEqual([x.itens[0].pegar_em, x.itens[0].pegar_em_aviso], [null, null]);
    }
  });

  await test('[RN-266.11] mesma urgencia: a de necessidade mais cedo fica com SA-01, mesmo criada depois', async () => {
    await limpar();
    const m = await material([[SA, 3], [SB, 3]]);
    const tarde = await requisicao(m, 3, { necessidade: '2026-12-20' });
    const cedo = await requisicao(m, 3, { necessidade: '2026-12-10' });
    const f = await fila();
    assert.deepStrictEqual(dica(daFila(f, cedo.R)), ['SA-01', 3, null]);
    assert.deepStrictEqual(dica(daFila(f, tarde.R)), ['SB-01', 3, null]);
  });

  await test('[RN-266.11] a requisicao na alcada de valor (sem dica) nao desconta: a de tras dela fica com SA-01', async () => {
    await limpar();
    const m = await material([[SA, 3], [SB, 3]]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET custo_unitario = 80, custo_medio = 80 WHERE id = ?', [m]);
    const caro = await requisicao(m, 3, { urgencia: 'URGENTE' }); // 240 > 100
    const normal = await requisicao(m, 3);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET data_aprovacao_valor = '2026-11-26 10:00:00' WHERE id = ?", [normal.R]);
    await cfg('liberacao_valor_ativo', '1'); await cfg('liberacao_valor_limite', '100');
    try {
      const f = await fila();
      assert.deepStrictEqual(f.find((x) => x.id === caro.R).etapas, ['APROVACAO_VALOR'], 'premissa: na alcada');
      assert.deepStrictEqual(dica(daFila(f, caro.R)), [null, null, null]);
      assert.deepStrictEqual(dica(daFila(f, normal.R)), ['SA-01', 3, null]);
    } finally {
      await cfg('liberacao_valor_ativo', '0');
    }
  });

  await test('[RN-266.12, RN-266.13] so SA-01 3: a de tras sem prateleira, SALDO_INDICADO_A_OUTRAS — na Fila e na janela', async () => {
    await limpar();
    const m = await material([[SA, 3]]);
    const r1 = await requisicao(m, 3);
    const r2 = await requisicao(m, 3, { urgencia: 'URGENTE' });
    const f = await fila();
    assert.deepStrictEqual(dica(daFila(f, r2.R)), ['SA-01', 3, null]);
    assert.deepStrictEqual(dica(daFila(f, r1.R)), [null, null, 'SALDO_INDICADO_A_OUTRAS']);
    assert.strictEqual(daFila(f, r1.R).separavel, 3, 'o separavel nao muda (a dica e so dica)');
    assert.deepStrictEqual(f.find((x) => x.id === r1.R).ordem_coleta, []);
    const j = await janela(r1.R);
    assert.deepStrictEqual([j.pegar_em, j.pegar_em_aviso], [null, 'SALDO_INDICADO_A_OUTRAS']);
    // a da frente separa: o saldo de SA-01 fica separado para ela — a de tras passa a ter separavel 0 e nenhuma dica.
    await ok(separarPelaDica(r2.R, daFila(f, r2.R)));
    const depois = daFila(await fila(), r1.R);
    assert.deepStrictEqual([depois.separavel, depois.pegar_em, depois.pegar_em_aviso], [0, null, null]);
  });

  await test('[RN-266.10, servico] listarFilaSeparacao direto da a mesma divisao que a rota', async () => {
    await limpar();
    const m = await material([[SA, 3], [SB, 3]]);
    const r1 = await requisicao(m, 3);
    const r2 = await requisicao(m, 3, { urgencia: 'URGENTE' });
    const f = await requisitionService.listarFilaSeparacao(db, ADMIN);
    assert.deepStrictEqual(dica(daFila(f, r2.R)), ['SA-01', 3, null]);
    assert.deepStrictEqual(dica(daFila(f, r1.R)), ['SB-01', 3, null]);
    const s = await requisitionService.sugestaoDeColetaDaRequisicao(db, ADMIN, r1.R);
    assert.strictEqual(s.itens[0].pegar_em.localizacao_codigo, 'SB-01');
  });

  terminou = true;
  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
