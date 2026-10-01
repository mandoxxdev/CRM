# Etapa 67 — os indicadores que faltam da spec 27 (feature 21)

> Status: **EM EXECUÇÃO — Fases 0, 1 e 2 feitas; T1 (tronco) FEITA (`22c6e57`, `fd159b6`, `9126d88`); T2 (`2ee2f86`)
> e T3 FEITAS no servidor (registro com 25 chaves); T4 (`e3ed85d`), T4b (`81e35fd`) e T5 (integração) FEITAS.**
> Próximo passo: T6 (verificação e fechamento). Feature 21, item `[ ]` "Indicadores da spec 27 restantes: % requisições no prazo/integrais,
> divergência e rejeição por fornecedor, nº de ajustes" (`specs/modulo-almoxarifado/21-relatorios-dashboards/README.md:81`
> e `:102`); requisito em `specs/modulo-almoxarifado/2026-08-02-requisitos-modulo-almoxarifado.md:1064-1076`
> ("Indicadores principais").

**Escopo desta etapa:** os cinco indicadores nomeados, porque os cinco **têm dado confiável** (medido abaixo) — com a
régua de cada um escrita na `nota`. Três blocos novos no `indicadores` (no prazo, integrais, ajustes), duas chaves novas
no registro (`ajustes-por-motivo`, `qualidade-fornecedores`), um cartão no dashboard, e a correção de um defeito achado
na medição (**C89**: o tempo de atendimento conta requisição excluída). O resto da lista da spec 27 está coberto ou
vira "falta" com o motivo (fim do documento).

## Fase 0 — medido (2026-10-01)

### 1. A lista da spec 27 contra o que existe

`2026-08-02-requisitos-modulo-almoxarifado.md:1064-1076`, um por um:

| Indicador (spec 27) | Estado | Onde |
|---|---|---|
| Acuracidade física | coberto | relatório de acuracidade da 10b (`routes/almoxarifado.js:1039`, gate `inventario`) |
| % de requisições atendidas no prazo | **falta → esta etapa** | — |
| % de requisições atendidas integralmente | **falta → esta etapa** | — |
| Tempo médio entre requisição e entrega | coberto (com defeito, C89) | `indicadores.atendimento_requisicoes` (`reportService.js:517-531`) |
| Divergência de recebimento por fornecedor | **falta → esta etapa** | o detector existe por item (`alertRegistry.js:234-257`), sem agrupar por fornecedor |
| Índice de rejeição por fornecedor | **falta → esta etapa** | — |
| Valor de estoque parado | coberto (por material) | `purchaseService.estoqueParado`, `valor_parado` (aba Estoque Parado, Etapa 11) |
| Valor de sucata | coberto | `sucata-financeiro` (Etapa 9) |
| Número de ajustes | **falta → esta etapa** | o histórico filtra `grupo=AJUSTE` (`reportService.js:181`), mas não conta nem agrupa |
| Consumo não previsto por projeto | **fora** — depende de BOM/OP (feature 22) | — |
| Estoque de materiais de clientes | coberto | `materiais-cliente` |
| Materiais em terceiros atrasados | coberto | flag `vencida` da lista de remessas (`thirdPartyService.js:319-325`) |

O `indicadores` hoje (`reportRegistry.js:401-435`, `reportService.js:429-544`) serve: giro, cobertura, rupturas,
valor por grupo e atendimento. Devolve OBJETO (`exportavel: false`), param `janela_dias` com o 400 literal
`'Parâmetro "janela_dias" deve ser um número inteiro maior que zero'` (`reportService.js:436`).

### 2. % no prazo / integrais — as datas das requisições

- **Entrega final: há timestamp confiável.** `requisicoes_almoxarifado.data_entrega` (`schema.js:438`) tem **um único
  escritor** — `requisitionService.js:1152-1155` — e ele só roda quando `todosItensCompletos` é verdadeiro
  (`requisitionService.js:82-84`: `every(entregue >= solicitada)`). A entrega parcial grava só `status` e `updated_at`
  (`:1157-1160`). Depois de `ENTREGUE` a máquina só permite `ENCERRADA` (`requisitionStateMachine.js:59`) e
  `PODE_ENTREGAR` não inclui `ENTREGUE` (`:79`) — o carimbo não é reescrito.
- **"Integral" já é dado por construção:** `data_entrega IS NOT NULL` ⇔ todos os itens entregues na quantidade pedida.
  Item **não tem cancelamento** nem redução de solicitada: o único escritor de `quantidade_solicitada` é o INSERT da
  criação (`requisitionCreateService.js:166`); os UPDATEs de item mexem só em separada/entregue/origem
  (`requisitionService.js:704`, `:1109`, `:1137`). A pergunta "item cancelado conta?" não tem objeto.
- **Encerramento:** `PUT /requisicoes/:id/encerrar` grava `ENCERRADA` + `encerrado_em` (`routes/almoxarifado.js:3764-3772`),
  a partir de `ENTREGUE` ou `PARCIALMENTE_ATENDIDA` (`requisitionStateMachine.js:58-59`). Encerrada sem completar tem
  `data_entrega NULL` — é a "não integral".
- **Prazo:** `data_necessidade DATE` (`schema.js:2257`), opcional. **Não tem validação de formato nenhuma** —
  `schemas.js:350` é `z.string().nullable().optional()`. O legado *DD/MM/AAAA* (**D (64)**) é só o caso conhecido;
  qualquer texto entra. Régua testada: `date('15/09/2026')` no SQLite é `NULL` — filtrar por `date(...) IS NOT NULL`
  separa o válido.
- **Convenção de dia:** o alerta `REQUISICAO_ATRASADA` já compara `date(r.data_necessidade) < date('now')`
  (`alertRegistry.js:533-534`) — dia **UTC**. `data_entrega` é `CURRENT_TIMESTAMP` (UTC). A régua nova usa a mesma.
- **Exclusão:** `DELETE /requisicoes/:id` (`routes/almoxarifado.js:3899`) não tem guarda de status — exclui inclusive
  `ENTREGUE`, estorna as entregas e grava `ativo=0, status='CANCELADO'` (`requisitionService.js:1287-1291`) **sem limpar
  `data_entrega`**.

### 3. Divergência e rejeição por fornecedor — as fontes

- **Fornecedor:** cabeçalho do recebimento, `fornecedor_id` + `fornecedor_nome` (+ `fornecedor_cnpj`)
  (`schema.js:1294-1308`, `:1603`). Recebimento de pedido herda do pedido; NF avulsa traz o digitado
  (`receiptService.js:414`, `:453`). `fornecedores` é tabela CORE (criada em `server/index.js:19213`; o harness a recria,
  `testApp.js:64`) — o relatório lê o **snapshot do recebimento**, sem JOIN no core.
- **Data:** `data_recebimento DATETIME DEFAULT CURRENT_TIMESTAMP` (`schema.js:1301`) — **sem escritor além do DEFAULT**
  (grep em routes/ e services/: só o schema). O item não tem timestamp próprio (`alertRegistry.js:194-198` já declara).
