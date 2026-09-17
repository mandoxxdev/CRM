# Etapa 39 — O pedido de compra passa a ser ACOMPANHADO: prazo prometido, atraso e os resíduos da 38 (design)

**Data:** 2026-09-16 · **Branch:** `desenvolvimento-almoxarifado` · **BASE:** `6aa33f6` · **Módulo:**
**CORE Compras** (segunda etapa da série fora do almoxarifado) + **uma entrada** no registro de
alertas do almoxarifado · **Fatia de spec:** `specs/modulo-almoxarifado/22-integracoes/` (a fatia
"Compras") e `specs/modulo-almoxarifado/20-alertas/` · **Item de checklist que ela fecha:**
*"acompanhamento de pedido e prazo com alerta de atraso"* (`22-integracoes/README.md:217-219`,
aberto desde a Etapa 14).

**Medição de base:** `.superpowers/sdd/etapa39-fase0-acompanhamento.md` — Fase 0 só leitura, com
sonda `sqlite3.OPEN_READONLY` contra o dump de produção de 161 MB e dois subagentes de leitura em
paralelo. **Todo fato deste design tem `arquivo:linha`** — os da Fase 0 estão citados como tal, e os
**oito acrescentados por este design** estão marcados `(novo)` e foram lidos no código agora.

> ⚠️ **Onde este design corrige a Fase 0, vale este design** — e a correção fica **escrita**, não
> apagada (regra 5 do `CLAUDE.md`). São duas, as duas na seção "O que a Fase 0 mediu e este design
> corrigiu".

---

## 1. Contexto e problema

A Etapa 38 deu ao pedido de compra uma porta de criação, um `numero` gerado, itens, importação por
planilha e — o que importa aqui — **`previsao_entrega` validada por contrato**: `null` ou
`AAAA-MM-DD`, nunca `''`, nunca texto livre, nas **três** entradas (`POST`, `PUT`, importação)
(`server/services/compras/schemas.js:79-126`). Esse é o dado que a feature 22 esperava desde a
Etapa 14 para poder dizer *"este pedido está atrasado"*.

**E ninguém diz.** Medido na Fase 0 §1.5, com controle positivo (a régua acha os 11 alertas que
existem): `WHERE previsao_entrega < …` **não existe em código executável** em lugar nenhum — só em
dois comentários que prometem a etapa (`pedidoCompraService.js:140`, `compras/schemas.js:79`).
A aba Pedidos **já mostra** a previsão de entrega (`client/src/components/Compras.js:303` no
cabeçalho, `:320` na célula) e **não tem nenhuma noção de que a data passou**: sem badge, sem
filtro, sem cor. O comprador tem a coluna e faz a conta de cabeça, pedido a pedido.

**E há um defeito pior debaixo disso, que é o defeito ESCAPADO da Etapa 38.** `formatDate` da aba
Compras (`client/src/components/Compras.js:91-94`) é:

```js
const formatDate = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('pt-BR');
};
```

`new Date('2026-09-16')` é **meia-noite UTC**; `toLocaleDateString('pt-BR')` renderiza no fuso
local. Sonda executada da Fase 0 §4.2, em `America/Sao_Paulo` (reproduzida agora, `node -e`):

```
new Date("2026-09-16").toLocaleDateString("pt-BR")  ->  15/09/2026
```

Duas consequências, e a segunda é a grave:

1. **Exibição** — `Data Pedido` (`Compras.js:319`) e `Previsão Entrega` (`:320`) mostram **o dia
   anterior** ao que está no banco. Vale também para `Cadastrado em` dos fornecedores (`:180`) e
   `Data`/`Validade` das cotações (`:213-214`).
2. **Round-trip do Excel** — a exportação usa **o mesmo** `formatDate` (`:161-162`) e a importação
   lê `DD/MM/AAAA` (`pedidoCompraService.js:604-605`). Logo **exportar e reimportar o próprio
   arquivo do CRM move as duas datas um dia para trás**. É exatamente a promessa que o F6 da
   Etapa 38 (`ba6278e`) fez — *"o Excel que o módulo exporta se reimporta"* — cumprida na estrutura
   e **falha no valor**.

O plano da 38 (`docs/superpowers/plans/2026-09-16-crm-etapa38-pedido-de-compra.md`, retro nº 4)
deixou o campo **"defeito escapado"** em branco de propósito, dizendo que só pode ser preenchido
**de fora**, por quem fechar a 39 olhando para trás. **É este.** O fechamento desta etapa preenche
aquele número, nomeando o commit.

> **Não existe etapa de "atraso" honesta antes de consertar as datas.** Uma tela que calcula
> `previsao_entrega < hoje` corretamente e **renderiza** a data um dia antes vai ser lida pelo
> comprador como bug do cálculo — e o próximo desenvolvedor vai "consertar" o cálculo.

### Os números da Fase 0 que decidem o corte

| Fato | Onde | Consequência para esta etapa |
|---|---|---|
| Features **19** (fila/canal) e **20** (registro de alertas) estão **🟢 e entregues** | `specs/modulo-almoxarifado/README.md:1086-1087` | o medo do plano da 38 (*"atropelar 19/20 criando a segunda fila"*) **não se aplica**: a primeira fila tem ponto de extensão declarado |
| `ALERT_REGISTRY` tem **11 entradas**, média **24,8 linhas**; o cabeçalho declara *"Entrada nova aqui = alerta novo completo (varredura + central + config), sem tocar em mais nada"* | `server/services/almoxarifado/alertRegistry.js:6-7`, `:188-461` | alerta novo custa **um literal de objeto**, ~20 linhas, e **zero registro em outro lugar** |
| O gêmeo estrutural é **`REQUISICAO_ATRASADA`** (27 linhas) | `alertRegistry.js:301-326` | é o molde copiado aqui, campo a campo |
| Varredura diária: `varrerAlertasRegistrados(db)` no **Job B** | `server/routes/almoxarifado.js:3791`; laço em `notificationQueueService.js:579-627` | o alerta novo é varrido **sem cron novo** |
| Destinatário da varredura: lista **única** `alertas_estoque_emails` | `notificationQueueService.js:590` | e em **produção** ela é **idêntica** a `compras_notificar_emails` (os mesmos 3 endereços, `compras2@gmp.ind.br` incluído) — Fase 0 §5 |
| `GET /api/compras/pedidos` é `SELECT p.*` + `fornecedor_nome`, `ORDER BY p.created_at DESC`, **sem `LIMIT`** | `server/routes/compras.js:111-137` | `previsao_entrega` e `status` **já chegam** na resposta: o atraso é derivável sem porta nova |
| A rota aux da Etapa 37 **não devolve `previsao_entrega`** e tem **`LIMIT 50`** | `server/services/almoxarifado/receiptService.js:1486-1488`, `:1518` | `situacao_recebimento` na aba Pedidos custaria editar arquivo **NÃO-TOQUE** ou duplicar a fórmula de saldo → **fora** (D3) |
| `pedidos_compra` = **0**, com `previsao_entrega` preenchida = **0**; `fornecedores` = **10** | sonda readonly no dump de 03/09/2026 | o alerta nasce **inerte** — declarado, não escondido |
| O perfil **COMPRAS já tem `ver_alertas`** | `server/services/almoxarifado/permissions.js:149` | nenhuma decisão de perfil nova |
| `20-alertas/README.md:27` — *"Pedido recebido parcialmente"* está `[ ]` com o motivo *"falta noção de saldo do pedido"* (`:48`) | a spec, lida | **o motivo caducou** na Etapa 37 (`situacaoRecebimentoPedido`, `receiptService.js:1444-1450`) → correção de spec obrigatória (D7) |

### As NOVE medições novas deste design (nenhuma está na Fase 0 nem em spec nenhuma)

1. **(novo) A suíte do cliente JÁ roda em `America/Sao_Paulo`, e "setar `process.env.TZ` no topo do
   arquivo de teste" está documentado NESTA BASE como FALSO sob Jest.**
   `client/jest.globalSetup.js` (registrado em `client/package.json` → `jest.globalSetup`) faz
   `process.env.TZ = 'America/Sao_Paulo'` **antes de o Jest forkar os workers**, e o comentário dele
   registra a medição do achado A1 da Etapa 22: *"quando o processo já tem TZ definido no ambiente,
   a atribuição em runtime é no-op — o V8 já resolveu o fuso"*. → **decisão 9 divergiu do escopo do
   controlador por causa disto** (o escopo mandava o teste setar `process.env.TZ`).
2. **(novo) O `<select>` de status é COMPARTILHADO pelas três abas** (`Compras.js:459-470`, dentro do
   `<div className="filters">` de `:447-472`, que é renderizado fora do `switch` de abas). Qualquer
   controle novo de filtro tem de ser **condicional a `activeSection === 'pedidos'`**, ou aparece na
   aba de fornecedores fazendo nada.
3. **(novo) `loadData` já passa `search` e `status` como `params` do mesmo `api.get`**
   (`Compras.js:64-66`) e re-dispara por `useEffect` em `[activeSection, search, filterStatus]`
   (`:49-51`). Um filtro novo entra como **mais um `param` e mais uma dependência** — zero
   refatoração.
4. **(novo) A régua da aba Pedidos já existe e não é `Compras.test.js`.** `Compras.js` não tem
   arquivo de teste próprio, **mas** `client/src/components/compras/PedidoCompraForm.test.js`
   renderiza `AppRoutes` e já exercita a aba: o cenário `(h2)` (`:460`) clica na lixeira da lista e
   o `(p)` (`:785`) afirma as colunas da exportação. O fixture dela é
   `PEDIDO_418_LISTA = { data_pedido: '2026-09-10', previsao_entrega: '2026-09-25', … }` (`:149-152`)
   — previsão **no futuro**, então **nenhum cenário existente vê badge de atraso**, e o `(p)` **não
   afirma** as colunas de data. **Consequência: nada do que esta etapa muda derruba a suíte da 38.**
