# Etapa 143 (propostas): o item que não é item — a recusa antes de gravar, o histórico pelo pareamento e o produto de código repetido (C310, C311) — plano

> Origem: "Próxima tarefa detalhada — Etapa 143" do plano da 142
> (`docs/superpowers/plans/2026-10-18-almoxarifado-etapa142-itens-iguais-na-proposta.md`). O design, com a Fase 0 medida, está neste
> plano (seção "Fase 0 — medido"): a etapa é pequena e o design não justifica um documento à parte.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-18): última B **B928**, último C
> **C310**, última A **A91**. Esta etapa: **B929+**, **C311+**, **A92+**. Worktree `CRM-wt-e143`, branch `etapa-e143` (da main `8b63bf94`).
>
> **Trava de máquina:** `scratchpad/e143-lock.sh` (o diretório `maquina-testes.lock` de sempre). Um arquivo de teste de servidor por vez,
> inclusive os revisores. Revisão obrigatória da proposta: `scratchpad/e143/review-proposta.sh` (23 + editor 39; o teste novo da rota entra na lista
> "pela rota" da revisão — os 23 continuam 23). A etapa **não** toca o template; toca o `index.js` (o `PUT /api/propostas/:id`, o `POST /api/propostas`, o
> `POST /api/propostas/gerar-automatica`, a leitura dos itens do `/premium` e do `/pdf`), `server/propostaItensDiff.js` e
> `server/totalDocumentoProposta.js` (a consulta dos itens do pedido de aprovação — Fase 2 C-1).
>
> **Fase 2 (um revisor fresco, só leitura): 1 Critical, 4 Important, 7 Minor — todos aceitos antes do commit, com o que mudou:** **C-1**
> o mesmo `JOIN` aparado mora numa terceira consulta, a `ITENS_SQL` de `totalDocumentoProposta.js`, que dá o total do pedido de aprovação
> do desconto (a RN-141.08 fixou que é a conta do documento): com a T3 só no `/premium`/`/pdf`, o documento mostraria R$ 1.234 e o pedido
> gravaria R$ 2.468 → **um fragmento SQL só** (`JOIN_PRODUTO_DO_ITEM`, exportado de `totalDocumentoProposta.js`) nas três, e o cenário do
> pedido de aprovação no teste. **I-3** o `JOIN` alimenta o reparo das variáveis manuais (`repararVariaveisManuais` recebe as linhas
> juntadas): com o item duplicado, duas órfãs de itens velhos distintos caíam no mesmo item → declarado na RN-143.05 e cenário próprio.
> **I-4** com o pareamento por id o item manual com **só** a descrição editada pareia com o seu gravado, e `CAMPOS_COMPARAR` não tinha a
> descrição: a troca de texto sumia do histórico (antes era "removido A + adicionado B") → a descrição entra na comparação, aparada e sem
> caixa (o dado antigo em caixa baixa não vira edição); o teste muda **só** a descrição. **I-5** a geração automática com produto que é
> objeto mas não existe (`{id: 99999}`, `{}`) ainda cria proposta vazia com 200 → **declarado como C313** (aberta; a RN-143.03 diz "nenhuma
> proposta nasce" só para o não-objeto). **M-6** a ordem das recusas estava incompleta → escrita inteira nas RN, e a `backend.md` (que não
> tinha os dois da Etapa 140) corrigida junto. **M-1** a Fase 0 do `PUT [null]` não dizia que **antes** da exceção já tinham sido gravados
> o `UPDATE` da proposta (título, revisão, sufixo `REVnn`, `html_rendered` limpo), a linha de `proposta_revisoes` e a aposentadoria das
> órfãs (corrigido na tabela). **M-7** o plano citava `PreviewPropostaEditavel` como chamador — ele só é importado pelo
> `components/PropostaForm.js` **legado**, sem rota; o preview vivo (`proposta/PropostaPreviewEditavel.js`) não faz `PUT` com `itens`
> (corrigido). **M-8** a B931 dizia "o log diria uma coisa e o banco outra" — vale para as variáveis, **não** para os campos preservados,
> que a mesclagem copia do que saiu (dito na B931). **M-9** a geração automática grava o código cru do produto (`'PJ1 '`) e o formulário, ao
> salvar, o apara — o produto juntado pode trocar (D (143), consequência da C312). **M-10** o `JOIN` não filtra `ativo` (o de antes; dito na
> RN). **M-11** o exemplo de caixa do histórico só existe com dado antigo (o teste puro semeia assim). **M-12** a T3 tem acoplamento de regra
> com a 141 (aprovação) e a 142 (reparo) → a suíte inteira roda antes do commit. **Verificado e correto pelo revisor:** a Fase 0 (as linhas
> da tabela, lidas no código); nenhuma tela viva manda o que passa a ser recusado (`montarPayloadProposta`, `GerarPropostaModal`; o erro sai no
> toast); clone, nova revisão e relatórios leem `proposta_itens` sem `JOIN`; o `GET /api/propostas/:id` junta por igualdade crua (o `UNIQUE`
> garante um produto); T2 e T3 independentes de regra entre si.

