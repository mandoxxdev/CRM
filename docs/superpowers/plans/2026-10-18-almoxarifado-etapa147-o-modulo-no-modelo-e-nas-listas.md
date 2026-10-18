# Etapa 147 (propostas/Comercial): o modelo da proposta e as listas de preço exigem o Comercial pela régua da tela, e as cláusulas da proposta só respondem depois de gravar (C319, C329, C327) — plano

> Origem: "Próxima tarefa detalhada — Etapa 147" do plano da 146
> (`docs/superpowers/plans/2026-10-18-almoxarifado-etapa146-os-itens-gravados-antes-de-responder.md`). A etapa é pequena; o design, com
> a Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-18): última B **B957**, último C
> **C336**, última A **A94**. Esta etapa: **B958+**, **C337+**, **A95+**. Worktree `CRM-wt-e147`, branch `etapa-e147` (da main `d45fd135`).
>
> **Trava de máquina:** `scratchpad/e147-lock.sh` (o diretório `maquina-testes.lock` de sempre). Um arquivo de teste de servidor por vez,
> inclusive os revisores. Revisão obrigatória da proposta: `scratchpad/e147/review-proposta.sh` (23 + editor 39 + as rotas). A etapa
> **não** toca o template; toca `server/services/portaoDasPropostas.js` (uma opção nova do portão), o `index.js` (o portão nas 25 rotas e
> as duas rotas das cláusulas), o teste de texto `uploadsProtegidos.api.test.js` (que prende o registro exato do download do contrato) e,
> no client, só o `toast` de erro do `salvar()` do preview (`PropostaPreviewEditavel.js` + `avisoValoresIgnorados.js` — Fase 2 I-2/B962).
>
> **Fase 2 (um revisor fresco, só leitura): 1 Critical, 5 Important, 7 Minor — todos aceitos antes do código, com o que mudou:**
> **C-1** a RN-147.04 dizia que o documento usa o logo do modelo — **estava errado**: o `/premium` e o `/pdf` usam o
> `gerarHTMLPropostaPremiumV2`, que não lê `logo_url`/`header_image_url`/`footer_image_url`/`cover_image_url` (os logos são assets fixos em
> base64); só as funções mortas `gerarHTMLPropostaFromComponentes`/`gerarHTMLPropostaPremium` montavam `/api/uploads/logos/<logo_url>` →
> RN-147.04 reescrita (o modelo entra no documento pelas margens e variáveis, lidas do banco) e **C339** (as imagens do modelo não aparecem
> no documento). **I-1** o botão é **"Resetar cláusulas"**, não "Restaurar cláusulas padrão" → frase corrigida. **I-2** com a limpeza do
> `inicializar` falhando, o 2º salvamento dava 200 e perdia as cláusulas de k em diante calado (as `default-*` não casam no diff) e o
> vendedor só via *"Erro ao salvar alterações."* → o `toast` do `salvar()` passa a mostrar a frase do servidor (a que manda usar o Resetar)
> e o caso fica escrito em **C340**. **I-3** o `resolverModeloClausulas`/`carregarClausulasDoModelo` engoliam o erro de banco e copiavam o
> padrão de equipamento → o `inicializar` passa a recusar (RN-147.05). **I-4** na pasta vazia o upload do logo responde 200 sem gravar
> (o `UPDATE ... WHERE id = (SELECT ... LIMIT 1)` sem linha) → o teste grava o modelo antes e confere a coluna. **I-5** o 500 do
> `inicializar` agora barra o resto do `salvar()` (variáveis, descrições, customizações) → declarado; o `SQLITE_BUSY` com o desfazer
> completo vira **503** (o `api.js` do client repete sozinho; as duas rotas são idempotentes depois do desfazer). **M-1** o caminho de
> Configurações abre também `/list`, `/:id`, `save-as`, `restore-default`, blocos e biblioteca, que a tela embutida não chama → declarado
> na B958 (o mesmo dado). **M-2** quatro linhas a mais na tabela. **M-3** o campo de middlewares separado no `uploadsProtegidos`. **M-4** o
> rótulo do log do `gravarItensEmSequencia`. **M-5** *"Nada foi alterado"* → *"A ordem não foi alterada"*. **M-6** as rotas vizinhas do
> modelo de contrato (`/api/clausulas-modelos*`, `PUT /api/familias/:id/clausulas-modelo`) e o `POST` das listas por statement → **C341**.
> **M-7** a devolução da ordem pode sobrescrever um reordenar de outra aba → somado à **C338**.

## Fase 0 — medido (antes de qualquer código)

### As rotas (lidas no `index.js`)

- **20 do modelo da proposta** (nenhuma com portão de módulo — só `authenticateToken`): `/api/proposta-template` GET/POST,
  `/list`, `/:id`, `/save-as`, `/restore-default`, os 5 uploads (`/logo`, `/header-image`, `/footer-image`, `/cover-image`,
  `/contrato-anexo` — `multer` como 3º middleware), o download `GET /api/proposta-template/contrato-anexo/:arquivo`
  (`servirContratoAnexo`, Etapa 81), `/api/proposta-blocos` GET/POST/PUT/DELETE e `/api/proposta-texto-biblioteca` GET/POST/PUT/DELETE.
  Nenhuma fora do `index.js` (`routes/`, `services/` — só o `arquivosProtegidos.js` cita, no comentário).
