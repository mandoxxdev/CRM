# Etapa 148 (Comercial/Operacional): a ordem de serviço pelo número e o modelo de contrato por família exigem o módulo pela régua da tela, e as cláusulas de uma proposta que não existe dizem "não encontrada" (C335, C341, C342) — plano

> Origem: "Próxima tarefa detalhada — Etapa 148" do plano da 147
> (`docs/superpowers/plans/2026-10-18-almoxarifado-etapa147-o-modulo-no-modelo-e-nas-listas.md`). A etapa é pequena; o design, com a
> Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-18): última B **B964**, último C
> **C342**, última A **A95**. Esta etapa: **B965+**, **C343+**, **A96+**. Worktree `CRM-wt-e148`, branch `etapa-e148` (da main `50031f45`).
>
> **Trava de máquina:** `scratchpad/e148-lock.sh` (o diretório `maquina-testes.lock` de sempre). Um arquivo de teste de servidor por vez,
> inclusive os revisores. Revisão obrigatória da proposta: `scratchpad/e148/review-proposta.sh` (23 + editor 39 + as rotas). A etapa
> **não** toca o template nem o client; toca o `index.js` (o portão nas 8 rotas, o aviso do boot, a conferência da proposta nas duas
> rotas das cláusulas) e o teste de texto `uploadsProtegidos.api.test.js` (que prende o registro exato do PDF da OS).
>
> **Fase 2 (um revisor fresco, só leitura): 0 Critical, 3 Important, 7 Minor — todos aceitos antes do código, com o que mudou:**
> **I-1** a RN-148.05 punha a conferência da proposta **antes** do 400 do corpo do `reordenar` (o teste já escrito e o código de hoje
> validam o corpo primeiro) → a ordem é portão → 400 do corpo → existe? → resto. **I-2** T1 e T2 dividem o `index.js` → executadas em
> sequência, na mesma árvore, e as sabotagens nunca em paralelo com a suíte. **I-3** o portão fecha a troca **direta** do modelo de
> contrato, mas o `resolverModeloClausulas` liga item e família **pelo nome** e renomear/clonar família (só login; o clonar copia o
> `clausulas_modelo_id`) ainda mudam o modelo efetivo → escrito na B966 e na **C343**. *(No fechamento: o clonar **não** é só login — é
> `isAdminUser` desde antes (`index.js`, `POST /api/familias/:id/clonar`); essa parte do achado estava errada e saiu da C343. Renomear
> continua: `PUT /api/familias/:id` só pede login.)* **M-1** o aviso do boot diria "não exigem o
> Comercial" para a OS → a frase nova diz "o Comercial ou o Operacional". **M-2** o `gerar-pdf` busca também o logo de reserva
> `/Logo_MY.jpg` por HTTP (estático do client, fora do portão) → citado na Fase 0. **M-3** o 503 das cláusulas com `context:
> 'propostas:clausulas'` na tabela. **M-4** a decisão da tela era calculada só pelo servidor → 3 casos novos na tabela compartilhada
> `portaoComoATela.casos.json` (roda contra o `hasModuleAccess` do client também). **M-5** o `ModalFamiliaForm` engole o 403 do modelo
> (`.catch(() => {})`) → **C344**. **M-6** o log do 403 é gravado sem a rota esperar → o teste espera antes de contar (já esperava).
> **M-7** a criação da OS (só login, **C277**) aceita quem o `gerar-pdf` passa a recusar → uma linha na B969. E a linha nova da tabela
> por usuário: a direta do Operacional com `grupo_id = 0` (a régua antiga a lê; a tela não) → 403/403.

## Fase 0 — medido (antes de qualquer código)

### As rotas (lidas no `index.js`; nenhuma fora dele — `routes/`, `services/` não citam)

- **C341 — 3 do modelo de contrato por família**, só `authenticateToken`: `GET /api/clausulas-modelos` (a lista para o select),
  `GET /api/clausulas-modelos/:id/clausulas` (as cláusulas de um modelo) e `PUT /api/familias/:id/clausulas-modelo` (troca o modelo da
  família — decide as cláusulas de **toda proposta nova** dela, pelo `resolverModeloClausulas`). Contagem pelo padrão do plano da 147
  (`app.(get|post|put|delete)('/api/clausulas-modelo`): **2** + a da família = **3**.
