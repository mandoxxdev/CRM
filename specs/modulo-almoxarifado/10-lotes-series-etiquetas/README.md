# 10 — Lotes, Números de Série e Etiquetas

> **Status:** 🟡 — **lote é entidade real desde a Etapa 6 (2026-08-09)**; série e etiquetas não
> existem · **Spec original:** seção 10
> **Última atualização:** 2026-08-09 (Etapa 6 entregue, `b7035dd..9406bff` — 19 commits)
> **Design da Etapa 6 (só lotes):** [`docs/superpowers/specs/2026-08-09-almoxarifado-etapa6-lotes-design.md`](../../../docs/superpowers/specs/2026-08-09-almoxarifado-etapa6-lotes-design.md)
> **Plano executado:** [`docs/superpowers/plans/2026-08-09-almoxarifado-etapa6-lotes.md`](../../../docs/superpowers/plans/2026-08-09-almoxarifado-etapa6-lotes.md)

**A feature 10 foi dividida em três etapas.** Ela é grande demais para uma só, e o mapa mestre a
descrevia como um item único — o que fazia parecer que ficaria pronta de uma vez:

| Parte | Entrega | Quando |
|---|---|---|
| **Etapa 6** | Lotes: tabela real, validade, corrida, certificado, FEFO, guarda contra saldo negativo por lote, campo de lote no recebimento | ✅ **entregue em 2026-08-09** (`b7035dd..9406bff`) |
| **Etapa 6b** | Números de série — confirmado em 2026-08-09 que a GMP rastreia série individualmente hoje (rotina, não exceção). Não é descarte de escopo, é sequência | **próxima** — tarefa detalhada no fim do plano da Etapa 6 |
| **Etapa 6c** | Etiquetas com QR Code e impressão em PDF | depois da 6b |

(`6b`/`6c` e não `7`/`8` de propósito: as etapas 7 e 8 do plano mestre já são
transferências/devoluções e materiais de clientes/terceiros.)

## Objetivo

Controle real por lote (validade, corrida/heat number, certificado), número de série individual, e etiquetas com QR/código de barras.

## O que existe hoje — verificado no código em 2026-08-09, depois da Etapa 6

- **`lotes_almoxarifado`** (`schema.js:743`) é a tabela dona do lote: material, código,
  fornecedor, corrida, datas de fabricação/validade, certificado (arquivo/quem/quando), status,
  motivo do status, vínculo com recebimento e NF. Chave `UNIQUE(material_id, codigo)` — o mesmo
  código em materiais diferentes são lotes diferentes. Mais três colunas de liberação de
  vencimento (`vencimento_liberado_em/_por/_motivo`, `schema.js:773-775`, Task 3b).
- **`lotService.js`** (`server/services/almoxarifado/lotService.js`) é o **único** dono do ciclo de
  vida: `criarOuObterLote` (idempotente por material+código, não sobrescreve o existente),
  `getLote`, `getLotePorCodigo`, `mudarStatusLote` (`ATIVO`/`BLOQUEADO`/`REPROVADO`, justificativa
  obrigatória, guarda no `WHERE`, auditado), `liberarBloqueioPorCertificado`, `liberarVencimento`,
  `vencimentoLiberado`, `isVencido`, `listarLotesDoMaterial` (FEFO).
- **`estoque_saldo_almoxarifado` referencia o lote por FK** (`lote_id`, `schema.js:720-731`), não
  mais por texto. A chave é o índice `idx_saldo_almox_chave` com
  `COALESCE(localizacao_id,0), COALESCE(lote_id,0)` — porque no SQLite dois `NULL` são distintos
  para efeito de `UNIQUE` e a constraint de tabela não impedia duplicata justamente no caso comum.
- **O motor lê o lote antes de qualquer efeito de saldo** (`stockService.js`, ramo de saída a
  partir de ~`428`): recusa lote `BLOQUEADO`/`REPROVADO`, recusa lote vencido para consumo, e
  reivindica o saldo do **próprio** lote com `UPDATE … WHERE quantidade >= ? RETURNING`,
  compensando `quantidade_atual` se o claim falhar.
