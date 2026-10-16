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

- 400 `L4` = `A conferência não aprova o recebimento — a entrada no estoque é pelo "Aprovar" ou pelo "Processar Nota"`
- 404 `Recebimento não encontrado`
- 409 `L2` = `Recebimento já deu entrada no estoque — a conferência não pode mais mudar quantidade nem situação; se a contagem estava errada, corrija o estoque por um ajuste (perfil Administrador ou Almoxarife do almoxarifado)` *(Fase 5, r2 A2: o perfil entrou na literal)*
- 409 `Esta nota já está sendo processada`
- 409 `L5` = `` `A conferência já foi encerrada (situação atual: ${status}) — a situação segue pelo fluxo do recebimento` ``
- 409 `L6` = `O recebimento mudou de situação enquanto a conferência era salva — recarregue e confira de novo`

**`PUT /api/almoxarifado/recebimentos/:id/fiscal`** (RN-09) — recusa nova: 409 `L7` = `Item já deu entrada no estoque — a quantidade dele não muda mais; se a contagem estava errada, corrija o estoque por um ajuste (perfil Administrador ou Almoxarife do almoxarifado)` *(Fase 5, r2 A2: o perfil entrou na literal)*.

`receiptService.conferirRecebimento(db, user, id, data)` lança os mesmos (`{ status }` no erro). Exporta `LITERAIS_CONFERENCIA` (L2, L4,
L5(fn), L6) para os testes.

**`GET /api/almoxarifado/relatorios/perdas-por-motivo`** (e `/export`) — chave nova no registro, categoria `Gestão`, `acao:
'gerenciar_reposicao'`, `exportavel: true`, params `data_inicio`, `data_fim`, `material_id`; resposta: array de linhas (RN-12).
`reportService.relatorioPerdasPorMotivo(db, filters)`.

**A77** — consulta somente leitura (texto no documento de novidades, o mesmo SQL no teste da RN-08).

## Tasks (sort topológico)

- [x] **T1 — tronco (serviço do recebimento)** — `receiptService.conferirRecebimento` (RN-01..RN-07) + `conferenciaDepoisDaEntrada.api.test.js`
  + a mudança à vista de `naoConformidadeGanchos` (6) e `naoConformidadeRegressao` (2).
- [x] **T2 — galho (relatório)** — `reportService.relatorioPerdasPorMotivo` + `reportRegistry` + dispatcher em `extended.js` +
  `relatorioPerdasPorMotivo.api.test.js`. RN-10..RN-16. Independente da T1 (outra regra, outro arquivo); serializada pela regra "um
  teste por vez".
- [x] **T3 — integração** — `conferenciaDepoisDaEntradaIntegracao.api.test.js`: RN-08 (rota **e** serviço, a A77) e RN-17 (cruza o motor,
  o estorno e o relatório).
- [x] **T4 — fechamento** — novidades (B830+, C266 resolvida, C267+ se houver, A77, D (129), F se houver, a seção da etapa, cabeçalho),
  specs 08 (C266, o D10 da 43 que muda), 09 (o D10, se lá estiver), 21 (perdas), mapa, guia, manual, este plano (retro, "Próxima tarefa
  detalhada — Etapa 130"), o "defeito que escapou" da retro da 128. CLAUDE.md: a trava **não** muda (a conferência não pega a trava por
  material; ela recusa no comando).

Sem migração (nenhuma coluna, nenhuma tabela): a prova de primeiro boot não se aplica.

A suíte inteira roda **uma por vez**; revisores rodam só os próprios arquivos, sob a trava de máquina
(`scratchpad/e129-lock.sh`, diretório `maquina-testes.lock`), nunca junto com a suíte.

## Execução — o que aconteceu

- **Fase 0** — sonda `e129fase0.js` (não versionada, sob a trava `e129-lock.sh`): os três casos da C266 reproduzidos pela rota, e mais
  três (APROVADO sem estoque a partir de RECEBIDO, 200 em id inexistente, gravação com a marca viva). Instrumentação da suíte inteira
  (245 chamadas ao `/conferir`; restauro por cópia, md5 conferido): só o D10 da 43 (dois testes) dependia do 200 depois da entrada.
