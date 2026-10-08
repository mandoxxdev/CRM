/**
 * Opções do formulário de pedido de compra — Etapa 32 / G1b, restaurada na Etapa 39 (RN-39.06).
 *
 * O P.O. foi direto: *"todas as opções do formulário devem ser botões, não quero o usuário
 * escrevendo nada"*. Para virar botão, a opção precisa existir em algum lugar — e este é o
 * lugar. Uma lista só, no servidor, e não espalhada em `<option>` dentro do JSX: a mesma lista
 * vai ser lida pela impressão (Etapa 40) e por qualquer relatório depois.
 *
 * As listas FIXAS são o piso, não o teto: cada uma é unida ao que a empresa já usou de verdade
 * (DISTINCT nos pedidos existentes, LIMIT 40). Assim a tela aprende com o uso sem ninguém editar
 * código, e nenhum pedido antigo fica com um valor que a tela nova não sabe mostrar.
 *
 * ⚠️ O QUE MUDOU EM RELAÇÃO À ETAPA 32 (`b3abc723`), e por quê:
 * - `proximo_numero` SAIU: era o número DIGITADO da 32, e desde a Etapa 38 o número do pedido é
 *   GERADO pelo servidor (`PC-…`, B19). Sugerir um número que ninguém digita confundiria a tela.
 * - As chaves ganharam os nomes do contrato congelado da Etapa 39 (`frete_modalidades`,
 *   `condicoes_pagamento`, `vias_transporte`, `ipi_sugerido`) — plural para a lista, singular era o
 *   nome da COLUNA. `total_materiais` também saiu: a tela de pedido da 38 já tem a busca própria
 *   (`GET /api/compras/materiais`) e avisa por ela.
 * - `empresa` vem da tabela core `configuracoes` (`chave`/`valor`), com FALLBACK declarado
 *   (`{ nome: 'Nossa empresa', endereco: '' }`) quando a tabela não existe ou está vazia — o
 *   harness NÃO cria `configuracoes`, e o teste afirma o fallback por isso.
 */

const { dbAll } = require('./db');

/**
 * Modalidades de frete da SEFAZ (campo `modFrete` da NF-e). São estas e mais nenhuma — o ERP
 * antigo imprimia exatamente neste formato ("2-Contratação do Frete por conta de Terceiros"),
 * então manter o prefixo numérico conserva a leitura de quem já conhece o documento.
 */
const FRETE_MODALIDADES = [
  { valor: '0-Contratação do Frete por conta do Remetente (CIF)', curto: 'CIF — fornecedor paga' },
  { valor: '1-Contratação do Frete por conta do Destinatário (FOB)', curto: 'FOB — nós pagamos' },
  { valor: '2-Contratação do Frete por conta de Terceiros', curto: 'Terceiros' },
  { valor: '3-Transporte Próprio por conta do Remetente', curto: 'Veículo do fornecedor' },
  { valor: '4-Transporte Próprio por conta do Destinatário', curto: 'Veículo nosso' },
  { valor: '9-Sem Ocorrência de Transporte', curto: 'Sem transporte' },
];

// Pedido da Gerente de Compras (e-mail 15/09/2026): PIX, cartão de crédito e prazos mais
// longos. Ela também perguntou como cadastraria NOVAS condições — a resposta é que não
// precisa de cadastro: qualquer condição digitada uma vez no pedido volta como botão nos
// próximos, pela união com o DISTINCT lá embaixo.
const CONDICOES_PAGAMENTO = [
  'À vista', 'PIX', 'Cartão de crédito', 'Boleto',
  '7 D.D.L.', '14 D.D.L.', '21 D.D.L.', '28 D.D.L.', '30 D.D.L.',
  '30/60', '30/60/90', '30/60/90/120', '30/60/60/90/120', 'Antecipado',
];

const VIAS_TRANSPORTE = ['Rodoviário', 'Aéreo', 'Marítimo', 'Ferroviário', 'Retirada no fornecedor'];

/**
 * Unidades. O `valor` é o que vai para o banco e para o documento; o `curto` é o que aparece
 * no botão.
 *
 * A Gerente de Compras avisou que "G", "M" e "L" sozinhos não se distinguem. A correção NÃO é
 * mudar o valor gravado — material já cadastrado com 'G' passaria a não casar com nenhum botão
 * e a lista mostraria 'G' e 'GR' como se fossem coisas diferentes. O que muda é só o rótulo.
 */
const UNIDADES = [
  { valor: 'PC', curto: 'PC' },
  { valor: 'UN', curto: 'UN' },
  { valor: 'KG', curto: 'KG' },
  { valor: 'G', curto: 'G (grama)' },
  { valor: 'M', curto: 'M (metro)' },
  { valor: 'M²', curto: 'M²' },
  { valor: 'M³', curto: 'M³' },
  { valor: 'L', curto: 'L (litro)' },
  { valor: 'CX', curto: 'CX (caixa)' },
  { valor: 'BR', curto: 'BR (barra)' },
  { valor: 'PAR', curto: 'PAR' },
  { valor: 'RL', curto: 'RL (rolo)' },
  { valor: 'JG', curto: 'JG (jogo)' },
  { valor: 'MIL', curto: 'MIL' },
];

// Alíquotas que aparecem na prática. O campo continua aceitando qualquer número de 0 a 100 no
// backend (`schemas.js`) — isto é a lista de atalhos da tela, não uma validação.
const IPI_SUGERIDO = [0, 3.25, 5, 6.5, 10, 15];

/** O fallback de `empresa`, afirmado em teste: o harness não tem a tabela `configuracoes`. */
const EMPRESA_PADRAO = { nome: 'Nossa empresa', endereco: '' };

