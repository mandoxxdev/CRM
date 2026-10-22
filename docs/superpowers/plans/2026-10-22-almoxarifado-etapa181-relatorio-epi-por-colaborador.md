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

## Próxima tarefa detalhada

*(preencher no fechamento)*
