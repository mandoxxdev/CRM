# Etapa 262 — O estorno da entrada de uma devolução respeita a quarentena (C239) e a requisição já excluída (C552)

> Itens **6** e **7** da estimativa da semana (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md`, commitada em
> `d7e6afb9` — 1h15 + 1h; não refeita: o plano não mudou o tamanho em 1 h). A "próxima tarefa detalhada" do plano da 261.
> **Fatia visível:** as duas recusas novas ao clicar em **Estornar** na entrada da devolução (Movimentações). Motor puro.

## Fase 0 — medido (sonda `scratchpad/sab-262-sonda.js`, pela rota, sobre `cc38576c`)

| # | Cenário | Hoje | Certo |
|---|---|---|---|
| Q1 | Entrada 10; Saída 2; Devolução 2 para **Quarentena** (físico 10, bloq. 2); estorno da entrada | 200, físico 8, **bloq. 2** | recusa (o bloqueio de pé) |
| Q2 | o mesmo, mas **Desbloquear** 2 antes (quarentena liberada: 10, bloq. 0); estorno do bloqueio → *"o bloqueio já foi desfeito"*; estorno da entrada | 200, 8, bloq. 0 | o mesmo (a peça foi liberada; só o físico sai) |
| Q3 | Q1, estornado o **bloqueio** antes (10, 0); estorno da entrada | 200, 8, 0 | o mesmo |
| Q4 | Q1 com lote L1 (o bloqueio leva L1) | 200, 8, **bloq. 2** | recusa |
| X1 | Entrada 5; requisição entrega 2; Devolução 2 (Estoque) citando a saída (5); **Excluir** a requisição (5 — a exclusão desconta a devolução); estorno da entrada | 200, físico **3** | recusa (5) |
| X2 | X1 com destino Quarentena; estorno do bloqueio (5, 0); estorno da entrada | 200, **3** | recusa |
| X3 | X1 com destino Sucata (3); estorno da sucata (5); estorno da entrada | 200, **3** | recusa |

- **Causa C239:** `stockService.cancelarMovimentacao` lê `devolucaoDaEntrada` (~3294) só para a Sucata (`entradaDaSucata`) e as séries; a
  perna `BLOQUEIO` com a mesma `referencia DEV-<n>` (`returnService.js` ~388) não é olhada.
- **Causa C552:** nenhuma conferência de que a requisição da saída citada (`movimentacoes_almoxarifado.requisicao_id` da saída) está excluída
  (`requisicoes_almoxarifado.ativo = 0`). A exclusão (`requisitionService.excluirSemTrava`, sob a trava por requisição e a por material dos
  itens) credita o líquido de cada saída **descontada a devolução viva** (`DEVOLUCAO_VIVA_SQL`) e grava `ativo = 0` dentro da mesma seção.
- A devolução nova citando a saída de requisição excluída já é recusada (C244, Etapa 117). O estorno da perna Sucata/Bloqueio não tem guarda
  nova (estornar a sucata depois da exclusão dá o número certo: X3 5).

## Decisões

- **B1617 (item 6, C239; revê a B761)** — a entrada da devolução para Quarentena **não** se estorna enquanto o bloqueio dela está de pé e
  ainda **cobre** a quantidade (o estorno do bloqueio passaria); a mensagem manda estornar o bloqueio antes — o mesmo padrão da Sucata
  (B760). Quarentena **já liberada** (Desbloquear; o bloqueio não cobre mais) → a entrada estorna como hoje (Q2: a peça foi liberada, só o
  físico sai). **Descartado:** (a) estornar a perna do bloqueio junto (o operador espera, mas o estorno passaria a desfazer duas
  movimentações — dois claims, duas linhas ESTORNO, o desfazer das duas; o mesmo descartado da B760); (b) recusar sempre que o bloqueio não
  foi estornado (a B761 já apontava: com a quarentena liberada o estorno do bloqueio recusa *"o bloqueio já foi desfeito"* e a entrada ficaria
  presa para sempre). **Preço declarado:** "cobre" é a régua do material (o bloqueado total, e o do lote pelo livro) — com outro bloqueio do
  mesmo material de pé, uma quarentena já liberada ainda recusa e manda estornar o bloqueio (o estorno dele tiraria o bloqueio de outro; já é
  assim no estorno do bloqueio). **Reversível:** é a guarda.
- **B1618 (item 7, C552)** — a entrada de uma devolução que cita a saída de uma requisição **excluída** não se estorna, em qualquer destino;
  o caminho é um Ajuste. Vem **antes** da guarda da Sucata e da Quarentena (estornar a sucata/bloqueio não destravaria — mandar fazer isso
  seria mandar mexer à toa). **Descartado:** creditar de volta na requisição (não existe mais); só avisar (o físico fica a menos).
  **Reversível.**

## Regras de negócio

- **RN-262.01 (C552)** O estorno (`POST /movimentacoes/:id/cancelar`, sem `compensacao`) de uma `ENTRADA_DEVOLUCAO` que é a entrada da
  devolução (a identidade de `devolucaoViva.js`), cuja `movimentacao_saida_id` tem `requisicao_id` de uma requisição com `ativo = 0`, é
  recusado (400), antes do claim, com: *"Não é possível estornar: esta entrada é da devolução DEV-⟨n⟩, de uma entrega da requisição
  ⟨numero⟩, que foi excluída — a exclusão já devolveu ao estoque o resto da entrega contando com esta devolução, e estornar a entrada tiraria
  estas peças de novo. Se a devolução foi registrada errada, acerte o estoque com um Ajuste."* Todos os destinos. Nada muda (físico,
  `cancelado`, sem linha ESTORNO).
- **RN-262.02 (C239)** Fora da RN-262.01: o estorno da entrada de uma devolução para **Quarentena** é recusado (400) quando a perna `BLOQUEIO`
  (a **primeira** `BLOQUEIO` do material com a mesma referência e id maior que a entrada) **não** tem estorno concluído e: (i) tem um estorno
  em andamento (claim provisório `cancelado = 1` sem `movimento_estorno_id`), ou (ii) ainda cobre — `quantidade_bloqueada ≥ q` e, com lote, o
  bloqueado do lote (pelo livro) `≥ q`; sem lote, `quantidade_bloqueada − Σ bloqueado com lote ≥ q`. Mensagem: *"Não é possível estornar:
  esta entrada é da devolução DEV-⟨n⟩, que foi para a quarentena, e o bloqueio dela continua de pé — estornar só a entrada deixaria
  bloqueadas peças que não estão mais no estoque. Estorne primeiro o bloqueio desta devolução e depois esta entrada."*
- **RN-262.03** Não trava: a quarentena liberada (Q2); o bloqueio estornado (Q3); a devolução para Estoque de requisição **não** excluída; a
  devolução avulsa (sem saída); a saída avulsa (sem requisição); a compensação interna.
- **RN-262.04 (corrida)** As duas guardas rodam **de novo dentro da seção da trava do material**, antes de qualquer efeito (o claim volta
  pelo catch): a exclusão da requisição e o estorno do Desbloquear/Bloqueio pegam a mesma trava. Exclusão disparada entre a guarda de fora e
  a seção → o estorno recusa com a RN-262.01 e o físico fica o da exclusão.
- **RN-262.05 (ordem)** RN-262.01 → Sucata (E1 da 117) → RN-262.02 → as de série de sempre.

- **RN-262.02, revista pela Fase 2 (achados 1, 2 e 5):** o que conta é o **alcance** da perna — `min(q, régua)`, com a régua do lote pelo
  livro e, sem lote, `min(bloqueado − Σ com lote, livro sem lote)` (a reprovação da inspeção soma no bloqueado sem livro e não entra). Alcance
  `q` → a literal acima; alcance entre 0 e `q` (quarentena liberada pela metade) → *"Não é possível estornar: esta entrada é da devolução
  DEV-⟨n⟩, que foi para a quarentena, e ainda há ⟨N⟩ ⟨un⟩ dela no bloqueio — estornar só a entrada deixaria bloqueadas peças que não estão
  mais no estoque. Desbloqueie ⟨N⟩ ⟨un⟩ e depois estorne esta entrada."*; alcance 0 → passa. Estorno da perna em andamento (claim provisório)
  → *"Não é possível estornar agora: o estorno do bloqueio da devolução DEV-⟨n⟩ está em andamento — tente de novo em instantes."*
- **RN-262.05, revista (Fase 2, achado 4):** a RN-262.01 vem antes também das guardas de **série** da entrada (a leitura da devolução subiu
  para antes delas); a da Quarentena fica depois da Sucata.

## Fase 2 (revisor fresco, 24/11; sonda `scratchpad/fase2-262-b.js`, pela rota)

1. **[importante, reproduzido]** Quarentena liberada pela metade (Desbloquear 1): pela régua "cobre q" a entrada passava e ficava **1 bloqueado
   sem peça** (o estorno do bloqueio recusa depois). → **consertado**: o alcance parcial recusa e manda desbloquear o resto (cenário + S8).
2. **[importante, reproduzido com bloqueio avulso]** Sem lote, a régua do total contava o bloqueado da **reprovação** (sem livro): a mensagem
   mandaria estornar o bloqueio da devolução, que comeria o da reprovação, e a NC recusaria depois (*"O material já havia saído do bloqueio"*).
   → **consertado**: sem lote, o menor entre o total − lotes e o livro sem lote (cenários + S5/S6). O bloqueio **avulso** sem lote continua
   contando (está no livro) — preço declarado na B1617.
3. **[importante]** `bloqueioSabeOLote` [RN-217.05] estornava pela rota a entrada com o bloqueio de L1 de pé (o estado da C504). → o teste
   prova a recusa e monta o estado antigo pela compensação.
4. **[menor]** A ordem: as guardas de série rodavam antes de onde se lia a devolução. → a leitura subiu; a RN-262.01 vem antes delas.
5. **[menor]** Claim provisório do bloqueio com a mensagem "continua de pé". → literal própria ("em andamento").
6. **[ruído, conferido]** só a devolução grava BLOQUEIO com `DEV-n`; só a exclusão grava `ativo = 0`, dentro da trava do material; o caso
  (i) é necessário (a soma do lote ignora `cancelado = 1`); nenhuma compensação estorna entrada de devolução. Último gesto: depois da
  RN-262.01 resta o Ajuste (ninguém preso); depois da RN-262.02, estornar o bloqueio ou desbloquear destrava.

## Contratos

- `POST /api/almoxarifado/movimentacoes/:id/cancelar` — resposta igual; recusas novas (400) as literais acima. Nada mais muda.
- Banco: nada novo. Sem consulta de produção (letra A não se aplica). Primeiro boot: não se aplica.

## Tasks

- [x] **T1 (tronco, motor)** — `7474faa0`: `recusaDaDevolucaoDeRequisicaoExcluida` e `recusaDaDevolucaoEmQuarentena` em `stockService.js`; a
  leitura de `devolucaoDaEntrada` subiu para antes das guardas de série; as duas antes do claim e de novo no começo da seção da trava.
  `estornoEntradaDevolucaoQuarentenaExcluida.api.test.js` 16 no commit (**9 vermelhos no código de antes**, os 7 "não trava" verdes nos dois).
  Sabotagens **S1-S10** (harness `scratchpad/sab-262-harness.js`: âncora contada = 1, cópia, md5 sabotado ≠ original e restaurado = original):
  sem a C552 de fora (a ordem cai), sem a releitura na seção (as duas corridas caem), claim provisório passa, a régua sem lote sem o livro
  (a reprovação), sem os lotes, a do lote pelo total, a parte com a mensagem inteira, a C552 sem o `ativo`, a ordem C552 × Sucata — cada uma
  derruba o seu cenário pela asserção certa. **S3** (a guarda da Quarentena de fora) **não derruba nada**: a releitura na seção recusa com a
  mesma literal antes de qualquer efeito — defesa em profundidade, mantida e declarada (a de fora poupa o claim e a espera da trava).
- [x] **T2** — no mesmo commit: `devolucaoViva` [R6/C239] passou a provar a recusa; `bloqueioSabeOLote` [RN-217.05] (Fase 2, achado 3)
  prova a recusa pela rota e monta o estado da C504 pela compensação.
- [x] **T3 integração** — os 27 arquivos de `tests/api` com devolução e estorno, um a um, sobre `7474faa0`: todos verdes.
- [x] **T4** Fase 2 (acima, consertos no `7474faa0`). **T5** Fase 5 (abaixo).
- [x] **T6** fechamento (fechar-etapa sem 7½ e 8) + Passo 7¼. Primeiro boot: **não se aplica** (nenhuma tabela nem coluna).

## Fase 5 (revisor adversarial fresco, 24/11, sondas executadas `scratchpad/fase5-262-*.js`, pela rota)

1. **[importante, reproduzido]** A régua sem lote caía a 0 com uma liberação de NC **anterior**: a reprovação soma no bloqueado sem livro e a
   liberação grava DESBLOQUEIO sem lote (livro sem lote −2); depois, a devolução para Quarentena (10, 2) e o estorno da entrada passava →
   **[8, 2]** com a perna viva — a C239 de volta, sem corrida. → **consertado** (`d84c9f1e`): o livro conta **da perna em diante**
   (`b.id >= perna.id`), também no lote. Cenário [Fase 5 achado 1]; sabotagem **S11** (desde 0) derruba.
2. **[menor, reproduzido com gancho]** O claim provisório de **outro** estorno sumia da conta (a soma usava `cancelado = 0`): o estorno de um
   bloqueio avulso parado no claim fazia a entrada passar (20/20); se ele falhasse depois, **[8, 2]** (10/10). → **consertado**: no livro da
   perna, o BLOQUEIO conta enquanto o estorno dele não concluiu e o DESBLOQUEIO só com `cancelado = 0` (a régua que mais bloqueia); o Σ com
   lote, ao contrário (é subtraído). Cenário [Fase 5 achado 2] (claim simulado); sabotagem **S12** derruba. S4-S7 refeitas sobre o conserto:
   cada uma derruba o seu cenário.
3. **[menor, reproduzido]** A régua é do material: duas quarentenas sem lote (A liberada, B de pé) → a entrada de A recusa, e o caminho da
   mensagem (estornar o bloqueio de A) solta a quarentena de B ([6, 0] com a perna de B viva); um bloqueio avulso depois da liberação idem. →
   **declarado** (D (262) 1; o "desde a perna" resolveu o caso do avulso **anterior**).
4. **[menor, reproduzido]** Desbloquear 2, estornar a entrada ([8, 0]) e **depois** estornar o Desbloquear → 200, [8, 2] com a perna viva (a
   ordem sequencial; a corrida já recusa). → **declarado** (D (262) 6): o estorno do Desbloquear confere só o livre de caixa.
5. **[ruído]** Requisição excluída antes da Etapa 117 (a exclusão não descontava a devolução): o estorno recusa e o acerto é o Ajuste — o que
   a mensagem já diz.
- Tentado e não quebrou: lote liberado em parte; quarentena com série (os dois caminhos, séries de volta a Entregue); devolução avulsa para
  Quarentena; material com negativo + requisição excluída; requisição só cancelada (passa, [3, 0]); exclusão que falha na 2ª Entrada
  (requisição ativa: o estorno passa e a nova exclusão chega a 10); **falha forçada** no INSERT do ESTORNO (entrada e perna BLOQUEIO): tudo
  desfeito, a 2ª tentativa certa; recusa dentro da seção desfaz o claim; corridas de 30 rodadas — bloqueio × entrada nas duas ordens 60/60,
  entrada × exclusão (Estoque e Quarentena) 60/60 sempre [5, 0], entrada × Desbloquear 30/30, entrada × estorno do Desbloquear 30/30.

## Próxima tarefa detalhada

Os itens **8 e 9** da estimativa de 23/11 (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md`), juntos numa etapa — a
mesma régua do bloqueado por lote (`bloqueioPorLote.bloqueadoDoLoteSql`; e o retido de `retidoDoLote.js`):

