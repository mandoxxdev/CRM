# Estimativa 25/11/2026 — Aplicativo do celular mais limpo

Pedido do Matheus (Comercial), 25/11/2026, com imagem de referência (app de café: cartões arredondados com foto, pílulas de categoria,
barra inferior flutuante): *"Tem que repassar o front end do app para celular, olha esse modelo que clean"*.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Visual do aplicativo no celular | 4h | 4h | 4h | — | Repaginação de CSS do shell e das telas principais com prints antes/depois (~3h-4h) | — | — | — |

## Como foi medido

- O celular já tem barra de topo (`mobile-topbar`), barra inferior (`BarraInferiorMobile`) e gaveta; o estilo está espalhado em
  `mobile-app.css`, `app-glass.css` (2.296 linhas), `apple-*.css`. A referência é de estilo (limpo, arredondado, respiro), não de cor:
  a marca GMP fica.

## Medir no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-25 --ate 2026-11-25 --grupos "C=[Cc]elular"
```
