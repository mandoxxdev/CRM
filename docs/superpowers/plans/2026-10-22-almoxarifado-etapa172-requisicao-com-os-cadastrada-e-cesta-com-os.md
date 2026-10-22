# Etapa 172 — Requisição com OS cadastrada (opcional) e a cesta com campo de OS

> **Status:** ✅ **fechada (2026-10-22)** — T0 `c34eab10`, T1 `f62bd21f`, T2 `033f1164`, T3 `a2a049bd` (merge `8c5f15a1`),
> `8a08523f`, Fase 5 `c801e899`, `37c2732d`, `30f421c0`, `ffbbaae4`; fechamento no fim. Emendada da "próxima tarefa detalhada" da Etapa 171.
> **Próxima: Etapa 174** (a 173 é de outra sessão, em worktree) — ver "Próxima tarefa detalhada".
> **Fase 0 (medido, 2026-10-22):**
> - `requisicoes_almoxarifado` só tem `os_referencia TEXT` (`schema.js:454-472`); nenhuma migração cria `os_id`. O
>   `criarReserva` da aprovação lê `reqRow.os_id` (`requisitionService.js:534`) — coluna inexistente, sempre `null`.
> - **A RN-A (Etapa 33, `f8cdae33`) é decisão do P.O. de 16/09/2026: o número da OS é DIGITADO, não escolhido de
>   cadastro**, e `requisicaoExigeOS.api.test.js:111-124` trava que `OS-QUE-NAO-EXISTE-9999`, `MANUT 22` e `OS-1714/A`
>   são aceitos. A "próxima tarefa" da 171 ("select de OS na nova requisição") **contrariava essa decisão** se o
>   select fosse obrigatório — por isso aqui ele é **opcional e ao lado** do texto. Registrado na letra B.
> - **Achado:** `RequisicaoMaterialCesta.js:158-171` (fluxo padrão de 8+ módulos — `usesCestaFlow`,
>   `requisicoesMaterialConfig.js:139`) **não manda OS** e não tem campo; o envio passa por `exigirOS` → 400 "Informe o
>   número da OS…" sem onde preencher. Inferido por leitura — **a T0 prova por execução antes de corrigir**.

## Regras

| ID | Regra | Cenário |
|---|---|---|
| RN-172.01 | O texto `os_referencia` continua **obrigatório no envio** e **livre** (RN-A intacta; o teste que trava o número livre não muda). | `MANUT 22` sem OS cadastrada → aceito |
| RN-172.02 | A requisição ganha `os_id` **opcional**. Com `os_id`: a OS tem de existir (400 `OS #<id> não encontrada`); se o texto vier vazio, o servidor preenche `os_referencia` com o `numero_os`; se vier preenchido, o texto do usuário é mantido. OS fechada **não** é recusada na requisição (a requisição pode ser de consumo de OS já em fechamento — decisão reversível, letra B). | `os_id: 7`, texto vazio → `os_referencia = 'OS-2026-058'` |
| RN-172.03 | Validação do `os_id`: mesma régua da 171 (ausente/null/'' = sem; inteiro positivo número ou string de dígitos; resto → 400 `OS inválida`). | `os_id: "abc"` → 400 |
| RN-172.04 | **Casamento com a reserva da OS** (as duas portas da 171: fila da chegada e conversão na aprovação): requisição **com** `os_id` casa por `os_id` (só); **sem** `os_id` casa pelo texto como na 171 (fallback para as antigas e para quem digitou). | req `os_id=7` com texto "42" casa com a OS 7; req sem `os_id` e texto "42" com OS "OS-042" continua não casando (C426) |
| RN-172.05 | A reserva criada para a requisição grava `os_id` da requisição (hoje sempre `null`). | — |
| RN-172.06 | Copiar requisição copia `os_id` junto com o texto. Rascunho editado/enviado mantém. | — |
| RN-172.07 | **Cesta:** campo "Número da OS" (texto, obrigatório no envio, mesma mensagem) + o mesmo seletor opcional. | cesta sem OS → mensagem no campo, não toast perdido |
| RN-172.08 | Lista de OS para o seletor acessível a **quem cria requisição** (os módulos da cesta e operacional/frota): rota `GET /api/requisicoes-material/aux/ordens-servico[?incluir=]` sob o mesmo `authenticateToken` das rotas de `/api/requisicoes-material`, OS abertas (régua `osFechada` da 171) + `incluir`, `id, numero_os, status, cliente_nome`. | usuário do Comercial sem módulo almoxarifado lista OS |

