/**
 * Etapa 205 (C464, 1a parte; B1368-B1371) — o saldo de LOTE IMPEDIDO de um material: o que esta na prateleira em lote que nao pode
 * sair (BLOQUEADO, REPROVADO, ou vencido sem a liberacao do vencimento) e que o `disponivelSql` ainda conta como livre. A aprovacao e a
 * separacao (as quatro leituras: `saldoDisponivelParaItem`, `calcularStatusPosAprovacao`, a fila e o detalhe) SUBTRAEM este fragmento
 * do `disponivelSql(...)` — nunca o substituem: as telas de saldo, o motor e a entrega continuam lendo o disponivel de sempre (C481,
 * item 7).
 *
 * A regua do impedido e o contrario de `elegivel` de `lotService.listarLotesDoMaterial` (status 'ATIVO' e, se vencido, com
 * `vencimento_liberado_em`), com o vencido de `lotService.isVencido` (validade nao vazia, `substr(...,1,10) < hoje` de Brasilia —
 * Fase 2 M2: vazio nao vence). Divergencia declarada do contrato: a liberacao tambem por `COALESCE(...,'') = ''` (o JS testa a
 * verdade do campo: '' nao libera), nao `IS NULL`.
 *
 * A conta (B1370 + Fase 2 I1/I2), so em material com `controle_lote = 1` (B1371):
 *   max(0, SOMA_{lotes impedidos} max(0, saldo do lote - em inspecao no lote)
 *          - bloqueada - em terceiros - max(0, em inspecao do material - em inspecao de itens de recebimento com lote do material))
 * O "Sem lote atribuido" negativo (o que a entrega deixa ao sair de lote impedido, RN-205.10) NAO abate o impedido. A Fase 5 P1 (B1379)
 * abatia e foi desfeita no 2o fix-round: o negativo e anonimo (nao diz de qual lote saiu) — com L1 ATIVO 10, sem lote -6 e L2 BLOQUEADO 6
 * ele abatia o L2 e deixava sair 10 (as 6 bloqueadas, com o livro dizendo L1). Sem abater, o pior caso e o liberado menor que o real
 * (recusa segura) ate um ajuste; a causa (a entrega sair de lote impedido) e o item 7 da fila (C464, 2a parte).
 * O que ja esta retido no material (bloqueada, terceiros, a inspecao que nenhum recebimento explica) ja sai do `disponivelSql` e nao sabe
 * o lote: a conta assume que esta DENTRO do lote impedido — nunca desconta duas vezes (Achado 2); no pior caso desconta menos do que o
 * certo (igual a hoje). Arredondado a 1e-6 (`Q.qtdSql`).
 * Etapa 217 (B1438) — a parte da bloqueada e dos terceiros que SABE o lote (quarentena pelo livro, reprovacao pela inspecao, terceiros
 * pelo item da remessa: `retidoDoLote.js`) sai do lote dela; so o RESTO fica suposto dentro do lote impedido:
 *   max(0, SOMA_{lotes impedidos} max(0, fisico livre do lote - retido do lote)
 *          - max(0, bloqueada + em terceiros - SOMA_{todos os lotes} retido) - em inspecao sem recebimento)
 * Sem retido por lote e a conta acima; com a peca bloqueada num lote bom, o desconto sobe ate o certo.
 *
 * "Hoje" e embutido como literal VALIDADA (B1376): as quatro consultas tem arrays de `?` diferentes. Sem `require` do app alem de
 * `quantidade` e `diaLocal` (requisitionStateMachine o importa: sem ciclo).
 */
const Q = require('./quantidade');
const diaLocal = require('../diaLocal');
const { lotesComRetidoSql } = require('./retidoDoLote'); // Etapa 217 (B1438): sem ciclo

const MSG_HOJE_INVALIDO = 'loteImpedidoSql: hoje inválido';
const RE_HOJE = /^\d{4}-\d{2}-\d{2}$/;

function hojeValidado(hojeISO) {
  if (typeof hojeISO !== 'string' || !RE_HOJE.test(hojeISO)) throw new Error(MSG_HOJE_INVALIDO);
  return hojeISO;
}

/** O lote (apelido `l`) nao pode sair: o contrario de `elegivel`. */
function predicadoLoteImpedidoSql(l, hojeISO = diaLocal.hojeLocalISO()) {
  const hoje = hojeValidado(hojeISO);
  return `(COALESCE(${l}.status,'') <> 'ATIVO' OR (COALESCE(${l}.data_validade,'') <> ''`
    + ` AND substr(${l}.data_validade,1,10) < '${hoje}' AND COALESCE(${l}.vencimento_liberado_em,'') = ''))`;
}

/** O desconto do material (apelido `m`), ja entre parenteses. */
function loteImpedidoSql(m, hojeISO = diaLocal.hojeLocalISO()) {
  const hoje = hojeValidado(hojeISO);
  // Etapa 217 (B1438): de cada lote impedido sai tambem o retido NELE (quarentena, reprovacao, terceiros — `retidoDoLote.js`); do
  // material sai so o RESTO (bloqueada + em terceiros − Σ retido de todos os lotes), o que nao se sabe em que lote esta. Sem retido por
  // lote e a conta da 205 (com bloqueada + terceiros >= 0); com a peca bloqueada num lote BOM, o desconto sobe ate o certo (fim do
  // preco da B1370, D (206)). Uma passada so pelos lotes (`lotesComRetidoSql`, com a coluna `imp`).
  const lotes = lotesComRetidoSql(m, (l) => `(${predicadoLoteImpedidoSql(l, hoje)}) AS imp`);
  const inspecaoSemRecebimento = `MAX(0, COALESCE(${m}.quantidade_em_inspecao,0) - COALESCE((SELECT SUM(lim_ri2.quantidade_em_inspecao)
      FROM recebimentos_material_itens_almoxarifado lim_ri2 JOIN lotes_almoxarifado lim_l2 ON lim_l2.id = lim_ri2.lote_id
      WHERE lim_l2.material_id = ${m}.id AND COALESCE(lim_ri2.quantidade_em_inspecao,0) > 0), 0))`;
  const conta = `COALESCE((SELECT MAX(0, COALESCE(SUM(CASE WHEN lim_r.imp THEN MAX(0, lim_r.fis - lim_r.ret) ELSE 0 END), 0)
      - MAX(0, COALESCE(${m}.quantidade_bloqueada,0) + COALESCE(${m}.quantidade_em_terceiros,0) - COALESCE(SUM(lim_r.ret), 0))
      - ${inspecaoSemRecebimento}) FROM ${lotes} lim_r), 0)`;
  return `(CASE WHEN COALESCE(${m}.controle_lote,0) = 1 THEN ${Q.qtdSql(conta)} ELSE 0 END)`;
}

/** A 2a frase da recusa da separacao (RN-205.08 b; Fase 2 I3: `n` e o que o lote CORTOU do teto). */
function fraseLoteImpedido(n, unidade) {
  return `Não entram ${Q.qtd(Number(n))}${unidade ? ` ${unidade}` : ''} em lote bloqueado, reprovado ou vencido.`;
}

module.exports = { predicadoLoteImpedidoSql, loteImpedidoSql, fraseLoteImpedido, MSG_HOJE_INVALIDO };
