# Etapa 176 — O recebimento informa a OS (material de cliente para industrialização)

> **Status:** 🟡 em execução (2026-10-22). Emendada da "próxima tarefa detalhada" da Etapa 174 (B1119).
> **Origem:** resposta do cliente (Matheus, 22/10 09:13): *"Industrialização: materiais que os clientes compram e nossa
> empresa apenas realiza a mão de obra… um estoque de materiais do cliente que ficam em nosso estoque"*. A pergunta
> "o material do cliente já vem para uma OS específica?" **foi feita e aguarda resposta** — por isso a OS é
> **opcional** e a etapa é reversível (nada muda para quem não preencher).
> **Fase 0 (medido):**
> - **Não existe `ENTRADA_CLIENTE`.** Material de cliente entra pelo **recebimento normal** (`POST
>   /api/almoxarifado/recebimentos`, tela `RecebimentosAlmoxarifado.js`) como `ENTRADA_COMPRA`; o dono vem do cadastro
>   do material e a nota é exigida para ele (`receiptService.js:1551-1555`). O plano da 174 chamava isso de "entrada de
>   material de cliente" como se fosse outra porta — **não é**.
> - Esse caminho **já** passa pelas três portas de distribuição da 171 (nota, inspeção, NC) sob a trava; a reserva da
>   OS nasce de `reservaDaOs.osAbertaDoRecebimento` (`:82`), que hoje só segue `pedido_compra_id → pedidos_compra.os_id`.
> - **Não existe guarda de dono na entrada** (`ownerRules.js:131`); `reservarParaOsSobTrava` não confere dono → hoje
>   nada impediria material do cliente A reservado para OS do cliente B.
> - `PREDICADO_RESERVA_DA_OS` está duplicado (`reservaDaOs.js:24` e `osEncerradaService.js:27`).

## Regras

| ID | Regra | Cenário |
|---|---|---|
| RN-176.01 | O recebimento ganha `os_id` **opcional** (`recebimentos_material_almoxarifado.os_id`), aceito no `POST` com a régua da 171 (`OS inválida`; `OS #<id> não encontrada`). | NF de cliente com OS 7 → recebimento com `os_id` 7 |
| RN-176.02 | **Recebimento de pedido:** a OS é a do pedido. `os_id` no payload diferente da do pedido → 400 `A OS do recebimento tem de ser a do pedido (<numero_os do pedido ou "sem OS">)`; igual ou ausente → herda a do pedido. | pedido com OS 7 + payload OS 8 → 400 |
| RN-176.03 | OS **fechada** (régua `osFechada`) no `POST` → 400 `A OS <numero_os> está <status> — não aceita entrada nova`. | — |
| RN-176.04 | **Guarda do dono, por item, na criação do recebimento:** item de material com dono (cliente X) e OS de outro cliente (Y) → 400 `Material <codigo> pertence ao cliente <X>, mas a OS <numero_os> é do cliente <Y>` (nada gravado). OS sem cliente, material próprio, ou mesmo cliente → passa. | chapa do cliente A + OS do cliente B → 400 |
| RN-176.05 | `osAbertaDoRecebimento` lê **primeiro** o `os_id` do recebimento, depois o do pedido (como hoje). A partir daí tudo é a 171: a entrada `ENTRADA_COMPRA` grava o `os_id` (RN-171.07), o que entrou livre fica reservado para a OS nas três portas (RN-171.08), a requisição da OS converte (RN-171.12), a OS que fecha solta (RN-171.09), o estorno solta (RN-171.11). | nota de cliente sem pedido com OS 7 → reserva da OS 7 |
| RN-176.06 | `PREDICADO_RESERVA_DA_OS` passa a ter **uma** definição (o `osEncerradaService` importa de `reservaDaOs.js`). | — |
| RN-176.07 | Tela de Recebimentos: campo **"OS (opcional)"** (select das OS abertas de `/almoxarifado/aux/ordens-servico`, opção vazia "Sem OS"); com pedido escolhido, mostra a OS do pedido e trava. Lista e detalhe do recebimento mostram a OS. | — |
| RN-176.08 | A lista e o detalhe do recebimento (`GET`) devolvem `os_id` e `os_numero` (leitura viva, `OS #<id>` se sumiu). | — |

## Tasks

| # | Task | Tipo |
|---|---|---|
| T1 | Coluna + Zod + `criarRecebimento` (RN-01..04, 08) + RN-05/06 em `reservaDaOs`/`osEncerradaService` + testes pela rota (incluindo o fluxo de cliente: material com dono, NF, OS → reserva → requisição da OS → entrega; e a OS fechando solta). | tronco |
| T2 | Front da tela de Recebimentos (RN-07), mock só na fronteira HTTP. | galho (worktree), contra o contrato acima |
| T3 | Integração pela rota: recebimento de cliente com OS → reserva → requisição com `os_id` → entrega → "posição por cliente" mostra a aplicação na OS e o "Consumo por OS" a conta. | integração |

