# Etapa 142 (propostas): a identidade do item no salvamento — itens iguais, variáveis manuais e campos preservados (C298, C308, C309) — plano

> Origem: "Próxima tarefa detalhada — Etapa 142" do plano da 141. Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-18-almoxarifado-etapa142-itens-iguais-na-proposta-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-18): última B **B917**, último C
> **C307**, última A **A90**. Esta etapa: **B918+**, **C308+**, **A91+**. Worktree `CRM-wt-e142`, branch `etapa-e142` (da main `93c6dddb`).
>
> **Trava de máquina:** `scratchpad/e142-lock.sh` (o diretório `maquina-testes.lock` de sempre). Um arquivo de teste de servidor por vez,
> inclusive os revisores. Revisão obrigatória da proposta: `scratchpad/e142/review-proposta.sh` (22 + editor; passa a 23 com o teste novo).
> A etapa **não** toca o template; toca o `index.js` (o `PUT /api/propostas/:id`, o `PUT .../variaveis-manuais`, o `/premium`, o `/pdf`, a
> criação da tabela das variáveis manuais), `server/propostaItensDiff.js`, um módulo novo `server/variaveisManuaisItens.js`, o
> `payloadProposta.js` e o carregamento do `proposta/PropostaForm.js`.
>
> **Fase 2 (um revisor fresco, só leitura): 1 Critical, 4 Important, 7 Minor — todos aceitos antes de qualquer código de produção, com o que
> mudou:** **C1** a Fase 0 estava errada — o estado `itens` do `proposta/PropostaForm.js` **não** guarda o `id` (o carregamento monta o item
> campo a campo, linhas 232-260; eu tinha lido o `components/PropostaForm.js`, código morto) → a T3 põe o `id` no carregamento **e** ganha um
> teste que monta o formulário (o do `payloadProposta` sozinho seria vazio para o gesto real). **I1** o reparo "só item sem linha viva"
> mandava a órfã que sobrou para o produto incluído depois, e o editor do preview regravava o que o reparo mostrou deixando a órfã viva →
> **o reparo é materializado nas gravações** (RN-142.11 e RN-142.12): o `PUT` da proposta grava o `item_id` das órfãs que o reparo põe num
> item atual e aposenta as que não cabem; o `PUT .../variaveis-manuais` grava o reparo antes do upsert/delete (some também o valor
> "zumbi" que voltava depois de apagado no preview). **I2** o upsert do preview numa aba velha apagava o `item_chave` e criava órfã sem
> identidade → linha de item que não é da proposta é ignorada, e o `item_chave` do conflito usa `COALESCE` (RN-142.12). **I3** o `id` exigindo
> a mesma identidade perdia o item **manual** cuja descrição foi editada → sem código dos dois lados, o `id` vale com a descrição mudada; a
> troca de produto na mesma linha é "saiu + novo" em qualquer tamanho de proposta (RN-142.02, RN-142.06). **I4** linha de base:
> `node tests/acessoriosItem.test.js` dá **63/64** já na main (fora de qualquer `npm run`, sem relação com a mesclagem) — registrado em
> "Execução". Minors: `itens: null` e `id` ausente/nulo nunca pareiam (M1); tirar todos os itens aposenta todas as variáveis (M2 — sai da
> RN-142.06 nos dois modos); o item novo não herda do que acabou de sair (M3); a contagem que não bate fica declarada (M4); o `ALTER` não
> depende do caminho do `item_chave` e as leituras usam `SELECT *` (M5 — sem a falha da primeira subida); `item_chave` comparado em caixa
> alta (M6); a revisão obrigatória ganha o teste novo (M7).

## Regras de negócio

"Identidade" de um item = `chaveDe` (código do produto, senão descrição, senão nome) sem espaços nas pontas, em caixa alta
(`identidadeDe`). "Atuais" = os itens gravados antes do salvamento (`SELECT * ... ORDER BY id`). "Corpo" = `itens` do `PUT` (`null` ou
não-lista = `[]`). "Viva" = linha de `proposta_variaveis_manuais` com `item_removido_em` nulo. "Órfã" = viva cujo `item_id` não é de item atual.

