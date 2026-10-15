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
 * Etapa 104 (B704) — a lista das requisicoes que seguram a caixa, como o sufixo sempre a escreveu: "a requisicao X",
 * "as requisicoes X e Y", "as requisicoes X, Y e Z", "as requisicoes X, Y, Z e mais N"; sem numero, "requisicoes em
 * separacao". Extraida do `sufixoCaixa` (texto byte a byte o de antes) para o aviso do ajuste com endereco usar a mesma.
 */
function descreverRequisicoes(requisicoes) {
  const r = requisicoes || [];
  if (r.length === 0) return 'requisições em separação';
  if (r.length === 1) return `a requisição ${r[0]}`;
  if (r.length <= 3) return `as requisições ${r.slice(0, -1).join(', ')} e ${r[r.length - 1]}`;
  return `as requisições ${r.slice(0, 3).join(', ')} e mais ${r.length - 3}`;
}

/**
 * Etapa 97 (T0, B493) — o sufixo da recusa quando ha caixa: diz quanto esta separado, para quem, e as duas saidas
 * legitimas (s3 da Fase 0: entregar o que existe e encerrar, ou o administrador excluir) e, desde a Etapa 98 (B508), a
 * terceira: devolver a prateleira na requisicao (`PUT /requisicoes/:id/devolver-separado`) e dar a baixa. Etapa 102 (C204,
 * B701): sai "entregue o que existe e encerre a requisicao" — entregar o que existe deixa a parte perdida na caixa e o
 * encerramento com caixa passou a ser recusado (E1); a recusa ensinaria um caminho que recusa. Sem caixa devolve
 * `''` — a recusa fica byte a byte a de hoje (RN-04). Ate tres numeros de requisicao; depois, "e mais N".
 */
function sufixoCaixa({ caixa, requisicoes } = {}, unidade) {
  if (!(Number(caixa) > Q.QTD_FOLGA)) return '';
  const lista = descreverRequisicoes(requisicoes);
  const qtdUn = [Q.qtd(Number(caixa)), unidade].filter((x) => x !== undefined && x !== null && x !== '').join(' ');
  return ` — ${qtdUn} estão separados para ${lista} e só saem pela entrega (material perdido da caixa: devolva-o à prateleira `
    + 'na requisição e dê a baixa, ou peça ao administrador do almoxarifado para excluí-la)';
}

/**
 * Etapa 104 (C186, B704) — o AVISO do ajuste com endereco que deixou o DISPONIVEL abaixo da caixa sem reserva. A contagem
 * por endereco redefine o saldo (decisao do cliente, Etapa 6) e nao e recusada pela caixa (opcao (b) da B704; a (a),
 * projetar e recusar, foi descartada): a resposta diz o que aconteceu e os dois caminhos — o material esta na caixa (a
 * contagem nao o viu: estornar o ajuste que BAIXOU o estoque, que sobe o total e nao tem guarda) ou se perdeu (devolver
 * a prateleira na requisicao, Etapa 98). A regua e o DISPONIVEL do motor (`disponivelSql`: fisico - reservado -
 * bloqueado - em inspecao - em terceiros), o mesmo que limita a entrega — nao o total (Fase 2, achado 2: com bloqueado 2
 * ou a reserva de outra requisicao, total = caixa e a entrega presa em "Maximo: 2" sem aviso). "o ajuste que baixou o
 * estoque", nao "este ajuste" (Fase 2, achado 1: o ajuste que SOBE e continua abaixo tambem avisa, e o estorno dele e
 * recusado pela guarda da 97 — quem destrava e o estorno do que baixou). `null` quando a caixa cabe no disponivel (a
 * regua da B524: `Q.cabe`, folga 1e-9). O numero mostrado e `max(0, disponivel)`, como as recusas de saldo.
 * FUNCAO PURA: quem chama le a caixa (`lerCaixa`) e o disponivel DEPOIS de gravar, dentro da trava do material.
 * @returns {string|null}
 */
function avisoCaixaDoAjuste({ caixa, requisicoes } = {}, disponivel, material = {}) {
  const cx = Number(caixa) || 0;
  const disp = Number(disponivel) || 0;
  if (!(cx > Q.QTD_FOLGA) || Q.cabe(cx, disp)) return null;
  // Fase 5 (achado): a unidade nula ou vazia (legado, ou `PUT /materiais/:id` com `unidade: ''`) nao vira "null" nem espaco
  // duplo — o mesmo filtro do `sufixoCaixa`.
  const qtdUn = (n) => [Q.qtd(n), material.unidade].filter((x) => x !== undefined && x !== null && x !== '').join(' ');
  // Etapa 106 (RN-08, B710): o estorno de ajuste de material de CLIENTE exige `ajustar_material_cliente` (so
  // Administrador) — o aviso nao pode mandar pedir ao Gestor um estorno que o motor recusa.
  const quemEstorna = material.proprietario_cliente_id ? 'perfil Administrador do almoxarifado'
    : 'perfil Administrador ou Gestor do almoxarifado';
  return `Ajuste gravado, mas o disponível de ${material.codigo} ficou em ${qtdUn(Math.max(0, disp))}, abaixo dos `
    + `${qtdUn(cx)} separados para ${descreverRequisicoes(requisicoes)}: a entrega fica limitada ao disponível. `
    + `Se o material está na caixa, a contagem não o incluiu — estorne o ajuste que baixou o estoque (${quemEstorna}); `
    + 'se ele se perdeu, devolva-o à prateleira na requisição.';
}

module.exports = { caixaSemReservaSql, livreDeCaixaSql, lerCaixa, sufixoCaixa, descreverRequisicoes, avisoCaixaDoAjuste };
