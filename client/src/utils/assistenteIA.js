// Assistente IA Local - Base de Conhecimento Completa
// Sistema de busca semântica sem APIs externas

export const baseConhecimento = {
  // Módulo Comercial
  clientes: {
    perguntas: [
      'como criar cliente', 'cadastrar cliente', 'novo cliente', 'adicionar cliente',
      'editar cliente', 'alterar cliente', 'modificar cliente',
      'buscar cliente', 'pesquisar cliente', 'procurar cliente',
      'excluir cliente', 'remover cliente', 'deletar cliente',
      'listar clientes', 'ver clientes', 'todos clientes',
      'informações cliente', 'dados cliente', 'detalhes cliente'
    ],
    respostas: [
      {
        pergunta: 'Como criar um novo cliente?',
        resposta: `Para criar um novo cliente no sistema:

1. Acesse o menu "Comercial" → "Clientes"
2. Clique no botão "Novo Cliente" (canto superior direito)
3. Preencha os campos obrigatórios:
   - Razão Social (obrigatório)
   - CNPJ (obrigatório e único)
   - Nome Fantasia
   - Email
   - Telefone
4. Preencha os dados de endereço:
   - CEP (busca automática)
   - Logradouro, Número, Complemento
   - Bairro, Cidade, Estado
5. Adicione informações adicionais:
   - Segmento de mercado
   - Observações
   - Contatos (pode adicionar múltiplos)
6. Clique em "Salvar"

O sistema gera automaticamente um código único para o cliente.`,
        categoria: 'clientes',
        tags: ['criar', 'cadastro', 'novo', 'adicionar']
      },
      {
        pergunta: 'Como editar um cliente existente?',
        resposta: `Para editar um cliente:

1. Acesse "Comercial" → "Clientes"
2. Use a busca para encontrar o cliente desejado
3. Clique no ícone de lápis (editar) na linha do cliente
4. Modifique os campos necessários
5. Clique em "Salvar" para confirmar as alterações

Nota: O CNPJ não pode ser alterado após o cadastro.`,
        categoria: 'clientes',
        tags: ['editar', 'alterar', 'modificar', 'atualizar']
      },
      {
        pergunta: 'Como buscar um cliente?',
        resposta: `Existem várias formas de buscar clientes:

1. **Busca na lista de clientes:**
   - Digite na barra de busca: nome, CNPJ, cidade, etc.
   - Use os filtros por segmento ou status

2. **Busca Global (Ctrl+K):**
   - Pressione Ctrl+K em qualquer lugar do sistema
   - Digite o nome ou CNPJ do cliente
   - Selecione o resultado para ir direto ao cliente

3. **Filtros avançados:**
   - Por segmento de mercado
   - Por cidade/estado
   - Por status (ativo/inativo)`,
        categoria: 'clientes',
        tags: ['buscar', 'pesquisar', 'procurar', 'encontrar']
      }
    ]
  },

  propostas: {
    perguntas: [
      'como criar proposta', 'nova proposta', 'fazer proposta', 'gerar proposta',
      'editar proposta', 'alterar proposta', 'modificar proposta',
      'enviar proposta', 'aprovar proposta', 'rejeitar proposta',
      'status proposta', 'validade proposta', 'valor proposta',
      'produtos proposta', 'itens proposta', 'adicionar produto proposta',
      'template proposta', 'modelo proposta', 'formato proposta',
      'exportar proposta', 'imprimir proposta', 'pdf proposta'
    ],
    respostas: [
      {
        pergunta: 'Como criar uma proposta comercial?',
        resposta: `Para criar uma proposta comercial:

1. Acesse "Comercial" → "Propostas"
2. Clique em "Nova Proposta"
3. Selecione o cliente (obrigatório)
4. Preencha as informações básicas:
   - Título da proposta
   - Responsável pela proposta
   - Validade (opcional)
5. Adicione produtos/serviços:
   - Clique em "Adicionar Item"
   - Busque ou selecione o produto
   - Informe quantidade e valor unitário
   - O sistema calcula automaticamente o total
6. Configure condições comerciais:
   - Desconto (se aplicável)
   - Forma de pagamento
   - Prazo de entrega
7. Adicione observações (opcional)
8. Clique em "Salvar"

O sistema gera automaticamente o número da proposta no formato configurado.`,
        categoria: 'propostas',
        tags: ['criar', 'nova', 'fazer', 'gerar']
      },
      {
        pergunta: 'Como adicionar produtos a uma proposta?',
        resposta: `Para adicionar produtos em uma proposta:

1. Na tela de criação/edição de proposta
2. Na seção "Itens da Proposta", clique em "Adicionar Item"
3. Você pode:
   - **Buscar produto existente:** Digite o nome ou código
   - **Criar item personalizado:** Preencha descrição, quantidade, unidade e valor
4. Para cada item, informe:
   - Descrição/Nome do produto
   - Quantidade
   - Unidade (UN, KG, M, etc.)
   - Valor unitário
   - O sistema calcula o valor total automaticamente
5. Você pode adicionar múltiplos itens
6. Para remover um item, clique no ícone de lixeira

Dica: Use a busca de produtos para manter consistência nos cadastros.`,
        categoria: 'propostas',
        tags: ['produtos', 'itens', 'adicionar', 'incluir']
      },
      {
        pergunta: 'Como alterar o status de uma proposta?',
        resposta: `Para alterar o status de uma proposta:

1. Acesse a lista de propostas
2. Encontre a proposta desejada
3. Clique no botão de ações (ícone de check verde) para aprovar
4. Ou use o menu de ações para:
   - **Enviar:** Marca como enviada ao cliente
   - **Aprovar:** Marca como aprovada
   - **Rejeitar:** Marca como rejeitada
   - **Cancelar:** Cancela a proposta

Status disponíveis:
- **Rascunho:** Proposta em criação
- **Enviada:** Enviada ao cliente
- **Aprovada:** Aprovada pelo cliente
- **Rejeitada:** Rejeitada pelo cliente
- **Cancelada:** Cancelada internamente`,
        categoria: 'propostas',
        tags: ['status', 'aprovar', 'rejeitar', 'enviar', 'cancelar']
      }
    ]
  },

  produtos: {
    perguntas: [
      'como criar produto', 'cadastrar produto', 'novo produto', 'adicionar produto',
      'editar produto', 'alterar produto', 'modificar produto',
      'buscar produto', 'pesquisar produto', 'procurar produto',
      'família produto', 'categoria produto', 'modelo produto',
      'preço produto', 'valor produto', 'custo produto',
      'equipamento', 'disco', 'acessório', 'serviço'
    ],
    respostas: [
      {
        pergunta: 'Como cadastrar um novo produto?',
        resposta: `Para cadastrar um produto:

1. Acesse "Comercial" → "Produtos"
2. Clique em "Novo Produto"
3. Selecione o tipo:
   - **Equipamento:** Máquinas e equipamentos
   - **Discos e Acessórios:** Discos, hélices, acessórios
   - **Serviços:** Serviços prestados
4. Preencha as informações:
   - **Código:** Gerado automaticamente ou informe manualmente
   - **Nome:** Nome do produto (obrigatório)
   - **Família:** Família do produto
   - **Modelo:** Para equipamentos, informe o modelo (ex: ULTRAMIX, Bimix)
   - **Unidade:** UN, KG, M, etc.
   - **Preço Base:** Valor base do produto
   - **ICMS e IPI:** Percentuais de impostos
   - **NCM:** Código NCM (opcional)
5. Adicione especificações técnicas (se aplicável)
6. Faça upload de imagem (opcional)
7. Clique em "Salvar"

Dica: Para equipamentos, o campo "Modelo" aparece automaticamente quando você seleciona uma família.`,
        categoria: 'produtos',
        tags: ['criar', 'cadastrar', 'novo', 'adicionar']
      },
      {
        pergunta: 'O que é o campo Modelo do Equipamento?',
        resposta: `O campo "Modelo do Equipamento" é usado para especificar o modelo de um equipamento.

**Quando aparece:**
- Quando você seleciona uma família de produto que não é "Hélices e Acessórios"
- Exemplo: Se você seleciona "Masseiras", pode informar o modelo como "ULTRAMIX" ou "Bimix"

**Para que serve:**
- Facilita a busca e identificação de equipamentos específicos
- Permite diferenciar equipamentos da mesma família
- Melhora a organização do catálogo

**Como usar:**
1. Selecione a família do produto (ex: "Masseiras")
2. O campo "Modelo do Equipamento" aparece automaticamente
3. Digite o modelo (ex: "ULTRAMIX", "Bimix", "Modelo X")
4. Este modelo pode ser buscado depois na lista de produtos`,
        categoria: 'produtos',
        tags: ['modelo', 'equipamento', 'família', 'busca']
      }
    ]
  },

  dashboard: {
    perguntas: [
      'dashboard', 'painel', 'métricas', 'kpi', 'indicadores',
      'gráficos', 'estatísticas', 'relatórios dashboard',
      'filtros dashboard', 'visualizar dados'
    ],
    respostas: [
      {
        pergunta: 'Como usar o Dashboard Executivo?',
        resposta: `O Dashboard Executivo mostra uma visão geral do seu negócio:

**Métricas Principais:**
- Total de Clientes
- Propostas em Aberto
- Valor Total em Oportunidades
- Projetos Ativos
- Atividades Pendentes

**Gráficos Disponíveis:**
- Evolução de Vendas (linha do tempo)
- Propostas por Status (pizza)
- Oportunidades por Fase (barras)
- Atividades por Tipo (barras)

**Filtros:**
- Por período (data inicial e final)
- Por responsável
- Por cliente
- Por status

**Como usar:**
1. Acesse o Dashboard pelo menu principal
2. Use os filtros no topo para personalizar a visualização
3. Clique nos gráficos para ver detalhes
4. Exporte os dados em Excel ou PDF se necessário`,
        categoria: 'dashboard',
        tags: ['dashboard', 'painel', 'métricas', 'kpi']
      }
    ]
  },

  atividades: {
    perguntas: [
      'como criar atividade', 'nova atividade', 'lembrete', 'tarefa',
      'agendar', 'calendário', 'compromisso', 'reunião',
      'editar atividade', 'concluir atividade', 'status atividade'
    ],
    respostas: [
      {
        pergunta: 'Como criar uma atividade ou lembrete?',
        resposta: `Para criar uma atividade:

1. Acesse "Comercial" → "Atividades"
2. Clique em "Nova Atividade"
3. Preencha:
   - **Título:** Nome da atividade
   - **Tipo:** Reunião, Ligação, Email, Visita, etc.
   - **Cliente/Projeto:** Vincule a um cliente ou projeto (opcional)
   - **Data/Hora:** Quando a atividade deve acontecer
   - **Prioridade:** Baixa, Média, Alta
   - **Status:** Pendente, Em Andamento, Concluída
   - **Responsável:** Quem vai realizar
   - **Descrição:** Detalhes adicionais
4. Clique em "Salvar"

**Visualização:**
- Veja todas as atividades no calendário
- Filtre por tipo, status ou responsável
- Receba lembretes de atividades pendentes`,
        categoria: 'atividades',
        tags: ['criar', 'nova', 'lembrete', 'tarefa', 'agendar']
      }
    ]
  },

  geral: {
    perguntas: [
      'busca global', 'ctrl k', 'atalho', 'teclado',
      'exportar', 'importar', 'excel', 'pdf',
      'filtros', 'pesquisar', 'buscar',
      'permissões', 'usuários', 'configurações',
      'ajuda', 'suporte', 'como funciona', 'tutorial'
    ],
    respostas: [
      {
        pergunta: 'Como usar a busca global (Ctrl+K)?',
        resposta: `A busca global permite encontrar rapidamente qualquer informação:

**Como usar:**
1. Pressione **Ctrl+K** em qualquer lugar do sistema
2. Digite o que procura (mínimo 2 caracteres)
3. O sistema busca em:
   - Clientes (nome, CNPJ)
   - Propostas (número, título, cliente)
   - Produtos (nome, código, modelo)
   - Projetos (nome, descrição)
   - Oportunidades (título, cliente)
   - Atividades (título, descrição)
4. Use as setas para navegar
5. Pressione Enter para abrir o resultado
6. Pressione Esc para fechar

**Dicas:**
- Busque por qualquer palavra-chave
- A busca é case-insensitive (não diferencia maiúsculas/minúsculas)
- Resultados aparecem em tempo real`,
        categoria: 'geral',
        tags: ['busca', 'ctrl k', 'atalho', 'pesquisar']
      },
      {
        pergunta: 'Como exportar dados?',
        resposta: `Você pode exportar dados em vários formatos:

**Formatos disponíveis:**
- **Excel (.xlsx):** Para análise e edição
- **PDF:** Para impressão e compartilhamento
- **CSV:** Para importação em outros sistemas

**O que pode exportar:**
- Listas completas (clientes, produtos, propostas, etc.)
- Dados filtrados
- Relatórios
- Gráficos (como imagem)

**Como exportar:**
1. Na página desejada, clique no botão "Exportar Excel" ou "Exportar PDF"
2. O arquivo será baixado automaticamente
3. Abra o arquivo no aplicativo correspondente

**Atalho:** Em algumas páginas, use Ctrl+E para exportar rapidamente`,
        categoria: 'geral',
        tags: ['exportar', 'excel', 'pdf', 'dados']
      }
    ]
  }
};