5. **(novo) O harness de API já monta o registrador de Compras**:
   `server/tests/helpers/testApp.js:140` (`require('../../routes/compras')(app, db, fakeAuth,
   fakeCheckModulePermission, {…})`), e `pedidos_compra` é stubada em `testApp.js:100-111` **com
   `previsao_entrega DATE`** e sem FK para `fornecedores`. O teste de atraso e o do alerta são
   escrevíveis **sem fixture nova**.
6. **(novo) Não existe configuração de `TZ` no servidor.** `grep "process.env.TZ\|TZ="` em
   `server/*.js`, `server/routes/*.js`, `server/package.json`, `package.json` e
   `ecosystem.config.js` → **zero ocorrências**. O "hoje" do servidor é o **fuso do sistema
   operacional do host**, e a Fase 0 mediu o fuso da **máquina de desenvolvimento**, não o de
   produção. → **letra A** (D3).
7. **(novo) O fuso do NEGÓCIO já tem nome na base:** `FUSO_PADRAO = 'America/Sao_Paulo'`
   (`server/services/almoxarifado/auditFiltros.js:53`, exportado em `:127`), usado para recortar o
   dia na auditoria — e `client/jest.globalSetup.js` diz, por escrito, que os dois "mudam juntos" se
   o cliente um dia operar em outro fuso. É a âncora que a letra A cita.
8. **(novo) A central de alertas é INALCANÇÁVEL para um usuário só de Compras.**
   `GET /api/almoxarifado/alertas/central` está sob o `app.use('/api/almoxarifado', authenticateToken,
   checkModulePermission('almoxarifado'))` de `server/routes/almoxarifado.js:285` — o gate do
   **módulo**, antes do handler. Ter `ver_alertas` (`permissions.js:149`, COMPRAS incluída) não basta:
   sem o módulo `almoxarifado`, o comprador toma **403**. → **decisão 5**, declarada com todas as
   letras: *o alerta chega ao Compras por e-mail e pelo badge da aba Pedidos; a lista in-app é a do
   almoxarifado.*
9. **(novo) Um require de TOPO da régua no `alertRegistry.js` fecharia um CICLO de módulos.**
   `server/services/compras/pedidoCompraService.js:109` requer `purchaseService` **no topo**, e
   `alertRegistry.js:9-13` documenta, por escrito, que `purchaseService` requer
   `notificationQueueService` no topo — que requer o `alertRegistry`. Logo
   `alertRegistry -> pedidoCompraService -> purchaseService -> notificationQueueService ->
   alertRegistry`, e *"um dos lados capturaria `{}` mid-load"*. → o require da régua na entrada nova
   é **LAZY, dentro do `listar`** (§5.3, R9b), como as entradas de evento já fazem.

---

## 2. Objetivo e corte

**Objetivo:** que o comprador **veja** que um pedido passou do prazo prometido, **filtre** por isso,
**exporte** isso, e **receba e-mail** quando acontecer — sem fila nova, sem coluna nova, sem
migration, sem status novo e sem tocar em nenhuma porta da Etapa 37.

**O corte, em três fatias (A0 → A1 → A2) e nada além:**

| Fatia | O que é | Reversível porque |
|---|---|---|
| **A0 — as datas** | `formatDate` da aba Compras formata a string `AAAA-MM-DD` por `split`, sem `new Date`; `hojeISO` do formulário passa a ser **local** | são duas funções de 3 linhas; nenhum dado gravado muda |
| **A1 — atraso derivado na LEITURA** | `atrasado`/`dias_atraso` na resposta de `GET /api/compras/pedidos`, badge + filtro na aba, 2 colunas no export | **nenhuma coluna nova, nenhuma tabela, nenhum `UPDATE`** — apagar o código apaga a feature inteira |
| **A2 — um alerta no registro existente** | `PEDIDO_COMPRA_ATRASADO` como **uma entrada** em `ALERT_REGISTRY` | remover a entrada remove varredura, central, dedupe, canal e config de uma vez (`alertRegistry.js:6-7`) |

**Fora, declarado desde já (detalhado na seção 8):** o tema alternativo (as duas abas de Compras sem
tela de criação), `situacao_recebimento` na aba Pedidos, mudança de vocabulário de status,
auto-`recebido` no recebimento, o alerta "Pedido recebido parcialmente" e as **4 varreduras com
`date('now')`** (UTC) da feature 20.

---

## 3. Decisões desta etapa — **dez** (vão para a letra B do doc de novidades)

> ⚠️ **NUMERAR POR MEDIÇÃO, NÃO POR DEDUÇÃO.** A Etapa 38 fechou usando **B101** (uma camada de
> autorização no core) e **B109–B113** (onda de correção). **Antes de escrever a primeira letra B da
> 39, rode `grep -o "\*\*B[0-9]\+" docs/almoxarifado-novidades-por-etapa.md | sort -u -V | tail -3`
> e comece na seguinte.** O mesmo vale para A, C, D, F e G.

