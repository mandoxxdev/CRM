# Etapa 144 (propostas): o produto que não existe na geração automática e o preview numa aba velha (C313, D (142)) — plano

> Origem: "Próxima tarefa detalhada — Etapa 144" do plano da 143
> (`docs/superpowers/plans/2026-10-18-almoxarifado-etapa143-item-invalido-na-proposta.md`). O design, com a Fase 0 medida, está neste
> plano (seção "Fase 0 — medido"): a etapa é pequena e o design não justifica um documento à parte.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-18): última B **B935**, último C
> **C313**, última A **A92**. Esta etapa: **B936+**, **C314+**, **A93+**. Worktree `CRM-wt-e144`, branch `etapa-e144` (da main `de7ef101`).
>
> **Trava de máquina:** `scratchpad/e144-lock.sh` (o diretório `maquina-testes.lock` de sempre). Um arquivo de teste de servidor por vez,
> inclusive os revisores. Revisão obrigatória da proposta: `scratchpad/e144/review-proposta.sh` (23 + editor 39; o teste novo da rota entra
> na lista "pela rota" da revisão — os 23 continuam 23). A etapa **não** toca o template; toca o `index.js` (a rota
> `POST /api/propostas/gerar-automatica`, o `PUT /api/propostas/:id/variaveis-manuais` e o `PUT /api/propostas/:id/itens/descricoes`),
> `server/propostaItensDiff.js` (funções puras novas) e, no client, o `salvar()` do `proposta/PropostaPreviewEditavel.js`.
>
> **Fase 2 (um revisor fresco, só leitura): 1 Critical, 4 Important, 6 Minor — todos aceitos antes do código, com o que mudou:**
> **C-1** o `GerarPropostaModal` **não é usado por tela nenhuma** — o botão "Proposta automática" saiu da listagem em `7a8c7242`
> (29/07/2026) e o import foi junto; o botão "gerar proposta automática" do `components/PropostaForm.js` legado chama o `POST /api/propostas`.
> A rota da geração automática só é alcançada **pela API**. *A Fase 0 deste plano dizia "a tela lista só ativos… o erro aparece no toast" —
> **estava errado** (descrevia código que não roda); e o "ponto de atenção" da próxima tarefa no plano da 143 ("a tela mostra o erro no
> toast") **também estava errado**.* → o teste do modal saiu da T3 (provaria código morto) e virou **C316**; o roteiro de teste é por curl.
> **I-1** o preview manda **todos** os campos do documento (os vazios e os não tocados), então numa aba velha o número de ignorados é o de
> campos do documento, não o do que o vendedor editou ("15 valores" por ter mexido em um) → o aviso da tela **não diz número**; o `ignorados`
> do contrato continua sendo a contagem. **I-2** o `itens/descricoes` gravava pelo `UPDATE ... WHERE id = ?` cru (`"5.0"` casa o 5 pela
> afinidade, `true` vira 1) → passa a ler os ids da proposta e usar `idInteiro`, como o `variaveis-manuais`; `"5.0"` e `true` deixam de
> gravar (B942). **I-3** o `IN (?, ?, …)` estoura em 32 766 ids (*too many SQL variables* → 500) e o `express.json` aceita 15 MB → a busca
> passa a ser `IN (SELECT value FROM json_each(?))`, com os ids sem repetição — sem limite de variáveis; cenário com 40 000 ids. **I-4** a
> fiação do `salvar()` sem teste → régua pelo fonte com controle (o molde do `PropostaPreviewEditavel.fotosUrl.test.js`). **M-1** o `id`
> objeto/lista já cai antes, no *"Item inválido"* da 143 (dito na RN-144.01). **M-2** `idInteiro` não limita tamanho (`1e21` → `"1e+21"`,
> `"9007199254740993"` arredonda) → `idsDosProdutos` exige `Number.isSafeInteger`. **M-3** o formato da mensagem com 10, 11, repetido e
> `"007"` → casos no puro. **M-4** com `cliente_id: "abc"` e produto sem id saía *"Cliente inválido"*, agora sai o do produto (declarado na
> RN-144.03). **M-5** a `backend.md` diz *"resposta `{ ok: true }` igual"* → corrigir no fechamento. **M-6** na aba velha o *Emitir revisão*
> é barrado mesmo quando só a cláusula mudou (o segundo clique emite) → dito na B940. **Verificado e correto pelo revisor:** a Fase 0 do
> servidor; a ordem da RN-144.03; nenhum teste existente compara `{ ok: true }` exato nessas rotas nem espera 200 com produto inexistente;
> o documento sempre usa `pi.id`; o preview recém-aberto tem `ignorados` 0 (o aviso não sai a cada salvamento); os chamadores do `salvar()`
> (o `emitirRevisao` usa o retorno; os dois botões de salvar o ignoram).

## Fase 0 — medido (sonda pela rota, `index.js` real em pasta vazia, antes de qualquer código)

Sonda `server/tests/sonda/e144.js` (não versionada). Produtos `SA144` (a), `SB144` (b) e `SI144` (inativado pelo `DELETE /api/produtos/:id`,
que só faz `ativo = 0` — **o cadastro não apaga produto**). `POST /api/propostas/gerar-automatica` com `cliente_id` válido e `produtos` = …:

| `produtos` | Hoje (medido) |
|---|---|
| `[{id: 99999}]` | **200**, proposta criada **sem item**, valor 0 |
| `[{id: a}, {id: 99999}]` | **200**, proposta só com `SA144` (o inexistente some calado) |
| `[{}]`, `[{id: null}]`, `[{id: true}]`, `[{id: 1.5}]`, `[{id: -1}]`, `[{id: 0}]`, `[{id: "abc"}]` | **200**, proposta **sem item**, valor 0 |
| `[{id: "<a>"}]` (o id do produto **existente**, em texto) e `[{id: " <a> "}]` | **200**, proposta **sem item** — o `SELECT ... IN (?)` acha o produto (afinidade de tipo do SQLite), mas o `find(p => p.id === produtoReq.id)` compara número com texto e descarta. **Pior do que a C313 dizia:** não é só o produto que não existe |
| `[{id: inativo}]` | **200**, o item entra (o `SELECT` não filtra `ativo`) |
| `[{id: a}, {id: a}]` | **200**, **dois** itens `SA144` |
| `[{id: a, quantidade: "abc"}]` | **200**, item com quantidade `"abc"`, valor do item 0 e **valor da proposta nulo** |
| `[{id: a, quantidade: -3}]` | **200**, item com quantidade −3 e valor −30 |
| `[{id: a, quantidade: 0}]` | **200**, quantidade 1 (o `|| 1`) |
| `cliente_id: 99999` | **500** *"Erro ao gerar número da proposta: Número não gerado"*; nada criado (o `POST /api/propostas`: **500** *"Não foi possível gerar o número da proposta"*) |

*Esta frase dizia "a tela (`GerarPropostaModal`) lista só produtos ativos… o erro aparece no toast" — **estava errado** (Fase 2 C-1):*
**nenhuma tela chama a geração automática** desde `7a8c7242` (o botão saiu da listagem; o `GerarPropostaModal` ficou sem quem o
importe). A rota só é alcançada **pela API** (integração, script). O cadastro não apaga produto (só inativa), então o produto que não existe
só vem de um id digitado ou de outro banco.

**O preview numa aba velha (D (142))** — `PUT /api/propostas/:id/variaveis-manuais` com `[{item_id: 999999, ...}, {item_id: <do item>, ...}]`
→ **200** `{ok:true}`; grava só a do item da proposta. Só com o alheio → **200** `{ok:true}`, nada gravado. Lido no código: o `PUT
/api/propostas/:id` **apaga e reinsere** os itens (ids novos a cada salvamento do formulário), e o preview manda `item_id` de **todas** as
variáveis do documento — o preview aberto antes de um salvamento noutra aba manda só ids vencidos: **nada** é gravado, a tela diz
*"Alterações salvas."* e o `carregarPreview()` seguinte mostra os campos como estavam (o vendedor acha que salvou). O
`PUT .../itens/descricoes` tem o mesmo silêncio (o `UPDATE ... WHERE id = ? AND proposta_id = ?` com id vencido não casa nada; `{ok:true}`).

## Regras de negócio

- **RN-144.01 — a geração automática recusa o produto sem id que vale.** `produtos` com elemento (objeto) cujo `id` não é inteiro
  positivo **seguro** (até 9 007 199 254 740 991 — Fase 2 M-2) — número inteiro, ou texto só de dígitos (aparado) — → **400** *"Produto inválido: cada produto da proposta deve trazer o id de um
  produto cadastrado."* Nenhuma proposta nasce. O id em texto de dígitos (`"5"`, `" 5 "`) **vale** como o número (antes: descartado calado,
  proposta vazia — B938). O `id` objeto ou lista cai antes, no *"Item inválido"* da 143 (B934; Fase 2 M-1).
