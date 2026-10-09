/**
 * Etapa 91 (T0, D4/B422) — a trava por material, UM `Map` so para o processo inteiro.
 *
 * Ate a 91 a trava morava dentro do `reservaChegadaService` (Etapa 75, Fase 5) e so a distribuicao da
 * chegada/liberacao e o recalculo da 76 a pegavam. A C131 mostrou que isso nao basta: a aprovacao de uma
 * requisicao mais nova caia entre o movimento do motor que poe saldo no disponivel e a distribuicao para
 * quem esperava, e levava o material (fila invertida, 8/8 rodadas). A Opcao A (B419) poe a mesma trava nas
 * seis portas — tres que liberam (nota, inspecao, NC que aceita) e tres que aprovam (`/aprovar`,
 * `/aprovar-valor`, aprovacao automatica). Por isso a trava saiu para um modulo SEM NENHUM `require` do app (so `async_hooks`, do Node — F3): o
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

// Etapa 91 (Fase 5, F3): o unico `require` do modulo e do proprio Node (sem ciclo possivel).
const { AsyncLocalStorage } = require('async_hooks');

const filaPorMaterial = new Map();

/**
 * Etapa 91 (Fase 5, achado F3) — o que NAO pode rodar com a trava presa. O motor chamava o alerta de
 * estoque minimo (e com ele o `sendMail` do SMTP) no fim de cada movimento; desde a 91 as seis portas
 * chamam o motor DENTRO da secao, e um SMTP lento segurava a fila inteira do material (medido: SMTP de
 * 3 s -> um `/aprovar` concorrente do mesmo material esperou 3032 ms; SMTP falhando em 1 s -> tres
 * aprovacoes em fila, 1/2/3 s, porque a falha nao marca e cada movimento tenta de novo). Agora a secao
 * mais de fora carrega um contexto (`AsyncLocalStorage`); `adiarParaDepoisDaSecao` empilha a tarefa ali e
 * ela roda DEPOIS de a trava ser solta — ainda aguardada pela requisicao que segurava a trava, entao quem
 * le o efeito logo depois da resposta continua vendo-o (descartado o "dispara e esquece": derrubou 3
 * casos em 2 arquivos que leem a fila/estado do alerta logo depois da resposta — medido).
 * Fora de secao devolve `false` e quem chamou roda a tarefa na hora, como sempre.
 */
const secaoAtual = new AsyncLocalStorage();

/** Dentro de uma secao ATIVA: empilha `tarefa` para depois de soltar a trava e devolve `true`. */
function adiarParaDepoisDaSecao(tarefa) {
  const secao = secaoAtual.getStore();
  if (!secao || !secao.ativa) return false;
  secao.adiadas.push(tarefa);
  return true;
}

async function rodarAdiadas(secao) {
  for (const tarefa of secao.adiadas) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await tarefa();
    } catch (e) {
      console.warn(`[almoxarifado-trava] tarefa adiada para depois da secao falhou: ${e.message}`);
    }
  }
}

/**
 * FIFO por `Number(materialId)`. Solta no `finally` (uma excecao de `fn` solta a trava e e relancada).
 * Corpo = o da Etapa 75 (Fase 5), movido do `reservaChegadaService`. A secao mais de fora (a primeira
 * trava pega neste contexto assincrono) abre o contexto das tarefas adiadas e as roda depois de soltar
 * (Fase 5, F3); as aninhadas (`comLockDosMateriais`) usam o mesmo contexto.
 */
async function comLockDoMaterial(materialId, fn) {
  const externa = secaoAtual.getStore();
  if (externa && externa.ativa) return segurarTrava(materialId, fn);
  const secao = { ativa: true, adiadas: [], materiais: new Set() };
  try {
    return await secaoAtual.run(secao, () => segurarTrava(materialId, fn));
  } finally {
    secao.ativa = false; // promessa que escape da secao e termine depois nao empilha mais nada aqui
    await rodarAdiadas(secao);
  }
}

