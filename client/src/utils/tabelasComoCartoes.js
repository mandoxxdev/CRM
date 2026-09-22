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
const CLASSE_LINHA = 'cartao-auto';
const CLASSE_GRADE = 'grade-cartoes';

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

const ROTULO_FOTO = /^(foto|imagem|img|logo|avatar|miniatura)\b/i;

/**
 * A célula é só uma imagem? (miniatura de produto, avatar de cliente)
 *
 * O nome da coluna conta, e não só a presença de `<img>`. Quando o material
 * ainda não tem foto, a tela desenha um PLACEHOLDER — uma caixa com ícone,
 * sem `<img>` nenhum. A versão anterior exigia a tag, então essa célula caía
 * no papel `meta` e virava uma faixa inteira escrita "FOTO" com um quadrado
 * cinza dentro: 72px de cartão medidos, para não dizer nada.
 */
function ehFoto(td, rotulo) {
  if (limpo(td).length > 2) return false;      // tem texto: não é miniatura
  if (td.querySelector('img')) return true;
  return ROTULO_FOTO.test((rotulo || '').trim());
}

/**
 * O conteúdo desta célula é "nada"?
 *
 * Um traço não é informação. Na lista de materiais, "LOCALIZAÇÃO —" ocupava
 * uma linha do cartão para comunicar ausência, e o cartão do celular não tem
 * espaço para isso: quem precisa saber que falta endereço abre o material.
 *
 * Controles e imagens nunca contam como vazio — um `<td>` com só um botão é
 * ação, não buraco.
 */
const SEM_CONTEUDO = /^(—|–|-|n\/a|na|null|undefined|não informado|nao informado)$/i;

function pareceVazio(td) {
  if (td.querySelector('img, input, select, textarea, button, a[href], [role="button"]')) {
    return false;
  }
  const txt = limpo(td);
  return txt === '' || SEM_CONTEUDO.test(txt);
}

/**
 * Um rótulo curto para um botão que só tem ícone.
 *
 * Os oito botões do cartão de materiais trazem `title`, então o leitor de
 * tela os anuncia — mas quem OLHA a tela vê oito quadrados iguais. Era a
 * queixa do P.O.: o cartão não diz o que faz.
 *
 * O `title` costuma ser uma frase ("Entrada rápida de estoque neste
 * material"). Aqui ela vira etiqueta: junto palavras enquanto couber em 14
 * caracteres e descarto preposição solta no fim, que ficaria pendurada
 * ("Plano de" → "Plano").
 */
const PALAVRA_SOLTA = /^(de|do|da|dos|das|o|a|os|as|no|na|em|para|com|este|esta|deste|desta|neste|nesta)$/i;

export function rotuloCurto(titulo, limite = 14) {
  const palavras = String(titulo || '').trim().split(/\s+/).filter(Boolean);
  if (!palavras.length) return '';
  const escolhidas = [];
  let tamanho = 0;
  for (const p of palavras) {
    const custo = escolhidas.length ? p.length + 1 : p.length;
    if (tamanho + custo > limite && escolhidas.length) break;
    escolhidas.push(p);
    tamanho += custo;
  }
  while (escolhidas.length > 1 && PALAVRA_SOLTA.test(escolhidas[escolhidas.length - 1])) {
    escolhidas.pop();
  }
  return escolhidas.join(' ');
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
  const txt = limpo(td);

  // Um CODIGO nunca e situacao, por mais que esteja dentro de uma pilula.
  // Caso real: `<span class="msc-pill">#4821</span>` na coluna ID de Minhas
  // Solicitacoes. A classe casa com "pill", e sem esta linha o numero da
  // solicitacao era promovido a selo de status — dois selos no mesmo cartao,
  // brigando pelo canto direito, e o codigo sumindo do lugar dele.
  if (ehIdentificador(txt)) return false;

  if (td.querySelector('[class*="badge"], [class*="status"], [class*="selo"], [class*="pill"], [class*="tag"], [class*="chip"]')) {
    return true;
  }
  return /^(status|situa|estado|ativo)/i.test(rotulo) && txt.length <= 24;
}

