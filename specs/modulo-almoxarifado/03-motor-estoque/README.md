# 03 — Motor de Estoque (saldos, movimentações, livro, saídas)

> **Status:** 🟢 — Etapa 1 entregue (2026-08-04): motor v2 com regra crítica/emergencial/centro de custo/custo médio, livro com filtros e extrato do item, estorno com motivo (backend + tela). A validação de vencido/lote reprovado que dependia da feature 10 foi entregue na Etapa 6, Task 3 (ver [10-lotes-series-etiquetas](../10-lotes-series-etiquetas/README.md)). · **Spec original:** seções 7 (fórmula de saldo), 13 (saídas), 30 (livro de movimentações)
> **Última atualização:** 2026-08-12 (**Etapa 8b — a quarta coluna de retenção e a conta do
> disponível numa fonte só.** Duas mudanças estruturais neste motor, detalhadas em "Fórmula de
> disponibilidade" e "Tipos de movimento da Etapa 8b", abaixo: (1)
> `materiais_almoxarifado.quantidade_em_terceiros` entrou na fórmula do disponível, e a subtração —
> que estava **replicada 14 vezes**, em 8 arquivos — passou a existir **uma vez só**, em
> `services/almoxarifado/availabilitySql.js` (`0a01124`); (2) quatro tipos de movimento novos
> (`REMESSA_TERCEIRO`, `RETORNO_TERCEIRO`, `PERDA_TERCEIRO`, `CONSUMO_TERCEIRO`, `e0be211`), sendo
> os dois primeiros de retenção pura e os dois últimos baixa de físico **e** retenção no mesmo
> UPDATE. A pendência do `AJUSTE` que não reconcilia retenção **ganhou uma terceira instância** —
> ver o fim deste arquivo.)
> Antes: 2026-08-10 (**fechamento dos 5 minors residuais do review final**: a
> citação da rota v1 [`routes/almoxarifado.js:573`, hoje `:752`] e a da guarda de vencimento
> [`stockService.js:451`, hoje o destructuring de `params`] perderam o número de linha; e o piso do
> estorno de ENTRADA ganhou a ressalva de que só vale quando a chave casa com a linha que a entrada
> escreveu — quando não casa, a reconciliação pode negativar a linha, registrado como 4ª pendência
> no fim do arquivo. Documentação e comentário apenas, sem mudança de comportamento — ver
> [`.superpowers/sdd/2026-08-09-almoxarifado-etapa6-lotes/minors-report.md`](../../../.superpowers/sdd/2026-08-09-almoxarifado-etapa6-lotes/minors-report.md).
> Antes: 2026-08-10, **review final do branch da Etapa 6**: o claim de saída por lote passou a ser contra o CONJUNTO de linhas do lote, não uma linha só; o estorno de ENTRADA com lote ganhou piso; o mostrador "Reservado" do mapa foi REMOVIDO — follow-up abaixo fechado; e três pendências novas declaradas no fim deste arquivo. Antes: 2026-08-09, Etapa 6 fechada — Task 3b acrescentou a liberação de vencimento, e a afirmação desta spec de que ela "não existe ainda" foi corrigida. Antes disso: Task 3, round 5 do review — o discriminador do estorno passa a ser "o material já tem linha?")
> **📋 Plano de implementação pronto:** [docs/superpowers/plans/2026-08-04-almoxarifado-etapa1-motor-estoque.md](../../../docs/superpowers/plans/2026-08-04-almoxarifado-etapa1-motor-estoque.md) — 9 tasks TDD (todas concluídas)

## Objetivo

Um único caminho de movimentação, transacional, com livro imutável (estorno em vez de exclusão), fórmula de disponibilidade correta e a "regra crítica" de saída aplicada.

## O que já existe

