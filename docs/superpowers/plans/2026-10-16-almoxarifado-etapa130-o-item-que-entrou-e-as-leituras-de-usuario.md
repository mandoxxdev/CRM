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

- 409 **L8** = `Item já deu entrada no estoque — o lote e as séries dele ficaram registrados no estoque com o que a nota tinha na entrada e não mudam mais pela nota; para corrigir, o Administrador do almoxarifado estorna a entrada e dá a entrada de novo (o pedido de compra e a reserva de quem esperava voltam a esperar)`
- 409 **L9** = `Item já deu entrada no estoque — o valor unitário e o total dele não mudam mais: a entrada no estoque já foi feita com o valor que a nota tinha`

`receiptService.salvarDadosFiscal` lança os mesmos (`{ status: 409 }`); `LITERAIS_CONFERENCIA` ganha `LOTE_SERIE_JA_ENTROU` e
`VALOR_JA_ENTROU`.

**`GET /api/usuarios/:id`**, **`GET /api/usuarios/:id/grupos`** — 403 **L10** = `Acesso negado — apenas o próprio usuário ou administradores do sistema`.
**`GET /api/usuarios`** — 200; para quem não gerencia usuários, `[{ id, nome, email, ativo }]`.

`services/leituraDeUsuarios.js` exporta `registrarLeituraDeUsuarios(app, { getDb, authenticateToken })`, `podeLerUsuario(user, id)`,
`projetarListaDeUsuarios(user, linhas)`, `getUsuarioModuleContext(db, userId, cb)`, `LITERAL_LEITURA_USUARIO`.

**A78** — consulta somente leitura (texto no documento de novidades, o mesmo SQL no teste da RN-08).

## Tasks (sort topológico)

- [ ] **T1 — tronco (serviço do recebimento)** — `assertItemEntradoIntacto` (a quantidade da 129 + RN-01..RN-03) e o comando (RN-06)
  em `receiptService.js`; `fiscalItemEntrado.api.test.js`; a mudança à vista do `[RN-09 F5 r3-C5]`.
- [ ] **T2 — galho (tela)** — `RecebimentosAlmoxarifado.js` (RN-07) + `RecebimentosItemEntrado.test.js`. Consome só o campo
  `entrada_estoque_em` que o `GET /recebimentos/:id` já devolve (`ri.*`).
- [ ] **T3 — integração** — `fiscalItemEntradoIntegracao.api.test.js` (RN-08, rota **e** serviço, a A78).
- [ ] **T4 — galho (núcleo)** — `services/leituraDeUsuarios.js` + `index.js` + `leituraDeUsuarios.api.test.js` (RN-09..RN-12). Outra
  regra, outro arquivo: independente de T1..T3; serializada pela regra "um teste por vez".
- [ ] **T5 — fechamento** — novidades (B838+, C267 resolvida — e o "o que fazer" dela, que mandava à tela de Lotes/Séries, **estava
  errado**: não há gesto ali que corrija lote ou série —, C269+, A78, D (130), F (130), a seção da etapa, cabeçalho), specs 08 e 23 (a
  B836/B841), mapa, guia, manual, este plano (retro, "Próxima tarefa detalhada — Etapa 131"), o "defeito que escapou" da retro da 129.
  CLAUDE.md: a trava **não** muda (o `/fiscal` não pega a trava por material; recusa no comando).

Sem migração (nenhuma coluna, nenhuma tabela): a prova de primeiro boot não se aplica.