- **C335 — 5 da OS pelo número**, só `authenticateToken`: `GET /api/operacional/ordens-servico/:id` (a OS inteira, 56 campos e o valor),
  `GET /api/operacional/ordens-servico/:id/itens`, `GET /api/operacional/os-itens/:os_id` (o mesmo SELECT), `GET .../:id/pdf`
  (`servirPdfOs`, Etapa 81) e `POST .../:id/gerar-pdf` (gera o PDF com o Chromium e grava `pdf_url`).
- **Vizinhas, fora do escopo (medidas):** a lista `GET /api/operacional/ordens-servico`, o `proximo-numero`, o `PUT`/`DELETE` da OS e o
  `POST`/`PUT`/`DELETE` dos itens usam o `checkModulePermission('operacional')` (a régua antiga); o `POST` da OS tem um portão que deixa
  todos passarem ou dá 500 num banco novo (**C277**, do P.O.); a lista do Comercial (`GET /api/comercial/ordens-servico`) já usa o
  `exigirComercialNasPropostas` (146). As outras 20 rotas `/api/familias*` — 19 só pedem o login, o clonar é `isAdminUser` (**C343**, nova).

### Quem chama (client e servidor)

- **Modelo de contrato:** só o `ModalFamiliaForm` (`GET /clausulas-modelos` ao abrir; `PUT /familias/:id/clausulas-modelo` ao salvar,
  com `.catch(() => {})`). Ninguém chama `GET /clausulas-modelos/:id/clausulas`. O modal só é montado pelo `FamiliasDoGrupo`
  (`/comercial/produtos/grupo/:grupoId`, portão de tela `comercial`) — o `FamiliasProdutos` também o importa, mas **nenhum arquivo importa
  o `FamiliasProdutos`** (código morto). Os outros caminhos para famílias (`GruposProdutos`, `Produtos`, `ProdutosPorFamilia`) navegam
  para `/comercial/produtos/...`. **Nenhum caminho por Configurações** (o `OpcoesPorFamilia` de Configurações não chama essas rotas).
- **OS pelo número:** `OSFormPage` (`GET /:id`) → `OSDetalhesForm` (`GET /:id/itens`, `GET /:id/pdf` pelo `baixarArquivoProtegido`,
  `POST /:id/gerar-pdf`) — montado em **`/comercial/ordens-servico/editar/:id`** (portão de tela `comercial`) **e**
  **`/fabrica/ordens-servico/editar/:id`** (portão de tela `operacional`); `OSComercialForm` (`/comercial/ordens-servico/nova/:propostaId`)
  chama o `gerar-pdf` depois de criar. **Ninguém chama `GET /os-itens/:os_id`** (só o `POST /os-itens`). O MES (`/fabrica`) e o
  Almoxarifado não chamam (o Almoxarifado lê `/almoxarifado/aux/ordens-servico`, outra rota).
- **Servidor (o PDF da OS):** o `gerar-pdf` lê tudo do banco e monta o HTML com `page.setContent` (nada servido por rota); a única busca
  HTTP interna é a da imagem do produto, `${API_URL || http://localhost:PORT}/api/uploads/produtos/<arquivo>` (método 2, só quando o arquivo
  não está no disco) — montagem `express.static`, fora de qualquer portão; e o logo de reserva `${API_URL || localhost}/Logo_MY.jpg`
  (estático do client, Fase 2 M-2). **O portão não quebra o PDF** — prova pela rota (RN-148.04).
- **Testes existentes que tocam:** `uploadsProtegidos.api.test.js` prende o registro **literal**
  `app.get('/api/operacional/ordens-servico/:id/pdf', authenticateToken, servirPdfOs)` — muda junto (o handler continua o testado);
  `filaPdfFiacao`, `pdfOsNomeArquivo`, `pdfOsRodape` procuram o prefixo `app.post('/api/operacional/ordens-servico/:id/gerar-pdf'` (não muda).

### A régua: por que "a da tela" e por que esta

O usuário só chega a essas chamadas por uma tela. A tela da família exige o **Comercial**; a da OS pelo número, o **Comercial ou o
Operacional** — pela régua da tela (`hasModuleAccess`, a do `temModuloComoATela`, Etapa 145). O portão com a mesma régua barra **só** quem a
tela já barra — **ninguém que usa perde**. A régua antiga (`checkModulePermission`/`checkAnyModulePermission`) **não fecharia nada** no
banco medido: libera o Comercial a todo usuário sem grupo (B63) e o banco tem 0 grupos.

