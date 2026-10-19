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

**Credenciais de acesso:** Consulte o administrador do sistema para credenciais de acesso.

**⚠️ IMPORTANTE:** Após o primeiro login, altere a senha!

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

**Ao salvar uma edição:**
- O sistema grava os campos do formulário como estão: o campo que você apagou fica vazio; tirar a logo (o botão de remover) apaga a logo.
- A **Razão Social** não pode ficar vazia nem só com espaços: o sistema recusa com *"Razão social é obrigatória"* e não grava nada.
- Pela integração (API), a edição pode trazer só alguns campos: os que não vierem ficam como estavam; os que vierem vazios são apagados.

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

**Quem pode usar as propostas.** As propostas — lista, criação, edição, preview editável, fotos, cláusulas, PDF, envio, aceite, cópia,
lembretes —, os pedidos de aprovação de desconto, o template de proposta (veja 3.3.4), o cadastro de família de produto, os grupos de produto, os produtos e as variáveis técnicas (veja 3.3.4) e as listas de preço ficam no módulo **Comercial**, e o sistema confere o acesso em **cada operação**,
inclusive quando ela chega pela integração, com a mesma regra que decide se o Comercial aparece na tela:

- o administrador do sistema e o super administrador entram sempre;
- quem tem alguma permissão de módulo (dada diretamente ao usuário ou por um grupo **ativo**) entra só se uma delas for a do Comercial;
- quem não tem permissão nenhuma entra no Comercial;
- ser administrador de um módulo não basta — vale a permissão do módulo (as exceções são o template de proposta, as opções por família e as variáveis técnicas, veja 3.3.4).

Quem não pode recebe *"Acesso negado ao módulo"*, e a tentativa fica registrada em **Administração → Logs**. Os arquivos enviados para a
proposta (fotos, cotação, PDF anexo) são recusados antes de chegar ao servidor. **Exceção:** a ordem de serviço do Operacional busca os
itens na proposta de origem — por isso quem tem o **Operacional** consegue abrir uma proposta para leitura (só a leitura de uma proposta;
o resto continua exigindo o Comercial). **Para tirar o acesso de alguém de fato, desative o usuário**: retirar a última permissão de uma
pessoa a deixa sem permissão nenhuma — e quem não tem permissão nenhuma entra no Comercial.

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
- **Duplicar Proposta (Clonar):** Crie uma nova baseada em uma existente. A cópia nasce como rascunho, com número próprio, o título
  começando por "[Cópia]" e todos os itens da original (com a descrição da tabela e os acessórios); o formulário da cópia só abre
  depois de todos os itens copiados. Os campos manuais preenchidos no preview e as customizações do documento **não** vão para a cópia.
  Se o banco não aceitar um item, nenhuma cópia nasce e aparece *"Erro ao gravar os itens da proposta (<o erro do banco>). Nenhuma
  proposta foi criada — tente de novo."*.
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

**Ao salvar a edição — o que o sistema grava:**
- Os campos do formulário como estão: o que você apagou fica vazio (inclusive o **Tipo** "—" e a **Data de fechamento** em branco).
- Os campos que o formulário **não mostra** — o projeto, o contato, o telefone e o e-mail próprios da proposta, o idioma, a moeda, o
  incoterm e a unidade de negócio (que chegam pela cópia de uma proposta, pela geração automática ou pela integração) — ficam como estavam.
  A exceção: **trocar o cliente** apaga o contato, o telefone, o e-mail e o projeto próprios da proposta, porque eram do cliente anterior —
  a capa passa a mostrar os do cadastro do cliente novo.
- As variáveis manuais preenchidas no preview continuam ligadas aos itens depois do salvamento — também quando a proposta tem o **mesmo
  produto mais de uma vez**: o formulário diz ao sistema qual item gravado é cada linha, e cada item fica com as suas variáveis manuais e
  com os seus campos que o formulário não mostra (a descrição digitada na tabela de preços, a tag, os acessórios, o prazo individual, o
  descritivo). Tirar um de dois itens iguais deixa no que ficou o que é dele.
