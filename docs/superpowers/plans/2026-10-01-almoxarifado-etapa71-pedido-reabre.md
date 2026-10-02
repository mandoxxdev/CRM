# Etapa 71 — o pedido de compra que reabre quando a entrada é estornada (feature 08, B161)

> Status: **PLANO (Fases 0 e 1 feitas, 2026-10-01). Nada executado.** Próximo passo: Fase 2 (revisão do plano por agente
> fresco), depois T0 → T1 → T2 (tronco), T3 (galho) em paralelo à T2, T4 (integração), T5 (fechamento).
> Feature 08 (recebimento), item (4) da lista "o que falta para 🟢" (`specs/modulo-almoxarifado/08-recebimento/README.md:3`):
> *"o pedido que reabre — estornar a movimentação de entrada de um pedido já fechado não reverte `quantidade_recebida` nem
> o status, e o estado não deixa sinal (`B161`)"*. Próxima tarefa detalhada de origem:
> `docs/superpowers/plans/2026-10-01-almoxarifado-etapa70-email-entrada-confirmada.md:630-669`. Decisão revogada (em
> parte): **B161** (`docs/almoxarifado-novidades-por-etapa.md:3435-3452`) e a RN-E03 da Etapa 42.

**Escopo desta etapa:** quando uma `ENTRADA_COMPRA` que veio de uma nota contra pedido é **estornada** (Almoxarifado →
Movimentações → Estornar, ou qualquer chamada de `cancelarMovimentacao`), a linha do pedido **desconta** o que tinha
somado, e o pedido que estava *Recebido* porque a conta fechava **volta ao status de antes do fechamento** quando a conta
deixa de fechar — com trilha. O pedido reaberto volta aos quatro sinais (pendentes do Recebimento, linhas oferecidas na
nova nota, atrasados, alerta de parcial) e a próxima nota **espera o que falta** sem pedir autorização de excedente.
**De quebra (T0, defeito anterior medido nesta Fase 0):** o fechamento automático e o filtro `?pendentes=1` passam a usar
a mesma régua por material que a leitura já usa. **Fora:** devolução ao fornecedor e sucata do reprovado (não reabrem),
conta a pagar, solicitação de compra, correção do aviso da 70 — ver "O que fica de fora".

## Fase 0 — medido (2026-10-01)

Réguas testadas contra o que existe antes de medir ausência: `grep -n "recebimento_item_id\|recebimento_id"
services/almoxarifado/stockService.js` → acha `recebimento_id` (`:961`, `:2024`, `:2033` — a régua vê a coluna que existe)
e **0** `recebimento_item_id`; `pragma_table_info('recebimentos_material_itens_almoxarifado') WHERE name LIKE '%mov%'` →
`[]` (sonda; a mesma consulta com `'%receb%'` no livro acha `recebimento_id`). `grep -rn "cancelarRecebimento\|estornar"
services/almoxarifado/receiptService.js` → **0**; `grep -n "recebimentos" routes/almoxarifado/extended.js` lista as 13
rotas do recebimento (`:1009-1354`) — nenhuma de estorno/cancelamento. Identificadores de contrato, sem acento.

### 1. O acumulador do pedido e o caminho movimentação → linha do pedido

| Onde | O que faz |
|---|---|
| `receiptService.js:1352-1395` | `registrarMovimentacao(... tipo: 'ENTRADA_COMPRA', recebimento_id, material_id, quantidade: qtd ...)` — **o retorno (`{ id }`) é descartado**; o livro não recebe o id do item |
| `receiptService.js:1396` | `entrouFisicamente = true` |
| `receiptService.js:1471-1481` | `UPDATE itens_pedido_compra SET quantidade_recebida = COALESCE(quantidade_recebida, 0) + ? WHERE id = ?` com `qtd` e `item.pedido_item_id` — dentro do claim `entrada_estoque_em`, não-fatal. **Único escritor** da coluna |
| `schema.js:1678-1720` (`recebItemCols`) | o item tem `pedido_item_id` (`:1713-1718`), `localizacao_entrada_id`, `lote_id`, `entrada_estoque_em` — **nenhuma coluna aponta para a movimentação** |
| `movimentacoes_almoxarifado` | só `recebimento_id` (+ `material_id`); nada do item |

**Caminho possível hoje:** movimentação → (`recebimento_id`, `material_id`) → item → `pedido_item_id`. **Ambíguo** quando a
nota tem dois itens do mesmo material (duas linhas do pedido do mesmo material — caso legítimo, Etapa 37): sonda C abaixo
gera **duas** `ENTRADA_COMPRA` (3 e 5) do mesmo material no mesmo recebimento. É o mesmo problema que a Etapa 57 resolveu
para o endereço gravando `localizacao_entrada_id` no item (`receiptService.js:1397-1406`), e o mesmo recorte "par único"
que o backfill de `quantidade_em_inspecao` usa (`schema.js:593-596`). → **T1 grava `movimentacao_entrada_id` no item.**

**A v2 não forja o vínculo:** `MovimentacaoSchema` é `z.object` sem `recebimento_id` (`schemas.js:85-140`), e a v1 só
aceita `ENTRADA/SAIDA/AJUSTE/DEVOLUCAO` (`routes/almoxarifado.js:987`). Sonda D: `POST /movimentacoes/v2` com
`tipo: 'ENTRADA_COMPRA', recebimento_id: 1` → 201 e grava `recebimento_id = NULL`. Logo `ENTRADA_COMPRA` com
`recebimento_id` só nasce em `darEntradaEstoque` (único `tipo: 'ENTRADA_COMPRA'` do código, `receiptService.js:1354`).

### 2. O estorno

| Onde | O que faz |
|---|---|
| `routes/almoxarifado/extended.js:847-852` | `POST /api/almoxarifado/movimentacoes/:id/cancelar`, `requirePermission('ajustar_estoque')`, `CancelamentoSchema` (motivo obrigatório) |
| `stockService.js:2193-2726` `cancelarMovimentacao` | recusas por tipo (`:2194-2281`: ESTORNO, RESERVA, inspeção, `DEVOLUCAO_FORNECEDOR`, SUCATA do reprovado, liberação por NC, remessa, `requisicao_id`); guarda de série; **claim** `UPDATE ... SET cancelado = 1 ... WHERE id = ? AND cancelado = 0` (`:2373-2376`, segundo estorno → 400 *"Movimentação já cancelada"*); ramo de entrada = saída com guarda de disponível (`:2411-2417`); auditoria `CANCELAMENTO` (`:2703-2707`); alerta (`:2709-2713`); supressão do `MOVIMENTACAO` pendente (`:2720-2724`); retorno `{ success: true, estorno_id }` (`:2726`) |
| outros chamadores | `scrapService.js:143,149`, `thirdPartyService.js:760,768` — estornam as **próprias** movimentações (nenhuma é `ENTRADA_COMPRA`) |

