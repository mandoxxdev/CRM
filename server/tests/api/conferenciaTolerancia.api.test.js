/**
 * Etapa 10, Task 2 — RN-03/RN-04/RN-05/RN-06b: tolerancia, recontagem e status da conferencia.
 *
 * RN-05 protege o REGISTRO, nao so o ajuste — vale com ou sem aplicar_ajustes. RN-04 e a
 * "segunda chance": a segunda contagem do mesmo item libera a conclusao qualquer que seja o novo
 * valor, sem rodada nova de tolerancia. RN-03/D9 fecha o item que a spec 17 sempre pediu e nunca
 * foi coberto: conferencia fora de ABERTO nao aceita mais contagem.
 *
 * Executar: cd server && node tests/api/conferenciaTolerancia.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const GESTOR = { id: 2, nome: 'Gestor', role: 'usuario', perfil_almoxarifado: 'GESTOR', email: 'gestor@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };

let seq = 0;
async function novoMaterial(db, { qtd = 100 } = {}) {
  seq += 1;
  const codigo = `TOL-${seq}`;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
     VALUES (?,?,'UN',?,1)`, [codigo, `Material Tolerancia ${seq}`, qtd]);
  return { id: r.lastID, codigo };
}

async function abrirConferencia(app, body = {}) {
  const res = await request(app).post('/api/almoxarifado/conferencias').send(body);
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

async function itemDoMaterial(db, confId, materialId) {
  const item = await dbGet(db,
    `SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND material_id = ?`,
    [confId, materialId]);
  assert.ok(item, 'item nao encontrado na conferencia');
  return item;
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  await test('RN-05: divergencia acima da tolerancia sem recontagem bloqueia concluir (com ou sem aplicar_ajustes)', async () => {
    setUser(ADMIN);
    const mat = await novoMaterial(db, { qtd: 100 });
    // Sem tolerancia_percentual no body e sem config -> default declarado (2%).
    const conf = await abrirConferencia(app);
    const item = await itemDoMaterial(db, conf.id, mat.id);
    await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${item.id}`)
      .send({ quantidade_contada: 90 }); // divergencia -10, 10% > 2%

    const semAjustes = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/concluir`).send({});
    assert.strictEqual(semAjustes.status, 400, JSON.stringify(semAjustes.body));
    assert.ok(semAjustes.body.error.startsWith('Recontagem necessária antes de concluir:'), JSON.stringify(semAjustes.body));
    assert.ok(semAjustes.body.error.includes(mat.codigo), JSON.stringify(semAjustes.body));
    assert.ok(semAjustes.body.error.includes('(limite 2%)'), JSON.stringify(semAjustes.body));

    setUser(GESTOR);
    const comAjustes = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/concluir`)
      .send({ aplicar_ajustes: true, justificativa_ajuste: 'Tentando aplicar mesmo assim' });
    assert.strictEqual(comAjustes.status, 400, JSON.stringify(comAjustes.body));
    assert.ok(comAjustes.body.error.startsWith('Recontagem necessária antes de concluir:'), JSON.stringify(comAjustes.body));

    const confDepois = await dbGet(db, 'SELECT status FROM conferencias_almoxarifado WHERE id = ?', [conf.id]);
    assert.strictEqual(confDepois.status, 'ABERTO', 'RN-05 bloqueia inclusive o fechamento da contagem');
  });

  await test('RN-04: segunda chamada de PUT /item marca recontado=1 automaticamente', async () => {
    setUser(ADMIN);
    const mat = await novoMaterial(db, { qtd: 100 });
    const conf = await abrirConferencia(app);
    const item = await itemDoMaterial(db, conf.id, mat.id);

    const primeira = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${item.id}`)
      .send({ quantidade_contada: 90 });
    assert.strictEqual(primeira.status, 200, JSON.stringify(primeira.body));
    assert.strictEqual(primeira.body.recontagem, false, 'primeira contagem nao e recontagem');
    const depoisPrimeira = await dbGet(db, 'SELECT recontado FROM itens_conferencia_almoxarifado WHERE id = ?', [item.id]);
    assert.strictEqual(Number(depoisPrimeira.recontado || 0), 0);

    const segunda = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${item.id}`)
      .send({ quantidade_contada: 88 });
    assert.strictEqual(segunda.status, 200, JSON.stringify(segunda.body));
    assert.strictEqual(segunda.body.recontagem, true, 'segunda contagem do mesmo item e recontagem');
    const depoisSegunda = await dbGet(db, 'SELECT recontado FROM itens_conferencia_almoxarifado WHERE id = ?', [item.id]);
    assert.strictEqual(Number(depoisSegunda.recontado), 1);
  });

  await test('apos recontar, concluir passa qualquer que seja o novo valor', async () => {
    setUser(ADMIN);
    const mat = await novoMaterial(db, { qtd: 100 });
    const conf = await abrirConferencia(app);
    const item = await itemDoMaterial(db, conf.id, mat.id);

    await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${item.id}`)
      .send({ quantidade_contada: 50 }); // divergencia 50%, bem acima do limite
    // Recontagem: mesmo com divergencia ENORME de novo, a segunda contagem libera.
    await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${item.id}`)
      .send({ quantidade_contada: 10 });

    const res = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/concluir`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await test('RN-03: PUT /item em conferencia CONCLUIDA/CANCELADA recusa 400', async () => {
    setUser(ADMIN);
    const matConcluida = await novoMaterial(db, { qtd: 100 });
    const confConcluida = await abrirConferencia(app);
    const itemConcluida = await itemDoMaterial(db, confConcluida.id, matConcluida.id);
    const resConcluir = await request(app).put(`/api/almoxarifado/conferencias/${confConcluida.id}/concluir`).send({});
    assert.strictEqual(resConcluir.status, 200, JSON.stringify(resConcluir.body));

    const tentativaConcluida = await request(app)
      .put(`/api/almoxarifado/conferencias/${confConcluida.id}/item/${itemConcluida.id}`)
      .send({ quantidade_contada: 5 });
    assert.strictEqual(tentativaConcluida.status, 400, JSON.stringify(tentativaConcluida.body));
    assert.strictEqual(tentativaConcluida.body.error, 'Conferência não está aberta (status atual: CONCLUIDO)');

    const matCancelada = await novoMaterial(db, { qtd: 100 });
    const confCancelada = await abrirConferencia(app);
    const itemCancelada = await itemDoMaterial(db, confCancelada.id, matCancelada.id);
    const resCancelar = await request(app).put(`/api/almoxarifado/conferencias/${confCancelada.id}/cancelar`).send({});
    assert.strictEqual(resCancelar.status, 200, JSON.stringify(resCancelar.body));

    const tentativaCancelada = await request(app)
      .put(`/api/almoxarifado/conferencias/${confCancelada.id}/item/${itemCancelada.id}`)
      .send({ quantidade_contada: 5 });
    assert.strictEqual(tentativaCancelada.status, 400, JSON.stringify(tentativaCancelada.body));
    assert.strictEqual(tentativaCancelada.body.error, 'Conferência não está aberta (status atual: CANCELADO)');
  });

  await test('RN-06b: aplicar_ajustes sem justificativa_ajuste recusa 400 antes de tocar em qualquer material', async () => {
    setUser(GESTOR); // tem ajustar_estoque — a checagem que falta e a de justificativa
    const mat = await novoMaterial(db, { qtd: 100 });
    const conf = await abrirConferencia(app, { tolerancia_percentual: 50 }); // fora do escopo de RN-05 aqui
    const item = await itemDoMaterial(db, conf.id, mat.id);
    await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${item.id}`)
      .send({ quantidade_contada: 50 });

    const semJustificativa = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/concluir`)
      .send({ aplicar_ajustes: true });
    assert.strictEqual(semJustificativa.status, 400, JSON.stringify(semJustificativa.body));
    assert.strictEqual(semJustificativa.body.error, 'Justificativa deve ter pelo menos 5 caracteres');

    const justificativaCurta = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/concluir`)
      .send({ aplicar_ajustes: true, justificativa_ajuste: 'oi' });
    assert.strictEqual(justificativaCurta.status, 400, JSON.stringify(justificativaCurta.body));
    assert.strictEqual(justificativaCurta.body.error, 'Justificativa deve ter pelo menos 5 caracteres');

    const material = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat.id]);
    assert.strictEqual(Number(material.quantidade_atual), 100, 'nada deveria ter sido tocado sem justificativa valida');
    const confDepois = await dbGet(db, 'SELECT status FROM conferencias_almoxarifado WHERE id = ?', [conf.id]);
    assert.strictEqual(confDepois.status, 'ABERTO');
  });

  await test('tolerancia_percentual=0 na criacao NAO cai no default 2 (achado da Fase 2, cuidado com ||)', async () => {
    setUser(ADMIN);
    const conf = await abrirConferencia(app, { tolerancia_percentual: 0 });
    assert.strictEqual(conf.tolerancia_percentual, 0, JSON.stringify(conf));

    const mat = await novoMaterial(db, { qtd: 100 });
    // Precisa entrar NESTA conferencia — reabre com categoria vazia ja incluiria o material
    // recem-criado so se a conferencia for criada DEPOIS dele. Cria a conferencia de novo aqui.
    const conf2 = await abrirConferencia(app, { tolerancia_percentual: 0 });
    const item = await itemDoMaterial(db, conf2.id, mat.id);
    await request(app).put(`/api/almoxarifado/conferencias/${conf2.id}/item/${item.id}`)
      .send({ quantidade_contada: 99 }); // divergencia de so 1%, mas tolerancia e 0

    const res = await request(app).put(`/api/almoxarifado/conferencias/${conf2.id}/concluir`).send({});
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(res.body.error.includes('(limite 0%)'), 'tolerancia 0 caiu no default 2 (uso de || em vez de Number.isFinite)');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
