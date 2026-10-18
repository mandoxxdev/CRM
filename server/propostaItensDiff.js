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
  // Etapa 143 (RN-143.04, Fase 2 I-4): com o pareamento por id, o item manual com a descricao editada fica com o SEU gravado (os dois sem
  // codigo) — sem comparar a descricao, trocar so o texto dele nao deixava rastro (antes era "removido A + adicionado B"). Sem caixa e
  // aparada: o servidor grava em caixa alta, e o dado antigo em caixa baixa nao pode virar edicao em todo salvamento.
  // `gravado` (Fase 5, r1 M-2): compara o valor que o INSERT GRAVA, nao o cru do corpo — `descricao || nome`, `quantidade || 1`,
  // `unidade || 'UN'`. Sem isso o corpo com `nome` e sem `descricao` (so pela API) registrava "Descricao: X -> —" em todo salvamento.
  { campo: 'descricao', label: 'Descrição', numerico: false, caixa: true, gravado: (it) => it.descricao || it.nome || '' },
  { campo: 'quantidade', label: 'Qtd', numerico: true, gravado: (it) => it.quantidade || 1 },
  { campo: 'unidade', label: 'Unidade', numerico: false, gravado: (it) => it.unidade || 'UN' },
  { campo: 'valor_unitario', label: 'Valor unit.', numerico: true },
  { campo: 'valor_total', label: 'Total', numerico: true },
  { campo: 'familia_produto', label: 'Família', numerico: false },
  { campo: 'regiao_busca', label: 'Região', numerico: false },
];

function normaliza(valor, numerico, caixa) {
  if (valor == null) return '';
  if (caixa) return String(valor).trim().toUpperCase();
  if (numerico) {
    const n = Number(valor);
    return Number.isNaN(n) ? String(valor).trim() : String(n);
  }
  return String(valor).trim();
}

// Etapa 143 (RN-143.04): o histórico usa o MESMO pareamento da mesclagem e da religação (parearItens, abaixo): o item do corpo com par
// é comparado com o SEU gravado; sem par, "adicionado"; o gravado que saiu, "removido". Antes agrupava por chaveDe e pareava por POSIÇÃO
// dentro do grupo de iguais — tirar o primeiro de dois (com o id do que ficou) registrava "editado" no primeiro e "removido" no segundo,
// enquanto as variáveis manuais e os campos preservados seguiam o certo. Por id, o item novo da mesma identidade de um que saiu é
// "adicionado" + "removido" — o que a religação faz com as variáveis dele (B931).
function diffItensParaLog(itensAtuais, itensNovos) {
  const novos = Array.isArray(itensNovos) ? itensNovos : [];
  const { pares, sairam } = parearItens(itensAtuais, novos);
  const adicionados = [], editados = [];
  novos.forEach((novo, idx) => {
    const atual = pares[idx];
    if (!atual) { adicionados.push(novo); return; }
    const mudancas = [];
    for (const { campo, label, numerico, caixa, gravado } of CAMPOS_COMPARAR) {
      const antes = gravado ? gravado(atual) : atual[campo];
      const depois = gravado ? gravado(novo) : novo[campo];
      if (normaliza(antes, numerico, caixa) !== normaliza(depois, numerico, caixa)) {
        mudancas.push({ campo, label, antes, depois });
      }
    }
    if (mudancas.length > 0) editados.push({ chave: chaveDe(novo), nome: nomeDe(novo), mudancas });
  });
  return { adicionados, removidos: sairam, editados };
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

// Etapa 143 (RN-143.01/02/03, C310) — o corpo cujo `itens` não é lista, ou tem elemento que não é objeto, é recusado ANTES de qualquer
// gravação, nas três portas que criam ou regravam itens (o PUT e o POST de /api/propostas, a geração automática). Antes: `[null]` fazia o
// PUT nunca responder (a exceção saía num callback do banco) e, com o corpo de tamanho diferente do gravado, depois do DELETE dos itens;
// número, texto e lista viravam item vazio com 200; o POST engolia o nulo; a geração automática dava 500. `null` e ausente passam (o
// `itens: null` do PUT apaga todos — contrato da Etapa 138); `{}` dentro da lista passa (o de sempre: item sem descrição).
const MSG_ITENS_LISTA = 'Itens inválidos: os itens da proposta devem ser enviados como uma lista.';
const MSG_ITEM_INVALIDO = 'Item inválido: cada item da proposta deve ser um objeto.';
// Fase 5 (r1 I-1, r2 M, B934): também o item cujo CAMPO é objeto ou lista (fora `acessorios`, que é lista de propósito). `descricao: {}`
// com o corpo do tamanho do gravado fazia o PUT nunca responder do mesmo jeito (o `.trim` do compararItens dentro do callback do banco), e
// de outro tamanho gravava "[object Object]" com 200; no histórico, uma descrição com `toString` que não é função derrubava o registro.
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const ehEscalar = (v) => v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
const CAMPOS_ESTRUTURADOS = new Set(['acessorios']);
const itemValido = (it) => ehObjeto(it) && Object.keys(it).every((k) => CAMPOS_ESTRUTURADOS.has(k) || ehEscalar(it[k]));
function validarItensDoCorpo(itens) {
  if (itens === undefined || itens === null) return null;
  if (!Array.isArray(itens)) return MSG_ITENS_LISTA;
  for (let i = 0; i < itens.length; i++) if (!itemValido(itens[i])) return MSG_ITEM_INVALIDO;
  return null;
}

// Monta um resumo legível de um lado (antes/depois) de uma edição agrupada.
// Ex.: "Qtd: 1, Valor unit.: 250000" — usado no valor_anterior/valor_novo do log.
function resumoLado(mudancas, lado) {
  return mudancas.map((m) => {
    const v = m[lado];
    return `${m.label}: ${v == null || v === '' ? '—' : v}`;
  }).join(', ');
}

module.exports = { validarItensDoCorpo, MSG_ITENS_LISTA, MSG_ITEM_INVALIDO, diffItensParaLog, chaveDe, identidadeDe, idInteiro, parearItens, nomeDe, resumoLado, CAMPOS_COMPARAR, mesclarItensPreservandoCampos, CAMPOS_PRESERVAR };
