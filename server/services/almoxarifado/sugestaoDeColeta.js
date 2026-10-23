/**
 * Etapa 188 (T1) — a sugestao de coleta da fila de separacao: de onde pegar cada item e em que ordem andar. PURA (sem db):
 * recebe os dados ja lidos (requisitionService.listarFilaSeparacao le uma vez para a fila inteira) e devolve a dica.
 *
 * E so DICA (RN-188.07, B1250): nao grava, nao reserva, nao pega trava. A separacao continua decidindo sob a trava dela
 * (comTravaDaRequisicao); dica velha e recusada pela porta com a literal de sempre (checarOrigemItem).
 *
 * Regras (plano da etapa, com as emendas da Fase 2):
 *  - RN-188.01: um par (endereco, lote) por item — o primeiro, na ordem da RN-188.02, cujo livre cobre o separavel; se nenhum
 *    cobre, o de MAIOR livre (emenda C1; empate pela ordem da 02), cobre false, aviso NENHUM_ENDERECO_COBRE.
 *  - RN-188.01a (emenda C1): item com planejada pendente (origem_separacao_id e separado - entregue > 0) so tem a planejada como
 *    candidata — separar de outro par apagaria a planejada e gravaria uma troca (Etapa 65). Nao cobre / sem livre / nao
 *    sugerivel -> aviso PLANEJADA_NAO_COBRE; nunca outro par.
 *  - RN-188.02: FEFO (validade crescente; sem validade e sem lote por ultimo) -> a padrao -> o livre maior -> o percurso ->
 *    localizacao_id -> lote_id (nulo por ultimo).
 *  - RN-188.03: livre = saldo da linha - o separado pendente planejado no par (todas as requisicoes); os irmaos do mesmo
 *    material, na ordem do pedido (B821), veem o par descontado do sugerido aos anteriores. Material com serie (emenda I3):
 *    limitado tambem pelas series EM_ESTOQUE do lote menos o planejado de todos os pares do lote.
 *  - RN-188.04: candidatoSugerivel.
 *  - RN-188.05: caminhoDaLocalizacao / compararCaminho.
 *  - RN-188.06: ordem_coleta.
 *
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa188-sugestao-de-coleta-na-fila-de-separacao.md
 */
const Q = require('./quantidade');
const stockService = require('./stockService');
const lotService = require('./lotService');

const AVISO = Object.freeze({
  NENHUM_ENDERECO_COBRE: 'NENHUM_ENDERECO_COBRE',
  SEM_ENDERECO_SUGERIVEL: 'SEM_ENDERECO_SUGERIVEL',
  PLANEJADA_NAO_COBRE: 'PLANEJADA_NAO_COBRE',
  // Fase 5 (M-d): a planejada existe mas nao pode mais ser dica (endereco bloqueado/inativo, area especial, lote bloqueado/vencido)
  // — "o resto nao cabe la" enganava (o saldo pode estar la; o endereco e que nao serve).
  PLANEJADA_INDISPONIVEL: 'PLANEJADA_INDISPONIVEL',
});
// Fase 5 (I-a): alerta que convive com o aviso (campo proprio, pegar_em_alerta). A retencao (bloqueado, em inspecao, em terceiros) e
// do MATERIAL, nao do endereco (schema.js, comentario da estoque_saldo_almoxarifado): com retencao > 0 o sistema nao sabe se o
// endereco sugerido tem as pecas boas ou as retidas.
const ALERTA = Object.freeze({ RETENCAO_NO_MATERIAL: 'RETENCAO_NO_MATERIAL' });
const EPS = 1e-9;
const SEM_VALIDADE = '9999-12-31'; // a mesma chave do listarLotesDoMaterial

const num = (v) => Number(v) || 0;
const idOuNulo = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
function chavePar(materialId, localizacaoId, loteId) {
  return `${Number(materialId)}|${idOuNulo(localizacaoId)}|${idOuNulo(loteId)}`;
}
function chaveLote(materialId, loteId) {
  return `${Number(materialId)}|${idOuNulo(loteId)}`;
}

/**
 * RN-188.05 — o caminho na arvore: { segmentos: [codigo do almoxarifado?, raiz, ..., pai, endereco], temAlmoxarifado }.
 * O almoxarifado e o do endereco (ou do ancestral mais proximo que tenha). Guarda de ciclo (molde resolverAreaEfetiva).
 * `arvore`: Map(id -> { id, parent_id, codigo, almoxarifado_codigo, ... }).
 */
