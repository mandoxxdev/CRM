# Almoxarifado — Guia das Etapas e Testes Manuais

> Atualizado em 2026-08-13 · Branch: `desenvolvimento-almoxarifado` · Como rodar: `npm run dev` (raiz do projeto)

Este documento explica, em linguagem simples, o que mudou no módulo Almoxarifado até agora (Etapas 1 a 8b) e tem um roteiro de cliques para você testar manualmente no navegador cada etapa.

> ## Onde o desenvolvimento parou — 2026-08-13 (Etapa 8c em andamento)
>
> **A Etapa 8c (transformação: chapa que sai e volta como peças cortadas + sobra) está com o código
> entregue e a seção deste guia AINDA NÃO ESCRITA** — ela é a Task 10 do plano
> `docs/superpowers/plans/2026-08-13-almoxarifado-etapa8c-transformacao.md`, e é lá que está o
> estado real, task por task. **Não conclua deste guia que a 8c não existe: ela existe, este
> documento é que está atrasado.**
>
> **Já documentado aqui, porque mudam números que você olha** — dois defeitos antigos, descobertos
> durante a 8c e corrigidos na hora (seções logo antes de "Decisões de negócio"):
> 1. [o valor do estoque aparecia ZERADO nos relatórios](#correção--o-valor-do-estoque-aparecia-zerado-nos-relatórios-2026-08-13);
> 2. [a posição por cliente não fechava a conta](#correção--a-posição-por-cliente-não-fechava-a-conta-2026-08-13).
>
> **Antes: 2026-08-12 (Etapa 8b).**
> **Etapas 1 a 8b completas.** A **Etapa 8b (Remessas a Terceiros) fechou em 2026-08-12**
> (`0a01124..b176212`), e era a **outra metade da feature 14**, junto com a 8c.
>
> **A Etapa 8b fez o material que vai beneficiar fora parar de sumir do controle.** Antes, quando
> uma chapa ia para o galvanizador, ou alguém dava baixa — e ela **desaparecia do patrimônio**,
> embora continuasse sendo da empresa — ou não dava baixa nenhuma, e o sistema **afirmava que a
> chapa estava na prateleira** com ela a 40 km. Agora existe a tela **Almoxarifado → Remessas a
> Terceiros**: a remessa tem terceiro, tipo de serviço, prazo e itens; ao **enviar**, o material
> **sai do disponível e continua no total**; o retorno pode ser **parcial**, quantas vezes for
> preciso; e **encerrar deixando saldo lá fora exige dizer para onde ele foi** (perda no terceiro
> ou consumido no processo), o que dá baixa de verdade em vez de deixar saldo preso. Tem **PDF do
> documento de remessa** com duas linhas de assinatura. Ver a seção "Etapa 8b", mais abaixo, para as
> regras demonstráveis e o roteiro completo.
>
> **✅ NADA A RODAR EM PRODUÇÃO POR CAUSA DESTA ETAPA.** Diferente das Etapas 7 e 8, a 8b só
> **acrescenta** uma coluna e três tabelas novas — **nenhum dado existente é tocado ou
> reinterpretado**, e não há passado a corrigir. Isso está dito explicitamente porque as duas
> etapas anteriores deixaram consultas pendentes e você vai procurar a desta. (As consultas das
> Etapas 7 e 8 **continuam pendentes** — ver os blocos abaixo.)
>
> **⚠️ DUAS COISAS DA ETAPA 8b QUE DEPENDEM DE VOCÊ, NÃO DO CÓDIGO** (detalhadas na seção da
> Etapa 8b, em "O que depende de você"):
> 1. **"Uma remessa não pode misturar materiais de donos diferentes" foi DEDUZIDO, não pedido.** O
>    sistema hoje recusa. Se a GMP manda chapa de dois clientes na mesma viagem para o mesmo
>    galvanizador, **a regra está errada** e precisa mudar. É pergunta, não requisito atendido.
> 2. **Falta a conferida no navegador** dos cinco selos coloridos de status e do PDF baixando
>    legível — teste automático não abre navegador e não valida nem cor nem PDF.
>
> **Antes: 2026-08-12 (Etapa 8).**
> **Etapas 1 a 8 completas.** A **Etapa 8 (Materiais de Clientes) fechou em 2026-08-12**
> (`f26b635..5b5eb55`). **Próxima etapa da ordem: Etapa 8b — Materiais em Terceiros** (a Etapa 8 do
> planejamento foi **dividida**: 8 = clientes, entregue; 8b = terceiros, ainda sem design).
>
> **A Etapa 8 tirou o material de cliente da ilha em que ele vivia.** Antes ele era uma lista à
> parte, com descrição em texto livre, sem lote, sem série, sem endereço, sem extrato, sem etiqueta
> e sem passar pelo motor de estoque — e **nada impedia** usar a chapa do Cliente A no equipamento
> do Cliente B. Agora ele é **material normal com dono**: tudo o que as Etapas 1 a 7 entregaram
> vale para ele, o saldo dele fica **fora** de todo número do estoque próprio (dashboard, valor
> total, reposição de mínimo, sugestão de compra, posição), a saída só sai com OS ou projeto **do
> próprio dono**, e existe a tela **Almoxarifado → Materiais de Clientes** com posição por cliente
> e PDF. Ver a seção "Etapa 8", mais abaixo, para as regras demonstráveis e o roteiro completo.
>
> **⚠️ DUAS COISAS PARA LER ANTES DE SUBIR A ETAPA 8 PARA PRODUÇÃO** (ambas detalhadas na seção da
> Etapa 8, em "O que fazer antes do deploy"):
> 1. **A conferência de inventário escapa da permissão nova.** Concluir uma conferência com
>    "aplicar ajustes" grava o saldo por um caminho antigo, **fora do motor** — logo, fora da
>    permissão `ajustar_material_cliente`. **É um caminho real por onde o saldo de material de
>    cliente muda sem a autorização especial.**
> 2. **Confirmar que a tabela antiga está vazia em produção.** A ilha foi aposentada com base na
>    medição do banco de **desenvolvimento** (0 linhas). **Nenhuma linha foi apagada** — a tabela
>    ficou de propósito —, mas a consulta precisa ser rodada em produção.
>
> **Antes: 2026-08-12.** A **Etapa 7 (Transferências e Devoluções)** fechou na mesma data
> (`29524fc..0722bfd`, mais os consertos `eabd848`/`7fc1b7f` e `d117dc2`).
>
> **🚨 ANTES DE SUBIR PARA PRODUÇÃO, LEIA ISTO.** A Etapa 7 corrigiu um bug de saldo: **devolver
> material para o destino "Sucata" baixava o estoque duas vezes**. Quem já usou o sistema pode ter
> saldo errado em casa, e a correção **não** conserta o passado. A consulta que identifica os casos
> afetados está na seção da Etapa 7, em "O bug da Sucata" — **no banco de desenvolvimento a
> checagem já foi feita e deu 0 devoluções (nenhum efeito lá); produção precisa da mesma
> checagem**.
>
> **A Etapa 7 fechou as duas rotas que existiam sem nenhuma tela.** Transferir material entre
> prateleiras e devolver material do chão de fábrica só eram alcançáveis por chamada direta à API —
> ninguém no galpão conseguia fazer nem uma coisa nem outra. Agora **Transferência** é um tipo do
> formulário de Movimentações (com origem, destino e lote) e existe a tela nova **Almoxarifado →
> Devoluções**, onde a devolução fica ligada à entrega que a originou. Ver a seção "Etapa 7", mais
> abaixo, para o roteiro completo e o que a etapa não cobre.
>
> **Antes: 2026-08-11.** Etapa 6c (Etiquetas com QR Code) — ENTREGUE (`35967b9..0785119`), a última
> parte da feature 10: lote + série + etiqueta física fecham o ciclo.
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
> **A próxima é a Etapa 8 — Materiais de Clientes** (spec 13). Ver o planejamento mestre em
> `specs/modulo-almoxarifado/README.md` e o plano detalhado em
> `docs/superpowers/plans/2026-08-12-almoxarifado-etapa8-materiais-clientes.md`.

## Tabela consolidada — todas as alterações (Etapas 1 a 8)

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
| 7 | Movimentações | Transferir material entre prateleiras só existia por API — nenhuma tela chamava | **Transferência** é um tipo do formulário, mostrando **origem E destino** ao mesmo tempo (Entrada mostrava só destino, Saída só origem) mais o seletor de lote |
| 7 | Movimentações | Material com "Controle por lote" transferia **sem dizer de qual lote saiu** — o oposto do que a opção promete | A transferência **exige o lote**. Na transferência **todos** os lotes servem, inclusive **bloqueado e vencido** — mover um lote reprovado de prateleira é legítimo, é assim que ele vai para a área de bloqueados |
| 7 | Movimentações | "Devolução" era uma opção do formulário que criava um lançamento **solto**: sem motivo, sem condição, sem destino, e **sem criar registro nenhum** de devolução | Saiu do formulário; um aviso embaixo do campo Tipo aponta a tela nova. Continua no **filtro do livro**, senão os lançamentos antigos sumiriam da consulta |
| 7 | Movimentações (livro) | O badge de Transferência saía **sem cor nenhuma** (classe de estilo inexistente — falha silenciosa) | Badge ciano-petróleo próprio: transferência não soma nem subtrai saldo, então pintá-la de verde (entrada) ou vermelho (saída) ensinaria a coisa errada |
| 7 | Devoluções (tela nova) | Devolver material só por API, sem dizer de qual entrega veio; qualquer quantidade de qualquer material passava | Tela **Almoxarifado → Devoluções**: escolhe o material, vê **as entregas dele** (data, quantidade, quem retirou, requisição/OS, quanto já foi devolvido) e devolve **limitado ao que ainda resta** |
| 7 | Devoluções | Não havia como devolver "mais do que foi entregue" ser recusado — não existia o conceito | Recusa dizendo **quanto resta**: *"a saída 1 entregou 10, já foram devolvidos 4 e restam 6"*. Devolução **avulsa** (sem entrega registrada) continua possível, para sobra antiga ou material entregue antes do sistema |
| 7 | Devoluções | Devolução de material com controle de lote entrava **sem lote** e o saldo ficava **preso** (a saída seguinte exige lote e não achava nenhum) | O lote é **herdado da entrega** escolhida (aparece em modo leitura); na devolução avulsa, seletor de lote obrigatório |
| 7 | Devoluções | Devolver peça com número de série voltava o **saldo sem voltar a peça** — a série continuava "Entregue" | A série volta para **"Em estoque"** junto. Nos destinos Sucata/Retrabalho a tela **não** oferece as séries e explica o caminho de dois passos |
| 7 | Devoluções | **Devolver para Sucata baixava o estoque duas vezes** (o material já tinha saído na entrega, e a sucata descontava de novo) | O saldo **não muda** e o livro registra as duas linhas (Entrada de devolução + Sucata). **Ver o aviso de produção na seção da Etapa 7** |
| 7 | Devoluções | Devolução **recusada** deixava a linha gravada mesmo assim — e a linha fantasma encolhia **para sempre** o que ainda podia ser devolvido daquela entrega | Recusa não deixa registro; se metade já tiver mexido no estoque, a linha fica marcada como estado parcial na auditoria (resolução manual pela tela de Movimentações) |
| 8 | Materiais | Material de cliente vivia numa **lista à parte**, com descrição em texto livre, sem lote, sem série, sem endereço, sem extrato, sem etiqueta e **fora do motor de estoque** | É **material normal com dono**: na ficha do material, a seção **Propriedade** define o proprietário (ou "GMP — estoque próprio"). Tudo que as Etapas 1 a 7 entregaram passa a valer para ele |
| 8 | Materiais / Movimentações / Extrato | Nada distinguia a chapa do cliente da nossa numa listagem | **Selo de propriedade** com o **nome do cliente** ao lado do material, nas três telas. O selo diz *de quem é*, não só *que é de alguém* |
| 8 | Movimentações | **Nada impedia** usar a chapa do Cliente A no equipamento do Cliente B | Saída de material de cliente **exige OS ou projeto daquele mesmo cliente**; a recusa **nomeia os dois** (o dono e o do vínculo) para você saber qual das pontas está errada |
| 8 | Movimentações | A "Saída emergencial" liberava qualquer saída sem vínculo, com justificativa | Material de cliente **não aceita saída emergencial** — única exceção deliberada. "Regularizo depois" não é resposta para o dono da chapa |
| 8 | Movimentações | Qualquer ALMOXARIFE podia zerar o saldo da chapa do cliente por um AJUSTE, pelas duas rotas | Ajustar saldo de material de cliente exige a permissão **`ajustar_material_cliente`** (só ADMINISTRADOR), com auditoria **nomeando o cliente**. Ajuste de material nosso não mudou |
| 8 | Recebimentos | Material de cliente entrava sem nenhum documento | Recebimento com item de material de cliente **exige o número da nota** (a nota de remessa) — e **recusa a nota inteira**. Material nosso continua entrando sem nota |
| 8 | Dashboard / Relatórios / Compras | O material de terceiro **contava como patrimônio nosso** no valor total do estoque, e o sistema chegaria a **abrir pedido de compra** para repor a chapa de outra empresa | Material de cliente fica **fora** de: valor total do estoque, materiais críticos, materiais zerados, reposição de mínimo, sugestão automática de compra, alerta de estoque baixo e relatório de posição |
| 8 | Mapa de Localizações / Bloqueados | — | Material de cliente **continua aparecendo** na ocupação de prateleira e no relatório de materiais bloqueados — **de propósito**: a chapa está fisicamente lá e é bloqueada de verdade; escondê-la faria a tela mentir |
| 8 | Materiais de Clientes (tela nova) | Não existia tela nenhuma | Tela **Almoxarifado → Materiais de Clientes**: escolhe o cliente e vê recebido, consumido, devolvido e saldo por material, mais em quais OS/projetos foi aplicado; **PDF de posição** e botão **Devolver ao cliente** |
| 8 | Materiais de Clientes | Não havia como registrar a saída do material de volta para o dono | Tipo de movimento novo **Devolução ao cliente** (saída, pelo motor — lote, série e endereço funcionam), com **número do documento obrigatório**. Não confundir com a tela de Devoluções da Etapa 7, onde o material **volta** para o estoque |

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

## Etapa 7 — Transferências e Devoluções (ENTREGUE — 2026-08-12)

Duas rotas existiam no sistema desde sempre e **nenhuma das duas tinha tela**: transferir material
de um endereço para outro e devolver material que voltou do chão de fábrica só eram alcançáveis por
chamada direta à API. Além de invisíveis, as duas eram frouxas — a transferência não pedia o lote
(mesmo em material com "Controle por lote" ligado) e a devolução aceitava **qualquer quantidade de
qualquer material**, sem dizer de qual entrega veio.

E quando esta etapa foi sondada, apareceu um bug de saldo que ninguém tinha visto. Leia o aviso
abaixo antes de subir para produção.

### 🚨 O bug da Sucata — quem já usou o sistema pode ter saldo errado em casa

**O que estava errado:** devolver material para o destino **Sucata** baixava o estoque **duas
vezes**. O raciocínio do erro: o material já tinha saído do estoque quando foi **entregue**; ao
registrar a devolução para sucata, o sistema lançava mais uma saída, descontando de novo um saldo
que nunca tinha voltado.

Medido com o sistema rodando (não por leitura de código — a leitura não mostrava o problema):

```
estoque inicial            => 100
saída de 10 (entrega)      =>  90
devolução de 3 → Sucata    =>  87     ← ERRADO: o certo é 90
devolução de 2 → Estoque   =>  89     ← controle: prova que a medição sabe medir
```

**O que mudou:** o destino Sucata agora lança **duas** movimentações — uma **Entrada de devolução**
(o material voltou) seguida de uma **Sucata** (e foi descartado). O saldo fecha certo e o livro
continua contando as duas coisas. A alternativa de simplesmente não lançar nada foi descartada: o
saldo também ficaria certo, mas a sucata sumiria do livro, e o controle de retalhos e sucatas
(feature 15) vai precisar dela lá.

**A correção NÃO conserta o passado.** Onde já houve devolução para sucata antes do deploy, o saldo
daquele material está **a menos** — pela quantidade que foi devolvida.

**Como verificar, antes de subir para produção.** Rode esta consulta no banco de produção. Ela lista
exatamente as devoluções para sucata que foram gravadas pelo comportamento **antigo** (as novas
sempre têm uma Entrada de devolução com a mesma referência; as antigas não têm):

```sql
SELECT d.id, d.material_id, d.quantidade, d.created_at
  FROM devolucoes_material_almoxarifado d
 WHERE d.destino = 'SUCATA'
   AND NOT EXISTS (
         SELECT 1 FROM movimentacoes_almoxarifado m
          WHERE m.referencia = 'DEV-' || d.id
            AND m.tipo = 'ENTRADA_DEVOLUCAO');
```

- **Voltou vazio (0 linhas):** nada a fazer, nenhum saldo foi afetado.
- **Voltou com linhas:** cada linha é um material cujo `quantidade_atual` está **menor** do que
  deveria, exatamente pelo valor da coluna `quantidade`. O acerto é uma **contagem física** com
  lançamento de **Ajuste** naquele material — decisão sua, porque o número certo é o que está na
  prateleira hoje, não o que a conta diz.

**Medido no banco de desenvolvimento (2026-08-12): a tabela de devoluções tem 0 linhas** — lá o bug
nunca chegou a produzir efeito. Isso **não** dispensa rodar a consulta em produção.

### O que mudou

| Onde | Antes | Agora |
|---|---|---|
| Movimentações | Transferir material entre prateleiras não tinha tela nenhuma | **Transferência** é um tipo do formulário, com **Localização de origem** e **Localização de destino** ao mesmo tempo, mais o seletor de lote |
| Movimentações | Material com "Controle por lote" transferia sem citar o lote | A transferência **exige** o lote. E aceita **qualquer** lote — inclusive bloqueado e vencido |
| Movimentações | "Devolução" no formulário criava um lançamento solto e nenhum registro de devolução | Saiu do formulário; um aviso aponta a tela nova. Continua no filtro do livro |
| Devoluções | Não existia tela | Tela **Almoxarifado → Devoluções**: lista o que já foi devolvido e um formulário que começa pelo **material** |
| Devoluções | Nada ligava a devolução à entrega que a originou | Você escolhe **de qual entrega** está devolvendo, e o sistema mostra quanto daquela entrega ainda pode voltar |
| Devoluções | Devolver mais do que foi entregue passava | Recusado, com a conta na mensagem |
| Devoluções | Devolução de material com lote entrava sem lote e o saldo ficava preso | Lote **herdado da entrega**, ou escolhido na devolução avulsa |
| Devoluções | Devolver peça serializada voltava o saldo sem voltar a peça | A série volta para **Em estoque** |
| Devoluções | Devolver para Sucata baixava o estoque duas vezes | O saldo não muda; o livro mostra Entrada de devolução + Sucata |
| Devoluções | Uma devolução **recusada** deixava registro mesmo assim | Recusa não deixa registro nenhum |

### Regras de negócio e validações — cada uma com o cenário exato para demonstrar

Todas as mensagens abaixo são **as mensagens reais do sistema**, copiadas do código. Se o que
aparecer na tela for diferente, é bug — reporte.

| # | Regra | O que fazer para testar | O que o sistema faz | Mensagem esperada |
|---|---|---|---|---|
| R1 | **Não se devolve mais do que foi entregue** | Material com uma entrega de **10**, da qual já foram devolvidos **4**. Em Devoluções, escolha essa entrega e digite **7** | **Recusa** | `Devolução acima do entregue: a saída 1 entregou 10, já foram devolvidos 4 e restam 6` (o número da saída é o da sua entrega) |
| R2 | **Devoluções parciais somam** — 6 + 5 não cabem em 10, mas 6 + 4 cabem | Devolva **6** da entrega de 10 (passa). Tente **5** (recusa). Devolva **4** (passa) | 1ª e 3ª passam, a 2ª é recusada | a mesma de R1, com `restam 4` |
| R3 | **A tela avisa antes de mandar** | Escolha uma entrega com devolvível 7 e digite **9** | O botão envia, mas a tela **barra antes de chamar o servidor** | toast: `Esta entrega ainda aceita 7 de devolução` |
| R4 | **A entrega já devolvida por inteiro continua aparecendo** — desabilitada | Devolva **tudo** de uma entrega e reabra o formulário nesse material | A linha continua na lista, com "já devolvido por inteiro", e **não é selecionável** | — (esconder faria você procurar uma entrega que o sistema decidiu não mostrar) |
| R5 | **Não se devolve o que foi descartado ou corrigido** | Lance uma **Sucata**, uma **Perda**, um **Ajuste** e uma **Entrada** no material, depois abra Devoluções nele | Nenhum dos quatro aparece na lista de entregas — só as saídas de entrega | — |
| R6 | **Saída estornada não pode ser devolvida** | Estorne uma saída no livro e tente devolvê-la (só alcançável por API — a tela nem a oferece) | **Recusa** | `A saída 12 foi cancelada (estornada) — o estorno já devolveu o material` |
| R7 | **Transferência exige lote em material controlado** | Em Movimentações, tipo **Transferência**, material com "Controle por lote", origem e destino escolhidos, **sem escolher lote** | **Recusa** | `O material MAT-001 exige lote nesta movimentacao (controle por lote ligado)` |
| R8 | **Transferir lote BLOQUEADO ou VENCIDO é PERMITIDO — de propósito** | Bloqueie um lote em "Lotes e Séries". Em Movimentações → Transferência, selecione esse lote e transfira | **Passa.** No seletor de lote da Transferência **todos** os lotes ficam habilitados | — (é assim que um lote reprovado vai parar na área de bloqueados) |
| R9 | **Controle positivo do R8:** numa **Saída**, os mesmos lotes continuam barrados | Mesmo material, mude o tipo para **Saída** e abra o seletor de lote | Lote bloqueado e lote vencido aparecem **desabilitados**, com o motivo | — |
| R10 | **Transferir mais do que existe na origem falha** | Transferência de 50 de uma prateleira que tem 20 | **Recusa** e a origem **não** é debitada | `Saldo insuficiente na localização de origem` |
| R11 | **A transferência não mexe no total do material** | Transfira 8 de A para B e confira o saldo total no Extrato | O total continua igual; muda o **endereço** | — (almoxarifado é área física, não filial — ver "Decisões de negócio") |
| R12 | **Devolução de material com lote precisa dizer de qual lote** | Devolução **avulsa** (sem escolher entrega) num material com "Controle por lote", sem escolher lote | A tela barra antes de enviar | toast: `Material com controle por lote: informe de qual lote é a devolução` |
| R13 | **Com entrega escolhida, o lote vem sozinho** | Escolha uma entrega que saiu do lote L-001 | O campo **Lote (herdado da entrega)** aparece em **modo leitura**, sem seletor | — |
| R14 | **Devolver peça serializada ao estoque exige a série** | Material com "Controle por número de série", devolução de 1 unidade ao **Estoque**, sem marcar série | **Recusa** | `Material com controle de série: informe 1 número(s) de série para 1 unidade(s) devolvida(s) — recebidos 0` |
| R15 | **Sucata de peça serializada é recusada ENSINANDO o caminho** | Mesmo material, marque a série e escolha destino **Sucata** | A tela **não oferece** os checkboxes e mostra o aviso; se forçado por API, o servidor recusa | `Devolução com número de série não é suportada no destino SUCATA. Devolva ao estoque e, em seguida, registre a baixa na tela Movimentações, que tem seletor de série.` |
| R16 | **Sucata de material serializado SEM informar série continua passando** | Mesmo material, destino Sucata, **sem** marcar série nenhuma | **Passa** — a limitação é "não dá para informar a série aí", não "peça com série não pode ir para sucata" | — |
| R17 | **Sucata com lote bloqueado é recusada ANTES de mexer no estoque** | Bloqueie o lote e tente devolver aquela entrega para **Sucata** | **Recusa**, e o saldo do material **não se move** (nem meio movimento) | `Lote L-001 está bloqueado e não pode ser sucateado por devolução. Resolva o status do lote primeiro (tela Lotes e Séries) e repita a devolução.` |
| R18 | **Devolução recusada não deixa registro nem encolhe o devolvível** | Entrega de 10; faça uma devolução de 3 que o sistema **recuse** (R12 serve). Reabra o formulário no mesmo material | A recusa **não** aparece na lista de devoluções, e a entrega continua oferecendo **10** de devolvível (não 7) | — |
| R19 | **Quarentena devolve o físico, não o disponível** | Devolva 6 com condição **Suspeita** / destino **Quarentena** e olhe o Extrato | `quantidade_atual` sobe 6; `Disponível` **não** sobe (fica bloqueado até a inspeção decidir) | — |
| R20 | **Retrabalho não mexe em saldo nenhum** | Devolva com destino **Retrabalho** e confira o Extrato | O saldo fica igual; só entra a linha no livro | — |
| R21 | **A condição SUGERE o destino, não determina** | Escolha condição **Danificada** (destino vira Sucata sozinho) e depois troque o destino para **Retrabalho** | O destino fica **Retrabalho** — a sugestão não desfaz sua escolha | — |
| R22 | **Devolução avulsa continua possível** | Não escolha entrega nenhuma ("Devolução avulsa"), preencha quantidade e motivo | **Passa** — é o caminho para sobra antiga ou material entregue antes do sistema. Sem entrega, não há limite de quantidade nem lote a herdar | — |
| R23 | **Motivo é obrigatório** | Deixe o motivo em branco e envie | A tela barra | toast: `Informe o motivo da devolução` |

### Roteiro de teste manual (Etapa 7)

**A) Transferir um lote entre duas prateleiras**

1. Vá em **Almoxarifado → Movimentações** e clique em **Nova Movimentação**.
2. Escolha um material que tenha **saldo endereçado** em alguma localização e com "Controle por
   lote" ligado. No campo **Tipo**, escolha **Transferência**.
3. Repare que aparecem **os dois** campos de localização ao mesmo tempo — "Localização de origem" e
   "Localização de destino". Entrada mostra só destino, Saída mostra só origem; a transferência é o
   único tipo com os dois.
4. Escolha o lote, a quantidade, a origem e o destino, e salve.
5. Vá em **Almoxarifado → Mapa de Localizações** (ou no **Extrato** do material) e confira: o saldo
   **mudou de endereço**, e o **total do material continua o mesmo** (regra R11).
6. Volte ao livro de movimentações: a linha nova aparece com o badge **Transferência** em
   ciano-petróleo — cor própria, nem verde de entrada nem vermelho de saída, porque a transferência
   não soma nem subtrai.

**B) Transferência sem lote é recusada (regra R7)**

