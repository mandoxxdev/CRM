# Etapa 163 (Operacional e Almoxarifado): editar uma atividade sem apagar o fim (C407) e as validades e prazos no dia de Brasília (C406) — plano

> Origem: "Próxima tarefa detalhada — Etapa 163" do plano da 162
> (`docs/superpowers/plans/2026-10-19-almoxarifado-etapa162-o-dia-de-brasilia-nos-relatorios-e-nas-reservas.md`). Etapa de consertos
> técnicos; o design, com a Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-20): última B **B1039**, último C **C407**,
> última A **A103**. Esta etapa: **B1040+**, **C408+**, **A104+**. Worktree `CRM-wt-e163`, branch `etapa-e163` (da main `04fc2495`).
>
> **Fase 2 (um revisor fresco, só leitura, ANTES do código): 0 Critical, 3 Important, 9 Minor — todos aceitos; o plano abaixo já está
> corrigido.** Conferido por sonda: o relógio adiantado no próprio processo com o `createTestApp` funciona (a); HOJE = último dia do mês
> seguinte dá três dias e dois meses diferentes (b, `hojeLocal 2026-11-30 · utcJS 2026-12-01 · sqlite 2026-10-20`); o `:1851` é morto (c);
> o `undefined` dá `NOT NULL` e o `''` passa (d); o formulário de edição não é alcançável (e). **I1** com o relógio adiantado só no
> JavaScript, as réguas em SQL (`date('now')` = o dia real, semanas antes de HOJE) erram para o lado **oposto** ao da produção: só o lado
> HOJE−1 (e os números) pega a volta ao `date('now')`; nas réguas em JS (`toISOString` = HOJE+1), só o lado HOJE pega — entra a tabela
> "qual borda pega qual sabotagem" (T2) e a prova de cada uma. **I2** o salto de semanas move toda régua `Date.now()` do processo (o
> *Estoque sem consumo*, o `maisVelhoQueDias`) — as chaves mensais/semanais são provadas pela `dedupeChave` do registro, não pela listagem
> do alerta (ponto de atenção 5). **I3** a chave do lembrete e o filtro dele (e os dois `?` da remessa) leriam o relógio duas vezes — o
> `hoje` é calculado **uma vez** e passado. **Minor:** a B1044 descrevia errado o efeito (a chave UTC não dá aviso a mais: dá o aviso do
> período seguinte 3 h antes) e a mesma classe vale para a `semanaIso` do *Material sem endereço* (entra); a nota do deploy da B1041; o
> `dias_vencido` sem asserção em lugar nenhum; a lista dos testes antigos exagerava (corrigida na Fase 0); a corrida do `disponivel` (o
> `UPDATE colaboradores` roda depois do `res.json`, sem espera — o teste relê até assentar); o `tipo_atividade: null` presente continua 500
> e o `''` passa (RN-163.01); os comentários que ficam falsos (T3); a medição pela rota (é alcançável no harness); e a mesma classe fora do
> Almoxarifado (Frotas, Financeiro) nomeada na C409.

## Fase 0 — medido (antes de qualquer código)

Lido no código nas linhas citadas (o condutor, sem leitores em paralelo — a lista da 162 já apontava os arquivos; a medição aqui conferiu e
completou). Base `test:api` rodada antes de qualquer código (`scratchpad/e163/base-api.log`).

**C407 — a atividade editada.** `PUT /api/operacional/atividades-colaboradores/:id` (`index.js:21557-21585`, portão `checkModulePermission('operacional')`,
sem perfil) grava **todas** as seis colunas sempre: `tipo_atividade = ?` (cru), `descricao || null`, `status || 'em_andamento'`,
`data_fim || null`, `horas_reais || null`, `observacoes || null`. Quem chama o PUT (medido no navegador, `grep atividades-colaboradores`):

1. **`AtividadeForm.js:77`** (editar) manda o `formData` — `colaborador_id`, `os_id`, `item_id`, `tipo_atividade`, `descricao`, `data_inicio`,
   `horas_previstas`, `observacoes` — e **nenhum** de `status`/`data_fim`/`horas_reais`: o PUT volta o status a `em_andamento` e zera o fim e
   as horas reais. **Mas o formulário de edição não é alcançável pela tela:** `AtividadesColaboradores.js` só faz `setSelectedAtividade(null)`
   (`:88`, *Nova Atividade*) — não existe botão *Editar* na lista (a coluna *Ações* só tem *Finalizar*, e só para `em_andamento`, `:121-126`).
   O formulário com `atividade` só monta no teste (`Etapa161Fabrica.test.js:281`). **A spec da 162 dizia "o formulário de edição não manda
   nenhum dos três" como se o gesto existisse — o gesto não existe hoje; o defeito é da rota** (qualquer chamador que mande parte dos campos
   apaga o resto). Corrigido no C407 reescrito.
2. **`AtividadesColaboradores.js:49`** (*Finalizar*) manda `{ ...atividade, status: 'concluida', data_fim: new Date().toISOString() }` — a
   linha inteira da lista; não perde nada (o `horas_reais` vai como estava, nulo).