## Fase 0 — medido (sondas pela rota, `index.js` real em pasta vazia, antes de qualquer código)

Sonda `server/tests/sonda/e143.js` (não versionada), proposta com `[P, Q]` gravados, `PUT` com `itens` = …:

| Corpo | Hoje (medido) |
|---|---|
| `PUT [null]` (tamanho diferente dos atuais) | **não responde** (timeout de 8 s) e os itens **somem** (`[]` depois): `compararItens` volta `true` sem mapear (tamanhos diferentes), e a exceção sai no `forEach` do `INSERT`, **depois** do `DELETE` — e depois do `UPDATE` da proposta (título, revisão +1, sufixo `REVnn`, `html_rendered` limpo), da linha de `proposta_revisoes` e da aposentadoria das órfãs (Fase 2 M-1). O processo segue vivo pelo `uncaughtException` de `services/sqliteConcurrency.js` |
| `PUT [null, P]` (mesmo tamanho dos atuais) | **não responde**; itens intactos (a exceção sai no `normalizarItem` de `compararItens`, antes do `DELETE`) |
| `PUT [P, null]` | **não responde**; itens intactos (idem) |
| `PUT [5]`, `["x"]`, `[[P]]` | **200**; grava **um item vazio** (descrição `''`, sem código) no lugar dos itens |
| `PUT [P, 7]` | **200**; grava P **e um item vazio** |
| `POST [null]` | **200**; proposta criada **sem o item** (o `try` por item engole a exceção) |
| `POST [null, P]` | **200**; só P (o nulo some calado) |
| `POST [5]`, `["x"]`, `[[P]]` | **200**; proposta com **um item vazio** |
| `gerar-automatica produtos: [null]`, `[null, {id}]` | **500** *"Cannot read properties of null (reading 'id')"*; nada criado |
| `gerar-automatica produtos: [5]`, `["x"]` | **200**; proposta criada **sem nenhum item** (valor 0) |
| servidor depois de tudo | vivo (`GET /propostas` 200) |

Ou seja, a C310 é **maior** do que a 142 registrou: além do `PUT` que não responde, o `PUT` e o `POST` gravam lixo calados com 200 e a
geração automática responde 500 com a mensagem do JavaScript. *(A C310 dizia "`[null, {...}]` apaga os itens antes de travar" — **medido,
estava impreciso**: com o corpo do **mesmo tamanho** dos itens gravados a exceção sai antes do `DELETE` e nada é apagado; com tamanho
**diferente** — `[null]` contra 2 gravados, ou `[null, P]` contra 1 — sai depois do `DELETE` e os itens somem. Os dois casos entram no teste.)*

**`itens` que não é lista** (M-4 da 142, declarado em D): `PUT {itens: {}}`/`"x"`/`5` apaga os itens com 200; `itens: null` apaga
todos — e **este** é contrato escrito (`specs/proposta-editavel/backend.md`, "`[]`/`null` apaga todos", Etapa 138).