7. Repita o passo 2 no mesmo material controlado, mas **não escolha lote nenhum**. Preencha origem,
   destino e quantidade e salve.
8. O sistema recusa com `O material <código> exige lote nesta movimentacao (controle por lote
   ligado)`. **Esta era a lacuna:** antes da Etapa 7 a transferência passava sem lote, e o saldo
   aparecia na prateleira nova sem dizer de qual lote tinha vindo.

**C) Transferir um lote bloqueado — tem que FUNCIONAR (regra R8)**

9. Vá em **Almoxarifado → Lotes e Séries**, escolha o material e **bloqueie** um lote (informe o
   motivo).
10. Volte em Movimentações → Transferência, mesmo material. Abra o seletor de lote: **todos** os
    lotes estão habilitados, inclusive o que você acabou de bloquear e qualquer um vencido.
11. Transfira 4 desse lote bloqueado. **Passa** — e é isso mesmo: é assim que um lote reprovado é
    levado para a área de bloqueados do galpão.
12. **Controle (regra R9):** troque o tipo para **Saída**, mesmo material. Agora o lote bloqueado e
    o vencido aparecem **desabilitados**, com o motivo ao lado. A guarda de situação vive na saída,
    que é onde ela protege alguma coisa.

**D) Devolver parte de uma entrega**

