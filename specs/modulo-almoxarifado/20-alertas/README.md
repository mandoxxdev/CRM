# 20 — Alertas Operacionais

> **Status:** 🟢 no que é viável hoje — **17 de 20 alertas** do checklist (Etapa 16 somou 7 pela varredura, Etapa 17 somou 4 no ato/vigília; 2 itens SAÍRAM do checklist dizendo por quê — ver abaixo), **central no front entregue** e o motor único em duas parcelas (`alertRegistry` + modo evento com `dispararAlertaRegistrado`). **Restam só os 3 com lacuna de dado nas features donas** — nenhum deles é bloqueio deste arquivo. · **Spec original:** seção 26
> **Última atualização:** 2026-08-28 (Etapa 17: modo evento + 4 alertas — `d65d81b..e51ca79`; design `docs/superpowers/specs/2026-08-28-almoxarifado-etapa17-alertas-evento-design.md`, plano `docs/superpowers/plans/2026-08-28-almoxarifado-etapa17-alertas-evento.md`. Antes — Etapa 16: registro + varredura + central — `6bed5e2..ed5f032`; design `docs/superpowers/specs/2026-08-28-almoxarifado-etapa16-alertas-design.md`, plano `docs/superpowers/plans/2026-08-28-almoxarifado-etapa16-alertas.md`)

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
- [x] Divergência de recebimento — Etapa 17, `c1cd0a1`/`8eeaeea` (dispara NO ATO nos DOIS escritores reais da quantidade — `conferirRecebimento` e `salvarDadosFiscal`; a UI usa o segundo, e o plano original só previa o primeiro: **achado Crítico da revisão do plano**. Régua float-safe por `divergenciaRealSql`; dedupe por item **+ quantidade** — sem a quantidade, errar de novo e PIOR ficava calado, achado A1 da revisão adversarial. Volume por item declarado, B32)
- [x] Material em quarentena parado — Etapa 16, `6bed5e2` (item com retenção de inspeção além de `alerta_quarentena_dias`; dedupe 1× por item). **Limitação declarada (achado A3 da revisão):** o relógio é o `created_at` do RECEBIMENTO — não existe a data da transição para inspeção; NF que demora a processar gera falso positivo no 1º dia real de quarentena (letra C18 das novidades)
- [x] Material reprovado — Etapa 17, `c1cd0a1`/`8eeaeea` (gancho pós-INSERT em `decidirInspecao`, só com `quantidade_reprovada > 0`; a linha do e-mail vem do `listar` dual-mode por id — régua única com a central; RN-02: o aviso nunca derruba o ato)
- [x] Material sem certificado — Etapa 17, `c1cd0a1`/`e51ca79` (varredura pura AGREGADA: 1 resumo por mês com total + 20 primeiros — B31, medido em 1000 e-mails/mês na versão por lote. Régua `COALESCE(TRIM(certificado_arquivo),'')=''` com saldo>0; lote BLOQUEADO entra — é o caso principal, porque o lote que exige certificado nasce travado; material de cliente entra)
- [x] Material sem endereço — Etapa 16, `6bed5e2` (a MESMA régua do relatório homônimo, extraída para função compartilhada; **material de cliente conta de propósito** — B29; resumo AGREGADO 1×/semana)
- ~~Transferência não recebida~~ — **SAIU do checklist (Etapa 16)**: foi **cortado por decisão do cliente em 2026-08-12** (spec 11 — não existe trânsito entre áreas físicas do mesmo site); este arquivo o listava como pendência e isso **estava errado**
- [x] Ferramenta não devolvida (feature 16) — `837faec` (lembrete diário pela fila, dedupe por empréstimo+dia — paga a pendência B7 da Etapa 9b)
- [x] Material em terceiro com prazo vencido (feature 14) — `837faec` (varredura diária pela régua única de `listarRemessas({vencidas})`, dedupe por remessa+prazo)
- [x] Lote próximo do vencimento (feature 10) — `837faec`/`d7fee6c` (janela configurável de 30 dias **sem piso — lote JÁ vencido com saldo entra**, a primeira versão o excluía para sempre e **estava errada**; lote com vencimento liberado sai; dedupe por lote+validade)
- [x] Calibração próxima do vencimento — Etapa 16, `6bed5e2` (via `painelCalibracoes`; ferramenta nunca calibrada conta como vencida; janela `alerta_calibracao_dias`; dedupe por ferramenta+validade — paga a dívida da 9b)
- [x] Divergência de inventário — Etapa 17, `c1cd0a1`/`8eeaeea` (gancho na conclusão da conferência, AGREGADO: 1 aviso por conferência, nunca por item — o mesmo motivo pelo qual `AJUSTE_INVENTARIO` está fora da notificação de movimentação; corpo SEM impacto financeiro, B30. Régua compartilhada por `listarDivergenciaConferencia` dual-mode, porque a conclusão é inline na rota)
- [x] Item sem movimentação há N dias — Etapa 16, `6bed5e2` (via `estoqueParado`, janela `reposicao_dias_sem_consumo`; re-lembrete mensal por dedupe material+mês)
- [x] Estoque excessivo — Etapa 16, `6bed5e2` (via `estoqueParado`, acima da máxima; re-lembrete mensal)
- [ ] Projeto com consumo acima do previsto (feature 22)

## Infra

- [x] **Primeira parcela do motor único** — Etapa 16, `6bed5e2`: o `alertRegistry` é o registro de regras (condição, dedupe, janela em config, textos), consumido pela varredura E pela central. **O que NÃO entrou, declarado:** canal/destinatário POR alerta (todos usam a lista única `alertas_estoque_emails` e o toggle mestre — corte da Etapa 12 que continua, B15) e a unificação da máquina do mínimo/zerado no registro (funciona e é testada; reescrever seria risco sem valor novo — decisão do design da 16)
- [x] Central de alertas no front — Etapa 16, `3eb2c42`/`ed5f032` (tela própria com item de menu; SEM segundo sino no header, decisão da Etapa 12 mantida)
- [x] **Segunda parcela do motor único — modo EVENTO** (Etapa 17, `c1cd0a1`): `dispararAlertaRegistrado(db, chave, linha)` enfileira no ato reusando dedupe/assunto/corpo/payload da MESMA entrada do registro, e os `listar` dos alertas de evento são **dual-mode** (janela para central/varredura, id do fato para o gancho) — uma régua só para os dois caminhos, com o `INSERT OR IGNORE` da fila garantindo que o duplo disparo vire DUPLICADA e que evento perdido seja pego pela varredura
- [ ] Cada alerta novo entra quando a feature correspondente ganhar o dado — **incluir o alerta no checklist da feature dona**. Lacunas nomeadas (medição 2026-08-28), as ÚNICAS que restam: separado-aguardando-retirada (falta a data da transição p/ PRONTA_PARA_RETIRADA), pedido-parcial (falta noção de saldo do pedido), consumo-acima-do-previsto (projeto sem orçamento)

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Alerta dispara na transição de estado, não a cada verificação | `alerta nao repete enquanto condicao persistir` |
| Resolver a condição rearma o alerta | `voltar acima do minimo permite novo alerta futuro` |
| Destinatários respeitam a configuração | `alerta enviado apenas aos destinatarios configurados` |

## Dependências

- 19 (canal de envio) · cada alerta depende da sua feature dona.
