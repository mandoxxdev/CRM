# Etapa 153 (Comercial): os painéis, os relatórios e o mapa exigem o Comercial, e a busca global filtra cada resultado pelo módulo (C355, C352) — plano

> Origem: "Próxima tarefa detalhada — Etapa 153" do plano da 152
> (`docs/superpowers/plans/2026-10-19-almoxarifado-etapa152-custos-de-viagem-pelo-modulo.md`). A etapa é pequena; o design, com a Fase 0
> medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-19): última B **B990**, último C **C361**,
> última A **A100**. Esta etapa: **B991+**, **C362+**, **A101+**. Worktree `CRM-wt-e153`, branch `etapa-e153` (da main `192b35ec`).
>
> **Trava de máquina:** `scratchpad/e153-lock.sh` (o diretório `maquina-testes.lock` de sempre). Um arquivo de teste de servidor por vez,
> inclusive os revisores. A etapa **não** toca o template nem o client; toca o `index.js` (o portão em 7 rotas, o filtro na busca global e o
> aviso do boot), o `services/portaoDasPropostas.js` (o filtro), o preload `despejaCamadasDoExpress.js` (reconhecer o filtro), um helper de
> teste novo, um teste novo e os testes de portão das 145–151 (as camadas do Express).
>
> **Fase 2 (um revisor fresco, lendo o código e com sondas sob a trava — o helper do T1 rodado de verdade sobre as rotas das 145–153): 0
> Critical, 1 Important, 6 Minor — todos aceitos.** *(Divergência de processo: o T1–T3 já estavam escritos, sem commit, quando a revisão
> terminou — ela correu em paralelo com o código, não antes; os achados entraram antes do primeiro commit.)* A medição de quem chama foi
> refeita e **confirmou** a Fase 0 (nenhuma tela fora do Comercial chama as 7; o `baseURL` termina em `/api` nos três caminhos — C362). **I-1**
> o helper não deixava a 148 declarar as rotas da 149 no mesmo prefixo (`/api/familias`, e o PUT/DELETE da OS e dos itens; na 149, o `POST
> /api/operacional/ordens-servico`) sem redeclará-las como da etapa: o `alemDasRotas` passa a aceitar `{ metodo, rota, cadeia }`, que vale
> também no despacho (e a frase "registros de outro prefixo" estava errada: são do **mesmo** prefixo, de outra etapa); medido, **nenhuma**
> das 661 rotas montadas é atendida por outra registrada antes. **M-1** a busca não tem botão no topo (só o *Ctrl+K*; o
> `.busca-global-trigger` que a ajuda procura não existe) — a C364 corrigida. **M-2** o 503 da busca não "vira Nenhum resultado": o
> interceptor repete o pedido até 3 vezes por uma chave sem o termo, e a resposta velha pode aparecer com o termo novo no campo — de antes,
> **C365**. **M-3** o filtro roda antes da conferência do `q`: com o banco ocupado, `q` curto dá 503, não `[]` (a tela nunca manda menos de 2
> caracteres) — o contrato ajustado. **M-4** o nome do filtro no despejo é o mapa inteiro, não `filtro:busca-global`, e os extras incluem
> `<PREFIXO>/9` — o plano alinhado ao código. **M-5** o `GET /api/notificacoes` devolve **todas** as aprovações pendentes da empresa a quem
> tem `pode_aprovar_descontos` (não só as do usuário), e o clique leva a `/propostas/editar/:id` sem o `/comercial` (404 para todos) — a C363
> e a B993 corrigidas (no banco medido só 2, 3 e 9 têm a marca, todos com o Comercial). *(**Estava errado na parte das aprovações** — o handler não as devolve; reproduzido pelo r2 da Fase 5, ver a C363.)* **M-6** o `podeVer` tratava a falta do filtro como
> "todos" — passa a tratar como nenhum (a busca fecha se o filtro sair da rota); o painel faz 5 leituras, não 4 (também
> `/usuarios/por-modulo/comercial` e `/clientes/logos`) — o fluxo do vendedor as inclui; o T4 leva só os 6 testes na integração.

## Fase 0 — medido (antes de qualquer código)

### As rotas (lidas no `index.js`; nenhuma fora dele — `grep -rnE "['\"\`]/(api/)?(dashboard|relatorios|mapa|busca-global|workflows|reports|auditoria)"` no `server/` fora de `node_modules`/`tests` só acha o `index.js`, e o `relatorios: '/api/relatorios'` da linha 3374 é texto de um mapa, não registro)

| # | Verbo e caminho | Só com o login? | O que devolve |
|---|---|---|---|
| 1 | `GET /api/dashboard` | sim | contagem de clientes ativos, projetos ativos, oportunidades (e a soma do valor estimado), projetos e propostas por status, valor aprovado, taxa de conversão (filtros `inicio`, `fim`, `usuario`) |
| 2 | `GET /api/dashboard/historico` | sim | por mês (12 meses): clientes, projetos e propostas aprovadas criados |
| 3 | `GET /api/dashboard/avancado` | sim | propostas por estado, ranking de clientes por compra/proposta/segmento/valor, motivo de não venda, cotações com lembrete… (11 listas, com razão social) |
| 4 | `GET /api/dashboard/vendas` | sim | o painel de vendas (propostas e clientes) |
| 5 | `GET /api/relatorios/executivo` | sim | KPIs, gráficos, insights e recomendações (propostas, clientes e **oportunidades** ativas — contagem e soma) |
| 6 | `GET /api/relatorios/visitas-tecnicas` | sim | clientes com telefone, e-mail, propostas, taxa de conversão e valor aprovado |
| 7 | `GET /api/mapa/maquinas-vendidas` | sim | as propostas aprovadas com a localização dos clientes |
| 8 | `GET /api/busca-global` | sim | até 20: clientes (razão social, cidade), projetos, propostas (título, cliente), oportunidades, atividades, produtos (nome, família) — 5 de cada |
| 9–10 | `GET`/`POST /api/reports` | sim | **stub**: `[]` / `{ message, id: Date.now() }` — não lê nem grava nada |
| 11–14 | `GET`/`POST /api/workflows`, `PUT`/`DELETE /api/workflows/:id` | sim | **stub**: `[]` / mensagens — não lê nem grava nada |
| 15 | `POST /api/auditoria/tentativa-acesso` | sim | grava o `acesso_negado` que a tela *Acesso negado* manda — **tem de** ficar aberta a qualquer logado (é o barrado que a chama) |
| 16 | `GET /api/auditoria/logs` | sim + `canManageUsers` no corpo | os logs — já tem a régua dela (Etapa 133) |

