# 10 — Lotes, Números de Série e Etiquetas

> **Status:** 🟡 — **lote é entidade real desde a Etapa 6, com tela completa desde a Task 9
> (2026-08-09)**; série e etiquetas não existem · **Spec original:** seção 10
> **Última atualização:** 2026-08-11 (**auditoria spec×código: tudo confirmado; refs de linha
> trocadas por nomes** — as três citações numéricas que restavam (`consultarSaldosPorLocalizacao`,
> as rotas de lote em `extended.js`, o registro do `express.static`/`almoxMiddleware` em
> `routes/almoxarifado.js`) ficaram só com arquivo + símbolo/rota; a citação
> `server/index.js:19554` foi conferida e está exata, então permanece.)
> Antes: 2026-08-10 (**fechamento dos 5 minors residuais do review final**:
> documentado que o claim agregado por lote drena linhas de localização NÃO declarada — inclusive
> bloqueada — na seção "Efeito colateral declarado", abaixo; três citações de linha que o próprio
> commit de doc do review final tinha invalidado (`stockService.js:450-451`, `:1171`/`:1171-1178`,
> `routes/almoxarifado.js:894`/`:917`) perderam o número, ficando só arquivo + símbolo. Documentação
> e comentário apenas, sem mudança de comportamento — ver
> [`.superpowers/sdd/2026-08-09-almoxarifado-etapa6-lotes/minors-report.md`](../../../.superpowers/sdd/2026-08-09-almoxarifado-etapa6-lotes/minors-report.md).
> Antes: 2026-08-10, **review final do branch**: o alcance real de `controle_lote`
> foi restringido e está documentado abaixo — esta spec e o guia declaravam a flag como valendo em
> "toda entrada e saída", o que travava quatro fluxos internos; mais `data_fabricacao` ganhando
> escritor e leitor, e o claim de saída passando a ser contra o saldo agregado do lote.
> Antes: 2026-08-09, Task 9 — tela de lotes + Sucata/Perda na Movimentação)
> **Design da Etapa 6 (só lotes):** [`docs/superpowers/specs/2026-08-09-almoxarifado-etapa6-lotes-design.md`](../../../docs/superpowers/specs/2026-08-09-almoxarifado-etapa6-lotes-design.md)
> **Plano executado:** [`docs/superpowers/plans/2026-08-09-almoxarifado-etapa6-lotes.md`](../../../docs/superpowers/plans/2026-08-09-almoxarifado-etapa6-lotes.md)
> **Task 9 (correção pós-review):** [`.superpowers/sdd/2026-08-09-almoxarifado-etapa6-lotes/task-9-report.md`](../../../.superpowers/sdd/2026-08-09-almoxarifado-etapa6-lotes/task-9-report.md)

**A feature 10 foi dividida em três etapas.** Ela é grande demais para uma só, e o mapa mestre a
descrevia como um item único — o que fazia parecer que ficaria pronta de uma vez:

| Parte | Entrega | Quando |
|---|---|---|
| **Etapa 6** | Lotes: tabela real, validade, corrida, certificado, FEFO, guarda contra saldo negativo por lote, campo de lote no recebimento | ✅ **entregue em 2026-08-09** (`b7035dd..9406bff`) |
| **Task 9** | Tela de lotes (status/vencimento/certificado) + Sucata/Perda selecionáveis na Movimentação — não estava no plano, nasceu do review da Task 8 | ✅ **entregue em 2026-08-09** (`09c75d2`) |
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
- **O motor lê o lote antes de qualquer efeito de saldo** (`stockService.registrarMovimentacao`,
  ramo de saída): recusa lote `BLOQUEADO`/`REPROVADO`, recusa lote vencido para consumo, e
  reivindica o saldo do **próprio** lote com `UPDATE … WHERE quantidade >= ? RETURNING`,
  compensando `quantidade_atual` se o claim falhar. Desde o review final do branch (2026-08-10) o
  claim é contra o **conjunto** de linhas daquele lote (`stockService.claimSaldoDoLote`), não
  contra uma linha só — ver "O saldo do lote é agregado nas DUAS pontas", abaixo.
- **`movimentacoes_almoxarifado` grava as duas colunas**: `lote_id` (para juntar) e `lote` (o
  código congelado — o ledger é imutável e precisa continuar legível se o lote for renomeado)
  — `schema.js:789-790`.
- **O lote nasce no recebimento** (`receiptService.darEntradaEstoque`), herdando fornecedor, NF,
  corrida, **data de fabricação** e validade do item. O item de recebimento ganhou `lote_id`,
  `data_validade_lote`, `data_fabricacao_lote` e `corrida_lote` (bloco `recebItemCols` em
  `schema.js`). A mesma função ganhou, no review final do branch, **pré-checagem de todos os itens
  antes de mover qualquer um** e a marca de idempotência `entrada_estoque_em` por item — ver a
  seção "A entrada do recebimento não é mais re-executável", abaixo.
