# Etapa 160 (Operacional/Fábrica e Almoxarifado): a régua da 159 chave por chave nas telas da Fábrica e nas listas do Almoxarifado — os filtros que não casam, as buscas com acento — e as sobras C388 e C389 — plano

> Origem: "Próxima tarefa detalhada — Etapa 160" do plano da 159
> (`docs/superpowers/plans/2026-10-19-almoxarifado-etapa159-filtros-do-comercial-que-o-servidor-ignorava.md`). Etapa de consertos técnicos;
> o design, com a Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-19): última B **B1017**, último C **C389**,
> última A **A103**. Esta etapa: **B1018+**, **C390+**, **A104+**. Worktree `CRM-wt-e160`, branch `etapa-e160` (da main `df3f174b`).
>
> **Fase 2 (um revisor fresco, só leitura, ANTES do código): 0 Critical, 6 Important, 9 Minor — todos aceitos; o plano abaixo já está
> corrigido.** **I1** o gesto seguinte à RN-160.01 é a C389 de novo: o formulário de edição da OS (`OSForm.js:163`) recebe o gravado `ALTA`
> e as opções são minúsculas — a tela mostra *"Baixa"* (a primeira opção), e o *Tipo* `MANUTENCAO` mostra *"Fabricação"*; o selo da lista
> vira `priority-ALTA` (o CSS só tem `.priority-alta`) — entra (RN-160.08 generalizada; o selo em minúsculas). **I2** a resposta de hoje do
> `POST /propostas` é `{ id, numero_proposta: numeroFinal, ...req.body }`: o corpo **sobrescreve** o número gerado — com o número enviado já
> existente, a proposta é gravada com o próximo livre e a resposta devolve o repetido, que a tela guarda e manda no próximo `PUT` — é mudança
> que o usuário vê (B1022) e ganha teste. **I3** a invalidação do painel da produção (9 lugares) só limpa o cache do navegador; a abertura
> seguinte cai nos 30 s do servidor — a invalidação passa a marcar que a próxima busca vai com `refresh=1`. **I4** a T4 (a busca das
> atividades/horas) e a T5 (`casaBusca`) eram a mesma função — a função vira tronco de tela, antes das telas, com o contrato inteiro. **I5**
> mais duas telas com o filtro que não apara: as abas *Liberação por valor* e *Perfis de acesso* das Configurações do Almoxarifado
> (`ConfiguracoesAlmoxarifado.js:3283`, `:3420`) — entram (só o filtro). **I6** o mínimo de 2 letras dos seletores de material mede o termo
> cru (`"  "` passa) — passa a medir o aparado. **M1** a Fase 0 errou duas telas: os Roteiros não mandam `search` (a busca deles muda só pela
> API) e as Máquinas mandam só `search` — corrigido na tabela. **M2** a OS com `status` nulo fica fora do kanban hoje (`NULL NOT IN` =
> nulo) — passa a entrar (`COALESCE`). **M3** `tipo` não texto = sem filtro; o `escapar` escapa `\`, `%` e `_` (medido: `JOAO\_SILVA`
> acha `JOAO_SILVA` e não `JOAOXSILVA`). **M4** o log da releitura sem linha: *"linha nao encontrada"* (como o do cliente). **M5** segmento
> gravado nulo/vazio/só espaços → *"Selecione..."*, sem opção a mais. **M6** o *Atualizar* com outra busca em voo: a resposta velha não pode
> sobrescrever a nova. **M7** o contador dos Materiais fica dentro do `loadMateriais` (o excluir também chama). **M8** o `GET
> /operacional/dashboard` (`index.js:21769`, `prioridade IN ('alta','urgente')`) tem a C390, mas nenhuma rota monta essa tela — observado
> (C400). **M9** o contador das OS cobre o recarregamento do excluir.

## Fase 0 — medido (antes de qualquer código)

Régua: para cada tela que a rota do `App.js` monta em `/fabrica/*` e `/almoxarifado/*` (pelo `routes/lazyModules.js`, não pelo nome
imaginado — o `/fabrica/producao-kanban` monta `operacional/Producao.js`; `/fabrica/atividades` monta `operacional/AtividadesColaboradores`),
cada chave que a tela põe no pedido e o `req.query` da rota; se a busca de texto compara coluna gravada em maiúsculas com `LIKE` cru; e o
filtro do navegador. Medido por três leitores em paralelo (Fábrica; Almoxarifado parte 1 e parte 2) e conferido aqui nas linhas citadas.

**O que a medição mostrou, no geral:** no Almoxarifado **nenhuma rota deixa de ler uma chave que a tela manda** e nenhuma trata o *"Todos"*
(`''`) como valor (todas as telas omitem a chave vazia). Os defeitos estão na comparação (texto gravado em maiúsculas comparado com o valor
minúsculo da tela; `LIKE` cru com acento; termo não aparado) e em telas que pedem e descartam. **Nenhuma rota da Fábrica nem do
Almoxarifado usava `condicaoDeBusca`.** Nenhuma porta que mexe em saldo entra (todas as rotas desta etapa são leituras, salvo os quatro
`POST` do Comercial da C388).

| Tela (componente montado) | Pedido | Chaves | A rota lê? | Achado |
|---|---|---|---|---|
| Ordens de serviço da Fábrica (`operacional/OrdensServico`) | `GET /operacional/ordens-servico` | `search`, `status`, `prioridade` | todas (`index.js:20287`) | **C390** a prioridade nunca casa; **C392** a busca |
| Kanban (`operacional/Producao`) | `GET /operacional/producao/kanban` | — | — | **C391** |
| Colaboradores (`operacional/Colaboradores`) | `GET /operacional/colaboradores` | `search`, `status`, `setor` | todas (`index.js:20107`) | **C392** (o nome é gravado em maiúsculas) |
| Equipamentos (`operacional/Equipamentos`) | `GET /operacional/equipamentos` | `search`, `status` | todas (`index.js:22177`) | **C392** (nome e modelo em maiúsculas) |
| Atividades dos colaboradores, Horas extras | `GET /operacional/atividades-colaboradores`, `/horas-extras` | só `status` | sim | **C394** a caixa *Buscar* não faz nada |
| Ordens de produção, Máquinas, Roteiros (`producao/*`) | `GET /producao/ops` (`search`, `status`), `/maquinas` (só `search`), `/roteiros` (nenhuma — a busca só pela API; Fase 2 M1) | — | todas (`producaoService.buildSearchWhere`) | **C392** (a razão social do cliente é gravada em maiúsculas; o setor da máquina vem com acento) |
| Painel da produção (`producao/ProducaoDashboard`) | `GET /producao/dashboard` | — (a rota lê `refresh`) | — | **C394** o *Atualizar* não passa do cache de 30 s do servidor |
| Paradas (`producao/ParadasProducao`) | `GET /producao/paradas?em_andamento=1` **e** `/producao/paradas` | `em_andamento` | sim | **C394** o pedido filtrado é descartado; as em andamento saem das 500 últimas |
| Apontamentos, Relatórios, Configurações, Presença | — | datas e fixos | sim | sem achado de chave (as datas em UTC — **C397**, de antes) |
| Edição da OS (`operacional/OSFormPage` → `OSForm`) | `GET /operacional/ordens-servico/:id` | — | — | **C390** (o gesto seguinte, Fase 2 I1): o gravado `ALTA`/`MANUTENCAO` não casa com as opções minúsculas — mostra *"Baixa"*/*"Fabricação"* |
| Materiais (`almoxarifado/MateriaisAlmoxarifado`) | `GET /almoxarifado/materiais` | `search`, `categoria`, `familia_id`, `subfamilia_id`, `status` | todas (`routes/almoxarifado.js:389`) | **C393** a busca; **C395** a resposta velha |
| Retalhos (`SobrasAlmoxarifado`) | `GET /almoxarifado/sobras` | `status`, `material_id`, `q` | todas (`scrapService.js:31`) | **C393** |
| Ferramentas, Empréstimos (`FerramentasAlmoxarifado`) | `GET /ferramentas`, `/emprestimos` | `status`, `busca`, `exige_calibracao`; `vencidos`, `colaborador` | todas (`toolService.js:397`, `:431`) | **C393** |
| Relatórios — Histórico de movimentações | `GET /relatorios/historico-movimentacoes` | `usuario`, `tipo`, … | todas (`reportService.js:224`) | **C393** o `usuario` com acento; o `tipo` exato (texto livre) |
| Nova requisição, Recebimentos (o seletor de material) | — (filtro no navegador) | — | — | **C395** não apara; quebra com nome nulo |
| Configurações (estoques mínimos, Liberação por valor, Perfis de acesso), Regras de aprovação | — (filtro no navegador) | — | — | **C395** não apara (as duas abas do meio: Fase 2 I5) |
| Movimentações, Requisições, Recebimentos, Reservas, Inspeções, Não conformidades, Lotes, Devoluções, Remessas, Reposição, Notificações, Auditoria, Mapa, Configurações (as listas) | vários | todas lidas | sim | sem chave ignorada; respostas velhas e selects incompletos — **C396**/**C399**, de antes |

**Os achados que esta etapa conserta (todos de antes, medidos; nenhum depende do P.O.):**

- **C390 — o filtro *Prioridade* das ordens de serviço nunca casa.** A tela manda `prioridade=alta` (o valor da opção, minúsculo); o
  cadastro grava `ALTA` (`normalizarMaiusculas(req.body, ['tipo_os', 'prioridade', …])`, `index.js:20593`/`:20653`); a rota compara
  `os.prioridade = ?` (`:20334`) — *"Alta"* escolhido = lista vazia. A rota das OS do Comercial (`:20433`) tem a mesma comparação. E o
  gesto seguinte (Fase 2 I1): a edição da OS (`OSForm.js:162-163`) mostra *"Baixa"* para o gravado `ALTA` e *"Fabricação"* para `MANUTENCAO`
  (nenhuma opção casa, o navegador marca a primeira) — quem "corrige" o campo grava errado; o selo da lista (`priority-ALTA`,
  `OrdensServico.js:174`) fica sem cor.
- **C391 — o kanban da produção mostra OS concluídas e canceladas e não ordena por prioridade.** O filtro é `os.status NOT IN ('concluida',
  'cancelada', 'encerrada')` (`index.js:21370`), mas o formulário grava `concluido`/`cancelado` (`OSForm.js:400-401`); a ordem é `CASE
  os.prioridade WHEN 'urgente' …` em minúsculas contra o gravado `URGENTE` — toda OS cai no `ELSE 3`.
- **C392 — as buscas da Fábrica não acham a letra acentuada nem aparam o termo.** Ordens de serviço (`numero_os`, `descricao` —
  `index.js:20325`), colaboradores (`nome`, `matricula`, `cpf` — `:20116`), equipamentos (`nome`, `codigo`, `modelo` — `:22183`), e o
  `buildSearchWhere` da produção (OPs: `numero_op`, `produto_descricao`, `produto_codigo`, `numero_os`, `razao_social` do cliente; máquinas:
  `codigo`, `nome`, `setor`, `centro_trabalho`; roteiros) — todas `LIKE '%termo%'` cru. *"joão"* não acha *"JOÃO SILVA"*; *"joão "* não acha
  nada.
- **C393 — as buscas do Almoxarifado, idem.** Materiais (`nome`, `codigo`, `descricao`, `fornecedor_principal` — `routes/almoxarifado.js:425`;
  o cadastro grava como digitado, então *"VÁLVULA"* digitado em maiúsculas não é achado por *"válvula"*), retalhos (`q`: `norma`,
  `dimensoes_originais`, `dimensoes_restantes`, `material_descricao`), ferramentas (`busca`: `codigo_patrimonio`, `nome`), empréstimos
  (`colaborador`: `colaborador_nome`), o relatório *Histórico de movimentações* (`usuario`: `usuario_nome`, gravado do nome do usuário — em
  maiúsculas pelo cadastro de usuários; a nota do relatório já declarava *"ignora maiúsculas só em letras sem acento"*) e o `tipo` do mesmo
  relatório (campo de texto livre comparado `m.tipo = ?` exato: *"saida"* = vazio).
- **C394 — três telas da Fábrica que pedem e não usam.** O *Atualizar* do painel da produção nunca manda `refresh` (o servidor guarda 30 s);
  as *Paradas em andamento* saem do histórico (`LIMIT 500`) em vez do pedido `em_andamento=1` que a tela já faz e joga fora; a caixa
  *Buscar* das Atividades dos colaboradores e das Horas extras não vai a lugar nenhum (só recarrega a mesma lista a cada tecla).
- **C395 — os filtros do navegador do Almoxarifado.** O seletor de material da *Nova requisição* (`RequisicaoForm.js:88`) e do recebimento
  (`RecebimentosAlmoxarifado.js:949`) não aparam o termo (e o mínimo de 2 letras mede o termo cru — Fase 2 I6) e quebram com material sem
  nome (`m.nome.toLowerCase()`); os filtros dos estoques mínimos (`ConfiguracoesAlmoxarifado.js:1431`), da *Liberação por valor* (`:3283`),
  dos *Perfis de acesso* (`:3420`) e das regras de aprovação (`TabRegrasAprovacao.js:189`) não aparam. E a lista de
  **Materiais** (a busca com pausa de 300 ms) não descarta a resposta de um pedido que não é o último.
- **C388 (de antes, da 159)** — `POST /projetos`, `/propostas`, `/oportunidades` e `/atividades` respondem `{ id, ...req.body }` (as
  propostas, `{ id, numero_proposta, ...req.body }`): o corpo como veio, com campos não gravados e sem os padrões do banco. **Quem lê:** no
  `client/src`, `ProjetoForm`, `OportunidadeForm` e `Atividades` não leem a resposta; as duas telas da proposta leem só `id` e
  `numero_proposta` (`proposta/PropostaForm.js:395-398`; `PropostaForm.js:688-708`, `:2123-2131`). Ninguém lê mais que isso. *(Esta frase
  dizia "não é B de contrato, é B de forma" — **estava errado** (Fase 2 I2): no `POST /propostas` o corpo vem **depois** do número gerado
  (`index.js:7661`) e o sobrescreve; com o número enviado já existente, a proposta é gravada com o próximo livre e a resposta devolve o
  repetido — a tela o guarda (`proposta/PropostaForm.js:397`) e manda no próximo `PUT`. A resposta nova muda o número que a tela mostra —
  B1022.)*
- **C389 (de antes, da 159)** — o seletor *Segmento* do formulário do cliente mostra *"Selecione..."* ao editar: o gravado *"COSMÉTICOS"*
  (o `toUpper` do cadastro) não é o valor de nenhuma opção (*"Cosméticos"*).

**Observados e fora (C, de antes — registrados, nenhum conserto nesta etapa):**

- **C396** — as outras listas com filtro sem descarte da resposta velha: Fábrica (OPs, máquinas, ordens de serviço, colaboradores,
  equipamentos, relatórios da produção ao trocar de aba) e Almoxarifado (movimentações, requisições, recebimentos, reservas, inspeções, não
  conformidades, o painel ao trocar o período; os Relatórios ao trocar de relatório com a consulta em andamento — a exportação sai com o tipo
  novo e os parâmetros do antigo). *(As ordens de serviço da Fábrica entram nesta etapa — RN-160.05 — porque o filtro de prioridade passa a
  valer.)*
- **C397** — datas em UTC: a data padrão da Presença e dos Relatórios da produção (`toISOString`), os apontamentos/paradas por dia e o filtro
  de data das Movimentações (`DATE(created_at)` em UTC) — depois das 21h, o dia é o de amanhã.
- **C398** — o filtro *Status* dos Materiais: *"OK"* devolve material com selo *"Baixo"* (o servidor: acima do mínimo; o selo: até 1,5 × o
  mínimo) e *"Crítico"* devolve os *"Zerado"*; não há opção *"Baixo"*. É régua de negócio — **depende do P.O.**
- **C399** — selects incompletos: o *Tipo* das Movimentações não tem `ENTRADA_COMPRA`, `ENTRADA_DEVOLUCAO`, `RESERVA`, `BLOQUEIO`,
  `QUARENTENA`, `REMESSA_TERCEIRO`; o *Evento* das Notificações não tem as 15 chaves de alerta; o de fornecedores do recebimento corta em 50;
  os de material das Reservas e Inspeções não têm material de cliente; o *Setor* dos Colaboradores sai da lista já filtrada.
- **C400** — menores: o QR da etiqueta põe o código na busca (`MAT-001` lista também `MAT-0010`); as opções de usuário da Auditoria repetem o
  mesmo usuário renomeado; os Recebimentos recarregam materiais, pedidos e fornecedores a cada troca de filtro; a busca das OPs não olha a
  descrição da OS; o *Trabalho* dos Colaboradores (filtro do navegador) recarrega do servidor; o `GET /operacional/dashboard`
  (`index.js:21769`, `prioridade IN ('alta','urgente')`) tem a C390, mas nenhuma rota do `App.js` monta essa tela (Fase 2 M8).

## Regras de negócio

- **RN-160.01 (C390)** — `GET /api/operacional/ordens-servico?prioridade=X` e `GET /api/comercial/ordens-servico?prioridade=X`: a OS entra se
  `UPPER(TRIM(os.prioridade))` = `X` aparado e em maiúsculas pelo JavaScript (os valores são `baixa`/`normal`/`alta`/`urgente`, sem acento —
  o `UPPER` do SQLite basta para o gravado). `X` vazio, só de espaços, ausente ou não texto: sem filtro. **A tela** (`OrdensServico.js`)
  descarta a resposta de um pedido que não é o último — um contador só dentro do `loadOrdens`, que o excluir também chama (a lição da 159 I4
  e I5b; Fase 2 M9); o selo da prioridade usa a classe em minúsculas. **A edição da OS** (`OSForm.js`) escolhe as opções de *Tipo* e
  *Prioridade* pela regra da RN-160.08 (Fase 2 I1).
- **RN-160.02 (C391)** — O kanban (`GET /api/operacional/producao/kanban`) deixa de fora a OS cujo `LOWER(TRIM(COALESCE(status, '')))` está em `concluida`,
  `cancelada`, `encerrada`, **`concluido`, `cancelado`** (o que o formulário grava); a ordem é por `UPPER(TRIM(os.prioridade))`: `URGENTE` 0,
  `ALTA` 1, `NORMAL` 2, o resto 3; depois a data prevista e o item, como hoje. A OS com `status` nulo **passa a entrar** (hoje `NULL NOT IN`
  a deixa de fora — Fase 2 M2).
- **RN-160.03 (C392)** — A busca de texto das rotas da Fábrica passa por `condicaoDeBusca` (RN-159.02: o termo não texto ignorado; aparado; só
  espaços = sem filtro; cada coluna com o termo como veio, em maiúsculas e em minúsculas, NFC). As colunas **não mudam**: OS
  (`os.numero_os`, `os.descricao`), colaboradores (`c.nome`, `c.matricula`, `c.cpf`), equipamentos (`nome`, `codigo`, `modelo`), e o
  `buildSearchWhere` da produção (as colunas de cada chamador: OPs, máquinas, roteiros).
- **RN-160.04 (C393)** — Idem no Almoxarifado: materiais (`m.nome`, `m.codigo`, `m.descricao`, `m.fornecedor_principal`), retalhos (`q`),
  ferramentas (`busca`), empréstimos (`colaborador`). No relatório *Histórico de movimentações*: o `usuario` com as formas **e** o `ESCAPE` de
  hoje (`\`, `%` e `_` continuam texto, como já eram — `condicaoDeBusca(colunas, termo, { escapar: true })` escapa os três em cada forma e
  acrescenta `ESCAPE '\'`); o `tipo` aparado e em maiúsculas (*"saida "* = `SAIDA`), vazio, só de espaços ou não texto = sem filtro (Fase 2
  M3); a nota do relatório deixa de dizer *"ignora maiúsculas só em letras sem acento"* e passa a dizer
  o que vale (*"A busca por usuário ignora maiúsculas e minúsculas, mas não o acento."*). *(Esta frase da nota **estava errada** — prometia
  demais (Fase 5 r1-2): o nome antigo com letras acentuadas de caixas diferentes só é achado com a mesma grafia. A nota entregue acrescenta
  *"(um nome antigo com letras acentuadas maiúsculas e minúsculas misturadas só é achado com a mesma grafia)"*.)*
- **RN-160.05 (C394 e a tela das OS)** — Fábrica, telas: o *Atualizar* do painel da produção pede `GET /producao/dashboard?refresh=1`; a
  invalidação do cache do navegador (`invalidateProducaoDashboardCache`, chamada depois de cada ação da produção) marca que a **próxima**
  busca vai com `refresh=1` (Fase 2 I3); a abertura sem ação antes continua sem (o cache de 45 s do navegador e o de 30 s do servidor
  valem); a resposta de uma busca que não é a última não sobrescreve o cache nem a tela (Fase 2 M6). As *Paradas em andamento* vêm da
  resposta de `em_andamento=1` (o histórico continua do pedido sem filtro). Nas *Atividades dos colaboradores* e nas *Horas extras* a busca
  filtra **no navegador** a lista carregada, por `casaBusca` (RN-160.06), nas colunas mostradas — colaborador, tipo, descrição e OS nas
  atividades; colaborador e tipo nas horas extras — e digitar **não** recarrega a lista. As *Ordens de serviço*: RN-160.01.
- **RN-160.06 (C395)** — Uma função só no client, `client/src/utils/buscaNoNavegador.js`: `normalizarBusca(x)` = `String(x ?? '')`
  (não texto → `''`; número → o texto dele) em NFC, aparado, em minúsculas pelo JavaScript; `casaBusca(termo, ...valores)` = termo
  normalizado vazio → `true`; senão `true` se algum valor normalizado **contém** o termo normalizado (valor nulo = `''`; acento conta, como no
  servidor — B1013). Almoxarifado, telas: os seletores de material da *Nova requisição* e do recebimento usam `casaBusca` (nome, código) e o
  mínimo de 2 letras mede o termo **aparado** — abaixo dele, a lista de sugestões fica vazia, como hoje (Fase 2 I6); os filtros dos estoques
  mínimos, da *Liberação por valor*, dos *Perfis de acesso* e das regras de aprovação usam `casaBusca` nas colunas de hoje (Fase 2 I5); a
  lista de *Materiais* descarta a resposta de um pedido que não é o último — o contador dentro do `loadMateriais`, que o excluir também chama
  (Fase 2 M7).
- **RN-160.07 (C388)** — `POST /api/projetos`, `/api/oportunidades`, `/api/atividades` respondem `200` com **o registro gravado, lido do banco**
  (`SELECT * FROM <tabela> WHERE id = ?`); `POST /api/propostas` responde a linha de `propostas` gravada (com `numero_proposta`; **sem** os
  itens — B1022). Se a releitura falhar ou não achar a linha: `200 { id }` (propostas: `200 { id, numero_proposta }`) e o log
  `Erro ao reler <o projeto|a oportunidade|a atividade|a proposta> cadastrad<o|a> <id>: <mensagem>` — **não** `500` (o registro já existe;
  B1015). As recusas (`400`, `403`, `500` do `INSERT`) não mudam. **Consequência visível (Fase 2 I2):** o `numero_proposta` da resposta é o
  **gravado**, não o enviado — com o número enviado já existente, a tela passa a mostrar o próximo livre que o servidor gravou (antes,
  o repetido).
- **RN-160.08 (C389 e a edição da OS)** — Uma função só no client, `client/src/utils/opcaoDoSelect.js`: `opcaoQueCasa(gravado, valores)` = o
  valor da opção que casa com o gravado sem diferença de maiúsculas/minúsculas e de espaço nas pontas (NFC); nenhuma casa → o gravado como
  veio; gravado nulo, vazio ou só de espaços → `''` (Fase 2 M5). O formulário do cliente, ao abrir, põe o *Segmento* por ela —
  *"COSMÉTICOS"* mostra *"Cosméticos"*; o gravado que não casa com nenhuma opção (*"INDÚSTRIA PESADA"*, de um cadastro antigo) aparece como
  uma opção a mais, com o texto gravado, selecionada; o vazio mostra *"Selecione..."*, sem opção a mais. Salvar sem mexer grava o mesmo (o
  servidor põe em maiúsculas — *"Cosméticos"* → *"COSMÉTICOS"*). A edição da OS faz o mesmo com o *Tipo* e a *Prioridade* (`ALTA` mostra
  *"Alta"*; `MANUTENCAO` mostra *"Manutenção"*; o desconhecido aparece como opção a mais; salvar sem mexer grava o mesmo — o servidor põe
  em maiúsculas).

## Contratos

- `GET /api/operacional/ordens-servico`, `GET /api/comercial/ordens-servico` — mesmo formato; `prioridade` sem caixa (RN-160.01); a busca da
  primeira com as formas (RN-160.03). `500 { error: 'Erro ao verificar banco de dados' }` inalterado.
- `GET /api/operacional/producao/kanban` — mesmo formato (`etapas`, `colaboradores`, `itens`); muda quem entra e a ordem (RN-160.02).
- `GET /api/operacional/colaboradores`, `/equipamentos`, `GET /api/producao/ops`, `/maquinas`, `/roteiros`, `GET /api/almoxarifado/materiais`,
  `/sobras`, `/ferramentas`, `/emprestimos` — mesmo formato; a busca com as formas (RN-160.03/04).
- `GET /api/almoxarifado/relatorios/historico-movimentacoes` (e o `/export`) — mesmo formato; `usuario` com as formas e o escape; `tipo`
  aparado e em maiúsculas. O `GET` do registro dos relatórios devolve a nota nova.
- `POST /api/projetos|oportunidades|atividades|propostas` — `200` com o registro gravado (RN-160.07); `200 { id }` / `{ id, numero_proposta }`
  na releitura que falha; as recusas iguais.
- **Nenhuma rota nova. Nenhuma coluna nova** (nenhuma consulta A). **Nenhuma mensagem de recusa nova.** Quatro linhas de log novas (RN-160.07).
  Uma frase nova na tela (a nota do relatório, RN-160.04).

## Tasks (sort topológico)

- [x] **T1 (`eaf682e9`; o teste em `59e3972c`) (tronco — servidor) — RN-160.01, .02, .03 e o `escapar` da RN-160.04.** `buscaSemCaixa.condicaoDeBusca(colunas, termo,
  { escapar })`; as rotas da Fábrica no `index.js`; o `buildSearchWhere` da produção. Teste: arquivo novo
  `server/tests/api/filtrosDaFabricaEAlmoxarifado.api.test.js` (o `index.js` montado numa pasta vazia, molde `filtrosDoComercial`): cada
  coluna de cada busca com o seu caso (o gravado pela rota em maiúsculas **e** o legado em minúsculas por fora, contados contra o banco — a
  lição do r3 da 159); `"   "` e `search[]=x` = a lista inteira; a prioridade (pela rota: OS com *"alta"* → `ALTA`; um legado `alta` por
  fora; `prioridade=alta`, `ALTA`, `" Alta "` acham os dois e só eles; vazio = todas) nas duas rotas das OS; o kanban (OS `concluido`,
  `cancelado`, `concluida` fora; `em_andamento` dentro; a ordem URGENTE → ALTA → NORMAL → BAIXA).
- [x] **T2 (`eaf682e9`; o teste em `59e3972c`) (galho — servidor) — RN-160.04.** As quatro buscas do Almoxarifado e o relatório (o `usuario` com acento e com `%` literal; o
  `tipo` *" saida "*). Teste no mesmo arquivo.
- [x] **T3 (`59e3972c`) (galho — servidor) — RN-160.07.** Os quatro `POST`. Teste no mesmo arquivo: cada `POST` com um campo inventado → a resposta tem as
  chaves do `PRAGMA table_info` e os padrões do banco (`status` etc.), sem o campo inventado; um **segundo boot** com `FALHA_SQL_INJETADA`
  casando só cada releitura → `200 { id }` (`{ id, numero_proposta }`), o registro no banco e a linha de log; e o `POST /propostas` com um
  `numero_proposta` já existente → a resposta traz o número **gravado** (o do banco), diferente do enviado (Fase 2 I2).
- [x] **T4 (`a0268282`) (tronco — tela) — as duas funções do client.** `client/src/utils/buscaNoNavegador.js` (`normalizarBusca`, `casaBusca`) e
  `client/src/utils/opcaoDoSelect.js` (`opcaoQueCasa`), com testes unitários (Fase 2 I4).
- [x] **T5 (`a0268282`) (galho — tela) — RN-160.05 e a tela/edição das OS da RN-160.01/.08.** `client/src/utils/producaoApi.js`, `ParadasProducao.js`,
  `AtividadesColaboradores.js`, `HorasExtras.js`, `OrdensServico.js`, `OSForm.js`; testes novos no client (o `api` com adaptador falso na
  fronteira HTTP).
- [x] **T6 (`d5cd52ea`) (galho — tela) — RN-160.06.** Os sete usos (`RequisicaoForm`, `RecebimentosAlmoxarifado`, `ConfiguracoesAlmoxarifado` ×3,
  `TabRegrasAprovacao`) e o contador dos `MateriaisAlmoxarifado`; testes novos (o seletor da requisição com *"abc "*, *"  "* e um material
  sem nome; um dos filtros das Configurações; a resposta lenta dos Materiais).
- [x] **T7 (`93c1dace`) (galho — tela) — RN-160.08.** `ClienteForm.js`; teste novo (o gravado *"COSMÉTICOS"* mostra *"Cosméticos"*; o desconhecido
  aparece; o vazio mostra *"Selecione..."*; salvar sem mexer manda o segmento).
- [x] **T8 (`59e3972c`, no `filtrosDaFabricaEAlmoxarifado`) (integração — cruza T1, T2, T3) — pelas rotas, no `index.js` montado.** O fluxo: `POST /operacional/colaboradores` com *"joão da
  silva"* → `GET /operacional/colaboradores?search=joão` acha; `POST /operacional/ordens-servico` com prioridade *"alta"* e status
  `em_andamento` (e um item) → `GET ?prioridade=alta` acha e o kanban a mostra antes da *"normal"*; `PUT` para `concluido` → o kanban não a
  mostra; `POST /projetos` → a resposta é o gravado → `GET /projetos/:id` dá as mesmas chaves e valores. E o serviço direto:
  `condicaoDeBusca(['x'], 'a%', { escapar: true })` (o `%` escapado e o `ESCAPE`). Depois a bateria inteira, serial.

Independência: T1 é tronco (a função compartilhada ganha o `escapar`); T2 e T3 mexem em arquivos diferentes mas no mesmo arquivo de teste;
T4 é o tronco das telas (as duas funções que T5–T7 usam — Fase 2 I4); T5–T7 são telas independentes entre si. Tudo executado aqui, em
sequência (T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8) — um executor paralelo em
worktree não se pagaria (um arquivo de teste de servidor compartilhado; a trava de máquina serializa os `test:api`).

## Pontos de atenção

1. A trava de máquina: um `test:api` por vez (`scratchpad/trava-test-api.d`, `mkdir` atômico; quem pegou apaga).
2. O teste novo sobe o `index.js` com `NOMINATIM_URL` numa porta fechada — nenhuma consulta externa.
3. Fixture que separa: o gravado pela rota (maiúsculas) **e** o legado (minúsculas, por fora); **cada coluna** com o seu caso; contado contra
   o banco.
4. As regras inegociáveis do Almoxarifado: nenhuma rota de saldo muda; nenhuma permissão muda (os portões das rotas ficam como estão; o
   teste usa o administrador semeado e, onde for a prova de portão, nenhuma); saldo global intocado.
5. `GET /almoxarifado/materiais` é lido por outras telas (requisição, seletores) **sem** `search` — sem a chave, a consulta é a de hoje.
6. **Declarar em B:** B1018 a prioridade e o kanban (o que sai e a ordem — muda o que a fábrica vê); B1019 as buscas da Fábrica e do
   Almoxarifado (acham mais; acento continua contando — B1013); B1020 o relatório (o escape mantido; o tipo em maiúsculas; a nota); B1021 as
   telas da Fábrica (a busca das atividades/horas no navegador — descartado: parâmetro novo no servidor); B1022 a resposta dos quatro
   cadastros (a proposta sem itens; o número gravado em vez do enviado — Fase 2 I2); B1023 o segmento e as opções da OS (a opção a mais
   para o desconhecido — descartado: mostrar *"Selecione..."*/a primeira opção); B1024 a próxima.