/* ── Contraste do selo de situação ─────────────────────────────────────────
 *
 * Os selos de estado ("aprovado", "pendente", "ativo") costumam ser pintados
 * em JAVASCRIPT, com a mesma cor servindo de letra e de fundo a ~12%:
 *
 *     style="background-color: rgba(46,204,113,.125); color: rgb(46,204,113)"
 *
 * Medido em `/compras/pedidos`: 1,87 de contraste, quando texto pequeno pede
 * 4,5. O mesmo padrão aparece no Almoxarifado, na Produção, na Frota e no
 * Comercial — lá dá para corrigir no CSS porque a cor está numa classe. Aqui
 * ela está no atributo `style`, calculada em tempo de execução, e nenhum
 * seletor alcança.
 *
 * Então a correção mora onde a cor pode ser LIDA. Escurece-se (ou clareia-se)
 * a letra mantendo o matiz, até passar de 4,5. O fundo não muda: a cor de
 * estado continua sendo a cor de estado, e a tela não muda de cara.
 */
const ALVO_CONTRASTE = 4.5;

function canal(cor) {
  const m = String(cor || '').match(/[\d.]+/g);
  if (!m || m.length < 3) return null;
  return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] };
}

function luminancia({ r, g, b }) {
  const f = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contraste(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Cor de fundo realmente pintada atrás do elemento, ou null se houver imagem. */
export function fundoAtras(el) {
  const pilha = [];
  for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
    const c = getComputedStyle(p);
    if (c.backgroundImage && c.backgroundImage !== 'none') return null;
    const cor = canal(c.backgroundColor);
    if (cor && cor.a > 0) {
      pilha.push(cor);
      if (cor.a >= 0.999) break;
    }
  }
  if (!pilha.length) return null;
  const base = pilha[pilha.length - 1];
  if (base.a < 0.999) return null;
  let out = base;
  for (let i = pilha.length - 2; i >= 0; i -= 1) {
    const t = pilha[i];
    out = {
      r: t.r * t.a + out.r * (1 - t.a),
      g: t.g * t.a + out.g * (1 - t.a),
      b: t.b * t.a + out.b * (1 - t.a),
      a: 1,
    };
  }
  return out;
}

/**
 * Deixa a letra legível sobre o próprio fundo, preservando o matiz.
 *
 * Caminha em direção ao preto (fundo claro) ou ao branco (fundo escuro) em
 * passos de 6%, e para no primeiro que passa. Vinte passos bastam para ir de
 * ponta a ponta; se nem assim passar, deixa como estava — é melhor do que
 * entregar um cinza sem significado.
 */
export function corLegivel(corTexto, corFundo) {
  const t = canal(corTexto);
  const f = canal(corFundo);
  if (!t || !f) return null;
  if (contraste(t, f) >= ALVO_CONTRASTE) return null;

  const paraPreto = luminancia(f) > 0.4;
  const alvo = paraPreto ? 0 : 255;
  let atual = { ...t };
  for (let i = 0; i < 20; i += 1) {
    atual = {
      r: atual.r + (alvo - atual.r) * 0.06,
      g: atual.g + (alvo - atual.g) * 0.06,
      b: atual.b + (alvo - atual.b) * 0.06,
    };
    if (contraste(atual, f) >= ALVO_CONTRASTE) {
      return `rgb(${Math.round(atual.r)}, ${Math.round(atual.g)}, ${Math.round(atual.b)})`;
    }
  }
  return null;
}

/** Aplica `corLegivel` aos selos pintados em JS dentro da célula. */
function corrigirContrasteDoSelo(celula) {
  const selos = celula.querySelectorAll('[style*="color"]');
  const todos = celula.getAttribute('style') && /color/.test(celula.getAttribute('style'))
    ? [celula, ...selos]
    : [...selos];
  todos.forEach((el) => {
    const fundo = fundoAtras(el);
    if (!fundo) return;
    const nova = corLegivel(getComputedStyle(el).color, `rgb(${fundo.r},${fundo.g},${fundo.b})`);
    // `setProperty` com prioridade porque a cor original também é inline: sem
    // isso, o próximo render do React devolve a ilegível por cima.
    if (nova) el.style.setProperty('color', nova, 'important');
  });
}

/**
 * Marca (ou desmarca) a célula sem conteúdo, para o CSS escondê-la.
 *
 * É por CÉLULA e não por coluna: um material tem endereço, o outro não, e a
 * decisão muda a cada linha. Desmarcar importa tanto quanto marcar — a lista
 * recarrega com dados novos e a célula que estava vazia pode deixar de estar.
 */
function marcarVazio(td) {
  const vazio = pareceVazio(td);
  if (vazio && td.getAttribute('data-vazio') !== '1') {
    td.setAttribute('data-vazio', '1');
  } else if (!vazio && td.hasAttribute('data-vazio')) {
    td.removeAttribute('data-vazio');
  }
}

/**
 * Dá nome visível aos botões que só têm ícone, copiando do `title`.
 *
 * O CSS desenha `attr(data-rotulo)` embaixo do ícone. Não mexo no conteúdo
 * do botão: ele é de React, e inserir um nó lá dentro seria desfeito no
 * próximo render — e pior, poderia atrapalhar o clique.
 */
function rotularBotoes(celula) {
  const botoes = celula.querySelectorAll('button[title], a[href][title], [role="button"][title]');
  botoes.forEach((b) => {
    if (limpo(b)) return;                       // já mostra texto próprio
    const curto = rotuloCurto(b.getAttribute('title'));
    if (curto && b.getAttribute('data-rotulo') !== curto) {
      b.setAttribute('data-rotulo', curto);
    }
  });
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
  // Numa <table> so <td> conta; numa pseudo-tabela de <div>, todo filho direto
  // e uma celula. A mesma funcao serve aos dois, e e o que garante que os dois
  // formatos recebam EXATAMENTE a mesma hierarquia.
  const filhos = Array.from(primeiraLinha.children);
  const celulas = filhos.some((c) => c.tagName === 'TD')
    ? filhos.filter((c) => c.tagName === 'TD')
    : filhos;
  const papeis = new Array(celulas.length).fill(null);
  const amostras = celulas.map(limpo);

  let jaTemSituacao = false;
  celulas.forEach((td, i) => {
    const rotulo = cabecalhos[i] || '';
    if (ehFoto(td, rotulo)) papeis[i] = 'foto';
    else if (ehAcoes(td)) papeis[i] = 'acoes';
    else if (!jaTemSituacao && ehSituacao(td, rotulo)) {
      // Apenas a PRIMEIRA. Duas pilulas no canto direito se sobrepoem, e um
      // cartao com dois "destaques" de situacao nao destaca nenhum.
      papeis[i] = 'situacao';
      jaTemSituacao = true;
    }
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
      marcarVazio(td);
      if (papel === 'acoes') rotularBotoes(td);
      if (papel === 'situacao') corrigirContrasteDoSelo(td);
      if (rotulo) rotulou = true;
    });
  });

  if (!rotulou) return;

  tabela.classList.add(CLASSE);
  // A hierarquia rica só entra quando existe um título de verdade. Sem ele o
  // cartão não tem âncora, e o comportamento antigo (rótulo: valor) é melhor
  // do que um monte de linhas soltas sem nada em destaque.
  tabela.classList.toggle(CLASSE_RICA, temTitulo);

  // `cartao-auto` é o gancho ÚNICO do CSS, usado tanto pelas linhas de <table>
  // quanto pelas pseudo-tabelas feitas de <div> (ver `rotularGrade`). Sem ele,
  // o mesmo desenho precisaria de duas cópias de CSS — e duas cópias divergem.
  if (temTitulo) {
    linhas.forEach((linha) => {
      if (Array.from(linha.children).filter((c) => c.tagName === 'TD').length > 1) {
        linha.classList.add(CLASSE_LINHA);
      }
    });
  }
}

