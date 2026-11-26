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

- [ ] **T1 (tronco, motor)** — RN-264.01 a .04 em `stockService.registrarMovimentacaoSemTrava` + a opção nas três rotas.
- [ ] **T2 (tronco, estorno)** — RN-264.06 a .08 em `cancelarMovimentacao` (ramo de entrada, dentro da seção).
- [ ] **T3 (galho, seletor + tela)** — RN-264.05: `lotService.listarLotesDoMaterial` e o rótulo de `MovimentacoesAlmoxarifado.js` (Jest).
- [ ] **T4 (integração)** — o teste novo `saidaEEstornoComLoteBloqueado.api.test.js` (RN-264.*), atualizar `bloquearIndicandoOLote`
  [RN-249.05 entrada, declarado] (prendia o comportamento de hoje); os arquivos de `tests/api` com lote + saída/estorno, um a um.
  Cruzamento: bloquear com lote → seletor diz livre 2 → Saída de 3 recusa → Saída de 2 passa → estorno da entrada recusa → Desbloquear →
  estorno passa.
- [ ] **T5** Fase 2 (revisor fresco, uma passada) e Fase 5 (revisão adversarial curta, achado só com cenário reproduzido).
- [ ] **T6** fechamento (fechar-etapa sem 7½ e 8) + Passo 7¼.