- **Divergência de quantidade:** o item guarda `quantidade_esperada` e `quantidade_recebida` (`schema.js:1310-1322`);
  `NULL` = não conferido. Régua única: `divergenciaRealSql` (`divergencia.js:23-27`, ε = 1e-9), a mesma do alerta
  `DIVERGENCIA_RECEBIMENTO` (`alertRegistry.js:252-253`).
- **Rejeição:** `inspecoes_recebimento_almoxarifado.quantidade_aprovada/quantidade_reprovada` (`schema.js:1345-1346`,
  desde a Etapa 5). `decidirInspecao` decide **todo o retido de uma vez** e o claim impede decidir duas vezes
  (`inspectionService.js:187-192`, `:252-258`); a linha só é gravada depois dos dois claims (`:292`). Só material
  **crítico** com a config ligada vai para inspeção (`receiptService.js:1224`).
- **As outras fontes de "rejeitado" — e por que contá-las daria dobro:**
  1. **NC de inspeção** — aberta automaticamente para **toda** inspeção com reprovada > 0
     (`nonConformityService.js:653-690`): é espelho da inspeção, não fato novo.
  2. **NC de recebimento** (`origem RECEBIMENTO`, tipo `QUANTIDADE`, `:620-635`) — espelho da divergência. Pode haver
     **várias por item** ao longo do tempo: o índice único é parcial (`status='ABERTA'`) e a RN-10 reabre quando o fato
     muda (`schema.js:1531-1542`); a cancelada automática é divergência que sumiu.
  3. **Devolução ao fornecedor** (Etapa 45, movimento `DEVOLUCAO_FORNECEDOR`, carimbo `devolucao_fornecedor_em`,
     `schema.js:1383`) — consequência da reprovação.
  4. **Status `REPROVADO` do recebimento** — `conferirRecebimento` aceita `status` livre do body, incluindo `REPROVADO`
     (`receiptService.js:821-826`), sem quantidade nem trava; a tela **não manda status** (`RecebimentosAlmoxarifado.js:506-511`).
     Só entra por API. Não é fonte confiável.
- **Unidades:** um fornecedor entrega kg, m e peça. Somar `quantidade_reprovada` entre materiais mistura unidades.

### 4. Número de ajustes

- Tipos: `AJUSTE` (valor **absoluto**), `AJUSTE_POSITIVO`, `AJUSTE_NEGATIVO` (`schema.js:58-61`, `:142`) e
  `AJUSTE_INVENTARIO` (`schema.js:150`, dedicado — só a conclusão da conferência emite, `routes/almoxarifado.js:1592-1599`).
  O grupo `AJUSTE` do histórico é `LIKE 'AJUSTE%'` (`reportService.js:181`) e pega exatamente os quatro.
- **Estorno:** marca a original `cancelado = 1` (`stockService.js:2228`) e grava uma linha de tipo `ESTORNO`
  (`:2485`). `cancelado = 0` + `LIKE 'AJUSTE%'` tira as duas.
- **Motivo:** `movimentacoes_almoxarifado.motivo_id` (Etapa 66, `schema.js:1247`). `AJUSTE_INVENTARIO` **nunca** tem
  `motivo_id`: o cadastro só aceita `TIPOS_MOVIMENTO_ROTA` (`schemas.js:58-60`), que exclui os dedicados.
- `AJUSTE` grava o **valor absoluto** em `quantidade` — somar `quantidade` de ajustes não dá a correção feita.

### 5. O padrão do registry e do dashboard

- Entrada declarada por chave (`reportRegistry.js:1-53`): `titulo`, `categoria`, `acao` (gate ou `null` explícito),
  `exportavel`, `nota`, `limite`, `params`, `colunas`, `fn: null` ligada em `extended.js:2184-2251`, com validação dos
  dois sentidos na subida.
- A varredura `relatoriosRegistro.api.test.js:321-381` exige: toda `chave` de `colunas` sai do **SQL** (TEMP VIEW +
  PRAGMA — coluna calculada em JS falha); todo param muda o SQL/params; `limite` bate com o `LIMIT`. Contagem de
  chaves fixa em **23** (`:62-64`, `:91`, `:106`, `:135`).
- A tela (`RelatoriosAlmoxarifado.js:128-200`) renderiza payload objeto **genericamente** (escalar → card, objeto →
  grade, array → tabela) e `null` como `—` (`:81`). Blocos novos no `indicadores` e chaves novas aparecem sem código de
  tela.
- O dashboard (`AlmoxarifadoDashboard.js:364-400`) tem 3 cartões e só renderiza se `giro`, `rupturas` e
  `atendimento_requisicoes` existirem; legenda escrita no cartão (a nota não chega ao dashboard).

**Controle da régua de busca:** os greps de ausência foram testados contra o que existe — `rejei` acha "Rejeitar"/
"rejeição" no requisito (`:314-315`); `diverg` acha `:445`; `integra` acha "Entregue integralmente" (`:299`).

### Surpresas da medição

1. **"Integral" já existe no dado.** Não é preciso comparar item a item: `data_entrega` só é gravado na entrega
   completa e não há como reduzir ou cancelar item. A pergunta do plano anterior ("item cancelado conta?") não tem
   objeto.
2. **Defeito (C89): o tempo médio de atendimento conta requisição EXCLUÍDA.** `reportService.js:525-529` filtra só
   `data_entrega IS NOT NULL`; excluir uma requisição entregue estorna o estoque e deixa `data_entrega` preenchido
   (`requisitionService.js:1287-1291`). O cartão do dashboard inclui no tempo médio uma entrega que foi desfeita.
   Medido por leitura; a T1 começa reproduzindo.
3. **Fato errado na nota do `indicadores`:** "Materiais de clientes ficam fora de **todos** os blocos" — o atendimento
   nunca filtrou dono (é por requisição). A nota nova corrige o texto (regra 5).
4. **`data_necessidade` não tem validação de formato nenhuma** (`schemas.js:350`), e não só o legado DD/MM/AAAA.
5. **Somar quantidade mente duas vezes:** na rejeição (unidades diferentes por fornecedor) e nos ajustes (`AJUSTE`
   guarda o absoluto). Os índices contam **itens/inspeções/lançamentos**.
6. **Quatro fontes candidatas a "rejeitado"** (inspeção, NC, devolução ao fornecedor, status `REPROVADO`); só a
   inspeção tem quantidade, trava e um registro por decisão. As outras três são espelho, consequência ou texto livre.
7. **Tempo médio de recebimento** (spec 27, "Gestão") ganhou dado sem ninguém notar: `entrada_estoque_em` por item
   (Etapa 6) é um timestamp de entrada no estoque. A spec 21 diz "nenhum timestamp confiável" — **não está mais
   certo**, mas a confiabilidade precisa de medição própria (claim que volta a `NULL` se falhar) e não está nos
   "Indicadores principais". Fica como candidato (fim do documento).

## Decisões (reversíveis — letra B do documento de novidades; última usada: B271)

- **D1 (B272) — "no prazo" ancora no PRAZO e entra no dia do prazo.** O universo são as requisições cujo
  `date(data_necessidade)` está em `[hoje − janela_dias, hoje]`; no prazo = `data_entrega` preenchida com
  `date(data_entrega) <= date(data_necessidade)`. Prazo de hoje ainda não entregue fica fora do denominador
  (`em_aberto_no_dia`). Entregue antes do prazo entra quando o prazo chega. Descartados: ancorar na entrega (some com
  quem nunca foi entregue: o atraso aberto não contaria — viés para cima); contar o prazo de hoje não entregue como
  atrasado (o dia ainda não acabou).
