# 19 — E-mails Automáticos e Fila de Notificações

> **Status:** 🟢 — fila formal com retry/dedupe/histórico, gancho pós-commit por classes, painel com reenvio; cortes declarados (matriz por evento, templates, digest, PDF, grupos) · **Spec original:** seções 14 e 31
> **Entregue na Etapa 12** (design `c1613c2`, execução `18a8d71..d7fee6c`) · **Última atualização:** 2026-08-24

## Objetivo

E-mail imediato em TODA entrada e saída confirmada, com conteúdo mínimo da spec, destinatários por tipo de evento, fila com retry/dedupe, histórico e reenvio.

## O que existe agora

- **Fila** `fila_notificacoes_almoxarifado` (único escritor: `notificationQueueService.js`): PENDENTE/ENVIADO/FALHA, dedupe por hash UNIQUE, retentativa com backoff exponencial, claim de envio contra drenos concorrentes, aviso ao admin após esgotar (máx. 1, sem recursão).
- **Gancho pós-commit** no motor (`stockService.registrarMovimentacao`), config-gated (`notificar_movimentacoes`, default `'0'`), destinatários por CLASSE (entradas/saídas/ajustes/terceiros) com fallback à lista de alertas **respeitando o toggle "Notificar por e-mail"**. Cancelamento suprime a notificação pendente.
- **Painel** `/almoxarifado/notificacoes` (gate `gerenciar_notificacoes`: ADMIN/GESTOR) com filtros, resumo do conjunto inteiro, reenvio (inclusive de ENVIADO, com confirm) e "Processar fila agora".
- **Jobs**: worker da fila (intervalo config, lido no boot) + varreduras diárias (RN-06/07 da feature 20).
- Canal único de transporte: `alertService.enviarEmail` (SMTP das configs do módulo). ⚠️ O serviço global paralelo com SMTP hardcoded (`index.js`) segue intocado — decisão do dev, fundação 0.5.

## Checklist

### Backend — cobertura de eventos (spec 14)
- [x] E-mail em **toda entrada confirmada** — `77d1f38` (gancho no motor cobre todas as portas; classes `TIPOS_ENTRADA`)
- [x] E-mail em **toda saída confirmada** — `77d1f38` — **com exceções DELIBERADAS, decididas em revisão:** RESERVA/remanejos, REMESSA_TERCEIRO/RETORNO_TERCEIRO (retenção; o canal da remessa é o alerta de remessa vencida) e **AJUSTE_INVENTARIO** (`d7fee6c` — só existe em lote: 50 divergências = 50 e-mails num clique, medido; o canal da conferência é a tela/relatório, feature 21)
- [x] Conteúdo mínimo (spec 14.1) — `77d1f38` + `48426f5` (saldos, lote/séries reais do motor, motivo/justificativa/referência com rótulos próprios, link direto) — **sem comprovante PDF** (corte D3, letra D das novidades); projeto/OS/cliente saem como `#id`, sem resolver nome (desvio declarado da Task 2)
- [ ] Destinatários por tipo de evento como **matriz configurável** — **cortado (D2):** entregue como 4 listas por CLASSE + 1 de compras (`18a8d71`), que cobrem a spec 14.2 com o mecanismo de config validado na Etapa 11; a matriz evento×destino com CRUD é etapa própria se a prática pedir (letra B15)
- [ ] Grupos de e-mail como cadastro (feature 01) — **não entrou:** depende do cadastro de grupos da feature 01, que não existe; as listas aceitam JSON ou vírgula
- [x] Disparo **somente após commit** da movimentação — `77d1f38` (gancho após todas as escritas/compensações; recusada não enfileira — provado por sabotagem em 3 rodadas) + supressão no estorno (`48426f5`) e recusa de reenvio de cancelada (`d7fee6c`)

### Backend — fila (spec 31)
- [x] Tabela da fila com evento, payload, destinatários, status, tentativas, hash de dedupe — `18a8d71`
- [x] Worker com retry/backoff; alerta ao admin após N falhas — `18a8d71` + claim de envio `a8b9c0e` (dois drenos concorrentes = um e-mail, medido)
- [x] Controle de duplicidade — `18a8d71` (INSERT OR IGNORE + `changes===0`; réguas por evento: `mov-<id>`, `ferramenta-lembrete-<id>-<dia>`, `lote-vencendo-<id>-<validade>`, `remessa-vencida-<id>-<prazo>`, `solicitacoes-<ids>`, `falha-<id>`)
- [x] Painel de pendentes/falhas + reenvio manual autorizado — `18a8d71` (rotas) + `feba6e2`/`8fdcbe5` (tela)
- [ ] Modelos configuráveis (template por tipo) — **cortado (D3):** corpo fixo por builder, gravado na fila
- [ ] Resumo diário opcional (digest) — **cortado (D3)**
- [x] Histórico do conteúdo enviado — `18a8d71` (**a fila É o histórico** — D4: `corpo_html`/`corpo_texto` gravados por linha; sem segunda tabela de log)

### Frontend
- [x] Painel de notificações — `feba6e2` + `8fdcbe5` (painel de erro por estado, badges, reenvio com confirm no ENVIADO, datas UTC-safe testadas)
- [ ] Config da **matriz** de destinatários por evento — **cortado junto com a matriz (D2);** as 10 configs novas (toggle, 4 numéricas, 5 listas) estão na tela de Configurações (`feba6e2`)

## Regras essenciais + testes de API exigidos

| Regra | Teste (arquivo real) |
|-------|------|
| Movimentação confirmada enfileira notificação | `notificacaoMovimentacao`: "movimentacao confirmada enfileira com conteudo minimo" |
| Movimentação que falha NÃO enfileira | `notificacaoMovimentacao`: "movimentacao RECUSADA nao enfileira" (+ sabotagem gancho-pré-validação provada 3×) |
| Dedupe: mesmo evento não duplica | `notificacaoFila`: "RN-02: dedupe" + "dois drenos concorrentes enviam UMA vez" |
| Falha de envio mantém item com tentativa registrada | `notificacaoFila`: "RN-03: falha de envio registra tentativa, backoff e mantem PENDENTE" |
| Reenvio exige permissão | `notificacaoFila`: "RN-08: gates par positivo+negativo" |
| Jornada ponta a ponta (config→motor→fila→worker→FALHA→aviso→painel→reenvio) | `notificacaoJornada` (11 passos) |

## Dependências

- 03 (gancho pós-commit da movimentação) · consumida por quase todas as features.
