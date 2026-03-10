/**
 * Retorna o HTML completo das "5. CONDIÇÕES GERAIS DE FORNECIMENTO" (5.1 a 5.24)
 * igual ao modelo Nano4You - usado no template padrão e no bloco "Condições" do editor por componentes.
 */
function getCondicoesGeraisNano4YouHTML(proposta, itens, totais, config, esc) {
  proposta = proposta || {};
  itens = Array.isArray(itens) ? itens : [];
  totais = totais || {};
  const fmt = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0);
  const condPag = proposta.condicoes_pagamento || 'Primeira Parcela/Entrada – 40% sobre o valor total, pago na assinatura da proposta, via transferência bancária. Segunda Parcela/Liberação – 30%, pago no comunicado de liberação do pedido. Terceira Parcela/Saldo – 30%, via boleto bancário, 28 DDL contados do comunicado de liberação. Em caso de inadimplemento: multa de 2%, juros de mora 1% ao mês e correção monetária.';
  let totalProposta = totais.total || 0;
  if (itens.length > 0) {
    totalProposta = itens.reduce((s, item) => s + (parseFloat(item.quantidade) || 1) * (parseFloat(item.valor_unitario) || parseFloat(item.preco_base) || 0), 0);
  }
  const linhasTabelaPrecos = (itens || []).map((item, index) => {
    const nome = item.descricao || item.nome || 'Item sem nome';
    const quantidade = parseFloat(item.quantidade) || 1;
    const precoUnitario = parseFloat(item.valor_unitario) || parseFloat(item.preco_base) || 0;
    const total = parseFloat(item.valor_total) || (quantidade * precoUnitario);
    return `<tr><td>4.${index + 1}</td><td contenteditable="true">${esc(nome)}</td><td>${quantidade}</td><td>${fmt(precoUnitario)}</td><td>${fmt(total)}</td></tr>`;
  }).join('');

  return `<!-- 5. CONDIÇÕES GERAIS DE FORNECIMENTO (igual ao PDF Nano4You - todas as tratativas) -->
      <div class="section">
        <div class="section-title">5. CONDIÇÕES GERAIS DE FORNECIMENTO</div>
      </div>
      
      <div class="section">
        <div class="section-title">5.1 PRAZO DE ENTREGA</div>
        <div class="texto-corpo">
          <p contenteditable="true">O prazo para entrega dos itens apresentados nesta proposta comercial, é dentro de 90 dias úteis, a partir da data da aprovação formal do pedido (via e-mail) e compensação do pagamento referente a entrada.</p>
          <p contenteditable="true">O prazo pode prolongar, em casos de atraso no envio de informações e aprovação das documentações, por parte da CONTRATANTE.</p>
          <p contenteditable="true">Caso ocorra atraso na entrega dos equipamentos por motivos cuja responsabilidade não possa ser atribuída à CONTRATADA, forças maiores como fenômenos naturais, atos governamentais, acidentes ou outros motivos abrangidos pelo artigo 1058 do Código Civil, que a impossibilite de obter os insumos necessários à fabricação, impossibilitando está de cumprir o prazo de entrega, este será prorrogado pelo período necessário para a normalização da produção.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.2 TRANSPORTE E EMBALAGEM</div>
        <div class="texto-corpo">
          <p contenteditable="true">A CONTRATADA deverá promover a liberação do(s) EQUIPAMENTO(S), na modalidade EXW (Ex Works), conforme previsto na relação de ICOTERMS editada pela Câmara Internacional de Comércio, diretamente na fábrica, estabelecida à Av. Dr. Ulysses Guimarães, nº 4105, Vila Nogueira, Diadema, São Paulo – Brasil, CEP 09990-080.</p>
          <p contenteditable="true">O(s) EQUIPAMENTO(S) serão embalado(s) com plástico bolha. Caso a CONTRATANTE necessite de outro tipo de embalagem, a mesma deverá comunicar a CONTRATADA previamente via e-mail, para que ela possa atualizar a proposta com o custo e novo modelo da embalagem.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.3 LIBERAÇÃO DO PEDIDO</div>
        <div class="texto-corpo">
          <p contenteditable="true">A formalização da entrega se dará, através do comunicado de liberação do pedido, o qual será enviado via e-mail, endereçado para o contato que consta nesta proposta técnica comercial e/ou via carta registrada.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.4 GARANTIA</div>
        <div class="texto-corpo">
          <p contenteditable="true">A CONTRATADA garante aos equipamentos, devidamente previstos nesta proposta técnica comercial, contra defeitos de fabricação, pelo prazo de 12 (doze) meses, a contar da assinatura do "Termo de Entrega e Startup", se limitando a 14 (quatorze) meses, a contar da emissão de nota fiscal de venda e/ou remessa.</p>
          <p contenteditable="true">A CONTRATADA se obriga, sob sua conta e risco, durante o prazo de vigência da garantia, a reparar, quando apresentarem defeitos ou falhas provenientes de projeto, desempenho ou qualidade dos serviços ora prestados, sem qualquer custo para a CONTRATANTE.</p>
          <p contenteditable="true">A CONTRATADA deverá, para efeitos do disposto "Prazo de Garantia" responder aos chamados técnicos dentro de 05 (cinco) dias úteis, dentro do horário comercial e disponibilidade da agenda dos técnicos, desde que a CONTRATANTE solicite, preencha e retorne o documento "ABERTURA DE CHAMADO" por escrito para a CONTRATADA.</p>
          <p contenteditable="true">A CONTRATANTE deverá solicitar e realizar o chamado técnico através de correio eletrônico, endereçado para: alexjunior@gmp.ind.br, bruno@gmp.ind.br e junior@gmp.ind.br.</p>
          <p contenteditable="true">Não estão cobertos pela garantia contratual citada acima, defeitos gerados pela má utilização, utilização de sobrecarga, utilização do equipamento em aplicações diferentes do qual foi ofertado e dimensionado, tensão errada ou acidentes pertinentes de choque, batidas e outros que venham danificar ou quebrar, utilização de matéria inadequada, modificação e/ou alteração das suas características originais, consertos ou reformas feitas por empresa diversa da CONTRATADA.</p>
          <p contenteditable="true">Não estão cobertos pela garantia contratual citada acima, desgaste naturais dos equipamentos e peças em função de sua utilização e contato direto com o produto, tais como rolamentos, buchas, hélices, etc.</p>
          <p contenteditable="true">Não estão cobertos pela garantia contratual citada acima, despesas relacionadas com translado, estadia e alimentação do(s) técnico(s) e despesas com transportes, seguros e movimentações de peças e equipamentos.</p>
          <p contenteditable="true">A CONTRATANTE não se beneficiará da garantia contratual, quando os serviços forem acometidos por eventos de caso fortuito, força maior, uso incorreto, falta de manutenção, montagem e startup dos equipamentos sem supervisão da CONTRATADA.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.5 SUPERVISÃO E COMISSIONAMENTO DE STARTUP</div>
        <div class="texto-corpo">
          <p contenteditable="true">A CONTRATANTE deverá solicitar para a CONTRATADA, o agendamento da montagem e acompanhamento de startup dos equipamentos, os quais serão agendados de acordo com a disponibilidade da agenda dos técnicos. Para agendamento da montagem, a CONTRATANTE deverá solicitar, quando os equipamentos já estiverem em sua sede. Para agendamento de startup, a CONTRATANTE deverá solicitar, após finalizar e deixar conectado e instalado, toda a infraestrutura de alimentação dos equipamentos, como elétrica, hidráulica, pneumática, e outras que se fizerem necessárias.</p>
          <p contenteditable="true">As operações de translado dos técnicos, montagem e startup dos equipamentos, deverão ocorrer de segunda-feira a sexta-feira, exceto feriados, dentro do horário comercial (das 8h às 12h e das 13h às 17h). Operações realizadas após o horário comercial, feriados e finais de semana, quando não acordadas previamente e formalmente via e-mail, estão sujeitas a cobranças adicionais, da CONTRATADA para a CONTRATANTE, conforme tabela "hora-homem" da CONTRATADA.</p>
          <p contenteditable="true">Todas e quaisquer áreas, instalações, equipamentos e ferramentas que porventura forem cedidos a CONTRATADA pela CONTRATANTE, serão por ela mantidos como se seus fosse, de modo a restituí-los, terminada sua utilização, no estado que os receberá.</p>
          <p contenteditable="true">A CONTRATADA deverá manter no local de trabalho, montagem e startup dos equipamentos, somente pessoal especializado e contratado com base na legislação trabalhista brasileira e/ou "terceiros" com contrato de prestação de serviços, às suas exclusivas expensas e responsabilidade, todo o pessoal necessário, direta ou indiretamente, a execução do objeto do presente instrumento, de acordo com as normas trabalhistas e previdenciárias vigentes, sendo os mesmos de total responsabilidade da CONTRATADA, inclusive encargos sociais e exames médicos.</p>
          <p contenteditable="true">A CONTRATANTE será responsável pelas despesas de translado (rodoviário e aéreo), estadia e alimentação (café da manhã, almoço e janta) dos técnicos de montagem e startup. Para casos de operações de montagem e startup, fora do estado em que se encontra a sede da CONTRATADA, o translado aplicado é o aéreo, realizado por aeronaves, como avião, e as despesas de deslocamento dos técnicos entre a sede da CONTRATADA e CONTRATANTE até o aeroporto, e vice-versa, compõem as despesas de translado que é de responsabilidade da CONTRATANTE.</p>
          <p contenteditable="true">A CONTRATANTE será responsável pelas despesas de transporte (ida e volta) das ferramentas dos técnicos da CONTRATADA, e também, quando necessário, das despesas relacionadas com locação de andaimes, plataformas elevatória, pórticos e serviços de movimentações, como munck, guindaste, empilhadeira e outros que se fizerem necessárias.</p>
          <p contenteditable="true">Quando aplicável, a CONTRATANTE será responsável pelo retorno de materiais utilizados na execução dos trabalhos, como vigas, tubos, chapas, e outros, para sede da CONTRATADA.</p>
          <p contenteditable="true">Em casos que as operações de montagem acontecerá em áreas classificadas com risco de explosão e/ou espaço confinado, a CONTRATANTE ficará responsável por locar e disponibilizar para a CONTRATADA, os equipamentos de segurança, como tripé, detector de gases, exaustor/insuflador, kit de polias, conjunto de ar mandado, e outros que se fizerem necessários.</p>
          <p contenteditable="true">Quando aplicável, a CONTRATANTE será responsável pelo descarte dos resíduos de materiais da obra.</p>
          <p contenteditable="true">A CONTRATANTE deverá indicar e manter no local, o responsável pelo acompanhamento, liberação e aprovação do "Termo de Entrega e Startup".</p>
          <p contenteditable="true">A CONTRATANTE deverá disponibilizar:</p>
          <ul style="list-style: none; padding-left: 0;">
            <li contenteditable="true">✓ Local seguro para armazenar as ferramentas dos técnicos e materiais necessários para execução dos trabalhos;</li>
            <li contenteditable="true">✓ Local limpo e arejado, para vestiários com chuveiro;</li>
            <li contenteditable="true">✓ Água potável para os técnicos de montagem e startup;</li>
            <li contenteditable="true">✓ Disponibilizar ponto de energia trifásica e bifásica, a 10 (dez) metros de distância do local que será realizada as operações de montagem.</li>
          </ul>
          <p contenteditable="true">A CONTRATANTE assim também como a CONTRATADA, deverão cumprir e fazer cumprir, o bom andamento das operações de montagem e startup. Se houver uma demora de mais de duas horas, na espera da liberação dos trabalhos pelos técnicos de segurança da empresa CONTRATANTE, essas horas começam a ser cobradas, conforme função e valor da tabela "hora-homem", e os prazos começam a ser alterados de acordo com o tempo atrasado. Um atraso de até três horas, resulta no reagendamento dos trabalhos para o próximo dia útil, e as horas referentes ao dia de trabalho da equipe, serão cobradas da CONTRATANTE pela CONTRATADA, com base na tabela "hora-homem".</p>
          <p contenteditable="true">Concluídos as montagens e startup dos equipamentos, será emitido um relatório final de aprovação, que será devidamente assinado por dois funcionários de cada parte contratante, para todos os fins legais, sobretudo, contagem do início da Garantia dos equipamentos ora fornecidos.</p>
          <p contenteditable="true">Caso os testes de desempenho e funcionamento não sejam satisfatórios, a CONTRATADA procederá aos reajustes sem qualquer custo adicional à CONTRATANTE, e uma vez concluídos os ajustes/reajustes serão imediatamente realizados nos novos testes, não se aplicando para tanto aos itens e serviços que ora não são de fornecimento da CONTRATADA.</p>
          <div style="font-weight: 700; margin: 15px 0 10px;">Tabela Hora-Homem</div>
          <table class="valores-table">
            <thead><tr><th>PROFISSIONAL</th><th>VALOR HORA NORMAL</th></tr></thead>
            <tbody>
              <tr><td>Ajudante no geral</td><td>R$ 120,00</td></tr>
              <tr><td>Caldeireiro, Mecânico, Encanador, Eletricista, Soldador e Pintor</td><td>R$ 200,00</td></tr>
              <tr><td>Projetistas, Técnico de Automação e Técnico no geral</td><td>R$ 280,00</td></tr>
              <tr><td>Engenheiro e Inspetores no geral</td><td>R$ 350,00</td></tr>
            </tbody>
          </table>
          <p style="font-size: 12px; margin-top: 10px;">Hora Normal: De segunda-feira a sexta-feira, exceto feriados, dentro do horário comercial.</p>
          <p style="font-size: 12px;">Hora Extra (50%): De segunda-feira a sexta-feira, exceto feriados, após às 17h e aos sábados.</p>
          <p style="font-size: 12px;">Hora Extra (100%): Feriados e Domingo.</p>
          <p style="font-size: 12px;">Adicional Noturno (35%): Todos os dias, das 22h às 5h.</p>
          <p style="font-size: 12px; font-style: italic;">Nota: Valor da hora trabalhada e de translado, é o mesmo.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.6 OBRIGAÇÕES DA CONTRATANTE</div>
        <div class="texto-corpo">
          <p contenteditable="true">A CONTRATANTE deverá disponibilizar e fornecer informações e documentos, pertinentes ao produto processado e local de instalação dos equipamentos.</p>
          <p contenteditable="true">A CONTRATANTE deverá analisar, conferir e aprovar documentos e projetos junto a CONTRATADA, dentro do prazo de 5 (cinco) dias úteis, contados da data de envio do documento e/ou projeto.</p>
          <p contenteditable="true">A CONTRATANTE deverá efetuar o pagamento na forma e condições estabelecidas no item "PREÇO E CONDIÇÃO DE PAGAMENTO".</p>
          <p contenteditable="true">Reembolsar a CONTRATADA, de eventuais custos adicionais, originados por ato de responsabilidade da CONTRATANTE.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.7 OBRIGAÇÕES DA CONTRATADA</div>
        <div class="texto-corpo">
          <p contenteditable="true">É dever da CONTRATADA oferecer mão-de-obra especializada e cumprir todos os deveres e obrigações dispostos no ESCOPO DE FORNECIMENTO e CONDIÇÕES GERAIS desta proposta técnica comercial.</p>
          <p contenteditable="true">É dever da CONTRATADA proibir o uso do nome ou logotipo da CONTRATANTE, devendo proibir seu pessoal de utilizar o logo da CONTRATANTE em suas vestimentas, o que inclui o uso de bonés, cordões de porte de crachá, camisetas e quaisquer outras peças do vestuário ou acessórios. Da mesma forma, a CONTRATANTE se compromete a orientar seus colaboradores no intuito de não cederem quaisquer tipos de peças, trajes e/ou uniforme que seja, ao pessoal da CONTRATADA.</p>
          <p contenteditable="true">Os serviços especificados serão executados pela CONTRATADA, através de seus empregados, os quais nenhuma relação de emprego ou de trabalho terão com a CONTRATANTE, sendo de responsabilidade exclusiva da CONTRATADA todos os encargos trabalhistas, previdenciários e tributários, enunciativamente assim indicados: salários, vantagens adicionais de qualquer espécie, inclusive de insalubridade/periculosidade eventualmente devido, seguro de acidente do trabalho, Previdência Social, FGTS, indenizações e reparações trabalhistas, taxas e impostos, bem como quaisquer outros encargos relativos a serviços e empregados.</p>
          <p contenteditable="true">É de inteira responsabilidade da CONTRATADA o fornecimento de todas as ferramentas e maquinários necessários à fabricação dos equipamentos, além dos Equipamentos de Proteção Individual (EPI), sendo responsável ainda pelo treinamento e fiscalização do efetivo uso dos EPI's, respondendo exclusivamente em caso de eventual acidente de trabalho com seus prepostos e funcionários.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.8 ALTERAÇÃO DE PEDIDO</div>
        <div class="texto-corpo">
          <p contenteditable="true">Caso a CONTRATANTE solicite alterações no escopo de fornecimento, a CONTRATADA apresentará a CONTRATANTE, os impactos, valores e prazos para realização da alteração. A CONTRATANTE deverá responder a CONTRATADA, com a aprovação ou declínio da alteração, dentro de 5 (cinco) dias úteis, contados da apresentação da proposta de alteração da CONTRATADA para a CONTRATANTE.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.9 DEVOLUÇÃO OU TROCA DE MERCADORIA</div>
        <div class="texto-corpo">
          <p contenteditable="true">Não serão aceitas. Apenas em casos excepcionais serão aceitas, se houver prévia autorização da CONTRATADA e a CONTRATANTE arcará com todas as despesas envolvidas.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.10 CANCELAMENTO DE PEDIDO</div>
        <div class="texto-corpo">
          <p contenteditable="true">Não serão aceitas. Visto que os produtos são produzidos sob encomenda e necessitam de horas de engenharia, projeto e desenvolvimento e as peças/serviços oriundas dele atendem exclusivamente ao CONTRATANTE.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.11 ATRASO DE FATURAMENTO</div>
        <div class="texto-corpo">
          <p contenteditable="true">Ocorrendo atraso de faturamento por razões de responsabilidade do CONTRATANTE, como falta de documentos para aprovação do crédito, identificação de transportadora, não pagamento de antecipações/parcelas constantes nesta proposta técnica comercial, atraso de inspeção, diligenciamento e liberação de financiamento, a CONTRATADA cobrará o preço da mercadoria e/ou serviço, com base na lista de preço vigente na data do faturamento.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.12 TAXA DE ARMAZENAGEM</div>
        <div class="texto-corpo">
          <p contenteditable="true">Será cobrada uma taxa de armazenagem de 1% ao mês do valor do fornecimento, caso as mercadorias não sejam retiradas em até 30 dias após a data de faturamento, calculada pro-rata diem a partir do 31º dia, limitada a 10% do valor do faturamento.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.13 DANOS OU PREJUÍZOS</div>
        <div class="texto-corpo">
          <p contenteditable="true">A responsabilidade civil da CONTRATADA está limitada ao produto fornecido, não se responsabilizando por danos indiretos ou emergentes, tais como lucros cessantes, perdas de receitas, produtividade ou de dados, reclamações, paralizações, despesas, danos pessoais.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.14 RESPONSABILIDADE FINANCEIRA</div>
        <div class="texto-corpo">
          <p contenteditable="true">A CONTRATANTE poderá optar em proceder o pagamento das parcelas supracitadas através de financiamento junto ao BANCO, porém, desde que respeitados os prazos de pagamento desta proposta técnica comercial e sem qualquer participação da CONTRATADA, junto as instituições financeiras para liberação desses valores.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.15 CONSIDERAÇÕES CONSTRUTIVAS</div>
        <div class="texto-corpo">
          <p contenteditable="true">Os equipamentos e serviços ora ofertados nesta proposta técnica comercial, são padronizados pela CONTRATADA. Caso a CONTRATANTE tenha preferência ou necessidade que seja utilizado marca ou modelo especifico de qualquer componente ou material, deverá ser comunicado para a CONTRATADA previamente via e-mail, para revisão desta proposta comercial.</p>
          <p contenteditable="true">A CONTRATADA se resguarda do direito de utilizar o melhor aproveitamento dos materiais, durante o processo de fabricação e montagem de seus equipamentos, podendo aparecer soldas de complementos de materiais em pontos distintos. Caso a CONTRATANTE não concorde com o aproveitamento de material, deverá ser comunicado para a CONTRATADA previamente via e-mail, para revisão desta proposta comercial.</p>
          <p contenteditable="true">Fica entendido que todas as informações foram apresentadas ao CONTRATANTE nesta proposta técnica comercial, e foram suficientes para o entendimento e aceite do produto e/ou serviço que será fornecido, desta forma, qualquer informação e/ou característica que não foi apresentada previamente neste documento, seguirá o padrão do projeto e/ou serviço da CONTRATADA.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.16 VALIDADE DA PROPOSTA</div>
        <div class="texto-corpo">
          <p contenteditable="true">Esta proposta técnica comercial é válida por 15 (quinze) dias corridos, contados da data de emissão, informada na página inicial (capa).</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.17 REAJUSTE DE PREÇO</div>
        <div class="texto-corpo">
          <p contenteditable="true">Havendo alterações na legislação tributária vigente na época, a CONTRATADA se resguarda ao direito de atualizar os preços apresentados, de acordo com a nova tributação, com prévia aprovação do CONTRATANTE.</p>
          <p contenteditable="true">Para vendas fora do território nacional (BRASIL), os preços apresentados nesta proposta técnica comercial, poderão ser reajustado pela taxa do Dólar Americano, valor comercial de venda, até a data do faturamento, utilizando como taxa base USD 1,00 = VALOR DA COTAÇÃO DO DOLAR NA DATA DESTA PROPOSTA.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.18 DOCUMENTAÇÃO PARTE DO ESCOPO</div>
        <div class="texto-corpo">
          <p contenteditable="true">Os documentos abaixo relacionados, serão fornecidos em arquivos, formatos e cronograma padrão da CONTRATADA. Caso a CONTRATANTE necessite de documentos não relacionados abaixo ou padrões específicos, deverá ser comunicado para a CONTRATADA previamente via e-mail, para revisão desta proposta.</p>
          <ul style="list-style: none; padding-left: 0;">
            <li contenteditable="true">✓ Nota fiscal;</li>
            <li contenteditable="true">✓ Manual do equipamento;</li>
            <li contenteditable="true">✓ Diagrama elétrico do painel;</li>
            <li contenteditable="true">✓ Desenho com as dimensões gerais dos equipamentos;</li>
            <li contenteditable="true">✓ ART e laudo NR12 e NR13 do Dispersor e Reservatório de óleo.</li>
          </ul>
          <p contenteditable="true">Os documentos entregues a CONTRATANTE pela CONTRATADA, não poderão ser reproduzidos, comercializados e cedidos a terceiros, sem o prévio e expresso consentimento da CONTRATADA, e permanecem a sua exclusiva propriedade industrial.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.19 EXTINÇÃO DO CONTRATO</div>
        <div class="texto-corpo">
          <p contenteditable="true">O presente contrato estará imediatamente extinto entre as PARTES, em decorrência de causas supervenientes à sua celebração, sem nenhum ônus a qualquer das Partes e independentemente de qualquer notificação ou interpelação judicial ou extrajudicial nas seguintes hipóteses:</p>
          <p contenteditable="true">1) Decretação de falência da CONTRATADA, sem prejuízo da obrigação de indenizar.</p>
          <p contenteditable="true">2) Caso fortuito ou força maior: O evento proveniente de caso fortuito ou força maior não poderá perdurar por mais de 30 (trinta) dias corridos, contados do evento inesperado e inevitável.</p>
          <p contenteditable="true">3) Descumprimento do contrato: Em caso de quaisquer infrações contratuais constatadas, a Parte infratora será notificada, por escrito, para, no prazo de até 05 (cinco) dias úteis sanar o problema ou a falta notificada pela Parte inocente. Caso a Parte infratora não solucione o problema ou a falta notificada no prazo assinalado nesta cláusula, o contrato será considerado, automática e totalmente, descumprido, e, consequentemente, resolvido, independentemente de qualquer interpelação judicial ou extrajudicial.</p>
          <p contenteditable="true">4) Distrato: As partes poderão, a qualquer tempo, mediante comunicação escrita enviada com, no mínimo, 30 (trinta) dias de antecedência, extinguir o presente contrato sem aplicação de qualquer ônus, desde que esse distrato seja de comum acordo.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.20 DISPOSIÇÕES ADICIONAIS</div>
        <div class="texto-corpo">
          <p contenteditable="true"><strong>MODIFICAÇÃO DO CONTRATO:</strong> Toda e qualquer obrigação não mencionada no presente instrumento de contrato, bem como toda e qualquer alteração do ora pactuado, somente surtirá efeitos entre as Partes, quando realizada, por escrito, na forma de termo de aditivo ou alteração contratual.</p>
          <p contenteditable="true"><strong>TOLERÂNCIA:</strong> O cumprimento de modo diverso de quaisquer cláusulas deste ajuste caracterizará mera liberalidade da Parte tolerante, e, por conseguinte, não implicará em novação, perdão, suspensão, interrupção, renúncia, extinção, direito adquirido e/ou modificação do CONTRATO.</p>
          <p contenteditable="true"><strong>SUFICIÊNCIA DO CONTRATO:</strong> Ficam expressamente revogados todos e quaisquer pactos, ajustes, cláusulas e condições estabelecidas entre as partes na fase de negociação deste contrato. Ocorrendo divergência entre o avençado neste ajuste e eventuais anexos ou pedidos, prevalecerão as disposições deste contrato e/ou as de seus eventuais aditivos e/ou alterações.</p>
          <p contenteditable="true"><strong>LEITURA DAS CLÁUSULAS:</strong> A CONTRATANTE e a CONTRATADA declaram como declarado têm, ter lido e entendido todas as cláusulas deste instrumento contratual, não restando ou persistindo quaisquer dúvidas acerca do objeto contratado.</p>
          <p contenteditable="true"><strong>SIGILO:</strong> As PARTES se comprometem a manter em sigilo todos e quaisquer documentos, informações e dados técnicos de propriedade e interesse das mesmas, suscetíveis ou não de proteção legal, que tenham sido obtidos por qualquer meio, direta ou indiretamente da CONTRATANTE, através de seus prepostos, terceirizados ou subcontratos. Todos os documentos que por ventura forem entregues à CONTRATADA devem ser considerados como informações confidenciais e permanecem de propriedade exclusiva da CONTRATANTE, valendo as mesmas disposições em relação a CONTRATANTE e CONTRATADA. O dever de sigilo de que trata esta cláusula é contínuo, perene, irretratável e irrevogável, devendo manter-se mesmo após o término do contrato, independentemente do seu adimplemento por qualquer das partes, não sendo admitida em relação a esta obrigação nenhuma tolerância que não seja expressamente firmada e autorizada pelas PARTES.</p>
          <p contenteditable="true"><strong>DIREITO E USO DE IMAGEM:</strong> Os direitos de divulgação das imagens dos produtos e serviços comercializados, instalados ou meramente desenvolvidos pertencem à CONTRATADA podendo esta divulgá-las em operações de marketing e propaganda como melhor lhe convir, com o intuito de mostrar sua marca e produtos, e nunca se utilizando da marca da CONTRATANTE.</p>
          <p contenteditable="true">Na interpretação das disposições contratuais deve-se levar em conta sempre o Princípio da Boa-Fé Objetiva, tanto na fase pré-contratual como em sua formação e execução.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.21 FORO</div>
        <div class="texto-corpo">
          <p contenteditable="true">As partes elegem o Foro da Comarca de Diadema - SP, para qualquer ação, processo ou litígio oriundo da responsabilidade pelos produtos e/ou serviços fornecidos conforme ESCOPO DE FORNECIMENTO deste contrato, com renúncia de qualquer outro por mais especial que seja.</p>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.22 EXCLUSO DO FORNECIMENTO</div>
        <div class="texto-corpo">
          <p contenteditable="true">Estão exclusos do escopo de fornecimento da CONTRATADA, ficando de responsabilidade da CONTRATANTE, os seguintes itens:</p>
          <ol style="padding-left: 25px; line-height: 2;">
            <li contenteditable="true">Transporte e seguro dos equipamentos e suas partes;</li>
            <li contenteditable="true">Serviços de movimentação, como munck, guindaste, empilhadeira e demais que se fizerem necessários;</li>
            <li contenteditable="true">Serviços e materiais de instalação e infraestrutura, como elétrica, hidráulica, pneumática, civil, alvenaria e demais que se fizerem necessários;</li>
            <li contenteditable="true">Despesas com translado, estadia e alimentação da equipe de montagem e startup;</li>
            <li contenteditable="true">Sapatas, brocas, bases, e outros tipos de reforço necessário;</li>
            <li contenteditable="true">Consultoria química, de processo, para obtenção de licenças, e de qualquer outra natureza;</li>
            <li contenteditable="true">Laudo e certificados de calibração/aferição, como RBC, ISO, e outros que se fizerem necessários;</li>
            <li contenteditable="true">Equipamentos, acessórios e periféricos, como compressor de ar, exaustores, torre de resfriamento, unidade Chiller, bombas, tachos, tanques, reservatórios, balanças, envasadoras, prolongadores de envase, escada de serviço, mangueiras, bancadas e outros que se fizerem necessários;</li>
            <li contenteditable="true">E demais itens não citados expressamente nesta proposta técnica comercial.</li>
          </ol>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.23 PREÇO, CONDIÇÃO DE PAGAMENTO E IMPOSTOS</div>
        <div class="texto-corpo" style="margin-bottom: 15px;">
          <p>A CONTRATANTE pagará pelos equipamentos e/ou serviços indicados no ESCOPO DE FORNECIMENTO desta proposta comercial, os valores informados na tabela de preços a seguir.</p>
        </div>
        <div style="margin-top: 20px;">
          <div style="font-weight: 700; margin-bottom: 15px; font-size: 14px;">Tabela de Preços</div>
          <table class="valores-table">
            <thead>
              <tr><th>ITEM</th><th>DESCRIÇÃO</th><th>QUANT.</th><th>PREÇO UNITÁRIO</th><th>TOTAL</th></tr>
            </thead>
            <tbody>
              ${linhasTabelaPrecos}
              <tr class="total-row" style="display: table-row !important; visibility: visible !important; background: #ff6b35 !important; color: #ffffff !important;">
                <td colspan="4" style="text-align: right; font-weight: 700; background: #ff6b35 !important; color: #ffffff !important; padding: 15px !important; border: 1px solid #e55a2b !important;">TOTAL DA PROPOSTA</td>
                <td style="font-weight: 700; background: #ff6b35 !important; color: #ffffff !important; padding: 15px !important; border: 1px solid #e55a2b !important;">${fmt(totalProposta)}</td>
              </tr>
            </tbody>
          </table>
          <div style="margin-top: 20px; font-size: 13px;">
            <strong>CONDIÇÃO DE PAGAMENTO:</strong><br>
            <span contenteditable="true">${esc(condPag)}</span>
          </div>
          <div style="font-weight: 700; margin: 25px 0 10px; font-size: 14px;">Tabela REF. FINAME / CARTÃO BNDES</div>
          <table class="valores-table">
            <thead>
              <tr><th>ITEM</th><th>EQUIPAMENTO</th><th>REF. FINAME</th><th>REF. CARTÃO BNDES</th></tr>
            </thead>
            <tbody>
              <tr><td>1</td><td>Masseira Bimix</td><td>04051088</td><td>*********</td></tr>
              <tr><td>2</td><td>Masseira Trimix</td><td>03452459</td><td>MASSEIRA</td></tr>
              <tr><td>3</td><td>Masseira Helicoidal Vertical</td><td>03451446</td><td>MASSEIRA VH</td></tr>
              <tr><td>4</td><td>Tanque Dispersor</td><td>03452683</td><td>TANQUE DISP</td></tr>
              <tr><td>5</td><td>Tanque de Completagem/Agitador</td><td>04056078</td><td>*********</td></tr>
              <tr><td>6</td><td>Moinho Vertical</td><td>03464319</td><td>MOINHO VERTI</td></tr>
              <tr><td>7</td><td>Dispersor Hidropneumático</td><td>04051259</td><td>DISPERSOR HI</td></tr>
              <tr><td>8</td><td>Tachos</td><td>03465385</td><td>TACHO/TANQU</td></tr>
              <tr><td>9</td><td>Tanque de Armazenamento</td><td>03452690</td><td>TANQUE ARMAZ</td></tr>
              <tr><td>10</td><td>Moinho de Laboratório</td><td>04056053</td><td>*********</td></tr>
              <tr><td>11</td><td>Dispersor de Laboratório</td><td>04056231</td><td>*********</td></tr>
              <tr><td>12</td><td>Envasadora</td><td>03451453</td><td>ENVASADORA</td></tr>
            </tbody>
          </table>
          <div style="font-weight: 700; margin: 25px 0 10px; font-size: 14px;">IMPOSTOS E CLASSIFICAÇÕES FISCAIS</div>
          <div style="font-weight: 700; margin-bottom: 10px; font-size: 13px;">Tabela de Classificação Fiscal dos Equipamentos</div>
          <table class="valores-table" style="margin-bottom: 15px;">
            <thead><tr><th>NCM</th><th>IDENTIFICAÇÃO EQUIPAMENTOS MOINHO YPIRANGA</th></tr></thead>
            <tbody>
              <tr><td>8474.39.00</td><td>Misturadores, masseiras, dispersores, moinhos, agitadores, hélices e impelidores</td></tr>
              <tr><td>7309.00.90</td><td>Tachos, moegas, silos, tanques e demais reservatórios metálicos.</td></tr>
            </tbody>
          </table>
          <p style="font-size: 12px; font-style: italic; margin-bottom: 15px;">Nota: Para outros produtos, a classificação fiscal deverá ser consultada caso a caso.</p>
          <div style="font-weight: 700; margin-bottom: 10px; font-size: 13px;">Tabela de Impostos e Alíquotas</div>
          <table class="valores-table">
            <thead>
              <tr>
                <th>NCM</th><th>ICMS REGIÃO 1</th><th>ICMS REGIÃO 2</th><th>ICMS REGIÃO 3</th><th>IPI</th><th>PIS</th><th>COFINS</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>8474.39.00</td><td>18,00%</td><td>12,00%</td><td>7,00%</td><td>0%</td><td>0,65%</td><td>3,00%</td></tr>
              <tr><td>7309.00.90</td><td>12,00%</td><td>12,00%</td><td>7,00%</td><td>0%</td><td>0,65%</td><td>3,00%</td></tr>
            </tbody>
          </table>
          <div style="margin-top: 15px; font-size: 12px;">
            <p><strong>Região 1</strong> São Paulo (SP)</p>
            <p><strong>Região 2</strong> Minas Gerais (MG), Paraná (PR), Rio de Janeiro (RJ), Rio Grande do Sul (RS) e Santa Catarina (SC)</p>
            <p><strong>Região 3</strong> Acre (AC), Alagoas (AL), Amapá (AP), Amazonas (AM), Bahia (BA), Ceará (CE), Distrito Federal (DF), Espírito Santo (ES), Goiás (GO), Maranhão (MA), Mato Grosso (MT), Mato Grosso do Sul (MS), Pará (PA), Paraíba (PB), Pernambuco (PE), Piauí (PI), Rio Grande do Norte (RN), Rondônia (RO), Roraima (RR), Sergipe (SE) e Tocantins (TO).</p>
            <p style="font-style: italic; margin-top: 10px;">Nota: Redução tributária aplicada nos produtos classificados com NCM 8474.39.00, Inciso II, Artigo 12, Anexo II do RICMS/SP. Para outros produtos, os impostos e alíquotas deverão ser consultados caso a caso.</p>
          </div>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">5.24 CONSIDERAÇÃO FINAL</div>
        <div class="texto-corpo" style="margin-bottom: 0;">
          <p>Em caso de aceite e que não seja emitido um pedido de compra oficial formal, esta proposta torna-se apenas válida como pedido de compra mediante assinatura do responsável e com carimbo da empresa no campo destacado abaixo:</p>
          <div style="margin-top: 10px; padding: 10px; border: 2px solid #e0e0e0; border-radius: 8px;">
            <p style="margin-bottom: 5px;"><strong>Data da assinatura:</strong> _____/_____/_____</p>
            <p style="margin-bottom: 3px;"><strong>Assinatura e carimbo da empresa CONTRATANTE:</strong></p>
            <div style="margin-top: 5px; border-top: 2px solid #e0e0e0; padding-top: 3px; min-height: 30px;"></div>
          </div>
        </div>
      </div>`;
}

module.exports = { getCondicoesGeraisNano4YouHTML };