E mais, medido no mesmo PUT: (a) o `tipo_atividade` ausente vai como `undefined` → `NULL` na coluna `NOT NULL` (`index.js:19443`) → **500**
`SQLITE_CONSTRAINT` (o PUT só com `{ status: 'concluida' }` falha); (b) o PUT **ignora** `os_id`, `item_id`, `data_inicio`, `horas_previstas` e
`colaborador_id` que o formulário manda (responde *"Atividade atualizada com sucesso"* sem mudá-los); (c) o `UPDATE colaboradores SET
disponivel = 1` (`:21576-21580`) só roda quando o corpo traz `status` `concluida`/`cancelada` e o colaborador não tem outra em andamento — o
PUT que volta o status a `em_andamento` (o caso 1) **não** marca o colaborador como ocupado de novo. (b) e (c) ficam fora (C408, abaixo).
Nenhum teste do servidor toca essas rotas (`grep -rl atividades tests/` = 0).

**C406 — as datas sem hora que ainda comparam com o dia UTC** (todas colunas `DATE`/só data, gravadas pelo `type="date"` do navegador; o
`date('now')` e o `toISOString().slice(0, 10)` dão o dia UTC — das 21h à meia-noite de Brasília, o de amanhã):

| Onde | Linha | O que decide | Efeito das 21h à meia-noite |
|---|---|---|---|
| `toolService.calibracaoVigente` | `:62` | `date(data_validade) >= date('now')` — **bloqueia** o empréstimo (`:72`, 400) e a medição na inspeção (`inspectionService.js:124`, 400); o selo `calibracao_vigente` da lista (`:421`) | a calibração que vale até hoje já é vencida: empréstimo e medição recusados |
| `toolService.listarEmprestimos` (`vencidos=1`) | `:450` | `date(data_prevista_devolucao) < date('now')` | o empréstimo que volta hoje já é atrasado |
| `toolService.painelCalibracoes` | `:512` | `dias_restantes = julianday(validade) − julianday(date('now'))` — painel `GET /calibracoes/painel` e o alerta *Calibração vencendo* | um dia a menos; a de hoje sai *vencida* (−1) |
| `toolReminderService.listarEmprestimosVencidos` | `:18`, `:23` | o lembrete por e-mail (`dias_vencido` e o filtro) | o de hoje já recebe lembrete |
| `notificationQueueService.varrerLembretesFerramenta` | `:444` | a chave do dedupe `ferramenta-lembrete-<id>-<hoje UTC>` (de propósito UTC para casar com o `date('now')` acima — comentário `:435`) | — (tem de andar junto com a linha acima) |
| `lotService.isVencido` (padrão do `hoje`) | `:26` | **porta de saldo:** o motor recusa a saída de lote vencido (`stockService.js:1544`) e a separação da requisição com lote (`requisitionService.js:950`); a liberação do vencimento recusa lote não vencido (`lotService.js:172`) | o lote que vence hoje já não sai (e já pode ser "liberado") |
| `lotService.listarLotesDoMaterial` | `:216` | os selos `vencido`/`elegivel` da lista de lotes (`GET /materiais/:id/lotes`) | o de hoje aparece vencido, não elegível |
| `notificationQueueService.varrerLotesVencendo` | `:500` | `date(validade) <= date('now', '+N days')` (sem piso — inclui vencidos) | o teto anda um dia |
| `thirdPartyService.listarRemessas` | `:335`, `:343` | `date(prazo_previsto) < date(COALESCE(?, 'now'))` — o selo `vencida`, o filtro `vencidas=1`, a rota `GET /remessas-terceiros/vencidas` e o aviso `varrerRemessasVencidas` | a remessa de prazo hoje já é vencida |
| `alertRegistry.mesAtual` | `:76-78` | a chave do dedupe mensal de *Estoque sem consumo*, *Estoque excessivo* e *Lote sem certificado* | no último dia do mês, das 21h, a chave já é do mês seguinte: o aviso do mês seguinte sai 3 h antes |
| `alertRegistry.semanaIso` (Fase 2 M1) | `:81-88` | a chave semanal do *Material sem endereço* | no domingo, das 21h, a chave já é da semana seguinte (o mesmo efeito, por semana) |
| `receiptService.gerarContaPagar` | `:1851` | `data_vencimento = data_entrada_nf \|\| <hoje UTC>` | **inalcançável**: `validarDadosProcessamento` (`:1387`, chamado em `:1946` antes) recusa o processamento sem `data_entrada_nf` — a 162 a listava como defeito vivo; **estava errado**, é um padrão morto |

**Portas de saldo e trava:** só o `isVencido` toca saldo (a saída e a separação recusam lote vencido). A trava (CLAUDE.md) não muda: a saída
avulsa e a separação **não** pegam a trava (declarado, D (91)); o que muda é só a data que o `isVencido` usa por padrão. Nenhuma porta de
permissão muda.

