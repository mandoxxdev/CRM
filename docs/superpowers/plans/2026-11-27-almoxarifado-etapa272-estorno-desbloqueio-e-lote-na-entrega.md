# Etapa 272 — Estorno do Desbloquear com lote (C504) e conferência do lote na ordem dos itens (C555)

> Fora da estimativa de 23/11 (os itens 23 e 24 dela dependem de resposta). Estimativa própria:
> `docs/estimativas/2026-11/estimativa_2026-11-27_estorno-desbloqueio-e-lote-na-entrega.md` (45 min + 1 h), commit `48fe26a8`.
> Features: `specs/modulo-almoxarifado/02-movimentacoes` (estorno) e `04-requisicoes` (entrega). Etapa anterior: 271.

## Fase 0 — medido antes de prometer

**A — C504.** Reproduzido com o teste da etapa (`estornoDesbloqueioComLote.api.test.js`, sobre `48fe26a8`): **6 de 10 vermelhos**. L1 4 e
L2 4, bloquear 4 no L1, desbloquear 4 do L1, estornar a entrada do L1 (passa) e estornar o Desbloquear → **200** e o bloqueado do lote volta a
4 apontando para o L1 vazio. Também com parte do lote saída (L1 1) e com a caixa de uma requisição no L1; e a corrida Saída de 4 do L1 ×
estorno do Desbloquear: os dois passavam na 1ª rodada. Onde: `stockService.cancelarMovimentacao`, ramo `DESBLOQUEIO` — o claim confere só o
livre de caixa do **material** (`caixaSql.livreDeCaixaSql`). O claim do livro (`cancelado = 1`) já rodou quando o ramo roda: o
`bloqueadoDoLoteSql` já conta o bloqueio que volta.

**B — C555.** Reproduzido (`entregaLoteOrdemDosItens.api.test.js`): **3 de 8 vermelhos** — a montagem do C555 (L 9: ZA 4, ZB 3, ZC 2; 4 em
inspeção; i separado 3 no automático, k 4 de (ZA, L)); entrega i 3 de (ZB, L) + k 2 de (ZC, L): **passa** com i criado antes de k (pelo serviço
e pela rota `PUT /requisicoes/:id/entregar`), **400** com k antes. Onde: `requisitionService` (entrega, a conferência do lote da 218,
`conferidasNoLote`): para cada item, `podeSair = livre − guardado − jaPedido`, com `guardado` = outras requisições + a guarda que **fica** de
**todas** as outras peças desta requisição no lote, mas `jaPedido` = só o que os itens **anteriores** pedem. Com i antes: i não vê o que k pede
(5 − 2 − 0 = 3, passa) e k não vê a guarda de i (não tem) → 5 saem e a caixa de k (2) fica: 7 comprometidas num lote com 5 livres.
A janela de entrega (`limiteDaOrigemNaEntrega`, client) já faz a conta simétrica (todos os outros itens: o que fica + o que tiram) — **B1636**
diz que ela "fica com a conta da outra ordem"; depois do conserto, é a conta da entrega.

## Regras de negócio

- **RN-272.01** — O estorno de um Desbloquear **com lote** só passa se o lote tiver as peças para bloquear de novo: depois de devolver o bloqueio,
  o que está preso no lote (a caixa de requisição no lote, em inspeção no lote, bloqueado no lote — já com o que volta —, reprovado na inspeção do
  lote, em terceiros do lote) não pode passar do saldo do lote. Senão **400 E1**, nada gravado (o claim volta, o bloqueado do material volta).
  Cenário: o medido acima → E1 com *0 UN livres* e *4 UN*.
- **RN-272.02** — Parte do lote saiu: L1 com 1 → E1 *"1 UN livre"*. O lote intacto: o estorno passa e o bloqueado do lote volta a 4. Desbloqueio
  parcial (2 de 4) com o lote intacto: passa (L1 bloqueado 4).
- **RN-272.03** — A caixa separada de uma requisição no lote conta (a régua do Bloquear indicando o lote, Etapa 249): caixa de 3 no L1 4 → E1 *"1
  UN livre"*.