13. Faça uma **Saída** de 10 unidades de um material (Movimentações → Nova Movimentação → Saída),
    para ter uma entrega para devolver.
14. Vá em **Almoxarifado → Devoluções** (item novo no menu) e clique em **Nova Devolução**.
15. Escolha o **material**. A lista **Entrega de origem** se preenche com as saídas daquele material
    — cada linha mostra data, tipo, quantidade, requisição/OS, quem retirou, lote e **quanto ainda é
    devolvível**.
16. Escolha a entrega de 10, digite quantidade **4**, motivo **Sobra de projeto**, condição **Boa**
    (repare que o destino vira **Estoque** sozinho — regra R21) e registre.
17. Confira o Extrato do material: o saldo **subiu 4**.
18. Abra **Nova Devolução** de novo no mesmo material: a **mesma entrega** reaparece, agora dizendo
    **devolvível 6**.

**E) Tentar devolver mais do que resta (regras R1 e R3)**

19. Ainda na mesma entrega (devolvível 6), digite **9** e envie. A tela barra antes de chamar o
    servidor: `Esta entrega ainda aceita 6 de devolução`.
20. Para ver a mensagem **do servidor**, use uma quantidade que passe pela tela mas não pelo
    servidor — ou simplesmente confie no teste automático: a mensagem é
    `Devolução acima do entregue: a saída N entregou 10, já foram devolvidos 4 e restam 6`. **O
    número tem que estar na mensagem** — mensagem sem número obriga você a adivinhar.

**F) Devolver para Quarentena (regra R19)**

21. Nova devolução no mesmo material, condição **Suspeita** — o destino vira **Quarentena** sozinho.
    Registre 3.
22. No **Extrato** do material: `quantidade_atual` **subiu 3** (o material está fisicamente no
    galpão), mas o **Disponível não subiu** — os 3 estão bloqueados esperando decisão.
23. Vá em **Almoxarifado → Inspeções** para ver o que está retido.

**G) Devolver para Sucata — o saldo NÃO pode mudar (o bug corrigido)**

24. Anote o saldo atual do material.
25. Nova devolução, condição **Danificada** — o destino vira **Sucata** sozinho. Registre 2.
26. **Confira o saldo: tem que estar igual ao do passo 24.** Se tiver caído 2, a correção não está
    no ar.
27. Abra o **livro de movimentações** filtrando por esse material: aparecem **duas** linhas novas —
    uma **Entrada de devolução** e uma **Sucata**, ambas de 2. É assim que o saldo fecha e a sucata
    continua registrada.

**H) Devolver peça com número de série (regras R14, R15, R16)**

28. Escolha um material com "Controle por número de série" que tenha alguma série **Entregue**
    (faça uma Saída com série, se precisar).
29. Em Devoluções, escolha esse material e a entrega. Aparecem **checkboxes com os números de série
    daquela entrega**. Marque um e registre com destino **Estoque**.
30. Vá em **Lotes e Séries → aba Séries** e confira: aquela série voltou para **Em estoque**. Antes
    da Etapa 7 o saldo voltava e a série ficava "Entregue" para sempre.
31. **Agora o caminho de dois passos.** Repita, mas escolha destino **Sucata**: os checkboxes
    **desaparecem** e a tela mostra o aviso explicando que você deve devolver ao Estoque e depois
    baixar em **Movimentações**, que tem seletor de série. Faça isso e confirme que funciona.
32. **Regra R16:** o mesmo material **sem** marcar série nenhuma vai para Sucata normalmente — o que
    não dá é *informar a série* nesse destino.

**I) Devolução avulsa e o lote (regras R12, R13, R22)**

33. Em Devoluções, escolha um material com "Controle por lote" e **não** escolha entrega
    (a opção "Devolução avulsa (sem entrega registrada)"). Preencha quantidade e motivo e envie sem
    escolher lote: `Material com controle por lote: informe de qual lote é a devolução`.
34. Escolha o lote no seletor e registre. Passa.
35. Agora escolha uma **entrega** que tenha saído de um lote: o seletor some e aparece **Lote
    (herdado da entrega)** em modo leitura, com o código do lote. Você não escolhe — o sistema já
    sabe de onde saiu.

**J) O aviso em Movimentações**