**Os testes que calculam *hoje* em UTC nesses fluxos** (medido por `grep` cruzando as colunas com `date('now')`/`toISOString().slice`/`Date.now`):
`alertaRegistro` (`diasAtras(1)` e `diasAFrente(40)` UTC na calibração e no lote; `mesAtual` UTC), `alertaJornada` (`diasAtras(1)` da
calibração), `alertaEvento` (`mesAtual` UTC), `alertasNovos` (validade e prazo por `Date.now ± N dias` UTC; o pior: `validadeOntem` e os de
+3/+5 dias), `toolCalibracao` (`date('now','-1 day')` = vencida, `date('now')` = vence hoje), `toolEmprestimo` (`date('now','±1 year')` — longe,
não muda), `toolEmprestimoVencido` (`isoOntem`/`isoAmanha` por `setDate` local + `toISOString` UTC), `medidasInspecao` (`date('now','-1 days')`
= vencida), `notificacaoDividas` (a chave `ferramenta-lembrete-<id>-<hoje UTC>`). Os de lote e de remessa usam datas fixas longe (`2020-01-01`,
`2030-…`, `2099-01-01`) — não mudam. **Corrigido pela Fase 2 (M4):** depois da mudança, caem de verdade entre 21h e meia-noite só
`toolCalibracao:131` e `:162`, `medidasInspecao:117`, `toolEmprestimoVencido:34-41` e `notificacaoDividas:98`; `alertasNovos` (folgas ≥ 2
dias; o vencendo sem piso inclui o `validadeOntem` de qualquer jeito) e `alertaRegistro`/`alertaJornada` (a calibração de 0 dia entra pelo
`a_vencer`) não caem. Os `mesAtual` UTC de `alertaRegistro`/`alertaEvento` passariam a discordar da produção no último dia do mês das 21h
à meia-noite — passam ao mês de Brasília (T3).

## Decisões (letra B — reversíveis)

- **B1040 — o PUT da atividade grava só o que veio (C407).** Escolhido: cada uma das seis colunas só entra no `UPDATE` se o campo **está no
  corpo** (`!== undefined`); presente, a regra de hoje vale (`status` vazio = `em_andamento`, `data_fim` vazio = nulo…). O recálculo da
  disponibilidade continua só com `status` presente `concluida`/`cancelada`. Corpo sem nenhum dos seis: só o `updated_at` muda (200, a mesma
  mensagem). **Os dados mudam:** editar uma atividade concluída sem mandar status/fim/horas não a reabre mais nem apaga o fim; o PUT só com
  `{ status }` deixa de dar 500. **Descartado:** fazer o formulário mandar os três (outro chamador parcial continuaria apagando); ligar um
  botão *Editar* na lista (é gesto novo — produto, P.O.); passar a gravar `os_id`/`data_inicio`/`horas_previstas` (muda o que o PUT faz — C408).
- **B1041 — as ferramentas no dia de Brasília (C406).** A calibração vigente (empréstimo, medição na inspeção, selo da lista), os dias
  restantes do painel e do alerta *Calibração vencendo*, o filtro *vencidos* dos empréstimos, o lembrete e a chave diária dele: o *hoje* é o
  `diaLocal.hojeLocalISO()`, como parâmetro (`?`), **sem** modificador (colunas só de data). **Os números mudam:** das 21h à meia-noite, a
  calibração que vale até hoje continua vigente (empresta e mede), o empréstimo que volta hoje não é atrasado, o painel conta um dia a mais.
  A chave do lembrete passa ao dia de Brasília **junto** com o filtro — o `hoje` calculado **uma vez** e passado ao filtro (Fase 2 I3).
  **No dia do deploy** (corrigido pela Fase 2 M2): só se a varredura anterior rodou **depois** das 21h (a chave UTC já era a de amanhã), o
  lembrete de amanhã é deduplicado por ela (sai um a menos, uma vez); antes das 21h, nada muda. **Descartado:** só a
  calibração (o painel diria *vencida* da que ainda empresta).
- **B1042 — a validade do lote no dia de Brasília (C406; porta de saldo — só a régua).** O padrão do `isVencido` passa ao
  `hojeLocalISO()`; a lista de lotes e o aviso *Lote vencendo* (`date(validade) <= date(?, '+' || ? || ' days')`) também. Nada mais muda na
  saída, na separação, na liberação, no status, na trava. **Os números mudam:** das 21h à meia-noite, o lote que vence hoje **ainda sai** para
  consumo e ainda não pode ter o vencimento liberado; o aviso de vencendo anda um dia para trás no teto. **Descartado:** não mexer (a lista de
  lotes e a tela de Reservas/162 discordariam do dia); passar a validade a instante (muda o formulário).
- **B1043 — o prazo da remessa a terceiro no dia de Brasília (C406).** `date(prazo_previsto) < date(?)` com `filtros.referencia ||
  hojeLocalISO()` (o `referencia` da rota continua o mesmo; ausente/vazio = hoje de Brasília; texto inválido continua sem vencida — o
  `date('abc')` nulo). **Os números mudam:** a remessa de prazo hoje não é vencida antes da meia-noite. A resposta da `/vencidas` continua
  com `referencia: <o da query> || null`.
