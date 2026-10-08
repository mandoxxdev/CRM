# Etapa 92 — o cancelamento pelos outros módulos aceita o que a tela oferece (C149, feature 04 com a 05 e a 07)

> Status: **PLANO (Fases 0, 1 e 2) — 2026-10-08. Nenhum código de produção mudou.** Fase 2 feita (0 bloqueantes, 4
> importantes, 8 menores — seção "Fase 2" no fim, vale sobre o texto). Próximo passo: T0.
> HEAD de partida: `d271721e` (main, árvore limpa).
> Origem: "Próxima tarefa detalhada — Etapa 92" de
> `docs/superpowers/plans/2026-10-08-almoxarifado-etapa91-inversao-inspecao-aprovar.md:940-993`, os avisos **C140 (3)**,
> **C148**, **C149** e a decisão **B426** (`docs/almoxarifado-novidades-por-etapa.md:5701`), e a limitação **D (91)** "a
> separação não confere o status ao gravar *Em Separação*" (`:8339`).
>
> **Numeração:** etapa única para todos os módulos (esta é a **92**). Letras do documento do almoxarifado, conferidas no
> documento em 2026-10-08: última **B433**, última **C151** (o item 151 da lista C), última **A42**. Esta etapa usa
> **B434–B441**, **C152–C155** e **A43**.

**Escopo desta etapa:**
1. **C149 — `PUT /api/requisicoes-material/:id/cancelar` aceita exatamente os seis status em que a tela dos outros
   módulos mostra Cancelar Requisição**, com `UPDATE` *compare-and-set* contra o status lido (fecha a metade (2) da
   **C148**: a trilha passa a gravar o status que o `UPDATE` de fato trocou).
2. **A separação não ressuscita requisição cancelada** (D (91), medido abaixo: 50/50 com o gancho): a separação
   **reivindica** a requisição (`UPDATE … SET status='EM_SEPARACAO' … WHERE id=? AND status IN (PODE_SEPARAR)`) **antes**
   de gravar qualquer coisa; perdeu → o 400 de hoje e nada gravado.
3. **O cancelamento do almoxarifado não sobrescreve a separação** (achado novo da Fase 0, medido 10/10 — vira **C153**):
   `PUT /api/almoxarifado/requisicoes/:id/cancelar` ganha o mesmo *compare-and-set*.
4. **C148 (1)** — o `desfazerReservas` do `/aprovar` que perde não acusa "Falha" quando a reserva já foi solta por outro
   gesto (o cancelamento).
5. **Tela:** os status da tela viram constantes nomeadas; fora do modo almoxarifado o botão aparece só para **quem pediu**
   (achado novo — **C152**: o administrador que não pediu vê o botão e toma 400). Teste de componente dos seis status.

**Fora (declarado, ver "O que fica de fora"):** C145 (janela da QUARENTENA), C147 (chave de idempotência), C150 (custo da
trava), C139 (reserva manual alheia); os `UPDATE` da separação **depois** da reivindicação contra *liberar-retirada*/
*entregar* concorrentes; cancelar *Aguardando aprovação de valor* pelos outros módulos.

---

## Fase 0 — medido (2026-10-08)

Sondas no scratchpad (`sonda92-medir.js`, `sonda92-natural.js`, `sonda92-inversa.js`, `sonda92-a43.js`), contra
`server/tests/helpers/testApp.js` com `requirePermission` real. S = usuário **sem perfil** (entra como PRODUÇÃO), que
cria a requisição por `POST /api/requisicoes-material`; ALMOXARIFE (`perfil_almoxarifado: ALMOXARIFE`) separa; ADMIN
superadmin aprova. Reserva de 4 montada por `stockService.criarReserva` e status posto por `UPDATE` (estado da tela, como
a T5 da 91 fazia).

### 1. O cancelamento pelos outros módulos, status por status — confirmado

`PUT /api/requisicoes-material/:id/cancelar` por S, um material novo por linha:

| status | resposta | depois |
|---|---|---|
| `PENDENTE` | 200 `{"success":true}` | `CANCELADO`, reserva `LIBERADA`, r=0 |
| `APROVADO` | 200 `{"success":true}` | `CANCELADO`, reserva `LIBERADA`, r=0 |
| `AGUARDANDO_ESTOQUE` | **400** *"Requisição não encontrada ou não pode ser cancelada"* | inalterado |
| `AGUARDANDO_COMPRA` | **400** (mesma) | inalterado |
| `PARCIALMENTE_RESERVADA` | **400** (mesma) | inalterado, **reserva `ATIVA`, r=4** |
| `TOTALMENTE_RESERVADA` | **400** (mesma) | inalterado, **reserva `ATIVA`, r=4** |
| `RASCUNHO`, `AGUARDANDO_APROVACAO_VALOR`, `EM_SEPARACAO`, `PRONTA_PARA_RETIRADA`, `PARCIALMENTE_ATENDIDA`, `ENTREGUE`, `ENCERRADA`, `REJEITADO`, `CANCELADO` | 400 (mesma) | inalterado |

A tela (`client/src/components/almoxarifado/RequisicoesList.js:1835-1837`) mostra o botão, fora do modo almoxarifado,
para `PENDENTE, APROVADO, AGUARDANDO_ESTOQUE, AGUARDANDO_COMPRA, PARCIALMENTE_RESERVADA, TOTALMENTE_RESERVADA` — **quatro
dos seis dão 400**, e as duas reservadas seguram 4. **C149 confirmada.**

Comparação, `PUT /api/almoxarifado/requisicoes/:id/cancelar` por S: 200 em `RASCUNHO`, `PENDENTE`,
`AGUARDANDO_APROVACAO_VALOR`, `APROVADO`, `AGUARDANDO_*`, `*_RESERVADA` (os 8 que a máquina deixa ir a `CANCELADO`); 400
*"Não é possível cancelar neste status"* nos outros 7. Os seis da tela dos outros módulos são **subconjunto** dos 8
(conferido também em `requisitionStateMachine.js:40-65`).

**Achado novo (vira C152):** a condição do botão é `detalhe.solicitante_id === user?.id || isAdmin`
(`RequisicoesList.js:1838-1839`) **também fora do modo almoxarifado**, e a rota só cancela com `solicitante_id =
req.user.id` (a leitura e o `UPDATE`). O administrador (`canDeleteAlmoxRequisicao`: superadmin, admin do módulo ou
`role admin`) que **não** pediu vê **Cancelar Requisição** nos seis status e toma o mesmo 400. Medido pela T5 da 91 para
"outro usuário" (`requisicaoCancelarOutrosModulosReserva`, caso (c)); a tela é leitura de código.

### 2. A separação ressuscita a requisição cancelada — confirmado, nos dois cancelamentos

**Gancho (pior encaixe, determinístico):** `db.run` da instância embrulhado; no instante em que a separação emite o
`UPDATE … SET status='EM_SEPARACAO'` (`requisitionService.js:912/924` quando há quantidade, `:932` sem), o gancho dispara o
cancelamento, **espera a resposta**, e só então deixa o `UPDATE` da separação seguir. N=5 por combinação; "ressuscitada" =
cancelamento 200 **e** status final `EM_SEPARACAO`.

| rota do cancelamento | status de partida | com quantidade (1) | sem quantidade |
|---|---|---|---|
| almoxarifado | `APROVADO`, `AGUARDANDO_ESTOQUE`, `AGUARDANDO_COMPRA`, `PARCIALMENTE_RESERVADA`, `TOTALMENTE_RESERVADA` | **25/25** | **25/25** |
| outros módulos | `APROVADO` | **5/5** | **5/5** |
| outros módulos | os quatro que ela recusa hoje | 0/20 (cancelamento 400) | 0/20 (400) |

Estado final em toda ressuscitada: `EM_SEPARACAO`, a reserva **`LIBERADA`**, r=0, `quantidade_separada` = 1 (com
quantidade), a trilha `CANCELAMENTO` gravada e **as duas respostas 200** — quem pediu ouviu "cancelada", o almoxarife
ouviu "separada", e o material separado está na caixa sem reserva. A requisição em `EM_SEPARACAO` **não se cancela mais**
(a máquina não tem `EM_SEPARACAO → CANCELADO`). **Sem a guarda, a 92 levaria os quatro status novos dos outros módulos
para a coluna de cima** — a guarda é pré-requisito, como o plano da 91 dizia.

**Sem gancho (largura real da janela):** mesmo usuário (ADMIN, solicitante por `UPDATE`, superadmin) dispara separar e,
`d` ms depois, cancelar; 10 por `d`, `APROVADO` com quantidade 1:

| rota | d=0 | d=2 | d=4…12 | total |
|---|---|---|---|---|
| outros módulos | 4/10 | 0/10 | 0 | **4/70** |
| almoxarifado | 7/10 | 1/10 | 0 | **8/70** |