36. Vá em Movimentações → Nova Movimentação e abra o campo **Tipo**: **"Devolução" não está mais
    lá**. Embaixo do campo, um aviso explica que devolução de material entregue é registrada na
    **tela de Devoluções**, com link.
37. Feche o modal e olhe o **filtro** do livro: **"Devolução" continua lá**. É de propósito — os
    lançamentos antigos de devolução precisam continuar visíveis e filtráveis.

### Pendências que a Etapa 7 levantou (registradas, não consertadas)

- **⚠️ Ajuste de inventário não acerta o "bloqueado" (achado ao testar esta etapa).** Se um material
  tem 8 unidades **bloqueadas** (quarentena, defeito) e você lança um **Ajuste** levando o total
  para 1, o sistema aceita e fica com `bloqueado (8) > total (1)` — o **Disponível fica negativo** e
  **nada avisa**. É plausível no dia a dia: a contagem acha menos do que o sistema dizia, e parte do
  que existia estava retida. **Não foi consertado porque a decisão é sua**, e as três respostas são
  defensáveis: (1) o Ajuste baixa o bloqueado junto; (2) o Ajuste é **recusado** enquanto houver
  retenção maior que o total pretendido; (3) o Ajuste passa e apenas **avisa**. Hoje o
  comportamento é o (3) **sem o aviso**, que é a pior das três. Enquanto isso: **resolva a
  quarentena antes de lançar um ajuste que reduz o total**.
- **Estado parcial na devolução para Sucata, sem notificação.** O destino Sucata lança duas
  movimentações; se a segunda falhar depois de a primeira ter entrado, a devolução fica registrada
  como **estado parcial** na auditoria e a resolução é **manual** — estornar a Entrada de devolução
  órfã pela tela de **Movimentações**. **Ninguém é notificado**: descobrir depende de alguém abrir a
  auditoria. É o cenário mais raro possível (as validações de lote e de série rodam antes,
  justamente para impedir isso), mas fica registrado em vez de implícito.
- **Sucata/Retrabalho de peça serializada exige dois passos** (devolver ao Estoque, depois baixar em
  Movimentações). É limitação **declarada**, não bug — ver a regra R15.

### O que a Etapa 7 **não** cobre

- **"Em trânsito" foi CORTADO por decisão sua, não esquecido.** O plano original previa
  transferência com estados (solicitada → aprovada → **em trânsito** → recebida → confirmada), com
  o material não disponível nem na origem nem no destino enquanto estivesse a caminho. Como os
  almoxarifados são **áreas físicas do mesmo site** e existe **uma filial só**, alguém pega a caixa
  e leva na hora: não há janela em que o material esteja "a caminho". Se um dia houver obra externa
  ou um segundo prédio, o item volta.
- **Aprovação de transferência, e-mail de transferência e alerta "transferência não recebida"** —
  saíram junto com o trânsito (os dois últimos pressupõem que exista trânsito).
- **Série na transferência.** A série continua mostrando a **localização antiga** depois de uma
  transferência. Não há perda de saldo nem de rastreabilidade da peça — só o endereço da série fica
  desatualizado. O saldo real, que a transferência move corretamente, mora em outro lugar.
- **Série no descarte de devolução** (Sucata/Retrabalho) — caminho de dois passos, ver R15.
- **Fotos/anexos da devolução** — não implementado.
- **Devolução ao fornecedor** — é fluxo próprio, com documento fiscal e contraparte externa; não é
  "a mesma devolução com outro destino".
- **Estorno de custo de projeto** quando o material volta — depende da integração de custos.
- **Tipos de devolução por origem** (de ferramenta, de cliente) — dependem das features 16 e 13.
- **A quarentena da devolução não entra na fila formal de inspeção.** Devolver com destino
  Quarentena bloqueia o saldo corretamente, mas não cria o item de inspeção com recebimento de
  origem que a tela de Inspeções usa.

---

## Etapa 8 — Materiais de Clientes (ENTREGUE — 2026-08-12)

Quando um cliente manda a chapa dele para a GMP industrializar, esse material **não é nosso** — mas
está no nosso galpão, ocupa nossa prateleira e é aplicado no trabalho dele. Até agora o sistema
tratava isso como uma **lista à parte**: uma tabela separada, com a descrição em **texto livre**,
sem número de lote, sem número de série, sem endereço, sem extrato, sem etiqueta e **fora do motor
de estoque** — ou seja, sem nada do que as Etapas 1 a 7 construíram, e justamente o que
industrializar material de terceiro exige (certificado, corrida, rastro de quem aplicou onde).

Pior: **nada impedia usar a chapa do Cliente A no equipamento do Cliente B**. E não havia tela
nenhuma — a lista à parte nunca teve interface para alimentá-la.

A Etapa 8 unificou: **material de cliente virou material normal com dono**. Tudo o que vale para o
nosso material passa a valer para o dele, com quatro travas novas que só existem para material de
cliente.

> **A Etapa 8 cobre CLIENTES, não terceiros.** Material que a GMP **envia** para um fornecedor
> beneficiar (corte, dobra, galvanização) é a feature 14 e virou a **Etapa 8b** — ainda não foi
> feita. As duas coisas são opostas: aqui o material de **outro** está **conosco**; lá o material
> **nosso** está com **outro**.

### O que mudou

| Onde | Antes | Agora |
|---|---|---|
| Materiais (ficha) | Não havia como dizer que um material é de um cliente | Seção **Propriedade**: escolhe o proprietário, ou **"GMP (estoque próprio)"**. Sem escolher, o material é nosso |
| Materiais / Movimentações / Extrato | Nada distinguia a chapa do cliente da nossa | **Selo com o nome do cliente** ao lado do material, nas três telas |
| Movimentações (saída) | A chapa do Cliente A saía para o projeto do Cliente B sem um pio | **Recusa**, e a mensagem **nomeia os dois clientes** — o dono e o do vínculo |
| Movimentações (saída emergencial) | O emergencial liberava qualquer saída sem vínculo | Material de cliente **não aceita** saída emergencial. É a única exceção deliberada ao padrão do módulo |
| Movimentações (ajuste) | Qualquer ALMOXARIFE zerava o saldo da chapa do cliente, pelas **duas** rotas | Exige a permissão **`ajustar_material_cliente`** — só ADMINISTRADOR —, com auditoria nomeando o cliente. Ajuste de material **nosso** não mudou |
| Recebimentos | Material de cliente entrava sem documento nenhum | Item de material de cliente **exige o número da nota** (nota de remessa) — e a recusa vale para **a nota inteira**. Material nosso continua entrando sem nota |
| Dashboard / Relatórios / Compras | O material do cliente contava no **valor total do estoque**, e o sistema **abriria pedido de compra** para repor chapa de outra empresa | Fica **fora** de: valor total, materiais críticos, materiais zerados, reposição de mínimo, sugestão de compra, alerta de estoque baixo e relatório de posição |
| Mapa de Localizações / Materiais bloqueados | — | **Continua aparecendo — de propósito.** A chapa do cliente ocupa a prateleira de verdade e é bloqueada de verdade; escondê-la faria a tela mentir sobre o galpão |
| Materiais de Clientes | Não existia tela | Tela nova: escolhe o cliente → recebido, consumido, devolvido, saldo e saldo disponível por material, mais em quais **OS/projetos** foi aplicado. **PDF de posição** e botão **Devolver ao cliente** |
| Devolver ao cliente | Não existia | Tipo de movimento novo **Devolução ao cliente** (é **saída** — o material sai do prédio de volta para o dono), com **número do documento obrigatório** |
| (interno) | A lista à parte tinha rotas de gravação que **escapavam de todas essas travas** | As rotas e o serviço antigos foram removidos. **A tabela ficou** — nenhuma linha foi apagada |

### Regras de negócio e validações — cada uma com o cenário exato para demonstrar

Todas as mensagens abaixo são **as mensagens reais do sistema**, copiadas do código. Se o que
aparecer na tela for diferente, é bug — reporte.

Para o roteiro usaremos sempre os mesmos nomes: **Cliente Alfa LTDA** e **Cliente Beta SA**, com o
material **CHP-002** (Chapa 3mm) pertencente ao **Alfa**, e **MAT-001** como material nosso de
controle.

