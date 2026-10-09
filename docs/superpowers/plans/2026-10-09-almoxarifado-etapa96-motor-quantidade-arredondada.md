# Etapa 96 — o motor grava a quantidade arredondada e não recusa o que existe por ponto flutuante (C176, feature 03 com a 05 e a 07)

> Status: **PLANO (Fase 1) — 2026-10-09.** Nenhuma task executada. Próximo passo: **Fase 2** (revisão do plano por um
> agente fresco) — ver "Próximo passo" no fim.
> HEAD de partida: `30b7793a` (main, árvore limpa, sem push).
> Origem: "Próxima tarefa detalhada — Etapa 96" no fim de
> `docs/superpowers/plans/2026-10-09-almoxarifado-etapa95-separacao-limitada-ao-fisico.md`; o item **C176** da letra C de
> `docs/almoxarifado-novidades-por-etapa.md`. **A Fase 0 mediu que o defeito é mais largo do que a próxima tarefa da 95
> dizia e que a razão dada para a recomendação estava errada** (ver "O que contradiz a próxima tarefa escrita na 95").
>
> **Numeração:** etapa única para todos os módulos (esta é a **96**). Letras do documento do almoxarifado, conferidas em
> 2026-10-09 (`grep` no documento): última **B479**, último C **176**, última **A46**. Esta etapa reserva **B480–B488**,
> **C177–C181** e **A47**.

**Escopo desta etapa (o que a Fase 0 reproduziu — e só isso):**
1. **Um helper único de quantidade** (`server/services/almoxarifado/quantidade.js`): arredonda a 1e-6 ao **gravar** e
   compara com folga de 1e-9 ao **recusar**. Aplicado no motor e nos serviços que escrevem as mesmas colunas — não
   espalhado à mão.
2. **Gravação:** toda escrita incremental de quantidade de estoque (`col = col ± ?`) grava `ROUND(…, 6)`; o
   `quantidade_atual` sincronizado da soma das linhas também; o par `saldo_anterior`/`saldo_posterior` do livro também.
3. **Recusa:** as guardas de saldo (17 claims SQL + 7 comparações em JS) comparam com a folga — o pedido que cabe passa,
   inclusive quando o disponível é uma **diferença** de colunas limpas (0,3 − 0,1).
4. **A porta:** a quantidade pedida é arredondada a 1e-6 ao entrar no motor (o livro e o saldo dizem o mesmo número).
5. **A requisição:** as colunas do item (`quantidade_separada`, `quantidade_entregue`) gravam arredondado e a entrega
   compara com a folga — separar em rodadas fracionadas não prende mais a entrega.
6. **A47 + script opcional** para o legado já gravado torto (consulta; o script lista por padrão e só grava com
   `--aplicar`). Nada roda sozinho no boot.

**Fora (declarado, ver "O que fica de fora"):** a saída avulsa que leva a caixa sem reserva (**Etapa 97**); a tela
(`step="1"` nos modais; formatador no cliente); os 19 remendos de leitura (ficam); reescrever o livro histórico;
precisão por unidade de medida.

---

## Fase 0 — medido (2026-10-09)

Sondas no scratchpad da sessão (harness `e95-h.js` — `testApp` com `requirePermission` real e **usuário por
requisição** pelo header `x-u`, molde 92–95; saídas `*.out` ao lado de cada sonda). **S** sem perfil (PRODUÇÃO) cria por
`POST /api/requisicoes-material`; **ADMIN** superadmin aprova e movimenta por `POST /api/almoxarifado/movimentacoes/v2`;
**ALMOX** (`ALMOXARIFE`) separa e entrega. Material `PC`, custo 0,1, alçada desligada. Todas rodadas no HEAD
`30b7793a` (o código é o do `42e08faf`; os commits depois dele são só documentação).

**Detector:** cada cenário escreve à mão o resultado certo (o gesto passa ou a coluna vale o número decimal) e compara.
**Controle do detector:** cada porta da sonda 6 roda primeiro com **uma** entrada de 1 (controle) e depois com
0,7 + 0,2 + 0,1 (torto); o controle tem de dar CERTO — duas portas deram ERRADO no controle e foram **descartadas da
contagem** (abaixo).

### Sonda 1 e 1b — o motor e a entrega (`e96f0-s1-arredonda.js`, `e96f0-s1b-inteiro.js`, re-executadas)

Reproduzem **igual** à medição do fechamento da 95: s1 **5/6 ERRADO** (0,3 − 0,1 grava `0.19999999999999998`; `SAIDA`,
`AJUSTE_NEGATIVO` e `PERDA` de 0,2 → 400 *"Saldo insuficiente. Disponível: 0.19999999999999998 PC"*; a requisição de 0,2:
aprovar → `APROVADO` com reservas `[]`, separar 0,2 → 200, entregar 0,2 → 400 *"⟨material⟩: não é possível entregar 0.2
PC. Máximo: 0.19999999999999998 (pendente: 0.2, disponível: 0.19999999999999998)"*, fica `EM_SEPARACAO`; 0,7 − 0,6 e dez
entradas de 0,1 idem). s1b **3/3 ERRADO** (0,7 + 0,2 + 0,1 → `0.9999999999999999`; `SAIDA` 1 → 400; requisição de 1
aprovada sem reserva; separar 1 → 200; entregar 1 → 400; a fila fica `{"etapas":["ENTREGAR"],"separavel":0,
"entregavel":0.9999999999999999}`).

### Sonda 6 — as outras portas do motor e as tabelas de linha (`e96-sonda-6-vizinhos.js`) — **6/13 ERRADO** (+4 linhas descartadas)

| porta (pedido 1) | controle (físico 1) | torto (0,7+0,2+0,1) |
|---|---|---|
| `SAIDA` com `localizacao_origem_id` (linha do endereço `0.9999999999999999`) | 201 | **400** *"Saldo insuficiente. Disponível: 0.9999999999999999 PC"* |
| `TRANSFERENCIA` de A para B | 201 | **400** *"Saldo insuficiente na localização de origem"* |
| `SAIDA` do lote L1 (linha do lote `0.9999999999999999`) | 201 | **400** *"Saldo insuficiente. Disponível: 0.9999999999999999 PC"* |
| `POST /materiais/:id/bloquear` | 200 | 200 (aceita **1** com físico `0.9999…` — o disponível fica −1,1e-16; ver C180) |
| `POST /reservas` (reserva manual) | 201 | **400** *"Saldo disponível insuficiente: 0.9999999999999999"* |
| remessa a terceiro (criar + enviar) | 200 | **400** *"Nao foi possivel enviar a remessa REM-…: ⟨cod⟩: disponivel 0.9999999999999999 PC, a remessa pede 1"* |
| `POST /materiais/:id/desbloquear` 1 depois de bloquear 0,7 + 0,2 + 0,1 (físico 1) | — | **400** *"Quantidade bloqueada insuficiente: 0.9999999999999999"* |
| ~~`SUCATA` 1~~, ~~`DEVOLUCAO_FORNECEDOR` 1~~ | **400 no controle** (a rota `/movimentacoes/v2` não aceita esses tipos — vão pelo processo de sucateamento e pela NC) | descartadas: o controle provou que a linha não testava nada |

**As tabelas de linha derivam igual** (ponto de atenção 1 da 95): a linha do endereço e a do lote gravam
`0.9999999999999999`. E o **reservado** também: três reservas de 0,7, 0,2 e 0,1 com físico 1 deixam `quantidade_reservada
= 0.9999999999999999` e um **livre fantasma** de 1,1e-16 — a `SAIDA` de `1e-16` passa (**201**).

### Sonda 9 — colunas LIMPAS e o disponível torto (`e96-sonda-9-diferenca.js`) — **2/2 ERRADO**