A janela é de poucos milissegundos (a passada de validação e as gravações da rodada), mas existe sem gancho nenhum.

**A corrida inversa (achado novo — vira C153):** o gancho no `UPDATE … SET status='CANCELADO'` roda a separação **inteira**
antes do `UPDATE` do cancelamento (o cancelamento já leu o status):

| rota | `APROVADO` | `TOTALMENTE_RESERVADA` |
|---|---|---|
| almoxarifado (`WHERE id=?`, sem guarda — `routes/almoxarifado.js:4023`) | **5/5** cancela requisição já `EM_SEPARACAO`, com item separado 1, reserva `LIBERADA` | **5/5** |
| outros módulos (`AND status IN ('PENDENTE','APROVADO')`) | 0/5 (400) | 0/5 (400 — não aceita hoje) |

É a transição `EM_SEPARACAO → CANCELADO`, que a máquina proíbe, feita por escrita sem guarda. Material na caixa de uma
requisição cancelada, sem reserva. A rota dos outros módulos está protegida **hoje** pela lista fixa do `WHERE`; ao aceitar
os seis, só o *compare-and-set* com o status lido a mantém protegida.

**A distribuição da nota × cancelamento de *Aguardando*** (leitura, não sonda): `reservaChegadaService.distribuirSemLock`
relê a requisição **depois** de `criarReserva` e desfaz a reserva se ela saiu da espera (RN-09 da 74,
`reservaChegadaService.js:394-401`); o recálculo da 76 é *compare-and-set* (`:140-142`) e não toca `CANCELADO`. O
cancelamento do almoxarifado já aceita `AGUARDANDO_*` hoje. Esperado: sem reserva presa. **Vira cenário da integração
(T5)** em vez de afirmação.

### 3. O log enganoso da C148 — confirmado

Gancho no `UPDATE requisicoes_almoxarifado SET status=?, aprovador_id=?…` do `/aprovar` (dentro da trava, depois de
`prepararPosAprovacao` reservar): S cancela pelos outros módulos e só então o `UPDATE` guardado roda (perde). N=5:

- desfecho certo **5/5**: `/aprovar` 400 *"Transição inválida: CANCELADO → APROVADO"*, cancelamento 200, `CANCELADO`, 0
  reservas `ATIVA`, **uma** `LIBERACAO_RESERVA`, r=0;
- log enganoso **5/5**: `[almoxarifado-aprovar] Falha ao desfazer reserva ⟨id⟩ — Reserva liberada não pode ser liberada`
  (`requisitionService.js:314-327`, `desfazerReservas`).

A 92 **não alarga** essa janela (o `/aprovar` só parte de `PENDENTE`, que já era cancelável). A metade (2) da C148 (o
`antes` da trilha lido fora do `UPDATE`) é fechada pelo *compare-and-set* da T1.

### 4. Os testes que tocam isto (antes/depois, sem edição, salvo os marcados)

- **`/api/requisicoes-material`** (`grep -ln requisicoes-material server/tests/api/*.js`): **12** arquivos —
  `filaTravaIntegracao`, `integracaoAprovacoesRegra`, `integracaoRegrasUrgenciaCliente`, `recebimentoAvisoEntrada`,
  `recebimentoAvisoEntradaIntegracao`, `relatoriosIndicadoresSpec27`, `requisicaoCancelarOutrosModulosReserva`,
  `requisicaoCriacao`, `requisicaoOrdemItens`, `requisicaoUrgencia`, `saldoEmTerceiros`, `smoke` (o plano da 91 contava
  10; são 12 hoje).
  - Chamam o **cancelamento dos outros módulos**: só **2** — `requisicaoCancelarOutrosModulosReserva` (o caso **(d)**
    afirma 400 em `TOTALMENTE_RESERVADA`: **vai inverter, é a regra mudando** — editado na T1, com o motivo no teste) e
    `filaTravaIntegracao` jornada B (`:356-405`, cancela em `APROVADO` — continua).
  - `saldoEmTerceiros` varre `routes/requisicoesMaterial.js` (`:408-417`): nada de conta de disponível na rota.
- **Cancelamento do almoxarifado** (`requisicoes/…/cancelar`): **6** — `auditoriaAtosEGate`,
  `recebimentoReservaChegadaIntegracao`, `requisicaoEstados`, `requisicaoReservaAutomatica`, `reservaCicloIntegracao`,
  `reservaLiberarSoQuemPode`.
- **Separação** (`/separar`, `/separacao`, `separarRequisicao`): **28** arquivos (`alertaJornada` … `trocaSeparacao`; a
  lista sai de `grep -lE "/separar[\`'\"/]|/separacao[\`'\"]|separarRequisicao" server/tests/api/*.js`).
- **`desfazerReservas`**: `requisicaoPosAprovacaoPortas` (`:285-298`, o caso de serviço que solta o hold) e
  `travaRevisaoFase5` (`:326-339`, troca a função pelo objeto). Nenhum teste afirma a linha "Falha ao desfazer reserva".
- **Cliente** `client/src/components/almoxarifado/RequisicoesList.test.js`: **Cancelar Requisição** só em `:164` e
  `:176`, ambos no modo almoxarifado (`mockWarehouseMode = true`, padrão do `beforeEach` `:95`) e com o usuário mockado
  (`id 99`, `role admin`, `:43`) **igual** ao solicitante da fixture (`:67-69`). Quatro cenários põem
  `mockWarehouseMode = false` (`:587`, `:856`, `:973`, `:1095`) e **nenhum** olha o botão. Nenhum cobre os seis status
  fora do modo almoxarifado nem o administrador que não pediu.
- `test:almoxarifado` (44 casos) e o cliente inteiro (93 suítes) — medir antes/depois.

### 5. O que a Fase 0 conferiu e não confere com o rascunho do plano da 91

- O rascunho dizia "`UPDATE`s para `EM_SEPARACAO` em `:913`, `:925`, `:932`": são `:912`, `:924` e `:932` (o 924 é o
  da terceira tentativa do *compare-and-clear*). Sem efeito.
- O rascunho propunha guardar **os três `UPDATE`** com `AND status IN (…)`. **Não basta** (medido por leitura e pela
  coluna "com quantidade" acima): eles rodam **depois** de gravar `quantidade_separada`, a rodada
  (`separacoes_requisicao_almoxarifado`) e a troca de origem — a guarda no fim recusaria com a rodada já gravada numa
  requisição cancelada, e a rodada é *append-only* (RN-02 da 28). Por isso a decisão é **reivindicar antes de gravar**
  (B436).
- O rascunho dizia "testes que usam `/api/requisicoes-material`: 10" — são **12**.

---

## Decisões reversíveis (letra B do documento de novidades; última usada: B433)

- **B434 — aceitar na rota dos outros módulos os seis status que a tela oferece (C149).** Escolhido: a rota aceita
  exatamente `PENDENTE, APROVADO, AGUARDANDO_ESTOQUE, AGUARDANDO_COMPRA, PARCIALMENTE_RESERVADA, TOTALMENTE_RESERVADA`, só
  para quem pediu, e solta as reservas como já fazia. **Descartado:** esconder o botão nesses quatro status — deixa quem
  pediu sem caminho (o **C140 (3)** manda cancelar) e o material preso até o almoxarife cancelar. **Reverte** a parte
  "cancelar requisição já reservada pelos outros módulos fica de fora" da **B426**. Para reverter: voltar a constante a
  `['PENDENTE','APROVADO']` e esconder o botão.
- **B435 — compare-and-set com o status lido, uma nova tentativa.** Escolhido: ler `status` (do solicitante), recusar se
  não está na lista, `UPDATE … WHERE id=? AND solicitante_id=? AND status=?` com o lido; perdeu → reler e tentar **uma**
  vez; perdeu de novo → o 400 de hoje. A trilha grava o status que o `UPDATE` trocou. **Descartados:** `status IN (lista)`
  sem o lido (a trilha continuaria podendo mentir — C148 (2) — e um `TOTALMENTE → PARCIALMENTE` do recálculo no meio
  passaria sem ninguém saber); tentar até conseguir (sem teto, uma corrida contínua prende a rota).
