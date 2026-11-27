# Etapa 272 — Estorno do Desbloquear com lote (C504) e conferência do lote na ordem dos itens (C555)

> Fora da estimativa de 23/11 (os itens 23 e 24 dela dependem de resposta). Estimativa própria:
> `docs/estimativas/2026-11/estimativa_2026-11-27_estorno-desbloqueio-e-lote-na-entrega.md` (45 min + 1 h), commit `48fe26a8`.
> Features: `specs/modulo-almoxarifado/02-movimentacoes` (estorno) e `04-requisicoes` (entrega). Etapa anterior: 271.

## Fase 0 — medido antes de prometer

**A — C504.** Reproduzido com o teste da etapa (`estornoDesbloqueioComLote.api.test.js`, sobre `48fe26a8`): **6 de 10 vermelhos**. L1 4 e
L2 4, bloquear 4 no L1, desbloquear 4 do L1, estornar a entrada do L1 (passa) e estornar o Desbloquear → **200** e o bloqueado do lote volta a
4 apontando para o L1 vazio. Também com parte do lote saída (L1 1) e com a caixa de uma requisição no L1; e a corrida Saída de 4 do L1 ×
estorno do Desbloquear: os dois passavam na 1ª rodada. Onde: `stockService.cancelarMovimentacao`, ramo `DESBLOQUEIO` — o claim confere só o
livre de caixa do **material** (`caixaSql.livreDeCaixaSql`). O claim do livro (`cancelado = 1`) já rodou quando o ramo roda: o
`bloqueadoDoLoteSql` já conta o bloqueio que volta.

**B — C555.** Reproduzido (`entregaLoteOrdemDosItens.api.test.js`): **3 de 8 vermelhos** — a montagem do C555 (L 9: ZA 4, ZB 3, ZC 2; 4 em
inspeção; i separado 3 no automático, k 4 de (ZA, L)); entrega i 3 de (ZB, L) + k 2 de (ZC, L): **passa** com i criado antes de k (pelo serviço
e pela rota `PUT /requisicoes/:id/entregar`), **400** com k antes. Onde: `requisitionService` (entrega, a conferência do lote da 218,
`conferidasNoLote`): para cada item, `podeSair = livre − guardado − jaPedido`, com `guardado` = outras requisições + a guarda que **fica** de
**todas** as outras peças desta requisição no lote, mas `jaPedido` = só o que os itens **anteriores** pedem. Com i antes: i não vê o que k pede
(5 − 2 − 0 = 3, passa) e k não vê a guarda de i (não tem) → 5 saem e a caixa de k (2) fica: 7 comprometidas num lote com 5 livres.
A janela de entrega (`limiteDaOrigemNaEntrega`, client) já faz a conta simétrica (todos os outros itens: o que fica + o que tiram) — **B1636**
diz que ela "fica com a conta da outra ordem"; depois do conserto, é a conta da entrega.

## Regras de negócio

- **RN-272.01** — O estorno de um Desbloquear **com lote** só passa se o lote tiver as peças para bloquear de novo: depois de devolver o bloqueio,
  o que está preso no lote (a caixa de requisição no lote, em inspeção no lote, bloqueado no lote — já com o que volta —, reprovado na inspeção do
  lote, em terceiros do lote) não pode passar do saldo do lote. Senão **400 E1**, nada gravado (o claim volta, o bloqueado do material volta).
  Cenário: o medido acima → E1 com *0 UN livres* e *4 UN*.
- **RN-272.02** — Parte do lote saiu: L1 com 1 → E1 *"1 UN livre"*. O lote intacto: o estorno passa e o bloqueado do lote volta a 4. Desbloqueio
  parcial (2 de 4) com o lote intacto: passa (L1 bloqueado 4).
- **RN-272.03** — A caixa separada de uma requisição no lote conta (a régua do Bloquear indicando o lote, Etapa 249): caixa de 3 no L1 4 → E1 *"1
  UN livre"*. **Fase 2 (achado 2):** reprovação e terceiros com o teto por família da 264 — a reprovação já liberada pelo "Sem lote" não conta (L1 6,
  bloquear/desbloquear 4, Saída 1 → o estorno passa).
