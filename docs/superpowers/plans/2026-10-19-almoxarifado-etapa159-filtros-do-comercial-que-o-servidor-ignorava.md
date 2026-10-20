# Etapa 159 (Comercial): os filtros que as telas do Comercial mandam e o servidor ignorava (o padrão do C378), a busca com letra acentuada, e as sobras C381 e C382 — plano

> Origem: "Próxima tarefa detalhada — Etapa 159" do plano da 158
> (`docs/superpowers/plans/2026-10-19-almoxarifado-etapa158-coordenada-guardada-resumo-e-historico-dos-custos.md`). Etapa pequena; o design,
> com a Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-19): última B **B1011**, último C **C383**,
> última A **A103**. Esta etapa: **B1012+**, **C384+**, **A104+**. Worktree `CRM-wt-e159`, branch `etapa-e159` (da main `5ef79ca0`).
>
> **Fase 2 (um revisor fresco, só leitura, ANTES do código): 0 Critical, 7 Important, 10 Minor — todos aceitos; o plano abaixo já está
> corrigido.** **I1** a Fase 0 dizia que o `Produtos.js` era código morto — **estava errado**: `/comercial/produtos/familia/:id` monta
> `ProdutosPorFamilia`, que desenha `<Produtos>` (manda `search` a `GET /api/produtos`) — entra na RN-159.02. **I2** a busca do topo (`GET
> /api/busca-global`, a `BuscaGlobal` do `Layout`) tem o mesmo limite do `LOWER` — entra. **I3** a tela das OS e as sugestões dos custos
> refiltram no navegador sem aparar — a tela também apara. **I4** com o segmento filtrando, a resposta velha da lista de clientes passa a
> aparecer (e a exportar) — a guarda da resposta velha entra em `Clientes.js`. **I5** a busca dos custos: um contador só dentro do
> `loadCustos` (todos os chamadores, inclusive a falha), e o efeito imediato do `cliente_id` não pode disparar ao voltar a digitar. **I6** os
> filtros de distância e valor (no navegador) também não recarregavam — entram no recarregamento com pausa. **I7** as decisões que faltavam em
> B (caixa sem acento; o segmento no JavaScript; os curingas; o texto não texto; a exportação filtrada). **M1** o legado com a primeira letra
> acentuada maiúscula e outra acentuada minúscula (*"Ótica Paixão"*) não é achado pelas três formas — limite declarado (B1013). **M2**
> `segmento[]=x` vira `"x"` pelo `String` — a regra passa a ser *não texto = sem filtro* (como o `search` das propostas já fazia). **M3** a
> releitura sem linha → `{ id }`. **M4** a falha injetada exige um segundo boot. **M5** o `POST /clientes` tem ~30 usos nos testes (todos só
> `.id`/status) e o comentário do `coordenadasPrazo` sobre o eco fica velho. **M6** cinco recarregamentos nas Atividades, não quatro. **M7** o tipo
> só de espaços — aparado antes do padrão. **M8** T1/T2 mexem no mesmo handler (serial). **M9** o 500 das OS inalterado. **M10** a T6 confere o
> `IDA_E_VOLTA` no banco.

## Fase 0 — medido (antes de qualquer código)

Régua: para cada tela do bloco `/comercial` do `App.js`, cada chave que a tela põe na URL (`params`/`URLSearchParams`/query literal) e o
`req.query` da rota que a atende — medido pelo nome do **contrato** (a chave), no componente que a rota do `App.js` monta (não no que se
imagina: `/comercial/propostas` monta `proposta/PropostasList.js`, não `Propostas.js`; `/comercial/produtos` monta `GruposProdutos`, e
`/comercial/produtos/familia/:id` monta `ProdutosPorFamilia`, que desenha o `Produtos.js` — o que manda `search`/`familia` a `/produtos`).
*(Esta frase dizia que o `Produtos.js` não era montado por rota nenhuma — **estava errado** (Fase 2 I1).)*

