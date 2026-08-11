# Almoxarifado — Guia das Etapas e Testes Manuais

> Atualizado em 2026-08-11 · Branch: `desenvolvimento-almoxarifado` · Como rodar: `npm run dev` (raiz do projeto)

Este documento explica, em linguagem simples, o que mudou no módulo Almoxarifado até agora (Etapas 1 a 6c) e tem um roteiro de cliques para você testar manualmente no navegador cada etapa.

> ## Onde o desenvolvimento parou — 2026-08-11
>
> **Etapas 1, 2, 3, 4, 5 e 6 completas — a Task 9 (correção da Etapa 6) também, e o review final do
> branch inteiro já foi feito e corrigido. Etapa 6b (Números de Série) — ENTREGUE. Etapa 6c
> (Etiquetas com QR Code) — ENTREGUE (`35967b9..0785119`), e é a última parte da feature 10: lote +
> série + etiqueta física fecham o ciclo. Próxima etapa da ordem: Etapa 7 — Transferências e
> Devoluções.**
>
> **A Etapa 6c fechou nesta mesma data, sem tocar uma linha do servidor.** PDF de etiqueta (folha A4
> em grade de 10, ou térmica 100×50mm) gerado inteiro no navegador, com QR Code que abre a tela do
> item já filtrada e destacada — quem lê o QR com o celular cai direto na linha certa, e o app pede
> login (é dado de estoque, exige sessão). Botão de imprimir aparece em três lugares: na nota de
> Recebimento já processada, em cada linha de lote/série na tela "Lotes e Séries" (mais um botão em
> massa para todas as séries em estoque), e em Materiais. Ver a seção "Etapa 6c", mais abaixo, para
> o roteiro de teste completo e o que ainda não está coberto.
>
> **A Etapa 6b fechou em 2026-08-11.** As Tasks 8-11 entregaram a UI que faltava: textarea com
> gerador de sequência na entrada (Movimentações), seletor de séries em estoque na saída, campo de
> séries no Recebimento, e a aba "Séries" dentro de "Lotes e Séries" com bloqueio justificado. O
> aviso que existia aqui — "não ligue Controle por série até a interface existir" — está
> **superado**: a interface existe. A única ressalva que sobra é local: o modal rápido de
> entrada/saída dentro da tela de **Materiais** continua sem campo de série (e sempre recusa
> material controlado) — use a tela **Movimentações** para esses materiais. Ver a seção "Etapa 6b",
> mais abaixo, para o roteiro de teste completo e o que ainda não está coberto.
>
> **2026-08-11 — auditoria completa das 24 specs contra o código, e mais uma correção.** Todas as
> specs de feature foram conferidas contra o que o sistema faz de verdade e corrigidas onde
> mentiam (as piores: a 23 dizia que a auditoria "não era usada em produção" — é usada desde a
> Etapa 3; a 01 dizia que "Controle por lote" não fazia nada — faz desde a Etapa 6). A auditoria
> também achou um **bug real**: a tela de Requisições não conhecia os status **Totalmente/
> Parcialmente Reservada** da Etapa 4 — requisição aprovada com saldo aparecia com o código cru
> no badge e **sem os botões "Iniciar Separação" e "Cancelar Requisição"**. Corrigido
> (`92fe236`), com teste. Ver a linha nova na tabela da Etapa 4 abaixo.
>
> A **Etapa 6 (Lotes)** fechou o motor: lote deixou de ser um campo de texto que o sistema
> guardava e nunca olhava e virou um cadastro de verdade, com validade, corrida, certificado do
> fornecedor e situação (ativo / bloqueado / reprovado). O lote nasce no recebimento, o sistema
> recusa tirar de um lote mais do que aquele lote tem, recusa consumir lote vencido, bloqueado ou
> reprovado, e sugere sozinho o lote que vence primeiro na hora da saída.
>
> **O review da Etapa 6 achou três rotas prontas sem nenhuma tela** — a mais grave: com "Requer
> certificado" ligado, o lote nascia bloqueado e só um desenvolvedor por API conseguia destravar.
> A **Task 9**, aprovada pelo cliente em 2026-08-09, fechou essa lacuna: nova tela **Almoxarifado →
> Lotes** (mudar status, liberar vencimento, anexar certificado) e **Sucata**/**Perda** agora
> selecionáveis na tela de Movimentações. Ver a seção "Task 9", logo depois da Etapa 6 abaixo.
>
> **A Etapa 6 (+ Task 9) cobriu LOTES; a Etapa 6b cobriu SÉRIE; a Etapa 6c cobriu ETIQUETA.** A
> feature 10 (lotes, séries e etiquetas) está completa por inteiro — foi dividida em três de
> propósito, porque era grande demais para uma etapa só.
>
> **Duas coisas continuam faltando, e você vai esbarrar nelas:**
> 1. **Reprovar na inspeção não marca o lote** — continua bloqueando o material inteiro.
> 2. **Duas decisões de negócio estão esperando você** (contagem de prateleira depois de um ajuste
>    global; e certificado de fornecedor sendo servido sem exigir login). Ambas explicadas em
>    "Pendências conhecidas", no fim deste documento.
>
> **O review final do branch (2026-08-10) achou três coisas que este guia e as specs declaravam
> ao contrário do que o sistema fazia, e as três foram corrigidas:**
> 1. **"Controle por lote" travava a entrega e a devolução.** O guia dizia que a opção exige lote
>    "em toda entrada e saída". Exigia mesmo — inclusive nas telas onde **não existe campo de
>    lote**: entregar uma requisição, excluir uma requisição, devolver material e sucatear
>    devolução. Na prática, ligar a opção tornava o material impossível de entregar, e a reserva da
>    requisição ficava presa sem poder ser consumida. Agora a exigência vale só onde você tem onde
>    digitar: **Movimentações** (as duas telas) e **Recebimentos**. Ver "O que a Etapa 6 não cobre".
> 2. **Reprocessar uma nota podia duplicar estoque.** Se a nota tinha dois itens e o segundo
>    falhava, o primeiro já tinha entrado — e clicar "Processar Nota" de novo entrava com ele
>    outra vez (10 viravam 20). Agora a nota é conferida inteira antes de mover qualquer coisa, e
>    item que já entrou não entra de novo.
> 3. **A lista de lotes mostrava um saldo que a saída recusava.** Se o lote estava endereçado numa
>    localização e a saída saía de outra, a tela dizia "saldo 25" e o sistema respondia "saldo
>    insuficiente: 0". Agora as duas pontas usam o mesmo número — o saldo total daquele lote.
>
> **A próxima é a Etapa 7 — Transferências e Devoluções** (specs 11 e 12, já auditadas em
> 2026-08-11). Ver o planejamento mestre em `specs/modulo-almoxarifado/README.md` e a tarefa
> detalhada no fim de
> `docs/superpowers/plans/2026-08-11-almoxarifado-etapa6c-etiquetas.md`.

## Tabela consolidada — todas as alterações (Etapas 1 a 6c)

Visão única de tudo que mudou. Os detalhes e roteiros de teste de cada linha estão nas seções da etapa correspondente, mais abaixo.

| Etapa | Onde | Antes | Agora |
|---|---|---|---|
| 1 | Movimentações | "Disponível" era só o saldo físico | Disponível = físico − bloqueado − inspeção − reservado |
| 1 | Movimentações | Campo de texto livre "referência" para OS/projeto | Vínculo estruturado: selects de Ordem de Serviço, Projeto e Centro de Custo |
| 1 | Movimentações | Saída de emergência não existia | Checkbox "Saída emergencial": exige justificativa e marca "PENDENTE REGULARIZAÇÃO" |
| 1 | Movimentações | Movimentação errada era excluída (apagava histórico) | **Estorno**: lançamento reverso com motivo obrigatório, badge "ESTORNADA" na original |
| 1 | Materiais | Custo médio não era recalculado | Toda entrada com custo unitário recalcula o custo médio |
| 1 | Materiais / Livro | Não havia histórico por item | Tela de **Extrato**: saldos, custo médio, saldo por localização, movimentações e reservas |
| 1 | Movimentações | Formulário simples (material, tipo, quantidade) | Formulário rico: localização origem/destino, lote, custo unitário, vínculos |
| 2 | Configurações | Um almoxarifado implícito | **Multi-almoxarifado** (os dados antigos migraram para o "ALM-GERAL") |
| 2 | Configurações / Motor | Localização sem restrições | Localização pode ser **bloqueada** ou restrita a tipos de material — o motor recusa movimento que contrarie |
| 2 | Configurações | Famílias em lista simples | Famílias com **subfamílias** (um nível) |
| 2 | Materiais | Formulário com poucos campos | Formulário em **6 seções** (técnicos, reposição, controles, ABC, unidades compra/consumo com fator) |
| 2 | Materiais | Edição sem rastro | Criação/edição de material grava **auditoria** (campo a campo, de/para) |
| 2 | Backend | Sem consulta de posições vazias / sem endereço | APIs `/localizacoes/vazias` e materiais sem endereço (ainda sem tela) |
| 3 | Requisições | Aceitava item com quantidade 0 ou negativa | **Bloqueado** nas duas rotas de criação |
| 3 | Requisições | Entrega baixava estoque por caminho próprio, sem auditoria | Entrega e estorno passam pelo **motor de estoque**: auditoria, respeita localização bloqueada e valida pelo **disponível** |
| 3 | Requisições | Requisição nascia direto como "Pendente" | **Rascunho**: "Salvar Rascunho" no formulário + "Enviar Requisição" depois |
| 3 | Requisições | Status paravam em "Entregue" | Novos status: **Aguard. Estoque**, **Aguard. Compra**, **Pronta p/ Retirada**, **Encerrada** |
| 3 | Requisições | Sem campo de tipo | **Tipo** com 14 opções — "Emergencial" exige justificativa obrigatória |
| 3 | Requisições | Sem centro de custo / local de entrega | Campos **Centro de Custo** (select) e **Local de Entrega** (texto) |
| 3 | Requisições | Ciclo parava na entrega | **Solicitante confirma o recebimento** (só ele — nem admin confirma no lugar) |
| 3 | Requisições | Aprovação sem trava | **Quem pediu não aprova a própria** (403); rejeição exige motivo; toda decisão auditada |
| 3 | Requisições | Não dava pra reaproveitar requisição antiga | **"Copiar como Novo Rascunho"** com os mesmos itens/tipo/vínculos |
| 4 | Requisições / Reservas | Reservar tornava o material inutilizável até para quem reservou | A entrega **consome a reserva da própria requisição** — acabou a corrida entre aprovar e entregar |
| 4 | Requisições | Aprovar não separava nada — o material podia ser consumido por outro antes da entrega | Aprovar **reserva automaticamente** os itens com saldo; a requisição vira **Totalmente/Parcialmente Reservada** |
| 4 | Reservas (tela nova) | Reserva não tinha tela | Tela **Almoxarifado → Reservas**: reservar à mão, liberar com motivo, transferir de projeto/OS, expiração opt-in |
| 4 | Requisições | *(correção de 2026-08-11)* A tela de requisições não conhecia os dois status de reserva: badge com o código cru, e a requisição aprovada ficava **sem** os botões "Iniciar Separação" e "Cancelar" | Badge, filtro e stepper mostram **Totalmente/Parcialmente Reservada**, e os botões aparecem — o caminho feliz pós-aprovação voltou a ser clicável |
| 5 | Recebimento | Aprovar recebimento de material crítico **sem inspeção prévia dava erro** — o material não entrava no sistema mesmo já estando no galpão | Entra sempre. Se exige inspeção, entra **retido** (fora do disponível) até alguém decidir |
| 5 | Inspeções (tela nova) | Não existia fila de inspeção nem forma de aprovar/reprovar pela tela | Tela **Inspeções**: lista o que está retido, aprova (total ou parcial) ou reprova com motivo e destino (devolver / engenharia / substituição) |
| 5 | Inspeções / Materiais | Bloquear um material achado com defeito na prateleira não tinha botão nem exigia justificativa | Botões **Bloquear/Desbloquear Material** na tela de Inspeções, com justificativa obrigatória e rastro no livro de movimentações |
| 5 | Movimentações | Desbloquear mais do que estava bloqueado "funcionava" e devolvia menos do que o pedido ao disponível, sem avisar | Desbloquear acima do bloqueado é **recusado** com erro — nunca mais silencioso |
| 6 | Movimentações | Dava para tirar 10 de um lote que tinha 2, e o sistema não reclamava — o saldo daquele lote ficava negativo em silêncio | Recusa e mostra o saldo real **daquele lote** |
| 6 | Movimentações | Na saída, o lote era um campo de texto: você digitava o que quisesse, inclusive um lote que não existe | Na saída virou uma **lista** dos lotes que têm saldo, já ordenada pelo que vence primeiro. Na entrada continua texto livre, porque é ali que um lote novo nasce |
| 6 | Movimentações | Material vencido saía normalmente para consumo | Lote vencido **não sai para consumo**. Continua podendo ser baixado como Sucata/Perda ou corrigido por Ajuste — vencido tem que poder sair do estoque |
| 6 | Movimentações | Não existia "lote bloqueado" nem "lote reprovado" | Lote tem situação (Ativo / Bloqueado / Reprovado) e o sistema recusa a saída dos dois últimos, com o motivo na mensagem |
| 6 | Materiais | A opção "Controle por lote" na ficha do material era decorativa: marcava e nada acontecia | Material com "Controle por lote" **exige lote** onde você tem onde digitá-lo: as duas telas de Movimentação e o Recebimento. Ajuste de inventário continua isento (é como você regulariza o estoque antigo sem lote), e a entrega/devolução por requisição também — essas telas ainda não têm campo de lote, e exigi-lo ali travava a operação (corrigido em 2026-08-10) |
| 6 | Materiais | A opção "Requer certificado" também era decorativa | Material com "Requer certificado" faz o lote **nascer bloqueado** no recebimento até o certificado do fornecedor ser anexado. O material **entra** no estoque normalmente — o que trava é a saída |
| 6 | Recebimentos | Não havia onde digitar lote, validade ou corrida — justamente na tela onde o lote nasce | Três campos por item: **Lote**, **Validade** e **Corrida**. O lote é criado no processamento da nota, já com fornecedor e número da NF |
| 6 | Movimentações / Extrato | Cada lote não tinha saldo próprio consultável | O saldo é por material **+ localização + lote**, e a coluna "Lote" do Extrato mostra o código do lote |
| 9 | Lotes (tela nova) | Bloquear/reprovar/reativar um lote, liberar vencimento e anexar certificado só existiam por API | Tela **Almoxarifado → Lotes**: escolhe o material, lista os lotes dele, e oferece as três ações |
| 9 | Lotes | Lote bloqueado por falta de certificado ficava travado pela interface para sempre (só desenvolvedor destravava por API) | Botão **"Anexar certificado"** — se o bloqueio era por falta dele, libera sozinho ao anexar |
| 9 | Movimentações | Sucata e Perda não estavam no seletor de tipo, mesmo o motor já aceitando as duas para descartar lote vencido | **Sucata** e **Perda** selecionáveis, com os mesmos campos que uma Saída pede |
| 6b | Materiais | A opção "Controle por número de série" era decorativa | Checkbox ganha texto explicando o efeito; material com a flag exige série na entrada e na saída |
| 6b | Movimentações (Entrada) | Não existia onde digitar série | Caixa de texto "um por linha" + contador `N/quantidade` + botão "Gerar sequência" (prefixo + início) |
| 6b | Movimentações (Saída/Sucata/Perda) | idem | Lista de séries em estoque com checkbox; filtra pelo lote quando um lote está selecionado |
| 6b | Recebimentos | Não havia onde digitar série na nota | Caixa "Séries (uma por linha)" por item, com contador contra a quantidade recebida |
| 6b | Lotes (tela) | Só existiam lotes | Vira **"Lotes e Séries"**: aba nova lista as séries do material com Bloquear/Desbloquear justificado |
| 6b | Extrato | Sem indicador de série | Cartão "Séries em estoque" para material com a flag |
| 6c | Recebimentos | Nota processada não tinha como gerar etiqueta dos itens | Botão **"Imprimir etiquetas dos itens"** na nota `PROCESSADO`/`APROVADO` — gera 1 etiqueta por série (material com controle de série) ou por lote (material com controle de lote), usando o texto digitado na nota |
| 6c | Lotes e Séries | Não existia como imprimir etiqueta de um lote/série específico | Botão de etiqueta por linha (lote e série, inclusive série já `ESTORNADA`/`SUCATEADA` — reimpressão); aba Séries ganha o bulk **"Etiquetas das séries em estoque"** |
| 6c | Lotes e Séries | Abrir a tela filtrada num lote/série exigia navegar manualmente | A tela aceita a URL `?material_id=&aba=&lote=/&serie=` (o que o QR da etiqueta codifica): abre já no material/aba certos, com a linha destacada |
| 6c | Materiais | Não existia etiqueta avulsa de material | Botão de etiqueta por linha: material sem controle de lote/série abre o modal direto; material controlado navega para "Lotes e Séries" (a etiqueta certa mora lá) |
| 6c | (novo) modal | — | **`EtiquetasPdfModal`**: escolhe o formato (folha A4 com 10 etiquetas, ou térmica 100×50mm 1 por página — o último escolhido fica lembrado), define cópias (etiqueta única) e gera o PDF com QR Code |

## Etapa 0 — Fundação (resumo)

Antes de qualquer coisa nova, foi criada uma base de testes automáticos para o módulo, todas as movimentações de estoque passaram a usar um único mecanismo interno (nada mais grava saldo "por fora"), e toda saída/ajuste de estoque passou a exigir um motivo. Não há nada novo para clicar aqui — é o alicerce das etapas seguintes.

---

## Etapa 1 — Motor de Estoque (o que mudou)

| Antes | Agora |
|---|---|
| O sistema calculava "disponível" só como o saldo físico | "Disponível" agora desconta reservado, bloqueado e em inspeção: `físico − bloqueado − inspeção − reservado` |
| Movimentação tinha um campo de texto livre "referência" para anotar OS/projeto | Movimentação tem campos próprios de vínculo: Ordem de Serviço, Projeto e Centro de Custo (selects, não texto) |
| Não existia saída de emergência formal | Existe checkbox "Saída emergencial" — libera a saída mesmo sem os requisitos normais, mas exige justificativa e marca a movimentação como "pendente de regularização" |
| Uma movimentação errada só podia ser excluída (apagando o histórico) | Movimentação errada é **estornada** (nunca excluída): cria um lançamento reverso, motivo obrigatório, e a linha original fica com badge "ESTORNADA" |
| Custo médio do material não era recalculado automaticamente | Toda entrada com custo unitário recalcula o custo médio do material |
| Não existia uma tela de histórico por item | Nova tela de **Extrato** por material: saldo físico/reservado/bloqueado/em inspeção/disponível, custo médio, saldo por localização, últimas 100 movimentações e reservas ativas |
| Formulário de movimentação era simples (material, tipo, quantidade) | Formulário rico: localização de origem/destino, lote, custo unitário, vínculo (OS/Projeto/Centro de custo) |

O que ainda falta nesta frente: a entrada/saída rápida que existe dentro da tela de Materiais ainda usa o caminho antigo (mais simples, sem localização/lote) — só a tela de Movimentações usa o formulário novo completo.

> **Correção de 2026-08-09:** este parágrafo dizia que ainda faltava "validar saída de lote vencido
> ou reprovado — depende do controle de lotes ainda não implementado (Etapa futura)". **Isso foi
> entregue na Etapa 6** (ver a seção da Etapa 6 abaixo). Deixamos o registro em vez de apagar,
> porque a instrução do projeto é que uma afirmação que virou mentira seja corrigida às claras.

### Roteiro de teste manual (Etapa 1)

Vá em **Almoxarifado → Movimentações**.

1. **Nova movimentação normal.** Clique em "Nova Movimentação". Escolha um material, tipo "Entrada", quantidade, e opcionalmente localização de destino, lote e custo unitário. Confirme. A linha aparece no livro com saldo anterior/posterior corretos.
2. **Saída com vínculo.** Clique em "Nova Movimentação" de novo, tipo "Saída". Preencha o motivo (obrigatório) e escolha uma Ordem de Serviço, Projeto ou Centro de Custo na seção "Vínculo". Confirme. Na coluna "Vínculo" do livro deve aparecer o nome/código escolhido.
3. **Caso de erro esperado — saldo insuficiente.** Tente uma saída com quantidade maior que o "Disponível" mostrado abaixo do campo Quantidade. O sistema deve recusar (mensagem de erro) e nada deve mudar no saldo.
4. **Caso de erro esperado — saída sem motivo.** Tente confirmar uma saída com o campo Motivo vazio. O formulário deve bloquear (campo obrigatório).
5. **Saída emergencial.** Tipo "Saída", marque o checkbox "Saída emergencial (regularizar depois)". Preencha o motivo e confirme mesmo com pouco embasamento. A linha deve aparecer no livro com o badge amarelo "PENDENTE REGULARIZAÇÃO".
6. **Estornar uma movimentação.** Na tabela do livro, clique no ícone de "Estornar" (seta curva) em qualquer linha que não seja um Estorno. Preencha o motivo (obrigatório) e confirme. A linha original fica esmaecida com o badge "ESTORNADA", e uma nova linha do tipo "Estorno" aparece no livro. Confira que o saldo do material voltou ao valor anterior (veja o Extrato, passo 8).
7. **Caso de erro esperado — estornar sem motivo.** Abra o estorno de novo e tente confirmar com o campo de motivo vazio — o botão "Confirmar Estorno" deve ficar desabilitado.
8. **Extrato do item.** Clique no nome de qualquer material na coluna "Material" do livro (ou vá em **Materiais**, clique no ícone "Extrato" de qualquer linha). Confira os cartões de saldo (Físico, Reservado, Bloqueado, Em inspeção, Disponível, Custo médio), a tabela de saldos por localização e as últimas movimentações.
9. **Filtros do livro.** Use o filtro "Todos os tipos" para filtrar por tipo (inclui "Estorno" na lista) e o filtro de datas.

---

## Etapa 2 — Cadastros Completos (o que mudou)

| Antes | Agora |
|---|---|
| Só existia um almoxarifado implícito | Multi-almoxarifado: você pode cadastrar vários almoxarifados, que representam **áreas físicas de alocação dentro do mesmo site** (ex.: galpão, mezanino, área externa) — **não** filiais. Todas as localizações que já existiam foram automaticamente vinculadas a um almoxarifado chamado "ALM-GERAL" — nada se perdeu. O saldo do material continua sendo **um só**, somado em todas as áreas: o almoxarifado serve para você achar onde o item está fisicamente, não para separar estoques |
| Localizações não tinham restrição | Uma localização agora pode ser **bloqueada** (impede entrada/saída ali) ou restrita a certos **tipos de material** — e o motor de estoque recusa a movimentação se você tentar contrariar isso |
| Famílias de material eram uma lista simples | Famílias podem ter **subfamílias** (um nível abaixo) |
| Formulário de material tinha poucos campos | Formulário reorganizado em 6 seções com todos os campos técnicos: Identificação, Classificação, Dados Técnicos, Estoque e Reposição, Controles, Unidades e Custos (inclui classe ABC, unidade de compra/consumo com fator de conversão) |
| Editar um material não deixava rastro | Toda criação/edição de material grava auditoria (o que mudou, de que valor para que valor) |
| Não havia como consultar posições vazias ou materiais sem endereço | Duas consultas novas no backend (`/localizacoes/vazias` e relatório de materiais sem endereço) — **ainda sem tela própria**, ver Pendências abaixo |

### Roteiro de teste manual (Etapa 2)

**A) Formulário de material em seções**

1. Vá em **Almoxarifado → Materiais → Novo Material**. Confira as 6 seções: Identificação, Classificação, Dados Técnicos, Estoque e Reposição, Controles, Unidades e Custos.
2. Preencha só os campos obrigatórios (Código, Nome, Família) e deixe tudo o mais em branco. Salve — deve salvar normalmente (os campos novos são opcionais).
3. Em "Classificação", escolha uma Família e veja o select "Subfamília" habilitar. Se a família não tiver subfamílias cadastradas, aparece o aviso "Esta família não tem subfamílias cadastradas" (veja nota abaixo).
4. Em "Unidades e Custos", escolha uma "Unidade de Compra" (ex.: CX) sem preencher o "Fator de Conversão (Compra)" e tente salvar. **Caso de erro esperado**: o sistema pede o fator antes de enviar.

   > Nota honesta: **criar uma subfamília ainda não tem tela própria** — hoje só é possível via chamada direta à API. O que existe na interface é o *select* de subfamília dentro do formulário de material (que já funciona, mas só mostra subfamílias que alguém cadastrou por fora).

**B) Gestão de Almoxarifados**

5. Vá em **Almoxarifado → Configurações → aba "Setores e Áreas"**. No topo da página está o bloco "Almoxarifados".
6. Clique em "Novo Almoxarifado", preencha Código e Nome, salve. Ele aparece na tabela como "Ativo".
7. Clique no ícone de lixeira ("Inativar") em um almoxarifado que já tem localizações vinculadas (por exemplo, o "ALM-GERAL"). **Caso de erro esperado**: o sistema recusa com uma mensagem porque existem localizações ativas vinculadas a ele.

**C) Restrições de localização**

8. Ainda em Configurações, vá na aba "Localizações". Clique no ícone de lápis ("Editar") de qualquer localização.
9. No formulário "Editar Localização", marque o checkbox "🔒 Localização bloqueada" e salve.
10. Vá em **Movimentações**, tente fazer uma Entrada escolhendo essa localização como destino (ou uma Saída escolhendo-a como origem). **Caso de erro esperado**: a movimentação é recusada porque a localização está bloqueada. Depois desmarque o checkbox para não deixar a localização travada.
11. Volte em "Editar Localização" de outra posição e marque um ou mais "Tipos de material permitidos" (ex.: só "Ferramenta"). Tente uma movimentação de um material de tipo diferente para essa localização. **Caso de erro esperado**: recusado por incompatibilidade de tipo.

**D) Mapa de localizações**

12. Vá em **Almoxarifado → Mapa**. Use o filtro por Almoxarifado no topo para restringir a visão a um depósito específico.
13. Localize a posição que você bloqueou no passo 9 (se ainda estiver bloqueada) — ela aparece com contorno tracejado vermelho e o ícone 🔒 no canto.

---

## Etapa 3 — Requisições Ponta a Ponta (ENTREGUE — 2026-08-05)

O fluxo de requisição de materiais (o funcionário pede material, o almoxarifado separa e entrega) já era a parte mais madura do módulo — a Etapa 3 fechou as lacunas que faltavam para o ciclo completo, do pedido até a confirmação de recebimento.

| Antes | Agora |
|---|---|
| Era possível criar uma requisição com quantidade zero ou negativa em um item | Bloqueado nas duas rotas de criação (mensagem de erro, item nenhum é salvo) |
| A entrega de uma requisição baixava estoque por um caminho próprio, sem passar pelas mesmas validações do motor (bloqueio de localização, saldo negativo, etc.) e sem gravar auditoria | Entrega e estorno passam pelo mesmo motor da Etapa 1 (`stockService.registrarMovimentacao`): auditoria completa, saldo por localização, localização bloqueada é respeitada, e a entrega passa a considerar o **disponível** (descontando reserva/bloqueio de terceiros), não só o saldo físico |
| Uma requisição nascia direto como "Pendente" (enviada) | Pode nascer como **Rascunho** (botão "Salvar Rascunho" no formulário) e ser enviada depois (botão "Enviar Requisição") |
| Só existiam os status até "Entregue" | Novos status: **Aguardando Estoque** / **Aguardando Compra** (a requisição cai automaticamente aqui na aprovação se nenhum item tiver saldo disponível — em "Aguardando Compra" quando já existe uma solicitação de compra pendente para o material), **Pronta p/ Retirada** (o almoxarife libera depois de separar) e **Encerrada** (fecha de vez, bloqueia qualquer entrega futura) |
| Não existia um campo formal de "tipo" da requisição | Campo **Tipo** com 14 opções (Consumo, Ordem de Produção, Ordem de Serviço, Projeto, Montagem, Instalação Externa, Assistência Técnica, Manutenção, Desenvolvimento, Administrativo, Emergencial, Ferramenta, EPI, Material do Cliente) — requisições do tipo **Emergencial** exigem uma justificativa obrigatória no formulário |
| Não existiam campos de Centro de Custo / Local de Entrega | Formulário ganhou os campos **Centro de Custo** (select) e **Local de Entrega** (texto) |
| Quem entregava marcava como "entregue" e o ciclo parava aí | O **solicitante** confirma o recebimento (botão "Confirmar Recebimento", só aparece pra quem pediu — nem admin confirma no lugar de outra pessoa) |
| Só existia aprovação simples (um perfil aprova/rejeita) e aprovação por valor, sem trava nenhuma | **Quem pediu a requisição não pode aprovar a própria** (nas duas aprovações — simples e por valor) — o botão de aprovar aparece pra qualquer outro usuário com permissão, mas o backend recusa (403) se for o próprio solicitante. Rejeitar a própria continua permitido (é desistência, não aprovação). **Rejeição sempre exige motivo** (o botão de confirmar no modal fica desabilitado até preencher). Toda decisão (aprovar, rejeitar, confirmar recebimento, encerrar) fica registrada com usuário, data e justificativa |
| Não dava pra reaproveitar uma requisição antiga | Botão **"Copiar como Novo Rascunho"** — gera um novo rascunho com os mesmos itens/tipo/vínculos (sem as quantidades já entregues) |

O que a Etapa 3 **não** cobre (fica para etapas futuras — ver "Pendências conhecidas" no fim deste documento): anexos na requisição, assinatura digital na retirada, importar itens de uma lista técnica/ordem de produção, reserva automática de estoque com status próprio (Aguardando/Parcialmente/Totalmente Reservada — Etapa 4), registrar lote/série na entrega, e uma tela de configuração de regras de aprovação (hoje as regras — segregação e limite por valor — são fixas no código, não configuráveis pela interface).

### Roteiro de teste manual (Etapa 3) — ciclo completo

> **Importante: esta etapa precisa de DOIS usuários.** A regra de segregação bloqueia quem pediu a requisição de aprovar a própria — você vai precisar logar com um segundo usuário (perfil com permissão de aprovar requisições: Admin, Almoxarife ou Gestor) numa aba anônima ou outro navegador para aprovar a requisição do primeiro.

Vá em **Almoxarifado → Requisições**.

1. **Criar como rascunho.** Clique em "Nova Requisição", escolha um Tipo (ex.: "Consumo"), adicione pelo menos um item com quantidade, preencha Centro de Custo/Local de Entrega se quiser, e clique em **"Salvar Rascunho"** (em vez de "Enviar Requisição"). A requisição aparece na lista com o badge **Rascunho** e não dispara e-mail nenhum ainda.
2. **Enviar o rascunho.** Abra o detalhe da requisição criada no passo 1 e clique em **"Enviar Requisição"**. O status passa para **Pendente** — só agora o e-mail ao almoxarifado e a avaliação de aprovação por valor (se configurada) entram em ação.
3. **Aprovar com OUTRO usuário.** Faça login com um segundo usuário (perfil Admin/Almoxarife/Gestor, diferente de quem criou a requisição) numa aba anônima. Abra a mesma requisição e clique em **"Aprovar e Separar"** (ou "Só Aprovar"). Deve funcionar normalmente e o status avança (para **Em Separação**, ou para **Aguard. Estoque**/**Aguard. Compra** se nenhum item tiver saldo disponível).
4. **Separar e liberar para retirada.** Ainda como o segundo usuário (ou almoxarife), registre a separação dos itens e clique em **"Liberar para Retirada"**. Status vira **Pronta p/ Retirada**.
5. **Entregar.** Use a ação de entrega normal (como já funcionava antes), informando a quantidade atendida de cada item. Status vira **Entregue** (ou **Parcialmente Atendida** se sobrou saldo pendente).
6. **Confirmar recebimento — volte para o PRIMEIRO usuário (o solicitante).** Faça login de novo com quem criou a requisição, abra o detalhe e clique em **"Confirmar Recebimento"**. (O caso de erro "Confirmar recebimento por quem não é o solicitante", logo abaixo, prova que só o solicitante consegue.)
7. **Encerrar.** Com um usuário com permissão de aprovar requisições (Admin/Almoxarife/Gestor), clique em **"Encerrar Requisição"** no modal de confirmação. Status vira **Encerrada** e a requisição não aceita mais entregas.
8. **Copiar.** Em qualquer requisição que não seja rascunho, clique em **"Copiar como Novo Rascunho"**. Confira que abre/gera um novo rascunho com os mesmos itens e tipo, mas sem nenhuma quantidade entregue.