// Função de similaridade de texto (Jaccard + Levenshtein simplificado)
function calcularSimilaridade(texto1, texto2) {
  const palavras1 = texto1.toLowerCase().split(/\s+/).filter(p => p.length > 2);
  const palavras2 = texto2.toLowerCase().split(/\s+/).filter(p => p.length > 2);
  
  const set1 = new Set(palavras1);
  const set2 = new Set(palavras2);
  
  const intersecao = [...set1].filter(x => set2.has(x)).length;
  const uniao = new Set([...set1, ...set2]).size;
  
  const jaccard = uniao > 0 ? intersecao / uniao : 0;
  
  // Bônus para palavras exatas
  let bonus = 0;
  palavras1.forEach(p => {
    if (palavras2.some(p2 => p2.includes(p) || p.includes(p2))) {
      bonus += 0.1;
    }
  });
  
  return Math.min(1, jaccard + bonus);
}

// Buscar melhor resposta
export function buscarResposta(pergunta) {
  const perguntaLower = pergunta.toLowerCase().trim();
  
  if (perguntaLower.length < 2) {
    return null;
  }
  
  let melhorResposta = null;
  let melhorScore = 0;
  
  // Buscar em todas as categorias
  Object.keys(baseConhecimento).forEach(categoria => {
    const categoriaData = baseConhecimento[categoria];
    
    // Verificar perguntas similares
    categoriaData.perguntas.forEach((perguntaBase, index) => {
      const similaridade = calcularSimilaridade(perguntaLower, perguntaBase);
      if (similaridade > melhorScore && similaridade > 0.3) {
        melhorScore = similaridade;
        melhorResposta = categoriaData.respostas[index] || categoriaData.respostas[0];
      }
    });
    
    // Verificar respostas diretamente
    categoriaData.respostas.forEach(resposta => {
      const scoreTitulo = calcularSimilaridade(perguntaLower, resposta.pergunta);
      const scoreTags = resposta.tags.reduce((max, tag) => {
        const sim = calcularSimilaridade(perguntaLower, tag);
        return Math.max(max, sim);
      }, 0);
      
      const scoreTotal = Math.max(scoreTitulo, scoreTags * 0.8);
      
      if (scoreTotal > melhorScore && scoreTotal > 0.3) {
        melhorScore = scoreTotal;
        melhorResposta = resposta;
      }
    });
  });
  
  return melhorResposta ? { ...melhorResposta, score: melhorScore } : null;
}