- **5 das listas de preço** (`/api/comercial/listas-precos` POST/GET, `/:id` GET, `/:id/itens` GET, `/:id` DELETE) — só login.

### Quem chama (client e servidor)

- **Client:** `ConfigTemplateProposta` (GET e POST do modelo, logo, contrato), `EditorTemplateProposta` (GET, `/list`, `/:id`, POST,
  `save-as`, `restore-default`), `ListaPrecos` (as 5), `utils/baixarArquivoProtegido.baixarContratoAnexo` (o download, chamado pelo
  `ConfigTemplateProposta`) e o `PreviewPropostaEditavel` **antigo** (código morto: o `PropostaForm.js` de `components/` o monta só com
  `showPreviewEditavel`, que nunca vira `true` — nenhum `setShowPreviewEditavel(true)` no arquivo). **Ninguém chama** `/api/proposta-blocos`
  nem `/api/proposta-texto-biblioteca` (zero ocorrências no client).
- **Onde as telas ficam:** `ListaPrecos` e `EditorTemplateProposta` só em `/comercial/...` (portão de tela `comercial`). O
  `ConfigTemplateProposta` em **dois** lugares: `/comercial/propostas/config-template` **e embutido em `/configuracoes`**
  (aba **Comercial → Template de proposta**, `Configuracoes.js:541`; o botão "Config. template" da lista de propostas leva para lá). A
  rota `/configuracoes` exige o **Administrativo** pela régua da tela (`ProtectedModuleRoute modulo="administrativo"`) e o
  `ProtectedModuleConfigRoute administrativoConfig`; a aba Comercial aparece para `canConfigureModule(user, 'comercial')` = administrador do
  sistema **ou administrador do módulo Comercial** (`admin_modulos`). **Achado da Fase 0:** o portão só com o Comercial trancaria fora quem
  a tela deixa abrir o modelo por Configurações sem ter o Comercial (Administrativo + administrador do módulo Comercial). No banco medido
  ninguém tem `admin_modulos` (os 10 usuários ativos têm `[]`), mas a régua tem de concordar com a tela.
- **Servidor (o PDF):** o `/premium`, o `/pdf` e o PDF da OS leem o modelo **direto do banco** (`SELECT * FROM proposta_template_config`,
  `index.js:9696`, `:9970`) — nenhuma chamada HTTP interna para `/api/proposta-template*`. As imagens do documento saem por
  `${logoBaseURL}/api/uploads/logos|headers|footers|produtos/...` e arquivos estáticos (`/logo-gmp.png`, `/Logo_MY.jpg`, `/cabecalho.jpg`)
  — montagens `express.static` fora do portão; o PDF da OS busca a imagem do produto em `http://localhost:${PORT}/api/uploads/produtos/`
  (`index.js:21378`). Nenhum template (`server/templates/`) cita as rotas do modelo. **O portão não quebra o PDF** — e a prova é pela rota
  (RN-147.04). *(Fase 2 C-1: esta Fase 0 falava em "as imagens do modelo no documento" — **estava errado**: o template do documento não
  usa nenhuma imagem enviada pelo modelo; do modelo ele lê só as margens e as variáveis — C339.)*
- **Outros módulos:** nenhum (`routes/*.js` não cita). Os scripts manuais `upload_header.js`/`upload_footer.js` entram como o administrador
  (super) — passam.
- **Testes existentes que tocam:** `uploadsProtegidos.api.test.js` prende o registro **literal** `app.get('/api/proposta-template/contrato-anexo/:arquivo',
  authenticateToken, servirContratoAnexo)` (Etapa 81) — muda junto (o handler continua o mesmo); `ContratoAnexoDownload.test.js` (client,
  mock de HTTP — não muda).

### Banco local (cópia de 09/10 do `CRM/server/data`, lida numa cópia no scratchpad)

**10** usuários ativos, **4** super/admin, **0** grupos, **0** `admin_modulos`; **1** linha do modelo (`Geral`, sem logo nem contrato,
alterada em 22/07); **0** blocos; **0** textos da biblioteca; **0** listas de preço. As tabelas do modelo **não guardam quem alterou**
(só `updated_at`); só `listas_precos.created_by`. Quem passa a ser barrado: os mesmos 4 usuários da A93 (ids 7, 8, 12, 15 — diretas sem o
Comercial; a tela já os barra do Comercial e de Configurações → Comercial).

### As cláusulas da proposta (C327, lido no código)

- `POST /api/propostas/:id/clausulas/inicializar`: `db.prepare` + `stmt.run` por cláusula sem callback + `finalize` — a linha que falha some
  calada (ou a rota não responde — o mesmo do `PUT` da 146). **E o client relaciona as cláusulas recém-copiadas por POSIÇÃO**
  (`PropostaPreviewEditavel.js`, `salvarClausulas`: `frescas[indice]`) — com uma linha a menos, as edições do vendedor caem na cláusula
  errada. O `salvar()` do preview mostra *"Erro ao salvar alterações."* em qualquer falha e mantém as mudanças pendentes.
- `PUT /api/propostas/:id/clausulas/reordenar`: o mesmo padrão com `UPDATE ... SET ordem` — a ordem fica meio nova, meio velha.

