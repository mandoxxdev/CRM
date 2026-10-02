# Etapa 73 — a requisição que espera compra nasce com o status certo, em qualquer porta de aprovação (feature 04, com a 07 e a 18)

> Status: **PLANO (Fase 1) — 2026-10-02.** Nada de código ainda. Próximo passo: Fase 2 (revisão do plano por agente
> fresco). Origem: "Próxima tarefa detalhada — Etapa 73" de
> `docs/superpowers/plans/2026-10-02-almoxarifado-etapa72-solicitacao-fecha-por-material.md:708-743`.

**Escopo desta etapa (reduzido pela medição — ver Fase 0 §3):**
1. **C116** — a requisição sem saldo cujo material tem compra **vinculada a pedido e ainda a caminho** é aprovada como
   `AGUARDANDO_COMPRA`, não `AGUARDANDO_ESTOQUE`. Critério pela fonte única da Etapa 72
   (`purchaseService.posicaoDasSolicitacoes`, `a_caminho > 0`, dentro do horizonte).
2. **As três portas de aprovação com o mesmo pós-aprovação.** Hoje só o `/aprovar` calcula `AGUARDANDO_*`. A liberação
   por valor grava `APROVADO` mesmo sem saldo, e a **aprovação automática** grava `APROVADO` **sem reservar nada** (achado
   novo desta Fase 0, Surpresa 2). As três passam a reservar o que há e a cair em `AGUARDANDO_COMPRA`/`AGUARDANDO_ESTOQUE`
   quando não há nada.
3. **A tela diz quando o material chegou.** O detalhe de uma requisição `AGUARDANDO_*` com saldo para algum item mostra
   que já dá para separar, em vez de "sem saldo disponível".
4. **G80** — o teste ponta a ponta dos indicadores (Etapa 67) deixa de falhar de forma intermitente. A medição achou
   **duas** causas, e a principal **não é a data** (Fase 0 §5): é a ordem dos itens da requisição, que a criação grava
   com `Promise.all`.

**Fora:** mudar o status da requisição quando o material chega (Fase 0 §3: não tem valor, a fila da 64 já trata) e
**reservar o que chegou para quem esperava** (tem valor, mas é motor + estorno + inspeção + ordem de disputa: candidata
da Etapa 74, seção no fim). Detalhes em "O que fica de fora".

**Toque em Compras:** nenhum. Lê só o que a Etapa 72 já lê.

## Fase 0 — medido (2026-10-02)

Réguas testadas contra caso conhecido antes de medir ausência: `grep -rn "AGUARDANDO_COMPRA\|AGUARDANDO_ESTOQUE"` no
servidor fora de `tests/` acha a máquina de estados, a rota `/aprovar`, o dashboard e o aviso da 70. Ou seja, a régua
enxerga quem escreve e quem lê. No cliente, acha `RequisicoesList.js` (badge, banner, filtro) e `AlmoxPageHeader.js`.

### 1. Quem escreve e quem lê `AGUARDANDO_COMPRA` / `AGUARDANDO_ESTOQUE`

| Onde | O que faz |
|---|---|
| `requisitionStateMachine.js:121-143` `calcularStatusPosAprovacao` | **único cálculo.** Se nenhum item tem `disponível > 0`, conta `solicitacoes_compra_almoxarifado` com `status = 'PENDENTE'` **só** (`:138`) dentro do horizonte → `AGUARDANDO_COMPRA`, senão `AGUARDANDO_ESTOQUE` |
| `routes/almoxarifado.js:3388` (`PUT /requisicoes/:id/aprovar`) | **único chamador.** `statusFinal = reserva.status \|\| statusPosAprovacao` (`:3404-3405`), um `UPDATE` com o gate de regras (`:3410-3413`) |
| `routes/almoxarifado.js:3500-3532` (`PUT /aprovar-valor`) | **não chama** o cálculo. `aprovarValor` grava `APROVADO` (`requisitionValueApprovalService.js:201-206`); a rota reserva depois e, se nada foi reservado, **fica `APROVADO`** mesmo sem saldo nenhum |
| `routes/almoxarifado.js:3228-3238` `tentarAprovacaoAutomatica` (do `POST /requisicoes` `:3265` e do `/enviar` `:3333`) | grava `APROVADO` direto. **Não reserva e não calcula `AGUARDANDO_*`** (Surpresa 2) |
| `requisitionStateMachine.js:48-49` `TRANSICOES` | `AGUARDANDO_*` só saem para `EM_SEPARACAO` ou `CANCELADO` |
| `requisitionStateMachine.js:71-72` `PODE_SEPARAR` | **inclui** os dois `AGUARDANDO_*` |
| `requisitionService.js:347-410` `listarFilaSeparacao` (Etapa 64) | etapa `SEPARAR` quando o item tem `separavel > 0` (**pelo saldo, não pelo status**); `AGUARDANDO_SALDO` quando não tem |
| `receiptNotificationService.js:46` (Etapa 70) | `STATUS_QUE_ESPERAM = PODE_SEPARAR − EM_SEPARACAO`; o critério é **por item** (pendente − reservado), não pelo status. O status só aparece no texto ("Situação da requisição: Aguardando compra", `:50-51`). A literal `:136` diz *"O material ainda não está reservado para a sua requisição"* |
| `alertRegistry.js:527-551` `REQUISICAO_ATRASADA` | conjunto derivado da máquina; inclui os dois |
| `routes/almoxarifado.js:3985` dashboard | os dois em "abertas" |
| Indicadores da 67 (`reportService.js`) | **não distinguem** `AGUARDANDO_*` (só excluem `RASCUNHO`/`CANCELADO`/`REJEITADO`) |
| Cliente `RequisicoesList.js:31-32` (badge), `:1636-1640` (banner do detalhe), `:1805-1806` (filtro); `AlmoxPageHeader.js:81-82` | rótulo e texto. O banner de `AGUARDANDO_COMPRA` diz *"Sem saldo disponível — há uma solicitação de compra em andamento"* |

### 2. Sonda executada pelas rotas (scratchpad `sonda73-requisicao.js`, harness real)