- **`movimentacoes_almoxarifado` grava as duas colunas**: `lote_id` (para juntar) e `lote` (o
  código congelado — o ledger é imutável e precisa continuar legível se o lote for renomeado)
  — `schema.js:789-790`.
- **O lote nasce no recebimento** (`receiptService.darEntradaEstoque`, `receiptService.js:329-359`),
  herdando fornecedor, NF, corrida e validade do item. O item de recebimento ganhou
  `lote_id`, `data_validade_lote` e `corrida_lote` (`schema.js:949-951`).
- **Rotas** (`routes/almoxarifado/extended.js:483-506` e `routes/almoxarifado.js:623`):
  - `GET /api/almoxarifado/materiais/:id/lotes` (perm. `visualizar`) — ordem FEFO, com `saldo`,
    `vencido`, `vencimento_liberado` e `elegivel`; `?com_saldo=1` filtra;
  - `PUT /api/almoxarifado/lotes/:id/status` (perm. `inspecionar`) — justificativa obrigatória;
  - `PUT /api/almoxarifado/lotes/:id/liberar-vencimento` (perm. `inspecionar`);
  - `POST /api/almoxarifado/lotes/:id/certificado` (perm. `receber_material`, `requirePermission`
    **antes** do multer) — anexa e libera o lote se ele estava bloqueado **por isto**.
- **Telas:** campo de lote/validade/corrida por item no recebimento
  (`RecebimentosAlmoxarifado.js:171-173,518-525`) e seletor FEFO na saída da movimentação
  (`MovimentacoesAlmoxarifado.js:107-115,574-598`) — na entrada o lote continua texto livre, que é
  onde um lote novo nasce.
- Tabela órfã `lotes` (sem sufixo) é de lote de **produção** (`numero_lote`, `os_id`, `tipo_lote`,
  `data_producao`), sem rota — não confundir com `lotes_almoxarifado`. Fica em
  `server/index.js:19554` (conferido em 2026-08-09; a spec já dizia `19458` antes e estava errado).

### Regra contraintuitiva que alguém vai tentar "simplificar": liberar o vencimento NÃO desvence o lote

`isVencido` continua derivado **só** de `data_validade < hoje` e continua devolvendo `true` depois
da liberação. O que a liberação muda é a **decisão da guarda de saída**, não o fato. Por isso a
listagem FEFO devolve os dois campos separados (`vencido: true` + `vencimento_liberado: true`) e o
rótulo da tela diz "(vencido, liberado)". Fundir os dois num campo só destruiria a informação de
que aquele material está fora da validade — que é exatamente o que a auditoria precisa ver.

A ordem das guardas também é intencional: **status antes de vencimento**. Um lote `BLOQUEADO` e
vencido, mesmo com o vencimento liberado, falha por bloqueio — com a mensagem de bloqueio, não com
uma mensagem mandando liberar de novo algo que já está liberado.

### Descarte de lote vencido é permitido, de propósito

`SUCATA`, `PERDA` e `AJUSTE_NEGATIVO` são **isentos** da guarda de vencimento
(`stockService.js:450-451`): material vencido tem de poder sair do estoque. Só o **consumo** é
barrado. Sem essa isenção o lote vencido ficava preso para sempre — não podia sair como consumo
(correto) e também não podia ser baixado como perda (bug, achado no round 1 do review da Task 3).
A guarda de **status** continua valendo para o descarte: lote `BLOQUEADO`/`REPROVADO` precisa
passar pela mudança de status, com justificativa, antes de qualquer saída.

### Nota de escopo: `AJUSTE_POSITIVO`/`AJUSTE_NEGATIVO` exigem lote; só o `AJUSTE` puro é isento