| # | Decisão | Descartado, e por quê |
|---|---|---|
| **D1** | **Escopo = A0 → A1 → A2, nesta ordem, mais o defeito escapado da 38.** O **tema B** (as duas abas sem rota de criação — `/compras/fornecedores/novo`, `/compras/cotacoes/nova`, mais os **dois** lápis mortos de `Compras.js:270` e `:392`) fica **fora** e é declarado como **o próximo candidato** | fazer o tema B agora: medido na Fase 0 §6.3 em ~4 rotas de client + ~4 rotas de servidor + 2 schemas Zod + 2 telas + 4 suítes, e **não fecha item de checklist nenhum** — é CRUD, não acompanhamento. E fazer A1 **sem** A0: a tela mostraria o atraso certo com a data errada, e o próximo leria isso como bug do cálculo |
| **D2** | **A0 — as datas.** `formatDate` (`Compras.js:91-94`) passa a formatar **a string**: `AAAA-MM-DD` → `DD/MM/AAAA` por `split('-')`, **sem `new Date`**. Vale para exibição **e** export, que compartilham a função (`:161-162`). `hojeISO` do formulário (`PedidoCompraForm.js:85`) vira **local**, no formato de `FerramentasAlmoxarifado.js:423` e de `hojeLocalISO` (`pedidoCompraService.js:615-620`). **Este é o defeito escapado da Etapa 38** e o fechamento **preenche a retro nº 4 do plano da 38** com o hash desta etapa | (a) `new Date(str + 'T00:00:00')`: funciona, mas continua criando um `Date` para não usar nenhum campo dele — e é a forma que o próximo "simplifica" de volta para `new Date(str)`; (b) `toLocaleDateString` com `{ timeZone: 'America/Sao_Paulo' }`: acerta hoje e **quebra no dia em que a coluna guardar outro fuso**, além de fingir que uma data-only tem fuso; (c) consertar só a exibição e deixar o export: são a **mesma função**, e o round-trip do Excel é a metade que custa dinheiro |
| **D3** | **A1 — atraso derivado na LEITURA, nunca gravado.** `GET /api/compras/pedidos` ganha, por linha, **`atrasado: 0\|1`** e **`dias_atraso: number\|null`**. Régua: `previsao_entrega IS NOT NULL` **E** `previsao_entrega < hoje_local` **E** `status NOT IN ('recebido','cancelado','rejeitado')`. `hoje_local` vem de **`hojeLocalISO()`** (`pedidoCompraService.js:615`), **exportado** nesta etapa. Filtro opcional **`?atrasados=1`**. `?pendentes=1` da Etapa 37 **NÃO É TOCADO**. **`situacao_recebimento` fica FORA** | (a) **coluna gravada** (`atrasado INTEGER`) + job que atualiza: exige migration, exige varredura de escrita e fica **errada à meia-noite** todo dia; (b) **`date('now')` do SQLite**: é **UTC** — das 21h à meia-noite no fuso do Brasil acusa atraso ~3 h antes (Fase 0 §2, e é o que as 4 varreduras da feature 20 fazem hoje); (c) **`situacao_recebimento` na aba**: a única fonte exportada é `listarPedidosCompraAux`, que **não devolve `previsao_entrega`** (`receiptService.js:1486-1488`) e tem **`LIMIT 50`** (`:1518`) — consumi-la faria a aba divergir da rota core (que não tem limite) e recalcular a derivação criaria **a segunda fórmula de saldo** que o plano da 38 proibiu |
| **D4** | **A1 na tela.** Badge **dentro da célula de `Previsão Entrega`** (`Compras.js:320`), abaixo da data, em **texto vermelho** (`.pedido-atrasado`, ~4 linhas em `Compras.css`) com a literal **`Atrasado há N dia(s)`**. Um **checkbox `Só atrasados`** entra no bloco `.filters` (`:447-472`), **só quando `activeSection === 'pedidos'`** (medição nova 2), e viaja como `params.atrasados` (medição nova 3). **Ordenação inalterada.** O export ganha as colunas **`Atrasado`** (`Sim`/`Não`) e **`Dias de atraso`** | (a) **coluna nova** "Atraso" na tabela: a aba já tem **7** colunas (`Compras.js:299-305`) e a informação é *sobre a previsão* — separá-la em outra coluna afasta a causa do efeito; (b) **linha inteira vermelha**: some sob o `status-badge` colorido que já existe (`:322-327`) e é ilegível em impressão; (c) **biblioteca de badge/ícone**: nenhuma dependência nova por 4 linhas de CSS; (d) **ordenar os atrasados no topo**: mudaria `ORDER BY p.created_at DESC`, que é contrato congelado da extração da 38 (`comprasPedidosRotas.api.test.js`) |
| **D5** | **A2 — UMA entrada no registro existente, sem fila nova.** `PEDIDO_COMPRA_ATRASADO` entra em `ALERT_REGISTRY` (antes do `]);` de `alertRegistry.js:461`), no molde de `REQUISICAO_ATRASADA` (`:301-326`): `chave`, `titulo`, `descricao`, `configDias: null`, `listar`, `dedupeChave` por **id do pedido**, `payload`, `assunto`, `corpo`. Varrida pelo Job B existente (`routes/almoxarifado.js:3791`). **Canal:** a lista única **`alertas_estoque_emails`** (`notificationQueueService.js:590`) — **porque é a única que a varredura lê**, e porque em produção ela é **idêntica** a `compras_notificar_emails`, com `compras2@gmp.ind.br` dentro (Fase 0 §5): o alerta **chega ao setor de Compras sem abrir a matriz evento×destino**, que é corte declarado da feature 19 (B15, `20-alertas/README.md:45`). **Declarado em letra G:** a **lista in-app** (`/almoxarifado/alertas`) **não filtra por tipo** — mostra um cartão por entrada do registro — mas está sob `checkModulePermission('almoxarifado')` (`routes/almoxarifado.js:285`), então **um usuário só de Compras não a vê** (medição nova 8). *Para o Compras, o alerta chega por **e-mail** e pelo **badge da aba Pedidos**; a lista in-app é a do almoxarifado.* Entra também a entrada de **6 linhas** em `COLUNAS_POR_CHAVE` (`AlertasAlmoxarifado.js:88`) para quem **tem** os dois módulos. **INERTE declarado:** com `previsao_entrega` preenchida em **0** pedidos, a varredura roda no vazio — e isso vai no guia do usuário, não só na letra B | (a) **segunda fila de alertas em Compras**: a primeira tem ponto de extensão declarado e entrega dedupe, retry, backoff, claim, histórico e painel de graça; (b) **cron próprio** (`node-schedule`/`node-cron`): a base **não usa cron** — é `setInterval(...).unref()` (`routes/almoxarifado.js:3789-3798`); (c) **`configDias` (`alerta_pedido_atrasado_dias`)**: seria "atrasado há mais de N dias", uma segunda régua **diferente** da da tela — e obrigaria mexer em `ConfiguracoesAlmoxarifado.js` por contrato de teste (`configuracoesGerais.api.test.js:43,92`); quem quiser a janela depois acrescenta **uma** propriedade; (d) **disparo no ato** (`dispararAlertaRegistrado`): atraso não tem "ato" — ninguém clica em "atrasar"; (e) **prefixo `[Almoxarifado]` no assunto**, como as 11 entradas atuais: o documento é de **Compras** e a lista é compartilhada — o prefixo é o que permite o leitor filtrar. Vai **`[Compras]`**, declarado |
| **D6** | **Vocabulário de status: nada muda.** Nenhum status novo; o recebimento **não** passa a marcar `recebido` sozinho. **Limitação assumida e provada por teste (RN-D12):** um pedido **fisicamente recebido por inteiro** mas ainda com `status = 'pendente'` **continua contando como atrasado** até alguém editar o status. O caminho reversível — o processamento da Etapa 37 gravar `status='recebido'` quando `situacao_recebimento` vira `RECEBIDO` — é **fatia da feature 08**, com a suíte da 37 inteira rodada | (a) **usar `situacao_recebimento` na régua de atraso**: a fonte exportada não tem `previsao_entrega` e tem `LIMIT 50` (D3); (b) **escrever `status` a partir do recebimento agora**: viola a decisão 4 da Etapa 37 (`pedidos_compra` **não é escrita** pelo almoxarifado; a situação é **derivada**), protegida pela RN-24 daquela etapa; (c) **excluir mais status da régua** (p.ex. `enviado`): `enviado` é justamente o estado em que o fornecedor **deve** entregar — excluí-lo apagaria o caso principal |
| **D7** | **Correção de spec, visível.** `specs/modulo-almoxarifado/20-alertas/README.md:27` — *"Pedido recebido parcialmente"* está `[ ]` com o motivo `:48` *"falta noção de saldo do pedido"*, e **o motivo caducou**: a Etapa 37 entregou `situacaoRecebimentoPedido` (`receiptService.js:1444-1450`) e **exporta** `listarPedidosCompraAux` (`:1654`). O item **continua fora da 39** (precisa da derivação não-exportada `derivarRecebimentoDoPedido` ou da aux com `LIMIT 50`), mas o fechamento **corrige a spec dizendo que ela estava desatualizada** — literal sugerida: *"dizia bloqueado por falta de dado; **estava desatualizado** — o dado chegou na Etapa 37 (situação) e na 38 (previsão validada). O que falta agora é a porta: a fonte exportada tem `LIMIT 50` e não devolve `previsao_entrega` — fatia da feature 08"* | **apagar em silêncio** a frase errada (é o erro que o `CLAUDE.md` nomeia como o mais caro: já aconteceu duas vezes, e a 07 fez o próximo confiar de novo); e **entregar o alerta parcial aqui** para "aproveitar a viagem": herdaria o `LIMIT 50` — um alerta que vê **no máximo 50 pedidos** e não diz que parou de ver os outros |
| **D8** | **Autorização: nada novo.** As rotas de `/api/compras/*` tocadas herdam **só** `authenticateToken` + `checkModulePermission('compras')` (B101 da Etapa 38) — é **campo derivado numa rota que já existe**, não porta nova. O **gerador do alerta roda no contexto do Job B**, sem usuário: não há `req.user`, e portanto **não há e não pode haver** `requirePermission` no caminho. **Nada muda em `ACAO_PERFIS`** | (a) **`requirePermission` no core**: inventaria a camada que o módulo Compras não tem, numa etapa que não decide os perfis dele (etapa própria, declarada desde a 38); (b) **gatear o gerador por perfil**: um job não tem usuário — o gate seria decorativo; (c) **esconder o badge de quem não tem `ver_alertas`**: o dado já vem na resposta da rota que a pessoa **pode** chamar — esconder na tela seria segurança de fachada |
| **D9** | **Testes: 2 arquivos de API novos, 1 de client novo, 1 de client estendido.** `server/tests/api/comprasPedidoAtraso.api.test.js` (rota), `server/tests/api/alertaPedidoAtrasado.api.test.js` (gerador, no molde de `alertaRegistro.api.test.js`), `client/src/components/Compras.test.js` (**criado nesta etapa** — o componente não tem um) e `PedidoCompraForm.test.js` ganha o cenário do `hojeISO` local. ⚠️ **DIVERGÊNCIA DECLARADA DO ESCOPO DO CONTROLADOR:** o escopo mandava o teste de client *"setar `process.env.TZ` ou usar um formatador fixo". **O primeiro não funciona e a própria base já mediu isso**: `client/jest.globalSetup.js` registra que a atribuição em runtime é **no-op** quando o processo já tem `TZ` — e resolve o problema **globalmente**, fixando `America/Sao_Paulo` antes de o Jest forkar os workers (medição nova 1). Então: **os testes de client NÃO setam `TZ`; eles herdam o fuso e afirmam um CONTROLE POSITIVO** de que o fuso é mesmo -03 (`new Date('2026-09-16').toLocaleDateString('pt-BR') === '15/09/2026'`), com mensagem de falha que diz o que está errado | (a) `process.env.TZ` no topo do arquivo de teste (**medido como no-op** nesta base, achado A1 da Etapa 22); (b) um formatador injetado só para o teste: provaria o formatador, não a tela; (c) `jest.useFakeTimers` para as datas de **exibição**: a régua de exibição não depende do relógio — só a do formulário depende, e **lá** os fake timers entram |
| **D10** | **Uma task de INTEGRAÇÃO cruzando rota + job**, `comprasPedidoAtrasoIntegracao.api.test.js`: criar pedido com `previsao_entrega` = ontem **pelo serviço real** → `GET /api/compras/pedidos` traz `atrasado:1, dias_atraso:1` → rodar o gerador → **uma** linha na fila → **receber** pelas portas da Etapa 37 **não muda** `atrasado` (a limitação D6, **provada**, não afirmada) → `PUT` com `status:'recebido'` → `atrasado:0` e a varredura **não emite nada novo** | provar cada perna em arquivo separado e chamar isso de integração: o valor está na **sequência**, e é ela que mostra que a limitação D6 é limitação e não bug |

---

## 4. Regras de negócio — `RN-D01…RN-D14`

> **Sobre o prefixo, e a divergência fica escrita.** A Etapa 38 abriu a série **`RN-C…`** com o
> argumento de que **`C` é de Compras** e que `grep RN-C` acha a fatia do módulo inteira
> (design da 38, seção "Regras de negócio"). O escopo desta etapa pediu **`RN-D…`**, e é o que está
> escrito aqui. **Custo declarado:** o mesmo módulo passa a ter dois prefixos, e `grep RN-C` deixa
> de achar tudo. **Reversível:** se o controlador preferir, o fechamento renumera `RN-D01…RN-D14`
> como `RN-C15…RN-C28` com um `sed` e um aviso no doc de novidades — nada além dos nomes muda.
> **Leitura curta para quem chegar depois:** `C` = Compras (módulo), `D` = a série da Etapa 39
> (acompanhamento). Quem quiser as duas de uma vez: `grep -E "RN-[CD][0-9]"`.

### A0 — as datas

- **RN-D01 — a data é formatada a partir da STRING, nunca por `new Date`.**
  *Cenário (client):* um pedido com `previsao_entrega: '2026-09-16'` e `data_pedido: '2026-09-10'`
  na aba Pedidos, com a suíte no fuso `America/Sao_Paulo` → o DOM contém **`16/09/2026`** e
  **`10/09/2026`**, e **não contém** `15/09/2026` nem `09/09/2026`.
  **Controle positivo no MESMO cenário, e é ele que impede o verde vazio:**
  `new Date('2026-09-16').toLocaleDateString('pt-BR')` é afirmado como **`'15/09/2026'`** — se esta
  linha cair, o fuso do processo não é -03 e o cenário **não prova nada**; a mensagem de falha diz
  exatamente isso.
  *Valores fora do contrato:* `null`/`''`/`undefined` → **`'-'`** (comportamento de hoje,
  `Compras.js:92`, preservado). Valor com hora (`created_at` dos fornecedores,
  `'2026-09-16 10:33:00'`) → os **10 primeiros caracteres** são formatados (`16/09/2026`). Valor que
  **não casa** `^\d{4}-\d{2}-\d{2}` → devolvido **como veio**, sem `new Date`.