### Banco local (cópia de 09/10 do `CRM/server/data`, lida numa cópia no scratchpad)

**10** usuários ativos, **4** super/admin (2, 5, 13, 14), **0** grupos, **0** `admin_modulos`. Com o Comercial e o Operacional: 3, 9 (e os
super). Sem os dois: **7** (Compras + Almoxarifado), **8** (Engenharia / Projetos), **12** (Almoxarifado), **15** (Almoxarifado + Compras) —
os **mesmos 4** da A93/A95; a tela já os barra do Comercial e da Fábrica. **1** OS, **1** item de OS; **2** modelos de contrato
(`Equipamentos` padrão, `Hélices e Discos`), **0** famílias com modelo próprio. A OS não guarda quem a criou (só `responsavel_id`).

### As cláusulas de uma proposta que não existe (C342, lido no código e na sonda da 147)

`POST /api/propostas/:id/clausulas/inicializar` com id que não existe: a contagem dá 0, copia, e a 1ª inserção falha pela chave
estrangeira → **500** *"Erro ao copiar as cláusulas da proposta (SQLITE_CONSTRAINT: FOREIGN KEY constraint failed). Nenhuma cláusula foi
gravada — salve de novo."* `PUT .../clausulas/reordenar`: lê 0 cláusulas, os `UPDATE` não casam nada → **200** `{ ok: true }` e uma linha
no log de edição de uma proposta que não existe. *(**Estava errado** — Fase 5 r3 R17: a tabela do log de edição tem a chave estrangeira para a
proposta e o servidor liga as chaves; o `registrarEdicaoLog` falha calado e nenhuma linha fica, num banco criado com a chave. O commit
`9149c024` repete a frase errada no corpo; a asserção "nenhum log" do teste é equivalente numa pasta vazia, declarada no próprio teste.)*

## Regras de negócio

- **RN-148.01 — as 3 rotas do modelo de contrato por família exigem o Comercial pela régua da tela (C341).** O `exigirComercialNasPropostas`
  (Etapa 145) logo depois do `authenticateToken`. Recusa: **403** `{ "error": "Acesso negado ao módulo", "modulo": "comercial" }` e a linha
  `acesso_negado` no log (`modulo = 'comercial'`, `nome_modulo = 'Comercial'`). `SQLITE_BUSY` ao ler as linhas → **503**
  (`context: 'portao:propostas'`); outro erro → **500** *"Erro ao verificar permissões"*. Sem o caminho de Configurações (a tela da
  família só existe no Comercial).
- **RN-148.02 — as 5 rotas da OS pelo número exigem o Comercial ou o Operacional pela régua da tela (C335).** Um portão novo,
  `exigirComercialOuOperacionalNaOS = portaoDasPropostas.exigir(['comercial', 'operacional'])` (a mesma régua do `GET /api/propostas/:id`,
  B945), logo depois do `authenticateToken`. Recusa: **403** `{ "error": "Acesso negado ao módulo", "modulo": ["comercial", "operacional"] }`
  e a linha no log com `modulo = 'comercial|operacional'`, `nome_modulo = 'Comercial ou Operacional'`. 503/500 como na RN-148.01. O
  `gerar-pdf` barrado não abre o Chromium nem grava `pdf_url`.
- **RN-148.03 — o mesmo interruptor.** `PROPOSTAS_PORTAO_DE_MODULO=desligado` (B946) desliga também as 8; o aviso do boot passa a citar a
  ordem de serviço pelo número e o modelo de contrato por família (mantendo `PROPOSTAS_PORTAO_DE_MODULO=desligado`, "modelo da proposta" e
  "listas de preço", que o teste da 147 prende).
- **RN-148.04 — o PDF da OS continua saindo para quem a tela deixa abrir a OS.** Com o portão ligado: quem tem só o **Operacional** (direta,
  não administrador) e quem tem só o **Comercial** leem a OS e os itens, geram o PDF (`POST .../gerar-pdf` → **200** `{ success: true,
  pdf_url }`) e o baixam (`GET .../pdf` → **200**, começa com `%PDF-`). A imagem do produto que o `gerar-pdf` busca por HTTP interno fica em
  `/api/uploads/produtos/`, que abre sem token (montagem estática).
