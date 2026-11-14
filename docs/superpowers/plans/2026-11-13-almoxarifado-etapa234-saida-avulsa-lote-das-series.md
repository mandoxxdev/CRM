# Etapa 234 — a saída avulsa com série grava o lote das séries (D (233) 2)

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-13-almoxarifado-etapa233-saida-avulsa-series-lote-impedido.md` (`:176-196`). Estimativa já commitada:
> `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-saida-avulsa-lote-das-series.txt` (**3h**, `fc5ed3be`). Números de linha
> medidos sobre `96db190f`. Feature: **10** (lotes e séries).

## Objetivo (em linguagem simples)

Em **Movimentações → Nova Movimentação**, na **Saída** ou na **Perda** de material com número de série (sem controle por lote), com o lote
em branco, a peça sai, mas o registro grava "sem lote": o *Saldo por lote* continua com a peça que já saiu e o "sem lote atribuído" fica
negativo. Depois desta etapa o sistema descobre o lote pelas séries marcadas e grava a saída nesse lote, como se ele tivesse sido escolhido.
Séries de lotes diferentes numa saída só são recusadas (uma saída por lote, como a entrega de requisição); a tela avisa antes de enviar e,
com todas do mesmo lote, diz de qual lote elas saem.

## Fase 0 — medido em 2026-11-13 (sobre `96db190f`)

1. **Sonda executada (rota v2 real, `zzSonda234`, apagada).** Material `controle_lote = 0`, `controle_serie = 1`, A1/A2 em L1, B1/B2 em L2
   (linhas `L1: 2`, `L2: 2`):

   | gesto | resposta | livro | linhas de saldo | `GET /lotes/resumo` |
   |---|---|---|---|---|
   | SAIDA `[B1]`, lote em branco | 201 | `lote_id` NULL, `lote` NULL | L1 2, L2 2, **NULL −1** | `fisico 3, soma_lotes 4, sem_lote_atribuido −1` |
   | depois SAIDA `[A1, B2]` em branco | 201 | NULL | L1 2, L2 2, **NULL −3** | `fisico 1, soma_lotes 4, sem_lote_atribuido −3` |
   | SAIDA `[C1]` com `lote_id` L3, depois estorno | 201 / 200 | SAIDA e ESTORNO com L3 | L3 volta a 2 | `fisico 2, soma_lotes 2, sem_lote_atribuido 0`; C1 `EM_ESTOQUE` em L3 |

   O estorno de uma saída com lote já devolve ao lote: gravar o lote certo na saída não pede mudança no estorno.
2. **O motor** (`stockService.js:1347-1371`) resolve o lote (`loteResolvido` → `loteIdFinal`, `loteCodigoFinal`) antes de tudo; o `loteIdFinal`
   decide o claim do lote (`claimSaldoDoLote`, `:2293`, recusa `Saldo insuficiente no lote <c>. Disponível: <n> <un>`), o claim das séries
   (`claimSaidaSeries` confere `serie X nao pertence ao lote informado`) e o livro. O material está lido desde `:1228`.
3. **A régua `lotePelasSeries`** (B1527, Etapa 233, `:1617-1631`) já lê os lotes **distintos** das séries `EM_ESTOQUE` do material, dentro
   da trava do material (`naTravaDoMaterial`), e aplica `checarLoteNaSaida` a cada um, em ordem de código. Declarada só pela v2
   (`extended.js:890-894`).
4. **A entrega de requisição** deriva o lote das séries e recusa lotes diferentes (`requisitionService.js:2441-2443`, `escolha series de um
   lote so`) — a série sem lote conta como um "lote" (NULL) no conjunto.
5. **A tela** (`MovimentacoesAlmoxarifado.js:1235-1277`): a lista de séries da Saída/Perda já traz `lote_id`/`lote_codigo`; a validação de
   envio fica em `:563-571`. O efeito de sincronia `:394-416` já tira de `serie_ids` o que sai da lista.
6. Trava: a leitura nova fica no motor, dentro da seção da trava do material (como a da 233) — sem trava nova. Celular: sem saída avulsa com
   série.

## Caminhos

- **(escolhido)** com `lotePelasSeries` (só a v2), em tipo de saída, sem `lote_id`/`lote`, com `serie_ids` e material com série: as séries
  `EM_ESTOQUE` do material de **um** lote só → esse lote vira o `loteResolvido` (a saída fica idêntica à de lote escolhido: guarda, claim do
  lote, claim das séries, livro). Lotes diferentes (ou lote + sem lote) → recusa, depois da guarda do lote da 233.
- **(descartado)** fatiar a saída em uma linha do livro por lote: o motor grava uma linha por chamada; fatiar mudaria o retorno (`id`) e o
  estorno de uma saída só — fora do teto.
- **(descartado)** derivar também no material **com** controle de lote e lote em branco: hoje recusa por *exige lote* (D (233) 4). Derivar
  tornaria o lote opcional ali; fica como está (reversível, declarado).
- **(descartado)** corrigir as saídas antigas automaticamente: pedido do André — o acerto do dado antigo é consulta na letra A, sem alteração
  automática.

## Decisões (letra B — reversíveis; livres B1531 a B1534 e C539, conferido por `grep` em `docs` e `specs` = 0 arquivos; controle B1526 = 5)

- **B1531 — a saída avulsa com série e o lote em branco grava o lote das séries.** No motor, com `opcoes.lotePelasSeries === true`, tipo em
  `tiposSaida`, sem `lote_id` nem `lote`, `serie_ids` não vazio, `material.controle_serie` e **não** (`opcoes.exigeLote` e
  `material.controle_lote`): lê `lote_id` das séries `EM_ESTOQUE` do material entre as informadas (LEFT JOIN no lote; lote apagado = sem
  lote, como a 233). Um lote só (não nulo) → `loteResolvido` = esse lote. Todas sem lote → como antes. As séries que não estão em estoque
  ou são de outro material ficam de fora da conta e caem na recusa do claim de sempre.
- **B1532 — séries de lotes diferentes são recusadas**, com a guarda da 233 primeiro (a série de lote impedido diz o lote, como antes):
  400 `As series escolhidas sao de lotes diferentes (<L1>, <L2>[, sem lote]): faca uma saida para cada lote` — códigos em ordem, "sem lote"
  por último. Descartado: fatiar (acima).
- **B1533 — a tela diz de qual lote as séries saem.** Com o lote em branco, material sem controle de lote e ao menos uma série marcada,
  embaixo da lista, `#mov-series-lote-da-saida`: um lote → `As séries marcadas saem do lote <L>.`; lotes diferentes → `As séries marcadas
  são de lotes diferentes (<L1>, <L2>[, sem lote]): faça uma saída para cada lote.` (cor de erro) e o envio para com o `toast` dessa mesma
  frase, sem ir ao servidor. Todas sem lote → nada.
- **B1534 — o dado antigo não é corrigido sozinho.** As saídas feitas antes desta etapa continuam com "sem lote": a letra A ganha a consulta
  que lista as saídas com lote NULL cujas séries são de um lote; o acerto (se o André quiser) é decisão de produção.
- **C539 (aviso) — a linha do lote tem de cobrir a saída.** Derivado o lote, o claim do lote recusa se a linha dele não tiver o saldo
  (`Saldo insuficiente no lote …`). Com o dado antigo desta etapa a linha do lote tem **mais** (as saídas antigas baixaram o "sem lote"),
  então não trava; só travaria uma linha de lote mexida à mão — declarado. **Isto estava errado** (Fase 5, reproduzido): a regularização de séries dá o lote à série sem a peça estar na linha dele, por tela normal, e a saída travava; agora a derivação só vale quando o lote cobre, senão a saída de antes.

## Regras de negócio (RN-234.xx)

Cenário-base: material com série **sem** controle de lote, A1/A2 em L1 e B1/B2 em L2 (ATIVOS).

| RN | Enunciado | Cenário |
|---|---|---|
| RN-234.01 | A saída com o lote em branco grava o lote das séries | v2 SAIDA `[B1]` sem lote → 201; livro `lote_id` = L2, `lote` = `L2`; linha L2 = 1, nenhuma linha "sem lote" negativa; `/lotes/resumo` `soma_lotes` 3 = `fisico` 3, `sem_lote_atribuido` 0. PERDA `[B2]` idem (L2 = 0) |
| RN-234.02 | O estorno dela devolve ao lote | estorno da SAIDA da .01 → L2 = 2, B1 `EM_ESTOQUE` em L2, `sem_lote_atribuido` 0 |
| RN-234.03 | Lotes diferentes: recusa, nada sai | SAIDA `[A1, B2]` → 400 `As series escolhidas sao de lotes diferentes (L1, L2): faca uma saida para cada lote`, A1 e B2 `EM_ESTOQUE`, físico 4, livro sem saída; série sem lote S1 + A1 → `(L1, sem lote)`; com L2 BLOQUEADO, `[A1, B2]` → a mensagem do lote bloqueado (a guarda vem antes) |
| RN-234.04 | O que não muda | todas sem lote → 201 com `lote_id` NULL; lote escolhido → igual; motor sem a opção (outro chamador) com `[B1]` → `lote_id` NULL como antes; material **com** controle de lote e lote em branco → *exige lote*; AJUSTE (absoluto) → sem mudança |
| RN-234.05 | O dado antigo fica, e a consulta da letra A o acha | SAIDA `[B1]` pelo motor sem a opção (o jeito antigo) → a consulta da letra A lista essa saída com `lote_da_serie` L2; a SAIDA `[B2]` nova pela v2 grava L2 e **não** aparece nela |
| RN-234.06 | A tela diz o lote da saída | lote em branco: marca B1 → `As séries marcadas saem do lote L2.`; nada marcado → sem frase; marca A1 e B1 → a frase de lotes diferentes, e o envio para no `toast` com ela (sem `POST`); lote escolhido, material com controle de lote, ou séries sem lote → sem frase |

## Contratos congelados

- `POST /api/almoxarifado/movimentacoes/v2` — sem campo novo. Com `serie_ids`, sem `lote_id`/`lote`, em tipo de saída, material com série
  e sem controle de lote: grava o lote das séries; resposta 201 igual (`id`, `saldo_anterior`, `saldo_posterior`). Nova recusa 400:
  `As series escolhidas sao de lotes diferentes (<codigos em ordem>[, sem lote]): faca uma saida para cada lote`.
- `registrarMovimentacao(db, user, params, opcoes)` — sem opção nova: a derivação vem com `opcoes.lotePelasSeries` (B1527). Sem ela, nada muda.
- Tela: `#mov-series-lote-da-saida` com as duas literais da B1533.

