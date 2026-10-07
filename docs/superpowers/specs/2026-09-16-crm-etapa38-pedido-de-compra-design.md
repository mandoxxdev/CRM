# Etapa 38 — O pedido de compra ganha criação, e o recebimento contra o pedido deixa de ser inerte (design)

**Data:** 2026-09-16 · **Módulo:** **CORE Compras** (primeira etapa desta série fora do almoxarifado)
· **Fatia de spec:** `specs/modulo-almoxarifado/22-integracoes/` (a fatia "Compras") · **Feature que
ela destrava:** 08 (recebimento), inteira, entregue na Etapa 37 e **inalcançável**

**Medição de base:** `.superpowers/sdd/etapa38-fase0-pedido-de-compra.md` — Fase 0 só leitura, com
sonda executada (`scratchpad/probe38.js`, `sqlite3.OPEN_READONLY`) contra o dump de produção de
161 MB. Este design acrescenta **onze medições novas**, todas por leitura de código (as suítes
**não** foram rodadas: o controlador está com os cinco comandos do fechamento da 37 agora).

> ⚠️ **Revisado pela Fase 2 (revisor fresco, 2026-09-16).** 13 achados — **4 travariam a execução**,
> 9 silenciosos, 7 de ruído. As correções estão **no lugar**, marcadas `(Fase 2)`; o índice, a
> evidência `arquivo:linha` de cada uma e a tabela *"o que a 37 lê disto"* por RN estão no fim do
> plano, em `## Fase 2 — o que a revisão do plano pegou ANTES de executar`. **Três frases deste
> design foram medidas como FALSAS e ficam escritas, corrigidas no lugar, em vez de apagadas:** a
> ordem das `<Route>` contra o `path="*"` (seção *(f)*), o motivo da decisão 10 (seção *(g)*) e o
> "itens órfãos" do `DELETE` genérico (R4).

> **Onde a medição corrige a spec, o mapa, o manual ou o escopo do controlador, vale a medição** — e
> onde ela divergiu da proposta do controlador, está registrado aqui como **decisão**, com o
> descartado. É o que a seção "Decisões desta etapa" carrega para a **letra B** do doc de novidades.

## O problema, em uma frase

A Etapa 37 entregou sete arquivos de teste de API, duas colunas de migration, um acumulador dentro
do claim de `darEntradaEstoque`, três portas com régua de saldo e um `<select>` novo — e **nada disso
pode ser exercido por um clique, em nenhum ambiente, incluindo produção**, porque
`COUNT(pedidos_compra) = 0` e **não existe código de aplicação que insira um pedido**: `POST
/api/compras/pedidos` não existe (`index.js:20002` é `app.get`), o botão "Novo Pedido"
(`client/src/components/Compras.js:364`) e o `<Link>` "Editar" de cada linha (`:277`) caem no
`path="*"` de `App.js:333` e **piscam de volta para a lista**, e o único escritor de produção das
duas tabelas é o acumulador da própria 37 (`receiptService.js:1246`), que só sabe **subtrair** de
uma linha que ninguém cria.

Não é dívida de documentação: é **feature entregue que ninguém alcança**. O roteiro de teste manual
da Etapa 37 (`plano:~1806`) começa com *"criar pedido no módulo Compras"* e é **inexecutável por
qualquer pessoa, hoje**.

## Fase 0 — o que a medição achou (resumo do que já está medido)

| Fato | Onde |
|---|---|
| `pedidos_compra = 0`, `itens_pedido_compra = 0`, `cotacoes = 0`, `recebimentos = 0`, `solicitacoes_compra_almoxarifado = 0`; **`fornecedores = 10`**, **`materiais_almoxarifado = 3`** | sonda readonly no dump de 161 MB |
| `SELECT DISTINCT status FROM pedidos_compra` → **vazio**: o vocabulário de status do pedido **nunca foi exercido**. A Etapa 38 é quem o define de fato | idem |
| **zero** `INSERT INTO pedidos_compra` e **zero** `INSERT INTO itens_pedido_compra` em código de produção; 13 arquivos de teste, 1 escritor (o acumulador da 37) | varredura em `server/**.js` |
| o core Compras **não tem UMA tela de criação nas três abas** — `/compras/fornecedores/novo`, `/compras/pedidos/novo`, `/compras/cotacoes/nova` e os três `editar/:id` caem todos no mesmo `path="*"` | `App.js:332-344`, `Compras.js:19-25`, `:277`, `:359-370` |
| **`itens_pedido_compra` NÃO é tabela core** — o `CREATE TABLE` vive em `services/almoxarifado/schema.js:1311`. Só `pedidos_compra` é core (`server/index.js:19230`). O design da 37 chamava as duas de core e **estava errado** | os dois DDLs, lidos |
| gate de **todas** as `/api/compras/*`: `authenticateToken` + `checkModulePermission('compras')` — **camada 1+2 apenas, nenhum perfil, nenhum `requirePermission`**. O core não tem a segunda camada do almoxarifado | as 26 declarações de rota |
| **Zod só existe no almoxarifado**: `grep -c zod server/index.js` = **0**. O core valida com `if (!campo) return 400` na mão | `index.js:20220` (POST fornecedores) |
| precedente de importação: `POST /api/compras/fornecedores/:fornecedorId/itens/importar` (`:20447`) — **sem multer, sem CSV no servidor**: recebe `{ linhas: [...] }` em JSON; o navegador lê o `.xlsx` com `XLSX.read` (`ItensFornecedor.js:3,208`). É o **único** precedente de importação de negócio do CRM | as duas pontas, lidas |
| o elo quebrado: a reposição gera `solicitacoes_compra_almoxarifado`; `vincularPedidoCompra` (`purchaseService.js:52`) **exige o pedido já existir** e **não tem um único consumidor no client** | `grep "vincular-pedido" client/src` → 0 |

### As ONZE medições novas desta Fase 1 (nenhuma está em spec nenhuma)

1. **As rotas `/api/compras/*` são 26, mas não são um bloco só.** **23** são contíguas em
   `server/index.js:19974-20471` (sob o comentário `// ========== ROTAS MÓDULO COMPRAS ==========`),
   e **3** vivem 1.500 linhas acima (`/api/compras/solicitacoes-compra`, `:18465`; `…/:id`, `:18500`;
   `…/:id/decisao`, `:18525`) e operam a tabela core **`solicitacoes_compra`** — que **não é** a
   `solicitacoes_compra_almoxarifado` da reposição. Duas tabelas homônimas, dois módulos. → decisão 1.
2. **O `DELETE` genérico sombreia o `DELETE` de grupo, e isso é um defeito medido, não teórico.**
   `app.delete('/api/compras/:tipo/:id')` está em `:20060`; `app.delete('/api/compras/grupos/:id')`
   em `:20136`. Express casa na **ordem de registro** e `/api/compras/grupos/7` tem exatamente dois
   segmentos → o genérico vence, `tables['grupos']` é `undefined`, e **apagar um grupo de
   fornecedores responde hoje `400 "Tipo inválido"`**. (O `…/fornecedores/:id/itens/:id` tem quatro
   segmentos e **não** é sombreado — conferido.) Consequência **operacional** para esta etapa: o
   `DELETE /api/compras/pedidos/:id` com a régua de 409 **tem de ser registrado ANTES do genérico**
   ou nunca é alcançado. Consertar o sombreamento do grupo fica **fora de escopo** (é comportamento
   de outra aba), e a extração da T1 **preserva a ordem byte a byte** — ver RN-C01.
3. **Os cinco helpers de planilha não têm chamador fora do bloco.** `normalizarCampo` (`:20399`),
   `parsePrecoBackend` (`:20403`), `extrairDoRow` (`:20410`), `extrairPrecoDoRow` (`:20417`),
   `extrairDescricaoDoRow` (`:20435`) — contados um a um no arquivo inteiro. Vão junto na extração
   sem tocar em mais nada, e são **exatamente** o que a importação de pedido (B1) reusa.
4. **As duas instâncias de multer têm um chamador cada, mas não são livres.** `uploadGrupoCompras`
   (`:807`) e `uploadFornecedor` (`:826`) fecham sobre `uploadsGruposComprasDir` e
   `uploadsFornecedoresDir`, variáveis de módulo do `index.js`. Movê-las mudaria onde o arquivo é
   gravado; **passá-las por DI não muda nada**. → decisão 2.
