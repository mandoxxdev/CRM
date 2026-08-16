/**
 * Etapa 9, Task 1 — sobra reformada: auditoria, Zod, usuario gravado, POST avulso aposentado.
 *
 * scrapService era uma ilha de 37 linhas: SQL direto, sem validacao, sem auditoria, e o `user`
 * de atualizarSobra era parametro morto (nunca lido). Isso pagava a pendencia nomeada na spec 23
 * — o unico servico de cauda do modulo sem auditoria. Este arquivo prova as duas pontas do
 * fechamento: auditoria GRAVA de verdade (controle positivo: conta linhas antes/depois da
 * chamada, nao so `> 0`, que passaria mesmo cego) e o POST avulso (que recriaria a ilha, agora
 * que gerarRetalho na Task 3 e o unico caminho de criacao) morreu.
 *
 * Executar: cd server && node tests/api/sobras.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const PRODUCAO = { id: 9, nome: 'Producao Teste', role: 'user', email: 'prod@test.com', perfil_almoxarifado: 'PRODUCAO' };

let seq = 0;
async function novoMaterial(db) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote)
     VALUES (?,?,'UN',0,1,0)`, [`SOB-${seq}`, `Material sobra ${seq}`]);
  return r.lastID;
}

// A rota de criacao avulsa saiu nesta task (o caminho unico passa a ser gerarRetalho, Task 3).
// Insercao direta simula uma sobra ja existente — legada ou gerada pela Task 3 — do jeito que o
// banco realmente guarda uma linha.
async function novaSobra(db, overrides = {}) {
  const materialId = overrides.material_id !== undefined ? overrides.material_id : await novoMaterial(db);
  const r = await dbRun(db, `INSERT INTO sobras_material_almoxarifado
    (material_id, tipo_material, dimensoes_originais, norma, material_descricao, status, reutilizavel)
    VALUES (?,?,?,?,?,?,1)`, [
    materialId, overrides.tipo_material || 'CHAPA',
    overrides.dimensoes_originais || '1000x500', overrides.norma || 'A36',
    overrides.material_descricao || 'Sobra de teste', overrides.status || 'DISPONIVEL',
  ]);
  return r.lastID;
}

(async () => {
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });

  await test('GET /sobras filtra por material_id (origem) e por q', async () => {
    const matA = await novoMaterial(db);
    const matB = await novoMaterial(db);
    await novaSobra(db, { material_id: matA, norma: 'ASTM-A36-FILTRO', material_descricao: 'Chapa retalhada A' });
    await novaSobra(db, { material_id: matB, norma: 'OUTRA-NORMA', material_descricao: 'Chapa retalhada B' });

    const porMaterial = await request(app).get('/api/almoxarifado/sobras').query({ material_id: matA });
    assert.strictEqual(porMaterial.status, 200, JSON.stringify(porMaterial.body));
    assert.ok(porMaterial.body.length >= 1, 'filtro material_id nao achou a sobra esperada');
    assert.ok(porMaterial.body.every((s) => s.material_id === matA),
      'filtro material_id (origem) vazou sobra de outro material');

    const porQ = await request(app).get('/api/almoxarifado/sobras').query({ q: 'ASTM-A36-FILTRO' });
    assert.strictEqual(porQ.status, 200, JSON.stringify(porQ.body));
    assert.ok(porQ.body.some((s) => s.norma === 'ASTM-A36-FILTRO'), 'filtro q nao achou pela norma');
    assert.ok(porQ.body.every((s) => s.norma === 'ASTM-A36-FILTRO'),
      'filtro q trouxe sobra que nao bate com o termo buscado');
  });

  await test('PUT /sobras/:id com status fora do enum -> 400', async () => {
    const id = await novaSobra(db);
    const res = await request(app).put(`/api/almoxarifado/sobras/${id}`).send({ status: 'RESERVADA' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('PUT /sobras/:id valido grava auditoria (controle positivo) e persiste', async () => {
    const id = await novaSobra(db);
    const antes = await dbAll(db,
      "SELECT id FROM auditoria_log_almoxarifado WHERE entidade='sobra' AND entidade_id=?", [id]);
    assert.strictEqual(antes.length, 0, 'setup errado: ja havia auditoria para esta sobra antes do PUT');

    const res = await request(app).put(`/api/almoxarifado/sobras/${id}`)
      .send({ status: 'CONSUMIDA', observacoes: 'consumida no retrabalho X' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'CONSUMIDA', 'PUT nao devolveu o novo status na resposta');

    const persistida = await dbGet(db,
      'SELECT status, observacoes FROM sobras_material_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(persistida.status, 'CONSUMIDA', 'PUT nao persistiu o status no banco');
    assert.strictEqual(persistida.observacoes, 'consumida no retrabalho X', 'PUT nao persistiu observacoes');

    // CONTROLE POSITIVO: sem a chamada de registrarAuditoria esta contagem continua 0 — e
    // exatamente esta assercao que a sabotagem do Step 5 (comentar a chamada) tem de derrubar.
    const linhas = await dbAll(db,
      "SELECT acao, usuario_id, dados_anteriores, dados_novos FROM auditoria_log_almoxarifado WHERE entidade='sobra' AND entidade_id=?", [id]);
    assert.strictEqual(linhas.length, 1, `esperava 1 linha de auditoria, achou ${linhas.length} — atualizarSobra nao esta gravando`);
    assert.strictEqual(linhas[0].acao, 'atualizar');
    assert.strictEqual(linhas[0].usuario_id, ADMIN.id, 'auditoria nao gravou o usuario que fez o PUT');

    const anteriores = JSON.parse(linhas[0].dados_anteriores);
    const novos = JSON.parse(linhas[0].dados_novos);
    assert.strictEqual(anteriores.status, 'DISPONIVEL', 'dados_anteriores nao capturou o status de antes do PUT');
    assert.strictEqual(novos.status, 'CONSUMIDA', 'dados_novos nao capturou o status de depois do PUT');
  });

  await test('PUT /sobras/:id sem perfil de movimentar (PRODUCAO) -> 403', async () => {
    const id = await novaSobra(db);
    setUser(PRODUCAO);
    const res = await request(app).put(`/api/almoxarifado/sobras/${id}`).send({ status: 'CONSUMIDA' });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    setUser(ADMIN);
  });

  await test('POST /sobras -> 404 (rota avulsa aposentada)', async () => {
    const res = await request(app).post('/api/almoxarifado/sobras').send({ material_descricao: 'tentativa avulsa' });
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
  });

  await test('relatorio sobras-disponiveis continua funcionando', async () => {
    const mat = await novoMaterial(db);
    await novaSobra(db, { material_id: mat, status: 'DISPONIVEL' });
    const res = await request(app).get('/api/almoxarifado/relatorios/sobras-disponiveis');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body), 'relatorio sobras-disponiveis nao devolveu lista');
    assert.ok(res.body.every((s) => s.status === 'DISPONIVEL' && s.reutilizavel === 1),
      'relatorio sobras-disponiveis vazou sobra indisponivel ou nao reutilizavel');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