## Tasks (sort topológico)

- [x] **T1 (tronco, servidor)** — `ff467bd7`, Fase 5 `8897c09e` — `server/tests/api/saidaAvulsaLoteDasSeries.api.test.js` (RN-234.01 a .05) vermelho → derivação em
  `stockService.js` → verde; os arquivos da 233 continuam verdes.
- [x] **T2 (galho, tela, contra o contrato acima)** — `113b07e3`, Fase 5 `8897c09e` (só testes) — `client/src/components/almoxarifado/MovimentacoesSaidaLoteDasSeries.test.js`
  (RN-234.06) vermelho → `MovimentacoesAlmoxarifado.js` → verde.
- Integração: a RN-234.01/.02/.03 entram pela rota real (v2 e `/cancelar`); a .04/.05 também pelo serviço (sem a opção).
- [x] **Letra A** — a consulta da B1534 virou a **A117** (a mesma literal que a RN-234.05 roda) — no fechamento.

## Sabotagens previstas (controle positivo)

1. servidor: sem a derivação → .01 cai; derivar com lotes diferentes (pegar o primeiro) → .03 cai; recusa de lotes diferentes antes da guarda
   → .03 (bloqueado) cai; derivar sem a opção → .04 cai; derivar com controle de lote → .04 cai.
