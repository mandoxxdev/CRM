# Etapa 182 — O alerta "material separado aguardando retirada há N dias" (feature 20, com a 05)

> **Status:** 🔧 **T1–T4 executadas (2026-10-22), ver "Execução" — falta a T5 (fechamento), depois da revisão.** Emendado da
> "próxima tarefa detalhada" da Etapa 181 (B1188).
> **Origem:** a única lacuna da spec 20 que não depende de ninguém (`specs/modulo-almoxarifado/20-alertas/README.md:54`, item
> desmarcado, e `:164`, *"falta a data da transição p/ PRONTA_PARA_RETIRADA"*). Dor de galpão: a caixa separada ocupa a área de
> expedição e segura material que ninguém busca.
>
> **Fase 0 (medido no código, 2026-10-22):**
> - **Única porta que põe a requisição em `PRONTA_PARA_RETIRADA`:** `PUT /api/almoxarifado/requisicoes/:id/liberar-retirada`
>   (`server/routes/almoxarifado.js:4564`), dentro de `travaPorRequisicao.serializarNaRequisicao` (`:4569`), com o
>   compare-and-set `UPDATE requisicoes_almoxarifado SET status='PRONTA_PARA_RETIRADA', updated_at=CURRENT_TIMESTAMP WHERE id=? AND
>   status=? AND NOT EXISTS (rodada nova)` em `:4609-4612`, até duas tentativas (`:4576`), 409 na segunda perda. Auditoria
>   `LIBERACAO_RETIRADA` **depois**, best-effort em `try/catch` (`:4621-4631`) — pode faltar com o ato feito.
> - **Escritor único, medido:** nenhum outro `SET status=…` chega a `PRONTA_PARA_RETIRADA`. Os paramétricos de requisição: a
>   devolução de status da separação (`requisitionService.js:1522`) restaura um status de `PODE_SEPARAR`, que **não** contém PRONTA
>   (`requisitionStateMachine.js:98-99`); a entrega grava `ENTREGUE`/`PARCIALMENTE_ATENDIDA` (`requisitionService.js:2049-2068`);
>   a alçada de valor grava `AGUARDANDO_APROVACAO_VALOR`/`PENDENTE` (`requisitionValueApprovalService.js:111`, `:167`); aprovação
>   (`routes/almoxarifado.js:3972`, `:4233`, `:4369`) e reserva da chegada (`reservaChegadaService.js:149`) gravam status de antes
>   da separação. A máquina só admite PRONTA a partir de `EM_SEPARACAO` (`requisitionStateMachine.js:80`).
> - **Saídas de PRONTA** (`requisitionStateMachine.js:84`): `PARCIALMENTE_ATENDIDA` e `ENTREGUE` (entrega,
>   `requisitionService.js:2063-2068`) e `EM_SEPARACAO` (**B504**, a devolução do separado à prateleira,
>   `requisitionService.js:2421-2424`, `UPDATE … SET status='EM_SEPARACAO', updated_at=…, ultimo_lembrete_enviado=NULL WHERE id=? AND
>   status='PRONTA_PARA_RETIRADA'`). A exclusão/cancelamento grava `ativo=0` (`requisitionService.js:2273`). `PARCIALMENTE_ATENDIDA`
>   só volta a `EM_SEPARACAO`/`ENTREGUE`/`ENCERRADA` (`:85`) — **não** volta a PRONTA sem passar de novo pela rota.
> - **Não há data da transição:** `requisicoes_almoxarifado` (`schema.js:607-624` + os `safeAlter` de `:2711-2724`, `:2839-2840`,
>   `:2953`) tem `updated_at`, `data_aprovacao`, `data_entrega`, `conferido_em`, `ultimo_lembrete_enviado`… e nenhuma marca da
>   liberação. `updated_at` muda em qualquer gravação.
> - **Registro de alertas:** `server/services/almoxarifado/alertRegistry.js` (1089 linhas), `ALERT_REGISTRY` em `:424` com **15**
>   entradas (a última `NAO_CONFORMIDADE_EXECUCAO_PENDENTE`, `:961`). Molde `RESERVA_PARADA` em `:564-587`: `configDias { chave,
>   default }`, `listar(db, { dias })` com `julianday('now') - julianday(col) > ?`, `dedupeChave`, `payload`, `assunto`, `corpo`.
>   `resolverDias` (`:47`) lê `configuracoes_almoxarifado` por `lerConfigNumero` (`:40`, `parseFloat`, só finito > 0, senão o default).
>   As irmãs mais novas (`listarNaoConformidadesParadas`, `:296`) usam **colunas nomeadas** (lição F3 da 39: `montarCentral` devolve a
>   linha crua) e `CAST(julianday('now') - julianday(col) AS INTEGER)` como dias completos.
> - **Central:** `montarCentral` (`alertRegistry.js:1048`) avalia o registro ao vivo, corta em 50 linhas (`:1032`), entrada com erro
>   não derruba as outras. Rota `GET /api/almoxarifado/alertas/central` (`routes/almoxarifado/extended.js:2321`), `auth` +
>   `requirePermission('ver_alertas')`; `ver_alertas` = ADMINISTRADOR, ALMOXARIFE, GESTOR, COMPRAS (`permissions.js:169`). **Sem rota nova.**
> - **Varredura/notificação:** `notificationQueueService.varrerAlertasRegistrados` (`:580`) itera o mesmo registro; toggle mestre
>   `alertas_estoque_notificar_email`, destinatários `alertas_estoque_emails`; `enfileirar` com `hash_dedupe = sha256(evento|dedupe_chave)`
>   e `INSERT OR IGNORE` (`:42`, `:64`). Job B diário em `routes/almoxarifado.js:5113-5123` (30 s depois do boot e a cada 24 h).
> - **Configuração:** semente em `schema.js:3036-3057` (array, `INSERT OR IGNORE` em `:3058`; `alerta_reserva_parada_dias` em `:3038`);
>   validação de dias no `PUT /configuracoes` pelo prefixo `alerta_` (`routes/almoxarifado.js:3410`, `PREFIXOS_DIAS`) — a chave nova
>   nasce coberta. Tela: lista fixa `CAMPOS` em `client/src/components/almoxarifado/ConfiguracoesAlmoxarifado.js` (`:3561` é a linha
>   da reserva parada; `:3571`, `:3577` as da NC) e o mesmo guard de prefixo no cliente (`:3636`). A fixture de
>   `ConfiguracoesGerais.test.js:81-97` tem de ganhar a chave (lição da 46: sem ela, os testes de Salvar caem).
> - **Tela da central:** `client/src/components/almoxarifado/AlertasAlmoxarifado.js`, `COLUNAS_POR_CHAVE` (`:88`; a da reserva parada em
>   `:125-131`, a da requisição atrasada logo acima), fallback `colunasGenericas` (`:353`); `formatData` (`:68`) já lê
>   `AAAA-MM-DD HH:MM:SS` como UTC.
> - **Custo de entrada nova, medido:** **12** asserções de contagem `15` em **6** arquivos — `alertaExecucaoPendente` (`:168`, `:189`),
>   `alertaNaoConformidade` (`:159`, `:172`), `alertaPedidoAtrasado` (`:180`, `:246`), `alertaPedidoParcial` (`:459`, `:462`, `:485`,
>   `:529`), `naoConformidadeIntegracao` (`:233`), `ncBecoIntegracao` (`:96`). A spec 20 dizia *"nove em cinco"* (medido na 46; a 46
>   mesmo acrescentou). Guarda de texto-fonte em `alertaReprovadoExecutado.api.test.js:116` (janela no corpo de uma função — não pega
>   a entrada nova se ela não citar `execucao_estado`).
> - **Molde de backfill pela auditoria:** `migrateBackfillConferenciaFinalizadaEm` (`schema.js:907-925`, Etapa 122), ledger
>   `schema_migrations_almoxarifado`, exportada para o teste (`:3132`). A auditoria grava `created_at DEFAULT CURRENT_TIMESTAMP`
>   (`schema.js:2581`, `audit.js:6`) — mesmo formato da coluna nova.
> - **Hora no corpo:** `diaLocal.instanteDoBancoNoFuso` (`server/services/diaLocal.js:60`) converte `AAAA-MM-DD HH:MM:SS` UTC para
>   Brasília.
> - **Banco local:** não há `.db` em `server/data/` desta árvore — **não** medi quantas requisições estão PRONTA hoje em produção nem
>   quantas têm a trilha `LIBERACAO_RETIRADA`. O backfill é escrito para os dois casos.
>
> **O que a "próxima tarefa detalhada" da 181 dizia e a medição desmente:**
> 1. *"`safeAlter`, ALTER no callback do CREATE — padrão do primeiro boot"* — **não vale aqui.** O `schema.js` do almoxarifado é
>    sequencial (`await safeAlter` depois do `CREATE`, molde `os_id` da 172 em `schema.js:2724`); o callback é o padrão do núcleo
>    (`server/index.js`). A coluna entra como `await safeAlter` ao lado de `os_id`.
> 2. *"zerar no B504 — esquecer de zerar ali faz o alerta mentir"* — **medido falso.** O alerta filtra `status = 'PRONTA_PARA_RETIRADA'`;
>    a requisição que voltou a `EM_SEPARACAO` sai do cartão pelo status, e a **única** porta de volta a PRONTA é a rota, que regrava a
>    coluna no mesmo UPDATE. Zerar só no B504 deixaria a coluna com significado torto (preenchida depois da entrega, vazia depois da
>    devolução). Decisão: a coluna é **"a última liberação"** (como `data_aprovacao`), nunca zerada; o que protege é o teste de
>    escritor único (RN-182.02). Letra B.
> 3. *"linhas antigas NULL: fallback lido da auditoria; sem ela, fora do alerta"* — trocado por **backfill de uma vez** (molde 122): a
>    leitura fica numa coluna só. E a requisição sem trilha **não** fica fora: fora do alerta = invisível para sempre, que é exatamente
>    a caixa esquecida. Usa `updated_at` — enquanto ela está PRONTA, `updated_at` ≥ o instante da liberação (a liberação o grava), então
>    o alerta pode chegar **atrasado**, nunca **cedo**. Letra B.
> 4. Linhas: `:~4560`/`:~4609` (rota), `:~2424` (B504), `:~564` (RESERVA_PARADA), `:~5116` (job), `:~3561` (tela) — **conferem**.

