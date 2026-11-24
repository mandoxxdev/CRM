# Estimativa 24/11/2026 — Proposta bilíngue (PT-BR + inglês/espanhol), moeda e incoterm

Pedido do Matheus (Comercial), 24/11/2026: propostas para fora do Brasil, em várias línguas (preferência inglês e espanhol), em
duas colunas — versão principal em PT-BR e a outra língua ao lado. Decisões dele, na conversa: (1) o vendedor digita em português e a
tradução sobe sozinha, **sem API paga e sem custo**; depois, *"faça algo simples"*; (2) **tudo em duas colunas**, inclusive tabelas e
capa; (3) **moeda e incoterm** entram nesta etapa.

Spike feito antes de estimar (24/11/2026, pasta temporária, apagada): modelo OPUS-MT local (transformers.js) — qualidade boa no geral
mas inverte CONTRATANTE→"CONTRACTOR", ~5 s por frase, ~1 GB de memória e **não roda no Alpine** do Docker de produção (no Node só há
o backend nativo; `device: 'wasm'` é recusado). Descartado. Caminho escolhido: o **Translator API do próprio Chrome** (no PC do
vendedor, grátis, sem servidor), com memória de tradução no servidor e glossário para os termos de contrato. Confirmado que o
`Translator` existe no Chrome 156; a ativação exige gesto do usuário na primeira vez (não testada aqui).

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Idioma, moeda e incoterm na proposta | 1h | 1h | 1h | `docs/superpowers/plans/2026-11-24-propostas-etapa1-proposta-bilingue.md` | Campo + tela + gravação (~1h) | — | — | — |
| 2 | Textos fixos do documento em inglês e espanhol | 1h30 | 1h30 | 1h30 | idem | Template + dicionário (~1h a 1h30) | — | — | — |
| 3 | Duas colunas — capa, textos e cláusulas | 2h | 2h | 2h | idem | Paginação do template (risco: o paginador mede bloco por bloco) | — | — | — |
| 4 | Duas colunas — tabelas | 2h | 2h | 2h | idem | idem | — | — | — |
| 5 | Tradução automática (Chrome) com memória e correção | 2h | 2h | 2h | idem | Rota + tabela + front no preview | — | — | — |
| 6 | Moeda e incoterm na tabela de preços | 1h30 | 1h30 | 1h30 | idem | Template + regra de FINAME | — | — | — |

## Medir no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-24 --ate 2026-12-31 --grupos "Bilingue=[Bb]il[ií]ngue|[Ii]dioma|[Ii]ncoterm|[Mm]oeda da proposta|[Tt]radu"
```
