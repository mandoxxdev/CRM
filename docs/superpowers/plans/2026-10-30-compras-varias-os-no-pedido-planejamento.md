# Compras — várias OS no mesmo pedido de compra (planejamento)

> **Status: planejado, não executado — **SUBSTITUÍDO em 2026-10-30** pela OS por item da Etapa 193 (sugestão do usuário aceita pelo André: a OS no pedido só justifica a compra; a OS de verdade é dada na liberação). Este plano fica como histórico; ver `2026-10-30-compras-etapa193-cadastro-so-no-compras-e-os-por-item.md`** (2026-10-30). Nenhuma linha de código foi escrita. Este documento mede quem consome a
> OS do pedido hoje, propõe o desenho, congela o rascunho do contrato e divide a execução em partes de até 4 h informadas.
>
> **Atenção:** as partes 5 a 8 mexem em código do **almoxarifado**, que está **pausado desde 2026-10-23**
> (`docs/superpowers/plans/2026-10-23-almoxarifado-pausa-e-retomada.md`: "não retomar sozinho"). As partes 1 a 4 ficam
> no Compras, mas a coluna nova dos itens mora no `schema.js` do almoxarifado (ver M1). Só começar a parte 5 com o aval
> do André para mexer no módulo.

## 1. O pedido

Item 7 do pedido do André de 30/10 (os itens 1–6 viraram a Etapa 192,
`docs/superpowers/plans/2026-10-30-compras-etapa192-cpf-maiusculas-os-digitada-ncm-materiais.md`): **a empresa quer que um
pedido de compra atenda várias OS de uma vez.** Hoje um pedido atende **uma** OS ou é de estoque
(`pedidos_compra.os_id`, decisão 1 do André na Etapa 171: "um pedido = uma OS, ou estoque").

Em paralelo, a Etapa 192 (RN-192.07/08) cria `pedidos_compra.os_texto` — a **OS digitada** (não cadastrada), só texto,
exclusiva com `os_id`, que **não** reserva, **não** entra no encerramento da OS nem na trava de exclusão. Este plano a
leva junto para o item (ver RN-VOS.02).

## 2. Mapa do estado atual — quem consome a OS do pedido

Medido por `grep os_id|os_numero|os_texto` em `server/` e `client/src/` em 2026-10-30 (commit `38612745`). Os números de
linha são desse commit; a Etapa 192 vai deslocá-los no `pedidoCompraService.js`, `schemas.js`, `pedidoDocumentoHtml.js`,
`routes/compras.js`, `PedidoCompraForm.js` e `Compras.js`.

### 2.1 Servidor — Compras