- **RN-144.02 — a geração automática recusa o produto que não existe.** Depois de buscar os produtos, se algum id pedido não foi achado →
  **400** *"Produto não encontrado (id 99999). Atualize a lista de produtos e tente de novo."* — os ids não achados, sem repetição, na ordem do
  pedido, separados por `", "`; com mais de 10, os 10 primeiros e *" e mais N"* (ex.: `(id 1, 2, …, 10 e mais 5)`). Antes de gerar o número e
  de criar: **nenhuma proposta nasce**. A busca é uma consulta só, `IN (SELECT value FROM json_each(?))` com os ids sem repetição — sem o
  limite de 32 766 variáveis do `IN (?, …)` (Fase 2 I-3). Produto **inativo** conta como achado (o de sempre — B936). O mesmo id repetido é um item por vez (o
  de sempre — B937).
- **RN-144.03 — a ordem das recusas da geração automática** (a da RN-143.03, estendida): *"Cliente e produtos são obrigatórios"* → item
  que não é objeto (`MSG_ITEM_INVALIDO`) → margem inválida → 403 do desconto acima de 5 % fora do rascunho → **produto sem id que vale
  (RN-144.01)** → **produto não encontrado (RN-144.02)** → *"Cliente inválido"* → *"Responsável inválido"* → *"Usuário inválido"* → 500 do
  número. As duas novas ficam **depois** da margem para não mexer na ordem que a 143 prendeu. Muda uma ordem antiga (Fase 2 M-4):
  com `cliente_id: "abc"` e produto sem id (ou que não existe), antes saía *"Cliente inválido"* (era checado depois da busca); agora sai a do produto.