## Execução (o que divergiu do plano)

- **Tudo em sequência, aqui** (como o plano previa): T1 → T2 → T3 (servidor, um arquivo de teste), T4 → T5 → T6 → T7 (telas), T8 no arquivo
  do servidor. **0** retrabalho entre tasks. Os testes do servidor foram escritos antes do código: `filtrosDaFabricaEAlmoxarifado` **0/15**
  antes (cada busca *"[] em vez de [id]"*, a prioridade, o kanban *"[8,6,5,7,10,11,15,16]"*, as chaves das respostas com
  *"campo_inventado_160"*, a releitura com `{"id":2,"nome":"RELEITURA 160"}`), **15/0** depois.
- **Divergências:** (1) o `index.js` mexe na busca/prioridade/kanban **e** na C388 — dividido em dois commits por assunto (`eaf682e9` sem a
  C388, gerado por script a partir do arquivo final; `59e3972c` com ela e o teste), sem estado intermediário rodado (o teste do servidor
  entra no segundo); (2) a rota de edição da OS (`/fabrica/ordens-servico/editar/:id`) monta o **`OSDetalhesForm`** (a ficha), não o
  `OSForm` — o `OSForm` é o formulário que a lista abre no lugar. A Fase 2 I1 mirou o `OSForm` (os selects); a ficha tinha o selo da
  prioridade com o mesmo defeito (Fase 5 r1-1) — corrigido na Fase 5; (3) o `fetchModuleUsers` e o `useAuth` simulados no teste da Fábrica;
  as abas das Configurações testadas pela tela inteira com `?tab=` (as abas não são exportadas).
