# Etapa 49 — Relatórios de saldo e de movimentação por usuário/centro de custo (plano)

> **Desenho:** `docs/superpowers/specs/2026-09-30-almoxarifado-etapa49-relatorios-saldos-design.md`
> **Feature:** 21

## T1 — `saldo-por-lote` e `series-em-estoque` (RN-01/02)

- **Registro:** as duas chaves (`categoria: 'Estoque'`, `acao: null`, `exportavel: true`).
- **Dispatcher:** duas funções em `reportService`.
- **`series-em-estoque`:** importa `STATUS_PRESENTES` de `seriesService` (verificar que é exportada; se não for, exportar).
- **Cenários** (`relatoriosSaldoLote.api.test.js`):
  - lote com saldo aparece com a quantidade somada;
  - lote zerado **não** aparece;
  - série `EM_ESTOQUE` e `BLOQUEADA` aparecem; `ENTREGUE` não;
  - as colunas batem com o registro.

## T2 — `saldos-comprometidos` (RN-03)

- Colunas e filtro montados de `COLUNAS_RETENCAO`, e o disponível de `disponivelSql`.
- **Cenários:**
  - material com reservado > 0 aparece, com cada coluna no valor certo;
  - material sem retenção **não** aparece;
  - o disponível é igual ao da `estoque-atual`.
- **Controle positivo que importa:** acrescentar uma quinta coluna fictícia a `COLUNAS_RETENCAO` num teste e ver o relatório acompanhar. Se ficar caro, basta provar que as colunas vêm da lista.

## T3 — usuário e centro de custo no histórico (RN-04)

- Duas colunas e dois filtros novos, **aditivos**.
- **Cenários:**
  - o filtro por usuário (parte do nome) devolve só as movimentações dele;
  - o filtro por centro de custo idem;
  - sem filtro, o resultado é igual ao de antes (a metade positiva do "aditivo").

## T4 — integração

- A lista de relatórios (`GET` que dirige a tela) traz as três chaves novas na categoria certa.
- A exportação XLSX de cada uma responde 200 com cabeçalho igual aos rótulos do registro.
- A validação de subida aceita o registro, provado por subir o app no harness.

## Fase 2 — o que o revisor tem de atacar

1. `estoque_saldo_almoxarifado` por `lote_id` é **mantido** pelo motor em toda entrada e saída por lote (inclusive transferência, devolução, ajuste, sucata e estorno)? A soma por lote bate com `quantidade_atual` em material com controle de lote? Se não bater, a RN-01 mentiria.
2. As colunas de `COLUNAS_RETENCAO` estão todas em `materiais_almoxarifado`?
3. O gate `acao: null` expõe algo que o módulo não expunha?
4. O filtro por usuário com `LIKE` é injetável (parâmetro, e não concatenação)?

## Estado

- [x] Fase 0 (desenho, seção 1) · [x] Fase 1
- [x] Fase 2 (1 CRITICAL, 4 IMPORTANT — seção 6 do desenho) · [ ] T1 · [ ] T2 · [ ] T3 · [ ] T4 · [ ] Fase 5 · [ ] Fase 6