## Tasks

| # | Task | Tipo |
|---|---|---|
| ✅ T0 `c34eab10` | **Prova por execução** do achado da cesta: teste que reproduz o fluxo do client (POST rascunho pela porta que a cesta usa → `/enviar` pela porta que ela usa, com o usuário de um módulo da cesta) e mostra o 400/403. Se o fluxo **não** estiver quebrado, registrar e rebaixar RN-172.07 a melhoria. | tronco |
| ✅ T1 `f62bd21f` | Coluna `requisicoes_almoxarifado.os_id` (safeAlter + harness), Zod (`schemas.js:355`, hoje `z.object` descarta `os_id`), `requisitionCreateService` (RN-02/03/05), cópia (RN-06), rota aux (RN-08). | tronco |
| ✅ T2 `033f1164` | Casamento por `os_id` nas duas portas da 171 (RN-04), sob a trava que já existe. | tronco (motor) |
| ✅ T3 `a2a049bd` (merge `8c5f15a1`) | Front: `RequisicaoForm` e `RequisicaoMaterialCesta` com seletor opcional + texto; a cesta ganha o texto obrigatório (RN-07). Mock só na fronteira HTTP. | galho (worktree) |
| ✅ T4 (coberta — ver Fechamento) | Integração: requisição criada pela cesta com OS cadastrada → pedido com a mesma OS recebido → reserva vai para a requisição; e pelo serviço. | integração |

## Próxima tarefa detalhada

### Etapa 174 — a entrega da requisição com OS cadastrada grava a OS na saída (o "Consumo por OS" passa a contar o que sai por requisição)