- **Controles positivos (todos caíram pela asserção certa):** servidor K1–K19 (o `escapar`, cada coluna tirada, a prioridade sem
  maiúsculas e sem `UPPER(TRIM)` na rota do Comercial, o kanban sem `concluido`/`cancelado`, com o `CASE` em minúsculas e sem o `COALESCE`, o
  `buildSearchWhere` de volta ao `LIKE` cru, o tipo do relatório sem maiúsculas, a nota velha, a resposta = o mínimo, o eco da proposta, a
  releitura = 500); telas C1–C18 (as duas funções, o `refresh`, a invalidação, a resposta velha do painel, as paradas, as colunas das
  atividades/horas, o recarregar ao digitar, o contador e o selo das OS, as opções da OS e do segmento, o seletor da requisição, as regras,
  o contador dos Materiais). **C19/C20** (o seletor do recebimento e o filtro dos estoques mínimos) — inconclusivos na primeira rodada (a saída
  do jest passou do limite do coletor) e confirmados como **sem teste** pelo r3: ganharam teste na Fase 5.

## Fase 5 — revisão adversarial (três revisores frescos, em paralelo, sob a trava)

- **r1 (regra) — 0 Critical, 0 Important, 2 Minor, reproduzidos.** **r1-1** a ficha da OS (`OSDetalhesForm.js:490`, a que a rota de edição
  monta) e a prévia da OS do Comercial (`PreviewOSEditavel.js:274`) montavam o selo com o gravado `ALTA` (`info-item-priority-ALTA`; o CSS só
  tem as minúsculas) — o selo sem cor. **r1-2** a nota nova do relatório (*"ignora maiúsculas e minúsculas, mas não o acento"*) prometia
  demais: o nome antigo com letras acentuadas de caixas diferentes (*"Ângela Gonçalves"*) só é achado com a mesma grafia (B1013). Conferido
  certo: cada RN, o `escapar` (`50%`, `a_b`, `c\d`), o kanban (`' Concluido '`, `CANCELADO`, o status nulo/vazio, a ordem), os outros
  chamadores, as duas telas da proposta lendo `id`/`numero_proposta`, abrir/salvar a OS sem mexer, o cache do painel, as paradas ao
  iniciar/encerrar, os contadores.
