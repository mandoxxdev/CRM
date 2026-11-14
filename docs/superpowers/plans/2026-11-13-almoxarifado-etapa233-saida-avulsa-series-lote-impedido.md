# Etapa 233 — a saída avulsa não deixa marcar série de lote impedido (D (232) 1)

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-13-almoxarifado-etapa232-entrega-series-lote-impedido.md` (`:171-192`). Estimativa já commitada:
> `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-saida-avulsa-series-lote-impedido.txt` (**3h**, `1111ea13`). Números de linha
> medidos sobre `8926323c`. Feature: **10** (lotes e séries).

## Objetivo (em linguagem simples)

Em **Movimentações → Nova Movimentação**, na **Saída** ou na **Perda** de material com número de série, a lista **Séries a entregar/baixar**
mostra as séries em estoque filtradas só pelo lote escolhido. Com o lote em branco aparecem as de todos os lotes — inclusive as de lote
bloqueado, reprovado ou vencido. Depois desta etapa: a série que **aquele tipo** não pode baixar vem apagada, com o lote e a situação ao lado,
uma frase embaixo explica, ela sai da marcação — e a porta recusa se alguém a mandar mesmo assim.

## Fase 0 — medido em 2026-11-13 (sobre `8926323c`)

1. **A lista** (`MovimentacoesAlmoxarifado.js:1217-1238`): `TIPOS_SAIDA_LOTE = ['SAIDA', 'PERDA']` (`:95`); filtro `!form.lote_id ||
   s.lote_id === form.lote_id`; rótulo `{s.numero}{s.lote_codigo ? ' · lote X' : ''}`; checkbox sem `disabled`. O efeito `:394-406` tira de
   `serie_ids` o que não está visível (deps `form.lote_id`, `seriesDisponiveis`). A troca SAIDA ↔ PERDA mantém `serie_ids` (`:920`).
2. **O seletor de lote já apaga por tipo** (`loteDisponivelParaTipo`, `:120`): SAIDA por `elegivel` (status ATIVO e, se vencido, liberado);
   PERDA só por status. O FEFO pré-escolhe o primeiro disponível; sem nenhum, fica **"Sem lote"** (em branco).
3. **A régua do motor** (`stockService.js:1569-1607`), só quando há `loteResolvido` (o `lote_id` do corpo): status ≠ `ATIVO` → 400
   `Lote <c> esta <status minúsculo> e nao pode ser utilizado` em toda saída; vencido sem liberação → 400 `Lote <c> vencido em <data> nao pode
   sair para consumo. …` **fora** dos `tiposDescarte` (SUCATA, PERDA, AJUSTE_NEGATIVO, PERDA_TERCEIRO, CONSUMO_TERCEIRO, DEVOLUCAO_FORNECEDOR).
   O `AJUSTE` (`tiposAjuste`) não passa por essa guarda.
4. **Sonda executada (rota v2 real, `zzSonda233`, apagada):** com o lote em branco **o motor não olha o lote das séries** —

   | controle de lote | situação de L2 | SAIDA L2 | SAIDA em branco | PERDA L2 | PERDA em branco | AJUSTE −1 |
   |---|---|---|---|---|---|---|
   | 1 | bloqueado / reprovado | 400 status | 400 *exige lote* | 400 status | 400 *exige lote* | 201 |
   | 1 | vencido | 400 vencido | 400 *exige lote* | 201 | 400 *exige lote* | 201 |
   | 0 | bloqueado / reprovado | 400 status | **201** | 400 status | **201** | 201 |
   | 0 | vencido | 400 vencido | **201** | 201 | **201** | 201 |

   **O plano da 232 estava errado** ("marcadas, o motor recusa (`stockService.js:~1571`)"): vale só com o lote escolhido. Em material sem
   controle de lote, a série de lote bloqueado **sai** pela Saída avulsa com o lote em branco.
5. **Chamadores com `serie_ids`**: só a v2 (`extended.js:890`) é manual e carrega séries; a v1 (`almoxarifado.js:1461`) não carrega
   `serie_ids`; a devolução ao cliente (`extended.js:984`), a entrega (deriva o lote das séries), o sucateamento do reprovado (`doBloqueado`)
   e a NC são internos — ficam como estão.
6. **A listagem `/series` já diz a situação** (B1523): `lote_status`, `lote_validade`, `lote_esta_impedido`, `lote_vencido_sem_liberacao`.
   `situacaoDoLote` (`client/src/utils/situacaoDoLote.js`) dá as palavras.
7. Trava: `registrarMovimentacao` roda sob `naTravaDoMaterial` (`:1128`) e o status do lote muda sob a mesma trava (Etapa 220): a leitura
   nova do lote das séries fica dentro da seção, sem trava nova. Celular: sem saída avulsa com série.

## Caminhos

- **(escolhido)** a porta manual (v2) passa a checar o lote das séries quando o lote vem em branco — a mesma régua e as mesmas mensagens do
  lote escolhido —, por opção declarada só pela v2; a tela apaga pela mesma régua por tipo.
- **(descartado)** só a tela: apagaria o que a porta aceita (a tela mais estrita que o servidor — a armadilha do pedido) e deixaria a porta
  aberta para quem tem a tela aberta antes do bloqueio.
- **(descartado)** o motor derivar o `lote_id` das séries (como a entrega): muda o livro e a linha de saldo baixada — é mudança de saldo, fora
  do teto de 3 h; fica declarado (D (233) 2).
- **(descartado)** a guarda para todo chamador do motor: o sucateamento do reprovado (`doBloqueado`) e outros internos poderiam mandar série
  de lote reprovado sem lote — mudaria fluxo que ninguém mediu.

## Decisões (letra B — reversíveis; livres B1527 a B1530 e C538, conferido por `grep` em `docs` e `specs`, controle B1526 = 4 arquivos)

- **B1527 — a porta manual recusa a série de lote impedido com o lote em branco.** Nova opção do motor `lotePelasSeries` (4º argumento, nunca
  do corpo), declarada só por `POST /movimentacoes/v2`. Em `tiposSaida`, sem `loteResolvido` e com `serie_ids`, o motor lê os lotes distintos
  das séries (do mesmo material) e aplica a guarda do lote escolhido a cada um, em ordem de código: status ≠ ATIVO → 400 (toda saída);
  vencido sem liberação fora dos `tiposDescarte` → 400. Antes de qualquer efeito (nada baixa). Descartado: derivar o lote (acima).
- **B1528 — na tela, a série que o tipo não pode baixar vem apagada.** SAIDA: `lote_esta_impedido === true`. PERDA: `lote_esta_impedido ===
  true` **e** `lote_status !== 'ATIVO'` (o vencido sai por Perda). Checkbox `disabled`, `opacity: 0.6`, e no lugar do ` · lote X` o rótulo
  `· lote <codigo> — <situação>: não sai` (`situacaoDoLote`). A série sai de `serie_ids` (o efeito de sincronia, agora também com `form.tipo`:
  a vencida marcada na Perda sai ao trocar para Saída).
- **B1529 — o ajuste negativo não muda.** O motor baixa série de qualquer lote no ajuste (é a correção do estoque); a lista do ajuste não apaga.
- **B1530 — a frase**, embaixo da lista quando há ao menos uma série visível apagada, `#mov-series-impedidas` — SAIDA:
  `Séries de lote bloqueado, reprovado ou vencido vêm apagadas: só saem depois que o lote for liberado na tela Lotes e Séries.`; PERDA:
  `Séries de lote bloqueado ou reprovado vêm apagadas: só saem depois que o lote for liberado na tela Lotes e Séries.`
