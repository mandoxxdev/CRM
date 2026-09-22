# 22 — Integrações (Engenharia, Produção, Compras, Projetos e Custos)

> **Status:** 🟡 — a fatia de **solicitação de compra e custo por projeto foi entregue na Etapa 14**
> (range `b276dca..2de7944`, 2026-08-25), a **fatia Compras / criação do pedido de compra foi
> entregue na Etapa 38** (range `be71754..0a7e5c6`, 2026-09-16 — T1–T7 + onda de correção F1–F8) e o
> **acompanhamento de prazo com alerta de atraso foi entregue na Etapa 39** (range
> `39ea9d2..19ebf7d`, 2026-09-17 — T1–T5 + onda de correção F1–F4), e a **Etapa 40** (range
> `7ccfc85..03cd048`, 2026-09-22 — T1–T6 + onda de correção F1–F5) **entregou as telas de
> fornecedor e de cotação** — os 4 caminhos mortos do Compras abriram, e com eles `GET
> /fornecedores/:id`, Zod nas duas portas de fornecedor, `status`/`grupo_id: null` escritos de
> verdade, `POST`/`GET /:id`/`PUT` de cotação e o 409 da lixeira contando as **três** FKs, e a
> **Etapa 41** (range `7d9e7d7..ffba9b9`, 2026-09-22 — T1–T5 + onda de correção F1–F6) **deu itens
> à cotação e a converteu em pedido de compra** — `itens_cotacao`, `valor_total` derivado com itens,
> `POST /cotacoes/:id/gerar-pedido` atômico por CAS, lixeira própria com cascata e 409, excluir o
> pedido libera a cotação, e a suíte que prova a ordem UPDATE → DELETE com a FK ligada;
> Engenharia/BOM e Produção/OP seguem **bloqueadas por dependência, com a medição escrita**
> (ver abaixo) · **Spec original:** seções 23, 24, 25
> **Última atualização:** 2026-09-22 — **Etapa 41 fechada**: a cotação ganhou **itens** (tabela
> `itens_cotacao` em `schema.js`, `itens` opcional no schema, total somado e travado na tela) e o
> botão **"Gerar pedido"** na aba Cotações cria o pedido de compra **no servidor** pelo
> `criarPedido` da 38, grava o vínculo `cotacoes.pedido_id` e leva à edição do pedido; a mesma
> cotação não gera dois pedidos **nem sob corrida** (6 POSTs → 1×201 + 5×409, achado da revisão
> final); convertida não se edita nem se exclui (409); excluir o pedido **libera** a cotação;
> a lixeira da cotação deixou de ser o genérico (com item, daria 500 em produção). Contratos no
> item `[x]` da fatia Compras e na seção *"Contratos da fatia Compras — cotação com itens e
> conversão (Etapa 41)"* · antes: 2026-09-22 — **Etapa 40 fechada**: Fornecedores e Cotações ganharam
> `FornecedorForm`/`CotacaoForm`; o "Remover do grupo" que era **no-op** passou a remover; o filtro
> *Inativo* deixou de ser inerte; fornecedor com cotação **ou com itens cadastrados** responde 409
> em vez de 500 na lixeira; e a rota do grupo passou a mostrar inativos com selo (contratos na seção
> *"Contratos da fatia Compras — fornecedores e cotações"*) · antes: 2026-09-17 — **Etapa 39
> fechada**: `GET /api/compras/pedidos` passou a
> devolver `atrasado`/`dias_atraso` derivados na leitura, a aba Pedidos ganhou badge, filtro
> `Só atrasados` e duas colunas no Excel, o alerta `PEDIDO_COMPRA_ATRASADO` entrou no registro, e o
> `PATCH /api/compras/pedidos/:id/status` abriu a **única** saída do "atrasado para sempre" do pedido
> já recebido · antes: 2026-09-16 — **Etapa 38 fechada**: o pedido de compra ganhou criação,
> edição, exclusão e importação por planilha no módulo **core Compras**, e a Etapa 37 deixou de ser
> inerte · antes: 2026-09-16 — a correção medida na Fase 0 da Etapa 38 (Compras **não** está maduro:
> não há como criar pedido) · antes: 2026-08-25 — fechamento da Etapa 14

## Contexto importante

> ⚠️ **CORREÇÃO (2026-09-16, Fase 0 da Etapa 38): as duas frases seguintes ESTAVAM ERRADAS, e o
> erro custou caro — ele fez a Etapa 37 inteira ser construída sobre um dado que ninguém consegue
> criar.** Ficam escritas, riscadas, em vez de apagadas em silêncio:
> 1. ~~*"o gargalo é os outros módulos serem usados"*~~ — **não é desuso, é impossibilidade.**
>    Medido: **nenhum código da aplicação insere `pedidos_compra` nem `itens_pedido_compra`**. A
>    rota core `server/index.js:20002` é **GET-only**, não existe `POST` em lugar nenhum, e o único
>    escritor de produção dessas tabelas é o acumulador da Etapa 37
>    (`receiptService.js`, `UPDATE itens_pedido_compra SET quantidade_recebida = …`). Dos 12
>    arquivos que tocam as tabelas, **11 são de teste**. Ninguém deixou de usar a tela: **não há
>    tela.**
> 2. ~~*"o módulo Compras está maduro (pedidos, itens, `receiptService` com workflow até PROCESSADO
>    integrado a contas a pagar)"*~~ — **estava errado: a Fase 0 da Etapa 14 mediu a maturidade do
>    módulo ERRADO.** O que ela mediu maduro foi o `receiptService`, que é **do almoxarifado**, e atribuiu
>    o resultado ao **Compras**. O core Compras **não tem UMA tela de criação nas três abas**:
>    "Novo Pedido", "Editar", `fornecedores/novo` e `cotacoes/nova` caem todos no `path="*"` de
>    `client/src/App.js` e **voltam para a lista** (`client/src/components/Compras.js`). Acervo do
>    dump de produção (161 MB): `pedidos_compra = 0`, `itens_pedido_compra = 0`, `cotacoes = 0` — o
>    vocabulário de status do pedido **nunca foi exercido**.
>
> **O elo quebrado, nomeado:** a reposição (Etapa 11) gera `solicitacoes_compra_almoxarifado`, e
> `vincularPedidoCompra` (`purchaseService.js:52`) exige que o pedido **já exista** e não tem
> consumidor no client — **ninguém converte solicitação em pedido**. ✅ **Fechado na Etapa 38**: o
> botão "Gerar pedido" da aba Solicitações (`727ee29`) navega para o formulário já preenchido, o
> `POST` faz o vínculo, e apagar o pedido **libera** a solicitação de volta a `PENDENTE`
> (`ca7956c`).
>
> **✅ FECHADO PELA ETAPA 38** (2026-09-16, `be71754..0a7e5c6`) — *"o pedido de compra ganha
> criação, e o recebimento contra o pedido deixa de ser inerte"*
> (`docs/superpowers/specs/2026-09-16-crm-etapa38-pedido-de-compra-design.md` +
> `docs/superpowers/plans/2026-09-16-crm-etapa38-pedido-de-compra.md`; medição em
> `.superpowers/sdd/etapa38-fase0-pedido-de-compra.md`). Entregue: as 23 rotas `/api/compras/*`
> extraídas de `index.js` para `server/routes/compras.js` e montadas no harness (`be71754` — antes
> **zero** testes batiam em `/api/compras` e o core tinha **0** Zod), **seis rotas novas** de pedido
> (`fa410ce`, `3e43069`, `6c21e89`, `877ef23`), o formulário e as duas rotas de client que faltavam
> (`9f1a3da`), "Gerar pedido" na Reposição fechando o elo (`727ee29`) e a integração de ponta a
> ponta pela rota **e** pelo serviço (`dc60507`, `0a7e5c6`). **A Etapa 37 deixou de ser inerte, e
> isso tem endereço:** o passo 3 do BLOCO A de
> `server/tests/api/comprasPedidoIntegracao.api.test.js` cria um pedido pelo `POST` do Compras e o
> encontra em `GET /api/almoxarifado/recebimentos-aux/pedidos-compra?pendentes=1` com
> `quantidade_pedida 10`, `saldo_pendente 10`, `situacao_recebimento 'ABERTO'`.
> A ressalva de escopo, decidida pelo caminho reversível e mantida: a tela é do módulo **core
> Compras**, mas a spec dela vive **aqui**, nesta feature 22, como "fatia Compras" (decisão B105) —
> e `itens_pedido_compra`, ao contrário do que o design da 37 dizia, **não é tabela do core**: o
> `CREATE TABLE` está em `server/services/almoxarifado/schema.js:1311`. ~~Cotações e fornecedores
> **continuam sem tela de criação** — a 38 consertou **uma** das três abas.~~ **Era verdade até a
> 39: a Etapa 40 (`7ccfc85..03cd048`, 2026-09-22) entregou as duas telas** — ver o item `[x]` da
> lista abaixo e a seção de contratos da 40.

As integrações dependem de dados que hoje **não existem em produção**: `projetos` (0 registros),
`pedidos_compra` (0), `producao_ops` (0), `ordens_servico` (1). O almoxarifado já tem as colunas
de vínculo (`projeto_id`, `os_id`) — ~~o gargalo é os outros módulos serem usados~~ *(errado — ver
a correção acima: no caso de Compras, o gargalo é não haver como criar o dado)*.

**Medição da Fase 0 da Etapa 14 (2026-08-24), que definiu o escopo real:** ~~o módulo **Compras
está maduro** (pedidos, itens, `receiptService` com workflow até PROCESSADO integrado a contas a
pagar)~~ *(**estava errado** — ver a correção acima; maduro era o `receiptService`, que é do
almoxarifado)* e foi integrado de verdade; **BOM não existe em lugar nenhum do sistema** (nem tabela,
nem tela, nem spec de Engenharia implementada) e o **MES existe sem uso real** (schema próprio,
0 OPs). Integrar com isso seria stub fingindo feature — os blocos correspondentes ficaram
**bloqueados por dependência**, não prometidos.

## O que já existe

- Colunas de vínculo em movimentações, requisições, reservas, recebimentos (projeto/OS/cliente).
- Compras: fornecedores + rotas de pedidos/cotações — **elas vivem em `server/routes/compras.js`
  desde a Etapa 38** (`be71754`; antes estavam no meio de `server/index.js`, sem harness).
  ⚠️ **Duas frases desta linha ESTAVAM ERRADAS e ficam corrigidas à vista:**
  1. ~~*"'rotas' aqui quer dizer LEITURA: são GET-only, não há `POST` de pedido"*~~ — **era verdade
     até 2026-09-16 e deixou de ser**: a Etapa 38 acrescentou `POST`/`GET /:id`/`PUT`/`DELETE
     /api/compras/pedidos`, `GET /api/compras/materiais` e `POST /api/compras/pedidos/importar`
     (contratos abaixo).
  2. ~~*"a única escrita do core é o `DELETE /api/compras/:tipo/:id` genérico, que apaga o pedido e
     **deixa os itens órfãos**"*~~ — **estava errado na consequência, e a imprecisão importava**: a
     Fase 2 da Etapa 38 mediu que `PRAGMA foreign_keys = ON` roda na conexão de **produção**
     (`sqliteConcurrency.js:50`) e que `itens_pedido_compra` declara `FOREIGN KEY (pedido_id)`
     (`schema.js:1319`). Em produção o genérico **não deixava órfãos: ele falhava** com
     `FOREIGN KEY constraint failed` → 500 `'Erro ao excluir item'`, e o pedido não saía nunca. O
     órfão é o sintoma do **harness**, que roda com `foreign_keys = 0`. São dois sintomas do mesmo
     defeito — e o certo é: o `DELETE` específico de pedido (`6c21e89`) apaga os filhos **antes** do
     cabeçalho, pelos dois motivos, e fica registrado **acima** do genérico —,
  workflow de recebimento NF integrado a contas a pagar (feature 08),
  `itens_pedido_compra` (tabela do **almoxarifado**, `schema.js:1311`, hoje com saldo por linha
  desde a Etapa 37), solicitações automáticas por mínimo (feature 18), aviso por e-mail a Compras
  de itens sem estoque.