- **RN-144.04 — o preview diz quando um valor não foi gravado.** `PUT /api/propostas/:id/variaveis-manuais` e `PUT
  /api/propostas/:id/itens/descricoes` respondem `{ ok: true, ignorados: N }` — `N` = entradas com `item_id` presente (e `chave`, nas
  variáveis) que **não** foram gravadas porque o `item_id` não é inteiro de um item **desta** proposta (vale entrada de valor vazio — o
  preview manda todos os campos). No `variaveis-manuais` o que é gravado não muda (a regra da 142). No `itens/descricoes` passa a valer a
  mesma régua (`idInteiro` + os ids da proposta lidos antes): `"5.0"` e `true`, que o `UPDATE` cru casava pela afinidade, deixam de gravar
  (B942, Fase 2 I-2). O status continua **200** (B939): o salvamento do preview faz quatro chamadas em sequência
  (cláusulas, variáveis, descrições, customizações) e um 409 no meio deixaria as seguintes sem gravar.
- **RN-144.05 — a tela avisa.** No `salvar()` do preview, se a soma dos `ignorados` das duas respostas for > 0, em vez de *"Alterações
  salvas."* sai o aviso (`toast.warning`) *"Alguns campos dos itens não foram gravados: os itens desta proposta mudaram depois que o
  preview abriu (ela foi salva em outra aba ou por outra pessoa). O preview foi recarregado — confira e preencha de novo."* — **sem número**
  (Fase 2 I-1: o número seria o de campos do documento, não o do que o vendedor editou); o preview recarrega (o de sempre) e o `salvar()` devolve `false` — o **Emitir revisão** que pediu para salvar antes **não**
  emite em cima do valor perdido (o mesmo tratamento da falha). Resposta sem `ignorados` (servidor antigo) = 0.

