# Etapa 149 (Comercial/Operacional): o cadastro de família de produto e a lista de OS do Operacional exigem o módulo pela régua da tela, e a criação de lista de preço só diz "pronto" depois de gravar as linhas (C343, C345, resto da C341) — plano

> Origem: "Próxima tarefa detalhada — Etapa 149" do plano da 148
> (`docs/superpowers/plans/2026-10-18-almoxarifado-etapa148-o-modulo-na-os-e-no-modelo-de-contrato.md`). A etapa é pequena; o design, com a
> Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-18): última B **B970**, último C
> **C345**, última A **A96**. Esta etapa: **B971+**, **C346+**, **A97+**. Worktree `CRM-wt-e149`, branch `etapa-e149` (da main `dab46528`).
>
> **Trava de máquina:** `scratchpad/e149-lock.sh` (o diretório `maquina-testes.lock` de sempre). Um arquivo de teste de servidor por vez,
> inclusive os revisores. Revisão obrigatória da proposta: `scratchpad/e149/review-proposta.sh` (23 + editor 39 + as rotas). A etapa
> **não** toca o template nem o client; toca o `index.js` (o portão nas 21 rotas de família e na lista de OS, o aviso do boot, a gravação
> das linhas da lista de preço).
>
> **Fase 2 (um revisor fresco, só leitura): 0 Critical, 0 Important, 7 Minor — todos aceitos antes do código, com o que mudou:**
> **M-1** a C346 contava 9 registros de grupos de produto — são **8** (7 `/api/grupos*` + o apelido `GET /grupos`). **M-2** um valor que não vira
> texto (`{ "toString": 1 }`, só pela integração) derrubava a montagem da busca no meio do laço, com a lista já gravada → as linhas passam a
> ser montadas **antes** de gravar a lista: **400** *"A linha N da planilha não pôde ser lida (<msg>). A lista não foi criada."*. **M-3** o
> `SQLITE_BUSY` ao gravar a própria lista também vira **503** (`listas-precos`) — nada ficou, a rota é repetível. **M-4** no 503 o client repete
> até 3 vezes e depois mostra o genérico *"Erro ao importar a planilha."* (o `api.js` troca o erro) — a frase nova chega à tela só nos 500;
> escrito no guia. **M-5** a frase "ficou incompleta" usa o nome **aparado** (o gravado). **M-6** o aviso do boot ganha uma frase própria para a
> lista de OS ("volta à régua antiga do módulo"), em vez de entrar no "(só o login)". **M-7** o `components/PropostaForm.js` não é importado
> por ninguém (o montado é o `proposta/PropostaForm.js`) — código morto como o `FamiliasProdutos`; e a C343 fica **resolvida em parte** (o
> atalho de renomear para mudar o modelo de contrato passa a exigir o Comercial; o efeito do nome continua).

## Fase 0 — medido (antes de qualquer código)

### As rotas de família (lidas no `index.js`; nenhuma fora dele — `routes/`, `services/` não registram `/familias`)

**22 registros** casam `/api/familias*` ou `/familias` fora o `PUT /api/familias/:id/clausulas-modelo` (148, já com o portão):

- **20 `/api/familias*`** — 19 só com `authenticateToken` e o `POST /:id/clonar` (`isAdminUser` no corpo — `role === 'admin'`).
- **2 apelidos sem o `/api`** que a C343 **não contava**: `GET /familias` e `POST /familias` (o mesmo handler do `/api`; existem para
  quem configura `REACT_APP_API_URL` sem o `/api`). Só login. **Total da etapa: 21 rotas.**

### Quem chama (client inteiro, `client/src`, e servidor)