## Regras

| ID | Regra | Cenário / mensagem literal |
|---|---|---|
| RN-182.01 | **Coluna da liberação:** `requisicoes_almoxarifado.pronta_para_retirada_em DATETIME` (`await safeAlter`, ao lado de `os_id`). Gravada **no mesmo UPDATE** da liberação: `SET status='PRONTA_PARA_RETIRADA', pronta_para_retirada_em=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP` — nunca num segundo UPDATE (a trava por requisição e o compare-and-set de `:4609` continuam os mesmos). A resposta da rota **não** muda (`{ success: true, status: 'PRONTA_PARA_RETIRADA' }`). | Liberar → a coluna tem o instante; a perda do compare-and-set (409 `A requisição mudou enquanto era liberada para retirada; recarregue e confira antes de liberar.`) **não** grava a coluna. |
| RN-182.02 | **Escritor único, nunca zerada:** a coluna é a última liberação. O B504, a entrega e a exclusão **não** a tocam (saem do cartão pelo status/`ativo`). Teste de texto-fonte (molde `alertaReprovadoExecutado.api.test.js:286`): em `server/routes` + `server/services`, exatamente **um** `SET status\s*=\s*'PRONTA_PARA_RETIRADA'` e ele contém `pronta_para_retirada_em`; exatamente **um** escritor de `pronta_para_retirada_em` fora do `schema.js`. | Liberar (T0) → B504 → reliberar (T1) → a coluna vale T1. |
| RN-182.03 | **Backfill de uma vez** (`migrateBackfillProntaParaRetiradaEm`, ledger `backfill_pronta_para_retirada_em`, exportada): para requisição `status='PRONTA_PARA_RETIRADA'` com a coluna `NULL`, `COALESCE((SELECT MAX(a.created_at) FROM auditoria_log_almoxarifado a WHERE a.entidade='requisicao' AND a.entidade_id=r.id AND a.acao='LIBERACAO_RETIRADA'), r.updated_at)`. Só PRONTA (as outras não entram no alerta — não inventar data que nada lê). Re-executar é inofensivo. Log `✅ Migração backfill_pronta_para_retirada_em aplicada (<n> requisição(ões) pronta(s) para retirada)` quando `changes > 0`. Chamada **depois** do `safeAlter` da coluna. | (a) com duas trilhas → a mais recente; (b) sem trilha → `updated_at`; (c) EM_SEPARACAO com trilha → continua `NULL`; (d) segunda execução não muda nada. |
| RN-182.04 | **Entrada do registro** `SEPARADO_AGUARDANDO_RETIRADA` (a **16ª**, no **fim** do array — não desloca nenhuma), `titulo: 'Separado aguardando retirada'`, `descricao: 'Requisições liberadas para retirada há mais dias que o configurado e ainda não retiradas.'`, `configDias: { chave: 'alerta_retirada_parada_dias', default: 3 }`. `listar` com **colunas nomeadas**: `r.id, r.numero, r.solicitante_nome, r.setor, r.os_referencia, r.status, r.pronta_para_retirada_em, CAST(julianday('now') - julianday(r.pronta_para_retirada_em) AS INTEGER) AS dias_aguardando`, `(SELECT COUNT(*) FROM itens_requisicao_almoxarifado i WHERE i.requisicao_id = r.id AND ROUND(COALESCE(i.quantidade_separada,0) - COALESCE(i.quantidade_entregue, i.quantidade_atendida, 0), 6) > 1e-9) AS itens_na_caixa`; `WHERE r.status = 'PRONTA_PARA_RETIRADA' AND COALESCE(r.ativo,1) = 1 AND r.pronta_para_retirada_em IS NOT NULL AND julianday('now') - julianday(r.pronta_para_retirada_em) > ?`; `ORDER BY r.pronta_para_retirada_em ASC, r.id ASC`. Exportar `listarSeparadoAguardandoRetirada`. | 3 dias e 1 h → entra; 2 dias e 23 h → não; B504 → sai; entrega parcial (→ PARCIALMENTE_ATENDIDA) → sai; entrega total → sai; `ativo=0` → sai; coluna `NULL` → não entra. |
| RN-182.05 | **Dedupe por liberação:** `dedupeChave: retirada-parada-<id>-<pronta_para_retirada_em>`; `payload: { requisicao_id }`. Um e-mail por liberação; a varredura do dia seguinte é `DUPLICADA`; reliberar (instante novo) avisa de novo. | Varrer 2× → 1 enfileirada + 1 duplicada; B504 + reliberar + envelhecer → 2ª enfileirada. |
| RN-182.06 | **Configuração:** semente `['alerta_retirada_parada_dias', '3', 'Dias com a requisicao liberada para retirada (caixa separada parada) para alertar']` no array de `schema.js:3036+`. O `PUT /configuracoes` já valida pelo prefixo `alerta_`: `'0'` → 400 `Configuração "alerta_retirada_parada_dias" deve ser um número de dias maior que zero`. **Default 3 dias corridos é palpite** (não veio da empresa) — letra B. | Config `5` → a requisição de 4 dias sai do cartão; `'0'` → 400 literal. |
| RN-182.07 | **Textos:** `assunto: [Almoxarifado] Separado aguardando retirada — <numero>`; `corpo` (uma linha cada): `Requisição: <numero>`, `Solicitante: <solicitante_nome>`, `Setor: <setor ou ->`, `OS: <os_referencia ou ->`, `Itens na caixa: <itens_na_caixa>`, `Liberada para retirada em: <instanteDoBancoNoFuso(pronta_para_retirada_em)>` (hora de Brasília), `Aguardando há: <dias_aguardando> dia(s)`. Escape linha a linha já é da varredura. | Liberada `2026-10-19 01:30:00` UTC → corpo `2026-10-18 22:30:00`. |
| RN-182.08 | **Permissão e canal sem mudança:** a central continua `ver_alertas`; a varredura usa o toggle `alertas_estoque_notificar_email` e `alertas_estoque_emails`. Sem rota nova, sem ação nova em `ACAO_PERFIS`. (O `solicitante_nome` já chega aos mesmos perfis por `REQUISICAO_ATRASADA`, que devolve `r.*`.) | PRODUCAO → 403 na central (já provado; um cenário confirma que o cartão não abre a porta). |
| RN-182.09 | **Front:** `COLUNAS_POR_CHAVE.SEPARADO_AGUARDANDO_RETIRADA` = Requisição (`numero`), Solicitante, Setor, OS, Itens na caixa, Liberada em (`formatData(pronta_para_retirada_em)`), Dias (`dias_aguardando`). Configurações: linha nova em `CAMPOS` depois da reserva parada — `{ chave: 'alerta_retirada_parada_dias', label: 'Alerta de Retirada Parada (dias)', tipo: 'number', descricao: 'Dias com a requisição liberada para retirada sem ninguém buscar para gerar alerta de caixa parada' }`; fixture de `ConfiguracoesGerais.test.js` com a chave. | `'0'` no campo → a mensagem do guard do cliente (a mesma do 400) e nenhum PUT. |

