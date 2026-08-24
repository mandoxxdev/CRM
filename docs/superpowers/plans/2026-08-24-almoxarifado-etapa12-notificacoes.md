# Etapa 12 — Notificações completas — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** fila de notificações com dedupe/retry/histórico, gancho pós-commit de movimentação
(desligado por default), pagamento das dívidas de aviso das etapas 7–11 e três alertas novos —
reusando o canal do `alertService`, sem tocar no SMTP hardcoded do core.

**Architecture:** uma tabela nova (`fila_notificacoes_almoxarifado`) + um serviço novo
(`notificationQueueService.js`) que é o ÚNICO escritor/leitor da fila; o transporte é o
`enviarEmail` do `alertService` (passa a ser exportado — nenhum transporte novo); o gancho
vive no fim de `stockService.registrarMovimentacao` (movimentação chega por várias portas — no
handler HTTP o gancho perderia as outras) com try/catch que NUNCA derruba o motor; jobs seguem
o padrão `setTimeout`+`setInterval().unref()` do lembrete de requisição.

**Tech Stack:** Express + SQLite (`dbAll`/`dbGet`/`dbRun`), harness `tests/helpers/testApp.js`
(sem SMTP real — o caminho testável do envio é a FALHA registrada), React CRA.

**Spec:** `docs/superpowers/specs/2026-08-24-almoxarifado-etapa12-notificacoes-design.md`
(RN-01..RN-09, D1..D8 — mensagens literais de lá são contrato).

## Global Constraints

- Literais congelados: 400 do painel `Status inválido (use PENDENTE, ENVIADO ou FALHA)`;
  404 `Notificação não encontrada`; assunto sempre prefixado `[Almoxarifado] `; validação de
  config numérica reusa a mensagem da Etapa 11 `Configuração "<chave>" deve ser um número de
  dias maior que zero`.
- `notificar_movimentacoes` nasce `'0'` — NENHUM teste existente do motor pode passar a
  depender da fila; o gancho com config desligada é no-op.
- Falha de enfileirar/notificar **nunca** propaga para a operação de negócio (try/catch +
  `console.warn`).
- O harness não tem SMTP: todo teste de envio prova o **caminho da falha** (tentativas,
  backoff, FALHA, aviso ao admin) — e é exatamente o que a spec 31 exige provar. NÃO mockar
  nodemailer (mock de transporte é mentira barata; a falha real do `enviarEmail` sem host é o
  comportamento de produção sem config).
- Fontes únicas: classes de destinatário via `movementTypes` (nenhuma lista nova de tipos);
  régua de remessa vencida copiada por REFERÊNCIA da rota `/vencidas` (mesma condição SQL —
  se precisar duplicar o texto do WHERE, aponte o comentário para a origem e vice-versa).
- Sabotagem: âncora única NOS DOIS SENTIDOS, sed reverso, md5; par positivo+negativo em gate;
  teste de conjunto força cenário. Commits pt-BR sem acento, `git add` explícito.
- Baseline: `npm run test:api` = 111/111.

## Sort topológico

| Task | O quê | Classe |
|---|---|---|
| 1 | tabela + configs + ação + `notificationQueueService` + rotas do painel (RN-01/02/03/08/09) | **tronco** |
| 2 | gancho de movimentação + builder de conteúdo + classes de destinatário (RN-04/05) | **tronco** (depois da 1) |
| 3 | dívidas (ferramenta/solicitação/devolução parcial) + alertas novos (zerado/lote/remessa) + jobs (RN-06/07) | **tronco** (depois da 2) |
| 4 | tela `/almoxarifado/notificacoes` + CAMPOS de config | **galho** (worktree, após 3) |
| 5 | teste-jornada de integração | **galho** (árvore principal, paralelo à 4) |
| 6 | fechar-etapa | final |

Tasks 1–3 compartilham `schema.js`, `permissions.js`, `notificationQueueService.js`,
`extended.js` e `stockService.js` — tronco sequencial. Par paralelo real: Task 4 (client,
worktree) × Task 5 (teste server, árvore principal).

---

### Task 1: Fila + serviço + painel (RN-01, RN-02, RN-03, RN-08, RN-09)

**Files:**
- Create: `server/services/almoxarifado/notificationQueueService.js`
- Modify: `server/services/almoxarifado/schema.js` (tabela + índice + configs),
  `server/services/almoxarifado/permissions.js` (ação),
  `server/services/almoxarifado/alertService.js` (exportar `enviarEmail`),
  `server/routes/almoxarifado.js` (validação de config numérica — estender o prefixo-set),
  `server/routes/almoxarifado/extended.js` (3 rotas do painel)