2. tela: sem a frase → .06 cai; o envio sem a parada → .06 cai; a frase com o lote escolhido → .06 cai.

## Fase 2 — revisão do plano (1 revisor fresco)

Rodou enquanto os testes eram escritos (só leitura). **0 Critical.** **2 importantes:** (I1) **reproduzido no código**: o claim das séries
confere o lote **antes** do status (`seriesService.js:181`) — com uma série já entregue no meio, derivar fazia a recusa virar *"serie B1 nao
pertence ao lote informado"* para quem nem escolheu lote → a derivação só vale com **todas** as séries `EM_ESTOQUE` do material (contagem =
ids distintos) e cenário; (I2) onde a derivação entra muda a origem confirmada por leitura (`:1564`) e a `origemEstrita` (`:1584`), que leem
`loteIdFinal` — derivando **antes** do `loteIdFinal` (o escolhido), elas passam a olhar a linha do lote, o que é coerente com a linha que
o claim baixa (confirmado também pelo revisor 1 da Fase 5); declarado, sem RN nova. **4 menores:** a precedência das mensagens (a contagem de
séries e a origem lida vêm antes da recusa de lotes diferentes — aceito); os testes do motor sem a opção passam `exigeSerie: true` (já
passavam); o lote derivado não é conferido contra o material (o mesmo da 233 — declarado); outros tipos de saída da v2 (`SAIDA_PRODUCAO`)
→ cenário. Na tela: ordem por `<` (já era) e a série com `lote_id` sem `lote_codigo` (lote apagado) conta como "sem lote" → corrigido
antes do commit da T2.

