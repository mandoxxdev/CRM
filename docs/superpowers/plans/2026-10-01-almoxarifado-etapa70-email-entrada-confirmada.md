# Etapa 70 — o aviso da nota que entrou no estoque (feature 08, com a 19)

> Status: **Fases 0 e 1 feitas (2026-10-01) — plano escrito, aguardando a Fase 2 (revisão do plano por agente
> fresco).** Nenhum código de produção, nenhum commit.
> Feature 08 (recebimento), item *"E-mail automático na entrada confirmada (feature 19)"*
> (`specs/modulo-almoxarifado/08-recebimento/README.md:780`), com a infraestrutura da 19 (fila
> `fila_notificacoes_almoxarifado`). Requisito: especificação original seção 8.4 (*"… Atualização do saldo → E-mail
> automático"*, `2026-08-02-requisitos-modulo-almoxarifado.md:437-459`) e seção 14.2 (*"Entrada de compra:
> Almoxarifado, Comprador responsável, Solicitante da compra, Responsável pelo projeto, Qualidade quando houver
> inspeção, Financeiro ou Fiscal"*, `:655-661`). Próxima tarefa detalhada de origem:
> `docs/superpowers/plans/2026-10-01-almoxarifado-etapa69-sucatear-reprovado.md:682-717`.

**Escopo desta etapa:** quando um recebimento termina de dar entrada no estoque (vira `PROCESSADO` ou `APROVADO`),
a fila da 19 ganha **um** aviso **da nota** — número, NF, fornecedor, pedido, itens, quanto entrou de cada um, o que
ficou **retido para inspeção** e quais requisições esperavam aqueles materiais — para uma lista configurável
(padrão: a lista de Compras que já existe), e **um aviso por requisição** ao **solicitante** de cada requisição em
`AGUARDANDO_COMPRA`/`AGUARDANDO_ESTOQUE` cujo material pendente entrou **livre** (não retido). Uma chave liga/desliga
os dois. **Fora:** comprador do pedido e solicitante da solicitação de compra (o banco não os tem — medido), aviso na
liberação da inspeção, correção do aviso no estorno, mudança automática do status da requisição — ver "O que fica de
fora".

## Fase 0 — medido (2026-10-01)

Réguas testadas contra o que existe antes de medir ausência: `grep -rn "evento: 'MOVIMENTACAO'" server/services` → **1**
(a régua acha o evento que existe); `grep -rn "RECEBIMENTO_ENTRADA\|recebimento-entrada\|notificar_recebimento\|dest_recebimento"
server/services server/routes client/src` → **0**. `grep "AGUARDANDO_COMPRA"` casa em `requisitionStateMachine.js` (régua
viva) e dá **0** em `server/index.js` e nas rotas core (a requisição-material core não tem esse status). Identificadores
de contrato, sem acento (`enfileirar`, `entrada_estoque_em`, `solicitante_id`), nunca nomes imaginados.

### 1. O que é "entrada confirmada" no recebimento — o momento exato

| Onde | O que faz |
|---|---|
| `server/services/almoxarifado/receiptService.js:1132-1449` `darEntradaEstoque` | pré-checagem da nota inteira (`:1152-1219`, recusa 400 *"Nao foi possivel dar entrada no estoque: …"* sem mover nada); depois, por item, **claim** `UPDATE … SET entrada_estoque_em = CURRENT_TIMESTAMP WHERE id = ? AND entrada_estoque_em IS NULL RETURNING id` (`:1229-1234`), `ENTRADA_COMPRA` no motor (`:1276-1301`), endereço de entrada (`:1306-1313`), séries, soma no pedido (`:1386-1396`), e, se o material é crítico com `inspecao_material_critico = '1'` (default **'1'**, medido), `QUARENTENA` + `quantidade_em_inspecao` do item (`:1398-1424`). Falha antes da entrada física devolve a marca (`:1426-1434`); depois, não. No fim, `fecharPedidosCompletos` não-fatal (`:1443-1448`) |
| `receiptService.js:1475-1520` `processarNota` | recusa `PROCESSADO`/`APROVADO` (400 *"Nota já processada"*), exige `EM_ENTRADA_NF`/`ENCAMINHADO_FATURAMENTO`; `darEntradaEstoque` → `gerarContaPagar` → `UPDATE status='PROCESSADO', etapa_atual='CONCLUIDO'` → auditoria `PROCESSAR_NOTA` → `fecharSolicitacoesDoPedido` não-fatal (`:1511-1517`) |
| `receiptService.js:1522-1553` `aprovarRecebimento` | `EM_ENTRADA_NF`/`ENCAMINHADO_FATURAMENTO` **delega** para `processarNota` (`:1529-1531`); qualquer outro status não terminal entra **direto**: `darEntradaEstoque` → `UPDATE status='APROVADO'` → `fecharSolicitacoesDoPedido` não-fatal. **Não audita** |
| `receiptService.js:875-917` `avancarWorkflow` | a ação `processar` **delega** para `processarNota` (`:897-900`) |
| `routes/almoxarifado/extended.js:1294`, `:1300`, `:1317` | as três portas (`/aprovar`, `/workflow`, `/processar`), todas `requirePermission('receber_material')`, chamam o serviço |

**Conclusão:** "entrada confirmada" = o recebimento chega a `PROCESSADO` (via `processarNota`, alcançado por três
rotas) ou a `APROVADO` (ramo direto de `aprovarRecebimento`). Há **dois** pontos terminais de código, ambos **depois** de
`darEntradaEstoque` ter terminado sem lançar e do `UPDATE` de status. A tela chama isso de *"Processar Nota — Estoque +
Contas a Pagar"* (`RecebimentosAlmoxarifado.js:964`) e o status *"Processado"* (`:30`); a palavra "confirmada" não
aparece na tela — vem da spec 14 (*"Toda entrada ou saída confirmada deverá gerar e-mail imediato"*).

### 2. A infraestrutura da 19 que existe (e que esta etapa reusa, sem mecanismo paralelo)

| Onde | O que faz |
|---|---|
| `notificationQueueService.js:63-89` `enfileirar` | `INSERT OR IGNORE` com `hash_dedupe = sha256(evento|dedupe_chave)` UNIQUE; sem destinatário → `{enfileirada:false, motivo:'SEM_DESTINATARIO'}`; repetido → `DUPLICADA` (régua `changes === 0`). **Só grava** — quem envia é o worker (`processarFila`, `:95`) |
| `stockService.js:2162-2181` | gancho pós-commit do motor: se `notificar_movimentacoes === '1'` (**default `'0'`**, `schema.js:2577`), `enfileirarMovimentacao` — um e-mail **por movimentação**, dedupe `mov-<id>`, em `try/catch` (aviso nunca derruba movimentação) |
| `notificationQueueService.js:280-305` `resolverClasseMovimentacao` | `ENTRADA_COMPRA` ∈ `TIPOS_ENTRADA` → classe `entradas`; **`QUARENTENA` → `null` (sem e-mail)** |
| `notificationQueueService.js:318-339` | destinatário da classe: `notificacoes_dest_entradas`; vazio → `alertas_estoque_emails` **só se** `alertas_estoque_notificar_email` ligado |
| `notificationQueueService.js:415-421` `suprimirNotificacaoMovimentacao` | o estorno (`stockService.js:2721`) vira FALHA a linha **PENDENTE** daquela movimentação |
| `purchaseService.js:399-401` | o canal de Compras: `notificacoes_dest_compras`, vazio → `compras_notificar_emails` (cadeia já usada pelo aviso de solicitação de compra gerada) |
| `alertService.js:617-619` `alertasEmailLigado` | o toggle *"Notificar por e-mail"* governa **só** a lista `alertas_estoque_emails`; Compras fica **fora** (comentário `:616`) |
| `routes/almoxarifado.js:2729` | `CHAVES_BOOL = ['notificar_movimentacoes']` — o `PUT /configuracoes` recusa `≠ '0'/'1'` só para as chaves listadas |
| `ConfiguracoesAlmoxarifado.js:3279`, `:3303-3308` | os campos das chaves de notificação na lista fixa `CAMPOS` (chave fora dela é ineditável pela UI — lição das Etapas 16/43/46) |
| `ConfiguracoesGerais.test.js:67`, `:75` | a fixture das chaves (sem a linha, os testes de Salvar caem — custo medido na Etapa 46) |
| `server/tests/api/configuracoesGerais.api.test.js:83-103` | amarração: toda chave de `CAMPOS` tem de ser semeada **e** ter leitor literal `'<chave>'` no servidor |
| `NotificacoesAlmoxarifado.js:27-39` | o filtro de eventos do painel é uma lista **fixa** de 8 (a rota aceita qualquer string em `?evento=`, `extended.js:2012`) |

**Como se testa sem rede (o padrão):** nenhum teste chama SMTP; os testes leem `fila_notificacoes_almoxarifado` depois
do gesto (`notificacaoMovimentacao.api.test.js:53`, helper `filaPorPayload` em `notificacaoJornada.api.test.js:91`).
O `ESTOQUE_ZERADO` da Etapa 69 (T6) foi provado assim. O worker só é exercitado nos testes da própria fila.

### 3. Quem deve receber — o que o banco sabe

| Destinatário da spec 14.2 (entrada de compra) | O banco tem? |
|---|---|
| Almoxarifado | lista `notificacoes_dest_entradas` (canal por movimentação, já existe) |
| **Comprador responsável** | **NÃO.** `pedidos_compra` (`server/index.js:19230-19242`) não tem comprador, criador nem usuário; nenhum `ALTER` acrescenta (grep) |
| **Solicitante da compra** | **NÃO.** `solicitacoes_compra_almoxarifado` (`schema.js:2241-2262`) não tem solicitante: nasce do sistema (`purchaseService.js:30` estoque mínimo; `:375` geração da Reposição) |
| Setor de Compras | **sim, como lista**: `notificacoes_dest_compras` → `compras_notificar_emails` |
| Responsável pelo projeto / Qualidade / Financeiro | sem lista própria; cabem numa lista configurável |
| **Quem esperava o material** | **sim**: `requisicoes_almoxarifado.solicitante_id` (`schema.js:454-458`) → `usuarios.email` (`server/index.js:1140-1149`, `email UNIQUE NOT NULL`, `ativo`). Precedente: `requisitionValueApprovalService.js:350` e `requisitionReminderService.js:276` já leem `usuarios.email` do solicitante/aprovador |

**Não inventar destinatário:** a etapa usa a **lista de Compras** como o "comprador" possível e o **solicitante da
requisição que aguardava** como a pessoa — as duas coisas que o banco sabe.

### 4. O que acontece hoje quando o material de uma requisição `AGUARDANDO_COMPRA` entra

- `calcularStatusPosAprovacao` (`requisitionStateMachine.js:120-143`) põe a requisição em `AGUARDANDO_COMPRA` (há
  solicitação de compra `PENDENTE` do material no horizonte) ou `AGUARDANDO_ESTOQUE`. O status **nunca se autocorrige**
  (`:19`).
- A entrada da nota **não toca** a requisição (sonda, cenário F): continua `AGUARDANDO_COMPRA`. Ela é separável
  (`PODE_SEPARAR` inclui os dois status, `:71`) e a Fila de separação (Etapa 64, `requisitionService.js:340-407`) passa a
  mostrá-la acionável quando há saldo — **o almoxarife fica sabendo pela fila; o solicitante não fica sabendo de nada.**
- `fecharSolicitacoesDoPedido` (`purchaseService.js:113-126`) fecha as solicitações `VINCULADO` do pedido como
  `RECEBIDA` — **sem aviso a ninguém**.

### 5. Idempotência e best-effort — o que já protege e o que o evento novo precisa

- Reprocessar: `processarNota` recusa `PROCESSADO`/`APROVADO` (400 *"Nota já processada"*; sonda C: 0 linhas novas);
  `aprovarRecebimento` recusa (400 *"Recebimento já aprovado/processado"*).
- Dois cliques simultâneos: os dois passam a checagem de status; o claim por item faz só um mover. **Os dois chegariam
  ao ponto terminal** → o dedupe por hash do recebimento é o que garante um aviso.
- Falha parcial (item A entrou, B lançou depois do claim): `processarNota` lança **antes** do `UPDATE` de status → o
  ponto terminal não é alcançado → nenhum aviso; o reprocessamento pula A (claim) e, ao terminar, o aviso tem de listar
  **A e B** — logo o conteúdo é lido do **banco** (`entrada_estoque_em IS NOT NULL`), não do que esta chamada moveu.
- Padrão do módulo para efeito colateral depois do commit: `try/catch` + `console.warn`, nunca relança
  (`receiptService.js:1443-1448`, `:1511-1517`; `stockService.js:2166-2181`).

### Sonda executada (`sonda70-entrada-fila.js` no scratchpad, harness real, serviço)

```
default notificar_movimentacoes = 0 ; default inspecao_material_critico = 1
A default (2 itens, 1 crítico) -> fila: []
B ligado + notificacoes_dest_entradas -> 2 linhas MOVIMENTACAO "[Almoxarifado] ENTRADA_COMPRA — S70-4" e "… S70-5"
C reprocessar -> 400 Nota já processada ; 0 linhas novas
D aprovarRecebimento direto (RECEBIDO -> APROVADO) -> 1 linha MOVIMENTACAO
E estornar a ENTRADA_COMPRA de D -> a linha vira FALHA "Movimentação cancelada antes do envio"
F requisição AGUARDANDO_COMPRA do material + nota processada -> requisição continua AGUARDANDO_COMPRA;
  fila: só a MOVIMENTACAO para almox@x.com (o solicitante não recebe nada)
```

### Surpresas da medição

1. **O item da 08, ao pé da letra, já está pago desde a Etapa 12 — e as duas specs se contradizem.** A spec 19 marca
   `[x] E-mail em toda entrada confirmada — 77d1f38 (gancho no motor cobre todas as portas)`
   (`19-emails-notificacoes/README.md:21`); a spec 08 diz *"Desmarcado: é da feature 19 … não foi tocado"*
   (`08-recebimento/README.md:780-782`), e o plano da 69 diz *"falta o evento 'a nota entrou no estoque'"*. A sonda (B,
   D) prova que a nota processada **enfileira** — um e-mail por item, quando a chave está ligada. **O que de fato falta
   é outra coisa, e é o que esta etapa paga:** (a) o aviso é **por movimentação** (nota de 30 itens = 30 e-mails, que é
   o motivo de a chave nascer desligada); (b) vai só para listas do almoxarifado — nenhuma **pessoa** que esperava o
   material; (c) **não sabe de nota** (sem NF, fornecedor, pedido) nem diz que o crítico ficou **retido** (o
   `ENTRADA_COMPRA` do crítico sai com saldo posterior incluindo o retido; a `QUARENTENA` não tem classe). A spec 08 será
   corrigida no fechamento dizendo que estava errada (regra 5).
2. **Os dois destinatários pessoais da spec 14.2 para entrada de compra não existem no banco** (comprador e solicitante
   da compra) — medido acima. A pessoa que o banco conhece é o **solicitante da requisição** que esperava.
3. **A requisição em `AGUARDANDO_COMPRA` não fica sabendo de nada** — nem status, nem e-mail (sonda F). O almoxarife só
   vê pela Fila de separação.
4. **`aprovarRecebimento` (ramo direto) não audita** a entrada — diferente de `processarNota`. Não é desta etapa;
   registrado (letra G nova no fechamento, se a Fase 2 confirmar).
5. Dois `processarNota` simultâneos: a segunda chamada passa a checagem de status e chega a `gerarContaPagar` de novo
   (a conta a pagar sai em dobro?) — **não medido por sonda nesta fase** (fora do escopo; o aviso desta etapa é
   protegido pelo dedupe). Fica para a Fase 2 decidir se mede.

## Decisões reversíveis (letra B do documento de novidades; última usada: B315)

- **D1 (B316) — o item da 08 é pago como "aviso da NOTA + aviso a quem esperava", não como "e-mail por entrada".** O
  e-mail por movimentação da 19 continua igual (contrato que não se reabre). Descartados: (a) declarar o item pago
  pela 19 e trocar de feature — a sonda mostra que o que existe não chega a ninguém que esperava o material e vem
  desligado por bom motivo; (b) mudar o `MOVIMENTACAO` para agrupar por nota — reabriria a 19.
- **D2 (B317) — destinatários do aviso da nota: lista própria `notificacoes_dest_recebimento`; vazia → a cadeia de
  Compras (`notificacoes_dest_compras` → `compras_notificar_emails`).** Racional: na falta do comprador no banco, o
  setor de Compras é o "comprador responsável" possível, e a lista própria deixa o administrador compor almoxarifado +
  compras + qualidade + fiscal (spec 14.2) sem matriz. Descartados: `notificacoes_dest_entradas` (plateia do
  almoxarifado, e o fallback dela cai em `alertas_estoque_emails` sob outro toggle); comprador/solicitante da compra
  (não existem); acrescentar coluna de comprador ao pedido (mexe no core Compras — etapa própria).
- **D3 (B318) — uma chave própria `notificar_recebimento_entrada`, padrão LIGADA (`'1'`), governando os dois avisos.**
  Racional: é **um** aviso por nota (não por item) e um por requisição que esperava — volume baixo; desligada de
  fábrica, ninguém acharia a chave e o item continuaria inerte, como o `MOVIMENTACAO`. Sem destinatário configurado
  nas listas de Compras, o aviso da nota cai em `SEM_DESTINATARIO` sem erro (o de requisitante independe da lista).
  Descartados: reaproveitar `notificar_movimentacoes` (default `'0'` por spam de N e-mails; ligar uma ligaria a outra);
  padrão `'0'`; duas chaves (uma por aviso) — reversível depois se a prática pedir.
- **D4 (B319) — quem é "quem esperava": o solicitante de cada requisição em `AGUARDANDO_COMPRA` ou `AGUARDANDO_ESTOQUE`
  com item **pendente** (`quantidade_solicitada − quantidade_atendida > 1e-9`) de um material que entrou **livre**
  nesta nota.** Um aviso por requisição (dedupe por recebimento + requisição). Usuário inativo ou sem e-mail → sem
  aviso, sem erro. O solicitante que é o próprio processador da nota recebe mesmo assim (regra simples; reversível).
  Descartados: requisições `APROVADO`/`PARCIALMENTE_*`/`EM_SEPARACAO` (já têm saldo ou reserva — viraria e-mail a cada
  nota de material comum); mudar o status da requisição sozinho (máquina de estados; a separação já aceita os dois
  status e a Fila de separação já mostra).
- **D5 (B320) — material retido em inspeção:** o aviso da nota lista o item com *"retido para inspeção"*; o solicitante
  **não** é avisado por material retido (não está disponível). O aviso na **liberação** da inspeção fica de fora (falta,
  com motivo). Descartado: avisar o solicitante já na entrada retida — prometeria material que pode ser reprovado.
- **D6 (B321) — o momento e a fonte:** o aviso é enfileirado **depois** do `UPDATE` de status terminal, nos **dois**
  pontos (`processarNota` e o ramo direto de `aprovarRecebimento`), em `try/catch` não-fatal; o conteúdo é **lido do
  banco** (itens com `entrada_estoque_em`), não do que a chamada moveu. Descartados: dentro de `darEntradaEstoque`
  (roda antes do status; uma falha no `UPDATE` deixaria aviso de nota não processada) e o conteúdo da chamada (a
  retomada após falha parcial mandaria só os itens da segunda passada).
- **D7 (B322) — estorno:** estornar uma `ENTRADA_COMPRA` da nota **não** suprime nem corrige o aviso da nota nem o do
  requisitante (a supressão do `MOVIMENTACAO` continua). Declarado (letra D). Descartado nesta etapa: suprimir o aviso
  PENDENTE da nota no estorno — exigiria ligar `cancelarMovimentacao` ao recebimento, e uma nota de N itens com 1
  estornado não deixa de ter entrado.
- **D8 (B323) — o painel de notificações ganha os dois eventos no filtro** (`EVENTO_OPCOES`), com rótulos *"Entrada de
  recebimento"* e *"Aviso ao requisitante"*. Descartado: deixar fora (a lista é fixa; o evento novo seria invisível
  no filtro).

