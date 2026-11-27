# Etapa 276 — A entrega de material sem controle por lote com saldo em lote (C558)

> Fora da estimativa de 23/11. Estimativa própria:
> `docs/estimativas/2026-11/estimativa_2026-11-27_material-sem-controle-de-lote-com-saldo-em-lote.md` (45 min), commit `a4ad2478`.
> Feature: `specs/modulo-almoxarifado/05-separacao-picking` (a conferência da entrega) e `10-lotes-series-etiquetas` (o "sem lote atribuído").
> Etapa anterior: 275.

## Fase 0 — medido antes de prometer (sonda executada sobre `a4ad2478`)

Cópia do harness da 273 (`entregaGuardaDeOutraCaixa`), material **sem** *Controle por lote*, Entradas com lote: L1 3 em A01 e 1 em B01; R2 de 1
separada sem origem; entrega de 1 da R2 no automático.

| Cenário | Detalhe (entregável) | Entrega | Livro | Saldo depois |
|---|---|---|---|---|
| A — R1 guarda as 3 de (A01, L1), B01 bloqueada (o C558) | 1 | 200 | SAIDA sem lote 1 | A01/L1 3, B01/L1 1, P01/sem lote −1 |
| B — a mesma guarda, B01 **livre** | 1 | 200 | igual | igual |
| C — **sem** guarda, B01 bloqueada | 1 | 200 | igual | igual |
| D — sem guarda, B01 livre | 1 | 200 | igual | igual |
| E (controle) — **com** *Controle por lote*, o cenário A | 0 | 400 E2 da 273 | vazio | A01/L1 3, B01/L1 1 |

**O C558 estava errado na causa.** Ele dizia que o material sem controle por lote "ainda pode sair 'sem lote' negativo **pela prateleira
bloqueada**". Medido: a parte automática da entrega desse material **nunca** tira de lote (`baixarSemLote`, o claim sem lote) — a linha sem
lote fica −1 nos quatro cenários, com ou sem guarda, com ou sem prateleira bloqueada. É a decisão **B204** (Etapa 49), revogada na 197 **só**
para material com controle por lote (B1320) e escrita no manual (4.5: *"As que não informam — a entrega de requisição de material sem controle
por lote, … — movem o saldo do material numa linha sem lote"*). A prateleira bloqueada não entra na conta: a peça de B01 não é tocada, e o
resultado do cenário A é o mesmo do D. O físico fecha (3), o lote é o **atribuído** (B204) e o *"Sem lote atribuído"* da tela de Lotes mostra
a diferença — o comportamento documentado, não um furo.

Consertar "no molde da 273" (a E2 para material sem controle) recusaria o cenário A e deixaria passar o B, o C e o D, que dão o **mesmo**
saldo: uma recusa que não protege nada e trava a entrega de quem não usa lote. Fazer a entrega desse material baixar de lote é revogar a B204
para todo material — mudança de regra, não conserto (descartado; **B1658**).

## Regras de negócio

- **RN-276.01** — Material **sem** controle por lote, sem série, com saldo só em lote: a parte automática da entrega sai **sem lote** (B204),
  200, a linha sem lote vai a −q, os lotes ficam com o saldo atribuído, nenhuma peça sai da prateleira bloqueada — com ou sem guarda de
  outra caixa, com ou sem prateleira bloqueada (cenários A a D da Fase 0). A conferência do automático pelo lote (206/273/275) não vale
  para ele.
- **RN-276.02** — O detalhe da requisição mostra o entregável que a entrega aceita (1, nos quatro cenários): o teto pelo lote
  (`tetoDaEntregaPeloLote`) não vale para ele — o número de antes.
- **RN-276.03** (controle) — O mesmo cenário A com *Controle por lote* ligado continua 400 com a E2 da 273, nada baixado.

## Contratos (congelados)

Nenhuma rota, frase, coluna ou índice novo. `PUT /api/almoxarifado/requisicoes/:id/entregar` sem mudança; a E2 da 273
(`fraseEntregaGuardaDeOutra`) continua só para material com controle por lote.

## Tasks

- [ ] **T1 (prova)** — `entregaSemControleDeLote.api.test.js`: RN-276.01 (A a D, pela rota), RN-276.02 (o detalhe), RN-276.03 (controle).
  Controle positivo: (s1) a conferência sem o pulo de `!pm.controleLote` → o cenário A vira 400 (vermelho); (s2) o automático do material sem
  controle pelos lotes (`plano.controleLote` → verdadeiro no ramo da 197) → o livro mostra o lote (vermelho). Âncora contada, cópia, md5 de
  volta.
- [ ] **T2** — Fase 5 (revisor fresco, uma passada, achado só com cenário reproduzido).
- [ ] **T3** — fechamento (`fechar-etapa`, sem 7½ e 8): o C558 corrigido à vista onde aparece (novidades, spec 05, mapa), a B1658.

## Pontos de atenção

- Nenhum código de produção muda se a Fase 2 e a Fase 5 não acharem caminho diferente do medido.
- O material com série e sem controle por lote tem regra própria (as séries escolhidas, Etapa 234/252) — fora.