- **RN-D02 — a exportação usa a MESMA régua, e o round-trip para de mover a data.**
  *Cenário (client):* exportar a aba Pedidos com `data_pedido: '2026-09-10'` e
  `previsao_entrega: '2026-09-25'` → a linha entregue a `exportToExcel` tem
  **`'Data': '10/09/2026'`** e **`'Previsão Entrega': '25/09/2026'`**. *Metade que mede o dano:* é
  **exatamente** a grafia `DD/MM/AAAA` que `pedidoCompraService.js:604-605,639-658` reimporta — a
  promessa do F6 da 38 (`ba6278e`) passa a valer **no valor**, não só na estrutura.
- **RN-D03 — o formulário nasce com a data de HOJE no fuso de quem clica.**
  *Cenário (client, `PedidoCompraForm.test.js`):* relógio fixo em **23:30 local** de `2026-09-16`
  (`jest.useFakeTimers().setSystemTime(new Date(2026, 8, 16, 23, 30))` — construtor **local**) →
  `/compras/pedidos/novo` nasce com o campo de data valendo **`2026-09-16`**.
  *Controle positivo no mesmo cenário:* `new Date(2026, 8, 16, 23, 30).toISOString().slice(0,10)` é
  afirmado como **`'2026-09-17'`** — a prova de que o fuso está aplicado e de que a implementação
  antiga **erraria**. Sem essa linha, num worker em UTC o cenário passaria com o bug no lugar.

### A1 — o atraso na leitura

- **RN-D04 — `atrasado` e `dias_atraso` são DERIVADOS na resposta, e nada é gravado.**
  *Cenário (API):* pedido com `previsao_entrega` = **ontem** e `status='pendente'` →
  `GET /api/compras/pedidos` → o objeto dele traz **`atrasado: 1`** e **`dias_atraso: 1`**.
  *Metade que mede o dano:* `SELECT * FROM pedidos_compra WHERE id = ?` depois da chamada **não tem
  coluna `atrasado`** e `updated_at` **não mudou** — leitura não escreve.
  *Aritmética:* `dias_atraso` é a diferença **em dias inteiros** entre `hoje` e `previsao_entrega`,
  calculada por `Date.UTC(a,m-1,d)` nas duas pontas (**independente de fuso**, porque as duas são
  data-only). 3 dias → `3`.
- **RN-D05 — as quatro exclusões da régua, cada uma com o seu cenário, e a fronteira é HOJE.**
  *(a)* `previsao_entrega` **`null`** → `atrasado: 0, dias_atraso: null` (**nunca** atrasa — pedido
  sem prazo prometido não tem prazo a quebrar).
  *(b)* `previsao_entrega` **= hoje** → `atrasado: 0` — *"vence hoje" não está atrasado* (é a mesma
  fronteira do precedente `FerramentasAlmoxarifado.js:424`, `<` e não `<=`).
  *(c)* `previsao_entrega` **= amanhã** → `atrasado: 0`.
  *(d)* `previsao_entrega` = ontem com `status` em **`recebido`**, **`cancelado`** e **`rejeitado`**
  → `atrasado: 0` nos **três** (um `test()` por status, não um só).
  *Metade positiva no mesmo arquivo:* os **quatro** status restantes do enum — `pendente`,
  `aprovado`, `em_analise`, `enviado` (`schemas.js:60`) — com previsão de ontem → `atrasado: 1` nos
  quatro. Sem essa metade, `NOT IN ('%')` passaria em tudo.
- **RN-D06 — `?atrasados=1` filtra, e não mexe em mais nada.**
  *Cenário (API):* três pedidos (um atrasado, um no prazo, um sem previsão) →
  `GET /api/compras/pedidos` devolve **3**; `?atrasados=1` devolve **1**, o atrasado;
  `?atrasados=0` e `?atrasados=` devolvem **3** (só o valor `'1'` liga o filtro).
  `?atrasados=1&status=pendente` compõe com o filtro de status **e** com `?search=`.
  *A asserção que guarda o contrato da 38:* `ORDER BY p.created_at DESC` continua, e
  `GET /almoxarifado/recebimentos-aux/pedidos-compra?pendentes=1` responde **exatamente o mesmo**
  antes e depois — **`?pendentes=1` é NÃO-TOQUE**.
- **RN-D07 — o comprador VÊ o atraso e consegue filtrar por ele.**
  *Cenário (client):* a lista com um pedido `atrasado: 1, dias_atraso: 3` mostra
  **`Atrasado há 3 dias`** na célula de previsão; com `dias_atraso: 1`, mostra
  **`Atrasado há 1 dia`** (singular — a literal do contrato é `Atrasado há N dia(s)` **resolvida**,
  não impressa com o parêntese). Um pedido `atrasado: 0` **não** mostra a frase.
  Marcar o checkbox **`Só atrasados`** dispara **um** `api.get('/compras/pedidos', …)` com
  `params.atrasados === 1`; desmarcar dispara outro **sem** a chave.
  *Metade que mede o dano:* na aba **Fornecedores** o checkbox **não é renderizado**
  (`activeSection === 'pedidos'`, medição nova 2) e `api.get('/compras/fornecedores', …)` **nunca**
  recebe `atrasados`.
- **RN-D08 — o export ganha duas colunas, e a importação as ignora.**
  *Cenário (client):* exportar a aba Pedidos com um pedido `atrasado: 1, dias_atraso: 3` → a linha
  tem **`'Atrasado': 'Sim'`** e **`'Dias de atraso': 3`** (`typeof === 'number'`); com
  `atrasado: 0` → **`'Atrasado': 'Não'`** e **`'Dias de atraso': ''`**.
  As colunas da RN-C10/RN-C11 da Etapa 38 (`Número`, `Código`, `Quantidade`, `Valor Unitário`)
  **continuam idênticas** — a asserção do cenário `(p)` de `PedidoCompraForm.test.js:785` **não
  pode** cair. *E declarado:* a importação lê por **grafia conhecida de cabeçalho**
  (`pedidoCompraService.js`, contrato 5) — colunas desconhecidas são ignoradas, como já acontece com
  `Status` e `Valor Total`.

### A2 — o alerta

- **RN-D09 — o gerador emite UM alerta por pedido atrasado, e nenhum para os demais.**
  *Cenário (API):* cinco pedidos — atrasado/`pendente`, no prazo, sem previsão,
  atrasado/`recebido`, atrasado/`cancelado` → `varrerAlertasRegistrados(db)` → a fila
  (`fila_notificacoes_almoxarifado`) tem **exatamente 1** linha com `evento =
  'PEDIDO_COMPRA_ATRASADO'`, e o `payload` dela aponta para o id do **primeiro**.
  ⚠️ **A asserção filtra a fila por `evento`, NUNCA por total global** — é a nota de cabeçalho de
  `alertaRegistro.api.test.js:6-8`: materiais semeados sem movimentação caem automaticamente em
  `ESTOQUE_SEM_CONSUMO` e um total global mediria outro alerta.
- **RN-D10 — dedupe por PEDIDO: varrer duas vezes não manda dois e-mails.**
  *Cenário (API):* rodar `varrerAlertasRegistrados` **duas** vezes seguidas → a segunda devolve
  `{ chave: 'PEDIDO_COMPRA_ATRASADO', enfileiradas: 0, duplicadas: 1 }` e a contagem da fila
  **não muda**. O hash é `sha256('PEDIDO_COMPRA_ATRASADO|pedido-atrasado-<id>')`
  (`notificationQueueService.js:41-43`, `INSERT OR IGNORE` em `:70-80`).
  **Consequência declarada, igual à do gêmeo `REQUISICAO_ATRASADA`:** é **um aviso por pedido, para
  sempre** — o pedido que segue atrasado **não** é relembrado. Quem quiser re-lembrete mensal troca
  o `dedupeChave` para incluir o mês, como `LOTE_SEM_CERTIFICADO` faz (`alertRegistry.js:452`).
- **RN-D11 — a régua do alerta e a régua da tela são A MESMA, e o teste prova.**
  *Cenário (API):* para o mesmo conjunto de pedidos, o conjunto de ids com `atrasado === 1` em
  `GET /api/compras/pedidos` é **igual** ao conjunto de ids que o `listar` da entrada devolve
  (`deepStrictEqual` dos ids ordenados). *Metade que mede o dano:* incluir no conjunto um pedido
  `status='rejeitado'` com previsão vencida — se alguém escrever a lista de status duas vezes e
  errar uma, **este é o cenário que cai**.
- **RN-D12 — a limitação do D6, PROVADA em vez de afirmada.**
  *Cenário (integração):* pedido de 10 com previsão de **ontem**, recebido **por inteiro** pelas
  portas da Etapa 37 (`POST /almoxarifado/recebimentos` + processar) → a aux diz
  `situacao_recebimento: 'RECEBIDO'`, **e** `GET /api/compras/pedidos` continua dizendo
  **`atrasado: 1`**, porque `status` ainda é `pendente`. `PUT /api/compras/pedidos/:id` com
  `status: 'recebido'` → **`atrasado: 0`**, e a varredura seguinte **não** enfileira nada novo.
  *Este cenário é a limitação declarada virando régua:* se um dia a feature 08 fizer o recebimento
  gravar `status`, é **ele** que cai e avisa que a limitação acabou.

  > ⚠️ **(corrigido na Fase 2) A segunda metade deste cenário está ERRADA: esse `PUT` não passa.**
  > Medido: `atualizarPedido` (`server/services/compras/pedidoCompraService.js:425-431`) lança
  > **400** `'Pedido de compra <numero> já teve recebimento — não pode mais ser editado'` (literal em
  > `:180`) quando há **linha com recebimento** *ou* **documento de recebimento vinculado** — a
  > RN-C07 da Etapa 38. O pedido deste cenário acabou de ser recebido por inteiro pelas portas da 37,
  > portanto **ele é precisamente o pedido que não pode ter o `status` editado**.
  >
  > **O que isto significa, e é limitação de produto, não detalhe de teste:** um pedido recebido
  > fica **atrasado para sempre** — `dias_atraso` cresce sem teto, ele aparece em toda listagem
  > `?atrasados=1`, o cartão da central continua de pé, e **nenhum gesto de tela apaga o badge**. O
  > texto `Atrasado há N dias` promete um estado transitório e entrega um estado permanente.
  >
  > **Correção do cenário (o plano já a incorporou no BLOCO E, passos 9a/9b):** o pedido recebido é
  > afirmado com o **400** e com `atrasado: 1` que não muda (é ele quem prova "para sempre"); a
  > metade positiva do `PUT → atrasado: 0` usa um **segundo** pedido, atrasado e **sem** recebimento.
  > **Correção da frase de usuário (D6, seção 9 e manual):** não mandar "mude o status na tela de
  > edição" — dizer que, uma vez recebido, o pedido não é mais editável, e que o comprador deve
  > marcar `recebido` **antes** da entrada no almoxarifado. **Caminho reversível, fatia da feature
  > 08:** liberar `status` no `PUT` mesmo com recebimento, ou o `processar` da 37 gravar o status.

