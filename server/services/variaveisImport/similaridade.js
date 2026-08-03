/**
 * Similaridade de texto para detectar variáveis técnicas duplicadas.
 *
 * O caso que motivou este módulo: "AÇO INOX" e "INOX" são a mesma coisa na
 * prática, mas Levenshtein puro dá só 50% de semelhança porque metade da string
 * some. Por isso o score combina três medidas e fica com a maior:
 *
 *   1. Levenshtein  — pega erro de digitação  ("POTENICA" ≈ "POTÊNCIA")
 *   2. Containment  — pega termo contido      ("INOX"     ⊂ "AÇO INOX")
 *   3. Jaccard      — pega reordenação        ("BOCAL SAÍDA" ≈ "SAÍDA BOCAL")
 *
 * Nada aqui decide sozinho: o score só classifica o par para o usuário revisar
 * na tela. Fusão de variável é sempre decisão humana.
 */

// Conectivos não distinguem variável ("MATERIAL DA CAMISA" x "MATERIAL CAMISA"),
// então saem antes da comparação por token para não inflarem nem afundarem o score.
const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'ou', 'a', 'o', 'as', 'os',
  'em', 'no', 'na', 'nos', 'nas', 'para', 'por', 'com', 'sem', 'ao', 'aos'
]);

// Token curto ("kW", "mm", "pol") aparece em dezenas de variáveis. Se ele
// sozinho puder fechar containment 100%, tudo vira duplicata de tudo.
const MIN_CHARS_TOKEN_SIGNIFICATIVO = 3;

/**
 * Reduz o texto ao seu núcleo comparável: sem acento, sem caixa, sem pontuação.
 * "Potência  Motor/Central [kW]" -> "potencia motor central kw"
 */
function normalizar(texto) {
  return String(texto == null ? '' : texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Tokens significativos (sem conectivos). Cai para a lista crua se só sobrar conectivo. */
function tokenizar(texto) {
  const brutos = normalizar(texto).split(' ').filter(Boolean);
  const uteis = brutos.filter((t) => !STOPWORDS.has(t));
  return uteis.length > 0 ? uteis : brutos;
}

/** Distância de edição clássica, com duas linhas em vez de matriz cheia. */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let anterior = new Array(b.length + 1);
  let atual = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) anterior[j] = j;

  for (let i = 1; i <= a.length; i++) {
    atual[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(
        atual[j - 1] + 1,      // inserção
        anterior[j] + 1,       // remoção
        anterior[j - 1] + custo // substituição
      );
    }
    const troca = anterior; anterior = atual; atual = troca;
  }
  return anterior[b.length];
}

/** Levenshtein em escala 0..1, onde 1 é idêntico. */
function razaoLevenshtein(a, b) {
  const maior = Math.max(a.length, b.length);
  if (maior === 0) return 1;
  return 1 - levenshtein(a, b) / maior;
}

/**
 * Dois tokens contam como o mesmo se forem iguais, se um for prefixo do outro
 * (INOX / INOXIDAVEL) ou se diferirem por um erro de digitação.
 */
function tokensEquivalentes(a, b) {
  if (a === b) return true;
  const menor = a.length <= b.length ? a : b;
  const maior = a.length <= b.length ? b : a;
  if (menor.length >= 4 && maior.startsWith(menor)) return true;
  if (menor.length >= 4 && razaoLevenshtein(a, b) >= 0.85) return true;
  return false;
}

/** Quantos tokens do conjunto menor têm equivalente no maior. */
function contarIntersecao(tokensA, tokensB) {
  const disponiveis = tokensB.slice();
  let n = 0;
  tokensA.forEach((ta) => {
    const idx = disponiveis.findIndex((tb) => tokensEquivalentes(ta, tb));
    if (idx !== -1) {
      disponiveis.splice(idx, 1); // consome para não casar duas vezes
      n++;
    }
  });
  return n;
}

/**
 * Score 0..1 entre dois nomes de variável.
 * Devolve também as parcelas, para a tela poder explicar o porquê ao usuário.
 */
function compararTextos(textoA, textoB) {
  const normA = normalizar(textoA);
  const normB = normalizar(textoB);

  if (!normA || !normB) {
    return { score: 0, exato: false, levenshtein: 0, containment: 0, jaccard: 0 };
  }
  if (normA === normB) {
    return { score: 1, exato: true, levenshtein: 1, containment: 1, jaccard: 1 };
  }

  const tokensA = tokenizar(textoA);
  const tokensB = tokenizar(textoB);
  const intersecao = contarIntersecao(tokensA, tokensB);
  const menorTamanho = Math.min(tokensA.length, tokensB.length);
  const uniao = tokensA.length + tokensB.length - intersecao;

  const lev = razaoLevenshtein(normA, normB);
  const jaccard = uniao > 0 ? intersecao / uniao : 0;

  // Containment: o conjunto menor cabe inteiro no maior?
  let containment = menorTamanho > 0 ? intersecao / menorTamanho : 0;
  const tokensMenores = tokensA.length <= tokensB.length ? tokensA : tokensB;
  const carregaSignificado = tokensMenores.some((t) => t.length >= MIN_CHARS_TOKEN_SIGNIFICATIVO);
  if (!carregaSignificado) containment = 0;

  // Containment fica logo abaixo de 1: "INOX" dentro de "AÇO INOX" é forte
  // indício de duplicata, mas não é a mesma prova que igualdade literal.
  const score = Math.max(lev, containment * 0.95, jaccard);

  return {
    score: Math.round(score * 1000) / 1000,
    exato: false,
    levenshtein: Math.round(lev * 1000) / 1000,
    containment: Math.round(containment * 1000) / 1000,
    jaccard: Math.round(jaccard * 1000) / 1000
  };
}

/**
 * Procura candidatos parecidos com `alvo` dentro de `candidatos`.
 *
 * @param {string} alvo               nome vindo da planilha
 * @param {Array<{nome:string}>} candidatos  variáveis já cadastradas
 * @param {object} [opcoes]
 * @param {number} [opcoes.limiar=0.8] score mínimo para entrar no resultado
 * @param {number} [opcoes.limite=5]   máximo de sugestões
 * @returns {Array} candidatos com `similaridade` e `percentual`, do mais parecido ao menos
 */
function encontrarSimilares(alvo, candidatos, opcoes) {
  const cfg = opcoes || {};
  const limiar = typeof cfg.limiar === 'number' ? cfg.limiar : 0.8;
  const limite = typeof cfg.limite === 'number' ? cfg.limite : 5;

  const achados = [];
  (candidatos || []).forEach((cand) => {
    const nomeCand = cand && cand.nome != null ? cand.nome : cand;
    const cmp = compararTextos(alvo, nomeCand);
    if (cmp.score >= limiar) {
      achados.push(Object.assign({}, cand, {
        similaridade: cmp.score,
        percentual: Math.round(cmp.score * 100),
        detalhe: cmp
      }));
    }
  });

  achados.sort((a, b) => b.similaridade - a.similaridade);
  return achados.slice(0, limite);
}

module.exports = {
  normalizar,
  tokenizar,
  levenshtein,
  razaoLevenshtein,
  compararTextos,
  encontrarSimilares,
  STOPWORDS
};
