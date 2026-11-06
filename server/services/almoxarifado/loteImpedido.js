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
 * O que ja esta retido no material (bloqueada, terceiros, a inspecao que nenhum recebimento explica) ja sai do `disponivelSql` e nao sabe
 * o lote: a conta assume que esta DENTRO do lote impedido — nunca desconta duas vezes (Achado 2); no pior caso desconta menos do que o
 * certo (igual a hoje). Arredondado a 1e-6 (`Q.qtdSql`).
 *
 * "Hoje" e embutido como literal VALIDADA (B1376): as quatro consultas tem arrays de `?` diferentes. Sem `require` do app alem de
 * `quantidade` e `diaLocal` (requisitionStateMachine o importa: sem ciclo).
 */
const Q = require('./quantidade');
const diaLocal = require('../diaLocal');

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
  const pred = predicadoLoteImpedidoSql('lim_l', hojeValidado(hojeISO));
  const soma = `COALESCE((SELECT SUM(MAX(0,
      COALESCE((SELECT SUM(lim_s.quantidade) FROM estoque_saldo_almoxarifado lim_s WHERE lim_s.lote_id = lim_l.id), 0)
      - COALESCE((SELECT SUM(lim_ri.quantidade_em_inspecao) FROM recebimentos_material_itens_almoxarifado lim_ri
                  WHERE lim_ri.lote_id = lim_l.id AND COALESCE(lim_ri.quantidade_em_inspecao,0) > 0), 0)))
    FROM lotes_almoxarifado lim_l WHERE lim_l.material_id = ${m}.id AND ${pred}), 0)`;
  const inspecaoSemRecebimento = `MAX(0, COALESCE(${m}.quantidade_em_inspecao,0) - COALESCE((SELECT SUM(lim_ri2.quantidade_em_inspecao)
      FROM recebimentos_material_itens_almoxarifado lim_ri2 JOIN lotes_almoxarifado lim_l2 ON lim_l2.id = lim_ri2.lote_id
      WHERE lim_l2.material_id = ${m}.id AND COALESCE(lim_ri2.quantidade_em_inspecao,0) > 0), 0))`;
  const conta = `MAX(0, ${soma} - COALESCE(${m}.quantidade_bloqueada,0) - COALESCE(${m}.quantidade_em_terceiros,0)`
    + ` - ${inspecaoSemRecebimento})`;
  return `(CASE WHEN COALESCE(${m}.controle_lote,0) = 1 THEN ${Q.qtdSql(conta)} ELSE 0 END)`;
}

/** A 2a frase da recusa da separacao (RN-205.08 b; Fase 2 I3: `n` e o que o lote CORTOU do teto). */
function fraseLoteImpedido(n, unidade) {
  return `Não entram ${Q.qtd(Number(n))}${unidade ? ` ${unidade}` : ''} em lote bloqueado, reprovado ou vencido.`;
}

module.exports = { predicadoLoteImpedidoSql, loteImpedidoSql, fraseLoteImpedido, MSG_HOJE_INVALIDO };
