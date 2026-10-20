const SOURCE_SELECTOR = '#proposalSource';
const CLAUSULA_SELECTOR = '[data-clausula-key]';
const WRAPPER_SELECTOR = '.five-intro-group';
// Blocos de texto que moram num SLOT FIXO do documento — hoje só a 5.23, cujos textos
// (abertura e condição de pagamento) ficam intercalados com a tabela de preços gerada
// dos itens. Eles são cláusulas de verdade (editáveis e persistidas), mas NÃO participam
// da sequência de numeração nem podem ser reordenados junto com as demais: mover uma
// cláusula "para dentro" do grupo da 5.23 quebraria a ordem tabela → condição (I4).
const CLAUSULA_EDITAVEL_SELECTOR = '[data-clausula-key]:not([data-clausula-slot])';

function escapeAttrValue(v) {
  return String(v).replace(/"/g, '\\"');
}

function getSource(doc) {
  return doc.querySelector(SOURCE_SELECTOR);
}

function getWrapper(doc) {
  const source = getSource(doc);
  return source ? source.querySelector(WRAPPER_SELECTOR) : null;
}

function buscarSecao(doc, key) {
  const source = getSource(doc);
  if (!source) return null;
  return source.querySelector(`${CLAUSULA_SELECTOR}[data-clausula-key="${escapeAttrValue(key)}"]`);
}

// A "primeira" cláusula sempre precisa estar fisicamente dentro do wrapper
// .five-intro-group (junto do <h2>), para o paginador não deixar o título órfão
// no fim de uma página (ver comentário original em propostaPremiumV2.js).
// Para mover/remover/adicionar sem se importar com essa regra, toda operação
// estrutural "desempacota" a cláusula do wrapper antes de mexer, e "reempacota"
// a nova primeira cláusula depois.
function desempacotarPrimeiraClausula(doc) {
  const wrapper = getWrapper(doc);
  if (!wrapper) return;
  const clausulaNoWrapper = wrapper.querySelector(CLAUSULA_SELECTOR);
  if (clausulaNoWrapper) wrapper.insertAdjacentElement('afterend', clausulaNoWrapper);
}

function reempacotarPrimeiraClausula(doc) {
  const source = getSource(doc);
  const wrapper = getWrapper(doc);
  if (!source || !wrapper) return;
  // :not([data-clausula-slot]) — um bloco de texto da 5.23 nunca pode ser promovido a
  // "primeira cláusula" e arrastado para dentro do wrapper do título da seção 5.
  const primeira = source.querySelector(CLAUSULA_EDITAVEL_SELECTOR);
  if (primeira) wrapper.appendChild(primeira);
}

function comWrapperNormalizado(doc, fn) {
  desempacotarPrimeiraClausula(doc);
  const resultado = fn();
  reempacotarPrimeiraClausula(doc);
  return resultado;
}

export function lerClausulasDoSource(doc) {
  const source = getSource(doc);
  if (!source) return [];
  return Array.from(source.querySelectorAll(CLAUSULA_SELECTOR)).map((secao) => {
    const tituloEl = secao.querySelector('[data-clausula-campo="titulo"]');
    const conteudoEl = secao.querySelector('[data-clausula-campo="conteudo"]');
    // data-titulo-prefixo: número que o documento NÃO mostra, mas que precisa voltar ao
    // título salvo. É o caso da "CONDIÇÃO DE PAGAMENTO:" (5.23.1) — visualmente ela é só
    // um subtítulo em negrito, e sem o prefixo o template deixaria de reconhecê-la como
    // parte da 5.23 na próxima renderização (ela cairia no meio da lista de cláusulas).
    const prefixo = (tituloEl && tituloEl.getAttribute('data-titulo-prefixo')) || '';
    return {
      key: secao.getAttribute('data-clausula-key'),
      titulo: tituloEl ? `${prefixo}${tituloEl.textContent}`.trim() : '',
      conteudo: conteudoEl ? conteudoEl.innerHTML : '',
    };
  });
}

export function atualizarKeyNoSource(doc, chaveAntiga, chaveNova) {
  const secao = buscarSecao(doc, chaveAntiga);
  if (!secao) return false;
  secao.setAttribute('data-clausula-key', chaveNova);
  return true;
}

export function sincronizarCampoParaSource(doc, key, campo, valor) {
  const secao = buscarSecao(doc, key);
  if (!secao) return false;
  const alvo = secao.querySelector(`[data-clausula-campo="${campo}"]`);
  if (!alvo) return false;
  if (campo === 'titulo') alvo.textContent = valor;
  else alvo.innerHTML = valor;
  return true;
}

// Etapa 139 (RN-139.07) — a página de assinatura (.pagina-assinatura) é da CONSIDERAÇÃO FINAL, que fecha o documento
// (I2/I3). O editor numera pela ordem do #proposalSource e pula o 24 (seção de preço): uma cláusula posta DEPOIS da CF
// ganhava o número seguinte ao dela (CF 5.25, nova 5.26) e o template — que renderiza as 5.25+ depois da seção de preço e
// a CF sempre na página de assinatura — imprimia 5.24 → 5.26 → 5.25. Por isso nada entra depois da CF nem a CF sai de lá.
function naPaginaDeAssinatura(el) {
  return !!(el && typeof el.closest === 'function' && el.closest('.pagina-assinatura'));
}

export function moverClausulaNoSource(doc, key, direcao) {
  return comWrapperNormalizado(doc, () => {
    const source = getSource(doc);
    if (!source) return false;
    // Só cláusulas reordenáveis: os blocos de texto da 5.23 ficam de fora para nunca
    // virarem "vizinho" de destino — insertAdjacentElement neles jogaria a cláusula
    // movida para dentro do grupo da tabela de preços.
    const secoes = Array.from(source.querySelectorAll(CLAUSULA_EDITAVEL_SELECTOR));
    const idx = secoes.findIndex((el) => el.getAttribute('data-clausula-key') === key);
    const alvo = idx + direcao;
    if (idx === -1 || alvo < 0 || alvo >= secoes.length) return false;
    const atual = secoes[idx];
    const vizinho = secoes[alvo];
    if (naPaginaDeAssinatura(atual) || naPaginaDeAssinatura(vizinho)) return false;
    if (direcao < 0) vizinho.insertAdjacentElement('beforebegin', atual);
    else vizinho.insertAdjacentElement('afterend', atual);
    return true;
  });
}

export function removerClausulaDoSource(doc, key) {
  return comWrapperNormalizado(doc, () => {
    const secao = buscarSecao(doc, key);
    if (!secao) return false;
    secao.remove();
    return true;
  });
}

// Título que uma cláusula recém-criada recebe antes de qualquer digitação.
// renumerarClausulas pode prefixá-lo com "5.x ", então nunca fica vazio.
export const TITULO_CLAUSULA_NOVA = 'Nova Cláusula';

export function adicionarClausulaAoSource(doc, apósKey) {
  return comWrapperNormalizado(doc, () => {
    const source = getSource(doc);
    if (!source) return null;
    const key = `temp-${Date.now()}`;
    const secao = doc.createElement('section');
    secao.className = 'block stack-md allow-break';
    secao.setAttribute('data-clausula-key', key);
    const h3 = doc.createElement('h3');
    h3.setAttribute('data-clausula-campo', 'titulo');
    h3.textContent = TITULO_CLAUSULA_NOVA;
    const div = doc.createElement('div');
    div.className = 'stack-sm';
    div.setAttribute('data-clausula-campo', 'conteudo');
    // Vazio de propósito (sem <p></p>): permite que a regra CSS
    // [data-clausula-campo="conteudo"]:empty::before (ver ativarEdicaoClausulas em
    // PropostaPreviewEditavel.js) mostre um placeholder indicando que dá pra escrever.
    // Um <p></p> vazio faria o corpo colapsar para uma sliver quase invisível.
    div.innerHTML = '';
    secao.appendChild(h3);
    secao.appendChild(div);
    const referencia = apósKey ? buscarSecao(doc, apósKey) : null;
    // RN-139.07: "+ cláusula" na CONSIDERAÇÃO FINAL (ou sem referência) entra ANTES da página de assinatura.
    const paginaAssinatura = source.querySelector('.pagina-assinatura');
    if (referencia && !naPaginaDeAssinatura(referencia)) referencia.insertAdjacentElement('afterend', secao);
    else if (paginaAssinatura) paginaAssinatura.insertAdjacentElement('beforebegin', secao);
    else source.appendChild(secao);
    return key;
  });
}

export function htmlParaTexto(html) {
  if (!html) return '';
  return String(html)
    .replace(/<\/p>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/li>/gi, '\n').replace(/<\/div>/gi, '\n\n')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim();
}

export function diffClausulas(snapshotOriginal, listaAtual) {
  const porIdOriginal = new Map(snapshotOriginal.map((c) => [String(c.id), c]));
  const keysAtuais = new Set(listaAtual.map((c) => c.key));

  const novas = listaAtual.filter((c) => c.key.startsWith('temp-'));
  const alteradas = listaAtual.filter((c) => {
    if (c.key.startsWith('temp-') || c.key.startsWith('default-')) return false;
    const original = porIdOriginal.get(c.key);
    return !!original && (original.titulo !== c.titulo || htmlParaTexto(original.conteudo) !== c.conteudo);
  });
  const removidas = snapshotOriginal.filter((c) => !keysAtuais.has(String(c.id)));

  const ordemOriginal = snapshotOriginal.map((c) => String(c.id));
  const ordemAtual = listaAtual
    .filter((c) => !c.key.startsWith('temp-') && !c.key.startsWith('default-'))
    .map((c) => c.key);
  const ordemMudou = ordemOriginal.filter((k) => ordemAtual.includes(k)).join(',') !== ordemAtual.join(',');

  return { novas, alteradas, removidas, ordemMudou, ordemFinal: listaAtual.map((c) => c.key) };
}

// "Remoção implícita" da cláusula nova vazia: uma cláusula criada pelo "+ cláusula"
// e deixada intocada (corpo vazio e título ainda no placeholder — com ou sem o prefixo
// "5.x " que renumerarClausulas adiciona) não deve virar registro no banco ao salvar.
// Exige a key temp-* para nunca descartar por engano uma cláusula default cujo título
// o usuário porventura tenha apagado. Uma cláusula só-com-título (título diferente do
// placeholder) é preservada — é edição real do usuário.
// `clausula` vem no formato já processado: { key, titulo (trim), conteudo (texto) }.
export function ehClausulaNovaVazia(clausula) {
  if (!clausula || typeof clausula.key !== 'string' || !clausula.key.startsWith('temp-')) return false;
  if (String(clausula.conteudo || '').trim()) return false;
  const semPrefixo = String(clausula.titulo || '').replace(/^\s*\d+\.\d+\s*/, '').trim();
  return semPrefixo === '' || semPrefixo === TITULO_CLAUSULA_NOVA;
}

// Etapa 139 (Fase 5) — antes de ler o #proposalSource para salvar, tira dele as cláusulas novas intocadas e, se tirou
// alguma, renumera. A renumeração já tinha contado a nova: com "+ cláusula" na CONSIDERAÇÃO FINAL a nova virava 5.25 e a
// CF 5.26; o salvamento descartava a nova vazia (ehClausulaNovaVazia) mas gravava a CF como 5.26, e o documento saía
// 5.24 → 5.26 sem 5.25. O mesmo buraco abria no meio da lista. Só renumera quando descarta algo: o salvamento comum não
// muda nenhum título. Retorna quantas tirou.
export function descartarClausulasNovasVazias(doc) {
  const vazias = lerClausulasDoSource(doc)
    .map((c) => ({ ...c, titulo: (c.titulo || '').trim(), conteudo: htmlParaTexto(c.conteudo) }))
    .filter(ehClausulaNovaVazia);
  vazias.forEach((c) => removerClausulaDoSource(doc, c.key));
  if (vazias.length > 0) renumerarClausulas(doc);
  return vazias.length;
}

// Etapa 167 (RN-167.01, B1065, C418) — o marcador que sobrevive ao Salvar do preview editável.
// O servidor resolve os marcadores ({{proposal.date}}, {{client.name}}...) no documento INTEIRO, inclusive no #proposalSource que o
// editor lê: sem isto o Salvar comparava o texto resolvido com o gravado, achava diferença e gravava o valor escrito no lugar do marcador.
// Três versões da mesma cláusula: a GRAVADA (com o marcador), a INICIAL (o texto da tela ao carregar) e a ATUAL (a que vai salvar).
// A gravada contra a inicial diz onde está o valor de cada marcador; a inicial contra a atual diz o trecho que o usuário mexeu (o prefixo e
// o sufixo comuns). O marcador cujo valor ficou inteiro fora do trecho mexido volta; o que ficou dentro vai como escrito.
// Não mexe no HTML nem na paginação (um <span> em volta do valor mudaria a folha que o splitTextLeaf divide — medido na Fase 0).
const RE_MARCADOR_SIMPLES = /\{\{([^{}#/]+)\}\}/g;

// Divide o texto inicial pelos literais do gravado. Busca LINEAR (Fase 2 C1: o regex com um (.*?) por marcador travava a aba quando o
// gravado não casava): a divisão mais à esquerda por indexOf e a mais à direita por lastIndexOf; só vale se as duas coincidem (única).
// Devolve [{ s, e }] — onde está o valor de cada marcador no inicial — ou null.
function posicoesDosValores(literais, inicial) {
  const k = literais.length - 1; // número de marcadores
  const primeiro = literais[0];
  const ultimo = literais[k];
  if (!inicial.startsWith(primeiro)) return null;
  const inicioDoUltimo = inicial.length - ultimo.length;
  if (inicioDoUltimo < primeiro.length || !inicial.endsWith(ultimo)) return null;
  // mais à esquerda: o início de cada literal do meio
  const esq = [];
  let cur = primeiro.length;
  for (let i = 1; i < k; i++) {
    const at = inicial.indexOf(literais[i], cur);
    if (at < 0) return null;
    esq.push(at);
    cur = at + literais[i].length;
  }
  if (cur > inicioDoUltimo) return null;
  // mais à direita
  const dir = new Array(Math.max(0, k - 1));
  let lim = inicioDoUltimo;
  for (let i = k - 1; i >= 1; i--) {
    const at = inicial.lastIndexOf(literais[i], lim - literais[i].length);
    if (at < 0 || at + literais[i].length > lim) return null;
    dir[i - 1] = at;
    lim = at;
  }
  if (lim < primeiro.length) return null;
  for (let i = 0; i < esq.length; i++) if (esq[i] !== dir[i]) return null; // ambígua
  const inicios = [...esq, inicioDoUltimo];
  const posicoes = [];
  let s = primeiro.length;
  for (let j = 0; j < k; j++) {
    posicoes.push({ s, e: inicios[j] });
    s = inicios[j] + literais[j + 1].length;
  }
  return posicoes;
}

export function restaurarMarcadores(gravado, inicial, atual) {
  const g = typeof gravado === 'string' ? gravado : '';
  const ini = typeof inicial === 'string' ? inicial : '';
  const at = typeof atual === 'string' ? atual : '';
  if (typeof gravado !== 'string' || typeof inicial !== 'string') return at;
  // Fase 2 I1: a cláusula intocada volta ao que a gerou — em qualquer caso (bloco, gravado que não casa).
  if (at === ini) return g;
  if (/\{\{\s*[#/]/.test(g)) return at; // bloco ({{#if}}, {{#each}}): fora (C419)
  const marcadores = [];
  const literais = [];
  let ultimo = 0;
  g.replace(RE_MARCADOR_SIMPLES, (m, _caminho, pos) => {
    literais.push(g.slice(ultimo, pos));
    marcadores.push(m);
    ultimo = pos + m.length;
    return m;
  });
  if (marcadores.length === 0) return at;
  literais.push(g.slice(ultimo));
  const posicoes = posicoesDosValores(literais, ini);
  if (!posicoes) return at;
  // o trecho mexido: o prefixo e o sufixo comuns de inicial e atual
  const max = Math.min(ini.length, at.length);
  let p = 0;
  while (p < max && ini[p] === at[p]) p++;
  let q = 0;
  while (q < max - p && ini[ini.length - 1 - q] === at[at.length - 1 - q]) q++;
  const inicioDoSufixo = ini.length - q;
  const prefixo = [];
  const sufixo = [];
  posicoes.forEach((v, j) => {
    const vazio = v.s === v.e;
    if (vazio ? v.s < p : v.e <= p) prefixo.push(j);
    else if (v.s >= inicioDoSufixo) sufixo.push(j);
  });
  // monta: o prefixo do atual com os marcadores dele, o meio do atual como está, o sufixo do atual com os marcadores dele
  const montar = (ini0, fim, indices, deslocamento) => {
    let out = '';
    let cur = ini0;
    indices.forEach((j) => {
      const v = posicoes[j];
      out += at.slice(cur + deslocamento, v.s + deslocamento) + marcadores[j];
      cur = v.e;
    });
    return out + at.slice(cur + deslocamento, fim + deslocamento);
  };
  const desloc = at.length - ini.length; // o sufixo do atual está deslocado do do inicial
  return montar(0, p, prefixo, 0)
    + at.slice(p, at.length - q)
    + montar(inicioDoSufixo, ini.length, sufixo, desloc);
}

// O texto de cada cláusula do #proposalSource no formato do salvamento (título aparado, conteúdo por htmlParaTexto). Chave repetida: a
// primeira vence (Fase 2 M4).
export function lerTextosIniciaisDasClausulas(doc) {
  const mapa = new Map();
  lerClausulasDoSource(doc).forEach((c) => {
    if (!c.key || mapa.has(c.key)) return;
    mapa.set(c.key, { titulo: (c.titulo || '').trim(), conteudo: htmlParaTexto(c.conteudo) });
  });
  return mapa;
}

// RN-167.02: aplica a restauração ao título e ao conteúdo de cada cláusula que tem a versão gravada e a inicial. Nunca lança (Fase 2 M1).
export function restaurarMarcadoresNaLista(listaAtual, iniciais, gravadosPorKey) {
  if (!Array.isArray(listaAtual)) return listaAtual;
  if (!(iniciais instanceof Map) || !(gravadosPorKey instanceof Map)) return listaAtual;
  return listaAtual.map((c) => {
    try {
      const inicial = c && iniciais.get(c.key);
      const gravado = c && gravadosPorKey.get(c.key);
      if (!inicial || !gravado) return c;
      return {
        ...c,
        titulo: restaurarMarcadores(gravado.titulo, inicial.titulo, c.titulo),
        conteudo: restaurarMarcadores(gravado.conteudo, inicial.conteudo, c.conteudo),
      };
    } catch (_) {
      return c;
    }
  });
}

export function renumerarClausulas(doc) {
  const source = doc.querySelector('#proposalSource');
  if (!source) return false;
  // Os blocos de texto da 5.23 (data-clausula-slot) ficam FORA da renumeração e também
  // fora da CONTAGEM: eles já têm número próprio (5.23 / 5.23.1) e contá-los empurraria
  // a 5.24 para 5.26. É o mesmo motivo da reserva do slot 23 logo abaixo.
  const secoes = Array.from(source.querySelectorAll(CLAUSULA_EDITAVEL_SELECTOR));
  secoes.forEach((secao, i) => {
    const tituloEl = secao.querySelector('[data-clausula-campo="titulo"]');
    if (!tituloEl) return;
    const atual = tituloEl.textContent || '';
    // remove um prefixo numérico existente do tipo "5.4 " / "12.3 " no começo
    const semPrefixo = atual.replace(/^\s*\d+\.\d+\s*/, '').trimStart();
    // Reserva o slot 24 para a 5.24 FIXA (preço/FINAME/fiscais, seção não editável):
    // as cláusulas editáveis preenchem 5.1..5.23 e a próxima continua em 5.25 (pula 24).
    const n = (i + 1) < 24 ? (i + 1) : (i + 2);
    const novoTitulo = `5.${n} ${semPrefixo}`.trimEnd();
    if (tituloEl.textContent !== novoTitulo) tituloEl.textContent = novoTitulo;
  });
  return true;
}