- **D2 (B273) — atrasada inclui a ainda aberta com prazo vencido**, a entregue parcial e a encerrada sem completar.
  `PENDENTE` com prazo vencido também conta: o solicitante não foi atendido. Descartado: só as entregues (esconde a
  pior falha).
- **D3 (B274) — dia UTC**, como o alerta `REQUISICAO_ATRASADA` e os relatórios de consumo. Entrega às 22h de Brasília
  cai no dia seguinte. Declarado na nota. Descartado: `'localtime'` (depende do fuso do servidor e não existe igual no
  Postgres).
- **D4 (B275) — "integral" = `data_entrega IS NOT NULL`** entre as finalizadas na janela (`ENTREGUE`/`ENCERRADA`,
  âncora `COALESCE(data_entrega, encerrado_em)`). Devolução depois da entrega não desfaz. Descartado: comparar item a
  item (refaz o que o motor já garante e cria uma segunda definição).
- **D5 (B276) — corrigir o C89 nesta etapa**: o atendimento passa a filtrar `COALESCE(ativo,1) = 1`. Reabre o `WHERE`
  de um bloco existente, contra o "não se reabre" do plano anterior — mas é defeito com cenário, não mudança de régua por
  gosto. Descartado: só declarar (o cartão do dashboard continuaria contando entrega desfeita).
- **D6 (B277) — divergência e rejeição por fornecedor contam ITENS e INSPEÇÕES, não quantidades.** Divergência: itens
  conferidos com diferença, uma vez por item, pelo estado **atual**. Rejeição: inspeções com alguma reprovada ÷
  inspeções decididas. Descartados: Σ reprovada ÷ Σ recebida (mistura unidades); contar NCs (várias por item; espelho).
- **D7 (B278) — NC, devolução ao fornecedor e status `REPROVADO` do recebimento NÃO entram.** Liberar por NC depois de
  reprovar **não** tira a reprovação do índice (a inspeção reprovou; a concessão é decisão posterior). Descartado:
  descontar as liberadas (o índice mede a entrega do fornecedor, não a nossa tolerância).
- **D8 (B279) — fornecedor agrupado por `fornecedor_id` quando existe, senão pelo nome digitado** (`trim` +
  `lower`), senão "Sem fornecedor". `lower` do SQLite só dobra ASCII — "FUNDIÇÃO" e "Fundição" podem sair em duas
  linhas (declarado). Descartado: JOIN no cadastro core (o harness e base sem Compras não têm o mesmo dado) e agrupar em
  JS (a varredura do registro exige colunas do SQL).
- **D9 (B280) — material de cliente FORA** dos ajustes e da qualidade por fornecedor (como giro/cobertura/rupturas);
  os blocos de requisição contam a requisição inteira. Material **inativado conta** nos ajustes (é fato do livro).
  Descartados: incluir cliente nos ajustes (quebraria a frase de dono da nota); tirar inativo (o número cairia ao
  inativar).
- **D10 (B281) — gate `null` nas duas chaves novas.** O histórico já mostra os mesmos ajustes sem gate, e
  `recebimentos-pendentes` já mostra fornecedor sem gate. Descartado: `inspecionar` ou `receber_material` (regra nova
  sem pedido — apertar depois é uma linha).
- **D11 (B282) — um cartão novo no dashboard: "% no prazo"**, com legenda da régua; integral e ajustes ficam no
  relatório. Descartado: três cartões (o dashboard é para o número que cobra ação; o atraso é o que cobra).
