# Etapa 150 (Comercial/Operacional): grupos de produto, produtos e variáveis técnicas exigem o módulo pela régua da tela (C346, C347) — plano

> Origem: "Próxima tarefa detalhada — Etapa 150" do plano da 149
> (`docs/superpowers/plans/2026-10-18-almoxarifado-etapa149-o-cadastro-de-familia-e-a-lista-de-os-pelo-modulo.md`). A etapa é pequena; o
> design, com a Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-18): última B **B976**, último C
> **C347**, última A **A97**. Esta etapa: **B977+**, **C348+**, **A98+**. Worktree `CRM-wt-e150`, branch `etapa-e150` (da main `a9fef680`).
>
> **Trava de máquina:** `scratchpad/e150-lock.sh` (o diretório `maquina-testes.lock` de sempre). Um arquivo de teste de servidor por vez,
> inclusive os revisores. Revisão obrigatória da proposta: `scratchpad/e150/review-proposta.sh` (23 + editor 39 + as rotas). A etapa
> **não** toca o template nem o client; toca o `index.js` (o portão nas 25 rotas e o aviso do boot).
>
> **Fase 2 (um revisor fresco, só leitura): 0 Critical, 0 Important, 6 Minor — todos aceitos antes do código, com o que mudou:**
> **M-1** o corpo literal do 503 e a linha do desligado entraram no contrato. **M-2** o `backend/` da raiz (Prisma/TS, com o seu próprio
> `app.use('/api/produtos')`) é outro servidor, fora do deploy (o `Dockerfile` só copia `client/` e `server/`) — citado na Fase 0; a varredura
> do T2 é só de `server/`. **M-3** a aba *Variáveis técnicas* também chama `GET /api/compras/grupos` (régua antiga do Compras): o
> administrador do Comercial sem o Compras vê o seletor de grupo de compras vazio — **de antes** desta etapa, não piora; vira a **C348** e o T2
> não afirma a aba "inteira" com o seletor. **M-4** a criação da OS pelo Comercial (`OSComercialForm`) já não fecha hoje para quem só tem o
> Comercial (`proximo-numero` e `os-itens` na régua do Operacional — **C332**; o `POST` da OS — **C277**): o produto pelo código aceitar o
> Comercial está certo, mas não promete o fluxo inteiro (nota na B978). **M-5** o T1 só **acrescenta** ao aviso do boot — as frases presas
> pelos testes da 147/148/149 (`cadastro de família NAO exigem o Comercial (só o login)`, `ordem de serviço pelo número`, `modelo de
> contrato por família`, `modelo da proposta`, `listas de preço`, `volta à régua antiga do módulo`) ficam intactas. **M-6** o
> `FamiliasProdutos` (código morto, abre o `ModalFamiliaForm`) entrou na lista de código morto.

## Fase 0 — medido (antes de qualquer código)

### As rotas (lidas no `index.js`; nenhuma fora dele — `routes/`, `services/` não registram `/grupos`, `/produtos`, `/variaveis-tecnicas`)

**26 registros, todos só com `authenticateToken`:**

- **Grupos de produto — 8:** `GET /api/grupos`, `GET /grupos` (apelido sem `/api`, o mesmo SQL), `GET /api/grupos/:id`, `POST /api/grupos`,
  `PUT /api/grupos/:id`, `DELETE /api/grupos/:id`, `POST /api/grupos/:id/foto` (multer `uploadGrupo`), `POST /api/grupos/:id/foto-base64`.
