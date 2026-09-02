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
  config numérica com DUAS mensagens (Fase 2 — a da 11 mentia para chave que não é dias):
  prefixos de dias (`reposicao_`, `alerta_lote_`) → `Configuração "<chave>" deve ser um
  número de dias maior que zero` (intacta, contrato da 11); prefixos inteiros
  (`notificacoes_worker_`, `notificacoes_max_`) → `Configuração "<chave>" deve ser um número
  inteiro maior que zero`.
- Worker no job com **delay inicial ≥ 30s** e intervalo longo, `.unref()`, COMO o lembrete —
  nunca delay curto (mutaria as linhas que os testes conferem).
- Régua de sucesso do envio: **`resultado.enviados > 0`** — nunca `erros.length === 0` (lista
  vazia devolve `{enviados: 0, erros: []}`). Destinatários da linha SEMPRE via `parseList`
  (a coluna é TEXT; as configs semeiam `'[]'`).
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

## Fase 2 — achados da revisão adversarial do plano (TODOS acatados; o texto abaixo já está corrigido)

Revisor fresco com 5 probes contra o app real: **7 Critical + 6 Important + minors, 0 ruído.**

1. **[C] Ciclo de require provado**: RN-07 faz `alertService` → queue service → `alertService`;
   com `routes/almoxarifado.js` carregando o alertService PRIMEIRO e o `module.exports = {...}`
   por substituição, `enviarEmail` fica `undefined` **só em produção**. Fix: require **lazy
   dentro de `processarFila`** (padrão do próprio stockService:589) + teste que requer o
   alertService antes do queue e processa uma linha.
2. **[C] `2^tentativas`**: SQLite não tem `^` (SQLITE_ERROR) e em JS é XOR. Fix: calcular em
   JS com `Math.pow(2, n)` e passar como parâmetro ligado.
3. **[C] Aviso ao admin sem destinatário**: a chave real é **`alertas_estoque_emails`**,
   semeada com `'[]'` — split ingênuo por vírgula gera o destinatário fantasma `"[]"`. Fix:
   exportar/usar o `parseList` do alertService; teste 5 configura a chave com JSON; **FALHA
   acontece mesmo sem aviso enfileirável** (a transição não depende do aviso).
4. **[C] Dedupe detectado pelo campo errado**: `INSERT OR IGNORE` ignorado MANTÉM o `lastID`
   anterior. A régua é **`changes === 0`**.
5. **[C] ZERADO não cabe na máquina atual**: coluna única `estado_estoque` + guarda
   `min <= 0` retornando cedo → gravar 'ZERADO' ali quebra o alerta de mínimo E material sem
   mínimo nunca alertaria. Fix: 2 colunas novas via safeAlter (`estado_zerado`,
   `ultimo_alerta_zerado`), função **separada** `avaliarZerado` sem a guarda, régua
   **`quantidade_atual <= 0`** (o design dizia "disponível" — corrigido: 100% reservado não
   está zerado).
6. **[C] Chave de config em template string some da varredura** do
   `configuracoesGerais.api.test.js` (que exige o literal `'chave'` em routes/services) —
   e a falha só apareceria no merge. Fix: mapa literal `DEST_POR_CLASSE` com comentário.
7. **[C] "Vale para TODO tipo" mandava e-mail de RESERVA** a cada requisição aprovada. Fix:
   tipo sem classe → `{enfileirada:false, motivo:'SEM_CLASSE'}`; precedência fixada
   `_TERCEIRO` > `AJUSTE*` > entrada/saída; testes de RESERVA e AJUSTE_POSITIVO/NEGATIVO.
8. **[I] Mensagem de validação mentia** ("dias" para tentativas/minutos): dois conjuntos de
   prefixos, duas mensagens (a da 11 intacta para dias; nova
   `Configuração "<chave>" deve ser um número inteiro maior que zero` para as demais) — e o
   guard espelho do client acompanha.
9. **[I] FALHA_NOTIFICACAO recursava** (não há coluna de max por linha): regra literal no
   worker `evento === 'FALHA_NOTIFICACAO' → maxTentativas 1, não avisa` + teste 3×.
10. **[I] Contrato do envio indefinido**: `destinatarios` TEXT → `parseList` sempre; sucesso
    = **`resultado.enviados > 0`** (lista vazia com `erros: []` NÃO é sucesso); teste afere o
    literal `ultimo_erro === 'SMTP não configurado'`.