| Tela (componente montado) | Pedido | Chaves que a tela manda | A rota lê? | Como compara |
|---|---|---|---|---|
| Painel (`Dashboard`) | `GET /dashboard`, `/dashboard/avancado` | `inicio`, `fim`, `usuario` | sim (`filtroDashboardSql`) | data `AAAA-MM-DD`, inteiro — ok |
| Painel | `GET /clientes/logos` | `limit` | sim | ok |
| **Clientes** (`Clientes`) | `GET /clientes` | `search`, **`segmento`** | `search` sim; **`segmento` NÃO** | `search`: `LIKE` sem aparar — **ver C385** |
| Projetos (`Projetos`) | `GET /projetos` | `responsavel_id` | sim | igualdade — ok |
| Propostas (`PropostasList`) | `GET /propostas` | `search`, `status`, `tipo_proposta`, `oportunidade_id`, `responsavel_id`, `incluir_inativas` | todas | `search`: `LOWER(col) LIKE LOWER(?)` — **ver C385** |
| Propostas | `GET /oportunidades` | `status=ativa` | sim | gravado `'ativa'` — ok |
| Aprovações (`Aprovacoes`) | `GET /aprovacoes` | `status`, `tipo`, `proposta_id` | todas | valores da tela = gravados — ok |
| Aprovações | `GET /propostas` | `status=rascunho` | sim | ok |
| OS (`OrdensServicoComercial`) | `GET /comercial/ordens-servico` | `search` | sim | `LIKE` — **ver C385** |
| OS | `GET /propostas` | `status=aprovada` | sim | ok |
| Atividades (`Atividades`) | `GET /atividades` | `todos` **ou** `responsavel_id` | sim | **a tela manda `responsavel_id=todos` num dos quatro recarregamentos — ver C387** |
| Lista de preços (`ListaPrecos`) | `GET /comercial/listas-precos/:id/itens` | `q`, `limit`, `offset` | sim | `busca` (minúsculas) `LIKE` termo minúsculo — ok |
| Máquinas vendidas | `GET /clientes/logos` | `page`, `limit` | sim | ok |
| Produtos (`FamiliasDoGrupo`) | `GET /familias` | `grupo_id` | sim | ok |
| **Custos de viagem** (`CustosViagens`) | `GET /custos-viagens` | `cliente_id`, `proposta_id`, `data_inicio`, `data_fim`, `status_aprovacao`, `tipo_viagem`, **`codigo_visita`** (o texto da busca), `ordenar_por`, `ordem` | todas (o `tipo_viagem` desde a 158) | **a busca de texto — ver C386** |
| Custos de viagem | `GET /clientes` | `search` (as sugestões) | sim | **ver C385** |
| Produtos de uma família (`ProdutosPorFamilia` → `Produtos`) | `GET /produtos` | `search`, `familia`, `ativo` | todas | `search`: `LIKE` sem aparar — **ver C385** (Fase 2 I1) |
| Busca do topo (`BuscaGlobal`, no `Layout`) | `GET /busca-global` | `q` | sim | `LOWER(col) LIKE LOWER(?)` — **ver C385** (Fase 2 I2) |
| Custos de viagem | filtros *Distância* e *Valor* (no navegador) | — | — | **não recarregam a lista — ver C386** (Fase 2 I6) |
| Relatórios, Painel de vendas, Mapa | — | nenhuma chave | — | — |

**Os achados (todos de antes desta etapa, medidos no código; nenhum depende do P.O.):**

- **C384 — o filtro *Segmento* da lista de clientes não filtra nada.** `Clientes.js` manda `segmento` (*"Cosméticos"*) e o `GET /api/clientes`
  só lê `status` e `search`: a lista volta com todos os segmentos. O cadastro grava o segmento em maiúsculas pelo `toUpper` do JavaScript
  (*"COSMÉTICOS"*, com o acento maiúsculo); a comparação tem de saber disso — e o `UPPER`/`LOWER` do SQLite **não** muda letra acentuada
  (medido: `LOWER('SÃO')` = `'sÃo'`).
- **C385 — a busca de texto não acha a letra acentuada digitada em minúscula.** O cadastro grava razão social, nome fantasia, título da
  proposta, nome do produto etc. em maiúsculas (`toUpper`/`normalizarMaiusculas`); o `LIKE` do SQLite ignora a caixa **só das letras sem
  acento** (medido: `'SÃO PAULO' LIKE '%são%'` = 0, `'SÃO PAULO' LIKE '%SÃO%'` = 1). Buscar *"são"*, *"ação"*, *"válvula"* não acha o
  cadastro *"SÃO …"*. Atinge: `GET /api/clientes` (a lista de clientes e as sugestões dos custos de viagem), `GET /api/propostas` (o
  `LOWER(...) LIKE LOWER(?)` tem o mesmo limite), `GET /api/comercial/ordens-servico`, `GET /api/produtos` (os produtos de uma família) e
  `GET /api/busca-global` (a busca do topo — os seis tipos). Clientes, OS e produtos também não aparam o termo no servidor (*"acme "* não acha
  *"ACME"*); a tela das OS e as sugestões dos custos refiltram no navegador **sem aparar** (Fase 2 I3).
- **C386 — a busca de texto dos custos de viagem não recarrega a lista e, quando recarrega, só procura o código.** O campo diz *"Buscar viagem
  por código, cliente ou destino..."*. Digitar não recarrega a lista (o `useEffect` da lista não depende do texto — só as sugestões de cliente
  mudam); a lista só é pedida de novo quando outro filtro muda, e aí o texto vai como `codigo_visita` (`LIKE` só no código): com *"acme"*
  digitado e o status trocado, a lista fica **vazia**. Escolher a sugestão manda `cliente_id` — esse caminho funciona. Os filtros
  *Distância mín/máx* e *Valor mín/máx* (aplicados no navegador, dentro do `loadCustos`) também não recarregam: digitar *"100"* não muda nada
  até outro filtro mudar, e o **Limpar Filtros** com só eles preenchidos não recarrega (Fase 2 I6).