Solicitante e aprovador diferentes (segregação), material sem saldo com mínimo 10, tudo pelas rotas
(`verificar-minimos`, `POST /requisicoes`, `PUT /aprovar`, `POST /api/compras/pedidos` com `solicitacao_id`, recebimento
pelas seis portas, `GET /fila-separacao`, `PUT /separar`):
```
A2 R1 (6) aprovada com solicitacao PENDENTE          "AGUARDANDO_COMPRA reservas=[]"
A3 solicitacao apos gerar pedido                     "VINCULADO"
A4 R2 (3) aprovada com solicitacao VINCULADO         "AGUARDANDO_ESTOQUE reservas=[]"          <- C116 reproduzido
A4 fila                                              R1 AGUARDANDO_COMPRA:AGUARDANDO_SALDO  R2 AGUARDANDO_ESTOQUE:AGUARDANDO_SALDO
A5 nota de 4: status R1/R2                           ["AGUARDANDO_COMPRA","AGUARDANDO_ESTOQUE"]  (nao mudam)
A5 saldo / reservas                                  q=4 r=0, nenhuma reserva
A5 fila                                              R1 :SEPARAR sep=4   R2 :SEPARAR sep=3      <- ja separaveis (7 prometidos, 4 no estoque)
B1 R3 (4) aprovada DEPOIS da nota                    "TOTALMENTE_RESERVADA reservas=[4]"
B1 fila                                              R1 AGUARDANDO_SALDO  R2 AGUARDANDO_SALDO  R3 SEPARAR sep=4   <- Surpresa 1
B2 separar 4 de R1                                   400 "...Maximo: 0 (pendente: 6, disponivel: 0)"
B3 nota de 6 (completa)                              solicitacao RECEBIDA; R2 AGUARDANDO_ESTOQUE:SEPARAR
C1 aprovacao automatica SEM saldo                    resposta "APROVADO", gravado APROVADO      <- Surpresa 2
C2 aprovacao automatica COM saldo (5, pede 2)        gravado APROVADO, reservas []              <- Surpresa 2
```

### 3. O que significaria "liberar", e por que não entra

- **Voltar a `APROVADO` (ou outro status) quando o material chega: sem valor.** A fila de separação da 64 já põe a
  requisição em `SEPARAR` pelo saldo (A5), o `separar` aceita `AGUARDANDO_*` (`PODE_SEPARAR`, B4 da sonda), e o aviso da
  70 já vai ao solicitante pelo critério por item. Trocar o status mudaria só o rótulo, e ainda exigiria setas novas
  (`AGUARDANDO_* → APROVADO` não existe em `TRANSICOES`) e um gancho no recebimento para escrever em requisição.
  **O rótulo desatualizado se resolve na tela** (RN-07), sem escrever nada.
- **Reservar o que chegou para quem esperava: tem valor, e é o defeito de verdade** (Surpresa 1). Mas é maior que uma
  etapa junto com o resto: o gancho fica no recebimento (dentro do fim de `processarNota`/`concluirAprovacaoDireta`),
  disputa o mesmo saldo entre várias requisições (ordem: a mais antiga? a mais urgente?), tem de ignorar material retido
  para inspeção, muda a literal da 70 (*"ainda não está reservado"*) e cruza com o estorno da entrada da 71 (uma reserva
  criada pela nota estornada segura saldo que vai sair). **Vai para a Etapa 74**, com esta sonda como ponto de partida.

### 4. O critério certo para "aguardando compra"

`posicaoDasSolicitacoes(db, { material_id, horizonteDias })` (Etapa 72, `purchaseService.js:154`) devolve, por solicitação
`PENDENTE`/`VINCULADO`, `a_caminho` e `dentro_horizonte`. Para `PENDENTE`, `a_caminho` é a quantidade inteira. Então
**"existe linha com `dentro_horizonte` e `a_caminho > ε`"** dá exatamente a regra de hoje para `PENDENTE` (os três
testes de `requisicaoEstados` continuam verdes **sem edição**) e acrescenta o `VINCULADO` com algo a caminho. O
`VINCULADO` de pedido encerrado (`a_caminho` 0) e o de material já completo no pedido (`a_caminho` 0) **não** contam,
o que está certo: nada vem.

**Por requisição inteira, não por item** (como hoje): o cálculo só roda quando **nenhum** item tem disponível; se algum
tem, a reserva decide o status. Por item seria outra máquina de estados (B357).

**Ciclo de require:** `purchaseService` não requer a máquina, mas `alertRegistry` requer a máquina (`:18`) e
`purchaseService` requer `alertService`. Para não arriscar ciclo, a máquina requer `purchaseService` **dentro da
função** (padrão do módulo: `requisitionValueApprovalService.js:197`, `alertRegistry.js:448`).

### 5. G80 — o cenário exato que falha (e a causa que ninguém tinha visto)

**Causa 1 (a registrada, simulada):** `indicadoresSpec27Integracao.api.test.js:62-63` lê `HOJE`/`ONTEM` **uma vez**.
Sonda `sonda73-g80-virada.js` (cópia do arquivo com `HOJE` lido um dia antes — o efeito exato de a rodada atravessar a
meia-noite UTC entre a leitura e os cenários): **7 de 8 caem**. `[1 parcial]` (A com prazo "hoje" vira vencida:
`fora_do_prazo 3, em_aberto_no_dia 0`), `[1 completar]` e `[1 C89]` (em cadeia), `[2]` (`ajustes-por-motivo` com
`data_fim` de ontem: `[]`), `[3 pedido]`, `[3 CNPJ]` (guarda) e `[4]` (export sem linhas). O registro do G80 dizia "3
cenários": é o recorte de uma virada **no meio** do arquivo.

**Causa 2 (achado novo, medido às 04:37 UTC, longe da virada): 3 falhas em 12 rodadas do arquivo isolado**, todas com
`separar: "Mat E67T5 nn: não é possível separar 3 UN. Máximo: 2 (pendente: 2, disponível: 100)"` em `[1 parcial]` (e
`[1 completar]`/`[1 C89]` em cadeia pela guarda). O teste separa `[[itens[0], 2], [itens[1], 3]]` (`:132`) supondo que
o detalhe devolve os itens na ordem em que foram pedidos. **Não devolve:** `requisitionCreateService.js:190-193` grava os
itens com `Promise.all(itens.map(dbRun INSERT))`, e o `node-sqlite3` não garante a ordem de execução de comandos
paralelos na mesma conexão. O `id` do item sai trocado, e o `SELECT` do detalhe (`routes/almoxarifado.js:3177-3184`,
sem `ORDER BY`) segue o `id`. **Isto é um defeito pequeno de produção, não só do teste:** quem pede A e B pode ver B e A no
detalhe, no comprovante e na fila. O G80 "reincidiu na 72" provavelmente por esta causa, não pela data.