- **Recebimento contra o pedido de compra — ENTREGUE na Etapa 37** (`ea0aa4f..13ad237`, feature
  08): `itens_pedido_compra.quantidade_recebida`, o elo `pedido_item_id` no item do recebimento,
  saldo e situação (`ABERTO`/`PARCIAL`/`RECEBIDO`) derivados na leitura sem tocar o `status` do
  core, e a recusa de receber acima do saldo. ~~**Inerte em produção até a Etapa 38**~~ —
  **deixou de ser inerte em 2026-09-16**: com o `POST /api/compras/pedidos` (`fa410ce`) o `<select>`
  "Pedido de compra" da tela de recebimento passa a ter o que oferecer, e a jornada está presa por
  teste em `comprasPedidoIntegracao.api.test.js` (`dc60507`).
- **Criação do pedido de compra no core Compras — ENTREGUE na Etapa 38** (`be71754..0a7e5c6`, esta
  feature): seis rotas novas, formulário `/compras/pedidos/novo` e `/compras/pedidos/editar/:id`,
  importação por planilha, e "Gerar pedido" na aba Solicitações da Reposição — **o primeiro
  consumidor que `purchaseService.vincularPedidoCompra` já teve** (`727ee29`).
- **Acompanhamento do prazo do pedido — ENTREGUE na Etapa 39** (`39ea9d2..19ebf7d`, esta feature):
  `atrasado`/`dias_atraso` derivados em `GET /api/compras/pedidos` (`437aed2`), badge + filtro
  `Só atrasados` + duas colunas no Excel (`833850e`), o alerta `PEDIDO_COMPRA_ATRASADO` na varredura
  diária e na central (`ddbc18f`, `33031ac`, `8f3db94`), e `PATCH /api/compras/pedidos/:id/status`
  (`19ebf7d`) — a única porta que muda o status de um pedido que já teve recebimento. Contratos
  completos abaixo.
- **Telas de fornecedor e cotação — ENTREGUE na Etapa 40** (`7ccfc85..03cd048`, esta feature) e
  **cotação com itens convertida em pedido — ENTREGUE na Etapa 41** (`7d9e7d7..ffba9b9`, esta
  feature): `itens_cotacao` (`schema.js:1349`), `POST /api/compras/cotacoes/:id/gerar-pedido`
  criando o pedido que a Etapa 37 recebe (a integração `comprasCotacaoPedidoIntegracao` o encontra
  em `?pendentes=1` com `saldo_pendente` cheio e o custo médio herda o `valor_unitario` da cotação),
  lixeira própria da cotação, vínculo `cotacoes.pedido_id` liberado ao excluir o pedido. Contratos
  nas seções 17–19.
- Produção (MES): módulo `services/producao/` com schema próprio (`producao_ops`) — sem ponte
  com almoxarifado.
- Relatório "consumo por OS" no dashboard: o dashboard usa `GET /relatorios/consumo-os`, que
  filtra por `m.os_id` (coluna real de vínculo, em `reportService.relatorioConsumoPorOS`).
  **Correção (2026-08-11):** a spec dizia "baseado no campo texto `os_referencia` — frágil", o
  que estava **impreciso**; o campo texto `os_referencia` sobrevive apenas no relatório de
  reservas (`relatorioReservadoPorOS`, como fallback ao lado de `os_id`).

## Checklist

### Engenharia (spec 23) — BLOQUEADO POR DEPENDÊNCIA (medido na Etapa 14)

Nenhum item abaixo foi iniciado, e a razão é a mesma para todos: **BOM não existe em lugar
nenhum do sistema** (medição da Fase 0, 2026-08-24). Quando Engenharia ganhar a entidade, isto
vira etapa própria.

- [ ] Lista técnica/BOM como entidade (hoje não existe em lugar nenhum do sistema)
- [ ] Importar itens de BOM na requisição (feature 04)
- [ ] Revisão de BOM: identificar adicionados/removidos, recalcular reservas, avisar interessados, manter histórico
- [ ] Materiais equivalentes/substituições com aprovação da Engenharia

### PCP e Produção (spec 23) — BLOQUEADO POR DEPENDÊNCIA (medido na Etapa 14)

Nenhum item iniciado: o **MES existe mas está sem uso** (`producao_ops` com 0 registros,
nenhuma tela consumindo — medição da Fase 0, 2026-08-24). Integrar reserva/kit/consumo com um
módulo que ninguém opera criaria contrato contra comportamento não exercitado.

- [ ] OP gera necessidade de materiais → reserva automática (feature 07)
- [ ] Kit de produção por OP (feature 05)
- [ ] Consumo planejado × real por OP
- [ ] Devolução e perdas apontadas na OP (feature 12)
- [ ] Entrada de subconjunto/item fabricado internamente (feature 08)
- [ ] Encerramento da OP reconcilia materiais

### Fatia Compras — o pedido ganha criação (ENTREGUE na Etapa 38, `be71754..0a7e5c6`)

- [x] **As 23 rotas `/api/compras/*` extraídas para `server/routes/compras.js` e montadas no
      harness** (`be71754`): registrador
      `(app, db, authenticateToken, checkModulePermission, uploads)`, bloco de 498 linhas com
      **md5 idêntico** (deslocamento constante), `grep -c "'/api/compras"` caindo de 26 para 3 em
      `index.js`. As **3** rotas `/api/compras/solicitacoes-compra` **ficaram** em `index.js` de
      propósito (decisão 1 do design): operam `solicitacoes_compra`, tabela do core, que **não é**
      `solicitacoes_compra_almoxarifado`.
- [x] **`POST /api/compras/pedidos` — a porta que cria o pedido com itens** (`fa410ce` + fix
      `3e43069`): `server/services/compras/schemas.js` (os **primeiros Zod do módulo core**) e
      `server/services/compras/pedidoCompraService.js`. Fornecedor obrigatório, materiais
      resolvidos **antes** de qualquer escrita, `numero` **gerado** (`PC-…`, gerador da Etapa 31 —
      nunca o do payload), `valor_total` derivado da soma das linhas, `quantidade_recebida` no
      `DEFAULT 0` da Etapa 37.
- [x] **`GET /api/compras/pedidos/:id`, `PUT` e `DELETE`, com a guarda de DUAS pernas**
      (`6c21e89`): `PUT`/`DELETE` recusados se **alguma linha tem `quantidade_recebida > 0`** OU se
      **algum recebimento referencia uma linha por `pedido_item_id`**. A rota específica de
      `DELETE` registrada **antes** do genérico, e os itens apagados junto com o cabeçalho.
- [x] **`DELETE` libera a solicitação da Reposição** (`ca7956c`): a solicitação volta a `PENDENTE`
      com `pedido_compra_id NULL` (exceto `RECEBIDA`/`CANCELADA`) e a resposta ganha
      `solicitacoes_liberadas: N`. Antes disso ela ficava `VINCULADO` apontando para um id apagado
      e **nunca mais virava pedido** (achado I1 da revisão final).
- [x] **`GET /api/compras/materiais`** (`877ef23`): a busca de material **do próprio módulo
      Compras**, porque `app.use('/api/almoxarifado', …, checkModulePermission('almoxarifado'))`
      barra o prefixo inteiro — o comprador sem o módulo almoxarifado não alcança a busca de lá.
- [x] **`POST /api/compras/pedidos/importar` — carga inicial por planilha** (`877ef23`, com
      `4a41119`, `2fb9f68`, `9d07dd1`, `d9181e3`): a planilha é lida no navegador (precedente
      medido) e cada grupo passa pelo **mesmo `criarPedido`**, nunca por `INSERT` direto.
- [x] **O formulário e as duas rotas de client que faltavam** (`9f1a3da` + `ba6278e`):
      `PedidoCompraForm` lazy em `routes/lazyModules.js`, `/compras/pedidos/novo` e
      `/compras/pedidos/editar/:id` em `App.js`. Os dois `<Link>` mortos da aba Pedidos passaram a
      navegar, e o 409 da exclusão deixou de morrer no `toast.error('Erro ao excluir item')`
      genérico. **Divergência do design:** *"a rota tem de vir antes do `path="*"`"* era **falsa** —
      o react-router 6 casa por **ranking**, e o que importa é a rota **existir**.
- [x] **"Gerar pedido" na aba Solicitações da Reposição** (`727ee29`): ver feature
      [18](../18-reposicao-estoque-minimo/README.md).
- [x] **A integração que cruza os galhos, pela ROTA e pelo SERVIÇO** (`dc60507` + `0a7e5c6`):
      `server/tests/api/comprasPedidoIntegracao.api.test.js`, 6 blocos (A–D2 por HTTP; E/E2 sem
      HTTP). O bloco E existe porque a régua vale nas **duas** entradas — os chamadores sem rota
      são a importação e o "Gerar pedido".
- [x] **`DELETE /api/compras/fornecedores/:id` → 409 em vez de 500** (`59abaea`): `Fornecedor
      possui pedidos de compra — não pode ser excluído`. **Era inalcançável antes da 38** (não havia
      pedido); virou alcançável na mesma etapa que criou o dado.
      ⚠️ **Este item dizia que a lixeira "deixou de dar 500", e isso ESTAVA INCOMPLETO** — medido
      na revisão final da Etapa 40 (lente RN, I1, sonda com a DDL de produção e `foreign_keys = 1`):
      `fornecedores` tem **três** tabelas com FK para ela, não uma — `pedidos_compra`, `cotacoes` e
      **`itens_fornecedor`** (a lista de preços, `index.js:19285-19296`). Fornecedor com itens e sem
      pedido continuava respondendo **500** em produção; nenhum teste via porque `itens_fornecedor`
      não estava no harness. Fechado na 40: 409 por cotação (`6795b39`, RN-E12) e 409 por itens
      (`bdaadd8`, F1 — literal `Fornecedor possui itens cadastrados — não pode ser excluído`, stub no
      harness, cenários (9) e (12) de `comprasFornecedorRotas.api.test.js`). Precedência: pedido →
      cotação → itens. Descartado: cascatear `DELETE FROM itens_fornecedor` (irreversível).
- [ ] **Segunda camada de autorização no core Compras** — **fora por decisão declarada** (B101 /
      decisão 8 do design): `/api/compras/*` continua com `authenticateToken` +
      `checkModulePermission('compras')` e **nenhum `requirePermission`**, inclusive nas portas de
      escrita novas. Qualquer usuário com o módulo `compras` cria, edita, importa e apaga pedido. A
      **única exceção** é o gate condicional do vínculo (abaixo). Criar `ACAO_PERFIS` para o core
      exige decidir os perfis do módulo inteiro — **etapa própria**, não esquecimento.