- **Testes escritos antes do código** e rodados **vermelhos**: 3/16 (T1), 0/7 (T2), 1/4 (T3). Os que passavam no código antigo eram
  controles (os status de conferência que aceitam, o item estranho, o que não muda, a A77 — SQL só do teste), provados pelas sabotagens.
- **Fase 2 antes do código de produção:** 3 Important + 7 Minor, todos aceitos (ver o topo). Design e plano `53b41202`.
- **Divergências da execução:** (1) a RN-09 (o `/fiscal`) entrou pela Fase 2 — não estava no plano original; (2) o cenário RN-13f da
  Etapa 122 (`estadoForaDaAuditoriaFase5`, UPDATE do item com `changes 0` simulado) passou de 200 para 409 (o item do recebimento que não
  grava perdeu uma corrida, RN-06) — mudado à vista, a trilha continua provada ausente; (3) a contagem do registro passou de 25 para 26
  chaves (`relatoriosRegistro`) e os relatórios fechados para a PRODUÇÃO de 3 para 4 (`relatoriosJornada`, Fase 2 I3); (4) a literal L4
  dizia *use "Aprovar"* — a tela de Recebimentos **não tem** o botão Aprovar (só o *Processar Nota*); trocada no fechamento para *"a
  entrada no estoque é pelo "Aprovar" ou pelo "Processar Nota""* (`6a8b93b4`).
- **Controles positivos** (âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia — `e129-bateria.js` no scratchpad):
  **36** antes da Fase 5 (35 caem pela asserção certa; **1 equivalente**: a própria `entrada_estoque_em IS NULL` no WHERE do item, coberta
  pelo `NOT EXISTS` de item entrado do mesmo recebimento — mantida como cinto) e **19** na Fase 5 (todas caem).
- **Migração:** nenhuma (sem coluna, sem tabela) — a prova de primeiro boot não se aplica.
- **CLAUDE.md:** a seção da trava **não mudou** — a conferência e o `/fiscal` não pegam a trava por material; recusam no comando
  (condição no `WHERE`), e não põem saldo no disponível nem reservam. **Compras:** nada.