## Regras de negócio

- **RN-01 (aviso da nota, uma vez)** — ao terminar a entrada (status `PROCESSADO` por `processarNota` ou `APROVADO` pelo
  ramo direto de `aprovarRecebimento`), com `notificar_recebimento_entrada = '1'` e ao menos um item com
  `entrada_estoque_em` e quantidade > 0, a fila ganha **uma** linha `RECEBIMENTO_ENTRADA`, dedupe
  `recebimento-entrada-<recebimento_id>`, para a lista do D2, com assunto/corpo do contrato. *Cenário:* nota de 2
  itens (um comum 5 UN, um crítico 3 UN) processada por `/processar` → **1** linha `RECEBIMENTO_ENTRADA` (não 2), corpo
  com os dois itens e *"retido para inspeção"* no crítico; **e** (metade positiva) a mesma nota pelo `/workflow`
  `processar` e pelo `/aprovar` (delegando) → 1 linha cada; **e** pelo `/aprovar` ramo direto (status `RECEBIDO`) →
  1 linha.
- **RN-02 (não duplica)** — reprocessar (400 *"Nota já processada"* / *"Recebimento já aprovado/processado"*) não
  enfileira; dois `processarNota` simultâneos produzem **uma** linha; a mesma nota não gera segunda linha mesmo se o
  gancho for chamado de novo. *Cenário:* processar → reprocessar (400) → fila com 1; `Promise.all` de dois
  `/processar` → 1 linha `RECEBIMENTO_ENTRADA`; chamar o serviço do aviso duas vezes → segunda `DUPLICADA`.