- [ ] **Aprovação/workflow do pedido** — **fora por decisão**: `status` é campo livre dentro do
      enum de 7 valores, editável pelo `PUT`. Não há `pendente → aprovado → enviado` com guarda nem
      perfil que aprove.
- [ ] **Idempotência da importação** — **fora por decisão**: reimportar a mesma planilha
      **duplica** os pedidos. A Fase 0 propunha idempotência por `numero`, que é **incompatível**
      com o `numero` gerado pelo servidor (B100); os cenários da suíte afirmam a duplicação em vez
      de fingir que ela não existe.
- [x] **Tela de criação de cotações e fornecedores — ENTREGUE na Etapa 40** (`7ccfc85..03cd048`,
      2026-09-22). ~~**Fora do escopo, declarado**: `/compras/fornecedores/novo` e
      `/compras/cotacoes/nova` seguem caindo no `path="*"`. A 38 consertou **uma** das três abas.~~
      Os quatro caminhos (`fornecedores/novo`, `fornecedores/editar/:id`, `cotacoes/nova`,
      `cotacoes/editar/:id`) abrem formulário e gravam: `FornecedorForm` (`23b86f3`) e `CotacaoForm`
      (`b692413`) em `client/src/components/compras/`, com rotas em `App.js` e exports lazy. No
      servidor: `FornecedorSchema` + `CotacaoSchema` + `cotacoes` no harness (`008a041`); `GET
      /fornecedores/:id`, Zod nas duas portas de fornecedor **sem recusar os quatro payloads do modal
      do grupo**, `status` no `PUT`, `grupo_id: null` limpando (consertou o "Remover do grupo" que era
      no-op) e 409 por cotação (`6795b39`); `cotacaoService.js` + `POST`/`GET /:id`/`PUT
      /api/compras/cotacoes` (`29dd6a8`); integração pela rota e pelo serviço (`d64ede0`). Onda de
      correção: F2 `55a3214` (cenário (a) de `CotacaoForm.test.js` deixou de ser tautológico), F4
      `01732dd` (sem `min="0"` — o servidor decide), F3 `795e47d` + `8cde2ee` (inativo visível no
      grupo com selo; a rota do grupo devolve todos os status), F1 `bdaadd8` (terceira FK), F5
      `03cd048` (`grupo_id` acima de 2^53 com a literal). Contratos na seção própria abaixo.
      **O que a 40 deixou fora, por decisão:** ~~itens de cotação e converter cotação em pedido (não há
      `cotacao_itens` — inventar entidade é etapa própria, e é o **próximo alcançável**)~~ —
      **entregues na Etapa 41** (item seguinte); foto na tela
      nova; `cidade`/`estado`/`cep`; formato de CNPJ/e-mail; `assertFornecedor` sem checar `status`.
- [x] **Cotação com itens e conversão em pedido de compra — ENTREGUE na Etapa 41**
      (`7d9e7d7..ffba9b9`, 2026-09-22; design `7d9e7d7`, plano `d870404`, Fase 2 `183ac38`).
      **T1** `8d81cc5`: `itens_cotacao` em `server/services/almoxarifado/schema.js:1349` (8 colunas
      — espelho de `itens_pedido_compra` **sem** `quantidade_recebida`, FK para `cotacoes` e
      `materiais_almoxarifado`, índice por `cotacao_id`; em `schema.js` e não em `index.js` porque
      `initSchema` roda no harness e a tabela chega a toda suíte com a DDL de produção, sem stub),
      `CotacaoItemSchema` + `itens` **opcional** em `CotacaoSchema` com três literais próprias,
      `resolverItens` exportada do serviço de pedido (um dono para `'Material não encontrado'`),
      `cotacoes.pedido_id` por `ALTER` em `index.js` + stub do harness. **T2** `11591ca`:
      `cotacaoService.js` grava/lê itens (`DELETE`+`INSERT` no `PUT`, como o pedido), `valor_total`
      = Σ quando há itens (o do payload é ignorado) e o do payload sem itens; `excluirCotacao`
      (rota própria `DELETE /api/compras/cotacoes/:id` **acima** do genérico: 409 se convertida,
      senão filhos antes do cabeçalho); `gerarPedidoDaCotacao` → `POST
      /api/compras/cotacoes/:id/gerar-pedido` chamando `criarPedido` com `{ fornecedor_id,
      data_pedido: hojeLocalISO(), observacoes, itens }`, gravando `pedido_id` + `status =
      'aprovado'`, 201 com o pedido relido; `PUT` de convertida → 409 (RN-F15); `excluirPedido`
      **libera** a cotação (`cotacoes_liberadas`); a lista `GET /cotacoes` ganha
      `pedido_id`/`pedido_numero`. **T3** `7ecf91f`: `CotacaoForm` com busca de material, linhas,
      Total somado e o campo *Valor total* **travado** com ≥ 1 linha (caminho C — os 8 cenários da
      40 seguem sem tocar fixture), payload `itens` em `Number()` e `valor_total` **só** sem itens.
      **T4** `bd224d2`: aba Cotações com coluna **Pedido** (link para a edição), botão **"Gerar
      pedido"** condicional (sem `pedido_id`, não `rejeitado`/`cancelado`), toast *"Pedido ⟨PC⟩
      gerado da cotação ⟨numero⟩"* + `navigate` para `/compras/pedidos/editar/:id`, erro no toast,
      `Pedido` no fim do Excel. **T5** `dae1cee`: integração pela rota **e** pelo serviço —
      fornecedor (tela da 40) → cotação com 2 itens → gerar → o pedido aparece em `GET /pedidos` e
      em `GET /almoxarifado/recebimentos-aux/pedidos-compra?pendentes=1` com `saldo_pendente` cheio
      → 409 na segunda → `DELETE` da cotação 409 → `PUT` do pedido 200 → `DELETE` do pedido
      libera → gera de novo com `PC-` novo → exclui tudo com 0 órfãos. **Onda F1–F6**: **F1**
      `d6a1beb` — a conversão **não era atômica** (6 POSTs em paralelo → 6 pedidos, 5 órfãos;
      duplo clique reproduzia com 2): o `UPDATE` do vínculo virou `… WHERE id = ? AND pedido_id IS
      NULL` (CAS) e `changes === 0` compensa com `excluirPedido` do perdedor + 409 com o vencedor;
      cenários (11) e (12). **F2** `83a5d71` — `comprasCotacaoFkProducao.api.test.js`: segundo banco
      com a DDL de produção **lida** de `index.js`/`schema.js`, `foreign_keys = ON` com controle
      positivo dentro do cenário; prova que `excluirPedido` (UPDATE antes do DELETE),
      `excluirCotacao` (filhos antes) e a compensação do F1 passam com a FK vigiando — a suíte do
      harness (FK OFF) era **cega** para a ordem. **F3+F3b** `ffba9b9` — o (1) afirma
      `observacoes`, `status = 'pendente'`, `previsao_entrega = null` do pedido gerado; `somaItens`
      arredondada a 2 casas. **F4** `a09dfe8` — botão travado em voo (`useRef`, porque a guarda por
      estado não protegia). **F5** `abb46f4` — convertida abre travada com faixa `role="status"` +
      link. **F6** `327d33f` — `arredondar2` no campo travado, no Total e na carga do `GET /:id`.
      Suítes: `comprasCotacaoItens` 10, `comprasCotacaoGerarPedido` 12, `comprasCotacaoFkProducao`
      3, `comprasCotacaoPedidoIntegracao` 3, `comprasSchemasFornecedorCotacao` 15 → 19,
      `CotacaoForm.test.js` 8 → 16, `Compras.test.js` 9 → 13. Contratos na seção própria abaixo.
      **O que a 41 deixou fora, por decisão:** comparar cotações de fornecedores diferentes (exige
      "processo de cotação" com N fornecedores — entidade nova, **é o que sobra alcançável nesta
      fatia**); preço puxado de `itens_fornecedor` (texto livre, sem `material_id`); status
      `convertida`; pré-carga por `?cotacao=`; item sem material do catálogo; recebimento olhando a
      cotação; `criarPedido` ainda soma cru (só `somaItens` arredonda); a lixeira da aba continua
      visível para a convertida (409 no toast); o `ALTER … pedido_id` falha no **primeiro** boot de
      banco **novo** (padrão herdado — letra G / consulta A18).

### Compras (spec 24) — o grosso ENTREGUE na Etapa 14

- [x] Solicitação de compra com ciclo de vida completo (`110d8ce` + fix `7afa90e`): a chegada
  da nota do pedido vinculado fecha a solicitação sozinha (RECEBIDA, gancho nos DOIS caminhos
  do recebimento — processamento da nota e aprovação direta), cancelar manual existe com
  justificativa obrigatória auditada, e vincular valida as duas pontas (pedido e solicitação).
  Aproximação declarada: fecha na PRIMEIRA nota do pedido, sem conferir quantidade (B22 das
  novidades). Solicitação finalizada é terminal — não ressuscita nem re-vincula (`2de7944`
  protege por teste).
- [x] Comprador vê disponível/reservas/consumo/último preço na tela de compra (`e78bc09` + fix
  `14feaf8` no endpoint; tela `56a6bfe` + fix `fac3f11`, merge `8145265`): painel "Ver
  contexto" na tela de Reposição com disponível/reservado/em terceiros, consumo médio diário,
  último custo de entrada por NF (par movimentação×item, última linha da NF vence — limitação
  do caso degenerado declarada no código) e solicitações abertas do material.
- [x] **Acompanhamento de pedido e prazo com alerta de atraso — ENTREGUE na Etapa 39**
  (`39ea9d2..19ebf7d`, 2026-09-17). O item ficou aberto desde a Etapa 14 e a razão de então
  (*"exigiria ler prazo prometido do pedido — dado que Compras hoje não preenche com disciplina"*)
  deixou de valer em dois passos: a **Etapa 38 entregou o DADO** (`2fb9f68` — `previsao_entrega`
  preenchível pelo formulário e pela importação e, o que o alerta precisa, **validada**: só `null`
  ou `AAAA-MM-DD`; antes a coluna `DATE` aceitava `''` e serial do Excel, então um
  `WHERE previsao_entrega < date('now')` acusaria justamente os pedidos **sem** previsão), e a
  **Etapa 39 entregou a régua, a tela e o aviso**:
  - `437aed2` — `derivarAtraso` + `STATUS_PEDIDO_FORA_DO_ATRASO` + `hojeLocalISO` exportados de
    `pedidoCompraService.js`, e `GET /api/compras/pedidos` devolvendo `atrasado`/`dias_atraso`
    **derivados na leitura** mais o filtro `?atrasados=1` (contrato 1 abaixo).
  - `235c067` — o **defeito escapado da Etapa 38**: `formatDate` da aba Compras mostrava e exportava
    o **dia anterior** (ver abaixo).
  - `833850e` — badge `Atrasado há N dias`, checkbox `Só atrasados` e as colunas `Atrasado` /
    `Dias de atraso` no Excel.
  - `ddbc18f` + `33031ac` + `8f3db94` — a entrada `PEDIDO_COMPRA_ATRASADO` no registro de alertas
    (feature [20](../20-alertas/README.md)), com a **mesma** `derivarAtraso` por require lazy.
  - `fc84e09` — a integração rota → varredura → recebimento real da Etapa 37.
  - `19ebf7d` — `PATCH /api/compras/pedidos/:id/status`, a saída do beco descrito abaixo.

  **O que CONTINUA fora, e por quê:**
  - **`situacao_recebimento` na aba Pedidos** (D3 da Etapa 39): a única fonte exportada é
    `listarPedidosCompraAux`, que **não devolve `previsao_entrega`** (`receiptService.js:1486-1488`)
    e tem **`LIMIT 50`** (`:1518`) — consumi-la faria a aba divergir da rota core (sem limite) e
    recalcular a derivação criaria a **segunda fórmula de saldo** que o plano da 38 proibiu.
  - **Alerta de "pedido recebido parcialmente"**: segue `[ ]` na feature 20, agora por outro motivo
    — ver a correção visível lá.
  - **Status automático no recebimento** (D6): receber pelas portas da Etapa 37 **não** marca o
    pedido como `recebido`; quem tira o "atrasado" é o `PATCH` de status, feito à mão. É fatia da
    feature [08](../08-recebimento/README.md).