- Test: `server/tests/api/notificacaoFila.api.test.js` (novo)

**Interfaces (Produces — Tasks 2/3/4/5 consomem):**
- `enfileirar(db, { evento, dedupe_chave, destinatarios, assunto, corpo_html, corpo_texto, payload })`
  → `{ enfileirada: true, id }` | `{ enfileirada: false, motivo: 'DUPLICADA' }` |
  `{ enfileirada: false, motivo: 'SEM_DESTINATARIO' }` (destinatários vazios não enfileiram).
- `processarFila(db)` → `{ processadas, enviadas, falharam }` (pega PENDENTE com
  `proxima_tentativa_em` nula ou ≤ agora; envia via `alertService.enviarEmail`; sucesso →
  ENVIADO+`enviado_em`; falha → `tentativas+1`, `ultimo_erro`,
  `proxima_tentativa_em = datetime('now', '+' || (intervalo_min * 2^tentativas) || ' minutes')`;
  ao atingir max → FALHA + aviso ao admin UMA vez com `dedupe_chave = 'falha-' + id` e
  `max_tentativas_proprio = 1`).
- `reenviar(db, usuario, id)` → `{ success: true, status }` | lança 404-shape; reseta
  tentativas/status/erro, audita (`registrarAuditoria`, `dados_novos` como OBJETO — lição da
  11), e chama `processarFila`.
- Configs semeadas (RN-09) + `gerenciar_notificacoes: [PERFIS.ADMINISTRADOR, PERFIS.GESTOR]`.

- [ ] **Step 1: schema** — tabela+índice do design (copiar o SQL literal) no `initSchema`,
  configs no array `configs` (com comentário citando a lição da 10: config não semeada é
  ineditável), e em `routes/almoxarifado.js` estender a validação numérica do PUT: trocar o
  teste `chave.startsWith('reposicao_')` (Etapa 11) por um set
  `['reposicao_', 'notificacoes_worker_', 'notificacoes_max_', 'alerta_lote_'].some((p) => chave.startsWith(p))`
  — **mesma mensagem literal** (ler o código atual antes: a checagem exata pode ter outra
  forma; o contrato é: as 4 numéricas novas recusam < 1 com a mensagem da 11, e
  `notificar_movimentacoes` e as `notificacoes_dest_*` NÃO caem na checagem numérica).
- [ ] **Step 2: teste vermelho** (harness padrão; usuários ADMIN/GESTOR/COMPRAS/ALMOXARIFE/
  PRODUCAO; helper `enfileirarDireto` chamando o serviço):
  1. `RN-01: enfileirar so grava PENDENTE, nada e enviado` — enfileira, linha PENDENTE com
     corpo gravado, `enviado_em` nulo.
  2. `RN-02: dedupe — mesmo evento+chave e no-op` — segunda chamada `{ enfileirada: false,
     motivo: 'DUPLICADA' }`, COUNT 1; chave diferente → 2.
  3. `RN-01: sem destinatario nao enfileira` — `{ enfileirada: false, motivo: 'SEM_DESTINATARIO' }`.
  4. `RN-03: falha de envio registra tentativa, backoff e mantem PENDENTE` — processar (SMTP
     ausente no harness) → `tentativas 1`, `ultimo_erro` preenchido, `proxima_tentativa_em`
     futura, status PENDENTE; processar DE NOVO em seguida → `tentativas` continua 1 (backoff
     segura — o item não está elegível).
  5. `RN-03: FALHA apos max e aviso ao admin UMA vez` — setar `notificacoes_max_tentativas=1`
     via UPDATE de config + zerar `proxima_tentativa_em` → processar → status FALHA e existe
     UMA linha `evento FALHA_NOTIFICACAO` (dedupe `falha-<id>`); processar de novo → continua
     UMA.
  6. `RN-08: reenviar reseta, processa e audita` — reenviar item FALHA → tentativas volta a
     0+1 (processou na hora), auditoria com `JSON.parse(dados_novos).notificacao_id === id`;
     id inexistente → 404 literal.
  7. `RN-08: gates par positivo+negativo` — GET/POSTs: PRODUCAO 403, ALMOXARIFE 403, COMPRAS
     403, GESTOR 200, ADMIN 200.
  8. `RN-08: painel filtra e valida status` — `?status=FALHA` só falhas; `?status=` vazio
     tudo; `?status=X` → 400 literal; `resumo` do conjunto inteiro (delta — banco
     compartilhado).
  9. `RN-09: config numerica invalida recusa 400 literal; dest_* aceita texto` — PUT
     `notificacoes_max_tentativas='0'` → 400 com a mensagem da 11; PUT
     `notificacoes_dest_entradas='a@b.com'` → 200.