- **RN-03 (entrada recusada não avisa; a retomada avisa tudo)** — nota recusada na pré-checagem (400) não enfileira
  nada; corrigida e processada, o aviso lista **todos** os itens que entraram. *Cenário:* item com material inativo
  → 400, fila sem `RECEBIMENTO_ENTRADA`; reativa o material → processa → 1 linha com os dois itens.
- **RN-04 (nota sem entrada não avisa)** — nota processada sem nenhum item com quantidade > 0 (todos zerados) termina
  `PROCESSADO` como hoje e **não** enfileira (*"nada entrou"*). *Cenário:* nota de 1 item com recebida 0 → `PROCESSADO`,
  fila sem `RECEBIMENTO_ENTRADA`; **e** (metade positiva) nota de 2 itens com um zerado → 1 linha listando só o que entrou.
- **RN-05 (best-effort)** — falha ao montar/enfileirar o aviso **não** altera a resposta nem o estado: o recebimento
  fica `PROCESSADO`/`APROVADO`, o estoque entrou, a resposta é a de hoje; `console.warn` com a literal do contrato.
  *Cenário:* sabotar a fila (ex.: `DROP TABLE fila_notificacoes_almoxarifado` no harness) → `/processar` 200, status
  `PROCESSADO`, físico creditado.
