# Etapa 174 — A entrega grava a OS e o "Consumo por OS" passa a enxergar as requisições

> **Status:** 🟢 FECHADA (2026-10-22) — T1–T3, revisão adversarial da Fase 5 e fechamento (docs). Emendada da "próxima tarefa detalhada" da Etapa 172. (A 173 é de outra
> sessão — atalho F2 do fornecedor, só client.)
> **Fase 0 (medido):**
> - A entrega tem **uma** porta de SAÍDA (`requisitionService.js:1920-1948`, `entregarSemTrava`); passa `projeto_id`,
>   `cliente_id`, `centro_custo_id`, `referencia: os_referencia || numero`, `justificativa` — **não** `os_id`, embora
>   `reqRow` (`SELECT *`) já o tenha desde a 172.
> - `relatorioConsumoPorOS` (`reportService.js:150-161`) filtra/agrupa por `m.os_id` → hoje **nada** do que sai por
>   requisição aparece na OS.
> - **O risco da emenda I5 da 172 não se confirma:** `avaliarRegrasVinculo` só afrouxa com `os_id`;
>   `ownerRules.assertSaidaPermitida` olha o **projeto primeiro** e, sem projeto, a entrega de material de cliente **já
>   recusa hoje** (sem OS nem projeto); com `os_id` do mesmo cliente ela **passa a funcionar**; com OS de outro cliente
>   recusa como hoje (só muda a mensagem). Material próprio: nada muda. **A I5 estava errada** em chamar isso de risco
>   de recusa nova — corrigir a spec 22 dizendo que estava errada.
> - Devolução herda o `os_id` da saída (`returnService.js:142`) mas o relatório **não desconta** `ENTRADA_DEVOLUCAO`
>   (régua histórica declarada, `reportRegistry.js:246-252`). A ENTRADA do estorno da exclusão de requisição entregue
>   (`requisitionService.js:~2192`) não leva `os_id`.

## Regras

| ID | Regra | Cenário |
|---|---|---|
| RN-174.01 | A SAÍDA da entrega grava `os_id` da requisição (null quando a requisição não tem). Nada mais muda na chamada. | req com `os_id` 7 entregue → `mov.os_id = 7` |
| RN-174.02 | A ENTRADA do estorno da exclusão de requisição entregue grava o mesmo `os_id`. | excluir req entregue → entrada com `os_id` 7 |
| RN-174.03 | `relatorioConsumoPorOS` **mantém** a coluna/total de hoje (saídas, bruto — régua histórica) e **acrescenta** `devolvido` (Σ `ENTRADA_DEVOLUCAO` não cancelada com o `os_id`, + a ENTRADA da RN-02) e `liquido = consumido − devolvido`. Aditivo: nenhum campo some nem muda de significado. | sai 10, volta 3 → consumido 10, devolvido 3, líquido 7 |
| RN-174.04 | Material de cliente sem projeto e com `os_id` de OS do **mesmo** cliente: a entrega passa (antes recusava). OS de outro cliente: recusa com a mensagem de `ownerRules.js:161-163` (antes a de `:154-155`). | os dois cenários |
| RN-174.05 | Requisições antigas sem `os_id` **não** são preenchidas (casar texto com OS é proibido — decisão do P.O. 16/09 e plano da 172). | — |

## Tasks

| # | Task | Tipo |
|---|---|---|
| T1 | RN-01, 02, 04 no `requisitionService` + testes (entrega pela rota; exclusão; dono mesmo cliente/outro cliente; material próprio inalterado; estorno da saída espelha `os_id` — já existe, provar). | tronco |
| T2 | RN-03 no `reportService` + o registro do relatório (`reportRegistry.js`) e a tela/exportação do relatório se listarem colunas (client); teste com saída + devolução + exclusão. | tronco (depende T1) |
| T3 | Integração: pedido com OS (171) → requisição com OS (172) → entrega → devolução parcial → relatório mostra consumido/devolvido/líquido. | integração |

## Fora do escopo (letra D)

- `passaNaRegraDoDono` da chegada e os avisos do recebimento continuam olhando só o projeto (ficam mais
  conservadores que a entrega — pulam requisição que a entrega aceitaria; nada é entregue errado).

## Próxima tarefa detalhada — Etapa 176: entrada de material de cliente com OS opcional

*(A 175 é de outra sessão — editar ferramenta pela tela; a numeração pula para a 176.)*