function caminhoDaLocalizacao(arvore, localizacaoId) {
  const codigos = [];
  const vistos = new Set();
  let almox = null;
  let atual = arvore.get(Number(localizacaoId));
  while (atual && !vistos.has(Number(atual.id))) {
    vistos.add(Number(atual.id));
    codigos.unshift(String(atual.codigo));
    if (!almox && atual.almoxarifado_codigo) almox = String(atual.almoxarifado_codigo);
    atual = atual.parent_id ? arvore.get(Number(atual.parent_id)) : null;
  }
  return { segmentos: almox ? [almox, ...codigos] : codigos, temAlmoxarifado: !!almox };
}

/** RN-188.05 — numero como numero (A-2 antes de A-10), prefixo antes do descendente, sem almoxarifado por ultimo. */
function compararCaminho(a, b) {
  if (a.temAlmoxarifado !== b.temAlmoxarifado) return a.temAlmoxarifado ? -1 : 1;
  const n = Math.min(a.segmentos.length, b.segmentos.length);
  for (let i = 0; i < n; i += 1) {
    const c = a.segmentos[i].localeCompare(b.segmentos[i], 'pt-BR', { numeric: true, sensitivity: 'base' });
    if (c !== 0) return c;
  }
  return a.segmentos.length - b.segmentos.length;
}

/**
 * RN-188.04 — a linha pode ser dica? (sem olhar o livre, que e da RN-188.03). Reusa a regua da porta
 * (motivoRecusaEndereco 'origem': se a porta apertar, a dica aperta junto), a area efetiva da Etapa 68 (vagaComum: area
 * especial nunca, exceto area de cliente para material de cliente) e as reguas de lote do motor.
 * Diverge do molde da 68 num ponto (M3, B1253): a padrao em area especial tambem nao e sugerida.
 */
function candidatoSugerivel(linha, { arvore, material, hojeISO }) {
  if (!linha || linha.localizacao_id === null || linha.localizacao_id === undefined) return false;
  const loc = arvore.get(Number(linha.localizacao_id));
  if (!loc) return false;
  if (Number(loc.ativo) !== 1) return false;
  if (loc.almoxarifado_id && loc.almoxarifado_ativo !== null && loc.almoxarifado_ativo !== undefined
    && Number(loc.almoxarifado_ativo) !== 1) return false;
  if (stockService.motivoRecusaEndereco(loc, material || {}, 'origem')) return false;
  const area = stockService.resolverAreaEfetiva(arvore, loc.id);
  if (area && !(area.chave === 'MATERIAIS_CLIENTE' && material && material.proprietario_cliente_id)) return false;
  if (linha.lote_id !== null && linha.lote_id !== undefined) {
    const lote = { status: linha.lote_status, data_validade: linha.lote_validade, vencimento_liberado_em: linha.lote_vencimento_liberado_em };
    if (lote.status !== 'ATIVO') return false;
    if (lotService.isVencido(lote, hojeISO) && !lotService.vencimentoLiberado(lote)) return false;
  }
  return true;
}

/**
 * RN-188.01/01a/02/03/06 — a dica de UMA requisicao.
 * Entrada:
 *  - itens: [{ item_id, material_id, material_codigo, separavel, origem_separacao_id, lote_separacao_id, separado_pendente }] na
 *    ORDEM DO PEDIDO (B821);
 *  - candidatosPorMaterial: Map(material_id -> [{ localizacao_id, lote_id, quantidade, lote_codigo, lote_status, lote_validade,
 *    lote_vencimento_liberado_em }]);
 *  - planejadoPorPar: Map(chavePar -> separado pendente planejado no par, de todas as requisicoes ativas);
 *  - arvore: Map(id -> localizacao com almoxarifado_codigo/almoxarifado_ativo);
 *  - material: Map(material_id -> { localizacao_padrao_id, proprietario_cliente_id, controle_serie, tipo_material });
 *  - seriesPorLote: Map(chaveLote -> series EM_ESTOQUE), so dos materiais com serie;
 *  - hojeISO: o dia (lotService.isVencido).
 * Saida: { porItem: Map(item_id -> { pegar_em, pegar_em_aviso }), ordem_coleta: [...] }.
 */