### Surpresas da medição

1. **A requisição que esperava perde o material para quem pediu depois** (B1). R1 e R2 esperavam desde antes do pedido;
   chega a nota de 4; R3, criada e aprovada depois, **reserva os 4** e R1/R2 voltam a "aguardando saldo". O separar de R1
   é recusado com *"Máximo: 0"*. É a regra da Etapa 4 (a aprovação reserva o disponível) agindo como deve, sem ninguém
   ter decidido a ordem de quem esperava. **Não corrigido nesta etapa** (C121, Etapa 74).
2. **A aprovação automática não reserva** (C1/C2). A Etapa 4 fez o `/aprovar` reservar e a Task 6 fez o `/aprovar-valor`
   reservar, com o argumento literal *"o mesmo fato (aprovada COM reserva) teria dois status conforme a rota que aprovou"*
   (`requisitionStateMachine.js:39-43`). A terceira porta, `tentarAprovacaoAutomatica` (Etapa 47 a unificou, `:3228`),
   ficou de fora: grava `APROVADO` com saldo e sem saldo, e não segura nada. **A spec 07 está errada** em
   `specs/modulo-almoxarifado/07-reservas/README.md:40` ("Reserva automática ao aprovar requisição", sem ressalva); a
   spec 04 (`:73`) nomeia certo as duas lanes. Configuração nasce desligada (`schema.js:2568`, `'0'`), então o defeito é
   latente em quem ligou. Corrigido aqui (RN-06, C122).
3. **A liberação por valor nunca dá `AGUARDANDO_*`.** Sem saldo, fica `APROVADO`. Corrigido aqui (RN-05).
4. **O G80 tem duas causas, e a frequente é a ordem dos itens** (Fase 0 §5). O registro do G80 nas novidades está
   incompleto e será corrigido dizendo que estava.

## Decisões reversíveis (letra B do documento de novidades; última usada: B356)

- **D1 (B357) — "aguardando compra" = existe solicitação do material com `a_caminho > ε` dentro do horizonte, pela
  `posicaoDasSolicitacoes` da 72.** Pela requisição inteira, como hoje. Descartados: (a) `status IN ('PENDENTE',
  'VINCULADO')` (a linha que a B350 recusou: contaria `VINCULADO` de pedido cancelado e de material já completo, e diria
  "aguardando compra" para quem não tem nada vindo); (b) **por item** (status misto por item não existe na máquina); (c)
  uma terceira conta do "a caminho" na máquina (a 72 fechou que há uma fonte só).
- **D2 (B358) — o status NÃO muda quando o material chega.** A tela diz que chegou (RN-07). Descartados: (a) voltar a
  `APROVADO` (sem valor medido, Fase 0 §3; seta nova na máquina e escrita em requisição a partir do recebimento); (b)
  reservar na chegada (Etapa 74, C121).
- **D3 (B359) — as três portas de aprovação com o mesmo pós-aprovação**, por uma função só. A liberação por valor, sem
  nada reservado, passa a gravar o status calculado (`AGUARDANDO_*`, ou `APROVADO` se algum item tem disponível e a
  reserva falhou). A aprovação automática passa a **pré-checar o gate**, **reservar** e gravar o status final num
  `UPDATE` guardado, devolvendo as reservas se perder a corrida, igual ao `/aprovar`. Descartados: (a) **só o
  `/aprovar`** (o C116 corrigido numa porta só deixaria o mesmo fato com três status); (b) **aprovação automática sem
  reserva, só com o status** (ficaria `TOTALMENTE_RESERVADA` sem hold, mentira pior que a de hoje); (c) **desligar a
  aprovação automática** (decisão de quem opera).
- **D4 (B360) — a resposta da criação/envio com aprovação automática devolve o status gravado** (`TOTALMENTE_RESERVADA`,
  `AGUARDANDO_COMPRA`...), não mais `'APROVADO'` fixo; `aprovacao: 'automatica'` continua. Contrato cresce: quatro
  asserções de teste das Etapas 47/48 mudam, citadas no commit. A tela (`RequisicaoForm.js:253`) lê só `aprovacao`.
  Descartado: manter `'APROVADO'` na resposta com outro status gravado (resposta mentindo sobre o banco).
- **D5 (B361) — a reserva da aprovação automática é registrada com o usuário que criou/enviou a requisição** (o
  `req.user` da rota), com `opcoes.sistema = true` (como a reserva das outras lanes, `requisitionService.js:180-184`) e a
  observação de sempre. Descartado: um usuário sintético "Sistema" (o motor exige `user.id` para a trilha e não há
  usuário de sistema no banco).
- **D6 (B362) — `TRANSICOES` não muda.** As três portas escrevem o status final num `UPDATE` direto (a `/aprovar` já vai
  de `PENDENTE` a `AGUARDANDO_*` sem passar por `APROVADO`, sem seta declarada); a liberação por valor passa por
  `APROVADO` (gravado pelo serviço) e vai a `AGUARDANDO_*`, seta que já existe. Descartado: declarar setas
  `PENDENTE → AGUARDANDO_*`/`*_RESERVADA` agora (correção de documentação da máquina, não desta regra).
- **D7 (B363) — G80: a criação grava os itens em ordem (laço sequencial), e o teste encontra o item pelo material, não
  pela posição; as datas são lidas por cenário.** Descartados: (a) `ORDER BY ir.id` no detalhe (não resolve: o `id` já
  nasce trocado); (b) só arrumar o teste (o defeito de ordem fica na tela de quem pede); (c) `db.serialize()` global
  (muda o modelo de concorrência do módulo inteiro).
- **D8 (B364) — sem backfill.** Requisições que nasceram `AGUARDANDO_ESTOQUE` pelo C116, ou `APROVADO` sem reserva pela
  aprovação automática, ficam como estão. A consulta **A37** lista as duas para quem decidir. Descartado: migração no
  boot (reservar retroativamente disputa saldo que já pode ter outro dono).

## Regras de negócio

- **RN-01 (compra vinculada é compra)** — material sem saldo; `verificar-minimos` abre a solicitação; o comprador gera o
  pedido com `solicitacao_id` (VINCULADO); requisição do material aprovada pelo `/aprovar` → **`AGUARDANDO_COMPRA`**
  (hoje `AGUARDANDO_ESTOQUE`). *Metade positiva:* a mesma requisição sem nenhuma solicitação → `AGUARDANDO_ESTOQUE`.