11. **[I] A régua de /vencidas NÃO está na rota** (ela só delega): fonte única já existe em
    `thirdPartyService.listarRemessas` (`:322`) — chamar com `{vencidas:'1'}`, NÃO extrair
    nada; coluna é **`prazo_previsto`** (não `data_prevista`).
12. **[I] O controle positivo do backoff não sabia falhar** (expoente 0 ainda é futuro):
    sabotagem correta = `proxima_tentativa_em = datetime('now')` → 2ª passada incrementa;
    + assert numérico ≥ 10 min na 2ª tentativa (único que distingue expoente).
13. **[I] Reenviar drenava a fila inteira**: `processarFila(db, { id })` com escopo.
14. **[I] "hoje" do lembrete em UTC** (`toISOString().slice(0,10)`) para casar com o
    `date('now')` do toolReminderService.
15. **[Minors]** `enviarEmail` JÁ é exportado (alertService fora da Task 1); gancho passa
    `loteIdFinal`/`loteCodigoFinal` (o `lote_id` cru vem null quando a chamada usa código);
    worker com delay inicial ≥ 30s COMO O LEMBRETE (nunca curto — mutaria linhas sob teste);
    lote: `STATUS_LOTE`/saldo por precedente `lotService:206`/decidir `vencimento_liberado`
    (liberado SAI da varredura — decisão registrada); resumo de solicitações captura
    código/nome no laço e `sort((a,b)=>a-b)`; `returnService` enfileira ANTES do throw;
    `tipo: 'boolean'` já existe em CAMPOS; Task 4 RODA TAMBÉM `npm run test:api` na worktree
    (o teste de amarração cliente↔servidor é de servidor e lê arquivo do client).

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

### Task 1: Fila + serviço + painel — ✅ FEITA (`18a8d71` + fix-round `a8b9c0e`)

> Revisão adversarial: 1 Critical (dois drenos concorrentes enviavam o mesmo e-mail — claim em
> memória + re-checagem no banco), 5 Important (enviado_em no reenviar, GET com colunas
> nomeadas, 3 invariantes sem teste), 5 Minor. Divergências do plano: getConfigValue reusado em
> vez de leitor novo; teste 5 endurecido; o Step 1 abaixo dizia "mesma mensagem literal" e FOI
> CORRIGIDO em execução (duas mensagens — ver Global Constraints).

**Files:**
- Create: `server/services/almoxarifado/notificationQueueService.js`
- Modify: `server/services/almoxarifado/schema.js` (tabela + índice + configs),
  `server/services/almoxarifado/permissions.js` (ação),
  `server/services/almoxarifado/alertService.js` (**só** exportar `parseList` — `enviarEmail`
  JÁ está exportado, Fase 2),
  `server/routes/almoxarifado.js` (validação de config: DOIS conjuntos de prefixos, DUAS
  mensagens — ver Global Constraints; o guard espelho do client fica para a Task 4),
  `server/routes/almoxarifado/extended.js` (3 rotas do painel)
- Test: `server/tests/api/notificacaoFila.api.test.js` (novo)

**Interfaces (Produces — Tasks 2/3/4/5 consomem):**
- `enfileirar(db, { evento, dedupe_chave, destinatarios, assunto, corpo_html, corpo_texto, payload })`
  → `{ enfileirada: true, id }` | `{ enfileirada: false, motivo: 'DUPLICADA' }` |
  `{ enfileirada: false, motivo: 'SEM_DESTINATARIO' }`. **Dedupe pela régua `changes === 0`**
  do `INSERT OR IGNORE` (Fase 2: o insert ignorado MANTÉM o lastID anterior — testar por
  lastID devolveria o id de OUTRA notificação).
- `processarFila(db, opcoes = {})` → `{ processadas, enviadas, falharam }`; `opcoes.id`
  restringe a UM item (é o que `reenviar` usa — sem isso o botão da tela drenaria a fila
  inteira e acoplaria os testes). Pega PENDENTE com `proxima_tentativa_em` nula ou ≤ agora.
  **Require LAZY do alertService DENTRO da função** (Fase 2, Critical: a Task 3 fecha o ciclo
  alertService⇄queue e o require de topo cachearia `{}` — padrão do stockService:589):
  `const alertService = require('./alertService');`. Envio: `const destinatarios =
  parseList(row.destinatarios); const r = await alertService.enviarEmail(db, destinatarios,
  row.assunto, row.corpo_html, row.corpo_texto); const ok = r.enviados > 0;`. Sucesso →
  ENVIADO+`enviado_em`. Falha (backoff CALCULADO EM JS — `^` não existe no SQLite e em JS é
  XOR):

