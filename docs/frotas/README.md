# Módulo Frota — guia do que existe hoje

> **Onde paramos:** **Etapa 4 — relatórios fechados — entregue em 2026-10-23** (na `main`, commits `99658314` a `bcb498a0`, com a
> Fase 5). Relatórios e planilha no mesmo período (uma data ou duas), multas pela data da infração, a máquina com horas e litros por hora,
> linha Total que bate com a planilha, aba Multas. Antes, no mesmo dia: Etapa 3 (km e horímetro no portal), Etapa 2 (perfil
> Consulta/Motorista pela tela) e Etapa 1 (portal do motorista).
> **Próxima:** Etapa 5 — foto da avaria e do cupom; ver "Próxima tarefa detalhada" no fim do [plano da Etapa 4](../superpowers/plans/2026-10-23-frotas-etapa4-relatorios.md).
> O módulo ainda **não foi usado em produção**.
>
> Apresentação da etapa (com os cenários e as decisões): [`novidades-por-etapa.md`](novidades-por-etapa.md) ·
> Manual de quem usa: [`manual-do-sistema.md`](manual-do-sistema.md) ·
> Mapa de status: [`specs/modulo-frotas/README.md`](../../specs/modulo-frotas/README.md) ·
> Detalhe técnico: [`referencia-tecnica.md`](referencia-tecnica.md)

## Em uma frase

O sistema tem **um caderno de frota completo para o escritório** (veículos, motoristas, abastecimento, manutenção, viagens,
checklist, multas, documentos, painel e relatório) e, desde a Etapa 1, **uma porta simples para o motorista**: ele entra, toca num
botão grande e preenche o mesmo formulário do papel — e só vê o que é dele. Desde a Etapa 2, quem só acompanha a frota recebe o perfil **Consulta** pela tela.

## Como a empresa trabalhava × como fica

| Antes | Agora |
|---|---|
| Formulário vai para o motorista | Motorista entra no sistema (celular) |
| Motorista preenche no papel | Motorista preenche na tela, só o que é dele |
| Alguém passa a limpo no Excel | Ninguém digita de novo: o dado já está no sistema |
| A planilha é o lugar que centraliza | O sistema centraliza; o botão **Exportar planilha** devolve o Excel no formato de hoje |

## Como entrar no módulo

1. O administrador dá acesso ao módulo **Frota** na tela de usuários.
2. Para o motorista: o gestor abre **Frota → Motoristas**, edita o motorista e escolhe o login dele em **Usuário de acesso (portal do
   motorista)**.
3. Na tela inicial, escolher **Frota**.
   - **Gestor** (administrador): menu com Dashboard Frota, Veículos, Motoristas, Manutenções, Abastecimentos, Documentos, Viagens,
     Checklist Diário, Multas, Relatórios, **Perfis de acesso**, **Portal do motorista**, Solicitar Material, Minhas Requisições.
   - **Motorista**: menu com **Meu painel**, Solicitar Material e Minhas Requisições. Abrir **Frota** leva direto ao **Meu painel**.
   - **Consulta**: o menu do gestor **sem** Perfis de acesso; as telas abrem só para leitura (sem Novo, Editar, Aprovar, Excluir).
4. Para quem só acompanha (escritório, financeiro): o gestor abre **Frota → Perfis de acesso** e escolhe **Consulta** na linha da
   pessoa. Quem não tem perfil escolhido entra como **Motorista**.

## O portal do motorista (Meu painel)

| O que aparece | Para que serve |
|---|---|
| "Olá, (nome)" e, se ele saiu e não voltou, o cartão "Você está com o veículo … desde …" | Ele sabe se tem viagem aberta |
| Botão **Saída** (some enquanto há viagem aberta) | Formulário do papel; abre a viagem |
| Botão **Retorno** (só com viagem aberta) | Formulário do papel; fecha a viagem e calcula o km rodado |
| Botão **Inspeção** | Formulário do papel sem viagem (inspeção periódica) |
| Botão **Abastecimento** | Veículo, KM (ou horímetro, na máquina), litros, valor, data, posto |
| **Meus registros** | As últimas 30 saídas/retornos/inspeções (com a situação OK / PENDÊNCIA / INCOMPLETO) e os últimos 30 abastecimentos dele |

