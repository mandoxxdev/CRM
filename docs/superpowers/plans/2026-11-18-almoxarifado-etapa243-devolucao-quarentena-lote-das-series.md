# Etapa 243 — a devolução para Quarentena (e Estoque) de peça com série grava o lote das séries (resto da D (233) 3)

> Item 2 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`, 1h15). Ponto de
> partida: a "Próxima tarefa detalhada" do plano da 242 e a do plano da 236 (`:130-152`). Módulo Almoxarifado, **motor** (porta da devolução:
> pernas sob a trava do material) — Fases 2 e 5 obrigatórias.

## Fase 0 — o que a sonda executada mediu (sobre `bf71653a`, `createTestApp`)

Material com série e **sem** controle de lote; A1, A2 no lote L1 e B1, B2 no L2; B1 saiu pela Saída avulsa (v2, Etapa 234: o livro diz L2).

| # | Gesto | Resultado medido |
|---|---|---|
| P1 | Devolução **avulsa** para **Quarentena** de B1, lote em branco | 201; ENTRADA_DEVOLUCAO e BLOQUEIO com `lote_id` NULL; a série B1 **perde o lote** (`lote_id` NULL); linha "sem lote" = 1; bloqueado por lote: `sem_lote 1`; resumo `sem_lote_atribuido 1` — **buraco** |
| P2 | Quarentena **citando** a saída da v2 | 201; herda o L2 (Etapa 58): livro, linha, série e bloqueado por lote no L2 — **certo** |
| P5/P6 | **Sucata** (citando ou avulsa), sem série | 201; ENTRADA_DEVOLUCAO + SUCATA sem lote, soma zero na linha "sem lote"; a série B1 **não se move** (continua Entregue, no L2) — **sem buraco de saldo** |
| P4 | Sucata **com** série | 400 *"Devolução com número de série não é suportada no destino SUCATA. …"* (limitação declarada desde a Etapa 7) |
| P7 | Devolução avulsa para **Estoque** de B1 | o mesmo buraco da P1 (o código é a mesma perna): B1 sem lote, "sem lote" = 1 |
| P8 | Quarentena avulsa de A1 + B1 (lotes diferentes) | 201; as duas perdem o lote; "sem lote" = 2 |
| P9 | Material **com** controle de lote, avulsa sem lote | 400 "exige lote" (D (233) 4 — fica) |
| P10 | Estorno das duas pernas da P1 | volta tudo, mas a B1 fica sem lote (era L2) |

**Por que importa (além do número):** a peça de um lote **bloqueado** devolvida avulsa ao Estoque voltava "sem lote" — e, sem lote, saía de
novo sem a guarda do lote (a regra das Etapas 233/234 olha o lote **da série**, que ficou vazio). A devolução tirava a peça do bloqueio.

**Decisões (letra B):**
1. A régua vale para **Estoque e Quarentena** (os dois destinos que recebem série — a mesma perna de entrada). Descartado: só Quarentena (o
   Estoque ficaria com o mesmo buraco medido, P7, e o código teria um `if` artificial).
2. **Sucata não muda.** Descartado: (a) aceitar série na Sucata — encadear entrada de série + baixa de série sem transação (o motivo da
   Etapa 7) não cabe em 1h15 e a série hoje **não se move** na Sucata (continua Entregue e no lote — P5), então não há saldo a corrigir;
   (b) herdar o lote da saída na Sucata — passaria a recusar a sucata de lote bloqueado (a pré-validação *"Lote … está bloqueado e não pode
   ser sucateado por devolução"*), que hoje passa e é justamente o caso de uso.
3. Séries de lotes diferentes → **recusa** (o molde da 234: uma devolução por lote). Descartado: dividir em duas devoluções sozinho.
4. Só deriva quando **todas** as séries informadas existem no material e estão **fora do estoque** (as que a entrada reativa). Série nova ou
   já em estoque no meio → a devolução de antes (o motor dá a recusa de sempre, ou a série nova nasce sem lote). Molde: Etapa 234, Fase 2
   achado 1.
5. Material **com** controle de lote fica fora (continua "exige lote" — D (233) 4, a mesma da 234).

## Regras (RN)

- **RN-243.01** — devolução para **Estoque** ou **Quarentena** de material com série e **sem** controle de lote, com o lote em branco e sem lote
  herdado da saída citada: se todas as séries informadas existem no material, estão fora do estoque e **saíram de um lote só** (o lote gravado na
  saída que levou cada série — *Fase 2, achado 1a: o plano dizia "o lote da série"; estava errado*, ver abaixo), a devolução usa esse
  lote — a linha da devolução, a ENTRADA_DEVOLUCAO e (Quarentena) o BLOQUEIO gravam o lote; a série continua no lote; a linha "sem lote" não
  ganha a peça; o bloqueado por lote diz o lote.
- **RN-243.02** — séries de **lotes diferentes** (inclusive lote e sem lote) → 400 *"As séries informadas são de lotes diferentes (L1, L2):
  registre uma devolução para cada lote."* (os lotes em ordem de código; "sem lote" por último) e nada é gravado (nenhuma linha de devolução,
  nenhum movimento).
- **RN-243.03** — o lote **informado** ou **herdado** da saída ganha (sem derivar). Série nova ou já em estoque no meio → sem derivar (a
  devolução de antes). Série que saiu **sem lote** (entrega sem lote, v1, saídas de antes da 234 — tiraram do "sem lote") → volta ao "sem
  lote" (Fase 2, 1a). Lote da saída apagado → "sem lote" (1b). Séries repetidas → a recusa de sempre do motor (1c).
- **RN-243.04** — o estorno das pernas (BLOQUEIO e ENTRADA_DEVOLUCAO) volta ao lote: a linha do lote, o bloqueado por lote, e a série
  continua no lote (molde `[RN-235.02]`). A ordem é BLOQUEIO primeiro, depois a entrada (a guarda do disponível recusa a entrada com o
  bloqueio vivo); a série da devolução avulsa estornada fica ESTORNADA (a que cita a saída volta a ENTREGUE).
- **RN-243.05** — série de lote **bloqueado** devolvida avulsa ao Estoque volta **ao lote** (201) e a Saída avulsa seguinte dela é recusada pela
  guarda do lote. *(Fase 2, 2c: só a Saída avulsa v2 olha o lote da série; a entrega por requisição não — D (233) 3 da entrega, fora desta etapa.)*
- **RN-243.06** — Sucata: sem mudança — com série, a recusa de sempre (P4, literal acima); sem série, 201 e a série continua Entregue no lote.
- **RN-243.07** — releitura na trava: o lote das séries é relido dentro da seção do material (`reconferirNaTrava`); se mudou desde a validação
  → 400 *"O lote das séries mudou enquanto a devolução era gravada — nada foi gravado. Registre a devolução de novo."* e a linha da devolução é
  apagada (o catch de "emitidas 0").
- **RN-243.08** (integração, pela rota) — Saída avulsa v2 de B1 (L2) → devolução avulsa para Quarentena → `GET /materiais/:id/lotes/resumo`
  fecha (`sem_lote_atribuido` 0) e o bloqueado por lote diz L2 → estorno das duas pernas → resumo fecha de novo.

## Fase 2 — revisão do plano (agente fresco) e o que mudou

- **1a (real, trava o saldo):** derivar pelo `lote_id` **da série** desequilibrava o caso mais comum: a entrega sem lote tira do "sem lote" com
  a série ainda marcada no lote; devolver ao lote da série deixava o lote com 3 (2 séries) e o "sem lote" em −1 (o resumo, que fecha hoje, ia a
  −1). **Corrigido:** o lote é o da **saída que levou a série** (`series.movimentacao_saida_id` → `movimentacoes.lote_id`). Teste novo + sabotagem S6.
- **1b:** lote apagado ou de outro material → "sem lote" (LEFT JOIN com o material). Teste do apagado.
- **1c:** séries repetidas → a recusa do motor; teste.
- **2b/2c:** texto das RN-243.04 e .05 corrigido (status ESTORNADA; só a v2 confere o lote da série).
- **3, 4a, 4b, 4e–g:** sem achado (o desbloqueio da quarentena já manda o lote quando há bloqueado por lote — o mesmo caminho da devolução
  que herda o lote hoje).

## Contrato (congelado)

`POST /api/almoxarifado/devolucoes` — nenhum campo novo. Muda só: o `lote_id` gravado (derivado, RN-243.01) e uma recusa nova (RN-243.02, .07).
Nenhuma tela muda (a tela já manda as séries; a recusa aparece como a de qualquer 400).

## Tasks

- [x] **T1 (tronco, servidor)** — `ca5da1d6` (+ Fase 5 `d3a59a77`) — teste `devolucaoLoteDasSeries.api.test.js` escrito antes: 9 vermelhos de
  16 (os 7 verdes eram os cenários "como antes"); derivação em `registrarDevolucao` antes do INSERT + releitura em `reconferirNaTrava`.
  Controle positivo: 7 sabotagens (sem derivar; sem recusar lotes diferentes; deriva com série nova/presente; sem a releitura; deriva em
  material com lote; lote da série no lugar do da saída; sem o lote da série estornada), cada uma vermelha no cenário certo, restauro por
  cópia com md5 conferido. **Divergência:** a regra mudou na Fase 2 (o lote é o da **saída**, não o da série) e na Fase 5 (série estornada).
  21 cenários. Nenhuma tela mudou (sem fixture de contrato a regravar: a resposta da rota é a mesma).
- [x] **T2** — suítes completas, Fase 5, fechamento (este commit).

## Fase 5 (um revisor adversarial fresco, com sonda executada) — achados e o que foi feito

- **Achado 1 (médio, reproduzido):** devolução avulsa → estorno da entrada (a série fica ESTORNADA no lote, sem saída gravada) → nova
  devolução da mesma série: lendo só a saída, voltava ao "sem lote" com o lote já debitado pelo estorno (resumo 1; não era regressão — antes
  também). **Corrigido** (`d3a59a77`): série ESTORNADA sem saída gravada usa o lote dela. Cenário novo + sabotagem S7.
- **Achado 3 (baixo):** a série que volta ao estoque no meio dava *"O lote das séries mudou…"*; agora a releitura só recusa quando a série
  continua elegível e o motor dá a recusa dela. **Sem teste próprio** (o gancho teria de simular a volta ao estoque no meio; a recusa
  continua certa e nada é gravado — só o texto).
- Lentes 2 (liberação da quarentena com o lote, saída seguinte, estorno) e 4: sem achado; o revisor pediu e ganhou o cenário da Quarentena
  com lote bloqueado.

## Verificação (medida, serial, sobre o código final `d3a59a77`)

- `npm run test:api`: **636/636 arquivos** OK (o novo `devolucaoLoteDasSeries` com 21 cenários).
- `test:almoxarifado` 44/0; `test:validation` 4/0; `test:safealter` 3/0; `test:sqlite` 16/0.
- Jest da tela: **236 suítes, 3174 testes** (rodado sobre `ca5da1d6`; a Fase 5 não tocou a tela); `CI=true react-scripts build`: *Compiled successfully*.

## Retro (4 números)

- Rodadas de correção até verde: 2 (Fase 2: o lote da saída; Fase 5: a série estornada).
- Achados: Fase 2 — 1 real que trava saldo (1a) + 3 de contrato/texto (1b, 1c, 2b/2c), resto sem achado; Fase 5 — 2 reais (1 médio, 1
  baixo), 0 ruído.
- Paralelismo: nenhum galho (uma task de código); a Fase 2 e a Fase 5 rodaram em paralelo com a escrita do teste e as suítes.
- Defeito que escapou: (preencher na etapa seguinte).

## Próxima tarefa detalhada

Item 3 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`, 1h15): **o retalho de
peça com número de série — a baixa do original grava o lote** (resto da **D (233)** 3). Módulo Almoxarifado, **motor** (Fases 2 e 5
obrigatórias se mudar código).

