/**
 * Etapa 10, Task 2 — a conclusao da conferencia passa a aplicar ajustes pelo MOTOR
 * (stockService.registrarMovimentacao, tipo AJUSTE_INVENTARIO), nunca mais por UPDATE cru +
 * INSERT manual em movimentacoes_almoxarifado.
 *
 * Cobre RN-06c (quantidade_em_terceiros somada de volta — fecha B3), RN-07 (tudo-ou-nada e
 * prioridade 403 sobre 400 quando os dois motivos coexistem) e D8 (impacto financeiro de graca).
 *
 * As conferencias deste arquivo usam tolerancia_percentual bem alta na criacao — o objetivo aqui
 * e testar o MOTOR de ajuste, nao a tolerancia (RN-05 tem arquivo proprio,
 * conferenciaTolerancia.api.test.js). Sem isso, divergencias grandes de proposito (para acionar
 * retencao) cairiam primeiro no bloqueio de recontagem, mascarando o que o teste quer provar.
 *
 * Executar: cd server && node tests/api/conferenciaMotorAjuste.api.test.js
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
const GESTOR = { id: 2, nome: 'Gestor', role: 'usuario', perfil_almoxarifado: 'GESTOR', email: 'gestor@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };

let seq = 0;
async function novoMaterial(db, opts = {}) {
  seq += 1;
  const {
    qtd = 100, custoUnitario = 0, custoMedio = 0, emTerceiros = 0, bloqueada = 0,
    proprietarioClienteId = null,
  } = opts;
  const codigo = `MOT-${seq}`;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, custo_unitario, custo_medio,
       quantidade_em_terceiros, quantidade_bloqueada, proprietario_cliente_id, ativo)
     VALUES (?,?,'UN',?,?,?,?,?,?,1)`,
    [codigo, `Material Motor ${seq}`, qtd, custoUnitario, custoMedio, emTerceiros, bloqueada, proprietarioClienteId]);
  return { id: r.lastID, codigo };
}

async function novoCliente(db, nome) {
  const r = await dbRun(db, `INSERT INTO clientes (razao_social) VALUES (?)`, [nome]);
  return r.lastID;
}

// Tolerancia alta de proposito (ver docstring do arquivo): estes testes exercitam o motor de
// ajuste, nao RN-05.
async function abrirConferencia(app, body = { tolerancia_percentual: 1000 }) {
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

async function contar(app, confId, itemId, quantidade) {
  const res = await request(app).put(`/api/almoxarifado/conferencias/${confId}/item/${itemId}`)
    .send({ quantidade_contada: quantidade });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  await test('concluir com aplicar_ajustes grava movimentacao AJUSTE_INVENTARIO auditada, nao UPDATE cru', async () => {
    setUser(ADMIN);
    const mat = await novoMaterial(db, { qtd: 100, custoUnitario: 10 });
    const conf = await abrirConferencia(app);
    const item = await itemDoMaterial(db, conf.id, mat.id);
    await contar(app, conf.id, item.id, 99); // divergencia -1

    const res = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/concluir`)
      .send({ aplicar_ajustes: true, justificativa_ajuste: 'Ajuste teste motor' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.ajustesAplicados, 1, JSON.stringify(res.body));
    assert.strictEqual(res.body.impactoFinanceiro, 10, JSON.stringify(res.body)); // |div|=1 * custo=10

    const mov = await dbAll(db, `SELECT * FROM movimentacoes_almoxarifado WHERE tipo = 'AJUSTE_INVENTARIO' AND material_id = ?`, [mat.id]);
    assert.strictEqual(mov.length, 1, 'esperava exatamente uma movimentacao AJUSTE_INVENTARIO auditada');
    assert.strictEqual(mov[0].usuario_id, ADMIN.id, 'a movimentacao tem de saber quem homologou');
    assert.ok(mov[0].motivo && mov[0].motivo.includes(conf.numero), 'motivo deveria citar o numero da conferencia');
    assert.strictEqual(mov[0].referencia, conf.numero);

    const material = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat.id]);
    assert.strictEqual(Number(material.quantidade_atual), 99);
  });

  await test('RN-06c: material com quantidade_em_terceiros soma de volta ao aplicar (fecha B3)', async () => {
    setUser(ADMIN);
    const mat = await novoMaterial(db, { qtd: 100, emTerceiros: 30 });
    const conf = await abrirConferencia(app);
    const item = await itemDoMaterial(db, conf.id, mat.id);
    assert.strictEqual(Number(item.quantidade_sistema), 70, 'esperado da conferencia deveria descontar em_terceiros (Etapa 8b)');
    await contar(app, conf.id, item.id, 65); // divergencia -5 contra o esperado (70)

    const res = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/concluir`)
      .send({ aplicar_ajustes: true, justificativa_ajuste: 'Fecha B3' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const material = await dbGet(db, 'SELECT quantidade_atual, quantidade_em_terceiros FROM materiais_almoxarifado WHERE id = ?', [mat.id]);
    assert.strictEqual(Number(material.quantidade_atual), 95,
      'AJUSTE_INVENTARIO tinha de mandar 65 (contado) + 30 (em terceiros) = 95 ao motor, nao 65');
    assert.strictEqual(Number(material.quantidade_em_terceiros), 30, 'quantidade_em_terceiros nao deveria mudar');
  });

  await test('RN-07: um item recusado por retencao bloqueia TODA a conclusao (tudo ou nada), 400', async () => {
    setUser(ADMIN);
    const matA = await novoMaterial(db, { qtd: 100 });
    const matB = await novoMaterial(db, { qtd: 100, bloqueada: 90 }); // retido=90
    const conf = await abrirConferencia(app);
    const itemA = await itemDoMaterial(db, conf.id, matA.id);
    const itemB = await itemDoMaterial(db, conf.id, matB.id);
    await contar(app, conf.id, itemA.id, 95); // divergencia normal
    await contar(app, conf.id, itemB.id, 10); // novoTotal 10 < retido 90 -> bloqueado

    const res = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/concluir`)
      .send({ aplicar_ajustes: true, justificativa_ajuste: 'Tentativa tudo ou nada' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(res.body.error.startsWith('Ajuste bloqueado:'), JSON.stringify(res.body));
    assert.ok(res.body.error.includes(matB.codigo), JSON.stringify(res.body));
    assert.ok(!res.body.error.includes(matA.codigo), 'material A nao deveria aparecer na lista de bloqueio');

    const materialA = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matA.id]);
    const materialB = await dbGet(db, 'SELECT quantidade_atual, quantidade_bloqueada FROM materiais_almoxarifado WHERE id = ?', [matB.id]);
    assert.strictEqual(Number(materialA.quantidade_atual), 100, 'material A mudou apesar do tudo-ou-nada');
    assert.strictEqual(Number(materialB.quantidade_atual), 100, 'material B mudou apesar do bloqueio');
    assert.strictEqual(Number(materialB.quantidade_bloqueada), 90);

    const confDepois = await dbGet(db, 'SELECT status FROM conferencias_almoxarifado WHERE id = ?', [conf.id]);
    assert.strictEqual(confDepois.status, 'ABERTO', 'conferencia nao deveria concluir com item bloqueado');

    const movs = await dbAll(db, `SELECT * FROM movimentacoes_almoxarifado WHERE tipo = 'AJUSTE_INVENTARIO' AND material_id IN (?, ?)`, [matA.id, matB.id]);
    assert.strictEqual(movs.length, 0, 'nenhuma movimentacao deveria ter sido gravada, nem para o material A');
  });

  await test('RN-07: item de material de cliente sem ajustar_material_cliente vira 403 (prioridade sobre 400)', async () => {
    setUser(ADMIN);
    const clienteId = await novoCliente(db, 'Cliente Prioridade Teste');
    const matBloqueado = await novoMaterial(db, { qtd: 100, bloqueada: 90 }); // motivo 400
    const matCliente = await novoMaterial(db, { qtd: 100, proprietarioClienteId: clienteId }); // motivo 403
    const conf = await abrirConferencia(app);
    const itemBloqueado = await itemDoMaterial(db, conf.id, matBloqueado.id);
    const itemCliente = await itemDoMaterial(db, conf.id, matCliente.id);
    await contar(app, conf.id, itemBloqueado.id, 10);
    await contar(app, conf.id, itemCliente.id, 90);

    setUser(GESTOR); // tem ajustar_estoque, NAO tem ajustar_material_cliente
    const res = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/concluir`)
      .send({ aplicar_ajustes: true, justificativa_ajuste: 'Prioridade 403' });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.ok(res.body.error.includes('ajustar_material_cliente'), JSON.stringify(res.body));
    assert.ok(res.body.error.includes(matCliente.codigo), JSON.stringify(res.body));
    assert.ok(!res.body.error.startsWith('Ajuste bloqueado:'), 'a resposta 403 nao deveria usar o texto do 400 de retencao');

    const materialBloqueado = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matBloqueado.id]);
    const materialCliente = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matCliente.id]);
    assert.strictEqual(Number(materialBloqueado.quantidade_atual), 100);
    assert.strictEqual(Number(materialCliente.quantidade_atual), 100);
  });

  await test('sem aplicar_ajustes continua so fechando, sem tocar saldo (comportamento antigo preservado)', async () => {
    setUser(ADMIN);
    const mat = await novoMaterial(db, { qtd: 100 });
    const conf = await abrirConferencia(app);
    const item = await itemDoMaterial(db, conf.id, mat.id);
    await contar(app, conf.id, item.id, 50);

    const res = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/concluir`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.ajustesAplicados, 0, JSON.stringify(res.body));

    const material = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat.id]);
    assert.strictEqual(Number(material.quantidade_atual), 100);

    const confDepois = await dbGet(db, 'SELECT status FROM conferencias_almoxarifado WHERE id = ?', [conf.id]);
    assert.strictEqual(confDepois.status, 'CONCLUIDO');

    const mov = await dbAll(db, `SELECT * FROM movimentacoes_almoxarifado WHERE tipo = 'AJUSTE_INVENTARIO' AND material_id = ?`, [mat.id]);
    assert.strictEqual(mov.length, 0);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
