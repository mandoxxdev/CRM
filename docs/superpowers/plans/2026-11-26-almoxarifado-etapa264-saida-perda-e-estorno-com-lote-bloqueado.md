# Etapa 264 — A Saída e a Perda com lote respeitam as peças bloqueadas do lote (C546) e o estorno da entrada de um lote com peças bloqueadas (C547)

> Itens **8** e **9** da estimativa da semana (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md`, commitada em
> `d7e6afb9` — 1h15 + 1h; não refeita: a Fase 0 não mudou o tamanho em 1 h). A "próxima tarefa detalhada" do plano da 262.
> **Fatia visível:** o seletor de lote de Movimentações (Saída e Perda) e o da devolução ao cliente passam a descontar as peças bloqueadas do
> lote do "livre", e Movimentações diz quantas estão bloqueadas; as duas recusas novas.

## Fase 0 — medido (sonda `scratchpad/sonda-264.js`, pela rota, sobre `b35554d8`)

| # | Cenário (material com lote, *L1* 4, *L2* 4) | Hoje | Certo |
|---|---|---|---|
| S1 | Bloquear 2 indicando *L1*; Saída v2 de 4 do *L1* | 201; *L1* 0, bloqueado diz *L1 2* | recusa (só 2 podem sair) |
| S2 | o mesmo, Saída de 3 | 201; *L1* 1, livro *L1 2* | recusa |
| S3 | o mesmo, Perda de 3 | 201 | recusa |
| S4 | o mesmo, Saída de 2 | 201; *L1* 2 | o mesmo (cabe) |
| S5 | o mesmo, Ajuste negativo de 3 (v2) | 201 | recusa (é saída) |
| S6 | o mesmo, Saída de 4 pela **v1** | 201 | recusa |
| S7 | seletor `GET /materiais/:id/lotes?com_saldo=1` com *L1* 2 bloqueados | *L1* saldo 4, **livre 4** | livre 2 |
| E1 | Bloquear 4 indicando *L1*; estornar a entrada de *L1* | 200; *L1* 0, bloqueado diz *L1 4* (o total cai sobre o *L2*) | recusa (desbloqueie antes) |

- **Causa C546:** `registrarMovimentacao` (ramo `tiposSaida`) só confere o bloqueado do **material** (`Material bloqueado não pode ser
  utilizado`, `quantidade_atual − quantidade_bloqueada`); com lote, o claim do lote (`claimSaldoDoLote`) olha só o saldo das linhas do lote.
  O retido do lote (`retidoDoLote.situacaoDosLotes`, a régua da entrega e da separação desde a 217/218) não é lido.
- **Causa C547:** `cancelarMovimentacao`, ramo de entrada (dentro da seção da trava), confere o disponível do material e o piso da linha do
  lote; nada olha o bloqueado do lote.
- O seletor (`lotService.listarLotesDoMaterial`, Etapa 241) dá `livre = min(saldo positivo do lote, livre do material)`.

## Decisões

- **B1621 (item 8, C546)** — a régua é a **da entrega**: o que pode sair do lote = `situacaoDosLotes.livre` = saldo do lote − em inspeção
  no lote − retido no lote (quarentena/avulso pelo livro, reprovação da inspeção, em terceiros, com o limite por família B1436). Vale para
  **todo tipo de saída** das três portas **manuais** — `POST /movimentacoes` (v1, o modal rápido), `POST /movimentacoes/v2` (a tela de
  Movimentações: Saída, Perda, Ajuste negativo, saídas de produção) e `POST /materiais-cliente/devolucoes` (a janela da devolução ao
  cliente, que lê o mesmo seletor) —, declarada por opção do chamador (`confereLivreDoLote`, no 4º argumento, nunca no corpo). **Descartado:**
  (a) só o bloqueado do livro (`bloqueadoDoLoteSql`) — deixaria a reprovação, a remessa e a inspeção do lote saindo pela Saída, e o
  seletor mostraria um livre diferente da entrega; (b) pôr a guarda no motor para todos os chamadores — a entrega e a separação já têm a
  delas (com a caixa e o "pedido nesta entrega"), e os internos (devolução para Sucata, NC, sucateamento, terceiros, Ajuste) baixam
  justamente peças presas ou têm régua própria; mexer neles sem sonda é regressão provável. **Fora (declarado):** a caixa separada de uma
  requisição no lote (a Saída avulsa continua conferindo a caixa do **material**, Etapa 97); material com série (a série bloqueada já não é
  escolhível); saldo negativo permitido (o motor não confere a linha do lote — RN-241). **Reversível:** é a guarda + a opção.
- **B1622 (item 9, C547)** — o estorno de uma **entrada com lote** é recusado quando, sem ela, o lote ficaria com menos peças do que as
  bloqueadas nele pelo livro (quarentena/avulso — `BLOQUEIO`/`DESBLOQUEIO` com o lote, a parcela que aponta para o lote); a mensagem manda
  desbloquear escolhendo o lote. A régua: `min(quantidade_bloqueada, livro do lote)`, com o livro "que mais bloqueia" (o `BLOQUEIO` conta
  enquanto o estorno dele não concluiu, o `DESBLOQUEIO` só com `cancelado = 0` — a lição do claim provisório da 262). **Descartado:** (a) a
  régua inteira do retido (reprovação, terceiros) — a entrada da nota com reprovação já é recusada por guarda própria ("teve N reprovado(s)
  na inspeção") e a remessa a terceiros não baixa o lote (D); (b) desbloquear junto no estorno (seriam dois efeitos num gesto, o mesmo
  descartado da B760/B1617). **Reversível.**
- **B1623 (fatia visível)** — o seletor de lote ganha `bloqueado_no_lote` (o retido do lote, a mesma régua da B1621) e o `livre` passa a
  descontá-lo; Movimentações diz *"L1 — saldo 4 — livre 2 (2 bloqueadas no lote)"*. A janela da devolução ao cliente só ganha o livre menor
  (o rótulo dela não muda). **Reversível.**

## Regras de negócio

- **RN-264.01 (C546)** `POST /movimentacoes` (v1) e `POST /movimentacoes/v2`, tipo em `TIPOS_SAIDA`, com lote (`lote_id` ou `lote`
  resolvido), material com controle de lote e **sem** série, sem saldo negativo efetivo, sem `reserva_id`: se a quantidade passa do livre do
  lote **e** o lote tem peça presa (retido + em inspeção > folga), 400 antes de qualquer efeito, com:
  *"No lote ⟨L⟩ há ⟨saldo⟩ ⟨un⟩, mas só ⟨livre⟩ ⟨pode|podem⟩ sair: ⟨parcelas⟩; não cobre a quantidade (⟨q⟩). Escolha outro lote ou diminua a
  quantidade."* — parcelas, nesta ordem e só as > folga: *"⟨N⟩ ⟨un⟩ ⟨está bloqueada|estão bloqueadas⟩ nele (quarentena, reprovação na
  inspeção ou com terceiro)"*, *"⟨N⟩ ⟨un⟩ em inspeção"*, separadas por "; ". Singular quando 0 < x < 2 (a regra de `fraseLivreDoLote`).
  Nada gravado (físico, linhas, livro).
- **RN-264.02** Ordem: as guardas de sempre do material (`Saldo insuficiente. Disponível: …`, `Material bloqueado não pode ser utilizado`)
  vêm **antes** — a mensagem delas não muda; a RN-264.01 depois delas e antes do claim. Roda dentro da seção da trava do material (o motor
  inteiro, `naTravaDoMaterial`) — quem bloqueia com lote (`bloquearMaterial`) pega a mesma trava.
- **RN-264.03** `POST /materiais-cliente/devolucoes` com lote: a mesma RN-264.01 (a janela lê o mesmo seletor).
- **RN-264.04 (não muda)** a entrega e a separação; os chamadores internos do motor; a Transferência; a saída sem lote; a que consome
  reserva; material com série; saldo negativo permitido; lote sem peça presa (a recusa de sempre do claim do lote).
- **RN-264.05 (seletor)** `GET /materiais/:id/lotes`: em material com controle de lote, sem série e sem saldo negativo efetivo, cada lote
  traz `bloqueado_no_lote` (o retido, 0 sem nada preso) e `livre = min(saldo positivo, livre do material, livre do lote da RN-264.01)`;
  nos outros materiais `bloqueado_no_lote` é 0 e o `livre` é o de antes. Movimentações (Saída e Perda), quando `bloqueado_no_lote > 0`:
  *"⟨L⟩ — saldo ⟨s⟩ — livre ⟨l⟩ (⟨N⟩ ⟨bloqueada|bloqueadas⟩ no lote)"*.
- **RN-264.06 (C547)** `POST /movimentacoes/:id/cancelar` de uma entrada (`TIPOS_ENTRADA`) com `lote_id`, fora da compensação interna:
  dentro da seção da trava, depois das guardas da devolução (RN-262.01/.02, que continuam primeiro com as mensagens delas) e da releitura
  das séries, antes do débito: `bloq = min(quantidade_bloqueada, livro do lote)` (livro "que mais bloqueia", acima); `depois = Σ linhas do
  lote − q`; se `bloq > max(0, depois) + folga` → 400:
  *"Não é possível estornar: o lote ⟨L⟩ tem ⟨bloq⟩ ⟨un⟩ ⟨bloqueada|bloqueadas⟩ e, sem esta entrada, ficaria com ⟨max(0, depois)⟩ ⟨un⟩ — o
  bloqueio ficaria apontando para peças que não estão no lote. Desbloqueie ⟨N⟩ ⟨un⟩ do lote ⟨L⟩ (Desbloquear Material, escolhendo o lote
  ⟨L⟩) e depois estorne esta entrada."* com `N = bloq − max(0, depois)`. O claim volta pelo catch (nada muda: físico, linhas, `cancelado`,
  sem linha ESTORNO).
- **RN-264.07 (não trava)** lote com o bloqueio já desbloqueado ou estornado; lote cujo resto cobre o bloqueado (*L1* 6 com 2 bloqueados,
  estorno de uma entrada de 4 → 200); entrada sem lote; a compensação interna.
- **RN-264.08 (corrida)** a guarda roda sob a trava do material: um Bloquear com lote (pega a trava) não cabe entre a conferência e o
  débito; o estorno de um BLOQUEIO parado no claim provisório continua contando (o livro "que mais bloqueia").

## Contratos

- `POST /api/almoxarifado/movimentacoes`, `/movimentacoes/v2`, `/materiais-cliente/devolucoes` — resposta igual; recusa nova 400 com a
  literal da RN-264.01.
- `POST /api/almoxarifado/movimentacoes/:id/cancelar` — recusa nova 400 com a literal da RN-264.06.
- `GET /api/almoxarifado/materiais/:id/lotes` — campo novo `bloqueado_no_lote` (número); `livre` menor quando há retido.
- Motor: `registrarMovimentacao(db, user, params, { ..., confereLivreDoLote: true })` — opção nova, só nas três rotas.
- Banco: nada novo. Sem consulta de produção (letra A não se aplica). Primeiro boot: não se aplica.

## Tasks

- [x] **T1 (tronco, motor)** — `a5d374b9`: RN-264.01 a .04 em `stockService.registrarMovimentacaoSemTrava` + a opção nas três rotas e (Fase 2) no
  retalho e no sucateamento comum. Fase 5: também com reserva (`3aa15a7b`).
- [x] **T2 (tronco, estorno)** — `347d24e6`: RN-264.06 a .08 em `cancelarMovimentacao` (ramo de entrada, dentro da seção), com reprovação e
  terceiro (Fase 2); o teto da reprovação e de terceiros (Fase 5, `3aa15a7b`).
- [x] **T3 (galho, seletor + tela)** — `a5d374b9`: — RN-264.05: `lotService.listarLotesDoMaterial` e o rótulo de `MovimentacoesAlmoxarifado.js` (Jest).
- [x] **T4 (integração)** — `347d24e6` (o teste foi no commit do estorno, com os dois da 249): — o teste novo `saidaEEstornoComLoteBloqueado.api.test.js` (RN-264.*), atualizar `bloquearIndicandoOLote`
  [RN-249.05 entrada, declarado] (prendia o comportamento de hoje); os arquivos de `tests/api` com lote + saída/estorno, um a um.
  Cruzamento: bloquear com lote → seletor diz livre 2 → Saída de 3 recusa → Saída de 2 passa → estorno da entrada recusa → Desbloquear →
  estorno passa.
- [x] **T5** Fase 2 (revisor fresco, uma passada) e Fase 5 (revisão adversarial curta, achado só com cenário reproduzido).
- [x] **T6** fechamento (fechar-etapa sem 7½ e 8) + Passo 7¼.

## Fase 2 (revisor fresco, 26/11; sonda `scratchpad/fase2-264-sonda.js`, pela rota e pelo serviço, sobre `8ff1e714`)

1. **[importante, reproduzido]** Duas portas manuais com lote ficavam fora: o **retalho com baixa** (`scrapService.gerarRetalho`, Sobras →
   Retalho) e o **sucateamento comum** (sem NC, `scrapDisposalService`, a baixa na 2ª assinatura) — as duas leem o mesmo seletor de lote e
   baixavam 4 do *L1* com 2 bloqueados nele. O descartado (b) da B1621 dizia que "o sucateamento baixa peças presas" — **estava errado**: só o
   sucateamento ligado à NC (`doBloqueado`) baixa do bloqueado. → **consertado**: as duas passam `confereLivreDoLote` (RN-264.03 revista);
   cenários [RN-264.03 retalho] e [RN-264.03 sucateamento]; sabotagens S10 e S11.
2. **[importante, reproduzido]** A régua do estorno (B1622) só via o bloqueado do livro; a **reprovação** da inspeção no lote (e o que está com
   terceiro — a remessa não baixa o lote) causa o mesmo estrago com outra entrada do mesmo lote (*L1* 2 + 4, 3 reprovadas, estorno da de 4 →
   200, *L1* 2). O descartado (a) supunha só a entrada da própria nota — **estava errado**. → **consertado**: o estorno soma as parcelas cruas
   (bloqueado do livro + reprovado + com terceiro, a régua do Bloquear com lote da 249), com uma literal geral quando há outra parcela além do
   bloqueio (RN-264.06 revista); cenário [RN-264.06 reprovacao]; sabotagem S12. A inspeção em curso fica fora (o estorno da nota a desfaz).
3. **[importante, leitura]** A janela da devolução ao cliente mandaria *"… ou libere a reserva do material"* quando o livre menor vem do
   bloqueio no lote. → **consertado**: com `bloqueado_no_lote > 0`, *"Do lote M1 estão livres só 2 (2 bloqueadas no lote): devolva até 2 ou
   escolha outro lote."* e a frase do livre cita o lote (Jest `MateriaisClienteDevolucaoLoteLivre` [RN-264.05]).
4. **[menor, reproduzido]** Família que não cabe (B1436): a régua da saída (a da entrega) solta a reprovação, o Ajuste com lote (253) e o
   Bloquear (249) usam as parcelas cruas — o AJUSTE para 4 do *L1* recusa e o AJUSTE_NEGATIVO de 4 passa. → **declarado** (D (264) 1): a
   saída fica na régua da entrega para não divergir do seletor e da entrega.
5. **[menor, não reproduzido]** As duas réguas divergem: a saída lê o bloqueado com `cancelado = 0` (o claim provisório do estorno de um
   BLOQUEIO, fora da trava, some da conta, como na entrega); o estorno usa o livro "que mais bloqueia" sem o corte da família. →
   **declarado** (D (264) 2).
6. **[menor]** O Ajuste negativo não está no formulário de Movimentações (é tipo interno; só pela API) — a recusa vale, o rótulo não precisa.
   A recusa sem peça presa no lote é a de sempre do claim do lote (contrato: nada muda). → **conferido**, sem mudança.
7. **[ruído]** Lote com menos saldo que a inspeção: a literal soma parcelas maiores que o saldo — fica (a frase da entrega faz igual).

### RN revistas pela Fase 2

- **RN-264.03 (revista):** também `scrapService.gerarRetalho` (baixa do original com lote) e a baixa do sucateamento comum
  (`scrapDisposalService`, 2ª assinatura; a recusa desfaz a assinatura e devolve a literal da RN-264.01).
- **RN-264.06 (revista):** `presa = min(quantidade_bloqueada, livro do lote) + reprovado do lote + com terceiro do lote`; recusa quando
  `presa > max(0, depois) + folga`. Só bloqueio → a literal do plano. Com reprovação ou terceiro → *"Não é possível estornar: o lote ⟨L⟩ tem
  ⟨presa⟩ ⟨un⟩ ⟨presa|presas⟩ nele (⟨N⟩ ⟨bloqueada|bloqueadas⟩; ⟨N⟩ ⟨reprovada|reprovadas⟩ na inspeção; ⟨N⟩ com terceiro) e, sem esta entrada,
  ficaria com ⟨fica⟩ ⟨un⟩ — o lote ficaria apontando para peças que não estão nele. Libere ⟨N⟩ ⟨un⟩ do lote ⟨L⟩ (o bloqueio no Desbloquear
  Material, escolhendo o lote ⟨L⟩; a reprovação pela não conformidade; a peça com terceiro pelo retorno da remessa) e depois estorne esta
  entrada."* (só as parcelas e os caminhos presentes).

## Fase 5 (dois revisores frescos, 26/11, sondas executadas `scratchpad/fase5a-264-a.js`, `fase5b-264-*.js`, sobre `347d24e6`)

1. **[importante, reproduzido]** Reprovação já liberada pelo Desbloquear *"Sem lote"* (bloqueado 0, documento sem carimbo — C501): o estorno da
   entrada do *L1* recusava mandando para a não conformidade, que não destrava. → **consertado** (`3aa15a7b`): a reprovação conta só no que
   `quantidade_bloqueada − bloqueado do lote` ainda cobre, e terceiros só no que `quantidade_em_terceiros` cobre (o teto por família da B1436,
   por parcela). Cenário [Fase 5 achado 1]; sabotagem S13.
2. **[menor, reproduzido]** A Saída de 4 do *L1* consumindo uma **reserva manual** levava as 2 bloqueadas (a RN-264.04 tirava toda saída com
   reserva). A reserva é do material, nunca do lote. → **consertado**: a guarda vale com reserva. Cenário [Fase 5 achado 2]; sabotagem S14.
3. **[menor, reproduzido]** A parcela **em inspeção** da Saída e a **com terceiro** do estorno não tinham cenário (sabotagem das duas: 23/23
   verde). → **consertado**: cenários [Fase 5 achado 3a/3b]; sabotagens S15, S16.
4. **[importante, fora do diff, reproduzido]** O **estorno do Desbloquear** com lote bloqueia de novo sem conferir o livre do lote (C504, D (249)
   2): bloquear 4 no *L1*, desbloquear, estornar a entrada (200, certo) e estornar o Desbloquear → 200, o bloqueio volta sobre o *L1* vazio. →
   **declarado** (D (264) 5), com o conserto medido (~45 min) — candidato a etapa própria.
5. **[menor, reproduzido com gancho e falha forçada]** A Saída durante o estorno de um BLOQUEIO que falha (D (264) 2). → **declarado** (já estava).
6. **[ruído]** O estorno confere a peça presa também com saldo negativo permitido, a Saída não — declarado (D (264) 4). Autorização: as rotas
   mudadas mantêm os gates (só a opção no 4º argumento).
- Tentado e não quebrou: Bloquear × Saída e Bloquear × estorno (sob a trava); o claim provisório no estorno; a recusa dentro da seção devolve o
  claim e as reservas soltas da nota; lote por código; a compensação interna; o seletor = o motor nos cenários.

## Divergências do plano

- O descartado (b) da B1621 dizia que "o sucateamento baixa peças presas" — **estava errado** para o sucateamento comum (Fase 2, 1).
- O descartado (a) da B1622 supunha só a entrada da própria nota — **estava errado** (Fase 2, 2); e a régua crua da reprovação travava a
  reprovação já liberada (Fase 5, 1).
- A RN-264.01 excluía a saída com reserva — **errado** para a reserva manual (Fase 5, 2).
- O teste T4 foi no commit do estorno (o arquivo cobre os dois itens); o commit da saída levou o código e a tela.
- **CLAUDE.md:** nenhuma linha ficou errada — a guarda nova roda dentro da seção do motor (`naTravaDoMaterial`) e do estorno que a seção das
  travas já descreve; nenhuma porta nova lê o livre para reservar.

## Próxima tarefa detalhada

Os itens **10 e 11** da estimativa de 23/11 (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md`), nesta ordem:

1. **Item 10 — Transferência de peça com número de série (C76, B1584, D (252) 3; 1h30, tela + motor).** `routes/almoxarifado/extended.js`
   (`POST /transferencias`, ~927) e o ramo `TRANSFERENCIA` de `stockService.registrarMovimentacaoSemTrava` não leem `serie_ids`;
   `MovimentacoesAlmoxarifado.js` (~88-98) diz que a tela não pede série na transferência; `series_almoxarifado.localizacao_id` existe
   (`schema.js` ~1569). Contrato a congelar: `serie_ids` (array de ids *Em estoque* do material, na origem), quantidade = número de séries;
   recusas literais para série de outra prateleira/lote/status. Atenção: o motor roda sob `naTravaDoMaterial`; o bloquear/desbloquear série
   (`mudarStatusSerie`) pega a mesma trava (RN-10 da 118); o estorno da transferência tem de devolver o endereço das séries.
2. **Item 11 — Saída de peça com série sai da prateleira da série (C545, D (252) 2, D (259) 3; 1h30, motor).** Molde `fatiasDaSerieSemLote`
   (`requisitionService.js` ~2290-2310, Etapa 252) na Saída avulsa (`registrarMovimentacao`, ramo de saída); depende do item 10 (B1584: o
   endereço da série só vale quando bate com o saldo da prateleira).
