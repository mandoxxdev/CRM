const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

async function criarMaterial(db, codigo, { qtd = 0, tipoMaterial = null } = {}) {
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, tipo_material, ativo) VALUES (?,?,?,?,1)`,
    [codigo, `Material ${codigo}`, qtd, tipoMaterial]);
  return r.lastID;
}

async function criarLocalizacao(app, codigo, overrides = {}) {
  const res = await request(app).post('/api/almoxarifado/localizacoes')
    .send({ codigo, descricao: `Localização ${codigo}`, ...overrides });
  if (res.status !== 201) throw new Error(`Falha ao criar localização ${codigo}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

// Corpo IDÊNTICO ao que handleSalvarEdit/handleMoverConfirm (client/src/components/almoxarifado/
// ConfiguracoesAlmoxarifado.js, ~:1193 e ~:1252) mandam hoje num PUT de localização: nunca inclui
// bloqueada, tipos_material_permitidos, almoxarifado_id nem ativo. Usado para reproduzir o achado
// do review — PUT feito pela tela real não pode apagar restrições configuradas por outra via.
function corpoPutFormatoUI(loc, overrides = {}) {
  return {
    codigo: loc.codigo,
    descricao: loc.descricao,
    setor: loc.setor,
    subgrupo: loc.subgrupo || null,
    parent_id: loc.parent_id || null,
    tipo: loc.tipo || 'Almoxarifado',
    pos_x: loc.pos_x ?? null,
    pos_y: loc.pos_y ?? null,
    largura: loc.largura ?? 120,
    altura: loc.altura ?? 80,
    ...overrides,
  };
}