| # | Onde | O que faz com a OS hoje | O que muda para N OS |
|---|---|---|---|
| S1 | `server/index.js:19025-19028` (`ALTERS_PEDIDOS_COMPRA`, `'os_id INTEGER'`, sem FK) | A coluna do cabeçalho. | Fica, como **espelho** (RN-VOS.04). A OS de verdade passa para o item. |
| S2 | `server/services/almoxarifado/schema.js:2093-2130` (`CREATE itens_pedido_compra` + `itensPedidoCols` por `safeAlter`) | O item não tem OS. | Ganha `os_id INTEGER` e `os_texto TEXT` pelo `safeAlter` (M1: arquivo do almoxarifado). Backfill do cabeçalho (RN-VOS.10). |
| S3 | `server/services/compras/schemas.js:187-197` (`OS_INVALIDA`, `normalizarOsIdBruto`, `osIdOpcional`) e `:213` (`os_id` no `PedidoCompraCreateSchema`) | Valida a OS do cabeçalho. | `PedidoCompraItemSchema` ganha `os_id`/`os_texto` com a mesma régua; o cabeçalho continua aceito (compatibilidade, RN-VOS.03). |
| S4 | `pedidoCompraService.js:252-278` (`STATUS_OS_FECHADA`, `osFechada`, `normalizarOsId`, `assertOsAceitaCompra`) | Confere a OS do cabeçalho: existe e não está fechada; manter a mesma passa mesmo fechada. | Roda **por OS distinta dos itens**; "manter a mesma" passa a ser "a OS já estava nesta linha no pedido gravado" (RN-VOS.05). Literais com `Item <n>:` (seção 4). |
| S5 | `pedidoCompraService.js:286-297` (`lerOsDoPedido`, `numerosDasOs`) | Leitura viva do número/status (OS sumida → `OS #<id>`). | Reaproveitadas por item; `numerosDasOs` já recebe N ids. |
| S6 | `pedidoCompraService.js:470-485` (`relerPedido`) | Devolve `os_id`, `os_numero`, `os_status` do cabeçalho; itens sem OS. | Cada item volta com `os_id`, `os_texto`, `os_numero`, `os_status`; cabeçalho ganha `os_lista` (seção 4). |
| S7 | `pedidoCompraService.js:500-525` (`lerPedidoParaRecebimento`) | `os_id`/`os_numero` para a tela do Recebimento travar a OS. | Devolve `os_lista`; `os_id`/`os_numero` só quando há uma OS só (espelho). |
| S8 | `pedidoCompraService.js:580-590` (`inserirLinhasDoPedido`) | Não grava OS. | Grava `os_id`/`os_texto` da linha. O `PUT` apaga e reinsere as linhas — a OS tem de vir em cada linha (ou do cabeçalho, RN-VOS.03). |
| S9 | `pedidoCompraService.js:619-639` (`criarPedido`) | Normaliza e confere a OS do cabeçalho antes de escrever; grava `os_id` no `INSERT`. | Confere a OS de cada item antes de qualquer escrita; grava o espelho (RN-VOS.04). |
| S10 | `pedidoCompraService.js:824-846` (`atualizarPedido`) | `os_id` ausente não mexe, `null` tira; bloqueado depois do 1º recebimento (`jaTeveRecebimentoEdicao`). | Mesma semântica por item; o bloqueio pós-recebimento continua valendo e é o que garante que `pedido_item_id` do recebimento nunca aponta para linha reinserida. |
| S11 | `pedidoCompraService.js:1441` (`importarPedidos` por planilha) e `cotacaoService.js:195` (`gerarPedidoDaCotacao`) | Chamam `criarPedido` **sem** OS (pedido de estoque). | Nada muda (sem OS = estoque). Planilha com coluna de OS fica fora (seção 7). |
| S12 | `server/routes/compras.js:157-179` (`GET /api/compras/pedidos`) | Filtro `?os_id=` por `p.os_id = ?`; `os_numero` vivo por pedido. | Filtro por `EXISTS` nos itens (RN-VOS.08); `os_numero` vira a lista "1234, 1250"; mantém `os_id` espelho. |
| S13 | `pedidoDocumentoHtml.js:373-380` (linha `OS:` no cabeçalho do documento) | Uma linha `OS: <numero>` (ou `OS #<id>`); sem OS, nada. | Ver RN-VOS.09 e a pergunta P2 (lista no cabeçalho + coluna "OS" nos itens). **PDF:** fator 2,5. |
| S14 | `routes/compras.js:208` (`GET /api/compras/aux/ordens-servico`) | Lista as OS para o `<select>`. | Nada (o formulário só passa a usá-la por item). |
| S15 | `alertRegistry.js:766-841`, `auditLabels.js:79-84` | Leem `pedidos_compra` por colunas explícitas (status, atraso, saldo). Não usam OS. | Nada. Medido: nenhum `os_id`. |

### 2.2 Servidor — OS (core) e encerramento

| # | Onde | O que faz hoje | O que muda |
|---|---|---|---|
| S16 | `server/services/almoxarifado/osEncerradaService.js:113-116` (`pedidosDaOs`) | `SELECT … FROM pedidos_compra WHERE os_id = ?` — a lista que a exclusão da OS cita no 409. | Tem de olhar os **itens** (`EXISTS` em `itens_pedido_compra.os_id`) além do cabeçalho (RN-VOS.07). |
| S17 | `server/index.js:20709-20738` (`DELETE /api/operacional/ordens-servico/:id`) | Guarda dupla: `pedidosDaOs` antes e `NOT EXISTS (SELECT 1 FROM pedidos_compra WHERE os_id = ?)` **no comando**. | O `NOT EXISTS` do comando também tem de olhar os itens — senão a OS que só aparece no 2º item de um pedido é apagada (furo da RN-171.10). |
| S18 | `osEncerradaService.js:50` (`liberarReservasDaOs`) | Ao fechar a OS, solta as reservas `MANUAL` dela (por `reservas.os_id`) e redistribui por `reservarLiberacaoParaQuemEspera` **sem** `sobTrava` (pega a trava do material). | Nada, desde que a reserva continue nascendo com o `os_id` da linha. **Trava:** não mexer. |

### 2.3 Servidor — Recebimento e reserva (almoxarifado, **pausado**)

