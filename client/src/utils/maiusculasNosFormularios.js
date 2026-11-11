/**
 * Etapa 210 (RN-210.01 a RN-210.03) — os textos dos formularios em MAIUSCULAS, ao digitar e ao colar.
 *
 * Pedido da empresa: tudo o que se escreve nos formularios fica em maiusculo ("são joão" -> "SÃO JOÃO").
 *
 * POR QUE AQUI, E NAO TELA A TELA
 * -------------------------------
 * Sao 141 arquivos de tela com campo de texto. Mexer em cada `onChange` e caro e esquecivel: a tela
 * de amanha nasceria minuscula. Como os utilitarios do celular, a regra mora num ouvinte so e vale
 * para o que ainda nem existe.
 *
 * COMO
 * ----
 * Um ouvinte de `input` no `document`, na fase de CAPTURA: roda antes do React 18, que escuta no
 * `#root`. Ele sobe o valor e o React le o valor ja subido — o estado da tela recebe o maiusculo.
 * O valor e trocado pelo setter NATIVO do prototipo: `el.value = x` atualizaria o rastreador de
 * valor do React, que acharia que nada mudou e nao chamaria o `onChange`.
 * A selecao volta ao lugar (corrigir no meio do texto nao pula o cursor para o fim — foi o motivo
 * de o fornecedor, na Compras 192, ter ficado so com CSS).
 * Teclado de celular que monta a palavra (composicao) nao e tocado no meio: a palavra sobe ao
 * fechar (`compositionend`). Ate la o CSS da classe `maiusculas-ao-digitar` (posta no foco) mostra
 * em maiusculo.
 *
 * O QUE FICA FORA (RN-210.02)
 * ---------------------------
 * Nao texto (numero, data, arquivo...), e-mail, senha, site, token; caixas de busca e filtro (nao
 * sao dado gravado); o editor da proposta (nao e campo); e quem estiver dentro de
 * `[data-sem-maiusculas]` (o chat, e a saida para casos futuros).
 */

const LOCALE = 'pt-BR';
const CLASSE_FOCO = 'maiusculas-ao-digitar';

// type ausente ou invalido le como 'text' na propriedade `type`
const TIPOS_DE_TEXTO = new Set(['text']);

// nome, id ou autocomplete que dizem "isto nao e texto livre"
const NOME_FORA = /e-?mail|senha|password|passwd|\burl\b|url_|_url|site|link|token|api_?key|\bhost\b|smtp|username|login/i;

// a busca/o filtro nao e gravado, e o servidor ja ignora a caixa (Etapa 159)
// (o ultimo: placeholder que e um endereco, "smtp.gmail.com")
const PLACEHOLDER_FORA = /^\s*(buscar|busca|pesquisar|pesquisa|procurar|filtrar|filtro)\b|@|https?:\/\/|^\s*[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}\s*$/i;

/** O campo `el` deve subir para maiusculas? */
export function campoVaiEmMaiusculas(el) {
  if (!el || el.readOnly || el.disabled) return false;
  const tag = el.tagName;
  if (tag === 'INPUT') {
    if (!TIPOS_DE_TEXTO.has(el.type)) return false;
  } else if (tag !== 'TEXTAREA') {
    return false;
  }
  if (el.closest && el.closest('[data-sem-maiusculas]')) return false;
  const nomes = [el.name, el.id, el.getAttribute('autocomplete')].filter(Boolean).join(' ');
  if (nomes && NOME_FORA.test(nomes)) return false;
  const ph = el.getAttribute('placeholder');
  if (ph && PLACEHOLDER_FORA.test(ph)) return false;
  return true;
}

function setterNativo(el) {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  return Object.getOwnPropertyDescriptor(proto, 'value').set;
}

/**
 * Sobe o valor do campo, mantendo a selecao. Devolve true se trocou.
 * O cursor e recontado pelo prefixo subido: "ß" vira "SS" e muda o comprimento.
 */
export function subirValor(el) {
  const v = el.value;
  if (!v) return false;
  const up = v.toLocaleUpperCase(LOCALE);
  if (up === v) return false;
  let ini = null;
  let fim = null;
  try {
    ini = el.selectionStart;
    fim = el.selectionEnd;
  } catch (e) { /* tipo sem selecao */ }
  setterNativo(el).call(el, up);
  if (ini != null && fim != null) {
    const novoIni = v.slice(0, ini).toLocaleUpperCase(LOCALE).length;
    const novoFim = v.slice(0, fim).toLocaleUpperCase(LOCALE).length;
    try { el.setSelectionRange(novoIni, novoFim); } catch (e) { /* idem */ }
  }
  return true;
}

function aoDigitar(e) {
  const el = e.target;
  if (e.isComposing || !campoVaiEmMaiusculas(el)) return;
  subirValor(el);
}

function aoFecharComposicao(e) {
  const el = e.target;
  if (!campoVaiEmMaiusculas(el)) return;
  // o input da composicao ja passou (com isComposing): um novo leva o valor subido ao React
  if (subirValor(el)) el.dispatchEvent(new Event('input', { bubbles: true }));
}

function aoFocar(e) {
  if (campoVaiEmMaiusculas(e.target)) e.target.classList.add(CLASSE_FOCO);
}

function aoSair(e) {
  if (e.target && e.target.classList) e.target.classList.remove(CLASSE_FOCO);
}

let iniciado = false;

/** Liga a regra no documento inteiro. Chamar uma vez, no `index.js`. Devolve a funcao que desliga (testes). */
export function iniciarMaiusculasNosFormularios(doc = document) {
  if (iniciado) return () => {};
  iniciado = true;
  doc.addEventListener('input', aoDigitar, true);
  doc.addEventListener('compositionend', aoFecharComposicao, true);
  doc.addEventListener('focusin', aoFocar, true);
  doc.addEventListener('focusout', aoSair, true);
  return () => {
    doc.removeEventListener('input', aoDigitar, true);
    doc.removeEventListener('compositionend', aoFecharComposicao, true);
    doc.removeEventListener('focusin', aoFocar, true);
    doc.removeEventListener('focusout', aoSair, true);
    iniciado = false;
  };
}