/**
 * Passa a tabela (ou a arvore inteira) pela conversao, agora.
 *
 * Exportada porque `iniciarTabelasComoCartoes` guarda estado de modulo e, da
 * segunda chamada em diante, nao faz nada — e porque o MutationObserver
 * entrega em microtarefa, depois de o teste ja ter conferido o resultado.
 * Com isto o teste mede o que a funcao FAZ, e nao o tempo do observador.
 */
/**
 * PSEUDO-TABELA FEITA DE <div>.
 *
 * Parte deste sistema nao usa <table>: usa um container com uma linha de
 * cabecalho e varias linhas de dados, todas em CSS grid. Exemplos reais:
 * `.msc-row head` em Minhas Solicitacoes, `.csc-row head` em Compras,
 * `.engp-mat-row head` no cadastro de materiais.
 *
 * No celular elas sao PIORES que as tabelas de verdade: a grade
 * `90px 220px 170px 1fr 230px` pede 710px de largura minima, e numa tela de
 * 375px isso estoura e arrasta a pagina inteira de lado. E a conversao de
 * <table> nao as alcanca, porque nao ha <table> nenhuma.
 *
 * A deteccao e conservadora de proposito — um falso positivo aqui
 * desconfiguraria uma tela que estava certa:
 *
 *   - tem de haver um filho com `head` ou `cabec` na classe;
 *   - tem de haver pelo menos duas linhas irmas com a MESMA classe base;
 *   - cabecalho e linha precisam ter o MESMO numero de filhos diretos;
 *   - e precisa haver ao menos 3 colunas. Com duas, empilhar nao resolve nada
 *     que o `flex-wrap` global ja nao resolva.
 *
 * Quando converte, o cabecalho some (os nomes passaram para `data-label`) e as
 * linhas viram cartoes pelo mesmo CSS das tabelas — o gancho `cartao-auto` e
 * compartilhado.
 */