(async () => {
  // Rotas de localização (canConfigureAlmox) exigem is_superadmin (mesmo motivo do
  // almoxarifados.api.test.js). is_superadmin:1 também dá perfil ADMINISTRADOR nas rotas
  // de movimentação, então um único usuário cobre as duas camadas.
  const { app, db, close } = await createTestApp({
    user: { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1 },
  });

  await test('ENTRADA para localização bloqueada retorna 400 e saldo intacto', async () => {
    const loc = await criarLocalizacao(app, 'REST-A', { bloqueada: true });
    const mat = await criarMaterial(db, 'REST-MAT-A', { qtd: 0 });

    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, localizacao_destino_id: loc.id });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/bloqueada/i.test(res.body.error), `mensagem deveria citar bloqueio: ${res.body.error}`);

    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 0, 'saldo do material não deveria ter sido alterado');
    const saldo = await dbGet(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?', [mat, loc.id]);
    assert.ok(!saldo || saldo.quantidade === 0, 'não deveria existir saldo na localização bloqueada');
  });

  await test('SAIDA com origem bloqueada retorna 400', async () => {
    const loc = await criarLocalizacao(app, 'REST-B', { bloqueada: true });
    const mat = await criarMaterial(db, 'REST-MAT-B', { qtd: 50 });

    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({
        material_id: mat, tipo: 'SAIDA', quantidade: 10, localizacao_origem_id: loc.id,
        justificativa: 'teste de bloqueio de origem',
      });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/bloqueada/i.test(res.body.error), `mensagem deveria citar bloqueio: ${res.body.error}`);

    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 50, 'saldo do material não deveria ter sido alterado');
  });

  await test('TRANSFERENCIA com destino bloqueado retorna 400 e saldo de origem intacto', async () => {
    const locOrigem = await criarLocalizacao(app, 'REST-C-ORI');
    const locDestino = await criarLocalizacao(app, 'REST-C-DEST', { bloqueada: true });
    const mat = await criarMaterial(db, 'REST-MAT-C', { qtd: 0 });
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,20)`, [mat, locOrigem.id]);

    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({
        material_id: mat, tipo: 'TRANSFERENCIA', quantidade: 5,
        localizacao_origem_id: locOrigem.id, localizacao_destino_id: locDestino.id,
      });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/bloqueada/i.test(res.body.error), `mensagem deveria citar bloqueio: ${res.body.error}`);

    const saldoOrigem = await dbGet(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?', [mat, locOrigem.id]);
    assert.strictEqual(saldoOrigem.quantidade, 20, 'saldo de origem não deveria ter sido alterado');
  });

  await test('destino com tipos_material_permitidos restringe por tipo_material do material', async () => {
    const loc = await criarLocalizacao(app, 'REST-D', { tipos_material_permitidos: ['Ferramenta'] });
    const matConsumivel = await criarMaterial(db, 'REST-MAT-D1', { qtd: 0, tipoMaterial: 'Consumível' });
    const matFerramenta = await criarMaterial(db, 'REST-MAT-D2', { qtd: 0, tipoMaterial: 'Ferramenta' });

    const negado = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: matConsumivel, tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: loc.id });
    assert.strictEqual(negado.status, 400, JSON.stringify(negado.body));
    assert.ok(/não aceita/i.test(negado.body.error), `mensagem deveria citar restrição de tipo: ${negado.body.error}`);

    const aceito = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: matFerramenta, tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: loc.id });
    assert.strictEqual(aceito.status, 201, JSON.stringify(aceito.body));
  });

  await test('destino sem restrição aceita qualquer tipo_material', async () => {
    const loc = await criarLocalizacao(app, 'REST-E');
    const mat = await criarMaterial(db, 'REST-MAT-E', { qtd: 0, tipoMaterial: 'Insumo' });

    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: loc.id });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  await test('AJUSTE com localizacao_destino_id bloqueada retorna 400', async () => {
    const loc = await criarLocalizacao(app, 'REST-F', { bloqueada: true });
    const mat = await criarMaterial(db, 'REST-MAT-F', { qtd: 0 });

    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 10, localizacao_destino_id: loc.id, justificativa: 'contagem' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/bloqueada/i.test(res.body.error), `mensagem deveria citar bloqueio: ${res.body.error}`);
  });

  await test('DELETE localizacao com saldo retorna 400; sem saldo remove com sucesso', async () => {
    const locComSaldo = await criarLocalizacao(app, 'REST-G-COM-SALDO');
    const mat = await criarMaterial(db, 'REST-MAT-G', { qtd: 0 });
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,15)`, [mat, locComSaldo.id]);

    const negado = await request(app).delete(`/api/almoxarifado/localizacoes/${locComSaldo.id}`);
    assert.strictEqual(negado.status, 400, JSON.stringify(negado.body));
    assert.ok(/saldo/i.test(negado.body.error), `mensagem deveria citar saldo: ${negado.body.error}`);
    const aindaAtiva = await dbGet(db, 'SELECT ativo FROM localizacoes_almoxarifado WHERE id = ?', [locComSaldo.id]);
    assert.strictEqual(aindaAtiva.ativo, 1, 'localização com saldo não deveria ter sido inativada');

    const locSemSaldo = await criarLocalizacao(app, 'REST-G-SEM-SALDO');
    const aceito = await request(app).delete(`/api/almoxarifado/localizacoes/${locSemSaldo.id}`);
    assert.strictEqual(aceito.status, 200, JSON.stringify(aceito.body));
    assert.strictEqual(aceito.body.success, true);
    const removida = await dbGet(db, 'SELECT ativo FROM localizacoes_almoxarifado WHERE id = ?', [locSemSaldo.id]);
    assert.strictEqual(removida.ativo, 0, 'localização sem saldo deveria ter sido inativada');
  });

  await test('estorno reverte mesmo se a localização foi bloqueada depois do movimento original', async () => {
    const loc = await criarLocalizacao(app, 'REST-H');
    const mat = await criarMaterial(db, 'REST-MAT-H', { qtd: 0 });

    const entrada = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, localizacao_destino_id: loc.id });
    assert.strictEqual(entrada.status, 201, JSON.stringify(entrada.body));

    // Bloqueia a localização DEPOIS que o movimento já ocorreu.
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id = ?', [loc.id]);

    const cancelado = await request(app).post(`/api/almoxarifado/movimentacoes/${entrada.body.id}/cancelar`)
      .send({ motivo: 'engano no lançamento' });
    assert.strictEqual(cancelado.status, 200, JSON.stringify(cancelado.body));

    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 0, 'estorno deveria ter revertido o saldo mesmo com a localização bloqueada');
  });

  await test('PUT no formato da UI (sem bloqueada/tipos_material_permitidos) preserva restrições existentes', async () => {
    const loc = await criarLocalizacao(app, 'REST-I', { bloqueada: true, tipos_material_permitidos: ['Ferramenta'] });
    assert.strictEqual(loc.bloqueada, 1);
    assert.strictEqual(loc.tipos_material_permitidos, JSON.stringify(['Ferramenta']));

    const res = await request(app).put(`/api/almoxarifado/localizacoes/${loc.id}`).send(corpoPutFormatoUI(loc));
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.bloqueada, 1, 'bloqueio deveria ter sido preservado (PUT da UI não manda o campo)');
    assert.strictEqual(res.body.tipos_material_permitidos, JSON.stringify(['Ferramenta']),
      'restrição de tipo deveria ter sido preservada (PUT da UI não manda o campo)');
  });

  await test('PUT com bloqueada:0 explícito limpa o bloqueio', async () => {
    const loc = await criarLocalizacao(app, 'REST-J', { bloqueada: true });
    const res = await request(app).put(`/api/almoxarifado/localizacoes/${loc.id}`)
      .send(corpoPutFormatoUI(loc, { bloqueada: 0 }));
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.bloqueada, 0, 'bloqueio deveria ter sido limpo por um valor explícito');
  });

  await test('PUT com tipos_material_permitidos:[] remove a restrição (vira NULL, aceita qualquer tipo)', async () => {
    const loc = await criarLocalizacao(app, 'REST-K', { tipos_material_permitidos: ['Ferramenta'] });
    const res = await request(app).put(`/api/almoxarifado/localizacoes/${loc.id}`)
      .send(corpoPutFormatoUI(loc, { tipos_material_permitidos: [] }));
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.tipos_material_permitidos, null, 'lista vazia deveria ter virado NULL (sem restrição)');

    const mat = await criarMaterial(db, 'REST-MAT-K', { qtd: 0, tipoMaterial: 'Consumível' });
    const entrada = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: loc.id });
    assert.strictEqual(entrada.status, 201, JSON.stringify(entrada.body));
  });

  await test('DELETE localizacao bloqueia mesmo quando SUM(quantidade) das linhas dá zero (net-zero)', async () => {
    const loc = await criarLocalizacao(app, 'REST-L');
    const matA = await criarMaterial(db, 'REST-MAT-L1', { qtd: 0 });
    const matB = await criarMaterial(db, 'REST-MAT-L2', { qtd: 0 });
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,10)`, [matA, loc.id]);
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,-10)`, [matB, loc.id]);

    const res = await request(app).delete(`/api/almoxarifado/localizacoes/${loc.id}`);
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/saldo/i.test(res.body.error), `mensagem deveria citar saldo: ${res.body.error}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
