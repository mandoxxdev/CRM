# Etapa 99 — a porta da separação recusa o que não é separável (C197) e a conferência recusa a caixa vazia (C200)

> Status: **FECHADA — 2026-10-15.** Fases 0–6 feitas: T1–T3 `7353265d..3e14653a`, Fase 5 `821fb03b`, `f1041706`, fechamento `481eb653`. **Próxima: Etapa 101** (ver o fim). Worktree `CRM-wt-e99`, branch
> `etapa-e99` (de `main` `5f28c044`). Marcar cada task ao terminar (hash, divergência).
> HEAD de partida: `7b5fd57e` (main, árvore limpa, sem push).
> Origem: "Próxima tarefa detalhada — Etapa 99" no fim de
> `docs/superpowers/plans/2026-10-09-almoxarifado-etapa98-devolver-da-caixa-a-prateleira.md`; C197, C200 (B510).
> **A Fase 0 mediu que a próxima tarefa escrita na 98 erra ou omite em sete pontos** — o booleano que separa 1, a
> gravação parcial (a válida grava e a inválida some), a alçada de valor que grava antes da recusa, a literal que diria
> "maior que zero" com o 0 aceito, o `step` "livre" do modal, o ROUND que o teste de resíduo 1e-10 não prova, e o C200
> que não precisa de devolução — ver "O que contradiz a próxima tarefa escrita na 98".
>
> **Numeração:** etapa única para todos os módulos (esta é a **99**). Letras de `docs/almoxarifado-novidades-por-etapa.md`
> conferidas em 2026-10-09 (`grep -oE` no documento): última **B515**, último C **200**, última **A49**. Esta etapa
> reserva **B516–B523**, **C201–C203** e **A50**.

**Escopo desta etapa (o que a Fase 0 reproduziu — e só isso):**
1. **A forma da entrada da separação** (`PUT /requisicoes/:id/separar` e o alias `/separacao`, e
   `requisitionService.separarRequisicao` chamado direto): quantidade negativa, não numérica, não finita, booleana ou
   objeto; item que não é da requisição (inexistente, de outra requisição, `item_id` nulo ou texto); entrada que não é
   objeto; `itens_separados` que não é lista; fração em material com série — cada um vira **400 com literal** e **nada**
   muda. Hoje: **200** e a requisição é reivindicada para *Em Separação* sem separar (ou, no booleano, separa 1).
2. **Tudo ou nada de verdade:** uma entrada válida com uma inválida no mesmo payload → 400 e a válida **não** grava
   (hoje a válida grava e a inválida é pulada em silêncio).
3. **A ordem:** a recusa de forma vem **antes** da alçada de valor (`verificarBloqueioLiberacao`) e da reivindicação do
   status — *Parcialmente Atendida* continua *Parcialmente Atendida*, e um payload inválido não grava *Aguardando
   aprovação de valor* nem dispara o e-mail dos aprovadores.
4. **A conferência conta a caixa** (C200): `PUT /requisicoes/:id/conferir-separacao` com a caixa vazia (separado =
   entregue) → 400 *"Nenhum item separado"*, a régua da B512 (liberar). E o teste de resíduo passa a provar o `ROUND`
   (no liberar também).

**Fora (declarado, ver "O que fica de fora"):** a criação de requisição que aceita fração de material com série (C202,
porta da feature 04); limpar a conferência no `separar []` (contrato 28 RN-02); recusar item repetido na rodada
(contrato 59/60/95); qualquer mudança de tela (B523).

---

## Fase 0 — medido (2026-10-09)