| # | Onde | O que faz hoje | O que muda |
|---|---|---|---|
| R1 | `reservaDaOs.js:67-76` (`osIdDoPedido`) | Lê `pedidos_compra.os_id` (vivo). | Passa a existir `osIdDaLinhaDoPedido(pedido_item_id)`; `osIdDoPedido` vira o espelho (uma OS só ou `null`). |
| R2 | `reservaDaOs.js:86-90` (`osDoRecebimento`) | **A régua única** da OS efetiva do recebimento: com pedido → a OS viva do pedido; sem pedido → a OS própria (Etapa 176). | Vira **por item do recebimento**: com `pedido_item_id` → a OS da linha do pedido; sem linha (material fora do pedido) → nenhuma; sem pedido → a OS própria. Mantém uma versão "do recebimento" para as leituras (lista), que devolve a lista. |
| R3 | `reservaDaOs.js:97-118` (`osAbertaDoRecebimento`) | Uma OS aberta por recebimento (ou `null` = fila geral). | Uma OS aberta **por item** (`osAbertaDoItem`). Chamado de dentro da seção da trava (R6, R8). |
| R4 | `reservaDaOs.js:127-133` (`jaReservadoDaNotaParaOs`) | O que a nota já reservou do material para a OS (retomada): soma reservas `REQUISICAO` **de qualquer requisição** da nota + `MANUAL` da OS. Hoje é correto porque, em modo OS, a fila geral não leva nada desta nota. | **Ponto mais delicado.** Com duas OS no mesmo material da mesma nota, o termo `origem = 'REQUISICAO'` sem filtro conta para a OS A o que foi reservado para requisições da OS B. Tem de filtrar a requisição da reserva pela OS (`requisicaoCasaComOs`, ou `rs.os_id`, que a reserva da fila grava desde a 172 — RN-172.05). Controle positivo obrigatório. |
| R5 | `reservaDaOs.js:185-215` (`reservarParaOsSobTrava`) | Cria a reserva `MANUAL` da OS sob a trava de quem chama, teto pelo livre de caixa, dono conferido, relê a OS depois (Fase 5 da 171). | Nada no corpo: recebe a OS do item em vez da do recebimento. **Trava:** chamada só de dentro da seção. |
| R6 | `reservaChegadaService.js:205-257` (`reservarChegadaParaQuemEspera`) | Agrega a nota **por material** (`livrePorMaterial`), lê **uma** OS do recebimento dentro da seção (`comLockDosMateriais`) e, havendo OS, manda tudo para `distribuirParaOs`. | Agrega por **(material, OS da linha)**. O conjunto de materiais travados **não muda** (mesma `comLockDosMateriais`, mesma ordem crescente); os baldes do mesmo material rodam em sequência **dentro** da mesma seção. Balde sem OS (linha de estoque, OS digitada, OS fechada) vai para `distribuirSemLock` (fila geral). Ordem dos baldes: P5. |
| R7 | `reservaChegadaService.js:461-480` (`distribuirParaOs`) | Fila das requisições da OS, depois o resto vira reserva da OS. | Nada no corpo; chamado uma vez por balde. |
| R8 | `reservaChegadaService.js:544-583` (`reservarLiberacaoParaQuemEspera`) | Inspeção que aprova / NC que aceita: lê a OS do recebimento (`osAbertaDoRecebimento`) dentro de `comLockDoMaterial`. `ctx` traz `recebimento_id` e `material_id`, **não** o item. | O `ctx` passa a levar `recebimento_item_id` (a inspeção já tem — `inspecoes_recebimento_almoxarifado.recebimento_item_id`), e a OS sai da linha. Chamadores: `inspectionService.js:441`, `nonConformityService.js:1010`, via `aposLiberacaoSemFalhar` (`reservaChegadaService.js:588`). |
| R9 | `receiptService.js:405-430` (`resolverOsDaCriacao`) | Recebimento de pedido: OS do payload diferente da do pedido → 400 `literalOsDoPedido`; igual/ausente → aceita e não grava. | Pedido de várias OS: OS própria → 400 (RN-VOS.12). Pedido de uma OS: igual a hoje. |
| R10 | `receiptService.js:1349-1362` (`/fiscal` liga pedido a recebimento com OS própria) | Exige a mesma OS e limpa a própria. | Mesma regra da R9. |
| R11 | `receiptService.js:1643` (`osIdDaNota`), `:1706` (guarda do dono só sem pedido), `:1811` (`os_id` da `ENTRADA_COMPRA`) | Uma OS por nota, gravada em todas as entradas como marca de origem (RN-171.07, mesmo com a OS fechada). | A OS **da linha** na `ENTRADA_COMPRA` de cada item. A guarda do dono sem pedido não muda. **Trava:** `registrarMovimentacao` pega `naTravaDoMaterial` por dentro desde a 97 — não aninhar. |
| R12 | `receiptService.js:515-520` (`resolvidos`, `pedido_item_id: linha.id`), `:927-951` (`resolverLinhaDoPedido`), `:1910-1914` (soma na linha) | O servidor escolhe a linha do pedido: a do payload se for do pedido e do mesmo material; senão **a de menor id com saldo**. A recebida inteira soma **numa linha só** (o excedente fica nela). | Continua. Consequência: sem `pedido_item_id` no payload, a chegada parcial atende **primeiro a OS da linha mais antiga** (P5). A tela do recebimento passa a mandar `pedido_item_id` sempre (já manda quando a linha vem do pedido). |
| R13 | `receiptService.js:2257-2285` (`comOsEfetiva`, lista e detalhe — `:3092`) | Um `os_id` efetivo e `os_numero` por recebimento. | `os_lista`; `os_id`/`os_numero` espelho (uma OS → ela; várias → `os_id null`, `os_numero` "1234, 1250"). |
| R14 | `receiptService.js:2457-2517` (`listarPedidosCompraAux`) e `:2990` (`listarItensPedidoCompraAux`) | Lista de pedidos para receber com `os_id`/`os_numero`; itens sem OS. | Pedidos com `os_lista`; **cada item** com `os_id`/`os_numero`/`os_texto`. |
| R15 | `reservaChegadaService.js:694-760` (recria a reserva da OS depois do estorno), `reportService.js:145-184` (reservado por OS, consumo por OS — Etapa 174) | Leem `reservas.os_id` / `movimentacoes.os_id`. | Nada: a OS continua chegando nessas colunas, agora a da linha. |

