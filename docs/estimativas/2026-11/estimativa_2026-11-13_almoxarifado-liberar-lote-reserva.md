# Estimativa 13/11/2026 — almoxarifado: liberar o lote reserva para quem esperava (C480 + C523)

Origem: "Próxima tarefa detalhada" do plano da Etapa 219 (`docs/superpowers/plans/2026-11-13-almoxarifado-etapa219-*.md`).

Medido no código antes de estimar (sobre `d772cd43`): os três escritores do status do lote moram em `lotService.js`
(`mudarStatusLote` `:289`, `liberarBloqueioPorCertificado` `:331`, `liberarVencimento` `:367`) e só as rotas os chamam
(`extended.js:1317`, `:1369`; `almoxarifado.js:1331`) — nenhum chamador de dentro de outra seção da trava. O molde da trava é
`corrigirValidadeDoLote` (`:491`, `naTravaDoMaterial`). A distribuição já existe: `reservaChegadaService.reservarLiberacaoParaQuemEspera`
(`:589`, `opcoes.sobTrava` + `pendencia`, `concluirPendencia` fora da seção) com o miolo `distribuirSemLock` que já desconta o lote
impedido (B1453). O livre do lote sai de `retidoDoLote.situacaoDosLotes`. Sem migration. A fatia visível: a resposta das três
rotas diz quantas peças foram reservadas e a tela **Lotes e Séries** mostra isso na mensagem de sucesso.

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Liberar o lote reserva para quem esperava, e mudar a situação do lote espera a fila do material (C480 + C523) | 1h | estoque/saldo, travas (análise 1h + teste 2h) | 4h | 220 | Etapa 219 (mesma porta, teto trocado em pontos centralizados) mediu ~1 h; 218 ~1,2 h; 217 ~1,1 h. Esta reaproveita a porta da 75 e o molde de trava da 191 | 1,4 h (horas.js --grupos "E220=…", 13/11) → 1h30 | 4h30 (1h30 + análise 1 h + teste 2 h, da tabela — não informado pelo André). 30 min acima: a Fase 5 achou a 4ª porta (corrigir a validade) e a suíte inteira, dois testes antigos que fixavam o comportamento de antes; a verificação rodou a suíte do servidor duas vezes (~31 min no último commit) | 0c07e6d4, b33a6960, 7a428526, a04b43e8, f03abccf, 6c80f908, bf8769e9, 52148fd0, fd38dc1c e este |

Incerteza: a execução pode passar de 1h se a corrida (bloquear no meio da reserva) pedir mais de um gancho para ser provada; a sonda da
revisão da 219 é o vermelho pronto. Não foi quebrada em duas partes: a trava dos três escritores é pré-requisito da distribuição sob a
trava (a liberação só pode distribuir dentro da seção que muda o status), e o bloqueio é a mesma função (`mudarStatusLote`).

Medição no fechamento:
```
--grupos "E220=Etapa 220|Estimativa: almoxarifado - liberar o lote"
```

A régua do passo 2: execução estimada 1h, medida 1,4 h — o excesso foi da revisão (4ª porta, 3 lacunas de teste) e da suíte rodada duas
vezes, não do código. Para etapas do motor com Fase 5 que acha porta nova, 1h15 a 1h30 de execução é a medida mais honesta.
