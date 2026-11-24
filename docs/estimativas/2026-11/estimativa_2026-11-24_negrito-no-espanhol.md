# Estimativa 24/11/2026 — Negrito na tradução da proposta

Pedido do Matheus (Comercial), 24/11/2026, com print da proposta em espanhol: *"assim ficou muito show, mas cadê o negrito na versão em
esp"*.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Negrito também na coluna traduzida | 1h | 1h | 1h | `docs/superpowers/plans/2026-11-24-propostas-etapa1-proposta-bilingue.md` | Correção de cliente + servidor + testes (~1h) | ~5min | 15min | `d4183892` |
| 2 | Nota legal na proposta em outra língua | 30min | 30min | 30min | idem | Bloco no template + teste (~30min) | ~2min | 15min | `38b8c821` |

**Revisado (24/11/2026):** (2) chegou no meio do trabalho: *"sempre que for em outro idioma, tem que aparecer uma nota legal de que a
versão que vale é a em PTBR, mas isso só deve aparecer quando fazemos a proposta em outras línguas"*.

## Como foi medido

- Reproduzido com o serviço de tradução de verdade (`c8ef5543` só tinha sido testado com tradução falsa): o trecho traduzido SOZINHO sai
  diferente do mesmo trecho dentro da frase ("PROJETO CONCEITUAL" -> "DISEÑO CONCEPTUAL" sozinho, "PROYECTO CONCEPTUAL" na frase;
  "Excelência Operacional" -> "Excelencia operativa"), e a busca do negrito dentro da frase traduzida não acha.

## Fechamento (24/11/2026)

`horas.js` mediu **0,1 h** (por baixo: os commits saíram a minutos um do outro). Realizado arredondado para cima, 15min cada.

## Medir no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-24 --ate 2026-11-24 --grupos "N=frase vai marcada|nota legal de que"
```