## Execução e controles (medidos)

- **Vermelho antes do código:** servidor 7/12 passavam (os de "não muda" e a recusa do bloqueado, que já valia pela 233) — a RN-234.02
  passava de primeira (o estorno voltava ao "sem lote" e o L2 nunca tinha baixado): ganhou a asserção do `lote_id` do ESTORNO, que cai sem
  a derivação (S1); tela 2/7 (os dois "sem frase").
- **Divergências do plano:** a derivação ficou **antes** do `loteIdFinal` (`stockService.js`, bloco "Etapa 234"), e a recusa de lotes
  diferentes no ramo de saída, logo depois da guarda da 233 (`lotesDasSeries`); a contagem "todas em estoque" (Fase 2 I1); e, na Fase 5, a
  conferência de que as linhas do lote cobrem a quantidade (senão, a saída de antes — o que a **C539** do plano previa como recusa virou
  queda para o "sem lote", ver Fase 5).
- **Sabotagens** (script `e234-sabotagem.js` no scratchpad: `split/join` com âncora contada (=1), roda o arquivo de teste, restaura e
  confere o `md5`): rodada 1 — S1–S6 e C1–C5 caem (11/11). **Rodada final** (sobre `8897c09e`): **20/21 caem** — S1–S11 servidor, C1–C8 tela;
  **S12** (tirar o filtro de material da contagem "todas em estoque") **não cai** e é inofensiva hoje: a série de outro material ainda fica
  fora da leitura dos lotes (que tem o filtro), e o claim das séries confere o material **antes** do lote, então a recusa continua *"serie B2
  nao pertence a este material"* — o filtro fica, declarado sem teste que o derrube. Restauro conferido por `md5` em cada uma; `git status`
  sem sobra.

## Fase 5 — revisão adversarial do código (2 revisores frescos)

- **Regra e fluxo (1 achado, reproduzido por sonda):** a **Regularizar séries** de **Lotes e Séries** oferece o lote mesmo em material sem
  controle por lote; a série X1 ficava com o lote L1 e a peça no "sem lote". Depois de a S1 (de L1) sair, a saída de X1 com o lote em branco
  tomava 400 *"Saldo insuficiente no lote L1. Disponível: 0 UN"* — sem saída pela tela (antes passava pelo "sem lote") → a derivação só vale
  quando as linhas do lote cobrem a quantidade; senão a saída de antes; cenário (**C539** reescrito). Confirmado: `serie_ids` repetidos (400 de
  sempre), material com saldo negativo, a devolução que cita a saída derivada (herda o lote), a devolução sem citar (volta sem lote), a trava
  (a leitura roda dentro de `naTravaDoMaterial`), a origem por leitura e a estrita (olham a linha do lote — coerente), a reserva.
- **Testes (5 mutações sobreviviam, todas fechadas):** sem `DISTINCT` (duas séries do mesmo lote viravam "lotes diferentes (L1, L1)"), a
  ordem por código na mensagem e na guarda (os lotes da montagem nasciam em ordem de código), o lote apagado (`s.lote_id` no lugar de
  `l.id`), a série de outro material (filtro da contagem — S12, inofensiva, acima) e, na tela, a ordem, o mesmo lote e o lote apagado →
  cenários no servidor (lotes criados em ordem inversa, dois impedidos, mesmo lote, lote apagado, outro material) e na tela (3). — `8897c09e`.

## Limitações (D (234))

1. **As saídas antigas continuam "sem lote"** (B1534): a consulta da letra A as lista; o acerto não é automático.
2. **Lotes diferentes numa saída só são recusados** (B1532), não fatiados.
3. **Material com controle de lote e "Sem lote"** continua recusado por *exige lote* (D (233) 4).
4. **A devolução ao cliente e os chamadores internos** não derivam (D (233) 3; a entrega já deriva por conta própria).
5. **C539** — a série cujo lote não tem a peça no saldo (a regularização de séries pode dar o lote) sai do "sem lote", como antes; a frase da tela diz o lote mesmo assim (Fase 5).

