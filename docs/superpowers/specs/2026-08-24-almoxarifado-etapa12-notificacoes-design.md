# Etapa 12 — Notificações completas (design)

> **Data:** 2026-08-24 · **Features:** 19 (e-mails e fila) + 20 (alertas operacionais, fatia)
> **Spec original:** seções 14, 26 e 31 · **Baseline:** `alertService` (SMTP configurável via
> `configuracoes_almoxarifado`, WhatsApp opcional, máquina ACIMA/ABAIXO com debounce, histórico
> em `alertas_estoque_historico_almoxarifado`), `requisitionReminderService` (job de 1 h,
> padrão `setTimeout`+`setInterval` `.unref()` em `routes/almoxarifado.js`),
> `requisitionPurchaseNotifyService` (e-mail a Compras por requisição sem estoque),
> `toolReminderService.listarEmprestimosVencidos` (função pura da 9b, sem canal).
> **Autorização:** overnight; decisões em "Decisões" e na letra B do fechamento.

## O problema

Cada etapa de 7 a 11 deixou uma dívida do tipo "avisar alguém": sucateamento sem e-mail,
lembrete de ferramenta com função pronta e canal nenhum, resultado de inventário mudo,
solicitação de compra gerada em silêncio, devolução-sucata parada no meio sem ninguém saber.
E o envio que existe é **síncrono e sem memória**: falhou o SMTP, o aviso morreu — sem retry,
sem histórico do corpo, sem reenvio. A spec 31 pede a fila; a 14 pede e-mail em toda
movimentação confirmada; a 26 pede ~21 alertas.

## O que a etapa entrega (e o que corta)

1. **Fila de notificações** (`fila_notificacoes_almoxarifado` + `notificationQueueService`):
   enfileirar com **dedupe por hash**, worker com **retry e backoff**, FALHA após N tentativas
   com aviso ao admin, **reenvio manual gateado**, e o corpo gravado (a fila É o histórico).
2. **Gancho pós-commit de movimentação** (config-gated, **desligado por default**): toda
   movimentação confirmada pelo motor pode virar e-mail com o conteúdo mínimo da spec 14
   (saldo anterior/posterior incluídos — o livro já os tem), com **destinatários por classe
   de evento** via configs.
3. **Pagamento das dívidas**: lembrete de ferramenta (job + fila), solicitação de compra
   gerada (fila → Compras), devolução-sucata em estado parcial (fila → admin). Sucateamento e
   inventário são **movimentações** — o gancho genérico os cobre sem código próprio.
4. **Três alertas novos de alto valor** com dados que já existem: **estoque zerado** (extensão
   da máquina do mínimo), **lote próximo do vencimento** (job diário) e **remessa a terceiro
   vencida** (job diário, mesma régua do `GET /vencidas`).
5. **Tela** `/almoxarifado/notificacoes`: pendentes/falhas/histórico, reenvio manual, filtros.
6. **Ação nova** `gerenciar_notificacoes` `[ADMINISTRADOR, GESTOR]`.

**Cortes declarados (D-itens):** digest diário; templates configuráveis por evento; PDF
anexo; grupos de e-mail como cadastro (feature 01); matriz-tabela de destinatários (fica
config por classe); sino/central global no header; os ~15 alertas restantes da spec 26
(entram com a feature dona, como a própria spec 20 manda); mexer no SMTP hardcoded do core
(decisão do dev, CLAUDE.md).

## Regras de negócio

### RN-01 — Enfileirar nunca envia; o worker envia

`enfileirar(db, { evento, dedupe_chave, destinatarios, assunto, corpo_html, corpo_texto,
payload })` só faz INSERT (status `PENDENTE`, `tentativas 0`). O envio é do
`processarFila(db)` — worker em job (intervalo config `notificacoes_worker_intervalo_min`,
default `5`) e exportado para teste chamar direto. Falha de enfileirar **nunca** derruba a
operação de negócio que a disparou (try/catch com `console.warn` — aviso não pode quebrar
movimentação).

### RN-02 — Dedupe por hash: o mesmo evento não gera dois e-mails

`hash_dedupe = sha256(evento + '|' + dedupe_chave)`, coluna `UNIQUE`. Re-enfileirar o mesmo
par é **no-op silencioso** (INSERT OR IGNORE; a função responde `{ enfileirada: false,
motivo: 'DUPLICADA' }`). A `dedupe_chave` é responsabilidade de quem enfileira (ex.:
`mov-<id>` para movimentação; `lote-vencendo-<lote_id>-<data_validade>` para o alerta de
lote — muda a validade, pode avisar de novo).

### RN-03 — Retry com backoff; FALHA depois de N; aviso ao admin uma vez