1. **Item 8 — a Saída e a Perda com lote respeitam as peças bloqueadas do lote (C546, D (249) 1; 1h15, motor).** Medido na 249: *L1* 4 com 2
   bloqueados em *L1*, *L2* 4 — a **Saída** de 4 do *L1* (Movimentações) passa, confere o bloqueado do **material** e não o do lote; *L1* fica 0
   e o livro ainda diz *L1 2* bloqueado. Onde: `stockService.registrarMovimentacao` (ramo de saída com `lote_id`; o motor inteiro roda sob
   `naTravaDoMaterial`); hoje o motor não usa `retidoDoLote` nem `bloqueioPorLote` na saída (só `requisitionService`,
   `reservaChegadaService`, `lotService`). Fatia visível: o seletor de lote da Saída já mostra o livre do lote (Etapa 241) — somar as
   bloqueadas. Pontos de atenção: a mesma régua da entrega (`loteImpedido`/`retidoDoLote`, com o limite por família B1436) para não divergir;
   a literal no molde da recusa do lote na entrega (manual 7.x, *"no lote L1 há 4 PC, mas só 2 podem sair …"*); as compensações internas e
   a devolução para Sucata (`parDaDevolucao`) não podem ser barradas pelo bloqueio que a própria devolução gravou.
2. **Item 9 — o estorno da entrada de um lote com peças bloqueadas (C547; 1h, motor/estorno).** Medido na 249: *L1* 4 todo bloqueado no
   lote, *L2* 4 — estornar a entrada do *L1* passa; *L1* 0 e o livro diz *L1 4* bloqueado. Onde: `cancelarMovimentacao`, ramo de entrada
   (`tiposEntrada`), dentro da seção da trava — conferir `bloqueadoDoLoteSql(material, mov.lote_id)` contra o saldo do lote depois do
   débito; recusa com o caminho (*Desbloquear* escolhendo o lote). Atenção: a entrada da devolução para Quarentena já é recusada pela
   RN-262.02 (a guarda nova não pode mudar a mensagem dela — ordem); o claim provisório (régua "vivo" = estorno concluído, lição da 261/262).
