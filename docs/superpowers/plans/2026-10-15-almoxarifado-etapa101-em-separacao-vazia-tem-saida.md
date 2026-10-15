# Etapa 101 — a *Em Separação* vazia tem saída (C195) e a requisição recusa fração de material com série (C202)

> Status: **FECHADA — 2026-10-15.** Fases 0–6 feitas: plano `2935c7d2`, T1 `6dcced8e`, T2 `38e04309`, T3 `dfdad6b1`, T4 `f7139676`, Fase 5 `3c9e6a03`, fechamento (docs) no commit seguinte. **Próxima: Etapa 102** (ver o fim). Worktree `CRM-wt-e101`, branch `etapa-e101` (de `main` `2e0ba280`). Marcar
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

- [x] **T1 (tronco) — a máquina, os dois cancelamentos, o encerramento e a reserva do dono.** RN-01..RN-06.
  `requisitionStateMachine.js`, `routes/requisicoesMaterial.js`, `routes/almoxarifado.js` (cancelar, encerrar),
  `reservationService.js`. Teste novo `server/tests/api/separacaoVaziaSaida.api.test.js`: P1–P4 pela rota (cancelar
  nas duas, encerrar), M1/M2/E1/E2, a reserva do dono continua 403 na *Em Separação* vazia, a corrida separar ×
  cancelar (a separação segura a trava: cancelar espera e recebe M1). Ajustar o `[93 RN-08] (e)` (E1 no lugar da
  transição inválida — a caixa é 3). Controle positivo: sabotar o predicado (aceitar com caixa) e a trava.
- [x] **T2 (galho) — C202 no servidor.** RN-08, RN-09. `requisitionCreateService.js`, `routes/almoxarifado.js`
  (`/enviar`). Teste novo `server/tests/api/requisicaoSerieInteira.api.test.js`: as duas rotas, rascunho, cópia de
  legado, envio de legado, serviço direto, inteiro aceito, 1,0000001 aceito (arredonda), material sem série com 1,5
  aceito, "nada gravado". Independente da T1 (arquivos e regras distintos).
- [x] **T3 (galho, depois da T1) — a tela.** RN-07. `requisicaoLabels.js` (`destinoDaSeparacaoVazia`),
  `RequisicoesList.js` (os dois botões), `ReservasAlmoxarifado.test.js` (d4 contra `STATUS_CANCELAVEIS_SEM_CONDICAO`).
  Teste novo de cliente: os botões por caso e a paridade do predicado contra o do servidor (tabela de itens).
- [x] **T4 (integração, depois de T1–T3) — o documento até o fim, pela rota E pelo serviço.**
  `server/tests/api/separacaoVaziaSaidaIntegracao.api.test.js`: monta a *Em Separação* vazia pelo serviço
  (`separarRequisicao(db, R, [], user)`, `devolverSeparado`) e pela rota; cancela/encerra pela rota; confere
  `listarFilaSeparacao` (serviço) e `GET /api/almoxarifado/fila-separacao` (rota) sem a requisição, reserva
  liberada e `quantidade_reservada` do material, a separação seguinte recusada; e a C202 + C195 juntas (legado 1,5 de
  série → entrega 1 → `separar []` → encerrar).
- [x] **T5 — Fase 5 e fechamento** (revisores frescos; `fechar-etapa` inteira; consultas A51/A52).

## O que fica de fora (declarado)

- Gesto de cancelar para o almoxarife (B).
- *Parcialmente Atendida* com material na caixa continua encerrando (contrato da 93; C204).
- A tela de criação já barra fração para todo material pelo `step` (fora; C205).

## Fase 2 — revisão do plano (agente fresco, 2026-10-15) — 0 trava, 5 correções, notas

As regras e as literais se sustentaram; o que estava errado era o **alcance nos testes existentes**. O plano dizia
"ajustar o `[93 RN-08] (e)`"; o medido foi ~37 casos em 7 arquivos do servidor e 2 do cliente.

