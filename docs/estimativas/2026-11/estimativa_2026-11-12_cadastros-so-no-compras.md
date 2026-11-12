# Estimativa 12/11/2026 — cadastros só no Compras

Pedido da compradora (12/11/2026), repassado pelo André: o Almoxarifado não faz nenhum cadastro; só consulta pedidos, registra a
entrada (baixando o pedido), libera e registra a saída. Todo cadastro ligado a compras fica no Compras. A regra está escrita em
`CLAUDE.md` ("Divisão Compras × Almoxarifado") e nos mapas `specs/modulo-compras/README.md` e `specs/modulo-almoxarifado/README.md`.

Medido: o cadastro de material já é só do Compras desde a Etapa 193 (portas `/api/compras/materiais/...`, `portaCompras`). As
famílias gravam só por `/api/almoxarifado/familias` (POST/PUT/DELETE, `server/routes/almoxarifado.js:3003`, `:3076`, `:3373`) com o
perfil `configurar` do almoxarifado; o Compras só lê (`/api/compras/materiais/aux/familias`). Categorias (`extended.js:239..288`) e
Tipos de Material (`almoxarifado.js:2307..2358`) idem. A aba Famílias já tem modo somente leitura (Etapa 125, C259) — reaproveitável.

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Famílias e subfamílias no Compras | 1h30 | várias telas (30 + 1h30) + permissão (+30) | 4h | — | Etapa 193 (material só no Compras), mesmo molde | — | — | — |
| 2 | Categorias e Tipos de Material no Compras | 1h | média (30 + 1h) + permissão (+30) | 3h | — | idem, duas listas pequenas | — | — | — |

Pontos de atenção para o plano: os Tipos de Material carregam as marcas de EPI (`is_epi`, `requer_assinatura`, `requer_termo`) que a
entrega de EPI do almoxarifado usa — mudam só de quem cadastra, não de comportamento. A estimativa anterior do mesmo dia
(`estimativa_2026-11-12_cadastro-de-material-fornecedores`, item 1) passa a apontar a lista de Tipos de Material para o Compras, sem
mudar o tempo.

Medição no fechamento:
```
--grupos "Familias no Compras=familias.*compras|compras.*familias;Categorias e tipos no Compras=categorias|tipos de material"
```
