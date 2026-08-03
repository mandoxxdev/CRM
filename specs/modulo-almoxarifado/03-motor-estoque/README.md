# 03 — Motor de Estoque (saldos, movimentações, livro, saídas)

> **Status:** 🟡 — o motor v2 existe e é bom, mas a produção usa a rota v1 · **Spec original:** seções 7 (fórmula de saldo), 13 (saídas), 30 (livro de movimentações)
> **Última atualização:** 2026-08-02

## Objetivo

Um único caminho de movimentação, transacional, com livro imutável (estorno em vez de exclusão), fórmula de disponibilidade correta e a "regra crítica" de saída aplicada.

## O que já existe

- **Motor v2:** `stockService.registrarMovimentacao` (`services/almoxarifado/stockService.js`, 380 L) — 20 tipos de movimento, lote, localização origem/destino, integração com reservas, grava auditoria, saldo anterior/posterior. Rota: `POST /movimentacoes/v2` (`extended.js:100`).
- **Estorno:** `POST /movimentacoes/:id/cancelar` (`extended.js:107`) com `movimento_estorno_id`, `cancelamento_motivo`.
- **Saldos:** `estoque_saldo_almoxarifado` por material+localização+lote com `quantidade_reservada/bloqueada/em_inspecao`; espelho agregado no material.
- **Colunas de vínculo já existem** na movimentação: `projeto_id`, `os_id`, `cliente_id`, `requisicao_id`, `reserva_id`, `recebimento_id`, `documento_vinculado`, `justificativa`.
- **Rota v1 legada:** `POST /movimentacoes` (`routes/almoxarifado.js:573`) — 4 tipos, sem lote/localização/auditoria. **É a que o front usa.**
- Testes de serviço: entrada/saída, saldo negativo bloqueado, transferência, bloqueio, material inativo (em `almoxarifado.test.js`).
- Concorrência SQLite tratada (`services/sqliteConcurrency.js` — WAL + retry BUSY).

## Fórmula de disponibilidade (spec 7)

```
Estoque físico − bloqueado − quarentena/inspeção − reservado = Estoque disponível
```

Colunas existem; falta garantir que TODAS as operações (saída, reserva, inspeção, bloqueio) mantêm a fórmula e que consultas/relatórios usam "disponível" onde a spec exige.

## Checklist

### Backend
- [ ] (00.3) Unificar v1→v2 — pré-requisito, ver `00-fundacao-tecnica`
- [ ] Regra crítica de saída (spec 13.3): exigir usuário, motivo, documento/requisição de origem, quantidade, localização e projeto/OS/centro de custo **conforme o tipo** de movimento (tabela de obrigatoriedade por tipo)
- [ ] Saída emergencial: permitida com flag + justificativa obrigatória + pendência de regularização
- [ ] Validar saída de material bloqueado / em quarentena / vencido / lote reprovado (as duas últimas dependem da feature 10)
- [ ] `permite_saldo_negativo` respeitado (default: bloquear; spec 26 pede bloqueio de negativo)
- [ ] Centro de custo como vínculo (coluna nova — projeto/OS já existem)
- [ ] Atualização de custo médio na entrada (custo_medio existe; validar cálculo + teste)
- [ ] Consulta "livro de movimentações" com filtros (material, período, projeto, OS, usuário, tipo) — parcial em `GET /movimentacoes`
- [ ] Histórico completo do item (spec 27): endpoint agregando movimentações+reservas+inspeções

### Frontend
- [ ] `MovimentacoesAlmoxarifado.js` na v2: lote, localização origem/destino, vínculo projeto/OS (selects estruturados no lugar do campo texto `referencia`)
- [ ] Tela/ação de estorno com motivo (hoje inexistente)
- [ ] Extrato do item (histórico completo)

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Saída sem saldo disponível falha e não altera nada | `saida sem saldo disponivel retorna 400 e saldo intacto` |
| Reservado/bloqueado/inspeção reduzem o disponível | `disponivel = fisico - bloqueado - inspecao - reservado` |
| Movimentação confirmada não pode ser excluída — só estornada | `DELETE de movimentacao inexiste; estorno cria movimento inverso vinculado` |
| Estorno exige motivo | `estorno sem motivo falha` |
| Saída exige requisito mínimo por tipo (regra crítica) | `saida sem projeto/OS quando obrigatorio falha` |
| Saldo anterior/posterior corretos e sequenciais | `livro registra saldo_anterior e saldo_posterior consistentes` |
| Duas movimentações concorrentes não corrompem saldo | `movimentacoes concorrentes mantem saldo correto` (usar padrão de `sqliteConcurrency.test.js`) |
| Movimentação grava auditoria | `movimentacao v2 grava auditoria_log_almoxarifado` |

## Dependências

- **00-fundacao-tecnica** (harness + unificação v1/v2) — obrigatória antes de tudo aqui.
- Validações de vencido/reprovado chegam com a feature 10 (lotes).