**O pedido, deduzido (letra B1119).** A resposta do cliente sobre industrialização foi: *"industrialização = material do cliente que fica
em nosso estoque; nós fazemos a mão de obra"*. A pergunta *"o material do cliente já vem para uma OS específica?"* **foi feita e aguarda
resposta** — por isso o campo é **opcional** e **reversível** (nada que exista passa a ser exigido).

**O que fazer.** Na entrada de material de cliente (tela **Recebimentos**, manual 16.6 — hoje exige só o número do documento/nota de remessa;
projeto **não** é exigido de propósito), aceitar uma **OS opcional**. Com a OS informada e aberta, o que entrou fica **reservado para a OS**,
reaproveitando inteira a maquinaria da 171 (`services/almoxarifado/reservaDaOs.js`):
- **Predicado**: `osAbertaDoRecebimento(db, recebimentoId)` (`reservaDaOs.js:82`) hoje lê a OS **só** pelo pedido de compra
  (`recebimentos_material_almoxarifado.pedido_compra_id` → `pedidos_compra.os_id`). Ponto de extensão: coluna nova aditiva
  `recebimentos_material_almoxarifado.os_id` (o `recebCols` + `safeAlter` de `schema.js:~1850`), lida **antes** do pedido; recebimento com
  pedido **e** OS própria diferente → decidir (sugestão: recusar 400 na criação, para não ter duas OS). OS fechada → `null` (fila comum,
  RN-171.03/B1101).
- **Reserva na chegada**: `reservaChegadaService.js:~233` (`osAbertaDoRecebimento` → `distribuirParaOs` → `reservarParaOsSobTrava`, sob a trava
  por material; `jaReservadoDaNotaParaOs` para a retomada). Não precisa de porta nova — só o predicado enxergar a OS do recebimento.
- **Conversão na aprovação**: `converterReservasDaOs` / `reservasDaOsParaRequisicao` (`reservaDaOs.js:198`) — a requisição com `os_id` (172)
  converte a reserva da OS; nada a mudar.
- **Liberação ao fechar a OS**: `liberarDaOsFechada` / `soltarSeOsFechou` (171, B1087/B1090) — nada a mudar.
- **Regra do dono**: o material é do cliente; a OS informada na entrada tem de ser **do mesmo cliente** (senão a reserva prenderia material de
  A para uma OS de B, e a entrega recusaria depois — o mesmo problema da Fase 5 desta etapa). Recusar na entrada com a mensagem de
  `ownerRules.assertSaidaPermitida` como molde ("pertence ao cliente X, mas a OS N e do cliente Y").
- **Tela**: campo **OS** opcional no recebimento de material de cliente (a lista de OS de `GET /api/almoxarifado/aux/ordens-servico` que a
  Nova Requisição do almoxarifado já usa); a ENTRADA do recebimento grava `os_id` (o consumo por OS desta etapa **não** conta ENTRADA sem
  requisição — o saldo inicial fica fora, I1; manter).

**Pontos de atenção.** (1) Material de cliente hoje entra com `ENTRADA` do recebimento — conferir qual tipo e se ele passa por
`reservaChegadaService` (o pedido da 171 passava por `ENTRADA_COMPRA`); se não passar, a reserva tem de ser ligada nesse caminho **sob a trava
por material** (CLAUDE.md, porta nova que reserva). (2) A posição por cliente não muda (reserva não é consumo). (3) O que **não** reabrir: o
casamento por `os_id` da 172, a saída com a OS e a regra projeto × OS de clientes diferentes desta etapa (`c3655b0f`).

---

## Revisão da Fase 2 (2026-10-22) — 2 críticos, 4 importantes; as emendas PREVALECEM

- **C1 — a ENTRADA da exclusão leva o `os_id` DA SAÍDA que ela estorna**, não o da requisição (a exclusão estorna saída
  por saída, laço sobre `g`, `requisitionService.js:2103-2109`; molde `returnService.js:142`). Ramo legado
  (`:2167-2175`): null. Sem isso, requisição entregue antes do deploy e excluída depois dava consumido 0 / devolvido 10
  / líquido −10.
- **C2 — período:** cada linha conta pela **data dela**; com filtro de período o líquido **pode ficar negativo** (saída
  em setembro, devolução em outubro, filtro só outubro). Declarado na `nota` do relatório e na letra B. Descartado:
  atribuir a devolução à data da saída citada (não serve para a ENTRADA da exclusão).
