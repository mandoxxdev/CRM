/**
 * Teste de corrida na fila de viagens sem pausa fixa. Antes, os testes faziam `await sleep(150)` e SUPUNHAM que a requisicao ja tinha
 * passado das conferencias de fora e esperava na fila atras do gancho — numa maquina lenta ela podia nao ter chegado, e o gesto
 * concorrente (ligar a marca, desativar o destino) acontecia ANTES de ela entrar: o teste passava sem provar a fila.
 *
 * Aqui o teste espera a fila TER `quantos` gestos (o gancho que a segura + a requisicao). Nao chegou em `limiteMs` -> erro que derruba
 * o teste (nunca verde sem prova).
 */
const { quantosNaFila } = require('../../services/frotas/filaDeViagens');

async function esperarFilaDeViagens(quantos, limiteMs = 5000) {
  const fim = Date.now() + limiteMs;
  while (quantosNaFila() < quantos) {
    if (Date.now() > fim) {
      throw new Error(`a fila de viagens nao chegou a ${quantos} gestos em ${limiteMs} ms (tem ${quantosNaFila()})`);
    }
    await new Promise((r) => setTimeout(r, 5));
  }
}

module.exports = { esperarFilaDeViagens };
