/**
 * Etapa 91 (T0, D4/B422) — a trava por material, UM `Map` so para o processo inteiro.
 *
 * Ate a 91 a trava morava dentro do `reservaChegadaService` (Etapa 75, Fase 5) e so a distribuicao da
 * chegada/liberacao e o recalculo da 76 a pegavam. A C131 mostrou que isso nao basta: a aprovacao de uma
 * requisicao mais nova caia entre o movimento do motor que poe saldo no disponivel e a distribuicao para
 * quem esperava, e levava o material (fila invertida, 8/8 rodadas). A Opcao A (B419) poe a mesma trava nas
 * seis portas — tres que liberam (nota, inspecao, NC que aceita) e tres que aprovam (`/aprovar`,
 * `/aprovar-valor`, aprovacao automatica). Por isso a trava saiu para um modulo SEM NENHUM `require`: o
 * `requisitionService` precisa dela e `reservaChegadaService -> requisitionService` ja existe (ciclo).
 * Descartado: um `Map` por modulo — as portas nao esperariam o recalculo da 76.
 *
 * PREMISSA (C132): o app e UM processo Node com UMA conexao SQLite; a trava e um `Map` em memoria. Com
 * mais de um processo (cluster, dois servidores) ou no Postgres, isto vira
 * `SELECT ... FROM materiais_almoxarifado WHERE id = ANY(...) ORDER BY id FOR UPDATE` (ou
 * `pg_advisory_xact_lock(material_id)` em ordem crescente) dentro da transacao que vai do movimento do
 * motor ate a distribuicao — e a aprovacao pega as mesmas linhas antes de ler o disponivel.
 *
 * INVARIANTE DE ORDEM: toda aquisicao de varios materiais passa por `comLockDosMateriais` (DISTINCT,
 * crescente); nada pega trava segurando outra fora dessa funcao; recalculo e aviso rodam FORA da secao.
 * A trava NAO e reentrante: pegar de novo, de dentro da `fn`, um material que a secao ja segura espera a
 * si mesma para sempre. Proibido chamar de dentro de uma secao: `recalcularStatusSobTrava`,
 * `recalcularRequisicoesDasReservas`, `cancelarMovimentacao`, as variantes sem `sobTrava` do
 * `reservaChegadaService`, ou outra porta.
 */

const filaPorMaterial = new Map();

/**
 * FIFO por `Number(materialId)`. Solta no `finally` (uma excecao de `fn` solta a trava e e relancada).
 * Corpo = o da Etapa 75 (Fase 5), movido do `reservaChegadaService`.
 */
async function comLockDoMaterial(materialId, fn) {
  const chave = Number(materialId);
  const anterior = filaPorMaterial.get(chave) || Promise.resolve();
  let soltar;
  const minha = new Promise((resolve) => { soltar = resolve; });
  const cauda = anterior.then(() => minha);
  filaPorMaterial.set(chave, cauda);
  await anterior;
  try {
    return await fn();
  } finally {
    soltar();
    if (filaPorMaterial.get(chave) === cauda) filaPorMaterial.delete(chave);
  }
}

/**
 * As travas de varios materiais, aninhadas em ordem CRESCENTE de id (a ordem unica que impede ciclo
 * entre duas secoes que pegam mais de um material). `DISTINCT`: dois itens do mesmo material pegariam a
 * mesma trava duas vezes e ela nao e reentrante. Ids nulos, vazios ou nao finitos sao descartados; lista vazia chama `fn`
 * direto. Pelo objeto do modulo (os testes espiam `comLockDoMaterial`).
 */
async function comLockDosMateriais(materialIds, fn) {
  const mats = [...new Set((materialIds || []).filter((x) => x != null && x !== '').map(Number)
    .filter((x) => Number.isFinite(x)))]
    .sort((a, b) => a - b);
  const aninhar = (i) => (i >= mats.length
    ? fn()
    : module.exports.comLockDoMaterial(mats[i], () => aninhar(i + 1)));
  return aninhar(0);
}

/**
 * `true` enquanto alguem SEGURA ou ESPERA a trava do material. Introspeccao para os testes e para a
 * guarda L1 das variantes `sobTrava` — defesa, nao prova: sob concorrencia o `true` pode vir de OUTRO.
 */
function travado(materialId) {
  return filaPorMaterial.has(Number(materialId));
}

module.exports = { comLockDoMaterial, comLockDosMateriais, travado };
