# Estimativa 24/11/2026 — Colunas simétricas na proposta em duas línguas

Pedido do Matheus (Comercial), 24/11/2026, com print da proposta em espanhol: *"Nesse caso aqui, que os espaços ficam diferentes na
tradução, tem que sempre forçar a ficar parecido ambos sabe? para dar simetria"*.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | As duas colunas terminam na mesma altura | 1h | 1h | 1h | `docs/superpowers/plans/2026-11-24-propostas-etapa1-proposta-bilingue.md` | Script no template + medição no navegador + teste (~45min-1h) | rateio de 0,4 h | 15min | `0bc9f116` |
| 2 | Página de apresentação maior, com a imagem | 30min | 30min | 30min | idem | Ajuste de CSS + script (~30min) | rateio de 0,4 h | 15min | `0bc9f116` |
| 3 | Assinaturas no fim do documento | 45min | 45min | 45min | idem | Defeito de template + teste (~45min) | rateio de 0,4 h | 15min | `b737fe0d` |
| 4 | Negritos como no modelo, também na tradução | 1h30 | 1h30 | 1h30 | idem | Modelo + template + memória de tradução (~1h30) | rateio de 0,4 h | 15min | `c8ef5543` |
| 5 | Termos que não se traduzem | 45min | 45min | 45min | idem | Glossário + limpeza da memória + modelo (~45min) | rateio de 0,4 h | 15min | `cc7d407e` |
| 6 | Editar os textos do Projeto Conceitual com a tradução acompanhando | 1h30 | 1h30 | 1h30 | idem | Editor + tradução após salvar (~1h30) | rateio de 0,4 h | 15min | `ada37734` |
| 7 | Cores e acabamento do documento | 45min | 45min | 45min | idem | CSS (~45min) | rateio de 0,4 h | 15min | `89186c1e`, `6cdbd928` |

**Revisado (24/11/2026):** chegaram no meio do trabalho, com prints — (2) *"aqui daria para ser maior, ficar mais estético"*; (3) *"as
assinaturas saíram bugadas"*; (4) *"e as partes de negrito tmb"*; (5) *"tire DWG versão 2010"* e *"a tradução de excel ficou sobresalir? não
faz sentido"*; (6) *"eu devo poder mudar todos os textos e depois ele traduz de forma simultânea"*; (7) *"imagens, cores diferentes,
negritos, tem que deixar mais estética a proposta"*.

## Como foi medido

- Cada par (`.bi-par`) é uma linha de grade: a altura é a da metade mais alta. Caminho: depois da paginação, reduzir a escala (`zoom`) da
  metade mais alta até caber na altura da outra, com piso de 85%. Só diminui altura: não cria transbordo de página.

## Fechamento (24/11/2026)

`horas.js` mediu **0,4 h** para os 7 commits de código — **por baixo**: os commits saíram por tarefa, mas a uns minutos um do outro no
relógio do git, e o medidor conta o intervalo entre commits. Realizado = rateio arredondado para cima (15min cada), como nas rodadas
anteriores do dia.

## Medir no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-24 --ate 2026-11-24 --grupos "R=colunas terminam|assinaturas inteiras|sem a caixa|nunca se traduzem|Negrito como|editar os paragrafos|cores que separam"
```
