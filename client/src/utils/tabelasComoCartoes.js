/**
 * TABELAS VIRAM CARTÕES DE APLICATIVO — automaticamente, em qualquer tela.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * POR QUE ISTO EXISTE
 *
 * Uma varredura no front inteiro encontrou 52 tabelas sem nenhuma alternativa
 * para o celular — Relatórios com 30 colunas, Financeiro com 27, Conferência de
 * Estoque com 23. No telefone elas viram rolagem lateral e nada fica legível.
 *
 * Escrever 52 listas à mão não é trabalho grande: é trabalho ERRADO. Seriam 52
 * cópias do mesmo padrão, e no primeiro mês uma regra mudaria só em algumas.
 * Pior: toda tela nova nasceria quebrada de novo.
 *
 * Então a conversão é automática e vale para o que existe hoje E para o que
 * ainda vai ser escrito. Um módulo novo com uma tabela comum não precisa fazer
 * nada para ter cartão decente no celular.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O QUE MUDOU NESTA VERSÃO
 *
 * A versão anterior copiava o nome da coluna para `data-label` e o CSS
 * desenhava "RÓTULO: valor", uma linha por coluna. Funcionava, mas o P.O.
 * reprovou com razão: com nove colunas tudo tem o mesmo peso, e um cartão sem
 * hierarquia não é mais escaneável que a tabela.
 *
 * Agora cada coluna recebe também um PAPEL (`data-papel`), deduzido do
 * conteúdo, e o CSS monta a hierarquia que a lista de propostas tem à mão:
 *
 *     foto      miniatura à esquerda
 *     id        código pequeno, em cima
 *     situacao  pílula colorida no canto
 *     titulo    o nome, em negrito — a âncora do cartão
 *     valor     o número que decide, grande
 *     meta      o resto, em voz baixa, ainda com o rótulo da coluna
 *     acoes     os botões, embaixo, separados por uma divisória
 *
 * NADA É MOVIDO NO DOM. Os papéis viram atributos e o CSS reordena com
 * `order`. Isso é deliberado: mover um <td> que contém um <button> de React
 * arriscaria os eventos e o estado. Atributo é inerte.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * A REGRA DE SEGURANÇA
 *
 * Quando as heurísticas não encontram um título com confiança, a tabela recebe
 * apenas o comportamento ANTIGO (rótulo: valor). E quando nem isso é possível
 * — tabela sem cabeçalho, por exemplo — ela não recebe classe nenhuma e segue
 * rolando de lado, como hoje. Nunca fica pela metade.
 *
 * Uma tela que queira ficar de fora declara `data-sem-cartoes` na tabela.
 */

const LARGURA_CELULAR = 768;
const CLASSE = 'tabela-cartoes';
const CLASSE_RICA = 'tabela-cartoes-rica';

const ehCelular = () => window.matchMedia(`(max-width: ${LARGURA_CELULAR}px)`).matches;

/** Texto limpo: sem quebras, sem espaço duplicado. */
const limpo = (el) => ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();

// ── Detectores ──────────────────────────────────────────────────────────────
// Cada um responde uma pergunta simples sobre UMA célula. Ficam separados de
// propósito: quando um errar, dá para corrigir o detector sem mexer no resto.

/** Moeda: "R$ 1.234,56". */
const ehValor = (txt) => /^R\$\s?[\d.,]+$/.test(txt);

/** Percentual curto: "18%", "5,5%". */
const ehPercentual = (txt) => /^[\d.,]+\s?%$/.test(txt);

/** Data em formato brasileiro, com ou sem hora. */
const ehData = (txt) => /^\d{2}\/\d{2}\/\d{4}(\s+\d{2}:\d{2})?$/.test(txt);

/**
 * Código/identificador: curto, sem espaço, com pelo menos um dígito.
 * Pega "138-01-AJ-2026-REV00", "60-01-DHY-10-01", "#4821", "OS-1234".
 * Não pega "Disco dispersor" (tem espaço) nem "Ativo" (não tem dígito).
 */
