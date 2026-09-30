# Etapa 51 — A saída baixa o endereço de onde o material sai (plano)

> **Desenho:** `docs/superpowers/specs/2026-09-30-almoxarifado-etapa51-saida-por-localizacao-design.md`

## T1 — `claimSaldoSemLote` (RN-01/02)

- Uma função nova no molde de `claimSaldoDoLote`:
  - drena as linhas `lote_id IS NULL AND quantidade > 0` do material, pela ordem `(localizacao_id IS locSaida) DESC, quantidade DESC, id`, com débito condicional;
  - o que sobrar vai para a linha `(locSaida, NULL)`, via `getOrCreateSaldo`;
  - devolve **todas** as linhas debitadas, para as compensações (`saldoLinhasSaidaParaReverter`, catch amplo).
- **Onde:** o ramo `else` da saída (`stockService.js` ~1330). Vale para material que permite negativo? **Sim**: a regra é de endereço, não de saldo. Com lote, o ramo `claimSaldoDoLote` não muda.
- **Cenários** (`saidaPorLocalizacao.api.test.js`):
  - entrada de 100 em A e entrega sem origem de 100 → A:0;
  - saída com origem vazia B → B não negativa, e A cede;
  - A:60 e B:40, saída de 70 sem origem → a maior primeiro, as linhas somam 30, nenhuma negativa;
  - material sem nenhuma linha (legado): a saída sem origem se comporta como hoje;
  - série e compensação: a saída de material serializado cuja série é recusada **devolve** as linhas drenadas.

## T2 — AJUSTE absoluto para baixo (RN-03)

- `syncSaldoLocalizacaoPadrao` (só para `loteId` nulo): se o resíduo da linha alvo ficaria < 0, drena as linhas sem lote positivas (a alvo primeiro, depois as maiores) até cobrir, e só então negativa o que faltar.
- **Cenários:**
  - A30 e B20, ajuste para 5 → soma 5, nenhuma negativa;
  - ajuste para cima → vai para a padrão/NULL, como hoje;
  - o estorno do AJUSTE continua coerente no total.

## T3 — a guarda do AJUSTE com localização (RN-04)

- Achar onde o AJUSTE com localização recalcula `quantidade_atual` pela soma (`syncMaterialTotals`), e recusar **antes** de aplicar quando o total resultante for < 0 e o material não permitir negativo.
- **Cenários:** o caso −25 da sonda é recusado com a literal; com `permite_saldo_negativo = 1` passa.

## T4 — integração

Os oito cenários da sonda pelas rotas reais, incluindo a entrega de requisição por aprovar (outro usuário) → separar → entregar. Em cada passo, a soma das linhas é igual a `quantidade_atual` e **nenhuma linha fica negativa** em material que não permite. E o mapa (`GET /mapa/localizacoes`) mostra o endereço **vazio** depois da entrega.

## Fase 2 — o revisor ataca (com sonda: é o motor)

1. Quem mais escreve em `estoque_saldo` com `lote_id NULL` e lê "a linha da padrão" como verdade (reconciliação de estorno, contagem de inventário, transferência, reserva)? A drenagem por endereço quebra alguma dessas leituras?
2. Concorrência: duas saídas simultâneas sem origem do mesmo material. O claim com débito condicional segura? (Suíte `test:sqlite`.)
3. As compensações (série recusada, INSERT do ledger falhando) devolvem as N linhas?
4. A RN-04 recusa algo que hoje passa legitimamente (contagem de inventário que zera um endereço com o total ainda positivo)?
5. O estorno de uma saída drenada de várias linhas deixa o endereço coerente? (A letra D declara que não fica exato; medir o quanto diverge.)

## Estado

- [x] Fase 0 (sonda, seção 1 do desenho) · [x] Fase 1
- [x] Fase 2 (1 CRITICAL, 3 IMPORTANT, 2 MINOR — seção 5 do desenho) · [ ] T1 · [ ] T2 · [ ] T3 · [ ] T4 · [ ] Fase 5 · [ ] Fase 6