O formulário de Saída/Retorno/Inspeção tem: veículo (no Retorno é o da viagem), **KM atual** (na máquina por horímetro, **Horímetro
atual**; embaixo, *"Último registrado neste veículo: …"*), data, horário, **combustível** (Vazio, ¼,
½, ¾, Cheio), origem/destino/finalidade (só na Saída), os **12 itens** do papel (cada um **OK**, **N/A** ou **Falha**), **avarias**
(onde: lado esquerdo, lado direito, em cima, frente, traseira; o que é: risco, amassado, trinca, quebrado, outro; descrição opcional)
e observações. O **Salvar** só acende com os 12 itens marcados. Número **menor** que o último do veículo: um aviso enquanto digita e,
ao salvar, a pergunta com o botão **Confirmar mesmo assim** (desde a Etapa 3).

## As telas do gestor, uma por uma

Todas as telas de cadastro funcionam igual: **uma tabela**, uma **busca**, às vezes um **filtro**, o botão **"Novo…"** que abre um
formulário, e na linha os botões **editar** (lápis) e **excluir** (lixeira). Para quem está como **Consulta**, esses botões não aparecem.

| Tela | Para que serve | Funciona? |
|---|---|---|
| **Dashboard Frota** | 9 cartões, lista de alertas (inclui **Checklist com pendência**), custos por categoria, últimos abastecimentos. Botão **Exportar planilha** | Sim |
| **Veículos** | Placa, marca, modelo, ano, tipo, **km** ou **horímetro**, combustível, setor, centro de custo, condutor responsável, chassi, RENAVAM | Sim |
| **Motoristas** | Nome, CPF, CNH, telefone, e-mail, setor e **Usuário de acesso (portal do motorista)** | Sim |
| **Abastecimentos** | Veículo, motorista, data, litros, valor, km (ou **horímetro**, na máquina), combustível, posto. O sistema sobe o km (ou o horímetro) do veículo e calcula o **km por litro** (carro) ou os **litros por hora** (máquina) | Sim |
| **Manutenções** | Preventiva ou corretiva, oficina, custo, peças, km, **próxima revisão**. "Em andamento" põe o veículo em manutenção | Sim |
| **Viagens** | Saída e retorno, km (ou **horímetro**, na máquina), **origem**, destino, finalidade, setor, status. O botão **Aprovar** aparece só em viagem **solicitada** | Sim |
| **Checklist Diário** | Lista tudo o que o motorista registrou (colunas **Tipo**, **KM**, **Situação**) e o "Novo Checklist" antigo do gestor (7 itens) | Sim. Não edita |
| **Multas** | Data, infração, valor, pontos, vencimento, pago/pendente/contestado | Sim |
| **Documentos** | IPVA, licenciamento, seguro, CRLV, rastreador — com vencimento e "avisar X dias antes" | Sim |
| **Relatórios** | Custo por veículo e consumo (km/L do carro, **litros por hora** da máquina) no **mesmo período** (uma data ou duas), com o período aplicado escrito, linha **Total**, **Imprimir** e **Exportar planilha** (mesmo período, com a aba **Multas**) | Sim |
| **Perfis de acesso** | Só o administrador. Uma linha por usuário: **Consulta** ou **Motorista (padrão)**, o que o perfil permite e o motorista ligado; avisa quando quem vira Consulta é motorista | Sim |
| **Portal do motorista** | O mesmo "Meu painel" do motorista (o gestor só grava se estiver ligado a um motorista) | Sim |
| **Solicitar Material** | Pede peça/material ao almoxarifado | Sim |

## Avisos automáticos (aparecem no Dashboard)

- Documento vencendo (no prazo configurado nele; padrão 30 dias).
- CNH de motorista vencendo em até 30 dias.
- Revisão chegando: até 15 dias pela data, ou faltando 500 km pelo km (na máquina por horímetro, faltando 50 horas pelo horímetro).
- Multa pendente vencendo em até 15 dias.
- **Consumo baixo**: o km/L dos últimos 60 dias ficou abaixo de 70% do esperado para o veículo (só carro; a máquina não tem este aviso).
- **Checklist com pendência** (novo): saída, retorno ou inspeção com alguma **Falha** ou avaria, nos últimos 7 dias. Mostra o que
  falhou, quem registrou e "Registrado em DD/MM/AAAA".

## Quem pode o quê