- **C538 (aviso) — a situação na tela é a da leitura** (ao escolher material e tipo). O lote bloqueado com o formulário aberto só aparece
  pela recusa da porta (B1527), como na entrega (C537).

## Regras de negócio (RN-233.xx)

Cenário-base: material com série **sem** controle de lote, `A1`, `A2` em L1 (ATIVO) e `B1`, `B2` em L2.

| RN | Enunciado | Cenário |
|---|---|---|
| RN-233.01 | Saída com o lote em branco recusa a série de lote bloqueado/reprovado | v2 SAIDA `serie_ids [B1]` sem `lote_id`, L2 BLOQUEADO → 400 `Lote L2 esta bloqueado e nao pode ser utilizado`, B1 `EM_ESTOQUE`, físico igual, nenhuma linha no livro; REPROVADO → `… esta reprovado …`; PERDA idem; controle: `[A1]` → 201 |
| RN-233.02 | Vencido: a Saída recusa, a Perda baixa | L2 vencido ontem: SAIDA `[B1]` → 400 começando `Lote L2 vencido em <data> nao pode sair para consumo.`; PERDA `[B1]` → 201 e B1 sai; vencido com o vencimento liberado: SAIDA → 201 |
| RN-233.03 | Séries de dois lotes: basta uma impedida | SAIDA `[A1, B1]`, L2 BLOQUEADO → 400 e A1 continua `EM_ESTOQUE` |
| RN-233.04 | O que não muda | série sem lote → 201; AJUSTE −1 com `[B1]` de L2 BLOQUEADO → 201; o motor chamado sem a opção (outro chamador) com `[B1]` de L2 BLOQUEADO → 201, como antes; material **com** controle de lote e lote em branco → a mensagem de *exige lote* de sempre |
| RN-233.05 | Na Saída, a série de lote impedido vem apagada, com rótulo e frase | lista em branco: B1 (BLOQUEADO) `disabled`, rótulo `· lote L2 — Bloqueado: não sai`; A1 habilitada, sem rótulo, com ` · lote L1`; `#mov-series-impedidas` com a frase da Saída; controle: sem impedida → sem frase |
| RN-233.06 | Na Perda, só bloqueado/reprovado apaga | L2 vencido: Saída → apagada com `· lote L2 — Vencido em 12/11/2026: não sai`; Perda → habilitada, sem rótulo, sem frase; L2 REPROVADO na Perda → apagada, `· lote L2 — Reprovado: não sai`, frase da Perda |
| RN-233.07 | A série apagada sai da marcação | Perda, L2 vencido: marca B1 → `1/1`; troca para Saída → B1 apagada e desmarcada, `0/1`; o envio não leva B1 (o `toast` de quantidade) |
| RN-233.08 | Resposta antiga (sem os campos) → como antes | séries sem `lote_esta_impedido` (ou com `1`/`'true'`) → todas habilitadas, sem rótulo nem frase |
| RN-233.09 | Ajuste negativo não apaga | AJUSTE com a série de L2 BLOQUEADO → caixa habilitada, sem rótulo |

