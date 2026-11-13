# Estimativa 13/11/2026 — almoxarifado: o *Saldo por lote* diz que o lote ativo está vencido (D (225)) e a Fila de separação diz o impedido (D (223))

Origem: "Próxima tarefa detalhada" do plano da Etapa 226 (`docs/superpowers/plans/2026-11-13-almoxarifado-etapa226-sai-de-lote-impedido.md`).
A tarefa 1 é pequena; por pedido do André ela vai junto com o vizinho de lote impedido mais próximo nomeado nos planos 225/226 — a coluna
*disponível* da Fila de separação (D (223)) —, porque as duas somam até 4h.

Medido no código antes de estimar (sobre `084fe4b1`):

- Tarefa 1: `reportService.relatorioSaldoPorLote` (`reportService.js:44`) — um `SELECT … l.data_validade as validade, l.status as status_lote`
  agrupado por material e lote, e a linha "Sem lote atribuído" montada em JS. Registro `'saldo-por-lote'` (`reportRegistry.js:659`, colunas
  estáticas). A tela (`RelatoriosAlmoxarifado.js`, `null` vira "—") e o xlsx (`extended.js:2682`) seguem o registro: coluna nova = campo + entrada
  no registro. As palavras existem só no cliente (`client/src/utils/situacaoDoLote.js`, B1496); a planilha não roda o cliente → a função
  precisa existir também no servidor (decisão B no plano). A régua: `predicadoLoteImpedidoSql`/`predicadoLoteVencidoSql` (`loteImpedido.js`),
  como os booleanos da 224 (`stockService.js:4037`).
- Tarefa 2: a fila (`requisitionService.js:1115`) já lê `loteImpedidoSql('ma') as lote_impedido` por item (usa no teto), mas a linha que vai
  à tela não traz o número (`:1170-1190`); `FilaSeparacao.js:78` escreve `disponível N`. Um campo na linha + um pedaço de texto.
- Sem migration, sem trava (só leitura), sem perfil novo, sem rota nova.

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | O relatório *Saldo por lote* diz quando o lote está vencido (coluna *Situação*) (D (225)) | 45 min | média (análise 30 min + teste 1 h + 30 min de relatório/planilha) | 2h45 | 227 | 222–226 mediram 0,6 a 0,7 h de execução cada (campo de leitura + tela pequena) | — | — | — |
| 2 | A Fila de separação diz quanto do disponível está em lote impedido (D (223)) | 30 min | pequena com regra (análise 15 min + teste 30 min) | 1h15 | 227 | idem; aqui um campo que a consulta já calcula + um texto | — | — | — |

Pacote: as duas na mesma etapa, execução total estimada 1h15 (rateio 45/30). Incerteza: baixa — a régua é a das 222–226.

Medição no fechamento:
```
--grupos "E227=Etapa 227|Estimativa: almoxarifado - saldo por lote"
```