- **RN-06 (destinatários da nota)** — `notificacoes_dest_recebimento` não vazia → ela; vazia → `notificacoes_dest_compras`;
  vazia → `compras_notificar_emails`; tudo vazio → nenhuma linha do aviso da nota (`SEM_DESTINATARIO`), **e os avisos de
  requisitante continuam**. O toggle de alertas (`alertas_estoque_notificar_email`) **não** governa este aviso.
  *Cenário:* um caso por nível da cadeia; **e** com `alertas_estoque_notificar_email = '0'` o aviso sai do mesmo jeito.
- **RN-07 (chave)** — `notificar_recebimento_entrada = '0'` → nenhum dos dois avisos; `'1'` (padrão semeado) → os dois.
  O `PUT /configuracoes` recusa valor fora de `'0'/'1'` com a literal existente. *Cenário:* desliga → processa → fila
  sem `RECEBIMENTO_ENTRADA*`; `PUT` com `'talvez'` → 400 *"Configuração \"notificar_recebimento_entrada\" deve ser 0 ou 1"*.
- **RN-08 (aviso a quem esperava)** — para cada requisição em `AGUARDANDO_COMPRA`/`AGUARDANDO_ESTOQUE` com item pendente
  de material que entrou **livre** nesta nota, **uma** linha `RECEBIMENTO_ENTRADA_REQUISITANTE`, dedupe
  `recebimento-entrada-<recebimento_id>-req-<requisicao_id>`, para `usuarios.email` do solicitante (ativo). *Cenário:*
  requisição R1 `AGUARDANDO_COMPRA` (material M, 4 UN) + nota com M 10 UN → 1 linha para o e-mail de R1, corpo com M,
  *"entrou 10 UN"* e *"pendente na requisição: 4 UN"*; **e** (metade negativa) requisição `APROVADO` do mesmo material →
  nenhuma linha; requisição `AGUARDANDO_COMPRA` de outro material → nenhuma; item já atendido → nenhuma; solicitante
  inativo / sem cadastro → nenhuma linha e o aviso da nota sai; **e** o aviso da nota cita *"REQ-… (Fulano)"* em
  *"Requisições que aguardavam estes materiais"*.
- **RN-09 (retido não é avisado ao requisitante)** — material que entrou **retido** (`quantidade_em_inspecao` do item
  > 0) não conta para a RN-08. *Cenário:* requisição `AGUARDANDO_COMPRA` do material crítico + nota com ele →
  nenhuma linha de requisitante; o aviso da nota diz *"retido para inspeção"*; **e** (metade positiva) com
  `inspecao_material_critico = '0'` o mesmo material entra livre → 1 linha.
- **RN-10 (o motor e a 19 não mudam)** — com `notificar_movimentacoes = '1'` os `MOVIMENTACAO` por item continuam
  saindo como hoje, ao lado do aviso da nota; o estorno continua suprimindo o `MOVIMENTACAO` pendente e **não** toca o
  `RECEBIMENTO_ENTRADA` (D7). *Cenário:* ligada → nota de 2 itens → 2 `MOVIMENTACAO` + 1 `RECEBIMENTO_ENTRADA`.

## Contrato (congelado)

### Configuração (semeada em `schema.js`, junto das `notificacoes_dest_*`, `INSERT OR IGNORE` como as outras)

| Chave | Default | Descrição semeada |
|---|---|---|
| `notificar_recebimento_entrada` | `'1'` | `Enviar aviso quando um recebimento termina de dar entrada no estoque (um por nota) e ao solicitante da requisicao que aguardava o material` |
| `notificacoes_dest_recebimento` | `''` | `E-mails para o aviso de entrada de recebimento (lista; vazio = usa notificacoes_dest_compras, depois compras_notificar_emails)` |

`routes/almoxarifado.js:2729`: `CHAVES_BOOL = ['notificar_movimentacoes', 'notificar_recebimento_entrada']` (literal da
recusa inalterada). Tela (`CAMPOS`):
`{ chave: 'notificar_recebimento_entrada', label: 'Avisar Entrada de Recebimento por E-mail', tipo: 'boolean', descricao: 'Um e-mail por nota que entrou no estoque, e um ao solicitante de cada requisição que aguardava o material — ligado por padrão' }`
e `{ chave: 'notificacoes_dest_recebimento', label: 'Destinatários — Entrada de recebimento', tipo: 'text', descricao: 'E-mails (lista) para o aviso de entrada de recebimento; vazio usa os destinatários de Compras' }`.
Leitura: lista por `alertService.parseList` (JSON ou vírgula), como as outras.

### Serviço novo `server/services/almoxarifado/receiptNotificationService.js`

```
avisarEntradaConfirmada(db, user, recebimentoId)
  -> { desligado: true }                                         // chave '0'
   | { sem_entrada: true }                                       // nenhum item entrou (RN-04)
   | { nota: <retorno de enfileirar>, requisitantes: [{ requisicao_id, ...retorno de enfileirar }] }
montarAvisoNota(dados) -> { assunto, corpo_texto }               // pura, exportada
montarAvisoRequisitante(dados) -> { assunto, corpo_texto }       // pura, exportada
```

