# Fluxograma do Sistema CRM GMP

## Visão Geral do Sistema

Este documento apresenta o fluxograma completo do sistema CRM GMP, mostrando os principais fluxos de navegação, autenticação, módulos e funcionalidades.

## 1. Fluxo Principal de Autenticação e Navegação

```mermaid
flowchart TD
    Start([Usuário Acessa Sistema]) --> Splash[Splash Screen]
    Splash --> CheckOnboarding{Onboarding<br/>Completo?}
    CheckOnboarding -->|Não| Onboarding[Tela de Onboarding]
    CheckOnboarding -->|Sim| Login
    Onboarding --> Login[Login]
    
    Login --> Auth{Autenticação<br/>Válida?}
    Auth -->|Não| Login
    Auth -->|Sim| TipoSelecao[Tela de Seleção<br/>de Módulos]
    
    TipoSelecao --> Modulo{Qual Módulo?}
    
    Modulo -->|Comercial| Comercial[CRM Comercial]
    Modulo -->|Compras| Compras[Módulo Compras]
    Modulo -->|Financeiro| Financeiro[Módulo Financeiro]
    Modulo -->|Operacional| Operacional[Módulo Operacional]
    Modulo -->|Administrativo| Admin[Módulo Admin]
    
    Comercial --> Layout[Layout com Sidebar]
    Compras --> Layout
    Financeiro --> Layout
    Operacional --> Layout
    Admin --> Layout
    
    Layout --> Dashboard[Dashboard]
    Layout --> MenuItems[Itens do Menu]
    
    MenuItems --> Logout[Logout]
    Logout --> Login
```

## 2. Fluxo do Módulo Comercial (CRM)

```mermaid
flowchart TD
    Comercial[CRM Comercial] --> Dashboard[Dashboard]
    
    Dashboard --> Clientes[Clientes]
    Dashboard --> Projetos[Projetos]
    Dashboard --> Propostas[Propostas]
    Dashboard --> Produtos[Produtos]
    Dashboard --> Atividades[Atividades]
    Dashboard --> Aprovacoes[Aprovações]
    Dashboard --> Relatorios[Relatórios]
    Dashboard --> MaquinasVendidas[Máquinas Vendidas]
    Dashboard --> CustosViagens[Custos de Viagens]
    
    Clientes --> ListClientes[Listar Clientes]
    Clientes --> NovoCliente[Novo Cliente]
    Clientes --> EditarCliente[Editar Cliente]
    
    Projetos --> ListProjetos[Listar Projetos]
    Projetos --> NovoProjeto[Novo Projeto]
    Projetos --> EditarProjeto[Editar Projeto]
    
    Propostas --> ListPropostas[Listar Propostas]
    Propostas --> NovaProposta[Nova Proposta]
    Propostas --> EditarProposta[Editar Proposta]
    Propostas --> PreviewProposta[Preview Proposta]
    Propostas --> GerarPDF[Gerar PDF]
    Propostas --> ConfigTemplate[Configurar Template]
    
    Produtos --> ListProdutos[Listar Produtos]
    Produtos --> NovoProduto[Novo Produto]
    Produtos --> EditarProduto[Editar Produto]
    
    Atividades --> Calendario[Calendário de Atividades]
    Calendario --> NovaAtividade[Nova Atividade]
    Calendario --> EditarAtividade[Editar Atividade]
    Calendario --> VincularCliente[Vincular Cliente]
    Calendario --> VincularResponsavel[Vincular Responsável]
    
    Aprovacoes --> ListAprovacoes[Listar Aprovações]
    Aprovacoes --> NovaSolicitacao[Nova Solicitação]
    Aprovacoes --> Aprovar[Aprovar/Rejeitar]
    
    Relatorios --> RelatorioVendas[Relatório de Vendas]
    Relatorios --> RelatorioClientes[Relatório de Clientes]
    Relatorios --> RelatorioPropostas[Relatório de Propostas]
    
    MaquinasVendidas --> MapaClientes[Mapa de Clientes]
    MaquinasVendidas --> KPICards[KPIs e Estatísticas]
    
    CustosViagens --> ListCustos[Listar Custos]
    CustosViagens --> NovoCusto[Novo Custo]
    CustosViagens --> UploadComprovante[Upload Comprovante]
```

