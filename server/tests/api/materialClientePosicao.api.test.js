/**
 * Etapa 8, Task 8: posicao consolidada por cliente (recebido, consumido, devolvido, saldo) e o
 * detalhamento por OS/projeto. Os numeros saem do LIVRO DE MOVIMENTACOES, nao de colunas
 * acumuladoras — a ilha tinha quantidade_recebida/consumida/saldo como colunas que so ela
 * atualizava, e colunas acumuladoras que divergem em silencio ja custaram caro neste projeto.
 *
 * CONTROLE POSITIVO BILATERAL (regra da casa): a posicao do Cliente Alfa nao pode mostrar
 * material do Cliente Beta nem material nosso, E TEM de mostrar o do proprio Alfa com os numeros
 * certos. So a metade de ausencia seria aprovada por uma leitura que nao devolve nada.
 *
 * Executar: cd server && node tests/api/materialClientePosicao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function novoMaterial(db, { qtd = 0, proprietario_cliente_id = null } = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, proprietario_cliente_id)
    VALUES (?, ?, 'PC', ?, 0, 25, 1, ?)`,
  [`T8-POS-${seq}`, `Chapa 3mm ${seq}`, qtd, proprietario_cliente_id]);
  return r.lastID;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  // `projetos` e `ordens_servico` sao tabelas CORE (criadas por server/index.js no boot), fora do
  // initSchema do almoxarifado — o harness nao as monta. Mesmo precedente de
  // materialClienteGuardaSaida.api.test.js. Subconjunto minimo: a posicao le cliente_id para
  // achar o vinculo e o rotulo (nome/numero_os) para exibir onde a chapa foi aplicada.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS projetos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)`);
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT, cliente_id INTEGER,
    projeto_id INTEGER, status TEXT)`);

  const cliA = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Alfa LTDA'])).lastID;
  const cliB = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Beta SA'])).lastID;
  const projA = (await dbRun(db, 'INSERT INTO projetos (cliente_id, nome) VALUES (?, ?)', [cliA, 'Projeto Alfa'])).lastID;
  const osA = (await dbRun(db, 'INSERT INTO ordens_servico (numero_os, cliente_id, projeto_id) VALUES (?, ?, ?)',
    ['OS-ALFA-1', cliA, projA])).lastID;

  const matA = await novoMaterial(db, { proprietario_cliente_id: cliA });
  const matB = await novoMaterial(db, { proprietario_cliente_id: cliB });
  const matNosso = await novoMaterial(db);

  // Ciclo completo do material do cliente A: recebe 100, consome 30 no projeto e 20 na OS,
  // devolve 10. Saldo esperado: 40.
  await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: matA, tipo: 'ENTRADA_MANUAL', quantidade: 100, motivo: 'remessa do cliente' });
  await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: matA, tipo: 'SAIDA_PRODUCAO', quantidade: 30, motivo: 'corte', projeto_id: projA });
  await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: matA, tipo: 'SAIDA_MONTAGEM', quantidade: 20, motivo: 'montagem', os_id: osA });
  await request(app).post('/api/almoxarifado/materiais-cliente/devolucoes')
    .send({ material_id: matA, quantidade: 10, documento_devolucao: 'DEV-POS-1' });
  // Material do cliente B com movimento proprio — a posicao de A nao pode enxergar nada disto.
  await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: matB, tipo: 'ENTRADA_MANUAL', quantidade: 70, motivo: 'remessa do cliente B' });
  // Material proprio movimentado no MESMO projeto do cliente A — nao pode aparecer na posicao
  // dele nem inflar as aplicacoes por OS/projeto.
  await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: matNosso, tipo: 'ENTRADA_MANUAL', quantidade: 50, motivo: 'compra' });
  await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: matNosso, tipo: 'SAIDA_PRODUCAO', quantidade: 7, motivo: 'corte', projeto_id: projA });

  await test('GET /materiais-cliente/clientes lista so quem tem material, com contagem', async () => {
    const res = await request(app).get('/api/almoxarifado/materiais-cliente/clientes');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const alfa = res.body.find((c) => c.cliente_id === cliA);
    assert.ok(alfa, 'Cliente Alfa nao apareceu na lista');
    assert.strictEqual(alfa.cliente_nome, 'Cliente Alfa LTDA');
    assert.strictEqual(alfa.materiais, 1);
    assert.strictEqual(alfa.saldo_total, 40);
    assert.ok(res.body.find((c) => c.cliente_id === cliB), 'Cliente Beta (com material) sumiu');
    // O material NOSSO nao pode inventar um "cliente" na lista (proprietario_cliente_id NULL).
    assert.ok(!res.body.some((c) => c.cliente_id === null || c.cliente_id === 0),
      'material sem dono virou linha de cliente na lista');
  });

  await test('posicao consolidada: recebido, consumido, devolvido e saldo batem com o livro', async () => {
    const res = await request(app).get(`/api/almoxarifado/materiais-cliente/posicao?cliente_id=${cliA}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.cliente.razao_social, 'Cliente Alfa LTDA');
    assert.strictEqual(res.body.itens.length, 1);
    const item = res.body.itens[0];
    assert.strictEqual(item.material_id, matA);
    assert.strictEqual(item.recebido, 100);
    assert.strictEqual(item.consumido, 50);
    assert.strictEqual(item.devolvido, 10);
    assert.strictEqual(item.saldo, 40);
  });

  await test('a posicao de um cliente nao mostra material de outro cliente nem material nosso', async () => {
    const res = await request(app).get(`/api/almoxarifado/materiais-cliente/posicao?cliente_id=${cliA}`);
    const ids = res.body.itens.map((i) => i.material_id);
    assert.ok(!ids.includes(matB), 'material do Cliente Beta vazou para a posicao do Cliente Alfa');
    assert.ok(!ids.includes(matNosso), 'material proprio vazou para a posicao do cliente');
    assert.ok(ids.includes(matA), 'CONTROLE POSITIVO FALHOU: o material do proprio cliente sumiu');
    // A outra metade do controle bilateral: a posicao de B mostra o de B e nao o de A. Sem isto,
    // uma implementacao que devolvesse SEMPRE o material do primeiro cliente passaria acima.
    const resB = await request(app).get(`/api/almoxarifado/materiais-cliente/posicao?cliente_id=${cliB}`);
    const idsB = resB.body.itens.map((i) => i.material_id);
    assert.ok(idsB.includes(matB), 'CONTROLE POSITIVO FALHOU: o material do Cliente Beta sumiu da posicao dele');
    assert.ok(!idsB.includes(matA), 'material do Cliente Alfa vazou para a posicao do Cliente Beta');
    assert.strictEqual(resB.body.itens.find((i) => i.material_id === matB).recebido, 70);
  });

  await test('detalhamento por OS/projeto separa as duas aplicacoes', async () => {
    const res = await request(app).get(`/api/almoxarifado/materiais-cliente/posicao?cliente_id=${cliA}`);
    const porProjeto = res.body.aplicacoes.find((a) => a.projeto_id === projA && !a.os_id);
    const porOs = res.body.aplicacoes.find((a) => a.os_id === osA);
    assert.ok(porProjeto, 'aplicacao por projeto ausente');
    assert.strictEqual(porProjeto.quantidade, 30);
    assert.strictEqual(porProjeto.projeto_nome, 'Projeto Alfa');
    assert.ok(porOs, 'aplicacao por OS ausente');
    assert.strictEqual(porOs.quantidade, 20);
    assert.strictEqual(porOs.numero_os, 'OS-ALFA-1');
    // O consumo de 7 do material NOSSO caiu no MESMO projeto: nao pode entrar aqui.
    assert.ok(!res.body.aplicacoes.some((a) => a.material_id === matNosso),
      'consumo de material proprio no mesmo projeto vazou para as aplicacoes do cliente');
  });

  await test('movimentacao cancelada nao entra na posicao', async () => {
    // O livro guarda a linha cancelada; a posicao tem de ignora-la, senao o cliente ve consumo
    // que foi estornado.
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA_MANUAL', quantidade: 40, motivo: 'remessa' });
    const saida = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 15, motivo: 'corte', projeto_id: projA });
    const cancel = await request(app).post(`/api/almoxarifado/movimentacoes/${saida.body.id}/cancelar`)
      .send({ motivo: 'lancamento errado' });
    assert.strictEqual(cancel.status, 200, `o cancelamento nao rodou: ${JSON.stringify(cancel.body)}`);
    const res = await request(app).get(`/api/almoxarifado/materiais-cliente/posicao?cliente_id=${cliA}`);
    const item = res.body.itens.find((i) => i.material_id === mat);
    assert.ok(item, 'o material cancelado sumiu da posicao');
    assert.strictEqual(item.consumido, 0, 'consumo cancelado continuou contando na posicao do cliente');
    assert.strictEqual(item.saldo, 40);
    assert.ok(!res.body.aplicacoes.some((a) => a.material_id === mat),
      'aplicacao de movimento cancelado continuou no detalhamento por OS/projeto');
  });

  await test('posicao sem cliente_id devolve 400', async () => {
    const res = await request(app).get('/api/almoxarifado/materiais-cliente/posicao');
    assert.strictEqual(res.status, 400);
  });

  await test('posicao de cliente inexistente devolve 404', async () => {
    const res = await request(app).get('/api/almoxarifado/materiais-cliente/posicao?cliente_id=999999');
    assert.strictEqual(res.status, 404);
  });

  await test('o relatorio materiais-cliente volta a existir, agora exigindo cliente_id', async () => {
    // A Task 7 aposentou a ilha e deixou a chave do mapa de relatorios apontando para nada.
    const res = await request(app).get(`/api/almoxarifado/relatorios/materiais-cliente?cliente_id=${cliA}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.itens.some((i) => i.material_id === matA), 'o relatorio nao trouxe o material do cliente');
    const semCliente = await request(app).get('/api/almoxarifado/relatorios/materiais-cliente');
    assert.strictEqual(semCliente.status, 400, 'relatorio sem cliente_id devia recusar');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
