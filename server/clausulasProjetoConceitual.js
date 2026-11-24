/**
 * Cláusulas do modelo de contrato "Projeto Conceitual".
 *
 * Origem: proposta 01260930/R00 (G&A Oeste — Projeto Conceitual, nova unidade fabril),
 * fornecida pelo Comercial em 24/11/2026 como o padrão para serviço de engenharia conceitual.
 *
 * DOCUMENTO DE SERVIÇO (pedido do Comercial, 24/11/2026: "não consegue seguir exatamente minha proposta? … Somente nesse caso,
 * o restante das propostas não mexa"). A proposta inteira de Projeto Conceitual sai como a de origem: capa, apresentação, dados
 * cadastrais, sumário e as cláusulas 1 a 20 na numeração e na ordem dela — SEM a seção de equipamento (foto, "Equipamento:",
 * código, modelo), sem FINAME e sem as tabelas fiscais. O template reconhece esse documento por `propostaDeServico`
 * (propostaPremiumV2.js) e numera as cláusulas pela posição; o preço (16) traz o quadro "Valor Total dos Serviços".
 *
 * *(A versão de 24/11/2026 de manhã encaixava estas cláusulas no molde de equipamento — 1-3 no começo, "4. ESCOPO TÉCNICO" como
 * 5.1, financiamento/confidencialidade/validade antes do preço, "Item 5.5". Desfeito: o usuário quer a proposta dele.)*
 * - Os campos "Data / Responsável / Assinatura" da 20. VALIDADE E ACEITE não entram no texto: a página de assinatura os desenha.
 * - O modelo gravado no banco é ressincronizado com este arquivo no boot (`sincronizarModeloClausulas` em index.js) — ninguém
 *   edita modelo pela tela; as propostas que já copiaram as cláusulas mantêm a cópia (para adotar a nova: "Resetar cláusulas").
 */

// Lista com ✓, o mesmo estilo das listas do contrato de equipamentos (clausulasDefault.js).
const lista = (itens) =>
  `<ul style="list-style:none;padding-left:0;">${itens.map((i) => `<li>✓ ${i}</li>`).join('')}</ul>`;
const sub = (titulo) => `<p><strong>${titulo}</strong></p>`;

