/**
 * Etapa 255 (RN-255.03..05, RN-255.09) — os filtros da Fila de separação: setor, projeto e localização. Só esconde: a ordem é a do
 * servidor e nada é pedido de novo (B1599). Funções puras; a tela (FilaSeparacao.js) guarda as escolhas.
 */

export const TODOS = '';
export const SEM = '__sem__';
export const FILTROS_VAZIOS = Object.freeze({ setor: TODOS, projeto: TODOS, local: TODOS });
export const CHAVE_FILTROS = 'almox.filaSeparacao.filtros';

const comparar = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });

/** RN-255.03: o setor aparado; vazio ou só espaço = sem setor. */
export const setorDe = (r) => String((r && r.setor) || '').trim();

/** RN-255.01/08: o rótulo do projeto — o nome, ou "Projeto #<id>" quando o projeto não tem nome (apagado). */
export const rotuloProjeto = (id, nome) => (nome ? String(nome) : `Projeto #${id}`);

/** RN-255.04: o endereço de um item — de onde pegar (a dica) e a origem já separada. */
const caminhosDoItem = (it) => [
  it && it.pegar_em ? (it.pegar_em.caminho || it.pegar_em.localizacao_codigo || null) : null,
  it ? it.origem_separacao_caminho || null : null,
].filter(Boolean).map(String);

export const caminhosDaRequisicao = (r) => ((r && r.itens) || []).flatMap(caminhosDoItem);

/** RN-255.04: a requisição tem algum item listado sem endereço nenhum. */
export const temItemSemEndereco = (r) => ((r && r.itens) || []).some((it) => caminhosDoItem(it).length === 0);

/** 'A / B / C' -> ['A', 'A / B', 'A / B / C']. */
export const prefixosDoCaminho = (caminho) => {
  const segs = String(caminho).split(' / ');
  return segs.map((_, i) => segs.slice(0, i + 1).join(' / '));
};

/** RN-255.04: igual ao escolhido ou abaixo dele, por segmento ('ALM / A' não pega 'ALM / AB'). */
export const caminhoDentroDe = (caminho, escolhido) => caminho === escolhido || String(caminho).startsWith(`${escolhido} / `);

/** RN-255.03..05: a requisição passa nos três filtros (E). */
export const passaNosFiltros = (r, filtros) => {
  const f = filtros || FILTROS_VAZIOS;
  if (f.setor !== TODOS) {
    const s = setorDe(r);
    if (f.setor === SEM ? s !== '' : s !== f.setor) return false;
  }
  if (f.projeto !== TODOS) {
    const p = r && r.projeto_id != null ? String(r.projeto_id) : '';
    if (f.projeto === SEM ? p !== '' : p !== f.projeto) return false;
  }
  if (f.local !== TODOS) {
    if (f.local === SEM) return temItemSemEndereco(r);
    return caminhosDaRequisicao(r).some((c) => caminhoDentroDe(c, f.local));
  }
  return true;
};

export const filtroAtivo = (filtros) => !!filtros && (filtros.setor !== TODOS || filtros.projeto !== TODOS || filtros.local !== TODOS);

/**
 * RN-255.03/04/09: as opções de cada filtro, tiradas da fila carregada, em ordem alfabética (número como número), com "Sem …" no fim
 * quando alguma requisição cai nele. Um valor escolhido que sumiu da fila continua na lista (RN-255.09).
 */
export const opcoesDosFiltros = (fila, filtros) => {
  const lista = Array.isArray(fila) ? fila : [];
  const f = filtros || FILTROS_VAZIOS;

  const setores = new Map();
  let semSetor = false;
  const projetos = new Map();
  let semProjeto = false;
  const locais = new Set();
  let semLocal = false;
  for (const r of lista) {
    const s = setorDe(r);
    if (s) setores.set(s, s); else semSetor = true;
    if (r.projeto_id != null) {
      const id = String(r.projeto_id);
      if (!projetos.has(id) || r.projeto_nome) projetos.set(id, rotuloProjeto(id, r.projeto_nome));
    } else semProjeto = true;
    for (const c of caminhosDaRequisicao(r)) prefixosDoCaminho(c).forEach((p) => locais.add(p));
    if (temItemSemEndereco(r)) semLocal = true;
  }

  const montar = (pares, sem, rotuloSem, escolhido, rotuloDoEscolhido) => {
    const ops = [...pares].map(([valor, rotulo]) => ({ valor, rotulo })).sort((a, b) => comparar(a.rotulo, b.rotulo));
    if (escolhido !== TODOS && escolhido !== SEM && !ops.some((o) => o.valor === escolhido)) {
      ops.push({ valor: escolhido, rotulo: rotuloDoEscolhido(escolhido) });
    }
    if (sem || escolhido === SEM) ops.push({ valor: SEM, rotulo: rotuloSem });
    return ops;
  };

  // Fase 5: dois projetos com o mesmo nome viravam duas opções iguais — o repetido ganha o número, "Linha 2 (#7)".
  const vezes = new Map();
  for (const r of projetos.values()) vezes.set(r, (vezes.get(r) || 0) + 1);
  for (const [id, r] of projetos) if (vezes.get(r) > 1) projetos.set(id, `${r} (#${id})`);

  return {
    setor: montar(setores, semSetor, 'Sem setor', f.setor, (v) => v),
    projeto: montar(projetos, semProjeto, 'Sem projeto', f.projeto, (v) => rotuloProjeto(v, null)),
    local: montar([...locais].map((c) => [c, c]), semLocal, 'Sem localização', f.local, (v) => v),
  };
};

/** RN-255.09: as escolhas guardadas no navegador — leitura e escrita em try/catch; sem elas, "Todos". */
export const lerFiltrosGuardados = () => {
  try {
    const bruto = window.localStorage.getItem(CHAVE_FILTROS);
    if (!bruto) return { ...FILTROS_VAZIOS };
    const o = JSON.parse(bruto) || {};
    const txt = (v) => (typeof v === 'string' ? v : TODOS);
    return { setor: txt(o.setor), projeto: txt(o.projeto), local: txt(o.local) };
  } catch (e) {
    return { ...FILTROS_VAZIOS };
  }
};

export const guardarFiltros = (filtros) => {
  try {
    window.localStorage.setItem(CHAVE_FILTROS, JSON.stringify(filtros));
  } catch (e) {
    // sem armazenamento (janela privada, bloqueio): a tela funciona sem lembrar
  }
};