### Casos de erro esperados

- **Aprovar a própria requisição.** Logado como quem criou a requisição, tente aprovar. Deve ser recusado (403) e o status não muda — só um usuário diferente do solicitante pode aprovar.
- **Rejeitar sem motivo.** Abra o modal de "Rejeitar", deixe o campo de motivo vazio. O botão de confirmar fica desabilitado — não dá nem para tentar enviar sem preencher.
- **Item com quantidade zero (ou negativa).** No formulário de criação, tente salvar um item com quantidade 0. A criação é bloqueada com mensagem de erro, tanto ao salvar rascunho quanto ao enviar direto.
- **Entrega acima do disponível quando há reserva de terceiro.** Se o material tiver parte do saldo reservado para outra requisição/projeto, tentar entregar mais do que o disponível (saldo físico menos o reservado de terceiros) é recusado (400) e nada muda no estoque — mesmo que o saldo físico total pareça suficiente.
- **Confirmar recebimento por quem não é o solicitante.** Logado como outro usuário (inclusive admin), tentar confirmar o recebimento de uma requisição que não é sua é recusado (403) — não existe bypass de admin aqui.
- **Requisição Emergencial sem justificativa.** Escolha o tipo "Emergencial" no formulário e tente enviar sem preencher a justificativa — bloqueado.