- **Produtos — 11:** `POST /api/produtos/verificar-existente`, `GET /api/produtos`, `GET /api/produtos/proximo-codigo`, `GET /api/produtos/:id`,
  `GET /api/produtos/codigo/:codigo`, `POST /api/produtos`, `POST /api/produtos/:id/clonar` (`isAdminUser` no corpo — *"Apenas administradores
  podem clonar produtos"*), `PUT /api/produtos/:id`, `DELETE /api/produtos/:id`, `POST /api/produtos/zerar-modelo-antigo`,
  `POST /api/produtos/:id/imagem` (multer `uploadProduto`).
- **Variáveis técnicas — 7:** `GET /api/variaveis-tecnicas`, `GET .../categorias`, `GET .../opcoes/:chave`, `GET .../:id`, `POST`, `PUT /:id`,
  `DELETE /:id`.

### Quem chama (client inteiro, `client/src`, e servidor)

| Rota | Telas que chamam | Onde estão montadas (portão da tela) |
|---|---|---|
| `GET /grupos` | `GruposProdutos` (via `ProdutosPage`), `ModalFamiliaForm` (aberto pelo `FamiliasDoGrupo`) | `/comercial/produtos`, `/comercial/produtos/grupo/:id` (Comercial) |
| `GET /grupos/:id` | `FamiliasDoGrupo` | `/comercial/produtos/grupo/:grupoId` (Comercial) |
| `POST`/`PUT`/`DELETE /grupos`, as duas fotos | `ModalGrupoForm` (aberto pelo `GruposProdutos`) | `/comercial/produtos` (Comercial) |
| `GET /produtos` | `Produtos` (via `ProdutosPorFamilia`), `SelecaoProdutosPremium` (no `proposta/PropostaForm`) | `/comercial/produtos/familia/:id`, `/comercial/propostas/nova` e `/editar/:id` (Comercial) |
| `GET /produtos/proximo-codigo`, `GET /:id`, `POST`, `PUT /:id`, `POST /:id/imagem` | `ProdutoForm` | `/comercial/produtos/novo` e `/editar/:id` (Comercial) |
| `DELETE /produtos/:id`, `POST /:id/clonar` | `Produtos` | `/comercial/produtos/familia/:id` (Comercial) |
| `POST /produtos/verificar-existente` | `SelecaoProdutosPremium` | as duas da proposta (Comercial) |
| **`GET /produtos/codigo/:codigo`** | `OSComercialForm` e o `PreviewOSEditavel` que ele abre; **`OSDetalhesForm`** (via `OSFormPage`) | `/comercial/ordens-servico/nova/:propostaId` (Comercial); **`/comercial/ordens-servico/editar/:id` (Comercial) e `/fabrica/ordens-servico/editar/:id` (Operacional)** |
| `POST /produtos/zerar-modelo-antigo` | **ninguém** (nem client, nem script do repositório) | — |
| `GET /variaveis-tecnicas` | `ProdutoForm`, `ModalFamiliaForm`, `SelecaoProdutosPremium` (Comercial); `ConfigTemplateProposta` (`/comercial/propostas/config-template` **e** embutido em `/configuracoes` → Comercial → *Template de proposta*); `VariaveisTecnicas` (**só** embutido em `/configuracoes` → Comercial → *Variáveis técnicas*) | Comercial e Configurações |
| `GET /variaveis-tecnicas/categorias`, `POST`, `PUT /:id`, `DELETE /:id` | `VariaveisTecnicas` | **só** Configurações → Comercial |
| `GET /variaveis-tecnicas/opcoes/:chave` | `ProdutoForm` | Comercial |
| `GET /variaveis-tecnicas/:id` | **ninguém** | — |

- **A busca global não lê estas rotas.** O plano da 149 listou `BuscaGlobal` e `Layout` entre os leitores de `/api/produtos` — **estava errado**
  (grep de texto, sem medir): o `Layout` só tem o item de menu `/comercial/produtos`, e a `BuscaGlobal` chama `GET /api/busca-global`, que lê a
  tabela `produtos` direto no banco (o `case 'produtos'` do `index.js`) e só monta o link `/comercial/produtos/editar/:id`. O portão desta etapa
  **não** muda a busca global — quem está fora do Comercial continua achando produto nela (e o clique cai no portão de tela do Comercial).
- **Código morto que chama `/api/produtos`:** `components/PropostaForm.js` (Fase 2 M-7 da 149: ninguém importa), o `PreviewPropostaEditavel`
  (só o morto o importa), o `proposta/GerarPropostaModal` (ninguém importa) e o `ModalSelecaoTipoProduto` (só navega) e o `FamiliasProdutos` (ninguém importa; abre o `ModalFamiliaForm`, Fase 2 M-6). O app antigo da raiz
  (`src/`, Vite + Dexie) tem um `apiService.ts` com `/produtos`, mas **nenhum arquivo o importa** e o `Dockerfile` só constrói o `client/`. O `backend/` da raiz (Prisma/TS) registra o seu próprio `/api/produtos` — é **outro
  servidor**, fora do deploy (Fase 2 M-2).
- **Fora do Comercial, de Configurações e da OS, ninguém lê:** o Almoxarifado tem os seus materiais e grupos (`/almoxarifado/*`); Compras tem
  `/api/compras/grupos` (outra tabela, `grupos_compras`); Engenharia, o MES/Fábrica (fora a OS) e o Financeiro não chamam estas rotas (grep no
  `client/src` inteiro). **Servidor:** nenhum template ou serviço busca estas rotas por HTTP (o PDF da OS busca a **imagem** pelo estático
  `/api/uploads/produtos`, fora de portão; as fotos dos grupos saem por `/api/uploads/grupos-produtos/`).
- **O caminho de Configurações** (o mesmo da 147/149): `/configuracoes` exige o **Administrativo** pela régua da tela e a aba Comercial aparece
  só a quem `canConfigureModule(user, 'comercial')` — `tambemAdminDoModuloCom: { admin: 'comercial', tela: 'administrativo' }` (B958).

### Banco local (cópia de 09/10 do `CRM/server/data`, lida numa cópia no scratchpad — `scratchpad/e150/medir.js`)

**10** usuários ativos, **4** super/admin (2, 5, 13, 14), **0** grupos de permissão, **0** `admin_modulos`. Com o Comercial: 3, 9 (e os
super). Sem o Comercial: **7** (Compras + Almoxarifado), **8** (Engenharia / Projetos), **12** (Almoxarifado), **15** (Almoxarifado + Compras)
— os **mesmos 4** da A93/A95/A96/A97; nenhum tem o Operacional nem é administrador do Comercial, então perdem as 25 (a tela já os barra do
Comercial e de Configurações → Comercial). **10** grupos de produto, **23** produtos (13 ativos), **89** variáveis técnicas (77 ativas).

## Regras de negócio

- **RN-150.01 — os 8 de grupos de produto e 9 de produtos que só o Comercial usa exigem o Comercial pela régua da tela (C346).** O
  `exigirComercialNasPropostas` logo depois do `authenticateToken` (antes do multer nas duas fotos multipart — o arquivo do barrado não chega ao
  disco): as 8 de grupos e `verificar-existente`, `GET /api/produtos`, `proximo-codigo`, `GET /:id`, `POST`, `PUT /:id`, `DELETE /:id`,
  `zerar-modelo-antigo`, `POST /:id/imagem`. Recusa: **403** `{ "error": "Acesso negado ao módulo", "modulo": "comercial" }` e a linha
  `acesso_negado` no log (`modulo = 'comercial'`). `SQLITE_BUSY` ao ler as linhas → **503** (`context: 'portao:propostas'`); outro erro → **500**
  *"Erro ao verificar permissões"*.
- **RN-150.02 — o produto pelo código aceita o Comercial ou o Operacional (a régua da OS).** `GET /api/produtos/codigo/:codigo` com o
  `exigirComercialOuOperacionalNaOS` da 148 (as duas telas que abrem a OS). Recusa: **403** `{ "error": "Acesso negado ao módulo", "modulo":
  ["comercial", "operacional"] }`, log `modulo = 'comercial|operacional'`. BUSY/500 como na RN-150.01.
- **RN-150.03 — clonar produto não muda.** `POST /api/produtos/:id/clonar` continua só do administrador (`isAdminUser`, *"Apenas
  administradores podem clonar produtos"*), sem o portão (como a B973 no clonar família).
- **RN-150.04 — as 7 de variáveis técnicas aceitam o Comercial ou o caminho de Configurações (C347).** Um portão novo,
  `exigirComercialNasVariaveisTecnicas = portaoDasPropostas.exigir('comercial', { tambemAdminDoModuloCom: { admin: 'comercial', tela:
  'administrativo' } })`, nas 7 (leitura e escrita). Recusa e erros como na RN-150.01 (`modulo: 'comercial'`).
- **RN-150.05 — o mesmo interruptor.** `PROPOSTAS_PORTAO_DE_MODULO=desligado` (B946): as 25 voltam a pedir só o login (o de antes da etapa).
  O aviso do boot cita os grupos de produto, os produtos, as variáveis técnicas e o produto pelo código, mantendo as frases que os testes da
  147/148/149 prendem.

## Contratos de API (congelados)

| Rota | Caso | Status | Corpo / mensagem literal |
|---|---|---|---|
| as 17 (8 de grupos + 9 de produtos) e as 7 de variáveis | sem o Comercial pela régua da tela (nas 7, também sem o caminho de Configurações) | 403 | `{ "error": "Acesso negado ao módulo", "modulo": "comercial" }` |
| `GET /api/produtos/codigo/:codigo` | sem o Comercial e sem o Operacional pela régua da tela | 403 | `{ "error": "Acesso negado ao módulo", "modulo": ["comercial", "operacional"] }` |
| as 25 | `SQLITE_BUSY` ao ler as permissões | 503 | `{ "error": "Banco temporariamente ocupado. Tente novamente em alguns segundos.", "code": "SQLITE_BUSY", "retryAfter": 3, "context": "portao:propostas" }` |
| as 25 | outro erro ao ler as permissões | 500 | `{ "error": "Erro ao verificar permissões" }` |
| as 25 | `PROPOSTAS_PORTAO_DE_MODULO=desligado` | — | como antes da etapa (só o login) |
| `POST /api/produtos/:id/clonar` | não administrador | 403 | `{ "error": "Apenas administradores podem clonar produtos" }` (sem mudança) |

As respostas de sucesso não mudam (corpo e status).

## Tasks (sort topológico)

- [x] **T1 — `d74ad876` — tronco — o portão nas 25 e o aviso do boot (RN-150.01–05).** `index.js`: o `exigirComercialNasVariaveisTecnicas` junto dos outros
  portões; o portão como 2º middleware nas 25 (antes do multer nas duas multipart); a frase nova no aviso.
- [x] **T2 — `d74ad876` (escrito antes do T1, vermelho medido) — `tests/api/produtosGruposVariaveisPortao.api.test.js`, pelo `index.js` real (pasta vazia), molde do
  `familiasListaOsPortao`:** pelo fonte (as 25 com o portão certo como 2º middleware, o clonar sem ele, cada uma registrada uma vez, nenhum
  registro fora do `index.js`, nenhum `app.use` nos prefixos, a definição do portão novo); o barrado (só o Almoxarifado) toma 403 em **cada
  uma** das 25 com o corpo certo e nada muda (retrato de `grupos_produto`, `produtos`, `variaveis_tecnicas`, a pasta `uploads`; o log conta 24
  `comercial` + 1 `comercial|operacional`); as duas fotos multipart do barrado não chegam ao disco; a tabela por usuário (abaixo) com a decisão
  da tela calculada pelo `temModuloComoATela` / `passaPeloCaminhoDeConfiguracoes`; **as metades positivas, pela rota, em fluxo:** o Comercial
  faz o catálogo inteiro (grupo: criar → foto-base64 → foto → renomear → ler; produto: próximo código → criar → ler → pelo código → editar →
  imagem → verificar existente → lista pela família → zerar modelo antigo com o id → apagar; o grupo apagado) e as variáveis (criar → lista →
  categorias → `:id` → opções → editar → apagar); o administrador do Comercial com o Administrativo faz a aba *Variáveis técnicas* inteira e
  toma 403 no catálogo; **o cruzamento:** o produto criado pelo Comercial é lido pelo código por quem só tem o Operacional, junto da OS (o
  `GET /api/ordens-servico/:id`, portão da 148) — e o mesmo toma 403 na lista de produtos e nas variáveis; ninguém que passa vira "acesso
  negado" no log; o clonar (Comercial e Operacional com a frase de sempre, sem log; o administrador clona); o desligado (as 25 abrem ao barrado,
  ligado de novo barra); o BUSY/500 num de cada portão.

**Tabela por usuário (T2)** — colunas: catálogo (17) / produto pelo código / variáveis (7):

| Usuário | Catálogo | Pelo código | Variáveis |
|---|---|---|---|
| sem nada (sem linha) | 200 | 200 | 200 |
| direta do Comercial | 200 | 200 | 200 |
| grupo ativo com o Comercial | 200 | 200 | 200 |
| grupo ativo sem linha | 200 | 200 | 200 |
| super / role admin (com só a direta do Almoxarifado) | 200 | 200 | 200 |
| só a direta do Operacional | 403 | **200** | 403 |
| grupo ativo com o Operacional | 403 | **200** | 403 |
| Operacional só num grupo inativo (+ direta do Almoxarifado) | 403 | 403 | 403 |
| Operacional com permissão 0 | 403 | 403 | 403 |
| Comercial com permissão 0 | 403 | 403 | 403 |
| só a direta do Almoxarifado | 403 | 403 | 403 |
| só a direta de Engenharia / Projetos | 403 | 403 | 403 |
| administrador do módulo Comercial + direta do Administrativo | 403 | 403 | **200** |
| administrador do módulo Comercial **sem** o Administrativo (+ direta do Almoxarifado) | 403 | 403 | 403 |
| direta do Administrativo, sem ser administrador do Comercial | 403 | 403 | 403 |
| direta do Operacional com `grupo_id = 0` + direta do Almoxarifado | 403 | 403 | 403 |

## Decisões (vão para a letra B)

- **B977** — grupos de produto (8) e produtos (9 das 11) pelo Comercial pela régua da tela. Descartado: (a) leitura mais larga que a escrita
  (proteger só a escrita) — medido: fora o produto pelo código, nenhuma tela fora do Comercial lê estas rotas, e a busca global lê o banco direto
  (não muda); deixar a leitura aberta manteria o catálogo com preço (`preco_base`) aberto pela API a quem a tela barra; (b) a régua antiga
  (`checkModulePermission`, libera o Comercial a todo usuário sem grupo — no banco medido não mudaria nada); (c) apagar o apelido `GET /grupos`
  (quem configura a URL da API sem o `/api` perderia a lista; como a B972).
- **B978** — o produto pelo código (`GET /api/produtos/codigo/:codigo`) com a régua da OS: Comercial **ou** Operacional. Descartado: (a) só o
  Comercial (a OS aberta pela Fábrica — `/fabrica/ordens-servico/editar/:id` — busca nele os dados e a imagem dos itens: trancaria a Fábrica); (b)
  deixá-lo só com o login (quem a tela barra das duas leria o produto inteiro, com preço). *Fase 2 M-4:* aceitar o Comercial não promete a
  criação da OS pelo Comercial de ponta a ponta — o `proximo-numero` e os itens seguem na régua do Operacional (**C332**) e o `POST` da OS é a
  **C277** (do P.O.).
- **B979** — as 7 de variáveis técnicas com o Comercial **ou** o caminho de Configurações, inclusive as 3 escritas e as categorias. Descartado: (a)
  só o Comercial (trancaria fora quem a tela deixa editar pela aba *Variáveis técnicas* de Configurações); (b) **só** o caminho de Configurações
  nas escritas (a tela só as oferece lá; mas quem tem o Comercial já mexe no catálogo inteiro — o mesmo raciocínio da B971 (e)); (c) a régua das
  famílias de Configurações reaproveitada (o mesmo corpo; um nome próprio deixa a sabotagem de um não esconder a do outro).
- **B980** — clonar produto continua só do administrador, sem o portão (como a B973). Descartado: pôr o portão antes (não muda quem passa e
  trocaria a frase de quem não é administrador).
- **B981** — `POST /api/produtos/zerar-modelo-antigo` (nenhum chamador medido — é manutenção de cadastro) com o portão do Comercial. Descartado:
  (a) só o administrador (mais estreito que a tela, sem uso medido para justificar); (b) apagar a rota (não medido em produção).
- **B982** — a próxima etapa (151).

## Avisos novos (C)

- **C348** — a aba *Variáveis técnicas* (Configurações → Comercial) lê os grupos de compras por `GET /api/compras/grupos`, na régua antiga do
  Compras: o administrador do Comercial sem o Compras vê o seletor *Grupo de compras* vazio (o erro é engolido; o valor já gravado é
  preservado ao editar). **De antes desta etapa** (Fase 2 M-3) — abrir os grupos de compras a quem configura o Comercial é decisão de acesso do
  Compras, fica registrado.
- **C349**–**C352** (abertos no fechamento e na Fase 5): **C349** clientes (7, com o logo), projetos (5), oportunidades (4) e atividades (4)
  só pedem o login; **C350** os custos de viagem (19) só pedem o login; **C351** (r2) as três telas da OS montam `/produtos/codigo/${codigo}`
  sem `encodeURIComponent` — o código com `/` dá 404 (de antes), com `?`/`#` cai noutra rota (agora 403 em vez de 404 para quem só tem o
  Operacional; sem efeito na tela além do item sem os dados do produto); **C352** (r2) `GET /api/busca-global` responde a qualquer logado
  (produtos sem preço, clientes, propostas).

## Execução

- **Linha de base** (a árvore da main `a9fef680`, antes de qualquer código): `test:api` **471/471**.
- **TDD, vermelho medido:** `produtosGruposVariaveisPortao` contra o `index.js` da main **3 passed, 7 failed** (o barrado tomava **200** nas 25,
  o administrador do Comercial em Configurações lia o catálogo, quem só tem o Operacional lia a lista de produtos e as variáveis, o aviso do
  boot não citava as rotas; os 3 verdes eram os dois fluxos do Comercial e o clonar, que valem antes e depois). Com o T1: **10/0**.
- **Divergências do plano:** (1) as RN e os contratos ajustados pela Fase 2 antes do código (acima); (2) T1 e T2 num commit só (o teste é
  a prova do portão; o T1 aplicado por script com âncoras contadas — `scratchpad/e150/t1.js`).
- **Controles K1–K10 (antes de `d74ad876`, `scratchpad/e150/sabota.js`, sob a trava, restauro por cópia, md5 conferido):** o apelido
  `GET /grupos` sem portão (caiu também o barrado e a tabela por usuário); o multer antes do portão na imagem do produto (caiu o "chegou ao
  disco"); o código só com o Comercial (a integração da Fábrica e a tabela); o portão das variáveis sem o caminho de Configurações (o fluxo
  do administrador do Comercial: *403 !== 201*); o `POST` das variáveis com o portão estreito (idem); o clonar com o portão (a frase de sempre);
  o aviso sem a frase nova (o cenário do desligado); o `zerar-modelo-antigo` sem portão (o barrado e o retrato); o código só com o login; o
  `DELETE` das variáveis sem portão — **todos caíram pela asserção do ponto**, além da régua do fonte.
- **Suíte antes de `d74ad876`** (a árvore com o T1 e o T2): `test:api` **472/472**; `test:almoxarifado` **44/0**;
  `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; revisão obrigatória da proposta **23/23** + as rotas (21/0, 11/0, 11/0, 8/0,
  26/0, 15/0, 7/0, 8/0) + editor **39/39**; client **143** suítes / **1856** testes; `CI=true build` *Compiled successfully*.
- **A98** rodada no banco local (cópia de 09/10): os **4** de sempre (7, 8, 12, 15 — "o catálogo de produtos e as variáveis técnicas");
  controle numa cópia com o 7 ganhando o administrador do Comercial e o Administrativo, o 12 o Operacional e o 15 o Comercial: o 15 saiu, o 7
  marcado "as variáveis técnicas continuam por Configurações", o 12 "o produto pelo código continua, pela OS da Fábrica".

## Fase 5 — três revisores frescos em paralelo, sob a trava

- **Regra (r1): 0 achados.** Cada chamada do client (catálogo, proposta, as três telas da OS, Configurações) traçada até o portão de tela —
  ninguém que a tela deixa entrar toma 403; **20** respostas comparadas byte a byte (status, corpo, cabeçalhos) com o portão ligado e
  desligado para quem passa — **0** diferenças; ordem de registro (`proximo-codigo` antes de `/:id`, `/codigo/:codigo` com dois segmentos,
  `categorias`/`opcoes/:chave` antes de `/:id`), o multer depois do portão, o desligado e o aviso conferidos; a rajada do `OSDetalhesForm`
  (um produto por item, `Promise.all`) medida — 200 pedidos simultâneos, ≈ 0,3–0,5 ms a mais por pedido, nenhum 503.
- **Autorização (r2): 0 Critical/Important; 1 Minor informativo (C351) e 1 aviso de antes (C352).** **66** perfis (grupos inativos/`ativo` 2,
  NULL, '1'; permissão 0/2/'1'/1.0/'true'/NULL/-1; `grupo_id` 0 e 999; `admin_modulos` malformado, maiúsculo, CSV, objeto; super '1'/2/'true';
  role 'ADMIN'/'admin '/vazia; o caminho de Configurações por grupo, inativo, permissão 0; rebaixado, desativado, apagado na sessão) contra a
  decisão da tela tirada de cópias do código real do client — **0** diferenças; **58** variações de caminho (maiúsculas, barra final, `//`,
  `/./`, `/../`, `%2F`, `;x`, `%00`, HEAD, OPTIONS, override) — nada vaza com o portão ligado; o desligado abre exatamente o de antes.
