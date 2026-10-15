# Etapa 101 — a *Em Separação* vazia tem saída (C195) e a requisição recusa fração de material com série (C202)

> Status: **EM EXECUÇÃO — 2026-10-15.** Worktree `CRM-wt-e101`, branch `etapa-e101` (de `main` `2e0ba280`). Marcar
> cada task ao terminar (hash, divergência).
> Origem: "Próxima tarefa detalhada — Etapa 101" no fim de
> `docs/superpowers/plans/2026-10-09-almoxarifado-etapa99-separacao-recusa-o-inseparavel.md`; C195, C202.
> Design: `docs/superpowers/specs/2026-10-15-almoxarifado-etapa101-em-separacao-vazia-tem-saida-design.md`.
>
> **Numeração:** letras de `docs/almoxarifado-novidades-por-etapa.md` conferidas em 2026-10-15 (`grep -on` no
> documento): última **B524**, último C **203**, última **A50**. Esta etapa reserva **B525–B531**, **C204–C206** e
> **A51–A52**.

## Fase 0 — medido (2026-10-15)

Sonda `server/tests/sonda/e101fase0.js` (não versionada; `testApp` com `requirePermission` real). **S** sem perfil cria
pela rota dos outros módulos; **ADMIN** (superadmin) aprova, separa, entrega, devolve e encerra.

| caso | como chega | status | S cancela (outros) | S cancela (almox) | ADMIN encerra | reserva |
|---|---|---|---|---|---|---|
| P1 | aprova, `separar []` | EM_SEPARACAO | 400 *"Requisição não encontrada ou não pode ser cancelada"* | 400 *"Não é possível cancelar neste status"* | 400 *"Transição inválida: EM_SEPARACAO → ENCERRADA"* | ATIVA 2 |
| P2 | separa 2, devolve 2 | EM_SEPARACAO | 400 idem | 400 idem | 400 idem | ATIVA 2 |
| P3 | pede 4, separa 2, entrega 2 (*Parcialmente Atendida*), `separar []` | EM_SEPARACAO | 400 idem | 400 idem | 400 idem | ATIVA |
| P4 | P3 até a entrega, separa 1, devolve 1 | EM_SEPARACAO | 400 idem | 400 idem | 400 idem | ATIVA |
| P5 | material com série, pede 1,5 | — | criar (outros) **201**, criar (almox) **201**, rascunho **201**, enviar **200**, copiar **201** | | | |

**Contradições com a próxima tarefa escrita na 99:**
1. *"cancelar … só no almoxarifado ou CANCELAVEIS_OUTROS_MODULOS"* — a lista é incondicional e tem paridade por teste com a
   tela (`cancelarListaTelaRota.api.test.js`); a *Em Separação* entra por predicado de itens, à parte (RN-01).
2. **Não previsto:** `reservationService.assertPodeLiberarReserva` deriva a exceção do dono de
   `validarTransicao(status, 'CANCELADO')`. Pôr a seta `EM_SEPARACAO → CANCELADO` sem mais nada devolvia ao dono a
   liberação da reserva de uma *Em Separação* com material na caixa — o F1 da 77. E a tela das reservas tem paridade
   com `TRANSICOES` (`ReservasAlmoxarifado.test.js` (d4)). RN-06.
3. **Não previsto:** um teste de contrato da 93 (`requisicaoGestosConcorrentes.api.test.js`, `[93 RN-08] (e)`) prende
   *"Transição inválida: EM_SEPARACAO → ENCERRADA"* para uma *Em Separação* **com 3 na caixa** — passa a ser a recusa E1.
4. A tela de criação (`RequisicaoForm.js`) já tem `step="1"` num `<form>` (o navegador barra 1,5 para **todo**
   material); a cesta dos outros módulos (`RequisicaoMaterialCesta.js`) aceita 1,5 (`Number(qty)`). O servidor é a porta.

## Regras de negócio

- **RN-01 — cancelar a *Em Separação* vazia sem entrega.** `EM_SEPARACAO → CANCELADO` vale quando **todo** item tem
  caixa `Q.qtd(separado − entregue) ≤ 1e-9` **e** entregue `≤ 1e-9`. Aceito nas duas rotas de cancelamento, com a
  autorização de hoje de cada uma (outros módulos: só quem pediu; almoxarifado: quem pediu ou administrador do
  sistema). Solta as reservas e grava a trilha `CANCELAMENTO` com `dados_anteriores.status = 'EM_SEPARACAO'`.
  *Cenário:* S pede 2, ADMIN aprova e clica *Iniciar Separação* sem quantidade; S cancela → 200, *Cancelado*, reserva
  *Liberada*.
