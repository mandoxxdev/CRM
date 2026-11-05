# Etapa 197 — Separar em duas vezes, 2ª parte: em material com lote, a parte automática da entrega baixa do lote certo

> **Tronco (motor da requisição).** Estimativa enviada: item 5 de `docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas.txt`
> (**4h a 5h**: análise 1h, execução 1h a 2h, teste 2h). Junto: o **C462** (texto da dica da fila e do PDF da lista de coleta). Fecha o
> **C451** na entrega e revoga a **B204** para a entrega de material com controle de lote (à vista, abaixo). Plano medido sobre `5919b40d`.
> Specs: `specs/modulo-almoxarifado/05-separacao-picking/README.md` (C451/C453) e `specs/modulo-almoxarifado/10-lotes-series-etiquetas/README.md`
> (pendência (g), `:713-745`).

## Objetivo (em linguagem simples)

O almoxarife separa 3 de um pedido de 6 no endereço que a fila sugeriu (lote L1). O resto chega depois em outro endereço, no lote L2, e
ele separa os outros 3 sem escolher de onde. Desde a 196 os 3 primeiros saem de L1 na entrega. Os outros 3 saem no automático — e o
automático **não sabe tirar de lote**: o L2 fica com 3 na tela de Lotes e aparece uma linha *"Sem lote atribuído"* de **−3**. Passa a
tirar do lote que vence primeiro (o mesmo critério do seletor de lote da Movimentação e da dica da fila): o L2 vai a 0 e não aparece
linha negativa.

## Fase 0 — medido em 2026-11-05 (sobre `5919b40d`)

### A causa (confirma a "Próxima tarefa detalhada" da 196, com as linhas de hoje)

- **Quem chama:** `server/services/almoxarifado/requisitionService.js`, `entregarSemTrava` (`:1702`), dentro de
  `serializarNaRequisicao` → `comTravaDaRequisicao` (`:1699`). A baixa vira pedaços (`:2040-2054`): "com origem" (passada 0 com endereço, 1 só
  lote) e **automático** (`comOrigem: false`, passada 2). As três passadas rodam em ordem (`:2078`), cada pedaço chama o motor
  (`:2081-2118`) e grava o entregue do item logo depois (`:2131-2137`, relativo).
- **O automático não leva lote:** `localizacao_origem_id`/`lote_id` só vão no pedaço com origem (`:2092-2096`); o automático só leva `lote_id`
  quando o item tem **série** (`:2099`, o lote das séries, Etapa 63). `requisitionService.js` **não lê `controle_lote`** em lugar nenhum
  (grep: 0; controle: o mesmo grep acha `controle_serie` em `:354`, `:1286`, `:1761`).
- **O motor não deduz lote:** `stockService.js` resolve o lote só do payload (`:1278-1299`); a entrega é isenta de `exigeLote` por decisão do
  cliente de 2026-08-10 (`:1319-1345`) — o próprio comentário (`:1330-1333`) chama "FEFO na entrega" de *"o conteúdo natural de uma etapa
  seguinte"*. Na saída: com lote e sem negativo → `claimSaldoDoLote` (`:2216-2238`; função em `:403-437`, drena as linhas daquele lote, a
  localização resolvida primeiro, depois as maiores; **não cria linha**; recusa e se autocompensa se não fechar); **sem lote →
  `claimSaldoSemLote`** (`:2239-2246`; função em `:467-497`), que só lê `lote_id IS NULL AND quantidade > 0` (`:470-471`) e põe o resto na
  linha da localização resolvida com lote `NULL` (`:489-494`) — **negativa**. Docstring `:440-466`: *"Linha de LOTE nunca é tocada aqui
  (B204: a entrega não escolhe lote)"*.
- **Guardas do motor para saída com lote** (`:1545-1581`): lote com status ≠ `ATIVO` → 400 *"Lote ⟨c⟩ esta ⟨status⟩ e nao pode ser
  utilizado"*; vencido sem liberação → 400 (a SAIDA não é descarte). Ou seja: o automático só pode mandar ao motor lote **elegível**, senão
  a entrega inteira cai.
- **A régua de elegibilidade já existe e é a do motor:** `lotService.listarLotesDoMaterial` (`lotService.js:524-559`) devolve cada lote com
  `saldo` (soma das linhas do lote, qualquer localização) e `elegivel = status ATIVO && (!vencido || vencimento_liberado)` (`:541`), em ordem
  **FEFO**: elegíveis primeiro, validade crescente, sem validade por último, empate pelo código (`:551-557`). É a mesma ordem do seletor da
  Movimentação (spec 10, `:465`, `:589`) e do critério da fila (B1251, RN-188.02).
- **Lote BLOQUEADO não retém quantidade no material** (`lotService.js:8-10`): o disponível do material conta o saldo de lote bloqueado,
  reprovado ou vencido. Por isso a aprovação e a separação aceitam pedidos que só esse saldo cobre — e hoje a entrega também (pela linha
  sem lote negativa).

### Por que a B204 e a B205 foram tomadas (lidas antes de revogar)

- **B204 (Etapa 49)** — a etapa era o **relatório** *Saldo por lote*; decidiu mostrar a verdade ("Sem lote atribuído") em vez de corrigir o
  estoque, porque fazer a entrega baixar de um lote *"(qual? o mais antigo?) — é mudança de regra do estoque, com efeito em tudo que usa
  lote, e merece etapa própria (ver C71)"* (`docs/almoxarifado-novidades-por-etapa.md:7235-7242`).
- **B205 (Etapa 50)** — a tela de Lotes ganhou um pedido novo (`GET /materiais/:id/lotes/resumo`, `routes/almoxarifado/extended.js:1307`) e
  **manteve** a B204: *"a tela agora mostra o efeito disso, não o muda"* (`:7243-7250`).
- **B231 (Etapa 58)** — deu à entrega o **direito** de escolher o lote no "Sai de" e descartou *"escolher o lote sozinho (o mais antigo, o
  que vence primeiro) — é regra de estoque, não de tela"* (`:7410-7414`).
- **Leitura:** as três adiaram por **escopo** (etapa de relatório, etapa de tela), não por uma regra de negócio contra o FEFO — todas
  apontam "etapa própria". **Esta é a etapa própria.** A regra escolhida é a que o sistema já usa em três lugares (seletor da Movimentação,
  dica da fila, comentário do motor). **A B204 é revogada à vista para a entrega de material com controle de lote** (B1320); para
  material sem controle de lote e para os demais fluxos internos, ela continua.

### O caso real hoje (testes que leem a linha sem lote em material **com** `controle_lote`)

O gatilho medido é `controle_lote = 1` (B1321). Dos 7 arquivos que leem `lote_id IS NULL` (grep), só os de material com controle de lote
mudam de número; `trocaSeparacao`, `substituicaoOrigem`, `quantidadeArredondadaIntegracao` usam material **sem** controle (ficam). Os que
mudam (contados, não estimados):

| Arquivo:linha | Hoje afirma | Depois da 197 |
|---|---|---|
| `server/tests/api/preSelecaoColetaIntegracao.api.test.js:143-152` (controle histórico, automático de 5; L1 6 vence antes, L2 9) | L1 6, L2 9, sem lote −5 na XP-01 | L1 1, L2 9, nenhuma linha sem lote (FEFO tira 5 de L1) |
| `…preSelecaoColetaIntegracao.api.test.js:224-240` (o caso real da 189/196) | XB-01/L1 0, XP-01/L2 **3**, sem lote **−3** | XB-01/L1 0, XP-01/L2 **0**, nenhuma linha sem lote |
| `…preSelecaoColetaIntegracao.api.test.js:295-305` (C449, R2 no automático 4, L1 com 2 depois de R1) | L1 2, L2 9, sem lote −4 | L1 **0**, L2 **7**, nenhuma (FEFO divide: 2 de L1 + 2 de L2 — RN-197.02) |
| `server/tests/api/origemSeparacaoEmDuasVezesIntegracao.api.test.js:137-152` (cenário 1) | livro `['SAIDA', null, null, 3]`, `YP-01/-=-3` | livro `['SAIDA', null, 'L2', 3]`, sem linha sem lote; exclusão volta igual |
| `…origemSeparacaoEmDuasVezesIntegracao.api.test.js:154-161` (controle "sem a feature" da 196) | 6 no automático sem lote, `YP-01/-=-6` | 6 no automático **por lote** (L1 3, L2 3 — sem validade, empate pelo código); a prova da 196 passa a ser o **livro** (sem saída estrita de YB-01) |
| `…origemSeparacaoEmDuasVezesIntegracao.api.test.js:282-…` (cenário 5, pelo serviço) | sem lote −3 | sem linha sem lote |
| `server/tests/api/loteControleObrigatorio.api.test.js:151-164` e `:166-182` (*"entrega de material com controle_lote passa SEM lote"*) | 200, total 15 / exclusão 20 | continuam 200 e os totais; o **nome** mente (passa a sair do lote) — renomear e conferir o lote (15, depois 20) |