## Contratos congelados

- `POST /api/almoxarifado/movimentacoes/v2` — sem campo novo. Nova recusa (400), só com `serie_ids`, sem `lote_id`/`lote`, em tipo de saída:
  `Lote <codigo> esta <status em minúsculas> e nao pode ser utilizado` (toda saída) ou `Lote <codigo> vencido em <data_validade crua> nao pode
  sair para consumo. Libere o vencimento do lote (PUT /api/almoxarifado/lotes/:id/liberar-vencimento) com justificativa, ou baixe por
  SUCATA/PERDA ou corrija por AJUSTE.` (fora dos `tiposDescarte`) — **literais idênticas** às do lote escolhido (mesma função).
- `registrarMovimentacao(db, user, params, opcoes)` — `opcoes.lotePelasSeries` (booleano, default falso). Sem ela, nada muda.
- `GET /materiais/:id/series` — não muda (B1523).

## Tasks (sort topológico)

- [x] **T1 (tronco, servidor)** — `b3fc7a0a`, Fase 5 `308ef6b6` — — `server/tests/api/saidaAvulsaSeriesLoteImpedido.api.test.js` (RN-233.01 a .04) vermelho → guarda extraída
  (`checarLoteNaSaida(lote, tipo)`, a mesma do lote escolhido) + `lotePelasSeries` em `stockService.js` + a v2 declara → verde.
- [x] **T2 (galho, tela, contra o contrato acima)** — `3ec94b9f`, Fase 5 `308ef6b6` — — `client/src/components/almoxarifado/MovimentacoesSaidaSeriesImpedidas.test.js`
  (RN-233.05 a .09) vermelho → `MovimentacoesAlmoxarifado.js` → verde.
- Integração: a RN-233.01/.02 entram pela rota real (o que a tela apaga é o que a porta recusa, por tipo); a RN-233.04 entra pelo serviço
  (sem a opção, como antes).

## Sabotagens previstas (controle positivo)

1. servidor: a v2 sem `lotePelasSeries` → .01 cai; a guarda de vencido aplicada também ao descarte → .02 (PERDA vencida) cai; só o primeiro lote
   checado → .03 cai (ordem de código: A1 de L1 primeiro); a guarda sem o filtro de opção → .04 (sem a opção) cai.
2. tela: checkbox sem `disabled` → .05 cai; a régua da Perda igual à da Saída → .06 cai; o efeito sem `form.tipo` → .07 cai; sem a frase → .05
   cai; guarda truthy → .08 cai.

## Fase 2 — revisão do plano (1 revisor fresco)

