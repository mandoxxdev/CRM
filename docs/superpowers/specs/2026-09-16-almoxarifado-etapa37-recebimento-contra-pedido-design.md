# Etapa 37 — Recebimento contra o pedido: parcial, excedente e os 21 ALTER que não faziam nada (design)

**Data:** 2026-09-16 · **Módulo:** almoxarifado · **Feature alvo:** 08 (entrada e recebimento de
materiais) · **Feature tocada no galho final:** 00 (fundação técnica — os 21 `ALTER TABLE` residuais)

**Medição de base:** `.superpowers/sdd/etapa37-fase0-candidatos.md` (Fase 0 **comparativa**, HEAD
`5ce3fdf`, só leitura, com **quatro sondas executadas** — duas contra o harness real, uma contra o
banco de produção de 161 MB em READONLY e duas reproduzindo a ordem de boot). Este design acrescenta
**seis medições novas**, feitas na Fase 1, todas por leitura de código (a suíte **não** foi rodada:
outro executor está com ela).

> ⚠️ **(Fase 2) Este design foi escrito ANTES da onda de correção da revisão final da Etapa 36.**
> Revisado em HEAD `41df1cb` (F1 `230baf6` e F2 `41df1cb` commitados; **F3, R1–R7 ainda não**). Quatro
> coisas que ele congelava mudaram, e cada uma está corrigida no lugar com a marca **(Fase 2)**:
> (1) a régua de excedente das duas portas passa a ser *"recebida > esperada **E** recebida >
> armazenada"* — e esta etapa **depende** de ela valer também no `/conferir`, porque a porta nova
> **cria** documentos que nascem excedentes; (2) a literal do 400 da 36 passa a **nomear quem
> autoriza** (F3), e o 400 desta etapa copia o sufixo **do código**; (3) os schemas Zod do
> recebimento **mudam** (R6: schema dos itens do `POST`), ao contrário do que o plano afirmava;
> (4) a guarda de NF passa a comparar fornecedor **em JS, por qualquer perna** (R3/R4).

**Onde a medição corrige a spec, o mapa, o manual ou o escopo do controlador, vale a medição** — e
onde ela divergiu da proposta do controlador, está registrado aqui como **decisão**, com o
descartado. É o que a seção "Decisões desta etapa" carrega para a **letra B** do doc de novidades.

## O problema, em uma frase

O pedido de compra **não sabe que foi recebido**: `itens_pedido_compra` tem 8 colunas, **um** leitor
e **zero escritores**, então um pedido de 10 unidades recebeu **25 em três recebimentos e continuou
`ABERTO` com `quantidade = 10`** (sonda executada), a terceira porta de escrita
(`POST /recebimentos`) aceita **999 de 10 com 201** porque a barreira da Etapa 36 compara com a
linha **já gravada** e é inalcançável ali por construção, e **recebimento parcial é impossível pela
tela** — escolher "Por Pedido de Compra" limpa `itens: []` e não carrega item nenhum, embora o
manual 14.1 prometa ao operador que "o sistema traz os itens, as quantidades e os valores unitários
já preenchidos".

## Fase 0 — o que a medição achou, e o que ela derrubou

### O que estava certo na spec 08 (confirmado)

| Afirmação | Confirmado em |
|---|---|
| `itens_pedido_compra` **não** tem `quantidade_recebida` nem `saldo_pendente` | `schema.js:1305-1316`: **8 colunas** (`id, pedido_id, material_id, codigo, descricao, quantidade, valor_unitario, unidade`). O banco real bate exatamente |
| o recebimento se liga ao pedido por `pedido_compra_id` | gravado em `criarRecebimento`, resolvido por `resolverPedidoCompra` (por `id` **ou** por `numero`) |
| a Fase 0 da Etapa 36 classificou o parcial como **etapa própria** e acertou | 8 tasks, 2 colunas novas, 1 tabela core que **não** se toca — ver abaixo |
| `[ ] Recebimento parcial de pedido` e `[ ] Recebimento excedente só com autorização` (`08/README.md:155-156`) | o segundo item **já é do fechamento da Etapa 36** (não desta etapa — registrado para não ser medido duas vezes); o primeiro é o tronco daqui |
| **zero acervo a migrar**: `COUNT pedidos_compra = 0`, `COUNT itens_pedido_compra = 0`, `COUNT recebimentos_material_almoxarifado = 0` no banco real | sonda `probeProd.js` da Fase 0 — **a migration não invalida dado nenhum e não tem backfill** |

### O que a medição derrubou na candidata A, e por que ela virou galho

- **Os 21 `ALTER TABLE` de `routes/almoxarifado.js` são TODOS mortos** — 21/21 medidos por `PRAGMA`
  depois de `initSchema`; `schema.js` cria todas as 21 colunas (`:759`, `:820-822`, `:882-889`,
  `:1847-1856`, bloco de itens de requisição).
- **A localização na spec está apodrecida:** `00/README.md:31` diz "hoje linhas **~1018-1038**".
  O bloco real está em **`server/routes/almoxarifado.js:1775-1796`**, sob o comentário
  `// NOVAS TABELAS — Requisições, Tipos, Localizações, Configurações`. `:1018-1038` hoje são as
  rotas de **conferências** — quem seguir a referência não acha nada e conclui que a pendência já
  foi paga.
- **A spec subestima:** "vários duplicam colunas que o `schema.js` já cria" → são **todos os 21**.
- **A premissa que elegia a candidata A é FALSA, e isso é medição, não opinião.** O risco imaginado
  era "erro engolido → coluna ausente em produção → 500 na primeira leitura". O banco real tem as
  **21** colunas (`faltando = [nenhuma]`), e o modo de falha **real** é outro: `initSchema` é
  disparado **não-awaited** (`routes/almoxarifado.js:238`) e os 21 ALTERs rodam na **mesma passada
  síncrona** do registrador, 1538 linhas abaixo — em banco novo dão `no such table` ×21, em banco
  migrado `duplicate column name` ×21. **São 21 linhas de código morto que falham 21 vezes a cada
  boot, em silêncio.** O dano é de **leitura** (quem audita `grep ALTER TABLE` acha 21 migrações que
  parecem ser a origem de colunas e não são), não de dado.
- Logo: risco de deploy **zero medido**, valor operacional **zero**, custo ~25 linhas apagadas.
  Cleanup de legibilidade **não ganha** de furo de dado alcançável pela porta HTTP — mas cabe no fim
  desta etapa como **galho de risco zero** (A1 + A3 da Fase 0). A **A2** (varredura de reincidência
  na pasta do módulo) fica fora: ver "O que esta etapa NÃO cobre".

### As seis medições NOVAS desta Fase 1 (nenhuma está em spec nenhuma)

