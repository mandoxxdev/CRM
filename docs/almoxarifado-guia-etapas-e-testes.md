# Almoxarifado — Guia das Etapas e Testes Manuais

> Atualizado em 2026-08-08 · Branch: `desenvolvimento-almoxarifado` · Como rodar: `npm run dev` (raiz do projeto)

Este documento explica, em linguagem simples, o que mudou no módulo Almoxarifado até agora (Etapas 1 a 5) e tem um roteiro de cliques para você testar manualmente no navegador cada etapa.

> **Onde o desenvolvimento parou (2026-08-08):** Etapas 1, 2, 3, 4 e 5 **completas**. A Etapa 5 fechou a quarentena de recebimento: material que precisa de inspeção (ex.: peça crítica) entra no estoque mas fica **retido**, fora do que pode ser usado, até alguém aprovar ou reprovar na tela nova (Almoxarifado → Inspeções). A pendência que ela cria (material reprovado fica bloqueado até alguém desbloquear e dar baixa manual — não sai sozinho para o fornecedor) está registrada no fim deste documento. A próxima é a **Etapa 6 — Lotes e Séries**. Ver o planejamento mestre em `specs/modulo-almoxarifado/README.md`.

## Tabela consolidada — todas as alterações (Etapas 1 a 5)

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
| 5 | Recebimento | Aprovar recebimento de material crítico **sem inspeção prévia dava erro** — o material não entrava no sistema mesmo já estando no galpão | Entra sempre. Se exige inspeção, entra **retido** (fora do disponível) até alguém decidir |
| 5 | Inspeções (tela nova) | Não existia fila de inspeção nem forma de aprovar/reprovar pela tela | Tela **Inspeções**: lista o que está retido, aprova (total ou parcial) ou reprova com motivo e destino (devolver / engenharia / substituição) |
| 5 | Inspeções / Materiais | Bloquear um material achado com defeito na prateleira não tinha botão nem exigia justificativa | Botões **Bloquear/Desbloquear Material** na tela de Inspeções, com justificativa obrigatória e rastro no livro de movimentações |
| 5 | Movimentações | Desbloquear mais do que estava bloqueado "funcionava" e devolvia menos do que o pedido ao disponível, sem avisar | Desbloquear acima do bloqueado é **recusado** com erro — nunca mais silencioso |

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

O que ainda falta nesta frente (não é bug, é escopo futuro): validar saída de lote vencido ou reprovado — depende do controle de lotes ainda não implementado (Etapa futura). E a entrada/saída rápida que existe dentro da tela de Materiais ainda usa o caminho antigo (mais simples, sem localização/lote) — só a tela de Movimentações usa o formulário novo completo.

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

## Etapa 4 — Reservas de Estoque (BACKEND ENTREGUE — 2026-08-05 · falta a tela)

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

Reserva por lote/série (depende do controle de lotes). Prioridade na reserva. E-mail de aviso de reserva vencida.

> **Fechado em 2026-08-06:** a liberação por valor (`/aprovar-valor`) passou a reservar como a aprovação normal, e **excluir** uma requisição passou a soltar as reservas dela (antes só cancelar soltava). Se você usa liberação por valor, o material aprovado por essa via agora fica reservado — a requisição aparece como **Totalmente/Parcialmente Reservada** em vez de só **Aprovada**.

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

## O que observar de regressão (sempre)

- O fluxo de requisição de materiais que já existia (criar → aprovar → separar → entregar) continua funcionando normalmente — nada foi removido nessa tela; requisições antigas continuam com o comportamento de sempre (criadas sem tipo/centro de custo ganham o padrão "Consumo").
- Movimentações antigas (de antes da Etapa 1) continuam visíveis e com os dados corretos no livro.
- O Mapa de Localizações carrega normalmente e mostra as posições que já existiam, agora todas vinculadas ao almoxarifado "ALM-GERAL".

---

## Decisões de negócio (não são pendências)

- **Almoxarifado é área física, não filial.** Os almoxarifados representam áreas de alocação dentro do mesmo site (galpão, mezanino, área externa). O cliente tem uma única filial. Por isso o **saldo de cada material é um só**, somado em todas as áreas — o almoxarifado serve para você *achar onde o item está*, não para manter estoques separados. Uma saída consome o saldo total do material, independente da área em que ele está endereçado. Isso é intencional: se algum dia existir uma segunda filial, a regra muda, mas hoje tratar como dois estoques seria errado.

---

## Pendências conhecidas (sem tela ainda)

- Consulta de "posições vazias" e "materiais sem endereço": a API já existe, mas não há tela para usá-la.
- Criar subfamílias: só via API, sem formulário na interface.
- Reservas de estoque: **completo na Etapa 4** — backend, tela (Almoxarifado → Reservas) e as duas rotas que escapavam do hold (liberação por valor e exclusão de requisição). Sem pendência.
- Anexos na requisição (desenho/documento) e assinatura digital na retirada: ainda não implementados.
- Importar itens de uma lista técnica ou ordem de produção na requisição: ainda não implementado (depende da integração com Engenharia/Produção).
- Registrar lote/série entregue por item na requisição: ainda não implementado (depende do controle de lotes, etapa futura).
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