`AJUSTE_POSITIVO` e `AJUSTE_NEGATIVO` estão classificados em `tiposEntrada`/`tiposSaida`
(`stockService.js:364-365`), então a guarda de `controle_lote` **exige** lote neles. Só o `AJUSTE`
puro fica de fora — é o caminho de regularização de quem ligou a flag com estoque antigo sem lote
conhecido em casa. Exigir lote no `AJUSTE` trancaria a porta de saída dessa migração.

### As cinco flags `controle_*`: duas acesas, três ainda mortas

A versão anterior desta spec corrigiu "são cinco flags mortas, não duas". A Etapa 6 acendeu duas
delas. Registrar quais continuam mortas é obrigatório aqui — acender duas e ficar em silêncio
sobre as outras três recriaria exatamente a confusão que esta spec existe para documentar.

| Flag | Estado | Onde é lida | Acende em |
|---|---|---|---|
| `controle_lote` | ✅ **acesa** (`2dbbf60`) | `stockService.js:400` — exige lote em toda entrada e saída | Etapa 6 |
| `controle_certificado` | ✅ **acesa** (`64686b1`, `c11db85`) | `receiptService.js:340` — lote sem certificado nasce `BLOQUEADO` | Etapa 6 |
| `controle_serie` | ❌ **morta** — gravada pelo CRUD, nunca lida | — | **Etapa 6b** (números de série) |
| `controle_validade` | ❌ **morta** — gravada pelo CRUD, nunca lida | — | sem etapa definida (ver nota abaixo) |
| `controle_corrida` | ❌ **morta** — gravada pelo CRUD, nunca lida | — | sem etapa definida (ver nota abaixo) |

As três mortas existem em `schema.js:614-616`, `schemas.js:196-198`, `routes/almoxarifado.js:313-330`
e `MaterialAlmoxarifadoForm.js:29-31` — e em lugar nenhum mais (verificado por grep em 2026-08-09).

> **Sobre `controle_validade` e `controle_corrida`:** a Etapa 6 entregou os **dados** que essas
> flags governariam (`data_validade` e `corrida` no lote, com a guarda de vencimento funcionando),
> mas não a **obrigatoriedade** por material — hoje um material com `controle_validade` ligado
> aceita lote sem validade sem reclamar. Não tem etapa marcada porque é um incremento pequeno
> dentro de qualquer etapa futura de lotes, não uma etapa própria. Se ninguém pedir, a decisão
> honesta é **apagar as duas colunas** em vez de deixá-las parecendo implementadas — foi
> exatamente o que a Etapa 6 fez com as três colunas de retenção do saldo.

### ⚠️ Histórico — "o motor já segrega saldo por lote" era meia verdade (RESOLVIDO na Task 3)

> **Status: RESOLVIDO** em `65d78fd` e nas cinco rodadas de review seguintes (`920d10c`, `f65758d`,
> `c2e31dc`, `1effd07`, `2d6fec5`). O texto abaixo descreve o estado do motor **antes** da Task 3 —
> é o levantamento que justificou o design da etapa, mantido como registro do bug. **Não há mais
> nenhuma citação de linha aqui de propósito**: as rodadas de review moveram tudo de lugar mais de
> uma vez, e número de linha em texto histórico só apodrece.

A frase anterior — *"o motor já segrega saldo por lote — bom ponto de partida"* — estava certa na
letra e enganosa na prática. A segregação era **write-only**: escrevia-se o lote, nunca se lia o
lote para decidir nada.

