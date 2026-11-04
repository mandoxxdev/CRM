# Estimativa 2026-11-04 — Compras → Materiais com a lista igual à antiga do Almoxarifado

Pedido do André (04/11): "Por que a tela de materiais do compras ficou diferente do que era no almoxarifado? Era pra ser uma
migração de tela de lugar, nao uma tela diferente".

Medido: a lista do Compras (`client/src/components/compras/MateriaisCompras.js`, Etapa 192 `bcbd4ed2`) foi escrita do zero, com 6
colunas (Código, Material, Família, Unidade, NCM, Ações) e só busca + situação. A antiga do Almoxarifado
(`MateriaisAlmoxarifado.js` antes de `d08fe42d`) tinha Foto, Código, Material (selo do proprietário + fornecedor), Família, Categoria,
Quantidade (barra, mín/máx), Localização, Status, e filtros de categoria, família (árvore) e status. O servidor já devolve tudo: o
`GET /api/compras/materiais/cadastro` é o mesmo handler `listarMateriais` do Almoxarifado. Correção quase só de tela.

Decisão (reversível, letra B do Compras): os botões de estoque (entrada/saída rápida, requisitar, extrato, mapa, etiqueta, plano de
inspeção) ficam no Almoxarifado — o pedido 7 da Etapa 193 diz "almoxarifado só visualiza e libera" e o perfil COMPRAS não movimenta.
Anexos: medir se a rota alcança o comprador sem o módulo Almoxarifado.

| # | Tarefa | Porte | Análise | Execução | Teste e conferência | Informado | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Lista do Compras igual à do Almoxarifado | média (uma tela) | 30 min | 1h30 | 1h | 3h | — | — | — |

Medição no fechamento:
```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-04 --ate 2026-11-07 --grupos "Materiais Compras=Materiais.*Compras|Compras.*Materiais"
```
