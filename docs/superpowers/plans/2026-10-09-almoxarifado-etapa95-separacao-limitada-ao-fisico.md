# Etapa 95 — a separação não aceita mais do que existe na prateleira: o separado ainda não entregue fica retido para quem separou (C169, D (60), features 05 com a 04 e a 07)

> Status: **PLANO (Fases 0 e 1) — 2026-10-09.** Nenhuma task executada. Próximo passo: **Fase 2** (revisão do plano por
> agente fresco — ver "Próximo passo" no fim).
> HEAD de partida: `616999be` (main, árvore limpa, sem push).
> Origem: "Próxima tarefa detalhada — Etapa 95" no fim de
> `docs/superpowers/plans/2026-10-09-almoxarifado-etapa94-alcada-de-valor-ate-a-separacao.md`; o item **169** da letra C
> de `docs/almoxarifado-novidades-por-etapa.md`; a linha **(60)** de D *"Separado SEM endereço de outra requisição não sai
> do 'livre'"*; o cenário 5 da Etapa 64 no guia (*"as duas separam 10 (a separação não reserva)"*); a pendência medida
> no fim da spec `specs/modulo-almoxarifado/05-separacao-picking/README.md` (C169). **A Fase 0 mediu que o defeito é
> mais largo do que a próxima tarefa da 94 dizia** (ver "O que contradiz a próxima tarefa escrita na 94").
>
> **Numeração:** etapa única para todos os módulos (esta é a **95**). Letras do documento do almoxarifado, conferidas em
> 2026-10-09: última **B465** (`:6208`), último item C **169** (`:8067`), última **A45** (`:1612`). Esta etapa usa
> **B466–B476**, **C170–C173** e **A46**.

**Escopo desta etapa (o que a Fase 0 reproduziu — e só isso):**
1. **A regra (uma conta só):** o que um item pode separar agora é o que existe na prateleira **para ele** — o disponível
   do material, mais o que a reserva ativa do próprio item ainda segura, **menos o separado ainda não entregue do próprio
   item**, **menos o separado ainda não entregue e sem reserva dos outros itens** (de qualquer requisição ativa, inclusive
   a mesma) do mesmo material. O separado **sem** reserva passa a ficar retido para quem separou — na separação e na
   aprovação. Fecha a sonda 1 (21/30 → 7/30, os 7 restantes são a cópia da conta no cliente, T3) e a sonda 2 (7/10 →
   0/10), medido em protótipo.
2. **Na mesma rodada**, itens do mesmo material dividem essa conta (o segundo item vê o que o primeiro acabou de separar).
3. **A fila (64) e o detalhe** mostram o mesmo número que a porta aceita; a tela usa o número do servidor.
4. **A aprovação** não reserva o que está na caixa de outra requisição sem reserva (sonda 2, M3: a reserva nova deixava a
   dona da caixa sem conseguir entregar o que separou).
5. **A46** — duas consultas para produção (o rastro: caixa acima do físico; e reserva + caixa sem reserva acima do físico
   livre), conferidas com controle positivo e negativo.