- **Motor v2:** `stockService.registrarMovimentacao` (`services/almoxarifado/stockService.js`) — 24 tipos de movimento, lote, localização origem/destino, centro de custo, integração com reservas, custo médio, grava auditoria, saldo anterior/posterior atômico. Rota: `POST /movimentacoes/v2` (`extended.js`), que **não** aceita os tipos todos: valida contra `TIPOS_MOVIMENTO_ROTA` (`schemas.js`) = `TIPOS_MOVIMENTO` − `ESTORNO` − `TIPOS_RETENCAO`. Retenção (reserva, bloqueio, quarentena/inspeção) só nasce dos serviços donos, que têm o gate de permissão certo e o registro paralelo que dá lastro ao número — a v2 tem gate `movimentar`, o mais amplo do módulo. Whitelist é **da rota**: chamadores internos usam o motor direto e seguem podendo criar qualquer tipo.
- **Estorno:** `POST /movimentacoes/:id/cancelar` (`extended.js`, `stockService.cancelarMovimentacao`) com `movimento_estorno_id`, `cancelamento_motivo`; reverte saldo e localizações (entrada/saída/ajuste/transferência); NÃO reverte custo médio — decisão registrada em 2026-08-04; bloqueia estornar ESTORNO/RESERVA/LIBERACAO_RESERVA, os tipos de inspeção (QUARENTENA/LIBERACAO_INSPECAO/REPROVACAO_INSPECAO/DECISAO_INSPECAO — reversão é pela tela de Inspeções, ver feature 09) e movimentação já cancelada (claim atômico fecha a corrida entre cancelamentos concorrentes do mesmo movimento). Reverter BLOQUEIO usa guarda condicional (`WHERE bloqueada >= ?`), não `MAX(0,...)`: estornar um bloqueio já desfeito recusa em vez de saturar. Também zera `regularizacao_pendente` da movimentação estornada e dispara verificação de alertas de estoque. Exige perfil `ajustar_estoque`. UI: botão "Estornar" por linha em `MovimentacoesAlmoxarifado.js` (mini-modal com motivo obrigatório), escondido nos tipos que o servidor recusa.
- **Extrato do item:** `GET /materiais/:id/extrato` (`extended.js`) agrega material (com `quantidade_disponivel`), saldos por localização, últimas 100 movimentações e reservas ativas. UI: `ExtratoMaterialModal.js`, aberto pelo nome do material no livro e pelo botão "Extrato" em `MateriaisAlmoxarifado.js`.
- **Saldos:** `estoque_saldo_almoxarifado` por material + `localizacao_id` + `lote_id` (FK para `lotes_almoxarifado` — reconstruída na Etapa 6, Task 2; até então `lote` era texto livre na própria tabela). É espelho agregado do FÍSICO em `materiais_almoxarifado.quantidade_atual` (`syncMaterialTotals`, chamado pelo AJUSTE com localização e pelo estorno dele) — a tabela **não tem mais** colunas de retenção (`quantidade_reservada/bloqueada/em_inspecao` existiam no `CREATE TABLE`, nunca tiveram escritor, e foram removidas na Etapa 6 justamente para que ninguém volte a somar a partir delas); retenção mora só em `materiais_almoxarifado`, e é por isso que `syncMaterialTotals` recalcula **somente** `quantidade_atual` (recalcular retenção a partir da soma zerava quarentena/reserva a cada AJUSTE por localização — achado do review final da Etapa 5). A reconciliação por soma é uma decisão de negócio (Etapa 6, Task 3, round 3 do review): contagem por localização **redefine** o saldo — não soma ao que já existia sem endereço —, então o total do material tem de ser a soma de tudo que se sabe onde está. **Correção de uma afirmação errada que esta spec fez até 2026-08-09 (round 4 do review):** aqui estava escrito que "TODO ramo que muda `quantidade_atual` também mantém a linha correspondente". Não é verdade — os ramos do **motor** mantêm (entrada/saída, os dois lados do estorno, AJUSTE sem localização via `syncSaldoLocalizacaoPadrao`), mas existe **um escritor conhecido fora do motor**: a conclusão de inventário com `aplicar_ajustes` (ver "Pendência nomeada" abaixo), que escreve `quantidade_atual` direto e nunca toca na tabela de saldo. Duas ressalvas do próprio motor, ambas intencionais: material legado (zero linhas) não é reconciliado até a primeira contagem — `syncMaterialTotals` não toca em material sem nenhuma linha —, e o estorno **ajusta** linha existente mas nunca **cria** a linha daquela chave (`ajustarSaldoExistente`); criar uma com −quantidade invertia a primeira contagem seguinte (achado do round 4). Quando a chave não casa, quem decide é `reconciliarEstornoSemLinha` (round 5): **material com zero linhas** segue no-op, **material que já tem linha** reconcilia o residual por `syncSaldoLocalizacaoPadrao` — o discriminador é "o material já está sob o regime da soma?", não "existe linha para esta chave?". Isso importa porque o miss acontece sem nada de legado: a chave do estorno resolve `localizacao_padrao_id` de **hoje** e o movimento original usou o padrão **da época**, então ganhar ou trocar o endereço padrão entre o movimento e o estorno faz o `WHERE` errar uma linha que existe. Saída por lote (Etapa 6, Task 3) recusa lote `BLOQUEADO`/`REPROVADO` e lote vencido (`data_validade < hoje`, sempre derivado — nunca é uma coluna gravada) antes de qualquer efeito de saldo, exceto para os tipos de descarte (`SUCATA`/`PERDA`/`AJUSTE_NEGATIVO`), que podem baixar lote vencido, e exceto para lote cujo vencimento foi **liberado** com justificativa (Task 3b, `556f86d` — a liberação não desvence o lote, só destrava o consumo; a guarda de status roda antes e continua mandando); e reivindica o saldo do PRÓPRIO lote com `UPDATE ... WHERE quantidade >= ? RETURNING`, não mais só o saldo agregado do material — ver [10-lotes-series-etiquetas](../10-lotes-series-etiquetas/README.md) (a mesma etapa que fechou este ponto do checklist abaixo).

  > **Correção do review final do branch (2026-08-10): o claim por lote é contra o CONJUNTO de
  > linhas daquele lote, não contra uma linha.** Até aqui esta spec descrevia (e o motor fazia) um
  > claim chaveado por `(material, localização resolvida, lote)`. A tela, porém, oferece o saldo
  > **agregado** — `lotService.listarLotesDoMaterial` soma `quantidade` de todas as localizações
  > daquele lote. Quando a localização resolvida da saída não era onde o lote estava, a tela dizia
  > "saldo 25", o FEFO pré-selecionava, e o motor respondia *"Saldo insuficiente no lote L1.
  > Disponível: 0"* — e isso contradizia a regra de negócio já escrita no guia do módulo (*uma
  > saída consome o saldo total do material, independente da área em que ele está endereçado*;
  > almoxarifado aqui é área física do mesmo site, não filial). Alinhado pelo lado do agregado:
  > `stockService.claimSaldoDoLote` drena as linhas do lote, preferindo a localização resolvida e
  > depois as maiores, cada uma por `UPDATE` condicional, **devolvendo explicitamente** o que já
  > drenou se o total não fechar. E **não cria linha**: `getOrCreateSaldo` criava a linha antes do
  > claim, então toda saída recusada deixava um `(loc, lote, 0)` para trás — lixo que ainda por
  > cima alimentava o discriminador do estorno (ver a nota sobre `reconciliarEstornoSemLinha`, que
  > conta linhas inclusive zeradas).
  >
  > **E o estorno de ENTRADA com lote ganhou piso.** Ele guardava o disponível do MATERIAL e
  > aplicava o delta na linha do LOTE sem guarda nenhuma — o −8 na direção inversa. Medido: lote
  > A=100, entrada de 10 no B, saída de 10 do B, estorno da entrada do B ⇒ linha do B em **−10**,
  > `quantidade_atual` coerente em 90 e nada denunciando. `ajustarSaldoExistente` passou a aceitar
  > `opcoes.minimo` no `WHERE` e a distinguir "linha não existe" (reconcilia) de "existe e não
  > comporta" (recusa, compensando `quantidade_atual` à mão antes de lançar). O ramo de SAÍDA
  > continua **sem teto**, de propósito: delta positivo não cria negativo e não há capacidade
  > máxima modelada.
  >
  > **O piso só vale quando a chave do estorno CASA com a linha que a entrada escreveu — condição
  > de contorno, não propriedade total (pré-existente, não é regressão desta rodada de review).**
  > Quando não casa, `ajustarSaldoExistente` devolve `existe: false`, e quem decide o resto é
  > `reconciliarEstornoSemLinha` → `syncSaldoLocalizacaoPadrao` (ver acima): essa função **cria** a
  > linha em `(localizacao_padrao_id atual, lote)` e grava nela `quantidade_atual − soma das outras
  > linhas`, sem piso nenhum — nem `opcoes.minimo`, nem checagem de `permite_saldo_negativo`.
  > Reproduzido: ENTRADA de 10 com lote e sem destino ⇒ linha `(NULL, lote) = 10`; o material
  > depois ganha `localizacao_padrao_id` (locX); o estorno da entrada procura a linha em
  > `(locX, lote)`, não acha (a real está em `(NULL, lote)`), cai na reconciliação, que cria
  > `(locX, lote)` e grava `quantidade_atual − outras = 0 − 10 = −10` — num material que não
  > permite saldo negativo. Registrado como pendência nomeada, abaixo.