**`ENTRADA_COMPRA` de nota é estornável pelo livro** — não há recusa por tipo nem por `recebimento_id`. O estorno **não
toca** item do recebimento, status do recebimento, pedido, solicitação nem conta a pagar. **Não existe estorno do
recebimento inteiro** (nem rota, nem status `CANCELADO` — `receiptService.js:276`). O gesto real é o estorno de **cada**
`ENTRADA_COMPRA` (uma por item que entrou).

### 3. O fechamento, a derivação e o status manual

| Onde | O que faz |
|---|---|
| `receiptService.js:1776-1785` `situacaoRecebimentoPedido` | `RECEBIDO` se `pedida > 0 && saldo <= 0`; `ABERTO` se `recebida ≈ 0`; senão `PARCIAL` |
| `receiptService.js:1824-1851` `derivarRecebimentoDoPedido(pedida, recebida, saldoPorMaterial?)` | o 3º argumento é a correção do excedente cruzado (Etapa 42): com ele, o excesso de um material não paga a falta de outro |
| `receiptService.js:1879-1888` `SOMA_POR_PEDIDO_SQL` | devolve `total_pedido`, `soma_recebida` **e** `saldo_por_material` |
| `receiptService.js:2012-2073` `fecharPedidosCompletos` | `SELECT total_pedido, soma_recebida` (**sem** `saldo_por_material`, `:2037`) → `derivarRecebimentoDoPedido(total, soma)` com **2 argumentos** (`:2038-2039`) → `UPDATE pedidos_compra SET status = 'recebido' WHERE ... NOT IN ('recebido','cancelado','rejeitado')` → auditoria `STATUS_AUTOMATICO_RECEBIDO` com `dados_anteriores: { status }` (`:2059-2069`). **Só sobe** (decisão 4, `:1989-1994`) |
| `pedidoCompraService.js:449-455` `alterarStatusPedido` + `routes/compras.js:256-264` `PATCH /api/compras/pedidos/:id/status` | a porta manual: grava UMA coluna, **sem auditoria**, aceita qualquer dos 7 status (`schemas.js:60`: `pendente, aprovado, rejeitado, em_analise, enviado, recebido, cancelado`) |

**Status manual × automático:** a porta manual **não deixa rastro**, então "quem escreveu o *recebido*" só é conhecido
quando foi o automático (trilha `STATUS_AUTOMATICO_RECEBIDO`). Uma regra "reabre só se o automático fechou" não é
implementável com confiança (o comprador pode ter reescrito depois sem rastro). Regra que é: **reabre se a conta fechava
antes do estorno e deixou de fechar por ele** — o comprador que marcou *Recebido* de propósito com saldo aberto tinha a
conta **já aberta** antes, e não é tocado (é o cenário (8) de `comprasPedidoStatusAutomatico.api.test.js:492-506`, que
continua valendo).

### 4. Os sinais — o que cada um lê (a pergunta do handoff: "só subtrair" basta?)

| Sinal | Lê | Volta só com a subtração? |
|---|---|---|
| `GET /recebimentos-aux/pedidos-compra?pendentes=1` (`receiptService.js:1918-1927`) | a **soma** (derivação), nunca o status | **sim** |
| `GET /recebimentos-aux/pedidos-compra/:id/itens` (`:2166-2210`) | o saldo **da linha** | **sim** |
| barreira do `POST /recebimentos` (`assertSaldoDoPedidoPermitido`, `:813-843`, via `saldoDasLinhasDoPedido` `:739-751`) | o acumulador da linha | **sim** |
| `GET /api/compras/pedidos?atrasados=1` (`routes/compras.js:142-144`) e alerta `PEDIDO_COMPRA_ATRASADO` (`alertRegistry.js:745-782`) | só o **status** (`derivarAtraso`, `pedidoCompraService.js:748-761`, exclui `recebido`) | **não** |
| alerta `PEDIDO_COMPRA_PARCIAL` (`alertRegistry.js:850-856`) | derivação `PARCIAL` **e** status fora de `['cancelado','rejeitado','recebido']` (`:390`) | **não** |

**Conclusão:** "só subtrair" devolve 3 dos 5 sinais; os atrasados e o parcial exigem o status reaberto. A escolha do
handoff fica decidida pela medição: **subtrair e reabrir**.

### 5. Os vizinhos que a B161 citou

- **Devolução ao fornecedor (Etapa 45):** não toca pedido (`nonConformityService.js:1591`, nenhum `itens_pedido_compra`),
  é **recusada** no estorno pelo livro (`stockService.js:2235-2239`) e o teste `devolucaoFornecedorIntegracao.api.test.js:221-231`
  **prende** que ela não baixa `quantidade_recebida`. A reposição da devolução é decisão `SUBSTITUICAO` da NC, que
  registra intenção e não move nada (`nonConformityService.js:1303-1305`).
- **Sucata do reprovado (69):** idem (recusada no livro, `stockService.js:2273-2282`).
- **Solicitação de compra:** `fecharSolicitacoesDoPedido` (`purchaseService.js:113-126`) fecha **todas** as `VINCULADO`
  do pedido como `RECEBIDA` **na primeira nota**, parcial ou não. `RECEBIDA` é terminal (`:46`).
- **Conta a pagar:** `gerarContaPagar` (`receiptService.js:1527-1550`) insere uma por nota; o estorno não a toca. A tabela
  `contas_pagar` **não existe no harness** (sonda: `no such table`; `gerarContaPagar` devolve `null`).
- **O aviso da 70:** `suprimirNotificacaoMovimentacao` (`notificationQueueService.js:415-421`) só alcança o
  `MOVIMENTACAO` daquela movimentação; `RECEBIMENTO_ENTRADA*` não é tocado (D7/B322 da 70, contrato que não se reabre).