## Regras de negócio

- **RN-147.01 — as 20 rotas do modelo da proposta exigem o Comercial pela régua da tela, ou o caminho de Configurações (C319).** Logo depois
  do `authenticateToken` e antes de tudo (inclusive do `multer`), o portão `exigirComercialNoModeloDaProposta`: passa o super ou `role`
  admin (sem ler nada); passa quem tem o **Comercial** pela régua da tela (`temModuloComoATela`, a mesma da 145 — com alguma linha, só com a
  do Comercial `permissao = 1`; sem linha nenhuma, passa, B63); **e passa quem a tela deixa abrir Configurações → Comercial → Template de
  proposta**: o **Administrativo** pela régua da tela **e** administrador do módulo Comercial (`admin_modulos` contém `comercial`). Recusa:
  **403** `{ "error": "Acesso negado ao módulo", "modulo": "comercial" }` e a linha `acesso_negado` no log (`modulo = 'comercial'`,
  `nome_modulo = 'Comercial'`). Erro ao ler as linhas: `SQLITE_BUSY` → **503** (`context: 'portao:propostas'`); outro → **500** *"Erro ao
  verificar permissões"* (o do portão da 145).
- **RN-147.02 — as 5 rotas das listas de preço exigem o Comercial pela régua da tela (C329).** O portão `exigirComercialNasPropostas` (o da
  145, sem o caminho de Configurações: a tela da lista de preço só existe no Comercial). Mesma recusa, mesmo log, mesmos 503/500.
- **RN-147.03 — o mesmo interruptor.** `PROPOSTAS_PORTAO_DE_MODULO=desligado` (B946) desliga também os portões das 25 rotas; o aviso do boot
  passa a citar o modelo da proposta e as listas de preço (mantendo o texto `PROPOSTAS_PORTAO_DE_MODULO=desligado`).
- **RN-147.04 — o documento da proposta continua saindo para quem tem o Comercial.** O `/premium` e o `/pdf` leem o modelo (as margens e as
  variáveis por família) **direto do banco**, não pelas rotas do modelo. Prova pela rota, com o portão ligado: quem tem o Comercial (por
  direta, não administrador) grava o modelo pela rota e gera o `/premium` (**200**, o HTML da proposta) e o `/pdf` (**200**, começa com
  `%PDF-`); nenhuma URL do servidor que o HTML referencia cai num dos 4 prefixos do portão, e as de `/api/uploads/` e `/api/assets/` abrem
  **sem token** (o Chromium do PDF as busca assim). *(Dizia "com as imagens do modelo" — estava errado, Fase 2 C-1.)*
- **RN-147.05 — copiar as cláusulas padrão para a proposta grava uma por uma e só responde depois da última (C327).** No
  `POST /api/propostas/:id/clausulas/inicializar`, as cláusulas do modelo são gravadas **em sequência** (`db.run`, erro conferido em cada
  uma). Falha numa → apaga as que já gravou (pelos ids devolvidos) → **500** *"Erro ao copiar as cláusulas da proposta (<mensagem do
  banco>). Nenhuma cláusula foi gravada — salve de novo."* (com `SQLITE_BUSY` e a limpeza feita: **503** do `respondDbError`, contexto
  `propostas:clausulas` — o client repete); se a limpeza falhar → **500** *"Erro ao copiar as cláusulas da proposta (<mensagem do banco>). A
  proposta ficou com parte das cláusulas — use Resetar cláusulas e salve de novo."*. **Erro de banco ao escolher ou ler o modelo de
  contrato** (Fase 2 I-3; antes caía calado no padrão de equipamento) → nada é gravado → o mesmo 500 *"Nenhuma cláusula foi gravada"* (ou o
  503 no BUSY). O padrão continua para "sem modelo" e "modelo sem cláusulas". O log de edição (`clausulas_inicializadas`) só entra no
  sucesso. Sucesso, `jaInicializado` e o corpo de resposta não mudam.
- **RN-147.06 — reordenar as cláusulas grava em sequência e, na falha, devolve a ordem de antes (C327).** No
  `PUT /api/propostas/:id/clausulas/reordenar`, lê antes a ordem atual das cláusulas da proposta; grava a nova **em sequência**. Falha numa →
  devolve, em sequência, a ordem lida às que já mudaram → **500** *"Erro ao gravar a nova ordem das cláusulas (<mensagem do banco>). A ordem
  anterior foi mantida — salve de novo."* (BUSY com a devolução feita: **503**); se a devolução falhar → **500** *"Erro ao gravar a nova ordem
  das cláusulas (<mensagem do banco>). A ordem ficou misturada — confira as cláusulas antes de enviar a proposta e salve de novo."*. Erro ao
  ler a ordem atual → **500** *"Erro ao gravar a nova ordem das cláusulas (<mensagem>). A ordem não foi alterada — salve de novo."* (BUSY:
  503). O log de edição (`clausula_reordenada`) só entra no sucesso. `ordem` que não é lista → o 400 de sempre; id que não é da proposta →
  ignorado, como antes.