async function segurarTrava(materialId, fn) {
  const chave = Number(materialId);
  const anterior = filaPorMaterial.get(chave) || Promise.resolve();
  let soltar;
  const minha = new Promise((resolve) => { soltar = resolve; });
  const cauda = anterior.then(() => minha);
  filaPorMaterial.set(chave, cauda);
  await anterior;
  const secao = secaoAtual.getStore();
  if (secao) secao.materiais.add(chave);
  try {
    return await fn();
  } finally {
    // Etapa 97 (T0, Fase 2 B-1): o `Set` diz o que a secao SEGURA AGORA, nao o que ja segurou — `naTravaDoMaterial`
    // decide por ele (um fluxo vazado da secao que ja soltou `m` tem de esperar `m` como qualquer outro).
    if (secao) secao.materiais.delete(chave);
    soltar();
    if (filaPorMaterial.get(chave) === cauda) filaPorMaterial.delete(chave);
  }
}

/**
 * Etapa 91 (Fase 5, achado F1): dos `materialIds`, os que a secao ATUAL nao segura. Fora de secao devolve
 * `[]` (quem chama fora de uma trava nao e cobrado). Ao contrario de `travado`, e prova: olha o contexto
 * de quem pergunta, nao o `Map` compartilhado (onde o `true` pode ser de outro).
 */
function materiaisForaDaSecao(materialIds) {
  const secao = secaoAtual.getStore();
  if (!secao || !secao.ativa) return [];
  return [...new Set((materialIds || []).filter((x) => x != null && x !== '').map(Number)
    .filter((x) => Number.isFinite(x)))]
    .filter((m) => !secao.materiais.has(m))
    .sort((a, b) => a - b);
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
 * Etapa 97 (T0, B494; forma da Fase 2, B-1) — roda `fn` sob a trava do material SE a secao do contexto nao a segura.
 * E o embrulho do motor (`registrarMovimentacao`, `criarReserva`, a escrita curta do estorno): a porta avulsa chamada
 * fora de secao passa a esperar a separacao, a entrega e a aprovacao do mesmo material (s4b da Fase 0: solto 10/10
 * ERRADO, sob a trava 0/10). Os testes, nesta ordem:
 *   - a secao do contexto SEGURA `m` agora (`secao.materiais.has(m)`) -> `fn()` (a entrega, a aprovacao, a nota chamam
 *     o motor de dentro; a trava nao e reentrante — pedir de novo esperaria a si mesma);
 *   - secao ATIVA que nao segura `m` -> `fn()` (como antes da 97; nao aninha fora de `comLockDosMateriais` — invariante);
 *   - fora de secao, ou secao ja FECHADA que nao segura `m` -> `comLockDoMaterial` (pelo objeto, os testes espiam).
 * Por que `has` ANTES de `ativa` (Fase 2, B-1): um fluxo nascido dentro de outra secao reaproveita o objeto da mae
 * (`comLockDoMaterial`, ramo `externa.ativa`); quando a mae fecha, `ativa` vira `false` e o filho — que segura `m` —
 * pediria a trava que ele mesmo segura: preso para sempre (sonda r3; caiam `aprovacaoEsperaTrava` RN-05 (f) e quatro
 * casos de `travaRevisaoFase5`). Material nulo ou nao finito -> `fn()` (a recusa de material invalido e a do motor).
 */
async function naTravaDoMaterial(materialId, fn) {
  if (materialId === null || materialId === undefined || materialId === '') return fn();
  const m = Number(materialId);
  if (!Number.isFinite(m)) return fn();
  const secao = secaoAtual.getStore();
  if (secao && secao.materiais.has(m)) return fn();
  if (secao && secao.ativa) return fn();
  return module.exports.comLockDoMaterial(m, fn);
}

/**
 * `true` enquanto alguem SEGURA ou ESPERA a trava do material. Introspeccao para os testes e para a
 * guarda L1 das variantes `sobTrava` — defesa, nao prova: sob concorrencia o `true` pode vir de OUTRO.
 */
function travado(materialId) {
  return filaPorMaterial.has(Number(materialId));
}

module.exports = {
  comLockDoMaterial, comLockDosMateriais, travado, adiarParaDepoisDaSecao, materiaisForaDaSecao,
  naTravaDoMaterial, // Etapa 97 (T0)
};