## Contratos congelados

- **`PUT /api/almoxarifado/requisicoes/:id/liberar-retirada`** — payload, resposta e recusas **inalterados**: 404 `Requisição não
  encontrada`; 400 da máquina (`check.erro`); 400 `Nenhum item separado`; a recusa da segunda conferência
  (`assertConferidaSeObrigatorio`); 409 `A requisição mudou enquanto era liberada para retirada; recarregue e confira antes de
  liberar.`. Efeito novo: `pronta_para_retirada_em` gravada.
- **`GET /api/almoxarifado/alertas/central`** (`ver_alertas`) — `alertas[]` ganha o 16º cartão, no fim:
  `{ chave: 'SEPARADO_AGUARDANDO_RETIRADA', titulo: 'Separado aguardando retirada', descricao: '…', dias: <n>, total, linhas: [{ id,
  numero, solicitante_nome, setor, os_referencia, status, pronta_para_retirada_em, dias_aguardando, itens_na_caixa }] }`. Erro no
  `listar` → `{ chave, titulo, erro: true, total: 0, linhas: [] }` (já é do motor).
- **Fila** — `evento: 'SEPARADO_AGUARDANDO_RETIRADA'`, `dedupe_chave: 'retirada-parada-<id>-<pronta_para_retirada_em>'`,
  `payload: {"requisicao_id": <id>}`.