- **Rotas** (as três primeiras em `routes/almoxarifado/extended.js`, a de certificado em
  `routes/almoxarifado.js` — procure pelo caminho da rota):
  - `GET /api/almoxarifado/materiais/:id/lotes` (perm. `visualizar`) — ordem FEFO, com `saldo`,
    `vencido`, `vencimento_liberado` e `elegivel`; `?com_saldo=1` filtra;
  - `PUT /api/almoxarifado/lotes/:id/status` (perm. `inspecionar`) — justificativa obrigatória;
  - `PUT /api/almoxarifado/lotes/:id/liberar-vencimento` (perm. `inspecionar`);
  - `POST /api/almoxarifado/lotes/:id/certificado` (perm. `receber_material`, `requirePermission`
    **antes** do multer) — anexa e libera o lote se ele estava bloqueado **por isto**.
- **Telas:** campo de lote/validade/**fabricação**/corrida por item no recebimento
  (`RecebimentosAlmoxarifado.js`) e seletor FEFO na saída da movimentação
  (`MovimentacoesAlmoxarifado.js`) — na entrada o lote continua texto livre, que é onde um lote
  novo nasce. A tela de lotes (`LotesAlmoxarifado.js`) exibe a data de fabricação e oferece um
  **link para abrir o certificado** do fornecedor (até o review final do branch o arquivo era
  gravado e nunca visualizável: a tela só o lia como booleano).
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

`SUCATA`, `PERDA` e `AJUSTE_NEGATIVO` são **isentos** da guarda de vencimento (array `tiposDescarte`
em `stockService.js`, dentro de `registrarMovimentacao` — sem número de linha de propósito: as
+136 linhas do review final da Etapa 6 (`a3afaa1`) já deslocaram esse trecho de `450-451` para
`586` uma vez, e número de linha em spec envelhece entre dois commits): material vencido tem de
poder sair do estoque. Só o **consumo** é
barrado. Sem essa isenção o lote vencido ficava preso para sempre — não podia sair como consumo
(correto) e também não podia ser baixado como perda (bug, achado no round 1 do review da Task 3).
A guarda de **status** continua valendo para o descarte: lote `BLOQUEADO`/`REPROVADO` precisa
passar pela mudança de status, com justificativa, antes de qualquer saída.

### ⚠️ O alcance REAL de `controle_lote` — esta spec e o guia estavam errados até 2026-08-10

**A afirmação anterior era "material com `controle_lote` exige lote em TODA entrada e saída", com a
única ressalva sendo o `AJUSTE` puro. Estava errada em consequência, e a consequência era grave.**
A guarda de fato valia para todo tipo de entrada/saída, viesse a chamada de onde viesse — e
**quatro chamadores internos chamam o motor sem ter de onde tirar um lote**: não existe campo na
tela nem parâmetro na chamada. Efeito medido no review final do branch: ligar "Controle por lote"
tornava o material **impossível de entregar por requisição e de devolver**. Pior que travar: a
RESERVA da requisição nascia normalmente (`RESERVA` não é entrada nem saída), então o saldo ficava
preso numa reserva que **nunca podia ser consumida**.

**Decisão do cliente (2026-08-10): a exigência vale só onde existe COMO informar o lote.**

| Caminho | Exige lote? | Onde |
|---|---|---|
| Movimentação manual — rota v2 (tela de Movimentações) | ✅ sim | `POST /movimentacoes/v2` declara `{ exigeLote: true }` |
| Movimentação manual — rota v1 (modal rápido da tela de Materiais) | ✅ sim | `POST /movimentacoes` declara `{ exigeLote: true }` |
| Recebimento (processar nota) | ✅ sim | `receiptService.darEntradaEstoque` declara, e a pré-checagem recusa a nota inteira antes de mover |
| `AJUSTE` puro | ❌ isento **por tipo** | regularização de estoque antigo sem lote — vale para qualquer chamador |
| Os quatro fluxos internos | ❌ isentos — **pendência (g)** | ver abaixo |