- **RN-142.01 — o formulário manda o `id` do item gravado.** O carregamento do `proposta/PropostaForm.js` guarda o `id` de cada item;
  `montarPayloadProposta` o manda (`id: número`) quando existe; o item incluído na tela vai sem a chave. Editar a linha (`updateItem`) mantém o
  `id`.
- **RN-142.02 — o pareamento por id.** Um `id` do corpo **vale** quando: não é nulo e é inteiro (número, ou texto só de dígitos); é o de um
  atual ainda não usado por um item anterior do corpo; e o atual tem a **mesma identidade** — ou nenhum dos dois tem código de produto (item
  manual com a descrição editada, Fase 2 I3). Com pelo menos um `id` que vale, o salvamento é **por id**: item com `id` que vale fica pareado
  com aquele atual; os outros itens do corpo não têm par; o atual que ninguém reclamou **saiu**. Cenário (C298): atuais `[P id1, P id2]`, corpo
  `[{P, id: id2}]` → pareado `id2`, saiu `id1`. Produto trocado na mesma linha (`{Q, id: id1}` com id1 = P): o `id` não vale — id1 saiu, Q é
  novo.
- **RN-142.03 — sem `id` que vale, por posição.** O k-ésimo item de identidade P do corpo fica com o k-ésimo atual de identidade P (ordem de
  id); saíram os atuais de cada identidade que sobraram (os últimos). Os cenários da C296 (Etapa 138, `putParcialMantem` RN-03b) não mudam.
- **RN-142.04 — a mesclagem preserva do par (C308).** Item **pareado** recebe os `CAMPOS_PRESERVAR` (só os que vieram nulos ou `''`) do
  **seu** atual. Item **sem par** recebe os do último atual da mesma identidade, **mesmo que tenha saído** (o de antes da etapa — B920).
  *(**Esta RN dizia "que não saiu" (Fase 2 M3) — estava errada** (Fase 5, r1 I-1): o produto tirado e incluído de novo no mesmo salvamento
  perdia a descrição da tabela, o descritivo e o prazo, que antes da etapa voltavam.)* Cenário: atuais `[P tag X 'linha 1', P tag Y
  'linha 2']`, corpo `[P, P]` sem ids → `X/linha 1`, `Y/linha 2` (antes `Y/linha 2` nos dois). Por id, `[{P id1}, {P novo}]` com id2
  saindo → o novo herda do id2 (o último).
- **RN-142.05 — a religação pelo par.** Linha nova `i` (ordem de id) = item `i` do corpo. Pareado com atual `v` → as variáveis vivas de `v`
  passam para a linha nova. Cenário (C298): TAG-B (de id2) vai para o item que ficou; a TAG-A não. **Se o número de linhas novas ≠ o de itens
  do corpo** (falha de `INSERT`), nada é religado nem aposentado. Um passo que falha no banco não leva os seguintes junto
  (`executarEmSequencia` segue e devolve o primeiro erro — Fase 5, r2 M1): ficam órfãs e o reparo da leitura (e a próxima gravação, RN-142.11) as
  trata — no modo por id a C298 pode voltar nesse caso (declarado, D (142); Fase 2 M4).
- **RN-142.06 — a variável do atual que saiu é aposentada.** Nos dois modos, as variáveis vivas dos atuais que saíram ganham
  `item_removido_em = datetime('now')`; nada é apagado. Tirar **todos** os itens (`itens: []`) aposenta todas (Fase 2 M2). No modo por
  posição "o que saiu" é o último da identidade (o servidor não sabe qual foi — a C298 continua para quem salva sem ids: a TAG-B fica
  aposentada em vez de órfã; D (142)).