- **RN-147.07 — a tela mostra a frase do servidor quando o salvamento do preview falha (Fase 2 I-2, B962).** O `salvar()` do preview
  editável mostra no aviso vermelho o `error` da resposta (a frase das RN-147.05/06, o *"Acesso negado ao módulo"*, …) e, sem ele (rede
  caída, resposta sem corpo), o *"Erro ao salvar alterações."* de sempre. As mudanças continuam pendentes, como antes. Consequência
  (Fase 2 I-5, já era assim para os outros erros): uma falha nas cláusulas interrompe o resto do salvamento (variáveis, descrições,
  customizações) — o vendedor salva de novo.
- **RN-147.08 — o preview que acha as cláusulas padrão e o servidor já as tem não as relaciona pela posição (Fase 5 r1 I-1).** No
  `salvarClausulas`, se o `inicializar` responde `{ ok: true, jaInicializado: true }` (um salvamento anterior falhou depois de copiar, a cópia
  ficou pela metade — C340 —, outra aba salvou), as mudanças nas cláusulas **não** são gravadas: o `salvar()` segue com o resto (campos dos
  itens, descrições, capa), mostra o aviso amarelo *"As cláusulas desta proposta já estavam gravadas (por um salvamento anterior que não
  terminou ou por outra aba) e as mudanças nelas não foram gravadas agora. O preview foi recarregado com o que está gravado — confira as
  cláusulas e faça as mudanças de novo."* (junto com o dos campos ignorados, se houver), recarrega e devolve `false` (o Emitir revisão não
  emite). Antes: o 2º salvamento relacionava pela posição as 28 gravadas contra o retrato de 29 — 25 cláusulas com o texto da vizinha, uma
  apagada, a última sumida, e *"Alterações salvas."* (reproduzido pelo r1).

## Contratos de API (congelados)

| Rota | Caso | Status | Corpo / mensagem literal |
|---|---|---|---|
| as 20 do modelo | sem o Comercial pela régua da tela e sem o caminho de Configurações | 403 | `{ "error": "Acesso negado ao módulo", "modulo": "comercial" }` |
| as 5 das listas | sem o Comercial pela régua da tela | 403 | o mesmo corpo |
| as 25 | `SQLITE_BUSY` ao ler as permissões | 503 | o corpo do `respondDbError` com `context: 'portao:propostas'` |
| as 25 | outro erro ao ler as permissões | 500 | `{ "error": "Erro ao verificar permissões" }` |
| `POST .../clausulas/inicializar` | falha numa cláusula | 500 | `Erro ao copiar as cláusulas da proposta (<msg>). Nenhuma cláusula foi gravada — salve de novo.` |
| `POST .../clausulas/inicializar` | falha e a limpeza falha | 500 | `Erro ao copiar as cláusulas da proposta (<msg>). A proposta ficou com parte das cláusulas — use Resetar cláusulas e salve de novo.` |
| `POST .../clausulas/inicializar` | erro ao escolher/ler o modelo de contrato | 500 | a frase "Nenhuma cláusula foi gravada" |
| `POST .../inicializar`, `PUT .../reordenar` | `SQLITE_BUSY` com o desfazer feito | 503 | o corpo do `respondDbError` com `context: 'propostas:clausulas'` |
| `PUT .../clausulas/reordenar` | falha ao ler a ordem atual | 500 | `Erro ao gravar a nova ordem das cláusulas (<msg>). A ordem não foi alterada — salve de novo.` |
| `PUT .../clausulas/reordenar` | falha numa linha | 500 | `Erro ao gravar a nova ordem das cláusulas (<msg>). A ordem anterior foi mantida — salve de novo.` |
| `PUT .../clausulas/reordenar` | falha e a devolução falha | 500 | `Erro ao gravar a nova ordem das cláusulas (<msg>). A ordem ficou misturada — confira as cláusulas antes de enviar a proposta e salve de novo.` |

As respostas de sucesso não mudam (corpo e status).

## Tasks (sort topológico)

- [x] **T1 — `2f558a3e` — tronco — a opção do portão (RN-147.01).** `criarPortaoDasPropostas(...).exigir(modulos, { tambemAdminDoModuloCom })` em
  `services/portaoDasPropostas.js`: depois de `temModuloComoATela` falhar, passa se `isModuleAdmin(user, <modulo>)` **e**
  `temModuloComoATela(user, linhas, <o módulo da tela que abre>)` — no `index.js`,
  `exigirComercialNoModeloDaProposta = portaoDasPropostas.exigir('comercial', { tambemAdminDoModuloCom: { admin: 'comercial', tela: 'administrativo' } })`.
  Função pura exportada (`passaPeloCaminhoDeConfiguracoes`) para o teste.
- [x] **T2 — `2f558a3e` — galho de T1 — o portão nas 25 rotas (RN-147.01/02/03).** `index.js`: as 20 do modelo com `exigirComercialNoModeloDaProposta`
  como 2º middleware (antes do `multer`); as 5 das listas com `exigirComercialNasPropostas`; o aviso do boot. O
  `uploadsProtegidos.api.test.js` passa a esperar o portão no registro do download (o handler continua o testado).
- [x] **T3 — `2f558a3e` (Fase 5: `e8a76073`, a devolução pela releitura) — independente — as cláusulas em sequência (RN-147.05/06).** `index.js`: o `inicializar` com `gravarItensEmSequencia` (o SQL da
  cláusula) e a limpeza pelos ids; o `reordenar` com a leitura da ordem atual, a gravação em sequência e a devolução.