- [ ] **Step 3: implementação** — serviço novo (único escritor da fila; `lerConfigNumero`
  local no padrão da 11 com comentário de 6º-leitor-declarado), export `enviarEmail` no
  `module.exports` do alertService, rotas em `extended.js` (padrão handleError/auth; a rota
  `/processar` e `/reenviar` chamam o serviço; GET monta `resumo` com COUNTs do conjunto
  inteiro e `itens` LIMIT 200 DESC).
- [ ] **Step 4: verde + regressão** (`configuracoesGerais`, `permissoesRotas`).
- [ ] **Step 5: controles positivos** — (i) remover o UNIQUE do hash na criação? NÃO (schema
  compartilhado) — sabotar o `INSERT OR IGNORE` para `INSERT` cru → teste 2 explode
  (constraint) em vez de no-op: prova que o dedupe é o OR IGNORE; (ii) backoff: zerar o
  expoente (`2 ** tentativas` → `0`) → teste 4 cai (segunda passada incrementaria);
  (iii) aviso de falha sem dedupe (`'falha-' + id` → `'falha-' + id + Math.random()`... usar
  contador determinístico: `+ tentativas`) → teste 5 cai. Âncoras nos DOIS sentidos, md5.
- [ ] **Step 6: suíte + commit** (`git add` os 7 caminhos explícitos).

---

### Task 2: Gancho de movimentação + conteúdo + destinatários (RN-04, RN-05)

**Files:**
- Modify: `server/services/almoxarifado/notificationQueueService.js` (builder + resolução de
  classe), `server/services/almoxarifado/stockService.js` (gancho)
- Test: `server/tests/api/notificacaoMovimentacao.api.test.js` (novo)

**Interfaces:**
- `enfileirarMovimentacao(db, movimentacao, materialRow, user)` no queue service — chamada
  pelo gancho; resolve classe (`TIPOS_ENTRADA`→entradas, `TIPOS_SAIDA`→saidas, prefixo
  `AJUSTE`→ajustes, sufixo `_TERCEIRO`→terceiros **com precedência**), lê
  `notificacoes_dest_<classe>` com fallback no e-mail de alertas de estoque (ler a chave real
  que o alertService usa — grep `getConfig` lá; NÃO inventar nome), monta assunto
  `[Almoxarifado] <tipo> — <código do material>` e corpo com o conteúdo mínimo (RN-04: tipo,
  id, data, usuário, material, quantidade+unidade, **saldo anterior/posterior**, lote/série
  quando houver no registro, projeto/OS/cliente quando houver, justificativa, link
  `/almoxarifado/movimentacoes?destaque=<id>`), `dedupe_chave = 'mov-' + id`.
- Gancho no `registrarMovimentacao`: logo após o try/catch do
  `alertService.verificarAlertaPorMaterialId` e ANTES do `return`:

```js
  // Etapa 12 (RN-04, D8): notificacao pos-commit — todas as escritas do motor ja tiveram
  // sucesso; movimentacao que falha em qualquer guarda nunca chega aqui. O gancho mora no
  // MOTOR porque movimentacao entra por varias portas (v1, v2, rotas dedicadas, servicos).
  // Config-gated (default '0') e try/catch: aviso NUNCA derruba movimentacao.
  try {
    if (await getConfig(db, 'notificar_movimentacoes') === '1') {
      await notificationQueueService.enfileirarMovimentacao(db, {
        id: result.lastID, tipo, quantidade, saldo_anterior: saldoAnteriorReal,
        saldo_posterior: saldoPosterior, justificativa, /* + campos em escopo: lote_id,
        projeto_id etc. — LER o escopo real da funcao e passar o que existir */
      }, material, user);
    }
  } catch (notifErr) {
    console.warn('[almoxarifado-notificacoes] Falha ao enfileirar pos-movimentacao:', notifErr.message);
  }
```

  (Atenção: import circular — stockService ← notificationQueueService ← alertService; o queue
  service NÃO importa stockService, então o ciclo não existe; confirme lendo os requires.)

