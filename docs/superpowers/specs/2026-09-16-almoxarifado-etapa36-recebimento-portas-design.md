# Etapa 36 — Recebimento: as duas portas param de aceitar qualquer coisa (design)

**Data:** 2026-09-16 · **Módulo:** almoxarifado · **Feature alvo:** 08 (entrada e recebimento de
materiais) · **Feature tocada de raspão:** 04 (requisições — uma linha do gêmeo `fecharDetalhe`)

**Medição de base:** `.superpowers/sdd/etapa36-fase0-medicao.md` (HEAD `084b416`, só leitura, com
**duas sondas executadas** contra o harness real e **três sondas de Zod** no `node -e`).
**Onde a medição corrige a spec, o mapa, o manual ou o plano da 35, vale a medição.** Onde ela
divergiu da proposta do controlador, está registrado aqui como **decisão**, com o descartado — é o
que a seção "Decisões desta etapa" carrega para a letra B do doc de novidades.

## O problema, em uma frase

As **duas portas de escrita** do recebimento (`POST /almoxarifado/recebimentos` e
`PUT /almoxarifado/recebimentos/:id/fiscal`) não validam nada: `tipo_recebimento: 'BANANA<script>'`
entra com **201**, a **mesma nota fiscal do mesmo fornecedor** entra duas vezes e credita **20** em
vez de 10 gerando **2 contas a pagar** — as duas coisas medidas por execução —, e o alerta de
divergência de quantidade que o manual promete **não tem produtor alcançável pela tela**, porque não
existe em lugar nenhum do client um campo para dizer *quanto chegou de verdade*.

## Fase 0 — o que a medição achou, e o que ela derrubou

### O que estava certo na spec 08

| Afirmação | Confirmado em |
|---|---|
| o campo é `tipo_recebimento` (não `tipo_entrada`), já existe e **não é validado em lugar nenhum** | `schema.js:1229` (DDL, `recebCols`), `receiptService.js:102/108/133`, `schemas.js` sem schema de recebimento |
| o client manda **só** dois valores | `<select>` *"Forma de recebimento"* em `RecebimentosAlmoxarifado.js:732-737`: `NOTA_FISCAL` e `PEDIDO_COMPRA`; `form` nasce em `:86`; payload em `:343` |
| fechar só o `POST` deixa a validação contornável pelo `PUT` | `receiptService.js:286`, `tipo_recebimento = COALESCE(?, tipo_recebimento)` |
| **zero recebimentos gravados** no banco de desenvolvimento (re-medido hoje: `[]`) | `SELECT tipo_recebimento, COUNT(*) GROUP BY 1` em `server/data/database.sqlite` |
| duplicidade de NF **confirmada ausente** | nenhuma checagem em `receiptService.js`; rota sem schema |
| `avancar etapa fora de ordem falha` continua **não escrito** | `grep -l recebimentos server/tests/api/*.api.test.js` → 20 arquivos, nenhum exercita isso |
| o residual (b)/(c) do plano da 35 (modal fiscal/workflow/etiquetas sem teste; `fecharDetalhe`) | `RecebimentosAlmoxarifado.test.js` com 12 cenários, `test(` de (a) a (l) |

### O que a medição derrubou (e vale a medição)

- **O trap que mataria a Task 1, medido e não adivinhado.** `validate()`
  (`server/services/almoxarifado/validation.js:23-32`) **substitui `req.body` por `parsed.data`** e
  `z.object` do Zod 4.4.3 **descarta chave não declarada**. Com um `z.object` ingênuo, **todo**
  `POST /recebimentos` válido passaria a responder `400 "Inclua ao menos um item"`
  (`receiptService.js:126`), porque `nota_fiscal` e `itens` **somem** do body. O caminho medido que
  funciona é **`z.looseObject`** (existe nesta base — confirmado truthy). É a **quarta** encarnação
  do mesmo defeito, já documentada em comentário em `schemas.js` para `reserva_id`, `lote_id` e
  `series`.
- **`.optional()` é obrigatório, não estilo.** `criarRecebimento` **deriva** o tipo quando o body não
  o traz (`receiptService.js:108`), e dois testes existentes chamam sem ele
  (`recebimentoEntradaAtomica.api.test.js:192`, `alertaEventoJornada.api.test.js:82`). Exigir o campo
  quebra esses arquivos.
- **A mensagem padrão do `z.enum` no Zod 4.4.3 sai em INGLÊS e sem o valor recebido** (medido):
  `Dados inválidos — tipo_recebimento: Invalid option: expected one of "NOTA_FISCAL"|"PEDIDO_COMPRA"`.
  Isso quebra a convenção do módulo (mensagens em português: `schemas.js:211`, `:348`, `:622`). Logo,
  **mensagem própria, congelada aqui**.
- **`tipo_recebimento` é coluna WRITE-ONLY no servidor.** Isto **corrige uma suposição implícita do
  enunciado da própria Fase 0** ("onde é lido depois: workflow, contas a pagar, relatórios"):
  `avancarWorkflow`, `gerarContaPagar`, `reportService` e `alertRegistry` **não** olham a coluna. O
  único ramo de comportamento é `receiptService.js:108` (`if (tipo === 'PEDIDO_COMPRA')`) — ou seja,
  **`'BANANA'` se comporta como `NOTA_FISCAL`, em silêncio**. A consequência não é quebrar fluxo, é
  (a) o ramo de pedido ser pulado sem aviso e (b) a coluna ficar impura para todo relatório futuro.
- **E o lixo é PRESERVADO pela própria tela:** `abrirDetalhe` carrega
  `tipo_recebimento: res.data.tipo_recebimento || 'NOTA_FISCAL'` para dentro de `fiscalForm`, o modal
  fiscal **não tem campo nenhum para ele**, e `salvarFiscal` faz `{...fiscalForm}` no `PUT` — quem
  abrir e salvar os dados fiscais **reescreve o valor inválido de volta**, sem ver e sem poder mudar.
- **`'MATERIAL'` aparece no repo e NÃO é contrato:** `materialClienteEntrada.api.test.js:87` grava
  por `INSERT` direto. Um enum na rota **não derruba esse teste**, porque ele não passa pela rota.
  Não confundir com tipo legítimo.
- **A NF duplicada custa mais do que a spec diz.** Medido por execução: dois `POST` com a mesma
  `nota_fiscal` e o mesmo `fornecedor_id` → **201 + 201**; processar as duas → **200 + 200** com
  `contas_pagar_id` **1** e **2**; saldo do material **20** (creditado duas vezes); `contas_pagar`
  com **2 linhas**. `gerarContaPagar` (`receiptService.js:647-670`) insere sem consultar duplicidade,
  e a descrição `NF <num>/<serie> — <numero do REC>` sai igual nas duas exceto pelo número do
  documento.