- **C387 — remover o lembrete com o filtro *"Todos"* esvazia a lista das Atividades.** Quatro dos **cinco** recarregamentos montam
  `todos=true` quando o filtro é *"todos"*; o do **Remover lembrete** (`Atividades.js:186`) manda `responsavel_id=todos` — o servidor
  filtra `a.responsavel_id = 'todos'` e a lista volta vazia (atividades e lembretes) até a pessoa trocar o filtro.
- **C381 (de antes, da 158)** — `POST /api/clientes` responde `{ id, ...req.body }`: o corpo inteiro, como veio, com campos não gravados.
  Quem lê a resposta: no `client/src`, só o `ClienteForm` (`response.data.id`); nos testes, ~30 usos, todos só `.id`/status (Fase 2 M5). Os
  outros quatro `POST` com o mesmo eco (`/projetos`, `/propostas`, `/oportunidades`, `/atividades`) ficam como estão (C, de antes).
- **C382 (de antes, da 158), a parte técnica** — `POST` e `PUT /api/custos-viagens` sem `tipo_viagem` gravam `'ida_e_volta'` **em
  minúsculas** (o padrão `|| 'ida_e_volta'` vem depois do `normalizarMaiusculas`); o tipo só de espaços é gravado como veio (Fase 2 M7). A
  tela sempre manda o tipo. O resto da C382 (a origem padrão que a tela põe no custo antigo; o tipo legado em minúsculas que vira maiúsculas
  no histórico) são **gravações de verdade** — o histórico registra o que o banco grava (B1010); mudar isso é regra, **fica**. Também fica
  (de antes, declarado): o `PUT` sem tipo é substituição inteira — troca um `IDA` gravado por `IDA_E_VOLTA`.
- **Observados e fora (C, de antes):** o seletor *Segmento* do formulário do cliente mostra *"Selecione..."* ao editar um cliente com
  segmento (o gravado *"COSMÉTICOS"* não é nenhuma opção da tela) — o valor gravado não se perde ao salvar sem mexer; o filtro *Usuário* do
  painel conta só o responsável da proposta (a lista de propostas conta o responsável **ou** quem criou) — é regra.

## Regras de negócio

- **RN-159.01 (C384)** — `GET /api/clientes?segmento=X` devolve só os clientes cujo segmento, **sem espaço nas pontas e em maiúsculas pelo
  JavaScript** (o mesmo `toUpperCase` do cadastro — *"Cosméticos"* = *"COSMÉTICOS"* = *" cosméticos "*), é igual ao de `X` tratado do
  mesmo jeito; o filtro roda no JavaScript, depois da consulta (o `UPPER` do SQLite não muda o *é*). `X` vazio, só de espaços, ausente **ou
  não texto** (`segmento[]=…` — Fase 2 M2): sem filtro. Cliente sem segmento não entra quando há filtro. Combina com `search` e `status`
  (E). A resposta continua sem `geo_*` (B1008). **A tela** (`Clientes.js`) descarta a resposta de um pedido que não é o último (Fase 2 I4 —
  com o filtro valendo, a resposta velha mostraria e exportaria a lista do segmento anterior).
- **RN-159.02 (C385)** — A busca de texto de `GET /api/clientes` (`search`), `GET /api/propostas` (`search`), `GET
  /api/comercial/ordens-servico` (`search`), `GET /api/produtos` (`search`), `GET /api/busca-global` (`q`) e a `busca` nova dos custos
  (RN-159.03): o termo **não texto** é ignorado (sem filtro — como o `search` das propostas já fazia); o texto é **aparado** (só espaços =
  sem filtro; na busca do topo, menos de 2 letras depois de aparar = `[]`, como a tela); cada coluna procurada casa com o termo **como veio
  (aparado), em maiúsculas e em minúsculas pelo JavaScript** (`COALESCE(col, '') LIKE ?` com as formas distintas) — *"são"*, *"SÃO"* e
  *"São"* acham *"SÃO PAULO"* (o gravado) e *"são paulo"* (o legado em minúsculas). **Limite declarado (Fase 2 M1, B1013):** o legado
  misturado com uma maiúscula acentuada e outra minúscula acentuada (*"Ótica Paixão"*) só é achado pelo termo com a mesma grafia; e
  **acento não é ignorado** (*"sao"* não acha *"SÃO"* — B1013). As colunas procuradas não mudam por rota; `%` e `_` no termo continuam
  curingas do `LIKE` (como hoje). Uma função só, `server/services/buscaSemCaixa.js`: `formasDoTermo(termo)` → as formas distintas, ou `[]`;
  `condicaoDeBusca(colunas, termo)` → `{ sql, params }` (`sql` = `(c1 LIKE ? OR c1 LIKE ? … )`, vazio sem termo). **As telas** das OS e das
  sugestões dos custos aparam o termo no filtro do navegador também (Fase 2 I3).