function sugerirColeta({ itens, candidatosPorMaterial, planejadoPorPar, arvore, material, seriesPorLote, hojeISO }) {
  const planejado = planejadoPorPar || new Map();
  const series = seriesPorLote || new Map();
  const caminhos = new Map(); // memo por localizacao_id (Fase 2, d)
  const caminhoDe = (locId) => {
    if (!caminhos.has(locId)) caminhos.set(locId, caminhoDaLocalizacao(arvore, locId));
    return caminhos.get(locId);
  };
  // Planejado somado por lote (I3: as series do lote descontam o planejado de todos os pares dele).
  const planejadoPorLote = new Map();
  for (const [k, q] of planejado) {
    const [m, , lote] = k.split('|');
    const kl = `${m}|${lote}`;
    planejadoPorLote.set(kl, (planejadoPorLote.get(kl) || 0) + num(q));
  }
  const sugeridoPorPar = new Map(); // o consumo dos irmaos desta requisicao
  const sugeridoPorLote = new Map();

  const livreDe = (mat, linha) => {
    const kp = chavePar(linha.material_id ?? mat.id, linha.localizacao_id, linha.lote_id);
    let livre = num(linha.quantidade) - num(planejado.get(kp)) - num(sugeridoPorPar.get(kp));
    if (mat && Number(mat.controle_serie) === 1) {
      const kl = chaveLote(linha.material_id ?? mat.id, linha.lote_id);
      const teto = num(series.get(kl)) - num(planejadoPorLote.get(kl)) - num(sugeridoPorLote.get(kl));
      livre = Math.min(livre, teto);
    }
    return Q.qtd(Math.max(0, livre));
  };
  const montar = (linha, livre, separavel) => {
    const loc = arvore.get(Number(linha.localizacao_id));
    const sugerida = Q.qtd(Math.min(separavel, livre));
    return {
      localizacao_id: Number(linha.localizacao_id),
      localizacao_codigo: loc.codigo,
      caminho: caminhoDe(Number(linha.localizacao_id)).segmentos.join(' / '),
      lote_id: idOuNulo(linha.lote_id),
      lote_codigo: linha.lote_id ? (linha.lote_codigo || null) : null,
      lote_validade: linha.lote_id && linha.lote_validade ? String(linha.lote_validade).slice(0, 10) : null,
      quantidade_no_endereco: livre,
      quantidade_sugerida: sugerida,
      cobre: sugerida + EPS >= separavel,
    };
  };
  const ordem = (mat) => (a, b) => {
    const va = a.linha.lote_id ? String(a.linha.lote_validade || SEM_VALIDADE).slice(0, 10) : SEM_VALIDADE;
    const vb = b.linha.lote_id ? String(b.linha.lote_validade || SEM_VALIDADE).slice(0, 10) : SEM_VALIDADE;
    if (va !== vb) return va < vb ? -1 : 1;
    const padrao = idOuNulo(mat && mat.localizacao_padrao_id);
    const pa = Number(a.linha.localizacao_id) === padrao; const pb = Number(b.linha.localizacao_id) === padrao;
    if (pa !== pb) return pa ? -1 : 1;
    if (Math.abs(a.livre - b.livre) > EPS) return b.livre - a.livre;
    const c = compararCaminho(caminhoDe(Number(a.linha.localizacao_id)), caminhoDe(Number(b.linha.localizacao_id)));
    if (c !== 0) return c;
    if (Number(a.linha.localizacao_id) !== Number(b.linha.localizacao_id)) return Number(a.linha.localizacao_id) - Number(b.linha.localizacao_id);
    const la = idOuNulo(a.linha.lote_id); const lb = idOuNulo(b.linha.lote_id);
    if (la === lb) return 0;
    if (la === null) return 1;
    if (lb === null) return -1;
    return la - lb;
  };

  const porItem = new Map();
  const paradas = [];
  (itens || []).forEach((it, pos) => {
    const separavel = Q.qtd(Math.max(0, num(it.separavel)));
    if (separavel <= EPS) { porItem.set(it.item_id, { pegar_em: null, pegar_em_aviso: null }); return; }
    const mat = (material && material.get(Number(it.material_id))) || { id: Number(it.material_id) };
    const linhas = (candidatosPorMaterial && candidatosPorMaterial.get(Number(it.material_id))) || [];
    const ctx = { arvore, material: mat, hojeISO };
    let escolha = null; let aviso = null;
    const temPlanejada = it.origem_separacao_id !== null && it.origem_separacao_id !== undefined
      && num(it.separado_pendente) > EPS;
    if (temPlanejada) {
      // RN-188.01a: so o par planejado.
      const linha = linhas.find((l) => Number(l.localizacao_id) === Number(it.origem_separacao_id)
        && idOuNulo(l.lote_id) === idOuNulo(it.lote_separacao_id));
      // Fase 5 (M-d): sem linha de saldo, o endereco ainda pode estar bloqueado/inativo/em area especial — confere so o endereco.
      const sugerivel = linha ? candidatoSugerivel(linha, ctx)
        : candidatoSugerivel({ localizacao_id: it.origem_separacao_id, lote_id: null }, ctx);
      const livre = linha && sugerivel ? livreDe(mat, linha) : 0;
      if (!sugerivel) {
        aviso = AVISO.PLANEJADA_INDISPONIVEL;
      } else if (livre > EPS) {
        escolha = { linha, livre };
        if (livre + EPS < separavel) aviso = AVISO.PLANEJADA_NAO_COBRE;
      } else {
        aviso = AVISO.PLANEJADA_NAO_COBRE;
      }
    } else {
      const cands = linhas.filter((l) => candidatoSugerivel(l, ctx))
        .map((l) => ({ linha: l, livre: livreDe(mat, l) }))
        .filter((c) => c.livre > EPS)
        .sort(ordem(mat));
      if (!cands.length) {
        aviso = AVISO.SEM_ENDERECO_SUGERIVEL;
      } else {
        escolha = cands.find((c) => c.livre + EPS >= separavel) || null;
        if (!escolha) {
          // Emenda C1: nenhum cobre -> o de maior livre (o resto que vira troca e o menor); empate pela ordem da 02.
          escolha = cands.reduce((m, c) => (c.livre > m.livre + EPS ? c : m), cands[0]);
          aviso = AVISO.NENHUM_ENDERECO_COBRE;
        }
      }
    }
    const pegarEm = escolha ? montar(escolha.linha, escolha.livre, separavel) : null;
    porItem.set(it.item_id, { pegar_em: pegarEm, pegar_em_aviso: aviso });
    if (pegarEm) {
      const kp = chavePar(it.material_id, pegarEm.localizacao_id, pegarEm.lote_id);
      sugeridoPorPar.set(kp, num(sugeridoPorPar.get(kp)) + pegarEm.quantidade_sugerida);
      const kl = chaveLote(it.material_id, pegarEm.lote_id);
      sugeridoPorLote.set(kl, num(sugeridoPorLote.get(kl)) + pegarEm.quantidade_sugerida);
      paradas.push({ pos, it, pegarEm });
    }
  });

  // RN-188.06: pelo percurso do endereco sugerido; empate pela ordem do pedido, depois lote_id.
  paradas.sort((a, b) => {
    const c = compararCaminho(caminhoDe(a.pegarEm.localizacao_id), caminhoDe(b.pegarEm.localizacao_id));
    if (c !== 0) return c;
    if (a.pegarEm.localizacao_id !== b.pegarEm.localizacao_id) return a.pegarEm.localizacao_id - b.pegarEm.localizacao_id;
    if (a.pos !== b.pos) return a.pos - b.pos;
    return num(a.pegarEm.lote_id) - num(b.pegarEm.lote_id);
  });
  const ordemColeta = paradas.map(({ it, pegarEm }) => ({
    item_id: it.item_id, material_codigo: it.material_codigo || null, localizacao_id: pegarEm.localizacao_id,
    localizacao_codigo: pegarEm.localizacao_codigo, caminho: pegarEm.caminho, lote_codigo: pegarEm.lote_codigo,
    quantidade_sugerida: pegarEm.quantidade_sugerida,
  }));
  return { porItem, ordem_coleta: ordemColeta };
}

/**
 * Fase 5 (I-a) — o alerta de retencao de UMA linha da fila: 'RETENCAO_NO_MATERIAL' quando ha dica (pegar_em) e o material tem
 * retido > 0 (bloqueado + em inspecao + em terceiros); senao null. A dica continua (o saldo do endereco existe), mas nao pode ser
 * dada como certa: o sistema nao sabe em que endereco estao as pecas retidas.
 */
function alertaDeRetencao(pegarEm, material) {
  if (!pegarEm || !material) return null;
  return num(material.retido) > EPS ? ALERTA.RETENCAO_NO_MATERIAL : null;
}

module.exports = {
  AVISO, ALERTA, alertaDeRetencao, chavePar, chaveLote, caminhoDaLocalizacao, compararCaminho, candidatoSugerivel, sugerirColeta,
};
