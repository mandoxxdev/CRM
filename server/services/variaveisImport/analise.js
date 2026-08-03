/**
 * Análise da planilha contra o que já existe no banco.
 *
 * Funções puras de propósito: recebem os dados já lidos e devolvem o relatório
 * de preview e o plano de gravação. Nada aqui abre conexão nem grava — assim dá
 * para testar todos os casos de borda sem subir banco.
 *
 * Fluxo: parsePlanilha -> analisar -> [usuário decide] -> planejarAplicacao -> rota grava.
 */

const { normalizar, compararTextos, encontrarSimilares } = require('./similaridade');

const LIMIAR_PADRAO = 0.8;

/** Ações que o usuário pode escolher para cada linha da planilha. */
const ACOES = {
  CRIAR: 'criar',                  // cadastra como variável nova
  MANTER: 'manter',                // descarta a linha, preserva o que está no banco
  SOBRESCREVER: 'sobrescrever',    // atualiza a existente com os dados da planilha
  MESCLAR_OPCOES: 'mesclar_opcoes' // mantém a existente e só acrescenta as opções
};

const SITUACOES = {
  NOVA: 'nova',
  EXISTENTE: 'existente',
  CONFLITO: 'conflito'
};

/** Lê o campo `opcoes` da variável do banco, que vem como JSON em TEXT. */
function lerOpcoesExistentes(valor) {
  let bruto = valor;
  if (typeof bruto === 'string') {
    try { bruto = JSON.parse(bruto); } catch (_) { return []; }
  }
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((o) => (typeof o === 'string' ? o : (o && o.valor != null ? String(o.valor) : '')))
    .filter(Boolean);
}

/**
 * Resolve um token de família da planilha ("F01", "Masseira Helicoidal ATM",
 * "10") para uma família cadastrada.
 */
function resolverFamilia(token, legenda, familiasExistentes) {
  const alvo = String(token || '').trim();
  if (!alvo) return null;
  const alvoNorm = normalizar(alvo);

  // 1) Código da legenda da própria planilha: F01 -> "Masseira Helicoidal ATM"
  const naLegenda = (legenda || []).find((l) => normalizar(l.codigo) === alvoNorm);
  if (naLegenda) {
    const porNomeLegenda = (familiasExistentes || []).find(
      (f) => normalizar(f.nome) === normalizar(naLegenda.nome)
    );
    if (porNomeLegenda) return porNomeLegenda;
  }

  // 2) Nome exato de família cadastrada
  const porNome = (familiasExistentes || []).find((f) => normalizar(f.nome) === alvoNorm);
  if (porNome) return porNome;

  // 3) Código numérico da tabela familias_produto
  const num = parseInt(alvo, 10);
  if (!isNaN(num) && String(num) === alvo.replace(/^0+/, '')) {
    const porCodigo = (familiasExistentes || []).find((f) => f.codigo != null && Number(f.codigo) === num);
    if (porCodigo) return porCodigo;
  }

  // 4) Última tentativa: nome muito parecido (grafia divergente no cadastro).
  //    Limiar alto de propósito — associar variável à família errada é pior do
  //    que deixar o usuário corrigir a planilha.
  const alvoNomeBusca = naLegenda ? naLegenda.nome : alvo;
  const similares = encontrarSimilares(alvoNomeBusca, familiasExistentes || [], { limiar: 0.9, limite: 1 });
  if (similares.length > 0) return similares[0];

  return null;
}

/**
 * Compara cada variável da planilha com o cadastro atual.
 *
 * @param {Array} variaveisPlanilha  saída de parsePlanilha().variaveis
 * @param {Array} variaveisExistentes  linhas de variaveis_tecnicas (ativas)
 * @param {Array} familiasExistentes   linhas de familias_produto (ativas)
 * @param {Array} legendaFamilias      saída de parsePlanilha().familias
 * @param {object} [opcoes]
 * @param {number} [opcoes.limiar=0.8] score mínimo para marcar conflito
 */