1. **Saída por lote não validava o saldo daquele lote.** A guarda de saldo insuficiente comparava
   com o disponível **do material**; logo depois, a subtração acertava a linha do lote sem nenhuma
   verificação. Tirar 10 do lote `A` quando `A` tinha 2 e o material tinha 100 passava, e a linha
   do lote ficava **negativa em silêncio**. `syncMaterialTotals` somava essa linha negativa de
   volta, então o total do material continuava "certo" e o erro ficava invisível.

   Reproduzido em 2026-08-09. Entrada de 100 no lote `A` e 2 no lote `B`, depois SAÍDA de 10 no
   lote `B`:

   | | lote A | lote B | `material.quantidade_atual` |
   |---|---|---|---|
   | antes | 100 | 2 | 102 |
   | depois da saída de 10 em `B` | 100 | **−8** | 92 |

   O motor **não lançava erro nenhum**, e a soma das linhas (92) batia com o total do material —
   por isso nenhuma consulta ao material denunciava o problema. Hoje a mesma sequência é recusada
   com 400 e nada muda no saldo, provado por
   `server/tests/api/loteGuardasSaida.api.test.js` (`saida acima do saldo do lote falha e nao
   deixa a linha negativa`), que verifica inclusive a compensação de `quantidade_atual`.
2. **As três colunas de retenção da linha por lote nunca eram escritas** —
   `quantidade_reservada`, `quantidade_bloqueada` e `quantidade_em_inspecao` existiam no
   `CREATE TABLE` de `estoque_saldo_almoxarifado`, mas RESERVA, BLOQUEIO e QUARENTENA sempre
   escreveram só em `materiais_almoxarifado`.
   **Elas foram REMOVIDAS em `015e94c`.** Não procure por elas: a decisão registrada no último item
   do checklist foi "retenção continua no material", e o plano manda apagar coluna sem escritor em
   vez de deixá-la parecendo implementada. Reter um lote específico em **quantidade** continua
   impossível — o que existe é reter o lote **inteiro** por status (`BLOQUEADO`/`REPROVADO`).
3. Era **exatamente o padrão que já mordeu três vezes neste módulo** (coluna existe, fórmula
   subtrai, ciclo nunca fecha — `reserva_id` e `expira_em` na Etapa 4, `quantidade_em_inspecao`
   na Etapa 5). É por isso que a Etapa 6 removeu as colunas em vez de "deixar para depois".

### ⚠️ Histórico — lacunas que a spec não registrava (todas fechadas na Etapa 6)

- **O recebimento não tinha campo de lote na tela.** O ponto em que um lote naturalmente nasce — a
  nota fiscal do fornecedor — era justamente o que não conseguia registrá-lo. Fechado em `9406bff`.
- **`UNIQUE(material_id, localizacao_id, lote)` não impedia duplicata sem lote** (dois `NULL` são
  distintos para `UNIQUE` no SQLite). Fechado em `015e94c` com o índice `COALESCE`.
- **Leitura por lote só existia no extrato.** Hoje existe `GET /materiais/:id/lotes` em ordem FEFO
  (`8dfeb0c`) e o seletor de lote na saída (`9406bff`).

  > **Correção de 2026-08-09:** a migração da Task 2 removeu a coluna `lote TEXT` do saldo, e
  > `ExtratoMaterialModal.js:174` lê `s.lote` como texto. A coluna "Lote" do extrato teria ficado
  > em `—` para sempre, em silêncio. Fechado em `b4e4858`: `consultarSaldosPorLocalizacao`
  > (`stockService.js:1171-1178`) devolve `lt.codigo as lote` via `LEFT JOIN`, ao lado de `lote_id`.

## Checklist

### Backend — lotes
- [x] Tabela `lotes_almoxarifado`: material, código do lote, fornecedor, corrida/heat number, certificado (anexo), data de fabricação, validade, status (ativo/bloqueado/reprovado) — **`b7035dd`** (+ `d6e36e9`: status inválido passou a ser recusado em vez de coagido para `ATIVO` em silêncio; + `556f86d`: as três colunas de liberação de vencimento)

  > ⚠️ **Correção (2026-08-09): `VENCIDO` não é status.** Esta linha pedia
  > `ativo/bloqueado/reprovado/vencido`. Vencimento é **derivado** de `data_validade <
  > date('now')`, calculado na leitura. Gravar `VENCIDO` exigiria um cron para virar o status à
  > meia-noite e criaria um estado que diverge da data toda vez que o cron falhasse — mais uma
  > coluna mentindo, que é o problema que esta spec inteira documenta. Derivado não diverge.
  > **Implementado assim** (`lotService.isVencido`), e o teste `vencido e derivado da data, nao e
  > status gravado` (`lotes.api.test.js`) segura a decisão.