| Tela | Onde está montada (portão da tela) | Rotas de família que chama |
|---|---|---|
| `FamiliasDoGrupo` | `/comercial/produtos/grupo/:grupoId` (Comercial) | `GET /familias?grupo_id`, `DELETE /familias/:id`, `POST /:id/clonar` |
| `ModalFamiliaForm` (aberto pelo `FamiliasDoGrupo`) | idem | `GET /:id/variaveis`, `PUT /:id`, `POST /familias`, `POST /:id/foto` / `/esquematico` (multipart) e `-base64`, `PUT /:id/variaveis` (e o modelo de contrato, 148) |
| `Produtos`, `ProdutosPorFamilia`, `ProdutoForm` | `/comercial/produtos/...` (Comercial) | `GET /familias`, `GET /:id`, `GET /:id/variaveis`, `GET /:id/opcoes-variaveis` |
| `SelecaoProdutosPremium` (nos dois `PropostaForm`) | `/comercial/propostas/nova` e `/editar/:id` (Comercial) | `GET /familias`, `GET /:id`, `GET /:id/opcoes-variaveis-from-produtos` |
| `PropostaForm` (o de `proposta/`; o de `components/` não é importado por ninguém — Fase 2 M-7) | idem | `GET /familias` |
| `ConfigTemplateProposta` | `/comercial/propostas/config-template` (Comercial) **e** embutido em `/configuracoes` → Comercial → *Template de proposta* | `GET /familias/todas`, `GET /:id/variaveis` |
| `OpcoesPorFamilia` | **só** embutido em `/configuracoes` → Comercial → *Opções por família* | `GET /familias/todas`, `GET /:id`, `GET /:id/variaveis`, `GET /:id/opcoes-variaveis`, `POST` e `DELETE .../variaveis/:chave/opcoes[/:id]` |
| `FamiliasProdutos` | **nenhum arquivo o importa** (código morto, medido na 148) | — |

- **O caminho de Configurações** (o mesmo da 147): `/configuracoes` exige o **Administrativo** pela régua da tela (`ProtectedModuleRoute`) e o
  `ProtectedModuleConfigRoute administrativoConfig`; a barra de módulos mostra o **Comercial** só a quem `canConfigureModule(user,
  'comercial')` — super, role admin ou **administrador do módulo Comercial** (`admin_modulos`). É exatamente o `tambemAdminDoModuloCom:
  { admin: 'comercial', tela: 'administrativo' }` do `exigirComercialNoModeloDaProposta` (B958).
- **Ninguém chama** `GET .../variaveis/:chave/opcoes` nem `PUT .../opcoes/:id` (são do mesmo recurso que a tela *Opções por família* usa).
  `GET /:id/esquematico` também não é chamado (o esquemático é lido pelo estático `/api/uploads/familias-produtos/`).
- **Fora do Comercial e de Configurações, ninguém lê família de produto:** o Almoxarifado usa `/almoxarifado/familias` (outra tabela,
  `familias_material_almoxarifado`); Compras, Engenharia, o MES/Fábrica e o Financeiro não chamam `/familias` (grep no `client/src` inteiro;
  o `src/` e o `backend/` da raiz não citam). **Servidor:** nenhum template ou serviço busca `/api/familias` por HTTP (o PDF e o preview leem
  o banco direto); as fotos saem pelo estático `/api/uploads/familias-produtos/`, fora de qualquer portão.

### A lista de OS do Operacional (C345)

- `GET /api/operacional/ordens-servico` — `checkModulePermission('operacional')` (a régua antiga). Chamada só por `OrdensServico`
  (`/fabrica/ordens-servico`) e `AtividadeForm` (dentro de `AtividadesColaboradores`, `/fabrica/atividades`) — as duas no portão de tela do
  **Operacional**. O Comercial lê a sua (`GET /api/comercial/ordens-servico`, 146).
- **A régua antiga × a da tela, no Operacional:** a antiga lê a direta com `grupo_id IS NULL OR grupo_id = 0`; a da tela, só `IS NULL`. Fora
  isso as duas concordam (usuário sem grupo e sem linha do Operacional: as duas barram — o Operacional não está nos liberados sem linha;
  grupo ativo com a linha: as duas deixam). **A da tela é estritamente mais estreita, e só na direta com `grupo_id = 0`** (C345).
- **C332** (o `proximo-numero` e o `POST /os-itens`, régua antiga, chamados pelo `OSComercialForm` do Comercial): **fora** — abrir para o
  Comercial é decidir quem cria OS (**C277**, do P.O.).

### Banco local (cópia de 09/10 do `CRM/server/data`, lida numa cópia no scratchpad — `scratchpad/e149/medir.js`)

**10** usuários ativos, **4** super/admin (2, 5, 13, 14), **0** grupos, **0** `admin_modulos` preenchidos, **0** permissões com `grupo_id = 0`.
Com o Comercial: 3, 9 (e os super). Sem o Comercial: **7** (Compras + Almoxarifado), **8** (Engenharia / Projetos), **12** (Almoxarifado),
**15** (Almoxarifado + Compras) — os **mesmos 4** da A93/A95/A96; a tela já os barra do Comercial e nenhum é administrador do Comercial.
**15** famílias (10 ativas). **0** listas de preço. Na lista de OS: **ninguém** perde (nenhuma linha com `grupo_id = 0`).