## Contratos de API (congelados)

| Rota | Mudança | Status | Mensagem literal / corpo |
|---|---|---|---|
| `POST /api/propostas/gerar-automatica` | produto com `id` que não é inteiro positivo | 400 | `Produto inválido: cada produto da proposta deve trazer o id de um produto cadastrado.` |
| `POST /api/propostas/gerar-automatica` | id não achado no cadastro | 400 | `Produto não encontrado (id <ids>). Atualize a lista de produtos e tente de novo.` |
| `POST /api/propostas/gerar-automatica` | sucesso | 200 | sem mudança (`{ id, numero_proposta, valor_total, itens }`) |
| `PUT /api/propostas/:id/variaveis-manuais` | sucesso | 200 | `{ ok: true, ignorados: <n> }` (antes `{ ok: true }`) |
| `PUT /api/propostas/:id/itens/descricoes` | sucesso | 200 | `{ ok: true, ignorados: <n> }` (antes `{ ok: true }`) |

Funções puras novas em `server/propostaItensDiff.js` (reusam `idInteiro`): `idsDosProdutos(produtos)` → `{ ids }` (strings de inteiro,
na ordem) ou `{ erro: MSG_PRODUTO_SEM_ID }`; `msgProdutoNaoEncontrado(idsFaltando)`; constante `MSG_PRODUTO_SEM_ID` exportada. Id `0`
(e negativo) não vale: `idInteiro(0)` devolve `"0"` → a nova função exige `> 0`. No client, `client/src/components/proposta/avisoValoresIgnorados.js`
(`somarIgnorados(...respostas)` e `avisoValoresIgnorados(n)` → `null` ou o texto).

## Tasks (sort topológico)

- [x] **T1 — tronco — `19878ec2`.** `idsDosProdutos`/`msgProdutoNaoEncontrado` + a rota (RN-144.01/02/03): a busca pelo id normalizado, o `find` pelo
  id normalizado (o texto de dígitos casa), as duas recusas antes de gerar número. Teste da rota novo
  `server/tests/api/propostaProdutoInexistente.api.test.js` (pasta vazia, molde `propostaItemInvalido.api.test.js`): cada corpo da tabela
  da Fase 0 → status + mensagem literal + a contagem de propostas igual (banco lido por fora); o id em texto vira item; o inativo e o
  repetido passam como antes; a ordem inteira das recusas (RN-144.03), com a da 143 na frente. Puros no mesmo arquivo. Controles
  positivos: tirar cada recusa; aceitar id 0; voltar o `find` estrito; recusar depois do `INSERT`.
- [x] **T2 — `19878ec2` (Fase 5: `2d7fc95e`) — galho (servidor, só consome `idInteiro`).** `ignorados` nas duas rotas do preview (RN-144.04). Cenários pela rota no mesmo
  arquivo: aba velha (ids vencidos depois de um `PUT` da proposta) → `ignorados` = o número de entradas, nada gravado; a do item da proposta
  grava e não conta; `item_id` em texto de dígitos de um item da proposta grava e não conta. Controle: contar errado (0 fixo).
- [x] **T3 — `19878ec2` (Fase 5: `2d7fc95e`, o `desfechoDoSalvar`) — galho (client, contra o contrato).** `avisoValoresIgnorados` + o `salvar()` (RN-144.05). Teste jest puro do texto (0 → `null`,
  1 e 3 o mesmo texto), da soma, e a régua da fiação do `salvar()` pelo fonte, com controle que acusa o `salvar()` antigo. *(Previa também
  um teste do `GerarPropostaModal` — **saiu** na Fase 2, C-1: o modal não é usado.)*