- [ ] **Step 1: teste vermelho**:
  1. `RN-04: movimentacao confirmada enfileira com conteudo minimo` — config '1' + dest
     configurado; ENTRADA via motor → linha na fila com dedupe `mov-<id>`, corpo contendo
     código do material, quantidade, `Saldo anterior` e `Saldo posterior` (valores certos),
     assunto prefixado.
  2. `RN-04: movimentacao RECUSADA nao enfileira` — saída maior que o disponível → erro do
     motor, COUNT da fila inalterado.
  3. `RN-04: config desligada (default) nao enfileira` — sem tocar config, movimentar →
     fila vazia; e o RETORNO do motor é idêntico (id/saldos) com config ligada/desligada.
  4. `RN-05: classe certa por tipo` — ENTRADA→dest_entradas; SAIDA→dest_saidas;
     AJUSTE→dest_ajustes; CONSUMO_TERCEIRO→dest_terceiros (precedência sobre saída) — 4
     movimentações, cada uma com config de classe distinta, aferindo destinatários da linha.
  5. `RN-05: fallback e sem-destinatario` — classe sem config → cai no e-mail de alertas;
     nenhum dos dois → não enfileira (motivo SEM_DESTINATARIO não quebra o motor).
- [ ] **Step 2: implementação** (builder no queue service; gancho no motor).
- [ ] **Step 3: verde + regressão PESADA do motor** — `conferenciaMotorAjuste`,
  `inventarioIntegracao`, `devolucaoVinculo`, `ajusteRetencao`, qualquer suíte que movimente
  (a config default '0' tem de deixar TUDO intacto) + suíte completa.
- [ ] **Step 4: controles positivos** — (i) mover o gancho para ANTES da auditoria/claims
  (simular pré-commit chamando-o no início) → teste 2 cai (recusada enfileiraria);
  (ii) remover a precedência de `_TERCEIRO` → teste 4 cai; (iii) tirar o try/catch do gancho
  e fazer o enfileirar lançar (config quebrada) → teste 3/regressão do motor cai — prova que
  o try/catch é load-bearing (restaurar!).
- [ ] **Step 5: suíte + commit.**

---

### Task 3: Dívidas + alertas novos + jobs (RN-06, RN-07)

**Files:**
- Modify: `server/services/almoxarifado/notificationQueueService.js` (funções de varredura:
  `varrerLembretesFerramenta`, `varrerLotesVencendo`, `varrerRemessasVencidas`),
  `server/services/almoxarifado/alertService.js` (estado ZERADO na máquina),
  `server/services/almoxarifado/purchaseService.js` (enfileirar resumo pós-gerar),
  `server/services/almoxarifado/returnService.js` (enfileirar no ESTADO_PARCIAL),
  `server/routes/almoxarifado.js` (job diário registrando as varreduras + worker da fila no
  intervalo config — padrão do REMINDER_INTERVAL_MS)
- Test: `server/tests/api/notificacaoDividas.api.test.js` e
  `server/tests/api/alertasNovos.api.test.js` (novos)

Pontos de atenção JÁ VERIFICADOS na Fase 0 (o executor confirma lendo):
- `toolReminderService.listarEmprestimosVencidos(db)` existe e é pura — a varredura chama e
  enfileira `dedupe: 'ferramenta-lembrete-' + emprestimo.id + '-' + hoje` (um/dia).
- Remessa vencida: a régua mora na rota `/vencidas` (`extended.js` ~1284) — extrair a
  CONDIÇÃO para função/const exportável OU replicar com comentário-espelho apontando um para
  o outro (preferir extrair; se extrair, a rota passa a usar a mesma função — regressão
  `remessaTerceiro*` obrigatória).
- Lote: `lotes_almoxarifado.data_validade` (texto ISO); janela = config
  `alerta_lote_vencendo_dias`; só lote com saldo > 0 e status ativo (ler os status reais do
  lotService antes de escrever o WHERE).
- ZERADO no alertService: transição própria com debounce no MESMO padrão ACIMA/ABAIXO (ler
  `avaliarCruzamentoMinimo` e espelhar; estado novo na tabela de estado existente — conferir
  colunas; se precisar de coluna, safeAlter). Dispara pela fila (enfileirar), não por
  enviarEmail direto — o histórico unificado é a fila.
- `gerarSolicitacoesDaSugestao`: após o loop, se `criadas.length > 0`, enfileirar UM resumo
  (dedupe `'solicitacoes-' + criadas.map(c=>c.solicitacao_id).sort().join('-')`) para
  `notificacoes_dest_compras` com fallback `compras_notificar_emails`.
- `returnService` ESTADO_PARCIAL (linha ~244): enfileirar aviso (dedupe
  `'devolucao-parcial-' + devolucaoId`) — dentro do try/catch RN-01.