**Fora (declarado, ver "O que fica de fora"):** a entrega (continua pelo disponível + reserva do item; a "segunda
rodada" da Etapa 3 que entrega sem separar continua); a reserva na chegada e na liberação da inspeção (74/75) e o
recálculo (76); `calcularStatusPosAprovacao`; o motor (`disponivelSql`, `criarReserva`, saídas avulsas); trava por
material na separação; o legado que já tem caixa acima do físico (a A46 acha; ninguém corrige sozinho).

---

## Fase 0 — medido (2026-10-09)

Sondas no scratchpad da sessão (`e95-h.js` — harness comum; `e95-sonda-1-conta.js`, `-2-varias.js`, `-3-vizinhos.js`,
`-4-consulta.js`; saídas `e95-sonda-*.out`; protótipo `e95-proto-patch.js`, diff `e95-proto.diff`, suíte do protótipo
`e95-proto-testapi.out`), contra `server/tests/helpers/testApp.js` com `requirePermission` real e **usuário por
requisição** (header `x-u`, middleware logo depois do `jsonParser`, molde 92–94): **S** sem perfil (PRODUÇÃO) cria por
`POST /api/requisicoes-material`; **ADMIN** superadmin aprova pela rota (`PUT …/aprovar`) e dá entrada
(`POST /api/almoxarifado/movimentacoes/v2` `ENTRADA` — saldo **solto**, sem reserva: a reserva na chegada é só da nota,
D4 da 74); **ALMOX** e **ALMOX2** (`ALMOXARIFE`) separam, conferem e entregam. Material comum (exceto onde dito), custo
0,1, alçada desligada. A sonda copia `maxQtdSeparacao` do cliente (`RequisicoesList.js:52-55`) e aplica ao item do
`GET /api/almoxarifado/requisicoes/:id`.

**Detector:** para cada cenário, o separável **físico** esperado (o que está na prateleira e não é de ninguém mais) é
escrito à mão; a sonda compara com `fila.separavel`, com o máximo da tela e com o código da porta ao separar acima/abaixo
dele. **Controle do detector:** K1–K3, M1, M6, E1, E2, O1 (mesmo par), X — casos em que o código de hoje está certo — dão
**CERTO**: o detector sabe dizer "certo" e sabe dizer "errado".

### Sonda 1 — a conta do próprio item, na porta, na fila e na tela (`e95-sonda-1-conta.js`)

| cenário | físico | pede | antes | separável certo | fila | tela | separar acima → |
|---|---|---|---|---|---|---|---|
| K1 controle: reserva total | 4 | 4 | separou 2 | 2 | 2 | 2 | (+2 → 200, certo) |
| K2 controle: reserva total, nada separado | 10 | 6 | — | 6 | 6 | 6 | (+6 → 200, certo) |
| K3 controle: reserva parcial, nada separado | 4 | 6 | — | 4 | 4 | 4 | (+4 → 200, certo) |
| **C1** (o C169): reserva 4 | 4 | 6 | separou 4 | **0** | 2 | 2 | +2 → **200** |
| **C2** reserva 4 | 4 | 6 | separou 3 | **1** | 3 | 3 | +2 → **200** |
| **C3** legado `PARCIALMENTE_RESERVADA` com 4 separados | 4 | 6 | separou 4 | **0** | 2 | 2 | +2 → **200** |
| **C4** **sem reserva** (aprovada sem estoque; 4 chegam soltos) | 4 | 6 | separou 4 | **0** | 2 | 2 | +2 → **200** |
| **C5** reserva 4, entregou 2 (`PARCIALMENTE_ATENDIDA`) | 4→2 | 6 | separou 4 | **0** | 2 | 2 | +2 → **200** |
| **C6** reserva 4, +1 livre depois | 5 | 6 | separou 4 | **1** | 2 | 2 | +2 → **200** |
| **C7** sem reserva | 4 | 6 | separou 2 | **2** | 4 | 4 | +3 → **200** |

**Placar: 21/30 ERRADO** (9 CERTO — os três controles × 3). **C4 e C7 não têm reserva nenhuma** — o defeito não é "a
reserva somada de volta": é que **o separado ainda não entregue nunca é descontado**, nem do próprio item nem de ninguém.

### Sonda 2 — várias requisições e vários itens do mesmo material (`e95-sonda-2-varias.js`)

| cenário | certo | medido |
|---|---|---|
| M1 controle: R1 reserva 4 de 4 e separa 4; R2 sem reserva | R2 separável 0, separar 1 → 400 | **CERTO** (0; 400) |
| **M2** R1 e R2 sem reserva (aprovadas sem estoque, 4 chegam soltos); R1 separa 4 | R2 separável 0, separar 4 → 400 | R2 separável **4**, separar 4 → **200**: **8 separados para 4 físicos**. Seguindo: R2 entrega 4 → 200; **R1 entrega a própria caixa → 400** *"… Máximo: 0 (pendente: 4, disponível: 0)"* |
| **M3** R1 sem reserva separa 4 de 4; **R2 criada e aprovada depois** | R2 reserva 0; R1 entrega 4 → 200 | R2 **reserva 4** (`TOTALMENTE_RESERVADA` sobre a caixa de R1); **R1 entrega 4 → 400** — presa com o material separado na mão |
| **M4** mesma requisição, 2 itens do mesmo material, sem reserva, físico 4, **uma** rodada 4 + 4 | 400 | **200** — 8 separados para 4 |
| **M5** o mesmo em duas rodadas (4, depois 4) | item 2 separável 0, 400 | separável **4**, **200** |
| M6 controle: 2 itens, item 1 com reserva 4 de 4, separa 4 | item 2 separável 0 | **CERTO** |

**Placar: 7/10 ERRADO** (3 CERTO — os controles). A hipótese do ponto 2 da 94 (*"o separado sem reserva não fica retido
para outras requisições"*) **está confirmada** — e **não é nova**: a Etapa 60 a declarou (**D (60)**, *"Separado SEM
endereço de outra requisição não sai do 'livre'"*) e a Etapa 64 a pôs no guia como cenário (*"as duas separam 10 (a
separação não reserva)"*). **O M3 (a aprovação reservando a caixa de outra) não está declarado em lugar nenhum** (busca
por "caixa" + "aprova" + "reserv" no documento de novidades: só as linhas da A45, outro assunto). O M4 é um furo da
própria porta: a passada 1 valida cada item contra o mesmo disponível, sem acumular entre itens do mesmo material (a
Fase 5 da 60 dividiu o disponível só na **régua da divergência**, não no teto).

### Sonda 3 — os vizinhos (`e95-sonda-3-vizinhos.js`)

| cenário | resultado |
|---|---|
| **E1** `maxEntregar` "segunda rodada" (`requisitionService.js:55-63`): pede 6, físico 6 (reserva 6), separa 2, entrega 2, **entrega 4 sem separar** | **200 `ENTREGUE`**; o detalhe já oferecia `quantidade_entregavel` 4. **Intencional**: o comentário da Etapa 28 (`:1114-1119`, F2) diz *"para material comum é o comportamento desejado (reposição chegou, entrega direta, sem nova rodada)"*. Registrado como CERTO (é a regra escrita); **não se mexe** |
| E2 o mesmo com material **crítico** | 400 *"material crítico só sai depois de separado e conferido — 4 excede o separado ainda não entregue (0)…"* — CERTO |
| **E3** C169 em material **crítico**: pede 6, físico 4, separa 4, confere (ALMOX2), separa +2 | **200** (ERRADO); a rodada nova limpa a conferência (D3 da 28 — certo). A conferência **não protege**: o conferente vê 6 na caixa para 4 físicos |
| O1 controle 59/60: separa 4 **de A** (todo o saldo), +2 **de A** | 400 *"O saldo em ⟨A⟩ (0) não cobre a quantidade (2) — a saída tiraria de outros endereços"* — CERTO: **com origem no mesmo par a régua da 59 já barra** |
| **O1'** o mesmo, +2 **sem origem** (automático) | **200** (ERRADO) — o C169 passa pelo automático |
| **L1** liberação da inspeção (`reservaChegadaService.reservarLiberacaoParaQuemEspera`, 75): R1 com 4 na caixa **sem reserva** (físico 4), R2 esperando 4 (`AGUARDANDO_ESTOQUE`); entram 2 | os 2 vão para **R1** (hold 2 sobre a caixa), **R2 fica com 0**. Pela régua física, errado (R1 não precisa de mais nada); pela regra escrita, **certo**: `faltaDoItem` (`receiptNotificationService.js:50-65`) diz que *"o separado na caixa NAO desconta"* e que a Fase 5 da 75 **descartou** `pendente − max(hold, separado na caixa)`. **Não se reabre** (C173) |

**Placar: 3/6 ERRADO** pela régua física (E3, O1', L1); **2/6** descontando o L1, que é decisão escrita da 75.

### Sonda 4 — a A46, a caixa fantasma e a conferência (`e95-sonda-4-consulta.js`)

- **A caixa fantasma depois do C169** (físico 4, separado 6): antes de entregar, a fila mostra `["ENTREGAR"]` com
  `entregavel` **4** e o detalhe `quantidade_entregavel` **4** (limitado ao físico — certo). Entregar 4 → 200
  `PARCIALMENTE_ATENDIDA`, item 6/4, físico 0; daí a fila mostra **`["AGUARDANDO_SALDO"]`**, `entregavel` **0**, e o
  detalhe `quantidade_entregavel` **0**. Os 2 "na caixa" **não** são oferecidos — ficam esperando estoque; quando ele
  chega, saem pela "segunda rodada" (E1) **sem separar**.
- **A46** (texto na seção "Letra A"): sobre um banco com C169, M2, M3 e três controles negativos (N1 caixa coerente com
  reserva; N2 caixa sem reserva com físico de sobra; N3 tudo entregue): (a) *caixa > físico* acha **{C169, M2}**; (b)
  *reservado + caixa sem reserva > físico livre* acha **{C169, M2, M3}**; nenhum controle aparece. **CERTO 2/2.**
- **X** recusa de separação (acima do pendente) depois da conferência de crítico: 400 e `conferido_por_id` **intacto**
  (a recusa é na passada 1, antes de gravar). **CERTO** — o ponto 4 da 94 confirmado.

**Placar: 0/3 ERRADO** (é sonda de régua — os três são controles).

### Protótipo da regra (worktree descartável `CRM-e95proto`, removido; diff em `e95-proto.diff`)

Fragmento SQL "caixa sem reserva" (Σ por item ativo do material de `max(0, separado − entregue − reserva ativa do
item)`), a função pura do teto, a porta (com o acumulado da rodada e o retrato do início para a régua da 60), a fila e a
aprovação. **Não** mexeu no detalhe nem no cliente. Resultado das sondas contra o protótipo:

| sonda | `main` | protótipo |
|---|---|---|
| 1 (conta do item) | 21/30 | **7/30** — os 7 são todos "tela maxQtdSeparacao" (a cópia da conta no cliente — T1/T3) |
| 2 (várias) | 7/10 | **0/10** (M3 incluído: R2 reserva 0, R1 entrega 200) |
| 3 (vizinhos) | 3/6 | **1/6** — o L1 (decisão da 75, fora) |
| 4 (régua) | 0/3 | 2/3 "errado" **esperado**: com a regra, a sonda não consegue mais produzir os estados que a A46 acha |

**Suíte do protótipo:** `test:api` **327/329** arquivos — caem **3** casos, todos codificando o comportamento antigo:
1. `filaSeparacao.api.test.js` *"Fase 5 (critico): separado mas o saldo foi embora (outra requisicao levou) — nao e
   ENTREGAR, e AGUARDANDO_SALDO"* — monta o estado separando 10 em A e 10 em B com 10 físicos (o M2); agora o segundo
   `separarRequisicao` recusa (*"… Máximo: 0 (pendente: 10, disponível: 0)"*). **Reescrita:** o estado vira legado (B
   com 10 separados por escritor direto) — o ramo da fila que o teste prova continua existindo para o dado antigo; e um
   caso novo afirma a recusa (RN-01).
2. `separacaoOrigemPorItem.api.test.js` *"RN-01 mesma origem em duas rodadas: a 2a checa o pendente + ela (A:8, 5 + 5
   recusado)"* e 3. *"Fase 5: DOIS itens do mesmo material no mesmo par — o pendente do outro conta (L:7, 5 + 5
   recusado)"* — o material só existe na origem; a recusa continua, mas sai **pelo teto** (*"… Máximo: 3 (pendente: 5,
   disponível: 3)"*) antes da régua da origem. **Reescrita (B474):** dar saldo em **outro** endereço para o teto não
   barrar e a régua da origem seguir provada com a mesma mensagem — não trocar a mensagem esperada.

Os dois testes da Etapa 60 que dependem da conta (`separacaoDivergencia.api.test.js`, *"DOIS itens do mesmo material
dividem o disponivel"* e *"o separado pendente no MESMO par… nao conta"*) **passaram** com o retrato do início da rodada
— a régua da divergência não muda de número nesses cenários. (O comentário *"Separado sem origem de OUTRA requisição não
sai do disponível — a separação não reserva; D (60)"* em `:102` fica obsoleto: a T0 o corrige à vista.)

### Quem usa a conta hoje (lido no código)

| leitor | arquivo:linha | o que faz com a conta | nesta etapa |
|---|---|---|---|
| porta da separação | `requisitionService.js:787-803` (`saldoDisponivelParaItem` → `maxSeparar`) | teto e mensagem | **muda** (T0) |
| régua da divergência (60) | `:791-795`, `:878-892` | `estoque` da régua | **muda** — retrato do início (T0) |
| fila (64) | `:507`, `:534` (`separavel`), `:540` (`entregavel`), `:541` (`disponivel`) | separável/entregável/disponível | `separavel` **muda** (T1); `entregavel` e `disponivel` **não** (B472) |
| detalhe | `routes/almoxarifado.js:3197-3207` (SQL próprio — **quarta cópia** do "reservado para o item") → `normalizarItem` (`requisitionService.js:66-86`) | `saldo_atual`, `quantidade_entregavel` | **ganha** `saldo_separavel` e `quantidade_separavel` (T1); `saldo_atual` não muda |
| aprovação | `reservarItensAprovacao` `:190-193` | `aReservar = min(falta, disponível − jáReservado)` | **muda** (T2) |
| entrega (prévia B464 e laço) | `:1260`, `:1293` | `maxEntregar` | **não muda** (B470) |
| chegada/liberação/estorno (74/75) | `reservaChegadaService.js:348, 483, 557` (`disponivelSql` direto) | teto da distribuição | **não muda** (B475) |
| cliente | `RequisicoesList.js:52-55` (`maxQtdSeparacao`), `:160-170` (`maxSeparavelNaTela`), `:494`, `:685` (pré-preenchimento) | `saldo_atual` | **muda** (T3) |

---

## Decisões reversíveis (letra B do documento de novidades; última usada: B465)

- **B466 — a regra: o separado sem reserva fica retido para quem separou, na separação e na aprovação.** Teto do item =
  `disponível do material + reserva ativa do item − (separado − entregue do item) − caixa sem reserva dos outros itens`,
  separável = `min(pendente de separação, max(0, teto))`. É a conta física (o que está na prateleira e não é de ninguém
  mais) e fecha C1–C7, M2–M5, E3 e O1'. **Descartados:** (i) **só o próprio item** (a conta candidata da 94,
  `disponível + reservado_para_item − (separado − entregue)`) — fecha C1–C7, mas deixa M2, M4 e M5 (8 separados para 4
  físicos por outro caminho) e M3; (ii) **separar exige reserva** — quebra o caminho legítimo da requisição aprovada sem
  estoque cujo material chegou solto (C4, C7; ajuste, devolução, inspeção liberada — a nota cobre só a 74); (iii)
  **separar cria reserva** (a caixa vira retenção no motor) — o mais coerente com o resto do motor, mas escreve reserva
  em toda separação, mexe na 74/75 (`faltaDoItem`), na 76 (status pela reserva), na 77 (reserva só sai pela requisição),
  no cancelamento e na exclusão, e é a menos reversível (dado gravado); (iv) **mudar `disponivelSql`** (descontar a caixa
  no disponível do motor) — 14 leitores (`availabilitySql.js:1-23`), muda saídas avulsas, transferências e inventário.
  Reversível: uma função e um fragmento SQL; desligar é voltar o teto ao disponível.
- **B467 — revoga a D (60) e muda o cenário 5 da Etapa 64.** *"Separado SEM endereço de outra requisição não sai do
  'livre'"* deixa de valer; *"as duas separam 10"* vira *"a segunda é recusada: Máximo: 0"*. O guia e o manual são
  corrigidos **à vista** no fechamento (a frase antiga riscada, com a etapa). **Descartado:** manter a D (60) e corrigir só
  o próprio item — ver B466 (i).
- **B468 — na mesma rodada, itens do mesmo material dividem o teto; a régua da divergência usa o retrato do início.** O
  teto de cada entrada é calculado com o separado **em memória** (o item já mutado pela entrada anterior — inclusive o
  mesmo item duas vezes no payload); a régua da 60 (`reguaDivergencia.estoque`) guarda o teto calculado com o separado
  **de antes da rodada** (mapa `separadoAntes`, molde do `planejadaAntes` da 65), porque a régua já subtrai os outros
  itens da rodada (`totalPorMaterial`) — com o teto em memória, subtrairia duas vezes. **Descartado:** régua com o teto
  em memória (os dois testes da 60 caem: medido no protótipo).
- **B469 — a aprovação não reserva a caixa sem reserva de ninguém.** `aReservar = min(falta, max(0, disponível do
  material − caixa sem reserva de TODOS os itens ativos do material))` (inclui o próprio item: com caixa sem reserva, a
  caixa já cobre parte do pendente). Fecha o M3. **Descartado:** declarar e deixar — a dona da caixa fica presa até
  chegar material (a entrega dela recusa *"Máximo: 0"*), sem nenhum aviso.
- **B470 — a entrega não muda.** Continua `maxEntregar(item, disponível + reserva do item)` e o motor valida
  atomicamente; a "segunda rodada" da Etapa 3 (entregar sem separar depois de uma entrega parcial, só material comum)
  continua (E1). **Descartado:** entrega pelo livre real (descontando a caixa sem reserva das outras) — no legado com
  caixa dupla (M2 antigo: R1 e R2 com 4 cada para 4 físicos) **as duas** passariam a recusar e ninguém entregaria; hoje
  a primeira entrega. A entrega nunca cria caixa fantasma (ela baixa o físico pelo motor); o defeito nasce na separação.
- **B471 — a mensagem de recusa não muda de forma; o `disponível` dela passa a ser o teto do item.** *"⟨material⟩: não é
  possível separar ⟨q⟩ ⟨un⟩. Máximo: ⟨max⟩ (pendente: ⟨p⟩, disponível: ⟨teto⟩)"* — no C1, *"Máximo: 0 (pendente: 2,
  disponível: 0)"* (hoje diria *"disponível: 4"*, e 4 são a caixa dela). **Descartado:** acrescentar *"(na caixa: n)"* —
  muda a literal que testes e integrações casam; fica para quando houver queixa.
- **B472 — contrato aditivo no detalhe; a fila muda só o `separavel`.** O item do `GET /api/almoxarifado/requisicoes/:id`
  ganha `saldo_separavel` (o teto, sem o limite do pendente) e `quantidade_separavel` (`min(pendente de separação,
  saldo_separavel)`), molde do `quantidade_entregavel`; `saldo_atual` **não muda** (a entrega da tela e o "Saldo:"
  dependem dele). Na fila, `separavel` usa o teto; `disponivel` e `entregavel` ficam como estão. **Descartados:** mudar o
  sentido de `saldo_atual` (quebra `maxQtdEntrega` e o aviso de saldo insuficiente da entrega); mudar `disponivel` da fila
  (a linha *"a entregar 4 (entregável agora 4) · disponível 4"* do C1 é coerente: os 4 estão na caixa dela).
- **B473 — quem conta como caixa.** Itens de requisição **ativa** (`COALESCE(ativo,1)=1`) num status de
  `PODE_SEPARAR ∪ PODE_ENTREGAR ∪ {AGUARDANDO_APROVACAO_VALOR}` (este último pelo legado da A45, que tem caixa).
  Cancelada, reprovada, entregue, encerrada ou excluída **não retêm** — a caixa delas volta à prateleira sem movimento (é
  o que o resto do sistema já supõe: a reserva é solta no cancelamento). Constante exportada da máquina de estados
  (`STATUS_COM_CAIXA`), não lista escrita à mão em dois lugares. **Descartado:** só `ativo` (como a régua da origem da
  59, `:836-839`) — uma cancelada com caixa reteria para sempre.
- **B474 — o teto vem antes da régua da origem; os dois testes da 59 mudam de cenário, não de mensagem.** Com o material
  só na origem, a recusa sai pelo teto (*"Máximo: 3…"*) e não pela origem. Os testes ganham saldo em outro endereço,
  para seguirem provando a régua da origem com a mesma mensagem. **Descartado:** conferir a origem antes do teto — a
  mensagem da origem diria *"tiraria de outros endereços"* quando não há outros endereços com o material.
- **B475 — a chegada, a liberação e o estorno (74/75) não mudam.** O L1 (os 2 que chegam vão para quem tem caixa sem
  reserva antes de quem espera) é decisão escrita da Fase 5 da 75 (`faltaDoItem`). Com a B466, o motivo daquela decisão
  (*"o disponível contava a caixa como livre"*) deixa de valer **para a separação e a aprovação**, não para a
  distribuição — reabrir é etapa própria (C173). **Descartado:** `falta = pendente − max(hold, caixa)` aqui — muda o
  e-mail da 70/75 e a ordem de quem leva, sem queixa medida.
- **B476 — sem trava por material na separação.** A conta nova é leitura dentro da trava **por requisição** (93); duas
  separações de requisições diferentes do mesmo material no mesmo instante ainda podem ler o mesmo livre (residual, como
  hoje). O ponto 6 da 94 mandou não pegar a trava por material aqui; mantido. **Descartado:** pegar a trava por material
  (ordem requisição → material é permitida, `requisitionService.js:16`) — muda a fila de espera de todas as separações
  por um caso que pede escritor concorrente; fica declarado em D.

---

## Regras de negócio

Os testes levam o prefixo `[95 RN-xx]`; o manual cita pelo conteúdo. **"Caixa" de um item** = `max(0, separado −
entregue)` (entregue = `COALESCE(quantidade_entregue, quantidade_atendida)`, a régua de `getEntregue`). **"Caixa sem
reserva"** de um item = `max(0, caixa − reserva ATIVA de origem REQUISICAO do item)`. **"Teto"** do item X =
`disponível do material + reserva do X − caixa do X − Σ caixa sem reserva dos outros itens` (B473 diz quais contam).
**"Separável"** = `min(pendente de separação, max(0, teto))`.

- **RN-01 (a separação não passa do que existe para o item)** — separar acima do separável → **400** S2 (literal abaixo),
  nada gravado (nem item, nem rodada, nem status, nem conferência). Cenários (os da sonda 1 e 2, pela **rota**): C1
  (+2 → 400 *"Máximo: 0 (pendente: 2, disponível: 0)"*), C2 (+2 → 400 *"Máximo: 1 (pendente: 3, disponível: 1)"*; +1 →
  200), C3, C4, C5, C6 (+1 → 200; +2 → 400), C7 (+2 → 200; +3 → 400); M2 (R2 separar 4 → 400 *"Máximo: 0 (pendente: 4,
  disponível: 0)"*), M5; E3 (crítico: +2 → 400, `conferido_por_id` intacto). **Guardas (passam antes):** K1–K3, M1, M6.
- **RN-02 (a rodada divide o material entre os seus itens)** — M4: uma rodada com dois itens do mesmo material sem
  reserva, físico 4, 4 + 4 → 400 no **segundo** item (*"Máximo: 0 (pendente: 4, disponível: 0)"*), nada gravado; 2 + 2 →
  200. O mesmo item duas vezes no payload (4 + 1 com teto 4) → 400 na segunda entrada. Com reserva por item (cada item
  com reserva 4, físico 8) 4 + 4 → 200 (cada um usa a sua).
- **RN-03 (a fila e o detalhe dizem o que a porta aceita)** — para cada estado da RN-01/RN-02:
  `fila.itens[].separavel` = `detalhe.itens[].quantidade_separavel` = o maior `q` que a porta aceita (separar esse `q` →
  200; `q + 0,0001`… acima → 400). C1 na fila: `etapas` contém `AGUARDANDO_SALDO` e `ENTREGAR`, **não** `SEPARAR`. M2: R2
  com `["AGUARDANDO_SALDO"]`. Depois de uma entrada de 2 (movimentação) no C1: `SEPARAR` com `separavel` 2.
- **RN-04 (a régua da divergência não muda de número quando a rodada é a primeira)** — os casos da 60 continuam (os dois
  "Fase 5" de `separacaoDivergencia`), e C2 separando 1 (o máximo real) grava `maximo: 1, divergente: false` (hoje: o
  máximo seria 3 e a rodada sairia divergente).
- **RN-05 (a aprovação não reserva a caixa de outra)** — M3 pela rota: R1 com 4 na caixa sem reserva (físico 4); R2
  aprovada → **nenhuma** reserva, status pós-aprovação de sempre (`calcularStatusPosAprovacao` — ver C172); R1 entrega 4
  → 200 `ENTREGUE`. Físico 6 com a mesma caixa → R2 reserva **2** (hoje 4 — também vermelho). **Guarda:** sem caixa nenhuma,
  a aprovação reserva como hoje (K1–K3). **Pelo serviço:** `reservarItensAprovacao` direto devolve `reservas: []` no M3.
- **RN-06 (o que não muda — guardas)** — (a) entrega: C1 depois da rodada recusada, entregar 4 → 200
  `PARCIALMENTE_ATENDIDA`, físico 0, item 4/4 (sem fantasma); E1 (segunda rodada sem separar) → 200 como hoje; E2
  (crítico) → 400 como hoje. (b) origem: O1 (mesmo par) → a mesma mensagem da 59. (c) a liberação da 75 no L1 distribui
  como hoje (B475). (d) o detalhe mantém `saldo_atual` e `quantidade_entregavel` com os valores de hoje.

---

## Contrato (congelado)

### Literais

| id | onde | código | texto |
|---|---|---|---|
| S2 | `PUT /api/almoxarifado/requisicoes/:id/separacao` e o alias `/separar`; `requisitionService.separarRequisicao` | 400 `{ error }` | `` `${material_nome}: não é possível separar ${qty} ${unidade || ''}. Máximo: ${max} (pendente: ${pendenteSeparacao(item)}, disponível: ${teto})` `` — **forma inalterada** (`requisitionService.js:799-802`); muda o número do `disponível` (o teto) e do `Máximo` (B471) |

Nenhuma literal nova. As recusas de antes (S1, origem, lote, série, V403b, 409 V1) continuam, na mesma ordem, **depois**
do teto onde já estavam depois do `maxSeparar`.

### A conta — `server/services/almoxarifado/requisitionService.js` (T0)

- `STATUS_COM_CAIXA` exportado de `requisitionStateMachine.js` (B473).
- `caixaSemReservaSql(materialExpr, exclusao)` — fragmento SQL, **um** construtor: `COALESCE((SELECT SUM(MAX(caixa −
  reserva ativa do item, 0)) FROM itens ix JOIN requisicoes rq … WHERE ix.material_id = ⟨materialExpr⟩ AND ativo AND
  rq.status IN STATUS_COM_CAIXA ⟨exclusao⟩), 0)`. A reserva do item reaproveita a subconsulta de `RESERVADO_PARA_ITEM_SQL`
  (mesmos filtros: `ATIVA`, `REQUISICAO`, `item_requisicao_id`, `material_id`). **Nada de subtração à mão do disponível**
  — a regra de `availabilitySql.js` (o teste `saldoEmTerceiros` varre).
- `tetoSeparacao(disponivelComReserva, caixaDoItem, caixaSemReservaOutros)` — **pura**: `max(0, disponivelComReserva −
  caixaSemReservaOutros − max(0, caixaDoItem))`. Exportada (o cliente não a importa; o teste a usa).
- `saldoDisponivelParaItem(db, item)` devolve, além de `disponivel` e `reservado_para_item` (inalterados — a entrega os
  usa), `caixa_outras_requisicoes` (exclusão `AND ix.requisicao_id <> ?`) e `caixa_todos` (sem exclusão).
- **Porta:** na passada 1, para cada entrada: `teto = tetoSeparacao(disponivel, caixa do item EM MEMÓRIA,
  caixa_outras_requisicoes + Σ caixa sem reserva EM MEMÓRIA dos outros itens desta requisição do mesmo material)` (a
  reserva de cada item vem de `reservado_para_item` de `carregarItensRequisicao`); `max = maxSeparar(item, teto)`; a
  régua da 60 guarda o mesmo cálculo com o separado de **antes** da rodada (B468). A leitura continua fresca
  (`saldoDisponivelParaItem`) dentro da trava por requisição.

### A fila — `listarFilaSeparacao` (T1)

`separavel = podeSep ? maxSeparar(i, tetoSeparacao(i.saldo_disponivel, caixa de i, i.caixa_outros)) : 0`, com
`caixaSemReservaSql('ir.material_id', 'AND ix.id <> ir.id')` como coluna da consulta de itens (uma consulta, sem N+1).
`disponivel`, `entregavel`, `a_separar`, `a_entregar` e as regras de `etapas` **inalteradas** (a etapa sai da conta nova
sozinha: `separavel` 0 com `a_separar` > 0 → `AGUARDANDO_SALDO`, `:547`). Itens do mesmo material na mesma requisição
mostram cada um o seu teto (não divididos — como hoje; a porta divide — ver "O que fica de fora").

### O detalhe — `GET /api/almoxarifado/requisicoes/:id` (T1)

`routes/almoxarifado.js:3197` ganha a coluna `caixaSemReservaSql('ir.material_id', 'AND ix.id <> ir.id') as
caixa_sem_reserva_outros`; `normalizarItem` acrescenta `saldo_separavel = tetoSeparacao(saldo_atual, caixa,
caixa_sem_reserva_outros)` e `quantidade_separavel = min(pendenteSeparacao, saldo_separavel)` **só quando a coluna
veio** (chamador sem ela não ganha os campos — o cliente cai no `saldo_atual`). Aditivo; nenhum campo existente muda.

### A aprovação — `reservarItensAprovacao` (T2)

`aReservar = min(falta, max(0, disponivel − jaReservado − caixa_todos))` (B469). O resto (idempotência da 73,
`algumSeguro`, desfazer na falha, a trava por material da 91) **inalterado**. As três portas de aprovação
(`/aprovar`, `/aprovar-valor`, a automática) passam por aqui — nenhuma muda.

### A tela — `client/src/components/almoxarifado/RequisicoesList.js` (T3)

- `maxQtdSeparacao(item)` = `min(pendente de separação, item.saldo_separavel ?? item.saldo_atual)`.
- `maxSeparavelNaTela(...)`: `livre = (item.saldo_separavel ?? item.saldo_atual) − outrosMesmoMaterial`.
- Pré-preenchimento do modal de separação (`:494` no carregar do detalhe, `:685` no abrir): itens do mesmo material
  **dividem** o separável na ordem do pedido (a regra de `separavelAgoraPorItem`, `:178`) — senão o M4 abre o modal
  com 4 + 4 e a porta recusa.
- A mensagem S2 aparece como qualquer 400 de hoje (o modal fica aberto). `FilaSeparacao.js` não muda (lê `separavel`).

### O que não muda

Entrega (`maxEntregar`, a prévia da B464, o laço, o motor); `saldo_atual` e `quantidade_entregavel`; a régua da origem
(59) e a mensagem dela; a reserva na chegada/liberação/estorno (74/75) e o recálculo (76); `calcularStatusPosAprovacao`;
`disponivelSql`; a trava por requisição (93) e por material (91); a alçada (94); as rotas, permissões e gates.

---

## Técnica dos testes

1. Arquivo novo `server/tests/api/separacaoTetoFisico.api.test.js` (runner próprio, molde da 94): usuários reais por
   header (S, ADMIN, ALMOX, ALMOX2), requisição criada por `POST /api/requisicoes-material` e **aprovada pela rota**;
   saldo solto por `POST …/movimentacoes/v2` `ENTRADA` (nunca nota — a 74 reservaria). Casos `[95 RN-xx]`.
2. Arquivo novo `server/tests/api/separacaoTetoFisicoIntegracao.api.test.js` (T4).
3. Cliente: `client/src/components/almoxarifado/RequisicoesSeparacaoTeto.test.js` (API mockada só na fronteira
   HTTP, contra o contrato acima).
4. Sabotagem só na árvore principal, um controle de cada vez, `perl -0pi` com âncora contada = 1, backup
   `e95-<task>-*.bak` no scratchpad, restauro por cópia com md5 conferido, base **LF** (memórias "harness LF" e "sabotagem
   concorrente"). Mensagens de commit `msg-e95-<task>.txt`.

## Tasks

**Ordem topológica: T0 → T2 → T1 → T3 → T4 → T5.** T0 e T2 são **tronco** (T0: a conta e a porta — regra compartilhada;
T2: a reserva da aprovação — regra da 07). T1 é **galho** (só consome o fragmento e a função da T0) e T3 é **galho de
cliente** (contra o contrato congelado; pode rodar **em paralelo** com T2/T1 — não toca o SQLite). T1 é executada na
árvore principal, **depois** da T2: edita o mesmo arquivo e sabota o mesmo serviço (memória "sabotagem concorrente
contamina a suíte"). Executores **não** marcam este plano; o fio principal marca.

- [ ] **T0 (tronco) — a conta única e a porta da separação (B466, B468, B471, B473, B474).** Contrato "A conta" e S2.
  Teste novo: **RN-01**, **RN-02**, **RN-04**, **RN-06 (a)(b)**. Reescritas declaradas: o caso "Fase 5 (critico)" de
  `filaSeparacao` (estado por escritor direto + o caso da recusa vai para RN-01) e os dois de `separacaoOrigemPorItem`
  (B474); o comentário `separacaoDivergencia.api.test.js:102`. **Vermelho antes:** RN-01 (todos os ERRADO da sonda 1 e 2
  pela porta), RN-02 (M4 200), RN-04 (C2 sai divergente com máximo 3). **Guardas (passam antes):** K1–K3, M1, M6, RN-06.
  **Medir antes e depois, sem edição:** `separacaoDivergencia`, `separacaoComDono`, `separacaoFluxoCompleto`,
  `separacaoNaoRessuscita`, `trocaSeparacao`, `alcadaValorDepoisDaSeparacao*`, `saldoEmTerceiros`, `test:almoxarifado`.
  **Controles (cada um diz qual asserção cai):** (s1) sem o `− caixa do item` no teto → caem RN-01 C1/C2/C3/C5/C6 (200 em
  vez de 400); (s2) sem `caixa_outras_requisicoes` → cai RN-01 M2 (R2 separar 4 → 200); (s3) sem o Σ em memória dos
  outros itens da requisição → cai RN-02 M4 (4 + 4 → 200) e M5; (s4) a caixa do item lida do banco em vez da memória →
  cai RN-02 "o mesmo item duas vezes" (4 + 1 → 200); (s5) régua da 60 com o teto em memória → caem os dois "Fase 5" de
  `separacaoDivergencia` (máximo 3 em vez de 7/4 — medido no protótipo) — controle da B468; (s6) `STATUS_COM_CAIXA` sem
  `PRONTA_PARA_RETIRADA` → cai um caso RN-01 com R1 liberada para retirada (caixa 4) e R2 separando (inclua-o); (s7)
  `caixaSemReservaSql` sem descontar a reserva do item → cai a guarda K1 (reserva 4, separou 2: o teto zera — o
  separado coberto pela própria reserva contado duas vezes).
- [ ] **T2 (tronco) — a aprovação não reserva a caixa de outra (B469).** Contrato "A aprovação". **RN-05** (rota e
  serviço). **Vermelho antes:** M3 (reserva 4; R1 entrega 400) e "físico 6 com a mesma caixa → reserva 2" (hoje reserva 4).
  **Guarda (passa antes):** sem caixa nenhuma → reserva como hoje. **Medir:** `reservaAprovacao*`,
  `aprovacaoReserva*`, `filaLiberacaoAprovacaoCorrida`, `recebimentoReservaChegada*`, `requisicaoGestosConcorrentes*`
  (grep pelo nome no início da task — os nomes aqui são aproximados). **Controles:** (s1) `aReservar` sem `− caixa_todos`
  → cai RN-05 M3 (reserva 4; entrega 400); (s2) `caixa_todos` trocado por `caixa_outras_requisicoes` → cai o caso
  "própria caixa sem reserva re-aprovada" (inclua-o: legado aprovado por valor com caixa, A45 — reserva só o que a caixa
  não cobre).
- [ ] **T1 (galho) — a fila e o detalhe dizem o que a porta aceita (B472).** Contrato "A fila" e "O detalhe". **RN-03**,
  **RN-06 (d)**. **Vermelho antes:** RN-03 em C1–C7, M2, M5 (fila e detalhe acima do que a porta aceita depois da T0).
  **Medir:** `filaSeparacao`, `filaTravaIntegracao`, os testes do detalhe (`requisicoes*`). **Controles:** (s1) fila com
  o `saldo_disponivel` cru → cai RN-03 C1 na fila (2 em vez de 0) e `etapas` com `SEPARAR`; (s2) `normalizarItem` sem
  `quantidade_separavel` → cai RN-03 no detalhe; (s3) a coluna da fila com exclusão `ix.requisicao_id <> ir.requisicao_id`
  (perde os outros itens da mesma requisição) → cai RN-03 M5 na fila (4 em vez de 0).
- [ ] **T3 (galho de cliente) — a tela usa o número do servidor.** Contrato "A tela". Testes de componente: (a) detalhe
  C1 (`saldo_atual` 4, `saldo_separavel` 0, separado 4 de 6) → o item não aparece entre os separáveis do modal e
  **"Confirmar Separação"** fica desabilitado (como no "nada a separar" de hoje); (b) C2 (`saldo_separavel` 1) → o input
  abre com 1 e `max=1`; (c) M4 (dois itens do mesmo material, `saldo_separavel` 4 cada, nada separado) → abre com 4 e 0;
  (d) sem `saldo_separavel` (servidor antigo) → cai no `saldo_atual` (como hoje). **Vermelho antes:** (a)(b)(c).
  **Controles:** (s1) `maxQtdSeparacao` lendo só `saldo_atual` → caem (a)(b); (s2) pré-preenchimento sem dividir → cai
  (c); (s3) sem o `??` → cai (d). **Medir:** `RequisicoesList.test.js`, `RequisicoesSeparacaoDivergencia`,
  `RequisicoesSeparacaoOrigem`, `RequisicoesReabrirSeparacao`, `RequisicoesTrocaSeparacao`; `CI=true` build.
- [ ] **T4 (integração — cruza T0, T1, T2 e o contrato da T3).** Ver a seção abaixo. **Controle:** rodar o arquivo com a
  T2 revertida (s1 da T2) → cai I2; com a T1 revertida (s1 da T1) → cai a asserção de fila do I1.
- [ ] **T5 — fechamento (skill `fechar-etapa`).** Novidades (seção da 95; **C169** marcado resolvido com o hash;
  **C170–C173**; **B466–B476**; **A46**; a **D (60)** riscada à vista com a etapa; D (95); F (95)); specs 05 (a pendência
  do C169 fechada; o "Fica de fora" da 60 sobre o livre riscado), 07 (a aprovação e a caixa sem reserva), 04 (o detalhe
  ganha os dois campos); mapa; guia (cabeçalho, seção da 95 com roteiro clicável, o **cenário 5 da 64 corrigido à
  vista**); manual (separação: o que o "separável" significa; a fila; a aprovação); este plano (execução, Fase 5, retro,
  próxima tarefa).

## Teste de integração — por que a T4 é a única prova de que as partes compõem

A porta (T0), a fila e o detalhe (T1) e a aprovação (T2) leem a mesma conta por **três caminhos** (leitura fresca por
item, coluna SQL da fila, coluna SQL do detalhe). Um erro de exclusão num deles (ex.: excluir pelo item em vez da
requisição) deixa cada task verde sozinha e a tela oferecendo o que a porta recusa. Os cenários:

- **I1 — pela rota, o C169 do começo ao fim:** S cria (pede 6, físico 4) → ADMIN `/aprovar` (reserva 4) → ALMOX separa 4
  → `GET /fila-separacao` (`separavel` 0, `AGUARDANDO_SALDO` + `ENTREGAR`) **e** `GET /requisicoes/:id`
  (`quantidade_separavel` 0, `saldo_atual` 4) → separar +2 → **400 S2** *"… Máximo: 0 (pendente: 2, disponível: 0)"* →
  entregar 4 → 200 `PARCIALMENTE_ATENDIDA`, físico 0, item 4/4 → ADMIN dá entrada de 2 → fila `SEPARAR` com `separavel` 2
  e detalhe `quantidade_separavel` 2 → separar 2 → entregar 2 → `ENTREGUE`, físico 0, reserva `CONSUMIDA`.
- **I2 — pela rota, a caixa sem reserva e a aprovação de outra:** R1 aprovada sem estoque → entrada de 4 → R1 separa 4 →
  R2 criada e aprovada → **nenhuma** reserva; fila de R2 `AGUARDANDO_SALDO`; R2 separar 1 → 400 S2 → R1 entrega 4 → 200
  `ENTREGUE` → entrada de 4 → fila de R2 `SEPARAR` 4.
- **I3 — pelo serviço:** `requisitionService.separarRequisicao(db, R, [4 + 4 do M4], ALMOX)` lança `{ status: 400 }`
  com a literal S2 do segundo item; os dois itens com `quantidade_separada` 0 e nenhuma linha em
  `separacoes_requisicao_almoxarifado`; `listarFilaSeparacao` e `reservarItensAprovacao` chamados direto devolvem os
  mesmos números que as rotas do I1/I2 no mesmo estado.
- **I4 — a fila nunca oferece o que a porta recusa (propriedade):** para cada estado montado nos cenários C1–C7, M2,
  M4, M5 (sem as rodadas de prova), `separar(fila.separavel)` → 200 e, num estado idêntico remontado, `separar(fila
  .separavel + 1)` → 400.

## Avisos (letra C) — a registrar no fechamento

- **C169** → **✅ RESOLVIDO NA ETAPA 95** (hash), dizendo que o defeito era mais largo (sem reserva também; várias
  requisições; vários itens na mesma rodada; a aprovação).
- **C170 — o que muda para quem opera.** A separação recusa o que está na caixa de outra requisição (B467 — o cenário 5
  da 64 deixa de valer); o separável da fila e da tela pode cair para 0 em requisição que antes mostrava "Separar"; a
  mensagem passa a mostrar o teto no `disponível` (B471). **O que fazer:** rodar a **A46** antes do deploy e resolver as
  caixas fantasma (devolver o separado que não existe: *Ajustar Separação* não reduz — a correção é do administrador,
  ver a A46).
- **C171 — o que muda para quem integra.** Detalhe com `saldo_separavel` e `quantidade_separavel` (aditivo); fila
  `separavel` menor; o 400 S2 com outro número; a aprovação reserva menos quando há caixa sem reserva do material.
- **C172 — a aprovação com a caixa de outra pode dar *Aprovado* sem reserva.** `calcularStatusPosAprovacao` ainda lê o
  disponível do motor (que conta a caixa sem reserva como livre): no I2, R2 fica *Aprovado* sem reserva e a fila a
  mostra *Aguardando saldo*. Cosmético e declarado (não escolhe `AGUARDANDO_ESTOQUE`/`COMPRA`).
- **C173 — a chegada e a liberação dão primeiro a quem já tem caixa sem reserva** (L1; decisão da 75, B475). Quem
  espera pode ficar sem a reserva enquanto a requisição com caixa ganha um hold que não precisa. Reabrir é etapa própria.

## O que fica de fora (declarado — e por quê)

- **A entrega** (B470) — inclusive a "segunda rodada" sem separar (Etapa 3; E1) e a entrega de uma requisição levando o
  físico que outra separou **sem** reserva no legado (M2 antigo). A A46 acha o legado.
- **Corrigir o legado** — nenhuma etapa reduz `quantidade_separada` (não há gesto de "devolver da caixa"); a A46 lista e
  o administrador decide (excluir/refazer a requisição). Um gesto de "desfazer separação" é produto novo.
- **A chegada, a liberação, o estorno (74/75), o recálculo (76)** — B475, C173.
- **`calcularStatusPosAprovacao`** — C172.
- **O motor** (`disponivelSql`, `criarReserva`, saídas avulsas, transferência, inventário): uma saída avulsa (movimentação
  manual) ainda pode levar o físico que está na caixa sem reserva — o motor não conhece caixa (B466 iv).
- **Trava por material na separação** — B476.
- **A fila e a tela não dividem o separável entre itens do mesmo material da mesma requisição na linha da fila** — a
  porta divide (RN-02) e o modal pré-preenche dividindo (T3); a linha da fila mostra o teto de cada item.
- **"(na caixa: n)" na mensagem** — B471.

## Letra A — consulta para produção (a confirmar no fechamento como **A46**)

**A46 — requisições com material separado que não existe na prateleira (C169 e o legado da D (60)).** Rodar antes do
deploy. Duas consultas (SQLite de produção; colunas conferidas contra o esquema — `quantidade_em_terceiros` é da 8b):

```sql
-- (a) caixa acima do fisico: o separado ainda nao entregue de todas as requisicoes ativas passa do que existe
SELECT m.id AS material_id, m.codigo, m.quantidade_atual AS fisico,
  SUM(MAX(COALESCE(ir.quantidade_separada,0) - COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0), 0)) AS na_caixa,
  GROUP_CONCAT(r.numero || ' (' || r.status || ')', '; ') AS requisicoes
FROM itens_requisicao_almoxarifado ir
JOIN requisicoes_almoxarifado r ON r.id = ir.requisicao_id
JOIN materiais_almoxarifado m ON m.id = ir.material_id
WHERE COALESCE(r.ativo,1) = 1
  AND r.status IN ('APROVADO','AGUARDANDO_ESTOQUE','AGUARDANDO_COMPRA','PARCIALMENTE_RESERVADA','TOTALMENTE_RESERVADA',
                   'EM_SEPARACAO','PARCIALMENTE_ATENDIDA','PRONTA_PARA_RETIRADA','AGUARDANDO_APROVACAO_VALOR')
  AND COALESCE(ir.quantidade_separada,0) - COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0) > 1e-9
GROUP BY m.id HAVING na_caixa > m.quantidade_atual + 1e-9 ORDER BY m.codigo;

-- (b) reservado + caixa sem reserva acima do fisico livre: acha tambem a aprovacao que reservou a caixa de outra (M3)
SELECT m.id AS material_id, m.codigo, m.quantidade_atual AS fisico, m.quantidade_reservada AS reservado_total,
  SUM(MAX(MAX(COALESCE(ir.quantidade_separada,0) - COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0), 0)
    - COALESCE((SELECT SUM(rs.quantidade - COALESCE(rs.quantidade_utilizada,0)) FROM reservas_material_almoxarifado rs
        WHERE rs.item_requisicao_id = ir.id AND rs.material_id = ir.material_id AND rs.status = 'ATIVA'
          AND rs.origem = 'REQUISICAO'), 0), 0)) AS caixa_sem_reserva
FROM itens_requisicao_almoxarifado ir
JOIN requisicoes_almoxarifado r ON r.id = ir.requisicao_id
JOIN materiais_almoxarifado m ON m.id = ir.material_id
WHERE COALESCE(r.ativo,1) = 1
  AND r.status IN ('APROVADO','AGUARDANDO_ESTOQUE','AGUARDANDO_COMPRA','PARCIALMENTE_RESERVADA','TOTALMENTE_RESERVADA',
                   'EM_SEPARACAO','PARCIALMENTE_ATENDIDA','PRONTA_PARA_RETIRADA','AGUARDANDO_APROVACAO_VALOR')
GROUP BY m.id
HAVING m.quantidade_reservada + caixa_sem_reserva > m.quantidade_atual - COALESCE(m.quantidade_bloqueada,0)
  - COALESCE(m.quantidade_em_inspecao,0) - COALESCE(m.quantidade_em_terceiros,0) + 1e-9
ORDER BY m.codigo;
```

**Conferida na Fase 0** (sonda 4): (a) acha {C169, M2}; (b) acha {C169, M2, M3}; os três controles negativos (caixa
coerente com reserva; caixa sem reserva com físico de sobra; tudo entregue) não aparecem. **Como ler:** cada linha é um
material em que há mais na caixa (a) — ou mais prometido (b) — do que existe. Na (a), as requisições listadas dividem a
falta: a entrega de uma pode deixar a outra sem conseguir entregar. Na (b) sem aparecer na (a), uma aprovação reservou o
que estava na caixa de outra. O fechamento confere de novo contra o esquema e escreve o "o que fazer". (`STATUS_COM_CAIXA`
— a lista do `IN` — é a da B473; se a Fase 2 mudar a lista, mudar aqui.)

## O que contradiz a próxima tarefa escrita na 94

1. **"Causa provável: o disponível do item soma de volta a reserva do próprio item sem descontar o separado-não-entregue"**
   — **incompleta.** C4 e C7 reproduzem o defeito **sem reserva nenhuma**: o separado ainda não entregue não é descontado
   de lugar nenhum (nem do próprio item, nem do material). A reserva só entra porque a conta a soma de volta inteira.
2. **"Conta candidata `max(0, disponível + reservado_para_item − (separado − entregue))`"** — fecha o próprio item (sonda
   1), mas **não** o M2, o M4 e o M5 (sonda 2: 8 separados para 4 físicos por outras requisições ou por dois itens da
   mesma) nem o M3. Escolhida a conta mais larga (B466), com a candidata descartada à vista.
3. **"A hipótese do separado sem reserva — não medida"** — medida: **verdadeira** (M2), mas **já declarada** desde a 60
   (D (60)) e posta no guia pela 64 (cenário 5). Esta etapa a revoga (B467) — não é "achado novo", é decisão nova.
4. **"Mudar a função muda os três — talvez a correção seja só no teto da separação"** — a entrega fica de fora (B470),
   mas a **aprovação precisa mudar**: o M3 (aprovação reservando a caixa de outra e deixando a dona presa) não estava
   declarado em lugar nenhum.
5. **"Entregar 4 → 2 'na caixa' que não existem; a fila e o modal de entrega passam a oferecê-los"** — **não**: depois de
   entregar 4, a fila mostra `AGUARDANDO_SALDO` com `entregavel` 0 e o detalhe `quantidade_entregavel` 0 (sonda 4). Os 2
   fantasmas só são "entregues" quando chega estoque — pela segunda rodada, sem separar.
6. **"Conferir que o detalhe devolve o `saldo_atual` com a conta nova"** — o detalhe **não** passa por
   `carregarItensRequisicao`: tem SQL próprio (`routes/almoxarifado.js:3197-3207`, a quarta cópia do "reservado para o
   item"); e `saldo_atual` **não pode** mudar de sentido (a entrega da tela o usa). Contrato: campo novo (B472).
7. **"A 74/76 conferir que não reserva sobre o separado de outra"** — a distribuição é limitada ao que entrou (teto
   `min(entrou, disponível)`), então não reserva sobre a caixa alheia; mas **dá primeiro a quem já tem caixa sem
   reserva** (L1) — decisão escrita da Fase 5 da 75 (`faltaDoItem`), não defeito novo (B475, C173).
8. **"`maxEntregar` na segunda rodada — medir se é intencional"** — é: o comentário da Etapa 28 (`:1114-1119`) o diz
   desejado para material comum; o crítico barra (E2). Não se mexe.
9. **"Ponto 5 — o caso com origem já está certo (controle)"** — certo **só no mesmo par** (O1); com o automático o C169
   passa (O1').
10. **"Contrato: o 400 existente; decidir o `disponível` da mensagem"** — decidido (B471); e a ordem da recusa muda dois
    testes da 59 (B474) — a 94 não previa testes antigos caindo.

## Próximo passo

**Fase 2** — um agente fresco (sem este contexto) com este plano, a spec 05 e a 07, e as quatro perguntas da skill
(contratos com erro e literal; RN × spec; independência real dos galhos; **cada RN traçada até o último gesto** —
separar → conferir → liberar → entregar → encerrar/excluir, e aprovar → separar → entregar para a RN-05). Pontos que a
Fase 2 deve atacar em especial: (1) o legado com caixa acima do físico depois da etapa — a porta passa a recusar, mas
**algum gesto posterior recusa o que um anterior autorizou?** (ex.: requisição com caixa fantasma na
`PARCIALMENTE_ATENDIDA` que não consegue mais encerrar ou ser excluída); (2) a exclusão da requisição e o cancelamento
(o que acontece com a caixa sem reserva — B473 diz "volta à prateleira"; conferir que nenhum estorno conta a caixa); (3)
a RN-05 nas três portas de aprovação e no `prepararPosAprovacao` (o `calcularStatusPosAprovacao` com a caixa — C172);
(4) a consulta da fila: custo do `caixaSemReservaSql` por linha de item (subconsulta correlacionada dupla) — medir com
a base da suíte e dizer se precisa de índice; (5) `saldoEmTerceiros` — o fragmento novo não pode "escrever a subtração à
mão" (rodar o teste). Corrigir o plano, **depois** executar T0.