- **RN-142.07 — o reparo da leitura (C309 e o resto da C298).** `repararVariaveisManuais(linhas, itens)` (do `/premium` e do `/pdf`): linha
  de item atual → como está; aposentada → como está (não renderiza); órfã sem `item_chave` → como está; órfã com `item_chave` → agrupada
  pelo `item_id` velho; para cada identidade (`item_chave` em caixa alta), os grupos em ordem crescente de id velho vão, um a um, para os
  itens atuais dessa identidade **sem nenhuma linha viva**, na ordem de `itens`; o que sobra fica órfão. Todas as variáveis de um item velho
  vão para o mesmo item (C309); nenhum item recebe linha se já tem alguma. Cenários: dois órfãos de um item (`tag`, `serie`) e dois P → os dois
  no primeiro P; todas órfãs (a religação nunca aconteceu), `5→10`, `6→11`; TAG-A aposentada e TAG-B viva no P que ficou → só TAG-B.
- **RN-142.08 — a coluna nova.** `proposta_variaveis_manuais.item_removido_em TEXT` (nula), por `ALTER` no callback do `CREATE`, **independente**
  do caminho do `item_chave`. Banco novo e antigo (sem a coluna, com linhas) sobem com ela e as linhas intactas. As leituras usam `SELECT *`
  (sem falha se uma leitura correr antes do `ALTER` na primeira subida).
- **RN-142.09 — `id` que não vale é ignorado.** Inexistente, de item de outra proposta, repetido no corpo (só o primeiro vale), de outra
  identidade (com código), `null`, `undefined`, texto não numérico, fração → sem par pelo `id`, sem 400, sem mensagem. Nenhum vale → RN-142.03.
- **RN-142.10 — a variável manual do que saiu não volta** (B926). Tirar o primeiro de dois P (por id), salvar; depois incluir outro P e
  salvar: o P novo abre sem a TAG-A (no banco e no `/premium`). Tirar todos e incluir P de novo: também sem. *(Isto **inverte** o que a
  correção de 30/07/2026 — `9aae799d`, a criação do `item_chave` — prometia: "readicionar o produto traz o texto de volta". A Fase 5 (r1
  I-1) pegou que o plano não dizia; a decisão e o descartado estão na B926. Os campos preservados do item — RN-142.04 — continuam voltando.)*
- **RN-142.11 — a gravação da proposta grava o reparo antes de parear (Fase 2 I1).** No `PUT /api/propostas/:id` com `itens`, antes da
  religação: o reparo da RN-142.07 contra os **atuais** é gravado (`UPDATE ... SET item_id` por linha) e as órfãs vivas que ele não pôs em
  ninguém são aposentadas. A partir daí elas andam com o par (RN-142.05/06). Cenário (o legado da C298 de antes da 142): `(id3, tag, A)` viva
  e `(id2, tag, B)` órfã; incluir outro P e salvar → B aposentada, o P novo abre sem TAG.
- **RN-142.12 — a gravação do preview grava o reparo antes (Fase 2 I1, I2).** `PUT /api/propostas/:id/variaveis-manuais`: antes do upsert e
  da remoção, o reparo contra os itens atuais é gravado **e a órfã que não cabe é aposentada** *(esta RN dizia "nada é aposentado aqui" —
  **estava errado** (Fase 5, r3 Z1): apagar no preview a variável do item fazia a órfã do item que saiu cair nele na leitura seguinte)*;
  valor de `item_id` que não é **inteiro** (Fase 5, r2 M2: `[5]` passava pelo `String`) ou não é item atual da proposta é **ignorado** (nem
  grava, nem remove — a aba velha); no conflito, `item_chave = COALESCE(excluded.item_chave,
  item_chave)` e `item_removido_em = NULL`. Resposta igual (`{ ok: true }`). Cenários: apagar no preview um valor que veio do reparo apaga de
  verdade (antes voltava); salvar o preview com o `item_id` de um item que saiu não cria linha nem apaga o `item_chave`.

## Contratos (congelados)