- [x] `estoque_saldo_almoxarifado.lote` passa a referenciar a tabela (migração dos textos existentes, **deduplicando as linhas `lote IS NULL`**) — **`015e94c`** (+ `b4e4858`: o teste "migração idempotente" era vazio — rodava sobre banco que já nascia na forma nova e saía pelo early-return; foi renomeado honestamente e um teste real do corpo da migração entrou no lugar)
- [x] **Saída não pode deixar a linha do lote negativa.** Guarda no `WHERE` do UPDATE, com `RETURNING` e compensação de `quantidade_atual` — **`65d78fd`**, mais cinco rodadas de review (`920d10c`, `f65758d`, `c2e31dc`, `1effd07`, `2d6fec5`)
- [x] Aplicar `controle_lote`: material controlado exige lote em TODA entrada e saída — **`2dbbf60`**. `AJUSTE` puro é isento de propósito (regularização); `AJUSTE_POSITIVO`/`AJUSTE_NEGATIVO` **não** são (ver "Nota de escopo" acima)
- [x] Aplicar `controle_certificado`: entrada sem certificado **entra bloqueada** (não falha — barrar a entrada foi o erro corrigido na Etapa 5); o `SELECT` morto em `receiptService` passou a ser usado de verdade — **`64686b1`** (+ `c11db85`: anexar certificado podia liberar um lote `REPROVADO` por corrida entre a leitura e a escrita; a pré-condição foi inteira para dentro do `WHERE` em `liberarBloqueioPorCertificado`)
- [x] Validade: bloquear saída de lote vencido; sugestão FEFO (primeiro que vence sai primeiro) — **`65d78fd`** (guarda), **`556f86d`** (liberação com justificativa — Task 3b, ver abaixo), **`8dfeb0c`** (ordem FEFO na API), **`9406bff`** (FEFO pré-selecionado na tela, como sugestão e não imposição)
- [ ] Rastreabilidade: consulta de tudo que aconteceu com um lote — **parcial, e o que falta é a consulta agregada.** Os dados existem e são consultáveis (`movimentacoes_almoxarifado.lote_id` desde `65d78fd`, `auditoria_log_almoxarifado` com `entidade='lote'` desde `b7035dd`, saldo por lote em `GET /materiais/:id/lotes` desde `8dfeb0c`), mas não há um "extrato do lote" que junte as três fontes como `GET /materiais/:id/extrato` faz para o material. **Fica para a Etapa 6b**, junto com a tela de lotes que também falta (ver Frontend)
- [x] **Decidir se retenção passa a ser por lote** — **decidido: continua no material.** As três colunas de retenção de `estoque_saldo_almoxarifado` foram **apagadas** em **`015e94c`** para não parecerem implementadas. Reter um lote inteiro se faz por status (`BLOQUEADO`/`REPROVADO`); reter **parte** de um lote em quantidade continua não existindo, e é decisão consciente — o cliente pediu retenção por status, não por quantidade

#### Task 3b — liberação de vencimento (não estava no plano; nasceu de um achado de review)

Aprovada pelo cliente em 2026-08-09, no meio da etapa. A guarda de vencimento da Task 3 tinha sido
escrita **sem** o caminho de liberação que o próprio cliente pedira no design, e a mensagem de erro
mandava "liberar o lote pela tela de lotes" — o que não destravava nada, porque nenhuma tela nem
rota fazia isso. Era uma parede com placa de porta.

- [x] `vencimento_liberado_em` / `_por` / `_motivo` em `lotes_almoxarifado` — **`556f86d`**
- [x] `lotService.liberarVencimento` (justificativa obrigatória, guarda no `WHERE` contra
  `data_validade`, auditado com `acao='LIBERACAO_VENCIMENTO'`) e `lotService.vencimentoLiberado` — **`556f86d`**
