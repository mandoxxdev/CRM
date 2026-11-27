# Etapa 273 — Estorno da entrada de lote com reprovação liberada (C556) e a guarda de outra caixa na entrega (C485)

> Fora da estimativa de 23/11 (os itens 23 e 24 dela dependem de resposta). Estimativa própria:
> `docs/estimativas/2026-11/estimativa_2026-11-27_estorno-entrada-lote-e-guarda-de-outra-caixa.md` (30 min + 45 min), commit `858e1911`.
> Features: `specs/modulo-almoxarifado/02-movimentacoes` (estorno) e `05-separacao-entrega` / `04-requisicoes` (entrega). Etapa anterior: 272.

## Fase 0 — medido antes de prometer (sondas executadas sobre `a4850e27`)

**A — C556. Reproduzido.** L1 com duas entradas (4 + 1), L2 4; reprovação de 2 na inspeção do L1, já liberada pelo "Sem lote" (bloqueado 0,
documento sem carimbo — C501); **Bloquear 4 do L2**; estornar a entrada de 4 do L1 → **400** *"Não é possível estornar: o lote L1 tem 2 UN presas
nele (2 reprovadas na inspeção) e, sem esta entrada, ficaria com 1 UN — … Libere 1 UN do lote L1 (a reprovação pela não conformidade) e depois
estorne esta entrada."* Sem o bloqueio do L2 → **200**. A causa é a mesma da Fase 5 da 272: `stockService.recusaDoEstornoDeEntradaDoLoteBloqueado`
limita a reprovação por `total − bloqueado DESTE lote`; o bloqueio do L2 entra no total e devolve a reprovação liberada. A frase manda para a
não conformidade, que não destrava nada (a reprovação já foi liberada).

**B — C485, a metade da outra caixa. Não reproduzido em 7 sondas** (cópia do harness da 206): (1) R1 guarda o L1 inteiro em (A01, L1) → R2 nem
separa (*"não é possível separar 2 un. Máximo: 0"*), com e sem saldo negativo permitido; (2) R2 separada antes sem origem, R1 guarda depois, uma
Transferência de 2 do L1 para outro endereço → a entrega de R2 sai do que não está guardado, nenhuma linha negativa; (3) R2 separou 1 de 2, R1 guarda
3 do L1 4, a entrega de R2 pede 2 (com e sem automático; com e sem saldo negativo permitido) → **400** *"… não é possível entregar 2 un. Máximo: 1
(pendente: 2, disponível: 4)"*, antes de baixar. A conta: o disponível do material já desconta a caixa inteira de cada requisição (a parte guardada
inclusive), e o automático só pula a parte guardada das **outras** caixas — o que o automático pode tirar dos lotes que podem sair é sempre ≥ o
que a conferência do disponível deixa passar. O aviso C485 (Etapa 206) dizia *"(… todo na parte guardada da caixa de outra requisição) a entrega
não recusa … sai sem lote … a linha fica negativa"* e **nunca foi medido** nessa metade (a reprodução da 206, RN-206.15 c, era da inspeção).
Caminho (o reversível do plano da 272): provar por cenário com as portas de hoje e corrigir o aviso dizendo que estava errado; se uma sonda da
Fase 5 reproduzir, recusar antes da baixa.

## Regras de negócio

- **RN-273.01** — No estorno da entrada de um lote, a reprovação da inspeção do lote só conta como presa no que o bloqueado do material ainda
  cobre **além do bloqueado de todos os lotes** (`total − max(bloqueado deste lote, Σ por lote do bloqueado com lote)`). Cenário: o de cima →
  **200**; o L1 fica 1, o bloqueado do material fica 4 (o do L2).
- **RN-273.02** — A reprovação **não** liberada continua presa: o mesmo cenário sem o "Sem lote" (bloqueado 2 + 4 = 6) → **400** com a literal
  geral de hoje (*"… tem 2 UN presas nele (2 reprovadas na inspeção) e, sem esta entrada, ficaria com 1 UN — … Libere 1 UN do lote L1 (a
  reprovação pela não conformidade) e depois estorne esta entrada."*), nada gravado.