- **RN-148.05 — copiar ou reordenar as cláusulas de uma proposta que não existe responde "não encontrada" (C342).** No `inicializar` e no
  `reordenar`, antes de tudo, `SELECT id FROM propostas WHERE id = ?`: sem linha → **404** `{ "error": "Proposta não encontrada" }`, nada
  gravado, sem log de edição. Erro ao ler: o `inicializar` responde a frase *"Erro ao copiar as cláusulas da proposta (<msg>). Nenhuma
  cláusula foi gravada — salve de novo."* (BUSY: **503** `propostas:clausulas`); o `reordenar`, *"Erro ao gravar a nova ordem das cláusulas
  (<msg>). A ordem não foi alterada — salve de novo."* (BUSY: **503**). A proposta **inativa** (`ativo = 0`) existe — continua como antes
  (B968). A ordem das conferências (Fase 2 I-1): portão → no `reordenar`, `ordem` que não é lista → o 400 de sempre (sem ler o banco) →
  existe? → o resto, sem mudança (`jaInicializado` no `inicializar`). A conferência é um middleware (`propostaDasClausulasExiste`).

## Contratos de API (congelados)

| Rota | Caso | Status | Corpo / mensagem literal |
|---|---|---|---|
| as 3 do modelo de contrato | sem o Comercial pela régua da tela | 403 | `{ "error": "Acesso negado ao módulo", "modulo": "comercial" }` |
| as 5 da OS pelo número | sem o Comercial e sem o Operacional pela régua da tela | 403 | `{ "error": "Acesso negado ao módulo", "modulo": ["comercial", "operacional"] }` |
| as 8 | `SQLITE_BUSY` ao ler as permissões | 503 | o corpo do `respondDbError` com `context: 'portao:propostas'` |
| as 8 | outro erro ao ler as permissões | 500 | `{ "error": "Erro ao verificar permissões" }` |
| `POST .../clausulas/inicializar`, `PUT .../clausulas/reordenar` | a proposta não existe | 404 | `{ "error": "Proposta não encontrada" }` |
| `POST .../clausulas/inicializar` | erro ao ler a proposta | 500 / 503 (BUSY, `context: 'propostas:clausulas'`) | `Erro ao copiar as cláusulas da proposta (<msg>). Nenhuma cláusula foi gravada — salve de novo.` |
| `PUT .../clausulas/reordenar` | erro ao ler a proposta | 500 / 503 (BUSY, `context: 'propostas:clausulas'`) | `Erro ao gravar a nova ordem das cláusulas (<msg>). A ordem não foi alterada — salve de novo.` |

As respostas de sucesso não mudam (corpo e status).

## Tasks (sort topológico)

- [x] **T1 — `d69a5cf6` — tronco — o portão nas 8 rotas (RN-148.01/02/03).** `index.js`: `const exigirComercialOuOperacionalNaOS =
  portaoDasPropostas.exigir(['comercial', 'operacional']);` junto dos outros; o portão como 2º middleware nas 3 do modelo de contrato
  (`exigirComercialNasPropostas`) e nas 5 da OS; o aviso do boot. O `uploadsProtegidos.api.test.js` passa a esperar
  `authenticateToken, exigirComercialOuOperacionalNaOS` no registro do PDF da OS.
- [x] **T2 — `9149c024` — independente (executada depois de T1, Fase 2 I-2) — a proposta que não existe (RN-148.05).** `index.js`: a conferência no `inicializar` e no `reordenar`.
- [x] **T3a — `d69a5cf6` (Fase 5: `9dccf0dd`, o log de quem passa) — (depois de T1) — teste de integração pelo `index.js` real (pasta vazia), molde do `propostaModeloPortao`:**
  `tests/api/osModeloContratoPortao.api.test.js` — pelo fonte (as 3 e as 5, o portão como 2º middleware, um registro só, nenhuma fora do
  `index.js`, a definição do portão novo); o barrado (só o Almoxarifado) toma 403 em **cada uma** das 8 com o corpo certo e nada muda
  (retrato de `familias_produto`, `ordens_servico`, `os_itens`, `clausulas_modelo*`, a pasta `uploads/ordens-servico`; o log conta 3
  `comercial` + 5 `comercial|operacional`); por usuário (a tabela abaixo), com a decisão da tela calculada pelo `temModuloComoATela`; a
  metade positiva (o Comercial: lê os modelos e as cláusulas, troca o modelo da família e ele grava; lê a OS, os itens pelas duas rotas,
  gera e baixa o PDF; o Operacional: as 5 da OS com o PDF, e 403 nas 3 do modelo de contrato); o desligado; o BUSY/500 numa de cada grupo.
