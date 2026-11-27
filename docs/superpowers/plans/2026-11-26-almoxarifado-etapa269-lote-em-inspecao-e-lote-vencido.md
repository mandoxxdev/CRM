# Etapa 269 — Entrega com o lote ainda em inspeção (C485, B1386) e entrada num lote vencido avisa (C457, B1282, C460)

> Itens **18** e **21** da estimativa da semana (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md` — 1h15 + 1h; não
> refeita). O 18 é a "próxima tarefa detalhada" do plano da 268; o 21 foi puxado para cá por também tratar de lote (os 19/20 vão juntos na
> próxima).
> **Fatia visível:** a recusa da entrega passa a dizer *"… — 3 un em inspeção (lote L1) só saem depois de decidida a inspeção"*; a Entrada
> num lote vencido, sem digitar a validade, mostra o aviso amarelo *"O lote L entrou já vencido (validade DD/MM/AAAA). …"*.

## Fase 0 — medido (sonda `server/tests/api/zzsonda269.api.test.js`, apagada antes do commit, sobre `1b9e10d8`)

### Item 18 (C485, B1386) — **o C485 estava errado no caso da inspeção com dado do próprio sistema**

Material com lote, *L1* 4 em A, requisição de 4 separada no automático, depois 3 de *L1* em inspeção:

| Inspeção gravada como | Entrega de 4 hoje | Detalhe (entregável) |
|---|---|---|
| no item do recebimento **e** no material (`materiais.quantidade_em_inspecao`, o que o recebimento e o motor gravam — `QUARENTENA`) | **400** antes de baixar: *"⟨m⟩: não é possível entregar 4 un. Máximo: 1 (pendente: 4, disponível: 1)"* — **não diz que é inspeção** | 1 (o um clique entrega 1) |
| só no item do recebimento (o material sem a inspeção — dado antigo; é como o teste RN-206.15 c monta) | **200**: SAÍDA 1 de *L1* + SAÍDA 3 **sem lote**, a linha sem lote −3 (com ou sem *permite negativo*) | 4 |

- Com a inspeção gravada pelo próprio sistema, o disponível do material já desconta a inspeção, e a conferência da entrega (E1) recusa
  **antes** de baixar: o negativo do C485 **não nasce**. O que falta é a recusa **dizer** que a parte que falta está em inspeção.
- O negativo só nasce quando a inspeção do item do recebimento não está no material (o C485 foi reproduzido assim, no RN-206.15 c). Não
  achei porta do sistema que grave isso hoje (o `QUARENTENA` e as decisões mexem nos dois juntos; a v2 recusa os tipos de retenção) — é dado
  antigo. Ainda assim é a mesma conta do lote impedido da 206, e o conserto é barato.
- Separar com a inspeção já gravada: a separação recusa *"… Máximo: 1 …"* (fora do escopo; já correto).

### Item 21 (C457, B1282, C460) — confirmado

- Entrada (v2) num lote existente vencido **sem** `data_validade`: 201 sem `aviso_validade` (o aviso só responde à data digitada, B1282).
- Lote com `data_validade = ''` (cadastro antigo) com saldo; Entrada com `data_validade` → 400 *"O lote L já tem validade . A validade é do
  lote, não da entrada: …"* (C460). Sem a data: 201.
- A tela (`MovimentacoesAlmoxarifado.js`) já mostra qualquer `aviso_validade` da resposta como aviso amarelo que não fecha sozinho — o
  conserto é só no servidor.

## Decisões

- **B1639 (item 18)** — a recusa da conferência do disponível (E1) da entrega ganha um sufixo quando o material tem peça **em inspeção** e é
  a inspeção que limita: o máximo com a inspeção somada ao disponível passa do máximo de hoje (*Fase 2, achado 3*: com o limite no pendente
  ou na caixa, decidir a inspeção não muda nada e o sufixo não sai). *" — ⟨q⟩ ⟨un⟩ em inspeção (lote ⟨L⟩) só saem depois de decidida a
  inspeção"*. Só quando o sufixo do disponível negativo (E190) não sai (ele já nomeia a inspeção). Nas duas recusas E1 (a prévia e a leitura
  fresca antes da baixa — *achado 4*). Byte a byte igual fora do caso. **Descartado:** mudar o "Máximo" (já é o certo) e uma recusa nova antes
  do E1 (duas mensagens para o mesmo fato). **Reversível.**
- **B1640 (item 18; Fase 2, achado 1 — revisada antes do código)** — o dado antigo (inspeção só no item do recebimento, sem estar no
  material) **fica como está**: a entrega sai, e o que os lotes não cobrem sai sem lote (o C485 continua valendo **só** para ele e para a parte
  guardada de outra caixa). O plano previa recusar como o lote impedido; a revisão reproduziu que, nesse dado, a **decisão da inspeção recusa
  sempre** (*"Quantidade em inspeção insuficiente: 0"* — ela baixa a inspeção do material, que é 0), então a recusa mandaria esperar uma
  decisão impossível e o item ficaria preso para sempre, pior que hoje. Nenhuma porta de hoje grava esse dado (a migração antiga e liberações
  de antes da Etapa 5). **Descartado:** a recusa (trava sem saída) e corrigir o dado sozinho (mexer na retenção fora de uma decisão).
  **Reversível.**
- **B1641 (item 21)** — a Entrada pela tela de **Movimentações** (rota v2 — opção do motor `avisaLoteVencido`, só no 4º argumento) num lote
  **existente e vencido**, sem a validade digitada, avisa com o texto que já existe (*"… entrou já vencido …"* ou, com o vencimento liberado,
  *"…; o vencimento já foi liberado para consumo."*). As entradas internas (devolução, estorno, nota) e a v1 ficam como estão — a razão da
  B1282. **Revisa a B1282.** **Descartado:** avisar em toda entrada do motor. **Reversível.**
- **B1642 (item 21)** — a validade em branco (`''`, cadastro antigo) é "sem validade" na Entrada: a data digitada **preenche** o lote (o aviso
  *"O lote L não tinha validade; ela foi gravada agora (…)"*), como no lote com a validade nula. A guarda do preencher passa a casar nulo ou
  em branco. O recebimento fica como está (já avisa o branco — B1301, `PREVIA_LEGADO`). **Descartado:** recusar com outra frase (o lote não
  tem validade: não há conflito). **Reversível.**

## Regras de negócio

### Item 18 — entrega com a parte que falta em inspeção

- **RN-269.01** Material com lote, *L1* 4, requisição de 4 separada no automático, 3 de *L1* em inspeção (gravada pelo sistema: item do
  recebimento + material). Entregar 4 → **400** antes de baixar, nada gravado: *"⟨m⟩: não é possível entregar 4 un. Máximo: 1 (pendente: 4,
  disponível: 1) — 3 un em inspeção (lote L1) só saem depois de decidida a inspeção"*. Entregar 1 → 200, SAÍDA 1 de *L1*, nenhuma linha
  negativa. O detalhe oferece 1. Pela rota e pelo serviço.
- **RN-269.02** Sem lote no item do recebimento: o sufixo sai sem o parêntese — *"… — 3 un em inspeção só saem depois de decidida a
  inspeção"*. Em dois lotes: *"(lotes L1 2, L2 1)"* (na ordem do código, a quantidade de cada). Parte com lote e parte sem: *"(lote L1 2, sem
  lote 1)"* (*achado 5*). Sem unidade: *"3 em inspeção"*.
- **RN-269.03** Sem inspeção, ou com o disponível cobrindo: a recusa é a de antes, byte a byte (o sufixo não aparece). Com o disponível
  negativo, o sufixo E190 (que já nomeia *"em inspeção"*) vence e o novo não sai.
- **RN-269.04** Dois itens do mesmo material (2 + 2, *L1* 4 com 3 em inspeção): entregar 1 do primeiro e 2 do segundo → 400 do segundo,
  *"… entregar 2 un. Máximo: 0 (pendente: 2, disponível: 0) — 3 un em inspeção (lote L1) só saem depois de decidida a inspeção"*, nada baixado
  (a prévia conta o irmão).
- **RN-269.05** O limite é o pendente (item de 1, entregar 4, 3 em inspeção, disponível 1): *"… Máximo: 1 (pendente: 1, disponível: 1)"* sem
  sufixo.
- **RN-269.06** Dado antigo (3 em inspeção só no item do recebimento): entregar 4 → 200, como antes (B1640; o RN-206.15 c continua igual).

### Item 21 — entrada num lote vencido

- **RN-269.10** Entrada pela v2 num lote existente com validade vencida (sem liberação), sem `data_validade` → 201 com `aviso_validade`
  *"O lote ⟨L⟩ entrou já vencido (validade ⟨DD/MM/AAAA⟩). A saída para consumo fica bloqueada até liberar o vencimento na tela de Lotes e
  Séries."*; com o vencimento liberado → *"O lote ⟨L⟩ entrou já vencido (validade ⟨DD/MM/AAAA⟩); o vencimento já foi liberado para
  consumo."*
- **RN-269.11** Sem aviso: lote não vencido (inclusive o que vence hoje), lote sem validade, lote novo, Entrada sem lote, e as entradas que
  não vêm da v2 (a v1 e as internas — devolução de requisição, pelo serviço do motor sem a opção). Com `data_validade` digitada, o aviso é o
  da Etapa 190 (um só, não dois).
- **RN-269.12** Lote com `data_validade = ''` e saldo; Entrada com `data_validade` futura → 201, a validade do lote passa a ser a digitada,
  `aviso_validade` *"O lote ⟨L⟩ não tinha validade; ela foi gravada agora (⟨DD/MM/AAAA⟩) e vale também para o saldo que já estava nele."*; a
  auditoria do lote registra `VALIDADE_PREENCHIDA` com o anterior `''`. Data passada → o aviso de preenchida + o de vencido (como no lote
  nulo). Nenhuma recusa com a data vazia.
- **RN-269.13 (tela, fronteira HTTP)** Entrada com lote e **sem** validade; a resposta traz `aviso_validade` → o aviso amarelo que não fecha
  sozinho, depois do *"Movimentação registrada!"*.

## Contratos (congelados)

- `PUT /api/almoxarifado/requisicoes/:id/entregar` — nenhum campo novo; as recusas acima (RN-269.01/02/04/05), status 400.
- `POST /api/almoxarifado/movimentacoes/v2` — nenhum campo novo; `aviso_validade` passa a vir nos casos de RN-269.10/12. A opção do motor
  `avisaLoteVencido: true` só no 4º argumento (nunca do corpo).
- `requisitionService.sufixoInspecaoNaEntrega(unidade, saldo, max, maxSemInspecao, lotes)` → `''` ou o sufixo (pura, exportada para o
  teste); `lotes` = `[{ codigo, q }]`. A frase do lote impedido (`fraseEntregaLoteImpedido`) **não muda** (B1640).
- `lotService.preencherValidadeSeVazia` — guarda `data_validade IS NULL OR TRIM(data_validade) = ''`.

## Tasks (sort topológico)

- [x] **T1 (galho, servidor, item 18)** — `7c41a4e9` (+ `5ccaf85f` RN-269.07, a segunda rodada; + `dc564da6` Fase 5) —
  `requisitionService.js` (as duas E1) e `server/tests/api/entregaLoteEmInspecao.api.test.js` (RN-269.01..07, rota e serviço; 9/9). Sabotagens (âncora 1, md5 conferido, restaurado): sem o sufixo na prévia → 4 caem; sem a condição do
  máximo → RN-269.03 b e RN-269.05 caem; sem o "sem lote" → RN-269.02 cai. **Não coberto:** o sufixo na leitura fresca (sabotado, 8/8) — ela
  lê o mesmo que a prévia sem os irmãos e só é alcançada se o saldo mudar entre as duas, sob as duas travas da entrega; ficou pela coerência.
- [x] **T2 (galho, servidor, item 21)** — `ee8394e1` — `stockService.js` + `lotService.js` + `extended.js` (opção) e
  `server/tests/api/entradaLoteVencidoAvisa.api.test.js` (RN-269.10..12; 8/8). Sabotagens (âncora 1, md5): rota sem a opção → 3 caem; motor
  sem o branco → 2; guarda do preencher sem o branco → 2; sem a régua da data (`'  '` vencia) → 1; auditoria sem o anterior → 1.
- [x] **T3 (galho, tela)** — `ee8394e1` — `client/src/components/almoxarifado/MovimentacoesValidadeLote.test.js` (RN-269.13, prova; 9/9). Sabotagem: sem o
  aviso da validade na tela → cai.
- [x] **T4** — Fase 5 (`dc564da6`), documentos (`fechar-etapa`), suítes, estimativa — o fechamento.

T1 e T2 independentes (arquivos e regras diferentes; nenhum muda o motor que o outro lê).

## Fase 2 (revisor fresco, uma passada, sobre o plano `50eb2998`)

1. **[alta, reproduzido, absorvido]** O plano recusava o dado antigo mandando *"Espere a decisão da inspeção"* — nesse dado a decisão recusa
   sempre (*"Quantidade em inspeção insuficiente: 0"*). → **B1640 revisada**: o dado antigo fica como está (RN-269.06).
2. **[média-alta, absorvido pelo 1]** O detalhe e a Fila ofereceriam 4 no dado antigo e a entrega recusaria — some com a B1640 revisada.
3. **[média, absorvido]** O sufixo disparava com o limite no pendente → condição pelo máximo com a inspeção somada (RN-269.05).
4. **[baixa, absorvido]** A E1 existe em dois lugares (prévia e leitura fresca) → o sufixo nos dois; prévia com irmão (RN-269.04).
5. **[baixa, absorvido]** Inspeção parte com lote e parte sem → *"(lote L1 2, sem lote 1)"*.
6. **[baixa, absorvido pelo 1]** Contradição entre a B1640 e a RN-269.04 — a frase nova saiu.
7. **[média, absorvido]** B1642: o motor decidia PREENCHER só com `null` (o branco ia ao CONFLITO); a auditoria gravava `null` fixo; a corrida
   com o branco caía no AVISO_CORRIDA com "()" → os três tratados (RN-269.12).
8. **[baixa, absorvido]** `'' < hoje` é verdadeiro em JS → só a data AAAA-MM-DD conta; a opção só no tipo `ENTRADA` (o Ajuste positivo fora).
9. Fase 0 confirmada: nenhuma porta de hoje grava a inspeção só no item. 10. T1 e T2 independentes: confirmado.
- Registrado: o estorno da Entrada que preencheu a validade em branco não volta o branco (igual ao lote nulo da 190).

## Fase 5 (um revisor fresco, sondas `zzf5-269-*`, apagadas, sobre `7c41a4e9`/`ee8394e1`)

1. **[média, reproduzido, consertado — `dc564da6`]** Os itens do recebimento podem somar mais em inspeção que o material (o registro antigo da
   B1640 junto de uma inspeção nova): *"3 un em inspeção (lotes L1 3, L2 2)"*. → com a soma acima do total, sem o parêntese.
2. **[média, reproduzido, registrado — D (269) 6]** O registro antigo num lote (L2 3, só no item) com outra inspeção de 3 sem lote no material:
   a soma bate e o trecho diz *"(lote L2)"*, sendo que L2 não segura nada. Só com dois registros fora do padrão juntos; sem conserto barato
   (os lotes só existem no item do recebimento).
3. **[baixa-média, reproduzido, registrado — D (269) 7]** Validade só com **espaços**: a saída (`isVencido`) a trata como vencida (*"Lote LV
   vencido em    …"*) e a Entrada sem data não avisa. O teste RN-269.11 afirmava esse caso como certo — **tirado**. Mexer no `isVencido` é porta
   de saída de todo o módulo (fora do escopo).
- Tentado e não quebrou: data com hora no lote (um aviso só, data certa); `lote_id`; mesma data digitada (sem duplicar); o preencher do branco
  e a auditoria; o estorno da Entrada que preencheu (200, a validade fica — como no lote nulo); DEVOLUCAO e v1 sem o aviso; lote criado
  agora; disponível negativo e limite no pendente sem o trecho; inspeção de outro material; o recebimento posterior de um lote `''` (LEGADO).

## Divergências do plano

- **B1640** — o plano recusava o dado antigo como lote impedido; a Fase 2 (achado 1) reproduziu que a decisão da inspeção recusa nesse dado.
  Revisada antes do código: o dado antigo fica como está (RN-269.06). A frase do lote impedido não mudou.
- **RN-269.04/05** viraram a prévia com irmão e o limite no pendente (Fase 2, achados 3 e 4); **RN-269.07** (a segunda rodada) nasceu no
  fechamento — a peça em inspeção só nasce em recebimento de material **crítico**, cuja entrega já para na caixa: o caminho da operação é a
  segunda rodada de material que deixou de ser crítico (ou o separado acima do disponível).
- **CLAUDE.md:** nenhuma linha ficou errada — o trecho novo só lê, dentro das duas travas da entrega; a Entrada roda no motor sob a trava do
  material, como antes.

## Próxima tarefa detalhada

Os itens **19 e 20** da estimativa de 23/11 (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md`), **juntos** (C461, B1313
caminho (b), B1254; 1h30 + 2h, motor + tela):

