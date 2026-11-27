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
bloqueada**". Medido: a parte automática da entrega desse material não tira de lote (`baixarSemLote`, o claim sem lote; a exceção é a sub-passada das outras prateleiras da caixa, Etapa 270, que baixa do par separado e não lê prateleira bloqueada — Fase 2, item 2) — a linha sem
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

- [x] **T1 (prova)** — `entregaSemControleDeLote.api.test.js`: RN-276.01 (A a D, pela rota), RN-276.02 (o detalhe), RN-276.03 (controle).
  Controle positivo: (s1) a conferência sem o pulo de `!pm.controleLote` → o cenário A vira 400 (vermelho); (s2) o automático do material sem
  controle pelos lotes (`plano.controleLote` → verdadeiro no ramo da 197) → o livro mostra o lote (vermelho). Âncora contada, cópia, md5 de
  volta. — `fa17fdc4`. Medido: (s1) só o A cai, pela asserção do 200 (vira 400 E2); (s2) B, C e D caem pelo livro (o lote aparece), o A não
  (o L1 não tem fatia livre; Fase 2, item 5); (s3, Fase 2) sem a guarda `controle_lote` do `tetoDaEntregaPeloLote` → o A cai pelo detalhe (0 !== 1).
- [x] **T2** — Fase 5 (revisor fresco, uma passada, achado só com cenário reproduzido).
- [x] **T3** — fechamento (`fechar-etapa`, sem 7½ e 8): o C558 corrigido à vista onde aparece (novidades, spec 05, mapa), a B1658.

## Pontos de atenção

- Nenhum código de produção muda se a Fase 2 e a Fase 5 não acharem caminho diferente do medido.
- O material com série e sem controle por lote tem regra própria (as séries escolhidas, Etapa 234/252) — fora.

## Fase 2 (revisor fresco, uma passada, 27/11) — nenhum importante, 2 menores

1. **[sem problema]** A conclusão se sustenta, com sondas sobre `42ee6e85`: B01 bloqueada e a R2 entrega 1 (200, sem lote, P01 −1), depois a R1
   entrega as 3 (200); dois itens 1+1 com B01 de 2 bloqueada (200, P01 −2, nenhuma recusa no meio do laço); a R2 separada só com lote (detalhe 1,
   200 sem lote); item com origem (B01, L1) antes do bloqueio (400 limpo, "não serve mais", nada baixado) e o mesmo com `origem_automatica` (200).
   Nada saiu da prateleira bloqueada, nenhum 400 com estoque movido, o detalhe nunca ofereceu o que a porta recusa.
2. **[menor → aplicado]** "Nunca tira de lote" era forte demais: a sub-passada das outras prateleiras da caixa (270) baixa do par separado sem
   olhar o controle de lote (não lê prateleira bloqueada: o livre de lá é 0). Texto da Fase 0 e da B1658 ajustado.
