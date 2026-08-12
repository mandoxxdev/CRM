/**
 * Posicao de estoque POR CLIENTE (Etapa 8, Task 8).
 *
 * Os numeros saem do LIVRO DE MOVIMENTACOES (movimentacoes_almoxarifado), nao de colunas
 * acumuladoras. A ilha aposentada tinha quantidade_recebida/quantidade_consumida/quantidade_saldo
 * como colunas que so ela atualizava — coluna acumuladora que diverge em silencio ja custou caro
 * neste projeto mais de uma vez. Aqui, recebido/consumido/devolvido sao SOMAS do livro, e `saldo`
 * vem da linha do material (quantidade_atual), que e a fonte de verdade do motor; `saldo_disponivel`
 * repete a conta de stockService.getSaldoDisponivel (atual - reservada - bloqueada - em_inspecao).
 *
 * `cancelado = 0` em toda soma: a linha cancelada continua no livro (e imutavel), mas nao pode
 * contar como consumo — senao o cliente ve baixa que foi estornada.
 */
const { dbAll, dbGet } = require('./db');
const { disponivelSql } = require('./availabilitySql');

// Espelham os `tiposEntrada`/`tiposSaida` do motor (stockService, duas declaracoes) mais os tipos
// legados de banco antigo. DEVOLUCAO_CLIENTE fica FORA de TIPOS_CONSUMO de proposito: sai do
// saldo, mas nao foi consumido na fabrica — o cliente precisa ver as duas colunas separadas para
// conferir a remessa dele ("quanto virou peca" x "quanto voltou pra mim").
const TIPOS_ENTRADA = ['ENTRADA', 'ENTRADA_COMPRA', 'ENTRADA_MANUAL', 'ENTRADA_DEVOLUCAO', 'DEVOLUCAO', 'AJUSTE_POSITIVO'];
const TIPOS_CONSUMO = ['SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'SUCATA', 'PERDA', 'AJUSTE_NEGATIVO'];

const listaSql = (arr) => arr.map(() => '?').join(',');

/** Clientes que TEM material cadastrado no almoxarifado. Cliente sem material nao aparece. */
async function listarClientesComMaterial(db) {
  return dbAll(db, `
    SELECT c.id AS cliente_id, c.razao_social AS cliente_nome,
           COUNT(m.id) AS materiais,
           COALESCE(SUM(m.quantidade_atual), 0) AS saldo_total
      FROM materiais_almoxarifado m
      JOIN clientes c ON c.id = m.proprietario_cliente_id
     WHERE m.proprietario_cliente_id IS NOT NULL AND m.ativo = 1
     GROUP BY c.id, c.razao_social
     ORDER BY c.razao_social`);
}

async function posicaoPorCliente(db, { cliente_id } = {}) {
  if (!cliente_id) {
    throw Object.assign(new Error('informe o cliente_id'), { status: 400 });
  }
  const cliente = await dbGet(db, 'SELECT id, razao_social, nome_fantasia FROM clientes WHERE id = ?', [cliente_id]);
  if (!cliente) throw Object.assign(new Error('Cliente nao encontrado'), { status: 404 });

  const itens = await dbAll(db, `
    SELECT m.id AS material_id, m.codigo, m.nome, m.unidade,
           m.quantidade_atual AS saldo,
           ${disponivelSql('m')} AS saldo_disponivel,
           COALESCE((SELECT SUM(mv.quantidade) FROM movimentacoes_almoxarifado mv
                      WHERE mv.material_id = m.id AND COALESCE(mv.cancelado, 0) = 0
                        AND mv.tipo IN (${listaSql(TIPOS_ENTRADA)})), 0) AS recebido,
           COALESCE((SELECT SUM(mv.quantidade) FROM movimentacoes_almoxarifado mv
                      WHERE mv.material_id = m.id AND COALESCE(mv.cancelado, 0) = 0
                        AND mv.tipo IN (${listaSql(TIPOS_CONSUMO)})), 0) AS consumido,
           COALESCE((SELECT SUM(mv.quantidade) FROM movimentacoes_almoxarifado mv
                      WHERE mv.material_id = m.id AND COALESCE(mv.cancelado, 0) = 0
                        AND mv.tipo = 'DEVOLUCAO_CLIENTE'), 0) AS devolvido
      FROM materiais_almoxarifado m
     WHERE m.proprietario_cliente_id = ? AND m.ativo = 1
     ORDER BY m.codigo`,
  [...TIPOS_ENTRADA, ...TIPOS_CONSUMO, cliente_id]);

  // Onde cada material foi aplicado. Sem os_id nem projeto_id a linha nao entra: a guarda do dono
  // (Task 3) impede saida de material de cliente sem um dos dois, entao consumo sem vinculo aqui
  // so pode ser lancamento anterior a esta etapa — e mostra-lo como "aplicado em nada" mentiria.
  const aplicacoes = await dbAll(db, `
    SELECT mv.material_id, m.codigo, m.nome,
           mv.os_id, os.numero_os, mv.projeto_id, p.nome AS projeto_nome,
           SUM(mv.quantidade) AS quantidade
      FROM movimentacoes_almoxarifado mv
      JOIN materiais_almoxarifado m ON m.id = mv.material_id
      LEFT JOIN ordens_servico os ON os.id = mv.os_id
      LEFT JOIN projetos p ON p.id = mv.projeto_id
     WHERE m.proprietario_cliente_id = ? AND COALESCE(mv.cancelado, 0) = 0
       AND mv.tipo IN (${listaSql(TIPOS_CONSUMO)})
       AND (mv.os_id IS NOT NULL OR mv.projeto_id IS NOT NULL)
     GROUP BY mv.material_id, mv.os_id, mv.projeto_id
     ORDER BY m.codigo, os.numero_os, p.nome`,
  [cliente_id, ...TIPOS_CONSUMO]);

  return { cliente, itens, aplicacoes };
}

module.exports = { listarClientesComMaterial, posicaoPorCliente, TIPOS_ENTRADA, TIPOS_CONSUMO };