const CLAUSULAS_PROJETO_CONCEITUAL = [
  {
    numero: '1.',
    titulo: 'OBJETIVO DA PROPOSTA',
    conteudo: '<p>A presente proposta contempla a elaboração do PROJETO CONCEITUAL para construção, ampliação, modernização e/ou reorganização da unidade industrial do CLIENTE, com foco nas áreas de produção de Tintas e Revestimentos da linha imobiliária e industrial, e respectivos processos industriais.</p>'
      + '<p>O trabalho tem como objetivo estabelecer diretrizes técnicas, operacionais e estratégicas que apoiem o CLIENTE no planejamento da planta, definição de prioridades e futuras etapas de engenharia.</p>'
      + '<p>O PROJETO CONCEITUAL será desenvolvido com base em princípios de Excelência Operacional, buscando avaliar soluções que possam favorecer:</p>'
      + lista(['Eficiência produtiva;', 'Flexibilidade e escalabilidade;', 'Automação;', 'Segurança e ergonomia;', 'Melhor aproveitamento de áreas e recursos;', 'Possibilidades de expansão;', 'Sustentabilidade;', 'Viabilidade técnica e econômica.'])
      + '<p>O Projeto Conceitual terá caráter orientativo e preliminar, não substituindo as etapas posteriores de Engenharia Básica, Engenharia Detalhada, validações, testes e dimensionamentos definitivos.</p>',
  },
  {
    numero: '2.',
    titulo: 'METODOLOGIA',
    conteudo: '<p>O desenvolvimento será conduzido em duas etapas:</p>'
      + '<p><strong>Elaboração:</strong> desenvolvimento de possíveis soluções para atendimento às necessidades e premissas identificadas.</p>'
      + '<p><strong>Verificação:</strong> avaliação das alternativas sob aspectos técnicos, operacionais e econômicos compatíveis com o nível conceitual.</p>'
      + '<p>Poderão ser desenvolvidas até 3 (três) alternativas de layout, para uma mesma capacidade produtiva de referência.</p>'
      + '<p>Quando aplicável, até 2 (duas) alternativas poderão ser comparadas de forma mais detalhada quanto a características técnicas, vantagens, limitações, flexibilidade, implantação e estimativa preliminar de investimento.</p>'
      + '<p>A alternativa selecionada servirá como base para os entregáveis finais.</p>',
  },
  {
    numero: '3.',
    titulo: 'PREMISSAS E ÁREAS DE ESTUDO',
    conteudo: '<p>Serão consideradas inicialmente as seguintes premissas:</p>'
      + lista(['Operação de segunda a sexta-feira;', 'Jornada de referência de 8 horas/dia;', '1 turno de produção;', 'Média de 22 dias úteis/mês;', 'Capacidade produtiva mensal: A INFORMAR PELO CLIENTE;', 'Crescimento anual previsto: A INFORMAR PELO CLIENTE;', 'Horizonte de avaliação: até 10 anos.'])
      + '<p>O Projeto Conceitual poderá contemplar, conforme aplicabilidade:</p>'
      + lista(['Recebimento e armazenamento de matérias-primas;', 'Pesagem e fracionamento;', 'Fabricação e processamento;', 'Tanques e silos;', 'Envase e embalagem;', 'Armazenamento de produtos acabados;', 'Laboratórios;', 'Áreas de contenção;', 'Utilidades;', 'Principais rotas de Tubulações e Pipe Racks;', 'CCMs e sistemas elétricos associados;', 'Expedição e carregamento.'])
      + '<p>A abrangência efetiva estará limitada ao nível conceitual e ao escopo desta proposta.</p>',
  },
  {
    numero: '4.',
    titulo: 'ESCOPO TÉCNICO',
    conteudo: '<p>O estudo poderá contemplar:</p>'
      + sub('4.1 Processos e Layout')
      + lista(['Análise dos fluxos de materiais, pessoas e informações;', 'Identificação de atividades VA e NVA;', 'Avaliação de gargalos e movimentações;', 'Desenvolvimento do layout industrial;', 'Integração entre fabricação, armazenamento, envase, expedição e utilidades;', 'Avaliação de expansões futuras.'])
      + sub('4.2 Equipamentos e Automação')
      + '<p>Serão definidos, em nível conceitual, os principais equipamentos e sistemas aplicáveis ao processo, considerando capacidade, flexibilidade, expansão, integração e manutenção.</p>'
      + '<p>Poderão ser avaliadas soluções de:</p>'
      + lista(['Mistura, dispersão e moagem;', 'Armazenamento;', 'Dosagem;', 'Transferência;', 'Alimentação de matérias-primas;', 'Envase;', 'Embalagem;', 'Movimentação;', 'Automação e controle.'])
      + '<p>Sempre que técnica e economicamente aplicável, serão estudadas alternativas para redução de movimentações e operações manuais.</p>'
      + sub('4.3 Tecnologias de Processo')
      + '<p>A GMP poderá avaliar tecnologias convencionais, semivácuo e a vácuo, além de soluções próprias ou exclusivas, quando adequadas à aplicação.</p>'
      + '<p>Essas tecnologias poderão apresentar oportunidades relacionadas a eficiência de dispersão, homogeneização, redução de ar incorporado, otimização de tempos de processo e melhor aproveitamento de pigmentos e matérias-primas.</p>'
      + '<p>Eventuais reduções de consumo, inclusive de dióxido de titânio, dependerão das formulações, matérias-primas, testes e critérios de qualidade do CLIENTE, não constituindo garantia prévia de desempenho.</p>'
      + sub('4.4 DNA da Companhia (CLIENTE)')
      + '<p>Quando disponíveis pelo CLIENTE, poderão ser considerados dados históricos de produção, preferencialmente de período representativo e podendo alcançar até 02 (dois) anos, contemplando volumes, lotes, famílias, sequenciamento, sazonalidade e restrições operacionais.</p>'
      + '<p>O objetivo é desenvolver uma solução Taylor Made – sob medida, alinhada às características específicas da operação.</p>',
  },
  {
    numero: '5.',
    titulo: 'OPORTUNIDADES A SEREM AVALIADAS',
    conteudo: '<p>Durante o desenvolvimento, a GMP poderá identificar oportunidades adicionais relacionadas a:</p>'
      + lista(['Redução de resíduos;', 'Reaproveitamento de materiais e solventes de limpeza;', 'Processos gravitacionais;', 'Eficiência energética;', 'Redução de movimentações internas;', 'Verticalização de processos;', 'Automação;', 'Otimização logística;', 'Redução de emissões;', 'Sustentabilidade;', 'Modernização tecnológica.'])
      + '<p>O conceito de Zero Resíduo poderá ser utilizado como direcionador, sempre condicionado à viabilidade técnica, econômica, ambiental e aos requisitos de qualidade.</p>'
      + '<p>Eventuais oportunidades de redução de emissões ou geração de créditos de carbono dependerão de metodologia, comprovação, auditoria, regulamentação e validação por entidades competentes, não constituindo garantia de obtenção de créditos.</p>',
  },
  {
    numero: '6.',
    titulo: 'POTENCIAL DE FINANCIAMENTO DOS INVESTIMENTOS',
    conteudo: '<p>Os projetos desenvolvidos pela GMP procuram incorporar, quando aplicáveis, conceitos de inovação, automação, eficiência energética, digitalização, produtividade, sustentabilidade e modernização tecnológica.</p>'
      + '<p>Esses atributos poderão, dependendo das regras e programas vigentes à época, favorecer a análise e o eventual enquadramento dos investimentos industriais em linhas de crédito ou mecanismos de financiamento.</p>'
      + '<p>A utilização de tecnologias próprias ou exclusivas da GMP também poderá contribuir para a diferenciação tecnológica do projeto, conforme os critérios de cada programa ou instituição.</p>'
      + '<p>Ao final do Projeto Conceitual, caso seja de interesse do CLIENTE, a GMP poderá prestar, mediante contratação específica, serviço adicional de assessoria para apoio na pesquisa e identificação de linhas de crédito, financiamento e programas de incentivo disponíveis naquele momento e potencialmente compatíveis com o projeto desenvolvido.</p>'
      + '<p>Essa assessoria poderá contemplar, conforme o escopo contratado:</p>'
      + lista(['Pesquisa de linhas de financiamento e programas disponíveis;', 'Identificação preliminar de alternativas potencialmente aderentes ao investimento;', 'Organização das informações técnicas do projeto;', 'Apoio na preparação da documentação técnica sob responsabilidade da GMP;', 'Orientação ao CLIENTE durante o processo de consulta às instituições financeiras ou agentes de fomento.'])
      + '<p>A atuação da GMP terá caráter exclusivamente consultivo e de apoio, não compreendendo decisão de crédito, intermediação financeira, concessão de recursos ou garantia de enquadramento.</p>'
      + '<p>A existência de uma linha potencialmente aplicável não representa garantia de aprovação ou obtenção do financiamento. A análise, aprovação, valores, taxas, prazos, carências, garantias e demais condições dependerão exclusivamente das regras vigentes, da instituição financeira ou agente de fomento e das condições cadastrais, financeiras e documentais do CLIENTE.</p>'
      + '<p>Dessa forma, a assessoria terá como objetivo auxiliar o CLIENTE na busca e avaliação das alternativas disponíveis no momento, sem assumir compromisso quanto à efetiva contratação ou liberação dos recursos.</p>',
  },
  {
    numero: '7.',
    titulo: 'NORMAS TÉCNICAS',
    conteudo: '<p>Os estudos serão desenvolvidos considerando, quando aplicáveis ao escopo, normas e referências pertinentes, incluindo:</p>'
      + lista(['ABNT/NBR;', 'Normas Regulamentadoras – NR;', 'IEC;', 'ASME;', 'DIN;', 'Outras normas aplicáveis à disciplina ou equipamento.'])
      + '<p>Quando previsto no escopo contratado, poderá ser emitida a respectiva ART – Anotação de Responsabilidade Técnica, conforme requisitos do sistema CONFEA/CREA.</p>',
  },
  {
    numero: '8.',
    titulo: 'ENTREGÁVEIS',
    conteudo: '<p>Estão previstos:</p>'
      + lista(['Relatório final de Engenharia Conceitual;', 'Estudo de até 3 alternativas de layout;', 'Layout 2D da alternativa selecionada;', 'Planta-chave geral;', 'Orçamento padrão GMP com os principais equipamentos e estimativa preliminar de custos;', 'Masterplan conceitual da alternativa selecionada.'])
      + '<p>Os documentos serão emitidos em nível de Engenharia Conceitual e não deverão ser utilizados diretamente para fabricação, construção, montagem ou execução.</p>'
      + '<p>Dimensionamentos definitivos dependerão das etapas posteriores de engenharia.</p>',
  },
  {
    numero: '9.',
    titulo: 'REUNIÕES, VISITAS E DOCUMENTAÇÃO',
    conteudo: '<p>Os serviços serão desenvolvidos predominantemente no escritório da GMP INDUSTRIAIS, em São Bernardo do Campo – SP – Brasil, com reuniões online conforme necessidade.</p>'
      + '<p>Não está prevista visita técnica às instalações do CLIENTE.</p>'
      + '<p>Caso seja necessária, deverá ser previamente acordada, ficando despesas de transporte, hospedagem, alimentação, traslados e demais custos relacionados sob responsabilidade do CLIENTE ou objeto de proposta complementar.</p>'
      + '<p>Os documentos poderão ser fornecidos em:</p>'
      + lista(['Excel;', 'PDF;', 'Português – Brasil.']) /* 'DWG versão 2010' saiu a pedido do Comercial (24/11/2026) */,
  },
  {
    numero: '10.',
    titulo: 'REVISÕES E APROVAÇÕES',
    conteudo: '<p>Estão previstas até 2 (duas) revisões na fase de layout, desde que mantidas as premissas originalmente contratadas.</p>'
      + '<p>O CLIENTE terá prazo de 5 (cinco) dias úteis para apresentar comentários sobre documentos submetidos à aprovação.</p>'
      + '<p>Na ausência de manifestação nesse prazo, a GMP considerará a etapa aprovada para fins de continuidade do cronograma.</p>'
      + '<p>Alterações posteriores de capacidade, processo, produtos, premissas ou documentos fornecidos que impliquem retrabalho poderão ser tratadas como alteração de escopo, sujeitas à avaliação de prazo e condição comercial.</p>',
  },
  {
    numero: '11.',
    titulo: 'RESPONSABILIDADE DO CLIENTE',
    conteudo: '<p>Compete ao CLIENTE fornecer, em tempo adequado, as informações necessárias ao desenvolvimento do projeto, incluindo, conforme aplicável:</p>'
      + lista(['Dados de produção;', 'FISPQs/SDS;', 'Boletins técnicos;', 'Informações de processo;', 'Volumes e lotes;', 'Embalagens;', 'Dados de resíduos e perdas;', 'Plantas em DWG;', 'Cortes e elevações;', 'Informações de equipamentos existentes;', 'Topografia;', 'Análise de solo;', 'Tensão elétrica;', 'Demais dados necessários.'])
      + '<p>O CLIENTE será responsável pela exatidão, atualização e integridade das informações fornecidas.</p>'
      + '<p>Alterações posteriores dessas informações poderão gerar revisão do projeto.</p>',
  },
  {
    numero: '12.',
    titulo: 'CONSIDERAÇÃO SOBRE O TRABALHO',
    conteudo: '<p>Os serviços e projetos contemplados nesta Proposta Técnica Comercial serão desenvolvidos com base nos padrões técnicos, construtivos e documentais adotados pela GMP INDUSTRIAIS, considerando, conforme aplicável, equipamentos de processo, acessórios, critérios de engenharia, normas técnicas e conceitos de infraestrutura industrial previstos no escopo contratado.</p>'
      + '<p>O CLIENTE declara ter recebido as informações necessárias para compreensão geral do escopo, das premissas, dos limites e dos entregáveis aqui estabelecidos.</p>'
      + '<p>Sempre que determinada característica, especificação, detalhe construtivo, documento ou critério técnico não estiver expressamente definido nesta proposta ou em documento formalmente incorporado ao contrato, a GMP poderá adotar seus padrões internos de engenharia, fabricação e fornecimento, observadas as normas aplicáveis e as premissas técnicas do projeto.</p>'
      + '<p>Qualquer requisito específico do CLIENTE que diverja dos padrões GMP deverá ser previamente informado, analisado e formalmente acordado entre as partes. Caso tal requisito gere impacto técnico, comercial ou de prazo, poderá ser objeto de revisão de escopo e/ou aditivo contratual.</p>',
  },
  {
    numero: '13.',
    titulo: 'LIMITAÇÃO DOS RESULTADOS',
    conteudo: '<p>Por se tratar de Engenharia Conceitual, poderão ser identificadas, avaliadas ou mencionadas oportunidades relacionadas, entre outras, a:</p>'
      + lista(['Produtividade;', 'Redução de custos;', 'Redução de consumos;', 'Eficiência energética;', 'Quantidade de operadores;', 'CAPEX e OPEX;', 'Logística;', 'Resíduos;', 'Formulações;', 'Retorno de investimento;', 'Sustentabilidade;', 'Financiamentos;', 'Demais indicadores técnicos ou econômicos associados ao projeto.'])
      + '<p>A simples menção, identificação ou avaliação de qualquer dos tópicos acima não representa obrigação da GMP de fornecer estudos específicos, cálculos detalhados, memoriais, laudos, simulações, quantificações, comprovações ou entregáveis individuais relacionados a esses temas, salvo quando expressamente indicados como parte do escopo e dos entregáveis desta Proposta Técnica Comercial.</p>'
      + '<p>Eventuais informações apresentadas sobre esses temas deverão ser entendidas como referências conceituais, estimativas preliminares ou potenciais oportunidades, elaboradas com base nas informações disponíveis no momento do estudo.</p>'
      + '<p>A confirmação ou quantificação desses resultados poderá depender de etapas adicionais de Engenharia Básica, Engenharia Detalhada, testes, ensaios, cotações, medições, simulações, estudos especializados ou validações específicas, que somente integrarão o fornecimento quando expressamente contratados.</p>'
      + '<p>Consequentemente, nenhum benefício, economia, percentual, desempenho, enquadramento ou resultado mencionado no Projeto Conceitual deverá ser interpretado como garantia contratual ou obrigação de resultado da GMP.</p>'
      + '<p>O escopo efetivamente contratado será exclusivamente aquele expressamente relacionado no Item 8 – Entregáveis e demais itens desta proposta que indiquem de forma inequívoca uma obrigação de fornecimento da GMP.</p>',
  },
  {
    numero: '14.',
    titulo: 'EXCLUSÕES',
    conteudo: '<p>Salvo indicação expressa em contrário, não fazem parte do escopo:</p>'
      + lista(['Engenharia Básica ou Detalhada;', 'Projetos 3D;', 'Projetos civis, arquitetônicos ou estruturais;', 'Fundações, drenagem e terraplenagem;', 'Entrada de energia;', 'Instalações hidrossanitárias;', 'Sistema de combate a incêndio;', 'Topografia e análise de solo;', 'As Built;', 'Desenvolvimento de software;', 'Consultoria química;', 'Licenciamentos e aprovações governamentais;', 'Supervisão ou execução de obras;', 'Fabricação, montagem ou instalação;', 'Serviços não expressamente descritos nesta proposta.']),
  },
  {
    numero: '15.',
    titulo: 'PRAZO DE ENTREGA',
    conteudo: '<p>O prazo previsto para conclusão dos serviços é de até 60 (sessenta) dias úteis, contados após:</p>'
      + lista(['Aceite formal ou Pedido de Compra;', 'Pagamento da parcela de entrada;', 'Recebimento das informações necessárias ao desenvolvimento.'])
      + '<p>Atrasos no fornecimento de informações, validações, aprovações ou alterações de escopo poderão impactar o cronograma.</p>',
  },
  {
    numero: '17.',
    titulo: 'FINANCIAMENTO PARA PAGAMENTO DO PROJETO CONCEITUAL',
    conteudo: '<p>O CLIENTE poderá, por sua iniciativa, avaliar linha de crédito ou financiamento para pagamento total ou parcial dos serviços de elaboração do PROJETO CONCEITUAL objeto desta proposta.</p>'
      + '<p>Esta condição se refere exclusivamente ao pagamento dos serviços de engenharia aqui contratados e não se confunde com eventual financiamento futuro destinado a máquinas, equipamentos, obras ou implantação da fábrica.</p>'
      + '<p>A GMP poderá fornecer os documentos técnicos e comerciais disponíveis dentro de seu escopo para auxiliar o CLIENTE na solicitação.</p>'
      + '<p>A contratação de financiamento não altera automaticamente os vencimentos e condições desta proposta.</p>'
      + '<p>A aprovação, liberação, taxas, prazos, carências e garantias serão de responsabilidade exclusiva do CLIENTE e da instituição financeira, não estando os pagamentos devidos à GMP condicionados à obtenção desses recursos.</p>',
  },
  {
    numero: '18.',
    titulo: 'CONFIDENCIALIDADE',
    conteudo: '<p>A GMP manterá caráter confidencial sobre as informações técnicas e comerciais fornecidas pelo CLIENTE, utilizando-as exclusivamente para desenvolvimento dos serviços contratados, ressalvadas obrigações legais ou condições específicas formalmente acordadas.</p>',
  },
  {
    numero: '20.',
    titulo: 'VALIDADE E ACEITE',
    conteudo: '<p>A presente proposta terá validade de 15 (quinze) dias corridos a partir da data de emissão.</p>'
      + '<p>O aceite poderá ser formalizado por Pedido de Compra ou assinatura de representante autorizado do CLIENTE.</p>',
  },
  // Preço: o documento de serviço desenha, logo abaixo do título, o quadro "Valor Total dos Serviços" com o total da proposta
  // (como na proposta de origem) — por isso o texto diz "O valor acima".
  {
    numero: '16.',
    titulo: 'PREÇO E CONDIÇÃO DE PAGAMENTO',
    conteudo: '<p>O valor acima corresponde aos serviços de elaboração do Projeto Conceitual, conforme escopo, premissas, entregáveis, responsabilidades e exclusões definidos nesta Proposta Técnica Comercial.</p>',
  },
  {
    numero: '16.1',
    titulo: 'CONDIÇÃO DE PAGAMENTO:',
    conteudo: '<p><strong>1ª Parcela – Entrada:</strong> 40% (quarenta por cento), na confirmação do pedido e aceite formal desta proposta.</p>'
      + '<p><strong>2ª Parcela – Apresentação do Layout:</strong> 30% (trinta por cento), na apresentação da alternativa de layout desenvolvida pela GMP.</p>'
      + '<p><strong>3ª Parcela – Saldo Final:</strong> 30% (trinta por cento), em até 21 DDL, contados da entrega dos documentos previstos no escopo.</p>'
      + sub('Condições Gerais')
      + lista(['Os pagamentos deverão ser realizados conforme os dados bancários e instruções de cobrança informados pela GMP INDUSTRIAIS;', 'O início dos trabalhos estará condicionado ao aceite formal da proposta, emissão do Pedido de Compra quando aplicável e pagamento da parcela de entrada;', 'Eventuais serviços adicionais, revisões extraordinárias ou alterações de escopo serão previamente avaliados e, quando aplicável, objeto de proposta complementar e/ou aditivo contratual;', 'Tributos e demais condições comerciais seguirão o disposto nesta Proposta Técnica Comercial.']),
  },
  {
    numero: '19.',
    titulo: 'CONSIDERAÇÃO FINAL',
    conteudo: '<p>O Projeto Conceitual busca fornecer ao CLIENTE uma visão técnica e estratégica para planejamento de sua evolução industrial, considerando:</p>'
      + '<p><strong>PROCESSO + PRODUTIVIDADE + QUALIDADE + SEGURANÇA + AUTOMAÇÃO + FLEXIBILIDADE + SUSTENTABILIDADE + CRESCIMENTO + VIABILIDADE ECONÔMICA</strong></p>'
      + '<p>O trabalho deverá constituir uma base para avaliação dos próximos investimentos e futuras etapas de engenharia, auxiliando a tomada de decisão sem substituir os estudos, validações e dimensionamentos definitivos necessários à implantação.</p>',
  },
];

// Ordem do documento de origem: pelo número (16. antes de 16.1 antes de 17.).
const chaveDoNumero = (n) => String(n).split('.').filter(Boolean).map(Number);
CLAUSULAS_PROJETO_CONCEITUAL.sort((a, b) => {
  const x = chaveDoNumero(a.numero); const y = chaveDoNumero(b.numero);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
});

function getClausulasProjetoConceitual() {
  // Cópia profunda: quem chamar edita o resultado sem contaminar o padrão em memória.
  return CLAUSULAS_PROJETO_CONCEITUAL.map((c) => ({ ...c }));
}

module.exports = { getClausulasProjetoConceitual, CLAUSULAS_PROJETO_CONCEITUAL };
