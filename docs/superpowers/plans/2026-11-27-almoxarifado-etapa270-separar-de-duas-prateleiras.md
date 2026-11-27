# Etapa 270 — Separar de duas prateleiras (C461, B1313 caminho (b), B1254)

> Itens **19** e **20** da estimativa da semana (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md` — 1h30 + 2h; não
> refeita). É a "próxima tarefa detalhada" do plano da 269.
> **Fatia visível:** o detalhe da requisição mostra *"separado de A-01 (3 UN) · B-02 (2 UN)"*; a janela de entrega diz de onde cada parte sai;
> a entrega de um clique tira as 2 de B-02 (antes: no automático, do endereço padrão).

## Fase 0 — medido (sobre `a70d5408`)

- O item guarda **uma** origem: `itens_requisicao_almoxarifado.origem_separacao_id` + `lote_separacao_id` + `quantidade_origem_separacao`
  (Etapa 196). A rodada de **outro** endereço escolhido sobre item com origem não grava nada além da caixa (`separarSemTrava`,
  `requisitionService.js` ~1956-1970: "outro par, automatico ou so lote nao muda a origem nem a parte"). A rodada fica só no histórico
  (`separacoes_requisicao_almoxarifado.itens_json`, com `localizacao_origem_id`). **Confirmado o C461.**
- Leitores da origem (`grep origem_separacao_id`): ~30 pontos em `requisitionService.js` (todos via `PARTE_ORIGEM_SQL`/`parteDaOrigem` — as
  guardas de "separado para outra requisição": E1 do caso (c), `guardaDosIrmaosNoPar`, `lotesParaOAutomatico`, `claimSemLoteLevaGuarda`,
  `parteGuardadaDeOutras*`, `guardadoNoLote`, a dica da Fila), `stockService.js:1104` (séries), `sugestaoDeColeta.js`, a rota do detalhe
  (`routes/almoxarifado.js` ~4100). Reescrever todos para somar linhas é a etapa inteira de risco — **não** é o caminho (B1643).
- A entrega: o pedaço "com origem" sai da origem guardada (passadas 0/1); o resto (passada 2) vai ao automático (`lotesParaOAutomatico`/
  `fatiasSemLoteParaOAutomatico`/claim do motor), lido **na hora do pedaço**, já descontando as guardas de todas as caixas vivas.
- A tela da entrega, com a quantidade acima da parte da origem, não manda chave nenhuma (`semEscolha`): o servidor aplica a origem até a parte
  e o resto vai ao automático — é aí que a 2ª parte entra.
- Quem diminui a caixa: a entrega (finally, `quantidade_origem_separacao` relativo), a devolução à prateleira (`devolverSemTrava`, a parte
  limitada à caixa — RN-196.08), a exclusão (zera a origem, Etapa 203). Ninguém mais (`grep "SET quantidade_separada"`).

## Decisões

- **B1643** — as outras prateleiras ficam numa **tabela nova** (`partes_separacao_almoxarifado`: item, endereço, lote, quantidade), aditiva;
  a origem do item (as três colunas) **continua sendo a 1ª parte e a única que guarda a prateleira** contra outras requisições. A parte de
  outra prateleira **não entra** em nenhuma conta de "separado para outra requisição" (dica da Fila, "Sai de", limite da janela, E1, automático
  das outras): todas ficam byte a byte como hoje. **Consequência declarada (D):** outra requisição ainda pode separar de B-02 as peças que esta
  separou de lá (como hoje); na entrega, se B-02 não tiver mais as peças livres, a parte sai no automático (como hoje) — sem recusa nova.
  **Descartado:** fazer a 2ª parte guardar a prateleira (todos os ~30 leitores somando linhas — a próxima, se aparecer na operação) e guardar
  todas as partes na tabela nova, inclusive a 1ª (troca a régua de todas as guardas). **Reversível** (a tabela só acrescenta).
- **B1644** — a conta da caixa: as outras partes valem **até o que sobra da caixa depois da parte da origem**, na ordem em que foram separadas.
  Quem tira da caixa sem dizer de onde (devolução à prateleira, entrega no automático) tira primeiro o que não tem prateleira, depois as outras
  partes da **última para a primeira**, por último a origem — a mesma regra da RN-196.08 estendida. A leitura limita sempre; **quem encolhe a caixa** (a entrega,
  a devolução à prateleira) **regrava** as partes limitadas pela caixa nova, e a separação só soma (*Fase 2, L1*: sem regravar, a parte
  "ressuscitava" quando uma rodada automática fazia a caixa crescer de novo). **Descartado:** só limitar na leitura (o plano original).
- **B1645** — a entrega sem "Sai de" (um clique, ou a janela sem escolha) tira a parte de cada outra prateleira **de lá**, quando a prateleira
  ainda tem essas peças **livres** (o saldo do par menos o que as caixas vivas guardam ali — a mesma régua do automático —, endereço não
  bloqueado, lote que pode sair e sem a peça em inspeção/presa); o que não couber, no automático de hoje. **Não** se aplica com o "Sai de"
  escolhido, com "Qualquer endereço (automático)" escolhido, nem a item com número de série (as séries dizem de onde sai). **Descartado:**
  recusar quando B-02 não tem mais (hoje sai; seria recusa nova sem o almoxarife ter feito nada de errado).

## Regras de negócio

### Item 19 — guardar e mostrar

- **RN-270.01** — Item com origem guardada (A-01, parte 3). Nova rodada de **3 escolhendo B-02** (endereço; lote opcional) → a origem continua
  A-01 parte 3 (RN-196.03) e a tabela ganha `(B-02, lote, 3)`. Sem troca. A rodada **automática** e a de **só lote** (sem endereço) não gravam
  parte (continuam sem prateleira).
- **RN-270.02** — Mesmo par (endereço + lote exatos) soma na mesma linha; par diferente = outra linha. O mesmo item duas vezes no mesmo envio
  (A 3 + B 2, sem origem antes) → origem A 3, parte B 2.
- **RN-270.03** — A parte vale até a caixa que sobra depois da origem, na ordem de separação (B1644). Caixa 8 = A 3 + B 2 + C 2 + automático 1:
  devolver 2 à prateleira → A 3, B 2, C 1; devolver mais 3 → A 3, B 0, C 0; entregar escolhendo outro endereço consome igual.
- **RN-270.04** — O detalhe da requisição (`GET /requisicoes/:id`) devolve, por item, `partes_separacao: [{ localizacao_id,
  localizacao_codigo, lote_id, lote_codigo, quantidade }]` — só as outras partes, já limitadas, as de quantidade 0 fora; `[]` sem nenhuma.
  A tela mostra *"separado de A-01 (3 UN) · B-02 (2 UN)"* (o mesmo endereço+lote somado numa entrada só); sem outras partes, **byte a byte como
  hoje**. Origem zerada (A entregue) com B na caixa → *"separado de B-02 (2 UN)"*.
- **RN-270.05** — Nenhuma conta de outra requisição muda (B1643): R1 com A 3 + B 2; R2 separa de B-02 → vê o livre de B-02 como hoje (as 2 de
  R1 não descontam). Controle: a mesma conta com a parte de A desconta (RN-196.09).
- **RN-270.06** — A exclusão da requisição apaga as partes dos itens (como zera a origem, Etapa 203), depois do UPDATE que venceu.

### Item 20 — a entrega sai de cada uma

- **RN-270.10** — Caixa A 3 + B 2; entrega de um clique 5 → SAÍDA 3 de A-01 (origem estrita) e SAÍDA 2 de B-02 (endereço da fatia); o
  automático não baixa nada. Origem e parte zeram.
- **RN-270.11** — Com lote: A-01/L1 3 + B-02/L2 2 (material com controle de lote) → 3 de (A, L1) e 2 de (B, L2), não o FEFO.
- **RN-270.12** — B-02 sem as peças livres (outra requisição separou de lá com origem guardada, ou saiu numa saída avulsa) → o que B-02 cobre
  sai de lá, o resto no automático de hoje; 200, sem recusa nova. B-02 bloqueado, lote vencido/impedido ou com peça em inspeção → automático.
- **RN-270.13** — Não se aplica com o "Sai de" escolhido, com `origem_automatica`, nem a item com série (B1645): como hoje.
- **RN-270.14** — Entrega parcial: caixa A 3 + B 2 + C 2, um clique 4 → 3 de A, 1 de B; partes depois: B 1, C 2. Um clique 3 → 1 de B, 2 de
  C. O que saiu de cada parte desconta dela; depois a régua da RN-270.03.
- **RN-270.15** — A parte que sai de B-02 pela entrega é uma SAÍDA com o endereço: a exclusão da requisição a devolve para B-02 (o estorno
  por linha das Etapas 257/259). O estorno avulso da saída de requisição é recusado como sempre (*"Movimentação vinculada a requisição — use
  os fluxos da requisição (exclusão/encerramento)"*); a devolução da saída para Estoque vai para o endereço que o almoxarife **escolhe**
  (*Fase 2, L5* — o plano dizia "devolve para B-02"; **estava errado**). Nada novo a fazer, só provado.
- **RN-270.16** — A janela de entrega (sem "Sai de" escolhido, quantidade acima da parte da origem) diz *"3 UN sai de A-01 (o que foi separado
  de lá); 2 UN de B-02, se ainda estiverem lá; o restante, automático. Se em A-01 não houver mais essa quantidade, a entrega é recusada —
  escolha de onde sai."* Sem outras partes: a frase de hoje, byte a byte. Item sem origem e só com outras partes: *"2 UN sai de B-02, se ainda
  estiverem lá (o que foi separado de lá); o restante, automático."*
- **RN-270.17** — O aviso da janela de separação (outro endereço sobre item com origem) passa a dizer *"Já separado de A-01: 3 UN, que
  continuam saindo de lá. Esta parte fica anotada como separada de B-02 e sai de lá na entrega, se ainda estiver lá (senão, no automático)."*
  — só quando o escolhido é um endereço; com "automático" ou só lote, a frase de hoje.

## Contratos (congelados)

- `PUT /api/almoxarifado/requisicoes/:id/separacao` — nenhum campo novo; grava a parte (RN-270.01/02).
- `GET /api/almoxarifado/requisicoes/:id` — item ganha `partes_separacao` (RN-270.04), aditivo.
- `PUT /api/almoxarifado/requisicoes/:id/entregar` — nenhum campo novo, nenhuma recusa nova; as SAÍDAS da parte de outra prateleira levam
  `localizacao_origem_id` (origem estrita, a mesma `baixar(..., enderecoDaFatia)` do automático).
- `requisitionService.partesEfetivas(item, linhas)` → `[{ ...linha, quantidade }]` (pura, exportada): limita pela caixa − `parteDaOrigem`,
  na ordem do id, tira as zeradas.
- Tabela `partes_separacao_almoxarifado (id, item_requisicao_id, requisicao_id, material_id, localizacao_id NOT NULL, lote_id, quantidade REAL
  NOT NULL, created_at, updated_at)` + índice por item. `CREATE TABLE IF NOT EXISTS` (banco novo e antigo iguais; sem migração — item antigo
  não tem parte, vale como hoje).

## Tasks (sort topológico)

- [x] **T1 (tronco, servidor, item 19)** — `51b0415c` — tabela, `partesEfetivas`, gravação na separação, `partes_separacao` no detalhe, limpeza na
  exclusão. Teste `server/tests/api/separarDeDuasPrateleiras.api.test.js` (RN-270.01..06; rota e serviço).
- [x] **T2 (tronco, servidor, item 20)** — `af99a506` — a entrega sem escolha tira de cada parte (RN-270.10..15), decremento no finally. Mesmo arquivo de
  teste; **integração** separar → entregar parcial → entregar o resto → estornar a saída de B → excluir (RN-270.15), pela rota e pelo serviço.
- [x] **T3 (galho, tela)** — `4084f4b2` — detalhe (RN-270.04), dica da entrega (RN-270.16), aviso da separação (RN-270.17); textos da Fila
  (`coletaTexto.js`) e `FRASE_PARCIAL` que dizem "sai no automático na entrega" ajustados. Teste
  `client/src/components/almoxarifado/RequisicoesDuasPrateleiras.test.js`.
- [x] **T4** — `36a9fd45` (Fase 5) e o fechamento — Fase 5, documentos (`fechar-etapa`), suítes, estimativa.

T3 depende só do contrato (RN-270.04) — galho. T2 depende da T1 (lê a tabela).

## Fase 2 (revisor fresco, uma passada, sobre o plano `d3ea0b6d`; sondas apagadas)

1. **[alta, reproduzido, absorvido — R1]** A caixa no banco encolhe a cada baixa (o entregue é gravado logo depois de cada SAÍDA): lidas na
   passada 2, as partes davam 0. → as partes são **fixadas antes da 1ª baixa**, pelo retrato do item (`retratoEntrega`).
2. **[confirmado — R2]** O C461 (3 de A + 2 sem endereço, da padrão).
3. **[reproduzido, absorvido — R3]** Parte (B, sem lote) em material com lote só existe sobre a linha sem lote; o livre lê o lote **exato**
   (`lote_id IS ?`) — ler "qualquer lote em B" faria o motor recusar no meio da entrega.
4. **[alta, leitura, absorvido — L1]** A parte "ressuscitava": a leitura limitada não basta quando a caixa encolhe e depois cresce (rodada
   automática). → a entrega e a devolução à prateleira **regravam** as partes limitadas pela caixa nova (`regravarPartesLimitadas`). A B1644
   foi corrigida: "quem encolhe a caixa regrava; a separação só soma".
5. **[média, absorvido — L2]** Irmão do mesmo material no automático, de id menor, esvaziava B antes da parte. → sub-passada `'2p'` depois das
   passadas 0/1 e antes de **todo** automático.
6. **[média, absorvido — L3]** O orçamento da parte é do **item**, dividido entre os pedaços (excedente sem reserva e os com `reserva_id`).
   Não entra em `saiuDaOrigemPorItem`.
7. **[média, absorvido — L4]** Lote sem guarda não tem régua pronta de livre por endereço → `livreDaParteNaEntrega`: min(linha do par − guarda
   que conta ali, livre do lote no automático). Inspeção/retido **limitam** (não mandam o lote inteiro ao automático). Endereço inativo: o
   motor não recusa a origem inativa; a régua pula mesmo assim (cai no automático, sem efeito ruim).
8. **[alta, a RN estava errada — L5]** A devolução da saída para Estoque vai para o endereço que o almoxarife escolhe (não pelo registro por
   linha). → RN-270.15 corrigida; o teste devolve escolhendo B.
9. **[L6, absorvido]** A dica da entrega reparte a quantidade na ordem (4 com A 3 + B 2 → "1 PC de B-02"); o " — lote L" fica nas duas; o
   "Se lá…" vira "Se em ⟨origem⟩…" só com partes; item com série fica com a frase de antes (tela e servidor); a ordem é a da **primeira**
   separação do par; cancelada continua mostrando "separado de" como a origem (declarado, D).
- T3 independente no código, mas entregue **depois** da T2 (as frases prometem o comportamento dela).

## Fase 5 (um revisor fresco, 20 cenários em sondas `tests/zzsonda270/`, apagadas, sobre `af99a506`)

1. **[baixa, reproduzido, consertado — `36a9fd45`]** Entrega escolhendo **exatamente** B no "Sai de" (caixa A 3 + B 2 + 1): B esvaziava e o
   detalhe ainda dizia B 1 (a regra da caixa tira primeiro o sem prateleira). → o que sai do "Sai de" que é uma outra prateleira desconta dela.
2. **[baixa, reproduzido, registrado — D (270) 7]** O mesmo item separa de B duas vezes as mesmas peças (já passava): a parte fica acima do
   físico de B; a entrega tira o que há e o resto no automático.
3. **[baixa, reproduzido, registrado — D (270) 8]** Parte coberta só em parte na entrega (saída avulsa antes) fica apontando para a
   prateleira vazia até a próxima entrega (como a RN-270.12 manda).
- Tentado e não quebrou: guarda de outra requisição no par (lote), irmão com origem em B e automático escolhido, origem nova no mesmo par da
  parte, lote com inspeção, controle de lote ligado depois, reserva real do `/aprovar`, frações, dois itens com parte em B, cancelamento.
  Nenhuma entrega pela metade, nenhum total diferente do pedido. Não testado: série, retido em quarentena, permite negativo, concorrência real.

## Divergências do plano

- **B1644** — o plano limitava só na leitura; a Fase 2 (L1) mostrou a parte "ressuscitando" → quem encolhe a caixa regrava.
- **B1645 na entrega** — o plano punha a parte no pedaço do próprio item (passada 2); a Fase 2 (L2) pediu a sub-passada `'2p'` antes de
  qualquer automático. As partes são fixadas antes da 1ª baixa (R1).
- **RN-270.15** — dizia que a devolução da saída para Estoque e o estorno da saída devolvem a B-02: **estava errado** (a devolução vai para o
  endereço escolhido; o estorno avulso da saída de requisição é recusado). Corrigida; o teste prova a recusa e a exclusão.
- Testes antigos que afirmavam o automático para a parte de B: `origemSeparacaoEmDuasVezesIntegracao` (cenário 2 e o controle "sem a
  feature", que agora também apaga as partes) e `separacaoOrigemPorItem` (RN-02) — ajustados com nota. Na tela: as frases "sai no automático
  na entrega" da separação parcial, da dica da Fila e do aviso com endereço escolhido (5 arquivos de teste).
- **CLAUDE.md:** nenhuma linha ficou errada — a sub-passada `'2p'` baixa pelo motor dentro das duas travas que a entrega já segura
  (`comTravaDaRequisicao` por dentro da por requisição); a leitura do livre (`livreDaParteNaEntrega`) é a mesma régua do automático.

## Próxima tarefa detalhada

O item **22** da estimativa de 23/11 (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md`, 1h15, motor) — **C553**, o
item 3 do fim do plano da 259: *depois de uma falha inesperada no meio da exclusão, a Devolução ainda aceita o que a exclusão já devolveu*.