Rodou enquanto os testes eram escritos. **0 Critical.** **Confirmado:** as literais da porta são as do lote escolhido; a régua da tela é a
do servidor em todas as bordas (status não ATIVO, liberação vazia, validade vazia ou torta, bloqueado e vencido, série sem lote); a guarda
roda antes de qualquer efeito e dentro da trava; T1 e T2 independentes. **2 importantes:** (I1) a RN-233.07 podia passar com o efeito sem
`form.tipo` se o FEFO trocasse o lote ao trocar o tipo — o teste da tela já monta **sem** lote elegível (lotes `[]`), e a sabotagem C3 cai;
(I2) a régua por tipo não pode tirar do ajuste a série marcada — guarda `!TIPOS_SAIDA_LOTE.includes(tipo)` e cenário do ajuste marcando
(a sabotagem dela, C6, não cai: ver Execução). **4 menores:** (M3) a leitura do lote pela `s.lote_id`, sem conferir o material do lote, a
mesma da listagem — congelado; (M4) só séries `EM_ESTOQUE` do material — a já entregue ou de outro material mantém a recusa do claim (filtro
e cenário); (M5) material com controle de lote e "Sem lote": já era recusado por *exige lote* — em D (233) 4; (M6) a v2 aceita outros tipos
de saída (`SAIDA_PRODUCAO`…) — cenário.

## Execução e controles (medidos)

- **Vermelho antes do código:** servidor 4/8 (os 4 controles de "não muda" passavam, como devem); tela 6/7 (o do ajuste passava).
- **Divergência do plano:** a guarda virou `checarLoteNaSaida` (função de módulo, `require` tardio do `lotService` como no motor);
  `String(status || '')` no lugar de `status.toLowerCase()` — inócuo (`status` é `NOT NULL DEFAULT 'ATIVO'`, revisor da Fase 5).
- **Sabotagens** (script `e233-sabotagem.js` no scratchpad: troca por `split/join` com âncora contada (=1), roda o arquivo de teste,
  restaura e confere o `md5`): rodada 1 — S1–S5 servidor e C1–C5, C7 tela caem; **C6** (tirar a guarda do ajuste) **não cai** e é
  **inalcançável hoje**: no ajuste o efeito de sincronia só reroda quando tipo, lote ou lista mudam, e cada um desses caminhos zera
  `serie_ids` antes (troca de tipo para Ajuste, recarga que esvazia a lista) — confirmado pelo revisor de testes da Fase 5; a guarda
  fica, declarada sem teste que a derrube. Rodada final (sobre `308ef6b6`, com S6, S7, C8, C9 da Fase 5): **15/16 caem** (S1–S7 servidor; C1–C5, C7–C9 tela); C6 continua inalcançável. Restauro conferido por `md5` em cada uma; `git status` sem sobra depois.

## Fase 5 — revisão adversarial do código (2 revisores frescos)

- **Regra e fluxo (0 Critical/Important; 2 Minor):** (1) **reproduzido** (sonda do revisor): `AJUSTE_NEGATIVO` pela API (sem tela) com o
  lote em branco passa a recusar lote bloqueado — é a régua do lote escolhido (descarte: status barra, vencido não); faltava dizer e testar
  → cenário e letra B (B1527); (2) **reproduzido** (teste vermelho antes do conserto): na Perda, lote bloqueado **e** vencido dizia
  *"Bloqueado · Vencido em …: não sai"* — o vencido não barra a Perda → o rótulo da Perda só com o status. Confirmado: a tela e a porta dão
  a mesma resposta em todas as bordas; nada muda para quem não declara a opção; a série apagada não chega ao `POST`; o caminho do lote
  escolhido ficou idêntico.
- **Testes (4 achados, todos fechados):** a série de outro material (o filtro de material sobrevivia) → cenário; dois lotes impedidos (a
  ordem sobrevivia) → cenário; a frase com lote escolhido (a lista do lote nunca era exercida: lotes `[]`) → cenário com o FEFO; a asserção
  do envio da RN-233.07 era vazia (com 0 de 1 o envio para antes) → `toHaveLength(0)` e o `toast` de quantidade. C6 inalcançável:
  confirmado. — `308ef6b6`.

## Limitações (D (233))

1. **A situação é a da leitura (C538).**
2. **Com o lote em branco a saída não grava o lote das séries** (material sem controle de lote): o livro diz "sem lote" e a linha baixada é a
   de sempre — derivar o lote das séries é mudança de saldo, fora desta etapa.
