# Estimativa 13/11/2026 — almoxarifado: o "Sai de" da separação e da entrega diz qual lote está impedido (D (224))

Origem: "Próxima tarefa detalhada" do plano da Etapa 225 (`docs/superpowers/plans/2026-11-13-almoxarifado-etapa225-relatorios-lote-impedido.md`).

Medido no código antes de estimar (sobre `af6fd736`):

- `RequisicoesList.js`: `rotuloOrigem(s, propriaNoPar)` (`:172`) monta o texto de cada opção do "Sai de"; o sufixo da 218 (`sufixoDoLote`,
  `:163`) e a sobra da 201 já entram nele. A separação usa em `:2539`, a entrega em `:2683`. As linhas vêm de
  `GET /estoque/:materialId/saldos?requisicao_id=` e, desde a 224, já trazem `lote_status`, `lote_validade`, `lote_esta_impedido` e
  `lote_vencido_sem_liberacao` — **sem servidor**.
- As palavras já existem: `situacaoDoLote` exportada de `ExtratoMaterialModal.js` (`:62`, B1486). Extrair para um util comum.
- Decisão (B) a tomar no plano: desabilitar a opção ou só mostrar. A pré-seleção da planejada (`valorPlanejadaNaSeparacao`, a entrega
  `:757-772`) e a sugestão da fila (`valorSugeridoNaSeparacao`) podem apontar para um lote que ficou impedido — medir no plano.
- Sem banco, sem trava, sem rota, sem perfil. Testes Jest no cliente (mock na fronteira HTTP).

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Na separação e na entrega, o "Sai de" diz qual lote está bloqueado, reprovado ou vencido (D (224)) | 45 min | média (análise 30 min + teste 1 h; duas telas da mesma janela) | 2h30 (2h15 arredondado) | 226 | 222–225 mediram 0,6 a 0,7 h de execução cada (campo de leitura + tela pequena) | 0,7 h (horas.js --grupos "E226=…", 13/11) → 45 min | 2h30 (45 min + análise 30 min + teste 1 h = 2h15, arredondado; a parte do André é a da tabela — não informada por ele) | d96da251, f9b92d34, 868887e1, aba3f081, 04308f3f, 38655de2 e este |

Incerteza: baixa a média — o rótulo é texto; o risco é a pré-seleção (planejada/sugestão) cair num lote impedido desabilitado.

Medição no fechamento:
```
--grupos "E226=Etapa 226|Estimativa: almoxarifado - sai de"
```

No fechamento: execução estimada 45 min, medida 0,7 h (a Fase 2 rodou junto com a escrita do teste; as duas revisões da Fase 5 junto com as
suítes do servidor). Quatro etapas seguidas de leitura/tela (222, 223, 225, 226) mediram 0,6 a 0,7 h: para esse porte, 45 min de execução
continua a medida honesta. Conclusão: `conclusao_2026-11-13_almoxarifado-sai-de-lote-impedido.txt`.
