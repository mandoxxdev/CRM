# 03 — Motor de Estoque (saldos, movimentações, livro, saídas)

> **Status:** 🟢 — Etapa 1 entregue (2026-08-04): motor v2 com regra crítica/emergencial/centro de custo/custo médio, livro com filtros e extrato do item, estorno com motivo (backend + tela). Falta só o que depende da feature 10 (validação de vencido/lote reprovado). · **Spec original:** seções 7 (fórmula de saldo), 13 (saídas), 30 (livro de movimentações)
> **Última atualização:** 2026-08-04
> **📋 Plano de implementação pronto:** [docs/superpowers/plans/2026-08-04-almoxarifado-etapa1-motor-estoque.md](../../../docs/superpowers/plans/2026-08-04-almoxarifado-etapa1-motor-estoque.md) — 9 tasks TDD (todas concluídas)

## Objetivo

Um único caminho de movimentação, transacional, com livro imutável (estorno em vez de exclusão), fórmula de disponibilidade correta e a "regra crítica" de saída aplicada.

## O que já existe

- **Motor v2:** `stockService.registrarMovimentacao` (`services/almoxarifado/stockService.js`) — 20 tipos de movimento, lote, localização origem/destino, centro de custo, integração com reservas, custo médio, grava auditoria, saldo anterior/posterior atômico. Rota: `POST /movimentacoes/v2` (`extended.js`).
- **Estorno:** `POST /movimentacoes/:id/cancelar` (`extended.js`, `stockService.cancelarMovimentacao`) com `movimento_estorno_id`, `cancelamento_motivo`; reverte saldo e localizações (entrada/saída/ajuste/transferência); NÃO reverte custo médio — decisão registrada em 2026-08-04; bloqueia estornar ESTORNO/RESERVA/LIBERACAO_RESERVA e movimentação já cancelada (claim atômico fecha a corrida entre cancelamentos concorrentes do mesmo movimento). Também zera `regularizacao_pendente` da movimentação estornada e dispara verificação de alertas de estoque. Exige perfil `ajustar_estoque`. UI: botão "Estornar" por linha em `MovimentacoesAlmoxarifado.js` (mini-modal com motivo obrigatório).
- **Extrato do item:** `GET /materiais/:id/extrato` (`extended.js`) agrega material (com `quantidade_disponivel`), saldos por localização, últimas 100 movimentações e reservas ativas. UI: `ExtratoMaterialModal.js`, aberto pelo nome do material no livro e pelo botão "Extrato" em `MateriaisAlmoxarifado.js`.
- **Saldos:** `estoque_saldo_almoxarifado` por material+localização+lote com `quantidade_reservada/bloqueada/em_inspecao`; espelho agregado no material.
- **Vínculo estruturado** na movimentação: `projeto_id`, `os_id`, `centro_custo_id` (+ `centros_custo_almoxarifado`), `cliente_id`, `requisicao_id`, `reserva_id`, `recebimento_id`, `documento_vinculado`, `justificativa`. Regra por tipo (`avaliarRegrasVinculo`/`REGRAS_VINCULO`) decide o que é obrigatório.
- **Rota v1 legada:** `POST /movimentacoes` (`routes/almoxarifado.js:573`) — 4 tipos, sem lote/localização; delega para `stockService.registrarMovimentacao` desde a Etapa 0 (grava auditoria). A tela de Movimentações posta em `/movimentacoes/v2` desde a Etapa 1; a entrada/saída rápida de `MateriaisAlmoxarifado.js` ainda usa a rota v1 (que delega ao mesmo motor — migrar quando a tela for retrabalhada).
- Testes de serviço: entrada/saída, saldo negativo bloqueado, transferência, bloqueio, material inativo (em `almoxarifado.test.js`); testes de API de estorno, regras de vínculo, livro/extrato (`server/tests/api/`).
- Concorrência SQLite tratada (`services/sqliteConcurrency.js` — WAL + retry BUSY).

## Fórmula de disponibilidade (spec 7)

```
Estoque físico − bloqueado − quarentena/inspeção − reservado = Estoque disponível
```

Colunas existem; falta garantir que TODAS as operações (saída, reserva, inspeção, bloqueio) mantêm a fórmula e que consultas/relatórios usam "disponível" onde a spec exige.

## Checklist

