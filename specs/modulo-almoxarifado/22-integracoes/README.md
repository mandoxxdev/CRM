# 22 — Integrações (Engenharia, Produção, Compras, Projetos e Custos)

> **Status:** 🟡 — a fatia de **solicitação de compra e custo por projeto foi entregue na Etapa 14**
> (range `b276dca..2de7944`, 2026-08-25) e a **fatia Compras / criação do pedido de compra foi
> entregue na Etapa 38** (range `be71754..0a7e5c6`, 2026-09-16 — T1–T7 + onda de correção F1–F8);
> Engenharia/BOM e Produção/OP seguem **bloqueadas por dependência, com a medição escrita**
> (ver abaixo) · **Spec original:** seções 23, 24, 25
> **Última atualização:** 2026-09-16 — **Etapa 38 fechada**: o pedido de compra ganhou criação,
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
> `CREATE TABLE` está em `server/services/almoxarifado/schema.js:1311`. Cotações e fornecedores
> **continuam sem tela de criação** — a 38 consertou **uma** das três abas.

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
- [ ] **Tela de criação de cotações e fornecedores** — **fora do escopo, declarado**:
      `/compras/fornecedores/novo` e `/compras/cotacoes/nova` seguem caindo no `path="*"`. A 38
      consertou **uma** das três abas.

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
- [ ] Acompanhamento de pedido e prazo com alerta de atraso — **fora da Etapa 14 por decisão**:
  exigiria ler prazo prometido do pedido (dado que Compras hoje não preenche com disciplina) e
  criar alerta novo na fila; ficou para quando houver dado confiável de prazo.
  ⚠️ **A Etapa 38 entregou o DADO, não o alerta** (`2fb9f68`): `previsao_entrega` passou a ser
  preenchível pelo formulário e pela importação, e — o que o alerta precisa — passou a ser
  **validada**: só `null` ou `AAAA-MM-DD`. Antes dela a coluna `DATE` aceitava `''` e serial do
  Excel, então um `WHERE previsao_entrega < date('now')` acusaria justamente os pedidos **sem**
  previsão. O alerta continua sendo **etapa própria** — e agora tem insumo confiável.
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
