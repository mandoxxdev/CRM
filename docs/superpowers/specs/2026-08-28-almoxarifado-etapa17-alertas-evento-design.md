# Almoxarifado — Etapa 17: Alertas de evento (fatia 2 da feature 20) — design

Data: 2026-08-28 · Branch: `desenvolvimento-almoxarifado`
Origem: handoff do plano da Etapa 16 ("Próxima tarefa detalhada", candidata 1) +
`specs/modulo-almoxarifado/20-alertas/README.md`.

## Decisão de escopo (Fase 0 — medida em 2026-08-28)

A medição sobre os 4 alertas restantes viáveis provou:

- **Reprovar material hoje não gera aviso nenhum** — `DECISAO_INSPECAO` cai em SEM_CLASSE na
  classificação de movimentações (de propósito) e `inspectionService` não toca a fila.
- **Existe padrão de gancho pós-commit no módulo** ("aviso NUNCA derruba o ato"):
  `stockService.js:1370-1405`, `routes/almoxarifado.js:1208` (pós-conclusão de conferência) e
  `receiptService.js:669-676` — try/catch degradando para `console.warn`. É o molde.
- **Três dos quatro têm condição consultável AO VIVO com janela de dias** (reprovado por
  `data_inspecao`; divergência de recebimento por `quantidade_recebida≠esperada`; divergência
  de inventário por conferência CONCLUIDO com item divergente e `data_fim`) — então o "modo
  evento" pode ser **aditivo**: a entrada do registro mantém `listar` (alimenta a central e
  serve de rede de segurança na varredura diária) e ganha o disparo no ato. Com o dedupe
  IDÊNTICO nos dois caminhos, o `INSERT OR IGNORE` da fila torna o duplo disparo inofensivo
  (o segundo vira DUPLICADA) — e um evento perdido (app reiniciado no meio do ato) é pego
  pela varredura no dia seguinte.
- **Sem certificado é estado persistente, não evento** — entra como entrada de varredura
  pura, custo ~zero (o contrato do registro da Etapa 16 foi feito para isso).
- **A conclusão de conferência é lógica inline na rota** (`routes/almoxarifado.js:1051-1213`,
  sem service) — o gancho e o `listar` precisam compartilhar a régua por função, senão nascem
  duas definições de "conferência divergente" (a classe de bug que `divergencia.js` mata).
- `AJUSTE_INVENTARIO` é excluído da notificação de movimentação DE PROPÓSITO (300 e-mails
  por conferência) — o alerta de inventário tem de ser **agregado por conferência**.
- `impacto_financeiro` é deliberadamente omitido das rotas públicas de conferência — pôr o
  valor no corpo do e-mail seria exposição nova (decisão consciente abaixo).

**Escopo:** modo evento aditivo no registro + 4 alertas novos (3 de evento + 1 varredura) +
colunas das 4 chaves na central. Zero mudança de rota nova, zero permissão nova.

**Fica FORA, declarado:**

- **Flags de divergência da INSPEÇÃO como alerta próprio** — o ato da inspeção já dispara o
  alerta de reprovado; flag marcada em aprovação total (ex.: `divergencia_dimensional` sem
  reprovar) NÃO alerta nesta etapa. O alerta de divergência de recebimento nasce do
  **registro da quantidade recebida** (conferência física ou entrada fiscal — os dois
  escritores reais), que é onde a divergência quantitativa existe de verdade. Juntar as duas
  fontes num alerta só seria duas réguas com um nome.
- **Status/consumo do `encaminhamento`** — segue sem consumidor (pendência da spec 09; dar
  destino ao reprovado é workflow novo, não alerta).
- **Vincular a reprovação ao LOTE** (status REPROVADO automático) — pendência nomeada da
  spec 09, mexe no motor; fora.
- **Impacto financeiro no e-mail de inventário** — o corpo diz o NÚMERO de itens
  divergentes, não o valor em reais (o valor é gateado por `inventario` no relatório;
  e-mail vaza para caixa de entrada — decisão B30).
- Os 3 alertas com lacuna de dado — seguem nomeados na spec 20.

## Arquitetura

### 1. Modo evento aditivo

- Entrada do registro ganha campo opcional `evento: true` (documentacional) e as 3 novas
  mantêm `listar` com janela `alerta_eventos_janela_dias` (config nova, default 7) — a
  central mostra "o que aconteceu na última semana".
