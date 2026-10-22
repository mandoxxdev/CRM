# Etapa 181 — O relatório "EPI por colaborador" lê as entregas de EPI, e os dois relatórios de pessoa ficam restritos

> **Status:** 🟡 em execução (2026-10-22). Emendada da "próxima tarefa detalhada" da Etapa 180 (e B1177).
> **Fase 0 (medido):**
> - `epi-colaborador` (`reportService.js:561-566`, registro `reportRegistry.js:487-502`) lê **empréstimos de ferramenta
>   `tipo='EPI'` em aberto** — não as entregas de EPI da 178 (`entregas_epi_almoxarifado`). `acao: null` (qualquer
>   usuário do módulo), sem parâmetros, `nota: null`.
> - `ferramentas-emprestadas` (`reportRegistry.js:469-486`) também `acao: null`, enquanto `GET /emprestimos` exige
>   `gerenciar_ferramentas` desde a 180 (B1177).
> - O dispatcher aplica a permissão pelo campo `acao` do registro (`extended.js:2555`, `:2581`, `:2594`); a lista some
>   para quem não pode, sem mudança no client.
> - O plano da 180 dizia "quem entregou (`criado_por_nome`)" e filtros `data_inicio/data_fim` — **errado**: a coluna da
>   entrega é `entregue_por_nome` e o filtro de `listarEntregas` é `de`/`ate`.
> - A varredura `relatoriosRegistro.api.test.js` [revisao I1] exige que cada coluna exista no SQL e cada parâmetro mude o
>   SQL.
> - Banco local: 0 ferramentas, 0 empréstimos (o legado `tipo='EPI'` não foi medido em produção).

## Regras

| ID | Regra |
|---|---|
| RN-181.01 | `epi-colaborador` passa a ler `entregas_epi_almoxarifado`: colunas `criado_em` ("Entregue em", dia de Brasília como os outros relatórios), `numero`, `colaborador_nome`, `matricula`, `setor`, `material_codigo`, `material_nome` ("EPI"), `ca_numero`, `ca_validade`, `quantidade`, `motivo`, `entregue_por_nome` ("Entregue por"), `tem_evidencia` ("Assinatura", `EXISTS` na evidência `ENTREGA_EPI` — **sem** recalcular hash por linha: a verificação continua na tela de EPI). Mais recentes primeiro. |
| RN-181.02 | Parâmetros: `colaborador_id`, `material_id`, `de`, `ate` (os nomes que o SQL lê; `de`/`ate` no dia de Brasília como `listarEntregas`). Cada um muda o SQL (varredura I1). |
| RN-181.03 | `epi-colaborador` com `acao: 'entregar_epi'`; `ferramentas-emprestadas` com `acao: 'gerenciar_ferramentas'`. PRODUCAO não vê nenhum dos dois na lista e recebe 403 na consulta e na exportação. |
| RN-181.04 | `nota` do `epi-colaborador`: diz que a fonte são as entregas com assinatura (a partir da entrega de EPI pela tela), que a integridade se confere na tela de EPI, e que **empréstimos de ferramenta cadastrada como EPI não entram mais aqui** (continuam em "Ferramentas emprestadas"). Letra B: o legado sai deste relatório (descartado: juntar as duas fontes — misturaria entrega com assinatura e empréstimo sem). |

## Tasks

| # | Task | Tipo |
|---|---|---|
| T1 | `reportService`/`reportRegistry` (RN-01..04) + testes: colunas e ordem, cada filtro (com controle de que muda o resultado), `tem_evidencia` 1/0, 403 e lista sem os dois relatórios para PRODUCAO, exportação com as colunas, a varredura I1 verde. Front: só conferir que a tela genérica mostra os parâmetros (tipo do campo — select de colaborador/EPI se o registro suportar `select` com opções do servidor; senão `numero`), teste Jest se mudar algo. | tronco |

## Execução

