# Estimativa 20/11/2026 — a exclusão da requisição devolve às prateleiras de onde a entrega tirou (D (257) 2) (1h15)

Etapa 259, item único. É a "próxima tarefa detalhada" (item 2) do plano da Etapa 258. Os itens 24-26 da estimativa de 18/11 continuam
esperando resposta e não entram aqui.

**Medido (20/11), sonda executada sobre o HEAD `508eb9c9` (`scratchpad/sab-259-sonda.js`, pela rota `DELETE /requisicoes/:id`):**
- Padrão *A* 3, *B* 5; separação e entrega de 6 (*A* 0, *B* 2); **excluir → *A* 6, *B* 2** (certo: *A* 3, *B* 5). Total 8 (certo).
- Padrão *P* vazia, *A* 4, *B* 4; entrega de 6 (*A* 0, *B* 2); **excluir → *P* 6, *A* 0, *B* 2** (certo: *A* 4, *B* 4).
- Causa: `excluirSemTrava` (`requisitionService.js` ~3407) monta uma parte por saída da entrega com destino = origem do livro (se aceita) ou
  a padrão, e credita por uma ENTRADA. O registro das linhas que a saída baixou existe desde a 257 (`ajuste_linhas_drenadas_almoxarifado`).

Régua: Etapas 256, 257 e 258 (mesma família: devolução às prateleiras no motor, Fase 2 e Fase 5 com sonda) mediram 0,8 h, 0,9 h e 1,5 h
pelo `horas.js`; esta mexe só na exclusão (o registro já existe), com séries e lote: **1h15**.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Excluir uma requisição já entregue devolve cada peça à prateleira de onde saiu | 1h15 | motor/estorno (E256 0,8 h; E257 0,9 h; E258 1,5 h) | 1h15 | Etapa 259 (`2026-11-20-almoxarifado-etapa259-exclusao-devolve-prateleira.md`) | fatia do almoxarifado no motor | 0,8 h | 1h | `665745a7`, `14a1e757`, `e1f4dc82`, `8b5de9df`, `d2d7943b`, `1bdba01f` |

## Medição no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-20 --ate 2026-11-21 --grupos "Exclusao devolve prateleira=Etapa 259|Estimativa: exclusao da requisicao devolve"
```

Medido em 23/11 (o fechamento caiu na sessao de 20/11 e foi concluido em 23/11): `horas.js --grupos "Etapa 259=Etapa 259|exclusao da requisicao devolve" --desde 2026-11-20 --ate 2026-11-23` → **Etapa 259: 0.8 h** → realizado **1h** (arredondado para cima). Dentro da estimativa (1h15).