## Fora do escopo (letra D)

- **Entrada manual pelo motor** (`ENTRADA_MANUAL`, `POST /movimentacoes/v2`) com OS: não distribui reserva (é por
  desenho) e continua sem documento para material de cliente (já era assim — medido, `materialClienteEntrada:139`).
- Guarda de dono na `ENTRADA_MANUAL` com OS de outro cliente (não existe hoje; declarado).
- "Posição por cliente" mostrar a OS da **entrada** (hoje só lista aplicações = saídas).

## Próxima tarefa detalhada

*(preencher no fechamento)*

---

## Revisão da Fase 2 (2026-10-22) — 1 crítico, 4 importantes, 5 menores; as emendas PREVALECEM

- **C1 + I1 — a OS efetiva do recebimento é UMA régua só:** `osDoRecebimento(rec)` = se `rec.pedido_compra_id`
  (o **gravado**, não o `tipo`) → a OS **viva** do pedido (como na 171 — trocar a OS do pedido antes do processamento
  continua valendo); senão → `rec.os_id`. **Recebimento de pedido NÃO grava `os_id` próprio** (fica NULL). Contratos:
  - `POST` com `pedido_compra_id` e `os_id` não nulo diferente da OS do pedido → 400 `A OS do recebimento tem de ser a
    do pedido (<numero_os do pedido ou "sem OS">)`; igual → aceito e **não** gravado.
  - `PUT /recebimentos/:id/fiscal` (`salvarDadosFiscal`, `receiptService.js:1252-1300`) que liga um pedido a um
    recebimento com `os_id` próprio: OS do pedido diferente → 400 com a mesma frase; igual → aceito e o `os_id` próprio
    é **limpo** (passa a valer o do pedido).
- **I2 —** `darEntradaEstoque` (`:1599`) grava na `ENTRADA_COMPRA` o `os_id` de `osDoRecebimento`, não só o do pedido.
  `reservaDaOs.osAbertaDoRecebimento` usa a mesma régua.
- **I3 — a regra do dono na distribuição passa a ver a OS** com a precedência da 174 (projeto primeiro, depois OS):
  `saidaPassaNaRegraDoDono(db, material, projetoId, osId)` nos três chamadores (`reservaChegadaService.js:107-111` e
  `receiptNotificationService.js:378`, `:488`). Cenário obrigatório na T1: requisição da OS **sem projeto, aprovada
  ANTES da nota** do material de cliente → a fila a serve.
- **I4 — a RN-176.04 roda também na pré-checagem de `darEntradaEstoque`** (`:1532-1590`, recusa a nota inteira, mesmo
  texto): o dono pode trocar entre criar e processar (material sem histórico troca sem permissão,
  `ownerRules.js:412-421`). A troca de cliente da OS não tem rota medida — declarado.
- **M1 — a conversão na aprovação** (`requisitionService.js:~369`) passa a conferir o dono com a mesma régua antes de
  converter (projeto do cliente B + OS do cliente A → não converte; a entrega recusaria). 
- **M2 — contratos completos da RN-04:** material de cliente + OS **sem cliente** → 400 `Material <codigo> pertence ao
  cliente <X>, mas a OS <numero_os> não tem cliente` (a saída recusaria: NULL não é coringa, `ownerRules.js:157`);
  qualquer item que falhe recusa a **nota inteira** (como a pré-checagem já faz); `OS inválida` e `OS #<id> não
  encontrada` como na 171; OS que sumiu entre criar e processar → a nota processa e **não reserva** (como a 171 —
  `OS #<id>` na leitura).
- **M3 — contratos de leitura para a T2 (congelados):** `GET /api/almoxarifado/aux/ordens-servico` ganha `?abertas=1`
  (filtro `osFechada` antes do `LIMIT`) e o campo `cliente_id` — aditivo, sem `abertas` nada muda.
  `lerPedidoParaRecebimento` e a lista de pedidos para recebimento (`receiptService.js:~2299`) devolvem `os_id`,
  `os_numero`. A T2 só começa depois da T1.
- **M4 —** `listarRecebimentos` (`:2121`) e `getRecebimento` (`:2906`) ganham `os_id` efetivo e `os_numero` por leitura
  viva separada (`OS #<id>` se sumiu).
- **M5 — RN-06:** `osEncerradaService` passa a reexportar o `PREDICADO_RESERVA_DA_OS` vindo de `reservaDaOs.js`
  (mesmo nome exportado, para não quebrar quem importa).
