# 19 — E-mails Automáticos e Fila de Notificações

> **Status:** 🟡 — infra de envio boa, mas cobre poucos eventos e não há fila formal · **Spec original:** seções 14 e 31
> **Última atualização:** 2026-08-02

## Objetivo

E-mail imediato em TODA entrada e saída confirmada, com conteúdo mínimo da spec, destinatários por tipo de evento, fila com retry/dedupe, histórico e reenvio.

## O que já existe

- **Serviço do almoxarifado** (`alertService.js:413 enviarEmail`): SMTP configurável via `configuracoes_almoxarifado`, canal WhatsApp opcional, histórico em `alertas_estoque_historico_almoxarifado`.
- Eventos cobertos hoje: alerta de estoque mínimo · nova requisição · itens sem estoque → Compras · lembretes de requisição (job 1 h) · aprovação por valor.
- Config no front (aba "Alertas de Estoque").
- ⚠️ Serviço global paralelo com SMTP hardcoded (`index.js:2939`) — ver fundação 0.5.

## Checklist

### Backend — cobertura de eventos (spec 14)
- [ ] E-mail em **toda entrada confirmada** (recebimento processado, devolução, retorno de terceiro, ajuste positivo)
- [ ] E-mail em **toda saída confirmada** (entrega de requisição, transferência externa, envio a terceiro, sucateamento, ajuste negativo)
- [ ] Conteúdo mínimo (spec 14.1): tipo, número, data/hora, usuário, solicitante, projeto/cliente/OS, item, quantidade, lote/série, origem/destino, **saldo anterior e posterior**, documento, link direto, comprovante PDF quando aplicável
- [ ] Destinatários por tipo de evento (spec 14.2): matriz configurável (entrada de compra / saída p/ produção / material de cliente / terceiros / ajustes) — hoje só listas fixas de config
- [ ] Grupos de e-mail como cadastro (feature 01)
- [ ] Disparo **somente após commit** da movimentação (spec 14: nunca antes de confirmar no banco)

### Backend — fila (spec 31)
- [ ] Tabela `fila_notificacoes_almoxarifado`: evento, payload, destinatários, status (PENDENTE/ENVIADO/FALHA), tentativas, hash de dedupe
- [ ] Worker com retry automático e backoff; alerta ao admin após N falhas
- [ ] Controle de duplicidade (mesmo evento não gera 2 e-mails)
- [ ] Painel de mensagens pendentes/falhas + reenvio manual autorizado
- [ ] Modelos configuráveis (template por tipo de evento)
- [ ] Resumo diário opcional (digest)
- [ ] Histórico do conteúdo enviado (o `alertas_estoque_historico_almoxarifado` guarda status; guardar também o corpo)

### Frontend
- [ ] Painel de notificações (pendentes/falhas/histórico/reenvio)
- [ ] Config da matriz de destinatários por evento

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Movimentação confirmada enfileira notificação | `movimentacao confirmada cria item na fila` |
| Movimentação que falha NÃO enfileira | `movimentacao com erro nao gera notificacao` |
| Dedupe: mesmo evento não duplica | `evento repetido nao cria segunda notificacao` |
| Falha de envio mantém item na fila com tentativa registrada | `falha de smtp registra tentativa e mantem pendente` |
| Reenvio manual exige permissão | `reenvio por usuario sem permissao falha` |

## Dependências

- 03 (gancho pós-commit da movimentação) · consumida por quase todas as features.
