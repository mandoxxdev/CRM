/**
 * Formatação de rótulo de localização do almoxarifado.
 *
 * Existiam três cópias quase idênticas de `buildLocalizacaoPath` no client
 * (ConfiguracoesAlmoxarifado, MaterialAlmoxarifadoForm, MapaLocalizacoesAlmoxarifado),
 * nenhuma ciente do almoxarifado. Este módulo é a versão única e ciente.
 *
 * Sobre o almoxarifado: ele NÃO é uma filial — é uma área física de alocação dentro do
 * mesmo site. Por isso entra no rótulo como prefixo de endereço (onde o item está), e não
 * como um escopo de estoque separado.
 */

/**
 * Caminho hierárquico da localização, sem o almoxarifado: `setor / parent / subgrupo`.
 *
 * Comportamento IDÊNTICO às três cópias locais que este módulo substituiu
 * (ConfiguracoesAlmoxarifado, MaterialAlmoxarifadoForm, MapaLocalizacoesAlmoxarifado —
 * eram byte a byte iguais). Preservado de propósito: o pai é rotulado pelo dado mais
 * descritivo que ele tiver (`subgrupo`, senão `descricao`, senão `codigo`), e uma posição
 * raiz sem subgrupo cai na própria descrição. Simplificar para `parent.codigo` empobreceria
 * o rótulo do mapa e dos selects.
 *
 * @param {object} loc localização
 * @param {object[]} allLocs lista completa, para resolver o parent por id
 */
export function buildLocalizacaoPath(loc, allLocs = []) {
  if (!loc) return '';
  const parent = loc.parent_id
    ? allLocs.find(l => String(l.id) === String(loc.parent_id))
    : null;
  const parts = [];
  if (loc.setor) parts.push(loc.setor);
  if (parent) parts.push(parent.subgrupo || parent.descricao || parent.codigo);
  if (loc.subgrupo) parts.push(loc.subgrupo);
  else if (loc.descricao && !parent) parts.push(loc.descricao);
  return parts.join(' / ');
}

/**
 * Código do almoxarifado da localização. Aceita o campo já embutido
 * (`almoxarifado_codigo`, como vem de GET /almoxarifado/localizacoes) ou resolve por
 * `almoxarifado_id` contra uma lista de almoxarifados.
 */
export function resolveAlmoxarifadoCodigo(loc, almoxarifados = []) {
  if (!loc) return '';
  if (loc.almoxarifado_codigo) return loc.almoxarifado_codigo;
  if (loc.almoxarifado_id == null) return '';
  const alm = almoxarifados.find(a => String(a.id) === String(loc.almoxarifado_id));
  return alm?.codigo || '';
}

/**
 * Rótulo completo: `ALM / setor / parent / subgrupo`.
 * Sem almoxarifado resolvido, degrada para o caminho sem prefixo.
 */
export function buildEnderecoPath(loc, allLocs = [], almoxarifados = []) {
  const alm = resolveAlmoxarifadoCodigo(loc, almoxarifados);
  const path = buildLocalizacaoPath(loc, allLocs);
  return [alm, path].filter(Boolean).join(' / ');
}

/**
 * Rótulo para options de select e listagens: `CODIGO — ALM / setor / parent / subgrupo`.
 * É o mesmo formato de `endereco_completo` do backend, mas montado no client onde só
 * temos o objeto de localização.
 */
export function formatLocalizacaoLabel(loc, allLocs = [], almoxarifados = []) {
  if (!loc) return '';
  const endereco = buildEnderecoPath(loc, allLocs, almoxarifados);
  return endereco ? `${loc.codigo} — ${endereco}` : loc.codigo;
}

/**
 * Prefixa um rótulo de localização já pronto (ex.: a coluna desnormalizada
 * `materiais_almoxarifado.localizacao`, que não tem almoxarifado) com o código do
 * almoxarifado vindo à parte na query.
 *
 * Usar quando a tela recebe só o texto congelado e o código separado — não há objeto de
 * localização para formatar.
 */
export function prefixarAlmoxarifado(localizacaoTexto, almoxarifadoCodigo) {
  if (!localizacaoTexto) return '';
  if (!almoxarifadoCodigo) return localizacaoTexto;
  // já prefixado (ex.: endereco_completo do backend) — não duplica
  if (String(localizacaoTexto).startsWith(`${almoxarifadoCodigo} `)) return localizacaoTexto;
  return `${almoxarifadoCodigo} / ${localizacaoTexto}`;
}
