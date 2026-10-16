# Almoxarifado — Etapa 130: o item que entrou não muda pela nota, e as leituras de usuário (plano)

> Origem: "Próxima tarefa detalhada — Etapa 130" do plano da 129. Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-16-almoxarifado-etapa130-o-item-que-entrou-e-as-leituras-de-usuario-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-16): última B **B837**, último C
> **C268**, última A **A77**. Esta etapa: **B838+**, **C269+**, **A78+**. Worktree `CRM-wt-e130`, branch `etapa-e130` (a partir da main
> `44bcefac`).
>
> **Ordem da skill:** este plano é revisado (Fase 2) por um agente fresco **antes** de qualquer código de produção.
>
> **Fase 2 (um revisor fresco, sondas `e130rev2-l8*.js`, não versionadas, sob a trava): 4 Important + 4 Minor, todos aceitos — antes
> de qualquer código de produção.** **I1** — o caminho que a L8 mandava seguir (estorno + Entrada manual) numa nota **contra pedido**
> reabre o pedido (`pendente`, aparece em `?pendentes=1`, aceita uma segunda nota), volta a solicitação a `VINCULADO` e libera a reserva
> de quem esperava (requisição em `AGUARDANDO_COMPRA` com o material livre no estoque); o relançamento da nota recompõe tudo, mas na nota
> parcial (o único estado em que a L8 dispara) ele recusa *"Nota fiscal … já lançada"* → a L8 diz a consequência; os efeitos vão para a
> **C269**. **I2** — o caminho tem dois passos com perfis diferentes (estorno `ajustar_estoque`: Administrador/Gestor; Entrada
> `movimentar`: Administrador/Almoxarife) — só o **Administrador** faz os dois → a L8 nomeia o Administrador. **I3** — com material
> crítico o estorno recusa (em inspeção: *"decida a inspeção antes"*; com reprovado: permanente) → declarado (C269, D (130)). **I4** — a
> tela não recarrega o detalhe quando o *Processar* falha no meio (a nota parcial nasce assim): o item que entrou ficava com os campos
> abertos → o `catch` de `processarNota` recarrega o detalhe (RN-07 d). **M5** — mais um leitor depois da entrada: as etiquetas do
> recebimento (`etiquetasPdf.js`, lote/validade/séries do item) → na tabela do design. **M6** — a L8 dizia "já foram criados" para o
> item que entrou sem lote, e a L9 "o custo já foi calculado" para o unitário 0 (o motor não toca no custo) → as duas literais reescritas
> para o que é verdade nos dois casos. **M7** — (a) a ordem entre itens fica **por item, na ordem do payload** (cenário: item 1 com valor,
> item 2 com quantidade → L9); (b) a régua `parseFloat(v) || null` vale **dos dois lados** (o gravado texto legado `'10,50'` não recusa o
> eco) e o total **calculado** pelo comando (`qtd × unit`) não é "informado" (cenário: eco com quantidade 2, unitário `'10'`, total 0 →
> 200, total fica 0); `conferencia_quantidade`/`conferencia_descricao` continuam aceitos no item entrado (ninguém lê — D (130)).
> **M8** — a T2 consome a **regra** da T1 (a lista de campos recusados, RN-01..RN-04), congelada aqui.
>
> **Trava de máquina:** `scratchpad/e130-lock.sh` (diretório `maquina-testes.lock`, o mesmo da 129). Um arquivo de teste de servidor
> por vez, inclusive os revisores; nunca `test:api` junto com o jest nem dois `test:api`.

## Regras de negócio

**C267 — o item que entrou não muda pela nota (feature 08).** Testes: `server/tests/api/fiscalItemEntrado.api.test.js` (RN-01..RN-07,
pela rota e pelo serviço) e `server/tests/api/fiscalItemEntradoIntegracao.api.test.js` (RN-08); a mudança à vista em
`conferenciaDepoisDaEntrada.api.test.js` (`[RN-09 F5 r3-C5]`); a tela em
`client/src/components/almoxarifado/RecebimentosItemEntrado.test.js` (RN-07).

