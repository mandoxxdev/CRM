# Estimativa 25/11/2026 — foto do fornecedor e campos do cadastro de material

Pedido do Andre (25/11), com prioridade sobre os itens 8 a 22 da estimativa de 23/11. O item 2 substitui os itens 23 (Aplicacao) e,
em parte, 25 (Especificacoes; a Descricao entra, Observacoes fica) da estimativa de 23/11 — estes deixam de "depender de resposta".

Regua: horas.js (tempo medido, sem parte fixa). Fatias de tela da semana mediram 30 min cada (Etapas 260-262).

| # | Tarefa | Execucao estimada | Informado | Etapa/plano | Medido antes | Execucao medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|
| 1 | Foto do fornecedor | 1h | 1h | Etapa 263 | coluna `fornecedores.foto` ja existe (ALTERS_FORNECEDORES, `server/index.js`); `FornecedorForm.js` nao usa; molde: foto do material (`MaterialAlmoxarifadoForm.js`) | — | — | — |
| 2 | Tirar Aplicacao, Especificacoes Tecnicas e Descricao do cadastro de material | 1h | 1h | Etapa 263 | `MaterialAlmoxarifadoForm.js:741` (Descricao), `:971` (Aplicacao), `:976` (Especificacoes); colunas ficam; texto antigo so leitura | — | — | — |

Linha para medir: `--grupos "Foto do fornecedor=foto do fornecedor|Etapa 263.*fornecedor;Campos do material=Aplicacao|Especificacoes|campos do cadastro de material"`