const ehIdentificador = (txt) => (
  txt.length > 0 && txt.length <= 28 && !/\s/.test(txt) && /\d/.test(txt)
);

/** A célula é só uma imagem? (miniatura de produto, avatar de cliente) */
function ehFoto(td) {
  if (!td.querySelector('img')) return false;
  return limpo(td).length <= 2;   // "—" de placeholder conta como vazio
}

/**
 * A célula é a de ações? Um ou mais controles e pouquíssimo texto.
 * O corte por texto importa: um <td> com um link "Ver detalhes" é conteúdo,
 * não barra de ações.
 */
function ehAcoes(td) {
  const controles = td.querySelectorAll('button, a, [role="button"]');
  if (controles.length === 0) return false;
  return limpo(td).length <= 24;
}

/**
 * A célula é um selo de situação? Vale por marcação (a tela já desenhou uma
 * pílula) ou pelo nome da coluna.
 */
function ehSituacao(td, rotulo) {
  if (td.querySelector('[class*="badge"], [class*="status"], [class*="selo"], [class*="pill"], [class*="tag"], [class*="chip"]')) {
    return true;
  }
  return /^(status|situa|estado|ativo)/i.test(rotulo) && limpo(td).length <= 24;
}

/**
 * Escolhe a coluna que vira TÍTULO.
 *
 * Critério: entre as primeiras colunas, a que tem o texto mais longo e que não
 * é número, data, código, selo nem ações. É o nome do registro — "Disco
 * dispersor de laboratório", "CARVALHO E CARVALHO TINTAS LTDA".
 *
 * Só as primeiras 5 colunas concorrem: em tabela larga, uma observação lá no
 * fim costuma ser a célula mais longa, e ela não é o nome da coisa.
 */
function escolherTitulo(papeisPorColuna, amostras) {
  let melhor = -1;
  let maior = 0;
  const limite = Math.min(amostras.length, 5);
  for (let i = 0; i < limite; i += 1) {
    if (papeisPorColuna[i]) continue;          // já tem papel definido
    const txt = amostras[i] || '';
    if (txt.length < 3) continue;
    if (ehValor(txt) || ehPercentual(txt) || ehData(txt) || ehIdentificador(txt)) continue;
    if (txt.length > maior) { maior = txt.length; melhor = i; }
  }
  return melhor;
}

/**
 * Decide o papel de cada coluna a partir da PRIMEIRA linha de dados.
 *
 * Uma linha só basta e é de propósito: as linhas de uma tabela têm a mesma
 * forma, e varrer todas custaria caro numa lista de centenas sem mudar a
 * conclusão.
 */
function deduzirPapeis(cabecalhos, primeiraLinha) {
  const celulas = Array.from(primeiraLinha.children).filter((c) => c.tagName === 'TD');
  const papeis = new Array(celulas.length).fill(null);
  const amostras = celulas.map(limpo);

  celulas.forEach((td, i) => {
    const rotulo = cabecalhos[i] || '';
    if (ehFoto(td)) papeis[i] = 'foto';
    else if (ehAcoes(td)) papeis[i] = 'acoes';
    else if (ehSituacao(td, rotulo)) papeis[i] = 'situacao';
  });

  // Identificador: só o PRIMEIRO que aparecer nas duas primeiras colunas de
  // texto. Sem esse corte, uma tabela cheia de códigos viraria um cartão só de
  // etiquetas miúdas, sem nada em destaque.
  for (let i = 0; i < Math.min(celulas.length, 3); i += 1) {
    if (papeis[i]) continue;
    if (ehIdentificador(amostras[i])) { papeis[i] = 'id'; break; }
  }

  const iTitulo = escolherTitulo(papeis, amostras);
  if (iTitulo >= 0) papeis[iTitulo] = 'titulo';

  // Valor: o primeiro em moeda. Os demais viram meta — numa tabela com preço,
  // desconto e total, promover os três a destaque não destaca nada.
  for (let i = 0; i < celulas.length; i += 1) {
    if (papeis[i]) continue;
    if (ehValor(amostras[i])) { papeis[i] = 'valor'; break; }
  }

  for (let i = 0; i < celulas.length; i += 1) {
    if (!papeis[i]) papeis[i] = 'meta';
  }

  return { papeis, temTitulo: iTitulo >= 0 };
}