- **RN-02 (o que ainda falta chegar conta)** — com a nota de 4 de 10 processada (solicitação `VINCULADO`, `a_caminho` 6)
  e o saldo de 4 já consumido por outra saída → requisição nova aprovada → `AGUARDANDO_COMPRA`.
- **RN-03 (nada vem, nada espera)** — pedido marcado `cancelado` (`PATCH /api/compras/pedidos/:id/status`) com a
  solicitação ainda `VINCULADO` → requisição nova sem saldo → `AGUARDANDO_ESTOQUE`. *E* solicitação `VINCULADO` com
  `created_at` de 400 dias (fora do horizonte) → `AGUARDANDO_ESTOQUE`. *Positiva:* pedido `enviado` → `AGUARDANDO_COMPRA`.
- **RN-04 (regra de sempre)** — `PENDENTE` dentro do horizonte → `AGUARDANDO_COMPRA`; `PENDENTE` de 400 dias →
  `AGUARDANDO_ESTOQUE`; algum item com disponível → reserva e `*_RESERVADA`. Os testes da Etapa 3/11
  (`requisicaoEstados`), da Etapa 4 (`requisicaoReservaAutomatica`) e da 70 (`recebimentoAvisoEntradaIntegracao`)
  passam **sem edição**.
- **RN-05 (liberação por valor)** — requisição de valor alto, sem saldo, com compra vinculada a caminho → `PUT
  /aprovar-valor` → resposta e banco `AGUARDANDO_COMPRA`, `reservas: []`; sem compra → `AGUARDANDO_ESTOQUE`. *Positiva:*
  com saldo → `TOTALMENTE_RESERVADA` como hoje.
- **RN-06 (aprovação automática reserva e calcula)** — `aprovacao_automatica = '1'`, material com saldo 5, requisição de
  2 criada por `POST /requisicoes` → resposta `status: 'TOTALMENTE_RESERVADA'`, `aprovacao: 'automatica'`, uma reserva
  ATIVA de 2 com `requisicao_id`; disponível do material 3. Sem saldo e com compra a caminho → `AGUARDANDO_COMPRA`; sem
  nada → `AGUARDANDO_ESTOQUE`. O mesmo pelo `POST /requisicoes/:id/enviar` (rascunho). *Negativas:* urgência `CRITICO`
  → `PENDENTE`, nenhuma reserva; regra de aprovação com pendência aberta → `PENDENTE`, **nenhuma reserva criada**
  (pré-checagem antes de reservar). Pelo serviço não há porta (a aprovação automática só existe na rota) — declarado.
- **RN-07 (a tela diz que chegou)** — detalhe em `AGUARDANDO_ESTOQUE`/`AGUARDANDO_COMPRA`, modo almoxarifado, com algum
  item com pendente de separação > 0 e `saldo_atual > 0` → banner *"Chegou material para esta requisição — já dá para
  separar. O material ainda não está reservado para ela."* Sem saldo → as literais de hoje (`RequisicoesList.js:1639-1640`).
- **RN-08 (a chegada não muda o status — preso)** — depois da nota parcial, a requisição continua `AGUARDANDO_COMPRA`, a
  fila de separação mostra `SEPARAR` com `separavel` = o que chegou, e `PUT /separar` a leva a `EM_SEPARACAO`. É o
  comportamento de hoje, agora preso em teste.
- **RN-09 (a ordem dos itens é a do pedido)** — requisição criada com 5 itens de materiais distintos → `GET
  /requisicoes/:id` devolve os itens na ordem do payload, com `id` crescente, em 20 repetições seguidas.
- **RN-10 (G80)** — `indicadoresSpec27Integracao` não depende da ordem dos itens (separa pelo `material_id`) nem de uma
  leitura única do dia (cada cenário lê `HOJE`/`ONTEM` do SQLite na entrada; a cadeia `[1 parcial] → [1 completar] →
  [1 C89]`, que atravessa cenários com a mesma requisição A, espera a virada se faltar menos de 30 s para a meia-noite
  UTC antes de montar A).

## Contrato (congelado)

### `requisitionStateMachine.calcularStatusPosAprovacao(db, requisicaoId)` (T1) — mesma assinatura e retorno

Itens e o ramo "algum item tem disponível → `APROVADO`" **inalterados**. No ramo sem disponível:
```
const purchaseService = require('./purchaseService');   // DENTRO da função (ciclo, Fase 0 §4)
const horizonte = await lerHorizonteSolicitacaoDias(db);
for (const materialId of materialIds) {
  const linhas = await purchaseService.posicaoDasSolicitacoes(db, { material_id: materialId, horizonteDias: horizonte });
  if (linhas.some((l) => l.dentro_horizonte && Number(l.a_caminho) > EPS)) return 'AGUARDANDO_COMPRA';
}
return 'AGUARDANDO_ESTOQUE';
```
`EPS = 1e-9`. Sem tabela `pedidos_compra` (banco do almoxarifado sem o core): `posicaoDasSolicitacoes` já se comporta
como antes da 72 para `PENDENTE`; se lançar, **o cálculo cai para a consulta antiga só de `PENDENTE`** (try/catch com
`console.warn('[almoxarifado-aprovar] posicao das solicitacoes indisponivel: <msg>')`) — a aprovação nunca quebra por
causa do rótulo. O comentário do topo da função ganha a regra nova (Etapa 73, C116) sem apagar o histórico da 11/14.

### Função única do pós-aprovação — `requisitionService.prepararPosAprovacao(db, requisicaoId, user, reqRow)` (T2, nova, exportada)

```
const statusPos = await calcularStatusPosAprovacao(db, requisicaoId);
const reserva = await reservarItensAprovacao(db, requisicaoId, user, reqRow);
return { status: reserva.status || statusPos, reservas: reserva.reservas };
```
E `desfazerReservas(db, user, reservas)` (exportada): o laço de `liberarReserva` com `statusFinal: 'LIBERADA'`,
`motivo: 'Aprovação recusada — reserva desfeita'`, `motivoMovimentacao: 'Liberação por aprovação recusada'`, cada uma no
seu try com o `console.warn` de hoje (`routes/almoxarifado.js:3417-3427`). O `/aprovar` passa a usar as duas **sem mudar
comportamento** (mesma ordem: gate → pós-aprovação → `UPDATE` guardado → desfaz se perdeu).

### `PUT /api/almoxarifado/requisicoes/:id/aprovar-valor` (T2)

