# Almoxarifado — Etapa 129: a conferência depois da entrada e as perdas com valor (plano)

> Origem: "Próxima tarefa detalhada — Etapa 129" do plano da 128. Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-16-almoxarifado-etapa129-a-conferencia-depois-da-entrada-e-as-perdas-com-valor-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-16): última B **B829**, último C
> **C266**, última A **A76**. Esta etapa: **B830+**, **C267+**, **A77+**. Worktree `CRM-wt-e129`, branch `etapa-e129` (a partir da main
> `b1a48f11`).
>
> **Ordem da skill:** este plano é revisado (Fase 2) **antes** de qualquer código de produção (os testes das T1..T3 foram escritos e
> rodados **vermelhos** antes — 3/16, 0/7 e 1/4 —, sem tocar produção).
>
> **Fase 2 (um revisor fresco, sondas `e129rev2.js`/`e129rev2b.js`, não versionadas, sob a trava): 3 Important + 7 Minor, todos
> aceitos.** **I1** — o `/fiscal` continua mudando a quantidade de um item **já entrado** (nota parcial `EM_ENTRADA_NF`: item 2, movimento
> 5, físico 5 → 200) → **RN-09** nova. **I2** — a A77 dava falso positivo (aprovado com tudo 0; a entrada estornada não limpa
> `entrada_estoque_em` nem `movimentacao_entrada_id`; ponto flutuante com a recebida nula — o motor arredonda a 1e-6; o legado sem
> vínculo/sem coluna) → a A77 usa a `QTD_DO_ITEM_SQL`, folga 1e-6, não filtra o estorno (mostra `entrada_estornada`) e separa os
> achados (`SEM_ENTRADA` / `DIFERENTE_DA_ENTRADA`), com o legado declarado. **I3** — `relatoriosJornada.api.test.js:141` conta os
> gated (`- 3`) → `- 4` na T2. **M4** — a NC manual congela o que está no item (divergência 0; a recontagem só vai na descrição) e **não
> há tela** de abertura manual → a L2 deixa de mandar abrir NC e manda **corrigir o estoque por um ajuste** (gesto que existe). **M5** — a
> guarda RN-11 da NC (`BLOQUEADA_PROCESSADO`) perderia a cobertura → os dois testes antigos exercitam a guarda pelo serviço
> (`sincronizarNaoConformidadeQuantidade`). **M6** — corrida com `status` + `itens`: o status já gravado fica e os itens gravados antes
> da recusa ficariam sem aviso e sem NC → os ganchos rodam para o que foi gravado antes de relançar; o status gravado fica (declarado
> em D). **M7** — o `EXISTS` do item ganha o `NOT EXISTS` de item entrado do mesmo recebimento. **M8** — marca vencida com o
> processamento ainda rodando: declarado (a mesma régua do `reivindicarProcessamento`; a A77 acha). **M9** — `APROVADO` continua no enum
> (senão a resposta seria *Status inválido*). **M10** — a letra B diz por que as perdas nascem fechadas e a sucata não.
>
> **Fora (depende do P.O.):** B808, B755, B761/C239, C224, o resto da C225, C228, C219, C230, o reparo da C246/C247, a tabela de
> conversões, o grupo acima de família, a régua E2 do tempo de recebimento; na 05, os itens de produto e a C198; na 06, a B11 e a
> Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, B13, B101/G30, G38.

## Fase 0 — quem chama o `/conferir` (medido)

Sonda `e129fase0.js` (o design tem a tabela (a)..(g)). E a instrumentação: um `console.log` temporário no começo de
`conferirRecebimento` (status de origem, de destino, itens já entrados, marca), a suíte `test:api` inteira **uma vez** (432/432 com o
log), o arquivo restaurado por cópia (md5 `a0e42139…` antes e depois). **245** chamadas; só **4 formas** cairiam numa guarda nova:

| Arquivo | Forma | Com a guarda |
|---|---|---|
| `recebimentoChegouZero` (4×) | `EM_ENTRADA_NF`, sem `status`, nada entrou | continua 200 (quantidade sem status antes da entrada — decisão 3) |
| `recebimentoChegouZero` (1×) | `EM_ENTRADA_NF` → `EM_CONFERENCIA` com `'abc'` | continua **400** da literal do número (a validação do payload vem antes) |
| `naoConformidadeGanchos` (6) | `PROCESSADO` (forçado por SQL), sem `status`: espera **200** e a NC nova do item B | **muda** → 409 (B830) |
| `naoConformidadeRegressao` (2) | `APROVADO` com o item entrado: espera **200** e a NC intacta | **muda** → 409, NC intacta (B830) |

