# Etapa 252 — o endereço na troca para o automático (C495), a frase de dois itens na mesma prateleira (C497) e a peça com série que respeita a separação do outro item (C493)

> Itens 22, 19 e 23 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`; 22: 45 min,
> 19: 30 min, 23: 1h30). Ponto de partida: a "Próxima tarefa detalhada" do plano da 251. **Estimativa não revisada:** a sonda reproduziu os
> três defeitos no tamanho descrito (abaixo).
> **Fatia visível:** o bloco **Substituições** do detalhe passa a dizer *"saiu de B — lote LB (automático)"*; a recusa da entrega com dois itens
> na mesma prateleira diz que o resto é da outra peça; e a entrega da peça com série deixa a prateleira separada para o outro item (o segundo
> item sai num clique, antes *"não serve mais"*).

## Fase 0 — medido (código + execução, 19/11)

Sonda executada (`createTestApp`, rotas reais; script no scratchpad, fora do repositório). Endereços A, B e P (padrão vazia):

- **C495 (item 22).** (a) Sem lote: A 2 (separado 2 pelo item), B 5; entrega com *"Qualquer endereço (automático)"* → 200, uma SAÍDA **sem
  endereço** no livro, A 2 e B 3 (saiu de B), Substituições `saiu_codigo null` → a tela mostra *"saiu de automático"*. (b) Com lote: LA 2 em A
  (separado), LB 5 em B → a SAÍDA leva o lote LB sem endereço, Substituições `saiu_lote "LB"`, `saiu_codigo null`. (c) Guarda de outra
  requisição em B: o automático sai de P 1 + B 1 (dois endereços) → *"automático"* continua certo. **Reproduzido.** Achado: o livro não diz
  o endereço quando o motor escolhe a linha (a SAÍDA sem endereço — `localizacao_origem_id` só é gravado quando vem pedido; o estorno o
  lê para devolver, então **não** se mexe nele). O endereço só existe nas linhas que o claim do motor debitou.
- **C497 (item 19).** A 3, B 5; item 2 separado 2 de A, item 1 separado 3 sem origem; na mesma entrega item 1 com **Sai de** A e 3, item 2
  num clique → 400 *"⟨material⟩: O saldo em A (1) não cobre a quantidade (3) — a saída tiraria de outros endereços"*; com 2 e 2, *"O saldo em
  A (1) não cobre a quantidade (2) …"*. A frase não diz que os outros 2 de A saem para a outra peça. **Reproduzido.**
- **C493 (item 23).** Material sem lote com série: A 3 (A1..A3), B 2 (B1, B2); item 2 separado 3 de A, item 1 separado 1 sem origem; entrega
  do item 1 com a série B1 → 200, SAÍDA sem endereço, **linhas A 2 e B 2** (o claim de sempre tirou da maior linha, A), a série B1 ENTREGUE:
  A ficou com 2 linhas e 3 séries, B com 2 linhas e 1 série. A entrega do item 2 (3, séries A1..A3), num clique → 400 *"a origem da
  separação (A) não serve mais (O saldo em A (2) não cobre a quantidade (3) …)"*. **Reproduzido** — e o defeito é duplo: a baixa leva a
  guarda do irmão **e** tira de uma prateleira que não é a da peça.

## Regras de negócio

**Item 22 (C495):**

- **RN-252.01** Entrega de item com origem da separação que vai pelo automático (escolhido, ou o um clique que deixou a planejada): se as
  linhas de saldo que **todas** as baixas do item na entrega debitaram são de **um** endereço só (não nulo), a troca grava esse endereço
  (`localizacao_saida_id`); senão (dois endereços, a linha sem endereço, ou nenhuma linha informada), como hoje (nulo). O lote continua como
  hoje (o escolhido, senão o único do livro).
- **RN-252.02** O livro **não muda** (a SAÍDA sem endereço continua sem endereço; o estorno a lê). O motor só **devolve** os endereços das
  linhas que debitou, quando quem chama pede (`opcoes.comEnderecosDaSaida`) — nenhum outro chamador vê campo novo.
- **RN-252.03** Tela, bloco **Substituições** (entrega): troca automática com endereço → `⟨cód⟩: ⟨q⟩ — separado de ⟨plan⟩[ — lote ⟨L⟩] · saiu de
  ⟨B⟩[ — lote ⟨L⟩] (automático)[ · motivo]`. Sem endereço, o texto de hoje (*"saiu de automático"*). Troca escolhida à mão: o texto de hoje.

**Item 19 (C497):**

- **RN-252.10** Entrega, item que **escolheu** a origem (não a planejada num clique), endereço com saldo que cobriria a quantidade se outra
  peça desta entrega não pedisse dali (o já pedido nesta entrega > 0) e não cobre com ela: a recusa passa a ser
  `⟨material⟩: em ⟨A⟩[, lote ⟨L⟩] há ⟨físico⟩ para esta entrega, mas ⟨já pedido⟩ sai(em) dali nesta entrega para outra(s) peça(s) desta
  requisição; sobra ⟨físico − já pedido⟩, que não cobre a quantidade (⟨q⟩). Escolha outro endereço ou deixe "Qualquer endereço (automático)"`.
  Cenário C497: *"… em A há 3 para esta entrega, mas 2 saem dali nesta entrega para outra peça desta requisição; sobra 1, que não cobre a
  quantidade (3). …"*.
- **RN-252.11** O físico sozinho não cobre (nem sem a outra peça), ou nada foi pedido dali nesta entrega: a literal de hoje (*"O saldo em A
  (x) não cobre a quantidade (q) — a saída tiraria de outros endereços"*). A separação e a planejada num clique (*"não serve mais"*) não
  mudam. **Nada muda no que é aceito** (mesma condição, só o texto).

**Item 23 (C493):**

- **RN-252.20** Entrega, parte **automática** de item com série em material **sem lote** (séries sem lote): quando a baixa de sempre levaria
  guarda sem lote que conta (a mesma régua da Etapa 207 — `guardaQueConta`, todas as requisições, simulação do claim), a baixa sai **por
  endereço da série**: uma SAÍDA por endereço onde estão as séries daquela baixa, com o endereço (origem estrita) e as séries dele.
- **RN-252.21** Só quando cada endereço das séries existe, não está bloqueado e tem **livre** (linha sem lote − guarda que conta naquele
  endereço) que cobre as séries dele. Senão — ou alguma série sem endereço — como hoje (uma SAÍDA sem endereço): **nenhuma recusa nova**.
- **RN-252.22** Sem guarda que conte, ou a baixa de sempre não levaria guarda: como hoje, byte a byte (B1397/B1406). Material com lote, ou
  séries com lote: não muda (o caminho do lote das séries, Etapa 63).
- **RN-252.23** Cenário C493: o item 1 (série B1) → SAÍDA (B, 1), A 3 e B 1; o item 2 num clique com A1..A3 → 200, A 0.
- **RN-252.21 d (Fase 2)** O endereço da série só vale quando as séries EM_ESTOQUE sem lote ali ≤ a linha sem lote dali (C76: a transferência
  move a linha e deixa a série); senão como hoje.
- **RN-252.24 (Fase 2)** Item com parte de uma origem e séries: as séries que estão na origem vão primeiro (o pedaço estrito as leva); só
  muda quais séries vão em cada SAÍDA, nunca as quantidades.

## Contratos

- `GET /api/almoxarifado/requisicoes/:id` — `substituicoes[].saiu_codigo` passa a vir preenchido também com `automatica: 1` (RN-252.01).
  Formato igual.
- `PUT /api/almoxarifado/requisicoes/:id/entregar` — aceita o mesmo; muda **um texto** de recusa (RN-252.10) e o livro da parte automática com
  série sem lote quando há guarda (RN-252.20). Nenhuma recusa nova.
- `stockService.registrarMovimentacao(db, user, params, opcoes)` — `opcoes.comEnderecosDaSaida: true` → o retorno ganha
  `enderecos_saida: [localizacao_id | null, ...]` (distintos, das linhas debitadas; SAÍDA). Sem a opção, retorno igual.

## Desenho

- **22:** `stockService` — no `return`, com `opcoes.comEnderecosDaSaida` e linhas debitadas, lê os `localizacao_id` delas. `requisitionService
  .entregarSemTrava` — `baixar` passa a opção e acumula em `plano.enderecosSaida`; no `finally`, troca automática sem `saiuOrigem` e com um
  endereço só (não nulo) grava-o. Tela: a frase do RN-252.03.
- **19:** `checarOrigemItem` ganha a opção `irmaosNaEntrega` (só `validarOrigemDaEntrega` com `!planejada` passa); com origem, `jaPedido >
  folga`, físico ≥ q e físico − jaPedido < q → a literal nova. Conta de peças: um mapa paralelo `chave → n` em `pedidoPorOrigem` não; um `Map`
  próprio na entrega (`pecasPorOrigem`).
- **23:** função nova `fatiasDaSerieSemLote(db, materialId, serieIds, saiu, fica)` que reusa a guarda e a simulação da
  `fatiasSemLoteParaOAutomatico` (extraídas para um ajudante comum, sem mudar o resultado dela). No laço das passadas, o pedaço automático de
  item com série e sem `loteSeries` em material sem controle de lote: se a função devolve fatias, reordena `plano.seriesRestantes` (as da
  baixa agrupadas por endereço) e chama `baixar(plano, baixa, n, null, endereco)` por fatia; senão `baixar` como hoje. **Sob a trava** que a
  entrega já segura (`comTravaDaRequisicao` dentro da `serializarNaRequisicao`): nada de trava nova; a leitura das séries e do saldo e a baixa
  ficam na mesma seção (as séries não mudam de endereço fora da trava do material — `mudarStatusSerie` a pega, Etapa 118; transferência é
  movimentação, motor).

## Fase 2 — revisão do plano (item 23 mexe na baixa)

Um agente fresco, com sondas executadas (scratchpad), as quatro perguntas. **6 achados, todos aceitos** (2 já sobre o T2 em andamento):

1. **[trava] O endereço gravado na série não é confiável** (C76, `11-transferencias/README.md`): a transferência move a linha e deixa a série.
   Sonda: transferir 2 de B para A, entrar B3/B4 em B → B com 4 séries e linha 2; o desenho mandaria a SAÍDA para B com a peça em A. →
   **RN-252.21** ganha: o endereço só vale se as séries EM_ESTOQUE sem lote ali ≤ a linha sem lote dali; senão como hoje. Teste *[RN-252.21 d]*.
2. **[importante] O pedaço com origem levava as primeiras séries da lista**, estivessem onde estivessem (A1 e B1 na SAÍDA estrita de A). →
   **RN-252.24** (nova): as séries que estão na origem do item vão primeiro (só muda quais séries vão em cada SAÍDA). Teste *[RN-252.24]*.
   *Nota:* o cenário da sonda (R2 guardando B e a série B1 escolhida) continua recusando a entrega de R2 — a peça escolhida está fisicamente na
   prateleira de R2; não há o que a entrega possa fazer (registrado na D (252)).
3. **[importante] A frase nova do RN-252.10 enganava** quando outra requisição também guardou do par (*"sobra 2"*, falso). → a condição passa a
   ser `físico − guarda das outras requisições no par ≥ q`; senão a de hoje. Teste *[RN-252.11 d]*, `73b0a9d9`.
4. **[importante] O T2 gravava o endereço também na troca à mão só pelo lote** (`auto 0`, "saiu de B — lote LB" como se escolhido). → só a
   troca automática. Teste *[RN-252.01 e]*, `0c524552`.
5. **[menor] Saldo negativo permitido:** a linha que fica negativa diria "saiu de P". → vem como desconhecida. Teste *[RN-252.02 b]*, `0c524552`.
6. **[menor] Sem guarda, a série continua saindo da maior linha** (escopo, RN-252.22) → letra B (**B1583**).

Pergunta 3: T1/T2/T3 no mesmo arquivo → executados em sequência (nenhum galho). Pergunta 4: estorno da SAÍDA (B, 1) com B1 devolve linha e série a
B (sonda); a exclusão estorna por SAÍDA com o endereço dela; o entregável da Fila e do detalhe para série sem lote não muda.
**Divergência do plano:** o plano dizia que o teste *[RN-207.02 c]* passaria a afirmar o livro novo — **estava errado**: ali a guarda (2 em A
com 3) não é levada pelo claim de sempre (sobra 1 livre), então é o caso RN-252.22 e o teste continua valendo como está.

## Tasks

Executadas em sequência (o mesmo arquivo de serviço; a Fase 2 recomendou não paralelizar), na ordem T2 → T3 → T1.

- [x] **T2** 22 (C495) — `b326b672`: o motor devolve os endereços com `opcoes.comEnderecosDaSaida`; a troca automática grava o endereço
  quando foi um só; tela *"saiu de B-02 (automático)"*. Testes `substituicaoAutomaticaEndereco.api.test.js` (5 → 7 com a Fase 2) e
  `RequisicoesSubstituicaoEndereco.test.js` (1), vermelhos antes. O teste da Etapa 63 *"origem_automatica: … saiu_codigo null"* registrava o
  comportamento de antes e passou a afirmar *A* (a linha sem lote de onde a peça saiu). Fase 2 (itens 4 e 5) — `0c524552`. Sabotagens: 5,
  cada uma derruba o seu cenário.
- [x] **T3** 19 (C497) — `b8ccaf79`: a frase nova; o teste RN-208.12 (b) registrava a frase de antes e passou a afirmar a nova. Fase 2 (item
  3) — `73b0a9d9`. Testes `entregaFraseDoIrmao.api.test.js` (9), 5 vermelhos antes; sabotagens: 6, cada uma derruba o seu.
- [x] **T1** 23 (C493) — `89665967`: `fatiasDaSerieSemLote` + `claimSemLoteLevaGuarda` (extraída da 207 sem mudar o resultado; o teste da
  207 continua 18/18) + a ordem das séries (Fase 2, item 2). Testes `entregaSerieRespeitaGuarda.api.test.js` (9), os do C493 vermelhos antes;
  sabotagens: 6, cada uma derruba o seu. O `[RN-207.02 c]` **não** mudou (divergência acima).
- [x] **T4** Fase 5: um revisor fresco, sonda executada e **diferencial de 2.346 entregas sorteadas** (HEAD × antes da etapa, numa worktree
  temporária). C493: **0 recusas novas** genuínas (1 aparente, consequência: o código novo esvaziou P certo e o sorteio escolheu P à mão),
  **0 guardas novas levadas**, 1 desalinhamento novo aparente (de baixas seguintes pelo caminho de hoje — RN-252.21 a / B1583); somem 32
  recusas *"não serve mais"*, 68 desalinhamentos série × linha e 68 guardas levadas. Gestos depois (exclusão, devolução, segunda entrega do
  irmão) alinhados. **1 achado real, regressão da etapa** (C497: o item 3 desta requisição, fora da entrega, guardando de A — a frase dizia
  *"sobra 2"*; corrigido com teste vermelho antes, *[RN-252.11 e]*) e **2 buracos de teste** (séries intercaladas; reserva parcial +
  excedente) — escritos, as duas mutações que sobreviviam agora caem — `e56365df`. Ruído: 0. Uma rodada de correção; não houve segunda
  revisão (a correção é uma parcela a mais na condição da frase, conservadora: na dúvida volta a frase antiga).
- [x] **T5** fechamento (fechar-etapa sem 7½ e 8).

## Divergências do plano

- O `[RN-207.02 c]` não mudou (acima). O teste da Etapa 63 passou a afirmar *A*, não P (a linha de P era com lote, o material sem controle).
- A Fase 2 acrescentou RN-252.21 d e RN-252.24 e corrigiu o T2 (troca à mão pelo lote; linha negativa) e a frase (outra requisição); a Fase 5,
  a frase (outro item desta requisição fora da entrega). `parteQueFicaPorItem` subiu para logo depois do `origemGuardada` (corpo igual).
- **CLAUDE.md:** nenhuma linha ficou desatualizada — a entrega já segurava as duas travas; o ramo novo baixa dentro delas, sem trava nova
  (registrado aqui porque a seção das travas lista quem passa por elas: a entrega já estava lá).

## Verificação (medida, sobre o código final `e56365df`)

- `npm run test:api`: **647/647 arquivos**, rodado sozinho (sem Jest nem build em paralelo).
- `test:almoxarifado` 44/0; `test:validation` 4/0; `test:safealter` 3/0; `test:sqlite` 16/0.
- Jest da tela: **239 suítes, 3217 testes** (rodado sobre `89665967`; a Fase 5 não mexeu na tela); `CI=true react-scripts build`: *Compiled
  successfully*.
- Nenhum clique no navegador (F (252)).

## Retro (4 números)

- Rodadas de correção até verde: 2 (Fase 2: 4 correções; Fase 5: 1).
- Achados: Fase 2 — 6 reais (1 trava, 3 importantes, 2 menores), 0 ruído; Fase 5 — 1 real (regressão da etapa) + 2 buracos de teste, 0 ruído.
- Paralelismo: nenhum galho (mesmo arquivo); os revisores rodaram em paralelo com a escrita (só sondas, sem editar).
- Defeito que escapou: (preencher na etapa seguinte). Da 251: nenhum conhecido.

## Próxima tarefa detalhada

Itens 13 e 18 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`; 13: 1h15, 18:
1h15). Os itens 24 a 27 **esperam resposta** (Aplicação — Matheus; série + etiqueta — a tela; Especificações/Observações; sobra e remessa) —
o caminho reversível de cada um está no `.md` da estimativa, seção "Os que dependem de resposta"; só começar se a resposta vier ou se a fila
acabar.