- [ ] Divergência e rejeição da Qualidade informadas ao comprador — **fora da Etapa 14 por
  decisão**: o fluxo de quarentena (feature 09) registra a rejeição, mas não há canal
  comprador-específico; entra junto com os e-mails de compra quando o negócio pedir (D7 do
  design: a etapa não criou e-mail novo).

### Projetos e custos (spec 25) — a metade que os dados permitem, ENTREGUE

- [ ] Centro de custo como entidade + vínculo obrigatório conforme tipo de movimento —
  **bloqueado por dependência**: centro de custo não existe como entidade em nenhum módulo
  (medição da Fase 0).
- [x] Custo consumido/devolvido por projeto (`8bc58ec` + fix `6e8c36c`): relatório
  **custo-por-projeto** no registro de relatórios (consumido/devolvido/líquido/movimentações
  por projeto, filtro por período, exportação XLSX, gate `gerenciar_reposicao` — nasce
  protegido, decisão D6/B24). **A spec dizia "custo do projeto atualizado a cada
  saída/devolução"** sugerindo um acumulador materializado; **foi entregue diferente, e
  melhor**: o valor é **computado do livro de movimentações na leitura** (nada a manter
  sincronizado, estorno reflete sozinho). A consequência declarada: o custo aplicado é o
  **atual** do material, retroativo — o livro não guarda custo por movimento (nota do próprio
  relatório). Junto veio a **herança de projeto/OS na devolução** (returnService, nas duas
  pernas incluindo sucata) — sem ela o "devolvido" nunca fechava.
- [ ] Comparativos previsto × consumido, comprado × utilizado, reservado × entregue —
  **bloqueados**: "previsto" exige BOM/OP (inexistentes); comprado × utilizado exige vínculo
  item-de-pedido → movimentação que o schema não tem. **Nota da Etapa 38:** o lado "comprado"
  deixou de ser vazio (há pedido real, com preço por linha), e o elo
  `recebimentos_material_itens_almoxarifado.pedido_item_id` da Etapa 37 liga a linha do pedido ao
  item do recebimento — mas o salto seguinte, **item do recebimento → movimentação de saída**,
  continua ausente, e é ele que "utilizado" precisa. O bloqueio segue, com uma perna menos.
- [ ] Fase do projeto no vínculo — **bloqueado**: `projetos` não tem entidade de fase.

## Contratos da fatia Compras — as 6 rotas novas da Etapa 38

Todas em `server/routes/compras.js`, todas com **`authenticateToken` + `checkModulePermission('compras')`
e nada mais** (uma camada — ver o item declarado no checklist). O serviço é
`server/services/compras/pedidoCompraService.js`; os schemas, `server/services/compras/schemas.js`.
Os 400 de schema saem pelo `validate()` **do almoxarifado**, reusado por `require` e não copiado, no
formato da casa: `{ error: 'Dados inválidos — <campo>: <frase>' }`.

> ⚠️ **Os schemas são `z.looseObject`, não `z.object`.** `validate()` substitui `req.body` por
> `parsed.data`, e `z.object` descartaria silenciosamente `solicitacao_id` e `observacoes` (chaves
> não declaradas) — o vínculo com a Reposição viraria no-op sem erro. É a **quinta** encarnação
> deste defeito nesta base.
> ⚠️ **Não há coerção, de propósito.** `quantidade: '5'` é **recusado** (`z.coerce` esconderia
> `material_id: 'abc'` virando `NaN`). Quem converte é o formulário, com `Number()`.

### 1. `POST /api/compras/pedidos` — cria o pedido com as linhas (RN-C02..RN-C05, RN-C13)

**Payload:** `{ fornecedor_id: number>0, itens: [{ material_id: number>0, quantidade: number>0,
valor_unitario?: number≥0 }] (≥1), status?: <enum>, data_pedido?: null|'AAAA-MM-DD',
previsao_entrega?: null|'AAAA-MM-DD', observacoes?: string, solicitacao_id?: number }`.
`numero` e `valor_total` **não são campos de entrada** — mandá-los não quebra e **não decide nada**
(o serviço os ignora).

**201** = o pedido relido: `{ id, numero: 'PC-…', fornecedor_id, fornecedor_nome, status,
valor_total, data_pedido, previsao_entrega, observacoes, …, itens: [{ id, material_id, codigo,
descricao, quantidade, valor_unitario, unidade, quantidade_recebida }] }`, mais
`vinculo_solicitacao: 'ok' | 'falhou'` **só quando veio `solicitacao_id`**.

| Código | Literal | Quando |
|---|---|---|
| 400 | `fornecedor do pedido é obrigatório` | `fornecedor_id` ausente/não-número/≤0 |
| 400 | `inclua ao menos um item no pedido de compra` | `itens` ausente ou `[]` |
| 400 | `material do item é obrigatório` | `material_id` ausente/não-inteiro/≤0 |
| 400 | `quantidade do item do pedido deve ser um número maior que zero` | inclui `'5'` (string) |
| 400 | `valor unitário do item não pode ser negativo` | — |
| 400 | `status do pedido inválido (use pendente, aprovado, rejeitado, em_analise, enviado, recebido ou cancelado)` | fora do enum; **`PARCIAL`/`RECEBIDO` nunca entram** (são derivação da Etapa 37) |
| 400 | `data do pedido inválida (use AAAA-MM-DD)` / `previsão de entrega inválida (use AAAA-MM-DD)` | `''` vira `null`; qualquer outro texto é 400 |
| 400 | `Fornecedor não encontrado` / `Material não encontrado` | guardas do **serviço** (dependem do banco), aplicadas **antes** de escrever |
| 403 | `{ error: 'Sem permissão para esta operação', acao: 'gerenciar_reposicao', perfil }` | **só** quando vem `solicitacao_id` — ver o gate condicional abaixo |

**O gate condicional do vínculo** (`3e43069`, fix 1 da T2 — a decisão 10 do design foi
**revertida na execução**): `criarPedido` chama `can(user, 'gerenciar_reposicao')` **antes de
qualquer escrita** quando vem `solicitacao_id`, e o corpo do 403 é **idêntico** ao de
`requirePermission` do almoxarifado, porque a tela já sabe ler `acao`/`perfil`. Sem esse gate,
qualquer usuário do módulo Compras — inclusive o fallback `PRODUCAO` — flipava uma
`solicitacoes_compra_almoxarifado` para `VINCULADO`, que é exatamente a escrita que o almoxarifado
gateia em `extended.js:1743`. O furo era **alcançável por clique** (o botão da T6). `POST` **sem**
`solicitacao_id` continua só com a camada do módulo.
O `try/catch` **não-fatal** do vínculo continua valendo para o que sempre cobriu — solicitação
inexistente (404) ou já terminal (400) —, e nesse caso a resposta é **201 com
`vinculo_solicitacao: 'falhou'`**. Falta de permissão é **403 e nenhum pedido**.

### 2. `GET /api/compras/pedidos/:id` — cabeçalho + linhas (RN-C06)

**200** = o mesmo objeto do 201 acima (sem `vinculo_solicitacao`). **404** `Pedido de compra não
encontrado`.
⚠️ **Sem `saldo_pendente` e sem `situacao_recebimento`, de propósito** (B103):
`derivarRecebimentoDoPedido` vive em `receiptService.js`, **não é exportada**, e aquele arquivo é
contrato de **não-toque** nesta etapa. Uma segunda fórmula de saldo divergiria da do almoxarifado na
primeira edição. Quem precisa do derivado consulta
`GET /api/almoxarifado/recebimentos-aux/pedidos-compra/:id/itens`. O que esta porta dá é
`quantidade_recebida` **crua**, que é o que a tela precisa para saber se o pedido ainda é editável.

### 3. `PUT /api/compras/pedidos/:id` — substitui as linhas (RN-C07)

Mesmo payload e mesmas literais do `POST` (**o mesmo `PedidoCompraCreateSchema`**; `solicitacao_id`
é ignorado). **Substituição, não merge:** as linhas são apagadas e reinseridas, e `valor_total` é
recomputado. `null` explícito numa coluna de data **limpa** a data (`2fb9f68`; o comentário que
dizia o contrário foi corrigido dizendo que mudou).
**200** = o pedido relido · **404** `Pedido de compra não encontrado` ·
**400** `Pedido de compra <numero> já teve recebimento — não pode mais ser editado`.

### 4. `DELETE /api/compras/pedidos/:id` — apaga o pedido, as linhas e libera a solicitação (RN-C08)

**200** `{ message: 'Pedido de compra excluído com sucesso', solicitacoes_liberadas: N }` ·
**404** `Pedido de compra não encontrado` ·
**409** `Pedido de compra <numero> já teve recebimento — não pode ser excluído`.
`Pedido de compra não encontrado` é **uma constante servindo as três portas** — divergir a frase por
porta faria a tela precisar de três tratamentos.
**Ordem de escrita, e ela é regra:** itens → solicitações → cabeçalho. Em produção a FK está **ON**,
e essa é a única sequência que não deixa nada apontando para um pedido que já não existe no meio do
caminho. `solicitacoes_liberadas` sai na resposta porque apagar um pedido **muda o estado de outro
módulo**: quem clicou na lixeira precisa saber que a solicitação voltou para a fila.

### A guarda de DUAS pernas (`PUT` e `DELETE`) — por que não basta `quantidade_recebida > 0`

1. **perna 1** — alguma linha de `itens_pedido_compra` tem `quantidade_recebida > 0`;
2. **perna 2** — algum `recebimentos_material_almoxarifado` referencia este pedido, ou algum item
   dele referencia uma linha por `pedido_item_id`.

