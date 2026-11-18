# Etapa 246 — Saída avulsa com série: a frase do lote e a lista depois da recusa (plano)

> Itens 9 e 10 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`, 45 min cada,
> **não revisados**: a medição confirmou os dois defeitos e o tamanho). Ponto de partida: a "Próxima tarefa detalhada" do plano da 245 e os
> planos das Etapas 233/234. Módulo Almoxarifado, tela **Movimentações → Nova Movimentação → Saída/Perda** (o item 9 vale também para a
> janela **Devolver** de Materiais de Clientes, que usa a mesma régua).

## Fase 0 — o que a medição achou (sobre `dfc08907`)

- **Item 9 (C539, B1531/B1533):** a frase *"As séries marcadas saem do lote L1."* é montada por `utils/loteDasSeries.js`
  (`fraseDoLoteDasSeries`) só com o `lote_id`/`lote_codigo` de cada série. O servidor (`stockService.js` ~`:1408-1433`, Etapa 234, Fase 5)
  só usa o lote das séries quando **as linhas positivas do lote cobrem a quantidade** (`SUM(quantidade) … quantidade > 0` ≥ quantidade);
  senão a saída sai do "sem lote". A lista de séries (`GET /materiais/:id/series`, `listarSeriesDoMaterial`) **não traz o saldo do lote**, e a
  lista de lotes da tela (`/lotes?com_saldo=1`) traz `saldo` = soma de **todas** as linhas (inclui a negativa de legado) e esconde lote com
  `saldo` ≤ 0 — não é a régua do motor. Caso real: a **Regularizar séries** (Lotes e Séries) dá lote à série com a peça no "sem lote"
  (o teste `[RN-234.04] … regularizada` do servidor monta exatamente isso): a tela diz L1, o servidor grava sem lote. **Defeito confirmado.**
- **Item 10 (C538):** no `catch` do `handleSubmit` de `MovimentacoesAlmoxarifado.js`, só o **Ajuste** recarrega a lista de séries
  (`setRecargaSeriesAjuste`, Etapa 62). Na Saída/Perda, uma recusa (lote bloqueado no meio, série levada por outra pessoa) deixa a lista velha:
  a série continua marcada e salvar de novo é recusado de novo. A entrega já recarrega (C537, Etapa 232). **Defeito confirmado.**
- A devolução ao cliente (`/materiais-cliente/.../devolver`) passa pelo mesmo motor com `lotePelasSeries` (`extended.js:996`) — a mesma régua
  de cobertura; a frase dela usa a mesma função. Corrigir a função corrige as duas telas.

## Decisões (letra B)

1. **O saldo do lote da série vem do servidor**, na lista de séries: campo novo, aditivo, `lote_saldo_positivo` (a soma das linhas
   **positivas** do lote da série, do material da série — a régua do motor; `null` sem lote). A tela compara com o número de séries marcadas.
   Descartado: usar a lista de lotes da tela (`saldo` soma a linha negativa e o `com_saldo=1` esconde lote com soma ≤ 0 — divergiria do motor
   nos dois sentidos) e a tela recalcular a régua.
2. **Lote que não cobre → nenhuma frase** (como "todas sem lote"): a saída sai do "sem lote", como antes. Descartado: uma frase explicando
   ("saem sem lote: o lote L1 não tem a peça") — o operador não pode fazer nada com ela (C539: "O que fazer: nada").
3. **A frase de lotes diferentes não muda** (o servidor recusa a mistura sem olhar o saldo).
4. **Recusa da Saída/Perda com série recarrega só a lista de séries**, não a de lotes (recarregar os lotes refaz a sugestão FEFO e troca o
   lote escolhido). A série que ficou de lote impedido volta apagada e é desmarcada (o efeito da 233 que sincroniza `serie_ids`); a levada
   por outra pessoa some da lista. Descartado: recarregar também os lotes (limitação declarada na D (246)).

## Regras (RN)

- **RN-246.01** (servidor, leitura) — `GET /materiais/:id/series` traz `lote_saldo_positivo` em cada série: a soma das linhas **positivas** de
  saldo do lote da série (do material da série); `null` sem lote. Amarrado ao motor no mesmo teste: série regularizada com a peça no "sem
  lote" → `0` e a Saída com o lote em branco grava lote `NULL`; série normal do L2 (2 peças) → `2` e a Saída grava o L2; duas séries do L1
  com 1 peça na linha do lote → `1` e a Saída das duas grava `NULL`; linha negativa de legado no lote não entra na soma.
- **RN-246.02** (tela, item 9) — a frase *"As séries marcadas saem do lote L1."* só aparece quando o número de séries marcadas cabe no
  `lote_saldo_positivo` da série; senão, nenhuma frase. Metade positiva no mesmo teste: o lote que cobre mostra a frase. Vale para a Saída/Perda
  de Movimentações e para a janela Devolver de Materiais de Clientes. A frase da mistura não muda.
- **RN-246.03** (tela, item 10) — Saída/Perda de material com série recusada pelo servidor → a lista de séries é lida de novo; a série cujo
  lote foi bloqueado volta apagada e desmarcada (contador "0 de 1"), e a mensagem do servidor aparece. Metade positiva: a Saída aceita não
  relê a lista (o formulário fecha). Ajuste continua relendo (Etapa 62).

## Contrato (congelado)

- `GET /api/almoxarifado/materiais/:id/series[?status=…]` — campo novo `lote_saldo_positivo` (número ou `null`). Nenhum outro campo muda.
- `POST /api/almoxarifado/movimentacoes/v2` — sem mudança.
- Fixtures: nenhuma fixture JSON de contrato espelha a lista de séries (os testes de tela usam objetos inline); os objetos inline das séries
  nos testes que conferem a frase (`MovimentacoesSaidaLoteDasSeries`, `MateriaisClienteDevolucao*`) ganham o campo, no formato do servidor.

## Fase 2 — pulada, com motivo

Sem motor, sem trava, sem saldo gravado: um campo de leitura numa listagem e duas mudanças de tela. T1 → T2 → T3 sequenciais e pequenas.
Fase 5 com um revisor fresco, com sonda.

## Tasks (sort topológico)

- [ ] **T1 (tronco, servidor)** — RN-246.01. Teste primeiro (`server/tests/api/saidaAvulsaFraseDoLote.api.test.js`), controle positivo.
- [ ] **T2 (galho, tela)** — RN-246.02 em `utils/loteDasSeries.js`; testes em `MovimentacoesSaidaLoteDasSeries.test.js` e
  `MateriaisClienteDevolucaoSeries.test.js`.
- [ ] **T3 (galho, tela)** — RN-246.03 em `MovimentacoesAlmoxarifado.js`; teste em `MovimentacoesSaidaLoteDasSeries.test.js`.
- [ ] **T4** — Fase 5, suítes, fechamento.

O teste de integração que cruza as partes é o próprio RN-246.01 (a leitura amarrada à gravação do motor, pela rota).