**O achado que muda a recomendação da 95.** Físico **0,3** e reservado **0,1**, as duas colunas exatas (gravadas por uma
entrada e uma reserva só): `SAIDA` 0,2 → **400** *"Saldo insuficiente. Disponível: 0.19999999999999998 PC"*. Físico 0,3 e
bloqueado 0,1: `POST /reservas` 0,2 → **400** *"Saldo disponível insuficiente: 0.19999999999999998"*. O disponível é uma
**diferença** (`disponivelSql` = físico − retenções), e a diferença de dois números limpos já sai torta. **Arredondar só a
gravação não conserta nem dado novo.**

Na mesma sonda: `ROUND(x, 6)` do SQLite (3.44.2) contra `Math.round(x * 1e6) / 1e6` do JS — **0/20 002** diferentes em
valores aleatórios e **0/20 000** em `ROUND(a + b, 6)` de parcelas já arredondadas. O helper pode arredondar dos dois
lados sem discordar do banco (para positivos; ver B482 sobre o sinal).

### Sonda 10 — o item da requisição (`e96-sonda-10-item.js`) — **1/3 ERRADO**, com estoque limpo

- **A (ERRADO):** físico **1** exato, requisição de 1 aprovada (reserva 1), separar em três rodadas 0,7 + 0,2 + 0,1 →
  `quantidade_separada = 0.9999999999999999`; entregar 1 → **400** *"… Máximo: 0.9999999999999999 (pendente: 1,
  disponível: 1)"* — **gesto preso sem estoque torto nenhum.** A coluna do item é escrita por soma em JS
  (`requisitionService.js:1018`) e não estava em nenhuma lista da 95.
- **B (CERTO, mas com resíduo):** separar 1 e entregar 0,7 + 0,2 + 0,1 → `ENTREGUE`, reservado 0; mas o físico fica
  **`2.7755575615628914e-17`** (não 0) e `quantidade_entregue = 0.9999999999999999` — um material "com saldo" que não
  existe.

### Sonda 7 — a ressalva do `6e0fae83` (`e96-sonda-7-aprovacao.js`, HEAD e worktree temporária em `6e0fae83^`, removida)

| caso | antes do `6e0fae83` | depois (HEAD) |
|---|---|---|
| C controle: físico 1, pede 1 | `TOTALMENTE_RESERVADA` [1] → entrega 200 | igual |
| T1 físico 0,7+0,2+0,1, pede 1 | `PARCIALMENTE_RESERVADA` [`0.9999999999999999`] → separar 200 → **entregar 400**, `EM_SEPARACAO` | **`APROVADO` sem reserva** → separar 200 → **entregar 400**, `EM_SEPARACAO` |
| T2 físico 0,3−0,1, pede 0,2 | `PARCIALMENTE_RESERVADA` [`0.19999999999999998`] → entregar 400 | `APROVADO` sem reserva → entregar 400 |
| T3 físico 0,1+0,2 (acima), pede 0,3 | `TOTALMENTE_RESERVADA` [0,3] → 200 | igual |
| T4 o caso que o commit corrigiu: físico 0,3, caixa 0,1 de outra, pede 0,2 | `PARCIALMENTE_RESERVADA` [`0.1999…`] → 200 | `TOTALMENTE_RESERVADA` [0,2] → 200 |

**Placar igual nos dois (2/5 ERRADO).** O `6e0fae83` **piorou a garantia** no estoque já torto (de "reserva quase tudo"
para "não reserva nada": entre aprovar e separar, outra requisição ou uma saída avulsa pode levar o físico), **não o
gesto** — a entrega já ficava presa antes. Corrigiu o caso dele (T4). A folga no claim de `criarReserva` (T1 desta
etapa) fecha T1 e T2 nos dois sentidos: a aprovação pede 1 (ou 0,2) arredondado e o claim aceita.

### Sonda 8 — a tela, o inventário e a normalização simulada (`e96-sonda-8-tela-inventario.js`) — **1/3 ERRADO**

- **A tela recebe o número cru:** `GET /materiais/:id` e `GET /materiais` → `quantidade_atual: 0.9999999999999999`; o
  detalhe da requisição → `saldo_atual: 0.9999999999999999`, `quantidade_entregavel: 0.9999999999999999`; a fila idem.
  Os 7 lugares do cliente que exibem `quantidade_atual` cru (listados na 95: `MateriaisAlmoxarifado.js:325` e `:427`,
  `MovimentacoesAlmoxarifado.js:857`, `RequisicaoForm.js:453`, `AlmoxarifadoDashboard.js:462`,
  `ExtratoMaterialModal.js:135`, `ConfiguracoesAlmoxarifado.js:641` — conferidos agora, todos `{m.quantidade_atual}`
  sem formatação) mostram `0.9999999999999999`. A fila (`FilaSeparacao.js:47`, `fmtQtd` com 3 casas) mostra "1" — e o
  modal de entrega pré-preenche `maxQtdEntrega` = `quantidade_entregavel` cru (`RequisicoesList.js:60-62`, `:488`, `:510`)
  num `<input step="1" max="0.9999999999999999">`.
- **O inventário tolera (CERTO):** conferência aberta sobre o torto (`quantidade_sistema` `0.9999…`), contar 1 → a
  divergência gravada é `1.1102230246251565e-16`; normalizar o legado **entre** a contagem e a conclusão e concluir com
  `aplicar_ajustes` → **nenhuma** movimentação nova (ponto de atenção 3 da 95: medido, sem ajuste fantasma).
- **A normalização destrava o legado (CERTO):** `UPDATE … SET quantidade_atual = ROUND(quantidade_atual, 6)` (e as linhas)
  → `SAIDA` 1 → 201.
- **O livro também grava torto:** `saldo_posterior` das três entradas = 0,7 / `0.8999999999999999` /
  `0.9999999999999999` — o extrato mostra isso.
- **Quantidade com mais de 6 casas entra:** `ENTRADA` 0,0000004 → 201, físico `4e-7`. Com gravação arredondada e porta
  crua, o livro diria +0,0000004 e o saldo não mudaria — por isso a porta arredonda (B482).

### Sonda 5 — a consulta do rastro (`e96f0-s5-consulta.js`, re-executada) — 1/1 CERTO

`WHERE col <> ROUND(col, 6)` acha `0.9999999999999999` e `0.30000000000000004` e não acha 1,5. A forma `ABS(x −
ROUND(x,6)) > 1e-12` devolveu `[]` na 95 (a deriva é ~1e-16) — a A47 compara com `<>`.

### A lista dos 17/37 conferida contra o código (HEAD `30b7793a`)

- **Claims SQL `>= ?` sem folga: 17 — confere**, exatamente as linhas da 95: `stockService.js` `:309`, `:372`, `:1432`,
  `:1451`, `:1476`, `:1504`, `:1519`, `:1533`, `:1689`, `:1725` (duas comparações), `:1778`, `:2551`, `:2749`, `:2988`;
  `inspectionService.js:291`; `thirdPartyService.js:454` e `:903`.