- As variáveis manuais do item **tirado** da proposta ficam guardadas, mas não aparecem mais no documento e não passam para outro item —
  nem para o mesmo produto incluído de novo depois, que abre com os campos manuais em branco para o vendedor preencher. Já a descrição da
  tabela, a tag e o descritivo de um produto incluído de novo (ou incluído uma segunda vez) vêm do último item gravado desse produto.
- Se uma variável manual ficou sem item (um salvamento antigo que não a religou), o preview e o PDF a mostram no item do mesmo produto que
  ainda não tem nenhuma variável preenchida — todas as de um item juntas, nunca duas para o mesmo campo; o próximo salvamento (da proposta
  ou do preview) grava essa ligação. Pela integração, sem o número interno de cada item, o sistema reconhece os itens iguais pela ordem em
  que aparecem.
- A **revisão** (o `REVnn` no fim do número) sobe só quando os itens ou o valor total mudam, e só entra no histórico de revisões quando o
  salvamento deu certo.
- **Os itens são gravados primeiro.** Ao salvar, o sistema grava os itens da edição antes de qualquer outra coisa e só tira os itens
  antigos depois que a proposta foi salva. Se o banco não aceitar um item, **nada da edição é gravado** — nem os dados da proposta, nem o
  número, nem a revisão, nem os itens — e aparece *"Erro ao gravar os itens da proposta (<o erro do banco>). Nada foi alterado — tente
  salvar de novo."*. Dois casos raros, quando o banco falha duas vezes seguidas: *"Erro ao gravar os itens da proposta (<o erro>). Os
  outros dados da proposta foram salvos, mas os itens continuam os de antes — confira e salve de novo."* e *"Erro ao gravar os itens da
  proposta (<o erro>). A proposta <número> ficou com itens repetidos — recarregue, confira os itens e salve de novo."*. Numa proposta
  com milhares de itens, quem a abrir no instante do salvamento pode ver os itens duas vezes por alguns segundos; e dois salvamentos da
  mesma proposta exatamente ao mesmo tempo (duas abas, duas pessoas) podem deixar os itens dos dois, repetidos — apague o que sobrou e salve. As outras recusas do
  salvamento (o número já usado por outra proposta, a proposta alterada por outra gravação no mesmo instante) mantêm a frase de sempre, e
  os itens da edição que já tinham sido gravados são retirados antes.
- O título não pode ficar vazio: *"Título é obrigatório"*. Proposta perdida/rejeitada exige o motivo: *"Motivo da não venda é obrigatório
  quando a proposta está perdida/rejeitada."*. Desconto acima de 5% sem aprovação não sai do rascunho: *"Não é possível alterar o status de
  uma proposta com desconto acima de 5% sem aprovação prévia. A proposta deve permanecer como rascunho até que a autorização seja aprovada."*
- Proposta aprovada ou rejeitada sem data de fechamento recebe a data do dia.
- Pela integração (API), a edição pode trazer só alguns campos: os que não vierem ficam como estavam; os que vierem vazios são apagados; sem
  a lista de itens, os itens não mudam. Se duas gravações da mesma proposta chegam ao mesmo tempo e uma delas muda o status, a margem, o motivo
  ou a data de fechamento, a outra — se dependia desses valores — é recusada com *"A proposta foi alterada por outra gravação no mesmo
  instante. Recarregue a proposta e salve de novo."* e nada dela é gravado.
- A **margem de desconto** é um número de 0 a 100 (o formulário só aceita isso). Pela integração (API), na criação, na edição, na geração
  automática e no pedido de aprovação de desconto, vazio vale 0 e o número pode vir como texto com ponto (`10.5`); vírgula, letras, negativo
  ou acima de 100 são recusados com *"Margem de desconto inválida: informe um número de 0 a 100, com ponto como separador decimal."* e nada
  é gravado. Uma margem gravada que o sistema não consegue ler como número conta como acima de 5% na hora de enviar (pede aprovação).
- A **geração automática** de proposta segue a mesma regra do desconto da criação: margem acima de 5% com um status que não seja rascunho é
  recusada com *"Não é possível salvar uma proposta com desconto acima de 5% sem aprovação prévia. A proposta deve ser salva como rascunho até
  que a autorização seja aprovada."*; sem status, a proposta nasce rascunho. Exatamente 5% não precisa de aprovação.
