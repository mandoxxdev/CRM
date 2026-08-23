/**
 * Etapa 9b, Task 2 — Emprestimo endurecido: claim atomico, RN-01..04, RN-09, RN-11, Zod.
 *
 * Executar: cd server && node tests/api/toolEmprestimo.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll, dbGet } = require('../../services/almoxarifado/db');

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
    [`FER-${seq}`, `Ferramenta ${seq}`, extra.status || 'DISPONIVEL', extra.exige_calibracao || 0]);
  return r.lastID;
}

(async () => {
  await test('RN-01: emprestar ferramenta ja emprestada falha', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Joao' }).expect(201);
    const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Maria' }).expect(400);
    assert.strictEqual(r.body.error, 'Ferramenta não está disponível (status atual: EMPRESTADA)');
    await close();
  });

  await test('RN-01: corrida — dois emprestar simultaneos, exatamente um vence', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    const [a, b] = await Promise.all([
      request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`).send({ colaborador_nome: 'A' }),
      request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`).send({ colaborador_nome: 'B' }),
    ]);
    const codes = [a.status, b.status].sort();
    assert.deepStrictEqual(codes, [201, 400], `esperava 1 vitoria e 1 recusa, veio ${codes}`);
    const emprestimos = await dbAll(db,
      "SELECT * FROM emprestimos_ferramenta_almoxarifado WHERE ferramenta_id = ? AND status = 'EMPRESTADA'", [fid]);
    assert.strictEqual(emprestimos.length, 1, 'a corrida gravou dois emprestimos abertos');
    await close();
  });

  await test('RN-02: emprestar ferramenta bloqueada falha', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db, { status: 'BLOQUEADA' });
    const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Joao' }).expect(400);
    assert.strictEqual(r.body.error, 'Ferramenta não está disponível (status atual: BLOQUEADA)');
    await close();
  });

  await test('RN-03: emprestar equipamento com calibracao vencida falha', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db, { exige_calibracao: 1 });
    // sem registro algum de calibracao → recusa
    let r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Joao' }).expect(400);
    assert.strictEqual(r.body.error, 'Ferramenta com calibração vencida ou sem calibração registrada');
    // calibracao VENCIDA → recusa igual
    await dbRun(db, `INSERT INTO calibracoes_ferramenta_almoxarifado
      (ferramenta_id, data_calibracao, data_validade) VALUES (?, date('now','-2 years'), date('now','-1 year'))`, [fid]);
    r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Joao' }).expect(400);
    assert.strictEqual(r.body.error, 'Ferramenta com calibração vencida ou sem calibração registrada');
    // controle positivo: calibracao vigente → empresta
    await dbRun(db, `INSERT INTO calibracoes_ferramenta_almoxarifado
      (ferramenta_id, data_calibracao, data_validade) VALUES (?, date('now'), date('now','+1 year'))`, [fid]);
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Joao' }).expect(201);
    await close();
  });

  await test('RN-04: devolver ferramenta permite novo emprestimo', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    const e1 = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Joao' }).expect(201);
    await request(app).post(`/api/almoxarifado/emprestimos/${e1.body.id}/devolver`).send({}).expect(200);
    const emp = await dbGet(db, 'SELECT * FROM emprestimos_ferramenta_almoxarifado WHERE id = ?', [e1.body.id]);
    assert.strictEqual(emp.status, 'DEVOLVIDA');
    assert.ok(emp.data_devolucao_real, 'data_devolucao_real vazia');
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Maria' }).expect(201);
    await close();
  });

  await test('RN-09: PRODUCAO recebe 403 nas escritas; leitura passa', async () => {
    const { app, db, close, setUser } = await createTestApp();
    const fid = await novaFerramenta(db);
    setUser({ id: 7, nome: 'Chao de Fabrica', email: 'p@t.com' }); // sem perfil → PRODUCAO
    await request(app).post('/api/almoxarifado/ferramentas')
      .send({ codigo_patrimonio: 'X-1', nome: 'Furadeira' }).expect(403);
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Joao' }).expect(403);
    await request(app).get('/api/almoxarifado/ferramentas').expect(200);
    await close();
  });

  await test('RN-11: emprestar e devolver auditam', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    const e = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Joao' }).expect(201);
    await request(app).post(`/api/almoxarifado/emprestimos/${e.body.id}/devolver`).send({}).expect(200);
    // A tabela e auditoria_LOG_almoxarifado (audit.js:6, schema.js:1541) — "auditoria_almoxarifado"
    // NAO existe e ja derrubou teste nesta base (ver materialServiceCriacao.api.test.js:126).
    const audit = await dbAll(db,
      "SELECT acao FROM auditoria_log_almoxarifado WHERE entidade = 'ferramenta' AND entidade_id = ?", [fid]);
    const acoes = audit.map(a => a.acao);
    assert.ok(acoes.includes('EMPRESTIMO'), `sem auditoria de emprestimo: ${acoes}`);
    assert.ok(acoes.includes('DEVOLUCAO'), `sem auditoria de devolucao: ${acoes}`);
    await close();
  });

  await test('Zod: payload sem colaborador_nome recusa com 400 de validacao', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`).send({}).expect(400);
    assert.ok(/Dados inválidos/.test(r.body.error), r.body.error);
    await close();
  });

  await test('listarFerramentas devolve calibracao_vigente e emprestimo_aberto', async () => {
    const { app, db, close } = await createTestApp();
    const semCal = await novaFerramenta(db);                       // exige_calibracao=0
    const comCal = await novaFerramenta(db, { exige_calibracao: 1 });
    await request(app).post(`/api/almoxarifado/ferramentas/${semCal}/emprestar`)
      .send({ colaborador_nome: 'Joao', data_prevista_devolucao: '2030-01-01' }).expect(201);
    const r = await request(app).get('/api/almoxarifado/ferramentas').expect(200);
    const a = r.body.find(f => f.id === semCal);
    const b = r.body.find(f => f.id === comCal);
    assert.strictEqual(a.calibracao_vigente, null);                 // nao exige → null
    assert.strictEqual(a.emprestimo_aberto.colaborador_nome, 'Joao');
    assert.strictEqual(b.calibracao_vigente, false);                // exige e nao tem → false
    assert.strictEqual(b.emprestimo_aberto, null);
    await close();
  });

  await test('listarEmprestimos filtra por ?colaborador= (contrato congelado do design)', async () => {
    const { app, db, close } = await createTestApp();
    const f1 = await novaFerramenta(db);
    const f2 = await novaFerramenta(db);
    await request(app).post(`/api/almoxarifado/ferramentas/${f1}/emprestar`)
      .send({ colaborador_nome: 'Joao Silva' }).expect(201);
    await request(app).post(`/api/almoxarifado/ferramentas/${f2}/emprestar`)
      .send({ colaborador_nome: 'Maria Souza' }).expect(201);
    const r = await request(app).get('/api/almoxarifado/emprestimos?colaborador=Joao').expect(200);
    assert.strictEqual(r.body.length, 1, `esperava so o emprestimo do Joao, veio ${r.body.length}`);
    assert.strictEqual(r.body[0].colaborador_nome, 'Joao Silva');
    await close();
  });

  await test('listarFerramentas: ?busca= casa codigo_patrimonio ou nome, ?exige_calibracao= filtra 0/1 (F1 da revisao final)', async () => {
    const { app, db, close } = await createTestApp();
    await dbRun(db, `INSERT INTO ferramentas_almoxarifado (codigo_patrimonio, nome, status, exige_calibracao)
      VALUES ('PAT-XYZ-01', 'Furadeira de impacto', 'DISPONIVEL', 1)`);
    await dbRun(db, `INSERT INTO ferramentas_almoxarifado (codigo_patrimonio, nome, status, exige_calibracao)
      VALUES ('PAT-9999', 'Serra circular', 'DISPONIVEL', 0)`);

    // busca por codigo acha
    let r = await request(app).get('/api/almoxarifado/ferramentas?busca=XYZ').expect(200);
    assert.strictEqual(r.body.length, 1, `busca por codigo deveria achar 1, veio ${r.body.length}`);
    assert.strictEqual(r.body[0].codigo_patrimonio, 'PAT-XYZ-01');

    // busca por nome acha
    r = await request(app).get('/api/almoxarifado/ferramentas?busca=Serra').expect(200);
    assert.strictEqual(r.body.length, 1, `busca por nome deveria achar 1, veio ${r.body.length}`);
    assert.strictEqual(r.body[0].nome, 'Serra circular');

    // nao-match nao acha
    r = await request(app).get('/api/almoxarifado/ferramentas?busca=NaoExiste').expect(200);
    assert.strictEqual(r.body.length, 0, `busca sem match deveria vir vazia, veio ${r.body.length}`);

    // exige_calibracao=1 filtra
    r = await request(app).get('/api/almoxarifado/ferramentas?exige_calibracao=1').expect(200);
    assert.ok(r.body.every(f => f.exige_calibracao === 1), 'exige_calibracao=1 deveria devolver so as que exigem');
    assert.ok(r.body.some(f => f.codigo_patrimonio === 'PAT-XYZ-01'));

    r = await request(app).get('/api/almoxarifado/ferramentas?exige_calibracao=0').expect(200);
    assert.ok(r.body.every(f => f.exige_calibracao === 0), 'exige_calibracao=0 deveria devolver so as que nao exigem');
    assert.ok(r.body.some(f => f.codigo_patrimonio === 'PAT-9999'));
    await close();
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