Gate, segregação, recusas e literais **inalterados** (vivem em `aprovarValor`). Depois do serviço:
`const pos = await prepararPosAprovacao(...)`; se `pos.status !== 'APROVADO'` → `UPDATE requisicoes_almoxarifado SET
status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'APROVADO'` (guardado: não sobrescreve quem mexeu no
meio). Resposta `{ success, status: <gravado>, reservas }`. Auditoria `APROVACAO_VALOR` com `dados_novos.status` = o
gravado. Hoje o `UPDATE` da reserva é sem guarda (`:3517`); passa a ter a guarda acima.

### `tentarAprovacaoAutomatica(requisicaoId, urgencia, user)` (T2) → `null | { status, reservas }`

1. Config ≠ `'1'` ou urgência `CRITICO` → `null` (como hoje).
2. `reqRow` relido; `approvalRulesService.exigirSemPendenciaAberta(db, reqRow)` em try → se lançar, `null` (fica
   `PENDENTE`, nenhuma reserva).
3. `pos = await prepararPosAprovacao(db, requisicaoId, user, reqRow)`.
4. `UPDATE ... SET status = ?, aprovador_nome = 'Sistema (automático)', data_aprovacao = CURRENT_TIMESTAMP, updated_at =
   CURRENT_TIMESTAMP, ultimo_lembrete_enviado = NULL WHERE id = ? AND status = 'PENDENTE' AND <GATE_SQL>`.
5. `changes = 0` → `desfazerReservas(pos.reservas)` e `null`.

Respostas de `POST /requisicoes` e `POST /requisicoes/:id/enviar`: `status: auto ? auto.status : 'PENDENTE'`,
`aprovacao: 'automatica'` quando `auto`. Nada mais muda (201/200, `valor_total`, rascunho, valor alto).

### Tela — banner do detalhe (`RequisicoesList.js:1636-1640`, T3)

Para `AGUARDANDO_ESTOQUE`/`AGUARDANDO_COMPRA`: se `detalhe.itens.some(i => pendenteSeparacao(i) > 0 && Number(i.saldo_atual)
> 0)` → literal da RN-07; senão a literal de hoje do status. Pendente de separação = `quantidade_solicitada − separado`
(o helper que a tela já usa; não criar outro). Os outros status: inalterados. Nenhum campo novo da API (o detalhe já traz
`saldo_atual` por item, `routes/almoxarifado.js:3160-3166`).

### Criação — ordem dos itens (`requisitionCreateService.js:190-193`, T0)

`for (const item of itens) await dbRun(INSERT ...)` no lugar do `Promise.all`. Mesmo SQL, mesmos campos.

### O que não muda (contratos que não se reabrem)

A fila de separação (64, só leitura); o aviso de entrada e as suas literais (70); o livro de atribuição e o fechamento
da solicitação (72); o pedido que reabre (71); `TRANSICOES` e `PODE_SEPARAR`; o gate de regras e as suas literais (47);
a urgência (48); o `/aprovar` por fora (resposta, recusas, literais); todo o módulo Compras.

## Tasks

Ordem topológica: **T0 → T1 → T2** (tronco, sequenciais, um executor por vez); **T3** (galho, cliente) **em paralelo
à T2**; **T4** (integração) depois de T2 e T3; **T5** fechamento.

**Regras de paralelismo desta etapa (G84 da 72):**
- **Executor que sabota código de produção não roda em paralelo com outro que roda a suíte do servidor.** T0, T1 e T2
  sabotam produção do servidor (controles positivos) e por isso são **sequenciais entre si**.
- **T3 roda junto com a T2** porque as duas não se cruzam: a T3 só toca `client/` (sabota só `RequisicoesList.js`, roda
  só o Jest do cliente, que não lê o servidor) e a T2 só toca `server/` (roda só a suíte do servidor). Mesmo assim a T3
  vai numa **worktree própria** (junction de `node_modules`, memória do projeto), porque dois agentes nunca editam nem
  commitam na mesma árvore.
- **Dois agentes nunca no mesmo arquivo.** A T2 é a única que toca `routes/almoxarifado.js` e `requisitionService.js`
  nesta etapa; a T3 é a única no cliente; a T4 só cria um arquivo de teste novo.
- Arquivos de scratchpad com nome único por agente (`msg-e73-t2.txt`, `bak-e73-t3-...`).
- Executores de galho **não** marcam este plano; o fio principal marca.

- [x] **T0 — feita em `bd753746`.** RED medido antes da correção: 17, 16 e 16 de 20 requisições de 5 itens fora de
  ordem (rota almoxarifado, rota `requisicoes-material`, serviço). Feito: laço sequencial; `ORDER BY ir.id` no detalhe
  das **duas** rotas (a `GET /api/requisicoes-material/:id` tinha o mesmo `SELECT` sem ordem — divergência do plano,
  que só citava o do almoxarifado); no `indicadoresSpec27Integracao`, mapa por material no separar e nas entregas,
  `datas()` por cenário, espera da virada na cadeia `[1 *]` **e no `[2]`** (antes/depois do recorte no mesmo par de
  dias), e o `qualidade-fornecedores` do `[3]`/`[4]` passa a ler **ontem+hoje** na chamada (o `[3 CNPJ]` agrega o
  recebimento do `[3 pedido]`; HOJE..HOJE quebraria na virada). Controles: (a) `Promise.all` de volta → teste novo cai
  com 11/12/8 de 20 trocadas, e o dos indicadores segue verde (o mapa aguenta id trocado); (b) fixture invertendo os
  itens no banco: com o mapa 8/8, com a posição `[1 parcial]` cai com *"não é possível separar 3 UN"* (+2 em cadeia);
  (c1) leitura única do topo um dia antes → 8/8; (c2) o `[2]` lendo um dia antes → só o `[2]` cai (`ajustes-por-motivo:
  []`). Arquivo 30× seguidas verde. Suíte: `test:api` 271/271, almoxarifado 44/0, validation 4/0, safealter 3/0, sqlite
  5/0. Nenhum outro teste mudou com a ordem nova. Não provado por controle: o `ORDER BY ir.id` sozinho (o SQLite já
  devolve por rowid nesse plano de consulta; é garantia, não correção).
  Texto original: **T0 (tronco, pequena) — G80 e a ordem dos itens.** Produção: o laço sequencial na criação (contrato acima). Teste
  novo `server/tests/api/requisicaoOrdemItens.api.test.js` (RN-09: 5 itens, 20 repetições, pela rota `POST /requisicoes`
  e lido por `GET /requisicoes/:id`; mais uma pela rota cross-módulo `POST /api/requisicoes-material`, que passa pelo mesmo
  serviço — **medir antes** com `grep -n "createRequisicao" routes/*.js`). No `indicadoresSpec27Integracao.api.test.js`:
  `separada()` acha cada item pelo `material_id` (o detalhe traz `material_id`); `HOJE`/`ONTEM` lidos na entrada de cada
  cenário (os cenários `[2]`, `[3 *]`, `[4]` leem os seus; a cadeia `[1 *]` lê o seu no `[1 parcial]` e, se faltar menos de
  30 s para a meia-noite UTC — `SELECT (julianday(date('now','+1 day')) - julianday('now')) * 86400` —, espera a virada
  antes de montar A). **Controles positivos (três, cada um no cenário certo):** (a) voltar o `Promise.all` → o teste novo
  cai (é probabilístico: **medir e registrar** quantas das 20 repetições trocaram, e repetir até ver vermelho); (b) no
  `indicadoresSpec27Integracao`, voltar `separada()` para a posição **e** inverter à mão a ordem dos itens no detalhe
  (fixture: `UPDATE` trocando os `material_id` dos dois itens antes de separar, só no controle) → `[1 parcial]` cai com
  a literal *"não é possível separar 3 UN"*; (c) a sonda de virada (`sonda73-g80-virada.js`, `HOJE` lido um dia antes no
  topo) aplicada ao arquivo novo **não** derruba nada (cada cenário relê) e aplicada à leitura de um cenário derruba só
  aquele. Prova final: o arquivo **30 vezes seguidas** verde, e a suíte inteira (`test:api`, almoxarifado, validation,
  safealter, sqlite) verde sem edição de outro teste. Se algum outro teste cair com a ordem nova, é achado: vai ao plano.
