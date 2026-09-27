# Etapa 42 — plano: o recebimento FECHA o pedido de compra (status automático + alerta de parcial)

**Design:** `docs/superpowers/specs/2026-09-27-almoxarifado-etapa42-recebimento-fecha-pedido-design.md`
**Base:** `2b9defb` · branch `desenvolvimento-almoxarifado` · **baseline medido em `2b9defb`:** `test:api`
**195/195 arquivos** — número de **partida**, que cresce a cada arquivo de teste novo (196 depois de T1,
197 de T2, 198 de T3, 199 de T5). Quem comparar o número final com este sem contar os arquivos novos
vai achar que a suíte mudou de tamanho sozinha
**Features:** 08 (dona) · 20 (consumidora)

---

## 1. Regras de negócio numeradas

Cada `RN-Exx` aparece (a) aqui, (b) no nome do teste que a prova, (c) na frase do
`docs/almoxarifado-manual-do-sistema.md`. `grep RN-E01` acha os três.

| ID | Enunciado | Cenário que a prova |
|---|---|---|
| **RN-E01** | Quando a entrada física faz a soma recebida de um pedido alcançar (ou passar) a quantidade pedida, o pedido de compra passa a `status = 'recebido'` **automaticamente**. | pedido de 10 de um material; recebimento de 10; `processar` → `pedidos_compra.status = 'recebido'`. |
| **RN-E02** | A decisão é **por pedido** (soma agregada de todas as linhas com `material_id`), nunca por linha. | pedido com 2 linhas (10 A + 10 B); recebimento só de A (10) → `status` continua `pendente`, situação `PARCIAL`. Recebimento de B depois → `recebido`. |
| **RN-E03** | O gancho só **sobe**: um pedido já `recebido` nunca volta para `pendente` por conta própria. | pedido `recebido`; nada no módulo o reverte. O `PATCH .../status` manual continua sendo a saída. |
| **RN-E04** | O gancho **não sobrescreve** `cancelado`, `rejeitado` nem `recebido`. | pedido `cancelado` recebe nota de 10/10 → `status` continua `cancelado`, e **uma** linha de aviso no log; segundo `processar` num pedido já `recebido` não reescreve nem re-audita. |
| **RN-E05** | Falha do gancho é **não-fatal**: o recebimento termina, o estoque fica creditado, e o log diz o que não foi contado. Tabela `pedidos_compra` ausente é o mesmo caso. | com a tabela renomeada/ausente, `processar` responde 200 e o estoque entra. |
| **RN-E06** | O gancho roda nos **dois** caminhos de entrada física (`processarNota` e `aprovarRecebimento`). | o mesmo pedido fechado por `POST /recebimentos/:id/aprovar` (ramo que não passa por `processarNota`) também vira `recebido`. |
| **RN-E07** | A mudança automática deixa rastro em `auditoria_log_almoxarifado`: `entidade 'pedido_compra'`, `acao 'STATUS_AUTOMATICO_RECEBIDO'`, autor = quem processou a nota. | depois do `processar`, existe **1** linha de auditoria com o id do pedido e o nome do usuário; no segundo `processar` continua **1**. |
| **RN-E08** | `derivarRecebimentoDoPedido` é **exportada** e é a única régua de situação/saldo; a fonte do alerta não tem `LIMIT` e devolve `previsao_entrega`. | 51 pedidos parciais → a fonte devolve os 51 (o aux de tela devolve 50). |
| **RN-E09** | O alerta `PEDIDO_COMPRA_PARCIAL` existe na central e no job, lista pedidos `PARCIAL` com status não terminal, dedupe `pedido-parcial-<id>-<saldo arredondado a 3 casas>`. | pedido 10 com 4 recebidos → 1 alerta; 2ª varredura no mesmo saldo → nada novo; chega mais 2 (saldo 4) → **novo** alerta; quantidade fracionária não gera dois avisos para o mesmo saldo. |
| **RN-E10** | Pedido `recebido` sai do atraso na aba Compras — **consequência** de RN-E01 pela régua única `derivarAtraso`. Isto **inverte** a RN-D12 da Etapa 39, que estava correta até a Etapa 41. | pedido com `previsao_entrega` de ontem, recebido por inteiro → `atrasado = 0`, `dias_atraso = null`, e `?atrasados=1` não o traz. |

## 2. Contratos congelados

### 2.1 Nenhum endpoint novo para o gancho

O gancho é **interno**: nada muda na forma de `POST /api/almoxarifado/recebimentos/:id/workflow`
(`acao: 'processar'`) nem de `POST /api/almoxarifado/recebimentos/:id/aprovar` — mesma resposta,
mesmos códigos. Efeito colateral observável: `pedidos_compra.status`, `GET /api/compras/pedidos`
(`atrasado`, `status`) e uma linha de auditoria.

### 2.2 `receiptService.js` — assinaturas novas/exportadas

```js
// NOVA, interna, chamada no fim de darEntradaEstoque (D1). NAO-FATAL por fora.
async function fecharPedidosCompletos(db, user, recebimentoId, itensQueEntraram)
//   itensQueEntraram: Array<{ id, pedido_item_id }> — so os que casaram o claim
//   efeito: UPDATE pedidos_compra SET status='recebido' + auditoria, por pedido que virou RECEBIDO
//   retorno: Array<number> — ids dos pedidos fechados (para teste; o chamador ignora)

// NOVA, exportada, fonte do alerta (D5). SEM LIMIT.
async function situacaoDosPedidosCompra(db, { situacao } = {})
//   -> [] quando a tabela `pedidos_compra` nao existe  <-- A GUARDA `sqlite_master` E DAQUI (F15)
//   -> [{ id, numero, status, previsao_entrega, fornecedor_nome,
//          quantidade_pedida, quantidade_recebida, saldo_pendente, situacao_recebimento }]
//   `situacao` (opcional): 'ABERTO' | 'PARCIAL' | 'RECEBIDO' filtra em JS pela regua unica
//   SQL: LEFT JOIN fornecedores  <-- CONGELADO (F6): pedido orfao de fornecedor TEM de vir,
//        com `fornecedor_nome: null`. `JOIN` o faria desaparecer em silencio (R9 da Etapa 39).

// PASSA a ser exportada (D5), sem mudar de comportamento:
derivarRecebimentoDoPedido(quantidadePedida, quantidadeRecebida)
```

