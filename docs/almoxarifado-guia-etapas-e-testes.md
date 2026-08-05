# Almoxarifado — Guia das Etapas e Testes Manuais

> Atualizado em 2026-08-05 · Branch: `desenvolvimento-almoxarifado` · Como rodar: `npm run dev` (raiz do projeto)

Este documento explica, em linguagem simples, o que mudou no módulo Almoxarifado até agora (Etapas 1 e 2) e o que está planejado para a próxima etapa (Etapa 3). Cada etapa tem um roteiro de cliques para você testar manualmente no navegador.

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
| Só existia um almoxarifado implícito | Multi-almoxarifado: você pode cadastrar vários depósitos (ex.: filiais, obras). Todas as localizações que já existiam foram automaticamente vinculadas a um almoxarifado chamado "ALM-GERAL" — nada se perdeu |
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

## Etapa 3 — Requisições Ponta a Ponta (PLANEJADA — o que vem)

> Esta seção descreve o que está no planejamento, sujeito a ajustes quando o detalhamento técnico for fechado. Nada abaixo está implementado ainda.

O fluxo de requisição de materiais (o funcionário pede material, o almoxarifado separa e entrega) é a parte mais madura do módulo hoje, mas tem lacunas que a Etapa 3 pretende fechar:

- **Corrigir um bug conhecido**: hoje é possível criar uma requisição com quantidade zero ou negativa em um item — isso vai passar a ser bloqueado.
- **Requisição vai passar a baixar estoque pelo motor novo da Etapa 1.** Hoje a entrega de uma requisição usa um caminho separado que não passa pelas mesmas validações (bloqueio de localização, saldo negativo, etc.) — isso será unificado.
- **Novos status da requisição**: hoje uma requisição nasce direto como "enviada". Vão existir status como Rascunho, Aguardando Estoque/Aguardando Compra, Pronta para Retirada e Encerrada (hoje só existe até "entregue").
- **Tipos de requisição estruturados** (hoje não existe um campo formal para isso).
- **Confirmação de recebimento pelo solicitante** — hoje quem entrega marca como entregue, mas quem pediu não confirma que recebeu; isso fecha o ciclo.
- **Motor de aprovações de verdade**: hoje só existe aprovação simples (um perfil aprova/rejeita) e aprovação por valor. A Etapa 3 planeja regras configuráveis (por tipo de material, quantidade, projeto, urgência), a exigência de que **quem pediu não pode aprovar a própria requisição**, e justificativa obrigatória em pedidos emergenciais.

---

## O que observar de regressão (sempre)

- O fluxo de requisição de materiais que já existia (criar → aprovar → separar → entregar) continua funcionando normalmente — nada foi removido nessa tela.
- Movimentações antigas (de antes da Etapa 1) continuam visíveis e com os dados corretos no livro.
- O Mapa de Localizações carrega normalmente e mostra as posições que já existiam, agora todas vinculadas ao almoxarifado "ALM-GERAL".

---

## Pendências conhecidas (sem tela ainda)

- Consulta de "posições vazias" e "materiais sem endereço": a API já existe, mas não há tela para usá-la.
- Criar subfamílias: só via API, sem formulário na interface.
- Reservas de estoque (separar material para uma OS/projeto antes da entrega): ainda não implementado — é uma etapa futura (Etapa 4).