- **`PUT /api/almoxarifado/configuracoes`** — aceita `alerta_retirada_parada_dias` (semeada); inválida → 400 literal da RN-182.06.

## Tasks

| # | Task | Tipo | Depende |
|---|---|---|---|
| T1 | RN-182.01..03: coluna, gravação no UPDATE da liberação, backfill com ledger (exportado), guarda de escritor único. Testes `retiradaParadaColuna.api.test.js`: liberar grava; o 409 não grava (perda do compare-and-set provocada por escritor direto); B504 → reliberar → instante novo; backfill (a)–(d); primeiro boot em banco vazio (`CRM_DATA_DIR` vazio) sobe com a coluna. Controle positivo em cada um (coluna fora do UPDATE; `MIN` no lugar do `MAX`; sem o filtro de status no backfill; segundo `SET status='PRONTA…'` plantado → guarda vermelha). | **tronco** | — |
| T2 | RN-182.04..08: entrada no registro, semente da config, as **12** asserções de contagem (15 → 16, com o comentário da etapa em cada uma). Testes `alertaRetiradaParada.api.test.js`: régua (3 d 1 h entra, 2 d 23 h não, config 5 muda), saídas (B504, entrega parcial, entrega total, `ativo=0`, coluna `NULL`), dedupe (2 varreduras; reliberar → nova), corpo literal com a hora de Brasília, `itens_na_caixa`, central com 16 cartões e cartão na posição 16, PRODUCAO 403, `'0'` → 400 literal, erro no `listar` não derruba (já coberto — conferir). Controles: `>` virando `>=`, sem `ativo`, chave sem o instante, corpo sem a conversão de fuso. | **tronco** | T1 |
| T3 | RN-182.09 (front): `COLUNAS_POR_CHAVE`, linha em `CAMPOS`, fixture de `ConfiguracoesGerais.test.js`. Jest: o cartão com as 7 colunas e a data em `dd/mm/aa` (fixture `2026-10-19 01:30:00` → `18/10/26`); o campo aparece com o valor, `'0'` barra no cliente, `'7'` vai no PUT. Mock só na fronteira HTTP. `CI=true build`. | **galho** (contra o contrato acima; paralela à T2) | contrato |
| T4 | **Integração pela rota e pelo serviço** (`retiradaParadaIntegracao.api.test.js`): requisição real → aprovar → separar → `PUT liberar-retirada` → envelhecer a coluna (UPDATE de teste) → `GET central` mostra → `varrerAlertasRegistrados` enfileira 1 → `PUT devolver-separado` (rota) → some → separar e liberar de novo → envelhecer → enfileira a **2ª** (dedupe novo) → `entregar` parcial → some. E o mesmo B504 chamado **pelo serviço** (`requisitionService.devolverSeparado`) tira do cartão. | **integração** | T2, T3 |
| T5 | Fechamento (`fechar-etapa`): spec 20 (item `:54` marcado com hash; `:164` "agora é UMA" lacuna; o custo "nove em cinco" corrigido para doze em seis, dizendo que estava errado), spec 05 (a entrega do aviso), mapa, guia, manual, novidades (letras B abaixo), este plano. | tronco | T4 |