- [x] **T4 — `19878ec2` — integração (cruza T1 e T2).** No arquivo da T1: proposta gerada pela geração automática (com id em texto) → o `PUT` da
  proposta pelo formulário (ids novos) → o preview velho grava variáveis e descrições com os ids de antes → `ignorados` > 0 e nada gravado;
  com os ids novos → `ignorados` 0 e gravado. Entra pela rota; o pela-função é o puro da T1.

T1 e T2 dividem o `index.js` e o arquivo de teste da rota → executadas **em sequência**, por mim; a T3 é do client e independente.

## Decisões (vão para a letra B)

- **B936** — produto **inativo** conta como achado na geração automática (o de sempre). Descartado: recusar o inativo — a tela só lista
  ativos, então a recusa só pegaria o modal aberto antes da inativação; mas o item manual e o `JOIN` do documento aceitam produto inativo
  (M-10 da 143), e recusar só aqui faria uma regra diferente por porta sem o P.O. pedir. Reversível: uma condição no `SELECT`.
- **B937** — o mesmo id repetido continua virando um item por ocorrência (o de sempre; a tela não deixa repetir — o clique desmarca).
  Descartado: juntar somando a quantidade (mudaria o que a API grava sem pedido).
- **B938** — o id em texto de dígitos vale (`"5"` = 5). Descartado: recusá-lo como "não encontrado" (o produto existe; a recusa diria uma
  mentira) e recusá-lo como "sem id" (a API inteira aceita id em texto — `idInteiro`, Etapa 142).
- **B939** — o preview velho continua **200** com `ignorados`, não **409**. Descartado: 409 — o `salvar()` faz quatro chamadas em sequência
  e o 409 da segunda deixaria descrições e customizações sem gravar (quebra o editor); campo novo na resposta de sucesso não quebra quem
  não o lê.
- **B940** — com valor ignorado, o `salvar()` devolve `false` (o *Emitir revisão* não emite). Descartado: emitir mesmo assim (a revisão
  sairia sem o valor que o vendedor achou que salvou). Consequência (Fase 2 M-6): na aba velha o *Emitir revisão* é barrado mesmo quando o
  vendedor só mexeu numa cláusula (que foi gravada); o segundo clique, com o preview recarregado, emite.
- **B941** — a D2 do r3 da 143 (a ordem dos removidos dentro de um salvamento) **não** é fixada: o histórico lê `ORDER BY created_at DESC`
  sem desempate, então a ordem de linhas do mesmo segundo já não é definida pela leitura; fixar a escrita não mudaria o que a tela mostra.
  Descartado: desempatar a leitura por `id` (muda a ordem de todo o histórico sem pedido). Fica D (144).
- **B942** — o `itens/descricoes` passa a gravar só pelo id inteiro de item da proposta (a régua do `variaveis-manuais`, Fase 2 I-2):
  `"5.0"` e `true` deixam de casar. Descartado: contar pelo `this.changes` do `UPDATE` cru (o texto com casa decimal e o booleano
  continuariam gravando por acaso, e a régua das duas rotas do mesmo salvamento seria diferente).
- **B943** — a próxima etapa (145), abaixo.

## Avisos novos (C)

- **C314** — a quantidade da geração automática não tem régua pela API: `"abc"` grava o texto e deixa o **valor da proposta nulo**; `-3` grava
  total negativo. A tela prende em ≥ 1. Não fechado aqui (o `POST`/`PUT` de `/api/propostas` também não têm régua de quantidade — a régua
  certa é uma só para as três portas; declarado).
- **C316** — a geração automática não tem tela desde `7a8c7242` (29/07/2026, o botão "Proposta automática" saiu da listagem de propostas);
  o `GerarPropostaModal` continua no código, sem quem o importe. Se o botão voltar, o 400 desta etapa sai no toast (o modal lê
  `err.response.data.error`, lido no código — não testado). Apagar a rota e o modal, ou religar o botão, é decisão do dono (fica para vocês).