**Achado de Fase 0 (bomba-relógio de data):** `preSelecaoColetaIntegracao.api.test.js:118`, `:268` gravam `L1` com validade **2026-11-10**
(literal). `isVencido` compara com hoje (`lotService.js:160-164`): a partir de **2026-11-11** o L1 vence e esses cenários mudam sozinhos
(a sugestão some, a separação e a entrega de L1 recusam). Esta etapa reescreve esses testes → troca a data por uma relativa a hoje (+5 e +45
dias). Outros arquivos com validade literal de 2026-11/12 (`filaSugestaoColeta`, `filaSugestaoColetaIntegracao`, `sugestaoDeColeta`) **não**
são tocados aqui: registrar no fechamento como achado (medir se injetam `hojeISO` antes de prometer).

### A separação automática e a caixa (pergunta do item)

- A 2ª rodada **sem "Sai de"** não grava lote nenhum: a parte sem origem da caixa não tem lote (RN-196.03; "só lote não vira origem",
  `requisitionService.js:1443`). **A caixa não sabe de qual lote veio** — e não precisa: separar não move estoque (B1314).
- Logo a entrega **não tem** "o mesmo lote que a separação contou" para a parte sem origem. Ela escolhe pelo FEFO na hora da baixa. A parte
  **com** origem (a 196, `quantidade_origem_separacao`) continua estrita no par guardado — **intocada**.
- Se o separador pegou fisicamente outro lote que não o que vence primeiro, o livro diverge da prateleira — como hoje diverge sempre
  (hoje vai para "sem lote"). O caminho para acertar existe: escolher o lote no "Sai de" da entrega (B231). Vai na frase nova da fila.

### Quem mais usa a saída automática sem lote (escopo medido, não ampliado)

`grep "registrarMovimentacao(db"` em `services/` e `routes/`: 13 arquivos. Os que **declaram** `exigeLote: true` (manual v1/v2, transferência,
recebimento, devolução, não conformidade, materialService) já têm lote. Os que chamam SAIDA sem lote e sem campo: **entrega de requisição**
(esta etapa), **entrega de EPI** (`epiService.js:220-229`, sem lote nem série) e os internos de terceiros/sucata/inspeção (outros tipos e
regras). **Escopo: só a entrega de requisição.** A EPI fica como está (C465).

### Reserva, travas, exclusão, devolução

- **Reserva por material** (CLAUDE.md, saldo global): as baixas do item são `[excedente sem reserva, ...reservas]` (`:2024-2036`); cada
  pedaço leva o `reserva_id` dele. Dividir um pedaço automático em fatias por lote **mantém o `reserva_id`** em cada fatia — o motor consome
  a reserva por quantidade (a soma é a mesma). Nada muda na reserva.
- **Travas:** a escolha do lote lê o saldo **dentro** da seção que a entrega já segura (`comTravaDaRequisicao`, `:1699`: trava por requisição
  por fora, por material de todos os itens por dentro). Nenhuma porta nova; o motor roda `naTravaDoMaterial`, que não aninha fora de
  `comLockDosMateriais` (passa direto dentro dela). **Sem teste de corrida novo**: a leitura e o claim ficam sob a mesma trava que já
  serializa as oito portas do disponível; a fatia é calculada imediatamente antes da sua chamada ao motor.
- **Exclusão** (`excluirSemTrava` `:2247`) já devolve **por saída** com o `lote_id` dela (`:2351`, `:2383`, B232) e confere que o livro soma o
  entregue: N saídas por item somam igual. A ENTRADA da saída automática vai para a **padrão** (sem endereço no livro — D (51), já
  declarado): o lote volta, o endereço pode ser outro.
- **Devolução citando a saída** herda o lote dela (B233): a devolução de uma entrega automática passa a voltar **para o lote** (hoje volta
  sem lote). Efeito desejado; conferir no teste de integração.
- **Saldo negativo permitido** com lote (`stockService.js:2247-2255`): a fatia nunca passa do saldo do lote, então não negativa lote; o resto
  vai pelo ramo sem lote como hoje.

### Telas e textos que deixam de ser verdade

- **C462** — `client/src/utils/coletaTexto.js:48-67` (`textoAvisoPegarEm`): os casos `NENHUM_ENDERECO_COBRE` (`:50-53`), `PLANEJADA_NAO_COBRE`
  (`:54-57`) e `PLANEJADA_INDISPONIVEL` (`:58-62`) dizem *"… troca a origem da separação (a entrega passa a sair automática)"* — regra revogada
  pela 196 (B1314). Usada por `FilaSeparacao.js:183` e `listaColetaPdf.js:60`.
- **`NA_ENTREGA_ESCOLHA_O_LOTE`** (`coletaTexto.js:42`): *"a saída automática não escolhe lote"* — deixa de valer para material com controle
  de lote. A fila **não sabe** se o material controla lote: o item da fila (`requisitionService.js:1016-1032`) não tem o campo e o SELECT
  (`:967-973`) não lê `ma.controle_lote`.
- **Tela de Lotes**, nota do resumo (`client/src/components/almoxarifado/LotesAlmoxarifado.js:605-609`): *"Saídas que não informam lote
  (como a entrega de requisição) … não baixam de lote nenhum"*. **Relatório Saldo por lote**, nota (`server/services/almoxarifado/reportRegistry.js:660-664`):
  *"(a entrega de requisição, por exemplo)"*. Nenhum teste lê essas notas (grep `baixam de lote`: só o próprio `.js`).
- Testes de tela das frases: `FilaSeparacao.test.js` (18 ocorrências, `:270-335`), `coletaTexto.test.js` (14), `listaColetaPdf.test.js` (2),
  `RequisicoesSeparacaoPreSelecao.test.js:82` (comentário). **O C462 não é 15 min**: ~35 min com a reescrita (contado).

### Spec errada (corrigir à vista no fechamento — regra 5)

`specs/modulo-almoxarifado/10-lotes-series-etiquetas/README.md:730-731`, tabela da pendência (g): a linha da **exclusão** diz *"devolve sem
lote — não volta para o lote de onde saiu"* — **errada desde a Etapa 58** (B232: devolve por saída, com o lote dela; `requisitionService.js:2383`).
A linha da **entrega** (*"baixa sem lote"*) passa a valer só para material sem controle de lote.

## Caminhos pesados

| Caminho | O que faz | Medida | Decisão |
|---|---|---|---|
| (a) opção nova no **motor** (`loteAutomatico: 'FEFO'`) | o motor escolhe e divide os lotes numa chamada | o motor grava **um** movimento por chamada e devolve `mov.id` (`requisitionService.js:2119`); dividir lá muda o retorno para 13 arquivos chamadores e abre a porta para EPI e internos sem medir | **descartado** |
| (b) **chamador** (entrega) divide a parte automática em fatias por lote, uma chamada ao motor por fatia, com `lote_id` (vai a `claimSaldoDoLote`) | regra só da entrega; motor intocado | a passada 2 já é um laço por pedaço; a fatia herda o pedaço (reserva, item, entregue); ~30 linhas | **escolhido** |
| (c) recusar quando nenhum lote elegível cobre | a entrega para com mensagem | a aprovação e a separação aceitaram pelo disponível do material, que conta lote bloqueado/vencido (`lotService.js:8-10`): gesto posterior recusando o anterior (Fase 2, 4ª pergunta) e contra a decisão do cliente de 2026-08-10 (`stockService.js:1325-1333`) | **descartado agora** — o resto cai na linha sem lote, como hoje (B1323, C464) |
| (d) descontar dos lotes o separado de **outras** requisições (planejadas) | preserva a origem guardada de R2 | só resolve no nível do lote, não do par endereço+lote (o claim do lote drena a localização resolvida primeiro); o automático sem lote também não desconta hoje; +30 min | **descartado agora** (B1326, C463) |

