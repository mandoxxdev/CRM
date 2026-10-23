# Módulo Frota — guia do que existe hoje

> **Onde paramos:** **Etapa 1 — portal do motorista — entregue em 2026-10-23** (na `main`, último commit `4ba85d16`). O motorista
> entra pelo celular e preenche saída, retorno, inspeção e abastecimento; o gestor vê o alerta de Falha no painel e exporta a planilha.
> **Próxima: Etapa 2 — dar o perfil Consulta/Motorista pela tela de usuários** (hoje todo não-administrador vira Motorista).
> O módulo ainda **não foi usado em produção**.
>
> Apresentação da etapa (com os cenários e as decisões): [`novidades-por-etapa.md`](novidades-por-etapa.md) ·
> Manual de quem usa: [`manual-do-sistema.md`](manual-do-sistema.md) ·
> Mapa de status: [`specs/modulo-frotas/README.md`](../../specs/modulo-frotas/README.md) ·
> Detalhe técnico: [`referencia-tecnica.md`](referencia-tecnica.md)

## Em uma frase

O sistema tem **um caderno de frota completo para o escritório** (veículos, motoristas, abastecimento, manutenção, viagens,
checklist, multas, documentos, painel e relatório) e, desde a Etapa 1, **uma porta simples para o motorista**: ele entra, toca num
botão grande e preenche o mesmo formulário do papel — e só vê o que é dele.

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
     Checklist Diário, Multas, Relatórios, **Portal do motorista**, Solicitar Material, Minhas Requisições.
   - **Motorista**: menu com **Meu painel**, Solicitar Material e Minhas Requisições. Abrir **Frota** leva direto ao **Meu painel**.

## O portal do motorista (Meu painel)

| O que aparece | Para que serve |
|---|---|
| "Olá, (nome)" e, se ele saiu e não voltou, o cartão "Você está com o veículo … desde …" | Ele sabe se tem viagem aberta |
| Botão **Saída** (some enquanto há viagem aberta) | Formulário do papel; abre a viagem |
| Botão **Retorno** (só com viagem aberta) | Formulário do papel; fecha a viagem e calcula o km rodado |
| Botão **Inspeção** | Formulário do papel sem viagem (inspeção periódica) |
| Botão **Abastecimento** | Veículo, KM, litros, valor, data, posto |
| **Meus registros** | As últimas 30 saídas/retornos/inspeções (com a situação OK / PENDÊNCIA / INCOMPLETO) e os últimos 30 abastecimentos dele |

O formulário de Saída/Retorno/Inspeção tem: veículo (no Retorno é o da viagem), **KM atual**, data, horário, **combustível** (Vazio, ¼,
½, ¾, Cheio), origem/destino/finalidade (só na Saída), os **12 itens** do papel (cada um **OK**, **N/A** ou **Falha**), **avarias**
(onde: lado esquerdo, lado direito, em cima, frente, traseira; o que é: risco, amassado, trinca, quebrado, outro; descrição opcional)
e observações. O **Salvar** só acende com os 12 itens marcados.

## As telas do gestor, uma por uma

Todas as telas de cadastro funcionam igual: **uma tabela**, uma **busca**, às vezes um **filtro**, o botão **"Novo…"** que abre um
formulário, e na linha os botões **editar** (lápis) e **excluir** (lixeira).

| Tela | Para que serve | Funciona? |
|---|---|---|
| **Dashboard Frota** | 9 cartões, lista de alertas (inclui **Checklist com pendência**), custos por categoria, últimos abastecimentos. Botão **Exportar planilha** | Sim |
| **Veículos** | Placa, marca, modelo, ano, tipo, **km** ou **horímetro**, combustível, setor, centro de custo, condutor responsável, chassi, RENAVAM | Sim |
| **Motoristas** | Nome, CPF, CNH, telefone, e-mail, setor e **Usuário de acesso (portal do motorista)** | Sim |
| **Abastecimentos** | Veículo, motorista, data, litros, valor, km, combustível, posto. O sistema sobe o km do veículo e calcula o **km por litro** | Sim |
| **Manutenções** | Preventiva ou corretiva, oficina, custo, peças, km, **próxima revisão**. "Em andamento" põe o veículo em manutenção | Sim |
| **Viagens** | Saída e retorno, km, **origem**, destino, finalidade, setor, status. O botão **Aprovar** aparece só em viagem **solicitada** | Sim |
| **Checklist Diário** | Lista tudo o que o motorista registrou (colunas **Tipo**, **KM**, **Situação**) e o "Novo Checklist" antigo do gestor (7 itens) | Sim. Não edita |
| **Multas** | Data, infração, valor, pontos, vencimento, pago/pendente/contestado | Sim |
| **Documentos** | IPVA, licenciamento, seguro, CRLV, rastreador — com vencimento e "avisar X dias antes" | Sim |
| **Relatórios** | Custo por veículo (com período), consumo médio km/L, **Imprimir** e **Exportar planilha** (com o período da tela) | Sim |
| **Portal do motorista** | O mesmo "Meu painel" do motorista (o gestor só grava se estiver ligado a um motorista) | Sim |
| **Solicitar Material** | Pede peça/material ao almoxarifado | Sim |