**Arquivos tocados por T2, além do `receiptService.js` (F2, Critical):**
`server/services/almoxarifado/auditLabels.js` — a entidade `pedido_compra` e o verbo
`STATUS_AUTOMATICO_RECEBIDO` **têm de ganhar rótulo**, senão `auditLabels.api.test.js:216-246`
(duas varreduras de cobertura sobre `server/routes` + `server/services`) fica **vermelho** e a
trilha mostra a entidade e o verbo crus na tela.

Constante compartilhada do SQL da soma (um dono para a agregação):

```js
const SOMA_POR_PEDIDO_SQL = `SELECT pedido_id,
    SUM(COALESCE(quantidade, 0)) as total_pedido,
    SUM(COALESCE(quantidade_recebida, 0)) as soma_recebida
  FROM itens_pedido_compra WHERE material_id IS NOT NULL GROUP BY pedido_id`;
```

`listarPedidosCompraAux` passa a interpolar a constante — **nenhuma** outra mudança nela
(`LIMIT 50`, `?pendentes=1` e a posição do filtro são contrato de tela, testados).

### 2.3 Status que o gancho grava e os que ele respeita

- grava a literal `'recebido'` (pertence a `STATUS_PEDIDO_COMPRA`, `services/compras/schemas.js:60`);
- **não grava** quando `LOWER(status)` ∈ `{'cancelado','rejeitado','recebido'}` (RN-E04);
- não há máquina de estados nova: o `PATCH .../status` da Etapa 39 continua aceitando os 7.

### 2.4 Entrada nova do registro de alertas (13ª)

```js
{
  chave: 'PEDIDO_COMPRA_PARCIAL',
  titulo: 'Pedido de compra recebido parcialmente',
  descricao: 'Pedidos de compra com entrega parcial e saldo ainda pendente.',
  configDias: null,
  listar: async (db) => /* situacaoDosPedidosCompra(db, { situacao: 'PARCIAL' }) filtrado por status nao terminal */,
  dedupeChave: (l) => `pedido-parcial-${l.id}-${Math.round(l.saldo_pendente * 1000)}`,
  payload: (l) => ({ pedido_compra_id: l.id, saldo_pendente: l.saldo_pendente }),
  assunto: (l) => `[Compras] Pedido de compra recebido parcialmente — ${l.numero}`,
  corpo: (l) => [ 'Pedido: …', 'Fornecedor: …', 'Quantidade pedida: …', 'Quantidade recebida: …',
                  'Saldo pendente: …', 'Previsão de entrega: …', 'Status: …' ].join('\n'),
}
```

Mensagens literais do **corpo do e-mail** (7 linhas, congeladas). O **cartão** tem rótulos próprios,
curtos, em 2.6 — e **não** são as mesmas strings, como no precedente (`Previsão`/`Dias de atraso` no
cartão, frases inteiras no e-mail). A frase "o e-mail e o cartão citam as mesmas" saiu daqui: ela era
o contrato ambíguo que T3 e T4 dividiriam, e cada agente escreveria a asserção do seu lado (F5).

```
Pedido: <numero>
Fornecedor: <fornecedor_nome ou ->
Quantidade pedida: <quantidade_pedida>
Quantidade recebida: <quantidade_recebida>
Saldo pendente: <saldo_pendente>
Previsão de entrega: <previsao_entrega ou "não informada">
Status: <status>
```

**`Previsão de entrega: não informada` é contrato (F4).** O alerta de atraso nunca passou por isto
porque a régua dele **filtra** por `/^\d{4}-\d{2}-\d{2}$/` (`pedidoCompraService.js:753`, e o
cabeçalho `:744-746` registra que a base tem `''` gravado em coluna `DATE`). A população do parcial
**não filtra previsão**, então o pedido importado sem previsão entra — e sairia
`Previsão de entrega: null`. Sem fornecedor → `-` (convenção do atrasado, mantida).

⚠️ **Correção deste plano (apontada pela execução de T3):** o bloco de código acima mostrava
`dedupeChave: (l) => \`pedido-parcial-${l.id}-${l.saldo_pendente}\`` — a versão **crua**, que
contradiz o parágrafo seguinte. **Vale o arredondado**, e o bloco foi corrigido. Quem tivesse lido só
o bloco implementaria o defeito que o F14 existe para impedir.

**Dedupe sobre `REAL` (F14):** a chave **arredonda** —
`pedido-parcial-${id}-${Math.round(saldo_pendente * 1000)}`. `saldo_pendente` é
`Math.max(0, pedida - recebida)` sem arredondamento (`receiptService.js:1466`); duas `SUM(REAL)`
sobre o mesmo estado físico podem produzir `6.699999999999999` e `6.7`, e a chave crua mandaria dois
e-mails para o mesmo estado. T3 tem cenário com quantidade fracionária.

**`require` lazy é contrato, não estilo (F17):** o `listar` da entrada requer `receiptService`
**dentro** da função. E agora o ciclo **fecha de fato** — `receiptService.js:31` requer
`alertRegistry` no topo, e a entrada nova requer `receiptService`. Um require de topo capturaria `{}`
mid-load, `situacaoDosPedidosCompra` viria `undefined` e o cartão apareceria com `erro: true` **sem
quebrar a suíte**. Por isso T3 afirma `cartao.erro === undefined` (molde de
`alertaPedidoAtrasado.api.test.js:164`) e tem o cenário de **carga a frio**.

### 2.5 Log não-fatal (literais congeladas)

```
[recebimento] status automatico do pedido de compra falhou (recebimento <id>, pedido <id>): <msg>
[recebimento] pedido <numero|#id> completo, mas status <status> nao e sobrescrito automaticamente
```

