// Motor de movimento (25/11/2026) — a parte da referencia (TikTok "Dashboard V14")
// que o CSS sozinho nao faz: os numeros de KPI CONTAM de 0 ate o valor quando a
// tela entra, e do valor antigo ate o novo quando mudam.
//
// Por que generico e por DOM, e nao um componente <Numero>: ha valores de KPI em
// ~20 telas de 6 modulos (summary-value, kpi-value, almox-kpi-value, frotas-kpi-value,
// producao-kpi-value, maquina-kpi-value, dashboard-card-value...). O P.O. pediu
// "TODOS os modulos"; um componente exigiria tocar cada tela e deixaria buracos.
// Aqui um MutationObserver na area de conteudo ve o valor chegar e o anima.
//
// Regras que evitam brigar com o React:
// - Mexe so em `nodeValue` do no de texto que o React criou — NUNCA em textContent
//   (textContent troca o no, o React continua segurando o antigo e o proximo valor
//   iria para um no solto: a tela ficaria com o numero velho).
// - O texto final e exatamente o que o React escreveu (sem erro de arredondamento).
// - Quando o React escreve um valor novo no mesmo no (characterData), a contagem
//   parte do que esta na tela, nao de zero. Nossas proprias escritas sao ignoradas
//   (comparando com o ultimo texto que gravamos).
// - Um elemento que remonta na MESMA pagina com o MESMO valor (filtro que re-renderiza
//   os cartoes) nao conta de novo: a memoria por posicao guarda o ultimo valor final.
//   Trocou de rota, a memoria zera e tudo conta do zero — como no video.

import { useEffect } from 'react';

const SELETOR_KPI = [
  '.summary-value', '.kpi-value', '.stat-value', '.stat-number', '.dashboard-card-value',
  '.inicio-modulo__kpi-valor', '.grupo-card-numero', '.valor-principal', '.previsao-valor',
  '.frotas-total', '.lp-total', '.chart-donut-total', '.modal-grafico-count', '.vt-count',
  '[class*="kpi-value"]', '[class*="kpi-valor"]', '[class*="kpi__valor"]', '[class*="kpi-numero"]',
  '[class*="-stat-value"]', '[class*="resumo-valor"]', '[class*="coluna-count"]',
].join(',');

// prefixo (R$, +, ~) | sinal | inteiro com ou sem agrupamento | decimais | sufixo (%, un, k)
const RE_NUMERO = /^(\s*[^\d\-+]{0,8}?)([-+]?)(\d{1,3}(?:([.,\s ])\d{3})+|\d+)(?:([.,])(\d+))?([^\d]{0,12}\s*)$/;
const DURACAO_MS = 1300;
const DURACAO_TROCA_MS = 900;

function movimentoReduzido() {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Le "R$ 1.234,56" -> { prefixo:'R$ ', valor:1234.56, grupo:'.', decimalSep:',', decimais:2, sufixo:'' }. */
export function lerNumero(texto) {
  if (typeof texto !== 'string' || texto.length > 28) return null;
  const m = RE_NUMERO.exec(texto);
  if (!m) return null;
  const [, prefixo, sinal, inteiroBruto, grupo, decimalSep, decimaisBruto, sufixo] = m;
  const inteiro = inteiroBruto.replace(/[.,\s ]/g, '');
  const decimais = decimaisBruto ? decimaisBruto.length : 0;
  const valor = Number(`${sinal === '-' ? '-' : ''}${inteiro}${decimais ? `.${decimaisBruto}` : ''}`);
  if (!Number.isFinite(valor)) return null;
  return { prefixo, sinalMais: sinal === '+', valor, grupo: grupo || '', decimalSep: decimalSep || '', decimais, sufixo };
}

/** Escreve um valor intermediario no MESMO formato do texto original. */
export function escreverNumero(forma, valor) {
  const negativo = valor < 0;
  const abs = Math.abs(valor);
  const fixo = abs.toFixed(forma.decimais);
  let [inteiro, dec] = fixo.split('.');
  if (forma.grupo) inteiro = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, forma.grupo);
  const sinal = negativo ? '-' : (forma.sinalMais ? '+' : '');
  const parteDecimal = forma.decimais ? `${forma.decimalSep}${dec}` : '';
  return `${forma.prefixo}${sinal}${inteiro}${parteDecimal}${forma.sufixo}`;
}

const facil = (t) => 1 - Math.pow(1 - t, 4); // ease-out quart: arranca rapido, pousa devagar

function noDeTextoNumerico(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let no = walker.nextNode();
  let passos = 0;
  while (no && passos < 12) {
    if (RE_NUMERO.test(no.nodeValue)) return no;
    no = walker.nextNode();
    passos += 1;
  }
  return null;
}

/**
 * Liga o motor numa raiz (a area de conteudo de um shell). Devolve a funcao que desliga.
 * Idempotente por raiz: ligar duas vezes nao cria dois observadores.
 */
