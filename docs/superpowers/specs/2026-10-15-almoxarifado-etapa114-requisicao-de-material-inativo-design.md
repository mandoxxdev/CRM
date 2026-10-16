# Almoxarifado — Etapa 114: a requisição de material inativo não é aprovada (design)

> Origem: "Próxima tarefa detalhada — Etapa 114" do plano da 113 (**C229**). Fora: **C228** (se a resposta for recusar
> inativar com documento aberto — inverte a B734, decisão do P.O.), **C219** e **C224** (P.O.). Worktree `CRM-wt-e114`,
> branch `etapa-e114`, a partir da main `22704e8c`.

## Fase 0 — medido (sonda `server/tests/sonda/e114f0.js`, não versionada, 2026-10-15)

| Gesto | Resultado hoje |
|---|---|
| requisição pendente; material inativado com saldo 5 (legado — a 113 já não deixa inativar com saldo); `PUT /aprovar` pelo Administrador | **200 `APROVADO`, `reservas: []`** — `criarReserva` recusa material inativo e o `catch` do laço só faz `console.warn` |
| a mesma, `PUT /separar` 2 | **200 `EM_SEPARACAO`** — a separação **não** recusa material inativo |
| a mesma, `PUT /entregar` 2 | **400** *"P1: Material inativo não pode ser movimentado"* — a caixa fica presa |
| requisição pendente; material inativado **zerado** (o caminho oficial, B734); `PUT /aprovar` | **200 `AGUARDANDO_ESTOQUE`** — espera para sempre: nada credita material inativo |
| dois itens (um ativo com 5, um inativo com 5); `PUT /aprovar` | **200 `PARCIALMENTE_RESERVADA`** — o ativo reservou, o inativo não |
| rascunho; material inativado; `POST /enviar` com aprovação automática ligada | **200 `APROVADO` `aprovacao: automatica`** (saldo 5) / **`AGUARDANDO_ESTOQUE`** (saldo 0) — o envio não confere `ativo` (a criação confere, `requisitionCreateService.js:207`) |
| requisição acima da alçada; material inativado com 5; `PUT /aprovar-valor` | **200 `APROVADO`, `reservas: []`** |

**A spec estava errada em um ponto:** a C229 e a próxima tarefa da 113 diziam que "a separação e a entrega recusam
depois". **A separação não recusa** (medido acima): separa para a caixa e só a entrega recusa.

**O que já é consistente:** as três portas de aprovação rodam sob `comTravaDaRequisicao` (trava de todos os materiais),
e as duas portas que inativam material (`DELETE` e `PUT { ativo: 0 }`) rodam sob `naTravaDoMaterial` (Etapa 113, RN-04 d).
Uma conferência de `ativo` **dentro** da seção da aprovação não pode ser furada por um inativar no meio. A separação
também roda sob as duas travas (Etapa 95). O `/aprovar-valor` grava `APROVADO` **fora** da trava (`aprovarValor`), então a
conferência dele tem de ir no `UPDATE` (a mesma régua da 113: condição no comando que grava + releitura).

**Telas:** `RequisicoesList.js` já mostra `err.response.data.error` no toast do Aprovar (:655), do Aprovar liberação
(:686) e da separação — nenhuma mudança de tela é necessária para a recusa aparecer.

## Decisão (letra B — caminho reversível)

- **Escolhida — (a): recusar.** As três portas de aprovação recusam requisição com item pendente de material inativo
  (400, com o código do material e o caminho: reativar ou rejeitar), antes de qualquer reserva; o envio do rascunho recusa
  como a criação; a separação recusa o item de material inativo. O motivo: aprovar não leva a lugar nenhum — com saldo, a
  entrega recusa; sem saldo, a requisição espera uma chegada que o sistema nunca aceita. Recusar na hora diz ao aprovador
  o que fazer.
- **Descartada — (b): aprovar e avisar** (`avisos` na resposta). A tela de hoje não mostra `avisos` do `/aprovar`; e a
  requisição aprovada continuaria presa — o aviso só muda quem descobre.
- **Descartada — aprovar só os itens ativos (tirar o item inativo).** Muda o pedido de quem requisitou sem ele saber.
- **Reversível:** a recusa mora numa função só (`requisicaoMaterialInativo.js`) e numa condição SQL; voltar ao "aprovar
  sem reservar" é tirar a chamada.

## O que fica de fora

- Requisição **já aprovada** cujo material foi inativado depois (zerado, B734): continua como está — é a família da C228
  (documento aberto), que depende do P.O. A separação nova recusa o item (não deixa ir para a caixa); a consulta **A61**
  acha as que existem.
- Aviso na tela **antes** de clicar Aprovar (selo "material inativo" no detalhe) — a recusa aparece no toast depois do
  clique (D (114)).

> **Fase 2 (revisão do plano):** as literais e a RN-08 (o detalhe diz 0 separável/entregável para o item inativo) mudaram
> depois deste desenho — o contrato que vale está no plano.