1. **Não existe link entre o item do recebimento e a linha do pedido.**
   `recebimentos_material_itens_almoxarifado` tem `recebimento_id` e `material_id` e **nada** que
   aponte para `itens_pedido_compra` (DDL + `recebItemCols` lidos inteiros). `criarRecebimento` monta
   os itens a partir de `carregarItensPedidoCompra` e **joga o id da linha fora**. Sem esse link o
   acumulador não sabe **em qual linha somar** — com duas linhas do mesmo material no mesmo pedido
   (legítimo: preços ou prazos diferentes), um `UPDATE ... WHERE material_id = ?` atualizaria as
   duas ou a errada. **A etapa precisa de DUAS colunas novas, não uma.**
2. **`pedidos_compra.status` é coluna CORE com vocabulário MINÚSCULO, e escrever nela quebraria a
   tela de Compras.** DDL em `server/index.js:19230-19242` com `status TEXT DEFAULT 'pendente'`;
   `GET /api/compras/pedidos` filtra por `?status=`; `client/src/components/Compras.js:96-108` pinta
   o badge por um mapa de **nove** valores minúsculos (`ativo, inativo, pendente, aprovado,
   rejeitado, em_analise, enviado, recebido, cancelado`) com `colors[status] || '#95a5a6'`, e o
   filtro (`:405-418`) oferece seis deles. Gravar `PARCIAL`/`RECEBIDO` ali pintaria o badge de
   **cinza** com a palavra crua à vista do usuário de Compras, faria o filtro nunca casar, e criaria
   uma **segunda grafia** de `recebido`, que já existe no vocabulário. **É mudança de contrato de um
   módulo core feita de dentro do almoxarifado.** → decisão 4.
3. **Recebimento não tem status `CANCELADO`.** Os 11 status são `RECEBIDO..BLOQUEADO`
   (`receiptService.js:56-67`) — a própria Etapa 36 apagou uma cláusula morta de `'CANCELADO'` na
   guarda de NF por esse motivo (achado R2 da Fase 2 dela). O cenário "recebimento CANCELADO não
   consome saldo" que o escopo pediu **não é escrevível**; o equivalente alcançável, e o que importa,
   é **"recebimento que não entrou no estoque não consome saldo"**. → decisão 6.
4. **`processarNota` NÃO é o único caminho de entrada no estoque.** `aprovarRecebimento` chama
   `darEntradaEstoque` **direto** quando o status não está em `[EM_ENTRADA_NF,
   ENCAMINHADO_FATURAMENTO]` (o ramo que grava `APROVADO`), e existe rota para isso
   (`POST /recebimentos/:id/aprovar`, gate `receber_material`) **com teste que a exercita**
   (`solicitacaoCicloVida.api.test.js:88`, `caminhoAteAprovado`). Um acumulador dentro de
   `processarNota` deixaria esse caminho creditando estoque **sem nunca contar ao pedido** — o mesmo
   defeito que o comentário "RN-03 EMENDADA" de `aprovarRecebimento` registra para o gancho de
   Compras. → decisão 5: o acumulador mora em `darEntradaEstoque`, **dentro do claim**.
5. **`pedidos_compra` não existe no harness, e seis arquivos de teste a criam cada um por sua
   conta** — `almoxarifado.test.js:247`, `compraContextoMaterial:118`, `integracaoComprasJornada:90`,
   `recebimentoTipoEnum:105`, `reposicaoGerarSolicitacoes:72`, `reposicaoJornada:56`,
   `solicitacaoCicloVida:103` (sete, contando a suíte de serviço). **Os DDLs divergem**: o de
   `recebimentoTipoEnum` **não tem `created_at`**, e `listarPedidosCompraAux` faz
   `ORDER BY p.created_at DESC` — nesse arquivo a rota aux **morreria** com "no such column" se
   alguém a chamasse. Todos usam `CREATE TABLE IF NOT EXISTS`, então **quem cria primeiro vence**. →
   decisão 8: o stub vai para o harness.
6. **`itens_pedido_compra` não tem índice em `pedido_id`** (só a FK declarada) e o acumulador vai
   ler/escrever por `pedido_id` a cada entrada de nota. Índice de consulta entra com a migration.

### O que NÃO reabrir (fechado pela Etapa 36, `d02b9f4..5ce3fdf`)

1. **Enum de `tipo_recebimento`** nas duas portas (`d02b9f4`).
2. **NF duplicada** — guarda em serviço, **sem** `UNIQUE` no banco (`ffc5f47`). Decisão mantida.
3. **Excedente no `/conferir` e no `/fiscal`** + ação `autorizar_excedente = [ADMINISTRADOR,
   COMPRAS]` (`f747df4` + `3e36af4`, fix-round que tirou o GESTOR por ele não ter porta).
   ⚠️ **(Fase 2) mas a REGRA dessas duas portas mudou na onda de revisão final da 36, e esta etapa
   DEPENDE da mudança:** a barreira só dispara quando `recebida > esperada` **E**
   `recebida > quantidade JÁ ARMAZENADA` — ecoar ou diminuir não é ato novo de autorização. Em
   `230baf6` isso existe como `opcoes.ignorarInalteradas` (`receiptService.js:280-298`) e é passado
   **só** pelo `/fiscal` (`:464`), **não** pelo `/conferir` (`:334`). Como o `POST` desta etapa passa
   a **criar** documentos que nascem com `recebida > esperada`, **a regra tem de valer nas duas
   portas antes da T2** — senão o documento criado aqui não consegue nem salvar a conferência.
   Não "reabrir" significa **não desfazer**; conferir que está aplicada é obrigação desta etapa.
4. **Campo "Qtd. conferida"** no painel, inclusive o par "campo vazio omite o campo + `COALESCE` no
   serviço" (`e2a23a9` + `d02744a`) — é o que faz *"não contei"* ≠ *"chegou zero"*. **Não mexer.**
5. **Régua de ordem do workflow** (`9d19e7d`) e o `loadingDetalhe` (`5ce3fdf`).

Esta etapa acrescenta a **terceira porta** (`POST`) e a **régua contra o pedido** — que é a peça que
faltava para o excedente ter significado (excedente em relação **a quê**: hoje, só à esperada do
próprio documento, que o próprio operador digitou).

## A decisão de desenho

Três troncos e três galhos. Os troncos são **duas colunas aditivas**, **a terceira porta** e **o
acumulador**; os galhos são **a leitura derivada**, **a tela** e **os 21 ALTER**.

### (a) Migration aditiva — duas colunas, um índice, sem ledger e sem backfill

```js
// server/services/almoxarifado/schema.js
// (1) na lista `recebItemCols`, que já roda por safeAlter:
'pedido_item_id INTEGER',
// (2) logo depois do CREATE TABLE de itens_pedido_compra:
const itensPedidoCols = ['quantidade_recebida REAL DEFAULT 0'];
for (const col of itensPedidoCols) await safeAlter(db, `ALTER TABLE itens_pedido_compra ADD COLUMN ${col}`);
await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_itens_pedido_compra_pedido ON itens_pedido_compra(pedido_id)');
```

