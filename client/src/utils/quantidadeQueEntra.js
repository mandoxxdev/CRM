/**
 * Quanto um item de recebimento leva (ou levou) para o estoque — o espelho, na tela, de
 * `quantidadeDoItem` do servidor (`server/services/almoxarifado/receiptService.js`). Uma régua só:
 * o modal de Processar, o contador de séries e as etiquetas da nota leem daqui.
 *
 * - recebida `null`/`undefined`/`''`/só espaços → "ninguém conferiu": vale a esperada;
 * - recebida **0** → "chegou zero": NÃO entra (Etapa 70, T0 — antes era `||`, que trocava o 0 pela
 *   esperada aqui e no servidor, e a nota dava entrada no que não chegou);
 * - o resto → a recebida.
 *
 * Etapa 70, Fase 5: saiu de `RecebimentosAlmoxarifado.js` para cá porque `etiquetasPdf.js` usava a
 * régua antiga (`recebida || esperada`) e imprimia etiqueta para o item que chegou zero. O "só
 * espaços" entrou junto com o servidor (o `''` legado gravado por `/conferir` e `/fiscal`).
 */
export function quantidadeQueEntra(item) {
  const recebida = item.quantidade_recebida;
  const informada = recebida !== null && recebida !== undefined
    && !(typeof recebida === 'string' && recebida.trim() === '');
  return (informada ? Number(recebida) : Number(item.quantidade_esperada)) || 0;
}
