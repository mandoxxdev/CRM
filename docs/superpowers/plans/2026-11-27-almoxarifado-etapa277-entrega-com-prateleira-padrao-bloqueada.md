# Etapa 277 — A entrega com a prateleira padrão de um material bloqueada recusa antes de baixar (C561)

> Fora da estimativa de 23/11. Estimativa própria:
> `docs/estimativas/2026-11/estimativa_2026-11-27_entrega-com-prateleira-padrao-bloqueada.md` (45 min), commit `a6390036`.
> Feature: `specs/modulo-almoxarifado/05-separacao-picking` (a conferência da entrega). Etapa anterior: 276.

## Fase 0 — medido antes de prometer (teste executado sobre `16c32c21`)

`entregaComPadraoBloqueada.api.test.js`, antes do conserto: X (padrão P01 livre, 5 sem lote em P01) e Y (sem controle de lote, 3 sem lote em
P01, padrão PB-01 bloqueada), requisição com 2 de X e 1 de Y separadas sem origem → **400 `"<Y>: Localização Z277PB-01 está bloqueada"` com X
já baixado** (SAIDA de 2 no livro, entregue `[2, 0]`, físico de X 5 → 3). Um material em dois itens já recusava limpo (o primeiro item é o
que falha).

**De onde vem a recusa:** `stockService.registrarMovimentacao`, na SAIDA sem origem e sem lote, confere a padrão
(`validarLocalizacaoParaMovimento(resolveLocalizacaoSaida(material, null))`) mesmo quando a linha sem lote que sai é outra (P01). **A recusa é
legítima pela regra do motor:** o claim sem lote começa pela padrão e o resto negativo nasce nela (`claimSaldoSemLote`), e a saída avulsa recusa
igual — não se muda o motor nem a saída avulsa (a 239 só trocou o endereço conferido para a saída **com** lote). O defeito é a ordem: a entrega
chama o motor item a item (passadas 0, 1, '2p', 2) e a recusa do segundo material chega depois da baixa do primeiro.

## Regras de negócio

- **RN-277.01** — Requisição com dois materiais, a padrão de um deles (sem controle de lote, sem série) bloqueada e a parte dele automática:
  400 com a frase do motor, `"<material>: Localização <código> está bloqueada"`, **antes** de qualquer baixa (livro, saldo, entregue e status
  intactos).
- **RN-277.02** — Um material em dois itens, a padrão bloqueada: o mesmo 400, nada baixado.
- **RN-277.03** — Entregar só o item do outro material: 200 (a padrão bloqueada de quem não sai não barra).
- **RN-277.04** — O material com a padrão bloqueada que sai **por endereço** não ganha recusa nova: separado com origem (P01) → 200; com a
  guarda de outra caixa, que faz a parte automática sair por fatias com endereço (B1396, `fatiasSemLoteParaOAutomatico`) → 200.
- **RN-277.05** (controle) — Padrão desbloqueada: os dois saem.

## Contrato (congelado)

`PUT /api/almoxarifado/requisicoes/:id/entregar` — nenhuma rota, coluna ou frase nova. A recusa nova é a frase de sempre do motor, com o nome
do material na frente (como o `catch` da `baixar`): `"<material_nome>: Localização <código> está bloqueada"`, status 400.

## Tasks

- [ ] **T1** — teste `entregaComPadraoBloqueada.api.test.js` (RN-277.01 a .05); vermelho sobre HEAD só no RN-277.01.
- [ ] **T2** — conferência prévia em `entregarSemTrava`, depois de montar os planos e antes do `try` das passadas: para cada plano de
  material sem controle de lote, sem série e sem outras prateleiras da caixa ('2p'), cada pedaço automático cujo
  `fatiasSemLoteParaOAutomatico` dá `null` (vai ao motor sem origem e sem lote) confere a padrão por `validarLocalizacaoParaMovimento`.
  Controle positivo: (s1) a prévia desligada → RN-277.01 vermelho; (s2) sem o pulo das fatias → RN-277.04b vermelho (recusa nova). Âncora
  contada, cópia, md5 de volta.
- [ ] **T3** — Fase 5 (revisor fresco, adversarial, achado só com cenário reproduzido).
- [ ] **T4** — fechamento (`fechar-etapa`, sem 7½ e 8).

## Pontos de atenção

- A prévia lê `fatiasSemLoteParaOAutomatico` com o que saiu da origem **ainda zero** (antes das passadas 0/1). Na hora da baixa o que saiu só
  reduz a guarda que conta — a prévia `null` implica baixa `null`; o inverso (prévia com fatias, baixa sem) recusa tarde, como antes.
- Fora (como antes, letra B): série sem lote (a `fatiasDaSerieSemLote` decide na hora), material com controle de lote (o resto sem lote só
  existe se os lotes não cobrem), a sub-passada '2p' e a saída com lote em material com negativo.
- A ordem das travas não muda (a prévia roda dentro das duas, só lê).