```js
      const proxTentativas = row.tentativas + 1;
      const maxTentativas = row.evento === 'FALHA_NOTIFICACAO' ? 1 : maxConfig; // nao recursa
      if (proxTentativas >= maxTentativas) {
        // FALHA acontece MESMO que o aviso abaixo nao seja enfileiravel (RN-03 emendada).
        await dbRun(db, `UPDATE ... SET status = 'FALHA', tentativas = ?, ultimo_erro = ? WHERE id = ?`, [...]);
        if (row.evento !== 'FALHA_NOTIFICACAO') {
          const adminDest = parseList(await getConfigLocal(db, 'alertas_estoque_emails'));
          await enfileirar(db, { evento: 'FALHA_NOTIFICACAO', dedupe_chave: `falha-${row.id}`,
            destinatarios: adminDest, ... }); // SEM_DESTINATARIO aqui e warn, nunca throw
        }
      } else {
        const minutos = intervaloMin * Math.pow(2, proxTentativas);
        await dbRun(db, `UPDATE fila_notificacoes_almoxarifado
          SET tentativas = ?, ultimo_erro = ?, proxima_tentativa_em = datetime('now', '+' || ? || ' minutes')
          WHERE id = ?`, [proxTentativas, erro, minutos, row.id]);
      }
```

- `reenviar(db, usuario, id)` → `{ success: true, status }` | 404-shape; reseta
  tentativas/status/erro/proxima_tentativa_em, audita (`dados_novos` OBJETO — lição da 11), e
  chama `processarFila(db, { id })` — só o item.
- Configs semeadas (RN-09) + `gerenciar_notificacoes: [PERFIS.ADMINISTRADOR, PERFIS.GESTOR]`.

