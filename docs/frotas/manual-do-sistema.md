# Frota — manual do sistema

Este manual descreve **como o módulo Frota funciona hoje**, para quem vai usar ou apresentar o sistema. Está organizado pelo que a
pessoa faz. As mensagens entre aspas são as que aparecem na tela, palavra por palavra.

## 1. Quem é quem (perfis)

O módulo tem três perfis. O perfil decide o que a pessoa vê e o que ela pode gravar.

| Perfil | Vê | Grava |
|---|---|---|
| **Administrador de Frota** (o gestor) | Tudo: painel, alertas, relatórios, todos os cadastros e lançamentos | Tudo: veículos, motoristas, manutenções, abastecimentos, viagens, checklists, multas, documentos, **destinos**; aprova e cancela viagem; trata a pendência dos registros; remove foto de qualquer lançamento pela lista; exclui; exporta a planilha; dá e tira perfis — **inclusive Administrador de Frota** |
| **Motorista** | Só o que é **dele**: os próprios registros, abastecimentos, viagens e multas; no cadastro de motoristas, só ele mesmo | Pelo **Meu painel**: saída, retorno, inspeção e abastecimento, sempre em nome dele, com até 3 fotos na saída, no retorno e na inspeção; manda e remove foto só dos lançamentos dele; **cadastra destinos** pelo "+ Novo destino" da saída |
| **Consulta** | Painel, alertas, relatórios e todas as telas de cadastro e lançamento, só para ler (inclusive CPF e CNH dos motoristas e os valores, e as fotos de todos) | Nada (só exporta a planilha). As telas aparecem sem os botões de novo, editar, aprovar e excluir |

Como o perfil é decidido:

- É **Administrador de Frota** quem é superadmin, administrador geral do sistema ou administrador do módulo Frota. O administrador do
  módulo é marcado no cadastro de usuário **ou** dado por outro Administrador de Frota em **Frota → Perfis de acesso** (veja 3.8) — é a
  mesma marca, vista de duas telas.
- Os outros recebem **Consulta** ou **Motorista** em **Frota → Perfis de acesso** (veja 3.8).
- Quem tem acesso ao módulo Frota, não é administrador e não recebeu perfil nenhum é **Motorista**.
- O perfil vale a partir do próximo clique da pessoa, sem ela sair e entrar de novo. O menu e os botões que ela vê se atualizam quando
  ela recarrega a página, ou sozinhos quando ela abre o **Dashboard Frota** ou o **Meu painel** (eles percebem a mudança).

Para alguém usar o módulo, o administrador precisa dar a ele **acesso ao módulo Frota** na tela de usuários.

### O que o motorista não pode

- Ver o painel do gestor e os alertas. Se tentar, o sistema responde *"Sem permissão para esta operação"* — na prática, ao abrir
  **Frota** ele é levado direto para o **Meu painel**.
- Ver os dados dos colegas (CPF, CNH, lançamentos, nem as fotos deles).
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

Quando você está com um veículo, o painel mostra: "Você está com o veículo (placa) desde (data) às (hora), destino (destino), condutor
(quem vai dirigir)." — destino e condutor só aparecem se foram informados na saída.

### 2.3 O formulário (Saída, Retorno, Inspeção)

É o formulário de papel na tela:

- **Veículo** — na Saída e na Inspeção você escolhe; no Retorno é o da sua viagem, já preenchido ("Veículo: (placa) · saiu com
  (km) km", ou "· saiu com (horas) h" numa máquina por horímetro).
- **KM atual (o que está no painel)** — o número do painel do veículo. Obrigatório. Numa **máquina medida por horímetro**
  (empilhadeira, por exemplo) o campo se chama **Horímetro atual (horas no painel)** e aceita casas decimais. Embaixo do campo aparece
  o último número registrado naquele veículo: *"Último registrado neste veículo: 1.800 km"* (ou *"… 120 h"*). Veja as regras em 2.10.
- **Data** e **Horário** — já vêm com agora; dá para mudar.
- **Combustível** — Vazio, ¼, ½, ¾ ou Cheio (opcional; toque de novo para desmarcar).
- **Saindo de: GMP** — só na Saída, fixo: toda saída é da empresa (não há o que digitar). Embaixo aparece o **endereço da GMP**, o
  mesmo cadastrado em **Configurações → Empresa** (endereço, cidade, estado e CEP); se lá estiver vazio, a linha do endereço não aparece.
- **Indo para onde (destino)** — só na Saída, opcional: uma **lista** dos destinos já cadastrados (clientes, obras, fornecedores). Cada
  opção mostra o nome e a cidade: *"Obra Beta — São Bernardo do Campo/SP"* (destino antigo, sem cidade, mostra só o nome). Se o lugar
  não está na lista, toque **+ Novo destino**, digite o **Nome** e o **endereço** (veja "O endereço do destino", abaixo) e **Adicionar**:
  o destino entra na lista, já escolhido, e fica disponível para todos dali em diante (*"Destino adicionado"*). Se alguém já tinha
  cadastrado o mesmo nome, o sistema escolhe o que existe — mesmo que você não tenha preenchido o endereço: *"Esse destino já existia —
  selecionado."*. Nome em branco: *"Informe o nome do destino"*. Veja 2.4.
- **Quem vai dirigir (condutor)** — só na Saída e **só nos veículos liberados para funcionários** (carro do setor, que qualquer um pega
  para trabalho externo): o nome de quem vai dirigir. Nesses veículos é obrigatório. Nos outros o campo nem aparece. Veja 2.4.
- **Para quê (finalidade)** — só na Saída, opcional.
- **Condições do veículo** — os 12 itens do papel, cada um **OK**, **N/A** (não se aplica) ou **Falha**:
  Pneus e estepe · Faróis / lanternas · Setas / luz de freio · Parabrisa / vidros · Espelhos / retrovisores · Limpadores / água ·
  Óleo do motor / vazamentos · Arrefecimento / nível · Freios / freio de estacionamento · Buzina / cintos · Documentos / equipamentos
  · Carroceria / amarração da carga.
- **Avarias** — toque **+ Adicionar avaria**, escolha **onde** (Lado esquerdo, Lado direito, Em cima (teto), Frente, Traseira),
  **o que é** (Risco, Amassado, Trinca, Quebrado, Outro) e, se quiser, uma descrição; **Incluir avaria**. Pode haver várias; cada uma
  tem **Remover**.
- **Fotos** — toque **Tirar foto**: o celular abre a câmera (no computador, a escolha de arquivo). Fotografe a avaria, o painel, o que
  quiser mostrar. Cabem **até 3 fotos**; cada uma aparece em miniatura com **Remover foto**. Com 3, o botão apaga e aparece *"Limite de
  3 fotos."*. As fotos **sobem depois** que o registro é salvo (veja "Como as fotos são enviadas", abaixo).
- **Observações** — texto livre.

**O endereço do destino.** Todo destino novo tem endereço completo — no "+ Novo destino" da Saída, na tela **Destinos** do gestor e no
"+ Novo destino" da **Viagem** do gestor (o mesmo formulário nos três):

- **CEP** — digite os 8 números (com ou sem traço) e toque **Buscar**, ou saia do campo: o sistema consulta o CEP e preenche **Rua**,
  **Bairro**, **Cidade** e **Estado (UF)** com o que o correio tem — e **troca** o que estava nesses quatro campos, inclusive deixando
  em branco o que o correio não tem (CEP de cidade inteira não tem rua nem bairro: preencha à mão). **Número** e **Complemento** nunca
  são mexidos pela busca. Sair do campo sem ter mudado o CEP não consulta de novo (o que você corrigiu à mão fica).
- **Não sabe o CEP?** *"Não sabe o CEP? Preencha os campos à mão."* — todos os campos aceitam digitação, com ou sem busca. O CEP é
  opcional.
- Obrigatórios: **Rua**, **Número** (ou "S/N"), **Bairro**, **Cidade** e **Estado (UF)**. **Complemento** é opcional.

| Situação | Mensagem |
|---|---|
| CEP com menos de 8 números, ao tocar **Buscar** (ao sair do campo, nada acontece) | *"CEP deve ter 8 dígitos"* |
| CEP que não existe | *"CEP não encontrado — preencha o endereço à mão"* |
| A consulta do CEP falhou (sem internet, serviço do correio fora) | *"Não foi possível consultar o CEP — preencha o endereço à mão"* |
| Ao **Adicionar**/**Salvar**: CEP preenchido com outra quantidade de números | *"CEP deve ter 8 dígitos"* |
| Sem rua | *"Informe a rua (logradouro) do destino"* |
| Sem número | *"Informe o número (ou S/N)"* |
| Sem bairro | *"Informe o bairro do destino"* |
| Sem cidade | *"Informe a cidade do destino"* |
| Sem estado | *"Informe o estado (UF) do destino"* |
| Estado que não é uma das 27 siglas (minúscula vale: "sp" vira "SP") | *"Estado (UF) inválido"* |
| Textos longos demais | *"Rua: no máximo 150 caracteres"*, *"Número: no máximo 20 caracteres"*, *"Complemento: no máximo 60 caracteres"*, *"Bairro: no máximo 80 caracteres"*, *"Cidade: no máximo 80 caracteres"* |

O sistema confere na ordem: nome, CEP, rua, número, complemento, bairro, cidade, estado — a mensagem é a do primeiro problema. O
endereço guardado é montado assim: *"Rua das Flores, 100 - Sala 2, Centro, São Bernardo do Campo/SP, CEP 09844-100"* (sem complemento,
sem o " - Sala 2"; sem CEP, termina em "/SP"). O sistema **não** confere se o CEP é mesmo daquela cidade: vale o que foi confirmado na
tela. Enquanto o bloco "+ Novo destino" está aberto, a tecla Enter não grava a Saída nem a Viagem (no campo CEP, Enter busca o CEP).

O botão **Salvar** só acende quando os 12 itens estão marcados; enquanto faltar algum, o rodapé mostra "Faltam (N) de 12 itens.".
Ao salvar, aparece "Saída registrada", "Retorno registrado" ou "Inspeção registrada" e você volta ao painel.

Se o sistema recusar, a mensagem aparece em vermelho no topo do formulário e **nada é gravado**; o que você digitou continua lá.

**Como as fotos são enviadas.** Ao tocar **Salvar**, o sistema grava o registro e, só depois, manda as fotos, uma de cada vez; o
formulário fecha quando a última termina. Se alguma foto não subir (sem internet, arquivo recusado), **o registro continua salvo** e
aparece o aviso *"Salvo, mas 1 foto não foi enviada: (motivo)"* (ou *"Salvo, mas 2 fotos não foram enviadas: (motivo)"*); sem motivo
do servidor, o motivo é *"Confira a internet e tente de novo em Meus registros."*. A foto que faltou se manda depois, em **Meus
registros** (2.9). Regras da foto, conferidas pelo servidor:

| Situação | Mensagem |
|---|---|
| Arquivo que não é JPEG, PNG ou WEBP (inclusive um arquivo com nome de foto que, por dentro, não é foto) | *"Formato de imagem não suportado"* |
| Arquivo de 10 MB ou mais | *"Arquivo grande demais (máximo 10 MB)"* |
| O lançamento já tem 3 fotos | *"Este lançamento já tem 3 fotos"* |
| Lançamento de outro motorista | *"Você só pode alterar os seus próprios registros"* |

Uma foto com mais de 1 MB (a da câmera costuma ter de 3 a 8 MB), ou em formato que o servidor não aceita (como o HEIC do iPhone), é
**reduzida no próprio celular** antes de subir: o lado maior fica com 1.600 pontos e ela vira JPEG. Isso a deixa leve e tira dela os
dados do aparelho (inclusive a localização). Se o navegador não conseguir reduzir, ela vai como está — e uma foto em HEIC é recusada.
Foto de até 1 MB em JPEG, PNG ou WEBP vai como está.

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
| Veículo **liberado para funcionários** e o campo **Quem vai dirigir (condutor)** vazio | *"Informe quem vai dirigir (condutor)"* |
| Condutor com mais de 120 letras | *"Condutor: no máximo 120 caracteres"* |
| O destino escolhido foi desativado pelo gestor enquanto você preenchia | *"Destino não encontrado"*; a lista se atualiza e a tela avisa *"O destino escolhido foi desativado. Escolha outro."* |

**Carro liberado para funcionários.** Alguns veículos são do setor, não de um motorista: qualquer funcionário pega para trabalho
externo. O gestor marca isso no cadastro do veículo (3.1). Nesses carros, quem registra a saída no portal (você, com o seu login)
informa **quem vai dirigir** — o nome fica na viagem, aparece no cartão do painel e na planilha, na coluna Condutor, no lugar do seu
nome. A viagem continua sendo sua (o retorno é seu). Nos outros veículos o campo não aparece.

**De onde e para onde.** A saída é sempre **da GMP** — o sistema grava isso sozinho. O endereço que aparece embaixo de "Saindo de:
GMP" vem de **Configurações → Empresa** e é lido na hora: se a empresa mudar de endereço, basta corrigir lá (a viagem guarda só "GMP",
então as antigas passam a mostrar o endereço novo). O destino sai da lista de destinos (2.3); a viagem
guarda o **nome** do destino como estava na hora: se o gestor renomear ou desativar o destino depois, as viagens antigas não mudam.

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

**Sem foto.** O abastecimento **não pede foto** (o cupom do posto não vai pelo sistema). *Dizia: "o abastecimento tem o mesmo Tirar
foto do formulário, para o cupom"* — isso saiu a pedido da empresa; a foto continua na Saída, no Retorno e na Inspeção (2.3).

### 2.9 Ver os meus registros

Abaixo dos botões, **Meus registros** mostra as suas últimas 30 saídas/retornos/inspeções (tipo, placa, data, hora, km — ou horas,
como "125 h", na máquina — e a etiqueta OK / PENDÊNCIA / INCOMPLETO) e os seus últimos 30 abastecimentos (placa, litros, data, km ou
horas, valor). Cada registro (saída, retorno, inspeção) mostra as **miniaturas das fotos** dele; tocar numa abre a foto em outra aba.
Para mandar uma foto que faltou (ou outra), toque **+ Foto** no registro (o botão some quando ele já tem 3); dá certo → *"Foto enviada"*; não dá → a
mensagem do servidor ou *"Não foi possível enviar a foto. Confira a internet e tente de novo."*. Para tirar uma foto errada, toque
**Remover foto** embaixo dela e confirme *"Remover esta foto?"* → *"Foto removida"* (sem internet: *"Não foi possível remover a foto.
Confira a internet e tente de novo."*). As fotos são a única coisa que você mexe aqui: para corrigir um lançamento, fale com o gestor.
O **abastecimento** não tem **+ Foto** (ele não pede foto); se um abastecimento antigo tiver foto, a miniatura e o **Remover foto**
continuam lá.

Quando o gestor resolve uma pendência sua, o registro passa a mostrar a etiqueta **PENDÊNCIA · tratada** e, embaixo, *"Tratada em
(dia) às (hora): (o que foi feito)"*.

O endereço de cada foto vale por cerca de **2 horas**: se a tela ficou aberta mais que isso, a miniatura não abre — saia e entre de
novo no painel (ou recarregue a página).

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
alerta de consumo baixo), setor, centro de custo, condutor responsável, **Liberado para funcionários** (marque no carro do setor que
qualquer funcionário pega para trabalho externo: a Saída do portal passa a pedir **quem vai dirigir** — veja 2.4; na lista, a coluna
Condutor mostra "Funcionários" quando não há condutor responsável), status (**ativo**, **manutencao**, **inativo**, **vendido**).

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
| **Checklist com pendência** | Saída, retorno ou inspeção com situação **PENDÊNCIA** que o gestor ainda **não tratou**, de veículo ativo (não importa a data do registro) | alto |
| Consumo baixo | Média de km/L dos últimos 60 dias abaixo de 70% do consumo esperado do veículo. Só em km/L: a máquina por horímetro (L/h) não tem este alerta | médio |

O alerta de checklist diz *"Checklist com pendência — (placa)"* e, embaixo, o que falhou e quem registrou — por exemplo
*"Falha: Pneus e estepe · Ana Teste"*, ou *"1 avaria(s) · Ana Teste"* — e "Registrado em (data)". Ele **fica no painel até o gestor tratar** a pendência (veja 3.4, **Tratar a pendência**); excluir o
veículo também o tira. O painel mostra só os 15 alertas mais graves (entre as pendências, as **mais antigas primeiro**): com muitos alertas abertos, a lista
**Checklist Diário** é o lugar de ver todas as pendências. Para o Administrador de Frota, o alerta tem o botão **Tratar pendência**, que abre a mesma janela da lista;
ao marcar, o painel recarrega e o alerta some. O Consulta vê o alerta, sem o botão.

### 3.4 As telas de cadastro e lançamento

Todas funcionam igual: tabela, busca, às vezes filtro, **Novo…**, e na linha **editar** (lápis) e **excluir** (lixeira). Para quem
está como **Consulta**, esses botões (e o de aprovar viagem) não aparecem: a tela é só para ler.

| Tela | O que guardar de importante |
|---|---|
| **Manutenções** | Preventiva/corretiva, oficina, custo, km, próxima revisão (km e data). Criada como **em andamento**, põe o veículo em manutenção (que bloqueia a saída no portal) |
| **Abastecimentos** | Mostra os lançados pelo portal e pelo escritório, com **Km/L** (na máquina, o consumo em litros por hora, ex.: "5,00 L/h"; se a linha tem km e horímetro, os dois: "10,50 km/L · 5,00 L/h"). Editar litros ou valor refaz o preço por litro. Para máquina por horímetro, use **Horímetro no abastecimento (máquina)** e deixe o KM vazio: a coluna KM mostra as horas ("125 h") e a linha fica sem km/L. O escritório pode lançar km menor que o do veículo (lançamento atrasado) sem pergunta. A coluna **Fotos** fica para os abastecimentos antigos que tiveram foto; o portal não pede mais foto no abastecimento |
| **Viagens** | Saída/retorno, km, origem, destino, finalidade, **condutor**, status. A origem não se digita: o formulário mostra a linha fixa **Saindo de: GMP — (endereço da GMP, de Configurações → Empresa)** e a viagem grava "GMP". Viagem antiga que saiu de outro lugar mostra **Origem gravada: (o texto)** e o mantém ao salvar. **Condutor (funcionário)** é quem dirigiu um carro liberado para funcionários — opcional aqui (o escritório lança atrasado); o portal exige. O **Destino** é escolhido da **lista de destinos ativos** (cada opção mostra "Nome — Cidade/UF"), com **+ Novo destino** ao lado — o mesmo cadastro do portal, com endereço (2.3); se o nome já existe: *"Esse destino já estava cadastrado — selecionamos ele."*. É opcional. Viagem antiga com destino digitado (de antes da lista) mostra *"Destino gravado: (o texto). Escolha da lista só se quiser trocar."* e a primeira opção vira **Manter o destino gravado**; viagem cujo destino foi desativado depois mostra o nome gravado com "(desativado)" e salva normalmente. Se o destino escolhido for desativado por outra pessoa com o formulário aberto, o Salvar responde *"Destino não encontrado"*, a lista se atualiza e a escolha é limpa. A viagem guarda o **nome do destino na hora** em que foi escolhido: renomear o destino depois não renomeia a viagem (a lista mostra o nome novo; a viagem, o antigo). O destino e o condutor **não se apagam** pela tela: escolha ou digite outro. O botão **Aprovar** (✓) aparece só em viagem **solicitada**. Para máquina por horímetro: **Horímetro saída (máquina)** e **Horímetro retorno (máquina)**; a coluna KM rodado mostra as horas usadas ("6,5 h"). A busca acha por destino, finalidade, placa e condutor |
| **Destinos** | Os lugares de entrega e retirada que o motorista escolhe na Saída e o gestor escolhe na Viagem: **Nome**, **Endereço** (o formulário tem CEP com busca, rua, número, complemento, bairro, cidade e estado — as regras estão em 2.3; a coluna mostra o endereço montado), **Cadastrado por** (quem criou — o motorista, pelo "+ Novo destino", ou o gestor aqui), **Status**. **Excluir** não apaga: **desativa** (some da lista do motorista; as viagens antigas guardam o nome). Para ver e reativar os desativados, **Mostrar: Todos** e Editar → Status **Ativo**. Destino cadastrado antes de existir o endereço completo abre com a nota *"Endereço antigo: (o texto)"* acima dos campos vazios: dá para reativar ou renomear sem preencher nada; preenchendo qualquer campo do endereço, vale a regra inteira (rua, número, bairro, cidade e estado). Num destino que já tem endereço completo, apagar o complemento ou o CEP tira essa parte; apagar um obrigatório é recusado. Dois destinos ativos não podem ter o mesmo nome (maiúsculas e minúsculas não contam; acento conta): *"Destino já cadastrado"*. Se um motorista cadastrar de novo o nome de um destino desativado, nasce outro ativo — ao reativar o antigo o sistema recusa; fique com um |
| **Checklist Diário** | Lista todos os registros (Data, Placa, **Tipo**: Saída/Retorno/Inspeção, Motorista, **KM**, **Situação**, Observações, **Fotos**). O **Novo Checklist** daqui é o formulário simples de 7 itens sim/não (pneus, óleo, luzes, freios, extintor, documentos, limpeza), sem avarias. Não edita. Na linha com **PENDÊNCIA**, o gestor tem **Tratar pendência** (veja abaixo) |
| **Multas**, **Documentos** | Só o gestor lança e altera |

**Fotos nas listas.** Em **Checklist Diário** e **Abastecimentos**, a coluna **Fotos** mostra a **primeira** foto do lançamento em
miniatura e, se houver mais, *"+1"* ou *"+2"* (link para a seguinte); sem foto, *"-"*. Clicar abre a foto em outra aba. Quem é
**Consulta** vê as fotos de todos; o motorista, só as dele. O endereço da foto vale por cerca de 2 horas: com a lista aberta há mais
tempo, recarregue a página. **Excluir** um registro ou abastecimento apaga também as fotos dele. A planilha e os relatórios não levam as
fotos.

**Remover uma foto pela lista (só o Administrador de Frota).** Na coluna **Fotos**, a linha que tem foto mostra o botão **Remover foto**.
Ele abre a janela *"Fotos de (placa)"* com **todas** as fotos do lançamento (tocar numa abre em outra aba) e um **Remover foto** embaixo
de cada. Confirme *"Remover esta foto?"* → *"Foto removida"*; a foto sai da janela e as outras ficam. **Fechar** atualiza a lista. Removeu a
última, a janela fecha sozinha e a coluna volta a *"-"*. O Consulta e o motorista não veem o botão (o motorista remove as dele em **Meus
registros**).

| Situação | Mensagem |
|---|---|
| A foto já tinha sido removida por outra pessoa (duas telas abertas) | *"Foto não encontrada"* — ela some da janela do mesmo jeito |
| O seu perfil deixou de ser Administrador de Frota com a janela aberta | *"Sem permissão para esta operação"* — a janela fecha e a lista atualiza |
| Sem internet | *"Não foi possível remover a foto. Confira a internet e tente de novo."* — a janela fica como estava |

**Tratar a pendência.** Quando o motorista marca **Falha** num item ou uma avaria, o registro fica **PENDÊNCIA** e vira alerta no
painel. Depois de resolver (consertar, conferir, decidir que não é nada), o Administrador de Frota toca **Tratar pendência** na linha
do registro em **Checklist Diário** (ou no alerta do painel). Abre a janela *"Tratar pendência — (placa)"* com:

- **O que foi feito *** — obrigatório, até 1.000 caracteres (ex.: "Pastilhas de freio trocadas na oficina do João");
- **Manutenção (opcional)** — as manutenções lançadas para **o mesmo veículo** (*"— nenhuma —"* se não quiser ligar). Abra a
  manutenção do conserto antes, em **Manutenções**, se quiser ligá-la.

**Marcar como tratada** → *"Pendência tratada"*. A partir daí o alerta sai do painel, e a linha mostra a etiqueta **PENDÊNCIA ·
tratada** e embaixo *"Tratada em (dia) às (hora) por (nome): (o que foi feito)"* — com *"(manutenção: …)"* no fim quando houver
uma ligada (se a manutenção for excluída depois, esse trecho some). A situação continua **PENDÊNCIA**, porque é o que o motorista viu;
"tratada" é uma marca à parte. O motorista vê o mesmo texto (sem a manutenção) em **Meus registros**.

Marcou o registro errado? **Desfazer tratamento** na mesma linha, confirmando *"Desfazer o tratamento desta pendência? O alerta volta
para o painel."* → *"Tratamento desfeito"*; o alerta volta. Só o Administrador de Frota trata e desfaz; o Consulta vê a etiqueta e o
texto, sem os botões. Registro com situação OK ou INCOMPLETO não tem o botão.

| Situação | Mensagem |
|---|---|
| Texto vazio (ou só espaços) | O botão **Marcar como tratada** fica apagado; por chamada direta, *"Descreva o que foi feito"* |
| Texto com mais de 1.000 caracteres | *"O texto passou de 1000 caracteres"* |
| Outra pessoa já tratou (duas telas abertas ao mesmo tempo) | *"Esta pendência já foi tratada"* |
| O registro foi excluído enquanto a janela estava aberta | *"Registro não encontrado"* |
| A manutenção escolhida foi excluída no meio | *"Manutenção não encontrada"* |
| Desfazer o que já foi desfeito (duas telas) | *"Esta pendência não foi tratada"* |
| Sem internet | *"Não foi possível tratar a pendência."* (ou *"Não foi possível desfazer o tratamento."*) |

Regras das viagens (valem também para o gestor):

| Situação | Mensagem |
|---|---|
| Aprovar viagem que não está **solicitada** | *"Só é possível aprovar viagem solicitada"* |
| KM retorno menor que KM saída | *"KM do retorno (…) menor que o KM da saída (…). Confira o hodômetro."* |
| Horímetro retorno menor que horímetro saída | *"Horímetro do retorno (… h) menor que o da saída (… h). Confira o painel."* |
| Horímetro que não é número (com vírgula, letras) ou negativo, em Viagens ou Abastecimentos | *"Horímetro inválido"* (nada é gravado) |
| Litros vazio, zero, negativo ou que não é número, ao lançar ou corrigir um abastecimento | *"Informe os litros"* (nada é gravado; litros em branco no lançamento: *"Veículo, litros e data são obrigatórios"*) |
| Status da multa diferente de pendente, pago ou contestado (só por chamada direta; a tela oferece só os três) | *"Status de pagamento inválido"* |
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
`controle-de-frota-(data de hoje).xlsx`, no formato da planilha de controle da empresa, com as seis abas dela e uma sétima, **Multas**, no fim:

| Aba | Colunas | Período |
|---|---|---|
| **Cadastro Frota** | Placa, Tipo, Marca, Modelo, Ano, KM Atual, Responsável, Próxima Revisão KM, Próxima Revisão Data, Situação, Horímetro Atual | sai inteira |
| **Viagens e KM** | Data, Veículo, Condutor, Finalidade, Origem, Destino, Saída, Retorno, KM Inicial, KM Final, KM Percorrido, Status, Observações, Horímetro Inicial, Horímetro Final | pela data de saída |
| **Checklist** | Data, Horário, Tipo, Veículo, Condutor, KM, Combustível, os 12 itens, Avarias, Status Geral, Observações, Horímetro | pela data do registro |
| **Abastecimentos** | Data, Veículo, Condutor, KM, Litros, Valor Total R$, Preço por Litro, KM desde Abastec. Anterior, Consumo km/L, Posto, Observações, Horímetro, Horas desde Abastec. Anterior, Consumo L/h | pela data |
| **Manutenções** | Data, Veículo, Tipo, Serviço, Fornecedor, KM Serviço, Custo R$, Próxima Revisão KM, Próxima Revisão Data, Status, Observações | pela data |
| **Documentos** | Veículo, Documento, Vencimento, Dias até Vencer, Status, Observações | sai inteira |
| **Multas** | Data, Veículo, Condutor, Infração, Valor R$, Pontos, Vencimento, Status, Nº do Auto, Observações | pela data da infração (sem ela, pelo dia em que a multa foi lançada) |

O período funciona com as duas datas ou com uma só: só a inicial traz dela em diante; só a final, até ela (o dia final entra inteiro).
As abas de lançamento trazem também os veículos excluídos (é o histórico); a tela de Relatórios mostra só os veículos ativos.

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
  Superior, Frente, Traseira; os tipos em minúsculas: risco, amassado, trinca, quebrado, outro). **Status Geral**: OK, PENDÊNCIA ou INCOMPLETO (régua da seção 2.7). No fim da aba, **Pendência tratada em** (dia e hora, ex.: 2026-10-23 14:05), **Tratada por** e **O que foi feito** — vazias no registro que não foi tratado.
- **Manutenções**: Status Planejada (agendada), Em andamento, Concluída; Fornecedor = oficina.
- **Multas**: **Data** é a data da infração (vazia se não foi preenchida); **Status** Pendente, Pago ou Contestado — a contestada
  aparece aqui, mas não soma no custo da tela de Relatórios. **Horas desde Abastec. Anterior** e **Consumo L/h** (Abastecimentos):
  preenchidas só nas linhas com horímetro, pela conta da seção 3.6.
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

**Na máquina por horímetro, litros por hora (L/h)** — a mesma conta, com horas no lugar do km:

- **Horas desde o anterior** = horímetro deste abastecimento − horímetro do abastecimento **anterior em horas** do mesmo veículo (o de
  horímetro imediatamente menor; empate pela ordem de lançamento).
- **Consumo (L/h)** = **litros deste** abastecimento ÷ horas desde o anterior, arredondado em 2 casas.
- O primeiro (sem anterior) fica sem L/h; abastecimento sem horímetro não serve de anterior; horas iguais (zero) ficam sem L/h.
- A conta é refeita toda vez que a tela, o relatório ou a planilha são abertos: lançar, corrigir ou excluir um abastecimento muda na
  hora o L/h do seguinte. O anterior é procurado entre **todos** os abastecimentos do veículo, mesmo fora do período escolhido ou de
  outro motorista.
- O km/L olha só o km e o L/h só o horímetro: uma linha com os dois preenchidos tem os dois consumos.

Exemplo: abastecimentos com 120 h (40 L) e 130 h (50 L) → o segundo tem 10 h desde o anterior e **5 L/h**. Lançando depois um de 125 h
com 20 L: ele fica com 5 h e **4 L/h**, e o de 130 h passa a 5 h e **10 L/h**.

### 3.7 Relatórios

**Frota → Relatórios** mostra duas tabelas, com **Imprimir** e **Exportar planilha**. É vista pelo Administrador de Frota e pelo
Consulta (o motorista não tem esta tela).

**O período.** As duas datas no topo valem para as duas tabelas e para a planilha. Pode usar as duas, ou uma só: só a inicial traz
daquele dia em diante; só a final, até aquele dia (inteiro). As tabelas se atualizam ao mudar a data. Embaixo das datas aparece o
período aplicado — *"Período: 01/10/2026 a 31/10/2026"*, *"Período: a partir de 01/10/2026"*, *"Período: até 31/10/2026"* ou
*"Período: tudo"* — e ele sai também na impressão.

**Custos por veículo.** Uma linha por veículo ativo (o excluído não aparece), por placa:

| Coluna | O que soma |
|---|---|
| Manutenção | custo das manutenções com data no período |
| Combustível | valor dos abastecimentos com data no período |
| Multas | valor das multas pela **data da infração**; multa sem data da infração conta pelo **dia em que foi lançada** (dia de Brasília). Multa **contestada não entra** (como no painel) |
| Total | Manutenção + Combustível + Multas |
| KM / Horímetro | o km atual do carro (*"1.800 km"*) ou, na máquina por horímetro, as horas atuais (*"125 h"*); vazio vira *"-"* |

Embaixo da tabela, a linha **Total** soma Manutenção, Combustível, Multas e Total de todos os veículos. Acima, a nota *"Multas pela
data da infração (sem ela, pelo dia do lançamento); contestadas não entram."*

**Consumo médio.** Uma linha por veículo ativo que tem abastecimento no período, por placa:

| Coluna | Como sai |
|---|---|
| Km/L | média do km/L dos abastecimentos do período que têm km/L (seção 3.6), ex.: *"10,50 km/L"*; sem nenhum, *"-"* |
| L/h (máquina) | média do litros por hora dos abastecimentos do período que têm L/h (seção 3.6), ex.: *"5,00 L/h"*; sem nenhum, *"-"* |
| Total litros, Total gasto, Abastecimentos | de **todos** os abastecimentos do período do veículo, tenham ou não consumo calculado (o primeiro também conta) |

Sem abastecimento no período: *"Sem abastecimentos no período"*.

**A tela e a planilha batem.** No mesmo período, a soma da coluna Combustível é a soma de **Valor Total R$** da aba Abastecimentos, a
de Manutenção é a de **Custo R$** da aba Manutenções, e a de Multas é a de **Valor R$** da aba Multas sem as contestadas — contando,
na planilha, só as placas que estão na aba Cadastro Frota (a planilha guarda também o histórico dos veículos excluídos). O **Total
gasto** do consumo soma o mesmo que a coluna Combustível.

Se uma das tabelas não carregar, aparece o aviso com a mensagem do servidor (ou *"Não foi possível carregar os relatórios"*) e só ela
fica vazia.


### 3.8 Dar o perfil a cada pessoa (Perfis de acesso)

**Frota → Perfis de acesso** aparece só no menu do Administrador de Frota (quem abre o endereço sem ser administrador vê *"Sem permissão
para esta operação"*). A tela lista os usuários ativos do sistema, com busca por nome ou e-mail, em quatro colunas: **Usuário**, **Perfil
no Frota**, **O que isso permite** e **Motorista ligado** (o motorista cujo cadastro está ligado àquele login, ou "—").

- Para cada pessoa há um seletor com **Motorista (padrão)**, **Consulta** e **Administrador de Frota**. Ao escolher, o sistema grava na
  hora: *"Perfil definido: Consulta"* / *"Perfil definido: Administrador de Frota"*, ou, voltando ao padrão, *"Perfil removido — o usuário
  volta ao padrão (Motorista)"*.
- **Dar Administrador de Frota** pede confirmação: *"Dar Administrador de Frota a (nome)? A pessoa passa a fazer tudo no módulo, inclusive
  dar perfis."* — Cancelar não grava nada. Por baixo, é a mesma marca "administra o módulo Frota" do cadastro de usuário: a pessoa aparece
  marcada lá também, e desmarcar lá tem o mesmo efeito que escolher outro perfil aqui. **Tirar** é escolher Consulta ou Motorista (padrão)
  na linha dela — sem confirmação. Qualquer Administrador de Frota pode dar e tirar; o texto de ajuda da tela lembra: *"Administrador de
  Frota pode ser dado e tirado aqui; superadmin e administrador do sistema, não."*.
- **O que cada um permite**, como a tela escreve: Motorista — *"Registra saída, retorno, inspeção e abastecimento no portal; vê só o que
  é dele."*; Consulta — *"Vê o painel, os alertas, as listas e os relatórios, e exporta a planilha. Não registra nem altera nada."*;
  Administrador de Frota — *"Faz tudo no módulo, inclusive dar perfis."*.
- **Superadmin e administrador do sistema não têm seletor.** Eles aparecem com a etiqueta **Administrador** e *"Superadmin ou
  administrador do sistema: não se altera por esta tela."*. Se alguém tentar mesmo assim (fora da tela), o sistema recusa: *"Este usuário
  é superadmin ou administrador do sistema e tem acesso total à frota. Isso não se altera por esta tela."*. *Dizia que o administrador do
  módulo Frota também não tinha seletor — deixou de ser verdade: ele aparece com o seletor em "Administrador de Frota".*
- **Ninguém muda o próprio perfil** por esta tela: *"Você não pode mudar o seu próprio perfil por esta tela."* — vale também para o
  administrador que tentasse se rebaixar (assim sempre sobra pelo menos quem está logado).
- **Avisos na linha.** Quem está como Consulta e é motorista mostra *"Ligado ao motorista (nome): como Consulta, não registra no
  portal."*. Se, além disso, ele está com uma saída sem retorno: *"Tem saída sem retorno: como Consulta, não consegue registrar o retorno.
  Feche a viagem em Frota → Viagens ou volte o perfil para Motorista."*. A mudança é aceita mesmo assim; o aviso diz como resolver.
- **Perfil gravado com valor que o sistema não conhece** aparece no seletor como "(valor) (valor inválido — escolha outro)". Enquanto
  estiver assim, a pessoa não grava nada e só vê o que seria dela como motorista. Escolha **Consulta**, **Motorista (padrão)** ou
  **Administrador de Frota**.
- **Perfil não é acesso.** A lista traz todos os usuários ativos; dar Consulta a quem não tem o módulo Frota no cadastro de usuário não
  abre o módulo para ele. Usuários marcados como ocultos não aparecem na lista.
- **Perfil não é vínculo.** Ser Motorista não liga a pessoa a um cadastro de motorista: isso se faz em **Motoristas** (3.2). Para registrar
  no portal ela precisa das duas coisas.
- **Quando vale:** no próximo clique da pessoa. O menu e os botões dela se acertam quando ela recarrega a página, ou sozinhos quando ela
  abre o **Dashboard Frota** ou o **Meu painel**. Numa outra tela do Frota já aberta, até lá, um botão que ela não pode mais usar responde
  *"Sem permissão para esta operação"*.
- **Marcar e desmarcar o administrador do módulo apaga o Consulta.** Se alguém que está como Consulta passa a administrar o módulo Frota
  (no cadastro de usuário) e depois deixa de administrar, volta ao padrão (Motorista). Confira esta tela depois de tirar um administrador.
  Pela tela do Frota isso não acontece: tirar o Administrador aqui **já grava** o perfil que você escolheu no lugar.
- **Duas telas abertas ao mesmo tempo.** Se o administrador do sistema estava com o **cadastro de usuário** de uma pessoa aberto **antes**
  de você dar Administrador de Frota a ela aqui, e salvar o cadastro depois (mesmo sem mexer em módulo), o Administrador que você deu
  **some** — a tela dele manda a lista de módulos que carregou. Dê de novo aqui. Quem **vira** Administrador vê o menu novo ao abrir o
  Meu painel; quem **deixa** de ser vê o menu mudar sozinho ao abrir o **Painel** do Frota (a tela de entrada do módulo) ou tocar
  **Atualizar** nele — se tinha aberto o Painel menos de 45 segundos antes, só no **Atualizar** ou na abertura seguinte. Nas outras telas do
  gestor o menu antigo fica até abrir o Painel ou recarregar a página, mas os botões já não funcionam: *"Sem permissão para esta operação"*.
- O sistema guarda a data da última mudança de cada perfil, mas não quem mudou.

---

## 4. Situações comuns

| Situação | O que fazer |
|---|---|
| Motorista entra e vê "Seu usuário não está ligado a um motorista…" | Gestor: **Motoristas** → editar o motorista → **Usuário de acesso** = o login dele |
| Pessoa do escritório (não administradora) entra no Frota e cai no "Meu painel" | Ela está como Motorista. Gestor: **Perfis de acesso** → escolher **Consulta** na linha dela; ela recarrega a página |
| Consulta não vê o botão de cadastrar ou editar | É assim: Consulta só lê. Para gravar, a pessoa precisa ser Administrador de Frota: **Perfis de acesso** → **Administrador de Frota** na linha dela (ou o cadastro de usuário) |
| O gestor vai sair de férias e precisa de um substituto | **Perfis de acesso** → **Administrador de Frota** na linha do substituto → confirmar. Na volta, escolher **Consulta** ou **Motorista (padrão)** na mesma linha |
| Motorista não acha o cliente/obra na lista de destinos | Na Saída, **+ Novo destino** → Nome e endereço (pelo CEP ou à mão) → **Adicionar**. Não precisa do gestor. Se o nome já existe, o sistema escolhe o que existe |
| A Saída pede "Quem vai dirigir (condutor)" | O veículo está marcado como **Liberado para funcionários** (carro do setor): digite o nome de quem vai dirigir. Se o carro é de um motorista fixo, o gestor desmarca em **Veículos** |
| Um destino errado aparece na lista do motorista | Gestor: **Frota → Destinos** → **Excluir** (desativa; as viagens antigas guardam o nome). Para corrigir o nome, **Editar**. Para ver os desativados, **Mostrar: Todos** |
| Veículo não aparece na Saída | Está com outro motorista (viagem sem retorno), está inativo/vendido, ou aparece como "(em manutenção — indisponível)" |
| Motorista não consegue sair com nenhum veículo | Ele tem uma saída sem retorno: registrar o **Retorno**, ou o gestor conclui a viagem em **Viagens** |
| Abastecimento com km/L estranho | Conferir o km digitado: um km menor que o real entra na sequência pela ordem do km e muda o km/L dele e do seguinte. O portal pergunta antes de gravar km menor que o do veículo, mas o motorista pode confirmar |
| Motorista recebe "KM menor que o atual do veículo (…)" sem ter errado | Alguém registrou um km maior antes (às vezes um erro de digitação para cima). Se o número do painel está certo, ele toca **Confirmar mesmo assim**. Se o km do veículo está errado, o gestor corrige o **KM Atual** em **Veículos** |
| Empilhadeira (ou outra máquina) aparece com km no lugar das horas | No cadastro do veículo, **Medição** = **Horímetro** e o **Horímetro Atual** certo; a partir daí o portal pede as horas |
| Motorista lançou errado | Ele não corrige pelo portal; o gestor edita na tela correspondente (Abastecimentos, Viagens) |
| O alerta "Checklist com pendência" continua no painel depois do conserto | Ele só sai quando alguém trata: **Checklist Diário** (ou o próprio alerta) → **Tratar pendência** → descrever o que foi feito → **Marcar como tratada** |