- Onde: `server/services/almoxarifado/devolucaoViva.js` — a régua única de "o que já voltou de uma saída" (cinco contas: a validação da
  devolução, o `INSERT … WHERE EXISTS`, a conferência devolução × estorno, as séries que voltaram, a exclusão). Ela não conta a **ENTRADA
  parcial** que a exclusão interrompida gravou (o estorno por linha da exclusão — `fatiasDaSaidaPorLinha`, Etapas 257/259; a B1609 faz a
  exclusão de novo devolver só o que faltava).
- Cenário medido (C553): *A* 3, *B* 5; entrega de 6 (*A* 3, *B* 3); a exclusão falha depois de devolver *A* (a requisição continua);
  **Devolução** de 6 citando a saída → aceita (só 3 estavam fora); **Excluir** de novo → nada a devolver; físico 11 (o certo: 8).
- Contrato: `POST /api/almoxarifado/devolucoes` — nenhum campo novo; a recusa de quantidade acima do que ainda está fora é a de sempre (ler a
  literal no `returnService`). Molde da sonda de falha no meio: o gancho de exclusão de `exclusaoSerieQueVoltou.api.test.js` (RN-15 — dispare o
  gesto concorrente do contexto do teste, não de dentro do gancho; CLAUDE.md).
- Pontos de atenção: a régua é uma só para as cinco contas — mudar num lugar e não nos outros reabre a B1609. A trava: a devolução para
  Estoque roda as pernas sob `naTravaDoMaterial` e a validação fica fora (CLAUDE.md, Etapa 121).
