/**
 * Cláusulas do modelo de contrato "Hélices e Discos".
 *
 * Origem: proposta 02240723/R00 (Durin Tintas e Vernizes), fornecida pelo usuário em
 * 31/07/2026 como o padrão para peças e acessórios.
 *
 * TRÊS SEÇÕES DAQUELA PROPOSTA NÃO ESTÃO AQUI, DE PROPÓSITO: "3. ESCOPO DE FORNECIMENTO",
 * "10. PREÇO E CONDIÇÃO DE PAGAMENTO" e "11. CLASSIFICAÇÃO FISCAL E IMPOSTOS" já são
 * montadas pelo template a partir dos itens da proposta (seção 4, tabela de preços e tabelas
 * fiscais). Repeti-las como cláusula faria o documento sair com a informação duplicada.
 *
 * A NUMERAÇÃO MUDA em relação ao PDF de origem (lá era 4 a 13, aqui é 5.1 a 5.8): o
 * documento gerado mantém a estrutura do padrão de equipamentos — capa, seção 4 de escopo,
 * tabelas — e só troca o corpo das cláusulas. Decisão confirmada com o usuário.
 *
 * Este conjunto tem 12 cláusulas contra 29 do de equipamentos. É intencional: peça de
 * reposição não carrega startup, obrigações das partes, foro nem cancelamento de pedido.
 */

