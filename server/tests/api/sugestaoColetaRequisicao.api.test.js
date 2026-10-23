/**
 * Etapa 189 (T1) — a sugestao de coleta de UMA requisicao (GET /api/almoxarifado/requisicoes/:id/sugestao-coleta): o recorte da fila
 * para a requisicao, pelo mesmo codigo (listarFilaSeparacao filtrada). Pela rota, com o requirePermission real.
 *
 * Plano: docs/superpowers/plans/2026-10-23-almoxarifado-etapa189-lista-de-coleta-e-pre-selecao-do-sai-de.md
 * (RN-189.01 e o recongelamento da Execucao: o recorte leva tambem pegar_em_alerta — I3 da Fase 2).
 *
 * Executar: cd server && node tests/api/sugestaoColetaRequisicao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOX = { id: 18901, nome: 'Almox 189', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE' };
const PRODUCAO = { id: 18902, nome: 'Chao 189', role: 'usuario' };
const API = '/api/almoxarifado';
let seq = 0;

const recorte = (f) => ({
  requisicao_id: f.id,
  itens: f.itens.map((i) => ({ item_id: i.item_id, separavel: i.separavel, pegar_em: i.pegar_em, pegar_em_aviso: i.pegar_em_aviso,
    pegar_em_alerta: i.pegar_em_alerta })),
  ordem_coleta: f.ordem_coleta,
});

(async () => {
  console.log('\n=== Etapa 189 (T1): a sugestao de coleta por requisicao ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);

  const almox = (await dbRun(db, "INSERT INTO almoxarifados (codigo, nome, ativo) VALUES ('ALM189', 'Almox 189', 1)")).lastID;
  const loc = async (codigo, extra = {}) => (await dbRun(db, `INSERT INTO localizacoes_almoxarifado
      (codigo, descricao, ativo, almoxarifado_id, parent_id, tipo) VALUES (?, ?, 1, ?, ?, ?)`,
  [codigo, codigo, almox, extra.parent || null, extra.tipo || 'Prateleira'])).lastID;
  const L = {};
  L.A01 = await loc('WA-01'); L.A03 = await loc('WA-03', { parent: L.A01 }); L.B01 = await loc('WB-01'); L.B02 = await loc('WB-02');

  const material = async () => {
    const c = `E189-M${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote,
        controle_serie) VALUES (?, ?, 'UN', 0, 1, 0, 0)`, [c, `Mat ${c}`])).lastID;
  };
  const entrar = async (m, destino, q) => {
    const r = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e189',
      localizacao_destino_id: destino });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  // urgencia: a fila ordena por urgencia antes da chegada — o cenario 1 usa isso para a pedida NAO ser a primeira da fila.
  const req = async (itens, extra = {}) => {
    const r = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, urgencia,
        created_at, ativo) VALUES (?, 1, 'Sol', ?, ?, ?, 1)`,
    [`REQ-E189-${++seq}`, extra.status || 'APROVADO', extra.urgencia || 'NORMAL',
      `2026-09-01 10:00:${String(seq % 60).padStart(2, '0')}`])).lastID;
    const ids = [];
    for (const [m, q] of itens) {
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
        quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [r, m, q])).lastID);
    }
    return { id: r, ids };
  };
  const fila = async () => {
    const r = await request(app).get(`${API}/fila-separacao`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const sugestao = async (id, user = ADMIN) => {
    setUser(user);
    const r = await request(app).get(`${API}/requisicoes/${id}/sugestao-coleta`);
    setUser(ADMIN);
    return r;
  };

  await test('[RN-189.01] igual a fila: duas requisicoes (duas paradas com alerta; PLANEJADA_NAO_COBRE) -> o recorte campo a campo, a pedida nao e a primeira da fila', async () => {
    // R1 (CRITICO): dois itens em duas paradas, um deles com material retido (alerta RETENCAO_NO_MATERIAL).
    const m1 = await material(); const m2 = await material();
    await entrar(m1, L.B01, 5); await entrar(m2, L.A03, 8);
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m2, tipo: 'QUARENTENA', quantidade: 2, motivo: 'retido',
      justificativa: 'retido' });
    const R1 = await req([[m1, 2], [m2, 3]], { urgencia: 'CRITICO' });
    // R2 (NORMAL): separado 3 de WB-02 (planejada), WB-02 sem livre e WA-01 com 10 -> PLANEJADA_NAO_COBRE.
    const m3 = await material();
    await entrar(m3, L.B02, 3); await entrar(m3, L.A01, 10);
    const R2 = await req([[m3, 6]]);
    const sep = await request(app).put(`${API}/requisicoes/${R2.id}/separacao`)
      .send({ itens_separados: [{ item_id: R2.ids[0], quantidade_separada: 3, localizacao_origem_id: L.B02 }] });
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));

    const f = await fila();
    const i1 = f.findIndex((x) => x.id === R1.id); const i2 = f.findIndex((x) => x.id === R2.id);
    assert.ok(i1 >= 0 && i2 > i1, `premissa: R1 antes de R2 na fila (${i1}, ${i2})`);
    const f1 = f[i1]; const f2 = f[i2];
    assert.strictEqual(f1.ordem_coleta.length, 2, 'premissa: R1 com duas paradas');
    assert.strictEqual(f1.itens[1].pegar_em_alerta, 'RETENCAO_NO_MATERIAL', 'premissa: alerta no segundo item de R1');
    assert.strictEqual(f2.itens[0].pegar_em_aviso, 'PLANEJADA_NAO_COBRE', 'premissa: R2 com PLANEJADA_NAO_COBRE');

    const s2 = await sugestao(R2.id);
    assert.strictEqual(s2.status, 200, JSON.stringify(s2.body));
    assert.deepStrictEqual(s2.body, recorte(f2));
    const s1 = await sugestao(R1.id);
    assert.strictEqual(s1.status, 200, JSON.stringify(s1.body));
    assert.deepStrictEqual(s1.body, recorte(f1));
    assert.deepStrictEqual(Object.keys(s1.body.itens[0]).sort(), ['item_id', 'pegar_em', 'pegar_em_alerta', 'pegar_em_aviso', 'separavel']);
  });

  await test('[RN-189.01] fora da fila (ENTREGUE) -> itens [] e ordem_coleta []; so ENTREGAR -> itens com pegar_em null e ordem_coleta []', async () => {
    const m = await material();
    await entrar(m, L.A01, 5);
    const E = await req([[m, 2]], { status: 'ENTREGUE' });
    const s = await sugestao(E.id);
    assert.strictEqual(s.status, 200, JSON.stringify(s.body));
    assert.deepStrictEqual(s.body, { requisicao_id: E.id, itens: [], ordem_coleta: [] });

    const R = await req([[m, 2]]);
    const sep = await request(app).put(`${API}/requisicoes/${R.id}/separacao`)
      .send({ itens_separados: [{ item_id: R.ids[0], quantidade_separada: 2 }] });
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));
    const f = (await fila()).find((x) => x.id === R.id);
    assert.ok(f && f.etapas.includes('ENTREGAR') && !f.etapas.includes('SEPARAR'), `premissa: so ENTREGAR (${f && f.etapas})`);
    const s2 = await sugestao(R.id);
    assert.strictEqual(s2.status, 200, JSON.stringify(s2.body));
    assert.strictEqual(s2.body.itens.length, 1);
    assert.deepStrictEqual([s2.body.itens[0].item_id, s2.body.itens[0].separavel, s2.body.itens[0].pegar_em], [R.ids[0], 0, null]);
    assert.deepStrictEqual(s2.body.ordem_coleta, []);
    assert.deepStrictEqual(s2.body, recorte(f));
  });

  await test('[RN-189.01] 404: inexistente, inativa e "abc" -> a literal do detalhe', async () => {
    const m = await material();
    const I = await req([[m, 1]]);
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET ativo = 0 WHERE id = ?', [I.id]);
    for (const id of [999999, I.id, 'abc', '1.5']) {
      // eslint-disable-next-line no-await-in-loop
      const r = await sugestao(id);
      assert.strictEqual(r.status, 404, `${id}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.deepStrictEqual(r.body, { error: 'Requisição não encontrada' }, String(id));
    }
  });

  await test('Gate: sem separar_emitir (PRODUCAO) -> 403 com a literal e a acao; ALMOXARIFE -> 200', async () => {
    const m = await material();
    await entrar(m, L.A01, 3);
    const R = await req([[m, 1]]);
    const r = await sugestao(R.id, PRODUCAO);
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Sem permissão para esta operação');
    assert.strictEqual(r.body.acao, 'separar_emitir');
    const ok = await sugestao(R.id, ALMOX);
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  });

  await test('[RN-188.07] so leitura: pedir a sugestao duas vezes nao muda nenhuma tabela', async () => {
    const m = await material();
    await entrar(m, L.A01, 6);
    const R = await req([[m, 2], [m, 3]]);
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
    assert.strictEqual((await sugestao(R.id)).status, 200);
    assert.strictEqual((await sugestao(R.id, ALMOX)).status, 200);
    assert.deepStrictEqual(await foto(), antes);
  });

  await test('[B821] a fila sem o parametro nao mudou: 4 livres, dois itens de 4 -> separavel 4 e 0 na ordem do pedido (o [127 RN-10]); a rota igual', async () => {
    const m = await material();
    await entrar(m, L.B01, 4);
    const R = await req([[m, 4], [m, 4]]);
    const f = (await requisitionService.listarFilaSeparacao(db, ADMIN)).find((x) => x.id === R.id);
    assert.deepStrictEqual(f.itens.map((i) => [i.item_id, i.separavel]), [[R.ids[0], 4], [R.ids[1], 0]]);
    assert.deepStrictEqual(f.etapas, ['SEPARAR', 'AGUARDANDO_SALDO']);
    const s = await sugestao(R.id);
    assert.deepStrictEqual(s.body, recorte(f));
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