**Como a exigência é declarada:** `stockService.registrarMovimentacao(db, user, params, opcoes)`
lê `opcoes.exigeLote` — **4º argumento, nunca `params`**. As rotas repassam `req.body` inteiro como
`params`, então qualquer chave lida dali seria forjável pelo cliente: uma exigência que o próprio
cliente desligasse mandando `exigeLote: false` no JSON não seria exigência. É o mesmo motivo já
documentado em `criarReserva`, e há teste dedicado provando que o body não desliga a guarda.
Descartado deduzir pelo tipo do movimento (`SAIDA` vem tanto da tela quanto da entrega de
requisição) e olhar a pilha de chamada (frágil e invisível). O default é "não exige" porque quem
**não** declara é exatamente o conjunto dos fluxos internos — e um chamador novo que esqueça de
declarar falha aberto (aceita sem lote) em vez de travar um fluxo inteiro em produção.

### Nota de escopo: `AJUSTE_POSITIVO`/`AJUSTE_NEGATIVO` exigem lote; só o `AJUSTE` puro é isento

`AJUSTE_POSITIVO` e `AJUSTE_NEGATIVO` estão classificados em `tiposEntrada`/`tiposSaida`
(`stockService.registrarMovimentacao`), então a guarda de `controle_lote` **exige** lote neles —
quando quem chama declara `exigeLote` (ver a tabela acima). Só o `AJUSTE` puro fica de fora por
tipo, para qualquer chamador: é o caminho de regularização de quem ligou a flag com estoque antigo
sem lote conhecido em casa. Exigir lote no `AJUSTE` trancaria a porta de saída dessa migração.

### O saldo do lote é agregado nas DUAS pontas

`lotService.listarLotesDoMaterial` sempre calculou `saldo` como a **soma** de `quantidade` em
todas as localizações daquele lote — é o número que a tela de Movimentação mostra no seletor FEFO
e que a tela de Lotes exibe na coluna "Saldo". O motor, até o review final do branch, reivindicava
contra **uma** linha, chaveada por `(material, localização resolvida da saída, lote)`. Quando as
duas não coincidiam, a tela dizia "saldo 25", o FEFO pré-selecionava o lote, e o motor respondia
*"Saldo insuficiente no lote L1. Disponível: 0"*.

Alinhado pelo lado do **agregado**, e não restringindo a tela: é o lado que concorda com a regra de
negócio já escrita no guia — *uma saída consome o saldo total do material, independente da área em
que ele está endereçado* —, porque almoxarifado aqui é **área física dentro do mesmo site**, não
filial. `stockService.claimSaldoDoLote` drena as linhas do lote (a localização resolvida primeiro,
depois as maiores), cada uma por `UPDATE` condicional, devolvendo explicitamente o que já drenou se
o total não fechar. E **não cria linha**: `getOrCreateSaldo` criava a linha antes do claim, então
toda saída recusada deixava um `(loc, lote, 0)` para trás — lixo que ainda alimentava o
discriminador do estorno, que conta linhas inclusive zeradas (ver
[03-motor-estoque](../03-motor-estoque/README.md)).

#### Efeito colateral declarado (review final, 2026-08-10): a validação de endereço só olha a localização DECLARADA

`validarLocalizacaoParaMovimento` roda antes do claim e valida só a localização resolvida da saída
(a declarada pelo operador, ou a padrão do material na ausência dela) — bloqueio e tipo permitido.
As DEMAIS linhas do lote que `claimSaldoDoLote` decide drenar, quando a declarada não fecha o total
sozinha, **não passam por essa validação de novo** — inclusive uma linha que está numa localização
marcada `bloqueada = 1`.

Reproduzido: lote com 10 unidades endereçadas numa localização; essa localização é marcada
`bloqueada = 1`; uma saída de 5 declarando uma OUTRA localização de origem, não bloqueada, **passa**,
e a linha bloqueada cai de 10 para 5 — sem nenhum erro.

Isso é consequência direta, e coerente, da decisão de alinhar o claim pelo agregado do lote (a regra
de negócio acima: uma saída consome o saldo total do material, independente da área física em que
está endereçado — almoxarifado é área física dentro do mesmo site, não filial). **Não corrompe
saldo**: o total do material e a soma das linhas continuam batendo. O que se perde é a garantia de
que "bloqueada" protege a linha inteira contra qualquer saída — ela só protege contra saída que a
declare como origem. Não é bug a corrigir (parked com ruling no review final da Etapa 6); é
comportamento que não estava escrito em lugar nenhum até agora.

### A entrada do recebimento não é mais re-executável

`receiptService.darEntradaEstoque` percorria os itens chamando o motor um a um, sem pré-checagem e
sem marca. Se o item B falhasse, os anteriores **já tinham entrado**, o recebimento continuava em
`EM_ENTRADA_NF` e o botão "Processar Nota" continuava na tela. Reproduzido no review final: 1ª
tentativa entrou 10 do item A e falhou no B; corrigido o B, a 2ª tentativa entrou **mais 10** do A
— total 20.