- **B436 — a separação reivindica a requisição antes de gravar.** Escolhido: depois de toda a validação (passada 1) e
  **antes** da primeira gravação, `UPDATE requisicoes_almoxarifado SET status='EM_SEPARACAO', updated_at=CURRENT_TIMESTAMP,
  ultimo_lembrete_enviado=NULL WHERE id=? AND status IN (PODE_SEPARAR)`; perdeu → o 400 de hoje (literal abaixo) e **nada
  gravado**. Depois disso o cancelamento não passa (a máquina não deixa `EM_SEPARACAO → CANCELADO`). O `else` de
  `:930-934` (Iniciar Separação sem quantidade) some — a reivindicação já fez o que ele fazia. **Descartados:** guardar só
  os `UPDATE` do fim (rodada gravada numa cancelada — §5); desfazer a rodada ao perder (a rodada é *append-only*); 409 com
  literal novo (a tela já mostra o `error` do 400; nenhuma tela distingue 409 aqui). ~~**Consequência aceita:** se o banco
  falhar no meio das gravações, a requisição fica `EM_SEPARACAO` sem a rodada — o mesmo estado de "Iniciar Separação"
  sem quantidade, que já existe e se completa separando de novo.~~ **(corrigido na Fase 2 — a consequência não era
  aceitável):** a requisição presa em `EM_SEPARACAO` por uma gravação que falhou **perde o Cancelar** de quem pediu (a
  máquina não tem `EM_SEPARACAO → CANCELADO`) e, vinda de `PARCIALMENTE_ATENDIDA`, perde também o **Encerrar**. Por isso
  as gravações depois da reivindicação ficam num `try/catch`: se falhar **antes** de a rodada ser inserida e o status
  lido (`reqRow.status`) não era `EM_SEPARACAO`, a separação **devolve** o status — `UPDATE requisicoes_almoxarifado SET
  status=? , updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='EM_SEPARACAO'` com o lido — e relança o erro (RN-09).
  Depois da rodada inserida não devolve (a rodada é *append-only* e `EM_SEPARACAO` é o estado certo de uma requisição
  com rodada). **Residual declarado:** (1) item gravado antes da falha (dois itens, o segundo falha) continua com
  `quantidade_separada` — a passada 2 sem transação já era assim antes da 92 (motor sem transação, memória "migração
  para Postgres"); (2) o "lido" é o da primeira leitura: um recálculo `TOTALMENTE ↔ PARCIALMENTE` entre a leitura e a
  reivindicação seria desfeito para o status velho — o próximo recálculo/gesto corrige, e exige falha de banco **e**
  corrida no mesmo instante; (3) o `ultimo_lembrete_enviado` zerado pela reivindicação não volta (o lembrete só reenvia
  mais cedo).
- **B437 — o cancelamento do almoxarifado ganha o mesmo compare-and-set (C153).** Escolhido: `UPDATE … WHERE id=? AND
  status=?` com o status lido; perdeu → reler, `validarTransicao` de novo, uma nova tentativa; perdeu de novo ou a
  transição não vale mais → 400 *"Não é possível cancelar neste status"*. A trilha grava o status trocado. Resposta,
  403/404 e literais inalterados. **Descartado:** deixar para outra etapa — é o mesmo conserto, a mesma corrida medida
  (10/10), e a reivindicação da separação sozinha não fecha a ordem inversa.
- **B438 — o desfazer da aprovação que perde não acusa falha quando a reserva já não está ativa (C148 (1)).** Escolhido:
  `desfazerReservas` lê o status da reserva antes de liberar; se não é `ATIVA`, não chama `liberarReserva` e registra
  `console.info` com literal próprio (abaixo). A falha **real** (reserva ativa que não solta) continua no `console.warn` de
  hoje. **Residual declarado (Fase 2):** a leitura e o `liberarReserva` não são atômicos — o cancelamento que solta a
  reserva **entre** a leitura (`ATIVA`) e o `liberarReserva` ainda produz o W1 enganoso. A janela encolhe de "toda a
  aprovação perdida" para um `await`; fechá-la pediria o `liberarReserva` reconhecer "já solta" (contrato do motor), fora
  desta etapa. Dito no C da etapa. **Descartados:** reconhecer o erro pela mensagem *"Reserva liberada não pode ser liberada"* (acoplamento a texto de
  outro serviço); só declarar (a linha parece incidente, 5/5 na corrida medida).
- **B439 — fora do modo almoxarifado, o botão Cancelar é só de quem pediu (C152).** Escolhido: a tela dos outros módulos
  mostra **Cancelar Requisição** só quando `detalhe.solicitante_id === user.id`; no modo almoxarifado continua
  `solicitante || isAdmin` (a rota do almoxarifado aceita o administrador). **Descartado:** a rota dos outros módulos
  aceitar o administrador — alarga **quem** cancela por uma porta que nunca teve dono além do solicitante (mudança de
  autorização sem pedido), e o administrador tem a tela do almoxarifado.
- **B440 — as listas de status da tela viram constantes nomeadas, e a do servidor é conferida contra a da tela.**
  `client/src/components/almoxarifado/requisicaoLabels.js` exporta `STATUS_CANCELAVEIS_OUTROS_MODULOS` (os seis) e
  `STATUS_CANCELAVEIS_ALMOXARIFADO` (os sete de hoje do modo almoxarifado, sem mudança); o servidor exporta
  `CANCELAVEIS_OUTROS_MODULOS` de `requisitionStateMachine.js`; um teste de API lê o arquivo do cliente e compara (molde:
  `configuracoesGerais.api.test.js:37`). **Descartado:** importar uma da outra (o CRA não importa de fora de `src/`); lista
  escrita à mão no teste (seria a mesma mentira dos dois lados).
- **B441 — o material solto pelo cancelamento volta ao disponível solto (B397/C135).** Cancelar uma *Totalmente
  Reservada* devolve o material ao disponível **sem** redistribuir para quem espera — a próxima nota, inspeção, NC ou
  aprovação é que leva. **Descartado nesta etapa:** distribuir no cancelamento (seria a sétima porta da trava).
  **(corrigido na Fase 2)** O texto anterior citava o CLAUDE.md errado. O CLAUDE.md:105 diz *"Porta nova que ponha saldo
  no disponível **ou** o leia para reservar tem de pegar a trava"* — e o cancelamento **põe** saldo no disponível, então
  pela letra de hoje ele cairia na regra. A escolha (não pegar a trava) **fica**, com a justificativa explícita: a trava
  existe para quem **distribui** — quem lê o disponível e reserva para a fila (C131: duas distribuições vendo o mesmo
  livre). Soltar reserva só **aumenta** o disponível; um leitor que reserva sob a trava, com um aumento concorrente, no
  pior caso vê **menos** livre do que há (deixa para a próxima porta), nunca mais — não há reserva a maior. E três portas
  que soltam já rodam sem a trava hoje, pela mesma razão: a liberação manual (`routes/almoxarifado/extended.js:951`; o
  recálculo da 76 em `:958`), a expiração e o próprio cancelamento do almoxarifado. A **T6** aperta o CLAUDE.md:105 para
  *"porta nova que ponha saldo no disponível **e distribua**, ou o leia para reservar"*, para a regra dizer o que a base
  faz. Mantido; dito no C da etapa.

## Regras de negócio

Os testes levam o prefixo `[92 RN-xx]` no nome; o manual cita o mesmo ID.

- **RN-01 (os seis status, só quem pediu)** — para cada `s` em `CANCELAVEIS_OUTROS_MODULOS`, requisição de S em `s` (com
  reserva `ATIVA` de 4 em `PENDENTE`, `APROVADO`, `PARCIALMENTE_RESERVADA`, `TOTALMENTE_RESERVADA`; sem reserva nos
  `AGUARDANDO_*`): S cancela pelos outros módulos → **200 `{"success":true}`**, `CANCELADO`, a reserva `LIBERADA` com uma
  `LIBERACAO_RESERVA` *"Liberação por cancelamento de requisição"*, r=0, **uma** trilha `CANCELAMENTO` com
  `dados_anteriores.status = s`, `dados_novos.via = 'requisicoes-material'`, `usuario_id = S`.
  (b) Nos outros nove status (`RASCUNHO`, `AGUARDANDO_APROVACAO_VALOR`, `EM_SEPARACAO`, `PRONTA_PARA_RETIRADA`,
  `PARCIALMENTE_ATENDIDA`, `ENTREGUE`, `ENCERRADA`, `REJEITADO`, `CANCELADO`) → **400** *"Requisição não encontrada ou não
  pode ser cancelada"*, nada muda, nenhuma trilha. (c) OUTRO usuário (não S) em cada um dos seis → o mesmo 400, reserva
  `ATIVA`, status igual. (d) id inexistente → o mesmo 400.
- **RN-02 (compare-and-set: o status que mudou no meio)** — gancho no `UPDATE … SET status='CANCELADO'` da rota dos outros
  módulos: (a) R de S em `TOTALMENTE_RESERVADA`; no instante do `UPDATE` o status vira `PARCIALMENTE_RESERVADA` → **200**,
  `CANCELADO`, a trilha com `dados_anteriores.status = 'PARCIALMENTE_RESERVADA'`, o `UPDATE` emitido **2** vezes
  (contador do gancho). (b) o status muda **duas** vezes seguidas entre status aceitos (`TOTALMENTE → PARCIALMENTE` na
  primeira emissão, `PARCIALMENTE → TOTALMENTE` na segunda) → **400** de RN-01 (b), status `TOTALMENTE_RESERVADA`, reserva
  `ATIVA`, nenhuma trilha, `UPDATE` emitido **2** vezes (uma nova tentativa só). **(Fase 2)** Note que aqui o R1 diz "não
  pode ser cancelada" sobre uma requisição que **é** cancelável (`TOTALMENTE_RESERVADA`) — consequência do teto de uma
  nova tentativa (B435), declarada no **C155** (quem integra pode tentar de novo). (c) o status vira `EM_SEPARACAO` no
  instante → 400, `EM_SEPARACAO`, reserva `ATIVA`, `UPDATE` emitido 1 vez (a releitura recusa sem tentar).
- **RN-03 (a separação não ressuscita)** — gancho na **primeira** emissão de `SET status='EM_SEPARACAO'` da separação
  (depois da T0, a reivindicação): o cancelamento roda inteiro ali. Para cada rota de cancelamento (outros módulos, por S;
  almoxarifado, por S) × os cinco status de onde se separa e se cancela (`APROVADO`, `AGUARDANDO_ESTOQUE`,
  `AGUARDANDO_COMPRA`, `PARCIALMENTE_RESERVADA`, `TOTALMENTE_RESERVADA`) × {com quantidade 1, sem quantidade}: cancelamento
  **200**; separação **400** *"Requisição deve estar aprovada, aguardando estoque/compra, em separação ou parcialmente
  atendida para separar"*; status **`CANCELADO`**; **nada gravado** pela separação — `quantidade_separada` 0,
  `origem_separacao_id`/`lote_separacao_id` como antes, 0 linhas em `separacoes_requisicao_almoxarifado` e em
  `substituicoes_origem_requisicao` da requisição, nenhuma trilha `SEPARACAO`; reserva `LIBERADA` (onde havia), r=0.
  (Hoje: 50/50 ressuscitadas pela rota do almoxarifado, 10/10 pela dos outros módulos em `APROVADO`.)
- **RN-04 (o cancelamento não sobrescreve a separação)** — gancho no `UPDATE … SET status='CANCELADO'` de cada rota: a
  separação inteira (quantidade 1, ALMOXARIFE) roda ali → separação 200 `EM_SEPARACAO`; cancelamento **400** com o literal
  da rota (outros: *"Requisição não encontrada ou não pode ser cancelada"*; almoxarifado: *"Não é possível cancelar neste
  status"*); status `EM_SEPARACAO`; reserva `ATIVA`; `quantidade_separada` 1; nenhuma trilha `CANCELAMENTO`. Status de
  partida `APROVADO` e `TOTALMENTE_RESERVADA`. (Hoje: rota do almoxarifado 10/10 cancela a separada.)
  (b) Rota do almoxarifado, gancho que troca `TOTALMENTE → PARCIALMENTE` no instante → 200, a trilha com
  `PARCIALMENTE_RESERVADA` (a nova tentativa da B437).
- **RN-05 (o desfazer não acusa falha à toa — C148 (1))** — gancho no `UPDATE … SET status=?, aprovador_id=?` do
  `/aprovar` (dentro da trava): S cancela pelos outros módulos ali → `/aprovar` 400 *"Transição inválida: CANCELADO →
  APROVADO"*, cancelamento 200, `CANCELADO`, 0 reservas `ATIVA`, **uma** `LIBERACAO_RESERVA`; **nenhuma** linha de
  `console.warn` com *"Falha ao desfazer reserva"*; **uma** linha de `console.info` com o literal I1. (b) Controle de
  regra: `desfazerReservas` com uma reserva `ATIVA` cujo `stockService.liberarReserva` lança → o `console.warn` de hoje
  continua (a falha real não foi calada). (c) `desfazerReservas` com reserva `ATIVA` → `LIBERADA` (hold devolvido) — o
  caminho de sempre.
- **RN-06 (a tela dos outros módulos)** — `RequisicoesList` com `warehouseMode = false`: (a) para cada um dos seis status,
  solicitante = usuário → o botão **Cancelar Requisição** existe; clicar (com `window.confirm` → `true`) chama
  `api.put('/requisicoes-material/55/cancelar')` e mostra o toast *"Requisição cancelada"*. (b) nos nove outros status →
  sem botão. (c) usuário administrador que **não** é o solicitante, nos seis → **sem** botão (B439). (d) a API responde 400
  `{ error: 'Requisição não encontrada ou não pode ser cancelada' }` → `toast.error` com esse texto. (e) modo almoxarifado
  inalterado: sete status, solicitante **ou** administrador, `PUT /almoxarifado/requisicoes/55/cancelar`.
- **RN-07 (a lista da rota é a lista da tela)** — o teste de API lê `requisicaoLabels.js`, extrai o array de
  `STATUS_CANCELAVEIS_OUTROS_MODULOS` e compara com `requisitionStateMachine.CANCELAVEIS_OUTROS_MODULOS` (mesmos elementos,
  mesma ordem); e cada um dos seis tem `validarTransicao(s, 'CANCELADO').ok === true`.
- **RN-08 (o material volta solto — B441)** — R1 de S `TOTALMENTE_RESERVADA` com 4 (o material todo); R2 (criada depois)
  `AGUARDANDO_ESTOQUE` pedindo 4. S cancela R1 pelos outros módulos → R1 `CANCELADO`, material r=0 e disponível 4; **R2
  continua `AGUARDANDO_ESTOQUE` sem reserva** (o cancelamento não distribui). Regra **declarada**, testada para que uma
  mudança futura seja visível.
- **RN-09 (a separação que falha depois de reivindicar devolve o status — Fase 2)** — R de S em `APROVADO` (e em
  `PARCIALMENTE_ATENDIDA`, onde o Encerrar também se perderia), quantidade 1; `db.run` embrulhado faz **falhar** o
  `UPDATE itens_requisicao_almoxarifado SET quantidade_separada` (a primeira gravação depois da reivindicação) → a
  separação lança (a rota responde o erro de sempre, 500 pelo `handleError`); status **igual ao lido** (`APROVADO` /
  `PARCIALMENTE_ATENDIDA`); 0 rodadas; o gancho de falha disparou **1** vez; e S ainda cancela pelos outros módulos
  (200) no caso `APROVADO`. (b) Partindo de `EM_SEPARACAO` (Iniciar Separação já feito), a mesma falha → status continua
  `EM_SEPARACAO` (não há o que devolver). (c) Falha **depois** da rodada (no `INSERT` da trilha não — essa é best-effort;
  no `UPDATE` do *compare-and-clear*) → status `EM_SEPARACAO`, a rodada gravada, nada devolvido.

## Contrato (congelado)

### Literais

| id | onde | texto (exato) | código |
|---|---|---|---|
| R1 | rota dos outros módulos — recusa (inalterado) | `Requisição não encontrada ou não pode ser cancelada` | 400 |
| R2 | rota do almoxarifado — recusa (inalterado) | `Não é possível cancelar neste status` | 400 |
| R3 | rota do almoxarifado — inexistente (inalterado) | `Não encontrada` | 404 |
| R4 | rota do almoxarifado — nem dono nem admin (inalterado) | `Sem permissão` | 403 |
| S1 | separação — status fora de `PODE_SEPARAR`, na leitura **ou** na reivindicação (inalterado) | `Requisição deve estar aprovada, aguardando estoque/compra, em separação ou parcialmente atendida para separar` | 400 |
| L2, L2b, L3 | rota dos outros módulos — avisos da liberação/trilha (inalterados, `routes/requisicoesMaterial.js:368-386`) | os de hoje | — |
| W1 | `desfazerReservas` — falha real (inalterado) | `console.warn('[almoxarifado-aprovar] Falha ao desfazer reserva', id, '—', msg)` | — |
| I1 | `desfazerReservas` — reserva já não ativa (**novo**) | `` console.info(`[almoxarifado-aprovar] Reserva ${id} ja estava ${status} — nada a desfazer`) `` | — |
| I2 | separação — perdeu a reivindicação (**novo, Fase 2**; a resposta continua S1) | `` console.info(`[almoxarifado-separacao] Requisicao ${requisicaoId} saiu de ${reqRow.status} antes da separacao gravar — recusada`) `` | — |
| W2 | separação — gravação falhou depois da reivindicação, status devolvido (**novo, Fase 2**) | `` console.warn(`[almoxarifado-separacao] Requisicao ${requisicaoId}: gravacao falhou depois da reivindicacao; status devolvido a ${reqRow.status}: ${e.message}`) `` | — |

Respostas de sucesso inalteradas: `{ success: true }` nas duas rotas de cancelamento; a da separação
(`{ success, status: 'EM_SEPARACAO', rodada_id, itens_tocados }`).

### Constante — `server/services/almoxarifado/requisitionStateMachine.js` (T0)

`CANCELAVEIS_OUTROS_MODULOS = Object.freeze(['PENDENTE', 'APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA',
'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA'])`, exportada. Comentário: é a lista da tela fora do modo almoxarifado
(`requisicaoLabels.js`), conferida por RN-07; subconjunto do que `TRANSICOES` deixa ir a `CANCELADO`.

### Separação — `requisitionService.separarRequisicao` (T0)

Logo **antes** de `const tocados = []` (`:847`, depois de toda a passada 1):
```js
const claim = await dbRun(db, `UPDATE requisicoes_almoxarifado
    SET status='EM_SEPARACAO', updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL
  WHERE id=? AND status IN (${PODE_SEPARAR.map(() => '?').join(',')})`, [requisicaoId, ...PODE_SEPARAR]);
if (!claim.changes) { console.info(I2); const err = new Error(S1); err.status = 400; throw err; }
```
**(Fase 2)** Tudo o que grava depois da reivindicação (os `UPDATE` dos itens, o `INSERT` da rodada e o que segue até o
fim do bloco da rodada) fica num `try { … } catch (e) { … }`: se `rodadaId == null` (a rodada não foi inserida) **e**
`reqRow.status !== 'EM_SEPARACAO'` → `UPDATE requisicoes_almoxarifado SET status=?, updated_at=CURRENT_TIMESTAMP WHERE
id=? AND status='EM_SEPARACAO'` com `reqRow.status` (falha do próprio desfazer → `console.error`, sem mascarar o erro
original), `console.warn` W2; e **relança** `e` sempre. RN-09.
O `else` de `:930-934` é removido (a reivindicação já gravou `EM_SEPARACAO` e zerou o lembrete). Os `UPDATE` de
`:912`/`:924` (o *compare-and-clear* da conferência) ficam **como estão** — continuam regravando `EM_SEPARACAO` e limpando
a conferência. A reivindicação **não** limpa a conferência (só a rodada com quantidade limpa — D3 da 28).
A literal S1 vira constante do módulo (`MSG_STATUS_SEPARAR`) usada nos dois pontos.

### Rota — `PUT /api/requisicoes-material/:id/cancelar` (T1, `routes/requisicoesMaterial.js:351-390`)

```js
let trocado = null; let numero = null;
for (let tentativa = 0; tentativa < 2 && !trocado; tentativa++) {
  const row = await dbGet(db, 'SELECT status, numero FROM requisicoes_almoxarifado WHERE id = ? AND solicitante_id = ?', [id, req.user.id]);
  if (!row || !CANCELAVEIS_OUTROS_MODULOS.includes(row.status)) break;
  const r = await dbRun(db, `UPDATE requisicoes_almoxarifado SET status='CANCELADO', updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL
     WHERE id=? AND solicitante_id=? AND status=?`, [id, req.user.id, row.status]);
  if (r.changes > 0) { trocado = row.status; numero = row.numero; }
}
if (!trocado) return res.status(400).json({ error: R1 });
```
Depois: liberação e trilha **as de hoje** (best-effort, L2/L2b/L3), com `dados_anteriores: { status: trocado }` e
`dados_novos: { status: 'CANCELADO', numero, via: 'requisicoes-material' }`. `catch` externo → 500 `{ error: err.message }`
(como hoje). O arquivo é varrido pelo `saldoEmTerceiros`: nada de conta de disponível.

### Rota — `PUT /api/almoxarifado/requisicoes/:id/cancelar` (T2, `routes/almoxarifado.js:4013-4056`)

Vira `async`. Primeira leitura `SELECT * … WHERE id=?` → 404 R3 / 403 R4 como hoje (dono ou `isSystemAdmin`). Laço de
**2** tentativas: `validarTransicao(row.status,'CANCELADO')` falha → 400 R2; `UPDATE … SET status='CANCELADO',
rejeicao_motivo=?, updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL WHERE id=? AND status=?` com o lido;
`changes` 0 → reler (`SELECT * … WHERE id=?`) e repetir; esgotou → 400 R2. Depois, **o de hoje**:
`reservationService.liberarReservasDaRequisicao(…, motivo || 'Requisição cancelada')` (falha → `console.warn` de hoje),
auditoria `CANCELAMENTO` com `dados_anteriores: { status: trocado }`, `dados_novos: { status: 'CANCELADO', numero }`,
`justificativa: motivo || null` (falha → `console.error` de hoje), e `res.json({ success: true })` sempre que o `UPDATE`
venceu.

### `requisitionService.desfazerReservas` (T3)

Para cada `r`: `const atual = await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?',
[r.reserva_id])`; se `atual && atual.status !== 'ATIVA'` → `console.info` I1 e `continue`; senão o `try/liberarReserva/
catch → W1` de hoje. Continua dentro da trava (B433).

### Cliente (T4)

`requisicaoLabels.js` exporta `STATUS_CANCELAVEIS_OUTROS_MODULOS` (os seis, nesta ordem) e
`STATUS_CANCELAVEIS_ALMOXARIFADO` (`['RASCUNHO', ...os seis]`). `RequisicoesList.js:1835-1840` passa a:
`(warehouseMode ? STATUS_CANCELAVEIS_ALMOXARIFADO : STATUS_CANCELAVEIS_OUTROS_MODULOS).includes(detalhe.status) &&
(detalhe.solicitante_id === user?.id || (warehouseMode && isAdmin))`. `handleCancelar` inalterado. **Sem mudança visual.**

### O que não muda

Quem cancela por cada porta (só o solicitante nos outros módulos; dono ou admin no almoxarifado); a liberação das
reservas e a trilha (T5 da 91); a máquina de estados; a trava das seis portas (o cancelamento **não** pega a trava —
**(corrigido na Fase 2)** não porque o CLAUDE.md o dispense: pela letra de hoje (`:105`, "ponha saldo no disponível ou o
leia para reservar") ele cairia na regra; a razão é a da B441 — soltar só aumenta o livre e não distribui, como a
liberação manual, a expiração e o cancelamento do almoxarifado já fazem sem a trava; a T6 aperta a frase do CLAUDE.md);
a resposta de todas as rotas tocadas.

## Técnica dos testes de corrida

1. **Gancho no SQL** (técnica de `reservaRecalculoRevisaoFase5.api.test.js:110-118` e da sonda): `db.run` da instância
   embrulhado; ao reconhecer o comando (regex com `\s+`/`\s*`: `/SET\s+status\s*=\s*'EM_SEPARACAO'/`,
   `/SET\s+status\s*=\s*'CANCELADO'/`, `/SET\s+status\s*=\s*\?,\s*aprovador_id/`), desarma (uma vez por rodada, salvo
   RN-02 (b), que arma duas), roda o gesto concorrente **até a resposta** e só então emite o comando retido
   (`g().then(() => origRun(sql, ...rest))`). Contador de emissões por regex — cada cenário afirma quantas vezes o gancho
   disparou (um gancho que não disparou é rodada sem valor). Tudo restaurado no `finally`.
2. **Usuário por requisição:** o middleware `x-teste-usuario` da 91 (`sonda91-lib.js`, inserido logo depois do
   `jsonParser`) — S cancela, ALMOXARIFE separa, GESTOR/ADMIN aprova, no mesmo teste. **Cada cenário afirma quem agiu**
   (trilha `CANCELAMENTO.usuario_id = S`; rodada `separacoes_requisicao_almoxarifado.usuario_id = ALMOXARIFE`) — sem isso
   um 403 por usuário trocado passaria por "400 certo".
3. **`comPrazo(promessa, 5000, rotulo)`** em toda chamada dentro de gancho.
4. RN-02 muda o status no gancho por `UPDATE` direto (simulação do recálculo); a integração (T5) faz o mesmo pelo
   **recálculo real** da 76.

## Tasks

**Ordem topológica: T0 → T1 → T2 → T3 → T4 → T5 → T6.** T0 é **tronco** (muda a regra compartilhada: a separação e a
constante da máquina); T1, T2, T3 são **galhos por regra** (cada um mexe numa porta, e um erro de leitura num não exige
retrabalho no outro), T4 é **galho** (tela contra o contrato congelado acima) — mas **executados em sequência na árvore
principal**: todos sabotam produção nos controles e a suíte bate no mesmo SQLite (G84; memória "sabotagem concorrente
contamina a suíte"). T4 pode rodar em paralelo com T1–T3 numa worktree (junction de `node_modules`) ~~porque não sabota
servidor nem roda a suíte da API~~ — **(corrigido na Fase 2)** ela sabota o servidor (o s4 edita
`requisitionStateMachine.js`) e o RN-07 é teste de API; o paralelo vale porque **tudo** da T4 (sabotagem e testes) roda
dentro da worktree, com o SQLite dela, nunca na árvore principal. Sabotagem por `perl -0pi` com âncora contada = 1, backup `e92-<task>-*.bak`
no scratchpad, restauro por cópia com md5 conferido, um controle de cada vez (base **LF**). Mensagens de commit em
`msg-e92-<task>.txt`. Executores **não** marcam este plano; o fio principal marca.

- [ ] **T0 (tronco) — a separação reivindica a requisição antes de gravar; a constante.** Contrato "Separação" e
  "Constante" acima. Teste novo `server/tests/api/separacaoNaoRessuscita.api.test.js`: **RN-03** pela rota do
  almoxarifado (os 5 status × com/sem quantidade) e pela dos outros módulos em `APROVADO` (os outros quatro status pela
  rota dos outros módulos entram na T1, quando ela os aceitar); e **pelo serviço**: `requisitionService.separarRequisicao`
  chamado direto com o cancelamento no gancho (prova que a guarda mora no serviço, não na rota). **(Fase 2)** E **RN-09**
  (a)–(c) no mesmo arquivo, e a linha I2 afirmada uma vez (espião de `console.info`) num caso de RN-03. **Vermelho
  antes:** todos os casos de RN-03 (medido: ressuscita 5/5 por combinação); RN-09 (a) (o status fica `EM_SEPARACAO` —
  hoje a separação falha **antes** de gravar o status, então o vermelho de (a) só aparece depois da reivindicação: RN-09
  é escrita junto com a reivindicação e o seu vermelho é o controle s5).
  **Numeração dos casos (Fase 2):** cada caso tem nome único `[92 RN-xx] <rota|servico> <status> <com|sem>` e a T1/T2
  acrescentam casos **no fim** do arquivo, sem renumerar nem reordenar os da T0 (o contador do runner é global ao
  arquivo).
  **Medir antes e depois, sem edição:** os 28 arquivos de separação (§4) e `test:almoxarifado`.
  **Controles (cada um diz qual asserção cai e por quê — G85):**
  (s1) sem a reivindicação (volta o `else` e nada antes das gravações) → o gancho casa o `UPDATE` de `:912`, o
  cancelamento roda ali e o `UPDATE` sem guarda ressuscita → cai **"separação 400"** e **"status CANCELADO"**.
  (s2) reivindicação com `WHERE id=?` (sem `status IN`) → o cancelamento roda antes dela e ela sobrescreve → caem as
  mesmas duas. (s3) a reivindicação movida para **depois** das gravações (logo antes do laço do *compare-and-clear*,
  `:902` — **corrigido na Fase 2**, era `:897`) → **com quantidade**: o status termina `CANCELADO` e a separação dá 400
  (a guarda funciona), mas a rodada e `quantidade_separada` já foram gravadas → cai só **"nada gravado"** (0 rodadas,
  separado 0) — é o controle de que a posição importa, não só a guarda. **Sem quantidade (corrigido na Fase 2):** essa
  posição fica **dentro** do `if (tocados.length > 0)`, e com o `else` removido não sai `UPDATE` de status nenhum → o
  gancho não dispara e a separação dá 200 → cai **"gancho disparou"** (e "separação 400"), não "nada gravado". Previsto
  assim, não é surpresa. (s4) S1 trocada por outra frase na reivindicação → cai a asserção do literal. **(s5, Fase 2)**
  sem o `try/catch` do desfazer → cai RN-09 (a) (status `EM_SEPARACAO`; cancelamento 400). (s6, Fase 2) o desfazer
  sem a condição `rodadaId == null` → cai RN-09 (c) (status devolvido com a rodada gravada).
- [ ] **T1 (galho) — a rota dos outros módulos aceita os seis, com compare-and-set (C149, C148 (2)).** Contrato "Rota —
  `PUT /api/requisicoes-material/:id/cancelar`". Acrescenta ao `requisicaoCancelarOutrosModulosReserva.api.test.js`:
  **RN-01** (a)–(d), **RN-02** (a)–(c) (o **RN-07** fica na T4, que cria o export do cliente). **Edita** o caso (d) de hoje (*"TOTALMENTE_RESERVADA -> o mesmo 400
  (declarado)"*): passa a afirmar 200/`CANCELADO`/reserva `LIBERADA`, com comentário *"invertido na Etapa 92 (B434) — a
  regra mudou"*. Acrescenta ao `separacaoNaoRessuscita` os quatro status novos pela rota dos outros módulos (RN-03) e a
  ordem inversa pela rota dos outros módulos (RN-04, `APROVADO` e `TOTALMENTE_RESERVADA`).
  **Vermelho antes:** RN-01 (a) nos quatro novos (400 — medido); RN-02 (a) — **(corrigido na Fase 2)** pelo **400 em vez
  de 200** (a rota de hoje não aceita `TOTALMENTE_RESERVADA`; o gancho nem dispara), não pela trilha; RN-03 nos quatro novos (o cancelamento dá 400 hoje — o teste falha no "cancelamento 200"). RN-04 pela rota dos outros módulos **passa antes** (medido 0/10: o `IN ('PENDENTE','APROVADO')` de hoje já recusa) — entra como guarda de regressão do que a lista nova poderia abrir.
  **Medir antes e depois:** os 12 arquivos de `/api/requisicoes-material` (§4), `saldoEmTerceiros`, `filaTravaIntegracao`.
  **Controles:** (s1) a constante volta a `['PENDENTE','APROVADO']` → caem RN-01 (a) nos quatro e os quatro de RN-03.
  (s2) `UPDATE … AND status IN (lista)` sem o status lido, uma tentativa → cai RN-02 (a) (trilha `TOTALMENTE`, 1 emissão);
  **RN-04 pela rota dos outros módulos não cai** (`EM_SEPARACAO` não está na lista, o `IN` já recusa) — dito aqui para
  ninguém contar com ele como prova do compare-and-set. (s3) sem a nova tentativa (laço de 1) → cai RN-02 (a) (400). (s4)
  laço sem teto (até conseguir) → cai RN-02 (b) (a terceira tentativa vence → 200). (s5) `solicitante_id` tirado **da
  leitura e do `UPDATE`** → cai RN-01 (c). *Tirar só do `UPDATE` não derruba nada:* a leitura já filtra pelo solicitante e
  o `UPDATE` usa o status dela — redundante por construção, declarado (G85). (s6) a trilha com o status da **primeira**
  leitura → cai RN-02 (a) na asserção da trilha.
- [ ] **T2 (galho) — o cancelamento do almoxarifado com compare-and-set (C153).** Contrato "Rota — `PUT
  /api/almoxarifado/requisicoes/:id/cancelar`". Acrescenta ao `separacaoNaoRessuscita`: **RN-04** pela rota do
  almoxarifado (`APROVADO`, `TOTALMENTE_RESERVADA`) e **RN-04 (b)**. **Vermelho antes:** RN-04 (cancela a separada — 10/10
  medido) e RN-04 (b) (trilha com `TOTALMENTE`).
  **Medir antes e depois:** os 6 arquivos do cancelamento do almoxarifado (§4).
  **Controles:** (s1) `UPDATE … WHERE id=?` (sem `AND status=?`) → cai RN-04 (cancelamento 200 sobre `EM_SEPARACAO`). (s2)
  sem a releitura/nova tentativa → cai RN-04 (b) (400 em vez de 200). (s3) a trilha com `r.status` da primeira leitura → cai
  RN-04 (b) na trilha. (s4) a releitura sem `validarTransicao` → **cai RN-04** (a segunda tentativa usaria o status relido
  `EM_SEPARACAO` no `WHERE` e venceria) — é o controle de que a transição é validada de novo.
- [ ] **T3 (galho) — o desfazer não acusa falha à toa (C148 (1)).** Contrato "`desfazerReservas`". Teste novo
  `server/tests/api/aprovarPerdedorReservaJaSolta.api.test.js`: **RN-05** (a)–(c). **Vermelho antes:** (a) (o warn W1
  aparece 5/5 — medido).
  **Medir antes e depois:** `requisicaoPosAprovacaoPortas`, `travaRevisaoFase5`, `filaTravaIntegracao`,
  `requisicaoAprovar*` (`grep -ln aprovar server/tests/api/*.js` — listar na execução).
  **Controles:** (s1) sem a leitura do status → cai RN-05 (a) (o W1 volta). (s2) a leitura pula **toda** reserva
  (`continue` incondicional) → cai RN-05 (c) (a reserva fica `ATIVA`) **e** o caso `[servico]` de
  `requisicaoPosAprovacaoPortas:285`. (s3) o `continue` também no `catch` real (cala W1) → cai RN-05 (b).
- [ ] **T4 (galho — cliente; pode ir em worktree em paralelo com T1–T3) — a tela (C152) e as constantes; RN-07.**
  Contrato "Cliente". `RequisicoesList.test.js`: **RN-06** (a)–(e) com `mockWarehouseMode = false` e um `useAuth`
  mutável (hoje fixo em `{ id: 99, role: 'admin' }`, `:43` — tornar mutável como `mockWarehouseMode`, padrão do arquivo).
  E o **RN-07** no servidor: `server/tests/api/cancelarListaTelaRota.api.test.js` lê
  `client/src/components/almoxarifado/requisicaoLabels.js` (caminho como `configuracoesGerais.api.test.js:37`), extrai o
  array por regex e compara com a constante do servidor; **controle positivo embutido:** o regex aplicado a um texto
  fixo acha o array; o arquivo existe; o array tem 6 elementos (lista vazia por regex errado não pode passar).
  **Vermelho antes:** RN-06 (c) (o admin que não pediu vê o botão) e RN-07 (export inexistente). RN-06 (a)/(b)/(d)/(e)
  passam de primeira (a tela já mostra os seis — é o comportamento que a T1 passa a honrar); por isso o controle s1.
  **Medir:** o cliente inteiro (93 suítes, 1394 testes) e `CI=true npx react-scripts build`.
  **Controles:** (s1) a lista fora do modo almoxarifado volta a `['PENDENTE','APROVADO']` → cai RN-06 (a) nos quatro (e
  RN-07, porque a constante muda). (s2) `|| isAdmin` sem `warehouseMode &&` → cai RN-06 (c). (s3) o modo almoxarifado
  lendo a lista dos outros módulos → cai RN-06 (e) em `RASCUNHO` e os testes de `:164`/`:176` continuam (status reservados
  estão nas duas) — dito para não contar com eles. (s4) um sétimo status na constante do servidor → cai RN-07.
  **(corrigido na Fase 2)** A T4 **não** é só cliente: o (s4) edita `server/services/almoxarifado/requisitionStateMachine.js`
  e o RN-07 é teste de API (`server/tests/api/`). Na worktree, o (s4) roda **só dentro dela** (o arquivo e o teste da
  worktree), nunca na árvore principal enquanto T1–T3 rodam a suíte lá (memória "sabotagem concorrente contamina a
  suíte"); o RN-07 e a suíte da API da T4 rodam na worktree, com o SQLite dela.
- [ ] **T5 — integração cruzando os galhos (T0 × T1 × T2 × T3 × 74 × 76), pela rota e pelo serviço.** Arquivo novo
  `server/tests/api/cancelarOutrosModulosIntegracao.api.test.js`, usuários reais por header (S sem perfil, S2 sem perfil,
  ALMOXARIFE, GESTOR):
  **Jornada A (T1 × 76):** M1 e M2 com 4 cada (v2 `ENTRADA`); S cria R1 por `POST /api/requisicoes-material` pedindo 4 de
  M1 e 4 de M2; GESTOR aprova → `TOTALMENTE_RESERVADA` com duas reservas. S cancela pelos outros módulos e, **no instante
  do `UPDATE` do cancelamento**, o ALMOXARIFE libera a reserva de M2 (`POST /api/almoxarifado/reservas/:id/liberar` — a
  ação `liberar_reserva_requisicao`, regra da 77) → o recálculo **real** da 76 leva R1 a `PARCIALMENTE_RESERVADA` → o
  cancelamento perde, relê, vence: 200, `CANCELADO`, trilha `PARCIALMENTE_RESERVADA`, as duas reservas `LIBERADA`, M1 e
  M2 r=0.
  **Jornada B (T0 × T1 × T2 — separação):** R2 de S, aprovada (`TOTALMENTE_RESERVADA`); o ALMOXARIFE separa 1 e S cancela
  pelos outros módulos **no instante da reivindicação** → separação 400 S1, `CANCELADO`, nada gravado. R3 de S aprovada;
  S cancela **pelo almoxarifado** e a separação inteira roda **no instante do `UPDATE` do cancelamento** → cancelamento 400
  R2, `EM_SEPARACAO`, separado 1, reserva `ATIVA`; o ALMOXARIFE segue e **entrega** R3 pela rota → `ENTREGUE`, a reserva
  `CONSUMIDA` (a separação reivindicada compõe com a entrega da 77). **(corrigido na Fase 2)** Para isso **R3 pede 1**
  (de material **não crítico** — crítico exigiria a segunda conferência antes da entrega): `entregarRequisicao` só grava
  `ENTREGUE` quando todos os itens estão completos (`requisitionService.js:1301`) e a reserva só vira `CONSUMIDA` quando
  zera (`stockService.js:1708`). Com R3 pedindo 4 e separando 1 a entrega daria `PARCIALMENTE_ATENDIDA` e a reserva
  continuaria `ATIVA` com 3. (Alternativa equivalente: R3 pede 4 e a separação no gancho separa os 4.)
  **Jornada C (T1 × 74 — a distribuição da nota):** M3 sem saldo; S cria R4 pedindo 4 → GESTOR aprova →
  `AGUARDANDO_ESTOQUE`. Nota de 4 de M3 (`POST /recebimentos/:id/processar`) e S cancela R4 pelos outros módulos **no
  instante do `criarReserva` da distribuição** (espião em `stockService.criarReserva` pelo objeto, primeira chamada com
  `requisicao_id = R4`) → nota 200, cancelamento 200, R4 `CANCELADO`, **nenhuma reserva `ATIVA` de R4**, M3 q=4 r=0
  (RN-09 da 74 desfez a reserva nascida para a cancelada).
  **Jornada D (RN-08 — solto, não redistribuído):** M4 com 4; R5 de S `TOTALMENTE_RESERVADA` (4); R6 de S2 criada depois,
  aprovada → `AGUARDANDO_ESTOQUE`. S cancela R5 → R5 `CANCELADO`, M4 r=0, **R6 continua `AGUARDANDO_ESTOQUE` sem
  reserva**.
  **Jornada E (T3 pela rota):** RN-05 (a) inteiro entre rotas reais (o `/aprovar` do GESTOR e o cancelamento de S).
  **Pelo serviço:** `requisitionService.separarRequisicao` chamado direto (ALMOXARIFE) contra o cancelamento pela rota
  dos outros módulos no gancho → mesmo resultado da jornada B — prova que a guarda é do serviço e vale para qualquer
  chamador futuro.
  **Controles:** (s1) da T0 → cai a primeira metade da jornada B e o par de serviço. (s2) da T1 → cai a jornada A na
  trilha. (s1) da T2 → cai a segunda metade da jornada B (cancelamento 200 sobre `EM_SEPARACAO`; a entrega então falha
  por status). **(s-RN09)** a releitura de `distribuirSemLock` (`reservaChegadaService.js:394-401`) desligada → cai a
  jornada C (reserva `ATIVA` presa em R4) — é o controle de que a jornada C exercita a janela de verdade (se não cair, o
  espião está no lugar errado). (s1) da T3 → cai a jornada E.
- [ ] **T6 — fechamento (skill `fechar-etapa`).** Novidades: seção da Etapa 92; **B434–B441** (a **B426** ganha "a parte
  'cancelar já reservada fica de fora' foi revertida pela B434"); **C149** ✅ resolvido (texto original mantido); **C148**
  ✅ (as duas metades); **C152** (o administrador que não pediu via o botão — resolvido pela B439); **C153** (o
  cancelamento do almoxarifado sobrescrevia a separação — resolvido); **C154** (o que muda para quem opera: quem pediu por
  outro módulo cancela *Aguardando* e *Reservada*; o material volta solto — B441; o administrador não vê mais o botão
  na tela dos outros módulos; **(Fase 2)** a solicitação de compra aberta por uma *Aguardando compra* **continua aberta**
  depois do cancelamento — `solicitacoes_compra_almoxarifado` é por material, sem coluna de requisição
  (`services/almoxarifado/schema.js:2268`), igual ao cancelamento do almoxarifado hoje; quem compra decide); **C155** (o
  que muda para quem integra: a rota dos outros módulos aceita os seis status; as respostas não mudaram; a separação
  pode responder o 400 S1 quando a requisição foi cancelada no mesmo instante; **(Fase 2)** com o status trocando duas
  vezes durante o cancelamento (RN-02 (b)), a rota responde R1 sobre uma requisição que **é** cancelável — tentar de
  novo; e o W1 ainda pode aparecer na corrida residual da B438);
  **A43** (abaixo); D (92) com o que fica de fora; F (92); "Onde estamos"; cabeçalho. **C140 (3)** e **D (91)** "a
  separação não confere o status" marcados resolvidos pela 92. Specs `04` (status no topo, checklist com hash, o
  "→ cancelar" e o "Fora: C149" corrigidos **à vista**), `05` (a reivindicação da separação), `07` (o cancelamento solta
  reserva em seis status pelos outros módulos); mapa; guia do usuário (roteiro clicável: pelo menu Comercial,
  requisição *Totalmente Reservada*, **Cancelar Requisição** → *Cancelado*, a reserva some da tela **Reservas**); manual
  (RN-01…RN-09 citados); retro de 4 números; **Próxima tarefa detalhada — Etapa 93**. **(Fase 2)** E o **CLAUDE.md:105**
  apertado: *"Porta nova que ponha saldo no disponível **e distribua**, ou o leia para reservar, tem de pegar a trava"*,
  com uma frase dizendo que soltar reserva sem distribuir (liberação manual, expiração, os dois cancelamentos) não pega
  (B441) — commit próprio, como o `688d4459` da 91.

## Teste de integração — por que a T5 é a única prova de três coisas

1. **O compare-and-set só tem valor contra um escritor real.** RN-02 muda o status por `UPDATE` direto; só a jornada A
   prova que o **recálculo da 76** (o escritor que de fato troca `TOTALMENTE ↔ PARCIALMENTE` sem passar pela tela) e o
   cancelamento compõem — e que a trilha conta a verdade.
2. **A separação reivindicada tem de compor com a entrega e com a conferência.** A T0 muda a ordem das gravações; só a
   jornada B segue a requisição até `ENTREGUE` pela rota (a 77 consome a reserva pela entrega).
3. **A distribuição da nota e o cancelamento de *Aguardando* nunca se encontraram pela porta dos outros módulos** (ela não
   aceitava `AGUARDANDO_*`). A RN-09 da 74 foi escrita pensando no cancelamento do almoxarifado; a jornada C prova que
   vale também para a porta nova — pela rota **e** com o controle que desliga a releitura.

## O que fica de fora (declarado — e por quê)

- **Os `UPDATE` da separação depois da reivindicação** (`:912`/`:924`) continuam sem guarda contra uma
  *liberar-retirada*/*entrega* concorrente da mesma requisição (dois almoxarifes na mesma requisição no mesmo instante).
  Anterior à etapa, não envolve o cancelamento (depois da reivindicação ele é recusado), não medido. Candidata.
- **Cancelar *Aguardando aprovação de valor* pelos outros módulos** — a tela não oferece (fora do modo almoxarifado a lista
  não tem esse status); quem pediu pede ao almoxarifado. Sem queixa de uso.
- **Redistribuir o material solto no cancelamento** (B441) — seria porta nova da trava.
- **C145, C147, C150, C139** — como na 91 (medidos lá; nenhuma muda com esta etapa).

## Letra A — consulta para produção (a confirmar no fechamento como **A43**)

Conferida agora contra o esquema real, em memória (`sonda92-a43.js`), **com controle positivo**: uma requisição
ressuscitada e uma cancelada com material na caixa, produzidas pelas duas corridas medidas, aparecem cada uma na sua
consulta; uma cancelada sem corrida não aparece; uma coluna trocada (`a.acaox`) faz o banco recusar.

```sql
-- (a) ressuscitadas: têm trilha de cancelamento e não estão canceladas (a máquina não tem saída de CANCELADO)
SELECT rq.id, rq.numero, rq.status, MAX(a.created_at) AS cancelada_em
  FROM requisicoes_almoxarifado rq
  JOIN auditoria_log_almoxarifado a ON a.entidade = 'requisicao' AND a.entidade_id = rq.id AND a.acao = 'CANCELAMENTO'
 WHERE rq.status <> 'CANCELADO' AND COALESCE(rq.ativo, 1) = 1
 GROUP BY rq.id, rq.numero, rq.status ORDER BY rq.id;
-- (b) canceladas com material separado ainda na caixa (o cancelamento passou por cima da separação)
SELECT rq.id, rq.numero, i.id AS item_id, m.codigo,
       COALESCE(i.quantidade_separada, 0) - COALESCE(i.quantidade_entregue, 0) AS na_caixa
  FROM requisicoes_almoxarifado rq
  JOIN itens_requisicao_almoxarifado i ON i.requisicao_id = rq.id
  JOIN materiais_almoxarifado m ON m.id = i.material_id
 WHERE rq.status = 'CANCELADO' AND COALESCE(rq.ativo, 1) = 1
   AND COALESCE(i.quantidade_separada, 0) - COALESCE(i.quantidade_entregue, 0) > 1e-9
 ORDER BY rq.id;
```
O que fazer com cada linha (para o texto da A43): (a) a requisição está em separação sem reserva e quem pediu ouviu
"cancelada" — falar com quem pediu: se ainda quer, segue a separação; se não, o almoxarife devolve o separado à prateleira
e a requisição fica como está (não há como cancelar `EM_SEPARACAO`; encerrar pela entrega parcial ou excluir pela ação
administrativa). (b) o material está fora da prateleira numa requisição cancelada — devolver à prateleira; nada a corrigir
no saldo (a separação não move estoque).

## Fase 2 — revisão do plano (2026-10-08): 0 bloqueantes, 4 importantes, 8 menores → plano revisto (vale sobre o texto acima)

Revisor fresco (plano + specs 04/05/07, as quatro perguntas da skill). Cada achado foi conferido contra o código antes de
entrar; os pontos afetados acima estão marcados **"(corrigido na Fase 2)"** ou **"(Fase 2)"**.

**Importantes**

1. **B441 e "O que não muda" citavam o CLAUDE.md errado.** O `CLAUDE.md:105` diz "ponha saldo no disponível **ou** o
   leia para reservar" — o cancelamento **põe** saldo no disponível; o plano tinha escrito "para reservar" como se fosse
   a regra. **Escolha mantida** (o cancelamento não pega a trava), agora com a justificativa explícita: a trava protege
   quem **distribui** (C131); soltar só aumenta o livre; a liberação manual (`extended.js:951`, recálculo em `:958`), a
   expiração (`reservationService.js:148`) e o cancelamento do almoxarifado já soltam sem ela. **A T6 aperta o
   CLAUDE.md:105** para "ponha no disponível **e distribua**".
2. **Jornada B da T5 não chegava a `ENTREGUE`.** `entregarRequisicao` grava `ENTREGUE` só com todos os itens completos
   (`requisitionService.js:1301`) e a reserva vira `CONSUMIDA` só ao zerar (`stockService.js:1708`): R3 pedindo 4 e
   separando 1 terminaria `PARCIALMENTE_ATENDIDA` com a reserva `ATIVA`. Corrigido: R3 pede **1**, material não crítico
   (ou separa os 4).
3. **Gravação que falha depois da reivindicação prendia a requisição em `EM_SEPARACAO`.** O plano aceitava isso como
   "o mesmo estado de Iniciar Separação", mas quem pediu **perde o Cancelar** (sem `EM_SEPARACAO → CANCELADO`) e, vinda de
   `PARCIALMENTE_ATENDIDA`, perde o **Encerrar**. Corrigido na T0: `try/catch` nas gravações depois da reivindicação;
   sem rodada inserida e status lido ≠ `EM_SEPARACAO` → `UPDATE … SET status=<lido> WHERE id=? AND
   status='EM_SEPARACAO'`, W2, relança. **RN-09** novo, controles **s5/s6** novos; residual declarado na B436.
4. **A T4 também sabota o servidor.** O s4 edita `requisitionStateMachine.js` e o RN-07 é teste de API. Dito na ordem
   das tasks e na T4: tudo dela roda só dentro da worktree.

**Menores**

1. A separação que perde a reivindicação ganha `console.info` **I2** com literal próprio (a resposta S1 não muda).
2. RN-02 (b) faz a rota responder R1 sobre uma requisição cancelável depois de duas trocas — declarado no **C155**.
3. T3: corrida residual (o cancelamento solta entre a leitura do status e o `liberarReserva` → W1 ainda possível) —
   declarada na **B438** e no C155.
4. Numeração dos casos em `separacaoNaoRessuscita.api.test.js`: nome único por caso; T1/T2 acrescentam no fim.
5. O laço do *compare-and-clear* começa em `requisitionService.js:902` (o plano dizia `:897`).
6. **C154:** a solicitação de compra de uma *Aguardando compra* é por material (`solicitacoes_compra_almoxarifado`, sem
   coluna de requisição) e continua aberta depois do cancelamento — igual ao cancelamento do almoxarifado de hoje.
7. T0 s3 previa errado a metade **sem quantidade**: na posição do controle (dentro do `if (tocados.length > 0)`) não sai
   `UPDATE` de status, o gancho não dispara e cai "gancho disparou" — previsão corrigida.
8. T1: o vermelho de RN-02 (a) é **400 em vez de 200** (a rota de hoje recusa `TOTALMENTE_RESERVADA`), não a trilha.

## Próximo passo

**(Fase 2 feita — ver a seção acima.)** Próximo: T0.

~~Fase 2: um agente fresco~~ (texto original:) Fase 2: um agente fresco recebe este plano + as specs `04`, `05`, `07` e responde as quatro perguntas da skill (contratos
com casos de erro e literais; RN × spec; galhos independentes de verdade; **cada RN seguida até o último gesto do
usuário** — em especial: depois do cancelamento de uma *Reservada* pelos outros módulos, a tela **Reservas** e o
**C140 (3)**; depois da separação recusada, a fila de separação da 64 e o botão "Iniciar Separação"; depois do
compare-and-set, o que a trilha mostra na tela de auditoria). Corrigir o plano e só então a T0.
