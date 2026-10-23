# Frota — manual do sistema

Este manual descreve **como o módulo Frota funciona hoje**, para quem vai usar ou apresentar o sistema. Está organizado pelo que a
pessoa faz. As mensagens entre aspas são as que aparecem na tela, palavra por palavra.

## 1. Quem é quem (perfis)

O módulo tem três perfis. O perfil decide o que a pessoa vê e o que ela pode gravar.

| Perfil | Vê | Grava |
|---|---|---|
| **Administrador de Frota** (o gestor) | Tudo: painel, alertas, relatórios, todos os cadastros e lançamentos | Tudo: veículos, motoristas, manutenções, abastecimentos, viagens, checklists, multas, documentos; aprova e cancela viagem; exclui; exporta a planilha |
| **Motorista** | Só o que é **dele**: os próprios registros, abastecimentos, viagens e multas; no cadastro de motoristas, só ele mesmo | Pelo **Meu painel**: saída, retorno, inspeção e abastecimento, sempre em nome dele |
| **Consulta** | Painel, alertas, relatórios e todas as telas de cadastro e lançamento, só para ler (inclusive CPF e CNH dos motoristas e os valores) | Nada (só exporta a planilha). As telas aparecem sem os botões de novo, editar, aprovar e excluir |

Como o perfil é decidido:

- É **Administrador de Frota** quem é superadmin, administrador geral do sistema ou administrador do módulo Frota (marcado no
  cadastro de usuário). Esse perfil vem só do cadastro de usuário.
- Os outros recebem **Consulta** ou **Motorista** em **Frota → Perfis de acesso** (veja 3.8).
- Quem tem acesso ao módulo Frota, não é administrador e não recebeu perfil nenhum é **Motorista**.
- O perfil vale a partir do próximo clique da pessoa, sem ela sair e entrar de novo. O menu e os botões que ela vê se atualizam quando
  ela recarrega a página, ou sozinhos quando ela abre o **Dashboard Frota** ou o **Meu painel** (eles percebem a mudança).

Para alguém usar o módulo, o administrador precisa dar a ele **acesso ao módulo Frota** na tela de usuários.

### O que o motorista não pode

- Ver o painel do gestor e os alertas. Se tentar, o sistema responde *"Sem permissão para esta operação"* — na prática, ao abrir
  **Frota** ele é levado direto para o **Meu painel**.
- Ver os dados dos colegas (CPF, CNH, lançamentos).
- Alterar um lançamento que não é dele: *"Você só pode alterar os seus próprios registros"*.
- Aprovar ou cancelar viagem: *"Só o gestor da frota pode aprovar ou cancelar viagem"*.
- Lançar multa ou documento, nem ver a lista de documentos dos veículos (aberta pelo endereço, ela vem vazia).
- Lançar qualquer coisa em nome de outro motorista: o sistema sempre grava o motorista ligado ao login dele, seja qual for o
  escolhido no formulário.

---

## 2. Motorista

### 2.1 Entrar

1. Entre no sistema com o seu login e escolha **Frota**.
2. Você cai no **Meu painel**. O menu mostra só **Meu painel**, **Solicitar Material** e **Minhas Requisições**.
3. A tela diz "Olá, (seu nome)".

Se aparecer *"Seu usuário não está ligado a um motorista. Peça ao gestor da frota para fazer o vínculo."*, o seu login ainda não foi
ligado ao seu cadastro de motorista. Só o gestor faz isso (veja 3.2). Enquanto isso, nenhum botão de registro aparece.

### 2.2 Os botões do painel

| Botão | Quando aparece | O que faz |
|---|---|---|
| **Saída** | quando você **não** está com nenhum veículo | Preenche o formulário e abre a viagem |
| **Retorno** | quando você **está** com um veículo | Preenche o formulário e fecha a viagem |
| **Inspeção** | sempre | Preenche o formulário, sem viagem (inspeção periódica) |
| **Abastecimento** | sempre | Registra o abastecimento |