A perna 2 existe porque um recebimento **ABERTO** tem `quantidade_recebida = 0` e **já carrega o
elo** — e o elo **não tem FK**. **Sonda executada** (sabotagem 4 da T7, com a perna 2 removida): o
`PUT` respondeu **200**, as linhas ganharam ids novos, o recebimento processou, o material **entrou
no estoque** e o pedido ficou `quantidade_recebida 0` / `saldo_pendente 10` / `ABERTO` **para
sempre** — porque o acumulador da Etapa 37 é `UPDATE … WHERE id = ?` e alteraria **0 linhas sem
erro**. Ambas as pernas valem no **serviço**, não no handler: o bloco E do teste de integração
prova as duas sem HTTP (os chamadores sem rota são a importação e o "Gerar pedido").
⚠️ **Declarado, não resolvido:** a guarda é check-then-write com as leituras **fora** do
`writeChain`. Um recebimento criado nessa janela reproduz o órfão. O motor não tem transação — é
item da migração para Postgres.

### 5. `POST /api/compras/pedidos/importar` — carga inicial por planilha (RN-C10, RN-C11)

**Payload:** `{ linhas: [ {...} ] }` (ou `rows`) — objetos com cabeçalho em **qualquer grafia**; o
XLSX é lido no **navegador** e chega em JSON. **Sem `validate()` de propósito:** a forma é
desconhecida, e a guarda é a **mesma literal** do precedente de importação de itens do fornecedor.

**400** `Envie "linhas" ou "rows" com array de objetos (qualquer formato de planilha)` — é o **único**
caso que recusa a planilha inteira.

**201, mesmo com linhas recusadas** (sucesso parcial):
`{ pedidos: [{ id, numero, itens }], itens: N, ignorados: [{ linha, motivo }], avisos: [{ linha,
campo, motivo }] }`.

- **Agrupamento:** um pedido por par **(ordem da planilha, fornecedor DA LINHA)** — `4a41119`, achado
  **C1** da revisão final. Antes agrupava só pela coluna de pedido, e um item da BETA era gravado no
  pedido da ACME: a conta a pagar da Etapa 37 nasceria para o **fornecedor errado**.
  **Regressão declarada:** planilha com o CNPJ só na **1ª linha** da OC perde as demais — cada linha
  precisa do próprio fornecedor.
- **`ignorados` — os 4 motivos, um por fato:** `linha sem código de material` ·
  `quantidade inválida` · `material não encontrado pelo código <cod>` · `fornecedor não encontrado`.
- **`avisos` — a linha ENTROU, mas um campo não foi entendido** (`2fb9f68`): a data é
  **informativa**, então o campo vira `null` e o operador sabe **qual célula arrumar**. Motivos:
  `previsão de entrega não reconhecida (use AAAA-MM-DD ou DD/MM/AAAA)` e
  `data do pedido não reconhecida (use AAAA-MM-DD ou DD/MM/AAAA)`. Serial do Excel e `DD/MM/AAAA`
  **convertem**; irreconhecível vira `null` + aviso.
- **`data_pedido`** vem das colunas `data`/`data_pedido`/`data do pedido`/`emissão`; ausente → **hoje**
  (data **local** do servidor) — `d9181e3`. Antes disso a aba mostrava `Data Pedido: -` em toda linha
  da carga.
- **`observacoes` = `Planilha: <agrupador>`** (a OC do fornecedor, que o `<select>` do recebimento
  **não mostra**).
- **Cada grupo passa pelo mesmo `criarPedido`, nunca por `INSERT` direto** — é o que garante o
  `numero` gerado, o `valor_total` derivado e o `quantidade_recebida 0`.
- **Sem idempotência:** reimportar **duplica**. Afirmado por cenário, não omitido.

### 6. `GET /api/compras/materiais?search=` — a busca de material do próprio Compras (RN-C09)

**200** `[{ id, codigo, descricao, unidade }]`, `COALESCE(ativo, 1) = 1`, `ORDER BY codigo`,
**`LIMIT 50`** (o destino é um `<select>`/autocomplete). `descricao` é
**`COALESCE(nome, descricao)`** nesta ordem: em `materiais_almoxarifado` quem é `NOT NULL` é
**`nome`**, e selecionar `descricao` crua devolveria opções **em branco**.
⚠️ Ela existe porque `app.use('/api/almoxarifado', …, checkModulePermission('almoxarifado'))` barra
o **prefixo inteiro** antes de qualquer handler: o comprador sem o módulo almoxarifado toma 403 em
`GET /api/almoxarifado/materiais` sem nunca chegar na rota. **O harness libera a camada 2
(`fakeCheckModulePermission`), então a suíte NÃO prova esse 403** — a prova é a leitura daquelas
quatro linhas, e isso está declarado no cabeçalho de `comprasPedidoImportar.api.test.js`.

### 7. A 7ª mudança de contrato, fora das rotas de pedido

`DELETE /api/compras/fornecedores/:id` (ramo `fornecedores` do genérico, `59abaea`) responde **409**
`Fornecedor possui pedidos de compra — não pode ser excluído` quando o fornecedor tem pedido. Antes
retornava **500 `'Erro ao excluir item'`** por violação de FK — e isso **só se tornou alcançável
nesta etapa**, porque antes dela não existia pedido nenhum.

### O que a Etapa 38 NÃO mudou (conferido pelos revisores)

Extração byte-fiel das 23 rotas, ordem de registro, e o **sombreamento de
`DELETE /api/compras/grupos/:id`** pelo genérico (`400 'Tipo inválido'`) — **medido, congelado como
caracterização, não consertado**: é comportamento de outra aba, e consertá-lo dentro de uma extração
"sem mudar comportamento" seria contradição. O cenário que o congela é a asserção que **detecta
reordenação** das rotas. Nenhuma linha toca `receiptService.js`, `extended.js` ou
`schema.js`. `?pendentes=1` **não filtra `status`**: pedido `cancelado`/`rejeitado` continua no
`<select>` do recebimento (porta da Etapa 37, proibida por contrato nesta etapa), e o `LIMIT 50` +
`created_at` com resolução de 1 s fazem uma importação grande **sumir** desse select sem mensagem.

## Contratos da fatia Compras — o acompanhamento de prazo (Etapa 39, `39ea9d2..19ebf7d`)

Mesmo gate das outras: `authenticateToken` + `checkModulePermission('compras')` e **nada mais** — o
core continua com **uma** camada (B101). Nenhuma coluna nova, nenhuma migration, nenhum `UPDATE` de
varredura: o atraso é **derivado na leitura** e some junto com o código que o deriva.

### 8. `GET /api/compras/pedidos` — dois campos acrescentados e um filtro (`437aed2`)

| | Antes (Etapa 38) | Depois (Etapa 39) |
|---|---|---|
| Query | `search`, `status` | `search`, `status`, **`atrasados`** |
| Ordenação | `ORDER BY p.created_at DESC` | **inalterada** (o filtro é pós-SQL; a query não mudou) |
| `LIMIT` | não tem | **continua sem** |
| Resposta 200 | `[{ …pedidos_compra.*, fornecedor_nome }]` | `[{ …, fornecedor_nome, atrasado, dias_atraso }]` |
| Erros | 401 sem token, 403 sem o módulo, 500 `{ error }` | **inalterados** |

- **`atrasado`**: `0` ou `1` — **número, nunca booleano** (espelha `ativo`/`evento` do resto da base).
- **`dias_atraso`**: inteiro **positivo** quando `atrasado === 1`; **`null`** quando `atrasado === 0`.
  **Nunca `0`**, porque "0 dias de atraso" e "não atrasado" não podem ser o mesmo valor — o badge da
  tela renderizaria `Atrasado há 0 dias`.
- **`atrasados`**: só a **string `'1'`** liga o filtro (`req.query` do Express é sempre string).
  Ausente, `''`, `'0'` ou `'sim'` = sem filtro. Compõe com `search` e `status`.
- **`previsao_entrega = ''`** (legado anterior ao F3 da Etapa 38) → `atrasado: 0`, `dias_atraso: null`.
  O guarda real é a **regex** `^\d{4}-\d{2}-\d{2}$` de `derivarAtraso`, não o `IS NOT NULL`.
- ⚠️ **`GET /api/compras/pedidos/:id` NÃO deriva atraso** — só a listagem. Assimetria declarada
  (Minor M5 da revisão final, não acionado): a primeira tela que quiser o badge no detalhe deve
  chamar `derivarAtraso`, **nunca** recalcular.
- ⚠️ **Se um dia esta rota ganhar `LIMIT`, o filtro pós-SQL quebra em silêncio** (o `LIMIT` cortaria
  antes da derivação). Declarado na T1.

### 9. A régua de atraso — **uma função, um lugar** (`server/services/compras/pedidoCompraService.js`)

```js
const STATUS_PEDIDO_FORA_DO_ATRASO = ['recebido', 'cancelado', 'rejeitado'];
derivarAtraso(pedido, hoje = hojeLocalISO()) → { atrasado: 0|1, dias_atraso: number|null }
hojeLocalISO(agora = new Date()) → 'AAAA-MM-DD'
```

Atrasado é `previsao_entrega` casando a regex **E** `previsao_entrega < hoje` **E** `status` fora de
`STATUS_PEDIDO_FORA_DO_ATRASO`. A fronteira é `<`, nunca `<=`: **vence hoje não está atrasado**.
`dias_atraso` é `(meiaNoiteUTC(hoje) - meiaNoiteUTC(previsao)) / 86400000` — `Date.UTC` nas duas
pontas, a única aritmética de datas da fatia.

**Dois consumidores e um só lugar, e isso é o ponto:** a rota acima e a entrada
`PEDIDO_COMPRA_ATRASADO` do `alertRegistry` do almoxarifado (require **lazy**, feature 20). Escrever
a lista de status duas vezes faria a tela dizer "atrasado" para um conjunto e o e-mail sair para
outro — o teste `alertaPedidoAtrasado.api.test.js (5)` cruza os dois conjuntos de ids com
`deepStrictEqual`.