const CLAUSULAS_HELICES = [
  {
    numero: '1.',
    titulo: 'OBJETIVO DA PROPOSTA',
    conteudo: '<p>Apresentar condições técnicas e comerciais, para fornecimento de peças e acessórios para equipamentos.</p>',
  },
  {
    numero: '2.',
    titulo: 'ELABORAÇÃO DA PROPOSTA',
    conteudo: '<p>A proposta apresentada a seguir, foi elaborada atendendo às solicitações e especificações informadas pelo CONTRATANTE, através de reunião, ligação e/ou e-mail.</p>',
  },
  // Pedida pelo usuário para aparecer também nas propostas de peças. Mesmo texto da de
  // equipamentos, com o vocabulário trocado ("peças e acessórios" no lugar de "equipamentos
  // e/ou serviços") — o conteúdo jurídico vale igual para os dois.
  {
    numero: '3.',
    titulo: 'OFERTA',
    conteudo: '<p>A presente proposta foi elaborada com base nas informações técnicas, operacionais e comerciais disponibilizadas pela CONTRATANTE até a data de sua emissão.</p><p>As peças e acessórios serão fornecidos exclusivamente conforme as características, quantidades, dimensões, materiais, componentes, limites e condições expressamente descritos no Item 4 – Escopo de Fornecimento.</p><p>Qualquer peça, componente, acessório, serviço, instalação, documentação ou atividade que não esteja expressamente indicado nesta proposta não integra o fornecimento da CONTRATADA, ainda que seja necessário à operação completa do equipamento, salvo quando formalmente incluído por meio de revisão da proposta ou aditivo contratual.</p><p>Alterações nas condições do produto, processo, instalação, dimensões, materiais, normas aplicáveis ou demais informações inicialmente fornecidas poderão resultar em revisão técnica, comercial e de prazo.</p>',
  },
  {
    numero: '5.1',
    titulo: 'PRAZO DE ENTREGA',
    conteudo: '<p>Dentro de 15 (quinze) dias úteis, a contar da data de confirmação do pedido via e-mail e compensação do pagamento (quando aplicável).</p>',
  },
  {
    numero: '5.2',
    titulo: 'TRANSPORTE E EMBALAGEM',
    conteudo: '<p>Transporte: EXW (Ex Work) [Coleta na fábrica da Moinho Ypiranga].</p><p>Embalagem: Caixa de papelão e/ou plástico bolha.</p>',
  },
  {
    numero: '5.3',
    titulo: 'VALIDADE DA PROPOSTA',
    conteudo: '<p>Proposta válida por 15 (quinze) dias corridos, contados da data de emissão.</p>',
  },
  {
    numero: '5.4',
    titulo: 'GARANTIA',
    conteudo: '<p>Garantia de 12 (doze) meses, contados da data de emissão da nota fiscal, contra defeitos de fabricação.</p><p>Garantia válida, para peças colocadas na fábrica da Moinho Ypiranga.</p>',
  },
  {
    numero: '5.5',
    titulo: 'CONSIDERAÇÃO CONSTRUTIVA',
    conteudo: '<p>Fica entendido que todas as informações foram apresentadas ao CONTRATANTE nesta proposta técnica comercial, e foram suficientes para o entendimento e aceite do produto e/ou serviço que será fornecido, desta forma, qualquer informação e/ou característica que não foi apresentada previamente neste documento, seguirá o padrão do projeto e/ou serviço da CONTRATADA.</p>',
  },
  {
    numero: '5.6',
    titulo: 'ITENS EXCLUSOS DO FORNECIMENTO',
    conteudo: '<p>Estão exclusos do fornecimento da CONTRATADA, ficando sob responsabilidade da CONTRATANTE, salvo menção expressa em contrário nesta proposta:</p><ol style="padding-left:25px;"><li>Transporte e seguro das peças;</li><li>Parafusos e buchas de fixação;</li><li>Serviço de instalação e montagem;</li><li>Eixos e hastes;</li><li>Projetos, croquis, laudos e certificados;</li><li>E demais itens não citados nesta proposta comercial.</li></ol>',
  },
  {
    numero: '5.7',
    titulo: 'REAJUSTE DE PREÇO',
    conteudo: '<p>Havendo alterações na legislação tributária vigente na época, a CONTRATADA se resguarda ao direito de atualizar os preços apresentados, de acordo com a nova tributação, com prévia aprovação do CONTRATANTE.</p><p>Para vendas fora do território nacional (BRASIL), os preços apresentados nesta proposta técnica comercial, poderão ser reajustados pela taxa do Dólar Americano, valor comercial de venda, até a data do faturamento, utilizando como taxa base USD 1,00 = VALOR DA COTAÇÃO NA DATA DA PROPOSTA.</p>',
  },
  // Estas duas sao renderizadas em SLOT FIXO, em volta da tabela de precos — nao na
  // sequencia das 5.x. O template as reconhece pelo TITULO (ehTextoDa524), entao a
  // numeracao pode seguir a deste modelo (5.8) em vez de saltar para 5.24.
  // Sem elas aqui, o documento caia no texto de EQUIPAMENTOS: parcelas de 40/30/30 com
  // multa e juros, no lugar do faturamento simples que vale para pecas.
  {
    numero: '5.8',
    titulo: 'PREÇO, CONDIÇÃO DE PAGAMENTO E IMPOSTOS',
    conteudo: '<p>A CONTRATANTE pagará pelas peças e acessórios indicados no ESCOPO DE FORNECIMENTO desta proposta comercial, os valores informados na tabela de preços a seguir.</p>',
  },
  {
    numero: '5.8.1',
    titulo: 'CONDIÇÃO DE PAGAMENTO:',
    conteudo: '<p>Faturado 28/42/56 DDL, via boleto bancário, a contar da emissão da nota fiscal.</p>',
  },
  {
    numero: '5.9',
    titulo: 'CONSIDERAÇÃO FINAL',
    conteudo: '<p>Em caso de aceite e que não seja emitido um pedido de compra oficial formal, esta proposta torna-se apenas válida como pedido de compra mediante assinatura do responsável e com carimbo da empresa no campo destacado abaixo:</p>',
  },
];

function getClausulasHelices() {
  // Cópia profunda: quem chamar edita o resultado sem contaminar o padrão em memória.
  return CLAUSULAS_HELICES.map((c) => ({ ...c }));
}

module.exports = { getClausulasHelices, CLAUSULAS_HELICES };
