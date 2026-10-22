/**
 * Etapa 9b — revisao final de branch, achado F3: PUT /ferramentas/:id e o 409 de patrimonio
 * duplicado nao tinham nenhum teste (a rota existe desde a Task 1/2, mas nunca foi exercitada).
 * A UI de edicao propriamente dita NAO foi entregue nesta etapa (corte descoberto na revisao
 * final, ver D9 do design) — este arquivo cobre so o contrato de API que ja existe.
 *
 * Executar: cd server && node tests/api/toolFerramentaEdicao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbGet, dbRun } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

let seq = 0;
async function novaFerramenta(app, extra = {}) {
  seq += 1;
  const r = await request(app).post('/api/almoxarifado/ferramentas')
    .send({ codigo_patrimonio: `PAT-EDIT-${seq}`, nome: `Ferramenta ${seq}`, ...extra })
    .expect(201);
  return r.body.id;
}

(async () => {
  await test('PUT atualiza nome, localizacao_id e exige_calibracao', async () => {
    const { app, db, close } = await createTestApp();
    // localizacao_id so precisa existir como numero para a coluna aceitar — nao ha FK checada
    // aqui (mesma liberdade que o resto do modulo da a localizacao_id em ferramentas).
    const fid = await novaFerramenta(app);

    const r = await request(app).put(`/api/almoxarifado/ferramentas/${fid}`)
      .send({ nome: 'Furadeira revisada', localizacao_id: 1, exige_calibracao: true })
      .expect(200);
    assert.strictEqual(r.body.id, fid);

    const linha = await dbGet(db, 'SELECT * FROM ferramentas_almoxarifado WHERE id = ?', [fid]);
    assert.strictEqual(linha.nome, 'Furadeira revisada');
    assert.strictEqual(linha.localizacao_id, 1);
    assert.strictEqual(linha.exige_calibracao, 1);
    await close();
  });

  await test('PUT em id inexistente devolve 404', async () => {
    const { app, close } = await createTestApp();
    const r = await request(app).put('/api/almoxarifado/ferramentas/999999')
      .send({ nome: 'Nao existe' }).expect(404);
    assert.strictEqual(r.body.error, 'Ferramenta não encontrada');
    await close();
  });

  await test('POST duplicando codigo_patrimonio devolve 409 com a mensagem literal do contrato', async () => {
    const { app, close } = await createTestApp();
    await request(app).post('/api/almoxarifado/ferramentas')
      .send({ codigo_patrimonio: 'PAT-DUP-1', nome: 'Primeira' }).expect(201);
    const r = await request(app).post('/api/almoxarifado/ferramentas')
      .send({ codigo_patrimonio: 'PAT-DUP-1', nome: 'Segunda' }).expect(409);
    assert.strictEqual(r.body.error, 'Código de patrimônio já cadastrado');
    await close();
  });

  // ── Etapa 175 (edicao pela tela) — o contrato que a tela passa a consumir ──────────────────
  await test('RN-175.07: PUT que repete o patrimonio de OUTRA ferramenta -> 409 e nada muda', async () => {
    const { app, db, close } = await createTestApp();
    const a = await novaFerramenta(app);
    const b = await novaFerramenta(app);
    const codigoA = (await dbGet(db, 'SELECT codigo_patrimonio FROM ferramentas_almoxarifado WHERE id = ?', [a])).codigo_patrimonio;
    const r = await request(app).put(`/api/almoxarifado/ferramentas/${b}`)
      .send({ codigo_patrimonio: codigoA, nome: 'Trocada' }).expect(409);
    assert.strictEqual(r.body.error, 'Código de patrimônio já cadastrado');
    const linhaB = await dbGet(db, 'SELECT codigo_patrimonio, nome FROM ferramentas_almoxarifado WHERE id = ?', [b]);
    assert.notStrictEqual(linhaB.codigo_patrimonio, codigoA);
    assert.notStrictEqual(linhaB.nome, 'Trocada');
    await close();
  });

  await test('RN-175.07: PUT com o PROPRIO patrimonio passa (a tela manda os 9 campos sempre)', async () => {
    const { app, db, close } = await createTestApp();
    const a = await novaFerramenta(app);
    const { codigo_patrimonio } = await dbGet(db, 'SELECT codigo_patrimonio FROM ferramentas_almoxarifado WHERE id = ?', [a]);
    await request(app).put(`/api/almoxarifado/ferramentas/${a}`)
      .send({ codigo_patrimonio, nome: 'Mesmo codigo, nome novo' }).expect(200);
    const linha = await dbGet(db, 'SELECT nome FROM ferramentas_almoxarifado WHERE id = ?', [a]);
    assert.strictEqual(linha.nome, 'Mesmo codigo, nome novo');
    await close();
  });

  await test('RN-175.07: null nos opcionais limpa o gravado, e o PUT nao muda o status', async () => {
    const { app, db, close } = await createTestApp();
    const a = await novaFerramenta(app, {
      tipo: 'Eletrica', setor_responsavel: 'Producao', numero_serie: 'SN-9', localizacao_id: 3, observacoes: 'obs',
    });
    await request(app).post(`/api/almoxarifado/ferramentas/${a}/bloquear`).send({ justificativa: 'teste' }).expect(200);
    await request(app).put(`/api/almoxarifado/ferramentas/${a}`).send({
      tipo: null, setor_responsavel: null, numero_serie: null, localizacao_id: null, material_id: null, observacoes: null,
    }).expect(200);
    const l = await dbGet(db, 'SELECT * FROM ferramentas_almoxarifado WHERE id = ?', [a]);
    assert.strictEqual(l.tipo, null);
    assert.strictEqual(l.setor_responsavel, null);
    assert.strictEqual(l.numero_serie, null);
    assert.strictEqual(l.localizacao_id, null);
    assert.strictEqual(l.observacoes, null);
    assert.strictEqual(l.status, 'BLOQUEADA');
    await close();
  });

  // Revisao adversarial (Fase 5): o cenario acima mandava material_id: null numa ferramenta que ja
  // nao tinha material, e nem tocava em exige_calibracao — nao provava que null/false LIMPAM o
  // gravado. Aqui a ferramenta nasce com material e exigindo calibracao, e o PUT zera os dois.
  await test('RN-175.07: material_id null e exige_calibracao false limpam material e calibracao gravados', async () => {
    const { app, db, close } = await createTestApp();
    const matId = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
      VALUES ('E175-MAT-1', 'Material da ferramenta', 'UN', 0, 1)`)).lastID;
    const a = await novaFerramenta(app, { material_id: matId, exige_calibracao: true });
    const antes = await dbGet(db, 'SELECT material_id, exige_calibracao FROM ferramentas_almoxarifado WHERE id = ?', [a]);
    assert.strictEqual(antes.material_id, matId);
    assert.strictEqual(antes.exige_calibracao, 1);
    await request(app).put(`/api/almoxarifado/ferramentas/${a}`)
      .send({ material_id: null, exige_calibracao: false }).expect(200);
    const l = await dbGet(db, 'SELECT material_id, exige_calibracao FROM ferramentas_almoxarifado WHERE id = ?', [a]);
    assert.strictEqual(l.material_id, null);
    assert.strictEqual(l.exige_calibracao, 0);
    // e o GET que a tela le devolve o mesmo
    const lista = await request(app).get('/api/almoxarifado/ferramentas').expect(200);
    const doGet = lista.body.find((f) => f.id === a);
    assert.strictEqual(doGet.material_id, null);
    assert.strictEqual(doGet.exige_calibracao, 0);
    assert.strictEqual(doGet.calibracao_vigente, null);
    await close();
  });

  await test('RN-175.08 (integracao): marcar "exige calibracao" pelo PUT faz o proximo emprestimo recusar; desmarcar libera', async () => {
    const { app, close } = await createTestApp();
    const a = await novaFerramenta(app);
    await request(app).put(`/api/almoxarifado/ferramentas/${a}`).send({ exige_calibracao: true }).expect(200);
    const r = await request(app).post(`/api/almoxarifado/ferramentas/${a}/emprestar`)
      .send({ colaborador_nome: 'Ana' }).expect(400);
    assert.strictEqual(r.body.error, 'Ferramenta com calibração vencida ou sem calibração registrada');
    // a tela manda o 0/1 que o GET devolveu quando a pessoa nao mexe no campo
    await request(app).put(`/api/almoxarifado/ferramentas/${a}`).send({ exige_calibracao: 0 }).expect(200);
    await request(app).post(`/api/almoxarifado/ferramentas/${a}/emprestar`)
      .send({ colaborador_nome: 'Ana' }).expect(201);
    await close();
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
