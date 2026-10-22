/**
 * Etapa 174 (T1) — a SAIDA da entrega grava o `os_id` da requisicao (RN-174.01); a ENTRADA do estorno da exclusao de
 * requisicao entregue grava o `os_id` DA SAIDA que ela estorna (RN-174.02 com a emenda C1 — a saida entregue antes da 174
 * tem os_id null e a entrada tambem; o ramo legado, livro que nao soma o entregue, grava null); e a regra do dono passa a
 * enxergar a OS da requisicao (RN-174.04): material de cliente sem projeto com OS do MESMO cliente passa (antes recusava
 * "so pode sair com OS ou projeto"), OS de OUTRO cliente recusa com a mensagem do vinculo de outro dono, OS excluida
 * recusa "OS informada nao existe", material proprio nao muda, projeto + OS de clientes diferentes: o projeto vence.
 *
 * A requisicao e semeada por INSERT (molde devolucaoViva.api.test.js RN-04) — o que esta em prova e a entrega e a
 * exclusao pela ROTA. O harness nao tem `ordens_servico`/`projetos` (tabelas core): o teste as cria.
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa174-entrega-com-os-e-consumo-por-os.md
 * Executar: cd server && node tests/api/entregaComOsId.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };

(async () => {
  console.log('\n=== Etapa 174 (T1): a entrega grava a OS ===\n');
  const { app, db, close } = await createTestApp({ user: SUPER });
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL, cliente_id INTEGER,
    tipo_os TEXT NOT NULL DEFAULT 'producao', status TEXT DEFAULT 'pendente', data_abertura DATE NOT NULL DEFAULT '2026-10-22')`);
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS projetos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)');
  const cliA = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente A E174')")).lastID;
  const cliB = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente B E174')")).lastID;

  let seq = 0;
  const novaOs = async (clienteId = null) => {
    seq += 1;
    const numero = `E174T1-OS${seq}`;
    return { id: (await dbRun(db, "INSERT INTO ordens_servico (numero_os, cliente_id, status) VALUES (?, ?, 'em_andamento')",
      [numero, clienteId])).lastID, numero };
  };
  const material = async ({ cliente = null } = {}) => {
    seq += 1;
    const codigo = `E174T1-M${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, proprietario_cliente_id)
      VALUES (?, ?, 'PC', 0, 0, 10, 1, ?)`, [codigo, codigo, cliente])).lastID;
    const e = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: id, tipo: 'ENTRADA', quantidade: 20,
      motivo: 'setup e174', justificativa: 'setup e174', documento_vinculado: 'NF-E174' });
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
    return { id, codigo };
  };
  /** Requisicao APROVADO semeada (os_id/projeto_id), separada pelo servico; devolve { rq, it }. */
  const requisicao = async (m, qtd, { osId = null, projetoId = null } = {}) => {
    seq += 1;
    const rq = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, os_id, projeto_id)
      VALUES (?, 1, 'Sol', 'APROVADO', ?, ?)`, [`REQ-E174T1-${seq}`, osId, projetoId])).lastID;
    const it = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [rq, m.id, qtd])).lastID;
    await requisitionService.separarRequisicao(db, rq, [{ item_id: it, quantidade_separada: qtd }], SUPER);
    return { rq, it };
  };
  const entregar = (r, qtd) => request(app).put(`/api/almoxarifado/requisicoes/${r.rq}/entregar`)
    .send({ itens_atendidos: [{ item_id: r.it, quantidade_atendida: qtd }] });
  const entregue = async (m, qtd, opts) => {
    const r = await requisicao(m, qtd, opts);
    const e = await entregar(r, qtd);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    return r;
  };
  const movs = (rq, tipo) => dbAll(db, 'SELECT id, os_id, quantidade FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = ? ORDER BY id',
    [rq, tipo]);
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q;
  const excluir = (rq) => request(app).delete(`/api/almoxarifado/requisicoes/${rq}`).send({ justificativa: 'e174 t1' });

  // ══════════════ RN-174.01 — a SAIDA da entrega grava o os_id ══════════════
  await test('[RN-174.01] requisicao com os_id entregue pela rota: a SAIDA grava o os_id da requisicao', async () => {
    const os = await novaOs();
    const m = await material();
    const r = await entregue(m, 4, { osId: os.id });
    const s = await movs(r.rq, 'SAIDA');
    assert.ok(s.length > 0, 'premissa: houve saida');
    assert.deepStrictEqual(s.map((x) => x.os_id), s.map(() => os.id));
  });

  await test('[RN-174.01] requisicao sem os_id: a SAIDA continua com os_id null', async () => {
    const m = await material();
    const r = await entregue(m, 2);
    const s = await movs(r.rq, 'SAIDA');
    assert.ok(s.length > 0, 'premissa: houve saida');
    assert.deepStrictEqual(s.map((x) => x.os_id), s.map(() => null));
  });

  // ══════════════ RN-174.02 com C1 — a ENTRADA da exclusao leva o os_id DA SAIDA ══════════════
  await test('[RN-174.02] excluir requisicao entregue com os_id: a ENTRADA do estorno grava o os_id da saida; fisico volta', async () => {
    const os = await novaOs();
    const m = await material();
    const r = await entregue(m, 5, { osId: os.id });
    assert.strictEqual(await fisico(m), 15);
    const ex = await excluir(r.rq);
    assert.strictEqual(ex.status, 200, JSON.stringify(ex.body));
    const e = await movs(r.rq, 'ENTRADA');
    assert.deepStrictEqual(e.map((x) => [x.os_id, Number(x.quantidade)]), [[os.id, 5]]);
    assert.strictEqual(await fisico(m), 20);
  });

  await test('[C1] entregue ANTES da 174 (saida com os_id null) e excluida depois: a ENTRADA fica null, nao pega o os_id da requisicao', async () => {
    const os = await novaOs();
    const m = await material();
    const r = await entregue(m, 3, { osId: os.id });
    // a saida "de antes do deploy": mesma linha, sem os_id
    await dbRun(db, "UPDATE movimentacoes_almoxarifado SET os_id = NULL WHERE requisicao_id = ? AND tipo = 'SAIDA'", [r.rq]);
    const ex = await excluir(r.rq);
    assert.strictEqual(ex.status, 200, JSON.stringify(ex.body));
    assert.deepStrictEqual((await movs(r.rq, 'ENTRADA')).map((x) => x.os_id), [null]);
  });

  await test('[C1] ramo legado (livro nao soma o entregue): a ENTRADA da exclusao grava os_id null', async () => {
    const os = await novaOs();
    const m = await material();
    const r = await entregue(m, 3, { osId: os.id });
    // dado antigo: a saida da requisicao nao aparece mais no livro como viva -> cai no estorno de antes
    await dbRun(db, "UPDATE movimentacoes_almoxarifado SET cancelado = 1 WHERE requisicao_id = ? AND tipo = 'SAIDA'", [r.rq]);
    const ex = await excluir(r.rq);
    assert.strictEqual(ex.status, 200, JSON.stringify(ex.body));
    assert.deepStrictEqual((await movs(r.rq, 'ENTRADA')).map((x) => [x.os_id, Number(x.quantidade)]), [[null, 3]]);
  });

  // ══════════════ RN-174.04 — a regra do dono enxerga a OS da requisicao ══════════════
  await test('[RN-174.04] material de cliente A, sem projeto, OS do cliente A: a entrega PASSA (antes recusava) e a saida leva a OS', async () => {
    const os = await novaOs(cliA);
    const m = await material({ cliente: cliA });
    const r = await entregue(m, 2, { osId: os.id });
    assert.deepStrictEqual((await movs(r.rq, 'SAIDA')).map((x) => x.os_id), [os.id]);
    assert.strictEqual(await fisico(m), 18);
  });

  await test('[RN-174.04] material de cliente A, OS do cliente B: recusa com a mensagem do vinculo de outro dono; nada sai', async () => {
    const os = await novaOs(cliB);
    const m = await material({ cliente: cliA });
    const r = await requisicao(m, 2, { osId: os.id });
    const e = await entregar(r, 2);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    const msg = e.body.error || e.body.message || JSON.stringify(e.body);
    assert.ok(msg.includes(`pertence ao cliente Cliente A E174, mas a OS ${os.numero} e do cliente Cliente B E174`), msg);
    assert.deepStrictEqual(await movs(r.rq, 'SAIDA'), []);
    assert.strictEqual(await fisico(m), 20);
  });

  await test('[RN-174.04] material de cliente, OS excluida depois de criada a requisicao: recusa "OS informada nao existe"', async () => {
    const os = await novaOs(cliA);
    const m = await material({ cliente: cliA });
    const r = await requisicao(m, 2, { osId: os.id });
    await dbRun(db, 'DELETE FROM ordens_servico WHERE id = ?', [os.id]);
    const e = await entregar(r, 2);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    const msg = e.body.error || e.body.message || JSON.stringify(e.body);
    assert.ok(msg.includes('OS informada nao existe'), msg);
    assert.strictEqual(await fisico(m), 20);
  });

  await test('[RN-174.04] material PROPRIO com OS excluida: a entrega passa (sem regra do dono, sem FK)', async () => {
    const os = await novaOs(cliA);
    const m = await material();
    const r = await requisicao(m, 2, { osId: os.id });
    await dbRun(db, 'DELETE FROM ordens_servico WHERE id = ?', [os.id]);
    const e = await entregar(r, 2);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.deepStrictEqual((await movs(r.rq, 'SAIDA')).map((x) => x.os_id), [os.id]);
  });

  // Fase 5 (revisao adversarial, item 1): antes a saida levava a OS B, e a posicao do cliente A mostrava "aplicado na OS de B"
  // (e o consumo por OS de B somava material de A). Decisao reversivel (letra B): com projeto e cliente do projeto diferente do
  // cliente da OS, a SAIDA nao grava os_id — so o projeto. Mesmo cliente, ou sem projeto: grava como antes.
  const posicao = async (clienteId) => {
    const r = await request(app).get('/api/almoxarifado/materiais-cliente/posicao').query({ cliente_id: clienteId });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const consumoDaOs = async (osId) => {
    const r = await request(app).get('/api/almoxarifado/relatorios/consumo-os').query({ os_id: osId });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return (Array.isArray(r.body) ? r.body : (r.body.dados || r.body.linhas || r.body)).map((l) => l.material_id);
  };

  await test('[F5-1] material de cliente A com projeto do cliente A e OS do cliente B: o projeto vence, passa; a saida NAO leva a OS B', async () => {
    const os = await novaOs(cliB);
    const proj = (await dbRun(db, 'INSERT INTO projetos (cliente_id, nome) VALUES (?, ?)', [cliA, 'Projeto A E174'])).lastID;
    const m = await material({ cliente: cliA });
    const r = await entregue(m, 2, { osId: os.id, projetoId: proj });
    const s = await dbAll(db, "SELECT os_id, projeto_id FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'SAIDA'", [r.rq]);
    assert.deepStrictEqual(s.map((x) => [x.os_id, x.projeto_id]), [[null, proj]]);
    // a posicao do cliente A mostra a aplicacao no projeto, sem a OS de B
    const apl = (await posicao(cliA)).aplicacoes.filter((a) => a.material_id === m.id);
    assert.deepStrictEqual(apl.map((a) => [a.os_id, a.projeto_id, Number(a.quantidade)]), [[null, proj, 2]]);
    // e o consumo por OS de B nao soma material de A
    assert.ok(!(await consumoDaOs(os.id)).includes(m.id), 'consumo por OS de B inclui material de A');
    // a exclusao estorna com o os_id da saida (C1): null tambem
    const ex = await excluir(r.rq);
    assert.strictEqual(ex.status, 200, JSON.stringify(ex.body));
    assert.deepStrictEqual((await movs(r.rq, 'ENTRADA')).map((x) => x.os_id), [null]);
  });

  await test('[F5-1] controle: projeto do cliente A e OS do MESMO cliente A: a saida leva a OS e a posicao mostra a aplicacao na OS', async () => {
    const os = await novaOs(cliA);
    const proj = (await dbRun(db, 'INSERT INTO projetos (cliente_id, nome) VALUES (?, ?)', [cliA, 'Projeto A2 E174'])).lastID;
    const m = await material({ cliente: cliA });
    const r = await entregue(m, 3, { osId: os.id, projetoId: proj });
    assert.deepStrictEqual((await movs(r.rq, 'SAIDA')).map((x) => x.os_id), [os.id]);
    const apl = (await posicao(cliA)).aplicacoes.filter((a) => a.material_id === m.id);
    assert.deepStrictEqual(apl.map((a) => [a.os_id, a.numero_os, a.projeto_id, Number(a.quantidade)]), [[os.id, os.numero, proj, 3]]);
    assert.deepStrictEqual(await consumoDaOs(os.id), [m.id]);
  });

  await test('[RN-174.04] controle: material de cliente sem OS nem projeto continua recusando "so pode sair com OS ou projeto"', async () => {
    const m = await material({ cliente: cliA });
    const r = await requisicao(m, 2);
    const e = await entregar(r, 2);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    const msg = e.body.error || e.body.message || JSON.stringify(e.body);
    assert.ok(msg.includes('so pode sair com OS ou projeto DESSE cliente'), msg);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