5. **O `<Link>` morto de edição é `/compras/pedidos/editar/:id`, não `/compras/pedidos/:id`**
   (`Compras.js:277`). O escopo do controlador pedia a rota `/compras/pedidos/:id`; declarar essa
   rota deixaria o `<Link>` que já existe **continuando morto**, que é o defeito que a etapa paga.
   → decisão 3, divergência declarada.
6. **O filtro de status da tela oferece `em_analise` ao usuário** (`Compras.js:405-418`, seis
   `<option>`), e o mapa de cores (`:96-108`) conhece nove. A Fase 0 propôs enum de **seis** valores
   para o pedido; se `em_analise` ficar de fora, a tela tem um filtro que **nenhum pedido pode
   casar**. → decisão 4: **sete** valores.
7. **`numeroDoc.js` afirma, por escrito, as duas metades da decisão do `numero` — e a 38 muda uma
   delas.** O comentário `:47-58` proíbe embrulhar `pedidos_compra.numero` no retry **porque o
   número é digitado pelo comprador**, diz que "documento novo que queira este helper precisa de
   número **GERADO** pelo sistema, nunca digitado", e afirma que **"hoje isso é INALCANÇÁVEL —
   nenhum `fn` passado a `inserirComNumeroUnico` insere nelas"**. A Etapa 38 **satisfaz a condição**
   (o número passa a ser gerado, nunca digitado) e **torna a última frase falsa**. O comentário tem
   de ser corrigido **dizendo que mudou** (regra 5 do CLAUDE.md), não em silêncio. → decisão 5.
8. **A busca de material é inalcançável para o comprador, e o motivo é um `app.use`, não a rota.**
   `routes/almoxarifado.js:282-285` monta `app.use('/api/almoxarifado', authenticateToken,
   checkModulePermission('almoxarifado'))` — **todas** as rotas do módulo de uma vez, inclusive
   `GET /api/almoxarifado/materiais` (`:353`, que não declara middleware nenhum na própria linha).
   Um usuário com o módulo `compras` e **sem** o módulo `almoxarifado` toma 403 antes do handler.
   → decisão 6.
9. **O ciclo da solicitação já tem quem o feche.** `purchaseService` RN-03 (o helper chamado no fim
   de `processarNota` **e** no fim de `aprovarRecebimento`) já marca a solicitação como `RECEBIDA`
   quando um recebimento com `pedido_compra_id` chega a estoque. Logo a A7 (**"Gerar pedido"**) fecha
   o ciclo **inteiro** — solicitação → pedido → recebimento → solicitação `RECEBIDA` — **sem uma
   linha de código de fechamento**: basta criar o pedido e chamar `vincularPedidoCompra`.
10. **O harness já tem metade do que a 38 precisa, e foi a 37 que pagou.** `testApp.js:57-84` stuba
    `pedidos_compra` **sem FK** e com `fornecedor_id` **nulável**; `itens_pedido_compra` nasce do
    `initSchema`; `fornecedores` está stubado desde a Etapa 8b; `materiais_almoxarifado` é do módulo.
    **O que falta é só o registrador** — `testApp.js:100-101` monta `routes/almoxarifado` e
    `routes/requisicoesMaterial`, e **nenhum** deles é Compras. Zero testes de `server/tests/**`
    batem em `/api/compras/*` hoje.
11. **`validate()` não tem nada de almoxarifado.** `services/almoxarifado/validation.js` são 34
    linhas: `safeParse`, `formatZodError` e 400 no formato da casa (`{ error: 'Dados inválidos — …' }`).
    A Fase 0 dava duas saídas ("leva para fora do almoxarifado, ou duplica"); há uma **terceira**,
    que é a reversível: **reusar onde está**, com um `require`. → decisão 7.

## O que NÃO reabrir — os onze itens que a Etapa 37 fechou

| Fechado | Não reabrir porque |
|---|---|
| `pedidos_compra` **não é escrita** pelo almoxarifado; a situação (`ABERTO`/`PARCIAL`/`RECEBIDO`) é **derivada na leitura** | decisão 4 da 37 (design `:499`), protegida pela RN-24, que **assere** que `status` continua o valor inserido. A 38 escreve `status` **como o Compras**, pelo `POST`/`PUT` do core, com vocabulário **minúsculo** — nunca `PARCIAL`/`RECEBIDO` |
| `quantidade_recebida` só se move na **entrada física**, dentro do claim de `darEntradaEstoque` | decisão 5 da 37. O `POST` da 38 a deixa nascer **0 pelo DEFAULT** e **não escreve nela nunca mais** |
| `pedido_item_id INTEGER` **sem FK**, de propósito (`schema.js:1304-1306`) | a linha do pedido pode ser apagada pelo Compras sem invalidar o recebimento como histórico. A 38 **acrescenta** o `DELETE` que apaga itens — e é justamente por isso que a ausência de FK continua certa |
| régua de saldo e `autorizar_excedente = [ADMINISTRADOR, COMPRAS]` nas **três** portas | Etapas 36/37, com o Critical do eco consertado. **Nenhuma linha desta etapa toca `receiptService.js`** |
| `?pendentes=1` filtra **antes** do `LIMIT 50` e **não** é `saldo_pendente > 0` | achado 7 da Fase 2 da 37: pedido sem linhas lançadas continua visível. Depois da 38 esse caso fica raro — continua legítimo |
| as duas literais de 400 distintas ("não tem itens lançados no módulo Compras" × "já foi recebido por completo") | decisão 14 da 37 + F1/F2 da revisão final. A 38 **não** as unifica, mesmo ficando possível lançar itens |
| item **fora** do pedido entra sem régua de saldo | decisão 9 da 37, em "NÃO cobre" e letra G |
| dois recebimentos abertos consumindo o mesmo saldo | achado 13 da 37, letra G — exige contar reservado em documento aberto |
| gate das `-aux` = só `auth` + módulo | espelha as outras duas `-aux`, declarado (`extended.js:1130-1133`) |
| `initSchema` não-awaited; os 21 `ALTER` já apagados | letra G. ⚠️ `server/index.js` tem **51** `ALTER TABLE` fora de `safeAlter` — a 38 mexe nesse arquivo (T1) e **não** encampa essa limpeza |
| backfill de `quantidade_recebida` | `COUNT = 0` medido; letra A da 37 |

## A decisão de desenho

### (a) A extração é o pré-requisito escondido, e a régua dela é um teste que hoje é impossível

`server/tests/helpers/testApp.js:100-101` monta **dois** registradores, nenhum deles Compras, e
**zero** testes batem em `/api/compras/*` (`comprasMinimos.api.test.js` testa
`/api/almoxarifado/compras/verificar-minimos`, que é do almoxarifado). Sem a extração, **nenhuma task
desta etapa tem onde escrever a régua** — o POST novo nasceria coberto só por leitura.

`server/routes/compras.js` segue o formato dos dois registradores existentes:
`module.exports = (app, db, authenticateToken, checkModulePermission, uploads) => { … }`, com as **23**
rotas contíguas e os **5** helpers movidos **verbatim**, **na mesma ordem**, e `index.js` passando a
chamar o registrador **no lugar exato onde o bloco estava** (linha 19974). As 3 rotas de
`solicitacoes-compra` ficam onde estão (decisão 1).

**A régua é o que prova a extração, e ela é executável exatamente porque a extração aconteceu:**
`comprasPedidosRotas.api.test.js` bate em `GET /api/compras/pedidos` pelo harness — 200, o pedido
inserido aparece, `?search=` e `?status=` filtram, `DELETE /api/compras/pedidos/:id` responde 200 e
`DELETE /api/compras/grupos/:id` responde **400 "Tipo inválido"** (o sombreamento medido, congelado
como caracterização: se a extração mudar a ordem, esse cenário vira 404 ou 200 e **cai**).

### (b) O `numero` passa a ser GERADO, e isso resolve — não viola — o aviso da Etapa 31