- **O achado que reordena a etapa: o alerta de divergência é inalcançável pela tela.**
  `atualizarItemDetalhe` é chamado em 8 pontos (`RecebimentosAlmoxarifado.js:628-664`) e
  `quantidade_recebida` **não está entre os campos**; o painel exibe **uma** quantidade só
  (`item.quantidade_recebida || item.quantidade_esperada`, `:621`), nunca as duas lado a lado; no
  modal de criar, `quantidade_recebida` nasce **igual** a `quantidade` (`:353`) e, pelo caminho do
  pedido, `criarRecebimento` copia esperada→recebida (`receiptService.js:117-119`). E
  `PUT /recebimentos/:id/conferir` — a rota que existe para isso — **não tem chamador no client**
  (`alertaEventoGanchos.api.test.js:9` já registra: *"achado Critico: a UI nunca chama /conferir"*).
  Detectar está pronto (`alertRegistry.listarDivergenciasRecebimento`, `avisarDivergenciasDoRecebimento`
  nos dois escritores); **barrar e produzir** é o que falta.
- **`autorizar_excedente` NÃO existe em `ACAO_PERFIS`** — medido: `grep -rn autorizar_excedente
  server/ client/src` não devolve **nenhuma** ocorrência de ação de permissão (os hits de "excedente"
  são o `requisitionService.js:595-602`, comentários de outra regra, e cláusula de contrato). Logo,
  criar a ação **é tronco** (ver "O sort e por que ele mudou").
- **O molde proposto pelo plano da 35 para o `loadingDetalhe` está ERRADO.**
  `RequisicoesList.js:320-326` — o `fecharDetalhe` que o `2817054` consertou — **também não** zera
  `loadingDetalhe`. O defeito é **gêmeo, não moldado**: a task tem de tocar as duas telas. E a régua
  que aquele plano propunha (*"reabrir o painel e ver se nasce em Carregando…"*) **não funciona**:
  `abrirDetalhe` liga a flag na entrada, em qualquer id.
- **"Etiqueta" está na spec 08 e na tabela do plano 35 como pendência e FOI ENTREGUE** em 2026-08-11
  (`4ebd1ce`, Etapa 6c). O que falta neste item é **sugestão de localização** (feature 02) e a
  etiqueta **automática ao aprovar** — que é decisão de negócio, não ausência.
- **Três refs de linha apodrecidas na spec 08:** `extended.js:765` (o certo é **`:973`**; `:765` é a
  `POST /movimentacoes/v2`), `schema.js:1147` (é **`:1229`**) e `receiptService.js:281` (é **`:286`**).

### O mapa de portas, gate e validação (o que toda task consome)

| Método | Caminho | arquivo:linha | Gate hoje | Validação hoje | Depois da 36 |
|---|---|---|---|---|---|
| **POST** | `/api/almoxarifado/recebimentos` | `extended.js:973` | `receber_material` | **nenhuma** | `validate(RecebimentoCreateSchema)` + guarda de NF duplicada |
| **PUT** | `/recebimentos/:id/fiscal` | `extended.js:1098` | `receber_material` | **nenhuma** ⚠️ **(Fase 2) mas há um guard de STATUS**: `salvarDadosFiscal` recusa quem não está em `[ENCAMINHADO_FATURAMENTO, EM_ENTRADA_NF, EM_COMPRAS, CONFERIDO_ALMOX, EM_CONFERENCIA]` com `400 'Dados fiscais só podem ser editados antes do processamento'` (`receiptService.js:253-259`). **`RECEBIDO` fica FORA** — medido por sonda: o `PUT` logo depois do `POST` responde 400, e só depois de `iniciar_conferencia` responde 200. Toda régua de `/fiscal` desta etapa avança o status primeiro | `validate(RecebimentoFiscalSchema)` + guarda de NF duplicada + guarda de excedente |
| **PUT** | `/recebimentos/:id/conferir` | `extended.js:980` | `receber_material` | nenhuma | guarda de excedente (+ `COALESCE` na quantidade) · **ganha chamador no client** |
| POST | `/recebimentos/:id/workflow` | `extended.js:1092` | `receber_material` | nenhuma | inalterado — só ganha teste |
| POST | `/recebimentos/:id/processar` | `extended.js:1104` | `receber_material` | nenhuma | inalterado |

Camada 1 (abrir): `app.use('/api/almoxarifado', authenticateToken, checkModulePermission('almoxarifado'))`
— `routes/almoxarifado.js:282-285`. Camada 2 (agir): `requirePermission` por perfil,
`receber_material: [ADMINISTRADOR, ALMOXARIFE, COMPRAS]` (`permissions.js:86`), `getPerfilFromUser`
com fallback para **`PRODUCAO`**. Medido por sonda: usuário sem perfil toma
`403 {"error":"Sem permissão para esta operação","acao":"receber_material","perfil":"PRODUCAO"}`
nas duas portas. **`validate(...)` entra DEPOIS do `requirePermission`** — 403 antes de 400, como nas
rotas de `configurar` (`extended.js:478`).

## A decisão de desenho

Quatro frentes: **duas guardas de dado nas duas portas** (enum e NF duplicada), **uma barreira de
excedente com ação de perfil nova**, e **o gesto de tela que faltava** (quantidade conferida), mais
duas dívidas pequenas (o teste de workflow e a linha do `loadingDetalhe`).

### (a) Enum de `tipo_recebimento` — fonte única, `looseObject`, literal em português

`TIPOS_RECEBIMENTO = ['NOTA_FISCAL', 'PEDIDO_COMPRA']` nasce em **`schema.js`** e é **exportado de
lá**, no mesmo padrão de `TIPOS_REQUISICAO` / `TIPOS_MOVIMENTO` / `TIPOS_RESULTADO`
(`schemas.js:3` já importa esse grupo). `receiptService.js:108`, que hoje deriva o default com
string literal, passa a usar a constante — senão a etapa cria **duas** definições do mesmo enum, que
é exatamente a classe de defeito que `divergencia.js` existe para matar neste módulo.

Dois schemas, os dois **`z.looseObject`**, os dois declarando **só** `tipo_recebimento`:

```js
// server/services/almoxarifado/schemas.js
const TIPO_RECEBIMENTO_INVALIDO = 'forma de recebimento inválida (use NOTA_FISCAL ou PEDIDO_COMPRA)';

// `looseObject`, nunca `object`: `validate()` substitui `req.body` por `parsed.data` e o `z.object`
// do Zod 4.4.3 DESCARTA chave nao declarada — medido na Fase 0 desta etapa: com `z.object`, o
// `nota_fiscal` e o `itens` somem e TODO POST valido passa a responder 400 "Inclua ao menos um
// item" (`receiptService.js:126`). Quarta encarnacao do defeito ja comentado aqui para
// `reserva_id`, `lote_id` e `series`.
const RecebimentoCreateSchema = z.looseObject({
  tipo_recebimento: z.enum(TIPOS_RECEBIMENTO, { message: TIPO_RECEBIMENTO_INVALIDO }).optional(),
});
const RecebimentoFiscalSchema = z.looseObject({
  tipo_recebimento: z.enum(TIPOS_RECEBIMENTO, { message: TIPO_RECEBIMENTO_INVALIDO }).optional(),
});
```