- [x] **T5 — `2f558a3e` (Fase 5: `e8a76073`, a RN-147.08) — client (RN-147.07):** `mensagemDaFalhaDoSalvar(e)` em `avisoValoresIgnorados.js` e o `catch` do `salvar()`; teste puro + fonte
  em `avisoValoresIgnorados.test.js`.
- [x] **T4a/T4b — `2f558a3e` (Fase 5: `e8a76073`, +3 cenários) — (depois de T1+T2) / (depois de T3) — testes de integração pelo `index.js` real (pasta vazia), molde do `propostaPortaoModulo`:**
  `tests/api/propostaModeloPortao.api.test.js` — pelo fonte (as 20 e as 5, o portão como 2º middleware, nenhuma fora do `index.js`, nenhum
  `app.use` no prefixo, qualquer aspa); o barrado toma 403 em **cada uma** das 25 e nada muda (retrato das 5 tabelas e das pastas de
  upload; o log conta 25); por usuário (a tabela abaixo) o modelo e as listas; a metade positiva (quem tem o Comercial faz o fluxo inteiro:
  lê, grava, sobe o logo e o contrato, baixa o contrato, cria/edita/apaga bloco e texto, cria/lê/busca/apaga lista); o caminho de
  Configurações (Administrativo + administrador do Comercial passa no modelo e **não** nas listas; sem o Administrativo, ou com o
  Administrativo só num grupo inativo, não passa); RN-147.04 (o PDF pela rota); o desligado; o BUSY/500. E
  `tests/api/propostaClausulasGrava.api.test.js` (T4b, depois da T3) — o gatilho do SQLite como falha real (molde do `propostaSalvarGrava`): inicializar com a
  falha na 4ª → 500 literal, 0 cláusulas, sem log de edição, e responde em 10 s; a limpeza que falha → a 2ª frase; reordenar com a falha
  na 3ª → 500 literal e a ordem lida antes intacta; a devolução que falha → a frase da ordem misturada; a leitura que falha → "Nada foi
  alterado"; a metade positiva (inicializar 200 com o total, reordenar 200 com a ordem nova, o log de edição de cada um).

**Tabela por usuário (T4):**

| Usuário | Modelo (20) | Listas (5) |
|---|---|---|
| sem nada (sem linha) | 200 | 200 |
| direta do Comercial | 200 | 200 |
| grupo ativo com o Comercial | 200 | 200 |
| grupo ativo sem linha | 200 | 200 |
| super / role admin | 200 | 200 |
| só a direta do Operacional | 403 | 403 |
| só a direta do Almoxarifado | 403 | 403 |
| Comercial com permissão 0 | 403 | 403 |
| administrador do módulo Comercial + só Almoxarifado | 403 | 403 |
| administrador do módulo Comercial + direta do Administrativo | **200** | 403 |
| direta do Administrativo sem ser administrador do Comercial | 403 | 403 |
| administrador do módulo Comercial + Administrativo só num grupo inativo (+ direta do Almoxarifado) | 403 | 403 |
| administrador do módulo Comercial + Administrativo num grupo ativo | **200** | 403 |
| administrador do módulo Comercial + Administrativo com permissão 0 | 403 | 403 |
| administrador do módulo **Administrativo** + direta do Administrativo (sem o Comercial) | 403 | 403 |
| administrador do módulo Comercial sem linha nenhuma | 200 | 200 |

## Decisões (vão para a letra B)

- **B958** — o modelo da proposta aceita também o caminho de Configurações (Administrativo + administrador do módulo Comercial), por ser
  onde a tela o abre. Esse caminho abre as 20 rotas, inclusive as que a tela embutida não chama (`/list`, `/:id`, `save-as`,
  `restore-default`, blocos, biblioteca — Fase 2 M-1): é o mesmo dado, e uma régua por rota seria a tela decidindo por botão. Descartado: (a) só o Comercial (trancaria fora quem a tela deixa editar o modelo por Configurações — no banco medido,
  ninguém, mas a regra é a da tela); (b) `checkModulePermission('comercial')` (libera o Comercial a todo usuário sem grupo — não mudaria
  nada no banco medido, B944).
- **B959** — os blocos e a biblioteca de textos (que nenhuma tela chama) ficam com o portão do modelo, não com um mais estreito. Descartado:
  só o super (o motor de composição dos blocos é do modelo da proposta; uma regra à parte para rota sem tela é chute).
- **B960** — o mesmo interruptor da B946 desliga as 25. Descartado: uma variável por grupo de rotas (duas chaves para o mesmo portão).
- **B961** — as cláusulas (C327) entram; a C335 (a OS pelo número) **não**. A C335 mexe no Operacional e nas rotas que a OS do Comercial
  usa (a C332), e o Operacional tem outras rotas só com login (`/api/operacional/os-itens/:os_id`, o `gerar-pdf`) — é uma etapa própria,
  medida. Descartado: pôr o portão só nas 4 da C335 (deixaria a `os-itens` aberta com o mesmo dado).