## 3. Fluxo de Criação e Geração de Proposta

```mermaid
flowchart TD
    Start([Iniciar Nova Proposta]) --> FormProposta[Formulário de Proposta]
    
    FormProposta --> PreencherDados[Preencher Dados Básicos]
    PreencherDados --> SelecionarCliente[Selecionar Cliente]
    SelecionarCliente --> SelecionarProjeto[Selecionar Projeto]
    SelecionarProjeto --> AdicionarItens[Adicionar Itens/Produtos]
    
    AdicionarItens --> SelecionarProdutos[Selecionar Produtos]
    SelecionarProdutos --> ConfigurarQuantidade[Configurar Quantidade/Valores]
    ConfigurarQuantidade --> CalcularTotal[Calcular Total]
    
    CalcularTotal --> SalvarRascunho{Salvar como<br/>Rascunho?}
    SalvarRascunho -->|Sim| SalvarDB[Salvar no Banco]
    SalvarRascunho -->|Não| PreviewProposta[Preview da Proposta]
    
    SalvarDB --> PreviewProposta
    
    PreviewProposta --> EditarConteudo[Editar Conteúdo Editável]
    EditarConteudo --> SalvarAlteracoes[Salvar Alterações]
    SalvarAlteracoes --> PreviewProposta
    
    PreviewProposta --> GerarPDF{Gerar PDF?}
    GerarPDF -->|Sim| Puppeteer[Puppeteer: Gerar PDF]
    GerarPDF -->|Não| Fim([Fim])
    
    Puppeteer --> CarregarHTML[Carregar HTML da Proposta]
    CarregarHTML --> AplicarCSS[Aplicar CSS de Impressão]
    AplicarCSS --> CalcularPadding[Calcular Padding Automático]
    CalcularPadding --> RenderizarPDF[Renderizar PDF]
    RenderizarPDF --> DownloadPDF[Download do PDF]
    DownloadPDF --> Fim
```

## 4. Fluxo de Autenticação e Permissões

```mermaid
flowchart TD
    Login[Login] --> ValidarCredenciais[Validar Credenciais]
    ValidarCredenciais -->|Inválidas| ErroLogin[Erro: Credenciais Inválidas]
    ErroLogin --> Login
    
    ValidarCredenciais -->|Válidas| GerarToken[Gerar Token JWT]
    GerarToken --> SalvarSessao[Salvar Sessão]
    SalvarSessao --> CarregarUsuario[Carregar Dados do Usuário]
    
    CarregarUsuario --> CarregarGrupos[Carregar Grupos do Usuário]
    CarregarGrupos --> CarregarPermissoes[Carregar Permissões]
    
    CarregarPermissoes --> VerificarModulo{Usuário tem acesso<br/>ao módulo?}
    VerificarModulo -->|Não| AcessoNegado[Acesso Negado]
    VerificarModulo -->|Sim| TipoSelecao[Tela de Seleção de Módulos]
    
    TipoSelecao --> NavegarModulo[Navegar para Módulo]
    NavegarModulo --> ProtectedRoute[ProtectedModuleRoute]
    
    ProtectedRoute --> VerificarAcessoModulo{Verificar Acesso<br/>ao Módulo}
    VerificarAcessoModulo -->|Sem Acesso| AcessoNegado
    VerificarAcessoModulo -->|Com Acesso| SplashModulo[Splash do Módulo]
    SplashModulo --> ModuloContent[Conteúdo do Módulo]
```

## 5. Fluxo de CRUD Genérico (Clientes, Projetos, Produtos)