1. **Item 19 — separar de duas prateleiras, 1ª parte (guardar e mostrar).** Hoje o item guarda **uma** origem: `itens_requisicao_almoxarifado.
   origem_separacao_id` + `lote_separacao_id` + a quantidade que saiu dela (Etapa 196, `PARTE_ORIGEM_SQL`/`parteOrigemSql` em
   `requisitionService.js:77`); a 2ª rodada de outro endereço escolhido vai para o automático na entrega (B1316, C461 — a janela avisa *"Já
   separado de A-01: 3 PC, que continuam saindo de lá. Esta parte sai no automático na entrega."*). Caminho da B1313 (b): uma tabela por item
   (origem, lote, quantidade), aditiva; a coluna atual fica como a 1ª linha (compatibilidade com tudo que lê `PARTE_ORIGEM_SQL`). O detalhe da
   requisição mostra as duas.
2. **Item 20 — a entrega sai de cada uma.** Ramo `baixa.comOrigem` da entrega (`requisitionService.js`, ~3245 antes da 269) — uma baixa por
   origem, sob as duas travas (CLAUDE.md: por requisição → por material, `comTravaDaRequisicao`). Quem lê a guarda (a E1 do caso (c),
   `guardaDosIrmaosNoPar`, `lotesParaOAutomatico`/`guardadoPar`, `parteGuardadaDeOutrasPorPar` do Sai de, a dica da Fila `sugestaoDeColeta`,
   a exclusão e a devolução — registro das Etapas 257/259, já por linha) tem de somar as linhas. **Medir antes** quantos leitores de
   `origem_separacao_id` existem (`grep -n "origem_separacao_id" server/services server/routes`) e cruzar com a spec 05.
- **O que já está pronto e não reabre:** a recusa com a inspeção (esta etapa); o aviso do lote vencido na Entrada (esta etapa).
- Candidatos fora da estimativa: **C555** (~1 h); a separação com a inspeção na frase (D (269) 4); o item 22 (devolução depois de uma exclusão
  interrompida) é o último da fila.

## Pontos de atenção

- O trecho da inspeção é **só leitura** e só aparece quando o máximo com a inspeção somada passa do de hoje — não mexer no "Máximo".
- `avisaLoteVencido` só no 4º argumento da v2 (nunca do corpo — a rota repassa `req.body` inteiro).
- `preencherValidadeSeVazia` casa nulo **ou** branco; o recebimento continua tratando o branco como LEGADO (não preenche).

## Verificação (medida sobre o código final, `dc564da6`; os documentos não mudam código)

- `npm run test:api` (sozinho, `NODE_OPTIONS=--max-old-space-size=4096`): **679/681 arquivos OK** — os 2 que falham são os já conhecidos de
  proposta, de outra máquina (`propostaBilingueTemplate` 7/1, `propostaPdfExigeLogin` 3/1); o mais lento: `propostaClausulasGrava`, 79,8 s.
- `npm run test:almoxarifado`: **44 passou, 0 falhou**. `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **16/0**.
- Jest da tela (`--maxWorkers=2`): **258/258 suítes, 3387/3387 testes**. `CI=true npx react-scripts build`: **Compiled successfully.**
- `entregaLoteEmInspecao` 9/9; `entradaLoteVencidoAvisa` 8/8; `MovimentacoesValidadeLote` 9/9; o subconjunto de entrega/validade/lote/
  inspeção/requisição/auditoria (131 arquivos) verde antes da Fase 5.
- Nenhum clique no navegador (F (269)).

## Retro (4 números)

- Rodadas de correção até verde: 2 (Fase 2 — a B1640 revisada antes do código e a condição do trecho; Fase 5 — o teto da soma dos lotes).
- Achados: Fase 2 — 1 alto reproduzido (absorvido), 3 médios, 4 baixos, nenhum ruído; Fase 5 — 3 reproduzidos (1 consertado, 2 registrados).
- Paralelismo: T1 e T2 em série (um executor); as revisões rodaram enquanto o código e os documentos andavam.
- Defeito que escapou: (preencher na etapa seguinte). Da 268: nenhum apontado.