Lança só em erro de banco — quem chama engole (RN-05). `alertService` requerido **lazy** (padrão do ciclo documentado
em `notificationQueueService.js:1-25`). `corpo_html` = escape linha a linha
(`<div>${linhas.map(l => `<p>${escapeHtml(l)}</p>`)}</div>`), como `dispararAlertaRegistrado`.

**Dados do aviso da nota** — itens do recebimento com `entrada_estoque_em IS NOT NULL` e quantidade > 0
(`quantidadeDoItem`), na ordem de `id`; retido = `COALESCE(quantidade_em_inspecao,0) > 0`; destino = nome/código de
`localizacao_entrada_id` quando houver (sem destino: a linha omite o trecho).

**Evento `RECEBIMENTO_ENTRADA`** — dedupe `recebimento-entrada-<id>`; payload
`{ recebimento_id, numero, itens: <n>, requisicoes: [ids] }`.

Assunto (literal): `[Almoxarifado] Entrada confirmada — <numero>` + (` — NF <nota_fiscal>` quando houver NF).

Corpo (literal, linhas na ordem; linhas entre colchetes só quando houver o dado):
```
A nota deu entrada no estoque.
Recebimento: <numero>
Nota fiscal: <nota_fiscal | "não informada">
Fornecedor: <fornecedor_nome | fornecedor_cnpj | "não informado">
[Pedido de compra: <pedido_compra_numero>]
Data/hora: <formatDateTimePtBr()>
Usuário: <user.nome | user.email | "usuário #<id>">
Itens que entraram:
- <codigo> — <nome>: <qtd> <unidade>[ em <localizacao>] — <"disponível" | "retido para inspeção">
[Requisições que aguardavam estes materiais: <REQ-numero> (<solicitante_nome>), …]
Link: <appBase>/almoxarifado/recebimentos
```
`<qtd>` = `String(Number(q.toFixed(6)))` (sem zeros à direita, sem ruído de ponto flutuante).

**Evento `RECEBIMENTO_ENTRADA_REQUISITANTE`** — dedupe `recebimento-entrada-<recebimento_id>-req-<requisicao_id>`;
destinatário único `usuarios.email` (`COALESCE(ativo,1) = 1 AND email IS NOT NULL AND TRIM(email) <> ''`); payload
`{ recebimento_id, requisicao_id, numero_requisicao }`. Materiais = os do D4, quantidade que entrou **livre** somada por
material nesta nota.

Assunto (literal): `[Almoxarifado] Chegou material da sua requisição <numero_requisicao>`

Corpo (literal):
```
Chegou ao estoque material que a sua requisição aguardava.
Requisição: <numero_requisicao>
Situação da requisição: <"Aguardando compra" | "Aguardando estoque">
Recebimento: <numero_recebimento>
Materiais que chegaram:
- <codigo> — <nome>: entrou <qtd> <unidade> (pendente na requisição: <pendente> <unidade>)
O material ainda não está reservado para a sua requisição — a separação é feita pelo almoxarifado.
Link: <appBase>/almoxarifado/requisicoes
```

### Ganchos em `receiptService.js`

- `processarNota`: depois de `fecharSolicitacoesDoPedido` (o último passo de hoje), antes do `return`:
  `try { await receiptNotificationService.avisarEntradaConfirmada(db, user, recebimentoId); } catch (e) { console.warn(...) }`.
- `aprovarRecebimento`, ramo direto: no mesmo lugar relativo (depois do `fecharSolicitacoesDoPedido`). O ramo que delega
  para `processarNota` **não** chama de novo.
- Literal do `console.warn`: `[recebimento] aviso de entrada confirmada falhou (recebimento <id>): <mensagem>`.

### Rotas e contratos que não mudam

`/processar`, `/workflow`, `/aprovar` — payload, respostas e recusas **idênticos** (o aviso não aparece na resposta).
`enfileirar`, o dedupe e o worker (12); `MOVIMENTACAO` e a supressão no estorno (12/21c.1); a idempotência da entrada
(5/36); o destino por item (57); `GET /notificacoes` (aceita os eventos novos por igualdade, sem mudança).

## Tasks

Ordem topológica: **T1 → T2** (tronco, sequenciais, um executor); **T3** (galho de cliente, contrato acima, paralelo à
T2 em worktree); **T4** (integração) depois de T2; **T5** fechamento. Executores de galho **não** marcam este plano.

- [x] **T0 (tronco, Fase 2) — "chegou zero" não entra.** `quantidadeDoItem` com `??`; o INSERT de
  `criarRecebimento` com `recebidaInformada(...) ? recebida : qtd` (o `''` continua caindo na esperada — o `??` puro
  gravaria `''`); o espelho da tela `quantidadeQueEntra` (modal de Processar e contador de séries) com a mesma regra.
  Teste novo `recebimentoChegouZero.api.test.js` (5: serviço 1 item/2 itens/NULL/aprovar direto; rota criar→conferir→
  workflow→fiscal→processar com a NC de quantidade intacta). **Divergência:** dois testes antigos PRENDIAM o defeito e
  foram corrigidos dizendo isso — `recebimentoDestinoPorItem.api.test.js` ("recebida=0 usa a esperada") e o fixture
  952 de `RecebimentosProcessarDestino.test.js` ("recebida 0 → cai na esperada"); `relatorioQualidadeFornecedores`
  (67) não mudou. Sabotagens: `||` em `quantidadeDoItem` → 4/5 caem; `|| qtd` no INSERT → cai só a asserção do
  INSERT; `||` na tela → (a) cai (o ALM-0207 aparece); `||` contra o teste da 57 → cai com o 400 do destino inativo.
  Commit `faa8f65`. Suíte: api 257/258 antes do ajuste do teste da 57 (o único vermelho era ele) → verde.
- [x] **T0b (tronco, Fase 2) — claim do processamento.** `processando_em DATETIME` (`recebCols`, safeAlter);
  `reivindicarProcessamento` = `UPDATE … SET processando_em = CURRENT_TIMESTAMP WHERE id = ? AND status NOT IN
  ('PROCESSADO','APROVADO') AND (processando_em IS NULL OR processando_em < datetime('now','-10 minutes')) RETURNING id`;
  sem claim → status terminal dá a recusa de sempre (400), senão **409 `Esta nota já está sendo processada`**;
  `liberarProcessamento` no `finally` (falha não mascara o resultado; a marca expira em 10 min). Vale em `processarNota`
  e no ramo direto de `aprovarRecebimento` (o ramo que delega herda o de `processarNota`). **Divergência do plano:** a
  expiração de 10 min não estava escrita — sem ela, um processo que morre no meio trava a nota para sempre com 409.
  Teste novo `recebimentoProcessamentoConcorrente.api.test.js` (7): corrida pelo serviço (1 ok + 1 409, **uma** conta a
  pagar — a Surpresa 5 era real: sem o claim saem `contas_pagar_id` 1 e 2), pela rota `[200, 409]`, corrida no
  `aprovarRecebimento` direto, sequencial continua 400, pré-checagem limpa a marca, falha parcial retomável, marca
  recente 409 / velha liberada. Sabotagens: sem claim em `processarNota` → 3 caem (duas contas a pagar medidas); não
  libera → 5 caem; sem expiração → cai só o da marca velha; sem claim no `aprovar` → cai o da corrida do aprovar. O
  ramo "status virou terminal entre a leitura e o claim → 400" não tem cenário determinístico no harness (declarado).
  Suíte: api 259/259, almoxarifado 44/44, validation 4/4, safealter 3/3, sqlite 5/5.
  Commit `0d8bcfa`.