⚠️ **`hojeLocalISO` NÃO é o relógio do contêiner** (`45bda69`, achado Critical da revisão final):
ela recorta o dia por `Intl.DateTimeFormat('en-CA', { timeZone: FUSO_PADRAO })` —
`America/Sao_Paulo`, o mesmo fuso de `auditFiltros` e de `client/jest.globalSetup.js`. **Isto
corrige a premissa do design desta etapa** (*"o servidor usa a data local do host, então nunca é
UTC"*), que **estava errada em produção**: o contêiner é `node:20-alpine` sem `TZ` e sem `tzdata`,
e às 21:30 BRT o pedido que vence **hoje** já acusava atraso no badge, no filtro, no Excel e no
e-mail. O `Dockerfile` ganhou `tzdata` + `ENV TZ=America/Sao_Paulo` como segunda trava — as duas,
nunca uma só. **Nunca use `date('now')` do SQLite nesta régua**: é UTC.

### 10. `PATCH /api/compras/pedidos/:id/status` — a porta que só escreve status (`19ebf7d`)

**Payload:** `{ status }`, validado por `PedidoStatusSchema` (`z.object`, com *strip* deliberado: um
corpo com `itens`/`fornecedor_id`/`quantidade_recebida` chega ao serviço como `{ status }` e mais
nada — a porta que promete "só o status" não pode depender de o serviço ignorar o resto).

| Código | Corpo |
|---|---|
| **200** | `{ id, numero, status }` |
| **400** | `Dados inválidos — status: status do pedido inválido (use pendente, aprovado, rejeitado, em_analise, enviado, recebido ou cancelado)` |
| **404** | `Pedido de compra não encontrado` (a **mesma** constante das outras três portas) |

O serviço (`alterarStatusPedido`) faz **um** `UPDATE pedidos_compra SET status = ?, updated_at =
CURRENT_TIMESTAMP` e nada mais: **não toca `itens_pedido_compra`**, não recomputa `valor_total`, não
mexe em vínculo de solicitação.

**Por que ela existe, e o que foi descartado:** a guarda de duas pernas do `PUT` (Etapa 38, RN-C07)
recusa com 400 qualquer edição de pedido que já teve recebimento — e essa é **exatamente** a
população que o recebimento do almoxarifado produz. Resultado medido antes do conserto: **todo
pedido recebido pelo almoxarifado ficava "Atrasado" para sempre**, no badge, no filtro `?atrasados=1`
e no cartão da central, sem gesto de tela que limpasse. **Descartado: afrouxar a guarda do `PUT`** —
`atualizarPedido` faz `DELETE` + `INSERT` das linhas e as novas nascem com `quantidade_recebida = 0`
pelo `DEFAULT`, então o operador receberia o mesmo material duas vezes. O cenário (5) de
`comprasPedidoStatus.api.test.js` é a régua de que a guarda do `PUT` **não** foi afrouxada.

⚠️ **Declarado:** o `PATCH` aceita **qualquer** dos 7 status, inclusive em pedido já recebido — não
há máquina de estados no módulo Compras (o `status` é campo livre dentro do enum desde a Etapa 38).

### 11. `GET /api/compras/pedidos/:id` ganhou `teve_recebimento` (`19ebf7d`)

**200** = o mesmo objeto de antes **mais** `teve_recebimento: 0|1`, derivado pelas **mesmas duas
pernas** da guarda do `PUT` (linha com `quantidade_recebida > 0` **ou** recebimento apontando para
uma linha por `pedido_item_id`). Existe porque a tela precisa saber **antes** de montar o formulário:
com `1`, o `PedidoCompraForm` em modo edição mostra *"Este pedido já teve recebimento — só o status
pode ser alterado"*, desabilita fornecedor, itens e datas, e salva por `PATCH` em vez de `PUT`
(toasts `Status do pedido atualizado` / `Não foi possível atualizar o status do pedido.`). Sem esse
campo a tela só descobriria a recusa **depois** de o comprador preencher tudo e tomar 400.

### 12. A entrada de alerta `PEDIDO_COMPRA_ATRASADO` (`ddbc18f`, `33031ac`, `8f3db94`)

Vive no `alertRegistry` do **almoxarifado** e é a **primeira entrada do registro que lê tabelas
CORE** (`pedidos_compra`, `fornecedores`) — as 11 anteriores só leem `*_almoxarifado`. Contrato
completo (colunas projetadas, chave de dedupe com a previsão, assunto `[Compras] …`, canal e
central) na feature [20](../20-alertas/README.md).

### 13. O defeito escapado da Etapa 38, corrigido aqui (`235c067`)

`formatDate` (`client/src/components/Compras.js`) era `new Date(date).toLocaleDateString('pt-BR')` —
e `new Date('2026-09-16')` é **meia-noite UTC**, renderizada em `America/Sao_Paulo` como
**`15/09/2026`**. Como a **exportação usa a mesma função** e a importação lê `DD/MM/AAAA`, exportar e
reimportar o próprio Excel do CRM **movia as duas datas um dia para trás** a cada volta. Agora
`formatDate` formata a **string** `AAAA-MM-DD` por `split('-')`, sem `new Date`, e vale para exibição
**e** export; `hojeISO` do formulário passou a ser local (era UTC: entre 21h e 0h o formulário nascia
com a data de **amanhã**). Régua geral da casa, escrita aqui porque custou uma etapa: **data não
passa por `new Date(str)`** — nem no client, nem no servidor, nem em fixture de teste.

## Contratos da fatia Compras — fornecedores e cotações (Etapa 40, `7ccfc85..03cd048`)

Mesmo gate de sempre: `authenticateToken` + `checkModulePermission('compras')` e **nada mais** (a
revisão final sondou as quatro rotas novas com `setUser(null)` → 401). Design em
`docs/superpowers/specs/2026-09-21-crm-etapa40-fornecedores-cotacoes-design.md` (D1–D14,
RN-E01…E16, e a seção 12 com o que o design previu errado); plano em
`docs/superpowers/plans/2026-09-21-crm-etapa40-fornecedores-cotacoes.md`.

### 14. Fornecedor — `FornecedorSchema` e as portas (`008a041`, `6795b39`)

| Rota | Corpo | Resposta | Erros |
|---|---|---|---|
| `GET /api/compras/fornecedores/:id` (**nova**) | — | `200 { id, razao_social, nome_fantasia, cnpj, contato, email, telefone, endereco, cidade, estado, cep, status, grupo_id, foto, created_at, updated_at }` — **sem** `planilha_dados`/`planilha_nome`/`planilha_atualizado_em` | `404 { error: 'Fornecedor não encontrado' }` (id inexistente ou não numérico) |
| `POST /api/compras/fornecedores` | `FornecedorSchema` (`looseObject`) | `201 { id, razao_social, nome_fantasia, grupo_id }` — **mantido** da 38; grava `status = 'ativo'` **sempre** e **ignora** `status` no corpo; passou a gravar `endereco` (era ignorado) | `400 'Dados inválidos — razao_social: Razão social é obrigatória'` (vazia ou só espaços); `400 'Dados inválidos — grupo_id: grupo do fornecedor inválido'` |
| `PUT /api/compras/fornecedores/:id` | `FornecedorSchema` | `200 { message: 'Fornecedor atualizado' }` — **mantido**. **Substituição total** dos 7 textos (`razao_social, nome_fantasia, cnpj, contato, email, telefone, endereco`): ausente ou `''` grava `''`/`null` (caracterizado, não mudado — a tela reenvia todos). `grupo_id` e `status` só entram no `UPDATE` quando vieram (`!== undefined`) | `400` idem; `400 'Dados inválidos — status: status do fornecedor inválido (use ativo ou inativo)'`; `404 'Fornecedor não encontrado'` |
| `DELETE /api/compras/fornecedores/:id` (genérico) | — | `200 { message: 'Item excluído com sucesso' }` | `409` `Fornecedor possui pedidos de compra — não pode ser excluído` → `Fornecedor possui cotações — não pode ser excluído` → `Fornecedor possui itens cadastrados — não pode ser excluído` (nessa precedência, **antes** do `DELETE`, mesma frase no harness e em produção); `404 'Item não encontrado'` |
| `GET /api/compras/grupos/:grupoId/fornecedores` | — | desde `8cde2ee` devolve **todos os status** do grupo, `ORDER BY CASE WHEN status = 'inativo' THEN 1 ELSE 0 END, razao_social` (ativos e `NULL` legado primeiro), com a coluna `status` na linha | — |

**`grupo_id` (RN-E03):** número, string numérica (`'3'` → 3, vem de `useParams` no modal), `null`,
`''`, `0` e ausente são válidos. `null`/`''`/`0`/`NaN`/negativo → `null` (no `PUT`, **limpa** a
coluna — o botão "Remover do grupo" passou a remover); ausente → `undefined` (o `PUT` **não mexe**);
`'abc'`, `3.5`, `{}` e qualquer número acima de 2^53 → 400 com a literal (`03cd048`).
**Textos:** `trim`, `''` aceito, `null` aceito, **sem** validação de formato de e-mail/CNPJ (D3 —
o modal do grupo manda `''` e produção tem CNPJ livre). `looseObject`: chave desconhecida (`cidade`)
sobrevive ao parse e a rota a ignora.
**`status` (RN-E04/E05):** `'ativo' | 'inativo'` só no `PUT`. Inativo **some** do seletor do
recebimento (`GET /api/almoxarifado/recebimentos-aux/fornecedores`, `WHERE status = 'ativo'`,
de propósito) e **continua aceito** por `POST /api/compras/pedidos` e por cotação
(`assertFornecedor` não checa status — declarado). Na tela do grupo aparece com selo *Inativo* e
não é oferecido no "Vincular" (`795e47d`).

### 15. Cotação — `CotacaoSchema`, `cotacaoService.js` e as três portas (`008a041`, `29dd6a8`)

`STATUS_COTACAO = ['em_analise', 'aprovado', 'rejeitado', 'cancelado']` (masculino, porque
`getStatusColor` e o filtro da aba já pintam essas formas). `linha` =
`{ id, numero, fornecedor_id, fornecedor_nome, valor_total, data_cotacao, validade, status, observacoes, created_at, updated_at }`.

| Rota | Corpo | Resposta | Erros |
|---|---|---|---|
| `POST /api/compras/cotacoes` | `CotacaoSchema`: `numero` **digitado**, obrigatório, `trim`; `fornecedor_id` inteiro > 0 **sem coerção** (`'3'` → 400; a tela manda `Number()`); `valor_total` número ≥ 0, opcional, default `0` (campo de entrada — não há itens para somar); `data_cotacao`/`validade` `''`/`null`/ausente → `NULL`, `AAAA-MM-DD` grava, outro → 400 (**regra de forma**: `2026-13-45` passa, como no pedido); `status` ∈ `STATUS_COTACAO`, default `'em_analise'`; `observacoes` texto | `201` linha com `fornecedor_nome` | `400 'Dados inválidos — numero: número da cotação é obrigatório'`; `… fornecedor_id: fornecedor da cotação é obrigatório`; `… valor_total: valor total da cotação não pode ser negativo` (também para `'10'` e `null`); `… data_cotacao: data da cotação inválida (use AAAA-MM-DD)` / `… validade: validade da cotação inválida (use AAAA-MM-DD)`; `… status: status da cotação inválido (use em_analise, aprovado, rejeitado ou cancelado)`; `400 'Fornecedor não encontrado'` (fornecedor inexistente — inativo é aceito); `409 'Já existe uma cotação com o número ⟨numero⟩'` |
| `GET /api/compras/cotacoes/:id` | — | `200` linha | `404 'Cotação não encontrada'` |
| `PUT /api/compras/cotacoes/:id` | o **mesmo** schema (substituição total do cabeçalho) | `200` linha | `400` (o schema roda **antes** do 404 — `PUT /999999 {}` responde 400, mesma ordem do pedido); `404`; `409` para número de **outra** cotação (o próprio id com o mesmo número → 200) |
| `DELETE /api/compras/cotacoes/:id` (genérico) | — | `200` | `404 'Item não encontrado'` — **inalterado**, sem guarda (cotação não tem filhos) — ⚠️ **esta linha era verdade até a 40 e ficou FALSA na 41**: desde `11591ca` a rota é **própria**, `404 'Cotação não encontrada'`, 409 se convertida, e apaga os itens antes (contrato na seção da 41 abaixo). Fica riscada à vista, não apagada |

> ⚠️ **Duas frases da tabela acima ficaram FALSAS na Etapa 41 e ficam corrigidas à vista:**
> *"`valor_total` … (campo de entrada — não há itens para somar)"* — **era verdade até a 40**; desde
> `11591ca`, com `itens` no corpo, `valor_total` é **derivado** e o do payload é **ignorado**; sem
> itens continua entrada (D3 da 41). E *"`PUT` … (substituição total do cabeçalho)"* — desde a 41 é
> substituição total do **documento**: `PUT` sem `itens` **apaga** as linhas (RN-F05) e `PUT` de
> cotação **convertida** responde 409 (RN-F15).

O 409 do `numero` tem **duas guardas**: `SELECT id FROM cotacoes WHERE numero = ? AND id <> ?`
antes do `INSERT`/`UPDATE` **e** a tradução de `SQLITE_CONSTRAINT … cotacoes.numero` no `catch`
(sonda da revisão final: 6 `POST` concorrentes → 1×201 + 5×409, 1 linha). A suíte só exercita a
primeira — a segunda é declarada (letra G). `numero` é digitado por contrato de `numeroDoc.js:64`
(é o número do documento do **fornecedor**); `UNIQUE` do SQLite é sensível a caixa (`cot-77` e
`COT-77` coexistem — anotado, não é RN).

### 16. As telas (`23b86f3`, `b692413`, `01732dd`)

- **`FornecedorForm`** (`/compras/fornecedores/novo`, `/editar/:id`): `h1` *"Novo fornecedor"* /
  *"Editar fornecedor"*; 7 textos (todos `type="text"`, inclusive e-mail — o navegador não valida o
  que o servidor não valida), Grupo (`GET /compras/grupos`, opção *"Sem grupo"* = `''` → o servidor
  limpa) e **Status só na edição**. Recusa local: *"Razão social é obrigatória"* em `role="alert"`
  sem chamar a API. `PUT` manda os 7 textos + `grupo_id` + `status`; `POST` os 7 + `grupo_id`.
  Toast *"Fornecedor salvo"* e volta à aba; erro do servidor na faixa `role="alert"` com a literal.
- **`CotacaoForm`** (`/compras/cotacoes/nova`, `/editar/:id`): `h1` *"Nova cotação"* / *"Editar
  cotação"*; Número*, Fornecedor* (`GET /compras/fornecedores`, lista **inclusive inativos** — como o
  pedido, declarado), Data (nasce hoje **local**, `hojeISO` por getters, nunca `toISOString`),
  Validade, Valor total (**sem** `min="0"` — `01732dd`: `-1` viaja e o 400 do servidor chega à
  faixa), Status, Observações. Recusa local: *"Número da cotação é obrigatório"* / *"Fornecedor da
  cotação é obrigatório"* (inicial maiúscula; as do servidor são minúsculas — o client não importa o
  servidor, declarado). Payload com `Number()` nos numéricos. Toast *"Cotação salva"*.
