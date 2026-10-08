/**
 * Etapa 80 (B32) — fila serial: uma tarefa por vez, em ordem de chegada.
 *
 * Usada pelo `server/index.js` para que no maximo UMA geracao de PDF use o Chromium compartilhado
 * por vez (RN-80.01): reciclagem, fechamento por erro e fechamento por ociosidade passam a
 * acontecer so ENTRE geracoes, e dois chamadores nunca lancam dois navegadores juntos.
 *
 * `criarFilaSerial()` devolve `enfileirar(fn)`: `fn` (sincrona ou async) roda quando todas as
 * anteriores terminaram; a promessa devolvida resolve com o retorno de `fn` ou rejeita com o
 * MESMO erro dela. Uma tarefa que falha NAO envenena a fila (RN-80.02): a cadeia interna engole
 * o resultado (sucesso ou erro) antes de encadear a proxima.
 *
 * ⚠️ Nunca chamar `enfileirar` de dentro de uma tarefa da MESMA fila esperando o resultado:
 * a interna so roda depois que a externa terminar, e a externa esta esperando a interna
 * (deadlock).
 */
function criarFilaSerial() {
  let cauda = Promise.resolve();
  return function enfileirar(fn) {
    const resultado = cauda.then(() => fn());
    cauda = resultado.then(() => undefined, () => undefined);
    return resultado;
  };
}

module.exports = { criarFilaSerial };
