/**
 * Frotas Etapa 1 (RN-F1.05, F2-10): fila unica, em memoria, para os gestos que abrem ou fecham viagem — a saida e o retorno do portal
 * e o POST/PUT de /viagens. A regra "uma viagem em andamento por veiculo e por motorista" e conferida com SELECT e gravada com
 * INSERT/UPDATE em awaits separados: sem a fila, duas saidas simultaneas do mesmo carro passavam as duas pela conferencia.
 *
 * Premissa: um processo (a mesma da trava por material do almoxarifado). NAO e reentrante: quem esta dentro nao chama
 * `naFilaDeViagens` de novo (esperaria a si mesmo).
 */
let cauda = Promise.resolve();
let naFila = 0;

function naFilaDeViagens(fn) {
  naFila += 1;
  const resultado = cauda.then(() => fn());
  cauda = resultado.catch(() => {}).then(() => { naFila -= 1; });
  return resultado;
}

/**
 * Quantos gestos entraram na fila e ainda nao terminaram (o que esta rodando conta). So para teste de corrida: em vez de esperar um tempo
 * fixo e supor que a requisicao ja chegou a fila, o teste espera este numero subir (molde do gancho do CLAUDE.md, RN-15).
 */
function quantosNaFila() {
  return naFila;
}

module.exports = { naFilaDeViagens, quantosNaFila };