---

## Etapa 4 — Reservas de Estoque (ENTREGUE — backend 2026-08-05, tela 2026-08-06)

Reservar material é "separar no sistema" antes de entregar: o saldo continua fisicamente lá, mas deixa de estar disponível para outra pessoa pegar.

**O problema que esta etapa consertou é importante entender.** Antes dela, reservar era uma armadilha: reservar 10 unidades para um projeto tornava essas 10 indisponíveis para **todo mundo, inclusive o projeto que reservou**. Não existia jeito de consumir o que você mesmo reservou — a única saída era cancelar a reserva, devolvendo o material ao bolo geral, e correr para dar baixa antes que outro consumisse. Era por isso que essa função nunca tinha ganhado tela.

| Antes | Agora |
|---|---|
| Reservar tornava o material inutilizável até para quem reservou | A saída pode citar a reserva e consumir o que foi separado para ela; a reserva vai baixando conforme o consumo e fecha quando zera |
| Aprovar requisição não separava nada — o material podia ser consumido por outro antes da entrega | Aprovar **reserva automaticamente** os itens que têm saldo; a requisição passa a **Totalmente Reservada** ou **Parcialmente Reservada** |
| Entregar disputava o estoque com todo mundo | A entrega consome a reserva da própria requisição — acabou a corrida entre aprovar e entregar |
| Reserva de um projeto não podia ser passada para outro | **Transferência** de reserva entre projetos/OS (exige perfil que possa reservar para outra OS) |
| Reserva esquecida segurava saldo para sempre | **Expiração**: reserva com prazo vencido é liberada e devolve o saldo. É **opt-in** — só expira se você preencher a configuração `reserva_dias_validade` ou informar a data na reserva, senão as reservas que já existem não somem sozinhas |
| Cancelar requisição deixava o material reservado preso | Cancelar **solta as reservas** daquela requisição e devolve ao disponível |

### Roteiro de teste manual (Etapa 4)

A tela fica em **Almoxarifado → Reservas**. Os passos 1 a 6 testam a automação (a reserva que nasce da aprovação); os passos 7 a 10 testam a tela.

