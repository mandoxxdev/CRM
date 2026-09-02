const assert = require('assert');
const { dbGet } = require('../../services/almoxarifado/db');

/**
 * O invariante da Etapa 8: nenhuma leitura de estoque PROPRIO enxerga material de cliente.
 *
 * A falha que este helper caca e SILENCIOSA — nada quebra, o numero so fica errado (reposicao de
 * minimo, sugestao de compra, valor total do estoque, posicao). Por isso as duas asserces andam
 * SEMPRE juntas, e o helper as impoe: so provar a ausencia do material de cliente deixaria passar
 * um filtro escrito errado que nao devolve NADA (`= NULL` em vez de `IS NULL`, que nunca casa em
 * SQL) — ele "segregaria" perfeitamente por estar vazio. O controle positivo e o que separa
 * "filtrou certo" de "quebrou a leitura", e nao e hipotese: ao executar a Task 1 a sabotagem do
 * valorTotalEstoque para `= NULL` zerou o total, e quem pegou foi esta metade.
 *
 * `rows` e o array devolvido pela leitura; `idOf` extrai o id do material de cada linha
 * (default `r.id`, mas resultados agregados podem usar `material_id`).
 */
function assertSegregado(rows, { materialClienteId, materialProprioId, contexto, idOf = (r) => r.id }) {
  const ids = (rows || []).map(idOf).map(Number);
  assert.ok(!ids.includes(Number(materialClienteId)),
    `[${contexto}] material de cliente (id ${materialClienteId}) vazou para leitura de estoque proprio`);
  assert.ok(ids.includes(Number(materialProprioId)),
    `[${contexto}] CONTROLE POSITIVO FALHOU: o material proprio equivalente (id ${materialProprioId}) `
    + 'tambem sumiu — o filtro nao esta segregando, esta zerando a leitura');
}

/** Material de cliente tem dono; material nosso tem NULL. Guarda contra "0 = nosso". */
async function assertDono(db, materialId, clienteIdEsperado) {
  const m = await dbGet(db, 'SELECT proprietario_cliente_id FROM materiais_almoxarifado WHERE id = ?', [materialId]);
  assert.strictEqual(m.proprietario_cliente_id, clienteIdEsperado,
    `dono errado no material ${materialId}: esperado ${clienteIdEsperado}, veio ${m.proprietario_cliente_id}`);
}

module.exports = { assertSegregado, assertDono };