| Perfil | O que faz |
|---|---|
| **Administrador de Frota** | Tudo: cadastra veículo e motorista, liga motorista ao usuário, aprova e cancela viagem, lança multa e documento, vê painel e relatório, exporta, exclui |
| **Motorista** | Só o que é **dele**: saída, retorno, inspeção e abastecimento pelo portal; vê só os próprios registros, viagens, abastecimentos e multas. **Não** vê o painel nem relatório, **não** vê CPF/CNH dos colegas, **não** lança multa nem documento, **não** aprova viagem |
| **Consulta** | Vê painel, alertas, as listas (inclusive CPF/CNH dos motoristas) e relatório, e exporta a planilha. Não lança, não edita, não aprova, não exclui — os botões nem aparecem |

**Administrador de Frota** se dá na tela de usuários ("administra o módulo Frota"). **Consulta** e **Motorista** se dão em **Frota →
Perfis de acesso** (só o administrador abre). Quem não tem perfil escolhido entra como **Motorista**. Mudou o perfil de alguém? Vale no
próximo clique dela; o menu dela muda quando ela recarrega a página.

## O que ainda atrapalha o uso real (em palavras simples)

1. **Falta a parte 3 do formulário** ("Transmissão e itens específicos"): a imagem que recebemos está cortada.
2. **Sem foto** da avaria ou do cupom.
3. **O escritório não recebe a pergunta do km menor** (é ele quem lança atrasado e corrige): um km errado digitado na tela do gestor
   entra como antes.

**Resolvidos na Etapa 1** (estavam nesta lista no levantamento):

- ~~O motorista vê tudo~~ — **resolvido**: ele só vê e só altera o que é dele.
- ~~Não existe "a minha tela"~~ — **resolvido**: Meu painel.
- ~~Corrigir um abastecimento apaga o km/L~~ — **resolvido**.
- ~~Abastecimento lançado atrasado fica sem km/L~~ — **resolvido**: a conta é pela ordem do km, e o seguinte é refeito.
- ~~Viagem: aprovar uma que já terminou; km de volta menor gerando km negativo~~ — **resolvido**: as duas são recusadas.
- ~~Não sai Excel~~ — **resolvido**: Exportar planilha.

**Resolvido na Etapa 4:**

- ~~O custo do mês soma multas de qualquer data~~ — **resolvido**: multas pela data da infração.
- ~~A máquina some do relatório de consumo~~ — **resolvido**: aparece com litros por hora.
- ~~A planilha não tem multas~~ — **resolvido**: aba Multas.

**Resolvido na Etapa 3:**

- ~~km menor que o anterior passa calado~~ — **resolvido**: o portal mostra o último km e pergunta antes de gravar.
- ~~Máquina por horímetro grava as horas no km~~ — **resolvido**: o portal pede o horímetro e grava em horas.

**Resolvido na Etapa 2:**

- ~~Quem só acompanha a frota perde o painel~~ — **resolvido**: o gestor dá **Consulta** em **Frota → Perfis de acesso**.
- ~~O motorista vê os documentos de todos digitando o endereço~~ — **resolvido**: a lista dele vem vazia.

## Roteiro de teste manual (portal do motorista)

Você vai precisar de **dois logins**: o seu (administrador) e um de teste (*ana*) com acesso ao módulo **Frota** e **sem** ser
administrador. Troque "hoje" pela data do dia.

1. **Entrar como gestor.** Login de administrador → **Frota** → **Dashboard Frota** abre.
2. **Cadastrar o veículo.** **Veículos → Novo Veículo**: placa `ABC1D23`, tipo Caminhonete, medição Quilometragem, km **10000**. Salvar.
3. **Cadastrar o motorista e ligar ao login.** **Motoristas → Novo Motorista**: nome *Ana Teste*; em **Usuário de acesso (portal do
   motorista)** escolha o usuário *ana*. Salvar.
4. **Entrar como motorista.** Sair, entrar como *ana*, abrir **Frota**. Confira: o menu tem só **Meu painel**, **Solicitar Material** e
   **Minhas Requisições**; a tela diz *"Olá, Ana Teste"*.
5. **Saída com uma Falha.** Tocar **Saída**. Veículo `ABC1D23`, KM **10050**, horário **08:00**, combustível ½, destino *Obra X*. Nos
   itens: 11 em **OK** e **Pneus e estepe** em **Falha** (repare que o **Salvar** só acende quando os 12 estão marcados e o rodapé conta
   *"Faltam N de 12 itens."*). Salvar → aparece *"Saída registrada"* e o cartão *"Você está com o veículo ABC1D23 desde … às 08:00,
   destino Obra X."*. Em **Meus registros**, a saída com **PENDÊNCIA**.