As duas que mudam são o **D10 da Etapa 43** ("abre mas não destrói" — a reconferência depois do processamento abria NC nova e não
cancelava a velha). A premissa do D10 era que o `/conferir` aceita depois da entrada; com a guarda, a divergência descoberta depois
vai pela **não conformidade manual** (`POST /nao-conformidades`, `registrar_nao_conformidade`: Administrador, Almoxarife, Qualidade,
Compras — o mesmo Almoxarife que confere). Os dois testes mudam à vista, com a razão no título.

A tela: o painel de conferência só aparece em `RECEBIDO`/`EM_CONFERENCIA` e não manda `status` — nada muda nela.

## Regras de negócio

**C266 — a conferência depois da entrada (feature 08).** Testes: `server/tests/api/conferenciaDepoisDaEntrada.api.test.js`
(RN-01..RN-07, pela rota e pelo serviço) e `server/tests/api/conferenciaDepoisDaEntradaIntegracao.api.test.js` (RN-08).

A ordem das recusas em `conferirRecebimento` (todas **antes** de qualquer gravação — status, item, trilha de excedente, NC, aviso):
validação do número (`normalizarRecebidasDoPayload`, 400, como hoje) → `status` fora do enum (400 *"Status inválido"*, como hoje) →
**RN-04** → **RN-01** → **RN-02** → **RN-03** → **RN-05** → excedente (`assertExcedentePermitido`, 400/403, como hoje) → gravações
(**RN-06**).

- **RN-01 — recebimento inexistente:** 404 `Recebimento não encontrado`. Cenário: `PUT /recebimentos/999999/conferir` com um item →
  404 (era 200 `{success:true}`).
- **RN-02 — depois da entrada no estoque:** com o recebimento em `PROCESSADO` ou `APROVADO`, **ou** com qualquer item com
  `entrada_estoque_em`, 409 `L2`. Cenários: (a) *Aprovado* com item de 0 → conferir 5 → 409, item continua 0, nenhuma NC nova;
  (b) *Aprovado* → `REPROVADO` → 409, status continua *Aprovado*, o `/aprovar` seguinte recusa e o físico não muda; (c) `EM_ENTRADA_NF`
  com um item entrado → `status: EM_CONFERENCIA` → 409 (a RN-02 vem antes da RN-05) e o mesmo com só `itens` → 409; o `/processar`
  seguinte dá entrada do item que faltava. A recusa não grava trilha de excedente (com `autorizar_excedente: true` e quantidade acima
  da esperada: 409, zero linhas `EXCEDENTE_AUTORIZADO`).
- **RN-03 — durante o processamento:** marca `processando_em` viva (não vencida: `>= datetime('now','-10 minutes')`, a régua de
  `reivindicarProcessamento`) → 409 `Esta nota já está sendo processada` (`LITERAL_EM_PROCESSAMENTO`). Marca vencida não recusa.
- **RN-04 — a conferência não aprova:** `status: 'APROVADO'` → 400 `L4`, em qualquer situação (antes do 404). Cenário (d): *Recebido*
  → `APROVADO` → 400, status continua `RECEBIDO`, o `/aprovar` dá entrada.
- **RN-05 — a situação só muda a partir da conferência:** `status` presente com o recebimento em `EM_COMPRAS`,
  `ENCAMINHADO_FATURAMENTO` ou `EM_ENTRADA_NF` → 409 `L5`. Os status de conferência — `RECEBIDO`, `EM_CONFERENCIA`, `CONFERIDO_ALMOX`,
  `REPROVADO`, `PARCIALMENTE_APROVADO`, `BLOQUEADO` — aceitam (`BLOQUEADO` → `EM_CONFERENCIA` → 200). Sem `status`, a quantidade nos
  três de depois continua aceita (`EM_ENTRADA_NF` + item 4 → 200, gravado — o `/fiscal` aceita o mesmo).