function rotularGrade(container) {
  if (container.hasAttribute('data-sem-cartoes')) return;

  const filhos = Array.from(container.children);
  if (filhos.length < 3) return;   // cabecalho + pelo menos duas linhas

  const cabecalho = filhos.find((f) => /head|cabec/i.test(f.className || ''));
  if (!cabecalho) return;

  const colunas = Array.from(cabecalho.children);
  if (colunas.length < 3) return;

  // A classe "base" da linha: a que o cabecalho compartilha com as demais.
  const classesCabecalho = Array.from(cabecalho.classList);
  const base = classesCabecalho.find((c) => !/head|cabec/i.test(c));
  if (!base) return;

  const linhas = filhos.filter(
    (f) => f !== cabecalho
      && f.classList.contains(base)
      && f.children.length === colunas.length,
  );
  if (linhas.length === 0) return;

  const rotulos = colunas.map(limpo);
  if (rotulos.every((r) => r === '')) return;

  const { papeis, temTitulo } = deduzirPapeis(rotulos, linhas[0]);

  linhas.forEach((linha) => {
    Array.from(linha.children).forEach((celula, i) => {
      if (rotulos[i] && celula.getAttribute('data-label') !== rotulos[i]) {
        celula.setAttribute('data-label', rotulos[i]);
      }
      if (papeis[i] && celula.getAttribute('data-papel') !== papeis[i]) {
        celula.setAttribute('data-papel', papeis[i]);
      }
      marcarVazio(celula);
      if (papeis[i] === 'acoes') rotularBotoes(celula);
      if (papeis[i] === 'situacao') corrigirContrasteDoSelo(celula);
    });
    if (temTitulo) linha.classList.add(CLASSE_LINHA);
  });

  container.classList.add(CLASSE_GRADE);
}

export function varrerTabelas(raiz = document) {
  if (!ehCelular()) return;
  if (!raiz.querySelectorAll) return;

  raiz.querySelectorAll('table').forEach(rotularTabela);

  // Pseudo-tabelas: o PAI de qualquer elemento marcado como cabecalho.
  const cabecalhos = raiz.querySelectorAll('[class*="head"], [class*="cabec"]');
  const containers = new Set();
  cabecalhos.forEach((h) => { if (h.parentElement) containers.add(h.parentElement); });
  containers.forEach(rotularGrade);
}

let observador = null;
let agendado = null;

/**
 * Agrupa rajadas de mutação num passe só. Sem isto, uma lista que renderiza
 * cem linhas dispararia cem varreduras.
 *
 * Dois relógios, não um. `requestAnimationFrame` só dispara quando a página
 * PINTA: aplicativo em segundo plano, tela do telefone apagada, aba
 * ocultada. Medido nesta sessão: rAF não disparou em 1,2s com o documento
 * se declarando `visibilityState: "visible"`.
 *
 * Junto com a trava `if (agendado) return`, isso não atrasa a varredura —
 * ela MORRE. O agendamento fica pendente para sempre e toda mutação
 * seguinte é descartada calada, ou seja, as tabelas param de virar cartão no
 * meio do uso. O `setTimeout` corre sem pintura; quem chegar primeiro
 * executa e cancela o outro.
 */
function agendarVarredura() {
  if (agendado) return;

  const rodar = () => {
    if (!agendado) return;
    agendado.cancelar();
    agendado = null;
    varrerTabelas(document);
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
