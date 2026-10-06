# Lote Compras de outubro — design (Etapas 33 a 36 da linha `main`)

> **Data:** 2026-10-06 · **Branch:** `main` (decisão do André: "os commits podem ser feitos direto
> na main") · **Origem:** nove tasks ditadas pelo André em 2026-10-06, transcritas na seção 2.
> **Linha de numeração:** esta é a continuação da **Etapa 32 de Compras** (`e5f8087f..98f6fc9d`,
> única etapa numerada de `main`). A branch `desenvolvimento-almoxarifado` tem a própria linha
> (Etapas 33–77); os números coincidem mas as linhas são independentes — ver seção 1.

## 1. O que a Fase 0 mediu e nenhuma task dizia

### 1.1 `main` e a branch do almoxarifado divergiram, e o pedido de compra existe duas vezes

Medido em 2026-10-06 (`git merge-base` = `04276424`; `main` 54 commits à frente, a branch 1140):

| | `main` (produção) | `desenvolvimento-almoxarifado` |
|---|---|---|
| Pedido de compra | **Etapa 32** (`e5f8087f`, `105e6799`, `2b31ce9e`, `98f6fc9d`): `server/routes/compras/pedidos.js`, `services/compras/{db,opcoesPedido,pedidoLeitura,pedidoTotais}.js`, `PedidoCompraForm.js` + `.css` de 790 linhas com chips, IPI, frete, condições, **"Entrega deste item"** (`itens_pedido_compra.data_entrega`), `local_entrega` e `local_cobranca` no cabeçalho | **Etapas 38–41**: `server/routes/compras.js`, `services/compras/{pedidoCompraService,cotacaoService,schemas,planilhaCompras}.js`, outro `PedidoCompraForm.js` (sem entrega por item, com importação por planilha) |
| Fornecedor | só o modal de `FornecedoresDoGrupo.js`; `/compras/fornecedores/novo` e `/editar/:id` são **caminhos mortos** (o `Link` existe em `Compras.js:216` e `:362`, a rota não) | `FornecedorForm.js` (Etapa 40) |
| Cotação | caminhos mortos | `CotacaoForm.js` (Etapas 40–41) |
| Almoxarifado | squash das Etapas 0–31 (`8adbd859`) | Etapas 0–77 |
| Mobile/PWA | 20 commits de redesenho para celular (`84ca5693..ae6a4038`) | não tem |

**Consequência declarada:** as tasks deste lote são implementadas **contra o código de `main`**.
No dia em que a branch do almoxarifado for mesclada, alguém vai ter de escolher **um** pedido de
compra — os dois gravam em `pedidos_compra`/`itens_pedido_compra` com colunas diferentes. Isso
está registrado na letra B do `docs/compras-novidades-por-etapa.md` (B1) e não é resolvido aqui.

### 1.2 A task 1 descreve a tela de `main`, não a da branch

Na branch não existe entrega por item. Em `main` existe: cada linha do pedido tem o bloco
"Entrega deste item" (`PedidoCompraForm.js:640-655`, chips Hoje/7/15/30 dias + `<input type=date>`),
gravado em `itens_pedido_compra.data_entrega` (`routes/compras/pedidos.js:95-105`), lido por
`pedidoLeitura.js:36` e mostrado na coluna **Entrega** da tabela de itens do recebimento
(`RecebimentosAlmoxarifado.js:735`, `:757`). O cabeçalho **já tem** "Previsão de entrega do pedido"
(`previsao_entrega`) e "Entregar em" (`local_entrega`, `BotoesLocal`, `:708`), os dois dentro da
seção "3. Condições". Dois testes de API afirmam que `data_entrega` por item volta gravada
(`pedidoCompra.api.test.js:96-106`, `pedidoCompraRecebimento.api.test.js:134-156`).

### 1.3 Fornecedor: o que `main` tem e o que não tem

- DDL `fornecedores` (`server/index.js:19519-19534`): `razao_social, nome_fantasia, cnpj, contato,
  email, telefone, endereco, cidade, estado, cep, status`; ALTERs: `inscricao_estadual`, `celular`
  (Etapa 32, `:19592-19599` — "o documento mostra IE e celular"), `grupo_id`, `planilha_*`, `foto`.
- `POST /api/compras/fornecedores` (`index.js:20550`) grava **só** razão, fantasia, cnpj, contato,
  email, telefone, grupo_id; **não grava endereço, cidade, estado, cep**. `PUT` (`:20568`) grava os
  7 textos (com endereço) por **substituição total** — chave ausente vira `NULL`. Não existe
  `GET /api/compras/fornecedores/:id`; a lista é `SELECT *`.
- `server/tests/helpers/testApp.js:46-60` stuba `fornecedores` **sem** `contato`, `grupo_id`,
  `foto`, `planilha_*` — diverge da produção.
- **Não há biblioteca de CNPJ.** O que o P.O. chamou de biblioteca é `ClienteForm.js:208-376`:
  `buscarCNPJ` chama o proxy `GET /api/cnpj/:cnpj` (`index.js:3487`, BrasilAPI → ReceitaWS, timeout
  8s) e `preencherDadosCNPJ` monta `endereco` (logradouro, número, complemento, bairro), `cep`,
  `cidade`, `estado`, `telefone`, `email`, razão e fantasia. **Não existe consulta de CEP** (ViaCEP
  ou outra) em lugar nenhum do app ativo. Máscara de telefone: `client/src/utils/telefone.js`.
- Padrão de CSS dominante nos formulários: `.form-section > h2` + `.form-grid` (auto-fit 250px) +
  `.form-group` (33 arquivos; modelo mais completo: `ClienteForm.js/.css`, que também tem o grupo
  CNPJ + lupa). As três telas de Compras usam `.filters` + `<label>` com estilo inline — o
  `Compras.css` não define nenhuma classe de formulário.

### 1.4 Cadastro de material (`MaterialAlmoxarifadoForm.js`, idêntico nas duas linhas a menos de 2 linhas)

- **Fatores de conversão** (`fator_conversao_compra`, `fator_conversao_consumo`): o servidor só os
  **grava e devolve** (`materialService.js`, `routes/almoxarifado.js:565`). **Nenhum cálculo** em
  `stockService`, `receiptService`, `requisition*`, `purchaseService`, `reportService`. O manual
  (`docs/almoxarifado-manual-do-sistema.md:190-198`) diz isso com todas as letras: "o sistema não
  converte quantidades automaticamente". A tela (`:883-917`) só tem o placeholder "Ex.: 12 (1 CX =
  12 UN)" no de compra e **nada** no de consumo — a confusão que a task 4 relata é real: o campo
  parece operar e não opera.
- **Unidade de consumo** (`unidade_consumo`, `:897-903`): só o CRUD lê. Tirar da tela não quebra
  nada; `PUT` preserva coluna omitida (`routes/almoxarifado.js:588`). Os testes de servidor que a
  citam (`materialCompleto.api.test.js:62,88,114`) montam o payload direto e continuam valendo.
- **Classe ABC** (`:864-870`): `select` A/B/C sem legenda. **Nenhum documento define o significado**
  — o mais perto é o manual `:216-220` ("classificação manual… o item A é o que justifica contagem
  mais frequente"). Quem lê a classe: só o escopo da conferência de estoque
  (`routes/almoxarifado.js:1177-1251`, `ConferenciaEstoque.js:737`).

### 1.5 Família × categoria: o modelo atual contradiz a task 2

- Família é árvore de 2 níveis (`familias_material_almoxarifado.parent_id`, validado em
  `routes/almoxarifado.js:2414-2421`), com CRUD e aba *Famílias* em `ConfiguracoesAlmoxarifado.js`.
  A aba **não manda `parent_id`** — não há tela para criar subfamília.
- Categoria é lista plana com CRUD (Etapa 26) e aba *Categorias*; `parent_id` existe e **nunca foi
  usado**. O material grava **o nome** (`materiais_almoxarifado.categoria TEXT`), não a chave.
- **A relação já existe, no sentido inverso ao da task:** `familias_material_almoxarifado.categoria_id
  → categorias` (`schema.js:957-967`). Hoje a família pertence a uma categoria; a task pede
  categorias **dentro** de cada família. Os requisitos originais
  (`2026-08-02-requisitos-modulo-almoxarifado.md:129-131`) pedem "Grupo > Família > Subfamília" e
  **não citam categoria**. Isto exige decisão do André/P.O. — ver seção 5, D-36.

### 1.6 Configurações: duas telas, quatro listas de módulos, nenhum componente de abas

- `/configuracoes` (`Configuracoes.js`, 7 abas à mão, gate `administrativo`) e
  `/almoxarifado/configuracoes` (`ConfiguracoesAlmoxarifado.js`, 3642 linhas, 13 abas à mão, gate
  `canConfigureModule('almoxarifado')`), mais `/fabrica/configuracoes` (Operacional, 1 CRUD).
- Lista de módulos repetida em 4 lugares: `modulosMeta.js`, `TipoSelecao.todosModulos`,
  `MODULE_ADMIN_KEYS`, `DEFAULT_MODULOS_TIPO`. Não há `GET /api/modulos`.
- Nenhum componente de Tabs reutilizável; 7 CSS de abas diferentes.
- `canConfigureModule` do servidor **não aceita `role==='admin'`**, o do cliente aceita
  (`systemPermissions.js:76-83` vs `client/src/utils/systemPermissions.js:55`).

## 2. As nove tasks, como foram ditadas, e para onde cada uma foi

| # | Task (resumo fiel) | Etapa | Executa hoje? |
|---|---|---|---|
| 1 | Em compras > pedido > novo, a "entrega" é por item; mover para o pedido | **33** | sim |
| 7 | Fornecedor com 2 telefones: Empresa e Vendedor | **34** | sim |
| 8 | Endereço do fornecedor com autopreenchimento (a "biblioteca do CNPJ" do comercial) | **34** | sim |
| 9 | CSS de criar/editar fornecedor apresentável, alinhado ao resto | **34** | sim |
| 4 | Revisar fator de conversão em materiais > novo | **35** | sim (parte reversível) |
| 5 | Remover unidade de consumo de materiais > novo | **35** | sim |
| 6 | Legenda das classes A/B/C (avisar se não houver definição) | **35** | sim, com aviso |
| 3 | Configurações com tabs dinâmicas por módulo | **36** | **não** — só spec |
| 2 | Árvore família > categoria, cadastrável, possivelmente em Configurações > Almoxarifado | **36** | **não** — só spec |

## 3. Etapa 33 — a entrega é do pedido, não do item

**Objetivo:** o pedido de compra passa a ter **uma** seção "Entrega" (previsão + local), e a linha
do item deixa de ter data própria.

**Regras de negócio**

- **RN-33.01** O formulário do pedido não oferece data de entrega por item. O bloco "Entrega deste
  item" sai; o painel de detalhes da linha fica com Unidade, IPI, Descrição e Observação.
- **RN-33.02** A seção "3. Entrega" do pedido reúne *Previsão de entrega* (chips 7/15/30/45 dias +
  data livre) e *Entregar em* (`local_entrega`, botões + "Outro"). Ela nasce da seção "Condições",
  que vira "4. Condições" (pagamento, frete, via, cobrar em) — "Total" vira 5.
- **RN-33.03** O servidor **ignora** `data_entrega` por item: `POST`/`PUT /api/compras/pedidos`
  gravam `NULL` na coluna mesmo que o corpo traga valor. A coluna `itens_pedido_compra.data_entrega`
  **fica** (reversível; nada a lê depois desta etapa). A leitura (`pedidoLeitura.SQL_ITENS`) deixa
  de projetá-la.
- **RN-33.04** O recebimento contra pedido deixa de mostrar a coluna **Entrega** por item
  (`RecebimentosAlmoxarifado.js:735/757`); a previsão do pedido continua no cabeçalho do painel.
- **RN-33.05** Pedido gravado **antes** desta etapa com `data_entrega` por item: a tela abre sem
  mostrar a data, e o primeiro `PUT` zera a coluna. Não há migração de dados.

**Contratos:** `POST`/`PUT /api/compras/pedidos` — mesmo corpo da Etapa 32, com `itens[].data_entrega`
**aceito e descartado**; resposta sem `data_entrega` nos itens. Nenhuma rota nova.

**Testes:** `pedidoCompra.api.test.js` (o cenário `:96` passa a provar que a data por item **não**
volta: enviar `'2025-12-18'` → `item.data_entrega` ausente/`null`); `pedidoCompraRecebimento`
(`:148` idem); novo `PedidoCompraForm.entrega.test.js` no client (não existe teste do form em
`main`): não há campo "Entrega deste item"; a seção "Entrega" existe com previsão e local; o
payload do `POST` não carrega `data_entrega`.

**Descartado:** apagar a coluna (`ALTER DROP` no SQLite exige recriar a tabela — irreversível e
desnecessário); migrar a menor `data_entrega` dos itens para `previsao_entrega` (inventaria uma
previsão que o comprador não escolheu).

## 4. Etapa 34 — a ficha do fornecedor

**Objetivo:** fornecedor ganha **tela própria** de criação/edição (os dois caminhos mortos
passam a abrir), com dois telefones, endereço autopreenchido por CNPJ e CEP, e CSS no padrão do
sistema.

**Regras de negócio**

- **RN-34.01** `/compras/fornecedores/novo` e `/compras/fornecedores/editar/:id` abrem o
  `FornecedorForm` (lazy, como o `PedidoCompraForm`). O modal de `FornecedoresDoGrupo.js`
  **continua** funcionando com os mesmos corpos de hoje.
- **RN-34.02** Dois telefones: **Telefone da empresa** (`telefone`, coluna existente) e **Telefone
  do vendedor** (`telefone_vendedor`, coluna **nova**, `ALTER` + stub do harness). Os dois com a
  máscara `mascararTelefoneDigitando`. O campo *Contato* vira **Nome do vendedor** (mesma coluna
  `contato`). A coluna `celular` da Etapa 32 **não é tocada** (o documento do pedido a imprime).
- **RN-34.03** Autopreenchimento por **CNPJ**: ao sair do campo com 14 dígitos válidos (cadastro
  novo) ou ao clicar na lupa (sempre), chama `GET /api/cnpj/:cnpj` e preenche razão social, nome
  fantasia, e-mail, telefone da empresa, endereço, cidade, estado e CEP — **só os campos vazios**
  na edição (não sobrescreve o que o usuário já digitou); no cadastro novo preenche tudo.
  Falha da consulta → toast "Não foi possível consultar o CNPJ" e nada muda.
- **RN-34.04** Autopreenchimento por **CEP**: ao sair do campo com 8 dígitos, chama a rota **nova**
  `GET /api/cep/:cep` (proxy ViaCEP, timeout 8s) e preenche endereço (`logradouro, bairro`), cidade e
  estado — só os vazios. CEP inexistente → toast "CEP não encontrado".
- **RN-34.05** `POST`/`PUT /api/compras/fornecedores` passam a gravar **todas** as colunas da
  ficha: `razao_social*, nome_fantasia, cnpj, inscricao_estadual, contato, email, telefone,
  telefone_vendedor, endereco, cidade, estado, cep, grupo_id` (+ `status` só no `PUT`).
  Semântica do `PUT`: **chave ausente não mexe; `''`/`null` limpa** — é o que deixa o modal do
  grupo (que manda 7 textos) continuar sem zerar cidade/estado/cep/telefone do vendedor.
  ⚠️ Isto muda a semântica atual de "substituição total" — provado por teste nos dois sentidos.
- **RN-34.06** `GET /api/compras/fornecedores/:id` **nasce** (projeção nomeada, sem `planilha_*`),
  404 "Fornecedor não encontrado".
- **RN-34.07** Razão social obrigatória (400 "Razão social é obrigatória", literal já existente);
  `status` só `ativo|inativo` (400 "Status inválido"); `grupo_id` não numérico → 400.
- **RN-34.08** A lista de fornecedores (`Compras.js`) mostra os dois telefones na coluna Telefone
  (empresa em cima, vendedor embaixo em `cell-secondary`).
- **RN-34.09** CSS: `FornecedorForm.css` **escopado** em `.fornecedor-form`, com as seções
  *Identificação*, *Contato*, *Endereço*, usando os tokens `--gmp-*`; grid de 2 colunas que vira 1 no
  celular (a camada mobile de `main` já enquadra `.form-section`/`.form-grid`).

**Contratos**

| Rota | Corpo | Resposta | Erros |
|---|---|---|---|
| `GET /api/compras/fornecedores/:id` | — | `200 {id, razao_social, nome_fantasia, cnpj, inscricao_estadual, contato, email, telefone, telefone_vendedor, celular, endereco, cidade, estado, cep, status, grupo_id, foto, created_at, updated_at}` | `404 {error:'Fornecedor não encontrado'}` |
| `POST /api/compras/fornecedores` | as 13 colunas acima (todas opcionais menos `razao_social`), `grupo_id?` | `201 {id, razao_social, nome_fantasia, grupo_id}` (igual hoje) | `400 'Razão social é obrigatória'`, `400 'Grupo inválido'` |
| `PUT /api/compras/fornecedores/:id` | idem + `status?` | `200 {message:'Fornecedor atualizado'}` | `400` idem, `400 'Status inválido'`, `404` |
| `GET /api/cep/:cep` | — | `200 {cep, logradouro, bairro, cidade, estado}` | `400 'CEP deve ter 8 dígitos'`, `404 'CEP não encontrado'`, `502 'Serviço de CEP indisponível'` |

As rotas de fornecedor saem do `index.js` para `server/routes/compras/fornecedores.js`
(registrador montável, mesmo padrão de `pedidos.js`, registrado **antes** do `DELETE /:tipo/:id`
genérico e montado no `testApp.js`). A rota de CEP fica ao lado da de CNPJ no `index.js`, e
**também** é montável (`server/routes/cep.js`) para o teste bater nela com `fetch` espiado.

**Testes:** `comprasFornecedor.api.test.js` (novo): POST com as 13 colunas volta gravado; POST do
modal com 4 chaves → 201 e endereço `NULL`; PUT do modal com 7 textos **não** zera `cidade`/
`telefone_vendedor`; PUT com `telefone_vendedor: ''` limpa; GET `/:id` sem `planilha_*`; 404;
status; grupo inválido; o `DELETE` genérico ainda sombreia `grupos` (caracterização, não conserto).
`cep.api.test.js`: proxy com `fetch` substituído → 200/404/502/400. Client:
`FornecedorForm.test.js`: os dois caminhos abrem o form; POST exato; edição GET→PUT com `status`;
CNPJ preenche só vazios na edição; CEP preenche; erro de rede vira toast; máscara dos dois
telefones; razão vazia não faz POST.

**Descartado:** biblioteca npm de CNPJ/CEP (o proxy já existe e a ViaCEP é um `fetch`); refatorar
`ClienteForm` para compartilhar o código (o comercial não está no lote — o utilitário novo
`client/src/utils/cnpj.js` nasce para o fornecedor e o cliente pode adotar depois); reaproveitar
`celular` como telefone do vendedor (o rótulo mentiria no documento do pedido).

## 5. Etapa 35 — cadastro de material: unidades e classe ABC

**Regras de negócio**

- **RN-35.01** Os campos *Unidade de Consumo* e *Fator de Conversão (Consumo)* saem da tela. As
  colunas ficam; o `PUT` preserva o que já está gravado (chave omitida não mexe). O Zod continua
  aceitando os dois (quem manda por API não quebra).
- **RN-35.02** *Fator de Conversão (Compra)* vira **"Fator de conversão"** com explicação na tela:
  rótulo "Quantas unidades de medida há em 1 unidade de compra", e um exemplo **vivo** montado com
  o que está digitado: "1 CX = 12 UN" (atualiza ao digitar). Abaixo, a frase honesta: "Informativo:
  as entradas e saídas são lançadas na unidade de medida; o sistema não converte sozinho."
- **RN-35.03** Classe ABC ganha legenda ao lado do campo: **A** — itens de maior valor/consumo
  (poucos itens, maior parte do valor em estoque): contagem e reposição mais frequentes; **B** —
  intermediários; **C** — muitos itens de baixo valor: controle simplificado. Termina com
  "classificação manual, definida por quem analisa consumo e valor". **Não existe definição escrita
  no projeto** — este texto é a definição usual (curva de Pareto) e está marcado como dúvida D-35
  para o P.O. confirmar ou trocar; trocar é editar uma constante.

**Testes:** `MaterialAlmoxarifadoForm.test.js` ganha: (a) não existe "Unidade de Consumo"; (b) o
payload do POST não traz `unidade_consumo`/`fator_conversao_consumo`; (c) editar material que
tinha `unidade_consumo` e salvar → `PUT` sem a chave (preserva); (d) o exemplo vivo mostra "1 CX =
12 UN" depois de escolher CX e digitar 12; (e) a legenda ABC está na tela. Servidor: nada muda;
`materialCompleto.api.test.js` continua verde (controle de que a API não foi tocada).

**Descartado:** apagar as colunas; fazer o recebimento converter pelo fator (seria regra de
estoque nova no motor — é a pergunta D-35b para o P.O., não uma decisão de madrugada).

## 6. Etapa 36 — Configurações por módulo e categorias por família (SÓ SPEC — decisões pendentes)

**O que a task 3 pede:** `/configuracoes` com uma aba por módulo, gerada da lista de módulos, e
dentro de cada aba as configurações daquele módulo; o almoxarifado entra com o que hoje está em
`/almoxarifado/configuracoes`.

**O que a task 2 pede:** cadastrar categorias **dentro** de cada família; a tela ficaria em
Configurações > Almoxarifado.

**Decisões que precisam do André (não executadas):**

- **D-36a** Modelo: hoje `familia.categoria_id → categoria` (família pertence a categoria). A task
  inverte (categoria pertence a família). Opções: (i) inverter — `categorias.familia_id` e a cascata
  no form do material vira família → categoria (subfamília some? continua?); (ii) manter o modelo e
  só dar à aba *Famílias* a criação de **subfamílias** (o `parent_id` já existe, falta a tela) e
  chamar isso de "árvore"; (iii) usar o `parent_id` de categorias (nunca usado) para a árvore de
  categorias, sem ligar a família. Recomendação: **(ii)** primeiro (zero migração, atende "árvore
  cadastrável") e perguntar ao P.O. se categoria deve mesmo depender de família.
- **D-36b** Onde: uma aba "Almoxarifado" em `/configuracoes` que **embute** a tela existente
  (`<ConfiguracoesAlmoxarifado embedded />`, como `ConfigTemplateProposta embedded` já faz) ou
  mover as 13 abas de lugar. Recomendação: embutir, com as abas atuais virando um submenu lateral.
- **D-36c** Gate: `/configuracoes` exige `administrativo`; `/almoxarifado/configuracoes` exige
  `canConfigureModule('almoxarifado')`. Quem vê a aba Almoxarifado dentro de Configurações? E a
  divergência cliente/servidor de `canConfigureModule` precisa fechar antes.
- **D-36d** Fonte da lista de módulos: criar `GET /api/modulos` a partir de `MODULE_ADMIN_KEYS`
  + `modulosMeta` e aposentar as outras três listas, ou só reusar `modulosMeta` no cliente.

Plano desta etapa é escrito **depois** da resposta. O que já dá para fazer sem decisão e está no
plano da 36 como "pré-tarefa": componente `Tabs` reutilizável (`client/src/components/ui/Tabs.js`)
com `role="tablist"`, aba inicial por `?tab=`, e migração de `Configuracoes.js` para ele.

## 7. Paralelismo e ordem

Etapas 33, 34 e 35 são **galhos** entre si (arquivos e regras disjuntos: pedido / fornecedor /
material) e rodam em **worktrees separadas** de `main` (junction de `node_modules`), uma por
executor. Dentro da 34, o servidor (rotas + CEP + harness) é **tronco** e o `FornecedorForm` é
galho contra o contrato da seção 4. Integração serial em `main` com a suíte inteira
(`test:api`, `test:almoxarifado`, `test:validation`, `test:safealter`, `test:sqlite`, jest do client,
`CI=true build`).

## 8. Documentação que esta etapa entrega

- `docs/compras-novidades-por-etapa.md` — **novo**, o documento didático para apresentar (pedido do
  André em 2026-10-06), com o bloco "Leia antes de apresentar" (dúvidas D-35, D-36a–d, B1).
- `specs/modulo-compras/README.md` — **não existe em `main`**; nasce como índice da linha de `main`
  (apontando a Etapa 32 e estas).
- `docs/almoxarifado-manual-do-sistema.md` §2.3 (unidades) e §2.4 (ABC) — a versão de `main`.
- Planos: `docs/superpowers/plans/2026-10-06-crm-etapa3{3,4,5}-*.md`, com retro.