**O histórico de itens (`diffItensParaLog`)** agrupa por `chaveDe` (sem caixa, sem aparar cada parte) e pareia por **posição** dentro do
grupo — enquanto a mesclagem e a religação pareiam por `parearItens` (o `id` que a tela manda). Medido no código: atuais `[P qtd 1 (id1),
P qtd 2 (id2)]`, corpo `[{P qtd 2, id: id2}]` → o log registra **"editado: Qtd 1 → 2"** e **"removido: P"** — o vendedor tirou o primeiro e
o histórico diz que editou o primeiro e tirou o segundo. *(A D (142) dizia isto lido; a T2 mede pela rota antes de mudar.)*

**O `LEFT JOIN produtos` por código do `/premium` e do `/pdf`** (`TRIM(COALESCE(pi.codigo_produto,'')) = TRIM(COALESCE(pr.codigo,''))`).
A observação da 142 (r3 §4) dizia "duplica o item se dois produtos tiverem o mesmo código" e pedia para medir antes. **Medido:** a coluna
`produtos.codigo` é `UNIQUE NOT NULL` — mas o `UNIQUE` é do texto **cru** e o `JOIN` compara **aparado**, e o cadastro
(`POST /api/produtos`) **não apara** o código. Sonda `e143b`/`e143c` pela rota: os produtos `'PJ1'`, `'PJ1 '` e `' PJ1'` foram aceitos
(200 cada); o item `PJ1` da proposta saiu **três vezes** no `JOIN`; no `/premium` o valor do item (R$ 1.234) passou de 2 para **4**
ocorrências — **o item sai duas vezes no documento** com dois produtos `'PJ1'`/`'PJ1 '`. E mais: o cadastro aceita código **só de espaços**
(`'  '`, `'   '`: 200) e o item **manual** (sem código) casa com ele (`'' = ''`) — o `/premium` trocou o texto "ITEM MANUAL" pelo nome
desse produto. No banco local (cópia de 09/10): `SELECT TRIM(codigo), COUNT(*) FROM produtos GROUP BY 1 HAVING COUNT(*) > 1` → a medir na
T3 (vira A92). **É defeito, e anterior** → **C311**.

## Regras de negócio

- **RN-143.01 — o `PUT` recusa o item que não é item, antes de qualquer gravação.** `itens` presente que não é lista nem `null`
  (objeto, texto, número, booleano) → **400** *"Itens inválidos: os itens da proposta devem ser enviados como uma lista."*; `itens` lista
  com algum elemento que não é objeto (`null`, número, texto, booleano, lista) → **400** *"Item inválido: cada item da proposta deve ser
  um objeto."* Nada é gravado: nem a proposta (colunas, número, revisão, `html_rendered`), nem `proposta_revisoes`, nem o reparo das
  variáveis manuais, nem os itens, nem o histórico. Ordem: 404 → título → margem → **itens** → motivo → 403 do desconto → 409. `itens: null`
  continua apagando todos (contrato da 138); `itens` ausente continua não tocando. Ordem inteira (Fase 2 M-6): 404 → título → margem →
  **itens** → motivo da não venda → 403 "desconto aprovado só pela aprovação" (Etapa 140) → 409 responsável com pedido pendente (140) →
  403 do desconto acima de 5% / margem diferente da aprovada → 400 número em uso → 409 `PROPOSTA_ALTERADA`.
  Cenário: proposta `[P, Q]`; `PUT {titulo: 'Novo', itens: [null]}` → 400 com a mensagem; título, revisão e itens como estavam; a resposta
  chega (o de antes não respondia).
- **RN-143.02 — o `POST /api/propostas` recusa igual.** As mesmas duas recusas, com as mesmas mensagens, depois do título e da margem, antes
  de gerar número e de criar a proposta. Ordem inteira: título → margem → **itens** → motivo da não venda → cliente obrigatório/inválido →
  responsável/usuário inválido → 403 do desconto acima de 5%. Nenhuma proposta nasce. `itens: null` ou ausente = proposta sem itens (o de sempre).
- **RN-143.03 — a geração automática recusa o produto que não é objeto.** `produtos` com elemento que não é objeto → **400** *"Item
  inválido: cada item da proposta deve ser um objeto."*, depois do *"Cliente e produtos são obrigatórios"* e antes da margem. Nenhuma
  proposta nasce (antes: 500 com a mensagem do JavaScript, ou proposta vazia com 200).