- **Suíte (antes dos commits de código T1..T3):** `test:api` **435/435** (a primeira rodada deu 434/435: o RN-13f da 122, acima);
  `test:almoxarifado` **44/0**; `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 10/0; client **126** suítes / **1744** testes;
  `CI=true build` *Compiled successfully*. Commits `d16b8350` (T1), `b1f1e64f` (T2), `b0efb4d4` (T3).
- **Fase 5** — três revisores frescos em paralelo sob a **trava de máquina**; o de sabotagem numa worktree própria (`CRM-wt-e129-r3`,
  removida com as junções desfeitas antes). Eu não rodei nada enquanto eles trabalhavam.
  - **Regra (r1): 1 Important + 5 Minor.** **I1 (reproduzido, corrida real)** — o `/fiscal` ignorava a marca de processamento: com o
    *Processar* em andamento, salvar o modal da nota gravava a quantidade de um item ainda na fila (documento 1, físico 4, PROCESSADO) →
    o `/fiscal` com itens recusa *"Esta nota já está sendo processada"* antes de gravar, e o UPDATE do item leva o `NOT EXISTS` da marca
    (**B835**). **M1** — a A77 do teste não tinha os achados nem o `entrada_estornada` que o plano prometia → acrescentados. **M2
    (reproduzido)** — a A77 deixava de fora o *Reprovado* da conferência antiga com item entrado → o ramo da diferença não filtra o
    status. **M3** — a assimetria conferência × `/fiscal` na nota parcial → declarada (D (129)). **M4** — a perda de material de cliente
    não aparece → declarada. **M5** — sem quantidade mesmo com um material só → declarado (o padrão da `ajustes-por-motivo`).
  - **Permissão (r2): 2 achados.** **A1 (reproduzido, anterior)** — o valor das perdas se calcula com o que está aberto (o histórico com a
    quantidade e o cadastro com o custo de cada material) → **C268**, e a B832 diz que o gate barra só a soma. **A2 (reproduzido)** — a
    literal *"corrija por um ajuste"* mandava o Compras (que confere) a um gesto que recebe 403 (o ajuste é `movimentar`) → as literais
    dizem o perfil. E o comentário de `ownerRules.js` dizia que o ajuste de material nosso *"segue em ajustar_estoque"* — **estava errado**
    (o Gestor leva 403), corrigido dizendo isso. Resistiu: o perfil vem antes de qualquer recusa nova (tabela perfil × rota medida no
    relatório dele), lista e export pelo mesmo `can()`, nenhuma tela muda. Sobre o `/usuarios/:id/grupos`: a justificativa da B836 é
    verdadeira; o que ele expõe **a mais** (perfil do almoxarifado e da frota, permissão por ação, negações, descrição) ficou escrito na B836.
  - **Sabotagem (r3): 29** sabotagens novas, **19** sobreviveram: **13** (a) faltava asserção → viraram cenários (centavos 0,35 × 3,
    materiais distintos, `ultimo_em` pelo MAX, desempate motivo/tipo, `material_id` vazio, a RN-02 antes da RN-03, a marca antes do UPDATE
    do status, a janela de 9 min e meio, o aumento no `/fiscal`, o item sem quantidade, o item de outro recebimento, o APROVADO sem item
    entrado na guarda e na corrida, a A77 com a recebida nula); **6** (b) equivalentes provados (o `DATE()` do início, o `GROUP BY` sem o
    id, os ganchos com `itens` × `gravados`, o `catch` dos ganchos, o `push` antes do `changes`, o `ORDER BY` da A77). As outras 10 das 29 caíram.
- **Fase 5, commit:** `bce8f530` (o `/fiscal` sob a marca, as literais com o perfil, o comentário de `ownerRules`, a A77 nova e os 14
  cenários). Controles das correções: 19 sabotagens (as 3 do `/fiscal` sob a marca + as 16 dos sobreviventes do r3 e do r1-M2), todas
  caem pela asserção certa, md5 restaurado.
- **Suíte final (medida depois da Fase 5, antes da documentação):** `test:api` **435/435**; `test:almoxarifado` **44/0**;
  `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 10/0; client **126** suítes / **1744** testes; `CI=true build` *Compiled
  successfully*. **Depois da troca da L4** (`6a8b93b4`), rodada de novo: os mesmos números (`test:api` 435/435, `test:almoxarifado` 44/0, 4/0, 3/0,
  10/0, client 126 / 1744, build compilado).
- **T4 — fechamento** (o commit de documentação — ver `git log`): novidades (cabeçalho, A77, B830–B837, C266 resolvida, C267, C268,
  D (129), F (129), a seção da etapa, "Onde estamos"), specs 08 e 21, mapa, guia, manual (14.2b, 15b.3 e o relatório novo), este plano,
  o "defeito que escapou" da retro da 128.

## Tasks — estado

- [x] **T1** `d16b8350` (Fase 5 `bce8f530`; a literal L4 `6a8b93b4`) · [x] **T2** `b1f1e64f` (Fase 5 `bce8f530`) · [x] **T3** `b0efb4d4` (Fase 5 `bce8f530`) ·
  [x] **T4** — o commit de documentação.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** (Fase 5: o `/fiscal` sob a marca, as literais, a A77 e 14 cenários). Testes antigos que
   mudaram à vista: `naoConformidadeGanchos` (6) e `naoConformidadeRegressao` (2) (o D10 da 43, B830), `estadoForaDaAuditoriaFase5`
   RN-13f (200 → 409), `relatoriosRegistro` (25 → 26) e `relatoriosJornada` (3 → 4).
2. **Achados da revisão:** Fase 2 — **3 Important + 7 Minor, todos reais**. Fase 5 — r1 **1 Important + 5 Minor** reais (2 corrigidos,
  3 declarados); r2 **2** reais (1 corrigido, 1 registrado na C268, anterior); r3 **19** sobreviventes — 13 viraram cenários, 6
  equivalentes provados; **0** ruído.
3. **Paralelismo:** **0** galhos em paralelo de fato (T2 é galho por regra, mas "um teste por vez" a serializa), **0** retrabalho; **1**
   revisor na Fase 2 e **3** em paralelo na Fase 5 sob a trava.