"Item entrado" = item **deste** recebimento com `entrada_estoque_em` não nulo. "Informado" = a chave presente com valor diferente de
`undefined`/`null` (para unitário e total: `parseFloat(v) || null` não nulo — a régua do comando, em que 0, `''` e ilegível valem "não
informado").

A ordem das recusas em `salvarDadosFiscal` (todas **antes** de qualquer gravação — cabeçalho, itens, trilha, NC, aviso): 404 → status
fora dos permitidos (400, como hoje) → validação do número (`normalizarRecebidasDoPayload`, 400) → marca viva com itens (409 L3, B835)
→ **por item, na ordem do payload**: quantidade (409 L7, RN-09 da 129) → **RN-01/RN-02** (409 L8) → **RN-03** (409 L9) → NF duplicada →
excedente → gravações.

- **RN-01 — o lote do item entrado só aceita o eco.** `lote`, `data_validade_lote`, `data_fabricacao_lote`, `corrida_lote` informados e
  diferentes do gravado depois da normalização → 409 **L8**. Texto: `String(v).trim()`, NULL gravado = `''`. Datas: os 10 primeiros
  caracteres quando casam `AAAA-MM-DD`; `DD/MM/AAAA` vira `AAAA-MM-DD`; senão o texto aparado. Cenários: (a) lote `L-NOVO` sobre
  `L-ORIG` → 409, nada gravado (nem cabeçalho, nem o outro item que vinha antes no payload); (b) eco `'L-ORIG '`, validade
  `'2027-01-31T00:00:00.000Z'` e `'31/01/2027'` sobre `2027-01-31`, corrida igual → 200; (c) `lote: ''` sobre NULL → 200; `lote: ''`
  sobre `L-ORIG` (apagar) → 409; (d) preencher lote num item entrado **sem** lote (NULL → `L1`) → 409; (e) só a fabricação diferente
  → 409; (f) só a corrida → 409.
- **RN-02 — as séries do item entrado só aceitam o eco.** `series` informada e o **conjunto** diferente → 409 **L8**. Conjunto: lista
  (array), texto JSON de lista (`'["S1","S2"]'`) ou texto uma por linha (`\n` ou `\r\n`); cada uma aparada, vazias fora, ordenado.
  Cenários: `'S2\r\nS1\n'` e `["S1","S2"]` sobre `'S1\nS2'` → 200; `'S1\nS3'` → 409; `'S1'` (tirar uma) → 409; `''` sobre `'S1\nS2'` → 409.
- **RN-03 — o valor unitário e o total do item entrado só aceitam o eco.** `valor_unitario`/`valor_total` informados (régua do
  comando) e `|informado − gravado| > 1e-6` (gravado NULL = 0) → 409 **L9**. Cenários: unitário 99 sobre 10 → 409; `'10'` e `10.0000001`
  sobre 10 → 200; unitário 0, `''`, `null`, `'abc'` → 200 e o gravado fica; total 198 sobre 0 → 409; total 0 sobre 25 → 200 (0 = não
  informado); unitário 5 sobre 0 (preencher o que não tinha valor) → 409. *(Fase 2 M7)* a régua vale dos dois lados: gravado `'10,50'`
  (texto legado) e eco `'10,50'` → 200; o eco da tela com quantidade 2, unitário `'10'` e total 0 sobre total 0 → 200 e o total fica 0
  (o `qtd × unit` que o comando calcula não é "informado").
- **RN-04 — ICMS, IPI e redução do item entrado continuam aceitos** (B839, ninguém os lê depois da entrada). Cenário: ICMS 7, IPI 3,
  redução 12 no item entrado → 200, gravados. (Era o `[RN-09 F5 r3-C5]` da 129 com o unitário; o unitário passa a recusar — à vista.)
- **RN-05 — o que não muda.** O item **não** entrado da mesma nota continua editável em tudo (lote, séries, valores) e o `/processar`
  seguinte o leva com os valores novos; o item de **outro** recebimento no payload continua ignorado (200, nada gravado para ele); o
  payload sem itens (só cabeçalho) continua 200; a quantidade (L7) continua vindo antes (item com quantidade e lote diferentes → L7).
- **RN-06 — a defesa no comando.** No `UPDATE` do item, as sete colunas `lote`, `data_validade_lote`, `data_fabricacao_lote`,
  `corrida_lote`, `series`, `valor_unitario`, `valor_total` = `CASE WHEN entrada_estoque_em IS NULL THEN COALESCE(?, col) ELSE col END`.
  Cenário com gancho em `db.run` (o item ganha `entrada_estoque_em` imediatamente antes do `UPDATE` dele, sem marca de processamento):
  lote, séries, unitário e total mudados no payload ficam os gravados; ICMS do payload grava (a coluna não é defendida).
- **RN-07 — a tela trava o que a guarda recusa** (B840). Painel de detalhe, status `EM_ENTRADA_NF`/`ENCAMINHADO_FATURAMENTO`, item com
  `entrada_estoque_em`: os campos *Vlr. unit.*, *Lote*, *Validade*, *Fabricação*, *Corrida* e o *Séries* (quando aparece) ficam
  `disabled`, e aparece a frase `Já deu entrada no estoque — lote, séries e valor unitário não mudam mais por aqui.`; *ICMS* e *Red.
  ICMS %* continuam habilitados; o item **sem** entrada continua com tudo habilitado e sem a frase. O *Salvar* dos dados fiscais manda o
  eco (o `api.put` recebe o lote gravado do item entrado). (d) **Fase 2 I4:** o *Processar* que falha recarrega o detalhe — o item que
  entrou antes da falha aparece travado sem fechar e abrir o painel.
- **RN-08 — integração (rota e serviço).** Nota real com A (controle de lote e série, 2) e B (1): fluxo até o faturamento → `/fiscal`
  com lote, validade, corrida, séries e unitário 10 → `/processar` com o motor **falhando no item B** (gancho no `INSERT` da movimentação
  de B) → nota parcial real (A entrou, B não, `EM_ENTRADA_NF`). Então: o eco exato que a tela monta (`GET /recebimentos/:id` → os 14
  campos de cada item) → 200; lote/série de A trocados → 409 L8 **pela rota e pelo serviço** (`receiptService.salvarDadosFiscal`);
  unitário de A → 409 L9 (rota e serviço); ICMS de A → 200; o unitário de B → 200; o `/processar` seguinte dá entrada de B e fecha
  `PROCESSADO`; o lote 1 continua `L-ORIG`, as séries S1/S2, o custo médio 10 e o `ultimo_custo_entrada` 10. E o caminho da L8: estorno
  da entrada de A (`POST /movimentacoes/:id/cancelar`) + Entrada manual (`/movimentacoes/v2`) com o lote e as séries certos → 200/201.
  E a **A78** contra um estado legado montado por SQL (lote do documento ≠ lote do estoque, validade diferente, lote preenchido sem
  `lote_id`, série do documento sem a série do item) — acha os quatro e não acha o item limpo.

**B841 — as leituras de usuário (núcleo).** Teste: `server/tests/api/leituraDeUsuarios.api.test.js` (RN-09..RN-12), com um banco
SQLite de verdade (DDL de produção das tabelas lidas) e as rotas **registradas pelo módulo de produção**.

- **RN-09 — `GET /api/usuarios/:id`:** gerente (`canManageUsers`: super administrador ou `role = 'admin'`) → 200 com o cadastro (como
  hoje) e 404 `Usuário não encontrado` no id inexistente; o **próprio** (`String(req.user.id) === String(req.params.id)`) → 200; outro
  qualquer (inclusive `admin_modulos: ['almoxarifado']` e perfil Administrador do almoxarifado) → 403 **L10**, também para id
  inexistente (não revela existência).
- **RN-10 — `GET /api/usuarios/:id/grupos`:** a mesma regra; o próprio recebe `{ grupos, permissoes, usuario }` como hoje (o
  `permissionsCache`); o outro, 403 L10.
- **RN-11 — `GET /api/usuarios` (lista):** gerente → a forma de hoje (com `role`, `is_superadmin`, `admin_modulos`, `grupos`,
  `modulos`…); os outros → cada linha só com `id`, `nome`, `email`, `ativo` (nenhuma outra chave), mesma ordem, `limit`/`offset` como
  hoje.
- **RN-12 — a fiação.** O `index.js` registra as três rotas **pelo módulo** (`registrarLeituraDeUsuarios`, uma vez), depois de
  `/api/usuarios/por-modulo/:modulo` e antes de `app.post('/api/usuarios'`; nenhum `app.get('/api/usuarios/:id'` sobra no `index.js`;
  `getUsuarioModuleContext` vem do módulo (o `buildAuthUserPayload` do login continua usando a mesma). Teste estático sobre o texto do
  `index.js` (o `index.js` não sobe em teste) + o teste das rotas registradas pelo próprio `registrarLeituraDeUsuarios`.

## Contrato congelado

**`PUT /api/almoxarifado/recebimentos/:id/fiscal`** — payload e 200 `{ success: true }` inalterados. Recusas novas (literais exatas):

- 409 **L8** = `Item já deu entrada no estoque — o lote e as séries dele ficaram registrados no estoque com o que a nota tinha na entrada e não mudam mais pela nota; para corrigir o estoque, o Administrador do almoxarifado estorna a entrada e dá a entrada de novo (o documento da nota continua como entrou, e o pedido de compra e a reserva de quem esperava voltam a esperar)`
- 409 **L9** = `Item já deu entrada no estoque — o valor unitário e o total dele não mudam mais: a entrada no estoque já foi feita com o valor que a nota tinha`

`receiptService.salvarDadosFiscal` lança os mesmos (`{ status: 409 }`); `LITERAIS_CONFERENCIA` ganha `LOTE_SERIE_JA_ENTROU` e
`VALOR_JA_ENTROU`.

**`GET /api/usuarios/:id`**, **`GET /api/usuarios/:id/grupos`** — 403 **L10** = `Acesso negado — apenas o próprio usuário ou administradores do sistema`.
**`GET /api/usuarios`** — 200; para quem não gerencia usuários, `[{ id, nome, email, ativo }]`.

`services/leituraDeUsuarios.js` exporta `registrarLeituraDeUsuarios(app, { getDb, authenticateToken })`, `podeLerUsuario(user, id)`,
`projetarListaDeUsuarios(user, linhas)`, `getUsuarioModuleContext(db, userId, cb)`, `LITERAL_LEITURA_USUARIO`.

**A78** — consulta somente leitura (texto no documento de novidades, o mesmo SQL no teste da RN-08).

## Tasks (sort topológico)

- [x] **T1 — tronco (serviço do recebimento)** — `assertItemEntradoIntacto` (a quantidade da 129 + RN-01..RN-03) e o comando (RN-06)
  em `receiptService.js`; `fiscalItemEntrado.api.test.js`; a mudança à vista do `[RN-09 F5 r3-C5]`.
- [x] **T2 — galho (tela)** — `RecebimentosAlmoxarifado.js` (RN-07) + `RecebimentosItemEntrado.test.js`. Consome só o campo
  `entrada_estoque_em` que o `GET /recebimentos/:id` já devolve (`ri.*`).
- [x] **T3 — integração** — `fiscalItemEntradoIntegracao.api.test.js` (RN-08, rota **e** serviço, a A78).
- [x] **T4 — galho (núcleo)** — `services/leituraDeUsuarios.js` + `index.js` + `leituraDeUsuarios.api.test.js` (RN-09..RN-12). Outra
  regra, outro arquivo: independente de T1..T3; serializada pela regra "um teste por vez".
- [x] **T5 — fechamento** — novidades (B838+, C267 resolvida — e o "o que fazer" dela, que mandava à tela de Lotes/Séries, **estava
  errado**: não há gesto ali que corrija lote ou série —, C269+, A78, D (130), F (130), a seção da etapa, cabeçalho), specs 08 e 23 (a
  B836/B841), mapa, guia, manual, este plano (retro, "Próxima tarefa detalhada — Etapa 131"), o "defeito que escapou" da retro da 129.
  CLAUDE.md: a trava **não** muda (o `/fiscal` não pega a trava por material; recusa no comando).

Sem migração (nenhuma coluna, nenhuma tabela): a prova de primeiro boot não se aplica.

## Execução — o que aconteceu

- **Fase 0** — sonda `e130fase0.js` (não versionada, sob a trava): a C267 reproduzida pela rota com uma nota real (lote, séries e valor
  do item entrado mudados → 200; o estoque com o da entrada; o painel do comprador com 99); o *Regularizar séries* recusa trocar série
  (o "o que fazer" da C267 **estava errado**); o estorno + Entrada funciona. A varredura de quem lê o item depois da entrada (o design). A
  instrumentação da suíte inteira (um `require` temporário de `scratchpad/e130/instr.js`, `test:api` **435/435** com o log, restauro
  por cópia, md5 `26e16a9c…` antes e depois): **3** chamadas do `/fiscal` com item entrado, todas no teste da 129 (2 ecos, 1 muda à
  vista). As leituras de usuário medidas por um agente de exploração (7 chamadores no client; nenhum teste de servidor).
- **Fase 2 antes do código de produção:** 4 Important + 4 Minor, todos aceitos (ver o topo). Os testes T1, T2 e T4 foram escritos e
  rodados **vermelhos** antes do código (10/12, 2/3 e o módulo inexistente); os que passavam eram controles (o que não muda).
  Design e plano `2e809982`.
- **Divergências da execução:** (1) a L8 e a L9 mudaram duas vezes — na Fase 2 (o caminho e o perfil; as frases que afirmavam fato
  falso) e na Fase 5 (o documento continua como entrou); (2) o `catch` do *Processar* recarregar o painel entrou pela Fase 2 (I4) e virou
  "atualizar só os itens que entraram" na Fase 5 (r1 M1); (3) o enriquecimento do usuário desativado (B842) não estava no plano — entrou
  pela Fase 5 (r2), anterior à etapa, porque derrubava o portão novo; (4) a T4 moveu as três rotas e o `getUsuarioModuleContext` do
  `index.js` para `services/leituraDeUsuarios.js` (o plano previa; o boot com pasta vazia foi conferido: login, lista, `/:id`,
  `/:id/grupos`, `/comercial`, `/por-modulo` 200).
- **Controles positivos** (âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia — `scratchpad/e130/bateria.js`):
  **40** antes da Fase 5 (T1..T4) e **14** das correções da Fase 5 — **todas** caem pelo cenário certo.
- **Migração:** nenhuma (sem coluna, sem tabela) — a prova de primeiro boot não se aplica; o boot com pasta vazia foi rodado mesmo assim
  pela mudança do `index.js`.
- **CLAUDE.md:** a seção da trava **não mudou** — o `/fiscal` não pega a trava por material (recusa no comando) e não põe saldo no
  disponível. **Compras:** nada.
- **Suíte antes dos commits de código T1..T4:** `test:api` **438/438**; `test:almoxarifado` **44/0**; `test:validation` 4/0,
  `test:safealter` 3/0, `test:sqlite` 10/0; client **127** suítes / **1748** testes; `CI=true build` *Compiled successfully*. Commits
  `7b70b969` (T1), `c9411c4c` (T2), `b5cd7d7a` (T3), `e6553429` (T4).
- **Fase 5** — três revisores frescos em paralelo sob a **trava de máquina**; o de sabotagem numa worktree própria (`CRM-wt-e130-r3`,
  removida com as junções desfeitas antes). Eu não rodei nada enquanto eles trabalhavam.
  - **Regra (r1): 1 Important + 3 Minor, todos reais.** **I1 (reproduzido, `e130r1-l8caminho`)** — depois do caminho da L8 o documento
    fica com o texto antigo para sempre (o estorno não limpa a entrada do item; o `/fiscal` continua recusando) e a A78 não acusa → a L8
    diz "para corrigir o **estoque**" e que o documento continua como entrou; **C269**. **M1** — o recarregar do painel apagava o
    digitado nos outros itens → só os itens que entraram trocam. **M2** — data com lixo no fim passava como eco → a data só é normalizada
    quando o texto inteiro é data. **M3** — `/por-modulo` ainda expõe o papel → **C270**.
  - **Permissão (r2): 1 Important + 1 Minor, reais.** **I (reproduzido, `e130r2-leitura-real`, anterior)** — o administrador
    **desativado** ou apagado continuava administrador pelo token → **B842**. **M** — `/por-modulo`, `/comercial`, `/filtrar` → **C270**.
    Resistiu: a tabela perfil × rota medida (o perfil vem antes de L8/L9; só Administrador/Almoxarife/Compras recebem L8/L9; o
    Administrador faz os dois gestos da L8); nenhuma recusa nova vaza existência. Notado: o cache de 30 s do `enrichUserFromDb` é código
    morto (o `index.js` recria o middleware a cada pedido) — sem efeito, registrado aqui.
  - **Sabotagem (r3): 38** sabotagens novas, **15** sobreviveram: **7** (a) faltava asserção → viraram cenários (o valor **menor**, o
    "99,5", o status real da falha no meio — 400, não 500 —, o import e a chamada do registro no `index.js`, a data com lixo no começo,
    duas); **8** (b) equivalentes provados (o `|| 0` do gravado, o filtro de não-objeto, o `Array.isArray` do JSON, o `\r` que o
    `trim` tira, `m[0]`/`m[1]`, a guarda de `user.id`, o `linhas || []`, o `getDb` capturado — o `db` do `index.js` é atribuído uma
    vez). As outras 23 caíram.
- **Fase 5, commits:** `b377709b` (a L8, a data inteira, o painel que não apaga o digitado e os cenários) e `01dfd645` (B842 e o RN-12
  estrito).
- **Suíte final (medida depois da Fase 5, antes da documentação):** `test:api` **438/438**; `test:almoxarifado` **44/0**;
  `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 10/0; client **127** suítes / **1749** testes; `CI=true build` *Compiled
  successfully*.
- **T5 — fechamento** (o commit de documentação — ver `git log`): novidades (cabeçalho, A78, B838–B843, C267 resolvida com a correção do
  "o que fazer", C269, C270, D (130), F (130), a seção da etapa, "Onde estamos"), specs 08 e 23, mapa (a linha de atualização tinha parado
  na 128 — dito), guia, manual (14.2b e 5.2d), este plano, o "defeito que escapou" da retro da 129.

## Tasks — estado

- [x] **T1** `7b70b969` (Fase 5 `b377709b`) · [x] **T2** `c9411c4c` (Fase 5 `b377709b`) · [x] **T3** `b5cd7d7a` (Fase 5 `b377709b`) ·
  [x] **T4** `e6553429` (Fase 5 `01dfd645`) · [x] **T5** — o commit de documentação.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** (Fase 5). Teste antigo que mudou à vista: `conferenciaDepoisDaEntrada` `[RN-09 F5 r3-C5]` (o
   unitário do item entrado passou a recusar).
2. **Achados da revisão:** Fase 2 — **4 Important + 4 Minor, todos reais**. Fase 5 — r1 **1 Important + 3 Minor** reais (3 corrigidos
   ou reescritos, 1 declarado na C270); r2 **1 Important + 1 Minor** reais (1 corrigido, B842; 1 na C270); r3 **15** sobreviventes — 7
   viraram cenários, 8 equivalentes provados; **0** ruído.
3. **Paralelismo:** **0** galhos em paralelo de fato (T2 e T4 são galhos por regra, mas "um teste por vez" os serializa), **0**
   retrabalho; **1** agente de medição na Fase 0, **1** revisor na Fase 2 e **3** em paralelo na Fase 5 sob a trava.
4. **Defeito que escapou:** *(preencher na Etapa 131)*.

## Próxima tarefa detalhada — Etapa 131

*(A série desta etapa foi B838–B843, C269, C270, A78 — a 131 começa em **B844**, **C271**, **A79**; confira com `grep -oE` antes.)*

**Medido em 2026-10-16 (Fase 0 e Fase 5 desta etapa):** sem o P.O., duas candidatas do núcleo que fecham a classe da B841, e nenhuma do
almoxarifado que não dependa dele.

1. **C270 — as três leituras de usuário que continuam abertas (núcleo) — a principal. Não depende do P.O.** `GET /api/usuarios/por-modulo/:modulo`
   (`index.js`, perto de `registrarLeituraDeUsuarios`) devolve, de quem tem acesso ao módulo pedido e é do mesmo setor, `role`, `cargo`,
   `setor`, `departamento`, `is_oculto`, `created_at` (`por-modulo/admin` lista os administradores); `/api/usuarios/comercial`
   (`fetchComercialResponsaveis`, `services/comercialResponsaveisCache.js`) e `/api/usuarios/filtrar` também devolvem `role`. **Medir
   antes de congelar:** cada chamador no client (`utils/userFilters.js`, `Dashboard.js`, `hooks/useComercialResponsaveis.js` — o agente
   da Fase 0 desta etapa listou) e **quais campos** cada um lê; o candidato é a mesma projeção da B841 (id, nome, e-mail, ativo + o que o
   seletor realmente lê) para quem não gerencia usuários, mantendo os filtros de setor e de marca como estão. **Pontos de atenção:** o
   filtro por setor depende do `ativo` e do `setor` relidos do banco (`ctxUser`), não do token; o cache de `fetchComercialResponsaveis`
   é por `(isAdmin, setor)` (`cacheKey`, medido) — uma projeção que dependa de quem gerencia usuários tem de entrar na chave, senão o
   cache de um serve o outro.
2. **B842 — a sessão do usuário desativado (núcleo).** Hoje o desativado com o token válido segue como usuário comum até o token vencer
   (24 h). O caminho descartado nesta etapa é o 401 no `enrichUserFromDb` quando não há linha ativa. **Medir antes:** o que o client faz
   com 401 em cada tela (o interceptor de `services/api.js` desloga?), as rotas que rodam sem `authenticateToken`, e os testes que montam
   `authenticateToken` com usuário fora do banco (`tokenNaUrl`, `portaoDeModulo`). E o cache de 30 s, que é código morto (o `index.js`
   recria o middleware a cada pedido): ou ele sai, ou passa a ser uma instância única — mas aí a retirada de papel passa a valer só depois
   de 30 s (medido pelo r2 desta etapa), o que piora a B818/B828. **Recomendação:** tirar o cache morto junto, dizendo isso.
3. **Dependem do P.O. — NÃO implemente:** **B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**, **C219**,
   **C230**, o reparo da **C246** (e a **C247**), a tabela de conversões e o grupo acima de família, a **régua do tempo de recebimento
   (E2)**, a **C268** (o custo sigiloso?), a **C269** (o documento da nota deve seguir o estoque corrigido pelo estorno? — o caminho seria o
   estorno da entrada de nota liberar o item para os dados fiscais); na 05, os itens de produto e a **C198**; na 06, a **B11** e a
   Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**, **B101**/G30, **G38**.

**Escolhida: a C270 (1)**, com a B842 (2) se couber com qualidade — as duas do núcleo, reversíveis, registradas na letra B.

**O que já está pronto e não precisa reabrir:** as três leituras de `services/leituraDeUsuarios.js` (`podeLerUsuario`,
`projetarListaDeUsuarios` — a projeção da C270 deve reusá-la), o rebaixamento do desativado no `enrichUserFromDb` (B842), o `/fiscal` do
item entrado (C267, `assertItemEntradoIntacto`) e a conferência depois da entrada (C266).
