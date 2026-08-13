/**
 * Quais tipos de movimentacao SOMAM e quais SUBTRAEM saldo — em UM lugar so.
 *
 * ── O defeito que criou este arquivo (Etapa 8c, achado por execucao) ─────────────────────────
 *
 * Estas duas listas viviam replicadas em QUATRO lugares: duas vezes dentro do stockService
 * (`registrarMovimentacao` e `cancelarMovimentacao`, que precisam concordar ou o motor fica
 * assimetrico) e uma terceira, com nome proprio, em `clienteEstoqueService` — a posicao de estoque
 * POR CLIENTE, que soma o LIVRO para dizer ao cliente quanto entrou e quanto saiu do material dele.
 *
 * O terceiro espelho ficou para tras duas vezes seguidas, sempre do mesmo jeito e sempre sem
 * quebrar teste nenhum:
 *   - a 8b criou PERDA_TERCEIRO/CONSUMO_TERCEIRO e nao os acrescentou la;
 *   - a 8c (Task 4) criou RETORNO_TRANSFORMACAO e tambem nao.
 *
 * O sintoma nao e erro, e MENTIRA ARITMETICA: a peca de cliente creditada por transformacao
 * aparecia com **saldo mas `recebido = 0`**, e a chapa consumida no terceiro sumia do saldo sem
 * aparecer em `consumido`. A conta que o cliente faz de cabeca — recebido - consumido - devolvido =
 * saldo — nao fechava, e nao havia coluna nenhuma onde procurar a diferenca.
 *
 * Uma lista replicada nao da erro quando diverge: ela da um numero errado em silencio. Mesmo
 * raciocinio (e mesmo desenho) de `availabilitySql.js` e `custoSql.js`. Precedente adicional: o
 * proprio `ownerRules.js` ja avisava, em comentario, que "tiposSaida e declarado em DOIS lugares no
 * stockService... quem acrescentar um tipo de saida la precisa mexer nas duas". O aviso estava
 * certo e nao bastou — aviso nao e mecanismo.
 *
 * REGRA: quem criar um tipo de movimentacao novo acrescenta AQUI, e so aqui.
 * `tests/api/clientePosicaoTipos.api.test.js` prova que a posicao por cliente deriva destas listas
 * e que a equacao do cliente fecha para TODO tipo delas — entao um tipo novo esquecido em algum
 * consumidor cai em teste, em vez de virar um numero errado numa tela de cliente.
 */

/**
 * Tipos que CREDITAM `quantidade_atual`.
 *
 * `DEVOLUCAO` e `ENTRADA` sao legados de banco antigo e continuam aqui: o livro e imutavel e ainda
 * tem linhas com esses tipos. `RETORNO_TRANSFORMACAO` (Etapa 8c) credita a peca que voltou do
 * terceiro — a chapa que a originou ja foi baixada por `CONSUMO_TERCEIRO`, entao os dois aparecem
 * no mesmo evento, em materiais diferentes.
 */
const TIPOS_ENTRADA = ['ENTRADA', 'ENTRADA_COMPRA', 'ENTRADA_MANUAL', 'ENTRADA_DEVOLUCAO',
  'DEVOLUCAO', 'AJUSTE_POSITIVO', 'RETORNO_TRANSFORMACAO'];

/**
 * Tipos que DEBITAM `quantidade_atual`.
 *
 * `DEVOLUCAO_CLIENTE` (Etapa 8) e saida de verdade: o material sai do predio de volta para o dono.
 * NAO CONFUNDIR com `ENTRADA_DEVOLUCAO` (Etapa 7), onde o material VOLTA para o estoque —
 * direcoes opostas, nomes parecidos. `PERDA_TERCEIRO`/`CONSUMO_TERCEIRO` (Etapa 8b) tambem sao
 * saida de verdade; o que os diferencia e que a quantidade que eles baixam esta RETIDA em
 * `quantidade_em_terceiros`, nao disponivel.
 */
const TIPOS_SAIDA = ['SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA',
  'AJUSTE_NEGATIVO', 'SUCATA', 'PERDA', 'DEVOLUCAO_CLIENTE', 'PERDA_TERCEIRO', 'CONSUMO_TERCEIRO'];

module.exports = { TIPOS_ENTRADA, TIPOS_SAIDA };
