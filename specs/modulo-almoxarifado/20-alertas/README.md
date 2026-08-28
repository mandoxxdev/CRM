# 20 — Alertas Operacionais

> **Status:** 🟡-forte — **13 de 20 alertas** do checklist (Etapa 16 somou 7 pela varredura do registro; 2 itens SAÍRAM do checklist dizendo por quê — ver abaixo), **central no front entregue** e a primeira parcela real do motor único (`alertRegistry`). Restam 4 alertas de evento e 3 com lacuna de dado. · **Spec original:** seção 26
> **Última atualização:** 2026-08-28 (Etapa 16: registro + varredura + central — `6bed5e2..ed5f032`; design `docs/superpowers/specs/2026-08-28-almoxarifado-etapa16-alertas-design.md`, plano `docs/superpowers/plans/2026-08-28-almoxarifado-etapa16-alertas.md`)

## Objetivo

Todos os alertas preventivos da spec, com motor único (verificação periódica + gatilhos por evento), canais e destinatários configuráveis.

## O que já existe

- Estoque abaixo do mínimo (máquina de estados + debounce, e-mail/WhatsApp) — `alertService.js`.
- Requisição aguardando aprovação há N dias (lembretes, job 1 h) — `requisitionReminderService.js`.
- Padrão de job periódico agendado em `routes/almoxarifado.js` (worker da fila + varreduras diárias).
- **Registro de alertas (Etapa 16)** — `services/almoxarifado/alertRegistry.js`: cada alerta declara condição (`listar`), dedupe, config de dias e textos; a varredura diária (`varrerAlertasRegistrados`, pela fila da 19) e a central (`montarCentral`) leem o MESMO registro. Alerta novo = uma entrada no registro. Erro num `listar` não cala os demais — nem na central nem na varredura (achado A1 da revisão, com teste nos dois lados).
- **Central no front (Etapa 16)** — tela `/almoxarifado/alertas` (avaliação ao vivo; cartão por alerta, total cheio com linhas cortadas em 50, erro por cartão), gateada pela ação nova `ver_alertas` [ADMINISTRADOR, ALMOXARIFE, GESTOR, COMPRAS — decisão B28].

## Checklist de alertas (spec 26)

