# Manual do módulo Almoxarifado

Este é o manual de quem **usa** o Almoxarifado do Orion: o almoxarife que lança entrada e saída, o
encarregado que requisita material, o comprador que dá entrada em nota, a qualidade que decide uma
inspeção, o gestor que homologa inventário e quem precisa apresentar o sistema a outras pessoas. Ele
descreve **como o sistema é hoje** — o que cada tela faz, qual regra o sistema aplica, o que ele
**bloqueia** e o que ele apenas **avisa**, e a **mensagem exata** que aparece quando algo é recusado.
Não é preciso ler do começo ao fim: use o índice para ir ao assunto, e leia a seção inteira antes de
executar a operação pela primeira vez — quase toda regra deste módulo tem uma exceção deliberada
explicada logo abaixo dela.

## Índice

1. [O que é o módulo Almoxarifado](#1-o-que-é-o-módulo-almoxarifado)
2. [Cadastro de materiais](#2-cadastro-de-materiais)
3. [Localizações e endereçamento](#3-localizações-e-endereçamento)
4. [Lotes, séries e etiquetas](#4-lotes-séries-e-etiquetas)
5. [Perfis e permissões](#5-perfis-e-permissões)
6. [Movimentações de estoque](#6-movimentações-de-estoque)
7. [Requisições de material](#7-requisições-de-material)
8. [Aprovações](#8-aprovações)
9. [Reservas](#9-reservas)
10. [Separação e entrega](#10-separação-e-entrega)
11. [Transferências entre localizações](#11-transferências-entre-localizações)
12. [Devoluções ao estoque](#12-devoluções-ao-estoque)
13. [Inventário e conferência de estoque](#13-inventário-e-conferência-de-estoque)
14. [Recebimento de material](#14-recebimento-de-material)
15. [Inspeção e qualidade](#15-inspeção-e-qualidade)
16. [Materiais de clientes](#16-materiais-de-clientes)
17. [Material enviado a terceiros](#17-material-enviado-a-terceiros)
18. [Transformação no terceiro](#18-transformação-no-terceiro)
19. [Sobras e retalhos](#19-sobras-e-retalhos)
20. [Sucateamento](#20-sucateamento)
21. [Ferramentas e calibração](#21-ferramentas-e-calibração)
22. [Como o sistema calcula](#22-como-o-sistema-calcula)
23. [Cuidados na operação](#23-cuidados-na-operação)
24. [Onde pedir ajuda e o que este documento não cobre](#24-onde-pedir-ajuda-e-o-que-este-documento-não-cobre)

---

## 1. O que é o módulo Almoxarifado

Uma indústria metalúrgica compra chapa, tubo, perfil, eletrodo, rolamento, tinta, ferramenta e EPI, e consome quase tudo isso dentro de ordens de serviço e projetos que precisam ser custeados. O que costuma faltar não é o material — é a *resposta*: quanto temos, onde está, de qual lote saiu a peça que o cliente reclamou, quem pegou aquele item na sexta à tarde, e por que a chapa que o sistema diz estar na prateleira está há três semanas no galvanizador. O módulo Almoxarifado do Orion existe para que essas perguntas tenham resposta única, com nome, data e justificativa — sem depender da memória de quem estava lá.

Ele cobre o ciclo inteiro de um item físico: o cadastro do material com seus dados técnicos, o endereço onde ele fica, a entrada pela nota fiscal, a quarentena de inspeção, a requisição feita pela produção, a aprovação, a reserva, a separação, a entrega, a devolução, a transferência de área, a remessa para beneficiamento externo e a baixa por sucata ou perda. Cada uma dessas operações é um lançamento registrado, com autor e horário, e todas passam pelo mesmo motor de estoque — o que garante que o saldo mostrado numa tela seja o mesmo saldo consultado por outra.

As telas do módulo ficam em **Almoxarifado**, no menu lateral:

| Tela | Para que serve |
|---|---|
| Dashboard | indicadores de estoque crítico, valor e movimento |
| Materiais | cadastro, consulta, extrato e etiquetas |
| Requisições | pedido, aprovação, separação e entrega |
| Recebimentos | chegada de material e entrada por nota fiscal |
| Inspeções | quarentena, decisão da qualidade, bloqueio e desbloqueio |
| Movimentações | o livro de lançamentos e o formulário de entrada, saída, transferência, ajuste e perda |
| Lotes e Séries | situação do lote, certificado, validade e números de série |
| Devoluções | material entregue que volta ao almoxarifado |
| Materiais de Clientes | posição por cliente e devolução ao dono |
| Remessas a Terceiros | material enviado para beneficiamento externo |
| Sobras e Retalhos | retalhos com ficha dimensional e etiqueta, e o processo de sucateamento com dupla aprovação |
| Reservas | saldo separado para uma OS ou projeto |
| Conferências de Estoque | inventário e homologação de divergência |
| Mapa de Áreas | o desenho do galpão, posição por posição |
| Configurações | famílias, setores, localizações, perfis, parâmetros do módulo |

---

## 2. Cadastro de materiais

Onde: **Almoxarifado → Materiais → Novo Material** (ou o ícone de edição em qualquer linha da lista).

O formulário é dividido em sete blocos, sempre nesta ordem:

| Bloco | O que reúne |
|---|---|
| Identificação | Código, Nome do Material, Descrição, Descrição Técnica |
| Classificação | Família, Subfamília, Categoria, Tipo de Material, Material crítico |
| Propriedade | Proprietário (GMP ou um cliente) |
| Dados Técnicos | Fabricante, Código no Fabricante, Marca, Modelo, Norma Técnica, Material Construtivo, Peso Unitário (kg), Dimensões, NCM, Aplicação, Especificações Técnicas, Observações Gerais |
| Estoque e Reposição | Unidade de Medida, Saldo Inicial (ou Quantidade Atual, ao editar), Estoque Mínimo, Estoque Máximo, Ponto de Reposição, Lote Econômico, Localização no estoque |
| Controles | as sete opções descritas em 2.7 |
| Unidades e Custos | Classe ABC, Custo Unitário (R$), Unidade de Compra, Fator de Conversão (Compra), Unidade de Consumo, Fator de Conversão (Consumo), Fornecedor Principal, Código no Fornecedor |

Ao lado do formulário há ainda o campo **Foto do Produto** (JPG, PNG ou WEBP, até 10 MB).

**Obrigatórios são apenas três:** Código, Nome do Material e Família. Todo o resto pode ficar em branco e ser completado depois.

Duas coisas mudam quando você **edita** um material já existente, e é bom saber antes de procurar:

- **A Família fica travada.** O campo é desabilitado, com a legenda *"A família não pode ser alterada após o cadastro."* — a família define o prefixo do código, e trocá-la depois deixaria o código mentindo sobre a classificação.
- **O saldo não se edita pela ficha.** O campo que na criação se chama "Saldo Inicial" passa a se chamar "Quantidade Atual" e fica desabilitado, com o aviso *"Use 'Movimentações' para ajustar"*. Saldo só muda por lançamento, e todo lançamento tem autor, motivo e horário.

### 2.1 Famílias e subfamílias

A família é o eixo de classificação obrigatório do material, e é ela que determina o prefixo do código. A hierarquia tem **no máximo dois níveis**: uma família pode ter subfamílias, mas uma subfamília não pode ter filhas.

Regras que o sistema aplica:

| Situação | Resultado |
|---|---|
| Material sem família | Recusado — a família é obrigatória |
| Família marcada como inativa | Recusado: *"Família inativa — não é possível vincular novos itens"* |
| Subfamília que não é filha da família escolhida (ou que está inativa) | Recusado: *"Subfamília inválida para a família selecionada"* |

No formulário, o campo **Subfamília** só se habilita depois que a Família é escolhida, e lista apenas as filhas daquela família. Se a família não tiver nenhuma, aparece o aviso *"Esta família não tem subfamílias cadastradas."*

As famílias são mantidas em **Almoxarifado → Configurações → aba "Famílias"**, cada uma com um tipo de uso (administrativo, industrial ou ambos).

Além da família existe o campo **Categoria**, uma classificação livre de apoio (Consumível, Ferramenta, EPI, Elétrico, Hidráulico, Mecânico, Insumo, Embalagem, Escritório, Limpeza, Outros) e o campo **Tipo de Material**, texto que descreve a natureza física do item (chapa, tubo, perfil, barra, motor, rolamento, válvula, ferramenta, EPI, consumível etc.). O Tipo de Material não é decorativo: é ele que a restrição de endereço consulta (ver 3.4).

### 2.2 O código do material

O código é **único em todo o sistema** e é ele que aparece grande na etiqueta impressa.

**Como é gerado.** O sistema propõe o próximo código a partir da família escolhida: pega o código da família como prefixo, procura o **maior número já usado** naquela família e soma 1, formatando com três dígitos. Uma família de código `CHP` cujo maior material seja `CHP-014` recebe a sugestão `CHP-015`. Quando não há família informada, o prefixo padrão é `ALM` (`ALM-001`, `ALM-002`, …). Repare que o critério é o **maior número**, não o material cadastrado mais recentemente: cadastrar `CHP-010` e depois `CHP-002` continua propondo `CHP-011`.

**Como é informado.** O campo aceita digitação livre — você pode ignorar a sugestão e usar a codificação da sua engenharia. O que o sistema garante é a unicidade: se o código digitado já existe, o cadastro é recusado com *"Código já existe"*. Isso é proposital: quem digitou um código quer saber que ele está ocupado, não receber outro em silêncio.

### 2.3 Unidades e fatores de conversão

São três campos de unidade, com papéis distintos:

- **Unidade de Medida** — a unidade em que o saldo é contado e mostrada em toda tela de estoque. É a unidade de referência.
- **Unidade de Compra** — como o fornecedor vende (caixa, rolo, tambor).
- **Unidade de Consumo** — como a produção retira (metro, peça).

Cada uma das duas últimas exige o seu fator: quantas unidades de estoque cabem em uma unidade de compra, e quantas em uma unidade de consumo.

A regra é condicional e está em ambos os sentidos, criação e edição:

> Se **Unidade de Compra** estiver preenchida, o **Fator de Conversão (Compra)** é obrigatório e precisa ser **maior que zero**. Idem para Unidade de Consumo e o seu fator. Preencher a unidade e deixar o fator em branco, em zero ou negativo faz o cadastro ser recusado.

O contrário é permitido: informar só a Unidade de Medida e deixar compra e consumo vazias é o caso normal da maioria dos itens.

Os fatores hoje são informação de cadastro — registram a equivalência para quem faz o pedido de compra e para quem lê a ficha. Toda movimentação de estoque é lançada na Unidade de Medida; o sistema não converte quantidades automaticamente.

### 2.4 Campos técnicos

O bloco **Dados Técnicos** é o que transforma o cadastro em ficha de material, e é ele que sustenta rastreabilidade e requalificação de fornecedor:

| Campo | Uso típico |
|---|---|
| Fabricante / Código no Fabricante | quem produziu e sob qual referência dele |
| Marca / Modelo | identificação comercial |
| Norma Técnica | a norma que o item atende (ex.: a especificação do aço) |
| Material Construtivo | de que o item é feito |
| Peso Unitário (kg) | peso de uma unidade — também é o que permite calcular rendimento quando um material sai para corte e volta transformado (ver 21.4) |
| Dimensões | medidas do item, em texto livre |
| NCM | classificação fiscal |
| Aplicação | onde esse item é usado |
| Especificações Técnicas / Observações Gerais | texto longo, para o que não cabe nos campos acima |

### 2.5 Classificação ABC

O campo **Classe ABC** aceita exatamente três valores: **A**, **B** ou **C** — mais a opção "— não classificado —", que é o estado inicial. Qualquer outro valor é recusado.

A classificação é **manual**: o sistema não calcula a curva ABC sozinho nem reclassifica ninguém automaticamente. É uma marcação de gestão, definida por quem faz a análise de consumo e valor, e serve para filtrar e priorizar (o item A é o que justifica contagem mais frequente e acompanhamento de ponto de reposição).

### 2.6 Estoque mínimo, máximo e ponto de reposição

| Campo | O que faz de fato |
|---|---|
| **Estoque Mínimo** | é o parâmetro que **dispara** a condição de crítico, o alerta e a sugestão de compra |
| **Estoque Máximo** | entra na **conta da quantidade sugerida de compra** (ver abaixo); não bloqueia entrada acima dele nem gera alerta de excesso |
| **Ponto de Reposição** | referência de gestão, registrada na ficha |
| **Lote Econômico** | quantidade de compra recomendada, registrada na ficha |

**A regra do estoque mínimo, exatamente como o sistema decide:**

- Um material entra na condição "crítico" quando **Estoque Mínimo é maior que zero** *e* **Saldo Atual é menor ou igual ao Estoque Mínimo**. Material com mínimo zerado nunca é crítico — zero significa "não controlado por mínimo", não "mínimo é zero".
- É essa mesma condição que alimenta o KPI **Estoque Crítico** do Dashboard, a lista dos dez itens mais críticos (ordenados pela razão saldo ÷ mínimo, do menor para o maior) e o filtro de estoque baixo na lista de Materiais.
- O **alerta por e-mail** não é enviado a cada movimentação: ele dispara na **travessia da fronteira**, quando o material estava acima do mínimo e passa a estar no mínimo ou abaixo. Enquanto continuar abaixo, não repete. Quando a reposição levar o saldo de volta para acima do mínimo, o estado é reiniciado e um novo alerta poderá ser enviado na próxima queda. O destinatário é configurado em **Configurações → Configurações Gerais**, campo "E-mail para Alertas de Estoque".
- A mesma condição alimenta a **sugestão de compra**: o material que cruza o mínimo entra na lista de solicitações com o motivo "estoque mínimo", e a **quantidade sugerida** é calculada assim — **o que falta para chegar ao Estoque Máximo** (máximo menos saldo atual); se essa conta der menos que o Estoque Mínimo, sugere-se o próprio Estoque Mínimo. É por isso que vale preencher o máximo mesmo ele não bloqueando nada: sem ele, a sugestão fica limitada ao mínimo.
- Material de cliente **não** entra em nenhuma dessas contas: o KPI de crítico, o alerta e a sugestão de compra olham apenas o estoque próprio.

Mínimo, máximo, ponto de pedido e prazo de reposição também podem ser revisados em massa, sem abrir material por material, em **Configurações → aba "Estoques Mínimos"** — uma tabela com Saldo Atual, Estoque mín., Estoque máx., Ponto Pedido, Prazo Repos. (dias) e um indicador de status por linha.

Um efeito colateral útil de conhecer: **salvar a ficha de um material reavalia na hora a condição de mínimo dele**. Baixar o Estoque Mínimo de um item que já estava abaixo, ou salvar o cadastro de um item crítico, pode disparar o alerta imediatamente — não é preciso esperar nenhuma rotina. O mesmo vale ao salvar a tabela de Estoques Mínimos.

### 2.7 Os "controles" do material — o que cada um passa a exigir

O bloco **Controles** tem sete opções. Ligar uma delas muda o comportamento do sistema para *aquele* material. É importante entender o alcance real de cada uma antes de ligá-la em massa.

| Opção | O que passa a exigir na prática |
|---|---|
| **Controle por lote** | Toda entrada, saída e transferência feita pelas telas que têm campo de lote passa a **exigir o lote informado**. Sem ele, a operação é recusada com *"O material CHP-001 exige lote nesta movimentacao (controle por lote ligado)"*. Nas telas: Movimentações, o modal rápido de entrada/saída da tela de Materiais, Recebimentos, Transferências e Devoluções para estoque ou quarentena. |
| **Controle por número de série** | Cada unidade passa a ter identidade própria. Na **entrada**, é preciso informar **um número de série por unidade** — 5 unidades exigem 5 números. Na **saída**, é preciso **escolher quais séries** saem. O próprio formulário avisa: *"Exigirá um número de série por unidade na entrada e na saída"*. Duas recusas típicas: *"material com controle de serie exige quantidade inteira"* (não existe meia unidade serializada) e *"material com controle de serie: informe 5 serie(s) para 5 unidade(s) — recebidas 3"*. |
| **Requer certificado** | No recebimento, o lote **nasce bloqueado**, com o motivo *"Certificado do fornecedor nao anexado"*. Atenção ao que isso significa: **o material entra normalmente no estoque físico** — o que fica travado é a **saída**, até que alguém anexe o certificado na tela Lotes e Séries (ver 4.6). Como a trava vive no lote, ela depende de haver lote: ligue esta opção **junto com Controle por lote**, senão um recebimento sem lote informado entra sem bloqueio nenhum. |
| **Requer inspeção** | Registro de cadastro. Quem determina a retenção para inspeção no recebimento é a marcação **Material crítico** (bloco Classificação), não esta opção. |
| **Controle de validade** | Registro de cadastro. A validade existe e funciona **no lote**, com todas as suas regras (ver 4.3) — mas ligar esta opção no material não torna o preenchimento da validade obrigatório. |
| **Controle de corrida** | Registro de cadastro. A corrida (número de colada do aço) existe e é gravada **no lote**; esta opção não a torna obrigatória. |
| **Requer foto** | Registro de cadastro; não bloqueia operação. |

Há ainda uma marcação fora deste bloco que tem efeito operacional: **Material crítico**, no bloco Classificação. É ela — e não a opção "Requer inspeção" — que faz a quantidade recebida entrar **retida em inspeção** no recebimento, em vez de entrar direto como disponível (ver 14.6). O material fica fisicamente no galpão, contado no saldo total, mas fora do disponível até que a inspeção decida.

Onde a exigência de lote e de série **não** se aplica, e isso é deliberado: entrega de requisição, estorno de requisição excluída, inspeção, ajuste puro de inventário e as movimentações de remessa a terceiros. Essas telas não têm campo de lote nem de série, e exigi-los ali tornaria o material impossível de entregar. O ajuste é isento por um motivo próprio: é por ele que se regulariza estoque antigo, que não tem lote nenhum. O preço é que a quantidade movimentada por esses caminhos fica na linha "sem lote" — o saldo total do material continua correto.

### 2.8 Proprietário — material que é do cliente

O bloco **Propriedade** tem um campo, **Proprietário**, que por padrão vem em **"GMP (estoque próprio)"**. Escolher um cliente ali transforma o item em material de cliente, e o sistema passa a tratá-lo de forma diferente, conforme o próprio formulário avisa:

> *"Material de cliente só sai com OS ou projeto desse mesmo cliente, exige número de documento no recebimento e não entra na reposição, na sugestão de compra nem no valor do estoque próprio."*

Não existe cadastro separado de "material de cliente": ele é material normal, com dono — e por isso tem lote, série, endereço, extrato e etiqueta como qualquer outro. As regras completas de propriedade estão na seção 16.

### 2.9 Histórico do cadastro

Toda criação e toda edição de material ficam registradas com **quem fez, quando, e o de/para de cada campo alterado** — apenas os campos que realmente mudaram, não a ficha inteira. Excluir um material é uma **inativação**: ele sai das listas, mas o histórico de movimentações continua íntegro.

---

## 3. Localizações e endereçamento

### 3.1 A regra de negócio que define tudo: almoxarifado é área física, não filial

Esta é a decisão que explica o comportamento do módulo inteiro, e é preciso enunciá-la antes das telas.

Os almoxarifados cadastrados no sistema representam **áreas de alocação dentro do mesmo site** — galpão, mezanino, área externa, área de corte. A empresa tem **uma única filial**. Consequência direta e intencional:

> **O saldo de cada material é um só, somado em todas as áreas.** Uma saída consome o saldo total do material, independentemente da área em que ele esteja endereçado. O endereço serve para você **achar o item na prateleira**, não para manter estoques separados.

Por isso não existe seletor de almoxarifado em movimentação nem em requisição, e não existe "saldo do ALM-01" contraposto ao "saldo do ALM-02". Não é uma lacuna: tratar duas áreas do mesmo galpão como dois estoques faria o sistema recusar uma saída porque a caixa estava dez metros adiante. Se um dia houver uma segunda filial de verdade, a regra muda — hoje, seria errado.

### 3.2 A hierarquia

O endereço é montado em quatro níveis, e é exibido no formato `ALM-GERAL / Corredor A / A-01 / GAV-03`:

| Nível | O que é | Onde se cadastra |
|---|---|---|
| **Almoxarifado** | a área física raiz (código + nome, ex.: `ALM-GERAL — Almoxarifado Geral`) | Configurações → aba "Setores e Áreas", bloco "Almoxarifados" |
| **Setor** | o agrupamento dentro do almoxarifado (área, corredor ou bancada), com um prefixo de código próprio | Configurações → aba "Setores e Áreas" |
| **Localização raiz** | a estrutura em si (prateleira, gaveta, box, rua) | Configurações → aba "Localizações" |
| **Localização filha** | a subdivisão da estrutura, identificada por um **subgrupo** | Configurações → aba "Localizações" |

Cada localização tem: **Código** (único), **Descrição**, **Setor**, **Subgrupo**, **Tipo**, **Almoxarifado**, além da posição e do tamanho que ela ocupa no Mapa de Áreas.

O **código é sugerido automaticamente** ao criar: o sistema toma o prefixo do setor (ou o prefixo do código da localização pai, quando é uma filha), procura o maior número já usado e propõe o próximo, com dois dígitos — `A-01`, `A-02`, `GAV-03`. O assistente de criação mostra o código e a descrição em pré-visualização antes de confirmar.

### 3.3 Tipos de localização

Ao criar ou editar, escolhe-se um entre treze tipos:

`Almoxarifado` · `Rua` · `Prateleira` · `Gaveta` · `Box` · `Área externa` · `Área de corte` · `Área de montagem` · `Área de elétrica` · `Área de pintura` · `Área de expedição` · `Área de materiais do cliente` · `Área de quarentena/inspeção`

O tipo é **descritivo**: ele define o ícone, a cor e o tamanho com que a posição aparece no Mapa de Áreas, e o rótulo na tabela. Ele **não** carrega regra de negócio — endereçar um material numa posição do tipo "Área de quarentena/inspeção" não coloca esse material em quarentena. Quarentena é um estado de saldo, decidido pela inspeção, não pelo endereço.

### 3.4 Bloqueio e restrição por tipo de material

Duas travas configuráveis por posição, no modal **Editar Localização** (Configurações → aba "Localizações" → ícone de lápis):

**Localização bloqueada** — caixa de seleção `🔒 Localização bloqueada`, com a explicação na própria tela: *"Impede movimentações de entrada e saída nesta posição."* Vale nos **quatro papéis**: como destino de uma entrada, como origem de uma saída, nas duas pontas de uma transferência e no destino de um ajuste com localização. A recusa é imediata, **antes de qualquer efeito no saldo**:

> *"Localização A-01 está bloqueada"*

Atenção a um detalhe que economiza tempo: a validação vale também quando você **não** informa a localização, porque nesse caso o sistema usa a **Localização no estoque** cadastrada no material. Bloquear a posição padrão de um item bloqueia a entrada dele mesmo sem ninguém escolher destino.

Uma exceção deliberada: o **estorno** de uma movimentação **não** valida bloqueio. Reverter um lançamento precisa sempre ser possível, mesmo que a posição tenha sido bloqueada depois do movimento original.

**Tipos de material permitidos** — lista de seleção múltipla, rotulada na tela como *"Tipos de material permitidos (nenhum selecionado = qualquer tipo)"*. A comparação é feita contra o campo **Tipo de Material** do cadastro do material. A regra tem uma direção:

> A restrição é avaliada **apenas no destino** — ela responde "o que pode entrar aqui", não "o que pode sair daqui". Numa saída, a única trava da origem é o bloqueio.

Recusa:

> *"Localização A-01 não aceita o tipo de material 'chapa'"*

Deixar a lista vazia significa **sem restrição** (não "nenhum tipo permitido").

### 3.5 Excluir uma localização que tem saldo

Excluir é permitido apenas quando a posição está vazia. A verificação é feita por **existência de linha de saldo diferente de zero**, e não pela soma — um endereço com +10 de um material e −10 de outro **não** conta como vazio.

> *"Não é possível remover: localização possui saldo"*

A exclusão bem-sucedida é uma **inativação**: a posição sai das listas, mas o código continua reservado. Recriar depois o mesmo código reaproveita e reativa aquele endereço.

Três recusas irmãs, na mesma família:

| Ação | Mensagem |
|---|---|
| Inativar um almoxarifado que ainda tem localizações ativas | *"Não é possível inativar: existem localizações ativas vinculadas a este almoxarifado"* |
| Criar duas localizações com o mesmo subgrupo no mesmo setor e sob o mesmo pai | *"Subgrupo já existe neste setor e localização pai"* |
| Criar uma localização com código já em uso por outra ativa | *"Código já existe"* |

**Capacidade e peso máximo não são modelados.** A localização não tem campo de capacidade, volume ou peso suportado, e o sistema não recusa nenhuma entrada por excesso de ocupação. As medidas que existem na posição (largura e altura) são o tamanho do retângulo dela no Mapa de Áreas.

### 3.6 Como um material fica endereçado

Há duas coisas diferentes, e confundi-las causa dúvida:

**A localização de cadastro** — o campo **Localização no estoque**, no bloco Estoque e Reposição da ficha do material. É a posição *padrão*: quando uma movimentação não informa origem ou destino, é ela que o sistema usa. Se houver mais de um almoxarifado cadastrado, o formulário pede primeiro o almoxarifado e só então lista as posições dele.

**O saldo endereçado** — as quantidades que efetivamente estão em cada posição, escritas pelas movimentações: a entrada credita o destino, a saída debita a origem, a transferência move de uma posição para outra, e o ajuste com localização **define** (não soma) o que existe naquela prateleira, recalculando em seguida o total do material pela soma de todas as posições.

Duas consultas de apoio para quem está organizando o galpão — **posições vazias** e **materiais sem endereço** — existem hoje como consulta de sistema, sem tela própria.

### 3.7 O Mapa de Áreas

**Almoxarifado → Mapa de Áreas** desenha o galpão em duas dimensões, com uma caixa por posição, arrastável para representar o layout real. Cada caixa mostra a ocupação: quantos materiais distintos estão ali, a quantidade total, quantos itens estão abaixo do mínimo e quantos estão críticos. Há filtro por almoxarifado no topo, e a posição bloqueada aparece com contorno tracejado e o cadeado 🔒.

---

## 4. Lotes, séries e etiquetas

Lote e série resolvem problemas diferentes. **Lote** identifica um conjunto que compartilha origem, corrida e validade — a remessa de chapa que veio na nota tal, com o certificado tal. **Número de série** identifica **uma unidade específica** — o motor SN tal, o instrumento nº tal. Um material pode ter os dois, um dos dois, ou nenhum.

### 4.1 Quando um lote é obrigatório, e como ele nasce

O lote é exigido quando o material tem **Controle por lote** ligado, nas operações em que existe campo para informá-lo (ver a tabela de 2.7). A recusa é *"O material CHP-001 exige lote nesta movimentacao (controle por lote ligado)"*.

No **Recebimento**, a checagem é feita sobre a nota inteira **antes de qualquer item entrar**. Se faltar lote num item, nada entra, e a mensagem diz qual item está pendente:

> *"CHP-001: preencha o campo Lote (o material tem controle por lote)"*

**O lote nasce em dois lugares:**

1. **No Recebimento** — é onde ele deve nascer. Nos itens da nota há quatro campos: **Lote**, **Validade**, **Fabricação** e **Corrida**. Ao processar a nota, o lote é criado herdando fornecedor, número da nota fiscal, corrida, data de fabricação e validade.
2. **Numa movimentação de Entrada**, digitando o código no campo Lote. Aqui ele nasce só com o código, sem validade nem corrida — é o caminho de regularização, não o caminho normal.

Na **saída**, o campo Lote deixa de ser texto livre e vira uma **lista** dos lotes daquele material, com saldo e validade de cada um. Digitar um lote inexistente numa saída não o cria: *"Lote nao encontrado para este material: L-999"*. Saída é consumo, não é nascimento.

Um lote é único por material: dois materiais podem ter, cada um, um lote chamado `L-001`, e são lotes distintos. Receber duas vezes o mesmo lote do mesmo material soma saldo ao lote existente sem sobrescrever a validade original.

### 4.2 Situação do lote

Um lote tem **três** situações possíveis:

| Situação | O que permite |
|---|---|
| **Ativo** | é a única elegível para saída |
| **Bloqueado** | não sai por caminho nenhum — nem consumo, nem sucata, nem perda |
| **Reprovado** | idem |

As recusas dizem qual é o problema:

> *"Lote L-001 esta bloqueado e nao pode ser utilizado"*
> *"Lote L-001 esta reprovado e nao pode ser utilizado"*

Mudar a situação é feito em **Almoxarifado → Lotes e Séries**, botão **Mudar status** da linha. A **justificativa é obrigatória** — sem ela o botão Confirmar não habilita, e o servidor recusa com *"justificativa obrigatoria para mudar o status do lote"*. Toda mudança fica na auditoria, com o valor anterior, o novo e o motivo.

Repare que **"Vencido" não é uma situação**. Vencimento é calculado na hora da leitura, comparando a data de validade com a data de hoje — e é um eixo independente da situação. Um lote pode estar Ativo e vencido, ou Bloqueado e vencido, ao mesmo tempo.

### 4.3 Validade, material vencido e liberação de vencimento

A ordem de verificação importa e é sempre a mesma: **primeiro a situação, depois o vencimento.**

**Um lote vencido não sai para consumo:**

> *"Lote L-001 vencido em 2026-01-31 nao pode sair para consumo. Libere o vencimento do lote (PUT /api/almoxarifado/lotes/:id/liberar-vencimento) com justificativa, ou baixe por SUCATA/PERDA ou corrija por AJUSTE."*

**Mas ele precisa poder sair do estoque.** Por isso as baixas de descarte são isentas da trava de vencimento: **Sucata**, **Perda**, **Ajuste negativo**, e as baixas de material perdido ou consumido no terceiro. Sem essa isenção, um lote vencido ficaria preso para sempre — não poderia ser consumido, e também não poderia ser descartado. A isenção vale **só** para vencimento: um lote Bloqueado ou Reprovado continua barrado mesmo no descarte.

**A liberação de vencimento** é o caminho para consumir, com responsabilidade registrada, um lote que passou da validade mas foi requalificado. Em **Lotes e Séries**, o botão **Liberar vencimento** aparece **apenas em lote vencido**, e exige justificativa. Ficam gravados quem liberou, quando e por quê.

E aqui está a regra que costuma surpreender, e que é intencional:

> **Liberar o vencimento não "desvence" o lote.** Ele continua marcado como vencido em todas as telas — passando a aparecer como "vencido, liberado". O que muda é apenas que o sistema deixa de barrar o consumo. Apagar a marca de vencido esconderia da auditoria que aquele material está fora da validade.

A própria tela avisa: *"Isto não 'desvence' o lote — ele continua vencido. Só passa a ser aceito numa saída de consumo, com a justificativa registrada na auditoria."*

E, como situação vem antes de validade: um lote **bloqueado e vencido** não é resolvido pela liberação de vencimento — ele continua recusado, com a mensagem de bloqueio. Primeiro resolve-se a situação.

Recusas da liberação: *"justificativa obrigatoria para liberar o vencimento do lote"* e, se o lote não estiver vencido, *"Lote nao esta vencido; nao ha vencimento para liberar"*.

### 4.4 FEFO

FEFO significa *first expired, first out* — **o que vence primeiro sai primeiro**. É o critério correto para material com validade, e é diferente de FIFO (o que entrou primeiro sai primeiro).

Onde aparece: na tela de **Movimentações**, ao escolher uma Saída, Perda ou Transferência, a lista de lotes vem ordenada assim — **primeiro os elegíveis, depois por validade crescente** (lote sem validade vai para o fim), e o **primeiro lote elegível já vem pré-selecionado**. A mesma ordem é usada no seletor de lote da tela de Devoluções e nos seletores da tela de Sobras e Retalhos (gerar retalho e solicitar sucateamento).

**É sugestão, não imposição.** O operador pode trocar por qualquer outro lote elegível — há motivos legítimos para pegar outro, e travar isso no sistema atrapalharia mais do que ajudaria. O motor não verifica FEFO: ele valida situação, validade e saldo do lote **que foi escolhido**.

Um cuidado de leitura: lotes não elegíveis **não somem da lista** — aparecem no fim, desabilitados, com o motivo no rótulo (`L-001 — saldo 25 — vence 31/01/2026 (vencido, liberado) (bloqueado)`). Esconder faria o operador procurar material que o sistema decidiu não mostrar.

### 4.5 Saldo por lote

O saldo é controlado **por material + posição + lote**. A coluna Lote aparece no Extrato do material, separando as linhas.

Quando o lote é informado, a saída é validada **contra o saldo daquele lote**, não contra o total do material:

> *"Saldo insuficiente no lote L-002. Disponível: 3 UN"*

Ou seja: um material com 102 unidades no total, sendo 100 no lote `L-001` e 2 no `L-002`, recusa um pedido de 10 unidades do `L-002` — e a mensagem diz o saldo real daquele lote.

### 4.6 Certificado do fornecedor

Com **Requer certificado** ligado no material, o lote nasce **Bloqueado** no recebimento, com o motivo *"Certificado do fornecedor nao anexado"*. O material entra fisicamente no estoque; a saída é que fica travada. A trava mora no lote — se o item for recebido sem lote informado, não há o que bloquear; por isso esta opção anda junto com **Controle por lote**.

Para destravar: **Almoxarifado → Lotes e Séries**, escolha o material, e na linha do lote clique em **Anexar certificado** (ícone de upload). Aceita PDF ou imagem. O modal avisa quando é esse o caso: *"Este lote está BLOQUEADO por falta de certificado. Anexar o certificado do fornecedor libera o lote automaticamente."*

Anexado o arquivo, o lote **volta sozinho para Ativo** e a linha passa a exibir o link **"Ver certificado"**, que abre o documento numa aba nova, com a data do anexo. Reanexar substitui o arquivo anterior.

A liberação automática é cirúrgica: ela só desfaz **o bloqueio causado por falta de certificado**. Um lote que esteja Reprovado, ou bloqueado por outro motivo, não é liberado pelo upload — nesse caso o arquivo é guardado e a situação permanece, e a mudança tem de ser feita pelo botão Mudar status, com justificativa.

Sem arquivo selecionado: *"Nenhum certificado enviado"*.

### 4.7 Números de série

Com **Controle por número de série** ligado, cada unidade tem identidade própria.

**Na entrada** (tela Movimentações), aparece a caixa **"Números de série (um por linha)"**, com um contador ao vivo do tipo `3/5`. Há um **gerador de sequência**: informe um Prefixo (`GMP-`) e um Nº inicial, clique em **Gerar sequência**, e a caixa é preenchida sozinha. A quantidade de linhas tem de bater exatamente com a quantidade movimentada.

**Na saída** (Saída ou Perda), em vez de digitar, aparece uma **lista das séries em estoque**, para marcar quais saem. Se um lote já estiver escolhido, a lista mostra **apenas as séries daquele lote** — e trocar o lote limpa a seleção de séries, para não sair uma série que pertence a outro conjunto.

**No Recebimento**, cada item tem a caixa **"Séries (uma por linha)"** ao lado dos campos de lote, com contador contra a quantidade recebida.

**Ciclo de vida da série.** Os estados possíveis são cinco:

| Estado | Significado |
|---|---|
| **Em estoque** | presente e disponível — é o **único** estado que pode sair |
| **Bloqueada** | fisicamente presente, mas impedida de sair (suspeita de avaria, pendência de qualidade) |
| **Entregue** | saiu do estoque numa saída |
| **Sucateada** | saiu por sucata ou perda |
| **Estornada** | a entrada que a criou foi cancelada — a série não volta a ficar disponível, porque aquela entrada nunca deveria ter acontecido |

O ciclo normal é **Em estoque → Entregue → (devolução) → Em estoque**: devolver uma unidade reativa a série, que volta a ficar disponível. Bloquear e desbloquear é a única transição manual, e vai e volta entre Em estoque e Bloqueada.

Recusas mais comuns, na letra:

| Situação | Mensagem |
|---|---|
| Duas linhas iguais na caixa de séries | *"numeros de serie repetidos na lista informada"* |
| Entrar com uma série que já está no estoque | *"serie SN-001 ja esta em estoque"* |
| Sair com uma série de outro material | *"serie SN-001 nao pertence a este material"* |
| Sair com uma série que não é do lote escolhido | *"serie SN-001 nao pertence ao lote informado"* |
| Sair com uma série bloqueada ou já entregue | *"serie SN-001 nao esta disponivel (status BLOQUEADA)"* |
| Bloquear sem justificar | *"justificativa e obrigatoria para mudar o status da serie"* |

**Bloquear e desbloquear** se faz em **Almoxarifado → Lotes e Séries → aba "Séries"**, que lista Número, Status, Lote, Localização e as ações. A **justificativa é obrigatória** e fica registrada junto com a série. Só as séries Em estoque e Bloqueadas têm ação — os estados finais não voltam por essa via.

Uma unidade de controle importante: o sistema mantém a igualdade entre **quantidade de séries presentes** e **saldo do material**. É isso que impede um material serializado ter 10 no saldo e 8 séries cadastradas.

### 4.8 Etiquetas com QR Code

O sistema gera um **PDF de etiquetas** para imprimir e colar na prateleira, na caixa ou na própria peça.

**Formatos disponíveis**, escolhidos no momento de imprimir:

| Formato | Descrição |
|---|---|
| **Folha A4 (10 etiquetas por página)** | grade de 2 colunas por 5 linhas, etiquetas de 99 × 57 mm, cada uma com borda pontilhada de recorte — para folha adesiva comum |
| **Térmica 100×50 mm (1 por página)** | uma etiqueta por página, para rolo de impressora térmica |

O formato escolhido fica **lembrado** para a próxima vez (por navegador). O arquivo baixado se chama `etiquetas-AAAA-MM-DD.pdf`.

**O que vai impresso — e o que não vai.** A etiqueta é deliberadamente enxuta:

- **código do material**, em fonte grande, no canto superior esquerdo;
- **nome do material**, em corpo pequeno, cortado em no máximo duas linhas;
- **linha de controle**, que muda conforme o tipo de etiqueta:
  - etiqueta de **material**: sem linha de controle;
  - etiqueta de **lote**: `Lote L-001 · Val 31/01/2026` — a parte da validade só aparece se o lote tiver validade;
  - etiqueta de **série**: `SN: GMP-042`;
  - etiqueta de **retalho**: as dimensões restantes com a espessura e o peso aproximado, no formato `1200x800x3mm · ~18kg` — cada parte é omitida quando o retalho não a tem registrada;
- **QR Code**, à direita.

**Não** vão para o papel: fornecedor, corrida, número da nota fiscal, projeto, localização, saldo e situação de inspeção. Isso é escolha de projeto, não omissão — etiqueta cheia de letra miúda é ilegível numa prateleira de galpão, e o QR existe justamente para carregar o resto.

**O que o QR abre.** Ele contém um endereço do próprio sistema, que leva à tela certa **já filtrada**:

| Etiqueta | O QR abre |
|---|---|
| Material | a tela **Materiais**, naquele material |
| Lote | a tela **Lotes e Séries**, no material certo, na aba **Lotes**, com a linha daquele lote **destacada** |
| Série | a tela **Lotes e Séries**, no material certo, na aba **Séries**, com a linha daquela série **destacada** |
| Retalho | a tela **Sobras e Retalhos**, com a linha daquele retalho **destacada** |

Ler o QR com a câmera do celular abre o navegador nesse endereço. Como dado de estoque exige sessão, quem não estiver logado cai na tela de login — faça o login e escaneie de novo. Não é preciso aplicativo nem coletor: o leitor é a câmera do próprio celular.

**Onde ficam os botões de etiqueta** (ícone de etiqueta):

| Tela | Onde e o que gera |
|---|---|
| **Materiais** | em cada linha. Material **sem** controle de lote nem de série abre o modal direto, com a etiqueta simples do material. Material **com** um dos dois controles **leva você para Lotes e Séries**, já naquele material — porque a etiqueta certa de um material controlado é a do lote ou da série específicos, não uma etiqueta genérica |
| **Lotes e Séries** | em cada linha de lote e em cada linha de série — inclusive séries já entregues ou sucateadas, para reimprimir uma via danificada |
| **Lotes e Séries → aba Séries** | botão no topo, **"Etiquetas das séries em estoque"**, que gera uma etiqueta para cada série em estoque daquele material de uma vez |
| **Recebimentos** | botão **"Imprimir etiquetas dos itens"**, na nota já processada — gera uma etiqueta por série (material serializado), ou uma por lote (material com controle de lote), ou uma do material |
| **Sobras e Retalhos** | botão **Etiqueta** em cada linha de retalho; além disso, ao **gerar um retalho** o modal de impressão abre sozinho com a etiqueta daquele retalho — imprimir é opcional |

O modal de impressão se chama **Imprimir etiquetas** e mostra, antes de gerar, quantas etiquetas e quantas páginas o PDF terá. O campo **Cópias** só aparece quando há uma única etiqueta selecionada. Quando não há nada a etiquetar, o botão fica desabilitado com a explicação na tela.

---

## 5. Perfis e permissões

### 5.1 A regra das duas camadas

O acesso ao módulo funciona em **duas camadas independentes**, e é preciso as duas para trabalhar:

| Camada | Responde | Onde se define |
|---|---|---|
| **Acesso ao módulo** | *Você pode **abrir** as telas do Almoxarifado?* | no cadastro do usuário / grupos de permissão, como para qualquer outro módulo |
| **Perfil no almoxarifado** | *Você pode **fazer** esta operação?* | Almoxarifado → Configurações → aba "Perfis de Acesso" |

A própria tela resume: *"Ter acesso ao módulo (no cadastro de usuário) permite abrir as telas; o perfil abaixo é o que permite agir."*

Quem não tem acesso ao módulo nem chega às telas — a tentativa é recusada com *"Acesso negado ao módulo"*, e fica registrada como tentativa de acesso negado. Quem tem acesso ao módulo mas não tem o perfil necessário abre a tela, vê os dados, e é recusado na ação:

> *"Sem permissão para esta operação"*

Na tela, isso aparece traduzido, dizendo o que faltou e qual é o seu perfil — por exemplo: *"Sem permissão para movimentar estoque — seu perfil é Produção. Solicite acesso a um administrador."*

### 5.2 Quem decide é sempre o servidor

Este ponto é importante para quem apresenta o sistema: **a autorização é decidida no servidor, em toda operação, sem exceção.** A interface consulta as suas permissões apenas para poder avisar antes — evitar que alguém preencha as sete seções do cadastro de material e só descubra no Salvar que não podia. É conveniência de tela, não a trava.

Consequência prática, e deliberada: se essa consulta de conveniência falhar (queda de rede, por exemplo), a tela **libera** os botões em vez de escondê-los — falhar fechado esconderia ações de quem tem direito a elas por causa de um problema de rede. O bloqueio real continua acontecendo no servidor, e a operação é recusada com a mensagem acima. Pelo mesmo motivo, na maior parte das telas **o botão continua visível** e a recusa acontece no clique, com a explicação: assim quem não tem permissão descobre *que a função existe* e a quem pedir.

### 5.3 Usuário sem perfil definido é tratado como chão de fábrica

O perfil de uma pessoa é resolvido nesta ordem:

1. superadministrador → **Administrador**;
2. administrador do módulo Almoxarifado (marcado no cadastro do usuário) → **Administrador**;
3. administrador do sistema → **Administrador**;
4. o perfil atribuído explicitamente na aba "Perfis de Acesso";
5. nada disso → **Produção**.

Ou seja: **usuário sem perfil definido não é "usuário sem acesso" — é Produção.** Ele já pode consultar, requisitar material e reservar, sem que ninguém tenha atribuído nada. O que ele **não** pode: movimentar estoque, cadastrar ou editar material, aprovar requisição, receber, inspecionar, inventariar ou configurar. A própria tela avisa: *"Quem não tem perfil definido entra como Produção — consulta e requisita, mas não movimenta estoque, não cadastra material e não aprova."*

Corolário que vale conhecer: o perfil **Consulta** nunca acontece por omissão — ele só existe se alguém o atribuir de propósito.

### 5.4 Os sete perfis

| Perfil | Em uma frase |
|---|---|
| **Administrador** | Acesso total, incluindo configurações do módulo |
| **Almoxarife** | Movimenta estoque, cadastra material, separa, entrega, aprova e inventaria — não ajusta saldo nem configura |
| **Gestor** | Ajusta saldo, aprova requisição e inventaria — não movimenta nem cadastra material |
| **Compras** | Consulta e recebe material |
| **Engenharia** | Cadastra e edita material, requisita e reserva |
| **Produção** | Consulta, requisita e reserva material (é o padrão de quem não tem perfil definido) |
| **Consulta** | Somente leitura |

A separação entre **Almoxarife** e **Gestor** é intencional e é o desenho de controle interno do módulo: quem **movimenta** o estoque não é quem **corrige** o saldo. O almoxarife lança entradas e saídas; o ajuste de inventário — o lançamento que faz o número bater sem que nada tenha entrado ou saído — pertence ao gestor.

### 5.5 A tabela completa de ação × perfil

| Ação | Administrador | Almoxarife | Compras | Produção | Engenharia | Gestor | Consulta |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Visualizar | ● | ● | ● | ● | ● | ● | ● |
| Criar material | ● | ● | – | – | ● | – | – |
| Editar material | ● | ● | – | – | ● | – | – |
| Movimentar estoque | ● | ● | – | – | – | – | – |
| Gerenciar ferramentas (emprestar, calibrar, bloquear...) | ● | ● | – | – | – | – | – |
| Aprovar sucateamento (perna do almoxarifado) | ● | ● | – | – | – | – | – |
| Aprovar sucateamento (perna da gestão) | ● | – | – | – | – | ● | – |
| Ajustar estoque | ● | – | – | – | – | ● | – |
| Ajustar material de cliente | ● | – | – | – | – | – | – |
| Remeter a terceiro | ● | ● | – | – | – | – | – |
| Aprovar requisição | ● | ● | – | – | – | ● | – |
| Separar / emitir | ● | ● | – | – | – | – | – |
| Requisitar | ● | ● | – | ● | ● | – | – |
| Receber material | ● | ● | ● | – | – | – | – |
| Inspecionar | ● | ● | – | – | – | – | – |
| Reservar | ● | ● | – | ● | ● | – | – |
| Reservar para outra OS | ● | – | – | – | – | ● | – |
| Inventariar | ● | ● | – | – | – | ● | – |
| Configurar o módulo | ● | – | – | – | – | – | – |

Cinco leituras que essa tabela permite fazer, e que vale explicar a quem pergunta:

- **Gerenciar ferramentas é independente de movimentar estoque**, mesmo com os mesmos dois perfis
  hoje: ferramenta é patrimônio emprestável, não estoque (seção 21), e a permissão existe separada
  de propósito — dá para autorizar um perfil só para ferramentas, sem abrir movimentação de
  material, se um dia isso for pedido.
- **Ajustar material de cliente é mais restrito que ajustar o estoque próprio.** O Gestor ajusta o saldo da GMP; **apenas o Administrador** ajusta o saldo de material que pertence a um cliente. O motivo é direto: aquele número é o que o cliente vai conferir e cobrar.
- **Reservar para outra OS** é separado de **Reservar**. Qualquer requisitante reserva material para a própria ordem; transferir uma reserva de uma OS para outra é decisão de priorização, e fica com o Administrador e o Gestor.
- **Inspecionar** é o que autoriza aprovar, reprovar e liberar material da quarentena, e também mudar a situação de um lote ou de uma série, e liberar vencimento. Hoje pertence ao Administrador e ao Almoxarife.
- **As duas aprovações de sucateamento são de balcões diferentes de propósito.** A perna do almoxarifado (Administrador, Almoxarife) e a perna da gestão (Administrador, Gestor) precisam **das duas assinaturas, de pessoas diferentes**, para uma baixa de sucata sair do estoque — e, embora o Administrador tenha as duas permissões, **a mesma pessoa nunca assina as duas pernas** (seção 20).

E uma que a tabela **não** mostra: **Inspecionar** cobre as decisões de qualidade, mas anexar o certificado do fornecedor a um lote pertence a **Receber material** — é o pessoal que recebe a carga que tem o documento em mãos.

### 5.6 Como se atribui um perfil

Em **Almoxarifado → Configurações → aba "Perfis de Acesso"** (acessível apenas a quem pode configurar o módulo). A tela lista os usuários com busca por nome ou e-mail, e três colunas: **Usuário**, **Perfil no almoxarifado** e **O que isso permite**. Basta escolher o perfil na lista da linha.

- Deixar em **"Produção (padrão)"** remove o perfil explícito: *"Perfil removido — o usuário volta ao padrão (Produção)"*.
- Quem já é superadministrador, administrador do sistema ou administrador do módulo aparece com o selo **Administrador** e **sem lista de escolha** — atribuir outro perfil a essa pessoa não teria efeito, porque a condição de administrador tem precedência. A tela explica: *"Para dar um perfil específico, remova a condição de administrador no cadastro de usuário."*

A mudança vale para as próximas ações da pessoa — pode levar alguns instantes para que ela deixe de ver os bloqueios antigos na tela dela.

### 5.7 O que fica registrado

Toda operação relevante do módulo grava uma trilha com **quem** (nome do usuário), **quando**, **o que** (a entidade e a ação), os **valores anteriores e novos** quando houve alteração, e a **justificativa** quando a operação exige uma.

São auditados: criação e edição de material; aprovação, rejeição, confirmação, encerramento e exclusão de requisição; movimentação de estoque e estorno; reservas; lotes (mudança de situação, liberação de vencimento, certificado); séries (entrada, saída, bloqueio, estorno); recebimentos; inspeções; devoluções; materiais de clientes; remessas a terceiros; sobras e retalhos (geração e edição); sucateamentos (solicitação, cada aprovação, rejeição, cancelamento, destino e a compensação automática quando uma aprovação é desfeita); e a própria troca de perfil de um usuário.

Duas notas de comportamento que evitam mal-entendido:

- **A auditoria nunca derruba a operação.** Se o registro do histórico falhar por algum motivo, a operação que o usuário pediu é concluída assim mesmo — perder o registro é ruim, recusar um recebimento válido por causa do registro seria pior.
- **Movimentação confirmada não se apaga.** Não existe "excluir lançamento". O único caminho para desfazer é o **estorno**, que exige motivo e cria um lançamento próprio — o engano fica visível no livro, junto com a correção.

---

## 6. Movimentações de estoque

Toda mudança de saldo do almoxarifado passa por um único motor e vira uma linha no **livro de movimentações** (tela **Almoxarifado → Movimentações**). Não existe caminho que altere saldo sem deixar linha: quem, quando, quanto, saldo antes e saldo depois.

### 6.1 A conta que governa tudo: físico × disponível

O sistema guarda dois números distintos para cada material:

| Número | O que é |
|---|---|
| **Físico** | Tudo o que pertence à empresa naquele material, esteja onde estiver |
| **Disponível** | O que pode sair agora, para qualquer finalidade nova |

A fórmula é sempre esta, e vale em todas as telas:

```
Disponível = Físico − Reservado − Bloqueado − Em inspeção − Em poder de terceiros
```

| Parcela | O que significa | O material está no prédio? |
|---|---|---|
| **Físico** | tudo que é patrimônio da empresa naquele material | — |
| **Reservado** | separado para uma OS, projeto ou requisição aprovada (seção 9) | **sim** |
| **Bloqueado** | reprovado na inspeção ou bloqueado por decisão da qualidade (seção 15) | **sim** |
| **Em inspeção** | entrou retido aguardando decisão da qualidade (14.6) | **sim** |
| **Em poder de terceiros** | enviado para beneficiamento externo (seção 17) | **não** |

As três primeiras deduções são **estados administrativos de material que está na prateleira**. A quarta é a única que significa **"não está no prédio"**. Guardar essa distinção é o que faz a contagem de inventário funcionar (seção 13).

O **cartão "Disponível"** que aparece no extrato do material já é essa conta pronta. As consequências dessa fórmula em todo o resto do sistema — quem compara contra o disponível, o que continua valendo dinheiro — estão reunidas em 21.1.

Lembre-se, ao ler qualquer saldo, da regra permanente enunciada em 3.1: **o saldo de um material é um só**, somado em todas as áreas do almoxarifado, porque as áreas são do mesmo site.

#### Saída sem saldo — e a única forma de permiti-la

Por padrão, **uma saída maior que o disponível é recusada**, e o sistema diz quanto há:

> *"Saldo insuficiente. Disponível: 8 UN"*

Isso vale para todo tipo de saída, e a recusa acontece no servidor — não adianta a tela deixar digitar.

Permitir saldo negativo é uma decisão **global**, tomada em **Configurações → Configurações Gerais**, na opção *Permitir Saída com Saldo Negativo*. Ela é restrita ao Administrador do módulo e vale para **todos** os materiais — não há como liberar saldo negativo para um material só.

Ligá-la significa aceitar que o estoque do sistema pode ficar abaixo de zero. Isso só faz sentido quando a empresa sabe que o lançamento de entrada vai chegar atrasado — **não** é a forma de contornar divergência de contagem. Para divergência de contagem, o caminho é o inventário (seção 13) ou um Ajuste (6.2).

Uma configuração dessa tela só existe se houver alguém no sistema que a consulte; opções que não governam comportamento nenhum não são oferecidas ali.

### 6.2 Os tipos que o operador lança na tela

O formulário de **Nova Movimentação** oferece cinco tipos:

| Tipo na tela | O que faz com o saldo | Campos que aparecem |
|---|---|---|
| **Entrada** | Soma ao físico | Localização de destino, Lote, Custo unitário, Séries |
| **Saída** | Subtrai do físico | Localização de origem, Lote (seletor), Séries, Saída emergencial |
| **Transferência** | **Não altera o físico** — move de uma localização para outra | Origem **e** destino, Lote (seletor) |
| **Ajuste** | Define o físico por um **valor absoluto** (o campo passa a se chamar "Novo Saldo") | Localização de destino (opcional) |
| **Perda** | Subtrai do físico | Localização de origem, Lote (seletor) |

**Sucata não está na lista, e não é falta.** Baixar material como sucata exige **duas aprovações
de pessoas diferentes**, e por isso tem processo próprio, na tela **Sobras e Retalhos** — a
seção 20 descreve o caminho completo. O livro de Movimentações continua **exibindo** os
lançamentos de sucata; só o formulário não os cria.

Pontos técnicos importantes:

- **Ajuste é absoluto, não incremental.** Digitar 40 num material que tem 100 leva o saldo a 40. Por isso o rótulo do campo muda para "Novo Saldo" quando o tipo é Ajuste.
- **Ajuste com localização escolhida** zera/redefine **aquela** localização e recalcula o total do material pela soma das prateleiras. É o único tipo que aceita quantidade **zero** — justamente para permitir "esta prateleira está vazia". Em qualquer outro caso, quantidade 0 é recusada com *"quantidade deve ser maior que zero"*.
- **Perda é saída de verdade** para o motor: baixa o físico, respeita controle de lote e a situação do lote. O que a diferencia da Saída comum é que ela **é isenta da trava de vencimento** — assim como a sucata, que passa pela mesma isenção quando a baixa dela sai pelo processo de sucateamento: é assim que um lote vencido consegue sair do sistema (4.3).

### 6.3 Outros movimentos que o sistema gera sozinho

Além dos cinco do formulário, o livro registra movimentos criados pelas telas especializadas. Eles **não podem** ser lançados pelo formulário genérico — a tela de Movimentações recusa, e a mensagem depende do tipo. Para os tipos de retenção, a recusa é *"tipo de movimentação não permitido nesta rota (tipos de reserva, bloqueio e inspeção só podem ser criados pelas telas de Reservas e Inspeções)"*. Para os tipos que têm processo próprio, a recusa **ensina o caminho certo** — para Sucata: *"tipo de movimentação não permitido nesta rota — sucatear é um processo com dupla aprovação — use Almoxarifado → Sobras e Retalhos → aba Sucateamentos"*; para Entrada (retalho): *"tipo de movimentação não permitido nesta rota — retalho nasce pelo botão Gerar retalho, em Almoxarifado → Sobras e Retalhos"* (devolução ao cliente, perda/consumo no terceiro e retorno de transformação têm recusas equivalentes apontando para Materiais de Clientes e Remessas a Terceiros).

| Movimento | Nasce em | Efeito |
|---|---|---|
| Reserva / Liberação de reserva | Reservas, aprovação de requisição | Mexe só no **Reservado** |
| Bloqueio / Desbloqueio | Inspeções | Mexe só no **Bloqueado** |
| Quarentena / Decisão de inspeção | Recebimento e Inspeções | Mexe no **Em inspeção** (e no Bloqueado, quando reprova) |
| Entrada de devolução | Devoluções | Soma ao físico |
| Remessa / Retorno de terceiro | Remessas a Terceiros | Mexe só no **Em poder de terceiros** |
| Entrada (retalho) | Sobras e Retalhos → Gerar retalho | Soma ao físico do material-retalho, **sempre sem custo** (seção 19) |
| Sucata | Segunda aprovação de um sucateamento (seção 20) e devolução com destino Sucata (12.6) | Subtrai do físico |
| Estorno | Botão "Estornar" do livro | Lançamento reverso |

Essa separação é deliberada: cada um desses movimentos tem uma tela dona, com a permissão certa e um registro paralelo (a reserva, o item do recebimento, a inspeção, a remessa) que dá lastro ao número. Se a tela genérica os aceitasse, o número da coluna existiria sem nada por trás.

### 6.4 Quando o sistema exige **motivo** e quando exige **justificativa**

São dois campos com papéis diferentes.

**Motivo** é o campo do formulário. Ele é **obrigatório na tela** para Saída, Ajuste e Perda (o campo fica marcado com asterisco e o navegador não deixa enviar em branco).

**Justificativa** é a exigência do servidor, por tipo de movimento. Sem ela a operação é recusada com a mensagem *"&lt;TIPO&gt; exige justificativa"* — por exemplo, *"AJUSTE exige justificativa"*.

| Movimento | Exige justificativa? |
|---|---|
| Ajuste (e Ajuste positivo / negativo) | **Sim** |
| Sucata | **Sim** — o texto nasce na **solicitação do sucateamento** (seção 20) e é o que vai para o livro na baixa |
| Perda | **Sim** |
| Bloqueio / Desbloqueio | **Sim** |
| Reprovação / Decisão de inspeção | **Sim** |
| Remessa, Retorno, Perda e Consumo no terceiro | **Sim** |
| Entrada, Saída, Transferência | Não |

O raciocínio é uniforme: **todo movimento que muda a resposta à pergunta "onde está esse material?" ou "por que ele sumiu?" precisa da resposta escrita**. Tirar material do disponível sem dizer por que é baixa sem motivo.

### 6.5 Movimentação vinculada — quando o sistema exige que o movimento cite um documento

"Vínculo" é a amarração da movimentação a **Ordem de Serviço**, **Projeto** ou **Centro de Custo** — três campos de seleção na seção **Vínculo** do formulário (não é texto livre; existe também um campo "Referência (OS / NF)" que é livre e serve para anotação).

A regra é por tipo de movimento:

| Tipo | Vínculo exigido | Mensagem de recusa |
|---|---|---|
| Saída para produção, Saída para montagem, Saída para assistência | **OS ou Projeto** — obrigatoriamente um dos dois | *"SAIDA_PRODUCAO exige vínculo com OS ou projeto (ou use emergencial com justificativa)"* |
| Saída (genérica) | **Qualquer um**: OS, Projeto, Centro de Custo, justificativa ou referência | *"Saída exige OS, projeto, centro de custo ou justificativa"* |
| Transferência, Devolução ao cliente | Nenhum | — |
| Ajuste, Sucata, Perda, Bloqueio, Inspeção, Terceiros | Nenhum, mas **justificativa é obrigatória** (6.4) | — |

Por que a saída para produção é mais exigente: ela é a saída que vira **custo de alguém**. Sem OS ou projeto, o material sai do estoque e não entra em lugar nenhum — o custo desaparece.

### 6.6 Saída emergencial — o que ela fura e o que não fura

No tipo **Saída** existe o marcador **"Saída emergencial (regularizar depois)"**. Ao marcá-lo, a tela avisa: *"Será exigida justificativa; a movimentação ficará pendente de regularização"*.

**O que ela dispensa:** apenas a exigência de vínculo (OS/Projeto/Centro de Custo). Nada mais.

**O que ela continua exigindo, sem exceção:**

- **Justificativa** — sem ela a recusa é *"Movimentação emergencial exige justificativa"*;
- **Saldo disponível** — a guarda de saldo não é afetada;
- **Lote e número de série**, quando o material é controlado;
- **Permissão de movimentar**;
- **A guarda de propriedade de material de cliente.** Esta é a exceção deliberada: material que pertence a um cliente **não sai pela emergencial sem OS ou projeto daquele cliente**. Consumir material de outra empresa sem dizer onde não é problema de pressa, é problema contratual — a regra completa e a mensagem literal estão em 16.5.

**O que acontece depois:** a linha nasce marcada com o selo amarelo **PENDENTE REGULARIZAÇÃO** na coluna Vínculo do livro. Há um filtro para listar exatamente essas linhas, e a regularização consiste em informar OS, Projeto ou Centro de Custo depois do fato. Regularizar sem informar nada é recusado com *"Informe OS, projeto ou centro de custo para regularizar"*; uma movimentação já estornada não pode ser regularizada (*"Movimentação cancelada não pode ser regularizada"*).

### 6.7 As travas de saída, em ordem de verificação

O motor testa nesta ordem, e **nada de saldo é tocado até todas passarem**:

1. **Material inativo** → *"Material inativo não pode ser movimentado"*.
2. **Lote obrigatório**, se o material tem "Controle por lote" ligado → *"O material MAT-001 exige lote nesta movimentacao (controle por lote ligado)"*.
3. **Séries obrigatórias**, se o material tem "Controle por número de série" — a quantidade de séries informadas tem de ser exatamente igual à quantidade movimentada → *"material com controle de serie: informe 3 serie(s) para 3 unidade(s) — recebidas 2"*. E a quantidade tem de ser inteira → *"material com controle de serie exige quantidade inteira"*.
4. **Vínculo e justificativa** (6.4 e 6.5).
5. **Propriedade** — material de cliente só sai com OS ou projeto daquele cliente (16.4).
6. **Localização** — origem/destino bloqueada é recusada sempre: *"Localização A-01 está bloqueada"*. E uma localização pode restringir o tipo de material que aceita: *"Localização EPI não aceita o tipo de material 'Consumível'"* (essa restrição vale só para o **destino**, nunca para a origem — a política pode ter mudado depois que o material já estava lá).
7. **Situação do lote** — lote que não está Ativo não sai por caminho nenhum, nem para descarte: *"Lote L-001 esta bloqueado e nao pode ser utilizado"*. O caminho é resolver a situação na tela de Lotes e Séries primeiro.
8. **Vencimento do lote** — lote vencido **não sai para consumo**, mas **sai** pelas baixas de descarte: Perda ou Ajuste na tela de Movimentações, e a baixa de sucata pelo processo de sucateamento (seção 20) — senão ficaria preso para sempre. A recusa ensina as saídas possíveis: *"Lote L-001 vencido em 2026-01-31 nao pode sair para consumo. Libere o vencimento do lote (PUT /api/almoxarifado/lotes/:id/liberar-vencimento) com justificativa, ou baixe por SUCATA/PERDA ou corrija por AJUSTE."*
9. **Saldo disponível** → *"Saldo insuficiente. Disponível: 12 UN"*. O número na mensagem é o disponível real, não o físico.
10. **Bloqueio de qualidade** — se há quantidade bloqueada e a saída invadiria essa parte: *"Material bloqueado não pode ser utilizado"*.

A validação final de saldo acontece **no próprio comando que desconta**, e não numa leitura anterior: duas saídas simultâneas do mesmo material não conseguem consumir o mesmo saldo.

### 6.8 Custo na entrada

Quando a Entrada informa **Custo unitário**, o sistema recalcula a **média ponderada** do material e passa a tratar o valor informado como último custo de compra. O recebimento por nota fiscal alimenta a média pelo mesmo caminho. A fórmula, o arredondamento, o exemplo numérico e a lista completa do que alimenta e do que não alimenta o custo estão em 21.2.

Duas consequências que interessam a quem lança:

- **O estorno não reverte o custo médio.** Reverter uma média depois de movimentos intermediários é matematicamente mal definido; o caminho para corrigir é uma nova entrada com o custo certo.
- **O valor do estoque é sempre `físico × custo unitário`** — material reservado ou em inspeção continua sendo patrimônio e continua valendo dinheiro.

### 6.9 O extrato do material (o livro do item)

Clicar no nome do material — no livro de Movimentações ou no ícone "Extrato" da tela de Materiais — abre o **Extrato**, que é a ficha completa daquele item:

- **Cartões de saldo:** Físico, Reservado, Bloqueado, Em inspeção, **Disponível** e **Custo médio**. Em material com controle de série, aparece também **Séries em estoque**.
- **Saldos por localização:** em qual prateleira, de qual lote, quanta quantidade. Não há colunas de reservado/bloqueado aqui de propósito — **retenção não existe por localização**, ela é do material (ou do lote inteiro, por situação). Mostrá-la por prateleira sugeriria uma dimensão que o sistema não modela.
- **Últimas 100 movimentações:** data, tipo, quantidade, saldo posterior, motivo e vínculo.
- **Reservas ativas:** quantidade, quanto já foi utilizado, saldo, destino (OS/projeto), solicitante e prazos.

No **livro** (tela de Movimentações), a coluna Quantidade mostra o **sinal real** do movimento (+ ou −) calculado pela diferença entre saldo anterior e saldo posterior — e não pelo nome do tipo. Isso importa porque Transferência, Bloqueio, Reserva e Liberação **não mexem no físico** (aparecem sem sinal), e um Estorno pode ir em qualquer direção conforme o que reverte.

### 6.10 Estorno — o engano se desfaz, nunca se apaga

Movimentação errada **não é excluída**. O botão de estornar (seta curva) na coluna Ações cria um **lançamento reverso**: a linha original fica esmaecida com o selo **ESTORNADA** e uma linha nova do tipo Estorno entra no livro.

- **Motivo é obrigatório** → *"Justificativa obrigatória para cancelamento"*.
- Exige o perfil que pode **ajustar estoque** (mais restrito que o de movimentar).
- **Estorno de estorno não existe** → *"Estorno não pode ser estornado"*.
- **Estorno de entrada** vira uma saída, e por isso respeita o disponível: se a mercadoria já foi consumida, a recusa é *"Não é possível estornar: saldo disponível insuficiente (material já consumido)"*.
- **Duas pessoas estornando ao mesmo tempo:** só a primeira passa; a segunda recebe *"Movimentação já cancelada"*.

Há linhas que o livro **não estorna de propósito**, cada uma com a porta certa nomeada na mensagem:

| Linha | Mensagem |
|---|---|
| Reserva / Liberação de reserva | *"Use a liberação de reserva para desfazer reservas"* |
| Quarentena e decisões de inspeção | *"Movimento de inspeção não pode ser estornado pelo livro — use a tela de Inspeções para rever a decisão"* |
| Remessa / Retorno de terceiro | *"Movimento de remessa a terceiro não pode ser estornado pelo livro — use a tela de Remessas para cancelar ou encerrar a remessa"* |
| Qualquer movimentação gerada por uma requisição | *"Movimentação vinculada a requisição — use os fluxos da requisição (exclusão/encerramento)"* |

Em material com número de série há duas guardas a mais, ambas verificadas **antes** de qualquer alteração: não se estorna uma entrada cujas séries já saíram (*"estorno de entrada recusado: ha series desta entrada ja movimentadas — estorne as saidas primeiro"*), nem uma saída cujas séries já voltaram por outro caminho (*"estorno de saida recusado: series desta saida ja reentraram no estoque — a devolucao ja repos o material"*).

---

## 7. Requisições de material

A requisição é o pedido formal: alguém precisa de material, o almoxarifado separa e entrega. A tela é **Almoxarifado → Requisições**.

### 7.1 O ciclo completo

| Passo | Status resultante | Quem faz | Permissão exigida |
|---|---|---|---|
| Criar como rascunho | **Rascunho** | Solicitante | Requisitar |
| Enviar | **Pendente** (ou **Aguard. Aprov. Valor**) | **Só o solicitante** (ou administrador do sistema) | — |
| Aprovar | **Totalmente / Parcialmente Reservada**, ou **Aprovado**, ou **Aguard. Estoque / Aguard. Compra** | Outra pessoa, nunca o solicitante | Aprovar requisição |
| Rejeitar | **Rejeitado** | Aprovador — ou o próprio solicitante (desistência) | Aprovar requisição, dispensada para a própria |
| Separar | **Em Separação** | Almoxarifado | Separar e emitir |
| Liberar para retirada | **Pronta p/ Retirada** | Almoxarifado | Separar e emitir |
| Entregar | **Entregue** ou **Parcialmente Atendida** | Almoxarifado | Separar e emitir |
| Confirmar recebimento | (não muda o status — registra data e autor) | **Só o solicitante** | — |
| Encerrar | **Encerrada** | Quem aprova | Aprovar requisição |
| Cancelar | **Cancelado** | Solicitante ou administrador | — |

Os status e as passagens permitidas entre eles são fixos; qualquer tentativa fora do desenho é recusada com *"Transição inválida: PENDENTE → ENTREGUE"* (com os dois status reais na mensagem).

**Os três status que muita gente estranha:**

- **Aguard. Estoque** e **Aguard. Compra** — a requisição cai automaticamente num deles quando, na aprovação, **nenhum item** tem saldo disponível. Fica em *Aguard. Compra* quando já existe uma solicitação de compra pendente para algum dos materiais; caso contrário, *Aguard. Estoque*. Se ao menos um item tem disponível, ela segue o caminho normal.
- **Totalmente Reservada** / **Parcialmente Reservada** — é o estado **normal** de uma requisição recém-aprovada que encontrou saldo (seção 9).

### 7.2 Criação — o que o sistema valida

- **Ao menos um item** → *"Dados inválidos — itens: Inclua ao menos um item"*.
- **Quantidade maior que zero** em cada item → *"Dados inválidos — itens.0.quantidade: quantidade deve ser maior que zero"* (o número é a posição do item na lista). Vale igual para "Salvar Rascunho" e para "Enviar".
- **Material existente e ativo** → *"Material(is) inexistente(s) ou inativo(s): MAT-001, MAT-007"*.
- **Tipo da requisição** — 14 opções: Consumo, Ordem de Produção, Ordem de Serviço, Projeto, Montagem, Instalação Externa, Assistência Técnica, Manutenção, Desenvolvimento, Administrativo, Emergencial, Ferramenta, EPI e Material do Cliente. Sem escolha, assume **Consumo**.
- **Rascunho é do dono.** Só o solicitante envia o próprio rascunho: *"Apenas o solicitante pode enviar o rascunho"*; e só rascunho pode ser enviado: *"Apenas rascunhos podem ser enviados"*.

**Enviar é o gatilho de tudo.** Enquanto está em Rascunho, a requisição não dispara e-mail, não é avaliada pela alçada de valor e não é vista pelo almoxarifado. É o envio que a coloca em circulação.

Existe ainda **"Copiar como Novo Rascunho"**, que gera um rascunho novo com os mesmos itens, tipo e vínculos, sem as quantidades já entregues. A justificativa só é copiada quando o tipo é Emergencial.

### 7.3 Requisição emergencial — o que fura e o que não fura

Escolher o tipo **Emergencial** tem **um único efeito**: a **justificativa passa a ser obrigatória**. A tela barra antes de enviar com o aviso *"Justifique a requisição emergencial"*, e o servidor valida de novo com *"Dados inválidos — justificativa: Requisição emergencial exige justificativa"* — inclusive ao salvar como rascunho.

**O que ela NÃO fura:**

- não pula a aprovação;
- não dispensa a segregação (o solicitante continua não podendo aprovar a própria);
- não dispensa a aprovação por valor;
- não dá prioridade de saldo, não reserva antes de ninguém e não fura nenhuma trava de estoque.

> Não confundir com a **Saída emergencial** do formulário de Movimentações (6.6), que é outra coisa: aquela dispensa o vínculo com OS/Projeto e marca a linha como pendente de regularização.

### 7.4 O que o requisitante vê de saldo — disponibilidade, não quantidade

Quando o material é pedido pelo **catálogo por setor**, o requisitante **não vê números de estoque**. Ele vê uma etiqueta de disponibilidade:

| Etiqueta | Condição exata |
|---|---|
| **Em estoque** | estoque do material ≥ quantidade pedida |
| **Parcial** | estoque maior que zero, porém menor que a quantidade pedida |
| **Sem estoque** | estoque zerado ou negativo — e também quando o material não existe ou está inativo |

O catálogo do requisitante **remove** do retorno, um a um, os campos: quantidade atual, quantidade mínima, quantidade máxima, quantidade reservada, quantidade bloqueada, quantidade em inspeção, quantidade em poder de terceiros, custo unitário, custo médio, valor em estoque e quantidade disponível.

**Por que assim:** o catálogo existe para *pedir*, não para *administrar*. A etiqueta responde a única pergunta que interessa a quem pede — "dá para atender o que eu estou pedindo?" — sem expor posição de estoque e custo a quem não tem papel de estoque.

**Detalhe técnico que precisa ser dito:** a etiqueta é calculada sobre o **físico**, não sobre o disponível. Um material inteiramente reservado para outro projeto ainda aparece como **Em estoque** para quem está montando o pedido. Quem decide de verdade é a aprovação e a separação, que trabalham com o **disponível**.

### 7.5 Entrega — como o estoque baixa

A entrega informa a quantidade atendida por item e é o **único momento em que o material sai fisicamente**. Ela passa pelo mesmo motor de qualquer saída manual: auditoria, saldo por localização, localização bloqueada respeitada e a guarda de saldo.

Regras:

- Só é possível entregar a partir de **Em Separação**, **Pronta p/ Retirada** ou **Parcialmente Atendida** → *"Requisição deve estar em separação, pronta para retirada ou parcialmente atendida"*.
- O teto por item é `mínimo(pendente de entrega, separado ainda não entregue, disponível)`. Acima disso, a recusa **nomeia o material e mostra a conta**: *"Chapa 3mm: não é possível entregar 15 KG. Máximo: 8 (pendente: 15, disponível: 8)"*.
- Se nada foi informado → *"Informe ao menos uma quantidade maior que zero para entregar"*.
- Se todos os itens foram atendidos por completo, o status vira **Entregue**; senão, **Parcialmente Atendida**.

**O disponível usado aqui soma de volta a reserva da própria requisição** — o que a aprovação reservou é daquela requisição e não pode barrá-la (9.4).

### 7.6 Confirmação de recebimento, encerramento e cancelamento

- **Confirmar recebimento** é o testemunho do **próprio solicitante** de que o material chegou às mãos dele. **Não há atalho de administrador**: *"Apenas o solicitante pode confirmar o recebimento"*. Só vale nos status Entregue, Parcialmente Atendida e Encerrada (*"Confirmação de recebimento não permitida no status EM_SEPARACAO"*), e só uma vez (*"Recebimento já confirmado"*).
- **Encerrar** fecha a requisição de vez: cancela o saldo pendente e nenhuma entrega futura é aceita. Parte de Entregue ou Parcialmente Atendida, e exige o perfil de aprovação — *"Sem permissão para encerrar requisições"*. O motivo é opcional — contraste deliberado com a rejeição, onde ele é obrigatório.
- **Cancelar** é do solicitante (ou de administrador do sistema): sem permissão, *"Sem permissão"*; em status que não aceita, *"Não é possível cancelar neste status"*. Cancelar **libera as reservas** daquela requisição.
- **Excluir** uma requisição **estorna as entregas já feitas** (devolve ao estoque, com linha no livro) e **libera as reservas** que ela ainda segurava. É restrito a administradores do almoxarifado ou super administrador: *"Apenas administradores do Almoxarifado ou Super Administrador podem excluir requisições"*.

---

## 8. Aprovações

### 8.1 Segregação de funções — quem pede não aprova

**Quem criou a requisição não pode aprová-la**, mesmo tendo o perfil de aprovador, mesmo sendo administrador. A recusa é *"Solicitante não pode aprovar a própria requisição"*, e vale nas **duas vias** de aprovação: a comum e a aprovação por valor.

São **duas checagens independentes e cumulativas**:

1. **Perfil** — a ação "aprovar requisição" pertence a **Administrador, Almoxarife e Gestor**.
2. **Segregação** — nem quem tem o perfil aprova a própria.

**A rejeição é o oposto e isso é deliberado:** rejeitar a **própria** requisição é **desistência**, decisão legítima de quem pediu — qualquer perfil pode. Rejeitar a requisição de **outra pessoa** é decisão de aprovação e exige o perfil: *"Sem permissão para rejeitar requisição de outro solicitante"*.

### 8.2 Rejeição justificada

O **motivo é obrigatório**: *"Dados inválidos — motivo: Motivo da rejeição é obrigatório"* — e o botão de confirmar no modal fica desabilitado até o campo ser preenchido. Só requisição **Pendente** pode ser rejeitada: *"Apenas requisições pendentes podem ser rejeitadas"*. O motivo fica gravado na requisição e na auditoria, com autor e data.

### 8.3 Aprovação por valor (alçada)

É uma segunda barreira, **independente** da aprovação comum, configurada em **Almoxarifado → Configurações**. Ela tem três parâmetros:

| Parâmetro | O que faz |
|---|---|
| **Ativo** | Liga ou desliga a alçada. Desligada, nada muda |
| **Limite (R$)** | Valor acima do qual a requisição trava |
| **Aprovadores** | Lista nominal de usuários que podem liberar |

**Como o valor é calculado — a fórmula:**

```
valor_total = Σ (quantidade solicitada do item × custo unitário do material)
```

arredondado em 2 casas. E o **custo unitário do material** obedece à regra única de leitura de custo do módulo (21.2):

```
custo = custo_médio, quando o custo médio for MAIOR QUE ZERO
        senão, custo_unitário do cadastro
```

Repare que o teste é **"maior que zero"**, não "preenchido". Materiais que nunca receberam entrada com custo têm média zero, e nesses o valor sai pelo custo do cadastro.

**Quando dispara:** `alçada ativa E valor_total > limite`. Estritamente maior — valor exatamente igual ao limite passa.

**O que acontece:**

1. Ao enviar, a requisição vai para **Aguard. Aprov. Valor** em vez de Pendente, e os aprovadores configurados recebem e-mail.
2. Separação e entrega ficam bloqueadas enquanto isso: *"Requisição aguardando aprovação de valor (R$ 12.400,00). Um aprovador autorizado deve liberar antes da separação ou entrega."*
3. Se o valor da requisição **subir** depois (itens alterados) e ultrapassar o limite sem ter sido liberada antes, ela volta a travar na tentativa de separar/entregar: *"Valor total (R$ 12.400,00) excede o limite de liberação automática (R$ 10.000,00). Aprovação de alto valor necessária."*
4. **Quem pode liberar:** os usuários da lista configurada, mais o administrador do sistema. Fora disso: *"Sem permissão para aprovar liberação por valor"*. A segregação continua valendo — o solicitante não libera a própria, ainda que esteja na lista.
5. Só requisição nesse status pode ser liberada ou reprovada: *"Apenas requisições aguardando aprovação de valor podem ser liberadas"* / *"Apenas requisições aguardando aprovação de valor podem ser reprovadas"*.
6. **A liberação por valor reserva o estoque**, exatamente como a aprovação comum (9.3). O solicitante é notificado por e-mail da liberação ou da reprovação, com o motivo.

Reprovar por valor rejeita a requisição. Aqui **não há segregação**: o solicitante pode desistir da própria mesmo sendo aprovador de valor.

> Note que a lista de aprovadores de valor é **nominal** (usuários escolhidos um a um na configuração), e não um perfil. Ela não se confunde com a permissão "aprovar requisição", que é por perfil. O administrador do sistema sempre pode liberar por valor.

### 8.4 Aprovação automática

Existe ainda uma configuração de **aprovação automática**. Com ela ligada, a requisição enviada é aprovada na hora, com o aprovador registrado como **"Sistema (automático)"**.

Duas ressalvas:

- **Urgência "Crítico" nunca é auto-aprovada** — justamente a que mais chama atenção precisa de olho humano.
- A aprovação automática **só corre depois** da alçada por valor. Requisição que caiu em *Aguard. Aprov. Valor* não é auto-aprovada.

> As regras de aprovação em vigor são estas — **segregação**, **limite por valor** e **aprovação automática**. Não existe hoje configuração de regras por tipo de material, quantidade ou projeto.

---

## 9. Reservas

Reservar é **separar no sistema** antes de separar na prateleira: o material continua fisicamente lá, mas deixa de estar disponível para outra pessoa levar. A tela é **Almoxarifado → Reservas**.

### 9.1 O que a reserva faz com o saldo

A reserva **não move nada**: ela soma na coluna **Reservado** do material. Como o disponível subtrai o reservado (6.1), o efeito prático é: **o físico fica igual, o disponível cai**.

O hold é criado com validação **no próprio comando**: reservar mais do que o disponível é recusado com *"Saldo disponível insuficiente: 8"*. Isso importa porque reserva acima do físico seria uma reserva **impossível de consumir** — o consumo também exige saldo físico.

Outras recusas: sem o perfil, *"Sem permissão para reservar"*; quantidade zero ou negativa, *"Quantidade da reserva deve ser maior que zero"*.

**Quem pode reservar:** Administrador, Engenharia, Produção e Almoxarife.

**A reserva é sempre do material**, nunca de um lote ou de um número de série específico. Ela garante *quanta* quantidade fica separada para aquele destino, não *qual peça*.

### 9.2 Os status da reserva

| Status | Significado |
|---|---|
| **ATIVA** | Segurando saldo |
| **CONSUMIDA** | Toda a quantidade foi entregue contra ela — vira automaticamente ao zerar |
| **LIBERADA** | Alguém soltou (manualmente, ou por cancelamento/exclusão da requisição) |
| **EXPIRADA** | O prazo venceu e o processamento de expiração a soltou |

Uma reserva **Consumida volta a Ativa** quando a saída que a consumiu é estornada — o material voltou ao estoque, e o hold que existia por trás dele volta a existir. É a única volta atrás possível; Liberada e Expirada são estados finais.

Na tela, cada linha mostra **três números diferentes** e é preciso saber ler os três:

- **Reservado** — o total original;
- **Consumido** — o que a entrega já baixou;
- **Saldo** — `Reservado − Consumido`, o que **ainda** está preso. É este que importa.

Reservas nascidas de requisição aparecem com a etiqueta **REQ #número**; as feitas à mão aparecem como **MANUAL**.

### 9.3 Reserva automática na aprovação

Ao aprovar uma requisição, o sistema percorre os itens e, para cada um, reserva:

```
a reservar = mínimo(quantidade ainda pendente de entrega, disponível do material)
```

As reservas são criadas **uma a uma**, relendo o disponível a cada uma — dois itens do mesmo material não reservam o mesmo saldo duas vezes.

O status final da requisição sai daí:

| Resultado | Status da requisição |
|---|---|
| Todo item pendente saiu com o pedido **inteiro** reservado | **Totalmente Reservada** |
| Alguma coisa foi reservada, mas não tudo | **Parcialmente Reservada** |
| Nada foi reservado | Mantém **Aprovado**, **Aguard. Estoque** ou **Aguard. Compra** |

**Falhar em reservar não derruba a aprovação.** A decisão de aprovar já foi tomada e é independente de haver saldo — é exatamente o caso "Aguard. Estoque". No pior cenário a requisição fica sem hold e a separação disputa o disponível como qualquer outra saída.

### 9.4 Consumo contra reserva

Esta é a regra que faz a reserva ser útil em vez de virar armadilha. Uma saída pode **citar a reserva**; nesse caso ela consome o que já estava separado para ela e **não é barrada pelo disponível** — o disponível justamente exclui o reservado.

O que é validado, tudo no mesmo momento e de forma indivisível:

1. A reserva existe e é daquele material → *"Reserva não encontrada para este material"*;
2. Está **ATIVA** → *"Reserva consumida não pode ser consumida"* (com o status real na mensagem);
3. Tem saldo suficiente → *"Quantidade acima do saldo da reserva: 4 UN"*;
4. O material tem saldo **físico** para a baixa → *"Saldo físico insuficiente para consumir a reserva. Disponível: 2 UN"*.

Ao consumir, o físico **e** o reservado baixam juntos, no mesmo instante. **Reserva que zera vira CONSUMIDA automaticamente** — não fica ATIVA segurando saldo nenhum.

**Na entrega de requisição isso é automático e pode ser dividido:** se a entrega pedir mais do que a reserva tem, o excedente sai pelo caminho normal (validado contra o disponível) e a parte reservada é consumida citando a reserva. O excedente é processado **primeiro**, porque é o único que disputa saldo com o resto da empresa — se vai falhar, falha antes de mexer na reserva.

### 9.5 Transferência de reserva entre projetos

O ícone de setas troca o **destino** da reserva (projeto, OS, referência de OS ou cliente).

**Nenhum saldo é tocado — de propósito.** A quantidade continua no estoque e continua reservada; muda só para quem o hold aponta. Liberar e reservar de novo seria pior: abriria uma janela em que outra saída poderia levar o material no meio do caminho.

- **Só reserva ATIVA** pode ser transferida → *"Somente reserva ATIVA pode ser transferida (status atual: CONSUMIDA)"*. Liberada e Expirada já devolveram o saldo (transferir daria a impressão de que o novo projeto tem material separado); Consumida é fato passado — reescrever o dono falsificaria o consumo já registrado.
- É preciso informar ao menos um destino → *"Informe ao menos um destino: projeto_id, os_id, os_referencia ou cliente_id"*.
- Exige o perfil **reservar para outra OS** (Administrador e Gestor), mais restrito que o de reservar.
- A troca fica na auditoria, com o destino antigo e o novo.

### 9.6 Liberação

Liberar devolve ao disponível o que a reserva ainda segura. Pode ser **total** (a reserva vira LIBERADA) ou **parcial** (só aquela parte volta, e a reserva continua ATIVA com o saldo reduzido).

- Só reserva ATIVA pode ser liberada → *"Reserva liberada não pode ser liberada"*.
- Não se libera mais do que resta → *"Quantidade acima do saldo da reserva: 6"*.
- Quantidade zero ou negativa → *"Quantidade a liberar deve ser maior que zero"*.
- **A tela exige o motivo** antes de enviar (*"Informe o motivo da liberação"*), e ele fica gravado junto com **quem liberou e quando** — na própria reserva e no livro.
- Ao liberar uma reserva nascida de requisição, a tela avisa antes: *"Esta reserva pertence à requisição #N. Liberar devolve o saldo ao disponível geral e a entrega dessa requisição volta a disputar estoque com as demais."*

**Liberação automática:** **cancelar** ou **excluir** uma requisição solta todas as reservas ativas que ela criou. Isso é essencial porque a expiração é opcional (9.7) — sem essa liberação, o saldo ficaria preso a uma requisição morta para sempre.

### 9.7 Expiração

A expiração é **opcional** e roda por acionamento — o botão **Processar expiração**, restrito ao administrador.

- Uma reserva só expira se tiver **data de validade**. Ela vem de um valor informado na criação da reserva ou é calculada a partir da configuração de dias de validade de reserva. **Sem nenhum dos dois, a reserva nunca expira.**
- O vencimento é **no dia seguinte** à data: a data gravada é o último dia válido do hold.
- Ao expirar, o saldo volta ao disponível e a reserva fica **EXPIRADA** — e não *Liberada*. "Venceu sozinha" e "alguém soltou" são fatos diferentes no relatório.
- O processamento é seguro para repetir: rodar duas vezes não devolve saldo em dobro, e uma reserva problemática não interrompe o processamento das demais.

---

## 10. Separação e entrega

Separação é a etapa em que o almoxarifado **junta fisicamente** o material da requisição. Ela é executada por quem tem a permissão **separar e emitir** (Administrador e Almoxarife).

### 10.1 O que a tela mostra

A separação não tem tela própria: ela acontece **dentro da requisição**. Ao abrir uma requisição aprovada, o almoxarifado vê um **passo a passo** no topo (Criar → Aprovar → Separar → Retirada → Entregar → Encerrar), um aviso do que fazer agora, e os botões da etapa.

Os avisos por situação são estes:

| Situação | Aviso na tela |
|---|---|
| Aprovado | *"Próximo passo: separe os materiais (máximo disponível em estoque) e confirme a entrega."* |
| Totalmente Reservada | *"Todo o saldo desta requisição está reservado — inicie a separação."* |
| Parcialmente Reservada | *"Parte dos itens não tinha saldo e ficou sem reserva — separe o que está reservado e acompanhe a reposição do restante."* |
| Aguard. Estoque | *"Sem saldo disponível no momento — inicie a separação assim que o estoque for reposto."* |
| Aguard. Compra | *"Sem saldo disponível — há uma solicitação de compra em andamento para os materiais desta requisição."* |

Os botões, na ordem do fluxo: **Iniciar Separação** (que vira **Ajustar Separação** quando a separação já começou), **Liberar para Retirada** — que só aparece se algum item tem quantidade separada — e **Confirmar Entrega e Baixar Estoque**. Sem nada separado, no lugar do botão de entrega a tela informa: *"Nenhuma quantidade separada disponível para entrega no momento."*

No modal de separação, cada item mostra **Solicitado · Já separado · Saldo**, com o campo de quantidade limitado ao saldo. No modal de entrega, cada item mostra **Solicitado · Separado · Entregue · Pendente · Saldo**, e a tela antecipa o resultado: *"Será entregue: 8 UN | Permanecerá pendente: 4 UN"*.

O "Saldo" mostrado é o **disponível do material somado ao que a própria requisição já reservou** — o que a aprovação reservou é dela e não pode barrá-la.

### 10.2 Iniciar separação

Registra a quantidade separada por item e leva a requisição para **Em Separação**.

- Pode começar a partir de **Aprovado**, **Aguard. Estoque**, **Aguard. Compra**, **Totalmente Reservada**, **Parcialmente Reservada**, **Em Separação** (repetir) e **Parcialmente Atendida**. Fora disso: *"Requisição deve estar aprovada, aguardando estoque/compra, em separação ou parcialmente atendida para separar"*.
- O teto por item é `mínimo(pendente de separação, disponível)`. Acima disso a recusa mostra a conta inteira: *"Chapa 3mm: não é possível separar 20 KG. Máximo: 12 (pendente: 20, disponível: 12)"*.
- A aprovação por valor é verificada aqui também: requisição travada por alçada não separa (8.3).

### 10.3 Liberar retirada

Leva de **Em Separação** para **Pronta p/ Retirada** — o aviso de que o material está no balcão.

- Exige **ao menos um item com quantidade separada** → *"Nenhum item separado"*.
- Transição fora do desenho é recusada com *"Transição inválida: ..."*.

### 10.4 Em que momento o saldo realmente sai

Esta é a pergunta mais importante do capítulo, e a resposta é: **na entrega, e só nela**.

| Etapa | Físico | Reservado | Disponível |
|---|---|---|---|
| Aprovação | igual | **sobe** | **cai** |
| Separação | igual | igual | igual |
| Liberar retirada | igual | igual | igual |
| **Entrega** | **cai** | **cai** (consome a reserva) | igual (já tinha caído na aprovação) |

Ou seja: **o disponível cai na aprovação** (pela reserva) e **o físico cai na entrega**. A separação não mexe em saldo nenhum — ela registra o trabalho de campo e prepara a entrega. Quem espera ver o estoque baixar ao separar vai achar que o sistema não funcionou; ele funcionou, e o material já estava protegido desde a aprovação.

---

## 11. Transferências entre localizações

Transferir é **mudar o endereço** de um material dentro do almoxarifado — da prateleira A-01 para a B-02, por exemplo.

### 11.1 Por que fica dentro do formulário de Movimentação, e não em tela separada

Porque **a transferência é uma movimentação origem → destino**, e o formulário de Movimentações já tinha 90% dela: material, quantidade, motivo, seleção de lote, localização de origem e localização de destino. Criar uma tela dedicada duplicaria os mesmos campos, com as mesmas validações, para divergirem na primeira mudança. Escolher **Transferência** no seletor de Tipo faz aparecerem **origem e destino ao mesmo tempo** — a única diferença visível em relação a uma saída comum.

### 11.2 O que ela exige

| Exigência | Recusa |
|---|---|
| Origem **e** destino, os dois | *"Transferência requer origem e destino"* |
| Saldo suficiente **na localização de origem** | *"Saldo insuficiente na localização de origem"* |
| **Lote**, quando o material tem "Controle por lote" ligado | *"O material MAT-001 exige lote nesta movimentacao (controle por lote ligado)"* |
| Nenhuma das duas localizações bloqueada | *"Localização B-02 está bloqueada"* |
| O destino aceitar aquele tipo de material | *"Localização EPI não aceita o tipo de material 'Consumível'"* |

Note que a transferência **exige saldo na origem sempre**: não faz sentido tirar de uma prateleira o que não está nela.

**Vínculo e justificativa não são exigidos.** Mover material de prateleira é rotina, e operador obrigado a justificar rotina escreve "ok". O campo de motivo existe e é opcional; o que for escrito vai para o livro.

### 11.3 O que ela NÃO verifica — de propósito

**Situação do lote e vencimento do lote não são verificados na transferência.** No seletor de lote da Transferência, **todos** os lotes ficam selecionáveis: bloqueado, reprovado, vencido.

O motivo é prático e direto: **é exatamente assim que um lote reprovado vai parar na área de bloqueados.** Se a transferência checasse a situação, o material condenado ficaria preso na prateleira de produção sem nenhuma forma de ser levado para a área de segregação — a trava impediria justamente a operação que existe para resolver o problema.

O contraste é fácil de demonstrar: no mesmo material, mudando o tipo de **Transferência** para **Saída**, os mesmos lotes aparecem **desabilitados**, com o motivo escrito ao lado. A trava está onde deve estar — no **consumo**, não no **transporte**.

### 11.4 O que ela faz com o saldo

**A transferência não altera o total do material.** Ela debita a linha de saldo da origem e credita a do destino. No livro, a linha aparece **sem sinal** de + ou −, porque saldo anterior e saldo posterior são iguais. No extrato, o que muda é a tabela **Saldos por localização**.

> O número de série é o único aspecto que a transferência não acompanha: o vínculo da peça serializada a uma localização é informativo; o saldo real, que a transferência move corretamente, é o que vale.

---

## 12. Devoluções ao estoque

Material entregue que volta ao almoxarifado é registrado em **Almoxarifado → Devoluções** — não pelo formulário de Movimentações. A diferença é o que a tela de Devoluções guarda e o formulário genérico não guardaria: **de qual entrega** o material está voltando, em **que condição**, com **que destino** e de **qual lote**.

> **Não confundir** com a devolução **ao cliente** (16.7), que é o caminho oposto: lá o material sai do prédio de volta para o dono. Aqui ele volta para o estoque depois de ter sido entregue.

### 12.1 O formulário começa pelo material

A tela pede **primeiro o material**, e só depois oferece as entregas. É deliberado: pela requisição não se alcançaria a **saída manual** — material entregue no balcão, sem requisição, também precisa poder voltar.

Campos: material, quantidade, **motivo** (obrigatório), condição, destino, entrega de origem (opcional), lote e séries. Sem motivo, a tela barra antes de enviar: *"Informe o motivo da devolução"*; o servidor confere de novo com *"material_id, quantidade e motivo são obrigatórios"*.

**Motivos:** Sobra de projeto, Não utilizado, Item errado, Danificado, Recuperável, Sucata.

**Condições:** Boa, Suspeita, Danificada. A condição **sugere** um destino (Boa → Estoque, Suspeita → Quarentena, Danificada → Sucata), mas **não determina**: trocar o destino depois de escolher a condição mantém a sua escolha. Uma regra rígida criaria um caso sem saída — material bom que precisa ir para inspeção por outro motivo.

### 12.2 Citar a entrega original — opcional, mas validado

O vínculo com a saída original é **opcional**. Sem ele, é uma **devolução avulsa** — o caminho para sobra antiga ou material entregue antes de o sistema existir. Nesse caso não há teto de quantidade nem lote a herdar.

Quando a entrega **é** citada, o sistema valida quatro coisas, cada uma com a recusa específica — uma mensagem genérica de "saída inválida" deixaria o operador sem saber se errou o material, se a entrega foi estornada ou se já devolveu tudo:

| Verificação | Recusa |
|---|---|
| A entrega existe | *"Movimentação de saída 12 não encontrada"* |
| A entrega não foi estornada | *"A saída 12 foi cancelada (estornada) — o estorno já devolveu o material"* |
| É do mesmo material | *"A saída 12 é de outro material"* |
| É de um tipo devolvível | *"A movimentação 12 é do tipo SUCATA e não é uma entrega devolvível (devolvíveis: SAIDA, SAIDA_PRODUCAO, SAIDA_MONTAGEM, SAIDA_ASSISTENCIA)"* |

Só quatro tipos de saída são devolvíveis: **Saída**, **Saída para produção**, **Saída para montagem** e **Saída para assistência**. **Sucata, Perda e Ajuste negativo ficam de fora de propósito** — não se devolve o que foi descartado nem o que foi acertado por ajuste. A lista de entregas oferecida na tela usa exatamente o mesmo filtro, para a tela nunca oferecer algo que o servidor vai recusar.

### 12.3 O teto: quanto ainda pode ser devolvido

A conta é:

```
saldo devolvível = quantidade da entrega − soma de tudo que já foi devolvido citando aquela entrega
```

Devoluções parciais **somam**: de uma entrega de 10, devolver 6 e depois 4 cabe; 6 e depois 5, não.

Acima do teto, a recusa **diz o número** — sem ele o operador teria de adivinhar:

> *"Devolução acima do entregue: a saída 1 entregou 10, já foram devolvidos 4 e restam 6"*

A tela mostra o mesmo número antes de enviar e barra localmente: *"Esta entrega ainda aceita 6 de devolução"*. As duas pontas usam **a mesma conta, sobre a mesma lista de tipos e o mesmo filtro de estorno** — se divergissem, a tela ofereceria devolver 6 e o servidor responderia que só cabem 4, sem o operador ter como saber quem está certo.

**O teto não distingue destino:** devolver 3 para Sucata consome os mesmos 3 do devolvível daquela entrega que uma devolução ao Estoque consumiria. O teto mede *quanto daquela entrega já voltou*, não *para onde voltou*.

Uma entrega **já devolvida por inteiro continua aparecendo na lista**, com saldo 0 e desabilitada. Escondê-la faria o operador procurar uma entrega que o sistema decidiu não mostrar. A lista traz as **30 entregas mais recentes** daquele material — quem devolve devolve o que saiu há pouco.

> Uma devolução **recusada não deixa registro**. Isso não é detalhe: uma linha fantasma contaria no "já devolvido" e encolheria **permanentemente** o devolvível daquela entrega.

### 12.4 Herança de lote

Em material com "Controle por lote":

- **Com entrega citada**, o lote é **herdado da entrega** — o campo aparece em modo leitura, com o rótulo "Lote (herdado da entrega)", sem seletor. Não há o que escolher: o material voltou do lote de onde saiu.
- **Sem entrega citada** (avulsa), o lote é escolhido no seletor. Sem escolher, a tela barra: *"Material com controle por lote: informe de qual lote é a devolução"*.
- Um lote informado à mão **ganha** do herdado.
- Em material **sem** controle de lote, nada é herdado — herdar criaria linhas de saldo quebradas por lote que ninguém pediu.

### 12.5 Reativação de série

Devolver ao **Estoque** ou à **Quarentena** faz cada peça serializada voltar de **Entregue** para **Em estoque**, com o vínculo à saída original desfeito.

- A quantidade de séries marcadas tem de bater com a quantidade devolvida: *"Material com controle de série: informe 1 número(s) de série para 1 unidade(s) devolvida(s) — recebidos 0"*.
- **Nos destinos Sucata e Retrabalho não é possível informar série**, e a recusa **ensina o caminho** em vez de apenas negar: *"Devolução com número de série não é suportada no destino SUCATA. Devolva ao estoque e, em seguida, registre a baixa na tela Movimentações, que tem seletor de série."*
- Atenção à distinção: a limitação é *"não dá para informar a série aí"*, e **não** *"peça serializada não pode ir para sucata"*. Sem marcar série nenhuma, a devolução para Sucata continua passando normalmente.

### 12.6 Os destinos possíveis e o que cada um faz com o saldo

| Destino | O que acontece no saldo | O que aparece no livro |
|---|---|---|
| **Estoque** | Volta ao **físico** e ao **disponível** | Entrada de devolução |
| **Quarentena** | Volta ao **físico**, mas **não ao disponível** — fica bloqueado até a inspeção decidir | Entrada de devolução **+** Bloqueio |
| **Sucata** | **O saldo não muda**: entra e sai | Entrada de devolução **+** Sucata |
| **Retrabalho** | **Não altera saldo nenhum** | Apenas a linha de retrabalho |

O destino **Sucata** merece explicação, porque o comportamento surpreende: o material devolvido para sucata **já tinha saído do estoque na entrega**. Lançar só a baixa descontaria de novo um saldo que nunca voltou. Por isso ele **entra e sai** — o saldo final fica correto e o livro conta as duas coisas: voltou, e foi sucateada.

Uma trava específica protege esse caminho: **sucata com lote bloqueado é recusada antes de mexer no estoque**, porque a entrada passaria e a baixa falharia, deixando o material dentro sem poder sair:

> *"Lote L-001 está bloqueado e não pode ser sucateado por devolução. Resolva o status do lote primeiro (tela Lotes e Séries) e repita a devolução."*

Toda devolução recebe uma referência própria no livro (no formato `DEV-<número>`), que amarra os lançamentos ao registro da devolução.

---

## 13. Inventário e conferência de estoque

A tela é **Almoxarifado → Conferências de Estoque**. Todo o fluxo exige a permissão de **inventário** (Administrador, Almoxarife e Gestor).

### 13.1 Como a contagem é montada

Ao criar uma conferência, o sistema gera um número (no formato `INV-…`) e **congela**, naquele instante, a quantidade esperada de **todos os materiais ativos** — opcionalmente filtrados por uma categoria. É uma contagem **por material**, não por prateleira.

Congelar é o ponto: a contagem compara o físico com o que o sistema achava **no momento em que a contagem começou**, não com um número que continua se movendo enquanto o operador anda pelo galpão.

### 13.2 O que o sistema considera "esperado" — e por quê

A fórmula é exatamente esta:

```
Qtd. Sistema = quantidade física − quantidade em poder de terceiros
```

**E só ela.** As outras três retenções — **reservado**, **bloqueado** e **em inspeção** — **continuam sendo cobradas** na contagem.

A razão é uma só, e vale a pena saber explicar:

| Situação | Está no prédio? | Entra no esperado? |
|---|---|---|
| Reservado para um projeto | **Sim**, na prateleira | **Sim** |
| Bloqueado pela qualidade | **Sim**, na área de bloqueados | **Sim** |
| Em inspeção / quarentena | **Sim**, aguardando decisão | **Sim** |
| Em poder de terceiros (galvanização, pintura, usinagem) | **Não** — está na empresa do fornecedor | **Não** |

"Bloqueado" é um **estado administrativo**, não uma ausência física — quem conta a prateleira vai esbarrar naquele material e tem de contá-lo. Já o material que foi para o beneficiador **não está lá para ser contado**: incluí-lo no esperado faria **toda contagem acusar uma diferença fantasma**, e o operador reduziria o saldo de material que existe e vai voltar.

> É a mesma distinção do disponível (6.1), mas com corte diferente — e por isso as duas contas não podem ser confundidas: **o disponível subtrai as quatro retenções; a contagem só pode subtrair uma.**

### 13.3 Contagem cega

Ao criar a conferência, o marcador **"Contagem cega"** decide se quem só tem permissão para
contar (perfil Almoxarife) vê a coluna "Qtd. Sistema" e a "Divergência" enquanto a contagem está
**Aberta**. Marcado, essas duas colunas ficam ocultas para quem não pode aplicar ajustes de
estoque; quem pode (Administrador, Gestor) sempre vê tudo, porque é quem vai decidir o ajuste.
Concluída ou cancelada, a conferência sempre mostra as colunas completas — é o registro
histórico, não faz sentido escondê-lo depois.

A blindagem é da **tela**, não do sistema inteiro: um usuário que também acessa a tela de
Materiais continua vendo o saldo lá. E a própria mensagem de recontagem (13.4) cita o percentual
de divergência — quem sabe quanto contou consegue calcular o número escondido fazendo a conta ao
contrário.

### 13.4 Contar

A tela lista, por linha: **Código**, **Material**, **Localização**, **Qtd. Sistema** (ou `—` em
modo cego, para quem não pode ajustar), **Qtd. Contada** (campo digitável), **Divergência** e
**Recontagem** (um aviso, quando se aplica — ver abaixo).

A divergência é calculada e gravada a cada item, assim que o campo perde o foco:

```
Divergência = quantidade contada − quantidade sistema
```

Positiva significa sobra física; negativa, falta. Contar o **mesmo item uma segunda vez** conta
como **recontagem** — não precisa dar o mesmo valor; a segunda contagem é a segunda chance, não
uma confirmação da primeira.

**Tolerância e recontagem obrigatória.** Cada conferência tem uma tolerância (%) — definida na
criação, ou o padrão configurado do módulo quando não informada. Um item cuja divergência
percentual (sobre a quantidade do sistema) passa da tolerância e **ainda não foi recontado**
bloqueia a conclusão da conferência **inteira** — com ou sem aplicar ajustes:

> `Recontagem necessária antes de concluir: <código> - <percentual>% (limite <tolerância>%)`

Recontar aquele item (mesmo dando o mesmo número) libera a conclusão.

Item sem contagem informada fica em branco e **não vira ajuste** — só entram na apuração os itens efetivamente contados.

### 13.5 Concluir — com ou sem aplicar ajustes

Ao concluir, existe o marcador **"Aplicar ajustes automáticos ao concluir (saldos com divergência serão corrigidos)"**. Ele muda tudo:

| Marcador | O que acontece |
|---|---|
| **Desmarcado** | A conferência fecha e as divergências ficam **apenas registradas**. Nenhum saldo muda |
| **Marcado** | Cada item divergente vira uma **movimentação de ajuste** de verdade no livro, com o motivo `Ajuste de conferência INV-…`, o número da conferência e a justificativa digitada |

**Marcar "aplicar ajustes" exige uma justificativa** (pelo menos 5 caracteres) — sem ela, a
recusa é imediata, antes de tocar em qualquer material:

> `Justificativa deve ter pelo menos 5 caracteres`

**A permissão é dupla:** fechar a contagem exige o perfil de **inventário**; **aplicar os ajustes** exige, **além disso**, o perfil que pode **ajustar estoque** (Administrador e Gestor). Sem ele, a recusa é *"Sem permissão para aplicar ajustes de estoque na conclusão do inventário"*.

Na prática: **o almoxarife conta o inventário, mas quem homologa a divergência no saldo é Administrador ou Gestor.**

**O ajuste é recusado se deixaria alguma retenção maior que o novo total** — reservado, bloqueado, em inspeção ou em poder de terceiros. A mensagem diz qual retenção pesa e o mínimo aceitável:

> `Ajuste bloqueado: <código>: Ajuste para <valor> <unidade> deixaria o disponível negativo (<retenção>: <valor>, mínimo aceitável: <valor> <unidade>). Resolva a retenção antes de ajustar para menos, ou ajuste para um valor maior ou igual ao mínimo.`

Se a divergência for de um material que pertence a um **cliente** e quem está concluindo não tem
a autorização especial para ajustar saldo de terceiro (16.8), a recusa é sobre isso — e tem
prioridade sobre a de retenção quando a mesma conferência tem os dois problemas:

> `Ajuste bloqueado — os seguintes materiais são de cliente e exigem a permissão "ajustar_material_cliente": <código> (<cliente>)`

**A aplicação é tudo ou nada.** Se qualquer item da conferência for recusado (por retenção ou por
permissão), **nenhum** ajuste é aplicado — nem os que passariam sozinhos — e a conferência
continua Aberta. Resolva o motivo da recusa (libere a retenção, peça a autorização) e conclua de
novo.

**Uma conferência só conclui uma vez.** Tentar concluir de novo uma que já está Concluída ou
Cancelada é recusado:

> `Conferência não está aberta (status atual: <status>)`

O aviso de sucesso mostra o **impacto financeiro** dos ajustes aplicados — a soma, em reais, de
cada item ajustado (valor absoluto: uma sobra de R$ 50 e uma falta de R$ 50 na mesma conferência
somam R$ 100 de impacto, não R$ 0 — é "quanto dinheiro este inventário movimentou", não um
líquido). Depois de aplicar, os alertas de estoque mínimo dos materiais afetados são reavaliados
automaticamente.

> Antes de homologar uma conferência com ajustes, leia a seção 23 — há cuidados de operação que
> continuam valendo mesmo com a guarda de retenção.

### 13.6 Cancelar

Uma conferência **Aberta** pode ser cancelada, e cancelar **não altera saldo nenhum**. Conferência já concluída não volta atrás: *"Só é possível cancelar conferências abertas"*.

Uma movimentação de ajuste de inventário, uma vez aplicada, **não pode ser estornada** pelo botão
de estorno do livro de Movimentações — ela representa uma contagem física já homologada, e
desfazê-la sem uma nova contagem apagaria o rastro de que a contagem aconteceu. O caminho de
correção é abrir uma **nova conferência**.

---

## 14. Recebimento de material

### 14.1 O que é um recebimento

Um recebimento é o documento que registra a chegada física do material no galpão. Ele nasce na tela **Almoxarifado → Recebimentos**, no botão **Novo Recebimento**, e pode ser criado de duas formas:

| Forma de recebimento | O que o sistema faz |
|---|---|
| **Pedido de compra** | Você informa o número do pedido; o sistema traz os itens, as quantidades e os valores unitários já preenchidos, e herda fornecedor e CNPJ do pedido |
| **Nota fiscal (sem pedido)** | Você informa a nota, o fornecedor e digita os itens um a um |

Se o pedido informado não existir, o sistema responde *"Pedido de compra não encontrado"*. Um recebimento sem nenhum item é recusado com *"Inclua ao menos um item"*.

### 14.2 O caminho do recebimento até o estoque

O recebimento percorre quatro etapas, e a tela mostra em qual delas ele está:

```
ALMOXARIFADO  →  COMPRAS  →  FATURAMENTO  →  CONCLUÍDO
```

| Situação | Significado | Botão que avança |
|---|---|---|
| RECEBIDO | Material chegou, ainda não conferido | Iniciar conferência |
| EM_CONFERENCIA | Conferência física em andamento | Finalizar conferência |
| CONFERIDO_ALMOX | Almoxarifado conferiu | Encaminhar para Compras |
| EM_COMPRAS | Compras validando preço/pedido | Encaminhar para Faturamento |
| ENCAMINHADO_FATURAMENTO | Fila do faturamento | Iniciar entrada de NF |
| EM_ENTRADA_NF | Dados fiscais sendo digitados | **Processar Nota — Estoque + Contas a Pagar** |
| PROCESSADO | Estoque creditado e conta a pagar gerada | — (final) |

Tentar pular etapa é recusado com a mensagem nomeando a situação atual — por exemplo *"Não é possível "processar" no status atual (EM_COMPRAS)"*.

**A entrada no estoque acontece em um único momento: no botão "Processar Nota".** Antes dele, o recebimento existe como documento, mas o saldo do material ainda não mudou.

### 14.3 O que é obrigatório para processar

O sistema só dá entrada quando os dados fiscais estão completos. Faltando qualquer um, ele recusa com *"Preencha antes de processar: …"* listando **todos** os que faltam de uma vez:

- número da nota fiscal;
- fornecedor (CNPJ ou nome);
- data de emissão da nota;
- data de entrada da nota;
- valor total da nota (tem de ser maior que zero).

Além disso, antes de mover qualquer saldo, o sistema verifica **item por item**:

| Verificação | Mensagem quando falha |
|---|---|
| Material precisa estar ativo | *"…: material inativo nao pode ser movimentado"* |
| Material de cliente exige número de documento | *"…: material do cliente ⟨razão social⟩ exige numero de documento (nota de remessa) para dar entrada"* |
| Material com controle de lote exige o campo Lote | *"…: preencha o campo Lote (o material tem controle por lote)"* |
| Material com controle de série exige um número de série por unidade | *"…: informe 10 serie(s) — recebidas 7"* |
| Material com controle de série não aceita quantidade quebrada | *"…: quantidade fracionaria com controle de serie"* |
| Localização de destino tem de aceitar aquele material | a razão específica da localização (3.4) |

Todas as recusas vêm juntas, dentro de uma frase única que começa com *"Nao foi possivel dar entrada no estoque:"*. **Nenhum item entra enquanto houver um item com problema** — a nota é recusada inteira, você acerta e reprocessa. Isso evita o pior cenário do galpão: metade da nota no estoque e ninguém sabendo qual metade.

> **Atenção operacional:** lote e séries são lidos **do que está salvo**, não do que está digitado na tela. Preencha lote/séries e clique em **Salvar Dados Fiscais** antes de **Processar Nota**.

### 14.4 Reprocessar a mesma nota não duplica estoque

Cada item da nota é "carimbado" no momento exato em que entra no estoque. Quando você processa a nota de novo — por dois cliques seguidos, por recarregar a tela, ou porque a primeira tentativa parou no meio — o sistema **pula os itens que já foram carimbados** e só trabalha nos que faltam.

Na prática:

| Cenário | Resultado |
|---|---|
| Nota com item A (10 un) e item B; A entra, B falha | A fica com 10. Você acerta B e reprocessa |
| Reprocessamento depois de acertar B | A **continua com 10** (não vira 20); B entra agora |
| Clicar duas vezes em "Processar Nota" | Uma entrada só |
| Nota já concluída | *"Nota já processada"* |

O carimbo só é devolvido quando **nada** chegou a entrar naquele item. Depois que o saldo foi creditado, o carimbo fica — creditar duas vezes é um engano que não tem como ser desfeito sem rastro, e o sistema prefere recusar a repetir.

### 14.5 O que a entrada cria junto com o saldo

Ao processar a nota, além de somar a quantidade ao saldo do material, o sistema:

- **cria o lote** quando o campo Lote foi preenchido, herdando da nota o fornecedor, a corrida, a data de fabricação, a validade e o número da nota fiscal;
- **cria os números de série** informados, cada um vinculado ao lote e à localização de entrada;
- **alimenta o custo médio** do material com o valor unitário do item da nota (fórmula em 21.2) — quando a nota traz valor. Nota sem valor (conserto, amostra, brinde, material de cliente) entra normalmente e **não mexe no custo**;
- **gera a conta a pagar** com a descrição "NF ⟨número⟩/⟨série⟩ — ⟨número do recebimento⟩";
- **grava tudo no livro de movimentações**, com o número do recebimento como documento vinculado.

**Material que exige certificado do fornecedor** entra normalmente no estoque, mas com o **lote bloqueado** até o certificado ser anexado — a regra completa está em 4.6. Mesma lógica de todo o módulo: o que está no galpão é registrado; o que se pode fazer com ele é que é controlado.

### 14.6 Item que exige inspeção entra retido — não é barrado

Material marcado como **crítico** no cadastro, com a configuração "Exigir inspeção para materiais críticos no recebimento" ligada, **entra no estoque normalmente** e, no mesmo momento, é **retido para inspeção**.

Isso é deliberado: o material está fisicamente no galpão desde que o caminhão descarregou. Negar a entrada faria o sistema afirmar que não existe algo que existe, e a inspeção passaria a decidir sobre um saldo que ainda não tinha entrado.

O efeito prático:

| | Antes da inspeção | Depois de aprovado |
|---|---|---|
| Aparece no estoque físico | Sim | Sim |
| Conta no valor do estoque | Sim | Sim |
| Entra na contagem de inventário | Sim | Sim |
| **Pode sair, ser reservado ou requisitado** | **Não** | Sim |
| Aparece na fila de Inspeções Pendentes | Sim | Não |

O item retido aparece na tela **Inspeções Pendentes** com a quantidade retida, o recebimento de origem, a nota fiscal e **há quantos dias está esperando**.

---

## 15. Inspeção e qualidade

### 15.1 A quarentena

"Quarentena" é o estado do material que entrou e está retido aguardando decisão da qualidade. Ele é patrimônio, está na prateleira, conta no inventário — mas **não está disponível**.

A retenção é **por item de recebimento**, e não por material. Isso importa: se o mesmo material chegou em duas notas diferentes e as duas retiveram, cada uma tem a sua fila e a sua decisão. Decidir uma não libera a outra.

### 15.2 A decisão de inspeção

Na tela **Almoxarifado → Inspeções**, o botão de decisão abre o formulário **Decidir Inspeção**, que já vem preenchido com a hipótese mais comum: **aprovado = tudo, reprovado = 0**.

Campos:

| Campo | Obrigatório | Observação |
|---|---|---|
| Quantidade aprovada | sim | pode ser 0 |
| Quantidade reprovada | sim | pode ser 0 |
| Encaminhamento | aparece quando há reprovado | Devolver ao fornecedor · Análise da Engenharia · Substituição |
| Observações | **sim quando há reprovado** | é o único registro do motivo da reprovação |
| Problemas identificados | não | Divergência de quantidade · Divergência dimensional · Certificado ausente · Dano físico · Material incorreto |

**A regra central: aprovado + reprovado tem de fechar exatamente com o retido.** Não fechar deixaria uma sobra presa em quarentena para sempre, sem fila que a mostrasse. Se não fechar, o sistema recusa com *"Aprovado + reprovado (85) tem de fechar com o retido (100)"* — nomeando os dois números.

Outras recusas:

| Situação | Mensagem |
|---|---|
| Item que não tem retenção nenhuma | *"Item não possui quantidade em inspeção retida"* |
| Valores não numéricos ou negativos | *"quantidade_aprovada e quantidade_reprovada têm de ser números não negativos"* |
| Alguém decidiu o mesmo item ao mesmo tempo | *"Item já foi decidido por outra inspeção"* |
| Encaminhamento fora da lista | *"Encaminhamento inválido: ⟨valor⟩"* |

Os três resultados possíveis:

| Decisão | Efeito |
|---|---|
| **Aprovar tudo** | a quantidade retida sai da retenção e vira **disponível** |
| **Reprovar tudo** | a quantidade retida sai da retenção e vira **bloqueada** |
| **Parcial** | a parte aprovada vira disponível e a parte reprovada vira bloqueada, **na mesma operação** |

A quantidade física do material **não muda** em nenhum dos três casos — o material continua na prateleira; o que muda é o que se pode fazer com ele. E decidir é uma operação única: aprovar e reprovar acontecem juntos, nunca em dois passos que poderiam ficar pela metade.

Uma decisão de inspeção **não pode ser estornada pelo livro de movimentações** — ela é o registro de um julgamento, não um lançamento de saldo a acertar. Para rever a decisão, use a própria tela de Inspeções.

Perfil exigido: **inspecionar** (Administrador e Almoxarife).

### 15.3 Bloqueio e desbloqueio avulso

Nem todo bloqueio nasce da inspeção. Avaria encontrada na prateleira, material suspeito, material segurado por decisão da qualidade: para isso existem, no topo da tela de Inspeções, os botões **Bloquear Material** e **Desbloquear Material**.

Os dois exigem **material**, **quantidade** e **justificativa**, e nenhum dos três pode ficar em branco:

| Situação | Mensagem |
|---|---|
| Sem justificativa | *"Justificativa é obrigatória para bloqueio"* / *"Justificativa é obrigatória para desbloqueio"* |
| Quantidade em branco, zero, negativa ou não numérica | *"Quantidade é obrigatória para bloqueio e tem de ser um número maior que zero"* |
| Desbloquear mais do que está bloqueado | *"Quantidade bloqueada insuficiente: 30"* |

O desbloqueio **nunca satura em silêncio**: pedir para desbloquear 50 quando há 30 bloqueados é recusado, e não devolve 30 fingindo que devolveu 50.

Perfil exigido para bloquear e desbloquear: **ajustar estoque** (Administrador e Gestor). Ele é **diferente** do de decidir inspeção — quem decide inspeção não necessariamente pode bloquear material avulso.

### 15.4 O que material bloqueado deixa de poder fazer

Bloqueado é um **estado administrativo**, não uma ausência física. O material continua no galpão, continua valendo dinheiro e continua sendo contado no inventário.

| Operação | Material bloqueado |
|---|---|
| Sair (saída, produção, montagem, assistência) | **Não** |
| Ser sucateado ou baixado como perda | **Não** |
| Ser reservado para uma OS ou projeto | **Não** |
| Atender requisição | **Não** |
| Ser enviado a um terceiro | **Não** |
| Ser devolvido ao cliente dono | **Não** |
| Ser transferido de prateleira | Sim |
| Ser contado no inventário | **Sim** |
| Entrar no valor total do estoque | **Sim** |

A razão de tudo isso é uma só: material bloqueado sai do **saldo disponível** (6.1), e é o saldo disponível que autoriza qualquer saída. A tentativa de usar material bloqueado é recusada com *"Material bloqueado não pode ser utilizado"*.

---

## 16. Materiais de clientes

### 16.1 O que é

É material que **pertence ao cliente** e está guardado no nosso galpão — a chapa que o cliente manda para ser trabalhada, o equipamento que veio para reforma, a peça de reposição que o cliente comprou e deixou aqui.

No sistema, material de cliente **não é uma lista separada**: é material normal, com todos os recursos do módulo (lote, número de série, endereço de prateleira, extrato, etiqueta com QR, movimentações), **com um dono anotado**.

### 16.2 Como o dono é marcado

No cadastro do material (**Almoxarifado → Materiais → Novo**), existe a seção **Propriedade**. Ali se escolhe o cliente proprietário. Material sem cliente escolhido é **nosso**.

**É no cadastro que o material de cliente nasce** — não há uma tela separada de "cadastrar material de cliente".

### 16.3 O selo de propriedade

Como material de cliente e material nosso convivem nas mesmas telas (catálogo de Materiais, livro de Movimentações, extrato do item, remessas), o sistema marca cada linha que não é nossa com um **selo com a razão social do cliente**.

Passando o mouse sobre o selo, aparece o texto completo:

> *"Material do cliente ⟨razão social⟩ — não entra no estoque próprio e só sai com OS ou projeto desse cliente"*

Nos seletores de material (onde não cabe um selo colorido), o dono entra no próprio texto da opção, entre colchetes: `CHP-0001 — Chapa 3/16" [cliente: Metalúrgica X]`.

### 16.4 A garantia: material de um cliente não sai para outro destino

Esta é a regra mais importante da seção, e ela é verificada **no momento da saída**, não depois.

**Material com dono só sai com OS ou projeto cujo cliente seja o mesmo dono.** O sistema não confia em texto digitado: ele lê o cliente da OS ou do projeto informado e compara com o dono do material.

| Situação | Mensagem da tela |
|---|---|
| Saída sem OS e sem projeto | *"Material CHP-0001 pertence ao cliente Metalúrgica X e so pode sair com OS ou projeto DESSE cliente. Informe a OS ou o projeto de Metalúrgica X."* |
| OS/projeto de **outro** cliente | *"Material CHP-0001 pertence ao cliente Metalúrgica X, mas a OS 4512 e do cliente Indústria Y. Material de cliente so pode ser aplicado em trabalho do proprio dono — troque o vinculo, ou use o material equivalente do estoque proprio."* |
| OS/projeto **interno** (sem cliente) | recusado pelo mesmo caminho — projeto sem cliente **não é curinga** |

Quando os dois lados existem, o **projeto** tem precedência sobre a OS na hora de identificar o cliente do vínculo.

O erro que essa regra impede é o mais caro da operação, e ele **não é erro de estoque**: o número fecha perfeitamente. É erro contratual — o cliente cobra onde a chapa dele foi aplicada, e a chapa foi para o equipamento de outro.

### 16.5 A movimentação emergencial NÃO fura essa garantia

No restante do módulo, uma movimentação marcada como **emergencial** com justificativa dispensa o vínculo obrigatório a OS/projeto, e a pendência de regularização fica registrada para depois (6.6).

**Para material de cliente, o emergencial não vale.** A tentativa é recusada com:

> *"Material CHP-0001 pertence ao cliente Metalúrgica X: saida emergencial nao e permitida para material de terceiro. O emergencial regulariza o vinculo depois, e material de cliente exige saber na hora em qual OS ou projeto DESSE cliente ele foi aplicado. Informe a OS ou o projeto do proprio cliente."*

**Por quê:** o emergencial existe para urgência no **nosso** estoque, onde errar o vínculo é um problema interno que se resolve depois. Consumir material de **outra empresa** sem dizer onde não é problema de pressa — é problema contratual. "Regularizo depois" não é resposta para o dono da chapa, porque quando chegar o "depois" ninguém mais vai lembrar em qual equipamento aquela chapa entrou.

### 16.6 Entrada de material de cliente

Material de cliente entra pela tela normal de **Recebimentos**, com uma exigência a mais: **o número do documento é obrigatório** (a nota de remessa do cliente). Sem ele:

> *"CHP-0001: material do cliente Metalúrgica X exige numero de documento (nota de remessa) para dar entrada"*

**Projeto não é exigido na entrada** — e isso é intencional. O mesmo cliente manda a mesma chapa para dois projetos diferentes; exigir projeto na entrada obrigaria a cadastrar dois materiais idênticos para o mesmo item físico do mesmo dono. O projeto é exigido na **saída**, que é onde ele existe de verdade.

Material **nosso** continua podendo entrar sem nota (entrada manual, devolução, ajuste de inventário).

### 16.7 Devolução ao cliente

Na tela **Almoxarifado → Materiais de Clientes**, cada linha com saldo tem o botão **Devolver**. Ele abre o formulário "Devolver ao cliente", com:

| Campo | Obrigatório |
|---|---|
| Quantidade | sim |
| **Número do documento de devolução** | **sim** |
| Lote / série / localização de origem | conforme o controle do material |

Sem documento, a operação é recusada com *"informe o numero do documento de devolucao"*. O botão fica desabilitado quando o item está com saldo zero, com o aviso *"Sem saldo para devolver"*.

A devolução ao cliente **é uma saída**: o material sai do prédio de volta para quem é dele, e o saldo baixa. Ela é isenta da regra de OS/projeto pelo motivo óbvio — o destino **é** o próprio dono.

### 16.8 Ajuste de material de cliente e a autorização especial

Ajustar o saldo de material de cliente **exige uma permissão própria**, mais estreita que a de ajustar estoque comum:

| Ação | Perfis |
|---|---|
| Ajustar estoque (material nosso) | Administrador, Gestor |
| **Ajustar material de cliente** | **somente Administrador** |

Quem não tem a permissão recebe:

> *"Ajustar o saldo do material CHP-0001, que pertence ao cliente Metalúrgica X, exige a permissão "ajustar_material_cliente" (seu perfil: GESTOR). Ajustar estoque de terceiro mexe no numero que o cliente vai cobrar."*

A verificação acontece **dentro do motor de estoque**, e não só na tela — de forma que qualquer ajuste lançado pela tela de Movimentações passa por ela. Todo ajuste de material de cliente deixa registro de auditoria **nomeando o cliente proprietário**, com o saldo anterior, o tipo de ajuste, a quantidade e a justificativa (que é obrigatória em qualquer ajuste).

> Para acertar o saldo de um material de cliente, use sempre o **Ajuste** da tela de Movimentações — ver o cuidado registrado em 23.

### 16.9 A tela e o relatório de posição por cliente

Em **Almoxarifado → Materiais de Clientes**, escolhe-se o cliente e o sistema mostra a posição completa dele:

| Coluna | O que é |
|---|---|
| Código / Material / Un. | identificação do item |
| **Recebido** | tudo que entrou daquele material, somado do livro |
| **Consumido** | tudo que saiu por aplicação, perda, sucata, consumo em terceiro |
| **Devolvido** | o que voltou para o cliente (coluna separada, de propósito) |
| **Saldo** | o que está no galpão agora |
| **Aplicado em** | a lista de OS e projetos onde aquele material foi usado, com a quantidade de cada |

Os números **saem do livro de movimentações**, não de contadores paralelos: a conta que o cliente faz de cabeça — **recebido − consumido − devolvido = saldo** — fecha. Movimentações estornadas não contam (o estorno é visível no livro, mas não pesa na posição).

"Devolvido" é coluna separada porque o cliente precisa distinguir **o que virou peça** de **o que voltou para ele**. Perda no terceiro e consumo no processo entram em "Consumido", e não somem da tela: material que o cliente não vai receber de volta tem de aparecer em algum lugar.

O botão **PDF da posição** gera, no próprio navegador, um documento com:

- título "Posição de materiais — ⟨razão social⟩" e a data/hora em que a foto foi tirada;
- a tabela Código · Material · Un. · Recebido · Consumido · Devolvido · Saldo;
- o **saldo total**;
- a seção "Aplicações por OS / projeto" com Código · Aplicado em · Quantidade.

Linhas de consumo sem OS e sem projeto não entram no PDF — no documento do cliente, "aplicado em —" pareceria rastreabilidade perdida.

---

## 17. Material enviado a terceiros

### 17.1 O que é uma remessa

Quando o material sai do galpão para um serviço externo — **tratamento térmico, pintura, galvanização, corte, dobra, usinagem** — ele deixa de estar aqui, mas **continua sendo nosso**.

O documento que registra isso é a **remessa**, na tela **Almoxarifado → Remessas a Terceiros**.

Perfil exigido para criar, enviar, receber retorno, transformar, encerrar e cancelar: **remeter a terceiro** (Administrador e Almoxarife). Quem não tem recebe:

> *"Sem permissao para remessa a terceiros (acao: remessar_terceiro)"*

### 17.2 O documento de remessa

Botão **Nova remessa**. Campos:

| Campo | Obrigatório | Observação |
|---|---|---|
| Terceiro cadastrado (Compras) **ou** Nome do terceiro | **um dos dois** | o terceiro pode não estar cadastrado; digitar o nome é suficiente |
| Tipo de serviço | não | galvanização, pintura, corte… |
| Prazo previsto de retorno | não | é o que alimenta o aviso de remessa **Vencida** |
| OS / Projeto / Pedido de compra | não | vínculos do documento |
| Observações | não | |
| Itens (material + quantidade) | **ao menos um** | cada item pode ter lote, peso e observações próprios |

Recusas:

| Situação | Mensagem |
|---|---|
| Sem fornecedor nem nome | *"Informe o fornecedor (terceiro) da remessa"* |
| Remessa sem itens | *"A remessa precisa de ao menos um item"* |
| Quantidade zerada ou negativa | *"Quantidade do item da remessa deve ser maior que zero"* |
| Material inativo | *"Material CHP-0001 esta inativo e nao pode ir para o terceiro"* |
| Itens de donos diferentes | *"A remessa mistura materiais de donos diferentes (Metalúrgica X e estoque proprio (material nosso)). O documento de remessa nomeia UM proprietario — separe em remessas diferentes."* |

Essa última é a contrapartida de a remessa ser isenta da regra de OS/projeto: mandar galvanizar não é aplicar a chapa em ninguém, mas **o documento nomeia um proprietário**, e o dono fica gravado na remessa. Sem isso, a remessa seria um caminho para material de cliente sair do prédio sem rastro de propriedade.

A remessa recebe um número automático (formato `REM-…`) e nasce na situação **ABERTA**.

O botão **PDF da remessa** gera o documento no navegador, para acompanhar o material.

### 17.3 As situações pelas quais a remessa passa

```
ABERTA ──► ENVIADA ──► RETORNO_PARCIAL ──► ENCERRADA
   │           │              │  ▲   │
   │           │              └──┘   │
   └──────► CANCELADA ◄──────────────┘
```

| Situação | Significado | O que aconteceu com o saldo |
|---|---|---|
| **ABERTA** | remessa montada, itens escolhidos | **nada saiu** |
| **ENVIADA** | material saiu do galpão | sai do **disponível**, continua no **patrimônio** |
| **RETORNO_PARCIAL** | parte voltou | o que voltou virou disponível de novo; o resto segue retido |
| **ENCERRADA** | final | não há mais nada retido |
| **CANCELADA** | final | o que ainda estava lá fora voltou ao disponível |

**RETORNO_PARCIAL aceita vários retornos seguidos** — uma remessa pode receber quantos recebimentos forem necessários.

**ENCERRADA e CANCELADA não têm volta.** Reabrir uma remessa encerrada significaria ressuscitar uma retenção sem documento vivo por trás. Toda transição inválida é recusada com a frase que **nomeia a situação atual e os destinos possíveis**:

> *"Transicao invalida: remessa em ENCERRADA nao pode ir para ENVIADA. Permitidos a partir de ENCERRADA: nenhum (estado final)."*

Os movimentos de envio e de retorno de remessa também **não podem ser estornados pelo livro de movimentações**: *"Movimento de remessa a terceiro não pode ser estornado pelo livro — use a tela de Remessas para cancelar ou encerrar a remessa"*. Com a remessa já encerrada, portanto, não há estorno a fazer: se o encerramento foi lançado errado, o saldo se acerta por um lançamento novo de **Ajuste** na tela de Movimentações, com justificativa e pelo perfil que pode ajustar estoque — e o cuidado descrito em 23 se aplica.

### 17.4 O envio é tudo ou nada

O botão **Enviar** retém o saldo de **todos** os itens da remessa. Antes de mover qualquer coisa, o sistema soma o que a remessa pede **por material** (e não linha por linha) e compara com o disponível. Se faltar saldo em qualquer material, **a remessa inteira é recusada** e nada sai:

> *"Nao foi possivel enviar a remessa REM-12345678: CHP-0001: disponivel 100 KG, a remessa pede 120 em 2 linhas; TB-0044: material inativo"*

A soma é por material porque **duas linhas do mesmo material são caso normal** (duas chapas do mesmo código, com lotes e pesos diferentes). Checar cada linha isoladamente deixaria passar duas linhas de 60 contra um disponível de 100.

A mensagem diz **quanto há, quanto foi pedido e em quantas linhas** — para o operador não olhar uma linha de 60, ver 100 disponíveis e concluir que o sistema está errado.

Clicar em "Enviar" duas vezes não retém em dobro: cada item só é enviado uma vez.

### 17.5 Retorno parcial e o teto do que ainda pode voltar

Botão **Retorno**. Você escolhe **o item que voltou** (o seletor mostra "ainda no terceiro: 60 KG" em cada opção), a **quantidade** e, opcionalmente, a **nota fiscal do retorno**.

**O teto é por item, não por material.** Se a remessa levou duas chapas do mesmo código em duas linhas, cada linha tem o seu pendente próprio, e uma não devolve o que a outra mandou.

Recusas:

| Situação | Mensagem |
|---|---|
| Item de outra remessa | *"O item 42 pertence a outra remessa"* |
| Item que nunca foi enviado | *"O item CHP-0001 ainda nao foi enviado ao terceiro — nao ha o que retornar"* |
| Acima do pendente | *"Retorno acima do enviado: o item CHP-0001 enviou 100 KG, ja retornaram 40 e ainda estao no terceiro 60 — este recebimento pede 80"* |
| Remessa em situação que não recebe retorno | *"Remessa em ENCERRADA nao recebe retorno (recebem: ENVIADA, RETORNO_PARCIAL)"* |
| Material diferente do enviado | *"O retorno de material DIFERENTE do enviado (CHP-0001 vira outro codigo) nao e retorno simples: e transformacao. Use o botão "Transformar" na tela de Remessas a Terceiros …"* |

O recebimento de retorno também é **tudo ou nada**: se uma linha estourar o teto, o recebimento inteiro é recusado — creditar metade deixaria o operador sem saber o que já entrou.

**O retorno simples não credita estoque.** A quantidade sai da retenção e volta ao disponível; a quantidade física **não muda**, porque o material nunca deixou de ser patrimônio — ele só estava a 40 km. Creditar aqui contaria a mesma chapa duas vezes.

Quando o último pendente da remessa é liquidado, ela **encerra sozinha**, sem pedir destino nem justificativa — não houve perda a explicar.

### 17.6 Encerramento com destino obrigatório

Botão **Encerrar**. Se ainda houver material no terceiro, o sistema **exige dizer para onde ele foi**:

| Destino | Quando usar |
|---|---|
| **PERDA_NO_TERCEIRO** | "Perda no terceiro (sumiu ou foi danificado lá)" |
| **CONSUMIDO_NO_PROCESSO** | "Consumido no processo (virou cavaco / refugo)" |

Mais **justificativa**, também obrigatória. Sem destino, a recusa **diz quanto está em jogo e abre item por item**:

> *"A remessa REM-12345678 tem 75 KG que nunca voltaram (CHP-0001: 50 KG; CHP-0002: 25 KG). Para encerrar, informe o destino desse saldo: PERDA_NO_TERCEIRO ou CONSUMIDO_NO_PROCESSO, mais a justificativa."*

Sem justificativa: *"Encerrar remessa com saldo pendente exige justificativa alem do destino"*. Destino fora da lista: *"Destino de encerramento invalido: … Validos: PERDA_NO_TERCEIRO, CONSUMIDO_NO_PROCESSO"*.

Os dois destinos dão **baixa definitiva**: a quantidade sai do patrimônio **e** da retenção, ao mesmo tempo, para **todos** os itens pendentes. Por que exigir destino e não só um texto livre: texto livre não tira o saldo da retenção, e a remessa ficaria encerrada com material preso para sempre em um estado que ninguém mais olharia.

Remessa que voltou inteira encerra **sem destino**, e isso é o correto — não havia pendência a destinar.

> **Cuidado de operação:** material que esteja **bloqueado** ao mesmo tempo em que tem saldo no terceiro pode ter o encerramento recusado com *"Material bloqueado não pode ser utilizado"* — a baixa do encerramento é uma saída, e saída de material bloqueado é barrada. Desbloqueie a quantidade necessária (15.3) antes de encerrar.

### 17.7 Cancelamento com estorno

Botão **Cancelar**. Exige **motivo** (*"Cancelar remessa exige motivo"* quando em branco).

| A partir de | O que acontece |
|---|---|
| ABERTA | nada é estornado — nada tinha saído |
| ENVIADA / RETORNO_PARCIAL | **só o que ainda está lá fora** volta ao disponível |

O que já voltou não é estornado de novo — estornar duas vezes negativaria a retenção. A tela avisa: *"O material que ainda estiver no terceiro volta para o disponível."*

**Cancelar é diferente de encerrar com destino:** no cancelamento o material **volta** (ou nunca saiu de verdade); no encerramento com destino ele **some do patrimônio**. São duas ações separadas de propósito — um botão único obrigaria a perguntar "voltou ou não?" toda vez.

### 17.8 A regra central: continua sendo nosso, mas sai do disponível

**Material no terceiro continua sendo patrimônio da empresa e sai do saldo disponível.**

| Enquanto está no terceiro | |
|---|---|
| Quantidade física (patrimônio) | **inalterada** |
| Saldo disponível | **reduzido** |
| Valor do estoque | **conta normalmente** |
| Pode sair, ser reservado, ser requisitado | **não** |
| Aparece na contagem de inventário | **não** |

Essa é a única das quatro retenções que significa "não está no prédio", e é por isso que ela — e só ela — é descontada da quantidade esperada na conferência de estoque. A conta e a razão completa estão em 13.2.

### 17.9 Prazo e remessas vencidas

A remessa com **prazo previsto de retorno** já vencido e material ainda lá fora recebe na lista o selo **Vencida**, com o texto explicativo:

> *"O prazo combinado com o terceiro já passou e ainda há material lá fora"*

---

## 18. Transformação no terceiro

### 18.1 Quando usar

Quando **volta material diferente do que saiu**: a chapa foi para o corte e voltaram 40 peças mais uma sobra; o tubo foi para a usinagem e voltaram os eixos; a bobina foi para a dobra e voltaram perfis.

O botão é **Transformar** na tela de Remessas a Terceiros, com o aviso na própria tela:

> *"Use aqui quando **voltou material diferente do que saiu** (corte, dobra, usinagem). A chapa consumida sai do estoque de vez e os resultados entram como material próprio. Se a chapa voltou inteira, use **Retorno**."*

### 18.2 Como se registra

O formulário separa **dois números que não se misturam**:

| Campo | O que é |
|---|---|
| **Item transformado (a chapa)** | qual item enviado foi consumido — o seletor mostra "ainda no terceiro: 100 KG" |
| **Quantidade consumida da chapa** | **na unidade da chapa**. É só este número que desconta do que está no terceiro |
| **Custo do serviço do terceiro (R$)** | opcional — o valor total da nota do terceiro para esta transformação |
| **Nota fiscal do retorno** | opcional |
| **O que voltou** (lista) | cada resultado: material, quantidade **na unidade dele**, e classificação |

A tela é explícita: *"Na unidade da chapa. É só este número que desconta do que está no terceiro — as peças que voltaram têm a unidade delas e não entram nesta conta."*

Isso não é detalhe: comparar 40 peças (UN) com uma chapa de 100 (KG) seria somar laranja com maçã. O teto do item continua sendo medido **na unidade do que saiu**, exatamente como no retorno simples.

Os resultados são adicionados um a um pelo botão **Adicionar resultado** e aparecem numa tabela (Código · Material · Qtd. · Un. · Classificação), com botão de remover. Enquanto você não confirma, nada acontece: *"Nenhum resultado ainda. A chapa só é baixada quando você confirmar."*

O botão **Confirmar transformação** executa tudo de uma vez: a chapa é baixada e os resultados entram no estoque **no mesmo evento**. A tela confirma com *"Transformação registrada — a chapa foi baixada e os resultados entraram no estoque"*.

### 18.3 A classificação: peça ou sobra

Cada resultado tem de ser classificado, e **não há padrão** — o campo é obrigatório:

| Classificação | Rótulo na tela | Efeito no custo |
|---|---|---|
| **PECA** | "Peça (recebe o custo rateado da chapa)" | recebe rateio |
| **SOBRA** | "Sobra / retalho (entra a custo zero)" | entra a **custo zero** |

Não há padrão de propósito: um padrão "Peça" faria a sobra virar peça por omissão e entrar carregando rateio — que é exatamente o que a regra de custo existe para impedir (21.3).

O que "virou cavaco" **não é resultado e não tem linha**: é a diferença entre o consumido e o que voltou, e já foi baixada junto com a chapa.

### 18.4 O material resultante tem de existir, e tem de ter o mesmo dono

**O sistema não cria material sozinho.** Se o material do resultado não estiver cadastrado:

> *"O material 88 do resultado nao existe. Cadastre o material resultante primeiro (Almoxarifado > Materiais > Novo, ou o atalho "Criar material resultante" na tela de Remessas) e refaca a transformacao — o sistema nao cria material sozinho a partir de um formulario de retorno."*

O atalho **Criar material resultante**, dentro do próprio modal, cadastra na hora pedindo só **nome** e **unidade** — *"O código é gerado pela família da chapa e o proprietário é herdado dela — a peça cortada de uma chapa do cliente continua sendo do cliente."* (Esse atalho exige a permissão de **criar material**, que é diferente da de remeter a terceiro.)

Outras recusas:

| Situação | Mensagem |
|---|---|
| Material do resultado inativo | *"O material PC-0010 do resultado esta inativo — reative o cadastro antes de transformar para ele"* |
| Resultado igual à chapa | *"O resultado CHP-0001 e o MESMO material da chapa enviada. Chapa que volta como ela mesma nao e transformacao: use o retorno simples da remessa."* |
| Nenhum resultado informado | *"A transformacao do item CHP-0001 precisa de ao menos um resultado (peca ou sobra) — se a chapa voltou inteira, use o retorno simples"* |
| Remessa em situação errada | *"Remessa em ABERTA nao recebe transformacao (recebem: ENVIADA, RETORNO_PARCIAL)"* |
| Acima do pendente | mesmo teto e mesma mensagem do retorno simples (17.5) |

**A regra do dono, sem exceção:** a peça resultante tem de ter **o mesmo proprietário da chapa**.

> *"A peca resultante tem dono diferente da chapa: CHP-0001 e de Metalúrgica X e PC-0010 e de estoque proprio (material nosso). A transformacao nao pode mudar o proprietario do material — cadastre o material resultante com o mesmo proprietario da chapa, ou escolha outro material de destino."*

A guarda é **simétrica** — vale nos dois sentidos. O caso perigoso não é chapa de um cliente virar peça de outro: é **chapa de cliente virar peça nossa**, o que converteria material de terceiro em patrimônio da empresa em silêncio, com o número certo em todo relatório e nada estranho aparecendo em lugar nenhum. O caminho inverso é igualmente errado — presentear o cliente com material nosso.

### 18.5 O rendimento aparece depois, e nunca barra

Depois de confirmada a transformação, a tela mostra um aviso informativo:

> *"Rendimento: 93.75% (saíram 80 kg, voltaram 75 kg)"*

**O rendimento nunca impede a operação.** Ele é calculado **depois** do efeito, aparece como informação e não bloqueia nada. Quando não há como calculá-lo, a tela diz **quais** materiais estão sem peso cadastrado:

> *"rendimento nao calculavel — peso unitario nao cadastrado em: CHP-0001, PC-0010"*

E lista **todos** de uma vez, não só o primeiro — para não obrigar o operador a acertar um cadastro, tentar de novo, descobrir o segundo, e assim por diante.

A fórmula e as condições de cálculo estão em 21.4. A razão de o rendimento nunca bloquear é a mesma que vale em todo o módulo: **peso unitário é campo opcional no cadastro**, e travar o operador por causa de um campo em branco pararia o galpão.

---

## 19. Sobras e retalhos

A tela é **Almoxarifado → Sobras e Retalhos**, aba **Retalhos**. Retalho é o pedaço aproveitável
que sobra quando uma chapa, tubo ou barra é parcialmente usada. No sistema, ele é **duas coisas ao
mesmo tempo**: um **material do catálogo com saldo real** (o "material do retalho" — meia chapa não
é chapa, então ela tem cadastro próprio) e uma **ficha dimensional** (dimensões restantes, norma,
espessura, diâmetro, largura, comprimento, peso aproximado, localização, responsável e os vínculos
com o material de origem e o lote de onde a peça veio).

### 19.1 Gerar retalho — os dois modos

O botão **Gerar retalho** (exige a permissão de movimentar estoque) pede o material de **origem**
(o que foi cortado) e o material do **retalho** (o que representa o pedaço no catálogo). O
checkbox **"Baixar o material de origem agora"** escolhe entre dois modos, e a diferença é o que
acontece com o saldo:

| Modo | Quando usar | O que acontece |
|---|---|---|
| **Com baixa** (checkbox marcado) | O corte está acontecendo agora — a peça ainda está no estoque | O sistema lança a **saída** do material de origem (com lote, OS/projeto e as regras normais de saída) **e** a **entrada do retalho**, no mesmo ato. Se qualquer uma das pontas falhar, a outra é desfeita — nunca fica saída sem retalho |
| **Sem baixa** (desmarcado) | A peça já saiu do estoque antes (foi entregue por requisição) e a sobra está voltando do chão de fábrica | Só a **entrada do retalho** é lançada — o texto da tela avisa: *"nada é baixado agora, só o retalho é creditado"* |

Regras que o sistema aplica ao gerar:

- **O material do retalho tem de existir — o sistema não cria sozinho.** A recusa ensina o
  caminho: *"O material do retalho 999 nao existe. Cadastre o material do retalho primeiro
  (Almoxarifado > Materiais > Novo, ou o atalho 'Criar material do retalho' na tela de Sobras e
  Retalhos) e refaca a geracao — o sistema nao cria material sozinho a partir de um formulario de
  retalho."* O atalho **Criar material do retalho**, dentro do próprio modal, cadastra na hora com
  o código gerado pela família da origem.
- **Dono e categoria são herdados do material de origem** no atalho de criação — e a geração
  **recusa** um material de retalho com dono diferente do original, nomeando os dois donos.
  Retalho de chapa de cliente continua sendo do cliente; sem essa regra, um corte transformaria
  material de terceiro em material próprio sem ninguém perceber.
- **Retalhar um material "para ele mesmo" é recusado**: *"O retalho CHP-3MM e o mesmo material da
  origem. Meia chapa nao e chapa: cadastre (ou escolha) um material proprio para o retalho."*
- **Origem com controle de lote exige o lote** no modo com baixa: *"O material CHP-01 controla
  lote: informe o lote de origem (lote_origem_id) para gerar retalho com baixa — o retalho herda a
  rastreabilidade do lote da chapa, e a propria saida exige o lote de qualquer forma."* No modo
  sem baixa o lote é opcional, mas, se informado, é validado (tem de ser um lote daquele
  material).
- **Material com número de série não gera retalho com baixa** — não há campo para dizer qual série
  está sendo cortada. A recusa aponta a saída: baixar a peça pela tela de Movimentações (que tem
  seletor de série) e registrar o retalho no modo sem baixa. Pelo mesmo motivo, o material **do
  retalho** não pode ter controle de série.
- **O retalho entra sempre sem custo.** O projeto já pagou a peça inteira na saída; creditar o
  retalho com valor contaria o mesmo aço duas vezes no patrimônio. A entrada a custo zero **não
  apaga** o custo médio que o material do retalho já tenha.
- **Quantidade do retalho em branco entra 1** — o corte devolve uma peça, e é o caso comum.

Ao confirmar, a tela avisa qual dos dois modos aconteceu — *"Retalho gerado — o material de origem
foi baixado"* ou *"Retalho gerado — nada foi baixado (a peça já tinha saído do estoque)"* — e o
modal de **etiqueta** abre sozinho com a etiqueta daquele retalho (4.8). Imprimir é opcional.

### 19.2 A lista, a edição e o status

A lista mostra origem → retalho, dimensões restantes, peso, localização, status e responsável,
com filtros por status, material de origem e busca por norma/dimensão/descrição. O selo de
proprietário aparece quando o retalho é de cliente. O nome do retalho é um link para o **extrato**
do material.

Cada linha tem **Editar** (status, localização, observações e a marca **Reutilizável**) — toda
edição fica auditada com o antes e o depois. Os status são **Disponível**, **Consumida** e
**Sucateada**; mudar o status é registro de cadastro, **não move saldo** — o saldo vive no
material do retalho e só muda por movimentação.

### 19.3 A sugestão de retalho antes de cortar material novo

Quando alguém lança uma **Saída** de um material que tem retalho aproveitável parado, o formulário
de Movimentações mostra um aviso — *"Existem N retalho(s) deste material — considere usá-los antes
de baixar do estoque principal."* — com o link **Ver retalhos**. É **aviso, não trava**: o
almoxarife pode ter motivo legítimo para usar o material inteiro (o retalho pode não servir para a
peça). Só contam na sugestão os retalhos **Disponíveis**, marcados como **Reutilizáveis** e cujo
material do retalho ainda tem saldo disponível maior que zero.

---

## 20. Sucateamento

A tela é **Almoxarifado → Sobras e Retalhos**, aba **Sucateamentos**. Sucatear é tirar material do
patrimônio de forma definitiva — e, por isso, **não é um lançamento de uma pessoa só**: é um
processo com solicitação, **duas aprovações de pessoas diferentes**, baixa automática na segunda
aprovação e registro do destino final (venda ou descarte).

**Sucata não aparece no formulário de Movimentações.** Os únicos caminhos que geram uma baixa de
sucata são este processo e a devolução com destino Sucata (12.6). **Perda** continua no formulário
de Movimentações — a exigência de dupla aprovação vale só para sucateamento.

### 20.1 Solicitar

O botão **Solicitar sucateamento** (exige a permissão de movimentar estoque) pede material,
quantidade, lote (quando o material controla lote), classificação, peso estimado, projeto/OS de
origem e **justificativa obrigatória**. O botão **Sucatear**, na linha de um retalho, abre o mesmo
formulário já preenchido com o material daquele retalho.

O próprio modal explica a natureza do passo: *"A solicitação não move saldo nenhum — a baixa só
sai do estoque quando as DUAS assinaturas (almoxarifado e gestão) fecharem o processo."*

O que o sistema valida já na solicitação (para a recusa não esperar duas assinaturas):

- **Justificativa em branco é recusada**: *"Justificativa e obrigatoria para sucatear: a baixa
  SUCATA exige o motivo escrito, e ele fica no livro de movimentacoes como a unica explicacao de
  por que o material sumiu do patrimonio."*
- **Saldo disponível insuficiente é recusado com os números**: *"Saldo disponivel insuficiente
  para sucatear CHP-01: disponivel 20 UN, solicitado 30. O disponivel ja desconta reservado,
  bloqueado, em inspecao e em poder de terceiros — sucatear alem dele apagaria material que esta
  comprometido com outra OS."*
- **Material com controle de lote sem lote informado é recusado**, e o lote informado tem de ser
  daquele material.
- **Material com número de série não passa pelo processo** — não há campo para dizer qual série
  está sendo sucateada; a recusa manda baixar a peça pela tela de Movimentações, que tem o
  seletor de série.
- **Material de cliente exige o vínculo do dono** (OS/projeto do próprio cliente), com a mesma
  regra e a mesma mensagem da saída comum (16.4).

A **classificação** é texto livre com seis sugestões que aparecem ao digitar: aço carbono, inox,
alumínio, cobre, cavaco, misto. Ela agrupa o relatório financeiro — vale combinar a grafia com a
equipe.

### 20.2 As duas aprovações — e por que precisam ser de pessoas diferentes

O processo exige **duas assinaturas**, em qualquer ordem:

| Perna | Quem pode assinar |
|---|---|
| **Almoxarifado** | Administrador, Almoxarife |
| **Gestão** | Administrador, Gestor |

Três regras de segregação, todas verificadas pelo servidor (a tela apenas esconde os botões de
quem não pode):

1. **Quem solicitou não aprova** — nenhuma das duas pernas: *"Quem solicitou o sucateamento nao
   aprova a propria solicitacao — em nenhuma das duas pernas. Peca a assinatura de outra pessoa do
   almoxarifado e da gestao."*
2. **Cada perna exige a permissão daquela perna** — a recusa diz qual permissão faltou e qual é o
   seu perfil.
3. **A mesma pessoa não assina as duas pernas — nem o Administrador**, que tem as duas
   permissões: *"Voce ja assinou a perna almoxarifado deste sucateamento e nao pode assinar tambem
   a perna gestao: dupla aprovacao com a mesma pessoa nas duas pernas e uma assinatura com dois
   carimbos. A segunda assinatura tem de ser de outra pessoa."* Essa regra vale até para cliques
   simultâneos em duas abas.

**A baixa acontece na segunda assinatura.** A primeira só assina: *"Perna assinada — falta a
assinatura da outra perna para a baixa sair"* — e o saldo **não muda**. A segunda fecha o
processo: *"Sucateamento aprovado nas duas pernas — a baixa foi emitida no estoque"* — é neste
momento que o total e o disponível caem e a linha de sucata entra no livro, com a justificativa da
solicitação e a referência `SUC-<número>` amarrando o lançamento ao processo.

**Se o saldo mudou entre a solicitação e a segunda assinatura**, a baixa é recusada com a mensagem
de saldo (com os números) e o sistema **desfaz a assinatura recém-dada sozinho**: o processo volta
a "Solicitado", a assinatura anterior é preservada, e a reversão fica registrada no histórico.
Nunca existe processo "aprovado" sem a baixa correspondente no livro.

### 20.3 Rejeitar e cancelar

- **Rejeitar** (permitido a quem pode aprovar qualquer uma das duas pernas) exige **motivo
  obrigatório**, que fica no histórico. Não há efeito de saldo — nada tinha saído.
- **Cancelar** é **só do próprio solicitante**, enquanto o processo está em "Solicitado", com
  confirmação e sem exigir motivo — desistir do próprio pedido não precisa de justificativa. Quem
  tentar cancelar pedido alheio é recusado: *"So o solicitante (Fulano) cancela o proprio
  sucateamento. Para recusar a solicitacao de outra pessoa use Rejeitar, que exige motivo e fica
  no historico."*

### 20.4 O destino final: vendida ou descartada

Depois de aprovado (e baixado), o botão **Registrar destino** (mesmo grupo de quem aprova)
declara o que foi feito com a sucata:

- **Vendida** — exige o **valor da venda** maior que zero: *"Informe o valor da venda da sucata
  (valor_venda maior que zero) — o destino VENDIDA alimenta o relatorio financeiro de sucata, e
  venda sem valor nao e venda."* O **comprovante** (PDF ou imagem) pode ser anexado.
- **Descartada** — sem exigência de valor; o comprovante também é aceito.

Registrar destino **não move saldo** — o material saiu do estoque na segunda assinatura; aqui se
declara o que foi feito com ele. Vendida e Descartada são estados finais.

### 20.5 Os status do sucateamento

| Status | Significado |
|---|---|
| **Solicitado** | Aguardando as assinaturas — o saldo ainda não mudou |
| **Aprovado** | As duas pernas assinaram e **a baixa já saiu do estoque** — falta registrar o destino |
| **Vendida** | Destino registrado com valor (e comprovante, quando anexado) — final |
| **Descartada** | Destino registrado sem venda — final |
| **Rejeitado** | Recusado por um aprovador, com motivo no histórico — final |
| **Cancelado** | Desistência do próprio solicitante antes de qualquer assinatura fechar — final |

Toda ação do processo fica auditada: solicitação, cada assinatura, rejeição, cancelamento,
destino e a reversão automática de assinatura quando a baixa é recusada.

---

## 21. Ferramentas e calibração

### 21.1 O que é uma ferramenta, e por que ela não é estoque

Ferramenta é **patrimônio emprestável** — uma furadeira, um paquímetro, um torquímetro —, não um
item que se consome. Ela tem uma tela própria (**Almoxarifado → Ferramentas**), separada da tela
de materiais, e não passa pelo motor de movimentações: emprestar e devolver uma ferramenta não
altera saldo de nenhum material, não gera entrada nem saída no livro de movimentações. A conexão
com um material do catálogo (campo opcional) é só referência — não é controle de estoque.

Cada ferramenta tem um destes status: **Disponível**, **Emprestada**, **Bloqueada**, **Em
manutenção**, **Avariada** ou **Perdida**. Só existe um caminho entre dois status por vez — por
exemplo, uma ferramenta emprestada não pode ser bloqueada diretamente; ela precisa voltar a
disponível primeiro (com a devolução).

### 21.2 O ciclo de empréstimo

Emprestar registra o colaborador (nome obrigatório; setor e data prevista de devolução são
opcionais) e muda a ferramenta para **Emprestada**. Essa mudança é **atômica**: se duas pessoas
tentarem emprestar a mesma ferramenta ao mesmo instante, exatamente uma consegue — a outra recebe
a recusa abaixo, nunca as duas ficam "donas" da mesma ferramenta.

Uma ferramenta que não está **Disponível** recusa o empréstimo:
> `Ferramenta não está disponível (status atual: <status>)`

Devolver fecha o empréstimo (fica registrada a data real de devolução) e a ferramenta volta a
**Disponível**, liberada para um novo empréstimo. Tentar devolver um empréstimo que já foi
fechado (ou que não existe) recusa com:
> `Empréstimo não encontrado`

A tela de Empréstimos destaca os que já passaram da data prevista de devolução — isso é um
**aviso visual**, não um bloqueio: a ferramenta continua emprestada normalmente até alguém
devolvê-la ou registrar uma ocorrência sobre ela.

### 21.3 Calibração — o que trava o empréstimo

Nem toda ferramenta precisa de calibração (só instrumentos de medição — o cadastro tem o campo
**"Exige calibração"**). Para as que exigem, o sistema guarda um **histórico** de calibrações
(data da calibração, data de validade, certificado anexo opcional, observações) — não existe um
campo único "última calibração" na ferramenta: a validade é sempre lida do **registro mais
recente**.

Uma ferramenta que exige calibração só empresta se a calibração mais recente ainda estiver
**dentro da validade**. Sem nenhum registro, ou com a validade já passada, o empréstimo é
recusado:
> `Ferramenta com calibração vencida ou sem calibração registrada`

Registrar uma nova calibração com validade futura destrava o empréstimo imediatamente — não
precisa de nenhuma outra ação. A data de validade tem de ser **posterior** à data da calibração;
se não for, o registro é recusado:
> `Data de validade deve ser posterior à data de calibração`

O **painel de calibrações** (aba Calibrações) lista as ferramentas que exigem calibração,
separadas em **vencidas** e **a vencer** (dentro do prazo configurável, 30 dias por padrão). Uma
ferramenta que nunca foi calibrada aparece na lista de vencidas.

### 21.4 Avaria e perda

Registrar uma ocorrência de **Avaria** ou **Perda** muda a ferramenta para o status
correspondente. Se a ferramenta estava **emprestada** no momento, o empréstimo em aberto é
**fechado automaticamente pela própria ocorrência** — não é preciso (nem é possível) devolver
antes: uma ferramenta perdida não tem como ser devolvida fisicamente. Cada ocorrência aceita uma
foto opcional e o nome do responsável.

Um tipo de ocorrência fora de Avaria/Perda é recusado:
> `Tipo de ocorrência inválido`

Registrar ocorrência só é permitido com a ferramenta **Disponível** ou **Emprestada** — sobre uma
ferramenta já Bloqueada ou Em manutenção, a recusa é:
> `Ferramenta não pode registrar ocorrência (status atual: <status>)`

### 21.5 Bloqueio, manutenção e reencontro

**Bloquear** tira a ferramenta de circulação por decisão administrativa (não é defeito — é, por
exemplo, "aguardando inventário" ou "reservada para um evento"). Exige uma justificativa de pelo
menos 5 caracteres; sem isso:
> `Justificativa deve ter pelo menos 5 caracteres`

Só ferramenta **Disponível** bloqueia:
> `Ferramenta não pode ser bloqueada (status atual: <status>)`

**Desbloquear** (também com justificativa) devolve a ferramenta a Disponível; tentar desbloquear
uma que não está bloqueada recusa com a mensagem simétrica
(`Ferramenta não está bloqueada (status atual: <status>)`).

**Manutenção**: iniciar tira a ferramenta de circulação (status **Em manutenção**) — aceita
ferramenta **Disponível** ou **Avariada** (é o caminho de conserto de uma avaria); ferramenta
**emprestada** não entra em manutenção direto — devolva primeiro:
> `Ferramenta não pode entrar em manutenção (status atual: EMPRESTADA)`

Concluir a manutenção registra a data de fim e devolve a ferramenta a Disponível. Concluir uma
manutenção que já foi concluída (ou que não existe) recusa com `Manutenção não encontrada`.

**Reencontrar** só vale para ferramenta **Perdida** — devolve a Disponível, com justificativa
obrigatória. Tentar reencontrar uma ferramenta que não está perdida:
> `Ferramenta não está perdida (status atual: <status>)`

### 21.6 Cadastro e perfis

Cadastrar uma ferramenta exige código de patrimônio e nome; os demais campos (tipo, setor
responsável, material de referência, número de série, localização, se exige calibração,
observações) são opcionais. O código de patrimônio é único — cadastrar um repetido recusa:
> `Código de patrimônio já cadastrado`

**Toda ação de escrita** (cadastrar, emprestar, devolver, bloquear, desbloquear, manutenção,
ocorrência, calibração, reencontrar) exige a permissão **Ferramentas** —
Administrador ou Almoxarife (ver 5.5). Essa permissão é **independente** da permissão de
movimentar estoque: é possível autorizar alguém a mexer em ferramentas sem autorizar a mexer no
estoque de materiais, e vice-versa. Ler a lista de ferramentas e o histórico é livre para
qualquer usuário autenticado, como todo GET do módulo.

Toda ação de escrita fica registrada na auditoria do módulo, com o usuário responsável.

---

## 22. Como o sistema calcula

Esta seção é a que permite explicar os números do sistema a terceiros.

### 22.1 Saldo disponível

O material tem **uma** quantidade física e **quatro** retenções. O saldo disponível é a subtração das quatro (a tabela das parcelas está em 6.1):

> **disponível = quantidade física − reservada − bloqueada − em inspeção − em terceiros**

Consequências:

- **É o disponível que autoriza qualquer saída.** Saída, sucata, perda, devolução ao cliente, reserva, envio a terceiro e atendimento de requisição — todos comparam contra o disponível. Recusa típica: *"Saldo insuficiente. Disponível: 40 KG"*; ao reservar: *"Saldo disponível insuficiente: 40"*; ao enviar a terceiro: *"Saldo disponível insuficiente para enviar ao terceiro: 40 KG"*.
- **As três primeiras retenções não tiram nada do patrimônio nem da contagem.** O material está lá.
- **A quarta tira da contagem**, porque não está lá (13.2).
- **O consumo contra uma reserva não é bloqueado pela própria reserva.** Quem reservou pode consumir: na hora do consumo, a parte reservada que está sendo usada é somada de volta antes da comparação (9.4).
- **Valor do estoque usa a quantidade física, não o disponível** — material reservado, bloqueado ou em inspeção continua sendo patrimônio e continua valendo dinheiro.

### 22.2 Custo médio ponderado

**A fórmula, aplicada a cada entrada com custo informado:**

> **custo médio novo = ( saldo anterior × custo unitário atual + quantidade que entra × custo informado ) ÷ ( saldo anterior + quantidade que entra )**
>
> arredondado a **4 casas decimais**.
>
> Quando o saldo anterior é **zero**, o custo médio passa a ser simplesmente o **custo informado** — não há histórico para ponderar.

Na mesma operação, o **custo unitário** do material passa a valer o custo informado (é o "último custo de compra").

**Exemplo:**

| | Quantidade | Custo unitário | Valor |
|---|---|---|---|
| Saldo anterior | 100 KG | R$ 10,00 | R$ 1.000,00 |
| Entrada | 50 KG | R$ 13,00 | R$ 650,00 |
| **Resultado** | **150 KG** | **R$ 11,00** | **R$ 1.650,00** |

`(100 × 10,00 + 50 × 13,00) ÷ 150 = 1.650 ÷ 150 = 11,00`

**Qual custo o sistema usa quando pergunta "quanto vale uma unidade?":**

> Se o **custo médio** for maior que zero, ele manda. Caso contrário, vale o **custo unitário** do cadastro. Se nenhum dos dois existir, vale zero.

Essa é a leitura usada em **todo** o sistema — dashboard, relatório de posição de estoque, valoração de requisição (8.3), valor da chapa na transformação — de modo que duas telas que respondem à mesma pergunta devolvem o mesmo número.

**O que alimenta o custo:**

| Operação | Alimenta o custo médio? |
|---|---|
| Entrada por **nota fiscal** (Processar Nota), com valor unitário na linha do item | **Sim** |
| Entrada manual pela tela de Movimentações com custo digitado | **Sim** |
| Entrada de resultado de transformação classificado como **peça** | **Sim** (com o custo rateado) |
| Entrada de resultado classificado como **sobra** | **Não** (entra sem custo; não apaga o custo que o material já tinha) |
| **Entrada de retalho** (Sobras e Retalhos → Gerar retalho) | **Não** — sempre sem custo, pela mesma razão da sobra: o projeto já pagou a peça inteira na saída (seção 19) |
| Nota **sem** valor (conserto, amostra, brinde, material de cliente) | **Não** |
| Entrada sem custo informado | **Não** |

**O que NÃO altera o custo:**

| Operação | Efeito no custo |
|---|---|
| **Qualquer saída** (saída, produção, sucata, perda, devolução ao cliente, consumo em terceiro) | **nenhum** |
| **Estorno / cancelamento de movimentação** | **nenhum** |
| Transferência entre prateleiras | nenhum |
| Bloqueio, desbloqueio, quarentena, decisão de inspeção | nenhum |
| Reserva e liberação de reserva | nenhum |

Saída não muda custo médio porque a média ponderada é uma média **de aquisição**: tirar unidades não muda quanto elas custaram. E o estorno não reverte o custo porque uma reversão exata é indefinida depois que outras entradas já entraram no meio — o caminho para acertar um custo errado é **uma nova entrada com o custo certo**, não um estorno.

> **Nota importante para quem apresenta o sistema:** o custo médio é alimentado **daqui para frente**. Materiais que nunca receberam uma entrada com valor mostram o custo unitário do cadastro, que é a informação disponível — não há custo médio inventado.

### 22.3 Rateio de custo na transformação

**A regra:** o valor da chapa consumida é distribuído **por quantidade, entre as peças**; a **sobra entra a custo zero**; o custo do serviço do terceiro **soma** quando informado.

**As fórmulas:**

> **valor total = ( custo unitário da chapa × quantidade consumida ) + custo do serviço**
>
> **custo unitário de cada peça = valor total ÷ soma das quantidades classificadas como PECA** (arredondado a 4 casas)
>
> **custo de cada sobra = 0**

**Exemplo — uma chapa que vira 40 peças mais uma sobra grande:**

Chapa de R$ 1.000,00 consumida por inteiro, sem custo de serviço, resultando em 40 peças iguais e 1 sobra que corresponde a cerca de um terço da chapa.

| Resultado | Classificação | Quantidade | Custo unitário aplicado | Valor |
|---|---|---|---|---|
| Peça cortada | PECA | 40 UN | R$ 25,0000 | R$ 1.000,00 |
| Retalho | SOBRA | 1 UN | R$ 0,0000 | R$ 0,00 |
| **Total** | | | | **R$ 1.000,00** |

`1.000,00 ÷ 40 = 25,00 por peça`

**Por que a sobra entra a zero.** O rateio por quantidade não quebra entre as peças — elas são iguais, e dividir por 40 dá o mesmo resultado que dividir por peso. **Ele quebraria na sobra.** Se o retalho entrasse no divisor como se fosse mais uma linha, seriam 41 linhas e cada uma levaria `1.000,00 ÷ 41 = R$ 24,3902`, ou seja R$ 24,39 tanto para cada peça quanto para o retalho.

Repare que a peça até ficaria **um pouco mais barata** (R$ 24,39 contra R$ 25,00) — o problema não é o tamanho da diferença, é o que a conta **afirma**: que **uma unidade de retalho vale o mesmo que uma peça pronta**. No mundo real isso é falso. Sobra de corte não vale, por unidade, o que vale uma peça acabada — vale menos, e o quanto menos depende do formato e da massa daquele pedaço.

E não há como medir esse "quanto menos" dentro do sistema, porque **peso unitário é campo opcional** no cadastro: sem ele, qualquer valor entre zero e R$ 24,39 seria um número arbitrado pelo sistema em cima de um pedaço cuja utilidade futura ninguém conhece. Por isso **zero é a escolha conservadora**, e ela tem três consequências boas:

1. **o patrimônio nunca infla** — nenhum valor é atribuído a um pedaço que talvez nunca seja usado;
2. **o total sempre fecha** — as 40 peças a R$ 25,00 somam exatamente os R$ 1.000,00 que saíram da chapa, sem sobra de valor para explicar;
3. **se a sobra for vendida como sucata um dia, ela aparece como ganho** — nunca como uma perda inventada contra um custo que o sistema tinha atribuído sozinho.

**O custo do serviço do terceiro** é opcional e é o **valor total da nota daquela transformação**. Se informado, soma ao valor a ratear — *"a peça não é peça sem o corte"*. Se em branco, não entra: o sistema **não estima**. No mesmo exemplo, com R$ 200,00 de serviço:

`(1.000,00 + 200,00) ÷ 40 = R$ 30,00 por peça`; sobra continua em R$ 0,00; total R$ 1.200,00.

**A garantia: o valor que sai é igual ao valor que entra.**

> **soma de ( quantidade × custo unitário aplicado ) de todas as linhas = valor total**

O sistema calcula essa soma e a compara com o valor total a cada transformação, tolerando apenas o arredondamento de 4 casas. A diferença tem nome — **resíduo** — e, quando existe, é registrada na justificativa do movimento de baixa da chapa, visível no livro de movimentações.

**Dois casos de fronteira, tratados de propósito:**

| Caso | O que o sistema faz |
|---|---|
| **Nenhuma peça, só sobra** | permitido. Não há divisor, todas as linhas ficam a custo zero e o valor **evapora** — registrado na justificativa como "R$ 1.000 sem destino (nenhuma peca no resultado — so sobra)". A chapa que voltou só como retalho é exatamente o caso em que o valor foi consumido pelo processo; inflar o retalho para "fechar a conta" seria inventar patrimônio |
| **Chapa sem custo cadastrado** | permitido e silencioso. Material sem custo é caso real; a transformação roda com custo zero, que é a **verdade**, e não com um custo estimado |

E o rateio roda **antes** de qualquer efeito: classificação inválida ou quantidade zerada recusam a transformação inteira antes de a chapa ser baixada — *"Quantidade do resultado deve ser maior que zero (material 88: 0)"*, *"Classificacao invalida no resultado do material 88: X. Validas: PECA, SOBRA"*.

### 22.4 Rendimento

**A fórmula:**

> **peso que saiu = peso unitário da chapa × quantidade consumida**
>
> **peso que voltou = soma de ( quantidade de cada resultado × peso unitário daquele material )**
>
> **rendimento % = ( peso que voltou ÷ peso que saiu ) × 100** — apresentado com **2 casas decimais**

Note que **peças e sobras entram os dois** no peso que voltou: o rendimento mede massa recuperada, e retalho é massa recuperada.

**Exemplo:** chapa de 80 kg consumida por inteiro; voltaram 40 peças de 1,5 kg (60 kg) e uma sobra de 15 kg.

`(60 + 15) ÷ 80 × 100 = 93,75%` — o que não fechou (5 kg) virou cavaco no corte.

**Condição para ser calculável:** todos os materiais envolvidos — a chapa e cada resultado — precisam ter **peso unitário cadastrado e maior que zero**. Faltando qualquer um, o sistema devolve "não calculável" **nomeando os materiais que faltam**, e a transformação segue gravada normalmente.

**Peso zero conta como não cadastrado** — peso zero não existe fisicamente, e tratá-lo como válido daria "rendimento 0%" com cara de resultado.

**Rendimento acima de 100% é calculado e mostrado, não recusado.** Ver "116%" na tela é o que faz alguém ir conferir o cadastro de peso; recusar esconderia a divergência. O rendimento nunca é validado contra um mínimo e nunca impede a operação.

---

## 23. Cuidados na operação

Quatro pontos que valem para o dia a dia e que não se deduzem das telas. Nenhum deles impede o trabalho — todos dizem **por qual caminho** fazer.

**1. A conferência de estoque é a ferramenta da contagem física — use-a para isso.** A
homologação de uma conferência com ajustes vira uma movimentação de verdade no livro: o saldo do
material recebe a quantidade contada (mais o que estiver em poder de terceiros, que nunca é
contável fisicamente — 13.2), com autor, justificativa e data registrados, e a divergência fica
no histórico. É exatamente o que uma contagem de galpão precisa: você conta a prateleira, o
sistema aplica e audita.

**2. Para acertar o saldo de um material de cliente, use o Ajuste da tela de Movimentações — ou a conferência de inventário, que agora exige a mesma autorização.** A permissão especial (restrita a Administrador, descrita em 16.8) é verificada nos dois caminhos, com o registro de auditoria nomeando o cliente proprietário. Correção de saldo de material que pertence a um cliente é o número que ele vai conferir e cobrar: faça-a por um caminho que peça essa autorização e deixe esse rastro.

**3. Não intercale, no mesmo material, homologação de inventário e contagem por localização.** A homologação escreve o total do material; a contagem por prateleira recalcula o total a partir da soma das posições. Se você homologar uma conferência e, em seguida, fizer uma contagem por localização naquele mesmo material, o total passa a vir das posições — e o número homologado é substituído. Escolha um dos dois caminhos por material: ou o total vem da conferência, ou vem da soma das prateleiras.

**4. Um ajuste que deixaria alguma retenção maior que o total é recusado — exceto quando o ajuste é escopado a uma localização específica.** Para o ajuste do material inteiro (o caminho que a tela de Movimentações usa sem escolher uma prateleira, e o caminho que toda conferência de inventário usa), o sistema **recusa** e diz qual retenção pesa e o mínimo aceitável (13.5) — reservado, bloqueado, em inspeção e em poder de terceiros continuam protegidos automaticamente. **A única exceção é o ajuste escopado a uma localização/prateleira específica**: ali o total só é conhecido depois de somar todas as posições, e essa combinação ainda não tem a mesma guarda — um material com 8 unidades bloqueadas cujo total, ajustado por localização, cai para 1, ainda fica com a retenção maior que o total, e o disponível calculado (6.1) vira negativo sem aviso. Para esse caso específico, a ordem correta continua sendo soltar a retenção primeiro:

| Retenção a soltar | Caminho próprio |
|---|---|
| **Reservado** | liberar a reserva na tela de Reservas (9.6) |
| **Bloqueado** | Desbloquear Material, na tela de Inspeções (15.3) |
| **Em inspeção** | decidir a inspeção — aprovar ou reprovar (15.2) |
| **Em poder de terceiros** | receber o retorno, encerrar com destino ou cancelar a remessa (17.5 a 17.7) |

Com as retenções resolvidas, o ajuste por localização também fica seguro e o disponível volta a fechar.

---

## 24. Onde pedir ajuda e o que este documento não cobre

**Quando o sistema recusa alguma coisa, leia a mensagem inteira antes de procurar ajuda.** Este módulo foi construído para que a recusa diga três coisas: o que faltou, com que números, e **por qual caminho** resolver — qual tela abrir, qual perfil pedir, qual documento informar. Boa parte das dúvidas se resolve na própria frase.

**Se o problema for de permissão**, a mensagem informa qual é o seu perfil e qual ação faltou; quem resolve é um usuário com perfil **Administrador** do módulo, em Configurações → aba "Perfis de Acesso" (5.6).

**Se o problema for de dado**, o extrato do material (6.9) e o livro de movimentações mostram a história completa do item — quem lançou, quando, com que motivo, e qual era o saldo antes e depois. Toda operação relevante fica registrada (5.7).

**Este documento não cobre:**

- **instalação, atualização e configuração de servidor** do sistema — nada aqui trata de ambiente, acesso à rede, cópias de segurança ou implantação;
- **o funcionamento interno dos outros módulos** com os quais o Almoxarifado conversa (Compras, Contas a Pagar, Ordens de Serviço, Projetos, Clientes). Este manual descreve apenas o que o Almoxarifado faz com essa informação: o pedido de compra que alimenta um recebimento, a conta a pagar gerada ao processar a nota, a OS ou o projeto que dá destino a uma saída;
- **o que ainda não existe no sistema.** O manual descreve o comportamento de hoje. Se uma função que você espera não está descrita aqui, o mais provável é que ela ainda não exista — e não que exista escondida numa tela. Quando uma decisão de escopo é deliberada, o texto diz isso explicitamente ("não é modelado", "não bloqueia", "é registro de cadastro").
