# Estimativa 24/11/2026 — Capa da proposta de Projeto Conceitual

Continuação do modelo de contrato Projeto Conceitual (mesma data): a "próxima tarefa detalhada" do plano
`docs/superpowers/plans/2026-11-24-propostas-modelo-de-contrato-projeto-conceitual.md`, pedida pelo Matheus.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Capa de serviços e sem a tabela FINAME no Projeto Conceitual | 1h | 1h | 1h | plano acima, seção "O que fica de fora" | Tarefa anterior do mesmo porte (modelo de contrato, 0,7 h medida hoje) | 0,1 h | 30min | `4de32918`, `29ba440e` |

Fechamento (24/11/2026): `horas.js --grupos "Capa=[Cc]apa"` mediu **0,1 h** — por baixo: o intervalo entre o commit da estimativa e o do
código passou do limite de sessão do medidor (as rodadas do teste sobem o servidor duas vezes, mais de 60 s cada, nesta pasta do
OneDrive), e ele contou o trecho como sessão nova. Realizado informado pelo mínimo da regra (30min), sem somar parte fixa. Se o
medidor continuar cortando assim nesta máquina, a régua do passo 2 da skill precisa de nota.

## Como foi medido

- Tamanho: `carregarVariaveisDasFamilias` (`server/index.js`) passa a levar o modelo de contrato de cada família; o template
  (`propostaPremiumV2.js`) ganha a regra "proposta inteira de um modelo de serviço" ao lado da de peças, que já decide capa e FINAME.
  Sem coluna nova, sem tela nova. Teste no molde de `propostaCapaTituloPecas.test.js`.

## Medir no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-24 --ate 2026-11-24 --grupos "Capa=[Cc]apa.*[Pp]rojeto [Cc]onceitual|[Pp]rojeto [Cc]onceitual.*[Cc]apa"
```
