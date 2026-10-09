/**
 * Etapa 93 (T0, B443) — a trava POR REQUISICAO das portas do almoxarife.
 *
 * Separar, entregar e excluir (e, desde a T1, liberar para retirada e encerrar) liam o estado da
 * requisicao, gravavam e so no fim regravavam o status com `WHERE id=?`. Dois desses gestos na MESMA
 * requisicao no mesmo instante se atropelavam (Fase 0 da 93, 5/5 com gancho): a requisicao excluida voltava
 * a EM_SEPARACAO, duas entregas perdiam a entrega do item e deixavam sair material a mais (C156, 10/10 sem
 * gancho), duas exclusoes estornavam duas vezes (C157, 10/10 sem gancho). Um compare-and-set de status nao
 * fecha essas tres (a perda e no item; o estorno vem antes do UPDATE final; a rodada 2 nao muda o status).
 * Com a trava o segundo gesto ESPERA o primeiro terminar e le o estado novo.
 *
 * NAO CONFUNDIR com `requisitionService.comTravaDaRequisicao`: aquela e a trava POR MATERIAL dos itens da
 * requisicao (`travaPorMaterial`, Etapa 91 — de quem distribui ou le o disponivel para reservar). Esta e
 * outra, por requisicao. ORDEM: requisicao -> material. Esta trava NUNCA e pega de dentro de uma secao da
 * trava por material (nenhum caminho sob a trava por material chega as portas que seguram esta — medido na
 * Fase 2 da 93: 0 de 1574 aquisicoes da trava por material na suite vieram de dentro destas portas).
 *
 * NAO REENTRANTE: pegar de novo a mesma requisicao de dentro da `fn` espera a si mesma para sempre. Nenhuma
 * porta das cinco chama outra das cinco; e a rota da exclusao NAO pode embrulhar o servico nesta trava (o
 * servico ja a pega).
 *
 * PREMISSA (C132): um processo Node (ecosystem `instances: 1`). Com mais de um processo isto vira
 * `SELECT ... FROM requisicoes_almoxarifado WHERE id = ? FOR UPDATE` na transacao do gesto.
 *
 * Sem nenhum `require` do app (como `travaPorMaterial`). Chamado pelo objeto do modulo
 * (`travaPorRequisicao.serializarNaRequisicao(...)`) para os testes espiarem/sabotarem.
 */

const fila = new Map(); // Number(requisicaoId) -> cauda (Promise que resolve quando o ultimo da fila soltar)
const esperando = new Map(); // Number(requisicaoId) -> quantos estao na fila atras do dono

function chaveDe(requisicaoId) {
  return Number(requisicaoId); // a rota passa `req.params.id` (string), o servico pode receber numero
}

/** FIFO por requisicao. Solta no `finally` (uma excecao de `fn` solta a trava e e relancada). */
async function serializarNaRequisicao(requisicaoId, fn) {
  const chave = chaveDe(requisicaoId);
  const anterior = fila.get(chave);
  let soltar;
  const minha = new Promise((resolve) => { soltar = resolve; });
  const cauda = (anterior || Promise.resolve()).then(() => minha);
  fila.set(chave, cauda);
  if (anterior) {
    esperando.set(chave, (esperando.get(chave) || 0) + 1);
    try {
      await anterior;
    } finally {
      const n = (esperando.get(chave) || 1) - 1;
      if (n > 0) esperando.set(chave, n); else esperando.delete(chave);
    }
  }
  try {
    return await fn();
  } finally {
    soltar();
    if (fila.get(chave) === cauda) fila.delete(chave);
  }
}

/** Quantos gestos esperam atras do dono da trava desta requisicao (0 sem fila). */
function esperandoNaRequisicao(requisicaoId) {
  return esperando.get(chaveDe(requisicaoId)) || 0;
}

/** Diagnostico (testes): as requisicoes com a trava presa agora. */
function requisicoesTravadas() {
  return [...fila.keys()];
}

module.exports = { serializarNaRequisicao, esperandoNaRequisicao, requisicoesTravadas };