- **RN-143.04 — o histórico de itens pelo mesmo pareamento.** `diffItensParaLog(atuais, corpo)` usa `parearItens`: item do corpo com par →
  comparado com o **seu** atual (editado se algum campo de `CAMPOS_COMPARAR` mudou); sem par → **adicionado**; atual que saiu →
  **removido**. Cenário: `[P qtd 1 (id1), P qtd 2 (id2)]`, corpo `[{P qtd 2, id: id2}]` → só **"removido: P"**, nenhuma edição. Sem ids, o
  de sempre (posição entre os iguais), agora pela identidade aparada e sem caixa (`'bomba p'` gravado antes → `'BOMBA P'` não é mais
  "removido + adicionado" — só com dado antigo: o servidor grava e compara em caixa alta, Fase 2 M-11). **A descrição entra na
  comparação** (aparada, sem caixa — Fase 2 I-4): o item manual com só o texto trocado é "editado: Descrição: A → B". Por id, item do corpo **sem** `id` com a identidade de um que saiu é "adicionado" e o que saiu "removido" — o mesmo que a
  religação faz com as variáveis (B931).
- **RN-143.05 — um produto por item na leitura do documento.** O `/premium` e o `/pdf` juntam a cada item **no máximo um** produto: o de
  código **igual** ao do item, senão o de código igual **aparado** de menor id; item sem código (ou só espaços) **não** junta produto
  nenhum. Cenário (C311): produtos `'PJ1'` e `'PJ1 '`, item `PJ1` → o item sai **uma** vez, com o produto `'PJ1'`; produto `'  '` e um
  item manual → o item sai com o **seu** texto. Vale para as **três** leituras, por um texto só (`JOIN_PRODUTO_DO_ITEM`): o `/premium`, o
  `/pdf` e o total do pedido de aprovação do desconto (`ITENS_SQL`, Fase 2 C-1); por consequência, o reparo das variáveis manuais da leitura
  vê cada item uma vez (Fase 2 I-3). Produto inativo entra na escolha (o de antes — o `JOIN` nunca filtrou `ativo`, M-10).

## Contratos de API (congelados)

| Rota | Recusa nova | Status | Mensagem literal |
|---|---|---|---|
| `PUT /api/propostas/:id` | `itens` presente, não lista, não `null` | 400 | `Itens inválidos: os itens da proposta devem ser enviados como uma lista.` |
| `PUT /api/propostas/:id` | elemento de `itens` que não é objeto | 400 | `Item inválido: cada item da proposta deve ser um objeto.` |
| `POST /api/propostas` | as mesmas duas | 400 | as mesmas duas |
| `POST /api/propostas/gerar-automatica` | elemento de `produtos` que não é objeto | 400 | `Item inválido: cada item da proposta deve ser um objeto.` |

"Objeto" = `v !== null && typeof v === 'object' && !Array.isArray(v)`. **Desde a Fase 5 (B934):** e cada campo do item, fora `acessorios`, é texto, número, booleano ou nulo — um campo objeto ou lista recusa com a mesma mensagem do item. Objeto vazio `{}` **passa** (o de sempre: item sem descrição —
fora do escopo, D (143)). A função pura `validarItensDoCorpo(itens)` (em `server/propostaItensDiff.js`) devolve `null` ou a mensagem;
as constantes `MSG_ITENS_LISTA` e `MSG_ITEM_INVALIDO` são exportadas. Resposta de sucesso: sem mudança. Front: nenhuma mudança (o
formulário e o modal da geração mandam sempre lista de objetos — `montarPayloadProposta`, `GerarPropostaModal`; *o plano citava também
`PreviewPropostaEditavel` — **estava errado**: ele só é importado pelo `components/PropostaForm.js` legado, sem rota (Fase 2 M-7)*); o erro, se um dia sair, aparece no toast que já lê `err.response.data.error`.

## Tasks (sort topológico)