| Rota / função | Antes | Agora |
|---|---|---|
| `PUT /api/propostas/:id` | `itens[]` sem `id` (ignorado se viesse) | `itens[].id` opcional; resposta, códigos e mensagens **iguais** (nenhuma recusa nova) |
| `PUT /api/propostas/:id/variaveis-manuais` | grava qualquer `item_id` | ignora `item_id` que não é item da proposta; resposta igual `{ ok: true }`; o 400 de sempre |
| `GET /api/propostas/:id/premium`, `GET /api/propostas/:id/pdf` | `SELECT item_id, chave, valor, item_chave` | `SELECT *`; o reparo da RN-142.07; resposta igual |
| `propostaItensDiff.identidadeDe(item)` (nova) | — | `chaveDe(item).toUpperCase()` |
| `propostaItensDiff.parearItens(atuais, corpo)` (nova, pura) | — | `{ porId, pares: Array<atual \| null> /* por índice do corpo */, sairam: atual[] }` |
| `propostaItensDiff.mesclarItensPreservandoCampos(atuais, corpo)` | `Map` por `chaveDe` (o último vence) | pelo `parearItens` (RN-142.04); mesma assinatura e retorno |
| `variaveisManuaisItens.planoReligacao(atuais, corpo, idsNovos)` (puro) | — | `{ mover: [[idVelho, idNovo]], aposentar: [idVelho] }`; contagem ≠ → `{ mover: [], aposentar: [] }` |
| `variaveisManuaisItens.repararVariaveisManuais(linhas, itens)` (puro) | no `index.js`, por linha | movida para o módulo; RN-142.07; não escreve |
| `variaveisManuaisItens.planoMaterializacao(linhas, itens)` (puro) | — | `{ mover: [[idDaLinha, itemId]], aposentar: [idDaLinha] }` (RN-142.11; a 12 usa só o `mover`) |

Mensagens: nenhuma nova. A assinatura das rotas não muda.

## Tasks

- [x] (`f4a8f4b8`) **T1 (tronco) — as funções puras: RN-142.02/03/04/05/06/07/09 e o plano da 11.** Teste novo `server/tests/propostaItensIguais.test.js`
  (node puro; entra na revisão obrigatória, "Rápidos", com a contagem em `review-proposta.md`). Os dois testes de cópia
  (`variaveisManuaisReligar`, `variaveisManuaisIdentidade`) passam a importar as funções reais, com os cenários da C298 e da C309. Controles:
  `Map` de volta na mesclagem; posição por linha no reparo; reparo sem a regra "sem linha viva"; aposentada como candidata; `id` repetido
  aceito duas vezes; identidade com caixa; `id` exigindo identidade no item manual; o novo herdando do que saiu.
- [x] (`5dbaf584`) **T2 (tronco, depois da T1) — a fiação no `index.js`: RN-142.05/06/08/10/11/12.** Teste novo `server/tests/api/propostaItensIguais.api.test.js`
  (molde `putParcialMantem`: `index.js` real em pasta vazia, banco lido por fora): **pela rota** — o C298 inteiro (criar com P, P → TAG-A/TAG-B
  pelo `PUT .../variaveis-manuais` → `PUT` com `[{P, id: id2}]` → banco: TAG-B no item novo, TAG-A aposentada → `/premium` com TAG-B e sem
  TAG-A); a C308 (dois P com `descricao_tabela` diferentes → `PUT` sem ids → cada um com a sua); RN-142.10 (dois jeitos); RN-142.09 (id de
  outra proposta, texto, repetido → posição); RN-142.11 (o legado gravado pelo banco); RN-142.12 (apagar o reparado; aba velha); a C296 sem
  ids; **banco antigo** (segunda subida sobre um arquivo com a tabela sem a coluna e uma linha → a coluna existe e a linha intacta). **Pelo
  serviço** — cada cenário confere as funções da T1 contra as linhas lidas do banco. Controles: não aposentar; não materializar no `PUT`;
  não materializar no preview; aceitar `item_id` alheio no preview; religar por posição com ids; tirar o `ALTER`.