- **Vínculo estruturado** na movimentação: `projeto_id`, `os_id`, `centro_custo_id` (+ `centros_custo_almoxarifado`), `cliente_id`, `requisicao_id`, `reserva_id`, `recebimento_id`, `documento_vinculado`, `justificativa`. Regra por tipo (`avaliarRegrasVinculo`/`REGRAS_VINCULO`) decide o que é obrigatório.
- **Rota v1 legada:** `POST /movimentacoes` (`routes/almoxarifado.js`, handler `app.post('/api/almoxarifado/movimentacoes', ...)` — sem número de linha de propósito: esta spec já citou `:573` e a rota andou para `:752`; número de linha em spec envelhece entre dois commits) — 4 tipos, sem lote/localização; delega para `stockService.registrarMovimentacao` desde a Etapa 0 (grava auditoria). A tela de Movimentações posta em `/movimentacoes/v2` desde a Etapa 1; a entrada/saída rápida de `MateriaisAlmoxarifado.js` ainda usa a rota v1 (que delega ao mesmo motor — migrar quando a tela for retrabalhada).
- Testes de serviço: entrada/saída, saldo negativo bloqueado, transferência, bloqueio, material inativo (em `almoxarifado.test.js`); testes de API de estorno, regras de vínculo, livro/extrato (`server/tests/api/`).
- Concorrência SQLite tratada (`services/sqliteConcurrency.js` — WAL + retry BUSY).

## Fórmula de disponibilidade (spec 7)

```
Estoque físico − bloqueado − quarentena/inspeção − reservado − EM TERCEIROS = Estoque disponível
```

Colunas existem; falta garantir que TODAS as operações (saída, reserva, inspeção, bloqueio) mantêm a fórmula e que consultas/relatórios usam "disponível" onde a spec exige.

### A quarta retenção e a fonte única — Etapa 8b (2026-08-12, `0a01124`)

**`materiais_almoxarifado.quantidade_em_terceiros` é a quarta coluna de retenção** (feature 14,
Etapa 8b): material que saiu do prédio para beneficiamento externo sai do **disponível** sem sair do
**patrimônio** — `quantidade_atual` não muda.

> **A distinção que NÃO pode ser "uniformizada": das quatro retenções, `quantidade_em_terceiros` é a
> única que significa "não está no prédio".** Reservada, bloqueada e em_inspeção são estados
> **administrativos** de material que **está** na prateleira. É essa diferença que decide o
> comportamento do **inventário**: a criação da conferência monta o esperado como
> `quantidade_atual − quantidade_em_terceiros`, e **só ela** — bloqueado e quarentena **continuam
> sendo cobrados na contagem**, porque aquele material tem de ser contado. Quem uniformizar as
> quatro ali passa a esconder do inventário material que está no galpão. Comentado no código
> (`routes/almoxarifado.js`, criação da conferência) e coberto nos dois sentidos por
> `tests/api/conferenciaEmTerceiros.api.test.js`.

**A conta do disponível deixou de ser replicada.** Até a Etapa 8b, `atual − reservada − bloqueada −
em_inspecao` existia em **14 implementações**: a função `stockService.getSaldoDisponivel` mais **13
queries escritas à mão**, espalhadas por **8 arquivos** — `stockService` (6 sítios, incluindo os
claims atômicos de saída e a guarda do hold da reserva), `requisitionService` (2),
`requisitionStateMachine`, `reportService`, `clienteEstoqueService` (**criado na própria Etapa 8**),
`routes/almoxarifado.js`, `routes/almoxarifado/extended.js` e **`routes/requisicoesMaterial.js`, que
nem pertence ao módulo**.

