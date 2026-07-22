// Diff de itens de proposta para auditoria (add/edit/remove). Puro, testável.
function chaveDe(item) {
  return String(item.codigo_produto || item.descricao || item.nome || '').trim();
}
function nomeDe(item) {
  return String(item.descricao || item.nome || item.codigo_produto || 'item').trim();
}

// Campos comparados na auditoria. IMPORTANTE: apenas os campos que o formulário
// de edição (PropostaForm) realmente ENVIA no payload — senão o item do banco
// (que tem modelo/descritivo_tecnico) sempre "difere" do payload (que não os
// envia) e o log ganha edições espúrias a cada save. `numerico` faz a comparação
// por valor numérico (250000 == "250000" == 250000.0), evitando falso-positivo
// por formatação.
const CAMPOS_COMPARAR = [
  { campo: 'quantidade', label: 'Qtd', numerico: true },
  { campo: 'unidade', label: 'Unidade', numerico: false },
  { campo: 'valor_unitario', label: 'Valor unit.', numerico: true },
  { campo: 'valor_total', label: 'Total', numerico: true },
  { campo: 'familia_produto', label: 'Família', numerico: false },
  { campo: 'regiao_busca', label: 'Região', numerico: false },
];

function normaliza(valor, numerico) {
  if (valor == null) return '';
  if (numerico) {
    const n = Number(valor);
    return Number.isNaN(n) ? String(valor).trim() : String(n);
  }
  return String(valor).trim();
}

// Agrupa itens por chaveDe preservando a ORDEM (lista por chave). Necessário
// porque uma proposta pode ter varios itens do MESMO produto (mesmo
// codigo_produto) — um Map simples colapsaria as duplicatas numa entrada so e
// quebraria a deteccao de inclusao/remocao.
function agruparPorChave(itens) {
  const m = new Map();
  for (const it of (itens || [])) {
    const k = chaveDe(it);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
  return m;
}

function diffItensParaLog(itensAtuais, itensNovos) {
  const antes = agruparPorChave(itensAtuais);
  const depois = agruparPorChave(itensNovos);
  const adicionados = [], removidos = [], editados = [];
  const chaves = new Set([...antes.keys(), ...depois.keys()]);

  for (const k of chaves) {
    const listaA = antes.get(k) || [];
    const listaD = depois.get(k) || [];
    const pares = Math.min(listaA.length, listaD.length);
    // Pares (mesma chave, mesma posicao) -> possivel edicao, agrupada por item.
    for (let i = 0; i < pares; i++) {
      const mudancas = [];
      for (const { campo, label, numerico } of CAMPOS_COMPARAR) {
        if (normaliza(listaA[i][campo], numerico) !== normaliza(listaD[i][campo], numerico)) {
          mudancas.push({ campo, label, antes: listaA[i][campo], depois: listaD[i][campo] });
        }
      }
      if (mudancas.length > 0) editados.push({ chave: k, nome: nomeDe(listaD[i]), mudancas });
    }
    // Sobras em "depois" = itens adicionados; sobras em "antes" = itens removidos.
    for (let i = pares; i < listaD.length; i++) adicionados.push(listaD[i]);
    for (let i = pares; i < listaA.length; i++) removidos.push(listaA[i]);
  }
  return { adicionados, removidos, editados };
}

// Campos que o formulário de edição NÃO gerencia e, portanto, não envia no
// payload. Sem preservação, o re-INSERT do save gravaria null e apagaria esses
// dados dos itens (ex.: descritivo técnico da seção 4.x). Preservados a partir
// do item existente correspondente (mesma chave codigo_produto/descricao).
const CAMPOS_PRESERVAR = [
  'tag', 'modelo', 'categoria', 'descricao_resumida', 'descritivo_tecnico',
  'dados_processo', 'materiais_construtivos', 'utilidades_requeridas',
  'opcionais', 'exclusoes', 'prazo_individual',
];

function mesclarItensPreservandoCampos(itensAtuais, itensNovos) {
  const antesMap = new Map((itensAtuais || []).map((i) => [chaveDe(i), i]));
  return (itensNovos || []).map((novo) => {
    const antigo = antesMap.get(chaveDe(novo));
    if (!antigo) return novo; // item novo: não há de onde preservar
    const merged = { ...novo };
    for (const campo of CAMPOS_PRESERVAR) {
      // só preenche quando o payload não trouxe valor para o campo
      if ((merged[campo] == null || merged[campo] === '') && antigo[campo] != null) {
        merged[campo] = antigo[campo];
      }
    }
    return merged;
  });
}

// Monta um resumo legível de um lado (antes/depois) de uma edição agrupada.
// Ex.: "Qtd: 1, Valor unit.: 250000" — usado no valor_anterior/valor_novo do log.
function resumoLado(mudancas, lado) {
  return mudancas.map((m) => {
    const v = m[lado];
    return `${m.label}: ${v == null || v === '' ? '—' : v}`;
  }).join(', ');
}

module.exports = { diffItensParaLog, chaveDe, nomeDe, resumoLado, CAMPOS_COMPARAR, mesclarItensPreservandoCampos, CAMPOS_PRESERVAR };
