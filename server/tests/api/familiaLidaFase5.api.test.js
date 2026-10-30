/**
 * Etapa 124 (Fase 5, revisor de sabotagem) — seis cenarios que as sabotagens deixaram sem prova (P1..P6 da revisao).
 * P1 material sem familia: o formulario manda familia_lida {null, null} -> 200 (sem o .nullable(), todo salvar dele daria 400).
 * P2 familia_id 0 / -1 na lida -> 400 do schema. P3 legado com subfamilia_id 0 gravado, salvar com lida null -> 200 (nao o
 * 409 falso). P4 o 409 cita o codigo GRAVADO mesmo trocando o codigo. P5 subfamilia com ativo NULL conta como inativa. P6 o
 * mesmo material em dois itens (o primeiro entregue) com a familia inativa: a frase nomeia a familia.
 *
 * Executar: cd server && node tests/api/familiaLidaFase5.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
// Etapa 193 (RN-193.02): PUT, DELETE e foto de /api/almoxarifado/materiais recusam para todos por padrao (o cadastro e so do
// Compras). Este arquivo prova o handler e as guardas que ficam ATRAS da recusa pela porta do almoxarifado (os perfis do
// almoxarifado, as guardas de estoque de quem pode), com a chave de reversao ligada (`ALMOX_CADASTRO_MATERIAL=liberado`,
// services/compras/cadastroDeMaterial.js) — sem ela nenhum desses gestos tem porta (letra C). A recusa: cadastroSoNoCompras.
process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
let passed = 0; let failed = 0;
async function test(id, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${id}`); } catch (e) { failed++; console.log(`  ✗ ${id}:`, String(e.message).replace(/\s+/g, ' ').slice(0, 300)); }
}
(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES ('aprovacao_automatica','0')
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`);
  let sf = 0;
  const fam = async (parent = null, ativo = 1) => { sf++; return (await dbRun(db, 'INSERT INTO familias_material_almoxarifado (codigo, nome, parent_id, ativo) VALUES (?, ?, ?, ?)', [`SR3-${sf}`, `Sonda ${sf}`, parent, ativo])).lastID; };
  let sm = 0;
  const mat = async (f, s) => { sm++; const codigo = `SR3M-${sm}`; const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, familia_id, subfamilia_id) VALUES (?, ?, 'PC', 0, 0, 1, 1, ?, ?)`, [codigo, `Peca ${sm}`, f, s])).lastID; return { id, codigo }; };
  const put = (u, id, body) => as(u, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send(body));
  const F1 = await fam(); const F2 = await fam(); const S1 = await fam(F1); const S2 = await fam(F1);

  await test('P1', async () => { // S3: material sem familia, o form manda familia_lida {null, null}
    const m = await mat(null, null);
    const r = await put(ALMOXARIFE, m.id, { nome: 'Sem fam', familia_lida: { familia_id: null, subfamilia_id: null } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });
  await test('P2', async () => { // S4: familia_id 0 / negativo na lida -> 400
    const m = await mat(F1, S1);
    for (const v of [0, -1]) {
      const r = await put(ALMOXARIFE, m.id, { nome: 'X', familia_lida: { familia_id: v } });
      assert.strictEqual(r.status, 400, `${v}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    }
  });
  await test('P3', async () => { // M2: legado com subfamilia_id 0 gravado; form le null e salva null -> 200
    const m = await mat(F1, null);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET subfamilia_id = 0 WHERE id = ?', [m.id]);
    const r = await put(ALMOXARIFE, m.id, { nome: 'Leg', familia_id: F1, subfamilia_id: null, familia_lida: { familia_id: F1, subfamilia_id: null } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  });
  await test('P4', async () => { // R6: o 409 cita o codigo GRAVADO mesmo quando o salvar troca o codigo
    const m = await mat(F1, S1);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET subfamilia_id = ? WHERE id = ?', [S2, m.id]);
    const r = await put(ALMOXARIFE, m.id, { codigo: 'NOVO-COD-R3', nome: 'X', familia_id: F1, subfamilia_id: S1, familia_lida: { familia_id: F1, subfamilia_id: S1 } });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.ok(r.body.error.startsWith(`A subfamília do material ${m.codigo} `), r.body.error);
  });
  const criar = async (itens) => { const r = await request(app).post('/api/almoxarifado/requisicoes').send({ os_referencia: 'OS-R3', itens: itens.map(([m, q]) => ({ material_id: m.id, quantidade: q })) }); assert.strictEqual(r.status, 201, JSON.stringify(r.body)); return r.body; };
  const aprovar = (R) => as(ADM, () => request(app).put(`/api/almoxarifado/requisicoes/${R}/aprovar`).send({}));
  await test('P5', async () => { // Q4: subfamilia com ativo NULL conta como inativa
    const R = await fam(); const Sx = await fam(R);
    const m = await mat(R, Sx);
    const r0 = await criar([[m, 1]]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [m.id]);
    await dbRun(db, 'UPDATE familias_material_almoxarifado SET ativo = NULL WHERE id = ?', [Sx]);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(r.body.error.includes(`Reative a subfamília de ${m.codigo} em Configurações`), r.body.error);
  });
  await test('P6', async () => { // G7: o mesmo material em dois itens, o primeiro entregue, o segundo pendente, familia inativa
    const R = await fam();
    const m = await mat(R, null); const outro = await mat(F1, null);
    const r0 = await criar([[m, 1], [outro, 1]]);
    const it = await dbGet(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? AND material_id = ?', [r0.id, m.id]);
    // o primeiro item (ordem ir.id) fica entregue; um segundo item do mesmo material, pendente, entra depois
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_entregue = 1 WHERE id = ?', [it.id]);
    await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?, ?, 1)`, [r0.id, m.id]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [m.id]);
    await dbRun(db, 'UPDATE familias_material_almoxarifado SET ativo = 0 WHERE id = ?', [R]);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(r.body.error.includes(`Reative a família de ${m.codigo} em Configurações`), r.body.error);
  });
  await close();
  console.log(`
${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
