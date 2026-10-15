/**
 * Etapa 110 — integracao (T5): o documento ate o fim, pela ROTA e pelo SERVICO.
 *
 * C215 (o saldo inicial pelo motor) e C218 (a corrida da familia) mexem no mesmo cadastro; cada uma tem a sua suite de
 * unidade (`saldoInicialCadastro`, `familiaMaterialCorrida`). Aqui o fluxo de quem usa: cadastrar, dar entrada, ver o
 * extrato, estornar, inativar a familia, cadastrar de novo — e o material de cliente cadastrado com 0 continua entrando
 * pelo Recebimento, que exige o documento (Etapa 8).
 *
 * Executar: cd server && node tests/api/saldoInicialFamiliaIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const materialService = require('../../services/almoxarifado/materialService');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const ENGENHARIA = { id: 6, nome: 'Eng Teste', role: 'user', email: 'eng@test.com', perfil_almoxarifado: 'ENGENHARIA' };

(async () => {
  console.log('\n═══ Etapa 110 — integracao: saldo inicial e familia ═══\n');
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const fam = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('K110', 'Familia K110', 1)")).lastID;
  const cli = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente Alfa LTDA')")).lastID;
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  const body = (codigo, extra = {}) => ({ codigo, nome: `Chapa ${codigo}`, unidade: 'PC', categoria: 'OUTROS', familia_id: fam, ...extra });
  const saldo = async (id) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [id])).q);

  await test('K1 pela rota: Engenharia cadastra -> Almoxarife da entrada -> outro com saldo -> extrato -> estorno -> familia', async () => {
    const r1 = await as(ENGENHARIA, () => request(app).post('/api/almoxarifado/materiais').send(body('K110-1', { quantidade_atual: 5 })));
    assert.strictEqual(r1.status, 403, `Engenharia com saldo: ${r1.status} ${JSON.stringify(r1.body)}`);
    const r2 = await as(ENGENHARIA, () => request(app).post('/api/almoxarifado/materiais').send(body('K110-1')));
    assert.strictEqual(r2.status, 201, `Engenharia sem saldo: ${r2.status} ${JSON.stringify(r2.body)}`);
    const ent = await as(ALMOXARIFE, () => request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: r2.body.id, tipo: 'ENTRADA', quantidade: 5 }));
    assert.strictEqual(ent.status, 201, `entrada: ${ent.status} ${JSON.stringify(ent.body)}`);
    assert.strictEqual(await saldo(r2.body.id), 5);

    const r3 = await as(ALMOXARIFE, () => request(app).post('/api/almoxarifado/materiais').send(body('K110-2', { quantidade_atual: 7 })));
    assert.strictEqual(r3.status, 201, `Almoxarife com saldo: ${r3.status} ${JSON.stringify(r3.body)}`);
    const hist = await request(app).get(`/api/almoxarifado/materiais/${r3.body.id}/historico`);
    assert.strictEqual(hist.status, 200);
    assert.strictEqual(hist.body.length, 1, JSON.stringify(hist.body));
    assert.strictEqual(hist.body[0].motivo, 'Saldo inicial de cadastro');
    const est = await as(ADM, () => request(app).post(`/api/almoxarifado/movimentacoes/${hist.body[0].id}/cancelar`)
      .send({ motivo: 'Saldo inicial digitado errado' }));
    assert.strictEqual(est.status, 200, `estorno: ${est.status} ${JSON.stringify(est.body)}`);
    assert.strictEqual(await saldo(r3.body.id), 0);

    const inat1 = await as(ADM, () => request(app).delete(`/api/almoxarifado/familias/${fam}`));
    assert.strictEqual(inat1.status, 400, `inativar com material ativo: ${inat1.status} ${JSON.stringify(inat1.body)}`);
    assert.strictEqual(inat1.body.error, 'Não é possível remover: família possui 2 item(ns) ativo(s)');
    for (const id of [r2.body.id, r3.body.id]) {
      const d = await as(ADM, () => request(app).delete(`/api/almoxarifado/materiais/${id}`));
      assert.strictEqual(d.status, 200, `inativar material: ${d.status} ${JSON.stringify(d.body)}`);
    }
    const inat2 = await as(ADM, () => request(app).delete(`/api/almoxarifado/familias/${fam}`));
    assert.strictEqual(inat2.status, 200, `inativar familia vazia: ${inat2.status} ${JSON.stringify(inat2.body)}`);
    const r4 = await as(ALMOXARIFE, () => request(app).post('/api/almoxarifado/materiais').send(body('K110-3')));
    assert.strictEqual(r4.status, 400);
    assert.strictEqual(r4.body.error, 'Família inativa — não é possível vincular novos itens');
    await dbRun(db, 'UPDATE familias_material_almoxarifado SET ativo = 1 WHERE id = ?', [fam]);
  });

  await test('K2 pelo servico: createMaterial com saldo e lote -> 400 E2; com saldo e sem controle -> Entrada do motor', async () => {
    let erro = null;
    try {
      await materialService.createMaterial(db, ALMOXARIFE, body('K110-S1', { quantidade_atual: 3, controle_lote: 1 }));
    } catch (e) { erro = e; }
    assert.ok(erro, 'nao lancou');
    assert.strictEqual(erro.status, 400);
    assert.strictEqual(erro.message, materialService.mensagemSaldoInicialRecusado('K110-S1', ['tem controle por lote']));
    const ok = await materialService.createMaterial(db, ALMOXARIFE, body('K110-S2', { quantidade_atual: 3 }));
    assert.strictEqual(await saldo(ok.id), 3);
    const aud = await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado a
      JOIN movimentacoes_almoxarifado m ON m.id = a.entidade_id
      WHERE a.entidade = 'movimentacao' AND m.material_id = ?`, [ok.id]);
    assert.strictEqual(aud.n, 1, 'a linha do saldo inicial nao veio do motor');
  });

  await test('K3 material de cliente: com saldo inicial -> 400; com 0 -> 201, e o Recebimento sem nota continua recusando', async () => {
    const r1 = await as(ALMOXARIFE, () => request(app).post('/api/almoxarifado/materiais')
      .send(body('K110-C1', { quantidade_atual: 4, proprietario_cliente_id: cli })));
    assert.strictEqual(r1.status, 400, `${r1.status} ${JSON.stringify(r1.body)}`);
    assert.strictEqual(r1.body.error, materialService.mensagemSaldoInicialRecusado('K110-C1', ['é de cliente']));
    const r2 = await as(ALMOXARIFE, () => request(app).post('/api/almoxarifado/materiais')
      .send(body('K110-C1', { proprietario_cliente_id: cli })));
    assert.strictEqual(r2.status, 201, `${r2.status} ${JSON.stringify(r2.body)}`);
    const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado (numero, tipo_recebimento, nota_fiscal, status)
      VALUES ('REC-K110', 'MATERIAL', NULL, 'RECEBIDO')`);
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida)
      VALUES (?, ?, 4, 4)`, [rec.lastID, r2.body.id]);
    const linha = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [rec.lastID]);
    await assert.rejects(() => receiptService.darEntradaEstoque(db, SUPER, linha, rec.lastID, {}),
      (e) => e.status === 400 && /K110-C1: material do cliente Cliente Alfa LTDA exige numero de documento \(nota de remessa\)/.test(e.message));
    assert.strictEqual(await saldo(r2.body.id), 0);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