### 2.4 Cliente

| # | Onde | O que faz hoje | O que muda |
|---|---|---|---|
| C1 | `client/src/components/compras/PedidoCompraForm.js:17, 172` (`osIdParaPayload`), `:363` (estado `osId`), `:428` (carrega as OS), `:485-487` (preenche na edição), `:675` (payload), `:921` (o `<select>` do cabeçalho) | Um `<select>` "OS" no cabeçalho ("Estoque (sem OS)" = `null`). A 192 acrescenta "OS não cadastrada — digitar". | O cabeçalho vira **"OS para todos os itens"** (atalho que preenche as linhas) e cada item ganha a sua OS (select + digitada) — na linha ou nos "detalhes" do item (`:1161`). |
| C2 | `client/src/components/Compras.js:27-32` (`rotuloOsDoPedido`), `:296` (Excel), `:489` (coluna "OS") | Uma OS por pedido. | Mostra a lista ("1234, 1250" ou "1234 +2"); Excel com a lista inteira. |
| C3 | `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js:284, 842, 871, 1411` (o `os_id` próprio do formulário, só sem pedido), `:1000-1004` (`osDoPedidoEscolhido` — mostra e trava a OS do pedido), `:1177` (coluna OS da lista), `:1214` (OS no detalhe), `:1474` (`<select>` da OS) | Uma OS por recebimento. | Com pedido de várias OS: mostra a OS **por linha** e esconde o select da OS própria; lista e detalhe mostram a lista. |
| C4 | Testes que fixam o contrato atual: `PedidoCompraForm.test.js`, `Compras.test.js`, `RecebimentosOs.test.js`; no servidor `comprasPedidoOs`, `pedidoOsPontaAPonta`, `recebimentoComOs`, `osEncerradaLiberaCompra`, `osEncerradaRotas` (`*.api.test.js`) | Afirmam "uma OS no cabeçalho". | Continuam verdes para o pedido de uma OS (o espelho existe para isso); cenários novos para várias OS. |

## 3. Desenho proposto

### 3.1 A escolha: OS por item (recomendado) × lista no cabeçalho com rateio

**Recomendado: a OS mora no item** (`itens_pedido_compra.os_id` / `os_texto`). Se uma quantidade tiver de ser dividida
entre duas OS, o comprador **repete a linha** (mesmo material, duas linhas, uma por OS) — o pedido já aceita duas linhas
do mesmo material desde a Etapa 37 (saldo agregado por material, `resolverLinhaDoPedido`).

