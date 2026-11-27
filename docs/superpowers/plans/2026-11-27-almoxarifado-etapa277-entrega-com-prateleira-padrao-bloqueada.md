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

- [x] **T1** — teste `entregaComPadraoBloqueada.api.test.js` (RN-277.01 a .05; .04b e .04c acrescentados); vermelho sobre HEAD só no RN-277.01 — `d4b911ec`.
- [x] **T2** (`d4b911ec`, forma final pela Fase 5 — ver Divergências) — conferência prévia em `entregarSemTrava`, depois de montar os planos e antes do `try` das passadas: para cada plano de
  material sem controle de lote, sem série e sem outras prateleiras da caixa ('2p'), cada pedaço automático cujo
  `fatiasSemLoteParaOAutomatico` dá `null` (vai ao motor sem origem e sem lote) confere a padrão por `validarLocalizacaoParaMovimento`.
  Controle positivo: (s1) a prévia desligada → RN-277.01 vermelho; (s2) sem o pulo das fatias → RN-277.04b vermelho (recusa nova). Âncora
  contada, cópia, md5 de volta.
- [x] **T3** — Fase 5 (revisor fresco, adversarial, achado só com cenário reproduzido).
- [x] **T4** — fechamento (`fechar-etapa`, sem 7½ e 8).

## Pontos de atenção

