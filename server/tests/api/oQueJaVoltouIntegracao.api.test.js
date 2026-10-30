/**
 * Etapa 121 (C253, C252; B783, B784) — integracao: a nota processada com a Auditoria falhando reserva para quem esperava, a
 * entrega sai, as pecas voltam por uma Entrada avulsa, e a devolucao citando a entrega nao devolve de novo — pela rota e pelo
 * servico. Cruza Recebimento (processar), Requisicoes (separar, entregar, excluir), Movimentacoes (Entrada v2), Cadastro (o
 * desligar da serie), Devolucoes (lista, devolucao citando e avulsa).
 *
 * Executar: cd server && node tests/api/oQueJaVoltouIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
// Etapa 193 (RN-193.02): PUT, DELETE e foto de /api/almoxarifado/materiais recusam para todos por padrao (o cadastro e so do
// Compras). Este arquivo prova o handler e as guardas que ficam ATRAS da recusa pela porta do almoxarifado (os perfis do
// almoxarifado, as guardas de estoque de quem pode), com a chave de reversao ligada (`ALMOX_CADASTRO_MATERIAL=liberado`,
// services/compras/cadastroDeMaterial.js) — sem ela nenhum desses gestos tem porta (letra C). A recusa: cadastroSoNoCompras.
process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const returnService = require('../../services/almoxarifado/returnService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const OUTRO = { id: 2, nome: 'Outro Teste', role: 'admin', is_superadmin: 1, email: 'outro@test.com' };
const API = '/api/almoxarifado';
const ACIMA = (s, q, d, v, r) => `Devolução acima do entregue: a saída ${s} entregou ${q}, já foram devolvidos ${d}, `
  + `${v} ${v > 1 ? 'já voltaram' : 'já voltou'} ao estoque por uma entrada que não cita esta saída e restam ${r}`;
const VOLTARAM = (nome) => `${nome}: as séries desta entrega já voltaram ao estoque por uma Entrada — excluir a requisição `
  + 'devolveria o saldo de novo. Encerre a requisição em vez de excluir.';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });

  /** O INSERT da Auditoria com `entidade`/`acao` falha uma vez. */
  async function comAuditoriaFalhando(entidade, acao, fn) {
    const original = db.run;
    let disparou = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && sql.includes('INSERT INTO auditoria_log_almoxarifado')
        && Array.isArray(params) && params[0] === entidade && params[2] === acao) {
        disparou = true;
        setImmediate(() => cb.call({}, new Error(`falha forcada da auditoria ${entidade}/${acao} (teste)`)));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res;
    try { res = await fn(); } finally { db.run = original; }
    assert.ok(disparou, `gancho da auditoria ${entidade}/${acao} nao disparou`);
    return res;
  }

  const forn = (await dbRun(db,
    "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Fornecedor OJV121','12100000000122','ativo')")).lastID;
  const nome = 'OJV121-1';
  const m = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
    custo_unitario, ativo, fornecedor_id, controle_serie) VALUES (?, ?, 'PC', 0, 0, 10, 1, ?, 1)`, [nome, nome, forn])).lastID;
  const fisico = async () => (await dbGet(db, 'SELECT quantidade_atual f FROM materiais_almoxarifado WHERE id = ?', [m])).f;
  const serieIds = async () => (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m]))
    .map((x) => x.id);
  let S; let R;

  console.log('\n=== Etapa 121: integracao — o que ja voltou e a Auditoria depois do ato ===\n');

  await test('(i) pela rota: nota com a Auditoria falhando reserva; entrega; volta avulsa; a devolucao citando recusa; a avulsa vale uma vez', async () => {
    // Requisicao de 2 aprovada sem estoque.
    setUser(OUTRO);
    const rq = await request(app).post(`${API}/requisicoes`).send({ os_referencia: 'OS-OJV121', itens: [{ material_id: m, quantidade: 2 }] });
    setUser(SUPER);
    assert.ok([200, 201].includes(rq.status), `requisicao ${rq.status} ${JSON.stringify(rq.body)}`);
    R = rq.body.id || rq.body.requisicao?.id;
    assert.strictEqual((await request(app).put(`${API}/requisicoes/${R}/aprovar`).send({})).status, 200);
    assert.strictEqual((await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status, 'AGUARDANDO_ESTOQUE');
    // A nota com V1 e V2, processada com a Auditoria PROCESSAR_NOTA falhando (C252): 200 e a reserva nasce.
    const rec = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal, fornecedor_nome,
      data_emissao_nf, data_entrada_nf, valor_total_nota) VALUES ('REC-OJV121', 'EM_ENTRADA_NF', 'NF-OJV121', 'F-OJV121',
      '2026-09-01', '2026-09-02', 20)`)).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
      quantidade_recebida, series) VALUES (?, ?, 2, 2, ?)`, [rec, m, 'V1\nV2']);
    const pr = await comAuditoriaFalhando('recebimento', 'PROCESSAR_NOTA',
      () => request(app).post(`${API}/recebimentos/${rec}/processar`).send({}));
    assert.strictEqual(pr.status, 200, `a nota processada respondeu erro: ${pr.status} ${JSON.stringify(pr.body)}`);
    assert.strictEqual(await fisico(), 2);
    assert.strictEqual((await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status, 'TOTALMENTE_RESERVADA',
      'a reserva de quem esperava nao nasceu');
    // Separar e entregar com V1 e V2: a Saida S da requisicao.
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R])).id;
    await requisitionService.separarRequisicao(db, R, [{ item_id: item, quantidade_separada: 2 }], SUPER);
    const en = await request(app).put(`${API}/requisicoes/${R}/entregar`)
      .send({ itens_atendidos: [{ item_id: item, quantidade_atendida: 2, serie_ids: await serieIds() }] });
    assert.strictEqual(en.status, 200, `entrega: ${JSON.stringify(en.body)}`);
    S = (await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo LIKE 'SAIDA%' ORDER BY id DESC LIMIT 1",
      [R])).id;
    assert.strictEqual(await fisico(), 0);
    // As pecas voltam por uma Entrada avulsa; o Administrador desliga a serie.
    const e2 = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m, tipo: 'ENTRADA', quantidade: 2,
      series: ['V1', 'V2'], motivo: 'ojv121', justificativa: 'ojv121', documento_vinculado: 'NF-OJV121b' });
    assert.strictEqual(e2.status, 201, JSON.stringify(e2.body));
    assert.strictEqual((await request(app).put(`${API}/materiais/${m}`).send({ controle_serie: false })).status, 200);
    // A tela de Devolucoes: S com 0 a devolver; a devolucao citando S recusa (C253).
    const lista = (await request(app).get(`${API}/devolucoes/saidas-elegiveis?material_id=${m}`)).body;
    const el = lista.find((x) => x.id === S);
    assert.ok(el, `a entrega sumiu da lista: ${JSON.stringify(lista)}`);
    assert.deepStrictEqual({ saldo: el.saldo_devolvivel, reentrada: el.quantidade_reentrada }, { saldo: 0, reentrada: 2 });
    const dv = await request(app).post(`${API}/devolucoes`).send({ material_id: m, quantidade: 2, motivo: 'SOBRA_PROJETO',
      destino: 'ESTOQUE', movimentacao_saida_id: S });
    assert.strictEqual(dv.status, 400, `a devolucao contou em dobro: ${JSON.stringify(dv.body)} fisico=${await fisico()}`);
    assert.strictEqual(dv.body.error, ACIMA(S, 2, 0, 2, 0));
    assert.strictEqual(await fisico(), 2);
    // Os gestos seguintes continuam coerentes: a exclusao da requisicao recusa (B780).
    const ex = await request(app).delete(`${API}/requisicoes/${R}`).send({ justificativa: 'ojv121' });
    assert.strictEqual(ex.status, 400, JSON.stringify(ex.body));
    assert.strictEqual(ex.body.error, VOLTARAM(nome));
    assert.strictEqual(await fisico(), 2);
    // A devolucao avulsa de 1 com a Auditoria devolucao/CRIACAO falhando (C252): 201, uma devolucao, fisico +1 uma vez.
    const antes = (await dbGet(db, 'SELECT COUNT(*) n FROM devolucoes_material_almoxarifado WHERE material_id = ?', [m])).n;
    const av = await comAuditoriaFalhando('devolucao', 'CRIACAO', () => request(app).post(`${API}/devolucoes`).send({
      material_id: m, quantidade: 1, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE' }));
    assert.strictEqual(av.status, 201, `${av.status} ${JSON.stringify(av.body)}`);
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM devolucoes_material_almoxarifado WHERE material_id = ?', [m])).n - antes, 1);
    assert.strictEqual(await fisico(), 3);
    assert.strictEqual((await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade = 'devolucao'
      AND acao = 'ESTADO_PARCIAL'`)).n, 0, 'a devolucao completa virou ESTADO_PARCIAL');
  });

  await test('(ii) pelo servico: registrarDevolucao citando S lanca a mesma literal; listarSaidasElegiveis da o mesmo numero', async () => {
    assert.ok(S, 'premissa: o cenario (i) criou a entrega');
    await assert.rejects(() => returnService.registrarDevolucao(db, SUPER, { material_id: m, quantidade: 1, motivo: 'SOBRA_PROJETO',
      destino: 'ESTOQUE', movimentacao_saida_id: S }), (e) => {
      assert.strictEqual(e.status, 400);
      assert.strictEqual(e.message, ACIMA(S, 2, 0, 2, 0));
      return true;
    });
    const el = (await returnService.listarSaidasElegiveis(db, m)).find((x) => x.id === S);
    assert.strictEqual(el.saldo_devolvivel, 0);
    assert.strictEqual(el.quantidade_reentrada, 2);
    assert.strictEqual(await fisico(), 3);
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