1. **(correção) A trava nos cancelamentos (RN-05) derruba os testes de corrida que disparavam o cancelamento AGUARDADO
   dentro da separação/devolução** — viram deadlock. Medido pelo revisor e por mim na suíte (342/347 na primeira
   rodada com a T1). Reescritos na T1: o cancelamento agora **espera** e decide pela caixa que a separação deixou (M1, ou
   200 na *Em Separação* vazia); a ordem inversa vira "cancelamento 200, separação S1"; os que provavam o
   compare-and-set contra escritor **fora** da trava (98 RN-02b, 94 RN-04 (a)/(b)) usam escritor direto — o D409 da
   devolução e o V1 da alçada continuam alcançáveis por quem escreve fora da trava (reprovação por valor, legado).
   Arquivos: `separacaoNaoRessuscita`, `requisicaoGestosConcorrentes`, `requisicaoGestosConcorrentesIntegracao`,
   `cancelarOutrosModulosIntegracao`, `devolverSeparado`, `requisicaoCancelarOutrosModulosReserva`,
   `alcadaValorDepoisDaSeparacao` (este o revisor não listou — a suíte o pegou por *timeout*),
   `alcadaValorDepoisDaSeparacaoIntegracao`, `requisicaoEstados`.
2. **(correção) A T1 deixa a suíte do cliente vermelha** (`ReservasAlmoxarifado.test.js` (d4) deriva de `TRANSICOES`) —
   movido para a T1.
3. **(correção) A T3 esquecia `RequisicoesList.test.js` `[92 RN-06 (b)/(e)]`** ("sem botão" na *Em Separação* com fixture
   vazia) — reescrito com material na caixa.
4. **(correção) A T2 esquecia `separacaoFormaDaEntradaIntegracao` `[99 I2]`** (criava 1,5 de série pela rota) — o
   legado passou a ser montado por SQL.
5. **(correção) T1 e T2 tocam o mesmo arquivo** (`routes/almoxarifado.js`, trechos distantes) — a T2 rodou em worktree
   própria (`CRM-wt-e101-t2`); o cherry-pick entrou limpo.

Notas registradas: o rascunho legado com fração só sai cancelando (C206); quem separava não é avisado do cancelamento
(C205); `STATUS_CANCELAVEIS_COM_CONDICAO` entra no contrato (exportado); assimetria declarada da *Parcialmente Atendida*
com caixa encerrando (C204).

## Execução (2026-10-15)

- **T1** `6dcced8e` — máquina (setas condicionais + `destinoDaSeparacaoVazia`, `recusaSaidaDaSeparacao`,
  `STATUS_CANCELAVEIS_SEM_CONDICAO`/`_COM_CONDICAO`, `MSG_SAIDA_SEPARACAO`), os dois cancelamentos dentro da trava,
  encerrar com E1/E2 (também na nova tentativa), a exceção do dono; teste novo `separacaoVaziaSaida` (18) e as
  reescritas acima. **Controle:** 6 sabotagens (predicado aceitando tudo, sem trava em cada rota, dono pela seta crua,
  entregue sem `quantidade_atendida`, caixa crua) — cada uma derruba o teste nomeado, pela asserção certa.
- **T2** `38e04309` (cherry-pick de `756bc1d4`, worktree `CRM-wt-e101-t2`, agente) — `recusaFracaoDeSerie` única para
  criação e envio; teste novo `requisicaoSerieInteira` (13). **Divergência:** os testes do plano não derrubavam a
  sabotagem "Number cru no lugar de `Q.qtd`" (a criação já passa o arredondado) — o agente acrescentou o envio de um
  legado 1,0000001 e a função chamada direto.
- **T3** `dfdad6b1` — os dois botões e o espelho do predicado; teste novo `RequisicoesSeparacaoVaziaSaida` (7).
  **Controle:** 4 sabotagens no cliente, todas vermelhas.
- **T4** `f7139676` — `separacaoVaziaSaidaIntegracao` (4 jornadas, rota e serviço). J4 vermelha antes da T2.

