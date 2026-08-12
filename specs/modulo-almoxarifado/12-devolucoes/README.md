# 12 — Devoluções

> **Status:** 🟡 — registro simples existe, já com destino movimentando pelo motor; falta vínculo à saída original e devolução com lote · **Spec original:** seção 16
> **Última atualização:** 2026-08-11 — auditoria de cauda: corrigida a descrição da movimentação (anterior à Etapa 6) e registradas as decisões da Etapa 6 que afetam esta feature (isenção de lote, RETRABALHO neutro, SUCATA com justificativa)

## Objetivo

Devoluções (da produção, de projeto, de ferramenta, ao fornecedor, de cliente) sempre vinculadas à saída original, com avaliação de condição e destino (estoque/inspeção/reparo/sucata).

## O que já existe

- `devolucoes_material_almoxarifado` (`schema.js`): material, quantidade, motivo, condição, destino, origem_os_id, origem_projeto_id.
- `GET/POST /devolucoes` (`extended.js`) via `returnService.js`. Teste de serviço existe. O serviço audita a criação (`registrarAuditoria`).
- Movimentação conforme o destino, via motor (`returnService.registrarDevolucao`): destino ESTOQUE/QUARENTENA emite `ENTRADA_DEVOLUCAO` (quarentena emite também `BLOQUEIO`), destino SUCATA emite `SUCATA` e destino RETRABALHO emite `RETRABALHO`. **Correção (2026-08-11):** a spec dizia "tipo `DEVOLUCAO` na movimentação v1/v2" — isso descrevia o estado anterior à Etapa 6 e estava desatualizado; `DEVOLUCAO` sobrevive apenas como tipo aceito na rota v1.

### Decisões da Etapa 6 (2026-08-10) que afetam esta feature

- **Devolução é isenta de `controle_lote`**: a entrada de devolução entra com `lote_id NULL` mesmo em material controlado por lote — isenção **declarada** pelo motor (o chamador não passa `exigeLote`), espelhando o que a spec 10 documenta. Devolver **com** lote é pendência desta feature (checklist abaixo).
- **`RETRABALHO` é tipo neutro ao saldo**: registra no livro mas não baixa nem aumenta nada (ramo de tipo neutro no `stockService`) — não estava dito nesta spec.
- **`SUCATA` passou a exigir justificativa no motor** (`REGRAS_VINCULO` em `movementRules`); o `returnService` já envia `justificativa` no destino SUCATA, então o caminho devolução→sucata continua passando.

### Compensação da devolução recusada (conserto de 2026-08-12, fora do plano da Etapa 7)

`registrarDevolucao` grava a linha de `devolucoes_material_almoxarifado` **antes** de emitir as movimentações — precisa do `id` para montar `referencia: DEV-<id>`. Como **não há transação neste módulo** (SQLite; a migração para Postgres é que resolve de vez), qualquer recusa do motor depois desse `INSERT` deixava a linha gravada: uma devolução registrada que nunca aconteceu.

**Medido por sonda executada (2026-08-12):** material com `controle_lote`, entrada de 20 no lote L1, saída de 10; devolução **avulsa** de 3 sem informar lote → `400 "O material ORF exige lote nesta movimentacao"` e `linhas em devolucoes_material_almoxarifado antes: 0 | depois: 1`.

Duas consequências, e a segunda é invisível:

1. `listarDevolucoes` (a tela da Etapa 7) mostrava uma devolução que não existe.
2. Quando a recusada **citava uma saída**, a linha fantasma entrava no `SUM(quantidade)` que `validarSaidaOriginal` e o `saldo_devolvivel` de `listarSaidasElegiveis` usam — cada recusa **encolhia permanentemente** o quanto ainda podia ser devolvido daquela entrega, sem avisar ninguém (medido: saldo devolvível 10 → 7 depois de uma devolução **recusada** de 3).

**Comportamento a partir daqui** — a emissão das movimentações roda dentro de `try/catch`, e o `catch` pergunta se alguma movimentação chegou ao livro (`COUNT` por `referencia = DEV-<id>`, que é única por devolução):

| Situação | O que acontece com a linha | Por quê |
|---|---|---|
| **Nenhuma** movimentação gravada | `DELETE` da linha + auditoria `COMPENSACAO`; o erro **original** é re-lançado sem máscara | nada aconteceu no estoque: a linha é ficção e contamina o `saldo_devolvivel` |
| **Alguma** movimentação já gravada (caso do destino `SUCATA`, que emite `ENTRADA_DEVOLUCAO` e só depois `SUCATA`) | a linha **fica**, com auditoria `ESTADO_PARCIAL`; o erro original é re-lançado | apagar seria pior que o bug: a linha passaria a ser o único rastro de um movimento real, e a `ENTRADA_DEVOLUCAO` ficaria com `referencia` apontando para nada |

As pré-validações que a Etapa 7 já tinha (status do lote no destino `SUCATA`; cardinalidade de série) **continuam** e continuam sendo a primeira linha de defesa — são elas que impedem o par entrada+saída de ficar meio feito, coisa que compensação nenhuma desfaz. Compensação foi escolhida **em vez de** mais pré-validação caso a caso porque o buraco é geral: a lista de erros do motor cresce sem o `returnService` saber.

## Checklist

### Backend
- [ ] Vincular devolução à **movimentação de saída original** (`movimentacao_saida_id`) — validar quantidade devolvida ≤ entregue
- [ ] Devolução **com lote**: permitir informar o lote na entrada de devolução de material com `controle_lote` (hoje entra com `lote_id NULL` por isenção declarada — decisão da Etapa 6, 2026-08-10)
- [ ] Tipos de devolução (spec 16): produção, projeto, instalação externa, ferramenta (feature 16), não utilizado, ao fornecedor, do fornecedor, de cliente (feature 13), assistência técnica
- [ ] Condição → destino: boa → estoque · suspeita → inspeção (feature 09) · danificada → reparo/sucata (feature 15)
- [ ] Fotos da devolução (anexos)
- [ ] Atualizar custo do projeto (estorno de consumo — feature 22)
- [ ] Devolução ao fornecedor: fluxo próprio com documento e e-mail
- [ ] E-mail automático (feature 19)

### Frontend
- [ ] Tela de devoluções (hoje inexistente) — criar a partir de uma saída/requisição entregue

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Devolver mais que o entregue falha | `devolucao acima da quantidade entregue falha` |
| Devolução vincula-se à saída original | `devolucao sem saida original valida falha` |
| Condição "suspeita" entra em inspeção, não no disponível | `devolucao para inspecao nao aumenta disponivel` |
| Devolução ao estoque restaura saldo e registra no livro | `devolucao boa aumenta saldo com movimentacao vinculada` |
| Devolução recusada não deixa linha gravada | `[compensacao] devolucao avulsa sem lote recusada nao deixa linha gravada` |
| Devolução recusada não encolhe o devolvível da entrega citada | `[compensacao] devolucao vinculada recusada nao encolhe o saldo_devolvivel da entrega` |
| Devolução com movimentação já gravada **mantém** a linha (rastro do estoque) | `[compensacao] devolucao com movimentacao JA gravada mantem a linha (rastro do estoque)` |

## Dependências

- 03 (movimentação) · 09 (inspeção) · 15 (sucata) · 16 (ferramentas) · 22 (custo de projeto).