Por quê:
- O recebimento **já sabe a linha** de cada item que chega (`recebimentos_material_itens_almoxarifado.pedido_item_id`,
  resolvido pelo servidor, R12). Com a OS na linha, "para qual OS reservar" é uma leitura, não um cálculo.
- O documento impresso já é por linha; a OS vira mais uma coluna.
- O `PUT` já reescreve as linhas inteiras e é bloqueado depois do 1º recebimento — a OS da linha não muda debaixo de um
  recebimento.

**Descartado: lista de OS no cabeçalho com rateio de quantidade** (`pedido_compra_os` + `item × OS × quantidade`). É uma
matriz item × OS que reproduz a linha repetida com mais uma tabela, e obriga o recebimento a **ratear** cada chegada
entre as OS (qual primeiro? proporcional?) sem que a nota diga nada disso. Também quebra a régua "a recebida soma numa
linha só" (R12). Só valeria se a empresa precisar de rateio sem repetir linha (P1).

### 3.2 Regras (RN-VOS)

- **RN-VOS.01** — Cada linha do pedido tem **no máximo uma** OS: cadastrada (`os_id`), digitada (`os_texto`, até 60) ou
  nenhuma (estoque). Linhas diferentes podem ter OS diferentes, e o mesmo pedido pode misturar OS cadastrada, OS digitada
  e estoque.
- **RN-VOS.02** — `os_id` e `os_texto` são exclusivos **na linha**, com a régua da RN-192.07. A OS digitada continua só
  texto (RN-192.08): não reserva, não entra no encerramento nem na trava de exclusão da OS.
- **RN-VOS.03** — **Compatibilidade do cabeçalho.** O payload pode trazer a OS no cabeçalho (`os_id`/`os_texto`, como hoje)
  **ou** nos itens. Cabeçalho com OS e nenhum item com as chaves `os_id`/`os_texto` → a OS do cabeçalho vale para todos os
  itens (é o que cotação, importação e clientes antigos mandam). Cabeçalho com OS **e** algum item com as chaves → 400
  (seção 4). Sem OS em lugar nenhum → estoque.
- **RN-VOS.04** — **Espelho no cabeçalho.** `pedidos_compra.os_id` passa a ser derivado e regravado a cada `POST`/`PUT`:
  a OS quando **todas** as linhas têm a mesma OS cadastrada; `NULL` caso contrário. O mesmo para `os_texto`. Serve a dois
  fins: todo leitor antigo continua certo para o pedido de uma OS (que é o caso de hoje), e voltar o código atrás não
  quebra nada (o pedido de várias OS cai em "estoque" para o código antigo — declarado). Ninguém novo lê o espelho para
  decidir reserva.
- **RN-VOS.05** — A conferência da OS (existe, não está fechada) roda **por OS distinta das linhas**, antes de qualquer
  escrita. No `PUT`, uma OS que **já estava no pedido gravado** passa mesmo fechada (a régua "manter a mesma" da RN-171.03
  vale por OS, não por linha: mover uma OS fechada para outra linha não é compra nova).
- **RN-VOS.06** — Leitura (`GET /pedidos/:id`): cada item com `os_id`, `os_texto`, `os_numero`, `os_status` (vivos, M2 da
  171); o pedido com `os_lista` agrupada por OS, na ordem da 1ª linha em que aparece.
- **RN-VOS.07** — A exclusão da OS (RN-171.10) recusa com 409 se a OS estiver em **qualquer linha** de qualquer pedido —
  na leitura (`pedidosDaOs`) **e** no `NOT EXISTS` do comando (S16, S17). Literal inalterada.
- **RN-VOS.08** — Lista de pedidos: `?os_id=` acha o pedido se a OS estiver em qualquer linha. Coluna e Excel mostram a
  lista das OS do pedido.
- **RN-VOS.09** — Documento impresso: cabeçalho `OS: 1234, 1250` (todas, na ordem da RN-VOS.06; digitada entra pelo texto)
  e, **quando houver mais de uma OS**, coluna "OS" nos itens. Pedido de uma OS sai igual a hoje. (Pendente da P2.)
- **RN-VOS.10** — **Migração reversível.** Backfill idempotente: toda linha com `os_id IS NULL AND os_texto IS NULL` cujo
  pedido tem `os_id` (ou `os_texto`) recebe a do cabeçalho. O cabeçalho **não** é apagado nem alterado. Registro no ledger
  (`schema_migrations_almoxarifado`, como os backfills do módulo) para não rodar duas vezes. Voltar atrás = o código antigo
  ignora as colunas dos itens e lê o cabeçalho, que continua certo para todo pedido criado antes.