- **D12 (B283) — percentual `null` quando o denominador é zero** (a tela mostra `—`). Descartado: `0` (diria "0% no
  prazo" sem nenhuma requisição — mentira).

## Regras de negócio

- **RN-01 (no prazo)** — com janela N: `consideradas` = requisições vivas (`COALESCE(ativo,1)=1`, status fora de
  `RASCUNHO`, `CANCELADO`, `REJEITADO`) com `date(data_necessidade)` não nulo e em `[date('now','-N days'), date('now')]`,
  **menos** as de prazo hoje ainda sem `data_entrega`. `no_prazo` = `data_entrega` não nula e
  `date(data_entrega) <= date(data_necessidade)`. `fora_do_prazo = consideradas − no_prazo`.
  `percentual = round(100·no_prazo/consideradas, 2)` ou `null`.
  Cenário (+): prazo hoje, entregue completa hoje → `no_prazo` +1. Cenário (−): prazo há 2 dias, entregue hoje →
  `fora_do_prazo` +1 e `no_prazo` igual; prazo há 2 dias, parcial → `fora_do_prazo` +1.
- **RN-02 (fora do denominador)** — prazo hoje e não entregue → `em_aberto_no_dia` +1, `consideradas` igual.
  Requisição viva criada na janela com `data_necessidade` nula, vazia ou que `date()` não lê → `sem_data_valida` +1 e
  fora de `consideradas`. Prazo antes da janela ou no futuro → fora de tudo.
  Cenário (+): `'15/09/2026'` conta em `sem_data_valida`; (−): o mesmo prazo em `2026-09-15` dentro da janela conta em
  `consideradas`.
- **RN-03 (integral)** — `consideradas` = requisições vivas com status `ENTREGUE` ou `ENCERRADA` e
  `COALESCE(data_entrega, encerrado_em) >= datetime('now','-N days')`. `integrais` = as com `data_entrega` não nula;
  `encerradas_incompletas` = o resto. Percentual como na RN-01.
  Cenário (+): entregue completa → `integrais` +1; entregue e depois encerrada → `integrais` +1 **uma vez só**.
  (−): parcial + encerrada → `encerradas_incompletas` +1; parcial ainda aberta → fora.
- **RN-04 (excluída fica fora — corrige C89)** — requisição com `ativo = 0` não entra em RN-01, RN-03 **nem** no
  `atendimento_requisicoes`. Cenário: entregar completa (+1 em `no_prazo`, `integrais` e `total_consideradas`), excluir
  pelo `DELETE` → os três voltam. Metade positiva: outra requisição entregue, não excluída, continua contada.
- **RN-05 (número de ajustes)** — `ajustes.total` = lançamentos com `tipo LIKE 'AJUSTE%'`, `cancelado = 0`,
  `created_at >= datetime('now','-N days')`, material **sem** `proprietario_cliente_id`; `por_tipo` = contagem por tipo
  (só os que aparecem). Cenário (+): AJUSTE_NEGATIVO +1; conclusão de conferência com divergência → `AJUSTE_INVENTARIO`
  +1. (−): PERDA não conta; estornar o AJUSTE_NEGATIVO volta o total (nem a original nem a linha `ESTORNO` contam);
  ajuste em material de cliente não conta; ajuste em material depois inativado **conta**.
- **RN-06 (ajustes por motivo)** — mesma régua da RN-05 por período (`DATE(created_at)` entre `data_inicio` e
  `data_fim`, opcionais) e `material_id` opcional. Uma linha por: motivo do cadastro (`motivo_id`), com o **nome atual**
  e `" (desativado)"` se inativo — origem `Cadastro`; `AJUSTE_INVENTARIO` — origem `Inventário`, motivo
  `Ajuste de conferência de inventário`; demais sem `motivo_id` — origem `Texto livre`, motivo `Sem motivo do cadastro`.
  Cenário (+): dois ajustes com motivo M, renomear M para M' → **uma** linha "M'" com 2. (−): um ajuste digitado à mão
  com o texto "M" cai em "Sem motivo do cadastro", não na linha de M.
- **RN-07 (paridade)** — com o mesmo recorte, Σ `ajustes` de `ajustes-por-motivo` = `indicadores.ajustes.total` = nº de
  linhas do `historico-movimentacoes?grupo=AJUSTE` dos materiais próprios. Cenário: três ajustes de origens diferentes
  → os três números são 3.
- **RN-08 (divergência por fornecedor)** — por fornecedor (D8), no período por `DATE(r.data_recebimento)`, itens de
  material próprio: `itens_conferidos` = `quantidade_recebida IS NOT NULL`; `itens_divergentes` = conferidos com
  `divergenciaRealSql(recebida − esperada)`; `itens_com_falta` (recebida < esperada) e `itens_com_sobra` (>) — excedente
  autorizado conta como sobra; `percentual_divergencia` = ÷ `itens_conferidos` ou `null`. Uma vez por item, pelo estado
  atual. Cenário (+): esperada 10, recebida 8 → divergente e com falta; (−): recebida 10 → conferido e não divergente;
  reconferir 8 → 9 → 8 (NC aberta, cancelada, reaberta) → continua **1** item divergente.
- **RN-09 (rejeição por fornecedor)** — `inspecoes` = inspeções dos itens do fornecedor no período com
  `quantidade_aprovada` ou `quantidade_reprovada` não nula; `inspecoes_com_reprovacao` = as com reprovada > 1e-9;
  `indice_rejeicao` = ÷ `inspecoes` ou `null`. NC, devolução ao fornecedor e status `REPROVADO` do recebimento não
  somam. Cenário (+): inspeção aprova 5 e reprova 3 → `inspecoes` 1, `com_reprovacao` 1, índice 100; executar a
  devolução ao fornecedor → índice igual. (−): fornecedor com inspeção 100% aprovada aparece com índice **0**;
  fornecedor sem inspeção aparece com índice `null`; inspeção legada sem quantidades não conta.
- **RN-10 (sem dobra por junção)** — item com duas linhas de inspeção conta 1 em `itens_conferidos` e 2 em
  `inspecoes`. Cenário: semear a segunda inspeção do mesmo item (forma de dado real: reter de novo) → contagens de item
  iguais, inspeções +1.
- **RN-11 (registro)** — as duas chaves novas seguem o registro: aparecem na lista para qualquer usuário do módulo
  (gate `null`, sem perfil = PRODUCAO), exportam XLSX com os cabeçalhos das colunas, cada param muda o SQL, e a contagem
  do registro passa de 23 para **25**. Cenário: usuário sem perfil lista e abre as duas (200); export traz
  "Fornecedor" e "% rejeição".
- **RN-12 (dashboard)** — cartão "Requisições no prazo" com `percentual` + "%" (ou `—` se `null`), legenda
  `Janela de N dias · prazo vencido até hoje · entrega completa até o dia`. O cartão só aparece se o bloco vier — servidor
  sem o bloco mantém os três cartões de hoje. Cenário (+): percentual 75 → "75%"; (−): `null` → "—", nunca "0%".

## Contrato (congelado)

### `GET /api/almoxarifado/relatorios/indicadores` — aditivo

Resposta de hoje **mais** três blocos (nenhuma chave existente muda de nome ou forma):

```
requisicoes_no_prazo:  { percentual: number|null, no_prazo, fora_do_prazo, consideradas, em_aberto_no_dia, sem_data_valida }
requisicoes_integrais: { percentual: number|null, integrais, encerradas_incompletas, consideradas }
ajustes:               { total, por_tipo: [{ tipo, total }] }   // por_tipo ordenado por tipo
```

- `atendimento_requisicoes`: mesma forma; o `WHERE` ganha `COALESCE(ativo,1) = 1` (C89).
- Erro: o de hoje, `400 'Parâmetro "janela_dias" deve ser um número inteiro maior que zero'`. Nenhum novo.
- `nota` — o texto de hoje com **"Materiais de clientes ficam fora de todos os blocos."** trocado por
  **"Materiais de clientes ficam fora de giro, cobertura, rupturas, valor e ajustes; os blocos de requisição contam a
  requisição inteira."**, "Tempo de atendimento: só requisições com entrega COMPLETA, de TODO o histórico (sem
  janela)." ganhando **" Requisição excluída fica fora."**, e acrescida de (literal):

  > Requisições no prazo: as que têm o prazo (data de necessidade) entre o início da janela e hoje; no prazo é a entrega
  > COMPLETA até o dia do prazo; entrega parcial, encerrada incompleta e ainda aberta com o prazo vencido contam como
  > fora do prazo; prazo de hoje ainda não entregue não entra (em_aberto_no_dia). Sem data de necessidade, ou com data
  > fora do formato AAAA-MM-DD, a requisição fica fora e é contada à parte (sem_data_valida). As datas comparam o DIA em
  > UTC. Requisições integrais: das finalizadas na janela (entrega completa ou encerramento), as que tiveram todos os
  > itens entregues na quantidade pedida; encerrada sem completar não é integral, e devolução depois da entrega não
  > desfaz. Requisição excluída fica fora de todos os blocos de requisição. Ajustes: lançamentos AJUSTE,
  > AJUSTE_POSITIVO, AJUSTE_NEGATIVO e AJUSTE_INVENTARIO na janela, sem os estornados; material inativado conta. O
  > detalhe por motivo está no relatório Ajustes por motivo.

### `GET /api/almoxarifado/relatorios/ajustes-por-motivo` (+ `/export`)

```
titulo: 'Ajustes por motivo', categoria: 'Movimentações', acao: null, exportavel: true, limite: null
params: data_inicio (date), data_fim (date), material_id (number, rótulo 'Material')
colunas: origem 'Origem' · motivo_id 'Motivo (id)' · motivo 'Motivo' · ajustes 'Ajustes' ·
         materiais 'Materiais' · ultimo_em 'Último em'
ordem: ajustes DESC, motivo
```

- 400 `'Parâmetro "material_id" deve ser um número inteiro positivo'` (mesmo molde do `motivo_id` do histórico,
  `reportService.js:217-224`; vazio = sem filtro). Datas: sem validação, como o histórico.
- `nota` (literal): **"Conta os lançamentos AJUSTE, AJUSTE_POSITIVO, AJUSTE_NEGATIVO e AJUSTE_INVENTARIO (o mesmo grupo
  AJUSTE do Histórico de movimentações), sem os estornados. O motivo do cadastro aparece pelo nome ATUAL: renomear junta
  as linhas antigas, e o livro continua com o nome do momento. O ajuste de inventário não usa o cadastro e tem linha
  própria; os demais sem motivo do cadastro aparecem juntos em "Sem motivo do cadastro", mesmo que o texto digitado
  seja igual ao nome de um motivo. Quantidades não são somadas (cada material tem sua unidade, e o AJUSTE grava o saldo
  final, não a diferença). Materiais de clientes ficam fora; material inativado conta. As datas comparam o DIA em
  UTC."**

