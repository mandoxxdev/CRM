// Fonte UNICA de "isto e divergencia de verdade" no inventario (padrao availabilitySql/custoSql:
// uma formula compartilhada, nunca copias).
//
// Por que existe (revisao final da Etapa 10b, medido): quantidade_sistema nasce de uma subtracao
// REAL (quantidade_atual - quantidade_em_terceiros) — contar 0.2 contra um esperado
// 0.1999999999999993 gerava divergencia 7e-16, e cada consumidor com comparacao exata (= 0,
// != 0) tratava o operador que ACERTOU como divergente: 0% de acuracidade no relatorio novo,
// item listado no relatorio antigo de divergencias, AJUSTE_INVENTARIO inutil de 7e-16 no
// concluir, e recontagem exigida com a mensagem sem sentido "0.00% (limite 0%)" quando a
// tolerancia era zero.
//
// Consumidores: routes/almoxarifado.js (relatorio de acuracidade, filtro de ajustes do concluir,
// gate de recontagem, recontagem_necessaria do GET /:id) e reportService.js (relatorio de
// divergencias). O front espelha o mesmo valor na fronteira HTTP (ConferenciaEstoque.js,
// contador local de divergencias) — copia declarada, legitima so porque a fronteira existe.
//
// Etapa 17 (expansao de escopo DECLARADA): alertRegistry.js passa a ser consumidor SQL FORA do
// inventario — `listarDivergenciasRecebimento` compara quantidade_recebida - quantidade_esperada
// (alerta DIVERGENCIA_RECEBIMENTO) e `listarDivergenciaConferencia` compara ic.divergencia
// (alerta DIVERGENCIA_INVENTARIO). Mesma classe de bug e mesmo motivo: a quantidade recebida
// tambem nasce de conta com REAL, e um `!= 0` cru transformaria 10.0000000001 em "divergencia"
// e mandaria e-mail para quem acertou. A funcao NAO muda — so ganha consumidor.
const EPSILON_DIVERGENCIA = 1e-9;

// Fragmento SQL para "tem divergencia de verdade" sobre uma coluna de divergencia.
function divergenciaRealSql(coluna) {
  return `ABS(${coluna}) > ${EPSILON_DIVERGENCIA}`;
}

module.exports = { EPSILON_DIVERGENCIA, divergenciaRealSql };