- [x] (`60acc6af`) **T3 (galho, contrato congelado) — o client: RN-142.01.** O carregamento do `proposta/PropostaForm.js` guarda o `id`;
  `payloadProposta.js` o manda. `payloadProposta.test.js` ganha o caso; teste novo que **monta o formulário** (molde
  `PropostaForm.statusDescontoAprovado.test.js`: GET com dois itens do mesmo produto → tira o primeiro → salvar → o corpo do `PUT` traz
  `[{..., id: <id do segundo>}]`). Controles: tirar o `id` do carregamento; tirar do payload.
- [x] (números em "Execução") **T4 — suíte completa e a revisão obrigatória (23 + editor)** antes de cada commit de código.

**Pontos de atenção:** a religação roda depois do `finalize` dos `INSERT` (o comentário "ORDEM IMPORTA" do `PUT`); a materialização (11)
roda **antes** do `DELETE` dos itens (os atuais ainda existem) — mas depois das recusas (nada muda num `PUT` recusado). O `UPDATE OR REPLACE`
fica (destino recém-criado nunca tem linha). O `/premium` e o `/pdf` têm cada um o seu `SELECT`. A revisão obrigatória chama o template
direto: o reparo é provado pela rota no teste novo.

## Execução (2026-10-18)

- **Fase 0** (o design tem a medição; a frase do `id` no estado do formulário **estava errada** — Fase 2 C1): o formulário não mandava o
  `id`; o `PUT` apaga e reinsere (AUTOINCREMENT, ids nunca reaproveitados); a C298 reproduzida pela função copiada; achadas a **C308** (a
  mesclagem copia os campos do último igual para todos) e a **C309** (o reparo divide as variáveis de um item); banco local sem nenhuma
  variável manual; a C297 medida e deixada para o P.O. (B924).