- **r2 (autorização) — 0 achados.** Sonda no `index.js` montado com quatro usuários (só Comercial, só Operacional, só Almoxarifado, sem
  nenhuma permissão): a resposta nova dos quatro cadastros não tem chave que o GET correspondente não mostre (controle positivo com uma chave
  inventada); nenhuma injeção (`') OR 1=1--`, `UNION`, arrays/objetos do `qs`, 50 mil caracteres) nas 13 combinações de rota e chave; nenhum
  portão mudou (tabela 403/200 executada). De antes (não da etapa): o usuário sem nenhuma linha de permissão entra no Comercial (o desenho do
  portão, já visto na 158/159); a busca das OPs pela razão social do cliente já existia.
- **r3 (sabotagem, worktree própria `CRM-wt-e160-r3`) — 134 sabotagens (73 servidor, 61 telas): 112 caíram pela asserção certa; 20 sobreviveram
  por falta de asserção; 1 inalcançável (S44 — a releitura que não acha a linha recém-gravada pela mesma conexão: o ramo fica, a suíte não o
  protege); 1 quase equivalente (C10/C24).** As faltas: a prioridade gravada com espaço (`normalizarMaiusculas` não apara: *" alta "* grava
  *" ALTA "*) nas duas rotas e no kanban (S24, S24b, S23b); a barra invertida pela rota do relatório (S26); a busca forçada que falha
  remarcar (C04) e a anterior que falha devolver a última (C06); a coluna *tipo* das atividades (C12); a lista vazia das horas extras (C21); o
  tipo desconhecido na OS (C30); a régua das 2 letras na posição (C45); o e-mail nas regras (C51); **o seletor do recebimento sem teste
  nenhum** (C46/C47) e **os filtros das Configurações** (C48b, C49, C50); a falha e o *carregando* do pedido anterior nas OS e nos Materiais
  (C25, C26, C54, C55).