4. **Defeito que escapou:** *(preencher na Etapa 130)*.

## Próxima tarefa detalhada — Etapa 130

*(A série desta etapa foi B830–B837, C267, C268, A77 — a 130 começa em **B838**, **C269**, **A78**; confira com `grep -oE` antes.)*

**Medido em 2026-10-16 (Fase 0 e Fase 5 desta etapa):** sem o P.O., três candidatas; a primeira é integridade, no mesmo molde da C266.

1. **C267 — o `/fiscal` ainda muda lote, série e valores de um item que já entrou (feature 08) — a principal. Não depende do P.O.**
   `PUT /api/almoxarifado/recebimentos/:id/fiscal` (`receiptService.salvarDadosFiscal`) só fechou a **quantidade** do item entrado
   (`assertQuantidadeDoItemEntradoIntacta`, RN-09 desta etapa) e a gravação durante o processamento (B835). Para o item com
   `entrada_estoque_em`, o UPDATE ainda aceita `lote`, `data_validade_lote`, `data_fabricacao_lote`, `corrida_lote`, `series`,
   `valor_unitario`, `valor_total`, `valor_icms`, `valor_ipi`, `reducao_icms_percent`. **Medir antes de congelar:** o lote e as séries já
   foram criados na entrada (`lotService`, `series_almoxarifado` com `recebimento_item_id`) — mudar o texto no item diverge do lote real;
   o valor unitário alimentou o custo médio na entrada (o motor) e a conta a pagar sai do cabeçalho (`gerarContaPagar(rec)`) — corrigir
   valor depois da entrada pode ser legítimo (nota fiscal corrigida) ou não; quem o lê depois (relatórios de custo, devolução ao
   fornecedor — `returnService` e o valor da devolução?). **Contrato candidato (reversível, letra B):** para o item entrado, os campos de
   lote e série só aceitam o eco (409 senão, com uma literal no molde da L7 dizendo onde corrigir — a tela de Lotes/Séries); os valores,
   decidir pela medição (se nada os lê depois da entrada, aceitar e declarar; se o custo médio ou a devolução os lê, recusar). **Pontos de
   atenção:** o modal da nota reenvia **todos** os campos de todos os itens (o eco tem de passar, inclusive datas em formatos diferentes e
   `series` como texto/JSON — normalizar antes de comparar); o NULL legado; o teste RN-09 desta etapa e o `recebimentoChegouZero`.
2. **Núcleo — as três leituras de usuário (B836):** `GET /api/usuarios`, `GET /api/usuarios/:id` e `GET /api/usuarios/:id/grupos` só
   exigem token. Medido: o `/grupos` expõe a mais o perfil do almoxarifado/frota e as permissões por ação. Fechar as três juntas exige
   medir quem chama (o seletor de responsável em várias telas usa a lista; `UsuarioForm`; o `permissionsCache` do próprio usuário) — o
   próprio usuário e quem gerencia usuários continuam lendo. **Baixa**; reversível.
3. **Feature 21 — os relatórios de custo e o custo aberto (C268):** depende do P.O. dizer se o custo é sigiloso. **Não implemente** sem a
   resposta; se ele responder, o caminho é fechar `custo_medio`/`custo_unitario` nas leituras de material para quem não tem
   `gerenciar_reposicao` (várias telas — medir).
4. **Dependem do P.O. — NÃO implemente:** **B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**, **C219**,
   **C230**, o reparo da **C246** (e a **C247**), a tabela de conversões e o grupo acima de família, a **régua do tempo de recebimento
   (E2)**, a **C268** (o custo sigiloso?); na 05, os itens de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização
   por cliente e previsto × realizado; na 22, **B13**, **B101**/G30, **G38**.

**Escolhida: a C267 (1)**, com a medição dos valores antes de prometer o contrato deles.

**O que já está pronto e não precisa reabrir:** a conferência depois da entrada (`assertConferenciaPermitida`, RN-01..RN-06 — a C267 é
só do `/fiscal`); a quantidade do item entrado e a marca no `/fiscal` (RN-09, B835); o relatório `perdas-por-motivo` (B832, B833); a A77.