- **O problema (a medir por sonda, Fase 0):** `scrapService.js:342` baixa o original com `registrarMovimentacao(db, user, { tipo: 'SAIDA',
  lote_id: loteOrigemId || undefined, ... }, { exigeLote: true })` — **sem** `serie_ids` e **sem** `lotePelasSeries`. Medir com material com
  série e sem controle de lote, séries em dois lotes: a baixa marca alguma série (ou a contagem de séries presentes passa do físico)? o livro
  grava lote NULL e o "sem lote" vai a −1? a peça de lote bloqueado é usada sem aviso? `:362` (entrada do retalho) só importa se o retalho
  tiver série. A tela é **Sobras e Retalhos → Gerar retalho** (tem seletor de lote de origem; ver se tem seletor de série antes de prometer).
- **Contrato que consome:** `registrarMovimentacao(db, user, mov, { lotePelasSeries: true })` (`stockService.js:1399-1430`, deriva só quando
  a linha do lote cobre) e a guarda do impedido (`:1692-1715`). Se a baixa precisar de série, o `exigeSerie` e o seletor na tela entram no
  escopo — reestime pela skill se passar de 1h15.
- **Pontos de atenção:** as travas do CLAUDE.md (o retalho baixa o original e dá entrada no retalho — confira se as pernas rodam sob a trava
  do material); a compensação das pernas 2 e 3 (`:356` em diante); o estorno da baixa deve voltar ao lote (molde `[RN-235.02]`,
  `[RN-243.04]`); o lote da **saída** é o que a devolução seguinte lê (B1552 — esta etapa).
- **O que já está pronto e não reabre:** a devolução para Estoque/Quarentena (esta etapa), a devolução ao cliente (235/236) e a saída
  avulsa (234).