- **Helper novo** em `notificationQueueService`:
  `dispararAlertaRegistrado(db, chave, linha)` — acha a entrada por chave, aplica os MESMOS
  guards da varredura (`alertasEmailLigado` + destinatários `alertas_estoque_emails` +
  `escapeHtml` linha a linha) e chama `enfileirar` com
  `dedupeChave/assunto/corpo/payload` da entrada. Requires lazy (ciclo documentado no
  registro). Retorna o retorno do `enfileirar` (ou `{enfileirada:false, motivo:'DESLIGADO'}`).
- **Dual-mode unificado (correção da revisão do plano):** os TRÊS `listar` de evento são
  exportados em dual-mode — com `{ dias }` (janela, para central/varredura) OU com o id do
  fato (`{ inspecaoId }` / `{ recebimentoId }` / `{ conferenciaId }`) — e **o gancho só chama
  o modo por id**. A primeira versão deste design mandava o gancho "montar a linha dos dados
  locais" — **estava errada**: no ponto do gancho da inspeção não existem carregados
  `material_codigo/nome`, número do recebimento nem `data_inspecao`, e no da conferência de
  recebimento a `quantidade_esperada` nem está no escopo (vem só no body). Dual-mode dá a
  régua única e o dado completo de uma vez.
- **Ganchos** (todos no padrão pós-commit com try/catch + `console.warn` — RN-02):
  - `inspectionService.decidirInspecao` após o INSERT da inspeção: se
    `quantidade_reprovada > 0`, dispara `MATERIAL_REPROVADO` com a linha de
    `listar({ inspecaoId: ins.lastID })`.
  - **Registro da quantidade recebida — DOIS pontos** (correção da revisão: a primeira
    versão punha o gancho só em `conferirRecebimento`, mas **a UI nunca chama a rota de
    conferir** — o fluxo real escreve `quantidade_recebida` pela rota `/fiscal`
    → `atualizarDadosFiscais`): gancho pós-escrita nos dois métodos, ambos chamando
    `listar({ recebimentoId })` e disparando por item divergente (o dedupe por item torna o
    duplo caminho inofensivo).
  - `PUT /conferencias/:id/concluir` junto do gancho existente (linha ~1208): dispara
    `DIVERGENCIA_INVENTARIO` com a linha agregada de
    `listarDivergenciaConferencia(db, { conferenciaId })` — a MESMA função do `listar`.

### 2. As 4 entradas novas (chave, condição, dedupe)

| Chave | Condição (`listar`, ao vivo) | Gancho | Dedupe (idêntico nos 2 caminhos) |
|---|---|---|---|
| `MATERIAL_REPROVADO` | inspeções com `quantidade_reprovada>0` e `data_inspecao` dentro da janela | decidirInspecao | `reprovado-<inspecao_id>` (decisão é imutável — 1× para sempre) |
| `DIVERGENCIA_RECEBIMENTO` | itens com `quantidade_recebida IS NOT NULL` e `divergenciaRealSql(recebida−esperada)`, janela por `COALESCE(r.updated_at, r.created_at)` — **correção da revisão: `created_at` puro deixaria recebimento antigo conferido HOJE fora da central e da rede de segurança**; o item não tem timestamp próprio (limitação declarada: qualquer toque posterior no recebimento renova a presença na central; o dedupe segura o e-mail) | conferirRecebimento E atualizarDadosFiscais | `receb-diverg-<item_id>` (1× por item; correção posterior da quantidade não re-alerta — declarado) |
| `DIVERGENCIA_INVENTARIO` | conferências `status='CONCLUIDO'` com item `divergenciaRealSql('ic.divergencia')`, agregado por conferência (`itens_divergentes`, `data_fim` na janela) | rota concluir | `inv-diverg-<conferencia_id>` (conferência conclui 1×) |
| `LOTE_SEM_CERTIFICADO` | lote de material ativo `controle_certificado=1` com `certificado_arquivo IS NULL` e saldo>0 (subquery de `estoque_saldo_almoxarifado`, molde de `varrerLotesVencendo`) | — (varredura pura) | `sem-certificado-<lote_id>-<AAAA-MM>` (re-lembra 1×/mês enquanto persistir) |

