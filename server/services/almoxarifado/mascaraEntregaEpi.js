/**
 * Etapa 181 (Fase 5, revisao adversarial, I1) — a mascara da justificativa ANTIGA da saida da entrega de EPI.
 *
 * Ate a Fase 5 da 181 a entrega de EPI (epiService.registrarEntrega) gravava na SAIDA a justificativa
 * `Entrega de EPI a <nome> (<matricula>)`, e o historico de movimentacoes a mostra a qualquer usuario do modulo — enquanto a
 * entrega (quem recebeu qual EPI) e restrita a `entregar_epi`. Daqui para frente a justificativa e `Entrega de EPI <numero>`.
 * As linhas antigas NAO sao reescritas (o livro e o registro do que aconteceu; reescrever seria irreversivel — letra B): sao
 * mascaradas NA LEITURA para quem nao tem `entregar_epi`, em toda porta que devolve a justificativa da movimentacao.
 *
 * A regua e o texto, nao o documento: uma justificativa digitada que comece com "Entrega de EPI a " tambem e mascarada (o
 * lado seguro — mascara a mais, nunca a menos). A justificativa nao entra no HMAC da evidencia (`epiService.camposDoRegistro`
 * so leva o `movimentacao_id`), entao nada disto mexe na verificacao da cadeia.
 */
const { can } = require('./permissions');

const TEXTO_RESTRITO = 'Entrega de EPI (dados do colaborador restritos)';
const JUSTIFICATIVA_ANTIGA = /^Entrega de EPI a [\s\S]+$/;

function mascararLinha(linha) {
  if (!linha || typeof linha.justificativa !== 'string' || !JUSTIFICATIVA_ANTIGA.test(linha.justificativa)) return linha;
  return { ...linha, justificativa: TEXTO_RESTRITO };
}

/** As linhas de movimentacao como `user` pode ve-las: intactas para quem tem `entregar_epi`; nao-array passa intocado. */
function mascararMovimentacoes(linhas, user) {
  if (!Array.isArray(linhas) || can(user, 'entregar_epi')) return linhas;
  return linhas.map(mascararLinha);
}

module.exports = { TEXTO_RESTRITO, JUSTIFICATIVA_ANTIGA, mascararMovimentacoes };