## Decisões reversíveis (letra B — numerar no fechamento, a partir de B1189)

- **Default 3 dias corridos** — palpite (sem dado da empresa); dias corridos como `RESERVA_PARADA` (descartado: dias úteis — não há
  calendário de expediente no sistema). Muda-se pela tela.
- **Backfill com `updated_at` quando falta a trilha** (descartado: deixar fora do alerta — a caixa sem trilha ficaria invisível para
  sempre; descartado: fallback na leitura — duas fontes na régua). Risco residual declarado: se a **última** liberação perdeu a auditoria
  e uma anterior a teve, o `MAX` da trilha é mais velho que a liberação real e o alerta pode vir cedo (só legado; a auditoria best-effort
  raramente falha).
- **A coluna não é zerada** (descartado: zerar no B504 — medido desnecessário, ver Fase 0 item 2).
- **Entrega parcial a partir de PRONTA sai do alerta** (descartado: cobrar `PARCIALMENTE_ATENDIDA` com caixa — não há a data de quando o
  resto da caixa ficou parado, e o status não é mais "liberada para retirada"). O resto continua visível na fila de separação.
- **Cartão no fim do registro** (descartado: ao lado de `RESERVA_PARADA` — deslocaria a ordem da central sem ganho).

## Fora do escopo (letra D)