3. **[sem problema]** As RN batem com o código e com o manual 4.5.
4. **[sem problema]** Até o último gesto: entregar o resto (200), estornar a saída da entrega pela tela de Movimentações (400 de sempre, "use os
   fluxos da requisição"), excluir a R2 entregue (200, a ENTRADA sem lote zera a linha). A devolução não foi sondada.
5. **[menor → aplicado]** O s2 cai em B, C e D, não em A (no A o lote não tem fatia livre); e a RN-276.02 não tinha controle positivo — (s3)
   acrescentado.

## Fase 5 (revisor fresco, adversarial, só leitura, 27/11) — C558 não refutado; 1 achado fora dele, reproduzido, não consertado

- **Não refutado:** `livro` e `retrato` comparam a lista exata (uma saída com lote ou endereço, ou uma linha de lote zerada, derrubaria o teste);
  a separação com `lote_id` em material sem controle grava mesmo `lote_separacao_id`; para `controle_lote = 0` a conferência e o teto pulam o
  material e o claim sem lote só lê `lote_id IS NULL`.
- **(a) [conhecido]** O claim sem lote não pula prateleira bloqueada (2 sem lote em B01 bloqueada, entregar 1 → B01 fica 1) — já registrado na
  Etapa 240. A frase "a prateleira bloqueada não entra na conta" desta etapa vale só para linha **de lote**.
- **(b) [reproduzido → C561, não consertado]** Sonda executada depois do `test:api`: X (padrão livre, 5 sem lote) e Y sem controle (5 sem lote em
  P01, padrão PB-01 bloqueada), requisição com 2 de cada → **400 "Localização Z276S-PB-01 está bloqueada" com X já baixado** (SAIDA de 2 no
  livro, `quantidade_entregue` [2, 0], físico de X 5 → 3). Fora do C558 (não depende de lote) e anterior; a etapa não cabia no tempo da semana
  com o conserto — vira a próxima tarefa.
- Também de passagem (não medido): em material sem controle, o detalhe pode oferecer o um clique de uma origem com lote impedido ou prateleira
  da própria guarda bloqueada, que a porta recusa antes de mover (sem estoque movido).

## Divergências do plano

- Nenhuma no código (nada de produção mudou). A Fase 0 dizia "nunca tira de lote": forte demais (a sub-passada da 270 baixa do par separado) —
  ajustado pela Fase 2.
- **O C558 estava errado na causa** (corrigido à vista no item C558 das novidades e no bloco 273 da spec 05).

## Próxima tarefa detalhada

**C561 — entrega de dois materiais com a posição padrão de um deles bloqueada: a recusa vem depois de baixar o outro** (~45 min, motor; a de
maior valor entre as pendências da feature 05: uma recusa que move estoque, a classe do C560). Medido (sonda da Fase 5 acima): Y tem saldo
sem lote em P01 (livre) e a padrão PB-01 bloqueada; a saída sem lote drena P01 — então a recusa vem de outra guarda do motor sobre a padrão
(medir onde: `stockService.registrarMovimentacao`, a conferência de localização bloqueada; o teste antigo `requisicaoEntregaMotor`
"padrão bloqueada → 400, saldo intacto" cobre só um item). Caminho: (1) reproduzir em teste (rota, dois materiais; e um material com dois itens);
(2) se a recusa é legítima (o motor recusa a padrão bloqueada mesmo sem baixar dela), levar a mesma conferência para a prévia da entrega, antes de
qualquer baixa, com a frase do motor (*"Localização ⟨código⟩ está bloqueada"*) — ou, se a recusa é indevida (nada sai da padrão), deixar de
recusar; decidir pelo medido e registrar na letra B. Pontos de atenção: a ordem das passadas (0, 1, '2p', 2) e o `finally` que grava a troca;
a 239 (RN-239.01) já recusa lote só em endereço bloqueado no motor; não mudar a saída avulsa.
Alternativas: **D (275) 1** e **D (275) 3**.

- **Item 24 da estimativa de 23/11 (série e etiqueta obrigatórios) ainda depende de resposta** — não comece sem ela.
- **O que já está pronto e não reabre:** a entrega de material sem controle por lote com saldo em lote (esta etapa: sai sem lote, B204/B1658).

## Verificação (medida)

- `npm run test:api` (sozinho, `NODE_OPTIONS=--max-old-space-size=4096`, sobre `fa17fdc4` — nenhum código de produção mudou depois): **690/692
  arquivos OK** — os 2 que falham são os já conhecidos de proposta, de outra máquina (`propostaBilingueTemplate` 7/1, `propostaPdfExigeLogin`
  3/1). `entregaSemControleDeLote` 5/0.
- `npm run test:almoxarifado`: **44 passou, 0 falhou**. `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **16/0** (sobre `fa17fdc4`).
- Jest da tela e build: **não rodados** — o client não mudou.
- Nenhum clique no navegador (F (276)).

## Retro (4 números)

- Rodadas de correção até verde: 0 (nenhum conserto; o teste nasceu verde e os 3 controles positivos o derrubaram pela asserção certa).
- Achados: Fase 2 — 0 importantes, 2 menores (aplicados); Fase 5 — C558 não refutado, 1 achado real fora dele (C561, reproduzido), 1 conhecido.
- Paralelismo: os dois revisores rodaram enquanto o teste e a documentação eram escritos; o `test:api` rodou sozinho (a sonda do C561 esperou).
- Defeito que escapou: (preencher na etapa seguinte). Da 275: o C558 estava errado na causa.