| # | Regra | O que fazer para testar | O que o sistema faz | Mensagem esperada |
|---|---|---|---|---|
| C1 | **Material de cliente só é aplicado em trabalho do próprio cliente** | Em **Movimentações → Nova Movimentação**, material **CHP-002**, tipo **Saída para Produção**, quantidade 10, e no vínculo escolha um **projeto do Cliente Beta SA** | **Recusa** (400), **nomeando os dois** | `Material CHP-002 pertence ao cliente Cliente Alfa LTDA, mas o projeto Projeto Beta e do cliente Cliente Beta SA. Material de cliente so pode ser aplicado em trabalho do proprio dono — troque o vinculo, ou use o material equivalente do estoque proprio.` |
| C2 | **Sem OS nem projeto também não sai** | Mesma saída, **sem escolher** OS nem projeto | **Recusa** | `Material CHP-002 pertence ao cliente Cliente Alfa LTDA e so pode sair com OS ou projeto DESSE cliente. Informe a OS ou o projeto de Cliente Alfa LTDA.` |
| C3 | **Projeto interno (sem cliente) não é coringa** | Mesma saída, escolhendo um projeto **sem cliente** (projeto interno da GMP) | **Recusa** — "nenhum cliente" não vira "qualquer cliente" | a mensagem de C1, com `e do cliente nenhum cliente` |
| C4 | **⚠️ A saída EMERGENCIAL também é recusada — é a exceção deliberada** | Mesma saída de C1, agora marcando **"Saída emergencial"** e escrevendo a justificativa | **Recusa mesmo assim.** Em todo o resto do módulo o emergencial libera a saída sem vínculo; aqui **não** | `Material CHP-002 pertence ao cliente Cliente Alfa LTDA: saida emergencial nao e permitida para material de terceiro. O emergencial regulariza o vinculo depois, e material de cliente exige saber na hora em qual OS ou projeto DESSE cliente ele foi aplicado. Informe a OS ou o projeto do proprio cliente.` |
| C5 | **Controle positivo de C1-C4: no projeto do dono, sai normalmente** | Mesma saída, agora com um **projeto do Cliente Alfa LTDA** | **Passa**, e o saldo baixa | — |
| C6 | **Controle positivo do dono: material NOSSO não é afetado** | Saída de **MAT-001** (nosso) para o projeto do **Cliente Beta SA** | **Passa.** A guarda é sobre o dono do **material**, não sobre o cliente do vínculo | — |
| C7 | **Ajustar saldo de material de cliente exige permissão própria** | Com um usuário de perfil **GESTOR** (que ajusta o estoque próprio normalmente), lance um **Ajuste** em **CHP-002** | **Recusa com 403** | `Ajustar o saldo do material CHP-002, que pertence ao cliente Cliente Alfa LTDA, exige a permissao "ajustar_material_cliente" (seu perfil: GESTOR). Ajustar estoque de terceiro mexe no numero que o cliente vai cobrar.` |
| C8 | **A trava do ajuste vale nas DUAS rotas de movimentação** | Repita C7 pelo modal rápido de entrada/saída da tela de **Materiais** (a rota antiga) | **Recusa igual.** A checagem mora no motor, não na rota — travar só uma delas deixaria a outra aberta | a mesma de C7 |
| C9 | **Controle positivo de C7: ALMOXARIFE continua ajustando material NOSSO** | Mesmo usuário barrado em C7 (ou um ALMOXARIFE), lance um Ajuste em **MAT-001** | **Passa.** Só muda o dono do material entre os dois testes | — |
| C10 | **Todo ajuste de material de cliente fica auditado nomeando o cliente** | Faça o ajuste como ADMINISTRADOR e abra a auditoria | Fica registrado quem ajustou, o quanto, a justificativa **e a razão social do proprietário** | — |
| C11 | **Recebimento de material de cliente exige número de documento** | Crie um recebimento com um item de **CHP-002**, deixe o campo de **nota** em branco e clique em processar | **Recusa a nota inteira** — nenhum item entra | `Nao foi possivel dar entrada no estoque: CHP-002: material do cliente Cliente Alfa LTDA exige numero de documento (nota de remessa) para dar entrada` |
| C12 | **Documento em branco conta como ausente** | O mesmo com o campo preenchido só com **espaços** | **Recusa igual** | a mesma de C11 |
| C13 | **Controle positivo de C11: material NOSSO continua entrando sem nota** | Recebimento só com **MAT-001**, sem nota | **Passa** — travar isso para todo mundo quebraria todo recebimento do módulo | — |
| C14 | **Devolver ao cliente exige o número do documento de devolução** | Em **Materiais de Clientes**, escolha o Alfa, clique em **Devolver** na linha do CHP-002, informe 10 e **deixe o documento em branco** | A tela barra antes de enviar; forçado por API, o servidor recusa | toast: `Informe o número do documento de devolução` · servidor: `Dados inválidos — documento_devolucao: informe o numero do documento de devolucao` |
| C15 | **Devolução ao cliente só existe para material COM dono** | Force uma devolução ao cliente de **MAT-001** (material nosso) | **Recusa** | `O material MAT-001 nao pertence a nenhum cliente — nao ha para quem devolver. Para tirar material proprio do estoque use Movimentacoes (saida, sucata ou perda).` |
| C16 | **Com o documento preenchido, a devolução baixa o saldo** | Repita C14 informando o documento | **Passa.** O saldo do CHP-002 baixa e a linha **Devolução ao cliente** aparece no extrato do material | — |
| C17 | **Devolver ao cliente NÃO exige OS nem projeto** | A mesma devolução, sem informar vínculo nenhum | **Passa** — o destino é o próprio dono, exigir a OS dele para devolver a ele não faria sentido | — |
| C18 | **O material do cliente não entra em NENHUM número do estoque próprio** | Anote o **Valor total do estoque** no Dashboard. Dê entrada de **100 PC** de CHP-002 com custo R$ 25 (nota preenchida). Volte ao Dashboard | **Nenhum número muda:** nem valor total, nem materiais críticos, nem materiais zerados. E o relatório de **posição de estoque** também não | — |
| C19 | **O sistema não pede para comprar material que não é nosso** | Ponha o CHP-002 abaixo do estoque mínimo e rode a verificação de mínimos / veja a sugestão de compra | **Não aparece.** Antes, o sistema chegaria a **abrir uma solicitação de compra para repor a chapa de outra empresa** | — |
| C20 | **Nem manda alerta de estoque baixo dele** | Mesmo material abaixo do mínimo, com alertas configurados | **Nenhum alerta sai** para material de cliente. "Acabando, compre mais" sobre chapa de terceiro é o alerta errado para a pessoa errada | — |
| C21 | **Controle positivo de C18-C20: material NOSSO abaixo do mínimo continua sendo cobrado** | Ponha o **MAT-001** abaixo do mínimo e repita C19 e C20 | **Aparece** na sugestão de compra e **dispara** o alerta. Sem esta metade, um filtro escrito errado que zerasse tudo pareceria estar segregando | — |
| C22 | **Mas o material do cliente APARECE na ocupação de prateleira — de propósito** | Endereça o CHP-002 numa localização e abra o **Mapa de Localizações** | A quantidade dele **conta** na ocupação daquela posição. Escondê-la faria o mapa mentir sobre o que está fisicamente lá | — |
| C23 | **E APARECE no relatório de materiais bloqueados — de propósito** | Bloqueie parte do CHP-002 e abra o relatório de materiais bloqueados | **Aparece.** É relatório de **qualidade**: material de cliente bloqueado é exatamente o que o almoxarife precisa ver | — |
| C24 | **O selo diz DE QUAL cliente, nas três telas** | Abra **Materiais**, depois **Movimentações**, depois o **Extrato** do CHP-002 | Nas três, ao lado do material, o selo **"Cliente Alfa LTDA"** — não um rótulo genérico. Passando o mouse, o aviso: *não entra no estoque próprio e só sai com OS ou projeto desse cliente* | — |
| C25 | **Controle positivo do selo: material nosso não tem selo** | Olhe a linha do **MAT-001** nas mesmas três telas | **Sem selo nenhum.** Um selo pintado em toda linha não identificaria coisa alguma | — |
| C26 | **Material de cliente aceita lote e série como qualquer outro** | Ligue "Controle por lote" e "Controle por número de série" no CHP-002 e receba uma nota dele | Lote e série funcionam igual ao material nosso — **é o ganho central da unificação** | — |
| C27 | **As rotas da lista antiga não existem mais** | Chame `GET`/`POST /api/almoxarifado/materiais-cliente` ou `POST /materiais-cliente/:id/consumir` | **404.** Enquanto vivas, eram um caminho paralelo que **escapava de todas as travas acima** | — |

### Roteiro de teste manual (Etapa 8)

**Preparação (uma vez):** tenha dois clientes cadastrados — chame-os de **Cliente Alfa LTDA** e
**Cliente Beta SA** — e ao menos **um projeto de cada**. A guarda do dono lê o `cliente_id` do
projeto/OS, então sem os dois projetos não dá para demonstrar a recusa.

**A) Cadastrar a chapa do cliente**

1. **Almoxarifado → Materiais → Novo Material**. Preencha código `CHP-002`, nome "Chapa 3mm",
   unidade, custo unitário R$ 25.
2. Role até a seção **Propriedade** e escolha **Cliente Alfa LTDA**. (Deixar em "GMP — estoque
   próprio" é o padrão: material sem proprietário é nosso.)
3. Salve e volte à lista de Materiais. A linha do CHP-002 aparece com o **selo "Cliente Alfa
   LTDA"** (regra C24). A linha de um material nosso, logo ao lado, **não tem selo** (C25).

**B) Receber a chapa — sem nota não entra (C11)**

4. **Almoxarifado → Recebimentos → Novo**. Acrescente o item CHP-002 com 100 PC. **Deixe o campo
   de nota fiscal em branco** e clique em processar.
5. O sistema **recusa a nota inteira** com a mensagem de C11, nomeando o cliente. Nenhum item entra.
6. Tente de novo com o campo de nota preenchido só com **espaços** — recusa igual (C12).
7. Preencha o número da nota de remessa de verdade e processe. Agora **entra**, e o saldo do
   CHP-002 vira 100.
8. *(Controle positivo, C13)* Repita um recebimento só com material **nosso**, sem nota: **passa**.
   A trava é do material de cliente, não do recebimento.

**C) O número do estoque próprio não se mexeu (C18, C19, C20)**

9. Antes do passo 7 você anotou o **Valor total do estoque** no Dashboard? Volte lá agora. Os 100
   PC × R$ 25 = **R$ 2.500 do cliente NÃO entraram** no total. "Materiais críticos" e "Materiais
   zerados" também não mudaram por causa dele.
10. Abra o relatório de **posição de estoque**: o CHP-002 **não está lá**.
11. Baixe o CHP-002 para abaixo do estoque mínimo e rode a verificação de mínimos: **nenhuma
    solicitação de compra é criada** para ele (C19), e **nenhum alerta** sai (C20).
12. *(Controle positivo, C21)* Faça o mesmo com um material **nosso** abaixo do mínimo: a
    solicitação **é** criada e o alerta **sai**. Se os dois sumissem, o filtro estaria zerando a
    leitura em vez de segregar — e é exatamente esse o erro que este passo pega.

**D) A trava que mais importa: a chapa do Alfa no projeto do Beta (C1)**

13. **Almoxarifado → Movimentações → Nova Movimentação**. Material CHP-002, tipo **Saída para
    Produção**, quantidade 10.
14. No vínculo, escolha um **projeto do Cliente Beta SA**. Salve.
15. O sistema **recusa**, e a mensagem **nomeia os dois clientes** — o dono da chapa e o cliente do
    projeto. Sem os dois nomes você teria de adivinhar qual das pontas está errada.
16. Tire o vínculo e tente salvar sem OS nem projeto: recusa de novo, agora dizendo qual cliente
    informar (C2).
17. Escolha um projeto **interno** (sem cliente): recusa também — "nenhum cliente" não libera (C3).

**E) A exceção que surpreende: nem o emergencial passa (C4)**

18. Mesma saída do passo 13-14, agora marque **"Saída emergencial"** e escreva a justificativa.
19. **Continua recusando.** Em todo o resto do módulo, o emergencial libera a saída sem vínculo e
    marca "pendente de regularização" — **aqui não**. O emergencial existe para urgência no
    **nosso** estoque, onde dá para regularizar depois; consumir material de outra empresa sem
    dizer onde é problema **contratual**, não de pressa.
20. Agora troque o vínculo para um **projeto do Cliente Alfa LTDA** e salve: **passa** (C5), o
    saldo baixa e a aplicação passa a aparecer na tela de Materiais de Clientes.
21. *(Controle positivo, C6)* Faça uma saída de material **nosso** para o projeto do **Beta**:
    **passa**. A trava é sobre o dono do material, não sobre o cliente do vínculo.

**F) Ajustar o saldo do cliente exige permissão própria (C7-C9)**

22. Entre com um usuário de perfil **GESTOR** — que ajusta o estoque próprio normalmente — e lance
    um **Ajuste** no CHP-002. **403**, com a mensagem de C7 dizendo o seu perfil.
23. Repita pelo **modal rápido de entrada/saída da tela de Materiais** (a rota antiga): **recusa
    igual** (C8). A checagem mora no motor; travar só uma das rotas deixaria a outra aberta — e
    era exatamente por essa porta que um ALMOXARIFE zerava o saldo da chapa do cliente antes.