**`quantidade_recebida REAL DEFAULT 0`** em `itens_pedido_compra` é o acumulado; **`pedido_item_id
INTEGER`** no item do recebimento é o link medido como ausente (medição nova 1).

**Sem entrada no ledger `schema_migrations_almoxarifado`, e isto é decisão.** O ledger tem **4** ids
aplicados no banco real e **todos** são reconstrução de tabela, backfill ou seed
(`alertas_historico_nullable_material`, `criar_almoxarifado_geral`,
`backfill_quantidade_em_inspecao_item`, `estoque_saldo_lote_id_e_sem_retencao`); as **~40** chamadas
de `safeAlter` não têm ledger nenhum, porque `safeAlter` **já é idempotente** (engole só
`duplicate column name`, loga e **propaga** qualquer outro erro). **Descartado:** registrar no
ledger — daria a impressão de que houve trabalho de dado, e não houve: `COUNT itens_pedido_compra =
0` no banco real, então **não existe backfill a escrever**. A letra A leva a consulta que calcula o
`quantidade_recebida` inicial **se** o usuário quiser backfill um dia (decisão dele, não desta
etapa).

### (b) A terceira porta: `POST /recebimentos` passa a medir contra o SALDO do pedido

Hoje, no caminho `PEDIDO_COMPRA`, `criarRecebimento` copia as quantidades **cheias** do pedido
(`quantidade_esperada = quantidade_recebida = quantidade`) e não olha nada. Passa a:

1. resolver o pedido (já resolve) e carregar as linhas (`carregarItensPedidoCompra`, que **já**
   filtra linha sem `material_id`);
2. calcular, por linha, `saldo = quantidade - COALESCE(quantidade_recebida, 0)`;
3. **sem `itens` no payload** (o caminho que a tela usa hoje): os itens nascem das linhas com
   `saldo > 0`, com `quantidade_esperada = quantidade_recebida = saldo`. Se **nenhuma** linha tem
   saldo → **400** `'Pedido de compra <numero> já foi recebido por completo'`;
   ⚠️ **(Fase 2) mas só quando existem linhas.** "Nenhuma linha com saldo" abriga **dois** casos
   diferentes, e este design os tratava igual: o pedido **quitado** e o pedido **cujo Compras ainda
   não lançou as linhas** (`COUNT itens_pedido_compra = 0`). Dizer a este segundo *"já foi recebido
   por completo"* é **falso** — e é justamente o pedido que a decisão (d) manda **manter visível** em
   `?pendentes=1` como `ABERTO`: a tela o oferece e a porta o recusa mentindo. Literal própria:
   **400** `'Pedido de compra <numero> não tem itens lançados no módulo Compras'`. São duas
   contagens (`COUNT` das linhas × `SUM` dos saldos) e duas literais;
4. **com `itens` no payload:** cada item é ligado a uma linha — `pedido_item_id` do payload **se, e
   só se, ele pertencer a este pedido**, senão a linha do mesmo `material_id` com menor `id` e
   `saldo > 0`, senão a linha do mesmo material com menor `id`. Sem linha correspondente, o item
   mantém o que o payload mandou e **não tem régua de saldo** (ver "NÃO cobre");
5. **a régua é por MATERIAL, agregada:** `recebidaTotal` do payload para aquele material contra
   `saldoMaterial = SUM(saldo das linhas daquele material)`. É o que impede um 400 absurdo quando o
   pedido tem duas linhas do mesmo material e o operador digitou na "linha errada";
6. `quantidade_esperada` do item **nasce do saldo**, não do payload (RN-25). Efeito medido de graça:
   o `/conferir` e o `/fiscal` da Etapa 36 passam a comparar contra o **saldo do pedido**, porque é
   ele que está gravado na coluna que eles leem.
   ⚠️ **(Fase 2) e o saldo é CONGELADO na linha do item, no instante da criação.** As duas portas da
   36 leem `atual.quantidade_esperada` da linha gravada (`receiptService.js:285-290`), nunca
   recalculam o saldo do pedido — então um pedido consumido por **outro** recebimento processado
   **depois** desta criação **não** muda a esperada deste documento. Isso é contrato, não bug (o que
   o operador conferiu foi o que ele recebeu), mas a frase "passam a comparar contra o saldo do
   pedido" lida sem esta ressalva faria o próximo leitor esperar recomputação.

**A barreira reusa a metade DECISÓRIA de `assertExcedentePermitido`, e não a função inteira** —
porque a função inteira é **inalcançável** no `POST` por construção, medido na Fase 0: ela compara o
payload com a linha **já gravada** (`SELECT ... WHERE id = ? AND recebimento_id = ?`) e faz
`continue` quando não acha; no `POST` os itens ainda não existem. O que se extrai é o pedaço que
**tem** de ser único:

```js
// A metade DECISORIA, compartilhada com a Etapa 36: a intencao (a flag) e a AUTORIDADE (a acao).
// Cada porta coleta os excedentes e formata o proprio 400, porque "excedente" mede coisas
// diferentes em cada uma — contra a esperada do item JA GRAVADO (36) e contra o SALDO DO PEDIDO
// (37). O 403 e o mesmo texto nas tres portas, e por isso mora aqui, em UM lugar.
function assertAutorizacaoExcedente(user, autorizado, mensagem400) {
  if (!autorizado) throw Object.assign(new Error(mensagem400), { status: 400 });
  if (!can(user, 'autorizar_excedente')) {
    throw Object.assign(new Error(
      'Autorizar recebimento acima do pedido exige a permissão "autorizar_excedente"'
      + ` (seu perfil: ${getPerfilFromUser(user)}).`), { status: 403 });
  }
}
```

`assertExcedentePermitido` **mantém o nome, a assinatura e os dois chamadores da Etapa 36** e passa a
terminar delegando aqui. Consequência que é a própria prova do reuso: mudar o texto do 403 **num
lugar** derruba o teste da 36 **e** o desta etapa — é a sabotagem 3 da Task 2.

**O 400 do caminho do pedido tem literal PRÓPRIA, e isso é decisão.** A da Etapa 36 diz
`…maior que a esperada (10) no item #58…` — no `POST` **não existe id de item** (nada foi inserido
ainda) e "esperada" não é o que se está medindo. A literal congelada é:

```
Quantidade recebida (6) maior que o saldo do pedido (4) para o material ALM-0100 — marque a autorização de excedente para registrar
```

