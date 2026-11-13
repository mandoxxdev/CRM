# Estimativa 13/11/2026 — almoxarifado: a entrega não pré-escolhe a origem em lote impedido (C532) e a NC avisa o lote (C535)

Origem: "Próxima tarefa detalhada" do plano da Etapa 230 (`docs/superpowers/plans/2026-11-13-almoxarifado-etapa230-os-aberta-lote-impedido.md`);
o C535 vai junto por ser pequeno (pedido do André: emparelhar se o C532 for pequeno, total até 4 h).

Medido no código antes de estimar (sobre `1b20f920`):

- **C532, a janela.** `RequisicoesList.js`: a pré-seleção da entrega (`useEffect` em `:784-809`) põe `valorPlanejada(item)` sempre que a
  opção existe nas linhas de saldo — inclusive impedida (`opcaoImpedida`, `:175`); `opcaoDesabilitada` (`:211`) deixa a planejada da entrega
  escolhível (B1493). A frase da 226 (`fraseOpcaoImpedida`, `frasePlanejadaImpedida`) já existe. Sem servidor.
- **C532, o botão de um clique.** `handleConfirmarEntrega({ direto: true })` (`:1198`) monta sem origem e o servidor aplica a planejada;
  o detalhe (`routes/almoxarifado.js:4041`, `normalizarItem`) traz só `lote_separacao_codigo` — **não** a situação do lote. Para o botão
  saber antes do clique, o detalhe ganha a situação do lote da separação (aditivo, `predicadoLoteImpedidoSql` como as linhas de saldo da
  224) — ou a tela busca os saldos no clique. Decidir no plano (B).
- **C535.** `nonConformityService.decidirNaoConformidade` (`:1004-1016`) chama `aposLiberacaoSemFalhar` e devolve `liberacao`; o resultado
  da reserva já traz `lote_impedido: { id, codigo }` (`reservaChegadaService.js:636`, Etapa 229) — só não sai na resposta. A tela
  (`NaoConformidadesAlmoxarifado.js:350-368`) mostra `liberacao.mensagem`; a da inspeção (`InspecoesAlmoxarifado.js:294-297`) é o molde.
- Sem banco, sem trava nova, sem perfil. Celular (Etapa 24): sem entrega — medir no plano.

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | A entrega não pré-escolhe a origem num lote impedido; o botão de um clique avisa antes (C532) | 45 min | média (análise 30 min + teste 1 h) | 2h30 (2h15 arredondado) | 231 | 226 (mesma janela) mediu 0,7 h | — | — | — |
| 2 | A tela de Não Conformidades avisa que o lote continua impedido (C535) | 30 min | pequena com regra (análise 15 min + teste 30 min) | 1h15 | 231 | 229 T2 (a frase da Inspeções) ~10 min + chave na resposta | — | — | — |

Incerteza: baixa a média — o risco é a pré-seleção automática na entrega mudar o que vai ao servidor (`origem_automatica`) e o motivo da
troca aparecer.

Medição no fechamento:
```
--grupos "E231=Etapa 231|Estimativa: almoxarifado - entrega"
```
