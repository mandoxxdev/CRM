# Estimativa 13/11/2026 — almoxarifado: a devolução ao cliente de material com série confere e grava o lote das séries (D (233) 3)

Origem: "Próxima tarefa detalhada" do plano da Etapa 234 (`docs/superpowers/plans/2026-11-13-almoxarifado-etapa234-saida-avulsa-lote-das-series.md`,
`:176-197`). Teto pedido: 2h30.

Medido no código antes de estimar (sobre `c6e50dca`):

- **Sonda executada** (`createTestApp`, rota real `POST /materiais-cliente/devolucoes`, script no scratchpad): material de cliente com série e
  sem controle de lote, A1 em L1 e B1 em L2. Devolução `[B1]` com o lote em branco → 201, livro `lote_id` NULL, linha "sem lote" −1,
  `/lotes/resumo` `{ fisico: 1, soma_lotes: 2, sem_lote_atribuido: -1 }`. Com o L2 **BLOQUEADO** → 201 igual (a série de lote bloqueado sai).
  `[A1, B1]` → 201, "sem lote" −2 (lotes diferentes passam).
- **A tela não tem seletor de série nem de lote** (`MateriaisClienteAlmoxarifado.js:84-86` manda só `material_id`, `quantidade`,
  `documento_devolucao`). Sonda: sem `serie_ids` → 400 *"material com controle de serie: informe 1 serie(s)…"* — material de cliente com série
  **não é devolvível pela tela hoje**. O comentário da rota (`extended.js:984-985`, "a tela da Task 8 oferece seletor de lote e de serie") está
  errado. Material com controle de lote → 400 *"exige lote"* (também sem saída pela tela; fica de fora, declarado).
- `DEVOLUCAO_CLIENTE` está em `TIPOS_SAIDA` (a derivação e a guarda valem) e **não** em `tiposDescarte` (lote vencido barra, igual ao lote
  escolhido hoje).
- `GET /materiais-cliente/posicao` não traz `controle_serie`/`controle_lote` (a tela precisa saber se pede série).
- Servidor: declarar `lotePelasSeries: true` na rota traz a guarda (233), a derivação com cobertura (234) e a recusa de lotes diferentes. Tela:
  lista de séries `EM_ESTOQUE` (`GET /materiais/:id/series`, já existe) no modal e a frase do lote (`fraseDoLoteDasSeries`, extrair para `utils`).

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | A devolução ao cliente escolhe as séries e grava o lote delas (rota declara `lotePelasSeries`; modal com séries + frase do lote) (D (233) 3) | 1 h | média (análise 30 min + teste 1 h) | 2h30 | 235 | 234 (servidor + tela, mesma régua) mediu 0,8 h; aqui o servidor é uma opção e a tela ganha um seletor | — | — | — |

Incerteza: baixa no servidor (a régua já existe no motor); média na tela (seletor novo no modal).

Medição no fechamento:
```
--grupos "E235=Etapa 235|Estimativa: almoxarifado - devolucao ao cliente"
```