- **RN-272.04** — Ordem: o material primeiro (a recusa de sempre, *"Não é possível estornar o desbloqueio: saldo disponível insuficiente para
  bloquear de novo: …"*), depois o lote (E1).
- **RN-272.05** — Desbloquear sem lote: como antes. Material com série ou sem controle de lote (o Desbloquear com lote nasce da devolução para Quarentena): a mesma
  conferência, com o fim da frase E1b (Fase 2, achado 1). Material que permite saldo negativo: a mesma conferência (B1649).
- **RN-272.06** — A conferência roda dentro da seção do estorno (`naTravaDoMaterial`, Etapa 118): Saída de 4 do L1 × estorno do Desbloquear ao
  mesmo tempo → nunca os dois.
- **RN-272.07** — Na entrega, a conferência do lote com peça presa dá o mesmo resultado em qualquer ordem dos itens (de criação e do corpo): no
  C555, **400 no item i** com a frase *"… no lote L há 9 un, mas só 1 pode sair nesta entrega: 4 un em inspeção; 2 un já separadas dele para
  outras requisições ou outras peças desta; 2 un já pedidas nesta entrega; não cobre a quantidade (3). Escolha outro lote ou deixe "Qualquer
  endereço (automático)""* — a frase de hoje da ordem *k antes de i*. Como: depois da passada de hoje (inalterada — decide quem recebe a recusa
  quando não há guarda que fica, B1447), uma 2ª passada confere cada item com `jaPedido` = o que **todos os outros** itens da entrega pedem do
  lote. A guarda que fica do **próprio** item continua fora (B1446). **Fase 2 (achado 3):** na 2ª passada, quem não tira exatamente a
  própria caixa no lote vem primeiro (a recusa não cai em quem tira só a caixa dele).
- **RN-272.08** — O que cabe passa nas duas ordens: i 1 + k 2 → 200 (o lote fica com a caixa de k 2 e o livre 0).
- **RN-272.09** — Sem guarda que fica de nenhum item da entrega, a 2ª passada nunca recusa (a soma de todos é a mesma da última conferência da 1ª): as
  RN-218.18/19 (e a B1447, a recusa no item à mão) não mudam.
- **RN-272.10** — Um item por vez (o caminho do C555): k 2 de (ZC, L) passa; depois i 3 → 400 (a caixa de k ainda fica); i 1 → 200.
- **RN-272.11** — A janela de entrega não muda de código: o teto dela (B1636) já é a conta da 2ª passada; o texto da B1636 perde a exceção do C555 e mantém a da própria origem (`max(teto, parte)`).

## Contratos (congelados)

`POST /api/almoxarifado/movimentacoes/:id/cancelar` — nenhum campo novo. **E1** (400):
`Não é possível estornar o desbloqueio: o lote <L> tem <x> UN livre|livres para bloquear de novo e o estorno bloquearia <q> UN nele — o
bloqueio ficaria apontando para peças que não estão no lote. Para bloquear de novo, use Bloquear Material escolhendo um lote que tenha as
peças.` — `<x>` = MAX(0, saldo do lote − o que está preso nele antes do estorno); singular quando 0 < x < 2; `UN` = a unidade do material.
**E1b** (Fase 2): a mesma, terminando em `Para bloquear de novo, use Bloquear Material sem indicar o lote.` — material com série ou sem controle
de lote.

`PUT /api/almoxarifado/requisicoes/:id/entregar` (e `entregarRequisicao`) — nenhum campo novo; **nenhuma literal nova** (a frase da 218,
`fraseLivreDoLote`, com `jaPedido` = o que os outros itens pedem do lote).

## Fase 2 (revisor fresco, uma passada, 27/11) — 3 importantes (consertados), 3 menores, ruídos

1. **[importante → consertado `3942620c`]** A E1 mandava *"use Bloquear Material escolhendo um lote"* também em material com série ou sem
   controle de lote — gesto que o Bloquear recusa (*"Bloquear indicando o lote só vale para material com controle por lote e sem número de
   série"*). Nesses, o fim da frase é *"use Bloquear Material sem indicar o lote."* (E1b, abaixo).
2. **[importante → consertado `3942620c`]** A régua crua (a projeção do ajuste) somava a reprovação do lote sem o teto por família da Fase 5 da
   264: com a reprovação já liberada pelo "Sem lote" (C501), o estorno era recusado com as peças no lote. Agora `presoNoLoteParaEstorno`, com os
   tetos da 264 (reprovação no que o total ainda cobre; terceiros no que o material tem em terceiros). RN-272.03 revista.
3. **[importante → consertado `7ab8f156`]** Na 2ª passada a recusa caía na primeira da lista (as planejadas primeiro): com *j* tirando a própria
   caixa, *k* saindo de fora da caixa e *i* sem caixa, a recusa ia para *j* com o envelope *"não serve mais"* (falso). Agora, na 2ª passada, quem
   **não** tira exatamente a própria caixa vem primeiro. RN-272.07 revista; cenário novo.
4. **[menor → decisão]** Material que permite saldo negativo: a conferência vale também (como o Bloquear com lote, que não o pula) — **B1649**.
5. **[menor → texto]** RN-272.11: na própria origem a janela promete a parte inteira (`max(teto, parte)`); a B1636 **mantém** essa exceção.
6. **[menor → texto]** RN-272.09: "sem guarda que fica de **nenhum** item da entrega".
- Ruído: com o bloqueado do lote no livro negativo (legado), o número *"livres"* da frase pode sair maior que o real — só o texto.

## Tasks

- [x] **T1 (tronco, motor)** — A: a conferência do lote no ramo `DESBLOQUEIO` do estorno (depois do claim do material, com o
  `compensarBloqueada` já armado; a régua de `projecaoDoLoteNoAjuste`). Teste `estornoDesbloqueioComLote.api.test.js` (rota + serviço + corrida
  + fluxo). Controle positivo por sabotagem. — `d22f41c4`, Fase 2 `3942620c`, Fase 5 `7422dfa5`.
  Teste: 15 cenários (6 de 10 vermelhos no código de antes; o da Fase 5 vermelho antes do conserto dela). Sabotagens (âncora contada, cópia,
  md5 de volta): sem a conferência → 6; sem contar o que volta → 6; sem o teto da reprovação → 1; sem o caminho sem lote → 1; sem a caixa → 1;
  sem inspeção e terceiros → 2. 17 vizinhos de estorno/desbloqueio verdes.
- [x] **T2 (tronco, entrega)** — B: a 2ª passada na conferência do lote. Teste `entregaLoteOrdemDosItens.api.test.js` (serviço + rota). Vizinhos:
  `loteEscolhidoPecaPresa`, `entregaSaiDeRespeitaSeparado`, `saiDeComLoteParteSemLote`, `entregaSoLoteRespeitaSeparado`. Sabotagem. — `7ab8f156`.
  Teste: 9 cenários (3 de 8 vermelhos no código de antes). Sabotagens: sem a 2ª passada → 4; sem a ordem da 2ª → 1; com o prefixo na 2ª → 4.
  58 vizinhos de entrega com lote verdes.
- [x] **T3** — Fase 5 (revisor fresco, adversarial, cenário reproduzido) — `7422dfa5` (abaixo).
- [x] **T4** — fechamento (`fechar-etapa`, sem 7½ e 8) — o commit de fechamento. Nenhuma coluna, tabela nem índice novo (primeiro boot igual).

Sem galho: as duas tasks são de motor/entrega (tronco), independentes entre si de regra; rodam em sequência na mesma árvore (a suíte bate num
SQLite só). Sem tela nova: a fatia visível é a mensagem nova do estorno (A) e a recusa igual nas duas ordens (B).

## Pontos de atenção

- O estorno roda inteiro sob `naTravaDoMaterial` (Etapa 118): a conferência fica dentro da seção, depois do claim do material; a recusa sai
  pelo catch, que desfaz o `quantidade_bloqueada` (`compensarBloqueada`) e o claim do livro.
- `bloqueadoDoLoteSql` já conta o bloqueio que volta (o DESBLOQUEIO está `cancelado = 1` no claim). Não somar `q` de novo.
- B: não mexer na 1ª passada (quem recebe a recusa, envelope da planejada B1446/B1447); a 2ª só recusa o que a 1ª deixou passar.

## Fase 5 (revisor fresco, adversarial, 27/11) — 1 importante e 1 de teste (consertados), B não refutado

Sondas executadas numa cópia de `7ab8f156` (`git archive`).

1. **[importante → consertado `7422dfa5`]** Recusa indevida no estorno: L1 6 com reprovação de 2 já liberada pelo "Sem lote", bloquear/desbloquear
   4 do L1, **bloquear 4 do L2** e Saída 1 do L1 → o estorno do Desbloquear era recusado (*"3 UN livres"*) com as peças no L1. O teto da reprovação
   (total − bloqueado **deste** lote) contava o bloqueio do L2. Agora: total − bloqueado de **todos** os lotes. A mesma conta vive no estorno da
   entrada (264) — **C556**, não medido.
2. **[teste → consertado `7422dfa5`]** Sem inspeção e terceiros na soma o teste passava 12/12: dois cenários novos (a sabotagem derruba os 2).
- Não refutado: o próprio Desbloquear não conta em dobro; a recusa deixa material, linhas e livro como antes; caixa só do mesmo material e lote;
  corrida sob a trava. B: a 1ª passada é sempre mais fraca que a 2ª (aceitar ou recusar já não depende da ordem); sondas de planejadas, mesmo
  par, parcial nas duas ordens, quantidade 0, outro endereço do mesmo lote — todas 200 como devem.

## Divergências do plano

- A RN-272.03 previa a régua crua da projeção do ajuste: a Fase 2 trocou pelos tetos da 264 e a Fase 5 corrigiu o teto da reprovação (todos os
  lotes). O contrato ganhou a E1b (Fase 2).
- A RN-272.07 não previa a ordem da 2ª passada (Fase 2, achado 3).
- A janela de entrega (client) não mudou, como previsto (RN-272.11).
- **CLAUDE.md:** nenhuma linha ficou errada — o estorno continua numa seção só (a conferência nova está dentro dela); a entrega continua sob as
  duas travas (a 2ª passada só lê).

## Próxima tarefa detalhada

Escolhida pelo mapa (feature 05 🟡 — o que falta para 🟢) e pelas pendências C: **a guarda de outra caixa do C485** (~1 h, entrega sob as
travas; precisa de estimativa própria antes, skill `estimativa-de-tarefas`). Medido no aviso **C485** (Etapa 206, revisto na 269): num material
com controle por lote, quando o lote bom que falta está todo na **parte guardada** da caixa de **outra** requisição, a parte automática da entrega
não recusa — o que os lotes que podem sair não cobrem sai *"sem lote"* e a linha fica negativa. Caminho reversível: na conferência do disponível
da entrega (a prévia de `requisitionService`, a mesma da B1639 da 269), recusar quando o que falta é a parte guardada de outra caixa, com o
número e a requisição na frase. Pontos de atenção: a parte guardada é a `PARTE_ORIGEM_SQL` (Etapa 197/198); a recusa vem antes de qualquer
baixa; o registro antigo de inspeção continua como está (B1640). Alternativa de menor valor: o **C556** (~30 min, a mesma conta do teto da 272
no estorno da entrada da 264).

- **Item 24 da estimativa de 23/11 (série e etiqueta obrigatórios) ainda depende de resposta** — não comece sem ela. O item 23 também.
- **O que já está pronto e não reabre:** o estorno do Desbloquear com lote (C504) e a conferência do lote na ordem dos itens (C555), desta etapa.

## Verificação (medida)

- `npm run test:api` (sozinho, `NODE_OPTIONS=--max-old-space-size=4096`, sobre `7ab8f156`): **683/685 arquivos OK** — os 2 que falham são os já
  conhecidos de proposta, de outra máquina (`propostaBilingueTemplate` 7/1, `propostaPdfExigeLogin` 3/1). O conserto da Fase 5 (`7422dfa5`)
  entrou depois: `estornoDesbloqueioComLote` 15/15, `saidaEEstornoComLoteBloqueado` 27/27, `bloqueioSabeOLote` 25/25.
- `npm run test:almoxarifado`: **44 passou, 0 falhou**. `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **16/0**.
- Jest da tela (`--maxWorkers=2`): **259/259 suítes, 3398/3398 testes** (o client não mudou). `CI=true npx react-scripts build`: **Compiled
  successfully.**
- Nenhum clique no navegador (F (272)).

## Retro (4 números)

- Rodadas de correção até verde: 3 (Fase 2 — o teto e o caminho sem lote, a ordem da 2ª passada; Fase 5 — o teto de todos os lotes).
- Achados: Fase 2 — 3 importantes (consertados), 3 menores (texto/decisão), 1 ruído; Fase 5 — 1 importante e 1 de teste consertados, B não refutado.
- Paralelismo: o revisor da Fase 2 rodou enquanto A e B eram escritos (achados aplicados sem retrabalho); o da Fase 5 em cópia, junto com a suíte.
- Defeito que escapou: (preencher na etapa seguinte). Da 271: nenhum apontado.
