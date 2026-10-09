# Etapa 93 — dois gestos na mesma requisição ao mesmo tempo: separar, liberar, entregar, excluir e encerrar não passam um por cima do outro (D (92), feature 04 com a 05 e a 07)

> Status: **Fases 0, 1 e 2 feitas (2026-10-09) — plano revisto, nenhuma task executada.** Próximo: **T0**. A Fase 2
> (1 bloqueante, 4 importantes, 6 menores) está em "Fase 2 — revisão do plano" no fim e **vale sobre o texto acima**;
> os pontos afetados estão marcados **"(corrigido na Fase 2)"** ou **"(Fase 2)"**.
> HEAD de partida: `7f45ecef` (main, árvore limpa, sem push).
> Origem: "Próxima tarefa detalhada — Etapa 93" de
> `docs/superpowers/plans/2026-10-08-almoxarifado-etapa92-cancelar-outros-modulos.md` (fim do arquivo), o **achado 7** da
> Fase 5 da 92 e as duas linhas **(92)** de D em `docs/almoxarifado-novidades-por-etapa.md:8526-8535` ("a exclusão
> administrativa no instante de uma separação" e "liberar para retirada ou entregar no mesmo instante de uma separação").
>
> **Numeração:** etapa única para todos os módulos (esta é a **93**). Letras do documento do almoxarifado, conferidas em
> 2026-10-09: última **B442** (`:1542`, `:5872`), último item C **155** (`:7609`), última **A43** (`:119`). Esta etapa
> usa **B443–B451**, **C156–C162** e **A44**.

**Escopo desta etapa (o que a Fase 0 reproduziu — e só isso):**
1. **Uma trava por requisição** (em memória, um processo — a mesma premissa C132 da trava por material, mas **outra**
   trava) em volta das cinco portas do almoxarife que mexem numa requisição depois de aprovada: **separar**,
   **liberar para retirada**, **entregar**, **excluir** (as duas rotas) e **encerrar**. Fecha, medido 5/5 cada, as
   corridas 1a, 1b, 1c, 2a, 2b, 3a, 3b, 3c, 4a, 4b, 4c, 4e e 7a abaixo — inclusive as duas que **mexem em estoque**:
   duas entregas da mesma requisição que deixam sair material a mais (**C156**, 10/10 sem gancho) e duas exclusões que
   estornam duas vezes (**C157**, 10/10 sem gancho).
2. **As gravações de status das cinco portas conferem o status lido** (defesa em profundidade e o caminho para mais de
   um processo): o *compare-and-clear* da separação, a liberação (com a marca de rodada), o `UPDATE` final da entrega, o
   da exclusão e o do encerramento. Cada uma com a resposta decidida para quando perde (B444–B448) — inclusive a **409 ×
   200 da separação com a rodada já gravada**, que o plano da 92 deixou em aberto.
3. **A44** — cinco consultas para produção (as excluídas que voltaram a outro status — o achado 7 —, o item que perdeu
   entrega, o estorno duplicado ou faltante, a requisição toda entregue parada fora de *Entregue*, e a *Pronta* com
   crítico sem conferência), conferidas contra o esquema real com controle positivo e negativo.

**Fora (declarado, ver "O que fica de fora"):** reivindicar a exclusão antes do estorno (o caminho multi-processo);
`verificarBloqueioLiberacao` gravando `AGUARDANDO_APROVACAO_VALOR` sem conferir a máquina; a conferência e os dois
cancelamentos fora da trava nova; prazo para pegar a trava; C145, C147, C150, C139.

---

## Fase 0 — medido (2026-10-09)

Sondas no scratchpad da sessão (`e93-sonda-lib.js`, `e93-sonda-1-separacao.js`, `-2-exclusao.js`, `-3-liberar.js`,
`-4-entrega.js`, `-5-natural.js`, `-6-entrega-natural.js`, `-7-encerrar.js`, `-8-a44.js`), contra
`server/tests/helpers/testApp.js` com `requirePermission` real e **usuário por requisição** (`x-teste-usuario`, o
middleware da 92 inserido logo depois do `jsonParser`): **S** sem perfil (PRODUÇÃO) cria a requisição por `POST
/api/requisicoes-material`; **ALMOX** e **ALMOX2** (`perfil_almoxarifado: ALMOXARIFE`) separam, conferem, liberam e
entregam; **ADMIN** superadmin exclui e encerra. Reserva de `pede` montada por `stockService.criarReserva` e status
`TOTALMENTE_RESERVADA` por `UPDATE` (o estado da tela, molde da 92). Material não crítico salvo onde dito.

**Gancho (técnica da 92):** `db.run` da instância embrulhado; ao casar a regex do `UPDATE` da porta, roda o gesto
concorrente **inteiro, até a resposta**, e só então emite o comando retido. Contador de disparos por rodada — **toda
rodada de todos os cenários abaixo disparou exatamente 1 vez** (nenhum "gancho não disparou" no placar). N=5 por
cenário. Regex usadas:
- CAC (*compare-and-clear*): `/SET\s+status\s*=\s*'EM_SEPARACAO'[\s\S]*conferido_por_id\s*=\s*NULL/`
- EXCL: `/SET\s+ativo\s*=\s*0,\s*status\s*=\s*'CANCELADO'/`
- LIB: `/SET\s+status\s*=\s*'PRONTA_PARA_RETIRADA'/`
- ENT: `/SET\s+status\s*=\s*\?,\s*(data_entrega\s*=|updated_at\s*=\s*CURRENT_TIMESTAMP,\s*ultimo_lembrete_enviado\s*=\s*NULL\s+WHERE)/`

**Controle positivo de cada detector:** os mesmos gestos **em sequência** (sem corrida) — o detector diz "certo" (0/2
em cada um dos 1a, 1c, 2a, 3a, 3c, 4b), e o mesmo detector diz "errado" 5/5 com o gancho. O detector sabe falhar e sabe
passar.

### Porta 1 — o *compare-and-clear* da separação (`requisitionService.js:938-973`)

Os dois `UPDATE` (`:955-962` no laço de 3, `:966-972` no *fallback*) regravam `status='EM_SEPARACAO'` com `WHERE id=? AND
conferido_por_id IS ?` / `WHERE id=?` — **depois** da reivindicação da 92, dos itens e da rodada.

| cenário (gesto no gancho do CAC) | placar | estado final (exemplo) |
|---|---|---|
| **1a** exclusão administrativa (ADMIN) — **o achado 7 da 92** | **5/5** | separação 200, exclusão 200; `EM_SEPARACAO`, **`ativo=0`**, separado 1, reserva `LIBERADA`, r=0, 1 rodada, trilha `EXCLUSAO,SEPARACAO` — a requisição excluída, escondida da lista, em separação, com material na caixa e sem reserva |
| **1b** liberar para retirada (ALMOX2), rodada 2 sobre requisição já `EM_SEPARACAO` | **5/5** | as duas 200 (liberação `{"status":"PRONTA_PARA_RETIRADA"}`); final **`EM_SEPARACAO`**, separado 2, 2 rodadas, trilha `SEPARACAO,LIBERACAO_RETIRADA,SEPARACAO` — a liberação some sem aviso, a trilha diz que aconteceu |
| **1c** entrega dos 4 (ALMOX2), a rodada separa os 4 | **5/5** | entrega 200 `ENTREGUE`, `data_entrega` gravada, `SAIDA:4`, reserva `CONSUMIDA`; final **`EM_SEPARACAO`** com tudo entregue. Depois: entregar → 400 *"…Máximo: 0 (pendente: 0, disponível: 0)"*; liberar → 200 (`PRONTA_PARA_RETIRADA`); entregar de novo → o mesmo 400; cancelar (S) → 400. **Nunca chega a `ENTREGUE`** (e de `PRONTA_PARA_RETIRADA` não se encerra). |

### Porta 2 — a exclusão administrativa (`requisitionService.excluirRequisicao`, `:1379-1527`)

Lê com `COALESCE(ativo,1)=1`, calcula e **executa** o estorno pelos itens lidos, e só então grava `SET ativo=0,
status='CANCELADO' … WHERE id=?` (`:1498-1502`) sem conferir nada. **A exclusão não tem regra de status** — aceita
qualquer requisição ativa (inclusive `ENTREGUE`/`ENCERRADA`); medido por leitura, confere com a spec 04.

| cenário (gesto no gancho do `UPDATE ativo=0`) | placar | estado final |
|---|---|---|
| **2a** entrega dos 4 (separados 4) | **5/5** | exclusão 200 `{"estornos":[],"reservas_liberadas":[]}`, entrega 200; `CANCELADO`, `ativo=0`, entregue 4, `SAIDA:4` **sem** `ENTRADA` de estorno, q=0 — excluída com uma saída que o estorno não cobriu |
| **2b** **outra exclusão** da mesma requisição `ENTREGUE` (4) | **5/5** | as duas 200, **duas** trilhas `EXCLUSAO`, `ENTRADA:4,ENTRADA:4` — **q=8 para 4 que saíram: 4 de estoque fantasma** (**C157**) |
| 2c separação (1) | 0/5 | `CANCELADO`, `ativo=0` — excluir `EM_SEPARACAO` é permitido; não é defeito |
| 2d liberar | 0/5 | idem (`CANCELADO`, `ativo=0`) |

### Porta 3 — liberar para retirada (`routes/almoxarifado.js:3785-3828`)

Valida a transição, "Nenhum item separado" e a barreira do crítico (`assertConferidaSeObrigatorio`) **na leitura**, e
grava `SET status='PRONTA_PARA_RETIRADA' … WHERE id=?` (`:3805-3807`) sem guarda.

| cenário (gesto no gancho do `UPDATE` da liberação) | placar | estado final |
|---|---|---|
| **3a** entrega de tudo (pede 1, separado 1) | **5/5** | entrega 200 `ENTREGUE`, liberação 200; final **`PRONTA_PARA_RETIRADA`** com tudo entregue, reserva `CONSUMIDA`. Depois: entregar → 400 *"Máximo: 0"*; encerrar → 400 *"Transição inválida: PRONTA_PARA_RETIRADA → ENCERRADA"*. **Presa.** Controle sequencial: liberar depois da entrega → 400 *"Transição inválida: ENTREGUE → PRONTA_PARA_RETIRADA"*. |
| **3b** exclusão | **5/5** | `PRONTA_PARA_RETIRADA`, **`ativo=0`**, reserva `LIBERADA`, trilha `SEPARACAO,EXCLUSAO,LIBERACAO_RETIRADA` |
| **3c** rodada 2 de material **crítico** (rodada 1 por ALMOX, conferida por ALMOX2; rodada 2 por ALMOX no gancho) | **5/5** | as duas 200; final **`PRONTA_PARA_RETIRADA`, `conferido_por_id` NULL, separado 2, reserva `ATIVA` r=4** — a rodada 2 nunca conferida passou pela barreira (lida antes dela). Depois: entregar → 400 *"Esta requisição tem material crítico separado e ainda não passou pela segunda conferência…"*; conferir → 400 *"Só é possível conferir uma requisição em separação (status atual: PRONTA_PARA_RETIRADA)"*; separar → 400 S1; cancelar → 400; encerrar → 400. **Nenhum gesto a tira dali; a reserva de 4 fica presa** — só a exclusão (**C158**). Controle sequencial: liberar depois da rodada 2 → 400 com a literal da barreira. |

### Porta 4 — a entrega (`requisitionService.entregarRequisicao`, `:1032-1374`)

Lê o status, **baixa o estoque item a item** (motor) e grava `quantidade_entregue` por item a partir do item **lido no
começo** (`let entregueAcumulado = getEntregue(item)`, `:1271` → `UPDATE … SET quantidade_entregue=?` `:1318-1320` —
**corrigido na Fase 2**, o texto dizia `:1225`/`:1303-1305`), e só no
fim grava `SET status=? … WHERE id=?` (`:1362-1370`) sem guarda.

| cenário | placar | estado final |
|---|---|---|
| **4a** exclusão no gancho do `UPDATE` final da entrega dos 4 | **5/5** | entrega 200 `ENTREGUE`, exclusão 200 com estorno de 4 (q volta a 4); final **`ENTREGUE` com `ativo=0`** |
| **4b** outra entrega (2) no gancho do `UPDATE` final da primeira (2), separados 4 | **5/5** | a segunda 200 `ENTREGUE`, a primeira 200 `PARCIALMENTE_ATENDIDA`; final **`PARCIALMENTE_ATENDIDA` com 4 de 4 entregues**, sem `data_entrega` — sai por **Encerrar** (`ENCERRADA`, não `ENTREGUE`) (**C159**) |
| **4c** rodada 2 de **crítico** no gancho do `UPDATE` final de uma entrega parcial (separado 2, conferido; entrega 1) | **5/5** | `PARCIALMENTE_ATENDIDA`, `conferido_por_id` NULL, 2 na caixa. Depois: entregar 400 (barreira), conferir 400 (não é `EM_SEPARACAO`), **Iniciar Separação 200 → conferir 200**. Recuperável pela saída que a D3 da 28 já declara — degradado, não preso. |
| 4d liberar no gancho do `UPDATE` final de entrega parcial | 0/5 | `PARCIALMENTE_ATENDIDA` (de `PRONTA` é transição válida) — não é defeito |
| **4e** outra entrega (2) no gancho do `UPDATE` do **item** da primeira (2), separados 4 — *perda de atualização no item, não no status* | **5/5** | as duas 200 `PARCIALMENTE_ATENDIDA`; `SAIDA:2,SAIDA:2`, reserva `CONSUMIDA` u=4, mas **`quantidade_entregue` = 2** (a primeira regravou o acumulado lido antes da segunda) (**C156**) |

**Vizinho da porta 4 — encerrar** (`routes/almoxarifado.js:3912-3948`, `SET status='ENCERRADA' … WHERE id=?`):

| cenário | placar | estado final |
|---|---|---|
| **7a** encerrar no gancho do `UPDATE` final de uma entrega parcial (de `PARCIALMENTE_ATENDIDA`) | **5/5** | encerrar 200 (reservas liberadas, trilha `ENCERRAMENTO`), entrega 200; final **`PARCIALMENTE_ATENDIDA`** — a encerrada volta a aberta (**C160**) |
| 7b entrega no gancho do `UPDATE` do encerramento | 0/5 | `ENCERRADA`; a entrega aconteceu **antes** do encerramento gravar — ordem legítima |

### Largura real (sem gancho) — `e93-sonda-5-natural.js` e `-6-entrega-natural.js`

Os dois gestos disparados com `d` ms de diferença, 10 rodadas por `d`:

| corrida | d=0 | d=1 | d=3 | d=6 |
|---|---|---|---|---|
| **2b** duas exclusões de uma `ENTREGUE` (estorno duplo) | **10/10** | **10/10** | 2/10 | 0/10 |
| **4e** duas entregas de 2 (item perde entrega) | **10/10** | **10/10** | 2/10 | — |
| 1a separa × exclui | 0/10 | 2/10 | 0/10 | 0/10 |
| 3a libera × entrega tudo | 0/10 | 0/10 | 0/10 | 0/10 |

**4e sem gancho, com 8 em estoque (pede 4, reserva 4, separa 4):** em **10/10** (d=0) o item fica com entregue 2 para
`SAIDA` 4; a tela oferece entregar os 2 "que faltam" e a **terceira entrega sai: 6 saídas para 4 pedidos, q=2**
(`ENTREGUE`). Com o estoque só da reserva a terceira entrega é recusada pelo disponível — o dano depende de haver saldo
livre. **O botão desabilita durante o envio** (`RequisicoesList.js` `setSaving`), então a corrida pede duas abas ou duas
pessoas — dois almoxarifes na mesma requisição, ou o mesmo em duas telas (fila de separação e detalhe).

### Placar por porta (o pedido do brief)

| porta | reproduzido | não alcançável / não defeito |
|---|---|---|
| 1 — *compare-and-clear* da separação | **1a 5/5, 1b 5/5, 1c 5/5** (1a 2/10 sem gancho) | — |
| 2 — exclusão | **2a 5/5, 2b 5/5** (2b **10/10** sem gancho) | 2c, 2d 0/5 (excluir *Em Separação*/*Pronta* é permitido) |
| 3 — liberar para retirada | **3a 5/5, 3b 5/5, 3c 5/5** | — (sem gancho 0/40: janela estreita) |
| 4 — entrega (+ encerrar) | **4a 5/5, 4b 5/5, 4c 5/5, 4e 5/5, 7a 5/5** (4e **10/10** sem gancho) | 4d, 7b 0/5 (transições válidas) |

### A44 conferida (`e93-sonda-8-a44.js`)

As cinco consultas (texto em "Letra A" abaixo), cada uma contra o esquema real em memória: **acham** os casos que as
corridas produzem — (a) 1a, 3b e 4a; (b) 4e; (c) 2b **e** 2a; (d) 1c, 3a e 4b; (e) 3c —; **não acham** o mesmo fluxo
feito em sequência (exclusão normal; duas entregas em sequência; exclusão de `ENTREGUE` em sequência; `ENTREGUE`
normal; crítico conferido e liberado); e com uma coluna trocada (`rq.numerox`) o banco **recusa** as cinco
(`SQLITE_ERROR: no such column`). A **A43** da 92 não acha (a) — filtra `COALESCE(ativo,1)=1` —, como o fechamento da
92 já dizia.

### Os testes que tocam isto (medir antes/depois)

- Separação (`grep -lE "/separar[\`'\"/]|/separacao[\`'\"]|separarRequisicao" server/tests/api/*.js`): **30** arquivos (a
  92 contava 28; entraram `separacaoNaoRessuscita` e `cancelarOutrosModulosIntegracao`).
- Entrega (`grep -lE "/entregar[\`'\"]|entregarRequisicao"`): **32**.
- Exclusão (`grep -lE "excluirRequisicao|\.delete\(.*requisic"`): **8** — `auditoriaAtosEGate`, `entregaOrigemPorItem`,
  `entregaSeriePorItem`, `indicadoresSpec27Integracao`, `loteControleObrigatorio`, `relatoriosIndicadoresSpec27`,
  `requisicaoEntregaMotor`, `reservaPontasFaltantes`.
- Liberar (`grep -ln liberar-retirada`): **6** — `permissoesRotas`, `requisicaoEstados`, `requisicaoReservaAutomatica`,
  `reservaLiberarSoQuemPode`, `segundaConferencia`, `separacaoFluxoCompleto`.
- Encerrar (`grep -l /encerrar`): **8** — `indicadoresSpec27Integracao`, `recebimentoReservaChegadaEstorno`,
  `recebimentoReservaChegadaIntegracao`, `relatoriosIndicadoresSpec27`, `remessaTerceiroRotas`,
  `requisicaoAssinaturaJornada`, `requisicaoCicloFinal`, `requisicaoReservaAutomatica`.
- **A regex do CAC é afirmada por teste:** `separacaoNaoRessuscita.api.test.js` `RE_COMPARE_AND_CLEAR` exige `WHERE\s+id\s*=\s*\?\s+AND\s+conferido_por_id\s+IS\s+\?`
  (RN-09 (c) da 92 faz falhar esse `UPDATE`). **A condição nova de status entra DEPOIS do `conferido_por_id IS ?`**, senão
  a regex da 92 deixa de casar e o RN-09 (c) da 92 vira teste vazio (gancho não dispara). `segundaConferencia` e
  `separacaoComDono` citam o *compare-and-clear* por texto/`db.get` — medir.
- **Concorrência na mesma requisição em teste existente:** `Promise.all`/`allSettled` com entregar/separar em
  `entregaOrigemPorItem:157`, `entregaSeriePorItem:261` e `requisicaoEntregaMotor:171` — **requisições distintas** (a
  trava por requisição não as serializa); `segundaConferencia:284/319` — separar × **conferir** (conferir fica fora da
  trava, B450). ~~Nenhum teste existente roda um gesto travado **dentro do gancho** de outro gesto travado da **mesma**
  requisição~~ — **(corrigido na Fase 2: a frase estava errada)** `separacaoNaoRessuscita.api.test.js:402-440`
  `[92 RN-09] (d)` roda a separação A **dentro do gancho** (`RE_UPDATE_ITEM`) da separação B da mesma requisição,
  aguardando a resposta — com a trava é *deadlock*, reproduzido pelo revisor ("prazo de 10000ms estourado"). A T0
  reescreve esse teste, declarado (ver T0 e a Fase 2, B1).
- `test:almoxarifado` (44) e o cliente inteiro (93/1446) — medir; o cliente não muda (B449/C161).

### O que a Fase 0 achou que contradiz o plano da 92 (ver também a seção própria no fim)

1. **"*compare-and-set* com o status lido" não fecha três das corridas medidas.** (a) **4e** é perda de atualização no
   **item** (`quantidade_entregue`), não no status — nenhum `AND status=?` a toca; (b) **2b**: a guarda no `UPDATE` final
   da exclusão chega **depois** do estorno — a segunda exclusão já creditou o estoque quando perde; (c) **3c**: a rodada
   2 mantém o status `EM_SEPARACAO` (a reivindicação da 92 regrava o mesmo status), então o `AND status='EM_SEPARACAO'`
   da liberação **passa** e libera o crítico não conferido. Daí a trava por requisição (B443).
2. **"Exclusão: perdeu → reler e tentar uma vez (molde B435/B437)" está errado** para a exclusão: tentar de novo
   **estorna de novo**. Sem nova tentativa (B447).
3. **"Entrega: avaliar reivindicar como a T0 da 92"** — reivindicar pelo status não exclui uma segunda entrega: as duas
   partem do mesmo status e `EM_SEPARACAO`, `PRONTA_PARA_RETIRADA` e `PARCIALMENTE_ATENDIDA` estão todos em
   `PODE_ENTREGAR`. Não há status de "entregando" para reivindicar.
4. **"Recomendação: 409" para a separação** — mantida, e decidida (B444), mas com a **assimetria**: a entrega que perde
   o `UPDATE` final responde **200** (B446) — repetir a entrega baixa de novo, repetir a separação dá 400.
5. **"A regra de quais status se excluem não muda"** — não há regra: a exclusão aceita qualquer requisição ativa.
6. **"O que fica de fora" da 92 dizia "não medido" e "não envolve o cancelamento"** sobre liberar/entregar × separação —
   medido agora 5/5, e duas delas **prendem** a requisição (1c, 3c) e uma prende **reserva** (3c).
7. Linhas: o *compare-and-clear* começa em `:938` (o laço) e os dois `UPDATE` são `:955-962`/`:966-972` (o brief dizia
   `~947-972`); a liberação grava em `:3805-3807` (o plano dizia `:3806`); entrega `:1362-1370`; exclusão `:1498-1502`.

---

## Decisões reversíveis (letra B do documento de novidades; última usada: B442)

- **B443 — uma trava por requisição para as cinco portas do almoxarife.** Escolhido: módulo novo
  `server/services/almoxarifado/travaPorRequisicao.js` (sem `require` do app, como `travaPorMaterial`), um `Map` FIFO por
  `Number(requisicaoId)`, **não reentrante**, solto no `finally`. Seguram a trava: `requisitionService.separarRequisicao`,
  `entregarRequisicao`, `excluirRequisicao` (o corpo inteiro, das leituras à última gravação — as duas rotas de exclusão
  passam pelo serviço), a rota `PUT …/liberar-retirada` e a rota `PUT …/encerrar` (o corpo do `try`, da leitura à
  liberação das reservas e à trilha). O segundo gesto **espera** o primeiro e então lê o estado novo: as corridas
  medidas viram sequências (a segunda exclusão vê `ativo=0` → 404; a entrega depois da liberação vê `PRONTA`; a rodada
  2 depois da liberação vê `PRONTA` → 400 S1). **Não é a trava por material** (CLAUDE.md: aquela é de quem distribui ou
  lê o disponível para reservar; nenhuma destas cinco distribui) e **nunca é pega de dentro** de uma seção da trava por
  material (nenhuma das seis portas da 91 chama estas cinco) — a ordem é sempre requisição → material. Pela leitura, nenhuma
  das cinco pega a de material hoje (a liberação de reservas da exclusão e do encerramento não chama o recálculo sob
  trava); **medido na Fase 2 por sonda** (espião na suíte inteira: 1574 aquisições da trava por material, **0** de dentro de
  separar/entregar/excluir/liberação de reservas; **0** dos 532 `UPDATE` das portas dentro de uma seção da trava por
  material; o espião acusa os dois casos forçados) — e nenhum gesto dos cinco chama outro. Se um dia alguma pegar, a
  ordem requisição → material continua válida porque nenhum caminho sob a trava por material chega às cinco.
  **(Fase 2, M5) Nome:** `requisitionService.comTravaDaRequisicao` **já existe e é a trava por material** dos itens da
  requisição (Etapa 91, citada no CLAUDE.md); a nova é o módulo `travaPorRequisicao.js` com `serializarNaRequisicao` —
  nome distinto, e a T0 (cabeçalho do módulo) e a T7 (CLAUDE.md) põem as duas lado a lado. Premissa **C132** (um processo — **medido na Fase 2**: `server/ecosystem.config.js` `instances: 1`, `Dockerfile`
  `CMD ["node", "index.js"]`, `deploy.sh` com pm2 de um processo); com mais de um processo vira `SELECT … FOR UPDATE` na
  linha da requisição. **Descartados:** (1) só *compare-and-set* por porta — não fecha 4e, 2b nem 3c (Fase 0, "contradiz
  o plano da 92" item 1); (2) coluna "operação em curso" no banco — migração, mais a limpeza de marca órfã quando o
  processo cai no meio, para um ganho (multi-processo) que hoje não existe; (3) pegar a trava por material dos itens —
  CLAUDE.md, e duas entregas de requisições diferentes do mesmo material passariam a esperar uma pela outra sem razão.
- **B444 — o *compare-and-clear* da separação confere o status, e a separação que perde depois da rodada responde 409.**
  Os dois `UPDATE` (`:955-962`, `:966-972`) ganham `AND status='EM_SEPARACAO'` **depois** do `conferido_por_id IS ?`
  (regex da 92). `changes` 0 → relê `status` e conferência: se o status saiu de `EM_SEPARACAO`, **para o laço**, limpa a
  conferência mesmo assim (`UPDATE … SET conferido_por_id=NULL, conferido_por_nome=NULL, conferido_em=NULL WHERE id=?` —
  a D3 da 28: rodada nova sem conferência; o crítico não pode passar pela barreira com a conferência da rodada velha),
  **não toca o status**, grava a trilha `SEPARACAO` de sempre (a rodada existe), `console.warn` W3 e lança **409** X1.
  Se o status é `EM_SEPARACAO` e mudou só a conferência → o laço de hoje. **Por que 409 e não 200:** (1) o 200 devolve
  `status: 'EM_SEPARACAO'` (contrato) — mentiria, ou mudaria a forma da resposta para quem integra; (2) quem separou
  precisa saber que a caixa ficou numa requisição que outra pessoa mexeu — a tela mostra o `error` do 409 em toast
  (`RequisicoesList.js` `toast.error(err.response?.data?.error)`); o 200 vira "Separação registrada!" e ninguém olha; (3)
  precedente no módulo: a conferência responde 409 *"…outra pessoa (ou outra aba sua) agiu…"*; (4) repetir é seguro: fora
  de `PODE_SEPARAR` a repetição dá 400 S1; em `PARCIALMENTE_ATENDIDA` (que está em `PODE_SEPARAR`) a literal manda
  conferir a caixa antes. **Descartado:** 200 com `status` real e aviso — silencioso na tela; desfazer a rodada — é
  *append-only* (RN-02 da 28). **Alcance:** com a B443, nenhum gesto alcança este caminho (as portas que tiram a
  requisição de `EM_SEPARACAO` estão todas na trava); vale para um escritor fora dela (outro processo, escrita direta,
  porta futura) — e é testado assim (RN-08). **Residual declarado:** se o status virou `PRONTA_PARA_RETIRADA`, a
  conferência limpa deixa a requisição como a 3c (presa) — só alcançável sem a trava. **(Fase 2, M2) Residual
  declarado:** depois do 409 X1 o modal de separação fica aberto e a tela não recarrega (`RequisicoesList.js:724-735`: o
  `catch` só mostra o toast); em `PARCIALMENTE_ATENDIDA` (que está em `PODE_SEPARAR`) um novo "Separar" no mesmo modal
  grava a mesma caixa de novo — só fora da trava; a literal X1 manda conferir a caixa antes.
- **B445 — a liberação confere o status lido e a marca de rodada, e reavalia tudo uma vez.** `UPDATE … SET
  status='PRONTA_PARA_RETIRADA', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=? AND NOT EXISTS (SELECT 1 FROM
  separacoes_requisicao_almoxarifado WHERE requisicao_id=? AND id > ?)` com o status lido e a marca `COALESCE(MAX(id),0)`
  lida **antes** do `reqRow` (molde da Fase 5 da 92). Laço de **2**: cada volta relê tudo e refaz as recusas de hoje
  (`validarTransicao` → 400 com o `erro`; "Nenhum item separado" → 400; a barreira → 400 com a literal dela); perdeu as
  duas → **409** L1. A marca é o que fecha a 3c sem a trava (o status não muda na rodada 2). **Descartado:**
  `AND conferido_por_id IS ?` no lugar da marca — não pega a primeira rodada de um crítico numa requisição cuja rodada 1
  só tinha material comum (conferência `NULL → NULL`).
- **B446 — a entrega que perde o `UPDATE` final responde 200 com o status real.** `UPDATE … SET status=? … WHERE id=?
  AND status=?` com o lido. `changes` 0 → relê: se `COALESCE(ativo,1)=1` e `validarTransicao(relido, novoStatus).ok` →
  **uma** nova tentativa com o relido (ex.: liberada no meio — `PRONTA_PARA_RETIRADA → ENTREGUE` vale); senão (cancelada,
  encerrada, excluída, ou perdeu de novo) **não grava status**, `console.warn` W4, e responde **200** `{ success: true,
  status: <relido>, parcial: !completo, entregas }`. **Por que 200 e não 409 (a assimetria com a B444):** as baixas já
  saíram do estoque e estão no item; um 409 faz a tela dizer "erro" e o almoxarife **entregar de novo** — e a entrega
  repetida **baixa de novo** (é exatamente o dano da 4e). O 200 diz a verdade: entregue. **Alcance:** como a B444, só
  fora da trava. **(Fase 2, M1) Residual declarado:** a tela lê só `parcial` (`RequisicoesList.js:793`) — com `status:
  'CANCELADO'` e `parcial: false` mostra *"Requisição entregue por completo!"* e oferece a assinatura de entrega, que
  recusa `CANCELADO` com 409 (`deliverySignatureService.js:18,35`, `STATUS_ASSINAVEIS`); só fora da trava, e o cliente
  não muda (B449). **(Fase 2, M4) O item também:** o `UPDATE` do item (`:1318-1320`) grava o acumulado **absoluto**
  lido no começo — fora da trava a 4e volta. **Escolhido** (defesa em profundidade, reversível): gravar **relativo** —
  `SET quantidade_entregue = COALESCE(quantidade_entregue,0) + ?, quantidade_atendida = COALESCE(quantidade_entregue,0)
  + ?, quantidade_separada = MAX(COALESCE(quantidade_separada,0), COALESCE(quantidade_entregue,0) + ?)` (no SQLite o
  lado direito do `SET` lê os valores **antigos** da linha) — entra na T4 com teste (RN-08 (c'')) e controle.
  **Descartado:** só declarar em "fica de fora" — é a corrida que mexe em estoque (C156, 10/10 sem gancho) e o conserto
  é uma linha. **Descartado:** 409 (acima); estornar as baixas (desfazer movimento do motor no meio de uma corrida, sem
  transação — pior que o estado que corrige).
- **B447 — a exclusão confere `ativo` e o status lido no `UPDATE` final, e não tenta de novo.** `… WHERE id=? AND
  COALESCE(ativo,1)=1 AND status=?` com o lido. ~~`changes` 0 → `console.error` E1 e **409** E409, sem nova
  tentativa~~ **(corrigido na Fase 2, I1)** `changes` 0 → **se houve estorno** (`partes.length > 0`): `console.error` E1
  e **409** E409, sem nova tentativa — o estorno **já foi feito**, e refazer a exclusão estornaria de novo (contradiz o
  "uma nova tentativa (molde B435/B437)" do plano da 92); o E1 aponta a A44 (c). **Se não houve estorno:** relê
  (`ativo=0` → 404 N0) e tenta de novo **uma vez** com o relido (molde da T1 da 92); perdeu de novo, ainda sem estorno →
  **409** E409N. ~~**Alcance:** só fora da trava~~ — **errado (Fase 2, I1, reproduzido 5/5, controle 0/5):** num
  processo só, `/aprovar` (`PENDENTE → TOTALMENTE_RESERVADA`), o cancelamento pelos outros módulos e o `/cancelar` do
  almoxarifado mudam o status **fora** da trava nova, na janela entre a leitura e o `UPDATE` final (recálculo da 76,
  distribuição da 74, expiração por leitura) — um 409 sem nova tentativa recusaria uma exclusão legítima que não estornou
  nada. A B443 continua serializando as duas exclusões (a segunda vê `ativo=0` e toma o **404** *"Requisição não
  encontrada"* de hoje). **(Fase 2, I2) A trilha:** a rota `DELETE /api/almoxarifado/requisicoes/:id` lê `antes`
  (status/numero) **fora** da trava (`routes/almoxarifado.js:4088-4091`) — com a fila, o `dados_anteriores.status` pode
  ser o de antes do gesto que estava na frente. Corrigido na **T0**: `excluirRequisicao` devolve o `{ id, numero, status }`
  lido **dentro** da trava numa propriedade **não enumerável** `anterior` do resultado (o JSON das duas rotas não muda de
  forma) e a rota audita com ela; **proibido embrulhar a rota na trava** (não reentrante: a rota esperaria a si mesma). **Descartado nesta etapa:** reivindicar antes do
  estorno (`UPDATE … SET ativo=0, status='CANCELADO' WHERE id=? AND COALESCE(ativo,1)=1 AND status=?` **antes** do
  estorno, devolvendo `ativo=1` e o status se o estorno falhar) — é o conserto multi-processo (com ele a 2b não acontece
  nem sem trava), mas é mais uma devolução sem transação (o padrão da RN-09 da 92, com os residuais dela) para um ganho
  que só existe com dois processos. Candidata da migração para Postgres.
- **B448 — o encerramento confere o status lido, uma nova tentativa (molde B437).** `UPDATE … SET status='ENCERRADA',
  … WHERE id=? AND status=?`; perdeu → relê, `validarTransicao(relido,'ENCERRADA')` falha → 400 com o `erro` de hoje;
  vale → nova tentativa; ~~perdeu de novo → o mesmo 400 sobre o relido~~ **(corrigido na Fase 2, I3)** perdeu de novo → **409** C1 (literal nova,
  molde da L1): com a transição relida válida, `validarTransicao` devolve `{ ok: true }` sem `erro`, e "o mesmo 400"
  sairia `{ error: undefined }`. Liberação das reservas e trilha **só** se o
  `UPDATE` venceu. Respostas e literais inalterados.
- **B449 — a liberação e o encerramento continuam na rota; o cliente não muda.** A trava e o *compare-and-set* entram
  no corpo das rotas (`routes/almoxarifado.js`), sem extrair para o serviço — extração mudaria o ponto de *stub* da
  auditoria (`audit.registrarAuditoria`, namespace) por nada. A prova "pelo serviço" da integração usa as três portas
  que já são serviço (separar, entregar, excluir). O cliente já mostra o `error` dos 409 em toast; nenhuma tela muda.
  **Descartado:** extrair `liberarParaRetirada` para o serviço (mais superfície, mesma regra).
- **B450 — a conferência e os dois cancelamentos ficam fora da trava por requisição.** A conferência já reivindica com
  `status='EM_SEPARACAO' AND conferido_por_id IS NULL AND NOT EXISTS(rodada do usuário)` no `WHERE`
  (`claimConferencia`), e a corrida dela com a rodada é o *compare-and-clear* (B444); os cancelamentos têm o
  *compare-and-set* da 92 e não competem depois da reivindicação (a máquina não tem `EM_SEPARACAO`, `PRONTA`,
  `PARCIALMENTE_ATENDIDA` → `CANCELADO`). Pôr os três na trava não fecha corrida medida. **Descartado:** "tudo que grava
  status na trava" — inclui `/aprovar` (que está na trava por material: ordem de aquisição nova), o recálculo da 76 e a
  distribuição da 74 (idem).
- **B451 — a A44 lista; ninguém corrige por script.** Cinco consultas para quem opera conferir à mão (como a A43), com o
  que fazer por linha. **Descartado:** *script* de correção — cada linha pede decisão física (o material está na caixa?
  saiu de fato?), e um estorno automático de estoque fantasma pode estar errado se alguém já ajustou por inventário.

## Regras de negócio

Os testes levam o prefixo `[93 RN-xx]`; o manual cita pelo conteúdo (divergência declarada na 92: o manual não tem IDs).
"Serializado" = o gesto disparado no gancho **entra na fila da trava** (afirmado: `esperandoNaRequisicao(R) === 1` antes
de soltar o comando retido) e roda **depois** do primeiro terminar.

- **RN-01 (exclusão × separação — o achado 7)** — (a) gancho no CAC dispara a exclusão (ADMIN) → separação **200**
  `EM_SEPARACAO`, 1 rodada; depois exclusão **200**; final **`CANCELADO`, `ativo=0`**, reserva `LIBERADA`, r=0, trilha
  `SEPARACAO` **antes** de `EXCLUSAO`. (b) gancho no `UPDATE ativo=0` dispara a separação (1) → exclusão 200; separação
  **400 S1** (lê `CANCELADO`); 0 rodadas, separado 0; `CANCELADO`, `ativo=0`. (Hoje: (a) 5/5 `EM_SEPARACAO`/`ativo=0`; (b) é a 2c
  da Fase 0 — separação **200** com a rodada gravada numa requisição que termina excluída, 5/5: o status final já era
  `CANCELADO`, mas com a trava o desfecho vira "nada gravado" e o teste afirma o novo.)
  (c) **(Fase 2, I2)** de `TOTALMENTE_RESERVADA`, gancho na **reivindicação** da separação (o `UPDATE … SET
  status='EM_SEPARACAO'` da 92, antes da rodada) dispara a exclusão (ADMIN) pela rota do almoxarifado → a trilha
  `EXCLUSAO` grava `dados_anteriores.status = 'EM_SEPARACAO'` (o lido **dentro** da trava, depois da separação), não
  `TOTALMENTE_RESERVADA` (o lido pela rota antes de entrar na fila).
- **RN-02 (liberar × separação, entrega, exclusão)** — gancho no `UPDATE` da liberação (ou no CAC):
  (a) **1b** gancho no CAC (rodada 2) dispara liberar → separação 200; liberar 200 **depois**; final
  `PRONTA_PARA_RETIRADA`, trilha `SEPARACAO,SEPARACAO,LIBERACAO_RETIRADA`.
  (b) **3a** pede 1, separado 1; gancho na liberação dispara entregar 1 → liberar 200; entrega 200 `ENTREGUE` depois;
  final **`ENTREGUE`**, reserva `CONSUMIDA`.
  (c) **3b** gancho na liberação dispara a exclusão → final **`CANCELADO`, `ativo=0`**.
  (d) **3c** crítico, rodada 1 por ALMOX conferida por ALMOX2; gancho na liberação dispara a rodada 2 (ALMOX) → liberar
  200 (com a conferência da rodada 1); separação **400 S1** (lê `PRONTA_PARA_RETIRADA`); final `PRONTA_PARA_RETIRADA`,
  `conferido_por_id` = ALMOX2, separado 1, 1 rodada. (Hoje: 5/5 cada, com os estados da Fase 0.)
- **RN-03 (entrega × entrega — C156)** — separados 4, estoque 8; gancho no `UPDATE … SET quantidade_entregue` da
  primeira entrega (2, ALMOX) dispara a segunda (2, ALMOX2) → final **`ENTREGUE`**, `quantidade_entregue` 4 = soma das
  `SAIDA` 4, reserva `CONSUMIDA` u=4, `data_entrega` gravada; uma terceira entrega (1) → **400** *"Requisição deve estar
  em separação, pronta para retirada ou parcialmente atendida"*; q=4. (b) gancho no `UPDATE` **final** da primeira → o
  mesmo (o 4b: nada de `PARCIALMENTE_ATENDIDA` com tudo entregue). (c) **sem gancho**, `Promise.all` d=0, N=10 → 0/10
  com entregue ≠ saídas. (Hoje: 5/5 e 10/10.)
- **RN-04 (exclusão × exclusão — C157)** — `ENTREGUE` com 4; gancho no `UPDATE ativo=0` da primeira dispara a segunda →
  primeira **200** `estornos` com 1 linha; segunda **404** *"Requisição não encontrada"*; **uma** `ENTRADA` de estorno
  (4), q=4 (não 8); **uma** trilha `EXCLUSAO`. (b) a segunda pela **outra rota** (`DELETE /api/requisicoes-material/:id`)
  → o mesmo. (c) sem gancho, d=0, N=10 → 0/10 com estorno > saída. (Hoje: 5/5 e 10/10.)
- **RN-05 (exclusão × entrega)** — (a) **2a** gancho no `UPDATE ativo=0` dispara entregar 4 → exclusão 200; entrega
  **400** *"Requisição deve estar em separação, pronta para retirada ou parcialmente atendida"* (lê `CANCELADO`);
  nenhuma `SAIDA`; q=4; reserva `LIBERADA`. (b) **4a** gancho no `UPDATE` final da entrega dispara a exclusão → entrega
  200 `ENTREGUE`; exclusão 200 com estorno de 4; final **`CANCELADO`, `ativo=0`**, `SAIDA:4,ENTRADA:4`, q=4.
- **RN-06 (separação × entrega — 1c)** — gancho no CAC (rodada de 4) dispara entregar 4 → separação 200; entrega 200
  `ENTREGUE` **depois**; final **`ENTREGUE`**.
- **RN-07 (entrega × separação crítica, entrega × encerrar)** — (a) **4c** crítico, separado 2 conferido; gancho no
  `UPDATE` final da entrega (1) dispara a rodada 2 (1) → entrega 200 `PARCIALMENTE_ATENDIDA`; separação 200 **depois**;
  final `EM_SEPARACAO`, conferência `NULL`, separado 3; conferir (ALMOX2) → 200. (b) **7a** de `PARCIALMENTE_ATENDIDA`,
  gancho no `UPDATE` final da entrega dispara encerrar (ADMIN) → entrega 200; encerrar 200 **depois**; final
  **`ENCERRADA`**, reservas `LIBERADA`.
- **RN-08 (cada porta confere o status lido — escritor fora da trava, simulado por `UPDATE` direto no gancho, molde
  RN-02 da 92)** —
  (a) **separação (B444):** gancho no CAC põe `status='PRONTA_PARA_RETIRADA'` → separação **409** X1 com
  `PRONTA_PARA_RETIRADA` no texto; 1 rodada gravada; `quantidade_separada` gravada; status **`PRONTA_PARA_RETIRADA`**
  (não regravado); `conferido_por_id` NULL; trilha `SEPARACAO` 1; W3 1 vez; o CAC emitido **1** vez com `AND status`.
  (a') o gancho só troca a conferência (status continua `EM_SEPARACAO`) → o laço de hoje: 200, conferência anterior em
  `dados_anteriores` (o `[RN-07] compare-and-clear` de `separacaoComDono` continua verde).
  (b) **liberação (B445):** gancho põe `ENTREGUE` → 400 *"Transição inválida: ENTREGUE → PRONTA_PARA_RETIRADA"*,
  status `ENTREGUE`, sem trilha `LIBERACAO_RETIRADA`, `UPDATE` emitido 1 vez. (b') crítico conferido; o gancho insere uma
  rodada nova (`INSERT` direto em `separacoes_requisicao_almoxarifado`) e limpa a conferência → a 1ª tentativa perde
  (marca), a 2ª recusa pela barreira: **400** com a literal da barreira; `EM_SEPARACAO`. (b'') o gancho insere uma rodada
  nova (material comum) nas **duas** emissões → **409** L1; `EM_SEPARACAO`; emitido 2 vezes.
  (c) **entrega (B446):** gancho no `UPDATE` final põe `PRONTA_PARA_RETIRADA` → nova tentativa vence: 200
  `ENTREGUE`, emitido 2 vezes. (c') gancho põe `ativo=0, status='CANCELADO'` → **200** `{ status: 'CANCELADO' }`,
  status `CANCELADO` (não regravado), `SAIDA` gravada, W4 1 vez, emitido 1 vez. (c'') **(Fase 2, M4)** gancho no
  `UPDATE` do **item** de uma entrega de 2 soma 2 a `quantidade_entregue` por `UPDATE` direto → o item termina com **4**
  (o relativo soma em cima), não 2.
  (d) **exclusão (B447):** requisição `ENTREGUE` (há estorno — Fase 2); gancho no `UPDATE ativo=0` põe `ativo=0` direto →
  **409** E409; E1 1 vez; o `UPDATE` emitido 1 vez (sem nova tentativa); o estorno da primeira passada está no livro
  (declarado). **(Fase 2, I1)** (d') `TOTALMENTE_RESERVADA` sem entrega (nada a estornar); o gancho troca o status
  (`ativo` continua 1) → nova tentativa vence: 200, `CANCELADO`/`ativo=0`, emitido 2 vezes, nenhum E1. (d'') o gancho
  troca o status nas **duas** emissões → **409** E409N; `ativo=1`; nenhuma `ENTRADA`; emitido 2 vezes. (d''') o gancho
  põe `ativo=0` sem estorno → a releitura vê `ativo=0` → **404** N0; emitido 1 vez.
  (e) **encerramento (B448):** de `PARCIALMENTE_ATENDIDA`, gancho põe `ENTREGUE` → nova tentativa vence (`ENTREGUE →
  ENCERRADA`): 200; põe `EM_SEPARACAO` → **400** *"Transição inválida: EM_SEPARACAO → ENCERRADA"*, nenhuma reserva
  liberada, nenhuma trilha `ENCERRAMENTO`. (e') **(Fase 2, I3)** o gancho troca o status para outro de onde
  `ENCERRADA` vale (ex. `ENTREGUE`) nas **duas** emissões → **409** C1 (não `{ error: undefined }`), nenhuma reserva
  liberada, nenhuma trilha.
- **RN-09 (a trava não prende quem não disputa, e solta)** — (a) requisições **diferentes**: gancho no CAC de R1 roda a
  entrega de R2 **até a resposta** (o molde da 92, aguardando) → R2 200 sem esperar R1 (sem *deadlock*, `comPrazo`
  5000). (b) a separação que lança (400 por quantidade acima do máximo) solta a trava: a seguinte da mesma requisição
  roda (200). (c) o cancelamento da 92 (fora da trava) no gancho da reivindicação, **aguardando** a resposta, continua
  sem *deadlock* e com o desfecho da RN-03 da 92 (`separacaoNaoRessuscita` inteiro verde). (d) unidade do módulo: FIFO
  (três gestos na mesma chave terminam na ordem de chegada), `esperandoNaRequisicao` volta a 0 e a chave sai do `Map`
  depois de soltar.

## Contrato (congelado)

### Literais

| id | onde | texto (exato) | código |
|---|---|---|---|
| S1 | separação — fora de `PODE_SEPARAR` (inalterado) | `Requisição deve estar aprovada, aguardando estoque/compra, em separação ou parcialmente atendida para separar` | 400 |
| X1 | separação — o status saiu de `EM_SEPARACAO` depois da rodada gravada (**novo**, B444) | `` `A requisição mudou de status durante a separação (agora ${status}); a rodada ficou registrada — confira a caixa antes de separar de novo.` `` | **409** |
| W3 | separação — idem, log (**novo**) | `` console.warn(`[almoxarifado-separacao] Requisicao ${requisicaoId}: saiu de EM_SEPARACAO (agora ${status}) depois da rodada ${rodadaId}; conferencia limpa, status nao regravado`) `` | — |
| E0 | entrega — fora de `PODE_ENTREGAR` (inalterado) | `Requisição deve estar em separação, pronta para retirada ou parcialmente atendida` | 400 |
| W4 | entrega — perdeu o `UPDATE` final e não regravou (**novo**, B446) | `` console.warn(`[almoxarifado-entrega] Requisicao ${requisicaoId}: status mudou para ${relido} durante a entrega; baixas feitas, status nao regravado (seria ${novoStatus})`) `` | — |
| N0 | exclusão — inexistente ou já excluída (inalterado) | `Requisição não encontrada` | 404 |
| E409 | exclusão — perdeu o `UPDATE` final **depois de estornar** (**novo**, B447; corrigido na Fase 2) | `A requisição mudou enquanto era excluída; o estorno pode já ter sido feito — confira o estoque e o histórico antes de excluir de novo.` | **409** |
| E1 | exclusão — idem, log (**novo**) | `` console.error(`[almoxarifado-exclusao] Requisicao ${requisicaoId}: UPDATE final perdeu (ativo/status mudou) depois do estorno de ${partes.length} parte(s) — conferir a consulta A44 (c)`) `` | — |
| E409N | exclusão — perdeu o `UPDATE` final duas vezes **sem** estorno feito (**novo**, Fase 2 I1) | `A requisição mudou enquanto era excluída e nada foi estornado; recarregue e tente de novo.` | **409** |
| L0 | liberação — inexistente / transição / nada separado / barreira (inalterados) | `Requisição não encontrada` (404) · `Transição inválida: ⟨de⟩ → PRONTA_PARA_RETIRADA` (400) · `Nenhum item separado` (400) · a literal da barreira de `assertConferidaSeObrigatorio` (400) | — |
| L1 | liberação — perdeu as duas tentativas (**novo**, B445) | `A requisição mudou enquanto era liberada para retirada; recarregue e confira antes de liberar.` | **409** |
| C0 | encerramento — sem permissão / inexistente / transição (inalterados) | `Sem permissão para encerrar requisições` (403) · `Requisição não encontrada` (404) · `Transição inválida: ⟨de⟩ → ENCERRADA` (400) | — |
| C1 | encerramento — perdeu as duas tentativas (**novo**, Fase 2 I3) | `A requisição mudou enquanto era encerrada; recarregue e confira antes de encerrar.` | **409** |

Respostas de sucesso **inalteradas** na forma: separação `{ success, status: 'EM_SEPARACAO', rodada_id, itens_tocados }`;
liberação `{ success: true, status: 'PRONTA_PARA_RETIRADA' }`; entrega `{ success, status, parcial, entregas }` — com
`status` = o relido no caminho da B446 (pode ser `CANCELADO`/`ENCERRADA`/`PRONTA_PARA_RETIRADA` só fora da trava);
exclusão `{ success, estornos, reservas_liberadas }` (mais `anterior` **não enumerável** para a rota auditar — Fase 2, I2); encerramento `{ success: true, status: 'ENCERRADA' }`. Os 409 levam
`{ error: <literal> }` (o `handleError`/`catch` de hoje: `res.status(e.status || 500).json({ error: e.message })`).

### Módulo — `server/services/almoxarifado/travaPorRequisicao.js` (T0)

```js
// Sem require do app (so o Node). Premissa C132: um processo.
const fila = new Map(); // Number(requisicaoId) -> cauda (Promise)
const esperando = new Map(); // Number(requisicaoId) -> quantos estao na fila atras do dono
async function serializarNaRequisicao(requisicaoId, fn) { /* FIFO como segurarTrava da travaPorMaterial; solta no finally */ }
function esperandoNaRequisicao(requisicaoId) { /* numero; 0 sem fila */ }
module.exports = { serializarNaRequisicao, esperandoNaRequisicao };
```
Comentário de cabeçalho: **não reentrante**; **não é** `requisitionService.comTravaDaRequisicao` (essa é a trava **por
material** dos itens da requisição, Etapa 91 — Fase 2, M5); **nunca** pegar de dentro de uma seção da `travaPorMaterial`; nenhuma
porta das cinco chama outra das cinco; com mais de um processo → `SELECT … FOR UPDATE` na linha da requisição.
`requisitionService` chama **pelo objeto do módulo** (`travaPorRequisicao.serializarNaRequisicao(...)`), para os testes
espiarem/sabotarem.

### As portas (T0 + T1)

- `separarRequisicao(db, id, itens, user)`: o corpo atual vira `separarSemTrava` (interno, não exportado);
  `separarRequisicao = (...a) => travaPorRequisicao.serializarNaRequisicao(id, () => separarSemTrava(...a))`. O
  `if (!user?.id)` (400) pode ficar fora. Idem `entregarRequisicao` e `excluirRequisicao`.
- Rotas `PUT …/liberar-retirada` e `PUT …/encerrar`: o corpo do `try` dentro de `serializarNaRequisicao(req.params.id,
  …)`; o 403 do encerrar (`can(...)`) fica **fora** (não espera a fila para recusar).

### As gravações (T2–T5)

- **CAC (T2):** `WHERE id=? AND conferido_por_id IS ? AND status='EM_SEPARACAO'` e `WHERE id=? AND status='EM_SEPARACAO'`
  (*fallback*). Perdeu → `SELECT status, conferido_por_id FROM requisicoes_almoxarifado WHERE id=?`; `status !==
  'EM_SEPARACAO'` → `UPDATE … SET conferido_por_id=NULL, conferido_por_nome=NULL, conferido_em=NULL WHERE id=?`, W3,
  marca `statusMudou = status`, sai do laço (e não entra no *fallback*). Depois do `try/catch` da RN-09 da 92 e **depois
  da trilha `SEPARACAO`**: `if (statusMudou) throw Object.assign(new Error(X1), { status: 409 })`. O `catch` da RN-09
  **não** devolve status nesse caso (`rodadaId != null`).
- **Liberação (T3):** contrato da B445 (laço de 2, marca lida antes do `reqRow`, recusas de hoje em cada volta, L1).
- **Entrega (T4):** contrato da B446.
- **Exclusão (T5):** contrato da B447. **Encerramento (T5):** contrato da B448.

### O que não muda

Quem pode cada gesto (`separar_emitir`, `conferir_separacao`, `canDeleteAlmoxRequisicao`, `aprovar_requisicao`); a
máquina de estados; as literais de recusa de hoje; a reivindicação da separação e a devolução da RN-09 da 92; os dois
cancelamentos (92); a trava por material e as seis portas dela (91); a regra de que a exclusão aceita qualquer
requisição ativa; o cliente.

## Técnica dos testes de corrida (o que muda em relação à 92)

1. **Gancho no SQL** como na 92 (`db.run` embrulhado, regex com `\s+`, contador de disparos, desarme por rodada,
   `finally` restaura) — regex da Fase 0 acima.
2. **Com a trava, o gesto no gancho NÃO pode ser aguardado até a resposta** — ele espera a trava que o gesto retido
   segura, e o gesto retido espera o gancho: *deadlock*. O gancho **dispara** o gesto, espera até
   `travaPorRequisicao.esperandoNaRequisicao(R) === 1` (laço de `setImmediate` com `comPrazo(…, 3000)`), e só então
   emite o comando retido; o teste aguarda as duas promessas depois. **Afirmar a espera** ("o segundo entrou na fila") é
   o que prova a serialização — sem ela, um gesto que falhasse antes de pegar a trava passaria por "serializado".
   **Controle de *deadlock*:** a técnica da 92 (aguardar no gancho) aplicada a um gesto travado da mesma requisição
   estoura o `comPrazo` — é o que a RN-09 (a) prova que **não** acontece entre requisições diferentes.
3. **RN-08** (escritor fora da trava) usa `UPDATE`/`INSERT` direto no gancho — aguardável, não pega trava.
4. Usuário por requisição (`x-teste-usuario`); **cada cenário afirma quem agiu** (rodada `usuario_id`, trilha
   `usuario_id`) — um 403 por usuário trocado não pode passar por "400 certo".
5. Sabotagem só na árvore principal, um controle de cada vez, `perl -0pi` com âncora contada = 1, backup
   `e93-<task>-*.bak` no scratchpad, restauro por cópia com md5 conferido, base **LF** (memórias "harness LF" e
   "sabotagem concorrente contamina a suíte"). Mensagens de commit `msg-e93-<task>.txt`.

## Tasks

**Ordem topológica: T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7.** T0 é **tronco** (módulo novo e a regra compartilhada:
quem segura a trava). T1 é **galho** de T0 (consome o módulo; rotas). T2–T5 são **galhos por regra** (cada um uma
gravação de uma porta; um erro de leitura num não exige retrabalho no outro) — mas **executados em sequência na árvore
principal**: T2, T4 e T5 editam `requisitionService.js`, T3 e T5 editam o mesmo bloco de rotas, e todos sabotam
produção nos controles com a suíte batendo no mesmo SQLite (G84). Nenhum galho em paralelo nesta etapa (não há task de
cliente). Executores **não** marcam este plano; o fio principal marca.

- [ ] **T0 (tronco) — a trava por requisição nas três portas do serviço.** Contrato "Módulo" e "As portas" (separar,
  entregar, excluir). Teste novo `server/tests/api/requisicaoGestosConcorrentes.api.test.js`: **RN-01**, **RN-03**,
  **RN-04**, **RN-05**, **RN-06**, **RN-07 (a)**, **RN-09** (a)–(d). **Vermelho antes:** RN-01 (a) (5/5 `ativo=0`
  `EM_SEPARACAO`), RN-01 (b), RN-03 (a)(b)(c), RN-04 (a)(b)(c), RN-05 (a)(b), RN-06, RN-07 (a) — e, antes do módulo existir, todas
  falham já na asserção "o segundo entrou na fila" (não há fila) — o vermelho **de regra** é o do controle s1. RN-01 (b)
  também é vermelho antes (separação 200 e 1 rodada — a 2c da Fase 0: no gancho a exclusão ainda não gravou, a separação
  lê o status velho e grava); RN-09 (a)(b)(c) passam antes (não há trava para prender) — guardas de regressão.
  **Medir antes e depois, sem edição:** os 30 de separação, os 32 de entrega, os 8 de exclusão, `test:almoxarifado`.
  **Controles (cada um diz qual asserção cai):** (s1) `serializarNaRequisicao` vira `(id, fn) => fn()` → caem "entrou
  na fila" em todos **e** os desfechos: RN-03 (entregue 2 ≠ saídas 4), RN-04 (q=8, duas trilhas), RN-01 (a)
  (`EM_SEPARACAO`), RN-05 (b) (`ENTREGUE`/`ativo=0`), RN-06 (`EM_SEPARACAO`). (s2) só a entrega sem a trava → caem
  RN-03 e RN-05 (a) (a entrega no gancho da exclusão roda e baixa); RN-04 continua. (s3) só a exclusão sem a trava → caem
  RN-04 e RN-01 (a)/RN-05 (b) (o lado da exclusão); RN-03 continua. (s4) ~~a trava **reentrante por engano**~~ **chave não normalizada** (corrigido na Fase 2, M6:
  o controle prova a normalização da chave, não reentrância) — chave por `String(id)` numa porta e `Number(id)` noutra → caem as RN cuja chamada vem com `id` string da rota (`req.params.id`)
  contra a do serviço com número: RN-05/RN-06 pela rota × serviço — **é o controle de que a chave é normalizada**. (s5)
  a trava não solta na exceção (sem `finally`) → cai RN-09 (b) (prazo estourado). (s6) a técnica da 92 (aguardar no
  gancho) num cenário RN-03 → estoura o `comPrazo` — controle do controle, rodado uma vez e descrito, não fica no
  arquivo.
  **(Fase 2, B1) Reescrita declarada de um teste da 92:** `separacaoNaoRessuscita.api.test.js` `[92 RN-09] (d)`
  (`:402-440`) roda a separação A **dentro do gancho** da B na mesma requisição, aguardando — com a trava é *deadlock*. A
  T0 troca a separação A no gancho por um **escritor fora da trava** (`INSERT` direto da rodada no gancho, aguardável);
  a asserção de que o desfazer de B **não devolve o status** sobre a rodada alheia (a marca `ultimaRodadaAntes`)
  continua provada; o que muda é "A separa inteira (200)" → "uma rodada alheia aparece". O s6 é o controle de que a
  técnica velha trava. **(Fase 2, I2)** A T0 também faz `excluirRequisicao` devolver o `anterior` lido dentro da trava e
  a rota do almoxarifado auditar com ele — **RN-01 (c)**; controle (s7) a rota volta a usar o `antes` lido fora → cai
  RN-01 (c) (`TOTALMENTE_RESERVADA`). **(Fase 2, M5)** o cabeçalho do módulo novo diz que
  `requisitionService.comTravaDaRequisicao` é a trava por material.
- [ ] **T1 (galho de T0) — a trava na liberação e no encerramento.** Contrato "As portas" (rotas). Acrescenta ao
  `requisicaoGestosConcorrentes`: **RN-02** (a)–(d) e **RN-07 (b)**. **Vermelho antes:** RN-02 (a)(b)(c)(d), RN-07 (b) —
  todos 5/5 na Fase 0. **Medir:** os 6 de liberar e os 8 de encerrar. **Controles:** (s1) liberar sem a trava → caem
  RN-02 (b)(c)(d) (gancho no `UPDATE` da liberação); RN-02 (a) **também cai** (a liberação disparada no CAC não espera a
  separação: lê `EM_SEPARACAO`, grava `PRONTA`, e o CAC regrava `EM_SEPARACAO` — o defeito 1b). (s2) encerrar sem a
  trava → cai RN-07 (b). (s3) o 403 do encerrar movido para dentro da trava → nenhum teste de regra cai; **declarado**
  (é desempenho, não regra) — não é controle que prove algo, fica de fora.
- [ ] **T2 (galho) — o *compare-and-clear* confere o status; 409 X1 (B444).** Acrescenta **RN-08 (a)(a')**. **Vermelho
  antes:** RN-08 (a) (200 e status regravado `EM_SEPARACAO` — o defeito). **Medir:** os 30 de separação — em especial
  `separacaoNaoRessuscita` RN-09 (c)/(d) (a regex `RE_COMPARE_AND_CLEAR` tem de continuar casando), `separacaoComDono`
  `[RN-07] compare-and-clear`, `segundaConferencia`. **Controles:** (s1) sem `AND status` nos dois `UPDATE` → cai RN-08
  (a) (status `EM_SEPARACAO`). (s2) perdeu por status e **não** limpa a conferência → cai RN-08 (a) na asserção
  `conferido_por_id` NULL (montar o caso com conferência prévia). (s3) o 409 lançado **antes** da trilha → cai a
  asserção "trilha `SEPARACAO` 1". (s4) a condição nova **antes** de `conferido_por_id IS ?` → cai o RN-09 (c) da 92
  ("gancho disparou") — controle de que a ordem da condição importa (dito no plano para ninguém "arrumar").
- [ ] **T3 (galho) — a liberação confere status e marca de rodada (B445).** Acrescenta **RN-08 (b)(b')(b'')**.
  **Vermelho antes:** (b) (200 sobre `ENTREGUE`), (b') (200 com crítico não conferido), (b'') (200). **Controles:** (s1)
  sem `AND status=?` → cai (b). (s2) sem o `NOT EXISTS` da marca → cai (b') (libera). (s3) laço de 1 → cai (b')
  (responde L1 em vez da literal da barreira). (s4) laço sem teto → cai (b'') (vence na 3ª).
- [ ] **T4 (galho) — a entrega confere o status no `UPDATE` final (B446).** Acrescenta **RN-08 (c)(c')**. **Vermelho
  antes:** (c') (status regravado `ENTREGUE` sobre `CANCELADO`). (c) passa antes (o `UPDATE` sem guarda grava `ENTREGUE`
  por cima de `PRONTA` — o desfecho certo por acaso); fica como guarda da nova tentativa — **o vermelho dela é o s2**.
  **Controles:** (s1) sem `AND status=?` → cai (c'). (s2) sem a nova tentativa → cai (c) (status `PRONTA`, W4). (s3) 409
  no lugar do 200 → cai (c') no código. (s4) a nova tentativa sem `validarTransicao` → cai (c') (regrava sobre
  `CANCELADO` — a releitura venceria). **(Fase 2, M4)** Acrescenta RN-08 (c''); vermelho antes: o item termina com 2.
  (s5) volta o `SET quantidade_entregue=?` absoluto → cai (c'').
- [ ] **T5 (galho) — a exclusão e o encerramento conferem o status (B447, B448).** Acrescenta **RN-08 (d)(e)**.
  **Vermelho antes:** (d) (200 e `UPDATE` regravado), (e) segunda metade (200 sobre `EM_SEPARACAO`). **Controles:** (s1)
  exclusão sem `AND COALESCE(ativo,1)=1` → cai (d). (s2) exclusão com nova tentativa → cai (d) (emitido 2 vezes). (s3)
  encerrar sem `AND status=?` → cai (e) (`ENCERRADA` sobre `EM_SEPARACAO`). (s4) liberar reservas **antes** de conferir
  que o `UPDATE` venceu → cai (e) ("nenhuma reserva liberada"). **(Fase 2, I1/I3)** Acrescenta também RN-08
  (d')(d'')(d''')(e'); vermelho antes: (d'') e (e') (200 regravando). (s5) exclusão sem nova tentativa quando não
  estornou → cai (d') (409 em vez de 200). (s6) encerramento com "o mesmo 400" no teto → cai (e') (`error` undefined).
- [ ] **T6 — integração cruzando as portas, pela rota e pelo serviço.** Arquivo novo
  `server/tests/api/requisicaoGestosConcorrentesIntegracao.api.test.js`, usuários reais por header (S, ALMOX, ALMOX2,
  ADMIN):
  **Jornada A (dois almoxarifes, material comum, pela rota):** S cria R1 (4) → ADMIN aprova pela rota → `TOTALMENTE_RESERVADA`;
  ALMOX separa 4 e, no CAC, ALMOX2 dispara liberar (serializado) → separação 200, liberação 200 depois, `PRONTA`; ALMOX2
  entrega 2 e, no `UPDATE` do item, ALMOX dispara entregar 2 (serializado) → a primeira 200 `PARCIALMENTE_ATENDIDA`, a
  segunda 200 depois → **`ENTREGUE`**, entregue 4 = saídas
  4, reserva `CONSUMIDA`; **as cinco consultas da A44 vazias para R1**.
  **Jornada B (crítico, conferência e liberação):** R2 crítico pedindo 2 (aprovada pela rota); ALMOX separa 1;
  ALMOX2 confere; no gancho da liberação de ALMOX2, ALMOX dispara a rodada 2 (1) → liberar 200, rodada 2 **400 S1**, nada
  gravado; ALMOX2 entrega 1 → `PARCIALMENTE_ATENDIDA`; ALMOX separa 1 (de `PARCIALMENTE_ATENDIDA`) → `EM_SEPARACAO`,
  conferência limpa; ALMOX2 confere; ALMOX2 entrega 1 → **`ENTREGUE`**, reserva `CONSUMIDA`; A44 vazia para R2.
  **Jornada C (exclusão pelas duas rotas):** R3 `ENTREGUE` (4); `DELETE /api/almoxarifado/requisicoes/:id` e, no
  `UPDATE ativo=0`, `DELETE /api/requisicoes-material/:id` (serializado) → 200 + 404; q=4; A44 (a)(c) vazias. R4
  `EM_SEPARACAO` (4 separados): exclusão × entrega nos dois encaixes (RN-05) → A44 (c) vazia.
  **Jornada D (pelo serviço):** `requisitionService.entregarRequisicao` × `entregarRequisicao` e `excluirRequisicao` ×
  `excluirRequisicao` chamados **direto** (sem rota), `Promise.all`, d=0, N=10 → 0/10 divergências — prova que a trava
  mora no serviço e vale para qualquer chamador.
  **Jornada E (a 92 compõe):** S cancela pelos outros módulos no gancho da reivindicação de uma separação (a RN-03 da
  92) — sem *deadlock*, desfecho da 92; e uma `PARCIALMENTE_ATENDIDA` encerrada no meio da entrega (RN-07 (b)) não volta
  a aberta.
  **Controles:** (s1) da T0 → caem A (entregue ≠ saídas), C (q=8) e D; (s1) da T1 → cai B ~~(a rodada 2 passa e
  libera sem conferência — A44 (e) com R2)~~ **(corrigido na Fase 2, I4)**: com a T3 feita, a rodada 2 roda no gancho
  (200, não 400 S1) e limpa a conferência; a liberação perde pela marca da B445, relê e recusa pela barreira — **400** com
  a literal da barreira; cai "liberar 200" e "rodada 2 400 S1" (o crítico **não** sai liberado sem conferência — a
  defesa da T3 segura); (s1) da T2 **não** derruba jornada nenhuma (com a trava o caminho é
  inalcançável — dito, é a razão de a RN-08 existir); nenhuma jornada não prevista pode cair.
- [ ] **T7 — fechamento (skill `fechar-etapa`).** Novidades: seção da Etapa 93; **B443–B451**; **C156–C162** (abaixo);
  **A44**; D (93) e F (93); as duas linhas **(92)** de D (exclusão no instante da separação; liberar/entregar no mesmo
  instante) marcadas resolvidas; "Onde estamos"; cabeçalho. Specs `04` (a exclusão e a entrega serializadas; a exclusão
  sem regra de status, dito à vista), `05` (o *compare-and-clear* e a liberação conferem o status; o "Fica de fora (D
  (92))" corrigido à vista — "não medido" virou medido 5/5), `07` (a reserva presa da 3c; a entrega consome a reserva uma
  vez). Mapa. Guia do usuário (roteiro: duas abas na mesma requisição — **Entregar** nas duas → a segunda espera e
  responde com o estado novo; **Excluir** nas duas → a segunda diz "não encontrada" e **a lista não recarrega** — a linha excluída fica até
  recarregar a tela (`RequisicoesList.js:1019-1033`: o `catch` só mostra o toast; Fase 2, M3)). Manual (7.x exclusão, 10.x
  separação/liberação/entrega: "dois gestos na mesma requisição acontecem um depois do outro"). `CLAUDE.md`: um
  parágrafo na seção da trava dizendo que existe **outra** trava, por requisição, para as cinco portas do almoxarife, com
  a ordem requisição → material e a proibição de pegá-la de dentro da de material (commit próprio) — **(Fase 2, M5)**
  dizendo à vista que `requisitionService.comTravaDaRequisicao` é a trava **por material** e
  `travaPorRequisicao.serializarNaRequisicao` é a nova. Retro; **Próxima
  tarefa detalhada — Etapa 94**.

## Teste de integração — por que a T6 é a única prova de três coisas

1. **A trava mora no serviço, não na rota.** As duas rotas de exclusão chamam o serviço; só a jornada C (uma por cada
   rota, na mesma requisição) e a D (serviço direto) provam que a fila é a mesma.
2. **A trava compõe com o *compare-and-set* da 92 e a reivindicação.** O cancelamento fica fora da trava (B450); só a
   jornada E prova que ele continua vencendo/perdendo como na 92, sem *deadlock*, com a separação travada.
3. **Seguir até o último gesto.** Cada RN de serialização afirma o desfecho do par; só as jornadas A e B levam a
   requisição até `ENTREGUE` pela rota, por dois usuários, e conferem a A44 vazia no fim — a prova de que nenhuma
   porta deixou estado que outra recuse depois (1c, 3a e 3c eram exatamente isso: cada gesto certo sozinho, a
   requisição presa no fim).

## Avisos (letra C) — a registrar no fechamento

- **C156 — duas entregas da mesma requisição ao mesmo tempo perdiam a entrega do item** (4e; **10/10 sem gancho**, d=0):
  o item ficava com entregue 2 para 4 saídas, e a tela deixava entregar "o que faltava" — **6 saídas para 4 pedidos**
  quando havia saldo livre. Resolvido pela B443. **O que fazer:** rodar a A44 (b).
- **C157 — duas exclusões da mesma requisição entregue estornavam duas vezes** (2b; **10/10 sem gancho**): estoque
  fantasma do tamanho da entrega. Resolvido pela B443. **O que fazer:** A44 (c).
- **C158 — liberar para retirada no instante de uma rodada nova de material crítico** liberava sem a segunda
  conferência e **prendia** a requisição em *Pronta para retirada* com a reserva (3c: nenhum gesto a tirava dali).
  Resolvido pela B443 (e, fora da trava, pela marca da B445). **O que fazer:** A44 (e).
- **C159 — requisição toda entregue parada fora de *Entregue*** (1c *Em Separação*, 3a *Pronta*, 4b *Parcialmente
  atendida*): as duas primeiras sem saída. Resolvido pela B443. **O que fazer:** A44 (d).
- **C160 — encerrar no instante de uma entrega devolvia a requisição a *Parcialmente atendida*** (7a). Resolvido pela
  B443/B448.
- **C161 — o que muda para quem opera:** o segundo gesto na mesma requisição **espera** o primeiro (não há prazo — como a
  C150); a segunda exclusão diz *"Requisição não encontrada"*; a separação pode responder o 409 X1 e a liberação o L1
  (só com um escritor fora da trava). Nada muda na tela.
- **C162 — o que muda para quem integra:** os 409 novos (X1, L1, E409; e, da Fase 2, E409N e C1) e o `status` da resposta da entrega podendo ser o
  status real relido (B446) — todos só alcançáveis com escritor fora da trava (outro processo, escrita direta).

## O que fica de fora (declarado — e por quê)

- **Reivindicar a exclusão antes do estorno** (B447) — o conserto para mais de um processo; com a trava, sem ganho hoje.
  Candidata da migração para Postgres (memória "migração SQLite → Postgres").
- **`verificarBloqueioLiberacao` grava `AGUARDANDO_APROVACAO_VALOR` com `WHERE id=?`** (`requisitionValueApprovalService.js:142-147`),
  chamada pela separação e pela entrega **de qualquer status de `PODE_SEPARAR`/`PODE_ENTREGAR`** — inclusive
  `EM_SEPARACAO`/`PARCIALMENTE_ATENDIDA`, de onde a máquina não vai a `AGUARDANDO_APROVACAO_VALOR`. Com a B443 ela roda
  dentro da trava (sem corrida com as cinco); o desvio da máquina é anterior, não medido, exige o valor passar do limite
  depois de iniciada a separação. Candidata.
- **A conferência e os cancelamentos na trava** (B450) — sem corrida medida que feche.
- **Prazo para pegar a trava por requisição** — como a C150 (a trava por material também não tem); uma entrega com
  alerta de mínimo lento (SMTP fora de seção da trava por material roda na hora) segura a requisição, só ela.
- **C145, C147, C150, C139** — como na 92.
- **Os residuais da RN-09 da 92** (B436) — não mudam.

## Letra A — consulta para produção (a confirmar no fechamento como **A44**)

Conferida em memória contra o esquema real (`e93-sonda-8-a44.js`) — cada consulta acha o caso produzido pela corrida,
não acha o mesmo fluxo em sequência, e o banco recusa com uma coluna trocada (Fase 0).

```sql
-- (a) excluídas que voltaram a outro status (o achado 7: EM_SEPARACAO; também PRONTA_PARA_RETIRADA e ENTREGUE)
SELECT rq.id, rq.numero, rq.status FROM requisicoes_almoxarifado rq
 WHERE COALESCE(rq.ativo, 1) = 0 AND rq.status <> 'CANCELADO' ORDER BY rq.id;
-- (b) item cuja entrega não bate com as saídas do livro (perdeu entrega)
SELECT rq.id, rq.numero, i.material_id, SUM(COALESCE(i.quantidade_entregue,0)) AS entregue_itens,
       (SELECT COALESCE(SUM(m.quantidade),0) FROM movimentacoes_almoxarifado m
         WHERE m.requisicao_id = rq.id AND m.material_id = i.material_id AND m.tipo = 'SAIDA'
           AND COALESCE(m.cancelado,0) = 0) AS saidas_livro
  FROM requisicoes_almoxarifado rq JOIN itens_requisicao_almoxarifado i ON i.requisicao_id = rq.id
 WHERE COALESCE(rq.ativo, 1) = 1
 GROUP BY rq.id, rq.numero, i.material_id
HAVING ABS(entregue_itens - saidas_livro) > 1e-9 ORDER BY rq.id;
-- (c) excluídas cujo estorno não bate com o que saiu (estorno duplo — a mais; ou entrega no meio — a menos)
SELECT rq.id, rq.numero, m.material_id,
       SUM(CASE WHEN m.tipo = 'SAIDA' THEN m.quantidade ELSE 0 END) AS saiu,
       SUM(CASE WHEN m.tipo = 'ENTRADA' AND m.motivo LIKE 'Estorno exclus%' THEN m.quantidade ELSE 0 END) AS estornado
  FROM requisicoes_almoxarifado rq JOIN movimentacoes_almoxarifado m ON m.requisicao_id = rq.id AND COALESCE(m.cancelado,0) = 0
 WHERE COALESCE(rq.ativo, 1) = 0
 GROUP BY rq.id, rq.numero, m.material_id
HAVING ABS(estornado - saiu) > 1e-9 ORDER BY rq.id;
-- (d) tudo entregue e parada fora de ENTREGUE
SELECT rq.id, rq.numero, rq.status FROM requisicoes_almoxarifado rq
 WHERE COALESCE(rq.ativo, 1) = 1 AND rq.status IN ('EM_SEPARACAO','PRONTA_PARA_RETIRADA','PARCIALMENTE_ATENDIDA')
   AND EXISTS (SELECT 1 FROM itens_requisicao_almoxarifado i WHERE i.requisicao_id = rq.id)
   AND NOT EXISTS (SELECT 1 FROM itens_requisicao_almoxarifado i WHERE i.requisicao_id = rq.id
                    AND COALESCE(i.quantidade_entregue,0) < i.quantidade_solicitada - 1e-9) ORDER BY rq.id;
-- (e) Pronta para retirada com material crítico na caixa sem a segunda conferência
SELECT rq.id, rq.numero FROM requisicoes_almoxarifado rq
 WHERE COALESCE(rq.ativo, 1) = 1 AND rq.status = 'PRONTA_PARA_RETIRADA' AND rq.conferido_por_id IS NULL
   AND EXISTS (SELECT 1 FROM itens_requisicao_almoxarifado i JOIN materiais_almoxarifado mt ON mt.id = i.material_id
                WHERE i.requisicao_id = rq.id AND mt.material_critico = 1
                  AND COALESCE(i.quantidade_separada,0) - COALESCE(i.quantidade_entregue,0) > 1e-9) ORDER BY rq.id;
```
O que fazer com cada linha (texto da A44): (a) a requisição foi excluída e algo a moveu depois — conferir a caixa
(material separado volta à prateleira) e o histórico; não reativar. (b) **falso positivo possível** em dado antigo
(saída anterior ao livro por requisição — o mesmo caso "livro que não soma" da exclusão); senão, o item mostra menos do
que saiu: **não entregar o "que falta"** antes de conferir; acertar o item à mão. (c) estornado > saiu: estoque fantasma —
inventário do material antes de qualquer ajuste; estornado < saiu: a saída depois da exclusão não voltou — conferir se o
material saiu de fato. (d) a requisição entregou tudo: encerrar se `PARCIALMENTE_ATENDIDA`; nas outras duas não há gesto —
corrigir o status à mão para `ENTREGUE` (decisão de quem administra). (e) **não entregar** até alguém conferir a caixa;
não há gesto que a devolva a *Em Separação* — corrigir à mão (`EM_SEPARACAO`) e pedir a conferência.

## O que achei que contradiz o plano da 92

Reunido de "Fase 0 → O que a Fase 0 achou que contradiz o plano da 92" (itens 1–7). Em uma linha cada: o
*compare-and-set* de status não fecha 4e/2b/3c; a exclusão não pode tentar de novo; a entrega não tem status para
reivindicar; a 409 vale para a separação mas a entrega pede 200; a exclusão não tem regra de status; o "não medido" da
92 é 5/5 e prende requisição e reserva; linhas ajustadas.

## Fase 2 — revisão do plano (2026-10-09): 1 bloqueante, 4 importantes, 6 menores → plano revisto (vale sobre o texto acima)

Revisor fresco (plano + specs 04/05/07 + plano da 92, as quatro perguntas da skill), com sondas e protótipo da trava
(scratchpad `e93rv-*`). Cada achado foi conferido contra o código antes de entrar; os pontos afetados acima estão
marcados **"(corrigido na Fase 2)"** ou **"(Fase 2)"**.

**Medido (confirma o plano):** nenhuma das cinco portas pega a trava por material nem roda sob ela — a suíte inteira
com espião: **1574** aquisições da trava por material, **0** de dentro de separar/entregar/excluir/liberação de
reservas; **0** dos **532** `UPDATE` das portas dentro de uma seção da trava por material; o espião acusa os dois casos
forçados (controle). Nenhum gesto dos cinco chama outro. O deploy é **um processo** (`server/ecosystem.config.js`
`instances: 1`, `Dockerfile` `CMD ["node", "index.js"]`, `deploy.sh` com pm2) — a premissa C132 vale.

**Bloqueante**

1. **B1 — um teste da 92 trava com a T0 (reproduzido).** `separacaoNaoRessuscita.api.test.js:402-440` `[92 RN-09] (d)`
   roda a separação A **dentro do gancho** da separação B na mesma requisição, aguardando a resposta; com a trava
   (protótipo do revisor) é *deadlock* — "prazo de 10000ms estourado". A frase da Fase 0 "nenhum teste existente roda um
   gesto travado dentro do gancho de outro" **estava errada** (marcada lá). Corrigido: a T0 inclui a **reescrita
   declarada** desse teste — a rodada concorrente entra por **escritor fora da trava** (`INSERT` direto da rodada no
   gancho) e a marca `ultimaRodadaAntes` (o desfazer de B não devolve o status sobre a rodada alheia) continua provada.

**Importantes**

1. **I1 — o 409 da exclusão disparava num processo só (reproduzido 5/5, controle 0/5).** `/aprovar` (`PENDENTE →
   TOTALMENTE_RESERVADA`), o cancelamento pelos outros módulos e o `/cancelar` do almoxarifado ficam fora da trava nova
   e mudam o status na janela da exclusão (recálculo da 76, distribuição da 74, expiração por leitura); a B447 recusaria
   com 409 uma exclusão legítima sem estorno nenhum. Corrigido: **sem estorno feito → reler e tentar de novo** (uma vez,
   com teto — molde da T1 da 92), 409 **E409** só quando já houve estorno, literal nova **E409N** para a segunda perda
   sem estorno; "Alcance: só fora da trava" riscado. RN-08 (d')(d'')(d'''), controle T5 s5.
2. **I2 — a trilha da exclusão gravava o status lido fora da trava.** A rota lê `antes` (`routes/almoxarifado.js:4088-4091`)
   antes de chamar o serviço; com a fila, o status gravado em `dados_anteriores` pode ser o de antes do gesto que estava
   na frente. Corrigido na T0: `excluirRequisicao` devolve `anterior` (`{ id, numero, status }` lidos **dentro** da
   trava; propriedade não enumerável, o JSON não muda) e a rota audita com ele. **Proibido embrulhar a rota na trava**
   (não reentrante → a rota esperaria a si mesma). RN-01 (c), controle T0 s7.
3. **I3 — o teto do encerramento respondia `{ error: undefined }`.** "Perdeu de novo → o mesmo 400 sobre o relido": com
   a transição relida válida, `validarTransicao` dá `{ ok: true }` sem `erro`. Corrigido: literal própria **C1** (409,
   molde da L1) e RN-08 (e') com gancho que dispara duas vezes; controle T5 s6.
4. **I4 — previsão errada de controle na T6.** Tirar a trava da liberação **não** faz a Jornada B "liberar sem
   conferência — A44 (e)": com a T3 feita, a marca da B445 faz a liberação perder, reler e recusar pela barreira (400).
   Desfecho reescrito na T6.

**Menores**

1. **M1** — o 200 da entrega que perde (B446) com `status: 'CANCELADO'`: a tela lê só `parcial`, mostra "Requisição
   entregue por completo!" e oferece a assinatura, que recusa `CANCELADO` (`deliverySignatureService.js:18,35`) — só fora
   da trava; declarado na B446.
2. **M2** — depois do 409 X1 o modal de separação fica aberto e não recarrega (`RequisicoesList.js:724-735`); em
   `PARCIALMENTE_ATENDIDA` "Separar" de novo grava a mesma caixa duas vezes — só fora da trava; residual da B444.
3. **M3** — a exclusão que toma 404 não recarrega a lista (`RequisicoesList.js:1019-1033`); o roteiro da T7 diz isso.
4. **M4** — o `UPDATE` do item da entrega (4e) não tinha defesa fora da trava. **Decidido (letra B, junto da B446):**
   gravar relativo (`COALESCE(quantidade_entregue,0) + ?`) — defesa em profundidade, entra na T4 com RN-08 (c'') e
   controle s5. Descartado: declarar em "fica de fora" (é a corrida que mexe em estoque e o conserto é uma linha).
5. **M5** — `requisitionService.comTravaDaRequisicao` já existe e é a trava **por material**. O nome novo
   (`travaPorRequisicao.serializarNaRequisicao`) é distinto; T0 (cabeçalho) e T7 (CLAUDE.md) separam as duas à vista.
6. **M6** — linhas: `let entregueAcumulado` em `requisitionService.js:1271` (não `:1225`); o `UPDATE` do item em
   `:1318-1320` (não `:1303-1305`); o s4 da T0 ("reentrante por engano") testa a normalização da chave — renomeado.

## Próximo passo

**(Fase 2 feita — ver a seção acima.)** Próximo: **T0**.

~~Fase 2: um agente fresco~~ (texto original:) Um agente fresco recebe este plano + as specs `04`, `05`, `07` + o plano da 92 e responde as quatro perguntas da skill:
(1) os contratos cobrem os casos de erro e as literais (X1, L1, E409, W3, W4, E1) e o 200 da B446? (2) as RN batem com as
specs (em especial: a exclusão sem regra de status; a D3 da 28 na B444)? (3) T1–T5 são independentes de verdade (critério:
um erro de leitura num exige retrabalho no outro? — T3 e T5 tocam o mesmo bloco de rotas; T2/T4/T5 o mesmo serviço)?
(4) **cada RN seguida até o último gesto do usuário** — em especial: depois da RN-02 (d) (rodada 2 recusada em *Pronta*),
o material da rodada recusada está na caixa? (não — a separação recusada não grava); depois da RN-04 (segunda exclusão
404), a tela recarrega e some a linha?; depois da B446 (200 com `CANCELADO`), o que a tela de entrega mostra
(`parcial`)?; o 409 X1 numa `PARCIALMENTE_ATENDIDA` — o próximo "Separar" da fila (64) separa de novo o que já está na
caixa?; e a **ordem de travas**: algum caminho das cinco portas chama, hoje, código que pega a trava por material
(`liberarReservasDaRequisicao` na exclusão e no encerramento → recálculo da 76 → `comLockDoMaterial`)? Se sim, a ordem
requisição → material tem de estar escrita e nenhum caminho da trava por material pode chegar às cinco portas — conferir
por leitura **e** por sonda. Corrigir o plano e só então a T0.