### `GET /api/almoxarifado/relatorios/qualidade-fornecedores` (+ `/export`)

```
titulo: 'Qualidade por fornecedor', categoria: 'Gestão', acao: null, exportavel: true, limite: null
params: data_inicio (date), data_fim (date)   — sobre DATE(r.data_recebimento)
colunas: fornecedor 'Fornecedor' · agrupado_por 'Agrupado por' (Fase 5) · recebimentos 'Recebimentos' · itens_conferidos 'Itens conferidos' ·
         itens_divergentes 'Itens com divergência' · itens_com_falta 'Com falta' · itens_com_sobra 'Com sobra' ·
         percentual_divergencia '% divergência' · inspecoes 'Inspeções' ·
         inspecoes_com_reprovacao 'Inspeções com reprovação' · indice_rejeicao '% rejeição'
ordem: fornecedor
```

- Percentuais no SQL: `ROUND(100.0 * x / NULLIF(y, 0), 2)` (a varredura exige a coluna no SQL).
- Contagem de inspeções por **subconsulta por item** (nunca JOIN item × inspeção na agregação — RN-10).
- Sem 400 novo.
- `nota` (literal): **"Período pela data do recebimento. Divergência: itens conferidos com quantidade recebida
  diferente da esperada (falta ou sobra, inclusive o excedente autorizado), contados uma vez por item pelo estado atual
  da conferência — as não conformidades abertas por ela não somam de novo. Rejeição: inspeções com alguma quantidade
  reprovada sobre as inspeções decididas; só material crítico passa por inspeção, e inspeção antiga sem quantidade fica
  fora. Liberação posterior por não conformidade e devolução ao fornecedor não mudam o índice. Os índices contam itens e
  inspeções, não quantidades (unidades diferentes não se somam). O fornecedor é agrupado pelo cadastro quando o
  recebimento o tem, senão pelo nome digitado — letras acentuadas em maiúsculas e minúsculas podem separar o mesmo nome.
  Materiais de clientes ficam fora. Sem item conferido ou sem inspeção, o índice fica vazio."**

### Rotas existentes que não mudam
`GET /relatorios` (lista) e o dispatcher/export (`extended.js:2261-2300`): 404 `'Relatório não encontrado'`, 403
`'Sem permissão para este relatório'`, export de objeto → 400 de hoje. `historico-movimentacoes`: intacto.

## Tasks

- [x] **T1 (tronco) — FEITA (2026-10-01): `22c6e57` (M-1), `fd159b6` (formato de `data_necessidade`), `9126d88`
  (blocos + C89 + nota + teste).** Estado real:
  - C89 reproduzido VERMELHO pela rota antes do fix (`total_consideradas` 2 em vez de 1); M-1 vermelho com
    `entregue=0.9999999999999999`.
  - Teste `relatoriosIndicadoresSpec27.api.test.js` **21/21**; "hoje" do SQLite; linha `ativo=0` com status VIVO
    (ENTREGUE / PARCIALMENTE_ATENDIDA / PENDENTE sem prazo) semeada para provar o filtro de cada bloco.
  - Controle positivo: 12 sabotagens, 11 vermelhas no cenário certo (ativo no atendimento → [C89]; ativo no bloco no
    prazo e no integrais, cada um → [RN-04]; `<=`→`<` → [RN-01 +]; prazo de hoje aberto contando → [RN-02];
    sem `cancelado = 0` → [RN-05 −]; sem dono → [RN-05/D9]; âncora só `data_entrega` → [RN-03 −]; sem epsilon →
    [M-1]; sem regex e sem checagem de calendário → [formato]). **1 mutante equivalente:** pôr
    `PARCIALMENTE_ATENDIDA` no `status IN` dos integrais não muda nada — sem `data_entrega` nem `encerrado_em` a âncora
    já a exclui; o `status IN` fica como defesa.
  - Suítes: api 247/247, almoxarifado 42/0, validation 4/0, safealter 3/0, sqlite 5/0. Cliente não roda nesta task
    (nenhum componente lê os blocos novos ainda — é a T4).
  - **Fragmento para a T2:** `reportService.ajustesWhereSql(mv = 'mv', m = 'm')` (exportado) devolve
    `mv.cancelado = 0 AND mv.tipo LIKE 'AJUSTE%' AND m.proprietario_cliente_id IS NULL` — exige JOIN de
    `materiais_almoxarifado` com o alias `m`; a janela/período fica com quem chama. **Não** filtra `m.ativo`
    (inativado conta). Também há `REQUISICAO_VIVA_SQL(r)` e `percentualOuNull` (internos, não exportados).
  - **Validação de `data_necessidade`** (Fase 2, crítico 1): no **serviço** `createRequisicao`, antes de qualquer
    escrita — é o único escritor da coluna (as duas portas, `POST /almoxarifado/requisicoes` e
    `POST /requisicoes-material`, passam por ele; **não há rota de edição** que grave a coluna e o `/copiar` não a
    copia — medido por grep). Regex `AAAA-MM-DD` **e** o dia tem de existir (2026-02-30 passa no regex e o `date()`
    do SQLite o normaliza em vez de recusar). `FORMATO_DATA_NECESSIDADE` exportado do serviço. Com isso o item
    "Validar o formato de `data_necessidade` na criação" da lista "O que fica de fora" **deixou de ser falta**.
  - Divergência do texto do plano: nenhuma no contrato. A frase da nota ficou literal; a frase de dono e o
    " Requisição excluída fica fora." foram trocados no lugar.

  Texto original da task: **T1 (tronco) — o `indicadores`: requisições, ajustes e C89.** `reportService.relatorioIndicadores` ganha os três
  blocos; fragmento único da régua de ajustes (ex.: `AJUSTES_WHERE_SQL` no próprio `reportService.js`, reusando
  `GRUPOS_MOVIMENTO.AJUSTE.like`) que a T2 consome; `atendimento` com `ativo`; `nota` no registro (contrato acima).
  Testes `server/tests/api/relatoriosIndicadoresSpec27.api.test.js`: RN-01..RN-05 com as duas metades, **entrando pela
  rota** (requisição criada/aprovada/separada/entregue/encerrada/excluída pelas rotas reais) e um cenário **pelo
  serviço** (`relatorioIndicadores(db, {janela_dias})`). Primeiro cenário = **reproduzir o C89 vermelho** antes do fix.
  ⚠️ "Hoje" no teste vem do SQLite (`SELECT date('now')`), nunca de `new Date()` local — às 21h de Brasília o JS diz
  outro dia e o teste fica intermitente. Controle positivo: tirar o `ativo` (C89 volta), trocar `<=` por `<` no prazo,
  contar prazo de hoje não entregue, tirar `cancelado = 0`, tirar o filtro de dono — cada uma tem de cair num cenário
  nomeado.