- [x] **T3b — `9149c024` (Fase 5: `9dccf0dd`, o fantasma adjacente) — (depois de T2) — cenários no `tests/api/propostaClausulasGrava.api.test.js`:** `inicializar` e `reordenar` com id que não existe →
  404 literal, nenhuma cláusula gravada, nenhuma linha de log de edição para o id; a proposta inativa continua (o `inicializar` copia);
  o erro ao ler a proposta (falha injetada no SQL da conferência) → a frase de cada rota e o 503 no BUSY.

**Tabela por usuário (T3a):**

| Usuário | Modelo de contrato (3) | OS pelo número (5) |
|---|---|---|
| sem nada (sem linha) | 200 | 200 |
| direta do Comercial | 200 | 200 |
| grupo ativo com o Comercial | 200 | 200 |
| grupo ativo sem linha | 200 | 200 |
| super / role admin (com só a direta do Almoxarifado) | 200 | 200 |
| só a direta do Operacional | 403 | 200 |
| grupo ativo com o Operacional | 403 | 200 |
| Operacional só num grupo inativo (+ direta do Almoxarifado) | 403 | 403 |
| Operacional com permissão 0 | 403 | 403 |
| Comercial com permissão 0 | 403 | 403 |
| só a direta do Almoxarifado | 403 | 403 |
| só a direta de Engenharia / Projetos (o usuário 8 do banco medido) | 403 | 403 |
| administrador do módulo Comercial + direta do Administrativo | 403 | 403 |
| direta do Operacional com `grupo_id = 0` + direta do Almoxarifado (Fase 2) | 403 | 403 |

## Decisões (vão para a letra B)

- **B965** — a OS pelo número aceita o Comercial **ou** o Operacional pela régua da tela (as duas telas que a abrem). Descartado: (a) o
  `checkModulePermission('operacional')` das vizinhas (trancaria fora a tela de OS do Comercial, que lê a OS pelo número); (b) o
  `checkAnyModulePermission(['comercial','operacional'])` (a régua antiga libera o Comercial a todo usuário sem grupo — no banco medido não
  fecharia nada); (c) mandar o Comercial só ver parte da OS (muda o que a tela recebe; não pedido).
- **B966** — o modelo de contrato por família exige só o Comercial. Descartado: (a) o caminho de Configurações da 147 (o `OpcoesPorFamilia` de
  Configurações mexe nas variáveis da família, mas não chama as 3 rotas do modelo de contrato); (b) fechar junto as outras 20 rotas `/api/familias*` (o cadastro de família e produto — são lidas pelo
  formulário da proposta e pelos produtos; etapa própria, medida → **C343**). *Fase 2 I-3:* o portão fecha a troca **direta**; como
  o modelo é achado pelo **nome** da família, renomear uma família (só login) ainda muda o modelo efetivo das propostas novas (clonar é só
  do administrador — corrigido no fechamento).
- **B967** — o mesmo interruptor da B946 desliga as 8. Descartado: uma chave só para a OS (o portão é o mesmo e a régua não tranca ninguém
  que a tela deixa entrar; duas chaves para o mesmo portão — o descarte da B960).
- **B968** — a proposta que não existe dá 404 nas duas rotas das cláusulas; a **inativa** continua como antes. Descartado: 404 também para
  a inativa (o preview de uma proposta inativa ainda abre pelo detalhe; mudaria o que a tela faz hoje).
- **B969** — a criação da OS (**C277**, do P.O.), o número da próxima OS e os itens (**C332**) e o `PUT`/`DELETE` da OS ficam com a régua de
  hoje. Descartado: alinhar tudo agora (a C277 é decisão do P.O.: quem cria OS). *Fase 2 M-7:* quem cria a OS só pela integração (sem
  tela) e não tem o Comercial nem o Operacional toma 403 ao gerar o PDF dela — esperado até a C277.
- **B970** — a próxima etapa (149).

## Avisos novos (C)

- **C343** — as outras 20 rotas `/api/familias*` — 19 só pedem o login (criar, editar, apagar, foto, esquemático, variáveis e opções de
  variáveis — 19; o clonar é `isAdminUser`); e como o modelo é achado pelo **nome** da família, renomear ainda muda o contrato das propostas
  novas (Fase 2 I-3, corrigida: o clonar não entra).