- **C315** — o cliente que não existe na geração automática (e no `POST /api/propostas`) responde **500** com a mensagem do número
  (*"Erro ao gerar número da proposta: Número não gerado"*), não um 400 que diga o que houve. Nada é criado. A tela só lista clientes ativos.

## Execução

- **Linha de base** (a árvore da main `de7ef101`, antes de qualquer código): `test:api` **462/462**; `test:almoxarifado` **44/0**;
  `test:validation`/`safealter`/`sqlite` verdes (16/0); client **141** suítes / **1819** testes; `CI=true build` *Compiled successfully*;
  revisão obrigatória **23/23** + o teste da rota da 143 (21/0) + editor **39/39**.
- **T1–T4 num commit só — `19878ec2`.** Divergência do plano: o plano previa um commit por task; T1, T2 e T4 dividem o `index.js` e o arquivo
  de teste da rota, e a T3 (client) consome o campo novo da T2 — um commit, com o porquê de cada RN no corpo. Outra divergência (Fase 2): o
  teste do `GerarPropostaModal` previsto na T3 **saiu** (o modal não é usado — C316); a régua da fiação do `salvar()` entrou no lugar.
  Controles **K1–K12** (servidor: tirar cada recusa — a K1 caiu por *timeout*, o que levou à **K1b**, que cai pela mensagem —, o `find`
  estrito, aceitar id 0, sem `isSafeInteger`, `ignorados` 0 nas duas rotas, as descrições sem conferir a proposta, a mensagem com 9, o
  `IN (?, …)` de antes (cai no cenário de 40 000 ids), contar a entrada sem chave, o id que não vale virar id cru, a recusa do id antes da
  margem) e **J1–J5** (client: devolver `true`, somar só uma resposta, o sucesso sempre, o texto, a soma aceitar negativo) — **todos caíram
  pela asserção certa**, md5 restaurado.
- **Suíte antes de `19878ec2`:** `test:api` **463/463**; `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` verdes
  (16/0); client **142** / **1823**; build *Compiled successfully*; revisão obrigatória **23/23** + as rotas (21/0 da 143, **10/0** desta)
  + editor **39/39**.
- **Consulta A:** nenhuma nova. A proposta vazia que a C313 criava não é distinguível de um rascunho sem itens feito à mão (a geração
  automática não grava a origem), e a rota não tem tela desde julho (C316) — uma consulta "propostas sem item e valor 0" listaria rascunhos
  legítimos. Declarado, não inventado.

## Fase 5 — três revisores frescos em paralelo, sob a trava

- **Regra (r1): 0 Critical, 0 Important, 0 Minor.** Executou contra a `de7ef101` e a `19878ec2` o mesmo roteiro: o caso válido (ordem,
  quantidade, `numero_item`, total, a linha inteira da proposta) **idêntico** nas duas; a ordem completa das recusas (inclusive
  `responsavel_id: "abc"`, `cliente_id: 99999` → 500, a C315); as recusas não consomem número de proposta (003, 004, 8 recusas, 005);
  ids de 2^53 − 1 por número e por texto no `json_each`; o `ignorados` em proposta que não existe, entrada repetida, valor vazio; o reparo
  das variáveis da 142 roda antes e a entrada velha conta 1; o preview normal (ids do `/premium?embed=1`) dá `ignorados` 0; o servidor
  antigo (sem o campo) continua *"Alterações salvas."*. Anteriores, sem ação: a resposta da geração ecoa `quantidade` em texto (C314).