- Consumo acima do previsto (a outra lacuna da 20 — depende da 22).
- Aviso ao **solicitante** (hoje o canal é a lista `alertas_estoque_emails`; avisar quem pediu seria canal novo).
- Localização virtual "Aguardando retirada" (spec 05 `:66`, exige estender `TIPOS_LOCALIZACAO`).
- Link do cartão para a requisição (a central não tem link em nenhum cartão hoje).

## Execução

- [x] **T1** — `4ed84488`. Coluna `pronta_para_retirada_em` (`await safeAlter` ao lado de `os_id`), gravada no UPDATE da
  liberação; **trigger** `trg_requisicoes_pronta_para_retirada_em` (`AFTER UPDATE OF status … WHEN NEW.status = 'PRONTA_PARA_RETIRADA'
  AND OLD.status IS NOT 'PRONTA_PARA_RETIRADA'`) como escritor único (M1); backfill `migrateBackfillProntaParaRetiradaEm`
  (ledger, exportado), chamado entre o `safeAlter` e o `CREATE TRIGGER`. Teste `retiradaParadaColuna.api.test.js`, 9 casos (inclui
  o primeiro boot com `CRM_DATA_DIR` vazio, por `spawn` do `index.js`, conferindo coluna + trigger + ledger no arquivo).
  Controles (7, todos vermelhos na asserção certa, restaurados por cópia + `cmp`): trigger inerte (`WHEN 0 AND …`), trigger inerte
  + coluna fora do UPDATE da rota, `MIN` no lugar de `MAX`, backfill sem filtro de status, `<>` no `WHEN` (status NULL antigo),
  B504 zerando a coluna, gravação antes do compare-and-set (o 409 grava). **Divergências:** (1) a guarda por texto-fonte da RN-182.02
  foi **substituída** pelo trigger (M1) — o teste prova o `SET status=?` paramétrico; (2) tirar só a coluna do UPDATE da rota fica
  **verde** (o trigger cobre — por desenho); (3) renomear o trigger não é controle (ele continua ativo com outro nome) — o primeiro
  controle tentado assim ficou verde e foi trocado pelo `WHEN 0`. Suíte `test:api` 521/521.
