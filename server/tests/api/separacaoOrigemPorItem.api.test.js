/**
 * Etapa 59 — a separação diz de onde cada item sai, e a entrega (inclusive a de um clique) usa.
 *
 * Plano: docs/superpowers/plans/2026-09-30-almoxarifado-etapa59-origem-na-separacao.md
 *
 * Executar: cd server && node tests/api/separacaoOrigemPorItem.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
let seq = 0;

(async () => {
  console.log('\n=== Etapa 59: origem na separacao ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const loc = async (nome) => {
    const c = `E59-${nome}-${++seq}`;
    return { id: (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', [c, nome])).lastID, codigo: c };
  };
  const material = async (padrao = null) => {
    const c = `E59-M${++seq}`;
    return { id: (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, localizacao_padrao_id)
      VALUES (?, ?, 'UN', 0, 1, ?)`, [c, `Mat ${c}`, padrao])).lastID, nome: `Mat ${c}` };
  };
  const entrar = async (m, destino, q, lote) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({
      material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e59', localizacao_destino_id: destino, ...(lote ? { lote } : {}),
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const req = async (itens) => {
    const r = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E59-${++seq}`])).lastID;
    const ids = [];
    for (const [m, q] of itens) {
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
        (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
        VALUES (?,?,?,0,0,0)`, [r, m, q])).lastID);
    }
    return { id: r, ids };
  };
  const separar = (reqId, itens) => requisitionService.separarRequisicao(db, reqId, itens, ADMIN);
  const separarErro = async (reqId, itens) => {
    try { await separar(reqId, itens); } catch (e) { return e; }
    throw new Error('a separacao deveria ter sido recusada');
  };
  const entregar = (reqId, itens) => request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`).send({ itens_atendidos: itens });
  const saldoEm = async (m, l) => Number((await dbGet(db, 'SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id IS ?', [m, l])).q);
  const itemRow = (id) => dbGet(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE id = ?', [id]);

  await test('C80: separa de A -> a entrega SEM origem (um clique) sai de A, nao da padrao', async () => {
    const P = await loc('P'); const A = await loc('A'); const m = await material(P.id);
    await entrar(m.id, P.id, 50); await entrar(m.id, A.id, 10);
    const { id, ids } = await req([[m.id, 6]]);
    // Pela ROTA (a integração que a tela usa), não pelo serviço.
    const sep = await request(app).put(`/api/almoxarifado/requisicoes/${id}/separar`)
      .send({ itens_separados: [{ item_id: ids[0], quantidade_separada: 6, localizacao_origem_id: A.id }] });
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));
    assert.strictEqual((await itemRow(ids[0])).origem_separacao_id, A.id);
    // O detalhe traz o código, para a tela mostrar "separado de A".
    const det = await request(app).get(`/api/almoxarifado/requisicoes/${id}`);
    assert.strictEqual(det.body.itens[0].origem_separacao_codigo, A.codigo);
    const rod = await dbGet(db, 'SELECT itens_json FROM separacoes_requisicao_almoxarifado WHERE requisicao_id = ?', [id]);
    assert.strictEqual(JSON.parse(rod.itens_json)[0].localizacao_origem_id, A.id);
    const r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 6 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m.id, A.id), 4); assert.strictEqual(await saldoEm(m.id, P.id), 50);
    // RN-04: entregue todo o separado, a planejada é limpa.
    assert.strictEqual((await itemRow(ids[0])).origem_separacao_id, null);
  });

  await test('RN-01 A nao cobre na separacao: recusa com prefixo, NADA gravado', async () => {
    const A = await loc('SA'); const B = await loc('SB'); const m = await material();
    await entrar(m.id, A.id, 3); await entrar(m.id, B.id, 20); // o disponível total cobre; A não
    const { id, ids } = await req([[m.id, 5]]);
    const e = await separarErro(id, [{ item_id: ids[0], quantidade_separada: 5, localizacao_origem_id: A.id }]);
    assert.strictEqual(e.message, `${m.nome}: O saldo em ${A.codigo} (3) não cobre a quantidade (5) — a saída tiraria de outros endereços`);
    const it = await itemRow(ids[0]);
    assert.strictEqual(it.quantidade_separada, 0); assert.strictEqual(it.origem_separacao_id, null);
  });

  await test('RN-01 mesma origem em duas rodadas: a 2a checa o pendente + ela (A:8, 5 + 5 recusado)', async () => {
    const A = await loc('DA'); const m = await material();
    await entrar(m.id, A.id, 8);
    const { id, ids } = await req([[m.id, 10]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 5, localizacao_origem_id: A.id }]);
    const e = await separarErro(id, [{ item_id: ids[0], quantidade_separada: 5, localizacao_origem_id: A.id }]);
    // O saldo mostrado ja desconta o separado pendente (8 - 5 = 3).
    assert.strictEqual(e.message, `${m.nome}: O saldo em ${A.codigo} (3) não cobre a quantidade (5) — a saída tiraria de outros endereços`);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]);
    assert.strictEqual((await itemRow(ids[0])).origem_separacao_id, A.id);
  });

  await test('RN-02 rodadas com origens DIFERENTES: planejada nula -> entrega automatica', async () => {
    const P = await loc('MP'); const A = await loc('MA'); const B = await loc('MB'); const m = await material(P.id);
    await entrar(m.id, A.id, 5); await entrar(m.id, B.id, 5); await entrar(m.id, P.id, 20);
    const { id, ids } = await req([[m.id, 6]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: B.id }]);
    assert.strictEqual((await itemRow(ids[0])).origem_separacao_id, null);
    const r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 6 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m.id, P.id), 14, 'automatico drena a padrao primeiro');
  });

  await test('RN-03 origem no payload vence a planejada; origem_automatica ignora a planejada', async () => {
    const P = await loc('VP'); const A = await loc('VA'); const B = await loc('VB'); const m = await material(P.id);
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10); await entrar(m.id, P.id, 10);
    const { id, ids } = await req([[m.id, 4]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 4, localizacao_origem_id: A.id }]);
    let r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 2, localizacao_origem_id: B.id }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m.id, B.id), 8); assert.strictEqual(await saldoEm(m.id, A.id), 10);
    r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 2, origem_automatica: true }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m.id, P.id), 8); assert.strictEqual(await saldoEm(m.id, A.id), 10);
  });

  await test('RN-03 planejada que nao serve mais: literal com a saida; o 1o item NAO sai; automatico resolve', async () => {
    const A = await loc('NA'); const B = await loc('NB'); const m1 = await material(); const m2 = await material();
    await entrar(m1.id, B.id, 10); await entrar(m2.id, A.id, 5);
    const { id, ids } = await req([[m1.id, 2], [m2.id, 5]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 2 }, { item_id: ids[1], quantidade_separada: 5, localizacao_origem_id: A.id }]);
    // Outra saída drena A entre separar e entregar.
    const s = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m2.id, tipo: 'TRANSFERENCIA', quantidade: 4, localizacao_origem_id: A.id, localizacao_destino_id: B.id, motivo: 'e59' });
    assert.strictEqual(s.status, 201, JSON.stringify(s.body));
    let r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 2 }, { item_id: ids[1], quantidade_atendida: 5 }]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error,
      `${m2.nome}: a origem da separação (${A.codigo}) não serve mais (O saldo em ${A.codigo} (1) não cobre a quantidade (5) — a saída tiraria de outros endereços) — entregue escolhendo de onde sai`);
    assert.strictEqual((await itemRow(ids[0])).quantidade_entregue, 0, 'o 1o item saiu antes da recusa do 2o');
    r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 2 }, { item_id: ids[1], quantidade_atendida: 5, origem_automatica: true }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });

  await test('RN-03 acima do separado pendente a planejada nao se aplica (5 de A, 3 entregues, entrega 7)', async () => {
    const P = await loc('XP'); const A = await loc('XA'); const m = await material(P.id);
    await entrar(m.id, A.id, 5); await entrar(m.id, P.id, 20);
    const { id, ids } = await req([[m.id, 10]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 5, localizacao_origem_id: A.id }]);
    assert.strictEqual((await entregar(id, [{ item_id: ids[0], quantidade_atendida: 3 }])).status, 200);
    assert.strictEqual(await saldoEm(m.id, A.id), 2);
    const r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 7 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m.id, P.id) + await saldoEm(m.id, A.id), 15);
  });

  await test('Lote BLOQUEADO na separacao: recusado com a literal do motor', async () => {
    const A = await loc('LA'); const m = await material(); const cod = `LB-${seq}`;
    await entrar(m.id, A.id, 5, cod);
    const lb = (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ?', [m.id])).id;
    await dbRun(db, "UPDATE lotes_almoxarifado SET status = 'BLOQUEADO' WHERE id = ?", [lb]);
    const { id, ids } = await req([[m.id, 2]]);
    const e = await separarErro(id, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: A.id, lote_id: lb }]);
    assert.strictEqual(e.message, `${m.nome}: Lote ${cod} esta bloqueado e nao pode ser utilizado`);
  });

  await test('Fase 5: DOIS itens do mesmo material no mesmo par — o pendente do outro conta (L:7, 5 + 5 recusado)', async () => {
    const A = await loc('TA'); const m = await material();
    await entrar(m.id, A.id, 7);
    const { id, ids } = await req([[m.id, 5], [m.id, 5]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 5, localizacao_origem_id: A.id }]);
    const e = await separarErro(id, [{ item_id: ids[1], quantidade_separada: 5, localizacao_origem_id: A.id }]);
    assert.strictEqual(e.message, `${m.nome}: O saldo em ${A.codigo} (2) não cobre a quantidade (5) — a saída tiraria de outros endereços`);
    await separar(id, [{ item_id: ids[1], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    // E a entrega de um clique dos dois passa (5 + 2 de A).
    const r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 5 }, { item_id: ids[1], quantidade_atendida: 2 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m.id, A.id), 0);
  });

  await test('Fase 5: a mesma entrada duas vezes no payload nao conta o pendente em dobro (L:10, 4 + 4)', async () => {
    const A = await loc('PA'); const m = await material();
    await entrar(m.id, A.id, 10);
    const { id, ids } = await req([[m.id, 10]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 4, localizacao_origem_id: A.id },
      { item_id: ids[0], quantidade_separada: 4, localizacao_origem_id: A.id }]);
    assert.strictEqual((await itemRow(ids[0])).quantidade_separada, 8);
  });

  await test('Fase 5: RN-04 MANTEM a planejada depois de entrega parcial; lote sem endereco nao vira planejada', async () => {
    const A = await loc('KA'); const m = await material(); const cod = `LK-${seq}`;
    await entrar(m.id, A.id, 10, cod);
    const lk = (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ?', [m.id])).id;
    const { id, ids } = await req([[m.id, 6]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 6, localizacao_origem_id: A.id, lote_id: lk }]);
    assert.strictEqual((await entregar(id, [{ item_id: ids[0], quantidade_atendida: 2 }])).status, 200);
    const it = await itemRow(ids[0]);
    assert.strictEqual(it.origem_separacao_id, A.id); assert.strictEqual(it.lote_separacao_id, lk);
    const r2 = await req([[m.id, 1]]);
    await separar(r2.id, [{ item_id: r2.ids[0], quantidade_separada: 1, lote_id: lk }]);
    const it2 = await itemRow(r2.ids[0]);
    assert.strictEqual(it2.origem_separacao_id, null); assert.strictEqual(it2.lote_separacao_id, null);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