- **C344** — o formulário da família salva a família e engole a recusa da troca do modelo de contrato (sem aviso): quem perdeu o Comercial
  no meio da sessão vê "salvo" e o modelo não mudou (Fase 2 M-5; anterior — o client não muda nesta etapa).

## Execução

- **Linha de base** (a árvore da main `50031f45`, antes de qualquer código): `test:api` **468/468**.
- **TDD, vermelho medido** (os dois arquivos contra o `index.js` da main, com o `git stash` só dele): `osModeloContratoPortao` **2 passed,
  6 failed** — o barrado tomava **200** nas 8 (o `GET /clausulas-modelos` devolvia os modelos), o só-Operacional lia os modelos de contrato,
  o aviso do boot não citava a OS; os 2 verdes eram a metade positiva do Comercial e a imagem do produto fora do portão (as duas valem antes
  e depois). `propostaClausulasGrava` **13 passed, 2 failed** — o `inicializar` de uma proposta que não existe respondia **500** com
  *"SQLITE_CONSTRAINT: FOREIGN KEY constraint failed"* e o erro injetado na conferência não existia (200 com 29 cláusulas).
- **Divergências do plano:** (1) as RN e o teste foram ajustados pela Fase 2 antes do código (acima); (2) a conferência da proposta virou um
  **middleware** (`propostaDasClausulasExiste(responderErro, soSe)`) em vez de um `db.get` dentro de cada handler — o 400 do corpo do
  `reordenar` fica antes pelo `soSe`; (3) a varredura independente do fonte para a OS casa também o `PUT`/`DELETE` dos mesmos caminhos — o
  teste prende a lista inteira (9 registros, verbo e caminho) em vez de contar 5; (4) T1 e T2 em commits separados (`d69a5cf6`, `9149c024`) —
  o `index.js` intermediário (só o portão) foi verificado à parte (`osModeloContratoPortao` 8/0, `uploadsProtegidos` 29/0) antes do 1º commit.
- **Controles K1–K14 (14, `scratchpad/e148/sabota.js`, um por vez sob a trava):** o portão tirado do `os-itens`, do `gerar-pdf`, do `PUT` da
  família e do PDF; o portão da OS só com o Operacional / só com o Comercial; o modelo de contrato com o portão da OS; o `GET /:id` só com o
  Comercial; o aviso antigo do boot; a conferência que sempre acha; o `soSe` removido; a frase do `reordenar` no `inicializar`; o
  `ficouParte` verdadeiro; a inativa barrada — **todos caíram pela asserção do ponto**, md5 restaurado em todos.
- **Suíte antes de `d69a5cf6`/`9149c024`** (a árvore com os dois): `test:api` **469/469**; `test:almoxarifado` **44/0**;
  `test:validation`/`safealter`/`sqlite` verdes (4/0, 3/0, 16/0); revisão obrigatória da proposta **23/23** + as rotas (21/0, 11/0, 11/0,
  8/0, 26/0, **15/0**, 7/0, **8/0**) + editor **39/39**; client **143** suítes / **1855** testes; `CI=true build` *Compiled successfully*.
- **A96** rodada no banco local (cópia de 09/10): a 1 **vazia**, a 2 com os **4** de sempre (ids 7, 8, 12, 15 — "a OS e o modelo de
  contrato"); controle numa cópia com a OS passada ao 12, outra OS do 3 e o 15 ganhando o Operacional: a 1 achou só o 12; a 2 marcou o 15
  como "só o modelo de contrato".
- **No fechamento (medido ao escrever o guia): o lápis da lista da Fábrica abre o `OSForm`** (que usa a lista e o `PUT`, régua antiga) —
  nenhuma tela navega para `/fabrica/ordens-servico/editar/:id`; o `OSFormPage` da Fábrica só abre pelo endereço. A Fase 0 dizia "montado em
  `/fabrica/ordens-servico/editar/:id`" (certo) sem dizer isso; o guia e o manual dizem. A régua da B965 não muda (a tela existe e decide
  pelo Operacional).

## Fase 5 — três revisores frescos em paralelo, sob a trava

- **Regra (r1): 0 achados.** Comparou pela rota o ligado e o desligado (que reproduz o de antes) para quem a tela deixa passar — **idênticos
  byte a byte** nas 8 —, o 403 antes do 404 (o barrado não descobre se a OS existe), ids estranhos nas cláusulas (`1.0`, `%202`, `04`, `5e0`,
  `+6` acham a proposta e gravam no id inteiro; `7abc`, `-8`, `0x9` dão 404 sem gravar — a conferência e o handler concordam), a ordem
  400 → 404, o 404 no `salvar()` do preview (cai no `mensagemDaFalhaDoSalvar`) e o PDF da OS para o só-Comercial e o só-Operacional.