```mermaid
flowchart TD
    Listagem[Listagem] --> Novo[Novo Registro]
    Listagem --> Editar[Editar Registro]
    Listagem --> Visualizar[Visualizar Registro]
    Listagem --> Excluir[Excluir Registro]
    Listagem --> Buscar[Buscar/Filtrar]
    
    Novo --> FormNovo[Formulário Novo]
    FormNovo --> ValidarForm{Validar<br/>Formulário}
    ValidarForm -->|Inválido| ErroValidacao[Erro de Validação]
    ErroValidacao --> FormNovo
    ValidarForm -->|Válido| SalvarAPI[Salvar via API]
    
    Editar --> FormEditar[Formulário Editar]
    FormEditar --> CarregarDados[Carregar Dados]
    CarregarDados --> ValidarForm
    
    SalvarAPI --> Sucesso{Sucesso?}
    Sucesso -->|Não| ErroAPI[Erro ao Salvar]
    ErroAPI --> FormNovo
    Sucesso -->|Sim| AtualizarLista[Atualizar Lista]
    AtualizarLista --> Listagem
    
    Excluir --> Confirmar{Confirmar<br/>Exclusão?}
    Confirmar -->|Não| Listagem
    Confirmar -->|Sim| ExcluirAPI[Excluir via API]
    ExcluirAPI --> SucessoExclusao{Sucesso?}
    SucessoExclusao -->|Não| ErroExclusao[Erro ao Excluir]
    SucessoExclusao -->|Sim| AtualizarLista
    
    Buscar --> AplicarFiltros[Aplicar Filtros]
    AplicarFiltros --> AtualizarLista
```

## 6. Fluxo de Atividades (Calendário)

```mermaid
flowchart TD
    Calendario[Calendário de Atividades] --> VisualizarEventos[Visualizar Eventos]
    
    VisualizarEventos --> ClicarSlot[Clicar em Slot Vazio]
    VisualizarEventos --> ClicarEvento[Clicar em Evento Existente]
    
    ClicarSlot --> ModalNovaAtividade[Modal: Nova Atividade]
    ClicarEvento --> ModalEditarAtividade[Modal: Editar Atividade]
    
    ModalNovaAtividade --> PreencherForm[Preencher Formulário]
    ModalEditarAtividade --> PreencherForm
    
    PreencherForm --> Campos[Campos: Título, Descrição, Tipo,<br/>Cliente, Responsável, Data,<br/>Hora Início, Hora Fim,<br/>Prioridade, Status]
    
    Campos --> SalvarAtividade{Salvar?}
    SalvarAtividade -->|Cancelar| Calendario
    SalvarAtividade -->|Salvar| ValidarAtividade{Validar<br/>Atividade}
    
    ValidarAtividade -->|Inválida| ErroValidacao[Erro de Validação]
    ErroValidacao --> PreencherForm
    ValidarAtividade -->|Válida| SalvarAPI[Salvar via API]
    
    SalvarAPI --> Sucesso{Sucesso?}
    Sucesso -->|Não| ErroAPI[Erro ao Salvar]
    ErroAPI --> PreencherForm
    Sucesso -->|Sim| AtualizarCalendario[Atualizar Calendário]
    AtualizarCalendario --> Calendario
    
    ModalEditarAtividade --> ExcluirAtividade{Excluir?}
    ExcluirAtividade -->|Sim| ConfirmarExclusao{Confirmar?}
    ConfirmarExclusao -->|Sim| ExcluirAPI[Excluir via API]
    ExcluirAPI --> AtualizarCalendario
```

## 7. Fluxo de Módulos Protegidos