**O segundo `warn` sai SÓ quando `LOWER(status) ∈ {cancelado, rejeitado}` (F11).** O status
`'recebido'` está na lista de respeitados por **idempotência**, e ele é o **caminho esperado**: o
segundo `processar` do mesmo pedido e todo excedente autorizado contra pedido já fechado
(`receiptService.js:288-294` deixa passar com `autorizar_excedente`) passariam por ali. Avisar no
caminho feliz treina o operador a ignorar o log — que é onde o aviso do `cancelado` mora.

### 2.6 Cartão da central (cliente)

`COLUNAS_POR_CHAVE.PEDIDO_COMPRA_PARCIAL` = `Pedido` · `Fornecedor` · `Pedida` · `Recebida` ·
`Saldo pendente` · `Previsão`. Nenhuma coluna crua (`id`, `pedido_compra_id`) na tabela.

## 3. Sort topológico das tasks

| # | Task | Classificação | Por quê |
|---|---|---|---|
| **T1** | `SOMA_POR_PEDIDO_SQL` + export de `derivarRecebimentoDoPedido` + `situacaoDosPedidosCompra` | **tronco** | congela a régua/fonte que T3 e T4 consomem |
| **T2** | `fecharPedidosCompletos` + gancho no fim de `darEntradaEstoque` (RN-E01…E07) | **tronco** | escreve em tabela core dentro do motor de entrada |
| **T3** | Entrada `PEDIDO_COMPRA_PARCIAL` no `alertRegistry` (RN-E09) | **galho** | só consome T1, já congelada e testada |
| **T4** | Cartão `COLUNAS_POR_CHAVE` + teste de cliente (D9) e correção do comentário `:178` | **galho** | cliente contra o contrato 2.6, mock de JSON na fronteira HTTP |
| **T5** | **Integração cruzando galhos** (RN-E10 + reescrita do cenário (D)) | **serial, depois de T2 E T3** (F3) | fluxo completo por rota: cotação → pedido → recebimento → status → atraso → alerta. O trecho do alerta é o **único** ponto onde os dois galhos se cruzam — antes de T3 ele ficaria vermelho por dependência, não por defeito |
| **T6** | Documentação (skill `fechar-etapa`) | serial, último | |

Paralelismo real: **2 galhos** (T3 servidor, T4 cliente), em worktrees isoladas — T3 mexe em
`server/`, T4 em `client/`, e os testes de T3 batem no SQLite. Scratchpad com nome único por agente
(`msg-t3-alerta.txt`, `msg-t4-cartao.txt`).

## 4. Tasks em detalhe

### T1 — a régua exportada e a fonte sem `LIMIT` (tronco)

- TDD: `server/tests/api/comprasPedidoSituacaoFonte.api.test.js` (novo).
- Cenários: (a) `derivarRecebimentoDoPedido` exportada e devolve os 4 campos; (b) 51 pedidos
  parciais → `situacaoDosPedidosCompra` devolve 51 **e** `listarPedidosCompraAux` devolve 50 (a
  diferença é o ponto da task); (c) `previsao_entrega` presente na fonte nova; (d) filtro
  `{ situacao: 'PARCIAL' }` não traz `ABERTO` nem `RECEBIDO`; (e) tabela ausente → `[]`.
- Cenário **(5b)** acrescentado pela Fase 2 (F6): pedido **órfão de fornecedor** vem na fonte com
  `fornecedor_nome: null` — com `JOIN` ele desapareceria em silêncio, o achado Important que a
  Etapa 39 pagou (`8f3db94`).
- **Controle positivo:** apagar o `derivarRecebimentoDoPedido` do `module.exports` → (1) vermelho;
  pôr `LIMIT 50` na fonte nova → (2) vermelho com 50 ≠ 51; tirar `material_id IS NOT NULL` da
  constante compartilhada → (5) vermelho; trocar `LEFT JOIN` por `JOIN` → (5b) vermelho.

### T2 — o gancho (tronco)

- TDD: `server/tests/api/comprasPedidoStatusAutomatico.api.test.js` (novo).
- Cenários: RN-E01 (fecha), RN-E02 (2 linhas, não fecha na primeira), RN-E04 × 3 (`cancelado`,
  `rejeitado`, idempotência do `recebido`), RN-E05 (tabela ausente → 200 e estoque creditado),
  RN-E06 (pela rota `/aprovar`), RN-E07 (1 linha de auditoria com autor; 1 depois do 2º processar),
  RN-E03 (não reverte), excedente autorizado (recebida > pedida → `recebido`, pelo clamp da régua).
- **Controle positivo:** mover o gancho para **dentro** do laço → RN-E02 vermelho; remover o filtro
  de status → RN-E04 vermelho; trocar `warn` por `throw` → RN-E05 vermelho; chamar o gancho só em
  `processarNota` → RN-E06 vermelho; apagar o rótulo novo de `auditLabels.js` → `auditLabels` vermelho.
- **Atenção:** o gancho roda **depois** do laço e **fora** do `try` por item; ele tem o `try` dele.
  Só considera itens que casaram o claim nesta execução (reprocessar não re-audita).
- **⚠️ F2 (Critical) — `auditLabels.js` faz parte da task.** `auditLabels.api.test.js:216-246` tem
  **duas varreduras de cobertura** que fazem `grep` de `entidade: '…'` e `acao: '…'` em
  `server/routes` + `server/services` e exigem `deepStrictEqual(semRotulo, [])`. Escrever
  `entidade: 'pedido_compra'` / `acao: 'STATUS_AUTOMATICO_RECEBIDO'` sem o rótulo deixa **dois**
  testes vermelhos e a trilha da tela mostrando a entidade e o verbo crus
  (`routes/almoxarifado/extended.js:1950`, `:1995`).