- **Sabotagem (r3, worktree própria `CRM-wt-e150-r3`, removida): 30 sabotagens novas — 27 caíram, 2 sobreviveram (falta de asserção), 1
  equivalente.** **S02** um segundo registro escondido na mesma linha (a régua do fonte lia só o primeiro de cada linha — S01/S03/S04 só caíam
  pelo comportamento); **S27** o desligado que não abrisse o `DELETE` (nenhuma das 5 suítes dos portões apagava com o portão desligado);
  **S14** (`console.warn` × `console.log`) equivalente — o teste manda os dois para o mesmo arquivo. As duas viraram asserção; S15/S16 (o
  desligado com espaço/maiúscula, a permissão em texto) só caem na suíte da 145 — cobertos entre as suítes.
- **Controles da Fase 5, rodados por mim (`scratchpad/e150/sab2.js`):** **K12** (registro em duas linhas), **K13** (`app.use` com o caminho
  concatenado), **K14** (a linha certa do portão num comentário) e **K15** (o desligado sem o `DELETE`) caíram pela asserção nova; o **K11**
  (segundo registro na mesma linha) caiu pela régua antiga por posição — a nova foi conferida à parte sobre o fonte sabotado (a antiga via
  26 registros, a nova 27). md5 restaurado em todos.