1. **Veja o disponível cair sem o físico mudar.** Escolha um material com saldo e olhe o **Extrato** (Materiais → ícone Extrato): anote "Físico" e "Disponível".
2. **Aprove uma requisição.** Crie uma requisição desse material com um usuário, aprove com **outro** (a segregação continua valendo). O status deve virar **Totalmente Reservada** (ou **Parcialmente Reservada**, se o saldo não cobrir tudo).
3. **Volte ao Extrato.** O "Físico" deve estar igual e o "Disponível" deve ter caído pela quantidade da requisição. Na lista de reservas do extrato deve aparecer a reserva nova.
4. **Caso de erro esperado — outro consumir o reservado.** Em Movimentações, tente uma **Saída** desse material acima do disponível (mas abaixo do físico). Deve ser recusado: o saldo está reservado para a requisição.
5. **Entregue a requisição.** Separe e entregue normalmente. A entrega deve funcionar — ela consome a reserva, não disputa o disponível. Depois confira no Extrato que o físico caiu e o reservado voltou a zero (a reserva foi consumida).
6. **Cancele uma requisição reservada.** Crie e aprove outra requisição do mesmo material (para gerar a reserva) e então **cancele**. O "Disponível" no Extrato deve voltar ao valor de antes — o material não fica preso.
7. **Abra Almoxarifado → Reservas.** O filtro já vem em "Ativa". A reserva criada pela aprovação aparece com a etiqueta **REQ #número** (as feitas à mão aparecem como MANUAL). Confira as três colunas de quantidade: **Reservado** é o total, **Consumido** é o que a entrega já baixou e **Saldo** é o que ainda está preso — numa reserva entregue pela metade os três são diferentes, e é o Saldo que importa.
8. **Reserve à mão.** Botão **Nova Reserva**: escolha material e quantidade. O select mostra o **disponível** (não o físico), então uma quantidade acima do que aparece ali deve ser recusada pelo servidor. Volte ao Extrato do material e veja o disponível cair.
9. **Libere parcialmente.** No cadeado da linha, informe uma quantidade **menor** que o saldo e um motivo. Só aquela parte volta ao disponível e a reserva continua ativa com o saldo reduzido. Ao liberar uma reserva **REQ #**, a tela avisa antes: soltar devolve o material ao bolo geral e a entrega daquela requisição volta a disputar estoque.
10. **Transfira e confira que nada se moveu.** No ícone de setas, troque o destino (de projeto para OS, por exemplo). Físico, reservado e disponível do material devem ficar **exatamente iguais** — transferência troca o dono, não move saldo. O destino antigo não pode continuar aparecendo junto do novo.

> **Expiração:** o botão **Processar expiração** (só para administrador) roda o job que libera as reservas vencidas. Reserva sem prazo nunca expira — é opt-in, e sem a configuração `reserva_dias_validade` nada vence sozinho.

### O que a Etapa 4 não cobre

Reserva por lote/série. Prioridade na reserva. E-mail de aviso de reserva vencida.

> **Nota de 2026-08-09:** aqui estava escrito "reserva por lote/série (depende do controle de
> lotes)". O controle de **lotes** passou a existir na Etapa 6 — a dependência caiu, mas a reserva
> por lote **continua não implementada**: reservar continua sendo do material. Série segue sem
> existir (Etapa 6b).

> **Fechado em 2026-08-06:** a liberação por valor (`/aprovar-valor`) passou a reservar como a aprovação normal, e **excluir** uma requisição passou a soltar as reservas dela (antes só cancelar soltava). Se você usa liberação por valor, o material aprovado por essa via agora fica reservado — a requisição aparece como **Totalmente/Parcialmente Reservada** em vez de só **Aprovada**.

> **Corrigido em 2026-08-11 (`92fe236`):** desde a entrega desta etapa, a tela de **Requisições**
> não conhecia os dois status de reserva — o passo 2 do roteiro acima mostrava o código cru
> (`TOTALMENTE_RESERVADA`) no lugar do badge, o stepper voltava para "Criar" e, pior, a requisição
> aprovada ficava **sem os botões "Iniciar Separação" e "Cancelar Requisição"** (o backend sempre
> aceitou; era só a tela que não dava o caminho). Se você rodou o roteiro antes dessa data e viu
> isso, era este bug.

---

## Etapa 5 — Quarentena e Bloqueio de Qualidade (ENTREGUE — 2026-08-08)

Esta etapa mexe em como o almoxarifado lida com material que **precisa de inspeção antes de
poder ser usado** (peça crítica, que exige conferência de qualidade) e com material que alguém
**bloqueia na prateleira** por ter achado um problema (avaria, defeito).

**A mudança mais visível: aprovar o recebimento de um material crítico deixou de dar erro.**
Antes, se o material estivesse marcado como "crítico" (Materiais → editar → seção
Classificação → checkbox "Material crítico") e ainda não tivesse sido inspecionado, o sistema
**recusava** processar a nota fiscal — mesmo o caminhão já tendo descarregado o material no
galpão. Ou seja: o sistema fingia que o material não existia. Agora o recebimento é sempre
processado — o físico sobe normalmente — mas, se o material exige inspeção, ele entra **retido**:
fora do que pode ser usado (reservado, requisitado, consumido), até alguém decidir na tela nova
se aprova, aprova em parte, ou reprova.

| Antes | Agora |
|---|---|
| Aprovar/processar recebimento de material crítico sem inspeção prévia dava erro — a mercadoria não entrava no sistema mesmo já estando fisicamente no galpão | O recebimento é sempre processado. Se o material exige inspeção, ele entra no estoque físico mas fica **retido** (não aparece no "Disponível") até ser decidido |
| Não existia uma tela para ver o que está esperando inspeção nem para decidir | Nova tela **Almoxarifado → Inspeções**: lista tudo que está retido, com material, recebimento de origem e há quantos dias está esperando |
| Decidir a inspeção era "tudo ou nada" pelo formulário antigo de recebimento, e o cálculo de saldo tinha um bug: bloquear 10 unidades tirava 20 do disponível | Decisão nova aprova o lote inteiro ou só uma parte (ex.: recebeu 100, 10 vieram amassadas: aprova 90, reprova 10) — a conta é validada (aprovado + reprovado tem que fechar com o que estava retido) e o saldo sai certo |
| Reprovar um material não registrava para onde ele deveria ir | Reprovar pede uma observação (obrigatória) e um encaminhamento: Devolver ao fornecedor / Análise da Engenharia / Substituição |
| Bloquear um material achado com defeito na prateleira (fora do fluxo de recebimento) não tinha botão nem exigia motivo | Botões **Bloquear Material** / **Desbloquear Material** na tela de Inspeções, com justificativa sempre obrigatória, e fica registrado no livro de movimentações |
| Desbloquear uma quantidade maior do que estava bloqueada "funcionava" e devolvia menos material ao disponível do que o pedido, sem avisar ninguém | Desbloquear acima do que está bloqueado é **recusado** com mensagem de erro — nunca mais silencioso |

### Roteiro de teste manual (Etapa 5)

**A) Preparar um material crítico**

1. Vá em **Almoxarifado → Materiais**, edite um material (ou crie um novo). Na seção
   **Classificação**, marque o checkbox **"Material crítico"** e salve. Anote o código dele.

**B) Levar um recebimento até a entrada em estoque**

2. Vá em **Almoxarifado → Recebimentos**, clique em **"Novo Recebimento"**. Deixe "Somente pela
   Nota Fiscal", preencha um número de nota e fornecedor, e em "Materiais recebidos" busque e
   adicione o material crítico do passo 1 com uma quantidade. Salve.
3. Abra o recebimento criado e avance o fluxo clicando nos botões que aparecem, na ordem: **Iniciar
   Conferência (Almoxarifado)** → **Finalizar Conferência** → **Encaminhar para Compras** →
   **Encaminhar para Faturamento**.
4. Clique em **"Preencher Dados da NF (Faturamento)"**, preencha número/data de emissão/data de
   entrada/valor total da nota, e salve.
5. Clique em **"Processar Nota — Estoque + Contas a Pagar"** e confirme. **Isto é o que antes dava
   erro** ("Item crítico requer inspeção") — agora conclui normalmente.

**C) Ver o material retido**

6. Vá em **Materiais**, abra o **Extrato** do material crítico. O cartão **"Físico"** já mostra a
   quantidade recebida, mas **"Em inspeção"** mostra a mesma quantidade e **"Disponível"** está
   zerado (ou não subiu) — o material está no galpão, mas ninguém consegue reservar ou requisitar
   ele ainda.

**D) Decidir a inspeção**

7. Vá em **Almoxarifado → Inspeções**. O item aparece na fila, com o material, a quantidade
   retida, o recebimento de origem e há quantos dias está esperando.
8. Clique no ícone de decisão (✓). O formulário já vem com "Quantidade aprovada" = tudo o que está
   retido e "Quantidade reprovada" = 0 (aprovar o lote inteiro é o caso mais comum). Para testar a
   aprovação parcial, mude para aprovar uma parte e reprovar outra (ex.: recebeu 20 → aprova 15,
   reprova 5). **Caso de erro esperado:** se a soma de aprovado + reprovado não bater exatamente
   com o retido, o formulário recusa antes de chamar o servidor.
9. Ao reprovar qualquer quantidade, o campo **Encaminhamento** aparece (Devolver ao fornecedor /
   Análise da Engenharia / Substituição) e o campo **Observações** passa a ser obrigatório — é o
   único registro de por que aquele material foi barrado.
10. Salve. Volte ao Extrato do material (passo 6): a parte aprovada some de "Em inspeção" e entra
    em "Disponível"; a parte reprovada some de "Em inspeção" e aparece em "Bloqueado".

**E) Bloqueio avulso (fora do fluxo de recebimento)**

11. Ainda em **Almoxarifado → Inspeções**, clique em **"Bloquear Material"** no topo da página.
    Escolha qualquer material com saldo, informe uma quantidade e uma justificativa (obrigatória —
    tente salvar sem preencher para ver a recusa), e confirme. Confira no Extrato que o
    "Disponível" caiu e "Bloqueado" subiu.
12. Clique em **"Desbloquear Material"**, escolha o mesmo material e a mesma quantidade, informe
    justificativa e confirme. O disponível volta.
13. **Caso de erro esperado.** Bloqueie uma quantidade pequena (ex.: 5) e tente desbloquear mais do
    que isso (ex.: 30). O sistema recusa com uma mensagem — nada muda no saldo. Antes desta etapa,
    isso "funcionava" e devolvia menos material do que o pedido ao disponível, sem avisar.

> **Quem pode fazer o quê:** decidir uma inspeção (aprovar/reprovar) exige o mesmo perfil de
> Almoxarife de sempre. **Bloquear/desbloquear material avulso pela tela nova exige um perfil
> diferente** (Administrador ou Gestor) — um Almoxarife comum consegue decidir inspeções, mas não
> vai ver os botões de bloqueio avulso habilitados.

### O que a Etapa 5 não cobre

- **Plano de inspeção com medidas e instrumento** (o que medir, critérios técnicos, qual
  paquímetro/instrumento foi usado) — depende de calibração de ferramentas, que é uma etapa futura.
- **Não conformidade formal numerada** (um registro tipo "NC #123" com fluxo próprio) — o que
  existe é o encaminhamento (Devolver/Engenharia/Substituição) anotado na decisão, mais simples.