### A criação de lista de preço (resto da C341)

`POST /api/comercial/listas-precos` grava a lista e depois as linhas por um statement preparado **sem callback** (`stmt.run` no laço) e
responde **201** no `finalize`. A falha de uma linha vira o evento `error` do statement (sem ouvinte) — o mesmo defeito da C318/C323: a
rota responde "importada (N itens)" com linhas a menos. *(A medir no TDD — vermelho esperado: 201 com menos linhas.)* A tela
(`ListaPrecos.onArquivo`) mostra `err.response.data.error` num toast — a frase nova chega sem mexer no client.

**Desempenho medido** (`scratchpad/e149/bench.js`, 10 000 linhas, WAL + `synchronous = NORMAL` como o servidor): o de hoje **314 ms**; o
`gravarItensEmSequencia` (`db.run` em sequência) **490 ms**; statement com callback em sequência 349 ms. A diferença (≈ 0,02 ms por linha)
não pesa perto do limite de 30 s do client; fica o `gravarItensEmSequencia` — o mesmo das 145–147, e a falha injetada pelo
`falhaSqlInjetada` (que intercepta `db.run`) alcança.

## Regras de negócio

- **RN-149.01 — as 13 rotas do cadastro de família que só o Comercial usa exigem o Comercial pela régua da tela (C343).** O
  `exigirComercialNasPropostas` logo depois do `authenticateToken` (antes do multer na foto e no esquemático: o arquivo do barrado não chega ao
  disco): `GET /api/familias`, `GET /familias`, `POST /api/familias`, `POST /familias`, `PUT /api/familias/:id`, `DELETE /api/familias/:id`,
  `POST /:id/foto`, `POST /:id/foto-base64`, `GET /:id/esquematico`, `POST /:id/esquematico`, `POST /:id/esquematico-base64`,
  `PUT /:familiaId/variaveis`, `GET /:familiaId/opcoes-variaveis-from-produtos`. Recusa: **403** `{ "error": "Acesso negado ao módulo",
  "modulo": "comercial" }` e a linha `acesso_negado` no log (`modulo = 'comercial'`). `SQLITE_BUSY` ao ler as linhas → **503**
  (`context: 'portao:propostas'`); outro erro → **500** *"Erro ao verificar permissões"*.
- **RN-149.02 — as 8 rotas que Configurações também usa aceitam o caminho de Configurações.** Um portão novo,
  `exigirComercialNaFamiliaPorConfiguracoes = portaoDasPropostas.exigir('comercial', { tambemAdminDoModuloCom: { admin: 'comercial', tela:
  'administrativo' } })` (a régua do modelo da proposta, B958): `GET /api/familias/todas`, `GET /api/familias/:id`, `GET
  /:familiaId/variaveis`, `GET /:familiaId/opcoes-variaveis`, `GET` e `POST /:familiaId/variaveis/:variavelChave/opcoes`, `PUT` e `DELETE
  .../opcoes/:id`. Recusa e erros como na RN-149.01 (o mesmo corpo, `modulo: 'comercial'`).
