# Módulo Frota — guia do que existe hoje

> **Onde paramos:** **Etapa 10 — Voltar no topo dos formulários do portal — entregue em 2026-10-30** (`79aad18f`): Saída, Retorno,
> Inspeção e Abastecimento têm **← Voltar** ao lado do título, além do Voltar do rodapé. Antes: **Etapa 9 — endereço do destino (CEP ou à mão), destino da lista na Viagem do gestor e o endereço da GMP na
> origem — entregue em 2026-10-29** (na `main`, `d7ba0b09` a `70e9aa76`, mais o fechamento). O "+ Novo destino", a tela **Destinos** e a **Nova Viagem** do
> gestor pedem o endereço completo — o **CEP** preenche rua, bairro, cidade e estado; quem não sabe, digita —; a Nova Viagem escolhe o
> destino da **lista** (antes era texto); a origem mostra **Saindo de: GMP** com o endereço de **Configurações → Empresa**. No mesmo dia
> saiu o botão **?** de ajuda do canto da tela (`d5a9d565`). Antes: **Etapa 8 — administrador pela tela, destinos cadastrados, condutor do carro de funcionário, saída da GMP e
> abastecimento sem foto — entregue em 2026-10-28** (na `main`, `a8a8d885` a `d38f0a71`, mais o fechamento). Cinco pedidos da empresa de
> uma vez: em **Perfis de acesso** o gestor dá e tira **Administrador de Frota**; o **Abastecimento** do portal não pede mais foto; a
> **Saída** sai sempre **da GMP**, escolhe o destino numa **lista que o próprio motorista alimenta** (**+ Novo destino**) e, no carro
> **liberado para funcionários**, pede **quem vai dirigir**; o gestor tem a tela **Destinos**. Antes: **Etapa 7 (pequena) — o gestor
> remove uma foto pela lista — 2026-10-28** (`7bfcec6e`). E antes: **Etapa 6 — tratar a pendência do registro — entregue em 2026-10-23** (commits `492a0d87` a
> `8fa7ece2`, com a Fase 5, mais o fechamento). O gestor marca a falha ou avaria como **tratada** (o que foi feito, e a manutenção se
> houver) na lista Checklist ou no próprio alerta; o alerta sai do painel na hora e não some mais sozinho; o motorista vê em Meus registros.
> **O módulo está pronto para uso**; os próximos passos dependem do André (placas/modelos/km dos 4 veículos; folha inteira do formulário) ou
> são pequenos — ver "Próximo passo" no [mapa](../../specs/modulo-frotas/README.md). Antes, no mesmo dia: Etapa 5 (foto da avaria e do cupom). O motorista tira até 3 fotos pelo celular na Saída, no Retorno, na Inspeção e no Abastecimento; vê, reenvia e
> remove em Meus registros; o gestor e o Consulta veem a miniatura nas listas Checklist e Abastecimentos. E antes: Etapa 4
> (relatórios fechados), Etapa 3 (km e horímetro no portal), Etapa 2 (perfil Consulta/Motorista pela tela) e Etapa 1 (portal do motorista).
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
| **Meus registros** | As últimas 30 saídas/retornos/inspeções (com a situação OK / PENDÊNCIA / INCOMPLETO) e os últimos 30 abastecimentos dele, com as **fotos** de cada um (**+ Foto** e **Remover foto**) |

O formulário de Saída/Retorno/Inspeção tem: veículo (no Retorno é o da viagem), **KM atual** (na máquina por horímetro, **Horímetro
atual**; embaixo, *"Último registrado neste veículo: …"*), data, horário, **combustível** (Vazio, ¼,
½, ¾, Cheio), **Saindo de: GMP** (fixo), **Indo para onde (destino)** — uma lista com **+ Novo destino** — , **Quem vai dirigir
(condutor)** (só no carro liberado para funcionários) e finalidade (os quatro só na Saída; desde a Etapa 8), os **12 itens** do papel (cada um **OK**, **N/A** ou **Falha**), **avarias**
(onde: lado esquerdo, lado direito, em cima, frente, traseira; o que é: risco, amassado, trinca, quebrado, outro; descrição opcional)
e observações. O **Salvar** só acende com os 12 itens marcados. Número **menor** que o último do veículo: um aviso enquanto digita e,
ao salvar, a pergunta com o botão **Confirmar mesmo assim** (desde a Etapa 3).

