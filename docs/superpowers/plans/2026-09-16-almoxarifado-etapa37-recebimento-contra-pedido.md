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
> 1. **A régua de excedente das duas portas da 36** passa a ser *"recebida > esperada **E** recebida
>    > quantidade JÁ ARMAZENADA"*. Em `aa39155` isso não existia; em `230baf6` existe como
>    `opcoes.ignorarInalteradas` (`receiptService.js:280-298`), passado **só** pelo `/fiscal`
>    (`:464`) e **não** pelo `/conferir` (`:334`). A onda está trocando as duas por uma regra só.
>    **Esta etapa depende disso** — ver o achado (2) da seção da Fase 2 no fim deste plano.
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
| **400 (excedente sem flag)** | `{ error: 'Quantidade recebida (<recebidaTotal>) maior que o saldo do pedido (<saldoMaterial>) para o material <codigo> — <SUFIXO> }` · `<codigo>` = `material_codigo` da linha, senão `itens_pedido_compra.codigo`, senão `#<material_id>` · ⚠️ **(Fase 2) `<SUFIXO>` é copiado LITERALMENTE do 400 de `assertExcedentePermitido` depois da onda da 36** (achado F3: deixou de ser "marque a autorização de excedente para registrar" e passou a nomear quem autoriza). As duas portas têm de dizer a **mesma** instrução ao operador; o plano não pode congelar aqui um texto que a 36 acabou de trocar. Leia o código no Step 3 da T2, copie, e escreva a literal final **nesta linha** antes de commitar a T2 |
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

- [ ] **Step 1: escrever o teste e ver os dois cenários vermelhos** (leia **qual** asserção cai)

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

- [ ] **Step 2: rodar e LER os números**

```
cd server && node tests/api/pedidoSaldoRecebido.api.test.js
```

Previsão: **(1) e (2) vermelhos** — o (1) na asserção da coluna `quantidade_recebida`
(`PRAGMA` não a devolve), o (2) **não** deveria cair hoje por si (rodar `initSchema` duas vezes já é
idempotente) mas cai junto no `assert` da coluna; **(3) vermelho** pelo `no such table:
pedidos_compra`. Se algum vier verde, **pare**: alguém já mexeu no schema e o cenário mede outra
coisa. Cole aqui as linhas reais do `✗`.

- [ ] **Step 3: implementar** — as três linhas de `schema.js` e o stub do harness, com o comentário
      do **por quê** em cada um (o stub cita o precedente de `clientes`/`fornecedores` e diz que a FK
      fica fora de propósito, com os quatro arquivos nomeados).

- [ ] **Step 4: rodar de novo, e rodar os SEIS arquivos que criam `pedidos_compra`**

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

- [ ] **Step 5: sabotagens**

| # | Sabotagem | Âncora (`grep -cF` = 1 **pós-conserto**) | Qual asserção tem de cair |
|---|---|---|---|
| 1 | trocar o `safeAlter` da coluna nova por `db.run(sql, () => {})` | o bloco `const itensPedidoCols = [` | nada no (1)/(2) — **e esse é o achado**: prova que a régua estrutural **não** protege o anti-padrão. Registre como fragilidade (letra G) e **mantenha `safeAlter`**; a régua do padrão é `npm run test:safealter`, que existe e **tem** de ser citado no fechamento |
| 2 | remover `DEFAULT 0` da coluna nova | `'quantidade_recebida REAL DEFAULT 0'` | `assert.strictEqual(col.quantidade_recebida, 0)` do (1) — cai com `null` |
| 3 | apagar `created_at` do stub do harness | o bloco `CREATE TABLE IF NOT EXISTS pedidos_compra (` em `testApp.js` | o **status 200** do (3), com `SQLITE_ERROR: no such column: p.created_at` |

- [ ] **Step 6: commit** — `git add` só dos três caminhos. Mensagem: qual era o furo (o pedido não
      tinha onde guardar o que chegou, e o item do recebimento não guardava a linha do pedido), o que
      foi decidido (duas colunas, `safeAlter` sem ledger, stub no harness sem FK) e o descartado
      (uma coluna só com acúmulo por material; ledger; FK no stub).

---

### Task 2: a terceira porta — saldo e excedente no `POST` **(tronco)**

**Files:**
- Modify: `server/services/almoxarifado/receiptService.js` (`assertAutorizacaoExcedente` novo;
  `assertExcedentePermitido` delega; `criarRecebimento`)
