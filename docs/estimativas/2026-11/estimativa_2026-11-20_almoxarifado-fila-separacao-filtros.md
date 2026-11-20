# Estimativa 20/11/2026 — Fila de separação com filtro por setor, projeto e localização (1h15)

Etapa 255, item único. É a "próxima tarefa detalhada" (item 2) do plano da Etapa 254: o `[ ]` *"Agrupamento por projeto / setor /
localização"* da feature 05. Não está na estimativa de 18/11 (os itens 24-26 de lá continuam esperando resposta e não entram aqui).

**Medido no código (20/11):**
- `GET /api/almoxarifado/fila-separacao` (`routes/almoxarifado.js:4731`) → `requisitionService.listarFilaSeparacao`: a consulta das
  requisições lê `r.setor` (e devolve `setor`), **não** lê `r.projeto_id` (a coluna existe desde o `reqCols` do `schema.js:2760`; o detalhe
  da requisição já devolve `projeto_nome`). Cada item devolve `pegar_em` (`localizacao_codigo`, `caminho`) e `origem_separacao_codigo`.
- `FilaSeparacao.js` (342 linhas): mostra o setor junto do solicitante, sem filtro nem agrupamento (`grep -i agrup` → 0); o botão
  "Imprimir lista de coleta (todas)" imprime `requisicoesParaImprimir(fila)`.
- Fatia: o serviço acrescenta `projeto_id`/`projeto_nome` à requisição da fila (só leitura, sem motor, sem trava); a tela filtra no
  navegador o JSON já carregado (setor, projeto, localização de onde pegar), mantendo a ordem do servidor.

Régua: fatia do almoxarifado de tela com um campo novo na leitura (estimativa-de-tarefas, passo 3: ~45 min a 1h; as Etapas 253/254 de
2 itens mediram 0,6 h e 1,2 h) — três filtros + o campo do projeto + documentação: **1h15**.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Fila de separação com filtro por setor, projeto e localização | 1h15 | fatia de tela + leitura (E253 0,6 h; E254 1,2 h) | 1h15 | Etapa 255 (`2026-11-20-almoxarifado-etapa255-fila-separacao-filtros.md`) | fatia do almoxarifado (tela) | — | — | — |

## Medição no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-20 --ate 2026-11-21 --grupos "Filtros da fila=Etapa 255|filtros na Fila"
```