- **Autorização (r2): 0 Critical, 0 Important desta; 1 Minor tocado (anterior); 2 anteriores.** **M** o `itens/descricoes` gravava por
  `stmt.run` sem callback: com `SQLITE_BUSY` a exceção saía solta e a resposta **nunca chegava** (40 s de espera; o `variaveis-manuais`, no
  mesmo cenário, 500 em 1,7 s) — anterior (o mesmo padrão na `de7ef101`), mas a etapa reescreveu o trecho → **corrigido**: os `UPDATE` em
  sequência pelo `executarEmSequencia`, 500 que chega; cenário com a falha injetada. **Anteriores:** as rotas de `/api/propostas` não
  exigem o módulo (usuário sem grupo nem módulo gera proposta e grava no preview da proposta de outro) → **C317**; a geração automática
  responde 200 antes de gravar os itens (`stmt.finalize()` sem callback; com 100 000 itens a resposta sai com 5 gravados) → **C318**.
  **Verificado e correto, executado:** 401 sem login nas três rotas; a mensagem "não encontrado" não revela nada que o `GET /api/produtos`
  já não mostre a qualquer logado; o `ignorados` não é oráculo (1 para item de outra proposta, item que não existe e proposta que não
  existe); 1 milhão de `{id: 9}` → 400 em 164 ms; 600 mil ids → 400 em 337 ms; texto de 1 MB, `1e308`, injeção no id → *"Produto
  inválido"*; `__proto__` sem poluição; 100 mil entradas nas duas rotas do preview; falha injetada nas consultas novas → 500 sem gravar.
- **Sabotagem (r3, worktree própria `CRM-wt-e144-r3`): 29 sabotagens — 12 caíram, 9 sobreviventes reais nomeadas (o relatório somava 12), 5 equivalentes (provadas); 0
  defeitos.** Servidor (4): **s11** a entrada de texto vazio nas descrições sem asserção; **s13** `"5.0"`/`true` nas descrições (a B942) sem
  cenário; **s10** gravar pelo id cru — o SQLite não converte `' 5'` e o `trim` do JS sim: perda calada; **s20** 11 ids. Client (5,
  a régua do `salvar()` por trechos soltos): **c1** um `toast.success` a mais, **c2** o `return` num ramo morto, **c3** a soma anulada,
  **c5** uma resposta anulada antes da soma, **c6** `return true` no `try` → o desfecho virou função pura (`desfechoDoSalvar`, testada por
  valor) e a régua prende o fim do `try` como bloco contíguo, um toast e um `return` só. Equivalentes provadas: sem a dedupe, `faltando`
  com repetição, `json_each` sem `Number`, o id em texto no `UPDATE`, o "não encontrado" depois de montar os itens (locais, descartados),
  o "Produto inválido" dentro do `then`, `Number.isFinite`/`parseInt` na soma.
- **Controles da Fase 5, rodados por mim:** **F1** as descrições pelo `stmt` de antes (o cenário da falha cai: 200 em vez de 500); **S10,
  S11, S13, S20** reaplicadas com as âncoras novas; no client **c1, c2, c3, c5, c6** no fonte de verdade e **J6/J7** no desfecho — **todos
  caíram pela asserção certa**, md5 restaurado.
- **Fase 5 — `2d7fc95e`.** O teste da rota passou de 10 para **11** cenários; o do client de 4 para **10**.
- **Suíte antes de `2d7fc95e`:** `test:api` **463/463**; `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` verdes (16/0); client **142**
  suítes / **1829** testes; `CI=true build` *Compiled successfully*; revisão obrigatória da proposta **23/23** + as rotas (21/0 da 143,
  **11/0** desta) + editor **39/39**. É também a verificação do fechamento (depois dela só mudaram documentos).

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** (a Fase 5). Testes antigos mudados: **0**.
2. **Achados da revisão:** Fase 2 — **1 Critical + 4 Important + 6 Minor, todos reais** (o Critical: a tela da geração automática não
   existe desde julho — o plano, e o da 143, diziam o contrário). Fase 5 — r1 **0**; r2 **1 Minor** tocado pela etapa (anterior, corrigido)
   + **2** anteriores (C317, C318); r3 **0** defeitos + **9** sobreviventes reais nomeadas (o relatório somava 12) (viraram cenários e a régua nova) + **5** equivalentes;
   **0** ruído.