**Fotos (desde a Etapa 5).** O formulário de Saída/Retorno/Inspeção tem **Tirar foto** (o Abastecimento tinha e **deixou de ter** na
Etapa 8, a pedido da empresa): abre a câmera do celular; até 3 fotos, cada uma com
**Remover foto**. As fotos sobem **depois** que o lançamento é salvo; se alguma falhar, o lançamento fica salvo e aparece *"Salvo, mas 1
foto não foi enviada: …"* — ela se manda de novo em **Meus registros** (**+ Foto**). Foto grande ou do iPhone (HEIC) é reduzida no
próprio celular antes de subir. O gestor vê a primeira foto em miniatura (e *"+1"*/*"+2"*) na coluna **Fotos** das listas **Checklist
Diário** e **Abastecimentos**.

## As telas do gestor, uma por uma

Todas as telas de cadastro funcionam igual: **uma tabela**, uma **busca**, às vezes um **filtro**, o botão **"Novo…"** que abre um
formulário, e na linha os botões **editar** (lápis) e **excluir** (lixeira). Para quem está como **Consulta**, esses botões não aparecem.

| Tela | Para que serve | Funciona? |
|---|---|---|
| **Dashboard Frota** | 9 cartões, lista de alertas (inclui **Checklist com pendência**), custos por categoria, últimos abastecimentos. Botão **Exportar planilha** | Sim |
| **Veículos** | Placa, marca, modelo, ano, tipo, **km** ou **horímetro**, combustível, setor, centro de custo, condutor responsável, **Liberado para funcionários** (o carro do setor: a Saída do portal passa a pedir quem vai dirigir; a coluna Condutor mostra "Funcionários"), chassi, RENAVAM | Sim |
| **Motoristas** | Nome, CPF, CNH, telefone, e-mail, setor e **Usuário de acesso (portal do motorista)** | Sim |
| **Abastecimentos** | Veículo, motorista, data, litros, valor, km (ou **horímetro**, na máquina), combustível, posto. O sistema sobe o km (ou o horímetro) do veículo e calcula o **km por litro** (carro) ou os **litros por hora** (máquina). Coluna **Fotos** (cupom) com **Remover foto** para o gestor | Sim |
| **Manutenções** | Preventiva ou corretiva, oficina, custo, peças, km, **próxima revisão**. "Em andamento" põe o veículo em manutenção | Sim |
| **Viagens** | Saída e retorno, km (ou **horímetro**, na máquina), **origem** (a viagem nova já vem **GMP**), destino (texto), **condutor** (quem dirigiu o carro liberado para funcionários; opcional aqui), finalidade, setor, status. O botão **Aprovar** aparece só em viagem **solicitada** | Sim |
| **Destinos** (Etapa 8) | A lista que o motorista escolhe na Saída: nome, endereço, quem cadastrou, status. **Excluir** desativa (as viagens antigas guardam o nome); **Mostrar: Todos** mostra os desativados para reativar | Sim |
| **Checklist Diário** | Lista tudo o que o motorista registrou (colunas **Tipo**, **KM**, **Situação**) e o "Novo Checklist" antigo do gestor (7 itens). Na linha com **PENDÊNCIA**, **Tratar pendência** (o que foi feito, e a manutenção se houver); tratada, **PENDÊNCIA · tratada** e **Desfazer tratamento**. Coluna **Fotos** com **Remover foto** para o gestor | Sim. Não edita |
| **Multas** | Data, infração, valor, pontos, vencimento, pago/pendente/contestado | Sim |
| **Documentos** | IPVA, licenciamento, seguro, CRLV, rastreador — com vencimento e "avisar X dias antes" | Sim |
| **Relatórios** | Custo por veículo e consumo (km/L do carro, **litros por hora** da máquina) no **mesmo período** (uma data ou duas), com o período aplicado escrito, linha **Total**, **Imprimir** e **Exportar planilha** (mesmo período, com a aba **Multas**) | Sim |
| **Perfis de acesso** | Só o administrador. Uma linha por usuário: **Motorista (padrão)**, **Consulta** ou **Administrador de Frota** (desde a Etapa 8, com confirmação ao dar), o que o perfil permite e o motorista ligado; avisa quando quem vira Consulta é motorista | Sim |
| **Portal do motorista** | O mesmo "Meu painel" do motorista (o gestor só grava se estiver ligado a um motorista) | Sim |
| **Solicitar Material** | Pede peça/material ao almoxarifado | Sim |

## Avisos automáticos (aparecem no Dashboard)

- Documento vencendo (no prazo configurado nele; padrão 30 dias).
- CNH de motorista vencendo em até 30 dias.
- Revisão chegando: até 15 dias pela data, ou faltando 500 km pelo km (na máquina por horímetro, faltando 50 horas pelo horímetro).
- Multa pendente vencendo em até 15 dias.
- **Consumo baixo**: o km/L dos últimos 60 dias ficou abaixo de 70% do esperado para o veículo (só carro; a máquina não tem este aviso).
- **Checklist com pendência**: saída, retorno ou inspeção com alguma **Falha** ou avaria que o gestor **ainda não tratou** (de veículo
  ativo). Mostra o que falhou, quem registrou e "Registrado em DD/MM/AAAA"; o gestor tem o botão **Tratar pendência** ali mesmo. *Até a
  Etapa 5 dizia "nos últimos 7 dias" — o alerta sumia sozinho; desde a Etapa 6 fica até ser tratado.*

## Quem pode o quê

| Perfil | O que faz |
|---|---|
| **Administrador de Frota** | Tudo: cadastra veículo e motorista, liga motorista ao usuário, aprova e cancela viagem, lança multa e documento, **trata a pendência** dos registros, **remove foto** de qualquer lançamento pela lista, vê painel e relatório, exporta, exclui |
| **Motorista** | Só o que é **dele**: saída, retorno, inspeção e abastecimento pelo portal; vê só os próprios registros, viagens, abastecimentos e multas. **Não** vê o painel nem relatório, **não** vê CPF/CNH dos colegas, **não** lança multa nem documento, **não** aprova viagem |
| **Consulta** | Vê painel, alertas, as listas (inclusive CPF/CNH dos motoristas) e relatório, e exporta a planilha. Não lança, não edita, não aprova, não exclui — os botões nem aparecem |

**Administrador de Frota**, **Consulta** e **Motorista** se dão em **Frota → Perfis de acesso** (só o administrador abre; desde a Etapa 8
o Administrador também — antes só na tela de usuários, "administra o módulo Frota", que continua valendo e é a mesma marca). Superadmin
e administrador do sistema não se mexem por ali. Quem não tem perfil escolhido entra como **Motorista**. Mudou o perfil de alguém? Vale
no próximo clique dela; o menu dela muda quando ela recarrega a página. O motorista também **cadastra destinos** (pelo **+ Novo destino**
da Saída).

## O que ainda atrapalha o uso real (em palavras simples)

1. **Falta a parte 3 do formulário** ("Transmissão e itens específicos"): a imagem que recebemos está cortada.
2. **O escritório não recebe a pergunta do km menor** (é ele quem lança atrasado e corrige): um km errado digitado na tela do gestor
   entra como antes.

**Resolvidos na Etapa 1** (estavam nesta lista no levantamento):

- ~~O motorista vê tudo~~ — **resolvido**: ele só vê e só altera o que é dele.
- ~~Não existe "a minha tela"~~ — **resolvido**: Meu painel.
- ~~Corrigir um abastecimento apaga o km/L~~ — **resolvido**.
- ~~Abastecimento lançado atrasado fica sem km/L~~ — **resolvido**: a conta é pela ordem do km, e o seguinte é refeito.
- ~~Viagem: aprovar uma que já terminou; km de volta menor gerando km negativo~~ — **resolvido**: as duas são recusadas.
- ~~Não sai Excel~~ — **resolvido**: Exportar planilha.

**Resolvido na Etapa 5:**

- ~~Sem foto da avaria ou do cupom~~ — **resolvido**: Tirar foto no portal; miniatura nas listas do gestor.

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

## Roteiro de teste manual (fotos)

Preparação: como administrador, o carro *AAA1A11* e dois usuários com acesso ao módulo Frota ligados a motoristas (*Ana* e *Bruno*,
em **Frota → Motoristas**, campo **Usuário de acesso**). Um celular (ou o navegador do computador, que abre a escolha de arquivo no
lugar da câmera) e uma foto qualquer em JPEG, mais um arquivo que não é foto (um `.pdf`).

1. **Foto da avaria.** Entre como *Ana* → **Meu painel** → **Inspeção**. Escolha *AAA1A11*, preencha o KM e os 12 itens, inclua uma
   avaria (Lado esquerdo, Amassado). No grupo **Fotos** aparece *"Até 3 fotos (avarias, painel…). Elas sobem depois que o registro for
   salvo."*. Toque **Tirar foto** e tire (ou escolha) uma foto: a miniatura aparece com **Remover foto**.
2. **Limite.** Tire mais duas: o botão **Tirar foto** apaga e a dica vira *"Limite de 3 fotos."*. Toque **Remover foto** numa delas: o
   botão volta.
3. **Salvar.** **Salvar** → *"Inspeção registrada"*; o formulário fecha só depois de as fotos subirem. Em **Meus registros**, a inspeção
   mostra as miniaturas; tocar numa abre a foto em outra aba.
4. **Cupom.** **Abastecimento**: veículo, KM, litros; no grupo **Foto do cupom**, **Tirar foto** → **Salvar** → *"Abastecimento
   registrado"*. Em **Meus registros**, o abastecimento mostra a foto.
5. **+ Foto e Remover.** No abastecimento, toque **+ Foto** e escolha outra foto → *"Foto enviada"*. Toque **Remover foto** embaixo
   dela → confirme *"Remover esta foto?"* → *"Foto removida"*.
6. **Arquivo que não é foto.** No computador, **+ Foto**, troque o filtro da janela para "todos os arquivos" e escolha o `.pdf` → aparece *"Formato de imagem não suportado"* e nada é guardado.
7. **Falha depois de salvar.** Faça uma **Inspeção** com uma foto e, antes de tocar **Salvar**, desligue a internet do celular **logo
   depois** de tocar: o registro fica salvo e aparece *"Salvo, mas 1 foto
   não foi enviada: …"*. Religue e mande por **+ Foto**.
8. **O gestor vê.** Como administrador, **Frota → Checklist Diário**: a coluna **Fotos** da inspeção da Ana mostra a primeira foto e
   *"+1"* (ou *"+2"*); clicar abre. **Frota → Abastecimentos**: a foto do cupom. Linha sem foto: *"-"*.
9. **O colega não vê.** Entre como *Bruno*: em **Meu painel**, nada da Ana. Como **Consulta**, as listas mostram as fotos de todos.
10. **Excluir leva as fotos.** Como administrador, guarde (botão direito → copiar endereço) o link de uma foto da inspeção da Ana,
    exclua a inspeção em **Checklist Diário** e abra o link: a página não encontra nada (404).
11. **O link vence.** Um link de foto copiado vale por cerca de 2 horas; depois disso abre em branco (404). Recarregar a lista gera
    links novos.

## Roteiro de teste manual (tratar a pendência)

Preparação: como administrador, o carro *AAA1A11*; a motorista *Ana* ligada a um usuário (**Frota → Motoristas**, **Usuário de
acesso**); um usuário com perfil **Consulta** (**Frota → Perfis de acesso**). Em **Manutenções**, lance *"Troca das pastilhas"* para
*AAA1A11* (corretiva).

1. **Nasce a pendência.** Entre como *Ana* → **Meu painel** → **Inspeção**, *AAA1A11*, KM, os 12 itens com **Freios** em **Falha** →
   **Salvar**. Em **Meus registros**, a etiqueta **PENDÊNCIA**.
2. **O alerta.** Como administrador, **Frota → Dashboard Frota**: *"Checklist com pendência — AAA1A11"*, *"Falha: Freios / freio de
   estacionamento · Ana"*, e o botão **Tratar pendência**.
3. **O Consulta não trata.** Entre como **Consulta**: o mesmo alerta, **sem** o botão. Em **Checklist Diário**, sem a coluna de ações.
4. **A janela.** De volta como administrador, toque **Tratar pendência** no alerta: abre *"Tratar pendência — AAA1A11"*. Com o campo
   **O que foi feito \*** vazio, **Marcar como tratada** fica apagado. Em **Manutenção (opcional)** aparecem *"— nenhuma —"* e a
   manutenção *"(data) · Troca das pastilhas"* — só as do *AAA1A11*.
5. **Tratar.** Escreva *"Pastilhas trocadas"*, escolha a manutenção → **Marcar como tratada** → *"Pendência tratada"*. O painel
   recarrega e o alerta não está mais lá.
6. **A marca na lista.** **Frota → Checklist Diário**: a inspeção mostra **PENDÊNCIA · tratada** e *"Tratada em (dia) às (hora) por
   (seu nome): Pastilhas trocadas (manutenção: Troca das pastilhas)"*, com o botão **Desfazer tratamento**. Uma linha **OK** não tem
   botão de tratar.
7. **A motorista vê.** Como *Ana*, **Meus registros**: **PENDÊNCIA · tratada** e *"Tratada em (dia) às (hora): Pastilhas trocadas"*.
8. **Duas abas.** Como administrador, faça outra inspeção com falha (passo 1) e abra **Checklist Diário** em duas abas. Trate na
   primeira; na segunda, sem recarregar, tente tratar → *"Esta pendência já foi tratada"*.
9. **Desfazer.** **Desfazer tratamento** → confirme *"Desfazer o tratamento desta pendência? O alerta volta para o painel."* →
   *"Tratamento desfeito"*. No **Dashboard Frota**, o alerta voltou.
10. **A planilha.** **Exportar planilha** → aba **Checklist**: as últimas colunas **Pendência tratada em**, **Tratada por** e **O que
    foi feito** preenchidas na inspeção tratada e vazias nas outras.

## Roteiro de teste manual (remover foto pela lista)

Preparação: o roteiro das fotos feito (a inspeção da *Ana* em *AAA1A11* com 3 fotos e um abastecimento com 1 foto). Um usuário
**Consulta**.

1. **O botão.** Como administrador, **Frota → Checklist Diário**: na linha da inspeção da Ana, a coluna **Fotos** mostra a 1ª miniatura,
   *"+2"* e **Remover foto**. Linha sem foto: só *"-"*. Confira o mesmo em **Frota → Abastecimentos**.
2. **Quem vê.** Como **Consulta**: miniatura e *"+2"*, sem botão. Como *Ana*, na mesma lista: sem botão (ela remove em Meus registros).
3. **A janela.** **Remover foto** → *"Fotos de AAA1A11"*, com as 3 miniaturas (cada uma abre em outra aba), **Remover foto** em cada e
   **Fechar**.
4. **Cancelar.** **Remover foto** na 2ª → *"Remover esta foto?"* → **Cancelar**: nada muda. **Fechar**: a lista não recarrega.
5. **Remover.** **Remover foto** na 2ª → **OK** → *"Foto removida"*; a janela fica com 2. **Fechar** → a lista recarrega e mostra *"+1"*.
6. **A última.** No abastecimento (1 foto): **Remover foto** → **Remover foto** → **OK** → a janela fecha sozinha e a coluna mostra *"-"*.
7. **Duas abas.** Abra a janela da inspeção em duas abas; remova a 1ª foto numa; na outra, remova a mesma: *"Foto não encontrada"* e ela
   some da janela.
8. **Sem internet.** Desligue a rede e remova: *"Não foi possível remover a foto. Confira a internet e tente de novo."*; a janela fica.

## Roteiro de teste manual (Etapa 8: administrador, destinos, condutor, origem GMP, abastecimento sem foto)

Preparação: um veículo *BBB2B22* e a motorista *Ana* ligada ao login dela; um usuário *Fabio* com acesso ao módulo Frota e sem perfil;
um usuário *Bruno* idem.

1. **Dar Administrador.** Como administrador, **Frota → Perfis de acesso**: na linha do *Fabio*, o seletor tem **Motorista (padrão)**,
   **Consulta** e **Administrador de Frota**. Escolha **Administrador de Frota** → *"Dar Administrador de Frota a Fabio? A pessoa passa a
   fazer tudo no módulo, inclusive dar perfis."* → **Cancelar**: nada muda. De novo → **OK** → *"Perfil definido: Administrador de
   Frota"*. Na tela de usuários do sistema, o *Fabio* aparece marcado em "administra o módulo Frota".
2. **O novo administrador age.** Como *Fabio*, abra **Frota** e o **Meu painel** (o menu vira o do gestor), depois **Perfis de acesso**: dê
   **Consulta** ao *Bruno* → *"Perfil definido: Consulta"*. Tente mudar o próprio *Fabio*: a linha dele não aceita (*"Você não pode mudar o
   seu próprio perfil por esta tela."* se forçar pela API).
3. **Tirar.** Como administrador, na linha do *Fabio* escolha **Consulta** (sem pergunta) → *"Perfil definido: Consulta"*. Como *Fabio*, o
   botão **Novo Veículo** some ao recarregar; **Perfis de acesso** responde *"Sem permissão para esta operação"*.
4. **Superadmin.** Na linha do superadmin: etiqueta **Administrador** e *"Superadmin ou administrador do sistema: não se altera por esta
   tela."*, sem seletor.
5. **Abastecimento sem foto.** Como *Ana*, **Meu painel → Abastecimento**: não há **Tirar foto** nem "Foto do cupom". Salve um
   abastecimento; em **Meus registros** ele aparece sem **+ Foto**. A **Saída** continua com **Tirar foto**.
6. **Carro liberado.** Como administrador, **Veículos → editar BBB2B22** → marque **Liberado para funcionários** → Salvar; a coluna
   Condutor mostra *"Funcionários"*.
7. **Saída com destino novo e condutor.** Como *Ana*, **Saída** → veículo *BBB2B22*: aparece **Saindo de: GMP** (fixo) e o campo **Quem vai
   dirigir (condutor)**. Em **Indo para onde (destino)** a lista está vazia → **+ Novo destino** → **Adicionar** sem nome → *"Informe o nome
   do destino"*; digite *Obra Beta* → **Adicionar** → *"Destino adicionado"*, já selecionado. Preencha os 12 itens, deixe o condutor vazio →
   **Salvar** → *"Informe quem vai dirigir (condutor)"*. Digite *Carlos* → **Salvar** → *"Saída registrada"*; o cartão diz *"…destino Obra
   Beta, condutor Carlos."*.
8. **Destino repetido.** Como *Bruno* (ligue-o a um motorista), **Saída → + Novo destino** → *obra beta* → *"Esse destino já existia —
   selecionado."*.
9. **O gestor vê.** **Frota → Viagens**: a linha com Origem *GMP*, Destino *Obra Beta*, Motorista *Ana*, **Condutor *Carlos***; busque
   *Carlos* e ela aparece. **Exportar planilha**, aba **Viagens e KM**: Condutor = *Carlos*. **Frota → Destinos**: *Obra Beta*, cadastrado por
   *Ana*, **Ativo**.
10. **Renomear e desativar.** Em **Destinos**, edite *Obra Beta* → *Obra Beta II*: a viagem da Ana continua *"Obra Beta"*. **Excluir** →
    some da lista; **Mostrar: Todos** → aparece **Desativado**; Editar → Status **Ativo** → volta. Como *Ana*, com a Saída aberta com o
    destino escolhido, peça ao gestor para desativar e salve: *"Destino não encontrado"* e a tela avisa *"O destino escolhido foi
    desativado. Escolha outro."*.
11. **Carro comum.** Desmarque **Liberado para funcionários**; na Saída da *Ana* o campo de condutor não aparece.

## Roteiro de teste manual (Etapa 9: endereço do destino, destino na Viagem do gestor, origem com endereço)

Antes: em **Configurações → Empresa**, confira endereço, cidade, estado e CEP da GMP. Precisa de internet para a busca do CEP.

1. Entre como motorista → **Meu painel → Saída** → escolha um veículo. Confira *"Saindo de: GMP"* e o endereço da GMP embaixo.
2. **+ Novo destino** → Nome *Obra Teste* → CEP *09844100* → **Buscar**. Confira que Rua, Bairro, Cidade e Estado foram preenchidos e
   Número e Complemento não. Digite o Número → **Adicionar** → *"Destino adicionado"*; a lista mostra *"Obra Teste — (cidade)/(UF)"*.
3. **+ Novo destino** → Nome *Cliente Teste*, sem CEP, preencha Rua, Número *S/N*, Cidade e Estado e **deixe o Bairro vazio** →
   **Adicionar** → *"Informe o bairro do destino"*. Preencha o Bairro → **Adicionar** → aceito.
4. **+ Novo destino** → CEP *0984* → **Buscar** → *"CEP deve ter 8 dígitos"*; CEP *00000000* → **Buscar** → *"CEP não encontrado —
   preencha o endereço à mão"*.
5. **+ Novo destino** → Nome *obra teste* (minúsculas), nada mais → **Adicionar** → *"Esse destino já existia — selecionado."*.
6. Com o bloco aberto, tecle **Enter** no campo Nome: a Saída **não** é gravada. Enter no CEP: busca o CEP.
7. Corrija a Rua à mão, clique no CEP e saia dele sem mudar nada: a Rua corrigida **continua**.
8. Como gestor: **Frota → Viagens → Nova Viagem**. Confira a linha *"Saindo de: GMP — (endereço)"* (não há campo Origem), escolha
   **Destino** *Obra Teste — …* e salve. Na lista: Origem *GMP*, Destino *Obra Teste*.
9. **Nova Viagem → + Novo destino** com *Obra Teste* → *"Esse destino já estava cadastrado — selecionamos ele."*.
10. Edite uma viagem antiga (de antes desta etapa): confira *"Destino gravado: … Escolha da lista só se quiser trocar."* e **Manter o
    destino gravado**; salve sem mexer → nada muda.
11. **Destinos** → **Excluir** *Obra Teste*. Edite a viagem do passo 8: o destino aparece *"Obra Teste (desativado)"*; mude só o km → salva.
12. **Destinos → Mostrar: Todos** → edite um destino da Etapa 8 (sem rua): aparece *"Endereço antigo: …"*. Status **Ativo** → **Salvar**
    → reativado sem pedir endereço. Preencha só o CEP e salve → *"Informe a rua (logradouro) do destino"*.
13. **Destinos** → busque *09844100* (sem traço) → acha *Obra Teste*.
14. Em qualquer tela: o botão **?** do canto inferior direito não aparece mais.

**Não cobre:** mapa/distância; endereço na planilha (a coluna Destino continua com o nome); conferir se o CEP é da cidade digitada;
a origem pela API continua aceitando outro lugar (só a tela é fixa).

## Roteiro de teste manual (Etapa 10: Voltar no topo)

1. Entre no celular (ou na janela estreita do navegador) como motorista → **Meu painel**.
2. Toque **Saída**: o título "Saída" tem **← Voltar** à direita. Toque nele: volta ao painel, nada gravado.
3. Repita com **Inspeção** e **Abastecimento** (e **Retorno**, com uma viagem aberta).
4. Abra **Abastecimento**, preencha e toque **Salvar**: enquanto aparece "Salvando…", os dois Voltar ficam apagados.

**Não cobre:** as janelas do gestor (o Cancelar já fica visível).

## O que as Etapas 1 a 10 **não** cobrem

- Saber **quem** mudou um perfil (não há trilha); lembrar o Consulta de quem foi administrador **pelo cadastro de usuário** e deixou de
  ser; o menu de quem **deixa** de ser administrador muda ao abrir o **Painel** (ou no Atualizar dele); nas outras telas, só ao recarregar. *(Dizia: "Dar Administrador de Frota pela tela de
  Perfis" — resolvido na Etapa 8.)*
- **Destinos:** acento conta como letra diferente ("Sao Paulo" e "São Paulo" cabem os dois); o formulário de **Viagens** do gestor
  continua com destino em texto; não há mapa nem coordenadas.
- **Condutor:** texto livre (não é uma lista de funcionários); só na Saída do portal é obrigatório; não há condutor no Retorno nem na
  Inspeção.
- A **seção 3** do formulário (imagem cortada), **desenho** clicável das avarias.
- **Fotos:** saber **quem** removeu uma foto (não há trilha); remover pela janela de edição do lançamento (é pela coluna **Fotos**); a
  foto é do registro, não de cada avaria; a tela antiga **Novo Checklist** e o formulário de abastecimento do gestor não enviam foto; a
  planilha e os relatórios não levam foto. *(Dizia: "o gestor não remove uma foto sozinha na lista" — resolvido na Etapa 7.)*
- A **pergunta do km menor nas telas do gestor**; o **alerta de consumo baixo** da máquina (só existe em km/L); apelido **V01/C01**.
- O motorista **corrigir** o que lançou pelo portal (a correção é com o gestor).
- **Pendência:** tratar cada falha separadamente (o tratamento é do registro inteiro); histórico de tratamentos (fica só o último); avisar o
  motorista quando a pendência dele é tratada (ele vê em Meus registros).