E, varrendo **todas** as rotas só com o login cujo corpo lê `propostas`/`clientes`/`oportunidades`/`atividades`/`projetos`/`produtos`/
`custos_viagens` (`scratchpad/e153/leit.js`, 273 registros): só as 8 de cima, as duas listas abertas da 151 (`GET /api/clientes`,
`GET /api/projetos` — C353), o `POST /api/produtos/:id/clonar` (régua do administrador, B980) e o **`GET /api/notificacoes`** — este devolve
só os lembretes das propostas **do próprio usuário** (responsável ou criador) e as aprovações pendentes a quem tem `pode_aprovar_descontos`:
recortado pelo usuário, não por módulo (vira a **C363**, não entra).

### Quem chama (client inteiro, `client/src`)

- **`Dashboard`** (`/dashboard`, `/dashboard/historico`, `/dashboard/avancado`) e o **`DashboardVendas`** que só ele monta (`/dashboard/vendas`) —
  montados **só** no índice de `/comercial` (`App.js`, dentro do `ProtectedModuleRoute` do Comercial; item *Dashboard* do menu do Comercial).
- **`Relatorios`** (`/relatorios/executivo`, `/relatorios/visitas-tecnicas`) — **só** em `/comercial/relatorios`. Os outros *Relatórios* do
  sistema são outras telas com outras rotas: `FrotasRelatorios` (`/frotas/relatorios/*`), `RelatoriosProducao`, `RelatoriosAlmoxarifado`
  (`/almoxarifado/relatorios*`), o do Financeiro.
- **`MaquinasVendidas`** (`/mapa/maquinas-vendidas`) — **só** em `/comercial/maquinas-vendidas`.
- **O grep por `/dashboard` e `/relatorios` acha o Financeiro, o Operacional, o MES e o Almoxarifado — e nenhum deles chama estas rotas:**
  `Financeiro` → `/financeiro/dashboard`; `DashboardOperacional` → `/operacional/dashboard`; `DashboardMES` → `/operacional/dashboard-mes`;
  `AlmoxarifadoDashboard` → `/almoxarifado/dashboard*` e `/almoxarifado/relatorios/*`; Frota e Produção → `/frotas/dashboard`,
  `/producao/dashboard`. O palpite "o `/dashboard` do Comercial pode ser o mesmo que outra tela lê" — **medido: não é**.
- **`BuscaGlobal`** (`/busca-global`) — montada no **`Layout`**, aberta pelo atalho *Ctrl+K* (não há botão — Fase 2 M-1): o `Layout` é a moldura do
  Comercial, da Frota, do TODOLIST, do Compras, do Financeiro, da Engenharia, da Engenharia/Projetos, do Almoxarifado, de Configurações, da
  Administração e do Chat (a Fábrica tem moldura própria). **Leitura de muitos módulos.** Mas **todo** resultado leva a uma tela do Comercial
  (`getRoute`: cliente → `/comercial/clientes/editar/:id`, projeto → `/comercial/projetos/editar/:id`, proposta →
  `/comercial/propostas/editar/:id`, atividade → `/comercial/atividades`, produto → `/comercial/produtos/editar/:id`; a oportunidade não tem rota
  e a tela a descarta) — quem não tem o Comercial vê o resultado e, ao clicar, toma a tela *Acesso negado*.
- **`ReportBuilder`** e **`WorkflowEngine`** (também no `Layout`, *Ctrl+R* / *Ctrl+W*) chamam `api.post('/api/reports')`,
  `api.get('/api/workflows')`… com o `/api` duplicado (o `baseURL` já termina em `/api` — o mesmo defeito que a busca tinha): o pedido vai a
  `/api/api/reports` e **nunca chega** às rotas; e as rotas são stubs. Vira a **C362** (de antes), não entra.
- **`AcessoNegado`** chama `POST /auditoria/tentativa-acesso` — é o barrado que chama; e o `Logs` (Administração) chama `/auditoria/logs`.
- **Servidor:** nenhum serviço, template ou rota busca estas rotas por HTTP.

### Banco local (cópia de 09/10 do `CRM/server/data`, lida numa cópia no scratchpad — `scratchpad/e153/medir2.js`)

**10** usuários ativos, **4** super/admin (2, 5, 13, 14), **0** grupos. Com o Comercial: 3, 9 (e os super). Sem o Comercial: **7** (Compras +
Almoxarifado), **8** (Engenharia / Projetos), **12** (Almoxarifado), **15** (Almoxarifado + Compras) — os mesmos 4 da A93–A100. O banco tem
**53** clientes, **0** projetos, **57** propostas, **0** oportunidades, **2** atividades, **23** produtos. Os 4 não abrem nenhuma das 7 telas;
na busca global, hoje veem resultados que não conseguem abrir. **Não há registro de uso** da busca (o servidor não guarda pedido).

## Decisão de desenho (vai para a letra B)

