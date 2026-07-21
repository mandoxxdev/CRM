const SOURCE_SELECTOR = '#proposalSource';
const CLAUSULA_SELECTOR = '[data-clausula-key]';
const WRAPPER_SELECTOR = '.five-intro-group';

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
  const primeira = source.querySelector(CLAUSULA_SELECTOR);
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
    return {
      key: secao.getAttribute('data-clausula-key'),
      titulo: tituloEl ? tituloEl.textContent.trim() : '',
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

export function moverClausulaNoSource(doc, key, direcao) {
  return comWrapperNormalizado(doc, () => {
    const source = getSource(doc);
    if (!source) return false;
    const secoes = Array.from(source.querySelectorAll(CLAUSULA_SELECTOR));
    const idx = secoes.findIndex((el) => el.getAttribute('data-clausula-key') === key);
    const alvo = idx + direcao;
    if (idx === -1 || alvo < 0 || alvo >= secoes.length) return false;
    const atual = secoes[idx];
    const vizinho = secoes[alvo];
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
    if (referencia) referencia.insertAdjacentElement('afterend', secao);
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

export function renumerarClausulas(doc) {
  const source = doc.querySelector('#proposalSource');
  if (!source) return false;
  const secoes = Array.from(source.querySelectorAll('[data-clausula-key]'));
  secoes.forEach((secao, i) => {
    const tituloEl = secao.querySelector('[data-clausula-campo="titulo"]');
    if (!tituloEl) return;
    const atual = tituloEl.textContent || '';
    // remove um prefixo numérico existente do tipo "5.4 " / "12.3 " no começo
    const semPrefixo = atual.replace(/^\s*\d+\.\d+\s*/, '').trimStart();
    // Reserva o slot 23 para a 5.23 FIXA (preço/FINAME/fiscais, seção não editável):
    // as cláusulas editáveis preenchem 5.1..5.22 e a próxima continua em 5.24 (pula 23).
    const n = (i + 1) < 23 ? (i + 1) : (i + 2);
    const novoTitulo = `5.${n} ${semPrefixo}`.trimEnd();
    if (tituloEl.textContent !== novoTitulo) tituloEl.textContent = novoTitulo;
  });
  return true;
}
