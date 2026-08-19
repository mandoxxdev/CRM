/**
 * Etapa 9b, Task 8 — Integracao cruzando galhos: a jornada completa da ferramenta prova que as
 * partes de Tasks 1-7 COMPOEM. Verde por unidade nao prova isso — este teste cruza calibracao
 * (Task 3), emprestimo/devolucao (Task 2), ocorrencia (Task 5), manutencao (Task 4) e auditoria
 * (RN-11, atravessa todas) numa unica sequencia sobre a MESMA ferramenta.
 *
 * Executar: cd server && node tests/api/toolIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbAll, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

(async () => {
  await test('jornada: calibra -> empresta -> avaria -> conserta -> devolve, auditoria em subsequencia e ausente do painel', async () => {
    const { app, db, close } = await createTestApp();

    // 1. cria ferramenta exigindo calibracao
    const criar = await request(app).post('/api/almoxarifado/ferramentas')
      .send({ codigo_patrimonio: 'FER-INT-1', nome: 'Furadeira de Impacto', exige_calibracao: 1 })
      .expect(201);
    const fid = criar.body.id;
    assert.ok(fid, 'esperava {id} na criacao da ferramenta');

    // 2. emprestar sem calibracao alguma: RN-03, mensagem literal do contrato
    const semCal = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Joao' }).expect(400);
    assert.strictEqual(semCal.body.error, 'Ferramenta com calibração vencida ou sem calibração registrada');

    // 3. registra calibracao vigente (Task 3, multipart)
    const cal = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/calibracoes`)
      .field('data_calibracao', '2026-01-01')
      .field('data_validade', '2030-01-01')
      .expect(201);
    assert.ok(cal.body.id, 'esperava {id} no registro de calibracao');

    // 4. RN-08: agora empresta
    const emp1 = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Joao' }).expect(201);
    const emp1Id = emp1.body.id;
    assert.ok(emp1Id, 'esperava {id} no emprestimo');

    // 5. AVARIA durante o emprestimo (Task 5)
    const oc = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/ocorrencias`)
      .field('tipo', 'AVARIA')
      .field('descricao', 'Motor travou durante o uso')
      .expect(201);
    assert.ok(oc.body.id, 'esperava {id} na ocorrencia');

    // 6. RN-05: a ocorrencia fecha o emprestimo aberto e muda a ferramenta para AVARIADA
    const empFechado = await dbGet(db, 'SELECT * FROM emprestimos_ferramenta_almoxarifado WHERE id = ?', [emp1Id]);
    assert.strictEqual(empFechado.status, 'DEVOLVIDA', 'RN-05: a ocorrencia deveria ter fechado o emprestimo');
    assert.ok(empFechado.data_devolucao_real, 'RN-05: data_devolucao_real deveria ter sido preenchida');
    const fAvariada = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid]);
    assert.strictEqual(fAvariada.status, 'AVARIADA');

    // 7. emprestar ferramenta avariada: RN-02, mensagem literal citando AVARIADA
    const rnAvariada = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Maria' }).expect(400);
    assert.strictEqual(rnAvariada.body.error, 'Ferramenta não está disponível (status atual: AVARIADA)');

    // 8. RN-07: inicia manutencao sobre AVARIADA (Task 4)
    const manut = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/manutencoes`)
      .send({ descricao: 'Troca de motor' }).expect(201);
    assert.ok(manut.body.id, 'esperava {id} na manutencao');
    const fEmManutencao = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid]);
    assert.strictEqual(fEmManutencao.status, 'EM_MANUTENCAO');

    // 9. concluir manutencao -> volta DISPONIVEL
    await request(app).put(`/api/almoxarifado/manutencoes/${manut.body.id}/concluir`)
      .send({ observacoes: 'motor trocado, testado' }).expect(200);
    const fDisponivel = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid]);
    assert.strictEqual(fDisponivel.status, 'DISPONIVEL');

    // 10. emprestar de novo: 201 -> devolver: 200 (RN-04)
    const emp2 = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Carlos' }).expect(201);
    const emp2Id = emp2.body.id;
    assert.ok(emp2Id, 'esperava {id} no segundo emprestimo');
    await request(app).post(`/api/almoxarifado/emprestimos/${emp2Id}/devolver`).send({}).expect(200);
    const empFinal = await dbGet(db,
      'SELECT status, data_devolucao_real FROM emprestimos_ferramenta_almoxarifado WHERE id = ?', [emp2Id]);
    assert.strictEqual(empFinal.status, 'DEVOLVIDA');
    assert.ok(empFinal.data_devolucao_real, 'RN-04: data_devolucao_real deveria ter sido preenchida');

    // 11. auditoria da ferramenta: SUBSEQUENCIA em ordem, nao igualdade — RN-11 obriga a
    //     manutencao a auditar tambem (MANUTENCAO_INICIO/MANUTENCAO_FIM), entao ha entradas
    //     intercaladas entre a OCORRENCIA e o segundo EMPRESTIMO.
    const audit = await dbAll(db,
      `SELECT acao FROM auditoria_log_almoxarifado WHERE entidade = 'ferramenta' AND entidade_id = ?
       ORDER BY id ASC`, [fid]);
    const acoes = audit.map((a) => a.acao);
    const esperadaSubsequencia = ['CALIBRACAO', 'EMPRESTIMO', 'OCORRENCIA', 'EMPRESTIMO', 'DEVOLUCAO'];
    let cursor = 0;
    for (const acao of acoes) {
      if (cursor < esperadaSubsequencia.length && acao === esperadaSubsequencia[cursor]) cursor += 1;
    }
    assert.strictEqual(cursor, esperadaSubsequencia.length,
      `auditoria nao contem a subsequencia esperada ${JSON.stringify(esperadaSubsequencia)} em ordem, veio ${JSON.stringify(acoes)}`);
    assert.ok(acoes.includes('MANUTENCAO_INICIO') && acoes.includes('MANUTENCAO_FIM'),
      `manutencao deveria ter auditado tambem (RN-11), entradas intercaladas esperadas: ${JSON.stringify(acoes)}`);

    // 12. painel de calibracao NAO lista a ferramenta (calibracao ainda vigente ate 2030)
    const painel = await request(app).get('/api/almoxarifado/calibracoes/painel?dias=30').expect(200);
    const idsPainel = [...painel.body.vencidas, ...painel.body.a_vencer].map((i) => i.id);
    assert.ok(!idsPainel.includes(fid),
      `ferramenta com calibracao vigente vazou no painel: ${JSON.stringify(painel.body)}`);

    await close();
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