Testes (dois arquivos, red-first; jobs testados chamando as varreduras DIRETO — nunca
esperar setInterval):
- Dívidas: empréstimo vencido → 1 item; rodar a varredura 2× no mesmo dia → 1 (dedupe);
  gerar solicitações → resumo com os materiais; devolução parcial → aviso; nenhum desses
  quebra a operação de negócio se a fila falhar (sabotar enfileirar para lançar → operação
  ainda retorna 200).
- Alertas: material zerado dispara UMA vez e rearma ao repor (par de transições); lote
  dentro da janela → item com dedupe por validade (2ª varredura no-op); lote fora da janela/
  sem saldo → nada; remessa vencida pela régua única → item; remessa no prazo → nada.

Controles positivos: dedupe-por-dia da ferramenta (remover a data da chave → 2ª varredura
duplica → teste cai); régua do lote (janela ignorada → lote fora entra → cai); ZERADO sem
rearme (transição de volta removida → segundo disparo não ocorre → cai).

Suíte completa + commit.

---

### Task 4: Tela `/almoxarifado/notificacoes` (galho, worktree)

**Files:** Create `client/src/components/almoxarifado/NotificacoesAlmoxarifado.js` +
`.test.js`; Modify `lazyModules.js`, `App.js`, `Layout.js`,
`ConfiguracoesAlmoxarifado.js` (+ `ConfiguracoesGerais.test.js`),
`client/src/utils/permissaoErro.js` (rótulo `gerenciar_notificacoes`).

Contrato (congelado — mock HTTP): os 3 endpoints do design; padrões OBRIGATÓRIOS herdados
das lições 11: **painel de erro por estado com retry** (403 nunca vira lista vazia), cards de
resumo do conjunto inteiro com legenda, datas UTC-safe, `—` para nulos, gate nos botões
(`bloquearSeNaoPode('gerenciar_notificacoes')`), asserts POR CÉLULA nos testes com fixtures
de números distintos, teste do caminho default de cada botão. CAMPOS de config: as 4
numéricas + as 5 `dest_*` + `notificar_movimentacoes` (checkbox/select 0-1 — ler o padrão de
campo booleano existente no array; se não houver, tipo number com descrição "0 ou 1" e
validação local).

Testes (mínimo 8): lista com badges por status; filtros refazem chamada; reenviar chama POST
certo e recarrega; processar idem; 403 → painel (não vazio); resumo por célula; configs novas
renderizam e entram no payload; erro de rede ≠ vazio. Sabotagem mínima: trocar o POST de
reenviar pelo de processar → teste cai; remover painel de erro → teste cai.

Full client suite + build; commit na worktree.

---

### Task 5: Teste-jornada (galho, árvore principal)

**File:** `server/tests/api/notificacaoJornada.api.test.js`. Jornada: ligar
`notificar_movimentacoes` + dest_entradas → ENTRADA pelo motor → item na fila (conteúdo
mínimo conferido) → `processar` (ADMIN) → falha SMTP registrada (tentativa 1, backoff) →
forçar max=1 + elegibilidade → processar → FALHA + aviso `FALHA_NOTIFICACAO` → painel
`?status=FALHA` mostra → `reenviar` → tentativa nova registrada → gates (PRODUCAO/ALMOXARIFE/
COMPRAS 403 no painel) → desligar config → movimentar → fila NÃO cresce. Sabotagem da
jornada: gancho movido pré-validação (como na Task 2) → passo da recusada cai. Suíte
completa; commit só do arquivo.

---

### Task 6: Fechar a etapa

Merge da worktree, suíte serial, revisão final de branch (2 revisores MEDINDO — lentes:
backend/motor intacto com config off + costura front/back), skill `fechar-etapa` (letra B:
D1 default desligado, D7 ação sem COMPRAS, D2 classes vs matriz, D6 alertas escolhidos;
manual: seção temática de notificações), retro de 4 números.

---

## Self-review do plano (feito na escrita)

- Cobertura: RN-01/02/03/08/09→T1; RN-04/05→T2; RN-06/07→T3; tela→T4; composição→T5.
- Tipos consistentes: `enfileirar`/`processarFila`/`reenviar`/`enfileirarMovimentacao` e os
  shapes batem entre T1 (produtor), T2/T3 (chamadores), T4 (HTTP) e T5 (jornada).
- Armadilhas nomeadas: import circular (verificar requires), chave real do e-mail de alertas
  (grep antes), status reais de lote, régua de /vencidas extraída com regressão, jobs
  testados por chamada direta, backoff testável sem relógio (elegibilidade), config default
  '0' blindando o motor inteiro.