- **RN-02 — as recusas do cancelamento na *Em Separação*.** Caixa com material → 400 **M1**; caixa vazia com algo
  entregue → 400 **M2**. Nada muda (status, reserva, trilha). Ordem: 404/403 de hoje → status → caixa → entregue.
- **RN-03 — encerrar a *Em Separação* vazia com entrega.** `EM_SEPARACAO → ENCERRADA` vale quando todo item tem caixa
  `≤ 1e-9` e **algum** item tem entregue `> 1e-9`. Permissão de hoje (`aprovar_requisicao`), solta reservas, trilha
  `ENCERRAMENTO`. *Cenário:* P3 → encerrar → 200, *Encerrada*.
- **RN-04 — as recusas do encerramento na *Em Separação*.** Caixa → 400 **E1**; nada entregue → 400 **E2**. Vale também
  na nova tentativa do compare-and-set (o status relido `EM_SEPARACAO` é conferido pelos itens).
- **RN-05 — os cancelamentos entram na trava por requisição** (revisa a B450). Leitura do status e dos itens, UPDATE,
  liberação das reservas e trilha dentro de `travaPorRequisicao.serializarNaRequisicao`. Sem trava por material
  (só solta reserva).
- **RN-06 — o dono não ganha "liberar reserva" na *Em Separação*.** `assertPodeLiberarReserva` usa
  `STATUS_CANCELAVEIS_SEM_CONDICAO` (os status com seta para `CANCELADO`, menos `EM_SEPARACAO`). A tela das reservas
  (`STATUS_DONO_LIBERA_RESERVA`) é conferida contra essa lista.
- **RN-07 — a tela oferece o gesto que a rota aceita.** *Cancelar Requisição* aparece na *Em Separação* com
  `destinoDaSeparacaoVazia(itens) === 'CANCELADO'` (para quem já vê o botão: dono; no modo almoxarifado, também o
  administrador do sistema); *Encerrar Requisição* (modo almoxarifado) aparece com `=== 'ENCERRADA'`. O predicado do
  cliente (`requisicaoLabels.js`) é conferido contra o do servidor por teste.
- **RN-08 — a criação recusa fração de material com série.** `createRequisicao` (duas rotas de criação e a cópia;
  rascunho inclusive): quantidade arredondada (`Q.qtd`) não inteira de material `controle_serie = 1` → 400 **S1**, antes
  de qualquer escrita (nenhuma requisição, nenhum item).
- **RN-09 — o envio do rascunho recusa o legado.** `POST /requisicoes/:id/enviar`: item de série com quantidade não
  inteira → 400 **S1**, status continua *Rascunho*, sem notificação. Ordem: 404 → 403 → *Rascunho* → urgência → OS →
  **S1**.
- **RN-10 — o documento termina.** Cancelada ou encerrada, a requisição sai da fila de separação, a reserva sai do
  material e as seguintes recusam (separar 400 de status).

## Contrato congelado

`destinoDaSeparacaoVazia(itens)` (servidor `requisitionStateMachine.js`, espelho no cliente `requisicaoLabels.js`):
`null` se algum item tem caixa `Q.qtd(separado − entregue) > 1e-9`; senão `'ENCERRADA'` se algum item tem entregue
`> 1e-9`; senão `'CANCELADO'`. Entregue = `quantidade_entregue ?? quantidade_atendida`; ausente = 0.

`recusaSaidaDaSeparacao(status, itens, destino)` (servidor): `null` se `status !== 'EM_SEPARACAO'`; senão, para destino
`'CANCELADO'`: caixa → M1, entregue → M2; para `'ENCERRADA'`: caixa → E1, nada entregue → E2; senão `null`.

Literais (400, `{ error }`):
- **M1** `Esta requisição tem material separado na caixa; para cancelar, o almoxarifado precisa devolvê-lo à prateleira primeiro.`
- **M2** `Esta requisição já teve material entregue e não pode ser cancelada; o almoxarifado pode encerrá-la.`
- **E1** `Esta requisição tem material separado na caixa; entregue-o ou devolva-o à prateleira antes de encerrar.`
- **E2** `Nada foi entregue nesta requisição; em vez de encerrar, ela deve ser cancelada por quem pediu ou pelo administrador do sistema.`
- **S1** `${material_nome}: material com controle de série exige quantidade inteira na requisição (informado: ${q})`
  — `q` é o `Q.qtd` da quantidade (como a Q3 da 99).