- **RN-159.03 (C386)** — `GET /api/custos-viagens?busca=X` (parâmetro novo): o custo entra se `X` (RN-159.02) aparece no **código da visita**,
  na **razão social ou no nome fantasia do cliente principal**, na razão social ou no nome fantasia de **um cliente adicional da viagem**
  (`viagem_clientes`), no **destino** ou na **cidade do destino**. Combina com os outros filtros (E). `codigo_visita` continua aceito como
  antes (contrato antigo, nenhum uso da tela). **A tela:** um contador só dentro do `loadCustos` — só a resposta (ou a falha) do último
  pedido mexe na lista, venha de qualquer chamador (Fase 2 I5b); o texto, sem cliente escolhido na sugestão, vai como `busca` (aparado);
  o texto, o cliente escolhido e os quatro filtros de distância/valor recarregam **300 ms depois da última mudança** (um pedido só — voltar
  a digitar depois de escolher a sugestão não dispara pedido imediato; I5a, I6); os outros filtros (datas, status, tipo, ordenação)
  recarregam na hora, como hoje; escolher a sugestão manda `cliente_id` (e não `busca`); **Limpar Filtros** recarrega sem filtro.
- **RN-159.04 (C387)** — Nas Atividades, os cinco recarregamentos da lista (inclusive o do **Remover lembrete**) montam o pedido pela mesma
  função: *"todos"* → `todos=true`; um usuário → `responsavel_id`; vazio → nada.
- **RN-159.05 (C381)** — `POST /api/clientes` responde `200` com **o cliente gravado, lido do banco** (`SELECT * FROM clientes WHERE id = ?`,
  sem `geo_*`) — `id`, a razão social em maiúsculas como ficou, `status` etc.; nenhum campo que não foi gravado. Se a releitura falhar ou
  não achar a linha (o cliente já existe), responde `200 { id }` e o erro vai para o log como
  `Erro ao reler o cliente cadastrado <id>: <mensagem>` — **não** `500` (a tela trataria como falha e a pessoa cadastraria de novo —
  **B1015**). `400 { error: 'Razão social é obrigatória' }` e o `500 { error }` do `INSERT` não mudam.
- **RN-159.06 (C382, a parte técnica)** — `POST` e `PUT /api/custos-viagens` gravam o tipo **aparado**; ausente, nulo, vazio ou só de
  espaços → **`IDA_E_VOLTA`** (antes `'ida_e_volta'` em minúsculas, e o só de espaços como veio). O histórico do `PUT` continua comparando
  como na 158 (o legado `ida_e_volta` editado sem tipo no corpo registra `ida_e_volta → IDA_E_VOLTA` — gravação de verdade, B1010).

## Contratos

- `GET /api/clientes` — mesmo formato (lista sem `geo_*`); `segmento` passa a filtrar (RN-159.01); `search` aparado e com as formas
  (RN-159.02). `403` do portão das listas e `500 { error }` inalterados.
- `GET /api/propostas` — mesmo formato; `search` com as formas (já aparava). `403 { error: 'Apenas administradores podem visualizar
  propostas inativas.' }` inalterado.
- `GET /api/comercial/ordens-servico` — mesmo formato; `search` aparado e com as formas. `500 { error: 'Erro ao verificar banco de dados',
  message }` inalterado (Fase 2 M9).
- `GET /api/produtos` — mesmo formato; `search` aparado e com as formas; `familia` e `ativo` inalterados.
- `GET /api/busca-global` — mesmo formato (até 20, 5 por tipo, o filtro por módulo da 153); `q` aparado e com as formas.
- `GET /api/custos-viagens` — mesmo formato; **`busca`** novo (RN-159.03); os outros inalterados.
- `POST /api/clientes` — `200` com o cliente gravado (antes: `{ id, ...corpo }`); `200 { id }` se a releitura falhar/não achar; `400`/`500`
  iguais.
- `POST`/`PUT /api/custos-viagens` — mesmas respostas; muda só o tipo gravado quando ele não vem (ou vem só de espaços).
- **Nenhuma mensagem nova na tela. Nenhuma rota nova. Nenhuma coluna nova** (nenhuma consulta A). Uma linha de log nova (RN-159.05).

## Tasks (sort topológico)