- **I1 — contrato congelado do relatório** (`relatorioConsumoPorOS`, uma query, `cancelado = 0`, agrupado por
  `material_id, os_id`): `total_consumido` = SAIDA* (sem mudança); `devolvido` = `tipo IN TIPOS_DEVOLUCAO` (com o legado
  `DEVOLUCAO`, como `reportService.js:965`) **OR** `(tipo = 'ENTRADA' AND requisicao_id IS NOT NULL)` (a ENTRADA da
  exclusão — o único outro `ENTRADA` é o saldo inicial, sem requisição) — **menos** o que a I2 exclui; `liquido =
  total_consumido − devolvido`; `HAVING total_consumido > 0 OR devolvido > 0`; `ORDER BY total_consumido DESC`. No
  `reportRegistry.js` (~:260-265): colunas `devolvido` ("Devolvido") e `liquido` ("Líquido") e a `nota` reescrita
  (régua, data de cada linha, sucata). A exportação já projeta pelas `colunas`. Linhas **só com devolução** passam a
  aparecer (inclusive devolução avulsa com OS digitada).
- **I2 — devolução que vai para SUCATA não conta como devolvida** (decisão reversível, letra B): ela gera
  ENTRADA_DEVOLUCAO + SUCATA (`returnService.js:338-364`); a peça não voltou a ser usável, então o líquido da OS não
  cai. Quarentena **conta** como devolvida; Retrabalho não gera ENTRADA_DEVOLUCAO (fica fora) — declarados.
- **I3 — a saída da entrega não se estorna pelo livro** (`cancelarMovimentacao` recusa `requisicao_id`,
  `stockService.js:2711-2713`). O item "estorno da saída espelha" sai da T1; entra: "estorno da devolução
  (ENTRADA_DEVOLUCAO cancelada) sai do devolvido".
- **I4 — o custo por projeto também ignora a ENTRADA da exclusão** (`reportService.js:965`) — furo pré-existente no
  outro relatório; **letra D** nesta etapa (fora do escopo).
- **RN-174.04 conferida** nos cinco cenários (OS excluída: material de cliente recusa como antes, agora com "OS informada
  nao existe"; material próprio passa — sem FK; projeto + OS de clientes diferentes: o projeto vence na entrega, mas o
  relatório atribui à OS — declarar; próprio, emergencial e série: nada muda).
- **T2 não tem client:** a tela genérica lê as `colunas`; o dashboard soma só `total_consumido` (o `HAVING` o protege).

---

## Execução (2026-10-22)

- [x] **T1** — `4b8945a1`. `requisitionService.entregarSemTrava`: a SAIDA grava `os_id: reqRow.os_id` (RN-174.01). Exclusão:
  o `SELECT` das saídas lê `m.os_id` e cada parte leva o `os_id` **da saída** para a ENTRADA (RN-174.02 com C1); ramo legado:
  `undefined` → null. Teste novo `server/tests/api/entregaComOsId.api.test.js` (11): req com/sem OS; exclusão com OS; C1 (saída
  sem `os_id` → ENTRADA null); ramo legado null; dono: mesmo cliente passa, outro cliente recusa ("...mas a OS X e do cliente
  Y"), OS excluída recusa "OS informada nao existe", material próprio com OS excluída passa, projeto A + OS B passa (projeto
  vence; a saída leva a OS B), controle sem OS/projeto recusa como antes. Vermelho antes: 7/11 falhando (os 2 de C1 e os 2
  controles já passavam — são os que provam que **não** se usa o `os_id` da requisição). Controle positivo: ENTRADA com
  `reqRow.os_id` → os 2 de C1 vermelhos na asserção de `os_id`; restaurado por cópia, `cmp` ok. O teste da 172
  (`requisicaoOsIdCasaReservaDaOs`, "a saída NÃO leva os_id") foi **invertido** com a explicação da I5 revista.
  `test:api` com T1: 499/499.