A Fase 0 recomendava manter o `numero` **digitado** + 409 traduzido (R2). O escopo do controlador
decidiu **gerado**. **A medição 7 mostra que as duas leituras do aviso da 31 são a mesma:** o aviso
proíbe embrulhar no `inserirComNumeroUnico` um número **que uma pessoa escolheu** (é a lição da série
de material, onde o retry reescreveria o que o operador digitou), e diz, na frase seguinte, que
*documento novo que queira este helper precisa de número **gerado** pelo sistema, nunca digitado*.
A Etapa 38 cria o pedido **sem campo de número na tela**: o servidor gera `PC-<carimbo><aleatório>`
por `inserirComNumeroUnico(db, 'PC', fn)`, a `RE_COLISAO_NUMERO` casa `pedidos_compra.numero` (UNIQUE
de coluna única — conferido contra a regex), e **não há escolha de gente a reescrever**.

O que **muda** é o comentário de `numeroDoc.js`: a frase "hoje isso é INALCANÇÁVEL — nenhum `fn`
passado a `inserirComNumeroUnico` insere nelas" passa a ser **falsa**, e a T2 a corrige **dizendo que
era verdadeira até esta etapa**. `cotacoes.numero` continua fora (aba morta, fora de escopo).

### (c) O pedido nasce com itens, em um serviço, e a régua é o item — não o 201

`server/services/compras/pedidoCompraService.js` (pasta nova) concentra `criarPedido`,
`atualizarPedido`, `obterPedido`, `excluirPedido` e `importarPedidos`. **A rota não faz SQL.** É o
que permite a importação (B1) e o "Gerar pedido" da Reposição (A7) usarem **o mesmo caminho**, que é
a exigência explícita do escopo ("nunca INSERT direto").

O modo de falha desta etapa está aqui: **um POST que grava a cabeça e engole os itens responde
`201 ok`**, e a suíte passa. Por isso **todo cenário lê `itens_pedido_compra` pelo `pedido_id` que o
`INSERT` devolveu** e afirma quantidade, `material_id` e `quantidade_recebida === 0` — nunca "não deu
erro". E a sabotagem obrigatória da T2 é **remover o `INSERT` dos itens** e ver **qual** asserção cai.

### (d) A edição e a exclusão têm de perguntar ao recebimento — e a porta que pergunta é uma consulta, não uma coluna

`PUT` e `DELETE` consultam `SELECT COUNT(*) … FROM itens_pedido_compra WHERE pedido_id = ? AND
COALESCE(quantidade_recebida, 0) > 0`; o `DELETE` consulta **também**
`recebimentos_material_almoxarifado WHERE pedido_compra_id = ?`, porque um recebimento **criado e não
processado** ainda não moveu `quantidade_recebida` (RN-23 da 37) e apagar o pedido debaixo dele
deixaria o documento apontando para o vazio. As duas consultas são **leitura das tabelas da 37**;
nenhuma escreve nelas.

O `DELETE` apaga **os itens junto**, dentro do mesmo caminho — hoje o genérico apaga só a cabeça e
**deixa os itens órfãos** (R3 da Fase 0), e a partir da 38 há itens de verdade para ficar órfãos.

### (e) A importação agrupa pelo número DA PLANILHA, e o número do sistema continua gerado