**Por que isso é o ponto onde a etapa mais provavelmente falharia em silêncio:** acrescentar a
coluna nova em 13 e esquecer 1 **não quebra nada** — o sistema passa a **recusar pela função e
aceitar pelo SQL**. A listagem mostraria disponível a mais, a reserva nasceria sobre material que
está no galvanizador, e a guarda atômica da saída deixaria passar. Nenhum erro, só o número errado.

**O que foi feito:** a conta passou a existir num lugar só —
`services/almoxarifado/availabilitySql.js`, com `COLUNAS_RETENCAO` e `disponivelSql(alias)` — e os
13 sítios passaram a chamá-la. **A prova não é "editei os 14"** (isso depende de alguém ter contado
certo): `tests/api/saldoEmTerceiros.api.test.js` **varre o código-fonte** e falha se a subtração
voltar a aparecer escrita à mão, com controle positivo do próprio padrão de busca.

> **Correção declarada:** o design da Etapa 8b dizia, na primeira versão, que a conta estava
> replicada em **sete** lugares. **Estava errado** — são quatorze (corrigido em `742b9ea`). É o
> **segundo** erro do mesmo tipo em duas etapas seguidas: a spec da Etapa 8 mandou auditar
> `services/almoxarifado/*.js` + `routes/almoxarifado/*.js` e deixou de fora `routes/almoxarifado.js`,
> onde estavam as duas piores leituras (`9d70d8c`). **Regra que fica: mudança em coluna de
> `materiais_almoxarifado` exige varredura de `server/` inteiro, nunca de um subconjunto escolhido
> por intuição.**

**Um sítio ficou de fora DE PROPÓSITO:** `dispSemBloqueio` (`quantidade_atual −
quantidade_bloqueada`, mensagem "Material bloqueado não pode ser utilizado") **não** é a conta do
disponível — é uma guarda específica de bloqueio, com mensagem própria, e a guarda do disponível
logo acima já recusou qualquer saída que invadisse a retenção nova. *Consequência conhecida:*
material que tenha **ao mesmo tempo** saldo bloqueado e saldo em terceiros pode ter o encerramento
da remessa barrado por essa guarda — não foi resolvido porque é a mesma pendência do `AJUSTE`
(abaixo) e a decisão é do cliente.

**Um 15º lugar que NÃO é a conta, mas depende da coluna:**
`stockAvailabilityService.SENSITIVE_MATERIAL_FIELDS`. `GET /api/requisicoes-material/materiais` faz
`SELECT m.*` e o sanitizador apaga as retenções por **lista explícita de exclusão** — ou seja, **toda
coluna nova de `materiais_almoxarifado` vaza quantidade exata para o requisitante até ser nomeada
ali**. `quantidade_em_terceiros` entrou na lista em `0a01124`. **O padrão continua: o default é
expor.** Qualquer coluna criada pela Etapa 8c precisa repetir esta checagem.

### Tipos de movimento da Etapa 8b (`e0be211`)

Quatro tipos novos, em dois pares com semântica oposta:

| Tipo | Efeito | Molde |
|---|---|---|
| `REMESSA_TERCEIRO` | `quantidade_em_terceiros` **sobe**; `quantidade_atual` **não muda** | `QUARENTENA` |
| `RETORNO_TERCEIRO` | `quantidade_em_terceiros` **desce**; `quantidade_atual` **não muda** | `DESBLOQUEIO` |
| `PERDA_TERCEIRO` | baixa **físico e retenção** no mesmo UPDATE | `DECISAO_INSPECAO` |
| `CONSUMO_TERCEIRO` | idem, para material que virou cavaco/refugo no processo | `DECISAO_INSPECAO` |

Os quatro estão em `TIPOS_ISENTOS_DONO` (`ownerRules.js`) — remessa de material de cliente é isenta
da regra de OS/projeto, no mesmo espírito da `TRANSFERENCIA`, com a contrapartida de que o documento
**nomeia o proprietário**. A isenção é **duplamente coberta** (os quatro também estão fora de
`TIPOS_SAIDA_COM_DONO`), o que significa que apagar uma das listas não quebra teste nenhum — por
isso o teste empurra os quatro para `TIPOS_SAIDA_COM_DONO` **em memória** e prova que a isenção
segura mesmo assim. **A Etapa 8c tem de repetir isso para todo tipo novo que criar.**

**`REMESSA_TERCEIRO`/`RETORNO_TERCEIRO` NÃO são estornáveis pelo livro**, e isso precisou de guarda
explícita em `cancelarMovimentacao`: sem ela, o estorno gravaria a linha de `ESTORNO`, marcaria a
original `cancelado = 1` e **não tocaria** em `quantidade_em_terceiros` — o livro afirmando uma
reversão que não aconteceu, com a retenção presa. Recusado com a mensagem-molde dos tipos de
quarentena, apontando para a tela de Remessas. **Contraste deliberado:**
`PERDA_TERCEIRO`/`CONSUMO_TERCEIRO` **continuam** estornáveis, e o estorno devolve ao **disponível**
(a remessa já está encerrada; recriar a retenção deixaria saldo preso sem remessa viva por trás).

## Checklist

