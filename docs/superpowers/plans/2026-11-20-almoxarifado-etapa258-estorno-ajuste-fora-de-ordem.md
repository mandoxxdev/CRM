# Etapa 258 — o estorno do Ajuste sem localização desfaz a diferença, não volta a um valor fixo (C550)

> Item único: o **C550** (achado da Fase 2 da Etapa 257; a D (256) 3). A "próxima tarefa detalhada" (item 2) do plano da 257. Estimativa
> `docs/estimativas/2026-11/estimativa_2026-11-20_almoxarifado-estorno-ajuste-fora-de-ordem.md` (1h15, `4f4240bd`). **Não entram:** os itens
> 24, 25 e 26 da estimativa de 18/11 (esperam resposta da empresa).
> **Fatia visível:** não há tela nova — o que muda aparece no total e no saldo por localização depois de **Estornar** um Ajuste que teve
> movimento do material depois dele, e na recusa nova quando o estorno deixaria o material negativo. Declarado (motor puro).

## Fase 0 — medido (sonda executada sobre `e904ba73`, 20/11, `scratchpad/sab-258-sonda.js`, pela rota)

| # | Cenário (material sem negativo, padrão *A*) | Hoje | Pela diferença |
|---|---|---|---|
| 1 | C550: *A* 3, *B* 5; Saída 6; Ajuste para 1; estorno da Saída (7: *A* 3, *B* 4); estorno do Ajuste | total 2, *A* −2, *B* 4 | 8, *A* 3, *B* 5 |
| 2 | *A* 3; Ajuste para 1; Entrada 5 em *B*; estorno do Ajuste | total 3, *A* −2, *B* 5 | 8, *A* 3, *B* 5 |
| 3 | *A* 2; Ajuste para 10; Saída 9; estorno do Ajuste | total 2, *A* 2 (inventa 8) | −7 → recusa |
| 4 | *A* 2, *B* 5; Ajuste para 10 (*A* 5); Saída 5 de *A*; estorno | total 7, *A* 2, *B* 5 (inventa 5) | 2; sem drenar *A* −3 |
| 5 | *A* 3; Ajuste para 7; estorno (nada no meio) | total 3, *A* 3 | o mesmo |

- **Causa:** `cancelarMovimentacao`, ramo `AJUSTE` sem `localizacao_destino_id` (~`stockService.js:3850`): `guardaEstornoAjuste(saldo_anterior,
  atual)` → `UPDATE … SET quantidade_atual = saldo_anterior` → `syncSaldoLocalizacaoPadrao(… { drenar: Boolean(lote_id), devolver })`. O valor
  fixo apaga do total todo movimento do material feito depois do Ajuste; o resíduo (total − as outras linhas) vai para a padrão e, sem lote,
  não drena — a padrão fica negativa.
- O ramo **com** localização já estorna pela diferença (`delta = saldo_posterior − saldo_anterior`, só na linha, total pela soma) e recusa o
  total negativo com *"Não é possível estornar: o saldo já foi consumido (o estorno deixaria o material negativo)"*.
- `saldo_anterior` e `saldo_posterior` do livro do AJUSTE sem localização são **totais do material** (antes e depois do Ajuste).
- O manual diz em quatro lugares que o estorno do ajuste "volta o total ao de antes" / "devolve o saldo ao de antes" (3.6, 6.10, 16.2 e 16.8).

## Decisão (B1605)

**Escolhido (a): estornar pela diferença** — novo total = total atual − (saldo_posterior − saldo_anterior), como o ramo com localização. É o
mesmo número de hoje quando nada mexeu no material depois do Ajuste; com movimento depois, mantém esse movimento. Quando a diferença deixaria
o material negativo (cenário 3), **recusa** com a literal do ramo com localização. E o estorno **sem lote** passa a **drenar** as outras
posições sem lote quando a padrão ficaria negativa (cenário 4), como o Ajuste de ida (Etapa 51; o não separado primeiro, Etapa 254) e como
o estorno com lote já fazia (Etapa 253).
**Descartado (b): recusar** o estorno quando houve qualquer movimento do material depois do Ajuste (mandar fazer um Ajuste novo) — trava
estornos que hoje passam (qualquer entrada do material depois do Ajuste travaria), e o (a) dá o número certo sem pedir nada ao operador. **Descartado (c): só a recusa da padrão negativa sem drenar** (como o ramo com localização recusa
quando a linha não comporta) — a padrão aqui não é a posição que o Ajuste indicou; o Ajuste de ida drena, e o operador faria um Ajuste novo
que drenaria do mesmo jeito. Reversível: o cálculo do novo total e o `drenar` são duas linhas.

