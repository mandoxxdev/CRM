/**
 * Transforma toda `<table>` do sistema em lista de CARTÕES no celular.
 *
 * O problema que isto resolve não é de encaixe, é de leitura. Uma tabela de 8 colunas
 * cabe na tela depois que ela rola de lado — mas continua ilegível: o usuário perde de
 * vista o cabeçalho ao rolar, e não sabe mais qual valor pertence a qual coluna. Em
 * celular, a forma certa para uma linha de tabela é um cartão com rótulo ao lado de cada
 * valor. É o que todo aplicativo de lista faz.
 *
 * **Por que em JavaScript e não só em CSS.** O CSS consegue empilhar as células
 * (`display: block`), mas não consegue escrever o rótulo: `td::before { content:
 * attr(data-label) }` depende de um atributo que o HTML precisa ter. Sem ele, o cartão
 * vira uma pilha de valores soltos — pior que a tabela original. Este utilitário lê o
 * texto de cada `<th>` e o copia para o `data-label` do `<td>` correspondente.
 *
 * **Por que é seguro mexer no DOM que o React desenhou.** Só acrescentamos um atributo
 * que o React não conhece (`data-label`) e uma classe. O React não remove o que não
 * gerencia; e quando ele re-renderiza a tabela, o `MutationObserver` abaixo reaplica.
 * Nada aqui altera texto, ordem ou estrutura — se este arquivo sumir, as tabelas voltam
 * a ser tabelas e nada quebra.
 *
 * Uma tabela pode recusar o tratamento com `data-sem-cartoes` — útil para tabelas que são
 * matriz de verdade (calculadora de engenharia, por exemplo), onde a leitura por linha
 * não faz sentido.
 */

const LARGURA_CELULAR = 768;
const CLASSE = 'tabela-cartoes';

const ehCelular = () => window.matchMedia(`(max-width: ${LARGURA_CELULAR}px)`).matches;

/** Texto limpo do cabeçalho: sem quebras, sem espaço duplicado, sem ícone. */
function rotuloDe(th) {
  if (!th) return '';
  return (th.textContent || '').replace(/\s+/g, ' ').trim();
}

function rotularTabela(tabela) {
  if (tabela.hasAttribute('data-sem-cartoes')) return;

  const cabecalhos = Array.from(tabela.querySelectorAll('thead th')).map(rotuloDe);

  // Sem cabeçalho não há rótulo para dar — e um cartão sem rótulo é pior que a tabela.
  // Nesse caso a tabela fica como está e continua rolando de lado (regra do CSS global).
  if (cabecalhos.length === 0 || cabecalhos.every((c) => c === '')) return;

  const linhas = tabela.querySelectorAll('tbody tr');
  if (linhas.length === 0) return;

  let rotulou = false;
  linhas.forEach((linha) => {
    // `colSpan` é como as telas desenham a linha de "nenhum resultado". Uma linha assim
    // não é um registro: rotular cada célula ali produziria "Número: Nenhum pedido".
    const celulas = Array.from(linha.children).filter((c) => c.tagName === 'TD');
    if (celulas.length <= 1) return;

    celulas.forEach((td, i) => {
      const rotulo = cabecalhos[i];
      if (!rotulo) return;
      if (td.getAttribute('data-label') !== rotulo) td.setAttribute('data-label', rotulo);
      rotulou = true;
    });
  });

  // A classe só entra quando o rótulo existe de verdade. É ela que liga o visual de
  // cartão no CSS — assim, tabela que este código não soube tratar nunca fica pela metade.
  if (rotulou) tabela.classList.add(CLASSE);
}

function varrer(raiz = document) {
  if (!ehCelular()) return;
  raiz.querySelectorAll?.('table').forEach(rotularTabela);
}

let observador = null;
let agendado = null;

/** Agrupa rajadas de mudança do React numa única varredura. */
function agendarVarredura() {
  if (agendado) return;
  agendado = window.requestAnimationFrame(() => {
    agendado = null;
    varrer();
  });
}

export function iniciarTabelasComoCartoes() {
  if (typeof window === 'undefined' || observador) return;

  varrer();

  observador = new MutationObserver((mutacoes) => {
    // Só reage a mudança de estrutura. Sem esta checagem, o próprio `setAttribute` deste
    // arquivo dispararia o observador e entraria em laço.
    const mexeuNaArvore = mutacoes.some((m) => m.type === 'childList' && m.addedNodes.length);
    if (mexeuNaArvore) agendarVarredura();
  });

  observador.observe(document.body, { childList: true, subtree: true });

  // Girar o aparelho atravessa o limiar de 768px nos dois sentidos.
  window.matchMedia(`(max-width: ${LARGURA_CELULAR}px)`)
    .addEventListener('change', (e) => {
      if (e.matches) varrer();
      else {
        document.querySelectorAll(`table.${CLASSE}`)
          .forEach((t) => t.classList.remove(CLASSE));
      }
    });
}

export default iniciarTabelasComoCartoes;
