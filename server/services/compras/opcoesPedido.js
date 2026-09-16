/**
 * Opções do formulário de pedido de compra — Etapa 32 / G1b.
 *
 * O P.O. foi direto: *"todas as opções do formulário devem ser botões, não quero o usuário
 * escrevendo nada"*. Para virar botão, a opção precisa existir em algum lugar — e este é o
 * lugar. Uma lista só, no servidor, e não espalhada em `<option>` dentro do JSX: a mesma lista
 * vai ser lida pela impressão (G2) e por qualquer relatório depois.
 *
 * As listas FIXAS são o piso, não o teto: cada uma é unida ao que a empresa já usou de verdade
 * (DISTINCT nos pedidos existentes). Assim a tela aprende com o uso sem ninguém editar código,
 * e nenhum pedido antigo fica com um valor que a tela nova não sabe mostrar.
 */

const { dbAll, dbGet } = require('./db');

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

// Alíquotas que aparecem na prática. O campo continua aceitando qualquer número no backend —
// isto é a lista de atalhos da tela, não uma validação.
const IPI_SUGERIDO = [0, 3.25, 5, 6.5, 10, 15];

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
        WHERE ${coluna} IS NOT NULL AND TRIM(${coluna}) != '' LIMIT 40`
    );
    return rows.map((r) => r.v);
  } catch (e) {
    return []; // base sem a tabela (core-only) não quebra a tela
  }
}

/**
 * Próximo número SUGERIDO.
 *
 * RN-01 mantém o número como escolha do comprador — isto NÃO gera nem reserva nada, só evita
 * que ele tenha de lembrar em que número parou. A tela deixa alterar.
 *
 * Considera apenas números PURAMENTE numéricos — `NOT GLOB '*[^0-9]*'`, ou seja "não contém
 * nenhum caractere que não seja dígito". A régua óbvia (`GLOB '[0-9]*'`, "começa com dígito")
 * NÃO serve e foi medida: com ela, um número como `99999999-X` casteia para 99999999 e estoura
 * a sequência da empresa para sempre. Já um `PC-2025/ABC` seria inofensivo nas duas, porque o
 * CAST dele é 0 — foi justamente esse caso fácil que escondeu o defeito no primeiro teste.
 *
 * O histórico tem números vindos do ERP antigo (28433), então a sequência continua de onde a
 * empresa está, não de 1.
 */
async function proximoNumeroSugerido(db) {
  try {
    const row = await dbGet(
      db,
      `SELECT MAX(CAST(numero AS INTEGER)) AS maximo
         FROM pedidos_compra
        WHERE numero NOT GLOB '*[^0-9]*' AND TRIM(numero) != ''`
    );
    const proximo = (row && row.maximo ? row.maximo : 0) + 1;
    // Zero à esquerda até 4 dígitos; acima disso o número cresce naturalmente.
    return String(proximo).padStart(4, '0');
  } catch (e) {
    return '';
  }
}

/** Endereço da própria GMP, para o botão "Entregar na GMP". */
async function enderecoDaEmpresa(db) {
  try {
    const rows = await dbAll(
      db,
      `SELECT chave, valor FROM configuracoes
        WHERE chave IN ('empresa_nome','empresa_endereco','empresa_cidade','empresa_estado','empresa_cep')`
    );
    const c = Object.fromEntries(rows.map((r) => [r.chave, (r.valor || '').trim()]));
    const linha = [c.empresa_endereco, c.empresa_cidade, c.empresa_estado, c.empresa_cep]
      .filter(Boolean).join(' - ');
    return { nome: c.empresa_nome || 'Nossa empresa', endereco: linha };
  } catch (e) {
    return { nome: 'Nossa empresa', endereco: '' };
  }
}

/** Tudo o que a tela precisa para desenhar os botões, numa chamada só. */
async function carregarOpcoes(db) {
  const [pagamento, frete, via, transportadoras, tabelas, unidadesEmUso, proximo, empresa, mats] =
    await Promise.all([
      distinct(db, 'condicao_pagamento'),
      distinct(db, 'frete_modalidade'),
      distinct(db, 'via_transporte'),
      distinct(db, 'transportadora'),
      distinct(db, 'tabela_preco'),
      distinct(db, 'unidade', 'materiais_almoxarifado'),
      proximoNumeroSugerido(db),
      enderecoDaEmpresa(db),
      dbGet(db, 'SELECT COUNT(*) AS n FROM materiais_almoxarifado WHERE ativo = 1')
        .catch(() => ({ n: 0 })),
    ]);

  // Do frete, o valor gravado é a string inteira; a tela mostra o rótulo curto.
  const fretesConhecidos = FRETE_MODALIDADES.map((f) => f.valor);
  const fretesExtras = unir(fretesConhecidos, frete).slice(fretesConhecidos.length);

  return {
    proximo_numero: proximo,
    condicao_pagamento: unir(CONDICOES_PAGAMENTO, pagamento),
    frete_modalidade: [
      ...FRETE_MODALIDADES,
      ...fretesExtras.map((v) => ({ valor: v, curto: v })),
    ],
    via_transporte: unir(VIAS_TRANSPORTE, via),
    unidades: unir(UNIDADES, unidadesEmUso),
    ipi: IPI_SUGERIDO,
    transportadoras,
    tabelas_preco: tabelas,
    empresa,
    // A tela avisa em vez de mostrar uma busca vazia: sem material cadastrado a RN-09 impede
    // salvar QUALQUER pedido, e o comprador ficaria tentando adivinhar o que fez de errado.
    total_materiais: (mats && mats.n) || 0,
  };
}

module.exports = {
  carregarOpcoes,
  proximoNumeroSugerido,
  FRETE_MODALIDADES,
  CONDICOES_PAGAMENTO,
  VIAS_TRANSPORTE,
  UNIDADES,
  IPI_SUGERIDO,
};