### Backend
- [x] (00.3) Unificar v1→v2 — pré-requisito atendido na Etapa 0 (v1 delega para o serviço v2); nesta etapa o **front** também passou a consumir `/movimentacoes/v2` diretamente (form v2, Task 8)
- [x] Regra crítica de saída (spec 13.3): exigir usuário, motivo, documento/requisição de origem, quantidade, localização e projeto/OS/centro de custo **conforme o tipo** de movimento (tabela de obrigatoriedade por tipo) — `avaliarRegrasVinculo`/`REGRAS_VINCULO`, `movimentoRegras.api.test.js`
- [x] Saída emergencial: permitida com flag + justificativa obrigatória + pendência de regularização (`regularizacao_pendente`, badge "PENDENTE REGULARIZAÇÃO" no livro, `PUT /movimentacoes/:id/regularizar`)
- [x] Validar saída de material bloqueado / em quarentena (já coberto pelo motor, testes em `almoxarifado.test.js`/regressão)
- [ ] Validar saída de lote vencido / reprovado — **depende da feature 10** (lotes ainda são texto livre, sem validade/status)
- [ ] (futuro) avaliar reversão de custo médio quando o estorno for da última entrada com custo
- [x] `permite_saldo_negativo` respeitado (default: bloquear; guarda atômica em `registrarMovimentacao` e em `cancelarMovimentacao`)
- [x] Centro de custo como vínculo (`centros_custo_almoxarifado`, `CentroCustoSchema`, rota `/centros-custo`)
- [x] Atualização de custo médio na entrada (`custo_medio` calculado atomicamente na mesma UPDATE da entrada; teste dedicado)
- [x] Consulta "livro de movimentações" com filtros (material, período, projeto, OS, centro de custo, usuário, tipo, pendentes de regularização) em `GET /movimentacoes`
- [x] Histórico completo do item (spec 27): `GET /materiais/:id/extrato` agrega material (com disponível), saldos por localização, movimentações e reservas ativas — inspeções ainda não entram no agregado (feature 09 é embrião)

### Frontend
- [x] `MovimentacoesAlmoxarifado.js` na v2: lote, localização origem/destino, vínculo projeto/OS/centro de custo (selects estruturados no lugar do campo texto `referencia`)
- [x] Tela/ação de estorno com motivo — botão "Estornar" por linha do livro (mini-modal, motivo obrigatório); linha cancelada fica com opacidade reduzida + badge "ESTORNADA"; linha tipo ESTORNO com badge própria
- [x] Extrato do item (histórico completo) — `ExtratoMaterialModal.js`, acionado pelo nome do material no livro e por um botão "Extrato" em `MateriaisAlmoxarifado.js`
- [ ] Migrar entrada/saída rápida de `MateriaisAlmoxarifado.js` para a v2 (hoje ainda posta em `/movimentacoes` v1; sem lote/localização/centro de custo/vínculo nesse atalho)

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

## Entregue na Etapa 1 (2026-08-04)

Plano completo em [docs/superpowers/plans/2026-08-04-almoxarifado-etapa1-motor-estoque.md](../../../docs/superpowers/plans/2026-08-04-almoxarifado-etapa1-motor-estoque.md), 9 tasks TDD. Principais arquivos:

- Backend: `server/services/almoxarifado/stockService.js` (regra crítica/emergencial, saldo negativo atômico, custo médio, estorno incl. por localização/transferência), `server/services/almoxarifado/schemas.js` (`MovimentacaoSchema`, `RegularizacaoSchema`, `CancelamentoSchema`, `CentroCustoSchema`), `server/routes/almoxarifado/extended.js` (`/centros-custo`, `/movimentacoes/v2`, `/movimentacoes/:id/regularizar`, `/movimentacoes/:id/cancelar`, `/materiais/:id/extrato`, `/aux/ordens-servico`).
- Frontend: `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js` (form v2, filtro por tipo incl. ESTORNO, coluna Vínculo, badge "PENDENTE REGULARIZAÇÃO", ação Estornar, badge "ESTORNADA", link para o extrato), `client/src/components/almoxarifado/ExtratoMaterialModal.js` (novo), `client/src/components/almoxarifado/MateriaisAlmoxarifado.js` (botão Extrato).
- Testes: `server/tests/api/estorno.api.test.js`, `movimentoRegras.api.test.js`, `livroExtrato.api.test.js`, `ajusteLocalizacao.api.test.js`, além de `movimentacoes.api.test.js` e `almoxarifado.test.js` (regressão). Todos verdes em `npm run test:api`, `test:almoxarifado`, `test:validation`, `test:safealter`.
- Não entregue nesta etapa (fica para a feature 10): validação de saída de lote vencido/reprovado — depende de lote deixar de ser texto livre.
