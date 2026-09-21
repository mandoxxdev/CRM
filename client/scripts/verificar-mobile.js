#!/usr/bin/env node
/**
 * GUARDA DO FRONT DE CELULAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Roda com `npm run check:mobile` (dentro de client/).
 *
 * POR QUE EXISTE
 *
 * O aplicativo de celular nao se mantem sozinho. Toda tela nova pode
 * reintroduzir os mesmos defeitos que ja custaram caro aqui — e cada padrao
 * verificado abaixo corresponde a um defeito REAL que aconteceu neste projeto,
 * nao a uma regra de estilo inventada.
 *
 * SOBRE OS NUMEROS DA LINHA DE BASE
 *
 * Este guarda le o CSS como TEXTO, e nao resolve media query aninhada. Por isso
 * uma parte do que ele lista ja esta resolvida no app-glass.css e ele nao tem
 * como saber — o caso conhecido sao as regras de desfoque, que a medicao no
 * navegador mostra como `none` e ele ainda assim aponta.
 *
 * Isso e aceitavel porque o que importa aqui nao e o numero absoluto, e sim a
 * VARIACAO: o guarda existe para reprovar o que PIORA. Antes de gastar tempo
 * com um item da lista, confirme no navegador (getComputedStyle) se ele e real.
 *
 * Ele nao reprova a divida que ja existe: compara com uma LINHA DE BASE
 * (mobile-baseline.json) e so falha quando o numero PIORA. Assim o guarda pode
 * entrar hoje, com 52 tabelas pendentes, sem travar ninguem — e ainda assim
 * impedir que a 53a apareca sem querer.
 *
 * Para baixar a linha de base depois de corrigir alguma coisa:
 *     npm run check:mobile -- --gravar
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O QUE CADA VERIFICACAO PEGA, E DE ONDE ELA VEIO
 *
 * TABELA_SEM_SAIDA   Tabela sem alternativa de celular. Hoje isto quase nunca
 *                    e problema, porque `utils/tabelasComoCartoes.js` converte
 *                    qualquer tabela automaticamente. Continua contado porque a
 *                    conversao automatica depende de <thead> com nomes de
 *                    coluna: tabela sem cabecalho nao vira cartao e volta a
 *                    rolar de lado.
 *
 * ALTURA_FIXA_FLEX   `height` em px num container que tambem e flex. Foi o
 *                    defeito da barra de Ver Proposta: o layer global forca
 *                    `flex-wrap: wrap`, os botoes quebram em tres linhas e
 *                    vazam para fora da caixa de altura fixa, por cima do
 *                    conteudo. Altura fixa e quebra de linha nao convivem.
 *
 * BLUR_EM_MOVIMENTO  `backdrop-filter` num elemento que anima ou transiciona
 *                    `transform`. Um elemento desfocado que se move obriga o
 *                    navegador a re-amostrar o fundo a cada quadro. Foi o que
 *                    travava ao abrir o menu lateral e as folhas.
 *
 * LARGURA_FIXA       width/min-width acima de 360px sem media query. Estoura a
 *                    tela e cria rolagem lateral na pagina inteira.
 *
 * GRADE_FIXA         `grid-template-columns` cujas colunas em pixel somam mais
 *                    que 360px, sem media query. Foi o pior achado da segunda
 *                    varredura: `.msc-row` pedia 710px numa tela de 375px e
 *                    arrastava a pagina inteira de lado.
 *                    Se a grade for uma TABELA disfarcada (linha `head` mais
 *                    linhas de dados), nao corrija no CSS: o utilitario
 *                    `tabelasComoCartoes` ja a converte em cartao sozinho.
 *                    Se for layout mesmo, colapse para uma coluna no
 *                    app-glass.css, bloco 12.
 *
 * (FONTE_PEQUENA saiu: o app-glass.css ja forca 16px em todo input abaixo de
 *  768px, com especificidade suficiente para ganhar. Um alerta que nunca
 *  corresponde a um defeito real treina as pessoas a ignorar o guarda inteiro.)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'src');
const BASE = path.join(__dirname, 'mobile-baseline.json');
const GRAVAR = process.argv.includes('--gravar');
const DETALHAR = process.argv.includes('--detalhar');

// ── coleta de arquivos ──────────────────────────────────────────────────────
function listar(dir, acc = []) {
  for (const nome of fs.readdirSync(dir)) {
    const p = path.join(dir, nome);
    const st = fs.statSync(p);
    if (st.isDirectory()) listar(p, acc);
    else acc.push(p);
  }
  return acc;
}

const arquivos = listar(RAIZ);
const jsFiles = arquivos.filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));
const cssFiles = arquivos.filter((f) => f.endsWith('.css'));

const ler = (f) => fs.readFileSync(f, 'utf8');
const rel = (f) => path.relative(path.join(__dirname, '..'), f).replace(/\\/g, '/');

/**
 * Nomes de @keyframes cujo conteudo MOVE o elemento (translate/scale/rotate).
 *
 * Existe porque nem toda animacao move: `ag-fundo` so anima opacidade, e
 * opacidade nao obriga o navegador a re-amostrar o fundo desfocado. Sem
 * resolver o keyframe, o guarda acusava 27 casos onde a medicao no navegador
 * mostrava zero — e guarda que grita a toa deixa de ser lido.
 */
