/**
 * Etapa 113 (T3) — integracao: a recusa de inativar com saldo (RN-01) so vale se o caminho que ela manda seguir EXISTE e
 * leva ao "Inativar" aceito. Cruza o DELETE de material com o motor (Saida), a devolucao ao cliente, a reserva da
 * requisicao (aprovar -> cancelar) e o PUT de familia (reativar a familia -> reativar o material, RN-05).
 *
 * Executar: cd server && node tests/api/situacaoMaterialIntegracao.api.test.js
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

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM_PERFIL = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const ENGENHARIA = { id: 6, nome: 'Eng Teste', role: 'user', email: 'eng@test.com', perfil_almoxarifado: 'ENGENHARIA' };
const INATIVO = 'Material inativo não pode ser movimentado';
const prefixoE1 = (codigo) => `Não é possível inativar o material ${codigo}: o saldo físico é `;

(async () => {
  const { app, db, setUser } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `I113-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, `Peca ${seq}`])).lastID;
    for (const [k, v] of Object.entries(extra)) {
      await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    }
    return { id, codigo };
  }
  const mov = (u, m, body) => as(u, () => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id,
    motivo: 'e113', justificativa: 'integracao e113', documento_vinculado: 'NF-I113', ...body }));
  const del = (u, m) => as(u, () => request(app).delete(`/api/almoxarifado/materiais/${m.id}`));
  const ativo = async (m) => (await dbGet(db, 'SELECT ativo FROM materiais_almoxarifado WHERE id = ?', [m.id])).ativo;
  const ok = (r, status = 200) => assert.strictEqual(r.status, status, JSON.stringify(r.body));

  await test('(i) Almoxarife: inativar com 5 -> E1 -> Saida de 5 -> inativar 200 -> Saida recusada (inativo)', async () => {
    const m = await material();
    ok(await mov(SUPER, m, { tipo: 'ENTRADA', quantidade: 5 }), 201);
    let r = await del(ALMOXARIFE, m);
    ok(r, 400);
    assert.ok(r.body.error.startsWith(`${prefixoE1(m.codigo)}5.`), r.body.error);
    assert.ok(r.body.error.endsWith('zere o saldo com uma Saída ou um Ajuste.'), r.body.error);
    ok(await mov(ALMOXARIFE, m, { tipo: 'SAIDA', quantidade: 5 }), 201);
    r = await del(ALMOXARIFE, m);
    ok(r);
    assert.strictEqual(await ativo(m), 0);
    r = await mov(ALMOXARIFE, m, { tipo: 'ENTRADA', quantidade: 1 });
    ok(r, 400);
    assert.strictEqual(r.body.error, INATIVO);
  });

  await test('(ii) material de cliente: E1 manda devolver -> Devolver ao cliente -> inativar 200 (Engenharia)', async () => {
    const cli = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente I113')")).lastID;
    const m = await material({ proprietario_cliente_id: cli });
    ok(await mov(SUPER, m, { tipo: 'ENTRADA', quantidade: 3 }), 201);
    let r = await del(ENGENHARIA, m);
    ok(r, 400);
    assert.ok(r.body.error.startsWith(`${prefixoE1(m.codigo)}3.`), r.body.error);
    // a Engenharia nao movimenta: o E1 manda pedir ao almoxarifado, que e quem devolve (logo abaixo)
    assert.ok(r.body.error.endsWith('devolva o saldo ao cliente ("Devolver ao cliente", em Materiais de Clientes). '
      + 'Seu perfil (ENGENHARIA) não movimenta estoque: peça isso ao almoxarifado.'), r.body.error);
    r = await as(ALMOXARIFE, () => request(app).post('/api/almoxarifado/materiais-cliente/devolucoes')
      .send({ material_id: m.id, quantidade: 3, documento_devolucao: 'NFD-I113' }));
    ok(r, 201);
    r = await del(ENGENHARIA, m);
    ok(r);
    assert.strictEqual(await ativo(m), 0);
  });

  await test('(iii) reativar: familia inativa -> 400 -> reativar a familia -> reativar o material -> Entrada passa', async () => {
    const f = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('FI113', 'Familia I113', 1)")).lastID;
    const m = await material({ familia_id: f });
    ok(await del(ALMOXARIFE, m));
    let r = await as(ADM_PERFIL, () => request(app).delete(`/api/almoxarifado/familias/${f}`));
    ok(r);
    r = await as(ADM_PERFIL, () => request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ ativo: 1 }));
    ok(r, 400);
    assert.strictEqual(r.body.error, 'Família inativa — não é possível vincular novos itens');
    r = await as(ADM_PERFIL, () => request(app).put(`/api/almoxarifado/familias/${f}`).send({ nome: 'Familia I113', ativo: 1 }));
    ok(r);
    r = await as(ADM_PERFIL, () => request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ ativo: 1 }));
    ok(r);
    assert.strictEqual(await ativo(m), 1);
    ok(await mov(ALMOXARIFE, m, { tipo: 'ENTRADA', quantidade: 2 }), 201);
    // e agora a familia nao inativa mais com ele dentro (o estado que a C220 deixava)
    r = await as(ADM_PERFIL, () => request(app).delete(`/api/almoxarifado/familias/${f}`));
    ok(r, 400);
  });

  await test('(iv) reserva: requisicao aprovada reserva 2 -> E1 com "reservado 2" -> cancelar -> Saida -> inativar 200', async () => {
    const m = await material();
    ok(await mov(SUPER, m, { tipo: 'ENTRADA', quantidade: 5 }), 201);
    const cr = await request(app).post('/api/almoxarifado/requisicoes')
      .send({ os_referencia: 'OS-I113', itens: [{ material_id: m.id, quantidade: 2 }] });
    ok(cr, 201);
    ok(await as(ADM_PERFIL, () => request(app).put(`/api/almoxarifado/requisicoes/${cr.body.id}/aprovar`).send({})));
    const res = await dbGet(db, 'SELECT quantidade_reservada FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    assert.strictEqual(res.quantidade_reservada, 2, 'a aprovacao nao reservou (pre-condicao)');
    let r = await del(ALMOXARIFE, m);
    ok(r, 400);
    assert.ok(r.body.error.startsWith(`${prefixoE1(m.codigo)}5 (reservado 2). `), r.body.error);
    assert.ok(r.body.error.includes('Libere primeiro o que está retido e, depois, zere o saldo'), r.body.error);
    ok(await request(app).put(`/api/almoxarifado/requisicoes/${cr.body.id}/cancelar`).send({ motivo: 'integracao e113' }));
    ok(await mov(ALMOXARIFE, m, { tipo: 'SAIDA', quantidade: 5 }), 201);
    ok(await del(ALMOXARIFE, m));
    assert.strictEqual(await ativo(m), 0);
  });

  // R1 da Fase 2: inativar SEM saldo e livre (RN-02), mas uma conferencia aberta que conta o material nao conclui depois
  // (o concluir e tudo ou nada). A saida e reativar (RN-05/RN-08), concluir e inativar de novo.
  await test('(v) inventario: inativado com conferencia aberta -> concluir 400 -> reativar -> concluir 200 -> inativar E1', async () => {
    const categoria = 'CAT-I113';
    const m = await material({ categoria });
    const outro = await material({ categoria });
    ok(await mov(SUPER, outro, { tipo: 'ENTRADA', quantidade: 10 }), 201);
    const conf = await request(app).post('/api/almoxarifado/conferencias').send({ categoria, tolerancia_percentual: 1000 });
    ok(conf, 201);
    ok(await del(ALMOXARIFE, m));
    const itens = await new Promise((resolve, reject) => db.all(
      'SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ?', [conf.body.id],
      (e, rows) => (e ? reject(e) : resolve(rows))));
    const item = (id) => itens.find((i) => i.material_id === id);
    ok(await request(app).put(`/api/almoxarifado/conferencias/${conf.body.id}/item/${item(m.id).id}`).send({ quantidade_contada: 3 }));
    ok(await request(app).put(`/api/almoxarifado/conferencias/${conf.body.id}/item/${item(outro.id).id}`).send({ quantidade_contada: 9 }));
    const concluir = () => request(app).put(`/api/almoxarifado/conferencias/${conf.body.id}/concluir`)
      .send({ aplicar_ajustes: true, justificativa_ajuste: 'inventario e113' });
    let r = await concluir();
    ok(r, 400);
    assert.ok(r.body.error.includes(`${m.codigo}: ${INATIVO}`), r.body.error);
    r = await as(ALMOXARIFE, () => request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ ativo: 1 }));
    ok(r);
    ok(await concluir());
    const q = async (x) => (await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [x.id])).quantidade_atual;
    assert.strictEqual(await q(m), 3);
    assert.strictEqual(await q(outro), 9);
    r = await del(ALMOXARIFE, m);
    ok(r, 400);
    assert.ok(r.body.error.startsWith(`${prefixoE1(m.codigo)}3.`), r.body.error);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
