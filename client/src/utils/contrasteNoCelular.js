/**
 * Cor ilegível escrita em JavaScript, no celular.
 *
 * Terceiro irmão de `tabelasComoCartoes` e `gradesNoCelular`. Os dois
 * primeiros consertam FORMA; este conserta COR — e só a que o CSS não
 * alcança.
 *
 * O PROBLEMA
 * ----------
 * Espalhado pelo sistema, o estado de um registro é pintado no próprio JSX:
 *
 *     <span style={{ color: '#047857' }}>Em estoque</span>
 *     <span style={{ background: 'rgba(46,204,113,.125)', color: 'rgb(46,204,113)' }}>aprovado</span>
 *
 * Essas cores foram escolhidas olhando um fundo branco de monitor. Sobre o
 * cartão de vidro do celular, ou sobre o tema escuro, elas caem: 3,24 no
 * "Em estoque" de `/almoxarifado/requisicoes-material/nova`, 1,78 no selo de
 * `/compras/pedidos`. O mínimo para texto pequeno é 4,5.
 *
 * Onde a cor mora numa CLASSE, o conserto é CSS, e está no `app-glass.css` —
 * lá dá para separar por tema e revisar lendo. Aqui a cor está no atributo
 * `style`, calculada em tempo de execução a partir do dado: nenhum seletor
 * alcança, e `!important` no CSS perderia para o inline de qualquer jeito.
 *
 * O QUE ELE FAZ, E O QUE NÃO FAZ
 * ------------------------------
 * Lê a cor do texto e o fundo realmente pintado atrás dele. Se o contraste
 * passa, NÃO TOCA. Se não passa, escurece (ou clareia) a letra mantendo o
 * matiz até passar. O fundo nunca muda: verde continua verde, vermelho
 * continua vermelho, e a tela não muda de cara — só passa a ser legível.
 *
 * Não age no computador, não age sobre fundo que seja imagem ou degradê
 * (onde não há como saber a cor pintada) e não age onde já está bom. Um
 * elemento que ele não consegue resolver em vinte passos fica como estava:
 * melhor a cor original do que um cinza sem significado.
 */

import { corLegivel, fundoAtras } from './tabelasComoCartoes';

const LIMITE_CELULAR = 768;
const MARCA = 'data-contraste-ajustado';

function noCelular() {
  return typeof window !== 'undefined' && window.innerWidth <= LIMITE_CELULAR;
}

/**
 * Passa uma vez sobre a árvore. Exportada separadamente do iniciador porque
 * aquele guarda estado de módulo, e o teste precisa de função sem memória.
 */
export function ajustarContrastes(raiz = document) {
  if (!noCelular()) return 0;

  // `[style*="color"]` é o filtro barato que faz esta varredura valer a pena:
  // olha só quem tem cor escrita no atributo, e não a árvore inteira.
  const alvos = raiz.querySelectorAll('[style*="color"]');
  let ajustados = 0;

  alvos.forEach((el) => {
    // Sem texto próprio não há o que ficar ilegível.
    const proprio = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join('');
    if (!proprio) return;

    const fundo = fundoAtras(el);
    if (!fundo) return;

    const atual = getComputedStyle(el).color;
    const nova = corLegivel(atual, `rgb(${fundo.r},${fundo.g},${fundo.b})`);
    if (!nova) {
      // Passou a ficar legível sozinho (o tema mudou, por exemplo): solto a
      // marca para que um próximo passe possa reavaliar do zero.
      if (el.hasAttribute(MARCA)) el.removeAttribute(MARCA);
      return;
    }

    // `important` porque a cor original também é inline: sem isso, o próximo
    // render do React devolve a ilegível por cima.
    el.style.setProperty('color', nova, 'important');
    el.setAttribute(MARCA, '1');
    ajustados += 1;
  });

  return ajustados;
}

let observador = null;
let agendado = null;

/**
 * Dois relógios, e não só `requestAnimationFrame`.
 *
 * rAF só dispara quando a página PINTA: aplicativo em segundo plano, tela
 * apagada, aba oculta. Com a trava `if (agendado) return`, um rAF que não
 * chega não atrasa o passe — ele MATA o utilitário, e toda mutação seguinte
 * é descartada calada. Foi medido nesta base: rAF parado por 1,2s com o
 * documento se declarando `visibilityState: "visible"`.
 */
function agendar() {
  if (agendado) return;

  const rodar = () => {
    if (!agendado) return;
    agendado.cancelar();
    agendado = null;
    ajustarContrastes(document);
  };

  const quadro = window.requestAnimationFrame(rodar);
  const relogio = window.setTimeout(rodar, 250);

  agendado = {
    cancelar: () => {
      window.cancelAnimationFrame(quadro);
      window.clearTimeout(relogio);
    },
  };
}

export function iniciarContrasteNoCelular() {
  if (observador) return;

  ajustarContrastes(document);

  observador = new MutationObserver((mutacoes) => {
    const mexeu = mutacoes.some(
      (m) => (m.type === 'childList' && m.addedNodes.length)
        // Só reage a `style` de terceiros: a minha própria escrita marca o
        // elemento, e reagir a ela seria um laço.
        || (m.type === 'attributes' && m.attributeName === 'style'
            && !(m.target.getAttribute && m.target.getAttribute(MARCA))),
    );
    if (mexeu) agendar();
  });
  observador.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style'],
  });

  // Girar o aparelho cruza o limite de 768px; trocar o tema muda todo o fundo.
  window.addEventListener('resize', agendar);
  window.addEventListener('orientationchange', agendar);
}

export default iniciarContrasteNoCelular;