- **Correção da Fase 5 (`ff3e7d78`):** o selo em minúsculas na ficha e na prévia da OS (r1-1); a nota do relatório com o limite (r1-2); e as
  asserções de todos os sobreviventes. **Controles da correção (todos caíram pelo cenário deles):** F01–F05 no servidor (a prioridade sem
  `TRIM` em cada rota, o `CASE` sem `TRIM`, o escape sem a barra, a nota) e G01–G17 nas telas (cada sobrevivente do r3 reaplicado, e o selo
  da ficha).

## Suítes (lidas na saída, `scratchpad/e160/`)

- **Base (antes de qualquer código, `base-api.log`):** `test:api` **479/479**.
- **Bateria 1 — antes dos commits `eaf682e9`..`93c1dace` (`b1-*.log`):** `test:api` **480/480** arquivos (`filtrosDaFabricaEAlmoxarifado`
  **15/0**); `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; revisão obrigatória da proposta
  **23/23** + editor **39/39**; client **160** suítes / **1990** testes; `CI=true build` *Compiled successfully*.
- **Bateria 2 — antes de `ff3e7d78` (depois da Fase 5 — também a do fechamento; depois só mudaram documentos, `b2-*.log`):** `test:api` **480/480** arquivos (`filtrosDaFabricaEAlmoxarifado` **15/0**); `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; revisão obrigatória da proposta **23/23** + editor **39/39**; client **160** suítes / **1999** testes; `CI=true build` *Compiled successfully*.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** — a Fase 5 (o selo da ficha, a nota e as asserções). As oito tasks ficaram verdes na primeira
   aplicação, com controle positivo cada. Testes antigos mudados: **0**.
