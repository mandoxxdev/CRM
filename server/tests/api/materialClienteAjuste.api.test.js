/**
 * Etapa 8, Task 4 — decisao 7 do design: ajuste de material de cliente exige a acao dedicada
 * `ajustar_material_cliente`, mais estreita que `ajustar_estoque` (ja ADMINISTRADOR/GESTOR),
 * com justificativa obrigatoria e auditoria NOMEANDO o cliente proprietario.
 *
 * CUIDADO com o harness: getPerfilFromUser faz fallback para PRODUCAO, entao "usuario sem perfil"
 * NAO e "sem acesso" — e chao de fabrica. Todo teste de negativa aqui usa perfil EXPLICITO.
 *
 * Por que a checagem e testada pelas DUAS rotas (v1 e v2): ela vive no MOTOR, nao em
 * requirePermission. As duas rotas tem gate `movimentar` (o mais amplo) — proteger so a v2
 * deixaria a v1 aberta. O caso `[v1]` abaixo e o que prova que o motor cobre as duas.
 *
 * Executar: cd server && node tests/api/materialClienteAjuste.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { ACAO_PERFIS, can } = require('../../services/almoxarifado/permissions');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const GESTOR = { id: 2, nome: 'Gestor Teste', role: 'user', email: 'gestor@test.com', perfil_almoxarifado: 'GESTOR' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };

let seq = 0;
async function novoMaterial(db, { qtd = 100, proprietario_cliente_id = null } = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, proprietario_cliente_id)
    VALUES (?, ?, 'PC', ?, 0, 25, 1, ?)`,
  [`T8-AJU-${seq}`, `Chapa 3mm ${seq}`, qtd, proprietario_cliente_id]);
  return r.lastID;
}
const totalDoMaterial = async (db, id) => (await dbGet(db,
  'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });
  const cliA = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Alfa LTDA'])).lastID;
  const cliB = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Beta SA'])).lastID;

  await test('a acao ajustar_material_cliente existe e e mais estreita que ajustar_estoque', async () => {
    assert.ok(ACAO_PERFIS.ajustar_material_cliente, 'acao ajustar_material_cliente ausente de ACAO_PERFIS');
    assert.ok(ACAO_PERFIS.ajustar_material_cliente.length < ACAO_PERFIS.ajustar_estoque.length,
      'ajustar_material_cliente nao ficou mais estreita que ajustar_estoque');
    assert.strictEqual(can(GESTOR, 'ajustar_estoque'), true, 'GESTOR perdeu ajustar_estoque');
    assert.strictEqual(can(GESTOR, 'ajustar_material_cliente'), false, 'GESTOR nao devia ajustar material de cliente');
    assert.strictEqual(can(ALMOXARIFE, 'ajustar_material_cliente'), false);
    assert.strictEqual(can(ADMIN, 'ajustar_material_cliente'), true);
  });

  await test('GET /minhas-permissoes publica a acao nova (a UI barra antes do formulario)', async () => {
    setUser(GESTOR);
    const res = await request(app).get('/api/almoxarifado/minhas-permissoes');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.acoes.ajustar_material_cliente, false);
    setUser(ADMIN);
    const res2 = await request(app).get('/api/almoxarifado/minhas-permissoes');
    assert.strictEqual(res2.body.acoes.ajustar_material_cliente, true);
  });

  await test('[v2] ajuste de material de cliente sem permissao falha com 403 e nomeia o dono', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    setUser(ALMOXARIFE);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 55, motivo: 'inventario',
        justificativa: 'contagem fisica divergente' });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.ok(/Cliente Alfa LTDA/.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 100, 'o ajuste recusado nao podia mudar o saldo');
    setUser(ADMIN);
  });

  await test('[v1] a MESMA recusa vale para POST /movimentacoes (a guarda esta no motor, nao na rota)', async () => {
    // Este e o caso que justifica a decisao de desenho. A v1 tem o mesmo gate `movimentar`;
    // se a checagem tivesse sido posta em requirePermission na v2, este POST passaria com 201.
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliB });
    setUser(ALMOXARIFE);
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 42, motivo: 'contagem fisica divergente' });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.ok(/Cliente Beta SA/.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 100, 'a v1 mexeu no saldo de material de cliente sem permissao');
    setUser(ADMIN);
  });

  await test('[v2] AJUSTE_NEGATIVO e AJUSTE_POSITIVO tambem caem na permissao', async () => {
    for (const tipo of ['AJUSTE_NEGATIVO', 'AJUSTE_POSITIVO']) {
      const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
      setUser(ALMOXARIFE);
      const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
        .send({ material_id: mat, tipo, quantidade: 5, justificativa: 'sobra de corte' });
      assert.strictEqual(res.status, 403, `${tipo}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(await totalDoMaterial(db, mat), 100, `${tipo} recusado mexeu no saldo`);
    }
    setUser(ADMIN);
  });

  await test('ajuste de material de cliente sem justificativa falha mesmo com permissao', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    setUser(ADMIN);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 55, motivo: 'inventario' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/justificativa/i.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 100);
  });

  await test('ajuste com permissao e justificativa funciona e audita nomeando o cliente', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliB });
    setUser(ADMIN);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 55, motivo: 'inventario',
        justificativa: 'contagem fisica divergente' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 55);

    const aud = await dbGet(db, `SELECT * FROM auditoria_log_almoxarifado
      WHERE entidade = 'material_cliente' AND acao = 'AJUSTE' AND entidade_id = ?
      ORDER BY id DESC LIMIT 1`, [mat]);
    assert.ok(aud, 'auditoria nomeada do ajuste de material de cliente ausente');
    // Nao basta "o nome aparece em algum lugar": o dono auditado tem de ser o dono DESTE
    // material (cliB), e nao o primeiro cliente da tabela — dois clientes existem de proposito.
    const novos = JSON.parse(aud.dados_novos || '{}');
    assert.strictEqual(novos.proprietario_cliente_nome, 'Cliente Beta SA',
      `a auditoria nomeou o cliente errado: ${aud.dados_novos}`);
    assert.strictEqual(novos.proprietario_cliente_id, cliB);
    assert.strictEqual(novos.tipo, 'AJUSTE');
    assert.strictEqual(novos.quantidade, 55);
    assert.strictEqual(JSON.parse(aud.dados_anteriores || '{}').quantidade_atual, 100,
      'a auditoria nao guardou o saldo anterior');
    assert.strictEqual(aud.justificativa, 'contagem fisica divergente');
    assert.strictEqual(aud.usuario_id, ADMIN.id);
  });

  await test('CONTROLE POSITIVO: ALMOXARIFE (barrado no material de cliente) ajusta material NOSSO', async () => {
    // Sem isto, uma guarda aplicada larga demais — que barrasse TODO ajuste — passaria nos casos
    // de recusa acima como se estivesse "protegendo". Mesmo usuario, mesma rota, mesmo payload:
    // a UNICA diferenca e proprietario_cliente_id.
    const mat = await novoMaterial(db); // material nosso (proprietario_cliente_id NULL)
    setUser(ALMOXARIFE);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 77, motivo: 'inventario',
        justificativa: 'contagem fisica divergente' });
    assert.strictEqual(res.status, 201, `a guarda nova vazou para material proprio: ${JSON.stringify(res.body)}`);
    assert.strictEqual(await totalDoMaterial(db, mat), 77);
    const aud = await dbGet(db, `SELECT id FROM auditoria_log_almoxarifado
      WHERE entidade = 'material_cliente' AND entidade_id = ?`, [mat]);
    assert.strictEqual(aud, undefined, 'material NOSSO gerou auditoria de material_cliente');
    setUser(ADMIN);
  });

  await test('CONTROLE POSITIVO: quem tem ajustar_estoque (GESTOR) segue ajustando material NOSSO no motor', async () => {
    // GESTOR nao chega as rotas v1/v2: o gate delas e `movimentar` = [ADMINISTRADOR, ALMOXARIFE],
    // e GESTOR nao esta la — isso e ANTERIOR a esta etapa e nao muda aqui. Por isso o controle
    // positivo de `ajustar_estoque` e feito contra o MOTOR, que e onde a guarda nova mora.
    const mat = await novoMaterial(db);
    const r = await stockService.registrarMovimentacao(db, GESTOR, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 33, justificativa: 'contagem fisica divergente',
    });
    assert.ok(r.id, 'GESTOR deixou de ajustar material proprio depois da guarda nova');
    assert.strictEqual(await totalDoMaterial(db, mat), 33);
  });

  await test('AJUSTE de material de cliente e isento da regra de OS/projeto (mas nao da permissao)', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    setUser(ADMIN);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE_NEGATIVO', quantidade: 5, motivo: 'perda de processo',
        justificativa: 'sobra de corte descartada' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 95);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