- [x] **T2** — `97d3012f`. `relatorioConsumoPorOS` pelo contrato I1: `total_consumido` inalterado (SAIDA*), `devolvido` = TIPOS_DEVOLUCAO
  sem a devolução de destino SUCATA (achada por `referencia = 'DEV-' || d.id`, I2) + `ENTRADA` com `requisicao_id`; `liquido`;
  `HAVING`; `ORDER BY total_consumido DESC`. `reportRegistry`: colunas Devolvido/Líquido e a nota (régua, sucata, data de cada
  linha/negativo — C2; mantém "saídas diretas", que o `relatoriosRegistro` confere). Teste novo
  `server/tests/api/consumoPorOsDevolvido.api.test.js` (11): 10/3/7; sucata 10/0/10; quarentena 10/4/6; estorno da devolução
  10/0/10; exclusão 6/6/0; C1 → OS sem linha; período (out: 0/3/−3, set: 10/0/10, set–out: 10/3/7); avulsa só devolução
  0/2/−2; HAVING + saldo inicial com OS; ordem e sem filtro; registro + exportação xlsx (cabeçalho e 10/3/7). Vermelho
  antes: 10/11. Controles positivos (cada um restaurado por cópia + `cmp`): sucata contando → só o teste I2 vermelho (10/3/7);
  sem a ENTRADA da exclusão → só o de exclusão vermelho (6/0/6); sem o filtro de tipo do WHERE **e** sem HAVING → o de HAVING
  vermelho (linha 0/0/0).
- [x] **T3** — `94d18eac`. `server/tests/api/consumoPorOsPontaAPonta.api.test.js` (1, pela rota): pedido de compra com OS → recebimento →
  requisição pela cesta (`POST /api/requisicoes-material`, usuário sem módulo) com `os_id` → aprovar (converte da reserva
  da OS) → separar → entregar 8 (saída com a OS) → 8/0/8 → devolução 3 → 8/3/5 → mais 1 para sucata → 8/3/5. Vermelho antes
  da T2 (devolvido NaN). Controle positivo: SAIDA sem `os_id` → vermelho na asserção RN-174.01; restaurado, `cmp` ok.

**Suítes com T1–T3 (antes do merge da 173 no client):** `test:api` 501/501 arquivos; `test:almoxarifado` 44/0;
`test:validation` 4/0; `test:safealter` 3/0; `test:sqlite` 16/0; client 174 suítes / 2221 testes; `build` com `CI=true`
compilou. (Com a 173 mesclada o client passa a ter 175 suítes — não é regressão desta etapa.)

**Divergências do plano:**
- **HAVING sozinho não é observável:** o `WHERE` já filtra o tipo (SAIDA* ou devolvido) e `cancelado = 0`, então nenhuma linha
  chega com 0/0 a não ser com quantidade zero. Mantido (contrato I1, defesa); o teste prova o par (sem os dois → vermelho).
- **O "estorno da devolução" se provou pelo livro** (`/movimentacoes/:id/cancelar` da ENTRADA_DEVOLUCAO), como pedia a I3.
- **T2 sem client**, como a revisão previu; client rodado só para garantir que nada quebrou.
- Documentação de fechamento (README da feature, mapa, guia, novidades letra B com I2/C2/I4) **não** foi feita aqui — fica
  para o `fechar-etapa`.

---

## Fase 5 — revisão adversarial (2026-10-22)

Revisor fresco sobre T1–T3; 1 importante, 2 menores, lacunas de teste e o HAVING. Cada correção com TDD, controle positivo na asserção
certa, restauro por cópia + `cmp`, commit por assunto.

- [x] **1 (importante) — projeto do cliente A + OS do cliente B** — `c3655b0f`. A entrega passava (o projeto vence na regra do dono), mas a
  SAÍDA gravava o `os_id` de B: a posição por cliente de A (`clienteEstoqueService.js:106-120`) mostrava "aplicado na OS de B" e o consumo
  por OS de B somava material de A. **Escolhido (B1115, reversível):** com `projeto_id` e cliente do projeto ≠ cliente da OS, a SAÍDA não
  grava `os_id` (`osIdDaSaida`, lido uma vez antes do laço); mesmo cliente, ou sem projeto, como antes. A ENTRADA da exclusão copia o
  `os_id` da saída (C1) e acompanha. **Descartado:** mostrar só o projeto no relatório do cliente (esconderia a OS no caso certo). Teste
  `entregaComOsId` (12): o cenário A/B invertido (saída `[null, proj]`, posição de A só com o projeto, consumo por OS de B sem o material,
  exclusão com `os_id` null) e o controle mesmo cliente (saída e posição com a OS). Vermelho antes: 1/12 (o A/B). Controles positivos: sem o
  descarte → cai na asserção do `os_id` da saída; com essa asserção desligada (cópia do teste) → cai na asserção da **posição do cliente**
  (`[9, null, 1, 2]` — a OS de B aparece). Restaurados por cópia, `cmp` ok.