O worker pega itens `PENDENTE` com `proxima_tentativa_em <= agora` (ou nula), tenta enviar
pelo canal do `alertService.enviarEmail` (reuso — **nenhum transporte novo**). Falhou:
`tentativas + 1`, `ultimo_erro` gravado, `proxima_tentativa_em = agora + 2^tentativas ×
intervalo` (backoff exponencial). Ao atingir `notificacoes_max_tentativas` (config, default
`5`): status `FALHA` e **uma** notificação de falha é enfileirada para o e-mail de alertas já
configurado (dedupe `falha-<id>`, máx. 1 tentativa própria — falha de aviso-de-falha não
recursa). Sucesso: status `ENVIADO`, `enviado_em` preenchido.

### RN-04 — Movimentação confirmada enfileira DEPOIS do commit; erro não enfileira

Gancho no fim de `stockService.registrarMovimentacao`, **depois** de todas as escritas
atômicas terem sucesso — movimentação que falha em qualquer guarda não gera notificação.
Config-gated: `notificar_movimentacoes` (seed `'0'`, **desligado por default** — ligar é
decisão do usuário, letra B; ligado, vale para TODO tipo do motor). `dedupe_chave =
mov-<id da movimentação>`. Conteúdo mínimo (spec 14.1) no corpo: tipo, id, data/hora,
usuário, material (código+nome), quantidade e unidade, **saldo anterior e saldo posterior**,
lote/série quando houver, projeto/OS/cliente quando houver, motivo/justificativa, e link
direto (`/almoxarifado/movimentacoes?destaque=<id>`). Sem PDF (corte D3).

### RN-05 — Destinatários por classe de evento, via configs (com fallback)

Quatro classes com config própria (lista de e-mails separada por vírgula):
`notificacoes_dest_entradas`, `notificacoes_dest_saidas`, `notificacoes_dest_ajustes`,
`notificacoes_dest_terceiros` — classe resolvida pela fonte única `movementTypes`
(`TIPOS_ENTRADA`/`TIPOS_SAIDA`; `AJUSTE*` → ajustes; `*_TERCEIRO` → terceiros, com
precedência sobre entrada/saída). Classe sem config → fallback para o e-mail de alertas de
estoque já existente; sem nenhum → não enfileira (sem destinatário não há aviso). Material
**de cliente** acrescenta a classe do dono? Não — corte declarado (D5): destinatário por
cliente é a matriz-tabela que ficou de fora.

### RN-06 — Dívidas pagas pela fila

- **Lembrete de ferramenta** (9b/B7): job diário chama
  `toolReminderService.listarEmprestimosVencidos` e enfileira um lembrete por empréstimo
  vencido (`dedupe: ferramenta-lembrete-<emprestimo_id>-<data de hoje>` — um por dia,
  não um por execução).
- **Solicitação de compra gerada** (11/D8): `gerarSolicitacoesDaSugestao` enfileira UM e-mail
  por lote gerado (resumo com materiais e quantidades; `dedupe: solicitacoes-<ids ordenados>`)
  para `notificacoes_dest_compras` (config nova; fallback `compras_notificar_emails` que o
  `requisitionPurchaseNotifyService` já usa).
- **Devolução-sucata parcial** (7/C2): quando `returnService` grava `ESTADO_PARCIAL`,
  enfileira aviso ao e-mail de alertas (`dedupe: devolucao-parcial-<devolucao_id>`).

### RN-07 — Alertas novos (fatia da spec 26, com máquina/duplicidade)

- **Estoque zerado**: dentro da máquina existente do `alertService` — transição para
  `disponível ≤ 0` com debounce próprio (mesmo padrão ACIMA/ABAIXO; zerar → alerta; repor →
  rearma). Material de cliente fora, como o mínimo já faz.
- **Lote próximo do vencimento**: job diário — lotes ativos com `data_validade` entre hoje e
  `+N dias` (config `alerta_lote_vencendo_dias`, default `30`), com saldo > 0;
  `dedupe: lote-vencendo-<lote_id>-<data_validade>` (um aviso por lote/validade, não por dia).
- **Remessa a terceiro vencida**: job diário — a MESMA régua SQL do `GET /vencidas`
  (`extended.js` ~1284; não reescrever a condição);
  `dedupe: remessa-vencida-<remessa_id>-<data_prevista>`.

### RN-08 — Painel e reenvio gateados