24. *(Controle positivo, C9)* Com o mesmo usuário, ajuste um material **nosso**: **passa**.
25. Entre como **ADMINISTRADOR** e faça o ajuste no CHP-002: passa, e a auditoria registra o
    ajuste **nomeando o cliente proprietário** (C10).

**G) A tela nova: Materiais de Clientes**

26. **Almoxarifado → Materiais de Clientes**. Escolha **Cliente Alfa LTDA** no seletor.
27. Confira a tabela: **recebido**, **consumido**, **devolvido**, **saldo** e **saldo disponível**
    por material, e abaixo as **aplicações** — em quais OS/projetos o material do Alfa foi usado.
28. Troque para **Cliente Beta SA**: os números do Alfa **somem** e aparecem os do Beta. Nenhum
    material do Alfa pode aparecer aqui.
29. Clique em **PDF de posição**: baixa o documento com a posição do cliente escolhido (gerado no
    navegador, como as etiquetas da Etapa 6c).

**H) Devolver ao cliente (C14-C17)**

30. Na linha do CHP-002, clique em **Devolver**. Informe a quantidade e **deixe o documento em
    branco**: a tela barra com `Informe o número do documento de devolução` (C14).
31. Preencha o número do documento de devolução e confirme: **passa**, o saldo baixa (C16).
32. Abra o **Extrato** do CHP-002: a linha **Devolução ao cliente** está lá, com o documento.
    Repare que **não foi pedida OS nem projeto** (C17) — o destino é o próprio dono.
33. **Não confunda com a tela Devoluções da Etapa 7.** Lá o material **volta** para o estoque
    (entrada, vindo do chão de fábrica); aqui ele **sai** do prédio de volta para quem é dele.

**I) O que continua aparecendo — e é assim de propósito (C22, C23)**

34. Endereça o CHP-002 numa prateleira e abra o **Mapa de Localizações**: a quantidade dele
    **conta** na ocupação daquela posição. A chapa está fisicamente lá; escondê-la faria o mapa
    mentir sobre o galpão.
35. Bloqueie parte do CHP-002 e abra o relatório de **materiais bloqueados**: ele **aparece**. É
    relatório de qualidade — material de cliente bloqueado é exatamente o que o almoxarife precisa
    ver. **O que evita a confusão é o selo, não esconder o material.**

### ⚠️ O que fazer ANTES de subir a Etapa 8 para produção

**1. Saiba que a conferência de inventário escapa da permissão nova.** Concluir uma conferência de
estoque com **"aplicar ajustes"** grava o `quantidade_atual` do material por um **caminho antigo,
fora do motor** — e portanto **fora** da permissão `ajustar_material_cliente`. O gate daquela tela é
`ajustar_estoque` (ADMINISTRADOR/GESTOR).

> **Consequência prática, e ela é real:** um GESTOR barrado no passo F/22 acima consegue **mudar o
> mesmo saldo** pela conferência de inventário, sem a autorização especial e sem a auditoria que
> nomeia o cliente. **Não é hipótese** — foi confirmado por dois revisores independentes durante a
> etapa. Não foi corrigido porque fechar isso significa reescrever a aplicação de ajustes da
> conferência para passar pelo motor, o que é uma etapa por si. **Enquanto isso: trate a conclusão
> de conferência com ajustes como operação de ADMINISTRADOR quando houver material de cliente
> envolvido**, e confira a posição do cliente depois de cada conferência.
>
> É a mesma família da pendência já registrada em "Ajuste de inventário homologado pode
> *evaporar*", no fim deste guia — os dois se resolvem pelo mesmo conserto.

**2. Confirme que a tabela antiga está vazia em produção.** A lista à parte de materiais de cliente
foi aposentada (as rotas de gravação saíram, porque enquanto vivas escapavam de todas as travas
desta etapa), mas a medição de "0 linhas" cobriu **só o banco de desenvolvimento**. **A tabela foi
preservada de propósito — nenhuma linha foi apagada.** Rode no banco de **produção**:

```sql
SELECT COUNT(*) AS total,
       SUM(CASE WHEN ativo = 1 THEN 1 ELSE 0 END) AS ativos
  FROM materiais_cliente_almoxarifado;
```