- **Autorização (r2): 0 Critical, 0 Important, 1 Minor.** **21** perfis estranhos contra a decisão da tela montada do código real do client
  — **0** diferenças; variações de caminho (maiúsculas, barra final, `;x`, `%00`, `%2F`, HEAD, OPTIONS, override) e montagens do PDF por outro
  caminho (travessias por `/api/uploads/*`) — nenhuma passa; usuário desativado e admin rebaixado na hora; ninguém que usa perde. **M-1** a
  lista `GET /api/operacional/ordens-servico` (régua antiga, lê a direta com `grupo_id = 0`) entrega a OS inteira a um perfil que o portão
  novo barra → **C345** e uma linha na B969 (anterior; fora do escopo). Observação: a seleção de OS do Almoxarifado responde a qualquer
  logado (projeção curta) → na C345.
- **Sabotagem (r3, worktree própria `CRM-wt-e148-r3`): 27 sabotagens novas — 23 caíram pela asserção certa, 3 sobreviveram, 1 delas
  equivalente; 0 defeitos.** Sobreviventes: **R13** o portão gravando "acesso negado" para quem **passa** (nenhum teste conferia o log de quem
  passa) → asserção nas duas metades positivas; **R15** a conferência lendo o id vizinho (o fantasma era `MAX+1000`) → o fantasma
  **adjacente** `MAX+1`; **R17** gravar o log de edição antes do 404 — **equivalente**: a tabela do log tem a chave estrangeira e o servidor
  liga as chaves, então nenhuma linha de proposta inexistente fica (a asserção não fica vermelha numa pasta vazia; declarado no teste — e a
  Fase 0 que dizia "uma linha no log" **estava errada**, corrigida acima). Ressalvas: **R14** (o handler rodando depois do 403) caía por
  pouco tempo → a pausa antes do retrato passou de 0,5 s para 5 s; **R20** (a régua do par quebrada no servidor) só caía por comportamento →
  um caso novo na tabela compartilhada ("a linha do Comercial — o par entra").
- **Controles da Fase 5, rodados por mim:** **K15** (o portão registrando quem passa), **K16** (a conferência no id − 1), **K17** (a régua do
  par só com o último módulo) — caíram pela asserção do ponto (K17 pelo caso novo da tabela compartilhada), md5 restaurado.
- **Fase 5 — `9dccf0dd`.** `osModeloContratoPortao` com as asserções novas (8 cenários); `propostaClausulasGrava` com o fantasma adjacente
  (15 cenários); `portaoComoATela.casos.json` com 19 casos (eram 15).
- **Suíte antes de `9dccf0dd`:** `test:api` **469/469**; `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` verdes (4/0, 3/0, 16/0); revisão obrigatória da proposta **23/23** + as rotas (21/0, 11/0, 11/0, 8/0, 26/0, **15/0**, 7/0, **8/0**) + editor **39/39**; client **143** suítes / **1856** testes; `CI=true build` *Compiled successfully*. É também a verificação do fechamento (depois dela só mudaram documentos).

## Retro (4 números)

1. **Rodadas de correção até verde:** **2** — antes do primeiro commit (a varredura do fonte da OS contava os `PUT`/`DELETE` dos mesmos
   caminhos; o regex perdido no heredoc) e a Fase 5 (as asserções do r3). Testes antigos mudados: **1** arquivo (`uploadsProtegidos`, os
   middlewares do PDF da OS); a tabela compartilhada ganhou casos (não mudou nenhum).
2. **Achados da revisão:** Fase 2 — **0 Critical + 3 Important + 7 Minor, todos reais** (um deles meio errado: o "clonar só pede login" — o
   clonar é do administrador, corrigido no fechamento). Fase 5 — r1 **0**; r2 **1** Minor real (C345); r3 **2** sobreviventes reais + **1**
   equivalente + 2 ressalvas (viraram asserções); **0** ruído. **O que mais pesou:** a frase da Fase 0 sobre o log da proposta inexistente
   (falsa num banco com a chave) e o caminho da Fábrica (o lápis não abre a tela da OS pelo número) — os dois de documento, achados ao
   executar.
