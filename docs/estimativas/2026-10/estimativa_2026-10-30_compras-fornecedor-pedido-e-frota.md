# Estimativa 2026-10-30 — Compras (fornecedor, pedido, materiais) e Frota (Voltar no topo)

Pedido do André de 30/10 com 7 itens. O item 7 dele (várias OS no mesmo pedido) virou só planejamento
(item 8 abaixo): medido no código, `pedidos_compra.os_id` é lido pelo recebimento para reservar o material
para a OS (`services/almoxarifado/reservaDaOs.js`, `receiptService.js`), pelo encerramento da OS
(`osEncerradaService.js`) e pela trava de exclusão da OS (`server/index.js`) — mexer nisso é mexer no motor
do almoxarifado, que está pausado. O plano com o esforço fica em
`docs/superpowers/plans/2026-10-30-compras-varias-os-no-pedido-planejamento.md`.

Medido antes de estimar:
- 1 e 2: `client/src/components/compras/FornecedorFicha.js` (369 linhas, CNPJ com busca), `server/routes/compras/fornecedores.js`.
- 3: `client/src/components/frotas/FrotasPortalMotorista.js` — `RegistroForm` (saída e retorno) e `AbastecimentoForm` têm o Voltar só no fim (linhas 559 e 661).
- 4: `PedidoCompraForm.js` (select de OS em `/compras/aux/ordens-servico`), `pedidoCompraService.js` (`os_id`), `pedidoDocumentoHtml.js`.
- 5: o print é do **Pedido de Compra**, detalhe do item ("IPI, NCM, peso e observação"). `GET /compras/materiais` devolve só `id, codigo, descricao, unidade`, então o NCM e o peso nascem vazios na criação (o servidor completa só ao salvar).
- 6 e 7: `POST/PUT /api/almoxarifado/materiais` exigem `criar_material`/`editar_material` = ADMINISTRADOR, ALMOXARIFE, ENGENHARIA; o prefixo `/api/almoxarifado` exige o módulo almoxarifado, que o comprador pode não ter (já documentado em `routes/compras.js`, Etapa 38).

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | CPF no fornecedor | 1h30 | ×2 + 30 min | 3h30 | avulso | etapa média (campo + validação + busca + documento) | — | — | — |
| 2 | Fornecedor em maiúsculas | 1h | ×2 + 30 min | 2h30 | avulso | mudança pequena com regra | — | — | — |
| 3 | Voltar no topo (Frota) | 30 min | ×2,5 + 30 min (celular) | 2h | avulso | ajuste pontual de tela | — | — | — |
| 4 | OS digitada no pedido | 1h30 | ×2 + 30 min | 3h30 | avulso | etapa média | — | — | — |
| 5 | NCM/peso preenchidos | 30 min | ×2 + 30 min | 1h30 | avulso | ajuste pontual | — | — | — |
| 6 | Materiais no Compras | 1h30 | ×2 + 30 min | 3h30 | avulso | etapa média | — | — | — |
| 7 | Acesso do Compras aos materiais | 1h | ×2,5 + 1h (perfil + decisão) | 3h30 | avulso | mudança pequena com regra | — | — | — |
| 8 | Planejamento várias OS | 30 min | ×2 + 30 min | 1h30 | plano de planejamento | — | — | — | — |

Medição no fechamento (os commits citam o assunto):
```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-10-30 --ate 2026-10-31 --grupos "CPF=CPF;Maiusculas=maiuscula;Voltar=Voltar no topo;OS digitada=OS digitada;NCM=NCM;Materiais=materiais no Compras;Acesso=acesso do Compras;Varias OS=varias OS"
```