2. **Achados da revisão:** Fase 2 — **0 Critical + 6 Important + 9 Minor**, todos reais (nenhum ruído; o mais caro: o gesto seguinte ao
   filtro da prioridade — a edição da OS — repetia a C389, e a resposta da proposta devolvia o número repetido). Fase 5 — r1 **2** reais
   (Minor); r2 **0**; r3 **20** faltas de asserção reais + **1** inalcançável + **1** quase equivalente; **0** ruído. **O que mais pesou:** a
   Fase 2 apontou a edição da OS pelo `OSForm`, mas a rota de edição monta outra tela (a ficha) — a mesma lição da 159 I1 (medir pelo
   componente que a rota monta), agora num gesto **depois** do filtro; e duas telas novas (o recebimento, as abas das Configurações) foram
   mudadas sem teste dedicado, o que o condutor tinha medido mas não fechado.
3. **Paralelismo:** **0** galhos de código em paralelo (o plano decidiu assim); **3** leitores em paralelo na Fase 0, **1** revisor na Fase
   2 (antes do código), **3** em paralelo na Fase 5 sob a trava (o r3 em worktree própria) — **0** incidente de trava.
4. **Defeito que escapou:** **0** (preenchido na Etapa 161). Nada do que a 160 entregou voltou como defeito: a 161 reusou o molde
   do contador das OS e dos Materiais em treze listas, e as três revisões da Fase 5 da 161 (regra, autorização, sabotagem) e os testes não
   acharam falha no código da 160. Os achados novos da 161 (C402, C404, C405) são de antes da 160.