- **RN-VOS.11** — **Recebimento.** Cada item do recebimento herda a OS **da linha do pedido** que o servidor resolveu
  (`pedido_item_id`, R12) — lida viva. Item fora do pedido (sem linha) → sem OS. A `ENTRADA_COMPRA` grava essa OS
  (RN-171.07, mesmo com a OS fechada). A distribuição da chegada, da inspeção e da NC agrupa por (material, OS da linha):
  OS aberta → fila das requisições dessa OS e o resto reservado para ela; sem OS, OS digitada ou OS fechada → fila geral.
- **RN-VOS.12** — Recebimento com OS própria (Etapa 176) e pedido de **várias** OS → 400 (seção 4). Pedido de uma OS:
  regra de hoje (mesma OS ou em branco).
- **RN-VOS.13** — A retomada de uma nota (I3 da 171) desconta, por (material, OS), só o que já foi reservado **para essa
  OS** — reservas `MANUAL` dela e reservas `REQUISICAO` de requisições que casam com ela (`requisicaoCasaComOs`).
- **RN-VOS.14** — Fechar a OS (cancelar/concluir) solta só as reservas dela (como hoje, por `reservas.os_id`). As linhas do
  pedido com essa OS que ainda não chegaram continuam no pedido; quando chegarem, entram como estoque (RN-171.03/B1101,
  agora por linha). Pendente da P3.

### 3.3 Travas (CLAUDE.md — "Trava por material")

O que toca a trava, e como fica:
- **R6** (`reservarChegadaParaQuemEspera`, porta que **libera e distribui**): continua sob `comLockDosMateriais` com o
  **mesmo** conjunto de materiais. A leitura da OS de cada linha acontece **dentro** da seção (como a 171 já faz com a OS do
  recebimento — a OS que fecha no meio vale a partir dali). Não abre trava nova nem aninha.
- **R8** (`reservarLiberacaoParaQuemEspera`, inspeção e NC): continua sob `comLockDoMaterial`; só a origem da OS muda.
  Atenção ao `sobTrava` (quem chama já segura — não pegar de novo; a trava não é reentrante).
- **R4/R5** só rodam sob a trava de quem chama. A releitura da OS depois de criar a reserva (Fase 5 da 171) fica.
- **R11** (`ENTRADA_COMPRA`): `registrarMovimentacao` pega `naTravaDoMaterial` por dentro (desde a 97). Não envolver em
  `comLockDosMateriais`.
- **S18/liberação** (fechar a OS): soltar reserva sem distribuir não pega trava (B441); a redistribuição pega. Não mexer.
- **Teste de corrida** (molde `exclusaoSerieQueVoltou.api.test.js` RN-15): duas OS do mesmo material na mesma nota, e a
  OS A fechando no meio da distribuição da OS B — o gesto concorrente disparado do contexto do teste, não de dentro do
  gancho (AsyncLocalStorage).

## 4. Rascunho do contrato (congelar na revisão do plano)

**`POST /api/compras/pedidos` e `PUT /api/compras/pedidos/:id`** — cada item aceita:

```json
{ "material_id": 10, "quantidade": 4, "valor_unitario": 12.5, "os_id": 31, "os_texto": null }
```

- `os_id`: inteiro positivo, `null` (sem OS) ou ausente. `os_texto`: texto até 60, `''`/`null` = sem OS, ou ausente.
- Cabeçalho `os_id`/`os_texto`: aceito como hoje (RN-VOS.03).

Literais (400, com `<n>` = posição 1..n da linha no payload, a mesma do `item_numero`):

| Situação | Mensagem |
|---|---|
| Linha com `os_id` e `os_texto` | `Item <n>: escolha a OS da lista ou digite, não os dois.` |
| `os_texto` acima de 60 | `Item <n>: OS digitada com no máximo 60 caracteres.` |
| `os_id` não inteiro positivo | `Item <n>: OS inválida` |
| OS não existe | `Item <n>: OS #<id> não encontrada` |
| OS fechada (compra nova) | `Item <n>: a OS <numero_os> está <status> — não aceita compra nova` |
| OS no cabeçalho e em algum item | `Informe a OS no cabeçalho (vale para todos os itens) ou em cada item, não nos dois.` |

As literais do cabeçalho de hoje (`OS inválida`, `OS #<id> não encontrada`, `A OS <n> está <s> — não aceita compra nova`, e as
duas da 192) continuam iguais quando a OS vem pelo cabeçalho.

**`GET /api/compras/pedidos/:id`**