function analisar(variaveisPlanilha, variaveisExistentes, familiasExistentes, legendaFamilias, opcoes) {
  const cfg = opcoes || {};
  const limiar = typeof cfg.limiar === 'number' ? cfg.limiar : LIMIAR_PADRAO;

  const existentes = (variaveisExistentes || []).map((v) => ({
    id: v.id,
    chave: v.chave,
    nome: v.nome,
    tipo: v.tipo,
    categoria: v.categoria,
    prefixo: v.prefixo,
    sufixo: v.sufixo,
    ordem: v.ordem,
    opcoes: lerOpcoesExistentes(v.opcoes)
  }));

  const porChave = new Map(existentes.map((v) => [v.chave, v]));
  const porNome = new Map(existentes.map((v) => [normalizar(v.nome), v]));

  const itens = (variaveisPlanilha || []).map((linha) => {
    // Casamento direto: mesma chave ou mesmo nome depois de normalizar.
    const exata = porChave.get(linha.chave) || porNome.get(normalizar(linha.nome)) || null;

    // Só procura parecidas quando não houve casamento exato — senão toda
    // variável viraria "conflito" consigo mesma.
    const similares = exata
      ? []
      : encontrarSimilares(linha.nome, existentes, { limiar, limite: 5 }).map((s) => ({
          id: s.id,
          chave: s.chave,
          nome: s.nome,
          tipo: s.tipo,
          opcoes: s.opcoes,
          percentual: s.percentual,
          similaridade: s.similaridade,
          detalhe: s.detalhe
        }));

    let situacao = SITUACOES.NOVA;
    if (exata) situacao = SITUACOES.EXISTENTE;
    else if (similares.length > 0) situacao = SITUACOES.CONFLITO;

    // Resolução das famílias citadas na linha.
    const familiasResolvidas = [];
    const familiasNaoEncontradas = [];
    (linha.familias || []).forEach((token) => {
      const fam = resolverFamilia(token, legendaFamilias, familiasExistentes);
      if (fam) {
        if (!familiasResolvidas.some((f) => f.id === fam.id)) {
          familiasResolvidas.push({ id: fam.id, nome: fam.nome, codigo: fam.codigo, token });
        }
      } else {
        familiasNaoEncontradas.push(token);
      }
    });

    // Opções: quais já existem na variável casada e quais entrariam de novo.
    const opcoesAtuais = exata ? exata.opcoes : [];
    const atuaisNorm = new Set(opcoesAtuais.map(normalizar));
    const opcoesNovas = (linha.opcoes || [])
      .filter((o) => !atuaisNorm.has(normalizar(o.valor)))
      .map((o) => o.valor);

    return {
      linha: linha.linha,
      nome: linha.nome,
      chave: linha.chave,
      tipo: linha.tipo,
      categoria: linha.categoria,
      prefixo: linha.prefixo,
      sufixo: linha.sufixo,
      ordem: linha.ordem,
      implicita: !!linha.implicita,
      opcoes: (linha.opcoes || []).map((o) => ({ valor: o.valor, familias: o.familias || [] })),
      opcoesNovas,
      familiasTokens: linha.familias || [],
      familiasResolvidas,
      familiasNaoEncontradas,
      situacao,
      existente: exata
        ? { id: exata.id, chave: exata.chave, nome: exata.nome, tipo: exata.tipo, opcoes: exata.opcoes }
        : null,
      similares,
      // Sugestão inicial. Conflito fica sem sugestão de propósito: é a linha que
      // exige olho humano, e é justamente ela que abre o popup na tela.
      acaoSugerida: situacao === SITUACOES.NOVA
        ? ACOES.CRIAR
        : (situacao === SITUACOES.EXISTENTE ? ACOES.MESCLAR_OPCOES : null)
    };
  });

  const resumo = {
    total: itens.length,
    novas: itens.filter((i) => i.situacao === SITUACOES.NOVA).length,
    existentes: itens.filter((i) => i.situacao === SITUACOES.EXISTENTE).length,
    conflitos: itens.filter((i) => i.situacao === SITUACOES.CONFLITO).length,
    totalOpcoes: itens.reduce((s, i) => s + i.opcoes.length, 0),
    opcoesNovas: itens.reduce((s, i) => s + i.opcoesNovas.length, 0),
    familiasNaoEncontradas: Array.from(
      new Set(itens.reduce((acc, i) => acc.concat(i.familiasNaoEncontradas), []))
    )
  };

  return { resumo, itens, limiar };
}

