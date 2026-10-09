/**
 * Etapa 96 (Fase 5, testes 2) — a varredura do codigo-fonte da RN-01: nenhuma escrita incremental de coluna de
 * quantidade fora de `Q.qtdSql(...)`.
 *
 * A versao da T1/T2 era uma regex POR LINHA que excluia a linha inteira se ela tivesse um `Q.qtdSql(` (a escrita crua
 * ao lado de uma embrulhada passava), nao via escrita quebrada em duas linhas, so conhecia `COALESCE(col,0)` sem espaco
 * e `col ± ?` nessa ordem, e a lista de colunas era escrita a mao (sem `quantidade_atendida`). Esta:
 *   - le o arquivo INTEIRO (a atribuicao pode atravessar linhas);
 *   - apaga so o TRECHO dentro de `Q.qtdSql(...)` (parenteses balanceados), nao a linha;
 *   - acha cada atribuicao `<coluna> = <expressao>` (a expressao vai ate a virgula de nivel 0, WHERE/RETURNING, ou o
 *     fim da string) e a acusa se ela tem um parametro (`?` ou `${...}`), um `+`/`-` e cita uma coluna de quantidade —
 *     qualquer forma: IFNULL, COALESCE com espaco ou `0.0`, `? + col`, `(col - ?)`, MAX(0,col-?), CAST(? AS REAL);
 *   - as colunas vem de COLUNAS_LEGADO (quantidadeLegado.js), a mesma lista do script.
 * Linhas de comentario inteiras (`//`, `*`, `/*`) sao ignoradas.
 */
const { COLUNAS_LEGADO } = require('../../services/almoxarifado/quantidadeLegado');

const COLUNAS = [...new Set(COLUNAS_LEGADO.map((c) => c.coluna))].sort((a, b) => b.length - a.length);
const RE_COL = new RegExp(`\\b(?:${COLUNAS.join('|')})\\b`, 'i');

/** Apaga o argumento de cada `Q.qtdSql(` (balanceado); `${Q.qtdSql(...)}` inteiro vira um marcador sem parametro. */
function semQtdSql(texto) {
  let out = '';
  let i = 0;
  const abre = 'Q.qtdSql(';
  for (;;) {
    const k = texto.indexOf(abre, i);
    if (k < 0) { out += texto.slice(i); break; }
    let j = k + abre.length; let prof = 1;
    while (j < texto.length && prof > 0) {
      if (texto[j] === '(') prof++;
      else if (texto[j] === ')') prof--;
      j++;
    }
    if (prof !== 0) { out += texto.slice(i); break; } // desbalanceado: deixa como esta
    let ini = k; let fim = j;
    if (texto.slice(k - 2, k) === '${' && texto[j] === '}') { ini = k - 2; fim = j + 1; }
    out += `${texto.slice(i, ini)}__QTD__${'\n'.repeat(texto.slice(ini, fim).split('\n').length - 1)}`; // mantem a linha
    i = fim;
  }
  return out;
}

/** `[{ linha, trecho }]` das escritas cruas no texto. */
function escritasCruas(fonte) {
  const texto = semQtdSql(fonte.split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l)).join('\n'));
  const re = new RegExp(`\\b(?:${COLUNAS.join('|')})\\s*=(?!=)`, 'gi');
  const achados = [];
  let m;
  while ((m = re.exec(texto))) {
    const antes = texto[m.index - 1];
    if (antes === '.' || antes === '!' || antes === '<' || antes === '>') continue;
    let j = m.index + m[0].length; let prof = 0; let expr = '';
    while (j < texto.length) {
      const c = texto[j];
      if (prof === 0 && (c === ',' || c === '`' || c === "'" || c === '"' || c === ';')) break;
      if (prof === 0 && /^\s+(WHERE|RETURNING)\b/i.test(texto.slice(j, j + 12))) break;
      if (c === '(') prof++;
      if (c === ')') { if (prof === 0) break; prof--; }
      expr += c; j++;
    }
    if (/\?|\$\{/.test(expr) && /[+-]/.test(expr) && RE_COL.test(expr)) {
      achados.push({ linha: texto.slice(0, m.index).split('\n').length, trecho: `${m[0]}${expr}`.replace(/\s+/g, ' ').trim() });
    }
  }
  return achados;
}

/** Quantas chamadas `Q.qtdSql(` o arquivo tem — prova de que a varredura leu o arquivo certo. */
function embrulhadas(fonte) {
  return fonte.split('Q.qtdSql(').length - 1;
}

module.exports = { COLUNAS, escritasCruas, embrulhadas, semQtdSql };