### Backend
- [x] (00.3) Unificar v1→v2 — pré-requisito atendido na Etapa 0 (v1 delega para o serviço v2); nesta etapa o **front** também passou a consumir `/movimentacoes/v2` diretamente (form v2, Task 8)
- [x] Regra crítica de saída (spec 13.3): exigir usuário, motivo, documento/requisição de origem, quantidade, localização e projeto/OS/centro de custo **conforme o tipo** de movimento (tabela de obrigatoriedade por tipo) — `avaliarRegrasVinculo`/`REGRAS_VINCULO`, `movimentoRegras.api.test.js`
- [x] Saída emergencial: permitida com flag + justificativa obrigatória + pendência de regularização (`regularizacao_pendente`, badge "PENDENTE REGULARIZAÇÃO" no livro, `PUT /movimentacoes/:id/regularizar`)
- [x] Validar saída de material bloqueado / em quarentena (já coberto pelo motor, testes em `almoxarifado.test.js`/regressão)
- [x] Validar saída de lote vencido / reprovado — entregue na Etapa 6, Task 3 (`65d78fd`+): `registrarMovimentacao` recusa lote `BLOQUEADO`/`REPROVADO` (todo `tiposSaida`, inclusive descarte) e lote vencido (isento para `SUCATA`/`PERDA`/`AJUSTE_NEGATIVO` — descarte não pode ficar bloqueado pela própria validade).

  > ⚠️ **Correção de uma afirmação que esta spec fez e que envelheceu no mesmo dia (2026-08-09).**
  > Aqui estava escrito que *"o mecanismo de liberar um lote vencido para uso mesmo assim (com
  > justificativa) não existe ainda"*. **Existe desde `556f86d`** (Etapa 6, Task 3b — que nasceu
  > justamente do achado de review que produziu aquela frase): `lotService.liberarVencimento`,
  > `lotService.vencimentoLiberado`, as colunas `vencimento_liberado_em/_por/_motivo` e a rota
  > `PUT /api/almoxarifado/lotes/:id/liberar-vencimento` (perm. `inspecionar`, justificativa
  > obrigatória, auditada). A guarda em `stockService.registrarMovimentacao` (bloco que checa
  > `lotService.isVencido`/`vencimentoLiberado` no ramo de saída, dentro de `stockService.js` — sem
  > número de linha de propósito: esta nota já citou `:451`, que hoje é o destructuring de `params`,
  > não a guarda) respeita a liberação.
  > **A liberação NÃO "desvence" o lote:** `isVencido` continua derivado de `data_validade` e
  > continua `true`; o que muda é a decisão da guarda. E a ordem é status-antes-de-vencimento, de
  > propósito — lote bloqueado com vencimento liberado falha por bloqueio, com a mensagem certa.
  > O que **de fato** não existe é uma **tela** para chamar essa rota: a mensagem de erro do motor
  > cita o endpoint HTTP para um operador que só tem navegador. Registrado como pendência (a) em
  > [10-lotes-series-etiquetas](../10-lotes-series-etiquetas/README.md).
- [ ] (futuro) avaliar reversão de custo médio quando o estorno for da última entrada com custo
- [x] `permite_saldo_negativo` respeitado (default: bloquear; guarda atômica em `registrarMovimentacao` e em `cancelarMovimentacao`)
- [x] Centro de custo como vínculo (`centros_custo_almoxarifado`, `CentroCustoSchema`, rota `/centros-custo`)
- [x] Atualização de custo médio na entrada (`custo_medio` calculado atomicamente na mesma UPDATE da entrada; teste dedicado)
- [x] Consulta "livro de movimentações" com filtros (material, período, projeto, OS, centro de custo, usuário, tipo, pendentes de regularização) em `GET /movimentacoes`
- [x] Histórico completo do item (spec 27): `GET /materiais/:id/extrato` agrega material (com disponível), saldos por localização, movimentações e reservas ativas — inspeções ainda não entram no agregado (feature 09 é embrião)

### Frontend
- [x] `MovimentacoesAlmoxarifado.js` na v2: lote, localização origem/destino, vínculo projeto/OS/centro de custo (selects estruturados no lugar do campo texto `referencia`)
- [x] Tela/ação de estorno com motivo — botão "Estornar" por linha do livro (mini-modal, motivo obrigatório); linha cancelada fica com opacidade reduzida + badge "ESTORNADA"; linha tipo ESTORNO com badge própria
- [x] Extrato do item (histórico completo) — `ExtratoMaterialModal.js`, acionado pelo nome do material no livro e por um botão "Extrato" em `MateriaisAlmoxarifado.js`
- [ ] Migrar entrada/saída rápida de `MateriaisAlmoxarifado.js` para a v2 (hoje ainda posta em `/movimentacoes` v1; sem lote/localização/centro de custo/vínculo nesse atalho)

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Saída sem saldo disponível falha e não altera nada | `saida sem saldo disponivel retorna 400 e saldo intacto` |
| Reservado/bloqueado/inspeção reduzem o disponível | `disponivel = fisico - bloqueado - inspecao - reservado` |
| Movimentação confirmada não pode ser excluída — só estornada | `DELETE de movimentacao inexiste; estorno cria movimento inverso vinculado` |
| Estorno exige motivo | `estorno sem motivo falha` |
| Movimentações vinculadas a requisição não são estornáveis pelo cancelamento avulso (usar exclusão/encerramento da requisição) | `estorno de SAIDA vinculada a requisição é bloqueado (use os fluxos da requisição)` |
| Saída exige requisito mínimo por tipo (regra crítica) | `saida sem projeto/OS quando obrigatorio falha` |
| Saldo anterior/posterior corretos e sequenciais | `livro registra saldo_anterior e saldo_posterior consistentes` |
| Duas movimentações concorrentes não corrompem saldo | `movimentacoes concorrentes mantem saldo correto` (usar padrão de `sqliteConcurrency.test.js`) |
| Movimentação grava auditoria | `movimentacao v2 grava auditoria_log_almoxarifado` |