- [x] **T1 (tronco) — o serviço e a configuração. FEITA** (registro abaixo; o texto original da task segue).
  `receiptNotificationService.js` com o contrato REVISTO pela Fase 2: chaves `notificar_recebimento_entrada` ('0') e
  `notificar_recebimento_solicitante` ('1') + `notificacoes_dest_recebimento` ('') semeadas; `CHAVES_BOOL` com as duas.
  Retorno: `{desligado:true}` (as duas em '0') | `{sem_entrada:true}` | `{ nota: <enfileirar> | {enfileirada:false,
  motivo:'DESLIGADO'}, requisitantes: [{requisicao_id, ...enfileirar}] }`. Critério por item (PODE_SEPARAR − EM_SEPARACAO,
  `ativo`, pendente de separação − reservado ATIVO do item > 1e-9, material que entrou livre). Link do requisitante =
  `basePath` do `modulo_origem` + `/requisicoes-material` (sem módulo → `/almoxarifado/requisicoes`); o mapa do servidor
  é espelho de `requisicoesMaterialConfig.js` amarrado por teste que lê o arquivo do cliente. "Situação da requisição"
  ganhou rótulos para os seis status possíveis. **Decisão registrável (letra B):** a linha "Requisições que aguardavam
  estes materiais" do aviso da nota lista quem espera QUALQUER material que entrou (livre ou retido) — é a plateia de
  Compras/almoxarifado; só o aviso ao solicitante exige material livre. Teste `recebimentoAvisoEntrada.api.test.js`
  (17). Sabotagens (todas caem na asserção certa): (a) lista `notificacoes_dest_entradas` → RN-06; (b) aceitar
  EM_SEPARACAO → negativas; (b2) ignorar reserva → por item + negativas; (b3) só AGUARDANDO_* → o PARCIALMENTE_RESERVADA;
  (c) retido como livre → RN-09; (d) dedupe com `Date.now()` → dedupe; (e) sem filtro `entrada_estoque_em` → RN-04 (D6);
  (f) link fixo → espelho + RN-08; (g) sem as chaves em `CHAVES_BOOL` → RN-07 (PUT 200). Suíte: api 260/260,
  almoxarifado 44/44, validation 4/4, safealter 3/3, sqlite 5/5.
  *Texto original da T1 (substituído pelo registro acima — o (b) "aceitar APROVADO" deixou de valer: a Fase 2 pôs APROVADO no critério):* `receiptNotificationService.js` (contrato acima); as duas chaves
  semeadas em `schema.js`; `CHAVES_BOOL` em `routes/almoxarifado.js:2729`. Teste novo
  `server/tests/api/recebimentoAvisoEntrada.api.test.js` (pelo **serviço**, harness real, `usuarios` criado como em
  `regrasUrgenciaCliente.api.test.js:31`): `montarAvisoNota`/`montarAvisoRequisitante` com as literais exatas; RN-04,
  RN-06 (cada nível + toggle de alertas desligado), RN-07 (chave '0' e o `PUT` com valor inválido), RN-08 (positivo e
  as quatro negativas), RN-09 (com e sem `inspecao_material_critico`), dedupe (segunda chamada `DUPLICADA`).
  Controle positivo: (a) ler a lista de `notificacoes_dest_entradas` em vez da cadeia → RN-06 cai; (b) aceitar
  `APROVADO` na RN-08 → a negativa cai; (c) contar retido como livre → RN-09 cai; (d) dedupe com `Date.now()` → o
  "segunda chamada DUPLICADA" cai; (e) ler itens sem o filtro `entrada_estoque_em` → RN-03/04 caem.
  Commit `5aaa5c1`.
- [x] **T2 (tronco) — os ganchos. FEITA.** `avisarEntradaConfirmadaSemFalhar` em `receiptService.js` (try/catch →
  `console.warn('[recebimento] aviso de entrada confirmada falhou (recebimento <id>): <msg>')`), chamado no fim de
  `concluirProcessamentoNota` e de `concluirAprovacaoDireta` — os dois corpos que rodam DENTRO do claim da T0b, depois
  do UPDATE de status e do `fecharSolicitacoesDoPedido`. **Divergência:** testes num arquivo próprio
  `recebimentoAvisoEntradaRotas.api.test.js` (12), não no da T1 — lá o serviço é chamado direto sobre entrada sem gancho,
  e o gancho tornaria a 2ª chamada DUPLICADA. Cenário novo além do plano: **D6 por trigger** (`RAISE(ABORT)` no UPDATE de
  status → 500 e fila vazia), o que tornou a sabotagem (i) matável. Sabotagens: (f) gancho só em `processarNota` → cai o
  `/aprovar` direto; (g) gancho também no ramo que delega → **sobrevive** (12/12: o dedupe segura — esperado, a
  duplicação de chamada é inofensiva); (h) `throw` no catch → RN-05 cai com 500; (i) gancho antes do UPDATE → cai o D6;
  (j) sem o claim da T0b → caem as duas corridas, e a do serviço cai pelo **conteúdo** (o aviso guardado lista o crítico
  "disponível" — o defeito da sonda `sonda70r-corrida2.js` reproduzido). Suíte: api 261/261, almoxarifado 44/44,
  validation 4/4, safealter 3/3, sqlite 5/5.

  **Contrato final que a T3 (tela) consome** — `GET/PUT /api/almoxarifado/configuracoes` (o PUT só grava chave semeada;
  `CHAVES_BOOL` recusa fora de '0'/'1' com `Configuração "<chave>" deve ser 0 ou 1`):

  | chave | tipo | default semeado | label/descrição sugeridos |
  |---|---|---|---|
  | `notificar_recebimento_entrada` | boolean | `'0'` | *Avisar Entrada de Recebimento por E-mail* — um e-mail por nota que entrou no estoque, para a lista abaixo (desligado por padrão) |
  | `notificar_recebimento_solicitante` | boolean | `'1'` | *Avisar o Solicitante quando o Material Chega* — um e-mail ao solicitante de cada requisição que esperava o material que entrou livre (ligado por padrão) |
  | `notificacoes_dest_recebimento` | text (lista: JSON ou vírgula) | `''` | *Destinatários — Entrada de recebimento* — vazio usa os destinatários de Compras (`notificacoes_dest_compras`, depois `compras_notificar_emails`) |

  As três têm leitor literal no servidor (`receiptNotificationService.js`), então a amarração de
  `configuracoesGerais.api.test.js` passa ao entrarem em `CAMPOS`; a fixture de `ConfiguracoesGerais.test.js` precisa
  das três linhas. Painel (`NotificacoesAlmoxarifado.js`, `EVENTO_OPCOES`, D8): eventos `RECEBIMENTO_ENTRADA` (*Entrada
  de recebimento*) e `RECEBIMENTO_ENTRADA_REQUISITANTE` (*Aviso ao requisitante*); `GET /notificacoes?evento=` já aceita
  por igualdade. Payloads: nota `{ recebimento_id, numero, itens, requisicoes: [ids] }`; requisitante
  `{ recebimento_id, requisicao_id, numero_requisicao }`.

  *Texto original da T2:* **T2 (tronco) — os ganchos.** Os dois pontos em `receiptService.js` (contrato). Testes no mesmo arquivo, **pelas
  rotas**: RN-01 pelas quatro entradas (`/processar`, `/workflow processar`, `/aprovar` delegando, `/aprovar` direto);
  RN-02 (reprocessar; `Promise.all` de dois `/processar`); RN-03 (pré-checagem recusa, corrige, processa); RN-05 (fila
  quebrada → 200 e estado intacto); RN-10 (com `notificar_movimentacoes = '1'`: 2 `MOVIMENTACAO` + 1 `RECEBIMENTO_ENTRADA`).
  Controle positivo: (f) gancho só em `processarNota` → o `/aprovar` direto cai; (g) gancho também no ramo que delega
  → continua 1 linha (prova que o dedupe segura, e registra que a duplicação de chamada seria inofensiva); (h)
  `throw` no `catch` → RN-05 cai com 500; (i) gancho **antes** do `UPDATE` de status → (só registrar: o cenário que
  distingue é a falha no UPDATE; se não houver como provocar no harness, declarar a sabotagem como sobrevivente com
  motivo).