### Transversais

- **RN-D13 — autorização: o campo derivado herda o gate da rota, e o job não tem usuário.**
  *Cenário (API):* `GET /api/compras/pedidos?atrasados=1` **sem token** → **401**; com token e
  **sem** o módulo `compras` → **403**; com o módulo → **200** com os campos novos, **qualquer que
  seja o perfil do almoxarifado** (inclusive o `PRODUCAO` do fallback de `getPerfilFromUser`) —
  porque o core Compras tem **uma** camada (B101).
  > ⚠️ **(corrigido na Fase 2) O 403 "sem o módulo" NÃO é exercitável, e esta RN não pode pedi-lo.**
  > Medido: `server/tests/helpers/testApp.js` monta o registrador de Compras com
  > `const fakeCheckModulePermission = () => (req, res, next) => next();` — o gate de módulo está
  > **liberado no harness de propósito** (só a camada 3, `requirePermission`, roda o código real).
  > Um cenário que afirmasse 403 ou **não existe** ou **passa por acidente**. A RN-D13 exercita
  > **401 sem token** e **200 com o módulo, qualquer que seja o perfil**, e a linha do 403 fica
  > escrita como **nota** no arquivo de teste, dizendo por que não há cenário — que é como o plano
  > (cenário (9) da T1) já a escreveu. A tabela de 7.1, linha (9), lê-se da mesma forma.
  *Metade que fecha o outro lado:* o `listar` da
  entrada do registro é chamado por `varrerAlertasRegistrados(db)` **sem `req`**, e o teste o chama
  assim — se alguém acrescentar `req.user` ali, **o teste cai** com `undefined`.
- **RN-D14 — o ciclo inteiro, pela ROTA e pelo JOB (o aceite da etapa).**
  *Cenário (integração, D10):* criar pedido com `previsao_entrega` = ontem **pelo serviço real**
  (`pedidoCompraService.criarPedido`, nunca `INSERT` direto) → `GET /api/compras/pedidos` →
  `atrasado: 1, dias_atraso: 1` → `?atrasados=1` traz **ele e só ele** → `varrerAlertasRegistrados`
  → **1** linha na fila com `evento='PEDIDO_COMPRA_ATRASADO'`, assunto contendo o `numero` →
  receber pelas portas da 37 **não** muda `atrasado` (RN-D12) → `PUT` com `status:'recebido'` →
  `atrasado: 0` → varredura de novo → **nenhuma linha nova** (a que existe continua lá: fila é
  histórico, não estado).

---

## 5. Contratos congelados

### 5.1 `GET /api/compras/pedidos` — **campos acrescentados, nada removido**

| Item | Antes (Etapa 38) | Depois (Etapa 39) |
|---|---|---|
| Método / caminho | `GET /api/compras/pedidos` | **inalterado** |
| Gate | `authenticateToken` + `checkModulePermission('compras')` (`routes/compras.js:111`) | **inalterado** (D8) |
| Query | `search`, `status` | `search`, `status`, **`atrasados`** |
| Ordenação | `ORDER BY p.created_at DESC` (`:129`) | **inalterada** |
| `LIMIT` | não tem | **continua sem** |
| Resposta | `[ { …pedidos_compra.*, fornecedor_nome } ]` | `[ { …pedidos_compra.*, fornecedor_nome, **atrasado**, **dias_atraso** } ]` |
| Erros | `500 { error: <msg> }`; 401 sem token; 403 sem módulo | **inalterados** |

- **`atrasado`**: `0` ou `1` (número, nunca booleano — espelha o `ativo`/`evento` do resto da base).
- **`dias_atraso`**: inteiro **positivo** quando `atrasado === 1`; **`null`** quando `atrasado === 0`
  (nunca `0`, nunca negativo — "0 dias de atraso" e "não atrasado" não podem ser o mesmo valor).
- **`atrasados`**: só a string **`'1'`** liga o filtro. Ausente, `''`, `'0'` ou qualquer outra coisa
  = sem filtro. Compõe com `search` e `status`.
- **Aditivo por construção:** `comprasPedidosRotas.api.test.js` lê a resposta **por nome de campo**
  e o cabeçalho dele (`:29`) declara que campo a mais não derruba asserção. **Nenhum teste da 38
  pode cair.**

### 5.2 A régua de atraso — **uma função, um lugar** (`server/services/compras/pedidoCompraService.js`)

```js
// A régua ÚNICA de atraso do sistema. Dois consumidores: a rota GET /api/compras/pedidos e a
// entrada PEDIDO_COMPRA_ATRASADO do alertRegistry. Escrever a lista de status duas vezes é o
// erro que a RN-D11 existe para pegar.
const STATUS_PEDIDO_FORA_DO_ATRASO = ['recebido', 'cancelado', 'rejeitado'];

/** { atrasado: 0|1, dias_atraso: number|null } — `hoje` é `AAAA-MM-DD` LOCAL. */
function derivarAtraso(pedido, hoje = hojeLocalISO()) { … }

module.exports = { …, hojeLocalISO, derivarAtraso, STATUS_PEDIDO_FORA_DO_ATRASO };
```

- `hojeLocalISO()` (`pedidoCompraService.js:615-620`) **passa a ser exportada** — hoje é interna
  (`module.exports` em `:885-900`). Ela é a função que o próprio arquivo documenta como *"NAO e
  `new Date().toISOString()` e nao e o `date('now')` do SQLite: os dois dao **UTC**"*.
- `dias_atraso` = `(Date.UTC(hoje) - Date.UTC(previsao)) / 86400000`, **inteiro**. Usar `Date.UTC`
  nas **duas** pontas torna a subtração independente de fuso — as duas são data-only, e é a única
  aritmética de datas desta etapa.
- **A rota deriva em JS**, mapeando as linhas e filtrando o array quando `atrasados === '1'`. A
  query SQL **não muda** (nem `SELECT`, nem `WHERE`, nem `ORDER BY`). **Descartado:** `CASE WHEN …`
  no `SELECT` — obrigaria repetir os `?` da condição em duas posições do texto SQL, com a ordem
  posicional dos binds virando contrato implícito.

### 5.3 A entrada do registro de alertas (`server/services/almoxarifado/alertRegistry.js`, antes do `]);` de `:461`)

```js
{
  chave: 'PEDIDO_COMPRA_ATRASADO',
  titulo: 'Pedido de compra atrasado',
  descricao: 'Pedidos de compra com previsão de entrega vencida e ainda não recebidos.',
  configDias: null,
  // Regua UNICA, importada do modulo Compras (services/compras/pedidoCompraService): a tela e o
  // alerta nao podem ter duas definicoes de "atrasado" (RN-D11). O SQL so PRE-FILTRA pelo unico
  // termo que ja e da propria regua (`previsao_entrega IS NOT NULL`) — e um SUPERCONJUNTO, nao
  // uma segunda formula: quem decide linha a linha e o `derivarAtraso`.
  // ⚠️ CONSULTA CROSS-MODULO: `pedidos_compra`/`fornecedores` sao tabelas CORE (index.js:19230),
  // e as 11 entradas anteriores so leem tabelas `*_almoxarifado`. Mesmo handle, mesmo arquivo
  // SQLite; decisao de arquitetura declarada na letra B.
  // ⚠️ REQUIRE **LAZY**, e nao e estilo: `pedidoCompraService` requer `purchaseService` no TOPO
  // (`pedidoCompraService.js:109`) e `purchaseService` requer `notificationQueueService` no topo —
  // que requer ESTE arquivo. Um require de topo aqui fecharia o ciclo
  // alertRegistry -> pedidoCompraService -> purchaseService -> notificationQueueService ->
  // alertRegistry, e um dos lados capturaria `{}` mid-load. E exatamente o motivo ja escrito no
  // cabecalho deste arquivo (`alertRegistry.js:9-13`) para os requires de purchaseService/
  // inspectionService/toolService.
  listar: async (db) => {
    const { hojeLocalISO, derivarAtraso } = require('../compras/pedidoCompraService');
    const hoje = hojeLocalISO();
    const linhas = await dbAll(db, `
      SELECT p.*, f.razao_social AS fornecedor_nome
      FROM pedidos_compra p
      LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
      WHERE p.previsao_entrega IS NOT NULL
      ORDER BY p.previsao_entrega ASC`);
    return linhas
      .map((l) => ({ ...l, ...derivarAtraso(l, hoje) }))
      .filter((l) => l.atrasado === 1);
  },
  dedupeChave: (linha) => `pedido-atrasado-${linha.id}`,
  payload: (linha) => ({ pedido_compra_id: linha.id, dias_atraso: linha.dias_atraso }),
  assunto: (linha) => `[Compras] Pedido de compra atrasado — ${linha.numero}`,
  corpo: (linha) => [
    `Pedido: ${linha.numero}`,
    `Fornecedor: ${linha.fornecedor_nome || '-'}`,
    `Previsão de entrega: ${linha.previsao_entrega}`,
    `Atraso: ${linha.dias_atraso} dia(s)`,
    `Status: ${linha.status}`,
  ].join('\n'),
}
```

**O que essa única entrada liga, sem mais nenhuma linha em lugar nenhum** (`alertRegistry.js:6-7`):