- **O que já está pronto e não reabre:** a separação de duas prateleiras e a entrega de cada parte (esta etapa); a B1609.
- Candidatos fora da estimativa: **C555** (~1 h); a outra prateleira segurar as peças contra outras requisições (**D (270)** 1 — só se
  aparecer na operação); a Fila mostrar as outras prateleiras (**D (270)** 3).

## Pontos de atenção

- A outra prateleira **não** entra em `PARTE_ORIGEM_SQL` nem em nenhuma guarda — se um dia entrar, todas as contas de "separado para outra
  requisição" mudam juntas (B1643).
- Quem encolher a caixa por uma porta nova tem de chamar `regravarPartesLimitadas` depois de gravar (B1644).
- A sub-passada `'2p'` só pega pedaço automático (`passada === 2`, sem origem) e muta `pedaco.quantidade`; a passada 2 pula o pedaço zerado.

## Retro (4 números)

- Rodadas de correção até verde: 2 (Fase 2 — fixar as partes antes da baixa, a sub-passada, o regravar; Fase 5 — o "Sai de" na outra
  prateleira).
- Achados: Fase 2 — 9 (3 reproduzidos, 6 de leitura, todos absorvidos; 1 RN errada); Fase 5 — 3 reproduzidos (1 consertado, 2 declarados).
- Paralelismo: T1 → T2 → T3 em série (um executor); as revisões e a suíte rodaram em paralelo com o código e os documentos.
- Defeito que escapou: (preencher na etapa seguinte). Da 269: nenhum apontado.

## Verificação (medida)

- `npm run test:api` (sozinho, `NODE_OPTIONS=--max-old-space-size=4096`, sobre `4084f4b2`): **680/682 arquivos OK** — os 2 que falham são os já
  conhecidos de proposta, de outra máquina (`propostaBilingueTemplate` 7/1, `propostaPdfExigeLogin`); o mais lento: `propostaClausulasGrava`,
  79,7 s. O conserto da Fase 5 (`36a9fd45`) entrou no meio dessa rodada: depois dele, os 127 arquivos de entrega/separação/origem/exclusão/
  devolução/requisição/Sai de/coleta/Fila rodaram de novo, **127/127 OK**.
- `npm run test:almoxarifado`: **44 passou, 0 falhou**. `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **16/0**.
- Jest da tela (`--maxWorkers=2`, depois do último conserto da tela): **259/259 suítes, 3397/3397 testes**. `CI=true npx react-scripts build`:
  **Compiled successfully.**
- `separarDeDuasPrateleiras` 23/23; `RequisicoesDuasPrateleiras` 10/10. Nenhum clique no navegador (F (270)).
