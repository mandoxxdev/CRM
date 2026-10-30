/**
 * Etapa 108 (C213) — integracao: o furo inteiro fechado, pela rota E pelo servico.
 *
 * O furo medido na Etapa 106 (sonda e106c213): o Almoxarife, sozinho, tirava o cliente do cadastro (PUT 200), ajustava
 * como material nosso (201) e devolvia o cliente (PUT 200) — total mudado, nenhuma auditoria `material_cliente`. Aqui o
 * documento vai ate o fim: a guarda do ajuste (Etapa 8) continua de pe porque o dono nao sai mais, a edicao do resto do
 * cadastro continua livre, e a troca autorizada move a posicao por cliente e deixa trilha.
 *
 * Executar: cd server && node tests/api/trocaDonoMaterialIntegracao.api.test.js
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
const ownerRules = require('../../services/almoxarifado/ownerRules');
const clienteEstoqueService = require('../../services/almoxarifado/clienteEstoqueService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS projetos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)');
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT,
    cliente_id INTEGER, projeto_id INTEGER, status TEXT)`);
  const A = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Metalurgica Alfa LTDA'])).lastID;
  const B = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Caldeiraria Beta SA'])).lastID;

  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  const put = (u, id, body) => as(u, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send(body));
  const mov = (u, body) => as(u, () => request(app).post('/api/almoxarifado/movimentacoes/v2').send(body));
  const linha = (id) => dbGet(db, `SELECT proprietario_cliente_id dono, nome, quantidade_atual q FROM materiais_almoxarifado
    WHERE id = ?`, [id]);
  const naPosicao = async (cliente, id) => (await clienteEstoqueService.posicaoPorCliente(db, { cliente_id: cliente }))
    .itens.find((i) => i.material_id === id);
  let seq = 0;
  const material = async (dono) => {
    seq += 1;
    const codigo = `E108K-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, custo_unitario,
      ativo, proprietario_cliente_id) VALUES (?, ?, 'PC', 0, 10, 1, ?)`, [codigo, `Chapa K${seq}`, dono])).lastID;
    return { id, codigo };
  };

  await test('[K1] pela rota: o Almoxarife nao tira mais o dono para ajustar; o Administrador troca e a posicao acompanha', async () => {
    const m = await material(A);
    const ent = await mov(SUPER, { material_id: m.id, tipo: 'ENTRADA', quantidade: 10, motivo: 'nf', documento_vinculado: 'NF-1' });
    assert.strictEqual(ent.status, 201, JSON.stringify(ent.body));

    const aj1 = await mov(ALMOXARIFE, { material_id: m.id, tipo: 'AJUSTE', quantidade: 50, justificativa: 'contagem' });
    assert.strictEqual(aj1.status, 403, `a guarda do ajuste (Etapa 8): ${JSON.stringify(aj1.body)}`);

    const tira = await put(ALMOXARIFE, m.id, { proprietario_cliente_id: null });
    assert.strictEqual(tira.status, 403, JSON.stringify(tira.body));
    assert.match(tira.body.error, /^Trocar o dono do material E108K-1 \(de cliente Metalurgica Alfa LTDA para estoque proprio/);
    assert.strictEqual((await linha(m.id)).dono, A);

    const aj2 = await mov(ALMOXARIFE, { material_id: m.id, tipo: 'AJUSTE', quantidade: 50, justificativa: 'contagem' });
    assert.strictEqual(aj2.status, 403, `o ajuste continua barrado: ${JSON.stringify(aj2.body)}`);
    assert.strictEqual((await linha(m.id)).q, 10, 'o total do cliente mudou');

    const edita = await put(ALMOXARIFE, m.id, { nome: 'Chapa 3mm Alfa', proprietario_cliente_id: A });
    assert.strictEqual(edita.status, 200, `editar o resto do cadastro reenviando o dono: ${JSON.stringify(edita.body)}`);
    assert.strictEqual((await linha(m.id)).nome, 'Chapa 3mm Alfa');

    assert.strictEqual((await naPosicao(A, m.id)).recebido, 10);
    const troca = await put(ADM, m.id, { proprietario_cliente_id: B });
    assert.strictEqual(troca.status, 200, JSON.stringify(troca.body));
    assert.strictEqual(await naPosicao(A, m.id), undefined, 'o material continuou na posicao de A');
    assert.strictEqual((await naPosicao(B, m.id)).recebido, 10, 'o historico nao foi para B');
    const aud = await dbGet(db, `SELECT dados_anteriores, dados_novos FROM auditoria_log_almoxarifado
      WHERE entidade = 'material_cliente' AND acao = 'TROCA_DONO' AND entidade_id = ?`, [m.id]);
    assert.ok(aud, 'sem TROCA_DONO');
    assert.strictEqual(JSON.parse(aud.dados_anteriores).proprietario_cliente_nome, 'Metalurgica Alfa LTDA');
    assert.strictEqual(JSON.parse(aud.dados_novos).proprietario_cliente_nome, 'Caldeiraria Beta SA');

    const aj3 = await mov(ALMOXARIFE, { material_id: m.id, tipo: 'AJUSTE', quantidade: 50, justificativa: 'contagem' });
    assert.strictEqual(aj3.status, 403, `com o dono novo o ajuste continua barrado: ${JSON.stringify(aj3.body)}`);
  });

  await test('[K2] pelo servico: a guarda recusa o Almoxarife e devolve a troca ao Administrador', async () => {
    const m = await material(A);
    await mov(SUPER, { material_id: m.id, tipo: 'ENTRADA', quantidade: 2, motivo: 'nf', documento_vinculado: 'NF-2' });
    const gravado = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    await assert.rejects(ownerRules.assertTrocaDeDonoPermitida(db, gravado, null, ALMOXARIFE), (e) => e.status === 403);
    const t = await ownerRules.assertTrocaDeDonoPermitida(db, gravado, null, ADM);
    assert.strictEqual(t.comHistorico, true);
    assert.strictEqual(t.paraId, null);
  });

  await test('[K3] material recem-criado sem saldo: o Almoxarife corrige o dono escolhido errado (200)', async () => {
    const fam = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome) VALUES ('E108-FAM', 'Fam E108')")).lastID;
    const cria = await as(ALMOXARIFE, () => request(app).post('/api/almoxarifado/materiais').send({
      codigo: 'E108K-NOVO', nome: 'Chapa nova', categoria: 'OUTROS', familia_id: fam, proprietario_cliente_id: A,
    }));
    assert.strictEqual(cria.status, 201, JSON.stringify(cria.body));
    const r = await put(ALMOXARIFE, cria.body.id, { proprietario_cliente_id: B });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(cria.body.id)).dono, B);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