6. **Painel do gestor mostra o alerta.** Sair, entrar como gestor → **Dashboard Frota**: alerta *"Checklist com pendência — ABC1D23"*
   com *"Falha: Pneus e estepe · Ana Teste"* e *"Registrado em (hoje)"*.
7. **Retorno com km menor.** Entrar como *ana* → **Retorno**. KM **10000**, os 12 itens OK, horário depois das 08:00. Salvar → em
   vermelho no topo: *"KM do retorno (10000) menor que o KM da saída (10050). Confira o hodômetro."*. Nada foi gravado: o cartão da
   viagem continua lá.
8. **Retorno certo.** No mesmo formulário, KM **10120** → Salvar → *"Retorno registrado"*. O cartão some e volta o botão **Saída**.
9. **Abastecimento.** **Abastecimento**: `ABC1D23`, KM **10200**, **40** litros, valor **240**, data de hoje → *"Abastecimento
   registrado"*. Outro: KM **10600**, **40** litros → aparece em **Meus registros → Abastecimentos**.
10. **Gestor confere.** Entrar como gestor. **Viagens**: a viagem está *concluida* com KM rodado **70**. **Abastecimentos**: o de KM
    10600 tem Km/L **10**.
11. **Exportar a planilha e conferir as abas.** **Dashboard Frota → Exportar planilha**. Abre/baixa `controle-de-frota-(hoje).xlsx`.
    Confira as 6 abas: **Cadastro Frota** (a linha `ABC1D23`, KM Atual 10600), **Viagens e KM** (Origem/Destino, KM Inicial 10050,
    KM Final 10120, KM Percorrido 70, Status Concluída), **Checklist** (duas linhas: a Saída com *Pneus e estepe* = *Não conforme* e
    Status Geral **PENDÊNCIA**, e o Retorno com **OK**), **Abastecimentos** (o de 10600 com *KM desde Abastec. Anterior* 400 e *Consumo
    km/L* 10), **Manutenções** e **Documentos** (vazias se você não cadastrou nada).