- **Recusas em JS que a 95 não listou: 5** (mais as 2 da entrega que listou) — `stockService.js:1389` (a pré-checagem
  *"Saldo insuficiente. Disponível: ⟨d⟩"* — **é ela** que responde na sonda 1, antes do claim `:1778`), `:1398` (*"Material
  bloqueado não pode ser utilizado"*), `thirdPartyService.js:235` (pré-checagem do envio — a mensagem da sonda 6) e
  `:384` (retorno acima do enviado), `scrapDisposalService.js:243` (sucatear acima do disponível). E a entrega
  `requisitionService.js:1370` e `:1405`. **Total: 24 pontos de recusa.**
- **Escritas: as 37 conferem** para o padrão da 95 (colunas do **material**), mas **a superfície é maior**: o padrão
  largo `quantidade\w* = (COALESCE(…)) quantidade\w* ± ?` acha **63** linhas em `services/almoxarifado` — as 37 + **21**
  `quantidade = quantidade ± ?` em `estoque_saldo_almoxarifado` e `reservas_material_almoxarifado` (as tabelas de linha
  que a sonda 6 mostrou derivando) + `quantidade_utilizada` (1) + `quantidade_retornada` (2) + `quantidade_recebida` (1)
  + `quantidade_em_inspecao` do item do recebimento (1). Fora do padrão, e também escritas incrementais: `MAX(0, … − ?)`
  em `stockService.js:1596`, `:1696`, `:3035` e `receiptService.js:2368`; `RESERVADA_MENOS_SQL` (`:292`, usado em
  `:1710` e `:3096`); `quantidade_entregue` do item (`requisitionService.js:1522`); `syncMaterialTotals` (`:140-156`, grava
  `SUM(quantidade)`); e em JS `quantidade_separada` (`requisitionService.js:1018`) e o `saldo_posterior` do livro.
- **A folga que já existe:** `EPS = 1e-9` (`stockService.js:284`) em `:1663`, `:1760-1761`, `:1853`, `:1868`,
  `:3073-3088` e na origem estrita (`:1291`, `:1309`); a separação desde a 95 (`requisitionService.js:898`).
- **Os remendos de leitura:** `Math.round(… * 1e6) / 1e6` / `toFixed(6)` em `lotService`, `nonConformityService`,
  `purchaseService`, `receiptNotificationService`, `receiptService`, `requisitionService`, `stockService` (mensagens) e
  os epsilons de 1e-6 de `toleranciaInspecao.js:71` e `inspectionService.js:217`.

### A unidade de precisão (medido no cadastro)

Não há regra por unidade: `unidades_medida_almoxarifado` tem só `sigla`, `descricao`, `ativo` (`schema.js:985-990`); a
lista do formulário é fixa (`MaterialAlmoxarifadoForm.js:17`: UN, KG, G, L, ML, M, CM, M², M³, CX, PC, PAR, ROLO, BALDE,
TAMBOR, SACO); todas as colunas de quantidade são `REAL`; o recebimento aceita `step="0.01"` e as conversões de unidade
(`schemas.js:211`) produzem frações arbitrárias. **1e-6 já é a régua do módulo** (os 19 remendos, `toleranciaInspecao`,
`EPSILON_DIVERGENCIA`). Decidido 1e-6 (B481).

---

## Decisões reversíveis (letra B do documento de novidades; última usada: B479)

- **B480 — a regra: um helper único que arredonda ao gravar e compara com folga ao recusar (as duas coisas).** Módulo
  novo `server/services/almoxarifado/quantidade.js` (contrato abaixo), usado pelo motor e pelos serviços que escrevem as
  mesmas colunas. **Descartados:** (i) **só arredondar a gravação** (a opção (a) da 95) — a sonda 9 mostra o disponível
  torto com as colunas limpas (0,3 − 0,1): não conserta nem dado novo; (ii) **só a folga** (b) — destrava os gestos, mas
  a tela continua mostrando `0.9999999999999999`, o livro grava torto, o livre fantasma de 1e-16 aceita saídas de 1e-16
  e cada leitura nova precisa lembrar de arredondar; (iii) **guardar inteiro em micro-unidades** (`INTEGER` × 1e6) —
  migração de 30+ colunas em 15 tabelas e de todo leitor, irreversível na prática; a migração para o Postgres
  (`NUMERIC`) é o lugar disso; (iv) **biblioteca decimal** (`decimal.js`) — dependência nova e toda aritmética do módulo
  reescrita; (v) **folga espalhada linha a linha** (o que a base fez 19 vezes) — é a deriva que esta etapa fecha.
  Reversível: desligar é o helper devolver o número cru e a folga zero.
- **B481 — a precisão é 1e-6 para o módulo inteiro, não por unidade de medida.** **Descartado:** casas decimais por
  unidade (`UN` 0, `KG` 3…) — exigiria coluna nova no cadastro de unidades, migração e a regra de quem pode mudar; não há
  pedido; 1e-6 já é a régua de 19 lugares do módulo e um nanômetro/micrograma está abaixo de qualquer instrumento.
- **B482 — a porta do motor arredonda a quantidade pedida a 1e-6 (não recusa); se arredondar a 0, a recusa de "zero" de
  cada porta vale.** O livro e o saldo passam a dizer o mesmo número (sonda 8: `ENTRADA` 0,0000004). O arredondamento é
  **simétrico em zero** (`Math.sign(x) * Math.round(Math.abs(x) * 1e6) / 1e6`), como o `ROUND` do SQLite (que arredonda
  metade para longe de zero; `Math.round` puro arredonda −0,5 para cima). **Descartado:** recusar quantidade com mais de 6
  casas — as conversões de unidade produzem frações legítimas (1/3 de caixa) e a recusa apareceria como erro de
  digitação que o operador não fez.
- **B483 — o legado: consulta (A47) e script opcional; nada roda sozinho no boot.** O script
  `server/scripts/normalizar-quantidades-almoxarifado.js` **lista** por padrão e só grava com `--aplicar`, escrevendo
  `ROUND(col, 6)` onde `col <> ROUND(col, 6)` (idempotente) e imprimindo, por tabela e coluna, quantas linhas mudaram.
  Com a folga (B480) o legado **não prende mais gesto nenhum** — a normalização só limpa o número exibido; e a primeira
  escrita nova de cada coluna já grava arredondado (o legado se cura sozinho no material que se movimenta).
  **Descartados:** (i) normalizar no primeiro boot (`UPDATE` com log) — é decisão de dado tomada sem o administrador,
  roda em toda instância (inclusive a outra máquina do André) e não é necessária para destravar; (ii) só a consulta, sem
  script — o administrador teria de escrever o `UPDATE` à mão em 15 colunas.
- **B484 — o livro histórico não é reescrito.** As movimentações já gravadas guardam `saldo_anterior`/`saldo_posterior`
  tortos; as novas gravam arredondado. O script **não** toca `movimentacoes_almoxarifado` (é rastro: reescrever o que foi
  registrado apaga a prova do defeito). **Descartado:** normalizar o livro junto.
- **B485 — as mensagens de recusa mantêm a literal; só o número sai arredondado.** `getSaldoDisponivel` devolve
  `qtd(...)`; as mensagens que interpolam coluna crua (`Quantidade bloqueada insuficiente: ⟨n⟩`, `Baixa acima do que está
  no terceiro: há ⟨n⟩ …`, a do envio da remessa, a da entrega) passam o número por `qtd`. Nenhuma literal nova.
- **B486 — `disponivelSql()` passa a devolver `ROUND((…), 6)`.** Os 15 arquivos que o leem recebem o disponível limpo
  (a tela, a fila, os relatórios, os claims). O teste-varredura de `saldoEmTerceiros.api.test.js` continua valendo (a
  subtração continua só ali). **Descartado:** arredondar em cada leitor (a deriva espalhada de novo).
- **B487 — os 19 remendos de leitura ficam.** Com a gravação limpa eles viram redundantes, não errados; trocá-los pelo
  helper é refatoração sem defeito medido. **Descartado:** remover nesta etapa (multiplica o diff do tronco e a
  superfície de sabotagem).
- **B488 — o cliente não muda.** Com o servidor mandando números limpos (B480, B486), os 7 lugares que exibem
  `quantidade_atual` cru e o pré-preenchimento do modal de entrega mostram 1 em vez de `0.9999999999999999`. **Descartado:**
  formatador nas 7 telas (é apresentação, não o defeito; entra se a T5 medir número cru chegando à tela depois do
  tronco). O `step="1"` dos modais (que impede digitar 0,5 kg na separação e na entrega pela tela) é produto — fica de fora
  (C181).

## Regras de negócio

Os testes levam o prefixo `[96 RN-xx]`; o manual cita pelo conteúdo. **"Arredondado"** = `qtd(x)` (B482). **"Cabe"** =
`pedido <= disponível + 1e-9`. "Torto" = valor gravado com resíduo de ponto flutuante (`col <> ROUND(col, 6)`), montado
nos testes **por escritor direto** (`UPDATE … SET quantidade_atual = 0.9999999999999999`) para o legado, e **pelo motor**
(0,7 + 0,2 + 0,1) para provar que a gravação nova sai limpa.

- **RN-01 (o motor grava a quantidade arredondada)** — 0,7 + 0,2 + 0,1 por `ENTRADA` → `quantidade_atual` **1**, a linha
  do endereço **1** (com `localizacao_destino_id`), a do lote **1** (material com `controle_lote`); dez de 0,1 → 1; 0,3 −
  0,1 → **0,2**; 0,7 − 0,6 → **0,1**; três reservas 0,7 + 0,2 + 0,1 → `quantidade_reservada` **1**; bloquear 0,7 + 0,2 +
  0,1 → `quantidade_bloqueada` **1**; o `saldo_posterior` da última movimentação = o `quantidade_atual`; `GET
  /materiais/:id` → `quantidade_atual: 1`. **Varredura do código-fonte** (molde `saldoEmTerceiros`): nenhuma escrita
  `col = col ± ?` de coluna de quantidade em `services/almoxarifado` fora de `qtdSql(...)` — com controle positivo do
  padrão de busca (uma string com a escrita crua tem de ser achada).
- **RN-02 (o pedido que cabe passa — inclusive no legado)** — pela rota, cada porta da sonda 6 com o físico torto
  **escrito direto** (`0.9999999999999999`) e pedido de 1: `SAIDA` (sem origem, com origem no endereço, do lote),
  `TRANSFERENCIA`, `AJUSTE_NEGATIVO`, `PERDA`, `POST /reservas`, remessa (criar + enviar), `desbloquear` 1 com bloqueado
  `0.9999…` → 2xx. **Colunas limpas, disponível como diferença** (sonda 9): físico 0,3 e reservado 0,1 → `SAIDA` 0,2 →
  201; físico 0,3 e bloqueado 0,1 → reserva 0,2 → 201.
- **RN-03 (a folga não inventa estoque)** — físico 0,2 limpo: `SAIDA` 0,200001 → **400** *"Saldo insuficiente.
  Disponível: 0.2 PC"*; reserva 0,200001 → 400 *"Saldo disponível insuficiente: 0.2"*; desbloquear 0,200001 com
  bloqueado 0,2 → 400; transferência 0,200001 de um endereço com 0,2 → 400 *"Saldo insuficiente na localização de
  origem"*; entrega de 0,200001 com 0,2 separado → 400 (literal E1 abaixo). Nada gravado em nenhum.
- **RN-04 (a quantidade pedida é arredondada na porta)** — `ENTRADA` 1,0000004 → físico **1** e a movimentação com
  `quantidade` **1**; `ENTRADA` 0,0000004 → **400** *"material_id, tipo e quantidade são obrigatórios"* (a recusa de zero
  do motor), nada gravado; `POST /reservas` 0,0000004 → 400 *"Quantidade da reserva deve ser maior que zero"*.
- **RN-05 (a mensagem mostra o número arredondado)** — com o legado torto e um pedido que **não** cabe (físico
  `0.9999…`, `SAIDA` 2): 400 *"Saldo insuficiente. Disponível: 1 PC"* — a literal de sempre, sem `0.9999999999999999`.
  Idem *"Saldo disponível insuficiente: 1"*, *"Quantidade bloqueada insuficiente: 1"* e a entrega (*"Máximo: 1 (pendente:
  2, disponível: 1)"*).
- **RN-06 (a requisição com decimais vai do começo ao fim)** — (a) legado torto `0.9999…`, requisição de 1: aprovar →
  `TOTALMENTE_RESERVADA` com reserva **1** (fecha a ressalva do `6e0fae83`), separar 1, entregar 1 → 200 `ENTREGUE`,
  físico **0**, reservado 0, reserva `CONSUMIDA`; (b) físico 1 limpo, separar 0,7 + 0,2 + 0,1 → `quantidade_separada`
  **1**, entregar 1 → 200 `ENTREGUE`; (c) separar 1, entregar 0,7 + 0,2 + 0,1 → `ENTREGUE`, físico **0** (não
  2,8e-17), `quantidade_entregue` **1**, `quantidade_utilizada` **1**; (d) a fila e o detalhe no estado de (a) depois de
  separar → `entregavel` / `quantidade_entregavel` **1**.
- **RN-07 (o legado se lista e se normaliza só quando o administrador manda)** — com quatro colunas tortas montadas por
  escritor direto (material, linha de endereço, reserva, item de requisição) e um controle limpo (1,5): a A47 acha as
  quatro e não o 1,5; o script sem `--aplicar` imprime as quatro e **não** grava (os valores continuam tortos); com
  `--aplicar` grava `ROUND(…, 6)` e imprime as contagens; rodar de novo → 0 linhas (idempotente); o livro
  (`movimentacoes_almoxarifado`) intacto; uma conferência aberta sobre o material normalizado conclui **sem** ajuste.

## Contrato (congelado)

### O helper — `server/services/almoxarifado/quantidade.js` (T0)

```js
const QTD_CASAS = 6;
const QTD_FOLGA = 1e-9;          // folga de comparação: menor que meia unidade da precisão (5e-7), nunca aceita o que não existe
function qtd(x)                  // Number(x) arredondado a 1e-6, simétrico em zero; NaN/undefined -> NaN (quem chama decide)
function cabe(pedido, disponivel) // qtd-agnóstico: Number(pedido) <= Number(disponivel) + QTD_FOLGA
function qtdSql(expr)            // `ROUND((${expr}), 6)` — para o lado direito de um SET
const FOLGA_SQL = `- ${QTD_FOLGA}`; // para o lado direito de um claim: `col >= ? ${FOLGA_SQL}`
module.exports = { QTD_CASAS, QTD_FOLGA, qtd, cabe, qtdSql, FOLGA_SQL };
```

- `EPS` de `stockService.js:284` passa a **ser** `QTD_FOLGA` (mesmo valor, 1e-9 — nada muda para quem já usa);
  `RESERVADA_MENOS_SQL` vira `qtdSql(...)` do mesmo `CASE`.
- `availabilitySql.disponivelSql(alias)` → `ROUND((…), 6)` (B486).

### Gravação (T1, T2, T3)

Toda escrita incremental de coluna de quantidade **de estoque** passa por `qtdSql`: as 63 do padrão largo, as 4 `MAX(0,
… − ?)`, as 2 de `RESERVADA_MENOS_SQL`, `quantidade_entregue` (`requisitionService.js:1522`) e `syncMaterialTotals`
(`ROUND(SUM(quantidade), 6)`). Em JS: `quantidade_separada` (`:1018`) e o `saldo_posterior`/`saldo_anterior` gravados no
livro passam por `qtd`. **O custo médio** (`stockService.js:1801-1803`, `ROUND(…, 4)` sobre `quantidade_atual + ?`) **não
muda** — o SQLite lê os valores antigos da linha no lado direito do `SET`.

### Recusa (T1, T2, T3) — as 24 guardas

- As 17 claims SQL: `>= ?` → `>= ? ${FOLGA_SQL}` (o `?` do valor continua o mesmo parâmetro, já arredondado pela porta).
- As 7 em JS: `disponivel < quantidade` → `!cabe(quantidade, disponivel)` (`stockService.js:1389`, `:1398`,
  `thirdPartyService.js:235`, `:384`, `scrapDisposalService.js:243`, `requisitionService.js:1370`, `:1405`).

### Literais (todas **inalteradas na forma**; muda só o número interpolado — B485)

| id | onde | código | texto |
|---|---|---|---|
| M1 | `stockService.js:1390` e `:1782` (saída comum) | 400 | `` `Saldo insuficiente. Disponível: ${qtd(disponivel)} ${unidade}` `` |
| M2 | `:1435` (transferência / linha de origem) | 400 | `Saldo insuficiente na localização de origem` |
| M3 | `:1455` (desbloqueio) | 400 | `` `Quantidade bloqueada insuficiente: ${qtd(bloqueada)}` `` |
| M4 | `:1480`, `:1508` (inspeção) | 400 | `` `Quantidade em inspeção insuficiente: ${qtd(em_inspecao)}` `` |
| M5 | `:1523` (envio a terceiro pelo motor) | 400 | `` `Saldo disponível insuficiente para enviar ao terceiro: ${qtd(d)} ${unidade}` `` |
| M6 | `:1697` (consumo de reserva) | 400 | `` `Saldo físico insuficiente para consumir a reserva. Disponível: ${qtd(d)} ${unidade}` `` |
| M7 | `:1730-1732` (baixa de terceiro) | 400 | `` `Baixa acima do que está no terceiro: há ${qtd(t)} ${unidade} nessa situação (físico: ${qtd(f)})` `` |
| M8 | `:2992` (`criarReserva`) | 400 | `` `Saldo disponível insuficiente: ${qtd(d)}` `` |
| M9 | `:1978` (lote) | 400 | `` `Saldo insuficiente no lote ${codigo}. Disponível: ${qtd(d)} ${unidade}` `` |
| T1 | `thirdPartyService.js:239-240` (envio) | 400 | `` `${codigo}: disponivel ${qtd(d)} ${unidade}, a remessa pede ${qtd(pedido)}…` `` |
| T2 | `thirdPartyService.js:389-391` (retorno) | 400 | forma de hoje, com `qtd` em `restante` e `qtd` |
| S1 | `scrapDisposalService.js:244` | 400 | forma de hoje, com `qtd(disponivel)` |
| E1 | `requisitionService.js:1371-1373` e `:1406-1408` (entrega) | 400 | `` `${material_nome}: não é possível entregar ${qty} ${unidade}. Máximo: ${qtd(max)} (pendente: ${qtd(pendenteEntrega(item))}, disponível: ${qtd(disponivel)})` `` |
| Z1 | `stockService.js:982` (zero) | 400 | `material_id, tipo e quantidade são obrigatórios` — alcançada também por quantidade que arredonda a 0 (B482) |

### O legado — `server/services/almoxarifado/quantidadeLegado.js` + `server/scripts/normalizar-quantidades-almoxarifado.js` (T4)

- `COLUNAS_LEGADO`: `materiais_almoxarifado` (`quantidade_atual`, `quantidade_reservada`, `quantidade_bloqueada`,
  `quantidade_em_inspecao`, `quantidade_em_terceiros`); `estoque_saldo_almoxarifado.quantidade`;
  `reservas_material_almoxarifado` (`quantidade`, `quantidade_utilizada`); `itens_requisicao_almoxarifado`
  (`quantidade_separada`, `quantidade_entregue`, `quantidade_atendida`); `itens_remessa_terceiro_almoxarifado.quantidade_retornada`;
  `recebimentos_material_itens_almoxarifado` (`quantidade_recebida`, `quantidade_em_inspecao`). **Não** entra:
  `movimentacoes_almoxarifado` (B484), `itens_conferencia_almoxarifado` (contagem é registro do que se contou).
- `listarTortos(db)` → `[{ tabela, coluna, id, valor, arredondado }]` com `WHERE col <> ROUND(col, 6)`.
- `normalizar(db, { aplicar })` → `{ aplicado: boolean, porColuna: [{ tabela, coluna, linhas }] }`; com `aplicar`, um
  `UPDATE t SET col = ROUND(col, 6) WHERE col <> ROUND(col, 6)` por coluna.
- CLI: `node scripts/normalizar-quantidades-almoxarifado.js [--aplicar]` — abre o banco por `config/paths.js`
  (respeita `CRM_DATA_DIR`), imprime uma linha por coluna (`tabela.coluna: N linha(s)`) e, sem `--aplicar`, termina com
  *"Nada gravado. Rode com --aplicar para normalizar."*; com `--aplicar`, *"Normalizado."*. Saída 0 nos dois.

### O que não muda

As travas (91, 93, 95); a conta da separação (95, que já arredonda); a alçada (94); o custo médio; a acuracidade do
inventário (já tolera 1e-6); a régua de excedente do recebimento (`EPSILON_DIVERGENCIA`); a ordem das recusas.

## Técnica dos testes

1. **`server/tests/api/quantidadeArredondada.api.test.js`** (T0 + T1, runner próprio, molde 95): usuários reais por
   header (S, ADMIN, ALMOX), movimentação por `POST …/movimentacoes/v2`, requisição criada e **aprovada pela rota**. O
   legado torto é montado por **escritor direto** (`UPDATE … = 0.9999999999999999`), nunca pelo motor — depois da T1 o
   motor não produz mais deriva, e o teste que a fabrica pelo motor **vira teste vazio**.
2. **`quantidadeArredondadaServicos.api.test.js`** (T2), **`quantidadeArredondadaRequisicao.api.test.js`** (T3),
   **`quantidadeLegado.api.test.js`** (T4), **`quantidadeArredondadaIntegracao.api.test.js`** (T5).
3. **Os testes antigos que fabricam deriva pelo motor** (lidos — `conferenciaAcuracidade` `:154`, `naoConformidadeServico`
   (10), `encaminhamentoExecucao` `:549`, `inspecaoDecisao` `:209`, `medidasInspecao` `:205`,
   `comprasPedidoSituacaoFonte` `:113`, `comprasPedidoStatusAutomatico` `:587`): a T1/T2 roda cada um **e confere se o
   cenário ainda produz a deriva** (imprimir o valor gravado). Os que passarem a montar números limpos continuam verdes
   **sem provar o epsilon** — reescrever o estado deles por escritor direto, no commit da task, dizendo qual.
4. Sabotagem só na árvore principal, um controle de cada vez, `perl -0pi` com âncora contada = 1, backup
   `e96-<task>-*.bak` no scratchpad, restauro por cópia com md5 conferido, base **LF**. Mensagens `msg-e96-<task>.txt`.

## Tasks

**Ordem topológica: T0 → T1 → T2 → T3 → T5 → T6**, com **T4** (galho) em paralelo a T2/T3 numa worktree. T0–T3 são
**tronco** (T0: o helper e `disponivelSql`, regra compartilhada por 15 arquivos; T1: o motor; T2: os outros escritores
das colunas do material — mesma regra, claims sobre as mesmas colunas; T3: a requisição — a 05/07, lê o motor). T4 só
**consome** o helper (`qtd` para o relatório) e as tabelas — galho, em worktree com junction (memória "worktree com
junction"). T2 e T3 **não** vão em paralelo: as duas sabotam o motor que as outras leem (memória "sabotagem concorrente").

- [ ] **T0 (tronco) — o helper e o disponível arredondado (B480, B481, B482, B486).** Contrato "O helper". Testes
  unitários do helper no arquivo da T1 (`[96 RN-00]` — `qtd(0.1+0.2) === 0.3`, `qtd(-0.0000005) === -0.000001`,
  `qtd(0.0000004) === 0`, `cabe(1, 0.9999999999999999)`, `!cabe(0.200001, 0.2)`, `qtdSql('a + ?')`) e a RN-02 "colunas
  limpas" (sonda 9) pela rota — só a parte que `disponivelSql` + `getSaldoDisponivel` resolvem. **Vermelho antes:** RN-02
  (colunas limpas). **Medir antes e depois, sem edição:** `saldoEmTerceiros` (a varredura), `reportService*`,
  `filaSeparacao`, `separacaoTetoFisico*`. **Controles:** (s1) `disponivelSql` sem o `ROUND` → cai RN-02 colunas limpas
  (reserva 0,2 com bloqueado 0,1 → 400); (s2) `qtd` com `Math.round` sem o sinal → cai o caso `-0.0000005`.
- [ ] **T1 (tronco) — o motor (`stockService.js`): gravação, porta, claims, mensagens (B480, B482, B484, B485).**
  Contrato "Gravação", "Recusa" e M1–M9, Z1. **RN-01** (menos a parte de T2/T3), **RN-02**, **RN-03**, **RN-04**,
  **RN-05** nas portas do motor (saída, ajuste, perda, transferência, lote, endereço, reserva criar/liberar, bloqueio
  pelo motor, consumo de reserva, baixa de terceiro). A varredura do código-fonte da RN-01 cobre `stockService.js`.
  **Vermelho antes:** RN-01, RN-02 (legado), RN-04 (0,0000004 → 201), RN-05. **Guardas (passam antes):** RN-03 (a folga
  nova não pode abrir o que está fechado). **Medir:** a suíte inteira (`test:api`) — o motor é lido por quase tudo; o
  custo (`custoMedio*`, `transformCost*`); os 7 testes de deriva (Técnica 3). **Controles:** (s1) um claim de cada família
  sem `FOLGA_SQL` — `:1778` → cai RN-02 `SAIDA` legado; `:1432` → cai a transferência; `:2988` → cai a reserva; `:1451`
  → cai o desbloqueio; (s2) a escrita `:1801` (entrada) sem `qtdSql` → cai RN-01 0,7+0,2+0,1 = 1; (s3) a linha do
  endereço `:223` sem `qtdSql` → cai RN-01 linha = 1; (s4) `syncMaterialTotals` sem `ROUND` → cai RN-01 do lote ou do
  endereço (o físico volta a `0.9999…` pela soma); (s5) a porta sem `qtd` → cai RN-04 (`1,0000004` grava `1.0000004`);
  (s6) `getSaldoDisponivel` sem `qtd` → cai RN-05; (s7) `FOLGA_SQL` = `- 1e-6` (folga grande demais) → cai RN-03 (`SAIDA`
  0,200001 → 201) — **a prova de que a RN-03 sabe falhar**.
- [ ] **T2 (tronco) — os outros escritores das colunas do material.** `inspectionService.js` (`:290-291`, `:320`,
  bloquear/desbloquear), `thirdPartyService.js` (`:235`, `:384`, `:453-454`, `:770`, `:902-903`), `receiptService.js`
  (`:1536`, `:1559`, `:2368`), `scrapDisposalService.js:243`. **RN-01** (bloquear 0,7+0,2+0,1 → 1), **RN-02** (remessa
  com legado; desbloquear; retorno de terceiro 1 de um item com `quantidade_retornada` torta), **RN-03**, **RN-05** (T1,
  T2, S1). Varredura da RN-01 estendida aos quatro arquivos. **Vermelho antes:** remessa e desbloquear do legado (sonda
  6). **Medir:** `remessa*`, `terceiro*`, `inspecao*`, `recebimento*`, `sucateamento*` (grep pelo nome no início da task).
  **Controles:** (s1) a pré-checagem `thirdPartyService.js:235` sem `cabe` → cai RN-02 remessa; (s2) `inspectionService`
  sem `FOLGA_SQL` em `:291` → cai a inspeção de um item com `quantidade_em_inspecao` torta (montar); (s3) a escrita
  `:1442` / bloqueio sem `qtdSql` → cai RN-01 bloqueado = 1.
- [ ] **T3 (tronco) — a requisição: as colunas do item e a entrega.** `requisitionService.js` `:1018` (`qtd` na soma da
  separação), `:1522` (`qtdSql` na entregue), `:1370`/`:1405` (`cabe`), E1 com `qtd`. **RN-06 (a)(b)(c)(d)** pela rota e
  pelo serviço (`separarRequisicao`, `entregarRequisicao` chamados direto). **Vermelho antes:** RN-06 (a) (`APROVADO`
  sem reserva — vem da T1: a T3 confere que continua verde), (b) (sonda 10 A), (c) (físico 2,8e-17). **Medir:**
  `separacao*`, `entrega*`, `reserva*`, `filaSeparacao`, `requisicaoGestosConcorrentes*`, `alcadaValor*`. **Controles:**
  (s1) `:1018` sem `qtd` → cai RN-06 (b) (entregar 1 → 400); (s2) `:1370` sem `cabe` → cai RN-06 (b) pela prévia
  (mensagem com `Máximo: 1`… só se `:1405` também; sabotar **um** de cada vez e dizer qual asserção cai — a prévia
  `:1370` responde primeiro); (s3) `:1522` sem `qtdSql` → cai RN-06 (c) `quantidade_entregue` = 1.
- [ ] **T4 (galho, worktree) — a A47 e o script opcional (B483, B484).** Contrato "O legado". **RN-07** pelo serviço
  (`quantidadeLegado.normalizar(db, …)`) **e** pela CLI (`child_process` com `CRM_DATA_DIR` numa pasta temporária com o
  banco da suíte copiado — molde "prova de primeiro boot", memória). **Vermelho antes:** tudo (arquivo novo). **Controles:**
  (s1) `normalizar` ignorando `aplicar` (grava sempre) → cai "sem `--aplicar` não grava"; (s2) a consulta com `ABS(…) >
  1e-12` no lugar de `<>` → cai "acha as quatro" (devolve 0 — o falso negativo da 95); (s3) `COLUNAS_LEGADO` sem
  `estoque_saldo_almoxarifado` → cai "acha a linha de endereço".
- [ ] **T5 (integração — cruza T1, T2, T3 e T4).** Ver a seção abaixo. **Controles:** com a T1 revertida (s1 da T1) →
  cai I1; com a T3 revertida (s1 da T3) → cai I3; com a T2 revertida (s1 da T2) → cai I2.
- [ ] **T6 — fechamento (skill `fechar-etapa`).** Novidades (seção da 96; **C176** marcado resolvido, dizendo que o
  defeito era mais largo e que a razão da recomendação estava errada; **C177–C181**; **B480–B488**; **A47**; D (96); F
  (96)); specs 03 (motor: a gravação e a folga), 05 (o item e a entrega), 07 (a aprovação no legado); mapa; guia
  (cabeçalho, seção da 96 com roteiro clicável: entrada em KG fracionada e a saída inteira, a requisição de 1 depois da
  nota em kg); manual (motor: "as quantidades guardam até 6 casas"; o script); este plano (execução, Fase 5, retro,
  próxima tarefa — **Etapa 97**).

## Teste de integração — por que a T5 é a única prova de que as partes compõem

A deriva nasce numa porta (entrada, separação) e prende o gesto **em outra** (saída, entrega) — cada task fecha a sua
porta e fica verde sozinha. Os cenários entram **pela rota** e **pelo serviço**:

- **I1 — pela rota, a nota em KG e o gesto inteiro:** material `KG`; ADMIN dá entrada de 0,7, 0,2 e 0,1
  (`/movimentacoes/v2`) → `GET /materiais/:id` `quantidade_atual` 1 → transferência de 1 de A para B → `SAIDA` 0,4 de B
  → reserva manual 0,6 → `liberar` → `SAIDA` 0,6 → físico **0**, reservado 0, nenhuma linha de endereço com resíduo
  (`SELECT … WHERE quantidade <> 0`) e o `saldo_posterior` do último movimento 0.
- **I2 — pela rota, o legado e os escritores de fora do motor:** físico **torto escrito direto** (`0.9999…`) → bloquear 1
  → desbloquear 1 → remessa de 1 (criar + enviar) → retorno de 1 → físico 1, em terceiros 0, bloqueado 0.
- **I3 — pela rota, a requisição de ponta a ponta:** legado torto `0.9999…` → S pede 1 → ADMIN aprova
  (`TOTALMENTE_RESERVADA`, reserva 1) → ALMOX separa 0,7 + 0,3 → fila `entregavel` 1 e detalhe
  `quantidade_entregavel` 1 → entrega 0,5 + 0,5 → `ENTREGUE`, físico 0, reserva `CONSUMIDA` com `quantidade_utilizada`
  1.
- **I4 — pelo serviço:** `stockService.registrarMovimentacao` (entrada 0,7/0,2/0,1 e saída 1),
  `stockService.criarReserva` (1 sobre o legado), `requisitionService.separarRequisicao` e `entregarRequisicao`
  chamados direto → os mesmos números do I1/I3, e o `{ status: 400 }` com a literal M1 para `SAIDA` 1,000001 com físico 1.
- **I5 — o legado normalizado não muda nada que já funcionava:** monta o I3 até a separação com o legado torto, roda
  `quantidadeLegado.normalizar(db, { aplicar: true })` **no meio**, entrega → `ENTREGUE`; uma conferência aberta antes
  da normalização conclui sem ajuste; o livro não muda (contagem e soma de `movimentacoes_almoxarifado` iguais antes e
  depois).

## Avisos (letra C) — a registrar no fechamento

- **C176** → **✅ RESOLVIDO NA ETAPA 96** (hash), dizendo: o defeito era mais largo (as linhas de endereço e de lote, o
  reservado, o bloqueado, o item da requisição; e o disponível como diferença de colunas limpas — sonda 9); e a
  recomendação (c) da 95 estava certa pela razão errada ("só (a) não salva o legado" — não salva nem dado novo).
- **C177 — o que muda para quem opera.** Os saldos aparecem limpos (1, não `0.9999999999999999`) depois da primeira
  movimentação de cada material ou do script; recusas por "Saldo insuficiente" com o número igual ao pedido deixam de
  acontecer; quantidade digitada com mais de 6 casas é guardada com 6. **O que fazer:** rodar a **A47** (ou o script
  sem `--aplicar`) depois do deploy e decidir se normaliza.
- **C178 — o item da requisição prendia a entrega com estoque limpo** (sonda 10 A: separar 0,7 + 0,2 + 0,1 e entregar 1
  → 400) e a entrega fracionada deixava 2,8e-17 de físico fantasma (sonda 10 B). Corrigido na T3.
- **C179 — a ressalva do `6e0fae83`, medida:** no estoque já torto a aprovação passou de `PARCIALMENTE_RESERVADA`
  (`0.9999…`) para `APROVADO` sem reserva; o gesto final (a entrega presa) era o mesmo antes e depois; a 96 fecha os dois
  (RN-06 a).
- **C180 — o bloqueio aceitava 1 com físico `0.9999…`** (disponível −1,1e-16) e o livre fantasma de 1,1e-16 aceitava
  saída de `1e-16` (sonda 6). Somem com a gravação arredondada; registrados para ninguém achar que o bloqueio "tem folga
  de propósito".
- **C181 — a tela não deixa digitar decimal na separação, na entrega, na requisição e na movimentação** (`step="1"` em
  `MovimentacoesAlmoxarifado.js:910`, `RequisicaoForm.js:520`, `RequisicoesList.js:2139` e `:2311`; lido, não medido
  em navegador). Material em KG/M/L só movimenta fração pela nota (`step="0.01"`) ou pela API. Produto, fora desta
  etapa.

## O que fica de fora (declarado — e por quê)

- **A saída avulsa que leva a caixa sem reserva** (B466 iv da 95; `e96f0-s2-avulsa-caixa.js`, 5/8 ERRADO) — **Etapa 97**:
  pede a caixa dentro de cinco claims do motor, que esta etapa deixa certos em decimal primeiro, e decisão de produto
  (recusar ou só avisar).
- **A tela** — formatador de quantidade nas 7 telas (B488) e o `step="1"` dos modais (C181).
- **Os 19 remendos de leitura** (B487).
- **O livro histórico** (B484) e a **normalização automática no boot** (B483).
- **Precisão por unidade de medida** (B481).
- **`SUCATA` e `DEVOLUCAO_FORNECEDOR`** não foram sondadas pela porta delas (o processo de sucateamento e a NC): a guarda
  do sucateamento entra na T2 (`scrapDisposalService.js:243`) e a do motor na T1; a sonda pela porta própria fica para a
  T5 só se a Fase 2 pedir.
- **A migração para Postgres (`NUMERIC`)** — é onde o "guardar exato" mora (memória "migração SQLite → Postgres").

## Letra A — consulta para produção (a confirmar no fechamento como **A47**)

**A47 — quantidades gravadas com resíduo de ponto flutuante (C176).** Rodar depois do deploy da 96 (ou rodar o script sem
`--aplicar`, que faz a mesma coisa e imprime por coluna):

```sql
SELECT 'materiais_almoxarifado' AS tabela, id, codigo AS ref, 'quantidade_atual' AS coluna, quantidade_atual AS valor
  FROM materiais_almoxarifado WHERE quantidade_atual <> ROUND(quantidade_atual, 6)
UNION ALL SELECT 'materiais_almoxarifado', id, codigo, 'quantidade_reservada', quantidade_reservada
  FROM materiais_almoxarifado WHERE quantidade_reservada <> ROUND(quantidade_reservada, 6)
UNION ALL SELECT 'materiais_almoxarifado', id, codigo, 'quantidade_bloqueada', quantidade_bloqueada
  FROM materiais_almoxarifado WHERE quantidade_bloqueada <> ROUND(quantidade_bloqueada, 6)
UNION ALL SELECT 'materiais_almoxarifado', id, codigo, 'quantidade_em_inspecao', quantidade_em_inspecao
  FROM materiais_almoxarifado WHERE quantidade_em_inspecao <> ROUND(quantidade_em_inspecao, 6)
UNION ALL SELECT 'materiais_almoxarifado', id, codigo, 'quantidade_em_terceiros', quantidade_em_terceiros
  FROM materiais_almoxarifado WHERE quantidade_em_terceiros <> ROUND(quantidade_em_terceiros, 6)
UNION ALL SELECT 'estoque_saldo_almoxarifado', id, material_id, 'quantidade', quantidade
  FROM estoque_saldo_almoxarifado WHERE quantidade <> ROUND(quantidade, 6)
UNION ALL SELECT 'reservas_material_almoxarifado', id, material_id, 'quantidade', quantidade
  FROM reservas_material_almoxarifado WHERE quantidade <> ROUND(quantidade, 6)
UNION ALL SELECT 'reservas_material_almoxarifado', id, material_id, 'quantidade_utilizada', quantidade_utilizada
  FROM reservas_material_almoxarifado WHERE quantidade_utilizada <> ROUND(quantidade_utilizada, 6)
UNION ALL SELECT 'itens_requisicao_almoxarifado', id, requisicao_id, 'quantidade_separada', quantidade_separada
  FROM itens_requisicao_almoxarifado WHERE quantidade_separada <> ROUND(quantidade_separada, 6)
UNION ALL SELECT 'itens_requisicao_almoxarifado', id, requisicao_id, 'quantidade_entregue', quantidade_entregue
  FROM itens_requisicao_almoxarifado WHERE quantidade_entregue <> ROUND(quantidade_entregue, 6)
UNION ALL SELECT 'itens_requisicao_almoxarifado', id, requisicao_id, 'quantidade_atendida', quantidade_atendida
  FROM itens_requisicao_almoxarifado WHERE quantidade_atendida <> ROUND(quantidade_atendida, 6)
UNION ALL SELECT 'itens_remessa_terceiro_almoxarifado', id, remessa_id, 'quantidade_retornada', quantidade_retornada
  FROM itens_remessa_terceiro_almoxarifado WHERE quantidade_retornada <> ROUND(quantidade_retornada, 6)
UNION ALL SELECT 'recebimentos_material_itens_almoxarifado', id, recebimento_id, 'quantidade_recebida', quantidade_recebida
  FROM recebimentos_material_itens_almoxarifado WHERE quantidade_recebida <> ROUND(quantidade_recebida, 6)
UNION ALL SELECT 'recebimentos_material_itens_almoxarifado', id, recebimento_id, 'quantidade_em_inspecao', quantidade_em_inspecao
  FROM recebimentos_material_itens_almoxarifado WHERE quantidade_em_inspecao <> ROUND(quantidade_em_inspecao, 6)
ORDER BY tabela, coluna, id;
```

**Conferida na Fase 0** (sonda 11, `e96-sonda-11-a47.js`: o SQL acima extraído deste arquivo e executado contra o
esquema da suíte): com 0,7 + 0,2 + 0,1 num material e 1,5 noutro, devolve exatamente `materiais_almoxarifado.quantidade_atual`
e `estoque_saldo_almoxarifado.quantidade` do primeiro — a linha de saldo também deriva — e nada do 1,5. `remessa_id` e
`recebimento_id` conferidos no esquema (`schema.js:1878`, `:1352`). As outras colunas só rodam vazias aqui; a T4 monta
uma linha torta em cada. **Como ler:** cada linha é um valor guardado com resíduo (`0.9999999999999999`, `0.30000000000000004`).
Depois da 96 ele não prende gesto nenhum (a folga) — só aparece torto na tela. **O que fazer:** nada é obrigatório;
para limpar a tela, `node scripts/normalizar-quantidades-almoxarifado.js --aplicar` (com o servidor parado, como
qualquer escrita direta no banco). O livro (`movimentacoes_almoxarifado`) **não** entra: é rastro.

## O que contradiz a próxima tarefa escrita na 95

1. **"Só (a) não salva o legado (o claim compara antes de gravar)"** — a razão está **errada**: só (a) não salva **nem
   dado novo**. O disponível é uma diferença; com físico 0,3 e reservado 0,1 **limpos**, `SAIDA` 0,2 → 400 (sonda 9). A
   folga é a correção principal; a gravação arredondada é o que limpa a tela, o livro e o livre fantasma. A recomendação
   (c) fica — com o peso invertido.
2. **"37 escritas"** — confere para as colunas do **material**; a superfície é **63** linhas no padrão largo + 7 fora
   dele (`MAX(0, …)`, `RESERVADA_MENOS_SQL`, a entregue, `syncMaterialTotals`) + 2 em JS (a separada, o livro). As 21
   escritas das **tabelas de linha** (endereço, lote, reserva) derivam igual (sonda 6) — o ponto de atenção 1 da 95
   perguntava; a resposta é sim.
3. **"17 claims"** — confere; mas há **7 recusas em JS** (5 não listadas), e a que responde a `SAIDA` da sonda 1 é a
   **pré-checagem** `stockService.js:1389`, não o claim `:1778`. Folga só nos 17 deixaria a recusa igual.
4. **O item da requisição não estava na lista** — `quantidade_separada` (soma em JS) e `quantidade_entregue` derivam e
   prendem a entrega **com o estoque limpo** (sonda 10 A). Entra como T3.
5. **"Letra B: o primeiro boot normaliza o legado ou só lista"** — nenhum dos dois: consulta + script opcional com
   `--aplicar` (B483). Com a folga, o legado não prende gesto; normalizar sozinho no boot é decisão de dado sem
   necessidade.
6. **"A A47 estendida a bloqueada, em inspeção, em terceiros e às linhas"** — e também às reservas, ao item da
   requisição, à remessa e ao recebimento (as colunas que a T1–T3 passam a gravar arredondado).
7. **A ressalva do `6e0fae83` ("pode ter piorado")** — medida (C179): piorou a **garantia** (de reserva quase total para
   nenhuma), **não o gesto** (a entrega já ficava presa antes). A folga em `criarReserva` fecha os dois.
8. **"Com (a) + normalização a tela se corrige; sem a normalização, decidir se entra um formatador"** — sem normalização
   automática e sem formatador (B483, B488): a primeira escrita de cada coluna já grava limpo e o `disponivelSql`
   arredonda; o legado parado na tela se limpa pelo script. A T5 mede se algum número cru ainda chega à resposta.
9. **"O inventário e a acuracidade já toleram 1e-6 — a normalização não pode gerar ajuste fantasma"** — medido, não
   gera (sonda 8). O risco novo é outro: **sete testes antigos fabricam a deriva pelo motor** e passam a montar números
   limpos depois da T1 — continuariam verdes sem provar o epsilon (Técnica 3).
10. **"`EPS = 1e-9` existe e só parte do motor a usa"** — e há um segundo epsilon no módulo (1e-6, `toleranciaInspecao`,
    `inspectionService:217`, a acuracidade). A 96 não unifica os dois: 1e-9 é folga de **comparação**, 1e-6 é a
    **precisão** — a folga tem de ser menor que meia precisão (5e-7) para nunca aceitar o que não existe (RN-03, s7 da T1).

## Próximo passo

**Fase 2** — um agente fresco (sem este contexto) com este plano, a spec 03 (motor), a 05 e a 07, e as quatro perguntas
da skill (contratos com erro e literal; RN × spec; independência real do galho T4; **cada RN traçada até o último
gesto** — entrada → transferência → reserva → saída; aprovar → separar → entregar → encerrar; bloquear → desbloquear;
enviar → retornar → encerrar remessa; inventário aberto → concluir). Pontos que a Fase 2 deve atacar em especial:
(1) **o estorno** (`cancelarMovimentacao`, `:2236-2890`) — ele soma de volta com escritas próprias (`:2642`, `:2804-2815`)
e compara com `>= ?` (`:2551`, `:2749`): estornar uma entrada de 0,1 num físico `0.30000000000000004` arredonda para
quanto, e o livro do estorno bate? (2) **a ordem `qtd` na porta × `zeroPermitidoParaAjuste`**: `AJUSTE` com
localização e 0,0000004 vira 0 e **zera** o endereço — aceitável ou recusa? (3) as linhas de
`estoque_saldo_almoxarifado` com saldo negativo (o "sem localização atribuída" da 51) — `ROUND` de negativo e a régua
`quantidade > 0` do `claimSaldoSemLote`; (4) `custo_medio` — a T1 diz que não muda; a Fase 2 confere a leitura de
`:1801-1803` e `:2133`; (5) a T4 em worktree: o teste da CLI copia o banco — conferir que não depende de nada que a T1–T3
mudam (senão vira tronco). Corrigir o plano, **depois** executar T0.