| Consumidor | Onde | O que acontece |
|---|---|---|
| Varredura diária | `routes/almoxarifado.js:3791` → `notificationQueueService.js:579-627` | e-mail enfileirado com dedupe `INSERT OR IGNORE`, retry/backoff, claim |
| Central in-app | `alertRegistry.js:480-500` → `routes/almoxarifado/extended.js:1859-1863` | um cartão a mais, avaliado ao vivo, cortado em `LIMITE_LINHAS_CENTRAL = 50` (`:464`) |
| Disparo no ato | `notificationQueueService.js:645-667` | **não usado** (D5) — atraso não tem ato |

**Destinatário:** `alertas_estoque_emails` (`notificationQueueService.js:590`), a lista única da
varredura. **Toggle mestre:** `alertasEmailLigado` (`:584`) — com e-mail desligado, a entrada
devolve `{ motivo: 'email desligado' }` como as outras 11.

**Central (opcional, entregue):** `COLUNAS_POR_CHAVE` (`AlertasAlmoxarifado.js:88`) ganha
`PEDIDO_COMPRA_ATRASADO: [Pedido, Fornecedor, Previsão, Dias de atraso]`. Sem isso o cartão ainda
aparece — `colunasGenericas` (`:182-193`) é o fallback declarado —, mas mostraria `id`,
`fornecedor_id` e `valor_total` crus.

### 5.4 As colunas da exportação (`client/src/components/Compras.js`, `linhaExportPedido` `:151-163`)

Ordem final, **as 11 existentes intactas + 2 no fim**:

`Número` · `Fornecedor` · `Código` · `Descrição` · `Unidade` · `Quantidade` · `Valor Unitário` ·
`Valor Total` · `Status` · `Data` · `Previsão Entrega` · **`Atrasado`** · **`Dias de atraso`**

- `Atrasado`: **`'Sim'`** / **`'Não'`** (texto — é coluna de leitura humana, como `Status`).
- `Dias de atraso`: **número** quando atrasado, **`''`** quando não (nunca `0`, nunca `'-'`).
- Uma linha por **item** (contrato do F6 da 38): os dois campos são do **cabeçalho** e se repetem em
  todas as linhas do mesmo pedido. Declarado.

---

## 6. Telas — o que o usuário vê, com as literais

### 6.1 Aba "Pedidos de Compra" (`/compras/pedidos`)

**Antes → Agora**

| Antes | Agora |
|---|---|
| `Previsão Entrega: 15/09/2026` (um dia **antes** do que está no banco) | `Previsão Entrega: 16/09/2026` (o dia que está no banco) |
| um pedido vencido é **indistinguível** de um no prazo | abaixo da data, em vermelho: **`Atrasado há 3 dias`** |
| não há como listar só os vencidos | checkbox **`Só atrasados`** ao lado do filtro de status |
| o Excel exportado volta com as datas um dia atrás | o Excel exportado **se reimporta com as mesmas datas**, e traz `Atrasado` e `Dias de atraso` |

**Literais congeladas** (exatamente estas, e é por elas que os testes procuram):

| Onde | Literal |
|---|---|
| Badge na célula de previsão, `dias_atraso >= 2` | `Atrasado há {N} dias` |
| Badge, `dias_atraso === 1` | `Atrasado há 1 dia` |
| Rótulo do checkbox | `Só atrasados` |
| Cabeçalho de coluna do Excel | `Atrasado` |
| Cabeçalho de coluna do Excel | `Dias de atraso` |
| Valores da coluna `Atrasado` | `Sim` / `Não` |

**Forma:** o badge é **texto vermelho** (`.pedido-atrasado { color: #e74c3c; font-weight: 600;
font-size: .78rem; display: block; }` em `Compras.css` — o mesmo `#e74c3c` que
`getStatusColor` já usa para `rejeitado`/`cancelado`, `Compras.js:102,106`). **Nenhuma biblioteca
nova, nenhum ícone novo.** A coluna `Ações` e as outras seis **não mudam**.

**O checkbox** entra no `<div className="filters">` (`Compras.js:447-472`), depois do
`.filter-group` do status, **renderizado só na aba Pedidos**, e entra em
`useEffect(..., [activeSection, search, filterStatus, soAtrasados])` (`:49-51`).

### 6.2 Central de alertas do almoxarifado (`/almoxarifado/alertas`)

Um **cartão novo**, `Pedido de compra atrasado`, com as colunas `Pedido · Fornecedor · Previsão ·
Dias de atraso`. **Quem vê:** quem tem o módulo `almoxarifado` **e** `ver_alertas`
(ADMINISTRADOR, ALMOXARIFE, GESTOR, COMPRAS — `permissions.js:149`).
**Quem NÃO vê:** o usuário que tem **só** o módulo `compras` — o `app.use` de
`routes/almoxarifado.js:285` responde **403** antes do handler. Para ele, o alerta chega por
**e-mail** (lista `alertas_estoque_emails`, que em produção contém `compras2@gmp.ind.br`) e pelo
**badge da aba Pedidos**. Está na letra G e no guia do usuário, em linguagem de usuário.

### 6.3 E-mail

```
Assunto: [Compras] Pedido de compra atrasado — PC-2026-418

Pedido: PC-2026-418
Fornecedor: Aços Vale Ltda
Previsão de entrega: 2026-09-10
Atraso: 6 dia(s)
Status: pendente
```

Uma mensagem **por pedido**, **uma vez** (RN-D10). Corpo HTML gerado pelo escape linha a linha da
RN-04 da Etapa 12 (`notificationQueueService.js:598-624`).

---

## 7. Testes — arquivos e cenários

> Convenção obrigatória: o runner descobre **apenas** `server/tests/api/*.api.test.js`; cada arquivo
> tem runner próprio (`test()`, contador, `process.exit`). O harness é
> `server/tests/helpers/testApp.js`, roda o `requirePermission` **real**, e **já monta o registrador
> de Compras** (`:140`) e a tabela `pedidos_compra` (`:100-111`) — medição nova 5.

### 7.1 `server/tests/api/comprasPedidoAtraso.api.test.js` (novo) — a rota

As datas dos fixtures são calculadas **a partir do mesmo `hojeLocalISO()`** que a rota usa (`hoje`,
`hoje-1`, `hoje-3`, `hoje+1`), **nunca** literais fixas: um arquivo com `'2026-09-15'` escrito à mão
vira falso-verde ou falso-vermelho no dia seguinte.

| # | Cenário | Asserção que mede o dano |
|---|---|---|
| (1) | previsão = ontem, `pendente` | `atrasado === 1`, `dias_atraso === 1`, e `SELECT *` do banco **sem** coluna `atrasado` e `updated_at` intacto (RN-D04) |
| (2) | previsão = **hoje** | `atrasado === 0` — a fronteira; com `<=` no lugar de `<`, cai |
| (3) | previsão = amanhã | `atrasado === 0` |
| (4) | `previsao_entrega` **NULL** | `atrasado === 0`, `dias_atraso === null` |
| (5) | previsão = ontem × **`recebido`**, **`cancelado`**, **`rejeitado`** | os três com `atrasado === 0` |
| (6) | previsão = ontem × `pendente`, `aprovado`, `em_analise`, `enviado` | os quatro com `atrasado === 1` (**metade positiva** do (5)) |
| (7) | previsão = `hoje-3` | `dias_atraso === 3` (aritmética) |
| (8) | `?atrasados=1`, `?atrasados=0`, `?atrasados=` e composição com `?status=` e `?search=` | contagens exatas (RN-D06) |
| (9) | sem token → **401**; com token e sem o módulo → **403**; com módulo → **200** | RN-D13 |
| (10) | `GET /almoxarifado/recebimentos-aux/pedidos-compra?pendentes=1` antes e depois | corpo **idêntico** — `?pendentes=1` é NÃO-TOQUE |

**Controle positivo obrigatório (o CLAUDE.md nomeia este risco):** antes de declarar a task pronta,
**sabotar `derivarAtraso` trocando `<` por `>`** e conferir que os cenários (1), (2) e (6) caem —
com `grep -cF` da âncora contado **depois** do conserto e `md5sum` antes/depois/depois-de-restaurar.

### 7.2 `server/tests/api/alertaPedidoAtrasado.api.test.js` (novo) — o gerador

**Molde:** `server/tests/api/alertaRegistro.api.test.js` — helpers `hashDedupe(evento, chave)`
(`:28-30`), `diasAtras`/`diasAFrente` (`:32-37`) e a nota de cabeçalho (`:6-8`) que obriga **filtrar
a fila por `evento`**. **Arquivo novo e não cenário acrescentado lá**, declarado: `alertaRegistro`
é o contrato da Etapa 16 e semeia materiais que caem sozinhos em `ESTOQUE_SEM_CONSUMO`.

| # | Cenário | Asserção |
|---|---|---|
| (1) | 5 pedidos (atrasado/`pendente`, no prazo, sem previsão, atrasado/`recebido`, atrasado/`cancelado`) → `varrerAlertasRegistrados(db)` | **exatamente 1** linha na fila com `evento='PEDIDO_COMPRA_ATRASADO'`, e o `payload.pedido_compra_id` é o do primeiro (RN-D09) |
| (2) | mesma varredura, **segunda vez** | `{ enfileiradas: 0, duplicadas: 1 }` e a fila não cresce; hash confere com `sha256('PEDIDO_COMPRA_ATRASADO\|pedido-atrasado-<id>')` (RN-D10) |
| (3) | assunto e corpo da linha enfileirada | contêm `numero`, `fornecedor_nome`, `previsao_entrega` e `Atraso: N dia(s)` |
| (4) | `montarCentral(db)` | há um cartão `PEDIDO_COMPRA_ATRASADO` com `total: 1` — a central e a varredura leem o **mesmo** `listar` (RN-01 da Etapa 16) |
| (5) | **régua única**: ids de `atrasado===1` na rota × ids do `listar` | `deepStrictEqual` dos ids ordenados, com um `rejeitado` vencido no conjunto (RN-D11) |
| (6) | e-mail **desligado** (`alertas_estoque_emails` vazio / toggle off) | `motivo: 'email desligado'` ou `sem_destinatario: 1`, e **nenhum** e-mail — o comportamento das outras 11 |
| (7) | `entrada.listar(db, { dias: null })` chamado **sem `req`** | não lança (RN-D13, segunda metade) |