Notas: a régua do sem-certificado é `certificado_arquivo IS NULL` (não `status='BLOQUEADO'` —
lote destravado na mão sem anexo continua sem certificado, e essa é a régua honesta);
`divergenciaRealSql` ganha o segundo consumidor SQL fora do inventário — expansão de escopo
DECLARADA no header de `divergencia.js`.

### 3. Central e front

As 4 entradas aparecem na central automaticamente (contrato da Etapa 16). Única mudança de
client: colunas amigáveis das 4 chaves em `COLUNAS_POR_CHAVE` de `AlertasAlmoxarifado.js`
(sem elas o fallback genérico mostra campos crus — funcional, mas as colunas contam a
história certa). Config nova aparece em Configurações Gerais (padrão da 16, prefixo
`alerta_` já validado nos dois lados).

## Regras de negócio (RN)

- **RN-01 — Dedupe idêntico nos dois caminhos.** Disparo no ato seguido de varredura no
  mesmo estado → a varredura reporta DUPLICADA, zero e-mail novo. Cenário: reprovar →
  gancho enfileira; varredura do dia → duplicada.
- **RN-02 — Gancho nunca derruba o ato.** Sabotar o disparo para lançar → a decisão de
  inspeção/conferência/conclusão continua respondendo 200/201 e gravando tudo; o erro vira
  `console.warn`. Cenário com sabotagem medida.
- **RN-03 — Reprovado dispara só com reprovação.** `quantidade_reprovada=0` (aprovação
  total) → nenhum disparo, nada na fila, fora da central.
- **RN-04 — Divergência de recebimento nasce do REGISTRO da quantidade recebida (conferência
  OU entrada fiscal), com a régua única.** `|recebida−esperada| ≤ EPSILON` → não dispara; a
  comparação usa `divergenciaRealSql` (float-safe) NOS DOIS caminhos (o gancho consulta a
  mesma query do listar — nunca refaz a conta em JS). Flags da inspeção não disparam este
  alerta (declarado). (Reescrita pela revisão: a versão anterior dizia só "conferência" e o
  fluxo real da tela passa pelo fiscal.)
- **RN-05 — Inventário agrega por conferência e não expõe valor.** 1 aviso por conferência
  divergente (nunca por item), corpo com a contagem de itens divergentes e SEM
  `impacto_financeiro`.
- **RN-06 — Sem certificado é varredura pura com re-lembrete mensal.** Lote com certificado
  anexado sai da condição na hora (central) — o e-mail antigo fica.
- **RN-07 — O toggle mestre governa os dois caminhos.** `alertas_estoque_notificar_email='0'`
  → nem gancho nem varredura enfileiram (a central continua ao vivo).

## Testes

- Registro/varredura: os 4 `listar` com positivo+negativo; RN-01 (ato→varredura DUPLICADA);
  RN-06; RN-07 nos dois caminhos.
- Ganchos por ato (API real): reprovar → fila + central; RN-03; conferir com divergência →
  fila; sem divergência → nada; concluir conferência divergente → 1 aviso agregado; RN-02
  por sabotagem (fazer o dispara lançar e o ato responder 200 mesmo assim — teste
  versionado com helper injetável ou sabotagem medida e revertida).
- Jornada de integração: reprovar de verdade pela rota → e-mail na fila + central mostra →
  varredura → duplicada → central com janela vencida (data antiga) → some.
- Client: colunas das 4 chaves renderizando os campos reais.

## O que muda em cada camada

| Camada | Mudança |
|---|---|
| `alertRegistry.js` | 4 entradas + `listarDivergenciaConferencia` + janela `alerta_eventos_janela_dias` |
| `notificationQueueService.js` | `dispararAlertaRegistrado` |
| `inspectionService.js` | gancho pós-INSERT (padrão try/catch-warn) |
| `receiptService.js` | gancho pós-conferência |
| `routes/almoxarifado.js` | gancho na conclusão da conferência (junto do existente) |
| `schema.js` | config `alerta_eventos_janela_dias`='7' |
| `divergencia.js` | header declara o consumidor novo |
| `client AlertasAlmoxarifado.js` | colunas das 4 chaves |
| `specs/.../20-alertas/README.md` | 4 itens marcados no fechamento |