- **RN-149.03 — clonar família não muda.** `POST /api/familias/:id/clonar` continua só do administrador (`isAdminUser`, *"Apenas
  administradores podem clonar famílias"*), sem o portão.
- **RN-149.04 — a lista de OS do Operacional exige o Operacional pela régua da tela (C345).** `exigirOperacionalNaListaDeOS =
  portaoDasPropostas.exigir('operacional')` no lugar do `checkModulePermission('operacional')`. Recusa: **403** `{ "error": "Acesso negado ao
  módulo", "modulo": "operacional" }` (o mesmo corpo de antes) e a linha no log com `modulo = 'operacional'`. BUSY → **503**
  (`portao:propostas`, novo — antes 500); outro erro → **500** *"Erro ao verificar permissões"* (o de antes).
- **RN-149.05 — o mesmo interruptor, devolvendo o de antes.** `PROPOSTAS_PORTAO_DE_MODULO=desligado` (B946): as 21 de família voltam a
  pedir só o login; a lista de OS volta à **régua antiga** (`checkModulePermission('operacional')`) — **não** a só login (desligar não pode abrir
  mais do que havia antes da etapa). O aviso do boot cita o cadastro de família e a lista de OS do Operacional (mantendo
  `PROPOSTAS_PORTAO_DE_MODULO=desligado`, "modelo da proposta", "listas de preço", "ordem de serviço pelo número", "modelo de contrato por
  família", que os testes da 147/148 prendem).
- **RN-149.06 — a lista de preço só é criada com todas as linhas (resto da C341).** As linhas pelo `gravarItensEmSequencia` (rótulo `Linhas
  da lista de preços`); a resposta **201** `{ id, total_itens }` só depois da última. Na falha de uma linha: apaga as linhas gravadas e a lista
  (`DELETE ... WHERE lista_id = ?`, depois `DELETE FROM listas_precos WHERE id = ?`) e responde **500** *"Erro ao gravar as linhas da lista de
  preços (<msg>). A lista não foi criada — importe a planilha de novo."*; com `SQLITE_BUSY` e o desfazer feito → **503**
  (`context: 'listas-precos'`, o client repete sozinho — a rota é repetível porque nada ficou). Se o desfazer também falha → **500** *"Erro ao
  gravar as linhas da lista de preços (<msg>). A lista "<nome>" ficou incompleta — exclua-a e importe a planilha de novo."* (sem 503). A
  falha ao gravar a **lista** (antes das linhas) continua **500** com a mensagem do banco; o BUSY nela, **503** (Fase 2 M-3). Uma linha que não
  vira texto → **400** *"A linha N da planilha não pôde ser lida (<msg>). A lista não foi criada."*, antes de gravar (Fase 2 M-2). O nome da
  frase é o gravado (aparado, M-5). Os 400 de hoje não mudam.

## Contratos de API (congelados)

| Rota | Caso | Status | Corpo / mensagem literal |
|---|---|---|---|
| as 21 de família | sem o Comercial pela régua da tela (e, nas 8, sem o caminho de Configurações) | 403 | `{ "error": "Acesso negado ao módulo", "modulo": "comercial" }` |
| `GET /api/operacional/ordens-servico` | sem o Operacional pela régua da tela | 403 | `{ "error": "Acesso negado ao módulo", "modulo": "operacional" }` |
| as 22 | `SQLITE_BUSY` ao ler as permissões | 503 | o corpo do `respondDbError` com `context: 'portao:propostas'` |
| as 22 | outro erro ao ler as permissões | 500 | `{ "error": "Erro ao verificar permissões" }` |
| `POST /api/familias/:id/clonar` | não administrador | 403 | `{ "error": "Apenas administradores podem clonar famílias" }` (sem mudança) |
| `POST /api/comercial/listas-precos` | uma linha falha, desfazer feito | 500 | `Erro ao gravar as linhas da lista de preços (<msg>). A lista não foi criada — importe a planilha de novo.` |
| idem | `SQLITE_BUSY` numa linha, desfazer feito | 503 | o corpo do `respondDbError` com `context: 'listas-precos'` |
| idem | `SQLITE_BUSY` ao gravar a lista | 503 | o corpo do `respondDbError` com `context: 'listas-precos'` |
| idem | uma linha que não vira texto | 400 | `A linha N da planilha não pôde ser lida (<msg>). A lista não foi criada.` |
| idem | uma linha falha e o desfazer falha (também no BUSY) | 500 | `Erro ao gravar as linhas da lista de preços (<msg>). A lista "<nome>" ficou incompleta — exclua-a e importe a planilha de novo.` |

As respostas de sucesso não mudam (corpo e status).

## Tasks (sort topológico)

- [x] **T1 — `9f49aa02` — tronco — o portão nas 21 de família e na lista de OS (RN-149.01–05).** `index.js`: os dois portões novos junto dos outros
  (`exigirComercialNaFamiliaPorConfiguracoes`, `exigirOperacionalNaListaDeOS` — este escolhe a régua antiga quando desligado); o portão como
  2º middleware nas 21 e na lista; o aviso do boot.
- [x] **T2 — `c98a45be` (Fase 5: `e387a330`, em blocos) — independente da regra, mas no mesmo `index.js` (executada depois de T1, na mesma árvore) — a lista de preço (RN-149.06).**
- [x] **T3a — `9f49aa02` (Fase 5: `e387a330`) — (depois de T1) — `tests/api/familiasListaOsPortao.api.test.js`, pelo `index.js` real (pasta vazia), molde do
  `osModeloContratoPortao`:** pelo fonte (as 21 com o portão certo como 2º middleware, o clonar sem ele, nenhum registro fora do `index.js`,
  nenhum `app.use` no prefixo, a definição dos dois portões); o barrado (só o Almoxarifado) toma 403 em **cada uma** das 22 com o corpo certo e
  nada muda (retrato de `familias_produto`, `familia_variaveis`, `familia_variavel_opcoes`, a pasta `uploads`; o log conta 21 `comercial` + 1
  `operacional`); a foto multipart do barrado não chega ao disco; a tabela por usuário (abaixo) com a decisão da tela calculada pelo
  `temModuloComoATela` / `passaPeloCaminhoDeConfiguracoes`; **as metades positivas, pela rota, em fluxo**: o Comercial faz o cadastro inteiro
  (criar → renomear → foto-base64 → variáveis → opção → apagar); o administrador do Comercial com o Administrativo faz o fluxo de *Opções por
  família* e do *Template de proposta* (todas → `:id` → variáveis → opções → cria e apaga uma opção) e toma 403 no cadastro (`PUT /:id`,
  `GET /familias`); o Operacional lê a lista de OS; ninguém que passa vira "acesso negado" no log; o desligado (as 21 abrem; a lista volta à
  régua antiga — a direta com `grupo_id = 0` passa e o só-Almoxarifado continua 403); o BUSY/500 numa de cada portão.
- [x] **T3b — `c98a45be` (Fase 5: `e387a330`; os cenários passaram a usar 200–250 linhas, em blocos) — (depois de T2) — `tests/api/listaPrecosGrava.api.test.js`:** criar com uma linha recusada no meio (gatilho `RAISE(ABORT)` na
  3ª de 5 — vale antes e depois do código) → 500 literal, nenhuma lista e nenhuma linha; o BUSY na 3ª (falha injetada, `FALHA_SQL_PULAR`) →
  503 e nada; o desfazer que falha → a frase "ficou incompleta" com o nome; o caminho feliz (201, `total_itens`, as linhas na ordem, a busca);
  **o fluxo da tela pela rota**: criar → `GET` da lista → `GET /:id/itens` com busca → `DELETE`.

**Tabela por usuário (T3a)** — colunas: cadastro (13) / Configurações (8) / lista de OS:

| Usuário | Cadastro | Configurações | Lista de OS |
|---|---|---|---|
| sem nada (sem linha) | 200 | 200 | 403 |
| direta do Comercial | 200 | 200 | 403 |
| grupo ativo com o Comercial | 200 | 200 | 403 |
| grupo ativo sem linha | 200 | 200 | 403 |
| super / role admin (com só a direta do Almoxarifado) | 200 | 200 | 200 |
| só a direta do Operacional | 403 | 403 | 200 |
| grupo ativo com o Operacional | 403 | 403 | 200 |
| Operacional só num grupo inativo (+ direta do Almoxarifado) | 403 | 403 | 403 |
| Operacional com permissão 0 | 403 | 403 | 403 |
| Comercial com permissão 0 | 403 | 403 | 403 |
| só a direta do Almoxarifado | 403 | 403 | 403 |
| só a direta de Engenharia / Projetos | 403 | 403 | 403 |
| administrador do módulo Comercial + direta do Administrativo | 403 | **200** | 403 |
| administrador do módulo Comercial **sem** o Administrativo (+ direta do Almoxarifado) | 403 | 403 | 403 |
| direta do Administrativo, sem ser administrador do Comercial | 403 | 403 | 403 |
| direta do Operacional com `grupo_id = 0` + direta do Almoxarifado (C345) | 403 | 403 | **403** (antes 200) |

## Decisões (vão para a letra B)

- **B971** — o cadastro de família em duas réguas: as 8 rotas que Configurações usa (*Template de proposta* e *Opções por família*) aceitam
  também o administrador do Comercial com o Administrativo; as outras 13, só o Comercial. Descartado: (a) o Comercial só nas 21 (trancaria fora
  quem a tela deixa editar as opções por Configurações); (b) o caminho de Configurações nas 21 (abriria o cadastro de família inteiro a quem a
  tela só deixa mexer nas opções); (c) leitura mais larga que a escrita (nenhuma tela fora do Comercial e de Configurações lê família —
  medido); (d) fechar junto grupos de produto, produtos e variáveis técnicas (também só login — **C346**, **C347**; outros leitores, etapa
  própria). *Fase 5 (r1 M-3):* (e) exigir **só** o caminho de Configurações nas 4 escritas das opções (quem tem o Comercial já mexe na
  família inteira pelo cadastro).
- **B972** — os dois apelidos sem `/api` (`GET`/`POST /familias`) recebem o mesmo portão do par com `/api`. Descartado: apagar os apelidos
  (quem configura a URL da API sem o `/api` perderia o cadastro; não medido em produção).
- **B973** — clonar continua só do administrador, sem o portão. Descartado: pôr o portão antes (não muda quem passa — o administrador passa
  pelos dois — e trocaria a frase de quem não é administrador).
- **B974** — a lista de OS do Operacional pela régua da tela (`exigir('operacional')`); com o portão desligado volta à **régua antiga**, não ao
  só login. Descartado: (a) aceitar também o Comercial (nenhuma tela do Comercial lê esta lista — tem a sua); (b) o desligado abrindo a só
  login (desligar abriria a lista a todo logado, mais do que antes da etapa); (c) alinhar junto o `proximo-numero`, os itens, o `PUT`/`DELETE`
  (régua antiga, **C332**/**B969** — o `proximo-numero` e os itens são da criação da OS, **C277**, do P.O.).
- **B975** — a lista de preço que falha numa linha é desfeita inteira (a lista e as linhas), não fica pela metade. Descartado: (a) guardar a
  lista com as linhas que gravaram e avisar (a busca acharia preço de uma lista incompleta sem ninguém saber); (b) transação (B948: a conexão é
  uma só); (c) mudar o client (a frase chega pelo toast que já existe). *Fase 5:* (d) uma linha por vez — 2,3× mais lento pela rota (r1 M-1);
  em blocos de 100.
- **B976** — a próxima etapa (150).

## Avisos novos (C)

- **C346** — grupos de produto (`/api/grupos*` e o apelido `GET /grupos`, 8 registros) e produtos (`/api/produtos*`, 11) só pedem o login
  (a medir na Fase 0: leitores fora do Comercial — a OS, o Almoxarifado?).
- **C347** — as variáveis técnicas (`/api/variaveis-tecnicas*`, 7 — a aba *Variáveis técnicas* de Configurações → Comercial) só pedem o login.

## Execução

- **Linha de base** (a árvore da main `dab46528`, antes de qualquer código): `test:api` **469/469**.
- **TDD, vermelho medido:** `familiasListaOsPortao` contra o `index.js` da main **2 passed, 7 failed** (o barrado tomava **200** nas 22, o
  administrador do Comercial em Configurações renomeava a família, o só-Operacional lia as famílias, o aviso do boot não citava o cadastro;
  os 2 verdes eram o cadastro pelo Comercial e o clonar, que valem antes e depois). `listaPrecosGrava` contra o `index.js` só com a T1 **1
  passed, 4 failed** — a lista com a 3ª de 5 linhas recusada pelo gatilho respondia **201** `{ total_itens: 5 }` (a C341 reproduzida), a linha
  ilegível dava **500** com a lista gravada.
- **Divergências do plano:** (1) as RN e os contratos foram ajustados pela Fase 2 antes do código (acima); (2) **as linhas da lista de preço
  em blocos de 100** (`gravarLinhasDaListaEmBlocos`), não pelo `gravarItensEmSequencia` — a Fase 5 r1 mediu pela rota que uma por uma era
  **2,3×** mais lento que antes (100 000 linhas: 16,5 s × 7,3 s); o "≈ 0,02 ms por linha" do bench da Fase 0 **estava errado** (o bench isolado
  não pagava o custo por pedido do servidor). Em blocos: **0,9 s** (medido pela rota, `scratchpad/e149/tempo-lista.js`; o de antes, 7,3 s na
  mesma máquina). Os cenários do gatilho e do BUSY passaram a usar 200–250 linhas (o bloco que falha não grava nenhuma linha dele — com 5
  linhas o desfazer não teria o que apagar); (3) a coluna ilegível ganhou frase própria (r1 M-2); (4) T1 e T2 em commits separados — o
  `index.js` só com a T1 verificado à parte (`familiasListaOsPortao` 9/0) antes do 1º commit.
- **Controles K1–K11 (antes de `9f49aa02`/`c98a45be`, `scratchpad/e149/sabota.js`, um por vez sob a trava):** o portão tirado do `GET
  /familias`; o portão depois do multer na foto; Configurações sem o caminho; o `PUT /:id` com o portão largo; a lista com a régua antiga; o
  desligado abrindo a lista; o `DELETE` da opção só com o Comercial; o desfazer que não apaga a lista; o BUSY antes do desfazer falho; o nome
  não aparado; o 201 sempre — **todos caíram pela asserção do ponto** (o K2 pelo "chegou ao disco"), md5 restaurado em todos.
- **Suíte antes de `9f49aa02`/`c98a45be`** (a árvore com os dois): `test:api` **471/471**; `test:almoxarifado` **44/0**;
  `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; revisão obrigatória da proposta **23/23** + as rotas (21/0, 11/0, 11/0, 8/0, 26/0,
  15/0, 7/0, 8/0) + editor **39/39**; client **143** suítes / **1856** testes; `CI=true build` *Compiled successfully*.
- **A97** rodada no banco local (cópia de 09/10): a 1 com os **4** de sempre (7, 8, 12, 15 — "o cadastro e as opções por família"), a 2
  **vazia**; controle numa cópia com o 7 ganhando o administrador do Comercial e o Administrativo, o 12 o Operacional só no grupo 0 e o 15 no
  grupo 0 e direto: a 1 marcou o 7 como "só o cadastro", a 2 achou só o 12.

## Fase 5 — três revisores frescos em paralelo, sob a trava

- **Regra (r1): 0 Critical, 0 Important, 3 Minor — todos reais e reproduzidos.** **M-1** a importação uma linha por vez 2,3× mais lenta pela
  rota (acima — virou blocos); **M-2** o nome de coluna ilegível culpava a linha 1 (frase da coluna); **M-3** as escritas das opções por família
  aceitam o Comercial, que a tela de Configurações não exige — coerente (o Comercial já mexe na família inteira), escrito como descarte (d) da
  B971. Conferido igual ao de antes, byte a byte, para quem a tela deixa passar: 35 chamadas do cadastro (ligado, desligado e a main), a lista
  de preço com `null`, números, objetos, colunas que faltam, nomes com espaço; o 403 antes do 404, do 400 e do multer.
- **Autorização (r2): 0 achados.** 25 perfis (grupos inativos, permissão 0/2/'1', grupo 0, `admin_modulos` malformado, super sem role,
  `ADMIN` maiúsculo, perfil de almoxarifado, frota, rebaixado na hora, desativado) contra a decisão da tela tirada de cópias do código real
  do client (`hasModuleAccess`, `canConfigureModule`, `modulosConfiguraveis`) — 0 diferenças; maiúsculas, barra final, `;x`, `%2F`, HEAD,
  OPTIONS, override — nada escapa; o desligado nunca abre mais que antes; nenhuma tela legítima perde.
- **Sabotagem (r3, worktree própria `CRM-wt-e149-r3`, removida): 37 sabotagens novas — 31 caíram, 6 sobreviveram, 0 equivalentes, 0 defeitos.**
  Sobreviventes (falta de asserção): **L2** a busca sem minúsculas (o `LIKE` do SQLite só ignora caixa em ASCII — com acento a busca deixaria
  de achar); **L3b** a busca sem uma coluna; **L8** o `DELETE` da lista engolido no desfazer (diria "não foi criada" com a lista lá); **L10** a
  lista gravada antes do 400 (o teste conferia sem pausa); **R15** o texto do aviso do boot; **R16** o aviso com o portão ligado. Coberturas de
  uma asserção só: **R2** (o `PUT` das variáveis pelo caminho de Configurações, só pela fonte) e **R18** (a varredura do fonte não via caminho
  em lista). Todos viraram cenário.
- **Controles da Fase 5, rodados por mim:** **K12** (o último bloco pulado), **K13** (a conferência das colunas tirada), **K14** (blocos de
  1000), **K15** (o `DELETE` da lista engolido), **K16**/**K16b** (a busca sem minúsculas / sem a última coluna), **K17** (o aviso dizendo "só o
  login"), **K18** (o aviso sempre), **K19** (o `PUT` das variáveis com o portão largo) e K8–K11 de novo sobre os blocos — **todos caíram pela
  asserção do ponto** (o K19 também pela execução), md5 restaurado.
- **Fase 5 — `e387a330`.** `familiasListaOsPortao` com 9 cenários; `listaPrecosGrava` com 6.
- **Suíte antes de `e387a330`:** `test:api` **471/471**; `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0,
  16/0**; revisão obrigatória da proposta **23/23** + as rotas (21/0, 11/0, 11/0, 8/0, 26/0, 15/0, 7/0, 8/0) + editor **39/39**; client **143**
  suítes / **1856** testes; `CI=true build` *Compiled successfully*. É também a verificação do fechamento (depois dela só mudaram documentos).

## Retro (4 números)

1. **Rodadas de correção até verde:** **2** — antes do primeiro commit (o escape de uma regex no teste da lista) e a Fase 5 (os blocos e as
   asserções do r3). Testes antigos mudados: **0**.
2. **Achados da revisão:** Fase 2 — **0 Critical + 0 Important + 7 Minor, todos reais**. Fase 5 — r1 **3** Minor reais (um de desempenho,
   medido pela rota, que derrubou um número da Fase 0); r2 **0**; r3 **6** sobreviventes reais + 2 coberturas frágeis; **0** ruído. **O que mais
   pesou:** o bench isolado da Fase 0 ("≈ 0,02 ms por linha") — pela rota deu 4× isso; medir pelo caminho de verdade, não por um modelo dele.
3. **Paralelismo:** **0** galhos em paralelo de fato (T1 e T2 dividem o `index.js`); **0** retrabalho; **1** revisor na Fase 2, **3** em
   paralelo na Fase 5 sob a trava (o r3 numa worktree própria, removida).
4. **Defeito que escapou:** *(preencher na Etapa 150)*.

## Próxima tarefa detalhada — Etapa 150

*(A série desta etapa foi B971–B976, C346–C347, A97 — a 150 começa em **B977**, **C348**, **A98**; confira com `grep -oE` antes.)*

**Escolhida: a C346 + a C347 — grupos de produto, produtos e variáveis técnicas pelo módulo.** (1) **Grupos de produto** (`index.js`,
`/api/grupos*` e o apelido `GET /grupos`, 8 registros, só login): chamados por `GruposProdutos`, `FamiliasDoGrupo`, `ModalFamiliaForm`,
`ModalGrupoForm` — medir onde cada um está montado. (2) **Produtos** (`/api/produtos*`, 11, só login) — **a Fase 0 é a parte grande: os
leitores não são só do Comercial.** Já achados por grep no fechamento da 149 (sem medir rota por rota): `BuscaGlobal` e `Layout` (a busca
global, em **todos** os módulos), `OSDetalhesForm` e `PreviewOSEditavel` (a OS — Comercial **e** Fábrica), `OSComercialForm`,
`GerarPropostaModal`, `ModalSelecaoTipoProduto`, `PreviewPropostaEditavel`, `ProdutoForm`, `Produtos`, `ProdutosPorFamilia`,
`SelecaoProdutosPremium`, `PropostaForm` — medir rota por rota quem chama (a busca global e a leitura pela OS provavelmente pedem régua mais
larga que as escritas: decidir medindo, registrar em B), se o servidor busca `/api/produtos` por HTTP (o PDF da OS busca a **imagem** pelo
estático) e se o Almoxarifado ou Compras leem. (3) **Variáveis técnicas** (`/api/variaveis-tecnicas*`, 7, só login): `VariaveisTecnicas` (só
em Configurações → Comercial — o caminho da 147), `ConfigTemplateProposta`, `ModalFamiliaForm`, `ProdutoForm`, `SelecaoProdutosPremium` —
leitura pelo Comercial e por Configurações; escrita só pela tela de Configurações (decidir: o Comercial também, como as opções por família —
B971 (d)). Molde de teste: `familiasListaOsPortao.api.test.js` (o portão de duas réguas, os apelidos, a tabela por usuário, o log de quem
passa, o desligado). Uma consulta **A98** no molde da A97 se houver gente que perde.

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 148 (que já inclui a da 147, 146, 145 e a **C330**) — **B853**/**C279**,
**B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela de
conversões e o grupo acima de família, a régua do tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**,
**C117**/**C118**, **C139**, **C278**; na 05, os itens de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por
cliente e previsto × realizado; na 22, **B13**, **B101**/G30, **G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62; nas
propostas, a verificação do dono da proposta (Fase 12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a
Frente B da lentidão, a **C297** (**B924**), a **B926**, a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**; no
Operacional, a **C332** (o número da próxima OS e os itens são da criação da OS, **C277**). Pendem de Postgres: **C98**, **C110**. *(Nada novo
para o P.O. nesta etapa: as decisões B971–B975 são reversíveis e estão na letra B.)*

**O que já está pronto e não precisa reabrir:** o `exigirComercialNasPropostas` nas 13 do cadastro de família e o
`exigirComercialNaFamiliaPorConfiguracoes` nas 8 que Configurações usa; o `exigirOperacionalNaListaDeOS` na lista de OS (a régua antiga quando
desligado); a lista de preço em blocos com o desfazer (`gravarLinhasDaListaEmBlocos`, `desfazerListaDePrecosCriada`); os testes
`familiasListaOsPortao` (9) e `listaPrecosGrava` (6).