- [x] **T2 (galho, servidor) — FEITA (2026-10-01), commit desta linha.** Estado real:
  - Executada na árvore principal (não em worktree), em sequência com a T3; a contagem do registro foi a **24** aqui
    e a T3 a leva a 25.
  - `reportService.relatorioAjustesPorMotivo(db, {data_inicio, data_fim, material_id})` (exportado) sobre
    `ajustesWhereSql`; `GROUP BY 1, 2, 3` (origem, motivo_id, motivo), `ORDER BY ajustes DESC, motivo`; o balde
    decide por `mv.motivo_id` e o nome vem do JOIN no cadastro (nunca de `mv.motivo`).
  - Teste `relatorioAjustesPorMotivo.api.test.js` **10/10**; RN-07 num banco próprio (Σ por motivo = 3 =
    `indicadores.ajustes.total` com `janela_dias=1` = histórico `grupo=AJUSTE` do dia sem o material de cliente,
    que o histórico traz — 4 linhas) e pelo serviço igual à rota.
  - Controle positivo: 10 sabotagens, 9 vermelhas no cenário nomeado (nome do livro → [renomear]; sem sufixo →
    [desativado]; sem `ajustesWhereSql` → [RN-06 −] estorno; sem o dono → [RN-06 −] cliente; sem balde de inventário →
    [RN-06 +]; `<=`→`<` → [filtros]; ordem ASC → [renomear]; sem 400 → [400]; sem filtro de material → todos;
    agrupar texto livre pelo nome do cadastro → [RN-06 +]). **1 mutante equivalente:** trocar só o JOIN para casar
    também pelo nome não muda nada — os dois `CASE` decidem por `mv.motivo_id`; a sabotagem real precisou mexer nos
    três pontos.
  - **Divergência do texto do plano:** a `nota` é a literal do plano **mais** uma frase da paridade (Fase 2):
    "O total bate com o bloco Ajustes dos Indicadores e com o Histórico de movimentações (grupo AJUSTE) só no mesmo
    recorte: os Indicadores contam uma janela móvel até agora, e o Histórico mostra só as 500 linhas mais recentes e
    inclui materiais de clientes."

  Texto original: **T2 (galho, servidor) — chave `ajustes-por-motivo`.** Registro + `reports` em `extended.js` + função em
  `reportService.js` consumindo o fragmento da T1. Testes `relatorioAjustesPorMotivo.api.test.js`: RN-06 (os três
  baldes; renomear junta; texto igual ao nome não cai no motivo; desativado mostra o sufixo), RN-07 (paridade com
  `indicadores` e com `historico-movimentacoes?grupo=AJUSTE`), 400 literal de `material_id`, export XLSX com os
  cabeçalhos. Contagem do `relatoriosRegistro` → 24 nesta worktree.
- [x] **T3 (galho, servidor) — FEITA (2026-10-01), commit desta linha.** Estado real:
  - **"Conferido" medido (Fase 2, crítico 2) — os dois sinais sugeridos foram DESCARTADOS:**
    `conferencia_quantidade = 1` não serve porque a tela grava `recebida === esperada`
    (`RecebimentosAlmoxarifado.js`, `salvarConferencia`) — o item divergente fica 0, igual ao default, e o índice
    seria zero por construção; status ≥ `CONFERIDO_ALMOX` não serve porque `POST /recebimentos/:id/aprovar` leva
    `RECEBIDO` direto a `APROVADO` e `encaminhar_compras` aceita `RECEBIDO`. **Escolhido:** a auditoria
    `FINALIZAR_CONFERENCIA` do recebimento (`auditoria_log_almoxarifado`, `entidade='recebimento'`), que só o gesto
    "Finalizar Conferência" (`avancarWorkflow`) escreve e que existe desde o primeiro commit do módulo; mais
    `quantidade_recebida IS NOT NULL`. Limite declarado: `/conferir` com `status` no body (só API) não audita e
    não conta. Provado: criado e nunca conferido = 0; só "Salvar Conferência" = 0; `/aprovar` direto = 0;
    finalizado = conta, inclusive o divergente com `conferencia_quantidade = 0`.
  - Chave do fornecedor: CNPJ **sem pontuação** (ponto, barra, hífen, espaço; em maiúsculas — não "só dígitos",
    porque o CNPJ alfanumérico tem letras e o SQLite não tem regex), senão `fornecedor_id`, senão nome
    (trim + espaços duplos colapsados + lower ASCII), senão "Sem fornecedor". Nome exibido = o do recebimento mais
    recente (`MAX` sobre carimbo de largura fixa data+id, recortado). Funções `chaveFornecedorSql`/
    `cnpjNormalizadoSql` (internas).
  - Inspeções por subconsulta por item (RN-10); percentuais `ROUND(100.0*x/NULLIF(y,0),2)` no SQL; sem CTE.
  - Teste `relatorioQualidadeFornecedores.api.test.js` **16/16**. Contagem do registro **25** (`relatoriosRegistro`
    20/20, a varredura TEMP VIEW pega as 10 colunas).
  - Controle positivo: 14 sabotagens, **14 vermelhas** no cenário nomeado (qualquer auditoria / régua antiga
    `recebida IS NOT NULL` → [conferido] e [conferido −]; `conferencia_quantidade = 1` → [conferido] e [RN-08];
    id antes do CNPJ → [D8 CNPJ]; sem lower → [D8 nome]; nome do mais antigo → [D8 id]; JOIN item × inspeção →
    [RN-09 −] e [RN-10]; legada contando → [RN-09 −]; NC na rejeição → [RN-09 +] e [D7]; cliente dentro → [D9];
    0 em vez de null na divergência → [conferido]; 0 em vez de null na rejeição → [RN-08]; qualquer decidida
    reprovando → [RN-09 −]; `<=`→`<` → todos; sobra sem epsilon → [RN-08]).
  - **Divergências do texto do plano:** (1) a coluna `itens_conferidos` tem o rótulo
    **"Itens conferidos (conferência finalizada)"** (a coluna diz a régua); (2) a `nota` é a do plano reescrita pela
    Fase 2 — conferido = conferência finalizada, entrega parcial combinada conta como falta, chave pelo CNPJ, nome do
    recebimento mais recente, data inválida devolve vazio; (3) "CNPJ só dígitos" virou "CNPJ sem pontuação".
  - Fluxo do teste: `/aprovar` depois do `finalizar_conferencia` (o caminho de API que leva o crítico à quarentena
    sem os dados fiscais do `/processar`); duas linhas semeadas e declaradas (inspeção legada sem quantidade; segunda
    inspeção do mesmo item, M-4).
  - Fica para a letra D/E (não corrigido): o `|| qtd` do INSERT do item (`receiptService.js`, `criarRecebimento`)
    transforma `quantidade_recebida: 0` em `qtd` — contrato do recebimento.

  Texto original: **T3 (galho, servidor) — chave `qualidade-fornecedores`.** Registro + `reports` + função. Testes
  `relatorioQualidadeFornecedores.api.test.js`: RN-08, RN-09, RN-10 com as duas metades; agrupamento D8 (mesmo
  `fornecedor_id` com nomes diferentes = uma linha; só nome, com espaços e maiúsculas ASCII diferentes = uma linha; sem
  nada = "Sem fornecedor"); material de cliente fora; NC e devolução ao fornecedor executada não mudam o índice.
  Molde de fluxo: `recebimentoQuarentena.api.test.js` e `inspecaoIntegracao.api.test.js`. Contagem → 24 nesta worktree
  (o merge da Fase 4 fixa **25**).