- Motor/estorno: Fase 2 e Fase 5 com sonda executada, falha forçada e corrida, como nesta.
- **O que já está pronto e não reabre:** as duas recusas do estorno da entrada da devolução (requisição excluída; quarentena de pé ou
  liberada em parte) e a releitura delas sob a trava.

## Divergências do plano

- A RN-262.02 do plano dizia "cobre" (`quantidade_bloqueada ≥ q` e o bloqueado do lote / o sem lote do material) — **estava errada em três
  pontos**: a liberação pela metade deixava bloqueio sem peça (Fase 2, 1), a régua sem lote contava a reprovação (Fase 2, 2) e o livro sem
  lote inteiro zerava com uma liberação de NC anterior (Fase 5, 1). Vale o alcance da perna, com o livro da perna em diante.
- A RN-262.05 dizia que a RN-262.01 vinha antes das guardas de série — no código elas rodavam antes da leitura da devolução (Fase 2, 4); a
  leitura subiu.
- Um teste fora da T2 caiu (`bloqueioSabeOLote` [RN-217.05], Fase 2, 3).
- **CLAUDE.md:** nenhuma linha ficou errada — a seção das travas não descreve as guardas da entrada da devolução; as releituras novas rodam
  dentro da seção do estorno que ela já descreve, e a conferência devolução × estorno no comando continua como está.

