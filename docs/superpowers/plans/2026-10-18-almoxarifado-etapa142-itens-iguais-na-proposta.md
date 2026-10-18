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
  **seu** atual. Item **sem par** recebe os do último atual da mesma identidade **que não saiu** (o de hoje, sem o que acabou de sair — B920;
  Fase 2 M3). Cenário: atuais `[P tag X 'linha 1', P tag Y 'linha 2']`, corpo `[P, P]` sem ids → `X/linha 1`, `Y/linha 2` (antes `Y/linha 2`
  nos dois). Por id, `[{P id1}, {P novo}]` com id2 saindo → o novo herda do id1.
- **RN-142.05 — a religação pelo par.** Linha nova `i` (ordem de id) = item `i` do corpo. Pareado com atual `v` → as variáveis vivas de `v`
  passam para a linha nova. Cenário (C298): TAG-B (de id2) vai para o item que ficou; a TAG-A não. **Se o número de linhas novas ≠ o de itens
  do corpo** (falha de `INSERT`), nada é religado nem aposentado: ficam órfãs e o reparo da leitura (e a próxima gravação, RN-142.11) as
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
- **RN-142.10 — o que saiu não volta.** Tirar o primeiro de dois P (por id), salvar; depois incluir outro P e salvar: o P novo abre sem a
  TAG-A (no banco e no `/premium`). Tirar todos e incluir P de novo: também sem.
- **RN-142.11 — a gravação da proposta grava o reparo antes de parear (Fase 2 I1).** No `PUT /api/propostas/:id` com `itens`, antes da
  religação: o reparo da RN-142.07 contra os **atuais** é gravado (`UPDATE ... SET item_id` por linha) e as órfãs vivas que ele não pôs em
  ninguém são aposentadas. A partir daí elas andam com o par (RN-142.05/06). Cenário (o legado da C298 de antes da 142): `(id3, tag, A)` viva
  e `(id2, tag, B)` órfã; incluir outro P e salvar → B aposentada, o P novo abre sem TAG.
- **RN-142.12 — a gravação do preview grava o reparo antes (Fase 2 I1, I2).** `PUT /api/propostas/:id/variaveis-manuais`: antes do upsert e
  da remoção, o reparo contra os itens atuais é gravado (só o `UPDATE item_id`; nada é aposentado aqui); valor de `item_id` que não é item
  atual da proposta é **ignorado** (nem grava, nem remove — a aba velha); no conflito, `item_chave = COALESCE(excluded.item_chave,
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

- [ ] **T1 (tronco) — as funções puras: RN-142.02/03/04/05/06/07/09 e o plano da 11.** Teste novo `server/tests/propostaItensIguais.test.js`
  (node puro; entra na revisão obrigatória, "Rápidos", com a contagem em `review-proposta.md`). Os dois testes de cópia
  (`variaveisManuaisReligar`, `variaveisManuaisIdentidade`) passam a importar as funções reais, com os cenários da C298 e da C309. Controles:
  `Map` de volta na mesclagem; posição por linha no reparo; reparo sem a regra "sem linha viva"; aposentada como candidata; `id` repetido
  aceito duas vezes; identidade com caixa; `id` exigindo identidade no item manual; o novo herdando do que saiu.
- [ ] **T2 (tronco, depois da T1) — a fiação no `index.js`: RN-142.05/06/08/10/11/12.** Teste novo `server/tests/api/propostaItensIguais.api.test.js`
  (molde `putParcialMantem`: `index.js` real em pasta vazia, banco lido por fora): **pela rota** — o C298 inteiro (criar com P, P → TAG-A/TAG-B
  pelo `PUT .../variaveis-manuais` → `PUT` com `[{P, id: id2}]` → banco: TAG-B no item novo, TAG-A aposentada → `/premium` com TAG-B e sem
  TAG-A); a C308 (dois P com `descricao_tabela` diferentes → `PUT` sem ids → cada um com a sua); RN-142.10 (dois jeitos); RN-142.09 (id de
  outra proposta, texto, repetido → posição); RN-142.11 (o legado gravado pelo banco); RN-142.12 (apagar o reparado; aba velha); a C296 sem
  ids; **banco antigo** (segunda subida sobre um arquivo com a tabela sem a coluna e uma linha → a coluna existe e a linha intacta). **Pelo
  serviço** — cada cenário confere as funções da T1 contra as linhas lidas do banco. Controles: não aposentar; não materializar no `PUT`;
  não materializar no preview; aceitar `item_id` alheio no preview; religar por posição com ids; tirar o `ALTER`.
- [ ] **T3 (galho, contrato congelado) — o client: RN-142.01.** O carregamento do `proposta/PropostaForm.js` guarda o `id`;
  `payloadProposta.js` o manda. `payloadProposta.test.js` ganha o caso; teste novo que **monta o formulário** (molde
  `PropostaForm.statusDescontoAprovado.test.js`: GET com dois itens do mesmo produto → tira o primeiro → salvar → o corpo do `PUT` traz
  `[{..., id: <id do segundo>}]`). Controles: tirar o `id` do carregamento; tirar do payload.
- [ ] **T4 — suíte completa e a revisão obrigatória (23 + editor)** antes de cada commit de código.

**Pontos de atenção:** a religação roda depois do `finalize` dos `INSERT` (o comentário "ORDEM IMPORTA" do `PUT`); a materialização (11)
roda **antes** do `DELETE` dos itens (os atuais ainda existem) — mas depois das recusas (nada muda num `PUT` recusado). O `UPDATE OR REPLACE`
fica (destino recém-criado nunca tem linha). O `/premium` e o `/pdf` têm cada um o seu `SELECT`. A revisão obrigatória chama o template
direto: o reparo é provado pela rota no teste novo.

## Execução (2026-10-18)

*(a preencher)*