- [x] **T1 (`531f3576`; o teste em `303841a2`) (tronco — servidor) — RN-159.02.** `server/services/buscaSemCaixa.js` (`formasDoTermo`, `condicaoDeBusca`) e o uso nas cinco
  rotas (as colunas de hoje de cada uma). Teste: arquivo novo `server/tests/api/filtrosDoComercial.api.test.js` (o `index.js` montado numa
  pasta vazia, molde `custosViagensPortao`): clientes pela rota (*"são josé usinagem"* → *"SÃO JOSÉ USINAGEM"*) e um legado em minúsculas
  por fora (*"ação legada"*); `search=são`, `SÃO`, `São`, `" são "` acham o da rota; `ação`/`AÇÃO` acham o legado; `"   "` = a lista inteira
  (contada contra o banco); um termo sem par = 0 (com a metade positiva no mesmo cenário); `search[]=são` = a lista inteira. O mesmo nas
  propostas (título gravado pela rota), nas OS (gravada por fora, `descricao`), nos produtos (gravado pela rota, *"válvula"*) e na busca do
  topo (o cliente e o produto; `q=" s"` → `[]`).
- [x] **T2 (servidor `531f3576`; tela `6bc42a36`) (galho — servidor + tela) — RN-159.01.** `GET /clientes`: o filtro do segmento no JavaScript. Teste no mesmo arquivo: clientes pela
  rota (*"Cosméticos"*, *"Químico"*, sem segmento), um legado *"Cosméticos"* e um *" COSMÉTICOS "* por fora: `segmento=Cosméticos` →
  exatamente os três cosméticos; `QUÍMICO` → o químico; vazio, `%20` e `segmento[]=Cosméticos` → todos; `segmento` + `search` → a
  interseção. Tela: `Clientes.js` com o contador da resposta; teste novo `client/src/components/Clientes.filtroSegmento.test.js` (`api.js`
  real, adaptador falso): o segmento vai no pedido; a resposta lenta do segmento anterior chega depois e não troca a lista.
- [x] **T3 (`68869661`) (galho — servidor + tela) — RN-159.03, e o aparar das sugestões (RN-159.02).** Servidor: `busca` no `GET /custos-viagens`. Teste
  no mesmo arquivo: custos pela rota com cliente principal *"SÃO JOSÉ …"*, outro com o cliente só como adicional, outro com destino
  *"CURITIBA"*, outro só pelo código; cada busca acha o seu e só o seu (contado); `busca` + `status_aprovacao` combina; `codigo_visita`
  continua. Tela: `CustosViagens.js`. Teste novo `client/src/components/CustosViagensBusca.test.js` (molde `CustosViagensEdicao.test.js`):
  digitar *"acme"* → **um** `GET /custos-viagens?…busca=acme` (nenhum `codigo_visita`), só depois da pausa; escolher a sugestão →
  `cliente_id` sem `busca`; voltar a digitar → nenhum pedido antes da pausa, depois um com `busca`; distância máx → recarrega e filtra;
  Limpar → sem filtro; a resposta lenta (e a falha lenta) do pedido anterior não troca a lista; a sugestão com *"acme "* aparado.
- [x] **T4 (`303841a2`) (galho — servidor) — RN-159.05 e RN-159.06.** Teste no mesmo arquivo: o `POST` com `geo_lat`, um campo inventado e a razão em
  minúsculas → a razão em maiúsculas, o `id` do banco, `status: 'ativo'`, sem `geo_lat` nem o campo inventado, e as chaves da resposta = as
  colunas do `PRAGMA` menos `geo_*`; um **segundo boot** com `FALHA_SQL_INJETADA` casando só a releitura → `200 { id }`, o cliente no
  banco, a linha `[falha injetada]` e a `Erro ao reler o cliente cadastrado` no log (Fase 2 M4); o custo sem tipo, com `null` e com `"  "` →
  `IDA_E_VOLTA` no banco (`POST` e `PUT`), `" ida "` → `IDA`; o histórico do `PUT` sobre o legado. O comentário do `coordenadasPrazo` sobre o
  eco atualizado (M5).
- [x] **T5 (Atividades `650b8395`; OS `6bc42a36`) (galho — tela) — RN-159.04 e o aparar das OS (RN-159.02).** `Atividades.js`: `paramsDoFiltro(filtroUsuario)` nos cinco.
  `OrdensServicoComercial.js`: o termo aparado no pedido e no filtro local. Testes novos `client/src/components/Atividades.filtroTodos.test.js`
  (com *"Todos"*, o **Remover lembrete** recarrega com `todos=true` e **sem** `responsavel_id`, e a lista continua com as atividades; com um
  usuário, `responsavel_id`) e `OrdensServicoComercial.busca.test.js` (*" são "* mostra a OS que o servidor devolveu).
- [x] **T6 (`303841a2`, no `filtrosDoComercial`) (integração — cruza T1, T2, T3 e T4) — pelas rotas, no `index.js` montado.** O fluxo de tela: cadastrar o cliente
  (`POST /clientes` com *"são paulo indústria"*, segmento *"Cosméticos"*) → a resposta traz o gravado *"SÃO PAULO INDÚSTRIA"* →
  `GET /clientes?search=são&segmento=Cosméticos` acha → lançar o custo sem tipo com ele (`POST /custos-viagens`) → o banco tem
  `IDA_E_VOLTA` (M10) → `GET /custos-viagens?busca=são paulo` acha o custo e o resumo o conta em `custo_ida_volta`. E o serviço direto:
  `formasDoTermo` (`"são"` → três; `"ABC"` → duas; `"   "` → `[]`; `["a"]` → `[]`; `123` → `[]`). Depois a bateria inteira, serial.