- [ ] **T4 (galho, tela) — cartão "Requisições no prazo" no dashboard.** `AlmoxarifadoDashboard.js` (RN-12), contra o
  contrato do bloco. Teste RTL em `AlmoxarifadoDashboard.test.js`: 75 → "75%"; `null` → "—"; resposta sem o bloco → os
  três cartões de hoje e nenhum quarto; legenda com a janela.
- [x] **T5 (integração, cruza galhos) — FEITA (2026-10-01), commit desta linha.** Estado real:
  - `indicadoresSpec27Integracao.api.test.js` **8/8**, tudo pelas rotas HTTP (banco só para localização, material,
    fornecedor do cadastro, cliente e a config de inspeção de crítico). Cenários: (1) formato inválido na criação → 400
    literal sem gravar; A (prazo hoje), B e C (prazo há 2 dias), dois itens cada, entregues parcialmente → `em_aberto_no_dia`
    +1, `fora_do_prazo` +2, integrais parados; A e B completadas, C encerrada → `no_prazo` +1, `fora` +2, `integrais` +2,
    `encerradas_incompletas` +1, atendimento +2; excluir A → −1 em no prazo, integrais e atendimento (C89). (2) motivo do
    cadastro + texto livre com o nome do motivo + estorno de um + PERDA com motivo + ajuste de material de cliente →
    `indicadores.ajustes` (+2) = Σ `ajustes-por-motivo` (+2, um por balde) = histórico `grupo=AJUSTE` sem o de cliente,
    também nos totais absolutos do recorte (ontem..hoje / `janela_dias=1`). (3) recebimento de **pedido de compra**
    (`POST /api/compras/pedidos` real, fornecedor com CNPJ) → Finalizar Conferência 8/10 → `/aprovar` (crítico retido 8)
    → inspeção 5/3 → linha `[1,1,1,1,0,100,1,1,100]`; segundo recebimento por **NF avulsa** do mesmo CNPJ pontuado, sem
    `fornecedor_id`, outro nome, conferido sem divergência → **mesma linha**, nome do mais recente, `[2,2,1,1,50,1,1,100]`.
    (4) as duas chaves na lista como exportáveis e o XLSX com os rótulos do registro.
  - Divergências do texto original: o recebimento F veio de **pedido** e não de NF (o par pedido × NF avulsa é o que a
    chave pelo CNPJ existe para juntar — o fornecedor G "sem divergência" virou a NF avulsa do mesmo CNPJ); `/aprovar` no
    lugar do `/processar` (o caminho de API da T3 que retém o crítico); o cenário "pelo serviço" ficou nas T1/T2/T3 (já
    provado lá) e não foi repetido.
  - Controle positivo: 8 sabotagens, **8 vermelhas** no cenário certo — atendimento sem `ativo` → [1 C89]; `fornecedor_id`
    antes do CNPJ → [3 CNPJ]; `ajustesWhereSql` sem `cancelado = 0` → [2]; `exportavel: false` em
    `qualidade-fornecedores` → [4]; `ajustes-por-motivo` ligado ao histórico no mapa → [2]; `qualidade-fornecedores` com
    filtro trocado no mapa → [3 pedido], [3 CNPJ], [4]; criação sem `normalizarDataNecessidade` → [1 formato]; chave
    `ajustes-por-motivo` fora do mapa → a subida do app lança (par registro × mapa), o arquivo inteiro cai.
  - Nenhum defeito de produção encontrado. Suíte api **250/250**.

  Texto original: **T5 (integração, cruza galhos) — `server/tests/api/indicadoresSpec27Integracao.api.test.js`.** Pela rota, ponta
  a ponta: (1) linha de base do `indicadores`; (2) requisição com prazo hoje → aprovar → separar → entregar completa →
  `no_prazo` +1, `integrais` +1; (3) requisição com prazo há 2 dias, dois itens → entregar um → encerrar →
  `fora_do_prazo` +1, `encerradas_incompletas` +1; (4) excluir a de (2) → os dois voltam e `atendimento` também;
  (5) admin cadastra motivo M (AJUSTE_NEGATIVO) → AJUSTE_NEGATIVO pela v2 com `motivo_id` → `ajustes.total` +1, linha M
  com 1 em `ajustes-por-motivo`, 1 linha no histórico `grupo=AJUSTE&motivo_id=M` → estornar → os três voltam;
  (6) recebimento NF do fornecedor F com material crítico (esperada 10) → conferir 8 → processar (retém) → decidir
  inspeção 5/3 → `qualidade-fornecedores` linha F: 1 divergente com falta, 1 inspeção com reprovação, índice 100;
  fornecedor G conferido sem divergência → linha com 0 e índice vazio; (7) export XLSX das duas chaves; (8) a mesma
  linha F pelo **serviço** (`reportService` direto) igual à da rota. Controle positivo: contar NC na rejeição
  (sabotagem) → (6) vermelho.
- [ ] **T6 — verificação, Fase 5 e fechamento** (skill `fechar-etapa`): cinco suítes; spec 21 linhas 81 e 102 `[x]`
  com hash, e o "Tempo médio de recebimento" corrigido (regra 5 — surpresa 7); mapa; guia (Antes → Agora, roteiro
  clicável: Relatórios → Gestão → Qualidade por fornecedor; Movimentações → Ajustes por motivo; Indicadores; Dashboard);
  letras B272–B283, C89, D (67).

Ordem: T1 (tronco) → T2 e T3 em worktrees paralelas + T4 (tela, contrato congelado) → Fase 4 (merge; contagem 25) →
T5 → T6. T2 e T3 não dividem regra: T2 só consome o fragmento da T1; T3 não toca no livro.

## O que fica de fora (vira "falta" na spec 21, com o motivo)

- **Consumo previsto × realizado / consumo não previsto por projeto** — depende de BOM/OP (feature 22).
- **Tempo médio de recebimento** — candidato com `entrada_estoque_em` (surpresa 7), não está nos "Indicadores
  principais"; precisa medir se o claim que volta a `NULL` deixa o carimbo confiável.
- **Lista das requisições atrasadas dentro do relatório** — o alerta `REQUISICAO_ATRASADA` e a Central já listam; o
  indicador dá só o número.
- ~~**Validar o formato de `data_necessidade` na criação**~~ (feito na T1, `fd159b6` — a Fase 2 mudou a decisão) — mudança de contrato de entrada (a importação e a API
  aceitam texto hoje); por ora vai para `sem_data_valida`.
- **Índice de rejeição por quantidade** (por material, mesma unidade) — o índice desta etapa é por inspeção.
- **Status `REPROVADO` do recebimento por API** — aceito sem quantidade nem trava (`receiptService.js:821-826`).
  Registrar na letra C se a Fase 5 achar consumidor; aqui só fica fora do índice.

## Fase 2 — revisão do plano: 2 críticos, 4 importantes, 4 menores → plano revisto (vale sobre o texto acima)