- Na **geração automática** (pela integração — não há botão para ela nas telas), cada produto pedido tem de trazer o número (id) de um
  produto do cadastro: um número inteiro maior que zero, que também pode vir escrito como texto (`"5"`). Faltando o número, ou com zero,
  negativo, número quebrado ou algo que não é número, a geração é recusada com *"Produto inválido: cada produto da proposta deve trazer o id
  de um produto cadastrado."*. Se algum número não for de produto cadastrado, é recusada com *"Produto não encontrado (id 99999).
  Atualize a lista de produtos e tente de novo."* — com os números que faltam, sem repetir, na ordem em que vieram (com mais de dez, os dez
  primeiros e "e mais N"). Em nenhuma das duas recusas a proposta é criada. Produto inativo conta como cadastrado; o mesmo produto pedido
  duas vezes vira dois itens. A ordem das conferências: cliente e produtos informados → cada produto um registro → margem → desconto acima
  de 5% fora do rascunho → o número de cada produto → produto cadastrado → cliente válido → cliente cadastrado.
- Na **criação de proposta** e na **geração automática**, o cliente tem de estar cadastrado (ativo ou inativo): senão a proposta é recusada
  com *"Cliente não encontrado (id 99999). Atualize a lista de clientes e tente de novo."* e nada é criado — nem o número da proposta é
  gasto. Na criação, essa conferência vem depois das do título, da margem, dos itens, do motivo, do cliente informado, do responsável e do
  desconto acima de 5%.
- Na **edição**, trocar o cliente por um que não está cadastrado é recusado com a mesma frase e nada é gravado; a conferência vem depois
  das do título, da margem, dos itens, do motivo e do desconto acima de 5%, e só acontece quando o cliente muda. Pela integração, enviar o
  cliente vazio (ou algo que não é número) deixa a proposta sem cliente.
- Na **criação de proposta** e na **geração automática**, todos os itens são gravados antes de a resposta chegar. Se o banco falhar ao gravar um item, nada fica — nem a
  proposta, nem os itens já gravados — e a resposta é *"Erro ao gravar os itens da proposta (<o erro do banco>). Nenhuma proposta foi
  criada — tente de novo."*; se até a limpeza falhar, *"Erro ao gravar os itens da proposta (<o erro do banco>). A proposta <número> ficou
  incompleta — exclua-a e gere de novo."*. Com dezenas de milhares de itens a resposta demora alguns segundos.
- Pela integração (API), a lista de itens da criação, da edição e os produtos da geração automática precisam ser uma **lista de itens**, e
  cada item um registro com os seus campos. Uma lista com um item vazio, um número ou um texto no lugar do item — ou com um item em que algum
  campo, fora a lista de acessórios, não é texto nem número — é recusada com *"Item inválido: cada item da proposta deve ser um objeto."*;
  os itens enviados como outra coisa que não uma lista são recusados com *"Itens inválidos: os itens da proposta devem ser enviados como
  uma lista."*. Nos dois casos nada é gravado — nem a proposta, nem a revisão, nem os itens. A lista vazia (ou os itens enviados como nulos
  na edição) apaga os itens, como sempre.
- O **histórico de edições** (no preview editável, botão **Histórico**) registra, a cada salvamento, cada item incluído, removido ou
  editado — com o que mudou (descrição, quantidade, unidade, valor unitário, total, família, região), antes e depois. Com o mesmo
  produto mais de uma vez, ele segue o mesmo reconhecimento do salvamento: tirar o primeiro de dois itens iguais aparece como **um item removido**, e editar o segundo aparece como edição do segundo.
  Trocar a descrição de um item manual (sem código de produto) aparece como edição da descrição. Uma diferença só de maiúsculas, minúsculas
  ou espaços nas pontas da descrição não conta como edição.
- No documento (preview, PDF) e no total do pedido de aprovação de desconto, cada item da proposta usa **no máximo um** produto do cadastro:
  o de código igual ao do item; se não houver, o de mesmo código ignorando espaços nas pontas (o mais antigo, se houver mais de um). Um item
  sem código de produto (item manual) não usa produto nenhum do cadastro — sai com o próprio texto.

