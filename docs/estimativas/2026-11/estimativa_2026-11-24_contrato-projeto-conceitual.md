# Estimativa 24/11/2026 — Contrato do Projeto Conceitual

Pedido do Matheus (Comercial), 24/11/2026: acrescentar o modelo de contrato "Projeto Conceitual" na lista
"Modelo de contrato" do cadastro de família, com o contrato do documento
`G&A Orçamento - Projeto Conceitual_rev00.docx` (proposta 01260930/R00).

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Modelo de contrato Projeto Conceitual | 1h30 | 1h30 | 1h30 | Propostas — modelo de contrato por família (mesmo molde do "Hélices e Discos", `server/clausulasHelices.js`) | Alteração de cadastro (~1h a 1h30), arredondada para cima pela transcrição das cláusulas e o teste do encaixe no template | 0,7 h | 45min | `b62fd5c5`, `a6bdd09b` |

Fechamento (24/11/2026): `horas.js --grupos` mediu 0,7 h. Abaixo do estimado: o encaixe no template seguiu o molde do de hélices sem
mudar o template. O `horas.js` mede pelo intervalo entre commits e não conta a espera das subidas do servidor nos testes (mais de 60 s
cada, nesta pasta do OneDrive).

## Como foi medido

- Tamanho: um arquivo de cláusulas novo (molde `clausulasHelices.js`), uma linha no `semearModelosClausulas`
  de `server/index.js`, teste do encaixe das cláusulas nos slots do template (intro 1-3, preço pelo título,
  consideração final na página de assinatura). Sem coluna nova nem tela nova: a lista do cadastro de família
  lê `clausulas_modelo`.
- Régua: "Alteração de cadastro no Compras (campo, lista, tela) ~1h a 1h30" da skill.

## Medir no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-24 --ate 2026-11-24 --grupos "Projeto Conceitual=[Pp]rojeto [Cc]onceitual"
```