- [x] **T3 (galho, cliente) — a tela. FEITA em `b90e228`.** As **três** linhas do contrato final (o texto abaixo dizia
  "duas" — escrito antes de a Fase 2 separar `notificacoes_dest_recebimento`; estava errado) entraram em `CAMPOS` logo
  depois de `notificacoes_dest_compras`: *Avisar Entrada de Recebimento por E-mail* (boolean, ajuda diz lista
  compartilhada/Compras e "desligado por padrão"), *Avisar o Solicitante quando o Material Chega* (boolean, "só para
  quem pediu", "ligado por padrão"), *Destinatários — Entrada de Recebimento* (text). Fixture com as três (ids 22-24,
  defaults semeados). Teste novo de Salvar: default manda `'0'`/`'1'`/`''`; ligar/desligar/preencher manda cada chave
  com o próprio valor. Painel: `RECEBIMENTO_ENTRADA` (*Entrada de recebimento*) e `RECEBIMENTO_ENTRADA_REQUISITANTE`
  (*Aviso ao requisitante*) no filtro + teste que confere literal/rótulo e o `?evento=`; comentário "8" → "10 eventos".
  **Correção do controle previsto:** tirar a linha da fixture NÃO derruba "os testes de Salvar" (booleana não tem
  prefixo do guard de dias, como as da 46 tinham) — derruba o teste novo, porque o payload leva `''` e o PUT
  recusaria com "deve ser 0 ou 1". Sabotagens (perl, âncora 1, restauro por cópia + md5 OK): S1 fixture sem
  `notificar_recebimento_entrada` → 1 cai; S2 sem a opção REQUISITANTE → 1 cai; S3 chaves das duas booleanas
  trocadas → 1 cai; S4 `notificacoes_dest_recebimentos` (typo) em `CAMPOS` → `configuracoesGerais.api.test.js` 3/15
  caem. Verde: client 74 suítes / 1124 testes, `CI=true` build ok, `configuracoesGerais.api` 15/15.
  *Texto original:* `ConfiguracoesAlmoxarifado.js` `CAMPOS` (as duas linhas do contrato, junto das
  de notificação); fixture de `ConfiguracoesGerais.test.js` com as duas chaves; um teste de Salvar mandando
  `notificar_recebimento_entrada: '0'`; `NotificacoesAlmoxarifado.js` `EVENTO_OPCOES` com os dois eventos (D8) e o
  comentário "8 eventos" corrigido. A amarração `configuracoesGerais.api.test.js` tem de passar sem mexer nela (a T1
  dá o leitor literal). Controle positivo: tirar a linha da fixture → os testes de Salvar caem (como na 46).
- [ ] **T4 (integração, cruza galhos e o módulo Compras).** `server/tests/api/recebimentoAvisoEntradaIntegracao.api.test.js`,
  molde de `recebimentoContraPedidoIntegracao.api.test.js` + `requisicaoEstados.api.test.js:218-229`: (1) material M
  sem saldo + solicitação de compra `PENDENTE` → requisição de M (solicitante com e-mail em `usuarios`) → `/aprovar` →
  `AGUARDANDO_COMPRA`; (2) `POST /api/compras/pedidos` com M; (3) `POST /recebimentos` contra o pedido →
  `/workflow` até `EM_ENTRADA_NF`, `/conferir`, `PUT /fiscal`; (4) `/processar` → a fila tem **exatamente** 1
  `RECEBIMENTO_ENTRADA` (para a lista de Compras configurada, citando o pedido e a requisição) e 1
  `RECEBIMENTO_ENTRADA_REQUISITANTE` (para o solicitante), e a solicitação de compra virou `RECEBIDA`; (5) reprocessar
  → 400 e a fila igual; (6) a requisição continua `AGUARDANDO_COMPRA` e **é separável** (`/separar` 200) — o aviso não
  quebrou o gesto seguinte; (7) a mesma jornada **pelo serviço** (`aprovarRecebimento` ramo direto) com outro material.
- [ ] **T5 (fechamento) — skill `fechar-etapa`.** Spec 08: item `[x]` com hashes **e** a correção dizendo que o
  *"Desmarcado: é da feature 19 … não foi tocado"* estava errado (o `MOVIMENTACAO` cobria a entrada desde `77d1f38`);
  spec 19: linha nova na tabela de eventos + o `[ ]` de "destinatários por tipo de evento" ganha a nota "o recebimento
  ganhou lista própria"; mapa; guia (Antes → Agora, roteiro clicável: ligar/desligar, processar, ver no painel);
  manual 21c.1 (o aviso novo); letra B (B316–B323), A34, D (70), G (o `aprovarRecebimento` sem auditoria, se
  confirmado); o comentário de `nonConformityService.js:20` (pendência da 69) num commit próprio se ainda estiver lá.

## Letra A — consulta para produção (A34)

Quantos avisos de requisitante a primeira nota de cada material pode gerar, e quem não vai receber por cadastro:

```sql
SELECT r.status, COUNT(DISTINCT r.id) AS requisicoes,
       SUM(CASE WHEN u.id IS NULL OR COALESCE(u.ativo,1) = 0 OR TRIM(COALESCE(u.email,'')) = '' THEN 1 ELSE 0 END) AS sem_email_valido
FROM requisicoes_almoxarifado r
LEFT JOIN usuarios u ON u.id = r.solicitante_id
WHERE r.status IN ('AGUARDANDO_COMPRA','AGUARDANDO_ESTOQUE')
GROUP BY r.status;
```
E as listas que vão receber o aviso da nota no dia do deploy:
`SELECT chave, valor FROM configuracoes_almoxarifado WHERE chave IN ('notificacoes_dest_recebimento','notificacoes_dest_compras','compras_notificar_emails');`
Nada é retroativo: só notas processadas **depois** do deploy avisam.

## O que fica de fora (vira "falta" ou "fora por decisão", com o motivo)

- **Comprador do pedido e solicitante da solicitação de compra como destinatários** — o banco não tem nenhum dos dois
  (Fase 0 §3). Exige coluna no pedido (core Compras) e autoria na solicitação; etapa própria.
- **Aviso ao requisitante quando a inspeção LIBERA o material retido** — outro ponto terminal (`inspectionService`
  decide/libera; a NC 44 libera). Falta para o 🟢 da 19 ou próxima etapa: mesmo serviço, novo gancho.
- **Correção/supressão do aviso no estorno** — D7.
- **Status da requisição se ajustar sozinho** — D4; a Fila de separação já é o canal do almoxarife.
- **Deep-link para o recebimento** — a tela não lê `?id=` (`RecebimentosAlmoxarifado.js` sem `useSearchParams`); o link
  vai para a lista e o assunto carrega o número.
- **Comprovante PDF / modelo configurável** — cortes D3 da 19, que não se reabrem.

## Pontos de atenção para a Fase 2 (revisor: siga cada RN até o último gesto)

1. **Os quatro caminhos até o status terminal** (`/processar`, `/workflow`, `/aprovar` delegando, `/aprovar` direto) e o
   serviço — o gancho está nos dois pontos certos e nenhum caminho chama duas vezes **sem** o dedupe segurar?
2. **Depois do aviso, o que o usuário faz:** separar a requisição avisada (`/separar` de `AGUARDANDO_COMPRA`), reenviar o
   aviso pelo painel (`reenviar` só tem guarda para `MOVIMENTACAO` — o aviso de nota reenviado depois de um estorno
   repete a informação velha: aceitável pelo D7?), filtrar no painel pelo evento novo.
3. **A retomada após falha parcial** (RN-03): existe no harness um jeito de fazer o item B lançar **depois** do claim
   (o `recebimentoEntradaAtomica.api.test.js` tem o caso "marca devolvida") para provar que o aviso final lista A e B?
4. **`usuarios` não existe no harness** (`PRAGMA table_info(users)` vazio; a tabela é `usuarios`, criada por teste) — a
   ausência da tabela em produção é impossível, mas no harness o serviço tem de cair em "sem e-mail" sem derrubar o
   aviso da nota (o `try` por consulta, não só o do chamador).
5. **Material de cliente** (Etapa 8): requisição de material de cliente em `AGUARDANDO_*` — avisa igual (nada na RN-08 o
   exclui). Confirmar que é o desejado.
6. **Requisição com o mesmo material em dois itens** — a soma do pendente e o "entrou" por material, não por item.
7. **Surpresa 5** (dois `processarNota` simultâneos geram duas contas a pagar?) — medir por sonda e, se real, registrar
   como letra C (não é desta etapa consertar).

## Fase 2 — revisão do plano: 1 crítico, 5 importantes, 8 menores → plano revisto (vale sobre o texto acima)

- **CRÍTICO (defeito anterior, derruba a RN-04) — "chegou zero" entra com a esperada.** `quantidadeDoItem` usa
  `quantidade_recebida || quantidade_esperada` (`receiptService.js:1067-1068`; sonda `sonda70r-zero.js`: esperada 5,
  conferida 0 → saldo 5). A tela grava o 0 de propósito. → **task nova T0 (tronco, primeira)**: `??` no lugar de `||`
  em `quantidadeDoItem` e no INSERT do item (`:491`, o `|| qtd` que a D (67) registrou), com o caminho de quantidade 0
  no processar provado (não dá entrada, não trava a nota, a divergência continua). O aviso nunca anuncia o que não
  entrou.
- **IMPORTANTE — dois cliques simultâneos: o dedupe guarda o aviso ERRADO** (sonda `sonda70r-corrida2.js`: o perdedor
  chega primeiro ao gancho e lê o crítico "disponível"). → **T0b (tronco)**: claim no nível do recebimento —
  coluna `processando_em` (`safeAlter`), `UPDATE … SET processando_em = now WHERE id = ? AND processando_em IS NULL AND
  status <> 'PROCESSADO'`; o perdedor toma 409 **`Esta nota já está sendo processada`**; o vencedor limpa a marca no
  `finally` (falha parcial continua retomável). Fecha também a Surpresa 5 (conta a pagar em dobro). Não é status novo
  (não mexe em telas/listas). A RN-02 confere o CONTEÚDO, não só a contagem.
- **IMPORTANTE — deploy manda e-mail na hora para três pessoas reais** (produção: `compras_notificar_emails` com 3
  endereços, SMTP configurado, worker rodando). → D3 revisto: **`notificar_recebimento_entrada` nasce `'0'`** (o aviso
  da nota vai para uma lista compartilhada — ligar é decisão de quem opera); **`notificar_recebimento_solicitante`
  nasce `'1'`** (o aviso vai só a quem pediu o material — é o valor da etapa). Letra A/B: a A34 imprime os destinos
  efetivos.
- **IMPORTANTE — o critério do D4 (só `AGUARDANDO_*`) perde quem esperava**: uma requisição com um item com saldo e
  outro sem fica PARCIALMENTE_RESERVADA/APROVADO. → **por item**: pendente de separação − reservado para o item > 0,
  status em `PODE_SEPARAR` exceto `EM_SEPARACAO`, `COALESCE(ativo,1) = 1`, item cujo material entrou disponível nesta
  nota.
- **IMPORTANTE — link para quem pediu de outro módulo**: o link sai do `basePath` do `modulo_origem`
  (`requisicoesMaterialConfig.js`; o servidor espelha o mapa — fonte única se possível), não sempre
  `/almoxarifado/requisicoes`.
- **IMPORTANTE — aviso eterno de requisição esquecida**: declarado (letra C) + a A34 mede a idade das requisições que
  seriam avisadas; sem corte automático nesta etapa (descartado: horizonte arbitrário).
- Menores: o contrato usa `<numero>` (o número já é `REQ-…`); material de cliente avisado igual (decisão B); outros
  caminhos de entrada (avulsa, devolução, retorno de terceiro, liberação da inspeção/NC) **fora**, com motivo na seção
  "fica de fora"; `/conferir` com `status: 'APROVADO'` pela API aprova sem dar entrada → letra C (anterior, só API);
  "retido" lido na retomada reflete o estado atual (declarado); T3 nasce do commit da T1 (o teste
  `configuracoesGerais.api.test.js:91-104` lê o `CAMPOS` do cliente); SMTP desligado gera FALHA + FALHA_NOTIFICACAO
  (ruído declarado); o guia explica "Chegou" com a requisição ainda "Aguardando compra".