## Regras

- **RN-197.01** — Entrega de requisição, material com `controle_lote = 1` e **sem série** na entrega: a parte **automática** (pedaço
  `comOrigem: false`, passada 2) sai **por lote**, na ordem de `lotService.listarLotesDoMaterial` — só lotes com `elegivel` (ATIVO e não
  vencido, ou vencido com vencimento liberado) e `saldo > 0`; validade crescente, sem validade por último, empate pelo código. Cada fatia
  é uma SAIDA com `lote_id`. *Cenário (o real):* L1 3 em XB-01, L2 3 em XP-01 (padrão), parte da origem XB-01/L1 3 + automático 3 →
  livro `SAIDA XB-01 L1 3` + `SAIDA — L2 3`; L1 0, L2 0, **nenhuma linha sem lote**.
- **RN-197.02** — Quantidade maior que um lote: divide pelos lotes, na ordem; cada fatia = `min(resto, saldo do lote)`, **uma SAIDA por
  lote**. *Cenário:* L1 2 (vence em +5 dias), L2 9 (+45), automático 4 → `SAIDA L1 2`, `SAIDA L2 2`; L1 0, L2 7.
- **RN-197.03** — O que os lotes elegíveis não cobrem sai **sem lote, como hoje** (`claimSaldoSemLote`: linhas sem lote positivas, depois o
  resto na padrão, podendo ficar negativo). Lote bloqueado, reprovado ou vencido sem liberação **nunca** é baixado pelo automático.
  *Cenário:* L1 2 elegível, L2 3 BLOQUEADO, automático 4 → `SAIDA L1 2`, `SAIDA — 2`; L2 3 intacto; linha sem lote −2 na padrão; 200.
  *Cenário 2:* L1 vencido com liberação, L2 válido → L1 sai primeiro (vence antes).
- **RN-197.04** — Material **sem** `controle_lote` (mesmo com saldo em lote): sem mudança (B204 continua). *Cenário:* o de
  `trocaSeparacao`/`substituicaoOrigem` — números iguais.
- **RN-197.05** — Item com **série**: sem mudança (o lote vem das séries, `:2099`). *Cenário:* material com lote e série, automático com
  séries de L2 → uma SAIDA de L2 com as séries, como hoje.
- **RN-197.06** — A parte **com origem** (a planejada da 196 ou o "Sai de" escolhido) não muda: estrita no par, passadas 0/1, antes do
  automático. *Cenário:* o real (RN-197.01) — a 1ª SAIDA continua `XB-01 L1 3` estrita; a 196 inteira verde.
- **RN-197.07** — Reserva: cada fatia carrega o `reserva_id` do pedaço que a originou; o excedente sem reserva continua **primeiro**.
  *Cenário:* reserva 4 (aprovação com saldo 4) + excedente 2 que chegou depois, automático 6 com L1 3 e L2 3 → excedente: `L1 2`; reserva:
  `L1 1`, `L2 3`; a reserva fica consumida 4/4 e `quantidade_reservada` do material volta a 0.
- **RN-197.08** — Os lotes são lidos **na hora de cada fatia**, depois das passadas 0/1 e das fatias anteriores, dentro da seção que a
  entrega já segura. *Cenário:* dois itens do mesmo material na mesma requisição, ambos automáticos, L1 3 e L2 3, 2 + 2 → item 1: `L1 2`;
  item 2: `L1 1`, `L2 1`.
- **RN-197.09** — Falha no meio: cada fatia é uma baixa — o entregue do item soma a fatia logo depois dela (a regra de hoje, por baixa). Se a
  2ª fatia falhar, a 1ª fica baixada **e** contada; nada fica sem registro. *Cenário (serviço, motor espiado):* automático 4 em L1 2 + L2 2,
  o motor lança na 2ª chamada → erro `⟨material⟩: ⟨msg⟩`; L1 0, L2 2, entregue do item 2, uma SAIDA no livro.
- **RN-197.10** — Excluir a requisição devolve cada fatia ao **seu lote** (B232, sem código novo); a devolução citando a saída herda o lote
  dela (B233). *Cenário:* o real → excluir → L1 3 em XB-01, L2 3 na padrão XP-01, nenhuma linha sem lote; devolução de 1 citando
  `SAIDA L2` → ENTRADA_DEVOLUCAO com `lote_id` de L2.
- **RN-197.11** — O automático **não desconta** dos lotes o que outra requisição separou com origem guardada (como o sem lote não desconta
  hoje). Se ele tirar dali, a entrega da outra recusa com a literal que já existe (*"⟨material⟩: a origem da separação (⟨end⟩) não serve
  mais (⟨motivo⟩) — entregue escolhendo de onde sai"*). *Cenário (documenta, não conserta):* R1 separa 4 de XB-01/L1 (L1 4, L2 9; L1 vence
  antes); R2 separa 4 no automático e entrega primeiro → R2 tira `L1 4`; a entrega de R1 → 400 com a literal; nenhuma linha sem lote.
- **RN-197.12** — A fila diz se o material controla lote: cada linha de item ganha `controle_lote` (booleano). A dica (C462) para de
  dizer "troca a origem" e, com lote, diz o que o automático faz (literais abaixo).
- **RN-197.13** — As notas da tela de Lotes e do relatório *Saldo por lote* deixam de dar a entrega de requisição como exemplo de saída que
  não baixa lote (literais abaixo).

## Contrato congelado

Nenhuma rota nova; payloads e respostas iguais, salvo o aditivo da fila.

- **`PUT /api/almoxarifado/requisicoes/:id/entregar`** (`routes/almoxarifado.js:4758`) — payload igual; resposta igual
  (`{ success, status, parcial, entregas }`, `requisitionService.js:2225-2228`). Recusas iguais, nenhuma literal nova (a fatia só vai a lote
  elegível com saldo, sob a trava; se o motor ainda recusar, a mensagem é a dele, prefixada pelo material como hoje, `:2122`).
  **Livro:** a parte automática de material com controle de lote vira **uma SAIDA por lote** (`lote_id` preenchido,
  `localizacao_origem_id` nulo, como o automático de hoje); o resto não coberto, uma SAIDA sem lote.
- **`PUT /api/almoxarifado/requisicoes/:id/separacao`** e **`/separar`** (`:4655`), **`DELETE /requisicoes/:id`**, **`/devolver-separado`**,
  **`POST /devolucoes`** — iguais.
- **`GET /api/almoxarifado/fila-separacao`** (`:4638`) — cada item ganha **`controle_lote`** (`true`/`false`), aditivo.
  Servidor: `ma.controle_lote` no SELECT (`requisitionService.js:967-973`) e `controle_lote: Number(i.controle_lote) === 1` nas `linhas`
  (`:1020-1032`).
- **Interno (tronco → galhos):** `plano.controleLote` (booleano, lido uma vez por item no plano da entrega) e a função pura
  `dividirPorLotes(lotes, quantidade)` → `{ fatias: [{ lote_id, quantidade }], resto }` (entrada: a lista de `listarLotesDoMaterial` filtrada
  por `elegivel && saldo > 0`, na ordem dela; arredonda por `Q.qtd`). Exportada para o teste.
- **Literais novas — `client/src/utils/coletaTexto.js`:**
  - `NA_ENTREGA_LOTE_AUTOMATICO` = *" Na entrega, o resto sai do lote que vence primeiro; para tirar de outro lote, escolha-o no 'Sai de'."*
  - `NA_ENTREGA_ESCOLHA_O_LOTE` **fica** (material com lote **sem** controle de lote) = *" Na entrega, escolha o lote no 'Sai de': a saída
    automática não escolhe lote."*; sufixo = `it.controle_lote ? NA_ENTREGA_LOTE_AUTOMATICO : NA_ENTREGA_ESCOLHA_O_LOTE`, nas mesmas
    condições de hoje (`pegar_em.lote_codigo` / `lote_separacao_codigo`).
  - `NENHUM_ENDERECO_COBRE`: *"Nenhum endereço tem tudo: pegue ⟨q⟩ aqui. Se o resto for separado depois de outro endereço, o que sair daqui
    continua saindo daqui na entrega."* + sufixo (se lote).
  - `PLANEJADA_NAO_COBRE`: *"Já separado de ⟨cod⟩: o resto não cabe lá. O que já foi separado continua saindo de lá; o resto, separado de
    outro endereço, sai no automático na entrega."* + sufixo (se `lote_separacao_codigo`).
  - `PLANEJADA_INDISPONIVEL`: *"Já separado de ⟨cod⟩, que não pode mais ser sugerido (endereço bloqueado ou inativo, em área especial ou lote
    bloqueado/vencido). Confira antes de separar o resto: na entrega, o que já foi separado sai de lá — se lá não servir mais, a entrega pede
    para escolher de onde sai."* + sufixo (se `lote_separacao_codigo`).