- Create: `server/tests/api/recebimentoExcedentePedido.api.test.js`

**Interfaces:** `assertAutorizacaoExcedente(user, autorizado, mensagem400)` e
`saldoDasLinhasDoPedido(db, pedidoId)` são **internas** do `receiptService` (exportar **só** se a T7
chamar direto, e então dizer por quê). Nada mais sai.

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
      autorizacao no /conferir. Se a onda da 36 tiver aplicado a regra nova SO no /fiscal
      (em 230baf6 o /conferir NAO recebe `ignorarInalteradas` — receiptService.js:334), este
      cenario fica VERMELHO e o achado e da onda, nao desta task: nao conserte aqui por fora,
      RELATE e passe a regra para as duas portas num commit proprio]

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

- [ ] **Step 1: escrever o arquivo com os treze cenários** (**(Fase 2)**: nove + (10) a (13); o (1) depende do acumulador da T3; nesta
      task, produza o saldo gravando `quantidade_recebida` na linha do pedido **por `dbRun` direto no
      teste** e deixe um comentário dizendo que a T3 é quem produz isso em produção — senão a T2 fica
      bloqueada pela T3 e o sort inverte).
- [ ] **Step 2: rodar e LER os números.** Previsão: **(1), (2), (4), (5), (6), (7), (10), (13)
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
- [ ] **Step 3: implementar.** Extrair `assertAutorizacaoExcedente` (com o comentário do design
      dizendo **por que** só a metade decisória é compartilhada); `assertExcedentePermitido` passa a
      delegar as duas exceções finais; em `criarRecebimento`, calcular o saldo por linha, resolver o
      `pedido_item_id`, aplicar a régua agregada **antes** do `inserirComNumeroUnico`, gravar
      `pedido_item_id` no `INSERT` do item, e auditar os excedentes **depois** dos `INSERT`.
- [ ] **Step 4: rodar o arquivo novo E a régua do que não pode mudar**

```
cd server && node tests/api/recebimentoExcedentePedido.api.test.js
cd server && node tests/api/recebimentoExcedente.api.test.js      # a Etapa 36, INTEIRA
cd server && node tests/api/recebimentoTipoEnum.api.test.js
cd server && node tests/api/recebimentoNfDuplicada.api.test.js
cd server && node tests/api/solicitacaoCicloVida.api.test.js
cd server && npm run test:almoxarifado   # a suite de SERVICO (server/tests/almoxarifado.test.js),
                                         # que recebe por pedido em dois cenarios
```

- [ ] **Step 5: sabotagens**

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

- [ ] **Step 6: commit** — por quê (a terceira porta gravava 999 de 10 e o excedente não tinha
      referência nenhuma senão o número que o operador digitou), o decidido (metade decisória
      compartilhada, 400 próprio, régua agregada por material, resolução no servidor) e o descartado
      (reusar a função inteira, parametrizar a literal da 36, régua por linha, confiar no payload).

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

- [ ] **Step 1: escrever os cinco cenários**
- [ ] **Step 2: rodar e LER.** Previsão: **(4), (6), (8) vermelhos** na asserção do valor
      (`0 !== 6`); **(5) e (7) VERDES antes do conserto** — e isso é esperado e **tem de ser dito**:
      enquanto ninguém soma, "continua 6" e "não entra na conta" são verdadeiros por vacuidade.
      **Eles só valem depois**, e é a sabotagem 1/2 que prova que sabem falhar. Cole as linhas do `✗`.
- [ ] **Step 3: implementar** as 4 linhas, com o comentário do porquê do lugar (os dois caminhos de
      entrada; o claim; depois da entrada física).
- [ ] **Step 4: rodar o arquivo, a suíte do serviço e os quatro arquivos que recebem por pedido**

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

- [ ] **Step 5: sabotagens**