- [x] **Step 1: schema** — tabela+índice do design (copiar o SQL literal) no `initSchema`,
  configs no array `configs` (com comentário citando a lição da 10: config não semeada é
  ineditável), e em `routes/almoxarifado.js` estender a validação numérica do PUT: trocar o
  teste `chave.startsWith('reposicao_')` (Etapa 11) por um set
  `['reposicao_', 'notificacoes_worker_', 'notificacoes_max_', 'alerta_lote_'].some((p) => chave.startsWith(p))`
  — **com DUAS mensagens, não uma** (este parágrafo dizia "mesma mensagem literal";
  **estava errado** e contradizia a Global Constraint corrigida na Fase 2 — a mensagem "número
  de dias" mentiria para tentativas/minutos): prefixos `reposicao_`/`alerta_lote_` mantêm
  `deve ser um número de dias maior que zero`; prefixos `notificacoes_worker_`/`notificacoes_max_`
  ganham `deve ser um número inteiro maior que zero`. `notificar_movimentacoes` valida `0|1`
  (400 `deve ser 0 ou 1` — revisão da Task 1) e as `notificacoes_dest_*` seguem texto livre.
- [x] **Step 2: teste vermelho** (harness padrão; usuários ADMIN/GESTOR/COMPRAS/ALMOXARIFE/
  PRODUCAO; helper `enfileirarDireto` chamando o serviço):
  1. `RN-01: enfileirar so grava PENDENTE, nada e enviado` — enfileira, linha PENDENTE com
     corpo gravado, `enviado_em` nulo.
  2. `RN-02: dedupe — mesmo evento+chave e no-op` — segunda chamada `{ enfileirada: false,
     motivo: 'DUPLICADA' }`, COUNT 1; chave diferente → 2.
  3. `RN-01: sem destinatario nao enfileira` — `{ enfileirada: false, motivo: 'SEM_DESTINATARIO' }`.
  4. `RN-03: falha de envio registra tentativa, backoff e mantem PENDENTE` — processar (SMTP
     ausente no harness) → `tentativas 1`, **`ultimo_erro === 'SMTP não configurado'`**
     (LITERAL — um TypeError de `.join` ou lista vazia dariam outro texto; é o assert que
     prova o parseList e o caminho real), `proxima_tentativa_em` futura (**assert numérico:
     ≥ 10 minutos na 2ª tentativa** — o único que distingue o expoente certo), status
     PENDENTE; processar DE NOVO em seguida → `tentativas` continua 1 (inelegível).
  5. `RN-03: FALHA apos max e aviso ao admin UMA vez` — **antes de tudo**:
     `UPDATE configuracoes_almoxarifado SET valor='["admin@gmp.com"]' WHERE
     chave='alertas_estoque_emails'` (Fase 2: o seed é `'[]'` e sem isso o aviso morre em
     SEM_DESTINATARIO e o teste não pode passar); setar `notificacoes_max_tentativas=1` +
     zerar `proxima_tentativa_em` → processar → status FALHA e UMA linha
     `evento FALHA_NOTIFICACAO` (dedupe `falha-<id>`); processar 2× de novo → continua UMA
     (a linha de aviso tem max próprio 1 e não gera aviso de si mesma).
  5b. `RN-03: FALHA acontece mesmo SEM admin configurado` — outro item, `alertas_estoque_emails`
     de volta a `'[]'` → processar até o max → status FALHA, NENHUMA linha de aviso, nenhum
     throw.
  5c. `RN-01: ciclo de require nao quebra o envio` — arquivo requer `alertService` ANTES do
     queue service (ordem de produção) e processa uma linha → o resultado é a falha REGISTRADA
     de SMTP, nunca `enviarEmail is not a function`.
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
- [x] **Step 3: implementação** — serviço novo (único escritor da fila; `lerConfigNumero`
  local no padrão da 11 com comentário de 6º-leitor-declarado), export `enviarEmail` no
  `module.exports` do alertService, rotas em `extended.js` (padrão handleError/auth; a rota
  `/processar` e `/reenviar` chamam o serviço; GET monta `resumo` com COUNTs do conjunto
  inteiro e `itens` LIMIT 200 DESC).
- [x] **Step 4: verde + regressão** (`configuracoesGerais`, `permissoesRotas`).
- [x] **Step 5: controles positivos** — (i) sabotar o `INSERT OR IGNORE` para `INSERT` cru →
  teste 2 explode (constraint) em vez de no-op; (ii) backoff: **`proxima_tentativa_em =
  datetime('now')`** (Fase 2: zerar o expoente NÃO sabe falhar — 5 min ainda é futuro) → o
  item fica elegível e a 2ª passada leva tentativas a 2 → teste 4 cai; (iii) aviso de falha
  com dedupe quebrado (`'falha-' + row.id` → `'falha-' + row.id + '-' + row.tentativas`) →
  teste 5 cai (segunda linha nasce). Âncoras nos DOIS sentidos, md5, sed reverso.
- [x] **Step 6: suíte + commit** (`git add` os 7 caminhos explícitos).

---

### Task 2: Gancho de movimentação + conteúdo + destinatários — ✅ FEITA (`77d1f38` + fix-round `48426f5`)

> Revisão: 3 Important medidos que o plano não previa — REMESSA/RETORNO_TERCEIRO caíam na
> classe terceiros pelo sufixo (retenção + item-a-item = rajada; excluídos), o e-mail
> sobrevivia ao cancelamento (supressão criada), série faltava no corpo (RN-04 pedia). 3
> sabotagens sobreviventes viraram testes (escape, parseList de classe, Lote/Link).

**Files:**
- Modify: `server/services/almoxarifado/notificationQueueService.js` (builder + resolução de
  classe), `server/services/almoxarifado/stockService.js` (gancho)
- Test: `server/tests/api/notificacaoMovimentacao.api.test.js` (novo)

**Interfaces:**
- `enfileirarMovimentacao(db, movimentacao, materialRow, user)` no queue service — chamada
  pelo gancho; resolve classe com precedência FIXA (Fase 2): sufixo `_TERCEIRO` **>** prefixo
  `AJUSTE` **>** `TIPOS_ENTRADA`→entradas / `TIPOS_SAIDA`→saidas; **tipo que não resolve para
  classe nenhuma NÃO enfileira** (`{enfileirada:false, motivo:'SEM_CLASSE'}` — RESERVA/
  LIBERACAO_RESERVA/TRANSFERENCIA/BLOQUEIO/etc. passam pelo motor em toda requisição e
  virariam spam; a spec 14 pede entrada e saída, não retenção). Lê a config pelo mapa
  **literal** `DEST_POR_CLASSE` (Fase 2: chave em template string some da varredura do
  `configuracoesGerais.api.test.js`, que exige o literal `'chave'` em routes/services) com
  fallback `alertas_estoque_emails` via `parseList` — fallback SÓ para classe resolvida.
  Monta assunto
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
        saldo_posterior: saldoPosterior, justificativa, motivo, referencia,
        // Fase 2: loteIdFinal/loteCodigoFinal, NAO o lote_id cru — ele vem null sempre que a
        // chamada usou o CODIGO do lote (inclusive quando a entrada CRIOU o lote).
        lote_id: loteIdFinal, lote_codigo: loteCodigoFinal,
        projeto_id, os_id, cliente_id, requisicao_id, documento_vinculado,
      }, material, user);
    }
  } catch (notifErr) {
    console.warn('[almoxarifado-notificacoes] Falha ao enfileirar pos-movimentacao:', notifErr.message);
  }