- [x] **T1 — tronco — `a0e5fc6c`.** `validarItensDoCorpo` + as três portas (RN-143.01/02/03). Teste da rota novo
  `server/tests/api/propostaItemInvalido.api.test.js` (pasta vazia, molde `propostaItensIguais.api.test.js`): cada corpo da tabela da Fase 0
  nas três portas → status + mensagem literal + a resposta chega; o banco lido por fora prova que nada mudou (itens, título, revisão,
  número, `proposta_revisoes`, `proposta_edicoes_log`, variáveis manuais, contagem de propostas). Os dois casos da C310 (tamanho igual e
  diferente do gravado). Controle: `itens: null` apaga (o de sempre); `{}` passa. Puros no mesmo arquivo. Controles positivos: tirar a
  guarda de cada porta; trocar a ordem (guarda depois do `DELETE`).
- [x] **T2 — `a0e5fc6c` — galho (só consome `parearItens`).** `diffItensParaLog` por `parearItens` (RN-143.04). Casos puros novos em
  `server/tests/propostaDiffItens.test.js` (está na revisão obrigatória) e um cenário pela rota no arquivo da T1 (o `GET .../edicoes-log`
  depois de tirar o primeiro de dois). Os 10 casos antigos continuam com a mesma expectativa. Controle: voltar ao agrupamento por posição.
- [x] **T3 — `a0e5fc6c` — galho.** O `JOIN` de um produto por item no `/premium` e no `/pdf` (RN-143.05, C311). Cenário pela rota no arquivo da T1
  (`/premium`: o item sai uma vez; o manual mantém o texto; o `/pdf` pelo retrato que ele grava em `propostas.html_rendered`, como na 142 —
  se o Puppeteer não subir, régua de fonte declarada). Consulta **A92** no banco local. Controle: voltar ao `JOIN` antigo.
- [x] **T4 — `a0e5fc6c` — integração (cruza as três).** No mesmo arquivo: proposta criada pelo `POST` (recusa e depois aceita) → `PUT` inválido (400,
  nada muda) → `PUT` válido tirando o primeiro de dois (log só "removido") → `/premium` com o produto de código repetido (uma vez, valor
  certo). Entra pela rota; o pela-função é o puro da T1/T2.

Todas as tasks tocam o `index.js` ou o `propostaItensDiff.js` e o teste da rota é um arquivo só → executadas **em sequência**, por mim (o
"um teste por vez" e o tamanho; declarado na retro).

## Decisões (vão para a letra B)

- **B929** — recusar (400) o item que não é objeto, nas três portas — *escolhido*. Descartado: ignorar o elemento nulo (o `POST` já fazia
  isso calado: a proposta nascia sem o item que o cliente achava que mandou; um cliente com defeito seria escondido). Reversível: a guarda é
  uma função.
- **B930** — `itens` presente que não é lista nem `null` também recusa (a M-4 da 142 fecha junto) — *escolhido*. `itens: null` **mantém**
  "apaga todos" (contrato escrito na 138; nenhuma tela manda, mas é API documentada). Descartado: recusar também o `null` (quebraria o
  contrato sem quem pedisse).
- **B931** — no histórico por id, o item novo da mesma identidade de um que saiu conta "adicionado" + "removido", não "editado" — é o
  que aconteceu com as variáveis dele (aposentadas). Descartado: casar pela identidade só para o log (o log diria uma coisa e o banco
  outra — *vale para as variáveis; os campos preservados (descrição da tabela, tag, acessórios) a mesclagem copia do que saiu, Fase 2 M-8*).
- **B933** — a descrição entra na comparação do histórico (Fase 2 I-4): item com código cuja descrição muda passa a registrar "editado:
  Descrição" também (antes: nada, porque a chave era o código). Descartado: comparar a descrição só no item manual (regra diferente por tipo
  de item, sem ganho).
- **B932** — o `JOIN` escolhe um produto: o de código igual, senão o aparado de menor id; item sem código não junta. Descartado: aparar o
  código no cadastro (muda dado gravado e a regra de unicidade — fica como C312, aberta) e `GROUP BY pi.id` (escolha arbitrária do SQLite).
- **B934** (Fase 5) — a guarda olha também os **campos** do item: fora `acessorios` (lista de propósito), campo objeto ou lista recusa com
  *"Item inválido: cada item da proposta deve ser um objeto."*. Descartado: blindar cada conta que lê o campo (`compararItens`, `normaliza`,
  `nomeDe`) — deixaria gravar *"[object Object]"*.