export function iniciarMotorDeMovimento(raiz) {
  if (!raiz || typeof MutationObserver === 'undefined' || raiz.__motorDeMovimento) return () => {};
  if (movimentoReduzido()) return () => {};

  const estados = new WeakMap(); // no de texto -> { escrito, raf, forma }
  const memoria = new Map(); // "rota|assinatura" -> ultimo valor final (numero)
  let rotaDaMemoria = window.location.pathname;

  const assinaturaDe = (el) => {
    if (rotaDaMemoria !== window.location.pathname) {
      memoria.clear();
      rotaDaMemoria = window.location.pathname;
    }
    const todos = raiz.querySelectorAll(SELETOR_KPI);
    const indice = Array.prototype.indexOf.call(todos, el);
    // getAttribute, nao className: no <text> do SVG (rosca) className e um SVGAnimatedString
    return `${rotaDaMemoria}|${el.getAttribute('class') || ''}|${indice}`;
  };

  const animar = (no, de, forma, textoFinal, duracao) => {
    const estado = estados.get(no) || {};
    if (estado.raf) cancelAnimationFrame(estado.raf);
    const ate = forma.valor;
    // O tempo zero e o PRIMEIRO quadro, nao o performance.now() daqui: o carimbo do
    // requestAnimationFrame e o inicio do quadro, que pode ser anterior a este instante
    // em toda a duracao da tarefa longa do React que nos acordou (medido: t negativo,
    // easing abaixo de zero e "-1" na tela no meio da contagem de 0 a 2).
    let inicio = null;
    const passo = (agora) => {
      if (inicio === null) inicio = agora;
      const t = Math.max(0, Math.min(1, (agora - inicio) / duracao));
      const v = de + (ate - de) * facil(t);
      const texto = t >= 1 ? textoFinal : escreverNumero(forma, v);
      estado.escrito = texto;
      no.nodeValue = texto;
      estado.raf = t < 1 ? requestAnimationFrame(passo) : 0;
    };
    estado.forma = forma;
    estados.set(no, estado);
    estado.raf = requestAnimationFrame(passo);
  };

  const prepararElemento = (el) => {
    const no = noDeTextoNumerico(el);
    if (!no) return;
    const estado = estados.get(no);
    if (estado && estado.escrito === no.nodeValue) return; // ja e nosso
    const textoFinal = no.nodeValue;
    const forma = lerNumero(textoFinal);
    if (!forma || forma.valor === 0) return;
    const chave = assinaturaDe(el);
    const anterior = memoria.get(chave);
    memoria.set(chave, forma.valor);
    if (anterior === forma.valor) return; // remontou com o mesmo valor: nao conta de novo
    const de = typeof anterior === 'number' ? anterior : 0;
    animar(no, de, forma, textoFinal, de === 0 ? DURACAO_MS : DURACAO_TROCA_MS);
  };

  const aoMudarTexto = (no) => {
    const el = no.parentElement;
    if (!el || !el.closest(SELETOR_KPI)) return;
    const estado = estados.get(no);
    if (estado && estado.escrito === no.nodeValue) return; // escrita nossa
    const textoFinal = no.nodeValue;
    const forma = lerNumero(textoFinal);
    if (!forma) return;
    const alvo = el.closest(SELETOR_KPI);
    const chave = assinaturaDe(alvo);
    memoria.set(chave, forma.valor);
    // parte do que esta na tela (o ultimo intermediario que escrevemos), nao de zero
    const naTela = estado && estado.escrito ? lerNumero(estado.escrito) : null;
    const de = naTela ? naTela.valor : 0;
    if (de === forma.valor) return;
    animar(no, de, forma, textoFinal, de === 0 ? DURACAO_MS : DURACAO_TROCA_MS);
  };

  const varrer = (el) => {
    if (el.nodeType !== 1) return;
    if (el.matches && el.matches(SELETOR_KPI)) prepararElemento(el);
    el.querySelectorAll(SELETOR_KPI).forEach(prepararElemento);
  };

  const observador = new MutationObserver((mutacoes) => {
    for (const m of mutacoes) {
      if (m.type === 'characterData') {
        aoMudarTexto(m.target);
      } else if (m.type === 'childList') {
        // Trocou a raiz da rota (um filho direto da area de conteudo entrou): pagina
        // nova, tudo conta do zero de novo — como no video. Comparar so o pathname
        // falhava quando a pagina do meio nao tinha KPI nenhum (a memoria da rota
        // anterior sobrevivia e, na volta, "remontou com o mesmo valor" calava a contagem).
        if (m.target === raiz && m.addedNodes.length) memoria.clear();
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 1) varrer(n);
          else if (n.nodeType === 3 && n.parentElement && n.parentElement.closest(SELETOR_KPI)) {
            prepararElemento(n.parentElement.closest(SELETOR_KPI));
          }
        });
      }
    }
  });

  observador.observe(raiz, { childList: true, subtree: true, characterData: true });
  varrer(raiz); // o que ja estava na tela quando o motor ligou
  raiz.__motorDeMovimento = observador;

  return () => {
    observador.disconnect();
    delete raiz.__motorDeMovimento;
  };
}

/** Hook: liga o motor na area de conteudo enquanto o shell estiver montado. */
export function useMotorDeMovimento(ref) {
  useEffect(() => {
    const raiz = ref && ref.current;
    if (!raiz) return undefined;
    return iniciarMotorDeMovimento(raiz);
  }, [ref]);
}