- **Requisição:** nem a entrada nem o estorno mudam o status dela (Fase 0 da 70, §4).

### Sondas executadas (scratchpad, harness real, pelas rotas)

`sonda71-estorno-pedido.js` — pedido de 10 `enviado` com previsão vencida, solicitação `VINCULADO`:
```
[A antes]              status=enviado  linha recebida=0  ABERTO/10   ?pendentes=true  ?atrasados=true  sol=VINCULADO
A processar: 200 PROCESSADO
[A depois de processar] status=recebido linha=10          RECEBIDO/0  ?pendentes=false ?atrasados=false itensAux=[] sol=RECEBIDA
A estorno: 200 {"success":true,"estorno_id":2}
[A depois do estorno]  status=recebido linha=10          RECEBIDO/0  ?pendentes=false ?atrasados=false itensAux=[]   (saldo do material = 0)
A recebimento: PROCESSADO, item com entrada_estoque_em e recebida 10; trilha do pedido: [STATUS_AUTOMATICO_RECEBIDO]
A novo recebimento dos 10 que faltam: 400 "Quantidade recebida (10) maior que o saldo do pedido (0) para o material S71-1
  — a autorização de excedente é de Compras ou do Administrador"
A segundo estorno: 400 "Movimentação já cancelada"
B material crítico retido (atual 4, em_inspecao 4): estorno -> 400 "Não é possível estornar: saldo disponível insuficiente
  (material já consumido)"
C mesmo material em 2 itens/2 linhas: 2 ENTRADA_COMPRA (3 e 5) no mesmo recebimento
D ENTRADA_COMPRA manual pela v2 com recebimento_id no body: 201, gravou recebimento_id = null
```
`sonda71b-cruzado.js` — pedido A(10)+B(10), nota de 25 de A com excedente autorizado, 0 de B:
```
processar 200 -> status=recebido  situacao=PARCIAL saldo=10  ?pendentes=false  itensAux=[["S71B-B",10]]
```

### Surpresas da medição

1. **A B161 subestimou o estrago: não é só "sem sinal" — a próxima nota é RECUSADA.** Depois do estorno, a linha diz que
   os 10 chegaram; o `POST` do recebimento dos 10 que faltam toma 400 *"maior que o saldo do pedido (0)"* e só passa com
   autorização de excedente de Compras/Admin — que grava trilha de **excedente** sobre um material que nunca entrou duas
   vezes. A recuperação que a B161 ensina (lápis → *Status*) **não resolve isto**: o status volta, o acumulador não, e
   não há porta de tela que corrija o acumulador (só SQL). A letra B dizia *"se o número do recebido estiver errado, ele
   se corrige por consulta"* — **estava errado**: a consulta só lê o acumulador. Corrigir a B161 no fechamento dizendo isso.
2. **Defeito ANTERIOR (Etapa 42), não deste tema mas da mesma régua — o excedente cruzado fecha o pedido.** A correção da
   revisão adversarial da 42 pôs o 3º argumento em `derivarRecebimentoDoPedido` e o `saldo_por_material` em
   `SOMA_POR_PEDIDO_SQL`, mas **o próprio fechamento não o usa** (`:2037-2039`, 2 argumentos) e o `?pendentes=1` também
   não (`:1926`, `soma_recebida < total_pedido` por pedido). Medido (sonda 71b): status `recebido`, situação `PARCIAL`
   saldo 10, fora de `?pendentes=1`, fora do alerta de parcial (status decidido), e a tela de itens oferecendo os 10 de B.
   O comentário de `comprasPedidoSituacaoFonte.api.test.js:150-157` e de `receiptService.js:1832-1839` afirma que o
   pedido "saía de `?pendentes=1`" e que isso foi corrigido — **só a leitura foi**; o teste (1c) monta o estado por
   `UPDATE` e lê só `situacaoDosPedidosCompra`. Entra nesta etapa (T0) porque a reabertura decide "fechava antes / não
   fecha depois" — com duas réguas, o estorno reabriria (ou não) por um critério diferente do que fechou.
3. **Material crítico retido não é estornável** enquanto está em inspeção (sonda B) — o motor exige disponível, e o retido
   não é disponível. Correto (a porta é a inspeção), mas a literal diz *"material já consumido"* — falso para quem lê.
   Motor e literais são contrato que não se reabre nesta etapa → letra **C** nova (C108), não corrigida.
4. **A solicitação de compra fecha na PRIMEIRA nota, parcial ou não** (`purchaseService.js:115-118`) — não é o
   fechamento do pedido. Reabrir a solicitação no estorno não teria critério (ela já estava `RECEBIDA` com o pedido
   parcial). Fora, com motivo (D6).
5. **O e-mail do atrasado/parcial pode não repetir** depois da reabertura: o dedupe de `pedido-atrasado-<id>-<previsao>`
   (`alertRegistry.js:804`) e de `pedido-parcial-<id>-<saldo*1000>` (`:874`) já pode ter sido gasto antes do
   fechamento. O **cartão** da central volta (lista ao vivo); o e-mail só sai se a previsão ou o saldo forem novos.
   Contrato da 19 — declarado (D7), não mexido.

## Decisões reversíveis (letra B do documento de novidades; última usada: B328)

- **D1 (B329) — o estorno da `ENTRADA_COMPRA` de nota contra pedido DESCONTA a linha do pedido.** Revoga a metade "o
  acumulador só soma" da B161 e a decisão 4 do cabeçalho de `fecharPedidosCompletos`. O desconto é `mov.quantidade` (o
  mesmo número que a entrada somou — `qtd` em `:1474` é a quantidade da movimentação), com piso em 0. Descartados:
  (a) **só reabrir o status** (a nota seguinte continuaria recusada — Surpresa 1); (b) **porta manual para editar o
  acumulador** (mais um gesto que alguém tem de lembrar, e o estado errado continua silencioso até lá); (c) **recalcular
  o acumulador a partir do livro** (soma das `ENTRADA_COMPRA` não canceladas por item) — elegante, mas o item não sabe
  qual movimentação é sua (Fase 0 §1) e linhas anteriores à Etapa 37 não têm `pedido_item_id`.