- **B1044 — o mês dos avisos mensais e a semana do *Material sem endereço* no calendário de Brasília, e a conta a pagar morta.**
  `mesAtual()` = `hojeLocalISO().slice(0, 7)`; `semanaIso()` sobre o dia de Brasília. **Muda (a versão anterior deste plano dizia "um aviso a
  mais"; estava errado — Fase 2 M1):** no último dia do mês (no domingo), das 21h à meia-noite, a chave continua a do mês (da semana)
  corrente — o aviso do período seguinte deixa de sair 3 h antes. E o padrão da conta a pagar
  (`receiptService.js:1851`) passa ao `hojeLocalISO()` — **sem teste possível** (inalcançável pela validação do processamento, `:1387`/`:1946`):
  mantido na forma segura e declarado (a regra do defeito inalcançável da `fechar-etapa`). **Descartado:** apagar o padrão (se a validação
  um dia afrouxar, voltaria a gravar `undefined`).
- **B1045 — a próxima etapa (164).**

## Regras de negócio

- **RN-163.01 (C407)** — `PUT /operacional/atividades-colaboradores/:id`: cada coluna (`tipo_atividade`, `descricao`, `status`, `data_fim`,
  `horas_reais`, `observacoes`) só muda se o campo vier no corpo; o campo presente segue a regra de antes (`descricao`/`data_fim`/`horas_reais`/
  `observacoes` vazios = nulo, `status` vazio = `em_andamento`, `tipo_atividade` como veio — o `''` grava, o `null` presente continua **500**
  `SQLITE_CONSTRAINT` como antes, Fase 2 M6). Ausente (`=== undefined`) = continua o que estava.
- **RN-163.02 (C407)** — a disponibilidade do colaborador: como antes — só quando o corpo traz `status` `concluida` ou `cancelada`, e o
  colaborador não tem outra `em_andamento`, ele volta a disponível.
- **RN-163.03 (B1041)** — calibração vigente = existe calibração com `data_validade` **≥ hoje de Brasília**. Vale para o empréstimo (recusa:
  *"Ferramenta com calibração vencida ou sem calibração registrada"*, 400), para a medição na inspeção (*"Ferramenta com calibração vencida ou
  sem calibração registrada (<nome>)"*, 400) e para o selo `calibracao_vigente` da lista de ferramentas.
- **RN-163.04 (B1041)** — `dias_restantes` (painel e alerta) = `validade − hoje de Brasília` em dias; negativo = vencida; a de hoje = 0.
- **RN-163.05 (B1041)** — empréstimo vencido = `EMPRESTADA`, com data prevista, **anterior** ao hoje de Brasília (o filtro `vencidos=1`, o
  lembrete e o `dias_vencido`); a chave do lembrete = `ferramenta-lembrete-<id>-<hoje de Brasília>`.
- **RN-163.06 (B1042)** — lote vencido = `data_validade` **anterior** ao hoje de Brasília: a saída e a separação recusam (*"Lote <código>
  vencido em <validade> nao pode sair para consumo. Libere o vencimento do lote (PUT /api/almoxarifado/lotes/:id/liberar-vencimento) com
  justificativa, ou baixe por SUCATA/PERDA ou corrija por AJUSTE."*, 400); a liberação recusa o não vencido (*"Lote nao esta vencido; nao ha
  vencimento para liberar"*, 400); a lista marca `vencido`/`elegivel` pela mesma régua.
- **RN-163.07 (B1042)** — o aviso *Lote vencendo*: lote ATIVO, com saldo, sem liberação, de `data_validade ≤ hoje de Brasília + N` dias
  (`alerta_lote_vencendo_dias`); sem piso (vencidos entram).
- **RN-163.08 (B1043)** — remessa vencida = `ENVIADA`/`RETORNO_PARCIAL`, com prazo **anterior** ao dia de referência (o `referencia` da query
  ou o hoje de Brasília) — o selo, o filtro, a rota `/vencidas` e o aviso.
- **RN-163.09 (B1044)** — a chave mensal dos avisos *Estoque sem consumo*, *Estoque excessivo* e *Lote sem certificado* usa o mês de Brasília;
  a semanal do *Material sem endereço*, a semana ISO do dia de Brasília.

## Contratos (congelados)

- **`PUT /api/operacional/atividades-colaboradores/:id`** — mesmo portão, mesmo corpo (todos os campos opcionais), mesma resposta
  `{ message: 'Atividade atualizada com sucesso' }` (200), 404 `{ error: 'Atividade não encontrada' }`. Muda só RN-163.01 (e o corpo sem
  `tipo_atividade` deixa de dar 500).
- **`POST /api/almoxarifado/ferramentas/:id/emprestar`**, **`GET /ferramentas`**, **`GET /emprestimos`** (`vencidos=1`),
  **`GET /calibracoes/painel`**, a medição da inspeção — mesmas formas, códigos e mensagens; a data pela RN-163.03 a .05.
- **`POST /api/almoxarifado/movimentacoes`** (saída com lote), a separação da requisição, **`PUT /lotes/:id/liberar-vencimento`**,
  **`GET /materiais/:id/lotes`** — mesmas formas e mensagens; RN-163.06.
- **`GET /remessas-terceiros`**, **`GET /remessas-terceiros/vencidas`** (`referencia` opcional) — mesmas formas; RN-163.08.
- As varreduras (`varrerLembretesFerramenta`, `varrerLotesVencendo`, `varrerRemessasVencidas`, `varrerAlertasRegistrados`) — mesmo retorno;
  RN-163.05, .07, .08, .09.
- **Servidor:** nenhum utilitário novo — o `diaLocal.hojeLocalISO()` da 161. Em SQL, **parâmetro** (`?`), nunca interpolado; somar dias:
  `date(?, '+' || ? || ' days')`. **Sem** `modificadorDoFuso` (são colunas só de data — ponto de atenção 3). Nenhum código, mensagem ou
  parâmetro novo. **Navegador:** nada muda (a tela de Ferramentas já compara com o dia local, `FerramentasAlmoxarifado.js:417-425`).

## Tasks (sort topológico)

- [x] **T1 (tronco, servidor) — C407.** — `7bca3f13` (Fase 5: `407ddfcc`). O PUT parcial em `index.js`. Teste novo `server/tests/api/atividadeEditadaGuardaOFim.api.test.js`
  pelo `index.js` real em pasta vazia (molde `respostasVelhasEDiaLocal`): **reproduzir antes** (contra o código de hoje: criar → finalizar
  pelo corpo do *Finalizar* → editar com o corpo do formulário → o status volta a `em_andamento`, o fim e as horas somem; e o PUT `{ status:
  'concluida' }` dá 500); depois verde: o fim, as horas e o status ficam; o campo presente vazio continua zerando (`data_fim: ''` → nulo, a
  metade que prova que a presença ainda grava); a disponibilidade (RN-163.02) com o colaborador consultado antes e depois; o 404.
- [x] **T2 (tronco, servidor) — C406.** — `6502c690` (Fase 5: `407ddfcc`). RN-163.03 a .09 em `toolService.js`, `toolReminderService.js`, `notificationQueueService.js`,
  `lotService.js`, `thirdPartyService.js`, `alertRegistry.js`, `receiptService.js`. Teste novo
  `server/tests/api/validadesNoDiaLocal.api.test.js`, **no processo** (o `createTestApp`, rotas reais e `requirePermission` real), com
  `process.env.TZ = 'UTC'` e o `relogioAdiantado` instalado **no próprio processo** antes de qualquer `Date` (o `date('now')` do SQLite
  continua o real), o relógio nas **22h de Brasília do último dia do mês seguinte** (HOJE): o hoje de Brasília (HOJE), o dia UTC do JS
  (HOJE+1, **primeiro dia do outro mês**) e o `date('now')` (o real, semanas antes) são três dias e dois meses diferentes. Massa com as
  **duas bordas** de cada régua (HOJE fica de um lado, HOJE−1 do outro; no teto do vencendo, HOJE+N dentro e HOJE+N+1 fora) e números
  diferentes. Cenários pela rota onde há rota (emprestar, lista, painel, empréstimos vencidos, saída com lote, liberar, lista de lotes,
  remessas e `/vencidas` com e sem `referencia`), pelo serviço onde só há varredura (lembrete e a chave dele, lote vencendo, remessa
  vencida, as quatro chaves pela `dedupeChave` do registro — Fase 2 I2), e a medição da inspeção **pela rota** (alcançável no harness —
  Fase 2 M8). O `dias_vencido` do lembrete e o `dias_restantes` do painel com o número (Fase 2 M3).
  **Qual borda pega qual sabotagem (Fase 2 I1)** — no processo do teste, `date('now')`/`'localtime'` = o dia real (semanas antes de HOJE),
  `toISOString` = HOJE+1, o modificador na coluna = a véspera dela:

  | Régua | volta ao `date('now')` / `'localtime'` | volta ao `toISOString` | modificador na coluna |
  |---|---|---|---|
  | `>= hoje` (calibração vigente) | HOJE−1 vigente → pega o lado HOJE−1 | HOJE recusada → pega o lado HOJE | HOJE vira HOJE−1 → pega o lado HOJE |
  | `< hoje` (empréstimo, lote, remessa) | HOJE−1 não vencido → pega o lado HOJE−1 | HOJE vencido → pega o lado HOJE | HOJE vira HOJE−1 → pega o lado HOJE |
  | `dias_restantes` / `dias_vencido` | o número muda (semanas) | ±1 | ±1 |
  | `<= hoje + N` (lote vencendo) | HOJE+N fora → pega HOJE+N | HOJE+N+1 dentro → pega HOJE+N+1 | — |
  | mês / semana | — | o de HOJE+1 → pega a chave | — |

  Cada coluna é provada vermelha no controle positivo (a sabotagem aplicada, a asserção certa caindo).
- [x] **T3 (servidor, junto da T2, no mesmo commit)** — `6502c690` (6 arquivos; ver "Execução"). Os testes antigos que calculam *hoje* em UTC nesses fluxos passam ao dia de Brasília
  (a lista corrigida da Fase 0), cada mudança declarada aqui; os que não mudam, com o porquê. E os comentários que ficam falsos (Fase 2 M7):
  `schema.js:1328`, `inspectionService.js:27`, `notificationQueueService.js:431-437` e `:531`, `alertRegistry.js:75`, `toolService.js:447`,
  `medidasInspecao.api.test.js:113`, `toolEmprestimoVencido.api.test.js:5`.
- [x] **T4 (integração — cruza a régua nova com a porta de saldo; mora no arquivo da T2, não é cruzamento de galhos — Fase 2 Q3)** — `6502c690`: o mesmo
  lote de validade HOJE: aparece `elegivel` na lista, **sai** pela rota de movimentação, e a liberação o recusa como não vencido; o de HOJE−1:
  `vencido` na lista, a saída recusa com a literal, a liberação (perfil `inspecionar`; sem justificativa: 400 *"justificativa obrigatoria
  para liberar o vencimento do lote"*) aceita e então a saída passa. E a mesma ferramenta de calibração até HOJE: vigente na lista, dias restantes 0 no painel, empresta.

## Pontos de atenção

1. A trava de máquina: um `test:api` por vez (`scratchpad/trava-test-api.d`, `mkdir` atômico; quem pegou apaga).
2. Massa com as **duas bordas** de cada régua e números diferentes (as lições do r3 da 161 e da 162).
3. Coluna só de data: **nunca** o modificador; o hoje entra como `?`.
4. O `isVencido` é porta de saldo: muda só o padrão da data — a ordem das guardas (status antes de vencimento), as literais e a trava ficam.
5. O relógio adiantado no **próprio** processo do teste: só `new Date()`/`Date.now()` mudam (o helper); o `TZ = 'UTC'` antes do primeiro
   `Date`; guarda que derruba o teste se `hojeLocalISO()` não for HOJE ou se o dia UTC do JS for igual a ele. **O salto é de semanas**
   (Fase 2 I2): toda régua `Date.now()` do processo anda junto (o `maisVelhoQueDias`, o *Estoque sem consumo*) e o `CURRENT_TIMESTAMP` do
   SQLite fica semanas atrás — a massa não depende dessas réguas, e as chaves são provadas pela `dedupeChave`.
6. Nenhuma porta de permissão muda.
7. O `hoje` calculado **uma vez** por chamada e passado (o lembrete e o filtro; os dois `?` da remessa) — Fase 2 I3.

## Fora desta etapa (declarado)

- **C408 (novo)** — o formulário *Editar atividade* existe mas nenhuma tela o abre; e o PUT ignora OS, item, início, horas previstas e
  colaborador que o formulário manda (responde *atualizada* sem mudá-los); o PUT que reabre (`status: em_andamento`) não marca o colaborador
  ocupado; o *Finalizar* grava o fim em UTC com `Z` enquanto o início é o texto local, e as horas reais nunca são calculadas. Ligar a edição
  e decidir o que ela grava é produto (P.O.).
- **C409 (novo, Fase 2 M9)** — a mesma classe da C406 **fora do Almoxarifado**: os vencimentos de Frotas (`frotasService.js:457`, `:646`,
  `:664`, `:680`, `:702`, `:764`) e do Financeiro (`index.js:20027`) ainda comparam com `date('now')`. Não medidos a fundo nesta etapa — a
  C406 fecha só o Almoxarifado.

## Execução — o que divergiu do plano

- **A T1 reusou o `montarSetParcial`** (`server/atualizacaoParcial.js`, a régua de presença das propostas — "chave ausente nem entra no
  `UPDATE`") em vez da filtragem própria escrita primeiro: o mesmo comportamento, uma régua só. **Reproduzido antes do conserto** pela rota
  (contra `04fc2495`: 1 de 5 cenários verde — o 404; os outros caem: o status volta a *em andamento*, o fim e as horas somem, o PUT só com
  `{ status }` dá 500 `SQLITE_CONSTRAINT`). **Controle positivo:** com o filtro de presença desligado caem 5 de 6; com o vazio tratado como
  ausente cai o cenário do campo presente.
- **A T2 entrou com duas exportações** (`mesAtual` e `semanaIso` do `alertRegistry`, com `agora` opcional): a semana só difere da UTC no
  domingo das 21h, que o relógio da suíte não garante — a Fase 2 (I2) mandou provar as chaves pela `dedupeChave`, e a semana precisava de um
  instante fixo.
- **Controle positivo da T2:** contra os sete arquivos de produção de antes caem 9 de 10 (a guarda fica); 15 sabotagens na direção oposta
  (`toISOString`, o modificador na coluna, o `hoje` não repassado, a referência ignorada, o mês/semana UTC — `scratchpad/e163/sabota-t2.txt`)
  caem pela asserção do cenário delas.
- **T3 — os testes antigos mudados (6):** `toolCalibracao` (a validade relativa por `date(?, ±N)` com o hoje de Brasília — `:131`, `:133`,
  `:135`, `:162`), `medidasInspecao` (`:117`, e o comentário), `toolEmprestimoVencido` (`isoOntem`/`isoAmanha` pelo dia de Brasília, e o
  comentário), `notificacaoDividas` (o `diasVencido` contado do hoje de Brasília e a chave do lembrete), `alertaRegistro` e `alertaEvento` (o
  `mesAtual`). **Não mudam:** `toolEmprestimo` (validades a ±1 ano), `alertasNovos` (folgas ≥ 2 dias; o vencendo sem piso), `alertaJornada`
  (a calibração de 0 dia entra pelo `a_vencer`) e os de lote/remessa (datas fixas longe). **Rodados com o relógio adiantado para as 22h30 de
  Brasília** (TZ=UTC, `relogioAdiantado` por `-r`): os 6 mudados e os 3 que não mudam, verdes; e o controle — as versões de antes de
  `toolEmprestimoVencido` e `notificacaoDividas` **caem** nesse relógio. As de `toolCalibracao` e `medidasInspecao` de antes passam nele
  (dependem do `date('now')` do banco, que não se adianta): a mudança delas foi lida, não provada às 22h — declarado em F (163).
- **Paralelismo 0** (T1 e T2 eram independentes — Fase 2 Q3 —, mas pequenas; o condutor fez em sequência). Os comentários que ficavam falsos
  (Fase 2 M7) entraram nos dois commits.

## Fase 5 — revisão adversarial (três revisores frescos, em paralelo)

- **r1 (regra) — 0 Critical/Important; 3 Minor + 3 informativos, todos de antes da etapa.** Sondas executadas (o `index.js` real; TZ=UTC
  com o relógio às 22h de 31/12/2026): `horas_reais: 0` grava nulo (o `|| null` de sempre — a RN-163.01 manda manter); o PUT sem corpo /
  texto / array agora responde 200 sem gravar (coerente com a RN); o `referencia` das remessas não é validado (`now`, `2027-02-29`, ISO com
  fuso — já era assim). Informativos: a data legada `DD/MM/AAAA` discorda entre o lote (texto) e o SQL (nulo); o nome do PDF de etiquetas no
  dia UTC (cosmético, `client/src/utils/etiquetasPdf.js:176`); o lembrete a menos no dia do deploy (declarado). **Sem defeito:** nenhuma régua
  de validade/prazo só de data sobrou no dia UTC no Almoxarifado (servidor e navegador); `semanaIso`/`mesAtual` contra uma referência ISO
  independente em 16.420 instantes (2019–2033, três fusos): 0 divergência; o `date(?, '+N days')` nas viradas; o `hoje` lido uma vez.
- **r2 (autorização) — 0 achados.** O `index.js` real em pasta vazia na HEAD e na base, 15 usuários × 19 chamadas = 285 linhas: **0
  divergências de portão** (38 × 401, 68 × 403 nas duas); as 11 diferenças são o PUT parcial (500 → 200) para quem tem o Operacional — a
  própria C407, que serve de controle do comparador. O mapa do `montarSetParcial` é fixo (chaves estranhas, `__proto__`, nomes com SQL: 200
  sem mudar nada); nenhum valor do usuário chega ao `hoje` de uma régua de saldo; o 500 do `tipo_atividade: null` só vaza o que já vazava (e
  em menos casos).
- **r3 (sabotagem, worktree própria `CRM-wt-e163-r3`) — 73 sabotagens novas: 57 caíram pela asserção certa, 16 sobreviveram (15 faltas de
  asserção + 1 inalcançável, a conta a pagar), 2 controles.** As 15: `observacoes` vazia (A05); o `updated_at` (A19); a disponibilidade
  recalculada sempre ou com qualquer status (D03, D04); o id da atividade igual ao do colaborador (D07 — fragilidade: passava por acaso); os
  filtros combinados com o `hoje` fora de ordem nos empréstimos e nas remessas (B03, T06); a borda `dias = 30` do painel (B07); o
  `dias_vencido` e o `isVencido` com o hoje passado (R04, L02); o selo da remessa com a referência (T03); a referência vazia pelo serviço
  (T05); a remessa encerrada (T07); a semana ISO na sexta 01/01/2027 (G03, G04 — o comentário do teste chamava de sexta um instante que é a
  quinta à noite em Brasília).
- **Correção da Fase 5 (`407ddfcc`, só testes):** os 15 cenários. **Controles:** as 15 sobreviventes reaplicadas contra os testes novos caem
  todas pela asserção do cenário delas, e o controle grosseiro (o PUT sempre 500) derruba 6 (`scratchpad/e163/f5-controles.txt`).

## Suítes (lidas na saída, `scratchpad/e163/`)

- **Base (antes de qualquer código, `base-api.log`):** `test:api` **482/482**.
- **Bateria 1 — antes de `7bca3f13`/`6502c690` (`b1-*.log`):** `test:api` **484/484** arquivos; `test:almoxarifado` **44/0**;
  `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; client **165** suítes / **2088** testes; `CI=true build` *Compiled successfully*;
  revisão obrigatória da proposta **23/23** scripts (*"TODOS OS INVARIANTES OK"*) + editor **39/39**.
- **Bateria 2 — antes de `407ddfcc` (depois da Fase 5, `b2-*.log`; é também a do fechamento: depois só mudaram documentos):** `test:api` **484/484** arquivos (`atividadeEditadaGuardaOFim` **7/0**, `validadesNoDiaLocal` **10/0**); `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; client **165** suítes / **2088** testes; `CI=true build` *Compiled successfully*; revisão obrigatória da proposta **23/23** + editor **39/39**.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** — a Fase 5 (só asserções). As tasks ficaram verdes na primeira aplicação. **Testes antigos
   mudados: 6** (todos pela régua: o hoje das validades e o mês da chave).
2. **Achados da revisão:** Fase 2 — **0 Critical + 3 Important + 9 Minor**, todos reais (o mais caro: o relógio adiantado só no JavaScript
   faz as réguas em SQL errarem para o lado oposto ao da produção — sem a tabela "qual borda pega qual sabotagem", metade das bordas seria
   verde vazio). Fase 5 — r1 **0** de produção (3 Minor + 3 informativos de antes da etapa); r2 **0**; r3 **15** faltas de asserção reais (16
   sobreviventes, 1 inalcançável) + 2 fragilidades (D07, G03); **0** ruído. **O que mais pesou:** de novo **as bordas e os filtros
   combinados** (o parâmetro do `hoje` fora de ordem só aparece com outro filtro junto) e um cenário que passava **por coincidência de ids**.
3. **Paralelismo:** **0** galhos de código em paralelo (o condutor fez T1 e T2 em sequência); **1** revisor na Fase 2, **3** revisores em
   paralelo na Fase 5 (o r3 na worktree própria, 73 sabotagens + 15 de controle) — **0** incidente de trava (os revisores rodaram arquivos
   isolados), **0** retrabalho.
4. **Defeito que escapou:** **2, ambos de documentação/teste, nenhum de produção** (achados na Etapa 164). (a) **O manual não foi
   enxertado inteiro:** a seção 22.5 (*O dia e a hora de um registro*) continuou dizendo que as datas sem hora das ferramentas, a validade do
   lote, o prazo da remessa e a conta a pagar contavam o dia universal — o que a 163 tinha acabado de mudar (as seções 4, 17 e 21 foram
   atualizadas, a 22.5 não). Corrigido no fechamento da 164. (b) **O teste `validadesNoDiaLocal` tem um buraco de 3 h por mês** (Fase 2 I1 da
   164): o HOJE sai do mês de Brasília real, e das 21h à meia-noite do último dia de cada mês o `date('now')` (UTC) cai no mesmo mês de HOJE —
   uma sabotagem de mês por `date('now')` passaria vazia nessa janela. As chaves de mês da 163 são provadas pela `dedupeChave` com instante
   fixo, então o risco é baixo; registrado, não mexido (a 164 calcula HOJE do mês UTC real).

## Próxima tarefa detalhada — Etapa 164

*(A série desta etapa foi B1040–B1045, C406 e C407 resolvidos, C408 e C409 novos, nenhuma A — a 164 começa em **B1046**, **C410**, **A104**;
confira com `grep -oE` antes.)*

**Escolhida: o dia de Brasília nos vencimentos de Frotas e do Financeiro (C409).** Medido de passagem na Fase 2 da 163 (não a fundo): em
`server/services/frotas/frotasService.js`, a lista de documentos *vencendo* (`:457`, `date(d.data_vencimento) <= date('now', '+' ||
alerta_dias_antes || ' days')`), os alertas de documentos (`:646`), da CNH (`:664`, `+30 days`), das revisões (`:680`, `+15 days`; e `:764`,
`< date('now')` — atrasadas), das multas (`:702`, `+15 days`); e no Financeiro, o painel de receita (`index.js:20027`, `data_vencimento <=
date('now')` das contas a receber pendentes). **Medir antes:** a forma de cada coluna (só data? o formulário manda `type="date"`?), quem lê
cada consulta (que tela, que cartão — as telas de Frotas e do Financeiro montam?), as outras réguas `date('now')`/`toISOString().slice(0, 10)`
em `services/frotas` e nas rotas do Financeiro, e os testes que calculam *hoje* em UTC nesses fluxos. **Régua:** `diaLocal.hojeLocalISO()`
como parâmetro, sem modificador (colunas só de data); somar dias com `date(?, '+' || ? || ' days')`; o `hoje` lido **uma vez** por consulta.
**Teste:** o molde da 163 (`validadesNoDiaLocal.api.test.js` — TZ=UTC e o relógio adiantado no próprio processo para as 22h de Brasília do
último dia do mês seguinte, com a guarda) se as rotas estiverem no harness; senão o da 161/162 (o `index.js` real como filho). Massa com as
**duas bordas** de cada régua (HOJE de um lado, HOJE−1 do outro; no teto, HOJE+N dentro e HOJE+N+1 fora), números diferentes, e **um cenário
com filtros combinados** (o parâmetro do `hoje` fora de ordem só aparece assim — a lição do r3 da 163). **De passagem, se couber:** o nome do
PDF de etiquetas no dia local (`client/src/utils/etiquetasPdf.js:176`, cosmético — r1 da 163). **Pontos de atenção:** (1) a trava de máquina
(um `test:api` por vez); (2) a tabela "qual borda pega qual sabotagem" (o relógio adiantado só no JavaScript — Fase 2 I1 da 163); (3)
nenhuma porta de permissão muda; (4) se alguma régua decidir pagamento ou baixa, só a data e mais nada.

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 152 — **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o
resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela de conversões e o grupo acima de família, a régua do
tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens de
produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**, **B101**/G30,
**G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62, a **C348**; nas propostas, a verificação do dono da proposta (Fase
12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a Frente B da lentidão, a **C297** (**B924**), a **B926**,
a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**; no Operacional, a **C332**, ligar o painel antigo (*Dashboard
MES*, **C403** — se for ligado a um menu, consertar antes a régua do dia e a consulta da manutenção) e **ligar a edição de atividades e decidir
o que ela grava** (**C408** — a OS, o início, as horas previstas, o colaborador, a disponibilidade ao reabrir, o fim e as horas reais
calculadas); do Comercial, a **C354**, a **C357**/**B988**, a **C359**/**B989** (e a **C360** junto), a **C358**, a **C383**, ignorar também o
acento nas buscas (**B1013**, **B1019**) e o resto da **C382** (**B1016**); do núcleo, a **C362**; da 160, o filtro *Status* dos Materiais
(**C398**) e os tipos do filtro das Movimentações e o material de cliente nos seletores das Reservas/Inspeções (**C399**); da C400, acrescentar
a descrição da OS à busca das OPs (muda o resultado); da 162, contar os *dias em espera* em dias de calendário (**B1036** — é régua); da 163
(r1), validar o `referencia` das remessas como `AAAA-MM-DD` com 400 (muda o contrato da rota) e o `horas_reais: 0` gravado como nulo (é régua de
presença). Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** o `diaLocal.js` (`hojeLocalISO`, `modificadorDoFuso`, `instanteDoBancoNoFuso`) e o
`dataLocal.js` do navegador; o `montarSetParcial`; a calibração, o empréstimo, o lote, a remessa e as chaves dos avisos do Almoxarifado
(`6502c690`); o PUT parcial das atividades (`7bca3f13`).