**Por que a mensagem é própria e fica em uma constante só:** o padrão do `z.enum` no Zod 4.4.3 sai em
inglês (medido), e duas literais escritas à mão nas duas portas divergiriam na primeira edição — o
operador veria texto diferente dependendo de qual porta recusou.

**Por que `.optional()`:** o default derivado de `receiptService.js:108` é comportamento vivo, com
dois testes existentes chamando sem o campo.

**O trap de fiação, que já custou um 500 nesta base:** `schemas.js` exporta por **lista fechada**
(o comentário de `AnexoCreateSchema` diz isso com todas as letras) — esquecer a linha do
`module.exports` deixa o binding `undefined` e faz a rota morrer em `undefined.safeParse`, **500 com
stack**, depois do gate. Os dois nomes novos entram na lista, e é isso que a sabotagem 3 da T1 mede.

### (b) NF duplicada — guarda no serviço, índice **não único**, nas duas portas

A checagem mora em `receiptService`, numa função só, chamada pelos **dois** escritores:
`criarRecebimento` (antes do `inserirComNumeroUnico`, `receiptService.js:131`) e `salvarDadosFiscal`
(antes do `UPDATE`, `:273`) — porque o `PUT /fiscal` **preenche a NF depois** e uma guarda só no
`POST` é contornável pelo mesmo caminho que torna o enum contornável. É a segunda vez, nesta etapa,
que "as duas portas" é a regra e não um detalhe.

```js
// A duplicata e por (fornecedor, numero da NF), ignorando documentos CANCELADOS. `recebimentoId`
// permite ao PUT /fiscal excluir o PROPRIO documento da busca — senao salvar os dados fiscais duas
// vezes no mesmo recebimento se acusaria a si mesmo.
async function assertNotaNaoDuplicada(db, { nota_fiscal, fornecedor_id, fornecedor_cnpj }, recebimentoId = null)
```

**Chave da duplicata:** `nota_fiscal` (comparada com `TRIM` e sem diferenciar caixa) **mais** o
fornecedor, resolvido por `fornecedor_id` quando existe, por `fornecedor_cnpj` quando o id é nulo e
**(Fase 2)** por `UPPER(TRIM(fornecedor_nome))` quando os dois são nulos.

**(Fase 2) A terceira perna da chave não é zelo: sem ela a guarda é INALCANÇÁVEL pela tela.**
Medido: `handleCriar` monta o payload do `POST` com `tipo_recebimento`, `pedido_compra_id`,
`nota_fiscal`, `fornecedor_nome`, `fornecedor_cnpj`, `observacoes` e `itens`
(`RecebimentosAlmoxarifado.js:342-354`) — **`fornecedor_id` não existe no `form`** (`:86-93`), e o
`<select>` de fornecedores copia `razao_social` → `fornecedor_nome` e `cnpj` → `fornecedor_cnpj`
(`selecionarFornecedor`, `:315-325`). Com a chave só em id/CNPJ, todo recebimento lançado por nome
de fornecedor sem CNPJ digitado passaria pela guarda em silêncio. **Seria a mesma classe de defeito
que esta etapa está pagando do outro lado** (a rota `/conferir` completa e sem chamador): regra
implementada, porta de entrada faltando. **Descartado: mandar `fornecedor_id` no payload da tela** —
é mudança de client dentro de uma task **tronco** de servidor, acopla T2 à T5 e não resolve o
acervo já lançado sem id; a cláusula no `where` é reversível numa linha e cobre os dois. Registrar
na letra B. **Item para a Etapa 37:** o `<select>` passar a mandar `fornecedor_id`, e então a perna
do nome ser apenas retaguarda.

**NF vazia ou `null` NÃO é duplicata** — decisão, e é a metade que impede o excesso de zelo: o
recebimento nasce legitimamente sem nota pelo caminho do pedido de compra (`fornecedor_nome` sem NF é
o caso do REC-2026-077 da própria fixture de teste do client), e `NULL = NULL` é falso em SQL de
qualquer forma. Dois documentos sem NF do mesmo fornecedor continuam entrando.

**Mesma NF de fornecedores diferentes passa** — dois fornecedores emitem nota com o mesmo número;
barrar isso seria pior que o furo.

**Fornecedor NÃO IDENTIFICADO (`fornecedor_id`, `fornecedor_cnpj` **e `fornecedor_nome`** — os três
nulos, **Fase 2**) também não caracteriza duplicata** — pelo mesmo raciocínio da NF vazia: sem fornecedor não existe "mesmo
fornecedor" a afirmar, e tratar "sem fornecedor" como um fornecedor único juntaria documentos de
origens diferentes. Isto também é o que **impede regressão**: os arquivos de teste que criam
recebimento **pela rota** (`alertaEventoGanchos`, `alertaEventoJornada`, `recebimentoCustoMedio`) o
fazem sem `fornecedor_id`, e alguns reusam prefixos de NF parecidos. Medido: nenhum deles envia
`quantidade_recebida > quantidade_esperada` pela rota, então a barreira de excedente de (c) também
entra sem regressão.

**Reversível escolhido: guarda em serviço + índice de consulta NÃO ÚNICO.**
**Descartado: `UNIQUE(nota_fiscal, fornecedor_id)` no banco.** Três motivos, e o primeiro é decisivo:
(1) produção pode já ter duplicatas, e `safeAlter` criando um índice único sobre dado sujo **falha na
subida do servidor** — o `numero TEXT UNIQUE` da tabela nasceu no `CREATE TABLE`, não por
`safeAlter`, então não há precedente de índice único aplicado a acervo aqui; (2) `UNIQUE` não sabe
distinguir fornecedor nulo (`NULL` nunca colide, então o índice é silenciosamente parcial onde mais
importa); (3) a mensagem de recusa do `UNIQUE` é `SQLITE_CONSTRAINT`, não a literal que o operador
precisa ler. **A letra A do fechamento leva a consulta SQL** que mede duplicatas em produção **antes**
de qualquer decisão de subir o `UNIQUE` numa etapa futura — é o que permite arbitrar com número em
vez de opinião.

**Índice de consulta:** `CREATE INDEX IF NOT EXISTS idx_receb_nf_fornecedor
ON recebimentos_material_almoxarifado(nota_fiscal, fornecedor_id)`. Medido: `grep "INDEX.*recebimentos"`
em `schema.js` volta **vazio** — não há índice nenhum nessa tabela, e a guarda vai rodar em **toda**
criação de recebimento.

