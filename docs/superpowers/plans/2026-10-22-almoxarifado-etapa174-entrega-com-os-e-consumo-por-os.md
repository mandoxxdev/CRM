# Etapa 174 — A entrega grava a OS e o "Consumo por OS" passa a enxergar as requisições

> **Status:** 🟡 T1–T3 feitas (2026-10-22); falta o fechamento (docs). Emendada da "próxima tarefa detalhada" da Etapa 172. (A 173 é de outra
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

## Próxima tarefa detalhada

*(preencher no fechamento)*

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