- **B962** — o aviso de erro do `salvar()` do preview passa a mostrar a frase do servidor (RN-147.07). *Era o contrário no plano antes da
  Fase 2 (manter o toast genérico); mudou pelo I-2*: sem a frase, o vendedor não sabe que tem de usar o Resetar e o segundo salvamento perde
  cláusulas calado. Descartado: (a) manter o genérico; (b) o `inicializar` completar a cópia parcial no 2º salvamento (não dá para saber se
  o vendedor já editou as que ficaram).
- **B963** (Fase 5, r1 I-1) — o preview que acha as cláusulas padrão e recebe `jaInicializado` não grava as cláusulas, avisa e recarrega
  (RN-147.08). Descartado: (a) recarregar o preview em toda falha do salvamento (o vendedor perderia edições que nada têm a ver com a
  falha); (b) o servidor recusar o `inicializar` repetido com 409 (a mesma informação, e o client ainda teria de tratá-la).
- **B964** — a próxima etapa (148).

## Avisos novos (C)

- **C337** — com o `salvar()` interrompido pela falha das cláusulas, o resto do salvamento (variáveis, descrições, customizações) não é
  gravado naquela vez (Fase 2 I-5; já era assim para os outros erros); salvar de novo grava.
- **C338** — dois `inicializar` ao mesmo tempo na mesma proposta (duas abas) podem copiar as cláusulas duas vezes (a conferência é por
  contagem antes de gravar; anterior); e a devolução da ordem pode desfazer um reordenar de outra aba que caia no meio (M-7).
- **C339** — o logo, o cabeçalho, o rodapé e a capa enviados em Configurações → Template de proposta **não aparecem** no documento da
  proposta (o template atual usa as imagens fixas; anterior — Fase 2 C-1).
- **C340** — se a cópia das cláusulas falha **e** a limpeza também falha, a proposta fica com parte das cláusulas até alguém usar o Resetar
  cláusulas (Fase 2 I-2; a frase do servidor manda usar o Resetar). *Dizia, antes da Fase 5, que salvar de novo respondia "Alterações
  salvas." sem as que faltam — desde a RN-147.08 o 2º salvamento avisa e recarrega com as que ficaram; não completa a cópia.*
- **C342** — copiar ou reordenar as cláusulas de uma proposta que não existe responde 500 com a mensagem da chave estrangeira (o
  `inicializar`) ou 200 (o `reordenar`), em vez de 404 (Fase 5 r1 M-3; anterior — antes o `inicializar` nem respondia).
- **C341** — rotas vizinhas que ainda só pedem o login: o modelo de contrato por família (`/api/clausulas-modelos*`,
  `PUT /api/familias/:id/clausulas-modelo`, que muda o modelo de contrato da família); e a criação de lista de preço grava os itens por
  statement sem conferir cada um (Fase 2 M-6).

## Execução

- **Linha de base** (a árvore da main `d45fd135`, antes de qualquer código): `test:api` **466/466**.
- **TDD, vermelho medido** (os dois arquivos novos contra a árvore da main): `propostaClausulasGrava` **1 passed, 6 failed** — o
  `inicializar` com a 4ª cláusula recusada respondia **200** `{ total: 29 }` (a linha sumia calada; o erro do `stmt.run` virava
  `uncaughtException` engolida pela guarda), o `reordenar` com a 3ª recusada **200**, e o `reordenar` com a falha e a devolução recusada **não
  respondeu em 15 s**; `propostaModeloPortao` **1 passed, 6 failed** — o barrado tomava 200 nas 25 (o `restore-default` dele **apagou o
  modelo**, e o `GET /:id` do teste seguinte deu 404). O 1 verde de cada era a metade positiva (o `reordenar` feliz e o PDF pela rota).
- **Divergências do plano:** (1) as RN e o teste foram ajustados pela Fase 2 antes do código (acima); (2) o boot semeia um **modelo de
  contrato padrão** (`clausulas_modelo`, 29 cláusulas) — o teste esperava `getClausulasDefault()` e `modelo_id: null`; corrigido para ler o
  modelo semeado (não era defeito); (3) o contrato novo apaga o anterior (rota de sempre) — a contagem de arquivos da metade positiva era +5,
  é +4; (4) o teste antigo do `avisoValoresIgnorados` (o import do `desfechoDoSalvar`, e na Fase 5 o `c3` e a régua do desfecho) mudou junto
  com o import e o 3º argumento — **3** linhas de teste antigo mudadas; (5) T1–T5 num commit só (`2f558a3e`): dividem o `index.js`.
- **Controles K1–K17 (17, `scratchpad/e147/sabota.js`, um por vez sob a trava):** o caminho de Configurações sempre falso / sem a tela /
  com a tela errada (`comercial`); um DELETE de bloco sem o portão; o portão depois do `multer`; as listas com o portão do modelo; o aviso do
  boot antigo; o `inicializar` ignorando o erro; a limpeza que não apaga; a devolução vazia; "mantida" no lugar de "misturada"; o erro do
  modelo ignorado (o do 1º e o do 3º passo); o 503 tirado das duas frases; "mantida" na leitura — **todos caíram pela asserção do ponto**,
  md5 restaurado em todos.