### 7.3 `client/src/components/Compras.test.js` (**criado nesta etapa** — o componente nunca teve um)

Molde: `client/src/components/compras/PedidoCompraForm.test.js` (mock de `api` com **fallback que
rejeita**, mock de `exportToExcel`, helper `texto()` que normaliza NBSP, render por `AppRoutes` +
`MemoryRouter`). **NÃO seta `process.env.TZ`** — herda `America/Sao_Paulo` de
`client/jest.globalSetup.js` (medição nova 1, decisão 9).

| # | Cenário | Asserção |
|---|---|---|
| (a) | **regressão da data** — `previsao_entrega: '2026-09-16'`, `data_pedido: '2026-09-10'` | DOM contém `16/09/2026` e `10/09/2026`; **não** contém `15/09/2026` nem `09/09/2026`. **Controle positivo:** `new Date('2026-09-16').toLocaleDateString('pt-BR') === '15/09/2026'`, com mensagem de falha dizendo "o fuso do processo não é -03; este cenário não prova nada" (RN-D01) |
| (b) | `previsao_entrega: null` e `data_pedido: ''` | as células mostram `-` |
| (c) | `atrasado: 1, dias_atraso: 3` | DOM contém `Atrasado há 3 dias` |
| (d) | `atrasado: 1, dias_atraso: 1` | DOM contém `Atrasado há 1 dia` (singular) |
| (e) | `atrasado: 0` | DOM **não** contém `Atrasado há` |
| (f) | marcar `Só atrasados` | um `api.get('/compras/pedidos', …)` com `params.atrasados === 1`; desmarcar → outro **sem** a chave (RN-D07) |
| (g) | aba **Fornecedores** | o checkbox `Só atrasados` **não está no DOM**, e `api.get('/compras/fornecedores', …)` nunca recebe `atrasados` |
| (h) | exportar com `atrasado: 1, dias_atraso: 3` | linha com `'Data': '10/09/2026'`, `'Previsão Entrega': '25/09/2026'`, `'Atrasado': 'Sim'`, `'Dias de atraso': 3` (`typeof 'number'`) (RN-D02, RN-D08) |
| (i) | exportar com `atrasado: 0` | `'Atrasado': 'Não'`, `'Dias de atraso': ''` |

### 7.4 `client/src/components/compras/PedidoCompraForm.test.js` (estendido)

Um cenário: **(q) o formulário nasce com a data local, não com a de amanhã** — relógio fixo em
`new Date(2026, 8, 16, 23, 30)` (construtor local), campo de data = `2026-09-16`, e o controle
positivo `new Date(2026, 8, 16, 23, 30).toISOString().slice(0,10) === '2026-09-17'` (RN-D03).
Os **21** cenários existentes ficam intactos — o fixture `PEDIDO_418_LISTA` (`:149-152`) tem
previsão **no futuro** e o cenário `(p)` não afirma datas (medição nova 4).

### 7.5 `client/src/components/almoxarifado/AlertasAlmoxarifado.test.js` (estendido)

Um cenário: a central com um alerta `PEDIDO_COMPRA_ATRASADO` renderiza as colunas `Pedido`,
`Fornecedor`, `Previsão` e `Dias de atraso` com os valores da linha — em vez do fallback genérico.

### 7.6 `server/tests/api/comprasPedidoAtrasoIntegracao.api.test.js` (novo) — D10 / RN-D14

A sequência inteira, em **um** `test()` por perna, na ordem da RN-D14: criação **pelo serviço real**
→ rota → filtro → gerador → recebimento da 37 **sem mudar o atraso** → `PUT status:'recebido'` →
`atrasado: 0` → varredura sem linha nova.

### 7.7 Suítes que precisam continuar verdes (citar o resultado REAL no fechamento)

```
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```

---

## 8. Fora de escopo — o que esta etapa NÃO cobre

- **Tema B — as duas abas de Compras sem tela de criação.** `/compras/fornecedores/novo`,
  `/compras/cotacoes/nova` e os **dois** lápis de edição (`Compras.js:270` e `:392`) continuam
  caindo no `path="*"`. **São 4 caminhos mortos, não 2** (Fase 0 §6.1). É o **próximo candidato
  declarado** (D1), com o tamanho já medido em Fase 0 §6.3.
- **`situacao_recebimento` na aba Pedidos.** Fora por medição, não por preguiça: a única fonte
  exportada (`listarPedidosCompraAux`) **não devolve `previsao_entrega`** (`receiptService.js:1486-1488`)
  e tem **`LIMIT 50`** (`:1518`); recalcular criaria a segunda fórmula de saldo. É fatia da
  **feature 08**.
- **Auto-atualização de `status` no recebimento** (D6). Um pedido recebido por inteiro e ainda
  `pendente` **continua atrasado** — declarado, e **provado** pela RN-D12.
- **O alerta "Pedido recebido parcialmente"** (`20-alertas/README.md:27`). A spec é **corrigida**
  (D7) dizendo que o motivo caducou, mas o alerta **não** entra aqui.
- **As 4 varreduras com `date('now')` (UTC) da feature 20** —
  `toolReminderService.js:18-24`, `alertRegistry.js:312` (`REQUISICAO_ATRASADA`), `:338`
  (`RESERVA_PARADA`) e `thirdPartyService.listarRemessas({vencidas})`
  (`notificationQueueService.js:530`). Todas erram ~3 h por dia no fuso do Brasil. **A entrada nova
  desta etapa NÃO as imita** (usa `hojeLocalISO()`) e **não as conserta**: consertá-las é etapa
  própria da feature 20, com a suíte das Etapas 16/17 inteira — é o "ajuste de passagem" que o plano
  da 38 proibiu. **Fica na letra G, nomeada uma a uma.**
- **Janela configurável do alerta** (`alerta_pedido_atrasado_dias`) — D5, descartado (c).
- **Re-lembrete do alerta** (segundo e-mail enquanto o pedido segue atrasado) — RN-D10, declarado,
  com o caminho (incluir o mês no `dedupeChave`).
- **Canal/destinatário por alerta** — corte da Etapa 12 que continua aberto (B15,
  `20-alertas/README.md:45`); esta etapa **se serve** da coincidência de produção (as duas listas
  idênticas), não a resolve.
- **Segunda camada de autorização no core Compras** — B101 continua; nada em `ACAO_PERFIS` (D8).
- **Ordenar a lista por atraso**, KPI de atraso por fornecedor, valor em aberto, anexo do pedido
  (PDF da OC) e workflow de aprovação de status.
- **Os resíduos da 38 que não estão no caminho** (Fase 0 §4.3): preço negativo normalizado para 0
  (M5), export com 1 GET por pedido, planilha com CNPJ só na 1ª linha (regressão declarada do F1),
  importação não idempotente (B100), e as três portas da Etapa 37 (`?pendentes=1`, `LIMIT 50`,
  `<select>` ambíguo).
- **Segregação de saldo por almoxarifado.** Almoxarifado é **área física, não filial** — saldo
  global por material segue correto e intencional.

---

## 9. Letras para o fechamento

### Letra **A** (o que precisa de resposta de fora / de produção)

- **A — confirmar o `TZ` do processo Node em PRODUÇÃO.** Medido: **não existe** configuração de `TZ`
  no repositório (medição nova 6), então o "hoje" de `hojeLocalISO()` é **o fuso do sistema
  operacional do host**. A Fase 0 mediu o fuso da **máquina de desenvolvimento**
  (`America/Sao_Paulo`), não o do servidor. Se o servidor rodar em **UTC** (o default da maioria dos
  contêineres), o atraso muda de dia entre 21h e a meia-noite. **Comando a rodar no host de
  produção:**
  ```
  node -e "console.log(process.env.TZ || '(não definido)', Intl.DateTimeFormat().resolvedOptions().timeZone, new Date().toString())"
  ```
  **Caminho reversível se vier UTC:** definir `TZ=America/Sao_Paulo` no ambiente do processo (é o
  mesmo fuso que `auditFiltros.FUSO_PADRAO` (`:53`) e `client/jest.globalSetup.js` já fixam) — uma
  variável de ambiente, sem mudança de código.
- **A — contar o acervo DEPOIS da Etapa 38.** O dump medido é de **03/09/2026**, anterior à 38
  (16/09), que é justamente a etapa que criou o `POST`. Consulta:
  ```sql
  SELECT COUNT(*) AS pedidos,
         SUM(CASE WHEN previsao_entrega IS NOT NULL AND previsao_entrega <> '' THEN 1 ELSE 0 END) AS com_previsao
  FROM pedidos_compra;
  SELECT status, COUNT(*) FROM pedidos_compra GROUP BY status;
  ```
  **É esta consulta que diz se o alerta desta etapa deixou de ser inerte.** Se `com_previsao = 0`, o
  guia do usuário tem de continuar dizendo que o alerta existe e varre o vazio.

### Letra **B** (decisões) — as dez de D1 a D10, cada uma com o descartado da tabela da seção 3

Com destaque para as três que mudam arquitetura ou contrato:

- **a régua de atraso é `hojeLocalISO()` passado em JS, não `date('now')` do SQLite** (UTC, erra 3 h
  por dia) — e as 4 varreduras que usam `date('now')` ficam **declaradas, não consertadas**;
- **o registro de alertas do almoxarifado passa a ter uma entrada que lê tabelas CORE**
  (`pedidos_compra`, `fornecedores`) — as 11 anteriores só liam `*_almoxarifado`. Mesmo handle,
  mesmo arquivo SQLite; é decisão de arquitetura, declarada;
- **o prefixo do assunto é `[Compras]`**, e não `[Almoxarifado]` como as 11 anteriores.

E a nota de numeração: **rodar o `grep` das letras antes de escrever a primeira** (a 38 fechou em
B113).

