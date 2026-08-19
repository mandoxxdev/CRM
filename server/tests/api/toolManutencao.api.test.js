/**
 * Etapa 9b, Task 4 — Bloqueio, manutencao e reencontrar: RN-06, RN-07, RN-10.
 * Todas as transicoes por UPDATE com claim no WHERE (padrao emprestarFerramenta/devolverFerramenta).
 *
 * Executar: cd server && node tests/api/toolManutencao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll, dbGet } = require('../../services/almoxarifado/db');
const toolService = require('../../services/almoxarifado/toolService');

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
  await test('RN-06: bloquear sem justificativa recusa com 400 de validacao', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/bloquear`).send({}).expect(400);
    assert.ok(/Dados inválidos/.test(r.body.error), r.body.error);
    await close();
  });

  await test('RN-06: bloquear ok muda status e audita com a justificativa', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/bloquear`)
      .send({ justificativa: 'Ferramenta com risco eletrico' }).expect(200);
    const f = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid]);
    assert.strictEqual(f.status, 'BLOQUEADA');
    const audit = await dbAll(db,
      "SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'ferramenta' AND entidade_id = ? AND acao = 'BLOQUEIO'", [fid]);
    assert.strictEqual(audit.length, 1, 'sem auditoria de bloqueio');
    assert.ok(/risco eletrico/.test(audit[0].dados_novos), `justificativa ausente em dados_novos: ${audit[0].dados_novos}`);
    await close();
  });

  await test('RN-06: bloquear ferramenta emprestada recusa', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Joao' }).expect(201);
    const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/bloquear`)
      .send({ justificativa: 'tentando bloquear emprestada' }).expect(400);
    assert.strictEqual(r.body.error, 'Ferramenta não pode ser bloqueada (status atual: EMPRESTADA)');
    await close();
  });

  await test('RN-06: desbloquear volta a DISPONIVEL e audita', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db, { status: 'BLOQUEADA' });
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/desbloquear`)
      .send({ justificativa: 'risco eliminado' }).expect(200);
    const f = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid]);
    assert.strictEqual(f.status, 'DISPONIVEL');
    const audit = await dbAll(db,
      "SELECT acao FROM auditoria_log_almoxarifado WHERE entidade = 'ferramenta' AND entidade_id = ? AND acao = 'DESBLOQUEIO'", [fid]);
    assert.strictEqual(audit.length, 1, 'sem auditoria de desbloqueio');
    await close();
  });

  await test('RN-06: desbloquear ferramenta nao bloqueada recusa', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/desbloquear`)
      .send({ justificativa: 'nada pra desbloquear' }).expect(400);
    assert.strictEqual(r.body.error, 'Ferramenta não está bloqueada (status atual: DISPONIVEL)');
    await close();
  });

  await test('RN-07: ferramenta emprestada nao entra em manutencao', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Joao' }).expect(201);
    const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/manutencoes`)
      .send({ descricao: 'Revisao geral' }).expect(400);
    assert.strictEqual(r.body.error, 'Ferramenta não pode entrar em manutenção (status atual: EMPRESTADA)');
    await close();
  });

  await test('RN-07: avariada entra em manutencao e volta DISPONIVEL ao concluir', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    // AVARIA e transicao de ocorrencia (fora desta task) — forcamos o status direto no teste,
    // como o brief instrui, para exercitar o claim DISPONIVEL|AVARIADA -> EM_MANUTENCAO.
    await dbRun(db, "UPDATE ferramentas_almoxarifado SET status = 'AVARIADA' WHERE id = ?", [fid]);

    const m = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/manutencoes`)
      .send({ descricao: 'Troca de rolamento' }).expect(201);
    assert.ok(m.body.id, 'manutencao sem id');

    let f = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid]);
    assert.strictEqual(f.status, 'EM_MANUTENCAO');
    const linha = await dbGet(db, 'SELECT * FROM manutencoes_ferramenta_almoxarifado WHERE id = ?', [m.body.id]);
    assert.strictEqual(linha.ferramenta_id, fid);
    assert.strictEqual(linha.descricao, 'Troca de rolamento');
    assert.strictEqual(linha.data_fim, null, 'manutencao deveria estar aberta');

    // emprestar durante a manutencao falha
    const eR = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Joao' }).expect(400);
    assert.strictEqual(eR.body.error, 'Ferramenta não está disponível (status atual: EM_MANUTENCAO)');

    // concluir preenche data_fim, ferramenta volta DISPONIVEL e passa a emprestar
    await request(app).put(`/api/almoxarifado/manutencoes/${m.body.id}/concluir`)
      .send({ observacoes: 'trocado, testado' }).expect(200);
    const concluida = await dbGet(db, 'SELECT * FROM manutencoes_ferramenta_almoxarifado WHERE id = ?', [m.body.id]);
    assert.ok(concluida.data_fim, 'data_fim nao preenchida');
    f = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid]);
    assert.strictEqual(f.status, 'DISPONIVEL');

    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Maria' }).expect(201);

    const audit = await dbAll(db,
      "SELECT acao FROM auditoria_log_almoxarifado WHERE entidade = 'ferramenta' AND entidade_id = ?", [fid]);
    const acoes = audit.map(a => a.acao);
    assert.ok(acoes.includes('MANUTENCAO_INICIO'), `sem auditoria de inicio: ${acoes}`);
    assert.ok(acoes.includes('MANUTENCAO_FIM'), `sem auditoria de fim: ${acoes}`);
    await close();
  });

  await test('concluir manutencao ja concluida (ou inexistente) devolve 404', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    const m = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/manutencoes`)
      .send({ descricao: 'Ajuste' }).expect(201);
    await request(app).put(`/api/almoxarifado/manutencoes/${m.body.id}/concluir`).send({}).expect(200);
    const r = await request(app).put(`/api/almoxarifado/manutencoes/${m.body.id}/concluir`).send({}).expect(404);
    assert.strictEqual(r.body.error, 'Manutenção não encontrada');
    const r2 = await request(app).put('/api/almoxarifado/manutencoes/999999/concluir').send({}).expect(404);
    assert.strictEqual(r2.body.error, 'Manutenção não encontrada');
    await close();
  });

  await test('GET /ferramentas/:id/manutencoes lista o historico', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    const m = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/manutencoes`)
      .send({ descricao: 'Ajuste' }).expect(201);
    const r = await request(app).get(`/api/almoxarifado/ferramentas/${fid}/manutencoes`).expect(200);
    assert.strictEqual(r.body.length, 1);
    assert.strictEqual(r.body[0].id, m.body.id);
    await close();
  });

  await test('RN-10: reencontrar ferramenta disponivel recusa', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/reencontrar`)
      .send({ justificativa: 'achada no deposito' }).expect(400);
    assert.strictEqual(r.body.error, 'Ferramenta não está perdida (status atual: DISPONIVEL)');
    await close();
  });

  await test('RN-10: reencontrar ferramenta perdida exige justificativa, volta DISPONIVEL e audita', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    // PERDA e transicao de ocorrencia (fora desta task) — forcamos o status direto no teste.
    await dbRun(db, "UPDATE ferramentas_almoxarifado SET status = 'PERDIDA' WHERE id = ?", [fid]);

    const semJust = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/reencontrar`).send({}).expect(400);
    assert.ok(/Dados inválidos/.test(semJust.body.error), semJust.body.error);

    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/reencontrar`)
      .send({ justificativa: 'achada atras da prateleira 4' }).expect(200);
    const f = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid]);
    assert.strictEqual(f.status, 'DISPONIVEL');
    const audit = await dbAll(db,
      "SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'ferramenta' AND entidade_id = ? AND acao = 'REENCONTRO'", [fid]);
    assert.strictEqual(audit.length, 1, 'sem auditoria de reencontro');
    assert.ok(/prateleira 4/.test(audit[0].dados_novos), `justificativa ausente em dados_novos: ${audit[0].dados_novos}`);
    await close();
  });

  await test('RN-09: PRODUCAO recebe 403 nas escritas desta task; leitura passa', async () => {
    const { app, db, close, setUser } = await createTestApp();
    const fid = await novaFerramenta(db);
    setUser({ id: 7, nome: 'Chao de Fabrica', email: 'p@t.com' }); // sem perfil → PRODUCAO
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/bloquear`)
      .send({ justificativa: 'tentando bloquear' }).expect(403);
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/manutencoes`)
      .send({ descricao: 'tentando manutencao' }).expect(403);
    await request(app).get(`/api/almoxarifado/ferramentas/${fid}/manutencoes`).expect(200);
    await close();
  });

  await test('iniciarManutencao compensa: INSERT falhando (descricao NULL) devolve a ferramenta a origem', async () => {
    const { db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    const ADMIN = { id: 1, nome: 'Admin Teste', email: 'admin@test.com' };

    // Injecao NATURAL, sem mock: chamar o servico direto (fora da rota/Zod) com descricao NULL —
    // a coluna e NOT NULL (schema.js:1507), entao o INSERT falha de verdade no SQLite. E o mesmo
    // caminho que qualquer INSERT quebrado tomaria (ex.: FK invalida), so mais facil de forcar.
    await assert.rejects(
      () => toolService.iniciarManutencao(db, ADMIN, fid, { descricao: null }),
      /NOT NULL/,
    );
    const f = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid]);
    assert.strictEqual(f.status, 'DISPONIVEL', 'ferramenta ficou presa em EM_MANUTENCAO sem linha de manutencao');
    const abertas = await dbAll(db,
      'SELECT * FROM manutencoes_ferramenta_almoxarifado WHERE ferramenta_id = ?', [fid]);
    assert.strictEqual(abertas.length, 0, 'INSERT falhou mas deixou linha gravada');

    // controle positivo: a mesma ferramenta, com descricao valida, funciona normalmente depois.
    await toolService.iniciarManutencao(db, ADMIN, fid, { descricao: 'Revisao' });
    const f2 = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid]);
    assert.strictEqual(f2.status, 'EM_MANUTENCAO');
    await close();
  });

  await test('iniciarManutencao compensa devolvendo para AVARIADA quando essa foi a origem real', async () => {
    const { db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    await dbRun(db, "UPDATE ferramentas_almoxarifado SET status = 'AVARIADA' WHERE id = ?", [fid]);
    const ADMIN = { id: 1, nome: 'Admin Teste', email: 'admin@test.com' };

    await assert.rejects(() => toolService.iniciarManutencao(db, ADMIN, fid, { descricao: null }), /NOT NULL/);
    const f = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid]);
    assert.strictEqual(f.status, 'AVARIADA', 'compensacao devolveu para a origem errada');
    await close();
  });

  await test('concluirManutencao: status da ferramenta mudou por fora — 400 e auditoria de anomalia, sem sucesso silencioso', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    const m = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/manutencoes`)
      .send({ descricao: 'Ajuste' }).expect(201);

    // Injecao natural: entre iniciar e concluir, outra escrita muda o status da ferramenta por
    // fora do fluxo de manutencao — quebra o invariante "uma manutencao aberta por ferramenta"
    // que concluirManutencao normalmente confia. Simulado por UPDATE direto, como o brief pede.
    await dbRun(db, "UPDATE ferramentas_almoxarifado SET status = 'BLOQUEADA' WHERE id = ?", [fid]);

    const r = await request(app).put(`/api/almoxarifado/manutencoes/${m.body.id}/concluir`)
      .send({}).expect(400);
    assert.strictEqual(r.body.error, 'Estado da ferramenta mudou durante a conclusão da manutenção (status atual: BLOQUEADA)');

    // a linha de manutencao FOI fechada (claim 1 e irreversivel por design) mesmo com a recusa.
    const linha = await dbGet(db, 'SELECT * FROM manutencoes_ferramenta_almoxarifado WHERE id = ?', [m.body.id]);
    assert.ok(linha.data_fim, 'manutencao deveria ter sido fechada mesmo com a anomalia');

    // a ferramenta continua no estado real (nao virou DISPONIVEL por engano).
    const f = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid]);
    assert.strictEqual(f.status, 'BLOQUEADA');

    // a anomalia foi auditada, nao sumiu do rastro.
    const audit = await dbAll(db,
      "SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'ferramenta' AND entidade_id = ? AND acao = 'MANUTENCAO_FIM'", [fid]);
    assert.strictEqual(audit.length, 1, 'sem auditoria de MANUTENCAO_FIM na anomalia');
    assert.ok(/anomalia/.test(audit[0].dados_novos), `flag de anomalia ausente: ${audit[0].dados_novos}`);
    await close();
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
