# 03 — Motor de Estoque (saldos, movimentações, livro, saídas)

> **Status:** 🟢 — Etapa 1 entregue (2026-08-04): motor v2 com regra crítica/emergencial/centro de custo/custo médio, livro com filtros e extrato do item, estorno com motivo (backend + tela). A validação de vencido/lote reprovado que dependia da feature 10 foi entregue na Etapa 6, Task 3 (ver [10-lotes-series-etiquetas](../10-lotes-series-etiquetas/README.md)). · **Spec original:** seções 7 (fórmula de saldo), 13 (saídas), 30 (livro de movimentações)
> **Última atualização:** 2026-08-09 (Etapa 6, Task 3 — saída por lote valida status/validade/saldo do próprio lote)
> **📋 Plano de implementação pronto:** [docs/superpowers/plans/2026-08-04-almoxarifado-etapa1-motor-estoque.md](../../../docs/superpowers/plans/2026-08-04-almoxarifado-etapa1-motor-estoque.md) — 9 tasks TDD (todas concluídas)

## Objetivo

Um único caminho de movimentação, transacional, com livro imutável (estorno em vez de exclusão), fórmula de disponibilidade correta e a "regra crítica" de saída aplicada.

## O que já existe

- **Motor v2:** `stockService.registrarMovimentacao` (`services/almoxarifado/stockService.js`) — 24 tipos de movimento, lote, localização origem/destino, centro de custo, integração com reservas, custo médio, grava auditoria, saldo anterior/posterior atômico. Rota: `POST /movimentacoes/v2` (`extended.js`), que **não** aceita os tipos todos: valida contra `TIPOS_MOVIMENTO_ROTA` (`schemas.js`) = `TIPOS_MOVIMENTO` − `ESTORNO` − `TIPOS_RETENCAO`. Retenção (reserva, bloqueio, quarentena/inspeção) só nasce dos serviços donos, que têm o gate de permissão certo e o registro paralelo que dá lastro ao número — a v2 tem gate `movimentar`, o mais amplo do módulo. Whitelist é **da rota**: chamadores internos usam o motor direto e seguem podendo criar qualquer tipo.
- **Estorno:** `POST /movimentacoes/:id/cancelar` (`extended.js`, `stockService.cancelarMovimentacao`) com `movimento_estorno_id`, `cancelamento_motivo`; reverte saldo e localizações (entrada/saída/ajuste/transferência); NÃO reverte custo médio — decisão registrada em 2026-08-04; bloqueia estornar ESTORNO/RESERVA/LIBERACAO_RESERVA, os tipos de inspeção (QUARENTENA/LIBERACAO_INSPECAO/REPROVACAO_INSPECAO/DECISAO_INSPECAO — reversão é pela tela de Inspeções, ver feature 09) e movimentação já cancelada (claim atômico fecha a corrida entre cancelamentos concorrentes do mesmo movimento). Reverter BLOQUEIO usa guarda condicional (`WHERE bloqueada >= ?`), não `MAX(0,...)`: estornar um bloqueio já desfeito recusa em vez de saturar. Também zera `regularizacao_pendente` da movimentação estornada e dispara verificação de alertas de estoque. Exige perfil `ajustar_estoque`. UI: botão "Estornar" por linha em `MovimentacoesAlmoxarifado.js` (mini-modal com motivo obrigatório), escondido nos tipos que o servidor recusa.
- **Extrato do item:** `GET /materiais/:id/extrato` (`extended.js`) agrega material (com `quantidade_disponivel`), saldos por localização, últimas 100 movimentações e reservas ativas. UI: `ExtratoMaterialModal.js`, aberto pelo nome do material no livro e pelo botão "Extrato" em `MateriaisAlmoxarifado.js`.
- **Saldos:** `estoque_saldo_almoxarifado` por material + `localizacao_id` + `lote_id` (FK para `lotes_almoxarifado` — reconstruída na Etapa 6, Task 2; até então `lote` era texto livre na própria tabela). É espelho agregado do FÍSICO em `materiais_almoxarifado.quantidade_atual` (`syncMaterialTotals`, chamado pelo AJUSTE com localização e pelo estorno dele) — a tabela **não tem mais** colunas de retenção (`quantidade_reservada/bloqueada/em_inspecao` existiam no `CREATE TABLE`, nunca tiveram escritor, e foram removidas na Etapa 6 justamente para que ninguém volte a somar a partir delas); retenção mora só em `materiais_almoxarifado`, e é por isso que `syncMaterialTotals` recalcula **somente** `quantidade_atual` (recalcular retenção a partir da soma zerava quarentena/reserva a cada AJUSTE por localização — achado do review final da Etapa 5). A reconciliação por soma é uma decisão de negócio (Etapa 6, Task 3, round 3 do review): contagem por localização **redefine** o saldo — não soma ao que já existia sem endereço —, então o total do material tem de ser a soma de tudo que se sabe onde está; por isso TODO ramo que muda `quantidade_atual` (entrada, saída, os dois lados do estorno, AJUSTE sem localização) também mantém a linha correspondente, mesmo sem localização nem lote explícitos. Saída por lote (Etapa 6, Task 3) recusa lote `BLOQUEADO`/`REPROVADO` e lote vencido (`data_validade < hoje`, sempre derivado — nunca é uma coluna gravada) antes de qualquer efeito de saldo, exceto para os tipos de descarte (`SUCATA`/`PERDA`/`AJUSTE_NEGATIVO`), que podem baixar lote vencido; e reivindica o saldo do PRÓPRIO lote com `UPDATE ... WHERE quantidade >= ? RETURNING`, não mais só o saldo agregado do material — ver [10-lotes-series-etiquetas](../10-lotes-series-etiquetas/README.md) (a mesma etapa que fechou este ponto do checklist abaixo).
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
- [x] Validar saída de lote vencido / reprovado — entregue na Etapa 6, Task 3 (`65d78fd`+): `registrarMovimentacao` recusa lote `BLOQUEADO`/`REPROVADO` (todo `tiposSaida`, inclusive descarte) e lote vencido (isento para `SUCATA`/`PERDA`/`AJUSTE_NEGATIVO` — descarte não pode ficar bloqueado pela própria validade). O mecanismo de **liberar** um lote vencido para uso mesmo assim (com justificativa) não existe ainda — ver [10-lotes-series-etiquetas](../10-lotes-series-etiquetas/README.md), Task 3b
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
| Movimentações vinculadas a requisição não são estornáveis pelo cancelamento avulso (usar exclusão/encerramento da requisição) | `estorno de SAIDA vinculada a requisição é bloqueado (use os fluxos da requisição)` |
| Saída exige requisito mínimo por tipo (regra crítica) | `saida sem projeto/OS quando obrigatorio falha` |
| Saldo anterior/posterior corretos e sequenciais | `livro registra saldo_anterior e saldo_posterior consistentes` |
| Duas movimentações concorrentes não corrompem saldo | `movimentacoes concorrentes mantem saldo correto` (usar padrão de `sqliteConcurrency.test.js`) |
| Movimentação grava auditoria | `movimentacao v2 grava auditoria_log_almoxarifado` |