function rotularTabela(tabela) {
  if (tabela.hasAttribute('data-sem-cartoes')) return;

  const cabecalhos = Array.from(tabela.querySelectorAll('thead th')).map(limpo);

  // Sem cabeçalho não há rótulo para dar — e cartão sem rótulo é pior que a
  // tabela. Nesse caso ela fica como está e continua rolando de lado.
  if (cabecalhos.length === 0 || cabecalhos.every((c) => c === '')) return;

  const linhas = tabela.querySelectorAll('tbody tr');
  if (linhas.length === 0) return;

  // A primeira linha COM DADOS. A linha de "nenhum resultado" usa colSpan e
  // tem uma célula só; deduzir papéis a partir dela produziria lixo.
  const linhaModelo = Array.from(linhas).find(
    (l) => Array.from(l.children).filter((c) => c.tagName === 'TD').length > 1,
  );
  if (!linhaModelo) return;

  const { papeis, temTitulo } = deduzirPapeis(cabecalhos, linhaModelo);

  let rotulou = false;
  linhas.forEach((linha) => {
    const celulas = Array.from(linha.children).filter((c) => c.tagName === 'TD');
    if (celulas.length <= 1) return;   // linha de "nenhum resultado"

    celulas.forEach((td, i) => {
      const rotulo = cabecalhos[i];
      if (rotulo && td.getAttribute('data-label') !== rotulo) {
        td.setAttribute('data-label', rotulo);
      }
      const papel = papeis[i];
      if (papel && td.getAttribute('data-papel') !== papel) {
        td.setAttribute('data-papel', papel);
      }
      if (rotulo) rotulou = true;
    });
  });

  if (!rotulou) return;

  tabela.classList.add(CLASSE);
  // A hierarquia rica só entra quando existe um título de verdade. Sem ele o
  // cartão não tem âncora, e o comportamento antigo (rótulo: valor) é melhor
  // do que um monte de linhas soltas sem nada em destaque.
  tabela.classList.toggle(CLASSE_RICA, temTitulo);
}

/**
 * Passa a tabela (ou a arvore inteira) pela conversao, agora.
 *
 * Exportada porque `iniciarTabelasComoCartoes` guarda estado de modulo e, da
 * segunda chamada em diante, nao faz nada — e porque o MutationObserver
 * entrega em microtarefa, depois de o teste ja ter conferido o resultado.
 * Com isto o teste mede o que a funcao FAZ, e nao o tempo do observador.
 */
export function varrerTabelas(raiz = document) {
  if (!ehCelular()) return;
  const alvos = raiz.querySelectorAll ? raiz.querySelectorAll('table') : [];
  alvos.forEach(rotularTabela);
}

let observador = null;
let agendado = null;

function agendarVarredura() {
  if (agendado) return;
  // Agrupa rajadas de mutação num passe só. Sem isto, uma lista que renderiza
  // cem linhas dispararia cem varreduras.
  agendado = window.requestAnimationFrame(() => {
    agendado = null;
    varrerTabelas(document);
  });
}

export function iniciarTabelasComoCartoes() {
  if (observador) return;

  varrerTabelas(document);

  observador = new MutationObserver((mutacoes) => {
    const mexeuNaArvore = mutacoes.some(
      (m) => m.type === 'childList' && m.addedNodes.length,
    );
    if (mexeuNaArvore) agendarVarredura();
  });
  observador.observe(document.body, { childList: true, subtree: true });

  // Girar o aparelho pode cruzar o limite de 768px nos dois sentidos.
  window.addEventListener('resize', agendarVarredura);
  window.addEventListener('orientationchange', agendarVarredura);
}

export default iniciarTabelasComoCartoes;
