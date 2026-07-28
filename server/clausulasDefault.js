/**
 * Cláusulas padrão das Condições Gerais de Fornecimento.
 * Usadas para inicializar proposta_clausulas quando o usuário edita pela primeira vez.
 *
 * A 5.24 é MISTA: as TABELAS (preços gerada dos itens, FINAME/BNDES e fiscais) continuam
 * sendo montadas pelo template — elas precisam sair íntegras, em ordem e com o thead
 * repetido em cada fragmento (invariante I4), o que só o gerador garante. Já os TEXTOS
 * dela (introdução e condição de pagamento) moram AQUI, como cláusulas de verdade, para
 * serem editáveis e persistidos pelo mesmo caminho das demais.
 */

// Texto de ABERTURA da 5.24 — sai antes da tabela de preços, com o <h3> "5.24 ...".
const CLAUSULA_524_PRECO = {
  numero: '5.24',
  titulo: 'PREÇO, CONDIÇÃO DE PAGAMENTO E IMPOSTOS',
  conteudo: '<p>A CONTRATANTE pagará pelos equipamentos e/ou serviços indicados no ESCOPO DE FORNECIMENTO desta proposta comercial, os valores informados na tabela de preços a seguir.</p>'
};

// Texto da CONDIÇÃO DE PAGAMENTO — sai DEPOIS da tabela de preços completa (I4).
// O número é '5.24.1' (e não '5.24') por dois motivos: (a) as keys de cláusula default
// são "default-<numero>" e dois '5.24' colidiriam; (b) o extrator de sub-número do
// template lê "5.24.1" como 24, então este bloco continua caindo no slot da 5.24.
// O prefixo "5.24.1 " do título NÃO é exibido no documento (o template o esconde) —
// visualmente continua sendo a linha "CONDIÇÃO DE PAGAMENTO:" em negrito, como sempre foi.
const CLAUSULA_524_CONDICAO = {
  numero: '5.24.1',
  titulo: 'CONDIÇÃO DE PAGAMENTO:',
  conteudo: '<p><strong>Primeira Parcela/Entrada:</strong> – 40% (quarenta por cento) sobre o valor total da proposta, pago na assinatura da presente proposta técnica comercial, via transferência bancaria.</p><p><strong>Segunda Parcela/Liberação:</strong> – 30% (trinta por cento) sobre o valor total da proposta, pago no comunicado de liberação do pedido, via transferência bancaria.</p><p><strong>Terceira Parcela/Saldo:</strong> – 30% (trinta por cento) sobre o valor total da proposta, será pago via boleto bancário, com prazo para pagamento de 28 DDL, contados do comunicado de liberação do pedido.</p><p>Em caso de inadimplemento por parte da CONTRATANTE quanto ao pagamento dos serviços contratados, deverá incidir sobre o valor do contrato multa pecuniária de 2% (dois por cento), juros de mora de 1% (um por cento) ao mês e correção monetária até a data do efetivo pagamento.</p>'
};