Quando você está com um veículo, o painel mostra: "Você está com o veículo (placa) desde (data) às (hora), destino (destino)."

### 2.3 O formulário (Saída, Retorno, Inspeção)

É o formulário de papel na tela:

- **Veículo** — na Saída e na Inspeção você escolhe; no Retorno é o da sua viagem, já preenchido ("Veículo: (placa) · saiu com
  (km) km", ou "· saiu com (horas) h" numa máquina por horímetro).
- **KM atual (o que está no painel)** — o número do painel do veículo. Obrigatório. Numa **máquina medida por horímetro**
  (empilhadeira, por exemplo) o campo se chama **Horímetro atual (horas no painel)** e aceita casas decimais. Embaixo do campo aparece
  o último número registrado naquele veículo: *"Último registrado neste veículo: 1.800 km"* (ou *"… 120 h"*). Veja as regras em 2.10.
- **Data** e **Horário** — já vêm com agora; dá para mudar.
- **Combustível** — Vazio, ¼, ½, ¾ ou Cheio (opcional; toque de novo para desmarcar).
- **Saindo de onde**, **Indo para onde**, **Para quê (finalidade)** — só na Saída, opcionais.
- **Condições do veículo** — os 12 itens do papel, cada um **OK**, **N/A** (não se aplica) ou **Falha**:
  Pneus e estepe · Faróis / lanternas · Setas / luz de freio · Parabrisa / vidros · Espelhos / retrovisores · Limpadores / água ·
  Óleo do motor / vazamentos · Arrefecimento / nível · Freios / freio de estacionamento · Buzina / cintos · Documentos / equipamentos
  · Carroceria / amarração da carga.
- **Avarias** — toque **+ Adicionar avaria**, escolha **onde** (Lado esquerdo, Lado direito, Em cima (teto), Frente, Traseira),
  **o que é** (Risco, Amassado, Trinca, Quebrado, Outro) e, se quiser, uma descrição; **Incluir avaria**. Pode haver várias; cada uma
  tem **Remover**.
- **Observações** — texto livre.

O botão **Salvar** só acende quando os 12 itens estão marcados; enquanto faltar algum, o rodapé mostra "Faltam (N) de 12 itens.".
Ao salvar, aparece "Saída registrada", "Retorno registrado" ou "Inspeção registrada" e você volta ao painel.

Se o sistema recusar, a mensagem aparece em vermelho no topo do formulário e **nada é gravado**; o que você digitou continua lá.

### 2.4 Sair com o veículo (Saída)

A saída grava o formulário **e abre a viagem** do veículo, em seu nome, com o km e a data/hora informados. A viagem nasce **em
andamento**, sem precisar de aprovação. Se o gestor já tinha aprovado uma viagem para você com esse mesmo veículo, a saída usa essa
viagem (ela passa a "em andamento") em vez de criar outra.

O que bloqueia a saída:

| Situação | Mensagem |
|---|---|
| Você já está com um veículo | *"Você já tem uma saída sem retorno. Registre o retorno primeiro."* (na tela, o botão Saída nem aparece) |
| O veículo está com outro motorista | *"Este veículo já está em uso (saída sem retorno)."* (na tela, o veículo nem aparece na lista) |
| O veículo está em manutenção | *"Veículo em manutenção. Fale com o gestor da frota."* (na tela, ele aparece com "(em manutenção — indisponível)" e não pode ser escolhido) |
| Sem veículo | *"Escolha o veículo"* |

O que **não** bloqueia: marcar **Falha** num item ou registrar uma avaria. A saída é aceita e o gestor recebe um alerta (veja 3.3).
Decidir se o veículo pode rodar é do gestor.

### 2.5 Voltar (Retorno)

O retorno fecha a **sua** viagem em andamento: grava o km e a data/hora de volta e calcula o **km rodado = km do retorno − km da
saída**. A viagem passa a **concluída**. Numa máquina por horímetro, grava o horímetro de volta (sem km rodado). O retorno pede o
número na mesma medida em que a viagem **saiu**: se ela saiu com km, o retorno pede km, mesmo que o cadastro do veículo tenha mudado
depois.

| Situação | Mensagem |
|---|---|
| km do retorno menor que o da saída | *"KM do retorno (10000) menor que o KM da saída (10050). Confira o hodômetro."* (com os seus números) |
| horímetro do retorno menor que o da saída (máquina) | *"Horímetro do retorno (124 h) menor que o da saída (125 h). Confira o painel."* (com os seus números) |
| Data/hora do retorno antes da saída | *"Data/hora do retorno anterior à saída (2026-10-23 08:00)."* (com a data e hora da sua saída, no formato ano-mês-dia) |
| Você não tem saída aberta | *"Você não tem saída aberta para registrar o retorno."* (na tela, o botão Retorno só aparece com viagem aberta) |

km do retorno **igual** ao da saída é aceito (km rodado 0). Essas duas recusas são definitivas: o botão **Confirmar mesmo assim**
(2.10) não passa por cima delas.

### 2.6 Inspeção

Grava só o formulário, sem abrir nem fechar viagem. Serve para a inspeção periódica e pode ser feita com veículo em manutenção.

### 2.7 Situação do registro: OK, PENDÊNCIA, INCOMPLETO

Todo registro (saída, retorno, inspeção) recebe uma situação, decidida nesta ordem:

1. **PENDÊNCIA** — se algum dos 12 itens está em **Falha**, **ou** se há pelo menos uma avaria.
2. **INCOMPLETO** — se não é pendência e faltou responder algum dos 12 itens.
3. **OK** — os 12 respondidos (OK ou N/A), nenhuma Falha, nenhuma avaria.

**N/A** conta como respondido e não gera pendência. Pela tela do motorista não é possível salvar com item faltando, então o
INCOMPLETO só aparece em registros feitos por outro caminho.

No checklist simples do gestor (os 7 itens sim/não, veja 3.4), a régua é a mesma ideia: algum item "não" ou alguma avaria →
**PENDÊNCIA**; algum item não informado → **INCOMPLETO**; os 7 "sim" → **OK**.

### 2.8 Abastecer

**Abastecimento**: veículo, **KM atual** (ou **Horímetro atual**, numa máquina por horímetro), **Litros**, **Valor total (R$)**, data
(vem com hoje), posto e observações. Se você está com um veículo, ele já vem escolhido. O abastecimento é gravado em seu nome. Ao
salvar: "Abastecimento registrado". O abastecimento de máquina por horímetro guarda as horas e **não** entra no cálculo de km/L.

| Situação | Mensagem |
|---|---|
| Sem veículo | *"Veículo, litros e data são obrigatórios"* |
| Sem KM | *"Informe o KM atual"* |
| Sem horímetro (máquina por horímetro) | *"Informe o horímetro atual"* |
| Sem litros, ou litros zero | *"Informe os litros"* |
| Valor negativo | *"Valor inválido"* |

O valor pode ficar em branco (vale zero). O preço por litro é **valor total ÷ litros**. O cálculo do km/L está em 3.6.

### 2.9 Ver os meus registros

Abaixo dos botões, **Meus registros** mostra as suas últimas 30 saídas/retornos/inspeções (tipo, placa, data, hora, km — ou horas,
como "125 h", na máquina — e a etiqueta OK / PENDÊNCIA / INCOMPLETO) e os seus últimos 30 abastecimentos (placa, litros, data, km ou
horas, valor). É só para consulta: para corrigir um
lançamento, fale com o gestor.

### 2.10 Regras de data, hora e km que valem em todos os formulários

| Situação | O que acontece |
|---|---|
| Data depois de hoje | Recusa: *"Data no futuro"*. Vale o dia de Brasília; um horário adiantado **no mesmo dia** é aceito |
| Data num formato que não existe | *"Data inválida"* |
| Horário fora de HH:MM | *"Horário inválido"* |
| KM vazio ou negativo | *"Informe o KM atual"* |
| Horímetro vazio ou negativo (máquina por horímetro) | *"Informe o horímetro atual"*. Casas decimais com ponto no campo numérico; texto com vírgula (`1234,5`), espaço ou letras é recusado com a mesma mensagem (o mesmo vale para o KM: *"Informe o KM atual"*) |
| KM maior que o km do veículo | O km do veículo sobe para o novo valor |
| KM igual ao km do veículo | Aceito |
| KM **menor** que o km do veículo | **Para e pergunta** (nada é gravado): *"KM menor que o atual do veículo (1.800 km). Confira o hodômetro antes de salvar."* — com o km do veículo no formato brasileiro. Se o número está certo (por exemplo, um abastecimento de ontem lançado hoje), toque **Confirmar mesmo assim**: grava, e o km do veículo continua o maior. Se mudar o número ou o veículo, o botão some e o Salvar confere de novo |
| Horímetro menor que o do veículo | O mesmo, com *"Horímetro menor que o atual do veículo (120 h). Confira o painel antes de salvar."* |
| Veículo inativo, vendido ou excluído | *"Veículo não encontrado"* (ele nem aparece na lista) |

Enquanto você digita, se o número ficar menor que o último registrado no veículo, aparece logo abaixo do campo *"Menor que o último
registrado. Confira o painel antes de salvar."* — é só um aviso; quem decide é o Salvar. O "último registrado" é o que o sistema sabia
quando você abriu o formulário: se outro motorista lançou depois, a pergunta do Salvar usa o número novo.

Na **máquina medida por horímetro** o motorista registra as horas do painel: elas atualizam o **horímetro** do veículo e não mexem no
km. Ser máquina ou não é o campo **Medição** do cadastro do veículo (3.1).

---

## 3. Gestor (Administrador de Frota)

### 3.1 Cadastrar veículos

**Frota → Veículos → Novo Veículo**: placa (obrigatória, única; o sistema guarda em maiúsculas, sem traço — *"Placa já cadastrada"*
se repetir), marca, modelo, ano, tipo, se mede por **km** ou **horímetro**, km atual, combustível, consumo esperado (km/L, usado no
alerta de consumo baixo), setor, centro de custo, condutor responsável, status (**ativo**, **manutencao**, **inativo**, **vendido**).

O status pesa no portal: **manutencao** impede a saída (a inspeção continua possível); **inativo** e **vendido** tiram o veículo da
lista do motorista.

A **Medição** decide o que o motorista digita no portal: **Quilometragem** → "KM atual"; **Horímetro** → "Horímetro atual", em horas,
que atualiza o **Horímetro Atual** do veículo e não mexe no km. A lista de veículos mostra "KM/Horímetro" pela medição. Ao salvar o
cadastro de um veículo, o km e o horímetro gravados são os do formulário: se um motorista lançou um número maior enquanto o formulário
estava aberto, salvar o cadastro volta ao número do formulário.

### 3.2 Cadastrar o motorista e ligar ao login

**Frota → Motoristas → Novo Motorista** (ou editar um): nome (obrigatório), CPF, CNH (número, categoria, validade), telefone, e-mail,
setor, status e **Usuário de acesso (portal do motorista)**.

O campo **Usuário de acesso** é o que liga o cadastro ao login. Sem ele, o motorista entra e vê o aviso de que não está ligado.

- A lista traz os usuários ativos do sistema; quem já está ligado a outro motorista aparece com "(ligado a (nome))".
- **Um login só pode estar ligado a um motorista ativo.** Tentar ligar o mesmo login a outro: *"Este usuário já está ligado ao
  motorista (nome)"*.
- Para desfazer o vínculo, escolha **— nenhum —** e salve.
- Se o login foi desativado depois de ligado, ele continua aparecendo **só** no motorista que o tem, com "(inativo)", e o cadastro
  salva normalmente. Trocar para um login inexistente ou desativado: *"Usuário não encontrado"*.
- Se o login escolhido está com o perfil **Consulta**, aparece embaixo do campo: *"Este usuário está com o perfil Consulta no Frota: ele
  vê o painel, mas não consegue registrar no portal. Para ele registrar, mude o perfil em Frota → Perfis de acesso."*. O aviso não
  impede salvar; o motorista só vai conseguir registrar depois que o perfil voltar a Motorista.

### 3.3 Acompanhar o painel e os alertas

**Frota → Dashboard Frota** mostra 9 cartões (veículos ativos, em manutenção, manutenção vencida, OS em aberto, combustível no mês,
alertas, custo total, total de veículos, checklists hoje), a lista de alertas, custos por categoria e os últimos abastecimentos. O
painel é visto pelo Administrador de Frota e pelo Consulta.

Os alertas, do mais grave para o menos (aparecem até 15):

| Alerta | Quando aparece | Gravidade |
|---|---|---|
| Documento (IPVA, seguro…) | Documento **ativo** vencendo dentro do prazo de aviso dele (padrão 30 dias) ou vencido | crítico se vencido; alto até 7 dias; médio |
| CNH | CNH de motorista ativo vencendo em até 30 dias, ou vencida | crítico se vencida; alto |
| Manutenção | Próxima revisão em até 15 dias pela data, ou faltando 500 km ou menos pelo km. Na máquina por horímetro, a "próxima revisão (KM)" é lida em **horas** e comparada com o horímetro: avisa faltando 50 h ou menos | crítico se passou; médio |
| Multa pendente | Multa pendente vencendo em até 15 dias | alto |
| **Checklist com pendência** | Saída, retorno ou inspeção com situação **PENDÊNCIA**, com data de hoje até 7 dias atrás | alto |
| Consumo baixo | Média de km/L dos últimos 60 dias abaixo de 70% do consumo esperado do veículo | médio |

O alerta de checklist diz *"Checklist com pendência — (placa)"* e, embaixo, o que falhou e quem registrou — por exemplo
*"Falha: Pneus e estepe · Ana Teste"*, ou *"1 avaria(s) · Ana Teste"* — e "Registrado em (data)". Ele some sozinho depois de 7 dias;
não é preciso fechar.

### 3.4 As telas de cadastro e lançamento

Todas funcionam igual: tabela, busca, às vezes filtro, **Novo…**, e na linha **editar** (lápis) e **excluir** (lixeira). Para quem
está como **Consulta**, esses botões (e o de aprovar viagem) não aparecem: a tela é só para ler.

| Tela | O que guardar de importante |
|---|---|
| **Manutenções** | Preventiva/corretiva, oficina, custo, km, próxima revisão (km e data). Criada como **em andamento**, põe o veículo em manutenção (que bloqueia a saída no portal) |
| **Abastecimentos** | Mostra os lançados pelo portal e pelo escritório, com **Km/L**. Editar litros ou valor refaz o preço por litro. Para máquina por horímetro, use **Horímetro no abastecimento (máquina)** e deixe o KM vazio: a coluna KM mostra as horas ("125 h") e a linha fica sem km/L. O escritório pode lançar km menor que o do veículo (lançamento atrasado) sem pergunta |
| **Viagens** | Saída/retorno, km, origem, destino, finalidade, status. O botão **Aprovar** (✓) aparece só em viagem **solicitada**. Para máquina por horímetro: **Horímetro saída (máquina)** e **Horímetro retorno (máquina)**; a coluna KM rodado mostra as horas usadas ("6,5 h") |
| **Checklist Diário** | Lista todos os registros (Data, Placa, **Tipo**: Saída/Retorno/Inspeção, Motorista, **KM**, **Situação**, Observações). O **Novo Checklist** daqui é o formulário simples de 7 itens sim/não (pneus, óleo, luzes, freios, extintor, documentos, limpeza), sem avarias. Não edita |
| **Multas**, **Documentos** | Só o gestor lança e altera |

Regras das viagens (valem também para o gestor):

| Situação | Mensagem |
|---|---|
| Aprovar viagem que não está **solicitada** | *"Só é possível aprovar viagem solicitada"* |
| KM retorno menor que KM saída | *"KM do retorno (…) menor que o KM da saída (…). Confira o hodômetro."* |
| Horímetro retorno menor que horímetro saída | *"Horímetro do retorno (… h) menor que o da saída (… h). Confira o painel."* |
| Horímetro que não é número (com vírgula, letras) ou negativo, em Viagens ou Abastecimentos | *"Horímetro inválido"* (nada é gravado) |
| Data/hora de retorno antes da saída | *"Data/hora do retorno anterior à saída (…)."* (se uma das duas não tem hora, compara só o dia) |
| Pôr em andamento uma viagem de veículo que já tem outra em andamento | *"Este veículo já está em uso (saída sem retorno)."* |
| Pôr em andamento uma viagem de motorista que já tem outra em andamento | *"Você já tem uma saída sem retorno. Registre o retorno primeiro."* |

Uma viagem nova sem status nasce **solicitada**. O km rodado é calculado (retorno − saída) quando os dois km estão preenchidos.

**Motorista esqueceu de registrar o retorno:** o veículo fica preso como "em uso". Em **Viagens**, edite a viagem, preencha **KM
retorno** (numa máquina por horímetro, **Horímetro retorno (máquina)**, e deixe o KM vazio) e mude o status para **concluida**. O
veículo volta a aparecer na saída. Os campos de km e de horímetro estão nos dois formulários para todos os veículos: o sistema não
confere se o número digitado no km de uma máquina é, na verdade, de horas.

### 3.5 Exportar a planilha

**Exportar planilha** está no **Dashboard Frota** (tudo) e em **Relatórios** (usa o período escolhido na tela). Baixa o arquivo
`controle-de-frota-(data de hoje).xlsx`, no formato da planilha de controle da empresa, com seis abas:

| Aba | Colunas | Período |
|---|---|---|
| **Cadastro Frota** | Placa, Tipo, Marca, Modelo, Ano, KM Atual, Responsável, Próxima Revisão KM, Próxima Revisão Data, Situação, Horímetro Atual | sai inteira |
| **Viagens e KM** | Data, Veículo, Condutor, Finalidade, Origem, Destino, Saída, Retorno, KM Inicial, KM Final, KM Percorrido, Status, Observações, Horímetro Inicial, Horímetro Final | pela data de saída |
| **Checklist** | Data, Horário, Tipo, Veículo, Condutor, KM, Combustível, os 12 itens, Avarias, Status Geral, Observações, Horímetro | pela data do registro |
| **Abastecimentos** | Data, Veículo, Condutor, KM, Litros, Valor Total R$, Preço por Litro, KM desde Abastec. Anterior, Consumo km/L, Posto, Observações, Horímetro | pela data |
| **Manutenções** | Data, Veículo, Tipo, Serviço, Fornecedor, KM Serviço, Custo R$, Próxima Revisão KM, Próxima Revisão Data, Status, Observações | pela data |
| **Documentos** | Veículo, Documento, Vencimento, Dias até Vencer, Status, Observações | sai inteira |

Como cada coluna é preenchida:

- **Datas** saem como texto no formato ano-mês-dia (ex.: 2026-10-23).
- **Horímetro** (colunas no fim de quatro abas, que a planilha de controle não tinha): preenchidas só para máquina por horímetro; nela
  as colunas de KM ficam vazias. **Horímetro Atual** (Cadastro Frota) só aparece na máquina.
- **Próxima Revisão** (Cadastro Frota): a menor revisão ainda por vir entre as manutenções do veículo — km acima do km atual (na
  máquina, acima do horímetro atual), data de hoje em diante. **Responsável**: o condutor responsável do veículo, ou o setor.
- **Saída** (Viagens): a hora; **Retorno**: a hora, ou dia e hora se voltou em outro dia. **KM Percorrido** = KM Final − KM Inicial.
- **Itens** (Checklist): Conforme (OK), Não conforme (Falha), N/A, ou vazio se não respondido. No checklist simples do gestor, só os
  5 itens que existem nos dois formulários são preenchidos (pneus, faróis, óleo, freios, documentos). **Avarias**: uma por uma, separadas
  por ponto e vírgula, no formato "Lateral esquerda: risco — descrição" (os lados saem como Lateral esquerda, Lateral direita,
  Superior, Frente, Traseira; os tipos em minúsculas: risco, amassado, trinca, quebrado, outro). **Status Geral**: OK, PENDÊNCIA ou INCOMPLETO (régua da seção 2.7).
- **Manutenções**: Status Planejada (agendada), Em andamento, Concluída; Fornecedor = oficina.
- **Documentos**: só os documentos com status **ativo** (o renovado não aparece). **Status**: VENCIDO (passou), ATENÇÃO (vence em até
  30 dias) ou EM DIA.

Se der erro ao gerar, aparece "Não foi possível gerar a planilha" (ou a mensagem do servidor).

### 3.6 Como o km/L é calculado

Para cada abastecimento de um veículo:

- **KM desde o anterior** = km deste abastecimento − km do abastecimento **anterior em km** do mesmo veículo (o de km imediatamente
  menor, não o de data mais recente).
- **Consumo (km/L)** = KM desde o anterior ÷ **litros deste** abastecimento, arredondado em 2 casas.
- O primeiro abastecimento do veículo (sem anterior) fica sem km/L. Abastecimento sem km fica sem km/L e não serve de anterior para
  ninguém. Se a diferença de km for zero, fica sem km/L.
- Ao **lançar**, **editar** ou **excluir** um abastecimento, o sistema refaz o km/L dele e o do abastecimento **seguinte em km** (nas duas
  posições, se o km ou o veículo mudou). Assim, um abastecimento lançado atrasado entra no lugar certo da sequência.

Exemplo: abastecimentos com km 10200 (40 L) e 10600 (40 L) → o segundo tem 400 km desde o anterior e **10 km/L**. Lançando depois um
de km 10400 com 20 L: ele fica com 200 km e **10 km/L**, e o de 10600 passa a 200 km e **5 km/L**.

O método é o de "tanque cheio": a conta supõe que cada abastecimento completa o tanque.

### 3.7 Relatórios

**Frota → Relatórios**: custo por veículo (manutenção, combustível e multas; manutenção e combustível respeitam o período, multas
somam tudo), consumo médio km/L por veículo, **Imprimir** e **Exportar planilha**. Vistos pelo Administrador de Frota e pelo
Consulta.


### 3.8 Dar o perfil a cada pessoa (Perfis de acesso)

**Frota → Perfis de acesso** aparece só no menu do Administrador de Frota (quem abre o endereço sem ser administrador vê *"Sem permissão
para esta operação"*). A tela lista os usuários ativos do sistema, com busca por nome ou e-mail, em quatro colunas: **Usuário**, **Perfil
no Frota**, **O que isso permite** e **Motorista ligado** (o motorista cujo cadastro está ligado àquele login, ou "—").

- Para cada pessoa há um seletor com **Motorista (padrão)** e **Consulta**. Ao escolher, o sistema grava na hora: *"Perfil definido:
  Consulta"*, ou, voltando ao padrão, *"Perfil removido — o usuário volta ao padrão (Motorista)"*.
- **O que cada um permite**, como a tela escreve: Motorista — *"Registra saída, retorno, inspeção e abastecimento no portal; vê só o que
  é dele."*; Consulta — *"Vê o painel, os alertas, as listas e os relatórios, e exporta a planilha. Não registra nem altera nada."*;
  Administrador de Frota — *"Faz tudo no módulo, inclusive dar perfis."*.
- **Administradores não têm seletor.** Superadmin, administrador do sistema e administrador do módulo Frota aparecem com a etiqueta
  **Administrador** e *"Para dar outro perfil, remova a condição de administrador no cadastro de usuário."*. Se alguém tentar mesmo assim
  (fora da tela), o sistema recusa: *"Este usuário já é administrador (superadmin, administrador do sistema ou administrador do módulo
  Frota) e tem acesso total à frota. Remova essa condição no cadastro de usuário antes de definir outro perfil."*.
- **Ninguém muda o próprio perfil** por esta tela: *"Você não pode mudar o seu próprio perfil por esta tela."*.
- **Avisos na linha.** Quem está como Consulta e é motorista mostra *"Ligado ao motorista (nome): como Consulta, não registra no
  portal."*. Se, além disso, ele está com uma saída sem retorno: *"Tem saída sem retorno: como Consulta, não consegue registrar o retorno.
  Feche a viagem em Frota → Viagens ou volte o perfil para Motorista."*. A mudança é aceita mesmo assim; o aviso diz como resolver.
- **Perfil gravado com valor que o sistema não conhece** aparece no seletor como "(valor) (valor inválido — escolha outro)". Enquanto
  estiver assim, a pessoa não grava nada e só vê o que seria dela como motorista. Escolha **Consulta** ou **Motorista (padrão)**.
  Um Administrador de Frota gravado à parte (sem estar marcado no cadastro de usuário) aparece como "Administrador de Frota (gravado à
  parte)" e pode ser trocado da mesma forma.
