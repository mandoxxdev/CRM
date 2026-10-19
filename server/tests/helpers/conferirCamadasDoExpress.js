/**
 * Etapa 153 (RN-153.04, S28–S30 da 152) — a conferencia das camadas do Express montado, para todos os testes de portao (145 a 153).
 *
 * O preload `despejaCamadasDoExpress.js` despeja o que o Express montou (o despacho de cada amostra e todas as rotas que casam alguma
 * amostra, em qualquer verbo). A Etapa 152 conferia isso inline no `custosViagensPortao`; aqui a mesma conferencia, parametrizada pelas
 * rotas que cada teste protege, para os outros — o que a regua do TEXTO nao le (receptor apelidado, `app[verbo]`, `.call`, o verbo
 * `search`, arquivo sem extensao ou em tests/, caminho com padrao) aparece nas camadas.
 *
 *   preloadDasCamadas()                          o caminho do preload (para o `-r` do `spawn`)
 *   envDasCamadas(pasta, amostras)               as duas variaveis de ambiente do preload (CAMADAS_SAIDA, CAMADAS_AMOSTRAS)
 *   amostrasDasCamadas(rotas, { neutro })        [[metodo, caminho], ...]: cada rota instanciada (todo `:param` vira `9`), o caminho
 *                                                neutro, e por prefixo (os dois primeiros segmentos) os extras em seis verbos
 *   lerCamadas(pasta)                            o JSON despejado (lanca se o preload nao despejou ou falhou)
 *   conferirCamadas(cam, rotas, { neutro, alemDasRotas })
 *                                                a lista de erros (vazia = tudo certo):
 *     - nenhum `app.param` (rodaria antes do login e do portao de toda rota com aquele parametro);
 *     - cada rota declarada e atendida por ELA MESMA, com a cadeia esperada no comeco (`cadeia`), sem router no caminho, e com os
 *       middlewares de antes iguais aos do caminho neutro (nenhum pendurado so no prefixo);
 *     - todo caminho atendido entre as amostras (inclusive os extras, em qualquer verbo) e atendido por uma rota declarada, com a cadeia
 *       dela e os mesmos middlewares de antes;
 *     - `cam.rotas` (todo registro que casa alguma amostra, de qualquer arquivo, em qualquer verbo) e exatamente o das declaradas mais
 *     - toda rota montada do app (`cam.todas`, a pilha inteira) num prefixo do teste (`prefixos`; padrao: os dois primeiros segmentos de
 *       cada rota declarada) e uma das declaradas ou das `alemDasRotas`; e nenhuma rota tem caminho que nao e texto simples (Fase 5 r3);
 *       `alemDasRotas` (medidas, ditas no teste: `{ metodo, rota, cadeia }` para a rota de outra etapa no mesmo prefixo — vale tambem no
 *       despacho, com a cadeia dela —, ou `'<verbo> <rota>'` para o registro que so casa uma amostra).
 *
 * `rotas`: [{ metodo: 'GET', rota: '/api/x/:id', cadeia: ['authenticateToken', 'portao:comercial'] }, ...]. A cadeia so precisa ter o
 * comeco: o handler e os multers que vem depois nao entram. Uma rota aberta de proposito declara `['authenticateToken', <o handler>]`
 * com o nome que o despejo da (o handler anonimo sai como `<anonima>`).
 */
const fs = require('fs');
const path = require('path');

const VERBOS_DOS_EXTRAS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'SEARCH'];

const preloadDasCamadas = () => path.join(__dirname, 'despejaCamadasDoExpress.js');
const envDasCamadas = (pasta, amostras) => ({ CAMADAS_SAIDA: path.join(pasta, 'camadas.json'), CAMADAS_AMOSTRAS: JSON.stringify(amostras) });
const instanciar = (rota) => rota.replace(/:[A-Za-z_]\w*/g, '9');
const prefixoDe = (rota) => rota.split('/').slice(0, 3).join('/');

function amostrasDasCamadas(rotas, { neutro } = {}) {
  if (!neutro) throw new Error('amostrasDasCamadas: diga o caminho neutro');
  const prefixos = [...new Set(rotas.map((r) => prefixoDe(r.rota)))];
  const extras = prefixos.flatMap((p) => [`${p}/zz-exportar`, `${p}/9/zz-exportar`, `${p}/a/b/c/d`, p.toUpperCase(), `${p.toUpperCase()}/9`, `${p}.json`]);
  return [
    ...rotas.map((r) => [r.metodo, instanciar(r.rota)]),
    ['GET', neutro],
    ...extras.flatMap((c) => VERBOS_DOS_EXTRAS.map((m) => [m, c])),
  ];
}

