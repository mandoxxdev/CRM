# Estimativa 13/11/2026 — almoxarifado: os relatórios de saldo dizem quanto está em lote impedido (D (223))

Origem: "Próxima tarefa detalhada" do plano da Etapa 224 (`docs/superpowers/plans/2026-11-13-almoxarifado-etapa224-extrato-qual-lote-impedido.md`).

Medido no código antes de estimar (sobre `7dfcd4a4`):

- `reportService.relatorioEstoqueAtual` (`reportService.js:14`) e `relatorioSaldosComprometidos` (`:119`): dois `SELECT` sobre
  `materiais_almoxarifado`; as colunas são estáticas no registro (`reportRegistry.js:56` e `:126`). A tela (`RelatoriosAlmoxarifado.js`) e o
  export (`extended.js:2682`, xlsx) são genéricos pelo `colunas` do registro: coluna nova = entrada no registro + campo no `SELECT`; a tela e a
  planilha vêm de graça. Testes de paridade do export (`relatoriosRegistro [5]`, `relatoriosJornada [3]`) comparam o cabeçalho com o registro.
- *Saldos comprometidos* filtra "alguma retenção > 0": material só com lote impedido não aparece — decisão (B): passa a aparecer.
- *Saldo por lote* já mostra *Validade* e *Status do lote* (colunas do registro): o bloqueado e o reprovado já se leem ali; o vencido não
  (fica como pendência declarada, fora desta tarefa).
- Custo: a mesma régua (`loteImpedidoSql('m')`) da 223, que mediu +35 ms numa lista de 3 mil materiais; aqui a mesma forma de consulta —
  remedir no plano.
- Sem migration, sem trava (só leitura), sem perfil novo, sem tela nova.

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Os relatórios *Estoque atual* e *Saldos comprometidos* mostram quanto está em lote bloqueado, reprovado ou vencido (D (223)) | 45 min | média (análise 30 min + teste 1 h + 30 min de relatório/planilha) | 3h (2h45 arredondado) | 225 | 222 e 223 mediram 0,7 h cada (um campo de leitura + telas pequenas); aqui um campo em duas consultas + o filtro, sem tela própria | 0,6 h (horas.js --grupos "E225=…", 13/11) → 45 min | 3h (45 min + análise 30 min + teste 1h30 = 2h45, arredondado; a parte do André é a da tabela — não informada por ele) | 6518f251, 4d6e493d, 18084c49, 70941fd2, 5d2fe064 e este |

Incerteza: baixa — a régua é a das 222–224, e a tela e a planilha seguem o registro. Não foi quebrada: 3h não passa do teto da skill.

Medição no fechamento:
```
--grupos "E225=Etapa 225|Estimativa: almoxarifado - relatorios"
```

No fechamento: execução estimada 45 min, medida 0,6 h (a Fase 2 rodou junto com a escrita do teste, as duas revisões da Fase 5 junto com a
suíte). Três etapas seguidas de leitura (222, 223, 225) mediram 0,6 a 0,7 h: para esse porte, 45 min de execução continua a medida honesta.
Conclusão: `conclusao_2026-11-13_almoxarifado-relatorios-lote-impedido.txt`.
