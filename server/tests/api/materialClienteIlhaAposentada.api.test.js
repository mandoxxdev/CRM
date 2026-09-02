/**
 * Etapa 8, Task 7 — decisao 4 do design: as rotas da ilha somem. Enquanto vivas, sao um caminho
 * paralelo que ESCAPA de todas as guardas desta etapa — consumirMaterialCliente nao valida
 * cliente, nao valida projeto e nao passa pelo motor. A TABELA fica (a medicao de 0 linhas cobriu
 * so o banco de dev; apagar tabela com base em medicao que nao cobre producao nao tem volta).
 *
 * COMO ESTE ARQUIVO EVITA SER UM TESTE VAZIO (regra da casa, ja falhou 3x no projeto):
 * "veio 404" prova pouco — uma rota que nunca existiu, um prefixo digitado errado ou um modulo de
 * rotas que quebrou inteiro respondem 404 igualzinho a uma rota removida. Duas travas:
 *
 *   1. TODOS os caminhos sao montados a partir da MESMA constante ILHA. Um erro de digitacao no
 *      prefixo derruba junto o controle positivo (`POST ${ILHA}/devolucoes`, a rota da Task 6, que
 *      esta viva e no mesmo arquivo de rotas). Nao existe estado em que os 404 sejam falsos
 *      positivos e o controle positivo continue passando.
 *   2. O mesmo par vale para o mapa de relatorios: `relatorios/materiais-cliente` tem de dar 404
 *      enquanto `relatorios/estoque-atual` responde 200 — o dispatcher continua de pe, so a chave
 *      da ilha e que saiu.
 *
 * Executar: cd server && node tests/api/materialClienteIlhaAposentada.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbAll, dbRun } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

// Prefixo unico: os caminhos removidos e o do controle positivo saem todos daqui.
const ILHA = '/api/almoxarifado/materiais-cliente';
const RELATORIOS = '/api/almoxarifado/relatorios';

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('CONTROLE POSITIVO: o prefixo /materiais-cliente esta montado — a rota de devolucao ao cliente (Task 6) responde', async () => {
    // Roda ANTES dos 404 de proposito: se este falhar, os 404 abaixo nao significam "removida",
    // significam "prefixo errado" ou "o modulo de rotas quebrou inteiro".
    const res = await request(app).post(`${ILHA}/devolucoes`).send({});
    assert.notStrictEqual(res.status, 404,
      `POST ${ILHA}/devolucoes respondeu 404 — o prefixo nao esta montado, entao os 404 das rotas `
      + 'removidas nao provam nada');
    assert.strictEqual(res.status, 400,
      `esperado 400 (corpo vazio reprovado pelo DevolucaoClienteSchema), veio ${res.status}`);
  });

  await test('rotas da ilha nao existem mais', async () => {
    const get = await request(app).get(ILHA);
    assert.strictEqual(get.status, 404, `GET ${ILHA} ainda responde ${get.status}`);
    const post = await request(app).post(ILHA)
      .send({ cliente_id: 1, descricao: 'chapa', quantidade_recebida: 10 });
    assert.strictEqual(post.status, 404, `POST ${ILHA} ainda responde ${post.status}`);
    const consumir = await request(app).post(`${ILHA}/1/consumir`).send({ quantidade: 1 });
    assert.strictEqual(consumir.status, 404, `POST ${ILHA}/:id/consumir ainda responde ${consumir.status}`);
  });

  await test('o relatorio materiais-cliente nao le mais a tabela da ilha', async () => {
    // Mesmo par: o positivo primeiro, senao um dispatcher quebrado passaria como "chave trocada".
    const vivo = await request(app).get(`${RELATORIOS}/estoque-atual`);
    assert.strictEqual(vivo.status, 200,
      `CONTROLE POSITIVO: ${RELATORIOS}/estoque-atual respondeu ${vivo.status} — o dispatcher de `
      + 'relatorios quebrou, a asercao abaixo nao prova nada');

    // Etapa 8, Task 8: entre a Task 7 e a Task 8 esta chave respondia 404 (a da ilha saiu com o
    // clientMaterialService e nada ocupou o lugar). Agora ela existe de novo, apontando para o
    // clienteEstoqueService — que le o LIVRO de movimentacoes, nao a tabela aposentada. O que
    // esta task defende, portanto, mudou: nao e mais "a chave sumiu", e "a chave nao serve mais
    // dados da ilha". Sem cliente_id o relatorio recusa (400): posicao de todos os clientes de
    // uma vez nao e relatorio, e lista (GET /materiais-cliente/clientes).
    const semCliente = await request(app).get(`${RELATORIOS}/materiais-cliente`);
    assert.strictEqual(semCliente.status, 400,
      `${RELATORIOS}/materiais-cliente respondeu ${semCliente.status} — esperado 400 por falta de cliente_id`);

    // A prova de que a ilha nao alimenta mais nada: uma linha gravada NA TABELA APOSENTADA nao
    // pode aparecer na resposta. Sem isto, "a chave existe" nao distinguiria o servico novo do
    // antigo ressuscitado.
    // `projetos`/`ordens_servico` sao tabelas CORE (server/index.js no boot), fora do initSchema
    // do almoxarifado — mesmo precedente de materialClienteGuardaSaida/Posicao. A posicao por
    // cliente faz LEFT JOIN nas duas para dizer ONDE a chapa foi aplicada.
    await dbRun(db, `CREATE TABLE IF NOT EXISTS projetos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)`);
    await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
      id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT, cliente_id INTEGER,
      projeto_id INTEGER, status TEXT)`);
    const cli = await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente da Ilha LTDA']);
    await dbRun(db, `INSERT INTO materiais_cliente_almoxarifado
      (cliente_id, descricao, quantidade_recebida, quantidade_saldo)
      VALUES (?, 'CHAPA FANTASMA DA ILHA', 99, 99)`, [cli.lastID]);
    const res = await request(app).get(`${RELATORIOS}/materiais-cliente?cliente_id=${cli.lastID}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(!JSON.stringify(res.body).includes('CHAPA FANTASMA DA ILHA'),
      'o relatorio voltou a servir dados de materiais_cliente_almoxarifado — a ilha ressuscitou');
    assert.deepStrictEqual(res.body.itens, [],
      'sem material com dono cadastrado a posicao tem de vir vazia, nao com o conteudo da ilha');
  });

  await test('o clientMaterialService.js foi removido do disco', async () => {
    const p = path.join(__dirname, '..', '..', 'services', 'almoxarifado', 'clientMaterialService.js');
    assert.ok(!fs.existsSync(p), 'clientMaterialService.js ainda existe — o caminho paralelo continua importavel');
    // Controle do proprio caminho: se o path estivesse errado, existsSync daria false para
    // qualquer coisa e o assert acima passaria sem provar nada. Um vizinho que EXISTE ancora.
    const vizinho = path.join(__dirname, '..', '..', 'services', 'almoxarifado', 'stockService.js');
    assert.ok(fs.existsSync(vizinho),
      'CONTROLE POSITIVO: nem stockService.js foi encontrado neste diretorio — o caminho do assert '
      + 'acima esta errado, e o "arquivo nao existe" nao prova remocao nenhuma');
  });

  await test('a TABELA materiais_cliente_almoxarifado continua existindo (aposentada, nao apagada)', async () => {
    const t = await dbAll(db,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'materiais_cliente_almoxarifado'");
    assert.strictEqual(t.length, 1,
      'a tabela sumiu — a decisao 4 e aposentar, nao apagar: a medicao de 0 linhas nao cobriu producao');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
