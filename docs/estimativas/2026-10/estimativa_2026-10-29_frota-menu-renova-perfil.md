# Estimativa 2026-10-29 — Frota: C22, o painel renova o menu quando o perfil muda

Item 2(b) da "Próxima tarefa detalhada" do plano da Etapa 9. Medido no código antes de estimar: `GET /frotas/dashboard` tem cache
**compartilhado** de servidor (`dashboardCache` em `server/routes/frotas.js`) — o `perfil` tem de entrar por fora do cache; no cliente o
painel (`fetchFrotasDashboard`, `client/src/utils/frotasApi.js`, também com cache) recebe a mesma comparação que o portal já faz
(`FrotasPortalMotorista.js`, Fase5-2 da Etapa 2: `perfil` do servidor ≠ `perfilFrota(usuário)` → `refreshUser()` uma vez).

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Menu acompanha a troca de perfil (C22) | 1h | ×2,5 (perfil) + 30 min | 3h | avulso (backlog 2b) | mudança pequena com regra (~1 h) | ~22 min | 2h30 | `1b5d087d`, `5d4fbba3` |

Medição no fechamento:
```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-10-29 --ate 2026-10-30 --grupos "C22=C22|menu .*perfil"
```

## Fechamento (2026-10-29)

Execução medida ~22 min (`1b5d087d` 21, `5d4fbba3` 1), arredondada para 30 min. Parte do André **não informada**: usada a estimada (2 h).
Realizado = 2h30 (estimado 3h). O que ficou de fora: as outras telas do gestor ainda só mudam o menu ao abrir o Painel ou recarregar.