- [x] **T1 — feita em `c47621d9`.** RED antes da correção: 6 de 10 cenários caindo pelo motivo certo (RN-01
  *"dizia AGUARDANDO_ESTOQUE"*, RN-02, RN-03 positiva e 400 dias, serviço VINCULADO, fallback sem warn). Teste
  `requisicaoAguardandoCompraVinculada.api.test.js`, 10/10: 7 pelas rotas (RN-01 + positiva, RN-02 com premissa
  `a_caminho 6` e o saldo consumido por `SAIDA` v2, RN-03 enviado→cancelado e 400 dias, RN-04 PENDENTE dentro/fora e
  o item com disponível → `PARCIALMENTE_RESERVADA`), 3 pelo serviço (VINCULADO sem pedido dentro/fora do horizonte;
  RECEBIDA/CANCELADA não contam; monkeypatch da posição → fallback com o warn literal e sem vazar). Controles: (a) só
  PENDENTE → 6 caem; (b) sem `a_caminho` → o cancelado cai; (c) sem `dentro_horizonte` → 3 caem; (d) `catch` sem a
  consulta antiga → o do monkeypatch cai; (e) carga fria nas três ordens sem ciclo. `requisicaoEstados` sem edição.
  Suíte: `test:api` 272/272, almoxarifado 44/0, validation 4/0, safealter 3/0, sqlite 5/0.
  Texto original: **T1 (tronco) — C116: compra vinculada a caminho é "aguardando compra".** `calcularStatusPosAprovacao` pelo contrato.
  Teste novo `server/tests/api/requisicaoAguardandoCompraVinculada.api.test.js`, **pelas rotas** (solicitação pelo
  `verificar-minimos`, pedido por `POST /api/compras/pedidos` com `solicitacao_id`, nota pelas seis portas, encerramento
  pelo `PATCH /api/compras/pedidos/:id/status`, aprovação pelo `PUT /aprovar`): RN-01, RN-02, RN-03 e a parte `/aprovar`
  da RN-04; e **um cenário pelo serviço** chamando `calcularStatusPosAprovacao` direto com fixture (solicitação `VINCULADO`
  de 400 dias por `UPDATE created_at`). `requisicaoEstados` passa **sem edição**. Controles positivos: (a) voltar ao `status
  = 'PENDENTE'` → RN-01 cai; (b) `status IN ('PENDENTE','VINCULADO')` sem `a_caminho` → RN-03 (cancelado) cai; (c) sem
  `dentro_horizonte` → RN-03 (400 dias) cai; (d) o `catch` de fallback sem a consulta antiga (devolver `ESTOQUE` direto) →
  o cenário que força a `posicaoDasSolicitacoes` a lançar (monkeypatch) cai; (e) carga fria `node -e
  "require('./services/almoxarifado/requisitionStateMachine'); require('./services/almoxarifado/purchaseService')"` e na
  ordem inversa, e `require('./services/almoxarifado/alertRegistry')` primeiro, sem ciclo.