**Desconto acima de 5% — a aprovação:**
- Salvar uma proposta com desconto acima de 5% a deixa como **Rascunho** e cria sozinho um pedido de aprovação em **Comercial → Aprovações**,
  em nome de quem salvou (*"Proposta salva. Solicitação de aprovação de desconto enviada."*). O pedido nasce sempre **pendente**.
- **Quem decide:** um usuário com **Pode aprovar descontos** marcado no cadastro (**Admin → Usuários**) ou um super administrador. Não
  decidem o pedido — nem o super — **quem o pediu**, **o responsável** pela proposta e **quem a criou**. A tela de Aprovações só mostra
  Aprovar e Rejeitar a quem pode decidir aquele pedido; para os outros mostra *"Aguardando a decisão de quem pode aprovar descontos. Quem
  pediu e o responsável da proposta não decidem o pedido."* Pela integração, quem não tem a permissão recebe *"Você não tem permissão para
  aprovar descontos. Peça a um usuário com "Pode aprovar descontos"."* e o dono recebe *"Quem pediu a aprovação do desconto, o responsável e
  quem criou a proposta não podem decidi-la. Peça a outro aprovador."*
- Se ninguém além dos donos pode aprovar, o pedido não é criado: *"Ninguém além de quem pede, do responsável e de quem criou a proposta pode
  aprovar este desconto. Configure outro usuário com "Pode aprovar descontos" na gestão de usuários."* O aviso do pedido vai para um
  aprovador que não é dono.