- **Liberação sob desvio autorizado** ("aceitar mesmo fora do padrão, com autorização de alguém
  responsável e histórico") — não implementado.
- **A devolução ao fornecedor não acontece sozinha.** Reprovar deixa o material **bloqueado** —
  alguém ainda precisa desbloquear manualmente e lançar a saída à parte. O encaminhamento
  registrado ("Devolver ao fornecedor", por exemplo) é uma anotação de intenção, não uma ação
  automática. Isso fica para uma etapa futura (Devoluções).
- **Perfil "Qualidade" separado do Almoxarife** — a spec original previa um perfil próprio para
  quem faz inspeção; hoje continua sendo Almoxarife/Administrador.
- Tipos de entrada além de nota fiscal de compra (material de cliente, consignado, devolução de
  produção etc.) e conferência física estruturada (contagem, pesagem, fotos) continuam fora —
  eram pendências antigas da tela de Recebimentos, não desta etapa.

---

## Etapa 6 — Lotes de Verdade (ENTREGUE — 2026-08-09)

Até esta etapa, "lote" era um campo de texto. Você digitava, o sistema guardava — e **nunca olhava
de novo**. Não existia cadastro de lote, não existia validade, não existia certificado, e o sistema
não sabia quanto tinha de cada lote. A Etapa 6 transformou lote numa coisa de verdade.

**O problema mais grave que ela consertou, em uma frase:** o sistema deixava você tirar 10 de um
lote que tinha 2. Não dava erro nenhum. O saldo daquele lote ficava **−8**, e como o total do
material continuava batendo, nenhuma tela denunciava. Só quem fosse olhar a linha do lote no banco
descobria.

| Antes | Agora |
|---|---|
| Dava para tirar 10 de um lote que tinha 2, e o sistema não reclamava — a linha daquele lote ficava negativa em silêncio | **Recusa** e mostra o saldo real daquele lote na mensagem |
| Lote era um campo de texto na saída: dava para digitar um lote que não existe, ou errar o código | Na **saída**, o lote virou uma **lista** dos lotes que têm saldo, com o código, o saldo e a data de validade de cada um. Na **entrada** continua texto livre, porque é ali que um lote novo nasce |
| Você tinha que lembrar qual lote usar primeiro | O sistema **já vem com o lote que vence primeiro selecionado** (FEFO). É uma **sugestão** — você pode trocar por qualquer outro lote elegível |
| Material vencido saía normalmente | Lote vencido **não sai para consumo**. Mas continua podendo ser baixado como **Sucata** ou **Perda**, ou corrigido por **Ajuste** — material vencido tem que poder sair do estoque, senão fica preso para sempre |
| Não existia "lote bloqueado" ou "lote reprovado" | Lote tem situação: **Ativo**, **Bloqueado** ou **Reprovado**. Os dois últimos não saem, e a mensagem diz qual é o problema. Lotes não elegíveis **aparecem na lista, desabilitados, com o motivo** — não somem (esconder faria você procurar material que o sistema decidiu não mostrar) |
| A opção "Controle por lote" na ficha do material não fazia nada | Material com essa opção marcada **exige lote onde existe campo para informá-lo**: as duas telas de Movimentação (a completa e o modal rápido da tela de Materiais) e o Recebimento. O **Ajuste** de inventário continua isento de propósito: é por ele que você regulariza o estoque antigo, que não tem lote nenhum. **Correção de 2026-08-10:** este guia dizia "em toda entrada e saída", e era literalmente o que o sistema fazia — inclusive em telas sem campo de lote, o que travava a entrega por requisição e a devolução. Ver "O que a Etapa 6 não cobre" |
| A opção "Requer certificado" também não fazia nada | Material com essa opção faz o lote **nascer bloqueado** no recebimento, com o motivo "Certificado do fornecedor nao anexado". **O material entra no estoque normalmente** — o que fica travado é a saída, até o certificado chegar |
| Na tela de Recebimentos não havia onde digitar lote, validade ou corrida — justo na tela onde o lote nasce | Três campos por item: **Lote**, **Validade** e **Corrida**. Ao processar a nota, o lote é criado sozinho já com fornecedor e número da NF |
| Cada lote não tinha saldo próprio | O saldo passou a ser por material **+ localização + lote**. A coluna "Lote" do Extrato mostra o código do lote |

### Uma regra que parece estranha e é de propósito: liberar um lote vencido **não** o "desvence"

Um lote vencido pode ser **liberado para uso**, com justificativa (fica registrado quem liberou,
quando e por quê). Depois disso, ele **continua marcado como vencido** em todas as telas — o que
muda é só que o sistema passa a deixar consumi-lo. Isso é intencional: apagar a marca de vencido
esconderia da auditoria que aquele material está fora da validade. Na lista de lotes ele aparece
como "(vencido, liberado)".

E se um lote estiver **bloqueado e vencido** ao mesmo tempo, liberar o vencimento não resolve — ele
continua barrado por bloqueio, com a mensagem de bloqueio. Situação vem antes de validade.

### Roteiro de teste manual (Etapa 6)

**A) Preparar um material com controle por lote**

1. Vá em **Almoxarifado → Materiais**, edite um material (ou crie um novo). Na seção **Controles**,
   marque **"Controle por lote"** e salve. Anote o código dele.

**B) Caso de erro esperado — movimentar material controlado sem lote**

2. Vá em **Almoxarifado → Movimentações → Nova Movimentação**. Escolha esse material, tipo
   **Entrada**, quantidade 10, e deixe o campo **Lote** vazio. Confirme. **Deve ser recusado** com
   uma mensagem dizendo que o material exige lote nesta movimentação — e o saldo **não** pode
   mudar (confira no Extrato).

2b. **O contra-teste, que faltava até 2026-08-10:** com o MESMO material controlado, crie uma
   requisição e entregue-a (Almoxarifado → Requisições). **Deve funcionar normalmente, sem pedir
   lote** — a tela de entrega não tem campo de lote, e exigi-lo ali tornava o material impossível
   de entregar. Faça o mesmo com uma **Devolução**: também passa sem lote. É decisão, não
   esquecimento; está explicado em "O que a Etapa 6 não cobre".

**C) Entrada com lote, e o lote nascendo**

3. Repita a entrada, agora digitando um lote no campo **Lote** (ex.: `L-001`), quantidade 100.
   Confirme. Faça uma segunda entrada do mesmo material com o lote `L-002`, quantidade 2.
4. Abra o **Extrato** do material (Materiais → ícone Extrato). Na tabela de saldos, a coluna
   **Lote** deve mostrar `L-001` e `L-002` em linhas separadas, com 100 e 2.

**D) O bug principal — tirar mais do que o lote tem**

5. Nova Movimentação, tipo **Saída**, mesmo material. Repare que o campo Lote agora é uma **lista**,
   não um campo de texto, e que ela mostra o saldo de cada lote.
6. Escolha o lote `L-002` (que tem 2) e peça quantidade **10**. Preencha o motivo e confirme.
   **Caso de erro esperado:** recusado, com o saldo real do lote na mensagem. **Antes da Etapa 6
   isso passava sem erro nenhum.** Volte ao Extrato e confira que `L-002` continua com 2 e o total
   do material não mudou.
7. Agora peça **1** do lote `L-002`. Deve passar, e só o `L-002` deve cair (para 1) — o `L-001`
   continua com 100.

**E) FEFO — o lote que vence primeiro vem sugerido**

8. Faça duas entradas novas (ou use o **Recebimento**, passo F) criando dois lotes com validades
   diferentes: um vencendo em 2030 e outro em 2031.
9. Abra Nova Movimentação → **Saída** → escolha o material. O campo Lote deve vir **já preenchido
   com o lote de validade mais próxima**, sem você escolher. Troque para outro lote da lista para
   confirmar que a sugestão não é imposição.

**F) O lote nascendo no recebimento (é onde ele deve nascer)**

10. Vá em **Almoxarifado → Recebimentos → Novo Recebimento**. Preencha nota e fornecedor e adicione
    o material com uma quantidade. Salve.
11. Avance o fluxo até **"Preencher Dados da NF (Faturamento)"** (Iniciar Conferência → Finalizar
    Conferência → Encaminhar para Compras → Encaminhar para Faturamento). Nos itens, agora aparecem
    quatro campos novos: **Lote**, **Validade**, **Fabricação** e **Corrida**. Preencha os quatro
    e salve. (A **Fabricação** entrou em 2026-08-10: a coluna existia no banco desde o começo da
    Etapa 6 e nada a preenchia nem a mostrava.)
12. Clique em **"Processar Nota — Estoque + Contas a Pagar"**. Volte ao **Extrato** do material: o
    saldo entrou **no lote que você digitou**, e a validade/fabricação/corrida ficaram guardadas
    nele — confira em **Almoxarifado → Lotes**, escolhendo o material (a data de fabricação aparece
    embaixo da validade, como "Fabricado em …").

12b. **Nota com dois itens — o teste que o review final trouxe (2026-08-10).** Monte um recebimento
    com **dois** materiais, sendo um deles com "Controle por lote" ligado, e deixe o **Lote** desse
    item em branco. Clique em "Processar Nota". **Deve ser recusado**, dizendo qual item está sem
    lote — e, no Extrato, **o outro item também não pode ter entrado**. Antes, o primeiro item
    entrava, a nota parava no meio, e clicar de novo em "Processar Nota" depois de corrigir entrava
    com o primeiro item **outra vez** (10 viravam 20). Agora preencha o lote que faltava e
    processe: os dois entram, cada um **uma** vez.

**G) Caso de erro esperado — lote vencido**

13. Crie (pelo recebimento, passo F) um lote com **validade no passado** (ex.: `2020-01-01`) e
    processe a nota para ele ganhar saldo.
14. Nova Movimentação → **Saída** → escolha esse material. Na lista de lotes, o lote vencido deve
    aparecer **desabilitado**, com "(vencido)" no rótulo. Se você conseguir selecioná-lo por outro
    caminho, a saída é recusada com a mensagem de vencimento.
15. **Mas o descarte passa:** mude o tipo para **Sucata** (ou **Perda**) e baixe o mesmo lote
    vencido. **Deve funcionar** — material vencido precisa poder sair do estoque. (Roteiro
    detalhado clique a clique, incluindo o que confirma isto na tela: seção "Task 9", passo D-13,
    mais abaixo.)

**H) Certificado do fornecedor**

16. Em **Materiais**, edite um material e marque **"Requer certificado"** na seção Controles.
17. Faça um recebimento desse material com um lote (passos 10 a 12). Depois de processar, tente uma
    **Saída** desse lote. **Caso de erro esperado:** recusado, porque o lote nasceu **bloqueado**
    por falta de certificado. Confira no Extrato que o material **entrou** no estoque físico
    normalmente — só a saída é que está travada.

> **Atualização da Task 9:** o passo acima batia numa parede — não havia botão para anexar o
> certificado. Agora existe: vá em **Almoxarifado → Lotes**, escolha o material, e no lote
> bloqueado clique em **Anexar certificado** (ícone de upload). O roteiro completo está na seção
> "Task 9", logo abaixo.

### O que a Etapa 6 **não** cobre

- **Números de série.** *(Corrigido em 2026-08-11: esta linha dizia que série continuava não
  existindo — a Etapa 6b entregou. Ver a seção "Etapa 6b", mais abaixo, para o que mudou e o
  roteiro de teste.)*
- **Etiquetas e QR Code.** *(Corrigido em 2026-08-11: esta linha dizia que imprimir etiqueta de
  lote/material com QR não existia — a Etapa 6c entregou. Ver a seção "Etapa 6c", mais abaixo.)*
- **Lote na entrega, na exclusão de requisição e na devolução.** Estas quatro operações movimentam
  estoque **sem lote**, mesmo em material com "Controle por lote" ligado: entregar uma requisição,
  excluir uma requisição (que estorna o que foi entregue), devolver material para o estoque e
  sucatear uma devolução. Nenhuma dessas telas tem campo de lote. **Até 2026-08-10 o sistema exigia
  lote nelas assim mesmo, e o resultado era que o material simplesmente não podia ser entregue nem
  devolvido** — e a reserva criada na aprovação da requisição ficava presa, segurando saldo que
  ninguém conseguia consumir. Hoje essas quatro passam sem lote, de propósito. O preço é que o
  saldo movimentado por elas fica na linha "sem lote" e não aparece no saldo de nenhum lote (o
  total do material continua certo). Fechar isso — sugerir o lote FEFO na entrega e herdar o lote
  da saída original na devolução — é o conteúdo natural da próxima etapa de lotes.
- **Reserva por lote.** Reservar material continua reservando do material, não de um lote
  específico.
- **Reprovar um lote pela tela de Inspeções.** A inspeção continua bloqueando o **material
  inteiro**; ela não marca o lote como reprovado. A situação "Reprovado" do lote existe e funciona,
  mas hoje só pode ser aplicada por fora da tela de Inspeções.
- **Genealogia de lote** (ligar o lote de matéria-prima que comprou ao lote de produção que saiu).
- **Reter só uma parte de um lote.** A retenção é do lote inteiro, pela situação dele. Reprovar 10
  de um lote de 100 não tem representação — foi decisão consciente: retenção por lote é *situação*,
  não *quantidade*.
- **Extrato do lote** ("tudo que aconteceu com o lote X"). Os dados existem (movimentações,
  auditoria, saldo), mas não há uma consulta que junte os três como o Extrato faz para o material.
- **"Controle de validade" e "Controle de corrida"** na ficha do material continuam decorativos: os
  campos de validade e corrida existem e funcionam no lote, mas o sistema não *obriga* preenchê-los
  quando essas opções estão marcadas.

---

