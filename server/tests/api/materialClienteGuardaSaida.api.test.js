/**
 * Etapa 8, Task 3 — decisoes 5 e 6 do design.
 *
 * (5) Material de cliente so sai com OS ou projeto DAQUELE cliente. `projetos` e `ordens_servico`
 *     tem cliente_id, entao a checagem e real. E o primeiro teste que a spec 13 lista.
 * (6) A saida emergencial NAO fura essa guarda — unica excecao ao padrao do modulo, de proposito:
 *     o emergencial existe para urgencia no NOSSO estoque; consumir material de outra empresa sem
 *     dizer onde e problema contratual, nao de pressa.
 *
 * Executar: cd server && node tests/api/materialClienteGuardaSaida.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function novoMaterial(db, { qtd = 100, proprietario_cliente_id = null } = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, proprietario_cliente_id)
    VALUES (?, ?, 'PC', ?, 0, 25, 1, ?)`,
  [`T8-GRD-${seq}`, `Chapa 3mm ${seq}`, qtd, proprietario_cliente_id]);
  return r.lastID;
}
const totalDoMaterial = async (db, id) =>
  (await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  // `projetos` e `ordens_servico` sao tabelas CORE (criadas por server/index.js no boot), fora do
  // initSchema do almoxarifado — o harness nao as monta. Mesmo precedente de
  // livroExtrato.api.test.js, que cria `ordens_servico` a mao para o aux de OS. Subconjunto
  // minimo: a guarda do dono le cliente_id + o rotulo (nome/numero_os) para a mensagem de erro.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS projetos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)`);
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT, cliente_id INTEGER,
    projeto_id INTEGER, status TEXT)`);

  const cliA = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Alfa LTDA'])).lastID;
  const cliB = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Beta SA'])).lastID;
  const projA = (await dbRun(db, 'INSERT INTO projetos (cliente_id, nome) VALUES (?, ?)', [cliA, 'Projeto Alfa'])).lastID;
  const projB = (await dbRun(db, 'INSERT INTO projetos (cliente_id, nome) VALUES (?, ?)', [cliB, 'Projeto Beta'])).lastID;
  const osA = (await dbRun(db, 'INSERT INTO ordens_servico (numero_os, cliente_id, projeto_id) VALUES (?, ?, ?)',
    ['OS-ALFA-1', cliA, projA])).lastID;
  const osB = (await dbRun(db, 'INSERT INTO ordens_servico (numero_os, cliente_id, projeto_id) VALUES (?, ?, ?)',
    ['OS-BETA-1', cliB, projB])).lastID;

  await test('consumir material do cliente A em projeto do cliente B falha', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 10, motivo: 'teste', projeto_id: projB });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    // A mensagem tem de NOMEAR OS DOIS clientes: generica obrigaria o operador a adivinhar qual
    // das duas pontas esta errada (o material ou o vinculo).
    assert.ok(/Cliente Alfa LTDA/.test(res.body.error), res.body.error);
    assert.ok(/Cliente Beta SA/.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 100, 'a saida recusada nao podia debitar');
  });

  await test('consumir material do cliente A em OS de outro cliente falha', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_MONTAGEM', quantidade: 5, motivo: 'teste', os_id: osB });
    assert.strictEqual(res.status, 400);
    assert.ok(/Cliente Alfa LTDA/.test(res.body.error) && /Cliente Beta SA/.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 100);
  });

  await test('consumir material do cliente A em projeto do proprio cliente A funciona', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 10, motivo: 'teste', projeto_id: projA });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 90);
  });

  await test('consumir material do cliente A em OS do proprio cliente A funciona', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_ASSISTENCIA', quantidade: 4, motivo: 'teste', os_id: osA });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 96);
  });

  await test('SAIDA generica de material de cliente sem OS nem projeto falha (mesmo com justificativa)', async () => {
    // SAIDA tem vinculo 'qualquer' em REGRAS_VINCULO: justificativa sozinha basta para o material
    // NOSSO. Para material de cliente nao basta — a guarda do dono e mais estreita.
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 3, motivo: 'teste', justificativa: 'preciso agora' });
    assert.strictEqual(res.status, 400);
    assert.ok(/Cliente Alfa LTDA/.test(res.body.error), res.body.error);
    assert.ok(/OS ou projeto/i.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 100);
  });

  await test('saida emergencial nao fura a guarda do dono', async () => {
    // Em avaliarRegrasVinculo o emergencial BYPASSA a exigencia de vinculo. Aqui nao.
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 10, motivo: 'teste',
        emergencial: true, justificativa: 'linha parada' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/emergencial/i.test(res.body.error), res.body.error);
    assert.ok(/Cliente Alfa LTDA/.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 100);
  });

  await test('emergencial com o vinculo CERTO tambem falha — o emergencial nao existe para material de cliente', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 10, motivo: 'teste',
        projeto_id: projA, emergencial: true, justificativa: 'linha parada' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/emergencial/i.test(res.body.error), res.body.error);
  });

  await test('CONTROLE POSITIVO: material NOSSO continua saindo emergencial e sem vinculo', async () => {
    const mat = await novoMaterial(db); // proprietario_cliente_id NULL
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 10, motivo: 'teste',
        emergencial: true, justificativa: 'linha parada' });
    assert.strictEqual(res.status, 201, `a guarda vazou para material proprio: ${JSON.stringify(res.body)}`);
    assert.strictEqual(await totalDoMaterial(db, mat), 90);
    const mov = await dbGet(db, 'SELECT regularizacao_pendente FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id DESC LIMIT 1', [mat]);
    assert.strictEqual(mov.regularizacao_pendente, 1, 'o emergencial de material proprio deixou de marcar regularizacao');
  });

  await test('CONTROLE POSITIVO: material NOSSO sai em projeto de qualquer cliente', async () => {
    // A guarda e sobre o DONO do material, nao sobre o cliente do vinculo. Material nosso pode ir
    // para o projeto do Alfa hoje e do Beta amanha — se a guarda vazasse para material sem dono,
    // este caso viraria 400 e nao apareceria em nenhum outro teste do arquivo.
    const mat = await novoMaterial(db);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 7, motivo: 'teste', projeto_id: projB });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 93);
  });

  await test('SUCATA de material de cliente tambem exige o vinculo do dono', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SUCATA', quantidade: 2, motivo: 'teste', justificativa: 'peca danificada' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/Cliente Alfa LTDA/.test(res.body.error), res.body.error);
    const ok = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SUCATA', quantidade: 2, motivo: 'teste',
        justificativa: 'peca danificada', projeto_id: projA });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  });

  await test('PERDA de material de cliente tambem exige o vinculo do dono', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'PERDA', quantidade: 1, motivo: 'teste', justificativa: 'extraviada' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/Cliente Alfa LTDA/.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 100);
  });

  await test('TRANSFERENCIA de material de cliente e isenta (mover de prateleira nao e aplicar)', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const l1 = (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES ('T8-L1','Rua 1',1)")).lastID;
    const l2 = (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES ('T8-L2','Rua 2',1)")).lastID;
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,?)', [mat, l1, 100]);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'TRANSFERENCIA', quantidade: 10, motivo: 'teste',
        localizacao_origem_id: l1, localizacao_destino_id: l2 });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  await test('entrada de material de cliente nao passa pela guarda de saida', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA, qtd: 0 });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA_MANUAL', quantidade: 50, motivo: 'remessa do cliente' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 50);
  });

  await test('estorno de saida de material de cliente continua possivel (a guarda nao vaza para o cancelamento)', async () => {
    // O segundo `tiposSaida` do stockService vive em cancelarMovimentacao. A guarda do dono NAO
    // e chamada la de proposito: estornar devolve a chapa do cliente ao estoque, o oposto de
    // aplica-la no cliente errado. Se alguem "espelhar" a guarda no cancelamento por simetria,
    // este teste fica vermelho — e a saida certa vira uma saida que nao pode ser desfeita.
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const saida = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 10, motivo: 'teste', projeto_id: projA });
    assert.strictEqual(saida.status, 201, JSON.stringify(saida.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 90);
    const cancel = await request(app).post(`/api/almoxarifado/movimentacoes/${saida.body.id}/cancelar`)
      .send({ motivo: 'lancamento errado' });
    assert.strictEqual(cancel.status, 200, JSON.stringify(cancel.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 100);
  });

  await test('consumo acima do saldo falha (regra da spec 13, agora pelo motor)', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA, qtd: 10 });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 40, motivo: 'teste', projeto_id: projA });
    assert.strictEqual(res.status, 400);
    assert.ok(/Saldo insuficiente/i.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 10);
  });

  await test('vinculo inexistente e recusado em vez de virar saida sem dono', async () => {
    // Se resolverClienteDoVinculo tratasse "projeto nao encontrado" como "sem vinculo", a
    // mensagem mandaria informar OS/projeto que ja foram informados. E se tratasse como
    // cliente_id NULL sem recusar, um projeto apagado viraria porta de saida.
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 1, motivo: 'teste', projeto_id: 999999 });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 100);
  });

  await test('projeto SEM cliente_id nao serve de vinculo para material de cliente', async () => {
    // Projeto interno (cliente_id NULL) nao pode virar coringa: NULL !== cliA precisa barrar.
    const projInterno = (await dbRun(db, 'INSERT INTO projetos (cliente_id, nome) VALUES (NULL, ?)', ['Projeto Interno'])).lastID;
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 1, motivo: 'teste', projeto_id: projInterno });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/Cliente Alfa LTDA/.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 100);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