- Motor: Fase 2 e Fase 5 com sonda executada, como nesta.
- **O que já está pronto e não reabre:** a guarda do lote na Saída e no estorno da entrada (esta etapa).
- Candidato fora da estimativa: o estorno do Desbloquear com lote conferir o livre do lote (C504; Fase 5 da 264, achado 4).

## Verificação (medida sobre o código final, `3aa15a7b`)

- `npm run test:api` (sozinho, `NODE_OPTIONS=--max-old-space-size=4096`): **671/673 arquivos OK** — os 2 que falham são os já conhecidos de
  proposta, de outra máquina (`propostaBilingueTemplate`, `propostaPdfExigeLogin`); o mais lento: `propostaClausulasGrava`, 83,7 s. (Sobre
  `347d24e6`, antes da Fase 5: também 671/673, os mesmos 2.)
- `npm run test:almoxarifado`: **44 passou, 0 falhou**. `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **16/0**.
- Jest da tela (`--maxWorkers=2`): **255/255 suítes, 3351/3351 testes**. `CI=true npx react-scripts build`: **Compiled successfully.**
- `saidaEEstornoComLoteBloqueado` 27/27; `bloquearIndicandoOLote` 19/19. Sabotagens S1-S16 (harness `scratchpad/sab-264.sh`: âncora contada = 1,
  cópia, md5 sabotado ≠ original e restaurado = original) e duas da tela: cada uma derruba o seu cenário pela asserção certa.
- Primeiro boot: não se aplica (nenhuma tabela nem coluna). Nenhum clique no navegador (F (264)).

## Retro (4 números)

- Rodadas de correção até verde: 3 (T1/T2; Fase 2 — duas portas de Sobras, a reprovação no estorno, a frase da devolução ao cliente; Fase 5 —
  o teto da reprovação, a reserva, dois cenários).
- Achados: Fase 2 — 3 importantes consertados, 2 menores declarados, 1 conferido, 1 ruído; Fase 5 — 1 importante consertado, 2 menores
  consertados, 1 importante fora do diff declarado (C504), 1 menor declarado, 1 ruído.
- Paralelismo: nenhum galho (motor e tela no mesmo contrato, pequenos); os revisores rodaram enquanto os documentos eram escritos.
- Defeito que escapou: (preencher na etapa seguinte). Da 262/263: nenhum apontado.