```mermaid
flowchart TD
    AcessarModulo[Acessar Módulo Protegido] --> ProtectedRoute[ProtectedModuleRoute]
    
    ProtectedRoute --> VerificarUsuario{Usuário<br/>Autenticado?}
    VerificarUsuario -->|Não| RedirectLogin[Redirecionar para Login]
    
    VerificarUsuario -->|Sim| VerificarModulo{Usuário tem acesso<br/>ao módulo?}
    VerificarModulo -->|Não| AcessoNegado[Acesso Negado]
    VerificarModulo -->|Sim| VerificarMudancaModulo{Mudou de<br/>Módulo?}
    
    VerificarMudancaModulo -->|Sim| ResetEstados[Resetar Estados]
    VerificarMudancaModulo -->|Não| SplashScreen[Splash Screen]
    ResetEstados --> SplashScreen
    
    SplashScreen --> CarregarModulo[Carregar Conteúdo do Módulo]
    CarregarModulo --> ModuloContent[Exibir Módulo]
    
    ModuloContent --> Compras[Compras: Fornecedores,<br/>Pedidos, Cotações]
    ModuloContent --> Financeiro[Financeiro: Contas a Pagar,<br/>Contas a Receber, Fluxo de Caixa]
    ModuloContent --> Operacional[Operacional: Ordens de Serviço,<br/>Produção, Equipamentos]
    ModuloContent --> Admin[Admin: Usuários,<br/>Permissões, Configurações]
```

## 8. Estrutura de Dados e Banco de Dados

```mermaid
erDiagram
    USUARIOS ||--o{ PROPOSTAS : cria
    USUARIOS ||--o{ ATIVIDADES : responsavel
    USUARIOS ||--o{ APROVACOES : aprova
    USUARIOS ||--o{ GRUPOS_USUARIOS : pertence
    
    CLIENTES ||--o{ PROJETOS : possui
    CLIENTES ||--o{ PROPOSTAS : recebe
    CLIENTES ||--o{ ATIVIDADES : vinculado
    
    PROJETOS ||--o{ PROPOSTAS : gera
    PROJETOS ||--o{ ATIVIDADES : vinculado
    
    PROPOSTAS ||--o{ PROPOSTA_ITENS : contem
    PROPOSTAS ||--o{ APROVACOES : requer
    
    PRODUTOS ||--o{ PROPOSTA_ITENS : usado_em
    
    GRUPOS ||--o{ GRUPOS_USUARIOS : contem
    GRUPOS ||--o{ PERMISSOES : possui
    
    USUARIOS {
        int id PK
        string nome
        string email
        string senha_hash
        string cargo
    }
    
    CLIENTES {
        int id PK
        string nome
        string cnpj
        string endereco
        string telefone
        string email
    }
    
    PROJETOS {
        int id PK
        int cliente_id FK
        string nome
        string descricao
        date data_inicio
        date data_fim
    }
    
    PROPOSTAS {
        int id PK
        int cliente_id FK
        int projeto_id FK
        int usuario_id FK
        string numero_proposta
        date data_proposta
        decimal valor_total
        string status
    }
    
    PROPOSTA_ITENS {
        int id PK
        int proposta_id FK
        int produto_id FK
        int quantidade
        decimal valor_unitario
        decimal valor_total
    }
    
    PRODUTOS {
        int id PK
        string nome
        string descricao
        string categoria
        decimal preco_base
    }
    
    ATIVIDADES {
        int id PK
        int cliente_id FK
        int projeto_id FK
        int responsavel_id FK
        string titulo
        string descricao
        datetime data_agendada
        string status
    }
    
    APROVACOES {
        int id PK
        int proposta_id FK
        int aprovador_id FK
        string status
        string observacoes
    }
    
    GRUPOS {
        int id PK
        string nome
        string descricao
    }
    
    PERMISSOES {
        int id PK
        int grupo_id FK
        string modulo
        string permissao
    }
```

## 9. Fluxo de Geração de PDF (Puppeteer)