function getClausulasDefault() {
  return [
    {
      numero: '5.1',
      titulo: 'PRAZO DE ENTREGA',
      conteudo: '<p>O prazo para entrega dos itens apresentados nesta proposta comercial, é dentro de 90 dias úteis, a partir da data da aprovação formal do pedido (via e-mail) e compensação do pagamento referente a entrada.</p><p>O prazo pode prolongar, em casos de atraso no envio de informações e aprovação das documentações, por parte da CONTRATANTE.</p><p>Caso ocorra atraso na entrega dos equipamentos por motivos cuja responsabilidade não possa ser atribuída à CONTRATADA, forças maiores como fenômenos naturais, atos governamentais, acidentes ou outros motivos abrangidos pelo artigo 1058 do Código Civil, que a impossibilite de obter os insumos necessários à fabricação, impossibilitando está de cumprir o prazo de entrega, este será prorrogado pelo período necessário para a normalização da produção.</p>'
    },
    {
      numero: '5.2',
      titulo: 'TRANSPORTE E EMBALAGEM',
      conteudo: '<p>A CONTRATADA deverá promover a liberação do(s) EQUIPAMENTO(S), na modalidade EXW (Ex Works), conforme previsto na relação de ICOTERMS editada pela Câmara Internacional de Comércio, diretamente na fábrica, estabelecida à Av. Ângelo Demarchi, nº 130, Batistini, São Bernardo do Campo, São Paulo – Brasil, CEP 09844-100.</p><p>O(s) EQUIPAMENTO(S) serão embalado(s) com plástico bolha. Caso a CONTRATANTE necessite de outro tipo de embalagem, a mesma deverá comunicar a CONTRATADA previamente via e-mail, para que ela possa atualizar a proposta com o custo e novo modelo da embalagem.</p>'
    },
    {
      numero: '5.3',
      titulo: 'LIBERAÇÃO DO PEDIDO',
      conteudo: '<p>A formalização da entrega se dará, através do comunicado de liberação do pedido, o qual será enviado via e-mail, endereçado para o contato que consta nesta proposta técnica comercial e/ou via carta registrada.</p>'
    },
    {
      numero: '5.4',
      titulo: 'GARANTIA',
      conteudo: '<p>A CONTRATADA garante aos equipamentos, devidamente previstos nesta proposta técnica comercial, contra defeitos de fabricação, pelo prazo de 12 (doze) meses, a contar da assinatura do "Termo de Entrega e Startup", se limitando a 14 (quatorze) meses, a contar da emissão de nota fiscal de venda e/ou remessa.</p><p>A CONTRATADA se obriga, sob sua conta e risco, durante o prazo de vigência da garantia, a reparar, quando apresentarem defeitos ou falhas provenientes de projeto, desempenho ou qualidade dos serviços ora prestados, sem qualquer custo para a CONTRATANTE.</p><p>A CONTRATADA deverá, para efeitos do disposto "Prazo de Garantia" responder aos chamados técnicos dentro de 05 (cinco) dias úteis, dentro do horário comercial e disponibilidade da agenda dos técnicos, desde que a CONTRATANTE solicite, preencha e retorne o documento "ABERTURA DE CHAMADO" por escrito para a CONTRATADA.</p><p>A CONTRATANTE deverá solicitar e realizar o chamado técnico através de correio eletrônico, endereçado para: alexjunior@gmp.ind.br, matheus@gmp.ind.br, bruno@gmp.ind.br e junior@gmp.ind.br.</p><p>Não estão cobertos pela garantia contratual citada acima, defeitos gerados pela má utilização, utilização de sobrecarga, utilização do equipamento em aplicações diferentes do qual foi ofertado e dimensionado, tensão errada ou acidentes pertinentes de choque, batidas e outros que venham danificar ou quebrar, utilização de matéria inadequada, modificação e/ou alteração das suas características originais, consertos ou reformas feitas por empresa diversa da CONTRATADA.</p><p>Não estão cobertos pela garantia contratual citada acima, desgaste naturais dos equipamentos e peças em função de sua utilização e contato direto com o produto, tais como rolamentos, buchas, hélices, etc.</p><p>Não estão cobertos pela garantia contratual citada acima, despesas relacionadas com translado, estadia e alimentação do(s) técnico(s) e despesas com transportes, seguros e movimentações de peças e equipamentos.</p><p>A CONTRATANTE não se beneficiará da garantia contratual, quando os serviços forem acometidos por eventos de caso fortuito, força maior, uso incorreto, falta de manutenção, montagem e startup dos equipamentos sem supervisão da CONTRATADA.</p>'
    },
    {
      numero: '5.5',
      titulo: 'SUPERVISÃO E COMISSIONAMENTO DE STARTUP',
      conteudo: '<p>A CONTRATANTE deverá solicitar para a CONTRATADA, o agendamento da montagem e acompanhamento de startup dos equipamentos, os quais serão agendados de acordo com a disponibilidade da agenda dos técnicos.</p><p>As operações de translado dos técnicos, montagem e startup dos equipamentos, deverão ocorrer de segunda-feira a sexta-feira, exceto feriados, dentro do horário comercial (das 8h às 12h e das 13h às 17h). Operações realizadas após o horário comercial, feriados e finais de semana, quando não acordadas previamente e formalmente via e-mail, estão sujeitas a cobranças adicionais.</p><p>A CONTRATANTE será responsável pelas despesas de translado (rodoviário e aéreo), estadia e alimentação (café da manhã, almoço e janta) dos técnicos de montagem e startup.</p><p>A CONTRATANTE será responsável pelas despesas de transporte (ida e volta) das ferramentas dos técnicos da CONTRATADA, e também, quando necessário, das despesas relacionadas com locação de andaimes, plataformas elevatória, pórticos e serviços de movimentações.</p><p>A CONTRATANTE deverá indicar e manter no local, o responsável pelo acompanhamento, liberação e aprovação do "Termo de Entrega e Startup".</p>'
    },
    {
      numero: '5.6',
      titulo: 'OBRIGAÇÕES DA CONTRATANTE',
      conteudo: '<p>A CONTRATANTE deverá disponibilizar e fornecer informações e documentos, pertinentes ao produto processado e local de instalação dos equipamentos.</p><p>A CONTRATANTE deverá analisar, conferir e aprovar documentos e projetos junto a CONTRATADA, dentro do prazo de 5 (cinco) dias úteis, contados da data de envio do documento e/ou projeto.</p><p>A CONTRATANTE deverá efetuar o pagamento na forma e condições estabelecidas no item "PREÇO E CONDIÇÃO DE PAGAMENTO".</p><p>Reembolsar a CONTRATADA, de eventuais custos adicionais, originados por ato de responsabilidade da CONTRATANTE.</p>'
    },
    {
      numero: '5.7',
      titulo: 'OBRIGAÇÕES DA CONTRATADA',
      conteudo: '<p>É dever da CONTRATADA oferecer mão-de-obra especializada e cumprir todos os deveres e obrigações dispostos no ESCOPO DE FORNECIMENTO e CONDIÇÕES GERAIS desta proposta técnica comercial.</p><p>É dever da CONTRATADA proibir o uso do nome ou logotipo da CONTRATANTE, devendo proibir seu pessoal de utilizar o logo da CONTRATANTE em suas vestimentas.</p><p>Os serviços especificados serão executados pela CONTRATADA, através de seus empregados, os quais nenhuma relação de emprego ou de trabalho terão com a CONTRATANTE, sendo de responsabilidade exclusiva da CONTRATADA todos os encargos trabalhistas, previdenciários e tributários.</p><p>É de inteira responsabilidade da CONTRATADA o fornecimento de todas as ferramentas e maquinários necessários à fabricação dos equipamentos, além dos Equipamentos de Proteção Individual (EPI).</p>'
    },
    {
      numero: '5.8',
      titulo: 'ALTERAÇÃO DE PEDIDO',
      conteudo: '<p>Caso a CONTRATANTE solicite alterações no escopo de fornecimento, a CONTRATADA apresentará a CONTRATANTE, os impactos, valores e prazos para realização da alteração. A CONTRATANTE deverá responder a CONTRATADA, com a aprovação ou declínio da alteração, dentro de 5 (cinco) dias úteis, contados da apresentação da proposta de alteração da CONTRATADA para a CONTRATANTE.</p>'
    },
    {
      numero: '5.9',
      titulo: 'DEVOLUÇÃO OU TROCA DE MERCADORIA',
      conteudo: '<p>Não serão aceitas. Apenas em casos excepcionais serão aceitas, se houver prévia autorização da CONTRATADA e a CONTRATANTE arcará com todas as despesas envolvidas.</p>'
    },
    {
      numero: '5.10',
      titulo: 'CANCELAMENTO DE PEDIDO',
      conteudo: '<p>Não serão aceitas. Visto que os produtos são produzidos sob encomenda e necessitam de horas de engenharia, projeto e desenvolvimento e as peças/serviços oriundas dele atendem exclusivamente ao CONTRATANTE.</p>'
    },
    {
      numero: '5.11',
      titulo: 'NÃO ALICIAMENTO E NÃO CONTRATAÇÃO DE PESSOAL',
      conteudo: '<p>A CONTRATANTE se obriga, durante a vigência deste contrato e pelo período de 24 (vinte e quatro) meses após seu encerramento, independentemente do motivo, a não aliciar, abordar, convidar, recrutar, contratar ou manter qualquer relação profissional, comercial ou societária, direta ou indiretamente, com empregados, ex-empregados, representantes, consultores, parceiros, subcontratados ou prestadores de serviços da CONTRATADA que tenham sido apresentados, indicados, disponibilizados, alocados ou que tenham participado da execução dos serviços objeto desta proposta técnica comercial.</p><p>A proibição prevista nesta cláusula abrange a contratação sob qualquer modalidade, incluindo vínculo empregatício, prestação de serviços por pessoa física ou jurídica, sociedade, representação comercial, consultoria, subcontratação, terceirização ou qualquer outra forma de aproveitamento profissional, ainda que realizada por intermédio de empresas controladoras, controladas, coligadas, integrantes do mesmo grupo econômico, sócios, administradores ou terceiros relacionados à CONTRATANTE.</p><p>A contratação somente poderá ocorrer mediante autorização prévia, expressa e escrita da CONTRATADA.</p><p>O descumprimento desta obrigação sujeitará a CONTRATANTE ao pagamento de multa compensatória, por profissional contratado, equivalente a 12 (doze) vezes o valor da última remuneração mensal bruta ou da média mensal dos honorários pagos pela CONTRATADA ao respectivo profissional nos 3 (três) meses anteriores à ocorrência, respeitado o limite global correspondente ao valor total deste contrato, sem prejuízo da indenização suplementar por perdas e danos excedentes, desde que devidamente comprovados.</p><p>A presente obrigação vincula exclusivamente a CONTRATANTE, não constituindo impedimento ou restrição ao livre exercício profissional do empregado ou prestador de serviços envolvido.</p>'
    },
    {
      numero: '5.12',
      titulo: 'ATRASO DE FATURAMENTO',
      conteudo: '<p>Ocorrendo atraso de faturamento por razões de responsabilidade do CONTRATANTE, como falta de documentos para aprovação do crédito, identificação de transportadora, não pagamento de antecipações/parcelas constantes nesta proposta técnica comercial, atraso de inspeção, diligenciamento e liberação de financiamento, a CONTRATADA cobrará o preço da mercadoria e/ou serviço, com base na lista de preço vigente na data do faturamento.</p>'
    },
    {
      numero: '5.13',
      titulo: 'TAXA DE ARMAZENAGEM',
      conteudo: '<p>Será cobrada uma taxa de armazenagem de 1% ao mês do valor do fornecimento, caso as mercadorias não sejam retiradas em até 30 dias após a data de faturamento, calculada pro-rata diem a partir do 31º dia, limitada a 10% do valor do faturamento.</p>'
    },
    {
      numero: '5.14',
      titulo: 'DANOS OU PREJUÍZOS',
      conteudo: '<p>A responsabilidade civil da CONTRATADA está limitada ao produto fornecido, não se responsabilizando por danos indiretos ou emergentes, tais como lucros cessantes, perdas de receitas, produtividade ou de dados, reclamações, paralizações, despesas, danos pessoais.</p>'
    },
    {
      numero: '5.15',
      titulo: 'RESPONSABILIDADE FINANCEIRA',
      conteudo: '<p>A CONTRATANTE poderá optar em proceder o pagamento das parcelas supracitadas através de financiamento junto ao BANCO, porém, desde que respeitados os prazos de pagamento desta proposta técnica comercial e sem qualquer participação da CONTRATADA, junto as instituições financeiras para liberação desses valores.</p>'
    },
    {
      numero: '5.16',
      titulo: 'CONSIDERAÇÕES CONSTRUTIVAS',
      conteudo: '<p>Os equipamentos e serviços ora ofertados nesta proposta técnica comercial, são padronizados pela CONTRATADA. Caso a CONTRATANTE tenha preferência ou necessidade que seja utilizado marca ou modelo especifico de qualquer componente ou material, deverá ser comunicado para a CONTRATADA previamente via e-mail, para revisão desta proposta comercial.</p><p>A CONTRATADA se resguarda do direito de utilizar o melhor aproveitamento dos materiais, durante o processo de fabricação e montagem de seus equipamentos, podendo aparecer soldas de complementos de materiais em pontos distintos.</p><p>Fica entendido que todas as informações foram apresentadas ao CONTRATANTE nesta proposta técnica comercial, e foram suficientes para o entendimento e aceite do produto e/ou serviço que será fornecido.</p>'
    },
    {
      numero: '5.17',
      titulo: 'VALIDADE DA PROPOSTA',
      conteudo: '<p>Esta proposta técnica comercial é válida por 15 (quinze) dias corridos, contados da data de emissão, informada na página inicial (capa).</p>'
    },
    {
      numero: '5.18',
      titulo: 'REAJUSTE DE PREÇO',
      conteudo: '<p>Havendo alterações na legislação tributária vigente na época, a CONTRATADA se resguarda ao direito de atualizar os preços apresentados, de acordo com a nova tributação, com prévia aprovação do CONTRATANTE.</p><p>Para vendas fora do território nacional (BRASIL), os preços apresentados nesta proposta técnica comercial, poderão ser reajustado pela taxa do Dólar Americano, valor comercial de venda, até a data do faturamento.</p>'
    },
    {
      numero: '5.19',
      titulo: 'DOCUMENTAÇÃO PARTE DO ESCOPO',
      conteudo: '<p>Os documentos abaixo relacionados, serão fornecidos em arquivos, formatos e cronograma padrão da CONTRATADA. Caso a CONTRATANTE necessite de documentos não relacionados abaixo ou padrões específicos, deverá ser comunicado para a CONTRATADA previamente via e-mail, para revisão desta proposta.</p><ul style="list-style:none;padding-left:0;"><li>✓ Nota fiscal;</li><li>✓ Manual do equipamento;</li><li>✓ Diagrama elétrico do painel;</li><li>✓ Desenho com as dimensões gerais dos equipamentos;</li></ul><p>Os documentos entregues a CONTRATANTE pela CONTRATADA, não poderão ser reproduzidos, comercializados e cedidos a terceiros, sem o prévio e expresso consentimento da CONTRATADA.</p>'
    },
    {
      numero: '5.20',
      titulo: 'EXTINÇÃO DO CONTRATO',
      conteudo: '<p>O presente contrato poderá ser extinto entre as PARTES, sem aplicação de ônus, nas seguintes hipóteses:</p><ul><li>Decretação de falência da CONTRATADA, sem prejuízo das indenizações eventualmente aplicáveis;</li><li>Caso fortuito ou força maior que impeça a continuidade do contrato por período superior a 30 (trinta) dias corridos;</li><li>Descumprimento de obrigação contratual não corrigido pela Parte infratora no prazo de até 05 (cinco) dias úteis, contado do recebimento de notificação por escrito;</li><li>Distrato de comum acordo entre as PARTES, formalizado por escrito, mediante aviso prévio mínimo de 30 (trinta) dias.</li></ul>'
    },
    {
      numero: '5.21',
      titulo: 'DISPOSIÇÕES ADICIONAIS',
      conteudo: '<p><strong>MODIFICAÇÃO DO CONTRATO:</strong> Toda e qualquer obrigação não mencionada no presente instrumento de contrato, bem como toda e qualquer alteração do ora pactuado, somente surtirá efeitos entre as Partes, quando realizada, por escrito, na forma de termo de aditivo ou alteração contratual.</p><p><strong>TOLERÂNCIA:</strong> O cumprimento de modo diverso de quaisquer cláusulas deste ajuste caracterizará mera liberalidade da Parte tolerante, e, por conseguinte, não implicará em novação, perdão, suspensão, interrupção, renúncia, extinção, direito adquirido e/ou modificação do CONTRATO.</p><p><strong>SUFICIÊNCIA DO CONTRATO:</strong> Ficam expressamente revogados todos e quaisquer pactos, ajustes, cláusulas e condições estabelecidas entre as partes na fase de negociação deste contrato.</p><p><strong>SIGILO:</strong> As PARTES se comprometem a manter em sigilo todos e quaisquer documentos, informações e dados técnicos de propriedade e interesse das mesmas. O dever de sigilo é contínuo, perene, irretratável e irrevogável, devendo manter-se mesmo após o término do contrato.</p><p><strong>DIREITO E USO DE IMAGEM:</strong> Os direitos de divulgação das imagens dos produtos e serviços comercializados, instalados ou meramente desenvolvidos pertencem à CONTRATADA podendo esta divulgá-las em operações de marketing e propaganda como melhor lhe convir.</p>'
    },
    {
      numero: '5.22',
      titulo: 'FORO',
      conteudo: '<p>As partes elegem o Foro da Comarca de São Bernardo do Campo - SP, para qualquer ação, processo ou litígio oriundo da responsabilidade pelos produtos e/ou serviços fornecidos conforme ESCOPO DE FORNECIMENTO deste contrato, com renúncia de qualquer outro por mais especial que seja.</p>'
    },
    {
      numero: '5.23',
      titulo: 'EXCLUSO DO FORNECIMENTO',
      conteudo: '<p>Estão exclusos do escopo de fornecimento da CONTRATADA, ficando de responsabilidade da CONTRATANTE, os seguintes itens:</p><ol style="padding-left:25px;line-height:2;"><li>Transporte e seguro dos equipamentos e suas partes;</li><li>Serviços de movimentação, como munck, guindaste, empilhadeira e demais que se fizerem necessários;</li><li>Serviços e materiais de instalação e infraestrutura, como elétrica, hidráulica, pneumática, civil, alvenaria e demais que se fizerem necessários;</li><li>Despesas com translado, estadia e alimentação da equipe de montagem e startup;</li><li>Sapatas, brocas, bases, e outros tipos de reforço necessário;</li><li>Consultoria química, de processo, para obtenção de licenças, e de qualquer outra natureza;</li><li>Laudo e certificados de calibração/aferição, como RBC, ISO, e outros que se fizerem necessários;</li><li>Equipamentos, acessórios e periféricos, como compressor de ar, exaustores, torre de resfriamento, unidade Chiller, bombas, tachos, tanques, reservatórios, balanças, envasadoras e outros que se fizerem necessários;</li><li>E demais itens não citados expressamente nesta proposta técnica comercial.</li></ol>'
    },
    // Os TEXTOS da 5.24 entram na lista padrão (as TABELAS não — ver comentário acima):
    // é o que faz a edição da 5.24 percorrer o mesmo caminho de persistência das demais
    // (POST /clausulas/inicializar copia esta lista para proposta_clausulas, na ordem do
    // array). Precisam ficar ENTRE a 5.23 e a 5.25: a ordem do array vira a coluna `ordem`.
    CLAUSULA_524_PRECO,
    CLAUSULA_524_CONDICAO,
    {
      numero: '5.25',
      titulo: 'CONSIDERAÇÃO FINAL',
      conteudo: '<p>Em caso de aceite e que não seja emitido um pedido de compra oficial formal, esta proposta torna-se apenas válida como pedido de compra mediante assinatura do responsável e com carimbo da empresa no campo destacado abaixo.</p>'
    }
  ];
}

function resolverClausulasParaPreview(clausulasAtivas, embedPreview) {
  if (Array.isArray(clausulasAtivas) && clausulasAtivas.length > 0) return clausulasAtivas;
  if (embedPreview) return getClausulasDefault();
  return null;
}

module.exports = {
  getClausulasDefault,
  resolverClausulasParaPreview,
  CLAUSULA_524_PRECO,
  CLAUSULA_524_CONDICAO,
  // aliases legados (testes e imports antigos)
  CLAUSULA_523_PRECO: CLAUSULA_524_PRECO,
  CLAUSULA_523_CONDICAO: CLAUSULA_524_CONDICAO,
};