- **Suíte antes de `2f558a3e`:** `test:api` **468/468**; `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` verdes (4/0, 3/0,
  16/0); revisão obrigatória da proposta **23/23** + as rotas (21/0, 11/0, 11/0, 8/0, 26/0, **9/0**, **7/0**) + editor **39/39**; client
  **143** suítes / **1848** testes; `CI=true build` *Compiled successfully*.
- **A95** rodada no banco local (cópia de 09/10): a 1 **vazia** (nenhuma lista de preço), a 2 com os **4** de sempre (ids 7, 8, 12, 15 —
  "o modelo e as listas"); controle numa cópia com uma lista criada pelo 7 e outra pelo 3 (que tem o Comercial) e o 8 promovido a
  administrador do Comercial com o Administrativo: a 1 achou só o 7; a 2 marcou o 8 como "só as listas".

## Fase 5 — três revisores frescos em paralelo, sob a trava

- **Regra (r1): 0 Critical, 1 Important (da etapa), 2 Minor.** Comparou pela rota a árvore da main e a da etapa: **6** cenários do
  `inicializar` (sem família, família com modelo próprio, mista, duas famílias, `jaInicializado`), **14** do `reordenar` (vazia, repetidos, de
  outra proposta, não numéricos, parcial, `null`, objeto, aninhada, `true`, `'x'`, sem `ordem`, proposta inexistente), o `/premium` **idêntico
  byte a byte**, o `/pdf`, **23** rotas do modelo e das listas × 3 usuários e os outros chamadores do `resolverModeloClausulas` com o erro
  injetado nos 3 passos — **iguais** fora o que a etapa muda. **I-1** depois de o `reordenar` falhar (500 novo, *"salve de novo"*), o 2º
  salvamento relacionava pela posição as cláusulas que o servidor já tinha contra o retrato velho do preview: 25 com o texto da vizinha, a
  5.1 apagada, a CONSIDERAÇÃO FINAL sumida e *"Alterações salvas."* (o mecanismo é anterior; a etapa o expunha). **Corrigido** pela RN-147.08
  (o `jaInicializado` no preview que achava o padrão). **M-2** ids em texto que o SQLite casa (`"6.0"`, `" 5"`) ficavam fora da devolução,
  que dizia "mantida" → **corrigido**: as que mudaram saem de uma releitura. **M-3** (anterior, melhorou) o `inicializar` de proposta que
  não existe dá 500 com a chave estrangeira (antes não respondia) → **C342**.
- **Autorização (r2): 0 Critical, 0 Important, 0 Minor.** Executado e correto: maiúsculas, barra final, `//`, `%2F`, query, HEAD/OPTIONS, o
  contrato por nenhum estático, os 5 uploads de 2 MB barrados sem arquivo no disco, o token rebaixado (o `enrichUserFromDb` relê a cada
  pedido); **21** perfis estranhos (`admin_modulos` duplicado, com espaço, `"Comercial"`, JSON duplo; Administrativo por grupo `ativo='1'`,
  `NULL`, `2`; `grupo_id=0`; `permissao '1'`; `is_superadmin` `"true"`/`2`; `role` `" admin"`/`"Admin"`) com a decisão da tela montada do código
  real do client (`systemPermissions.js` + `hasModuleAccess`) contra o status do servidor — **todos iguais**; o `/pdf` como vendedor não
  administrador em três formas (sem linha, grupo, direta) — 200 `%PDF-`; as rotas das cláusulas sem mudança de autorização.
- **Sabotagem (r3, worktree própria `CRM-wt-e147-r3`): 19 sabotagens novas — 14 caíram pela asserção certa, 4 sobreviveram por falta de
  cenário, 1 equivalente; 0 defeitos.** Sobreviventes → cenários: **R12** o BUSY na cópia com a limpeza falhando virava 503 (o client
  repetiria em cima da metade); **R13** o mesmo no `reordenar` com a devolução falhando; **R14** o erro da 2ª consulta do modelo (itens ×
  famílias) engolido; **C3** um `.catch` nas chamadas das cláusulas no client engoliria a frase. Equivalente: o `.trim()` da frase do servidor.
- **Controles da Fase 5, rodados por mim:** **F1** (a devolução pelos ids do corpo), **F2/F3** (o 503 sem a condição do desfazer), **F4** (o
  erro da 2ª consulta engolido) — caíram pelo cenário do ponto, md5 restaurado; e o client sem o retorno do `jaInicializado` — caiu a régua
  da RN-147.08.
- **Fase 5 — `e8a76073`.** `propostaClausulasGrava` de 9 para **12** cenários; `avisoValoresIgnorados.test.js` de 13 para **17**.
- **Suíte antes de `e8a76073`:** `test:api` **468/468**; `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` verdes (4/0, 3/0, 16/0); revisão obrigatória da proposta **23/23** + as rotas (21/0, 11/0, 11/0, 8/0, 26/0, **12/0**, **7/0**) + editor **39/39**; client **143** suítes / **1852** testes; `CI=true build` *Compiled successfully*. É também a verificação do fechamento (depois dela só mudaram documentos).

## Retro (4 números)