function keyframesQueMovem(css) {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const nomes = new Set();
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m;
  while ((m = re.exec(limpo)) !== null) {
    // Varre ate fechar o bloco do keyframes, contando chaves.
    let i = re.lastIndex;
    let nivel = 1;
    while (i < limpo.length && nivel > 0) {
      if (limpo[i] === '{') nivel += 1;
      else if (limpo[i] === '}') nivel -= 1;
      i += 1;
    }
    const corpo = limpo.slice(re.lastIndex, i);
    if (/translate|scale|rotate|matrix/.test(corpo)) nomes.add(m[1]);
  }
  return nomes;
}

/** Familias que o layer global de celular forca a quebrar linha. Altura fixa
 *  so e perigosa DENTRO delas — botao de 40px de altura e o que se quer. */
const FAMILIAS_QUE_QUEBRAM = /header|cabecalho|toolbar|barra|actions|acoes|filters|filtros|buttons|botoes|-top\b|-topo\b/i;

/**
 * Elementos-FOLHA: botao, icone, selo, sino. Altura fixa neles e o que se quer
 * (44px e o alvo de toque confortavel) — o defeito acontece no CONTAINER que
 * quebra linha, nao no filho. Sem esta exclusao o guarda acusava dez casos que
 * eram todos alvo de toque correto.
 */
const EH_FOLHA = /(button|btn[-\w]*|[-\w]*-icon|[-\w]*-icone|[-\w]*-badge|[-\w]*-bell|svg)\s*$/i;

/** Divide um CSS em blocos { seletor, corpo }, ignorando comentarios. */
function blocos(css) {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(limpo)) !== null) {
    out.push({ seletor: m[1].trim().replace(/\s+/g, ' '), corpo: m[2] });
  }
  return out;
}

/**
 * Seletores que o app-glass.css ja colapsa para uma coluna no celular.
 * O CSS do componente continua com a grade fixa de proposito — o computador
 * usa. Acusar de novo aqui seria ruido.
 */
