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

/**
 * Etapa 87 (fix-round da revisao) — fecha o navegador com PRAZO.
 *
 * `browser.close()` do Puppeteer espera o processo do Chromium sair; se ele nao sai (travado,
 * zumbi), a promessa nunca resolve. Como `fecharNavegadorPdf` roda DENTRO da fila serial, um
 * close pendurado seguraria a fila para sempre: nenhum PDF (proposta, pedido, OS) sairia mais ate
 * reiniciar o servidor. Aqui o close corre contra um prazo; estourado, mata o processo filho
 * (`navegador.process().kill('SIGKILL')`) e devolve — a fila segue.
 *
 * Devolve 'fechou' | 'erro' (close rejeitou: ja estava morto) | 'prazo' (matou o processo).
 * O temporizador NAO usa unref: com unref, um processo sem outra referencia sairia antes do prazo
 * e o kill nunca aconteceria.
 */
async function fecharNavegadorComPrazo(navegador, { prazoMs = 10000, aoEstourar } = {}) {
  let timer = null;
  const prazo = new Promise((resolve) => { timer = setTimeout(() => resolve('prazo'), prazoMs); });
  const fechou = Promise.resolve()
    .then(() => navegador.close())
    .then(() => 'fechou', () => 'erro');
  const resultado = await Promise.race([fechou, prazo]);
  clearTimeout(timer);
  if (resultado === 'prazo') {
    let matou = false;
    try {
      const proc = typeof navegador.process === 'function' ? navegador.process() : null;
      if (proc && typeof proc.kill === 'function') { proc.kill('SIGKILL'); matou = true; }
    } catch (_) { /* processo ja sumiu */ }
    if (typeof aoEstourar === 'function') aoEstourar({ prazoMs, matou });
  }
  return resultado;
}

module.exports = { criarFilaSerial, fecharNavegadorComPrazo };