- **Fase 2**: 1 Critical + 4 Important + 7 Minor, todos aceitos antes do código (o cabeçalho tem o que mudou).
- **Suíte de base** (a main `93c6dddb`; a parte final da rodada — jest, build, revisão — já correu com a T1 na árvore, que não toca o client
  nem o template): `test:api` **460/460**; `test:almoxarifado` 44/0; `test:validation`/`safealter`/`sqlite` verdes (16/0 no sqlite); client
  **140**/**1815**; build ok; revisão obrigatória **22/22** + editor **39/39**. Fora de qualquer `npm run`: `node tests/acessoriosItem.test.js`
  **63/64** já na main (Fase 2 I4 — "os dois cálculos de subtotal somam os acessórios: 0 (esperado 2)"; anterior, sem relação com esta etapa;
  segue 63/64 com ela).
- [x] **T1 — `f4a8f4b8`.** O teste novo nasceu vermelho (o módulo não existia). **36** casos. Controles **S1–S11** (o `Map` de volta, posição
  por linha, sem "sem linha viva", aposentada candidata, `id` repetido, identidade com caixa, manual exigindo identidade, herdar do que saiu,
  contagem sem checar, não aposentar, materializar sem aposentar) — todos caíram pela asserção certa. Os dois testes de cópia passaram a
  importar as funções reais (13/13 e 14/14, com a C298 e a C309).
- [x] **T2 — `5dbaf584`.** O teste da rota (**13** cenários, uma segunda subida para o banco antigo) passou de primeira com a T2 → rodado
  contra o `index.js` de antes da T2: **10 de 13 vermelhos** (os 3 verdes: a C296 — de sempre —, a C308 — já fechada pela T1 — e o upsert de
  sempre). Controles **K1–K9** (não aposentar, não materializar no `PUT`, não materializar no preview, aceitar item alheio, religar por posição
  com ids, sem o `ALTER`, a mesclagem pelo último, o `/premium` sem reparo, materializar sem aposentar) — todos caíram. Divergência do
  previsto: o `/pdf` não é aberto pela rota (Puppeteer) — a fiação dele está presa por uma régua de fonte no teste puro.
- [x] **T3 — `60acc6af`.** Teste novo que monta o formulário (2) + 1 caso no `payloadProposta.test.js`. Controles **C1–C3** (sem `id` no
  carregamento, sem `id` no payload, `id: null` sempre) — todos caíram.
- **Suíte antes de `f4a8f4b8`/`5dbaf584`/`60acc6af`** (a árvore com os três): `test:api` **461/461**; `test:almoxarifado` **44/0**;
  `test:validation`/`safealter`/`sqlite` verdes (16/0); client **141** suítes / **1818** testes; `CI=true build` *Compiled successfully*;
  revisão obrigatória da proposta **23/23** + editor **39/39**.

## Fase 5 — três revisores frescos em paralelo, sob a trava

- **Regra (r1): 1 Important + 1 Minor desta etapa, 3 Minor anteriores.** **I-1** (desta) a etapa invertia, sem dizer, a promessa da
  correção de 30/07/2026 (`9aae799d`): "readicionar o produto traz o texto de volta" — e, com a regra "o novo não herda do que saiu" (Fase 2
  M3), o produto tirado e incluído de novo no mesmo salvamento perdia também a descrição da tabela, o descritivo e o prazo (reproduzido,
  `r1-T4`) → **os campos voltam a herdar do último igual, mesmo o que saiu (o de antes — a RN-142.04 estava errada, dito nela)**; a variável
  manual do que saiu **continua não voltando**, agora como decisão escrita (**B926**, com o descartado). **M-1** (desta) a identidade com
  `chaveDe` não aparava o código antes de cair para a descrição (código só de espaços → identidade vazia, o reparo não achava a órfã) →
  `identidadeDe` apara cada parte, como o `item_chave` gravado. Anteriores, declarados em D (142): o formulário com ids vencidos (outra aba
  salvou antes) cai na posição (M-2); o preview numa aba velha responde `{ok:true}` sem gravar (M-3; antes também se perdia); `itens: {}`/`null`
  apaga os itens com 200 (M-4; desde a 138 — agora também aposenta as variáveis). **Verificado e correto, executado:** 3+ iguais tirando o do
  meio e reordenando; item manual repetido; mesmo código com descrições diferentes; o fluxo formulário → preview → salvar no preview → `/pdf`
  → incluir de novo; a C296 (todos os `PUT` responderam, inclusive dois simultâneos); o legado de vários itens velhos (C309).
- **Autorização (r2): 0 Critical, 0 Important, 3 Minor desta etapa.** **M1** um passo de banco que falhava parava a sequência
  (`executarEmSequencia`): falhando o `UPDATE` que move, as aposentadorias não rodavam e a C298 voltava pelo reparo → a sequência segue e
  devolve o primeiro erro (como os statements preparados de antes). **M2** `item_id` em lista (`[5]`) passava pela guarda nova do preview
  (`String([5]) === "5"`) e gravava lixo → só id inteiro (`idInteiro`). **M3** o `PUT` que dá 500 no `DELETE` dos itens já gravou o reparo
  (invisível: grava o que a leitura já mostrava) → D (142). Anterior: `itens: [null]` faz o `PUT` nunca responder, e `[null, P]` apaga os
  itens antes de pendurar (o mesmo na base) → **C310** (nova, anterior). **Verificado e correto, executado:** `id` de outra proposta nos dois
  sentidos não toca a outra (todos os `UPDATE` filtram por `proposta_id`); entradas hostis no `PUT` e no preview (objeto, lista, `NaN`, `1e308`,
  14 MB, 5 000 itens, 40 000 valores) respondem; erro de banco injetado em 8 pontos: toda resposta chega; sem login, 401 nas quatro rotas.
- **Sabotagem (r3, worktree própria `CRM-wt-e142-r3`): 43 sabotagens — 20 caíram, 12 equivalentes (provadas), 11 reais — e 1 defeito no
  código entregue (Z1).** **Z1** (desta; **a RN-142.12 estava errada** em "nada é aposentado aqui"): o legado da C298 (TAG-A viva, TAG-B órfã
  de item que saiu) — apagar a TAG-A no preview fazia a TAG-B aparecer no item → o preview aposenta a órfã que não cabe. As 11 reais viraram
  cenários: **Z2/S35** item manual (identidade pela descrição, reparo pelo `/premium`); **S37/S38** o `/pdf` pela rota (o retrato que ele grava
  tem a TAG-B e não a TAG-A — antes só uma régua de fonte); **S30** a falha injetada no meio da sequência (terceira subida, `FALHA_SQL_INJETADA`);
  **S09** posição com caixa; **S18** ids velhos 99/100; **S05** código apagado com o `id` = produto trocado (**B925**); **S02/S03** `' 2'`,
  `'02'`; **S06** código só de espaços; **S13** `item_removido_em = ''` é viva; **S42** o item do catálogo sem `id` (`produtoParaItem`
  exportada). Observação **não verificada** por execução: o `LEFT JOIN produtos` por código do `/premium`/`/pdf` duplica o item se dois
  produtos tiverem o mesmo código (anterior; o reparo passaria a ver o item duas vezes) — registrado aqui, não em C.
- **Controles da Fase 5, rodados por mim** com a mesma mutação no código corrigido: **F1** o preview sem aposentar, **F2** parar no erro,
  **F3** a guarda por `String`, **F4** a identidade por `chaveDe`, **F5** não herdar do que saiu, **F6** o `/pdf` sem reparo, **F7** o catálogo
  com o `id` do produto — **todos caíram pela asserção certa** (md5 restaurado em todos).
- **Fase 5 — `0ca3c702` (servidor) e `75822180` (client).** O teste da rota passou de 13 para **18** cenários (três subidas — a terceira com
  o `UPDATE` que move as variáveis falhando); o puro de 36 para **42**; o jest do formulário de 2 para 3.
- **Suíte antes de `0ca3c702`/`75822180`** (a árvore com os dois): `test:api` **461/461**; `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` verdes (16/0); client **141**
  suítes / **1819** testes; `CI=true build` *Compiled successfully*; revisão obrigatória da proposta **23/23** + editor **39/39**.
- **Consulta A91** rodada no banco local (cópia de 09/10): **0** linhas; controle positivo numa cópia em memória com dois iguais copiados e
  dois diferentes: achou os dois (1 e 2 combinações) e deixou de fora o repetido sem nada preenchido.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** (a Fase 5). Testes antigos mudados: **2** (`variaveisManuaisReligar`/`Identidade` passaram a
   importar as funções reais — os cenários antigos continuam, com a mesma expectativa; o "readicionar traz de volta" do `Identidade` vale
   para o reparo sozinho, e o comentário diz que pelo `PUT` não vale mais).
2. **Achados da revisão:** Fase 2 — **1 Critical + 4 Important + 7 Minor, todos reais** (o Critical derrubou uma frase da Fase 0). Fase 5 —
   r1 **1 Important + 1 Minor** desta + **3** anteriores (D); r2 **3 Minor** desta + **1** anterior (**C310**); r3 **1 defeito** desta (Z1) +
   **11** sobreviventes reais (viraram cenários) + **12** equivalentes (provados); **0** ruído. **Duas RN do plano estavam erradas** (a 04, por
   uma sugestão aceita da Fase 2 — M3; a 12, "nada é aposentado aqui") e a Fase 0 errou o arquivo do formulário (leu o código morto).
3. **Paralelismo:** **0** galhos em paralelo de fato (a T3 era galho, feita em sequência — o "um teste por vez" e o tamanho); **0**
   retrabalho; **1** revisor na Fase 2, **3** em paralelo na Fase 5 sob a trava (o r3 numa worktree própria, removida).
4. **Defeito que escapou:** **0** (preenchido na Etapa 143: os três revisores da 143 e as 59 sabotagens não acharam defeito no código entregue
   pela 142; o que a 143 achou — o item com campo objeto que trava o `PUT` e o `JOIN` que duplica o item, C311 — é anterior à 142).

## Próxima tarefa detalhada — Etapa 143

*(A série desta etapa foi B918–B928, C308–C310, A91 — a 143 começa em **B929**, **C311**, **A92**; confira com `grep -oE` antes.)*

**Escolhida: a C310 (das propostas) — um item vazio na lista faz o salvamento da proposta nunca responder.** Reproduzida na revisão da
Etapa 142 (r2): pela API, `PUT /api/propostas/:id` com `"itens": [null]` não responde (o mesmo tipo da C296); `[null, {...}]` **apaga os
itens** antes de travar. **Onde (lido, a medir na Fase 0):** o `PUT` de `server/index.js` usa o item sem conferir que é objeto em
`compararItens`/`normalizarItem` (~8391, dentro do `db.all` dos itens atuais — a exceção dentro do callback não chega a resposta nenhuma)
e no `forEach` do `INSERT` (depois do `DELETE`); o `POST /api/propostas` (~8143) e a geração automática provavelmente têm o mesmo. **Desenho
reversível sugerido:** recusar com **400** antes de qualquer gravação o corpo cujo `itens` tem elemento que não é objeto (literal a fixar no
plano, ex.: *"Item inválido: cada item da proposta deve ser um objeto."*), nas três portas; ou ignorar o elemento nulo (decidir e registrar
em B). **Junto, se couber:** a **D (142)** do histórico de itens — `diffItensParaLog` (`server/propostaItensDiff.js`) ainda pareia os iguais
pela posição; passar a usar o `parearItens` (o mesmo da mesclagem e da religação) faria "tirar o primeiro de dois" registrar só "removido".
**Pontos de atenção:** o `PUT` já tem o 409 das gravações cruzadas e a ordem de recusas da `backend.md` (a recusa nova entra antes da
gravação); prove pela rota (o `index.js` real em pasta vazia — molde `tests/api/propostaItensIguais.api.test.js`, que já tem a subida com
falha injetada) que nada é apagado e que a resposta chega; a revisão obrigatória da proposta (**23** + editor) continua critério.

**Dependem do P.O. — NÃO implemente:** **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**,
**C219**, **C230**, o reparo da **C246** (e a **C247**), a tabela de conversões e o grupo acima de família, a **régua do tempo de
recebimento (E2)**, a **C268**, a **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens
de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**,
**B101**/G30, **G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62; nas propostas, a verificação do dono da proposta
(Fase 12 de `specs/proposta-editavel/tasks.md`; também a **C305**), o filtro por permissão do histórico (`auditoria.md`), a **B910**, a
**C307**, a Frente B da lentidão das propostas (`specs/lentidao-api-propostas/...`, marcada "não executar") e agora a **C297** (**B924** —
a classificação de área: obrigatória na tela e em dois lugares do cadastro) e a pergunta da **B926** (se o produto incluído de novo deve
trazer de volta as variáveis manuais do que saiu). Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** `parearItens`/`identidadeDe`/`idInteiro` (`server/propostaItensDiff.js`) — o pareamento
do item gravado, um só para a mesclagem e a religação; `server/variaveisManuaisItens.js` (`planoReligacao`, `repararVariaveisManuais`,
`planoMaterializacao`); `executarEmSequencia`/`materializarVariaveisManuais` no `index.js`; a coluna `item_removido_em`; o molde de teste
`tests/api/propostaItensIguais.api.test.js` (três subidas: pasta vazia, banco antigo, falha injetada; o `/pdf` provado pelo retrato que
ele grava em `propostas.html_rendered`). Observação não verificada da Fase 5 (r3 §4): o `LEFT JOIN produtos` por código do `/premium` e do
`/pdf` duplicaria o item se dois produtos tivessem o mesmo código — vale medir (`SELECT codigo, COUNT(*) FROM produtos GROUP BY 1 HAVING
COUNT(*) > 1`) antes de chamar de defeito.