Rotas (o que muda):
- `PUT /api/requisicoes-material/:id/cancelar` — aceita `CANCELAVEIS_OUTROS_MODULOS` **ou** `EM_SEPARACAO` com RN-01;
  na *Em Separação* não vazia, M1/M2 (só para o dono; quem não é dono continua com a recusa genérica de hoje). Resposta
  `{ success: true }`. Dentro da trava por requisição.
- `PUT /api/almoxarifado/requisicoes/:id/cancelar` — 404 *"Não encontrada"*, 403 *"Sem permissão"* de hoje; depois
  `validarTransicao` (com a seta nova) e M1/M2; status fora → *"Não é possível cancelar neste status"*. Dentro da trava.
- `PUT /api/almoxarifado/requisicoes/:id/encerrar` — 403 de hoje; dentro da trava: 404, `validarTransicao`, **E1/E2**
  (inclusive na nova tentativa), 409 C1 de hoje.
- `POST /api/almoxarifado/requisicoes`, `POST /api/requisicoes-material`, `POST /api/almoxarifado/requisicoes/:id/copiar`
  — S1 (pelo serviço). `POST /api/almoxarifado/requisicoes/:id/enviar` — S1.

Máquina: `TRANSICOES.EM_SEPARACAO` ganha `'CANCELADO'` e `'ENCERRADA'`. Exporta `STATUS_CANCELAVEIS_SEM_CONDICAO`,
`destinoDaSeparacaoVazia`, `recusaSaidaDaSeparacao`, `MSG_SAIDA_SEPARACAO` ({M1, M2, E1, E2}).

## Tasks (sort topológico)

- [ ] **T1 (tronco) — a máquina, os dois cancelamentos, o encerramento e a reserva do dono.** RN-01..RN-06.
  `requisitionStateMachine.js`, `routes/requisicoesMaterial.js`, `routes/almoxarifado.js` (cancelar, encerrar),
  `reservationService.js`. Teste novo `server/tests/api/separacaoVaziaSaida.api.test.js`: P1–P4 pela rota (cancelar
  nas duas, encerrar), M1/M2/E1/E2, a reserva do dono continua 403 na *Em Separação* vazia, a corrida separar ×
  cancelar (a separação segura a trava: cancelar espera e recebe M1). Ajustar o `[93 RN-08] (e)` (E1 no lugar da
  transição inválida — a caixa é 3). Controle positivo: sabotar o predicado (aceitar com caixa) e a trava.
- [ ] **T2 (galho) — C202 no servidor.** RN-08, RN-09. `requisitionCreateService.js`, `routes/almoxarifado.js`
  (`/enviar`). Teste novo `server/tests/api/requisicaoSerieInteira.api.test.js`: as duas rotas, rascunho, cópia de
  legado, envio de legado, serviço direto, inteiro aceito, 1,0000001 aceito (arredonda), material sem série com 1,5
  aceito, "nada gravado". Independente da T1 (arquivos e regras distintos).
- [ ] **T3 (galho, depois da T1) — a tela.** RN-07. `requisicaoLabels.js` (`destinoDaSeparacaoVazia`),
  `RequisicoesList.js` (os dois botões), `ReservasAlmoxarifado.test.js` (d4 contra `STATUS_CANCELAVEIS_SEM_CONDICAO`).
  Teste novo de cliente: os botões por caso e a paridade do predicado contra o do servidor (tabela de itens).
- [ ] **T4 (integração, depois de T1–T3) — o documento até o fim, pela rota E pelo serviço.**
  `server/tests/api/separacaoVaziaSaidaIntegracao.api.test.js`: monta a *Em Separação* vazia pelo serviço
  (`separarRequisicao(db, R, [], user)`, `devolverSeparado`) e pela rota; cancela/encerra pela rota; confere
  `listarFilaSeparacao` (serviço) e `GET /api/almoxarifado/fila-separacao` (rota) sem a requisição, reserva
  liberada e `quantidade_reservada` do material, a separação seguinte recusada; e a C202 + C195 juntas (legado 1,5 de
  série → entrega 1 → `separar []` → encerrar).
- [ ] **T5 — Fase 5 e fechamento** (revisores frescos; `fechar-etapa` inteira; consultas A51/A52).

## O que fica de fora (declarado)

- Gesto de cancelar para o almoxarife (B).
- *Parcialmente Atendida* com material na caixa continua encerrando (contrato da 93; C204).
- A tela de criação já barra fração para todo material pelo `step` (fora; C205).