Ação nova `gerenciar_notificacoes: [ADMINISTRADOR, PERFIS.GESTOR]`. Rotas:
`GET /api/almoxarifado/notificacoes?status=&evento=` (LIMIT 200, mais recente primeiro;
status fora do domínio → 400 `Status inválido (use PENDENTE, ENVIADO ou FALHA)`),
`POST /api/almoxarifado/notificacoes/:id/reenviar` (reseta para PENDENTE com tentativas 0 e
processa na hora; 404 se não existe; auditado), e
`POST /api/almoxarifado/notificacoes/processar` (dispara o worker manualmente — para o painel
e para testes; mesma ação). 403 padrão do `requirePermission` para PRODUCAO/ALMOXARIFE/COMPRAS.

### RN-09 — Configs semeadas, editáveis e validadas (precedente da Etapa 11)

| Chave | Default | Validação |
|---|---|---|
| `notificar_movimentacoes` | `0` | 0 ou 1 |
| `notificacoes_worker_intervalo_min` | `5` | inteiro ≥ 1 |
| `notificacoes_max_tentativas` | `5` | inteiro ≥ 1 |
| `alerta_lote_vencendo_dias` | `30` | inteiro ≥ 1 |
| `notificacoes_dest_entradas/saidas/ajustes/terceiros/compras` | `''` | texto livre (lista) |

As numéricas entram na validação do `PUT /configuracoes` (mensagem literal no padrão da 11:
`Configuração "<chave>" deve ser um número de dias maior que zero` — reusar/estender a
checagem `reposicao_*` para um prefixo-set `{reposicao_, notificacoes_worker, notificacoes_max,
alerta_lote}` com a MESMA mensagem) e no array `CAMPOS` da tela.

## Banco (novo, sem migração destrutiva)

```sql
CREATE TABLE IF NOT EXISTS fila_notificacoes_almoxarifado (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evento TEXT NOT NULL,                 -- MOVIMENTACAO | FERRAMENTA_LEMBRETE | SOLICITACAO_COMPRA |
                                        -- DEVOLUCAO_PARCIAL | ESTOQUE_ZERADO | LOTE_VENCENDO |
                                        -- REMESSA_VENCIDA | FALHA_NOTIFICACAO
  hash_dedupe TEXT NOT NULL UNIQUE,
  destinatarios TEXT NOT NULL,          -- lista separada por virgula
  assunto TEXT NOT NULL,
  corpo_html TEXT,
  corpo_texto TEXT,
  payload TEXT,                         -- JSON de contexto (ids), para o painel e o link
  status TEXT DEFAULT 'PENDENTE',       -- PENDENTE | ENVIADO | FALHA
  tentativas INTEGER DEFAULT 0,
  ultimo_erro TEXT,
  proxima_tentativa_em DATETIME,
  enviado_em DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fila_notif_status ON fila_notificacoes_almoxarifado (status, proxima_tentativa_em);
```

## Contratos de API (congelados)

- `GET /api/almoxarifado/notificacoes?status=&evento=` (gate `gerenciar_notificacoes`) →
  **200** `{ itens: [{ id, evento, destinatarios, assunto, status, tentativas, ultimo_erro,
  enviado_em, created_at, payload }], resumo: { pendentes, enviadas, falhas } }` (resumo do
  conjunto inteiro, itens LIMIT 200 — semântica da 11). `?status=` vazio = todos; inválido →
  **400** `{ "error": "Status inválido (use PENDENTE, ENVIADO ou FALHA)" }`.
- `POST /api/almoxarifado/notificacoes/:id/reenviar` (mesmo gate) → **200**
  `{ success: true, status: '<status pós-processamento>' }`; **404**
  `{ "error": "Notificação não encontrada" }`. Auditado (`registrarAuditoria`, objeto).
- `POST /api/almoxarifado/notificacoes/processar` (mesmo gate) → **200**
  `{ processadas, enviadas, falharam }`.
- **Corpo/assunto**: `assunto` sempre prefixado `[Almoxarifado] ` + descrição curta do evento.

## Front — tela `/almoxarifado/notificacoes` (`NotificacoesAlmoxarifado.js`)

Padrão da tela de Reposição (a lição do Critical da 11 já embutida): **painel de erro por
estado com retry** (403 nunca vira lista vazia), cards de resumo (pendentes/enviadas/falhas —
do conjunto inteiro, com legenda), filtros por status e evento, tabela (evento, assunto,
destinatários, status com badge, tentativas, último erro truncado com title, datas em
UTC-safe), botão **Reenviar** por linha (gate `bloquearSeNaoPode('gerenciar_notificacoes')`,
só em FALHA/PENDENTE) e botão **Processar fila agora**. Rota lazy + menu no padrão de
`/almoxarifado/reposicao`. Configs novas no array `CAMPOS` de Configurações.

## Decisões

- **D1 — E-mail de movimentação nasce DESLIGADO** (`notificar_movimentacoes = '0'`). A spec
  14 pede "toda entrada e saída"; ligar por default no deploy despejaria dezenas de e-mails
  por dia sem ninguém ter escolhido. Ligar é um clique em Configurações — reversível, letra B.
