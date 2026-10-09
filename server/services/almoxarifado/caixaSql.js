/**
 * Etapa 97 (T0, B491) — a CAIXA SEM RESERVA e o LIVRE DE CAIXA, num modulo que o motor pode ler.
 *
 * A caixa sem reserva (95, B466/B473) e o separado de uma requisicao que ainda esta na prateleira — separar nao move
 * estoque, entao o motor nao sabe dele — e que nenhuma reserva ja tira do disponivel. Ate a 97 o construtor morava em
 * `requisitionService`, e so a separacao, a aprovacao, a fila e o detalhe o liam; as portas avulsas do motor (SAIDA,
 * PERDA, AJUSTE, bloqueio, reserva manual, estorno de entrada, remessa, sucateamento, inventario) olhavam so o
 * `disponivelSql` e levavam a caixa: fisico 0 com 4 separados, e a entrega da requisicao presa em "Maximo: 0".
 *
 * Por que um modulo novo: `requisitionService` requer `stockService` — o motor nao pode ler o construtor de la
 * (ciclo). Este modulo requer so `requisitionStateMachine` (que requer `db` e `availabilitySql`), `availabilitySql`,
 * `quantidade` e `db`: NENHUM `require` de `stockService` ou `requisitionService` aqui (o teste
 * `portasAvulsasCaixa` carrega os dois em ordens diferentes num processo novo e cobra o silencio do Node).
 *
 * O `disponivelSql` NAO muda (B491): a caixa dentro dele mudaria os 15 leitores juntos, e a separacao e a aprovacao da
 * 95 a descontariam duas vezes (`tetoSeparacao`, B469). O livre de caixa e uma regua a MAIS, so para as portas avulsas.
 */
const { dbAll } = require('./db');
const { disponivelSql } = require('./availabilitySql');
const Q = require('./quantidade');
const { STATUS_COM_CAIXA } = require('./requisitionStateMachine');

/**
 * Etapa 95 (T0, B466/B473) — a CAIXA SEM RESERVA de um material: soma, pelos itens de requisicao ATIVA num status de
 * STATUS_COM_CAIXA, de `max(0, separado - entregue - reserva ATIVA de origem REQUISICAO do item)`. E o separado que
 * ainda esta na prateleira (o motor nao sabe dele: separar nao move estoque) e que nenhuma reserva ja tira do
 * disponivel — retido para quem separou. A reserva do item e a MESMA conta do RESERVADO_PARA_ITEM_SQL (mesmos
 * filtros), so que sobre `ix`. Um construtor so: a separacao, a aprovacao, a fila e o detalhe leem daqui.
 * `materialExpr` e uma expressao SQL do material (`ma.id`, `ir.material_id`); `exclusao` e um `AND ix...` que tira
 * os itens que quem chama conta por conta propria (os da propria requisicao, ou o proprio item). Nao subtrai nada do
 * disponivel (a regra de availabilitySql.js): devolve uma parcela que quem chama passa a `tetoSeparacao`.
 * Etapa 97 (T0): MOVIDO de requisitionService.js, texto identico; `requisitionService.caixaSemReservaSql` re-exporta.
 */
function caixaSemReservaSql(materialExpr, exclusao = '') {
  const status = STATUS_COM_CAIXA.map((s) => `'${s}'`).join(',');
  return `COALESCE((SELECT SUM(MAX(COALESCE(ix.quantidade_separada,0) - COALESCE(ix.quantidade_entregue, ix.quantidade_atendida, 0)
      - COALESCE((SELECT SUM(rx.quantidade - COALESCE(rx.quantidade_utilizada,0)) FROM reservas_material_almoxarifado rx
          WHERE rx.item_requisicao_id = ix.id AND rx.material_id = ix.material_id
            AND rx.status = 'ATIVA' AND rx.origem = 'REQUISICAO'), 0), 0))
    FROM itens_requisicao_almoxarifado ix JOIN requisicoes_almoxarifado rq ON rq.id = ix.requisicao_id
    WHERE ix.material_id = ${materialExpr} AND COALESCE(rq.ativo, 1) = 1 AND rq.status IN (${status}) ${exclusao}), 0)`;
}

/**
 * Etapa 97 (T0, B491) — o LIVRE DE CAIXA: disponivel do motor - caixa sem reserva do material, arredondado (1e-6).
 * Entre parenteses, como o `disponivelSql` (vai direto num `>= ?` ou num `AS x`). Sem alias, para o `UPDATE` de
 * tabela unica: a subconsulta correlaciona por `materiais_almoxarifado.id` (medido no controle da s4 da Fase 0).
 * Pode ser negativo (legado: caixa maior que o disponivel) — quem mostra o numero usa `max(0, …)`.
 */
function livreDeCaixaSql(alias = '') {
  return Q.qtdSql(`${disponivelSql(alias)} - ${caixaSemReservaSql(alias ? `${alias}.id` : 'materiais_almoxarifado.id')}`);
}

/**
 * Etapa 97 (T0, B493) — a caixa sem reserva do material e as requisicoes que a seguram, por id da requisicao (so as
 * com caixa > 1e-9). Para a literal (`sufixoCaixa`) e para a guarda do ajuste (`motivoRecusaAjustePorRetencao`).
 * A conta por requisicao e o MESMO construtor, filtrado pela requisicao — nao ha segunda formula.
 * @returns {Promise<{ caixa: number, requisicoes: string[] }>}
 */
async function lerCaixa(db, materialId) {
  const linhas = await dbAll(db, `SELECT r.id, r.numero, ${caixaSemReservaSql('?', 'AND ix.requisicao_id = r.id')} AS caixa
    FROM requisicoes_almoxarifado r
    WHERE r.id IN (SELECT requisicao_id FROM itens_requisicao_almoxarifado WHERE material_id = ?)
    ORDER BY r.id`, [materialId, materialId]);
  const comCaixa = linhas.filter((l) => Number(l.caixa) > Q.QTD_FOLGA);
  return {
    caixa: Q.qtd(comCaixa.reduce((s, l) => s + Number(l.caixa), 0)),
    requisicoes: comCaixa.map((l) => l.numero || `#${l.id}`),
  };
}

/**
 * Etapa 97 (T0, B493) — o sufixo da recusa quando ha caixa: diz quanto esta separado, para quem, e as duas saidas
 * legitimas de hoje (s3 da Fase 0: entregar o que existe e encerrar, ou o administrador excluir). Sem caixa devolve
 * `''` — a recusa fica byte a byte a de hoje (RN-04). Ate tres numeros de requisicao; depois, "e mais N".
 */
function sufixoCaixa({ caixa, requisicoes } = {}, unidade) {
  if (!(Number(caixa) > Q.QTD_FOLGA)) return '';
  const r = requisicoes || [];
  let lista;
  if (r.length === 0) lista = 'requisições em separação';
  else if (r.length === 1) lista = `a requisição ${r[0]}`;
  else if (r.length <= 3) lista = `as requisições ${r.slice(0, -1).join(', ')} e ${r[r.length - 1]}`;
  else lista = `as requisições ${r.slice(0, 3).join(', ')} e mais ${r.length - 3}`;
  const qtdUn = [Q.qtd(Number(caixa)), unidade].filter((x) => x !== undefined && x !== null && x !== '').join(' ');
  return ` — ${qtdUn} estão separados para ${lista} e só saem pela entrega (material perdido da caixa: entregue o que `
    + 'existe e encerre a requisição, ou peça ao administrador do almoxarifado para excluí-la)';
}

module.exports = { caixaSemReservaSql, livreDeCaixaSql, lerCaixa, sufixoCaixa };