Extras, se der tempo: ligar o mesmo login *ana* a outro motorista (*"Este usuário já está ligado ao motorista Ana Teste"*); como
*ana*, digitar `/frota/motoristas` no endereço (só ela aparece); marcar o veículo com status *manutencao* e ver que ele fica
*"(em manutenção — indisponível)"* na Saída. Todos os cenários com a mensagem exata estão em
[`novidades-por-etapa.md`](novidades-por-etapa.md#as-regras-com-o-cenário-exato).

## Roteiro de teste manual (perfis de acesso)

Você vai precisar de **três logins**: o seu (administrador), *ana* (motorista ligada a *Ana Teste*, do roteiro acima) e *bia*, com acesso
ao módulo **Frota** no cadastro de usuário e **sem** marcar "administra o módulo Frota".

1. **A tela.** Como gestor, **Frota → Perfis de acesso** (no menu, logo depois de **Relatórios**). Título *"Perfis de acesso"*. A sua
   linha mostra a etiqueta **Administrador** e *"Para dar outro perfil, remova a condição de administrador no cadastro de usuário."*
   — sem seletor.
2. **Antes.** Em outro navegador (ou janela anônima), entre como *bia* e abra **Frota**: cai no **Meu painel** com *"Seu usuário não está
   ligado a um motorista. Peça ao gestor da frota para fazer o vínculo."*.
3. **Dar Consulta.** Como gestor, na linha de *bia*, troque **Motorista (padrão)** por **Consulta** → *"Perfil definido: Consulta"*.
4. **Depois.** Na janela de *bia*, **recarregue** (F5) e abra **Frota**: abre o **Dashboard Frota**. O menu tem Veículos, Motoristas, …,
   **Relatórios**, mas **não** tem **Perfis de acesso**.
5. **Só leitura.** Como *bia*, **Veículos**: a lista aparece **sem** **Novo Veículo** e **sem** a coluna **Ações**. **Relatórios →
   Exportar planilha** baixa o Excel.
6. **A tela é só do gestor.** Como *bia*, digite `/frota/perfis` no endereço: aparece *"Sem permissão para esta operação"* no lugar da
   tabela.
7. **Aviso no cadastro do motorista.** Como gestor, **Motoristas → Novo Motorista**, escolha *bia* em **Usuário de acesso (portal do
   motorista)**: aparece *"Este usuário está com o perfil Consulta no Frota: ele vê o painel, mas não consegue registrar no portal. Para
   ele registrar, mude o perfil em Frota → Perfis de acesso."*. Cancele.
8. **Aviso de quem é motorista.** Em **Perfis de acesso**, dê **Consulta** a *ana*: a linha mostra *"Ligado ao motorista Ana Teste: como
   Consulta, não registra no portal."* (e, se ela tiver saída sem retorno, *"Tem saída sem retorno: como Consulta, não consegue registrar
   o retorno. Feche a viagem em Frota → Viagens ou volte o perfil para Motorista."*). Volte *ana* para **Motorista (padrão)** →
   *"Perfil removido — o usuário volta ao padrão (Motorista)"*.
9. **Documentos do motorista.** Como *ana*, digite `/frota/documentos`: a lista vem vazia. Como *bia* ou gestor, os documentos aparecem.
10. **Voltar ao padrão.** Como gestor, *bia* → **Motorista (padrão)**. Ela recarrega e volta ao **Meu painel**.

## Roteiro de teste manual (km e horímetro)

Você vai precisar do seu login (administrador) e de *ana* (motorista ligada, como no primeiro roteiro). Troque "hoje" pela data do dia.

1. **Preparar.** Como administrador, **Frota → Veículos**: um carro *AAA1A11* com **Medição = Quilometragem** e **KM Atual 1800**; uma
   máquina *EMP0001* com **Medição = Horímetro** e **Horímetro Atual 120**.
2. **Último registrado.** Como *ana*, **Meu painel → Inspeção** → *AAA1A11*: embaixo de **KM atual (o que está no painel)** aparece
   *"Último registrado neste veículo: 1.800 km"*.
3. **Aviso ao digitar.** Digite **900**: aparece *"Menor que o último registrado. Confira o painel antes de salvar."*. Digite **1800**: o
   aviso some. Volte para **900**.
4. **A pergunta ao salvar.** Marque os 12 itens → **Salvar**: no topo, *"KM menor que o atual do veículo (1.800 km). Confira o hodômetro
   antes de salvar."* e o botão **Confirmar mesmo assim**. Em **Meus registros** nada novo apareceu.
5. **Mudar desarma.** Troque o km para **950**: o botão some. **Salvar** pergunta de novo, agora com o 950.
6. **Confirmar.** **Confirmar mesmo assim** → *"Inspeção registrada"*; **Meus registros** mostra *"· 950 km"*. Como administrador, em
   **Veículos**, *AAA1A11* continua com **1.800 km**.
7. **Abastecimento atrasado.** Como *ana*, **Abastecimento** → *AAA1A11*, KM **1700**, 30 litros, data de ontem → **Salvar** → a
   pergunta → **Confirmar mesmo assim** → *"Abastecimento registrado"*.
8. **Retorno menor que a saída não se confirma.** **Saída** com *AAA1A11* em **1800**; depois **Retorno** com **1750**: *"KM do retorno
   (1750) menor que o KM da saída (1800). Confira o hodômetro."*, sem botão de confirmar. Faça o retorno com **1850**.
9. **A máquina.** **Inspeção** → *EMP0001*: o campo é **Horímetro atual (horas no painel)**, com *"Último registrado neste veículo:
   120 h"*. Deixe vazio e salve: *"Informe o horímetro atual"*. Digite **125.5** → *"Inspeção registrada"*; **Meus registros** mostra
   *"· 125,5 h"*. Como administrador, **Veículos**: *EMP0001* com **125,5 h**, km sem mudar.
10. **Horímetro menor.** Como *ana*, **Inspeção** → *EMP0001* com **100**: *"Horímetro menor que o atual do veículo (125,5 h). Confira o
    painel antes de salvar."*.
11. **Viagem da máquina.** **Saída** com *EMP0001* em **126**; o **Retorno** mostra *"saiu com 126 h"*. Retorno com **125**:
    *"Horímetro do retorno (125 h) menor que o da saída (126 h). Confira o painel."*. Retorno com **130**: registrado. Como
    administrador, **Viagens**: **KM rodado** = *"4 h"*.
12. **Gestor fecha viagem esquecida de máquina.** Faça outra **Saída** de *EMP0001* (131) como *ana* e não registre o retorno. Como
    administrador, **Viagens** → editar → **Horímetro retorno (máquina)** **135**, status **concluida** → salvar. Em **Veículos**,
    *EMP0001* com **135 h**.
13. **Planilha.** **Dashboard Frota → Exportar planilha**: no fim das abas, **Horímetro Atual** (Cadastro Frota), **Horímetro
    Inicial/Final** (Viagens e KM), **Horímetro** (Checklist, Abastecimentos) — preenchidas só na *EMP0001*.
14. **Alerta de revisão da máquina.** **Manutenções → Nova**: *EMP0001*, descrição "revisão", **Próxima revisão (KM)** **180**. No
    **Dashboard Frota**, aparece **Manutenção — EMP0001** (faltam 45 h).

## Roteiro de teste manual (relatórios)

Preparação: como administrador, um carro *AAA1A11* (Medição = Quilometragem) e uma máquina *EMP0001* (Medição = Horímetro, Horímetro
Atual 100).

1. **Multas.** **Frota → Multas → Nova Multa**, *AAA1A11*: R$ 100 com data da infração 10/03/2025; R$ 200 com 05/10/2026; R$ 500 com
   06/10/2026 e Status **contestado**.
2. **Relatórios, sem datas.** **Frota → Relatórios**: embaixo das datas, *"Período: tudo"*. Na tabela **Custos por veículo**, Multas do
   *AAA1A11* = **R$ 300,00** (a contestada não entra). A nota acima da tabela: *"Multas pela data da infração (sem ela, pelo dia do
   lançamento); contestadas não entram."*