- **Literais novas — notas:**
  - `LotesAlmoxarifado.js:605-609`: *"O saldo de cada lote é o atribuído a ele. Na entrega de requisição de material com controle de lote,
    o que sai no automático baixa do lote que vence primeiro — entregas anteriores a esta mudança podem estar em "sem lote atribuído". Saídas
    que não informam lote nos outros casos (material sem controle de lote, entrega de EPI) e o ajuste de saldo total não baixam de lote nenhum;
    entradas sem lote (por exemplo, antes de ligar o controle de lote) também ficam fora dos lotes. Lotes + sem lote atribuído = físico total."*
  - `reportRegistry.js:660-664`: *"O saldo de cada lote é o ATRIBUÍDO a ele. Saídas que não informam lote (a entrega de EPI, ou a de requisição
    de material sem controle de lote) e o ajuste de saldo total não baixam de lote nenhum — elas aparecem na linha "Sem lote atribuído", que
    pode ser negativa. Na entrega de requisição de material com controle de lote, o automático baixa do lote que vence primeiro. Lote + Sem
    lote atribuído = físico total. Lote negativo aparece (material que permite saldo negativo). Material com controle de lote que nunca teve
    lote aparece só com a linha "Sem lote atribuído". Materiais inativos ficam fora."*

## Tasks (sort topológico)

- **T0 — tronco — a parte automática por lote** (`requisitionService.js`, só `entregarSemTrava`).
  1. No laço do plano (`:2040-2062`), ler `controle_lote` do material (um `SELECT` por item, como `controle_serie` em `:1761`) e guardar
     `plano.controleLote`.
  2. `dividirPorLotes` (pura) + leitura `lotService.listarLotesDoMaterial(db, material_id, { apenasComSaldo: true })` filtrada por `elegivel`.
  3. Na passada 2 (`:2078-2138`): para pedaço `!comOrigem && plano.controleLote && !seriesPorItem.has(item.id)`, ler os lotes **ali**, dividir,
     e chamar o motor uma vez por fatia (`lote_id` da fatia, `reserva_id` do pedaço) e uma vez para o `resto` (sem lote, como hoje). Extrair o
     corpo de hoje (chamada + `movimentosDoItem.push` + `UPDATE` relativo do item) para uma função interna `baixar(plano, quantidade, extra)`
     — cada fatia passa por ela (RN-197.09 sai de graça).
  4. Testes novos em `server/tests/api/entregaAutomaticaPeloLote.api.test.js` (molde de setup: `origemSeparacaoEmDuasVezesIntegracao.api.test.js:60-115`;
     validades **relativas** a hoje): `dividirPorLotes` puro (vazio, um lote cobre, dois lotes, sobra resto, arredondamento 0,1+0,2) e pela
     **rota** RN-197.01, .02, .03 (bloqueado e vencido sem liberação; vencido liberado primeiro), .04, .05, .07, .08, .11; pelo **serviço**
     RN-197.09 (motor espiado: `stockService.registrarMovimentacao` substituído e restaurado no `finally`, molde `alertaReprovadoExecutado.api.test.js:300-305`).
  5. **Reescritas no mesmo commit** (senão a suíte fica vermelha entre commits): as 7 linhas da tabela da Fase 0 (`preSelecaoColetaIntegracao`
     ×3 + datas relativas em `cenarioLote`/`duasJanelas`; `origemSeparacaoEmDuasVezesIntegracao` ×3; `loteControleObrigatorio` ×2 — nome e
     conferência do lote). Cada reescrita diz no comentário *"Etapa 197 (RN-197.xx): era … (B204)"*.
  *Controles (cada um tem de derrubar o que diz):* (i) tirar o ramo novo (automático sem lote) → caem RN-197.01/02/07/08 e as 7 reescritas;
  (ii) não filtrar `elegivel` → cai RN-197.03 (400 *"Lote … esta bloqueado …"*); (iii) ordenar por código em vez de FEFO → cai RN-197.02 e o
  "vencido liberado primeiro"; (iv) ler os lotes uma vez por item em vez de por fatia → cai RN-197.08 (2ª fatia de L1 recusada); (v) gravar
  o entregue só no fim do item → cai RN-197.09; (vi) aplicar a material sem `controle_lote` → cai RN-197.04 (e `trocaSeparacao` muda).
  *Estimativa:* 1h10 (código 25 min, testes novos 30 min, reescritas 15 min).
- **T1 — galho — fila, C462 e notas** (contra o contrato acima; não depende do código da T0, só do contrato).
  `ma.controle_lote` + `controle_lote` nas linhas da fila (servidor, aditivo; teste no `filaSugestaoColeta.api.test.js`: o campo vem `true`
  num material com controle e `false` sem); `coletaTexto.js` (três casos + sufixo); `LotesAlmoxarifado.js` e `reportRegistry.js` (notas);
  reescrever `coletaTexto.test.js`, `FilaSeparacao.test.js:270-335`, `listaColetaPdf.test.js` com as literais novas (com e sem
  `controle_lote`); teste da nota da tela de Lotes (`LotesAlmoxarifado.test.js`: a frase nova aparece no resumo).
  *Controles:* frase velha → caem os de `coletaTexto` e `FilaSeparacao`; sufixo ignorando `controle_lote` → cai "sem controle mantém
  'escolha o lote'"; campo fora do SELECT → cai o teste da fila (`undefined`).
  *Estimativa:* 35 min. Se rodar em paralelo à T0, em worktree (mexe em `requisitionService.js` noutra região: `:967-1032`).
- **T2 — tronco (fecha) — integração cruzando as partes** (depois de T0 e T1), em `server/tests/api/entregaAutomaticaPeloLoteIntegracao.api.test.js`:
  - **pela rota:** o caso real ponta a ponta — `GET /fila-separacao` (o item traz `controle_lote: true`, aviso `PLANEJADA_NAO_COBRE`) →
    1ª rodada no par sugerido → chega L2 → 2ª rodada sem "Sai de" → `PUT /entregar` de um clique → livro (`XB-01 L1 3` estrita, `— L2 3`) →
    `GET /materiais/:id/lotes/resumo` com `sem_lote_atribuido` **0** e L2 0 → `POST /devolucoes` de 1 citando a SAIDA de L2 (volta ao L2) →
    `DELETE /requisicoes/:id` → saldos de antes da 1ª entrega (menos a devolução já feita, conferida pelo número);
  - **pelo serviço:** `separarRequisicao` + `entregarRequisicao` + `excluirRequisicao` direto, com reserva parcial (RN-197.07) e dois lotes
    (RN-197.02);
  - **controle "sem a feature"** em cada um: o mesmo fluxo com material **sem** `controle_lote` dá os números de hoje (linha sem lote −3) —
    prova que a diferença vem da regra, não do cenário.
  *Controle:* T0 sabotado (i) → os dois cenários caem juntos e o controle "sem a feature" fica igual.
  *Estimativa:* 30 min.

Ordem: **T0 → T2**; T1 em paralelo a T0 (worktree) ou logo depois (é curta). Sem teste de corrida novo (Fase 0, "Travas").

## Letra B proposta (para `docs/almoxarifado-novidades-por-etapa.md`)

- **B1320** — **Revoga a B204 (e o "sem escolha, continua não baixando de lote" da B231) para a entrega de material com controle de lote:**
  a parte automática baixa do lote que vence primeiro (FEFO), a régua do seletor da Movimentação e da dica da fila. A B204/B205/B231 adiaram
  por escopo (etapa de relatório/tela) e pediram etapa própria; esta é ela. **Descartado:** o lote mais antigo por entrada (não é o critério de
  validade que o resto do sistema usa); o lote que a fila sugeriu (a sugestão não é gravada e muda com o saldo).
- **B1321** — O gatilho é o **cadastro** (`controle_lote = 1`) e item sem série. **Descartado:** "qualquer material com saldo em lote" — muda
  materiais que o cadastro diz não controlar lote, e os testes da entrega sem controle (`trocaSeparacao`, `substituicaoOrigem`) mudariam de
  número sem pedido.