```json
{
  "id": 7, "numero": "PC-0007",
  "os_id": null, "os_texto": null, "os_numero": null, "os_status": null,
  "os_lista": [
    { "os_id": 31, "os_texto": null, "os_numero": "1234", "os_status": "em_andamento", "itens": [1, 3] },
    { "os_id": null, "os_texto": "OS 88 do cliente", "os_numero": null, "os_status": null, "itens": [2] }
  ],
  "itens": [ { "item_numero": 1, "os_id": 31, "os_texto": null, "os_numero": "1234", "os_status": "em_andamento" } ]
}
```

`os_id`/`os_texto`/`os_numero`/`os_status` do cabeçalho = espelho (RN-VOS.04). Linhas de estoque não entram em `os_lista`.

**`GET /api/compras/pedidos`** — `os_id` espelho; `os_numero` = rótulos das OS separados por `, ` (`OS #<id>` se sumiu;
digitada pelo texto); `?os_id=` por `EXISTS` nas linhas.

**`GET /api/almoxarifado/recebimentos-aux/pedidos-compra`**, **`/:id`** e **`/:id/itens`** — pedido com `os_lista`; cada
item com `os_id`, `os_numero`, `os_texto`.

**Recebimento (lista e detalhe)** — `os_id` espelho, `os_numero` lista, `os_lista`.

**`POST /api/almoxarifado/recebimentos`** (e o `/fiscal`) com `os_id` próprio e pedido de várias OS → 400
`O pedido <numero> atende várias OS — a OS de cada item vem do pedido; deixe a OS do recebimento em branco.`

**`DELETE /api/operacional/ordens-servico/:id`** — 409 inalterado
(`A OS <numero> tem pedido de compra vinculado (<pedidos>) — cancele a OS em vez de excluir`), agora contando as linhas.

## 5. Perguntas para a empresa (respostas mudam o desenho)

- **P1 — Um item pode ser dividido entre duas OS?** Proposta: sim, repetindo a linha (ex.: 10 chapas = 6 para a OS 1234 em
  uma linha + 4 para a 1250 em outra). Se precisarem dividir **sem** repetir a linha, o desenho muda para o rateio (3.1).
- **P2 — O que o pedido impresso mostra para o fornecedor?** Proposta: todas as OS no cabeçalho e uma coluna "OS" em cada
  item. Alternativa: só no cabeçalho, ou nenhuma (a OS é assunto interno).