- [x] **T1** — RN-181.01..04 com as emendas C1, C2, I1, I2, I3 e os menores. Commit: `3ce1d3a2`.
  - `reportService.relatorioEPIPorColaborador(db, filtros)` com SELECT próprio sobre `entregas_epi_almoxarifado`:
    `strftime('%Y-%m-%d %H:%M:%S', e.criado_em) AS criado_em` (C1), `motivo` por CASE (`Primeira entrega`/`Troca`/`Perda`/`Dano`),
    `tamanho`, `tem_evidencia` `'Sim'`/`'Não'` por `EXISTS` na evidência `ENTREGA_EPI` (C2), mais recentes primeiro.
  - Helper compartilhado: `epiService.filtroDasEntregas(filtros)` → `{ where, params }` (colaborador_id, material_id, de/ate no
    dia de Brasília, mesma regex) — `listarEntregas` passou a usá-lo sem mudar comportamento (os `epi*` ficaram verdes sem mudar
    asserção). `reportService` faz `require` tardio de `epiService`.
  - Registro: `epi-colaborador` com `acao: 'entregar_epi'`, nota (RN-04), 14 colunas, params `colaborador_id` (select,
    `opcoes_url: '/almoxarifado/aux/colaboradores'`), `material_id` (number), `de`/`ate` (date), todos com `exemplo`;
    `ferramentas-emprestadas` com `acao: 'gerenciar_ferramentas'`.
  - Testes: `server/tests/api/relatorioEpiPorColaborador.api.test.js` (11) e um teste Jest novo em
    `RelatoriosAlmoxarifado.test.js` (nota, select carregado da rota aux, consulta com o id, célula de data). Client sem mudança
    de código.
  - Controles positivos (restauro por cópia + `cmp`): sem `strftime` → C1 e exportação vermelhos; evidência sempre `Sim` → C2 e
    exportação; ORDER BY ASC → ordem e filtro de colaborador; fuso `0 minutes` no helper → de/ate; `ferramentas-emprestadas`
    `acao: null` → registro e PRODUCAO; param renomeado / coluna renomeada no registro → varredura I1 vermelha; Jest: ISO cru no
    payload → célula vermelha, `opcoes_url` errada → select vermelho.
  - **Divergências do plano:** (1) a entrega sem evidência foi semeada por `INSERT` direto em `entregas_epi_almoxarifado` sem
    evidência — não precisou contornar trigger (os da 178 barram só UPDATE/DELETE); (2) a data na tela é conferida no Jest pela
    mesma conversão que a tela usa (fuso do processo), não pelo literal `21/10` — o teste antigo de data faz igual; o literal
    `2026-10-21 22:30:00` é conferido no servidor (consulta via `instanteDoBancoNoFuso` e linha da planilha); (3) `tamanho` entrou
    depois de `quantidade`; rótulo do material `EPI (id do material)`.
    (4) `relatoriosJornada.api.test.js` mudou de assercao (era o unico vermelho da 1a rodada, 517/518): o GESTOR via as 26
    chaves e PRODUCAO 22; agora GESTOR ve 24 (nao tem `entregar_epi` nem `gerenciar_ferramentas` — coerente com a tela de EPI
    e `GET /emprestimos`, que ja lhe negavam) e PRODUCAO 20. Mudanca de contrato intencional da RN-181.03, nao regressao.
  - Suites (2026-10-22, uma por vez): `test:api` 518/518; `test:almoxarifado` 44/0; validation 4/0; safealter 3/0;
    sqlite 16/0; Jest 180 suites / 2355 testes verdes; `CI=true build` compilado sem warning.

## Próxima tarefa detalhada

*(preencher no fechamento)*

---

## Revisão da Fase 2 (2026-10-22) — 2 críticos, 3 importantes, 5 menores; as emendas PREVALECEM

- **C1 — data:** `criado_em` da entrega é ISO UTC do Node (`2026-10-22T01:30:00.000Z`); os formatadores da tela
  (`RelatoriosAlmoxarifado.js:78-85`) e do Excel (`diaLocal.js:59-61`) só reconhecem `AAAA-MM-DD HH:MM:SS`. No SQL:
  `strftime('%Y-%m-%d %H:%M:%S', e.criado_em) AS criado_em` → a tela e a exportação mostram Brasília. Teste na linha
  exportada (22h30 de 21/10 → 21/10).
- **C2 — `tem_evidencia`:** `CASE WHEN EXISTS(...) THEN 'Sim' ELSE 'Não' END`. A nota diz que toda entrega pela tela
  grava a evidência na mesma transação — "Não" só aparece em anomalia (e a tela de EPI verifica a cadeia).
- **I1 — SELECT próprio** do relatório (o `COLUNAS_LISTA` não tem `setor` nem evidência), com o filtro `de`/`ate` extraído
  para um helper compartilhado com `listarEntregas` (mesma regex e `DATE(e.criado_em, ?)` do dia de Brasília).
- **I2 — tipos concretos dos params:** `colaborador_id` → `select` com `opcoes_url: '/almoxarifado/aux/colaboradores'`,
  `exemplo: 1` (lista só os ativos — quem saiu não é filtrável; letra B); `material_id` → `number`, `exemplo: 1`
  (a lista de materiais não filtra EPI — letra B); `de`/`ate` → `date`.
- **I3 —** `exemplo` declarado em todo param (a varredura I1 manda `'x'` sem ele).
- **Menores:** `motivo` com rótulo por CASE (`Primeira entrega`, `Troca`, `Perda`, `Dano`); `tamanho` entra nas colunas;
  testes positivos de ALMOXARIFE ao lado dos 403 de PRODUCAO (consulta **e** exportação, nos dois relatórios); a `nota`
  conferida no Jest (`nota-relatorio`).