```mermaid
flowchart TD
    GerarPDF[Clique em Gerar PDF] --> SalvarProposta[Salvar Proposta no Banco]
    SalvarProposta --> ChamarAPI[Chamar API /propostas/:id/pdf]
    
    ChamarAPI --> AutenticarToken{Token Válido?}
    AutenticarToken -->|Não| ErroAuth[Erro: Não Autenticado]
    AutenticarToken -->|Sim| BuscarDados[Buscar Dados da Proposta]
    
    BuscarDados --> BuscarItens[Buscar Itens da Proposta]
    BuscarItens --> BuscarTotais[Buscar Totais]
    BuscarTotais --> BuscarTemplate[Buscar Configuração do Template]
    
    BuscarTemplate --> GerarHTML[Gerar HTML da Proposta]
    GerarHTML --> IncluirCSS[Incluir CSS de Impressão]
    IncluirCSS --> IncluirJS[Incluir JavaScript de Padding]
    
    IncluirJS --> IniciarPuppeteer[Iniciar Puppeteer]
    IniciarPuppeteer --> CriarPagina[Criar Nova Página]
    CriarPagina --> ConfigurarViewport[Configurar Viewport]
    
    ConfigurarViewport --> InterceptarRequests[Interceptar Requisições]
    InterceptarRequests --> CarregarHTML[Carregar HTML na Página]
    
    CarregarHTML --> AguardarImagens[Aguardar Carregamento de Imagens]
    AguardarImagens --> ExecutarJS[Executar JavaScript de Padding]
    
    ExecutarJS --> CalcularAlturas[Calcular Alturas dos Headers/Footers]
    CalcularAlturas --> AplicarPadding[Aplicar Padding Automático]
    AplicarPadding --> AguardarRenderizacao[Aguardar Renderização]
    
    AguardarRenderizacao --> GerarPDFBuffer[Gerar Buffer do PDF]
    GerarPDFBuffer --> FecharBrowser[Fechar Browser]
    FecharBrowser --> EnviarPDF[Enviar PDF como Download]
    
    EnviarPDF --> Fim([Download Completo])
    
    ErroAuth --> Fim
```

## 10. Fluxo de Aprovações

```mermaid
flowchart TD
    Aprovacoes[Aprovações] --> ListarSolicitacoes[Listar Solicitações]
    
    ListarSolicitacoes --> NovaSolicitacao[Nova Solicitação]
    ListarSolicitacoes --> VisualizarSolicitacao[Visualizar Solicitação]
    
    NovaSolicitacao --> FormSolicitacao[Formulário de Solicitação]
    FormSolicitacao --> PreencherDados[Preencher Dados]
    PreencherDados --> SelecionarProposta[Selecionar Proposta]
    SelecionarProposta --> AdicionarAnexos[Adicionar Anexos]
    AdicionarAnexos --> SalvarSolicitacao[Salvar Solicitação]
    
    SalvarSolicitacao --> StatusPendente[Status: Pendente]
    StatusPendente --> NotificarAprovadores[Notificar Aprovadores]
    
    VisualizarSolicitacao --> DetalhesSolicitacao[Detalhes da Solicitação]
    DetalhesSolicitacao --> Aprovar{Aprovar?}
    
    Aprovar -->|Sim| AprovarSolicitacao[Aprovar Solicitação]
    Aprovar -->|Não| RejeitarSolicitacao[Rejeitar Solicitação]
    
    AprovarSolicitacao --> StatusAprovado[Status: Aprovado]
    RejeitarSolicitacao --> StatusRejeitado[Status: Rejeitado]
    
    StatusAprovado --> NotificarSolicitante[Notificar Solicitante]
    StatusRejeitado --> NotificarSolicitante
    
    NotificarSolicitante --> AtualizarLista[Atualizar Lista]
    AtualizarLista --> ListarSolicitacoes
```

## Legenda

- **Retângulos**: Processos/Ações
- **Losangos**: Decisões/Condições
- **Círculos**: Início/Fim
- **Setas**: Fluxo de execução

## Observações Importantes

1. **Autenticação**: Todo acesso requer autenticação via JWT
2. **Permissões**: Cada módulo verifica permissões do usuário antes de permitir acesso
3. **Propostas**: O fluxo de geração de PDF usa Puppeteer para renderização server-side
4. **Atividades**: Integração com calendário permite vinculação com clientes e responsáveis
5. **Módulos**: Sistema modular com proteção de rotas por módulo
6. **Banco de Dados**: SQLite com relacionamentos entre entidades principais

## Tecnologias Utilizadas

- **Frontend**: React, React Router, Context API
- **Backend**: Node.js, Express, SQLite
- **PDF**: Puppeteer
- **Autenticação**: JWT
- **Estilização**: CSS3, Animações, Dark Mode