- **RN-06 — a corrida, no comando:** o `UPDATE` do status leva `AND status = ?` (o lido), `AND status NOT IN ('PROCESSADO','APROVADO')`,
  sem marca viva e `NOT EXISTS` item entrado; o de cada item leva `AND entrada_estoque_em IS NULL AND EXISTS (cabeçalho fora de
  PROCESSADO/APROVADO e sem marca viva)`. `changes = 0` no status → relê e recusa com a literal do estado (L2, L3, ou `L6`); no item →
  se o item **é** deste recebimento, a mesma recusa; se não é, ignorado como hoje (200, nada gravado para ele). Cenários com gancho em
  `db.run` (o comando do item / do status recebe a marca, ou o item ganha `entrada_estoque_em`, imediatamente antes de rodar): 409 e
  nada gravado naquele comando; o item estranho continua 200.
- **RN-07 — o que não muda:** a conferência normal (`RECEBIDO` → `EM_CONFERENCIA` com itens) continua 200 com NC de quantidade e aviso de
  divergência; o `CONFERIDO_ALMOX` pelo `/conferir` continua sem gravar `conferencia_finalizada_em` (RN-11 da 122); o excedente sem
  autorização continua 400 (com a situação boa).
- **RN-09 — o `/fiscal` não muda a quantidade de item já entrado (Fase 2, I1):** item com `entrada_estoque_em` e `quantidade_recebida`
  numérica no payload diferente da quantidade do item (`quantidadeDoItem` do gravado) por mais de 1e-6 → 409 `L7`, antes de qualquer
  gravação (cabeçalho, itens, trilha). O eco do mesmo valor (o modal de NF reenvia todos) passa. Defesa no comando: `quantidade_recebida =
  CASE WHEN entrada_estoque_em IS NULL THEN COALESCE(?, quantidade_recebida) ELSE quantidade_recebida END`. Lote, série e valores do
  item entrado continuam aceitos pelo `/fiscal` — **C267** (declarado).
- **RN-08 — integração (rota e serviço):** criar → conferir → `/aprovar` → conferir de novo (409 pela rota **e** pelo serviço,
  `receiptService.conferirRecebimento`) → a NC manual pela API (`POST /nao-conformidades`, origem `RECEBIMENTO`, referência `RECEBIMENTO_ITEM`) continua abrindo 201 (congela o
  que está no item; sem tela — declarado); e a nota pelo fluxo fiscal: iniciar → finalizar → encaminhar → finalizar compras → iniciar faturamento
  → conferir quantidade (200) → `/processar` → conferir (409). E a **A77** rodada contra um estado legado montado por SQL (acha os três
  formatos, não acha o recebimento limpo).

**Feature 21 — perdas com valor.** Testes: `server/tests/api/relatorioPerdasPorMotivo.api.test.js` (RN-10..RN-16) e um cenário na
integração (RN-17).

- **RN-10 — o que é perda:** `PERDA` e `PERDA_TERCEIRO` com `cancelado = 0`. `SUCATA` (tem relatório próprio), `AJUSTE_NEGATIVO`,
  `CONSUMO_TERCEIRO` e o `ESTORNO` não entram; a perda estornada não entra.
- **RN-11 — o valor:** `ROUND(SUM(mv.quantidade × custoUnitarioSql('m')), 2)` — o custo **atual** (custo médio quando > 0, senão o
  unitário), retroativo. Cenário: M1 médio 8 / unitário 99 perde 2 → 16; M2 médio 0 / unitário 5 perde 3 → 15; mesma linha → 31.
- **RN-12 — as linhas:** uma por `tipo` + origem/motivo — `Cadastro` com o nome **atual** do motivo (`(desativado)` quando inativo,
  `Motivo #id` quando sumiu) e `Texto livre` / `Sem motivo do cadastro` sem `motivo_id`. Colunas: `tipo`, `origem`, `motivo_id`,
  `motivo`, `lancamentos`, `materiais`, `valor`, `ultimo_em`. Ordem: valor desc, motivo. Quantidade não é somada (unidades diferentes).
- **RN-13 — de quem:** material de cliente fora (patrimônio alheio, como `custo-por-projeto` e `ajustes-por-motivo`); material
  inativado conta.
- **RN-14 — filtros:** `data_inicio`/`data_fim` pelo DIA em UTC (`DATE(mv.created_at)`); `material_id` inteiro positivo, senão 400
  `Parâmetro "material_id" deve ser um número inteiro positivo` (a literal da `ajustes-por-motivo`).