Como não há transação no módulo, a correção tem duas pontas:

1. **Pré-checagem** de todos os itens antes de mover qualquer um — material inativo, `controle_lote`
   sem lote digitado, localização de destino bloqueada ou que não aceita o tipo do material. Uma
   nota com um item ruim é recusada **inteira**, sem ter movido nada.
2. **Marca por item**, `recebimentos_material_itens_almoxarifado.entrada_estoque_em`: o item é
   reclamado por `UPDATE … WHERE entrada_estoque_em IS NULL` **antes** de mover, e o
   reprocessamento pula quem já entrou. A marca é devolvida se a falha acontecer **antes** da
   entrada física; depois dela, não — creditar duas vezes é pior do que deixar a `QUARENTENA`
   daquele item por fazer. A coluna nasce com escritor **e** leitor: o leitor é o próprio `WHERE`
   do claim, que decide se o item entra.

### As cinco flags `controle_*`: duas acesas, três ainda mortas

A versão anterior desta spec corrigiu "são cinco flags mortas, não duas". A Etapa 6 acendeu duas
delas. Registrar quais continuam mortas é obrigatório aqui — acender duas e ficar em silêncio
sobre as outras três recriaria exatamente a confusão que esta spec existe para documentar.

| Flag | Estado | Onde é lida | Acende em |
|---|---|---|---|
| `controle_lote` | ✅ **acesa** (`2dbbf60`, alcance corrigido em 2026-08-10) | `stockService.registrarMovimentacao` — exige lote **onde o operador tem como informá-lo**: movimentação manual (v1/v2) e recebimento. Ver "O alcance REAL", acima | Etapa 6 |
| `controle_certificado` | ✅ **acesa** (`64686b1`, `c11db85`) | `receiptService.darEntradaEstoque` — lote sem certificado nasce `BLOQUEADO` | Etapa 6 |
| `controle_serie` | ❌ **morta** — gravada pelo CRUD, nunca lida | — | **Etapa 6b** (números de série) |
| `controle_validade` | ❌ **morta** — gravada pelo CRUD, nunca lida | — | sem etapa definida (ver nota abaixo) |
| `controle_corrida` | ❌ **morta** — gravada pelo CRUD, nunca lida | — | sem etapa definida (ver nota abaixo) |

> **Correção (fix round 1 da Task 9, 2026-08-09): a lista de arquivos abaixo estava incompleta.**
> O review verificou por grep e achou três arquivos fora do texto anterior — `routes/almoxarifado.js`
> tinha trechos além do range citado, `MaterialAlmoxarifadoForm.js` tinha mais dois blocos, e
> `server/tests/api/materialCompleto.api.test.js` não aparecia na lista, nem uma linha. Poucas
> linhas abaixo esta spec recomenda "apagar as duas colunas" (`controle_validade`/
> `controle_corrida`): quem seguisse a lista incompleta apagaria as colunas do schema e quebraria
> esse teste, que grava e lê as três flags de propósito.
>
> **Correção (review final do branch, 2026-08-10): os números de linha SAÍRAM.** A versão anterior
> desta lista citava `schemas.js:196-198` e `routes/almoxarifado.js:313,325,346` — linhas que, na
> data em que o review olhou, continham as flags **vivas**, não as três mortas (`schemas.js` já
> tinha deslocado para `198-200` no commit da própria Task 9). Isso é pior do que um número velho:
> a seção é uma **instrução destrutiva** ("apagar as duas colunas") apontando para o alvo errado.
> Ficam só arquivo e nome do símbolo — número de linha em spec envelhece entre dois commits, e
> quem for apagar tem de rodar o grep de novo, que é o comportamento certo.

As três mortas (`controle_serie`, `controle_validade`, `controle_corrida`) aparecem em:

| Arquivo | Onde procurar |
|---|---|
| `server/services/almoxarifado/schema.js` | lista `materialCols` (as três colunas `INTEGER DEFAULT 0`) |
| `server/services/almoxarifado/schemas.js` | `MaterialSchema` (as três como `FlagSchema`) |
| `server/routes/almoxarifado.js` | handlers de `POST /materiais` e `PUT /materiais/:id` (destructuring do body, lista de colunas do INSERT e do UPDATE) |
| `client/src/components/almoxarifado/MaterialAlmoxarifadoForm.js` | estado inicial do formulário, carga do material e os checkboxes da seção "Controles" |
| `server/tests/api/materialCompleto.api.test.js` | grava e lê as três de propósito — **quebra se as colunas forem apagadas sem tocar aqui** |