- [x] `PUT /api/almoxarifado/lotes/:id/liberar-vencimento` (perm. `inspecionar`) — **`556f86d`**
- [x] A guarda de saída passa a respeitar a liberação, **sem** mexer em `isVencido` — **`556f86d`**
- [x] `elegivel` da listagem FEFO usa a mesma ordem do motor (status antes de vencimento) — **`8dfeb0c`**

### Backend — números de série
> Nada abaixo foi entregue, e **isso não é esquecimento**: a tabela de divisão no topo coloca série
> na **Etapa 6b**, que é a próxima. A tarefa detalhada está no fim de
> [`docs/superpowers/plans/2026-08-09-almoxarifado-etapa6-lotes.md`](../../../docs/superpowers/plans/2026-08-09-almoxarifado-etapa6-lotes.md).

- [ ] Tabela `series_almoxarifado`: material, número de série, status (em estoque/reservado/entregue/em terceiro/devolvido), localização, projeto/OS atual — **Etapa 6b**
- [ ] `controle_serie` no material: entrada exige N séries para N unidades; saída exige quais séries — **Etapa 6b** (a flag existe e está morta hoje — ver a tabela das cinco flags)
- [ ] Série é única por material; ciclo de vida rastreável — **Etapa 6b**

### Backend — etiquetas
> Nada abaixo foi entregue: etiquetas são a **Etapa 6c**, depois da 6b.

- [ ] Geração de etiqueta (spec 10): código GMP, descrição, quantidade, lote/série, fornecedor, pedido, NF, projeto, localização, status inspeção + **QR Code** — **Etapa 6c**
- [ ] Endpoint de etiqueta em PDF (aproveitar infra `pdfkit`/`puppeteer` existente) — **Etapa 6c**
- [ ] Etiqueta de retalho com dimensões/peso remanescente (feature 15) — **Etapa 6c**
- [ ] Regras por tipo (spec 10): motores/instrumentos → série; chapas/tubos certificados → lote+corrida; químicos → lote+validade — **Etapa 6c** (depende de série existir)

### Frontend
- [x] **Campo de lote no recebimento** — **`9406bff`**: lote, validade e corrida por item, nos status em que os dados fiscais são editáveis
- [x] Seleção de lote na movimentação de **saída** — **`9406bff`**: `<select>` em ordem FEFO alimentado por `GET /materiais/:id/lotes?com_saldo=1`, primeiro elegível pré-selecionado, não elegíveis aparecem `disabled` com o motivo no rótulo (esconder faria o operador procurar material que o sistema decidiu não mostrar). Na **entrada** continua texto livre, que é onde o lote nasce. Série fica para a 6b
- [ ] **Cadastro/consulta de lotes no detalhe do material** — **NÃO entregue, e é a lacuna mais séria que a etapa deixa.** Ver a pendência (a) abaixo
- [ ] Seleção de série na movimentação, separação e entrega — **Etapa 6b**
- [ ] Botão imprimir etiqueta (recebimento, material, localização) — **Etapa 6c**

## Pendências abertas depois da Etapa 6

### (a) Três rotas de lote existem e **nenhuma tela as chama**

`PUT /lotes/:id/status`, `PUT /lotes/:id/liberar-vencimento` e `POST /lotes/:id/certificado` foram
entregues com permissão, justificativa obrigatória e auditoria — e **não há nenhum componente no
cliente que as consuma** (verificado por grep em `client/src` em 2026-08-09: a única rota de lote
usada pelo front é o `GET` da listagem FEFO, dentro de `MovimentacoesAlmoxarifado.js`).

Consequência concreta: a mensagem de erro que o operador vê ao tentar consumir um lote vencido diz
*"Libere o vencimento do lote (PUT /api/almoxarifado/lotes/:id/liberar-vencimento) com
justificativa"* — uma instrução de API para quem só tem um navegador. **É a mesma classe de
problema que a Task 3b nasceu para consertar**, um nível acima: antes o caminho não existia; agora
existe, mas só por `curl`. Bloquear, reprovar, liberar vencimento e anexar certificado depois do
recebimento são, hoje, operações sem interface.