- **P3 — OS encerrada com pedido ainda chegando:** hoje o que chega depois vira estoque livre. Com várias OS, só as linhas
  da OS encerrada viram estoque. Querem também um aviso para o comprador (ex.: "a OS 1234 foi encerrada e tem 4 itens
  ainda não recebidos no pedido PC-0007")? Querem poder cancelar só aquelas linhas?
- **P4 — Mistura no mesmo pedido:** pode ter linha de OS, linha de estoque e linha com OS digitada no mesmo pedido?
  Proposta: sim.
- **P5 — Chegada parcial de material repetido em duas OS:** se chegam 6 de 10 chapas e o recebedor não escolhe a linha,
  qual OS é atendida primeiro? Proposta: a linha mais antiga do pedido (é como o sistema já escolhe a linha hoje), e a
  tela do recebimento deixa escolher a linha.
- **P6 — OS digitada vale por item ou uma só para o pedido?** Proposta: por item, como a cadastrada.

## 6. Partes da execução

Fórmula: informado = execução × 2 (× 2,5 quando toca estoque/permissão/celular/PDF) + 30 min de análise (+ 1 h se precisa
decidir regra), mínimo 1 h, arredondado para cima em 30 min.

| Parte | O quê | Depende de | Execução | Fator | Decisão de regra | Informado |
|---|---|---|---|---|---|---|
| 1 | Banco e contrato do pedido: colunas nos itens (S2), backfill com ledger (RN-VOS.10), Zod por item (S3), conferência por OS (S4/S9/S10), espelho (RN-VOS.04), leitura por item e `os_lista` (S6). Testes `*.api.test.js` + controle positivo do backfill | — | 1h15 | ×2 | sim (espelho, cabeçalho × item) | **4h** |
| 2 | Tela do pedido e lista: OS por item com "OS para todos os itens" (C1), coluna/Excel/filtro (S12, C2) | 1 | 1h15 | ×2 | não | **3h** |
| 3 | Pedido impresso: OS no cabeçalho e coluna por item (S13, RN-VOS.09) | 1 | 30 min | ×2,5 (PDF) | sim (P2) | **3h** |
| 4 | Exclusão e encerramento da OS: `pedidosDaOs` e o `NOT EXISTS` do comando pelas linhas (S16, S17, RN-VOS.07) | 1 | 45 min | ×2 | não | **2h** |
| 5 | Recebimento — entrada e marca (almoxarifado): OS da linha por item (R1, R2), `ENTRADA_COMPRA` (R11), OS própria × pedido de várias OS (R9, R10, RN-VOS.12), leituras da lista/detalhe/aux (R13, R14) | 1 | 1h | ×2,5 (estoque) | sim (RN-VOS.12) | **4h** |
| 6 | Recebimento — reserva por OS sob a trava: chegada por (material, OS) (R6), inspeção e NC com o item (R8), retomada por OS (R4, RN-VOS.13), teste de corrida com controle positivo | 5 | 1h15 | ×2,5 (estoque/trava) | não | **4h** |
| 7 | Tela do recebimento: OS por linha, lista/detalhe com várias OS, select da OS própria escondido (C3) | 5 | 45 min | ×2 | não | **2h** |
| 8 | Prova ponta a ponta + documentação (`fechar-etapa`): pedido com 2 OS → chegada parcial → reservas por OS → requisição e consumo por OS (174) → encerrar uma OS → excluir a outra (409) | 2–7 | 1h | ×2,5 (estoque) | não | **3h** |
| | **Total** | | **7h45** | | | **25h** |

Paralelismo possível depois da parte 1: 2, 3, 4 e 5 em agentes separados (arquivos disjuntos — cuidado só com o
`pedidoCompraService.js`, que a 1 e a 5 leem e a 1 escreve: a 5 começa depois do merge da 1). A 6 e a 7 depois da 5.

Notas de risco:
- **M1** — a coluna nova dos itens nasce no `server/services/almoxarifado/schema.js` (é onde `itens_pedido_compra` mora,
  porque `initSchema` roda no harness). É arquivo do módulo pausado; a parte 1 só acrescenta uma entrada em
  `itensPedidoCols` e o backfill.
- **M2** — o termo `REQUISICAO` sem filtro de OS em `jaReservadoDaNotaParaOs` (R4) é o lugar onde uma regressão silenciosa
  apareceria (a OS B reservando menos porque a conta da OS A comeu a dela). Precisa de cenário com duas OS do mesmo
  material e controle positivo que sabote o filtro.
- **M3** — pedidos já recebidos em parte antes da migração: as linhas ganham a OS do cabeçalho pelo backfill, que é a
  mesma OS que as reservas já gravaram — nada a reconciliar. Conferir por sonda na base de produção copiada.

## 7. Fora do escopo

- Importação de pedidos por planilha com coluna de OS (hoje sem OS).
- Cotação com OS por item (a cotação gera pedido de estoque; a OS se escolhe no pedido).
- Rateio de uma linha entre OS sem repetir a linha (só se a P1 pedir).
- Trocar a OS de uma linha depois do 1º recebimento (o `PUT` continua bloqueado).

## 8. Bloco para o WhatsApp

*Pedido de compra atendendo várias OS* — estimativa

*1. Base do pedido com OS por item* — cada item do pedido passa a ter a sua OS (cadastrada, digitada ou estoque); os pedidos que já existem herdam a OS que têm hoje. *4h*

*2. Tela do pedido e lista* — escolher a OS em cada item, com atalho para aplicar a mesma OS a todos; a lista de pedidos mostra e filtra por todas as OS do pedido. *3h*

*3. Pedido impresso* — o documento mostra as OS do pedido e a OS de cada item. *3h*

*4. Exclusão e encerramento da OS* — a OS que aparece em qualquer item de um pedido não pode ser apagada. *2h*

*5. Recebimento: entrada por OS* — cada item que chega fica marcado com a OS do seu item no pedido. *4h*

*6. Recebimento: reserva por OS* — o material que chega fica reservado para a OS certa de cada item, inclusive depois da inspeção. *4h*

*7. Tela do recebimento* — mostra a OS de cada item do pedido na hora de receber. *2h*

*8. Teste completo e documentação* — do pedido com duas OS até o consumo e o encerramento de cada uma. *3h*

*Total: 25h*

Pontos a confirmar com a empresa antes de começar: um item pode ser dividido entre duas OS? O pedido impresso mostra as OS para o fornecedor? Quando uma OS é encerrada com itens ainda por chegar, deve haver aviso para o comprador?