- **⚠️ F12 (Important) — o cenário RN-E06 pode não saber falhar.** `aprovarRecebimento` **delega**
  para `processarNota` quando `rec.status ∈ {EM_ENTRADA_NF, ENCAMINHADO_FATURAMENTO}`
  (`receiptService.js:1383-1385`); só **fora** desses status ele chama `darEntradaEstoque` direto
  (`:1387`). Um cenário montado em `ENCAMINHADO_FATURAMENTO` passa pelo caminho de `processarNota` e
  o controle positivo "chamar o gancho só em `processarNota`" ficaria **verde provando nada** — o
  modo de falha "teste vazio" do CLAUDE.md. O cenário fixa o status de partida no ramo de `:1387` e
  **afirma** qual ramo foi exercitado.
- **F10 — o recorte `material_id IS NOT NULL` passa de régua de LEITURA a régua de ESCRITA.** Um
  pedido com 1 linha de material (10/10) + 1 linha de frete sem material fecha como `recebido` com o
  serviço não prestado. **Medido nesta Fase 0:** `server/data/database.sqlite` tem **0** linhas em
  `itens_pedido_compra` e **0** em `pedidos_compra`, e nenhum escritor da aplicação cria linha com
  `material_id NULL` (`pedidoCompraService.js:624` manda a linha ruim para `ignorados`) — o caso só
  existe em acervo importado por SQL. Decisão declarada em D1 (o `SUM` sobre **todas** as linhas foi
  descartado: faria o pedido com frete nunca fechar, que é o defeito mais provável dos dois).

### T3 — o alerta (galho, worktree)

- TDD: `server/tests/api/alertaPedidoParcial.api.test.js` (novo).
- Cenários: presente na central com total e linhas; **colunas projetadas** (a resposta **não** traz
  `valor_total`/`observacoes`/`fornecedor_id` — o mesmo teste de vazamento do atrasado); pedido
  `cancelado` parcial fora; pedido `recebido` fora; dedupe 1× por saldo e **novo** quando o saldo
  muda; assunto com `[Compras]` e o número; corpo com as 7 literais; tabela ausente → sem quebrar a
  central; `erro: true` isolado não derruba as outras 12.
- **Controle positivo:** trocar o dedupe por `pedido-parcial-<id>` → o cenário do saldo novo fica
  vermelho; trocar as colunas por `p.*` → o de vazamento fica vermelho.
- Cenários acrescentados pela Fase 2: pedido parcial **sem previsão** entra no alerta com
  `Previsão de entrega: não informada` (F4); quantidade **fracionária** não gera dois e-mails para o
  mesmo estado (F14, o dedupe arredondado); `cartao.erro === undefined` e **carga a frio** do
  registro, que é o único jeito de pegar o `{}` mid-load do require de topo (F17).
- **⚠️ F1 (Critical) — a 13ª entrada derruba `alertaPedidoAtrasado.api.test.js`, e é T3 que conserta.**
  Dois `assert` com o número **12** literal têm de virar **13**, com o comentário de por quê (o
  padrão que a Etapa 39 usou ao virar 11→12): `:169`
  (`assert.strictEqual(alertas.length, 12, …)` — a asserção de "nenhuma anterior caiu") e `:231`
  (carga a frio, `deepStrictEqual(medido, { total: 12, … })`). `alertaRegistro.api.test.js:260` usa
  `ALERT_REGISTRY.length` **dinâmico** e não precisa de mudança — é o molde certo, e vale dizer isso
  no comentário.
  **Gate da task:** o agente de T3 roda **`npm run test:api` inteiro** na worktree, não só o arquivo
  novo — rodar só o próprio arquivo entregaria verde com o baseline quebrado.

### T4 — o cartão (galho, worktree)

- TDD: cenários novos em `client/src/components/almoxarifado/AlertasAlmoxarifado.test.js`.
- Cenários: cartão `alerta-card-PEDIDO_COMPRA_PARCIAL` com os 6 cabeçalhos de 2.6, na ordem; sem
  fornecedor → `—`; nenhum `id` cru no texto do cartão.
- **Controle positivo:** apagar a entrada de `COLUNAS_POR_CHAVE` → os cabeçalhos passam a ser os
  campos crus e o cenário fica vermelho (prova que o teste não estava casando com o fallback).
- **⚠️ F9 — acoplamento MEDIDO:** o cenário *"um cartao por alerta, na ordem do array do C1"*
  (`AlertasAlmoxarifado.test.js:209-228`) afirma a **lista inteira** de `data-testid` da
  `CENTRAL_FIXTURE` (`:53`). **Caminho escolhido:** acrescentar a chave nova **no fim** da fixture
  (a posição em que o servidor a devolve) e atualizar a lista de `:214` de 10 para 11 entradas.
  *Descartado:* fixture própria só para o cartão novo — perderia a prova de que a tela não reordena,
  que é exatamente o que aquele cenário existe para medir.
  **Gate da task:** rodar `CI=true npx react-scripts test --watchAll=false` **inteiro**, não só o
  arquivo.

### T5 — integração cruzando galhos (serial)

- Estende `server/tests/api/comprasPedidoAtrasoIntegracao.api.test.js`: **reescreve** o cenário (D)
  (D8 — a asserção anterior era correta até a Etapa 41; o comentário fica no arquivo) e mantém
  (E.9a)/(E.9b)/(E.9c).
- Novo cenário de ponta a ponta em `server/tests/api/recebimentoFechaPedidoIntegracao.api.test.js`:
  cotação → `gerar-pedido` (Etapa 41) → recebimento parcial → alerta `PEDIDO_COMPRA_PARCIAL` na
  central → segundo recebimento fecha → `status = 'recebido'`, `atrasado = 0`, pedido **fora** do
  alerta de parcial e fora de `?atrasados=1`, auditoria com 1 linha.
- **Os dois caminhos exigidos pela Fase 1 da skill:** este cenário entra **pela rota** (HTTP); o
  cenário RN-E06 de T2 entra **pelo serviço** (`darEntradaEstoque` direto).

### T6 — documentação, com os endereços MEDIDOS pela Fase 2

Esta etapa **revoga duas decisões escritas**, e as duas têm de ser corrigidas **à vista** (regra 5
do CLAUDE.md), não reescritas em silêncio:

1. **A RN-24 da Etapa 37 — a inversão que a primeira versão deste plano NÃO nomeou.**
   `specs/modulo-almoxarifado/08-recebimento/README.md:329` diz *"**RN-24 — a situação do pedido é
   DERIVADA na leitura, nunca gravada** … saem ao lado do `status` do core, que **não é tocado**"*, e
   `:107` diz *"**Nada é escrito em `pedidos_compra`**"*. A RN-E01 **grava**. Não é detalhe: o design
   da Etapa 39 usou essa RN para descartar uma opção
   (`docs/superpowers/specs/2026-09-16-crm-etapa39-pedido-acompanhado-design.md:178`). A revogação
   ganha o mesmo peso que o D8 dá à RN-D12.
2. **A RN-D12 da Etapa 39** (D8) — estava **correta até a Etapa 41**.

Endereços de documento de usuário que passam a mentir (medidos pela Fase 2, corrigir um a um):

| Arquivo:linha | O que diz hoje |
|---|---|
| `docs/almoxarifado-manual-do-sistema.md:2087-2090` | *"**Receber o material não tira o pedido da lista de atrasados** … nenhum recebimento o altera"* |
| `docs/almoxarifado-manual-do-sistema.md:2196-2197` (§14b.4b) | *"o **Status** … é o que tira o pedido entregue da lista de atrasados"* |
| `docs/almoxarifado-manual-do-sistema.md:3739-3741` (§21c-bis) | a lista de alertas da varredura diária, sem a 13ª entrada |
| `docs/almoxarifado-novidades-por-etapa.md:10028` e `:10069` | o enunciado da RN-D12 e o roteiro de teste manual que manda editar o status à mão |
| `specs/modulo-almoxarifado/20-alertas/README.md:27-40` e `:113` | o item `[ ]` do parcial e a lista de "lacunas que restam" |
| `specs/modulo-almoxarifado/08-recebimento/README.md:3` | o *"falta para 🟢"* cujo item (1) está entregue desde a Etapa 38 |

**Limitações desta etapa que o guia do usuário tem de dizer** (F7 e F16):

- **o estorno da entrada apaga o último sinal.** `POST /api/almoxarifado/movimentacoes/:id/cancelar`
  (`routes/almoxarifado/extended.js:798` → `stockService.cancelarMovimentacao:1425`) reverte o saldo
  e **não** toca `itens_pedido_compra.quantidade_recebida` nem `pedidos_compra.status`. Depois da 42,
  um pedido auto-fechado cuja movimentação foi cancelada fica `recebido` com estoque 0: fora do
  `?atrasados=1`, fora do alerta de parcial e fora do `?pendentes=1`. Antes da 42 o selo de atrasado
  era o sinal que sobrava. Recuperação: `PATCH .../status` + correção do `quantidade_recebida`.
  **Vai para a letra B** como limitação **nova, criada por esta etapa**.
- **não há expurgo da fila de notificações** (contrato da feature 19,
  `20-alertas/README.md:75`): um pedido que fecha entre o enfileiramento e o envio ainda manda o
  e-mail "recebido parcialmente". É o D10, e o guia do usuário repete a frase em vez de deixá-la só
  na spec 20.

**Gestos que NÃO mudam, e o documento tem de dizer isso** (a Fase 2 varreu todos os consumidores de
`pedidos_compra.status`): o `PUT /api/compras/pedidos/:id` e o `DELETE` recusam por **recebimento**
(`quantidade_recebida > 0` ou documento vinculado), nunca por `status`
(`pedidoCompraService.js:484-491`, `:540-547`) — a RN-E01 não aperta nem afrouxa nenhum dos dois; o
`gerar-pedido` da cotação não lê `pedidos_compra.status`; o `?pendentes=1` do aux continua por
saldo. O que **muda** para o comprador: `?status=pendente` deixa de trazer o pedido auto-fechado (e
`'recebido'` já é opção do filtro, `Compras.js:21`).

## 5. Estado da execução

| Task | Estado | Hash | Nota |
|---|---|---|---|
| Fase 0 (medição) | ✅ feita | — | baseline medido em `2b9defb`: `test:api` **195/195 arquivos**, almoxarifado **42/0**, validation **4/0**, safealter **3/0**, sqlite **5/0**, cliente **51 suítes / 781 testes**. 12 entradas no registro de alertas (handoff dizia 18); badge "Recebido" já existe |
| Fase 1 (design + plano) | ✅ feita | — | este arquivo + o design |
| Fase 2 (revisão do plano) | ✅ feita | — | uma passada, agente fresco: **17 achados — 3 Critical, 9 Important, 5 Minor**. Os 3 Critical são acoplamentos que deixariam galho verde com baseline quebrado (F1 `alertaPedidoAtrasado`, F2 `auditLabels`, F3 T5 dependendo de T3). Todos integrados nas seções 2/3/4 acima |
| T1 | ✅ feita | (a commitar) | `comprasPedidoSituacaoFonte.api.test.js` **8/8** — vermelho medido antes (0/7) e 3 sabotagens confirmadas: export removido → (1) cai; `LIMIT 50` na fonte → 5 cenários caem; recorte `material_id` fora da constante compartilhada → (5) cai; `JOIN` em vez de `LEFT JOIN` → (5b) cai. Cenário (5b) nasceu do F6 |
| T2 | ✅ feita | `371b838` | `comprasPedidoStatusAutomatico.api.test.js` **10/10** — vermelho antes **2/9**, e os 2 que passavam eram os fracos. 5 sabotagens confirmadas (a 5ª, rodada depois do commit: fazer o gancho **descer** para `pendente` quando a situação volta a `PARCIAL` → o cenário (8) da RN-E03 cai; sem ela, (8) era das duas que passavam de graça) (decidir por linha → (2); sem guarda de status no `WHERE` → (4)(5); `throw` em vez de `warn` → (7); gancho só em `processarNota` → (6)). **`auditLabels.js` entrou na task** (F2 confirmado: os 2 testes de cobertura ficaram vermelhos exatamente como previsto). **Teste vazio pego pelo controle positivo** — ver abaixo |
| T3 | ⏳ em execução | | galho, worktree `../CRM-wt-e42-alerta` (branch `e42-alerta`, junction de `node_modules`) |
| T4 | ⏳ em execução | | galho, árvore principal (só `client/`) |
| T5 | ⏳ | | depende de T2 **e** T3 (F3) |
| T6 | ⏳ | | |