- [x] **T2 — feita em `6fc7122a`.** RED: 9 de 11 cenários caindo pelo motivo certo (`/aprovar-valor` respondendo
  `APROVADO` sem saldo; automática `APROVADO` com e sem saldo; `prepararPosAprovacao is not a function`). Teste
  `requisicaoPosAprovacaoPortas.api.test.js`, 11/11. Asserções existentes que mudaram — **exatamente as previstas na
  Fase 2**: `requisicaoUrgencia` (3)/(3b), `integracaoRegrasUrgenciaCliente` (3), `regrasAprovacao` (10) →
  `TOTALMENTE_RESERVADA`; `regrasAprovacao` (9) → a pré-checagem automática carimba e abre a pendência; 
  `reservaPontasFaltantes` → `AGUARDANDO_ESTOQUE`; comentário de `requisicaoAprovacao`. O `(22)` de `regrasAprovacao`
  caiu na primeira rodada **só em cascata** (o `(10)` falhava antes de desligar a config); voltou sozinho.
  Controles: (a) automática sem pós-aprovação → 5 caem; (b) sem pré-checagem → a negativa da regra cai; (c) sem
  `desfazerReservas` → corrida cai na rodada 1 (a corrida acontece em 6 de 6 rodadas); (d) `/aprovar-valor` sem o
  UPDATE → 4 caem; (e) `/aprovar` com o gate depois de reservar → `regrasAprovacao` (5) cai com reserva órfã. Suíte:
  `test:api` 273/273, almoxarifado 44/0, validation 4/0, safealter 3/0, sqlite 5/0. **Divergências do contrato:**
  (1) `tentarAprovacaoAutomatica` também devolve `null` sem reservar quando a requisição relida já não está
  `PENDENTE` (evita reservar-e-desfazer à toa no segundo `/enviar` de uma corrida; o UPDATE guardado continua sendo a
  garantia); (2) no `/aprovar-valor` com `changes = 0` a resposta traz `reservas: []` (as desta chamada foram
  desfeitas) e a auditoria grava o status relido. **Achado confirmado:** a aprovação automática não grava auditoria
  `APROVACAO` (só a trilha da reserva) — registrar como C no fechamento.
  Texto original: **T2 (tronco) — as três portas com o mesmo pós-aprovação.** `prepararPosAprovacao` + `desfazerReservas` (o `/aprovar`
  migra sem mudar comportamento), a liberação por valor e a aprovação automática pelo contrato. Teste novo
  `server/tests/api/requisicaoPosAprovacaoPortas.api.test.js`: RN-05 e RN-06 pelas rotas, incluindo o `/enviar` do
  rascunho e as duas negativas da RN-06 (a da regra com pendência confere `reservas_material_almoxarifado` sem linha da
  requisição). **Medir antes** quais asserções existentes mudam: `grep -n "'APROVADO'" tests/api/requisicaoUrgencia*.js
  tests/api/regrasAprovacao*.js tests/api/integracaoRegrasUrgenciaCliente*.js` (Fase 0 achou 4: `requisicaoUrgencia:95,109`,
  `regrasAprovacao:239`, `integracaoRegrasUrgenciaCliente:86`) e qualquer teste de `/aprovar-valor` sem saldo que espere
  `APROVADO` (`grep -rn "aprovar-valor" tests/api | ...`). Cada edição citada no commit com o porquê (D4). Os testes do
  `/aprovar` (`requisicaoEstados`, `requisicaoReservaAutomatica`, `regrasAprovacao` na parte do `/aprovar`) passam **sem
  edição**. Controles positivos: (a) aprovação automática sem `prepararPosAprovacao` (volta a `'APROVADO'` fixo) → RN-06
  cai; (b) sem a pré-checagem do gate → a negativa "nenhuma reserva criada" cai; (c) sem `desfazerReservas` no `changes =
  0` → cenário de corrida (dois `/enviar` do mesmo rascunho com aprovação automática, `Promise.all`) deixa reserva órfã e
  cai; (d) liberação por valor sem o `UPDATE` do status → RN-05 cai; (e) `/aprovar` com a ordem trocada (reservar antes do
  gate) → o teste da Etapa 47 que prova "nenhum saldo preso por aprovação recusada" cai (prova que a migração do
  `/aprovar` não regrediu).
