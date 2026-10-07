# Etapa 37 — Recebimento contra o pedido: parcial, excedente e os 21 ALTER que não faziam nada: implementação

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` para
> executar este plano task a task. Os passos usam checkbox (`- [ ]`). Antes da primeira task, leia
> `.superpowers/sdd/etapa37-fase0-candidatos.md` (a Fase 0 **comparativa**, com quatro sondas
> **executadas**) e o design abaixo. **Onde a medição e este plano divergirem, vale a medição** — e
> onde este plano decidiu contra a proposta do controlador, está dito, com o motivo e o descartado,
> na seção "Decisões desta etapa" do design.

**Goal:** fazer o **pedido de compra saber que foi recebido**. Hoje `itens_pedido_compra` tem 8
colunas, **1 leitor e 0 escritores**: um pedido de 10 unidades recebeu **25 em três recebimentos e
continuou `ABERTO` com `quantidade = 10`** (sonda executada); a terceira porta de escrita
(`POST /recebimentos`) aceita **999 de 10 com 201**, porque a barreira da Etapa 36 compara com a
linha **já gravada** e é inalcançável ali por construção; e **recebimento parcial é impossível pela
tela**, que limpa `itens: []` ao escolher o pedido — enquanto o manual 14.1 promete ao operador que
"o sistema traz os itens, as quantidades e os valores unitários já preenchidos". No fim, o galho de
risco zero: apagar os **21 `ALTER TABLE`** mortos de `routes/almoxarifado.js:1775-1796` e corrigir a
spec 00 **dizendo que ela estava errada**.

**Architecture:** duas colunas **aditivas** por `safeAlter` (`itens_pedido_compra.quantidade_recebida`
e `recebimentos_material_itens_almoxarifado.pedido_item_id`) mais índice em `pedido_id`; a régua de
**saldo** na porta `POST`, reusando **a metade decisória** da barreira da Etapa 36
(`assertAutorizacaoExcedente`: flag + `can()` + o **mesmo** 403) com 400 próprio; o **acumulador**
dentro do claim `entrada_estoque_em IS NULL` de `darEntradaEstoque` — que cobre os **dois** caminhos
de entrada (`processarNota` **e** `aprovarRecebimento`) e herda a idempotência de graça; a situação
do pedido (`ABERTO`/`PARCIAL`/`RECEBIDO`) **derivada na leitura**, sem escrever na tabela **core**
`pedidos_compra`; e, no client, o `<select>` de pedido passando a **carregar os itens com o saldo**,
editáveis.

**Tech Stack:** Express + SQLite (`server/`), Zod **4.4.3** (`z.looseObject` — `looseObject` deixa
`pedido_item_id` e `autorizar_excedente` passarem sem declaração); React CRA (`client/`), testes com
`createRoot` + `act` — ⚠️ `@testing-library/react` **não está instalado** nesta base.

> ⚠️ **(Fase 2) Este plano foi escrito ANTES da onda de correção da revisão final da Etapa 36, e
> quatro coisas que ele congela mudaram no código. Confira contra o código de HOJE
> (`git log --oneline -8`) antes de cada task:**
> 1. **(correção pós-onda da 36) A régua de excedente das duas portas da 36** é *"recebida >
>    esperada **E** recebida > quantidade JÁ ARMAZENADA"*. Em `aa39155` isso não existia; em
>    `230baf6` chegou a existir como `opcoes.ignorarInalteradas`, passado só pelo `/fiscal` — mas
>    esse flag foi **deletado** em `2d7787d` (revisão final R2). A regra hoje mora **dentro** de
>    `assertExcedentePermitido` (`receiptService.js`, em torno de `aumenta`/`gravada`) e vale nas
>    **duas** portas por construção, sem flag nenhum a passar. `grep -rn ignorarInalteradas server/`
>    dá **vazio**. **Esta etapa depende disso** — ver o achado (2) da seção da Fase 2 no fim deste
>    plano (a nota do achado ficou velha; a correção está anexada a ela).
> 2. **A literal do 400 da 36** deixa de dizer *"marque a autorização de excedente para registrar"*
>    e passa a **nomear quem autoriza** (achado F3). O 400 novo desta etapa **copia o sufixo do
>    código pós-onda** — ver o contrato 1.
> 3. **Os schemas Zod do recebimento MUDAM** (achado R6): o `POST` ganha schema dos **itens**
>    (`quantidade` e `quantidade_esperada` numéricas e positivas). A frase "os schemas da Etapa 36
>    não mudam" que estava aqui **estava errada** e teria feito a T5 mandar um payload recusado.
> 4. **A guarda de NF** passa a comparar fornecedor **em JS, por qualquer perna** (R3/R4). Não muda
>    a assinatura que `criarRecebimento` chama, mas a T2 roda `recebimentoNfDuplicada` por isso.

**Spec:** `docs/superpowers/specs/2026-09-16-almoxarifado-etapa37-recebimento-contra-pedido-design.md`
— leia junto; as **RN-20 a RN-27**, as **15 decisões** (com o descartado) e os **14 riscos** estão lá
(**(Fase 2)**: 12 + 3 decisões e 12 + 2 riscos acrescentados pela revisão do plano).

---

## Global Constraints

- **Autorização em duas camadas, e o backend decide.** `checkModulePermission('almoxarifado')` abre
  as telas (`routes/almoxarifado.js:282-285`); `ACAO_PERFIS` + `requirePermission` autoriza agir
  (`permissions.js`); `getPerfilFromUser` faz fallback para **`PRODUCAO`**. `validate(...)` entra
  **depois** do `requirePermission` — 403 antes de 400.
  `GET /almoxarifado/minhas-permissoes` existe **só** para a UI barrar antes do formulário e **falha
  aberto de propósito**: nenhuma decisão de segurança desta etapa mora no client.
- **`autorizar_excedente = [ADMINISTRADOR, COMPRAS]` NÃO MUDA nesta etapa.** A ação foi criada na
  Etapa 36 e o GESTOR saiu dela por **medição** (não tem `receber_material`, logo não tem porta).
  Esta etapa **reusa** a ação; não acrescenta ação nenhuma, o que também significa que ela **não
  toca** `client/src/utils/permissaoErro.js` nem `auditLabels.js` — os rótulos do verbo
  `EXCEDENTE_AUTORIZADO` e da entidade `recebimento_item` **já existem** (a Etapa 36 os pagou).
- **Almoxarifado é área física, não filial.** Saldo global por material é correto e intencional.
  `saldo` aqui é **saldo do pedido de compra**, nunca saldo por almoxarifado — não confundir as duas
  palavras no código nem nos documentos.
- **`pedidos_compra` é tabela CORE** (`server/index.js:19230-19242`, vocabulário de status
  **minúsculo** e badge por mapa de cores em `client/src/components/Compras.js:96-108`). **Nenhuma
  linha desta etapa escreve nela.** Quem quiser mudar isso mede o efeito na tela de Compras primeiro.
- **Testes de servidor só em `server/tests/api/*.api.test.js`** — o runner descobre **apenas** esse
  padrão. Cada arquivo tem **runner próprio** (`test()`, contador `passed`/`failed`, `process.exit`),
  harness `server/tests/helpers/testApp.js` com `requirePermission` **REAL** (`setUser` com usuário
  sem perfil → **403**).
- **Validação é Zod**, via `validate()` de `services/almoxarifado/validation.js`, que **substitui
  `req.body` por `parsed.data`**. Os dois schemas de recebimento são `z.looseObject` — campo novo no
  payload **não** precisa ser declarado, e **não** pode ser declarado com `z.object`, que descartaria
  `nota_fiscal`/`itens` e derrubaria todo `POST` válido (medido na Etapa 36).
  ⚠️ **(Fase 2)** A onda da 36 acrescenta ao `RecebimentoCreateSchema` um schema **dos itens**
  (`schemas.js:767`, achado R6: `z.coerce.number().positive()` em `quantidade` e
  `quantidade_esperada`). **Antes da T5, leia esse schema** e confirme que os dois campos são
  `.optional()` e que o item é `looseObject`: o payload do caminho do pedido que a T5 monta **não
  leva `quantidade_esperada`** (a esperada nasce do saldo, no servidor), e um `.positive()`
  obrigatório ali faria **todo recebimento por pedido feito pela tela** responder 400 na validação,
  antes de chegar ao serviço. Se o schema tiver ficado obrigatório, o conserto é `.optional()` **no
  schema**, não mandar a chave pelo client. A T2 tem cenário para isso — (11).
- **O comando de teste do client leva CAMINHO, não `-t`.** `-t` é `--testNamePattern` e devolve
  `N skipped, exit 0`. Use
  `cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/RecebimentosAlmoxarifado.test.js`.
- **Português com acento** no código, nos comentários, nas mensagens de tela e nas literais de erro;
  **sem acento no corpo do commit**.
- **Nunca `git add -A` na raiz** — há artefatos de runtime em `server/data/` e `server/uploads/`. Na
  árvore de abertura desta etapa há também `server/data/database.sqlite.bak`, `server/nodemon.json` e
  `docs/bkp_bancoprod.md` **não versionados**: `git add` só dos caminhos que a task tocou.
- **Um commit por assunto**, em português, explicando **por quê**: qual era o bug, qual a
  consequência, o que foi decidido e o que foi descartado.
- **Nenhum commit com a suíte vermelha.** As rodadas RED existem para **ler o número**, e o commit é
  da task que leva teste + conserto juntos.
- ⚠️ **Harness de sabotagem nesta máquina — regras aprendidas por falha:**
  - **`python3` NÃO existe no Git Bash desta máquina.** É o alias da Microsoft Store, que imprime
    *"Python was not found…"* e **não executa nada** — no-op silencioso. Use **`perl -0pi -e`**
    (`/usr/bin/perl` existe) ou **`sed`**. Se for usar interpretador, `command -v` + uma execução
    trivial (`perl -e 'print 1'`) **antes** da sabotagem.
  - **NUNCA restaure com `git checkout -- <arquivo>`** enquanto houver conserto ainda não commitado
    nesse arquivo: as sabotagens rodam **antes** do commit da task, então o `checkout` descarta a
    sabotagem **e o conserto** juntos — e o `git diff --stat` vazio, que a regra manda exigir, passa
    a ser **erro**, não sucesso. Restaure por **perl inverso** ou por **cópia de segurança no
    scratchpad**, e confira que o `md5sum` volta ao valor **pós-conserto**, não ao de HEAD.
  - Antes de cada sabotagem: `grep -cF '<ancora>' arquivo` **tem de dar exatamente 1**. Se der 0 ou
    mais de 1, **aborte** e escolha outra âncora.
  - ⚠️ **A âncora é contada DEPOIS do conserto, não no HEAD.** Contado com `grep -cF` no HEAD
    `aa39155`, e o que cada uma passa a valer: `quantidade_recebida = COALESCE(quantidade_recebida, 0) + ?`
    em `receiptService.js` = **0** hoje e **1** depois da T3; `assertAutorizacaoExcedente(` = **0**
    hoje e **3** depois da T2 (definição + a chamada de `assertExcedentePermitido` + a chamada de
    `criarRecebimento`); `situacao_recebimento` em `receiptService.js` = **0** hoje e **≥3** depois
    da T4; `pedido_item_id` em `receiptService.js` = **0** hoje e **≥4** depois da T2+T3;
    `saldo do pedido` = **0** hoje e **1** depois da T2. Onde a contagem passar de 1, a âncora é o
    **bloco ancorado** que a tabela da task dá — não o token solto.
  - `md5sum` **antes**, **depois da sabotagem** e **depois de restaurar**; `git diff --stat` tem de
    voltar com **só** os arquivos da task.
  - **Leia QUAL asserção caiu, não só o placar.** Se a asserção que guarda o achado não caiu, o
    controle **não valeu**: acrescente a sabotagem que a atinge, não troque por outra que funcione.
  - **Sabotagem que não derruba nada é um achado**, não um detalhe — e há dois motivos opostos:
    *falta asserção* (escreva o cenário) ou *o defeito virou inalcançável* (mantenha a forma segura e
    **declare** que a suíte não a protege).
- **Scratchpad com nome único por agente** (`msg-<assunto>.txt`, `bkp-<arquivo>-<task>`): o diretório
  é compartilhado, e na Etapa 25 um executor sobrescreveu a mensagem de commit do outro.

---

## ⚠️ O modo de falha desta etapa: o número que ninguém lê

A Etapa 36 tinha o risco do **verde vazio em regra nova**. Esta tem outro: **contador que soma no
lugar errado**. Cinco modos, todos medidos ou nomeados por regra da `fechar-etapa`:

1. **O acumulador pode morar no lugar errado com a suíte inteira verde.** `aprovarRecebimento` chama
   `darEntradaEstoque` **direto** (ramo `APROVADO`, com rota `POST /recebimentos/:id/aprovar` e teste
   que a exercita: `solicitacaoCicloVida.api.test.js:88`). Um `UPDATE` dentro de `processarNota`
   deixaria esse caminho creditando estoque **sem contar ao pedido**, e **nenhum teste de hoje
   pegaria** — nenhum deles olha `itens_pedido_compra` depois de processar (medido: a tabela tem
   `INSERT` em 4 arquivos de teste e **zero** `SELECT`). A régua é a metade da RN-22 que entra pelo
   `aprovar`.
2. **Somar duas vezes é o defeito clássico desta função, e ela já o pagou uma vez.** O comentário de
   `darEntradaEstoque` conta a reprodução: "1ª tentativa entrou 10 do A e falhou no B; corrigido o B,
   a 2ª entrou MAIS 10 do A (total 20)". O acumulador **tem** de viver dentro do claim
   `WHERE entrada_estoque_em IS NULL`; a asserção que mede é *"reprocessar → continua 6, não 12"*.
3. **`COUNT` de 0 contra 0 passa.** A régua do saldo é um número lido de `itens_pedido_compra` —
   se o teste não **inserir** a linha do pedido, tudo é `undefined`/`0` dos dois lados e o cenário
   passa antes e depois do conserto. Todo cenário desta etapa **lê a linha do pedido pelo id que o
   `INSERT` devolveu** e afirma o valor, nunca "não deu erro".
4. **Asserção negativa de permissão NÃO fica vermelha na rodada TDD.** `can()` devolve `false` para
   ação que não conhece. O 403 do ALMOXARIFE passaria verde mesmo sem barreira: a prova é o **par no
   mesmo `test()`** — 403 do ALMOXARIFE **e 201 do COMPRAS**.
5. **`toast` é mockado no client** (`RecebimentosAlmoxarifado.test.js:43-48`) — toda asserção é sobre
   o **DOM** ou sobre `api.post`/`api.get`, nunca sobre o toast. E o `api.get` do mock **rejeita** por
   padrão URL desconhecida: a rota nova de itens do pedido **tem de entrar no `mockImplementation`**
   do `beforeEach`, senão o cenário mede o `catch` da tela.

### Quatro regras herdadas, e valem para TODAS as tasks

**(i) Metade positiva dentro de cada cenário negativo.** "Recusa com 400" passa se a rota recusar
tudo; "não mostra o aviso" passa com a tela vazia. Toda recusa vem acompanhada do caso que **tem** de
passar (`recebida === saldo` → 201, `recebida < saldo` → 201, o 201 do COMPRAS, o pedido sem itens
aparecendo com `?pendentes=1`).

**(ii) Conte as chamadas, não use `toHaveBeenCalledWith` solto.** Ele é satisfeito por 1, 2 ou 10.
Asserção de chamada é `api.post.mock.calls.filter(...)` + `toHaveLength(n)`, e o **payload** é lido de
`api.post.mock.calls[0][1]`.

**(iii) Nenhum id de fixture `1`, nem o primeiro da lista.** No client, o pedido da fixture é
`77`/`78` (os recebimentos já usam `41`/`58`/`77`/`91`; **o pedido usa `312`/`313`** para não
colidir com id de recebimento na leitura do teste). No servidor, ids vêm do banco em memória — nos
cenários que citam id/número na mensagem, **leia do `INSERT`**, nunca escreva `1`; usuários de teste
`64`/`65`/`66` (`ADMIN`/`ALMOXARIFE`/`COMPRAS`), como em `recebimentoExcedente.api.test.js`.

**(iv) Sabotagem que derruba a suíte por `TypeError` não é controle positivo.** Se o arquivo quebra
no carregamento, **todos** os cenários caem juntos e nenhum provou nada. Prefira **alterar a
literal**, **inverter o comparador** ou **mover a chamada de lugar** — as três produzem vermelho
específico e legível.

---

## Contratos de API congelados

Front e back andam por estes. **Mensagem literal entre aspas é a que vai no código e no manual** —
não aproximar, não reescrever.

### 1. `POST /api/almoxarifado/recebimentos` — `extended.js:975`

| | |
|---|---|
| **Gate** | `auth` + `checkModulePermission('almoxarifado')` + `requirePermission('receber_material')` → `[ADMINISTRADOR, ALMOXARIFE, COMPRAS]` (inalterado) |
| **Validação** | `validate(RecebimentoCreateSchema)` (inalterada — `looseObject`, os campos novos passam sem declaração) |
| **Payload — campos NOVOS** | `autorizar_excedente?: boolean` (documento) e `itens[].pedido_item_id?: number` (por item) |
| **Comportamento novo (só quando o tipo efetivo é `PEDIDO_COMPRA` e o pedido resolve)** | saldo por linha = `quantidade - COALESCE(quantidade_recebida, 0)`; `quantidade_esperada` do item **nasce do saldo**, não do payload; régua de excedente pelo **saldo agregado por material** |
| **201** | `{ id, numero, status: 'RECEBIDO' }` (inalterado) |
| **400 (excedente sem flag)** | `{ error: 'Quantidade recebida (<recebidaTotal>) maior que o saldo do pedido (<saldoMaterial>) para o material <codigo> — <SUFIXO> }` · `<codigo>` = `material_codigo` da linha, senão `itens_pedido_compra.codigo`, senão `#<material_id>` · ⚠️ **(Fase 2) `<SUFIXO>` é copiado LITERALMENTE do 400 de `assertExcedentePermitido` depois da onda da 36** (achado F3: deixou de ser "marque a autorização de excedente para registrar" e passou a nomear quem autoriza). As duas portas têm de dizer a **mesma** instrução ao operador; o plano não pode congelar aqui um texto que a 36 acabou de trocar. Leia o código no Step 3 da T2, copie, e escreva a literal final **nesta linha** antes de commitar a T2 · ✅ **FEITO na T2 (`57ace18`), literal final:** `Quantidade recebida (6) maior que o saldo do pedido (4) para o material ALM-0100 — a autorização de excedente é de Compras ou do Administrador`. O `<SUFIXO>` virou a constante `SUFIXO_AUTORIZACAO_EXCEDENTE` em `receiptService.js`, compartilhada com o 400 da Etapa 36 — escrito de novo aqui, o F3 se repetiria |
| **403 (flag sem permissão)** | `{ error: 'Autorizar recebimento acima do pedido exige a permissão "autorizar_excedente" (seu perfil: <PERFIL>).' }` — **a MESMA literal do `/conferir` e do `/fiscal`**, de `assertAutorizacaoExcedente` (conferida no código: `receiptService.js:308-310`) |
| **400 (pedido com linhas, todas sem saldo — `POST` sem `itens`)** | `{ error: 'Pedido de compra <numero> já foi recebido por completo' }` |
| **400 (pedido SEM nenhuma linha lançada — `POST` sem `itens`)** | ⚠️ **(Fase 2) caso NOVO, que o plano tratava junto com o de cima e mentiria ao operador:** `{ error: 'Pedido de compra <numero> não tem itens lançados no módulo Compras' }`. Um pedido cujo Compras ainda **não lançou** as linhas tem `COUNT(itens_pedido_compra) = 0` — nenhuma linha "com saldo" — e cairia em *"já foi recebido por completo"*, que é **falso**. E ele é justamente o pedido que a RN-24 manda **manter visível** em `?pendentes=1` (`ABERTO`): a tela o oferece e a porta o recusa com uma mentira. Duas contagens diferentes, duas literais diferentes |
| **400 (sem item)** | `{ error: 'Inclua ao menos um item' }` (inalterado — continua sendo a recusa do caminho NF, **e só dele**: no caminho do pedido as duas literais acima o substituem) |
| **400 (pedido inexistente)** | `{ error: 'Pedido de compra não encontrado' }` (inalterado) |
| **Garantia** | as três recusas acima acontecem **antes** de qualquer `INSERT` → `COUNT(recebimentos_material_almoxarifado)` não muda |
| **Trilha** | com a flag e a permissão: **uma linha por item excedente**, `acao: 'EXCEDENTE_AUTORIZADO'`, `entidade: 'recebimento_item'`, `entidade_id` = id do item **recém-inserido**, `dados_anteriores: { saldo_pedido }`, `dados_novos: { quantidade_recebida }`. Os rótulos **já existem** (Etapa 36) |

**(Fase 2) O que a régua do `POST` NÃO alcança, e tem de estar escrito antes de alguém executar:**
o saldo lido é `quantidade - COALESCE(quantidade_recebida, 0)`, e `quantidade_recebida` só se move na
**entrada física** (decisão 5). Então **dois recebimentos de 10 criados contra o mesmo pedido de 10,
antes de qualquer um processar, respondem 201 os dois** — o segundo não tem como estourar, porque no
momento da criação o saldo ainda é 10. Processando os dois, a linha do pedido termina com
`quantidade_recebida = 20` e situação `RECEBIDO`, **e o 400 nunca aparece em lugar nenhum**. Isso
**não** é a corrida de `check-then-insert` já declarada (dois `POST` simultâneos): é **sequencial e
inerente ao desenho**, e é o mesmo mecanismo que faz a RN-23 funcionar ("criado e não processado não
consome saldo"). Consequências obrigatórias: (a) vai para a letra **G** e para o "NÃO cobre" do
design, não para "corrigido"; (b) os cenários que exigem saldo consumido **processam** o recebimento
anterior — nunca só o criam; (c) fechar esse furo exigiria contar também o **reservado em documento
aberto**, o que muda o significado de "saldo" e é etapa própria.

**Resolução da linha do pedido (o servidor decide, nunca o payload):** `pedido_item_id` do payload é
aceito **se e só se** pertencer ao pedido resolvido; senão, a linha do mesmo `material_id` com **menor
`id` e saldo > 0**; senão, a linha do mesmo material com menor `id`; sem linha, o item **mantém as
quantidades do payload e não tem régua de saldo** (decisão 9 do design). **Um `pedido_item_id`
forjado não contorna a barreira**, porque a régua é o saldo **agregado por material**.

### 2. `GET /api/almoxarifado/recebimentos-aux/pedidos-compra` — `extended.js:1116`

| | |
|---|---|
| **Gate** | `auth` + camada do módulo (as rotas `-aux` **não** têm `requirePermission` — medido, não suposto) |
| **Gate (conferido, Fase 2)** | `app.use('/api/almoxarifado', authenticateToken, checkModulePermission('almoxarifado'))` em `routes/almoxarifado.js:282-285` cobre **também** as `-aux` — a camada do módulo existe; o que falta nelas é o `requirePermission` |
| **Query** | `search?` (inalterado) + **`pendentes?`** (`'1'`/`'true'` → só `situacao_recebimento <> 'RECEBIDO'`). ⚠️ **(Fase 2) o filtro roda no SQL, ANTES do `LIMIT 50`** — não em `.filter()` sobre o resultado. `listarPedidosCompraAux` termina em `ORDER BY p.created_at DESC LIMIT 50` (`receiptService.js:967`): filtrar depois aplicaria a régua **aos 50 mais novos**, e num banco onde os 50 mais novos estejam quitados `?pendentes=1` devolveria **`[]` com pedidos abertos existindo** — a tela ficaria sem o pedido que o operador precisa receber. A cláusula é a **negação** da derivação, escrita no `WHERE` da query: `(soma_recebida IS NULL OR soma_recebida = 0 OR total_pedido = 0 OR soma_recebida < total_pedido)`. Cenário próprio na T4 — (6) |
| **200 — campos NOVOS por linha** | `quantidade_pedida`, `quantidade_recebida`, `saldo_pendente`, `situacao_recebimento: 'ABERTO' \| 'PARCIAL' \| 'RECEBIDO'` |
| **Derivação** | `ABERTO` se `quantidade_recebida === 0` (inclui pedido **sem itens**); `PARCIAL` se `0 < recebida < pedida`; `RECEBIDO` se `pedida > 0 && recebida >= pedida`. Função **única**, consumida por esta rota e pela de itens |
| **`saldo_pendente` (Fase 2)** | `Math.max(0, pedida - recebida)` — **nunca negativo**. O design **declara** que uma linha pode terminar com `recebida > quantidade` (excedente autorizado, ou duas linhas do mesmo material dividindo um recebimento pela régua agregada); sem o clamp a rota devolveria `saldo_pendente: -2`, a tela mostraria `Saldo pendente: -2` e a asserção da RN-24 (`saldo_pendente: 0` no pedido completado) **seria falsa exatamente no caso que a etapa acabou de criar**. Mesmo clamp na rota de itens |
| **Ordem** | `ORDER BY p.created_at DESC LIMIT 50` (inalterado) |

### 3. `GET /api/almoxarifado/recebimentos-aux/pedidos-compra/:id/itens` — **rota NOVA**

| | |
|---|---|
| **Gate** | idem acima (só `auth` + camada do módulo) |
| **200** | `[{ id, material_id, material_nome, material_codigo, codigo, descricao, unidade, quantidade, quantidade_recebida, saldo_pendente, valor_unitario }]` — `id` é o **id da linha do pedido** (`itens_pedido_compra.id`), que é o `pedido_item_id` que o client devolve no `POST` |
| **Filtro declarado** | linha **sem `material_id`** não sai (mesmo filtro de `carregarItensPedidoCompra`: sem material não há o que dar entrada no estoque) |
| **404** | `{ error: 'Pedido de compra não encontrado' }` — a **mesma** literal do `POST` |
| **Pedido quitado** | **200 com `[]`** (não é erro: é a informação de que não há o que receber) |
| **Quem filtra (Fase 2)** | **a ROTA**, e isto é contrato, não detalhe: só saem as linhas com `saldo_pendente > 0` (é o que faz "pedido quitado → `200` com `[]`" ser verdade). O client **renderiza o que vem** e **não** refiltra — duas peneiras dariam duas definições de "linha recebível". `saldo_pendente` com o **mesmo clamp** (`Math.max(0, …)`) da rota de lista. O cenário (4) da T4 afirma as **duas** metades: a linha com saldo sai, a linha quitada do **mesmo** pedido **não** sai |

### 4. Permissões — `ACAO_PERFIS` (`permissions.js`): **nenhuma mudança**

| Ação | Perfis | Onde é checada |
|---|---|---|
| `receber_material` | `ADMINISTRADOR, ALMOXARIFE, COMPRAS` | `requirePermission` na rota |
| `autorizar_excedente` (da Etapa 36) | `ADMINISTRADOR, COMPRAS` | `can(user, ...)` **no serviço**, só quando o body traz a flag — agora nas **três** portas |

A T2 **acrescenta** ao arquivo dela o `deepStrictEqual` da lista (convenção de toda ação deste módulo
desde a Etapa 8) mesmo sem mudá-la: é o que impede a etapa de alargar a lista sem régua.

### 5. Literais de tela (client, T5)

| Situação | Texto literal no DOM |
|---|---|
| título do bloco | `Itens do pedido` |
| saldo por item | `Saldo pendente: <n>` |
| acima do saldo | `Acima do saldo: <n> a mais que o saldo do pedido (<saldo>)` |
| pedido sem saldo | `Este pedido já foi recebido por completo.` |
| caixa de autorização (só com `pode('autorizar_excedente')`) | `Autorizo o recebimento acima do pedido` (**a mesma** do painel — mesma decisão) |
| recusa do servidor | o `error` **literal** do 400/403, num bloco com `role="alert"` |

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `server/services/almoxarifado/schema.js` **(modificar)** | `'pedido_item_id INTEGER'` em `recebItemCols`; `quantidade_recebida REAL DEFAULT 0` em `itens_pedido_compra` por `safeAlter`; índice `idx_itens_pedido_compra_pedido` | 1 |
| `server/tests/helpers/testApp.js` **(modificar)** | stub da tabela **core** `pedidos_compra` (**sem FK**), no padrão de `clientes`/`fornecedores` | 1 |
| `server/services/almoxarifado/receiptService.js` **(modificar)** | `assertAutorizacaoExcedente` (metade decisória extraída); saldo por linha + resolução do `pedido_item_id` + régua agregada em `criarRecebimento`; `pedido_item_id` no `INSERT` do item; acumulador em `darEntradaEstoque`; `situacaoRecebimentoPedido` + os campos derivados nas duas rotas aux | 2, 3, 4 |
| `server/routes/almoxarifado/extended.js` **(modificar)** | rota nova `GET /recebimentos-aux/pedidos-compra/:id/itens`; `pendentes` no `req.query` (já passa `req.query` inteiro — conferir) | 4 |
| `server/routes/almoxarifado.js` **(modificar)** | apagar `:1775-1796` (o comentário + os 21 `ALTER TABLE`) | 6 |
| `server/tests/api/pedidoSaldoRecebido.api.test.js` **(criar)** | estrutura da migration (PRAGMA + idempotência) e **RN-22/RN-23** (o acumulador) | 1, 3 |
| `server/tests/api/recebimentoExcedentePedido.api.test.js` **(criar)** | **RN-20, RN-21, RN-25** (a terceira porta) | 2 |
| `server/tests/api/pedidosCompraSaldoAux.api.test.js` **(criar)** | **RN-24** (leitura derivada, `?pendentes=1`, rota de itens, e o `status` core intacto) | 4 |
| `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js` **(modificar)** | `selecionarPedido` carrega os itens com saldo; bloco de itens do pedido editável; aviso de excedente; caixa de autorização; `handleCriar` monta `itens` do pedido; estado de recusa no DOM | 5 |
| `client/src/components/almoxarifado/RecebimentosAlmoxarifado.test.js` **(modificar)** | fixture do pedido **nas duas** URLs aux (lista + itens); cenários **(s)(t)(u)** — **(Fase 2)**: o `(r)` já existe (onda da 36, `:850`) | 5 |
| `server/tests/api/schemaUnico.api.test.js` **(modificar)** | **RN-27**: varredura de `ALTER TABLE` + controle positivo das 21 colunas por `PRAGMA` | 6 |
| `server/tests/api/recebimentoContraPedidoIntegracao.api.test.js` **(criar)** | a integração que cruza galhos: o roteiro inteiro **pela ROTA** e **pelo SERVIÇO** | 7 |
| `specs/modulo-almoxarifado/08-recebimento/README.md`, `specs/modulo-almoxarifado/00-fundacao-tecnica/README.md`, `specs/modulo-almoxarifado/README.md`, `docs/almoxarifado-guia-etapas-e-testes.md`, `docs/almoxarifado-novidades-por-etapa.md`, `docs/almoxarifado-manual-do-sistema.md`, este plano **(modificar)** | fechamento, e as **quatro** correções de doc que a medição achou | 8 |

---

## Sort topológico

Critério da Fase 3 da skill: **motor, migration, `ACAO_PERFIS` ou regra compartilhada = tronco**;
**tela contra contrato congelado = galho**.

| Task | Tipo | Depende de | Por quê |
|---|---|---|---|
| 1 — migration (2 colunas + índice) e o stub de `pedidos_compra` no harness | **tronco** | — | é o tronco da etapa: **tudo** depende das duas colunas. E mexe no **harness**, que todos os arquivos de teste carregam |
| 2 — a terceira porta: saldo e excedente no `POST` | **tronco** | 1 | regra compartilhada no `receiptService` (extrai a metade decisória usada pelas **duas** portas da Etapa 36) e congela o 400/403 que a T5 vai citar |
| 3 — o acumulador em `darEntradaEstoque` | **tronco** | 2 | **motor de entrada de estoque**, dentro do claim de idempotência — o lugar mais sensível do módulo. E é o que a T4 lê |
| 4 — leitura derivada: aux + rota de itens | galho **A** | 3 | consome o que a T3 grava; **antes** do client, porque é o contrato que a tela consome. Toca o mesmo arquivo dos troncos (`receiptService.js`) → mesma árvore, sequencial |
| 5 — a tela carrega os itens do pedido | galho **B** | 4 | tela contra contrato congelado. **É o item de maior valor da 08 hoje** — e maior valor não é critério de tronco, acoplamento é |
| 6 — os 21 `ALTER TABLE` + spec 00 | galho **C** | — | **independente de verdade**: toca `routes/almoxarifado.js` e `schemaUnico.api.test.js`, que nenhuma outra task toca. Vai no fim por ser de risco zero e encerramento |
| 7 — integração que cruza galhos | sequencial | 3, 4, 5, 6 | o roteiro inteiro pela **rota** e pelo **serviço**, mais os cinco comandos da suíte |
| 8 — fechamento | sequencial | 7 | specs, mapa, guia, manual, novidades, este plano |

### Divergência declarada da skill: os galhos vão SEQUENCIAIS, não em worktrees

A `desenvolver-etapa-almoxarifado` manda rodar galhos paralelos em worktrees isoladas. **Medido e
confirmado desde a Etapa 34:** `node_modules/`, `client/node_modules/` **e `server/node_modules/`**
estão no `.gitignore`, então uma worktree nova **não tem `react-scripts` nem `supertest`** e não roda
nem a suíte de client nem a de API. Isolar exigiria um `npm install` por worktree.

Somando a isso: os galhos A e B tocam a **mesma árvore** dos troncos (o A mexe em
`receiptService.js`), e o único galho verdadeiramente isolado é o **C**, que é de encerramento.
**Decisão: tudo sequencial, um executor por task**, na ordem literal **1 → 2 → 3 → 4 → 5 → 6 → 7 →
8**. A coluna "Depende de" descreve **acoplamento**, não permissão para antecipar.

---

### Task 1: as duas colunas, o índice, e `pedidos_compra` no harness **(tronco)**

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (`recebItemCols` e o bloco do
  `CREATE TABLE IF NOT EXISTS itens_pedido_compra`)
- Modify: `server/tests/helpers/testApp.js`
- Create: `server/tests/api/pedidoSaldoRecebido.api.test.js`

**Interfaces:** nenhuma função nova sai de `schema.js`. As duas colunas e o índice são o contrato.

**(Fase 2) O stub, com as colunas ENUMERADAS.** O plano dizia só "no padrão de `clientes`/`fornecedores`,
sem FK, com `created_at`" — e a união do que os sete arquivos **inserem** e do que as rotas **leem** é
maior que isso. Espelhe a DDL de produção (`server/index.js:19230-19242`) **menos a FK**:

```js
await dbRun(db, `CREATE TABLE IF NOT EXISTS pedidos_compra (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT UNIQUE,            -- reposicaoJornada/reposicaoGerarSolicitacoes inserem id=1 explicito
  fornecedor_id INTEGER,         -- NOT NULL em producao; aqui NULLAVEL: almoxarifado.test.js:247 declara sem
  valor_total REAL DEFAULT 0,
  data_pedido DATE,
  previsao_entrega DATE,
  status TEXT DEFAULT 'pendente',
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,   -- listarPedidosCompraAux ordena por ela
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);
```

**Ordem, medida e não suposta (a pergunta do harness):** `testApp.js:27` faz `await initSchema(db)`
**antes** do bloco de stubs (`clientes` :36, `fornecedores` :51) — o stub de `pedidos_compra` entra
**depois** de `fornecedores`, e os sete `CREATE TABLE IF NOT EXISTS` dos arquivos de teste rodam
**depois** de `createTestApp()` retornar. Logo **o stub do harness cria primeiro e os sete viram
no-op** — a premissa do plano está **confirmada por leitura**, e é por isso que faltar uma coluna no
stub não é "um teste quebra": é **aquela coluna deixa de existir** para o arquivo que a declarava
(o caso do `created_at`, que só `recebimentoTipoEnum` e `almoxarifado.test.js` não declaram).
`itens_pedido_compra`, ao contrário, é criada **dentro** do `initSchema` (`schema.js:1306`) e
**ninguém mais** a cria (conferido: zero ocorrências em `server/index.js`) — então a coluna nova
nasce pelo `safeAlter` na **primeira** passada, que é o caminho de **banco migrado** (a tabela é
criada com 8 colunas e o `ALTER` acrescenta a nona); a segunda passada do cenário (2) é o caminho de
**banco já migrado**. Os dois modos ficam cobertos, e isto está escrito para o executor não achar
que precisa de uma terceira montagem.

**Restrições medidas, cada uma com o que cai se violada:**

| Não faça | Por quê | Cai em |
|---|---|---|
| `db.run(..., () => {})` no lugar de `safeAlter` | é **exatamente** o anti-padrão que a T6 desta etapa está apagando — erro engolido em silêncio | o cenário (2) desta task (idempotência), pela sabotagem 1 |
| registrar a migration no ledger `schema_migrations_almoxarifado` | os 4 ids do ledger são reconstrução/backfill/seed; `safeAlter` já é idempotente e `COUNT itens_pedido_compra = 0` — não há backfill a marcar | nada cai hoje — está **proibido por escrito** (decisão 2 do design) |
| declarar `FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)` no stub do harness | **quatro** arquivos inserem `fornecedor_id: 1` sem linha de fornecedor, e duas migrações de `schema.js` terminam em `PRAGMA foreign_keys=ON` | `solicitacaoCicloVida`, `reposicaoJornada`, `reposicaoGerarSolicitacoes`, `integracaoComprasJornada` — todos de uma vez |
| omitir `created_at` no stub | `listarPedidosCompraAux` faz `ORDER BY p.created_at DESC`; sem a coluna a rota morre com "no such column" | a T4 inteira |
| criar a coluna como `NOT NULL` | `safeAlter` de coluna `NOT NULL` sem default falha em tabela com linhas | o cenário (1), com erro na subida do app |

- [x] **Step 1: escrever o teste e ver os dois cenários vermelhos** (leia **qual** asserção cai)

`server/tests/api/pedidoSaldoRecebido.api.test.js` — cabeçalho com o achado medido (um pedido de 10
recebeu 25 e ficou `ABERTO`), e nesta task **só** os cenários estruturais:

```
(1) a coluna existe depois de initSchema, e o item do recebimento tem pedido_item_id
    PRAGMA table_info(itens_pedido_compra) contém 'quantidade_recebida'
    PRAGMA table_info(recebimentos_material_itens_almoxarifado) contém 'pedido_item_id'
    PRAGMA index_list(itens_pedido_compra) contém 'idx_itens_pedido_compra_pedido'
    e o DEFAULT vale: INSERT de uma linha sem a coluna -> quantidade_recebida === 0 (nao null)
(2) IDEMPOTENTE: rodar initSchema DUAS VEZES no mesmo db nao lanca, e a coluna continua uma so
    (PRAGMA table_info filtrado por nome -> length === 1)
(3) o stub do harness serve: INSERT em pedidos_compra com fornecedor_id inexistente passa,
    e GET /almoxarifado/recebimentos-aux/pedidos-compra responde 200 (prova que created_at existe)
```

> O cenário (1) afirma `=== 0` e **não** `!= null`: `REAL DEFAULT 0` é o que faz a aritmética do
> saldo (`quantidade - COALESCE(quantidade_recebida, 0)`) não virar `NaN` no primeiro pedido.
> O cenário (3) é o que impede a decisão 8 de ser uma mudança de harness sem régua.

- [x] **Step 2: rodar e LER os números**

```
cd server && node tests/api/pedidoSaldoRecebido.api.test.js
```

Previsão: **(1) e (2) vermelhos** — o (1) na asserção da coluna `quantidade_recebida`
(`PRAGMA` não a devolve), o (2) **não** deveria cair hoje por si (rodar `initSchema` duas vezes já é
idempotente) mas cai junto no `assert` da coluna; **(3) vermelho** pelo `no such table:
pedidos_compra`. Se algum vier verde, **pare**: alguém já mexeu no schema e o cenário mede outra
coisa. Cole aqui as linhas reais do `✗`.

- [x] **Step 3: implementar** — as três linhas de `schema.js` e o stub do harness, com o comentário
      do **por quê** em cada um (o stub cita o precedente de `clientes`/`fornecedores` e diz que a FK
      fica fora de propósito, com os quatro arquivos nomeados).

- [x] **Step 4: rodar de novo, e rodar os SEIS arquivos que criam `pedidos_compra`**

```
cd server && node tests/api/pedidoSaldoRecebido.api.test.js
cd server && node tests/api/solicitacaoCicloVida.api.test.js
cd server && node tests/api/integracaoComprasJornada.api.test.js
cd server && node tests/api/compraContextoMaterial.api.test.js
cd server && node tests/api/recebimentoTipoEnum.api.test.js
cd server && node tests/api/reposicaoJornada.api.test.js
cd server && node tests/api/reposicaoGerarSolicitacoes.api.test.js
cd server && npm run test:almoxarifado    # (Fase 2) o SETIMO criador: almoxarifado.test.js:247,
                                          # suite de SERVICO, que NAO usa o harness — o DDL dela
                                          # vale de verdade e ela insere em itens_pedido_compra
cd server && npm run test:safealter && npm run test:sqlite
```

Os seis usam `CREATE TABLE IF NOT EXISTS` (lido), então o DDL deles vira no-op e **o do harness
vence**. Se algum ficar vermelho, o achado é do stub (coluna faltando ou FK) — conserte o stub,
**não** o arquivo de teste.

- [x] **Step 5: sabotagens**

| # | Sabotagem | Âncora (`grep -cF` = 1 **pós-conserto**) | Qual asserção tem de cair |
|---|---|---|---|
| 1 | trocar o `safeAlter` da coluna nova por `db.run(sql, () => {})` | o bloco `const itensPedidoCols = [` | nada no (1)/(2) — **e esse é o achado**: prova que a régua estrutural **não** protege o anti-padrão. Registre como fragilidade (letra G) e **mantenha `safeAlter`**; a régua do padrão é `npm run test:safealter`, que existe e **tem** de ser citado no fechamento |
| 2 | remover `DEFAULT 0` da coluna nova | `'quantidade_recebida REAL DEFAULT 0'` | `assert.strictEqual(col.quantidade_recebida, 0)` do (1) — cai com `null` |
| 3 | apagar `created_at` do stub do harness | o bloco `CREATE TABLE IF NOT EXISTS pedidos_compra (` em `testApp.js` | o **status 200** do (3), com `SQLITE_ERROR: no such column: p.created_at` |

- [x] **Step 6: commit** — `git add` só dos três caminhos. Mensagem: qual era o furo (o pedido não
      tinha onde guardar o que chegou, e o item do recebimento não guardava a linha do pedido), o que
      foi decidido (duas colunas, `safeAlter` sem ledger, stub no harness sem FK) e o descartado
      (uma coluna só com acúmulo por material; ledger; FK no stub).

#### ✅ Task 1 EXECUTADA — commit `ea0aa4f`

**RED literal (antes do conserto), as três linhas reais do `✗`:**

```
✗ (1) ...: itens_pedido_compra sem quantidade_recebida — colunas: id, pedido_id, material_id,
      codigo, descricao, quantidade, valor_unitario, unidade
✗ (2) ...: a coluna tem de existir UMA vez depois de duas passadas — achei 0   (0 !== 1)
✗ (3) ...: SQLITE_ERROR: no such table: pedidos_compra
0 passou, 3 falhou
```

A previsão do plano bateu exata, inclusive o motivo de cada uma. **GREEN:** `3 passou, 0 falhou`.

**Números reais:** `pedidoSaldoRecebido` 3/3 · suíte de API **175/175 arquivos OK** (era 174; este
arquivo é o 175º) · `test:almoxarifado` 42/42 · `test:safealter` 3/3 · `test:sqlite` 5/5 · os seis
criadores de `pedidos_compra` pelo harness, um a um: `solicitacaoCicloVida` 18/18,
`integracaoComprasJornada` 1/1, `compraContextoMaterial` 14/14, `recebimentoTipoEnum` 7/7,
`reposicaoJornada` 1/1, `reposicaoGerarSolicitacoes` 14/14.

**A ordem do harness, agora medida POR EXECUÇÃO** (não só por leitura): sonda no scratchpad que
monta `createTestApp()`, lê `sqlite_master.sql` de `pedidos_compra`, roda **o DDL literal de
`recebimentoTipoEnum.api.test.js:105`** (o sem `created_at`) e lê de novo:

```
APOS createTestApp, tem created_at? true
DEPOIS do DDL do arquivo de teste, tem created_at? true
DDL vencedora e a do HARNESS? true
```

Confirma que os sete `IF NOT EXISTS` são **no-op** e que a forma passa a ser uma só.

**Sabotagens (âncora contada `grep -cF` = 1 DEPOIS do conserto; `perl -0pi -e`; md5 antes/durante/
restaurada; restauro por perl inverso + `diff` contra cópia do scratchpad):**

| # | Âncora (= 1) | md5 pós-conserto → sabotado → restaurado | Asserção que caiu |
|---|---|---|---|
| 1 | `const itensPedidoCols = [` (schema.js) | `88dad7ee…` → `6a375dff…` → `88dad7ee…` | **NENHUMA** — `3 passou, 0 falhou` com `db.run(sql, () => {})`. É o **achado declarado** pelo próprio plano (caso 2): a régua estrutural (`PRAGMA`) **não** protege o anti-padrão de erro engolido. `safeAlter` mantido; fragilidade vai para a **letra G**, e a régua do padrão é `npm run test:safealter` (3/3), que **tem** de ser citada no fechamento |
| 2 | `'quantidade_recebida REAL DEFAULT 0'` (schema.js) | `88dad7ee…` → `30515137…` → `88dad7ee…` | `(1)` — *"INSERT sem a coluna tem de ler 0 (DEFAULT 0); null faria o saldo virar NaN"*. (2) e (3) ficaram verdes |
| 3 | `CREATE TABLE IF NOT EXISTS pedidos_compra (` (testApp.js) | `63c7dbd9…` → `c74328c1…` → `63c7dbd9…` | `(3)` — o **200** caiu com `{"error":"SQLITE_ERROR: no such column: p.created_at"}`. (1) e (2) ficaram verdes |

**Divergências do brief, declaradas:**
1. O brief do executor dizia *"`safeAlter` **+ o ledger** de migrations"*, e a **decisão 2 do design**
   e a tabela de restrições desta task **proíbem o ledger por escrito**. Valeu o design: **sem
   ledger**. O `npm run test:safealter` é a régua do padrão citada no lugar dele.
2. O brief pedia provar **banco novo e banco migrado**, e o próprio texto da Fase 2 argumentava que
   a primeira passada já *é* o caminho migrado. Foi feita a prova **explícita** de qualquer forma: o
   cenário (2) monta um `:memory:` cru com as **8 colunas originais**, afirma `length === 8` e a
   ausência da coluna **antes** (controle), roda `initSchema` e afirma `length === 9` + o índice.
3. `listarPedidosCompraAux` tem `if (!tableExists) return []` — então **sem** o stub a rota já
   responderia `200 []`. O cenário (3) por isso **não** se contenta com o 200: ele procura o pedido
   inserido no corpo (`numero === 'PC-E37-SEM-FORN'`, `id` conferido). Sem essa metade, o cenário
   passaria verde pelo fallback.

**Preocupação para a T2/T3:** `itens_pedido_compra` continua com **zero escritores** da coluna nova —
a estrutura existe e ninguém a move. Enquanto a T3 não entrar, `quantidade_recebida` é `0` em toda
linha e todo saldo lido vale `quantidade`. Nenhum leitor novo foi criado aqui **de propósito**.

---

### Task 2: a terceira porta — saldo e excedente no `POST` **(tronco)**

**Files:**
- Modify: `server/services/almoxarifado/receiptService.js` (`assertAutorizacaoExcedente` novo;
  `assertExcedentePermitido` delega; `criarRecebimento`)
- Create: `server/tests/api/recebimentoExcedentePedido.api.test.js`

**Interfaces:** `assertAutorizacaoExcedente(user, autorizado, mensagem400)` e
`saldoDasLinhasDoPedido(db, pedidoId)` são **internas** do `receiptService` (exportar **só** se a T7
chamar direto, e então dizer por quê). Nada mais sai.

⚠️ **A barreira desta task NÃO é a única que `criarRecebimento` ganha.** Um fix-round paralelo da
onda da 36 (F5, em andamento — sem hash ainda, é mudança local não commitada em
`receiptService.js` no momento em que este parágrafo foi escrito) está acrescentando **outra**
barreira dentro do próprio `criarRecebimento`: `quantidade_recebida > quantidade_esperada` **do
mesmo documento que está nascendo** (a RN-18 alcançando a terceira porta, que antes só entrava
999 de 10 com 201). São **duas comparações diferentes que têm de conviver**: a F5 mede contra a
esperada do próprio payload/documento; esta task mede contra o **saldo do pedido de compra**
(agregado por material, RN-20). Nenhuma substitui a outra. **Antes de editar `criarRecebimento`
nesta task, leia o estado ATUAL do arquivo** (a F5 pode já ter mudado a forma de `criarRecebimento`
e introduzido `erroExcedenteSemFlag`/`erroExcedenteSemPermissao` — não assuma a forma descrita nos
trechos de código abaixo sem conferir contra o arquivo real).

**Restrições medidas, cada uma com o que cai se violada:**

| Não faça | Por quê | Cai em |
|---|---|---|
| chamar `assertExcedentePermitido` no `POST` | ela compara com a linha **já gravada** (`SELECT ... WHERE id = ? AND recebimento_id = ?`) e faz `continue` quando não acha — no `POST` os itens **não existem**: a função é um no-op ali | o cenário (1) ficaria **verde vazio**: 201 com 999 e nenhuma recusa |
| reescrever o texto do 403 | ele é o **mesmo** das outras duas portas; duas cópias divergem na primeira edição | o cenário (2) desta task **e** `recebimentoExcedente.api.test.js` — pela sabotagem 3 |
| recusar **depois** de algum `INSERT` | não há transação: o documento ficaria no banco com um 400 por cima | `COUNT(recebimentos) === antes` do cenário (1) |
| confiar no `pedido_item_id` do payload | um id de outra linha/outro pedido escolheria a linha errada, e omitir o campo contornaria a régua | o cenário (6) |
| medir o saldo por **linha** em vez de por material | duas linhas do mesmo material fariam um recebimento legítimo tomar 400 | o cenário (7) |
| deixar `quantidade_esperada` vir do payload no caminho do pedido | o parcial continuaria impossível de registrar com a esperada certa, e o `/conferir` da Etapa 36 mediria contra o número que o operador digitou | ⚠️ **(Fase 2) o cenário (4) NÃO pega isso** — ele é o `POST` **sem** `itens`, onde não há payload de item nenhum. O caminho **com** `itens` é o que a **tela** usa depois da T5, e é justamente onde o payload traz `quantidade_esperada`: cai no cenário **(10)**, novo |

**Cenários (o arquivo tem runner próprio; `ADMIN` 64, `ALMOXARIFE` 65, `COMPRAS` 66):**

```
(1) saldo 4 e POST de 6 -> 400 com a LITERAL e COUNT(recebimentos) INALTERADO
    (o pedido de 10 nasce com um recebimento de 6 JA PROCESSADO — usa o caminho da T3)
(2) o par que prova a permissao, no MESMO test():
    autorizar_excedente + ALMOXARIFE -> 403 com a literal nomeando o perfil
    autorizar_excedente + COMPRAS    -> 201, item gravado com 6, e UMA linha
                                        EXCEDENTE_AUTORIZADO (entidade recebimento_item,
                                        entidade_id = id do item criado)
(3) metades positivas: recebida === saldo -> 201; recebida < saldo -> 201; e sem nenhuma
    entrada anterior (saldo cheio) -> 201  [distingue esta RN de uma copia da RN-18]
(4) RN-25: POST SEM `itens` contra pedido de 10 com 6 recebidos -> 201 e o item nasce
    quantidade_esperada === 4 E quantidade_recebida === 4  (hoje nasceria 10/10)
(5) RN-25: pedido inteiramente recebido, POST sem `itens` -> 400
    'Pedido de compra <numero> já foi recebido por completo'  (e NAO 'Inclua ao menos um item')
(6) pedido_item_id FORJADO (linha de OUTRO pedido) nao contorna: a regua e o saldo agregado
    -> 400, e o item que entrar por 201 legitimo grava o pedido_item_id RESOLVIDO pelo servidor
(7) duas linhas do MESMO material (6 e 4) no mesmo pedido: POST de 10 -> 201
    (saldo agregado = 10); POST de 11 -> 400 dizendo saldo 10
(8) caminho NF puro (sem pedido) continua intocado: POST 999 com quantidade_esperada 10 -> 201
    [regressao declarada: a RN-18 nao alcanca o POST sem pedido — B84 continua valendo la]
(9) congelamento: deepStrictEqual([...ACAO_PERFIS.autorizar_excedente].sort(),
    ['ADMINISTRADOR','COMPRAS'])  — a etapa NAO alarga a lista

--- (Fase 2) os quatro cenarios que faltavam, e sem os quais a etapa passa verde errada ---

(10) A ESPERADA DO CAMINHO QUE A TELA USA: POST COM `itens`, o item mandando
     quantidade_esperada: 99 e quantidade_recebida: 4 contra saldo 4 -> 201, e a linha
     gravada tem quantidade_esperada === 4 (o SALDO), nao 99.
     [sem esta asserção, o (4) cobre so o POST SEM itens e o caminho da tela fica sem regua:
      uma esperada vinda do payload desligaria a barreira da Etapa 36 no /conferir em silencio,
      porque ela compara recebida com a ESPERADA GRAVADA (receiptService.js:290)]

(11) O SCHEMA ZOD DEIXA PASSAR O PAYLOAD DA TELA: POST com itens
     [{ material_id, pedido_item_id, quantidade: 4, quantidade_recebida: 4 }] — SEM a chave
     `quantidade_esperada` e SEM `valor_unitario` -> 201 (nao 400 de validacao).
     [e o payload LITERAL que a T5 monta; a onda da 36 (R6) acrescentou schema dos itens ao
      POST, e um `.positive()` obrigatorio em quantidade_esperada faria a tela nova responder
      400 antes de chegar ao servico. Metade negativa que prova que o schema nao morreu:
      quantidade: 'abc' -> 400]

(12) O FLUXO ATE O FIM (a licao da Etapa 36): pedido de 10 com 6 JA PROCESSADOS; COMPRAS faz
     POST de 6 com autorizar_excedente -> 201, item nasce esperada 4 / recebida 6. ENTAO,
     no MESMO test():
       a. PUT /:id/conferir ECOANDO quantidade_recebida: 6 (o payload real do painel, SEM a
          flag), como ALMOXARIFE -> 200   [ecoar nao e ato novo de autorizacao]
       b. PUT /:id/fiscal com o payload real do modal (NF + datas + valor + itens ecoando 6)
          -> 200
       c. o documento chega a PROCESSADO pelo workflow e o pedido soma
     [este e o Critical da Etapa 36 reproduzido pela PORTA NOVA: o POST desta etapa CRIA
      documentos que nascem com recebida > esperada, populacao que antes so existia por
      autorizacao no /conferir.
      (correcao pos-onda da 36) A nota abaixo ficou velha: em 230baf6 a regra nova valia SO no
      /fiscal via `opcoes.ignorarInalteradas`, mas esse flag foi DELETADO em 2d7787d — a regra
      ("aumenta sobre a quantidade ja gravada") passou para DENTRO de assertExcedentePermitido e
      vale nas DUAS portas sem flag nenhum. Este cenario (12) e o achado (2) da Fase 2 estao
      RESOLVIDOS POR CONSTRUCAO: nao ha mais "SO no /fiscal" para medir. Se o cenario cair mesmo
      assim, o defeito e outro — nao o que este comentario descrevia]

(13) pedido SEM nenhuma linha lancada (COUNT itens_pedido_compra = 0), POST sem `itens` -> 400
     'Pedido de compra <numero> não tem itens lançados no módulo Compras'
     e NAO 'já foi recebido por completo' (que seria mentira) e NAO 'Inclua ao menos um item'.
     Metade positiva do mesmo cenario: o mesmo pedido aparece em
     GET /recebimentos-aux/pedidos-compra?pendentes=1 como 'ABERTO' (RN-24) — e e ESSA
     combinacao que prova que a tela nao esta oferecendo um pedido que a porta recusa mentindo
```

> O cenário (8) é a **regressão declarada** mais importante do plano: a régua nova é **contra o
> pedido**. `POST` sem pedido continua aceitando excedente, porque não existe "esperado" que não seja
> o que o próprio operador digitou. Isso vai para a letra **G** e para o guia — não para "corrigido".

- [x] **Step 1: escrever o arquivo com os treze cenários** (**(Fase 2)**: nove + (10) a (13); o (1) depende do acumulador da T3; nesta
      task, produza o saldo gravando `quantidade_recebida` na linha do pedido **por `dbRun` direto no
      teste** e deixe um comentário dizendo que a T3 é quem produz isso em produção — senão a T2 fica
      bloqueada pela T3 e o sort inverte).
- [x] **Step 2: rodar e LER os números.** Previsão: **(1), (2), (4), (5), (6), (7), (10), (13)
      vermelhos**; **(3), (8), (9) verdes**; **(11) verde** (hoje o item nasce do pedido e o payload
      da tela ainda não existe — ele é a régua do schema, e nasce verde de propósito: a sabotagem 7
      é o que prova que sabe falhar); **(12) vermelho ou verde conforme a onda da 36** — se vier
      vermelho na metade (a), **pare e leia**: é o achado (2) da Fase 2, e ele mora no `/conferir`,
      não nesta task. ⚠️ **Qual asserção cai no (2), medido e não deduzido:** a ação
      `autorizar_excedente` **já existe** (Etapa 36), mas o `POST` não chama barreira nenhuma — então
      as duas metades respondem **201** hoje, e a que cai é a do **status 403** do ALMOXARIFE
      (`201 !== 403`), não a da literal. A metade do COMPRAS (**201**) passa verde hoje **pelo motivo
      errado** (nada foi checado): é o par, e não cada metade, que prova a barreira. Cole as linhas
      reais do `✗`.
- [x] **Step 3: implementar.** Extrair `assertAutorizacaoExcedente` (com o comentário do design
      dizendo **por que** só a metade decisória é compartilhada); `assertExcedentePermitido` passa a
      delegar as duas exceções finais; em `criarRecebimento`, calcular o saldo por linha, resolver o
      `pedido_item_id`, aplicar a régua agregada **antes** do `inserirComNumeroUnico`, gravar
      `pedido_item_id` no `INSERT` do item, e auditar os excedentes **depois** dos `INSERT`.
- [x] **Step 4: rodar o arquivo novo E a régua do que não pode mudar**

```
cd server && node tests/api/recebimentoExcedentePedido.api.test.js
cd server && node tests/api/recebimentoExcedente.api.test.js      # a Etapa 36, INTEIRA
cd server && node tests/api/recebimentoTipoEnum.api.test.js
cd server && node tests/api/recebimentoNfDuplicada.api.test.js
cd server && node tests/api/solicitacaoCicloVida.api.test.js
cd server && npm run test:almoxarifado   # a suite de SERVICO (server/tests/almoxarifado.test.js),
                                         # que recebe por pedido em dois cenarios
```

- [x] **Step 5: sabotagens**

| # | Sabotagem | Âncora (`grep -cF` = 1 **pós-conserto**) | Qual asserção tem de cair |
|---|---|---|---|
| 1 | trocar `>` por `>=` na comparação do saldo agregado | `if (recebidaTotal > saldoMaterial)` | **(3)**, na metade `recebida === saldo -> 201` (passa a 400). É a sabotagem de **posição do comparador**, que a Etapa 36 mediu como a mais informativa |
| 2 | mover a régua para **depois** do `inserirComNumeroUnico` | o bloco do `await assertAutorizacaoExcedente(` dentro de `criarRecebimento` | **(1)**, na asserção `COUNT(recebimentos) === antes` — o status continua 400 e **só** o `COUNT` cai. É por isso que a asserção de dano existe |
| 3 | alterar uma palavra da literal do **403** em `assertAutorizacaoExcedente` | `'Autorizar recebimento acima do pedido exige a permissão'` | **(2)** deste arquivo **e** os cenários de 403 de `recebimentoExcedente.api.test.js` (Etapa 36) — **os dois arquivos ao mesmo tempo**. É a prova executada de que a literal é única |
| 4 | fazer a resolução confiar no `pedido_item_id` do payload sem validar o pedido | o bloco da resolução (`pertence ao pedido`) | **(6)**, na asserção do `pedido_item_id` gravado |
| 5 | deixar `quantidade_esperada = item.quantidade_esperada \|\| item.quantidade` no caminho do pedido | o bloco do `map` dos itens nascidos do pedido (**sem** `itens` no payload) | **(4)**, em `quantidade_esperada === 4` (volta a 10) |
| 6 **(Fase 2)** | no caminho **com** `itens`, gravar `quantidade_esperada` do payload em vez do saldo resolvido | o bloco que resolve a linha e monta a esperada do item **com** payload | **(10)**, em `quantidade_esperada === 4` (vira 99). É a sabotagem que faltava: a 5 só alcança o caminho **sem** `itens`, e o caminho **com** `itens` é o da tela |
| 7 **(Fase 2)** | tornar `quantidade_esperada` **obrigatória** no schema de item do `POST` (`schemas.js`) | a linha de `quantidade_esperada` no schema de itens (leia o nome real pós-onda) | **(11)**, com 400 de validação em vez de 201 — é o controle positivo de que o (11) não é decorativo, e mede exatamente o defeito que derrubaria a tela nova |
| 8 **(Fase 2)** | trocar a literal do pedido sem linhas pela de "já foi recebido por completo" | o `throw` do caso `COUNT = 0` | **(13)**, pela literal — e é o que prende a distinção entre "não lançaram os itens" e "já recebi tudo" |

- [x] **Step 6: commit** — por quê (a terceira porta gravava 999 de 10 e o excedente não tinha
      referência nenhuma senão o número que o operador digitou), o decidido (metade decisória
      compartilhada, 400 próprio, régua agregada por material, resolução no servidor) e o descartado
      (reusar a função inteira, parametrizar a literal da 36, régua por linha, confiar no payload).

#### ✅ Task 2 EXECUTADA — commit `57ace18`

**RED literal (antes do conserto), as linhas reais do `✗`:**

```
✗ (1) ...: {"id":1,"numero":"REC-...","status":"RECEBIDO"}                       201 !== 400
✗ (2) ...: {"id":2,"numero":"REC-...","status":"RECEBIDO"}                       201 !== 403
✗ (4) ...: a esperada do item nasce do SALDO ...                                  10 !== 4
✗ (5) ...: {"id":7,...,"status":"RECEBIDO"}                                      201 !== 400
✗ (6) ...: {"id":8,...,"status":"RECEBIDO"}                                      201 !== 400
✗ (7) ...: {"id":10,...,"status":"RECEBIDO"}                                     201 !== 400
✗ (10) ...: esperada vinda do PAYLOAD desligaria a barreira da 36 ...             99 !== 4
✗ (12) ...: Expected values to be strictly equal                                   6 !== 4
✗ (13) ...: + 'Inclua ao menos um item'  - 'Pedido de compra PC-E37-25 não tem itens lançados…'
4 passou, 9 falhou     (verdes na RED: (3), (8), (9), (11))
```

A previsão do Step 2 bateu **item por item**, inclusive o motivo de cada uma: o (2) caiu no
**status 403** (`201 !== 403`) e não na literal, exatamente como o plano mediu. **GREEN:**
`13 passou, 0 falhou`.

**⚠️ O achado (2) da Fase 2 está RESOLVIDO POR CONSTRUÇÃO, e agora medido:** o cenário (12) caiu na
asserção `esperada === 4` (que é trabalho **desta** task) e **não** na metade (a) do `/conferir`.
Com o conserto, `/conferir` ecoando 6 responde **200**, `/fiscal` responde **200** e o documento
chega a `PROCESSADO` — a regra "só o AUMENTO sobre a gravada" vale nas duas portas sem flag nenhum.
Nada a passar para outro commit.

**Números reais:** `recebimentoExcedentePedido` 13/13 · suíte de API **176/176 arquivos OK**
(era 175; este arquivo é o 176º) · `recebimentoExcedente` (a Etapa 36 **inteira**) 16/16 ·
`recebimentoTipoEnum` 7/7 · `recebimentoNfDuplicada` 10/10 · `recebimentoPortasIntegracao` 4/4 ·
`solicitacaoCicloVida` 18/18 · `test:almoxarifado` 42/42.

**Sabotagens** (âncora `grep -cF` = 1 **pós-conserto** — as oito conferidas antes de rodar;
`perl -0pi -e`; md5 antes/durante/restaurada; restauro por **perl inverso** + `diff -q` contra
cópia no scratchpad, nunca `git checkout --`):

| # | Âncora (= 1) | md5 pós-conserto → sabotado → restaurado | Asserção que caiu |
|---|---|---|---|
| 1 | `if (recebidaTotal > saldoMaterial)` | `1ff63ccd…` → `6d389e6f…` → `1ff63ccd…` | **(3)** na metade `recebida === saldo -> 201` (veio `400 Quantidade recebida (4) maior que o saldo do pedido (4)`), e com ela (4)(6)(7)(10) — todos os casos de igualdade exata. `8 passou, 5 falhou` |
| 2 | `const excedentesDoPedido = assertSaldoDoPedidoPermitido(user, resolvidos, linhasDoPedido,` | `1ff63ccd…` → `c60bb364…` → `1ff63ccd…` | **(1)** e **SÓ** ela, na asserção `COUNT(recebimentos) === antes` (*"a recusa tem de acontecer ANTES do INSERT do cabecalho"*) — o status continuou 400. `12 passou, 1 falhou`. É por isso que a asserção de **dano** existe |
| 3 | `'Autorizar recebimento acima do pedido exige a permissão` | `1ff63ccd…` → `8a1570eb…` → `1ff63ccd…` | **os DOIS arquivos ao mesmo tempo**: `(2)` daqui (`12 passou, 1 falhou`) **e** `(2)`, `(3)` e `(13)` de `recebimentoExcedente.api.test.js` (`13 passou, 3 falhou`). Prova **executada** de que a literal do 403 é única |
| 4 | `pertence ao pedido resolvido` (bloco de `resolverLinhaDoPedido`) | `1ff63ccd…` → `4cf4917b…` → `1ff63ccd…` | **(6)**, na asserção do **`pedido_item_id` gravado** (*"o servidor RE-RESOLVE a linha por material"*) — o 400 do forjado continuou de pé, porque a régua é agregada. `12 passou, 1 falhou` |
| 5 | `quantidade_esperada: l.saldo,` (map do caminho **sem** `itens`) | `1ff63ccd…` → `1238c495…` → `1ff63ccd…` | **(4)**, em `quantidade_esperada === 4` (voltou a **10**). `12 passou, 1 falhou` |
| 6 | `return { ...item, quantidade_esperada: linha.saldo };` (caminho **com** `itens`) | `1ff63ccd…` → `71061e45…` → `1ff63ccd…` | **(10)**, em `quantidade_esperada === 4` (virou **99**) — e junto **(2)** e **(12)**, que também afirmam a esperada 4. `10 passou, 3 falhou`. A 5 **não** alcança este caminho, e é o da tela |
| 7 | `.positive(QTD_ESPERADA_ITEM_INVALIDA).optional(),` (`schemas.js`) | `e6280313…` → `0481825b…` → `e6280313…` | **(11)**, com `400 "Dados inválidos — itens.0.quantidade_esperada: …"` em vez de 201 — e com ele (1)(2)(3)(6)(7)(12), **todo** POST por pedido feito sem a chave. `6 passou, 7 falhou`: é a medida exata do defeito que derrubaria a tela nova da T5 |
| 8 | `` `Pedido de compra ${pedido.numero} não tem itens lançados no módulo Compras`, `` | `1ff63ccd…` → `62c01973…` → `1ff63ccd…` | **(13)**, pela literal. `12 passou, 1 falhou` — prende a distinção entre "não lançaram os itens" e "já recebi tudo" |

`git diff --stat` depois das oito: só `receiptService.js` (e este plano), com `schemas.js`
**idêntico** ao pós-conserto.

**Divergências do plano/brief, declaradas:**

1. **O cenário (8) do plano ficou VELHO e foi reescrito.** Ele dizia *"POST 999 com
   `quantidade_esperada` 10 → **201** — a RN-18 não alcança o POST sem pedido"*. O fix-round 2 (F5)
   da onda da 36 (`17c4130`, **já no HEAD** desta task) levou a RN-18 **para** a terceira porta:
   medido, esse POST responde **400** hoje. O **fato** que o cenário existe para provar é o mesmo —
   a régua nova é contra o **pedido** e não alcança o caminho sem pedido —, mas a prova mudou de
   forma: sem pedido o 400 é o **da Etapa 36** (esperada + posição no payload) e **nunca** o do
   saldo, e com a flag + COMPRAS o documento entra. A regressão declarada continua valendo para a
   letra **G**, com o texto corrigido.
2. **O 403 não foi reescrito dentro de `assertAutorizacaoExcedente` como uma cópia.** A onda da 36
   já havia extraído `erroExcedenteSemPermissao`; manter as duas formas deixaria a âncora da
   sabotagem 3 com `grep -cF` = **2**. A função **absorveu** o helper (ele deixou de existir), então
   a literal do 403 tem **um** lugar e a sabotagem 3 derruba os dois arquivos — que é o efeito que o
   plano pedia. Pelo mesmo motivo, `erroExcedenteSemFlag` virou `mensagemExcedenteSemFlag` (devolve
   **string**, que é o que a assinatura `assertAutorizacaoExcedente(user, autorizado, mensagem400)`
   do design espera), e o **sufixo** do 400 virou a constante
   `SUFIXO_AUTORIZACAO_EXCEDENTE` — escrito de novo no 400 do saldo, o F3 se repetiria.
3. **A âncora da sabotagem 2 não é `await assertAutorizacaoExcedente(`.** A régua do saldo é
   **síncrona** (não toca o banco: as linhas já vieram em `saldoDasLinhasDoPedido`), então o bloco
   dentro de `criarRecebimento` é a chamada de `assertSaldoDoPedidoPermitido`, e é ela a âncora. O
   `grep -cF 'assertAutorizacaoExcedente('` dá **3** pós-conserto, como o plano previu (definição +
   as duas delegações), e por isso **não** serve de âncora.
4. **A barreira da 36 passou a medir `itensInput` (o payload CRU), e não `itens`.** Medido: com
   `itens` (já com a esperada trocada pelo saldo), o cenário **(7)** tomava 400 — duas linhas do
   mesmo material (6 e 4) resolvem para a linha de saldo 6, e a recebida legítima de 10 ficaria
   "acima da esperada" pela régua **errada**. Quem julga esse caso é a régua **agregada**. A
   semântica da 36 fica intacta: ela mede a coerência do payload **consigo mesmo**.
5. **A metade positiva do (13) não afirma `?pendentes=1` nem `situacao_recebimento: 'ABERTO'`** —
   os dois são contrato da **Task 4** e a asserção deles mora em `pedidosCompraSaldoAux`, cenário
   (3). Afirmar aqui deixaria a T2 vermelha por trabalho que ainda não existe. O que o (13) afirma
   hoje, e que é a metade que importa para a distinção das duas literais, é que **o pedido sem
   linhas APARECE** em `GET /recebimentos-aux/pedidos-compra`. Está anotado no próprio cenário.
6. **O (12) não afirma "e o pedido soma"** (a metade da RN-22): é o acumulador da **Task 3**. Está
   anotado no cenário, apontando para `pedidoSaldoRecebido.api.test.js`.
7. **A trilha do excedente do pedido NÃO reusa `auditarExcedenteAutorizado`.** O contrato 1 manda
   `dados_anteriores: { saldo_pedido }`, e o helper da 36 grava
   `dados_anteriores: { quantidade_esperada }`. Chamar as duas medidas pelo mesmo nome faria a
   leitura da trilha **mentir** sobre o que foi comparado. Verbo e entidade são os mesmos, então
   `auditLabels.js` continua intocado.

**Preocupações para a T3/T4:**
1. **O `pedido_item_id` do INSERT vem de `resolvidos`, nunca de `item.pedido_item_id`.** Era
   necessário: sem isso, um payload com `pedido_item_id` forjado e material **fora** do pedido (ou
   pedido sem linhas, ou caminho NF puro) gravaria o id do payload, e a T3 somaria na linha de
   **outro** pedido. Quem mexer no INSERT dos itens tem de manter essa fonte.
2. **Dois recebimentos criados contra o mesmo pedido antes de qualquer um processar respondem 201
   os dois** — o cenário (3) deste arquivo **afirma** isso (`recebida < saldo` depois de um 201
   anterior). É o mecanismo declarado no contrato 1 (letra **G**), não bug, e é o mesmo que faz a
   RN-23 valer. A T3 não pode "consertar" isso sem mudar o significado da palavra saldo.
3. **A esperada gravada é o saldo da linha RESOLVIDA, congelado na criação.** Num pedido com duas
   linhas do mesmo material, um item de 10 nasce com `esperada = 6` (a primeira linha com saldo) e
   `recebida = 10` — consequência **declarada** da régua agregada, e é ela que a T4 tem de clampar
   em `Math.max(0, …)` no `saldo_pendente`.

---

### Task 3: o acumulador na entrada física **(tronco)**

**Files:**
- Modify: `server/services/almoxarifado/receiptService.js` (`darEntradaEstoque`)
- Modify: `server/tests/api/pedidoSaldoRecebido.api.test.js` (os cenários RN-22/RN-23)

**Interfaces:** nenhuma. São 4 linhas dentro do claim.

**(Fase 2) Duas coisas que o plano não dizia e que mudam o código a escrever:**

1. **O `UPDATE` do pedido vai dentro de um `try/catch` NÃO-FATAL, com `console.warn`** — molde da
   griffagem de séries, 30 linhas acima, no mesmo `try` (`receiptService.js:797-807`, com o
   comentário que explica por quê). Motivo medido: o lugar combinado é **depois** de
   `entrouFisicamente = true`, e dali para baixo o `catch` de `:826-836` **não devolve** o claim.
   Se o `UPDATE` em `itens_pedido_compra` lançar — e o módulo **assume que essas tabelas podem não
   existir** (`listarPedidosCompraAux:955-957` e `gerarContaPagar:842-844` têm guarda de tabela
   ausente) —, o `throw` sobe, `processarNota` **falha depois de o estoque já ter entrado**, o
   recebimento fica fora de `PROCESSADO` e o reprocessamento **pula** o item pelo claim: material no
   estoque, documento travado e o pedido sem contar. Perder a contagem de um pedido com um `warn` é
   reversível por SQL; travar a nota não é. **Declare a escolha na letra B e o `warn` na letra G.**
2. **Como o cenário CHEGA a `processar`.** `processarNota` exige status `EM_ENTRADA_NF`/
   `ENCAMINHADO_FATURAMENTO` **e** `validarDadosProcessamento` (NF, fornecedor, data de emissão,
   data de entrada e `valor_total_nota > 0` — `receiptService.js:545-555`). Cada cenário diz **por
   qual caminho** passa, e os dois caminhos existem de propósito: (a) pelo **workflow real**
   (`encaminhar_compras` → `finalizar_compras` → `iniciar_faturamento`, `PUT /fiscal` com os dados, e
   `processar`) — é o que o (4) usa, porque é o gesto do usuário; (b) chamando
   `receiptService.darEntradaEstoque` direto (exportada de propósito, `:1012`) — para o (5) e o (8),
   que medem idempotência e não workflow. **Não** invente um `UPDATE` de status à mão para pular o
   `/fiscal` no (4): é justamente o trecho onde a barreira da Etapa 36 vive, e pular ali foi o que
   escondeu o Critical da 36.

| Não faça | Por quê | Cai em |
|---|---|---|
| somar em `processarNota` | `aprovarRecebimento` chama `darEntradaEstoque` **direto** (ramo `APROVADO`, com rota e teste) — esse caminho creditaria estoque sem contar ao pedido | o cenário (6) |
| somar **fora** do claim `entrada_estoque_em IS NULL` | reprocessar somaria de novo (o defeito que esta função já pagou: 10 viraram 20) | o cenário (5) |
| somar **antes** de `entrouFisicamente = true` | falha no motor devolve a marca (`entrada_estoque_em = NULL`) e o pedido ficaria creditado por material que não entrou | o cenário (7) |
| somar `quantidade_esperada` em vez de `qtd` | `qtd` é `quantidadeDoItem(item)` — o **mesmo** número que moveu estoque; usar outro faz o pedido e o estoque discordarem | o cenário (4) |

**Cenários (acrescentados ao arquivo da T1):**

```
(4) pedido de 10, recebimento de 6: ANTES de processar quantidade_recebida === 0;
    DEPOIS === 6  (e o saldo do material no estoque subiu 6 — as duas contas concordam)
(5) REPROCESSAR a mesma nota -> continua 6, nao 12   [a asserção que mede o dano]
(6) o OUTRO caminho: recebimento aprovado por POST /recebimentos/:id/aprovar (sem processarNota)
    -> quantidade_recebida tambem baixa
(7) RN-23: dois recebimentos de 5; so o primeiro processado -> quantidade_recebida === 5
    e o segundo, parado em RECEBIDO, nao entra na conta
    (⚠️ nao existe status CANCELADO de recebimento — medido; este e o equivalente alcancavel)
(8) dois recebimentos de 5, os DOIS processados -> 10

(4b) (Fase 2) A LINHA DO PEDIDO COM quantidade_recebida NULL EXPLICITO (nao DEFAULT):
     INSERT INTO itens_pedido_compra (..., quantidade_recebida) VALUES (..., NULL)
     -> depois de processar 6, a coluna vale 6 (e nao NULL)
     [sem esta linha, a sabotagem 4 (COALESCE) e NO-OP: a coluna nasce com DEFAULT 0 e o
      cenario (4) afirma === 0 ANTES de processar, entao `null + 6` nunca acontece em teste.
      Este cenario e o UNICO produtor de NULL na base — e existe porque producao pode ter
      linhas anteriores ao ALTER em bancos onde alguem inseriu NULL a mao]

(9) (Fase 2) NAO-FATAL: com a tabela itens_pedido_compra RENOMEADA (dbRun
    'ALTER TABLE itens_pedido_compra RENAME TO itens_pedido_compra_off') o processar de um
    recebimento com pedido_item_id -> continua 200 / PROCESSADO e o estoque sobe
    [prova que a contagem do pedido NAO pode derrubar a entrada de nota; o warn no console e
     o preco declarado. Restaure o nome no fim do cenario]
```

- [x] **Step 1: escrever os cinco cenários**
- [x] **Step 2: rodar e LER.** Previsão: **(4), (6), (8) vermelhos** na asserção do valor
      (`0 !== 6`); **(5) e (7) VERDES antes do conserto** — e isso é esperado e **tem de ser dito**:
      enquanto ninguém soma, "continua 6" e "não entra na conta" são verdadeiros por vacuidade.
      **Eles só valem depois**, e é a sabotagem 1/2 que prova que sabem falhar. Cole as linhas do `✗`.
- [x] **Step 3: implementar** as 4 linhas, com o comentário do porquê do lugar (os dois caminhos de
      entrada; o claim; depois da entrada física).
- [x] **Step 4: rodar o arquivo, a suíte do serviço e os quatro arquivos que recebem por pedido**

```
cd server && node tests/api/pedidoSaldoRecebido.api.test.js
cd server && node tests/api/recebimentoEntradaAtomica.api.test.js
cd server && node tests/api/loteRecebimento.api.test.js
cd server && node tests/api/recebimentoQuarentena.api.test.js
cd server && node tests/api/solicitacaoCicloVida.api.test.js
cd server && node tests/api/integracaoComprasJornada.api.test.js
cd server && node tests/api/compraContextoMaterial.api.test.js
cd server && npm run test:almoxarifado
```

> Medido, para não parecer regressão alheia: **`solicitacaoCicloVida.api.test.js` tem um cenário que
> recebe o MESMO pedido duas vezes** (o do dedupe de auditoria), e ele **acrescenta uma linha nova ao
> pedido** antes do segundo recebimento — com saldo, continua 201. Se ele ficar vermelho, o achado é
> da T2/T3, não dele.

- [x] **Step 5: sabotagens**

| # | Sabotagem | Âncora (`grep -cF` = 1 **pós-conserto**) | Qual asserção tem de cair |
|---|---|---|---|
| 1 | ⚠️ **(Fase 2) NÃO "mover o `UPDATE` para dentro de `processarNota`"** — dentro de `processarNota` não existem `item` nem `qtd` no escopo (`receiptService.js:865-910`), e o arquivo morreria em `ReferenceError` no primeiro cenário, derrubando **todos** juntos: é exatamente a regra (iv) deste plano. A sabotagem que produz o **mesmo defeito** de forma legível é **condicionar o `UPDATE` ao status do documento**: envolvê-lo em `if (rec.status === 'EM_ENTRADA_NF' \|\| rec.status === 'ENCAMINHADO_FATURAMENTO') { … }` — `rec` **está** no escopo de `darEntradaEstoque` (é parâmetro), e o efeito é idêntico: só o caminho `processarNota` conta ao pedido | o bloco do `UPDATE itens_pedido_compra` | **(6)**, o caminho `aprovar` — e **só** ele. Se (4) e (8) continuarem verdes e o (6) cair, o controle valeu exatamente onde tinha de valer |
| 2 | mover o `UPDATE` para **fora** do `if (!claim) continue` (antes do claim) | o mesmo bloco | **(5)**, `continua 6, nao 12` |
| 3 | somar `item.quantidade_esperada` em vez de `qtd` | `[qtd, item.pedido_item_id]` | **(4)**, na metade em que a recebida difere da esperada (o cenário usa 6 recebidos de 10 esperados) |
| 4 | trocar `COALESCE(quantidade_recebida, 0)` por `quantidade_recebida` nu | o mesmo bloco | **(4b)** — **(Fase 2) e não o (4)**: a coluna nasce `DEFAULT 0` (é o que a T1 afirma), então no (4) a conta é `0 + 6` e a sabotagem seria **no-op**. Só a linha inserida com `NULL` **explícito** do cenário (4b) faz `null + 6 = null` |
| 5 **(Fase 2)** | remover o `try/catch` não-fatal do `UPDATE` do pedido (deixar o `throw` subir) | o `catch` do `UPDATE itens_pedido_compra` | **(9)**, que passa a devolver 400/500 no processar com o estoque já movido — é a prova de que a contagem do pedido não pode derrubar a entrada de nota |

- [x] **Step 6: commit**

#### ✅ Task 3 EXECUTADA — commit `d062889`

**Mapa de linhas RE-DERIVADO (as citações da Fase 2 ficaram velhas — elas são pré-T1/T2 e erram por
~350 linhas; quem ler as antigas cai no meio de outra função):**

| O que a Fase 2 citou | Onde está HOJE (pós-`57ace18`) |
|---|---|
| griffagem de séries não-fatal, `:797-807` | **`:1143-1153`** (o `try/catch` com `console.warn`, molde copiado) |
| o `catch` que NÃO devolve o claim, `:826-836` | **`:1172-1182`** (`if (!entrouFisicamente)` + `throw e`) |
| `processarNota`, `:865-910` | **`:1211-1256`** |
| `darEntradaEstoque` exportada, `:1012` | **`:1358`** |
| `validarDadosProcessamento`, `:545-555` | **`:891-901`** |
| guarda de tabela ausente de `listarPedidosCompraAux`, `:955-957` | **`:1301-1303`** |
| guarda de tabela ausente de `gerarContaPagar`, `:842-844` | **`:1188-1190`** |
| o claim / `entrouFisicamente = true` | **`:1030-1034`** / **`:1120`** |

O `UPDATE` novo entrou **depois** do bloco da griffagem e **antes** do `if (reter)` (linhas
`:1155-1199` do arquivo pós-conserto): antes do `reter` de propósito — uma falha na QUARENTENA
deixaria o pedido sem contar se a soma viesse depois dela, e a soma já é devida quando o estoque
entrou.

**RED literal (antes do conserto), as linhas reais do `✗`:**

```
✗ (4) ...: a linha do pedido tem de somar os 6 que entraram no estoque        0 !== 6
✗ (4b) ...: null + 6 em SQLite e NULL: sem COALESCE ...                    null !== 6
✗ (5) ...: a 1a passada soma 6                                                0 !== 6
✗ (6) ...: somar dentro de processarNota deixaria ESTE caminho ...            0 !== 6
✗ (7) ...: o segundo documento existe mas NAO entrou no estoque ...           0 !== 5
✗ (8) ...: Expected values to be strictly equal                               0 !== 5
4 passou, 6 falhou     (verdes na RED: (1), (2), (3) da T1 e o (9))
```

**GREEN:** `10 passou, 0 falhou`, com o `warn` do (9) **impresso na saída** —
`[recebimento] soma no saldo do pedido de compra falhou (item 9, linha do pedido 8, recebimento 9):
SQLITE_ERROR: no such table: itens_pedido_compra` —, que é a prova de que o caminho não-fatal
**executou** e não só existe.

**Números reais:** `pedidoSaldoRecebido` **10/10** (era 3/3) · suíte de API **176/176 arquivos OK**
· `test:almoxarifado` 42/42 · vizinhos um a um: `recebimentoExcedentePedido` 13/13,
`recebimentoEntradaAtomica` 7/7, `loteRecebimento` 9/9, `recebimentoQuarentena` 5/5,
`solicitacaoCicloVida` 18/18, `integracaoComprasJornada` 1/1, `compraContextoMaterial` 14/14,
`recebimentoExcedente` 16/16 (a Etapa 36 inteira).

**Sabotagens** (as cinco âncoras conferidas com `grep -cF` = **1 pós-conserto** antes de rodar;
`perl -0pi`/`perl -0777 -i -pe`; md5 antes/durante/restaurada; restauro por **cópia do scratchpad**
+ `diff -q`, nunca `git checkout --`; md5 pós-conserto = `e9a01b02…`):

| # | Âncora (= 1) | md5 sabotado | Asserção que caiu |
|---|---|---|---|
| 1 | `if (item.pedido_item_id) {` → `if ((rec.status === 'EM_ENTRADA_NF' \|\| …) && item.pedido_item_id) {` | `c269e8e4…` | **(6)** *"somar dentro de processarNota deixaria ESTE caminho creditando estoque sem contar ao pedido"*, **e também (5) e (8)** — `7 passou, 3 falhou`. ⚠️ **Divergência da previsão** (que dizia "(6) e **só** ele, com (4) e (8) verdes): (5) e (8) entram pelo caminho **(b)** (`darEntradaEstoque` direto, que o próprio brief manda usar neles) e ali `rec.status` é `RECEBIDO` — a sabotagem os alcança pelo **mesmo** defeito. (4) e (4b), que passam pelo workflow real, ficaram **verdes**, exatamente como o plano previu. O controle valeu: o que caiu foi o conjunto "todo caminho que não é `processarNota`" |
| 2 | bloco do `UPDATE` movido para **antes** do claim (entre `if (qtd > 0) {` e `const claim = …`) | `d721f908…` | **(5)** e **só** ela, na asserção *"somar FORA do claim faria 6 virar 12"* — **`12 !== 6`**. `9 passou, 1 falhou`. É a medida exata do defeito que esta função já pagou |
| 3 | `[qtd, item.pedido_item_id]` → `[item.quantidade_esperada, …]` | `3701f84d…` | **(4)** com **`10 !== 6`** (a esperada é o saldo 10, a recebida 6) — e com ela (4b)(5)(6)(7)(8), **todo** cenário em que recebida ≠ esperada. `4 passou, 6 falhou` |
| 4 | `COALESCE(quantidade_recebida, 0) + ?` → `quantidade_recebida + ?` | `9f75dc2a…` | **(4b)** e **só** ela, com **`null !== 6`** — exatamente como a Fase 2 previu (no (4) a conta é `0 + 6` e a sabotagem seria no-op). `9 passou, 1 falhou`. Sem o cenário (4b) esta sabotagem não derrubaria nada |
| 5 | `} catch (ePedido) {` + `throw ePedido;` (o não-fatal removido) | `9e05dc19…` | **(9)**: `processar` devolveu **`500 !== 200`** com `{"error":"SQLITE_ERROR: no such table: itens_pedido_compra"}` **e o estoque já movido** — a prova de que a contagem do pedido não pode derrubar a entrada de nota. `9 passou, 1 falhou` |

`git diff --stat` depois das cinco: só `receiptService.js` e `pedidoSaldoRecebido.api.test.js` (mais
este plano), com o `md5sum` do serviço de volta em `e9a01b02…` e `diff -q` idêntico à cópia.

**Divergências do plano/brief, declaradas:**

1. **Os cenários (5) e (7) NÃO nasceram verdes**, e o Step 2 previa que nasceriam (verdadeiros por
   vacuidade). Nasceram **vermelhos** porque cada um leva a **metade positiva no mesmo `test()`**
   (regra (i) deste plano): o (5) afirma *"a 1ª passada soma 6"* **antes** de afirmar "não dobra", e
   o (7) afirma *"a linha soma 5"* e não só "não soma 10". Isso é **melhor** do que a previsão — a
   asserção de dano não fica sozinha —, e as sabotagens 1 e 2 continuam discriminando: a 2 derruba
   **só** o (5), e na asserção do dobro.
2. **O (9) nasceu VERDE, e é vacuidade declarada:** sem acumulador nada lança, então "continua 200"
   era verdade antes do conserto. Quem prova que ele sabe falhar é a **sabotagem 5**, que é o único
   controle daquele cenário — executada e registrada acima.
3. **O `UPDATE` não ficou "logo depois de `entrouFisicamente = true`", mas depois da griffagem de
   séries e antes do `if (reter)`.** Motivo: colocá-lo **depois** do `reter` faria uma falha na
   movimentação de QUARENTENA (que roda no mesmo `try`) engolir a contagem do pedido, e a contagem
   já é devida no instante em que o estoque entrou. Está **dentro** do claim e **depois** da entrada
   física, que é o que o plano exigia.
4. **A sabotagem 1 não foi "mover o `UPDATE` para dentro de `processarNota`"** (a Fase 2 já havia
   proibido: `ReferenceError` derrubaria o arquivo inteiro). Foi a forma que a própria Fase 2
   prescreveu — condicionar ao `rec.status` —, aplicada como `&&` na condição que já existia, em vez
   de um `if` aninhado: mesmo efeito, uma linha, e âncora única.
5. **Trailer de co-autoria:** o brief do executor pedia `Co-Authored-By: Claude Fable 5.1`; o commit
   levou `Co-Authored-By: Claude Opus 5 (1M context)`, que é a atribuição vigente do harness nesta
   sessão (e é o modelo que executou). Escolha **reversível** (é texto de commit) e declarada aqui.

**Preocupações para a T4:**
1. **`quantidade_recebida` pode passar de `quantidade`** e agora isso acontece **de verdade**: no
   cenário (12) de `recebimentoExcedentePedido` a linha nasce com 6 de 10 e o documento excedente
   processa mais 6 → a linha fecha em **12 de 10**. É a razão do `Math.max(0, …)` no
   `saldo_pendente` da T4 deixar de ser cosmético: sem ele a rota devolve `-2`.
2. **Item de recebimento com `pedido_item_id` NULL é ignorado em silêncio** (caminho NF puro e
   material fora do pedido — decisão 9). Correto e intencional, mas significa que a soma do pedido
   **não** é auditável a partir do estoque: quem quiser reconciliar tem de olhar `pedido_item_id`.
3. **A contagem pode ficar por fazer sem nenhum erro visível ao usuário** (o não-fatal). Só o
   `console.warn` registra. Vai para a **letra G** do documento de novidades, com o texto do warn.

---

### Task 4: a situação do pedido, derivada na leitura **(galho A)**

**Files:**
- Modify: `server/services/almoxarifado/receiptService.js` (`listarPedidosCompraAux`,
  `situacaoRecebimentoPedido`, `listarItensPedidoCompraAux` nova)
- Modify: `server/routes/almoxarifado/extended.js` (rota nova)
- Create: `server/tests/api/pedidosCompraSaldoAux.api.test.js`

| Não faça | Por quê | Cai em |
|---|---|---|
| escrever `status` (ou coluna nova) em `pedidos_compra` | é tabela **core**: badge cinza com a palavra crua em `Compras.js`, filtro `?status=` que não casa, e `recebido` já existe no vocabulário minúsculo | o cenário (5) |
| filtrar `?pendentes=1` por `saldo_pendente > 0` | pedido cujos itens o Compras ainda não lançou tem saldo 0 e desapareceria | o cenário (3) |
| duplicar a derivação nas duas rotas | duas definições de `PARCIAL` divergem na primeira edição — é a classe de bug que `divergencia.js` existe para matar neste módulo | nada cai hoje — **proibido por escrito** |
| devolver 404 para pedido quitado na rota de itens | não é erro: é a informação de que não há o que receber | o cenário (4) |

**Cenários:**

```
(1) pedido de 10 com 6 recebidos: a linha do aux traz quantidade_pedida 10,
    quantidade_recebida 6, saldo_pendente 4, situacao_recebimento 'PARCIAL'
(2) completado -> 'RECEBIDO' e saldo_pendente 0; sem nenhuma entrada -> 'ABERTO'
(3) ?pendentes=1 nao traz o quitado; TRAZ o parcial e TRAZ o pedido SEM ITENS ('ABERTO').
    Metade positiva: SEM o filtro, os tres aparecem
(4) a rota de itens devolve uma linha por item COM saldo_pendente e com `id` = id da linha
    do pedido; linha SEM material_id nao sai; pedido quitado -> 200 com [];
    pedido inexistente -> 404 'Pedido de compra não encontrado'
(5) O CONTRATO CORE: depois de processar o recebimento inteiro,
    pedidos_compra.status continua EXATAMENTE o valor inserido  [nada escreve na tabela core]

(6) (Fase 2) O FILTRO ANTES DO LIMIT: 50 pedidos QUITADOS criados DEPOIS + 1 pedido ABERTO
    criado ANTES (created_at mais antigo) -> ?pendentes=1 traz o ABERTO.
    [se o filtro rodar em .filter() sobre o resultado, o LIMIT 50 come os 50 quitados e a
     resposta vem [] com um pedido aberto existindo — a tela ficaria sem o unico pedido
     recebivel. Metade positiva: SEM o filtro, a resposta tem 50 linhas (o LIMIT continua
     valendo) e o ABERTO nao esta nelas]

(7) (Fase 2) SALDO NUNCA NEGATIVO: pedido de 10 que recebeu 12 (excedente autorizado,
    processado) -> saldo_pendente === 0 (nao -2) e situacao 'RECEBIDO';
    e a rota de itens NAO devolve essa linha (saldo_pendente > 0 e o filtro dela)
```

- [x] **Step 1: escrever os sete cenários** (**(Fase 2)**: cinco + (6) e (7))
- [x] **Step 2: rodar e LER.** Previsão: **(1), (2), (3), (4) vermelhos** (campos ausentes /
      rota 404 por não existir); **(5) VERDE antes do conserto** — declarado: ele é a régua de que a
      task **não** passou a escrever na tabela core, e nasce verde por definição. A sabotagem 3 é o
      que prova que ele sabe falhar.
- [x] **Step 3: implementar** — subquery de soma por `pedido_id` no aux, `situacaoRecebimentoPedido`
      numa função só, a rota nova espelhando o gate das outras `-aux` (só `auth`).
- [x] **Step 4: rodar**

```
cd server && node tests/api/pedidosCompraSaldoAux.api.test.js
cd server && node tests/api/pedidoSaldoRecebido.api.test.js
cd server && node tests/api/recebimentoExcedentePedido.api.test.js
```

- [x] **Step 5: sabotagens**

| # | Sabotagem | Âncora (`grep -cF` = 1 **pós-conserto**) | Qual asserção tem de cair |
|---|---|---|---|
| 1 | trocar o filtro por `saldo_pendente > 0` | o bloco do `if (pendentes)` | **(3)**, na asserção do pedido **sem itens** presente |
| 2 | trocar `>=` por `>` em `recebida >= pedida` na derivação | `if (pedida > 0 && recebida >= pedida) return 'RECEBIDO'` | **(2)**, em `'RECEBIDO'` (vira `PARCIAL` no caso exato) |
| 3 | acrescentar um `UPDATE pedidos_compra SET status = 'RECEBIDO'` no acumulador | a linha nova (é sabotagem **aditiva**: a âncora é o `UPDATE itens_pedido_compra` da T3) | **(5)** — e é o que prova que o cenário do contrato core não é decorativo |
| 4 | fazer a rota de itens devolver linha sem `material_id` | o `.filter(` da rota nova | **(4)**, na contagem de itens |
| 5 **(Fase 2)** | mover o filtro de `pendentes` para um `.filter()` **depois** da query (fora do `WHERE`) | a cláusula de `pendentes` no `WHERE` | **(6)**, que passa a devolver `[]` — o cenário existe para prender a **posição** do filtro em relação ao `LIMIT 50`, que nenhuma asserção de conteúdo pega |
| 6 **(Fase 2)** | remover o `Math.max(0, …)` do `saldo_pendente` | o `Math.max(0,` da derivação | **(7)**, com `-2` no lugar de `0` |

- [x] **Step 6: commit**

#### ✅ Task 4 EXECUTADA — commit `402070c`

**Mapa de linhas RE-DERIVADO (pós-`d062889`, antes do conserto desta task — as citações anteriores
do plano erram por ~350 linhas):**

| O que o plano/design citou | Onde está HOJE (pós-`d062889`) |
|---|---|
| `listarPedidosCompraAux` (`:967`, "termina em `ORDER BY p.created_at DESC LIMIT 50`") | **`:1342-1357`** (o `ORDER BY ... LIMIT 50` em **`:1355`**) |
| guarda de tabela ausente de `listarPedidosCompraAux` (`:955-957`) | **`:1343-1345`** |
| `carregarItensPedidoCompra` (o filtro `material_id`) | **`:99-105`**, com o filtro em **`:104`** |
| `saldoDasLinhasDoPedido` (T2) | **`:587-600`** |
| o `UPDATE itens_pedido_compra` do acumulador (T3) | **`:1185-1188`**, dentro do `try` não-fatal de `:1184-1194` |
| `module.exports` | **`:1391+`** |
| a rota `GET /recebimentos-aux/pedidos-compra` | `extended.js` **`:1116-1120`** |
| `app.use(... checkModulePermission('almoxarifado'))` que cobre as `-aux` | `routes/almoxarifado.js` **`:282-285`** (conferido: as `-aux` **não** têm `requirePermission`) |

**RED literal (antes do conserto), as sete linhas reais do `✗`:**

```
✗ (1) ...: Expected values to be strictly equal   undefined !== 10
✗ (2) ...: a igualdade EXATA e RECEBIDO ...       + undefined  - 'RECEBIDO'
✗ (3) ...: o pedido quitado PC-E37T4-C3-7 NAO pode aparecer em ?pendentes=1
✗ (4) ...: {}                                     404 !== 200
✗ (5) ...: a situacao do RECEBIMENTO e um campo NOVO ...   + undefined  - 'RECEBIDO'
✗ (7) ...: sem o clamp a rota devolveria -2 ...   undefined !== 0
✗ (6) ...: a fixture exige menos de 50 pendentes no banco ... (veio 50)
0 passou, 7 falhou
```

A previsão bateu em (1)(2)(3)(4)(6)(7). **Divergência no (5)**, declarada: o plano previa
**verde**, e ele caiu — mas **não** na régua do contrato core. As asserções do (5) rodam em ordem e
as três primeiras passaram **antes** do conserto: o acumulador somou 10 (metade positiva),
`pedidos_compra.status` continuou `'aprovado'` (a régua do core, verde por definição como o plano
disse) e a rota ecoou `'aprovado'`. Quem caiu foi a **quarta** asserção, `situacao_recebimento`, que
é trabalho desta task. O espírito da previsão está intacto; o cenário só carrega a asserção do campo
novo junto. **GREEN:** `7 passou, 0 falhou`.

**Números reais:** `pedidosCompraSaldoAux` **7/7** (novo) · suíte de API **177/177 arquivos OK**
(era 176; este arquivo é o 177º) · `pedidoSaldoRecebido` 10/10 · `recebimentoExcedentePedido` 13/13.

**A forma da resposta, verbatim** (os campos **novos** ficam **ao lado** de `status`, o status
core, nunca no lugar dele):

```
GET /recebimentos-aux/pedidos-compra[?search=&pendentes=1]  -> 200
[{ id, numero, valor_total, status, data_pedido, fornecedor_nome, fornecedor_cnpj,
   quantidade_pedida, quantidade_recebida, saldo_pendente,
   situacao_recebimento: 'ABERTO' | 'PARCIAL' | 'RECEBIDO' }]

GET /recebimentos-aux/pedidos-compra/:id/itens  -> 200 (só linhas com saldo_pendente > 0)
[{ id, material_id, material_nome, material_codigo, codigo, descricao, unidade,
   quantidade, quantidade_recebida, saldo_pendente, saldo_pendente_material, valor_unitario }]
  · pedido quitado -> 200 []   · pedido inexistente -> 404 { error: 'Pedido de compra não encontrado' }
```

⚠️ **`saldo_pendente_material` entrou no fix 1 (`eb10d9c`) e é ele que a T5 tem de usar como teto.**
`saldo_pendente` é o que falta **naquela linha**; `saldo_pendente_material` é o **teto que a porta
aceita** para aquele material — `Math.max(0, Σ (quantidade − quantidade_recebida))` sobre **todas**
as linhas do mesmo `material_id`, **sem clamp por linha**, que é exatamente o que
`assertSaldoDoPedidoPermitido` compara (`doMaterial.reduce((s, l) => s + l.saldo, 0)`). Os dois
coincidem no caso comum e **divergem** quando o pedido tem duas linhas do mesmo material e uma
recebeu a mais: A (10 pedidos, 15 recebidos) + B (10, 0) → B mostra `saldo_pendente: 10` e
`saldo_pendente_material: 5`, e um `POST` de 10 para B toma **400** dizendo saldo 5. **O client
limita a digitação por `saldo_pendente_material`**, nunca por `saldo_pendente`, e **não** recalcula
o agregado somando as linhas (seria uma segunda definição de saldo do lado que não decide).

**Sabotagens** (as sete âncoras conferidas com `grep -cF` = **1 pós-conserto** antes de rodar;
`perl -0777 -i -pe` e scripts `perl` no scratchpad; md5 antes/durante/restaurada; restauro por
**perl inverso** + `diff -q` contra `bkp-receiptService-t4.js` no scratchpad, nunca
`git checkout --`; md5 pós-conserto = `90689679…`):

| # | Âncora (= 1) | md5 sabotado | Asserção que caiu |
|---|---|---|---|
| 1 | a cláusula dentro de `if (apenasPendentes) {` → `COALESCE(total_pedido,0) - COALESCE(soma_recebida,0) > 0` | `d3298ed7…` | **(3)** e **só** ela, na asserção *"o pedido SEM ITENS tem de aparecer"*. `6 passou, 1 falhou` |
| 2 | `if (pedida > 0 && recebida >= pedida) return 'RECEBIDO';` → `>` | `b17045c7…` | **(2)** em `'RECEBIDO'`, **(5)** na `situacao_recebimento` do pedido completado e **(3)** na asserção NOVA (ver o achado abaixo). `4 passou, 3 falhou` |
| 3 | **aditiva**: `await dbRun(db, \`UPDATE pedidos_compra SET status = 'RECEBIDO' …\`)` logo depois do `UPDATE itens_pedido_compra` da T3 (âncora `` WHERE id = ?`, [qtd, item.pedido_item_id]); ``) | `c64e0cf9…` | **(5)** e **só** ela, em `status === 'aprovado'` — a prova de que o cenário do contrato core **não** é decorativo. `6 passou, 1 falhou` |
| 4a | `.filter((item) => item.saldo_pendente > 0);` (rota de itens) | `1ea0fbeb…` | **(4)** na contagem (veio `["LINHA-A","LINHA-B"]`: a linha **quitada** voltou) **e (7)** (a linha de 12 de 10 voltou a ser oferecida). `5 passou, 2 falhou` |
| 4b | `return itens.filter((i) => i.material_id);` (`carregarItensPedidoCompra`) | `07cc2f13…` | **(4)** na contagem, agora com `["LINHA-A","LINHA-C"]` — a linha **sem `material_id`** saindo. `6 passou, 1 falhou` |
| 5 | a cláusula de `pendentes` **fora** do `WHERE` + `.filter()` depois da query | `b9164e35…` | **(6)**, com `[]` exatamente como a Fase 2 previu — o `LIMIT 50` comeu os 50 quitados. `6 passou, 1 falhou` |
| 6 | `saldo_pendente: Math.max(0, pedida - recebida),` → sem o clamp | `245a3d22…` | **(7)** e **só** ela, com **`-2`** no lugar de `0`. `6 passou, 1 falhou` |

`git diff --stat` depois das sete: só `receiptService.js`, `extended.js` e o arquivo de teste (mais
este plano), com o md5 do serviço de volta em `90689679…` e `diff -q` idêntico à cópia.

**⚠️ ACHADO da sabotagem 2, e é o único item que mudou o teste depois de ele ficar verde:** a
cláusula SQL de `?pendentes=1` é uma **segunda expressão da mesma regra** — o `WHERE` é a negação
escrita à mão, e a derivação é JS. Elas podem **divergir sem nada cair**: com `>` no lugar de `>=`,
o pedido 8/8 virava `PARCIAL` **e continuava fora** de `?pendentes=1` (a tela diria "falta receber"
num pedido que o filtro de pendências esconde), e o cenário (3) ficava **verde**. O conserto foi
**no teste**: o (3) passou a afirmar, na metade sem filtro, que o pedido escondido é o **mesmo** que
a derivação chama de `RECEBIDO` e o mantido é o que ela chama de `PARCIAL` — a igualdade exata é o
caso de fronteira entre as duas expressões. Com a asserção, a sabotagem 2 derruba (2), (3) e (5).
A duplicação em si **fica** (o filtro tem de rodar no SQL, antes do `LIMIT`, e o SQL não chama
função JS): o que a mata é a asserção de fronteira. Vai para a letra **G**.

**Divergências do plano/brief, declaradas:**

1. **A sabotagem 4 virou DUAS (4a e 4b).** A âncora do plano era "o `.filter(` da rota nova", mas os
   dois recortes do cenário (4) moram em lugares diferentes: o filtro de **saldo** é da função nova
   (`saldo_pendente > 0`) e o de **`material_id`** vive em `carregarItensPedidoCompra`, compartilhado
   com a régua do `POST` (reusar é o que impede duas definições de "linha recebível"). Sabotar só um
   deixaria metade do cenário sem controle positivo, então rodei os dois.
2. **Os cenários (5) e (7) chegam à entrada física por `POST /recebimentos` + `POST
   /recebimentos/:id/aprovar`**, e não pelo workflow inteiro até `processar`. O ramo `APROVADO`
   chama `darEntradaEstoque` **direto** e passa pelo **mesmo** acumulador (a T3 mediu os dois
   caminhos, cenário (6) dela); o roteiro longo já é afirmado em `recebimentoExcedentePedido` (12) e
   `pedidoSaldoRecebido` (4), e repeti-lo aqui faria este arquivo medir workflow em vez de leitura.
3. **Nos cenários de leitura pura (1)(2)(3)(4)(6), `quantidade_recebida` da linha é escrita por
   `dbRun` direto**, como em `recebimentoExcedentePedido` — o que se mede aqui é a **derivação**. Os
   dois cenários que precisam do número REAL ((5) e (7)) passam pela porta.
4. **Cada cenário consulta a rota com `?search=<tag do cenário>`.** Sem isso o `LIMIT 50` faria os
   cenários interferirem uns nos outros — e o (6) cria **50** pedidos de propósito. Por isso o (6) é
   o **último** do arquivo, e ele é o único que consulta sem `search` (precisa da ordem global).
   O `created_at` é **explícito** nele: o `DEFAULT CURRENT_TIMESTAMP` tem resolução de **segundo**, e
   pedidos criados no mesmo segundo empatam no `ORDER BY`.
5. **A soma do aux ignora linha sem `material_id`** (`WHERE material_id IS NOT NULL` na subquery), o
   mesmo recorte de `carregarItensPedidoCompra` e da régua do `POST`. Contar linha de texto livre
   faria a rota dizer `PARCIAL` num pedido que chegou inteiro. Consequência declarada: pedido cujas
   linhas são **todas** sem material conta como `ABERTO` e **continua pendente** — coerente com a
   RN-24, que manda mostrar o que o operador precisa cobrar.
6. **Não há guarda de tabela ausente para `itens_pedido_compra` no aux** (só para `pedidos_compra`,
   que já existia). `initSchema` cria `itens_pedido_compra` em todo banco onde o módulo roda, e um
   `if (!tableExists)` ali esconderia em teste um erro que existiria em produção — a lição da Etapa
   8. O caminho não-fatal da T3 é outro assunto: lá o preço de derrubar era a **entrada de nota**.
7. **Trailer de co-autoria:** o brief pedia `Co-Authored-By: Claude Fable 5.1`; o commit levou
   `Claude Opus 5 (1M context)`, que é a atribuição vigente do harness nesta sessão e o que a T3
   (`d062889`) já havia gravado — trocar agora deixaria a etapa com dois trailers diferentes.

#### 🔧 Task 4 — fix round 1 — commit `eb10d9c`

**Achado da revisão (Important), e ele era real:** o `saldo_pendente` **por linha** podia prometer
mais do que a porta aceita. A régua da escrita é **agregada por material** e soma o saldo das linhas
**sem clamp** — uma linha com excedente autorizado entra **negativa** e **consome** o saldo das
outras linhas do mesmo material. A (M, pedida 10, recebida 15) → −5; B (M, 10, 0) → 10;
`saldoMaterial = 5`. A rota mostrava B com 10, o operador digitava 10 e tomava
`Quantidade recebida (10) maior que o saldo do pedido (5) …` — **sem aviso nenhum antes**.

**Conserto: a LEITURA passa a expor o MESMO número que a ESCRITA compara.** `saldo_pendente_material`
em toda linha, `Math.max(0, Σ (quantidade − quantidade_recebida))` por `material_id`, somado **sem
clamp por linha** (clampar antes daria 10 de novo — o número errado). **A barreira não muda.**
**Descartado:** mudar a régua (ela está certa, é a decisão 3 do design; o furo era da leitura);
trocar `saldo_pendente` pelo agregado (o saldo da linha continua verdadeiro e é o que a T3 soma);
devolver a linha excedida A para "explicar" o 5 (não tem saldo próprio — reabri-la contradiria o
clamp do (7) e o contrato "quitado → `200 []`"); somar as linhas no client (segunda definição de
saldo, do lado que não decide).

**Cenário (8)**, com a fixture da revisão: B traz `saldo_pendente 10` + `saldo_pendente_material 5`,
**A fica fora** da resposta, e — a metade que amarra o campo novo à porta — `POST` de **10** para B
toma **400 com a literal do saldo 5** e `POST` de **5** responde **201**. Metade positiva: pedido de
uma linha por material tem os dois campos **iguais**.

**RED:** `undefined !== 5` (campo ausente). **GREEN:** `pedidosCompraSaldoAux` **8/8** ·
`recebimentoExcedentePedido` 13/13 · suíte **177/177 arquivos OK**.

**Sabotagem** (âncora `grep -cF` = 1 pós-conserto: `saldoPorMaterial.set(chave, (saldoPorMaterial.get(chave) || 0) + linha.saldo);`;
md5 `61a83e34…` → `e5fd05e2…` → `61a83e34…`, restauro por perl inverso + `diff -q`): clampar o saldo
da linha **antes** de somar (`+ Math.max(0, linha.saldo)`) derruba **(8)** com **`10 !== 5`** —
`7 passou, 1 falhou`.

**Preocupações para a T5:**
0. **O teto da digitação é `saldo_pendente_material`, não `saldo_pendente`** (ver a nota da forma da
   resposta, acima). O aviso "Acima do saldo" da tabela de literais tem de citar o mesmo número que
   a porta cita, senão o fix 1 volta pela tela.
1. **O client NÃO pode refiltrar as linhas.** O contrato é "a rota filtra, a tela renderiza": um
   segundo filtro no client criaria a segunda definição de "linha recebível" que a decisão evita.
2. **A rota nova tem de entrar no `mockImplementation` do `api.get`** em
   `RecebimentosAlmoxarifado.test.js` — o mock **rejeita** URL desconhecida por padrão, e sem ela o
   cenário mediria o `catch` da tela (modo de falha 5 desta etapa).
3. **`situacao_recebimento` é MAIÚSCULO e o `status` do pedido é minúsculo**, lado a lado na mesma
   linha da resposta. Quem escrever o badge na tela de recebimento não pode reusar o mapa de cores
   de `Compras.js`, que é indexado pelo vocabulário minúsculo do core.
4. **`saldo_pendente` pode ser 0 num pedido que aparece em `?pendentes=1`** (o pedido sem linhas
   lançadas). A tela não pode tratar `saldo_pendente === 0` como "quitado": quem diz isso é
   `situacao_recebimento === 'RECEBIDO'`.

---

### Task 5: a tela carrega os itens do pedido **(galho B)**

**Files:**
- Modify: `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js`
- Modify: `client/src/components/almoxarifado/RecebimentosAlmoxarifado.test.js` (cenários
  ⚠️ **(Fase 2) `(s)(t)(u)`, e NÃO `(r)(s)(t)`: o arquivo tem 18 cenários hoje e o último já é o
  `(r)`** — `(r) o payload fiscal sai SEM tipo_recebimento…` (`:850`), acrescentado pela onda da
  Etapa 36 (achado F2). Reusar a letra `r` daria duas linhas `test('(r) …')` no mesmo arquivo, e a
  contagem do fechamento (17/18) sairia errada. **Conte com `grep -c "^test(" …` antes de escrever**,
  porque a onda pode acrescentar mais um)

| Não faça | Por quê | Cai em |
|---|---|---|
| esquecer a rota nova no `api.get.mockImplementation` do `beforeEach` | o fallback do mock **rejeita** URL desconhecida, e o cenário mediria o `catch` da tela | os três cenários novos |
| ⚠️ **(Fase 2)** mockar **só** a rota de itens | `/almoxarifado/recebimentos-aux/pedidos-compra` hoje devolve **`data: []`** no `beforeEach` (`RecebimentosAlmoxarifado.test.js:163`), então o `<select>` de pedidos nasce **sem nenhuma opção** e `selecionarPedido` nunca dispara: o cenário mediria um `<select>` vazio e passaria "não mostrou o aviso" por vacuidade. A fixture do pedido `312` tem de entrar **nas duas** URLs — a da lista (com `situacao_recebimento`/`saldo_pendente`) e a de itens | os três cenários novos, todos por vacuidade |
| `Number('')` no campo de quantidade | `0` seria "chegou zero", não "não digitei" — é o defeito que o fix-round 1 da T5 da Etapa 36 pagou do outro lado | o cenário (s) |
| decidir permissão no client | `pode()` **falha aberto de propósito**; quem decide é o backend | o cenário (t), que afirma o **403 do servidor** no DOM |
| reusar a frase `Divergência:` do painel | são duas medidas diferentes (saldo do pedido × esperada do item) | o cenário (s), pela literal |
| mandar `itens: []` quando o tipo é `PEDIDO_COMPRA` | é exatamente o defeito que esta task paga | o cenário (r) |

**Cenários:**

> **(Fase 2) Releia as letras:** os três são **(s)(t)(u)**, na ordem em que aparecem abaixo como
> (r)(s)(t). O payload do (r)/(s) **não leva `quantidade_esperada`** — a esperada nasce do saldo, no
> servidor (contrato 1) —, e é por isso que o cenário (11) da T2 existe: sem ele, um schema Zod de
> item que exija `quantidade_esperada` faria este payload tomar 400 e o cenário mediria o `catch`.

```
(r) escolher o pedido carrega os itens: 'Itens do pedido' e 'Saldo pendente: 10' no DOM,
    UMA chamada a /almoxarifado/recebimentos-aux/pedidos-compra/312/itens, e submeter manda
    api.post.mock.calls[0][1].itens com UM objeto
    { material_id, pedido_item_id, quantidade: 6, quantidade_recebida: 6 } — nunca []
(s) digitar 12 onde o saldo e 10 mostra 'Acima do saldo: 2 a mais que o saldo do pedido (10)'
    e a caixa 'Autorizo o recebimento acima do pedido'; digitar 6 apaga o aviso e o saldo
    continua visivel  [metade positiva]; campo LIMPO nao manda quantidade_recebida: 0
(t) o 403 do servidor aparece no DOM com role="alert", com a LITERAL, e o modal FICA DE PE
    (o formulario nao e limpo — quem tomou 403 nao pode perder o que digitou);
    e pedido quitado (itens []) mostra 'Este pedido já foi recebido por completo.'
```

- [x] **Step 1: escrever os três cenários** (fixture do pedido `312`, item do pedido `9312`; mock da
      rota nova no `beforeEach`)
- [x] **Step 2: rodar e LER**

```
cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/RecebimentosAlmoxarifado.test.js
```

Previsão: os três vermelhos — o (r) em `'Itens do pedido'` ausente no DOM (hoje a tela mostra **só**
o `<select>`), o (s) no aviso, o (t) no bloco de recusa. Cole as linhas reais.

- [x] **Step 3: implementar** — `selecionarPedido` assíncrono buscando os itens; `form.itens` com
      `pedido_item_id`/`saldo_pendente`; bloco de itens renderizado **também** no caminho
      `PEDIDO_COMPRA`; `avisoAcimaDoSaldo`; a caixa sob `pode('autorizar_excedente')`; `erroCriacao`
      no DOM; `handleCriar` com o `map` do caminho do pedido.
- [x] **Step 4: rodar a suíte de client INTEIRA e o build**

```
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```

> `CI=true` faz warning virar erro no build. E a suíte inteira é obrigatória aqui: a tela de
> Recebimentos tem 17 cenários e a Etapa 34 já pagou um caso de bloco novo remontando o de anexos —
> o bloco de itens **do modal** não toca o painel, mas a régua é a suíte, não o argumento.

- [x] **Step 5: sabotagens**

| # | Sabotagem | Âncora (`grep -cF` = 1 **pós-conserto**) | Qual asserção tem de cair |
|---|---|---|---|
| 1 | voltar `handleCriar` a mandar `itens: []` no caminho do pedido | o bloco do `map` do caminho `PEDIDO_COMPRA` | **(r)**, no `toEqual` do payload |
| 2 | trocar `>` por `>=` no `avisoAcimaDoSaldo` | `recebida > saldo` no aviso | **(s)**, na metade positiva (digitar 6 passaria a mostrar o aviso) |
| 3 | alterar a literal `Acima do saldo:` | `Acima do saldo:` | **(s)**, pela literal |
| 4 | remover o `pode('autorizar_excedente')` da caixa | `pode('autorizar_excedente')` (dará 2 — o painel da 36 tem o outro; use o **bloco do modal**) | **nada**, previsto: o hook é mockado com `pode: () => true`. **Caso 2 da `fechar-etapa`** — mantenha a guarda e **declare** que a suíte não a protege; a prova real é o 403 do servidor do cenário (t) |
| 5 | limpar o formulário no `catch` do 403 | o bloco do `catch` de `handleCriar` | **(t)**, na asserção de que o modal continua de pé com o valor digitado |

- [x] **Step 6: commit**

#### ✅ Task 5 EXECUTADA — commit `a9acb4c`

**As letras são `(u)(v)(w)`, e NÃO `(s)(t)(u)`.** O plano previa `(s)(t)(u)` contando 18 cenários;
`grep -c "^test(" …` no HEAD `eb10d9c` deu **20**, e o último já era o `(t)`. Terceira vez que a
contagem do plano ficou velha nesta tela — o arquivo tem hoje **23** cenários.

**RED literal (antes do conserto):**

```
× (u) escolher o pedido carrega os itens ...   expect(chamadasItensPedido(312)).toHaveLength(1)
                                              Expected length: 1 / Received length: 0 / []
× (v) acima do saldo do material mostra o aviso ...
      TypeError: 'set value' called on an object that is not a valid instance of HTMLInputElement
× (w) 400 e 403 do servidor aparecem no modal ...   (o mesmo TypeError)
Tests: 3 failed, 20 passed, 23 total
```

A previsão bateu no espírito e **divergiu na forma**: o (u) caiu na **rota não chamada** (e não em
`'Itens do pedido'` ausente, que é a asserção seguinte), e o (v)/(w) caíram em `digitar(null, …)` —
o campo de quantidade do pedido **não existia**, então o helper recebeu `null`. É vermelho
específico e legível, mas vale registrar: em tela sem o bloco, o RED chega pelo helper, não pela
asserção.

**GREEN:** `RecebimentosAlmoxarifado.test.js` **23/23** · suíte de client **47 arquivos / 710
testes** (era 47/707) · `CI=true npx react-scripts build` → **"Compiled successfully."**, sem
warning novo. Saída limpa: só os dois avisos pré-existentes (React Router future flags e o
`HTMLCanvasElement.prototype.getContext` do `jspdf`, que entra por `EtiquetasPdfModal`).

**O que a tela passou a fazer** (`RecebimentosAlmoxarifado.js`):

| Antes | Agora |
|---|---|
| escolher o pedido limpava `itens: []`; o modal mostrava **só** o `<select>` | `selecionarPedido` é **assíncrono** e busca `…/pedidos-compra/:id/itens`, montando uma linha **editável** por item com `Saldo pendente: <n>` |
| `handleCriar` mandava `itens: []` no caminho do pedido, e o servidor preenchia o **saldo inteiro** | payload por item: `{ material_id, pedido_item_id, quantidade, quantidade_recebida }` — **sem `quantidade_esperada`** |
| nada avisava antes do 400 | `Acima do saldo: <n> a mais que o saldo do pedido (<teto>)` + a caixa `Autorizo o recebimento acima do pedido` sob `pode('autorizar_excedente')` |
| a recusa do POST só ia para o toast | `erroCriacao` no DOM com `role="alert"`, e o formulário **não** é limpo |
| o `<select>` pedia a lista sem filtro | `GET …/pedidos-compra` com `params: { pendentes: 1 }` — o filtro da T4 ganhou chamador |

**Sabotagens — SEIS, e cinco derrubaram a asserção prevista.** md5 pós-conserto
`26f15cdb521d345e9ce64ea032d96dba`; restauro por **perl inverso** (ou pela cópia
`bkp-RecebimentosAlmoxarifado-t5.js` do scratchpad quando o `\Q…\E` do padrão inverso engoliu o
`\n`), com `diff -q` contra a cópia depois de cada uma:

| # | Âncora (`grep -cF` = 1) | md5 sabotado | Asserção que caiu |
|---|---|---|---|
| 1 | `? itensInformados.map((i) => ({` → `? [].map(…)` | `dc7705b3…` | **(u) e (v)**, no `toEqual` do payload (`Received: []`). `2 failed, 21 passed` |
| 2 | `if (!(recebida > saldo)) return null;` → `>=` | `8c1cd9dc…` | **(u)**, na asserção de **fronteira** (ver o achado abaixo), com `Acima do saldo: 0 a mais que o saldo do pedido (10)` no DOM. `1 failed, 22 passed` |
| 3 | `Acima do saldo: {diff} a mais que o saldo do pedido ({saldo})` → `Excedente: …` | `0230cfb8…` | **(v)**, pela literal. `1 failed, 22 passed` |
| 4 | `{temExcedenteNoPedido && pode('autorizar_excedente') && (` → sem a guarda | `be56a267…` | **nada**, exatamente como previsto — o hook é mockado com `pode: () => true`. **Caso 2 da `fechar-etapa`**: a guarda **fica** e está **declarado** que a suíte não a protege; a prova real é o **403 do servidor** no (w) |
| 5 | `setErroCriacao(msg);` + `setForm(… quantidade: '' …)` (aditiva) | `13f7a8b3…` | **(w)**, em `inputQtdPedido(9312).value` → `Expected "12" / Received ""`. `1 failed, 22 passed` |
| 6 **(nova)** | `return Math.min(doMaterial, daLinha);` → `return daLinha;` | `37e3bcaf…` | **(w)**, no teto da linha B do pedido 314 → `Expected "5" / Received "10"`. `1 failed, 22 passed` |

`git diff --stat` depois das seis: só os dois arquivos de client (mais este plano), md5 de volta em
`26f15cdb…`.

**⚠️ ACHADO da sabotagem 2, e ele mudou o teste depois de ele ficar verde:** a previsão do plano
("digitar 6 passaria a mostrar o aviso") estava **errada** — `recebida >= saldo` só difere de
`recebida > saldo` na **IGUALDADE**, e `6 >= 10` é falso do mesmo jeito. Sem asserção no ponto de
igualdade, a sabotagem 2 **não derrubaria nada**. O caso de igualdade é justamente o **mais comum
da tela**: a linha nasce com a quantidade igual ao saldo, então com `>=` **todo recebimento
completo** nasceria acusado de estar acima do pedido, com a frase absurda "0 a mais que o saldo do
pedido (10)" e a caixa de autorização oferecida por reflexo. O conserto foi **no teste**: o (u)
afirma, com o campo recém-nascido em 10 de 10, que **não** há aviso e que **não** há caixa. Vai
para a letra **G**.

**⚠️ SEXTA sabotagem, acrescentada porque o teto por material estava sem controle positivo:** a
fixture original tinha `saldo_pendente === saldo_pendente_material === 10`, e trocar um pelo outro
no `tetoDaLinhaDoPedido` **não derrubava nada** — a preocupação 0 da T4 (o fix 1) ficaria entregue
e desprotegida. Entrou o pedido **`314`** na fixture: uma linha (`9314`) com `saldo_pendente: 10` e
`saldo_pendente_material: 5`, que é a forma da resposta quando outra linha do **mesmo material** já
recebeu a mais. O (w) afirma que a tela **exibe** o saldo da linha (10) e **nasce no teto** (5), e
que digitar 10 dispara `Acima do saldo: 5 a mais que o saldo do pedido (5)`.

**Divergências do plano/brief, declaradas:**

1. **A quantidade nasce em `Math.min(saldo_pendente_material, saldo_pendente)`**, e não "igual ao
   saldo" como diz o design (e). São iguais no caso comum; quando divergem, nascer no saldo da
   **linha** daria ao operador um default que a porta **recusa com 400**. O client **não soma** as
   linhas do pedido para achar o agregado (seria a segunda definição de saldo proibida pela
   decisão) — ele lê o campo que a rota manda. ⚠️ **O fix 1 abaixo mudou o que o `Math.min`
   governa:** ele segue valendo para a quantidade INICIAL da linha, e **não** para o aviso, que
   compara **a soma digitada por material** com `saldo_pendente_material`.
2. **O payload leva `autorizar_excedente` (booleano) sempre**, e não só quando marcado: o servidor
   compara `=== true`, e uma chave condicional daria dois formatos de payload para a mesma porta.
   O caminho **NF não mudou** de forma (continua com `quantidade_esperada`) — sem pedido não há
   saldo, e a única referência é o que o operador declarou.
3. **`GET …/pedidos-compra` passou a levar `?pendentes=1`.** Não estava no brief, e é o que dá
   chamador ao filtro da T4 — sem isso, um banco com 50 pedidos quitados mais novos deixaria o
   `<select>` sem o pedido recebível (o furo que a Fase 2 mediu). **Consequência declarada:** a
   lista é carregada na **montagem da tela** e pode envelhecer, então escolher um pedido quitado
   continua possível — e é por isso que a tela **avisa** em vez de oferecer bloco vazio. A fixture
   do teste mantém o pedido `313` na lista de propósito, simulando exatamente essa lista velha.
4. **Campo limpo em TODAS as linhas recusa antes do POST** (`Informe a quantidade recebida de ao
   menos um item do pedido`), em vez de mandar `itens: []`. Mandar vazio é o defeito que esta task
   paga: o servidor preencheria o saldo inteiro. Linha limpa com **outras** preenchidas sai do
   payload — é "esta linha não chegou".
5. **Estados separados para "carregando", "a rota falhou" e "pedido sem saldo".** Um só faria a
   tela dizer "já foi recebido por completo" quando a requisição **caiu** — acusando o pedido para
   esconder erro de rede (RN-04/05 da Etapa 35).
6. **Trailer de co-autoria:** o brief pedia `Claude Fable 5.1`; o commit levou
   `Claude Opus 5 (1M context)`, como a T3 e a T4 — trocar agora deixaria a etapa com dois
   trailers diferentes.

**Preocupações para a T7 (integração) e para o fechamento:**

1. ~~**A tela não tem seletor de "linha" quando duas linhas dividem um material.**~~ **A metade
   perigosa foi CORRIGIDA no fix 1** (bloco abaixo): o aviso passou a comparar a **soma digitada
   por material** com `saldo_pendente_material`, então duas linhas de 5 num material cujo agregado
   é 5 **avisam desde o início**, com a caixa de autorização — antes a tela ficava calada e o 400
   chegava sem aviso. O que sobra é só o **default** nascer somando acima do teto nesse caso: o
   operador vê o aviso e ajusta. Distribuir o agregado entre as linhas continua **fora** (seria o
   client decidindo saldo por linha). Letra **G** apenas para o default.
2. **`situacao_recebimento` não aparece na tela.** A T4 a expõe na rota de lista e o `<select>`
   mostra só `numero — fornecedor`. Não é regressão (nunca mostrou), mas é valor da T4 ainda sem
   consumidor visual — candidato a uma linha no `<option>`, medindo o mapa de cores de `Compras.js`
   (que é indexado pelo vocabulário **minúsculo** do core e **não** serve para `ABERTO`/`PARCIAL`).
3. **A guarda `pode('autorizar_excedente')` do modal não é protegida pela suíte** (sabotagem 4). O
   hook é mockado com `pode: () => true` em todo o arquivo, e mockar por cenário exigiria
   `jest.doMock` + reimport — custo alto para uma guarda que é conveniência de interface. Quem
   decide é o backend, e isso **tem** cenário: o 403 do (w).

#### 🔧 Task 5 — fix round 1 — commit `838f971`

**Achado da revisão (Important), e ele era real — com DUAS faces opostas.** `tetoDaLinhaDoPedido`
comparava **linha a linha** contra `Math.min(saldo_pendente_material, saldo_pendente)`. O servidor
(`assertSaldoDoPedidoPermitido`) faz outra conta: agrupa os itens do payload por `material_id`,
**soma** a recebida declarada de cada um e mede o total contra o saldo **agregado** do material
(`doMaterial.reduce((s, l) => s + l.saldo, 0)`, sem clamp por linha) — que é exatamente o
`saldo_pendente_material` da rota. As duas contas divergem nos **dois** sentidos:

| Caso | A tela dizia | A porta faz |
|---|---|---|
| duas linhas pendentes do mesmo material (C 10/0, D 6/0, agregado **16**), digitar 12 só em C | teto de C = `min(16, 10) = 10` → `Acima do saldo: 2 a mais` **e a caixa de autorização** | soma 12 contra 16 → **201, sem excedente nenhum**. A tela pedia autorização para o que não era excedente, treinando o operador a marcar a caixa por reflexo |
| duas linhas de 5 num material cujo agregado é **5** (uma terceira linha estourou), as duas em 5 | `5 > min(5,5)` é falso nas duas → **nenhum aviso** | soma 10 contra 5 → **400** `maior que o saldo do pedido (5)`, sem nada na tela antes |

**Conserto — o client compara o MESMO que o servidor compara.** `somaDigitadaDoMaterial(material)`
= Σ das quantidades **informadas** em todas as linhas daquele material; a condição de excedente é
`soma > saldo_pendente_material`, e ela é do **MATERIAL**: o aviso sai em **todas** as linhas dele,
e a caixa aparece (sob `pode`) quando **qualquer** material está acima. A literal não mudou; o
número passou a ser `soma − saldo_pendente_material`. `saldo_pendente` continua **exibido** como
informação do que falta naquela linha — só deixou de governar o aviso.

`Math.min` **ficou** onde ele é a pergunta certa: a quantidade **inicial** da linha
(`quantidadeInicialDaLinhaDoPedido`). Nascer no saldo da linha daria um default que a porta recusa
quando o agregado é menor; nascer no teto do material daria, com duas linhas pendentes, duas linhas
somando o dobro do que cabe.

**Descartado:** somar as linhas do PEDIDO no client para recalcular o agregado (é a segunda
definição de saldo que a decisão proíbe — o número vem da rota, em `saldo_pendente_material`);
mudar a régua do servidor (ela está certa, é a decisão 3 do design); esconder `saldo_pendente` da
tela (o operador precisa saber o que falta **naquela** linha para dividir a chegada entre elas);
mostrar o aviso só na linha que o operador acabou de digitar (a soma é do material, e o excedente
não é "culpa" de uma linha).

**Cenários novos — (x) e (y)**, um por face:

```
(x) pedido 315 (C 10/0 + D 6/0 do MESMO material, agregado 16):
    nascem 10 e 6 -> SOMA 16 = agregado -> nenhum aviso  [fronteira]
    digitar 12 em C (12 + 6 = 18) -> 'Acima do saldo: 2 a mais que o saldo do pedido (16)'
      em DUAS linhas (contagem de ocorrencias, nao `toContain` solto) + a caixa
    limpar D (soma 12 <= 16) -> aviso sai, caixa sai, os DOIS 'Saldo pendente' continuam
    submeter -> UM item { 9315, quantidade: 12 } e `autorizar_excedente: false`
(y) pedido 316 (duas linhas de 5, agregado 5): as duas nascem em 5, soma 10 -> o aviso
    'Acima do saldo: 5 a mais que o saldo do pedido (5)' nasce COM o bloco, nas duas linhas
    limpar uma -> soma 5 <= 5 -> aviso sai  [metade positiva]
    e o pedido 314 (UMA linha, teto 5) continua dizendo o mesmo: 10 -> '5 a mais' (a regua nova
    nao trocou uma conta errada por outra)
```

**RED:** `(x)` e `(y)` vermelhos, os dois em `expect(ocorrencias(...)).toBe(2)` → `Received: 0`
(o aviso agregado não existia). `2 failed, 23 passed, 25 total`.
**GREEN:** **25/25** no arquivo · suíte de client **47 arquivos / 712 testes** (era 47/710) ·
build **"Compiled successfully."** · `pedidosCompraSaldoAux` 8/8 e `recebimentoExcedentePedido`
13/13 (o comentário da rota mudou; rodados para provar que nada mais mudou).

**Sabotagens** (md5 pós-conserto `a1d981b98ea600bec0437739fda47606`, âncoras `grep -cF` = 1,
restauro por perl inverso + `diff -q` contra `bkp-RecebimentosAlmoxarifado-t5fix1.js`):

| # | Âncora (=1) | md5 sabotado | Asserção que caiu |
|---|---|---|---|
| A | `const saldo = tetoDoMaterial(item);` → `Math.min(tetoDoMaterial(item), Number(item.saldo_pendente))` | `fdab51ac…` | **(x)**, na **primeira** metade: o aviso aparece já no nascimento das duas linhas (`Acima do saldo: 6 a mais … (10)` e `10 a mais … (6)`). `1 failed, 24 passed` |
| B | `const soma = somaDigitadaDoMaterial(item.material_id);` → a quantidade da própria linha | `bae1d049…` | **(x) e (y)**, na contagem de ocorrências (`Expected: 2 / Received: 0`) — é a sabotagem que prova que a régua é a SOMA. `2 failed, 23 passed` |

**Também mudou (comentário, zero comportamento):** o comentário de `saldo_pendente_material` em
`receiptService.js` (`listarItensPedidoCompraAux`) dizia *"o client tem de limitar por ESTE
campo"*, o que era ambíguo e foi lido como "limite por linha". Agora diz que o client **soma o que
digitou por material** e compara a soma com este campo, e que o agregado pode ser **maior** que o
saldo da linha (duas linhas pendentes) ou **menor** (linha estourada). Único arquivo de `server/`
tocado, e só na documentação.

---

### Task 6: os 21 `ALTER TABLE` que não faziam nada **(galho C)**

**Files:**
- Modify: `server/routes/almoxarifado.js` (apagar `:1775-1796`)
- Modify: `server/tests/api/schemaUnico.api.test.js`
- Modify: `specs/modulo-almoxarifado/00-fundacao-tecnica/README.md` e
  `specs/modulo-almoxarifado/README.md` (a correção vai aqui e **não** na T8, porque é o conserto que
  esta task prova)

| Não faça | Por quê | Cai em |
|---|---|---|
| apagar só as 21 linhas e deixar o comentário `// Adicionar coluna tipo_material_id…` | o comentário descreve o que o bloco **não** faz e sobreviveria mentindo | a varredura do cenário (4) não pega comentário — é **revisão**, e está escrito aqui |
| confiar só na varredura de texto | ela prova que alguém apagou linhas, não que nada dependia delas | o cenário (5) é o controle positivo obrigatório |
| consertar o `initSchema` não-awaited | muda a ordem de subida do servidor inteiro, fora da feature | fora de escopo — vai para a letra **G** |
| apagar a ressalva errada da spec em silêncio | regra 5 do CLAUDE.md: já aconteceu duas vezes nesta base | revisão do fechamento |
| ⚠️ **(Fase 2)** deixar no arquivo de rotas um **comentário** explicando a remoção que contenha as palavras `ALTER TABLE` | o cenário (4) é `!src.includes('ALTER TABLE')` — varredura de **texto**, que não distingue código de comentário. O estilo deste plano manda comentar o porquê em cada mudança, então o executor vai querer escrever "os 21 ALTER TABLE mortos saíram daqui" e **o teste dele fica vermelho depois do conserto**. O precedente já existe: o cenário (1) do mesmo arquivo veta `CREATE TABLE` do mesmo jeito (`schemaUnico.api.test.js:24-27`). O **por quê** vai na mensagem do commit e no doc — no arquivo de rotas, **nenhum** comentário cita o DDL pelo nome | o cenário (4), **depois** do conserto |

**Cenários acrescentados a `schemaUnico.api.test.js`:**

```
(4) routes/almoxarifado.js nao contem mais ALTER TABLE
    assert.ok(!src.includes('ALTER TABLE'))
(5) CONTROLE POSITIVO: app subido SO com initSchema tem as 21 colunas, afirmadas POR NOME
    via PRAGMA table_info das quatro tabelas:
      materiais_almoxarifado: tipo_material_id, ponto_pedido, prazo_reposicao_dias, familia_id
      localizacoes_almoxarifado: tipo, parent_id, pos_x, pos_y, largura, altura, subgrupo
      itens_requisicao_almoxarifado: quantidade_separada, quantidade_entregue
      requisicoes_almoxarifado: ativo, ultimo_lembrete_enviado, valor_total,
        requer_aprovacao_valor, aprovador_valor_id, aprovador_valor_nome,
        data_aprovacao_valor, rejeicao_valor_motivo
    (21 nomes, contados — e o teste afirma o TOTAL 21 tambem, para o dia em que alguem
     acrescentar um nome a lista e esquecer de contar)
```

> ✅ **Task 6 FEITA — commit `4955805`** ("21 ALTER TABLE que erravam a cada boot e a spec que
> apontava para o lugar errado"). Arquivos: `server/routes/almoxarifado.js` (−23 linhas),
> `server/tests/api/schemaUnico.api.test.js` (+65, 3 → **5** cenários),
> `specs/modulo-almoxarifado/00-fundacao-tecnica/README.md`, `specs/modulo-almoxarifado/README.md`.
> Réguas: `node tests/api/schemaUnico.api.test.js` **5/5**; `npm run test:safealter` **3/3**;
> `npm run test:api` **177/177 arquivos OK** (o total de ARQUIVOS não muda porque a task estendeu
> um arquivo existente, como o plano manda — não criou arquivo novo).
>
> **Divergências (3), todas registradas:**
> 1. **Linhas apagadas: `:1774-1796`, não `:1775-1796`** — foi incluída a linha em branco que
>    sobrava entre o banner e o bloco. O banner `// NOVAS TABELAS — Requisições, Tipos,
>    Localizações, Configurações` (`:1771-1773`) **ficou**: ele encabeça as regiões de rotas que
>    vêm depois (TIPOS DE MATERIAL, localizações, configurações), não o bloco de ALTERs. Nenhum
>    wrapper/função ficou vazio — os 21 eram statements soltos no corpo do registrador.
> 2. **O cenário (4) foi escrito como "ALTER fora de `safeAlter(`", não como
>    `!src.includes('ALTER TABLE')`** — mais forte e à prova do dia em que o arquivo de rotas
>    tiver um `safeAlter` legítimo (o molde de `sectorMaterialService.js:71,81,91`). Continua sendo
>    varredura de texto e **continua vetando comentário** que cite o DDL, então a regra da tabela
>    "Não faça" vale igual. Ganhou a metade positiva exigida: `src.length > 1000` (arquivo lido) e
>    contagem de `safeAlter(` em `schema.js` **> 0** (hoje 116).
> 3. **A sabotagem 3 NÃO se comportou como previsto — e o achado é melhor que a previsão.** Ver a
>    tabela abaixo.
>
> **Refs de linha de `schema.js` que apodreceram desde a Fase 0** (as colunas estão todas lá, só
> mudaram de lugar): requisições `:1847-1856` → **`:1870-1879`**; itens de requisição →
> **`:1942-1943`**; materiais `:759` e `:820-822` e localizações `:882-889` inalterados.
>
> **G (não consertado de propósito, vai para o fechamento):** `initSchema(db).catch(...)` em
> `routes/almoxarifado.js:238` é **não-awaited**. Era a causa real de os 21 ALTER falharem em todo
> boot; awaitar muda a ordem de subida do servidor inteiro (o registrador não é `async`), fora do
> escopo desta etapa. Registrado nas duas specs.

- [x] **Step 1: escrever os dois cenários e rodar ANTES de apagar nada** — feito, e a previsão do
      plano se confirmou nas duas metades.

```
cd server && node tests/api/schemaUnico.api.test.js
```

**RED medido (antes de apagar nada):**

```
  ✗ routes/almoxarifado.js nao contem DDL de alteracao fora de safeAlter: DDL/ALTER ainda
    presente no arquivo de rotas: :1776, :1777, :1778, :1779, :1780, :1781, :1782, :1783, :1784,
    :1785, :1786, :1787, :1788, :1789, :1790, :1791, :1792, :1793, :1794, :1795, :1796
  21 !== 0
  ✓ CONTROLE POSITIVO: initSchema sozinho cria as 21 colunas (por nome e no total)
4 passed, 1 failed
```

`grep -c "ALTER TABLE" server/routes/almoxarifado.js` → **21**. E (5) **verde já nessa rodada**,
que é o ponto: com os 21 ALTER ainda no arquivo e nunca tendo rodado com sucesso, `initSchema`
sozinho já entregava as 21 colunas.

Previsão: **(4) vermelho** (`grep -c "ALTER TABLE" server/routes/almoxarifado.js` → **21**);
**(5) VERDE antes do conserto** — e é exatamente por isso que ele é o controle: ele prova, **com os
21 ALTER ainda no arquivo mas sem nunca terem rodado com sucesso**, que `initSchema` sozinho já cria
as 21 colunas. Cole a linha do `✗` e o número do `grep -c`.

- [x] **Step 2: apagado `:1774-1796`** (linha em branco + comentário mentiroso + 21 linhas) e rodado
      de novo: **5 passed, 0 failed** — (4) e (5) verdes —, e
      `grep -c "ALTER TABLE" server/routes/almoxarifado.js` → **0**.
- [x] **Step 3: suíte de API inteira** — `npm run test:api` → **177/177 arquivos de teste OK**,
      `15 passed, 0 failed` no último arquivo. Nenhum teste dependia dos 21 ALTER (era o risco desta
      task: o arquivo de rotas é carregado por **todos** os testes). `npm run test:safealter` → 3/3.

```
cd server && npm run test:api
```

- [x] **Step 4: sabotagens** — 3 previstas + **1 acrescentada** (3b) porque a 3 falsificou a
      previsão do plano. `md5sum` de `routes/almoxarifado.js` pós-conserto: `6fe850d63312705908
      28bab21d5799e6`; de `schema.js`: `88dad7ee7bc65b9fe7a2856af1193eaa`; de
      `schemaUnico.api.test.js`: `748fda98289c9026552afa94ee3b032e`. Os três voltaram ao valor
      pós-conserto depois de cada restauração (perl inverso nas 1/2/3b, `sed` inverso na 3, cópia no
      scratchpad como rede) e `git diff --stat -- server/` voltou com **só** os dois arquivos da
      task. Nenhuma restauração usou `git checkout --`.

| # | Sabotagem | Âncora (`grep -cF` = 1 pós-conserto) | Previsto | **Medido** |
|---|---|---|---|---|
| 1 | reintroduzido **um** `db.run('ALTER TABLE materiais_almoxarifado ADD COLUMN ponto_pedido REAL DEFAULT 0', () => {})` no arquivo de rotas (md5 sabotado `18330ba48d2bede94d42412b15fab5dd`) | `  // TIPOS DE MATERIAL` = **1** ✔ | (4) cai | ✅ **(4) caiu**: `DDL/ALTER ainda presente no arquivo de rotas: :1776` / **`1 !== 0`** (asserção de **contagem**). **(5) ficou VERDE** — é a prova de que (5) sozinho seria vazio para este defeito, e de que (4) é a régua que a task precisava |
| 2 | removido `await safeAlter(db, 'ALTER TABLE materiais_almoxarifado ADD COLUMN ponto_pedido REAL DEFAULT 0');` de `schema.js` (md5 sabotado `62a542fa34945e6a8cdee1bb1aa4fd7c`) | `ponto_pedido REAL DEFAULT 0` = **1** ✔ | (5) cai no nome e no total | ✅ **(5) caiu**: `materiais_almoxarifado.ponto_pedido ausente apos initSchema` — na asserção de **nome**. O total nem foi avaliado (o `assert` de nome aborta antes), então "cai nos dois" era impreciso. **(4) ficou verde** — simetria da 1 |
| 3 | trocado o total afirmado de **21 por 20** no teste (md5 sabotado `fa011e19e316d0e6b82d8d91899bd2d1`) | `assert.strictEqual(total, 21` = **1** ✔ | **nada cai** (total redundante com os nomes) | ❌ **PREVISÃO FALSIFICADA: (5) caiu** — `esperado 21 colunas afirmadas, contadas 21`. Nesta implementação `total` é **derivado** da lista (`total++` por nome afirmado), então o literal 21 não é uma segunda medição do schema: é a guarda de que **a LISTA não encurtou**. Trocar o literal é sabotar a própria expectativa, e o teste acusa |
| 3b | **acrescentada:** removido o nome `'ponto_pedido'` de `COLUNAS_DO_SCHEMA`, **mantendo** o total 21 (md5 sabotado `3d18d1d359cd7b81159dae42c9386a3b`) | `'tipo_material_id', 'ponto_pedido',` = **1** ✔ | — | ✅ **(5) caiu no TOTAL**: `esperado 21 colunas afirmadas, contadas 20`. É a sabotagem que a 3 queria ser: alguém apaga um nome da lista e o total denuncia |

**Conclusão das sabotagens — quem protege o quê (as duas asserções ficam, e não são redundantes):**
a asserção de **nomes** protege o **schema** (cai quando `schema.js` deixa de criar a coluna — sab.
2); a de **total** protege a **lista do teste** (cai quando um nome é apagado dela sem recontar —
sab. 3b). A régua (4) protege contra a **reincidência** no arquivo de rotas (sab. 1) e é a única
que pega esse defeito; a (5) é o que distingue "apaguei porque era morto" de "apaguei e cruzei os
dedos". O achado do plano ("a de total é redundante") **não se confirmou**.

- [x] **Step 5: corrigida a spec 00 e o mapa, DIZENDO que estavam errados.** Na ressalva do item 0.2
      (`00-fundacao-tecnica/README.md:31`) e na linha 00 do mapa
      (`specs/modulo-almoxarifado/README.md:909`): a referência `~1018-1038` **estava errada** (hoje
      são as rotas de conferências, e quem seguiu a ref podia concluir que a pendência já tinha sido
      paga); "vários duplicam" **estava errado**, eram **todos os 21**; e a **premissa de risco
      estava errada** (`ALTER` como origem única → coluna ausente em produção → 500) — medido: 21/21
      mortos, banco real de 161 MB com **0 colunas ausentes**, e o modo de falha real é o
      `initSchema` **não-awaited**, que faz os 21 falharem em **todo** boot (`no such table` em banco
      novo, `duplicate column` em banco migrado), agora registrado como fragilidade da letra **G**.
      Marcar o 0.2 **sem ressalva**, com o hash desta task.

> Feito nos dois arquivos: o item 0.2 virou `[x]` com os três erros da ressalva de 2026-08-11
> registrados (linha, "vários", premissa de risco) em vez de apagados, e o débito técnico 2 do mapa
> passou de 🟡 para ✅. **Ponto para a T8:** um commit não pode conter o próprio hash, então as duas
> specs citam esta task por **assunto + pai** ("commit imediatamente após `838f971`;
> `git log --grep="Etapa 37 Task 6"`"). O fechamento pode trocar as duas menções por **`4955805`**
> — é uma substituição de texto, sem mudança de conteúdo.

- [x] **Step 6: commit `4955805`** — um commit, assunto único, com os quatro arquivos
      (`git add` por caminho, nunca `-A`).

---

### Task 7: a integração que cruza galhos — pela ROTA e pelo SERVIÇO

**Files:**
- Create: `server/tests/api/recebimentoContraPedidoIntegracao.api.test.js`

**O roteiro, igual nos dois caminhos** (é o cenário que o escopo pediu, com o `CANCELADO`
substituído pelo equivalente medido):

> ⚠️ **(Fase 2) O roteiro abaixo foi reescrito: o original ia de "criar" a "processar" em um passo,
> e era o MESMO atalho que esconderia na 37 o Critical que a revisão final da 36 achou.** Entre criar
> e processar existem **três portas** que o usuário atravessa e que **leem a quantidade** do item:
> `PUT /:id/conferir`, `PUT /:id/fiscal` e `validarDadosProcessamento`. Um documento nascido com
> `recebida > esperada` (excedente autorizado **no `POST` desta etapa**) passa por todas elas. O
> roteiro agora vai **até o último gesto**, e cada passo diz qual porta atravessa.

```
pedido de 10 (uma linha)
 1. recebimento de 6  -> 201/ok   [POST, sem excedente]
 2. o CAMINHO COMPLETO ate a entrada, pela ROTA:
      PUT /:id/conferir ecoando quantidade_recebida 6           -> 200
      POST /:id/workflow encaminhar_compras / finalizar_compras / iniciar_faturamento -> 200
      PUT /:id/fiscal com NF + datas + valor_total_nota + itens -> 200
      POST /:id/workflow processar                              -> 200
    -> quantidade_recebida 6, saldo 4, situacao 'PARCIAL',
       estoque do material +6, pedidos_compra.status INTACTO
 3. recebimento de 5  -> 400 'Quantidade recebida (5) maior que o saldo do pedido (4) …'
                         e COUNT(recebimentos) inalterado
 4. mesmo POST com autorizar_excedente + perfil ALMOXARIFE -> 403 nomeando autorizar_excedente
 5. mesmo POST com autorizar_excedente + perfil COMPRAS    -> 201 + trilha EXCEDENTE_AUTORIZADO
    5b. (Fase 2) O DOCUMENTO NASCIDO EXCEDENTE ATRAVESSA AS TRES PORTAS:
        ele nasce esperada 4 / recebida 5 — a populacao do Critical da 36.
        PUT /:id/conferir ecoando 5 como ALMOXARIFE (SEM a flag) -> 200
        PUT /:id/fiscal ecoando 5 (o modal nao tem caixa de autorizacao) -> 200
        [se qualquer um dos dois der 400, o furo e o mesmo F1/R1 da 36 numa porta nova:
         RELATE no plano e conserte a REGRA (as duas portas), nao este teste]
 6. processar o de 5  -> quantidade_recebida 11, situacao 'RECEBIDO', saldo_pendente 0
                         (e nao -1: o clamp da T4)
 7. um terceiro recebimento, criado e NAO processado -> a conta do pedido NAO muda
    7b. (Fase 2) e o QUARTO recebimento, criado ANTES de o terceiro processar, contra o saldo
        que o terceiro ainda nao consumiu -> 201 os DOIS (declarado: o saldo so conta a
        entrada fisica). Afirmar isso e o que impede a proxima sessao de ler a etapa como
        "o pedido nao pode receber mais do que pediu"
 8. ?pendentes=1 nao traz mais este pedido; sem o filtro, traz
```

- [x] **Step 1: escrever o arquivo com os dois blocos** — `97726c3`,
      `server/tests/api/recebimentoContraPedidoIntegracao.api.test.js` (581 linhas), **CINCO** blocos
      e não dois: **A** (do `POST` da tela à entrada física — território do acumulador e da fiação),
      **B** (régua do `POST`, o mesmo gesto com 400/403/201, e o documento nascido excedente
      atravessando `/conferir` + `/fiscal` até `PROCESSADO`), **C** (RN-23), **D** (camada 2:
      GESTOR com a flag e sem-perfil → 403 de `receber_material`, com a metade positiva do ADMIN) e
      **E** (pelo SERVIÇO). Cinco e não um porque as três sabotagens têm de cair em pontos
      **diferentes**, e num `test()` único a primeira asserção a estourar esconderia as outras.
      A, B e C compartilham o **mesmo pedido** de propósito: é a história dele que se mede, e três
      pedidos separados voltariam a ser três testes de unidade. O `POST` usa o payload **literal**
      da T5 (`RecebimentosAlmoxarifado.js:595-601`): `pedido_item_id` + `material_id` +
      `quantidade` + `quantidade_recebida`, **sem** `quantidade_esperada`.
      O bloco **`pela ROTA`** usa
      `request(app).post(...)` e `setUser` para trocar de perfil; o bloco **`pelo SERVIÇO`** chama
      `receiptService.criarRecebimento` / `darEntradaEstoque` direto, com o usuário passado como
      objeto (`processarNota` não entrou: o que o bloco mede é o **acumulador**, e ele mora em
      `darEntradaEstoque` — os dois caminhos de entrada física passam por lá).
      **Os dois são obrigatórios:** a Etapa 25 desta base mediu **12 cenários de unidade verdes e 4
      de integração vermelhos** porque `req.user` é reatribuído pelo `auth` que cada rota redeclara —
      verde por unidade não prova que as partes compõem.
- [x] **Step 2: rodar.** `97726c3` — **verde de primeira**, como previsto: `5 passou, 0 falhou`
      (blocos A/B/C/D/E). ⚠️ **`fechar-etapa`: desconfie de teste que passa de primeira** — as três
      sabotagens abaixo rodaram por isso, e são elas que distinguem "compõem" de "cada uma passa
      sozinha".
- [x] **Step 3: sabotagens de composição** — `97726c3`. Harness: `perl -0pi -e` (`/usr/bin/perl`
      confirmado com `perl -e 'print 1'`; **nunca** `python3`), âncora contada com `grep -cF` =
      **1** nas três, `md5sum` antes/depois/restauro, restauro por **perl inverso** (nenhum
      `git checkout --`), `git diff --stat` vazio ao fim de cada uma. `receiptService.js` pós-T6 =
      `1c9456b066be7eaed436ce236f4cfeab` (o arquivo de produto **não** foi tocado por esta task, e
      o valor pós-restauro é o mesmo três vezes). ⚠️ **Achado do harness, registrado porque custou
      uma rodada:** `perl -0pi -e` com `\n` literal no padrão **não casa** neste arquivo — a
      primeira metade da sabotagem 2 virou no-op silencioso e deixou um `excedentesDoPedido = …`
      atribuindo a um `const` (falha pelo motivo errado). Use **`\r?\n`** em todo padrão
      multi-linha desta base.
      1. **`pedido_item_id` apagado do `INSERT` do item** (âncora
         `r.lastID, item.material_id, linhaResolvida ? linhaResolvida.id : null, qtd,` → `null`;
         md5 `40391a6cd19c25a60b693b39cff12f17`). **Caiu:** bloco **A**, passo 2 — *"a linha do
         pedido tem de somar os 6 que entraram no estoque"*, `0 !== 6`, com o **201 do `POST`
         ainda verde**; e bloco **E** na fiação pelo serviço, `null !== 4`. Exatamente o defeito
         de **fiação** entre dois troncos previsto no plano. Bloco D verde.
      2. **`assertSaldoDoPedidoPermitido` movida para DEPOIS do `inserirComNumeroUnico`** (a
         sabotagem da T2; md5 `c79c5486ce1a5ed63e1dceb5f4e58620`). **Caiu:** bloco **B**, passo 3 —
         *"a recusa tem de acontecer ANTES do INSERT do cabeçalho"*, `2 !== 1`; e bloco **E** na
         equivalente pelo serviço, `8 !== 7`. O **400 continua saindo**: só a contagem acusa o
         documento fantasma. Blocos A e D verdes.
      3. **acumulador somando `item.quantidade_esperada` em vez de `qtd`** (a sabotagem da T3; md5
         `69b5d015f7ec10205e63436d2f302d9d`). **Caiu:** bloco **A**, o **mesmo** passo 2, agora com
         `10 !== 6` (o pedido e o estoque discordando em 4 — é a mensagem da asserção que distingue
         as duas causas); bloco **E** com `10 !== 6`; e bloco **B** na **literal**, que passa a
         falar em `saldo do pedido (0)`. Bloco D verde.
      **Nenhuma sabotagem ficou sem derrubar nada**, e o bloco **D** (camada 2) ficou verde nas
      três — esperado: o 403 de `receber_material` não depende de nenhuma delas.
- [x] **Step 4: os cinco comandos da suíte, com os números LIDOS da saída** — `97726c3`:
      `178/178 arquivos de teste OK` (eram **177**, +1 este arquivo) · `📊 Resultado: 42 passou, 0
      falhou` · `4 passed, 0 failed` / `3 passed, 0 failed` / `sqliteConcurrency: 5 passed, 0
      failed` · `Test Suites: 47 passed, 47 total` + `Tests: 712 passed, 712 total` ·
      `Compiled successfully.` (`main.5a840399.js`, 109.2 kB gzip, `CI=true` sem warning).

```
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```

- [x] **Step 5: commit** — `97726c3` *"Almoxarifado Etapa 37 Task 7: cada peca passava sozinha e
      ninguem percorria a historia do pedido"*. **Só teste** (`+581`, um arquivo): nenhuma linha de
      produto mudou, e `git status --short` ao fim traz apenas o plano modificado e os três
      artefatos não versionados da árvore de abertura (`docs/bkp_bancoprod.md`,
      `server/data/database.sqlite.bak`, `server/nodemon.json`).

**Divergências declaradas (estão no cabeçalho do arquivo de teste, não só aqui):**

1. **O passo 7/7b do roteiro mediria a FLAG, não a regra.** O roteiro pedia um terceiro e um quarto
   recebimento "contra o saldo que o terceiro ainda não consumiu → 201 os DOIS". No pedido da
   história, depois do passo 6, o saldo é **-1** (recebeu 11 de 10, por excedente autorizado): ali
   **qualquer** quantidade é excedente e os dois `POST` precisariam de `autorizar_excedente` +
   COMPRAS — mediriam a permissão, não a RN-23. **Escolhido:** o bloco **C** mede a regra num
   pedido **próprio de saldo limpo** (dois recebimentos de 10 contra um pedido de 10, nenhum
   processado → 201 os dois, a linha continua **0**; depois um deles processa → 10, o outro fica em
   `RECEBIDO`) **e também** afirma, no pedido da história, que um recebimento novo criado com a flag
   **não move a conta** (continua 11) até a entrada física. **Descartado** medir só no pedido
   esgotado: a afirmação que importa ("o saldo só conta a entrada física") ficaria ilegível.
2. **O passo 2 do roteiro não passa por `iniciar_conferencia`.** `PUT /:id/conferir` foi chamado
   direto de `RECEBIDO` (como em `recebimentoPortasIntegracao` da Etapa 36), e `encaminhar_compras`
   aceita `RECEBIDO` — é o caminho que o roteiro escreveu, e ele funciona. (O cenário (12) da T2
   usa `iniciar_conferencia`; os dois caminhos chegam às mesmas três portas.)
3. **A asserção `pedido_item_id` logo após o `POST` ficou FORA do bloco A, de propósito.** Ela já é
   régua da T2 e da T3, e afirmá-la ali faria a **sabotagem 1** cair nela em vez de no passo 2 —
   isto é, a integração mediria a coluna, não a fiação. O bloco **E** a afirma (é o serviço que a
   grava), e no bloco A a prova é o **saldo andando**.
4. **Nada a relatar no 5b.** As duas portas (`/conferir` e `/fiscal`) aceitaram o eco de 5 sobre uma
   esperada de 4 com **200**, sem flag: o F1/R1 da Etapa 36 **não** se repetiu na porta nova, e a
   trilha continuou com **uma** linha (sem a auditoria inflada). Nenhum conserto de regra foi
   necessário.

---

### Task 8: fechamento (use a skill `fechar-etapa`)

- [x] **Step 1: `specs/modulo-almoxarifado/08-recebimento/README.md`** *(feito — redator de desenvolvimento)* — status no topo; o item
      `[ ] Recebimento parcial de pedido` marcado **com o hash**; na tabela de regras, o teste
      `recebimento parcial atualiza saldo pendente do pedido` de ⏳ para ✅ **nomeando o arquivo**; as
      **RN-20 a RN-27** escritas; e a nota de que `[ ] Recebimento excedente só com autorização` foi
      pago pela **Etapa 36** (não por esta) — a 37 acrescentou a **terceira porta** e a régua contra
      o pedido.
- [x] **Step 2: `00-fundacao-tecnica/README.md` + a linha 00 do mapa** *(conferido: a T6 escreveu a correcao DIZENDO que a spec estava errada, o `e0f8b18` trocou a vizinhanca pelo hash `4955805`, e a linha 00 do mapa ganhou o hash aqui)* — já feitos na T6; conferir
      aqui que a ressalva saiu e que a correção **diz** que a spec estava errada.
- [x] **Step 3: manual, seção 14** *(redator de usuário, em paralelo — `docs/almoxarifado-*`)* — a promessa do **14.1** ("o sistema traz os itens, as quantidades
      e os valores unitários já preenchidos") passa a ser **verdade**, e ganha o que ela não dizia:
      o que vem preenchido é o **saldo pendente**, editável; receber acima do saldo exige autorização
      (Administrador ou Compras) e a literal da recusa; e **a entrada no estoque continua sendo o
      único momento em que o pedido baixa** (14.2). Acrescentar o efeito de borda declarado: uma
      linha do pedido pode terminar com recebido maior que o pedido (excedente autorizado, ou duas
      linhas do mesmo material), e a **situação** do pedido é derivada de somas.
- [x] **Step 4: mapa e guia.** *(mapa: redator de desenvolvimento; guia: redator de usuário, em paralelo)* Linha 08 do mapa (`specs/modulo-almoxarifado/README.md:917`) com o
      parcial fechado; e o guia com a seção da **Etapa 37** em linguagem de usuário: tabela
      **Antes → Agora** (o pedido não sabia que foi recebido / agora tem saldo e situação; escolher
      "Por Pedido de Compra" não mostrava item nenhum / agora traz os itens com o saldo, editáveis;
      `POST` aceitava 999 de 10 / agora recusa acima do saldo), **roteiro de teste manual clicável**
      (criar pedido no módulo Compras, receber parcial, ver o saldo, receber o resto, ver
      `RECEBIDO`, tentar acima do saldo com e sem a permissão) e **o que a etapa NÃO cobre**
      (conferência física estruturada, divergência formal numerada, item fora do pedido,
      `initSchema` awaited).
- [x] **Step 5: letra B a partir do próximo número LIVRE** *(redator de usuário — medido no doc, não deduzido: esta etapa começa em **B89**)* (**(Fase 2)**: medido, não "B86") com as
      **15 decisões** do design, cada uma com o escolhido
      e o descartado; **letra C** para o que nenhuma spec registrava (o pedido com 0 escritores; a
      tela que impedia o parcial; `POST` sem régua de saldo); **letra G** para as fragilidades
      (`initSchema` não-awaited; `POST` **sem** pedido continua aceitando excedente — cenário (8) da
      T2, B84 continua valendo lá; `safeAlter` sem régua estrutural própria — sabotagem 1 da T1; item
      fora do pedido sem régua); e **letra A** com a consulta de backfill:

```sql
-- Se o usuario quiser inicializar `quantidade_recebida` a partir do historico (hoje COUNT = 0 em
-- producao, logo NAO ha nada a fazer — a consulta existe para o dia em que houver):
SELECT ipc.id AS item_pedido_id, ipc.pedido_id, ipc.material_id, ipc.quantidade,
       SUM(COALESCE(ri.quantidade_recebida, ri.quantidade_esperada)) AS recebido_historico
  FROM itens_pedido_compra ipc
  JOIN recebimentos_material_almoxarifado r ON r.pedido_compra_id = ipc.pedido_id
  JOIN recebimentos_material_itens_almoxarifado ri
       ON ri.recebimento_id = r.id AND ri.material_id = ipc.material_id
 WHERE ri.entrada_estoque_em IS NOT NULL      -- so o que de fato entrou no estoque
 GROUP BY ipc.id;
```

- [x] **Step 5b (Fase 2): as quatro heranças da onda da 36 que ESTA etapa tem de registrar**, porque
      ela é a primeira a construir sobre elas e porque o plano da 37 foi escrito antes:
      (a) o 400 do excedente desta etapa **copia o sufixo** do 400 da 36 pós-F3 — escreva as **duas**
      literais lado a lado no guia e no manual, para ninguém "aproximar" uma delas depois;
      (b) a régua *"recebida > esperada **E** recebida > armazenada"* vale nas **três** portas a
      partir daqui, e o motivo (documento que **nasce** excedente pelo `POST`) é **novo** — se a onda
      tiver deixado o `/conferir` sem ela, isto é **Critical**, não pendência de doc;
      (c) o schema Zod dos **itens** do `POST` passou a existir e o payload da tela nova **não** leva
      `quantidade_esperada` — dizer, senão a próxima sessão declara a chave "por simetria" e derruba
      a tela;
      (d) o furo do **saldo que só conta a entrada física** (dois documentos abertos contra o mesmo
      saldo) é da letra **G**, e é diferente da corrida de `check-then-insert` já registrada em B80.

> Confira os números livres **antes** de numerar:
> `grep -o "\*\*B[0-9]\+" docs/almoxarifado-novidades-por-etapa.md | sort -u -V | tail -3` e o mesmo
> para `C`, `G` e `A`. Medido nesta Fase 1: o doc está em **B79 / C47 / G11 / A8**, e o fechamento da
> **Etapa 36** ocupa **B80–B85**, **C48+**, **G12+**, **A9/A10** — logo esta etapa começa **depois**
> disso. Se o fechamento da 36 tiver parado em outro número, **vale o doc**, não este parágrafo.
> ⚠️ **(Fase 2) "B86" está desatualizado e o parágrafo acima subestima:** a **onda de revisão final**
> da 36 acrescenta decisões que o rascunho de fechamento não previa (regra nova do excedente nas duas
> portas; fornecedor comparado por **qualquer** perna; schema Zod dos itens; corrida
> `check-then-insert` nomeada) **e** a consulta **A11**. Não escreva B86 por dedução — **meça** com o
> `grep` e comece no próximo livre.

- [x] **Step 6: a próxima tarefa detalhada — Etapa 38** *(feita no fim deste plano — e **não** saiu desta lista de candidatas; ver a nota lá)*, no fim deste plano, com `arquivo:linha`, o
      contrato que cada candidata consome e o que **não** reabrir. Candidatas medidas, em ordem de
      valor: (a) **divergência formal numerada** — agora tem os dois insumos (o campo de conferência
      da 36 e o link `pedido_item_id` desta etapa), e é o que falta para o item da spec 08;
      (b) **barrar item que não está no pedido** (decisão 9 desta etapa — decisão de negócio);
      (c) o `<select>` de fornecedores mandar **`fornecedor_id`** (item (d2) da 36, que faria a perna
      do `fornecedor_nome` na chave da duplicata virar retaguarda); (d) o **`UNIQUE` da NF** depois
      da consulta A9; (e) **A2** da Fase 0 (varredura de `ALTER TABLE` fora de `safeAlter` na pasta
      do módulo) junto com o **`initSchema` awaited**, que são a mesma etapa de fundação; (f) o
      **teto da faixa do clipe** (F12, exige navegador) e os furos **C43/C44** da Etapa 33.
- [x] **Step 7: o checklist final da `fechar-etapa`** — os cinco comandos, com os números **lidos da
      saída**, `git status` limpo (fora os três artefatos não versionados conhecidos), e
      `git merge-base --is-ancestor <hash> HEAD` para **cada** hash citado nos documentos.
- [ ] **Step 8: commit** *(do controlador — os redatores de documentação não commitam)* — um commit, assunto único: o fechamento da etapa.

---

## Self-review do plano

> ⚠️ **(Fase 2) Este self-review passou verde em coisas que a revisão externa derrubou** — vale
> lê-lo junto com a seção final "Fase 2". Em particular: "cobertura RN ↔ task ↔ sabotagem" declarava
> RN-25 → T2 (4)(5) + sabotagem 5, e o caminho **com `itens`** (o da tela) não tinha cenário nenhum;
> "mensagens literais congeladas" congelava um 400 que a Etapa 36 estava trocando no mesmo dia; e
> "nenhum cenário negativo sem metade positiva" não notou que o fluxo **parava em `processar`** sem
> passar pelo `/conferir` e pelo `/fiscal`, que é onde o Critical da 36 morava.

- **Cobertura RN ↔ task ↔ sabotagem.** RN-20 → T2 (1)(3)(7) + sabotagens 1 (comparador) e 2
  (posição); RN-21 → T2 (2)(9) + sabotagem 3 (a literal única, que derruba **dois** arquivos);
  RN-22 → T3 (4)(5)(6)(8) + sabotagens 1 (lugar), 2 (claim), 3 (`qtd`) e 4 (`COALESCE`);
  RN-23 → T3 (7) + T7 passo 7; RN-24 → T4 (1)(2)(3)(5) + sabotagens 1, 2 e **3 (aditiva, a escrita
  na tabela core)**; RN-25 → T2 (4)(5) + sabotagem 5; RN-26 → T5 (r)(s)(t) + sabotagens 1, 2, 3 e 5;
  RN-27 → T6 (4)(5) + sabotagens 1 e 2. **Nenhuma RN sem sabotagem nomeada, e nenhuma sabotagem sem
  a asserção que ela tem de derrubar.**
- **As três sabotagens previstas como "nada cai", ditas de frente.** T1 nº 1 (`safeAlter` →
  `db.run` engolido: a régua estrutural não protege o padrão — a régua dele é
  `npm run test:safealter`), T5 nº 4 (remover `pode('autorizar_excedente')`: o hook é mockado com
  `pode: () => true`) e T6 nº 3 (o total redundante com os nomes). Nos três a instrução é **manter a
  forma segura e declarar**, nunca forjar vermelho nem remover a proteção — caso 2 da `fechar-etapa`.
- **Os três cenários que nascem VERDES, e por que não são teste vazio.** T3 (5) e (7) ("reprocessar
  continua 6", "não processado não conta") são verdadeiros por vacuidade enquanto ninguém soma — só
  passam a valer depois do conserto, e as sabotagens 1/2 da T3 provam que sabem falhar. T4 (5) (a
  tabela core intacta) nasce verde por definição e tem a sabotagem **aditiva** nº 3. T6 (5) (as 21
  colunas) nasce verde **de propósito**: é ele que prova que os 21 ALTER eram mortos, e a sabotagem 2
  prova que ele sabe falhar. **Os quatro estão declarados, não escondidos.**
- **Nenhum cenário negativo sem metade positiva.** T2: `recebida === saldo`, `recebida < saldo`,
  saldo cheio, o **201 do COMPRAS** no mesmo `test()` do 403, e o caminho NF intocado; T3: o valor
  do estoque subindo junto com o do pedido (as duas contas concordam); T4: **sem** o filtro os três
  pedidos aparecem; T5: digitar 6 apaga o aviso e o saldo continua visível; T6: as 21 colunas;
  T7: os passos 1, 2, 5, 6 e 8 são todos positivos.
- **Nenhum id de fixture `1`.** Client: pedido `312`, item do pedido `9312`, recebimentos
  `41`/`58`/`77`/`91`. Servidor: ids lidos do `INSERT`/do `res.body`, **nunca escritos à mão** — e as
  literais que citam número (`Pedido de compra <numero>`) e código de material são montadas a partir
  do banco. Usuários de teste `64`/`65`/`66`.
- **Mensagens literais congeladas, e em um lugar só.** O **403** vive em
  `assertAutorizacaoExcedente`, consumido pelas **três** portas — e a sabotagem 3 da T2 é a prova
  executada disso. Os dois 400 novos (`saldo do pedido`, `já foi recebido por completo`) vivem cada
  um em **um** ponto de `criarRecebimento`. As literais de tela estão na tabela 5 dos contratos.
  **Nenhuma literal é escrita duas vezes no código de produção** — os testes as repetem de propósito
  (é o que os torna régua) e o manual as copia lidas do código.
- **`pedidos_compra` no harness, resolvido e declarado.** Vai para `tests/helpers/testApp.js`
  (precedente de `clientes`/`fornecedores`: tabela **core** que as rotas do módulo fazem `JOIN`),
  **sem FK**, **com `created_at`**, e a T1 roda os **seis** arquivos que hoje a criam por conta
  própria para provar que os DDLs deles viraram no-op. Consequência declarada: o
  `if (!tableExists) return []` de `listarPedidosCompraAux` deixa de ser exercitado em teste — ele
  continua no código por causa de ambiente parcial, e isso está dito para a próxima sessão não achar
  que está coberto.
- **Contratos completos:** as três rotas tocadas têm método, gate, payload, resposta e **todos** os
  códigos de recusa com a literal; a rota nova tem o caso do pedido quitado (200 com `[]`) e o 404; e
  a tabela de `ACAO_PERFIS` diz **onde** cada ação é checada (rota × serviço) e que **nada muda** nela.
- **Consistência de nomes e tipos:** `quantidade_recebida` em `itens_pedido_compra` é `REAL`
  acumulado; `pedido_item_id` é `INTEGER` e aponta para `itens_pedido_compra.id`;
  `situacao_recebimento` é **derivado** e só existe na resposta HTTP (nunca coluna);
  `assertAutorizacaoExcedente(user, autorizado, mensagem400)` e `situacaoRecebimentoPedido(...)` são
  internas do `receiptService`; no client, a quantidade sai do input como **string** e é convertida
  com `Number(...)` **antes** do `api.post`, porque o contrato diz número e o cenário (r) compara com
  `toEqual`. ⚠️ **Não confundir duas palavras "saldo":** aqui saldo é **do pedido de compra**; saldo
  de estoque continua global por material, e nada nesta etapa o toca.
- **Sem placeholders:** todo passo que muda produção traz a literal exata ou o código. As duas coisas
  deixadas para a execução medir estão marcadas e com instrução: o **valor real** do
  `pedidos_compra.status` que o teste da T4 (5) insere (leia do `INSERT`, não escreva `'pendente'` à
  mão), e a **contagem da âncora** `pode('autorizar_excedente')` na T5, que dará **2** depois do
  conserto (o painel da Etapa 36 tem a outra).
- **O que este plano NÃO garante, dito de frente:** (1) nenhum teste desta etapa prova que a caixa de
  autorização **esconde** de quem não tem a permissão — a suíte mocka o hook, e a decisão real é o
  403 do servidor; (2) `POST /recebimentos` **sem** pedido continua aceitando excedente (o "esperado"
  ali é o que o próprio operador digitou) — está no cenário (8) da T2 e na letra G, não escondido;
  (3) item que **não está** no pedido entra sem régua de saldo (decisão 9); (4) nada aqui mede
  produção: `COUNT = 0` nas três tabelas foi medido na Fase 0, e a consulta de backfill da letra A
  existe para o dia em que houver acervo; (5) a guarda não é airtight — dois `POST` simultâneos
  contra o mesmo saldo passam os dois (check-then-insert, sem transação), e isso só fecha na migração
  para Postgres, como já está registrado para a guarda de NF (B80).

---

## Fase 2 — o que a revisão do plano pegou ANTES de executar

Revisor **fresco**, só leitura de código, HEAD `41df1cb` (a onda de correção da Etapa 36 em voo:
`230baf6` F1 e `41df1cb` F2 já commitados; R1–R7 e F3 **ainda não**). Nenhuma suíte inteira rodada,
por acordo. **14 achados: 8 travariam a execução, 6 silenciosos**, e 8 pontos verificados e
sustentados. Todos com arquivo:linha; as correções estão **no lugar**, marcadas **(Fase 2)**.

### Os que travariam (o executor construiria em cima do erro, ou queimaria uma rodada)

| # | Achado | Onde | Correção aplicada |
|---|---|---|---|
| 1 | **RN-25 mente para o pedido que a RN-24 manda mostrar.** "Nenhuma linha com saldo → 400 *já foi recebido por completo*" trata igual dois casos diferentes: o pedido quitado e o pedido **cujo Compras nunca lançou as linhas** (`COUNT itens_pedido_compra = 0`). E é exatamente esse que a RN-24 classifica como `ABERTO` e **mantém** em `?pendentes=1`: a tela o oferece e a porta recusa com uma frase falsa | design RN-25 / plano contrato 1 · `receiptService.js:185-198` | literal **nova** para `COUNT = 0` (`'…não tem itens lançados no módulo Compras'`), cenário **(13)** na T2 com a metade positiva do `?pendentes=1`, e sabotagem **8** |
| 2 | **O fluxo não era traçado até o fim — a lição da 36, repetida.** O `POST` desta etapa passa a **criar** documentos que nascem com `recebida > esperada` (excedente autorizado na criação): população que antes só existia por autorização no `/conferir`. Depois da criação vêm `/conferir`, `/fiscal` e `validarDadosProcessamento`, e a barreira da 36 lê a `quantidade_esperada` **gravada**. Em `230baf6` o `ignorarInalteradas` é passado **só** pelo `/fiscal` (`:464`) e **não** pelo `/conferir` (`:334`) — então, sem a regra nova nas duas portas, todo "Salvar Conferência" do documento criado por esta etapa toma **400**, e o ALMOXARIFE não consegue nem autorizar (403). O plano ia de "criar" a "processar" em um passo e não tocava nenhuma das três portas. ⚠️ **(correção pós-onda da 36) a nota acima ficou velha:** o `opcoes.ignorarInalteradas` de `230baf6` foi **deletado** em `2d7787d` (revisão final R2) — a regra ("aumenta sobre a quantidade já gravada") passou para **dentro** de `assertExcedentePermitido` e vale nas **duas** portas por construção, sem flag nenhum. `grep -rn ignorarInalteradas server/` dá vazio hoje. O achado (2) está **resolvido**: não há mais "só no `/fiscal`" para medir — o cenário (12) continua valendo como prova, mas a premissa que o motivou (a lacuna do `/conferir`) já não existe | `receiptService.js:280-334`, `:464` · plano T7 roteiro | cenário **(12)** na T2 (conferir → fiscal → processar no mesmo `test()`), passos **2** e **5b** do roteiro da T7 reescritos porta por porta, e a dependência declarada no cabeçalho do plano |
| 3 | **"Os schemas Zod da 36 não mudam" está errado, e derruba a tela nova.** O achado R6 da onda acrescenta schema dos **itens** ao `POST` (`quantidade`/`quantidade_esperada` com `coerce.number().positive()`). O payload que a T5 monta no caminho do pedido **não leva `quantidade_esperada`** (ela nasce do saldo, no servidor) — com o campo obrigatório, **todo recebimento por pedido feito pela tela** responde 400 na validação, antes do serviço | plano Tech Stack + Global Constraints · `schemas.js:767-772` | a frase corrigida **dizendo que estava errada**, cenário **(11)** na T2 com o payload literal da tela, e sabotagem **7** (tornar o campo obrigatório) |
| 4 | **A literal do 400 congelada é a que a 36 acabou de trocar.** O plano congela o sufixo "— marque a autorização de excedente para registrar"; o achado F3 da onda substitui isso por um texto que **nomeia quem autoriza**. Congelar o texto velho poria **duas instruções diferentes** para o mesmo ato nas duas portas, e o manual copiaria as duas | plano contrato 1 · `receiptService.js:303-305` | o sufixo virou `<SUFIXO>`, com a ordem de **copiar do código** no Step 3 da T2 e de escrever a literal final na própria tabela antes do commit |
| 5 | **As letras dos cenários de client colidem.** O plano diz "17 cenários, o último é `(q)`" e chama os novos de `(r)(s)(t)`. Medido: **18** cenários, e o último é `(r)` — `(r) o payload fiscal sai SEM tipo_recebimento…`, da onda da 36 | `RecebimentosAlmoxarifado.test.js:850` · plano T5 | passam a ser **(s)(t)(u)**, com a ordem de recontar por `grep -c "^test("` (a onda pode acrescentar mais) |
| 6 | **A sabotagem 1 da T3 derruba o arquivo por `ReferenceError`** — "mover o `UPDATE` para dentro de `processarNota`": lá não existem `item` nem `qtd` no escopo, então **todos** os cenários caem juntos e nenhum prova nada (é a regra (iv) do próprio plano) | plano T3 sabotagem 1 · `receiptService.js:865-910` | trocada pela forma que produz o **mesmo** defeito de modo legível: condicionar o `UPDATE` ao `rec.status` dentro de `darEntradaEstoque` (`rec` é parâmetro) |
| 7 | **`?pendentes=1` pode devolver `[]` com pedidos abertos existindo.** O plano não diz **onde** o filtro roda; `listarPedidosCompraAux` termina em `ORDER BY p.created_at DESC LIMIT 50`. Filtrado depois da query, o filtro se aplica aos **50 mais novos** — com esses 50 quitados, a tela fica sem o único pedido recebível | `receiptService.js:967` · design (d) | contrato 2 passa a **exigir o filtro no `WHERE`, antes do `LIMIT`**, com cenário **(6)** na T4 (50 quitados novos + 1 aberto antigo) e sabotagem **5**, que move o filtro para depois |
| 8 | **O stub de `pedidos_compra` estava especificado por dois adjetivos** ("sem FK, com `created_at`"). A união do que os sete arquivos inserem e do que as rotas leem é `id, numero UNIQUE, fornecedor_id, valor_total, data_pedido, status, created_at` (+ `previsao_entrega`, `observacoes`, `updated_at` em produção). Faltar uma = "no such column" numa rodada inteira, e pior: como o stub **vence**, a coluna deixa de existir **para o arquivo que a declarava** | plano T1 · `server/index.js:19230-19242` | DDL do stub **escrita por extenso** na T1, com o motivo de cada coluna, e `npm run test:almoxarifado` (o sétimo criador, que **não** usa o harness) acrescentado ao Step 4 |

### Os silenciosos (passariam verdes escondendo o defeito)

| # | Achado | Onde | Correção aplicada |
|---|---|---|---|
| 9 | **A esperada do caminho que a tela usa não tinha asserção.** O cenário (4) mede o `POST` **sem** `itens`; o caminho **com** `itens` — o da tela depois da T5 — é justamente o que traz `quantidade_esperada` no payload. Se ela viesse do payload, a barreira da 36 passaria a medir contra o número que o operador digitou e **nada cairia** | plano T2 "Não faça" + cenário (4) · `receiptService.js:290` | cenário **(10)** (payload com `quantidade_esperada: 99` → grava `4`) e sabotagem **6**; a linha da tabela "Não faça" corrigida para apontar o cenário certo |
| 10 | **A sabotagem 4 da T3 (`COALESCE`) é no-op.** A coluna nasce `DEFAULT 0` — o que a própria T1 afirma — e o cenário (4) exige `=== 0` antes de processar: `null + 6` nunca acontece na suíte | plano T3 sabotagem 4 | cenário **(4b)**, a única linha da base com `quantidade_recebida` **NULL explícito**, e a sabotagem reapontada para ele |
| 11 | **O `UPDATE` do pedido, no lugar combinado, pode travar a nota depois de o estoque entrar.** Ele fica **depois** de `entrouFisicamente = true`, e dali o `catch` **não devolve** o claim: se o `UPDATE` lançar — e o módulo **assume** que essas tabelas podem faltar (`:955-957`, `:842-844`) — `processarNota` falha com o estoque já creditado, o documento não chega a `PROCESSADO` e o reprocessamento **pula** o item | design (c) · `receiptService.js:797-836` | `try/catch` **não-fatal** com `console.warn`, no molde da griffagem de séries do mesmo `try`; cenário **(9)** (tabela renomeada → processar continua 200) e sabotagem **5** |
| 12 | **`saldo_pendente` negativo.** O design **declara** que uma linha pode terminar com `recebida > quantidade`; sem clamp a rota devolve `-2`, a tela escreve `Saldo pendente: -2` e a asserção da RN-24 (`saldo_pendente: 0`) é falsa **no caso que a etapa acabou de criar** | design (c)/(d) · plano contratos 2 e 3 | `Math.max(0, …)` nos dois contratos, cenário **(7)** na T4 e sabotagem **6** |
| 13 | **Dois recebimentos cheios contra o mesmo pedido passam os dois** — o saldo só conta a **entrada física** (decisão 5), então dois documentos de 10 criados antes de qualquer processamento respondem 201, e o pedido termina com 20 sem o 400 aparecer em lugar nenhum. **Não** é a corrida de `check-then-insert` já declarada (essa é simultânea); é sequencial e inerente ao desenho — e é o mesmo mecanismo que faz a RN-23 valer | design (b)/(c) · plano contrato 1 | bloco próprio no contrato 1 ("o que a régua NÃO alcança"), passo **7b** no roteiro da T7, e obrigação de letra **G** na T8 |
| 14 | **A esperada é congelada na linha, e o design sugeria o contrário.** "De graça, o `/conferir` e o `/fiscal` passam a comparar contra o saldo do pedido" só é verdade **no instante da criação**: a esperada é lida da linha gravada (`atual.quantidade_esperada`), então um pedido consumido por **outro** recebimento processado depois **não** muda a esperada deste. Não é bug — é contrato, e não estava escrito | design (b) item 6 · `receiptService.js:285-290` | dito no design com a palavra "congelada", e o cenário (12) da T2 exercita exatamente o eco da esperada congelada |

### O que a revisão confirmou (e por isso ninguém precisa medir de novo)

- **Referências de linha, todas exatas:** `extended.js:975` (o `POST`), `:1116` (o aux),
  `routes/almoxarifado.js:1775-1796` (o comentário + os 21 `ALTER`, `grep -c` = **21**), `:238`
  (`initSchema` não-awaited), `Compras.js:96-108` (mapa de **nove** valores minúsculos com
  `colors[status] || '#95a5a6'`), `permissions.js:86` e `:178` (as duas listas de perfis).
- **Nome da tabela de itens do recebimento:** `recebimentos_material_itens_almoxarifado`, como o
  plano escreve (`schema.js:1114`). É a consulta **A11** do contexto de fechamento da 36 que traz o
  nome invertido (`itens_recebimento_material_almoxarifado`) — **erro do documento da 36**, não deste
  plano; corrigir lá antes de publicar a consulta.
- **Ordem do harness, medida:** `testApp.js:27` faz `await initSchema(db)` **antes** dos stubs, e os
  sete `CREATE TABLE IF NOT EXISTS` dos arquivos de teste rodam **depois** de `createTestApp()`
  retornar — o stub do harness **cria primeiro** e os sete viram no-op. A premissa do plano está
  certa; o risco não é "um teste quebra", é a coluna faltar para quem a declarava (achado 8).
- **`pendentes` chega sem tocar a `extended.js`:** a rota já passa `req.query` inteiro
  (`extended.js:1116-1118`).
- **As `-aux` têm a camada do módulo:** `app.use('/api/almoxarifado', authenticateToken,
  checkModulePermission('almoxarifado'))` em `routes/almoxarifado.js:282-285`. Falta-lhes só o
  `requirePermission`, exatamente como o plano diz.
- **A decisão 9 não quebra `recebimentoTipoEnum` (4):** aquele cenário faz `POST` **com** `itens`
  contra um pedido **sem** linhas (`:113-118`) — item sem linha entra sem régua, 201 preservado.
- **O caminho `aprovar` é alcançável:** `aprovarRecebimento` delega a `processarNota` só quando o
  status está em `[EM_ENTRADA_NF, ENCAMINHADO_FATURAMENTO]` (`:919-921`); um documento recém-criado
  está em `RECEBIDO` e cai no `darEntradaEstoque` direto (`:923`) — o cenário (6) da T3 existe de
  verdade.
- **`pedido_item_id` chega ao acumulador:** a query de itens de `darEntradaEstoque` é `SELECT ri.*`
  (`:601-610`), então a coluna nova vem sozinha.
- **Os três "nada cai" declarados como caso 2 são mesmo inalcançáveis** — T1 nº 1 (`safeAlter` vs.
  `db.run` engolido; a régua dele é `npm run test:safealter`), T5 nº 4 (`pode()` mockado como
  `() => true` em `RecebimentosAlmoxarifado.test.js:49-51`) e T6 nº 3 (o total redundante com os
  nomes). O que faltava **não** era um quarto caso 2: era a sabotagem **6** da T2, que atinge um
  caminho que não tinha asserção nenhuma (achado 9).

### Ruído (levantado nesta revisão e descartado)

- "`CREATE INDEX` pode rodar antes do `CREATE TABLE`" — não: dentro do `initSchema` a cadeia é
  `await`ada em ordem; o não-awaited de `:238` afeta quem roda **fora** dela (os 21 `ALTER`), não o
  índice novo. Sustentado como o design diz.
- "O `safeAlter` de `quantidade_recebida` não cobre banco migrado" — cobre: o `CREATE TABLE` cria a
  tabela com **8** colunas e é o `ALTER` que acrescenta a nona, então a **primeira** passada já é o
  caminho migrado; a segunda (cenário (2)) é o caminho "já migrado".
- "Segregar saldo por almoxarifado" — regra de negócio do projeto: almoxarifado é área física, não
  filial. Não é pendência e não entra.

### Fluxo traçado até o fim (a lição da Etapa 36)

Para cada RN, o último gesto do usuário, e **onde um gesto posterior recusa o que um anterior
aceitou**. Esta tabela é a régua de aceite da T7.

| RN | Novo recebimento por pedido | Itens com saldo | `/conferir` | `/fiscal` | `processar` | Situação do pedido | Onde quebrava |
|---|---|---|---|---|---|---|---|
| **RN-20** saldo | 400 antes de qualquer `INSERT`; `COUNT` inalterado | a tela já não oferece mais que o saldo (T5) | — | — | — | inalterada | **nada quebra** — mas o 400 **nunca aparece** se dois documentos cheios forem criados antes de qualquer processamento (achado 13 → letra G) |
| **RN-21** autorização | 403 (ALMOXARIFE) / 201 (COMPRAS) + trilha | idem | ⚠️ o documento **nasce** `recebida(6) > esperada(4)`: com a regra antiga da 36, **400 aqui**, e o ALMOXARIFE não pode nem autorizar | ⚠️ o mesmo eco no modal fiscal, que **não tem** caixa de autorização | trava em `validarDadosProcessamento` se o fiscal não salvou | `RECEBIDO` com `recebida > quantidade` (declarado) | **este era o Critical** (achado 2) → cenário (12) da T2 + passo 5b da T7; exige a regra "> esperada **E** > armazenada" nas **três** portas |
| **RN-22** acumulador | não conta nada (de propósito) | — | não conta | não conta | **conta aqui**, dentro do claim, nos **dois** caminhos (`processar` e `aprovar`) | `PARCIAL`/`RECEBIDO` | falha do `UPDATE` travava a nota **depois** de o estoque entrar (achado 11) → `try/catch` não-fatal + cenário (9) |
| **RN-23** não processado | 201 | — | — | — | o não processado **não** entra na conta | inalterada por ele | é o **mesmo** mecanismo do achado 13: o que protege a RN-23 é o que abre o furo dos dois documentos abertos. Dito nos dois lugares |
| **RN-24** derivação | — | a lista alimenta o `<select>` | — | — | é o `processar` que move a situação | `ABERTO`/`PARCIAL`/`RECEBIDO`, `status` core **intacto** | `?pendentes=1` podia vir `[]` por causa do `LIMIT` (achado 7); `saldo_pendente` podia vir **negativo** (achado 12) |
| **RN-25** esperada = saldo | esperada **congelada** no saldo do instante da criação | a tela mostra o mesmo número | compara com a esperada **gravada** | idem | entra a recebida | — | pedido **sem linhas** recebia a frase errada (achado 1); a esperada do caminho **com** `itens` não tinha asserção (achado 9); "congelada" não estava escrito (achado 14) |
| **RN-26** tela | monta o payload **sem** `quantidade_esperada` | `Saldo pendente:` / `Acima do saldo:` / caixa de autorização | o 403/400 do servidor no DOM, modal de pé | — | — | — | o schema Zod novo podia recusar o payload (achado 3); o mock da **lista** devolvia `[]` e o `<select>` nasceria vazio (achado 5) |
| **RN-27** 21 `ALTER` | — | — | — | — | — | — | um **comentário** com as palavras `ALTER TABLE` derruba a varredura **depois** do conserto (achado da T6) |

**Veredito:** o plano **não** estava pronto como escrito — os achados 1, 2 e 3 fariam a etapa entregar
uma porta que mente ao operador, um documento que ela mesma cria e não consegue levar até o fim, e uma
tela recusada pela validação antes de chegar ao serviço. **Com as correções acima aplicadas no lugar,
está pronto para executar**, com uma condição de ordem: a **onda de correção da Etapa 36 tem de estar
commitada** (em especial a regra do excedente nas **duas** portas e o schema Zod dos itens) antes da
**T2**, e o Step 3 da T2 **lê as literais do código**, não deste plano.

---

## Onda de correção da revisão final

Revisão da branch inteira (`ea0aa4f..97726c3`), duas lentes: a de código/correção (F1–F7) e a de
UX/dado (U1, U3). **Nove achados, oito commits** (F5 e F6 são o mesmo commit: os dois são teste
faltando, nenhum produto mudou). Todos os cenários novos nasceram **vermelhos** antes do fix —
exceto os dois de teste-faltando (F5/F6), que documentam comportamento já certo e por isso
levaram **controle positivo** no lugar do RED, como manda a regra de teste vazio do CLAUDE.md.

| # | Commit | O que provou |
|---|---|---|
| **F1** | `4007344` | `200 []` tinha **dois** significados e a tela chamava os dois de quitado. Três estados agora: linhas; `[]` com `quantidade_pedida > 0` (quitado); `[]` com `quantidade_pedida === 0` (a literal do servidor). Cenário (z) + fixture 317. Sabotagem: colapsar para `linhas.length === 0` → (z) cai. |
| **F2** | `8ead95e` | O `POST` **sem `itens`** montava um payload que o próprio servidor recusava (linha estourada derruba o agregado por material). Rateio por material, com `restante` clampado em 0. Cenários (14) e (15). Sabotagem: `Math.min(l.saldo, restante)` → `l.saldo` derruba os dois. |
| **F3** | `c40fca8` | `pedido_item_id` do pedido mas de **outro material** entrava 201, gravando o material X ao lado da linha de Y (pedido dizia Y, estoque creditava X). 400 com literal nova. Cenário (16). Sabotagem: tirar a cláusula do material → (16) cai. |
| **F4** | `e253ad2` | Corrida do `<select>` de pedidos: a resposta **atrasada** do pedido abandonado vencia e marcava o pedido novo como quitado. `pedidoSeqRef`, molde do `detalheFetchSeqRef` (Etapa 35). Cenário (aa). Sabotagem: remover o descarte → (aa) cai. |
| **F5** | `93cce5e` | O `pedido_item_id` **honrado** não tinha cenário nenhum: com duas linhas pendentes do mesmo material, uma regressão para "menor id com saldo" ficaria verde em tudo (o pedido é que fecharia a linha errada). Cenário (10) de `pedidoSaldoRecebido`. Controle positivo: ignorar o id explícito → cai. |
| **F6** | `93cce5e` | Os `params` do `<select>` (`?pendentes=1`, RN-24) não eram afirmados — perdê-los era invisível para a suíte. Asserção no cenário (u). Controle positivo: tirar o `params` → (u) cai. |
| **F7** | `e0f8b18` | A spec `00-fundacao-tecnica` apontava a Task 6 por **vizinhança** ("imediatamente após `838f971`"); trocado pelo hash real `4955805`. Doc apenas. |
| **U1** | `dd11972` | **Regressão silenciosa de custo**: o payload da T5 não manda `valor_unitario`, o item nascia 0/0 e o `custo_medio` do material deixou de ser alimentado por todo recebimento contra pedido (base do rateio da Etapa 8c). Fallback para o preço da **linha do pedido** quando o campo é omitido; `0` explícito continua 0. Cenário (11). Sabotagem: voltar ao `parseFloat(item.valor_unitario) || 0` → (11) cai. |
| **U3** | `13ad237` | `var(--gmp-danger)` **nunca existiu** (só `--gmp-error`): os avisos saíam na cor herdada. 6 ocorrências trocadas. Sem teste (jsdom não resolve `var()`); o controle é o `grep`, que agora não acha nenhuma. |

**Literais congeladas nesta onda** (as três, verbatim, para o próximo leitor não reescrever nenhuma):

- servidor, F3: `Item do pedido #<id> não é do material <COD>`
- tela, F1: `Pedido de compra <numero> não tem itens lançados no módulo Compras.` (cópia da
  literal do servidor, com ponto final — a comparação por substring continua batendo)
- tela, F1: `Este pedido já foi recebido por completo.` (inalterada — é o controle de F1)

**Fica registrado (não corrigido nesta onda), para a letra G do fechamento:**

- `{ pedido_compra_id: <pedido sem linhas>, itens: [...] }` responde **201** com
  `pedido_item_id: null` e **sem régua de saldo** — é a decisão 9 (material fora do pedido é caso
  legítimo), e recusá-lo seria regra nova;
- a varredura do `schemaUnico` é **por linha** e daria falso-positivo num `safeAlter(` quebrado em
  várias linhas;
- item cujo `quantidade_recebida` passa do saldo **da linha** mas cabe no agregado **do material**
  grava `recebida > esperada` sem trilha (só pela API; a tela não produz esse payload).

### Próxima tarefa detalhada

> ✅ **Feito — este parágrafo é de quando a onda fechou.** O fechamento aconteceu; a próxima tarefa
> de verdade é a **Etapa 38**, na última seção deste plano.

Não há task de código pendente desta onda. O próximo passo é o **fechamento da Etapa 37** (skill
`fechar-etapa`): letra **A** (a consulta SQL que mede NF duplicada em produção **antes** do
deploy, com a ressalva de que ela sub-reporta duplicata por acento — ver
`assertNotaNaoDuplicada`), letra **B** (as decisões reversíveis desta onda: contrato da rota de
itens mantido como array; 400 em vez de re-resolução silenciosa no F3; fallback de preço no
servidor e não na tela), letra **D** (decisão 9) e letra **G** (os três itens acima mais o
`initSchema` não-awaited da T6).

---

## Fase 4/5 — Integração e revisão adversarial (2026-09-16)

**Quem revisou, e com que lente.** **Doze passagens**, nenhuma delas do executor da própria task:

| Passagem | Quantas | Lente |
|---|---|---|
| **Gate de task** | **7** (T1 a T7) | a task fez o que o plano manda, a régua ficou vermelha antes e verde depois, e o controle positivo derrubou **a asserção que guarda o achado** — não outra |
| **Re-review de task depois de fix-round** | **2** | T4 (`eb10d9c`, o `saldo_pendente_material`) e T5 (`838f971`, o aviso que somava por material) |
| **Revisão final de branch** | **2 lentes em paralelo**, sem conversa entre elas | (1) **RN e vacuidade** — RN-20 a RN-27 realmente travadas, cenário negativo com metade positiva, sabotagem derrubando a asserção certa; (2) **UX e dados** — o que o operador vê em cada janela, e o que acontece com o **dado** (preço, custo médio, cor do aviso) depois de cada gesto |
| **Re-review da onda de correção** | **1** | releu os nove achados contra o código final: **9/9 ADDRESSED**, sem quebra Important nova |

**Veredito das duas lentes finais: NEEDS FIXES nas duas, 0 ruído** — nenhum achado deixou de
reproduzir, e houve uma convergência (o **F1** da lente RN é o **U2** da lente UX, achados por
caminhos diferentes). **4 Important + 1 repetido + 6 Minor.** As refs abaixo são do HEAD da revisão
(`97726c3`) e já se deslocaram — o nome da função é o que sobrevive:

| # | Sev. | Onde (nome da função / arquivo) | O quê |
|---|---|---|---|
| **F1 = U2** | **Important — as duas lentes** | `RecebimentosAlmoxarifado.js`, `mensagemPedidoSemLinhas` / `selecionarPedido` | `200 []` tinha **dois** significados e a tela chamava os dois de quitado: o pedido **sem linhas lançadas no Compras** recebia *"Este pedido já foi recebido por completo."* com o submit desabilitado, e a literal correta do servidor era **inalcançável pela tela**. É a mentira que a decisão 14 do design tirou do servidor, **renascida no client**. Conserto: três estados, lendo `quantidade_pedida` da lista (`4007344`) |
| **F2** | Important | `receiptService.js`, `criarRecebimento` — o rateio do `POST` sem `itens` | o servidor montava um payload que **ele mesmo** recusava: itens auto-gerados com o saldo **por linha**, barreira agregando **por material**. Com A 10/15 e B 10/0 do mesmo material, oferecia 10 e respondia 400 *"saldo do pedido (5)"*. Quatro arquivos de teste usam esse caminho. Conserto: `min(saldo da linha, agregado do material)`, material com agregado ≤ 0 pulado (`8ead95e`) |
| **F3** | Important | `receiptService.js`, `resolverLinhaDoPedido` | validava o `pedido_item_id` contra o **pedido** e **não contra o material**: receber X com o id da linha de Y dava **estoque em X e baixa em Y** — RN-20 e RN-22 falsificadas ao mesmo tempo, sem erro visível. 400 novo: `Item do pedido #<id> não é do material <COD>` (`c40fca8`). **O texto R5 do design — *"o servidor valida o `pedido_item_id` contra o pedido"* — estava INCOMPLETO**, e é por isso que ninguém notou |
| **U1** | Important | `receiptService.js`, o `INSERT` dos itens de `criarRecebimento` | **regressão silenciosa de custo**: a tela não manda preço, `parseFloat(item.valor_unitario) || 0` gravava **R$ 0,00**, e o `custo_medio` do material **deixou de ser alimentado** por todo recebimento contra pedido — comportamento que a Etapa 8c registrava como entregue. Antes da T5 o caminho mandava `itens: []` e o servidor preenchia o preço da linha do pedido; a T5 tirou isso **sem que nada caísse**. Conserto: fallback ao `valor_unitario` da linha quando o payload omite; `0` explícito continua 0 (`dd11972`) |
| **F4** | Minor | `RecebimentosAlmoxarifado.js`, `selecionarPedido` | corrida do `<select>`: a resposta **atrasada** do pedido abandonado vencia e marcava o pedido **novo** como quitado (mesma classe do C47 da Etapa 35). `pedidoSeqRef` (`e253ad2`) |
| **F5** | Minor (teste faltando) | `pedidoSaldoRecebido.api.test.js` | o `pedido_item_id` **honrado** não tinha cenário: com duas linhas pendentes do mesmo material, uma regressão para *"menor id com saldo"* passaria **verde em tudo** — e quem pagaria é o pedido, fechando a linha errada (`93cce5e`) |
| **F6** | Minor (teste faltando) | `RecebimentosAlmoxarifado.test.js`, cenário (u) | os `params` do `<select>` (`?pendentes=1`, RN-24) não eram afirmados: perdê-los era **invisível** para a suíte (`93cce5e`) |
| **F7** | Minor (doc) | `specs/modulo-almoxarifado/00-fundacao-tecnica/README.md` | a spec apontava a Task 6 por **vizinhança** (*"imediatamente após `838f971`"*) — trocado pelo hash real `4955805` (`e0f8b18`) |
| **U3** | Minor | `RecebimentosAlmoxarifado.js` + `MovimentacoesAlmoxarifado.js` | `var(--gmp-danger)` **nunca existiu** nesta base (só `--gmp-error`): o aviso de excedente e os banners 400/403 saíam na **cor herdada**. Seis ocorrências, duas delas pré-existentes e uma fora desta branch, dita no commit (`13ad237`). Sem teste — jsdom não resolve `var()`; o controle é o `grep`, que agora não acha nenhuma |

### A lição desta etapa: a quarta pergunta funcionou, e ainda assim os 4 Important eram de COMPOSIÇÃO

A Etapa 36 terminou com uma instrução nova para a Fase 2: **traçar cada RN até o último gesto do
usuário**, não até a porta onde a regra mora. Ela **funcionou** — o padrão que gerou o CRÍTICO da 36
(documento que nasce excedente e depois não passa pelo `/conferir`) foi previsto para a porta nova,
virou o cenário (12) da T2 e o passo 5b da T7, e o defeito **não renasceu**: o eco das duas portas
responde 200 sem trilha nova, medido.

**E, ainda assim, as lentes finais acharam 4 Important — e nenhum deles mora dentro de uma task.**
Todos os quatro vivem entre **duas peças que passaram sozinhas**:

1. **F1 — leitura × escrita.** A T4 decidiu que `[]` significa "sem saldo"; a T5 leu `[]` como
   "quitado". Cada uma certa no seu contrato; juntas, mentem para o operador.
2. **F2 — o servidor contra o próprio payload.** A T2 escreveu a barreira **por material** e o
   rateio **por linha** no mesmo commit. Nenhum cenário mandava `POST` sem `itens` contra um pedido
   com duas linhas do mesmo material.
3. **F3 — o elo sem a segunda metade.** A T2 validou o id contra o pedido; que ele também tinha de
   ser do **material** só aparece quando se olha o que o `UPDATE` da T3 faz com ele.
4. **U1 — a dimensão que ninguém estava olhando.** Todas as asserções desta etapa eram sobre
   **quantidade**. O preço atravessou cinco tasks e uma revisão de task sem que nenhuma régua o
   tocasse, e o que quebrou foi uma feature de **outra etapa** (8c).

**A consequência prática, para a próxima Fase 2:** a quarta pergunta (traçar a RN até o último
gesto) é necessária e não é suficiente. Faltam duas: **"que DIMENSÃO do registro esta etapa não
está afirmando em lugar nenhum?"** — aqui era o **preço** — e **"onde duas tasks derivam o mesmo
número por caminhos diferentes?"** — aqui eram três lugares (o agregado por material, o significado
de `[]` e o id da linha), e foi de lá que saíram os dois fix-rounds e dois dos Important.

### E a descoberta que não é defeito de código nenhum: a feature nasce inerte

A lente de UX foi medir *"o que o operador vê"* e encontrou **um `<select>` vazio**. Medição
subsequente (Fase 0 da Etapa 38, `.superpowers/sdd/etapa38-fase0-pedido-de-compra.md`): **nenhum
código da aplicação insere `pedidos_compra` nem `itens_pedido_compra`**; a rota core
`server/index.js:20002` é GET-only; "Novo Pedido" (`client/src/components/Compras.js`) cai no
`path="*"` de `client/src/App.js:332` e volta para a lista; acervo 0/0 no dump de 161 MB. O único
escritor dessas tabelas em produção passou a ser **o acumulador desta etapa**.

Isto **não invalida** a Etapa 37 — o furo que ela fechou é real e o código está certo, medido pela
suíte e pelas sondas. Mas define a próxima: **a 37 só produz valor depois da 38**, e até lá o teste
manual exige um pedido inserido por SQL (letra **F** do doc de novidades). E define uma regra para
as Fases 0 seguintes, porque este erro já tinha sido cometido: a Fase 0 da **Etapa 14** declarou
*"Compras está maduro"* medindo o **`receiptService`**, que é do almoxarifado — maturidade atribuída
ao módulo errado, e a spec 22 repetiu isso por 22 etapas (corrigido agora, dizendo que estava
errado). **Medir "o módulo X é maduro" significa medir quem ESCREVE o dado de X, não quem o lê.**

### Parked — foram para a letra G, com o conserto nomeado

- **Janela de crash sem exceção do acumulador**: se o processo morrer entre a entrada física e o
  `UPDATE` do pedido, a linha fica **sub-contada para sempre e sem `warn`** (o retry pula o item
  pelo claim). Não é defeito desta task — é o motor sem transações —, e o conserto é a consulta de
  reconciliação da letra **A**.
- **`initSchema` não-awaited** (`routes/almoxarifado.js:238`): era a causa real de os 21 `ALTER`
  falharem em **todo boot** com o erro engolido. Consertar é tronco de outra etapa; e
  `server/index.js` ainda tem **51** `ALTER` soltos (core, fora do escopo).
- **Dois recebimentos abertos** contra o mesmo pedido dão 201 os dois, e o excesso (12 de 10) **não
  deixa nenhuma linha de `EXCEDENTE_AUTORIZADO`** — a reconciliação trabalha sem trilha.
- **Residual do F4**: voltar a forma para "Nota fiscal" (ou Cancelar) com a resposta de itens **em
  voo** repovoa os itens sob `NOTA_FISCAL` (a guarda cobre pedido→pedido). Conserto de uma linha:
  `++pedidoSeqRef.current` dentro de `limparEstadoDoPedido`.
- **O agregado por material está escrito duas vezes** (rateio do `POST` sem itens × barreira):
  concordam hoje, e o conserto é extrair um helper.
- **`valor_total` do item usa a `quantidade_esperada`** (o saldo), não a recebida — pré-existente,
  visível agora que a U1 preenche o preço. Nenhum consumidor interno lê esse campo (contas a pagar
  usa o total da **nota**; o custo médio usa o **unitário**).
- **O F3 não recusa id de linha de OUTRO pedido** — só material divergente dentro do pedido. É
  contrato entregue pela T2/decisão 9; mudar é decisão nova (pergunta da letra **B**).
- **A rota de itens expõe `valor_unitario` por linha** a qualquer perfil do módulo (a lista `-aux`
  já expunha o total).
- **Janela do primeiro boot depois do deploy**: a rota consulta `quantidade_recebida` antes de o
  `safeAlter` rodar, o `catch` é silencioso → `<select>` vazio **sem mensagem**.
- **Item cujo `pedido_item_id` cabe no agregado do material mas passa do saldo DA LINHA** grava
  `recebida > esperada` **sem trilha** — só pela API; a tela não produz esse payload.
- **`{pedido_compra_id: <pedido sem linhas>, itens: [...]}` → 201 sem régua de saldo** (decisão 9).
- **A varredura do `schemaUnico` é por linha** e daria falso-positivo num `safeAlter(` quebrado em
  várias linhas, ou num comentário que contenha `ALTER TABLE`.
- **O aviso "Acima do saldo" não tem `role`/`aria-live`** — o leitor de tela não o anuncia; o banner
  400/403 anuncia.
- **O guard do modal por permissão continua sem régua** (a suíte de client mocka `pode: () => true`);
  a prova real é o 403 do servidor, exercitado na T7.

---

## Fechamento — números medidos

Os cinco comandos da `fechar-etapa`, **rodados pelo controlador em HEAD `13ad237`** (depois da onda
inteira), com os números lidos da saída:

| Comando | Resultado | Quando |
|---|---|---|
| `cd server && npm run test:api` | **178/178 arquivos OK** (174 da Etapa 36 + 4 novos) | HEAD `13ad237`, pós-onda |
| `cd server && npm run test:almoxarifado` | **42 passou, 0 falhou** | HEAD `13ad237`, pós-onda |
| `cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite` | **4/4 · 3/3 · 5/5** | HEAD `13ad237`, pós-onda |
| `cd client && CI=true npx react-scripts test --watchAll=false` | **47 suítes / 714 testes**, todos passando | HEAD `13ad237`, pós-onda |
| `cd client && CI=true npx react-scripts build` | **"Compiled successfully."**, warning-as-error ligado | HEAD `13ad237`, pós-onda |

**De onde vem o delta.** `test:api`: **174 → 178 arquivos**, os quatro criados por esta etapa —
`recebimentoExcedentePedido` (T2), `pedidoSaldoRecebido` (T3), `pedidosCompraSaldoAux` (T4) e
`recebimentoContraPedidoIntegracao` (T7). Client: **707 → 714 testes** na mesma suíte de 47 — os
cenários novos de `RecebimentosAlmoxarifado.test.js` (T5, o fix 1 da T5, e (z), (aa) e a asserção de
`params` em (u), da onda). O `test:safealter` **não muda de número** de propósito: a régua do padrão
continua sendo 3, e a T1 não acrescentou caso — o que ela acrescentou foi coluna.

**Hashes citados nos documentos de desenvolvimento, todos conferidos** com
`git merge-base --is-ancestor <hash> HEAD`: `ea0aa4f` (T1), `57ace18` (T2), `d062889` (T3),
`402070c` + `eb10d9c` (T4 + fix 1), `a9acb4c` + `838f971` (T5 + fix 1), `4955805` (T6), `97726c3`
(T7), e os oito da onda — `4007344`, `8ead95e`, `c40fca8`, `e253ad2`, `93cce5e` (F5 **e** F6 no
mesmo commit), `e0f8b18`, `dd11972`, `13ad237`. Mais `5f03afc` (design), `9790b07` (plano + Fase 2)
e `48a253a` (correção das docs antes da execução): **20/20 ancestrais de HEAD**.

> **Uma ressalva honesta, em vez de um `[x]` folgado.** A suíte de client foi lida **714** no
> fechamento e **712** no fim da T5; os dois números ficam escritos porque a diferença é a onda, não
> um erro de contagem. Pelo mesmo motivo, os relatórios de task que citam `47 suítes / 710` são
> anteriores ao fix 1 da T5 e valem **para o commit que nomeiam**.

---

## Retro de 4 números

1. **Rodadas de correção até verde: 7 tasks, 5 aprovadas de primeira.** Dois fix-rounds, os dois em
   galho e os dois pela **mesma** causa de fundo — leitura e escrita derivando o mesmo número por
   caminhos diferentes: **T4 fix 1** (`eb10d9c`, a leitura clampava por linha e a barreira agregava
   por material) e **T5 fix 1** (`838f971`, o aviso media a linha e a porta media a soma). Depois da
   revisão final, **uma onda de 9 achados em 8 commits**, com re-review **9/9 ADDRESSED** e **sem
   segunda onda**. Nenhuma task passou de dois rounds.
2. **Achados reais da revisão final: 10 (4 Important + 6 Minor), 1 convergência, ruído 0.** Os
   quatro Important são **todos de composição** — nenhum mora dentro de uma task, e por isso nenhum
   gate de task poderia tê-los pego. O dado que mais ensina: **a dimensão que escapou inteira foi o
   preço** (U1), porque todas as réguas desta etapa afirmavam **quantidade**.
3. **Paralelismo: 3 galhos (A, B, C) depois do tronco T1→T2→T3**, contra 0 na Etapa 36 — decisão do
   sort topológico, e ela se pagou: T4 (servidor/leitura), T5 (client) e T6 (rotas/fundação) não
   compartilham arquivo. **0 retrabalho por paralelismo.** Em paralelo rodaram também as 2 lentes
   finais e, no fechamento, **2 redatores** de documentação (desenvolvimento × usuário), que não
   compartilham arquivo nenhum.
4. **O que escapou ao próprio plano, dito de frente — quatro predições erradas:** (a) o brief da T1
   pedia **ledger de migração** e o design o **proibia** — venceu o design (migration aditiva, sem
   ledger); (b) a sabotagem 2 da T5 (`>` → `>=`) só cai **na fronteira**, porque comparadores
   diferem apenas na igualdade — a predição do plano estava errada; (c) a sabotagem 3 da T6 (o total
   redundante com os nomes) **não derrubava nada**, e a T6 teve de acrescentar uma **3b** para
   provar o que a 3 queria provar; (d) o relatório da T7 registrou *"os arquivos desta base são
   CRLF"* e **estava errado — são LF**: inserir `\r\n` por `perl` sujou 112 linhas de um teste e 1
   do serviço (normalizadas antes do commit). A regra certa, que vale para as próximas etapas:
   `\r?\n` **na regex de busca** é inofensivo; **nunca inserir `\r\n`**; e o no-op que a T7 observou
   tinha **outra causa, não medida**. Esse texto errado foi copiado para o plano da Etapa 38 e
   precisa ser corrigido lá.

---

## Próxima tarefa detalhada — Etapa 38

**Já decidida e desenhada** — e ela **não** saiu da lista de candidatas do Step 6 desta Task 8
(divergência formal numerada, barrar item fora do pedido, `fornecedor_id` no `<select>`, `UNIQUE` da
NF, A2 + `initSchema` awaited, o teto da faixa do clipe). Saiu de uma **medição**: a Fase 0
registrada em `.superpowers/sdd/etapa38-fase0-pedido-de-compra.md` mostrou que **todas** aquelas
candidatas melhoram uma feature que **ninguém consegue alcançar em produção**.

- **Design:** `docs/superpowers/specs/2026-09-16-crm-etapa38-pedido-de-compra-design.md`
- **Plano:** `docs/superpowers/plans/2026-09-16-crm-etapa38-pedido-de-compra.md`
- **Escopo — "o pedido de compra ganha criação" (módulo core Compras):** **A1** extrair
  `/api/compras/*` de `server/index.js` para `server/routes/compras.js` e **montar no harness**
  (hoje **zero** testes batem em `/api/compras` e o core tem **0** schemas Zod) → **A2/A3** Zod +
  `POST` com itens → **A4** `GET`/`PUT` → **B1** importação de planilha (XLSX lido **no navegador**
  → JSON; precedente em `server/index.js:20447` + `client/src/components/ItensFornecedor.js:208`)
  como galho de carga inicial → **A5** formulário + **rotas declaradas antes do `path="*"`**
  (`client/src/App.js:332`) → **A7** botão "Gerar pedido" na Reposição, fechando o elo com
  `vincularPedidoCompra` (`server/services/almoxarifado/purchaseService.js:52`, hoje **sem
  consumidor no client**).
- **O contrato que ela consome DESTA etapa, já congelado:**
  `itens_pedido_compra.quantidade_recebida` (REAL, `DEFAULT 0`, acumulado **só** por
  `darEntradaEstoque`, dentro do claim) e
  `recebimentos_material_itens_almoxarifado.pedido_item_id`; a leitura derivada
  (`quantidade_pedida`, `quantidade_recebida`, `saldo_pendente`, `saldo_pendente_material`,
  `situacao_recebimento`) com `?pendentes=1` **no `WHERE`, antes do `LIMIT`**; e a rota
  `GET /almoxarifado/recebimentos-aux/pedidos-compra/:id/itens`. **Quem cria pedido tem de criar
  também as LINHAS** — pedido sem linhas é `ABERTO`, aparece no `<select>` e recusa o recebimento
  com literal própria (RN-24/RN-25). Isso é o comportamento **correto** e **não** deve ser
  "consertado" na 38.
- **Pontos de atenção medidos:** `itens_pedido_compra` **é do almoxarifado**
  (`server/services/almoxarifado/schema.js:1311`) e só `pedidos_compra` é core
  (`server/index.js:19230`) — o design da 37 dizia que as duas eram core e **estava errado**, o que
  **barateia** a 38; o `DELETE /api/compras/:tipo/:id` genérico (`server/index.js:20060`) apaga o
  pedido e **deixa os itens órfãos**; o `numero` do pedido é **digitado** e não tem gerador (o
  almoxarifado tem `numeroDoc.js`, o core não); o vocabulário de `status` **nunca foi exercido** em
  produção (`client/src/components/Compras.js:96-108` pinta nove valores minúsculos com fallback
  `'#95a5a6'`); e há **4 regras de negócio sem dono** — quem aprova, o que trava depois de começar a
  receber, o que acontece ao cancelar, como se numera → letra **B**.
- **Risco de escopo, já resolvido pelo caminho reversível:** a tela é do módulo **core Compras**,
  mas a spec vive em `specs/modulo-almoxarifado/22-integracoes/` como *"fatia Compras"*, e o guia do
  almoxarifado ganha a seção **dizendo que a tela é do Compras**.
- **O que NÃO reabrir:** os itens parked desta etapa (seção "Parked", acima) e, em especial, a
  decisão 9 (item fora do pedido entra sem régua de saldo), o saldo que só conta a **entrada
  física**, a situação **derivada** (nada é gravado em `pedidos_compra`), o acumulador
  **não-fatal**, e a barreira comparando **por material**. Nenhum deles é bug; todos são contrato
  escrito, com o custo declarado.