- **CRÍTICO 1 — nenhuma tela grava `data_necessidade`** (`RequisicaoForm.js:232-243` e `RequisicaoMaterialCesta.js:157-168`
  não enviam; só a API preenche). O "% no prazo" nasceria "—" para sempre e o teste só passaria pela API. A Fase 0 mediu
  "sem validação" e não mediu "ninguém escreve". → **task nova T4b (galho, tela)**: campo opcional **"Data de
  necessidade"** (`<input type="date">`, envia `AAAA-MM-DD`) nas duas telas de criação; teste de payload. O servidor
  passa a **recusar formato inválido** na criação: 400 **`data_necessidade deve estar no formato AAAA-MM-DD`** (vazio/
  null = sem prazo; legado no banco continua lido por `date(...) IS NOT NULL`). D11 (cartão) fica.
- **CRÍTICO 2 — todo item de recebimento nasce "conferido"**: o INSERT grava `quantidade_recebida || qtd`
  (`receiptService.js:491`; sonda `sonda67-a.js`: NF avulsa nunca conferida = esperada 10 / recebida 10). A RN-08 contava
  item que ninguém contou e o cenário (−) era vazio. → **"conferido" = sinal explícito da conferência**: T3 mede qual
  existe (`conferencia_quantidade = 1` gravado pelo `/conferir`, ou o recebimento ter passado pelo `/conferir` — status
  ≥ CONFERIDO_ALMOX), escolhe o que só a conferência escreve e prova com teste (recebimento criado e nunca conferido =
  0 itens conferidos). A coluna e a `nota` dizem a régua escolhida. O `|| qtd` que transforma `quantidade_recebida: 0`
  em 10 é defeito à parte → letra D/E (não corrigido aqui: contrato do recebimento).
- **IMPORTANTE — fornecedor partido em duas linhas** (pedido grava `fornecedor_id`; NF avulsa só nome+CNPJ). → chave de
  agrupamento: **CNPJ só dígitos**, senão `fornecedor_id`, senão nome normalizado; nome exibido = o do recebimento mais
  recente do grupo; a `nota` diz isso.
- **IMPORTANTE — entrega parcial combinada conta como divergência** (esperada = saldo da linha do pedido) → mesma régua do
  alerta de divergência; **declarada na `nota`** e na letra D (não muda a régua).
- **IMPORTANTE — RN-04 sem prova nos blocos novos** (`excluirRequisicao` também põe CANCELADO, já excluído) → o teste
  semeia linha `ativo = 0` com status **vivo** (ENTREGUE/PARCIAL) para provar o filtro; sabotagem tirando o `ativo` de
  cada bloco novo tem de derrubar.
- **IMPORTANTE — varredura e réguas de janela**: proibido CTE (`WITH`) nas consultas novas (a varredura só captura
  `SELECT`); a paridade da RN-07 declara as condições (mesmo dia, < 500 linhas, sem material de cliente) — as réguas do
  `indicadores` (janela móvel) e do histórico (`DATE()`, `LIMIT 500`) diferem e isso vai na `nota`.
- Menores: **M-1 corrigido na T1** — `todosItensCompletos` compara sem epsilon (`requisitionService.js:83`; dez entregas
  de 0,1 nunca completam e a requisição fica PARCIAL/"encerrada incompleta") → `entregue >= solicitada - 1e-9`, com teste;
  M-2: recebimento só de material de cliente não conta (o fornecedor sem nada elegível não aparece); M-3: datas
  inválidas → vazio (como o histórico), declarado; M-4: RN-10 semeada à mão (não há caminho real que retenha duas
  vezes) — declarado no teste.

## Fase 5 — revisão adversarial: fix-round (2026-10-01)

A revisão (sondas `sonda67r-*.js` no scratchpad) achou 7 mutantes sobreviventes no `reportService.js` e dois menores.
Tudo corrigido em três commits; cinco suítes do servidor verdes depois (`test:api` 250/250 arquivos,
`test:almoxarifado` 42/0, `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 5/0). Client não roda: nenhuma tela
nem teste fixa as colunas da qualidade (a tela de relatórios projeta pelas `colunas` do registro).

- [x] **A — testes que matam os 7 mutantes** (`d7f22f8`). Cenários novos: entregue no dia **seguinte** ao prazo = fora;
  RASCUNHO e REJEITADA com prazo vencido, pela rota, fora de tudo; sem prazo criada há 60 dias fora de
  `sem_data_valida`; entregue há 60 dias fora dos integrais; ajuste de 60 dias atrás fora do bloco `ajustes` (no RN-07,
  com controle de que sem período ele aparece); CNPJ alfanumérico minúsculo × maiúsculo = uma linha. `created_at` /
  `data_entrega` semeados por UPDATE, declarado no teste. Sabotagem por `perl -0pi` (âncora == 1, restauro por cópia com
  md5): cada um dos 7 mutantes derruba a asserção nova certa (A1 `x.de <= date(x.dn,'+1 day')`, A2 sem RASCUNHO, A3 sem
  REJEITADO, A4 sem janela no `sem_data_valida`, A5 sem janela nos integrais, A6 sem janela no bloco ajustes, A7 sem
  UPPER na chave do CNPJ).
- [x] **B — reserva zumbi do fracionado** (`f8a8980`). O epsilon da T1 fechava a requisição, mas a reserva ficava ATIVA
  com `quantidade_utilizada` 0,9999999999999999 e o material com `quantidade_reservada` 1,38e-16. Corrigido com EPS 1e-9
  nos três pontos da mesma conta em `stockService.js`: fechamento da reserva no consumo (a sobra sai do reservado do
  material; `RESERVADA_MENOS_SQL` zera o que fica <= EPS), claim do consumo com reserva (0,3 em três saídas de 0,1
  recusava a terceira) e `liberarReserva` (liberar 0,3 de saldo 0,30000000000000004 virava parcial). Liberar acima do
  saldo continua 400. Seis sabotagens (B1–B6) derrubam a asserção certa. Os `> 0` de `reservationService` só escolhem
  entre `liberarReserva` e fechar sem saldo — inofensivos, não mexidos.
- [x] **C — coluna "Agrupado por"** (`6da0048`). `agrupado_por` sai do SQL ao lado de Fornecedor: `CNPJ <como veio no
  recebimento mais recente>` / `Cadastro #<id>` / `Nome digitado` / `Sem CNPJ, cadastro ou nome`. Nota ganhou: *"A coluna
  Agrupado por mostra o que juntou a linha: "CNPJ" seguido do CNPJ como veio no recebimento mais recente, "Cadastro #"
  seguido do número do fornecedor no cadastro, ou "Nome digitado". O mesmo fornecedor pode aparecer em mais de uma linha
  quando os recebimentos não trazem o mesmo CNPJ (por exemplo, uma nota com CNPJ e outra só com o nome)."* Seis
  sabotagens (C1–C6). Descartado: juntar por nome (fornecedores homônimos se misturariam) e mostrar o CNPJ normalizado.

**Próximo passo:** T6 (fechamento pela skill `fechar-etapa`) — registrar B/C acima no documento de novidades e no guia
(coluna nova da qualidade; reserva do fracionado agora fecha).