- [x] **2 (menor) — quadro do painel** — `aa053fa8`. `aggregateConsumoPorOS` pula linha com `total_consumido` não positivo (linhas só de
  devolução): a OS não aparece com "Qtd. consumida 0" e o estado vazio volta (B1117). Jest (2) em `AlmoxarifadoDashboard.test.js` (o
  `mockarApi` ganhou `overrides.consumoOs`): vermelhos antes (2/15), verdes depois (15/15). **O plano (revisão da Fase 2) dizia "o `HAVING` o
  protege" — estava errado**: o `HAVING` deixa passar exatamente essas linhas.
- [x] **3 (menor) — índice no `NOT EXISTS` da sucata** — `9d1fcd1d`. `m.referencia = 'DEV-' || d.id` → `EXPLAIN QUERY PLAN` `SCAN d`.
  Acrescentado `d.id = CAST(SUBSTR(m.referencia, 5) AS INTEGER)` (mantida a igualdade de texto — casa exatamente as mesmas linhas): `SEARCH d
  USING INTEGER PRIMARY KEY`. Não há coluna `devolucao_id` no livro; criar seria migração (descartado). Controle: `SUBSTR(..., 6)` → o teste I2
  cai (10/3/7 em vez de 10/0/10); restaurado, `cmp` ok.
- [x] **4 — lacunas de teste** — `d087bcfc` (`consumoPorOsDevolvido`, 13): o legado `DEVOLUCAO` conta (10/4/6); entrega 10 com OS, devolução
  parcial 5 citando a saída, exclusão → **o código estorna só os 5 que não voltaram** (uma ENTRADA de 5 com a OS) e o relatório fica 10/10/0
  (antes da exclusão 10/5/5) — o raciocínio do revisor confere. Os dois passaram de primeira; controles: tirar `DEVOLUCAO` da lista → o do
  legado cai (10/0/10); a exclusão estornando o entregue cheio (`liquido = g.q`) → o da parcial cai na asserção do estorno (10 em vez de 5).
  O relatório do cliente com projeto + OS de clientes diferentes está no item 1.
- [x] **5 — HAVING: mantido** (contrato I1, defesa). O revisor provou que é código morto: o `WHERE` já filtra o tipo (SAIDA* ou devolvido) e
  `cancelado = 0`, então nenhum grupo chega 0/0 (só com quantidade zero, que o motor não grava). **A suíte não o protege sozinho**: o teste
  prova o par (sem o filtro de tipo do `WHERE` **e** sem o `HAVING` → vermelho). Descartado: remover (se alguém afrouxar o `WHERE`, o
  `HAVING` é o que impede a linha 0/0/0). Declarado também na spec 21.

**Declarados na letra D (174):** a devolução para quarentena depois sucateada conta como devolvida; a devolução de destino SUCATA com a perna
SUCATA recusada fica fora do devolvido; o Custo por projeto sem a ENTRADA da exclusão (I4); a chegada olhando só o projeto.

## Fechamento (2026-10-22)

Novidades (seção da 174 depois da 175, cabeçalho com a 174 no topo e 175/173/172 em "Também em", B1111–B1119, C429, D (174), F (174) e a
correção da D (172)); specs 22 (a I5 da 172 **estava errada** — corrigido dizendo), 21, 13, 04 e 07 (as menções à I5) e o mapa; guia
(cabeçalho e roteiro de 8 passos); manual (7.2, 16.4, 16.9, 21d "Consumo por OS" e o quadro do Dashboard).

### Retro

- **A Fase 0 desmentiu a revisão da 172** (a I5): medir a regra do dono antes de aceitar o risco salvou a etapa de nascer com um "não fazer".
- **A revisão adversarial achou o caso cruzado (projeto × OS de clientes diferentes)** que a revisão da Fase 2 só "declarou": declarar uma
  consequência que mostra dado de um cliente no relatório de outro não basta — precisava de decisão. Lição: consequência que atravessa
  dono de material vira decisão B, não D.
- **"O HAVING o protege"** era uma afirmação sobre o client feita sem rodar o client: o painel soma linha 0. Afirmação sobre consumidor só
  depois de ler o consumidor.

### Verificação final (medida, sobre a main com a 175 mesclada e a Fase 5)

`test:api` **501/501** arquivos; `test:almoxarifado` **44/0**; `test:validation` **4/0**; `test:safealter` **3/0**; `test:sqlite` **16/0**;
client **175 suítes / 2252 testes** (a 175 trouxe testes novos — não é regressão); `CI=true` build **compilou**.
