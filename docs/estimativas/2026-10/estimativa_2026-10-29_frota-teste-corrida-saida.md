# Estimativa 2026-10-29 — Frota: teste de corrida da saída sem `sleep`

Item 2(a) da "Próxima tarefa detalhada" do plano da Etapa 9 (`docs/superpowers/plans/2026-10-29-frotas-etapa9-endereco-do-destino.md`),
herdado da Etapa 8 (A9): os dois testes de corrida de `server/tests/api/frotasSaidaCondutor.api.test.js` (RN-F8.19 e RN-F8.31 "desativado
no meio") esperam 150 ms para supor que a saída já está na fila.

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Teste de corrida da saída sem pausa fixa | 30 min | ×2 + 30 min | 1h30 | avulso (backlog 2a) | ajuste pontual | ~30 min | 1h30 | `b5d77cd7` + docs |

Medição no fechamento:
```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-10-29 --ate 2026-10-29 --grupos "Corrida=corrida da saida"
```

## Fechamento (2026-10-29)

Execução medida ~24 min (`b5d77cd7`) + a documentação (alguns minutos) ≈ 30 min. Parte do André **não informada**: usada a estimada (1 h).
Realizado = 1h30, igual ao estimado.
