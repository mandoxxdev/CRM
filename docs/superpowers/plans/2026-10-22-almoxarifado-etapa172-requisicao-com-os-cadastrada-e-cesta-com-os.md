# Etapa 172 — Requisição com OS cadastrada (opcional) e a cesta com campo de OS

> **Status:** 🟡 em execução (2026-10-22). Emendada da "próxima tarefa detalhada" da Etapa 171.
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
| T0 | **Prova por execução** do achado da cesta: teste que reproduz o fluxo do client (POST rascunho pela porta que a cesta usa → `/enviar` pela porta que ela usa, com o usuário de um módulo da cesta) e mostra o 400/403. Se o fluxo **não** estiver quebrado, registrar e rebaixar RN-172.07 a melhoria. | tronco |
| T1 | Coluna `requisicoes_almoxarifado.os_id` (safeAlter + harness), Zod (`schemas.js:355`, hoje `z.object` descarta `os_id`), `requisitionCreateService` (RN-02/03/05), cópia (RN-06), rota aux (RN-08). | tronco |
| T2 | Casamento por `os_id` nas duas portas da 171 (RN-04), sob a trava que já existe. | tronco (motor) |
| T3 | Front: `RequisicaoForm` e `RequisicaoMaterialCesta` com seletor opcional + texto; a cesta ganha o texto obrigatório (RN-07). Mock só na fronteira HTTP. | galho (worktree) |
| T4 | Integração: requisição criada pela cesta com OS cadastrada → pedido com a mesma OS recebido → reserva vai para a requisição; e pelo serviço. | integração |

## Próxima tarefa detalhada

*(preencher no fechamento)*

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
