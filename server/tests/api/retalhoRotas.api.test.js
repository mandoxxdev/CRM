/**
 * Etapa 9, Task 4 — as rotas do retalho: POST /sobras/gerar-retalho e
 * GET /materiais/:id/retalhos-disponiveis.
 *
 * O SERVICO ja tem teste proprio (retalhoGeracao.api.test.js — as pernas, a compensacao, o
 * schema). Aqui o alvo e o que SO a rota pode errar, no mesmo molde de remessaTerceiroRotas:
 *
 *  1. o gate de permissao (`movimentar`, REAL no harness) no POST;
 *  2. a validacao Zod devolvendo 400 (nao 500) quando falta campo obrigatorio;
 *  3. a propagacao do erro do servico como 400 com a mensagem intacta;
 *  4. o filtro de `retalhos-disponiveis`: DISPONIVEL + reutilizavel=1 + disponivel do
 *     material-retalho > 0 (a formula vem de availabilitySql.js, nunca escrita a mao) — com
 *     CONTROLE POSITIVO drenando o saldo do retalho e provando que ele PARA de aparecer.
 *
 * Executar: cd server && node tests/api/retalhoRotas.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
// Perfil EXPLICITO, nunca "usuario sem perfil": getPerfilFromUser faz fallback para PRODUCAO —
// um usuario vazio passaria pelo motivo errado (ver remessaTerceiroRotas.api.test.js).
const PRODUCAO = { id: 9, nome: 'Chao de fabrica', email: 'prod@test.com', perfil_almoxarifado: 'PRODUCAO' };

let seq = 0;
async function novoMaterial(db, { atual = 0, ativo = 1 } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
     VALUES (?,?,'UN',?,?)`, [`RTR-${seq}`, `Material rota retalho ${seq}`, atual, ativo]);
  return r.lastID;
}

(async () => {
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });

  const corpoValido = async () => {
    const origem = await novoMaterial(db, { atual: 100 });
    const retalho = await novoMaterial(db, { atual: 0 });
    return {
      origem, retalho,
      body: {
        material_origem_id: origem, material_retalho_id: retalho,
        baixar_original: true, quantidade_baixa: 30, quantidade_retalho: 1,
        justificativa: 'corte de teste da rota',
      },
    };
  };

  // ── Permissao ────────────────────────────────────────────────────────────────────────────────
  await test('POST /sobras/gerar-retalho sem perfil movimentar (PRODUCAO) -> 403 e nao cria nada', async () => {
    const { body } = await corpoValido();
    setUser(PRODUCAO);
    const res = await request(app).post('/api/almoxarifado/sobras/gerar-retalho').send(body);
    setUser(ADMIN);
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.strictEqual(res.body.acao, 'movimentar');
    const n = await dbGet(db, 'SELECT COUNT(*) AS n FROM sobras_material_almoxarifado');
    assert.strictEqual(n.n, 0, 'a sobra foi gravada apesar do 403');
  });

  // ── Validacao Zod ────────────────────────────────────────────────────────────────────────────
  await test('POST /sobras/gerar-retalho sem material_origem_id -> 400 (Zod), nao 500', async () => {
    const { body } = await corpoValido();
    delete body.material_origem_id;
    const res = await request(app).post('/api/almoxarifado/sobras/gerar-retalho').send(body);
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('POST /sobras/gerar-retalho sem declarar baixar_original -> 400 (Zod)', async () => {
    const { body } = await corpoValido();
    delete body.baixar_original;
    const res = await request(app).post('/api/almoxarifado/sobras/gerar-retalho').send(body);
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  // ── Caminho feliz ────────────────────────────────────────────────────────────────────────────
  await test('[CONTROLE POSITIVO] POST /sobras/gerar-retalho valido -> 201 com sobra e os dois ids de movimentacao', async () => {
    const { body, origem, retalho } = await corpoValido();
    const res = await request(app).post('/api/almoxarifado/sobras/gerar-retalho').send(body);
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.sobra && res.body.sobra.id, 'resposta sem a sobra criada');
    assert.strictEqual(res.body.sobra.material_id, origem, 'sobra nao referencia o material de origem');
    assert.strictEqual(res.body.sobra.material_retalho_id, retalho, 'sobra nao referencia o material-retalho');
    assert.ok(res.body.movimentacao_baixa_id, 'resposta sem o id da movimentacao de baixa');
    assert.ok(res.body.movimentacao_entrada_id, 'resposta sem o id da movimentacao de entrada');

    const origemRow = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [origem]);
    assert.strictEqual(origemRow.quantidade_atual, 70, 'a rota nao aplicou a baixa do material de origem');
    const retalhoRow = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [retalho]);
    assert.strictEqual(retalhoRow.quantidade_atual, 1, 'a rota nao creditou o material-retalho');
  });

  // ── Propagacao do erro do servico ───────────────────────────────────────────────────────────
  await test('regra de negocio do servico chega como 400 com a mensagem intacta (nao 500)', async () => {
    const origem = await novoMaterial(db, { atual: 5 });
    const retalho = await novoMaterial(db, { atual: 0 });
    const res = await request(app).post('/api/almoxarifado/sobras/gerar-retalho').send({
      material_origem_id: origem, material_retalho_id: retalho,
      baixar_original: true, quantidade_baixa: 50, justificativa: 'corte maior que o saldo',
    });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error, /saldo/i);
  });

  await test('material do retalho inexistente devolve 400 com a mensagem do servico', async () => {
    const origem = await novoMaterial(db, { atual: 10 });
    const res = await request(app).post('/api/almoxarifado/sobras/gerar-retalho').send({
      material_origem_id: origem, material_retalho_id: 999999, baixar_original: false,
    });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error, /cadastre o material/i);
  });

  // ── GET /materiais/:id/retalhos-disponiveis ─────────────────────────────────────────────────
  await test('GET /materiais/:id/retalhos-disponiveis nao exige permissao — so auth (leitura)', async () => {
    const { body, origem } = await corpoValido();
    await request(app).post('/api/almoxarifado/sobras/gerar-retalho').send(body);
    setUser(PRODUCAO);
    const res = await request(app).get(`/api/almoxarifado/materiais/${origem}/retalhos-disponiveis`);
    setUser(ADMIN);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await test('[CONTROLE POSITIVO] retalhos-disponiveis devolve a sobra recem criada e PARA de devolver quando o saldo do retalho zera', async () => {
    const { body, origem, retalho } = await corpoValido();
    const criado = await request(app).post('/api/almoxarifado/sobras/gerar-retalho').send(body);
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const sobraId = criado.body.sobra.id;

    const antesDeSecar = await request(app).get(`/api/almoxarifado/materiais/${origem}/retalhos-disponiveis`);
    assert.strictEqual(antesDeSecar.status, 200, JSON.stringify(antesDeSecar.body));
    assert.ok(antesDeSecar.body.some((s) => s.id === sobraId),
      'a sobra recem criada nao apareceu em retalhos-disponiveis');
    // Campos que a rota promete: dimensoes/norma/peso/localizacao e o disponivel do retalho.
    const linha = antesDeSecar.body.find((s) => s.id === sobraId);
    for (const campo of ['dimensoes_originais', 'dimensoes_restantes', 'norma', 'peso_aproximado', 'localizacao_id']) {
      assert.ok(campo in linha, `resposta de retalhos-disponiveis sem o campo ${campo}`);
    }
    assert.ok('material_retalho_disponivel' in linha, 'resposta sem o disponivel do material-retalho');
    assert.strictEqual(linha.material_retalho_disponivel, 1, 'disponivel do retalho errado logo apos a geracao');

    // Drena o saldo do material-retalho (SAIDA pelo motor) — disponivel(retalho) cai a zero.
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: retalho, tipo: 'SAIDA', quantidade: 1, justificativa: 'drenar para o teste do filtro',
    });
    const retalhoRow = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [retalho]);
    assert.strictEqual(retalhoRow.quantidade_atual, 0, 'setup: a drenagem nao zerou o material-retalho');

    const depoisDeSecar = await request(app).get(`/api/almoxarifado/materiais/${origem}/retalhos-disponiveis`);
    assert.strictEqual(depoisDeSecar.status, 200, JSON.stringify(depoisDeSecar.body));
    assert.ok(!depoisDeSecar.body.some((s) => s.id === sobraId),
      'a sobra continuou aparecendo mesmo com o material-retalho zerado — o filtro de disponivel nao esta funcionando');
  });

  await test('retalhos-disponiveis nao vaza sobra CONSUMIDA nem sobra de outro material de origem', async () => {
    const { body, origem } = await corpoValido();
    const criado = await request(app).post('/api/almoxarifado/sobras/gerar-retalho').send(body);
    const sobraId = criado.body.sobra.id;
    await dbRun(db, "UPDATE sobras_material_almoxarifado SET status = 'CONSUMIDA' WHERE id = ?", [sobraId]);

    const outraOrigem = await novoMaterial(db, { atual: 50 });
    const res = await request(app).get(`/api/almoxarifado/materiais/${outraOrigem}/retalhos-disponiveis`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.length, 0, 'vazou sobra que pertence a outro material de origem');

    const resOrigem = await request(app).get(`/api/almoxarifado/materiais/${origem}/retalhos-disponiveis`);
    assert.ok(!resOrigem.body.some((s) => s.id === sobraId), 'vazou sobra ja CONSUMIDA');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
