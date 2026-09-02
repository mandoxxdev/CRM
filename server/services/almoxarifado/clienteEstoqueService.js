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
const movementTypes = require('./movementTypes');

/**
 * ── ISTO ERA UM ESPELHO COPIADO, E O ESPELHO FICOU PARA TRAS DUAS VEZES (corrigido na 8c) ──
 *
 * Estas listas eram literais escritos a mao, "espelhando" os `tiposEntrada`/`tiposSaida` do motor.
 * O espelho nao acompanhou o motor:
 *   - a 8b criou PERDA_TERCEIRO/CONSUMO_TERCEIRO e nao os acrescentou aqui;
 *   - a 8c (Task 4) criou RETORNO_TRANSFORMACAO e tambem nao.
 *
 * O resultado nao era erro, era MENTIRA ARITMETICA na tela do cliente: a peca creditada por
 * transformacao aparecia com SALDO e `recebido = 0`, e a chapa consumida no terceiro sumia do saldo
 * sem aparecer em `consumido`. A conta que o cliente faz de cabeca — recebido - consumido -
 * devolvido = saldo — nao fechava, e nao havia coluna nenhuma onde procurar a diferenca.
 *
 * Agora DERIVAM de `movementTypes`, que e a fonte do motor. Nao volte a escrever a lista aqui.
 *
 * ── A UNICA subtracao, e por que ela e legitima ──
 *
 * `DEVOLUCAO_CLIENTE` fica FORA de TIPOS_CONSUMO — nao porque nao conte, mas porque tem coluna
 * PROPRIA (`devolvido`). O cliente precisa separar "quanto virou peca" de "quanto voltou pra mim"
 * para conferir a remessa dele. Foi esse o criterio aplicado a PERDA_TERCEIRO/CONSUMO_TERCEIRO na
 * 8c, e ele os coloca DENTRO: eles nao tem coluna propria, entao deixa-los de fora nao os separa —
 * os torna invisiveis, com o saldo caindo sem contrapartida em lugar nenhum da tela. Perda no
 * galvanizador e material que o cliente nao recebe de volta: ele tem de ver isso.
 */
const TIPOS_ENTRADA = movementTypes.TIPOS_ENTRADA;
const TIPOS_CONSUMO = movementTypes.TIPOS_SAIDA.filter((t) => t !== 'DEVOLUCAO_CLIENTE');

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