## Fase 4 — integração serial (2026-10-15)

Cherry-pick da T2 (`756bc1d4` → `38e04309`), sem conflito. Suíte inteira na árvore `5de70a0b`: `test:api` **349/349**
arquivos (EXIT 0); `test:almoxarifado` 44/44; `test:validation` 4/4; `test:safealter` 3/3; `test:sqlite` 5/5; cliente
jest **98 suítes / 1523 testes**; `CI=true react-scripts build` EXIT 0. A primeira rodada da suíte com a T1 (antes das
reescritas) deu **342/347** — os cinco arquivos de corrida da correção 1 da Fase 2 (um deles, `alcadaValorDepoisDaSeparacao`,
por *timeout*: o gancho aguardava o cancelamento sem prazo, deadlock com a trava).

## Fase 5 — revisão adversarial do código (2026-10-15) — 0 defeito, 6 testes que faltavam

Dois revisores frescos em worktrees próprias (`CRM-wt-e101rv1`, `CRM-wt-e101rv2`, HEAD `5de70a0b`, junction).

- **Revisor 1 (RN, autorização, último gesto) — 0 achado.** Sondado e passou: perfis no encerrar (ALMOXARIFE, GESTOR,
  ADMINISTRADOR do módulo, admin do sistema 200; CONSULTA e PRODUCAO 403) e no cancelar por quem não é dono (403 no
  almoxarifado, genérica nos outros módulos); a ordem das recusas; vários itens; resíduos 1e-7; tudo o que vem depois do
  cancelamento (separar, entregar, devolver, liberar, conferir, confirmar recebimento recusam; copiar 201; excluir 200
  sem estorno; some da fila, com controle positivo); concorrência (dois cancelamentos, encerrar × cancelar, entregar ×
  cancelar, excluir × cancelar, cancelar × separar, 18 gestos em 6 requisições em 29 ms sem travar); a C202 com `"1.5"`,
  2,0000006, item repetido, `material_id` texto. **Notas:** o entregue não arredonda como a caixa (1e-7 de legado dá M2 —
  o contrato, sem estado preso: encerra); a cancelada com conferência gravada mantém `conferido_por_id` (ninguém lê);
  **dois comentários de produção desatualizados** (a exclusão e a alçada diziam "cancelamento fora da trava") —
  corrigidos em `3c9e6a03`, e o cabeçalho de `travaPorRequisicao.js`.
- **Revisor 2 ("o teste passaria com a feature quebrada?") — 39 sabotagens: 28 vermelhas, 5 equivalentes, 6 verdes.**
  Equivalentes: `controle_serie` truthy (a coluna é 0/1), `/enviar` sem `ORDER BY` (o plano do SQLite varre pelo rowid),
  quantidade crua na criação (a função arredonda), a reconferência dos itens na 2ª tentativa dos cancelamentos ×2
  (inalcançável hoje — todo escritor da caixa está na mesma trava; **declarada sem teste**). Verdes viraram teste em
  `3c9e6a03`: (1) `Q.qtd` mudado de **posição** (resto no entregue 1,9999999) — servidor e tabela (g) do cliente; (2) as
  três leituras de itens com `WHERE id = ?` (todo teste tinha um item e id de item = id da requisição) — requisição de
  dois itens com o item da caixa fora do id da requisição; (3) quem não pediu sem o filtro do dono pelos outros módulos
  (B530) — `comCaixa` e P3; (4) Encerrar sem `warehouseMode`; (5) Encerrar sem conferir o status (Encerrada/Cancelada).
  **Medido:** cada sabotagem (S3, S11, S12, S13, S28, C1, C7) derruba agora o teste nomeado.

**Verificação depois da Fase 5 (árvore `3c9e6a03`):** `test:api` **349/349** arquivos (EXIT 0); `test:almoxarifado` **44/44**; `test:validation` 4/4; `test:safealter` 3/3; `test:sqlite` 5/5; cliente jest **98 suítes / 1525 testes**; `CI=true react-scripts build` EXIT 0.

---