3. **Com período.** Data inicial **01/10/2026** e final **31/10/2026**: *"Período: 01/10/2026 a 31/10/2026"*; Multas = **R$ 200,00**.
4. **Uma data só.** Apague a data final: *"Período: a partir de 01/10/2026"*; Multas = **R$ 200,00**. Apague a inicial e ponha só a final
   **31/12/2025**: *"Período: até 31/12/2025"*; Multas = **R$ 100,00**.
5. **Máquina.** Limpe as datas. **Frota → Abastecimentos → Novo**: *EMP0001*, **Horímetro no abastecimento (máquina)** 120, 40 litros,
   R$ 200. Outro com 130 e 50 litros, R$ 250. Na lista, a coluna **Km/L** do segundo mostra *"5,00 L/h"*; a do primeiro, *"-"*.
6. **Atrasado.** Um terceiro com 125 h e 20 litros: ele mostra *"4,00 L/h"* e o de 130 passa a *"10,00 L/h"*. Exclua o de 125: o de 130
   volta a *"5,00 L/h"*.
7. **Consumo.** Em **Relatórios**, tabela **Consumo médio**: *EMP0001* com Km/L *"-"*, L/h (máquina) *"5,00 L/h"*, Total litros
   *"90,0 L"*, Abastecimentos **2**. Na tabela de custos, KM / Horímetro de *EMP0001* = *"130 h"*; do *AAA1A11*, o km com *"km"*.
8. **Total.** A última linha da tabela de custos, **Total**, soma as colunas Manutenção, Combustível, Multas e Total.
9. **Planilha.** **Exportar planilha** (com o período da tela): a última aba é **Multas** (Data, Veículo, Condutor, Infração, Valor R$,
   Pontos, Vencimento, Status, Nº do Auto, Observações), com a contestada marcada *Contestado*. A aba Abastecimentos tem no fim **Horas
   desde Abastec. Anterior** e **Consumo L/h**. A soma de **Valor Total R$** (Abastecimentos) é a coluna **Combustível** do Total.
10. **Consulta e motorista.** Como Consulta, Relatórios abre igual. Como motorista, Relatórios não está no menu.

## O que as Etapas 1 a 4 **não** cobrem

- Dar **Administrador de Frota** pela tela de Perfis (continua no cadastro de usuário); saber **quem** mudou um perfil; lembrar o
  Consulta de quem foi administrador e deixou de ser.
- A **seção 3** do formulário (imagem cortada), **foto** da avaria/cupom, **desenho** clicável das avarias.
- A **pergunta do km menor nas telas do gestor**; o **alerta de consumo baixo** da máquina (só existe em km/L); apelido **V01/C01**.
- O motorista **corrigir** o que lançou pelo portal (a correção é com o gestor).