A correção natural é uma tela de lotes (ou uma aba no detalhe do material) que liste
`GET /materiais/:id/lotes` e ofereça as três ações. Vale casar com o "extrato do lote" que falta no
checklist de rastreabilidade — é a mesma tela.

### (b) A conclusão de inventário escreve `quantidade_atual` por fora do motor

`PUT /api/almoxarifado/conferencias/:id/concluir` com `aplicar_ajustes`
(`server/routes/almoxarifado.js:894`, o `UPDATE materiais_almoxarifado SET quantidade_atual` em
`routes/almoxarifado.js:917`) grava o total direto e **nunca toca em
`estoque_saldo_almoxarifado`** — nem gera movimentação pelo motor. Com a reconciliação por soma,
aplicar um ajuste de inventário e depois contar uma prateleira **evapora a diferença**.

**Não é regressão da Etapa 6:** esse `UPDATE` cru é anterior a ela. A correção é rotear a conclusão
pelo `stockService.registrarMovimentacao` (o que também geraria a linha no livro, que hoje não
existe para esse caminho) — muda o comportamento de uma rota com permissão própria e precisa de
teste de API próprio, então **vira task separada**. Registrada também em
[03-motor-estoque](../03-motor-estoque/README.md).

### (c) "A primeira contagem redefine o saldo" tem um furo — decisão do cliente pendente

A regra decidida pelo cliente em 2026-08-09 é: material com saldo e **nenhum endereço registrado**
(praticamente todo o estoque legado — o dump de produção tinha 3 linhas de saldo no total), ao
receber a **primeira contagem numa localização**, tem o saldo **redefinido** por ela. "Nesta
prateleira tem 40" significa que o material tem 40, não 140. É a semântica de "a soma das linhas de
saldo é a verdade", e é por isso que `syncMaterialTotals` existe e é chamada pelo AJUSTE com
localização.

**O furo:** a regra vale quando o material não tem nenhuma linha. Depois que existe uma linha
residual **sem endereço**, um AJUSTE global de 100 seguido de contagem de 40 numa prateleira dá
**140**, não 40 (medido no round 5 do review da Task 3). Qual dos dois é o certo é pergunta de
negócio, não técnica — e a Task 3 já foi refeita uma vez por responder isso sozinha. **Aguardando
decisão do cliente.**

### (d) O certificado do fornecedor é servido estaticamente **fora** do middleware de autenticação

`routes/almoxarifado.js:84-85` registra `express.static(uploadsAlmoxDir)` em
`/api/uploads/almoxarifado` e `/uploads/almoxarifado`, **antes** de
`app.use('/api/almoxarifado', ...almoxMiddleware)` (linha 88-90) e fora do prefixo que ele protege.
A Etapa 6 passou a colocar **certificados de fornecedor** nesse diretório.

**Não é regressão:** é o mesmo tratamento que as fotos de material já tinham. Mas certificado é
documento mais sensível que foto de prateleira, e quem souber o nome do arquivo baixa sem
autenticar. **Aguardando decisão do cliente** sobre servir por rota autenticada.

### (e) Reprovar um lote pela inspeção ainda não está ligado

A Etapa 6 entrega o status `REPROVADO` no lote e a rota que o muda, mas
`inspectionService.decidirInspecao` continua bloqueando o **material inteiro**, sem tocar no lote.
Ligar os dois é mudança na feature 09 — registrado em
[09-inspecao-qualidade](../09-inspecao-qualidade/README.md).

### (f) `recebimentos_material_itens_almoxarifado.lote_id` tem escritor e nenhum leitor

Gravado por `receiptService.js:357-358`, ninguém lê ainda. É a coluna que vai ligar o item de
recebimento ao lote nas consultas de rastreabilidade (pendência (a)). Anotado aqui porque é
literalmente o padrão que esta spec existe para caçar — a diferença é que aqui o escritor existe,
o que a torna dado real e não coluna mentindo.

