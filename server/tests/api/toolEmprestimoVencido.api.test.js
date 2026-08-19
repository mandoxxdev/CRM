/**
 * Etapa 9b, Task 6 — Devolucao vencida: filtro `GET /emprestimos?vencidos=1` (design D6) e a
 * funcao pura `toolReminderService.listarEmprestimosVencidos(db)` que a alimenta.
 *
 * Contrato: so emprestimo com status EMPRESTADA e data_prevista_devolucao < date('now') e
 * vencido. Sem data prevista NUNCA e vencido (coluna nullable, RN nao se aplica). Devolvido
 * (mesmo com a data no passado) tambem nao conta — a comparacao e so contra emprestimo aberto.
 *
 * Executar: cd server && node tests/api/toolEmprestimoVencido.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');
const toolReminderService = require('../../services/almoxarifado/toolReminderService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

let seq = 0;
async function novaFerramenta(db, extra = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO ferramentas_almoxarifado
    (codigo_patrimonio, nome, status, exige_calibracao) VALUES (?,?,?,?)`,
    [`FER-V-${seq}`, `Ferramenta Vencida ${seq}`, extra.status || 'DISPONIVEL', extra.exige_calibracao || 0]);
  return r.lastID;
}

function isoOntem() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function isoAmanha() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

(async () => {
  await test('vencidos=1 traz so o emprestimo com data_prevista_devolucao no passado e ainda EMPRESTADA', async () => {
    const { app, db, close } = await createTestApp();

    // A: vencido ontem, ainda emprestado
    const fA = await novaFerramenta(db);
    const eA = await request(app).post(`/api/almoxarifado/ferramentas/${fA}/emprestar`)
      .send({ colaborador_nome: 'Vencido Ontem', data_prevista_devolucao: isoOntem() }).expect(201);

    // B: previsto para amanha, nao vencido
    const fB = await novaFerramenta(db);
    await request(app).post(`/api/almoxarifado/ferramentas/${fB}/emprestar`)
      .send({ colaborador_nome: 'Prazo Amanha', data_prevista_devolucao: isoAmanha() }).expect(201);

    // C: sem data prevista — nunca e vencido
    const fC = await novaFerramenta(db);
    await request(app).post(`/api/almoxarifado/ferramentas/${fC}/emprestar`)
      .send({ colaborador_nome: 'Sem Prazo' }).expect(201);

    // D: vencido ontem, mas ja devolvido — nao conta
    const fD = await novaFerramenta(db);
    const eD = await request(app).post(`/api/almoxarifado/ferramentas/${fD}/emprestar`)
      .send({ colaborador_nome: 'Vencido Mas Devolvido', data_prevista_devolucao: isoOntem() }).expect(201);
    await request(app).post(`/api/almoxarifado/emprestimos/${eD.body.id}/devolver`).send({}).expect(200);

    // Filtro vencidos=1 via API
    const r = await request(app).get('/api/almoxarifado/emprestimos?vencidos=1').expect(200);
    assert.strictEqual(r.body.length, 1, `esperava so o vencido, veio ${r.body.length}: ${JSON.stringify(r.body.map(x => x.colaborador_nome))}`);
    assert.strictEqual(r.body[0].id, eA.body.id);
    assert.strictEqual(r.body[0].colaborador_nome, 'Vencido Ontem');

    // Funcao pura equivalente
    const puros = await toolReminderService.listarEmprestimosVencidos(db);
    assert.strictEqual(puros.length, 1, `funcao pura deveria trazer so 1, veio ${puros.length}`);
    assert.strictEqual(puros[0].id, eA.body.id);

    // Sem o filtro (so status=EMPRESTADA): todos os EMPRESTADA voltam, vencido ou nao
    const todos = await request(app).get('/api/almoxarifado/emprestimos?status=EMPRESTADA').expect(200);
    assert.strictEqual(todos.body.length, 3, `esperava 3 EMPRESTADA (A, B, C), veio ${todos.body.length}`);
    const nomes = todos.body.map((e) => e.colaborador_nome).sort();
    assert.deepStrictEqual(nomes, ['Prazo Amanha', 'Sem Prazo', 'Vencido Ontem']);

    await close();
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
