/**
 * Grades com coluna fixa, no celular.
 *
 * Irmao de `tabelasComoCartoes`: aquele converte tabela em cartao, este
 * desmonta grade de duas colunas que nao cabe num telefone.
 *
 * O PROBLEMA
 * ----------
 * Espalhado pelo software ha o padrao "conteudo + painel lateral" escrito
 * direto no JSX:
 *
 *     <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px' }}>
 *
 * Em 360px, a area util e 322px. A coluna fixa sozinha ja passa disso: o
 * navegador monta `301px + 320px = 621px` e o painel inteiro sai pela
 * direita. Medido em `/almoxarifado/requisicoes/nova`: 31 elementos
 * terminando em 662px.
 *
 * POR QUE NAO RESOLVER NO CSS
 * ---------------------------
 * Estilo inline ganha de qualquer seletor. Venceria com `!important`, mas
 * `!important` exige escrever a regra para CADA classe — e estas grades nem
 * classe tem, sao `<div>` anonimas. E, sobretudo, nao resolveria o proximo
 * modulo: quem escrever `1fr 380px` amanha repete o defeito.
 *
 * Entao a regra mora aqui, roda sobre o que o navegador realmente calculou,
 * e vale para o que ainda nao existe.
 *
 * O QUE ELE NAO FAZ
 * -----------------
 * Nao mexe em grade que ja cabe. `repeat(auto-fill, minmax(280px, 1fr))` se
 * resolve sozinha em uma coluna; `1fr 1fr` de indicadores curtos fica bem em
 * meia largura. So desmonta o que foi MEDIDO como grande demais.
 */

const LIMITE_CELULAR = 768;

// Uma coluna fixa deste tamanho nunca cabe ao lado de outra coisa num
// telefone. Abaixo disto e provavel que seja icone, selo ou avatar, e
// desmontar atrapalharia.
const COLUNA_FIXA_GRANDE = 200;

const ORIGINAL = 'data-grade-original';

function noCelular() {
  return typeof window !== 'undefined' && window.innerWidth <= LIMITE_CELULAR;
}

/**
 * Maior trilha fixa em px declarada no valor.
 *
 * Lê o valor INLINE, não o computado: o computado já vem resolvido em px
 * (`301.688px 320px`) e ali não dá para distinguir a coluna que o autor
 * fixou daquela que o navegador calculou a partir de `1fr`.
 */
function maiorColunaFixa(valor) {
  if (!valor) return 0;
  // `minmax(280px, 1fr)` não é coluna fixa: o 280 é um piso que o auto-fill
  // já sabe respeitar. Removo antes de medir para não contar como fixa.
  const semMinmax = valor.replace(/minmax\([^)]*\)/g, '');
  const achados = semMinmax.match(/(\d+(?:\.\d+)?)px/g) || [];
  return achados.reduce((m, p) => Math.max(m, parseFloat(p)), 0);
}

/**
 * Decide se esta grade tem de virar coluna unica, e diz por quê.
 * Devolve `null` quando a grade está bem como está.
 */
export function motivoParaDesmontar(el, larguraDisponivel) {
  const inline = el.style && el.style.gridTemplateColumns;
  if (!inline) return null;

  const fixa = maiorColunaFixa(inline);
  if (fixa >= COLUNA_FIXA_GRANDE) {
    return `coluna fixa de ${fixa}px em ${Math.round(larguraDisponivel)}px de tela`;
  }

  // Aqui havia uma segunda regra: desmontar `1fr 1fr` quando a grade tem
  // campo de formulario e cada coluna fica estreita. Saiu porque era
  // SUPOSICAO minha, nao medida — a varredura das 24 telas do Almoxarifado
  // nao achou um so campo espremido por isso, e em 360px duas colunas dao
  // 161px cada, que preenche. Se aparecer medido, a regra volta com o
  // numero que a medicao der.

  return null;
}