- **B1322** — Elegível = a régua do motor (`listarLotesDoMaterial.elegivel`): bloqueado e reprovado nunca; vencido só com vencimento liberado
  (e, por FEFO, sai primeiro). **Descartado:** excluir também o vencido liberado (a liberação existe justamente para destravar o consumo).
- **B1323** — O que nenhum lote elegível cobre sai **sem lote, como hoje** (pode deixar a linha sem lote negativa). **Descartado:** recusar a
  entrega — a aprovação e a separação aceitaram pelo disponível do material, que conta lote bloqueado/vencido; recusar só na entrega é o
  gesto posterior recusando o anterior, e contraria a decisão do cliente de 2026-08-10 de não travar a entrega por lote. O conserto certo
  (o disponível descontar lote não elegível) é etapa própria (C464).
- **B1324** — Uma **SAIDA por lote**. **Descartado:** uma SAIDA com vários lotes (o livro tem um `lote_id` por linha; exclusão e devolução
  herdam o lote por saída).
- **B1325** — A divisão mora no **chamador** (entrega), não no motor. **Descartado:** opção nova do motor (um movimento por chamada; mudaria o
  retorno para 13 chamadores e abriria EPI e internos sem medir).
- **B1326** — O automático **não desconta** dos lotes o separado de outras requisições com origem guardada (RN-197.11). **Descartado:**
  descontar por lote (não protege o par endereço+lote, o sem lote também não desconta, +30 min). A recusa que sobra é a literal clara de
  hoje, com saída ("Sai de").
- **B1327** — **Baixas antigas sem migração:** a linha sem lote negativa que já existe fica (não se sabe de que lote saiu fisicamente);
  regulariza-se pela contagem/ajuste com localização, que absorve as negativas sem lote (`stockService.js:515-531`, `absorverNegativosSemLote`). **Descartado:** corrigir no
  boot (inventaria um lote).
- **B1328** — A fila ganha `controle_lote` para a frase dizer a verdade nos dois casos. **Descartado:** uma frase só "para os dois casos"
  (seria falsa para um deles).

## Letra C proposta

- **C451** — **resolvido** na entrega para material com controle de lote (fica: material sem controle, B1321).
- **C453** — **resolvido** (a 196 fez a parte do endereço; esta, a do lote).
- **C462** — **resolvido** (T1).
- **C463** — a parte automática pode tirar de um lote que outra requisição separou com origem guardada; a entrega da outra recusa com *"a
  origem da separação (⟨end⟩) não serve mais …"*. O que fazer: entregar escolhendo de onde sai. Conserto: a caixa por endereço/lote
  (vários pares por item, C461).
- **C464** — com o saldo só em lote bloqueado, reprovado ou vencido, a entrega continua passando e o resto vai para "sem lote atribuído"
  (negativo), com o lote intacto. O que fazer: liberar o lote ou acertar pela contagem. Conserto: o disponível descontar lote não elegível
  (aprovação, separação e entrega juntas).
- **C465** — a **entrega de EPI** e as saídas de material sem controle de lote continuam sem lote (B204 nesses fluxos).

## O que não cobre

- Material sem controle de lote; entrega de EPI; os outros fluxos internos (C465).
- As linhas sem lote negativas que já existem (B1327).
- O separado de outras requisições nos lotes (C463) e o lote não elegível no disponível (C464).
- Endereço do estorno da exclusão: a ENTRADA da saída automática vai para a padrão (D (51), já declarado).
- As validades literais de 2026-11/12 em `filaSugestaoColeta*` e `sugestaoDeColeta` (achado; medir no fechamento).

## Cabe em 4h–5h?

**Cabe no teto, sem folga.** Análise (este plano) 1h; execução T0 1h10 + T1 35 min + T2 30 min = **2h15** (contra 1h–2h da estimativa); teste
2h. Total **~5h15**. O excesso é o **C462**, medido em ~35 min (32 asserções em 3 arquivos de teste + o campo novo da fila), não os 15 min
que o fechamento da 196 previu. **Corte, se a empresa segurar 5h:** a T1 inteira (C462 e as duas notas) vira etapa própria de texto — o motor
(T0 + T2) não depende dela e fecha o item 5 sozinho (1h + 1h40 + 2h = 4h40). Sem corte possível dentro do motor: sem as reescritas a suíte
fica vermelha; sem a T2 não há prova pela rota **e** pelo serviço.

## Fase 2 — revisão do plano (a fazer, revisor fresco)

Perguntas da skill + estas, específicas: (1) a fatia por lote com `reserva_id` do pedaço é aceita pelo motor quando a reserva é menor que a
fatia? (2) `listarLotesDoMaterial` conta linhas em localização bloqueada/área especial — o claim do lote também drena (documentado em
`stockService.js:356-367`); a soma bate com o que o claim tira? (3) seguir cada RN até o último gesto: entrega parcial → devolução à
prateleira → nova separação → entrega; exclusão; devolução citando a saída; estorno pelo livro de uma SAIDA automática com lote.

## Fase 2 — correções do revisor fresco (2026-11-05) — **MANDAM sobre o texto acima onde divergem**

Revisor fresco sobre `7f099fae`: 1 trava, 4 importantes, 3 menores, todos aceitos. A resposta da entrega (`{success,status,parcial,entregas}`,
`requisitionService.js:2187,2228`) não traz id de movimento: tela e PDF não mudam com N SAIDAs; só os testes que leem o livro.

1. **[TRAVA] RN-197.11 quebrava um fluxo que hoje funciona.** L1 4 em XB-01 (vence antes), L2 9. R1 separa 4 de XB-01/L1 (origem guardada); R2
   entrega 4 no automático primeiro. Hoje o automático só lê `lote_id IS NULL` (`stockService.js:467-471`) e R1 entrega com 200; com o FEFO, R2
   tiraria L1 e R1 tomaria 400 `não serve mais` — e o livro erraria o recall nos dois sentidos. **RN-197.11 passa a ser:** o saldo FEFO de cada
   lote **desconta a parte guardada de outras caixas**: `SUM(PARTE_ORIGEM_SQL)` dos itens com `lote_separacao_id = L`, requisição ativa em
   `STATUS_COM_CAIXA` (a consulta de `requisitionService.js:343-348`). Dos itens **desta** entrega, desconta a parte menos
   `plano.baixadoComOrigem` (a parte só cai no `finally`, `:2177` — senão desconta duas vezes). *Cenário:* R2 tira L2 4 e R1 entrega 200. Na
   **B1326**, o descartado passa a ser "não descontar". O **C463** encolhe para o conflito de par (L1 em dois endereços; o claim drena XB-01
   primeiro — `claimSaldoDoLote` resolve a localização e depois a maior linha).
2. **[IMPORTANTE] O FEFO escolhia lote retido.** (A) criado pela própria 197: entrega automática sai L1 3 → devolução de 1 para QUARENTENA citando
   a saída herda L1 (`returnService.js:140-141`) — ENTRADA_DEVOLUCAO em L1 + BLOQUEIO só no material (`:334-337`; `stockService.js:1677`) → R2
   entrega 1 no automático e o FEFO escolhe a peça da quarentena. (B) recebimento com inspeção entra na linha do lote (`receiptService.js:1817`),
   `quantidade_em_inspecao` no material. **T0.2:** saldo FEFO do lote = `saldo − SUM(ri.quantidade_em_inspecao WHERE ri.lote_id = L)`. Bloqueio e
   terceiros não têm lote: **C466** (limitação), com teste que documenta o cenário A.
3. **[IMPORTANTE] Reescrita faltando na tabela "contados":** `server/tests/api/lotesResumo.api.test.js:163-184` (teste 10, `E50-REAL`) afirma
   `{fisico:70, soma_lotes:100, sem_lote_atribuido:-30}` e passa a `{70, 70, 0}` — nome novo: "a entrega pela rota baixa do lote (era o resíduo da
   B204)". Entra na T0.5.
4. **[IMPORTANTE] Resíduo de ponto flutuante vira fatia zero e derruba a entrega no meio** (`listarLotesDoMaterial` filtra `saldo > 0`,
   `lotService.js:549`). **Contrato do `dividirPorLotes`:** entrada filtrada por `elegivel && saldo > Q.QTD_FOLGA`; cada fatia =
   `Q.qtd(min(resto, saldo))`, descartada se `<= Q.QTD_FOLGA`; `resto = Q.qtd(q − Σfatias)`. Teste puro: lote com 3e-7 → zero fatias.
