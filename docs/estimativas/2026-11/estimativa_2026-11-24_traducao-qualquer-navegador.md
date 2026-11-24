# Estimativa 24/11/2026 — Tradução da proposta em qualquer navegador

Pedido do Matheus (Comercial), 24/11/2026, com print do aviso *"A tradução automática não rodou (precisa do Chrome atualizado)"*:
*"erro na tradução, deve funcionar em qualquer navegador"*.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Tradução automática em qualquer navegador | 1h30 | 1h30 | 1h30 | `docs/superpowers/plans/2026-11-24-propostas-etapa1-proposta-bilingue.md` | Rota nova + troca do tradutor na tela + testes (~1h a 1h30) | — | — | — |

## Como foi medido

- O tradutor do Chrome (`Translator`) só existe no Chrome 138+ de desktop. Caminho: o servidor traduz pelo endpoint público gratuito do
  Google Tradutor (`translate.googleapis.com/translate_a/t?client=gtx`, sem chave), em lote. Testado em 24/11/2026: devolve as fichas
  `⟦n⟧` do glossário intactas, em inglês e espanhol. O modelo local no servidor continua descartado (não roda no Alpine da produção).

## Medir no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-24 --ate 2026-11-24 --grupos "Traducao=[Tt]radu"
```