Sondas no scratchpad da sessão (`C:\Users\User\AppData\Local\Temp\claude\C--Users-User-projetos-CRM\7ead12bf-e959-4c36-bd6b-6614fb9c9bcd\scratchpad`),
harness `e98-h.js` (sobre o `e95-h.js`: `testApp` com `requirePermission` **real**, usuário por header `x-u`); saída
`e99-sonda-*.out` ao lado de cada sonda. **S** sem perfil (fallback `PRODUCAO`) cria pela rota dos outros módulos;
**ADMIN** aprova e movimenta; **ALMOX**/**ALMOX2** (`ALMOXARIFE`) separam, conferem, entregam. Serviço direto:
`requisitionService.separarRequisicao(db, R, itens, {id: 9502, perfil ALMOXARIFE})` e `conferirSeparacao(db, R, {id: 9503})`.

**Detector:** cada linha escreve à mão o esperado e compara (`h.conferir`); o "nada muda" compara o retrato **antes ×
depois** de status, separado do item, rodadas (`separacoes_requisicao_almoxarifado`), trilha `SEPARACAO`
(`auditoria_log_almoxarifado`) e conferência (gravada antes em 77 de propósito, para ver se a entrada inválida a
apaga). **Controle do detector:** um esperado **errado de propósito** — o detector disse ERRADO em s1, s3, s4 e s5 (s2, s2b e s6 têm controle de domínio: a regra que já existe).

### Re-rodadas da 98 (`e99-sonda-s1-separacao-porta.js`, `-s2-conferir-vazia.js`, `-s2b-conferir-vazia.js`) — reproduzem

- **s1: 5/7 ERRADO**, controles 2/2 CERTO — igual à 98 (N1 −2, N2 −1 em *Parcialmente Atendida*, N3 `'abc'`, N4 série
  1,5, N5 item 999999: todos 200 e *Em Separação*).
- **s2: 1/4 ERRADO** — a V1 aparece agora como **409** (a conferência de antes da entrega parcial ainda está gravada —
  `separar []` não a limpa, contrato 28 RN-02 — e o claim recusa por `conferido_por_id IS NULL`): **a V1 da 98 mede o
  claim, não o C200**. V1b, V2 e o controle CERTO.
- **s2b: 1/2 ERRADO** — a V3 (o C200) reproduz: caixa 0 conferida → 200.

### s3 — cada entrada inválida, pela rota e pelo serviço (`e99-sonda-s3-entradas.js`) — **33/48 ERRADO, 15 CERTO**

Montagem: material PC, entrada 4 antes, S pede 4, aprova (*Totalmente Reservada*), conferência 77 gravada à mão.

| linha | via | medido hoje | certo |
|---|---|---|---|
| Q1 −2 | rota, svc | 200; status → **EM_SEPARACAO**; separado 0, sem rodada | 400, nada muda |
| Q2 `"abc"` | rota, svc | idem | idem |
| Q3 `"Infinity"`, `1e400` (JSON cru), `Infinity`, `NaN` | rota, crua, svc, svc | idem | idem |
| **Q4 `true`** | rota, svc | **200, separa 1, grava rodada e trilha, limpa a conferência** (`Number(true)` = 1) | 400, nada muda |
| Q5 `{}`, Q6 `"-1"` | rota | 200, *Em Separação* | 400 |
| T1 `item_id` 999999 | rota, svc | 200, *Em Separação* | 400 |
| T2 item **real de outra requisição** | rota, svc | 200, *Em Separação* (a outra intacta) | 400 |
| T3 `item_id` `null`, `"abc"` | rota | 200, *Em Separação* | 400 |
| T4 item de outra requisição com quantidade **0** | rota | 200, *Em Separação* | 400 |
| F1 `itens_separados` objeto | rota | **500** *"itensSeparados is not iterable"* (nada muda) | 400 |
| F2 `itens_separados` texto | rota | 200, *Em Separação* (itera as letras) | 400 |
| F3 entrada `null` na lista | rota, svc | **500** *"Cannot read properties of null"* (nada muda) | 400 |
| **M1** item A 2 + item B −1 | rota | **200, A separado 2, rodada gravada; B pulado em silêncio** | 400, nada gravado |
| **M2** item A 2 + item 999999 | rota | **200, A separado 2** | 400, nada gravado |
| S1 *Parcialmente Atendida* + −1 | rota | 200 → **EM_SEPARACAO** | 400, *Parcialmente Atendida* |
| S1b *Parcialmente Atendida* + item 999999 | svc | 200 → EM_SEPARACAO | 400, status intacto |
| S2 *Aguardando Estoque* + `"abc"` | rota | 200 → EM_SEPARACAO | 400, status intacto |
| E1 série 1,5 | rota, svc | 200, separado 1,5 (a entrega recusa depois) | 400 |
| E2 série `"1.5"` | rota | 200, separado 1,5 | 400 |
| E6 série, o mesmo item 0,5 + 0,5 | rota | 200, separado 1 | 400 (cada entrada é o que o operador digitou) |
| **A1** alçada de valor armada (custo 5 × 4 = R$ 20, limite R$ 1) + −2 | rota | **403** V403b e **grava *Aguardando aprovação de valor*** (e notifica) | 400, status intacto |
| E7 criar requisição de 1,5 de material com série | rota (outros módulos) | **201** | fora desta etapa (C202) |

**O que continua — [CONTRATO], 15/15 CERTO:** K1 quantidade 0 (rota e svc), K2 `[]` (rota e svc), K3 sem
`itens_separados`, K4 quantidade ausente, `null`, `""` → 200, sem rodada, *Em Separação*, conferência **fica** (28
RN-02); K5 `"2"` → separa 2; K6 o mesmo item 2 + 2 → separa 4 (59/60/95); K7 acima do teto → 400 da 95 e nada muda (a
passada 1 já vem antes da reivindicação); E3 série 1,0000001 → `Q.qtd` arredonda a 1, aceito; E4 série 2 → 200; E5 série
com 0,5 de legado na caixa + rodada inteira 1 → 200 (separado 1,5); X1 requisição excluída → 400 (já recusava).

### s4 — o C200 pela rota e pelo serviço (`e99-sonda-s4-conferir-caixa.js`) — **8/14 ERRADO, 6 CERTO**

| linha | estado (sempre *Em Separação*) | conferir hoje (rota e svc) | certo |
|---|---|---|---|
| C1 (V3 da 98) | crítico: separa 4, confere, entrega 2, devolve 2, `separar []` | 200, conferido | 400 *"Nenhum item separado"*, não grava |
| **C2** | **material comum, sem devolução:** separa 2 de 4, entrega 2, `separar []` | 200, conferido | 400 |
| C3 | C2 + separado 2,0000000001 (escritor de legado) | 200 | 400 |
| C4 | C2 com o entregue só em `quantidade_atendida` (legado) | 200 | 400 |
| K1 caixa 2 | — | 200 | 200 (controle) |
| K2 dois itens, um vazio e outro com 1 | — | 200 | 200 (controle) |
| K3 separado 0 | — | 400 *"Nenhum item separado"* | 400 (a regra que existe) |

**O C200 não precisa da devolução** (C2): entrega parcial + "Separar de novo para conferir"/"Iniciar Separação" já deixa
a *Em Separação* com caixa 0 — é o mesmo estado que o teste da Fase 5 da 98 monta para o liberar.

### s5 — a consulta A50 (`e99-sonda-s5-a50.js`, SQL em `e99-a50.sql`) — 4/4 CERTO

Acha o item de série com 1,5 na caixa (legado); **não** acha série com caixa inteira nem material sem série com fração
(controles); deixa de achar depois de devolver 0,5 à prateleira (98).

### s6 — o `ROUND` que o teste de resíduo não prova (SQLite, medido)

`ROUND(2.0000000001 − 2, 6) > 1e-9` = 0 **e** `(2.0000000001 − 2) > 1e-9` = 0 — o resto 1e-10 é menor que a folga e é
recusado **com ou sem** o `ROUND`. Com 2,0000001 (resto 1e-7): `ROUND` → 0 (recusa), sem `ROUND` → 1 (aceita). **O teste
`[98 RN-03] (Fase 5)` (`devolverSeparado.api.test.js:479-490`) não sabe falhar sem o `ROUND` do liberar** — a régua de
resíduo tem de ficar entre a folga (1e-9) e meia unidade da precisão (5e-7). **Executado** (`e99-sonda-s6-round-liberar.js`,
no protótipo com o `ROUND` do liberar tirado, `routes/almoxarifado.js:3892`): `devolverSeparado.api.test.js` continuou
**verde** (o `[98 RN-03] (Fase 5)` passou), e a sonda deu 1e-10 → 400 (CERTO) e **1e-7 → 200** (ERRADO); no HEAD, 2/2
CERTO.

### Protótipo (worktree descartável `CRM-wt-e99proto`, nunca commitado)

A passada de forma do contrato abaixo (antes da alçada) + a consulta da conferência com a régua da B512:
**s1 7/7, s3 48/48, s4 14/14 CERTO**. `test:api` inteiro no protótipo: ver "Quem cai" abaixo.

### Placar

| sonda | HEAD `7b5fd57e` | protótipo |
|---|---|---|
| s1 (98, a porta) | 5/7 ERRADO | 0/7 |
| s2 (98, conferir vazia) | 1/4 ERRADO (a V1 é o claim, não o C200) | — |
| s2b (98, C200) | 1/2 ERRADO | — |
| s3 (entradas, rota + svc) | **33/48 ERRADO** | 0/48 |
| s4 (C200, rota + svc) | **8/14 ERRADO** | 0/14 |
| s5 (A50) | 0/4 (a consulta funciona) | — |
| s6 (resíduo do liberar) | 0/2 | 1/2 ERRADO com o `ROUND` do liberar tirado (o 1e-7 passa; o 1e-10 não muda) |
| controle do detector | ERRADO de propósito em s1, s3, s4, s5 | idem |

### Quem chama a separação (medido com `grep -rn` em `server/` e `client/src`)

- **Rotas:** `PUT /api/almoxarifado/requisicoes/:id/separacao` e `/separar` → o mesmo `handleSeparacao`
  (`routes/almoxarifado.js:3824-3830`, registradas em `:3847` e `:3849`), que passa `itens_separados || []` ao serviço. Nenhuma outra rota (a de outros
  módulos `requisicoesMaterial.js` não separa; a mobilidade, feature 24, não chama — a próxima tarefa da 98 supunha que
  sim).
- **Tela** (`client/src/components/almoxarifado/RequisicoesList.js`): o modal "Confirmar Separação"/"Reabrir separação"
  (`:713-747`) monta `parseFloat(quantidade || 0)` e **filtra `> 0`** — negativo, texto, item alheio e lista não-lista
  **nunca saem da tela**; "Reabrir separação" com tudo separado manda `[]`. "Separar de novo para conferir" (`:1199-1213`,
  98) manda `[]`. O campo é `type="number" min="0" step="1"` (`:2309`) **para todo material** — digitar 1,5 é possível
  (o navegador não bloqueia o `onChange`), e o 400 do servidor vira toast com o modal aberto (`:755`).
- **Serviço direto:** só testes (`separacaoComDono.api.test.js:215-235` manda 0, `[]` e **item 999999 com 3**).
- **"Conferir separação"** na tela (`:1856`) só aparece com `conferenciaPendente` (crítico com caixa > 0 e sem
  conferência) — a tela **não** oferece conferir a caixa vazia; o C200 se alcança por tela velha ou pela API.
  **[Fase 2: ESTAVA ERRADO** — isso descreve o "Separar de novo para conferir". O "Conferir separação" do detalhe
  (`:1849`) aparece com `!conferencia && algum separado > 0` — o separado acumulado, não a caixa. Ver achado 1 e a T2b.]

### Onde mexer (lido no HEAD `7b5fd57e`)

- `server/services/almoxarifado/requisitionService.js`:
  - `separarSemTrava` (`:871-1248`): depois de `PODE_SEPARAR` (`:893-897`) e **antes** de
    `valueApprovalService.verificarBloqueioLiberacao` (`:899`) — a passada de forma (T1). A passada 1 (`:935-1037`) fica
    como está (o teto da 95 precisa da leitura fresca e já vem antes da reivindicação, K7); o `if (!item) continue` e o
    `if (!(qty > 0)) continue` ficam como defesa (o primeiro fica inalcançável).
  - `conferirSeparacao` (`:549-600`): a consulta `separados` (`:568-570`) passa à régua da B512 (T2).
- `server/routes/almoxarifado.js:3890-3893` (liberar, B512): **não muda** — só ganha o caso de resíduo 1e-7 no teste.

---

## Fase 2 — revisão do plano por agente fresco (2026-10-15) — 1 trava, 3 correções, 4 notas

Revisor fresco com as quatro perguntas da skill (somente leitura; worktree `CRM-wt-e99`, branch `etapa-e99` de
`5f28c044`). Cada achado com o que o plano passou a dizer:

1. **TRAVA — a tela oferece o botão que a T2 passa a recusar (o plano dizia o contrário).** "Conferir separação" no
   detalhe (`RequisicoesList.js:1849`) aparece em *Em Separação* com `!detalhe.conferencia && itens.some(getSeparado > 0)`
   — olha o **separado acumulado**, não a caixa. A linha 156 deste plano ("só aparece com `conferenciaPendente`") **estava
   errada**: aquilo é o "Separar de novo para conferir". No C2 (separa 2, entrega 2, `[]`) e no C1 (a devolução da 98 limpa
   a conferência), o botão aparece e o clique passaria a dar o 400 novo. O "Liberar" ao lado (`:1860`) já segue a caixa
   desde a 98. **Corrigido:** a **B523 cai** — nasce a **T2b (galho da T2, cliente)**: o botão segue `caixaDoItem(i) > 0`,
   molde do `:1860`, com teste jest. O C203 deixa de dizer "a tela não oferece".
2. **Q2 não era "o mesmo comportamento da D5".** A D5 usa `idBruto = entrada && entrada.item_id` (entrada `null` →
   *"Item null …"*); o contrato dizia `String(entrada?.item_id)` (→ *"Item undefined …"*). **Corrigido:** a Q2 usa a
   fórmula da D5, literal e comportamento (B518).
3. **A rota e o serviço divergiam em `itens_separados` falso.** A rota faz `itens_separados || []`: `""`, `0` e `false`
   viravam `[]` (200, *Em Separação*), e o serviço daria Q4. **Corrigido:** a rota passa a `?? []` (só ausente e `null`
   valem `[]`); RN-07 ganha `""`, `0`, `false` → Q4 (B520).
4. **O caminho de saída do C202 não estava traçado até o último gesto.** Pede 1,5 de material com série, separa e entrega
   1 → *Parcialmente Atendida*. "Completar Entrega" abre o modal pré-preenchido com 0,5 (`quantidadesIniciaisSeparacao`)
   → Q3 em toast. Se o operador **zera** o modal, sai `[]` → 200 → *Em Separação* com caixa 0, e dali não há seta para
   encerrar nem cancelar (C195): presa. **Não é regressão** (antes separava 0,5 e travava na entrega). **Decidido:** a
   literal fica; o C202 e o guia dizem a saída ("não zere o modal: feche-o e use **Encerrar** na *Parcialmente
   Atendida*"), e a T3 I2 segue esse caso até o encerramento.
5. (nota) **A T3 I1 chamava de "Separar de novo para conferir" um gesto que a tela não oferece ali** (exige crítico com
   caixa). **Corrigido:** o passo passa a "`[]` pela API (= modal zerado)"; a frase do C2 da s4 idem.
6. (nota) **Literais.** `" "` (só espaço) daria Q1 *"( )"* — hoje `num(" ")` = 0, aceito: **corrigido**, só-espaço vale
   ausente, como `""` (B517). ⟨bruto⟩ sem limite (100 KB voltariam na mensagem): **corrigido**, corta em 40 caracteres
   com `…`. `JSON.stringify` de objeto circular (serviço direto) lançaria: **corrigido**, `try` com `String` de reserva.
   Q2 com `item_id` objeto mostra `[object Object]` — igual à D5, fica. `Number(true)` = 1 casa o item 1: a forma recusa
   `item_id` que não é número nem texto numérico (booleano, objeto, lista) — **diferente da D5**, que aceita `true`;
   declarado na B518.
7. (nota) **Uma leitura dos itens ou duas?** A forma lê `carregarItensRequisicao` antes da alçada; a passada 1 **reusa a
   mesma leitura** (a alçada não muda itens — só a linha da requisição). Uma leitura só.
8. (nota) **`1e400` digitado no modal** (`parseFloat` → Infinity, passa no filtro `> 0`, o `JSON.stringify` manda `null`)
   → o servidor trata como ausente: 200 sem separar. Resíduo antigo da tela; vai como nota no C201, fora do escopo.

Pergunta 3 (independência): a T2 é independente da T1 (só a consulta da conferência e o teste de resíduo; as montagens
usam payloads válidos e `[]`); serial só pela sabotagem no mesmo arquivo. A T2b é galho da T2 (cliente contra o contrato
congelado da conferência). Pergunta 2: só o `rFantasma` de `separacaoComDono` usava payload que a forma recusa (grep).

---

## Decisões reversíveis (letra B do documento de novidades; última usada: B515)

- **B516 — a forma é validada numa passada própria, antes da alçada de valor e da reivindicação.** Depois de `user.id`,
  da requisição existir e do status estar em `PODE_SEPARAR` (as recusas de hoje, na ordem de hoje) e **antes** de
  `verificarBloqueioLiberacao`. Lê os itens (`carregarItensRequisicao`) e o `controle_serie` dos materiais deles; não
  escreve. A A1 mediu que a alçada **grava** *Aguardando aprovação de valor* e dispara o e-mail para um payload que
  nunca separaria — a recusa de forma tem de vir antes dela, não só antes da reivindicação. **Descartados:** (i) validar
  dentro da passada 1 que existe (depois da alçada) — a A1 continuaria; (ii) mover a passada 1 inteira para antes da
  alçada — o teto da 95 lê saldo que a alçada não muda, mas misturar as duas mexe na ordem de recusa de todo payload
  válido acima do teto com a alçada armada (hoje 403, passaria a 400) sem defeito medido; (iii) validar na rota — o
  serviço é chamado direto, e a regra da Etapa 25 exige as duas entradas.
- **B517 — a quantidade: `Q.qtd` decide.** Ausente, `null` e `""` = 0 (Fase 2: e texto só de espaços, que `num` lia 0) (pulado, como hoje: K4); 0 e `"0"` pulados (28
  RN-02); recusa (Q1) o que `Q.qtd` devolve `NaN` (texto não numérico, `Infinity`, `NaN`, booleano, objeto) ou < 0. A
  literal diz que **0 é aceito** ("ou 0 para não separar este item"). **Descartados:** (i) a literal candidata da 98
  *"informe uma quantidade maior que zero para separar"* — mentiria com o 0 aceito (é a da devolução, onde 0 é recusado);
  (ii) recusar 0, ausente ou `null` — muda o contrato da 28 (`rZero`, "Iniciar Separação" com quantidades zeradas) sem
  defeito medido; (iii) duas literais (negativa × não numérica) — a ação do operador é a mesma; (iv) manter `num()` na
  forma — `num(true)` = 1 é o Q4 (separa 1 com rodada e limpa a conferência).
- **B518 — item que não pertence: recusado em qualquer entrada, com a literal D5 da 98.** Inexistente, de outra
  requisição, `item_id` nulo ou texto, **inclusive com quantidade 0** (T4), e entrada que não é objeto (F3, hoje 500) →
  Q2 `Item ⟨item_id⟩ não pertence a esta requisição` (⟨item_id⟩ = o valor recebido, `String(...)`; entrada não-objeto →
  `undefined`, o mesmo comportamento da D5). **Fase 2:** a fórmula passa a ser exatamente a da D5 (`idBruto = entrada && entrada.item_id`; entrada `null` → *"Item null …"*), e o `item_id` tem de ser número ou texto numérico inteiro — booleano, objeto e lista → Q2 (a D5 aceita `true` = 1; aqui não). **Mudança de contrato à vista:** `separacaoComDono.api.test.js:224-226`
  (`rFantasma`: 999999 com 3 → 200 sem rodada) passa a 400 Q2 — editado com comentário *"mudado na Etapa 99 (B518)"*.
  **Descartados:** (i) pular o item alheio com quantidade 0 — a tela nunca manda, e aceitar em silêncio é o próprio C197;
  (ii) literal própria da separação — a D5 já é a frase do módulo para isto.
- **B519 — série: inteiro por ENTRADA, depois do `Q.qtd`.** Material com `controle_serie = 1` e quantidade > 0 não inteira
  → Q3. 1,0000001 arredonda a 1 e passa (E3). O acumulado **não** é checado: o legado com 0,5 na caixa separa uma rodada
  inteira (E5 → separado 1,5), e a fração sai pela devolução da 98 (B510) — a **A50** acha quem tem. 0,5 + 0,5 do mesmo
  item na mesma rodada → Q3 (cada entrada é o que foi digitado). `controle_serie` lido por consulta própria
  (`SELECT id, controle_serie FROM materiais_almoxarifado WHERE id IN (…)`). **Descartados:** (i) o acumulado inteiro —
  prenderia o legado (E5) até devolver a fração, e a entrega já exige inteiro no que **entrega**; (ii) somar as entradas
  do item na rodada (0,5 + 0,5 = 1 aceito) — só por API, a tela manda uma linha por item; (iii) acrescentar
  `ma.controle_serie` em `carregarItensRequisicao` — muda o objeto de todos os chamadores e das respostas que o espalham.
- **B520 — `itens_separados` que não é lista → 400 Q4; ausente ou `null` = `[]`.** **Fase 2:** a rota passa de `itens_separados || []` para `?? []` — `""`, `0` e `false` eram `[]` pela rota (200) e Q4 pelo serviço; agora Q4 nos dois. Hoje objeto → 500 e texto → 200 com a
  reivindicação (F1, F2). A rota continua passando `itens_separados || []`; o serviço confere `Array.isArray`.
  **Descartado:** aceitar um objeto único como lista de um — nenhum cliente manda.
- **B521 — item repetido na rodada continua aceito.** Validado contra o acumulado (59 Fase 5, 60 Fase 2, 95 RN-02 — três
  testes de contrato). **Diferente da devolução** (D6 recusa repetido: lá é um gesto de tirar, com motivo). A forma de
  cada entrada repetida é validada (Q1–Q3 em cada uma). **Descartado:** recusar repetido — quebra três contratos sem
  defeito medido.
- **B522 — a conferência conta a caixa (C200), com a literal de sempre.** `conferirSeparacao` passa à consulta da B512
  (`quantidade_separada > 0 AND ROUND(separado − COALESCE(entregue, atendida, 0), 6) > 1e-9`) e recusa com *"Nenhum item
  separado"* (400). O claim (`claimConferencia`) não muda. **Descartados:** (i) literal nova ("a caixa está vazia") —
  sem contrato de erro novo, a mesma do liberar; (ii) limpar a conferência no `separar []` (V1: a conferência de antes da
  entrega parcial fica sobre a caixa 0) — contrato da 28 RN-02, e inofensivo medido (a próxima rodada limpa, V1b; o
  liberar recusa, V2); (iii) só para material crítico — a conferência de material comum também atestaria nada.
- **B523 — (Fase 2: REESCRITA) a tela muda num ponto só: o "Conferir separação" do detalhe segue a caixa** (`caixaDoItem > 0`, o molde do Liberar da 98), porque o servidor passa a recusar a caixa vazia e o botão olhava o separado acumulado (achado 1). O resto da tela não muda (os motivos abaixo continuam valendo). **Descartado:** deixar o botão e o toast 400 — o botão ofereceria um gesto que sempre falha.
  Texto original: **B523 — a tela não muda.** Medido: o modal filtra `> 0` e só manda itens da requisição (Q1, Q2, T, F nunca saem da
  tela); o campo já é `step="1"` para todo material; a fração digitada em série cai no 400 Q3, que vira toast com o
  modal aberto; o "Conferir separação" só aparece com caixa de crítico. **Descartados:** (i) `step` por `controle_serie`
  no campo — o detalhe não traz `controle_serie` (Etapa 61, `:436`) e o `step="1"` já existe para todos; (ii) teste jest
  do toast — o caminho de erro do modal já é coberto (Etapas 94/95, `RequisicoesSeparacaoTeto.test.js`).

---

## Regras de negócio

Os testes levam o prefixo `[99 RN-xx]`; o manual cita pelo conteúdo. **"Nada muda"** = status, `quantidade_separada` de
**todos** os itens, contagem de rodadas, contagem de `SEPARACAO` na trilha e a conferência gravada (`conferido_por_id`,
`_nome`, `_em`) idênticos antes e depois. **"Montagem"** = material PC, entrada 4, S pede 4, ADMIN aprova (*Totalmente
Reservada*), conferência gravada à mão (77) quando o caso olha a conferência.

- **RN-01 (quantidade inválida é recusada)** — −2, `"abc"`, `"Infinity"`, `1e400` no JSON, `true`, `{}`, `"-1"` pela rota;
  −2, `"abc"`, `Infinity`, `NaN`, `true` pelo serviço → **400 Q1** com a literal inteira e **nada muda**.
- **RN-02 (o que continua aceito)** — 0, `"0"`, ausente, `null`, `""`, `[]`, sem `itens_separados` → 200, `rodada_id` null,
  *Em Separação*, conferência **fica** (28 RN-02); `"2"` → separa 2.
- **RN-03 (item que não pertence)** — 999999, item real de **outra** requisição (a outra intacta), `item_id` `null` e
  `"abc"`, item alheio com quantidade 0, entrada `null` → **400 Q2**, nada muda.
- **RN-04 (série inteira por entrada)** — material com série: 1,5 e `"1.5"` → **400 Q3**; 2 → 200; 1,0000001 → 200
  (separado 1); legado 0,5 na caixa + 1 → 200 (separado 1,5); 0,5 + 0,5 do mesmo item → 400 Q3.
- **RN-05 (tudo ou nada)** — item A 2 + item B −1 → 400 Q1 e A **não** separado (0), sem rodada; item A 2 + item 999999 →
  400 Q2 e A não separado. A ordem das recusas segue a ordem das entradas: a primeira inválida é a que responde.
- **RN-06 (a recusa vem antes da alçada e da reivindicação)** — *Parcialmente Atendida* (separou 4, entregou 2) + −1 →
  400 e **continua *Parcialmente Atendida***; *Aguardando Estoque* + `"abc"` → 400 e continua; alçada armada (custo 5,
  limite 1) + −2 → **400 Q1** (não 403), status intacto, `requer_aprovacao_valor` intacto e **nenhuma** chamada a
  `notificarAprovadoresValor` (espião); a mesma alçada + 4 → 403 V403b como hoje (guarda).
- **RN-07 (`itens_separados` que não é lista)** — objeto → 400 Q4 (hoje 500); texto → 400 Q4 (hoje 200); `""`, `0`, `false` pela rota → Q4 (Fase 2: a rota fazia `|| []`); nada muda.
- **RN-08 (guardas: o que não muda)** — o mesmo item 2 + 2 → separa 4; acima do teto → o 400 da 95 com a literal de hoje;
  requisição fora de `PODE_SEPARAR` → `MSG_STATUS_SEPARAR` **antes** da forma (cancelada + −2 → a literal do status, não
  Q1); sem `user.id` → *"Separação exige usuário identificado"* antes de tudo.
- **RN-09 (a conferência conta a caixa — C200)** — *Em Separação* com caixa 0: crítico depois de devolver (C1), material
  comum sem devolução (C2), resíduo 2,0000001 − 2 (C3', 1e-7 — **não** 1e-10, ver s6), entregue só em
  `quantidade_atendida` (C4) → **400 *"Nenhum item separado"***, conferência **não** gravada, pela rota e pelo serviço.
  Caixa 2 → 200; dois itens com um vazio e outro com 1 → 200; separado 0 → 400 (a de sempre).
- **RN-10 (o resíduo do liberar prova o `ROUND`)** — no teste `[98 RN-03] (Fase 5)`, além do 2,0000000001 (que fica,
  com o comentário corrigido: "abaixo da folga — recusa com ou sem o ROUND"), o caso 2,0000001 → liberar **400 *"Nenhum
  item separado"***.

---

## Contrato (congelado)

### `PUT /api/almoxarifado/requisicoes/:id/separar` e `/separacao` (T1) — muda só a recusa

- **Gate, body e 200:** os de hoje (`separar_emitir`; `{ itens_separados: [{ item_id, quantidade_separada,
  localizacao_origem_id?, lote_id?, motivo_divergencia?, motivo_substituicao? }] }`; `{ success, status: 'EM_SEPARACAO',
  rodada_id, itens_tocados }`). A rota não muda.
- **Ordem em `separarSemTrava` (o novo é o passo 4):** (1) `user.id`; (2) `ultimaRodadaAntes`; (3) a requisição (404) e
  `PODE_SEPARAR` (400 `MSG_STATUS_SEPARAR`); **(4) a passada de forma** — Q4; depois, por entrada, na ordem do payload,
  Q2 → Q1 → Q3; nenhuma escrita; (5) `verificarBloqueioLiberacao` (como hoje); (6) a passada 1 (teto 95, origem 59,
  divergência 60, troca 65 — como hoje); (7) a reivindicação e o resto, como hoje.
- **A passada de forma, por entrada:** `entrada` não-objeto ou `Number(entrada.item_id)` não inteiro ou sem item da
  requisição com esse id → Q2. `bruto = entrada.quantidade_separada`; `undefined`/`null`/`""` → pula (= 0). `q =
  Q.qtd(bruto)`; `Number.isNaN(q) || q < 0` → Q1. `q > 0` e material com `controle_serie = 1` e
  `!Number.isInteger(q)` → Q3.
- **Recusas novas (literais congeladas):**
  - **Q1** 400: `⟨material_nome⟩: quantidade inválida para separar (⟨bruto⟩) — informe um número positivo, ou 0 para não separar este item`
    (⟨bruto⟩ = `typeof bruto === 'object' ? JSON.stringify(bruto) : String(bruto)` — `-2`, `abc`, `Infinity`, `true`, `{}` — **Fase 2:** cortado em 40 caracteres com `…`; `JSON.stringify` que lança cai em `String`)
  - **Q2** 400: `Item ⟨item_id⟩ não pertence a esta requisição` (a D5 da 98; ⟨item_id⟩ = `entrada && entrada.item_id`, a fórmula da D5 — Fase 2)
  - **Q3** 400: `⟨material_nome⟩: material com controle de série exige quantidade inteira na separação (informado: ⟨q⟩)`
    (⟨q⟩ = `Q.qtd`, ponto decimal: `1.5`)
  - **Q4** 400: `Informe os itens separados em lista (itens_separados)`
- **Recusas de hoje, inalteradas:** *"Separação exige usuário identificado"* (400), *"Requisição não encontrada"* (404),
  `MSG_STATUS_SEPARAR` (400), o 403 da alçada (V403a/V403b, com `code`), o 400 do teto da 95, os da origem (59), o 409
  X1 (93) e o 409 V1 (94).

### `PUT /api/almoxarifado/requisicoes/:id/conferir-separacao` (T2)

- Muda só a contagem de `separados` (`:568-570`) para a da B512:
  ```sql
  SELECT COUNT(*) AS n FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? AND quantidade_separada > 0
    AND ROUND(COALESCE(quantidade_separada, 0) - COALESCE(quantidade_entregue, quantidade_atendida, 0), 6) > 1e-9
  ```
  `n = 0` → **400 `Nenhum item separado`** (a literal de hoje). Nenhuma outra recusa muda; a ordem (status → separados →
  quem separou → claim) fica.

### O que não muda

O teto (95), o arredondamento (96), a trava por requisição e por material (93/95), a reivindicação e o desfazer (92), o
compare-and-clear (28/93), a divergência (60), a troca (65), a entrega, a devolução (98), o liberar (só o teste) e a
tela.

---

## Técnica dos testes

Arquivos novos `server/tests/api/separacaoFormaDaEntrada.api.test.js` (T1), `server/tests/api/conferirCaixaVazia.api.test.js`
(T2) e `server/tests/api/separacaoFormaDaEntradaIntegracao.api.test.js` (T3), runner próprio (molde 95–98), `testApp`
com `requirePermission` real e usuário por requisição (middleware `setUser`, header `x-u`, molde `e95-h.js`). Montagem
**pela rota** (S cria, ADMIN aprova, `ENTRADA`, ALMOX separa, ALMOX2 confere); escritor direto só onde o caso é legado
(conferência 77, separado 0,5/2,0000001, entregue em `quantidade_atendida`) e na configuração da alçada (molde
`alcadaValorDepoisDaSeparacao.api.test.js:94-101`). Cada recusa confere **código, literal inteira e "nada muda"** (o
retrato da RN). O espião da RN-06 troca `requisitionValueApprovalService.notificarAprovadoresValor` (exportado de
propósito, Etapa 94 I3) e restaura no `finally`.

---

## Tasks

**Ordem topológica: T1 → T2 → T3 → T4.** T1 é **tronco** (muda a porta da separação, que T3 consome). T2 é **galho**
pela regra (a conferência não depende da forma da separação), mas roda **serial na mesma árvore** depois da T1: as duas
sabotam `requisitionService.js`, lido pela suíte inteira (memória "sabotagem concorrente contamina a suíte"), e são
pequenas demais para pagar uma worktree. T3 é a integração (cruza T1, T2 e a devolução da 98, pela rota **e** pelo
serviço). T4 fecha. **Fase 2: nasce a T2b (galho da T2, cliente)** — o "Conferir separação" do detalhe segue a caixa
(B523 reescrita). Arquivo diferente (`client/`), contrato congelado (a literal da conferência) — roda em paralelo à T3.

- [x] **T1 (tronco) — a passada de forma da separação (B516–B521).** Contrato "separar". Testes `[99 RN-01]` a
  `[99 RN-08]`, RN-01/03/05 pela rota **e** pelo serviço; RN-06 com o espião. **Edição declarada:**
  `separacaoComDono.api.test.js:224-226` — `rFantasma` passa a esperar 400 Q2 (comentário *"mudado na Etapa 99 (B518)"*);
  o resto daquele teste (0, `[]`, conferência fica) não muda. **Medir antes de editar:** `test:api` inteiro no HEAD e com
  a T1 aplicada — a Fase 0 mediu no protótipo (ver "Quem cai"). **Vermelho antes:** RN-01, 03, 04, 05, 06, 07 (as RN-02 e
  RN-08 são guardas: verdes antes e depois). **Controles positivos (cada um diz a asserção que cai):**
  - (s1) a passada de forma **depois** da reivindicação → cai RN-06 "*Parcialmente Atendida* continua" (status vira
    *Em Separação*) e o "nada muda" da RN-01;
  - (s2) a passada de forma depois de `verificarBloqueioLiberacao` (antes da reivindicação) → cai **só** RN-06 alçada
    (403 em vez de 400, *Aguardando aprovação de valor* gravado, espião chamado);
  - (s3) `num()` no lugar de `Q.qtd` na forma → cai RN-01 `true` (separa 1) e `"abc"` (vira 0, pulado, 200);
  - (s4) sem o `continue` de ausente/`null`/`""` → cai RN-02 "quantidade ausente/null/'' → 200";
  - (s5) `Number.isInteger(bruto)` em vez de `Number.isInteger(q)` → cai RN-04 "1,0000001 → 200";
  - (s6) a série checada sobre o acumulado (`separado + q`) → cai RN-04 "legado 0,5 + 1 → 200";
  - (s7) checar o item só quando `q > 0` → cai RN-03 "item alheio com quantidade 0";
  - (s8) sem `Array.isArray` → cai RN-07 (objeto: 500; texto: 200);
  - (s9) a passada de forma validando item a item **dentro** da passada 1 com `continue` (como hoje) → cai RN-05 "A não
    separado".
  **Feito — `7353265d` (2026-10-15).** `separacaoFormaDaEntrada.api.test.js` 21/21 (12 vermelhos no HEAD; RN-02, RN-04
  "2 e 1,0000001", "legado 0,5 + 1", "sem série 1,5" e RN-08 guardas verdes antes e depois). `separacaoComDono` 11/11 com
  o `rFantasma` editado. **Divergências:** (1) a passada de forma lê `carregarItensRequisicao` uma vez, antes da alçada,
  e a passada 1 reusa a leitura (Fase 2, nota 7); (2) as correções da Fase 2 entraram na T1 (fórmula D5, `?? []` na
  rota, só-espaço = ausente, corte de 40, `JSON.stringify` protegido) com dois testes a mais; (3) o s9 do plano virou
  "forma desligada" (o efeito de "validar dentro da passada 1 com `continue`" é o HEAD). **Controles (medidos, cada um
  derruba a asserção nomeada):** s1 forma depois da reivindicação → 14 caem pelo "nada muda" (status vira
  *Em Separação* — o desfazer da 92 não roda, a recusa fica fora do `try`); s2 depois da alçada → só a RN-06 alçada (403);
  s3 `num()` → RN-01 "abc" (rota e svc), RN-05 svc, RN-06 aguardando, o corte de 40; s4 sem o `continue` → RN-02 "item
  sem quantidade" (Q1 *undefined*); s5 `isInteger(bruto)` → RN-04 "1,0000001"; s6 acumulado → RN-04 "legado 0,5 + 1"; s7
  item só com q > 0 → RN-03 "outra requisição com 0" e "entrada número"; s8 sem `isArray` → RN-07 (500 e 200); s9
  desligada → 14 caem; s10 rota `|| []` → RN-07 Fase 2; s11 só-espaço → RN-02; s12 sem corte → RN-01 Fase 2; s13
  `item_id` booleano/lista aceito → RN-03, **pela lista `[id]`** — o caso `true` não cai neste banco (o item 1 é de
  outra montagem; `true` casaria o item 1 só se ele fosse da requisição): a asserção do `true` fica sem prova própria,
  declarado. `test:api` 343/344 (o único vermelho: o teste da T2, ainda não implementada).

- [x] **T2 (galho, serial depois da T1) — a conferência conta a caixa (B522) e o resíduo do liberar (RN-10).** Contrato
  "conferir-separacao". Testes `[99 RN-09]` pela rota **e** pelo serviço; `[99 RN-10]` acrescentado ao teste `[98 RN-03]
  (Fase 5)` de `devolverSeparado.api.test.js` (o caso 2,0000001; o comentário do 2,0000000001 corrigido **dizendo que
  ele não provava o ROUND**). **Vermelho antes:** RN-09 C1–C4 (C3' com 1e-7); RN-10 é verde antes (o `ROUND` do liberar
  existe) — a prova dele é o controle (s1b). **Controles positivos:**
  - (s1) a conferência sem o `ROUND` → cai **só** RN-09 C3' (1e-7); C1, C2, C4 seguem vermelhos→verdes;
  - (s1b) o liberar sem o `ROUND` (`routes/almoxarifado.js:3892`) → cai RN-10 2,0000001 — e o 2,0000000001 **não** cai
    (registrar a medida no plano: é a prova de que o teste da 98 era vazio para o `ROUND`);
  - (s2) `COALESCE(quantidade_entregue, 0)` sem `quantidade_atendida` → cai RN-09 C4;
  - (s3) a consulta de antes (`quantidade_separada > 0`) → cai RN-09 C1, C2, C3', C4.
  **Feito — `b8e16e4c` (2026-10-15).** `conferirCaixaVazia.api.test.js` 6/6 (5 vermelhos antes); `devolverSeparado` 40/40
  com o RN-10. **Controles:** s1 conferência sem `ROUND` → só C3 (1e-7); s2 sem `quantidade_atendida` → só C4; s3 a
  consulta de antes → C1, C2, C3, C4 e "o documento anda"; **s1b liberar sem `ROUND` → cai o `[98 RN-03] (Fase 5)` no
  passo 2,0000001** (PRONTA em vez de 400) — o 1e-10 sozinho não caía (s6 da Fase 0): o teste da 98 era vazio para o
  `ROUND`, agora não é.

- [x] **T2b (galho da T2, cliente — nasce na Fase 2) — o "Conferir separação" do detalhe segue a caixa (B523).**
  `RequisicoesList.js:1849`: `getSeparado(i) > 0` → `caixaDoItem(i) > 0` (molde do Liberar, `:1860`). Teste jest
  `[99 RN-09]`: *Em Separação* com separado 2 e entregue 2 → o botão **não** aparece (e o "Ajustar Separação" aparece —
  a metade positiva); separado 2, entregue 1 → aparece. **Controle:** voltar a `getSeparado` → cai o "não aparece".
  **Feito — `c9087106` (2026-10-15).** Jest 39/39 no arquivo. **Controle:** voltar a `getSeparado` → 1 cai (o "não
  aparece" com caixa 0); restaurado por cópia, md5 conferido.

- [x] **T3 (tronco, integração) — o documento até o último gesto, pela rota e pelo serviço.**
  - **I1 crítico pela rota:** S pede 4; aprova; entra 4; ALMOX separa −2 → 400 Q1, *Totalmente Reservada*; separa 4 →
    200; ALMOX2 confere; entrega 2 → *Parcialmente Atendida*; separa `[{ item, −1 }]` → 400 Q1 e continua *Parcialmente
    Atendida* (a fila ainda a mostra); devolve 2 (98) → caixa 0; `[]` pela API (= o modal zerado; Fase 2: o "Separar de novo para conferir" não aparece ali) → *Em
    Separação*; ALMOX2 confere → **400 *"Nenhum item separado"*** (C200); liberar → 400 *"Nenhum item separado"* (B512);
    ALMOX separa 2 → 200; ALMOX2 confere → 200; entrega 2 → *Entregue*. A trilha tem 2 `SEPARACAO`, 1 devolução, 2 saídas.
  - **I2 série pela rota:** material com série, entra 2 (séries), S pede 2, aprova; separa 1,5 → 400 Q3; separa 2 →
    200; entrega 2 com as séries → *Entregue*. **Legado:** separado 0,5 escrito à mão numa requisição de 2 → a A50 acha;
    separa 1 → 200 (1,5); entrega 1 com uma série → 200; devolve 0,5 → a A50 não acha; separa 1 → 200; entrega 1 →
    *Entregue*.
  - **I3 alçada pela rota:** alçada armada; separa `[{ A, 2 }, { B, −1 }]` → 400 Q1, status e `requer_aprovacao_valor`
    intactos, espião zero; separa `[{ A, 4 }]` → 403 V403b (a alçada vale para o válido).
  - **I4 pelo serviço** (`requisitionService.separarRequisicao`/`conferirSeparacao` direto, sem `app`): o I1 do separa −2
    ao confere vazio, com as mesmas literais; entrada `null` → 400 Q2 (não `TypeError`).
  - **Controles:** (s1) desfazer a T1 → cai I1 no primeiro passo (200 e *Em Separação*); (s2) desfazer a T2 → cai I1 no
    confere vazio (200); (s3) a forma depois da alçada (o s2 da T1) → cai I3. Cada recusa com a literal **inteira**.
  **Feito — `3e14653a` (2026-10-15).** `separacaoFormaDaEntradaIntegracao.api.test.js` 6/6 **de primeira** (I1, I2 série,
  I2 legado + A50, **I2 C202 até o encerramento** — achado 4 da Fase 2, I3, I4). **Controles:** sem a T1 → 5 de 6 caem
  (I2 legado fica: só usa entradas válidas); sem a T2 → I1 e I4 no conferir vazio; forma depois da alçada → só I3.

  **Fase 4 (integração serial, árvore `3e14653a` antes do commit — mesma árvore):** `test:api` **345/345** arquivos (EXIT
  0); `test:almoxarifado` **44/44**; `test:validation` 4/4, `test:safealter` 3/3, `test:sqlite` 5/5 (concorrência);
  client jest **1502/1502** (96 suítes); `CI=true react-scripts build` EXIT 0. Sem worktree de galho: a T2b (cliente)
  rodou na mesma árvore porque não toca o servidor nem sabota o que a suíte do servidor lê.

- [x] **T4 — fechamento (skill `fechar-etapa`).** **Feito — `481eb653` (2026-10-15)** (a Fase 5 em `821fb03b`, `f1041706`;
  ver "Fase 5" abaixo). Divergência: entrou a **B524** (regressão da Fase 5) e a T2b; a spec 05 corrigida à vista.
  Novidades (B516–B523, C201–C203, A50; **C197** e **C200** anotados como
  resolvidos; a **B510** ganha "a porta que produzia a fração fecha na 99"; a B512 ganha a nota do resíduo (RN-10)),
  spec **05** (a separação recusa a forma inválida; a conferência conta a caixa; **corrigir à vista** o
  `README.md:705` — *"a separação aceitava quantidade negativa em silêncio (200, nada mudava — C197)"* **estava errado**:
  o status mudava para *Em Separação*, s3), spec **04** (o C202, a criação aceita fração de série), o mapa, guia do
  usuário (Antes → Agora: *"mandar −2 ou um item de outra requisição respondia 'Separação registrada' e mudava o
  status"* → *"a separação recusa com a explicação e nada muda"*; roteiro: separar 1,5 de material com série → toast;
  conferir uma *Em Separação* vazia por tela velha → toast), manual do sistema, próxima tarefa detalhada. Os cinco
  comandos de teste com o resultado real.

### Quem cai (medido no protótipo — `test:api` inteiro, HEAD × protótipo)

- **HEAD `7b5fd57e`:** `342/342 arquivos de teste OK` (EXIT 0).
- **Protótipo** (a passada de forma do contrato + a conferência na régua da B512): `341/342` (EXIT 1). Cai **um** teste,
  o previsto: `separacaoComDono.api.test.js` — *"[RN-02] rodada sem item efetivo nao gera linha, mas o status vira
  EM_SEPARACAO (e a conferencia fica): Item 999999 não pertence a esta requisição"* (10 passed, 1 failed). É a edição
  declarada da T1 (B518). Nenhum teste da conferência caiu (nenhum conferia caixa vazia esperando 200).

---

## Teste de integração — por que a T3 é a prova de que as partes compõem

A forma (T1) muda a porta que **três** gestos usam depois — a devolução da 98 (que esvazia a caixa), o "Separar de novo
para conferir" (`[]`) e a conferência (T2) — e a alçada de valor (94) que fica no meio do caminho. Cada porta certa
sozinha não prova o documento: só seguindo *separar inválido → separar → conferir → entregar parcial → separar inválido
em Parcialmente Atendida → devolver → separar `[]` → conferir vazio → liberar → separar → conferir → entregar* se vê que
nenhum gesto posterior recusa o que o anterior deixou, e que a recusa nova não prende ninguém. A RN-06 depende de
**ordem** dentro do serviço (forma → alçada → reivindicação) — o cenário pela rota **e** pelo serviço é a prova.

---

## Avisos (letra C) — a registrar no fechamento

- **C201** — a separação passa a **recusar** (400, com a explicação) o que antes respondia *"Separação registrada"* sem
  separar: quantidade negativa, texto, item que não é da requisição, lista que não é lista, fração de material com
  série. Pela tela nada disso saía (o modal só manda números > 0 dos itens da requisição) — **exceto a fração em série**,
  que agora vira toast. Quem integra pela API e mandava itens alheios ou zerados de outro jeito vê o erro. Nota (Fase 2):
  `1e400` digitado no modal vira `null` no JSON e o servidor lê como ausente — 200 sem separar (resíduo antigo da tela).
- **C202** — a **criação** de requisição aceita fração de material com série (E7: pedir 1,5 → 201). A separação leva só
  inteiros; o 0,5 que sobra nunca separa — a saída é encerrar a *Parcialmente Atendida*. **Fase 2 (traçado até o último gesto):** "Completar
  Entrega" abre o modal pré-preenchido com 0,5 → toast Q3; se o operador **zera** o modal, sai `[]` e a requisição vai
  a *Em Separação* com a caixa vazia, de onde não há seta para encerrar nem cancelar (C195) — presa. A orientação é
  **fechar o modal e Encerrar na *Parcialmente Atendida***. Não é regressão (antes separava 0,5 e travava na entrega). Porta da feature 04, fora desta
  etapa.
- **C203** — conferir uma *Em Separação* com a caixa vazia passa a recusar *"Nenhum item separado"* (antes gravava a
  conferência sobre nada). A conferência gravada **antes** de uma entrega parcial continua sobre a caixa vazia até a
  próxima rodada (contrato 28 RN-02 — inofensivo: a rodada limpa, o liberar recusa). **Fase 2:** a tela oferecia o
  "Conferir separação" sobre a caixa vazia (olhava o separado acumulado) — a T2b faz o botão seguir a caixa.

---

## O que fica de fora (declarado — e por quê)

- **A criação que aceita fração de série** (C202) — outra porta (feature 04, `requisitionCreateService`), outro contrato
  (o solicitado), sem estado preso medido (encerra).
- **Limpar a conferência no `separar []`** (B522 (ii)) — contrato 28 RN-02.
- **Recusar item repetido na rodada** (B521) — contrato 59/60/95.
- **A tela** (B523) — nada a mudar medido.
- **C195** (*Em Separação* vazia que quem pediu não cancela) — seta nova com recálculo de reserva; etapa própria.
- **Material inativo na separação** — não medido como defeito (o item já pertence à requisição aprovada; a inativação
  do material é cadastro, feature 01).

---

## Letra A — consulta para produção (a confirmar no fechamento como **A50**)

**A50 — requisições com caixa fracionária em material com série.** A entrega exige inteiro e escolhe séries; a caixa de
1,5 só sai até 1, e o 0,5 fica preso. Até a 99 a separação produzia isso (C197/E1); depois dela, só o legado. A saída é
devolver a fração à prateleira (98). Opcional — rodar uma vez depois do deploy:

```sql
SELECT r.id AS requisicao_id, r.numero, r.status, ir.id AS item_id, m.codigo, m.nome,
       ir.quantidade_separada AS separado,
       COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0) AS entregue,
       ROUND(COALESCE(ir.quantidade_separada, 0) - COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0), 6) AS caixa
  FROM itens_requisicao_almoxarifado ir
  JOIN requisicoes_almoxarifado r ON r.id = ir.requisicao_id AND COALESCE(r.ativo, 1) = 1
  JOIN materiais_almoxarifado m ON m.id = ir.material_id AND COALESCE(m.controle_serie, 0) = 1
 WHERE r.status IN ('APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA', 'PARCIALMENTE_RESERVADA',
                    'TOTALMENTE_RESERVADA', 'EM_SEPARACAO', 'PARCIALMENTE_ATENDIDA', 'PRONTA_PARA_RETIRADA',
                    'AGUARDANDO_APROVACAO_VALOR')
   AND ROUND(COALESCE(ir.quantidade_separada, 0) - COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0), 6) > 0.000001
   AND ROUND(COALESCE(ir.quantidade_separada, 0) - COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0), 6)
       <> CAST(ROUND(COALESCE(ir.quantidade_separada, 0) - COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0), 6) AS INTEGER)
 ORDER BY r.id, ir.id;
```

A lista de status é `STATUS_COM_CAIXA` (`requisitionStateMachine.js:111`) — mudou lá, muda aqui (a A46 da 95 tem a mesma
nota). Medida na s5 (4/4). A T3 (I2) roda o texto deste plano.

---

## O que contradiz a próxima tarefa escrita na 98

1. **"O modal … usa `step` livre"** — errado: o campo é `type="number" min="0" step="1"` para **todo** material
   (`RequisicoesList.js:2309`). Não há `step` por série a acrescentar (B523).
2. **"Tirar o `ROUND`, cai só o caso de resto 1e-10"** — errado: 1e-10 está abaixo da folga (1e-9) e é recusado **com ou
   sem** o `ROUND` (s6). O caso que separa as duas é um resto entre 1e-9 e 5e-7 (2,0000001). **Consequência:** o teste
   `[98 RN-03] (Fase 5)` do liberar não sabe falhar sem o `ROUND` — a T2 acrescenta o caso (RN-10).
3. **A literal candidata *"informe uma quantidade maior que zero para separar"*** — contradiz o próprio ponto de atenção
   "quantidade 0 continua aceita": diria ao operador que 0 é inválido. A Q1 diz "ou 0 para não separar este item" (B517).
4. **"A recusa vem antes de mudar o status"** — incompleto: tem de vir antes da **alçada de valor** também. A
   `verificarBloqueioLiberacao` roda antes da passada 1 e **grava** *Aguardando aprovação de valor* + e-mail para um
   payload inválido (A1, medido) (B516).
5. **Os quatro casos da 98 (negativo, texto, item alheio, fração de série)** — faltavam quatro: o **booleano `true`
   separa 1** com rodada e conferência limpa (Q4); a **gravação parcial** — a entrada válida grava e a inválida é pulada
   (M1/M2, a "tudo ou nada" da Etapa 28 só valia para o que a passada 1 recusava); `itens_separados` objeto e entrada
   `null` → **500** (F1/F3); texto → 200 (F2).
6. **"O C200 … V3 (crítico, devolve 2)"** — o C200 não precisa da devolução nem de crítico: material comum, separa 2,
   entrega 2, `separar []` → conferir 200 (s4 C2). E a **V1** da 98 não mede o C200 — mede o claim (409, conferência já
   gravada).
7. **"Quem mais chama: a mobilidade (feature 24)"** — não chama: só as duas rotas (`/separar`, `/separacao`) e a tela
   (modal, "Separar de novo para conferir", "Reabrir separação" → `[]`).

Confirmado como escrito: `separacaoComDono.api.test.js:~229` (é o `:226`) muda de 200 para 400; 0 e `[]` continuam; a
regra de série pela rodada (B519 — "por entrada", a forma mais estrita de "rodada"); a conferência na régua da B512 com
a literal de sempre; o claim não muda.

**A spec 05 estava imprecisa** (`README.md:705`): *"a separação aceitava quantidade negativa em silêncio (200, nada
mudava — C197)"* — o status mudava (*Reservada*/*Aguardando*/*Parcialmente Atendida* → *Em Separação*), s3. Corrigir à
vista no fechamento (T4), dizendo que estava errado.

---

## Próximo passo (escrito na Fase 1 — cumprido)

**Fase 2** — revisão do plano por um agente fresco (skill `desenvolver-etapa-almoxarifado`, Fase 2) com as quatro
perguntas: as literais Q1–Q4 cobrem os casos medidos? As RN batem com a spec 05 e com o contrato da 28 (RN-02)? A T2 é
independente da T1 de verdade? **Cada RN seguida até o último gesto** — em especial: depois da recusa nova, *Parcialmente
Atendida* ainda encerra, a *Em Separação* vazia ainda separa e a fila ainda a mostra, e a tela que manda `[]` ("Separar
de novo para conferir", "Reabrir separação") não cai em nenhuma recusa nova.

---

## Fase 5 — revisão adversarial do código (2026-10-15) — 1 regressão real, 9 testes que faltavam

Dois revisores frescos em worktrees próprias (`CRM-wt-e99rv1`, `CRM-wt-e99rv2`, HEAD `4e697218`, junction de
`node_modules`), achado só com sonda executada.

- **Revisor 1 (RN, fluxo até o último gesto, autorização) — 1 achado REAL, reproduzido na minha árvore.**
  `conferenciaObrigatoria` (`requisitionService.js:496` — a régua que a fila, o detalhe, o liberar e a entrega usam para
  exigir a segunda conferência) media a caixa **crua** `(separado − entregue) > 0`; a T2 fez a conferência medir a caixa
  **arredondada**. Crítico com resto de legado (separado 2,0000001, entregue 2), *Em Separação*, sem conferência: fila
  `["CONFERIR"]` com `posso_conferir`, conferir 400 *"Nenhum item separado"*, liberar 400, entregar 400 C3, encerrar 400
  (sem seta), devolver 1e-7 400 — **presa**; antes da 99 a conferência aceitava (sonda no HEAD de antes: 200). **Esta
  regressão é da própria etapa e o plano não a previu:** a RN-09 mediu o resíduo na conferência e não olhou a outra
  régua que decide se ela é exigida — a pergunta 4 da Fase 2 ("o gesto posterior aceita o que o anterior aceitou?")
  não foi feita para a **fila**. Consertado em `821fb03b` (**B524**): as três réguas são `Q.qtd(separado − entregue) >
  1e-9`. Teste `[99 RN-09] (Fase 5) critico com resto …` (fila sem CONFERIR, detalhe sem obrigatória, a metade positiva
  SEPARAR, o controle 1e-6 ainda obrigatório). **Controle:** voltar à régua crua → cai o teste pela fila
  `["SEPARAR","CONFERIR"]`. Sondado e passou (rv1): `item_id` texto, `"1,5"` (Q1), `" 2 "`, ±1e-7, os envios vazios da
  tela, listas malformadas, a ordem perfil (403) → 404 → status → forma, os únicos chamadores (as duas rotas; a tela).
- **Revisor 2 ("o teste passaria com a feature quebrada?") — 20 sabotagens, 9 verdes; 7 viram teste, 2 equivalentes.**
  Lacunas de uso normal: a série lida pelo material de **outro** item (todo RN-04 usava requisição de um item) e a
  ordem Q2 → Q1 dentro da linha. Mais: `"1,5"`, `item_id` fracionário, o corte 40/41, o serviço com `null`, o `ROUND` de 5
  casas na conferência (C3 só usava 1e-7), e no cliente o botão com o entregue só em `quantidade_atendida`, com o resto
  2,0000001 e com a menor caixa real. `f1041706`. **Medido:** cada sabotagem do revisor (S1c, S3, S5, S6, S11, S12, S15,
  C1, C2, C3) derruba agora o teste nomeado; o C3 (`caixaDoItem > 1e-3`) **não** caía com a fixture 0,5 que escrevi
  primeiro — trocada para 2,000001 − 2, e aí cai. **Sem teste (mutações equivalentes nos dados possíveis):** `> 0` em vez
  de `> 1e-9` depois do `ROUND` (o resto é 0 ou ≥ 1e-6) e o entregue só por `quantidade_atendida` (a entrega grava as
  duas iguais).

**Verificação depois da Fase 5 (árvore `f1041706`):** `test:api` **345/345** (EXIT 0); `test:almoxarifado` **44/44**;
`test:validation` 4/4; `test:safealter` 3/3; `test:sqlite` 5/5; client jest **1504/1504** (96 suítes); `CI=true
react-scripts build` EXIT 0.

---

## Retro de 4 números

- **Rodadas de correção até verde:** 1 por task (nenhum teste ficou vermelho em duas rodadas). A Fase 5 custou uma
  rodada de código (B524) e uma de teste (a fixture do C3 que não sabia falhar; o estoque esgotado no teste de dois
  itens).
- **Achados de revisão:** Fase 2 — 8 (1 trava, 3 correções, 4 notas), **todos reais** (aceitos e incorporados). Fase 5 —
  rv1: **1 real** (reproduzido), 0 ruído; rv2: 9 sabotagens verdes → **7 reais** (viraram teste) e **2 ruído** (mutações
  equivalentes).
- **Paralelismo:** 0 galho de código em worktree (T1/T2 seriais por sabotarem o mesmo arquivo; a T2b, cliente, na mesma
  árvore sem conflito). Em paralelo de fato: a revisão do plano × a escrita dos testes da T1, a suíte do cliente × a do
  servidor, os dois revisores da Fase 5 (worktrees próprias) × o agente da documentação. **Retrabalho:** o teste da T1
  ganhou as correções da Fase 2 depois de escrito (barato: 3 linhas).
- **Defeito que escapou:** nenhum medido na Etapa 101 (as duas revisões da 101 sondaram a forma da separação e a conferência pelo caminho — sem achado da 99). *(Preenchido na Etapa 101.)*

---

## Próxima tarefa detalhada — Etapa 101 (a 100 foi da frente de Compras)

**Tema: a *Em Separação* vazia tem saída (C195), e a criação de requisição recusa fração de material com série
(C202).** As duas pontas do mesmo beco: hoje uma *Em Separação* sem nada na caixa (o "Iniciar Separação" sem quantidade,
a devolução de tudo à prateleira, o modal zerado na *Parcialmente Atendida*) **não encerra nem cancela** —
`TRANSICOES.EM_SEPARACAO` = `['PRONTA_PARA_RETIRADA', 'PARCIALMENTE_ATENDIDA', 'ENTREGUE', 'AGUARDANDO_APROVACAO_VALOR']`
(`requisitionStateMachine.js`). Com a 99, o C202 (pedir 1,5 de série) leva o operador direto a ela se ele zerar o modal.

**Fase 0 — medir antes de prometer (nada disto está medido):**
1. Os caminhos até a *Em Separação* vazia: com **nada entregue** (Iniciar Separação; separar tudo e devolver tudo) e
   **com entregue** (entrega parcial + `[]`; devolução depois de entrega parcial). Para cada um: o que quem pediu, o
   almoxarife e o administrador conseguem fazer (cancelar pelos outros módulos, `PUT /api/almoxarifado/requisicoes/:id/
   cancelar` — só o solicitante ou o admin do sistema, `routes/almoxarifado.js:4156`; encerrar
   `PUT …/:id/encerrar` — `aprovar_requisicao`, `:4021`; excluir — só o administrador).
2. A criação com fração de série: `requisitionCreateService.js` (o laço `itensQtd`, ~`:206`, só recusa `!(q > 0)`), o
   `RequisicaoSchema` (Zod) e **todas** as portas que gravam `quantidade_solicitada` (criar, enviar o rascunho, editar
   itens se existir — `grep -rn "quantidade_solicitada" server/routes server/services`). A tela de criação: o `step` do
   campo e se ela conhece `controle_serie` do material.
3. Quem lê `CANCELAVEIS_OUTROS_MODULOS` (`requisitionStateMachine.js:119`) e o espelho do cliente
   (`requisicaoLabels.js`, `STATUS_CANCELAVEIS_OUTROS_MODULOS`) — a paridade tem teste.

**Contrato candidato (a Fase 1 decide; registrar as alternativas na letra B):**
- **Cancelar a *Em Separação* vazia sem nada entregue:** seta `EM_SEPARACAO → CANCELADO` **só** com caixa 0 e entregue 0
  em todos os itens (régua `Q.qtd(separado − entregue) > 1e-9` da B524 e `getEntregue = 0`), solta as reservas
  (`reservationService.liberarReservasDaRequisicao`), sob a trava por requisição (hoje os cancelamentos ficam **fora**
  dela — B450; a separação reivindica com `WHERE status IN PODE_SEPARAR`, e `CANCELADO` não está lá — conferir a corrida
  separar × cancelar de novo, C164/C149). Decidir se entra em `CANCELAVEIS_OUTROS_MODULOS` (quem pediu) ou só no
  almoxarifado.
- **Encerrar a *Em Separação* vazia com algo entregue:** seta `EM_SEPARACAO → ENCERRADA` só com caixa 0 (ou voltar a
  *Parcialmente Atendida*) — e o `encerrar` (`:4021`) já valida pela máquina. Pensar no C174 (entregue > 0, sem físico).
- **C202:** a criação (e o envio do rascunho) recusa quantidade não inteira de material com `controle_serie = 1`, com a
  frase no molde da Q3 da 99; o rascunho já gravado com fração — decidir se o envio recusa (provável) e consulta A para
  o que já existe (requisições abertas com `quantidade_solicitada` fracionária de material com série).

**Pontos de atenção:**
- A régua da caixa é **uma só** desde a B524 — `conferenciaObrigatoria`, `conferirSeparacao`, o liberar (`routes:3890`) e
  a tela (`caixaDoItem`). Qualquer regra nova de "caixa vazia" usa a mesma, ou a 99 se repete.
- A recusa de forma da separação (99) vem **antes** da alçada; um cancelamento novo não pode deixar *Aguardando aprovação
  de valor* gravada (a alçada é `verificarBloqueioLiberacao`, que escreve).
- A trava por requisição não é reentrante; o cancelamento chamando liberação de reserva pega a trava por material
  dentro dela (ordem requisição → material, a permitida — CLAUDE.md, "Trava por material").
- Teste de integração pela rota **e** pelo serviço, seguindo o documento até *Cancelado*/*Encerrada* e conferindo que a
  reserva saiu e a fila não mostra mais a requisição.

**O que já está pronto e não precisa reabrir:** a forma da separação (Q1–Q4, B516–B521), a conferência e o liberar na
régua da caixa (B512, B522, B524), a devolução à prateleira (98), a A50.