### A inversão das suítes existentes migrou de T5 para T2 — correção de plano

O plano dizia que T5 reescreveria o cenário (D) de `comprasPedidoAtrasoIntegracao`. **Errado na ordem:**
no instante em que T2 entrou, **três** suítes ficaram vermelhas (não uma), e deixá-las vermelhas até T5
daria aos galhos um **tronco vermelho** — o gate deles é "rodar a suíte inteira", que passaria a acusar
falha alheia. A inversão é consequência **direta** de T2 e foi commitada com ela:

| Suíte | Cenário | Afirmava | Agora afirma |
|---|---|---|---|
| `comprasPedidoAtrasoIntegracao` | (D) + cabeçalho | `status 'pendente'`, `atrasado 1` | `'recebido'`, `atrasado 0`, `dias_atraso null`, fora de `?atrasados=1` — e **reabre o pedido a mão** no fim, porque (E.9a)/(E.9c) medem a porta manual e precisam de pedido com recebimento **e** atrasado |
| `pedidosCompraSaldoAux` | (5) + cabeçalho | `status` continua `'aprovado'` | `'recebido'`, **e** que a palavra pertence a `STATUS_PEDIDO_COMPRA` (lista importada do schema, não copiada) |
| `recebimentoContraPedidoIntegracao` | excedente | `'aprovado'` — *"nem o excedente autorizado escreve"* | `'recebido'`: o excedente **fecha**, pelo clamp da régua |

O cenário (D) **pediu a própria reescrita por escrito** (*"a RN-D12 precisa ser reescrita (nao e este
teste que esta errado)"*) — o handoff da Etapa 39 funcionou exatamente como projetado.

### Erros DESTE plano, achados pela execução (corrigidos à vista, não em silêncio)

1. **O baseline da linha 4 dizia `195/195` e ficou defasado** — T1 e T2 acrescentaram dois arquivos.
   O executor de T3 mediu **197/197** e apontou a divergência em vez de contornar. Depois do merge:
   **199/199**.
2. **O bloco de código de 2.4 mostrava o dedupe CRU** (`${l.saldo_pendente}`) enquanto o texto do
   F14, logo abaixo, mandava arredondar. Quem lesse só o bloco implementaria a versão errada. O
   executor implementou o arredondado (o contrato) e **relatou a contradição**. Corrigido em 2.4.
3. **O F17 afirmava que "o cenário de carga a frio é a rede" contra o require de topo — ERRADO, e a
   sonda do executor de T3 mostrou por quê.** `receiptService.js:31` captura o registro pelo
   **objeto** do módulo, então ele sobrevive ao ciclo; um require de **topo** no `alertRegistry` seria
   uma **desestruturação**, e desestruturar mid-load captura `undefined`. Medido: o dano **depende da
   ordem de carga** — com `alertRegistry` primeiro o `listar` devolve `[]` normalmente; com
   `receiptService` primeiro o `listar` **lança** e `montarCentral` traduz em `erro: true`, ou seja
   **suíte verde com o alerta morto**. O processo de teste carrega o registro primeiro, então a carga
   a frio na ordem natural **não pega** o defeito. O executor acrescentou o cenário **(10b)**: segunda
   carga a frio na **ordem inversa**, que chama o `listar` e afirma que ele resolve — com ele, a
   sabotagem do require de topo passa a dar vermelho. **Lição:** "cenário de carga a frio" não é
   proteção contra ciclo de require; **carga a frio na ordem que fecha o ciclo** é.
4. **A Fase 0 afirmou que a feature 08 "não tem item (5)" e que o handoff da 41 o inventou — meio
   errado.** A lista da *linha de status* da spec 08 tem quatro itens, sim; mas o **mapa**
   (`specs/modulo-almoxarifado/README.md`, linha da 08) **acrescenta** por escrito *"(5) status
   automático no recebimento"* e *"(6) exportar `derivarRecebimentoDoPedido`"*. O handoff estava
   **certo** e apontava para o mapa; a medição da Fase 0 olhou só a spec. É exatamente o erro que a
   skill manda evitar (cruzar com o que a spec já mediu **antes** de medir do zero) — cometido pela
   própria Fase 0 que o cita. Os dois itens foram entregues nesta etapa, e o mapa registra isso.

### Teste vazio nº 5 desta base, pego pelo controle positivo de T2

O cenário de não-fatalidade (RN-E05) renomeava `pedidos_compra` para forçar a falha. **Não forçava
nada:** a guarda `sqlite_master` do próprio gancho vê a tabela ausente e sai **sem exceção** — não há o
que ser fatal. Medido: com `throw eStatus` no lugar do `warn`, o cenário continuava **verde (9/9)**.
Reescrito para esconder `itens_pedido_compra` (esquema parcial realista, as duas tabelas nascem em
arquivos diferentes), onde o gancho lança de verdade; a metade da tabela ausente virou o cenário **(7b)**,
que afirma que a guarda sai **calada**. Com o cenário consertado, a mesma sabotagem derruba (7).
**Lição para a `fechar-etapa`:** um cenário de "falha não-fatal" cuja falha é produzida por um estado
que o código trata por *guarda* não mede não-fatalidade nenhuma — a falha tem de acontecer **depois** da
guarda.

## 5b. Retro de 4 números — Etapa 42

**1. Rodadas de correção até verde:** **0** no sentido clássico (nenhum fix-round de código depois da
integração — ver a Fase 5 abaixo quando fechar). O que houve foi **1 conserto de TESTE durante a
task**, achado pelo controle positivo: o cenário de não-fatalidade de T2 não sabia falhar e foi
reescrito antes de o commit sair. Contar isso como "rodada de correção" seria contabilidade
generosa; contar como zero seria desonesto — fica registrado como o que é.

