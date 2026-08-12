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
const { dbAll } = require('../../services/almoxarifado/db');

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

  await test('o relatorio materiais-cliente da ilha saiu do mapa (e o dispatcher continua de pe)', async () => {
    // Mesmo par: o positivo primeiro, senao um dispatcher quebrado passaria como "chave removida".
    const vivo = await request(app).get(`${RELATORIOS}/estoque-atual`);
    assert.strictEqual(vivo.status, 200,
      `CONTROLE POSITIVO: ${RELATORIOS}/estoque-atual respondeu ${vivo.status} — o dispatcher de `
      + 'relatorios quebrou, o 404 abaixo nao prova nada');
    const ilha = await request(app).get(`${RELATORIOS}/materiais-cliente`);
    assert.strictEqual(ilha.status, 404,
      `${RELATORIOS}/materiais-cliente ainda responde ${ilha.status} — a chave da ilha continua no mapa`);
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