| # | Sabotagem | Âncora (`grep -cF` = 1 **pós-conserto**) | Qual asserção tem de cair |
|---|---|---|---|
| 1 | ⚠️ **(Fase 2) NÃO "mover o `UPDATE` para dentro de `processarNota`"** — dentro de `processarNota` não existem `item` nem `qtd` no escopo (`receiptService.js:865-910`), e o arquivo morreria em `ReferenceError` no primeiro cenário, derrubando **todos** juntos: é exatamente a regra (iv) deste plano. A sabotagem que produz o **mesmo defeito** de forma legível é **condicionar o `UPDATE` ao status do documento**: envolvê-lo em `if (rec.status === 'EM_ENTRADA_NF' \|\| rec.status === 'ENCAMINHADO_FATURAMENTO') { … }` — `rec` **está** no escopo de `darEntradaEstoque` (é parâmetro), e o efeito é idêntico: só o caminho `processarNota` conta ao pedido | o bloco do `UPDATE itens_pedido_compra` | **(6)**, o caminho `aprovar` — e **só** ele. Se (4) e (8) continuarem verdes e o (6) cair, o controle valeu exatamente onde tinha de valer |
| 2 | mover o `UPDATE` para **fora** do `if (!claim) continue` (antes do claim) | o mesmo bloco | **(5)**, `continua 6, nao 12` |
| 3 | somar `item.quantidade_esperada` em vez de `qtd` | `[qtd, item.pedido_item_id]` | **(4)**, na metade em que a recebida difere da esperada (o cenário usa 6 recebidos de 10 esperados) |
| 4 | trocar `COALESCE(quantidade_recebida, 0)` por `quantidade_recebida` nu | o mesmo bloco | **(4b)** — **(Fase 2) e não o (4)**: a coluna nasce `DEFAULT 0` (é o que a T1 afirma), então no (4) a conta é `0 + 6` e a sabotagem seria **no-op**. Só a linha inserida com `NULL` **explícito** do cenário (4b) faz `null + 6 = null` |
| 5 **(Fase 2)** | remover o `try/catch` não-fatal do `UPDATE` do pedido (deixar o `throw` subir) | o `catch` do `UPDATE itens_pedido_compra` | **(9)**, que passa a devolver 400/500 no processar com o estoque já movido — é a prova de que a contagem do pedido não pode derrubar a entrada de nota |

- [ ] **Step 6: commit**

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

- [ ] **Step 1: escrever os sete cenários** (**(Fase 2)**: cinco + (6) e (7))
- [ ] **Step 2: rodar e LER.** Previsão: **(1), (2), (3), (4) vermelhos** (campos ausentes /
      rota 404 por não existir); **(5) VERDE antes do conserto** — declarado: ele é a régua de que a
      task **não** passou a escrever na tabela core, e nasce verde por definição. A sabotagem 3 é o
      que prova que ele sabe falhar.
- [ ] **Step 3: implementar** — subquery de soma por `pedido_id` no aux, `situacaoRecebimentoPedido`
      numa função só, a rota nova espelhando o gate das outras `-aux` (só `auth`).
- [ ] **Step 4: rodar**

```
cd server && node tests/api/pedidosCompraSaldoAux.api.test.js
cd server && node tests/api/pedidoSaldoRecebido.api.test.js
cd server && node tests/api/recebimentoExcedentePedido.api.test.js
```

- [ ] **Step 5: sabotagens**

| # | Sabotagem | Âncora (`grep -cF` = 1 **pós-conserto**) | Qual asserção tem de cair |
|---|---|---|---|
| 1 | trocar o filtro por `saldo_pendente > 0` | o bloco do `if (pendentes)` | **(3)**, na asserção do pedido **sem itens** presente |
| 2 | trocar `>=` por `>` em `recebida >= pedida` na derivação | `if (pedida > 0 && recebida >= pedida) return 'RECEBIDO'` | **(2)**, em `'RECEBIDO'` (vira `PARCIAL` no caso exato) |
| 3 | acrescentar um `UPDATE pedidos_compra SET status = 'RECEBIDO'` no acumulador | a linha nova (é sabotagem **aditiva**: a âncora é o `UPDATE itens_pedido_compra` da T3) | **(5)** — e é o que prova que o cenário do contrato core não é decorativo |
| 4 | fazer a rota de itens devolver linha sem `material_id` | o `.filter(` da rota nova | **(4)**, na contagem de itens |
| 5 **(Fase 2)** | mover o filtro de `pendentes` para um `.filter()` **depois** da query (fora do `WHERE`) | a cláusula de `pendentes` no `WHERE` | **(6)**, que passa a devolver `[]` — o cenário existe para prender a **posição** do filtro em relação ao `LIMIT 50`, que nenhuma asserção de conteúdo pega |
| 6 **(Fase 2)** | remover o `Math.max(0, …)` do `saldo_pendente` | o `Math.max(0,` da derivação | **(7)**, com `-2` no lugar de `0` |