- **Fase 5 — `481ee23a`.** O teste segue com 10 cenários.
- **Suíte antes de `481ee23a`** (a árvore com a Fase 5): `test:api` **472/472**; `test:almoxarifado` **44/0**;
  `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; revisão obrigatória da proposta **23/23** + as rotas (21/0, 11/0, 11/0, 8/0,
  26/0, 15/0, 7/0, 8/0) + editor **39/39**; client **143** suítes / **1856** testes; `CI=true build` *Compiled successfully*. É também a
  verificação do fechamento (depois dela só mudaram documentos). *(O `review-proposta.md` ganhou a linha do teste novo; o
  `scratchpad/e150/review-proposta.sh` ainda não roda o `familiasListaOsPortao` nem o novo — os dois rodam no `test:api`.)*

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** — a Fase 5 (as asserções do r3). Antes do primeiro commit, **0** (o T1 por script com âncoras
   contadas ficou verde na primeira; o vermelho de antes era o esperado). Testes antigos mudados: **0**.
2. **Achados da revisão:** Fase 2 — **0 Critical + 0 Important + 6 Minor, todos reais**. Fase 5 — r1 **0**; r2 **1** Minor real (C351, de
   antes) + 1 aviso real (C352, de antes); r3 **2** sobreviventes reais + 1 equivalente; **0** ruído. **O que mais pesou:** a régua do fonte
   "um registro por linha" — herdada do molde da 149, que tem a mesma fraqueza (fica para a próxima que usar o molde: contar no texto
   inteiro).
3. **Paralelismo:** **0** galhos em paralelo (T1 e T2 dividem o `index.js`/a prova); **0** retrabalho; **1** revisor na Fase 2, **3** em
   paralelo na Fase 5 sob a trava (o r3 numa worktree própria, removida).
4. **Defeito que escapou:** *(preencher na Etapa 151)*.

## Próxima tarefa detalhada — Etapa 151

*(A série desta etapa foi B977–B982, C348–C352, A98 — a 151 começa em **B983**, **C353**, **A99**; confira com `grep -oE` antes.)*

**Escolhida: a C349 — clientes, projetos, oportunidades e atividades pelo módulo.** No `index.js`, só com `authenticateToken`: **clientes**
(7: `GET /api/clientes`, `/logos`, `/:id`, `POST`, `PUT /:id`, `DELETE /:id`, `POST /:id/logo` com multer), **projetos** (5: `GET`, `/:id`,
`POST`, `PUT`, `DELETE`), **oportunidades** (4) e **atividades** (4) — confira a contagem e procure registros fora do `index.js` e em várias
linhas (a régua de fonte desta etapa conta no texto inteiro — use-a). **A Fase 0 é a parte grande, e aqui a leitura é de muitos módulos:**
grep no fechamento da 150 (sem medir rota por rota) achou leitores de `/clientes` e `/projetos` **fora do Comercial**: o Almoxarifado
(`MaterialAlmoxarifadoForm`, `ReservasAlmoxarifado`, `MovimentacoesAlmoxarifado`, `SobrasAlmoxarifado`) e o Operacional (`operacional/OSForm`),
além de `Atividades`, `ClienteForm`, `Clientes`, `CustosViagens`, `Dashboard`, `MaquinasVendidas`, `OportunidadeForm`, `Oportunidades`,
`OSComercialForm`, `ProjetoForm`, `Projetos`, `proposta/PropostaForm`, `PropostasList` (e o código morto `PropostaForm`,
`PreviewPropostaEditavel`, `GerarPropostaModal`, `HelpGuide` — confira). **Regra do usuário:** não trancar fora quem usa hoje — aqui o caminho
reversível é **separar leitura de escrita**: a escrita (criar, editar, apagar, o logo) pelo Comercial, a leitura com uma régua que inclua cada
módulo que a lê (medir quais — talvez a lista larga de módulos da tela, ou deixar a leitura com o login e registrar em B). Os perfis do
Almoxarifado (`services/almoxarifado/permissions.js`) não entram: é acesso a módulo, não ação. Molde de teste:
`produtosGruposVariaveisPortao.api.test.js` (a régua de fonte no texto inteiro, o desligado com as exclusões, a tabela por usuário, o log de
quem passa). Uma consulta **A99** no molde da A98 se houver gente que perde.

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 149 (que já inclui a das 148, 147, 146, 145 e a **C330**) — **B853**/**C279**,
**B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela de
conversões e o grupo acima de família, a régua do tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**,
**C117**/**C118**, **C139**, **C278**; na 05, os itens de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por
cliente e previsto × realizado; na 22, **B13**, **B101**/G30, **G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62; nas
propostas, a verificação do dono da proposta (Fase 12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a
Frente B da lentidão, a **C297** (**B924**), a **B926**, a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**; no
Operacional, a **C332** (o número da próxima OS e os itens são da criação da OS, **C277**). Pendem de Postgres: **C98**, **C110**. **Novo nesta
etapa, de decisão de acesso do Compras:** a **C348** (quem configura o Comercial lê os grupos de compras?) — candidata, mas é do dono do
Compras; reversível se for feita, então não é bloqueio. *(Nada novo para o P.O. nesta etapa: as decisões B977–B981 são reversíveis e estão na
letra B.)*

**O que já está pronto e não precisa reabrir:** o portão nas 25 rotas desta etapa (`exigirComercialNasPropostas` em 8 de grupos e 9 de
produtos, `exigirComercialOuOperacionalNaOS` no produto pelo código, `exigirComercialNasVariaveisTecnicas` nas 7 de variáveis), o clonar só do
administrador; o teste `produtosGruposVariaveisPortao` (10). Candidatas menores para encaixar se sobrar: **C351** (o `encodeURIComponent`
nas três telas da OS) e **C352** (a busca global filtrando cada tipo pelo módulo dele — muda o que todos os módulos veem: medir antes).