function gradesJaColapsadas() {
  const glassPath = path.join(RAIZ, 'styles', 'app-glass.css');
  const css = ler(glassPath);
  const nomes = new Set();
  for (const b of blocos(css)) {
    if (!/grid-template-columns/.test(b.corpo)) continue;
    const val = (b.corpo.match(/grid-template-columns\s*:\s*([^;]+)/) || [])[1] || '';
    // Colapso = uma coluna, ou duas iguais.
    if (/^\s*1fr\s*!?\s*important?\s*$/.test(val) || /repeat\(\s*2\s*,/.test(val)
        || /^\s*1fr\s+1fr/.test(val)) {
      b.seletor.split(',').forEach((x) => nomes.add(x.trim().replace(/^\./, '')));
    }
  }
  return nomes;
}

/**
 * Classes de linha que o conversor de pseudo-tabela ja transforma em cartao.
 * Detectadas pelo mesmo sinal que ele usa: existe no JSX uma linha com a
 * mesma classe base mais `head`/`cabec`.
 */
function gradesJaConvertidas(arquivos) {
  const nomes = new Set();
  for (const f of arquivos) {
    const src = ler(f);
    const re = /className="([\w-]+)((?:\s+[\w-]+)*)\s+(?:head|cabec\w*)"/g;
    let m;
    while ((m = re.exec(src)) !== null) nomes.add(m[1]);
    const re2 = /className="([\w-]+)\s+\1--(?:head|cabec\w*)"/g;
    while ((m = re2.exec(src)) !== null) nomes.add(m[1]);
  }
  return nomes;
}

const JA_COLAPSADAS = gradesJaColapsadas();
const JA_CONVERTIDAS = gradesJaConvertidas(jsFiles);

const achados = {
  TABELA_SEM_SAIDA: [],
  ALTURA_FIXA_FLEX: [],
  BLUR_EM_MOVIMENTO: [],
  LARGURA_FIXA: [],
  GRADE_FIXA: [],
};

// ── TABELA_SEM_SAIDA ────────────────────────────────────────────────────────
for (const f of jsFiles) {
  // O proprio conversor fala de <table> nos comentarios. Sem isto ele se
  // denuncia, e um guarda que acusa a si mesmo perde credibilidade.
  if (/utils[\\/]tabelasComoCartoes/.test(f)) continue;
  const src = ler(f);
  // Sem os comentarios: a palavra <table aparece em explicacao, nao so em JSX.
  const semComentarios = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  if (!semComentarios.includes('<table')) continue;
  // Tabela com <thead> e convertida automaticamente pelo utilitario.
  const temCabecalho = /<thead/.test(src) || /<th[\s>]/.test(src);
  if (!temCabecalho) achados.TABELA_SEM_SAIDA.push(`${rel(f)} (tabela sem <thead>)`);
}

// ── CSS ─────────────────────────────────────────────────────────────────────
for (const f of cssFiles) {
  const css = ler(f);
  const temMediaCelular = /max-width:\s*768px/.test(css);
  const bs = blocos(css);
  const moventes = keyframesQueMovem(css);

  /** O bloco faz o elemento MUDAR DE POSICAO? */
  const move = (corpo) => {
    if (/transition\s*:[^;]*transform/.test(corpo)) return true;
    const anim = corpo.match(/animation(?:-name)?\s*:\s*([^;]+)/);
    if (!anim) return false;
    return anim[1].split(/[\s,]+/).some((t) => moventes.has(t));
  };

  const seMovem = new Set();
  for (const b of bs) {
    if (move(b.corpo)) b.seletor.split(',').forEach((s) => seMovem.add(s.trim()));
  }

  for (const b of bs) {
    // BLUR_EM_MOVIMENTO
    if (/(?:^|[;\s])backdrop-filter\s*:\s*(?!none)/.test(b.corpo)) {
      const alvos = b.seletor.split(',').map((s) => s.trim());
      const movel = alvos.find((s) => seMovem.has(s))
        || (move(b.corpo) ? alvos[0] : null);
      if (movel) achados.BLUR_EM_MOVIMENTO.push(`${rel(f)} :: ${movel}`);
    }

    // ALTURA_FIXA_FLEX
    const h = b.corpo.match(/(?:^|[;\s])height\s*:\s*(\d{2,4})px/);
    if (h && /display\s*:\s*flex/.test(b.corpo)
        && !/flex-direction\s*:\s*column/.test(b.corpo)
        && FAMILIAS_QUE_QUEBRAM.test(b.seletor)
        && !b.seletor.split(',').every((x) => EH_FOLHA.test(x.trim()))) {
      achados.ALTURA_FIXA_FLEX.push(`${rel(f)} :: ${b.seletor.slice(0, 48)} (height ${h[1]}px)`);
    }

    // GRADE_FIXA
    const g = b.corpo.match(/grid-template-columns\s*:\s*([^;]+)/);
    if (g && !/auto-fit|auto-fill/.test(g[1]) && !temMediaCelular) {
      const soma = (g[1].match(/(\d{2,4})px/g) || [])
        .reduce((t, x) => t + Number(x.replace('px', '')), 0);
      if (soma > 360) {
        const alvos = b.seletor.split(',').map((x) => x.trim().replace(/^\./, ''));
        const resolvida = alvos.some(
          (a) => JA_COLAPSADAS.has(a) || JA_CONVERTIDAS.has(a),
        );
        if (!resolvida) {
          achados.GRADE_FIXA.push(`${rel(f)} :: ${b.seletor.slice(0, 44)} (${soma}px minimos)`);
        }
      }
    }

    // LARGURA_FIXA
    const w = b.corpo.match(/(?:^|[;\s])(?:min-)?width\s*:\s*(\d{3,4})px/);
    if (w && Number(w[1]) > 360 && !temMediaCelular) {
      achados.LARGURA_FIXA.push(`${rel(f)} :: ${b.seletor.slice(0, 48)} (${w[1]}px)`);
    }

  }
}

// ── CONTROLE POSITIVO ───────────────────────────────────────────────────────
// Uma regua que nao acha nada pode estar certa — ou quebrada. Esta verificacao
// prova que ela ainda enxerga, medindo um caso que sabemos existir: o CSS do
// aplicativo declara backdrop-filter em elementos PARADOS (topo e dock).
const glass = ler(path.join(RAIZ, 'styles', 'app-glass.css'));
if (!/backdrop-filter/.test(glass)) {
  console.error('\nCONTROLE POSITIVO FALHOU: a regua nao encontrou backdrop-filter');
  console.error('em app-glass.css, onde ele comprovadamente existe. A verificacao');
  console.error('esta quebrada e o resultado abaixo nao vale nada.\n');
  process.exit(2);
}

// ── comparacao com a linha de base ──────────────────────────────────────────
const atual = {};
for (const k of Object.keys(achados)) atual[k] = achados[k].length;

if (GRAVAR) {
  fs.writeFileSync(BASE, `${JSON.stringify(atual, null, 2)}\n`, 'utf8');
  console.log('Linha de base gravada:', JSON.stringify(atual));
  process.exit(0);
}

let baseline = null;
try {
  baseline = JSON.parse(ler(BASE));
} catch (e) {
  console.log('Sem linha de base ainda. Gerando com os numeros atuais.');
  fs.writeFileSync(BASE, `${JSON.stringify(atual, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(atual, null, 2));
  process.exit(0);
}

console.log('═'.repeat(72));
console.log('GUARDA DO FRONT DE CELULAR');
console.log('═'.repeat(72));

let piorou = false;
for (const k of Object.keys(atual)) {
  const antes = baseline[k] === undefined ? 0 : baseline[k];
  const agora = atual[k];
  const seta = agora > antes ? 'PIOROU' : (agora < antes ? 'melhorou' : 'igual');
  console.log(`  ${k.padEnd(20)} base ${String(antes).padStart(3)}  agora ${String(agora).padStart(3)}   ${seta}`);
  if (agora > antes) {
    piorou = true;
    const novos = achados[k].slice(0, 8);
    novos.forEach((n) => console.log(`      ${n}`));
  } else if (DETALHAR && agora > 0) {
    achados[k].slice(0, 10).forEach((n) => console.log(`      ${n}`));
  }
}

console.log('─'.repeat(72));
if (piorou) {
  console.log('\nAlgum numero subiu: uma tela nova trouxe de volta um defeito que');
  console.log('ja custou caro aqui. Leia o cabecalho deste arquivo — cada verificacao');
  console.log('explica o defeito real que ela previne e como corrigir.');
  console.log('\nSe a piora for intencional e justificada, registre a decisao e rode:');
  console.log('    npm run check:mobile -- --gravar\n');
  process.exit(1);
}
console.log('\nNada piorou. O front de celular segue dentro da linha de base.\n');
process.exit(0);