// Gerar resposta contextual
export function gerarRespostaContextual(pergunta, contexto = {}) {
  const resposta = buscarResposta(pergunta);
  
  if (!resposta) {
    return {
      pergunta,
      resposta: `Desculpe, não encontrei uma resposta específica para "${pergunta}". 

Tente reformular sua pergunta ou use palavras-chave como:
- "Como criar..."
- "Como editar..."
- "Como buscar..."
- "Como usar..."

Ou pergunte sobre:
- Clientes
- Propostas
- Produtos
- Dashboard
- Atividades
- Busca global (Ctrl+K)
- Exportação de dados`,
      categoria: 'geral',
      score: 0
    };
  }
  
  // Personalizar resposta com contexto se disponível
  let respostaPersonalizada = resposta.resposta;
  
  if (contexto.modulo) {
    respostaPersonalizada += `\n\n💡 Você está no módulo: ${contexto.modulo}`;
  }
  
  return {
    ...resposta,
    resposta: respostaPersonalizada
  };
}

// Sugerir perguntas relacionadas
export function sugerirPerguntas(pergunta) {
  const perguntaLower = pergunta.toLowerCase();
  const sugestoes = [];
  
  Object.keys(baseConhecimento).forEach(categoria => {
    baseConhecimento[categoria].respostas.forEach(resposta => {
      const tagsMatch = resposta.tags.some(tag => 
        perguntaLower.includes(tag) || tag.includes(perguntaLower)
      );
      
      if (tagsMatch && sugestoes.length < 5) {
        sugestoes.push(resposta.pergunta);
      }
    });
  });
  
  return sugestoes.slice(0, 5);
}