**Descartado:** parametrizar a literal da 36 com um pedaço variável ("no item #x" / "para o material
y") — uma frase com dois buracos para dizer duas coisas diferentes fica pior de ler nas duas portas,
e a régua deixaria de poder afirmar texto literal.

**A trilha `EXCEDENTE_AUTORIZADO` roda DEPOIS dos `INSERT`**, uma linha por item excedente, entidade
`recebimento_item` com o id **recém-inserido** — os dois rótulos (verbo e entidade) **já existem**
desde a Etapa 36, então esta etapa **não toca** `auditLabels.js` e não corre o risco F4 que a 36
pagou. A **recusa**, ao contrário, é **antes** de qualquer `INSERT`: não há transação neste módulo, e
recusar depois de gravar deixaria o documento no banco com um 400 por cima. A asserção que mede o
dano é `COUNT(recebimentos) === 0`, não o status.

### (c) O acumulador: na ENTRADA FÍSICA, dentro do claim, nos DOIS caminhos

```js
// dentro de darEntradaEstoque, no bloco `if (qtd > 0)`, DEPOIS de `entrouFisicamente = true`
// (Fase 2) NAO-FATAL, no molde da griffagem de series 30 linhas acima (receiptService.js:797-807):
// dali para baixo o catch de :826-836 NAO devolve o claim, entao um throw aqui faria processarNota
// falhar DEPOIS de o estoque ja ter entrado — documento fora de PROCESSADO, item reclamado, e o
// reprocessamento pulando o item. E o modulo ASSUME que essas tabelas podem faltar
// (listarPedidosCompraAux:955-957, gerarContaPagar:842-844). Perder a contagem de um pedido com um
// warn e reparavel por SQL; travar a nota nao e.
if (item.pedido_item_id) {
  try {
    await dbRun(db, `UPDATE itens_pedido_compra
      SET quantidade_recebida = COALESCE(quantidade_recebida, 0) + ? WHERE id = ?`,
      [qtd, item.pedido_item_id]);
  } catch (ePedido) {
    console.warn(`[recebimento] contagem do pedido falhou (item ${item.id}, `
      + `linha do pedido ${item.pedido_item_id}): ${ePedido.message}`);
  }
}
```

**Por que em `darEntradaEstoque` e não em `processarNota`:** medição nova 4 — `aprovarRecebimento`
chama `darEntradaEstoque` direto, com rota própria e teste que a exercita. Em `processarNota`, o
caminho `aprovar` creditaria estoque sem contar ao pedido.

**Por que DENTRO do claim `entrada_estoque_em IS NULL`:** herda a idempotência **de graça** — de duas
execuções (reprocessamento, dois cliques em "Processar Nota") só uma casa o `WHERE`, então só uma
soma. Sem isso, reprocessar somaria 5 duas vezes e o pedido diria 10.

**Por que DEPOIS de `entrouFisicamente = true` e não logo após o claim:** se a movimentação falhar
antes da entrada física, a marca é **devolvida** (`entrada_estoque_em = NULL`) — somar antes deixaria
o pedido creditado por material que não entrou, e exigiria compensação explícita. Depois da entrada
física a marca **fica** de propósito, e a soma acompanha: "o material entrou → o pedido recebeu".
**Descartado:** acumular no `POST` (contaria material que ainda não entrou e faria recebimento
abandonado consumir saldo do pedido) e acumular no `/conferir` (a conferência é revisável, o
estoque não).

**Efeito declarado:** uma linha do pedido pode terminar com `quantidade_recebida > quantidade` —
quando o excedente foi autorizado, ou quando duas linhas do mesmo material dividiram um recebimento
pela régua agregada. Isso **não** mente, porque a situação do pedido é derivada de **somas**, não de
linha a linha. Está dito aqui e vai para o guia. ⚠️ **(Fase 2) consequência que faltava:**
`saldo_pendente` tem de ser **`Math.max(0, pedida - recebida)`** nas **duas** rotas de leitura —
sem o clamp a resposta traz `-2`, a tela escreve `Saldo pendente: -2` e a asserção da RN-24
(`saldo_pendente: 0` no pedido completado) fica **falsa exatamente no caso que esta etapa cria**.

⚠️ **(Fase 2) O que o acumulador na entrada física NÃO fecha, e tem de estar escrito antes de a
etapa rodar:** como o saldo só se move aqui, **dois recebimentos de 10 criados contra o mesmo pedido
de 10 antes de qualquer um processar respondem 201 os dois**; processados, a linha termina com 20 e o
400 do saldo **nunca aparece**. Não é a corrida de `check-then-insert` já declarada (essa é
simultânea) — é **sequencial e inerente à decisão 5**, e é o **mesmo** mecanismo que faz a RN-23
valer ("criado e não processado não consome saldo"). Fechar isso exigiria contar também o
**reservado em documento aberto**, o que muda o significado da palavra "saldo" — etapa própria. Vai
para a letra **G** e para "O que esta etapa NÃO cobre", não para "corrigido".

### (d) A situação do pedido é DERIVADA na leitura — a tabela core não é escrita

⚠️ **Divergência entre a medição e o escopo do controlador, resolvida aqui.** O escopo pedia
"status do pedido (`ABERTO` → `PARCIAL` → `RECEBIDO`) derivado ao processar", e a palavra *derivado*
é a que decide: **derivado na leitura, e nenhuma escrita em `pedidos_compra`** (medição nova 2 — é
tabela core, o vocabulário do badge de Compras é minúsculo e `recebido` já existe lá).

```
GET /almoxarifado/recebimentos-aux/pedidos-compra        → + quantidade_pedida, quantidade_recebida,
                                                            saldo_pendente, situacao_recebimento
                                                         → aceita ?pendentes=1
GET /almoxarifado/recebimentos-aux/pedidos-compra/:id/itens  (rota NOVA)
```

`situacao_recebimento` numa função só, consumida pelas duas rotas:

| Quando | Valor |
|---|---|
| `quantidade_recebida === 0` (inclui pedido **sem itens**) | `ABERTO` |
| `0 < quantidade_recebida < quantidade_pedida` | `PARCIAL` |
| `quantidade_pedida > 0` **e** `quantidade_recebida >= quantidade_pedida` | `RECEBIDO` |

`?pendentes=1` filtra `situacao_recebimento <> 'RECEBIDO'` — **não** `saldo_pendente > 0`, porque
pedido cujos itens o Compras ainda não lançou tem saldo 0 e **precisa** continuar visível, senão a
tela perde justamente o pedido que ninguém recebeu. Sem o filtro, os dois aparecem (é a metade
positiva que impede o filtro cego).

⚠️ **(Fase 2) O filtro roda no `WHERE`, ANTES do `LIMIT 50` — não em `.filter()` sobre o resultado.**
`listarPedidosCompraAux` termina em `ORDER BY p.created_at DESC LIMIT 50`
(`receiptService.js:967`): peneirar depois aplicaria a régua **aos 50 mais novos**, e num banco cujos
50 pedidos mais novos estejam quitados `?pendentes=1` devolveria **`[]` havendo pedido aberto** — a
tela ficaria sem o único pedido recebível, que é o oposto do que este filtro existe para fazer. A
cláusula é a **negação** da tabela acima, escrita em SQL
(`soma_recebida IS NULL OR soma_recebida = 0 OR total_pedido = 0 OR soma_recebida < total_pedido`),
e a função única continua sendo a fonte do **rótulo**. Cenário próprio na T4, porque nenhuma
asserção de conteúdo pega a **posição** de um filtro em relação a um `LIMIT`.

**Descartado:** gravar um `status` novo em `pedidos_compra` (mudança de contrato core, com badge
cinza e filtro que não casa — o custo está medido, não suposto) e criar uma coluna
`situacao_recebimento` na tabela core (mesma objeção, mais uma coluna a manter sincronizada). O
reversível escolhido custa **uma subquery** e se desfaz apagando duas linhas.

### (e) A tela: escolher o pedido passa a carregar os itens com o saldo

`RecebimentosAlmoxarifado.js:920-935` hoje mostra **só** o `<select>` de pedidos e `handleCriar`
manda `itens: []`; é o servidor que preenche com as quantidades cheias. Resultado medido: **o gesto
"chegaram 5 dos 10" não existe na tela**, e o mais próximo é criar cheio e corrigir depois no
`/conferir`, que grava `quantidade_esperada = 10` para sempre.

Passa a: ao escolher o pedido, buscar `…/pedidos-compra/:id/itens`, montar `form.itens` com as
linhas de `saldo_pendente > 0` (quantidade **editável**, nascendo igual ao saldo), mostrar
`Saldo pendente: <n>` por item, o aviso `Acima do saldo: <n> a mais que o saldo do pedido (<saldo>)`
quando o operador digita mais, e a caixa **`Autorizo o recebimento acima do pedido`** — a **mesma**
literal do painel da Etapa 36, porque é a mesma decisão — só para quem tem
`pode('autorizar_excedente')`. O hook **falha aberto de propósito**: quem decide é o backend, e a
recusa (400 ou 403) fica **no DOM** com `role="alert"`, não só no toast.

Pedido quitado devolve lista vazia → a tela diz `Este pedido já foi recebido por completo.` e o
submit não vai. O aviso da tela usa palavras **diferentes** do painel (`Acima do saldo:` em vez de
`Divergência:`) de propósito: são duas medidas diferentes (saldo do pedido × esperada do item), e
reusar a frase faria o operador ler a mesma coisa para dois fatos distintos.

### (f) Os 21 ALTER: apagar, e dizer que a spec estava errada

O bloco de `routes/almoxarifado.js:1775-1796` sai inteiro — as 21 linhas **mais** o comentário
`// Adicionar coluna tipo_material_id na tabela materiais (se não existir)`, que descreve o que o
bloco **não** faz. O guardião `schemaUnico.api.test.js` (que hoje varre **só** `CREATE TABLE`) ganha
dois cenários: a varredura de `ALTER TABLE` no arquivo de rotas, e o **controle positivo** que sobe o
app **só** com `initSchema` e afirma as **21 colunas por nome** via `PRAGMA table_info` — é a sonda
`probeAlters.js` promovida a teste, e é o que distingue "apaguei porque era morto" de "apaguei e
cruzei os dedos".

A spec 00 e a linha 00 do mapa são corrigidas **dizendo que estavam erradas** (regra 5 do
CLAUDE.md): a referência `~1018-1038`, o "vários duplicam" que são todos, e a premissa do risco.
O `initSchema` não-awaited entra como **fragilidade (letra G)** e **não** é consertado aqui: awaitar
o boot muda a ordem de subida do servidor inteiro e é tronco de outra etapa.

## Regras de negócio

> **Numeração:** esta etapa usa **RN-20 a RN-27**. A feature 08 carrega RN-04 a RN-09 (Etapa 35) e
> RN-11 a RN-19 (Etapa 36), escritas no `08-recebimento/README.md` — reusar faixa faria `grep RN-18`
> achar duas regras diferentes na mesma feature.

- **RN-20 — o `POST` recusa acima do SALDO do pedido, e não grava documento.** *Cenário:* pedido com
  uma linha de 10, já com 6 recebidos e processados (saldo 4); `POST /recebimentos` com
  `pedido_compra_id` e um item de `quantidade_recebida: 6` → **400** e
  `error === 'Quantidade recebida (6) maior que o saldo do pedido (4) para o material <codigo> — marque a autorização de excedente para registrar'`,
  **e `COUNT(recebimentos_material_almoxarifado)` não mudou** (a asserção que mede o dano).
  Metades positivas: `recebida === saldo` → **201**; `recebida < saldo` → **201**; e o mesmo `POST`
  contra um pedido **sem nenhuma entrada** (saldo cheio) → **201** — é o cenário que distingue esta
  RN de uma cópia da RN-18: a régua é o **saldo**, não a quantidade original.
- **RN-21 — autorizar exige a ação `autorizar_excedente`, com a MESMA literal das outras duas
  portas.** *Cenário:* o `POST` da RN-20 com `autorizar_excedente: true` e perfil **ALMOXARIFE** →
  **403** e
  `error === 'Autorizar recebimento acima do pedido exige a permissão "autorizar_excedente" (seu perfil: ALMOXARIFE).'`;
  com perfil **COMPRAS** → **201**, item gravado com a quantidade excedente **e** uma linha
  `EXCEDENTE_AUTORIZADO` em `auditoria_log_almoxarifado` com `entidade = 'recebimento_item'` e
  `entidade_id` = o id do item criado. ⚠️ **Asserção negativa que não nasce vermelha:** `can()`
  devolve `false` para o que não conhece — o 403 do ALMOXARIFE passaria verde mesmo sem barreira
  nenhuma. A prova é o **par no mesmo `test()`**: 403 do ALMOXARIFE **e** 201 do COMPRAS.
  ⚠️ **(Fase 2) e o cenário vai ATÉ O FIM, porque é aqui que nasce a população do Critical da Etapa
  36.** O 201 do COMPRAS grava um item com `esperada = 4` e `recebida = 6` — **um documento que nasce
  excedente**, coisa que antes só existia por autorização no `/conferir`. O cenário continua no mesmo
  `test()`: `PUT /:id/conferir` **ecoando** 6 como ALMOXARIFE e **sem** a flag → **200**; `PUT
  /:id/fiscal` com o payload real do modal (que não tem caixa de autorização) → **200**; e o
  documento chega a `PROCESSADO`. Sem esses três passos, a etapa entrega uma porta que cria
  documentos que ela mesma não consegue levar até o fim — exatamente o furo que a revisão final da 36
  achou e que a Fase 2 dela não viu.
- **RN-22 — o pedido passa a saber quanto chegou, na ENTRADA FÍSICA, nos dois caminhos.**
  *Cenário:* pedido de 10, recebimento de 6 → `itens_pedido_compra.quantidade_recebida = 0` **antes**
  de processar e **6 depois**; **reprocessar a mesma nota → continua 6, não 12**; um segundo
  recebimento de 4, processado → **10**. *E pelo outro caminho:* recebimento criado e **aprovado**
  por `POST /recebimentos/:id/aprovar` (que **não** passa por `processarNota`) → o saldo **também**
  baixa. Sem esta última metade, o acumulador podia morar no lugar errado com a suíte verde.
- **RN-23 — recebimento que não entrou no estoque não consome saldo.** *Cenário:* dois recebimentos
  de 5 contra um pedido de 10; só o primeiro é processado → `quantidade_recebida = 5` e
  `situacao_recebimento = 'PARCIAL'`; o segundo, parado em `RECEBIDO`, **não** aparece na conta.
  ⚠️ **Medido:** recebimento **não tem status `CANCELADO`** (os 11 são `RECEBIDO..BLOQUEADO`) — o
  cenário do escopo era inescrevível, e este é o equivalente alcançável. É também a razão de o
  acumulador não morar no `POST`.
- **RN-24 — a situação do pedido é DERIVADA, e a tabela core não é escrita.** *Cenário:*
  `GET /almoxarifado/recebimentos-aux/pedidos-compra` devolve, para o pedido de 10 com 6 recebidos,
  `quantidade_pedida: 10, quantidade_recebida: 6, saldo_pendente: 4, situacao_recebimento: 'PARCIAL'`;
  completado, `'RECEBIDO'` e `saldo_pendente: 0`; **e `pedidos_compra.status` continua exatamente o
  valor com que foi inserido** (a asserção que protege o contrato core). `?pendentes=1` **não** traz
  o quitado; **traz** o parcial e o pedido **sem itens** (`ABERTO`). Metade positiva: **sem** o
  filtro, os três aparecem.
- **RN-25 — no caminho do pedido, a esperada do item nasce do SALDO; pedido quitado recusa.**
  *Cenário:* pedido de 10 com 6 já recebidos; `POST` **sem `itens`** → **201** e o item nasce com
  `quantidade_esperada = 4` e `quantidade_recebida = 4` (hoje nasceria 10/10). Pedido inteiramente
  recebido: `POST` sem `itens` → **400** e
  `error === 'Pedido de compra <numero> já foi recebido por completo'` — **não** `'Inclua ao menos
  um item'`, que é o que o caminho antigo diria e que não explica nada ao operador.
  ⚠️ **(Fase 2) terceira metade, e ela é a que estava errada:** pedido **sem nenhuma linha lançada**
  (`COUNT itens_pedido_compra = 0`) → **400** e
  `error === 'Pedido de compra <numero> não tem itens lançados no módulo Compras'`. Ele cairia na
  literal do quitado, que é **falsa**, e é o mesmo pedido que a RN-24 manda **mostrar** em
  `?pendentes=1` como `ABERTO` — a metade positiva do cenário afirma as duas coisas juntas, senão a
  tela oferece um pedido que a porta recusa mentindo.
  ⚠️ **(Fase 2) e a esperada do caminho COM `itens` precisa de asserção própria:** é o caminho que a
  tela usa depois da T5, e é o único em que o payload traz `quantidade_esperada`. O item gravado tem
  de ficar com **o saldo**, não com o que o payload mandou — se ficasse com o payload, a barreira da
  36 passaria a medir contra o número que o operador digitou, e **nenhum** cenário cairia.
- **RN-26 — a tela carrega os itens do pedido com o saldo, editáveis.** *Cenário (client):* escolher
  o pedido no `<select>` renderiza **uma linha por item com saldo**, com `Saldo pendente: 10` no DOM;
  digitar `6` onde o saldo é `10` e submeter → `api.post.mock.calls[0][1].itens` com **um** objeto
  `{ material_id, pedido_item_id, quantidade: 6, quantidade_recebida: 6 }` — e **nunca** `itens: []`,
  que é o que a tela manda hoje. Digitar `12` mostra `Acima do saldo: 2 a mais que o saldo do pedido
  (10)` e a caixa `Autorizo o recebimento acima do pedido`; o 403 do servidor aparece no DOM com
  `role="alert"` e o modal **fica de pé**. Metade positiva: com `6` digitado o aviso **não** aparece
  e o saldo continua visível.
- **RN-27 — `routes/almoxarifado.js` não tem mais `ALTER TABLE`, e nada dependia deles.** *Cenário:*
  a varredura do arquivo de rotas não acha `ALTER TABLE`; **e** o app subido **só** com `initSchema`
  tem as **21 colunas**, afirmadas **por nome** em `PRAGMA table_info` das quatro tabelas
  (`materiais_almoxarifado`, `localizacoes_almoxarifado`, `requisicoes_almoxarifado`,
  `itens_requisicao_almoxarifado`). O segundo cenário é o **controle positivo** do primeiro: sem ele
  a task prova apenas que alguém apagou linhas.

## O sort, e onde ele difere do escopo do controlador

Critério da Fase 3 da skill: **motor, migration, `ACAO_PERFIS` ou regra compartilhada = tronco**;
**tela contra contrato congelado = galho**.

| Escopo do controlador | Nesta etapa | Por quê |
|---|---|---|
| "migration e porta = tronco; client e A1+A3 = galhos" | **três** troncos: migration (T1), porta `POST` (T2) e **acumulador** (T3) | o acumulador é **motor de entrada de estoque** (`darEntradaEstoque`, dentro do claim de idempotência) — é o ponto mais sensível do módulo, e a leitura derivada da T4 **depende** do que ele grava |
| "status do pedido derivado **ao processar**" | derivado **na leitura**, e zero escrita em `pedidos_compra` | medição nova 2: é tabela **core**, com vocabulário minúsculo na tela de Compras e `recebido` já no mapa de cores — ver decisão 4 |
| leitura (aux + rota de itens) não estava separada | **galho A (T4)**, antes do client | a tela consome o contrato dessa rota; sem congelá-la primeiro, o galho do client construiria contra suposição |

## Decisões desta etapa (vão para a letra B do doc de novidades) — **15** depois da Fase 2

> O fechamento da Etapa 36 ocupa **B80–B85** (conferido: o doc ainda está em **B79**, e o contexto de
> fechamento da 36 reserva seis itens). ⚠️ **(Fase 2) "a partir de B86" era dedução e já está
> desatualizada:** a **onda de revisão final** da 36 acrescenta decisões que o rascunho não previa
> (regra nova do excedente nas duas portas; fornecedor por **qualquer** perna; schema Zod dos itens;
> corrida `check-then-insert` nomeada) **e** a consulta A11. **Meça, não deduza.**
> Antes de numerar, reconferir com
> `grep -o "\*\*B[0-9]\+" docs/almoxarifado-novidades-por-etapa.md | sort -u -V | tail -3`.

| # | Decisão | Descartado, e por quê |
|---|---|---|
| 1 | **duas** colunas aditivas: `itens_pedido_compra.quantidade_recebida` **e** `recebimentos_material_itens_almoxarifado.pedido_item_id` | uma coluna só, acumulando por `(pedido_id, material_id)`: duas linhas do mesmo material no mesmo pedido (preços/prazos diferentes, legítimo) fariam o `UPDATE` atingir as duas ou a errada, e a divergência formal (etapa própria) vai precisar do link |
| 2 | migration por **`safeAlter`, sem ledger** | registrar no ledger: os 4 ids existentes são reconstrução/backfill/seed, as ~40 chamadas de `safeAlter` não têm ledger, e `COUNT itens_pedido_compra = 0` — não há backfill a marcar. A letra A leva a consulta **se** o usuário quiser backfill |
| 3 | régua de excedente por **material, agregada** (`SUM` das linhas daquele material) | régua por linha isolada: duas linhas do mesmo material fariam um recebimento legítimo tomar 400 por o operador ter digitado na "linha errada" |
| 4 | **situação do pedido DERIVADA na leitura**; `pedidos_compra` **não** é escrita | gravar `PARCIAL`/`RECEBIDO` no `status` core: badge **cinza** com a palavra crua na tela de Compras (`colors[status] \|\| '#95a5a6'`), filtro `?status=` que nunca casa, e **segunda grafia** de `recebido`, que já existe no vocabulário minúsculo — mudança de contrato core feita de dentro do módulo |
| 5 | acumulador em **`darEntradaEstoque`, dentro do claim**, depois da entrada física | em `processarNota` (o caminho `aprovar` chama `darEntradaEstoque` direto e creditaria estoque sem contar ao pedido); no `POST` (recebimento abandonado consumiria saldo); logo após o claim (falha antes do movimento devolve a marca e deixaria o pedido creditado por material que não entrou) |
| 6 | o cenário é **"não entrou no estoque não consome saldo"** | "recebimento CANCELADO não consome saldo", do escopo: **não existe status `CANCELADO`** de recebimento (os 11 são `RECEBIDO..BLOQUEADO`) — a própria Etapa 36 apagou uma cláusula morta de `CANCELADO` por isso |
| 7 | **reusar só a metade decisória** (`assertAutorizacaoExcedente`: flag + `can()` + 403), com 400 próprio por porta | reusar `assertExcedentePermitido` inteira: ela compara com a linha **já gravada** e é inalcançável no `POST` (medido); e parametrizar a literal da 36 com dois buracos para dizer duas medidas diferentes — a régua deixaria de afirmar texto literal |
| 8 | **`pedidos_compra` entra no harness** (`tests/helpers/testApp.js`), **sem a FK** | deixar cada arquivo criar a sua: são **sete** DDLs divergentes hoje, o de `recebimentoTipoEnum` **sem `created_at`** (e `listarPedidosCompraAux` ordena por ele — a rota aux morreria ali com "no such column"), e `CREATE TABLE IF NOT EXISTS` faz "quem cria primeiro vence". **A FK para `fornecedores` fica fora de propósito:** quatro arquivos inserem `fornecedor_id: 1` sem linha de fornecedor, e duas migrações de `schema.js` terminam com `PRAGMA foreign_keys=ON` — o stub segue o precedente de `clientes`/`fornecedores`, que também não declaram FK |
| 9 | item **sem linha correspondente** no pedido entra **sem régua de saldo** | recusá-lo: material fora do pedido é caso legítimo (o fornecedor mandou algo a mais) e recusar quebraria `recebimentoTipoEnum.api.test.js` cenário (4), que cria pedido **sem** `itens_pedido_compra`. Barrar "item fora do pedido" é regra nova — está em "NÃO cobre" e na letra G |
| 10 | literal própria do 400 do pedido (`saldo do pedido`), e a da tela diz **`Acima do saldo:`** | reusar `Divergência:` do painel: são duas medidas diferentes (saldo do pedido × esperada do item) e o operador leria a mesma frase para dois fatos distintos |
| 11 | **A1 + A3** entram como galho final; **A2 fica fora** | levar a A2 (varredura de reincidência na pasta do módulo): ela precisa tolerar as 3 chamadas legítimas de `sectorMaterialService.js` e vale para quem tocar na **fundação** — nesta etapa seria escopo novo num galho de encerramento |
| 12 | `initSchema` não-awaited fica **documentado (letra G), não consertado** | awaitar aqui: muda a ordem de subida do servidor inteiro, fora da feature 08 — é tronco de outra etapa |
| 13 **(Fase 2)** | o `UPDATE` da contagem do pedido é **não-fatal** (`try/catch` + `console.warn`), no molde da griffagem de séries | deixar o `throw` subir: ele mora **depois** de `entrouFisicamente = true`, onde o `catch` não devolve o claim — uma falha ali reprovaria `processarNota` com o **estoque já creditado**, o documento fora de `PROCESSADO` e o item reclamado (reprocessar o pula). Preço declarado: uma falha rara perde a contagem daquele pedido, reparável por SQL, com `warn` no log |
| 14 **(Fase 2)** | duas literais de 400 para o caminho do pedido: **sem linhas lançadas** × **linhas todas sem saldo** | uma literal só ("já foi recebido por completo") para os dois: mentiria ao operador no pedido que o Compras ainda não preencheu — e é esse o pedido que a decisão 4 manda manter visível em `?pendentes=1` |
| 15 **(Fase 2)** | `saldo_pendente` com **clamp em 0** e `?pendentes=1` filtrado **no `WHERE`** | devolver saldo negativo (o excedente autorizado, que este design declara possível, produziria `-2` na tela) e peneirar depois do `LIMIT 50` (devolveria `[]` havendo pedido aberto) |

## Riscos, e onde o desenho os fecha

| # | Risco | Fechado por |
|---|---|---|
| R1 | o acumulador no lugar errado (`processarNota`) passar com a suíte verde | RN-22 tem a metade do caminho **`aprovar`**, e a sabotagem 2 da T3 move o `UPDATE` para `processarNota` e nomeia a asserção que cai |
| R2 | reprocessamento somar duas vezes | o `UPDATE` vive **dentro** do claim `entrada_estoque_em IS NULL`; o cenário "reprocessar → continua 6" é a asserção que mede o dano (molde `recebimentoEntradaAtomica`) |
| R3 | asserção negativa de permissão verde antes da barreira existir (`can()` é `false` para o desconhecido) | o **par** 403 do ALMOXARIFE + 201 do COMPRAS no **mesmo** `test()` (RN-21) |
| R4 | 400 depois do `INSERT` deixar documento órfão no banco (não há transação) | a barreira roda antes de `inserirComNumeroUnico`, e a asserção é `COUNT(recebimentos)` inalterado — não o status |
| R5 | régua de saldo silenciosamente contornável mandando `pedido_item_id` de outro pedido, ou omitindo o campo | o servidor **valida** o `pedido_item_id` contra o pedido resolvido e, se não servir, **re-resolve** por material; e a régua é o saldo **agregado por material**, então o id do payload nunca decide se o `POST` passa — cenário próprio na T2 |
| R6 | a etapa mudar comportamento da Etapa 36 sem notar | a T2 roda `recebimentoExcedente.api.test.js` **inteiro** (é a régua do que não pode mudar), e a sabotagem 3 muda o 403 num lugar e derruba os **dois** arquivos |
| R7 | migration nova quebrar os quatro arquivos que já recebem por pedido pelo serviço (`solicitacaoCicloVida`, `integracaoComprasJornada`, `compraContextoMaterial`, `almoxarifado.test.js`) | lidos um a um: todos criam **um** recebimento por pedido, e o único que recebe o mesmo pedido duas vezes (`solicitacaoCicloVida`, o cenário do dedupe de auditoria) **acrescenta uma linha nova ao pedido** antes do segundo — com saldo, continua 201. Os quatro entram no Step de regressão da T3 |
| R8 | `?pendentes=1` esconder pedido cujos itens o Compras ainda não lançou | o filtro é `situacao_recebimento <> 'RECEBIDO'`, **não** `saldo_pendente > 0`; o pedido **sem itens** é `ABERTO` e tem cenário próprio |
| R9 | cenário de client verde com o modal vazio | metade positiva em todos: `Saldo pendente: 10` no DOM, `api.post.mock.calls` **contado** (`toHaveLength(1)`), e o payload lido de `calls[0][1]` — nunca `toHaveBeenCalledWith` solto |
| R10 | apagar os 21 ALTER "no escuro" | o controle positivo das **21 colunas por nome** via `PRAGMA`, com sabotagem própria (remover uma coluna do `schema.js` e ver o cenário ficar vermelho) — sem ela, o cenário de varredura prova só que alguém apagou linhas |
| R11 | `pedidos_compra` no harness quebrar os seis arquivos que a criam | todos usam `CREATE TABLE IF NOT EXISTS` (lidos), então os deles viram no-op; o stub **não** declara FK (decisão 8); e a T1 roda os seis |
| R12 | "verde de primeira" em qualquer cenário novo | controle positivo obrigatório em toda task, com `grep -cF` da âncora **contado depois do conserto**, `perl -0pi -e`, `md5sum` antes/depois/depois-de-restaurar e **nunca** `git checkout --` |
| R13 **(Fase 2)** | **o documento que esta etapa cria nascer preso**: ele nasce com `recebida > esperada` (excedente autorizado no `POST`) e a barreira da Etapa 36 vive nas duas portas seguintes — é o Critical da 36 reproduzido por uma porta nova | o cenário (12) da T2 vai **conferir → fiscal → processar** no mesmo `test()`, e o roteiro da T7 idem (passos 2 e 5b); e a regra "> esperada **E** > armazenada" tem de estar aplicada nas **duas** portas antes da T2 — se não estiver, é achado bloqueante, não pendência |
| R14 **(Fase 2)** | **a tela nova ser recusada pela validação**, porque a onda da 36 acrescentou schema Zod aos **itens** do `POST` e o payload do caminho do pedido não leva `quantidade_esperada` | cenário (11) da T2 afirma o payload **literal** da T5 respondendo 201, com sabotagem que torna o campo obrigatório e o derruba |

## O que esta etapa NÃO cobre

- **Conferência física estruturada** (contagem, pesagem, medição, checklist por tipo de material) —
  fora de escopo desde a Etapa 5, decisão de design de 2026-08-07.
- **Registro formal de divergência numerada** (tipo, quantidade, ação). Hoje
  `conferencia_quantidade`/`conferencia_descricao` são booleanos; o dado de entrada passou a existir
  na Etapa 36 e o **link com a linha do pedido** passa a existir aqui. **Etapa própria.**
- **`initSchema` awaited.** Documentado como fragilidade (letra G), não consertado: muda a ordem de
  subida do servidor inteiro.
- **A2 da Fase 0** — varredura que recusa `ALTER TABLE` fora de `safeAlter` em toda a pasta do
  módulo. Fica para quem tocar na fundação; e o anti-padrão **maior** vive fora do módulo
  (**51** ocorrências em `server/index.js`, contra 21 no arquivo de rotas do almoxarifado), que é
  **core** e não entra aqui.
- **Barrar item que não está no pedido.** Decisão 9: hoje ele entra sem régua de saldo, porque não
  há saldo com o que comparar. Recusá-lo é regra nova ("o recebimento só aceita o que foi pedido"),
  com efeito sobre material que o fornecedor manda a mais — **decisão de negócio**, etapa própria.
- **Backfill de `quantidade_recebida` para pedidos já recebidos.** Acervo medido em `COUNT = 0`; a
  consulta vai na **letra A** para o caso de o usuário querer.
- ⚠️ **(Fase 2) Impedir que DOIS recebimentos abertos consumam o mesmo saldo.** O saldo só se move na
  entrada física (decisão 5), então dois documentos de 10 criados contra um pedido de 10 **antes** de
  qualquer um processar respondem **201 os dois**, e o pedido termina com 20 sem o 400 aparecer. É
  **sequencial**, e não a corrida de `check-then-insert` já registrada em B80. Fechar exigiria contar
  o **reservado em documento aberto** — muda o significado de "saldo" e é etapa própria. Vai para a
  letra **G**.
- **`UNIQUE` da NF no banco** — adiado pela Etapa 36 até a consulta de produção da letra A.
- **O `<select>` de fornecedores mandar `fornecedor_id`** (item (d2) da próxima tarefa da Etapa 36):
  continua aberto, e a perna do `fornecedor_nome` na chave da duplicata continua sendo a que salva.
- **Estorno de excedente autorizado** — o excedente entra inteiro, com auditoria; devolver o que
  sobrou é a feature 12.
- **Segregação de saldo por almoxarifado.** Almoxarifado é **área física, não filial**: saldo global
  por material segue correto e intencional.
- **O teto da faixa do clipe de `.almox-actions`** (F12, exige navegador) e os furos **C43/C44** da
  Etapa 33 seguem abertos; nada aqui os toca.