- **D2 (B330) — o status reabre quando a conta fechava ANTES do estorno e deixou de fechar DEPOIS, e só se o status atual
  é `recebido`.** Volta para o status **anterior ao fechamento automático** (o `dados_anteriores.status` da última trilha
  `STATUS_AUTOMATICO_RECEBIDO` do pedido, se for um de `pendente`/`aprovado`/`em_analise`/`enviado`); sem essa trilha (o
  comprador fechou à mão com a conta fechando), volta para `pendente`. Guarda atômica no `WHERE ... = 'recebido'`.
  Descartados: (a) **reabrir sempre para `pendente`** (o pedido `enviado` com previsão vencida voltaria como se não tivesse
  sido enviado); (b) **reabrir só o que o automático fechou** (a porta manual não audita — Fase 0 §3 —, então a regra
  dependeria de um rastro que não existe); (c) **reabrir sempre que a conta não fecha** (atropelaria o comprador que
  fechou de propósito com saldo aberto — cenário (8) da Etapa 42).
- **D3 (B331) — `cancelado`/`rejeitado` não são reabertos** (a linha desconta, o status fica). Mesmo motivo da B162:
  a decisão do comprador não é desfeita por ato de outro módulo.
- **D4 (B332) — o vínculo item ↔ movimentação nasce agora (`movimentacao_entrada_id` no item), e o passado se resolve na
  hora do estorno pelo par (`recebimento_id`, `material_id`).** Fallback: itens daquele par com `entrada_estoque_em` e
  `movimentacao_entrada_id IS NULL`; um só → ele; vários → os de quantidade igual à da movimentação, o de menor `id`;
  nenhum → aviso no log e o pedido não é tocado. O item escolhido **adota** o vínculo (`UPDATE ... WHERE
  movimentacao_entrada_id IS NULL`), para o estorno da outra movimentação do mesmo par não cair no mesmo item.
  Descartados: (a) coluna `recebimento_item_id` no **livro** (mexe no motor e no INSERT de `registrarMovimentacao`, que
  recebe parâmetros de dezenas de portas); (b) migração de backfill com ledger (o par ambíguo continuaria ambíguo, e a
  produção tem poucos recebimentos — a letra A35 mede).
- **D5 (B333) — o gancho mora no MOTOR (`cancelarMovimentacao`), depois da auditoria do cancelamento, não-fatal,
  `require` lazy.** Mesmo motivo do gancho de notificação (`stockService.js:2162-2181`): o estorno entra por mais de uma
  porta. Lazy porque `receiptService.js:25` requer o motor no topo. A resposta ganha a chave `pedido_compra` **só quando
  um pedido foi tocado** (aditivo; nenhuma resposta existente muda). Descartados: na rota (`extended.js:849`) — o
  serviço chamado direto ficaria sem; fatal — um estorno de saldo legítimo não pode falhar porque a tabela do Compras
  falhou (o mesmo raciocínio do acumulador, `:1460-1470`).
- **D6 (B334) — o que o estorno NÃO desfaz:** o recebimento continua `PROCESSADO`/`APROVADO` e o item mantém
  `entrada_estoque_em` (é histórico: a nota existiu e entrou; o estorno é outro fato, no livro); a **conta a pagar** fica
  (a obrigação fiscal é da NF, não do estoque — cancelar NF é gesto do Financeiro); a **solicitação de compra** fica
  `RECEBIDA` (Surpresa 4); a **requisição** e o **aviso da 70** ficam como estão (D7/B322 da 70). Descartado: estorno do
  recebimento inteiro como documento (rota nova, status novo, reverteria conta a pagar e etiquetas — etapa própria, e
  ninguém pediu).
- **D7 (B335) — os e-mails do atrasado/parcial seguem o dedupe da 19** (Surpresa 5): a reabertura não força e-mail novo;
  o cartão da central volta na hora. Descartado: chave de dedupe com a data da reabertura (mudaria o contrato das 13
  entradas do registro).
- **D8 (B336) — devolução ao fornecedor e sucata do reprovado NÃO reabrem o pedido.** O material entrou de verdade e saiu
  por decisão de qualidade; se o fornecedor repõe ou não é decisão comercial (`SUBSTITUICAO` × `DEVOLVER` da NC), não
  dedução do sistema. O teste da 45 que prende isso continua valendo. Recuperação, se Compras quiser cobrar a reposição:
  lápis → *Status* (o acumulador fica certo: o material **entrou**). Descartado: reabrir na execução da devolução (o
  pedido de quem decidiu "devolver sem repor" voltaria aos atrasados para sempre).
- **D9 (B337) — T0 entra nesta etapa (o excedente cruzado no fechamento e no `?pendentes=1`).** Uma régua só para "completo":
  `derivarRecebimentoDoPedido(total, soma, saldo_por_material)` no fechamento e `saldo_por_material > 1e-9` no filtro.
  Descartado: deixar para depois — a reabertura (D2) compararia "antes/depois" com uma régua e o fechamento usaria outra.
- **D10 (B338) — a feature 08 vai a 🟢 no fechamento desta etapa, com a conferência física estruturada declarada como
  CORTE** (fora por decisão do design desde a Etapa 5: contagem/pesagem/medição/checklist por tipo de material é processo
  de chão de fábrica que o cliente não especificou além da spec 8.2, e a conferência de quantidade + NC numerada da 43
  cobrem o que o sistema decide). Descartado: manter 🟡 por um item que nenhuma etapa vai pagar sem especificação nova —
  o 🟡 passaria a significar "nunca". Reversível: o selo é uma linha no mapa.

## Regras de negócio

- **RN-01 (o estorno desconta a linha)** — estornar uma `ENTRADA_COMPRA` com `recebimento_id` cujo item tem
  `pedido_item_id` subtrai `mov.quantidade` de `itens_pedido_compra.quantidade_recebida` daquela linha (piso 0) e grava
  trilha `RECEBIDO_ESTORNADO` no pedido. *Cenário:* pedido de 10 recebido 6 → estorno → linha 0, `?pendentes=1` inclui o
  pedido, a rota de itens oferece 10; **e** (metade negativa) estornar uma `ENTRADA_COMPRA` manual (v2, sem recebimento)
  e uma `ENTRADA_COMPRA` de nota **sem pedido** (`tipo_recebimento: 'NOTA_FISCAL'`) não muda nenhuma linha de pedido
  nem grava trilha de pedido.
