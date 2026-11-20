# Etapa 251 — quanto cada item pode entregar quando dividem o mesmo lote (C489) e quanto pode ser entregue quando o lote da separação ficou bloqueado (C491, C518)

> Itens 20 e 21 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`; 20: 1h, fatia
> de tela; 21: 1h15, fatia de tela + leitura). Ponto de partida: a "Próxima tarefa detalhada" do plano da 250. **Estimativa não revisada:** a
> sonda confirmou os três defeitos no tamanho descrito (leitura do teto no servidor + a divisão na tela, como a da separação).
> **Fatia visível:** a janela de entrega abre com 3 e 0 (antes 3 e 3) quando dois itens disputam o mesmo lote bom; o *"entregável agora"* da
> Fila cai para o que a entrega aceita; e o botão de um clique se apaga com a frase do lote que não deixa sair a parte separada.

## Fase 0 — medido (código + execução, 19/11)

Sonda executada (`createTestApp`, serviço e rotas reais; script no scratchpad, fora do repositório):

- **C489 (item 20).** L1 5 vencido em P, L2 3 em B; dois itens de 3 separados sem origem. Detalhe `quantidade_entregavel/saldo_entregavel/
  saldo_entregavel_proprio` = 3/3/3 **nos dois**; Fila `entregavel` [3, 3]. Entrega 3 + 3 → 400 *"… faltam 3 un em lote que pode sair. Em
  lote impedido: L1 (vencido em …, 5 un). … ou entregue 3 un a menos."*; 3 + 0 → 200 (L2 3). Com três itens (o 1º guardado 2 em (B, L2), os
  outros 2 + 2 sem origem, L2 4): [2, 2, 2] e a entrega 2 + 2 recusa. A tela (`quantidadesIniciaisEntrega`, Etapa 135) divide só o livre do
  material (`saldo_entregavel_proprio` = o entregável inteiro fora da segunda rodada): nada a dividir. **Reproduzido.**
- **C491 (item 21).** L1 3 em A (R1 guardou 3 em (A, L1)), L2 2 em B (R2 guardou 2 em (B, L2)); L1 BLOQUEADO → detalhe e Fila de R1
  oferecem **2**; a entrega automática de 2 e de 1 → 400 *"… nada sai deste material"*. O teto da B1395 soma a parte guardada (3) sem olhar o
  lote; o que limitava era só `disponível − lote impedido` (2). Sem a guarda de R2 (L2 1 livre) o número já batia (1) — o defeito aparece
  quando o resto do material está guardado. **Reproduzido.**
- **C518 (item 21).** L1 5 em B (1 em quarentena), L2 5 em P; item 3 separado de (B, L1); depois 2 de L1 a terceiro → detalhe e Fila
  continuam 3; o um clique de 3 → 400 *"… a origem da separação (B) não serve mais (no lote L1 há 5 un, mas só 2 podem sair nesta entrega:
  …)"*; o um clique de 2 → 200. **Achado da medição:** sem lote impedido o **número** já é o que a entrega aceita pelo automático (*"Qualquer
  endereço"*); o que falha é o **gesto padrão** — o botão de um clique e a janela, que pré-seleciona a planejada. O conserto do C518 é então
  dizer à tela que a planejada não cobre (campo de leitura novo no detalhe) e a tela não mandar o um clique nem pré-selecionar a planejada.
  Com lote impedido no material, o teto da B1395 passa a ser o do automático (a parte não conta).

## Regras de negócio

**Item 20 (C489):**

- **RN-251.01** Detalhe (`GET /requisicoes/:id`), item cujo teto pela régua da conferência existe (material com controle de lote, sem série,
  com saldo em lote impedido — a B1395): dois campos aditivos, `saldo_entregavel_lote` (o que o item entregaria **sozinho**, o teto da B1395)
  e `saldo_entregavel_lote_proprio` (a parte dele que sai da **guarda dele** e não disputa o automático; ≤ o teto). Sem o teto, os campos não
  vêm.
- **RN-251.02** Tela (janela de entrega e botão de um clique — os dois usam o mesmo pré-preenchimento): na ordem do pedido, cada item recebe
  `próprio + max(0, teto − próprio − o que os irmãos anteriores tiram do automático)`, e o irmão tira `max(0, quantidade − próprio dele)`.
  Cenário C489: 3 e **0**; o um clique entrega 3 do item 1 → 200.
- **RN-251.03** Na janela, o máximo de cada item considera o que os **outros** itens estão entregando agora: item 1 em 1 → o item 2 pode 2.
- **RN-251.04** A guarda própria não divide: item 1 guardado 2 em (B, L2), itens 2 e 3 de 2 sem origem, L2 4 (L1 impedido) → 2, 2, **0**; e a
  entrega 2 + 2 + 0 → 200.
- **RN-251.05** Fila (`GET /fila-separacao`): o `entregavel` de cada item é dividido do mesmo jeito, na ordem do pedido: [3, 0] e [2, 2, 0].
  Item com entregável 0 não vira *Entregar*; com todos 0 a requisição vai a *Aguardando saldo* como hoje.
- **RN-251.06** Sem lote impedido (ou material sem controle de lote, ou com série), nada muda: os campos não vêm e a Fila não divide.

**Item 21 (C491, C518):**

- **RN-251.10** Lote da separação **impedido** (bloqueado, reprovado ou vencido sem liberação — a régua da Etapa 224): o teto do item não
  conta a parte guardada nele; é o que o automático entrega (a janela já obriga a escolher de onde sai, Etapa 231). Cenário C491: detalhe e
  Fila **0** (antes 2); `saldo_entregavel_lote_proprio` 0.
- **RN-251.11** Lote da separação com **peça presa** que não deixa sair a parte guardada (a conta da entrega da 218: livre do lote − guardado de
  outras requisições − a guarda dos irmãos desta requisição no lote < parte): o detalhe traz `lote_separacao_nao_cobre: true` e
  `lote_separacao_pode_sair: N` (aditivos, só o detalhe). Com lote impedido no material, o teto é o do automático (como a RN-251.10); sem, o
  número de hoje (o automático já o aceita).
- **RN-251.12** Tela, C518: o botão **Confirmar Entrega e Baixar Estoque** (um clique) se apaga e diz, abaixo de **Entregar escolhendo de onde
  sai…**: `⟨material⟩: separado de ⟨B⟩ — lote ⟨L1⟩: das 3 un separadas dele, só 2 podem sair (peça presa no lote). A entrega direta sairia
  de lá e seria recusada — use "Entregar escolhendo de onde sai…".` (*"nenhuma pode sair"* com 0; *"só 1 pode sair"* com 1). A janela abre o
  item em **"Qualquer endereço (automático)"** (não na planejada) — a troca é registrada como hoje (motivo opcional).
- **RN-251.13** Lote que cobre, lote sem peça presa, item sem origem guardada: nada muda (`lote_separacao_nao_cobre` false ou ausente).

## Contratos

- `GET /api/almoxarifado/requisicoes/:id` — itens ganham, aditivos: `saldo_entregavel_lote`, `saldo_entregavel_lote_proprio` (RN-251.01,
  só com o teto da B1395), `lote_separacao_nao_cobre` (booleano, sempre que a rota o calcula) e `lote_separacao_pode_sair` (número, só com
  `lote_separacao_nao_cobre: true`). O valor de `quantidade_entregavel`/`saldo_entregavel` muda só no C491 (RN-251.10/11).
- `GET /api/almoxarifado/fila-separacao` — mesmo formato; muda o valor de `entregavel` (dividido; RN-251.05, RN-251.10).
- `PUT /requisicoes/:id/entregar` — **sem mudança** (a conferência continua decidindo). Nenhuma recusa nova, nenhuma mensagem nova de servidor.

## Desenho

- Servidor (`requisitionService.js`): `tetoDaEntregaPeloLote(db, item)` passa a devolver `{ teto, proprio }` (ou null) e a olhar a origem
  da separação: impedida (`predicadoLoteImpedidoSql`) ou com peça presa que não cobre (`memoLotesComPecaPresa` + `guardadoNoLoteDeOutras` +
  a parte dos irmãos no lote) → a parte não conta e o teto é `cabeDoAutomaticoPeloLote` com a guarda do item soltando (`fica = 0`), próprio
  0; senão, como hoje (`parte + cabe`, próprio = parte). `anotarTetoDaEntregaPeloLote` anota `teto_entrega_lote`,
  `teto_entrega_lote_proprio` e os dois campos do C518; `normalizarItem` publica `saldo_entregavel_lote(_proprio)`. A Fila divide com uma
  função pura nova `dividirTetoDoLote` (exportada), na ordem do pedido.
- Tela (`RequisicoesList.js`): `maxEntregaNaTela(item, outros, outrosLote)` + `tiraDoLoteNaEntrega`; `quantidadesIniciaisEntrega` e
  `entregandoOutrosDoLote` levam a segunda conta; `itensEntregaDiretaImpedida` inclui `lote_separacao_nao_cobre`, com a frase nova; a
  pré-seleção da janela põe o automático.
- **Sem trava, sem motor:** tudo é leitura; a entrega continua conferindo sob as duas travas.

## Fase 2 — pulada (motivo)

Leitura + tela: nenhum motor, trava, gravação, recusa ou mensagem de servidor muda; o contrato só ganha campos aditivos e o valor do
entregável fica **menor ou igual** ao de hoje (a dica fica mais conservadora). Fluxo traçado até o último gesto: detalhe/Fila (o número) →
um clique (pré-preenchimento dividido; apagado no C518) → janela (máximo dividido; automático pré-selecionado no C518) → `PUT /entregar`
(a conferência do automático da 206 e a da origem da 218 decidem). Nenhum gesto posterior recusa o que o anterior passa a oferecer: o
número novo é o que a porta aceita no caminho que a tela leva (provado por teste que entrega exatamente o número mostrado).

## Tasks

- [x] **T1 (tronco)** `9fc00300` — servidor: testes RN-251.01/.04/.05/.06/.10/.11/.13 em `server/tests/api/entregavelDivididoPeloLote.api.test.js`
  (vermelhos antes) + `tetoDaEntregaPeloLote`/`anotar`/`normalizarItem`/Fila/`dividirTetoDoLote`. Controle positivo por sabotagem.
- [x] **T2 (galho)** `9877c01c` — tela: RN-251.02/.03/.12 em `client/src/components/almoxarifado/RequisicoesEntregaLoteDividido.test.js` (vermelhos antes)
  + `RequisicoesList.js`. Controle positivo.
- [x] **T3** Fase 5: um revisor fresco, sonda executada (reproduzindo a conta da tela sobre o JSON do detalhe e mandando exatamente isso à
  porta), três rodadas. **Rodada 1:** 1 achado real, **regressão da etapa** — caixa num lote com peça presa, com lote impedido no material e
  nada fora do lote cobrindo a caixa: o teto supunha a parte do item toda solta pelo automático (só acontece entregando a caixa inteira);
  a tela mostrava 2, apagava o um clique (que entregava os 2) e abria o automático, recusado ("faltam 1"). Corrigido com teste vermelho antes
  (**RN-251.14**, `e8a79383`; 3 testes; sabotagens: sem o piso com a parte guardada, sem o caminho da origem, a marca sem comparar o
  entregável — cada uma derruba o seu). **Rodada 2:** 1 achado real, anterior à etapa e não fechado por ela (N1: o irmão anterior divide e a
  quantidade de X cabe na origem, mas a marca era do item sozinho) — corrigido na tela com teste vermelho antes (**RN-251.15**, `256bada6`; 2
  testes; a sabotagem da comparação derruba os dois). **Rodada 3:** S1..S13 e N1..N7 aceitos pelo caminho que a tela oferece; nenhum caso
  novo. Asserções faltando apontadas na rodada 1 (n < caixa; quantidade ≤ pode sair) — escritas (RN-251.14). Ruído: 1 (a Fila já limitava
  à caixa na segunda rodada, anterior).
- [x] **T4** fechamento (fechar-etapa sem 7½ e 8).

**RN-251.14 (Fase 5)** Caixa num lote com peça presa que não cobre a parte, com lote impedido no material: o teto é o maior entre o que a
prateleira separada deixa sair (o um clique; próprio = ele) e o automático — com a parte do item solta só se ele cobre a caixa inteira;
senão, com ela guardada. A marca `lote_separacao_nao_cobre` só vem quando o entregável passa do que a prateleira deixa sair.
**RN-251.15 (Fase 5)** A tela só apaga o um clique e só abre o item no automático quando a quantidade que ela vai mandar (dividida entre os
itens) passa de `lote_separacao_pode_sair`.

## Pontos de atenção

- O pool dividido supõe o um clique (a parte própria sai da guarda): escolhendo no *Sai de* outro endereço a tela pode prometer mais que a
  conferência aceita (a porta recusa com a literal da 206) — limitação.
- O teto do item sozinho continua em `quantidade_entregavel` (é o que acende o botão); só o pré-preenchimento e o máximo da janela dividem.

## Divergências do plano

- O plano tratava o C518 com o teto do automático com a parte do item solta. **Estava errado** para caixa maior que o que o automático
  cobre: o automático só solta a parte inteira entregando a caixa inteira (Fase 5, rodada 1 — regressão da etapa, corrigida, RN-251.14).
- A marca `lote_separacao_nao_cobre` era do item sozinho; a tela divide o lote entre itens e a quantidade dividida podia caber na origem (Fase
  5, rodada 2, RN-251.15).
- O teste da tela foi gravado primeiro sobre um arquivo **existente** da Etapa 135 (`RequisicoesEntregavelDividido.test.js`, mesmo nome
  imaginado); percebido no `git diff --stat` antes do commit, restaurado com `git checkout` e o novo ficou em
  `RequisicoesEntregaLoteDividido.test.js`. Nada foi commitado errado.
- Nenhuma linha do `CLAUDE.md` ficou desatualizada (nenhuma trava, motor ou porta de saldo mudou; tudo é leitura).

## Verificação (medida, sobre o código final)

- `npm run test:api` sobre o código final (`256bada6`): **644/644 arquivos**, rodado sozinho (sem Jest nem build em paralelo), terminou sem
  morrer (também 644/644 sobre `9877c01c`, antes da Fase 5).
- `test:almoxarifado` 44/0; `test:validation` 4/0; `test:safealter` 3/0; `test:sqlite` 16/0 (sobre `e8a79383`; a última mudança, `256bada6`,
  é só da tela).
- Jest da tela: **238 suítes, 3216 testes**; `CI=true react-scripts build`: *Compiled successfully*.
- Nenhum clique no navegador (F (251)); o roteiro 3 do documento de novidades foi conferido por sonda (remessa de 3 do L1 com 3 separados:
  pode sair 2, o automático entrega 3).


## Retro (4 números)

- Rodadas de correção até verde: 2 (Fase 5: o teto da caixa com peça presa; a marca pela quantidade dividida).
- Achados: Fase 2 pulada (leitura + tela, motivo acima); Fase 5 — 2 reais (1 regressão da etapa, 1 anterior não fechado), ambos corrigidos com
  teste vermelho antes; 2 asserções faltando escritas; 1 ruído.
- Paralelismo: nenhum galho em paralelo; a Fase 5 rodou junto do `test:api` (o revisor só rodou sondas, sem editar).
- Defeito que escapou: (preencher na etapa seguinte). Da 250: nenhum conhecido.

## Próxima tarefa detalhada

Itens 22, 19 e 23 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`; 22: 45 min,
19: 30 min, 23: 1h30). Módulo Almoxarifado, feature 05.