## Dependências

- **00-fundacao-tecnica** (harness + unificação v1/v2) — obrigatória antes de tudo aqui.
- Validações de vencido/reprovado vieram com a feature 10 (lotes), Etapa 6 Task 3 — entregues.

## Entregue na Etapa 1 (2026-08-04)

Plano completo em [docs/superpowers/plans/2026-08-04-almoxarifado-etapa1-motor-estoque.md](../../../docs/superpowers/plans/2026-08-04-almoxarifado-etapa1-motor-estoque.md), 9 tasks TDD. Principais arquivos:

- Backend: `server/services/almoxarifado/stockService.js` (regra crítica/emergencial, saldo negativo atômico, custo médio, estorno incl. por localização/transferência), `server/services/almoxarifado/schemas.js` (`MovimentacaoSchema`, `RegularizacaoSchema`, `CancelamentoSchema`, `CentroCustoSchema`), `server/routes/almoxarifado/extended.js` (`/centros-custo`, `/movimentacoes/v2`, `/movimentacoes/:id/regularizar`, `/movimentacoes/:id/cancelar`, `/materiais/:id/extrato`, `/aux/ordens-servico`).
- Frontend: `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js` (form v2, filtro por tipo incl. ESTORNO, coluna Vínculo, badge "PENDENTE REGULARIZAÇÃO", ação Estornar, badge "ESTORNADA", link para o extrato), `client/src/components/almoxarifado/ExtratoMaterialModal.js` (novo), `client/src/components/almoxarifado/MateriaisAlmoxarifado.js` (botão Extrato).
- Testes: `server/tests/api/estorno.api.test.js`, `movimentoRegras.api.test.js`, `livroExtrato.api.test.js`, `ajusteLocalizacao.api.test.js`, além de `movimentacoes.api.test.js` e `almoxarifado.test.js` (regressão). Todos verdes em `npm run test:api`, `test:almoxarifado`, `test:validation`, `test:safealter`.
- Não entregue nesta etapa (fica para a feature 10): validação de saída de lote vencido/reprovado — depende de lote deixar de ser texto livre.

## Follow-ups abertos no motor (achados no review final da Etapa 5, 2026-08-08)

Nenhum é bug de saldo — os dois foram avaliados e liberados para merge —, mas ficam registrados
porque somem da memória e não do código.

- **~~O mapa de localizações mostra reservado sempre 0.~~ RESOLVIDO no review final do branch da
  Etapa 6 (2026-08-10): o mostrador foi REMOVIDO.** `MAPA_LOCALIZACOES_SQL` (`stockService.js`)
  somava `estoque_saldo_almoxarifado.quantidade_reservada`, e **nada no sistema escrevia colunas de
  retenção nessa tabela** — só `quantidade`. A Etapa 6 (Task 2) apagou a coluna e o SQL passou a
  devolver um `0 as reservado` fixo, o que era pior: um campo que só podia dizer zero, alimentando
  a linha "Reservado" em `MapaLocalizacoesAlmoxarifado.js`. A decisão que faltava foi tomada: a
  retenção **não** passa a ser por localização (ela vive em `materiais_almoxarifado`, por material,
  ou no lote inteiro por status — ver a decisão registrada na feature 10), então o campo saiu do
  SQL e a linha saiu da tela. Era o terceiro mostrador zerado do mesmo lote; os dois irmãos
  ("Reservada"/"Bloqueada" na tabela por localização do Extrato) já tinham saído no fix round 1 da
  Task 9.
  Foi o mesmo equívoco de premissa que gerou o Critical de `syncMaterialTotals` (abaixo): supor
  que aquelas colunas são alimentadas.
  *(Ajuste do round 4 da Task 3, 2026-08-09, no mesmo SQL mas em outro ponto: o fallback "material
  sem endereçamento" — que mostra `quantidade_atual` na localização padrão enquanto o saldo não
  estiver quebrado por endereço — passou a ignorar linhas com `localizacao_id IS NULL` ao decidir
  se o material "já tem endereço". A linha sem endereço é justamente saldo **sem** endereço; contá-la
  fazia o material sumir do mapa e ainda ser contado como item crítico. Mesma qualificação que o
  relatório `materiais-sem-endereco` já usava.)*
- **Pendência nomeada, decisão do CLIENTE pendente — "a primeira contagem redefine o saldo" não vale
  depois que existe a linha residual sem endereço.** A regra que o cliente decidiu (2026-08-09) é:
  material com saldo e nenhum endereço registrado, ao receber a primeira contagem numa localização,
  tem o saldo **redefinido** por ela. Isso vale para o material legado de verdade (zero linhas de
  saldo — medido: `qa=100`, zero linhas, AJUSTE de 40 numa localização ⇒ **40**). **Não vale** depois
  que qualquer caminho do motor já criou a linha "sem localização": um AJUSTE global de 100 (que
  grava o residual em `(NULL, NULL)`) seguido de uma contagem de 40 numa localização dá **140**, não
  40 — a soma inclui os 100 que continuam sem endereço. Medido no round 5 do review da Task 3
  (Etapa 6); é comportamento herdado do round 3, não de um diff específico, e o cenário de teste
  herdado que passaria por perto mascara o caso porque conta 0. **Não foi corrigido de propósito:**
  qual dos dois é o certo é pergunta de negócio, não técnica ("100 sem endereço + 40 na prateleira A"
  é um material com 140 espalhado, ou um material com 40 que acabou de ser inventariado?), e a Task 3
  já foi refeita uma vez por responder isso sozinha. Levar ao cliente antes de mexer.