- **B935** — a próxima etapa (144), abaixo.

## Execução

- **Linha de base** (a árvore da main `8b63bf94`, antes de qualquer código — a rodada começou antes das primeiras edições e terminou com
  elas no disco; verde dos dois jeitos): `test:api` **461/461**; `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite`
  verdes (16/0); client **141** suítes / **1819** testes; `CI=true build` *Compiled successfully*; revisão obrigatória **23/23** + editor
  **39/39**.
- **T1–T4 num commit só — `a0e5fc6c`.** Divergência do plano: o plano previa um commit por task; as quatro dividem o mesmo arquivo de teste
  da rota (16 cenários) e o `propostaItensDiff.js`, e um commit da T1 sem os cenários da T2/T3 teria a suíte vermelha — um commit, com o
  porquê de cada RN no corpo. Outra divergência: a subconsulta `ORDER BY ... LIMIT 1` no `ON` (a primeira versão da T3) não roda no SQLite
  (*no such column: pi.codigo_produto* — o `ORDER BY` da subconsulta não lê a coluna de fora); virou `NOT EXISTS` de um produto melhor.
  Controles **K1–K11** (tirar cada uma das três guardas, aceitar lista, não recusar não-lista, parear sem ids, sem a descrição, o `JOIN`
  antigo, sem a guarda do código em branco, sem preferir o igual, o `ITENS_SQL` antigo) — **todos caíram pela asserção certa**; a K9 (sem a
  guarda do código em branco) sobreviveu na primeira rodada (o item manual tem código `NULL`, e `TRIM(NULL)` já não casa) e ganhou o
  cenário do item com código **só de espaços**, que a API grava — aí caiu.
- **Suíte antes de `a0e5fc6c`:** `test:api` **462/462**; `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` verdes
  (16/0); client **141** / **1819**; build *Compiled successfully*; revisão obrigatória **23/23** + o teste novo da rota (16/0) + editor
  **39/39**.
- **Consulta A92** no banco local (cópia de 09/10): **nenhuma** linha na 1, **0** na 2 e na 3. Controle numa cópia com `A`, `A `, `'  '`
  e quatro itens: a 1 achou os dois grupos, a 2 contou 2 itens em 2 propostas, a 3 contou 1.

## Fase 5 — três revisores frescos em paralelo, sob a trava

- **Regra (r1): 0 Critical; 1 Important anterior; 2 Minor desta; 1 Minor anterior.** **I-1** (anterior, a mesma classe da C310, não
  fechada): item **objeto** com um **campo** objeto/lista (`descricao: {a:1}`, `unidade: {}`, `codigo_produto: ['x']`), corpo do tamanho do
  gravado → o `PUT` nunca respondia (o `.trim` do `compararItens` no callback do banco) — reproduzido também no `8b63bf94` → **B934**: a
  guarda olha os campos. **M-1** (anterior) o mesmo campo, de outro tamanho, gravava *"[object Object]"* com 200 (também a quantidade) →
  fechado pela B934. **M-2** (desta) o corpo com `nome` e sem `descricao` (o `INSERT` grava `descricao = nome`) registrava "Descrição: X →
  —" (e, de antes, "Unidade: UN → —") em todo salvamento → o histórico compara o valor que o `INSERT` **grava** (`descricao || nome`,
  `quantidade || 1`, `unidade || 'UN'`). **M-3** (desta) o `/premium` ficou mais lento com cadastro grande (20 000 produtos, 50 itens: ~78
  → ~130 ms; o HTML idêntico) → declarado, D (143). **Verificado e correto, executado:** `id`/`acessorios`/`tag` estranhos e `__proto__`
  passam sem perder item; 5 000 itens em 620 ms; 17 casos do histórico (sem ids, por id, reordenar, ids em texto, caixa baixa antiga, acento);
  três salvamentos com o corpo de `montarPayloadProposta` sobre uma proposta da geração automática não registram edição falsa; o `JOIN` numa
  grade de códigos (`PJ1`, `'PJ1 '`, `' PJ1'`, `pj2`, brancos, tab): um produto por item, nenhum item some.