3. **Paralelismo:** **0** galhos em paralelo de fato (T2 e T3 eram galhos, feitas em sequência — o "um teste por vez" e o tamanho); **0**
   retrabalho; **1** revisor na Fase 2, **3** em paralelo na Fase 5 sob a trava (o r3 numa worktree própria, removida).
4. **Defeito que escapou:** *(preencher na Etapa 145)*.

## Próxima tarefa detalhada — Etapa 145

*(A série desta etapa foi B936–B943, C314–C318, nenhuma A — a 145 começa em **B944**, **C319**, **A93**; confira com `grep -oE` antes.)*

**Escolhida: a C317 (das propostas) — as rotas de `/api/propostas` não exigem o módulo.** Reproduzido pelo r2 da Fase 5 desta etapa: um
usuário `role: 'usuario'` sem grupo nem permissão de módulo gera proposta (`POST /api/propostas/gerar-automatica` → 200) e grava no preview
da proposta de outro (`PUT .../itens/descricoes`, `PUT .../variaveis-manuais` → 200). **Onde:** todo `app.*('/api/propostas...` do
`index.js` só tem `authenticateToken`; `checkModulePermission` existe (`index.js` ~2996) e só **uma** rota do comercial o usa
(`/api/comercial/ordens-servico`, `checkModulePermission('comercial')`). **Fase 0 obrigatória (medir antes de prometer):** qual o nome do
módulo que a tela usa para abrir Propostas (o `ModuleRoute`/menu do client) e como `portoesDeModulo` decide (admin, grupos, o fallback);
quantas rotas são; quem as chama além da tela (o preview, o PDF, a aprovação, a integração); e uma consulta **A93** para rodar em produção
**antes do deploy**: os usuários ativos que criaram/editaram proposta nos últimos 90 dias e **não** têm o módulo — eles perderiam o acesso.
**Desenho reversível sugerido:** `checkModulePermission('<o módulo da tela>')` nas rotas de proposta, num `app.use` do prefixo **só se**
`req.user` não for reatribuído depois (a armadilha da Etapa 25 — cada rota redeclara o `authenticateToken`; prove pela rota, com um
cenário que entra pelo `index.js` real); a recusa com a mensagem do módulo que já existe. **Não é a C305** (quem pode editar a proposta
de outro — a verificação do dono, P.O.): esta é só a camada de módulo. **Se couber:** a **C318** (a geração automática responder depois de
gravar os itens: esperar o `finalize`, e com erro 500 sem deixar a proposta pela metade) e a **C315** (o cliente que não existe → 400 com
frase, nas duas portas).

**Dependem do P.O. — NÃO implemente:** **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**,
**C219**, **C230**, o reparo da **C246** (e a **C247**), a tabela de conversões e o grupo acima de família, a **régua do tempo de
recebimento (E2)**, a **C268**, a **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens
de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**,
**B101**/G30, **G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62; nas propostas, a verificação do dono da proposta
(Fase 12 de `specs/proposta-editavel/tasks.md`; também a **C305**), o filtro por permissão do histórico (`auditoria.md`), a **B910**, a
**C307**, a Frente B da lentidão das propostas (`specs/lentidao-api-propostas/...`, marcada "não executar"), a **C297** (**B924**), a
pergunta da **B926**, a **C312** (aparar ou corrigir os códigos de produto com espaço) e agora a **C316** (religar ou apagar a geração
automática sem tela) e a régua de quantidade da **C314** (se quantidade negativa é desconto ou erro). Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** `idsDosProdutos`/`msgProdutoNaoEncontrado`/`MSG_PRODUTO_SEM_ID`
(`server/propostaItensDiff.js`) e as duas recusas da geração automática, com a busca por `json_each`; o `ignorados` das duas rotas do
preview, com a régua `idInteiro` + os ids da proposta nas duas; `desfechoDoSalvar` (`client/src/components/proposta/avisoValoresIgnorados.js`)
e a fiação do `salvar()`; o teste da rota `tests/api/propostaProdutoInexistente.api.test.js` (11 cenários, um com a falha injetada).