Independência: T1 e T2 mexem no mesmo handler (`GET /clientes`) e T3/T4 nas rotas dos custos e no mesmo arquivo de teste (Fase 2 M8);
T2–T5 dependem da interpretação da T1 (as formas). Tudo executado aqui, em sequência (T1 → T2 → T3 → T4 → T5 → T6) — um executor paralelo
em worktree não se pagaria (um arquivo de teste de servidor compartilhado; a trava de máquina serializa os `test:api`).

## Pontos de atenção

1. A trava de máquina: um `test:api` por vez (diretório `scratchpad/trava-test-api.d`, `mkdir` atômico; quem pegou apaga).
2. O teste novo sobe o `index.js` sem `NOMINATIM_URL` e **nenhuma** chamada a `coordenadas-cliente` — nenhuma consulta externa.
3. Fixture que separa (a lição do R32 da 158): o caso gravado pela rota (maiúsculas) **e** o legado (minúsculas, por fora), contados
  contra o banco — nunca só "a lista não está vazia".
4. `GET /api/clientes` é lido também pelo Almoxarifado e pelo Operacional (sem `segmento`, sem `search`): sem as chaves, a consulta e a
  resposta são as de hoje.
5. **Declarar em B:** B1012 o segmento (no JavaScript; a exportação para Excel sai filtrada); B1013 a busca sem caixa (as formas; acento não
  ignorado — descartada a normalização sem acento; o legado misturado; os curingas; o não texto; o só de espaços); B1014 a busca dos custos
  (as seis colunas, a pausa, os filtros do navegador); B1015 a resposta do cadastro; B1016 o tipo padrão e o resto da C382; B1017 a próxima.

## Execução (o que divergiu do plano)