/**
 * Une a lista fixa com o que já foi usado, sem duplicar e sem perder a ordem da fixa.
 * Aceita lista de strings ou de `{ valor, curto }` — compara sempre pelo VALOR.
 */
function unir(fixas, usadas) {
  const valorDe = (f) => (f && typeof f === 'object' ? f.valor : f);
  const vistos = new Set(fixas.map((f) => String(valorDe(f)).trim().toLowerCase()));
  const extras = (usadas || [])
    .map((u) => (u == null ? '' : String(u).trim()))
    .filter((u) => u && !vistos.has(u.toLowerCase()));
  return [...fixas, ...new Set(extras)];
}

async function distinct(db, coluna, tabela = 'pedidos_compra') {
  try {
    const rows = await dbAll(
      db,
      `SELECT DISTINCT ${coluna} AS v FROM ${tabela}
        WHERE ${coluna} IS NOT NULL AND TRIM(${coluna}) != '' LIMIT 40`,
    );
    return rows.map((r) => r.v);
  } catch (e) {
    return []; // base sem a tabela/coluna (core-only, ou boot antes do ALTER) não quebra a tela
  }
}

/** Endereço da própria GMP, para o botão "Entregar na GMP". */
async function enderecoDaEmpresa(db) {
  try {
    const rows = await dbAll(
      db,
      `SELECT chave, valor FROM configuracoes
        WHERE chave IN ('empresa_nome','empresa_endereco','empresa_cidade','empresa_estado','empresa_cep')`,
    );
    const c = Object.fromEntries(rows.map((r) => [r.chave, (r.valor || '').trim()]));
    const linha = [c.empresa_endereco, c.empresa_cidade, c.empresa_estado, c.empresa_cep]
      .filter(Boolean).join(' - ');
    return { nome: c.empresa_nome || EMPRESA_PADRAO.nome, endereco: linha };
  } catch (e) {
    return { ...EMPRESA_PADRAO };
  }
}

/**
 * Etapa 78 (RN-78.04) — a empresa INTEIRA para o documento impresso do pedido de compra.
 *
 * Chaves de `configuracoes` (`empresa_*`) -> `{ nome, cnpj, ie, endereco, cidade, estado, cep,
 * telefone, email, nota_pedido_compra }`. Sempre o shape completo, sempre string: chave ausente
 * (base antiga, sem o seed da IE) ou `NULL` vem `''`, nunca `undefined` — o gerador imprime "—".
 * Tolera "no such table" como `enderecoDaEmpresa`: o harness NAO cria `configuracoes` (o teste da
 * 39 afirma o fallback de `/opcoes` por escrito), entao aqui o fallback e tudo vazio.
 *
 * ⚠️ NAO substitui `enderecoDaEmpresa`: o `empresa` de `/opcoes` continua `{ nome, endereco }`
 * (o form da 39 le esse shape). Duas leituras da mesma tabela com propositos diferentes.
 */
const CHAVES_EMPRESA = ['nome', 'cnpj', 'ie', 'endereco', 'cidade', 'estado', 'cep', 'telefone', 'email', 'nota_pedido_compra'];

async function lerEmpresa(db) {
  const empresa = Object.fromEntries(CHAVES_EMPRESA.map((k) => [k, '']));
  let rows = [];
  try {
    rows = await dbAll(
      db,
      `SELECT chave, valor FROM configuracoes WHERE chave IN (${CHAVES_EMPRESA.map(() => '?').join(',')})`,
      CHAVES_EMPRESA.map((k) => `empresa_${k}`),
    );
  } catch (e) {
    if (!/no such table/i.test(e.message || '')) throw e;
    return empresa;
  }
  for (const r of rows) {
    const k = String(r.chave).slice('empresa_'.length);
    if (k in empresa) empresa[k] = r.valor == null ? '' : String(r.valor).trim();
  }
  return empresa;
}

/** Tudo o que a tela precisa
 para desenhar os botões, numa chamada só (RN-39.06). */
async function carregarOpcoes(db) {
  const [pagamento, frete, via, transportadoras, tabelas, unidadesEmUso, empresa] =
    await Promise.all([
      distinct(db, 'condicao_pagamento'),
      distinct(db, 'frete_modalidade'),
      distinct(db, 'via_transporte'),
      distinct(db, 'transportadora'),
      distinct(db, 'tabela_preco'),
      distinct(db, 'unidade', 'materiais_almoxarifado'),
      enderecoDaEmpresa(db),
    ]);

  // Do frete, o valor gravado é a string inteira; a tela mostra o rótulo curto.
  const fretesConhecidos = FRETE_MODALIDADES.map((f) => f.valor);
  const fretesExtras = unir(fretesConhecidos, frete).slice(fretesConhecidos.length);

  return {
    condicoes_pagamento: unir(CONDICOES_PAGAMENTO, pagamento),
    frete_modalidades: [
      ...FRETE_MODALIDADES,
      ...fretesExtras.map((v) => ({ valor: v, curto: v })),
    ],
    vias_transporte: unir(VIAS_TRANSPORTE, via),
    unidades: unir(UNIDADES, unidadesEmUso),
    ipi_sugerido: IPI_SUGERIDO,
    transportadoras,
    tabelas_preco: tabelas,
    empresa,
  };
}

module.exports = {
  carregarOpcoes,
  FRETE_MODALIDADES,
  CONDICOES_PAGAMENTO,
  VIAS_TRANSPORTE,
  UNIDADES,
  IPI_SUGERIDO,
  EMPRESA_PADRAO,
  lerEmpresa,
};
