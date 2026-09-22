/**
 * Etapa 40, Task 3 — a cotacao de compra (cabecalho: `cotacoes`, `server/index.js:19244-19256`).
 *
 * E o MESMO molde do pedido (`pedidoCompraService.js`): a rota nao faz SQL, o servico lanca
 * `erro(msg, status)` e a rota traduz `e.status`. `erro`, `assertFornecedor` e a literal de
 * fornecedor sao IMPORTADOS de la (Task 1), nao copiados — duas frases "Fornecedor não encontrado"
 * divergiriam na primeira edicao.
 *
 * `numero` e DIGITADO (contrato de `numeroDoc.js:44-64`; D6 do design) e `UNIQUE` na DDL. O 409 e
 * checado ANTES do INSERT/UPDATE (`SELECT id … WHERE numero = ? AND id <> ?`) E traduzido no catch
 * de `SQLITE_CONSTRAINT … cotacoes.numero`: sao duas guardas porque a corrida entre o SELECT e o
 * INSERT existe (sem transacao, como o resto desta base ate o Postgres). A segunda guarda so e
 * exercida por corrida — a sabotagem 5 da Task 3 removeu-a e nada caiu, e isso e PREVISTO.
 *
 * Nao ha itens de cotacao (zero `cotacao_itens` no sistema, medido): `valor_total` e campo de
 * entrada (D8), default 0.
 */
const { dbRun, dbGet } = require('../almoxarifado/db');
const { erro, assertFornecedor } = require('./pedidoCompraService');

const COTACAO_NAO_ENCONTRADA = 'Cotação não encontrada';
const FORNECEDOR_COM_COTACOES = 'Fornecedor possui cotações — não pode ser excluído';
const numeroDuplicado = (numero) => `Já existe uma cotação com o número ${numero}`;

const SELECT_LINHA = `SELECT c.id, c.numero, c.fornecedor_id, f.razao_social AS fornecedor_nome, c.valor_total,
  c.data_cotacao, c.validade, c.status, c.observacoes, c.created_at, c.updated_at
  FROM cotacoes c LEFT JOIN fornecedores f ON f.id = c.fornecedor_id`;

async function obterCotacao(db, id) {
  const linha = await dbGet(db, `${SELECT_LINHA} WHERE c.id = ?`, [id]);
  if (!linha) throw erro(COTACAO_NAO_ENCONTRADA, 404);
  return linha;
}

/** Normaliza o corpo JA validado pelo `CotacaoSchema` para as colunas da tabela. */
function colunas(dados) {
  return {
    numero: String(dados.numero).trim(),
    fornecedor_id: dados.fornecedor_id,
    valor_total: dados.valor_total == null ? 0 : dados.valor_total,
    data_cotacao: dados.data_cotacao || null,
    validade: dados.validade || null,
    status: dados.status || 'em_analise',
    observacoes: dados.observacoes == null ? null : dados.observacoes,
  };
}

async function assertNumeroLivre(db, numero, idAtual) {
  const outra = await dbGet(db, 'SELECT id FROM cotacoes WHERE numero = ? AND id <> ?', [numero, idAtual || 0]);
  if (outra) throw erro(numeroDuplicado(numero), 409);
}

const traduzUnique = (e, numero) => (
  /SQLITE_CONSTRAINT.*cotacoes\.numero/.test(e && e.message) ? erro(numeroDuplicado(numero), 409) : e
);

async function criarCotacao(db, dados) {
  const c = colunas(dados);
  await assertFornecedor(db, c.fornecedor_id);
  await assertNumeroLivre(db, c.numero, null);
  let r;
  try {
    r = await dbRun(db, `INSERT INTO cotacoes (numero, fornecedor_id, valor_total, data_cotacao, validade, status, observacoes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [c.numero, c.fornecedor_id, c.valor_total, c.data_cotacao, c.validade, c.status, c.observacoes]);
  } catch (e) { throw traduzUnique(e, c.numero); }
  return obterCotacao(db, r.lastID);
}

async function atualizarCotacao(db, id, dados) {
  await obterCotacao(db, id); // 404 antes de qualquer validacao de negocio
  const c = colunas(dados);
  await assertFornecedor(db, c.fornecedor_id);
  await assertNumeroLivre(db, c.numero, id);
  try {
    await dbRun(db, `UPDATE cotacoes SET numero = ?, fornecedor_id = ?, valor_total = ?, data_cotacao = ?, validade = ?,
      status = ?, observacoes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [c.numero, c.fornecedor_id, c.valor_total, c.data_cotacao, c.validade, c.status, c.observacoes, id]);
  } catch (e) { throw traduzUnique(e, c.numero); }
  return obterCotacao(db, id);
}

module.exports = {
  criarCotacao, obterCotacao, atualizarCotacao,
  COTACAO_NAO_ENCONTRADA, FORNECEDOR_COM_COTACOES, numeroDuplicado,
};