- **RN-15 — quem vê:** gate `gerenciar_reposicao` (Administrador, Gestor, Compras): Almoxarife → 403 `Sem permissão para este relatório`
  e a chave fora da lista dele; o export XLSX projeta só as colunas declaradas.
- **RN-16 — a nota** declara: os dois tipos, o custo atual retroativo, cliente fora, o motivo pelo nome atual, a sucata em relatório
  próprio, UTC.
- **RN-17 — integração:** a perda pela rota real (`POST /movimentacoes/v2`, `tipo: PERDA`, com `motivo_id` do cadastro) aparece com o
  valor; estornada pela rota de estorno, some.

## Contrato congelado

**`PUT /api/almoxarifado/recebimentos/:id/conferir`** — payload inalterado (`status?`, `itens?`, `autorizar_excedente?`); 200
`{ success: true }` inalterado. Recusas novas (literais exatas):

- 400 `L4` = `A conferência não aprova o recebimento — use "Aprovar", que dá a entrada no estoque`
- 404 `Recebimento não encontrado`
- 409 `L2` = `Recebimento já deu entrada no estoque — a conferência não pode mais mudar quantidade nem situação; se a contagem estava errada, corrija o estoque por um ajuste`
- 409 `Esta nota já está sendo processada`
- 409 `L5` = `` `A conferência já foi encerrada (situação atual: ${status}) — a situação segue pelo fluxo do recebimento` ``
- 409 `L6` = `O recebimento mudou de situação enquanto a conferência era salva — recarregue e confira de novo`

**`PUT /api/almoxarifado/recebimentos/:id/fiscal`** (RN-09) — recusa nova: 409 `L7` = `Item já deu entrada no estoque — a quantidade dele não muda mais; se a contagem estava errada, corrija o estoque por um ajuste`.

`receiptService.conferirRecebimento(db, user, id, data)` lança os mesmos (`{ status }` no erro). Exporta `LITERAIS_CONFERENCIA` (L2, L4,
L5(fn), L6) para os testes.

**`GET /api/almoxarifado/relatorios/perdas-por-motivo`** (e `/export`) — chave nova no registro, categoria `Gestão`, `acao:
'gerenciar_reposicao'`, `exportavel: true`, params `data_inicio`, `data_fim`, `material_id`; resposta: array de linhas (RN-12).
`reportService.relatorioPerdasPorMotivo(db, filters)`.

**A77** — consulta somente leitura (texto no documento de novidades, o mesmo SQL no teste da RN-08).

## Tasks (sort topológico)

- [ ] **T1 — tronco (serviço do recebimento)** — `receiptService.conferirRecebimento` (RN-01..RN-07) + `conferenciaDepoisDaEntrada.api.test.js`
  + a mudança à vista de `naoConformidadeGanchos` (6) e `naoConformidadeRegressao` (2).
- [ ] **T2 — galho (relatório)** — `reportService.relatorioPerdasPorMotivo` + `reportRegistry` + dispatcher em `extended.js` +
  `relatorioPerdasPorMotivo.api.test.js`. RN-10..RN-16. Independente da T1 (outra regra, outro arquivo); serializada pela regra "um
  teste por vez".
- [ ] **T3 — integração** — `conferenciaDepoisDaEntradaIntegracao.api.test.js`: RN-08 (rota **e** serviço, a A77) e RN-17 (cruza o motor,
  o estorno e o relatório).
- [ ] **T4 — fechamento** — novidades (B830+, C266 resolvida, C267+ se houver, A77, D (129), F se houver, a seção da etapa, cabeçalho),
  specs 08 (C266, o D10 da 43 que muda), 09 (o D10, se lá estiver), 21 (perdas), mapa, guia, manual, este plano (retro, "Próxima tarefa
  detalhada — Etapa 130"), o "defeito que escapou" da retro da 128. CLAUDE.md: a trava **não** muda (a conferência não pega a trava por
  material; ela recusa no comando).

Sem migração (nenhuma coluna, nenhuma tabela): a prova de primeiro boot não se aplica.

A suíte inteira roda **uma por vez**; revisores rodam só os próprios arquivos, sob a trava de máquina
(`scratchpad/e129-lock.sh`, diretório `maquina-testes.lock`), nunca junto com a suíte.