- **Aba Compras** (`Compras.js`): botão *"Nova Cotação"* (era *"Novo Cotação"*); `<select>` de status
  por aba (Fornecedores `ativo/inativo`; Pedidos os 7; Cotações os 4) com `statusValido` derivado —
  o `<Compras/>` **não remonta** entre abas e um filtro inválido na aba nova cai em `''` tanto no
  `value` quanto na requisição. Filtro **válido** nas duas abas (ex.: `aprovado` de Cotações → Pedidos)
  viaja — coerente, declarado (letra G).

### O que a Etapa 40 NÃO mudou (conferido pelos revisores)

`listarFornecedoresAux` (`receiptService.js`) segue `WHERE status = 'ativo'`; `assertFornecedor`
segue sem checar status; `GET /api/compras/fornecedores` (lista) segue `SELECT *` sem `LIMIT`, com
`planilha_dados` inteiro; a literal de pedido do 409 segue inline na rota (a de cotação vem do
serviço); `FornecedoresDoGrupo.js` continua **sem suíte** (o F3-cliente foi verificado por build +
suíte inteira, declarado no commit e na letra G).

## Contratos da fatia Compras — cotação com itens e conversão (Etapa 41, `7d9e7d7..ffba9b9`)

Design em `docs/superpowers/specs/2026-09-22-crm-etapa41-cotacao-itens-pedido-design.md` (D1–D12,
RN-F01…RN-F15, §12 com o que o design previu errado); plano em
`docs/superpowers/plans/2026-09-22-crm-etapa41-cotacao-itens-pedido.md`.

### 17. O item da cotação — `CotacaoItemSchema` e `itens_cotacao` (`8d81cc5`)

`itens: z.array(CotacaoItemSchema, { error: 'itens da cotação devem ser uma lista' }).optional()`
em `CotacaoSchema`. Item: `material_id` inteiro > 0 **sem coerção** (*"material do item da cotação é
obrigatório"*), `quantidade` > 0 (*"quantidade do item da cotação deve ser um número maior que
zero"*), `valor_unitario` ≥ 0 opcional, default 0 (*"valor unitário do item da cotação não pode ser
negativo"*). Caminho do 400: `Dados inválidos — itens.0.material_id: …` (um item `{}` gera **duas**
issues, `material_id` e `quantidade`, unidas por `; `). As três literais são **diferentes** das do
pedido — cenário (s) prova por `notStrictEqual`. Material inexistente → 400 `'Material não
encontrado'` (de `resolverItens`) e **nada é gravado**: `resolverItens` roda **antes** do `INSERT` do
cabeçalho. Tabela: `itens_cotacao (id, cotacao_id, material_id, codigo, descricao, quantidade,
valor_unitario, unidade)` em `schema.js:1349`; `codigo/descricao/unidade` copiados do material.

### 18. As portas de cotação depois da 41 (`11591ca`, `d6a1beb`, `ffba9b9`)

`linha` = a da 40 **+ `pedido_id`, `pedido_numero`** (`LEFT JOIN pedidos_compra`) **+ `itens[{ id,
material_id, codigo, descricao, unidade, quantidade, valor_unitario }]`** (`ORDER BY id`). A lista
`GET /cotacoes` devolve `pedido_id`/`pedido_numero` e **não** devolve `itens`.

| Rota | Corpo | Resposta | Erros |
|---|---|---|---|
| `POST /api/compras/cotacoes` | `CotacaoSchema` + `itens` opcional | `201` linha + itens; com itens `valor_total` = Σ(quantidade × valor_unitario) **arredondado a 2 casas** (`ffba9b9`) e o do payload **ignorado**; sem itens (ausente ou `[]`), `valor_total` do payload | os da 40; `400 'Material não encontrado'` (nada gravado); `400 'Dados inválidos — itens.N.campo: ⟨literal⟩'` |
| `PUT /api/compras/cotacoes/:id` | idem | `200` linha + itens — **substitui** as linhas (`DELETE` + `INSERT`, ids novos); **sem `itens` apaga** as linhas e volta o total ao do payload | os da 40; **`409 'Cotação ⟨numero⟩ já gerou o pedido ⟨PC⟩ — não pode mais ser editada'`** se `pedido_id` (RN-F15, Fase 2 I3) |
| `GET /api/compras/cotacoes/:id` | — | `200` linha + itens + `pedido_*` | `404 'Cotação não encontrada'` |
| **`DELETE /api/compras/cotacoes/:id`** (própria, `:387`, **acima** do genérico `:393`) | — | `200 { message: 'Cotação excluída com sucesso' }` — apaga `itens_cotacao` **antes** da cotação | `404 'Cotação não encontrada'`; **`409 'Cotação ⟨numero⟩ já gerou o pedido ⟨PC⟩ — não pode ser excluída'`** |
| **`POST /api/compras/cotacoes/:id/gerar-pedido`** (`:379`) | **sem corpo** | `201` o pedido relido por `obterPedido` (`numero` `PC-…`, `valor_total` = Σ, `data_pedido` = hoje local, `status 'pendente'`, `previsao_entrega null`, `observacoes` da cotação, `itens` com `quantidade_recebida 0`, `teve_recebimento 0`); grava `cotacoes.pedido_id` e `status = 'aprovado'` | guardas **nesta ordem**: `404`; **`409 'Cotação ⟨numero⟩ já gerou o pedido ⟨PC⟩'`**; `400 'cotação ⟨rejeitado|cancelado⟩ não pode gerar pedido'`; `400 'cotação sem itens não pode gerar pedido'`; `400 'Fornecedor não encontrado'` (apagado — só alcançável no harness); `400 'Fornecedor inativo — reative-o em Compras → Fornecedores antes de gerar o pedido'` (a **primeira** porta do Compras a olhar `fornecedores.status`) |

**Atomicidade sem transação** (`d6a1beb`, F1): o `UPDATE cotacoes SET pedido_id = ?, status =
'aprovado', updated_at = … WHERE id = ? AND pedido_id IS NULL` é a guarda; `changes === 0` →
`excluirPedido` do pedido recém-criado (compensação — nunca apontado, passa com FK ON) → relê a
cotação (404 se sumiu) → 409 com o vencedor. Provado por (11) (6 `POST` em `Promise.all` → 1×201 +
5×409, `COUNT(pedidos_compra)` +1, 0 órfãos) e (12) (`DELETE /cotacoes/:id` × `gerar-pedido` → 0
pedidos sem cotação apontando). **Entrelaçamento teórico não coberto, declarado:** `excluirCotacao`
lê `pedido_id NULL`, o `gerar` vence o CAS, e só então o `DELETE FROM cotacoes` apaga a cotação —
pedido vivo sem cotação; inalcançável no harness, o (12) acusa se aparecer.

**`excluirPedido` libera a cotação** (`11591ca`, RN-F12 corrigida na Fase 2 I2): `UPDATE cotacoes
SET pedido_id = NULL … WHERE pedido_id = ?` **antes** do `DELETE` do cabeçalho (ordem que a FK exige
em produção — provada em `comprasCotacaoFkProducao` (1), `83a5d71`), resposta com
`cotacoes_liberadas: N`. O `status = 'aprovado'` fica; regenerar cria `PC-` novo **a partir da
cotação** (o `PUT` feito no pedido anterior se perde — letra B).

### 19. As telas (`7ecf91f`, `bd224d2`, `a09dfe8`, `abb46f4`, `327d33f`)

- **`CotacaoForm`**: bloco **Itens** (busca por `GET /compras/materiais?search=`, linha com
  quantidade 1 e preço vazio, subtotal, *"Total: R$ …"*), `data-testid` prefixados `cotacao-`, sem
  `min="0"`; o campo *Valor total* é `readOnly` e mostra a soma (arredondada) com ≥ 1 linha,
  digitável sem linha (**o digitado volta** ao remover a última linha); payload `itens` sempre
  (pode ser `[]`) com `Number()`, `valor_total` **só** quando `itens.length === 0`; item sem preço →
  aviso *"Item sem preço entra na cotação com valor unitário 0."*, não recusa; 400 de item em
  `role="alert"`. **Convertida** (`pedido_id` no `GET /:id`): faixa `role="status"`
  `data-testid="cotacao-convertida"` *"Esta cotação já gerou o pedido ⟨PC⟩ — não pode mais ser
  editada"* com `<Link>` para `/compras/pedidos/editar/⟨id⟩`, 13 controles `disabled`, Salvar não
  renderizado, submit sai cedo.