/** Desmonta, guardando o valor original para poder devolver ao girar. */
function desmontar(el, motivo) {
  if (!el.hasAttribute(ORIGINAL)) {
    el.setAttribute(ORIGINAL, el.style.gridTemplateColumns);
  }
  // `important` porque o valor que estou sobrescrevendo também é inline:
  // sem isto, um re-render do React devolve o original por cima.
  el.style.setProperty('grid-template-columns', '1fr', 'important');
  el.setAttribute('data-grade-motivo', motivo);
}

/** Devolve a grade ao que o JSX pedia (o aparelho voltou ao horizontal). */
function remontar(el) {
  const original = el.getAttribute(ORIGINAL);
  el.style.removeProperty('grid-template-columns');
  if (original) el.style.gridTemplateColumns = original;
  el.removeAttribute(ORIGINAL);
  el.removeAttribute('data-grade-motivo');
}

/**
 * Passa uma vez sobre a árvore. Exportada separadamente de
 * `iniciarGradesNoCelular` porque aquele guarda estado de módulo, e o teste
 * precisa de uma função sem memória.
 */
export function ajustarGrades(raiz = document) {
  const alvos = raiz.querySelectorAll('[style*="grid-template-columns"]');
  let mexidos = 0;

  alvos.forEach((el) => {
    const jaMexido = el.hasAttribute(ORIGINAL);

    if (!noCelular()) {
      if (jaMexido) remontar(el);
      return;
    }

    // Se já desmontei, meço contra o valor ORIGINAL — o atual é `1fr` e
    // diria, sempre, que está tudo bem.
    const paraMedir = jaMexido
      ? { style: { gridTemplateColumns: el.getAttribute(ORIGINAL) }, querySelector: (s) => el.querySelector(s) }
      : el;

    const largura = el.clientWidth || (el.parentElement && el.parentElement.clientWidth) || window.innerWidth;
    const motivo = motivoParaDesmontar(paraMedir, largura);

    if (motivo && !jaMexido) {
      desmontar(el, motivo);
      mexidos += 1;
    } else if (!motivo && jaMexido) {
      remontar(el);
    }
  });

  return mexidos;
}

let observador = null;
let agendado = null;

/**
 * Agrupa rajadas de mutação num passe só.
 *
 * Por que DOIS relógios em vez de só `requestAnimationFrame`:
 *
 * rAF só dispara quando a página PINTA. Aba em segundo plano, aplicativo
 * trocado, tela do telefone apagada — em todos esses casos ele para, e
 * `visibilityState` pode continuar dizendo `"visible"` (medido: nesta
 * sessão o rAF não disparou em 1,2s com a página se declarando visível).
 *
 * Combinado com a trava `if (agendado) return`, isso não atrasa o passe: ele
 * MATA o adaptador. O primeiro agendamento fica pendente para sempre e toda
 * mutação seguinte é descartada em silêncio. Foi o que aconteceu aqui — a
 * grade de `1fr 320px` voltou a estourar depois de já ter sido corrigida.
 *
 * O `setTimeout` continua correndo sem pintura. Quem chegar primeiro executa
 * e cancela o outro.
 */
function agendar() {
  if (agendado) return;

  const rodar = () => {
    if (!agendado) return;
    agendado.cancelar();
    agendado = null;
    ajustarGrades(document);
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

export function iniciarGradesNoCelular() {
  if (observador) return;

  ajustarGrades(document);

  observador = new MutationObserver((mutacoes) => {
    const mexeu = mutacoes.some(
      (m) => (m.type === 'childList' && m.addedNodes.length) ||
             (m.type === 'attributes' && m.attributeName === 'style'),
    );
    if (mexeu) agendar();
  });
  observador.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style'],
  });

  // Girar o aparelho cruza o limite de 768px nos dois sentidos.
  window.addEventListener('resize', agendar);
  window.addEventListener('orientationchange', agendar);
}

export default iniciarGradesNoCelular;