## Dependências

- **00-fundacao-tecnica** (harness + unificação v1/v2) — obrigatória antes de tudo aqui.
- Validações de vencido/reprovado vieram com a feature 10 (lotes), Etapa 6 Task 3 — entregues.

## Entregue na Etapa 1 (2026-08-04)

Plano completo em [docs/superpowers/plans/2026-08-04-almoxarifado-etapa1-motor-estoque.md](../../../docs/superpowers/plans/2026-08-04-almoxarifado-etapa1-motor-estoque.md), 9 tasks TDD. Principais arquivos:

- Backend: `server/services/almoxarifado/stockService.js` (regra crítica/emergencial, saldo negativo atômico, custo médio, estorno incl. por localização/transferência), `server/services/almoxarifado/schemas.js` (`MovimentacaoSchema`, `RegularizacaoSchema`, `CancelamentoSchema`, `CentroCustoSchema`), `server/routes/almoxarifado/extended.js` (`/centros-custo`, `/movimentacoes/v2`, `/movimentacoes/:id/regularizar`, `/movimentacoes/:id/cancelar`, `/materiais/:id/extrato`, `/aux/ordens-servico`).
- Frontend: `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js` (form v2, filtro por tipo incl. ESTORNO, coluna Vínculo, badge "PENDENTE REGULARIZAÇÃO", ação Estornar, badge "ESTORNADA", link para o extrato), `client/src/components/almoxarifado/ExtratoMaterialModal.js` (novo), `client/src/components/almoxarifado/MateriaisAlmoxarifado.js` (botão Extrato).
- Testes: `server/tests/api/estorno.api.test.js`, `movimentoRegras.api.test.js`, `livroExtrato.api.test.js`, `ajusteLocalizacao.api.test.js`, além de `movimentacoes.api.test.js` e `almoxarifado.test.js` (regressão). Todos verdes em `npm run test:api`, `test:almoxarifado`, `test:validation`, `test:safealter`.
- Não entregue nesta etapa (fica para a feature 10): validação de saída de lote vencido/reprovado — depende de lote deixar de ser texto livre.