## Retro

- Rodadas de correção até verde: 2 (Fase 2: a contagem "todas em estoque" e o lote apagado na tela; Fase 5: a cobertura do lote e 8 cenários).
- Achados: Fase 2 — 2 importantes (1 corrigido, 1 confirmado coerente e declarado), 4 menores (2 corrigidos, 2 declarados); Fase 5 — 1 de
  produção reproduzido (corrigido), 5 lacunas de teste reais (fechadas), 0 ruídos.
- Paralelismo: T1 e T2 sequenciais (pequenas); o revisor da Fase 2 em paralelo com a escrita dos testes; os dois da Fase 5 em paralelo entre si,
  antes do `test:api` (um deles mutava produção).
- Defeito que escapou: — (preencher na etapa seguinte). Da 233: nenhum medido.

## Verificação (medida, serial)

- Servidor (sobre `8897c09e`, o código final): `test:api` **628/628 arquivos OK**; `test:almoxarifado` **44/0**; `test:validation` **4/0**;
  `test:safealter` **3/0**; `test:sqlite` **16/0**.
- Tela (sobre `8897c09e`): `react-scripts test --maxWorkers=2` **229/229 suítes, 3108/3108 testes**; `react-scripts build` (CI=true) **Compiled
  successfully**.
- Arquivos da etapa: `saidaAvulsaLoteDasSeries` **19/19**, `MovimentacoesSaidaLoteDasSeries` **10/10**; os da 233 seguem **13/13** e **9/9**.

## Próxima tarefa detalhada

*(Escolhida pela ordem do CLAUDE.md: a 234 fecha a D (233) 2; a feature 10 continua 🟢. O que ela e a 233 deixaram de fora no mesmo gesto é a
**D (233) 3 / D (234) 4** — a devolução ao cliente não confere nem grava o lote das séries. **Sem estimativa** — começa pela Fase 0.5.)*

**A devolução ao cliente de material com série confere e grava o lote das séries (D (233) 3, parte da devolução ao cliente).**

- **O problema:** `POST /api/almoxarifado/materiais-cliente/devolucoes` (`extended.js:956-989`) chama `registrarMovimentacao` com
  `{ exigeLote: true, exigeSerie: true }` **sem** `lotePelasSeries`: com o lote em branco, a série de lote bloqueado sai e a saída grava "sem
  lote" (o mesmo furo da 233 e da 234 na saída avulsa). É porta manual (a tela de Materiais de Clientes tem seletor de lote e de série).
- **Medir antes (Fase 0):** com a sonda da 234 (material de cliente, sem controle de lote, A1 em L1, B1 em L2), a devolução de `[B1]` sem
  lote: o `lote_id` do livro, a linha baixada, e com o L2 bloqueado. Conferir se `DEVOLUCAO_CLIENTE` está em `tiposSaida` (a derivação e a
  guarda só valem nele) e em `tiposDescarte` (vencido). Conferir a tela (`MateriaisClienteAlmoxarifado` ou equivalente): ela lista as séries
  com a situação do lote? Se não, a fatia visível é a mesma frase da 234.
- **Contrato que ela consome:** `opcoes.lotePelasSeries` (B1527/B1531) — declarar na rota já traz a guarda (233), a derivação com cobertura
  (234) e a recusa de lotes diferentes (*"As series escolhidas sao de lotes diferentes (…): faca uma saida para cada lote"*). Mexe em livro e
  saldo: `test:almoxarifado` e o teste de material de cliente existentes têm de seguir verdes.
- **O que já está pronto:** a régua inteira no motor (`checarLoteNaSaida`, a derivação, a cobertura); a frase da tela (`fraseDoLoteDasSeries`
  em `MovimentacoesAlmoxarifado.js` — se a outra tela precisar, extrair para `utils`).
- Outros abertos: a decisão da **B1534** (acertar as saídas antigas — se o André pedir, uma etapa de transferência lote → "sem lote" com
  registro); C522 e C526 (a reserva saber o lote, grande), C524, C525, C527, C529–C531, C533, C534, C536–C539, C514–C518, C486, C491, C495,
  C497, C498.
