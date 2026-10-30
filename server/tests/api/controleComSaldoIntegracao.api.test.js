/**
 * Etapa 112 (T2) — integracao: ligar lote/serie com saldo ate o ultimo gesto (C222).
 *
 * A mensagem E1 manda pedir ao Administrador para ligar e regularizar. Aqui o caminho inteiro passa pelas rotas de verdade
 * (PUT do material + motor pela v2 + regularizacao de series):
 *  (i)   lote: o Almoxarife e recusado; o Administrador liga; a Saida sem lote e recusada (o saldo preso que a regra
 *        anuncia); a regularizacao — Entrada com lote + Ajuste do total — zera o "sem lote" e a Saida pelo lote passa;
 *  (ii)  serie: o Administrador liga, regulariza as series do saldo antigo e a Saida pela serie passa;
 *  (iii) material de cliente: a mesma regularizacao do lote, pelo Administrador (o Ajuste de cliente e dele);
 *  (iv)  o caminho do Almoxarife sem o Administrador: a Entrada com lote ANTES de ligar deixa o saldo identificado.
 *
 * Plano: docs/superpowers/plans/2026-10-15-almoxarifado-etapa112-controle-com-saldo.md
 * Executar: cd server && node tests/api/controleComSaldoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
// Etapa 193 (RN-193.02): PUT, DELETE e foto de /api/almoxarifado/materiais recusam para todos por padrao (o cadastro e so do
// Compras). Este arquivo prova o handler e as guardas que ficam ATRAS da recusa pela porta do almoxarifado (os perfis do
// almoxarifado, as guardas de estoque de quem pode), com a chave de reversao ligada (`ALMOX_CADASTRO_MATERIAL=liberado`,
// services/compras/cadastroDeMaterial.js) — sem ela nenhum desses gestos tem porta (letra C). A recusa: cadastroSoNoCompras.
process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };

const E1_INICIO = (codigo, nomes) => `Ligar o controle ${nomes} no material ${codigo} exige a permissão "ajustar_estoque" `
  + '(seu perfil: ALMOXARIFE): ';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  let seq = 0;
  const material = async (dono = null) => {
    seq += 1;
    const codigo = `E112I-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
      custo_unitario, ativo, proprietario_cliente_id) VALUES (?, ?, 'PC', 0, 0, 10, 1, ?)`, [codigo, codigo, dono])).lastID;
    return { id, codigo };
  };
  const put = (u, id, body) => as(u, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send(body));
  const mov = (u, m, body) => as(u, () => request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: m.id, motivo: 'e112i', justificativa: 'e112 integracao', documento_vinculado: 'NF-112', ...body }));
  const ok = async (p, rotulo, status = 201) => {
    const r = await p;
    assert.strictEqual(r.status, status, `${rotulo}: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q;
  const semLote = async (m) => (await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) q FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND lote_id IS NULL`, [m.id])).q;
  const recusaAlmox = async (m, body, nomes) => {
    const r = await put(ALMOXARIFE, m.id, body);
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.ok(r.body.error.startsWith(E1_INICIO(m.codigo, nomes)), r.body.error);
  };
  const regularizarLote = async (m, q, lote) => {
    await ok(mov(ADM, m, { tipo: 'ENTRADA', quantidade: q, lote }), 'entrada com lote');
    await ok(mov(ADM, m, { tipo: 'AJUSTE', quantidade: q, justificativa: 'regularizar o saldo antigo sem lote' }), 'ajuste do total');
  };

  await test('[RN-01/RN-02 integracao lote] Almoxarife 403 -> Administrador liga -> saida sem lote 400 -> regulariza -> saida pelo lote', async () => {
    const m = await material();
    await ok(mov(ALMOXARIFE, m, { tipo: 'ENTRADA', quantidade: 5 }), 'entrada');
    await recusaAlmox(m, { controle_lote: 1 }, 'por lote');
    await ok(put(ADM, m.id, { controle_lote: 1 }), 'liga', 200);
    const presa = await mov(ALMOXARIFE, m, { tipo: 'SAIDA', quantidade: 1 });
    assert.strictEqual(presa.status, 400, 'premissa: o saldo sem lote fica preso ate regularizar');
    await regularizarLote(m, 5, 'L1');
    assert.strictEqual(await fisico(m), 5);
    assert.strictEqual(await semLote(m), 0, 'a regularizacao nao zerou o sem lote');
    await ok(mov(ALMOXARIFE, m, { tipo: 'SAIDA', quantidade: 2, lote: 'L1' }), 'saida pelo lote');
    assert.strictEqual(await fisico(m), 3);
  });

  await test('[RN-01/RN-02 integracao serie] Almoxarife 403 -> Administrador liga -> regulariza series -> saida pela serie', async () => {
    const m = await material();
    await ok(mov(ALMOXARIFE, m, { tipo: 'ENTRADA', quantidade: 2 }), 'entrada');
    await recusaAlmox(m, { controle_serie: 1 }, 'por número de série');
    await ok(put(ADM, m.id, { controle_serie: 1 }), 'liga', 200);
    const presa = await mov(ALMOXARIFE, m, { tipo: 'SAIDA', quantidade: 1 });
    assert.strictEqual(presa.status, 400, 'premissa: sem series a saida fica presa');
    await ok(as(ADM, () => request(app).post(`/api/almoxarifado/materiais/${m.id}/series/regularizar`)
      .send({ cadastrar: ['S1', 'S2'], justificativa: 'saldo antigo sem serie' })), 'regularizar', 200);
    const s1 = await dbGet(db, "SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = 'S1'", [m.id]);
    await ok(mov(ALMOXARIFE, m, { tipo: 'SAIDA', quantidade: 1, serie_ids: [s1.id] }), 'saida S1');
    const series = await dbAll(db, 'SELECT numero, status FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id]);
    assert.deepStrictEqual(series.map((s) => `${s.numero}:${s.status}`), ['S1:ENTREGUE', 'S2:EM_ESTOQUE']);
  });

  await test('[RN-02 integracao cliente] material de cliente: o Administrador liga e regulariza o lote', async () => {
    const cli = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente I112'])).lastID;
    const m = await material(cli);
    await ok(mov(ADM, m, { tipo: 'ENTRADA', quantidade: 4 }), 'entrada');
    await recusaAlmox(m, { controle_lote: 1 }, 'por lote');
    await ok(put(ADM, m.id, { controle_lote: 1 }), 'liga', 200);
    await regularizarLote(m, 4, 'LC1');
    assert.strictEqual(await semLote(m), 0);
    assert.strictEqual(await fisico(m), 4);
  });

  await test('[RN-03 integracao] sem o Administrador: a Entrada com lote antes de ligar deixa o saldo identificado', async () => {
    const m = await material();
    await ok(mov(ALMOXARIFE, m, { tipo: 'ENTRADA', quantidade: 6, lote: 'L7' }), 'entrada com lote, sem controle');
    await ok(put(ALMOXARIFE, m.id, { controle_lote: 1 }), 'liga', 200);
    await ok(mov(ALMOXARIFE, m, { tipo: 'SAIDA', quantidade: 6, lote: 'L7' }), 'saida pelo lote');
    assert.strictEqual(await fisico(m), 0);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