**2. Achados da revisão: reais vs. ruído.**
- **Fase 2 (revisão do plano): 17 achados — 17 reais, 0 ruído.** Os três Critical foram confirmados
  pela execução, um por um: **F1** (a 13ª entrada derruba dois `assert` com `12` literal) e **F2**
  (`auditLabels` com duas varreduras de cobertura) ficaram **vermelhos exatamente como previsto** no
  instante em que o código entrou; **F3** (T5 depende de T3, não só de T2) foi confirmado por o
  cenário (2) de T5 ficar vermelho antes do merge do galho. Dos Important, o **F12** (o cenário
  RN-E06 podia não saber falhar) mudou o desenho do teste e a sabotagem provou que era necessário; o
  **F7** (o estorno existe e apaga o último sinal) virou limitação declarada; o **F13** corrigiu uma
  medição minha errada. **Nenhum achado foi descartado por não reprodução.** A Fase 2 desta etapa é a
  de melhor rendimento até aqui: 3 Critical num plano que já tinha passado pela minha própria
  medição.
- **Fase 5 (revisão do código): duas lentes em paralelo** — resultado abaixo, na seção da Fase 5.

**3. Paralelismo: 2 galhos, rodaram em paralelo de fato, 0 retrabalho.** T3 em worktree isolada
(`../CRM-wt-e42-alerta`, junction de `node_modules`, sem `npm install`) e T4 na árvore principal, só
em `client/`. Os dois commitaram sem colisão, e o merge do galho foi `--no-ff` limpo, sem conflito.
**O que fez o paralelismo funcionar foi a Fase 2, não a sorte:** o achado F5 (o contrato 2.4 dizia
"o e-mail e o cartão citam as mesmas literais", e 2.6 dava rótulos diferentes) era exatamente uma
divergência que os dois agentes teriam implementado cada um do seu jeito — retrabalho garantido num
dos dois. Foi congelado **antes** de despachar.
**O que ainda custou tempo:** T3 levou ~21 min e T4 ~9 min, e o tronco (T1+T2) foi sequencial por
necessidade (os dois tocam o mesmo arquivo). A janela de paralelismo real desta etapa era pequena
por desenho — o valor estava no tronco.

**4. Defeito que escapou:** a preencher na Fase 0 da Etapa 43, olhando para trás. Os candidatos
conhecidos (declarados, não escapados) estão nas letras B161 (movimentação cancelada depois do
fechamento) e D10/B165 (e-mail de parcial que chega depois de o pedido fechar).

**Bônus — o que este plano errou, e é a métrica que mais importa para a próxima:** quatro erros, os
quatro achados pela **execução** e não por releitura (seção 5, "Erros DESTE plano"). O mais instrutivo
é o **F17**: uma afirmação minha sobre *como um teste protege contra ciclo de require* estava errada, e
só a **sonda executada** do executor mostrou que a proteção dependia da ordem de carga. É a terceira
etapa seguida em que sonda executada acha o que leitura e suíte verde não acham.

## 6. Retro da Etapa 41 — nº 4 (defeito escapado), preenchido por esta Fase 0

1. **"`alertRegistry.js` (18 entradas)"** no handoff da 41 — **medido: 12**. Um executor que
   confiasse no número ao acrescentar a 13ª teria descrito o registro errado na spec 20.
2. **"o item (5) do seu 'falta para 🟢'" da feature 08** — aquela lista tem **4** itens, e o (1)
   está entregue desde a Etapa 38. O handoff descreveu de memória um item que a spec não numera.
3. **"cliente (badge 'Recebido' … se houver)"** — medido: o badge **já existe**
   (`Compras.js:21`,`:165`). O galho de cliente previsto encolheu para o cartão do alerta.

Nenhum dos três é defeito de **código** da 41 (o range `3032f5a..2b9defb` segue verde em 195/195);
os três são defeitos de **handoff**, a classe que a skill `desenvolver-etapa-almoxarifado` manda
cruzar com a spec antes de medir do zero.

---

## Próxima tarefa detalhada — Etapa 43: a DIVERGÊNCIA ganha documento numerado (features 08 + 09) — medir antes

**Por que esta, e não outra** (pela ordem do `CLAUDE.md`, sem consultar ninguém):

1. **O "falta para 🟢" da feature que acabei de tocar (08) nomeia, agora que a 42 fechou:**
   conferência física estruturada, **divergência formal numerada**, localização na entrada (feature
   02), e-mail de entrada confirmada (feature 19).
2. **A mesma coisa aparece do outro lado.** `specs/modulo-almoxarifado/09-inspecao-qualidade/README.md:27`
   diz, medido: *"**Faltam para 🟢 (agora TRÊS, todos fluxo de negócio):** **não conformidade formal
   numerada**, liberação sob desvio autorizado e encaminhamento com status"*. **A divergência do
   recebimento e a não conformidade da inspeção são o MESMO documento visto de dois lados** — e as
   duas features o nomeiam como a fatia de maior valor que resta. Fazer uma sem a outra criaria dois
   documentos para o mesmo fato, que é a classe de bug que este módulo mais combate.
3. **Todos os insumos existem** (é o que torna a etapa alcançável, e é o que faltava antes):
   - a **quantidade conferida por item** (Etapa 36, `e2a23a9`+`d02744a`+`e287a06`) — a divergência de
     quantidade é derivável;
   - o **`pedido_item_id`** e a **situação do pedido** (Etapa 37) — divergência contra o **pedido**,
     não só contra a nota;
   - as **medidas com plano de inspeção** e a `divergencia_dimensional` **derivada** (Etapas 27/29/30);
   - **anexos** presos à inspeção e ao recebimento (Etapas 32/34) — o laudo cabe no documento;
   - o **gerador de número único** `services/almoxarifado/numeroDoc.js` (Etapa 31) — o `ND-`/`NC-`
     nasce sem o defeito de colisão que o `REC-` teve;
   - o **registro de alertas** e a entrada `DIVERGENCIA_RECEBIMENTO` que **já existe**
     (`alertRegistry.js`, e a `DIVERGENCIA_INVENTARIO` ao lado) — o alerta não precisa nascer, precisa
     passar a apontar para o documento.
