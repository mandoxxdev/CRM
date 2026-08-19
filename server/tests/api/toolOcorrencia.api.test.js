/**
 * Etapa 9b, Task 5 — Ocorrencias (avaria/perda) com foto: RN-05 e o coracao.
 *
 * Executar: cd server && node tests/api/toolOcorrencia.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll, dbGet } = require('../../services/almoxarifado/db');

const PRODUCAO_FALLBACK = { id: 50, nome: 'Chão de Fábrica', role: 'usuario', email: 'prod@test.com' };

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
    [`FER-OCO-${seq}`, `Ferramenta ${seq}`, extra.status || 'DISPONIVEL', extra.exige_calibracao || 0]);
  return r.lastID;
}

(async () => {
  await test('AVARIA em ferramenta DISPONIVEL: status vira AVARIADA, linha criada e audita OCORRENCIA', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);

    const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/ocorrencias`)
      .field('tipo', 'AVARIA')
      .field('descricao', 'Cabo rompido no meio do uso')
      .expect(201);
    assert.ok(r.body.id, 'esperava {id} no 201');

    const f = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid]);
    assert.strictEqual(f.status, 'AVARIADA');

    const linha = await dbGet(db, 'SELECT * FROM ocorrencias_ferramenta_almoxarifado WHERE id = ?', [r.body.id]);
    assert.strictEqual(linha.ferramenta_id, fid);
    assert.strictEqual(linha.tipo, 'AVARIA');
    assert.strictEqual(linha.descricao, 'Cabo rompido no meio do uso');

    const audit = await dbAll(db,
      "SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'ferramenta' AND entidade_id = ? AND acao = 'OCORRENCIA'", [fid]);
    assert.strictEqual(audit.length, 1, 'sem auditoria de ocorrencia');
    assert.ok(/AVARIA/.test(audit[0].dados_novos), `tipo ausente em dados_novos: ${audit[0].dados_novos}`);
    await close();
  });

  await test('RN-05: perda sobre emprestada encerra o emprestimo e aplica PERDIDA', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);

    const emp = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Joao' }).expect(201);
    const empId = emp.body.id;

    const oc = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/ocorrencias`)
      .field('tipo', 'PERDA')
      .field('descricao', 'Ferramenta nao foi encontrada apos o turno')
      .expect(201);

    const emprestimo = await dbGet(db, 'SELECT * FROM emprestimos_ferramenta_almoxarifado WHERE id = ?', [empId]);
    assert.strictEqual(emprestimo.status, 'DEVOLVIDA', 'emprestimo deveria ter sido encerrado pela ocorrencia');
    assert.ok(emprestimo.data_devolucao_real, 'data_devolucao_real deveria ter sido preenchida');
    assert.ok(new RegExp(`Encerrado por ocorrência #${oc.body.id} \\(PERDA\\)`).test(emprestimo.observacoes),
      `observacoes deveria citar a ocorrencia: ${emprestimo.observacoes}`);

    const f = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid]);
    assert.strictEqual(f.status, 'PERDIDA');

    // ferramenta perdida nao pode ser emprestada de novo
    const r2 = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Maria' }).expect(400);
    assert.strictEqual(r2.body.error, 'Ferramenta não está disponível (status atual: PERDIDA)');
    await close();
  });

  await test('AVARIA sobre ferramenta emprestada tambem encerra o emprestimo e aplica AVARIADA', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    const emp = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Joao' }).expect(201);

    const oc = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/ocorrencias`)
      .field('tipo', 'AVARIA')
      .field('descricao', 'Caiu e trincou a carcaca')
      .expect(201);

    const emprestimo = await dbGet(db, 'SELECT * FROM emprestimos_ferramenta_almoxarifado WHERE id = ?', [emp.body.id]);
    assert.strictEqual(emprestimo.status, 'DEVOLVIDA');
    assert.ok(new RegExp(`Encerrado por ocorrência #${oc.body.id} \\(AVARIA\\)`).test(emprestimo.observacoes));

    const f = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid]);
    assert.strictEqual(f.status, 'AVARIADA');
    await close();
  });

  await test('foto multipart grava foto_path e o arquivo existe em uploadsAlmoxDir', async () => {
    const { app, db, close, uploadsAlmoxDir } = await createTestApp();
    const fid = await novaFerramenta(db);

    const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/ocorrencias`)
      .field('tipo', 'AVARIA')
      .field('descricao', 'Registro com foto')
      .attach('foto', Buffer.from('fake-jpg-bytes'), 'avaria.jpg')
      .expect(201);

    const linha = await dbGet(db, 'SELECT foto_path FROM ocorrencias_ferramenta_almoxarifado WHERE id = ?', [r.body.id]);
    assert.ok(linha.foto_path, 'foto_path deveria ter sido gravado');
    assert.ok(/^ocorrencia-/.test(linha.foto_path), `filename deveria comecar com ocorrencia-, veio ${linha.foto_path}`);
    const arquivo = path.join(uploadsAlmoxDir, linha.foto_path);
    assert.ok(fs.existsSync(arquivo), `arquivo nao encontrado em ${arquivo}`);
    await close();
  });

  await test('tipo invalido: 400 com mensagem literal e sem arquivo orfao quando ha foto anexada', async () => {
    const { app, db, close, uploadsAlmoxDir } = await createTestApp();
    const fid = await novaFerramenta(db);
    const arquivosAntes = fs.readdirSync(uploadsAlmoxDir).length;

    const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/ocorrencias`)
      .field('tipo', 'ROUBO')
      .field('descricao', 'Tipo que nao existe no contrato')
      .attach('foto', Buffer.from('fake-jpg-bytes'), 'avaria.jpg')
      .expect(400);
    assert.strictEqual(r.body.error, 'Tipo de ocorrência inválido');

    assert.strictEqual(fs.readdirSync(uploadsAlmoxDir).length, arquivosAntes,
      'foto ficou orfa em disco depois do 400 de tipo invalido — limparUploadOrfao nao rodou');

    const f = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid]);
    assert.strictEqual(f.status, 'DISPONIVEL', 'status nao deveria ter mudado com tipo invalido');
    await close();
  });

  await test('origem invalida: BLOQUEADA recusa com a mensagem literal, sem linha criada e sem mudar status', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    await dbRun(db, "UPDATE ferramentas_almoxarifado SET status = 'BLOQUEADA' WHERE id = ?", [fid]);

    const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/ocorrencias`)
      .field('tipo', 'AVARIA')
      .field('descricao', 'tentando registrar sobre ferramenta bloqueada')
      .expect(400);
    assert.strictEqual(r.body.error, 'Ferramenta não pode registrar ocorrência (status atual: BLOQUEADA)');

    const linhas = await dbAll(db, 'SELECT * FROM ocorrencias_ferramenta_almoxarifado WHERE ferramenta_id = ?', [fid]);
    assert.strictEqual(linhas.length, 0, 'nenhuma ocorrencia deveria ter sido criada');

    const f = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid]);
    assert.strictEqual(f.status, 'BLOQUEADA', 'status nao deveria ter mudado');
    await close();
  });

  await test('RN-09: PRODUCAO recebe 403 no POST sem gravar arquivo; GET passa', async () => {
    const { app, db, close, setUser, uploadsAlmoxDir } = await createTestApp();
    const fid = await novaFerramenta(db);
    const arquivosAntes = fs.readdirSync(uploadsAlmoxDir).length;

    setUser(PRODUCAO_FALLBACK);
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/ocorrencias`)
      .field('tipo', 'AVARIA')
      .field('descricao', 'tentando registrar')
      .attach('foto', Buffer.from('fake-jpg-bytes'), 'avaria.jpg')
      .expect(403);
    assert.strictEqual(fs.readdirSync(uploadsAlmoxDir).length, arquivosAntes,
      'multer gravou arquivo antes do 403 — requirePermission deve vir ANTES do multer');

    await request(app).get(`/api/almoxarifado/ferramentas/${fid}/ocorrencias`).expect(200);
    await close();
  });

  await test('GET /ferramentas/:id/ocorrencias lista com os campos do contrato', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/ocorrencias`)
      .field('tipo', 'AVARIA')
      .field('descricao', 'Primeira ocorrencia')
      .field('responsavel_nome', 'Carlos')
      .expect(201);

    const r = await request(app).get(`/api/almoxarifado/ferramentas/${fid}/ocorrencias`).expect(200);
    assert.strictEqual(r.body.length, 1);
    const item = r.body[0];
    assert.ok('id' in item && 'tipo' in item && 'descricao' in item && 'responsavel_nome' in item
      && 'foto_path' in item && 'created_at' in item, `campos do contrato ausentes: ${JSON.stringify(item)}`);
    assert.strictEqual(item.responsavel_nome, 'Carlos');
    await close();
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
