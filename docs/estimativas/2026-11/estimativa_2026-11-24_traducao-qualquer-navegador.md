# Estimativa 24/11/2026 — Tradução da proposta em qualquer navegador

Pedido do Matheus (Comercial), 24/11/2026, com print do aviso *"A tradução automática não rodou (precisa do Chrome atualizado)"*:
*"erro na tradução, deve funcionar em qualquer navegador"*.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Tradução automática em qualquer navegador | 1h30 | 1h30 | 1h30 | `docs/superpowers/plans/2026-11-24-propostas-etapa1-proposta-bilingue.md` | Rota nova + troca do tradutor na tela + testes (~1h a 1h30) | ~14min (`0a688197` + `a9fab2fb`) | 15min | `a9fab2fb` |
| 2 | Espaçamento da proposta em duas colunas igual ao da proposta em português | 45min | 45min | 45min | idem | Ajuste de CSS medido no navegador (~30-45min) | ~3min | 15min | `749b0fc6` |

**Revisado (24/11/2026):** (2) chegou no meio do trabalho, com print: *"Os espaçamentos estão errados ainda"*.

## Como foi medido

- O tradutor do Chrome (`Translator`) só existe no Chrome 138+ de desktop. Caminho: o servidor traduz pelo endpoint público gratuito do
  Google Tradutor (`translate.googleapis.com/translate_a/t?client=gtx`, sem chave), em lote. Testado em 24/11/2026: devolve as fichas
  `⟦n⟧` do glossário intactas, em inglês e espanhol. O modelo local no servidor continua descartado (não roda no Alpine da produção).

## Fechamento (24/11/2026)

`horas.js` mediu ~17min para as duas tarefas (commits a cada tarefa, desta vez). O medidor conta o intervalo entre commits e fica
**por baixo** quando o trabalho começa longe do commit anterior; realizado arredondado para cima (15min cada).

## Medir no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-24 --ate 2026-11-24 --grupos "Traducao=qualquer navegador;Espaco=espacamento igual"
```
