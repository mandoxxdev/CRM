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
| 1 | CPF no fornecedor | 1h30 | ×2 + 30 min | 3h30 | avulso | etapa média (campo + validação + busca + documento) | ~proporcional (ver abaixo) | 2h30 | `ad99f567`, Fase 5 `ef5ca142` `3a293902` |
| 2 | Fornecedor em maiúsculas | 1h | ×2 + 30 min | 2h30 | avulso | mudança pequena com regra | ~proporcional (ver abaixo) | 2h | `e8bd4374`, Fase 5 `3be6487d` |
| 3 | Voltar no topo (Frota) | 30 min | ×2,5 + 30 min (celular) | 2h | avulso | ajuste pontual de tela | ~proporcional (ver abaixo) | 2h | `79aad18f`, `19d26c6c` |
| 4 | OS digitada no pedido | 1h30 | ×2 + 30 min | 3h30 | avulso | etapa média | ~proporcional (ver abaixo) | 2h30 | `003a73fb`, Fase 5 `18b1bfc4` |
| 5 | NCM/peso preenchidos | 30 min | ×2 + 30 min | 1h30 | avulso | ajuste pontual | ~proporcional (ver abaixo) | 1h30 | `3235fdbe` |
| 6 | Materiais no Compras | 1h30 | ×2 + 30 min | 3h30 | avulso | etapa média | ~proporcional (ver abaixo) | 2h30 | `bcbd4ed2`, `8c1db785`, Fase 5 `2acd4dcc` |
| 7 | Acesso do Compras aos materiais | 1h | ×2,5 + 1h (perfil + decisão) | 3h30 | avulso | mudança pequena com regra | ~proporcional (ver abaixo) | 3h | `950c70d8`, Fase 5 `7b2143fd` |
| 8 | Planejamento várias OS | 30 min | ×2 + 30 min | 1h30 | plano de planejamento | — | ~proporcional (ver abaixo) | 1h30 | `633efbd4` |

Medição no fechamento (os commits citam o assunto):
```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-10-30 --ate 2026-10-31 --grupos "CPF=CPF;Maiusculas=maiuscula;Voltar=Voltar no topo;OS digitada=OS digitada;NCM=NCM;Materiais=materiais no Compras;Acesso=acesso do Compras;Varias OS=varias OS"
```

## Fechamento (2026-10-30)

Execução medida (`horas.js --desde 2026-10-30 --ate 2026-10-31`): **~2,6 h** no total (1 sessão, 19 commits). A medida **por commit não
separa as tarefas**: três galhos rodaram em paralelo em worktrees, então o tempo de cada um aparece comprimido no intervalo entre commits
da `main` (ex.: `003a73fb` ~1 min, `3235fdbe` ~0 min). Por isso a execução de cada tarefa foi **rateada** pela execução estimada
(2,6 h ÷ 8 h = 0,325 da estimada), somada à parte do André **estimada** (ele não informou a dele) e arredondada para cima em 30 min.
A Fase 5 (6 correções + 13 testes da revisão) está dentro dos itens 1, 2, 4, 6 e 7.

Realizado total: **17h30** contra 21h30 estimadas.

## Recalculo pela regua nova (2026-10-30, depois do fechamento)

O André perguntou se o tempo ficou inflado. Ficou, cerca do dobro: a execucao estimada (8 h) foi ~3x a medida (2,6 h, pacote em
paralelo) e a formula da epoca (execucao x 2 + 30 min) multiplicou o excesso — e o "realizado" herdou a parte do André estimada por ela.
Pela tabela nova da skill (parte do André fixa pelo porte), o mesmo pacote fica:

| # | Tarefa | Execucao (rateada) | Analise | Teste e conferencia | Total |
|---|---|---|---|---|---|
| 1 | CPF no fornecedor | 30 min | 30 min | 1h30 (documento impresso) | 2h30 |
| 2 | Maiusculas | 20 min | 15 min | 30 min | 1h15 |
| 3 | Voltar no topo | 10 min | 15 min | 45 min (celular) | 1h15 |
| 4 | OS digitada | 30 min | 30 min | 1h30 (documento impresso) | 2h30 |
| 5 | NCM/peso | 10 min | 15 min | 15 min | 45 min |
| 6 | Materiais no Compras | 30 min | 30 min | 1 h | 2h |
| 7 | Acesso do Compras | 20 min | 45 min (decisao) | 1 h (perfil) | 2h15 |
| 8 | Planejamento varias OS | 10 min | 15 min | 15 min | 45 min |
| | **Total** | | | | **13h15** |

Os .txt (estimativa e conclusao) foram refeitos com estes tempos a pedido do André: ainda nao tinham sido enviados. Estimado = realizado porque os dois saem do mesmo recalculo, feito depois da execucao.