- **D2 — Destinatários por CLASSE via config, não matriz-tabela.** Quatro classes + compras
  cobrem a spec 14.2 com o mecanismo de config que a Etapa 11 acabou de validar nos dois
  lados; a matriz por evento×destino com CRUD é etapa própria se a prática pedir.
- **D3 — Sem PDF anexo, sem digest, sem templates configuráveis** — cortes declarados; o
  corpo é gerado por builder fixo por evento (o histórico guarda o corpo enviado).
- **D4 — A fila é o histórico** — nenhuma segunda tabela de "log de envio"; `ENVIADO` com
  `corpo_html` gravado responde "o que foi mandado, para quem, quando".
- **D5 — Reuso TOTAL do canal**: `alertService.enviarEmail` é o único transporte (SMTP das
  configs do módulo); o SMTP hardcoded do core (`index.js`) **não é tocado** (decisão do
  dev). WhatsApp fica fora da fila nesta etapa (o alerta de mínimo continua usando o dele) —
  corte declarado.
- **D6 — Alertas escolhidos pela régua "dado já existe + dor real"**: zerado (extensão
  trivial da máquina), lote vencendo (validade já é coluna com guarda de saída), remessa
  vencida (a rota `/vencidas` já existe). Os demais ~15 da spec 26 entram com a feature dona
  (é a regra que a própria spec 20 estabelece).
- **D7 — Ação nova `gerenciar_notificacoes` [ADMINISTRADOR, GESTOR]** — reenviar e-mail e
  drenar fila é operação administrativa; COMPRAS fica fora (recebe e-mail, não opera a fila).
  Reversível, letra B.
- **D8 — O gancho vive no stockService** (fim do `registrarMovimentacao`, pós-escritas),
  porque movimentação chega por MAIS de uma rota (v1, v2, rotas dedicadas, serviços) — no
  handler HTTP o gancho perderia todas as outras portas. É a primeira escrita do motor que
  chama para fora; o try/catch da RN-01 é o que impede o aviso de derrubar o motor.

## Interações verificadas

- **`alertService`**: `enviarEmail` passa a ser exportado/reusado; a máquina do mínimo não
  muda; o alerta de zerado entra como estado irmão na mesma verificação (uma transição nova,
  mesmo debounce/histórico).
- **`requisitionReminderService`/`requisitionPurchaseNotifyService`**: intocados (seus
  e-mails continuam síncronos — migrá-los para a fila é melhoria futura declarada, não
  pré-requisito).
- **Motor de estoque**: ganha SÓ o gancho pós-commit com try/catch; nenhuma guarda ou fórmula
  muda. Testes do motor não podem passar a falhar por causa da fila (o gate default '0'
  garante).
- **G-watch**: a fila não cria segunda fonte de fórmula; o builder de corpo lê o registro da
  movimentação (que já carrega saldo anterior/posterior). `lerConfigNumero` da 11 vira
  utilitário compartilhado? NÃO nesta etapa (seria o 6º leitor — usar o mesmo padrão local e
  registrar; unificação é limpeza própria).

## Testes exigidos (arquivos novos)

- `notificacaoFila.api.test.js` — RN-01/02/03: enfileirar não envia; dedupe no-op; worker
  envia (SMTP indisponível no harness → falha REGISTRADA com tentativa e backoff — é o caminho
  testável sem rede); FALHA após N com aviso ao admin enfileirado uma vez; reenvio reseta e
  processa; RN-08 gates (par positivo+negativo) e 400 literal.
- `notificacaoMovimentacao.api.test.js` — RN-04/05: movimentação confirmada enfileira com o
  conteúdo mínimo (assunto/corpo com saldos, dedupe `mov-<id>`); movimentação recusada NÃO
  enfileira; config '0' não enfileira; classes de destinatário e fallback; material de
  cliente segue a classe do tipo.
- `notificacaoDividas.api.test.js` — RN-06: lembrete de ferramenta (empréstimo vencido →
  item na fila, um por dia); solicitação gerada → resumo para compras; devolução parcial →
  aviso.
- `alertasNovos.api.test.js` — RN-07: zerado dispara na transição e rearma; lote vencendo
  entra na janela com dedupe por validade; remessa vencida pela régua única.
- Task de integração cruzando galhos (jornada: ligar config → movimentar → item na fila →
  processar → falha SMTP registrada → reenviar → painel reflete).

Todo teste com controle positivo (âncora única NOS DOIS SENTIDOS, sed reverso, md5); testes
de conjunto forçam cenário; par positivo+negativo em todo gate (lições 10/10b/11).
