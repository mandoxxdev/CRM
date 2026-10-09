# Etapa 94 — a alçada de valor vale até o começo da separação: custo ou limite que mudam depois não tiram da máquina a requisição em separação, pronta ou parcialmente atendida (C68 (47), "fica de fora" da 93, features 06 com a 04, 05 e 07)

> Status: **PLANO REVISTO (Fase 2) — 2026-10-09.** Fase 0 medida (abaixo); a Fase 2 (1 bloqueante, 3 importantes,
> 5 menores) está em "Fase 2 — revisão do plano" e **vale sobre o texto acima** (pontos marcados **"(corrigido na Fase
> 2)"** ou **"(Fase 2)"**). Próximo: **T0**.
> HEAD de partida: `e5d216b6` (main, árvore limpa, sem push).
> Origem: "Próxima tarefa detalhada — Etapa 94" no fim de
> `docs/superpowers/plans/2026-10-09-almoxarifado-etapa93-gestos-concorrentes-mesma-requisicao.md`; o "fica de fora" da 93
> (`verificarBloqueioLiberacao` gravando `AGUARDANDO_APROVACAO_VALOR` de qualquer status); a linha **(93)** de D em
> `docs/almoxarifado-novidades-por-etapa.md` ("A alçada de valor reavaliada depois de começar a separação…"); e o item
> **68** da letra C (Etapa 47) com a consulta **A25** — o mesmo atalho, achado pela revisão do plano da 47 e declarado
> "mudança de máquina de estados, etapa própria". **A próxima tarefa da 93 não citava o C68 nem a A25** (ver "O que
> contradiz a próxima tarefa escrita na 93").
>
> **Numeração:** etapa única para todos os módulos (esta é a **94**). Letras do documento do almoxarifado, conferidas em
> 2026-10-09: última **B452** (`:1609`), último item C **162** (`:19702`), última **A44** (`:1542`). Esta etapa usa
> **B453–B463** (B460–B463 vêm da Fase 2), **C163–C168** e **A45**.

**Escopo desta etapa (o que a Fase 0 reproduziu — e só isso):**
1. **A regra:** a alçada de valor só é reavaliada — e só bloqueia e grava *Aguardando aprovação de valor* — enquanto a
   requisição está num dos cinco status **anteriores à separação** (`APROVADO`, `AGUARDANDO_ESTOQUE`, `AGUARDANDO_COMPRA`,
   `PARCIALMENTE_RESERVADA`, `TOTALMENTE_RESERVADA`) **e** nenhum item tem nada separado nem entregue — **e também em
   `EM_SEPARACAO` vazia** (*Iniciar Separação* sem quantidade; **corrigido na Fase 2, I2**: sexta seta, B462). Com
   material na caixa (`EM_SEPARACAO` com separado, `PRONTA_PARA_RETIRADA` e `PARCIALMENTE_ATENDIDA`) a verificação não
   recalcula, não grava e não recusa. Fecha a sonda 1
   (5/7 por gatilho → 0/7) e a sonda 2 (7/8 por origem → 0/8), medido em protótipo.
2. **A máquina ganha as ~~cinco~~ seis setas** (corrigido na Fase 2, I2: + `EM_SEPARACAO`, B462) pré-separação → `AGUARDANDO_APROVACAO_VALOR` (o caminho do C68 vira transição de
   projeto), e a regra **é** `validarTransicao(status, 'AGUARDANDO_APROVACAO_VALOR')` mais "nada na caixa" — uma fonte só,
   usada pela porta e pela fila.
3. **A gravação da alçada confere o status lido** (`WHERE id = ? AND status = ?`): separar e cancelar no mesmo instante
   **ressuscitavam a cancelada** em *Aguardando aprovação de valor* (**10/10 sem gancho**), e aprovar por valor depois
   reservava de novo. Perdeu → **409** V1.
4. **A fila de separação (64)** usa a mesma regra: hoje mostra *Aguardando aprovação de valor* numa requisição em
   separação, pronta ou parcialmente atendida (medido 3/3). **(Fase 2, I1)** A reserva na chegada (74,
   `reservaChegadaService.bloqueadaPorValor`) é a **terceira** cópia da regra e passa a usar o mesmo predicado (B461).
   **(Fase 2, B1)** O legado com tudo separado ganha o gesto na tela: a fila mostra `RETOMAR_SEPARACAO` e o modal
   confirma com zero ("Reabrir separação") — task **T2c**, de cliente (B460); e o 409 V1 fecha o modal e recarrega (B463).
5. **A45** — duas consultas para produção (o rastro do desvio), conferidas contra o esquema real com controle positivo e
   negativo; a ressuscitada já é pega pela **A43 (a)** (medido).

**Fora (declarado, ver "O que fica de fora"):** o lembrete por e-mail da requisição que volta a aguardar valor depois de
aprovada (C68/A25 continuam); guarda em reprovar/cancelar para o legado com caixa (a A45 orienta); reavaliar só o saldo
a entregar; trava por requisição nos cancelamentos (B450); mais de um processo.

---

## Fase 0 — medido (2026-10-09)

Sondas no scratchpad da sessão (`e94-sonda-lib.js`, `e94-sonda-1-gatilhos.js`, `-2-desfechos.js`, `-3-corrida.js`,
`-3b-natural.js`, `-4-fila.js`, `-5-a45.js`; saídas `e94-sonda-*.out`), contra `server/tests/helpers/testApp.js` com
`requirePermission` real e **usuário por requisição** (`x-teste-usuario`, middleware logo depois do `jsonParser`, molde
92/93): **S** sem perfil (PRODUÇÃO) cria por `POST /api/requisicoes-material` e cancela; **ADMIN** superadmin **aprova
pela rota** (`PUT …/aprovar` → `TOTALMENTE_RESERVADA`), exclui, encerra e muda custo/configuração; **ADMIN2** (id 2,
único aprovador de valor configurado) aprova/reprova por valor; **ALMOX** (`ALMOXARIFE`) separa, libera e entrega.
Material comum, estoque 8, custo 1, pede 4 → valor R$ 4,00; alçada ligada com limite R$ 10,00 (exceto onde dito).

**Os quatro estados de partida:** `RESERVADA` (aprovada, nada separado), `EM_SEPARACAO` (separou 4), `PRONTA` (separou 4
e liberou), `PARCIAL` (separou 4, entregou 2 → `PARCIALMENTE_ATENDIDA`).

**Detector (independe do caminho), aplicado ao estado final:** ativa em status anterior à separação (inclui
`AGUARDANDO_APROVACAO_VALOR`) com separado ou entregue > 0; ativa `REJEITADO`/`CANCELADO` com material na caixa ou
entregue; reserva `LIBERADA` com material na caixa; excluída com estorno ≠ saídas. **Controle do detector:** o fluxo sem
gatilho (0/7 "certo") e a `RESERVADA` que vai a *Aguardando* sem nada na caixa (o caso de projeto — "certo" em todas as
medições) — o detector sabe dizer "certo" e sabe dizer "errado".

### Sonda 1 — o que dispara a reavaliação (`e94-sonda-1-gatilhos.js`)

Quatro gatilhos, **todos por rota real**: (1) `entrada` — `POST /api/almoxarifado/movimentacoes/v2` `ENTRADA` de 1 com
`custo_unitario: 1000` (custo médio vai a 112 → R$ 448,00); (2) `cadastro` — `PUT /api/almoxarifado/materiais/:id`
`custo_unitario: 1000` (vale porque a média é zero: `custoUnitarioSql`, 21.2 do manual); (3) `limite` — `PUT
…/configuracoes/liberacao-valor` com limite R$ 1,00; (4) `ligar` — alçada **desligada** na criação e na aprovação, e
ligada depois (limite R$ 1,00). Sete gestos por gatilho: `RESERVADA`/separar 4; `EM_SEPARACAO`/entregar 2, separar
vazio ("Iniciar Separação"), liberar; `PRONTA`/entregar 2; `PARCIAL`/entregar 2, separar vazio.

| gatilho | ERRADO | 403 |
|---|---|---|
| nenhum (controle) | **0/7** | 0/7 |
| entrada (custo médio) | **5/7** | 6/7 |
| cadastro (custo unitário) | **5/7** | 6/7 |
| limite baixado | **5/7** | 6/7 |
| alçada ligada depois | **5/7** | 6/7 |

O 403 que **não** é erro é o da `RESERVADA` (vai a *Aguardando* sem nada na caixa — o caso de projeto). A **liberação para
retirada não verifica** (200 `PRONTA` com o custo já alto) — o desvio aparece na entrega seguinte (`PRONTA`/entregar 2:
errado nos quatro). O valor é sempre Σ **quantidade solicitada** × custo atual (R$ 574,86 na `PARCIAL` = 4 × 143,7 —
inclusive o que já foi entregue). **Itens alterados não disparam nada: nenhuma rota altera item depois da criação** — o
único `INSERT INTO itens_requisicao_almoxarifado` é o da criação (`requisitionCreateService.js:233`) e nenhum `UPDATE`
toca `quantidade_solicitada` (grep; régua conferida contra os três `UPDATE` de item que existem — separação, entrega,
limpeza de origem). O manual 8.3, item 3, **está errado** nisso.

*(Artefato do harness: o `PUT …/configuracoes/liberacao-valor` responde **500** no `testApp` — `getConfigForApi` consulta
`usuarios`, que o harness não cria —, mas grava antes: é exatamente o caso do comentário "A1" da rota, e o efeito aparece
nos 403. Não é defeito de produção.)*

### Sonda 2 — o desfecho de cada gesto posterior (`e94-sonda-2-desfechos.js`)

*Aguardando aprovação de valor* produzido pelo gatilho `entrada` em cada origem; oito gestos; depois, a sonda tenta
seguir o fluxo (entregar; se recusar, separar vazio e entregar).

| origem | ERRADO |
|---|---|
| `RESERVADA` (controle — nada na caixa) | **0/8** |
| `EM_SEPARACAO` (4 na caixa) | **7/8** |
| `PRONTA` (4 na caixa, liberada) | **7/8** |
| `PARCIAL` (4 separados, 2 entregues) | **7/8** |

Por gesto, nas três origens com caixa:
- **aprovar-valor** → 200 **`TOTALMENTE_RESERVADA`** com 4 separados (e 2 entregues na `PARCIAL`) — o status diz
  "reservada" com material na caixa (na `PRONTA`, perdeu a liberação). Entregar → 400 E0; só sai por **separar vazio** →
  `EM_SEPARACAO` → entregar (o gesto que ninguém adivinha — confirma a 93).
- **rejeitar-valor** → 200 **`REJEITADO`**, caixa intacta, reserva **`LIBERADA`** (o separado volta ao disponível de
  outra pessoa enquanto está fisicamente separado); na `PARCIAL`, 2 saídas sem estorno. Terminal.
- **cancelar (almoxarifado)** → 200 **`CANCELADO`**, o mesmo quadro. **cancelar (outros módulos)** → 400 *"Requisição
  não encontrada ou não pode ser cancelada"* (fica em *Aguardando* com a caixa).
- **entregar** → 400 E0; **separar** → 400 S1; **encerrar** → 400 *"Transição inválida: AGUARDANDO_APROVACAO_VALOR →
  ENCERRADA"* — os três deixam a requisição parada em *Aguardando* com a caixa.
- **excluir** → 200, `ativo=0`, estorna o entregue (2 = 2 na `PARCIAL`) — **coerente** pela regra da exclusão (aceita
  qualquer requisição ativa, 93). O único "certo" das origens com caixa.

Da `RESERVADA` (controle): aprovar-valor → `TOTALMENTE_RESERVADA` com **uma** reserva `ATIVA` (sem segunda reserva — o
`prepararPosAprovacao` desconta o hold); reprovar → `REJEITADO` com a reserva `LIBERADA` e nada na caixa; cancelar
(almoxarifado) → `CANCELADO`; cancelar (outros módulos) → 400 (a D (92) já declara).

### Sonda 3 — a gravação da alçada não confere o status (`e94-sonda-3-corrida.js`, `-3b-natural.js`)

O `UPDATE` de `verificarBloqueioLiberacao` (`requisitionValueApprovalService.js:144-148`) é `WHERE id = ?`. Os dois
cancelamentos ficam **fora** da trava por requisição (B450). Gancho no `UPDATE` da alçada
(`/SET\s+status\s*=\s*\?,\s*requer_aprovacao_valor\s*=\s*1/`): dispara o cancelamento, espera a resposta, solta o
`UPDATE` retido. N=5, gancho disparou 1 vez em todas.

| cenário | ERRADO |
|---|---|
| separar × cancelar pelo almoxarifado (gancho) | **5/5** |
| separar × cancelar pelos outros módulos (gancho) | **5/5** |
| controle: cancelar **antes**, depois separar | **0/5** (400 S1, fica `CANCELADO`) |
| **sem gancho**, `Promise.all`, atraso 0/1 ms (almoxarifado) | **10/10**, 10/10 |
| idem, outros módulos | **9/10**, 10/10 |
| idem, atraso 3/6 ms | 0/10, 0/10 |

O desfecho: o cancelamento respondeu **200** ("cancelada" para quem pediu), a reserva foi **`LIBERADA`**, e a requisição
está **`AGUARDANDO_APROVACAO_VALOR`** (trilha `APROVACAO,CANCELAMENTO`). Daí **aprovar por valor** → 200
`TOTALMENTE_RESERVADA` com uma **segunda** reserva `ATIVA` (`LIBERADA:4, ATIVA:4`) — a cancelada volta ao fluxo e
segura estoque. **A próxima tarefa da 93 dizia "não precisa de teste de corrida: o defeito é sequencial" — errado.**

### Sonda 4 — a fila de separação (`e94-sonda-4-fila.js`)

`GET /api/almoxarifado/fila-separacao` (ALMOX), antes e depois do custo subir, sem gesto nenhum:

| estado | custo igual | custo subiu |
|---|---|---|
| `RESERVADA` | `SEPARAR` | `APROVACAO_VALOR` (certo — a porta recusa) |
| `EM_SEPARACAO` | `ENTREGAR` | **`APROVACAO_VALOR`** |
| `PRONTA` | `ENTREGAR` | **`APROVACAO_VALOR`** |
| `PARCIAL` | `ENTREGAR` | **`APROVACAO_VALOR`** |

A fila **não chama** `verificarBloqueioLiberacao` (B255), mas reimplementa a mesma regra ao vivo
(`requisitionService.js:525-526`) — uma segunda fonte que diverge assim que a porta mudar. A próxima tarefa da 93 só a
citava como teste a medir.

### Sonda 5 — a A45 (`e94-sonda-5-a45.js`)

Cinco casos positivos e quatro negativos, no esquema real:

| caso | status | A45 (a) | A45 (b) | A43 (a) |
|---|---|---|---|---|
| P1 `EM_SEPARACAO` → aguardando | `AGUARDANDO_APROVACAO_VALOR` | **SIM** | não | não |
| P2 `PARCIAL` → aguardando → reprovada | `REJEITADO` | **SIM** | não | não |
| P3 `PRONTA` → aguardando → cancelada | `CANCELADO` | **SIM** | não | não |
| P4 `PARCIAL` → aguardando → aprovada por valor | `TOTALMENTE_RESERVADA` | não | **SIM** | não |
| P5 cancelada ressuscitada (sonda 3) | `AGUARDANDO_APROVACAO_VALOR` | não | não | **SIM** |
| N1 `RESERVADA` → aguardando → reprovada | `REJEITADO` | não | não | não |
| N2 fluxo normal | `ENTREGUE` | não | não | não |
| N3 `EM_SEPARACAO` sem custo subir | `EM_SEPARACAO` | não | não | não |
| N4 `RESERVADA` → aguardando | `AGUARDANDO_APROVACAO_VALOR` | não | não | não |

Coluna trocada (`quantidade_separadaX`) → o banco recusa as duas. A ressuscitada **já** é pega pela A43 (a) (trilha de
cancelamento fora de `CANCELADO`) — a A45 não a repete.

### Protótipo da regra (worktree descartável `CRM-e94proto`, não commitado)

Cinco setas na máquina; `alcadaAindaVale(db, reqRow)` (seta **e** nada separado/entregue) como retorno antecipado em
`verificarBloqueioLiberacao`; `AND status = ?` no `UPDATE`; a fila com o mesmo predicado. Sondas contra o protótipo
(`E94_SERVER=…/CRM-e94proto/server`): **sonda 1** 0/7 nos quatro gatilhos (403 só na `RESERVADA`, 1/7); **sonda 2** 0/8
nas quatro origens; **sonda 3** 0/5, 0/5, controle 0/5; **3b** 0/10 em todos os atrasos; **sonda 4** `ENTREGAR` nas três
pós-separação e `APROVACAO_VALOR` na `RESERVADA`. Suíte do protótipo: ver "Os testes que tocam isto".

### Os testes que tocam isto (medir antes/depois)

**23** arquivos (`grep -lE "aprovar-valor|rejeitar-valor|verificarBloqueioLiberacao|liberacao_valor_ativo"
server/tests/api/*.js`). Suíte `test:api` contra o protótipo: **326/327** — cai **só** o `[93 RN-08] (d4)` (a premissa monta o desvio; B459). `test:almoxarifado` 44/0. Ver "Suíte do protótipo" no fim.

---

## Decisões reversíveis (letra B do documento de novidades; última usada: B452)

- **B453 — a alçada de valor vale até o começo da separação.** **Escolhido:** a verificação só recalcula, bloqueia e
  grava *Aguardando aprovação de valor* quando (1) o status lido tem seta para `AGUARDANDO_APROVACAO_VALOR` na máquina
  (os ~~cinco pré-separação, B454~~ seis — os cinco pré-separação e `EM_SEPARACAO`, B454 e B462; corrigido na Fase 2) **e** (2) nenhum item tem `quantidade_separada` nem entregue > 0. Fora disso devolve a
  requisição sem tocar em nada (B455). **Por quê:** a aprovação (e a alçada avaliada nela e na separação inicial) é a
  decisão sobre gastar; quando o material está na caixa ou já saiu, o gasto aconteceu — reavaliar ali não tem gesto
  coerente para o aprovador (aprovar desmonta o status, reprovar solta a reserva com o material separado, sonda 2). O
  custo médio sobe por **nota de outro pedido** — um fato que não é da requisição. **Reversível:** um retorno antecipado
  e cinco setas; desfazer é restaurar o código; nenhuma migração, nenhum dado reescrito. **Risco aceito (C167):** uma
  requisição cujo custo passa do limite **depois** de começada a separação é entregue sem aprovação de valor.
  **Descartados:** (a) **reavaliar só o saldo a entregar** — ainda precisa de um status para onde ir no meio do fluxo (o
  mesmo desvio, menor) e o valor do saldo muda a cada entrega parcial: a mesma requisição travaria e destravaria sozinha;
  (b) **403 sem trocar o status** + `/aprovar-valor` aceitando status ≠ *Aguardando* — contrato novo em duas portas e na
  tela, e a requisição separada ficaria parada sem status que diga por quê (a fila diria "Entregar" e a porta recusaria);
  (c) **manter a troca e fazer reprovar/cancelar recusarem com caixa** — a requisição fica num status fora da máquina e o
  aprovar continua devolvendo `*_RESERVADA` com entregue (a 93 já a descartava); (d) **o retorno preserva a caixa** —
  aprovar por valor devolve o status anterior (coluna nova "status antes da alçada", migração) e reprovar com caixa ainda
  precisaria decidir o físico (devolver à prateleira? estornar a entrega?) — muito mais superfície para o mesmo fim;
  (e) **"ainda não há rodada"** (texto da 93) como critério — *Iniciar Separação* sem quantidade põe `EM_SEPARACAO` com
  `rodada_id: null` (medido, sonda 1), e a rodada não diz se há material na caixa; (f) **só a seta, como a 93 escreveu**
  ("quando o status lido tem seta para lá") — **hoje nenhum** status de `PODE_SEPARAR` tem seta para *Aguardando* (só
  `PENDENTE`, que não separa): a regra literal desligaria a alçada também antes da separação.
- **B454 — as cinco setas pré-separação → `AGUARDANDO_APROVACAO_VALOR` entram na máquina.** **(Fase 2: mais a
  sexta, `EM_SEPARACAO` — B462; e o predicado ganha "nada na caixa", que já exclui a `EM_SEPARACAO` com separado.)** `APROVADO`,
  `AGUARDANDO_ESTOQUE`, `AGUARDANDO_COMPRA`, `PARCIALMENTE_RESERVADA`, `TOTALMENTE_RESERVADA` ganham o destino; o
  predicado da B453 é `validarTransicao(status, 'AGUARDANDO_APROVACAO_VALOR').ok` — a porta, a fila e a máquina dizem a
  mesma coisa. É o caminho do **C68** (47) virando transição de projeto (a 47 o chamou de atalho fora da máquina e
  adiou por ser "mudança de máquina"). Quem lê `TRANSICOES`: `alertRegistry` (só as chaves), o teste do cliente
  `ReservasAlmoxarifado.test.js:363` (só quem vai a `CANCELADO`), `reservaChegadaService:139` (destinos que ele mesmo
  calcula, nunca *Aguardando*) — nada muda para eles. **Não muda:** o lembrete continua só para a de nascimento
  (`data_aprovacao IS NULL`, `requisitionReminderService.js:316`) — o C68/A25 seguem abertos nessa parte.
  **Descartado:** lista própria no serviço de valor (segunda fonte de verdade — é exatamente o que a fila é hoje).
- **B455 — depois da separação a verificação não lê o custo nem grava nada.** Nem status, nem `valor_total`, nem
  `requer_aprovacao_valor`, nem e-mail, nem log. O `valor_total` gravado fica o da última avaliação (a da liberação).
  **Descartados:** `console.warn` W5 (sugestão da 93) — um log sem leitor nem gesto; regravar `valor_total` — a coluna
  passaria a mostrar um valor acima do limite numa requisição liberada, pintado de "atenção" na lista
  (`RequisicoesList.js:1305` colore por `requer_aprovacao_valor`), sem nada que alguém possa fazer.
- **B456 — a gravação da alçada confere o status lido; perdeu → 409 V1, sem e-mail, sem nova tentativa.** `UPDATE …
  SET status = 'AGUARDANDO_APROVACAO_VALOR', requer_aprovacao_valor = 1, … WHERE id = ? AND status = ?` com o status
  lido no começo da verificação; `changes` 0 → relê o status e lança **409** V1 com ele; a notificação aos aprovadores
  só sai se o `UPDATE` venceu. Só a separação alcança este caminho (a entrega lê sempre status pós-separação → B453 não
  grava). **Por que 409 e sem nova tentativa:** a verificação roda **antes** de qualquer gravação da separação (antes da
  reivindicação), então repetir é seguro e a janela é de milissegundos; o 409 é o que a 93 usa quando "outra pessoa
  agiu" (X1, L1). **Descartados:** nova tentativa com o relido (molde B448) — mais código para uma janela de ms, e o
  relido mais provável é `CANCELADO` (onde não se tenta de novo); o **403 de valor** sobre a cancelada (é o que o
  protótipo devolve sem a literal nova — mente: a requisição não está aguardando valor); pôr os cancelamentos na trava
  por requisição (B450 da 93: reabre a ordem de travas — o `/cancelar` libera reservas, que chegam ao recálculo sob a
  trava por material). **(Fase 2, M2)** O V1 também sai — inofensivo — quando o recálculo da 76
  (`reservaChegadaService.recalcularStatusDeReserva`, `*_RESERVADA` ↔ `AGUARDANDO_*`/`APROVADO`) ou o `/aprovar` mudam
  o status entre a leitura e o `AND status = ?`: nada foi gravado, e tentar de novo é o certo (a literal diz "recarregue
  e confira").
- **B457 — a fila de separação usa o mesmo predicado.** `listarFilaSeparacao` avalia a alçada ao vivo só quando
  `alcadaDeValorAindaVale(status, itens)` (os itens ela já tem em memória). **Descartado:** deixar a fila como está —
  ela mostraria *Aguardando aprovação de valor* onde a porta entrega (sonda 4, 3/3). **(Fase 2, I1)** A reserva na
  chegada usa o mesmo predicado — B461.
- **B458 — o legado não é consertado por script nem por guarda nova.** Requisições já desviadas (A45) continuam onde
  estão; a regra nova as **destrava** pelo caminho medido: aprovar por valor (vira `*_RESERVADA` com caixa) → *Iniciar
  Separação* sem quantidade (agora sem 403: há caixa → B453 não reavalia) → `EM_SEPARACAO` → entregar. As já reprovadas
  ou canceladas com caixa: devolver o material à prateleira. **Descartados:** script de correção (cada linha pede
  decisão física, como a B451); recusar reprovar/cancelar quando há caixa (contrato novo em duas portas só para legado —
  e depois desta etapa nenhuma requisição nova chega a *Aguardando* com caixa). **(Corrigido na Fase 2, B1 — B460.)**
  "O caminho medido" foi medido **pela API**: pela tela ele não existe quando tudo já está separado — a fila não lista a
  requisição (nada a separar; `TOTALMENTE_RESERVADA` fora de `PODE_ENTREGAR`) e o modal desabilita "Confirmar
  Separação" (todo item com `maxQtdSeparacao <= 0`). A T2c dá o gesto à tela.
- **B459 — o teste `[93 RN-08] (d4)` é reescrito, não apagado.** Ele monta *Aguardando* com 2 entregues **pelo desvio**
  (`PARCIALMENTE_ATENDIDA` + custo → entregar → 403) como premissa para provar exclusão × `/aprovar-valor` com um estorno
  só. Depois da T0 esse estado só existe como **legado**: a T0 o monta por **escritor direto** (`UPDATE … SET
  status='AGUARDANDO_APROVACAO_VALOR'` sobre a `PARCIALMENTE_ATENDIDA` — o estado que a A45 (a) lista) e a asserção
  (um estorno, q=4, 404 na segunda) continua provada. **Descartado:** apagar — a corrida exclusão × aprovar-valor sobre
  legado continua possível em produção. *(A suíte do protótipo derrubou **só** este — 326/327; ver "Suíte do protótipo".)*
- **B460 (Fase 2, B1) — o legado com tudo separado ganha o gesto na tela.** **Escolhido (a):** ramo pequeno no
  cliente — status pré-separação (os cinco; não `EM_SEPARACAO`, que já tem "Ajustar Separação") com algum item
  separado > entregue → o modal de separação habilita o botão com zero e o rótulo vira **"Reabrir separação"**; e a
  fila (servidor) acrescenta a etapa **`RETOMAR_SEPARACAO`** (acionável) quando o mesmo predicado vale e não há
  `SEPARAR`. O predicado é um só — `separacaoAReabrir(status, itens)` na máquina, espelhado no cliente e conferido por
  teste — e implica o aceite da porta: status em `PODE_SEPARAR` e caixa (logo a alçada não reavalia, B453).
  **Reversível:** um ramo na tela e uma etapa a mais na fila. **Descartados:** (b) só declarar e depender de API ou do
  administrador — o desvio deixou requisições em produção (A45 (b)) que ninguém tiraria pela tela; reusar a etapa
  `REABRIR_SEPARACAO` — o rótulo dela ("Separar de novo para conferir") é da conferência de material crítico e
  mentiria aqui.
- **B461 (Fase 2, I1) — a reserva na chegada usa o mesmo predicado.** `reservaChegadaService.bloqueadaPorValor`
  (`:111-115`) é a terceira cópia da regra e roda sobre `PODE_SEPARAR` (inclui `EM_SEPARACAO` e
  `PARCIALMENTE_ATENDIDA`). **Escolhido:** `if (c.data_aprovacao_valor || !alcadaDeValorAindaVale(c.status, itens))
  return false`, lendo **todos** os itens da requisição. Reproduzido (`e94rv-sonda.js`): `PARCIALMENTE_RESERVADA` (pede
  4, estoque 2) → separa 2 → `EM_SEPARACAO`; nota de 2 com limite 10 → 1 reserva, fila `SEPARAR,ENTREGAR`; com limite 1
  → **0** reservas e fila `APROVACAO_VALOR` — com a T0 a porta separaria, mas a chegada continuaria pulando a
  requisição. **Descartado:** deixar como está (terceira fonte divergente da porta).
- **B462 (Fase 2, I2) — a sexta seta: `EM_SEPARACAO → AGUARDANDO_APROVACAO_VALOR`.** Reproduzido: *Iniciar Separação*
  sem quantidade com o valor abaixo do limite → `EM_SEPARACAO` vazia; o limite baixa; separar 4 → hoje **403** e
  *Aguardando* (coerente: nada na caixa, reserva `ATIVA`). Com o protótipo (cinco setas) separava 4 → entregava 4 →
  `ENTREGUE` **sem aprovação** — a alçada contornada por um clique. **Escolhido (a):** a sexta seta; a condição "nada
  na caixa" já exclui a `EM_SEPARACAO` com separado. RN-03 passa a "exatamente `PENDENTE` + seis". **Descartado (b):**
  declarar — o atalho é um gesto que qualquer almoxarife faz.
- **B463 (Fase 2, M1) — o 409 V1 na tela fecha o modal e recarrega.** `handleSeparacao` (`RequisicoesList.js:~723-733`)
  só mostrava o toast. **Escolhido:** num **409** fecha o modal de separação e recarrega o detalhe e a lista (molde do
  `handleExcluir` da 93, `:~1039`); os demais erros mantêm o modal. Isto também fecha o **M2 da 93** para o **X1** (o
  409 da separação concorrente deixava o modal aberto, e "Separar" de novo numa `PARCIALMENTE_ATENDIDA` gravava a mesma
  caixa duas vezes). **Descartado:** só o toast (o modal aberto mostra um estado que já não existe).

## Regras de negócio

Os testes levam o prefixo `[94 RN-xx]`; o manual cita pelo conteúdo (o manual não tem IDs — divergência declarada na
92). "Pré-separação" = os cinco status da B454 (**Fase 2:** a alçada vale também na `EM_SEPARACAO` vazia — B462; "os seis"
abaixo = os cinco + `EM_SEPARACAO`). "Caixa" = algum item com `quantidade_separada` > 0 ou entregue > 0
(entregue = `COALESCE(quantidade_entregue, quantidade_atendida)`, a régua de `getEntregue`).

- **RN-01 (a alçada não volta depois da separação)** — custo ou configuração que mudam depois de a requisição estar
  `EM_SEPARACAO` **com material separado** (Fase 2), `PRONTA_PARA_RETIRADA` ou `PARCIALMENTE_ATENDIDA` não bloqueiam separar nem entregar. (a) Matriz da
  sonda 1 pelos **quatro gatilhos por rota** × os seis gestos pós-separação → todos **200** com o desfecho normal
  (entregar 2 de `EM_SEPARACAO`/`PRONTA` → `PARCIALMENTE_ATENDIDA`; de `PARCIALMENTE_ATENDIDA` → `ENTREGUE`, reserva
  `CONSUMIDA`; separar vazio → `EM_SEPARACAO`); `valor_total` e `requer_aprovacao_valor` **iguais** aos de antes do gesto
  (B455); nenhuma chamada a `notificarAprovadoresValor` (espião) — **(Fase 2, I3)** asserção negativa com controle positivo:
  sem o retorno antecipado o espião vê a chamada e ela cai (T0 s1); e o espião só enxerga a chamada porque a T0 a faz
  passar pelo objeto exportado. (b) **Pelo serviço:**
  `valueApprovalService.verificarBloqueioLiberacao(db, R)` direto em cada um dos três status com o custo alto → devolve a
  linha, status inalterado. (Hoje: 5/7 errado por gatilho, sonda 1.)
- **RN-02 (antes da separação, como hoje)** — (a) de cada um dos ~~cinco~~ **seis** status (Fase 2, I2), sem caixa e sem
  `data_aprovacao_valor`, com o valor acima do limite: separar → **403** V403b; status `AGUARDANDO_APROVACAO_VALOR`;
  reserva `ATIVA` intacta; aprovadores notificados (espião, 1 vez). Daí: aprovar por valor (ADMIN2) → 200 `*_RESERVADA`
  com **uma** reserva `ATIVA`; reprovar → `REJEITADO`, reserva `LIBERADA`; cancelar (almoxarifado) → `CANCELADO`. **Como cada status é produzido
  (Fase 2, M5):** `TOTALMENTE_RESERVADA` — `/aprovar` com estoque 8 (rota); `PARCIALMENTE_RESERVADA` — `/aprovar` com
  estoque 2 < pede 4 (rota); `AGUARDANDO_ESTOQUE` — `/aprovar` com estoque 0 e nenhuma solicitação de compra (rota);
  `AGUARDANDO_COMPRA` — `/aprovar` com estoque 0 e uma solicitação de compra `PENDENTE` do material dentro do horizonte
  (a solicitação por escritor direto, a aprovação pela rota); `APROVADO` — **escritor direto** sobre a `PENDENTE` (o
  `/aprovar` com disponível reserva e devolve `*_RESERVADA`: `APROVADO` estável não sai de rota nenhuma hoje — o teste
  diz isso); `EM_SEPARACAO` vazia — *Iniciar Separação* sem quantidade pela rota com o valor abaixo do limite, depois o
  gatilho. Nos `AGUARDANDO_*` e no `APROVADO` não há reserva: "reserva intacta" vira "nenhuma reserva criada", e
  aprovar por valor devolve o status pós-aprovação, sem reserva duplicada. (b)
  **Pré-separação com caixa** (legado montado por `UPDATE` direto: `TOTALMENTE_RESERVADA` com 2 separados) → separar
  vazio **200** `EM_SEPARACAO`, sem 403 — a caixa vence o status (B453 (2)). (b') o mesmo com **só separado** (entregue
  0) — controle de que a régua não é só "entregue" (o texto da A45 da 93 só olhava `quantidade_entregue`). (c) Já
  aprovada por valor (`data_aprovacao_valor` preenchida) nunca volta — guarda de regressão do `:142`.
- **RN-03 (a máquina diz onde a alçada vale)** — matriz: para todo status de `TRANSICOES`, `validarTransicao(s,
  'AGUARDANDO_APROVACAO_VALOR').ok` é verdade **exatamente** em `PENDENTE` + os ~~cinco pré-separação~~ **seis** (Fase 2, I2: + `EM_SEPARACAO`); e
  `alcadaDeValorAindaVale(s, [])` é verdade exatamente nos ~~cinco~~ seis (não em `PENDENTE`, que não separa — ver contrato).
- **RN-04 (a gravação confere o status)** — gancho no `UPDATE` da alçada dispara o cancelamento (a) pelo almoxarifado
  (S) e (b) pelos outros módulos (S), aguardando a resposta: cancelamento **200**; separação **409** V1 com `agora
  CANCELADO`; final **`CANCELADO`**, reserva `LIBERADA`, 0 rodadas, **nenhuma** notificação aos aprovadores; depois
  `/aprovar-valor` → **400** *"Apenas requisições aguardando aprovação de valor podem ser liberadas"* e nenhuma reserva
  nova; A43 (a) vazia para R. (c) **Sem gancho**, `Promise.all` separar × cancelar (almoxarifado), d=0, N=10 → 0/10 com
  `AGUARDANDO_APROVACAO_VALOR` sobre cancelamento 200. (Hoje: 5/5 e 10/10.)
- **RN-05 (a fila não diz o que a porta recusa)** — `GET /fila-separacao` depois do custo subir: (a) `EM_SEPARACAO`,
  `PRONTA` e `PARCIALMENTE_ATENDIDA` → `ENTREGAR` (não `APROVACAO_VALOR`); (b) `TOTALMENTE_RESERVADA` sem caixa →
  `APROVACAO_VALOR`; (c) o legado `TOTALMENTE_RESERVADA` com 2 separados de 4 → `SEPARAR`; (d) para cada linha das três
  primeiras, o gesto que a fila oferece é aceito pela porta (entregar 200 / separar 200 no (c)). **(c') (Fase 2, B1 — B460)** o legado
  `TOTALMENTE_RESERVADA` com **4 separados de 4** (e o mesmo com 4 separados e 2 entregues): hoje a requisição **some**
  da fila → passa a vir com `RETOMAR_SEPARACAO`, `acionavel: true`, sem `SEPARAR`; e o gesto pela porta (separar vazio)
  → 200 `EM_SEPARACAO`. Matriz de `separacaoAReabrir(s, itens)`: verdade só nos cinco pré-separação com algum item
  separado > entregue. **(e) (Fase 2, I1 — B461)** a reserva na chegada: R `PARCIALMENTE_RESERVADA` (pede 4, estoque 2)
  → separa 2 → `EM_SEPARACAO`; limite baixado a 1; nota de 2 (`reservarChegadaParaQuemEspera`) → **uma** reserva da
  nota para R (hold 2 → 4). Controle: o mesmo **sem separar** (R `PARCIALMENTE_RESERVADA` sem caixa, limite 1) → **0**
  reservas (a alçada ainda vale e bloqueia). Os casos atuais de
  `filaSeparacao.api.test.js` (`APROVACAO_VALOR` na pré-separação; com a aprovação dada, `SEPARAR`) continuam.
- **RN-06 (A45)** — as duas consultas da "Letra A" acham P1–P4 da sonda 5 (montados por escritor direto, o estado que
  o desvio deixava) e não acham N1–N4; coluna trocada → o banco recusa. Fica no teste de integração (T3), como a A44.

## Contrato (congelado)

### Literais

| id | onde | texto (exato) | código |
|---|---|---|---|
| V403a | separar/entregar — status `AGUARDANDO_APROVACAO_VALOR` (inalterado) | `` `Requisição aguardando aprovação de valor (${formatMoeda(valor_total)}). Um aprovador autorizado deve liberar antes da separação ou entrega.` `` | 403, `code: 'AGUARDANDO_APROVACAO_VALOR'` |
| V403b | separar — pré-separação sem caixa, valor > limite (inalterado; **deixa de sair** pela entrega) | `` `Valor total (${formatMoeda(valor_total)}) excede o limite de liberação automática (${formatMoeda(limite)}). Aprovação de alto valor necessária.` `` | 403, `code: 'AGUARDANDO_APROVACAO_VALOR'` |
| V1 | separar — o status mudou entre a leitura e a gravação da alçada (**novo**, B456) | `` `A requisição mudou de status enquanto a alçada de valor era conferida (agora ${status}); recarregue e confira antes de separar.` `` | **409** |
| S1 | separação fora de `PODE_SEPARAR` (inalterado) | `Requisição deve estar aprovada, aguardando estoque/compra, em separação ou parcialmente atendida para separar` | 400 |
| E0 | entrega fora de `PODE_ENTREGAR` (inalterado) | `Requisição deve estar em separação, pronta para retirada ou parcialmente atendida` | 400 |
| AV1 | `/aprovar-valor` fora de *Aguardando* (inalterado) | `Apenas requisições aguardando aprovação de valor podem ser liberadas` | 400 |
| RV1 | `/rejeitar-valor` fora de *Aguardando* (inalterado) | `Apenas requisições aguardando aprovação de valor podem ser reprovadas` | 400 |

Forma de toda recusa: `{ error: <literal> }` (o `catch` de hoje: `res.status(e.status || 500).json({ error: e.message })`).
`${status}` no V1 é o **relido** depois do `changes` 0.

### Máquina — `server/services/almoxarifado/requisitionStateMachine.js` (T0)

```js
// TRANSICOES: + 'AGUARDANDO_APROVACAO_VALOR' nos destinos de APROVADO, AGUARDANDO_ESTOQUE, AGUARDANDO_COMPRA,
// PARCIALMENTE_RESERVADA, TOTALMENTE_RESERVADA e (Fase 2, B462) EM_SEPARACAO (comentario: Etapa 94, B454, o C68 da
// 47; EM_SEPARACAO so vale vazia — o predicado exclui a com caixa).
const STATUS_AGUARDANDO_APROVACAO_VALOR = 'AGUARDANDO_APROVACAO_VALOR';
/** RN-01/RN-02: a alcada de valor ainda vale? Pura. `itens` com quantidade_separada / quantidade_entregue /
 *  quantidade_atendida (a regua de getEntregue). PENDENTE tem a seta mas nao separa — fica de fora. */
function alcadaDeValorAindaVale(status, itens = []) {
  if (status === 'PENDENTE' || !validarTransicao(status, STATUS_AGUARDANDO_APROVACAO_VALOR).ok) return false;
  return !itens.some((i) => Number(i.quantidade_separada || 0) > 1e-9
    || Number(i.quantidade_entregue ?? i.quantidade_atendida ?? 0) > 1e-9);
}
// Fase 2 (B1/B460, entra na T2): o legado com caixa num status pre-separacao — a fila oferece RETOMAR_SEPARACAO e o
// modal confirma com zero. Os cinco pre-separacao (nao EM_SEPARACAO: ali ja ha "Ajustar Separacao"); caixa aqui =
// separado > entregue (o que ainda esta para entregar).
const STATUS_PRE_SEPARACAO = ['APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA', 'PARCIALMENTE_RESERVADA',
  'TOTALMENTE_RESERVADA'];
function separacaoAReabrir(status, itens = []) {
  return STATUS_PRE_SEPARACAO.includes(status) && itens.some((i) => Number(i.quantidade_separada || 0)
    - Number(i.quantidade_entregue ?? i.quantidade_atendida ?? 0) > 1e-9);
}
module.exports = { ..., alcadaDeValorAindaVale, separacaoAReabrir, STATUS_PRE_SEPARACAO };
```

### A verificação — `requisitionValueApprovalService.verificarBloqueioLiberacao` (T0 + T1)

Ordem (o que muda em **negrito**): 404 se não existe → V403a se `AGUARDANDO_APROVACAO_VALOR` → **lê os itens
(`SELECT quantidade_separada, quantidade_entregue, quantidade_atendida FROM itens_requisicao_almoxarifado WHERE
requisicao_id = ?`); `!alcadaDeValorAindaVale(reqRow.status, itens)` → `return reqRow` (nada lido de custo, nada
gravado)** → avalia e grava `valor_total` (como hoje) → abaixo do limite → `return` → `data_aprovacao_valor` →
`return` → **`UPDATE … WHERE id = ? AND status = ?` (T1); `changes` 0 → relê `status` → 409 V1** → notifica (~~T1~~ **T0** — corrigido na Fase 2, I3: pelo
objeto exportado, `module.exports.notificarAprovadoresValor`, para o teste espiar) → V403b.
`require('./requisitionStateMachine')` no topo (sem ciclo: a máquina só importa `db` e `availabilitySql`).

### A fila — `requisitionService.listarFilaSeparacao` (T2)

`const avaliacaoValor = (r.data_aprovacao_valor || !alcadaDeValorAindaVale(r.status, doReq)) ? null : await
valueApprovalService.avaliarRequisicaoValor(db, r.id);` — o resto inalterado.

**(Fase 2, B460)** Depois das etapas de separar: `if (podeSep && separacaoAReabrir(r.status, doReq) &&
!etapas.includes('SEPARAR')) etapas.push('RETOMAR_SEPARACAO')`; `RETOMAR_SEPARACAO` entra na lista de `acionavel`.
Etapa nova no contrato da fila (64): o cliente que não a conhece mostra o nome cru (`rotuloEtapa`); a T2c dá o rótulo.

### A reserva na chegada — `reservaChegadaService.bloqueadaPorValor` (T2; Fase 2, I1)

Lê os itens da requisição (`SELECT quantidade_separada, quantidade_entregue, quantidade_atendida FROM
itens_requisicao_almoxarifado WHERE requisicao_id = ?`) e `if (c.data_aprovacao_valor ||
!alcadaDeValorAindaVale(c.status, itens)) return false;` — o resto inalterado.

### A tela — `RequisicoesList.js` e `FilaSeparacao.js` (T2c; Fase 2, B1 e M1)

- `separacaoAReabrir(status, itens)` espelhado no cliente (a mesma lista de cinco, a mesma régua `getSeparado −
  getEntregue`). Com ele verdadeiro e todo item com `maxQtdSeparacao <= 0`: o botão do modal fica **habilitado** e diz
  **"Reabrir separação"**; o aviso do modal diz *"Todo o material desta requisição já está separado. Confirme para
  reabrir a separação e seguir para a entrega."*; o envio é `itens_separados: []` (o que o modal já manda com zero).
- `FilaSeparacao.js`: `ETAPA_INFO.RETOMAR_SEPARACAO = { label: 'Reabrir separação', ... }`.
- `handleSeparacao`: num **409** fecha o modal de separação e recarrega o detalhe e a lista; os demais erros mantêm o
  modal (B463).

### O que não muda

Quem pode cada gesto; as literais de hoje; `/aprovar-valor` e `/rejeitar-valor` (guardas e literais — Fase 5 da 93,
`c4d84b1f`); os dois cancelamentos (92); a avaliação na criação (`aplicarAvaliacaoNaCriacao`); o lembrete (só a de
nascimento); a trava por requisição (93) e a por material (91) — a verificação continua **dentro** da trava por
requisição (separar/entregar) e **não** pega a de material; ~~`reservaChegadaService` (usa `avaliarRequisicaoValor`, só
leitura, em requisições `AGUARDANDO_*`, pré-separação)~~ **(corrigido na Fase 2, I1 — a frase estava errada:** a
chegada avalia candidatas em `PODE_SEPARAR`, que inclui `EM_SEPARACAO` e `PARCIALMENTE_ATENDIDA`; passa a usar o
predicado, B461**)**; ~~o cliente (nenhuma tela muda — o 409 V1 sai no toast que a
separação já mostra)~~ **(corrigido na Fase 2, B1 e M1:** o modal de separação e a fila mudam — T2c**)**.

## Técnica dos testes

1. Arquivo novo `server/tests/api/alcadaValorDepoisDaSeparacao.api.test.js` (runner próprio, molde da 93), usuários
   reais por header (S, ADMIN, ADMIN2, ALMOX), a requisição **aprovada pela rota**; gatilhos **pelas rotas** (entrada
   v2 com custo, `PUT` do material, `PUT` da configuração — este responde 500 no harness e grava: o teste afirma o efeito
   lendo `configuracoes_almoxarifado`, não o código da resposta, e diz por quê). Restaurar a configuração da alçada no
   `finally` de cada caso (a suíte compartilha o banco do arquivo).
2. Espião de `notificarAprovadoresValor` pelo objeto do módulo (~~T1~~ **T0** faz a chamada passar por ele — corrigido
   na Fase 2, I3).
3. Gancho no `db.run` (regex `RE_ALCADA = /SET\s+status\s*=\s*\?,\s*requer_aprovacao_valor\s*=\s*1/`), aguardando o
   cancelamento (fora da trava — não há *deadlock*; a 93 só proíbe aguardar no gancho um gesto **travado** da mesma
   requisição), contador de disparos = 1 afirmado.
4. Sabotagem só na árvore principal, um controle de cada vez, `perl -0pi` com âncora contada = 1, backup
   `e94-<task>-*.bak` no scratchpad, restauro por cópia com md5 conferido, base **LF**. Mensagens `msg-e94-<task>.txt`.

## Tasks

**Ordem topológica: T0 → T1 → T2 → T2c → T3 → T4** (a T2c entrou na Fase 2, B1). T0 é **tronco** (máquina de estados e regra compartilhada). T1 e T2 são
**galhos por regra** (T1: a gravação; T2: a fila — consomem o predicado da T0, um erro de leitura num não exige
retrabalho no outro) — mas **executados em sequência na árvore principal**: T1 edita o mesmo arquivo da T0 e as duas
sabotam produção com a suíte batendo no mesmo SQLite (memória "sabotagem concorrente contamina a suíte"). ~~Nenhum galho
de cliente.~~ **(Corrigido na Fase 2.)** Um galho de cliente, a T2c — contra o contrato da fila e da porta congelado
aqui (mock só na fronteira HTTP), depois da T2. Executores **não** marcam este plano; o fio principal marca.

- [ ] **T0 (tronco) — a alçada vale até o começo da separação (B453, B454, B455, B459).** Contrato "Máquina" e "A
  verificação" (sem o `AND status` — é da T1). **(Fase 2)** + a sexta seta (B462) e a chamada de
  `notificarAprovadoresValor` pelo objeto exportado (I3 — saiu da T1). Teste novo: **RN-01**, **RN-02**, **RN-03**. Reescrita declarada do
  `[93 RN-08] (d4)` (B459) e dos que a Fase 2 listar. **Vermelho antes:** RN-01 (a) (403 e `AGUARDANDO` em 5 de 7 por
  gatilho), RN-01 (b), RN-02 (b)(b') (403 sobre o legado com caixa), RN-03 (a função não existe; a seta não existe).
  RN-02 (a)(c) passam antes — guardas. **Medir antes e depois, sem edição:** os 23 de alçada, `filaSeparacao`,
  `requisicaoGestosConcorrentes*`, `test:almoxarifado`. **Controles (cada um diz qual asserção cai):** (s1) sem o
  retorno antecipado → caem RN-01 (a) (status `AGUARDANDO_APROVACAO_VALOR`, 403) e (b); (s2) predicado só pelo status
  (ignora a caixa) → caem RN-02 (b)(b') (403); (s3) predicado olhando só o entregue → cai RN-02 (b') (403 com separado 2,
  entregue 0); (s4) sem as cinco setas → caem RN-02 (a) (separar 200 em vez de 403 — a alçada desligada antes da
  separação) e RN-03; (s5) `PENDENTE` dentro do predicado → cai RN-03 (asserção "exatamente nos cinco"); (s6) recalcular
  e regravar `valor_total` antes do retorno antecipado → cai RN-01 (a) na asserção "`valor_total` igual" (B455).
  **(Fase 2)** (s7) a chamada a `notificarAprovadoresValor` pelo binding local (sem o objeto exportado) → o espião não
  vê nada: cai "notificado 1 vez" do RN-02 (a) — o controle do próprio espião (era o s4 da T1, I3); (s8) sem a seta de
  `EM_SEPARACAO` → cai a linha `EM_SEPARACAO` vazia do RN-02 (a) (separar 4 → 200, a alçada contornada, B462) e o
  RN-03. O (s1) também derruba a asserção negativa do espião no RN-01 (a) (o controle positivo dela, I3).
- [ ] **T1 (galho) — a gravação da alçada confere o status (B456).** `AND status = ?`, releitura, 409 V1, notificação só
  depois do `UPDATE` vencer ~~e pelo objeto exportado~~ (o objeto exportado já é da T0 — Fase 2, I3). **RN-04** (a)(b)(c). **Vermelho antes:** (a)(b) 5/5 (status
  `AGUARDANDO_APROVACAO_VALOR` sobre cancelamento 200, notificação 1), (c) 10/10. **Controles:** (s1) sem `AND status =
  ?` → caem (a)(b)(c) (status e `/aprovar-valor` 200 com reserva nova); (s2) perdeu → V403b em vez de V1 → caem (a)(b)
  no código e na literal; (s3) notificar **antes** do `UPDATE` → cai a asserção "nenhuma notificação"; ~~(s4) a chamada
  direta (sem o objeto exportado) → o espião não vê nada: cai a asserção "notificado 1 vez" do RN-02 (a) — controle do
  próprio espião.~~ **(Movido para a T0 na Fase 2, I3 — o s7 de lá.)**
- [ ] **T2 (galho) — a fila usa o predicado (B457; Fase 2: + a chegada, B461, e `RETOMAR_SEPARACAO`, B460).**
  **RN-05** (a)–(d), **(c')** e **(e)**. **Vermelho antes:** (a) 3/3 (`APROVACAO_VALOR`),
  (c) (`APROVACAO_VALOR` no legado), (d) (a fila não oferece o que a porta aceita). (b) passa antes — guarda. **Medir:**
  `filaSeparacao.api.test.js` e `filaTravaIntegracao`. **Controles:** (s1) sem o predicado → caem (a)(c)(d); (s2) o
  predicado com `[]` no lugar dos itens → cai (c) (o legado volta a `APROVACAO_VALOR`). **(Fase 2)** Vermelho antes
  também: (c') (a requisição ausente da fila) e (e) (0 reservas da nota para a `EM_SEPARACAO`). (s3) `bloqueadaPorValor`
  sem o predicado → cai (e); (s4) `separacaoAReabrir` olhando só o status (sem a caixa) → cai a matriz do (c'); (s5)
  `RETOMAR_SEPARACAO` fora de `acionavel` → cai (c'). **Medir** também `recebimentoReservaChegada*`.
- [ ] **T2c (galho de cliente, Fase 2) — o legado tem gesto na tela e o 409 V1 recarrega (B460, B463).** Contrato "A
  tela". Testes de componente (API mockada só na fronteira HTTP): (a) detalhe `TOTALMENTE_RESERVADA` com o item 4
  separados de 4 → "Iniciar Separação" → o botão do modal diz **"Reabrir separação"**, está **habilitado**, e confirmar
  manda `PUT …/separacao` com `itens_separados: []`; (b) controle: `TOTALMENTE_RESERVADA` sem nada separado e
  `saldo_atual` 0 → "Confirmar Separação" **desabilitado** (como hoje); (c) 409 no `PUT …/separacao` → o modal fecha e
  o detalhe e a lista são recarregados; um 400 mantém o modal aberto; (d) `FilaSeparacao` com `etapas:
  ['RETOMAR_SEPARACAO']` → chip "Reabrir separação"; (e) a lista dos cinco do cliente é a do servidor
  (`STATUS_PRE_SEPARACAO`). **Vermelho antes:** (a) (desabilitado, "Confirmar Separação"), (c) (modal aberto), (d) (nome
  cru). **Controles:** (s1) sem o ramo → cai (a); (s2) o ramo sem olhar a caixa → cai (b); (s3) sem o tratamento do
  409 → cai (c). **Medir:** a suíte do cliente e o `build` com `CI=true`.
- [ ] **T3 — integração cruzando as portas, pela rota e pelo serviço.** Arquivo novo
  `server/tests/api/alcadaValorDepoisDaSeparacaoIntegracao.api.test.js`, usuários reais por header:
  **Jornada A (custo sobe no meio, pela rota):** S cria R1 (4, R$ 4,00) → ADMIN aprova pela rota (`TOTALMENTE_RESERVADA`)
  → ALMOX separa 4 → entrega 2 (`PARCIALMENTE_ATENDIDA`) → ADMIN faz a **entrada cara** por `POST …/movimentacoes/v2`
  → a fila mostra `ENTREGAR` → ALMOX entrega 2 → **200 `ENTREGUE`**, entregue 4 = saídas 4, reserva `CONSUMIDA`,
  `valor_total` 4 (B455); **A45 (a)(b) e A43 (a) vazias para R1**.
  **Jornada B (custo sobe antes, o caminho de projeto):** R2 aprovada; entrada cara; a fila mostra `APROVACAO_VALOR`;
  ALMOX separa → 403 V403b → `AGUARDANDO_APROVACAO_VALOR` (pela seta nova); ADMIN2 aprova por valor → `TOTALMENTE_RESERVADA`,
  **uma** reserva `ATIVA`; ALMOX separa 4 → entrega 4 → `ENTREGUE`; A45 vazia.
  **Jornada C (limite baixado e alçada ligada no meio, pela rota de configuração):** R3 `PRONTA_PARA_RETIRADA` → `PUT
  …/configuracoes/liberacao-valor` (limite 1) → entrega 4 → `ENTREGUE`; R4 com a alçada desligada até `EM_SEPARACAO`,
  ligada depois → entrega → 200.
  **Jornada D (pelo serviço):** `requisitionService.separarRequisicao` e `entregarRequisicao` chamados **direto** (sem
  rota) numa `EM_SEPARACAO` com custo alto → sem 403; `valueApprovalService.verificarBloqueioLiberacao` direto numa
  `TOTALMENTE_RESERVADA` com custo alto → 403 V403b. Prova que a regra mora no serviço e vale para qualquer chamador.
  **Jornada E (a corrida, pela rota):** R5 aprovada, custo alto; separar × cancelar (outros módulos, S) no gancho →
  cancelamento 200, separação 409 V1, `CANCELADO`; `/aprovar-valor` → 400 AV1; **A43 (a) vazia**.
  **Jornada F (legado, a B458):** R6 levada por escritor direto ao estado que o desvio deixava (`AGUARDANDO` com 4
  separados e 2 entregues) → **A45 (a) lista R6**; ADMIN2 aprova por valor → `TOTALMENTE_RESERVADA` → **A45 (b) lista
  R6**; ALMOX separa vazio → **200** `EM_SEPARACAO` (sem 403 — há caixa) → entrega 2 → `ENTREGUE`; A45 vazia. Mais a
  RN-06: P1–P4 achados, N1–N4 não, coluna trocada recusada. **(Fase 2, B460)** Na F, entre aprovar por valor e
  separar vazio, a fila lista R6 com `RETOMAR_SEPARACAO`. **Jornada G (Fase 2, I2):** R7 aprovada → *Iniciar Separação*
  sem quantidade (valor abaixo) → `EM_SEPARACAO` vazia → limite baixado → separar 4 → **403 V403b**,
  `AGUARDANDO_APROVACAO_VALOR` → ADMIN2 aprova por valor → separar 4 → entregar 4 → `ENTREGUE`; o (s8) da T0 derruba a G.
  **Controles:** (s1) da T0 → caem A (403 na última entrega), C, D (primeira metade) e F (403 no separar vazio); (s1) da
  T1 → cai E; (s1) da T2 → cai a asserção da fila em A; nenhuma jornada não prevista pode cair.
- [ ] **T4 — fechamento (skill `fechar-etapa`).** Novidades: seção da Etapa 94; **B453–B459**; **C163–C168**; **A45**;
  D (94) e F (94); a linha **(93)** de D ("A alçada de valor reavaliada depois de começar a separação") marcada
  resolvida; o item **68** de C anotado (o atalho vira seta — B454 — e o lembrete continua de fora); "Onde estamos";
  cabeçalho. Specs `06` (status e checklist: a alçada vale até o começo da separação; **dizer à vista** que o manual
  atribuía o bloqueio a "itens alterados" — nenhuma rota altera item —, e que o gatilho real é custo e configuração),
  `05` (o "Fica de fora" da 93 sobre `verificarBloqueioLiberacao` marcado resolvido; a fila), `04` (máquina: as ~~cinco~~ seis
  setas — Fase 2), `07` (a reserva da reprovada/cancelada não fica mais solta com caixa). Mapa. **(Fase 2, M4)** O diagrama "Máquina de
  estados" de `docs/superpowers/specs/2026-08-05-almoxarifado-etapa3-requisicoes-design.md:20-21` — de que
  `requisitionStateMachine.js:4` diz que `TRANSICOES` é "cópia literal" — é atualizado (ou o comentário deixa de dizer
  "cópia literal"); dizer à vista que ele já estava atrasado (não tem as setas de reserva da Etapa 4 nem as da 74).
  Guia: o legado — *Reabrir separação* (B460). Guia do usuário (roteiro: separar
  4, entregar 2, **registrar entrada com custo alto** em Movimentações, entregar o resto → entrega normal; e o caminho de
  projeto: custo alto **antes** de separar → *Aguard. Aprov. Valor* → liberar → separar). Manual **8.3 item 3**
  (reescrito: "antes de começar a separação, se o valor subir — custo do material ou limite/ativação da alçada — …;
  depois que há material separado ou entregue, a alçada não é mais conferida") e **10.6** (a fila só mostra *Aguardando
  aprovação de valor* antes da separação). Retro; **Próxima tarefa detalhada — Etapa 95**.

## Teste de integração — por que a T3 é a única prova de três coisas

1. **A regra mora no serviço e a fila concorda com a porta.** Só as jornadas A–C seguem a fila e a porta lado a lado, e
   só a D chama o serviço sem rota.
2. **Seguir até o último gesto.** Cada RN afirma um gesto; só as jornadas levam a requisição até `ENTREGUE` pela rota
   depois do custo/limite mudar, e conferem A45 e A43 vazias — a prova de que nenhum gesto deixa estado que outro
   recuse (a sonda 2 era exatamente isso: cada porta certa sozinha, a requisição presa no fim).
3. **O legado sai pelo caminho que a B458 promete.** Só a jornada F prova que a regra nova destrava o que o desvio já
   deixou, sem script.

## Avisos (letra C) — a registrar no fechamento

- **C163 — custo ou limite que mudavam depois de começada a separação tiravam a requisição da máquina** (sonda 1: 5/7
  por gatilho, nos quatro gatilhos; sonda 2: 7/8 por origem): *Aguardando aprovação de valor* com material na caixa ou já
  entregue; reprovar ou cancelar soltavam a reserva com o material separado; aprovar devolvia a *Reservada* com entregue.
  Resolvido pela B453. **O que fazer:** rodar a A45.
- **C164 — separar e cancelar no mesmo instante ressuscitavam a cancelada** em *Aguardando aprovação de valor* (**10/10
  sem gancho**), e aprovar por valor depois **reservava de novo**. Resolvido pela B456. **O que fazer:** a A43 (a) já a
  lista (trilha de cancelamento fora de *Cancelado*).
- **C165 — a fila de separação dizia *Aguardando aprovação de valor* numa requisição em separação** (sonda 4, 3/3).
  Resolvido pela B457.
- **C166 — o manual (8.3) dizia que a requisição volta a travar se o valor subir "(itens alterados)"** — nenhuma rota
  altera item depois da criação; os gatilhos reais são o **custo** (entrada com custo; custo do cadastro quando a média
  é zero) e a **configuração** (limite baixado, alçada ligada). Corrigido à vista no fechamento.
- **C167 — o que muda para quem opera (risco aceito):** depois de começada a separação, a alta de custo ou a mudança de
  limite **não para mais** a entrega — uma requisição pode sair acima do limite se o custo subiu depois de separada. O
  controle de valor fica na aprovação e no começo da separação (B453).
- **C168 — o que muda para quem integra:** o 409 V1 na separação; a etapa `RETOMAR_SEPARACAO` na fila (64) (Fase 2,
  B460); as ~~cinco~~ seis (Fase 2: + `EM_SEPARACAO`) transições novas na máquina
  (`validarTransicao(pré-separação, 'AGUARDANDO_APROVACAO_VALOR')` passa a ser `ok`); a entrega deixa de responder V403b.

## O que fica de fora (declarado — e por quê)

- **O lembrete por e-mail da requisição que volta a aguardar valor depois de aprovada** (C68/A25 da 47) — a seta nova
  (B454) não muda a régua `data_aprovacao IS NULL`; cobrá-la pede outra frase ("voltou a aguardar liberação") e não há
  queixa de uso. Candidata.
- **Guarda em reprovar/cancelar com caixa** (B458) — só o legado chega lá; a A45 orienta.
- **Reavaliar só o saldo a entregar** (B453 (a)).
- **Os cancelamentos na trava por requisição** (B450, B456).
- **Mais de um processo** — premissa C132 (um processo); o `AND status = ?` da B456 já vale para esse dia.
- **C145, C147, C150, C139** e os residuais da 93 — como na 93.

## Letra A — consulta para produção (a confirmar no fechamento como **A45**)

Conferida em memória contra o esquema real (`e94-sonda-5-a45.js`) — cada consulta acha o caso produzido pelo desvio, não
acha o mesmo fluxo sem desvio, e o banco recusa com uma coluna trocada (Fase 0, sonda 5).

```sql
-- (a) aguardando valor, reprovadas ou canceladas com material separado ou entregue (o desvio, ou o que ele deixou)
SELECT rq.id, rq.numero, rq.status, i.id AS item_id,
       COALESCE(i.quantidade_separada,0) - COALESCE(i.quantidade_entregue, i.quantidade_atendida, 0) AS na_caixa,
       COALESCE(i.quantidade_entregue, i.quantidade_atendida, 0) AS entregue
  FROM requisicoes_almoxarifado rq JOIN itens_requisicao_almoxarifado i ON i.requisicao_id = rq.id
 WHERE COALESCE(rq.ativo,1) = 1 AND rq.status IN ('AGUARDANDO_APROVACAO_VALOR','REJEITADO','CANCELADO')
   AND (COALESCE(i.quantidade_separada,0) > 1e-9 OR COALESCE(i.quantidade_entregue, i.quantidade_atendida, 0) > 1e-9)
 ORDER BY rq.id;
-- (b) "aprovada/reservada" com material separado ou entregue (a aprovação por valor depois do desvio)
SELECT rq.id, rq.numero, rq.status, i.id AS item_id, COALESCE(i.quantidade_separada,0) AS separado,
       COALESCE(i.quantidade_entregue, i.quantidade_atendida, 0) AS entregue
  FROM requisicoes_almoxarifado rq JOIN itens_requisicao_almoxarifado i ON i.requisicao_id = rq.id
 WHERE COALESCE(rq.ativo,1) = 1
   AND rq.status IN ('APROVADO','AGUARDANDO_ESTOQUE','AGUARDANDO_COMPRA','PARCIALMENTE_RESERVADA','TOTALMENTE_RESERVADA')
   AND (COALESCE(i.quantidade_separada,0) > 1e-9 OR COALESCE(i.quantidade_entregue, i.quantidade_atendida, 0) > 1e-9)
 ORDER BY rq.id;
```
**(Corrigido na Fase 2, M3.)** A régua do entregue é `COALESCE(quantidade_entregue, quantidade_atendida, 0)` — a mesma
do predicado (`getEntregue`); o texto da Fase 0 usava `COALESCE(quantidade_entregue,0)`. A T3 (RN-06) reconfere as
duas consultas com a régua nova contra o esquema real. A (a) **sobrepõe** a A43 (b) nas canceladas com caixa (dito no texto, para ninguém somar as duas). A ressuscitada da
C164 é a **A43 (a)** — não repetida. O que fazer com cada linha (texto da A45): (a) *Aguardando* — aprovar por valor e
seguir a (b); *Reprovada*/*Cancelada* — devolver à prateleira o que está na caixa; o que já foi entregue saiu de fato
(nada a estornar), conferir com quem recebeu. (b) *Iniciar Separação* sem quantidade (com a versão nova não há 403) →
*Em Separação* → entregar o que falta, ou encerrar se não se quer mais. **Falso positivo possível** em dado anterior à
máquina de estados (Etapa 3) — conferir a trilha.

## O que contradiz a próxima tarefa escrita na 93

1. **"Não precisa de teste de corrida: o defeito é sequencial."** — Errado: o `UPDATE` da alçada (`WHERE id = ?`)
   ressuscita a cancelada quando separar e cancelar coincidem (**10/10 sem gancho**, sonda 3b) — os dois cancelamentos
   ficam fora da trava por requisição. Vira RN-04/T1.
2. **O critério recomendado ("quando o status lido tem seta para lá na máquina, ou quando ainda não há rodada nem
   entrega")** — (a) nenhum status de `PODE_SEPARAR` tem seta para *Aguardando* hoje: a regra literal desligaria a
   alçada também antes da separação; (b) "rodada" não serve: *Iniciar Separação* sem quantidade deixa `EM_SEPARACAO`
   sem rodada (medido). Resolvido com as setas novas (B454) + "nada na caixa" (B453).
3. **A A45 proposta** olhava `quantidade_entregue > 0` nas `APROVADO`/`*_RESERVADA` — perderia as que vieram de
   `EM_SEPARACAO`/`PRONTA` (4 separados, 0 entregues) e aprovadas por valor: a régua é separado **ou** entregue
   (sonda 5, RN-02 (b')). E a ressuscitada já é da A43 (a).
4. **A fila (64)** aparecia só como teste a medir ("a fila não chama a função, B255") — ela **reimplementa** a mesma
   regra ao vivo e mostra *Aguardando aprovação de valor* nas três pós-separação (sonda 4, 3/3): entra no escopo (T2).
5. **O C68 e a A25 da Etapa 47** não eram citados — o atalho pré-separação já estava registrado como "mudança de máquina,
   etapa própria". Esta etapa o resolve como seta (B454) e deixa o lembrete de fora.
6. **"Medir se `TOTALMENTE_RESERVADA → AGUARDANDO_APROVACAO_VALOR` pede seta na máquina ou nota na spec 06"** — medido:
   o caminho é coerente (sonda 2, origem `RESERVADA`, 0/8: uma reserva só, reprovar solta, aprovar volta a
   `TOTALMENTE_RESERVADA`) — pede **seta** (B454).
7. **"Literais e guardas atuais inalteradas"** para a separação — vale, com um acréscimo: o 409 V1 (B456). E a entrega
   **deixa** de responder V403b (nunca está em pré-separação).
8. Confirmado como a 93 escreveu: o gatilho inclui custo e limite (e também **ligar** a alçada); a liberação para
   retirada não verifica (o desvio aparece na entrega seguinte); `/aprovar-valor` devolve `TOTALMENTE_RESERVADA` com
   entregue, e da `PRONTA` perde a liberação.

## Fase 2 — revisão do plano (2026-10-09): 1 bloqueante, 3 importantes, 5 menores → plano revisto (vale sobre o texto acima)

Revisor fresco (plano + specs 06/05/04/07 + plano da 93, as quatro perguntas da skill), com sondas no scratchpad
(`e94rv-sonda.js`, `e94rv-sonda-legado.js`). Cada achado foi conferido contra o código antes de entrar — as duas sondas
foram **rerodadas contra `2bfc82c2`** e reproduziram o que o revisor disse; os pontos afetados acima estão marcados
**"(corrigido na Fase 2)"** ou **"(Fase 2)"**. Decisões novas: **B460–B463**.

**Bloqueante**

1. **B1 — o caminho legado da B458 não é feito pela tela quando tudo já está separado (reproduzido).** Aprovar por
   valor → *Iniciar Separação* sem quantidade → entregar funciona **pela API**, mas: a fila não lista a requisição
   (nada a separar, e `TOTALMENTE_RESERVADA` está fora de `PODE_ENTREGAR`) e o modal desabilita "Confirmar Separação"
   quando todo item tem `maxQtdSeparacao <= 0` (`client/src/components/almoxarifado/RequisicoesList.js:51-54`,
   `:2120`). Medido: legado `EM_SEPARACAO`→aprovado (4 de 4) e `PARCIAL`→aprovado (4 separados, 2 entregues) — fila
   **ausente**, `maxQtdSeparacao` 0, botão **desabilitado**, separar vazio pela API 200 `EM_SEPARACAO`; o legado com 2
   de 4 separados aparece com `SEPARAR` e o botão habilitado. **Decidido (a), B460:** ramo pequeno no cliente
   ("Reabrir separação" habilitado com zero) e a etapa `RETOMAR_SEPARACAO` na fila com o **mesmo** predicado
   (`separacaoAReabrir`). Descartado (b) só declarar e depender da API ou do administrador. Entra RN-05 (c') (T2) e a
   task de cliente **T2c**, depois da T2.

**Importantes**

1. **I1 — a reserva na chegada é a terceira cópia da regra (reproduzido).** `reservaChegadaService.bloqueadaPorValor`
   (`server/services/almoxarifado/reservaChegadaService.js:111-115`) avalia ao vivo sobre `PODE_SEPARAR` (inclui
   `EM_SEPARACAO` e `PARCIALMENTE_ATENDIDA`) — a frase de "O que não muda" que dizia "só `AGUARDANDO_*`,
   pré-separação" **estava errada** (marcada lá). Medido: `EM_SEPARACAO` com 2 de 4 separados, nota de 2 — limite 10
   → 1 reserva; limite 1 → **0** reservas, fila `APROVACAO_VALOR`, separar o resto 403. **Decidido, B461:** estender
   a B457 — `if (c.data_aprovacao_valor || !alcadaDeValorAindaVale(c.status, itensDaReq)) return false` (todos os
   itens da requisição). RN-05 (e) e controle (s3) na T2.
2. **I2 — a `EM_SEPARACAO` vazia escaparia da alçada (reproduzido).** *Iniciar Separação* sem quantidade → limite
   baixa → separar 4: hoje 403 e *Aguardando* (coerente); com o protótipo, separa 4 → entrega 4 → `ENTREGUE` sem
   aprovação. **Decidido (a), B462:** sexta seta `EM_SEPARACAO → AGUARDANDO_APROVACAO_VALOR`; "nada na caixa" já
   exclui a separada. RN-03 passa a "exatamente `PENDENTE` + seis"; RN-02 (a) ganha a linha; controle (s8) na T0;
   Jornada G na T3. Descartado (b) declarar.
3. **I3 — o espião não veria a chamada.** `requisitionValueApprovalService.js:151` chama `notificarAprovadoresValor`
   pelo binding local; o espião no objeto exportado só a vê se ela passar por ele, e a T0 já precisa disso para a
   asserção negativa do RN-01 (a) — que sem controle positivo passaria vazia. **Corrigido:** "chamar pelo objeto
   exportado" sai da T1 e entra na **T0**; o s4 da T1 vira o s7 da T0; o s1 da T0 serve de controle positivo da
   asserção negativa (sem o retorno antecipado o espião vê a chamada → cai).

**Menores**

1. **M1** — o V1 na tela: `handleSeparacao` (`RequisicoesList.js:~723-733`) só mostra o toast e deixa o modal
   aberto. **Decidido, B463:** num 409 fechar o modal e recarregar (como o `handleExcluir` da 93, `:~1039`); entra na
   T2c. Fecha também o **M2 da 93** para o **X1**.
2. **M2** — o V1 também sai, inofensivo, quando o recálculo da 76 ou o `/aprovar` mudam o status entre a leitura e o
   `AND status = ?`. Declarado na B456 (tentar de novo é o certo).
3. **M3** — a A45 usava `COALESCE(quantidade_entregue,0)` e o predicado `COALESCE(quantidade_entregue,
   quantidade_atendida)`. Corrigido: a A45 usa a régua do predicado (cinco ocorrências); a T3 reconfere.
4. **M4** — `requisitionStateMachine.js:4` diz que `TRANSICOES` é cópia literal do diagrama de
   `docs/superpowers/specs/2026-08-05-almoxarifado-etapa3-requisicoes-design.md:20-21`. O fechamento (T4) atualiza o
   diagrama ou o comentário — e diz que o diagrama já estava atrasado (sem as setas da Etapa 4 e da 74).
5. **M5** — a RN-02 (a) não dizia como cada status de partida é produzido. Corrigido: rota para
   `TOTALMENTE_RESERVADA`, `PARCIALMENTE_RESERVADA`, `AGUARDANDO_ESTOQUE`, `AGUARDANDO_COMPRA` (com a solicitação de
   compra por escritor direto) e a `EM_SEPARACAO` vazia; escritor direto para `APROVADO` (nenhuma rota o deixa estável
   hoje).

## Próximo passo

**(Fase 2 feita — ver a seção acima.)** Próximo: **T0**.

~~Fase 2:~~ (texto original:) um agente fresco recebe este plano + as specs `06`, `05`, `04`, `07` + o plano da 93 e responde as quatro
perguntas da skill: (1) os contratos cobrem os casos de erro e as literais (V403a, V403b, V1, S1, E0, AV1, RV1)? (2) as
RN batem com as specs (em especial: a 06 e o C68; a D3 da 28 não é tocada)? (3) T1 e T2 são independentes de verdade
(T1 edita o mesmo arquivo da T0; T2 só consome o predicado)? (4) **cada RN seguida até o último gesto do usuário** — em
especial: depois da RN-01, a entrega acima do limite emite e-mail a alguém? (não — e isso é o C167; está escrito?);
depois da RN-04 (409 V1), a tela recarrega ou o modal fica aberto (`RequisicoesList.js` `catch` só com toast — o mesmo
M2 da 93)?; depois da B458 (legado aprovado → separar vazio), a conferência de material **crítico** da rodada velha
ainda vale na entrega (`assertConferidaSeObrigatorio` — a separar vazia não grava rodada)?; e o `reservaChegadaService`
(74) com uma `AGUARDANDO_ESTOQUE` que vai a *Aguardando valor* pela seta nova — a chegada continua não reservando
(B380)? Conferir por leitura **e** por sonda; corrigir o plano e só então a T0.

---

## Suíte do protótipo (Fase 0)

Worktree descartável `C:/Users/User/projetos/CRM-e94proto` (HEAD `e5d216b6`, junction de `server/node_modules`), as três
edições do protótipo (cinco setas; `alcadaAindaVale` + `AND status = ?` sem a literal V1 — perdendo, devolvia o 403 de
valor; a fila com o predicado). `npm run test:api`: **326/327 arquivos**, 3m35s; o único vermelho é
`requisicaoGestosConcorrentes.api.test.js` `[93 RN-08] (d4)` — *"premissa: a entrega cai na aprovacao por valor: 200
{"success":true,"status":"PARCIALMENTE_…"* —, exatamente o previsto pela B459. **Régua conferida:** o grep de `✗` na
saída acha 1, e o resumo do runner diz 326/327 (os dois concordam). `test:almoxarifado` 44/0. Nenhum dos 23 arquivos de
alçada caiu — em especial `recebimentoReservaChegadaEstorno` `[Fase 2] /rejeitar-valor` (monta *Aguardando* por separar de
`TOTALMENTE_RESERVADA` — o caminho de projeto, que continua), `filaSeparacao` e `integracaoAprovacoesRegra`. A worktree foi
removida depois da medição (junction primeiro).