- **Perfil não é acesso.** A lista traz todos os usuários ativos; dar Consulta a quem não tem o módulo Frota no cadastro de usuário não
  abre o módulo para ele. Usuários marcados como ocultos não aparecem na lista.
- **Perfil não é vínculo.** Ser Motorista não liga a pessoa a um cadastro de motorista: isso se faz em **Motoristas** (3.2). Para registrar
  no portal ela precisa das duas coisas.
- **Quando vale:** no próximo clique da pessoa. O menu e os botões dela se acertam quando ela recarrega a página, ou sozinhos quando ela
  abre o **Dashboard Frota** ou o **Meu painel**. Numa outra tela do Frota já aberta, até lá, um botão que ela não pode mais usar responde
  *"Sem permissão para esta operação"*.
- **Marcar e desmarcar o administrador do módulo apaga o Consulta.** Se alguém que está como Consulta passa a administrar o módulo Frota
  (no cadastro de usuário) e depois deixa de administrar, volta ao padrão (Motorista). Confira esta tela depois de tirar um administrador.
- O sistema guarda a data da última mudança de cada perfil, mas não quem mudou.

---

## 4. Situações comuns

| Situação | O que fazer |
|---|---|
| Motorista entra e vê "Seu usuário não está ligado a um motorista…" | Gestor: **Motoristas** → editar o motorista → **Usuário de acesso** = o login dele |
| Pessoa do escritório (não administradora) entra no Frota e cai no "Meu painel" | Ela está como Motorista. Gestor: **Perfis de acesso** → escolher **Consulta** na linha dela; ela recarrega a página |
| Consulta não vê o botão de cadastrar ou editar | É assim: Consulta só lê. Para gravar, a pessoa precisa ser Administrador de Frota (cadastro de usuário) |
| Veículo não aparece na Saída | Está com outro motorista (viagem sem retorno), está inativo/vendido, ou aparece como "(em manutenção — indisponível)" |
| Motorista não consegue sair com nenhum veículo | Ele tem uma saída sem retorno: registrar o **Retorno**, ou o gestor conclui a viagem em **Viagens** |
| Abastecimento com km/L estranho | Conferir o km digitado: um km menor que o real entra na sequência pela ordem do km e muda o km/L dele e do seguinte. O portal pergunta antes de gravar km menor que o do veículo, mas o motorista pode confirmar |
| Motorista recebe "KM menor que o atual do veículo (…)" sem ter errado | Alguém registrou um km maior antes (às vezes um erro de digitação para cima). Se o número do painel está certo, ele toca **Confirmar mesmo assim**. Se o km do veículo está errado, o gestor corrige o **KM Atual** em **Veículos** |
| Empilhadeira (ou outra máquina) aparece com km no lugar das horas | No cadastro do veículo, **Medição** = **Horímetro** e o **Horímetro Atual** certo; a partir daí o portal pede as horas |
| Motorista lançou errado | Ele não corrige pelo portal; o gestor edita na tela correspondente (Abastecimentos, Viagens) |