- [x] Estoque abaixo do mínimo
- [x] Requisição aguardando aprovação
- [x] Estoque zerado — `837faec`/`078cce2`/`d7fee6c` (máquina de estado própria com claim atômico na transição, anti-flap 60s, régua = saldo FÍSICO ≤ 0; **só material SEM mínimo** — com mínimo fica no canal do alerta de mínimo, decisão B17; inativo e cliente fora; primeira zeragem observada decide pelo `saldo_anterior` do motor)
- ~~Estoque negativo~~ — **SAIU do checklist (Etapa 16)**: não é alerta, é regra do motor (feature 03), como este arquivo já dizia; mantê-lo desmarcado fingia pendência
- [x] Requisição atrasada — Etapa 16, `6bed5e2` (status derivado da máquina de estados — a primeira versão do plano hardcodava literais inexistentes como `APROVADA` e **estava errada**; só alerta quem preencheu `data_necessidade`; dedupe 1× por requisição). **Pendência nomeada:** `data_necessidade` aceita texto livre por API e data ilegível nunca alerta, em silêncio (letra C19 das novidades) — falta `z.regex` no schema
- [ ] Material separado aguardando retirada há N dias
- [x] Material reservado há muitos dias — Etapa 16, `6bed5e2` (reserva ATIVA além de `alerta_reserva_parada_dias` OU `expira_em` vencida; dedupe 1× por reserva)
- [ ] Pedido recebido parcialmente
- [ ] Divergência de recebimento (feature 08)
- [x] Material em quarentena parado — Etapa 16, `6bed5e2` (item com retenção de inspeção além de `alerta_quarentena_dias`; dedupe 1× por item). **Limitação declarada (achado A3 da revisão):** o relógio é o `created_at` do RECEBIMENTO — não existe a data da transição para inspeção; NF que demora a processar gera falso positivo no 1º dia real de quarentena (letra C18 das novidades)
- [ ] Material reprovado (feature 09)
- [ ] Material sem certificado (feature 10)
- [x] Material sem endereço — Etapa 16, `6bed5e2` (a MESMA régua do relatório homônimo, extraída para função compartilhada; **material de cliente conta de propósito** — B29; resumo AGREGADO 1×/semana)
- ~~Transferência não recebida~~ — **SAIU do checklist (Etapa 16)**: foi **cortado por decisão do cliente em 2026-08-12** (spec 11 — não existe trânsito entre áreas físicas do mesmo site); este arquivo o listava como pendência e isso **estava errado**
- [x] Ferramenta não devolvida (feature 16) — `837faec` (lembrete diário pela fila, dedupe por empréstimo+dia — paga a pendência B7 da Etapa 9b)
- [x] Material em terceiro com prazo vencido (feature 14) — `837faec` (varredura diária pela régua única de `listarRemessas({vencidas})`, dedupe por remessa+prazo)
- [x] Lote próximo do vencimento (feature 10) — `837faec`/`d7fee6c` (janela configurável de 30 dias **sem piso — lote JÁ vencido com saldo entra**, a primeira versão o excluía para sempre e **estava errada**; lote com vencimento liberado sai; dedupe por lote+validade)
- [x] Calibração próxima do vencimento — Etapa 16, `6bed5e2` (via `painelCalibracoes`; ferramenta nunca calibrada conta como vencida; janela `alerta_calibracao_dias`; dedupe por ferramenta+validade — paga a dívida da 9b)
- [ ] Divergência de inventário (feature 17)
- [x] Item sem movimentação há N dias — Etapa 16, `6bed5e2` (via `estoqueParado`, janela `reposicao_dias_sem_consumo`; re-lembrete mensal por dedupe material+mês)
- [x] Estoque excessivo — Etapa 16, `6bed5e2` (via `estoqueParado`, acima da máxima; re-lembrete mensal)
- [ ] Projeto com consumo acima do previsto (feature 22)

## Infra

- [x] **Primeira parcela do motor único** — Etapa 16, `6bed5e2`: o `alertRegistry` é o registro de regras (condição, dedupe, janela em config, textos), consumido pela varredura E pela central. **O que NÃO entrou, declarado:** canal/destinatário POR alerta (todos usam a lista única `alertas_estoque_emails` e o toggle mestre — corte da Etapa 12 que continua, B15) e a unificação da máquina do mínimo/zerado no registro (funciona e é testada; reescrever seria risco sem valor novo — decisão do design da 16)
- [x] Central de alertas no front — Etapa 16, `3eb2c42`/`ed5f032` (tela própria com item de menu; SEM segundo sino no header, decisão da Etapa 12 mantida)
- [ ] Cada alerta novo entra quando a feature correspondente ganhar o dado — **incluir o alerta no checklist da feature dona**. Lacunas nomeadas (medição 2026-08-28): separado-aguardando-retirada (falta a data da transição p/ PRONTA_PARA_RETIRADA), pedido-parcial (falta noção de saldo do pedido), consumo-acima-do-previsto (projeto sem orçamento). Os 4 de EVENTO (reprovado, divergência de recebimento, divergência de inventário, sem certificado) são viáveis já — gancho no ato, não varredura; fatia seguinte natural

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Alerta dispara na transição de estado, não a cada verificação | `alerta nao repete enquanto condicao persistir` |
| Resolver a condição rearma o alerta | `voltar acima do minimo permite novo alerta futuro` |
| Destinatários respeitam a configuração | `alerta enviado apenas aos destinatarios configurados` |

## Dependências

- 19 (canal de envio) · cada alerta depende da sua feature dona.