5. **[IMPORTANTE] Data fixa estoura em 6 dias também em** `filaSugestaoColeta.api.test.js:133` e `filaSugestaoColetaIntegracao.api.test.js:117,129,179`
   (gravam `2026-11-10` e leem a fila real; em 11/11 caem `:136`/`:129` e `:185`). `sugestaoDeColeta.api.test.js` está a salvo (injeta `HOJE`). **T1:**
   datas relativas (+5 e +45 dias), cada lugar nominado. Sai do "O que não cobre".
6. **[MENOR]** Material com lote e negativo permitido: a fatia cai no `else` (`stockService.js:2248-2253`), grava −q em (padrão, L) e não drena XB-01
   (total do lote certo, mapa por endereço não). Um teste + frase na **B1324** ("com negativo permitido, a fatia não drena o endereço — o motor de hoje").
7. **[MENOR]** `listarSaidasElegiveis` tem `LIMIT 30` (`returnService.js:524`): com N saídas por entrega as antigas somem antes da lista de
   devolução — registrar no **C465** e no guia. A parte `resto` sem lote continua dando 400 na devolução citada — dizer no **C464**.
8. **[MENOR]** Fechamento: o manual muda em `docs/almoxarifado-manual-do-sistema.md:395`, `:712`, `:726` ("não escolhe lote", "linha sem lote",
   "posição ocupada").

**Tamanho:** a T0 sobe ~25 min → ~5h40 (estimado enviado: 4h a 5h). Diferença < 1 h do teto: sem reestimar agora; se o realizado passar de 5h, a
conclusão diz por quê. Corte disponível se preciso: a T1 (só texto) vira etapa própria — **mas o achado 5 (data fixa) não pode ser cortado**: sem
ele, três arquivos de teste ficam vermelhos em 11/11.

## Execução

- [x] Plano — `7f099fae`.
- [x] Fase 2 — `b21a81f5` (8 achados aplicados; o bloco "Fase 2 — correções" acima).
- [x] T0 — `ee835811`. `entregaAutomaticaPeloLote.api.test.js` 19/19 (puro + rota + servico; validades relativas); reescritas
  verdes: `preSelecaoColetaIntegracao` 9/9 (x3 + datas relativas), `origemSeparacaoEmDuasVezesIntegracao` 9/9 (x3),
  `loteControleObrigatorio` 12/12 (x2), `lotesResumo` 13/13 (teste 10); test:api 584/584, test:almoxarifado 44/0. Vizinhos
  `trocaSeparacao` 11/11, `substituicaoOrigem` 7/7, `quantidadeArredondadaIntegracao` 7/7; `filaSugestaoColeta` 12/12 e
  `filaSugestaoColetaIntegracao` 6/6 verdes hoje (data fixa so cai em 11/11 — T1). Controles (perl sobre LF, ancora = 1, md5
  ca246ba8 -> sabotado -> ca246ba8, restauro por copia): (i) sem o ramo -> 16 dos novos + as 9 reescritas caem (achado: a exclusao do
  `loteControleObrigatorio` nao sabia falhar — saida e estorno sem lote tambem fecham 20/0; ganhou a conferencia do lote antes de
  excluir, e cai); (ii) sem `elegivel` -> RN-197.03 x2 (400 "Lote L2 esta bloqueado"/"vencido"); (iii) por codigo -> RN-197.02 e o
  vencido liberado; (iv-a) lotes uma vez por item -> RN-197.07 (400 saldo insuficiente no lote L1); (iv-b) uma vez por entrega ->
  RN-197.07 e RN-197.08; (v) entregue so no fim -> RN-197.09 (entregue 0 != 2); (vi) sem o gatilho do cadastro -> RN-197.04;
  (vii) sem a parte guardada -> RN-197.11 x2; (viii) parte desta entrega inteira -> RN-197.11 "desta entrega"; (ix) sem inspecao ->
  T0.2; (x) sem descartar a fatia <= folga -> o puro (3e-7). **Divergencias:** (1) RN-197.02 com os codigos trocados (L2 vence
  antes, L1 depois) — senao o controle (iii) nao tinha como cair; (2) (vi) nao muda `trocaSeparacao`/`substituicaoOrigem`/
  `quantidadeArredondadaIntegracao` (o plano previa: os materiais deles nao tem saldo em lote, o FEFO nao acha nada) — so a RN-197.04
  pega; (3) no controle "sem a feature" da 196 a exclusao devolve L1 a PADRAO YP-01, nao a YB-01 (a automatica nao tem endereco no
  livro, D (51)) — afirmado no teste; (4) teste novo nao previsto: "desta entrega" (parte guardada do proprio item ja saida na passada
  0; a parte sai em 2 pedacos, excedente 1 + reserva 2). **Contrato para T1/T2:** `requisitionService.dividirPorLotes(lotes,
  quantidade)` exportada (entrada `[{lote_id, saldo}]` ja em ordem FEFO; saida `{fatias:[{lote_id, quantidade}], resto}`); interno
  `lotesParaOAutomatico(db, materialId, saiuDaOrigemPorItem)` e `plano.controleLote`; resposta de `/entregar` igual. A T0 nao tocou
  fila, `coletaTexto`, notas nem `client/`.
- [x] T1 — feita numa worktree e integrada na main por cherry-pick: `58227edf` (campo `controle_lote` na fila, servidor aditivo, e as
  validades dos testes `filaSugestaoColeta*` relativas a hoje — achado 5 da Fase 2), `d8a4f1d9` (C462 em `coletaTexto.js`: a dica e a
  lista de coleta param de dizer que separar de outro endereco troca a origem; sufixo `controle_lote ? NA_ENTREGA_LOTE_AUTOMATICO :
  NA_ENTREGA_ESCOLHA_O_LOTE`), `398d1e69` (notas da tela de Lotes e do relatorio Saldo por lote). Os hashes da worktree
  (3e00dc31/81ad8602/5cc3fc7a) nao existem mais. Medido na worktree: `filaSugestaoColeta` 13/0, `filaSugestaoColetaIntegracao` 6/0,
  `relatoriosSaldos` 16/0, `integracaoRelatoriosSaldos` 6/0, `lotesResumo` 13/0, tela 212/2913, build ok. Na main (rodada da T2): tela
  212/2913 e build ok — a T1 integrada confirma.
- [x] T2 — `e011affe`. `entregaAutomaticaPeloLoteIntegracao.api.test.js` 8/0 (isolado): pela rota, fila (`controle_lote: true`,
  `pegar_em` WB-01/L1 3, depois `PLANEJADA_NAO_COBRE`) -> 1a rodada no par sugerido -> chegam L2 1 (+20) e L3 4 (+45) -> 2a rodada sem
  "Sai de" -> entrega de um clique: `WB-01 L1 3` estrita + `— L2 1` + `— L3 1` (excedente, dividido dentro do pedaco) + `— L3 3`
  (reserva); resumo `{0,0,0}`, relatorio sem linha nao zero, rastreio de L2 pelo extrato `[ENTRADA 1, SAIDA 1 com a requisicao]`,
  extrato x fisico x linhas; devolucao de 1 citando a SAIDA de L3 volta ao L3; estorno pelo livro da SAIDA de L2 -> 400 (vinculada a
  requisicao); exclusao devolve cada saida ao seu lote, liquida da devolucao (`L3 2`), saldos = os de antes; estorno da DEVOLUCAO tira
  do L3 e a exclusao devolve a saida inteira. Pelo servico: reserva 4 + excedente 2, L1 3 e L2 3 -> `L1 2`/`L1 1 R`/`L2 3 R`, reserva
  4/4, exclusao por lote (na padrao, D (51)). Controle "sem a feature" em cada um (material sem `controle_lote`): sem lote -5 / -6, lotes
  intactos, o lote nao ve a requisicao. Controles positivos (perl sobre LF, ancora = 1, md5 4159c297 -> sabotado -> 4159c297, restauro
  por perl inverso): (S1) sem o ramo da T0 -> os 4 com lote caem, os 4 controles ficam verdes (o (i) do plano); (S2) fila com
  `controle_lote: false` -> os 3 fluxos da rota com lote; (S3) exclusao sem o lote da saida -> 5 (os de exclusao, inclusive 2 controles:
  a saida estrita de L1 tem lote); (S4) exclusao sem descontar a devolucao -> os 2 de devolucao viva. Rodada serial na main: test:api
  585/585 arquivos, test:almoxarifado 44/0, test:validation 4/0, test:safealter 3/0, test:sqlite 16/0, tela 212/2913, build ok.
  **Defeitos de producao:** nenhum. **Divergencias:** (1) nao ha rota de "rastreio do lote": o rastreio e o extrato do material
  filtrado pelo `lote_id` (cada movimento traz `requisicao_id`); (2) a SAIDA da entrega nao se estorna pelo livro (400 de proposito,
  `stockService.cancelarMovimentacao`): o teste afirma a recusa e estorna a DEVOLUCAO (ENTRADA_DEVOLUCAO com lote); (3) lotes L2 1/L3 4
  em vez de L2 3 do plano — com 3 a fatia coincidia com o pedaco e nao provava a divisao dentro do pedaco; (4) a parte da origem sai
  como excedente (sem `reserva_id`) e a reserva vai para o automatico — comportamento de antes (excedente primeiro), afirmado no livro.
