# Etapa 61 — a entrega de material com série diz QUAIS séries saem

> Status: **FECHADA (2026-09-30)** — `6ba7429` (T1+T1b), `d74e5a8` (T2), fix-round `77d084c` (Fase 5). Feature 05 (o que falta do "registro por item" é a série) e
> o invariante da Etapa 6b (`COUNT(série presente) == quantidade_atual`).

## Fase 0 — medido com sonda (2026-09-30)

- **Defeito reproduzido:** material com `controle_serie`, entrada de 3 com séries S1–S3, requisição
  de 2, separar 2, entregar 2 pela rota → **200**; físico **1**, séries `EM_ESTOQUE` **3**. O invariante
  da 6b quebra a cada entrega de material serializado — a série entregue continua "em estoque" e
  pode ser escolhida de novo em outra saída.
- Causa: o motor só exige série quando o chamador declara `exigeSerie` (decisão da 6b: "entrega/
  exclusão de requisição ... isentas até as telas deles terem campo de série"). A entrega não declara
  e não manda `serie_ids`.
- O motor já sabe: `serie_ids` + `exigeSerie` → cardinalidade (N séries para N unidades, quantidade
  inteira) e `claimSaidaSeries` (série do material, EM_ESTOQUE, do lote da saída), com compensação.
- Rota de séries em estoque: `GET /materiais/:id/series?status=EM_ESTOQUE` (usada pela tela de
  Movimentações).

## Regras de negócio

- **RN-01** — cada item de `itens_atendidos` aceita `serie_ids` (lista de ids). Material com
  `controle_serie`: **obrigatório**, com `N == quantidade_atendida` (inteira), validado **antes de
  qualquer baixa** (pré-checagem da Etapa 58): séries do material, `EM_ESTOQUE`, do lote escolhido
  (se houver), sem repetição. Recusa: `{material}: material com controle de serie: informe {q} serie(s) para {q} unidade(s) — recebidas {n}`
  e, quando não veio nenhuma, o sufixo ` — entregue escolhendo as séries` (a de um clique cai aqui).
- **RN-02** — as baixas do item (excedente + reservada) recebem as séries em ordem (a 1ª baixa as
  primeiras `q1`), e o motor é chamado com `exigeSerie: true`.
- **RN-03** — material sem `controle_serie`: `serie_ids` ignorado (comportamento de hoje).
- **RN-04 (tela)** — modal de entrega: item serializado mostra as séries em estoque (do lote
  escolhido, se houver) como caixas de seleção; confirmar exige exatamente a quantidade.
- **A medir na Fase 2:** a exclusão da requisição (estorno ENTRADA sem séries) e o estorno da saída.

## Tasks

- **T1 (tronco)** — serviço. Testes `server/tests/api/entregaSeriePorItem.api.test.js`: o defeito
  (entrega sem séries de material serializado → 400, nada sai); com séries → físico e séries batem;
  série de outro material / já entregue / repetida → 400, nada sai; com reserva (duas baixas) as
  séries se dividem; material sem série ignora `serie_ids`.
- **T2 (galho, tela)** — RN-04.
- **T3** — verificação, Fase 5, fechamento. Letra A: SQL dos materiais com série cujo número de
  séries em estoque difere do físico (o estrago que já existe em produção).

## Fase 2 — revisão do plano: 2 críticos, 4 importantes, 3 menores → escopo revisto

- **CRÍTICO 1** — a exclusão da requisição estorna com ENTRADA sem séries: com a entrega baixando
  séries, excluir devolve o físico e deixa as séries ENTREGUE (o invariante quebra ao contrário).
  → **RN-05**: na exclusão, material serializado devolve **por saída** com as séries daquela saída
  (`movimentacao_saida_id`, status ENTREGUE) e `exigeSerie`; saída legada sem séries → o de antes; parte
  das séries já devolvida → recusa antes da 1ª ENTRADA.
- **CRÍTICO 2** — dado legado trava nos dois sentidos, sem gesto de regularização: (a) físico sem
  linhas de série → a entrega nunca mais sai; (b) séries "fantasma" (EM_ESTOQUE mas já saíram, das
  entregas anteriores a esta etapa) → a tela as oferece. → **RN-06**: gesto de **regularização**,
  `POST /materiais/:id/series/regularizar { cadastrar: [numeros], baixar: [serie_ids], justificativa }`
  — cadastrar só até `físico − presentes`, baixar (novo status **BAIXADA**, não presente) só até
  `presentes − físico`; justificativa obrigatória; auditado. Nunca cria divergência nova.
- **IMPORTANTE** — série + lote sem lote explícito: o lote vem das séries escolhidas (todas do mesmo
  lote → `lote_id`; lotes diferentes → recusa `{material}: escolha series de um lote so`).
- **IMPORTANTE** — "Sai de" vs série: `localizacao_id` da série não é confiável (transferência não move
  a série, decisão 9) → não filtra; C76 segue declarado; a tela só mostra o endereço como dica.
- **IMPORTANTE** — T1 e T2 no mesmo push (a de um clique de material serializado passa a recusar).
- **IMPORTANTE** — o comentário do motor (`stockService` ~l.995 "entrega/exclusao ... isentas"), a
  decisão da 6b nas novidades e a "pendência declarada" das specs 04/12 ficam **errados** → corrigir à vista.
- Menores: literal única (sem acento, como o motor): `{material}: material com controle de serie: informe {q} serie(s) para {q} unidade(s) — recebidas {n}`
  e, com 0, o sufixo ` — entregue escolhendo as series`; o cancelamento de saída legada por Movimentações
  já recusa com mensagem enganosa (pré-existente, D); a devolução não baixa `quantidade_entregue` (medir; D).

## Tasks (revistas)
- [x] **T1** — `6ba7429` (+ fix-round `77d084c`) — entrega com séries (RN-01..03 + lote pelas séries) e exclusão por saída com séries (RN-05).
- [x] **T1b** — `6ba7429` (+ fix-round `77d084c`) — regularização (RN-06) + reescrever o teste `serieControleObrigatorio` :111 (a entrega sem
  série deixa de passar — de propósito).
- [x] **T2** — `d74e5a8` (+ fix-round `77d084c`) — tela: séries na entrega (caixas, exatamente a quantidade) e regularização (na aba Séries do
  material: aviso "séries presentes X ≠ físico Y" e o formulário).
- [x] **T3** — verificação, Fase 5 (`77d084c`) e fechamento; letra A (**A30**) com os dois sinais da diferença.

## Divergências da execução em relação ao plano

- **T1 e T1b saíram num commit só** (`6ba7429`): a regularização é o que dá saída ao teste reescrito
  (`serieControleObrigatorio` "entrega continua isenta de série" → "a entrega EXIGE as séries; o legado sem série sai
  pela regularização"), e separar os dois deixaria a suíte vermelha entre commits.
- **O comentário do motor** que afirmava a isenção (`stockService`, bloco de série) foi corrigido **à vista** no próprio
  código, e a pendência (a) de série da spec 10 e a decisão da 6b nas novidades também (formato "dizia X; estava errado").
- **T2 — decisões do executor** (viraram a **B243**): falha ao buscar o material = trata como sem série; falha ao buscar
  as séries = confirmar travado; diferença fracionária → acertar o físico pelo ajuste; filtro de lote no cliente;
  endereço da série só como dica.
- **Script de perl com aspas simples em heredoc do bash quebrou de novo** (duas vezes nesta etapa, uma no fix-round
  e uma no fechamento) — o script escrito com a ferramenta de arquivo resolveu. E um `rep()` que interpolava `$1/$2`
  **antes** do match apagou um título no rascunho (pego pela checagem de que o título seguinte existia; o arquivo não
  chegou a ser gravado).

## Fase 5 — revisão adversarial do código (1 revisor, leitura) — `77d084c`

| # | Achado | Gravidade | Como ficou |
|---|---|---|---|
| 1 | Excluir a requisição **depois de devolver tudo** creditava o físico de novo — a exclusão somava as saídas sem descontar as devoluções, e as séries reativadas pela devolução perdem o vínculo com a saída, então o caso caía no ramo "legado" sem série. **Defeito ANTIGO** (valia também para material sem série) | CRÍTICO | exclusão **por saída, líquida das devoluções**; séries da saída ainda ENTREGUE; teste de devolução total e parcial (**C83**, **B241**) |
| 2 | Saída **legada** (sem série) e saída nova no mesmo par (endereço, lote) → a exclusão recusava para sempre ("parte das séries já voltou") | IMPORTANTE | cada saída tratada à parte; teste da mistura |
| 3 | Regularização não atômica: duas abas passavam do limite; UNIQUE cru; escrita sem auditoria se falhasse no meio | IMPORTANTE | limite no próprio `WHERE`, compensação, auditoria depois; teste de corrida |
| 4 | Série cadastrada sem lote = beco na entrega de material com lote (a janela filtra pelo lote) | IMPORTANTE | lote opcional na regularização; recusa com a literal quando as séries não são do lote escolhido |
| 5 | Série **BAIXADA** por engano sem volta | IMPORTANTE | cadastrar o número a reativa (dentro do limite) |
| 6 | `ceil` no limite de baixa com físico fracionário criava a divergência inversa | MENOR | `floor` nos dois sentidos |
| 7 | Planejada (Etapa 59) + séries de outro lote: mensagem acusava escolha que o usuário não fez; tela deixava marcar lotes misturados | MENOR | mensagem da planejada; tela barra *"Escolha séries de um lote só."* |
| 8 | Depois de um 409 a lista de séries não recarregava | MENOR | recarrega após erro |
| 9 | AJUSTE/AJUSTE_INVENTARIO/inventário mudam o físico sem tocar em série | declarado | **C82** — próxima etapa |

Sabotagens do fix-round: 5, todas vermelhas no cenário certo (líquido das devoluções, legada recusada, lote nulo,
limite no `WHERE`, reativação). Total da etapa: 12 no servidor + 14 nas telas.

**Números medidos (verificação do fix-round, rodada pelo pai):** servidor `npm run test:api` 238/238,
`test:almoxarifado` 42/42, `test:validation` 4/4, `test:safealter` 3/3, `test:sqlite` 5/5; cliente 991/991; build limpo.

## Retro (4 números)

- **Rodadas de correção até verde:** 1 fix-round.
- **Achados:** Fase 2 — 9 (2 críticos, que mudaram o escopo: exclusão com séries e regularização); Fase 5 — 1 crítico +
  4 importantes + 3 menores corrigidos, 1 declarado; **0 ruído**.
- **Paralelismo:** a tela depois do tronco commitado; T1 e T2 **no mesmo push** (exigência da Fase 2 — a de um clique
  de material com série passa a recusar).
- **Defeito que escapou:** o crédito em dobro da exclusão depois de devolução **existia desde antes** (Etapa 7 criou a
  devolução citando a saída; a exclusão nunca descontou) — achado aqui, registrado como defeito antigo (**C83**).

## Próxima tarefa detalhada — Etapa 62: o ajuste e o inventário de material com série (C82)

**Por que esta.** A Etapa 61 fechou o invariante `séries presentes == físico` na entrega e na exclusão, mas o **ajuste**
e o **inventário** continuam mudando o físico sem tocar em série — e a regularização virou remédio permanente. É o
último caminho comum que quebra o invariante.

**Fase 0 — medir antes de prometer:**
1. Onde o físico de material com série muda sem série: `AJUSTE` (total e por endereço), `AJUSTE_POSITIVO`/`NEGATIVO`,
   `AJUSTE_INVENTARIO` (fechamento da contagem), `SUCATA`/`PERDA` (já exigem? — medir `serieObrigatoria` no motor,
   ~l.1005: só `tiposEntrada`/`tiposSaida` com `exigeSerie` do chamador), transferência (não move série — **C76**).
2. **Sonda:** material com 5 séries, ajuste para 3 → físico 3, presentes 5 (confirmar); inventário contando 3 → idem.
3. Desenho a decidir (letra B): o ajuste **para baixo** exige escolher **quais** séries saem (→ status **BAIXADA**, com
   o motivo do ajuste) e **para cima** exige os números novos (como a regularização da 61); o inventário de material
   com série conta **séries** (a contagem lista as séries presentes e o contador marca as que achou), não um número.
   Alternativa mais barata: recusar ajuste/inventário de material com série fora do gesto de regularização (reversível).
4. Contratos que **não** se reabrem: a entrega com séries e a exclusão por saída (Etapa 61), a regularização
   (`POST /materiais/:id/series/regularizar`), a devolução com séries (Etapa 7).

**Pontos de atenção.** O inventário tem fluxo próprio (Etapas 10/10b, conferência com segunda contagem e aprovação) —
mudar a unidade da contagem para série é grande; medir o tamanho antes de prometer. O **ajuste por endereço** define o
saldo **daquele** endereço (semântica "aqui tem 40") — com série, o que o endereço tem é a lista de séries dele, mas a
série não muda de endereço na transferência (**C76**): o `localizacao_id` da série não é confiável.