1. **Rodadas de correção até verde:** **2** — antes do primeiro commit (o modelo semeado, a contagem do contrato e o import do teste
   antigo, todos do teste) e a Fase 5 (a RN-147.08, a devolução pela releitura e os cenários do r3). Testes antigos mudados: **2** arquivos
   (`uploadsProtegidos`, os middlewares do download do contrato; `avisoValoresIgnorados.test.js`, o import e o desfecho com o 3º argumento).
2. **Achados da revisão:** Fase 2 — **1 Critical + 5 Important + 7 Minor, todos reais** (o que mais pesou: a RN-147.04 escrita sobre uma
   premissa falsa — o documento não usa as imagens do modelo — e a cópia parcial que o 2º salvamento perdia calada). Fase 5 — r1 **1**
   Important da etapa + **2** Minor; r2 **0**; r3 **4** sobreviventes reais (viraram 4 cenários) + **1** equivalente; **0** ruído. **O defeito
   que importou** (o 2º salvamento do preview regravando as cláusulas na vizinha) **é anterior, mas a etapa o tornou o caminho natural**: a
   frase nova manda "salvar de novo" — só uma sonda que simulou o client inteiro (o `diffClausulas` real) achou.
3. **Paralelismo:** **0** galhos em paralelo de fato (T1–T3 dividem o `index.js`; T5 é uma linha no client); **0** retrabalho; **1**
   revisor na Fase 2, **3** em paralelo na Fase 5 sob a trava (o r3 numa worktree própria, removida).
4. **Defeito que escapou:** *(preencher na Etapa 148)*.

## Próxima tarefa detalhada — Etapa 148

*(A série desta etapa foi B958–B964, C337–C342, A95 — a 148 começa em **B965**, **C343**, **A96**; confira com `grep -oE` antes.)*

**Escolhida: a C341 + a C335 — as rotas vizinhas que ainda só pedem o login.** (1) O **modelo de contrato por família**:
`GET /api/clausulas-modelos`, `GET /api/clausulas-modelos/:id/clausulas` e `PUT /api/familias/:id/clausulas-modelo` (`index.js`, perto de
`resolverModeloClausulas` e da rota `/clausulas/inicializar`; o `PUT` muda o modelo de contrato da família, que decide as cláusulas de toda
proposta nova dela) — e as outras rotas de `clausulas_modelo*` se houver (contar `app\.(get|post|put|delete)\('/api/clausulas-modelo`). **Fase
0 obrigatória:** quem chama no client (procure `clausulas-modelo` — a tela de famílias de produto, Configurações → Comercial → Opções por
família?) e em que módulo a tela fica; se a régua for a do Comercial ou a do caminho de Configurações (o `exigirComercialNoModeloDaProposta`
desta etapa). (2) A **OS pelo número** (C335): `GET /api/operacional/ordens-servico/:id`, `/:id/itens`, `/:id/pdf`, `POST /:id/gerar-pdf` e
`GET /api/operacional/os-itens/:os_id` só pedem o login; as telas que chamam são do Operacional (`OrdensServico`, `OSForm`, `OSFormPage`,
`OSDetalhesForm`) e do Comercial (`OSComercialForm`, a rota `/comercial/ordens-servico/editar/:id` monta o `OSFormPage`) — o portão
`exigirComercialOuOperacionalNaProposta` (a régua da tela, os dois módulos) é o candidato; medir antes se o `gerar-pdf` busca algo por HTTP
interno (`index.js`, o `client.get(imagemURL` das imagens dos produtos é `/api/uploads/produtos`, fora do portão) e a relação com a **C332**
(o `POST` e o `proximo-numero` usam a régua antiga do Operacional). Uma consulta **A96** no molde da A95 se houver gente que perde acesso.
**Se couber:** a **C342** (o `inicializar`/`reordenar` de proposta que não existe → 404).

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 146 (que já inclui a da 145 e a **C330**) — **B853**/**C279**, **B808**,
**B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela de
conversões e o grupo acima de família, a régua do tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**,
**C117**/**C118**, **C139**, **C278**; na 05, os itens de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por
cliente e previsto × realizado; na 22, **B13**, **B101**/G30, **G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62; nas
propostas, a verificação do dono da proposta (Fase 12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a
Frente B da lentidão, a **C297** (**B924**), a **B926**, a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**.
Pendem de Postgres: **C98**, **C110**. *(Nada novo para o P.O. nesta etapa: as decisões B958–B963 são reversíveis e estão na letra B.)*

**O que já está pronto e não precisa reabrir:** o `exigir(modulos, { tambemAdminDoModuloCom })` e o `passaPeloCaminhoDeConfiguracoes`
(`services/portaoDasPropostas.js`); o `exigirComercialNoModeloDaProposta` nas 20 rotas do modelo e o `exigirComercialNasPropostas` nas 5 das
listas; o `gravarItensEmSequencia` com rótulo; as frases `msgClausulasNaoCopiadas`/`msgOrdemNaoGravada` e os `responder*` (503 só com o
desfazer feito); o `resolverModeloClausulas`/`carregarClausulasDoModelo` devolvendo o erro; o `mensagemDaFalhaDoSalvar` e o
`AVISO_CLAUSULAS_JA_GRAVADAS` no client; os testes `propostaModeloPortao` (7) e `propostaClausulasGrava` (12 — os gatilhos por proposta-alvo,
`e147_alvo`, são o molde para falhar uma linha de uma proposta só).