## Task 9 — Tela de Lotes e Sucata/Perda (ENTREGUE — 2026-08-09)

A Etapa 6 entregou as regras de lote inteiras no servidor, mas três operações só existiam por API
— e uma delas travava material de verdade: com **"Requer certificado"** ligado, o lote nascia
**bloqueado** e só um desenvolvedor destravava, chamando a API na mão. A Task 9 (não estava no
plano original; nasceu do review da Etapa 6, aprovada pelo cliente em 2026-08-09) fechou isso.

| Antes | Agora |
|---|---|
| Bloquear, reprovar ou reativar um lote só por API | Tela **Almoxarifado → Lotes**: escolha o material, cada lote tem o botão "Mudar status" |
| Lote vencido só saía se alguém liberasse via API | Botão **"Liberar vencimento"** — só aparece em lote vencido, exige justificativa |
| Lote bloqueado por falta de certificado ficava travado pela interface para sempre | Botão **"Anexar certificado"** (PDF ou imagem) — se o bloqueio era por falta dele, o lote **libera sozinho** ao anexar |
| Sucata e Perda não apareciam no seletor de tipo da Movimentação, mesmo o motor já aceitando as duas para descartar lote vencido | **Sucata** e **Perda** selecionáveis, com os mesmos campos que uma Saída pede (localização de origem, lote por lista) |

> **Correção de 2026-08-09 (fix round 1):** a primeira versão desta task tinha um bug que
> anulava a razão de Sucata/Perda existirem no seletor — o lote vencido continuava aparecendo
> **desabilitado** mesmo com Sucata/Perda escolhido, porque a tela usava o mesmo cálculo de
> "elegível" da Saída (que corretamente barra vencido) para os dois tipos de descarte (que
> corretamente **não** barram). Corrigido: agora a tela decide por tipo — Sucata/Perda liberam
> lote vencido (só continuam recusando lote `Bloqueado`/`Reprovado`), Saída continua exigindo o
> vencimento resolvido. O passo 15 da Etapa 6 e o passo D-13 abaixo já refletem o comportamento
> corrigido.

### Roteiro de teste manual (Task 9)

**A) Destravar um lote bloqueado por falta de certificado (o caso mais importante)**

1. Repita os passos H (16-17) da Etapa 6 acima: material com **"Requer certificado"**, recebimento
   com lote, tentativa de Saída recusada porque o lote nasceu **Bloqueado**.
2. Vá em **Almoxarifado → Lotes**. Escolha o material no seletor. O lote aparece com o badge
   **Bloqueado** e o aviso "Bloqueado por falta de certificado".
3. Clique no ícone de upload ("Anexar certificado do fornecedor"). O modal avisa que o lote está
   bloqueado por falta de certificado. Escolha um arquivo PDF ou imagem e confirme.
4. O lote deve voltar para **Ativo** sozinho, e a linha dele passa a mostrar um link **"Ver
   certificado"** — clique para abrir o arquivo numa aba nova. (Até 2026-08-10 o arquivo era
   guardado e **não havia como abri-lo pela tela**: ela só dizia "Certificado anexado". Reanexar
   também deixava o arquivo antigo perdido no servidor; agora ele é apagado.) Volte à Movimentação
   de Saída: o lote aparece habilitado na lista.

**B) Mudar status manualmente (bloquear/reprovar/reativar)**

5. Na tela de Lotes, clique no ícone de "Mudar status" (engrenagem/sliders) de um lote **Ativo**.
6. Tente confirmar sem preencher a justificativa — o botão **Confirmar** deve estar desabilitado.
7. Escolha o novo status (ex.: **Bloqueado**) e escreva a justificativa. Confirme. O badge do lote
   muda na tabela.

**C) Liberar um lote vencido para uso**

8. Escolha um material com um lote **vencido** (validade no passado — ver passo G da Etapa 6).
9. Na linha desse lote, o botão **"Liberar vencimento"** aparece (só aparece em lote vencido — em
   lote não vencido, não há esse botão). Clique, preencha a justificativa e confirme.
10. O lote continua marcado como **vencido** na tela (badge vermelho vira azul: "VENCIDO
    (liberado)"), mostrando quem liberou e o motivo — liberar não apaga o fato de estar vencido, só
    credencia o consumo.

**D) Sucata e Perda na Movimentação**

11. Vá em **Almoxarifado → Movimentações → Nova Movimentação**. No seletor **Tipo**, confira que
    **Sucata** e **Perda** aparecem (ao lado de Entrada/Saída/Ajuste/Devolução).
12. Escolha **Sucata**, um material com saldo. Confira que aparecem os mesmos campos de uma Saída:
    **Localização de origem** e **Lote** (lista, não texto livre). Motivo é obrigatório.
13. Use o mesmo material com lote **vencido** do passo G da Etapa 6 (passos 13-14 acima). Com o
    tipo em **Saída**, o lote vencido continua **desabilitado** na lista, como sempre. Troque o
    tipo para **Sucata** (sem trocar material): o mesmo lote vencido agora aparece **habilitado**
    — e normalmente já vem pré-selecionado, porque é o único disponível. O rótulo continua
    dizendo "(vencido)": a tela não esconde o que está sendo descartado, só deixa de barrar por
    causa da validade. Preencha o motivo e confirme. **Deve funcionar** — material vencido
    precisa poder sair do estoque por descarte, mesmo continuando barrado para consumo normal.
14. Agora repita o passo 13 com **outro** lote — desta vez um lote **Bloqueado** (mude o status
    pela tela de Lotes, seção A/B acima). Escolha Sucata: o lote bloqueado continua **desabilitado**
    — descarte só é isento da guarda de **vencimento**, não da guarda de **status**. Um lote
    bloqueado ou reprovado ainda precisa passar pela mudança de status antes de sair por
    qualquer caminho.

### O que a Task 9 não cobre

- **Não é possível ver o histórico de mudanças de status de um lote pela tela** — a auditoria é
  gravada (`auditoria_log_almoxarifado`, `entidade='lote'`), mas não há uma tela de "extrato do
  lote" que a mostre. Continua na lista de pendências da Etapa 6.
- **Quem liberou o vencimento aparece como "usuário #&lt;id&gt;", não pelo nome** — a API de lotes
  não faz `JOIN` com a tabela de usuários (só o `stockService`/`movimentacoes` faz isso hoje).
  Decisão desta task: não alterar o servidor (fora do escopo — "não mude nada no servidor" era
  regra da task), então a tela mostra o que a API devolve.
- **AJUSTE_NEGATIVO continua fora do seletor** — de propósito: é tipo interno de ajuste, e o
  **Ajuste** puro já cobre a correção de contagem.

---

## O que observar de regressão (sempre)

- O fluxo de requisição de materiais que já existia (criar → aprovar → separar → entregar) continua funcionando normalmente — nada foi removido nessa tela; requisições antigas continuam com o comportamento de sempre (criadas sem tipo/centro de custo ganham o padrão "Consumo").
- Movimentações antigas (de antes da Etapa 1) continuam visíveis e com os dados corretos no livro.
- O Mapa de Localizações carrega normalmente e mostra as posições que já existiam, agora todas vinculadas ao almoxarifado "ALM-GERAL".
- **Achado do fix round 1 da Task 9 (2026-08-09): o Extrato do material perdeu duas colunas que
  mentiam.** A tabela "Saldos por localização" tinha colunas "Reservada"/"Bloqueada" que sempre
  mostravam 0 desde a Etapa 6 (a coluna de origem foi removida do banco em `015e94c`, e ninguém
  tinha percebido). As duas colunas saíram da tabela — retenção não existe por localização; os
  cartões "Reservado"/"Bloqueado" no topo do Extrato (que leem do material, não da localização)
  continuam mostrando o número certo, como sempre mostraram.

---

## Etapa 6b — Números de Série (ENTREGUE — 2026-08-11)

A Etapa 6 entregou lotes (texto com validade/corrida/certificado — agregado por localização e lote).
A Etapa 6b traz números de série: rastreamento individual de cada unidade física (motor SN tal,
instrumento nº tal), com telas próprias — não é mais só motor de servidor.

> **Aviso anterior superado.** Até esta atualização, este bloco dizia "ligar Controle por série
> trava o recebimento pela tela até a interface existir — Tasks 8-9 pendentes". A interface existe
> desde esta mesma data (Tasks 8-10). A única ressalva que sobra: o modal rápido de entrada/saída
> dentro da tela de **Materiais** continua sem campo de série e sempre recusa material com a flag
> ligada — use a tela **Movimentações** para materiais com controle de série.

### Tabela consolidada — Etapa 6b

| Onde | Antes | Agora |
|---|---|---|
| Materiais | A opção "Controle por número de série" na ficha do material era decorativa — marcava e nada acontecia | Ao marcar, um texto explica o efeito: "Exigirá um número de série por unidade na entrada e na saída" |
| Movimentações (Entrada) | Não existia onde digitar série nenhuma | Para material com a flag, aparece uma **caixa de texto** "Números de série (um por linha)" com contador `N/quantidade` ao vivo, e um botão **"Gerar sequência"** (prefixo + número inicial preenche a caixa sozinho) |
| Movimentações (Saída/Sucata/Perda) | idem | Aparece uma **lista de séries em estoque** para marcar quais saem; se você já escolheu um lote, a lista filtra só as séries daquele lote |
| Movimentações | Trocar o tipo ou o material podia deixar série "grudada" de uma escolha anterior | Trocar tipo ou material **limpa** a seleção de série, igual já acontecia com lote |
| Recebimentos | Não havia onde digitar série na nota | Caixa de texto "Séries (uma por linha)" por item, ao lado dos campos de lote, com contador contra a quantidade recebida |
| Lotes (tela) | Só existiam lotes | Vira **"Lotes e Séries"**: uma aba nova lista as séries do material (número, status com badge, lote, localização) com ação **Bloquear/Desbloquear** (justificativa obrigatória) |
| Extrato do material | Sem indicador de série | Material com a flag ganha o cartão "Séries em estoque" no Extrato |
| Motor (servidor) | `controle_serie` nunca era lida — coluna com escritor e sem leitor | Entrada exige N séries para N unidades; saída aceita quais séries saem; estorno devolve/estorna série; bloquear/desbloquear série avulsa; tudo auditado (`entidade='serie'`) |

> ⚠️ **Correção (review final do branch, 2026-08-11): duas células desta tabela afirmavam recursos
> que não existem.** A linha de Movimentações (Saída) dizia que a lista de séries tinha "filtro de
> texto" — não tem, só checkboxes e o filtro automático pelo lote. A linha de Lotes (tela) incluía
> "última entrada/saída" entre as colunas da aba Séries — a tabela real é
> Número/Status/Lote/Localização/Ações. Ambas eram escopo cortado de propósito (pendência (h) da
> spec 10), não bugs — o erro era só a spec e este guia afirmarem que tinham sido entregues.

### Regra que já existia para lote e agora vale para série também: rota v1 não tem campo

O modal rápido de entrada/saída dentro da tela de **Materiais** (a rota antiga, sem `/v2`) **não tem
campo de série** e sempre recusa movimentar material com `controle_serie` ligado — mesma limitação
que ele já tinha para lote. Use a tela **Almoxarifado → Movimentações**, que tem os dois campos.

### Roteiro de teste manual (Etapa 6b)

**A) Ligar a flag num material e ver o hint**

1. Vá em **Almoxarifado → Materiais**, edite um material (ou crie um novo). Na seção **Controles**,
   marque **"Controle por número de série"**. Repare no texto pequeno logo abaixo do checkbox
   explicando o efeito. Salve. Anote o código do material.

**B) Entrada com o gerador de sequência**

2. Vá em **Almoxarifado → Movimentações → Nova Movimentação**. Escolha o material do passo 1, tipo
   **Entrada**, quantidade **3**. Repare que aparece a caixa "Números de série (um por linha)" com
   o contador `0/3`.
3. Preencha **Prefixo** com `SN-` e **Nº inicial** com `1`, clique **"Gerar sequência"**. A caixa
   deve se preencher com `SN-1`, `SN-2`, `SN-3`, e o contador virar `3/3`.
4. Confirme a movimentação. Deve passar.

**C) Caso de erro esperado — cardinalidade errada**