- [ ] **Step 6: commit**

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

- [ ] **Step 1: escrever os três cenários** (fixture do pedido `312`, item do pedido `9312`; mock da
      rota nova no `beforeEach`)
- [ ] **Step 2: rodar e LER**

```
cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/RecebimentosAlmoxarifado.test.js
```

Previsão: os três vermelhos — o (r) em `'Itens do pedido'` ausente no DOM (hoje a tela mostra **só**
o `<select>`), o (s) no aviso, o (t) no bloco de recusa. Cole as linhas reais.

- [ ] **Step 3: implementar** — `selecionarPedido` assíncrono buscando os itens; `form.itens` com
      `pedido_item_id`/`saldo_pendente`; bloco de itens renderizado **também** no caminho
      `PEDIDO_COMPRA`; `avisoAcimaDoSaldo`; a caixa sob `pode('autorizar_excedente')`; `erroCriacao`
      no DOM; `handleCriar` com o `map` do caminho do pedido.
- [ ] **Step 4: rodar a suíte de client INTEIRA e o build**

```
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```

> `CI=true` faz warning virar erro no build. E a suíte inteira é obrigatória aqui: a tela de
> Recebimentos tem 17 cenários e a Etapa 34 já pagou um caso de bloco novo remontando o de anexos —
> o bloco de itens **do modal** não toca o painel, mas a régua é a suíte, não o argumento.

- [ ] **Step 5: sabotagens**

| # | Sabotagem | Âncora (`grep -cF` = 1 **pós-conserto**) | Qual asserção tem de cair |
|---|---|---|---|
| 1 | voltar `handleCriar` a mandar `itens: []` no caminho do pedido | o bloco do `map` do caminho `PEDIDO_COMPRA` | **(r)**, no `toEqual` do payload |
| 2 | trocar `>` por `>=` no `avisoAcimaDoSaldo` | `recebida > saldo` no aviso | **(s)**, na metade positiva (digitar 6 passaria a mostrar o aviso) |
| 3 | alterar a literal `Acima do saldo:` | `Acima do saldo:` | **(s)**, pela literal |
| 4 | remover o `pode('autorizar_excedente')` da caixa | `pode('autorizar_excedente')` (dará 2 — o painel da 36 tem o outro; use o **bloco do modal**) | **nada**, previsto: o hook é mockado com `pode: () => true`. **Caso 2 da `fechar-etapa`** — mantenha a guarda e **declare** que a suíte não a protege; a prova real é o 403 do servidor do cenário (t) |
| 5 | limpar o formulário no `catch` do 403 | o bloco do `catch` de `handleCriar` | **(t)**, na asserção de que o modal continua de pé com o valor digitado |

- [ ] **Step 6: commit**

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

- [ ] **Step 1: escrever os dois cenários e rodar ANTES de apagar nada**

```
cd server && node tests/api/schemaUnico.api.test.js
```

Previsão: **(4) vermelho** (`grep -c "ALTER TABLE" server/routes/almoxarifado.js` → **21**);
**(5) VERDE antes do conserto** — e é exatamente por isso que ele é o controle: ele prova, **com os
21 ALTER ainda no arquivo mas sem nunca terem rodado com sucesso**, que `initSchema` sozinho já cria
as 21 colunas. Cole a linha do `✗` e o número do `grep -c`.

- [ ] **Step 2: apagar `:1775-1796`** (comentário + 21 linhas) e rodar de novo: **(4) e (5) verdes**,
      e `grep -c "ALTER TABLE" server/routes/almoxarifado.js` → **0**, citado no fechamento.
- [ ] **Step 3: rodar a suíte de API inteira** — este é o galho que mexe no arquivo de rotas que
      **todos** os testes carregam.

```
cd server && npm run test:api
```

- [ ] **Step 4: sabotagens**