- **RN-02 (reabre o que a conta tinha fechado)** — se o pedido estava `recebido` e a situação derivada era `RECEBIDO`
  antes do desconto e deixou de ser depois, o status volta ao anterior ao fechamento automático (D2), com trilha
  `STATUS_AUTOMATICO_REABERTO`. *Cenário:* pedido `enviado` com previsão vencida → nota de 10 → `recebido` (fora de
  `?atrasados=1`) → estorno → `enviado`, **dentro** de `?atrasados=1` e do cartão `PEDIDO_COMPRA_ATRASADO`; **e** pedido
  fechado à mão (`PATCH` → `recebido`) com a conta fechando → estorno → `pendente` (sem trilha anterior).
- **RN-03 (não atropela o comprador)** — status `cancelado`/`rejeitado` não muda (a linha desconta); status `recebido`
  com a conta **já aberta** antes do estorno não muda. *Cenário:* pedido cancelado com nota processada → estorno →
  continua `cancelado`, linha descontada; pedido de 20 marcado `recebido` à mão, nota de 5, estorno → continua
  `recebido`, linha 0.
- **RN-04 (parcial e total)** — pedido de 10 recebido em duas notas (6 + 4) e fechado: estornar a de 4 → status
  reaberto, situação `PARCIAL` saldo 4, no cartão `PEDIDO_COMPRA_PARCIAL`; estornar também a de 6 → `ABERTO` saldo 10 (fora
  do parcial, dentro de `?pendentes=1`), **sem** segunda trilha de reabertura (o status já não é `recebido`).
- **RN-05 (uma vez só)** — o desconto acontece uma vez por movimentação: segundo estorno → 400 *"Movimentação já
  cancelada"* e a linha não muda; `Promise.all` de dois estornos da mesma movimentação → um 200 e um 400, linha
  descontada uma vez, uma trilha `RECEBIDO_ESTORNADO`.
- **RN-06 (a linha certa)** — com dois itens do mesmo material na nota (linhas 3 e 5 do mesmo pedido), estornar a
  movimentação do item da linha 5 desconta a linha 5 e não a 3. *Cenário pelo vínculo* (`movimentacao_entrada_id`) **e**
  *pelo fallback* (vínculo apagado à mão: quantidades diferentes escolhem pela quantidade; iguais, o de menor id, e o
  segundo estorno cai no outro item porque o primeiro adotou o vínculo).
- **RN-07 (best-effort)** — falha no desconto/reabertura não derruba o estorno: 200, saldo do material revertido,
  `console.warn` com a literal do contrato. *Cenário:* trigger `RAISE(ABORT)` no `UPDATE` de `itens_pedido_compra` →
  `/cancelar` 200, `quantidade_atual` revertida, linha intacta, aviso no log.
- **RN-08 (estorno recusado não toca pedido)** — material retido em inspeção (sonda B) → 400 do motor, linha e status
  intactos.
- **RN-09 (uma régua para "completo" — T0, defeito anterior)** — pedido A(10)+B(10) com nota de 25 de A (excedente
  autorizado) e 0 de B **não** fecha, e aparece em `?pendentes=1`; **e** (metade positiva) chegando os 10 de B, fecha.
- **RN-10 (a próxima nota espera o que falta)** — depois do estorno, a nota com a quantidade estornada passa no `POST`
  **sem** `autorizar_excedente`, e processada fecha o pedido de novo (segunda trilha `STATUS_AUTOMATICO_RECEBIDO`).

## Contrato (congelado)

### Schema (`schema.js`, `recebItemCols`, `safeAlter`, sem ledger — como `localizacao_entrada_id`)

`recebimentos_material_itens_almoxarifado.movimentacao_entrada_id INTEGER` — a `ENTRADA_COMPRA` que este item gerou.
INTEGER solto, sem FK (padrão do módulo).

### Escrita em `darEntradaEstoque` (`receiptService.js`)

`const movEntrada = await registrarMovimentacao(...)` (`:1352`); logo depois de `entrouFisicamente = true` (`:1396`), em
`try/catch` próprio, não-fatal (mesmo motivo do `localizacao_entrada_id`, `:1397-1406`):
`UPDATE recebimentos_material_itens_almoxarifado SET movimentacao_entrada_id = ? WHERE id = ?` com `movEntrada.id`.
Literal do warn: `[recebimento] falha ao gravar movimentacao_entrada_id: <mensagem>`.

### Régua única do "completo" (T0)

- `fecharPedidosCompletos` (`:2036-2039`): `SELECT total_pedido, soma_recebida, saldo_por_material` e
  `derivarRecebimentoDoPedido(soma?.total_pedido, soma?.soma_recebida, soma?.saldo_por_material)`.
- `listarPedidosCompraAux` `?pendentes=1` (`:1924-1926`): a cláusula vira
  `AND (i.total_pedido IS NULL OR i.total_pedido = 0 OR i.soma_recebida IS NULL OR i.soma_recebida = 0 OR i.saldo_por_material > 1e-9)`
  (`1e-9` = `EPSILON_DIVERGENCIA`, interpolado da constante, não reescrito).

### Serviço novo em `receiptService.js` (exportado)

```
estornarEntradaNoPedido(db, user, mov)
  -> null      // não é ENTRADA_COMPRA com recebimento_id; sem tabela pedidos_compra; item não resolvido;
               // item sem pedido_item_id; linha do pedido apagada
   | { id, numero, pedido_item_id, quantidade_estornada,
       situacao_antes, situacao_depois,          // 'ABERTO' | 'PARCIAL' | 'RECEBIDO'
       saldo_pendente,                            // depois, da régua (por material)
       status_anterior, status,                   // status do pedido antes/depois
       reaberto }                                 // boolean
```
Passos: (1) resolve o item (D4, com adoção); (2) situação **antes** pela régua única
(`SOMA_POR_PEDIDO_SQL` recortada + `derivarRecebimentoDoPedido` com 3 argumentos); (3)
`UPDATE itens_pedido_compra SET quantidade_recebida = MAX(0, COALESCE(quantidade_recebida, 0) - ?) WHERE id = ?`;
(4) trilha `RECEBIDO_ESTORNADO`; (5) situação **depois**; (6) se `antes === 'RECEBIDO' && depois !== 'RECEBIDO'`:
`UPDATE pedidos_compra SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND LOWER(COALESCE(status, '')) = 'recebido'`
com o destino do D2; `changes === 1` → trilha `STATUS_AUTOMATICO_REABERTO`.