Consequência direta de (b), e ela **derruba a B2 da Fase 0** ("reidempotência por `numero`: reimportar
a mesma planilha não duplica"): se o servidor gera o número, o `UNIQUE` de `numero` **não pode** ser a
chave de idempotência. A coluna `numero`/`pedido`/`oc` da planilha vira **chave de agrupamento** das
linhas e vai para `observacoes` como `Planilha: <valor>`; reimportar **cria pedidos novos**, e a
resposta devolve `{ pedidos: [{ id, numero, itens }], ignorados: [{ linha, motivo }] }` para o
operador ver o que entrou. → decisão 8, com o descartado.

**A régua da importação é o `ignorados`, não o `inseridos`:** linha cujo `codigo` não casa com
`materiais_almoxarifado` **não pode** ser gravada com `material_id NULL`, porque
`listarPedidosCompraAux` filtra `material_id IS NOT NULL` — o pedido importado errado apareceria no
`<select>` do recebimento como `ABERTO` com saldo 0 e **o operador não saberia por quê**.

### (f) A tela é do Compras, e as rotas entram ANTES do `path="*"`

`App.js` ganha `<Route path="pedidos/novo">` e `<Route path="pedidos/editar/:id">`. ⚠️ **(Fase 2) A
frase que estava aqui — "acima do `path='*'` de `:333`, porque a ordem importa" — ESTAVA ERRADA e
fica escrita para ninguém a reintroduzir:** `react-router-dom` é **6.30.4** e o v6 casa por **ranking
de especificidade**, não por ordem de declaração. Prova no próprio arquivo: `<Route path="*">` está
em `App.js:333` e `<Route path="fornecedores-homologados">` em `:345` — **depois** — e
`/compras/fornecedores-homologados` renderiza `<GruposFornecedores/>`. Os dois `<Link>` estão mortos
porque **nenhuma rota casa** `/compras/pedidos/novo`, não porque o `*` "vence"; a correção é a mesma
(declarar as rotas), mas a **explicação** não pode ir para a spec nem para o commit. Consequência
para a régua: a sabotagem "mover as `<Route>` para depois do `*`" **não derruba nada** — a sabotagem
válida é **remover** a rota. O formulário
(`client/src/components/compras/PedidoCompraForm.js`) tem fornecedor (`<select>` de
`GET /compras/fornecedores`), data, previsão de entrega, status, observações e **a tabela de itens**
com busca de material, quantidade, valor unitário e total por linha.

**Não há campo de número** (é gerado), e o `valor_total` é **mostrado** como soma, não digitado
(decisão 9).

### (g) "Gerar pedido" fecha o elo que a Etapa 11 abriu e a Etapa 14 não terminou

Na aba "Solicitações" da Reposição (`ReposicaoAlmoxarifado.js:747-800`), cada linha `PENDENTE` ganha
**"Gerar pedido"** ao lado de "Cancelar": abre o formulário do Compras **pré-preenchido** com o
material e a quantidade da solicitação (`/compras/pedidos/novo?solicitacao=<id>`), e o `POST` aceita
`solicitacao_id` — ao criar, chama `vincularPedidoCompra`, que passa a ter **o primeiro consumidor de
client desde a Etapa 14**. Com a medição 9, isso fecha o ciclo inteiro sem código de fechamento novo.

⚠️ **(Fase 2) O gate que se acreditava estar no caminho NÃO está, e a correção inverte a frase.**
`requirePermission('gerenciar_reposicao')` = `[ADMINISTRADOR, GESTOR, COMPRAS]` e o módulo
`almoxarifado` estão **na rota** `POST …/vincular-pedido` (`extended.js:1743`), **não no serviço**.
O `POST` do Compras chama `purchaseService.vincularPedidoCompra(db, solicitacaoId, pedidoId)`
(`purchaseService.js:52`) **direto**: não há perfil nem módulo no caminho. Portanto **ninguém perde o
pedido por falta de permissão** (o risco que a decisão 10 dizia evitar não existe) e, em troca,
**qualquer usuário com o módulo `compras` — inclusive o `PRODUCAO` do fallback de
`getPerfilFromUser` — passa a escrever em `solicitacoes_compra_almoxarifado` por esta porta**. O
`try/catch` **fica** (o serviço lança 404 por solicitação inexistente e 400 por estado terminal, e
esses são os casos reais de `vinculo_solicitacao: 'falhou'`), mas a justificativa é outra e o fato
vai para a **letra G, em destaque**. Descartado: aplicar `requirePermission` no core — seria inventar
a camada 3 que o módulo não tem, numa etapa que declara não decidir os perfis do Compras.

## Regras de negócio

> **Numeração: série nova `RN-C01…`, e o motivo é medido.** As RN existentes são todas do
> **almoxarifado** e vivem nos `specs/modulo-almoxarifado/<feature>/README.md`: a feature 08 carrega
> RN-04..RN-09 (Etapa 35), RN-11..RN-19 (36) e RN-20..RN-27 (37); a 18 e a 22 têm as suas. Esta etapa
> escreve regras de **outro módulo** (core Compras), e uma faixa numérica contínua faria `grep RN-28`
> devolver uma regra de Compras dentro de um README de almoxarifado. O `C` é de **Compras** e é o que
> permite `grep RN-C` achar a fatia inteira de uma vez, em qualquer módulo em que a spec venha a
> morar depois.

- **RN-C01 — a extração não muda comportamento nenhum, e a ORDEM de registro é parte do contrato.**
  *Cenário:* com `routes/compras.js` montado no harness, `GET /api/compras/pedidos` responde **200**
  com o pedido inserido; `?search=<parte do número>` e `?status=aprovado` filtram; `GET
  /api/compras/fornecedores` responde 200; `DELETE /api/compras/pedidos/:id` responde 200 e a linha
  some; e **`DELETE /api/compras/grupos/:id` responde `400 { error: 'Tipo inválido' }`** — o
  sombreamento do genérico, medido (medição 2), **congelado como caracterização**. Metade positiva do
  gate: sem token → **401**. *A asserção que guarda a ordem é a do grupo:* se alguém reordenar o
  registro na extração, ela vira 200 ou 404 e **cai**.
- **RN-C02 — `POST /api/compras/pedidos` cria cabeçalho e itens, e o `numero` é do SERVIDOR.**
  *Cenário:* `POST` com `fornecedor_id` de um fornecedor existente e **dois** itens → **201**, corpo
  com `numero` casando `/^PC-[0-9A-Z]+$/`, e **`SELECT * FROM itens_pedido_compra WHERE pedido_id =
  <o id devolvido>` traz DUAS linhas**, com `material_id`, `quantidade`, `valor_unitario`, `codigo` e
  `descricao` copiados do material, e **`quantidade_recebida === 0`** (o DEFAULT da 37, nunca escrito
  pela porta). O payload **não** tem campo `numero`; se mandar um, ele é **ignorado** (o gerado
  vence). Metade que mede o dano: a asserção é a **contagem de itens**, não o 201 — um POST que grava
  a cabeça e engole os itens responde 201 e passaria.
  ⚠️ **(Fase 2) O que a Etapa 37 lê de cada coluna desta linha, para ninguém "simplificar" o INSERT:**
  `material_id` é o filtro `IS NOT NULL` de `listarPedidosCompraAux`/`carregarItensPedidoCompra` (sem
  ele o pedido vira `ABERTO` com saldo 0 no `<select>`); `quantidade` vira `quantidade_pedida` e o
  saldo; `valor_unitario` vira **o preço do recebimento** (U1 da 37) e, por ele, o custo médio;
  `codigo`/`descricao` aparecem na linha da tela de recebimento — e `descricao` é copiada de
  **`materiais_almoxarifado.nome`** (o `NOT NULL`), não da coluna `descricao`, que é quase sempre
  nula (`schema.js:298-299`).
- **RN-C03 — a validação é Zod, com literais em português, e recusa antes de gravar.**
  *Cenários (cada um **400** e `COUNT(pedidos_compra)` inalterado):* sem `fornecedor_id` →
  `'Dados inválidos — fornecedor_id: fornecedor do pedido é obrigatório'`; `itens` ausente ou `[]` →
  `'Dados inválidos — itens: inclua ao menos um item no pedido de compra'`; item sem `material_id` →
  `'Dados inválidos — itens.0.material_id: material do item é obrigatório'`; `quantidade: 0` ou
  `-3` ou `'abc'` → `'Dados inválidos — itens.0.quantidade: quantidade do item do pedido deve ser um
  número maior que zero'`; `valor_unitario: -1` →
  `'Dados inválidos — itens.0.valor_unitario: valor unitário do item não pode ser negativo'`.
  E **fornecedor que não existe** → **400** `'Fornecedor não encontrado'` (guarda de serviço, não de
  schema — o Zod não consulta banco). Metade positiva no mesmo `test()`: `valor_unitario: 0` →
  **201** (preço opcional é decisão, e `0` é legítimo).
  ⚠️ **(Fase 2) Duas correções medidas por sonda contra `zod@4.4.3`:** (1) a literal só sai se o
  **tipo** também a declarar — `z.number().gt(0, MSG).safeParse('abc')` devolve
  `Invalid input: expected number, received string`, em inglês; o schema é
  `z.number({ error: MSG }).gt(0, MSG)`, a mesma constante nos dois lugares. (2) **Não há coerção**:
  `'5'` é recusado, e é isso que `<input type="number">` e `<select>` mandam — **o formulário coage
  com `Number()`** e o cenário do client afirma `typeof`. Sem isso a suíte de API fica verde e
  **todo submit real toma 400**. E `formatZodError` junta issues com `'; '`: cada cenário negativo
  manda um payload válido em tudo menos no campo sob teste.
  ⚠️ **(Fase 2) `valor_unitario: 0` tem um custo que não estava escrito:** o recebimento da 37
  **herda** o preço da linha do pedido quando o payload omite o campo (U1, `receiptService.js:398-412`)
  e o `custo_unitario` só viaja para o motor quando **`> 0`** (`:1176`). Preço 0 no pedido = custo
  médio **não alimentado** = rateio da Etapa 8c distribuindo R$ 0,00. A decisão (preço opcional)
  **fica** — o que muda é que a tela avisa e a **letra G** registra.
- **RN-C04 — `valor_total` é DERIVADO da soma dos itens, e o payload não o decide.** *Cenário:* dois
  itens (`2 × 50` e `3 × 10`) com `valor_total: 999` no payload → **201** e
  `SELECT valor_total FROM pedidos_compra` = **130**. A `GET /api/compras/pedidos` da tela mostra
  esse número; deixá-lo vir do payload faria a lista de Compras exibir um total que não bate com
  nenhum item.
- **RN-C05 — `status` do pedido só aceita o vocabulário MINÚSCULO que a tela de Compras pinta.**
  *Cenário:* `status: 'PARCIAL'` ou `'RECEBIDO'` ou `'qualquer'` → **400**
  `'Dados inválidos — status: status do pedido inválido (use pendente, aprovado, rejeitado, em_analise, enviado, recebido ou cancelado)'`;
  sem `status` → **201** com `status === 'pendente'` (o DEFAULT do DDL). Metade positiva: os **sete**
  valores respondem 201, e `em_analise` entra porque o filtro da tela o oferece (medição 6).
  ⚠️ Esta RN é a que **protege a decisão 4 da Etapa 37**: `PARCIAL`/`RECEBIDO` são a derivação do
  almoxarifado e **não podem** virar valor gravado no core por esta porta.
- **RN-C06 — `GET /api/compras/pedidos/:id` devolve o pedido COM os itens.** *Cenário:* o id criado
  pela RN-C02 → **200** com `{ …cabeçalho, fornecedor_nome, itens: [ {id, material_id, codigo,
  descricao, quantidade, valor_unitario, unidade, quantidade_recebida} × 2 ] }`; id inexistente →
  **404** `'Pedido de compra não encontrado'` (**a mesma literal** já usada por
  `GET /almoxarifado/recebimentos-aux/pedidos-compra/:id/itens` e por `purchaseService:62` — um
  literal só para o fato "esse pedido não existe", não inventar um segundo). Hoje **não existe**
  leitura de um pedido só, nem dos itens, fora das duas `-aux` do almoxarifado.
- **RN-C07 — o `PUT` só edita enquanto NADA foi recebido.** *Cenário:* pedido de 10, item com
  `quantidade_recebida = 0` → `PUT` com quantidade 12 responde **200** e a linha vale 12. Depois de um
  recebimento de 6 **processado** (`quantidade_recebida = 6`) → `PUT` responde **400**
  `'Pedido de compra <numero> já teve recebimento — não pode mais ser editado'` **e a linha continua
  valendo 12** (a asserção que mede o dano: não é o código, é o valor no banco). Metade positiva no
  mesmo `test()`: um **segundo** pedido, sem recebimento, aceita o mesmo `PUT` → 200.
  ⚠️ O `PUT` **substitui** os itens (apaga e reinsere) — e é exatamente por isso que a régua existe:
  reinserir apagaria a `quantidade_recebida` acumulada pela 37.
  ⚠️ **(Fase 2) A régua do `PUT` tem DUAS pernas, as mesmas do `DELETE` — e a segunda foi acrescentada
  pela revisão do plano.** Reinserir troca os **ids** das linhas, e
  `recebimentos_material_itens_almoxarifado.pedido_item_id` é INTEGER **sem FK, de propósito**
  (`schema.js:1304-1306`). Um recebimento **criado e não processado** tem `quantidade_recebida = 0`
  na linha do pedido e **passaria** pela primeira perna; depois do `PUT` o `pedido_item_id` dele
  aponta para uma linha que não existe mais, e o acumulador da 37
  (`UPDATE itens_pedido_compra … WHERE id = ?`, `receiptService.js:1261-1268`) altera **0 linhas sem
  erro, sem `catch`, sem `warn`**. O material entra no estoque e o pedido fica `ABERTO` com o saldo
  **cheio, para sempre**. *Cenário (4b) da T3:* recebimento aberto → `PUT` → **400** com a **mesma**
  literal, e os **ids das linhas continuam os mesmos**; processar depois → `quantidade_recebida = 6`.
- **RN-C08 — o `DELETE` de pedido recusa com 409 e apaga os itens junto.** *Cenário:* pedido com item
  `quantidade_recebida = 6` → **409**
  `'Pedido de compra <numero> já teve recebimento — não pode ser excluído'`, e
  `COUNT(pedidos_compra)` **inalterado**; pedido com um recebimento **criado e não processado**
  (`quantidade_recebida` ainda 0) → **409** com a **mesma** literal — porque a RN-23 da 37 diz que o
  saldo só se move na entrada física, e o documento existe mesmo assim; pedido **sem nada** → **200**
  e **`COUNT(itens_pedido_compra WHERE pedido_id = ?) === 0`** (a asserção do órfão: hoje o genérico
  deixa os itens). A rota específica é registrada **antes** do genérico (medição 2) — sabotagem
  própria: mover para depois e ver o 409 virar 200.
- **RN-C09 — o comprador acha material pela porta do Compras.** *Cenário:* `GET
  /api/compras/materiais?search=<código>` com um usuário que tem **só** o módulo `compras` → **200**
  com `[{ id, codigo, descricao, unidade }]`; e a mesma busca em `GET /api/almoxarifado/materiais`
  para o mesmo usuário → **403** (o `app.use` medido). É a metade que prova **por que** a porta nova
  existe: sem ela o formulário de pedido não tem como escolher material.
- **RN-C10 — a importação por planilha usa o MESMO serviço, agrupando pela coluna da planilha.**
  *Cenário:* `POST /api/compras/pedidos/importar` com 5 linhas de **duas** ordens (`OC-A` ×3,
  `OC-B` ×2), cabeçalhos em qualquer grafia (`código`/`cod`/`sku`, `qtd`/`quantidade`,
  `preço`/`valor unitario`) → **201** `{ pedidos: [ {id, numero, itens: 3}, {id, numero, itens: 2} ],
  ignorados: [] }`, os dois `numero` **gerados** (`PC-…`, e **diferentes** entre si), `observacoes`
  contendo `Planilha: OC-A`, e `COUNT(itens_pedido_compra)` = **5**. Reimportar o mesmo corpo → mais
  dois pedidos (declarado, decisão 8).
- **RN-C11 — linha da planilha sem material casado vai para `ignorados`, nunca para o banco.**
  *Cenário:* uma das 5 linhas com `codigo` inexistente → **201** com `ignorados: [{ linha: 3, motivo:
  'material não encontrado pelo código <cod>' }]`, `COUNT(itens_pedido_compra)` = **4**, e **nenhuma
  linha com `material_id IS NULL`** (a asserção que mede o dano real: `listarPedidosCompraAux` filtra
  `material_id IS NOT NULL`, então a linha silenciosa viraria um pedido `ABERTO` com saldo 0 no
  `<select>` do recebimento). Mesmo tratamento para `quantidade` não numérica ou ≤ 0
  (`'quantidade inválida'`) e ordem sem fornecedor resolvido (`'fornecedor não encontrado'`).
  Metade positiva: as outras 4 entraram e o pedido de `OC-B` está completo.
- **RN-C12 — os dois `<Link>` mortos passam a ir a algum lugar, e o formulário grava.** *Cenário
  (client):* renderizar a rota `/compras/pedidos/novo` mostra o formulário (`Novo pedido de compra`
  no DOM) e **não** a lista; escolher fornecedor, adicionar um item (busca de material → escolher →
  quantidade `4`, valor `25`) e submeter → **`api.post.mock.calls.filter(c => c[0] ===
  '/compras/pedidos')` tem `length === 1`** e `calls[0][1]` é
  `{ fornecedor_id: 312, data_pedido, previsao_entrega, status: 'pendente', observacoes, itens: [{ material_id: 907, quantidade: 4, valor_unitario: 25 }] }`
  — **sem `numero`** e **sem `valor_total`**. Submeter **sem item** não chama `api.post`
  (`toHaveLength(0)`) e mostra `Inclua ao menos um item no pedido de compra` no DOM. O total
  calculado aparece como `Total: R$ 100,00`. Metade positiva do modo edição:
  `/compras/pedidos/editar/<id>` carrega os itens do `GET /:id` e submete por `api.put`.
- **RN-C13 — "Gerar pedido" na Reposição cria o pedido e VINCULA a solicitação.** *Cenário (API):*
  `POST /api/compras/pedidos` com `solicitacao_id` de uma solicitação `PENDENTE` → **201**, e
  `SELECT status, pedido_compra_id FROM solicitacoes_compra_almoxarifado WHERE id = ?` → **`VINCULADO`
  com o `pedido_compra_id` do pedido criado**. Solicitação já `RECEBIDA`/`CANCELADA` → o pedido **é
  criado assim mesmo**, com `vinculo_solicitacao: 'falhou'` na resposta e `warn` no log (decisão 10 —
  o vínculo é não-fatal). *Cenário (client):* a linha `PENDENTE` da aba "Solicitações" tem o botão
  **"Gerar pedido"**, que navega para
  **(Fase 2)** `/compras/pedidos/novo?solicitacao=<id>&material=<material_id>&quantidade=<qtd>`.
  ⚠️ **Os três parâmetros, e não só o `id`, porque não existe porta que resolva o `id`:** não há
  `GET` de **uma** solicitação fora do módulo almoxarifado (`extended.js:1743`/`:1752` são POST), e
  `GET /api/compras/solicitacoes-compra/:id` (`index.js:18500`) é a tabela **`solicitacoes_compra` do
  core** — outra tabela, que traria o registro errado em silêncio. A Reposição já tem `material_id`,
  `material_nome` e `quantidade` na linha (`ReposicaoAlmoxarifado.js:768-772`).
  ⚠️ **E o destino é do módulo `compras`** (`<ProtectedModuleRoute modulo="compras">`, `App.js:324`):
  um almoxarife **sem** esse módulo bate na barreira. O botão segue a mesma fonte do menu, ou o fato
  vai para a letra G — escolha reversível, registrada.
- **RN-C14 — o pedido criado pela porta nova é recebido pela porta da Etapa 37, até o fim.**
  *Cenário (o aceite da etapa, pela ROTA e pelo SERVIÇO):* criar pedido de **10** por
  `POST /api/compras/pedidos` → ele aparece em `GET /almoxarifado/recebimentos-aux/pedidos-compra?pendentes=1`
  com `quantidade_pedida: 10, quantidade_recebida: 0, saldo_pendente: 10, situacao_recebimento:
  'ABERTO'` → `GET …/pedidos-compra/:id/itens` traz a linha com `saldo_pendente_material: 10` →
  `POST /almoxarifado/recebimentos` **no payload exato da tela da 37** (`pedido_compra_id` + itens
  `{pedido_item_id, material_id, quantidade: 6}`) → **201** → processar → `saldo_pendente: 4`,
  `PARCIAL` → segundo recebimento de **5** → **400** com a literal do saldo (ALMOXARIFE) → com
  `autorizar_excedente: true` e ALMOXARIFE → **403** → com COMPRAS → **201** + trilha → e então
  `PUT /api/compras/pedidos/:id` → **400** (RN-C07) e `DELETE` → **409** (RN-C08).
  **É este cenário, e só ele, que prova que a Etapa 37 deixou de ser inerte.**

## O sort, e onde ele difere do escopo do controlador

Critério da Fase 3 da skill: **motor, migration, `ACAO_PERFIS` ou regra compartilhada = tronco**;
**tela contra contrato congelado = galho**.

| Escopo do controlador | Nesta etapa | Por quê |
|---|---|---|
| A1, A2, A3 = tronco; B1, A5, A7 = galho | **igual** (T1, T2, T3 tronco; T4, T5, T6 galho) | a extração congela o arquivo, o `POST` congela o serviço e as literais, o `PUT`/`DELETE` congela a régua do recebimento — os três são o contrato interno |
| "rotas `/compras/pedidos/novo` e **`/compras/pedidos/:id`**" | `/compras/pedidos/novo` e **`/compras/pedidos/editar/:id`** | medição 5: o `<Link>` que já existe em `Compras.js:277` aponta para `editar/:id`. Declarar `:id` deixaria o link morto — o defeito que a etapa paga |
| "extrair `/api/compras/*`" | extrair as **23 contíguas**; as **3** de `solicitacoes-compra` ficam | medição 1: vivem 1.500 linhas acima, no meio de rotas de outros módulos, e operam `solicitacoes_compra` (core) — mover é diff grande sem régua e sem valor para esta etapa. Declarado em "NÃO cobre" |
| "`numero` GERADO no padrão da Etapa 31" | **acatado**, e o aviso da 31 **não** é violado | medição 7: o aviso proíbe embrulhar número **digitado**; a 38 tira o campo da tela. O comentário do `numeroDoc.js` é corrigido **dizendo** que mudou |
| B1 com reidempotência por `numero` (B2 da Fase 0) | **descartado** | consequência de (b): com o número gerado, o `UNIQUE` não pode ser a chave de idempotência. Agrupamento pela coluna da planilha; reimportar duplica, e a resposta diz o que criou |
| enum de status com **seis** valores (Fase 0) | **sete** (`em_analise` incluído) | medição 6: o filtro da tela o oferece; sem ele, filtro que nunca casa |

## Decisões desta etapa (vão para a letra B do doc de novidades) — **doze**

> ⚠️ **NUMERAR POR MEDIÇÃO, NÃO POR DEDUÇÃO.** A última letra B **existente hoje** no doc é **B88**
> (medido: `grep -o "\*\*B[0-9]\+" docs/almoxarifado-novidades-por-etapa.md | sort -u -V | tail -3`
> → B86, B87, B88). O **fechamento da Etapa 37 está rodando agora** e o rascunho dele
> (`contexto-fechamento.md`) reserva **B89–B95** *mais* as decisões da onda de correção final (F1–F7,
> U1, U3), que o rascunho não previa. **Antes de escrever a primeira decisão da 38, rode o `grep` de
> novo e comece na seguinte.** As outras letras, medidas hoje: A = **A11**, C = **C49**, F = **F12**,
> G = **G18** (a 37 avança todas).

| # | Decisão | Descartado, e por quê |
|---|---|---|
| 1 | extrair as **23 rotas contíguas** (`index.js:19974-20471`) para `server/routes/compras.js`; as **3** de `/api/compras/solicitacoes-compra` ficam onde estão | mover as 26: as três vivem 1.500 linhas acima, cercadas de rotas de configurações e de outros módulos, e operam **`solicitacoes_compra`** (core, ≠ `solicitacoes_compra_almoxarifado`). Mover é diff grande, sem régua nesta etapa e sem valor para o pedido. **Reversível**: quem quiser depois move o bloco de três para o mesmo arquivo |
| 2 | os dois multer entram por **DI** (`uploads.uploadGrupoCompras`, `uploads.uploadFornecedor`) | movê-los para `routes/compras.js`: eles fecham sobre `uploadsGruposComprasDir`/`uploadsFornecedoresDir`, variáveis de módulo do `index.js` — mover mudaria **onde o arquivo é gravado**, que é exatamente o que "sem mudar comportamento" proíbe |
| 3 | a rota de edição é **`/compras/pedidos/editar/:id`** | `/compras/pedidos/:id` (escopo do controlador): o `<Link>` que já existe aponta para `editar/:id` e continuaria morto — e `:id` casaria também `/compras/pedidos/novo`, exigindo ordem de rota para desempatar |
| 4 | enum de status com **sete** valores minúsculos: `pendente, aprovado, rejeitado, em_analise, enviado, recebido, cancelado` | os **seis** da Fase 0 (sem `em_analise`): o `<select>` de filtro da tela o oferece ao usuário — o filtro casaria zero pedidos para sempre. E os nove do mapa de cores: `ativo`/`inativo` são status de **fornecedor**, não de pedido |
| 5 | `numero` **gerado** pelo servidor (`PC-…`, via `inserirComNumeroUnico`), **sem campo na tela** | `numero` digitado + 409 traduzido (recomendação da Fase 0, R2): o aviso da Etapa 31 proíbe **reescrever escolha de gente** — tirando o campo da tela, não há escolha a reescrever, e o aviso passa a ser satisfeito em vez de contornado. Custo declarado: o comprador **não** consegue lançar o número da OC do fornecedor no campo `numero`; ele vai em `observacoes` (e a planilha o usa como agrupador) |
| 6 | porta de busca de material **no core**: `GET /api/compras/materiais` (id, código, descrição, unidade) | alargar `checkModulePermission` do almoxarifado para o comprador: daria o **módulo inteiro** a quem precisa de quatro campos. E chamar `GET /almoxarifado/materiais` da tela de Compras: **403** para o comprador sem o módulo (medição 8) — a tela nasceria quebrada para o usuário-alvo |
| 7 | **reusar** `validate()` de `services/almoxarifado/validation.js` no core, por `require` | as duas saídas que a Fase 0 via: **mover** o arquivo (mexe em ~40 rotas do almoxarifado numa etapa que não é de refator) ou **duplicar** (duas cópias de `formatZodError` divergem na primeira edição). O arquivo tem 34 linhas e zero dependência do módulo. **Reversível**: quando o core tiver mais Zod, move-se para `server/services/validation.js` com um re-export |
| 8 | a importação agrupa pela **coluna da planilha**; reimportar **cria pedidos novos** | idempotência por `numero` (B2 da Fase 0): incompatível com a decisão 5 — o número é gerado, então o `UNIQUE` não identifica a planilha. Custo declarado: reimportar duplica. Mitigação: a resposta lista os pedidos criados, e o `DELETE` da RN-C08 apaga cabeça **e** itens |
| 9 | `valor_total` **derivado** da soma dos itens, no servidor | aceitar do payload: a lista de Compras (`Compras.js:262`) mostra esse número em destaque, e ele passaria a não bater com item nenhum. Custo: não há como registrar frete/desconto de cabeçalho — fica em `observacoes` (e é etapa própria) |
| 10 | `vincularPedidoCompra` é **não-fatal** no `POST` do pedido (`warn` + `vinculo_solicitacao: 'falhou'`) — **(Fase 2) pelo motivo corrigido:** o serviço lança 404 (solicitação inexistente) e 400 (solicitação já `RECEBIDA`/`CANCELADA`), e nenhum dos dois deve custar o pedido. **(execução — fix 1 da T2) A segunda metade desta decisão foi REVERTIDA pelo controlador, e o que estava escrito aqui estava errado.** O texto anterior dizia que o efeito colateral — *"a porta do Compras escreve em `solicitacoes_compra_almoxarifado` sem `gerenciar_reposicao` e sem o módulo `almoxarifado`"* — seria apenas **declarado na letra G**. Estava errado porque **autorização em duas camadas é regra do projeto, não preferência de módulo**: a escrita é a mesma que o almoxarifado gateia por `gerenciar_reposicao` (`extended.js:1743`), o buraco era **alcançável pela UI** (botão "Gerar pedido" da Reposição, T6) e **medido** (cenário (11) da T2: antes do fix, `201` com a solicitação em `VINCULADO` para um usuário de perfil `PRODUCAO` do fallback) — declarar um furo alcançável não é o caminho reversível; fechá-lo com uma linha é. **O que passou a valer:** `criarPedido` chama `can(user, 'gerenciar_reposicao')` **antes de qualquer escrita** quando vem `solicitacao_id`, e responde **403 `{ error: 'Sem permissão para esta operação', acao: 'gerenciar_reposicao', perfil }`** — o mesmo shape de `requirePermission`. O gate é **condicional**: `POST` **sem** `solicitacao_id` continua só com a camada do módulo, e essa parte da decisão (o core não ganha camada de perfil própria) **continua de pé**. O não-fatal do `try/catch` também continua: ele cobre solicitação inexistente/terminal, não falta de permissão | deixar o erro subir (perder o pedido por um vínculo informativo). ⚠️ **Descartado também o motivo que estava escrito aqui** — *"um comprador sem o módulo perderia o pedido inteiro"* — **medido como falso**: não há módulo nem perfil no caminho do serviço. **(execução) Descartado no fix 1:** (a) manter "declarar sem gatear" — o furo é real e alcançável por clique; (b) inventar uma camada de perfil para o módulo Compras (`ACAO_PERFIS` próprio) — decidir os perfis de Compras continua sendo etapa própria, e gatear a **criação do pedido** por perfil do **almoxarifado** barraria o comprador no seu próprio módulo; (c) chamar a rota do almoxarifado por HTTP a partir do core, que duplicaria a autenticação e acoplaria os dois módulos por rede |
| 11 | a spec vive em `specs/modulo-almoxarifado/22-integracoes/` como **a fatia Compras**, com `specs/modulo-compras/README.md` **mínimo** apontando para lá | criar `specs/modulo-compras/` completo (estrutura nova sem dono, numa etapa) ou escrever a tela de Compras como feature do almoxarifado sem dizer (mentira estrutural — o erro que o CLAUDE.md nomeia como o mais caro). **Reversível**: quando Compras ganhar spec própria, a fatia migra e o stub vira índice |
| 12 | a branch continua **`desenvolvimento-almoxarifado`** | abrir branch de Compras: a etapa depende do harness e das tabelas da 37 e o valor só aparece com as duas juntas. Custo declarado: uma fatia de módulo core fica represada até o almoxarifado fechar — **registrar na letra B para o usuário arbitrar**, é a decisão dele |

## Riscos, e onde o desenho os fecha

| # | Risco | Fechado por |
|---|---|---|
| R1 | **é módulo CORE** — `server/index.js` tem 20 mil linhas e a extração pode derrubar rota que ninguém testa | a T1 é **só mover**, com `git diff` conferido rota a rota, a ordem preservada (RN-C01) e o harness montando o registrador. O cenário do `DELETE /grupos/:id` = 400 é a asserção que **detecta reordenação** |
| R2 | **POST que grava a cabeça e engole os itens responde 201** e a suíte passa | toda asserção lê `itens_pedido_compra` pelo `pedido_id` devolvido e conta linhas; sabotagem obrigatória da T2 = **remover o `INSERT` dos itens** (a que o CLAUDE.md nomeia) |
| R3 | `PUT` que **reinsere** os itens apagaria a `quantidade_recebida` acumulada pela 37 | RN-C07 recusa o `PUT` assim que **qualquer** item tem `quantidade_recebida > 0`, e a asserção é o **valor no banco depois do 400**, não o código |
| R4 | `DELETE` deixar itens órfãos (defeito de hoje, R3 da Fase 0) e agora com itens de verdade | RN-C08 apaga os itens no mesmo caminho e afirma `COUNT(itens WHERE pedido_id) === 0`; e a rota específica **antes** do genérico, com sabotagem que a move para depois. ⚠️ **(Fase 2) o R3 da Fase 0 está impreciso e a correção importa:** `PRAGMA foreign_keys = ON` roda na conexão de **produção** (`sqliteConcurrency.js:50`) e `itens_pedido_compra` tem `FOREIGN KEY (pedido_id)` (`schema.js:1319`) — em produção o genérico **não** deixa órfãos, ele **falha** com `FOREIGN KEY constraint failed` → 500 `'Erro ao excluir item'`. O harness roda com `foreign_keys = 0` (`planoInspecao.api.test.js:231-234` **assere** isso), então o cenário (7) da T3 mede o comportamento **do harness**. `excluirPedido` apaga os filhos primeiro pelos **dois** motivos |
| **R12 (Fase 2)** | **a literal do 409 não chegar a quem clica** | a lixeira da aba Pedidos é o gesto que dispara a RN-C08, e `Compras.js:118` troca qualquer erro por `'Erro ao excluir item'`. A T5 passa a tocar `Compras.js` e o cenário (h2) afirma que o `toast.error` recebe **a literal do servidor** |
| **R13 (Fase 2)** | **o formulário mandar string onde o schema quer número** | contrato de tipos no `POST` + `Number()` no formulário + `typeof` afirmado no cenário do client (a suíte de API sozinha ficaria verde) |
| R5 | **4 regras de negócio sem dono** (fornecedor obrigatório? preço obrigatório? quem aprova? quem numera?) | decididas pelo reversível e registradas: fornecedor **obrigatório** (o DDL manda `NOT NULL`), preço **opcional com 0** (o DDL manda `DEFAULT 0`), **sem fluxo de aprovação** (status livre no enum, editável), número **gerado**. Todas na letra B, com o descartado |
| R6 | a régua da importação medir `inseridos` e não o dano | RN-C11 afirma `ignorados` **e** `COUNT` **e** "nenhuma linha com `material_id IS NULL`" — as três, porque só a terceira mede o pedido fantasma no `<select>` do recebimento |
| R7 | a etapa mudar comportamento da Etapa 37 sem notar | **nenhuma linha toca `receiptService.js`, `extended.js` ou `schema.js`** (ver "Estrutura de arquivos" do plano); a T7 roda `recebimentoContraPedidoIntegracao.api.test.js` e `pedidoSaldoRecebido.api.test.js` **inteiros** |
| R8 | cenário de client verde com o formulário vazio | metade positiva em todos: `api.post.mock.calls` **contado** (`toHaveLength(1)`), payload lido de `calls[0][1]`, o `Total: R$ 100,00` no DOM, e o caso "sem item" afirmando `toHaveLength(0)` |
| R9 | "verde de primeira" | controle positivo em toda task, com `grep -cF` da âncora **contado depois do conserto**, `perl -0pi -e`, `md5sum` antes/depois/depois-de-restaurar e **nunca** `git checkout --` |
| R10 | o vínculo da solicitação derrubar a criação do pedido para quem não tem o módulo almoxarifado | decisão 10 (não-fatal), com cenário próprio: usuário sem o módulo cria o pedido e recebe `vinculo_solicitacao: 'falhou'`. ⚠️ **(execução — fix 1 da T2)** com o gate condicional, quem **pede** vínculo sem `gerenciar_reposicao` recebe **403 e nenhum pedido** — não `'falhou'`. O não-fatal continua valendo para o que ele sempre cobriu: solicitação inexistente ou já terminal. Quem não quer o risco manda o `POST` **sem** `solicitacao_id` e cria o pedido normalmente |
| R11 | `numeroDoc.js` continuar afirmando que a escrita em `pedidos_compra` é inalcançável | a T2 **corrige o comentário dizendo que era verdade até esta etapa** (regra 5), e o teste de número do pedido afirma o prefixo `PC-` |

## O que esta etapa NÃO cobre

- **Cotações e fornecedores** — as outras duas abas continuam **sem tela de criação** (`/compras/
  fornecedores/novo` e `/compras/cotacoes/nova` seguem caindo no `path="*"`). Declarado: a 38 conserta
  **uma** das três abas, e o mapa de status tem de dizer isso.
- **Aprovação/workflow de pedido.** `status` é campo livre dentro do enum, editável pelo `PUT`. Não há
  `pendente → aprovado → enviado` com guarda, nem perfil que aprove — **etapa própria**, e é a decisão
  de negócio que o R5 registra como escolhida pelo reversível.
- **Segunda camada de autorização no core.** `/api/compras/*` continua com `auth` +
  `checkModulePermission('compras')` e **nenhum perfil** — inclusive as portas de **escrita** novas.
  Qualquer usuário com o módulo `compras` cria, edita, importa e apaga pedido. É o gate que o módulo
  já tem para fornecedores e grupos; acrescentar `ACAO_PERFIS` ao core é **etapa própria** (exige
  decidir os perfis do módulo inteiro). **Vai para a letra G, em destaque.**
- **As 3 rotas `/api/compras/solicitacoes-compra`** ficam em `index.js` (decisão 1).
- **O sombreamento do `DELETE /api/compras/grupos/:id`** (medição 2): medido, **congelado como
  caracterização**, **não** consertado — é comportamento de outra aba e consertá-lo dentro de uma
  extração "sem mudar comportamento" seria contradição. Letra **C**/**G**.
- **Os 51 `ALTER TABLE` fora de `safeAlter` de `server/index.js`.** A 38 mexe nesse arquivo (T1) e
  **não** encampa a limpeza — é a nota que a Etapa 37 deixou (letra G).
- **Qualquer mudança nas três portas da Etapa 37**, na régua de saldo, no acumulador ou na derivação
  da situação. Os onze itens da tabela "O que NÃO reabrir" valem inteiros.
- **Frete, desconto e impostos de cabeçalho** — `valor_total` é a soma dos itens (decisão 9).
- **Anexo do pedido (PDF da OC)** e **acompanhamento de prazo com alerta de atraso**
  (`22-integracoes/README.md:75`): a 38 entrega o **dado** (`previsao_entrega` passa a ser
  preenchível), que era o que faltava desde a Etapa 14; o **alerta** é etapa própria.
- **Segregação de saldo por almoxarifado.** Almoxarifado é **área física, não filial**: saldo global
  por material segue correto e intencional.
- **(Fase 2) Filtrar o `<select>` do recebimento por `status`.** `listarPedidosCompraAux`
  (`receiptService.js:1474-1520`) **não tem cláusula de `status`**: o pedido que o comprador marcar
  como `cancelado` ou `rejeitado` pelo enum da RN-C05 **continua oferecido** ao almoxarife como
  `ABERTO`. Acrescentar o filtro é **mexer numa porta da Etapa 37**, que esta etapa proíbe por
  contrato. Fica **declarado** (letra G e guia) e é etapa própria. A outra metade da mesma leitura é
  boa notícia: o pedido `pendente` (o default do `POST`) **aparece** sem que nada precise ser feito.
- **(Fase 2) O `LIMIT 50` do `<select>` do recebimento.** A mesma query corta em 50, e a 38 é a
  primeira porta capaz de criar 60 pedidos num clique (importação): os mais antigos somem do
  `<select>` **sem mensagem**. E `pedidos_compra.created_at` é `DEFAULT CURRENT_TIMESTAMP` (1 s de
  resolução), então uma importação inteira empata no `ORDER BY p.created_at DESC`. Declarado.
- **(Fase 2) O que o almoxarife vê no `<select>`.** Ele é `{numero} — {fornecedor_nome}`
  (`RecebimentosAlmoxarifado.js:1207`): com o `numero` **gerado** (decisão 5), dois pedidos do mesmo
  fornecedor ficam **indistinguíveis** para quem recebe. O número da OC do fornecedor vai em
  `observacoes`, que o `<select>` **não mostra**. Custo declarado da decisão 5, letra G.

---

## Como foi executado — onde a execução divergiu deste design

> Escrito no fechamento da etapa (2026-09-16, `be71754..0a7e5c6`). **Design errado é dado, não
> vergonha** — o que não se faz é apagar a versão errada em silêncio, porque o próximo confia nela
> de novo.

1. **Decisão 10 — o gate do vínculo mudou de lugar e de natureza.** O design dizia "declarar sem
   gatear" e a segunda metade da decisão foi **revertida pelo controlador** no fix 1 da T2
   (`3e43069`). O motivo está na própria célula da tabela de decisões, corrigido lá: autorização em
   duas camadas é **regra do projeto**, não preferência de módulo, e o furo era **alcançável por
   clique** — medido (`201` com a solicitação em `VINCULADO` para um usuário do fallback
   `PRODUCAO`). O que passou a valer: `can(user, 'gerenciar_reposicao')` **dentro do serviço**
   (`criarPedido`), **antes de qualquer escrita**, com 403 no formato de `requirePermission`. O gate
   é **condicional**: `POST` sem `solicitacao_id` segue só com a camada do módulo, e essa metade da
   decisão continua de pé. **Descartado:** dar `ACAO_PERFIS` próprio ao core (etapa própria) e
   chamar a rota do almoxarifado por HTTP (duplicaria autenticação e acoplaria os módulos por rede).
2. **T5 — "a rota tem de vir ANTES do `path="*"`" era falso.** O react-router 6 casa por **ranking
   de especificidade**, não por ordem de declaração: o que importa é a rota **existir**. A intuição
   vinha do Express, onde a ordem **é** contrato — e é contrato de verdade do lado do servidor
   (as rotas de pedido **precisam** ficar acima de `app.delete('/api/compras/:tipo/:id')`). Duas
   regras opostas nos dois lados do mesmo commit, e é por isso que a confusão era fácil.
3. **T6 — "Gerar pedido" NAVEGA, não posta.** O design supunha que o botão dispararia o `POST` do
   Compras da própria tela da Reposição. A execução (`727ee29`) o fez **navegar** para
   `/compras/pedidos/novo?solicitacao=…&material=…&quantidade=…`, e quem posta é o formulário da T5
   — que já lia a query. Ganho: os três erros do servidor (400 de schema, 403 do gate do vínculo,
   403 de módulo) aparecem **onde o usuário pode corrigi-los**, em vez de num toast de outra tela.
   Custo declarado: a linha da Reposição só muda para `VINCULADO` ao **reabrir** a aba.
   **Descartado:** criar `GET /api/almoxarifado/solicitacoes/:id` só para pré-preencher (B107) e
   consultar `minhas-permissoes` do Compras por linha (B108 — o botão se esconde pelo cache de
   módulos do menu, que **falha aberto**).
4. **Os rulings da onda de correção (B109–B113), todos posteriores a este design.** A revisão final
   (2 lentes, BASE `dc60507`) achou 1 Critical + 7 Important, e cinco deles exigiram decisão que
   este documento não tinha:
   **B109** — a importação agrupa por **(ordem da planilha, fornecedor DA LINHA)**, nunca só pela
   coluna de pedido; **descartado:** recusar a planilha inteira. Antes disso o item da BETA era
   gravado no pedido da ACME e a conta a pagar da Etapa 37 nasceria para o fornecedor **errado**.
   **Regressão declarada:** planilha com CNPJ só na 1ª linha da OC perde as demais.
   **B110** — `DELETE` do pedido **libera** as solicitações de volta a `PENDENTE` e devolve
   `solicitacoes_liberadas: N`; **descartado:** 409 (recusar a exclusão), que trancaria o comprador
   por causa de um vínculo informativo.
   **B111** — `previsao_entrega` e `data_pedido` só `null` ou `AAAA-MM-DD`; `''` vira `null`, texto
   inválido é 400. Na importação, serial do Excel e `DD/MM/AAAA` convertem e o irreconhecível vira
   `null` + `avisos[]` — a data é **informativa**, então recusar a linha jogaria fora o item
   comprado. **E `null` explícito no `PUT` passou a significar LIMPAR** a data, senão não haveria
   como apagar uma previsão (o comentário que dizia o contrário foi corrigido dizendo que mudou).
   **B112** — fornecedor com pedidos → **409** `Fornecedor possui pedidos de compra — não pode ser
   excluído`; **descartado:** cascade. Este caso **só se tornou alcançável nesta etapa**, porque
   antes dela não existia pedido nenhum.
   **B113** — `data_pedido` da importação vem da coluna `data`/`emissão` se houver, senão **hoje**
   (data local do servidor); sem isso a aba mostrava `Data Pedido: -` em toda linha da carga.
5. **Um item que este design listou como "NÃO cobre" e a execução TOCOU:** a seção acima diz que a
   etapa não mexe em fornecedores. O F5 (`59abaea`) mexeu — no **ramo `fornecedores` do `DELETE`
   genérico**, e só nele, para trocar um 500 por FK por um 409 com literal. Está registrado como
   B112 em vez de ficar como contradição silenciosa: a etapa criou o dado que torna aquela falha
   alcançável, então consertá-la é escopo dela.
6. **O que este design previu e se confirmou, sem ajuste:** a extração byte-fiel (md5 idêntico), o
   sombreamento de `grupos/:id` congelado como caracterização, o `z.looseObject` (com o dano
   **diferente** do previsto — quem sumia era `solicitacao_id`, não `itens`), a guarda de duas
   pernas do `PUT`/`DELETE` (provada por sonda executada), os schemas Zod reusando o `validate()` do
   almoxarifado, e o contrato de **não-toque** em `receiptService.js`/`extended.js`/`schema.js`.
