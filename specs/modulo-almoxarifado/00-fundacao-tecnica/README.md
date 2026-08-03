# 00 — Fundação Técnica

> **Status:** 🟡 · **Prioridade: MÁXIMA — bloqueia todas as outras features**
> **Última atualização:** 2026-08-03
> Arquivos desta pasta: [estado-atual.md](estado-atual.md) (mapa completo do código existente) · [testes-api.md](testes-api.md) (harness de testes)
> **📋 Plano de implementação pronto:** [docs/superpowers/plans/2026-08-02-almoxarifado-etapa0-fundacao.md](../../../docs/superpowers/plans/2026-08-02-almoxarifado-etapa0-fundacao.md) — 6 tasks TDD + 1 decisão pendente

## Objetivo

Remover os riscos estruturais que fariam qualquer feature nova quebrar as existentes: rota de movimentação duplicada, DDL em dois lugares, migrations silenciosas e ausência de testes de API.

## Por que primeiro

- A produção usa a rota de movimentação **v1** (`POST /api/almoxarifado/movimentacoes`, `server/routes/almoxarifado.js:573`): 4 tipos, sem lote, sem localização, **sem auditoria**. A rota **v2** (`server/routes/almoxarifado/extended.js:100` → `stockService.registrarMovimentacao`) faz tudo certo, tem 20 tipos e grava auditoria — mas o frontend não a usa. Evidência: 24 movimentações reais, 0 linhas em `auditoria_log_almoxarifado`.
- Toda regra nova de estoque (lote, série, bloqueio, quarentena) precisa de UM caminho único de movimentação para valer de verdade.

## Checklist

### 0.1 Harness de testes de API
- [x] Criar `server/tests/helpers/testApp.js`: monta um `express()` de teste, registra as rotas de almoxarifado (`routes/almoxarifado.js`, `routes/almoxarifado/extended.js`, `routes/requisicoesMaterial.js`) com SQLite `:memory:` + `initSchema(db)`.
- [x] Stub de autenticação no app de teste (injeta `req.user` configurável por teste — perfis diferentes por caso).
- [x] Adicionar `supertest` como devDependency do `server/`.
- [x] Primeiro teste de API real passando (ex.: `GET /api/almoxarifado/materiais` retorna 200 + lista).
- [x] Script `npm run test:api` no `server/package.json`.
- [x] Documentar padrão em [testes-api.md](testes-api.md).

### 0.2 DDL único
- [x] Remover o DDL duplicado de `server/routes/almoxarifado.js:55-1068` — schema passa a viver só em `server/services/almoxarifado/schema.js`.
- [x] Garantir que `initSchema(db)` é chamado no boot antes do registro das rotas.
- [x] Teste: subir app de teste só com `initSchema` e exercitar as rotas principais (prova que nada dependia do DDL da rota).

### 0.3 Unificação de movimentações (v1 → v2)
**Decisão (2026-08-02, no planejamento):** a unificação é server-side — o handler v1 (`routes/almoxarifado.js:573`) delega para `stockService.registrarMovimentacao` mantendo o contrato HTTP antigo; o frontend NÃO muda de URL nesta etapa (payload rico com localização/lote fica para a feature 03). Mudanças de contrato intencionais: `motivo` obrigatório em SAIDA/AJUSTE (spec 13.3), material inativo 404→400, saldo validado pelo disponível.
- [x] v1 delega para `stockService.registrarMovimentacao` (Task 4 do plano)
- [x] Campo motivo `required` nos forms de `MovimentacoesAlmoxarifado.js` e `MateriaisAlmoxarifado.js`
- [x] Teste de API: movimentação via rota v1 grava linha em `auditoria_log_almoxarifado`.
- [x] Teste de API: os 4 tipos legados (`ENTRADA/SAIDA/AJUSTE/DEVOLUCAO`) continuam funcionando após a unificação.
- [x] Teste de API: SAIDA respeita o disponível (reserva/bloqueio contam).

### 0.4 Migrations confiáveis
- [x] `safeAlter` (`schema.js:62`) só engole erro "duplicate column"; qualquer outro erro loga e propaga.
- [ ] Novas mudanças de schema passam pelo ledger `schema_migrations_almoxarifado` (`schema.js:199`) — padrão já existe, usar sempre.

### 0.5 Segurança básica e bugs
- [x] **Bug descoberto no planejamento (2026-08-02):** `purchaseService` é usado em `extended.js:294,300` mas nunca importado — `POST /compras/verificar-minimos` e `POST /compras/solicitacoes/:id/vincular-pedido` respondem 500 (`ReferenceError`) hoje. Corrigir com teste (Task 2 do plano).
- [x] Corrigir checagem inconsistente em `extended.js:358/368`: trocar `req.user.role !== 'admin'` por `canConfigureAlmox` (hoje exclui super admins e admins do módulo sem `role='admin'`) — Task 6 do plano.
- [ ] ⏸️ SMTP hardcoded (`server/index.js:2928-2937`): **decisão de 2026-08-03 — manter hardcoded por ora**; débito técnico do dev dono do projeto, que será consultado antes de qualquer mudança. Proposta (env com fallback idêntico) segue documentada na Task 7 do plano para quando for revisitado.
- [x] Adotar validação de entrada consistente nas rotas do almoxarifado — **decisão de 2026-08-03: Zod**. Helper `validate(schema)` criado em `server/services/almoxarifado/validation.js` (testes em `tests/validation.test.js`, `npm run test:validation`); responde 400 no formato `{ error }` citando o caminho do campo (ex.: `itens.0.quantidade`). O `express-validator` (instalado e nunca usado) foi removido. Rotas novas nascem com `validate(...)`; as antigas migram quando forem tocadas pela feature dona.

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Toda movimentação confirmada gera registro de auditoria | `movimentacao grava auditoria_log_almoxarifado` |
| Movimentação é transacional: falha no meio não altera saldo | `movimentacao com erro nao altera saldo` |
| Rotas exigem autenticação e permissão de módulo | `rota sem token retorna 401; sem permissao retorna 403` |
| Schema criado por initSchema é suficiente para todas as rotas | `app de teste sobe apenas com initSchema` |

## Dependências

Nenhuma — esta É a dependência das outras.
