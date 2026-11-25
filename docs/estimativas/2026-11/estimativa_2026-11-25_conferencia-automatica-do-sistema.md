# Estimativa 25/11/2026 — Conferência automática do cliente voltando a rodar inteira

Escolhida sozinho (regra "não pare" do CLAUDE.md) depois da rodada de movimento: a suíte Jest do cliente (`CI=true npx react-scripts test`)
falha em **9 de 251 suítes** com `SyntaxError: Cannot use import statement outside a module` em `node_modules/axios/index.js` (axios 1.x é
ESM; o Jest do react-scripts 5 não transforma `node_modules`). Quebram as suítes que importam um módulo que chega em `services/api.js` ou
`AuthContext.js` sem `jest.mock('../services/api')` (186 suítes mockam; 9 não). Medido na rodada completa de 25/11: 3213 testes passam,
9 suítes nem começam.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Conferência automática das telas voltando a rodar inteira | 30min | 30min | 30min | — (configuração do Jest em `client/package.json`) | Ajuste pontual (mínimo 30 min) | ~0,2 h (1 commit; o medidor dá ~10 min para commit isolado) | 15min | `fa1d7719` |

## Fechamento (25/11/2026)

Uma linha de configuração (`moduleNameMapper` em `client/package.json`): 9 suítes voltaram (104 testes), 251/251 e 3317 testes na rodada
completa. Realizado pelo medidor: 15min (arredondado para cima); estimado 30min — o mínimo da régua.

## Medir no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-25 --ate 2026-12-31 --grupos "Jest=[Jj]est|axios|[Cc]onferencia automatica"
```