- **Autorização (r2): 0 Critical, 0 Important, 1 Minor desta, 2 anteriores.** **M** (desta) descrição `{"toString":1}` → `normaliza`
  lançava no `diffItensParaLog` (no `uncaughtException`) e o histórico do salvamento se perdia (a resposta chegava) → fechado pela B934 (não
  chega mais lá). Anteriores: o campo objeto que trava (= r1 I-1); quem edita a proposta de outro (= **C305**, P.O.). **Observação, não
  achado:** o 500 do `/pdf` devolve o stack ao cliente — **lido:** só fora de `NODE_ENV=production` (de propósito, `index.js` ~10136).
  **Verificado e correto, executado:** 50 001 itens com `null` no fim, aninhamento de 100 000 níveis, texto de 10 MB, `{"__proto__":[]}` →
  400 sem gravar; 401 sem login nas três portas; usuário sem perfil recebe o mesmo 400; o fragmento SQL é constante (sem injeção); 200 itens
  contra 20 200 produtos com variantes → 200 linhas; falha injetada nas consultas novas do `/premium`, do `/pdf` e do `POST /aprovacoes` →
  500/503 que chegam, nenhuma aprovação criada; o total do pedido = a soma dos itens; `PUT /api/aprovacoes/:id` e `casaComAprovacao` não
  leem o total.
- **Sabotagem (r3, worktree própria `CRM-wt-e143-r3`): 59 sabotagens — 45 caíram, 8 sobreviventes reais, 6 equivalentes (provadas); 0
  defeitos.** As 8 viraram cenários: **S08/S10** a ordem do `POST` (margem → itens → motivo); **S12/S13** a da geração automática
  (*"Cliente e produtos..."* → itens → margem); **Q2/Q3** o item sem nenhum produto de código igual (`' PJ143'`): o aparado de **menor** id,
  uma vez, e o total do pedido sem dobro (a Q3 era a própria C311 de volta, invisível); **D8** o espaço nas pontas da descrição do **corpo**;
  **Q13** o produto inativo de código igual vence (a M-10 não tinha asserção). Equivalentes provadas: `tem('itens')` × `corpo.itens != null`
  (34 corpos JSON), `instanceof Object` (16 valores), sem o `COALESCE` e a guarda do branco do lado do produto (grade de códigos), `GROUP BY`
  no `ITENS_SQL`, a `chave` do editado e a guarda de lista em `novos` (inalcançáveis). Sem requisito, não fixada: a **ordem** dos removidos
  dentro de um salvamento (D2).
- **Controles da Fase 5, rodados por mim:** **F1** a guarda sem olhar os campos (o `PUT` voltou a não responder), **F2** o histórico pelo
  valor cru, **F3** sem `acessorios` como exceção; e as 8 sobreviventes do r3 reaplicadas (as âncoras dele) — **todas caíram pela asserção
  certa**, md5 restaurado.
- **Fase 5 — `995693d6`.** O teste da rota passou de 16 para **21** cenários; o puro do histórico de 17 para **19**.
- **Suíte antes de `995693d6`:** `test:api` **462/462**; `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` verdes (16/0); client **141**
  suítes / **1819** testes; `CI=true build` *Compiled successfully*; revisão obrigatória da proposta **23/23** + o teste novo da rota
  (**21/0**) + editor **39/39**. É também a verificação do fechamento (depois dela só mudaram documentos).

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** (a Fase 5). Testes antigos mudados: **0** (os 10 casos do `propostaDiffItens` continuam com a
   mesma expectativa).
2. **Achados da revisão:** Fase 2 — **1 Critical + 4 Important + 7 Minor, todos reais** (o Critical: a terceira consulta do `JOIN`, a do
   pedido de aprovação). Fase 5 — r1 **2 Minor** desta + **1 Important** e **1 Minor** anteriores (fechados pela B934); r2 **1 Minor** desta
   + **2** anteriores (um = o do r1, o outro a C305); r3 **0** defeitos + **8** sobreviventes reais (viraram cenários) + **6** equivalentes;
   **0** ruído (a observação do stack do `/pdf` é de propósito fora de produção — lida, não contada). **Uma afirmação da etapa estava
   errada:** o commit `a0e5fc6c` e a armadilha 20 diziam "a resposta chega" — valia só para o item que não é objeto; a B934 a fez valer.