function lerCamadas(pasta) {
  const arq = path.join(pasta, 'camadas.json');
  if (!fs.existsSync(arq)) throw new Error('o preload nao despejou as camadas');
  const cam = JSON.parse(fs.readFileSync(arq, 'utf8'));
  if (cam.erro) throw new Error(`o despejo falhou: ${cam.erro}`);
  return cam;
}

function conferirCamadas(cam, rotas, { neutro, alemDasRotas = [], prefixos: prefixosDoTeste = null } = {}) {
  const erros = [];
  if (!cam || !Array.isArray(cam.despacho) || !Array.isArray(cam.rotas)) return ['o despejo nao tem despacho/rotas'];
  if ((cam.params || []).length) erros.push(`app.param: ${cam.params.join(', ')}`);
  const dNeutro = cam.despacho.find((d) => d.metodo === 'GET' && d.caminho === neutro);
  if (!dNeutro) return [...erros, `o caminho neutro ${neutro} nao foi despachado`];
  const mwsNeutro = dNeutro.out.filter((o) => o.tipo === 'mw').map((o) => o.nome);
  if (dNeutro.atendida || mwsNeutro.length < 3 || mwsNeutro.includes('authenticateToken')) {
    erros.push(`o caminho neutro nao serve de regua: ${JSON.stringify(dNeutro).slice(0, 300)}`);
  }
  const chave = (m, r) => `${m.toUpperCase()} ${r}`;
  // Fase 2 I-1: `alemDasRotas` pode trazer { metodo, rota, cadeia } — rota de OUTRA etapa no mesmo prefixo (a 148 divide /api/familias com a
  // 149): conta como declarada no despacho (com a cadeia dela), mas nao precisa de amostra propria. A string pura so vale para `cam.rotas`.
  const alemObj = alemDasRotas.filter((x) => typeof x === 'object');
  const porChave = new Map([...alemObj, ...rotas].map((r) => [chave(r.metodo, r.rota), r]));
  // Fase 5 r3 (familia 2): a comparacao e pela POSICAO na pilha (idx), nao so pelo nome — um middleware so do prefixo com o nome de um
  // global registrado depois das rotas passava. Todo middleware que roda antes da rota tem de ser um que o caminho neutro tambem roda
  // (mesma posicao, mesmo nome); a rota pode rodar menos (os montados em /api nao rodam no apelido /familias).
  const idxNeutro = dNeutro.out.filter((o) => o.tipo === 'mw').map((o) => `${o.idx}:${o.nome}`);
  const conferirAntes = (d, rotulo) => {
    const rota = d.out.find((o) => o.tipo === 'rota');
    const antes = d.out.filter((o) => o.tipo !== 'rota').map((o) => (o.tipo === 'mw' ? `${o.idx}:${o.nome}` : `router:${o.nome}@${o.em}`));
    const igual = rota.idx === undefined ? JSON.stringify(antes) === JSON.stringify(idxNeutro.slice(0, antes.length)) : antes.every((x) => idxNeutro.includes(x));
    if (d.out.some((o) => o.tipo === 'router') || !igual) {
      erros.push(`${rotulo}: middlewares antes ${antes.join(' > ')}`);
    }
  };
  const conferirCadeia = (rota, esperada, rotulo) => {
    const tem = rota.handles.slice(0, esperada.length);
    if (JSON.stringify(tem) !== JSON.stringify(esperada)) erros.push(`${rotulo}: ${rota.handles.slice(0, esperada.length + 1).join(', ')} (esperado ${esperada.join(', ')})`);
  };
  // cada declarada, pela amostra dela
  for (const r of rotas) {
    const d = cam.despacho.find((x) => x.metodo === r.metodo.toUpperCase() && x.caminho === instanciar(r.rota));
    const rota = d && d.out.find((o) => o.tipo === 'rota');
    if (!d || !d.atendida || !rota || rota.caminho !== r.rota) { erros.push(`${chave(r.metodo, r.rota)}: atendida por ${rota ? rota.caminho : 'ninguem'}`); continue; }
    conferirCadeia(rota, r.cadeia, chave(r.metodo, r.rota));
    conferirAntes(d, chave(r.metodo, r.rota));
  }
  // todo caminho atendido (os extras inclusive) e atendido por uma declarada, com a cadeia dela
  for (const d of cam.despacho) {
    if (!d.atendida || d.caminho === neutro) continue;
    const rota = d.out.find((o) => o.tipo === 'rota');
    const declarada = porChave.get(chave(d.metodo === 'HEAD' ? 'GET' : d.metodo, rota.caminho));
    if (!declarada) { erros.push(`${d.metodo} ${d.caminho}: atendido por ${rota.caminho}, que o teste nao declara`); continue; }
    if (d.caminho === instanciar(declarada.rota) && d.metodo === declarada.metodo.toUpperCase()) continue; // ja conferida acima
    conferirCadeia(rota, declarada.cadeia, `${d.metodo} ${d.caminho} -> ${rota.caminho}`);
    conferirAntes(d, `${d.metodo} ${d.caminho} -> ${rota.caminho}`);
  }
  // todo registro que casa alguma amostra, em qualquer verbo, e um dos declarados (ou dos medidos de outro prefixo)
  const esperadas = new Set([...rotas, ...alemObj].map((r) => `${r.metodo.toLowerCase()} ${r.rota}`).concat(alemDasRotas.filter((x) => typeof x === 'string')));
  const rotasDoDespejo = new Set(cam.rotas.flatMap((x) => { const [ms, ...c] = x.split(' '); return ms.split(',').map((m) => `${m} ${c.join(' ')}`); }));
  const aMais = [...rotasDoDespejo].filter((x) => !esperadas.has(x)).sort();
  const faltam = rotas.map((r) => `${r.metodo.toLowerCase()} ${r.rota}`).filter((x) => !rotasDoDespejo.has(x)).sort();
  if (aMais.length) erros.push(`registros a mais que atendem um caminho do prefixo: ${aMais.join('; ')}`);
  if (faltam.length) erros.push(`registros declarados que nao casaram nenhuma amostra: ${faltam.join('; ')}`);
  // Fase 5 r3 (familia 1): TODA rota montada do app (a pilha inteira, com o prefixo dos routers) cujo caminho comece por um prefixo da
  // etapa — nao so as que casam uma amostra: `app.get.call(app, '/api/relatorios/exportar', ...)` num caminho literal que nenhuma amostra
  // casa nascia sem portao. E nenhuma rota com caminho que nao e texto simples (regexp, ou montada num router de prefixo em regexp).
  if (Array.isArray(cam.todas)) {
    // os prefixos de que o teste e DONO (padrao: os dois primeiros segmentos de cada rota; quem divide prefixo com outra etapa diz os seus)
    const prefixos = [...new Set((prefixosDoTeste || rotas.map((r) => prefixoDe(r.rota))).map((p) => p.toLowerCase()))];
    const doPrefixo = (c) => prefixos.some((p) => c.toLowerCase().startsWith(p) && !/[\w-]/.test(c.charAt(p.length)));
    const todas = cam.todas.flatMap((x) => { const [ms, ...c] = x.split(' '); return ms.split(',').map((m) => [m, c.join(' ')]); });
    const foraDaLista = todas.filter(([m, c]) => doPrefixo(c) && !esperadas.has(`${m} ${c}`)).map(([m, c]) => `${m} ${c}`);
    if (foraDaLista.length) erros.push(`rotas montadas nos prefixos da etapa que o teste nao declara: ${foraDaLista.sort().join('; ')}`);
    const naoTexto = todas.filter(([m, c]) => !/^[\w/:.*-]*$/.test(c) && !esperadas.has(`${m} ${c}`)).map(([m, c]) => `${m} ${c}`);
    const naoTextoNaoMedido = naoTexto.filter((x) => !alemDasRotas.includes(x));
    if (naoTextoNaoMedido.length) erros.push(`rotas montadas com caminho que nao e texto simples: ${naoTextoNaoMedido.sort().join('; ')}`);
  } else {
    erros.push('o despejo nao trouxe todas as rotas (preload antigo?)');
  }
  return erros;
}

