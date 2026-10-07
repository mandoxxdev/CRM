# Etapa 50 — A tela de Lotes para de mostrar o saldo atribuído como físico (fecha o C71) (desenho)

> **Feature:** 10 (Lotes, séries e rastreabilidade), com a régua da 21 (Etapa 49).
> **Fase 0:** a próxima tarefa do plano da Etapa 49, relida no código em 2026-09-30.
> **Plano:** `docs/superpowers/plans/2026-09-30-almoxarifado-etapa50-lotes-fisico.md`

## 1. O que está medido

- A tela `LotesAlmoxarifado.js` exibe `l.saldo` (`:417`), que vem de
  `GET /materiais/:id/lotes` (`extended.js:1158`) → `lotService.listarLotesDoMaterial`: é
  `SUM(estoque_saldo.quantidade)` por lote, o saldo **atribuído**.
- Os fluxos isentos de lote gravam na linha `lote_id NULL`: a entrega de requisição, o ajuste absoluto e os fluxos internos. Por isso o lote pode mostrar 100 com o material em 70 (sonda da Fase 2 da 49).
- A **mesma** rota abastece, com `com_saldo=1`, os seletores de lote de Movimentações, Devoluções e Sobras. Para eles o atribuído é o **certo**: a saída por lote valida contra ele. **O número do lote não muda.**
- A régua da diferença já existe: `reportService.relatorioSaldoPorLote` calcula o resíduo `quantidade_atual − Σ lotes`, com `|x| > ε` e lote negativo exibido.

## 2. As regras

**RN-01 — Uma fonte só para a conta do resíduo.** A conta vai para um helper único,
`lotService.resumoLotesDoMaterial(db, materialId)`, que devolve `{ fisico, soma_lotes, sem_lote_atribuido }`.
O relatório da 49 passa a usar a **mesma** função de resíduo (`residualSemLote(fisico, somaLotes)`,
com `EPS_SALDO`), para que a tela e o relatório não possam divergir.

**RN-02 — Rota nova, e não mudança de contrato.**
- `GET /api/almoxarifado/materiais/:id/lotes/resumo`, gate `visualizar`, como a vizinha. Devolve 200 com `{ fisico, soma_lotes, sem_lote_atribuido }`.
- Material inexistente: 404 — `Material não encontrado`.
- A rota `/lotes` continua devolvendo **array**. Mudá-la para objeto quebraria os quatro consumidores.

**RN-03 — Na tela.** Abaixo da tabela de lotes, **só quando `|sem_lote_atribuido| > ε`**, aparecem:
- a linha **"Sem lote atribuído"**, com o valor, que pode ser negativo;
- o **"Físico total do material"**;
- o texto: *"O saldo de cada lote é o atribuído a ele. Saídas que não informam lote (como a entrega de requisição) e o ajuste de saldo total não baixam de lote nenhum."*

Quando o resíduo é zero, a tela fica **igual** à de hoje.

## 3. O que NÃO é

- A entrega de requisição **não** passa a baixar de lote. Isso é regra de estoque, e a **B204** descartou.
- Os seletores de lote não mudam.

## 4. Sort

| Task | O que é | Classificação |
|---|---|---|
| **T1** | helper + rota + o relatório usando o helper | **tronco** |
| **T2** | a tela | galho, contra o contrato da RN-02; é pequena e vai em série |
| **T3** | integração: a entrega sem lote → o resumo e a tela mostram −30 | **tronco** |
