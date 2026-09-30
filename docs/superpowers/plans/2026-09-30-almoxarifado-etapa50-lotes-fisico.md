# Etapa 50 — A tela de Lotes mostra o físico e o "sem lote atribuído" (plano)

> **Desenho:** `docs/superpowers/specs/2026-09-30-almoxarifado-etapa50-lotes-fisico-design.md`

## T1 — helper, rota e o relatório na mesma régua

- **`lotService`:** a função pura `residualSemLote(fisico, somaLotes)` (`EPS_SALDO = 1e-9`, arredondada a 6 casas) e `resumoLotesDoMaterial(db, materialId)`, com 404 se o material não existir.
- **`reportService.relatorioSaldoPorLote`:** usa `residualSemLote` em vez da conta própria.
- **Rota `GET /materiais/:id/lotes/resumo`**, registrada **antes** de qualquer rota com `:id` que possa capturar `resumo`.
- **Cenários** (`lotesResumo.api.test.js`):
  - a entrega sem lote dá `{ fisico: 70, soma_lotes: 100, sem_lote_atribuido: -30 }`;
  - com tudo atribuído, o resíduo é 0;
  - material inexistente devolve 404 com a literal;
  - PRODUCAO recebe 200 (gate `visualizar`);
  - **o relatório da 49 continua verde**, e `relatoriosSaldos` precisa seguir 16/16.

## T2 — a tela

`LotesAlmoxarifado.js` busca o resumo junto com os lotes e renderiza o bloco da RN-03 só com o resíduo diferente de zero.

**Cenários** (`LotesAlmoxarifado.test.js`):
- com o resíduo em −30, o bloco aparece com os valores e o texto;
- com o resíduo em zero, o bloco **não** aparece (e a tabela continua);
- sem material selecionado, nenhum GET de resumo.

## T3 — integração

Entrada no lote A, entrega de requisição **pela rota real** (aprovar → separar → entregar) e resumo. Prova que o caminho de consumo de verdade produz o resíduo que a tela mostra.

## Fase 2 — o revisor ataca

1. Existe rota que capture `/materiais/:id/lotes/resumo` antes da nova?
2. Trocar a conta do relatório pelo helper muda algum número dele?
3. A tela: o `materialSelecionado` tem `controle_lote`? Um material sem controle de lote pode ter resíduo diferente de zero (lotes antigos)?

## Estado

- [x] Fase 0 · [x] Fase 1
- [ ] Fase 2 · [ ] T1 · [ ] T2 · [ ] T3 · [ ] Fase 5 · [ ] Fase 6