### Letra **D/G** (limitações que ficam de pé depois desta etapa)

1. **Pedido recebido por inteiro mas com `status` desatualizado continua atrasado** (D6, provado
   pela RN-D12). O caminho reversível é da feature 08.
   > ⚠️ **(corrigido na Fase 2) — e continua atrasado PARA SEMPRE.** Esta limitação estava escrita
   > como "até alguém editar o status", e **não há como editar**: a RN-C07 da Etapa 38
   > (`pedidoCompraService.js:425-431`) recusa com **400** o `PUT` de pedido que já teve
   > recebimento. Logo, `dias_atraso` cresce sem teto, o pedido fica permanentemente em
   > `?atrasados=1` e o cartão da central não sai. O e-mail **não** é repetido (dedupe por pedido,
   > RN-D10), então o dano é de tela e de filtro, não de caixa de entrada. Reversível pela feature
   > 08 das duas formas já nomeadas.
   >
   > **(corrigido na Fase 2) A "varredura diária" não tem hora.** `routes/almoxarifado.js:3785-3797`
   > é `setTimeout(..., 30s).unref()` + `setInterval(..., 24h).unref()` — sem cron, sem hora
   > configurada: a hora do dia **muda a cada restart**. O dedupe impede e-mail duplicado num
   > restart; o efeito residual é que um pedido que venceu pode esperar até ~24 h pelo primeiro
   > aviso, conforme o instante em que o processo subiu. Declarado, não consertado (feature 20).
   > **E a letra A é UMA pergunta, não duas:** job e rota vivem no **mesmo processo**, então o
   > `hojeLocalISO()` dos dois não pode divergir entre si — o que falta medir é só o fuso do host.
2. **O alerta avisa UMA vez por pedido, para sempre** (RN-D10). Pedido que segue atrasado não é
   relembrado.
3. **A lista in-app de alertas é do almoxarifado.** Um usuário só de Compras toma **403** em
   `/almoxarifado/alertas` (`routes/almoxarifado.js:285`); para ele o alerta chega por **e-mail** e
   pelo **badge da aba Pedidos** (medição nova 8).
4. **O destinatário é a lista única `alertas_estoque_emails`.** Funciona hoje porque em produção ela
   é **idêntica** a `compras_notificar_emails`; se alguém editar uma das duas, o alerta de Compras
   segue a lista do **almoxarifado**. Canal por alerta continua sendo corte da feature 19 (B15).
5. **O alerta nasce INERTE:** `previsao_entrega` preenchida em **0** pedidos no dump medido.
6. **As 4 varreduras com `date('now')` (UTC)** continuam erradas ~3 h por dia — nomeadas na seção 8.
7. **`created_at` é gravado em UTC** pelo `DEFAULT CURRENT_TIMESTAMP` do SQLite
   (`server/index.js:19239`), então a coluna `Cadastrado em` dos fornecedores passa a mostrar o
   **dia UTC** da criação (antes mostrava o dia local de uma meia-noite UTC — errado de outro
   jeito). Divergem só para registros criados depois das 21h locais. **Não é regressão desta etapa**
   — é a mesma dívida do `date('now')`, agora visível. Declarada.
8. **O core Compras continua com UMA camada de autorização** (B101): qualquer usuário com o módulo
   `compras` lê o atraso de todos os pedidos.
9. **Tema B segue aberto:** 4 caminhos mortos nas abas Fornecedores e Cotações.

---

## 10. Riscos, e onde o desenho os fecha

| # | Risco | Fechado por |
|---|---|---|
| R1 | **duas definições de "atrasado"** (uma na tela, outra no alerta) divergindo na primeira edição — é o mesmo erro que o plano da 38 proibiu para o saldo | **uma** função exportada (`derivarAtraso`, §5.2) consumida pelos dois; o SQL do alerta só pré-filtra pelo termo que já é da própria régua; e a **RN-D11** compara os dois conjuntos de ids |
| R2 | **o teste de fuso passar por acidente** (worker em UTC medindo nada) | **controle positivo** em todo cenário de data: o próprio teste afirma que `new Date('2026-09-16').toLocaleDateString('pt-BR')` é `15/09/2026`, com mensagem de falha explícita — e o fuso vem do `globalSetup`, não de uma atribuição que esta base **já mediu como no-op** |
| R3 | **fixtures com data literal** apodrecendo no dia seguinte | todas as datas de teste derivam de `hojeLocalISO()` (`hoje`, `hoje±N`) |
| R4 | **campo novo na resposta derrubar a suíte da Etapa 38** | é **aditivo**: `comprasPedidosRotas.api.test.js` lê por nome de campo (`:29`) e o fixture de client tem previsão **futura** (medição nova 4). O cenário (10) do 7.1 afirma que `?pendentes=1` responde **idêntico** |
| R5 | **`dias_atraso` errado por fuso** (a conta de datas puxando o offset local) | `Date.UTC` nas **duas** pontas — data-only contra data-only, aritmética sem fuso; cenário (7) com `hoje-3` |
| R6 | **a fronteira "vence hoje"** virar atraso, como já aconteceu com os empréstimos (achado F4 da revisão de branch, `FerramentasAlmoxarifado.js:416-422`) | `<` e não `<=`, com cenário próprio (2); a sabotagem obrigatória troca o operador e confere que ele cai |
| R7 | **o alerta varrer o vazio e a etapa parecer entregue** | declarado em D5, na letra A, **e no guia do usuário**: o alerta existe, é inerte enquanto ninguém preencher previsão, e a consulta da letra A é a que mede |
| R8 | **um `listar` que lança calar os outros 11 alertas** | o `try/catch` por entrada já existe nos dois caminhos (`notificationQueueService.js:598-624`, `alertRegistry.js:483-499`) — achado A1 da Etapa 16. A entrada nova **não** o desliga, e o cenário (4) do 7.2 prova que a central segue montando |
| R9 | **consulta cross-módulo no registro** (primeira do gênero) quebrar o harness de alertas | `pedidos_compra` e `fornecedores` são stubadas em `testApp.js:100-111` e `:65-84` desde as Etapas 37/38 — o cenário roda sem fixture nova (medição nova 5); e o `LEFT JOIN` (não `JOIN`) garante que pedido órfão de fornecedor ainda alerta |
| R9b | **(novo) require de topo fechando um CICLO de módulos** e um dos lados capturando `{}` mid-load — a falha silenciosa que `alertRegistry.js:9-13` já documenta | `pedidoCompraService.js:109` requer `purchaseService` **no topo**, e `purchaseService` requer `notificationQueueService`, que requer `alertRegistry`. Por isso o require da régua é **LAZY, dentro do `listar`** (§5.3) — o mesmo padrão que as entradas de `MATERIAL_REPROVADO`/`DIVERGENCIA_*` já usam. O cenário (4) do 7.2 (`montarCentral`) é o que acusa um `{}` capturado: `derivarAtraso` viria `undefined` e o cartão apareceria com `erro: true` em vez de quebrar a suíte inteira |
| R10 | **"verde de primeira"** | controle positivo em toda task; sabotagem de `<`→`>` em `derivarAtraso` com `grep -cF` contado **depois** do conserto, `md5sum` antes/depois/depois-de-restaurar, **nunca** `git checkout --`. E, no harness de sabotagem: **base é LF, `perl -0pi -e` com `\r?\n` só na busca** (lição da Etapa 37) |
| R11 | **o badge aparecer na aba errada** ou o filtro vazar para fornecedores/cotações | o checkbox é condicional a `activeSection === 'pedidos'` (medição nova 2) e o cenário (g) do 7.3 afirma que `api.get('/compras/fornecedores')` **nunca** recebe `atrasados` |
| R12 | **mexer sem querer em porta da Etapa 37** | **nenhuma linha** toca `receiptService.js`, `routes/almoxarifado/extended.js` ou `services/almoxarifado/schema.js`. Os arquivos tocados são: `routes/compras.js`, `services/compras/pedidoCompraService.js`, `services/almoxarifado/alertRegistry.js`, `client/src/components/Compras.js` (+ `.css`), `client/src/components/compras/PedidoCompraForm.js`, `client/src/components/almoxarifado/AlertasAlmoxarifado.js` — e os arquivos de teste |

---

## 11. O que a Fase 0 mediu e este design corrigiu

> **Fase 0 errada é dado, não vergonha** — o que não se faz é apagar a versão errada em silêncio,
> porque o próximo confia nela de novo (regra 5 do `CLAUDE.md`).

1. **A Fase 0 §4.2 e o escopo do controlador tratam o fuso do teste de client como coisa a resolver
   no arquivo de teste.** É o contrário: `client/jest.globalSetup.js` **já fixa**
   `America/Sao_Paulo` para a suíte inteira, e o comentário dele registra, com medição, que
   `process.env.TZ` no topo de um arquivo de teste é **no-op** quando o processo já tem `TZ` (achado
   A1 da Etapa 22). → decisão 9, com a divergência declarada.
2. **A Fase 0 §3 diz que `Compras.js` "não tem arquivo de teste".** É verdade como arquivo, e
   **enganoso como cobertura**: `PedidoCompraForm.test.js` renderiza `AppRoutes` e **já exercita a
   aba Pedidos** em dois cenários (`:460` a lixeira, `:785` a exportação). A consequência prática é
   boa — o fixture dela tem previsão futura e o cenário de export não afirma datas, então **nada
   desta etapa derruba a suíte da 38** —, mas quem ler "não tem teste" vai supor que pode mudar a
   aba livremente. **Não pode.**

*(Os demais números da Fase 0 foram reconferidos e batem: `routes/compras.js:111-137` sem `LIMIT`,
`alertRegistry.js:301-326` como molde, `notificationQueueService.js:590` como lista única,
`routes/almoxarifado.js:3791` como varredura, `permissions.js:149` com COMPRAS em `ver_alertas`,
`20-alertas/README.md:27` ainda `[ ]`, e `PEDIDO_COMPRA_ATRASADO`/`?atrasados=` inexistentes em
`server/` e `client/src`.)*