> **O número é 174, não 173:** a 173 está sendo desenvolvida por outra sessão, em worktree separada. Antes de começar, `git log` e o
> cabeçalho do guia — se a 173 já entrou na main, confira se ela tocou `requisitionService.entregar*`, `stockService.registrarMovimentacao`
> ou `ownerRules` e renumere as letras B/C desta (a 172 parou em **B1110**/**C428**; a 173 pode ter usado as seguintes).

**Por que esta (escolha pela regra do CLAUDE.md):** é o "falta" que este fechamento nomeou (letra **D (172)**, I5) e fecha a pergunta da
usuária de Compras que abriu a 171 — *"…todos os itens comprados sejam devidamente associados **e controlados** por ela"*. Medido em
2026-10-22: o relatório **Consumo por OS** (`reportService.relatorioConsumoPorOS`, chave `consumo-os` em `routes/almoxarifado/extended.js:2295`)
soma `movimentacoes_almoxarifado` de tipo `SAIDA*` **por `m.os_id`**; a entrega da requisição grava `tipo: 'SAIDA'`
(`requisitionService.js:~1920`) **sem `os_id`** (I5, travado pelo teste `requisicaoOsIdCasaReservaDaOs`). Resultado: **todo material que sai
por requisição fica fora do Consumo por OS**, mesmo com a OS cadastrada desde a 172 — o relatório só conta saída avulsa com OS. A 22 continua
🟡 por Engenharia/BOM e Produção/OP, bloqueadas por dependência (medição na própria spec) — não são candidatas.

**Contrato que ela consome (pronto, não reabrir):** `requisicoes_almoxarifado.os_id INTEGER` (opcional, sem FK — M2); criação/rascunho/cópia
(RN-172.02/06); a reserva da requisição já grava `os_id` (RN-172.05); `GET /api/almoxarifado/requisicoes/:id` devolve `os_id`.

**Fase 0 — medir antes de prometer:**
1. `stockService.registrarMovimentacao` com `tipo: 'SAIDA'` e `os_id`: `avaliarRegrasVinculo` (`movementRules.js:88`) só **afrouxa** com `os_id`
   (vínculo satisfeito) — confirmar; e `ownerRules.assertSaidaPermitida` (`ownerRules.js:128`) para **material de cliente** passa a resolver o
   cliente **pela OS** (`resolverClienteDoVinculo`, `ordens_servico.cliente_id`). **Risco I5:** material de cliente reservado para uma
   requisição cuja OS é de **outro** cliente seria recusado **na entrega**, depois de aprovado, reservado e separado. Medir hoje: como a
   entrega de material de cliente passa sem `os_id` (qual vínculo vai)? Se a regra do dono pode recusar, a conferência tem de vir **antes**
   (criação/aprovação) ou a entrega não manda `os_id` para material de cliente — decisão reversível, letra B.
2. Estorno da saída e **devolução** com `os_id`: o Consumo por OS desconta devolução? (`relatorioConsumoPorOS` filtra só `cancelado = 0` — a
   devolução para Estoque entra como movimento próprio; medir se ela herda `os_id` e se o relatório a subtrai, senão o consumo da OS fica
   inflado.)
3. Requisição **sem** `os_id` (só texto): a saída continua sem `os_id` — **não** tentar casar texto aqui (a C426 mostra o custo do texto).
4. As três portas que gravam a saída da requisição: entrega (`entregarRequisicao`), a segunda rodada, e a troca (`2192`) — todas.

**Pontos de atenção:** a entrega roda sob a trava por requisição **e** a por material (CLAUDE.md — não pegar trava nova); o motor já está sob
`naTravaDoMaterial`. Teste obrigatório: requisição com `os_id` entregue → `GET /api/almoxarifado/relatorios/consumo-os?os_id=` mostra a
quantidade; requisição sem `os_id` → não aparece; material de cliente (o caso do risco 1) com o resultado decidido. Controle positivo: tirar o
`os_id` da saída derruba o primeiro.

## Execução

### T0 — `c34eab10` (✅ 2026-10-22): **quebrado, sim** — por execução, não mais por leitura

- **Teste:** `server/tests/api/cestaEnviaRequisicao.api.test.js` (11/11 verde; as asserções do 400 descrevem o
  comportamento ATUAL e estão marcadas `// T0 (Etapa 172): ... a T1/T3 inverte esta assercao`).
- **O que a cesta faz (lido do client):** um único `POST /api/requisicoes-material` com `{ setor, departamento: setor,
  modulo_origem, observacoes, tipo_requisicao, justificativa, [data_necessidade], salvar_rascunho: false, itens }` —
  **sem** `os_referencia`. Não há rascunho + `/enviar` no caminho da cesta: o botão "Salvar rascunho" só aparece em
  `ctx.warehouseMode`, e `RequisicoesMaterialPages.js` força `warehouseMode: false` (até no módulo almoxarifado); o
  `/enviar` de `RequisicoesList.js:1143` é só da lista do almoxarife. O plano supunha "POST rascunho → `/enviar`" — **não
  é o fluxo** (correção C1 da revisão do plano, confirmada). O caminho rascunho → `/enviar` da cesta só existiria em
  `warehouseMode`, e hoje é **inalcançável**: a cesta só é montada por `RequisicoesMaterialNovaPage` (as 11 rotas
  `requisicoes-material/nova` de `App.js`), que força `warehouseMode: false` em todas — inclusive `moduloKey="almoxarifado"`.
  Por isso ele não tem cenário no teste (o 0b trava as duas premissas lendo o client); se a T3 reabrir o rascunho na
  cesta, o envio dele cai no mesmo `exigirOS` pela rota `/enviar` (que cobra a RN-A no envio).
  Cenário (a) = esse request literal, com usuário **só do Comercial** (`COMERCIAL`, id 1721) — mais Administrativo/admin.
- **Barreira:** só a RN-A (`exigirOS`). Medido, literal: `400 {"error":"Informe o número da OS: toda saída de material
  precisa estar vinculada a uma OS"}`, nada gravado — nos três módulos da cesta (comercial/`Comercial`,
  administrativo/`Administrativo`, admin/`Administrativo`) e no emergencial com justificativa e prazo.
- **Usuários:** `role: 'usuario'`, sem `perfil_almoxarifado` (fallback PRODUCAO), sem módulo almoxarifado. **Não há 403**:
  a rota é cross-módulo (`index.js` a registra só com `authenticateToken`; nem portão de módulo nem `requirePermission`) —
  o cenário 0a trava essa premissa lendo `index.js`, porque o harness também não tem portão nessa rota.
- **Controle (b):** o mesmo payload + `os_referencia: 'OS 1714'` → `201 {"status":"PENDENTE",...}` nos três módulos,
  gravando `os_referencia`, `solicitante_id`, `modulo_origem` e `departamento` — a OS é a única coisa que falta.
- **Consequência para o plano:** RN-172.07 **não** é rebaixada a melhoria — é correção de bug (a cesta, fluxo padrão de
  comercial/administrativo/admin e de qualquer módulo administrativo via `tipoOverrides`, não envia requisição nenhuma
  desde a RN-A da Etapa 33). A T3 deve pôr o texto obrigatório na cesta e inverter o 0c e os cenários (a).

### T1 — `f62bd21f` (✅ 2026-10-22): `os_id` na requisição, Zod, criação (I6/C2), cópia (I2), rota aux (I4)

- **Coluna:** `requisicoes_almoxarifado.os_id INTEGER` por `safeAlter` em `schema.js` (sem FK — M2). O harness usa o
  `initSchema` real, sem DDL própria da tabela: nada a mudar em `testApp.js`. **1º boot provado:** `CRM_DATA_DIR` vazio +
  `node index.js` → `PRAGMA table_info` mostra `os_referencia TEXT, os_id INTEGER`; a rota aux responde 401 sem token.
- **Contrato real (literais):**
  - `os_id` inválido pela rota (`0`, `-1`, `1.5`, `true`, `'abc'`, `'7a'`, `' '`) → `400 {"error":"Dados inválidos — os_id: OS inválida"}`
    (Zod, `osIdOpcional` exportado de `compras/schemas` — uma régua só); pelo serviço direto → `400 "OS inválida"`.
  - OS inexistente → `400 {"error":"OS #<id> não encontrada"}` — **também sem a tabela `ordens_servico`** (ambiente parcial: 400, não 500).
  - Ordem (I6) provada: os dois 400 acima vêm **antes** da literal da RN-A mesmo sem texto.
  - Com OS: `os_referencia = numero_os` (C2, sobrescreve o digitado; vale no rascunho, e o `/enviar` passa). OS fechada aceita.
  - `os_id: null` / `''` = sem OS (o que a cesta da T3 manda sem seleção) — RN-A como hoje.
  - `GET /api/requisicoes-material/aux/ordens-servico[?incluir=<id>]` → `[{ id, numero_os, status }]`, abertas (régua
    `STATUS_OS_FECHADA`, `LOWER(TRIM())`) filtradas **antes** do `LIMIT 300`, `ORDER BY id DESC`; `incluir` por consulta à
    parte, sem duplicar; `incluir` não numérico ignorado; sem a tabela core → `[]`. Registrada antes de `/:id`.
  - `/copiar`: leva `os_id` se a OS ainda existe (fechada inclusive); excluída → só o texto, `os_id` NULL.
- **Teste:** `requisicaoComOsCadastrada.api.test.js` 25/25. **Controles** (sabotar → vermelho → restaurar com `cmp`): C2
  desligado (2 ✗), filtro de fechadas inerte (3 ✗), filtro **depois** do LIMIT (0 ✗ na 1ª versão: o `?incluir` da mesma OS
  mascarava — o teste ganhou a consulta sem `incluir`, depois 1 ✗), cópia sem checar existência (1 ✗), Zod sem `os_id`
  (17 ✗), `exigirOS` antes da OS (7 ✗). `requisicaoExigeOS.api.test.js` verde **sem mudança**.
- **Os marcadores `// T0` do `cestaEnviaRequisicao`:** a T1 sozinha **não** inverte nada no servidor (o payload sem OS
  continua 400 — RN-A intacta). Mas a **T3 (`a2a049bd`) entrou na main durante a T1/T2** e o 0c (alarme "a cesta não manda
  `os_referencia`") ficou vermelho (suíte 497/498). Commit à parte `8a08523f`: 0c invertido (a cesta manda `os_referencia`
  e `os_id`), `payloadDaCesta` com o payload novo, (a) **não** inverte (campo vazio continua 400 no servidor — comentário
  explica), (c) novo: campo vazio + OS no seletor → 201 com `os_referencia = numero_os`. 12/12.
- **Divergências do plano:** nenhuma de contrato. A rota aux sem tabela devolve `[]` (o plano não dizia; segue a de
  `/almoxarifado/aux`). `resolverOsDaRequisicao` fica exportado do serviço (ninguém de fora o usa ainda).

### T2 — `033f1164` (✅ 2026-10-22): casamento por `os_id` nas duas portas da 171 (I3), I5

- `reservaDaOs.requisicaoCasaComOs({ osId, osReferencia }, os)`: com `osId` só pelo id; sem, `requisicaoEhDaOs` (texto, 171).
  `reservasDaOsParaRequisicao(db, materialId, { osId, osReferencia })` — com `osId`, `AND os_id = ?` no SQL.
- Fila (`distribuirSemLock` seleciona `r.os_id`; `distribuirParaOs` filtra pela função nova); o `criarReserva` da fila e
  o da aprovação gravam o `os_id` da requisição (RN-172.05). `converterReservasDaOs` recebe `{ osId, osReferencia }`.
  Sem trava nova (mesmas seções). **I5:** a saída da entrega continua sem `os_id` (teste trava).
- **Spec corrigida:** o cabeçalho de `reservaDaOs.js` dizia "A REQUISICAO NAO TEM `os_id`" — verdade só até a T1; reescrito
  dizendo que estava desatualizado.
- **Teste:** `requisicaoOsIdCasaReservaDaOs.api.test.js` 10/10 — os obrigatórios do I3 (sem `os_id` e texto que casa
  continua casando, na fila e na aprovação; semente legada **por INSERT** `os_id 7` + texto `"42"` **com a OS de número "42"
  existindo** → casa com a 7, não com a "42", nas duas portas; `os_id` de outra OS com o texto da 7 não converte; C426
  intacto) e ponta a ponta pela porta da cesta (`POST /api/requisicoes-material` com `os_id`, usuário sem módulo) → pedido
  da mesma OS recebido → reserva para a requisição → aprovar/separar/entregar, nas duas ordens (espera→chegada e
  chegada→aprovação). Contra o código de antes da T2: 5 ✗ (o RN-172.05 da aprovação já passava depois da T1 — o
  `reqRow.os_id` do `SELECT *` passou a existir). Controles: fila sem gravar `os_id` (2 ✗), casamento ignorando `os_id`
  (3 ✗), `os_id` na saída da entrega (1 ✗).
- **Efeito aceito:** reservas de requisição com `os_id` passam a aparecer em `relatorioReservadoPorOS` (filtra `r.os_id`).
- **Suítes (com T1+T2):** `test:api` 497/498 (a 1 era o 0c acima, depois 12/12), `test:almoxarifado` 44/0,
  `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 16/0.
- **Falta:** T4 (integração) — o ponta a ponta do servidor já está no teste da T2; resta o da cesta no client contra o
  contrato acima, e o fechamento (letra B: C2, OS fechada aceita, exposição da rota aux; letra D: I5, M2).

---

## Revisão da Fase 2 (2026-10-22) — 2 críticos, 6 importantes, 4 menores; as emendas PREVALECEM sobre as RN acima

- **C1 — a T0 descrevia o fluxo errado.** Fora do almoxarifado a cesta não salva rascunho nem chama `/enviar`
  (botão de rascunho só em `warehouseMode`, `RequisicaoMaterialCesta.js:366`); o "Enviar solicitação" é `POST
  /requisicoes-material` direto, sem `os_referencia`, e cai no `exigirOS` **da criação**. A T0 prova esse request.
- **C2 — texto contradizendo o `os_id`.** Decisão (reversível, letra B): **com `os_id`, o servidor grava
  `os_referencia = numero_os`** (sobrescreve o que veio digitado), em criação e rascunho. O front, ao escolher a OS no
  seletor, preenche o texto com o número e o trava; "Digitar outro número" limpa o seletor. Descartado: 400 por
  divergência (mais um erro para o solicitante sem ganho — o seletor é a fonte forte) e manter o texto (relatórios e
  e-mails mostrariam outra OS que a da reserva).
- **I1 — não existe edição de requisição** (só ações, `almoxarifado.js:4136-4625`). RN-172.06 vale só para a **cópia**.
- **I2 — cópia com OS excluída:** o `/copiar` leva `os_id` só se a OS ainda existir; senão copia só o texto (a cópia
  continua nunca falhando por causa da OS).
- **I3 — T2 delimitada:** `distribuirSemLock` passa a selecionar `r.os_id` e a fila casa por ele; o `criarReserva` da
  fila (`reservaChegadaService.js:399-405`) e o da aprovação (`requisitionService.js:534`) gravam o `os_id` da
  requisição (RN-172.05 nas duas); `converterReservasDaOs`/`reservasDaOsParaRequisicao` recebem `{ osId, osReferencia }`.
  Testes obrigatórios: sem `os_id` e texto que casa → continua casando; com `os_id` 7 e texto "42" → casa com a OS 7
  (com C2 o texto vira o número da 7, então o teste semeia por INSERT a forma legada para provar que o casamento é por id).
- **I4 — exposição da rota aux:** `GET /api/requisicoes-material/aux/ordens-servico` devolve **só `id, numero_os,
  status`** (sem `cliente_nome`) sob o `authenticateToken` das rotas de `/api/requisicoes-material`. Descartado:
  portão por "módulo que requisita" (não existe régua única — `usesCestaFlow` é config de client e pode ser trocado por
  `useModulosTipoConfig`). Registrado na letra B como exposição aceita: número e status de OS para qualquer logado.
  Filtro `osFechada` **antes** do `LIMIT 300`; `incluir` por consulta à parte (como a 171).
- **I5 — o `os_id` NÃO vai para a saída da entrega** nesta etapa (ligaria `avaliarRegrasVinculo`/`ownerRules` com OS e
  poderia recusar na entrega material já reservado). Declarado na letra D.
- **I6 — ordem das guardas:** `os_id` inválido (400 `OS inválida`) → OS inexistente (400 `OS #<id> não encontrada`) →
  preenchimento do texto (C2) → `exigirOS` → o resto como hoje. O preenchimento vale também no rascunho.
- **M1 — T3 (front) só depois de T0 e T1**, com o contrato acima congelado. `RequisicaoForm` em `warehouseMode` usa
  `/almoxarifado/aux/ordens-servico` (já existe, mesma forma `id, numero_os, status, …`); fora dele e na cesta,
  `/requisicoes-material/aux/ordens-servico`.
- **M2 — OS excluída com requisição vinculada:** tolerado (a requisição não casa com nada; o texto continua) — letra D.
- **M3/M4** — anotados no fechamento.

---

## Fase 5 — revisão adversarial (2026-10-22): 0 críticos; 4 achados reais corrigidos; 3 declarados

**Corrigidos (TDD + controle positivo, cada um no seu commit):**

1. **`c801e899` — nenhum teste travava o rascunho sem OS no client.** A guarda `!salvarRascunho &&` da RN-A (nova na cesta, antiga no
   `RequisicaoForm`) podia sumir com a suíte verde: o rascunho sem OS ficaria bloqueado no client com a mensagem do servidor. Quatro cenários
   em `warehouseMode` (o único modo em que o botão aparece): OS vazia + rascunho → **um** POST com `salvar_rascunho: true` e `os_id: null`;
   OS escolhida → o rascunho manda `os_id`. Controle: tirar a guarda da cesta → 1/15 vermelho (o cenário da cesta); do form → 1/15 (o do form).
2. **`37c2732d` — `?incluir` da rota aux saiu.** `GET /api/requisicoes-material/aux/ordens-servico` fica sob `authenticateToken` (qualquer
   logado) e o `incluir=<id>` devolvia número e status de **qualquer** OS, fechada inclusive, por id. Nenhum client o usava (a cesta e o form
   pedem a lista sem ele; a cópia leva o `os_id` pelo próprio `/copiar`). Agora o parâmetro é **ignorado** (200, só as abertas). Descartado:
   400 para `incluir` (quebra client antigo em cache sem ganho). Teste invertido; contra a rota anterior 24/25. Letra **B1106**.
3. **`30f421c0` — `osAindaExiste` (`routes/almoxarifado.js`, `/copiar`) engolia qualquer erro.** Banco ocupado ou outro erro de SQL virava
   "a OS não existe" e a cópia saía 201 **sem `os_id`** (perdia o casamento por id sem ninguém saber). Agora só `no such table` copia o texto;
   o resto propaga (500, nada gravado). Teste com o erro injetado só na consulta exata (`db.get`): `SQLITE_BUSY` → 500; `no such table` →
   201 com `os_id` NULL. Vermelho contra o código anterior (26/27); controle: tirar o ramo da tabela ausente → 26/27.
4. **`ffbbaae4` — os regex sobre código-fonte de `cestaEnviaRequisicao`.** O 0c (a cesta manda `os_referencia`/`os_id`) e a parte de porta e
   botão do 0b já tinham teste de comportamento no client — saíram; entrou no client "fora do `warehouseMode` não há *Salvar rascunho* e o
   envio é um POST em `/requisicoes-material`" (controle: botão sem a guarda → 1/16). **Ficam**, explicado no cabeçalho: 0a (registro da rota
   em `index.js` sem portão — o harness não o monta) e o 0b reduzido a "as páginas forçam `warehouseMode: false`" (nenhum teste renderiza
   `RequisicoesMaterialPages`).

**Declarados (não corrigidos, com o porquê):**

- **A lista do `warehouseMode` não filtra OS fechada.** O `RequisicaoForm` no almoxarifado usa `/api/almoxarifado/aux/ordens-servico`
  (já existia, `extended.js:1020`, com `cliente_nome` e **sem** a régua `osFechada`), então o almoxarife vê OS cancelada/concluída no seletor.
  Inofensivo: a requisição aceita OS fechada (**B1105**). Filtrar mudaria a rota de Recebimentos que a usa — fora do escopo. Letra **D (172)**.
- **`AND os_id = ?` redundante** em `reservaDaOs.reservasDaOsParaRequisicao`: com `osId`, o SQL já restringe à OS e a função de casamento
  confere de novo. Custo zero, duas réguas iguais; mantido (se uma mudar, a outra segura).
- **OS com `numero_os` vazio:** `resolverOsDaRequisicao` faz `os.numero_os || osReferencia` — o texto digitado fica (C2 não sobrescreve com
  vazio). `numero_os` é `NOT NULL UNIQUE` no core; vazio só por SQL à mão. Sem teste.

---

## Fechamento (2026-10-22)

**T3 — `a2a049bd` (merge `8c5f15a1`):** cesta com *Número da OS \** (obrigatório no envio, mensagem `MSG_OS_OBRIGATORIA` junto do campo, não
toast) e o seletor opcional *OS cadastrada* na cesta e no `RequisicaoForm` (escolher preenche e trava; *Digitar outro número* limpa); payload
`os_referencia` aparado + `os_id` número ou `null`; lista `/almoxarifado/aux/ordens-servico` no `warehouseMode`, a rota nova fora dele e na
cesta; lista que falha não bloqueia. O toast do form ganhou acento (mesma constante). Teste `Etapa172RequisicaoOS.test.js`.

**T4 — coberta, sem commit próprio (divergência declarada):** o ponta a ponta do servidor (porta da cesta com `os_id`, usuário sem módulo →
pedido da mesma OS recebido → reserva → aprovar/separar/entregar, nas duas ordens) já está no teste da T2 (`requisicaoOsIdCasaReservaDaOs`), e a
cesta contra o contrato congelado está no client (`Etapa172RequisicaoOS`, mock só na fronteira HTTP). Um teste de integração a mais repetiria
os dois.

**Divergências do plano:** (1) a T0 supunha "rascunho → `/enviar`" — o fluxo é um POST só (C1); (2) a RN-172.08 previa `?incluir` e
`cliente_nome` — saiu o cliente na Fase 2 (I4) e o `incluir` na Fase 5; (3) a RN-172.06 falava em "rascunho editado" — não existe edição (I1).

**Documentação:** novidades — seção da etapa antes de "Onde estamos", **B1103** a **B1110** (B1106 pede um olhar), **C428** (a cesta que não
enviava, resolvido), **D (172)**, **F (172)**, cabeçalho e "Onde estamos"; nenhuma **A** (coluna aditiva, criada no boot). Specs 04 (seção +
cabeçalho, correção da "próxima tarefa" da 171), 22 (seção, correções do cabeçalho de `reservaDaOs.js` e da 171, item da 171 marcado), 07,
mapa. Guia (cabeçalho apontando a 174, seção com roteiro de 8 passos). Manual (7.2 *Número da OS* reescrito — o toast agora tem acento — e
*OS cadastrada*; cópia; 9.3e "a requisição da OS").

**Retro.** (1) A T0 por execução pagou: a leitura do plano errou o fluxo (rascunho → `/enviar`) e só o request literal mostrou o defeito real
— a cesta quebrada há 36 dias, sem ninguém ter reportado (sinal de que ela pouco era usada, ou que o pessoal desistiu). (2) A T3 entrou na
main durante a T1/T2 e derrubou o 0c (regex sobre o fonte do client) — teste que lê fonte do outro lado do repo quebra com o trabalho
paralelo; a Fase 5 cortou os redundantes. (3) A guarda de rascunho existia há 36 dias sem teste — qualquer guarda que **pula** uma regra
precisa do cenário que prova o pulo. (4) Engolir erro "porque é ambiente parcial" (`osAindaExiste`) escondia falha real: só `no such table`.

**Verificação final (medida, depois dos quatro commits da Fase 5):** `test:api` **498/498 arquivos**; `test:almoxarifado` **44 passou, 0
falhou**; `test:validation` 4/0; `test:safealter` 3/0; `test:sqlite` 16/0; client **174/174 suítes, 2221/2221 testes**; `CI=true
react-scripts build` **Compiled successfully** (só o aviso de depreciação do Node, `fs.F_OK`, que não é do ESLint).