## Regras de negócio

- **RN-258.01** O estorno do AJUSTE sem localização grava o total `atual − (saldo_posterior − saldo_anterior)` (arredondado, `Q.qtd`). Sem
  movimento depois do Ajuste, é o `saldo_anterior` (o de antes, como sempre). Cenário C550 → total 8, *A* 3, *B* 5; cenário 2 → 8, *A* 3, *B* 5.
  Livro do estorno: `saldo_posterior` = o novo total.
- **RN-258.02** Novo total negativo num material que não permite negativo (nem a configuração global): **400** *"Não é possível estornar: o
  saldo já foi consumido (o estorno deixaria o material negativo)"*, antes de qualquer efeito (o claim volta pelo catch). Material que permite
  negativo: passa e o total fica negativo (a linha padrão leva o resíduo).
- **RN-258.03** As guardas que já existiam usam o novo total: a de retenção/caixa (`guardaEstornoAjuste`, só quando o estorno reduz) e a do
  lote (`projecaoDoLoteNoAjuste`/`recusaDoLoteNoAjuste`, literal *"o estorno volta o total para ⟨novo total⟩ …"*).
- **RN-258.04** Sem lote, o estorno que deixaria a linha padrão negativa drena as outras posições sem lote (`drenar: true`, a ordem e as duas
  passadas do Ajuste de ida), e as drenadas entram no `compensarLinhasClaim` (o desfazer devolve). Cenário 4 → total 2, *A* 0, *B* 2.
- **RN-258.05** Desfazer: se o livro do estorno falhar, o total (por diferença, `compensarQuantidadeMaterial`), as linhas devolvidas e as
  drenadas voltam, dentro da seção; estado idêntico ao de antes; o estorno de novo, sem a falha, dá o RN-258.01.
- **RN-258.06** O que não muda: o AJUSTE **com** localização; o `AJUSTE_INVENTARIO` (não estorna); a devolução às prateleiras da 256 (o
  `devolver`, limitado pelo resíduo); a mensagem de recusa do lote; o Ajuste de ida.

## Contratos

- `POST /api/almoxarifado/movimentacoes/:id/cancelar` — resposta igual. Recusa nova no AJUSTE sem localização: **400** `{ error: 'Não é
  possível estornar: o saldo já foi consumido (o estorno deixaria o material negativo)' }` (a literal que o ramo com localização já tem).
- Banco: nada novo. Sem consulta de produção (os estornos já feitos não mudam) — não vai para a letra A.

## Desenho

No `else` (sem localização): `delta = saldo_posterior == null ? null : Q.qtd(saldo_posterior − saldo_anterior)`; `novoTotal = delta === null ?
Q.qtd(saldo_anterior) : Q.qtd(atual − delta)`. Guarda negativa (com `compensacao !== true`), `guardaEstornoAjuste(novoTotal, atual)`, lote com
`novoTotal`, `SET quantidade_atual = novoTotal`, `compensarQuantidadeMaterial = atual − novoTotal`, `saldoDepois = novoTotal`, `drenar: true`.
Travas: nada novo (a seção do material do efeito ao livro, Etapa 118).

## Tasks

- [ ] **T1 (tronco, motor)** — o cálculo, a recusa, o drenar sem lote; `estornoAjusteForaDeOrdem.api.test.js` (TDD, controle positivo).
- [ ] **T2** integração — pela rota (v2 + cancelar) e pelo serviço (`registrarMovimentacao` + `cancelarMovimentacao`).
- [ ] **T3** os testes que afirmavam o defeito (`estornoSaidaDevolvePrateleira` [C550, documenta]) e a varredura dos que estornam AJUSTE.
- [ ] **T4** Fase 2 (revisor fresco) e Fase 5 (adversarial com sonda executada e falha forçada).
- [ ] **T5** fechamento (fechar-etapa sem 7½ e 8).