(Reverificado por grep em `server`/`client` — excluindo `client/build`, artefato gerado — em
2026-08-10.)

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

   > **Correção (fix round 1 da Task 9, 2026-08-09): esta nota não citava os dois leitores que a
   > remoção deixou órfãos.** `ExtratoMaterialModal.js` tinha uma tabela "Saldos por localização"
   > com colunas "Reservada"/"Bloqueada" lendo `s.quantidade_reservada`/`s.quantidade_bloqueada` —
   > como `consultarSaldosPorLocalizacao` (`stockService.js`) faz `SELECT s.*`, essas chaves
   > nunca chegavam ao cliente depois de `015e94c`, e as duas colunas mostravam **0 para sempre**,
   > em silêncio, desde a migração. Corrigido: as duas colunas **saíram** da tabela por localização
   > (fix round 1 da Task 9) — retenção não existe por localização, só por lote (status) ou por
   > material, e os cartões de KPI no topo do extrato já mostram a retenção certa, lida direto de
   > `materiais_almoxarifado`. Repetir esse total em toda linha de localização sugeriria que a
   > retenção é por localização, o que nunca foi verdade.
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
  > (`stockService.js` — sem número de linha de propósito, ver a nota da correção acima sobre
  > `a3afaa1`) devolve `lt.codigo as lote` via `LEFT JOIN`, ao lado de `lote_id`.

## Checklist

### Backend — lotes
- [x] Tabela `lotes_almoxarifado`: material, código do lote, fornecedor, corrida/heat number, certificado (anexo), data de fabricação, validade, status (ativo/bloqueado/reprovado) — **`b7035dd`** (+ `d6e36e9`: status inválido passou a ser recusado em vez de coagido para `ATIVO` em silêncio; + `556f86d`: as três colunas de liberação de vencimento; + review final do branch 2026-08-10: **data de fabricação ganhou escritor e leitor**, ver a correção abaixo)

  > ⚠️ **Correção (2026-08-10): este item ficou marcado `[x]` incluindo "data de fabricação" quando
  > `data_fabricacao` era uma coluna que NINGUÉM escrevia e NINGUÉM lia.** Nenhum chamador a passava
  > para `criarOuObterLote`, nenhuma tela a exibia, nenhuma consulta a lia — a Global Constraint 3
  > do próprio plano da Etapa 6 ("nunca crie coluna que ninguém escreve"), violada pela etapa que a
  > escreveu, e declarada aqui como entregue. **Agora está de fato entregue**, pelo caminho que
  > fecha o ciclo em vez de apagar a coluna: o item do recebimento ganhou `data_fabricacao_lote`
  > (o quarto campo de lote da tela, ao lado de Lote/Validade/Corrida), `darEntradaEstoque` o leva
  > para o lote, e a tela de Lotes mostra "Fabricado em …". Testes:
  > `data_fabricacao chega na listagem do lote` (`loteRotas.api.test.js`), `processar recebimento
  > cria o lote com dados da NF` (`loteRecebimento.api.test.js`) e dois casos em
  > `LotesAlmoxarifado.test.js`.

  > ⚠️ **Correção (2026-08-09): `VENCIDO` não é status.** Esta linha pedia
  > `ativo/bloqueado/reprovado/vencido`. Vencimento é **derivado** de `data_validade <
  > date('now')`, calculado na leitura. Gravar `VENCIDO` exigiria um cron para virar o status à
  > meia-noite e criaria um estado que diverge da data toda vez que o cron falhasse — mais uma
  > coluna mentindo, que é o problema que esta spec inteira documenta. Derivado não diverge.
  > **Implementado assim** (`lotService.isVencido`), e o teste `vencido e derivado da data, nao e
  > status gravado` (`lotes.api.test.js`) segura a decisão.