- [x] Fase 5 — `838bb350` (M1), `1723b78c` (M2–M5), `351ee457` (M6), `6d4dec1d` (B1329 no novidades), `1ed41bb8` (2º fix-round). Ver abaixo.
- [x] Fechamento de documentação — commit "Etapa 197: fechamento - novidades, specs, mapa, guia, manual e planos": novidades (cabeçalho;
  seção da 197 com Antes → Agora e 6 cenários com as literais lidas de `coletaTexto.js`, `LotesAlmoxarifado.js`, `reportRegistry.js`,
  `DevolucoesAlmoxarifado.js` e `stockService.js`; **B1320** a **B1328** reescritas pelo que o código faz — a B1326 mudou de lado na Fase 2 —
  e inseridas **antes** da **B1329** que a Fase 5 já tinha gravado, sem duplicar; a B1329 ganhou o complemento do 2º fix-round; a B204 e a
  B231 anotadas à vista; **C449** atualizado (continua, mudou de forma), **C451** e **C453** resolvidos na entrega de material com controle
  de lote, **C462** resolvido; **C463** (resolvido na etapa, o número fica), **C464**, **C465**, **C466** e **C467** (a exclusão não limpa a
  origem guardada — o filtro de requisição ativa é a proteção, M3) novos; D (197); D (196) e D (136) anotadas; F (197)), spec 05 (status,
  última atualização, D (136) e D (196) anotadas, bloco "Etapa 197" com checklist e hashes), spec 10 (cabeçalho; a tabela da pendência (g):
  a linha da **exclusão** "devolve sem lote" **estava errada desde a Etapa 58** (B232) e a da entrega mudou — riscadas à vista; bloco
  "Etapa 197"), mapa (linhas da 05 e da 10), guia (cabeçalho — onde parou: 197 fechada, próxima C449 — e seção com roteiro de 7 passos; a
  nota da 196 anotada), manual (2.7 "onde a exigência de lote não se aplica"; 3.6 material com lote; 3.7 a posição ocupada; 4.5 o saldo do
  lote e a nota da tela; 7.5 a regra nova da parte automática por lote; 10.6 as frases da fila e o automático; 12.4 a herança da saída
  automática e a lista das 30; 21d a nota do Saldo por lote), este plano e o cabeçalho do plano da pausa. Verificação final, estimado ×
  gasto e controle de horas: fora deste commit (feitos por quem fecha a etapa).

## Fase 5 — três revisores frescos (2026-11-05)

Três revisores frescos, por leitura e execução, sobre `cbb2b66f` — com um fuzz de **~440 entregas sorteadas** (separar no par ou no
automático, entregar, devolver, excluir, com lotes de validades e status sorteados), conferindo físico × linhas × lotes × livro a cada passo:
**0 violações depois do conserto**, e o **mesmo** fuzz achava falhas antes (controle positivo do fuzz). **7 achados reais, ruído 0:**

- **M1 [DEFEITO, CRÍTICO]** — a RN-197.11 descontava a parte guardada (origem + lote) do total do **lote**, mas a fatia ia ao motor só com
  `lote_id`, e o `claimSaldoDoLote` drena a localização padrão primeiro e depois a maior linha — justo a guardada. L1 4 em ZB-01 (guardados
  por R1) e 2 em ZC-01: R2 automático 2 saía de ZB-01 e R1 tomava 400 *"a origem da separação (ZB-01) não serve mais"*; o mesmo com a parte
  guardada na padrão. Regressão da 197 (sem controle de lote, R1 entrega 200). **Consertado em `838bb350`** (B1329): lote **com** parte
  guardada de outra caixa volta de `lotesParaOAutomatico` com as `linhas` (lote, endereço), cada uma com o livre dela (saldo da linha − a
  parte guardada naquele par; a inspeção desconta no nível do lote), na ordem do claim (padrão, depois a maior), pulando livre 0, a linha
  sem endereço e a de endereço bloqueado; cada pedaço vai ao motor com `lote_id` + `localizacao_origem_id` e origem estrita. Lote sem guarda
  segue como na T0. Controles: fatia sem endereço → 4 caem; livre sem descontar o par → 5; sem pular a bloqueada → 1.
- **M2 [LACUNA]** — o resto sem lote **com reserva** (os RN-197.03 usavam requisição sem reserva): aprovada (reserva 4), L1 1 + L2
  bloqueado → L1 1 + sem lote 3, as duas com a reserva; reserva 4/4. `1723b78c`. Controle: resto sem `reserva_id` → cai.
- **M3 [LACUNA]** — o filtro de requisição ativa com caixa na parte guardada não tinha teste. **Achado lateral:** a exclusão da requisição
  **não** limpa `origem_separacao_id`/`quantidade_origem_separacao` (a linha fica CANCELADO/ativo 0 com a origem) — não mudado; **o filtro é
  a proteção** (registrado no **C467**). `1723b78c`. Controle: sem o filtro → cai.
- **M4 [LACUNA]** — a inspeção no **2º** lote (o T0.2 a punha no 1º). `1723b78c`. Controles: inspeção no 1º lote e "desconta de todos" → caem.
- **M5 [LACUNA]** — lote sem validade por último. `1723b78c`. Controle: nulos na frente (`lotService`) → cai.
- **M6 [TEXTO]** — as notas de Lotes e do relatório *Saldo por lote* não diziam que o que os lotes elegíveis não cobrem sai sem lote
  (B1323/C464). `351ee457` (teste novo no `relatoriosSaldos` (2g) para a nota do servidor, que não tinha). Controles: frase velha em cada
  lado → cai o teste dela.
- **2º fix-round [DEFEITO]** — achado ao revisar o conserto do M1: com `origem_automatica` (ou outro par), `saiDaOrigem` fica falso, o item
  não entra em `saiuDaOrigemPorItem` e `lotesParaOAutomatico` descontava a parte guardada **inteira** do próprio item. R1 separa 4 de
  ZB-01/L1, uma avulsa tira 1 de ZB-01, L1 2 em ZC-01; R1 entrega 4 no automático → `SAIDA ZC-01/L1 2` + `SAIDA sem lote 2`: ZP-01/− = −2 num
  material com `permite_saldo_negativo = 0` e ZB-01/L1 3 sobrando (lote inflado). **Consertado em `1ed41bb8`**: para o item desta entrega que
  não sai da origem, conta só `parteQueFica = parte − troca` (a conta do `finally`); quem sai da origem segue com `parte − baixadoComOrigem`.
  Descartado: não descontar nada (na entrega parcial o automático drenaria a linha que a parte que sobra ainda usa). Vermelho antes (2:
  própria parte e misto), verde depois; voltar a descontar a parte própria → caem os mesmos 2. **Caso anterior da própria 197** (T0), não
  da 196.

**Placar depois do 1º fix-round (sobre `351ee457`):** `test:api` **585/585**; `test:almoxarifado` **44/0**; `test:validation` **4/0**;
`test:safealter` **3/0**; `test:sqlite` **16/0**; tela **212 suítes / 2913 testes**; build ok (`CI=true`). **Depois do 2º fix-round (sobre
`1ed41bb8`):** `entregaAutomaticaPeloLote` **32/0** e os vizinhos verdes; `test:almoxarifado` **44/0**; `test:api` **585/585** (rodado sozinho depois do `1ed41bb8`; a falha de `superPadraoNoBoot` com `SQLITE_READONLY` na rodada do executor não se repetiu)
(sendo reconferido por quem fecha a etapa).

