# Etapa 174 — A entrega grava a OS e o "Consumo por OS" passa a enxergar as requisições

> **Status:** 🟡 em execução (2026-10-22). Emendada da "próxima tarefa detalhada" da Etapa 172. (A 173 é de outra
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
