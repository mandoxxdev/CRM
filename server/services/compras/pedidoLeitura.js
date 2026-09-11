/**
 * Leitura completa do pedido de compra — implementador ÚNICO (Etapa 32).
 *
 * Dois consumidores, em módulos diferentes:
 *   1. `routes/compras/pedidos.js`      → GET /api/compras/pedidos/:id (o comprador)
 *   2. `routes/almoxarifado/extended.js` → recebimentos-aux/pedidos-compra/:id (o almoxarife,
 *      que NÃO tem o módulo compras e tomaria 403 na rota acima)
 *
 * Os dois leem o MESMO pedido. Duas implementações divergiriam — e a divergência aqui
 * apareceria como "o comprador vê um total e quem recebe vê outro".
 */

const { dbGet, dbAll } = require('./db');
const { calcularTotaisPedido } = require('./pedidoTotais');

// Aliases com prefixo `forn_` de propósito: `f.razao_social as fornecedor_nome` colidiria
// com as colunas `snap_fornecedor_*` que vêm em `p.*` (RN-06).
const SQL_PEDIDO = `
  SELECT p.*,
         f.razao_social       AS forn_razao_social,
         f.cnpj               AS forn_cnpj,
         f.inscricao_estadual AS forn_ie,
         f.endereco           AS forn_endereco,
         f.cidade             AS forn_cidade,
         f.estado             AS forn_estado,
         f.cep                AS forn_cep,
         f.telefone           AS forn_telefone,
         f.celular            AS forn_celular,
         f.email              AS forn_email
    FROM pedidos_compra p
    LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
   WHERE p.id = ?`;

const SQL_ITENS = `
  SELECT i.id, i.material_id, i.codigo, i.descricao, i.observacao, i.ncm, i.peso_unitario,
         i.data_entrega, i.quantidade, i.unidade, i.valor_unitario, i.ipi_percentual,
         i.item_numero,
         m.codigo AS material_codigo,
         m.nome   AS material_nome
    FROM itens_pedido_compra i
    LEFT JOIN materiais_almoxarifado m ON m.id = i.material_id
   WHERE i.pedido_id = ?
   ORDER BY i.item_numero, i.id`;

/**
 * RN-06 — o snapshot vence; ausente (pedido anterior à Etapa 32) cai no cadastro vivo.
 * Resolvido AQUI e não em cada tela: quem consome recebe o bloco pronto e não decide nada.
 */
function montarFornecedor(pedido) {
  const temSnapshot = !!(pedido.snap_fornecedor_nome || pedido.snap_fornecedor_cnpj);
  if (temSnapshot) {
    return {
      id: pedido.fornecedor_id,
      nome: pedido.snap_fornecedor_nome,
      cnpj: pedido.snap_fornecedor_cnpj,
      inscricao_estadual: pedido.snap_fornecedor_ie,
      endereco: pedido.snap_fornecedor_endereco,
      municipio: pedido.snap_fornecedor_municipio,
      uf: pedido.snap_fornecedor_uf,
      cep: pedido.snap_fornecedor_cep,
      telefone: pedido.snap_fornecedor_telefone,
      celular: pedido.forn_celular || null,
      email: pedido.snap_fornecedor_email,
      origem: 'snapshot',
    };
  }
  return {
    id: pedido.fornecedor_id,
    nome: pedido.forn_razao_social || null,
    cnpj: pedido.forn_cnpj || null,
    inscricao_estadual: pedido.forn_ie || null,
    endereco: pedido.forn_endereco || null,
    municipio: pedido.forn_cidade || null,
    uf: pedido.forn_estado || null,
    cep: pedido.forn_cep || null,
    telefone: pedido.forn_telefone || null,
    celular: pedido.forn_celular || null,
    email: pedido.forn_email || null,
    origem: 'cadastro',
  };
}

const normalizarStatus = (s) => String(s || '').trim().toLowerCase();

/**
 * @returns {Promise<object|null>} cabeçalho + fornecedor resolvido + itens com derivados + totais
 */
async function carregarPedido(db, id) {
  const pedido = await dbGet(db, SQL_PEDIDO, [id]);
  if (!pedido) return null;

  const itens = await dbAll(db, SQL_ITENS, [id]);

  const { itens: itensCalc, totais } = calcularTotaisPedido(itens, {
    total_icms_st: pedido.total_icms_st,
    valor_frete: pedido.valor_frete,
    total_desconto: pedido.total_desconto,
  });

  // Não vaza as colunas cruas de JOIN nem de snapshot: quem lê usa o bloco `fornecedor`.
  const limpo = {};
  Object.keys(pedido).forEach((k) => {
    if (!k.startsWith('forn_') && !k.startsWith('snap_fornecedor_')) limpo[k] = pedido[k];
  });

  return {
    ...limpo,
    status: normalizarStatus(limpo.status),
    fornecedor: montarFornecedor(pedido),
    itens: itensCalc,
    totais,
  };
}

module.exports = { carregarPedido, montarFornecedor, SQL_PEDIDO };