- [x] `estoque_saldo_almoxarifado.lote` passa a referenciar a tabela (migração dos textos existentes, **deduplicando as linhas `lote IS NULL`**) — **`015e94c`** (+ `b4e4858`: o teste "migração idempotente" era vazio — rodava sobre banco que já nascia na forma nova e saía pelo early-return; foi renomeado honestamente e um teste real do corpo da migração entrou no lugar)
- [x] **Saída não pode deixar a linha do lote negativa.** Guarda no `WHERE` do UPDATE, com `RETURNING` e compensação de `quantidade_atual` — **`65d78fd`**, mais cinco rodadas de review (`920d10c`, `f65758d`, `c2e31dc`, `1effd07`, `2d6fec5`)
- [x] Aplicar `controle_lote`: material controlado exige lote **onde o operador tem como informá-lo** — movimentação manual (rotas v1 e v2) e recebimento — **`2dbbf60`**, alcance corrigido no review final do branch (2026-08-10). `AJUSTE` puro é isento por tipo (regularização); `AJUSTE_POSITIVO`/`AJUSTE_NEGATIVO` **não** são. Os quatro fluxos internos são isentos e isso é **pendência (g)**, abaixo. Ver "O alcance REAL de `controle_lote`" — **esta linha dizia "em TODA entrada e saída", e essa redação descrevia um comportamento que travava a entrega e a devolução do material**
- [x] Aplicar `controle_certificado`: entrada sem certificado **entra bloqueada** (não falha — barrar a entrada foi o erro corrigido na Etapa 5); o `SELECT` morto em `receiptService` passou a ser usado de verdade — **`64686b1`** (+ `c11db85`: anexar certificado podia liberar um lote `REPROVADO` por corrida entre a leitura e a escrita; a pré-condição foi inteira para dentro do `WHERE` em `liberarBloqueioPorCertificado`)
- [x] Validade: bloquear saída de lote vencido; sugestão FEFO (primeiro que vence sai primeiro) — **`65d78fd`** (guarda), **`556f86d`** (liberação com justificativa — Task 3b, ver abaixo), **`8dfeb0c`** (ordem FEFO na API), **`9406bff`** (FEFO pré-selecionado na tela, como sugestão e não imposição)
- [ ] Rastreabilidade: consulta de tudo que aconteceu com um lote — **parcial, e o que falta é a consulta agregada.** Os dados existem e são consultáveis (`movimentacoes_almoxarifado.lote_id` desde `65d78fd`, `auditoria_log_almoxarifado` com `entidade='lote'` desde `b7035dd`, saldo por lote em `GET /materiais/:id/lotes` desde `8dfeb0c`), mas não há um "extrato do lote" que junte as três fontes como `GET /materiais/:id/extrato` faz para o material. A tela de lotes **já existe** desde a Task 9 (2026-08-09) — o que falta é só o extrato agregado dentro dela. **Fica para a Etapa 6b**, junto com a tela de série (ver Frontend)
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
- [x] Seleção de lote na movimentação de **saída** (inclusive **Sucata**/**Perda**, Task 9) — **`9406bff`** + **`09c75d2`**: `<select>` em ordem FEFO alimentado por `GET /materiais/:id/lotes?com_saldo=1`, primeiro elegível pré-selecionado, não elegíveis aparecem `disabled` com o motivo no rótulo (esconder faria o operador procurar material que o sistema decidiu não mostrar). Na **entrada** continua texto livre, que é onde o lote nasce. Série fica para a 6b
- [x] **Cadastro/consulta de lotes no detalhe do material** — **entregue na Task 9** (`09c75d2`, 2026-08-09):
  `client/src/components/almoxarifado/LotesAlmoxarifado.js`, rota `/almoxarifado/lotes`. Escolhe o
  material, lista os lotes dele (ordem da API preservada, não elegível continua aparecendo no fim),
  e oferece mudar status, liberar vencimento (só para lote vencido) e anexar certificado (libera
  sozinho o lote que estava bloqueado por falta dele). Ver pendência (a), abaixo, para o que ainda
  falta (extrato agregado do lote)
- [ ] Seleção de série na movimentação, separação e entrega — **Etapa 6b**
- [ ] Botão imprimir etiqueta (recebimento, material, localização) — **Etapa 6c**

## Pendências abertas depois da Etapa 6

### (a) Três rotas de lote existiam e nenhuma tela as chamava — **RESOLVIDO na Task 9 (2026-08-09)**

> **Status: RESOLVIDO.** `PUT /lotes/:id/status`, `PUT /lotes/:id/liberar-vencimento` e
> `POST /lotes/:id/certificado` agora têm consumidor:
> `client/src/components/almoxarifado/LotesAlmoxarifado.js` (rota `/almoxarifado/lotes`, também
> no menu do módulo). O texto abaixo é o registro do problema como ele existia até a Task 9 — a
> lacuna que motivou a task, mantida por não apagar em silêncio o que a spec já tinha afirmado.

`PUT /lotes/:id/status`, `PUT /lotes/:id/liberar-vencimento` e `POST /lotes/:id/certificado` foram
entregues com permissão, justificativa obrigatória e auditoria — e **não havia nenhum componente no
cliente que as consumisse** (verificado por grep em `client/src` em 2026-08-09: a única rota de lote
usada pelo front era o `GET` da listagem FEFO, dentro de `MovimentacoesAlmoxarifado.js`).

Consequência concreta que existia: a mensagem de erro que o operador via ao tentar consumir um lote
vencido dizia *"Libere o vencimento do lote (PUT /api/almoxarifado/lotes/:id/liberar-vencimento) com
justificativa"* — uma instrução de API para quem só tem um navegador. Era a mesma classe de
problema que a Task 3b nasceu para consertar, um nível acima: antes o caminho não existia; passou a
existir, mas só por `curl`. Bloquear, reprovar, liberar vencimento e anexar certificado depois do
recebimento eram, até a Task 9, operações sem interface — e o caso mais grave era
`controle_certificado`: com a flag ligada, o lote nascia `BLOQUEADO` e só um desenvolvedor por API
destravava, inutilizando o material pela interface.

A Task 9 entregou a tela (`LotesAlmoxarifado.js`) com as três ações. **O que ainda falta** — não
fazia parte do escopo da Task 9 — é o "extrato do lote" agregado (movimentações + auditoria + saldo
numa consulta só, como `GET /materiais/:id/extrato` faz para o material); continua registrado no
checklist de rastreabilidade acima e é candidato natural para a Etapa 6b absorver junto com a tela
de série (ver o plano da Etapa 6, seção "Dívidas da Etapa 6 que a 6b deveria absorver").

### (b) A conclusão de inventário escreve `quantidade_atual` por fora do motor

`PUT /api/almoxarifado/conferencias/:id/concluir` com `aplicar_ajustes` (handler dessa rota em
`server/routes/almoxarifado.js` — sem número de linha de propósito: esta spec já citou `~868` e
depois `894`/`917`, e o `UPDATE` andou de novo no review final; procure pela rota e por
`UPDATE materiais_almoxarifado SET quantidade_atual`) grava o total direto e **nunca toca em
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

`routes/almoxarifado.js` registra `express.static(uploadsAlmoxDir)` em
`/api/uploads/almoxarifado` e `/uploads/almoxarifado`, **antes** de
`app.use('/api/almoxarifado', ...almoxMiddleware)` e fora do prefixo que ele protege — procure
pelos dois registros no topo do arquivo.
A Etapa 6 passou a colocar **certificados de fornecedor** nesse diretório.

**Não é regressão:** é o mesmo tratamento que as fotos de material já tinham. Mas certificado é
documento mais sensível que foto de prateleira, e quem souber o nome do arquivo baixa sem
autenticar. **Aguardando decisão do cliente** sobre servir por rota autenticada.

### (e) Reprovar um lote pela inspeção ainda não está ligado

A Etapa 6 entrega o status `REPROVADO` no lote e a rota que o muda, mas
`inspectionService.decidirInspecao` continua bloqueando o **material inteiro**, sem tocar no lote.
Ligar os dois é mudança na feature 09 — registrado em
[09-inspecao-qualidade](../09-inspecao-qualidade/README.md).

### (f) Colunas com escritor real e **nenhum leitor** — quatro, não uma

Anotadas aqui porque é literalmente o padrão que esta spec existe para caçar. A diferença para uma
coluna morta é que aqui o **escritor existe**, o que as torna dado real e não coluna mentindo — mas
quem auditar por `grep` vai achar o `INSERT`/`UPDATE` e concluir, errado, que existe consulta.
**Não existe.** Verificado por grep em `server`/`client` em 2026-08-10.

| Coluna | Quem escreve | Leitor |
|---|---|---|
| `recebimentos_material_itens_almoxarifado.lote_id` | `receiptService.darEntradaEstoque`, logo depois de criar o lote | nenhum |
| `lotes_almoxarifado.observacoes` | `criarOuObterLote` (e a migração da Task 2, que marca lote convertido de texto livre) | nenhum — nem a tela de Lotes, nem a listagem FEFO a usa |
| `lotes_almoxarifado.recebimento_item_id` | `criarOuObterLote`, a partir do item do recebimento | nenhum (`recebimento_id` também não tem consulta própria, só aparece no `SELECT l.*`) |
| `lotes_almoxarifado.fornecedor_id` | `criarOuObterLote`, herdado de `rec.fornecedor_id` | nenhum — a tela mostra `fornecedor_nome`, que é texto |

As quatro são o material da consulta de rastreabilidade que falta (pendência (a)): "tudo que
aconteceu com o lote X" e "de qual item de qual nota este lote veio" se respondem exatamente com
elas. Enquanto essa consulta não existir, elas continuam sendo dado gravado e nunca lido —
registrado, não escondido.

### (g) Quatro fluxos internos são ISENTOS da exigência de `controle_lote` — decisão do cliente, não lacuna esquecida

Decidido pelo cliente em 2026-08-10, no review final do branch. Estes quatro chamam
`stockService.registrarMovimentacao` **sem declarar `exigeLote`**, porque não têm de onde tirar um
lote — não existe campo na tela nem parâmetro na chamada:

| Fluxo | Arquivo | Tipo de movimento | O que acontece hoje |
|---|---|---|---|
| Entrega de requisição | `requisitionService.entregarRequisicao` | `SAIDA` | baixa sem lote; a linha de saldo debitada é a `(localização resolvida, lote NULL)` |
| Exclusão administrativa de requisição | `requisitionService.excluirRequisicao` | `ENTRADA` (estorno) | devolve sem lote — não volta para o lote de onde saiu |
| Devolução para estoque/quarentena | `returnService.registrarDevolucao` | `ENTRADA_DEVOLUCAO` | idem: entra sem lote |
| Descarte de devolução | `returnService.registrarDevolucao` | `SUCATA` | baixa sem lote |

**Consequência concreta de deixar assim:** num material com `controle_lote` ligado, o saldo
movimentado por esses caminhos fica na linha "sem lote" e **não** aparece no saldo de nenhum lote —
a tela de Lotes some com essa parte, e o seletor FEFO da saída também. Não há perda de saldo: o
total do material continua correto, e a soma das linhas continua batendo. O que se perde é a
**rastreabilidade por lote** nesses quatro caminhos.

**O conteúdo natural da etapa seguinte** é dar lote automaticamente a eles, e o desenho já está
claro: **FEFO na entrega** (a requisição escolhe o lote que vence primeiro, como o seletor da tela
já sugere — ou o operador escolhe na tela de separação, que ainda não tem campo de lote) e
**herdar da saída original na devolução** (a devolução cita a OS/projeto; a movimentação de saída
correspondente já guarda `lote_id` no ledger). Enquanto isso não existir, deixar a guarda ligada
nesses caminhos seria travar operação — foi exatamente o defeito corrigido.

**Não confundir com a rota v1**: o modal rápido da tela de Materiais também não carrega lote no
contrato, mas **continua exigindo** — ali o operador tem uma porta (a tela de Movimentações, que
tem o campo). Os quatro acima não têm porta nenhuma.

## Regras essenciais + testes de API exigidos

| Regra | Teste | Estado |
|-------|-------|--------|
| Material com `controle_lote` exige lote na movimentação **manual** (v1 e v2) e no recebimento | `[rota v2] entrada sem lote…` / `[rota v2] saida sem lote…` / `[rota v1] o modal rapido…` / `[recebimento] nota com item sem lote…` — `loteControleObrigatorio.api.test.js` | ✅ `2dbbf60` + review final |
| O corpo da requisição **não** desliga a exigência (`exigeLote` não vem do body) | `[rota v2] o corpo nao consegue desligar a exigencia` — mesmo arquivo | ✅ review final |
| Os quatro fluxos internos passam **sem** lote em material controlado | `[requisicao] entrega…` / `[requisicao] exclusao administrativa…` / `[devolucao] ENTRADA_DEVOLUCAO…` / `[devolucao] SUCATA…` — mesmo arquivo | ✅ review final |
| Saída consome o saldo **agregado** do lote, mesmo endereçado em outra localização | `saida consome o saldo do LOTE inteiro, mesmo endereçado em outra localizacao` + `saida acima do saldo AGREGADO do lote falha, com o numero que a tela mostra` — `loteGuardasSaida.api.test.js` | ✅ review final |
| Saída recusada por lote não deixa linha zerada, e material legado continua no no-op do estorno | `saida recusada por lote NAO deixa linha zerada para tras` + `material legado continua no no-op do estorno depois de uma saida RECUSADA` — mesmo arquivo | ✅ review final |
| Estorno de ENTRADA não negativa a linha do lote | `estorno de ENTRADA nao pode negativar a linha do lote (o -8 na direcao inversa)` + `…passa quando a linha comporta a reversao` + `material que permite negativo continua podendo negativar…` — mesmo arquivo | ✅ review final |
| Nota com item inválido é recusada inteira; reprocessar não duplica | `nota com um item invalido e recusada INTEIRA…` + `A entra e B falha: reprocessar entra so o B, e o A continua em 10 (nao 20)` — `recebimentoEntradaAtomica.api.test.js` | ✅ review final |
| `?com_saldo=1` esconde lote sem saldo (é o parâmetro que a tela de Movimentação usa) | `?com_saldo=1 esconde lote sem saldo e mantem quem tem` — `loteRotas.api.test.js` | ✅ review final |
| `data_fabricacao` é gravada pelo recebimento e devolvida pela listagem | `data_fabricacao chega na listagem do lote` — `loteRotas.api.test.js` | ✅ review final |
| Reanexar certificado não deixa arquivo órfão | `reanexar o certificado apaga o arquivo anterior (sem orfao em uploads)` — `loteRecebimento.api.test.js` | ✅ review final |
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