- [x] **T2** — `1e6677be`. Entrada `SEPARADO_AGUARDANDO_RETIRADA` (16ª, no fim), `listarSeparadoAguardandoRetirada` exportada,
  semente `alerta_retirada_parada_dias = 3`. Teste `alertaRetiradaParada.api.test.js`, 12 casos. **Contagens 15 → 16: 13 asserções
  em 6 arquivos, não 12** — a 13ª, que o plano não listou, é `alertaPedidoParcial.api.test.js` (11) `semCompras.length` 13 → 14 (as
  entradas que só leem tabela do almoxarifado; ela entra nessa conta). Cada uma com o comentário da etapa. Controles: janela um dia
  mais curta (2 d 23 h entra), sem `ativo`, chave sem o instante, corpo sem `instanteDoBancoNoFuso`, sem filtro de status, fallback
  de data na leitura (`COALESCE(coluna, updated_at)`). **Divergências:** (1) o controle "`>` virando `>=`" **não é detectável** com
  relógio real (os dois só diferem no instante exato) — trocado pelo da janela mais curta; (2) o caso "coluna NULL não entra" passava
  com o fallback de leitura porque a requisição era nova — **endurecido** com `created_at`/`updated_at` antigos; (3) a fila não tem
  coluna `dedupe_chave` (só `hash_dedupe`) — o teste mede a chave pelo hash escrito à mão. Suíte `test:api` 522/522.