Trilhas (`entidade: 'pedido_compra'`, `entidade_id: <pedido>`):

| acao | dados_anteriores | dados_novos | justificativa (literal) | rótulo em `auditLabels.js` |
|---|---|---|---|---|
| `RECEBIDO_ESTORNADO` | `{ pedido_item_id, quantidade_recebida: <antes> }` | `{ quantidade_recebida: <depois>, movimentacao_id, recebimento_id }` | `Estorno da movimentação #<mov.id> descontou <qtd> do pedido` | `Recebido do pedido estornado` |
| `STATUS_AUTOMATICO_REABERTO` | `{ status: 'recebido' }` | `{ status: <destino> }` | `Estorno da movimentação #<mov.id> reabriu o pedido` | `Reabertura automática do pedido` |

Logs (literais): item não resolvido →
`[recebimento] estorno da movimentacao <mov.id>: item do recebimento <recebimento_id> nao encontrado — pedido nao descontado`;
piso aplicado (a linha tinha menos que o estornado) →
`[recebimento] estorno da movimentacao <mov.id>: linha do pedido <pedido_item_id> tinha <antes>, descontado ate 0`.

### Gancho no motor (`stockService.js`, `cancelarMovimentacao`)

Depois da auditoria `CANCELAMENTO` (`:2703-2707`), antes do alerta:
```
let pedidoCompra = null;
if (mov.tipo === 'ENTRADA_COMPRA' && mov.recebimento_id) {
  try { pedidoCompra = await require('./receiptService').estornarEntradaNoPedido(db, user, mov); }
  catch (e) { console.warn(`[almoxarifado] desconto do pedido de compra no estorno falhou (movimentacao ${movimentoId}): ${e.message}`); }
}
...
return pedidoCompra ? { success: true, estorno_id: estornoId, pedido_compra: pedidoCompra } : { success: true, estorno_id: estornoId };
```
Recusas, literais e claim do motor: **inalterados**.

### Rota

`POST /api/almoxarifado/movimentacoes/:id/cancelar` — mesmo gate, payload e recusas. Resposta 200: a de hoje, mais
`pedido_compra` (objeto acima) **quando** o estorno tocou um pedido.

### Tela (`MovimentacoesAlmoxarifado.js`, `confirmarEstorno`, `:620-639`)

Depois do `toast.success('Movimentação estornada!')`, se `resp.data.pedido_compra`:
- `reaberto: true` → `toast.info('Pedido de compra <numero> reaberto: faltam <saldo_pendente> para receber')`;
- senão → `toast.info('Pedido de compra <numero>: o saldo a receber voltou a <saldo_pendente>')`.
`<saldo_pendente>` com `Number(x.toFixed(6))` (sem ruído). Sem `pedido_compra` → nada novo.

### O que não muda (contratos que não se reabrem)

A entrada atômica/idempotente da nota (claim por item, 5/36); o claim `processando_em` (70); o fechamento automático
continua subindo do mesmo jeito (só a régua do "completo" é a por material); o `PATCH .../status` manual (39) e o módulo
Compras (`routes/compras.js`, `pedidoCompraService.js`) — **nenhuma linha do Compras muda**: esta etapa **escreve** em
`pedidos_compra.status` (como a 42 já escreve) e em `itens_pedido_compra.quantidade_recebida` (coluna criada pelo
`schema.js` do almoxarifado, Etapa 37); os avisos da 19/70; o motor de estorno (recusas e literais).

## Tasks

Ordem topológica: **T0 → T1 → T2** (tronco, sequenciais, um executor — mexem na régua, no schema e no motor); **T3**
(galho de cliente, contra o contrato acima, em paralelo à T2, worktree); **T4** (integração) depois de T2; **T5**
fechamento. Executores de galho **não** marcam este plano.

- [x] **T0 (tronco) — FEITA** (hash no commit "Almoxarifado Etapa 71 T0"). Três trocas: fechamento com 3 argumentos,
  `?pendentes=1` com `saldo_por_material > ${EPSILON_DIVERGENCIA}` e a barreira do `POST` com epsilon (Fase 2).
  Testes: (10) e (11) em `comprasPedidoStatusAutomatico` (14/14), (1c) com `?pendentes=1` e **(1d) novo** em
  `comprasPedidoSituacaoFonte` (11/11). **Divergência:** o "cenário de float de `?pendentes`" que o plano mandava achar
  **não existia** — o (1b) prende só a régua; criado o (1d), que é vermelho na cláusula antiga (o pedido 2,2 + 17,9 de
  20,1 ficava DENTRO de `?pendentes=1`: outro defeito anterior, corrigido pela mesma troca). Sabotagens: S1 fechamento
  com 2 argumentos → (10); S2 cláusula antiga → (1c) e (1d) (o (2) cai em cascata: o (1c) abortado deixa um parcial a
  mais); S3 barreira sem epsilon → (11) (400 "maior que o saldo do pedido (0.19999999999999998)"); S4 epsilon de 0,05 →
  (11) pela metade negativa (0,21 passou). Suíte: api 262/262, almoxarifado 44/44, validation 4/4, safealter 3/3,
  sqlite 5/5. Os testes da 42 (`pedidosCompraSaldoAux` 8/8, `recebimentoExcedentePedido` 16/16) sem edição.
  Plano original da T0: As duas trocas do contrato.
  Testes: em `comprasPedidoStatusAutomatico.api.test.js` cenário **(10)** pelas seis portas (nota de 25 de A com
  excedente autorizado num pedido A(10)+B(10) → status **não** vira `recebido`; nota dos 10 de B → vira); em
  `comprasPedidoSituacaoFonte.api.test.js` o (1c) ganha a asserção de `?pendentes=1` (inclui no primeiro estado, exclui
  no segundo). **Corrigir os dois comentários que afirmavam a correção** (`receiptService.js:1832-1839`, teste
  `:150-157`), dizendo que estavam errados. Controle positivo: voltar o fechamento a 2 argumentos → (10) cai; voltar a
  cláusula → (1c) cai; o cenário de float de `?pendentes` (20,1 = 2,2 + 17,9 — achar o teste existente) continua verde.