4. **Descartado como Etapa 43, com o motivo:** (a) **conferência física estruturada** (item (1) da 08)
   — é cadastro de checklist por tipo de material, escopo de etapa inteira, e ela **consome** o
   documento de divergência, então vem depois; (b) **feature 05, separação/picking** — a spec mede 3
   de 13 e exige entidade nova (lista de separação) mais rota de picking e tela de fila: grande e sem
   elo com o que acabou de fechar; (c) **feature 06, aprovações configuráveis** — o motor configurável
   está adiado *"para demanda real"* por decisão do usuário; sobram dois defeitos pequenos
   (`limite_aprovacao_auto` morto e o lembrete que não alcança `AGUARDANDO_APROVACAO_VALOR`), que são
   fix-round, não etapa; (d) **feature 21, previsto × realizado** — depende de orçamento por projeto,
   que não existe; (e) **comparação de cotações** — exige "processo de cotação" com N fornecedores por
   material, entidade descartada por desenho na Etapa 41.

**Contrato que a 43 consome (medido em `4e27359` neste fechamento — a Fase 0 tem de RECONTAR, e
cruzar com as specs 08 e 09 ANTES de medir do zero: esta etapa cometeu exatamente esse erro, ver o
item 4 de "Erros DESTE plano"):**

- **A quantidade conferida e a derivação da divergência de quantidade** —
  `recebimentos_material_itens_almoxarifado.quantidade_recebida` vs. `quantidade_esperada`, escritas
  por `conferirRecebimento` (`receiptService.js`, a guarda de excedente da Etapa 36 mora ali). Medir:
  **existe hoje alguma derivação de "divergência" no serviço, ou só o campo `divergencia` textual?**
  A entrada de alerta `DIVERGENCIA_RECEBIMENTO` já lê algo — **descobrir o quê** é o primeiro passo.
- **A `divergencia_dimensional` derivada** (`inspectionService`, Etapa 27) — é o precedente de como
  esta base deriva divergência em vez de gravar um booleano. A 43 **reusa a régua**, não copia.
- **`numeroDoc.js`** — `gerarNumero(prefixo)` com retry na colisão; o `ND-`/`NC-` sai dele, nunca de
  `Date.now()`.
- **`ACAO_PERFIS` + `requirePermission`** (`services/almoxarifado/permissions.js`) — **a ação nova
  precisa de decisão de perfil.** Medir quem tem `inspecionar` e quem tem `receber_material`: quem
  **abre** uma não conformidade é quem confere (ALMOXARIFE) ou quem inspeciona (QUALIDADE)? Quem
  **decide** (aceitar sob desvio, devolver, sucatear) é outro perfil. Caminho reversível: nascer com
  a ação de abrir em ALMOXARIFE+QUALIDADE e a de **decidir** só em QUALIDADE+ADMINISTRADOR, e
  registrar na letra B.
- **`safeAlter`** — a tabela nova entra pelo ledger de migrações; `schemaUnico.api.test.js` **recusa**
  `ALTER TABLE` fora de `safeAlter(`.
- **O alerta** — `DIVERGENCIA_RECEBIMENTO` e `DIVERGENCIA_INVENTARIO` já existem no registro (13
  entradas agora, contando a `PEDIDO_COMPRA_PARCIAL` da 42 — **conte, não confie no número**: o
  handoff da 41 errou dizendo 18 quando eram 12).
- **Suítes que têm de continuar verdes** (números de partida deste fechamento, a confirmar na Fase 0):
  `test:api` **199/199 arquivos**, almoxarifado **42/0**, validation **4/0**, safealter **3/0**,
  sqlite **5/0**, cliente **51 suítes / 786 testes**, build `Compiled successfully`.

**Pontos de atenção (medir na Fase 0 antes de prometer):**

- **Um documento ou dois?** A decisão de desenho mais cara da 43. *"Divergência de recebimento"* e
  *"não conformidade de qualidade"* podem ser uma tabela com `origem` (`RECEBIMENTO` | `INSPECAO` |
  `INVENTARIO`) ou duas tabelas. **Uma** tabela força as duas telas a concordar sobre o que é uma
  divergência; **duas** deixam cada feature evoluir sozinha e divergem na primeira edição. O
  precedente desta base é **um dono por régua** — mas medir antes: `anexos_documento_almoxarifado` é
  o precedente de tabela única com `entidade`, e funcionou.
- **A divergência é DERIVADA ou GRAVADA?** A Etapa 27 derivou (`divergencia_dimensional`) e a spec 08
  chama o item de *"registro formal (tipo, quantidade, ação)"* — ou seja, o **fato** é derivado, mas a
  **decisão** (o que se fez a respeito) tem de ser gravada. Não repetir o erro da feature 07, em que
  `reserva_id` era só uma coluna e a spec afirmava que havia baixa.
- **O que acontece com o pedido de compra.** A divergência de quantidade contra um pedido interage
  com a RN-E01 desta etapa: um recebimento com divergência que **fecha** o pedido — o pedido deve
  fechar mesmo com não conformidade aberta? Caminho reversível: **sim, fecha** (a régua é quantidade
  física, e a NC é documento paralelo), e registrar em B. Mas **medir** se alguma tela passa a
  mentir com isso.
- **Estado que a 42 criou e a 43 pode fechar de graça:** o pedido fechado cuja movimentação de
  entrada é **cancelada** não deixa sinal (`B161`). Uma não conformidade com ação *"devolver ao
  fornecedor"* é exatamente o documento que devia existir nesse caso — vale medir se a 43 pode
  absorver essa limitação em vez de deixá-la aberta.
- **Despachar em lotes de no máximo dois galhos** — três etapas seguidas perderam agentes pelo limite
  de sessão ao despachar três ou mais de uma vez.
- **Retro nº 4 desta etapa (defeito escapado)** é preenchida pela Fase 0 da 43 olhando para trás: o
  que a 42 deixou errado neste handoff e no código.
