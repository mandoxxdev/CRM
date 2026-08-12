/**
 * Etapa 8, Task 5 — decisao 8 do design: a entrada exige CLIENTE e DOCUMENTO, mas NAO projeto.
 * O cliente vem da linha do material (cadastro) e o documento e a nota do recebimento. Exigir
 * projeto na entrada obrigaria a criar dois materiais identicos quando o mesmo cliente manda a
 * mesma chapa para dois projetos — a spec 13 estava errada nesse item.
 *
 * As duas metades da guarda andam JUNTAS de proposito: provar so a recusa aprovaria uma guarda
 * escrita larga demais (exigir documento sempre), que travaria TODO recebimento do modulo. Por
 * isso o controle positivo de material nosso e obrigatorio aqui.
 *
 * Executar: cd server && node tests/api/materialClienteEntrada.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
const codigo = () => { seq += 1; return `T8-ENT-${seq}`; };

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  const cliA = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Alfa LTDA'])).lastID;
  const familia = (await dbRun(db,
    "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('T8F','Familia T8',1)")).lastID;

  async function criarMaterial({ proprietario_cliente_id } = {}) {
    const c = codigo();
    const body = { codigo: c, nome: proprietario_cliente_id ? 'Chapa do cliente' : 'Chapa nossa', familia_id: familia, unidade: 'PC' };
    if (proprietario_cliente_id !== undefined) body.proprietario_cliente_id = proprietario_cliente_id;
    const res = await request(app).post('/api/almoxarifado/materiais').send(body);
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    return { id: res.body.id, codigo: c };
  }

  await test('POST /materiais persiste proprietario_cliente_id', async () => {
    const { codigo: c } = await criarMaterial({ proprietario_cliente_id: cliA });
    const m = await dbGet(db, 'SELECT proprietario_cliente_id FROM materiais_almoxarifado WHERE codigo = ?', [c]);
    assert.strictEqual(m.proprietario_cliente_id, cliA,
      'o Zod descartou a chave em silencio (falta declarar no MaterialShape) ou o INSERT nao a gravou');
  });

  await test('POST /materiais sem a chave nasce material NOSSO (NULL, nao 0)', async () => {
    // Controle positivo do caso acima: sem isto, um default errado (0) passaria despercebido —
    // e 0 nao e NULL, entao toda leitura de estoque proprio (IS NULL) perderia o material.
    const { codigo: c } = await criarMaterial();
    const m = await dbGet(db, 'SELECT proprietario_cliente_id FROM materiais_almoxarifado WHERE codigo = ?', [c]);
    assert.strictEqual(m.proprietario_cliente_id, null);
  });

  await test('PUT /materiais/:id troca e limpa o proprietario', async () => {
    const { id } = await criarMaterial();
    await request(app).put(`/api/almoxarifado/materiais/${id}`).send({ proprietario_cliente_id: cliA });
    assert.strictEqual((await dbGet(db, 'SELECT proprietario_cliente_id FROM materiais_almoxarifado WHERE id = ?', [id])).proprietario_cliente_id, cliA);
    await request(app).put(`/api/almoxarifado/materiais/${id}`).send({ proprietario_cliente_id: null });
    assert.strictEqual((await dbGet(db, 'SELECT proprietario_cliente_id FROM materiais_almoxarifado WHERE id = ?', [id])).proprietario_cliente_id, null,
      'null explicito tinha de limpar o dono — se preservou, o campo caiu no ramo "ausente" da coercao');
  });

  await test('PUT que omite a chave PRESERVA o proprietario (preserve-when-omitted)', async () => {
    // A tela de edicao antiga (e qualquer caller que nao conheca o campo) nao manda a chave.
    // Se a omissao apagasse o dono, editar o nome de uma chapa do cliente a transformaria em
    // material nosso em silencio — exatamente o tipo de falha muda que esta etapa caca.
    const { id } = await criarMaterial({ proprietario_cliente_id: cliA });
    await request(app).put(`/api/almoxarifado/materiais/${id}`).send({ nome: 'Chapa do cliente (renomeada)' });
    assert.strictEqual((await dbGet(db, 'SELECT proprietario_cliente_id FROM materiais_almoxarifado WHERE id = ?', [id])).proprietario_cliente_id, cliA);
  });

  await test('GET /materiais/:id devolve proprietario_cliente_id (a tela precisa dele para o selo)', async () => {
    const { id } = await criarMaterial({ proprietario_cliente_id: cliA });
    const res = await request(app).get(`/api/almoxarifado/materiais/${id}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.proprietario_cliente_id, cliA);
  });

  // ── Recebimento ────────────────────────────────────────────────────────────────────────────
  async function recebimentoCom(materialId, { nota_fiscal }) {
    const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, tipo_recebimento, nota_fiscal, status) VALUES (?, 'MATERIAL', ?, 'RECEBIDO')`,
    [`REC-T8-${materialId}`, nota_fiscal]);
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`,
    [rec.lastID, materialId, 10, 10]);
    return rec.lastID;
  }

  await test('entrada de material de cliente sem documento falha', async () => {
    const { id: matId } = await criarMaterial({ proprietario_cliente_id: cliA });
    const recId = await recebimentoCom(matId, { nota_fiscal: null });
    const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recId]);
    await assert.rejects(
      () => receiptService.darEntradaEstoque(db, ADMIN, rec, recId, {}),
      (e) => /documento/i.test(e.message) && /Cliente Alfa LTDA/.test(e.message) && e.status === 400,
    );
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(m.quantidade_atual, 0, 'a nota recusada nao podia creditar');
  });

  await test('entrada de material de cliente com documento em BRANCO tambem falha', async () => {
    // '' e '   ' sao o que um formulario manda quando o campo foi tocado e apagado: se a guarda
    // testasse so `!= null`, a string vazia passaria e a nota de remessa seria "cumprida" por nada.
    const { id: matId } = await criarMaterial({ proprietario_cliente_id: cliA });
    const recId = await recebimentoCom(matId, { nota_fiscal: '   ' });
    const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recId]);
    await assert.rejects(
      () => receiptService.darEntradaEstoque(db, ADMIN, rec, recId, {}),
      (e) => /documento/i.test(e.message) && e.status === 400,
    );
  });

  await test('entrada de material de cliente COM documento funciona', async () => {
    const { id: matId } = await criarMaterial({ proprietario_cliente_id: cliA });
    const recId = await recebimentoCom(matId, { nota_fiscal: 'NF-REMESSA-123' });
    const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recId]);
    await receiptService.darEntradaEstoque(db, ADMIN, rec, recId, {});
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(m.quantidade_atual, 10);
  });

  await test('CONTROLE POSITIVO: material NOSSO continua entrando sem nota', async () => {
    // Sem isto, a guarda escrita larga demais (exigir documento sempre) passaria como se
    // estivesse cobrindo so material de cliente — e travaria todo recebimento do modulo.
    const { id: matId } = await criarMaterial();
    const recId = await recebimentoCom(matId, { nota_fiscal: null });
    const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recId]);
    await receiptService.darEntradaEstoque(db, ADMIN, rec, recId, {});
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(m.quantidade_atual, 10, 'a guarda de documento vazou para material proprio');
  });

  await test('a entrada NAO exige projeto (decisao 8 — a spec 13 estava errada)', async () => {
    // O mesmo cliente manda a mesma chapa para dois projetos: um unico material, duas entradas.
    const { id } = await criarMaterial({ proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: id, tipo: 'ENTRADA_MANUAL', quantidade: 30, motivo: 'remessa do cliente' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const res2 = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: id, tipo: 'ENTRADA_MANUAL', quantidade: 20, motivo: 'remessa do cliente, outro projeto' });
    assert.strictEqual(res2.status, 201, JSON.stringify(res2.body));
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(m.quantidade_atual, 50);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