| # | Sabotagem | Âncora (`grep -cF` = 1 **pós-conserto**) | Qual asserção tem de cair |
|---|---|---|---|
| 1 | reintroduzir **uma** linha `db.run('ALTER TABLE materiais_almoxarifado ADD COLUMN ponto_pedido REAL DEFAULT 0', () => {})` no arquivo de rotas | a linha do comentário `// TIPOS DE MATERIAL` (âncora de posição, **depois** do bloco apagado) | **(4)**, `DDL/ALTER ainda presente no arquivo de rotas` |
| 2 | remover `'ponto_pedido REAL DEFAULT 0'` da lista de colunas de `schema.js` | `'ponto_pedido REAL DEFAULT 0'` | **(5)**, no nome `ponto_pedido` e no total 21 — é o que prova que o controle positivo **sabe falhar** |
| 3 | trocar o total afirmado de 21 por 20 no teste | o `assert.strictEqual(total, 21)` | nada: prova que a asserção de total é redundante com a de nomes. **Achado esperado** — mantenha as duas e declare qual protege o quê |

- [ ] **Step 5: corrigir a spec 00 e o mapa, DIZENDO que estavam errados.** Na ressalva do item 0.2
      (`00-fundacao-tecnica/README.md:31`) e na linha 00 do mapa
      (`specs/modulo-almoxarifado/README.md:909`): a referência `~1018-1038` **estava errada** (hoje
      são as rotas de conferências, e quem seguiu a ref podia concluir que a pendência já tinha sido
      paga); "vários duplicam" **estava errado**, eram **todos os 21**; e a **premissa de risco
      estava errada** (`ALTER` como origem única → coluna ausente em produção → 500) — medido: 21/21
      mortos, banco real de 161 MB com **0 colunas ausentes**, e o modo de falha real é o
      `initSchema` **não-awaited**, que faz os 21 falharem em **todo** boot (`no such table` em banco
      novo, `duplicate column` em banco migrado), agora registrado como fragilidade da letra **G**.
      Marcar o 0.2 **sem ressalva**, com o hash desta task.
- [ ] **Step 6: commit** — um commit, assunto único: os 21 ALTER e a spec que apontava para o lugar
      errado.

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

- [ ] **Step 1: escrever o arquivo com os dois blocos** — o bloco **`pela ROTA`** usa
      `request(app).post(...)` e `setUser` para trocar de perfil; o bloco **`pelo SERVIÇO`** chama
      `receiptService.criarRecebimento` / `processarNota` direto, com o usuário passado como objeto.
      **Os dois são obrigatórios:** a Etapa 25 desta base mediu **12 cenários de unidade verdes e 4
      de integração vermelhos** porque `req.user` é reatribuído pelo `auth` que cada rota redeclara —
      verde por unidade não prova que as partes compõem.
- [ ] **Step 2: rodar.** Previsão: **verde de primeira** (T2/T3/T4 já entregaram cada peça). ⚠️
      **`fechar-etapa`: desconfie de teste que passa de primeira.** A sabotagem abaixo é obrigatória,
      e é ela que distingue "compõem" de "cada uma passa sozinha".
- [ ] **Step 3: sabotagem de composição** — apagar **só** o `pedido_item_id` do `INSERT` do item em
      `criarRecebimento` (âncora: o bloco do `INSERT INTO recebimentos_material_itens_almoxarifado`).
      **Qual asserção cai:** o passo **2** (o acumulador não acha a linha e o saldo fica 10), com a
      régua do `POST` **ainda verde** — é o defeito de **fiação** entre dois troncos, que nenhum
      arquivo de unidade pega. Restaure por perl inverso e confira o `md5sum` pós-conserto.
- [ ] **Step 4: os cinco comandos da suíte, com os números LIDOS da saída**

```
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```

- [ ] **Step 5: commit**

---

### Task 8: fechamento (use a skill `fechar-etapa`)

- [ ] **Step 1: `specs/modulo-almoxarifado/08-recebimento/README.md`** — status no topo; o item
      `[ ] Recebimento parcial de pedido` marcado **com o hash**; na tabela de regras, o teste
      `recebimento parcial atualiza saldo pendente do pedido` de ⏳ para ✅ **nomeando o arquivo**; as
      **RN-20 a RN-27** escritas; e a nota de que `[ ] Recebimento excedente só com autorização` foi
      pago pela **Etapa 36** (não por esta) — a 37 acrescentou a **terceira porta** e a régua contra
      o pedido.
- [ ] **Step 2: `00-fundacao-tecnica/README.md` + a linha 00 do mapa** — já feitos na T6; conferir
      aqui que a ressalva saiu e que a correção **diz** que a spec estava errada.