### (c) Excedente — ação de perfil nova, checada no SERVIÇO, nas duas portas

`quantidade_recebida > quantidade_esperada` passa a ser **recusada**, salvo quando o body traz
`autorizar_excedente: true` **e** o usuário tem a ação `autorizar_excedente`.

**A ação não existe hoje** (medido) e entra em `ACAO_PERFIS`:

```js
autorizar_excedente: [PERFIS.ADMINISTRADOR, PERFIS.COMPRAS],
```

⚠️ **(execução, fix-round 1 da T3) A lista acima ESTAVA ERRADA neste documento** — dizia
`[PERFIS.ADMINISTRADOR, PERFIS.GESTOR, PERFIS.COMPRAS]`, e o `GESTOR` era **configuração morta**.
Medido: as duas portas que escrevem quantidade são gateadas por
`requirePermission('receber_material')` = `[ADMINISTRADOR, ALMOXARIFE, COMPRAS]`
(`permissions.js:86`), o `GESTOR` **não está lá** e toma `403 { acao: 'receber_material' }` **antes**
de o serviço rodar, e **não existe outro chamador** de `conferirRecebimento`/`salvarDadosFiscal`. Pior
que inútil: `GET /minhas-permissoes` devolveria `autorizar_excedente: true` para o gestor e a tela
**mostraria** a caixa de autorização, que ele marcaria para tomar 403 de outra ação — **o mapa não
pode listar quem não consegue agir**. Corrigido para `[ADMINISTRADOR, COMPRAS]` em `3e36af4`.
**Descartado, com o custo:** alargar `receber_material` (daria ao GESTOR o recebimento inteiro por uma
autorização pontual) e abrir rota de exceção (porta nova, com contrato, tela e auditoria — questão de
design). **Custo da escolha:** hoje a gestão não autoriza excedente; se o cliente quiser, precisa de
**porta própria**, e isso está na **letra B** como *"GESTOR deve autorizar excedente? Se sim, precisa
de uma porta própria — etapa própria"*.

**Por que ação própria, e não carona no `receber_material`:** o critério já escrito três vezes em
`permissions.js` (`ajustar_material_cliente`, `remessar_terceiro`, `conferir_separacao`) — *quando a
operação muda a NATUREZA DO RISCO, ela ganha ação própria*. Aceitar mais material do que foi pedido
gera **conta a pagar maior do que o pedido de compra**, que é risco financeiro, não risco de
prateleira.

