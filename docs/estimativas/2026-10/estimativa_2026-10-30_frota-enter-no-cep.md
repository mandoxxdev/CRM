# Estimativa 2026-10-30 — Frota: Enter no CEP da tela Destinos busca

Achado ao tirar os prints do relatório semanal (30/10): em **Frota → Destinos → Novo Destino**, CEP digitado + Enter enviou o formulário e
o toast *"Informe a rua (logradouro) do destino"*. Era decisão da Fase 5 da Etapa 9 (F2): `enterBusca` só no "+ Novo destino"; na tela
Destinos o Enter "segue enviando o formulário do destino" (teste `Fase5-F2 metade negativa`, `FrotasEnderecoDestino.test.js:529`).
Muda só no campo CEP; nos outros campos o Enter continua salvando.

| # | Tarefa | Porte | Análise | Execução | Teste e conferência | Informado | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Enter no CEP busca na tela Destinos | ajuste pontual de tela | 15 min | 15 min | 15 min | 45 min | — | — | — |

Medição no fechamento:
```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-10-30 --ate 2026-10-31 --grupos "Enter no CEP=Enter no CEP"
```