- **Item 22 — o endereço na troca para o automático (C495).** A entrega de um item com origem da separação por *"Qualquer endereço
  (automático)"* grava em `substituicoes_origem_requisicao` `saiuOrigem: null` / `automatica: 1` (`entregarSemTrava`, mapa `substituicoes`;
  o `INSERT` em `requisitionService.js` ~3132) mesmo quando a saída foi de um endereço só (fatias da Etapa 207, ou o claim do lote). Conserto
  previsto: gravar o endereço (e o lote) quando o livro da entrega tem uma única linha de saída para o item; o bloco **Substituições** do
  detalhe (`listarSubstituicoes`, tela `RequisicoesList.js`) diz *"automático (saiu de B-01)"*. **Medir antes:** sonda com origem A e o
  automático saindo de B — o que o bloco mostra e o que o livro tem.
- **Item 19 — a frase quando dois itens disputam a mesma prateleira (C497, B1415).** Na mesma entrega, item 1 com **Sai de** à mão no
  endereço que o item 2 separou e o item 2 com a origem dele: quando o saldo não cobre os dois vale a recusa de saldo de `checarOrigemItem`
  (*"O saldo em A (1) não cobre a quantidade (3) — a saída tiraria de outros endereços"*), que não diz que o resto é do item 2. Conserto
  previsto: na passada do caso (c) (`casoC`, Etapa 208), frase própria com a guarda dos irmãos (`guardaDosIrmaosNoPar`). Frase só; nada muda
  no que é aceito.
- **Item 23 — a peça com série respeita a separação do outro item (C493, B1404).** Material sem lote com série: a baixa da série tira a linha de
  saldo pela regra de sempre, sem a parte separada do irmão (`fatiasSemLoteParaOAutomatico` pula série, ~3107). Reproduzido em
  `entregaGuardaSemLote.api.test.js` *"[RN-207.02 c]"* (o livro de hoje). **Motor** (baixa com endereço): Fase 2 e Fase 5 obrigatórias;
  medir pela sonda e reestimar se passar de 1h30.
- **Pontos de atenção:** o C495 e o C497 são leitura/frase (sem trava); o C493 mexe na baixa sob a trava da entrega — ler a seção das travas
  do `CLAUDE.md` antes.
- **O que já está pronto e não reabre:** o entregável dividido pelo lote e a origem da separação que não serve mais (esta etapa); a frase das
  peças presas e a sugestão da Fila (250).