- [ ] **T1 (tronco) — o vínculo item → movimentação.** Coluna + escrita (contrato). Teste novo
  `server/tests/api/recebimentoVinculoMovimentacao.api.test.js`: pelo `/processar` e pelo `/aprovar` direto, cada item
  com quantidade > 0 fica com `movimentacao_entrada_id` = id da `ENTRADA_COMPRA` dele (dois itens do mesmo material →
  dois ids diferentes, cada um com a quantidade do seu item); item com 0 → `NULL`; reprocessamento (falha parcial
  retomada) não reescreve o do item que já entrou. Controle positivo: gravar o id no item errado (`itens[0]`) → cai o
  de dois itens; não gravar → cai tudo.
- [ ] **T2 (tronco) — desconto, reabertura e o gancho.** `estornarEntradaNoPedido` + gancho em `cancelarMovimentacao` +
  dois rótulos em `auditLabels.js`; **reescrever o cabeçalho de `fecharPedidosCompletos`** (decisão 4 "só sobe" →
  "sobe aqui; desce em `estornarEntradaNoPedido`", com a B161 citada como revogada em parte). Teste novo
  `server/tests/api/pedidoReabreNoEstorno.api.test.js` — RN-01 a RN-08, **pela rota** `/movimentacoes/:id/cancelar` e
  **pelo serviço** `stockService.cancelarMovimentacao` (os dois caminhos, regra da skill), harness real. Para RN-07,
  trigger `RAISE(ABORT)`; para RN-06 fallback, `UPDATE ... SET movimentacao_entrada_id = NULL` à mão. Controle positivo
  (cada um derruba o cenário certo): (a) descontar o `pedido_item_id` do primeiro item do par → RN-06; (b) reabrir sem
  olhar `antes` → RN-03 (o `recebido` manual com conta aberta); (c) reabrir para `pendente` sempre → RN-02 (o `enviado`);
  (d) gancho na rota em vez do motor → o cenário pelo serviço cai; (e) gancho antes do claim → RN-05 (o segundo estorno
  desconta de novo); (f) `throw` no catch → RN-07; (g) fallback sem adoção → RN-06 (iguais). Rodar a suíte inteira: os
  testes que prendiam o "só sobe" pelo **estorno** (se houver algum além dos comentários de
  `comprasPedidoAtrasoIntegracao.api.test.js:55,321`) mudam **dizendo** que a regra mudou; o (8) da 42 e o da 45
  continuam verdes sem edição (são RN-03 e D8).
- [ ] **T3 (galho, cliente) — o aviso na tela de Movimentações.** Os dois `toast.info` do contrato. Teste em
  `MovimentacoesAlmoxarifado.test.js`: resposta com `pedido_compra.reaberto: true` → a literal de reabertura; `false` →
  a de saldo; sem a chave → só o `toast.success` de hoje. Controle positivo: trocar as literais → cai.
- [ ] **T4 (integração, cruza galhos) — a cadeia inteira.** `server/tests/api/pedidoReabreIntegracao.api.test.js`, só
  pelas portas reais: `POST /api/compras/pedidos` (`enviado`, previsão vencida, 1 linha de 10) → recebimento pelas seis
  portas → processar → pedido `recebido`, fora de `?atrasados=1` e de `?pendentes=1` → `GET /movimentacoes` acha a
  `ENTRADA_COMPRA` → `POST /movimentacoes/:id/cancelar` → resposta com `pedido_compra.reaberto` → pedido `enviado`,
  **dentro** de `?atrasados=1`, de `?pendentes=1` e do cartão de atrasado da central (`GET /almoxarifado/alertas/central`),
  itens oferece 10 → **novo** recebimento de 10 **sem** autorização → processar → `recebido` de novo → trilha do pedido
  na ordem `STATUS_AUTOMATICO_RECEBIDO`, `RECEBIDO_ESTORNADO`, `STATUS_AUTOMATICO_REABERTO`, `STATUS_AUTOMATICO_RECEBIDO`
  → `GET /almoxarifado/auditoria` devolve os dois rótulos novos. Segundo cenário: o mesmo pelo `/aprovar` direto e pelo
  serviço do motor, com estorno parcial (6 + 4) terminando no cartão de parcial.
- [ ] **T5 — fechamento** (skill `fechar-etapa`): spec 08 (item (4) pago; **corrigir a B161 e a frase da Surpresa 1
  dizendo que estavam erradas**; o 🟢 com o corte do D10), mapa, guia do usuário (Antes → Agora: "estornar a entrada
  reabre o pedido"; roteiro clicável: pedido → nota → processar → Movimentações → Estornar → Compras mostra o pedido de
  volta), letras B329–B338, **C107** (excedente cruzado fechava o pedido — defeito anterior corrigido na T0), **C108**
  (literal "material já consumido" no estorno de material retido — não corrigida), **A35**, D (71): o que o estorno não
  desfaz (D6) e o e-mail que não repete (D7). Retro de 4 números.

## Letra A — consulta para produção (A35)

Os estornos que **já** aconteceram não são corrigidos sozinhos (o gancho vale do deploy em diante). Quantos há, e quais
pedidos estão `recebido` com a conta aberta (pelo estorno do passado **ou** pelo excedente cruzado da T0):
```sql
SELECT m.id AS movimentacao, m.recebimento_id, m.quantidade, m.cancelado_em,
       ri.pedido_item_id, ip.pedido_id, p.numero, p.status
FROM movimentacoes_almoxarifado m
JOIN recebimentos_material_itens_almoxarifado ri
  ON ri.recebimento_id = m.recebimento_id AND ri.material_id = m.material_id
JOIN itens_pedido_compra ip ON ip.id = ri.pedido_item_id
JOIN pedidos_compra p ON p.id = ip.pedido_id
WHERE m.tipo = 'ENTRADA_COMPRA' AND m.cancelado = 1;
```
Se vier linha: a correção é `UPDATE itens_pedido_compra SET quantidade_recebida = MAX(0, quantidade_recebida - <quantidade>)
WHERE id = <pedido_item_id>` por linha + lápis → *Status* — escrita no guia, não automatizada (D4: o par pode ser ambíguo
no passado).

## O que fica de fora (vira "falta" ou "fora por decisão", com o motivo)

- **Estorno do recebimento inteiro como documento** (reverter conta a pagar, etiquetas, NC) — D6; ninguém pediu, e o
  estorno por item cobre a correção de estoque.
- **Devolução ao fornecedor / sucata do reprovado reabrindo o pedido** — D8.
- **Reabrir a solicitação de compra** — Surpresa 4: ela fecha na primeira nota, então não há "fechou por este pedido"
  para desfazer.
