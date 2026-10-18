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
  // Texto que o vendedor digita na coluna DESCRIÇÃO da tabela de preços, direto no preview.
  // Precisa estar AQUI: o formulário não envia este campo, e sem preservá-lo o salvamento
  // da proposta (que apaga e reinsere todos os itens) apagaria o texto digitado.
  'descricao_tabela',
  // Acessórios do item (JSON). Precisa estar aqui pelo mesmo motivo do campo acima: o
  // salvamento apaga e reinsere todos os itens, então qualquer caminho que salve sem mandar
  // os acessórios os apagaria.
  //
  // ATENÇÃO ao apagar acessórios: a restauração abaixo só age quando o payload manda null ou
  // string vazia. Por isso o servidor grava SEMPRE JSON, inclusive '[]' — se gravasse ''
  // para lista vazia, apagar todos os acessórios de um item seria desfeito no save seguinte.
  'acessorios',
];

// Identidade do item para reconhecê-lo entre o que está gravado e o que o salvamento manda: a de chaveDe (código, senão descrição,
// senão nome), sem caixa (o banco grava a descrição em caixa alta e o corpo pode vir em outra — Etapa 142, B922) e com cada parte
// aparada ANTES de cair para a seguinte — como o item_chave gravado (COALESCE(NULLIF(TRIM(codigo), ''), NULLIF(TRIM(descricao), '')));
// com chaveDe um código só de espaços dava identidade vazia (Fase 5, r1 M-1).
function identidadeDe(item) {
  const it = item || {};
  const t = (v) => (v == null ? '' : String(v).trim());
  return (t(it.codigo_produto) || t(it.descricao) || t(it.nome)).toUpperCase();
}

// O id do corpo só "vale" se for inteiro (número ou texto só de dígitos) — null/undefined/'' nunca pareiam (senão dois itens sem id
// casariam por String(undefined)).
function idInteiro(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : null;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return String(Number(v.trim()));
  return null;
}
const temCodigo = (it) => String((it && it.codigo_produto) || '').trim() !== '';

// Etapa 142 (C298, C308) — QUAL item gravado cada item do corpo do PUT é. O salvamento apaga e reinsere todos os itens; quem sabe qual dos
// dois iguais saiu é a tela, que manda o id do item gravado (RN-142.01).
//   por id (RN-142.02): com pelo menos um id que vale — inteiro, de um atual ainda não usado, da mesma identidade (ou os dois sem código:
//     item manual com a descrição editada) — cada item com id que vale fica com o seu; os outros são novos; o atual que ninguém reclamou saiu.
//   por posição (RN-142.03): sem id que vale, o k-ésimo igual do corpo fica com o k-ésimo igual gravado; saem os que sobram (os últimos).
// Devolve { porId, pares (atual ou null, por índice do corpo), sairam }.
function parearItens(itensAtuais, itensCorpo) {
  const atuais = Array.isArray(itensAtuais) ? itensAtuais : [];
  const corpo = Array.isArray(itensCorpo) ? itensCorpo : [];
  const porIdAtual = new Map();
  atuais.forEach((a) => { const k = idInteiro(a && a.id); if (k != null && !porIdAtual.has(k)) porIdAtual.set(k, a); });
  const usados = new Set();
  const paresPorId = corpo.map((it) => {
    const k = idInteiro(it && it.id);
    if (k == null || usados.has(k)) return null;
    const a = porIdAtual.get(k);
    if (!a) return null;
    const mesma = identidadeDe(a) === identidadeDe(it) || (!temCodigo(a) && !temCodigo(it));
    if (!mesma) return null;
    usados.add(k);
    return a;
  });
  let pares;
  let porId = paresPorId.some((p) => p != null);
  if (porId) {
    pares = paresPorId;
  } else {
    const fila = new Map();
    atuais.forEach((a) => { const k = identidadeDe(a); if (!fila.has(k)) fila.set(k, []); fila.get(k).push(a); });
    pares = corpo.map((it) => { const l = fila.get(identidadeDe(it)); return l && l.length ? l.shift() : null; });
  }
  const pareados = new Set(pares.filter(Boolean));
  const sairam = atuais.filter((a) => !pareados.has(a));
  return { porId, pares, sairam };
}

function mesclarItensPreservandoCampos(itensAtuais, itensNovos) {
  // Etapa 142 (C298/C308): o item pareado preserva do SEU gravado. Antes um Map por chaveDe guardava só o ÚLTIMO de cada produto, e
  // com o mesmo produto duas vezes os dois recebiam os campos do último (a descrição da tabela, a tag, os acessórios do primeiro sumiam
  // em todo salvamento). Sem par (item novo): o último gravado da mesma identidade, mesmo que tenha acabado de sair — o de antes da
  // etapa (B920; a primeira versão excluía o que saiu e o produto tirado e incluído de novo no mesmo salvamento perdia a descrição da
  // tabela e o descritivo — Fase 5, r1 I-1).
  const { pares } = parearItens(itensAtuais, itensNovos);
  const ultimoIgual = new Map();
  (Array.isArray(itensAtuais) ? itensAtuais : []).forEach((i) => { ultimoIgual.set(identidadeDe(i), i); });
  return (Array.isArray(itensNovos) ? itensNovos : []).map((novo, idx) => {
    const antigo = pares[idx] || ultimoIgual.get(identidadeDe(novo));
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

module.exports = { diffItensParaLog, chaveDe, identidadeDe, idInteiro, parearItens, nomeDe, resumoLado, CAMPOS_COMPARAR, mesclarItensPreservandoCampos, CAMPOS_PRESERVAR };