5. Nova entrada do mesmo material, quantidade **2**, mas digite só **1** linha na caixa de série.
   Confirme. **Deve ser recusado**, com mensagem dizendo quantas séries faltam — e o saldo não pode
   mudar (confira no Extrato).

**D) Caso de erro esperado — série duplicada**

6. Tente uma nova entrada usando de novo o número `SN-1` (que já está em estoque desde o passo 4).
   **Deve ser recusado**, dizendo que a série já está em estoque.

**E) Saída escolhendo séries específicas**

7. Nova Movimentação, tipo **Saída**, mesmo material, quantidade **2**. Em vez de campo de texto,
   aparece uma **lista com checkbox** das séries em estoque (`SN-1`, `SN-2`, `SN-3`). Marque duas
   delas — o contador deve acompanhar (`2/2`). Preencha o motivo e confirme. Deve passar, e as duas
   séries marcadas saem de estoque (confira na aba Séries, passo H).

**F) Trocar o lote limpa a seleção de série (material com as duas flags)**

8. Se você tiver (ou criar) um material com **"Controle por lote" e "Controle por número de
   série"** ligados ao mesmo tempo: na saída, escolha um lote, marque uma série da lista, e então
   troque o lote selecionado. **A seleção de série deve zerar** — a lista de séries disponíveis
   também deve reduzir para só as daquele novo lote.

**G) Bloquear uma série na aba "Séries" e ver a saída recusar**

9. Vá em **Almoxarifado → Lotes** (agora "Lotes e Séries"). Escolha o material do passo 1 e clique
   na aba **"Séries"**. A série que sobrou em estoque (`SN-3`, se você seguiu os passos acima)
   aparece na lista com status **EM_ESTOQUE**.
10. Clique na ação de bloquear. Tente confirmar **sem** justificativa — deve ficar bloqueado
    (botão desabilitado ou recusa). Preencha uma justificativa (ex.: "suspeita de avaria") e
    confirme. O badge da série muda para **BLOQUEADA**.
11. Volte em Movimentações, tente uma Saída desse material escolhendo a série bloqueada. **Deve ser
    recusada**, com o status da série na mensagem.

**H) Recebimento com séries + o aviso de salvar antes de processar**

12. Vá em **Almoxarifado → Recebimentos → Novo Recebimento**. Adicione o material do passo 1 com
    uma quantidade. Avance o fluxo até a etapa de conferência (mesmos passos do roteiro da Etapa 6,
    seção F). No item, ao lado dos campos de lote, aparece a caixa **"Séries (uma por linha)"** com
    contador contra a quantidade recebida.
13. Digite as séries e **salve** antes de clicar em "Processar Nota" — há um aviso na tela lembrando
    disso; se você digitar e processar sem salvar, o processamento usa os dados salvos, não o que
    está digitado na hora. Processe a nota. Confira na aba Séries que as novas séries entraram com
    o **lote** e a **localização** corretos (a aba não mostra o vínculo com o recebimento em si —
    isso só aparece no banco, via `recebimento_id`/`recebimento_item_id`, pendência (g) da spec 10).

**I) Estorno devolvendo séries**

14. No livro de Movimentações, estorne a saída do passo 7 (ícone de estornar, motivo obrigatório).
    Confira na aba Séries que as duas séries voltam para **EM_ESTOQUE**.
15. Estorne também uma entrada com série (se ainda não tiver sido consumida). As séries dessa
    entrada devem virar **ESTORNADA** (não voltam a ficar disponíveis — foi a entrada que nunca
    devia ter acontecido).

**J) KPI no Extrato**

16. Abra o **Extrato** do material (Materiais → ícone Extrato). Deve aparecer o cartão **"Séries em
    estoque"** mostrando a contagem atual.

### Casos de erro esperados (resumo)

- Entrada sem série nenhuma em material controlado — recusada.
- Cardinalidade errada (menos ou mais séries que a quantidade) — recusada, nada muda no saldo.
- Quantidade fracionária em material com controle de série — recusada ("exige quantidade inteira").
- Série já em estoque tentando entrar de novo — recusada.
- Saída pedindo uma série que já saiu, está bloqueada, ou é de outro material/lote — recusada, e as
  séries que já tinham sido "reservadas" na mesma tentativa voltam para EM_ESTOQUE (nada fica
  travado pela metade).
- Modal rápido da tela de Materiais (rota v1) com material controlado — sempre recusado; use
  Movimentações.

### O que a Etapa 6b **não** cobre

- **Etiquetas e QR Code.** *(Corrigido em 2026-08-11: esta linha dizia que a etapa seguinte ainda
  não tinha entregue isso — a Etapa 6c entregou. Ver a seção "Etapa 6c", mais abaixo, para o que
  mudou e o roteiro de teste.)*
- **Série na entrega, na exclusão de requisição e na devolução.** As mesmas quatro operações que já
  não pedem lote (entrega de requisição, exclusão/estorno de requisição, devolução e sucata de
  devolução) também não pedem série — nenhuma dessas telas tem campo para isso. Reentrada de uma
  devolução com série se faz manualmente pela tela de Movimentações (ENTRADA citando a série que
  volta). Transferência entre almoxarifados também não pede série, mesma lacuna já declarada para
  lote.
- **Reprovar uma série pela tela de Inspeções.** A inspeção continua decidindo por quantidade do
  material, não por série individual — bloquear uma série específica só existe pela aba "Séries"
  (ação manual avulsa).
- **Reserva por número de série.** Reservar continua sendo do material, não de uma série (nem de um
  lote) específico.
- **Filtro por status na aba Séries.** A tabela lista todas as séries do material de uma vez — não
  há um seletor "só EM_ESTOQUE" ou "só BLOQUEADA" ainda. Como a tabela por material costuma ser
  pequena, não travou a etapa.
- **"Salvar antes de processar" no Recebimento é um aviso, não uma trava.** Se você digitar séries
  na tela e clicar direto em "Processar Nota" sem salvar, o processamento usa os dados **salvos**
  — mesmo comportamento que os campos de lote já tinham.
- **Extrato agregado do lote** ("tudo que aconteceu com este lote/série numa tela só") continua sem
  existir — os dados estão espalhados em movimentações, auditoria e a própria tabela de série/lote.

### O que faltava era de verdade — série era só uma flag morta

Os dados sempre estiveram lá — a coluna `controle_serie` nasceu na Etapa 2 — mas ninguém nunca fazia
nada com ela. Quando você marcava "Controle por série" num material e tentava entrar com 5 unidades,
o sistema **não** perguntava os 5 números — simplesmente aceitava sem registrá-los. O comando `npm run
test:api` rodava verde porque os testes não testavam série (ela estava marcada como Etapa 6b no plano
original). Era o mesmo padrão que a spec desta feature toda documenta como **"coluna com escritor,
sem leitor"**.

Implementação: tabela `series_almoxarifado` + `seriesService` dono único (leitura, entrada com
compensação de erro, claim de saída, reversões de estorno, bloqueio com justificativa), motor
(`stockService`) integrado em movimentações/recebimento com o invariante `COUNT(séries presentes) ==
quantidade_atual` protegido até sob falha do INSERT do ledger, duas rotas HTTP, e a UI descrita acima
(Movimentações, Recebimentos, aba Séries, hint da flag, KPI no extrato). Detalhe task a task —
incluindo os fix rounds e o porquê de cada um — no
[plano de implementação](superpowers/plans/2026-08-11-almoxarifado-etapa6b-series.md).

---

## Etapa 6c — Etiquetas com QR Code (ENTREGUE — 2026-08-11)

A Etapa 6 entregou lote, a 6b entregou série — mas nenhum dos dois saía do sistema. Um lote ou uma
série ficavam sabidos na tela, sem nada que os identificasse fisicamente numa prateleira ou numa
peça no galpão. A Etapa 6c fecha esse ciclo: um PDF de etiquetas, para imprimir e colar, com o
código do material legível a olho nu e um QR Code que devolve quem lê direto para a tela do sistema
— já filtrada na linha certa.

**Decisão importante: a impressora do galpão ainda não foi confirmada com você.** O gerador vem com
dois formatos prontos — folha A4 comum (10 etiquetas por página, para recortar) e etiqueta térmica
100×50mm (uma por página, para rolo de impressora térmica) — e o formato escolhido no modal fica
lembrado da próxima vez. Se a impressora real do galpão usar outra medida, é um ajuste pequeno
(uma entrada na tabela de formatos), não um redesenho.

### O que mudou

| Onde | Antes | Agora |
|---|---|---|
| Recebimentos | Nota processada não tinha como gerar etiqueta dos itens que acabaram de entrar | Botão **"Imprimir etiquetas dos itens"** aparece na nota `PROCESSADO`/`APROVADO` — uma etiqueta por série (material com controle de série) ou por lote (material com controle de lote), lida do que foi digitado na nota |
| Lotes e Séries | Não existia como imprimir etiqueta de um lote ou série específico | Ícone de etiqueta em cada linha de lote e de série (inclusive séries já `ESTORNADA`/`SUCATEADA` — serve para reimprimir); na aba Séries, botão **"Etiquetas das séries em estoque"** gera uma de cada `EM_ESTOQUE` de uma vez |
| Lotes e Séries | Abrir a tela filtrada num lote/série exigia escolher manualmente o material e a aba | A tela aceita ser aberta com a URL que o QR codifica — já entra no material e na aba certos, com a linha do lote/série **destacada** |
| Materiais | Não existia etiqueta avulsa de material | Ícone de etiqueta em cada linha: material **sem** controle de lote/série abre direto o modal de impressão; material **com** a flag te leva para "Lotes e Séries" (a etiqueta certa é a do lote/série, não a do material) |
| (modal novo) | — | **Escolher formato e imprimir**: seleciona A4 ou térmica, define quantas cópias (só faz sentido numa etiqueta única), mostra quantas etiquetas/páginas o PDF vai ter, e baixa o arquivo |

### O que vai para o papel (e o que fica só atrás do QR)

De propósito, a etiqueta impressa mostra pouca coisa: **código do material em fonte grande**, o
nome (cortado se for longo), e a linha de controle — `Lote L-001 · Val 31/12/2026` ou `SN: GMP-042`.
Fornecedor, pedido, nota fiscal, projeto, localização e status de inspeção **não** vão para o papel
— ficam na tela que o QR abre. Etiqueta cheia de informação pequena é difícil de ler numa prateleira
de verdade; o QR existe exatamente para carregar o resto.

### Roteiro de teste manual (Etapa 6c)

**A) Imprimir da nota de recebimento já processada**

1. Abra um recebimento que já esteja **Processado** (ou processe um agora — veja o roteiro da
   Etapa 6, seção F, se precisar de um do zero). Se os itens tiverem lote ou série preenchidos, o
   botão **"Imprimir etiquetas dos itens"** aparece embaixo do resumo da nota.
2. Clique nele. O modal abre com a contagem de etiquetas. Escolha o formato **Folha A4** e clique
   em **Gerar**. Um PDF é baixado (`etiquetas-AAAA-MM-DD.pdf`), com uma etiqueta por série (se o
   material tiver controle de série) ou uma por lote (se tiver controle de lote apenas).
3. **Caso de erro esperado.** Abra um recebimento processado cujos itens não tenham lote nem série
   nem controle nenhum, ou cuja quantidade recebida seja zero: o botão aparece **desabilitado**,
   com uma explicação curta ao passar o mouse — não há nada para etiquetar.

**B) Etiqueta por linha de lote ou série**

4. Vá em **Almoxarifado → Lotes e Séries**, escolha um material com lotes ou séries cadastrados.
5. Na aba **Lotes**, clique no ícone de etiqueta de qualquer linha. O modal abre já com 1 etiqueta
   (a daquele lote). Gere o PDF e confira: código do material, nome, `Lote <código> · Val
   dd/mm/aaaa` (ou só `Lote <código>` se o lote não tiver validade), e o QR.
6. Repita na aba **Séries**, numa série qualquer — inclusive uma que já esteja `ESTORNADA` ou
   `SUCATEADA` (é a reimpressão: você ainda pode gerar a etiqueta de uma série que já saiu de
   circulação, para reimprimir uma via danificada, por exemplo).

**C) Etiquetas em massa das séries em estoque**