- [ ] **T3 (galho, cliente, worktree, em paralelo à T2) — a tela diz que chegou.** Banner pelo contrato. Testes no
  `RequisicoesList.test.js`: `AGUARDANDO_COMPRA` com item de saldo 4 e pendente 6 → literal nova; o mesmo com saldo 0 →
  literal de hoje; `AGUARDANDO_ESTOQUE` idem; item **já todo separado** com saldo > 0 → literal de hoje (não é "pode
  separar"); `TOTALMENTE_RESERVADA` inalterado. Controles positivos: literal trocada → cai; condição sem o pendente → o
  cenário "já todo separado" cai. Suíte do cliente e `CI=true npx react-scripts build`.
- [ ] **T4 (integração, cruza T1 × T2 × T3 pelo contrato) — a jornada de quem espera compra.** Arquivo
  `server/tests/api/requisicaoEsperaCompraIntegracao.api.test.js`, só pelas portas reais: material com mínimo →
  `verificar-minimos` → R1 aprovada (`/aprovar`) → `AGUARDANDO_COMPRA` → pedido gerado (VINCULADO) → R2 de valor alto
  liberada pelo `/aprovar-valor` → `AGUARDANDO_COMPRA` (as duas portas, mesmo fato, mesmo status) → aprovação automática
  ligada, R3 criada → `AGUARDANDO_COMPRA` → nota de 4 de 10 → as três continuam `AGUARDANDO_COMPRA` (RN-08), a fila
  mostra `SEPARAR` com `separavel` > 0, o `GET /requisicoes/:id` traz `saldo_atual > 0` no item (o dado que o banner da T3
  lê) → nota de 6 → solicitação `RECEBIDA` → R4 nova sem saldo (o estoque já separado/consumido por R1-R3 pelo
  `/separar` + `/entregar`) → `AGUARDANDO_ESTOQUE` (nada mais vem) → R5 com saldo pela aprovação automática →
  `TOTALMENTE_RESERVADA` e o disponível cai. Segundo cenário: pedido cancelado pelo `PATCH` com a solicitação `VINCULADO`
  → requisição nova → `AGUARDANDO_ESTOQUE`. Controles positivos: (s1) T1 desfeita → R2/R3 caem; (s2) aprovação automática
  sem pós-aprovação → R3 e R5 caem; (s3) liberação por valor sem o `UPDATE` → R2 cai. Só roda depois que T2 e T3
  commitaram e a worktree da T3 voltou (nunca em paralelo a uma sabotagem).
- [ ] **T5 — fechamento (skill `fechar-etapa`).** Spec 04 (linha `:72` do `AGUARDANDO_COMPRA`: "pendente" vira "a caminho",
  com a regra da 73) e **spec 07 `:40` corrigida dizendo que estava errada** (a reserva automática não valia para a
  aprovação automática até a 73). Mapa (linhas 04 e 07). Guia do usuário: seção da 73 (Antes → Agora, roteiro clicável:
  gerar o pedido → aprovar requisição sem saldo → "Aguard. Compra"; nota parcial → o detalhe diz "Chegou material…"),
  e o que não cobre (C121). Novidades: seção da 73; **B357–B364**; **A37**; **C116** marcado corrigido; **C121** (quem
  esperava perde para quem pediu depois, não corrigido, Etapa 74); **C122** (aprovação automática não reservava,
  corrigido); **G80 corrigido à vista** (a causa registrada estava incompleta: a frequente era a ordem dos itens); D (73);
  F (73). Manual do sistema: o que significa "Aguardando compra" (compra a caminho, inclusive já pedida ao fornecedor) e o
  que as três formas de aprovar fazem igual. Retro de 4 números. **Próxima tarefa detalhada — Etapa 74** (abaixo, a
  candidata).

## Letra A — consulta para produção (A37)

Antes do deploy, para saber o tamanho do legado (sem backfill, B364):
```sql
-- (1) quantas requisicoes esperam hoje, por status
SELECT status, COUNT(*) FROM requisicoes_almoxarifado
WHERE status IN ('AGUARDANDO_ESTOQUE','AGUARDANDO_COMPRA') AND COALESCE(ativo,1) = 1 GROUP BY status;
-- (2) AGUARDANDO_ESTOQUE com compra VINCULADA a pedido vivo de algum material dela (o rotulo errado do C116)
SELECT DISTINCT r.id, r.numero, r.created_at
FROM requisicoes_almoxarifado r
JOIN itens_requisicao_almoxarifado ir ON ir.requisicao_id = r.id
JOIN solicitacoes_compra_almoxarifado s ON s.material_id = ir.material_id AND s.status = 'VINCULADO'
LEFT JOIN pedidos_compra p ON p.id = s.pedido_compra_id
WHERE r.status = 'AGUARDANDO_ESTOQUE' AND COALESCE(r.ativo,1) = 1
  AND LOWER(COALESCE(p.status,'')) NOT IN ('recebido','cancelado','rejeitado');
-- (3) aprovadas pela aprovacao automatica sem reserva, ainda antes da separacao
SELECT r.id, r.numero, r.data_aprovacao FROM requisicoes_almoxarifado r
WHERE r.aprovador_nome = 'Sistema (automático)' AND r.status = 'APROVADO' AND COALESCE(r.ativo,1) = 1
  AND NOT EXISTS (SELECT 1 FROM reservas_material_almoxarifado x WHERE x.requisicao_id = r.id AND x.status = 'ATIVA');
```
A (2) é aproximada (não desconta o já recebido; a régua exata é a `posicaoDasSolicitacoes`). Corrigir o rótulo à mão é
`UPDATE requisicoes_almoxarifado SET status = 'AGUARDANDO_COMPRA' WHERE id IN (...)`; reservar para as da (3) é pela
tela de Reservas, uma a uma, por quem opera.

## O que fica de fora (declarado — e por quê)

- **Reservar o que chegou para quem esperava** (Surpresa 1, C121): Etapa 74.
- **Mudar o status na chegada** (D2/B358): sem valor medido.
- **Status por item** (D1): outra máquina de estados.
- **Setas de `TRANSICOES` para a aprovação direta** (D6): documentação da máquina, não regra.
- **Backfill** (B364, A37).
- **Auditoria da aprovação automática** (hoje não grava `APROVACAO`): anterior, não desta regra — registrar como C se a
  T2 confirmar que não há trilha.

## Candidata da Fase 0 para a Etapa 74 (o texto final vai na "Próxima tarefa detalhada" do fechamento)

**A requisição que esperava fica com o material que chegou** (C121, feature 07 com a 08). Medido nesta Fase 0 (sonda
`sonda73-requisicao.js`, B1): R1/R2 esperando, nota de 4, R3 aprovada depois reserva os 4, R1 tem o separar recusado.
Fase 0 da 74 terá de medir: (1) onde pendurar (fim de `processarNota`/`concluirAprovacaoDireta`, depois de
`darEntradaEstoque` e do aviso da 70 — ou antes do aviso, para a literal *"ainda não está reservado"* dizer a verdade);
(2) a ordem de quem leva (mais antiga por `data_aprovacao`? urgência primeiro?) — decisão B; (3) material retido para
inspeção não reserva (só o que entrou livre, como o aviso da 70); (4) o estorno da entrada (Etapa 71) com a reserva que a
própria nota criou — o motor recusa? libera? (`stockService.cancelarMovimentacao`, ramo de entrada); (5) o status passa
a `*_RESERVADA` (setas `AGUARDANDO_* → *_RESERVADA` na máquina) e a literal da 70 muda; (6) corrida entre a nota e um
`/aprovar` do mesmo material.

## Fase 2 — revisão do plano: 0 críticos, 4 importantes, 10 menores → plano revisto (vale sobre o texto acima)

- **IMPORTANTE (sonda `sonda73r-gate.js`) — a lista de asserções que mudam estava incompleta.** Além das quatro da D4:
  `regrasAprovacao.api.test.js` (9) `:227-228` (a reavaliação do pré-cheque roda o avaliador real — o monkeypatch não
  pega — grava `regras_avaliadas_em` e abre pendência) e `reservaPontasFaltantes.api.test.js:129-139` ("sem saldo
  continua APROVADO" vira `AGUARDANDO_ESTOQUE` pela RN-05; o comentário de `requisicaoAprovacao.api.test.js:237`
  também). A T2 muda as três com o motivo no commit. **E a mudança de comportamento da Etapa 47 (I2)** — a aprovação
  automática reavalia sozinha e, sem regra casada, aprova mesmo depois de o avaliador ter falhado no envio — entra na
  B359 (coerente com o `/aprovar`).
- **IMPORTANTE — com a aprovação automática ligada, a C121 passa a acontecer sem ninguém aprovar** (a requisição nova
  reserva na criação o que acabou de chegar). Declarado na B359 e na C121 como agravante; a 74 (C121) fica mais urgente.
- **IMPORTANTE — a G80 pela metade**: as ENTREGAS do teste também vão por posição (`:153-155`, `:168-169`). → T0
  devolve um mapa por material e usa nas entregas também; o controle (b) da T0 inverte a ordem dos itens e prova.
- **IMPORTANTE (declarar) — pedido avulso do Compras sem solicitação não conta como "a caminho"** (a requisição vai a
  AGUARDANDO_ESTOQUE com compra vindo) — coerente com a reposição; "O que fica de fora".
- Menores: `/aprovar-valor` com `changes = 0` no UPDATE guardado → desfaz as reservas e responde com o status RELIDO
  (não o calculado); o banner usa `maxSeparavelNaTela(item) > 0` (o helper "que a tela já usa" não existia) e mostra
  QUANTO dá para separar e que o saldo é compartilhado (a separação não reserva); `ORDER BY ir.id` no detalhe da
  requisição (garantia além da inserção sequencial); A37 ganha a consulta (4) — liberadas por valor que ficaram
  APROVADO sem reserva; horizonte de 60 dias pelo `created_at` da solicitação (compra de prazo longo vira
  AGUARDANDO_ESTOQUE — declarado); pedido apagado/sem linha conta como a caminho (D4 da 72); dois `/enviar`
  simultâneos seguram em dobro por um instante (declarado); `/enviar` feito por admin: o dono da reserva é o admin
  (declarado).