**Por que o ALMOXARIFE fica FORA, e é a exclusão que precisa de justificativa** (ele é o candidato
óbvio, tem `receber_material`): quem recebe não autoriza o próprio excedente. Mesmo raciocínio,
escrito, de `gerenciar_plano_inspecao` ("quem RECEBE o material não define o critério pelo qual o
próprio recebimento será julgado"). COMPRAS entra porque é quem negocia com o fornecedor e responde
pelo pedido. ~~GESTOR entra pelo precedente do `ajustar_estoque`.~~ **(execução) esta frase estava
errada** — o GESTOR entrou por precedente e saiu por **medição**: sem `receber_material` ele não tem
porta (ver o bloco acima). **Reversível numa linha** se o cliente pedir o contrário, e registrado na
letra B.

**A checagem NÃO é `requirePermission` na rota** — seria errado e quebraria tudo: a rota inteira
passaria a exigir a ação, e um `PUT /conferir` **sem** excedente deixaria de funcionar para o
ALMOXARIFE, que é quem confere. A checagem é **condicional e mora no serviço**, com `can(user, acao)`
— precedente exato e já documentado: `ownerRules.assertAjustePermitido` (*"a checagem real acontece no
MOTOR, não em requirePermission na rota"*), que também é o molde da mensagem (nomeia a ação e o
perfil do usuário).

**(Fase 2) Confirmado no código, os três pontos que o desenho precisava e que estavam supostos:**
`can(user, acao)` recebe o **objeto do usuário**, não o perfil (`permissions.js:162-166`, e ele
chama `getPerfilFromUser` por dentro) — logo `can(user, 'autorizar_excedente')` com o `user` que a
rota injeta está certo; `conferirRecebimento(db, user, recebimentoId, data)` e
`salvarDadosFiscal(db, user, recebimentoId, data)` **já recebem `req.user`** como segundo parâmetro
(`extended.js:980-984` e `:1098-1102`), então nenhuma assinatura muda; e `receiptService.js` **não
importa** `permissions` hoje (`:1-17`) — o `require('./permissions')` é novo e **não fecha ciclo**,
porque `permissions.js` só requer `../systemPermissions`, e faz isso **dentro** da função
(`:154`), de propósito.

**(Fase 2) E três fiações que o desenho não previa, medidas por execução:**
1. `client/src/utils/permissaoErro.js` — o teste `permissaoErro.test.js:44` importa `ACAO_PERFIS`
   **do servidor** e exige rótulo para **toda** ação. Ação nova sem rótulo = **suíte de client
   vermelha**, por uma mudança de servidor. É o defeito que o fix-round `7982f18` da Etapa 30 pagou.
2. `auditLabels.js` — `auditLabels.api.test.js` varre `acao: '<VERBO>'` com guarda de fronteira e
   exige rótulo para cada verbo literal. `EXCEDENTE_AUTORIZADO` é literal e **é pego**.
3. `auditLabels.js` / `ROTULOS_ENTIDADE` — o mesmo arquivo exige rótulo para cada **entidade**
   literal. `recebimento_item` é nova (`recebimento` já tem). **Descartado:** auditar como
   `entidade: 'recebimento'` para não tocar o mapa — perderia a precisão de qual item foi
   autorizado, que é a razão de a linha existir.

**Descartado: só a flag no payload, sem ação de perfil** (o caminho que a medição propôs como
reversível). Descartado porque uma flag que qualquer perfil pode ligar **não é barreira, é
formulário**: o mesmo usuário que digita 999 marca a caixa, e o item de checklist da spec 08
("recebimento excedente só com autorização") ficaria pago no texto e não no comportamento. A flag
**continua existindo** — ela é a intenção explícita, o "eu sei o que estou fazendo" —, mas sozinha ela
não autoriza. Custo declarado da escolha: `ACAO_PERFIS` muda, logo a task é **tronco** e vem antes dos
galhos.

**`conferirRecebimento` ganha `COALESCE` na quantidade.** Hoje ele grava
`quantidade_recebida = ?` **sem** `COALESCE` (`receiptService.js:190`), ao contrário do `/fiscal`
(`:330`, com `COALESCE`). Como o `/conferir` está ganhando **o primeiro chamador da sua vida**, um
item enviado sem o campo apagaria a quantidade — e o contrato congelado abaixo exige o campo em todo
item justamente porque hoje não há como confiar no `COALESCE` que não existe. Duas linhas, mesma
régua das duas portas.

### (d) O gesto que faltava: quantidade conferida no painel

Um `<input type="number">` **por item**, dentro do bloco de itens do painel
(`RecebimentosAlmoxarifado.js:614-670`), exibindo **esperada × recebida** lado a lado — hoje o painel
mostra uma quantidade só — e um botão **"Salvar Conferência"** que chama
`PUT /almoxarifado/recebimentos/:id/conferir`.

**⚠️ Divergência entre a medição e a decisão do controlador, resolvida aqui.** A medição (§4.3)
propôs escrever a quantidade por `atualizarItemDetalhe` + **`PUT /fiscal`**, porque aquela porta
**já** transporta o campo (`salvarFiscal`) e **já** o grava (`receiptService.js:330`) — custo "zero
linha de servidor". O controlador decidiu **`PUT /conferir`**. **Vale a decisão do controlador**, e
por três razões que a medição não pesou:

1. **O gesto acontece na etapa errada pelo `/fiscal`.** Os inputs por item só são renderizados quando
   o status é `EM_ENTRADA_NF` ou `ENCAMINHADO_FATURAMENTO` (`:609` e `:622`) — isto é, no
   **Faturamento**. Conferir quanto chegou é ato do **Almoxarifado**, em `EM_CONFERENCIA`, três
   transições antes. Pelo `/fiscal`, a divergência só seria registrável depois de o material já ter
   atravessado Compras.
2. **`/conferir` é a rota que existe para isso e não tem chamador** — o achado que
   `alertaEventoGanchos.api.test.js:9` classifica como Crítico. Usar o `/fiscal` fecharia o sintoma e
   **deixaria a rota morta**, que é a classe de defeito que as Etapas 6, 32 e 34 pagaram três vezes
   nesta base (mecanismo completo, porta de entrada faltando).
3. **`/conferir` grava o que o `/fiscal` não grava:** `conferencia_quantidade` e
   `conferencia_descricao` (`receiptService.js:188-196`), que são os booleanos da conferência.

**Custo da escolha, dito de frente:** deixa de ser "zero linha de servidor". São **duas** linhas (o
`COALESCE` de (c)) mais a guarda de excedente, que a T3 já leva de qualquer forma. E o `/conferir`
**não** muda o status por conta própria quando o body não manda `status` (`:178-186`), então o botão
novo **não** avança o workflow — conferir e finalizar a conferência continuam sendo dois gestos, o
que é o comportamento certo (o operador pode salvar a contagem e voltar depois).

**Permissão:** `PUT /conferir` é gateada por **`receber_material`** (`extended.js:980`) — medido,
não suposto. O campo e o botão **não decidem permissão**: quem decide é o backend. A UI usa
`useAlmoxPermissoes().pode('autorizar_excedente')` apenas para **esconder a caixa de autorização** de
quem não a tem, e esse hook **falha aberto de propósito** (`pode()` devolve `true` enquanto carrega ou
se a carga falhou). Consequência declarada: um perfil sem a ação pode ver a caixa por um instante,
marcar, e tomar **403 do servidor com a literal congelada** — que é exatamente o desenho que o
CLAUDE.md descreve.

### (e) `loadingDetalhe` — uma linha em duas telas, declaradamente SEM régua

`fecharDetalhe` de `RecebimentosAlmoxarifado.js:198-203` e de `RequisicoesList.js:320-326` bumpam a
sequência e zeram os estados, mas **não** chamam `setLoadingDetalhe(false)`; como o `finally` de
`abrirDetalhe` só desliga a flag quando a sequência ainda é a dele, fechar com um `GET` em voo deixa
a flag pendurada em `true`.

**Não existe cenário possível com o harness desta base**, e isso foi rastreado, não presumido: nas
duas telas todo consumidor de `loadingDetalhe` só renderiza com o painel aberto, e abrir o painel
passa por `abrirDetalhe`, que liga a flag na entrada. Em Requisições o botão de refresh
(`disabled={loadingDetalhe}`) está sob `{detalhe && (...)}`, que é `null` depois do ✕.

**Escolhido (c1 da medição):** corrigir as duas linhas e **escrever no código** que não há cenário
porque não há consumidor observável, com o controle positivo declarado como **no-op**. É o **caso 2**
da `fechar-etapa` ("o defeito virou inalcançável"): manter a forma segura e declarar que a suíte não a
protege. **Descartado (c2):** dar a Recebimentos o botão de atualizar o detalhe que Requisições tem,
só para a flag ganhar consumidor — é **feature**, não régua; e mesmo com ele a flag **continua**
inobservável depois do ✕ (o botão morre com o painel). Não amarrar as duas coisas.

**Descartado também:** inventar uma asserção que passe antes e depois do conserto. Seria o **teste
vazio** que o CLAUDE.md manda desconfiar, e seria o quinto caso desta base.

## Regras de negócio

> **Numeração:** esta etapa usa **RN-11 a RN-19**. A feature 08 já carrega RN-04 a RN-09 **da Etapa
> 35** (escritas no `08-recebimento/README.md`), e reusar RN-01.. faria `grep RN-07` achar duas regras
> diferentes na mesma feature — o oposto do que a Fase 1 da skill pede.

- **RN-11 — `tipo_recebimento` só aceita o enum, nas DUAS portas.** *Cenário:* `POST /recebimentos`
  com `tipo_recebimento: 'BANANA<script>'` → **400** e
  `error === 'Dados inválidos — tipo_recebimento: forma de recebimento inválida (use NOTA_FISCAL ou PEDIDO_COMPRA)'`;
  e `PUT /:id/fiscal` com `tipo_recebimento: 'QUALQUER_COISA'` → **400** com a **mesma** literal e a
  coluna **inalterada** no banco. Metades positivas: `POST` válido com `nota_fiscal`, `observacoes`,
  `fornecedor_cnpj` e `itens[0].lote` → **201** com as **quatro** colunas gravadas (é o cenário que
  cai se alguém trocar `looseObject` por `object`); e `POST` **sem** o campo, com `pedido_compra_id`
  → **201** e `tipo_recebimento = 'PEDIDO_COMPRA'` (o default derivado não pode morrer).
- **RN-12 — a mesma NF do mesmo fornecedor não entra duas vezes.** *Cenário:* dois `POST` com
  `nota_fiscal: 'NF-DUP-1'` e o mesmo `fornecedor_id` → **201** e **409**, com
  `error === 'Nota fiscal NF-DUP-1 já lançada no recebimento <numero> para este fornecedor'`. A
  asserção que mede o **dano**, não a porta: processando as duas tentativas, o saldo do material fica
  **10** (não 20) e `contas_pagar` tem **1** linha (não 2).
  ⚠️ **(revisão final)** a régua deste cenário **estava incompleta**, e a implementação que ela
  aprovou era contornável de **três** jeitos, os três medidos por sonda:
  **(R3)** `UPPER` do SQLite é **ASCII-only** — `'José Aços Ltda'` e `'JOSÉ AÇOS LTDA'` com a mesma
  NF e sem id/CNPJ entravam as duas (**201 + 201**, estoque creditado duas vezes), e é o caminho
  real da tela, que manda nome digitado à mão;
  **(R4)** a **ordem de preferência** escolhia UMA perna e descartava as outras, então o documento A
  digitado à mão (só nome) e o B escolhido no `<select>` (nome **e** CNPJ) nunca se encontravam;
  **(R5)** a perna do CNPJ fazia `TRIM` na **coluna** e não no **parâmetro**, e ignorava pontuação.
  Regra correta: buscar os candidatos pela **NF normalizada** (`UPPER(TRIM(...))` basta — NF é
  ASCII) com `id <> ?`, e comparar o fornecedor **em JS**, casando se **QUALQUER** perna casar —
  mesmo `fornecedor_id`; ou mesmo **CNPJ só-dígitos** (não vazio); ou mesmo **nome normalizado**
  (NFD, `\p{M}` removido, upper, trim, espaços colapsados; não vazio). Os *skips* da RN-13 ficam.
  ⚠️ **Consequência assumida:** a consulta da **letra A** do fechamento, que mede duplicatas em
  produção, roda em SQL e **não** consegue remover acento em SQLite — ela **sub-reporta** as
  duplicatas por acento. Réguas: cenários (8), (9) e (10) de `recebimentoNfDuplicada.api.test.js`.
- **RN-13 — três coisas NÃO são duplicata: NF vazia, fornecedor diferente e fornecedor não
  identificado.** *Cenário:* dois `POST` com a mesma NF e **fornecedores diferentes** → **201** nos
  dois; dois `POST` **sem** `nota_fiscal` para o mesmo fornecedor → **201** nos dois; dois `POST` com
  a mesma NF e **nenhum** identificador de fornecedor (`fornecedor_id`, `fornecedor_cnpj` **e
  `fornecedor_nome`** nulos — **Fase 2**) → **201** nos dois. **(Fase 2) mais o cenário que fecha o
  buraco:** dois `POST` com a mesma NF e **só** `fornecedor_nome` igual (o payload que a tela manda
  de verdade) → **201** e **409**.
- **RN-14 — a guarda vale na segunda porta, e não acusa o próprio documento.** *Cenário:* documento A
  com `NF-X`; documento B sem NF; **(Fase 2) os dois avançados para `EM_CONFERENCIA` por
  `POST /workflow {acao:'iniciar_conferencia'}`, porque `salvarDadosFiscal` recusa `RECEBIDO` antes
  de olhar a NF** (`receiptService.js:253-259`, medido); `PUT /B/fiscal` com `nota_fiscal: 'NF-X'` e
  o mesmo fornecedor → **409** com a literal da RN-12 citando o número de A. Metade positiva:
  `PUT /A/fiscal` com a **própria** `NF-X` → **200** (salvar os dados fiscais duas vezes não pode se
  autoacusar). **Sem o avanço de status, as duas metades respondem `400 'Dados fiscais só podem ser
  editados antes do processamento'` e a RN-14 fica sem régua.**
- **RN-15 — o workflow não pula etapas.** *Cenário:* `POST /:id/workflow {acao:'processar'}` num
  recebimento `RECEBIDO` → **400** e `error === 'Não é possível "processar" no status atual (RECEBIDO)'`;
  `{acao:'inexistente'}` → **400** e `'Ação de workflow inválida'`. Metade positiva: a sequência
  `iniciar_conferencia → finalizar_conferencia → encaminhar_compras → finalizar_compras →
  iniciar_faturamento` responde **200** cinco vezes (sem ela, um `throw` incondicional passaria).
- **RN-16 — a conferência grava quanto chegou de verdade.** *Cenário (client):* painel de um
  recebimento `EM_CONFERENCIA` com item de `quantidade_esperada: 200`; digitar `187` no campo de
  quantidade conferida e clicar **"Salvar Conferência"** → `api.put` chamado **uma** vez com
  `'/almoxarifado/recebimentos/58/conferir'` e
  `{ itens: [{ id: 581, quantidade_recebida: 187, conferencia_quantidade: false }] }`. *Cenário
  (servidor):* `PUT /:id/conferir` com `quantidade_recebida` menor que a esperada → **200**, coluna
  gravada, e `alertRegistry.listarDivergenciasRecebimento({ recebimentoId })` **lista** aquele item.
  **(Fase 2) mais a metade que impede o dano novo:** campo **limpo** → o payload sai **sem** a chave
  `quantidade_recebida` (nunca `0`, que `Number('')` produziria), e o `COALESCE` do `/conferir`
  preserva a coluna. Medido por sonda: hoje um item enviado sem o campo deixa
  `quantidade_recebida = null` **e** `observacoes = null` — **duas** colunas apagadas, não uma.
- **RN-17 — divergência aparece na tela, com as duas quantidades.** *Cenário:* com `187` digitado
  contra `200` esperados, o painel contém o texto literal
  **`Divergência: 13 a menos que o esperado (200)`** e as duas quantidades (`187` e `200`) estão no
  DOM. Metade positiva: digitar `200` → o aviso **não** aparece e as duas quantidades continuam
  visíveis.
- **RN-18 — excedente exige `autorizar_excedente`, nas DUAS portas.** *Cenário:* `PUT /:id/conferir`
  com `quantidade_recebida: 999` contra `quantidade_esperada: 10` → **400** e
  `error === 'Quantidade recebida (999) maior que a esperada (10) no item #<id> — a autorização de excedente é de Compras ou do Administrador'`;
  com `autorizar_excedente: true` e perfil **ALMOXARIFE** → **403** e
  `error === 'Autorizar recebimento acima do pedido exige a permissão "autorizar_excedente" (seu perfil: ALMOXARIFE).'`;
  com `autorizar_excedente: true` e perfil **COMPRAS** → **200**, coluna gravada e **linha de
  auditoria** `EXCEDENTE_AUTORIZADO`. Mesmos três casos pela porta do `PUT /:id/fiscal`. Metades
  positivas: `recebida === esperada` e `recebida < esperada` continuam **200** sem flag nenhuma.
  ⚠️ **(execução, fix-round 1) este cenário dizia "perfil GESTOR → 200", e estava errado:** pela rota
  o GESTOR nem chega ao serviço (403 de `receber_material`). O perfil da metade positiva é **COMPRAS**,
  o único não-admin com as duas coisas, e o **GESTOR virou caso NEGATIVO** — `conferirRecebimento`
  chamado direto no serviço responde **403** com a literal nomeando `autorizar_excedente`. Ver o bloco
  corrigido da seção (c).
  ⚠️ **(revisão final)** este cenário **estava incompleto**: ele descrevia a barreira sobre o valor
  ABSOLUTO (`recebida > esperada`), e com isso um recebimento com excedente **já autorizado** nunca
  mais conseguia salvar dados fiscais nem uma nova conferência — as duas telas **reenviam a
  quantidade já gravada** de todos os itens, e nenhuma das duas manda `autorizar_excedente` no
  modal de NF. O documento ficava **preso** (o `processar` seguinte morre em
  `validarDadosProcessamento`), e toda linha de **acervo** com `recebida > esperada` tomava 400 no
  deploy. A regra correta tem **duas** condições: barreira só quando `recebida > esperada` **E**
  `recebida > quantidade_recebida gravada` — um **aumento** sobre o que já está registrado. Ecoar
  ou **baixar** nunca barra, e a linha de auditoria `EXCEDENTE_AUTORIZADO` só nasce quando a
  barreira realmente disparou (antes, re-marcar a caixa gravava uma linha nova por save).
  Réguas: cenários (6) a (11) de `recebimentoExcedente.api.test.js`.
- **RN-19 — fechar o painel desliga o "carregando", nas duas telas.**
  **Declaradamente SEM régua automatizável**, com a razão escrita no código: todo consumidor de
  `loadingDetalhe` só renderiza com o painel aberto, e abrir o painel passa por `abrirDetalhe`, que
  liga a flag. Controle positivo é **no-op**, e isso vai dito — não se inventa cenário que passa dos
  dois lados.

## O sort, e por que ele mudou em relação à proposta do controlador

O critério é o da Fase 3 da skill: **motor, migration, `ACAO_PERFIS` ou regra compartilhada = tronco**;
**tela contra contrato congelado = galho**. Duas reclassificações, as duas ditas aqui porque mudam a
ordem de execução:

| Proposta do controlador | Nesta etapa | Por quê |
|---|---|---|
| T5 (excedente) como **galho de T4** | **tronco, e vem ANTES do client** (é a T3) | a ação `autorizar_excedente` **não existe** (medido) — criar ação é mexer em `ACAO_PERFIS`, que é regra compartilhada por definição, e o contrato do 403 é o que a tela consome |
| T4 (campo de conferência) como **tronco, maior valor** | **galho** (é a T5), e continua sendo o item de maior valor | maior valor **não é** o critério de tronco: tronco é acoplamento. A tela consome contrato congelado e não bloqueia ninguém — classificá-la como tronco a colocaria antes da permissão que ela precisa citar |

## Decisões desta etapa (vão para a letra B do doc de novidades, a partir de **B80**)

| # | Decisão | Descartado, e por quê |
|---|---|---|
| 1 | `TIPOS_RECEBIMENTO` com **fonte única em `schema.js`**, consumido por `schemas.js` e por `receiptService.js:108` | repetir o array nos dois schemas Zod e deixar o literal do service como está — duas (três) definições do mesmo enum divergem na primeira edição |
| 2 | **`z.looseObject`** nos dois schemas, com `.optional()` | `z.object` (descarta `nota_fiscal`/`itens` e derruba todo POST válido — medido); exigir o campo (quebra dois testes existentes que confiam no default derivado) |
| 3 | **mensagem literal própria em português**, numa constante só para as duas portas | a mensagem padrão do `z.enum` (sai em inglês no Zod 4.4.3 e sem o valor recebido — medido); duas literais escritas à mão (divergem na primeira edição) |
| 4 | NF duplicada: **guarda em serviço + índice NÃO único**, nos dois escritores | `UNIQUE(nota_fiscal, fornecedor_id)` — produção pode ter acervo sujo e o `safeAlter` falharia na subida; `NULL` não colide, então o índice seria parcial onde mais importa; e a recusa viria como `SQLITE_CONSTRAINT`, não como literal legível. **A letra A leva a consulta SQL de medição para antes do deploy** |
| 5 | **NF vazia/`null` não é duplicata**; mesma NF de **fornecedor diferente** passa; **fornecedor não identificado** (id, CNPJ **e nome** nulos — **Fase 2**) também não caracteriza duplicata |
| **5b (Fase 2)** | o fornecedor da chave é `fornecedor_id` → `fornecedor_cnpj` → **`UPPER(TRIM(fornecedor_nome))`** | parar em id/CNPJ: a tela **nunca** manda `fornecedor_id` (medido em `handleCriar`), então a guarda não dispararia pelo caminho real sem CNPJ digitado — regra entregue e porta faltando; e mandar `fornecedor_id` no payload da tela, que acopla a T2 (tronco de servidor) à T5 e não cobre o acervo |
| **5c (Fase 2)** | o `WHERE` **não** filtra `status <> 'CANCELADO'` | manter a cláusula: `STATUS` do recebimento não tem `'CANCELADO'` (os 11 são `RECEBIDO`..`BLOQUEADO`, `receiptService.js:43-55`) — era código morto que fazia o próximo leitor acreditar num cancelamento inexistente | barrar os três casos — recebimento sem NF é legítimo pelo caminho do pedido, dois fornecedores emitem nota com o mesmo número, e tratar "sem fornecedor" como fornecedor único juntaria documentos de origens diferentes (e derrubaria os arquivos de teste que criam recebimento pela rota sem `fornecedor_id`) |
| 6 | **ação nova `autorizar_excedente`** em `ACAO_PERFIS` ~~`[ADMINISTRADOR, GESTOR, COMPRAS]`~~ → **(execução, fix-round 1)** `[ADMINISTRADOR, COMPRAS]`: **o GESTOR aqui estava errado**, ele não tem porta (nenhuma das duas rotas o deixa passar, e não há outro chamador do serviço), então seria configuração morta que o `minhas-permissoes` reportaria como `true`. Checada **no serviço** por `can()` | só a flag no payload (o "reversível" da medição): flag que qualquer perfil liga não é barreira, é formulário; `requirePermission` na rota (quebraria o `/conferir` para o ALMOXARIFE, que é quem confere); **e, no fix-round: alargar `receber_material`** (permissão larga para problema estreito) **e abrir rota de exceção** (porta nova — foi para a letra B como etapa própria) |
| 7 | **ALMOXARIFE fora** da ação de excedente, de propósito | incluí-lo pelo argumento de que ele "já tem `receber_material`" — quem recebe não autoriza o próprio excedente (mesmo critério escrito em `gerenciar_plano_inspecao`) |
| 8 | quantidade conferida grava por **`PUT /conferir`** | `PUT /fiscal` (o que a medição propôs): renderiza só no Faturamento, três transições depois do gesto real, e deixaria a rota `/conferir` morta — a classe de defeito que as Etapas 6, 32 e 34 já pagaram |
| 9 | `COALESCE` na quantidade do `/conferir`, junto | deixar como está e confiar no payload: a rota está ganhando o **primeiro** chamador da vida, e item sem o campo apagaria a quantidade |
| 10 | `setLoadingDetalhe(false)` nas **duas** telas, **sem régua**, com o motivo no código | consertar só Recebimentos (o defeito é gêmeo — `RequisicoesList.js:320` tem o mesmo resíduo, e o `2817054` **não** o pegou); ou inventar cenário que passa antes e depois |
| 11 | **RN-11 a RN-19** em vez de RN-01.. | reusar a faixa da Etapa 35, que a spec 08 já documenta — `grep RN-07` acharia duas regras diferentes na mesma feature |

## Riscos, e onde o desenho os fecha

| # | Risco | Fechado por |
|---|---|---|
| R1 | `z.object` no lugar de `looseObject` derruba **todo** POST válido, e um teste que só cheque o 400 do enum fica verde | o cenário positivo de 4 colunas da RN-11 é sabotagem nomeada na T1 |
| R2 | esquecer a linha do `module.exports` de `schemas.js` → `undefined.safeParse`, **500** depois do gate | sabotagem 3 da T1, e está escrito no design |
| R3 | guarda de NF só no `POST`, contornável pelo `PUT /fiscal` | RN-14, com a metade positiva do documento que salva a própria NF |
| R4 | asserção de "2 contas a pagar" **vazia**: `gerarContaPagar` devolve `null` quando a tabela não existe (`receiptService.js:648-650`), e **nenhum** dos 169 arquivos de `tests/api/` cria `contas_pagar` (grep vazio) | a T2 cria a tabela no próprio arquivo e **afirma 2 linhas ANTES do conserto** (é o vermelho medido) |
| R5 | asserção negativa de permissão **fica verde antes de a ação existir** (`can()` devolve `false` para o que não conhece) — regra explícita da `fechar-etapa` | a T3 mede o **403 do ALMOXARIFE** e o **200 do GESTOR** no mesmo cenário; o positivo é o que prova que a lista não é vazia |
| R6 | `requirePermission('autorizar_excedente')` na rota quebraria o `/conferir` para quem confere | decisão 6: checagem condicional no serviço, molde `ownerRules.assertAjustePermitido` |
| R7 | cenário de client verde com o painel vazio | metade positiva em todos: as duas quantidades no DOM, `api.put` contado (`toHaveLength(1)`, nunca `toHaveBeenCalledWith` solto) |
| R8 | o campo novo quebrar o cenário (g) da Etapa 34 (identidade do nó do bloco de anexos) | o input entra **dentro** do bloco de itens, que já vive sob o ternário de `loadingDetalhe`; o bloco de anexos **não** é tocado, e a suíte inteira do arquivo roda na T5 |
| R9 | "verde de primeira" em qualquer cenário novo | controle positivo obrigatório em toda task, com `grep -cF` = 1, `perl -0pi -e`, `md5sum` antes/depois/depois-de-restaurar e **nunca** `git checkout --` |
| R10 | `tipo_recebimento` inválido **já gravado** em produção ficar impossível de corrigir pela tela (o modal fiscal não tem o campo) | fora de escopo, mas **declarado**: medido `[]` recebimentos no banco de desenvolvimento, e a letra A leva a consulta para medir produção antes do deploy |
| **R11 (Fase 2)** | a guarda de NF ficar **inalcançável pela tela** porque `handleCriar` não manda `fornecedor_id` | terceira perna da chave (`UPPER(TRIM(fornecedor_nome))`), com o cenário `(7)` da T2 que entra pelo payload real e a sabotagem 5 que o prova |
| **R12 (Fase 2)** | a ação nova e a auditoria nova quebrarem **três** testes que a T3 não roda (`permissaoErro.test.js` de client, e as duas asserções de cobertura de `auditLabels.api.test.js`) | os três arquivos entraram nos `Files` da T3, e o Step 4 dela passou a rodar `auditLabels.api.test.js` **e** a suíte de client de `permissaoErro` |
| **R13 (Fase 2)** | campo de quantidade limpo virar `quantidade_recebida: 0` (`Number('')`), gravar zero e disparar alerta de divergência falso | `salvarConferencia` **omite** o campo quando vazio, o `COALESCE` da T3 preserva, e o cenário `(p)` afirma que a chave **não** está no payload |
| **R14 (Fase 2)** | sabotagem que só sabe produzir **500** passar por controle positivo (era o caso da nº 2 da T4: apagar `if (!t)` estoura `TypeError` em `t.de`) | trocada por alteração da **literal**; e as nº 1 e nº 3 da T4 tiveram a previsão corrigida — elas caem **pela literal**, porque `processarNota` tem barreira própria e o status continua 400 |

## O que esta etapa NÃO cobre

- **Recebimento parcial de pedido.** `itens_pedido_compra` (`schema.js:1292-1303`) tem 7 colunas e
  **não** tem `quantidade_recebida` nem `saldo_pendente`; `grep -rn itens_pedido_compra server/` fora
  de testes dá **dois** hits, os dois de leitura — **zero escritores**. O teste exigido
  `recebimento parcial atualiza saldo pendente do pedido` é coluna nova + escritor + decisão de quando
  o pedido fecha, atravessando o módulo de Compras. **Etapa própria.**
- **Conferência física estruturada** (contagem, pesagem, medição, checklist configurável por tipo de
  material) — fora de escopo desde a Etapa 5, decisão de design de 2026-08-07.
- **Registro formal de divergência** (tipo, quantidade, ação, com número próprio). Hoje
  `conferencia_quantidade`/`conferencia_descricao` são **booleanos**. Depende da RN-16 para ter dado
  de entrada. **Etapa própria.**
- **Ampliar o enum para os dez tipos da spec 8.1.** É **decisão de negócio**, e as features 11 a 15
  (🟢) já são a porta dos outros tipos — replicá-las como tipo de recebimento é a **segunda porta**
  que a Etapa 24 quase construiu.
- **Sugestão de localização na entrada** (feature 02) e **etiqueta automática ao aprovar** — o que
  falta de verdade no item "Ao aprovar…" da spec 08, agora que a etiqueta manual está medida como
  entregue.
- **Recebimento parcial de NF / estorno de excedente autorizado.** O excedente autorizado entra
  inteiro, com auditoria; devolver o que sobrou é a feature 12.
- **`UNIQUE` no banco para a NF.** Deliberadamente adiado para depois da consulta de produção da
  letra A.
- **Segregação de saldo por almoxarifado.** Almoxarifado é **área física, não filial**: saldo global
  por material segue correto e intencional, e nada aqui propõe seletor de almoxarifado.
- **A limpeza das ~15 citações por linha nos comentários de `RecebimentosAlmoxarifado.test.js`**
  (achado da T7 da Etapa 35). A T5 corrige **só** as que ficarem falsas pelo que ela mesma mudar.
- **O teto da faixa do clipe de `.almox-actions`** (verificação F12 em navegador, herdada da Etapa 35)
  e os furos **C43/C44** da Etapa 33 seguem abertos; nada aqui os toca.