- **Conta a pagar** — D6 (Financeiro, core).
- **Corrigir/suprimir o aviso da 70 no estorno** — B322 (70), contrato que não se reabre.
- **Literal "material já consumido" no material retido** — C108; motor congelado nesta etapa.
- **Aviso prévio no modal de estorno** ("esta entrada é do pedido X") — a tela avisa **depois** (T3); o aviso antes exige
  a lista de movimentações trazer o pedido (join novo na listagem). Pequeno, fica nomeado.
- **Conferência física estruturada** — corte declarado do 🟢 (D10).

## Pontos de atenção para a Fase 2 (revisor: siga cada RN até o último gesto)

1. **Depois do estorno, cada gesto:** o comprador abre Compras (o pedido mostra o status reaberto? a tela lê `status`
   cru), o almoxarife abre Recebimento → Novo → escolhe o pedido (aparece em `?pendentes=1`? as linhas vêm com o saldo?),
   salva (`POST` passa sem excedente?), confere, fiscal, processa (fecha de novo?). Algum desses passos recusa o que o
   anterior aceitou?
2. **D2 com trilha velha:** pedido fechado pelo automático, reaberto pelo comprador à mão (`pendente`), fechado à mão
   (`recebido`) e então estornado — a última trilha `STATUS_AUTOMATICO_RECEBIDO` tem `dados_anteriores` de um fechamento
   antigo. O destino ainda faz sentido? (A regra diz "a última trilha automática"; medir se a reabertura do D2 também
   deveria contar como "última".)
3. **Saldo global (regra do CLAUDE.md):** o motor deixa estornar uma `ENTRADA_COMPRA` cujo material foi devolvido/consumido
   se **outro** saldo do mesmo material cobre o disponível. O pedido reabre do mesmo jeito — é o certo ("a entrada não
   aconteceu"), mas confirmar que nenhum gesto posterior (NC, devolução já executada do mesmo item) fica inconsistente.
4. **Corrida estorno × processar** da nota seguinte do mesmo pedido: o `UPDATE` aritmético é atômico por linha, mas a
   decisão "antes/depois" lê a soma fora dele — dá para reabrir um pedido que a outra nota acabou de fechar? (O `WHERE
   status = 'recebido'` segura o pior caso; medir o resto.)
5. **T0 muda o comportamento de pedidos já existentes** em produção (o excedente cruzado que hoje está `recebido`
   continua `recebido` — o gancho só roda na próxima nota; a A35 mostra quantos). Confirmar que nenhum teste existente
   prende o fechamento por pedido.
6. **`?pendentes=1` com float:** a cláusula nova (`saldo_por_material > 1e-9`) precisa do mesmo tratamento do caso 20,1
   (2,2 + 17,9) que a 42 mediu — o `MAX(0, total - recebida)` por material em `REAL` pode deixar resíduo acima de 1e-9?

## Fase 2 — revisão do plano: 0 críticos, 5 importantes, 8 menores → plano revisto (vale sobre o texto acima)

- **IMPORTANTE — A35 descontava em dobro**: casa por (recebimento, material) e dois itens do mesmo material viram duas
  linhas; sem corte, pega estornos que o gancho já descontou. → exclui movimentações com trilha `RECEBIDO_ESTORNADO`,
  prefere `ri.movimentacao_entrada_id`, e ganha a segunda consulta (pedidos `recebido` com saldo por material > 1e-9 —
  os fechados pelo excedente cruzado).
- **IMPORTANTE (defeito anterior, sonda `sonda71r-b.js`) — ponto flutuante na barreira**: `assertSaldoDoPedidoPermitido`
  compara sem epsilon (`receiptService.js:801`): pedido 0,3 KG, nota 0,1, a nota de 0,2 toma 400 "maior que o saldo do
  pedido (0.19999999999999998)" — HOJE. → **T0 corrige junto**: `recebidaTotal > saldoMaterial + EPSILON_DIVERGENCIA`;
  a RN-10 ganha um cenário em KG.
- **IMPORTANTE (sonda) — material crítico retido nem sempre é recusado no estorno**: com outro estoque disponível do
  mesmo material, o estorno da ENTRADA_COMPRA passa (200), a inspeção continua com 4 e depois aprova o que "não
  entrou". → **recusa no motor (T2)**: estorno de `ENTRADA_COMPRA` cujo item do recebimento ainda tem
  `quantidade_em_inspecao > 0` → 400 **`Esta entrada tem <q> <un> em inspeção — decida a inspeção antes de estornar a
  entrada`**. Corrige a C108/RN-08, que afirmavam uma recusa que só existia sem outro estoque (estavam erradas).
- **IMPORTANTE (sonda `sonda71r-c.js`) — relançar a mesma NF é recusado** (409 de `assertNotaNaoDuplicada`), e "lancei
  errado → estorno → relanço" é o caso mais comum. → **T2 (decisão reversível, letra B)**: a checagem de nota duplicada
  ignora o recebimento cujas entradas de estoque existem e estão **todas** estornadas (`cancelado = 1`); um recebimento
  com qualquer entrada viva continua bloqueando. Declarado: a conta a pagar do primeiro fica (D6) — relançar deixa
  **duas contas** para a mesma compra; o guia diz isso com todas as letras (letra C).
- **IMPORTANTE — duas contas a pagar no relançamento**: declarado acima (C + guia).
- Menores: trilha do D2 lida com `ORDER BY id DESC` e `JSON.parse` com try; toast: sem toast em pedido
  cancelado/rejeitado nem quando o saldo voltou a 0; a T3 lê `resp?.data?.pedido_compra` (sem TypeError → toast.error
  depois do sucesso); **ordem das escritas no gancho**: linha e status primeiro, trilhas em try próprio (+ teste com
  trigger na trilha `RECEBIDO_ESTORNADO`); falha da auditoria CANCELAMENTO do motor (`:2703`) depois do estorno →
  letra C (anterior); adoção do vínculo legado confere `changes === 1`; `conferirRecebimento` sem guarda de status pode
  reescrever a recebida depois do PROCESSADO (anterior, só API) → letra C; reabertura após fechamento manual usa a
  trilha do primeiro fechamento automático → declarado; corrida estorno × processar: o UPDATE do fechamento automático
  repete a régua no WHERE.