- **Aba Cotações** (`Compras.js`): coluna **Pedido** entre Status e Ações (`<Link>` com
  `pedido_numero`, fallback `#id`, ou `-`); botão `title="Gerar pedido"`
  (`data-testid="gerar-pedido-⟨id⟩"`) só sem `pedido_id` e status ∉ {`rejeitado`, `cancelado`},
  `disabled` enquanto o `POST` está em voo (`gerandoRef` segura o par de cliques no mesmo tick);
  sucesso → toast *"Pedido ⟨PC⟩ gerado da cotação ⟨numero⟩"* e `navigate` para a edição do pedido;
  erro → `toast.error` com a literal do servidor (fallback *"Não foi possível gerar o pedido"*), sem
  navegar. Export: `'Pedido'` no **fim**. A lixeira continua visível para a convertida: o
  `handleDelete` leva o 409 do servidor ao `toast.error` com a literal (desde a 38) e, no sucesso,
  mostra o toast fixo *"Item excluído com sucesso"* em vez de *"Cotação excluída com sucesso"*
  (Fase 2 M7, não é defeito) — declarado.

### O que a Etapa 41 NÃO mudou (conferido pelos revisores)

`assertFornecedor` segue sem checar status (só a conversão olha); `POST /api/compras/pedidos`
direto continua aceitando fornecedor inativo; `criarPedido` soma o total **sem** arredondar;
`PedidoCompraCreateSchema` continua exigindo `itens.min(1)` (a cotação não); `criarCotacao` pelo
**serviço** não passa pelo schema (`quantidade 0` chegaria — mesma classe do pedido, letra G); a
frase morta de `comprasPedidoEditarExcluir.api.test.js:93` continua lá; o genérico mantém
`'cotacoes'` no mapa, sombreado.

## Regras essenciais + testes de API exigidos

| Regra | Teste | Estado |
|-------|-------|--------|
| Saída vinculada a projeto entra no custo do projeto | a spec pedia `saida atualiza custo consumido do projeto`; **entregue como** `relatorioCustoProjeto.api.test.js` (consumido soma as saídas com projeto, réguas TIPOS_SAIDA/TIPOS_DEVOLUCAO) | ✅ `8bc58ec` |
| Devolução estorna custo do projeto | **entregue como** os testes de devolvido/líquido do mesmo arquivo (devolução herda o projeto e abate; líquido = consumido − devolvido, provado com quebrados 20.01−10.01) | ✅ `8bc58ec`/`2de7944` |
| Nota do pedido vinculado fecha a solicitação | `solicitacaoCicloVida.api.test.js` (fecha nos dois caminhos do recebimento; CANCELADA não ressuscita) + jornada `integracaoComprasJornada.api.test.js` (compra parcial de ponta a ponta) | ✅ `110d8ce`/`806b7bd`/`2de7944` |
| O pedido criado no Compras é RECEBÍVEL pelo almoxarifado (a 37 deixa de ser inerte) | `comprasPedidoIntegracao.api.test.js` BLOCO A passo 3 (`?pendentes=1` → `quantidade_pedida 10`, `saldo_pendente 10`, `ABERTO`) | ✅ `dc60507` |
| Pedido com recebimento não é editável nem excluível, pelas DUAS pernas | `comprasPedidoEditarExcluir.api.test.js` + BLOCOS D/D2/E do integração | ✅ `6c21e89`/`dc60507` |
| Vínculo de solicitação exige `gerenciar_reposicao`, antes de escrever | cenário (11) de `comprasPedidoCriar.api.test.js` (rota) + bloco E2 do integração (serviço) | ✅ `3e43069`/`0a7e5c6` |
| Importação nunca funde fornecedores diferentes num pedido | cenários da importação com dois CNPJs na mesma OC | ✅ `4a41119` |
| Importação não grava linha sem `material_id` (pedido fantasma no `<select>`) | `contarLinhasOrfas` escopada **por pedido** | ✅ `9d07dd1` |
| Coluna `DATE` só recebe `null` ou `AAAA-MM-DD` | cenários de `data_pedido`/`previsao_entrega` no `POST`, no `PUT` e na importação | ✅ `2fb9f68` |
| `DELETE` do pedido libera a solicitação da Reposição | cenário de `solicitacoes_liberadas` | ✅ `ca7956c` |
| Atraso é derivado na leitura e nada é gravado | `comprasPedidoAtraso.api.test.js` (1)–(8) (a coluna não existe; `updated_at` não muda) | ✅ `437aed2` |
| Vence hoje NÃO está atrasado (fronteira `<`) | `comprasPedidoAtraso.api.test.js` (2) | ✅ `437aed2` |
| A régua do alerta é a MESMA da tela | `alertaPedidoAtrasado.api.test.js` (5) — `deepStrictEqual` dos ids do alerta contra os `atrasado=1` da rota | ✅ `ddbc18f` |
| O dia é o de `America/Sao_Paulo`, não o do relógio do contêiner | `comprasPedidoAtraso.api.test.js` (11), rodado também com `TZ=UTC` | ✅ `45bda69` |
| Prazo renegociado e furado de novo volta a avisar | `alertaPedidoAtrasado.api.test.js` (9) — renegociação pelo `PUT` real | ✅ `33031ac` |
| A central de alertas não carrega valor nem observação do pedido | `alertaPedidoAtrasado.api.test.js` (10) | ✅ `8f3db94` |
| Pedido já recebido pode ter o status mudado, e só ele | `comprasPedidoStatus.api.test.js` (7 cenários; o (5) prova que a guarda do `PUT` **não** foi afrouxada) | ✅ `19ebf7d` |
| Receber pelas portas da Etapa 37 não muda o atraso sozinho | `comprasPedidoAtrasoIntegracao.api.test.js` blocos D / 9a / 9c | ✅ `fc84e09`/`19ebf7d` |
| O retrofit de Zod não recusa nada que o modal do grupo já manda (4 payloads reais) | `comprasSchemasFornecedorCotacao.api.test.js` (a)–(d) + `comprasFornecedorRotas.api.test.js` (1)(2), escritos **antes** do retrofit | ✅ `008a041`/`6795b39` |
| `grupo_id: null` no `PUT` LIMPA a coluna ("Remover do grupo" remove) | `comprasFornecedorRotas` (4) — lê a coluna; integração (C) ponta a ponta | ✅ `6795b39`/`d64ede0` |
| `status` só é escrito pelo `PUT`; `POST` grava `ativo` e ignora a chave | `comprasFornecedorRotas` (6) | ✅ `6795b39` |
| Inativo some do seletor do recebimento, com controle positivo antes | `comprasFornecedorCotacaoIntegracao` (A) — `aux0` prova que o ativo aparecia | ✅ `d64ede0` |
| `GET /fornecedores/:id` não carrega `planilha_*` | `comprasFornecedorRotas` (8) | ✅ `6795b39` |
| Lixeira do fornecedor: 409 por cotação e por itens, precedência pedido → cotação → itens | `comprasFornecedorRotas` (9)(12); integração (A) | ✅ `6795b39`/`bdaadd8`/`d64ede0` |
| Número de cotação repetido → 409 com o número; o próprio id → 200 | `comprasCotacaoRotas` (2)(9) | ✅ `29dd6a8` |
| Cotação com fornecedor inexistente → 400 e a linha não muda | `comprasCotacaoRotas` (3)(7)(10) | ✅ `29dd6a8` |
| A rota do grupo lista inativo e legado `NULL`, ativos primeiro | `comprasFornecedorRotas` (13) | ✅ `8cde2ee` |
| A data da cotação nasce LOCAL (relógio fixo às 23:30) | `CotacaoForm.test.js` (a) — molde (q) de `PedidoCompraForm.test.js` | ✅ `55a3214` |
| Os 4 caminhos abrem formulário e o payload é exato | `FornecedorForm.test.js` (a)–(h), `CotacaoForm.test.js` (a)–(h) | ✅ `23b86f3`/`b692413`/`01732dd` |
| `itens` é opcional; as literais do item da cotação têm um dono cada | `comprasSchemasFornecedorCotacao` (p)–(s) | ✅ `8d81cc5` |
| Com itens o total é derivado e o do payload é ignorado; sem itens é o do payload; material inexistente não grava nada | `comprasCotacaoItens` (1)(2)(3)(4) | ✅ `11591ca` |
| A lixeira da cotação leva os itens (órfãos = 0) e é a rota própria, não o genérico | `comprasCotacaoItens` (7)(8)(10) — sabotagem: sem o `DELETE` dos filhos o status segue 200 e a asserção de órfãos cai | ✅ `11591ca` |
| Gerar pedido cria um pedido NORMAL (lista, aux do recebimento com saldo cheio, `PUT`, `DELETE`) e excluí-lo libera a cotação | `comprasCotacaoGerarPedido` (1)(10); `comprasCotacaoPedidoIntegracao` (A)(B) | ✅ `11591ca`/`dae1cee` |
| Convertida não se edita nem se exclui; rejeitada/cancelada/sem itens/fornecedor inativo não gera | `comprasCotacaoGerarPedido` (3)(4)(5)(7)(9); integração (C) | ✅ `11591ca`/`dae1cee` |
| A mesma cotação não gera dois pedidos **sob corrida** | `comprasCotacaoGerarPedido` (11) — 6 `POST` em `Promise.all` → 1×201 + 5×409, `COUNT` +1; (12) `DELETE` × `gerar` → 0 órfãos | ✅ `d6a1beb` |
| `excluirPedido`/`excluirCotacao` respeitam a ordem que a FK de produção exige | `comprasCotacaoFkProducao` (1)(2)(3) — DDL de produção lida de `index.js`/`schema.js`, `foreign_keys = ON` com controle positivo; a sabotagem de ordem fica verde nas outras 20 e cai aqui | ✅ `83a5d71` |
| O cabeçalho do pedido gerado é só o contrato (`observacoes`, `status` default, `previsao` null); a soma tem 2 casas | `comprasCotacaoGerarPedido` (1); `comprasCotacaoItens` (2) 3 × 0,1 → 0,3 | ✅ `ffba9b9` |
| Tela: campo travado com a soma, payload sem `valor_total` com itens, 400 de item no `role="alert"`, convertida travada, sem lixo de ponto flutuante | `CotacaoForm.test.js` (i)–(p) | ✅ `7ecf91f`/`abb46f4`/`327d33f` |
| Aba: coluna Pedido, botão condicional, POST + toast + navigate real, 409 no toast sem navegar, export no fim, sem clique repetido em voo | `Compras.test.js` (j)–(m) | ✅ `bd224d2`/`a09dfe8` |
| Revisão de BOM recalcula reservas | `nova revisao ajusta reservas dos itens alterados` | ⛔ bloqueado (BOM inexistente) |
| Encerramento de OP bloqueia novos consumos nela | `consumo em OP encerrada falha` | ⛔ bloqueado (MES sem uso) |

## Dependências

- Praticamente todas as features anteriores; e maturidade dos módulos
  Compras/Produção/Projetos fora do almoxarifado. ~~**Compras provou maturidade e foi integrado
  (Etapa 14)**~~ — **esta frase ESTAVA ERRADA e foi corrigida em 2026-09-16** (ver "Contexto
  importante"): o que a Etapa 14 integrou foram as **solicitações** e o **custo por projeto**; o
  **pedido** de compra continua sem criador, e é a Etapa 38 que fecha isso ~~(pendente)~~ —
  **fechado em 2026-09-16, `be71754..0a7e5c6`: o pedido tem criador, editor, lixeira e importação**.
  **Produção e Engenharia
  continuam sendo o bloqueio dos itens abertos** — e por motivo diferente: lá o dado não existe
  como entidade, aqui existe a tabela e falta a porta.
