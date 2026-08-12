/**
 * Etapa 8, Task 6 — decisao 9 do design: devolver ao cliente e SAIDA (o material sai do predio de
 * volta para quem e dele), nao a devolucao da Etapa 7 (onde o material VOLTA para o estoque).
 * Tipo novo DEVOLUCAO_CLIENTE, pelo motor — entao lote, serie e endereco funcionam —, exigindo
 * material com dono e numero do documento, e ISENTO da regra de OS/projeto porque o destino e o
 * proprio proprietario.
 *
 * CONTROLE POSITIVO BILATERAL (regra da casa): a mesma execucao prova os dois lados. Material DE
 * CLIENTE com documento SAI (201, saldo debitado) e material NOSSO e recusado neste tipo (nao ha
 * para quem devolver), alem da recusa por falta de documento. Uma suite so de recusas aprovaria
 * uma guarda que barra tudo.
 *
 * Executar: cd server && node tests/api/materialClienteDevolucao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { TIPOS_MOVIMENTO_ROTA } = require('../../services/almoxarifado/schemas');
const ownerRules = require('../../services/almoxarifado/ownerRules');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const CONSULTA = { id: 4, nome: 'Consulta', role: 'user', email: 'c@test.com', perfil_almoxarifado: 'CONSULTA' };

let seq = 0;
async function novoMaterial(db, { qtd = 100, proprietario_cliente_id = null } = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, proprietario_cliente_id)
    VALUES (?, ?, 'PC', ?, 0, 25, 1, ?)`,
  [`T8-DEV-${seq}`, `Chapa 3mm ${seq}`, qtd, proprietario_cliente_id]);
  return r.lastID;
}
const totalDoMaterial = async (db, id) =>
  (await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });
  const cliA = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Alfa LTDA'])).lastID;

  await test('DEVOLUCAO_CLIENTE nao e criavel pela rota v2 generica', async () => {
    assert.ok(!TIPOS_MOVIMENTO_ROTA.includes('DEVOLUCAO_CLIENTE'),
      'DEVOLUCAO_CLIENTE vazou para a lista da rota generica — ela tem gate movimentar e nao exige documento');
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'DEVOLUCAO_CLIENTE', quantidade: 10, motivo: 'teste' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 100);
  });

  await test('devolucao ao cliente baixa o saldo e exige documento', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const semDoc = await request(app).post('/api/almoxarifado/materiais-cliente/devolucoes')
      .send({ material_id: mat, quantidade: 10 });
    assert.strictEqual(semDoc.status, 400, JSON.stringify(semDoc.body));
    assert.ok(/documento/i.test(semDoc.body.error), semDoc.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 100, 'a devolucao recusada nao podia debitar');

    // ── metade POSITIVA do controle bilateral: material de cliente COM documento sai de verdade
    const comDoc = await request(app).post('/api/almoxarifado/materiais-cliente/devolucoes')
      .send({ material_id: mat, quantidade: 10, documento_devolucao: 'DEV-2026-001' });
    assert.strictEqual(comDoc.status, 201, JSON.stringify(comDoc.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 90);
    const mov = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id DESC LIMIT 1', [mat]);
    assert.strictEqual(mov.tipo, 'DEVOLUCAO_CLIENTE');
    assert.strictEqual(mov.documento_vinculado, 'DEV-2026-001');
  });

  await test('devolucao de material SEM dono e recusada', async () => {
    const mat = await novoMaterial(db); // material nosso
    const res = await request(app).post('/api/almoxarifado/materiais-cliente/devolucoes')
      .send({ material_id: mat, quantidade: 10, documento_devolucao: 'DEV-2026-002' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/nao pertence a nenhum cliente/i.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 100);
  });

  await test('devolucao e ISENTA da regra de OS/projeto (o destino e o proprio dono)', async () => {
    // Sem a isencao, a guarda da Task 3 pediria OS do cliente para devolver ao cliente.
    assert.ok(ownerRules.TIPOS_ISENTOS_DONO.includes('DEVOLUCAO_CLIENTE'),
      'DEVOLUCAO_CLIENTE saiu de TIPOS_ISENTOS_DONO — devolver ao dono passaria a exigir OS do dono');
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/materiais-cliente/devolucoes')
      .send({ material_id: mat, quantidade: 5, documento_devolucao: 'DEV-2026-003' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    // Hoje a isencao esta DUPLAMENTE coberta: DEVOLUCAO_CLIENTE esta em TIPOS_ISENTOS_DONO E fora
    // de TIPOS_SAIDA_COM_DONO, e assertSaidaPermitida sai cedo pelos dois caminhos. Sem o teste
    // abaixo, apagar a entrada de TIPOS_ISENTOS_DONO nao quebraria nada — e a proxima pessoa que
    // classificasse o tipo como "saida com dono" (o que ele literalmente e) reintroduziria a
    // exigencia de OS. Este bloco poe o tipo em TIPOS_SAIDA_COM_DONO em memoria e prova que a
    // isencao continua valendo, que e a ordem real do `if` dentro da guarda.
    ownerRules.TIPOS_SAIDA_COM_DONO.push('DEVOLUCAO_CLIENTE');
    try {
      const res2 = await request(app).post('/api/almoxarifado/materiais-cliente/devolucoes')
        .send({ material_id: mat, quantidade: 5, documento_devolucao: 'DEV-2026-003B' });
      assert.strictEqual(res2.status, 201,
        `a isencao de TIPOS_ISENTOS_DONO nao segurou: ${JSON.stringify(res2.body)}`);
    } finally {
      ownerRules.TIPOS_SAIDA_COM_DONO.pop();
    }
    assert.ok(!ownerRules.TIPOS_SAIDA_COM_DONO.includes('DEVOLUCAO_CLIENTE'), 'restauracao da lista falhou');
  });

  await test('devolucao acima do saldo falha', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA, qtd: 8 });
    const res = await request(app).post('/api/almoxarifado/materiais-cliente/devolucoes')
      .send({ material_id: mat, quantidade: 20, documento_devolucao: 'DEV-2026-004' });
    assert.strictEqual(res.status, 400);
    assert.ok(/Saldo insuficiente/i.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 8);
  });

  await test('devolucao sem a permissao movimentar falha com 403', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    setUser(CONSULTA);
    const res = await request(app).post('/api/almoxarifado/materiais-cliente/devolucoes')
      .send({ material_id: mat, quantidade: 5, documento_devolucao: 'DEV-2026-005' });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    setUser(ADMIN);
  });

  await test('estorno de uma DEVOLUCAO_CLIENTE devolve o material ao estoque', async () => {
    // Prende a SEGUNDA declaracao de tiposSaida do stockService (a de cancelarMovimentacao). Sem
    // DEVOLUCAO_CLIENTE la, o if-chain do cancelamento — que nao tem `else` final — marcaria a
    // movimentacao como cancelada e gravaria ESTORNO com saldo igual, sem NUNCA devolver o
    // material: o livro diria "desfeito" e o saldo diria o contrario.
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA, qtd: 30 });
    const dev = await request(app).post('/api/almoxarifado/materiais-cliente/devolucoes')
      .send({ material_id: mat, quantidade: 12, documento_devolucao: 'DEV-2026-007' });
    assert.strictEqual(dev.status, 201, JSON.stringify(dev.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 18);

    const mov = await dbGet(db, 'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1',
      [mat, 'DEVOLUCAO_CLIENTE']);
    const cancel = await request(app).post(`/api/almoxarifado/movimentacoes/${mov.id}/cancelar`)
      .send({ motivo: 'cliente recusou a coleta' });
    assert.strictEqual(cancel.status, 200, JSON.stringify(cancel.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 30, 'o estorno nao repos o material devolvido');
    const estorno = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1',
      [mat, 'ESTORNO']);
    assert.strictEqual(estorno.saldo_anterior, 18);
    assert.strictEqual(estorno.saldo_posterior, 30);
  });

  await test('devolucao de material com controle de serie consome as series informadas', async () => {
    const seriesService = require('../../services/almoxarifado/seriesService');
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA, qtd: 0 });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_serie = 1 WHERE id = ?', [mat]);
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA_MANUAL', quantidade: 2, motivo: 'remessa', series: ['SN-D1', 'SN-D2'] });
    const s1 = await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [mat, 'SN-D1']);
    const res = await request(app).post('/api/almoxarifado/materiais-cliente/devolucoes')
      .send({ material_id: mat, quantidade: 1, documento_devolucao: 'DEV-2026-006', serie_ids: [s1.id] });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const s = await seriesService.getSerie(db, s1.id);
    assert.strictEqual(s.status, 'ENTREGUE', 'a serie devolvida ao cliente devia sair do estoque');
    assert.strictEqual(await totalDoMaterial(db, mat), 1);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