- **Item 13 — busca de entrega na tela Devoluções (C477, B1367).** Hoje a lista de entregas para devolver vem em páginas de 30 (cursor
  `antes_de`, `returnService.js` ~486-495) e a tela só tem *"Carregar entregas mais antigas"*. Conserto previsto: um campo de busca (número da
  requisição, OS, data) somado ao "carregar mais", sem mudar a ordem nem o tamanho da página (B1367). Contrato a congelar: a rota da lista de
  entregas devolvíveis ganha um parâmetro de busca opcional (aditivo); sem ele, resposta byte a byte igual. **Medir antes:** a rota e o
  componente da tela Devoluções (`grep antes_de server/services/almoxarifado/returnService.js`), quantas entregas a base local tem. Fatia
  visível: o campo de busca.
- **Item 18 — Ajuste com lote limita a baixa ao saldo do lote (C475, B1357).** Pela movimentação nova (`POST /movimentacoes/v2`, só
  integração — a tela não mostra lote no Ajuste), um AJUSTE citando o lote baixa a diferença da linha do lote mesmo sem saldo nela (LB 5 + 3
  sem lote, ajuste para 1 com LB → LB −2). **Motor** (ramo de AJUSTE do `registrarMovimentacaoSemTrava`, sob `naTravaDoMaterial`): ler a seção
  das travas do CLAUDE.md; Fase 2 e Fase 5 obrigatórias. **Medir antes** pela sonda (reproduzir o −2) e decidir entre recusar (mensagem
  literal nova) e limitar a baixa ao lote — caminho reversível na letra B. Sem fatia visível natural (só integração): registrar.
- **Pontos de atenção:** o item 18 mexe no motor (estorno do AJUSTE com lote também — `cancelarMovimentacao`, ramo de ajuste, sob a trava
  desde a 118); o 13 é leitura + tela.
- **O que já está pronto e não reabre:** o endereço da troca automática, a frase da outra peça e a série pelo endereço (esta etapa).
