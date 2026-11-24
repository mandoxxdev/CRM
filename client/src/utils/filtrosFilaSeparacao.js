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

/** Fase 5 da 255: rótulos repetidos (dois projetos com o mesmo nome) ganham o número — "Linha 2 (#7)". Muda o Map id -> rótulo. */
const desempatarRotulos = (rotulos) => {
  const vezes = new Map();
  for (const r of rotulos.values()) vezes.set(r, (vezes.get(r) || 0) + 1);
  for (const [id, r] of rotulos) if (vezes.get(r) > 1) rotulos.set(id, `${r} (#${id})`);
  return rotulos;
};

/** Os rótulos dos projetos da fila (id -> rótulo), com o desempate — os mesmos do filtro (RN-255.03) e dos blocos (RN-260.08). */
export const rotulosDosProjetos = (fila) => {
  const projetos = new Map();
  for (const r of Array.isArray(fila) ? fila : []) {
    if (r.projeto_id == null) continue;
    const id = String(r.projeto_id);
    if (!projetos.has(id) || r.projeto_nome) projetos.set(id, rotuloProjeto(id, r.projeto_nome));
  }
  return desempatarRotulos(projetos);
};

// ── Etapa 260 (RN-260.07..09): agrupar a fila por setor ou por projeto ─────────────────────────────────────────────────────────────
export const AGRUPAR_NADA = '';
export const AGRUPAR_SETOR = 'setor';
export const AGRUPAR_PROJETO = 'projeto';
export const CHAVE_AGRUPAR = 'almox.filaSeparacao.agrupar';
const MODOS_AGRUPAR = [AGRUPAR_NADA, AGRUPAR_SETOR, AGRUPAR_PROJETO];

const contagem = (n) => `${n} ${n === 1 ? 'requisição' : 'requisições'}`;

/**
 * RN-260.08: os blocos de uma lista JÁ na ordem do servidor (e já filtrada). Bloco por setor (aparado, a régua da 255; vazio = "Sem
 * setor") ou por projeto (`projeto_id`; sem = "Sem projeto"). A ordem dos blocos é a da PRIMEIRA requisição de cada um (o bloco com a
 * mais urgente vem primeiro); dentro do bloco, a ordem do servidor. `rotulos` = `rotulosDosProjetos(fila inteira)`, para o desempate ser
 * o do filtro. Sem agrupar (ou modo desconhecido): um bloco só, sem título.
 */
export const agruparFila = (lista, modo, rotulos) => {
  const reqs = Array.isArray(lista) ? lista : [];
  if (modo !== AGRUPAR_SETOR && modo !== AGRUPAR_PROJETO) return reqs.length ? [{ chave: '', titulo: null, requisicoes: reqs }] : [];
  const blocos = new Map();
  for (const r of reqs) {
    let chave;
    let nome;
    if (modo === AGRUPAR_SETOR) {
      const s = setorDe(r);
      chave = s ? `s:${s}` : SEM;
      nome = s ? `Setor: ${s}` : 'Sem setor';
    } else {
      const id = r && r.projeto_id != null ? String(r.projeto_id) : '';
      chave = id ? `p:${id}` : SEM;
      const rotulo = id ? ((rotulos && rotulos.get(id)) || rotuloProjeto(id, r.projeto_nome)) : '';
      nome = id ? `Projeto: ${rotulo}` : 'Sem projeto';
    }
    if (!blocos.has(chave)) blocos.set(chave, { chave, nome, requisicoes: [] });
    blocos.get(chave).requisicoes.push(r);
  }
  return [...blocos.values()].map((b) => ({ chave: b.chave, titulo: `${b.nome} — ${contagem(b.requisicoes.length)}`, requisicoes: b.requisicoes }));
};

/** RN-260.07: a opção guardada no navegador (try/catch; valor desconhecido ou sem armazenamento = sem agrupar). */
export const lerAgruparGuardado = () => {
  try {
    const v = window.localStorage.getItem(CHAVE_AGRUPAR);
    return MODOS_AGRUPAR.includes(v) ? v : AGRUPAR_NADA;
  } catch (e) {
    return AGRUPAR_NADA;
  }
};
export const guardarAgrupar = (modo) => {
  try {
    window.localStorage.setItem(CHAVE_AGRUPAR, modo);
  } catch (e) {
    // sem armazenamento: a tela funciona sem lembrar
  }
};

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
  desempatarRotulos(projetos);

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