- [x] **T3** — `ee4aabcb`. `COLUNAS_POR_CHAVE.SEPARADO_AGUARDANDO_RETIRADA` (7 colunas), linha em `CAMPOS` depois da reserva parada,
  fixture de `ConfiguracoesGerais.test.js`. Jest: cartão (7 cabeçalhos e as 14 células, `2026-10-19 01:30:00` → `18/10/26`,
  travessão sem setor/OS), campo com `3`, `'0'` barrado sem PUT, `'7'` no payload. Controles: data sem o `Z` (vira `19/10/26`), setor
  sem travessão, campo fora de `CAMPOS`. O primeiro teste do cartão (título/janela/badge) passa sem a entrada (o fallback genérico já
  desenha o cartão) — é proteção de contrato, não de comportamento novo. Client 180 suítes / 2359 testes; `CI=true build` ok.
- [x] **T4** — `eb8b8f32`. `retiradaParadaIntegracao.api.test.js`, 2 cenários: (A) pela rota, cada gesto até a entrega
  parcial, com 1 e depois 2 linhas na fila; (B) o B504 pelo serviço. Material não crítico (M5). Controles: B504 sem voltar o status
  (A e B vermelhos), chave sem o instante (A vermelho na 1ª varredura: a fila não tem a chave com o instante), trigger inerte + rota
  sem a coluna — este ficava **verde** na primeira versão (o "envelhecer" do teste grava a coluna por cima) e foi **endurecido**:
  depois de cada liberação pela rota a coluna tem de estar a menos de 60 s de agora.
- **Verificação final (depois da T4):** `test:api` 523/523 arquivos; `test:almoxarifado` 44/44; `test:validation` 4/4;
  `test:safealter` 3/3; `test:sqlite` 16/16; client 180 suítes / 2359 testes; `CI=true build` compilou. Uma suíte por vez.

## Próxima tarefa detalhada

_(placeholder — escrever no fechamento: reler o mapa `specs/modulo-almoxarifado/README.md` pelas 🟡 que não dependem da empresa — 05,
06, 01, 23 — e medir antes de prometer.)_

---

## Revisão da Fase 2 (2026-10-22) — 0 críticos, 2 importantes, 5 menores; as emendas PREVALECEM

- **I1 — teste de reliberação não pode passar vazio:** antes de reliberar, envelhecer a coluna para um valor fixo antigo
  (ex.: `'2026-01-01 00:00:00'`) e afirmar que, depois, ela **mudou** e ficou a menos de 60 s de agora.
- **I2 — chave de dedupe com resolução de segundo:** nos testes, envelhecer cada liberação para um valor **diferente**;
  registrar na RN-182.05 que duas liberações no mesmo segundo compartilham a chave (efeito: um e-mail a menos — aceito,
  letra B).
- **M1 — escritor único por TRIGGER, não por texto-fonte:** trigger SQLite `AFTER UPDATE OF status ON
  requisicoes_almoxarifado WHEN NEW.status = 'PRONTA_PARA_RETIRADA' AND OLD.status <> 'PRONTA_PARA_RETIRADA'` que grava
  `pronta_para_retirada_em = CURRENT_TIMESTAMP` — pega qualquer caminho, inclusive o paramétrico e o que testes semeiam.
  A rota continua gravando no mesmo UPDATE (redundante e inofensivo). Letra B (descartado: guarda por varredura de
  texto, que não vê `SET status=?`).
- **M2 —** o controle positivo da migração roda o UPDATE **sem** o ledger (ou apaga a linha do ledger e reexecuta).
- **M3 —** o 409 da T1 (perder o compare-and-set duas vezes) por stub em `requisitionService.carregarItensRequisicao`
  que insira uma rodada a cada tentativa.
- **M4 —** um e-mail **por liberação** (a caixa parada 30 dias recebe um só) — letra B (descartado: repetir a cada N dias).
- **M5 —** a T4 usa material **não crítico** (o B504 limpa a conferência, B505; com crítico a reliberação recusaria).