3. **Paralelismo:** **0** galhos em paralelo de fato (T2 e T3 eram galhos, feitas em sequência — o "um teste por vez" e o arquivo de teste
   único); **0** retrabalho; **1** revisor na Fase 2, **3** em paralelo na Fase 5 sob a trava (o r3 numa worktree própria, removida).
4. **Defeito que escapou:** *(preencher na Etapa 144)*.

## Próxima tarefa detalhada — Etapa 144

*(A série desta etapa foi B929–B935, C311–C313, A92 — a 144 começa em **B936**, **C314**, **A93**; confira com `grep -oE` antes.)*

**Escolhida: a C313 (das propostas) — a geração automática com produto que não existe cria proposta vazia.** Lido na Fase 2 da 143 e
reproduzido pelo r1 (antes da B934, com `{id:{a:1}}`): `POST /api/propostas/gerar-automatica` com `produtos: [{ "id": 99999 }]` responde 200
e cria a proposta sem item nenhum e valor 0; com um produto achado e outro não, cria só com o achado, calada. **Onde:** `index.js`, a rota
`gerar-automatica` (`buscarProdutos`: o `SELECT ... WHERE id IN (...)` e o `forEach` que só empurra o achado). **Desenho reversível
sugerido:** depois do `buscarProdutos`, se algum `id` pedido não foi achado, **400** antes de gerar número e de criar (literal a fixar no
plano, ex.: *"Produto não encontrado: <ids>. Atualize a lista de produtos e tente de novo."*); decidir e registrar em B se o produto
**inativo** conta como achado (hoje conta — o `SELECT` não filtra `ativo`) e se o `id` repetido é um item por vez (hoje é). **Pontos de
atenção:** a tela (`GerarPropostaModal`) mostra o erro no toast (`err.response.data.error`); a ordem das recusas da rota está escrita na
RN-143.03 e presa no `propostaItemInvalido.api.test.js` (*"Cliente e produtos são obrigatórios"* → item → margem → a nova); prove pela rota
(o `index.js` real em pasta vazia — o molde é esse mesmo arquivo) que nenhuma proposta nasce. **Se couber:** a **D (142)** do preview numa
aba velha (`PUT .../variaveis-manuais` com `item_id` que não é mais da proposta responde `{ok:true}` sem gravar) — medir se a tela pode
avisar (ex.: 409 com os itens ignorados) sem quebrar o editor; e a **D2** do r3 (a ordem dos removidos no histórico), se alguém achar que
importa.

**Dependem do P.O. — NÃO implemente:** **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**,
**C219**, **C230**, o reparo da **C246** (e a **C247**), a tabela de conversões e o grupo acima de família, a **régua do tempo de
recebimento (E2)**, a **C268**, a **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens
de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**,
**B101**/G30, **G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62; nas propostas, a verificação do dono da proposta
(Fase 12 de `specs/proposta-editavel/tasks.md`; também a **C305**), o filtro por permissão do histórico (`auditoria.md`), a **B910**, a
**C307**, a Frente B da lentidão das propostas (`specs/lentidao-api-propostas/...`, marcada "não executar"), a **C297** (**B924**), a
pergunta da **B926** e agora a **C312** (aparar ou corrigir os códigos de produto com espaço — muda códigos gravados). Pendem de Postgres:
**C98**, **C110**.

**O que já está pronto e não precisa reabrir:** `validarItensDoCorpo`/`MSG_ITENS_LISTA`/`MSG_ITEM_INVALIDO` (`server/propostaItensDiff.js`)
— a guarda das três portas, com a dos campos (B934); `diffItensParaLog` por `parearItens`, com o valor gravado; `JOIN_PRODUTO_DO_ITEM`
(`server/totalDocumentoProposta.js`) — o produto do item no `/premium`, no `/pdf` e no `ITENS_SQL`; o teste da rota
`tests/api/propostaItemInvalido.api.test.js` (21 cenários, o pedido de aprovação e o `/pdf` pelo retrato que ele grava).