## Avisos automáticos (aparecem no Dashboard)

- Documento vencendo (no prazo configurado nele; padrão 30 dias).
- CNH de motorista vencendo em até 30 dias.
- Revisão chegando: até 15 dias pela data, ou faltando 500 km pelo km.
- Multa pendente vencendo em até 15 dias.
- **Consumo baixo**: o km/L dos últimos 60 dias ficou abaixo de 70% do esperado para o veículo.
- **Checklist com pendência** (novo): saída, retorno ou inspeção com alguma **Falha** ou avaria, nos últimos 7 dias. Mostra o que
  falhou, quem registrou e "Registrado em DD/MM/AAAA".

## Quem pode o quê

| Perfil | O que faz |
|---|---|
| **Administrador de Frota** | Tudo: cadastra veículo e motorista, liga motorista ao usuário, aprova e cancela viagem, lança multa e documento, vê painel e relatório, exporta, exclui |
| **Motorista** | Só o que é **dele**: saída, retorno, inspeção e abastecimento pelo portal; vê só os próprios registros, viagens, abastecimentos e multas. **Não** vê o painel nem relatório, **não** vê CPF/CNH dos colegas, **não** lança multa nem documento, **não** aprova viagem |
| **Consulta** | Vê painel, alertas e relatório, e exporta a planilha. Não lança nada |

Pela tela de usuários **só dá para tornar alguém Administrador de Frota**. Quem tem acesso ao Frota e não é administrador vira
**Motorista** automaticamente. "Consulta" existe, mas **não tem botão** — é a Etapa 2.

## O que ainda atrapalha o uso real (em palavras simples)

1. **Quem só acompanha a frota perde o painel.** Como todo não-administrador vira Motorista, uma pessoa do escritório que não é
   administradora cai no "Meu painel" com o aviso de vínculo. Até a Etapa 2: torná-la administradora, ou pedir o perfil Consulta
   direto no banco (letra C2 das novidades).
2. **Falta a parte 3 do formulário** ("Transmissão e itens específicos"): a imagem que recebemos está cortada.
3. **Sem foto** da avaria ou do cupom.
4. **km menor que o anterior ainda passa calado.** Um erro de digitação (900 em vez de 1900) é aceito sem aviso.
5. **Máquina por horímetro** (empilhadeira): o portal pede "KM atual" e grava como km.

**Resolvidos na Etapa 1** (estavam nesta lista no levantamento):

- ~~O motorista vê tudo~~ — **resolvido**: ele só vê e só altera o que é dele.
- ~~Não existe "a minha tela"~~ — **resolvido**: Meu painel.
- ~~Corrigir um abastecimento apaga o km/L~~ — **resolvido**.
- ~~Abastecimento lançado atrasado fica sem km/L~~ — **resolvido**: a conta é pela ordem do km, e o seguinte é refeito.
- ~~Viagem: aprovar uma que já terminou; km de volta menor gerando km negativo~~ — **resolvido**: as duas são recusadas.
- ~~Não sai Excel~~ — **resolvido**: Exportar planilha.

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
8. **Retorno certo.** No mesmo formulário, KM **10120** → Salvar → *"Retorno registrada"*. O cartão some e volta o botão **Saída**.
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

## O que a Etapa 1 **não** cobre

- Dar o perfil **Consulta** ou **Motorista** pela tela (Etapa 2).
- A **seção 3** do formulário (imagem cortada), **foto** da avaria/cupom, **desenho** clicável das avarias.
- **Horímetro** para máquinas, **aviso de km menor** que o atual, **multas no período** do relatório, apelido **V01/C01**.
- O motorista **corrigir** o que lançou pelo portal (a correção é com o gestor).