## Retro de 4 números

- **Rodadas de correção até verde:** 1 por task no código (nenhum teste vermelho em duas rodadas seguidas); a T1 custou
  uma rodada de **reescrita de testes de corrida** (nove arquivos) — o custo real da etapa. A Fase 5 custou uma rodada
  de teste (e uma de ajuste: o teste de dois itens com a premissa errada na primeira escrita).
- **Achados de revisão:** Fase 2 — 5 correções + notas, **todas reais** (0 trava). Fase 5 — rv1: **0 real**, 3 notas
  (1 real: comentários desatualizados); rv2: 11 verdes → **6 reais** (5 viraram teste, 1 declarada) e **5 ruído**
  (equivalentes).
- **Paralelismo:** 1 galho de código em worktree própria (T2, agente) em paralelo com a T1 — **sem retrabalho** (o
  cherry-pick entrou limpo; a correção 4 da Fase 2 chegou ao agente por mensagem no meio da task). Em paralelo também: a
  revisão do plano × a escrita da T1; os dois revisores da Fase 5 × a documentação; a suíte do servidor × a escrita dos
  testes do cliente.
- **Defeito que escapou:** *(preencher na Etapa 102.)* Da Etapa 99 para cá: nenhum defeito da 99 apareceu nesta etapa.

---

## Próxima tarefa detalhada — Etapa 102

**Tema: encerrar com material na caixa recusa em qualquer status (C204).** A Etapa 101 deu à *Em Separação* a recusa
E1 (*"Esta requisição tem material separado na caixa; entregue-o ou devolva-o à prateleira antes de encerrar."*), mas a
*Parcialmente Atendida* com material separado e não entregue **encerra** — e a caixa deixa de ser caixa sem movimento
(`STATUS_COM_CAIXA` não tem `ENCERRADA`). **Medido na Fase 0 da 101** (sonda `e102fase0.js`, não versionada): pede 4,
separa 4, entrega 1 → *Parcialmente Atendida*, caixa 3, reserva ATIVA → `PUT /encerrar` **200**, *Encerrada*, separado
4 / entregue 1, reserva *Liberada*, `quantidade_reservada` 0.

**Fase 0 (o que medir antes de prometer):**
1. Todos os status de onde `ENCERRADA` sai (`TRANSICOES`: *Parcialmente Atendida*, *Entregue*, e a *Em Separação* da
   101) — *Entregue* pode ter caixa? (separado > entregue com tudo entregue? sonda com entrega acima do separado de
   material comum — a Etapa 3 deixa).
2. Quem depende do encerrar com caixa hoje: o teste `[93 RN-08] (e)` (o `parcial()` encerra com 3 na caixa — o escritor
   põe *Entregue* e a nova tentativa encerra) e `requisicaoCicloFinal`; o manual (10.2) diz *"ao encerrar, o que ela
   tinha separado e não entregou deixa de ser caixa"* — **é a regra documentada**: mudar é decisão (letra B), com a
   alternativa "encerrar devolve a caixa à prateleira automaticamente com a trilha da devolução da 98".
3. A tela: o **Encerrar Requisição** na *Parcialmente Atendida* com caixa — esconder ou deixar e mostrar a recusa.

**Contrato candidato:** `recusaSaidaDaSeparacao` vira `recusaEncerrar(status, itens)` — E1 para qualquer status com
caixa; ou (alternativa B) o encerrar devolve a caixa (`devolverSeparado` sob a mesma trava) e encerra. Consulta A para
as *Encerradas* com caixa (o legado).

**Pontos de atenção:** o encerrar já está na trava por requisição (93) e a devolução também — chamar a devolução de
dentro do encerrar exige a versão **sem trava** (`devolverSemTrava` + `comTravaDaRequisicao`), nunca a pública (não
reentrante). A régua da caixa é a da B524.

**O que já está pronto e não precisa reabrir:** a saída da *Em Separação* vazia (101), a trava nos cancelamentos (B527),
a recusa da fração de série (B529), a devolução à prateleira (98).