## Regras essenciais + testes de API exigidos

| Regra | Teste | Estado |
|-------|-------|--------|
| Material com `controle_lote` exige lote na movimentação | `entrada sem lote em material com controle_lote falha` / `saida sem lote…` — `loteControleObrigatorio.api.test.js` | ✅ `2dbbf60` |
| Saída acima do saldo do **lote** falha e não negativa a linha | `saida acima do saldo do lote falha e nao deixa a linha negativa` — `loteGuardasSaida.api.test.js` | ✅ `65d78fd` |
| Saída de lote vencido falha | `saida de lote vencido falha` — `loteGuardasSaida.api.test.js` | ✅ `65d78fd` |
| Lote vencido com vencimento liberado sai; sem liberação continua falhando | `saida de lote vencido com vencimento liberado passa` + `…sem liberacao continua falhando` — `loteVencimentoLiberacao.api.test.js` | ✅ `556f86d` |
| Liberar vencimento não destrava lote bloqueado, e não "desvence" o lote | `liberacao nao destrava lote bloqueado` + `lote continua marcado como vencido depois da liberacao` — mesmo arquivo | ✅ `556f86d` |
| Saída de lote reprovado falha | `saida de lote reprovado falha` — `loteGuardasSaida.api.test.js` | ✅ `65d78fd` |
| Descarte de lote vencido **passa** (SUCATA/PERDA/AJUSTE_NEGATIVO não podem ser travados pela validade) | `SUCATA de lote vencido passa (descarte nao e bloqueado pela validade)` — `loteGuardasSaida.api.test.js` | ✅ `920d10c` |
| Contagem por localização **redefine** o saldo do material (decisão de negócio do cliente) | `AJUSTE por localizacao REDEFINE o saldo do material (decisao de negocio do cliente)` — `loteGuardasSaida.api.test.js` | ✅ `c2e31dc` |
| Lote sem certificado (material com `controle_certificado`) nasce BLOQUEADO, e o material entra mesmo assim | `sem certificado, o lote nasce BLOQUEADO: entra fisicamente mas a saida e recusada` — `loteRecebimento.api.test.js` | ✅ `64686b1` |
| Anexar certificado libera só o bloqueio de certificado — nunca um REPROVADO | `anexar o certificado libera o lote` + `lote REPROVADO continua bloqueado depois de anexar o certificado` — `loteRecebimento.api.test.js` | ✅ `c11db85` |
| Lotes vêm em ordem FEFO, não elegíveis no fim | `lotes vem em ordem FEFO, nulos por ultimo` + `lote nao elegivel aparece, mas no fim da lista` — `loteRotas.api.test.js` | ✅ `8dfeb0c` |
| Mudar status de lote exige justificativa e permissão | `mudar status pela rota exige justificativa` + `perfil sem permissao nao muda status de lote` — `loteRotas.api.test.js` | ✅ `8dfeb0c` |
| Saldo por lote soma o saldo do material | coberto indiretamente por `loteMigracaoSaldo.api.test.js` + `ajusteLocalizacao.api.test.js` (reconciliação por soma) | ✅ `015e94c` |
| Série não pode estar em dois lugares | `entrada de serie ja em estoque falha` | ⏳ Etapa 6b |
| Saída de material seriado exige séries válidas em estoque | `saida seriada com serie inexistente falha` | ⏳ Etapa 6b |

## Dependências

- 03 (motor de estoque) — as validações entram no `stockService`. **Entregues na Etapa 6, Task 3.**
- Consome: 04/05 (entrega — registrar lote/série entregue por item ainda não existe), 07 (reserva
  por lote — **continua aberta**: a reserva é do material, não do lote), 08 (entrada — **ligada na
  Task 5**, o lote nasce no recebimento), 09 (reprovação — **ligação pendente**, ver pendência (e)),
  15 (retalhos).