```

  (Atenção: import circular — stockService ← notificationQueueService ← alertService; o queue
  service NÃO importa stockService, então o ciclo não existe; confirme lendo os requires.)

- [x] **Step 1: teste vermelho**:
  1. `RN-04: movimentacao confirmada enfileira com conteudo minimo` — config '1' + dest
     configurado; ENTRADA via motor → linha na fila com dedupe `mov-<id>`, corpo contendo
     código do material, quantidade, `Saldo anterior` e `Saldo posterior` (valores certos),
     assunto prefixado.
  2. `RN-04: movimentacao RECUSADA nao enfileira` — saída maior que o disponível → erro do
     motor, COUNT da fila inalterado.
  3. `RN-04: config desligada (default) nao enfileira` — sem tocar config, movimentar →
     fila vazia; e o RETORNO do motor é idêntico (id/saldos) com config ligada/desligada.
  4. `RN-05: classe certa por tipo, com precedencia` — ENTRADA→dest_entradas;
     SAIDA→dest_saidas; **AJUSTE_POSITIVO e AJUSTE_NEGATIVO→dest_ajustes** (mesmo estando em
     TIPOS_ENTRADA/SAIDA — é a precedência que nenhuma ordem de ifs acidental pode inverter);
     CONSUMO_TERCEIRO→dest_terceiros (precedência sobre saída) — cada uma com config de
     classe distinta, aferindo destinatários da linha.
  4b. `RN-05: tipo SEM classe nao enfileira` — RESERVA com config ligada e destinatários
     configurados → fila NÃO cresce (Fase 2: sem isso, toda requisição aprovada mandava
     e-mail de reserva).
  5. `RN-05: fallback e sem-destinatario` — classe sem config → cai em
     `alertas_estoque_emails` (configurada com JSON no teste, parseList); nenhum dos dois →
     não enfileira (SEM_DESTINATARIO não quebra o motor).
- [x] **Step 2: implementação** (builder no queue service; gancho no motor).
- [x] **Step 3: verde + regressão PESADA do motor** — `conferenciaMotorAjuste`,
  `inventarioIntegracao`, `devolucaoVinculo`, `ajusteRetencao`, qualquer suíte que movimente
  (a config default '0' tem de deixar TUDO intacto) + suíte completa.
- [x] **Step 4: controles positivos** — (i) mover o gancho para ANTES da auditoria/claims
  (simular pré-commit chamando-o no início) → teste 2 cai (recusada enfileiraria);
  (ii) remover a precedência de `_TERCEIRO` → teste 4 cai; (iii) tirar o try/catch do gancho
  e fazer o enfileirar lançar (config quebrada) → teste 3/regressão do motor cai — prova que
  o try/catch é load-bearing (restaurar!).
- [x] **Step 5: suíte + commit.**

---

### Task 3: Dívidas + alertas novos + jobs — ✅ FEITA (`837faec` + fix-round `078cce2`)

> Revisão: 1 Critical (dedupe do zerado era nonce + estado marcado após enfileirar → claim
> atômico na transição) e 5 Important (toggle ignorado, inativo elegível, zerado+mínimo em
> dobro → zerado só sem mínimo, lote JÁ vencido nunca alertava → sem piso, régua
> quantidade_atual sem teste). Divergências declaradas mantidas: avaliarZerado no hook do
> verificarAlertaPorMaterialId; thirdPartyService lazy; monkeypatch de getLote no teste.

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

Pontos de atenção VERIFICADOS pela Fase 2 (probes — seguir à risca):
- `toolReminderService.listarEmprestimosVencidos(db)` confirmado (retorna `e.*` +
  `ferramenta_nome`/`codigo_patrimonio`/`dias_vencido`); dedupe
  `'ferramenta-lembrete-' + emprestimo.id + '-' + hoje` com
  **`const hoje = new Date().toISOString().slice(0, 10);` (UTC — casa com o `date('now')` do
  serviço; data local duplicaria o lembrete entre 21h e meia-noite)**.
- Remessa vencida: **a rota `/vencidas` só DELEGA** — a fonte única JÁ existe em
  `thirdPartyService.listarRemessas(db, { vencidas: '1' })` (`thirdPartyService.js:322`).
  Chamar essa função; NÃO extrair nada da rota, NÃO refatorar. Dedupe:
  `'remessa-vencida-' + r.id + '-' + r.prazo_previsto` (a coluna é **`prazo_previsto`** —
  `data_prevista` não existe).
- Lote: `STATUS_LOTE = ['ATIVO','BLOQUEADO','REPROVADO']` (lotService:15); varrer só ATIVO
  com `data_validade` na janela E saldo > 0 pelo precedente `lotService:206`
  (`SUM(s.quantidade) FROM estoque_saldo_almoxarifado s WHERE s.lote_id = l.id`). **Lote com
  vencimento liberado (`vencimento_liberado_em` preenchido) SAI da varredura** — a liberação
  é a decisão humana de usar mesmo vencendo; alertar de novo seria ruído (decisão registrada,
  letra D).
- ZERADO: **função separada `avaliarZerado`** (NÃO um ramo em `avaliarCruzamentoMinimo` — a
  coluna `estado_estoque` é única e um terceiro valor quebraria o alerta de mínimo nos dois
  sentidos, medido pela Fase 2; e a guarda `min <= 0` retornaria cedo justamente nos materiais
  sem mínimo, onde o zerado mais vale). Duas colunas novas via safeAlter:
  `estado_zerado TEXT DEFAULT 'COM_SALDO'` e `ultimo_alerta_zerado DATETIME`. Régua:
  **`quantidade_atual <= 0`** (o design dizia "disponível" — corrigido: 100% reservado não
  está zerado), `proprietario_cliente_id IS NULL`. Dispara pela FILA (enfileirar), rearma na
  transição de volta.
- `gerarSolicitacoesDaSugestao`: após o loop, se `criadas.length > 0`, enfileirar UM resumo
  (dedupe `'solicitacoes-' + criadas.map(c=>c.solicitacao_id).sort((a,b)=>a-b).join('-')` —
  **sort NUMÉRICO**, o lexicográfico põe [2,10] como [10,2]) para `notificacoes_dest_compras`
  com fallback `compras_notificar_emails` (semeada `'[]'` — parseList). O código/nome do
  material NÃO está em `criadas` — capturar do `item` dentro do laço para o corpo.
- `returnService` ESTADO_PARCIAL (linha ~244): enfileirar aviso (dedupe
  `'devolucao-parcial-' + r.lastID`) **ANTES do `throw e`** da compensação, em try/catch
  próprio (RN-01 — aviso nunca engole nem substitui o erro real).

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

### Task 4: Tela `/almoxarifado/notificacoes` — ✅ FEITA (worktree: `feba6e2` + fix-round `8fdcbe5`, merge `569ecc4`)

> Revisão: nenhuma linha de produção errada; 4 mutações sobreviventes viraram testes (datas
> UTC, parse legado, travas, rótulo por texto acentuado) e o CONFLITO do design sobre reenviar
> ENVIADO foi arbitrado (RN-08 prevalece, confirm na tela — `44cc18a` corrige o design
> dizendo que a seção do front estava errada).

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

Full client suite + build **E TAMBÉM `cd server && npm run test:api` NA WORKTREE** (Fase 2:
`configuracoesGerais.api.test.js` é teste de SERVIDOR que lê o arquivo do CLIENT — mexer em
CAMPOS sem rodar a suíte de servidor esconderia a quebra até o merge); commit na worktree.

---

### Task 5: Teste-jornada — ✅ FEITA (`33028b5`, 11 passos, sem revisor dedicado — diff
test-only com sabotagem provada, precedente 9b/10; coberta pela revisão final)

**File:** `server/tests/api/notificacaoJornada.api.test.js`. Jornada: ligar
`notificar_movimentacoes` + dest_entradas → ENTRADA pelo motor → item na fila (conteúdo
mínimo conferido) → `processar` (ADMIN) → falha SMTP registrada (tentativa 1, backoff) →
forçar max=1 + elegibilidade → processar → FALHA + aviso `FALHA_NOTIFICACAO` → painel
`?status=FALHA` mostra → `reenviar` → tentativa nova registrada → gates (PRODUCAO/ALMOXARIFE/
COMPRAS 403 no painel) → desligar config → movimentar → fila NÃO cresce. Sabotagem da
jornada: gancho movido pré-validação (como na Task 2) → passo da recusada cai. Suíte
completa; commit só do arquivo.

---

### Task 6: Fechar a etapa — ✅ FEITA (commits de fechamento após a revisão final de branch
`d7fee6c`: 2 Critical da lente A — primeira zeragem observada engolida, rajada de 50 e-mails
da conferência — + 3 Important e os minors, todos corrigidos ou declarados)

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


---

## Retro de 4 números (Fase 6)

1. **Rodadas de correção até verde:** 5 fix-rounds (um por task revisada + um da revisão
   final), todas fechadas em UMA rodada cada — nenhum teste falhou 3 vezes seguidas.
2. **Achados de revisão:** 34 acatados (4 Critical + 12 Important + 18 Minor/testes-fracos),
   **0 ruído** — nenhum achado deixou de ser reproduzido. As 5 revisões (4 de task + 2 lentes
   finais contando como 1 rodada) mediram TODAS com probe/sabotagem antes de afirmar.
3. **Paralelismo:** 2 pares reais (revisão-T3 ∥ implementação-T4; revisão-T4 ∥ implementação-T5)
   — zero retrabalho por conflito (galho de front em worktree, contratos congelados seguraram).
4. **Defeito que escapou do fechamento:** preencher na Etapa 13. (Da Etapa 11 para cá: nenhum
   reportado até este fechamento.)

**Incidentes de processo (para o harness aprender):** duas restaurações de sabotagem por sed
com âncora não-única espalharam mudança (md5 pegou ambas); um `git checkout` para restaurar com
árvore suja apagou edições não commitadas (md5 pegou; lição G5 violada e re-provada). Registrados
na letra E das novidades.

## Próxima tarefa detalhada — Etapa 13 (relatórios e indicadores, feature 21)

- **Spec:** `specs/modulo-almoxarifado/21-relatorios-dashboards/README.md` (ler inteira na
  Fase 0) + o mapa. A Etapa 12 declarou a 13 como o canal da conferência de inventário
  (relatório de divergências/acuracidade — a 10b já entregou o relatório de acuracidade com
  impacto em reais; conferir o que a spec 21 pede ALÉM dele antes de desenhar).
- **O que já está pronto e a 13 NÃO deve reabrir:** relatórios existentes no dispatcher de
  `routes/almoxarifado/extended.js` (inventario-divergencias com gate da 10b,
  solicitacoes-compra com gerenciar_reposicao da 11); fontes únicas `disponivelSql`,
  `custoUnitarioSql`, `divergenciaRealSql`/`EPSILON_DIVERGENCIA`; a fila da 12 (se algum
  relatório quiser aba de notificações, o contrato do GET está congelado no design da 12).
- **Pontos de atenção:** relatórios são leitura — candidatos naturais a GALHO paralelo, mas o
  gate por relatório é regra compartilhada (tronco curto primeiro definindo o mapa
  relatório→ação); curva ABC precisa decidir a régua (valor de consumo vs valor de estoque) —
  decisão de negócio, letra B se não houver resposta; exportação (PDF/Excel) é onde os cortes
  D3 da 12 podem ser re-perguntados — não assumir.
- **Regras da casa que continuam valendo:** B11 e B14 seguem abertas (não construir por cima);
  almoxarifado é área física (não propor filtro por depósito como pendência); worktree para
  galho de front; suíte serial no merge.