- [ ] **Step 3: manual, seção 14** — a promessa do **14.1** ("o sistema traz os itens, as quantidades
      e os valores unitários já preenchidos") passa a ser **verdade**, e ganha o que ela não dizia:
      o que vem preenchido é o **saldo pendente**, editável; receber acima do saldo exige autorização
      (Administrador ou Compras) e a literal da recusa; e **a entrada no estoque continua sendo o
      único momento em que o pedido baixa** (14.2). Acrescentar o efeito de borda declarado: uma
      linha do pedido pode terminar com recebido maior que o pedido (excedente autorizado, ou duas
      linhas do mesmo material), e a **situação** do pedido é derivada de somas.
- [ ] **Step 4: mapa e guia.** Linha 08 do mapa (`specs/modulo-almoxarifado/README.md:917`) com o
      parcial fechado; e o guia com a seção da **Etapa 37** em linguagem de usuário: tabela
      **Antes → Agora** (o pedido não sabia que foi recebido / agora tem saldo e situação; escolher
      "Por Pedido de Compra" não mostrava item nenhum / agora traz os itens com o saldo, editáveis;
      `POST` aceitava 999 de 10 / agora recusa acima do saldo), **roteiro de teste manual clicável**
      (criar pedido no módulo Compras, receber parcial, ver o saldo, receber o resto, ver
      `RECEBIDO`, tentar acima do saldo com e sem a permissão) e **o que a etapa NÃO cobre**
      (conferência física estruturada, divergência formal numerada, item fora do pedido,
      `initSchema` awaited).
- [ ] **Step 5: letra B a partir do próximo número LIVRE** (**(Fase 2)**: medido, não "B86") com as
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

- [ ] **Step 5b (Fase 2): as quatro heranças da onda da 36 que ESTA etapa tem de registrar**, porque
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

- [ ] **Step 6: a próxima tarefa detalhada — Etapa 38**, no fim deste plano, com `arquivo:linha`, o
      contrato que cada candidata consome e o que **não** reabrir. Candidatas medidas, em ordem de
      valor: (a) **divergência formal numerada** — agora tem os dois insumos (o campo de conferência
      da 36 e o link `pedido_item_id` desta etapa), e é o que falta para o item da spec 08;
      (b) **barrar item que não está no pedido** (decisão 9 desta etapa — decisão de negócio);
      (c) o `<select>` de fornecedores mandar **`fornecedor_id`** (item (d2) da 36, que faria a perna
      do `fornecedor_nome` na chave da duplicata virar retaguarda); (d) o **`UNIQUE` da NF** depois
      da consulta A9; (e) **A2** da Fase 0 (varredura de `ALTER TABLE` fora de `safeAlter` na pasta
      do módulo) junto com o **`initSchema` awaited**, que são a mesma etapa de fundação; (f) o
      **teto da faixa do clipe** (F12, exige navegador) e os furos **C43/C44** da Etapa 33.
- [ ] **Step 7: o checklist final da `fechar-etapa`** — os cinco comandos, com os números **lidos da
      saída**, `git status` limpo (fora os três artefatos não versionados conhecidos), e
      `git merge-base --is-ancestor <hash> HEAD` para **cada** hash citado nos documentos.
- [ ] **Step 8: commit** — um commit, assunto único: o fechamento da etapa.

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
| 2 | **O fluxo não era traçado até o fim — a lição da 36, repetida.** O `POST` desta etapa passa a **criar** documentos que nascem com `recebida > esperada` (excedente autorizado na criação): população que antes só existia por autorização no `/conferir`. Depois da criação vêm `/conferir`, `/fiscal` e `validarDadosProcessamento`, e a barreira da 36 lê a `quantidade_esperada` **gravada**. Em `230baf6` o `ignorarInalteradas` é passado **só** pelo `/fiscal` (`:464`) e **não** pelo `/conferir` (`:334`) — então, sem a regra nova nas duas portas, todo "Salvar Conferência" do documento criado por esta etapa toma **400**, e o ALMOXARIFE não consegue nem autorizar (403). O plano ia de "criar" a "processar" em um passo e não tocava nenhuma das três portas | `receiptService.js:280-334`, `:464` · plano T7 roteiro | cenário **(12)** na T2 (conferir → fiscal → processar no mesmo `test()`), passos **2** e **5b** do roteiro da T7 reescritos porta por porta, e a dependência declarada no cabeçalho do plano |
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