3. **A devolução ao cliente** (`extended.js:984`) e os chamadores internos não ganham a guarda (não foram medidos).
4. **Material com controle de lote e "Sem lote"** (já era assim): a lista mostra as séries acesas e a porta recusa por *exige lote*.
5. **`AJUSTE_NEGATIVO` pela API** com o lote em branco passa a recusar lote bloqueado/reprovado (a régua do lote escolhido; sem tela).

## Retro

- Rodadas de correção até verde: 2 (Fase 2: filtro `EM_ESTOQUE`, cenários M4/M6 e o do ajuste; Fase 5: o rótulo da Perda e 5 cenários).
- Achados: Fase 2 — 2 importantes (fechados: 1 já coberto pela montagem, 1 virou guarda declarada inalcançável), 4 menores (3 fechados, 1
  declarado); Fase 5 — 2 de produção reproduzidos (1 corrigido, 1 documentado e testado), 4 lacunas de teste reais (fechadas), 0 ruídos.
- Paralelismo: T1 e T2 sequenciais (pequenas); revisores da Fase 2 em paralelo com a escrita dos testes e os da Fase 5 com o `test:api`.
- Defeito que escapou: — (preencher na etapa seguinte). Da 232: a premissa "o motor recusa" da próxima tarefa (corrigida aqui, à vista).

## Verificação (medida, serial)

- Servidor: `test:api` **627/627 arquivos OK** (sobre o código de produção do servidor final — `b3fc7a0a`; a Fase 5 `308ef6b6` só mexeu
  no teste do servidor e na tela: o arquivo da etapa rodado sozinho depois, **13/13**); `test:almoxarifado` **44/0**; `test:validation`
  **4/0**; `test:safealter` **3/0**; `test:sqlite` **16/0** (sobre `308ef6b6`).
- Tela (sobre `308ef6b6`): `react-scripts test --maxWorkers=2` **228/228 suítes, 3098/3098 testes**; `react-scripts build` (CI=true)
  **Compiled successfully**.
- Arquivos da etapa: `saidaAvulsaSeriesLoteImpedido` **13/13**, `MovimentacoesSaidaSeriesImpedidas` **9/9**.

## Próxima tarefa detalhada

*(Escolhida pela ordem do CLAUDE.md: a 233 fecha a D (232) 1; a feature 10 continua 🟢. O que esta etapa declarou de fora e que pega o
mesmo gesto é a **D (233) 2** — a saída avulsa de série com o lote em branco não grava o lote das séries. **Sem estimativa** — começa pela
Fase 0.5.)*

**A saída avulsa com série grava o lote das séries (D (233) 2).** *(Feita na Etapa 234 — `ff467bd7`, `113b07e3`, `8897c09e`; plano `2026-11-13-almoxarifado-etapa234-saida-avulsa-lote-das-series.md`.)*

- **O problema:** em material **sem** controle por lote com séries em lotes (entrada com o campo Lote preenchido), a Saída/Perda de
  **Movimentações** com o lote em branco baixa a série certa, mas o livro grava `lote_id` NULL e a linha de saldo baixada é a "sem lote"
  (ou outra) — não a do lote da série. O *Saldo por lote* e o extrato do lote ficam com a peça que já saiu. A entrega de requisição já faz
  certo (deriva o lote das séries: `requisitionService.js` `loteSeries`, ~`:2410-2446`).
- **Medir antes (Fase 0):** com a sonda da 233 (material `controle_lote = 0`, A1/A2 em L1, B1/B2 em L2), a SAIDA de `[B1]` sem `lote_id`:
  qual linha de `estoque_saldo_almoxarifado` baixa, o `lote_id` do livro, e o que `GET /lotes/resumo` diz depois. Séries de dois lotes
  numa saída só: a entrega recusa (*"escolha series de um lote so"*) — decidir se a avulsa recusa ou fatia.
- **Contrato que ela consome:** `registrarMovimentacao(..., { lotePelasSeries: true })` (B1527, esta etapa) já lê os lotes das séries
  dentro da trava; o passo natural é, com **um** lote só, usá-lo como `loteResolvido` (o claim confere que as séries são dele). É mudança
  de saldo/livro: tem de ir com o estorno (o estorno de uma SAIDA com `lote_id` devolve ao lote — conferir) e com o `test:almoxarifado`.
- **O que já está pronto:** a tela apaga a série impedida (B1528); a guarda (`checarLoteNaSaida`); a régua `lotePelasSeries`.
- Outros abertos: C522 e C526 (a reserva saber o lote, grande), C524, C525, C527, C529–C531, C533, C534, C536–C538, C514–C518, C486,
  C491, C495, C497, C498.
