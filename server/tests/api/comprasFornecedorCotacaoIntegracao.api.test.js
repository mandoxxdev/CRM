/**
 * Etapa 40, Task 6 — o fluxo inteiro cruzando fornecedor (T2) e cotacao (T3), pela rota e pelo
 * servico, incluindo o que RN-E05 DECLARA (pedido aceita fornecedor inativo) e a precedencia do 409.
 * Executar: cd server && node tests/api/comprasFornecedorCotacaoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const cotacaoService = require('../../services/compras/cotacaoService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 99, nome: 'Admin E40 T6', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  const material = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
    VALUES ('MAT-E40-T6', 'Chapa E40', 'PC', 0, 1)`)).lastID;

  await test('(A) o fluxo pela ROTA: cria -> cota -> 409 por cotacao -> inativa -> aux esconde, pedido aceita -> apaga cotacao -> 409 por pedido -> apaga pedido -> 200', async () => {
    // (1) o payload EXATO da tela nova (T4), grupo vazio
    const f = await request(app).post('/api/compras/fornecedores').send({
      razao_social: 'Integração E40', nome_fantasia: '', cnpj: '55666777000188', contato: '', email: '', telefone: '', endereco: 'Rua I', grupo_id: '',
    });
    assert.strictEqual(f.status, 201, JSON.stringify(f.body));
    const fid = f.body.id;
    const l0 = await dbGet(db, 'SELECT grupo_id, endereco FROM fornecedores WHERE id = ?', [fid]);
    assert.strictEqual(l0.grupo_id, null);
    assert.strictEqual(l0.endereco, 'Rua I', 'o POST passou a gravar endereco (era ignorado ate a 39) — Fase 2, M7');
    // (2) o payload EXATO da tela de cotacao (T5)
    const c = await request(app).post('/api/compras/cotacoes').send({
      numero: 'COT-E40-INT', fornecedor_id: fid, valor_total: 99.9, data_cotacao: '2026-09-21', validade: '', status: 'em_analise', observacoes: '',
    });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    assert.strictEqual(c.body.fornecedor_nome, 'Integração E40');
    // (3) RN-E12
    const d1 = await request(app).delete(`/api/compras/fornecedores/${fid}`);
    assert.strictEqual(d1.status, 409);
    assert.strictEqual(d1.body.error, cotacaoService.FORNECEDOR_COM_COTACOES, 'a rota usa a CONSTANTE do servico (Fase 2, M3): identidade, nao igualdade');
    // (4) RN-E04 + RN-E05: inativa pelo PUT da tela (todos os campos), aux esconde, pedido aceita
    // CONTROLE POSITIVO PRIMEIRO (Fase 2, I2): o ATIVO tem de aparecer no aux, senao a negativa
    // abaixo passaria com o aux devolvendo [] por qualquer motivo (tableExists, LIMIT 50, regressao).
    const aux0 = await request(app).get('/api/almoxarifado/recebimentos-aux/fornecedores');
    assert.strictEqual(aux0.status, 200, JSON.stringify(aux0.body));
    assert.ok((aux0.body || []).some((x) => x.id === fid), 'controle positivo: ATIVO tem de aparecer no aux antes de inativar');
    const p = await request(app).put(`/api/compras/fornecedores/${fid}`).send({
      razao_social: 'Integração E40', nome_fantasia: '', cnpj: '55666777000188', contato: '', email: '', telefone: '', endereco: 'Rua I', grupo_id: '', status: 'inativo',
    });
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    const aux = await request(app).get('/api/almoxarifado/recebimentos-aux/fornecedores');
    assert.strictEqual(aux.status, 200, JSON.stringify(aux.body));
    assert.ok(!(aux.body || []).some((x) => x.id === fid), 'fornecedor inativo NAO pode aparecer no seletor do recebimento (a negativa so vale por causa do aux0 acima)');
    const ped = await request(app).post('/api/compras/pedidos').send({ fornecedor_id: fid, itens: [{ material_id: material, quantidade: 1 }] });
    assert.strictEqual(ped.status, 201, 'RN-E05: o pedido continua aceitando fornecedor inativo (declarado, D5)');
    // (5) precedencia e liberacao
    const d2 = await request(app).delete(`/api/compras/fornecedores/${fid}`);
    assert.strictEqual(d2.body.error, 'Fornecedor possui pedidos de compra — não pode ser excluído', 'com pedido E cotacao, vale a de pedido');
    assert.strictEqual((await request(app).delete(`/api/compras/cotacoes/${c.body.id}`)).status, 200);
    const d3 = await request(app).delete(`/api/compras/fornecedores/${fid}`);
    assert.strictEqual(d3.status, 409);
    assert.strictEqual(d3.body.error, 'Fornecedor possui pedidos de compra — não pode ser excluído');
    assert.strictEqual((await request(app).delete(`/api/compras/pedidos/${ped.body.id}`)).status, 200);
    const d4 = await request(app).delete(`/api/compras/fornecedores/${fid}`);
    assert.strictEqual(d4.status, 200, JSON.stringify(d4.body));
    assert.strictEqual(await dbGet(db, 'SELECT id FROM fornecedores WHERE id = ?', [fid]), undefined);
  });

  await test('(B) pelo SERVICO: a cotacao nasce e e editada sem passar pela rota, e o GET /:id da rota le o mesmo', async () => {
    const fid = (await dbRun(db, "INSERT INTO fornecedores (razao_social) VALUES ('Servico E40')")).lastID;
    const c = await cotacaoService.criarCotacao(db, { numero: 'COT-E40-SRV', fornecedor_id: fid });
    assert.strictEqual(c.status, 'em_analise');
    const c2 = await cotacaoService.atualizarCotacao(db, c.id, { numero: 'COT-E40-SRV', fornecedor_id: fid, status: 'aprovado', valor_total: 1 });
    assert.strictEqual(c2.status, 'aprovado');
    const g = await request(app).get(`/api/compras/cotacoes/${c.id}`);
    assert.deepStrictEqual(g.body, c2);
    // e a guarda do 409 do fornecedor enxerga a cotacao criada pelo servico
    const d = await request(app).delete(`/api/compras/fornecedores/${fid}`);
    assert.strictEqual(d.status, 409);
  });

  await test('(C) o "Remover do grupo" de FornecedoresDoGrupo, ponta a ponta: POST com grupo, PUT com null, grupo some', async () => {
    await dbRun(db, `CREATE TABLE IF NOT EXISTS grupos_compras (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, numero INTEGER, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    const g = (await dbRun(db, "INSERT INTO grupos_compras (nome) VALUES ('G E40')")).lastID;
    const f = await request(app).post('/api/compras/fornecedores').send({ razao_social: 'Do grupo', nome_fantasia: '', cnpj: '', grupo_id: String(g) });
    assert.strictEqual((await dbGet(db, 'SELECT grupo_id FROM fornecedores WHERE id = ?', [f.body.id])).grupo_id, g);
    const r = await request(app).put(`/api/compras/fornecedores/${f.body.id}`).send({
      razao_social: 'Do grupo', nome_fantasia: '', cnpj: '', contato: '', email: '', telefone: '', endereco: '', grupo_id: null,
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await dbGet(db, 'SELECT grupo_id FROM fornecedores WHERE id = ?', [f.body.id])).grupo_id, null);
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