7. Ainda na aba **Séries**, clique no botão **"Etiquetas das séries em estoque"**, no topo. O modal
   abre com uma etiqueta para cada série `EM_ESTOQUE` daquele material — não entram as
   `ESTORNADA`/`SUCATEADA`/`BLOQUEADA` neste botão específico (para essas, use a etiqueta individual
   do passo 6). Gere e confira a contagem de páginas no modal antes de baixar.

**D) Etiqueta avulsa em Materiais — e a diferença com/sem controle**

8. Vá em **Almoxarifado → Materiais**. Clique no ícone de etiqueta de um material **sem** "Controle
   por lote" nem "Controle por número de série" marcados. O modal abre direto, com a etiqueta do
   material (sem linha de lote/série). Gere e confira.
9. Agora clique no mesmo ícone de um material **com** uma das duas flags ligadas. **Não abre
   modal** — a tela te leva direto para **Lotes e Séries**, já com esse material selecionado (e na
   aba Séries, se for controle de série). É proposital: a etiqueta certa para um material
   controlado é a do lote/série específico, não uma etiqueta genérica do material.

**E) Ler o QR com o celular**

10. Abra o PDF gerado em qualquer um dos passos acima (num monitor ou impresso) e aponte a câmera
    do celular para o QR de qualquer etiqueta. Ele abre o navegador numa URL do sistema.
11. **Se você não estiver logado no celular, cai na tela de login** — dado de estoque exige sessão,
    o QR não pula essa trava. **Sem sessão, o destino do QR se perde**: `App.js` manda para
    `/login` sem guardar de onde você veio, e depois do login `Login.js` sempre navega para `/`
    (a tela de seleção de módulos), não de volta para a URL do QR. Faça login primeiro e depois
    **escaneie o QR de novo**, ou navegue manualmente até **Almoxarifado → Lotes e Séries**.
12. Se você já estava logado, o QR abre direto na tela "Lotes e Séries" (ou Materiais, para
    etiqueta de material simples), já no material certo, na aba certa, e com a **linha daquele
    lote/série destacada** (fundo azul claro) — sem precisar procurar.

**F) O modal lembra o formato escolhido**

13. Abra qualquer modal de etiqueta e troque o formato para **Térmica 100×50mm**. Clique em
    **Gerar** — a escolha só é gravada no `localStorage` dentro da ação de gerar
    (`EtiquetasPdfModal.js`), não ao trocar o select. Se você fechar o modal **sem** gerar, a troca
    não persiste.
14. Abra outro modal de etiqueta (em qualquer tela, qualquer lote/série/material). Se você gerou no
    passo 13, ele já deve abrir com **Térmica 100×50mm** pré-selecionada — é lembrado por
    navegador, não por usuário do sistema.

**G) Recortar a folha A4**

15. No PDF gerado em formato **Folha A4**, repare que cada etiqueta tem uma **borda pontilhada** ao
    redor — é a linha de corte, para recortar com tesoura ou estilete numa folha adesiva.

### O que a Etapa 6c **não** cobre

- **A impressora física do galpão não foi confirmada.** Os dois formatos (A4 e térmica 100×50mm)
  são a melhor suposição até você confirmar qual impressora/etiqueta o galpão usa de fato. Se for
  outra medida, é um ajuste pequeno.
- **Etiqueta de retalho** (sobra de chapa/tubo com dimensão e peso remanescente) não existe —
  depende da feature de Retalhos e Sucatas (15) ganhar tela primeiro, o que ainda não aconteceu.
- **Etiqueta de localização/prateleira** foi cortada de propósito — o **Mapa de Localizações** já
  mostra onde cada posição fica, e a etiqueta avulsa de material cobre o caso comum de identificar
  o que está numa prateleira.
- **A etiqueta do recebimento usa o texto que você digitou na nota**, não uma nova consulta ao que
  o sistema efetivamente gravou. Na prática isso não costuma divergir — mas se você digitar um
  número de série errado e salvar, a etiqueta sai com o número errado, igual ao que ficou na nota.
- **Não existe registro de "quem imprimiu o quê e quando".** Reimprimir uma etiqueta é livre, sem
  rastro — decisão consciente (ninguém pediu essa auditoria, e criar sem uso é o mesmo erro de
  "coluna que ninguém lê" que esta feature inteira existe para evitar).
- **Sem coletor de código de barras nem app dedicado.** O "leitor" é a câmera do próprio celular,
  pelo QR — não há hardware novo nem app específico do almoxarifado.

---

## Decisões de negócio (não são pendências)

- **Almoxarifado é área física, não filial.** Os almoxarifados representam áreas de alocação dentro do mesmo site (galpão, mezanino, área externa). O cliente tem uma única filial. Por isso o **saldo de cada material é um só**, somado em todas as áreas — o almoxarifado serve para você *achar onde o item está*, não para manter estoques separados. Uma saída consome o saldo total do material, independente da área em que ele está endereçado. Isso é intencional: se algum dia existir uma segunda filial, a regra muda, mas hoje tratar como dois estoques seria errado.
- **A primeira contagem numa prateleira REDEFINE o saldo do material (decidido em 2026-08-09).**
  Hoje praticamente todo o estoque tem saldo no sistema e **nenhum endereço registrado**. Quando
  você conta esse material pela primeira vez numa localização e lança o ajuste, o sistema entende
  que *"nesta prateleira tem 40"* significa **o material tem 40** — não 140. A partir daí, o total
  do material passa a ser a soma do que está endereçado. É o comportamento correto para inventário
  inicial, e é o que faz o endereçamento valer alguma coisa: se a contagem apenas somasse, o saldo
  antigo sem endereço nunca sumiria. **Ressalva importante:** essa regra vale enquanto o material
  ainda não tiver *nenhuma* linha de saldo registrada. Depois que um ajuste global já criou uma
  linha "sem endereço", contar uma prateleira **soma** em vez de redefinir — ver a pendência sobre
  isso logo abaixo, que está esperando decisão sua.

---

## Pendências conhecidas (sem tela ainda)

- Consulta de "posições vazias" e "materiais sem endereço": a API já existe, mas não há tela para usá-la.
- Criar subfamílias: só via API, sem formulário na interface.
- Reservas de estoque: **completo na Etapa 4** — backend, tela (Almoxarifado → Reservas) e as duas rotas que escapavam do hold (liberação por valor e exclusão de requisição). Sem pendência.
- Anexos na requisição (desenho/documento) e assinatura digital na retirada: ainda não implementados.
- Importar itens de uma lista técnica ou ordem de produção na requisição: ainda não implementado (depende da integração com Engenharia/Produção).
- Registrar lote/série entregue por item na requisição: ainda não implementado. O controle de lotes
  e o de série passaram a existir (Etapas 6 e 6b), mas a **entrega da requisição** ainda não
  pergunta de qual lote/série saiu — mesma isenção declarada para os dois.
- **Lotes: completo na Etapa 6 + Task 9** — motor, recebimento, saída, e a tela **Almoxarifado →
  Lotes** (mudar status, liberar vencimento, anexar e agora **abrir** o certificado). Falta o
  "extrato do lote" (histórico agregado numa tela só) — ver "O que a Task 9 não cobre", acima.
- **Série: completo na Etapa 6b** — motor, recebimento, saída e a aba **Séries** dentro de "Lotes e
  Séries" (bloquear/desbloquear com justificativa). Falta reserva por série e reprovação por série
  via inspeção — ver "O que a Etapa 6b não cobre", na seção da etapa, acima.
- **Etiquetas: completo na Etapa 6c** — PDF com QR Code em Recebimentos, Lotes e Séries e
  Materiais, formato A4 e térmica. Falta confirmar a impressora física do galpão com o cliente, e
  a etiqueta de retalho (aguarda a feature 15 ganhar tela) — ver "O que a Etapa 6c não cobre", na
  seção da etapa, acima.
- **Lote na entrega de requisição e na devolução (novo, 2026-08-10).** Quatro operações movimentam
  estoque sem lote mesmo em material com "Controle por lote": entrega de requisição, exclusão de
  requisição (estorno), devolução para estoque e sucata de devolução. Nenhuma tem campo de lote.
  Até 2026-08-10 o sistema **exigia** lote nelas — e o efeito era que o material com a opção ligada
  não podia ser entregue nem devolvido, com a reserva da requisição presa segurando saldo. A
  exigência foi retirada desses quatro caminhos; o que fica pendente é o oposto: **preencher o lote
  sozinho** (o que vence primeiro na entrega, o lote de origem na devolução), que é o conteúdo
  natural da próxima etapa de lotes.
- **Reprovar na inspeção não marca o lote.** A tela de Inspeções continua bloqueando o **material
  inteiro**, não o lote específico. Reprovar 10 unidades de um lote de 100 bloqueia 10 do material —
  o lote em si continua "Ativo" e sai normalmente. Ligar as duas coisas é mudança na tela de
  Inspeções, não no controle de lotes, e ficou de fora da Etapa 6 de propósito.
- **⚠️ Decisão de negócio esperando você (1): contagem de prateleira depois de um ajuste global.**
  A regra "a primeira contagem redefine o saldo" (ver Decisões de negócio acima) vale quando o
  material nunca teve contagem. Mas se você fizer um **ajuste global de 100** (sem escolher
  localização) e depois **contar 40 numa prateleira**, o resultado é **140**, não 40 — porque os 100
  continuam registrados "sem endereço" e a soma inclui os dois. Qual dos dois é o certo é pergunta
  de negócio, não técnica: *"100 sem endereço + 40 na prateleira A" é um material com 140 espalhado,
  ou um material com 40 que acabou de ser inventariado?* Nada foi mudado até você decidir.
- **⚠️ Decisão de negócio esperando você (2): certificado de fornecedor acessível sem login.** Os
  arquivos enviados no módulo (fotos de material e, desde a Etapa 6, **certificados de fornecedor**)
  ficam numa pasta servida diretamente pelo servidor, **fora da verificação de login**. Quem souber
  o endereço do arquivo consegue baixá-lo sem estar autenticado. **Não é uma regressão da Etapa 6**
  — é o mesmo tratamento que as fotos de material já tinham desde sempre —, mas certificado é
  documento bem mais sensível que foto de prateleira. Se você quiser que passe a exigir login, é uma
  mudança pequena e isolada.
- **Ajuste de inventário homologado pode "evaporar".** Concluir uma conferência de estoque com
  "aplicar ajustes" grava o total do material por um caminho antigo, que **não atualiza o saldo por
  prateleira**. Se depois disso você contar uma prateleira, o sistema recalcula o total a partir das
  prateleiras — e o número homologado no inventário se perde. **É anterior à Etapa 6** (não foi ela
  que causou), e o conserto é rotear a conclusão da conferência pelo mesmo motor que todo o resto
  usa. Enquanto isso não for feito, evite intercalar "concluir conferência com ajustes" e "contagem
  por localização" no mesmo material.
- Regras de aprovação configuráveis (por tipo de material, valor, quantidade, projeto, urgência) com tela própria: hoje as regras (segregação do solicitante + limite por valor) são fixas no código — sem tela de configuração.
- Encerramento não dispara e-mail de resumo.
- **Inspeção/quarentena: completo na Etapa 5** para o que estava no escopo — quarentena real na
  entrada, decisão de inspeção (aprovar/reprovar/parcial), bloqueio/desbloqueio avulso, tela
  própria. Pendência que a etapa **cria** (não é falta de implementação, é consequência): material
  reprovado na inspeção fica **bloqueado até alguém desbloquear manualmente e lançar a saída à
  parte** — não existe hoje nenhuma devolução automática ao fornecedor vinculada ao recebimento de
  origem. O campo "encaminhamento" (Devolver/Engenharia/Substituição) registrado na reprovação é
  só uma anotação de intenção; quem vai efetivamente *usar* essa anotação para gerar a devolução é
  uma etapa futura (Devoluções).
- Estornar uma movimentação de quarentena/inspeção (tipos `QUARENTENA`, `LIBERACAO_INSPECAO`,
  `REPROVACAO_INSPECAO`, `DECISAO_INSPECAO`) não desfaz o efeito no saldo retido/bloqueado — o
  botão de estornar aparece habilitado para essas linhas no livro de movimentações, mas hoje só
  marca a linha original como cancelada, sem devolver `quantidade_em_inspecao`/
  `quantidade_bloqueada`. Mesma limitação que já existia para outros tipos de movimentação
  especiais antes da Etapa 4. Evite estornar essas linhas até isso ser corrigido.