- **As 7 rotas dos painéis, dos relatórios e do mapa pelo Comercial pela régua da tela** (o `exigirComercialNasPropostas` da 145–152) — a
  medição não achou leitor fora do Comercial.
- **A busca global NÃO fecha; filtra cada tipo de resultado pelo módulo da tela que o resultado abre.** Um mapa só,
  `TIPOS_DA_BUSCA_GLOBAL = { cliente, projeto, proposta, oportunidade, atividade, produto }` → `['comercial']` para os seis (todos levam a
  uma tela do Comercial). Quem tem o Comercial pela régua da tela vê tudo como hoje; quem não tem recebe **200 `[]`** (a tela mostra *"Nenhum
  resultado encontrado"*), sem log de acesso negado (a busca dispara a cada tecla). Um tipo novo de outro módulo entra no mapa com o módulo
  dele — o filtro é por tipo, não da rota inteira.
- O interruptor é o mesmo **`PROPOSTAS_PORTAO_DE_MODULO=desligado`** (B946): as 7 voltam ao só login e a busca volta a mostrar tudo.

## Regras de negócio

- **RN-153.01 — as 7 exigem o Comercial pela régua da tela (C355).** `GET /api/dashboard`, `/api/dashboard/historico`, `/api/dashboard/avancado`,
  `/api/dashboard/vendas`, `/api/relatorios/executivo`, `/api/relatorios/visitas-tecnicas`, `/api/mapa/maquinas-vendidas`: o
  `exigirComercialNasPropostas` como 2º middleware. Recusa: **403** `{ "error": "Acesso negado ao módulo", "modulo": "comercial" }` e a linha
  `acesso_negado` no log (`modulo = 'comercial'`). `SQLITE_BUSY` ao ler as linhas → **503** (`context: 'portao:propostas'`); outro erro → **500**
  *"Erro ao verificar permissões"*. O corpo de quem passa não muda.
- **RN-153.02 — a busca global filtra por tipo (C352, C355).** `GET /api/busca-global` com o filtro `filtrarBuscaGlobalPorModulo` como 2º
  middleware (antes do handler; depois do login). Super ou role admin: tudo, sem ler as linhas. Os outros: o filtro lê as linhas da tela
  (`SQL_LINHAS_DA_TELA`) e o handler só devolve os tipos cujo módulo `temModuloComoATela` aceita; nenhum tipo aceito → **200 `[]`** sem
  rodar as consultas. Sem log de acesso negado. `q` com menos de 2 caracteres → `[]` como antes. `SQLITE_BUSY` ao ler as linhas → **503**
  (`context: 'portao:busca-global'`); outro erro → **500** *"Erro ao verificar permissões"* (a tela mostra *"Nenhum resultado encontrado"*; no
  503 o interceptor repete o pedido — C365, Fase 2 M-2). Sem o filtro na rota (`req.tiposPermitidos` indefinido), `[]` (Fase 2 M-6). O limite de 20 e de 5 por tipo, a ordem e o corpo de cada resultado não mudam.
- **RN-153.03 — o mesmo interruptor.** `PROPOSTAS_PORTAO_DE_MODULO=desligado`: as 7 voltam ao só login e a busca mostra todos os tipos a
  qualquer logado (o filtro não lê nada). O aviso do boot acrescenta as duas, mantendo as frases que os testes da 147–152 prendem.
- **RN-153.04 — os testes de portão das 145–151 leem as camadas do Express montado (S28–S30 da 152).** Cada um sobe o `index.js` com o
  preload `despejaCamadasDoExpress.js` e ganha um cenário: as rotas da etapa (instanciadas) são atendidas por elas mesmas, com o login e o
  portão esperado na frente, os middlewares de todo pedido antes (os do caminho neutro), nenhum router e nenhum `app.param`; e nenhum outro
  registro (de qualquer arquivo, em qualquer verbo) atende um caminho do prefixo — o que a régua do texto não lê (receptor apelidado,
  `app[verbo]`, `.call`, o verbo `search`, arquivo sem extensão) aparece aqui. A lógica sai do 152 para um helper com controle positivo
  próprio, sobre camadas sintéticas.

## Contratos de API (congelados)

| Rota | Caso | Status | Corpo / mensagem literal |
|---|---|---|---|
| as 7 | sem o Comercial pela régua da tela | 403 | `{ "error": "Acesso negado ao módulo", "modulo": "comercial" }` |
| as 7 | `SQLITE_BUSY` ao ler as permissões | 503 | `{ "error": "Banco temporariamente ocupado. Tente novamente em alguns segundos.", "code": "SQLITE_BUSY", "retryAfter": 3, "context": "portao:propostas" }` |
| as 7 | outro erro ao ler as permissões | 500 | `{ "error": "Erro ao verificar permissões" }` |
| busca | sem o Comercial pela régua da tela | 200 | `[]` (sem log de acesso negado) |
| busca | com o Comercial (ou super/admin) | 200 | como antes: até 20 `{ id, title, subtitle, type }` |
| busca | `q` vazio ou com 1 caractere | 200 | `[]` — depois do filtro: com o banco ocupado, 503 (Fase 2 M-3; a tela nunca manda menos de 2) |
| busca | `SQLITE_BUSY` ao ler as permissões | 503 | o mesmo corpo, com `"context": "portao:busca-global"` |
| busca | outro erro ao ler as permissões | 500 | `{ "error": "Erro ao verificar permissões" }` |
| as 8 | `PROPOSTAS_PORTAO_DE_MODULO=desligado` | — | como antes da etapa (só o login; a busca com todos os tipos) |
| aviso do boot (desligado) | — | — | troca *"…e as dos custos de viagem NAO exigem o Comercial (só o login); a lista de ordens…"* por *"…e as dos custos de viagem NAO exigem o Comercial (só o login), e as dos painéis, dos relatórios e do mapa do Comercial NAO exigem o Comercial (só o login), e a busca global mostra todos os tipos de resultado a qualquer logado; a lista de ordens…"* |

## Tasks (sort topológico)

- [x] **T1 — `09424106` — tronco — o helper das camadas.** `tests/helpers/conferirCamadasDoExpress.js`: `preloadDasCamadas()` (o caminho do preload),
  `amostrasDasCamadas(rotas, { neutro, extras })` (cada rota instanciada — todo `:param` vira `9` —, o caminho neutro, e por prefixo os extras em
  `GET/POST/PUT/DELETE/PATCH/SEARCH`: `<prefixo>/zz-exportar`, `<prefixo>/9/zz-exportar`, `<prefixo>/a/b/c/d`, o prefixo em maiúsculas,
  `<PREFIXO>/9`, `<prefixo>.json`), `conferirCamadas(cam, rotas, { neutro, alemDasRotas })` → a lista de erros: `params` vazio; cada rota atendida por ela
  mesma com a cadeia esperada no começo (`['authenticateToken', 'portao:comercial']`, ou só `['authenticateToken']` para as abertas de propósito)
  e os middlewares do caminho neutro antes, sem router; todo caminho atendido entre os extras atendido por uma das rotas declaradas, com a
  cadeia dela; e `cam.rotas` (todo registro que casa uma amostra em qualquer verbo) igual às declaradas mais `alemDasRotas` (medidas; `{ metodo, rota,
  cadeia }` para a rota de outra etapa no mesmo prefixo, que vale também no despacho — Fase 2 I-1). O `despejaCamadasDoExpress.js`
  reconhece o filtro da busca pela propriedade `tiposDoFiltro` que o filtro pendura: `filtro:<tipo>=<módulos>,…`, o mapa inteiro em ordem
  (Fase 2 M-4).
  Controle positivo próprio no teste novo (T2): camadas sintéticas com cada defeito — rota a mais, cadeia sem o portão, portão em 3º, um
  middleware só do prefixo, um router, um `app.param`, o extra atendido por rota fora da lista, a rota atendida por outra.
- [x] **T2 — `09424106` — tronco — `tests/api/paineisBuscaGlobalPortao.api.test.js`, escrito ANTES do T3 (vermelho medido), pelo `index.js` real (pasta
  vazia), molde do `custosViagensPortao`:**
  - **pelo fonte:** as 7 com `authenticateToken, exigirComercialNasPropostas, ` e a busca com `authenticateToken, filtrarBuscaGlobalPorModulo, `,
    cada uma registrada uma vez (régua no texto inteiro, sem caixa); nenhum registro fora do `index.js`; nenhum `app.use` nos prefixos; a régua
    de todo o servidor (`regua.registrosNaoLiterais`); o mapa `TIPOS_DA_BUSCA_GLOBAL` cobre **todo** `'<tipo>' as type` do corpo da busca;
  - **as camadas** (o helper do T1) e **o controle positivo do helper** (sintético);
  - **o barrado** (só o Almoxarifado): 403 em cada uma das 7 (e sem a query dos filtros quando a tela a manda) — nada grava, o log conta 7
    `comercial`; a busca com um termo que casa os seis tipos devolve **`[]`** e não grava log; **a metade positiva:** o administrador, com o
    mesmo termo, vê os seis tipos;
  - **o fluxo do vendedor (só o Comercial), pela rota:** abre o painel (as 4 chamadas da tela, com e sem os filtros), confere os números contra
    o banco (clientes ativos, oportunidades e a soma, propostas por status), os relatórios (executivo — a contagem das oportunidades ativas —,
    visitas técnicas), o mapa (a proposta aprovada aparece), a busca (os seis tipos com o mesmo termo) — e **segue cada resultado** até a leitura
    que a tela dele faz (cliente → `GET /api/clientes/:id`, projeto → `GET /api/projetos/:id`, proposta → `GET /api/propostas/:id`, atividade →
    `GET /api/atividades`, produto → `GET /api/produtos/:id`): 200 em todos (integração com as 145/150/151). O mesmo, para o barrado: a busca
    não oferece nada que a tela dele barraria (cada leitura dessas → 403);
  - **a tabela por usuário** (os 15 perfis da 152) com a decisão da tela calculada pelo `temModuloComoATela` e as linhas do
    `GET /api/usuarios/:id/grupos`: o painel, o relatório executivo, o mapa e os tipos que a busca devolve (todos ou nenhum) por perfil;
  - **o desligado:** as 7 abrem ao barrado e ao grupo sem o Comercial com o conteúdo (não só o status), a busca devolve os seis tipos; o aviso
    do boot cita as duas; ligado de novo, barra;
  - **o BUSY/500:** 503 no painel (`portao:propostas`) e na busca (`portao:busca-global`); 500 no relatório e na busca; o administrador passa
    sem ler (a busca devolve tudo).
- [x] **T3 — `09424106` — tronco — o código (RN-153.01–03).** `services/portaoDasPropostas.js`: `filtrarPorModulo(tiposPorModulo)` no `criarPortaoDasPropostas`
  (lê as linhas, pendura em `req.tiposPermitidos` o conjunto aceito — `null` = todos —, BUSY → 503 com o contexto dado, erro → 500; desligado
  ou super/admin → `null` sem ler; a função leva `tiposDoFiltro`). `index.js`: o portão nas 7; o `TIPOS_DA_BUSCA_GLOBAL` e o
  `filtrarBuscaGlobalPorModulo` antes da busca; no corpo da busca, cada `results.push` só se o tipo é permitido, e `[]` direto se nenhum é;
  a frase nova do aviso (só acrescenta). Aplicado por script com âncoras contadas.
- [x] **T4 — `654df671` — galho (worktree própria, depois do T1; a sabotagem dele mexe no `index.js` da worktree dele) — as camadas nos testes das 145–151
  (S28–S30).** `propostaPortaoModulo` (145/146: as 49 de `/api/propostas*`, as 5 de `/api/aprovacoes`, o `GET /api/comercial/ordens-servico`),
  `propostaModeloPortao` (147: as 20 do modelo, as 5 das listas de preço), `osModeloContratoPortao` (148), `familiasListaOsPortao` (149),
  `produtosGruposVariaveisPortao` (150, com o clonar sem portão), `clientesProjetosPortao` (151, com as 2 listas só com o login): o preload no
  `subir()`, as amostras de cada etapa, um cenário novo com o helper; a cadeia esperada lida da mesma lista que o cenário do fonte já usa (não
  escrita de novo). Controle positivo por teste: um registro escondido de um caminho do prefixo por `app['get']` (ou receptor apelidado) num
  arquivo que a régua do texto não lê — tem de derrubar o cenário novo, e só ele.

## Decisões (vão para a letra B)

- **B991** — as 7 dos painéis, dos relatórios e do mapa pelo Comercial pela régua da tela. Descartado: (a) "algum dos módulos que as leem" —
  medido: só o Comercial as lê (o Financeiro, o Operacional, o MES e o Almoxarifado têm painéis próprios em outras rotas); (b) a régua antiga
  (`checkModulePermission`, libera o Comercial a todo usuário sem grupo — no banco medido não mudaria nada); (c) aceitar a linha `relatorios`
  (o módulo *Relatórios* que o cadastro de usuário concede, sem tela — `modulosSistema.js`) — nenhuma tela a aceita (a de `/comercial/relatorios`
  exige a linha `comercial`), e aceitá-la abriria a API a quem a tela barra.
- **B992** — a busca global filtra cada tipo pelo módulo da tela que o resultado abre (os seis → o Comercial); quem não tem o Comercial
  recebe `[]`. Descartado: (a) fechar a rota inteira com 403 — a busca está na moldura de todos os módulos e dispara a cada tecla: cada tecla
  de quem não tem o Comercial viraria uma linha de *acesso negado* no log, e um tipo futuro de outro módulo ficaria preso atrás do Comercial;
  (b) deixar cliente e projeto abertos a todos, como as listas deles (C353) — o resultado leva a `/comercial/clientes/editar/:id`, que a tela
  barra: mostrar o que não se consegue abrir é o *"a busca não funciona"* que a própria tela já evita descartando a oportunidade; (c) filtrar só
  na tela — a API continuaria entregando razão social, título de proposta e de oportunidade a quem a tela barra (a C352 é sobre a API).
  **Muda o que a tela mostra:** quem não tem o Comercial (no banco medido, os 4 de sempre) passa a ver *"Nenhum resultado encontrado"* em
  qualquer busca — hoje veem resultados que, ao clicar, dão *Acesso negado*. Reversível: o mapa é uma constante; desligado, volta tudo.
- **B993** — `/api/reports` e `/api/workflows` (6, stubs que não leem nem gravam), `/api/auditoria/*` (a `tentativa-acesso` é chamada
  pelo próprio barrado; os `logs` já têm régua) e `/api/notificacoes` (os lembretes das propostas do próprio usuário — C363) **não** entram. Descartado: pôr o
  portão nos stubs — não protegem dado nenhum e a tela nem chega a eles (C362).
- **B994** — a próxima etapa (154).

## Avisos novos (C)

- **C362** — o *Construtor de relatórios* (*Ctrl+R*) e o *Motor de fluxos* (*Ctrl+W*) da moldura chamam as operações com o `/api` duplicado e
  nunca chegam ao servidor; e as operações do servidor são de mentira (devolvem lista vazia e "salvo com sucesso" sem gravar). De antes.
- **C363** — as notificações do sino (na moldura de todos os módulos *— **estava errado**, medido na Etapa 154: o `Layout` importa o sino e não
  o desenha; só o painel do Comercial o mostra*) mostram a quem perdeu o Comercial os lembretes das propostas de que é
  responsável ou criador (número, título, mensagem, cliente); o clique leva a `/propostas/editar/:id` sem o `/comercial` (404). De antes.
  **As aprovações pendentes NÃO saem:** o handler as lê e devolve só os lembretes (`todasNotificacoes = [...notificacoesLembretes]`). *(A
  primeira versão dizia "recortado pelo usuário" — certo para os lembretes; a Fase 2 M-5 o "corrigiu" para "todas as aprovações da
  empresa" — **estava errado**, reproduzido pelo r2 da Fase 5: um usuário com a marca e sem o Comercial, com uma aprovação pendente no
  banco, recebe `200 []`.)*
- **C364** — quem não tem o Comercial abre a busca pelo atalho *Ctrl+K* (com o texto *"Buscar clientes, projetos, propostas..."*) e agora
  nunca acha nada. Candidata: desligar o atalho para quem não tem nenhum tipo (é da tela). *(A primeira versão falava de um botão no topo —
  não existe, Fase 2 M-1.)*
- **C365** — com o banco ocupado, a busca global pode mostrar o resultado de um termo anterior com o termo novo no campo: o interceptor
  repete o pedido ocupado até 3 vezes por uma chave que não leva o termo, e a tela não descarta resposta velha. De antes (Fase 2 M-2).

## Execução

- **Linha de base:** a da main `192b35ec` (a 152 fechou com `test:api` **474/474**).
- **TDD, vermelho medido:** `paineisBuscaGlobalPortao` contra o `index.js` da main **1 passed, 7 failed** (o fonte sem o portão nas 7 e
  sem o filtro; as camadas com `authenticateToken, <anonima>`; o barrado tomava **200** nas 7 e via os seis tipos na busca; a tabela por
  usuário inteira em 200; o aviso sem as frases; o BUSY respondia 200 com o conteúdo — o que passou foi o controle do helper, que não depende
  do servidor). Com o T3: **8/0** (antes, um erro do teste: o subtítulo do cliente sai em maiúsculas).
- **Divergências do plano:** (1) a Fase 2 correu **em paralelo** com o T1–T3 (não antes); os achados entraram antes do primeiro commit —
  o `alemDasRotas` com objeto (I-1), o `podeVer` fechado sem o filtro (M-6), as duas leituras a mais do painel no fluxo (M-6); (2) T1, T2 e
  T3 num commit só (o teste é a prova do portão e do filtro; o T3 aplicado por script com âncoras contadas — `scratchpad/e153/t3.js`); (3) o
  T4 rodou num agente em worktree própria (`CRM-wt-e153-t4`, removida) **em paralelo** com os controles do T1–T3, com cópias sem commit do
  tronco; entrou na branch por cópia dos 6 testes (não por cherry-pick), conferida a igualdade do helper; (4) o helper ganhou
  `cadeiaDoPortao` (o identificador do fonte → o nome no despejo), fora do plano, para o T4 não reescrever cadeias.
- [x] **T1/T2/T3 — `09424106`**; [x] **T4 — `654df671`**.
- **Controles K1–K15 (T1–T3, `scratchpad/e153/k/sabota.js`, sob a trava, âncora contada, restauro por cópia, md5 conferido nos três
  arquivos):** caíram **13**: K1 sem o portão no mapa (o fonte, as camadas, o barrado, a tabela); K4 o cliente também do Almoxarifado (as
  camadas — o nome do filtro —, o barrado, o fluxo, a tabela, o desligado); K5 o contexto do 503 (o BUSY); K6 o filtro sem o desligado (o
  desligado); K7 o filtro sem o bypass do administrador (o BUSY: "o administrador passa sem ler"); K8 o aviso (o desligado); K9 um registro
  escondido por apelido (o fonte e as camadas); K10 o helper sem conferir a cadeia (o controle do helper); K11 um middleware na frente do
  filtro (todos menos o helper); K12 o produto sem o filtro (o fonte); K13 outro portão no painel de vendas (o fonte, as camadas, o barrado,
  o fluxo, o desligado); K14 a busca sem o filtro (todos menos o helper — a busca fecha para todos, M-6). **Sobreviveram 2, de propósito:**
  K2 (`podeVer` sempre verdadeiro) e K15 (sem o retorno antecipado) — com os seis tipos num módulo só, o conjunto é "todos ou nenhum", e
  cada uma das duas proteções cobre a outra; **K2+K15 juntas caem** (4 cenários). Declarado: a suíte não distingue as duas sozinhas.
- **Controles do T4 (o agente, `scratchpad/e153/t4/sabotar.js`):** em cada um dos 6 testes, um registro escondido por apelido num caminho
  que coincide com uma amostra extra (`apelido153['post'|'search'|'delete'|'patch'|'put'](…)`, e `app.post.call` na 145) e, na 151, uma
  sombra sem portão do `GET /api/clientes/:id` registrada antes da verdadeira: o cenário novo caiu em todos (na 147 **só** ele; nas
  148–151 também o `registrosNaoLiterais`; na 145 também a contagem de linhas do fonte; na 151 os cenários pela rota, porque a sombra
  respondia 200). Verde: 145 **12/0**, 147 **8/0**, 148 **9/0**, 149 **10/0**, 150 **11/0**, 151 **8/0**.
- **Suíte antes de `09424106`/`654df671`:** `test:api` **475/475**; `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite`
  **4/0, 3/0, 16/0**; revisão obrigatória da proposta **23/23** (as rotas dela no `test:api`) + editor **39/39**; client **143** suítes /
  **1856** testes; `CI=true build` *Compiled successfully*.
- **A101** rodada no banco local (cópia de 09/10): os **4** de sempre (15, 8, 7, 12), todos com zero propostas; controle numa cópia com o
  Comercial dado ao 15 e uma proposta passada ao 8: o 15 saiu, o 8 com 1 (`scratchpad/e153/a101run.js`). *(A primeira versão contava a marca
  de aprovar desconto — trocada pela contagem das propostas quando a Fase 5 r2 desmentiu a C363 da Fase 2.)*
- **C362** reproduzida (`scratchpad/e153/sonda/reports.js`): `POST /api/api/reports`, `GET/POST /api/api/workflows`, `PUT/DELETE
  /api/api/workflows/1` → **404** *Cannot …* (o `GET /api/workflows` → 200 `[]`).

## Fase 5 — três revisores frescos em paralelo, sob a trava

- **Regra (r1): 0 achados.** O `index.js` real numa pasta vazia, 42 registros casando o termo (com acento, `%` e `_`), 9 usuários que a tela
  admite e 7 que ela barra, 29 gestos por usuário (as 7, o painel e o avançado com os filtros e com `usuario=abc`, 17 variações da busca, o
  clique até a leitura da tela aberta), ligado e desligado: **261** pares status+corpo iguais para os admitidos (9 diferenças cruas no
  executivo eram só a ordem das chaves, montadas em callbacks paralelos — de sempre); o limite de 20 e de 5 por tipo, a ordem e o corpo da
  busca iguais; os barrados **189/189** certos, 10 linhas de acesso negado por barrado e **0** da busca. Informativos (de antes): `q`
  repetido vira `"a,b"`; o `LOWER` do SQLite não converte letra acentuada.
- **Autorização (r2): 0 achados de código; 1 de documento.** **51** perfis × 8 rotas contra uma cópia independente do `hasModuleAccess`
  sobre as linhas do `GET /api/usuarios/:id/grupos` — **0** divergências (com rebaixado, des-super, grupo desativado e usuário tirado do
  grupo com token antigo: 403 no pedido seguinte; desativado e apagado: 401); **980** variações de caminho e método do barrado e **340** da
  busca (`q` em lista, `q[]`, 15 000 caracteres, `%00`…) — **0** vazamentos (controle: o vendedor lê); o barrado só grava o log; o 503/500 do
  filtro não traz dado. **O achado:** a C363 que a Fase 2 (M-5) reescreveu — "todas as aprovações pendentes da empresa" — **estava errada**:
  o handler lê as aprovações e devolve só os lembretes (`todasNotificacoes = [...notificacoesLembretes]`); reproduzido (a marca de aprovar,
  sem o Comercial, uma aprovação pendente no banco → `200 []`). C363, B993, A101 corrigidas (a A101 passou a contar as propostas da pessoa).
- **Sabotagem (r3, worktree própria `CRM-wt-e153-r3`, removida): 35 sabotagens válidas — 26 caíram pela asserção certa, 0 pela errada,
  9 sobreviveram; 3 controles.** As famílias: **(1)** uma rota nova num caminho literal que nenhuma amostra casa, registrada por `.call`
  (S16 `vendas.json`, S17 `/api/relatorios/exportar`, S29b `/api/relatorios/:id/:formato`) — o barrado recebia os clientes; **(2)** o
  middleware só do prefixo com o **nome** de um global registrado depois das rotas (S22, `tratarErroFormatoImagem`) — sem token, o painel
  respondia; **(3)** o controle do helper não prendia a rota de outra etapa no despacho (S25), o extra `/9/zz-exportar` (S29) e o nome do
  filtro (S30b — e o fonte só conferia as chaves do mapa); **(4)** o super no BUSY (S05); **(5)** a ordem dos resultados (S14).
- **Correções da Fase 5 (`b1918f1a`):** o despejo lista **todas** as rotas da pilha (com o prefixo dos routers montados) e o helper confere
  que toda rota num prefixo do teste é declarada (`prefixos` de que o teste é dono; os divididos com outra etapa — `/api/comercial`,
  `/api/familias`, `/api/operacional/*` — ficam com o teste dono e as de outra etapa em `alemDasRotas`, medidas) e que nenhuma tem caminho em
  regexp — família 1; o despejo dá a posição de cada camada (`idx`) e o helper exige que todo middleware de antes seja um que o caminho neutro
  roda **na mesma posição** — família 2 (a primeira versão, "os do neutro antes da rota", errava no apelido `/familias`, fora do `/api`:
  medido, corrigido para "subconjunto"); o nome do handler mora em `nomeDaCamada.js`, e o controle do helper ganhou a rota de outra etapa
  com a cadeia errada, o extra `/9/zz-exportar`, o nome do filtro com dois módulos, a rota fora das amostras, a de regexp e o despejo sem a
  lista — família 3; o fonte confere os **valores** do mapa; o BUSY com o super; a ordem dos tipos — famílias 3, 4, 5. A régua do texto
  passou a acusar `.call`/`.apply` (o `.bind` não: o `sqliteConcurrency` faz `db.get.bind(db)` — medido; as camadas cobrem). O
  `custosViagensPortao` (152) trocou a conferência inline pelo helper (a instância das amostras passou a ser a do helper).
- **Controles da Fase 5, rodados por mim com o harness do r3 (`scratchpad/e153/r3/sab.js`, na worktree dele com as correções):** S05, S14,
  S16, S17, S22, S25, S29, S29b caem, cada um pela asserção nova (S16/S17/S29b pela enumeração — *"rotas montadas nos prefixos da etapa que o
  teste nao declara"* — e pela régua do `.call`; S22 por *"middlewares antes … > 199:tratarErroFormatoImagem"*; S25/S29 pelo controle do
  helper; S05 pelo super no BUSY; S14 pela ordem); S30b (refeita como S30c — o nome mudou de arquivo) e S30a2 caem pelo fonte (os valores
  do mapa) e pelo controle do helper. **S25b** (o helper sem conferir a cadeia da rota de outra etapa + a 149 sem portão) continua verde **na
  148** — de propósito: a metade do helper cai no controle dele (S25) e a rota da 149 sem portão cai no teste da 149 (o dono do prefixo).
- **Suíte antes de `b1918f1a`:** `test:api` **475/475** (os de portão: 145 **12/0**, 147 **8/0**, 148 **9/0**, 149 **10/0**, 150 **11/0**, 151 **8/0**, 152 **8/0**, 153 **8/0**); `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; revisão obrigatória
  da proposta **23/23** + editor **39/39**; client **143** suítes / **1856** testes; `CI=true build` *Compiled successfully*. É também a verificação
  do fechamento (depois dela só mudaram documentos).

## Retro (4 números)

1. **Rodadas de correção até verde:** **4** — o subtítulo em maiúsculas (antes do primeiro commit), a Fase 2 (antes do commit), a Fase 5 (a
   enumeração e a posição) e a primeira versão da posição (o apelido fora do `/api` e o `.bind` do `sqliteConcurrency` acusados — medidos e
   corrigidos). Testes antigos mudados: **7** (os de portão das 145–152, de propósito — o T4 e a Fase 5).
2. **Achados da revisão:** Fase 2 — **1 Important + 6 Minor, reais**; **1** deles (M-5) **errado** (a Fase 5 r2 o desmentiu, reproduzido).
   Fase 5 — r1 **0**; r2 **1** (o M-5); r3 **9** sobreviventes reais (5 famílias) + 0 inválidas; **0** ruído.
   **O que mais pesou:** a prova "pelo servidor montado" só valia dentro das amostras — ler a pilha inteira é o que fecha a família.
3. **Paralelismo:** **1** galho em paralelo de fato (o T4, num agente em worktree própria, enquanto eu rodava os controles do tronco);
   **1** retrabalho (o helper mudou no meio — a Fase 2 I-1 — e o T4 refez a 148/149 com a forma objeto); **1** revisor na Fase 2 (em paralelo
   com o código — divergência), **3** em paralelo na Fase 5 sob a trava.
4. **Defeito que escapou** *(preenchido na Etapa 154)*: **0** de código; **1** de documento — a **C363** dizia *"o sino (na moldura de todos
   os módulos)"*: **estava errado** — o `Layout` importa o `Notificacoes` e não o desenha; só o painel do Comercial o mostra (Fase 0 da 154);
   **1** de prova — o helper das camadas não vê um middleware global registrado por receptor apelidado sem caminho (Fase 5 r3 da 154, R2).

**Retro da 152 — o defeito que escapou (preenchido aqui):** **0** de código; **2** de prova — a leitura das camadas que a 152 escreveu
inline no `custosViagensPortao` só via as rotas que casavam uma amostra e comparava os middlewares de antes só pelo nome (a Fase 5 r3 da 153,
famílias 1 e 2, reproduzidas no helper extraído dela); e **0** de documento.

## Próxima tarefa detalhada — Etapa 154

*(A série desta etapa foi B991–B994, C362–C365, A101 — a 154 começa em **B995**, **C366**, **A102**; confira com `grep -oE` antes.)*

**Escolhida: a lista de clientes e a de projetos pela régua dos módulos que as leem (C353), e as notificações do sino pelo Comercial
(C363).** Hoje `GET /api/clientes` e `GET /api/projetos` só pedem o login (RN-151.03, B983): quem só tem Compras, Financeiro ou Engenharia lê
pela integração a lista de clientes com CNPJ, telefone, e-mail e endereço. A candidata da C353: a régua "algum dos módulos que as leem" —
`portaoDasPropostas.exigir(['comercial', 'almoxarifado', 'operacional'])` (basta um). **Meça antes, chamador por chamador** (`grep -rn
"'/clientes'\|\"/clientes\"\|/clientes?\|'/projetos'" client/src`): a 151 achou o Almoxarifado (material, reservas, movimentações, sobras) e a
OS da Fábrica (`OSForm`); confira o Compras (pedido/cotação mostram cliente?), o Financeiro (contas a receber por cliente?), a Frota e a
Engenharia — quem ler entra na régua. A regra do usuário: não trancar fora quem usa hoje; se aparecer leitor de muitos módulos, a régua é a
lista deles. Junto: as notificações (`GET /api/notificacoes`, na moldura de todos os módulos) — os lembretes são propostas: o filtro por tipo
da 153 (`filtrarPorModulo`) com `lembrete_proposta → comercial`, e o endereço do clique com o `/comercial` (`Notificacoes.js:55`, hoje
`/propostas/editar/:id` → 404). Uma consulta **A102** no molde da A101 se houver gente que perde.
**Pontos de atenção:** (1) o molde é o `paineisBuscaGlobalPortao` (8 cenários) e o helper `conferirCamadasDoExpress` (com `prefixos` e
`alemDasRotas` medidos — as listas de clientes e projetos dividem o prefixo com as 151; o teste da 151 é o dono e tem de mudar a cadeia das
duas listas: hoje ele as prende "só com o login" — RN-151.03 muda, e a spec dela diz que estava assim por decisão B983, não por erro); (2) o
desligado da 145 (`PROPOSTAS_PORTAO_DE_MODULO`) — a lista de OS da 149 voltava à régua antiga no desligado: decida e registre se as listas
voltam ao só login (como antes) ou à régua antiga; (3) o `OSForm` da Fábrica e as telas do Almoxarifado tratam 403 da lista? Leia o `catch`
de cada uma antes (uma lista vazia calada seria pior que a mensagem).

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 152 — **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o
resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela de conversões e o grupo acima de família, a régua do
tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens de
produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**, **B101**/G30,
**G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62, a **C348**; nas propostas, a verificação do dono da proposta (Fase
12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a Frente B da lentidão, a **C297** (**B924**), a **B926**,
a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**; no Operacional, a **C332**; do Comercial, a **C354**, a
**C357**/**B988**, a **C359**/**B989** (e a **C360** junto), a **C358**. Pendem de Postgres: **C98**, **C110**. **Novo nesta etapa, do P.O.:** a
**C362** (tirar os atalhos do Construtor de relatórios e do Motor de fluxos, ou fazer as duas ferramentas de verdade). *(A **C364** —
desligar o *Ctrl+K* para quem não tem tipo nenhum — e a **C365** — a busca descartar a resposta velha — são candidatas técnicas da tela,
não do P.O.; as decisões B991–B993 são reversíveis e estão na letra B.)*

**O que já está pronto e não precisa reabrir:** o portão nas 7 leituras do painel, dos relatórios e do mapa; o filtro por tipo da busca
(`filtrarPorModulo` no `portaoDasPropostas`, `TIPOS_DA_BUSCA_GLOBAL` no `index.js`); o teste `paineisBuscaGlobalPortao` (8); o helper
`conferirCamadasDoExpress` (com a enumeração de todas as rotas, a posição dos middlewares, `cadeiaDoPortao`, `prefixos`, `alemDasRotas` com
objeto) e o `nomeDaCamada`, usados pelos testes de portão das 145–153; a régua do texto com `.call`/`.apply`. Candidatas menores para encaixar
se sobrar: **C351** (o `encodeURIComponent` nas três telas da OS), **C361** (um prazo na geocodificação), **C364**, **C365**.