/**
 * Converte as decisões do usuário em operações de banco.
 *
 * @param {object} relatorio  saída de analisar()
 * @param {object} decisoes   { [chave]: { acao, alvo_id? } }
 * @param {object} [opcoes]
 * @param {boolean} [opcoes.aplicarFamilias=true]
 * @returns {{operacoes:Array, pendentes:Array}}  pendentes = conflitos sem decisão
 */
function planejarAplicacao(relatorio, decisoes, opcoes) {
  const cfg = opcoes || {};
  const aplicarFamilias = cfg.aplicarFamilias !== false;
  const mapa = decisoes || {};
  const operacoes = [];
  const pendentes = [];

  (relatorio.itens || []).forEach((item) => {
    const escolha = mapa[item.chave] || {};
    const acao = escolha.acao || item.acaoSugerida;

    // Conflito sem decisão explícita não entra: criar às cegas geraria a
    // duplicata que a checagem existe para evitar.
    if (!acao) {
      pendentes.push({ chave: item.chave, nome: item.nome, motivo: 'Conflito de similaridade sem decisão do usuário.' });
      return;
    }

    if (acao === ACOES.MANTER) {
      operacoes.push({ tipo: 'ignorar', chave: item.chave, nome: item.nome });
      return;
    }

    if (acao === ACOES.CRIAR) {
      operacoes.push({
        tipo: 'criar',
        chave: item.chave,
        nome: item.nome,
        dados: item,
        opcoesFinais: item.opcoes.map((o) => o.valor),
        familias: aplicarFamilias ? item.familiasResolvidas : [],
        opcoesComFamilia: aplicarFamilias ? item.opcoes : []
      });
      return;
    }

    // Sobrescrever e mesclar precisam saber qual registro do banco é o alvo.
    const alvoId = escolha.alvo_id != null
      ? Number(escolha.alvo_id)
      : (item.existente ? item.existente.id : null);

    if (!alvoId) {
      pendentes.push({ chave: item.chave, nome: item.nome, motivo: 'Ação "' + acao + '" sem variável de destino.' });
      return;
    }

    const alvo = item.existente && item.existente.id === alvoId
      ? item.existente
      : (item.similares || []).find((s) => s.id === alvoId);

    if (!alvo) {
      pendentes.push({ chave: item.chave, nome: item.nome, motivo: 'Variável de destino não confere com a análise.' });
      return;
    }

    const opcoesAlvo = alvo.opcoes || [];
    let opcoesFinais;
    if (acao === ACOES.SOBRESCREVER) {
      // Planilha manda: a lista dela substitui a atual.
      opcoesFinais = item.opcoes.map((o) => o.valor);
    } else {
      // Mesclar: mantém a ordem atual e acrescenta o que ainda não existe.
      const vistos = new Set(opcoesAlvo.map(normalizar));
      opcoesFinais = opcoesAlvo.slice();
      item.opcoes.forEach((o) => {
        const k = normalizar(o.valor);
        if (!vistos.has(k)) { vistos.add(k); opcoesFinais.push(o.valor); }
      });
    }

    operacoes.push({
      tipo: 'atualizar',
      acao,
      chave: item.chave,
      alvoId,
      alvoChave: alvo.chave,
      nome: item.nome,
      dados: item,
      // Em mesclar_opcoes o cadastro da variável fica intacto: só a lista muda.
      atualizarCadastro: acao === ACOES.SOBRESCREVER,
      opcoesFinais,
      familias: aplicarFamilias ? item.familiasResolvidas : [],
      opcoesComFamilia: aplicarFamilias ? item.opcoes : []
    });
  });

  return { operacoes, pendentes };
}

module.exports = {
  analisar,
  planejarAplicacao,
  resolverFamilia,
  lerOpcoesExistentes,
  ACOES,
  SITUACOES,
  LIMIAR_PADRAO
};