## Follow-ups abertos no motor (achados no review final da Etapa 5, 2026-08-08)

Nenhum é bug de saldo — os dois foram avaliados e liberados para merge —, mas ficam registrados
porque somem da memória e não do código.

- **O mapa de localizações mostra reservado sempre 0.** `MAPA_LOCALIZACOES_SQL`
  (`stockService.js`) soma `estoque_saldo_almoxarifado.quantidade_reservada`, e **nada no sistema
  escreve colunas de retenção nessa tabela** — só `quantidade`. A retenção (reservado, bloqueado,
  em inspeção) vive exclusivamente em `materiais_almoxarifado`. É bug de exibição, pré-existente à
  Etapa 5 e não introduzido por ela. O conserto honesto exige decidir se retenção passa a ser **por
  localização** (mudança de modelo de dados), e não só trocar a query — por isso ficou de fora da
  onda de correção do review final, que era escopada a quatro achados.
  Foi o mesmo equívoco de premissa que gerou o Critical de `syncMaterialTotals` (abaixo): supor
  que aquelas colunas são alimentadas.
- **`TIPOS_MOVIMENTO_ROTA` falha aberto.** A whitelist da rota `/movimentacoes/v2` é derivada por
  subtração (`TIPOS_MOVIMENTO` − `ESTORNO` − `TIPOS_RETENCAO`). Um tipo novo acrescentado a
  `TIPOS_MOVIMENTO` entra na rota **automaticamente**: o default é certo para tipo operacional e
  errado para tipo de retenção. Hoje a proteção é um comentário. O endurecimento barato é um teste
  que quebre quando a whitelist contiver um tipo que ninguém classificou explicitamente.

### Correção da Etapa 5 que pertence a este motor

`syncMaterialTotals` recalculava `quantidade_reservada`, `quantidade_bloqueada` e
`quantidade_em_inspecao` somando `estoque_saldo_almoxarifado` — colunas que nunca são escritas ali.
A soma dava sempre 0, então a função **zerava as três** toda vez que rodava (`AJUSTE` com
localização e o estorno desse ajuste). Efeito: um ajuste por localização evaporava a quarentena e
deixava o item de recebimento indecidível para sempre, e fazia o mesmo com reservas.
Corrigido em `c4c342b` — a função passou a recalcular **somente** `quantidade_atual`, que é o único
total que aquela tabela realmente lastreia. Cobertura: `ajusteLocalizacao.api.test.js`
(`AJUSTE por localizacao nao evapora a quarentena do material` e o equivalente para reserva).
Nota de linhagem: o defeito atingia `quantidade_reservada` desde a Etapa 4, mas **nunca alcançou
produção** — em `main` a função não tem chamador; quem a chama chegou nesta branch. Não há dado
a reparar.