- **`total = 0`** → nada a fazer. Registre o número e a data na spec 13
  (`specs/modulo-almoxarifado/13-materiais-clientes/README.md`, seção "⚠️ PENDENTE — confirmar
  produção") e marque a pendência como fechada. A tabela continua existindo mesmo assim — só um
  `DROP` deliberado a remove, e ele **não** faz parte da Etapa 8.
- **`total > 0`** → **não é motivo para reverter nada**, e nada foi perdido. Mas passa a ser dado
  real sem migração: leia esse dado por **SQL direto** na tabela (que continua lá) e planeje uma
  **migração assistida** antes de qualquer `DROP` — cada linha vira um material com
  `proprietario_cliente_id` mais a movimentação de entrada correspondente. É assistida e não
  automática porque a descrição da tabela antiga é texto livre sem chave, então não há como casar
  com material existente sozinho.

### Pendências que a Etapa 8 levantou ou herdou (registradas, não consertadas)

- **⚠️ A conferência de inventário ajusta fora do motor** (item 1 acima) — a mais importante desta
  etapa para quem apresenta o sistema.
- **Os relatórios que misturam continuam sem selo.** Os relatórios de **materiais bloqueados** e de
  **materiais sem endereço** mostram material de cliente junto com o nosso (e isso é o correto, ver
  C22/C23), mas **não trazem o selo** — ele foi entregue nas três telas operacionais (Materiais,
  Movimentações, Extrato). É decisão declarada, não esquecimento: fica para quem fechar a feature.
- **Da Etapa 7, continuam abertas as duas:** (a) **Ajuste de inventário não acerta o "bloqueado"**
  — material com 8 bloqueadas e um Ajuste levando o total para 1 fica com Disponível **negativo**,
  sem aviso; a decisão é de negócio e está esperando você; (b) **estado parcial na devolução para
  Sucata, sem notificação** — resolução manual pela auditoria. Ambas detalhadas na seção da Etapa 7.

### O que a Etapa 8 **não** cobre

- **Materiais enviados a terceiros** (a chapa **nossa** que vai para o fornecedor beneficiar) —
  é a feature 14 e virou a **Etapa 8b**, **entregue no mesmo dia** (ver a seção "Etapa 8b" logo
  abaixo). O que continua fora é a **transformação** (chapa → peças cortadas), que é a Etapa 8c.
- **E-mails específicos de material de cliente** (avisar gestor do projeto, comercial, engenharia)
  — feature 19.
- **Sobras vinculadas ao proprietário** — o retalho que sobra da chapa do cliente ainda não fica
  amarrado a ele; depende da tela de retalhos, feature 15.
- **Relatórios de perdas, não conformes e reservados por cliente**, e **valorização** (custo) por
  cliente — o PDF de posição traz **quantidades**, não valor. Feature 21.
- **Fluxo de aprovação do ajuste** (solicitar → pendente → alguém aprova → efetivar). O que entrou
  foi **permissão dedicada**, que é imediata. O fluxo assíncrono é máquina de estados com tela de
  pendências e notificação — feature 06.
- **Comprovante de devolução ao cliente em PDF.** A devolução em si existe; o documento impresso
  dela não. O único PDF da etapa é o de **posição por cliente**.
- **Seleção de cliente na movimentação.** O dono vem da **linha do material**, não de um seletor na
  hora do lançamento — é assim de propósito: a chapa do Cliente X tem certificado e corrida
  próprios e não pode ser trocada pela do Cliente Y, então são duas linhas de catálogo.

> **Correção declarada (2026-08-12):** o primeiro item desta lista dizia *"Materiais enviados a
> terceiros … Nada dela existe hoje"*. Isso **envelheceu no mesmo dia** — a Etapa 8b foi entregue
> logo depois e o ciclo de remessa e retorno existe. O item foi corrigido acima em vez de apagado,
> porque a afirmação chegou a ser verdadeira e alguém pode tê-la lido.

---

## Etapa 8b — Remessas a Terceiros (ENTREGUE — 2026-08-12)

**O que é:** o material **nosso** (ou do cliente) que sai do prédio para alguém beneficiar — corte,
dobra, usinagem, tratamento, pintura, galvanização — e depois volta. É o **oposto** da Etapa 8: lá
o material de **outro** estava **conosco**; aqui o material fica **fora**, e continua sendo nosso.

**Não confundir com as duas telas vizinhas:**

| Tela | O material está... | Etapa |
|---|---|---|
| **Devoluções** | voltando **para** o estoque, vindo do chão de fábrica | 7 |
| **Materiais de Clientes** | **aqui**, mas é de outro dono | 8 |
| **Remessas a Terceiros** | **fora do prédio**, e é nosso (ou de um cliente nosso) | **8b** |

### Antes → Agora

| Antes | Agora |
|---|---|
| Chapa que vai galvanizar **some do controle**: ou baixa que apaga o patrimônio, ou nenhuma baixa e o sistema mente sobre a prateleira | Sai do **disponível** e **continua no total**, com documento, terceiro e prazo |
| Não existia tela, tabela nem rota — a feature 14 estava vazia | Tela **Almoxarifado → Remessas a Terceiros**, com criar / enviar / receber retorno / encerrar / cancelar |
| Não havia como saber o que está em cada terceiro | Lista com o terceiro, o serviço, o prazo e o status; filtro por status; e selo vermelho **Vencida** quando o prazo passou e ainda há material lá fora |
| Retorno parcial não existia | Vários retornos por remessa, com teto que soma o que já voltou, **por item** |
| O que não voltava ficava indefinido para sempre | Encerrar exige **destino** (Perda no terceiro / Consumido no processo) + justificativa, e dá **baixa de verdade** |
| A contagem de inventário cobraria material que está a 40 km | O esperado da conferência **já vem descontado** — e bloqueado/quarentena **continuam** sendo contados |
| Não havia documento para acompanhar o material | **PDF da remessa**, com o terceiro, os itens e **duas linhas de assinatura** |
| Nada registrava que a chapa de um **cliente** saiu do prédio para beneficiar | A remessa registra o proprietário e o **PDF nomeia o cliente** |

### Tabela consolidada — Etapa 8b

| Onde | O que fazer | O que acontece |
|---|---|---|
| Almoxarifado → Remessas a Terceiros | **Nova remessa** | Escolhe terceiro (cadastrado em Compras **ou** nome digitado), tipo de serviço, prazo previsto, e acrescenta itens (material + quantidade + peso). Nasce **ABERTA** — nada saiu do estoque ainda |
| Linha da remessa ABERTA | **Enviar** | O saldo é **retido**: sai do disponível, o total não muda. Vira **ENVIADA**. Recusa a remessa **inteira** se algum material não couber |
| Linha ENVIADA / RETORNO PARCIAL | **Registrar retorno** | Escolhe o item, a quantidade e (opcional) a nota fiscal do retorno. Vira **RETORNO PARCIAL** — ou **ENCERRADA** direto, se não sobrou nada |
| Linha ENVIADA / RETORNO PARCIAL | **Encerrar** | Se sobrou saldo lá fora, **exige destino + justificativa**; se não sobrou, encerra sem perguntar |
| Linha ABERTA / ENVIADA / RETORNO PARCIAL | **Cancelar** | Exige motivo. Devolve ao disponível **só o que ainda estava lá fora** (se ainda não foi enviada, não mexe em saldo nenhum) |
| Remessa aberta na tela | **PDF da remessa** | Baixa o documento no navegador |
| Almoxarifado → Conferência de inventário | Abrir uma conferência | O **esperado** de cada material já vem **sem** o que está no terceiro |

### Roteiro de teste manual (Etapa 8b)

Faça na ordem — cada passo depende do anterior. Use um usuário **ADMINISTRADOR** ou
**ALMOXARIFE** (só esses dois perfis têm a ação `remessar_terceiro`).

**Preparação.** Em **Materiais**, escolha (ou crie) dois materiais com saldo: `CHP-3MM` com **100
PC** e `MAT-002` com **5 UN**. Anote o **Disponível** dos dois.

1. **Abrir a tela.** Menu **Almoxarifado → Remessas a Terceiros**. A tela abre com a lista vazia
   ("Nenhuma remessa a terceiros") e os botões **Nova remessa**, **PDF da remessa** (desabilitado,
   porque nenhuma remessa está aberta) e **Atualizar**.
2. **Criar a remessa com dois itens.** Clique em **Nova remessa**. Preencha **Nome do terceiro** =
   `Galvanizadora Sul LTDA`, **Tipo de serviço** = `Galvanização`, **Prazo previsto de retorno** =
   uma data futura. Acrescente o item `CHP-3MM` com quantidade **30** e o item `MAT-002` com
   quantidade **50** (mais do que ele tem — é de propósito). Confirme. A remessa aparece na lista
   como **ABERTA**.
3. **Tentar enviar e ver a recusa da remessa INTEIRA.** Clique em **Enviar** na linha da remessa. O
   sistema recusa com:
   > `Nao foi possivel enviar a remessa REM-…: MAT-002: disponivel 5 UN, a remessa pede 50`

   **Agora volte a Materiais e confira o que mais importa:** o disponível do `CHP-3MM` **continua
   100**. Nem o item que caberia saiu. É esse o ponto — o operador corrige a linha que falta e
   reenvia, em vez de descobrir depois que metade da remessa saiu.
4. **Duas linhas do mesmo material que juntas estouram.** *(Opcional, mas é a regra que mais custou
   a acertar.)* Crie outra remessa com **duas linhas de `CHP-3MM`, de 60 cada** — é caso normal, uma
   por lote. Envie:
   > `Nao foi possivel enviar a remessa REM-…: CHP-3MM: disponivel 100 PC, a remessa pede 120 em 2 linhas`

   Repare no **"em 2 linhas"**: sem ele, você olharia uma linha de 60, veria 100 disponíveis e
   concluiria que o sistema está errado.
5. **Corrigir e enviar de verdade.** Clique em **Nova remessa** e monte de novo, agora **só** com
   `CHP-3MM` × **30** (a remessa criada no passo 2 não tem edição de itens depois de salva — o
   caminho é criar a certa e **Cancelar** a errada, que estando ABERTA não mexe em saldo nenhum).
   Clique em **Enviar** na remessa nova. O status vira **ENVIADA**.
6. **Conferir o efeito no saldo — o ponto central da etapa.** Abra **Materiais** e procure o
   `CHP-3MM`: o **total continua 100** e o **Disponível é 70**. Confirme pela porta dos fundos: em
   **Movimentações**, lance uma **Saída** de **80** desse material. O sistema recusa com:
   > `Saldo insuficiente. Disponível: 70 UN`
7. **A contagem de inventário não cobra o que está no terceiro.** Abra **Almoxarifado →
   Conferência de inventário** e crie uma conferência nova. Procure o `CHP-3MM`: o **esperado é
   70**, não 100. Conte **70** → a **divergência é zero**.
   *Antes desta etapa isso acusaria −30*, e o instinto seria "corrigir" o saldo para menos de
   material que existe e vai voltar.
8. **O controle da regra anterior — bloqueado e quarentena CONTINUAM sendo contados.** Num outro
   material, bloqueie parte do saldo (tela de Movimentações ou Inspeções) e abra uma conferência: o
   esperado dele é o **total cheio**, sem descontar o bloqueado. Aquele material **está** na
   prateleira e tem de ser contado. Só o que está no terceiro sai da contagem.
9. **Registrar um retorno parcial.** Volte a Remessas, clique em **Registrar retorno** na remessa
   ENVIADA. Escolha o item, quantidade **20**, e confirme. O status vira **RETORNO PARCIAL**. Abra a
   remessa: a coluna **Retornado** mostra 20 e **Ainda no terceiro** mostra 10. Em Materiais, o
   disponível subiu para **90**.
10. **Tentar receber de volta mais do que saiu.** Clique em **Registrar retorno** de novo e peça
    **40**:
    > `Retorno acima do enviado: o item CHP-3MM enviou 30 PC, ja retornaram 20 e ainda estao no terceiro 10 — este recebimento pede 40`

    A mensagem dá os quatro números de propósito: sem eles você teria de adivinhar quanto ainda pode
    receber.
11. **Tentar encerrar deixando saldo lá fora, sem dizer para onde foi.** Clique em **Encerrar** e
    confirme **sem escolher destino**:
    > `A remessa REM-… tem 10 PC que nunca voltaram (CHP-3MM: 10 PC). Para encerrar, informe o destino desse saldo: PERDA_NO_TERCEIRO ou CONSUMIDO_NO_PROCESSO, mais a justificativa.`

    A mensagem nomeia **a quantidade real que sobrou**, não um "informe o destino" seco.
12. **Encerrar com destino, e ver o saldo em terceiros zerar.** No mesmo modal, escolha **Destino do
    saldo que não voltou** = `Perda no terceiro`, escreva a justificativa e confirme. A remessa vai
    para **ENCERRADA**. Em **Materiais**, o `CHP-3MM` fica com total **90** e disponível **90** — o
    saldo em terceiros **zerou**, não ficou preso. No **Extrato do material**, o lançamento da perda
    no terceiro aparece no livro.
13. **Imprimir o documento.** Abra qualquer remessa e clique em **PDF da remessa**. Confira no
    arquivo baixado: número, terceiro, itens com quantidades e as **duas linhas de assinatura**.
14. **Remessa de material de cliente.** Crie uma remessa com um material que tenha **proprietário**
    (Etapa 8). Ela **passa sem exigir OS nem projeto do cliente** — mandar galvanizar não é
    *aplicar* a chapa no trabalho de ninguém. Gere o PDF: ele **nomeia o cliente proprietário**.
    *Controle:* tentar uma **saída** normal daquele mesmo material sem a OS do dono continua sendo
    recusada, como na Etapa 8.
15. **Tentar misturar donos.** Monte uma remessa com uma chapa do **Cliente A** e outra do
    **Cliente B**:
    > `A remessa mistura materiais de donos diferentes (Cliente A LTDA e Cliente B LTDA). O documento de remessa nomeia UM proprietario — separe em remessas diferentes.`

    ⚠️ **Esta regra foi deduzida, não pedida** — ver "O que depende de você", logo abaixo.
16. **Sem a permissão, não dá.** Entre com um usuário de perfil **PRODUÇÃO** ou **CONSULTA** e
    clique em **Enviar** (ou Registrar retorno / Encerrar / Cancelar): aparece o aviso de falta de
    permissão **antes** de o formulário abrir, e nada é enviado. Forçando a chamada por fora, o
    servidor responde **403** (`Sem permissão para esta operação`, dizendo a ação que faltou:
    `remessar_terceiro`).
    *Repare que os botões continuam visíveis:* é de propósito — se a consulta de permissões falhar,
    a tela **deixa passar** e quem decide é o servidor. Esconder botão por erro de rede tiraria a
    função de quem tem direito a ela.
    **Ler** a lista de remessas continua liberado para qualquer usuário do módulo — quem consulta
    precisa poder ver onde o material está.
17. **Cancelar depois de enviar.** Crie e envie outra remessa de 100; registre o retorno de 60;
    depois **Cancele** com motivo. Voltam ao disponível **só os 40** que ainda estavam lá fora, não
    os 100.

### O que depende de você (Etapa 8b)

1. **"Uma remessa não pode misturar materiais de donos diferentes" foi DEDUZIDO, não confirmado.**
   A regra saiu de uma frase do desenho — *"o documento de remessa nomeia o proprietário"*, no
   singular — e virou recusa (passo 15). **Se na prática a GMP manda numa mesma viagem a chapa de
   dois clientes para o mesmo galvanizador, isso está errado**: a regra teria de virar "o documento
   **lista** os donos, por item". Nada é irreversível — o dono de cada item já é lido do próprio
   material, não há dado a migrar, e a mudança é pequena.
2. **Falta a verificação no navegador de duas coisas que teste automático não vê.** Os testes desta
   tela leem o arquivo de estilos para garantir que as classes existem, mas **não abrem navegador**:
   (a) confirmar que os **cinco selos de status** (ABERTA, ENVIADA, RETORNO PARCIAL, ENCERRADA,
   CANCELADA) aparecem cada um **com cor**, e que o selo vermelho **Vencida** fica **ao lado** do
   status e não no lugar dele; (b) confirmar que o **PDF baixa legível**, com número, terceiro,
   itens, as duas assinaturas e — em remessa de material de cliente — o nome do proprietário. *Essa
   lacuna já mordeu a Etapa 7: classe de estilo inventada sai sem cor e nenhum teste percebe.*
3. **Uma pendência antiga ganhou um terceiro caminho.** O **Ajuste não reconcilia material
   retido** — e agora isso alcança também o "em terceiros": mandar 30 chapas galvanizar e depois
   ajustar o total do material para 10 deixa `em terceiros (30) > total (10)`, com **disponível
   negativo e sem aviso**. O caminho mais provável é a própria **conferência de inventário**, que
   grava `quantidade_atual` por fora do motor (o mesmo furo da Etapa 8). **A 8b reduziu a chance
   sem resolver a causa:** o esperado da contagem agora vem certo (some o impulso de "corrigir"), e
   o encerramento da remessa é o caminho controlado para zerar a retenção. **Enquanto a decisão de
   negócio não vier: encerre as remessas em aberto antes de lançar um ajuste que reduz o total.**

### O que a Etapa 8b **não** cobre

- **Transformação** — a chapa que sai e volta como 40 peças cortadas mais uma sobra. É a
  **Etapa 8c**, a outra metade da feature 14. **A fronteira é real, não um corte pela metade:**
  tratamento, pintura e galvanização devolvem o **mesmo** material, e para eles o ciclo está
  **completo** nesta etapa; só corte, dobra e usinagem devolvem material **diferente**. Hoje o
  sistema **recusa** o retorno de material diferente, com mensagem que aponta para a 8c.
- **E-mail** no envio e no retorno (feature 19) e **alerta automático** de atraso (feature 20). O
  prazo é gravado, a leitura das remessas vencidas existe e a tela destaca — o **disparo** é das
  outras features. Não há agendador no projeto, e introduzir um é decisão de infraestrutura.
- **Anexo de desenhos** nos itens da remessa — o consumidor natural dele é a 8c.
- **Estornar pelo livro uma baixa de perda/consumo no terceiro devolve o material ao disponível**,
  e **não** à situação "em terceiros": a remessa já está encerrada, e recriar a retenção deixaria
  saldo preso sem remessa viva por trás. Já o par **remessa/retorno não é estornável pelo livro** —
  o caminho é a própria tela de Remessas, senão o livro registraria uma reversão que não aconteceu.
- **Saldo por almoxarifado.** Continua valendo a decisão de negócio do módulo: almoxarifado é área
  física do mesmo site. A segregação que esta etapa introduz é **estar ou não no prédio**, que é
  outra coisa.
- **Uma consequência conhecida da guarda de bloqueio:** material que tenha **ao mesmo tempo** saldo
  bloqueado e saldo em terceiros pode ter o encerramento da remessa barrado pela guarda
  "Material bloqueado não pode ser utilizado". Não foi mexido porque é a mesma pendência do Ajuste
  (item 3 acima), e a decisão é de negócio.

### O que fazer antes do deploy (Etapa 8b)

**Nada.** A etapa só **acrescenta** uma coluna (`quantidade_em_terceiros`, que nasce zerada) e três
tabelas novas; **nenhum dado existente é tocado ou reinterpretado**, e não há passado a corrigir.
Isto está escrito explicitamente porque as Etapas 7 e 8 deixaram consultas para rodar em produção e
você vai procurar a desta — **as daquelas duas continuam pendentes**, esta não acrescenta nenhuma.

---

## Correção — a posição por cliente não fechava a conta (2026-08-13)

> Também **não é uma etapa**: é um defeito de leitura descoberto durante a Etapa 8c e corrigido na
> hora. Afeta a tela **Almoxarifado → Materiais de Clientes → Posição** e o PDF dela.

**O que estava acontecendo.** A posição por cliente mostra quatro números por material: **recebido,
consumido, devolvido e saldo**. Eles vêm do histórico de movimentações — mas a lista de "o que conta
como recebimento" e "o que conta como consumo" estava **desatualizada** em relação ao resto do
sistema. Três tipos de lançamento criados nas etapas mais recentes não estavam nela:

- **peça que voltou transformada** do terceiro (a chapa que foi cortada e virou peça);
- **material consumido no processo do terceiro**;
- **material perdido no terceiro**.

Resultado: o material aparecia com **saldo, mas recebido zero** ("de onde saiu isso?"), ou **sumia do
saldo sem aparecer em consumido** ("para onde foi isso?"). Em nenhum dos dois casos havia coluna onde
procurar a diferença — a conta **recebido − consumido − devolvido = saldo** simplesmente não fechava.

| | Antes | Agora |
|---|---|---|
| Peça que voltou cortada do terceiro | Saldo 40, **recebido 0** | Saldo 40, **recebido 40** |
| Chapa consumida no processo do terceiro | Saldo caía, **consumido continuava 0** | Entra em **consumido** |
| Chapa perdida no terceiro | Saldo caía, **sem registro visível** | Entra em **consumido** |
| Material devolvido ao cliente | Aparece em **devolvido** | **Sem mudança** — continua só em devolvido |

**Por que a devolução continua separada.** Ela tem coluna própria, e você precisa distinguir "quanto
virou peça" de "quanto voltou pro cliente". Perda e consumo no terceiro **não têm** coluna própria —
por isso eles precisam entrar em "consumido", senão ficam invisíveis. Se a GMP quiser **perda no
terceiro numa coluna separada** na tela do cliente, isso é pedido novo, não defeito: diga e a coluna
é criada.

**Roteiro de teste (precisa de uma remessa a terceiros já usada):**
1. **Almoxarifado → Materiais de Clientes → Posição**, escolha o cliente. Anote os quatro números de
   um material.
2. Confira **na mão**: `recebido − consumido − devolvido` tem de dar exatamente o **saldo**. Se um
   material tiver histórico de remessa a terceiro, é justamente ele que antes não fechava.
3. Se o cliente tem peça vinda de **transformação** (Etapa 8c), procure a linha da peça: ela tem de
   ter **recebido igual ao saldo**, e não zero.
4. Abra o **PDF** da posição e confira que os mesmos números aparecem lá.

**O que esta correção NÃO faz:**
- **Não muda nenhum saldo, nem lança nada.** O histórico sempre esteve certo; só a **leitura** que
  monta a tela estava incompleta. Nada a rodar em produção.
- **Não cria coluna nova** para perda no terceiro (ver acima) nem valoriza a posição por cliente em
  R$ — o PDF continua trazendo **quantidades, não valores**.
- **Não mexe nas aplicações por OS/projeto** da mesma tela: perda e consumo no terceiro não têm
  OS/projeto, então continuam fora daquela lista, como todo lançamento sem vínculo.

---

## Correção — o valor do estoque aparecia ZERADO nos relatórios (2026-08-13)

> Isto **não é uma etapa**: é um defeito de leitura descoberto durante a Etapa 8c e corrigido na
> hora. Está aqui porque muda um número que você olha.

**O que estava acontecendo.** O cadastro do material tem um campo de custo. O sistema também mantém
um **custo médio**, que só passa a existir depois que o material entra por uma nota fiscal com
valor. Nos relatórios, o sistema tentava usar o custo médio "ou, se não houver, o do cadastro" — mas
a conta estava escrita de um jeito que, para material que **nunca recebeu nota fiscal**, entendia o
custo médio como "existe e vale zero" em vez de "não existe". Resultado: **o material valia zero no
relatório**, mesmo com o custo preenchido no cadastro. Como quase todo o acervo é anterior ao
recebimento por NF, isso valia para **quase tudo**.

| | Antes | Agora |
|---|---|---|
| Material com custo só no cadastro (R$ 10) | Relatório de posição mostrava **R$ 0,00** | Mostra **R$ 10,00 × a quantidade** |
| Item na tela de aprovação de requisição | Custo unitário **R$ 0,00** | Custo real |
| "Valor total do estoque" no Dashboard | Somava pelo **último custo de compra** | Soma pelo **custo médio** (cai no custo do cadastro quando não há média) |
| Dashboard × Relatório de posição | Podiam dar **números diferentes** | Dão o **mesmo** número |

**Atenção ao número do Dashboard.** Ele **pode mudar** — para melhor. Antes ele usava o *último*
preço pago; agora usa o custo *médio*, que é o que o relatório de posição e o valor das requisições
já usavam. Para material que nunca recebeu nota com custo, **o número é exatamente o mesmo de
antes**.

**Roteiro de teste (5 minutos, sem depender de dado antigo):**
1. **Almoxarifado → Materiais → Novo material.** Preencha código, nome, unidade e **Custo unitário
   = 10**. Salve. **Não** faça recebimento nenhum.
2. Dê entrada de **5 unidades** por **Almoxarifado → Movimentações → Entrada** (ou ajuste positivo).
3. **Almoxarifado → Relatórios → Posição de estoque.** A linha desse material tem de mostrar valor
   total **50,00** — antes mostrava **0,00**.
4. **Almoxarifado → Dashboard.** O card "Valor total do estoque" tem de ter subido **50,00**.
5. Crie uma **requisição** com 3 unidades desse material e abra a tela de aprovação: o custo
   unitário do item tem de ser **10,00**, não **0,00**.

**O que esta correção NÃO faz:**
- **Não recalcula nada retroativamente.** Não havia o que recalcular: o custo estava sempre certo no
  banco; só a **leitura** estava errada. Nenhum dado foi tocado, nenhuma migração precisa rodar.
- **Não valoriza material de cliente.** Patrimônio de terceiro continua fora de todo total de
  estoque próprio (Etapa 8), e o PDF de posição por cliente continua trazendo **quantidades, não
  valores**.
- **Não cria tela de relatório de valores.** A tela de relatórios continua sendo pendência antiga.

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
- **Lote na entrega de requisição (atualizado em 2026-08-12 — a metade da devolução foi resolvida).**
  Até 2026-08-10 o sistema exigia lote em **quatro** operações que não têm campo de lote — e o
  efeito era que material com "Controle por lote" ligado **não podia ser entregue nem devolvido**,
  com a reserva da requisição presa segurando saldo. A exigência foi retirada dos quatro. **A Etapa
  7 devolveu a exigência a dois deles, agora com onde informar o lote:** a devolução para
  estoque/quarentena e a sucata de devolução **herdam o lote da entrega** (ou usam o seletor da tela
  de Devoluções, na devolução avulsa). **Sobram duas**, e continuam sem campo de lote: **entrega de
  requisição** e **exclusão de requisição (estorno)**. O pendente nelas é preencher o lote sozinho —
  o que vence primeiro (FEFO) na entrega, e o lote de origem no estorno.
- **⚠️ Decisão de negócio esperando você (3): Ajuste de inventário não acerta o "bloqueado"
  (novo, 2026-08-12).** Material com 8 unidades bloqueadas e um Ajuste levando o total para 1 fica
  com bloqueado maior que o total — **Disponível negativo, sem nenhum aviso**. Ver a seção da Etapa
  7, em "Pendências que a Etapa 7 levantou", com as três respostas possíveis. Enquanto não houver
  decisão: **resolva a quarentena antes de lançar um ajuste que reduz o total**.
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
- **⚠️ A conferência de inventário escapa da permissão de material de cliente (novo, 2026-08-12).**
  Mesmo caminho antigo do item acima, agora com uma consequência a mais: como "aplicar ajustes"
  grava o saldo **fora do motor**, ele também fica **fora** da permissão
  `ajustar_material_cliente` criada na Etapa 8. **Um usuário barrado de ajustar a chapa do cliente
  pela tela de Movimentações consegue mudar o mesmo saldo pela conferência de inventário** — sem a
  autorização especial e sem a auditoria que nomeia o cliente. Os dois problemas se resolvem pelo
  mesmo conserto (rotear a conclusão da conferência pelo motor). Detalhes e o que fazer enquanto
  isso: seção da Etapa 8, em "O que fazer ANTES de subir para produção".
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