// O nome que o despejo da a cada portao do index.js (o `modulosDoPortao` que o portaoDasPropostas pendura): o teste diz o IDENTIFICADOR
// que espera no fonte (o mesmo que o cenario do fonte confere) e a cadeia sai daqui — se a definicao de um portao mudar de modulo no
// index.js, o nome no despejo muda e o cenario das camadas cai.
const PORTAO_NO_DESPEJO = {
  exigirComercialNasPropostas: 'portao:comercial',
  exigirComercialOuOperacionalNaProposta: 'portao:comercial|operacional',
  exigirComercialNoModeloDaProposta: 'portao:comercial+configuracoes',
  exigirComercialOuOperacionalNaOS: 'portao:comercial|operacional',
  exigirComercialNaFamiliaPorConfiguracoes: 'portao:comercial+configuracoes',
  exigirOperacionalNaListaDeOS: 'portao:operacional',
  exigirComercialNasVariaveisTecnicas: 'portao:comercial+configuracoes',
};
function cadeiaDoPortao(identificador) {
  if (!PORTAO_NO_DESPEJO[identificador]) throw new Error(`cadeiaDoPortao: portao desconhecido ${identificador}`);
  return ['authenticateToken', PORTAO_NO_DESPEJO[identificador]];
}

module.exports = { preloadDasCamadas, envDasCamadas, amostrasDasCamadas, lerCamadas, conferirCamadas, instanciar, cadeiaDoPortao, PORTAO_NO_DESPEJO, VERBOS_DOS_EXTRAS };