- **Pendência nomeada — a conclusão de inventário escreve `quantidade_atual` por fora do motor.**
  `PUT /api/almoxarifado/conferencias/:id/concluir` com `aplicar_ajustes` faz
  `UPDATE materiais_almoxarifado SET quantidade_atual = ?` direto (handler dessa rota em
  `server/routes/almoxarifado.js`; há um comentário no próprio arquivo dizendo que é "o caminho
  mais destrutivo do arquivo") e insere a linha `AJUSTE` no livro à mão.

  > **Sem número de linha, de propósito.** Esta spec já citou "~linha 868" e depois "894/917"; o
  > `UPDATE` andou de novo no review final. Número de linha em spec envelhece entre dois commits —
  > procure pela rota e pelo `UPDATE materiais_almoxarifado SET quantidade_atual`. **Nunca toca em `estoque_saldo_almoxarifado`.** Com a
  reconciliação por soma, a consequência é concreta: num material que já tem linhas de saldo, a
  homologação do inventário muda o total e deixa as linhas com o valor antigo; a próxima contagem
  por localização (ou o estorno de um AJUSTE) chama `syncMaterialTotals`, que reconcilia a partir
  dessas linhas desatualizadas — o número homologado no inventário evapora. **Não é regressão da
  Etapa 6:** esse `UPDATE` cru é anterior a ela, e a evaporação já existia (o motor sempre teve
  ramos que somam as linhas). Consertar = rotear a rota pelo `stockService.registrarMovimentacao`
  (AJUSTE por material, com localização quando o item da conferência tiver), o que muda o
  comportamento de uma rota com permissão própria e precisa de teste de API próprio — **task
  separada**, não foi feita na Task 3 da Etapa 6 de propósito. Enquanto não for feita, esta é a
  única exceção conhecida à invariante "quem mexe no total mexe na linha".
- **`TIPOS_MOVIMENTO_ROTA` falha aberto.** A whitelist da rota `/movimentacoes/v2` é derivada por
  subtração (`TIPOS_MOVIMENTO` − `ESTORNO` − `TIPOS_RETENCAO`). Um tipo novo acrescentado a
  `TIPOS_MOVIMENTO` entra na rota **automaticamente**: o default é certo para tipo operacional e
  errado para tipo de retenção. Hoje a proteção é um comentário. O endurecimento barato é um teste
  que quebre quando a whitelist contiver um tipo que ninguém classificou explicitamente.

## Pendências declaradas no review final do branch da Etapa 6 (2026-08-10)

Nenhuma foi corrigida nesta rodada — cada uma está aqui com arquivo e com o que acontece, para não
ser redescoberta por acidente.

- **A compensação da reserva é assimétrica — a Global Constraint 2 ainda viva no motor.**
  Em `stockService.registrarMovimentacao`, quando o claim do lote falha numa saída que consome
  reserva, a compensação devolve `quantidade_reservada + quantidade` **cheio**, enquanto o forward
  debitou com `MAX(0, COALESCE(quantidade_reservada,0) - quantidade)`. Se o estado já estivesse
  inconsistente (reservada menor do que a quantidade sendo consumida), o forward satura em 0 e a
  compensação devolve o valor inteiro — inflando o hold. **Não é alcançável a partir de estado
  consistente**, e a compensação pré-existente (`criarReserva`, `liberarReserva`) tem a mesma
  assimetria pelo mesmo motivo. O ponto de fundo é que aquele `MAX(0, …)` viola a Global Constraint
  2 do plano da Etapa 6 ("nunca `MAX(0, …)`"); trocá-lo por guarda no `WHERE` muda o comportamento
  do consumo de reserva e precisa de teste próprio — **task separada**.
- **Estorno de saída que drenou mais de uma localização volta consolidado.** Com o claim agregado
  (`claimSaldoDoLote`), uma saída pode debitar linhas de duas ou mais localizações do mesmo lote. O
  estorno devolve tudo na linha da chave `(localização de origem do movimento, lote)`. O **total**
  volta exato — `quantidade_atual` e a soma das linhas continuam batendo —, mas o endereçamento
  pode consolidar numa localização só. Corrigir exigiria o ledger guardar de quais linhas o claim
  tirou (hoje a movimentação guarda uma localização de origem, não uma distribuição).
- **`alertService` seleciona uma coluna `localizacao` que não existe.** Duas consultas em
  `server/services/almoxarifado/alertService.js` pedem `localizacao` de `materiais_almoxarifado`
  (a coluna é `localizacao_padrao_id`). O erro é engolido pelo `try/catch` que envolve a
  verificação de alertas, e o efeito visível é o ruído `[almoxarifado-alertas] ... no such column:
  localizacao` em toda saída de teste — mais o alerta que não sai. **Pré-existente**, anterior à
  Etapa 6 e fora do escopo dela.
- **"Estorno de ENTRADA não negativa a linha do lote" só vale quando a chave do estorno casa com a
  linha que a entrada escreveu — não é propriedade total.** O piso (`opcoes.minimo` em
  `ajustarSaldoExistente`, ver acima) só entra em jogo quando `UPDATE ... WHERE material_id = ? AND
  localizacao_id IS ? AND lote_id IS ?` acha a linha. Quando não acha (a resolução de localização do
  estorno usa `localizacao_padrao_id` **de hoje**; o forward gravou usando o padrão **da época** —
  o mesmo gatilho do miss já documentado para `reconciliarEstornoSemLinha`), o estorno cai no
  caminho de reconciliação: `syncSaldoLocalizacaoPadrao` **cria** a linha na chave nova e grava nela
  `quantidade_atual − soma das outras linhas`, sem piso e sem checar `permite_saldo_negativo`. Pode
  sair negativa num material que não permite negativo. Reproduzido: ENTRADA de 10 com lote e sem
  destino (linha `(NULL, lote) = 10`) → material ganha `localizacao_padrao_id` depois → estorno cria
  `(locX, lote) = −10`. **Byte-idêntico ao commit anterior à rodada de correção do review final
  (`c2b3da9`) — não é regressão desta etapa nem desta rodada de minors.** A correção natural é o
  piso entrar também dentro de `syncSaldoLocalizacaoPadrao` quando ela está sendo chamada a partir
  do estorno de uma ENTRADA com lote que não permite negativo — mas isso muda comportamento de
  produção (ficaria fora do escopo "documentação apenas" desta rodada) e precisa de teste de API
  próprio. **Task separada.**

## Pendência declarada na Etapa 7 (2026-08-12) — `AJUSTE` não reconcilia `quantidade_bloqueada`

**Achada ao testar a compensação da devolução, com sonda executada. Não foi corrigida** — é outro
assunto (mexe no `stockService`) e a decisão é **de negócio**, não técnica.

**O que acontece:** um `BLOQUEIO` de 8 seguido de um `AJUSTE` que leva `quantidade_atual` para 1
deixa o material com `quantidade_bloqueada (8) > quantidade_atual (1)`. Pela fórmula da spec 7, o
**disponível fica negativo** — e **não há guarda nenhuma** contra isso: o `AJUSTE` redefine o total
físico e não olha para as colunas de retenção.

**Por que é plausível na vida real, e não um caso de laboratório:** é exatamente o inventário. A
contagem acha menos do que o sistema dizia, e parte do que existia estava em quarentena ou
bloqueado por defeito. O operador lança o ajuste para o número contado; ninguém pensa em mexer no
bloqueado, que continua com o número antigo.

**A pergunta de negócio que precisa ser respondida antes de qualquer código** — as três respostas
são defensáveis e levam a implementações diferentes:

1. o `AJUSTE` **baixa** o bloqueado proporcionalmente (o material sumiu; o que estava retido sumiu
   junto);
2. o `AJUSTE` é **recusado** enquanto houver retenção maior que o total pretendido (força o operador
   a resolver a quarentena antes de inventariar);
3. o `AJUSTE` passa e apenas **avisa**, deixando a reconciliação para uma tela de saneamento.

Enquanto a decisão não vier, nada foi mudado — o comportamento atual é o (3) **sem o aviso**, que é
a pior das três. Registrado aqui e no guia de usuário para não ser redescoberto por acidente.

### Terceira instância da mesma pendência — Etapa 8b (2026-08-12): `quantidade_em_terceiros`

**A mesma decisão de negócio agora tem TRÊS caminhos, e é o mesmo defeito nos três: o que redefine
o total físico não olha para as colunas de retenção.**

1. **`AJUSTE` × `quantidade_bloqueada`** (Etapa 7, seção acima).
2. **`PUT /conferencias/:id/concluir` com `aplicar_ajustes`** (nomeada desde antes da Etapa 6, e
   agravada na Etapa 8): grava `UPDATE materiais_almoxarifado SET quantidade_atual = ?` **direto**,
   fora do motor — sem validação de saldo, sem a permissão `ajustar_material_cliente`, e sem olhar
   para nenhuma retenção.
3. **`AJUSTE` × `quantidade_em_terceiros`** (Etapa 8b, novo): 30 unidades no galvanizador e um
   ajuste levando o total para 10 deixam `em terceiros (30) > total (10)` — **disponível negativo,
   sem guarda**.

**O caminho 3 é mais provável através do caminho 2 do que através de um Ajuste manual:** homologar
a divergência de um material que tem saldo em terceiros **baixa o físico e deixa a retenção órfã**.

> **A Etapa 8b reduziu a probabilidade sem tocar na causa, e isso é deliberado.** A conferência
> agora monta o esperado **já descontando** `quantidade_em_terceiros`, então o inventário de um
> material com remessa aberta **não acusa mais divergência fantasma** — some o impulso de "corrigir"
> o saldo, que era o gatilho realista. E o **encerramento de remessa** é o caminho controlado para
> zerar a retenção. A 8b **não resolve e não piora**: a decisão (baixar a retenção / recusar /
> avisar) continua sendo **do cliente**, é a mesma para as três instâncias, e está no bloco
> "Leia antes de apresentar" de `docs/almoxarifado-novidades-por-etapa.md`.

### Correção da Etapa 5 que pertence a este motor

`syncMaterialTotals` recalculava `quantidade_reservada`, `quantidade_bloqueada` e
`quantidade_em_inspecao` somando `estoque_saldo_almoxarifado` — colunas que nunca são escritas ali.
A soma dava sempre 0, então a função **zerava as três** toda vez que rodava (`AJUSTE` com
localização e o estorno desse ajuste). Efeito: um ajuste por localização evaporava a quarentena e
deixava o item de recebimento indecidível para sempre, e fazia o mesmo com reservas.
Corrigido em `c4c342b` — a função passou a recalcular **somente** `quantidade_atual`, que é o único
total que aquela tabela realmente lastreia. Cobertura: `ajusteLocalizacao.api.test.js`
(`AJUSTE por localizacao nao evapora a quarentena do material` e o equivalente para reserva).
Nota de linhagem: o defeito atingia `quantidade_reservada` desde a Etapa 4, mas **nunca alcançou
produção** — em `main` a função não tem chamador; quem a chama chegou nesta branch. Não há dado
a reparar.