- *(Este ponto dizia: "a prévia lê as fatias com o que saiu da origem ainda zero; na hora da baixa o que saiu só reduz a guarda — a prévia `null`
  implica baixa `null`". **Estava errado** — ver a Fase 5, item 3. A prévia só lê quando nada do material sai antes.)*
- Fora (como antes, letra B): série sem lote (a `fatiasDaSerieSemLote` decide na hora), material com controle de lote (o resto sem lote só
  existe se os lotes não cobrem), a sub-passada '2p' e a saída com lote em material com negativo.
- A ordem das travas não muda (a prévia roda dentro das duas, só lê).

## Fase 2 (revisão do plano) e Fase 5 (revisor fresco, adversarial, uma passada, 27/11)

Por tempo (a etapa cabia em ~1 h), as duas revisões foram **uma só passada** de um revisor fresco, depois do código: o plano, as RN e o código,
com sondas executadas (o revisor carregou o `requisitionService.js` do HEAD em memória para comparar antes × depois, sem mexer no repositório).

1. **[importante → consertado]** Recusa nova indevida na primeira versão: Y com 5 em P01 (2 guardadas para outra requisição) e 2 em A01;
   requisição com X 2, Y 2 com **Sai de** P01 e Y 3 no automático → HEAD 200 (Y sai P01 2, P01 1, A01 2), a primeira versão 400. As fatias lidas
   antes de qualquer baixa davam `null` (P01 tinha 3 livres); na baixa de verdade o primeiro item de Y já tinha saído e o automático saía por
   fatias com endereço. Conserto: a prévia só vale quando nada do material sai antes na entrega (nenhum pedaço com origem, sem
   `partesPreferidas`) e só para o primeiro pedaço automático do material. Teste RN-277.04c (vermelho com a versão anterior, s3).
2. **[menor → registrado, C562]** O inverso, reproduzido (igual no HEAD e depois): Y com 4 em P01 (2 guardadas) e 3 em A01, os mesmos três itens →
   a prévia via fatias e pulava, a baixa não → 400 depois de baixar X e o primeiro item de Y (entregue `[2, 2, 0]`). Com o conserto do item 1 o
   material com origem é pulado de propósito; fica o C562.
3. **[importante para o plano → corrigido aqui]** O ponto de atenção "o que saiu só reduz a guarda; prévia null implica baixa null" estava
   **errado**: a guarda de cada item é fixada antes das passadas (`parteQueFicaPorItem`), e o que muda entre a prévia e a baixa são as **linhas** do
   material, que as baixas anteriores do mesmo material mexem (a ordem do claim e o livre de cada prateleira). O item 1 é o contraexemplo. Com o
   conserto, a prévia só lê quando nenhuma baixa do material vem antes — aí a leitura é a da hora da baixa.
4. **[sem problema]** RN e contrato batem com o código; `origem_automatica: true` e a parte acima do separado passam pela prévia (são automáticos).

Também: a régua da 207 (`entregaGuardaSemLote`, sorteio de 2000 casos) caiu na primeira versão (T: 567) — ela conta as leituras das fatias e a
prévia lia as fatias mesmo com a padrão livre. Agora a padrão é lida primeiro; com ela livre, nenhuma leitura a mais (18/0).

## Divergências do plano

- A T2 mudou de forma pela Fase 5 (item 1): de "cada pedaço automático cujo `fatiasSemLoteParaOAutomatico` dá null" para "o primeiro pedaço
  automático do material, só quando nada dele sai antes", com a padrão lida antes das fatias.
- **O ponto de atenção sobre a leitura antes das passadas estava errado** (item 3 acima) — ficou à vista no texto de cima, corrigido aqui.
- As duas revisões viraram uma passada só (tempo).

## Próxima tarefa detalhada

**C562 — o material com a padrão bloqueada que tem, na mesma entrega, um item que sai por prateleira e outro no automático: a recusa ainda vem
depois de baixar** (~45 min, motor; a de maior valor entre as pendências da feature 05: a mesma classe do C560/C561, recusa que move estoque).
Cenário (sonda da Fase 5, item 2): X 5 em P01 (padrão livre); Y sem controle de lote, padrão PB bloqueada, 4 em P01 (2 guardadas para outra
requisição) e 3 em A01; requisição X 2, Y 2 com **Sai de** P01, Y 3 no automático → 400 `"<Y>: Localização PB está bloqueada"` com `[2, 2, 0]`
entregues. Caminho: (1) reproduzir no `entregaComPadraoBloqueada.api.test.js`; (2) ler as fatias do automático **descontando** das linhas o que os
pedaços com origem do mesmo material tiram antes (passadas 0/1: a origem e a quantidade de cada um estão em `origemPorItem`), em vez de pular o
material — ou, se a simulação ficar grande, recusar antes quando a padrão está bloqueada e o material tem pedaço automático sem `partesPreferidas`,
conferindo pela sonda que nenhum caso que passa hoje passa a recusar (RN-277.04c tem de continuar 200). Pontos de atenção: a ordem das passadas
(0, 1, '2p', 2), a régua da 207 (`entregaGuardaSemLote` conta as leituras — não ler fatias com a padrão livre), série e controle de lote ficam fora
(D (277) 2). Contrato: `PUT /api/almoxarifado/requisicoes/:id/entregar`, frase do motor com o nome do material.
Alternativas: **D (275) 1** (o detalhe oferece 1 e a porta recusa B-01 sem baixar) e **D (275) 3**.

- **Item 24 da estimativa de 23/11 (série e etiqueta obrigatórios) ainda depende de resposta** — não comece sem ela.
- **O que já está pronto e não reabre:** a prévia da padrão bloqueada para o material sem origem na entrega (esta etapa, `d4b911ec`).

## Verificação (medida, sobre `d4b911ec` — o fechamento só mexe em documentos)

- `npm run test:api` (sozinho, `NODE_OPTIONS=--max-old-space-size=4096`): **691/693 arquivos OK** — os 2 que falham são os já conhecidos de
  proposta, de outra máquina (`propostaBilingueTemplate` 7/1, `propostaPdfExigeLogin` 3/1). `entregaComPadraoBloqueada` 7/0.
- `npm run test:almoxarifado`: **44 passou, 0 falhou**. `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **16/0**.
- Jest da tela e build: **não rodados** — o client não mudou.
- Nenhum clique no navegador (F (277)).

## Retro (4 números)

- Rodadas de correção até verde: 1 (a Fase 5 achou a recusa nova; a régua da 207 caiu na mesma versão — um conserto fechou os dois).
- Achados: Fase 2+5 numa passada — 2 importantes (1 consertado, 1 no texto do plano, corrigido), 1 menor (C562, registrado).
- Paralelismo: o revisor rodou enquanto os vizinhos de entrega rodavam; o `test:api` rodou sozinho com a documentação sendo escrita.
- Defeito que escapou: (preencher na etapa seguinte). Da 276: nenhum conhecido.