- **Tudo em sequência, aqui** (como o plano previa): T1 → T2 → T3 → T4 → T5, com a T6 no mesmo arquivo de teste do servidor. **0** retrabalho
  entre tasks. Os testes foram escritos antes do código: o `filtrosDoComercial` **1/9** antes (só a função pura passava — *"\"são\" nao achou
  o gravado SÃO JOSÉ"*, *"segmento Cosméticos"*, *"'resposta gravada 159' !== 'RESPOSTA GRAVADA 159'"*, os quatro tipos), **10/0** depois.
- **Divergências:** (1) o `index.js` mexe nas cinco rotas da busca, no segmento, na busca dos custos, no cadastro e no tipo de uma vez —
  dividido em três commits por assunto pelos trechos do `git diff` (`git apply --cached` de um patch só com os trechos de cada assunto),
  sem estado intermediário rodado (o teste do servidor entra no terceiro); (2) o teste das OS usa o `api` simulado (como o teste das abas),
  não o `api.js` real — a tela não monta a URL à mão; (3) a fixture das Atividades precisava da `prioridade` (o servidor sempre manda) e o
  `useAuth` simulado de uma referência fixa (um objeto novo por chamada recarregava sem parar — o comentário da tela avisa).
- **Controles positivos (todos caíram pela asserção certa, salvo onde dito):** servidor K1 (sem a forma maiúscula) → 6 cenários; K2 (a busca
  do topo sem aparar) → o *"menos de 2 letras = []"*; K3/K4 (sem o filtro do segmento; sem aparar o gravado) → o segmento; K5 (sem o `EXISTS`)
  → *"ônix"*; K6 (o eco de volta) → a resposta e a T6; K7 (500 na releitura) → a releitura; K8/K12 (sem aparar; o padrão minúsculo) → o tipo;
  K9 (propostas sem a razão social) → *"são josé"*; K10 (OS sem busca) → *"manutenção"*; K11 tirava todas as colunas (SQL inválido — caiu pelo
  500), refeito como **K11b** (produtos sem busca) → *"válvula"*. Telas: o contador e o aparar dos clientes; o recarregamento do Remover
  lembrete; o aparar das OS (o pedido e o filtro do navegador); C1–C7 dos custos — **C6 sobreviveu** (o termo *"acme "* casava com *"ACME
  CAMPINAS"* pelo espaço do meio do nome: a asserção não provava o aparar) e o teste passou a usar *"campinas "*, que só casa aparado.

## Fase 5 — revisão adversarial (três revisores frescos, em paralelo, sob a trava)

- **r1 (regra) — 0 Critical, 1 Important, 1 Minor, reproduzidos.** **I1** a pausa de 300 ms guardava os filtros do momento da tecla: digitar
  *"acme"* e trocar o status para *"Aprovado"* dentro da pausa fazia o pedido da pausa (o último, o que vale) sair sem o status — a lista
  mostrava pendentes com *"Aprovado"* escolhido (sonda em jsdom: os pedidos `{status_aprovacao, busca}` e depois `{busca}`); **regressão desta
  etapa**. **M1** o termo decomposto (NFD — *"são"*, de texto colado) não achava o cadastro composto (NFC), nem no segmento. Conferido
  certo: as cinco rotas, o SQL com todos os filtros juntos, o não texto, o `POST /clientes` e o `ClienteForm`, os cinco recarregamentos.
- **r2 (autorização) — 0 achados.** Sonda no `index.js` montado com quatro usuários (Comercial, só Almoxarifado, só Operacional, sem nenhuma
  permissão): a resposta nova do cadastro tem as chaves do `GET /clientes/:id` (sem `geo_*`), nenhuma injeção (`') OR 1=1--` nos quatro
  parâmetros), a busca do topo continua pelo filtro de módulo, o barrado não dispara consulta. Duas observações **de antes** (não da etapa):
  o usuário sem nenhuma linha de permissão passa no portão do Comercial (o desenho do portão — já visto na 158) e `%`/`_` são curingas
  (declarado, B1013).
- **r3 (sabotagem, worktree própria `CRM-wt-e159-r3`) — 39 sabotagens (28 no servidor, 11 nas telas): 17 caíram, 18 sobreviveram por falta de
  asserção, 1 equivalente (S15), 1 inalcançável (S18 — a releitura sem linha), 2 caíram só pelo limite de 5 s do jest (CU02, CU07).** As
  faltas: as outras colunas de cada busca (o nome fantasia e o CNPJ dos clientes; o número e o nome fantasia nas propostas; o código, a
  descrição e o modelo dos produtos; o número da proposta da OS; o nome fantasia do principal e o destino nos custos — S01–S06, S09, S10), o
  legado em minúsculas nas OS e nos custos (S07, S08), cada tipo da busca do topo (S13, S13b), a resposta dupla da releitura (S17), o `PUT`
  que não apara (S22), o `id` como texto (S24), o *"carregando"* tirado pelo pedido anterior (C02), a pausa sem limite de cima (CU02/CU07), a
  distância mínima e os valores (CU05), os outros recarregamentos das Atividades (AT01), a aba Propostas das OS (OS01). **C01** (o contador no
  `catch` da lista de clientes) é **equivalente**: o `catch` só escreve no console.
- **Correção da Fase 5 (``49909fa2``):** o `loadCustos` lê os filtros e a ordenação de refs atualizados a cada render (r1 I1); o termo e o
  segmento na forma NFC (r1 M1); e as asserções de todos os sobreviventes. **Controles (todos caíram pelo cenário deles):** as 15 receitas
  sobreviventes do servidor reaplicadas aqui (S01–S10, S13, S13b, S17, S22, S24) e **N1** (sem a NFC no termo) → cada uma pela sua linha;
  **N2** (sem a NFC no segmento) **sobreviveu** à primeira rodada — faltava o segmento decomposto — e caiu depois da asserção
  (*"segmento Cosméticos decomposto"*); nas telas, R1I1 (sem os refs) → *"um filtro trocado durante a pausa"*; CU07 (700 ms) → o limite de cima;
  CU05 → a distância mínima e os valores; C02 → *"o pedido anterior que termina antes"* (que **passou** na primeira versão: o pedido anterior
  respondia junto com a saída do último — o atraso foi refeito para cair entre os dois); AT01 → o excluir pelo calendário; OS01 → a aba
  Propostas.

## Suítes (lidas na saída, `scratchpad/e159/`)

- **Base (antes de qualquer código, `base-api.log`):** `test:api` **478/478**.
- **Bateria 1 — antes dos commits `531f3576`..`650b8395` (`b1-*.log`):** `test:api` **479/479** arquivos (`filtrosDoComercial` **10/0**);
  `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; revisão obrigatória da proposta **23/23** + editor
  **39/39**; client **156** suítes / **1966** testes; `CI=true build` *Compiled successfully*.
- **Bateria 2 — antes de ``49909fa2`` (depois da Fase 5 — também a do fechamento; depois só mudaram documentos, `b2-*.log`):** `test:api` **479/479** arquivos (`filtrosDoComercial` **10/0**); `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; revisão obrigatória da proposta **23/23** + editor **39/39**; client **156** suítes / **1971** testes; `CI=true build` *Compiled successfully*.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** — a Fase 5 (os refs da pausa, a NFC e as asserções). As cinco tasks ficaram verdes na primeira
   aplicação, com controle positivo cada. Testes antigos mudados: **1** (o comentário do `coordenadasPrazo` sobre o eco do cadastro).
2. **Achados da revisão:** Fase 2 — **0 Critical + 7 Important + 10 Minor**, todos reais (nenhum ruído; o mais caro: a medição errou uma
   tela — o `Produtos.js` era montado pelos produtos de uma família). Fase 5 — r1 **2** reais (1 regressão desta etapa); r2 **0**; r3 **18**
   faltas de asserção reais + **1** equivalente + **1** inalcançável; **0** ruído. **O que mais pesou:** a pausa nova da busca dos custos
   (pedida pela própria Fase 2) trouxe um temporizador com os filtros velhos — o teste dela conferia só o pedido da pausa sozinho, nunca a
   pausa junto com outro filtro; e dois controles positivos do condutor (C6, C02) passaram por um acaso da fixture.
3. **Paralelismo:** **0** galhos de código em paralelo (cinco tasks pequenas — o plano decidiu assim); **1** revisor na Fase 2 (antes do
   código), **3** em paralelo na Fase 5 sob a trava (o r3 em worktree própria) — **0** incidente de trava.
4. **Defeito que escapou:** **0** no que a 159 entregou (medido na Etapa 160: as cinco buscas, o segmento, a busca dos custos, as
   Atividades e o cadastro do cliente não foram reabertos; a `condicaoDeBusca` foi reusada em mais onze rotas sem mudar o contrato dela — só
   ganhou o `{ escapar }`, opcional). A régua da 159, aplicada fora do Comercial, achou o filtro de prioridade das OS que nunca casava
   também na rota das OS **do Comercial** (C390) — de antes, não da 159 (ela não mexeu na prioridade).

## Próxima tarefa detalhada — Etapa 160

*(A série desta etapa foi B1012–B1017, C381 resolvido, C382 em parte, C384–C387 novos e resolvidos, C388 e C389 novos (de antes), nenhuma
A — a 160 começa em **B1018**, **C390**, **A104**; confira com `grep -oE` antes.)*

**Escolhida: a mesma régua da 159 nas telas do Operacional (a Fábrica) e do Almoxarifado que leem listas com filtro, e as sobras C388 e
C389 — medir antes, nenhuma regra do P.O.** (1) **Medir** (Fase 0): para cada tela do bloco `/fabrica` (ordens de serviço, produção) e das
listas do Almoxarifado com busca de texto ou filtro (materiais, requisições, movimentações, reservas, recebimentos), cada chave que a tela
manda e o `req.query` da rota — pelo nome do contrato, no componente que a rota do `App.js` monta (a lição da Fase 2 I1 desta etapa: o
`Produtos.js` que "não era usado" era); e se a busca de texto compara coluna gravada em maiúsculas com `LIKE`/`LOWER` (a C385) — a função
`server/services/buscaSemCaixa.js` (`condicaoDeBusca`) já existe e é testada; usar nela, não escrever outra. (2) Consertar os ignorados e as
buscas com acento, cada um com teste pela rota do `index.js` montado e fixture que separa (o gravado pela rota em maiúsculas **e** o legado
em minúsculas, por fora; **cada coluna** da busca com o seu caso — a lição do r3 desta etapa). (3) As sobras: **C389** — o seletor *Segmento*
do formulário do cliente casar a opção sem diferença de maiúsculas (é da tela: o valor gravado *"COSMÉTICOS"* mostra *"Cosméticos"*;
salvar sem mexer continua gravando o que estava); **C388** — os `POST` de projetos, propostas, oportunidades e atividades responderem o
registro gravado (medir antes quem lê a resposta — o `POST /propostas` tem leitores na tela da proposta; se algum lê mais que o `id`, é B).
**Pontos de atenção:** (1) a trava de máquina (um `test:api` por vez); (2) as telas que descartam a resposta velha só quando o filtro passa
a valer no servidor (a lição da Fase 2 I4); (3) toda pausa nova lê os filtros de agora (a lição do r1 I1 — refs, não o closure); (4) nunca
chamar o Nominatim de verdade (`NOMINATIM_URL` numa porta fechada).

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 152 — **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o
resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela de conversões e o grupo acima de família, a régua do
tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens de
produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**, **B101**/G30,
**G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62, a **C348**; nas propostas, a verificação do dono da proposta (Fase
12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a Frente B da lentidão, a **C297** (**B924**), a **B926**,
a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**; no Operacional, a **C332**; do Comercial, a **C354**, a
**C357**/**B988**, a **C359**/**B989** (e a **C360** junto), a **C358**, a **C383** (o ponto guardado nos próximos e na rota), e **novo desta
etapa: ignorar também o acento nas buscas (B1013)** — mudaria o resultado de todas as buscas de uma vez; e esconder do histórico a origem
padrão e o tipo legado (o resto da **C382**, **B1016**); do núcleo, a **C362**. Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** a busca sem caixa (`buscaSemCaixa.js`, cinco rotas, `531f3576`, ``49909fa2``); o segmento
(`531f3576`); a busca dos custos e a pausa com os filtros de agora (`68869661`, ``49909fa2``); o cadastro que responde o gravado e o tipo padrão
(`303841a2`); as Atividades (`650b8395`); as telas que descartam a resposta velha e aparam (`6bc42a36`).