- **RN-273.03** — O bloqueio do próprio lote continua com a literal "só o bloqueio" da 264, e o bloqueio de outro lote sozinho não prende o lote
  do estorno: L1 4 + 1, L2 4, bloquear 4 do L2 (sem reprovação) → o estorno da entrada de 4 do L1 passa.
- **RN-273.04** — Mesma régua do Σ por lote da 272 (o BLOQUEIO conta enquanto o estorno dele não concluiu; o DESBLOQUEIO só com `cancelado = 0`;
  `MAX(0, …)` por lote). Uma régua só, em uma função, usada pelos dois estornos.
- **RN-273.05** — A conferência continua dentro da seção do estorno (`naTravaDoMaterial`, Etapa 118), antes do débito; a recusa volta o claim.
  Pelo serviço (`cancelarMovimentacao`) e pela rota `POST /movimentacoes/:id/cancelar`.
- **RN-273.06** — Entrega (C485, outra caixa): a entrega de uma requisição cujo lote bom está na parte guardada da caixa de **outra** nunca
  deixa linha negativa: ou sai do que não está guardado, ou é recusada antes de baixar com a literal da conferência do disponível. Cenários: as 3
  sondas da Fase 0 viram teste (rota `PUT /requisicoes/:id/entregar`), mais o caminho pelo serviço (`entregarRequisicao`) e um fluxo
  separar → transferir → entregar → conferir linhas e físico.
- **RN-273.07** — Se a Fase 5 reproduzir um negativo por outra caixa, a regra passa a ser: recusar antes de qualquer baixa, com a frase do
  disponível. (Só se reproduzir.)

## Contratos (congelados)

`POST /api/almoxarifado/movimentacoes/:id/cancelar` — nenhum campo novo, **nenhuma literal nova** (só deixa de recusar quando a reprovação já foi
liberada e outro lote tem bloqueio; a literal geral da 264 fica igual).

`PUT /api/almoxarifado/requisicoes/:id/entregar` — sem mudança de código (B prova). Literais que o teste trava (lidas do código):
*"⟨material⟩: não é possível separar ⟨n⟩ un. Máximo: ⟨m⟩ (pendente: ⟨p⟩, disponível: ⟨d⟩)"* e *"⟨material⟩: não é possível entregar ⟨n⟩ un.
Máximo: ⟨m⟩ (pendente: ⟨p⟩, disponível: ⟨d⟩)"*.

## Tasks

- [ ] **T1 (tronco, motor)** — A: `bloqueadoComLoteSql` (a régua do Σ por lote) extraída e usada por `presoNoLoteParaEstorno` (272) e por
  `recusaDoEstornoDeEntradaDoLoteBloqueado` (264). Teste `estornoEntradaLoteReprovacaoLiberada.api.test.js` (rota + serviço). Sabotagem.
- [ ] **T2 (galho, só teste)** — B: `entregaGuardaDeOutraCaixa.api.test.js` (as sondas como cenários, rota + serviço + fluxo). Controle positivo:
  sabotar o desconto da caixa das outras no disponível da entrega e no automático, e ver o vermelho.
- [ ] **T3** — Fase 5 (revisor fresco, adversarial, cenário reproduzido; sondas de B: devolução, estorno da separação, exclusão, cancelamento
  de outra requisição).
- [ ] **T4** — fechamento (`fechar-etapa`, sem 7½ e 8).

## Pontos de atenção

- `com_lote` lê o livro inteiro (sem o `desde` da 262) — como na 272.
- A reprovação continua limitada pelo total; a régua só fica mais baixa (nunca recusa algo que passava).
- B não muda código; se a Fase 5 achar caminho, T2 vira tronco.