- **RN-272.04** — Ordem: o material primeiro (a recusa de sempre, *"Não é possível estornar o desbloqueio: saldo disponível insuficiente para
  bloquear de novo: …"*), depois o lote (E1).
- **RN-272.05** — Desbloquear sem lote: como antes.
- **RN-272.06** — A conferência roda dentro da seção do estorno (`naTravaDoMaterial`, Etapa 118): Saída de 4 do L1 × estorno do Desbloquear ao
  mesmo tempo → nunca os dois.
- **RN-272.07** — Na entrega, a conferência do lote com peça presa dá o mesmo resultado em qualquer ordem dos itens (de criação e do corpo): no
  C555, **400 no item i** com a frase *"… no lote L há 9 un, mas só 1 pode sair nesta entrega: 4 un em inspeção; 2 un já separadas dele para
  outras requisições ou outras peças desta; 2 un já pedidas nesta entrega; não cobre a quantidade (3). Escolha outro lote ou deixe "Qualquer
  endereço (automático)""* — a frase de hoje da ordem *k antes de i*. Como: depois da passada de hoje (inalterada — decide quem recebe a recusa
  quando não há guarda que fica, B1447), uma 2ª passada confere cada item com `jaPedido` = o que **todos os outros** itens da entrega pedem do
  lote. A guarda que fica do **próprio** item continua fora (B1446).
- **RN-272.08** — O que cabe passa nas duas ordens: i 1 + k 2 → 200 (o lote fica com a caixa de k 2 e o livre 0).
- **RN-272.09** — Sem guarda que fica de outro item, a 2ª passada nunca recusa (a soma de todos é a mesma da última conferência da 1ª): as
  RN-218.18/19 (e a B1447, a recusa no item à mão) não mudam.
- **RN-272.10** — Um item por vez (o caminho do C555): k 2 de (ZC, L) passa; depois i 3 → 400 (a caixa de k ainda fica); i 1 → 200.
- **RN-272.11** — A janela de entrega não muda de código: o teto dela (B1636) já é a conta da 2ª passada; o texto da B1636 perde a exceção.

## Contratos (congelados)

`POST /api/almoxarifado/movimentacoes/:id/cancelar` — nenhum campo novo. **E1** (400):
`Não é possível estornar o desbloqueio: o lote <L> tem <x> UN livre|livres para bloquear de novo e o estorno bloquearia <q> UN nele — o
bloqueio ficaria apontando para peças que não estão no lote. Para bloquear de novo, use Bloquear Material escolhendo um lote que tenha as
peças.` — `<x>` = MAX(0, saldo do lote − o que está preso nele antes do estorno); singular quando 0 < x < 2; `UN` = a unidade do material.

`PUT /api/almoxarifado/requisicoes/:id/entregar` (e `entregarRequisicao`) — nenhum campo novo; **nenhuma literal nova** (a frase da 218,
`fraseLivreDoLote`, com `jaPedido` = o que os outros itens pedem do lote).

## Tasks

- [ ] **T1 (tronco, motor)** — A: a conferência do lote no ramo `DESBLOQUEIO` do estorno (depois do claim do material, com o
  `compensarBloqueada` já armado; a régua de `projecaoDoLoteNoAjuste`). Teste `estornoDesbloqueioComLote.api.test.js` (rota + serviço + corrida
  + fluxo). Controle positivo por sabotagem.
- [ ] **T2 (tronco, entrega)** — B: a 2ª passada na conferência do lote. Teste `entregaLoteOrdemDosItens.api.test.js` (serviço + rota). Vizinhos:
  `loteEscolhidoPecaPresa`, `entregaSaiDeRespeitaSeparado`, `saiDeComLoteParteSemLote`, `entregaSoLoteRespeitaSeparado`. Sabotagem.
- [ ] **T3** — Fase 5 (revisor fresco, adversarial, cenário reproduzido).
- [ ] **T4** — fechamento (`fechar-etapa`, sem 7½ e 8).

Sem galho: as duas tasks são de motor/entrega (tronco), independentes entre si de regra; rodam em sequência na mesma árvore (a suíte bate num
SQLite só). Sem tela nova: a fatia visível é a mensagem nova do estorno (A) e a recusa igual nas duas ordens (B).

## Pontos de atenção

- O estorno roda inteiro sob `naTravaDoMaterial` (Etapa 118): a conferência fica dentro da seção, depois do claim do material; a recusa sai
  pelo catch, que desfaz o `quantidade_bloqueada` (`compensarBloqueada`) e o claim do livro.
- `bloqueadoDoLoteSql` já conta o bloqueio que volta (o DESBLOQUEIO está `cancelado = 1` no claim). Não somar `q` de novo.
- B: não mexer na 1ª passada (quem recebe a recusa, envelope da planejada B1446/B1447); a 2ª só recusa o que a 1ª deixou passar.
