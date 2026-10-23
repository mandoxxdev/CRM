/**
 * Etapa 188 (T2) — a fila de separacao devolve a sugestao de coleta (GET /api/almoxarifado/fila-separacao):
 * `itens[].pegar_em`, `itens[].pegar_em_aviso` e `ordem_coleta` por requisicao. Pela rota, com o requirePermission real.
 *
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa188-sugestao-de-coleta-na-fila-de-separacao.md
 *
 * Executar: cd server && node tests/api/filaSugestaoColeta.api.test.js
 *
 * Fase 5 (M-c): o processo roda em UTC de proposito (TZ fixado ANTES do primeiro Date). O cenario da virada de dia de Brasilia fixa o
 * relogio em 02:30 UTC (23:30 de Brasilia do dia anterior) e abre com uma guarda que DERRUBA o teste se o fuso ou o relogio falso nao
 * pegarem — em vez de passar verde provando nada (regra da skill fechar-etapa).
 */
process.env.TZ = 'UTC';
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOX = { id: 18801, nome: 'Almox 188', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE' };
const PRODUCAO = { id: 18802, nome: 'Chao 188', role: 'usuario' };
const API = '/api/almoxarifado';
let seq = 0;

(async () => {
  console.log('\n=== Etapa 188 (T2): a fila devolve a sugestao de coleta ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);

  const almox = (await dbRun(db, "INSERT INTO almoxarifados (codigo, nome, ativo) VALUES ('ALM188', 'Almox 188', 1)")).lastID;
  const loc = async (codigo, extra = {}) => (await dbRun(db, `INSERT INTO localizacoes_almoxarifado
      (codigo, descricao, ativo, almoxarifado_id, parent_id, tipo) VALUES (?, ?, 1, ?, ?, ?)`,
  [codigo, codigo, almox, extra.parent || null, extra.tipo || 'Prateleira'])).lastID;
  const L = {};
  L.A01 = await loc('ZA-01'); L.A03 = await loc('ZA-03', { parent: L.A01 }); L.B01 = await loc('ZB-01'); L.B02 = await loc('ZB-02');
  L.Q = await loc('ZQ-01', { tipo: 'Área de quarentena/inspeção' });

  const material = async (extra = {}) => {
    const c = `E188-M${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote,
        controle_serie) VALUES (?, ?, 'UN', 0, 1, ?, ?)`, [c, `Mat ${c}`, extra.lote ? 1 : 0, extra.serie ? 1 : 0])).lastID;
  };
  const entrar = async (m, destino, q, extra = {}) => {
    const r = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e188',
      localizacao_destino_id: destino, ...extra });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const req = async (itens, extra = {}) => {
    const r = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, urgencia,
        created_at, ativo) VALUES (?, 1, 'Sol', ?, 'NORMAL', ?, 1)`,
    [`REQ-E188-${++seq}`, extra.status || 'APROVADO', `2026-09-01 10:00:${String(seq % 60).padStart(2, '0')}`])).lastID;
    const ids = [];
    for (const [m, q] of itens) {
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
        quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [r, m, q])).lastID);
    }
    return { id: r, ids };
  };
  const fila = async (user = ADMIN) => {
    setUser(user);
    const r = await request(app).get(`${API}/fila-separacao`);
    setUser(ADMIN);
    return r;
  };
  const daFila = async (id) => {
    const r = await fila();
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const x = r.body.find((f) => f.id === id);
    assert.ok(x, `requisicao ${id} na fila`);
    return x;
  };

  await test('[RN-188.01] material em A-01 (3) e B-02 (10), separavel 5 -> pegar_em B-02 5 cobre', async () => {
    const m = await material();
    await entrar(m, L.A01, 3); await entrar(m, L.B02, 10);
    const R = await req([[m, 5]]);
    const it = (await daFila(R.id)).itens[0];
    assert.strictEqual(it.separavel, 5);
    assert.deepStrictEqual(it.pegar_em, {
      localizacao_id: L.B02, localizacao_codigo: 'ZB-02', caminho: 'ALM188 / ZB-02', lote_id: null, lote_codigo: null,
      lote_validade: null, quantidade_no_endereco: 10, quantidade_sugerida: 5, cobre: true,
    });
    assert.strictEqual(it.pegar_em_aviso, null);
  });

  await test('[RN-188.01] so acrescenta: os campos que existiam continuam todos, com os novos (pegar_em, pegar_em_aviso e, Fase 5, pegar_em_alerta)', async () => {
    const m = await material();
    await entrar(m, L.A01, 4);
    const R = await req([[m, 2]]);
    const f = await daFila(R.id);
    assert.deepStrictEqual(Object.keys(f.itens[0]).sort(), ['a_entregar', 'a_separar', 'disponivel', 'entregavel', 'item_id',
      'lote_separacao_codigo', 'material_codigo', 'material_critico', 'material_id', 'material_nome', 'origem_separacao_codigo',
      'pegar_em', 'pegar_em_alerta', 'pegar_em_aviso', 'separavel', 'unidade']);
    assert.ok(Array.isArray(f.ordem_coleta));
    assert.strictEqual(f.ordem_coleta.length, 1);
  });

  await test('[RN-188.04] so na quarentena -> pegar_em null, SEM_ENDERECO_SUGERIVEL, etapa continua SEPARAR', async () => {
    const m = await material();
    await entrar(m, L.Q, 5);
    const R = await req([[m, 5]]);
    const f = await daFila(R.id);
    assert.deepStrictEqual(f.etapas, ['SEPARAR']);
    assert.strictEqual(f.itens[0].separavel, 5);
    assert.strictEqual(f.itens[0].pegar_em, null);
    assert.strictEqual(f.itens[0].pegar_em_aviso, 'SEM_ENDERECO_SUGERIVEL');
    assert.deepStrictEqual(f.ordem_coleta, []);
  });

  await test('[RN-188.06] tres itens em dois enderecos -> ordem_coleta pelo caminho e itens na ordem do pedido', async () => {
    const m1 = await material(); const m2 = await material(); const m3 = await material();
    await entrar(m1, L.B01, 5); await entrar(m2, L.A03, 5); await entrar(m3, L.A03, 5);
    const R = await req([[m1, 2], [m2, 2], [m3, 2]]);
    const f = await daFila(R.id);
    assert.deepStrictEqual(f.itens.map((i) => i.item_id), R.ids, 'itens na ordem do pedido');
    assert.deepStrictEqual(f.ordem_coleta.map((p) => p.item_id), [R.ids[1], R.ids[2], R.ids[0]], 'ordem_coleta pelo caminho');
    assert.deepStrictEqual(f.ordem_coleta.map((p) => p.caminho), ['ALM188 / ZA-01 / ZA-03', 'ALM188 / ZA-01 / ZA-03', 'ALM188 / ZB-01']);
  });

  await test('[RN-188.03] serie: lote com as series bloqueadas nao e sugerido (emenda I3, quinta consulta)', async () => {
    const m = await material({ lote: true, serie: true });
    await entrar(m, L.B01, 2, { lote: 'S-L1', series: ['S1A', 'S1B'] });
    await entrar(m, L.A01, 3, { lote: 'S-L2', series: ['S2A', 'S2B', 'S2C'] });
    // A entrada manual nao grava a validade do lote: grava aqui (L1 vence antes).
    await dbRun(db, "UPDATE lotes_almoxarifado SET data_validade = CASE codigo WHEN 'S-L1' THEN '2026-11-10' ELSE '2026-12-20' END WHERE material_id = ?", [m]);
    const R = await req([[m, 2]]);
    const antes = (await daFila(R.id)).itens[0].pegar_em;
    assert.strictEqual(antes.lote_codigo, 'S-L1', 'premissa: sem bloqueio o FEFO da L1');
    await dbRun(db, "UPDATE series_almoxarifado SET status = 'BLOQUEADA' WHERE material_id = ? AND numero IN ('S1A', 'S1B')", [m]);
    const it = (await daFila(R.id)).itens[0];
    assert.strictEqual(it.pegar_em.lote_codigo, 'S-L2');
    assert.strictEqual(it.pegar_em.localizacao_codigo, 'ZA-01');
  });

  await test('[RN-188.07] listar duas vezes nao muda nenhuma tabela', async () => {
    const m = await material();
    await entrar(m, L.A01, 6);
    await req([[m, 2], [m, 3]]);
    const tabelas = ['requisicoes_almoxarifado', 'itens_requisicao_almoxarifado', 'estoque_saldo_almoxarifado',
      'reservas_material_almoxarifado', 'materiais_almoxarifado', 'substituicoes_origem_requisicao', 'movimentacoes_almoxarifado'];
    const foto = async () => {
      const out = {};
      for (const t of tabelas) {
        // eslint-disable-next-line no-await-in-loop
        out[t] = JSON.stringify(await dbAll(db, `SELECT * FROM ${t} ORDER BY id`));
      }
      return out;
    };
    const antes = await foto();
    assert.ok(antes.estoque_saldo_almoxarifado.length > 2 && antes.itens_requisicao_almoxarifado.length > 2, 'premissa: tabelas com linhas');
    assert.strictEqual((await fila()).status, 200);
    assert.strictEqual((await fila(ALMOX)).status, 200);
    const depois = await foto();
    for (const t of tabelas) assert.strictEqual(depois[t], antes[t], `${t} mudou`);
  });

  await test('[B821] a divisao nao mudou: 4 livres, dois itens de 4 -> separavel 4 e 0, itens na ordem do pedido, pegar_em so no primeiro', async () => {
    const m = await material();
    await entrar(m, L.B01, 4);
    const R = await req([[m, 4], [m, 4]]);
    const f = await daFila(R.id);
    assert.deepStrictEqual(f.itens.map((i) => i.item_id), R.ids);
    assert.deepStrictEqual(f.itens.map((i) => i.separavel), [4, 0]);
    assert.deepStrictEqual(f.etapas, ['SEPARAR', 'AGUARDANDO_SALDO']);
    assert.strictEqual(f.itens[0].pegar_em.localizacao_codigo, 'ZB-01');
    assert.strictEqual(f.itens[0].pegar_em.quantidade_sugerida, 4);
    assert.deepStrictEqual([f.itens[1].pegar_em, f.itens[1].pegar_em_aviso], [null, null]);
    assert.deepStrictEqual(f.ordem_coleta.map((p) => p.item_id), [R.ids[0]]);
  });

  await test('[M4] APROVACAO_VALOR -> pegar_em null, aviso null, ordem_coleta vazia', async () => {
    const setCfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
      ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
    const m = await material();
    await entrar(m, L.A01, 10);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET custo_unitario = 80, custo_medio = 80 WHERE id = ?', [m]);
    await setCfg('liberacao_valor_ativo', '1'); await setCfg('liberacao_valor_limite', '100');
    try {
      const R = await req([[m, 2]]);
      const f = await daFila(R.id);
      assert.deepStrictEqual(f.etapas, ['APROVACAO_VALOR'], 'premissa');
      assert.deepStrictEqual([f.itens[0].pegar_em, f.itens[0].pegar_em_aviso], [null, null]);
      assert.deepStrictEqual(f.ordem_coleta, []);
    } finally {
      await setCfg('liberacao_valor_ativo', '0');
    }
  });

  await test('[I-a] material em inspecao na padrao (sonda rev188-s1 a): a dica vem com RETENCAO_NO_MATERIAL; sem retencao, sem alerta', async () => {
    const P = await loc('ZRP-01'); const A = await loc('ZRA-01');
    const m = await material();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET localizacao_padrao_id = ? WHERE id = ?', [P, m]);
    await entrar(m, A, 5); await entrar(m, P, 10);
    // 10 em inspecao: a retencao e do MATERIAL — o saldo de ZRP-01 continua 10 e o sistema nao sabe se sao as boas ou as retidas.
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m, tipo: 'QUARENTENA', quantidade: 10, motivo: 'retido',
      justificativa: 'retido' });
    const mm = await dbGet(db, 'SELECT quantidade_atual, quantidade_em_inspecao FROM materiais_almoxarifado WHERE id = ?', [m]);
    assert.deepStrictEqual([mm.quantidade_atual, mm.quantidade_em_inspecao], [15, 10], 'premissa: 15 fisicos, 10 em inspecao');
    const R = await req([[m, 5]]);
    const it = (await daFila(R.id)).itens[0];
    assert.strictEqual(it.separavel, 5);
    assert.strictEqual(it.pegar_em.localizacao_codigo, 'ZRP-01', 'a dica continua (o saldo do endereco existe)');
    assert.strictEqual(it.pegar_em_alerta, 'RETENCAO_NO_MATERIAL');
    // Metade positiva/controle: outro material, mesmo desenho, SEM retencao -> mesma dica, alerta null.
    const m2 = await material();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET localizacao_padrao_id = ? WHERE id = ?', [P, m2]);
    await entrar(m2, A, 5); await entrar(m2, P, 10);
    const R2 = await req([[m2, 5]]);
    const it2 = (await daFila(R2.id)).itens[0];
    assert.strictEqual(it2.pegar_em.localizacao_codigo, 'ZRP-01');
    assert.strictEqual(it2.pegar_em_alerta, null);
  });

  await test('[M-d] planejada bloqueada depois de separar -> pegar_em null, PLANEJADA_INDISPONIVEL (nao "o resto nao cabe la")', async () => {
    const m = await material();
    await entrar(m, L.B01, 3); await entrar(m, L.B02, 10);
    const R = await req([[m, 6]]);
    const sep = await request(app).put(`${API}/requisicoes/${R.id}/separacao`)
      .send({ itens_separados: [{ item_id: R.ids[0], quantidade_separada: 3, localizacao_origem_id: L.B01 }] });
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));
    const antes = (await daFila(R.id)).itens[0];
    assert.deepStrictEqual([antes.separavel, antes.pegar_em, antes.pegar_em_aviso], [3, null, 'PLANEJADA_NAO_COBRE'],
      'premissa: ZB-01 sem livre e um endereco bom -> PLANEJADA_NAO_COBRE');
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id = ?', [L.B01]);
    try {
      const it = (await daFila(R.id)).itens[0];
      assert.strictEqual(it.origem_separacao_codigo, 'ZB-01');
      assert.deepStrictEqual([it.pegar_em, it.pegar_em_aviso], [null, 'PLANEJADA_INDISPONIVEL']);
    } finally {
      await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 0 WHERE id = ?', [L.B01]);
    }
  });

  await test('[M-c] lote vencido nao e sugerido e a virada e a de Brasilia (relogio em 02:30 UTC = 23:30 do dia anterior)', async () => {
    const DateReal = global.Date;
    const INSTANTE = new DateReal('2026-09-17T02:30:00Z');
    class DataFixa extends DateReal {
      constructor(...args) { super(...(args.length ? args : [INSTANTE.getTime()])); }
      static now() { return INSTANTE.getTime(); }
    }
    const m = await material({ lote: true });
    await entrar(m, L.B01, 6, { lote: 'VA' }); await entrar(m, L.A01, 6, { lote: 'VB' }); await entrar(m, L.B02, 6, { lote: 'VC' });
    // VA venceu ontem (15/09); VB vence HOJE em Brasilia (16/09) — no dia UTC (17/09) ja estaria vencido; VC vence em dezembro.
    await dbRun(db, `UPDATE lotes_almoxarifado SET data_validade = CASE codigo WHEN 'VA' THEN '2026-09-15' WHEN 'VB' THEN '2026-09-16'
      ELSE '2026-12-01' END WHERE material_id = ?`, [m]);
    const R = await req([[m, 5]]);
    global.Date = DataFixa;
    try {
      // Guarda: fora deste ambiente o cenario nao sabe falhar — derruba em vez de passar vazio.
      assert.strictEqual(Intl.DateTimeFormat().resolvedOptions().timeZone, 'UTC', 'guarda: o processo tem de rodar em UTC');
      assert.strictEqual(new Date().toISOString().slice(0, 10), '2026-09-17', 'guarda: o relogio falso nao pegou');
      assert.strictEqual(new Date().getDate(), 17, 'guarda: o dia local do processo tem de ser o UTC');
      assert.strictEqual(diaLocal.hojeLocalISO(), '2026-09-16', 'guarda: em Brasilia ainda e 16/09');
      const it = (await daFila(R.id)).itens[0];
      assert.strictEqual(it.separavel, 5);
      assert.notStrictEqual(it.pegar_em.lote_codigo, 'VA', 'lote vencido (15/09) nao pode ser a dica');
      assert.strictEqual(it.pegar_em.lote_codigo, 'VB', 'VB vence hoje em Brasilia: ainda vale e e o FEFO');
      assert.strictEqual(it.pegar_em.localizacao_codigo, 'ZA-01');
      assert.strictEqual(it.pegar_em.lote_validade, '2026-09-16');
    } finally {
      global.Date = DateReal;
    }
  });

  await test('Gate: sem separar_emitir -> 403 (nao muda)', async () => {
    assert.strictEqual((await fila(PRODUCAO)).status, 403);
    assert.strictEqual((await fila(ALMOX)).status, 200);
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