3. **Paralelismo:** **0** galhos em paralelo de fato (T1 e T2 dividem o `index.js` — Fase 2 I-2); **0** retrabalho; **1** revisor na Fase 2,
   **3** em paralelo na Fase 5 sob a trava (o r3 numa worktree própria, removida).
4. **Defeito que escapou:** *(preencher na Etapa 149)*.

## Próxima tarefa detalhada — Etapa 149

*(A série desta etapa foi B965–B970, C343–C345, A96 — a 149 começa em **B971**, **C346**, **A97**; confira com `grep -oE` antes.)*

**Escolhida: a C343 + a C345 + o resto da C341 — o cadastro de família pelo módulo, a lista de OS do Operacional pela régua da tela e a
criação de lista de preço gravando em sequência.** (1) **As 19 rotas `/api/familias*` só com login** (`index.js`, de `app.get('/api/familias'`
a `app.delete('/api/familias/:familiaId/variaveis/:variavelChave/opcoes/:id'`; o `POST /:id/clonar` já é `isAdminUser`). **Fase 0
obrigatória — os leitores são muitos:** `FamiliasDoGrupo`, `ModalFamiliaForm`, `Produtos`, `ProdutosPorFamilia`, `ProdutoForm`,
`SelecaoProdutosPremium`, os dois `PropostaForm` (o de `components/` e o de `components/proposta/`) — todos em `/comercial` — **e o
`OpcoesPorFamilia` embutido em `/configuracoes`** (`GET /familias/todas`, `/:id`, `/:id/variaveis`, `/:id/opcoes-variaveis`, e grava as
opções): o mesmo segundo caminho da 147 (o `exigirComercialNoModeloDaProposta` — Administrativo + administrador do Comercial —, a medir em
que aba ele está e quem a vê). Medir também se Compras, Engenharia, Almoxarifado ou o MES leem `/api/familias*` (grep no client inteiro e em
`server/routes/`) e se algum template do servidor busca por HTTP. Leituras (`GET`) podem precisar de régua mais larga que as escritas —
decidir medindo, registrar em B. Lembrar: renomear família muda o modelo de contrato efetivo (C343) — o `PUT /api/familias/:id` com o portão
fecha isso. (2) **A lista de OS do Operacional** (`GET /api/operacional/ordens-servico`, `checkModulePermission('operacional')`, **C345**):
chamada por `OrdensServico` e `AtividadeForm` (as duas em `/fabrica`) — candidata: `portaoDasPropostas.exigir('operacional')` (a régua da
tela da Fábrica); medir antes quem a régua antiga deixa e a da tela não (a direta com `grupo_id = 0`; o usuário sem grupo — a régua antiga
o barra no Operacional, a da tela também) e a relação com a **C332** (o `proximo-numero` e o `POST /os-itens` — **não** a criação da OS, que é
a **C277**, do P.O.). (3) **O resto da C341:** `POST /api/comercial/listas-precos` grava as linhas por statement sem conferir cada uma — o
`gravarItensEmSequencia` (146/147) com rótulo e o desfazer da lista criada. Uma consulta **A97** no molde da A96 se houver gente que perde.

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 147 (que já inclui a da 146, a da 145 e a **C330**) — **B853**/**C279**,
**B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela de
conversões e o grupo acima de família, a régua do tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**,
**C117**/**C118**, **C139**, **C278**; na 05, os itens de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por
cliente e previsto × realizado; na 22, **B13**, **B101**/G30, **G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62; nas
propostas, a verificação do dono da proposta (Fase 12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a
Frente B da lentidão, a **C297** (**B924**), a **B926**, a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**.
Pendem de Postgres: **C98**, **C110**. *(Nada novo para o P.O. nesta etapa: as decisões B965–B969 são reversíveis e estão na letra B.)*

**O que já está pronto e não precisa reabrir:** o `exigirComercialOuOperacionalNaOS` nas 5 rotas da OS pelo número e o
`exigirComercialNasPropostas` nas 3 do modelo de contrato; o `propostaDasClausulasExiste` (404) no `inicializar`/`reordenar`; os testes
`osModeloContratoPortao` (8 — o molde para um portão novo com as metades positivas e o log de quem passa) e os cenários RN-148.05 do
`propostaClausulasGrava`; a tabela compartilhada `portaoComoATela.casos.json` (19 casos, servidor e client).