## Próxima tarefa detalhada — Etapa 161

*(A série desta etapa foi B1018–B1024, C388 e C389 resolvidos, C390–C395 novos e resolvidos, C396–C400 novos (de antes, observados), nenhuma
A — a 161 começa em **B1025**, **C401**, **A104**; confira com `grep -oE` antes.)*

**Escolhida: as sobras técnicas que a medição desta etapa registrou e não consertou — C396 (as listas que mostram a resposta de um pedido
que não é o último), C397 (as datas em UTC) e o que da C399/C400 não é regra — medir antes, nenhuma regra do P.O.** (1) **C396** — o
contador de pedido (o molde: `OrdensServico.js` e `MateriaisAlmoxarifado.js` desta etapa — o contador dentro da função que carrega, que o
excluir/inativar também chama; a falha e o *carregando* do pedido anterior também não valem) nas listas da Fábrica (OPs, máquinas,
colaboradores, equipamentos, os relatórios da produção ao trocar de aba) e do Almoxarifado (movimentações, requisições, recebimentos,
reservas, inspeções, não conformidades, o painel ao trocar o período, os Relatórios ao trocar de relatório com a consulta em andamento — e a
exportação, que hoje sai com o tipo novo e os parâmetros do antigo). (2) **C397** — a data padrão da Presença e dos Relatórios da produção
pelo dia **local** (não `toISOString`); o filtro de data das Movimentações e o *por dia* dos apontamentos/paradas: medir antes como o
`created_at` é gravado (UTC) e como a tela o mostra — se a correção mudar o que entra num dia, é **B** (os números mudam). (3) Da **C399/C400**,
o que é técnico: o *Setor* dos Colaboradores das opções da lista inteira (não da filtrada); o *Evento* das Notificações das chaves que a fila
conhece (o `ALERT_REGISTRY` + os 10 de hoje); o seletor de fornecedores do recebimento com a busca do servidor (`search` já existe) em vez
do corte em 50; as opções de usuário da Auditoria sem repetir o renomeado; o QR da etiqueta abrindo o material pelo código exato; os
Recebimentos sem recarregar materiais/pedidos/fornecedores a cada filtro. **Fica para o P.O.:** os tipos que o filtro *Tipo* das
Movimentações deve oferecer (*"Entrada"* incluir *ENTRADA_COMPRA*? — é o agrupamento, régua de negócio) e os selects de material das
Reservas/Inspeções com o material de cliente (B — muda o que aparece). **Pontos de atenção:** (1) a trava de máquina (um `test:api` por vez);
(2) medir pelo componente que a rota monta (a lição da 159 I1 e da 160 r1-1: a edição da OS é a ficha); (3) cada lista com o teste da
resposta lenta **e** da falha do pedido anterior (a lição do r3 desta etapa); (4) nenhuma porta de saldo, permissão ou trava muda.

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 152 — **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o
resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela de conversões e o grupo acima de família, a régua do
tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens de
produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**, **B101**/G30,
**G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62, a **C348**; nas propostas, a verificação do dono da proposta (Fase
12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a Frente B da lentidão, a **C297** (**B924**), a **B926**,
a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**; no Operacional, a **C332**; do Comercial, a **C354**, a
**C357**/**B988**, a **C359**/**B989** (e a **C360** junto), a **C358**, a **C383**, ignorar também o acento nas buscas (**B1013** — agora
também nas da Fábrica e do Almoxarifado, **B1019**) e o resto da **C382** (**B1016**); do núcleo, a **C362**; **novo desta etapa:** o filtro
*Status* dos Materiais (*"OK"* × *"Baixo"*, **C398**) e os tipos do filtro das Movimentações (**C399**). Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** as buscas da Fábrica e do Almoxarifado pela `condicaoDeBusca` (com o `escapar`), a prioridade
das OS e o kanban (`eaf682e9`); os quatro cadastros que respondem o gravado (`59e3972c`); as duas funções do client (`casaBusca`,
`opcaoQueCasa`), o painel da produção, as paradas, a busca das atividades/horas, a lista e a edição das OS (`a0268282`); os filtros do
navegador do Almoxarifado e o contador dos Materiais (`d5cd52ea`); o segmento do cliente (`93c1dace`); o selo da ficha da OS e as asserções
da Fase 5 (`ff3e7d78`).