## Verificação (medida sobre o código final, `d84c9f1e`)

- `npm run test:api` (sozinho, `NODE_OPTIONS=--max-old-space-size=4096`): **661/661 arquivos OK** (o mais lento: `propostaClausulasGrava`, 70,6 s).
- `npm run test:almoxarifado`: **44 passou, 0 falhou**. `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **16/0** (sobre `7474faa0`;
  a Fase 5 só mudou a conta da quarentena, coberta pelo `test:api`).
- Jest da tela (`--maxWorkers=2`; a tela não mudou): **244/244 suítes, 3270/3270 testes**. `CI=true npx react-scripts build`: **Compiled
  successfully.**
- `estornoEntradaDevolucaoQuarentenaExcluida` 18/18; os 27 arquivos de devolução com estorno, um a um, sobre `7474faa0`: verdes.
- Primeiro boot: não se aplica. Nenhum clique no navegador (F (262)).

## Retro (4 números)

- Rodadas de correção até verde: 3 (T1; Fase 2 — alcance parcial, reprovação, ordem, teste da 217; Fase 5 — livro da perna e claim alheio).
- Achados: Fase 2 — 3 importantes (2 consertados, 1 teste atualizado), 2 menores consertados, ruídos conferidos; Fase 5 — 1 importante
  consertado, 1 menor consertado, 2 menores declarados (D (262) 1 e 6), 1 ruído.
- Paralelismo: nenhum galho (uma task de tronco); os revisores rodaram enquanto o teste e os documentos eram escritos. A Fase 2 sondou o
  repositório antes do código novo; a Fase 5 sobre o `7474faa0` sem sabotagem rodando ao mesmo tempo.
- Defeito que escapou: (preencher na etapa seguinte). Da 261: nenhum apontado.
