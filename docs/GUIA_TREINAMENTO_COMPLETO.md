# 📚 GUIA COMPLETO DE TREINAMENTO - CRM GMP INDUSTRIAIS

## 🎯 OBJETIVO DESTE DOCUMENTO

Este documento serve como base completa para criação de apresentações, tutoriais e materiais de treinamento sobre o sistema CRM GMP INDUSTRIAIS. Todas as funcionalidades, módulos e processos estão detalhados aqui.

---

## 📋 ÍNDICE

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Primeiro Acesso e Configuração Inicial](#2-primeiro-acesso-e-configuração-inicial)
3. [Módulo Comercial (CRM)](#3-módulo-comercial-crm)
4. [Módulo de Compras](#4-módulo-de-compras)
5. [Módulo Financeiro](#5-módulo-financeiro)
6. [Módulo Operacional/Fabrica](#6-módulo-operacionalfabrica)
7. [Módulo Administrativo](#7-módulo-administrativo)
8. [Funcionalidades Transversais](#8-funcionalidades-transversais)
9. [Dicas e Boas Práticas](#9-dicas-e-boas-práticas)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. VISÃO GERAL DO SISTEMA

### 1.1 O que é o CRM GMP INDUSTRIAIS?

Sistema completo de gestão desenvolvido especificamente para a GMP INDUSTRIAIS, empresa especializada em projetos Turn Key para diversos segmentos industriais:
- Tintas & Vernizes
- Químico
- Cosméticos
- Alimentícios
- Domissanitários
- Saneantes

### 1.2 Arquitetura do Sistema

O sistema é dividido em **5 módulos principais**:

1. **COMERCIAL** - Gestão de clientes, propostas, vendas e relacionamento
2. **COMPRAS** - Gestão de fornecedores, cotações e pedidos
3. **FINANCEIRO** - Controle financeiro, contas a pagar/receber, fluxo de caixa
4. **OPERACIONAL/FÁBRICA** - Gestão de produção, ordens de serviço, colaboradores
5. **ADMINISTRATIVO** - Configurações, usuários, permissões e relatórios

### 1.3 Tecnologias Utilizadas

- **Frontend:** React, React Router, Recharts (gráficos)
- **Backend:** Node.js, Express.js
- **Banco de Dados:** SQLite
- **Autenticação:** JWT (JSON Web Tokens)
- **Segurança:** bcryptjs (criptografia de senhas)

---

## 2. PRIMEIRO ACESSO E CONFIGURAÇÃO INICIAL

### 2.1 Tela de Login

**Como acessar:**
1. Abra o navegador e acesse a URL do sistema
2. Você verá a tela de login

**Credenciais Padrão:**
- **Email:** `admin@gmp.com.br`
- **Senha:** `admin123`

**⚠️ IMPORTANTE:** Após o primeiro login, altere a senha padrão!

### 2.2 Primeiro Acesso - Onboarding

Na primeira vez que você acessa o sistema:

1. **Splash Screen** - Tela de boas-vindas com logo da empresa
2. **Onboarding** - Tutorial interativo explicando:
   - O que é o sistema
   - Como navegar
   - Principais funcionalidades
   - Dicas de uso

**Como pular o onboarding:**
- Clique em "Pular" no canto superior direito
- Você pode revisar depois através do menu de ajuda

### 2.3 Seleção de Módulos

Após o login, você verá a **Tela de Seleção de Módulos** com 5 opções:

1. **🏢 COMERCIAL** - Clique para acessar o CRM
2. **🛒 COMPRAS** - Gestão de compras e fornecedores
3. **💰 FINANCEIRO** - Controle financeiro
4. **🏭 OPERACIONAL** - Gestão de produção
5. **⚙️ ADMINISTRATIVO** - Configurações e administração

**Como funciona:**
- Cada módulo tem acesso controlado por permissões
- Se você não tiver permissão, verá mensagem de acesso negado
- Você pode alternar entre módulos a qualquer momento

---

## 3. MÓDULO COMERCIAL (CRM)

### 3.1 Dashboard Comercial

**O que você vê:**
- **6 Cards de Métricas:**
  1. Total de Clientes
  2. Propostas em Aberto
  3. Valor Total em Propostas
  4. Oportunidades Ativas
  5. Atividades do Dia
  6. Taxa de Conversão

- **4 Gráficos Interativos:**
  1. Vendas por Período (linha)
  2. Propostas por Status (pizza)
  3. Top 5 Clientes (barras)
  4. Pipeline de Vendas (funil)

- **Ações Rápidas:**
  - Novo Cliente
  - Nova Proposta
  - Nova Oportunidade
  - Nova Atividade

**Como usar:**
- Clique nos gráficos para ver detalhes
- Use os filtros de período (últimos 7 dias, 30 dias, 90 dias, 1 ano)
- Clique nos cards para navegar para a lista completa

### 3.2 Gestão de Clientes

#### 3.2.1 Lista de Clientes

**Funcionalidades:**
- **Busca:** Digite nome, CNPJ ou email na barra de busca
- **Filtros:**
  - Por Segmento (Tintas, Químico, Cosméticos, etc.)
  - Por Status (Ativo, Inativo)
  - Por Cidade/Estado
- **Ordenação:** Clique nos cabeçalhos das colunas
- **Visualização:** Lista ou Cards

**Ações disponíveis:**
- **👁️ Visualizar** - Ver detalhes completos
- **✏️ Editar** - Modificar informações
- **🗑️ Desativar** - Marcar como inativo (não deleta)
- **📍 Ver no Mapa** - Visualizar localização no mapa

#### 3.2.2 Cadastro de Cliente

**Campos obrigatórios:**
- Razão Social
- Email
- Telefone

**Campos opcionais:**
- Nome Fantasia
- CNPJ
- Segmento
- Endereço completo (rua, número, complemento, bairro, cidade, estado, CEP)
- Contato Principal
- Observações

**Como cadastrar:**
1. Clique em "Novo Cliente" no Dashboard ou na lista
2. Preencha os campos obrigatórios
3. Adicione informações complementares
4. Clique em "Salvar"

**Dicas:**
- O CNPJ é validado automaticamente
- O sistema sugere endereço ao digitar o CEP
- Você pode adicionar logo do cliente depois

#### 3.2.3 Visualização de Cliente

**O que você vê:**
- Informações completas do cliente
- Histórico de propostas vinculadas
- Projetos relacionados
- Atividades realizadas
- Oportunidades em aberto
- Mapa com localização

**Ações:**
- Editar informações
- Criar nova proposta
- Criar nova oportunidade
- Agendar atividade
- Ver histórico completo

### 3.3 Gestão de Propostas

#### 3.3.1 Lista de Propostas

**Visualizações disponíveis:**
- **Tabela** - Lista completa com todas as informações
- **Cards** - Visualização em cards com resumo
- **Kanban** - Por status (Rascunho, Enviada, Aprovada, Rejeitada)

**Filtros:**
- Por Cliente
- Por Status
- Por Período (data de criação)
- Por Valor
- Por Responsável

**Status possíveis:**
- 📝 Rascunho
- 📤 Enviada
- ✅ Aprovada
- ❌ Rejeitada
- ⏸️ Em Análise
- 🔄 Revisão

#### 3.3.2 Criação de Proposta

**Passo a passo:**

1. **Informações Básicas:**
   - Selecione o Cliente (obrigatório)
   - Número da Proposta (gerado automaticamente ou manual)
   - Data de Validade
   - Observações Gerais

2. **Adicionar Itens:**
   - Clique em "Adicionar Item"
   - Selecione o Produto
   - Informe Quantidade
   - Preço Unitário (pode ser editado)
   - Desconto (opcional, por item)
   - Descrição/Especificações Técnicas

3. **Configurar Valores:**
   - O sistema calcula automaticamente:
     - Subtotal por item
     - Subtotal geral
     - Desconto total
     - Valor final
   - Você pode aplicar desconto geral adicional

4. **Configurar Template:**
   - Escolha o template de proposta
   - Personalize cores e logo
   - Adicione cabeçalho/rodapé customizado

5. **Revisar e Salvar:**
   - Visualize a proposta antes de salvar
   - Clique em "Salvar como Rascunho" ou "Enviar"

**Funcionalidades avançadas:**
- **Duplicar Proposta:** Crie uma nova baseada em uma existente
- **Versões:** Sistema de versionamento automático
- **Anexos:** Adicione documentos, imagens, especificações
- **Histórico:** Veja todas as alterações e quem fez

#### 3.3.3 Visualização/Edição de Proposta

**Modo Visualização:**
- Veja a proposta formatada como será enviada
- Visualize em PDF (botão "Gerar PDF")
- Imprima diretamente
- Compartilhe por email

**Modo Edição:**
- Edite qualquer campo
- Adicione/remova itens
- Altere valores
- Atualize status

**Ações disponíveis:**
- ✏️ Editar
- 📄 Gerar PDF
- 📧 Enviar por Email
- 📋 Duplicar
- 🔄 Criar Revisão
- 📊 Ver Histórico
- 🗑️ Excluir (apenas rascunhos)

#### 3.3.4 Templates de Proposta

**O que são:**
Templates personalizáveis para padronizar o visual das propostas.

**Como configurar:**
1. Acesse "Configurações" → "Templates de Proposta"
2. Clique em "Novo Template"
3. Configure:
   - Nome do Template
   - Logo da Empresa
   - Cores (Primária, Secundária, Texto)
   - Cabeçalho Customizado
   - Rodapé Customizado
   - Texto de Introdução
   - Mostrar/Ocultar seções

**Editor Visual:**
- Use o editor WYSIWYG para criar templates
- Arraste e solte componentes
- Preview em tempo real
- Salve como padrão

### 3.4 Gestão de Oportunidades

#### 3.4.1 Pipeline de Vendas

**Etapas do Pipeline:**
1. **Prospecção** - Primeiro contato
2. **Qualificação** - Avaliação do potencial
3. **Proposta** - Proposta enviada
4. **Negociação** - Em negociação
5. **Fechamento** - Ganha ou Perdida

**Como usar:**
- Arraste oportunidades entre etapas
- Clique para ver detalhes
- Configure probabilidade de fechamento
- Defina valor estimado

#### 3.4.2 Cadastro de Oportunidade

**Campos:**
- Cliente (obrigatório)
- Nome da Oportunidade
- Valor Estimado
- Probabilidade (%)
- Etapa do Pipeline
- Data Prevista de Fechamento
- Descrição
- Observações

**Funcionalidades:**
- Vincular a uma Proposta existente
- Criar Proposta a partir da Oportunidade
- Adicionar Atividades
- Definir Lembrete

### 3.5 Gestão de Atividades

#### 3.5.1 Tipos de Atividades

- **Reunião** - Reuniões com clientes
- **Ligação** - Chamadas telefônicas
- **Email** - Comunicações por email
- **Visita** - Visitas técnicas
- **Tarefa** - Tarefas gerais
- **Follow-up** - Acompanhamentos

#### 3.5.2 Calendário de Atividades

**Visualizações:**
- **Mês** - Visão mensal completa
- **Semana** - Visão semanal detalhada
- **Dia** - Lista de atividades do dia
- **Lista** - Lista completa

**Funcionalidades:**
- Clique em um dia para criar atividade
- Arraste atividades para mudar data/hora
- Cores diferentes por tipo
- Filtros por cliente, responsável, tipo

#### 3.5.3 Criar Atividade

**Campos:**
- Tipo (obrigatório)
- Título (obrigatório)
- Cliente/Projeto (opcional)
- Data e Hora
- Duração
- Descrição
- Lembrete (opcional)
- Participantes (opcional)

**Lembretes:**
- 15 minutos antes
- 30 minutos antes
- 1 hora antes
- 1 dia antes
- Personalizado

### 3.6 Gestão de Projetos

#### 3.6.1 Lista de Projetos

**Informações exibidas:**
- Nome do Projeto
- Cliente
- Status
- Data de Início
- Data Prevista de Término
- Valor Total
- Responsável

**Filtros:**
- Por Cliente
- Por Status
- Por Responsável
- Por Período

#### 3.6.2 Cadastro de Projeto

**Campos:**
- Nome do Projeto (obrigatório)
- Cliente (obrigatório)
- Tipo (Turn Key, Consultoria, Manutenção, etc.)
- Status (Planejamento, Em Andamento, Concluído, Cancelado)
- Data de Início
- Data Prevista de Término
- Valor Total
- Descrição
- Observações

**Vinculações:**
- Vincular Propostas
- Vincular Ordens de Serviço
- Vincular Atividades
- Vincular Documentos

### 3.7 Ordens de Serviço Comerciais

#### 3.7.1 Lista de OS

**Visualizações:**
- Tabela completa
- Cards
- Por Status

**Status:**
- Aberta
- Em Andamento
- Aguardando Cliente
- Concluída
- Cancelada

#### 3.7.2 Criar OS Comercial

**Passo a passo:**
1. Selecione o Cliente
2. Vincule a uma Proposta (opcional)
3. Informe Tipo de OS
4. Defina Prioridade
5. Adicione Descrição
6. Adicione Itens/Serviços
7. Defina Responsável
8. Salve

**Itens da OS:**
- Produto/Serviço
- Quantidade
- Valor Unitário
- Desconto
- Observações

### 3.8 Custos de Viagens

#### 3.8.1 Cadastro de Custo de Viagem

**Quando usar:**
Para registrar custos de deslocamento, hospedagem, alimentação e outros gastos relacionados a visitas técnicas, instalações ou atendimentos.

**Campos:**
- Cliente/Projeto relacionado
- Data da Viagem
- Destino
- Tipo de Custo (Transporte, Hospedagem, Alimentação, Outros)
- Valor
- Descrição
- Anexos (notas fiscais, recibos)

**Funcionalidades:**
- Calcular rota otimizada (se houver múltiplos clientes)
- Visualizar no mapa
- Gerar relatório de custos
- Vincular a proposta/projeto

#### 3.8.2 Otimização de Rotas

**Como usar:**
1. Selecione múltiplos clientes
2. Clique em "Calcular Rota"
3. O sistema calcula a rota mais eficiente
4. Visualize no mapa
5. Salve a rota

**Informações exibidas:**
- Distância total
- Tempo estimado
- Ordem de visita
- Mapa interativo

### 3.9 Máquinas Vendidas

#### 3.9.1 Mural de Máquinas

**Visualização:**
- Cards com foto da máquina
- Informações: Cliente, Data de Venda, Valor
- Filtros por cliente, período, tipo

**Funcionalidades:**
- Ver detalhes completos
- Editar informações
- Adicionar fotos
- Ver localização no mapa

#### 3.9.2 Mapa de Máquinas

**O que é:**
Mapa interativo mostrando todas as máquinas vendidas e suas localizações.

**Como usar:**
- Clique nos marcadores para ver informações
- Filtre por tipo de máquina
- Filtre por período
- Veja agrupamentos por região

### 3.10 Relatórios Comerciais

#### 3.10.1 Tipos de Relatórios

1. **Vendas por Período**
   - Gráfico de linha
   - Filtros por período
   - Exportar para Excel/PDF

2. **Propostas por Status**
   - Gráfico de pizza
   - Valores e percentuais
   - Detalhamento

3. **Top Clientes**
   - Ranking de clientes
   - Por valor vendido
   - Por quantidade de propostas

4. **Pipeline de Vendas**
   - Funil de conversão
   - Taxa de conversão por etapa
   - Tempo médio em cada etapa

5. **Atividades por Responsável**
   - Distribuição de atividades
   - Taxa de conclusão
   - Tempo médio

6. **Custos de Viagens**
   - Total por período
   - Por cliente
   - Por tipo de custo

#### 3.10.2 Construtor de Relatórios

**Funcionalidade Premium:**
- Crie relatórios personalizados
- Escolha campos, filtros, agrupamentos
- Configure gráficos
- Salve como template
- Agende envio automático

---

## 4. MÓDULO DE COMPRAS

### 4.1 Dashboard de Compras

**Métricas principais:**
- Total de Fornecedores
- Pedidos em Aberto
- Valor Total em Compras
- Cotações Pendentes
- Itens com Estoque Baixo

### 4.2 Gestão de Fornecedores

#### 4.2.1 Cadastro de Fornecedor

**Campos:**
- Razão Social
- CNPJ
- Contato
- Email
- Telefone
- Endereço
- Observações

**Funcionalidades:**
- Avaliação de fornecedor
- Histórico de compras
- Documentos anexados
- Status (Ativo, Inativo)

### 4.3 Cotações

#### 4.3.1 Criar Cotação

**Passo a passo:**
1. Selecione Fornecedor
2. Adicione Itens
3. Defina Prazo de Validade
4. Envie para Fornecedor
5. Acompanhe Respostas

**Comparação:**
- Compare cotações de múltiplos fornecedores
- Veja diferença de preços
- Analise prazos de entrega
- Escolha melhor opção

### 4.4 Pedidos de Compra

#### 4.4.1 Criar Pedido

**Campos:**
- Fornecedor
- Itens (produto, quantidade, valor)
- Data Prevista de Entrega
- Forma de Pagamento
- Observações

**Status:**
- Rascunho
- Enviado
- Confirmado
- Em Trânsito
- Recebido
- Cancelado

#### 4.4.2 Recebimento de Mercadorias

**Como receber:**
1. Localize o pedido
2. Clique em "Receber"
3. Confirme quantidade recebida
4. Registre divergências (se houver)
5. Confirme recebimento

**Atualização automática:**
- Estoque atualizado automaticamente
- Notificação para financeiro (se houver conta a pagar)

---

## 5. MÓDULO FINANCEIRO

### 5.1 Dashboard Financeiro

**Métricas:**
- Saldo Atual
- Contas a Pagar (próximos 30 dias)
- Contas a Receber (próximos 30 dias)
- Fluxo de Caixa (entradas - saídas)
- Receita do Mês
- Despesas do Mês

**Gráficos:**
- Fluxo de Caixa (linha)
- Contas por Categoria (pizza)
- Projeção de Caixa (área)

### 5.2 Contas a Pagar

#### 5.2.1 Cadastro de Conta a Pagar

**Campos:**
- Fornecedor
- Descrição
- Valor
- Data de Vencimento
- Categoria
- Forma de Pagamento
- Status (Pendente, Paga, Vencida)

**Funcionalidades:**
- Parcelamento automático
- Lembrete de vencimento
- Anexar comprovante de pagamento
- Histórico de pagamentos

#### 5.2.2 Pagamento de Conta

**Como pagar:**
1. Localize a conta
2. Clique em "Pagar"
3. Informe data de pagamento
4. Anexe comprovante (opcional)
5. Confirme

### 5.3 Contas a Receber

#### 5.3.1 Cadastro de Conta a Receber

**Campos:**
- Cliente
- Descrição
- Valor
- Data de Vencimento
- Forma de Recebimento
- Status (A Receber, Recebida, Vencida)

**Funcionalidades:**
- Parcelamento
- Baixa automática (quando proposta é aprovada)
- Conciliação bancária
- Histórico de recebimentos

#### 5.3.2 Recebimento

**Como receber:**
1. Localize a conta
2. Clique em "Receber"
3. Informe data de recebimento
4. Confirme valor recebido
5. Anexe comprovante

### 5.4 Fluxo de Caixa

#### 5.4.1 Visualização

**Períodos:**
- Hoje
- Esta Semana
- Este Mês
- Este Ano
- Personalizado

**Informações:**
- Entradas (receitas)
- Saídas (despesas)
- Saldo (entradas - saídas)
- Projeção futura

#### 5.4.2 Projeção

**Como funciona:**
- Baseado em contas a pagar/receber
- Considera histórico
- Mostra projeção para próximos meses
- Alertas de saldo negativo

### 5.5 Bancos

#### 5.5.1 Cadastro de Banco

**Campos:**
- Nome da Conta
- Banco
- Agência
- Conta
- Saldo Inicial
- Tipo (Corrente, Poupança, Investimento)

**Funcionalidades:**
- Múltiplas contas
- Conciliação bancária
- Extrato
- Transferências entre contas

---

## 6. MÓDULO OPERACIONAL/FÁBRICA

### 6.1 Dashboard MES (Manufacturing Execution System)

**Métricas:**
- Ordens de Fabricação Ativas
- Eficiência Geral (OEE)
- Produção do Dia
- Tempo Médio de Fabricação
- Colaboradores Ativos

**Gráficos:**
- Produção por Período
- OEE por Equipamento
- Tempo de Parada
- Qualidade (índice de refugo)

### 6.2 Ordens de Serviço Operacionais

#### 6.2.1 Criar OS Operacional

**Campos:**
- Número da OS (gerado automaticamente)
- Tipo (Fabricação, Manutenção, Montagem)
- Prioridade (Baixa, Média, Alta, Urgente)
- Cliente/Projeto
- Descrição
- Data Prevista
- Responsável

**Itens da OS:**
- Produto a Fabricar
- Quantidade
- Especificações Técnicas
- Materiais Necessários
- Tempo Estimado

#### 6.2.2 Acompanhamento de OS

**Status:**
- Aberta
- Em Planejamento
- Em Fabricação
- Em Montagem
- Em Teste
- Concluída
- Cancelada

**Funcionalidades:**
- Registrar etapas
- Adicionar fotos
- Registrar problemas
- Atualizar progresso
- Gerar relatório

### 6.3 Colaboradores

#### 6.3.1 Cadastro de Colaborador

**Campos:**
- Nome Completo
- CPF
- Matrícula
- Cargo
- Setor
- Data de Admissão
- Salário Base
- Tipo de Contrato (CLT, PJ, Estagiário)
- Status (Ativo, Inativo, Férias, Licença)

**Funcionalidades:**
- Histórico de atividades
- Horas trabalhadas
- Avaliações
- Documentos anexados

### 6.4 Atividades de Colaboradores

#### 6.4.1 Registrar Atividade

**Tipos:**
- Fabricação
- Montagem
- Teste
- Manutenção
- Outros

**Campos:**
- Colaborador
- OS relacionada
- Tipo de Atividade
- Início
- Término
- Descrição
- Produtos/Peças utilizadas

**Funcionalidades:**
- Cálculo automático de horas
- Vinculação a OS
- Cálculo de custo (horas × valor/hora)
- Relatórios de produtividade

### 6.5 Controle de Presença

#### 6.5.1 Registro de Ponto

**Formas de registro:**
- Manual (pelo supervisor)
- Biométrico (se integrado)
- Por aplicativo (se disponível)

**Funcionalidades:**
- Entrada/Saída
- Intervalo
- Horas extras
- Atrasos
- Faltas
- Justificativas

#### 6.5.2 Relatórios de Presença

**Relatórios disponíveis:**
- Presença por Colaborador
- Horas Trabalhadas
- Horas Extras
- Faltas e Atrasos
- Banco de Horas

### 6.6 Horas Extras

#### 6.6.1 Cadastro de Hora Extra

**Campos:**
- Colaborador
- Data
- Hora de Início
- Hora de Término
- Motivo
- Aprovação (se necessário)

**Cálculos automáticos:**
- Horas normais
- Horas extras (50%)
- Horas extras domingo/feriado (100%)
- Valor total

### 6.7 Equipamentos

#### 6.7.1 Cadastro de Equipamento

**Campos:**
- Código
- Nome/Descrição
- Tipo
- Fabricante
- Modelo
- Número de Série
- Data de Aquisição
- Status (Operacional, Manutenção, Parado)

**Funcionalidades:**
- Histórico de manutenções
- OEE (Overall Equipment Effectiveness)
- Tempo de parada
- Custos de manutenção

#### 6.7.2 Manutenção Preventiva

**Como configurar:**
1. Selecione o Equipamento
2. Defina Tipo de Manutenção
3. Configure Periodicidade
4. Defina Checklist
5. Salve

**Alertas:**
- Sistema avisa quando manutenção está próxima
- Gera OS de manutenção automaticamente

---

## 7. MÓDULO ADMINISTRATIVO

### 7.1 Gestão de Usuários

#### 7.1.1 Lista de Usuários

**Informações:**
- Nome
- Email
- Cargo
- Role (Admin, Usuário, Visualizador)
- Status (Ativo, Inativo)
- Último Acesso

**Ações:**
- Criar Novo Usuário
- Editar
- Desativar/Ativar
- Redefinir Senha
- Ver Logs

#### 7.1.2 Criar Usuário

**Campos obrigatórios:**
- Nome
- Email
- Senha
- Cargo
- Role

**Roles disponíveis:**
- **Admin** - Acesso total ao sistema
- **Usuário** - Acesso aos módulos conforme permissões
- **Visualizador** - Apenas leitura

**Funcionalidades:**
- Envio de email com credenciais (se configurado)
- Ativação/Desativação
- Vinculação a Grupos de Permissões

### 7.2 Permissões

#### 7.2.1 Grupos de Permissões

**Como funciona:**
- Crie grupos (ex: "Vendedores", "Gerentes", "Operacional")
- Defina permissões por grupo
- Vincule usuários aos grupos

**Permissões disponíveis:**
- Por Módulo (Comercial, Compras, Financeiro, Operacional)
- Por Funcionalidade (Criar, Editar, Excluir, Visualizar)
- Por Dados (Próprios, Equipe, Todos)

#### 7.2.2 Configurar Permissões

**Passo a passo:**
1. Acesse "Permissões"
2. Clique em "Novo Grupo"
3. Defina nome e descrição
4. Marque as permissões desejadas
5. Salve
6. Vincule usuários ao grupo

**Permissões granulares:**
- Clientes: Criar, Editar, Excluir, Visualizar
- Propostas: Criar, Editar, Excluir, Visualizar, Aprovar
- Financeiro: Criar, Editar, Excluir, Visualizar
- E assim por diante...

### 7.3 Configurações

#### 7.3.1 Configurações Gerais

**Categorias:**
- **Empresa:**
  - Nome
  - CNPJ
  - Endereço
  - Contatos
  - Logo

- **Sistema:**
  - Idioma
  - Fuso Horário
  - Formato de Data
  - Formato de Moeda
  - Tema (Claro/Escuro)

- **Email:**
  - SMTP Server
  - Porta
  - Usuário
  - Senha
  - Assinatura padrão

- **Integrações:**
  - APIs externas
  - Webhooks
  - Sincronizações

#### 7.3.2 Configurações de Proposta

**Opções:**
- Numeração automática
- Template padrão
- Validade padrão
- Aprovação obrigatória
- Notificações

### 7.4 Logs e Auditoria

#### 7.4.1 Logs do Sistema

**Tipos de logs:**
- Acesso (login/logout)
- Criação de registros
- Edição de registros
- Exclusão de registros
- Alterações de permissões
- Erros do sistema

**Filtros:**
- Por usuário
- Por data
- Por tipo de ação
- Por módulo

**Funcionalidades:**
- Exportar logs
- Buscar por termo
- Visualizar detalhes

### 7.5 Backup e Restauração

#### 7.5.1 Backup Manual

**Como fazer:**
1. Acesse "Admin" → "Backup"
2. Clique em "Gerar Backup"
3. Aguarde processamento
4. Download do arquivo

**O que é incluído:**
- Banco de dados completo
- Arquivos anexados
- Configurações

#### 7.5.2 Backup Automático

**Configuração:**
- Frequência (Diário, Semanal, Mensal)
- Horário
- Retenção (quantos backups manter)
- Local de armazenamento

#### 7.5.3 Restauração

**⚠️ ATENÇÃO:** Restauração apaga dados atuais!

**Como restaurar:**
1. Acesse "Admin" → "Backup"
2. Clique em "Restaurar"
3. Selecione o arquivo de backup
4. Confirme a restauração
5. Aguarde processamento

---

## 8. FUNCIONALIDADES TRANSVERSAIS

### 8.1 Busca Global

**Como usar:**
- Clique na lupa no topo
- Digite o termo de busca
- O sistema busca em:
  - Clientes
  - Propostas
  - Projetos
  - Produtos
  - Oportunidades
  - Atividades

**Resultados:**
- Agrupados por tipo
- Com preview das informações
- Link direto para o registro

### 8.2 Notificações

**Tipos de notificações:**
- Novas propostas para aprovar
- Lembretes de atividades
- Contas próximas do vencimento
- Atualizações de status
- Mensagens de outros usuários

**Como visualizar:**
- Ícone de sino no topo
- Badge com quantidade
- Lista de notificações
- Marcar como lida
- Configurar preferências

### 8.3 Calendário

**Funcionalidades:**
- Visualização mensal/semanal/diária
- Atividades de todos os módulos
- Filtros por tipo, responsável, cliente
- Criação rápida de atividades
- Sincronização (se configurado)

### 8.4 Mapa Interativo

**Onde usar:**
- Visualizar clientes
- Visualizar máquinas vendidas
- Otimizar rotas de visita
- Análise geográfica

**Funcionalidades:**
- Marcadores por localização
- Agrupamento por região
- Cálculo de rotas
- Medição de distâncias

### 8.5 Exportação de Dados

**Formatos disponíveis:**
- Excel (.xlsx)
- PDF
- CSV
- JSON (para integrações)

**O que pode exportar:**
- Listas completas
- Relatórios
- Gráficos (como imagem)
- Dados filtrados

### 8.6 Importação de Dados

**Formatos suportados:**
- Excel (.xlsx)
- CSV

**O que pode importar:**
- Clientes (em massa)
- Produtos
- Fornecedores
- Contas a Pagar/Receber

**Como importar:**
1. Prepare o arquivo no formato correto
2. Acesse a funcionalidade de importação
3. Selecione o arquivo
4. Mapeie as colunas
5. Revise os dados
6. Confirme a importação

### 8.7 Ajuda e Suporte

#### 8.7.1 Guia de Ajuda

**Como acessar:**
- Menu "Ajuda" → "Guia"
- Ou pressione F1
- Ou ícone de interrogação

**Conteúdo:**
- Tutoriais por módulo
- FAQ (Perguntas Frequentes)
- Vídeos (se disponíveis)
- Dicas e truques

#### 8.7.2 Busca de Ajuda

**Como usar:**
- Digite sua dúvida
- Sistema busca em toda a documentação
- Mostra resultados relevantes
- Links diretos para tutoriais

#### 8.7.3 Feedback

**Como enviar:**
- Menu "Ajuda" → "Feedback"
- Descreva sugestão/problema
- Anexe screenshots (opcional)
- Envie

---

## 9. DICAS E BOAS PRÁTICAS

### 9.1 Organização de Dados

**Clientes:**
- Mantenha informações sempre atualizadas
- Use segmentos para facilitar filtros
- Adicione observações importantes
- Anexe documentos relevantes

**Propostas:**
- Use templates padronizados
- Mantenha histórico de versões
- Documente negociações
- Defina prazos de validade realistas

**Atividades:**
- Crie atividades para tudo importante
- Use lembretes para não esquecer
- Vincule atividades a clientes/propostas
- Registre resultados após atividades

### 9.2 Produtividade

**Atalhos de Teclado:**
- `Ctrl + K` - Busca global
- `Ctrl + N` - Novo registro (contextual)
- `Esc` - Fechar modal
- `Enter` - Confirmar ação
- `Ctrl + S` - Salvar (em formulários)

**Filtros Salvos:**
- Configure filtros frequentes
- Salve como favoritos
- Compartilhe com equipe

**Templates:**
- Crie templates para propostas comuns
- Use modelos de email
- Padronize descrições

### 9.3 Colaboração

**Compartilhamento:**
- Compartilhe propostas por email
- Adicione comentários em registros
- Use @mencionar para notificar usuários
- Vincule atividades entre equipes

**Comunicação:**
- Use o sistema de mensagens
- Deixe observações claras
- Documente decisões importantes
- Mantenha histórico atualizado

### 9.4 Segurança

**Senhas:**
- Use senhas fortes
- Não compartilhe credenciais
- Altere senha periodicamente
- Use autenticação de dois fatores (se disponível)

**Permissões:**
- Dê apenas permissões necessárias
- Revise permissões periodicamente
- Desative usuários que saíram
- Monitore logs de acesso

**Backup:**
- Configure backup automático
- Teste restauração periodicamente
- Mantenha backups em local seguro
- Documente procedimentos

### 9.5 Relatórios e Análises

**Dashboards:**
- Personalize dashboards conforme necessidade
- Configure alertas importantes
- Monitore métricas chave
- Compare períodos

**Relatórios:**
- Exporte relatórios regularmente
- Crie relatórios personalizados
- Agende envio automático
- Compartilhe com equipe

---

## 10. TROUBLESHOOTING

### 10.1 Problemas Comuns

#### Não consigo fazer login
**Soluções:**
- Verifique se email e senha estão corretos
- Verifique se Caps Lock está desativado
- Limpe cache do navegador
- Tente em outro navegador
- Contate administrador para redefinir senha

#### Página não carrega
**Soluções:**
- Verifique conexão com internet
- Recarregue a página (F5)
- Limpe cache do navegador
- Verifique se o servidor está online
- Contate suporte técnico

#### Dados não salvam
**Soluções:**
- Verifique se preencheu campos obrigatórios
- Verifique permissões
- Tente salvar novamente
- Verifique logs do navegador (F12)
- Contate suporte

#### Gráficos não aparecem
**Soluções:**
- Verifique se há dados no período
- Tente outro período
- Recarregue a página
- Limpe cache
- Verifique permissões de visualização

#### PDF não gera
**Soluções:**
- Verifique se há dados na proposta
- Tente em outro navegador
- Verifique permissões
- Contate suporte

### 10.2 Contato com Suporte

**Canais:**
- Email: suporte@gmp.ind.br
- Telefone: (verifique com administrador)
- Chat: (se disponível no sistema)
- Ticket: Sistema de tickets (se disponível)

**Ao contatar suporte, informe:**
- Descrição do problema
- Passos para reproduzir
- Screenshots (se possível)
- Navegador e versão
- Usuário afetado
- Data e hora do problema

---

## 📝 GLOSSÁRIO

- **CRM:** Customer Relationship Management (Gestão de Relacionamento com Cliente)
- **OS:** Ordem de Serviço
- **OEE:** Overall Equipment Effectiveness (Eficiência Geral de Equipamentos)
- **MES:** Manufacturing Execution System (Sistema de Execução de Manufatura)
- **Turn Key:** Projeto completo, "chave na mão"
- **Pipeline:** Funil de vendas, etapas do processo comercial
- **WYSIWYG:** What You See Is What You Get (editor visual)
- **JWT:** JSON Web Token (token de autenticação)
- **SQLite:** Banco de dados relacional leve

---

## 🎓 CONCLUSÃO

Este guia cobre todas as funcionalidades principais do sistema CRM GMP INDUSTRIAIS. Use este documento como base para:

- Criar apresentações de treinamento
- Desenvolver tutoriais em vídeo
- Elaborar manuais de usuário
- Criar materiais de onboarding
- Desenvolver cursos online

**Lembre-se:** O sistema está em constante evolução. Sempre consulte a documentação mais recente e as atualizações do sistema.

---

**Versão do Documento:** 1.0  
**Data de Criação:** 2025  
**Última Atualização:** 2025  
**Autor:** Sistema CRM GMP INDUSTRIAIS

---

## 📞 SUPORTE

Para dúvidas, sugestões ou problemas, entre em contato com a equipe de suporte.

**Email:** suporte@gmp.ind.br  
**Sistema:** Acesse "Ajuda" → "Suporte" no menu

---

**FIM DO GUIA DE TREINAMENTO**