**Divergências do plano, em resumo:** (1) a Fase 2 mudou a RN-197.11 de "não desconta" para "desconta" (B1326) e acrescentou a inspeção, a
fatia de resíduo, a reescrita do `lotesResumo` e as datas fixas da `filaSugestaoColeta*` (o bloco "Fase 2 — correções" manda); (2) a T0
trocou os códigos da RN-197.02 (L2 vence antes) para o controle (iii) poder cair e achou que a exclusão do `loteControleObrigatorio` não sabia
falhar (ganhou a conferência do lote); (3) a T1 rodou numa worktree e entrou por cherry-pick (hashes da worktree descartados); (4) a T2 usou
L2 1 / L3 4 para provar a divisão dentro do pedaço e afirmou a recusa do estorno pelo livro da SAIDA (é de propósito); (5) a Fase 5 levou o
desconto do lote ao par lote + endereço (M1, B1329) e corrigiu a parte do próprio item (2º fix-round) — os dois furos estavam no código da T0,
que o plano não previa (a RN-197.11 do plano descontava "por lote"). **A spec 10 estava errada** (a exclusão "devolve sem lote", desde a
Etapa 58): riscada à vista. As validades literais da `filaSugestaoColeta*` saíram do "O que não cobre" (feitas na T1, `58227edf`).

**Retro (4 números):** rodadas de correção até verde: **2** (o fix-round da Fase 5 e o 2º); achados reais da Fase 5: **7** (2 defeitos de
motor, 4 lacunas de teste, 1 texto), ruído **0**; paralelismo: **T0 com T1 em worktree, T2 com os 2 revisores**, sem retrabalho; defeito
que escapou da 196: **nenhum conhecido** — o 2º fix-round achou um caso anterior da própria 197.

## Próxima tarefa detalhada

**"Entrega recusada quando outra requisição separou o mesmo material"** — item 6 da fila da estimativa
`docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas.md` (**motor, leitura sob trava**, estimado **4h**: análise 1h,
execução 1h, teste 2h). Fecha o **C449**. **É tronco**: a separação e a entrega rodam sob `serializarNaRequisicao` → `comTravaDaRequisicao`
(trava por requisição por fora, por material dos itens por dentro, Etapa 95), então ler o separado das outras caixas **dentro** da seção é
leitura sob a mesma trava que já serializa as portas do disponível — nenhuma porta nova.

**O C449 ainda existe? Sim, na forma "duas requisições no mesmo par escolhido" — medido em 2026-11-05 sobre `1ed41bb8`, sem consertar.**
- **Cenário (já é teste, e está verde afirmando o defeito):** `server/tests/api/preSelecaoColetaIntegracao.api.test.js:290` *"[Fase 5, C449]
  sugestao velha…"* — L1 6 em XB-01 (vence antes), L2 9 em XP-01; R1 e R2 de 4 recebem a mesma sugestão XB-01/L1; R1 separa 4 de XB-01/L1;
  **R2 separa 4 do mesmo par → 200** (a separação aceita); R1 entrega 200; **R2 entrega → 400** *"⟨material⟩: a origem da separação (XB-01)
  não serve mais (O saldo em XB-01 (2) não cobre a quantidade (4) — a saída tiraria de outros endereços) — entregue escolhendo de onde
  sai"*; nada baixado, nenhuma troca. A falha é segura (nada sai a mais), mas o gesto errado é a **separação** aceitar.
- **Mudou de forma com a 196/197:** a variante "R2 no automático esvazia o par de R1" **não existe mais** — o automático da entrega desconta,
  no par lote + endereço, a parte guardada das outras caixas (`lotesParaOAutomatico`, B1326/B1329; teste `:308` *"[Fase 5, C449 controle
  historico; Etapa 197]"* agora tira 2 de L1 + 2 de L2 e R1 não é afetada). E desde a 196 a conta é a **parte** da origem (`PARTE_ORIGEM_SQL`),
  não a caixa inteira. Sobra só o caso **estrito × estrito**.
- **Onde (a causa):** `server/services/almoxarifado/requisitionService.js`:
  - `checarOrigemItem` (`:1196`) — a régua única "este item pode sair desta origem/lote nesta quantidade", usada pela separação **e** pela
    entrega: confere `SUM(quantidade)` das linhas do par (`:1224-1226`) menos o `pedidoPorOrigem` **da mesma chamada** (`:1228-1232`). **Não
    desconta o que outra requisição separou dali.**
  - **Separação:** `separarSemTrava` (`:1312`; envelope `separarRequisicao` `:1307-1309`) chama `checarOrigemItem` em `:1459` com o
    `pedidoSeparacao`. Logo acima (`:1440-1455`) **já lê** o separado das outras no par — a query `outras` (`:1449-1452`,
    `SUM(PARTE_ORIGEM_SQL)` com `ir.requisicao_id <> ?`) — mas só para `regua.saldoOrigem`, que alimenta a **divergência** (`:1510-1511`:
    `maximo = min(base, saldoOrigem)`; `divergente = total < maximo`), não a aceitação. É aqui que o conserto mora.
  - **Entrega:** `entregarSemTrava` (`:1814`), `validarOrigemDaEntrega` (`:1904-1915`) chama `checarOrigemItem` (`:1908`) — também sem
    descontar as outras; quem entrega primeiro leva.
- **As réguas que já contam o separado de outras caixas (reaproveitar, não inventar):**
  - `PARTE_ORIGEM_SQL` / `parteOrigemSql` (`:68-74`, Etapa 196) — a parte da origem de um item (caixa limitada; legado `NULL` = caixa).
  - `lerDadosDaColeta` (`:330`; `planejados` `:342-348`) — a Fila: `SUM(PARTE_ORIGEM_SQL)` por (material, origem, lote), requisição
    `COALESCE(r.ativo,1)=1 AND r.status IN STATUS_COM_CAIXA`.
  - `lotesParaOAutomatico` (`:1749`; `guardadas` `:1759-1762`) — o mesmo filtro, por (lote, endereço), da 197.
  - A query `outras` da separação (`:1449-1452`) — **filtro diferente:** só `COALESCE(r.ativo,1)=1`, **sem** `r.status IN STATUS_COM_CAIXA`.
    Ponto de atenção: unificar com a Fila (uma requisição encerrada ou cancelada com origem gravada — ver C467 — não pode comprometer o par).
- **Caminho provável (a pesar na Fase 0/2):** na separação, para a entrada com endereço, `checarOrigemItem` (ou uma conferência ao lado,
  só na separação) recebe o comprometido das outras no par e recusa quando `saldo do par − parte das outras − pedido da chamada < qty`, com
  literal nova que diga quanto está separado para outra requisição e mande escolher outro endereço ou atualizar a fila. A entrega fica como
  está (o 400 seguro continua para dado antigo já sobrecomprometido). **Decisões para a letra B:** recusar × avisar e aceitar (a divergência
  já usa o mesmo número para pedir motivo — medir na tela, `RequisicoesList.js`, se a janela de separação já limita o "Sai de" por ele);
  par só com endereço × também "só lote" (`origemId` nulo: a query `outras` hoje só roda com endereço); a mensagem do 400.
- **Testes que mudam:** `preSelecaoColetaIntegracao.api.test.js:290` (a separação de R2 passa de 200 para 400 — reescrever dizendo "era");
  medir com grep `não serve mais` e `saldoOrigem` quantos outros afirmam a separação aceita no par comprometido (`separacaoOrigemPorItem`,
  `origemSeparacaoEmDuasVezesIntegracao`, `separacaoTetoFisico*`). Controle positivo: tirar o desconto → o cenário volta a 200.
- **Corrida:** duas separações do mesmo material já são serializadas pela trava por material (Etapa 95, B476) — a segunda lê a parte da
  primeira já gravada. Se o plano quiser teste de corrida, o gesto concorrente sai do contexto do teste (CLAUDE.md, molde
  `exclusaoSerieQueVoltou` RN-15).

**Já pronto, não reabrir:** a parte da origem (196), a entrega automática pelo lote e o desconto no par (197), a pré-seleção (189), a ordem
das baixas (136), o teto físico da separação por material (95).