- Só se decide pedido **pendente** (*"Esta solicitação de aprovação já foi decidida. Recarregue a lista."*), e só se aprova enquanto a
  proposta está em Rascunho ou com Desconto aprovado (*"A proposta desta solicitação não está mais em rascunho nem com desconto aprovado.
  Rejeite a solicitação ou volte a proposta para rascunho."*). Aprovar põe a proposta em **Desconto aprovado** com o percentual do pedido.
- O status **Desconto aprovado** só é dado pela aprovação: no formulário ele aparece desabilitado, a não ser na proposta que já está nele.
  Pela integração: *"O status "Desconto aprovado" só é dado pela aprovação do desconto, em Comercial → Aprovações. Se a proposta estava com
  desconto aprovado, ela mudou depois de aberta: recarregue-a."*
- Numa proposta com Desconto aprovado, o desconto acima de 5% tem de ser o aprovado: *"O desconto acima de 5% desta proposta não é o que foi
  aprovado. Para mudar o desconto, salve a proposta como rascunho e peça nova aprovação."* Aplicar um desconto acima de 5% pelo botão de
  desconto do formulário já volta a proposta para Rascunho, e o salvamento cria um pedido novo. Baixar para 5% ou menos não pede nada.
- **Enviar proposta** (e a assinatura) confere o desconto: acima de 5% só sai com uma aprovação **aprovada** do mesmo percentual, decidida por
  alguém que não é quem a pediu — *"Não é possível enviar uma proposta com desconto acima de 5% sem a aprovação desse desconto. Peça a
  aprovação em Comercial → Aprovações."* A aprovação vale pelo percentual: trocar os itens ou o valor depois, ou abrir uma nova revisão, não
  a derruba. Se a proposta mudou entre a conferência e a gravação: *"A proposta foi alterada por outra gravação no mesmo instante. Recarregue
  a proposta e salve de novo."*
- **O documento da proposta** (o "Ver proposta", o PDF e o editor do preview) segue a mesma regra, em qualquer status: com desconto acima de
  5%, só sai com uma aprovação aprovada do mesmo percentual, decidida por alguém que não é quem a pediu. Senão aparece *"Não é possível gerar
  o documento (visualização ou PDF) de uma proposta com desconto acima de 5% sem a aprovação desse desconto. Peça a aprovação em Comercial →
  Aprovações; se a proposta já saiu do rascunho, volte-a para rascunho (Nova revisão, ou o status Rascunho no formulário) e salve-a para
  pedir a aprovação."* e nada é gerado — vale também para o editor do preview que já estava aberto quando o desconto foi trocado noutra tela.
  Até 5% o documento sai sempre (pela tela, os botões do documento aparecem depois do envio).
- O pedido de aprovação mostra ao aprovador o **valor total**, o **desconto em reais** e o **valor com desconto** calculados como o
  documento os calcula — a soma dos itens (quantidade × valor unitário, ou o preço base do produto quando o item não tem valor; quantidade
  vazia ou zero conta 1), mais os acessórios; sem itens, o valor total da proposta —, com o desconto arredondado a centavos e o valor com
  desconto igual ao total menos o desconto.
- Em **Comercial → Aprovações → Nova Solicitação**, a lista traz as propostas em Rascunho com desconto acima de 5% que ainda não têm uma
  aprovação válida desse percentual (uma aprovação decidida pela própria pessoa que pediu não conta).
- Enquanto houver pedido de desconto pendente, o responsável pela proposta não pode ser trocado: *"Não é possível trocar o responsável de
  uma proposta com pedido de aprovação de desconto pendente. Aguarde a decisão ou peça que o pedido seja rejeitado."*

**Salvar no preview editável:**
- O botão de salvar grava as cláusulas, os campos manuais de cada item (variáveis preenchidas na proposta e a descrição na tabela de preços)
  e os campos da capa. Se a proposta foi salva em outra aba ou por outra pessoa depois que o preview abriu, os itens dela mudaram e os campos
  manuais dos itens desta aba **não são gravados**: em vez de *"Alterações salvas."* aparece o aviso *"Alguns campos dos itens não foram
  gravados: os itens desta proposta mudaram depois que o preview abriu (ela foi salva em outra aba ou por outra pessoa). O preview foi
  recarregado — confira e preencha de novo."*, e o preview se recarrega com o que está gravado. As cláusulas e os campos da capa do mesmo
  salvamento são gravados normalmente.
- **Emitir revisão** com alterações pendentes salva antes; se aparecer esse aviso, a revisão **não** é emitida — confira, preencha de novo e
  emita outra vez.
- Quando o salvamento é recusado, o aviso vermelho mostra o motivo dado pelo sistema (sem conexão, aparece *"Erro ao salvar alterações."*);
  as alterações continuam na tela para salvar de novo, e nada do que vinha depois naquele salvamento (campos manuais dos itens, descrições,
  campos da capa) é gravado até lá.
- Copiar ou reordenar as cláusulas de uma proposta que não existe mais é recusado com *"Proposta não encontrada"* (uma proposta excluída
  pela lista continua existindo como inativa e segue normalmente).
- Na primeira vez que as cláusulas de uma proposta são alteradas, o sistema copia para ela as cláusulas do modelo de contrato da família dos
  itens (havendo equipamento, o de equipamento; sem modelo próprio, o modelo padrão). A cópia é **inteira ou nada**: se o banco recusar
  uma cláusula, nenhuma fica e aparece *"Erro ao copiar as cláusulas da proposta (<o erro do banco>). Nenhuma cláusula foi gravada — salve
  de novo."* — o mesmo vale quando o sistema não consegue ler o modelo de contrato. Se nem a limpeza for possível, a frase termina em *"A
  proposta ficou com parte das cláusulas — use Resetar cláusulas e salve de novo."*: use o botão **Resetar cláusulas** antes de salvar de
  novo (ele volta as cláusulas ao padrão, descartando as edições delas).
- A **ordem** das cláusulas também é gravada inteira ou não é: se o banco recusar uma linha, a ordem anterior volta e aparece *"Erro ao
  gravar a nova ordem das cláusulas (<o erro>). A ordem anterior foi mantida — salve de novo."*; se nem a volta der certo, *"… A ordem ficou
  misturada — confira as cláusulas antes de enviar a proposta e salve de novo."*; se não for possível ler a ordem atual, *"… A ordem não foi
  alterada — salve de novo."*. Com o banco momentaneamente ocupado, a tela tenta de novo sozinha antes de mostrar o aviso.
- Se as cláusulas da proposta já tinham sido gravadas por um salvamento anterior que não terminou (ou por outra aba) e o preview ainda
  mostrava as cláusulas do modelo, o salvamento **não mexe nas cláusulas**: grava o resto, mostra o aviso *"As cláusulas desta proposta já
  estavam gravadas (por um salvamento anterior que não terminou ou por outra aba) e as mudanças nelas não foram gravadas agora. O preview
  foi recarregado com o que está gravado — confira as cláusulas e faça as mudanças de novo."* e recarrega o preview; nesse caso o **Emitir
  revisão** não emite.

**Cláusulas no preview editável — onde cada uma aparece:**
- As condições gerais vão de 5.1 a 5.23; a **5.24** é a seção de preço (tabela de preços, condição de pagamento, FINAME e impostos); a
  **CONSIDERAÇÃO FINAL** fecha o documento, na página das assinaturas, qualquer que seja o número dela.
- A numeração das cláusulas pula o 24, que é da seção de preço: uma cláusula incluída depois da 5.23 recebe o número **5.25** (e a
  consideração final passa para 5.26). As cláusulas 5.25 em diante aparecem **depois da seção de preço e antes da página das assinaturas**,
  na ordem em que foram salvas — no preview e no PDF.
- **+ cláusula** na CONSIDERAÇÃO FINAL inclui a nova **antes** dela. Nada pode ficar depois da consideração final: descer a cláusula que está
  logo antes dela, ou subir a própria consideração final, não faz nada.
- Uma cláusula incluída e deixada em branco (sem texto e com o título "Nova Cláusula") não é gravada, e a numeração se refaz sem ela ao
  salvar.

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

**Quem pode configurar:** quem entra no **Comercial** (a mesma regra das propostas, acima) — por **Comercial → Propostas → Config.
template**, pelo editor visual ou por **Configurações → Comercial → Template de proposta** — e também o **administrador do módulo
Comercial** (marcado no cadastro do usuário) que tem acesso ao **Administrativo**, pela aba de Configurações. Os outros recebem *"Acesso
negado ao módulo"*, inclusive ao enviar logo, cabeçalho, rodapé, capa ou contrato (o arquivo é recusado antes de chegar ao servidor) e ao
baixar o contrato.

**O que o documento da proposta usa do template:** as margens de impressão e as variáveis técnicas por família. O documento usa os
logotipos e as imagens fixas da GMP: o logo, o cabeçalho, o rodapé e a capa enviados aqui ficam guardados, mas não aparecem no documento.

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

**O modelo de contrato da família.** No cadastro da família de produto (**Comercial → Produtos → um grupo → editar a família**) escolhe-se o
**modelo de contrato** — o conjunto de cláusulas que toda proposta nova dessa família recebe (sem escolha, vale o modelo padrão). Ver a lista
de modelos e trocar o modelo de uma família exigem o **Comercial** (a regra da seção 3.3); os outros recebem *"Acesso negado ao módulo"*.
A proposta acha o modelo pelo **nome** da família gravado nos itens: renomear uma família muda o modelo que as propostas novas com
itens daquele nome recebem.

**O cadastro de família de produto.** Criar, editar, renomear e apagar uma família, trocar a foto e o esquemático, escolher as variáveis
dela e as opções de cada variável exigem o **Comercial** (a regra da seção 3.3) — é em **Comercial → Produtos → um grupo**. As opções por
família e a leitura das famílias e das variáveis que **Configurações → Comercial** usa (*Opções por família* e *Template de proposta*)
aceitam também o **administrador do módulo Comercial** que tem acesso ao **Administrativo** — mas só elas: esse usuário não cria, renomeia nem
apaga família. Os outros recebem *"Acesso negado ao módulo"*, a tentativa fica registrada em **Administração → Logs**, e a foto ou o
esquemático são recusados antes de chegar ao servidor. **Clonar** uma família é só do administrador do sistema; os outros recebem *"Apenas
administradores podem clonar famílias"*.

**Os grupos de produto, os produtos e as variáveis técnicas.** Ver o catálogo (a lista de produtos com o preço, um produto, os grupos),
criar, editar e apagar produto e grupo, enviar a imagem do produto e a foto do grupo, e pedir o próximo código exigem o **Comercial** (a
regra da seção 3.3) — é em **Comercial → Produtos** e na seleção de produtos da proposta. Duas exceções: a ordem de serviço lê cada item
pelo **código do produto**, e essa leitura aceita também quem tem o **Operacional** (veja 6.2.2); e as **variáveis técnicas** (ler, criar,
alterar e desativar — a aba **Configurações → Comercial → Variáveis técnicas**) aceitam também o **administrador do módulo Comercial** que
tem acesso ao **Administrativo**. Os outros recebem *"Acesso negado ao módulo"*, a tentativa fica registrada em **Administração → Logs**, e
a imagem ou a foto são recusadas antes de chegar ao servidor. **Clonar** um produto é só do administrador do sistema; os outros recebem
*"Apenas administradores podem clonar produtos"*. A busca do topo da tela mostra o nome e a família dos produtos a qualquer usuário (sem o
preço).

#### 3.3.5 Listas de Preço

Em **Comercial → Lista de Preços** importa-se uma planilha (as colunas viram as colunas da lista), busca-se por qualquer palavra das
colunas (cada palavra digitada tem de aparecer na linha) e exclui-se a lista. Só quem entra no Comercial usa as listas — os outros
recebem *"Acesso negado ao módulo"*. Ser administrador do módulo Comercial, sem o acesso ao Comercial, não basta aqui.

A importação é **inteira ou nada**: a lista só aparece com todas as linhas da planilha gravadas. Se o banco recusar uma linha, nenhuma lista
nova fica e aparece *"Erro ao gravar as linhas da lista de preços (<o erro do banco>). A lista não foi criada — importe a planilha de
novo."*; se nem desfazer for possível, *"Erro ao gravar as linhas da lista de preços (<o erro>). A lista "<nome>" ficou incompleta — exclua-a e
importe a planilha de novo."* Com o banco ocupado, a tela tenta de novo sozinha algumas vezes e, se não conseguir, mostra *"Erro ao importar a
planilha."* — nada fica gravado, e basta importar de novo.

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

**Ao salvar uma edição pela integração (API):** os campos que não vierem ficam como estavam; o título não pode ficar vazio (*"Título é
obrigatório"*).

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

**Quem vê a lista.** A lista de ordens de serviço do Comercial segue a mesma regra de acesso das propostas (seção 3.3): quem o
Comercial deixa entrar vê a lista; os outros recebem *"Acesso negado ao módulo"*. Criar e editar a OS usa as regras do **Operacional**
(o número da OS e os itens dela): quem só tem o acesso ao Comercial pela regra de "nenhuma permissão" pode ver a lista e não conseguir
criar a OS.

**Quem abre uma OS.** Abrir uma OS para editar, ver os itens dela, gerar o PDF e baixá-lo exige o **Comercial ou o Operacional** — as duas
telas que abrem a OS com os itens e o PDF (**Comercial → Ordens de Serviço**, pelo lápis, e a tela de detalhes da OS da Fábrica) —, com a mesma regra de acesso das propostas
(seção 3.3) aplicada a cada um dos dois módulos: basta um. A conferência é feita em cada operação, inclusive pela integração; quem não pode
recebe *"Acesso negado ao módulo"*, a tentativa fica registrada em **Administração → Logs** e o PDF não é gerado.

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

**Quem vê a lista.** A lista **Fábrica → Ordens de Serviço** (e as OS em andamento oferecidas em **Fábrica → Atividades**) exige o
**Operacional**, com a mesma regra que decide se a Fábrica aparece na tela: o administrador do sistema e o super administrador entram sempre;
os outros, só com a permissão do Operacional dada ao usuário ou a um grupo **ativo** dele. Quem não pode recebe *"Acesso negado ao módulo"*
e a tentativa fica registrada em **Administração → Logs**.

**Quem abre a OS.** Abrir a OS, os itens, gerar e baixar o PDF exige o **Operacional** ou o **Comercial** (a regra da seção 3.7.1). Quem
tem só o Operacional abre a tela de detalhes da OS (os itens e o PDF) pelo endereço `/fabrica/ordens-servico/editar/<número interno>`; o
lápis da lista **Fábrica → Ordens de Serviço** abre o formulário da OS. As especificações de cada item vêm do cadastro do produto, lido pelo
código com a mesma regra (o Operacional ou o Comercial).

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
