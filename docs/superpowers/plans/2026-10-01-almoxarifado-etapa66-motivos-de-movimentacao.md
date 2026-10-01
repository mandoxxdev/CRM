# Etapa 66 — motivos de movimentação como cadastro (feature 01)

> Status: **PLANO (Fase 1, 2026-10-01)** — Fases 0 e 1 feitas; falta a Fase 2 (revisão do plano por agente fresco)
> antes de qualquer código. Feature 01, item `[ ]` "Motivos de movimentação e motivos de ajuste (cadastro, hoje texto
> livre)" (`specs/modulo-almoxarifado/01-cadastros-materiais/README.md:83`; requisito 4.3 em
> `specs/modulo-almoxarifado/2026-08-02-requisitos-modulo-almoxarifado.md:216-217`).

**Escopo desta etapa (pequeno de propósito):** CRUD do cadastro + uso na movimentação avulsa (que é também o ajuste —
o formulário de `MovimentacoesAlmoxarifado.js` tem os 5 tipos, `AJUSTE` incluído; não existe modal de ajuste separado)
+ leitura no livro, no extrato e no relatório "Histórico de movimentações". O resto vira "falta" (fim do documento).

## Fase 0 — medido (2026-10-01)

### 1. Onde o motivo de uma movimentação entra hoje

| Porta | Arquivo:linha | O que entra | Quem exige |
|---|---|---|---|
| `POST /movimentacoes/v2` (gate `movimentar`) | `routes/almoxarifado/extended.js:766-779` | `req.body` **inteiro** vai ao motor | `MovimentacaoSchema` (`services/almoxarifado/schemas.js:85-128`): `motivo`, `justificativa`, `observacoes` — todos `z.string().optional()` (`:98-101`) |
| `POST /transferencias` (gate `movimentar`) | `extended.js:809-822` | `{...req.body, tipo:'TRANSFERENCIA'}` **sem** `validate()` — body cru ao motor | nada (TRANSFERENCIA é `vinculo:'nenhum'`, sem justificativa — `movementRules.js:42`) |
| `POST /movimentacoes` v1 (gate `movimentar`) | `routes/almoxarifado.js:973-1006` | params **montados à mão**: `motivo` e `justificativa: motivo` (`:993-996`) | a própria rota: `'Motivo é obrigatório para saída e ajuste'` (`:979-981`) |
| Bloqueio/desbloqueio avulso (gate `ajustar_estoque`) | `extended.js:1136-1144` → `inspectionService.js:402-424` | `motivo` **fixo** `'Bloqueio avulso'`/`'Desbloqueio avulso'`, `justificativa` = texto do usuário | o serviço: `'Justificativa é obrigatória para bloqueio'` / `'… para desbloqueio'` |
| Conclusão de inventário (gate `inventario`) | `routes/almoxarifado.js:1447-1650` | `motivo` **fixo** `` `Ajuste de conferência ${conf.numero}` `` (`:1596`), `justificativa` = `justificativa_ajuste` (`:1598`) | a rota: `'Justificativa deve ter pelo menos 5 caracteres'` (`:1463-1466`) |
| Estorno (gate `ajustar_estoque`) | `extended.js:802-807` → `stockService.cancelarMovimentacao` (`stockService.js:2057-2058`) | `motivo` do body → `cancelamento_motivo` + linha ESTORNO | `'Justificativa obrigatória para cancelamento'` |
| Serviços internos (28 call sites do motor — `routes/almoxarifado.js:169`) | `returnService`, `receiptService`, `nonConformityService`, etc. | rótulos fixos do sistema em `motivo` | — |

**O motor** (`stockService.registrarMovimentacao`, `stockService.js:846`) desestrutura `motivo` e `justificativa` dos
params (`:849-851`), aplica `avaliarRegrasVinculo` sobre **`justificativa`** (`:1065`), passa `justificativa` a
`ownerRules.assertAjustePermitido` (`:1083`), grava as duas colunas no INSERT do livro (`:1886-1897`), audita
`justificativa` (`:2009-2015`) e manda as duas à fila de notificação (`:2034`).

**A regra "exige justificativa"** é por tipo em `REGRAS_VINCULO` (`movementRules.js:11-87`): entre os tipos da rota
genérica, `AJUSTE`, `AJUSTE_POSITIVO`, `AJUSTE_NEGATIVO` e `PERDA` têm `justificativa: true`; `SAIDA` é `'qualquer'`
(justificativa OU OS/projeto/centro de custo/referência). Mensagens literais (`movementRules.js:94-106`):
`` `${tipo} exige justificativa` `` e `'Saída exige OS, projeto, centro de custo ou justificativa'`.

**A tela** (`client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js`): `TIPOS_FORM` = ENTRADA, SAIDA,
TRANSFERENCIA, AJUSTE, PERDA (`:27-33`); campo "Motivo" texto livre, obrigatório na tela para SAIDA/AJUSTE/PERDA
(`:811-818`); o payload manda o texto **duas vezes** — `payload.motivo = payload.justificativa = form.motivo`
(`:478-481`). O livro mostra **só** `m.motivo` (`:684`); o extrato (`ExtratoMaterialModal.js:268`) também.

**Colunas** de `movimentacoes_almoxarifado`: `motivo TEXT` (criação, `services/almoxarifado/schema.js:358`) e
`justificativa TEXT` (`safeAlter`, `schema.js:1205-1218`). Nenhuma coluna `motivo_id`.

### 2. Padrão de cadastro simples a copiar

- **Molde: o CRUD de CATEGORIAS** (`routes/almoxarifado/extended.js:186-275`, Etapa 26): `GET` só com `auth` (sem perfil)
  e `?todos=1` para trazer inativas (`:194`); `POST/PUT/DELETE` com `auth, requirePermission('configurar')`; nome
  `trim()` + `'Nome é obrigatório'`; colisão detectada pelo **índice UNIQUE do banco** (`/UNIQUE constraint/`) com
  mensagem única para POST e PUT (`CATEGORIA_DUPLICADA`, `:203`); PUT **preserve-when-omitted** (`ativo` omitido mantém);
  soft delete `WHERE id = ? AND ativo = 1`, 404 para inexistente, 200 `{success:true, ja_inativo:true}` idempotente sem
  auditar; `auditar(db, {entidade, entidade_id, acao: CRIACAO|EDICAO|EXCLUSAO, ...autorDe(req), dados_anteriores,
  dados_novos}, contexto)` (`extended.js:89`).
- Tabela + índice: `schema.js:853-895` (`CREATE UNIQUE INDEX … idx_categorias_almox_nome`, em try/catch com aviso).
- `configurar: [PERFIS.ADMINISTRADOR]` (`services/almoxarifado/permissions.js:106`); 403 literal
  `'Sem permissão para esta operação'` (`permissions.js:272`).
- Auditoria: toda `entidade` literal precisa de rótulo em `ROTULOS_ENTIDADE` (`services/almoxarifado/auditLabels.js:47+`)
  — `tests/api/auditLabels.api.test.js` varre os literais e fica vermelho de propósito sem ele.
- Tela: `ConfiguracoesAlmoxarifado.js` — `TABS` (`:193-206`), render por aba (`:270-281`), `TabCategorias` (`:698-…`)
  é o molde (GET sempre com `?todos=1`, reativar pelo PUT `ativo:1`). A página inteira é de admin (`canConfigureAlmox`).
- Testes-molde: `server/tests/api/categoriasCrud.api.test.js` (matriz de perfis com os dois lados, guarda anti-teste-vazio
  "presença antes da ausência") e `categoriaIntegracao.api.test.js`.
- **Não há transação utilizável** nesta base (`BEGIN` por conexão — `routes/almoxarifado.js:2740`,
  `inspectionService.js:308`). Isso decide o modelo de dados (D3 abaixo).

### 3. Quem lê `movimentacoes_almoxarifado.motivo` / `justificativa`

| Leitor | Arquivo:linha | Lê |
|---|---|---|
| Livro `GET /movimentacoes` | `routes/almoxarifado.js:932-966` | `m.*` (as duas colunas chegam); tela mostra só `motivo` |
| Extrato `GET /materiais/:id/extrato` | `extended.js:919-940` | `m.*`; modal mostra só `motivo` |
| Histórico `GET /materiais/:id/historico` (v1) | `routes/almoxarifado.js:1009-1019` | `m.*` |
| Relatório `historico-movimentacoes` (+ export CSV) | `reportRegistry.js:140-172`, `reportService.js:185-224`, rota `extended.js:2150/2243/2256` | `m.*`, mas as **colunas declaradas não têm Motivo nem Justificativa** — o export CSV projeta pelas colunas |
| Auditoria (tela) | motor audita `justificativa` (`stockService.js:2014`); `AuditoriaAlmoxarifado.js:367` | `justificativa` |
| Fila de notificação | `stockService.js:2034` | as duas |
| Guarda do estorno | `stockService.js:2104` | `mov.motivo === MOTIVO_LIBERACAO_NC` em DESBLOQUEIO |

O texto livre antigo continua legível em todos — nenhum leitor faz JOIN com cadastro. A etapa só **acrescenta**.

### 4. Integrações por API

Nenhuma integração externa chama o motor ou as rotas de movimentação (grep de `registrarMovimentacao` fora de
`services/almoxarifado/` e `routes/almoxarifado*` = zero; sem chave de API em rota de movimentação). As portas por API são
as três do item 1 (v1 — usada pelo modal rápido de `MateriaisAlmoxarifado.js:136`; v2; `/transferencias`), todas com
motivo livre. **Nenhuma pode passar a exigir `motivo_id`** — o cadastro acompanha, não substitui (D1).

### 5. Já existe cadastro de motivos?

**Não no almoxarifado.** Há: `producao_motivos_parada` (`services/producao/schema.js:14,61` — **outro módulo**, paradas
de máquina; não confundir) e `returnService.MOTIVOS` (`services/almoxarifado/returnService.js:11`) — enum **fixo** dos
motivos de **devolução ao estoque** (Etapa 7), espelhado em `DevolucoesAlmoxarifado.js:28`. Não é cadastro e fica fora.
(Régua testada contra caso conhecido: o grep `motivos` acha `producao_motivos_parada` e `MOTIVOS` — a busca enxerga.)

### Surpresas da medição

1. **A regra do motor é sobre `justificativa`, não sobre `motivo`.** Mandar só `{tipo:'AJUSTE', motivo:'x'}` à v2 é
   recusado com "AJUSTE exige justificativa" — a tela só funciona porque copia o texto para os dois campos
   (`MovimentacoesAlmoxarifado.js:478-481`). O plano anterior falava em "regra de motivo obrigatório"; o nome real é
   justificativa. Por isso o motivo do cadastro tem de **preencher a justificativa** (RN-05).
2. **O livro e o extrato escondem a justificativa** quando ela difere do motivo: bloqueio/desbloqueio avulso, inventário
   e não conformidade gravam `motivo` = rótulo fixo e o texto do usuário só em `justificativa` — que nenhuma das duas
   telas mostra. Hoje o porquê digitado num bloqueio **não aparece no livro**. A RN-07 corrige isso de carona (a etapa
   precisa da mesma coisa para o complemento).
3. **O relatório "Histórico de movimentações" não tem coluna Motivo** (nem no CSV). "Relatório por motivo" era o valor
   prometido e hoje nem a coluna existe.
4. **`MovimentacaoSchema` descarta chave não declarada** (`z.object` — já matou `reserva_id` na Etapa 4 e `lote_id`):
   `motivo_id` precisa ser declarado ou a feature morre na v2 com os testes de serviço verdes. `/transferencias` não tem
   `validate()` e passa o body cru — lá ele chega.
5. **`motivo` tem carga semântica num lugar:** o estorno recusa DESBLOQUEIO cujo `motivo` é
   `'Liberação por não conformidade'` (`stockService.js:23,2104`). Restringir os tipos do cadastro a
   `TIPOS_MOVIMENTO_ROTA` (sem DESBLOQUEIO) elimina a colisão por construção.

## Decisões (reversíveis — registrar na letra B do documento de novidades; última usada: B260)

- **D1 (B261) — o cadastro ACOMPANHA o texto livre.** `motivo_id` opcional na API; `motivo`/`justificativa` livres
  continuam aceitos exatamente como hoje. Descartado: tornar obrigatório escolher do cadastro (quebraria v1, modal rápido
  e quem integra; e com cadastro vazio no primeiro dia a tela travaria).
- **D2 (B262) — com `motivo_id`, o livro grava o TEXTO do motivo na hora** (`motivo` = nome do cadastro) **e** o id
  (`motivo_id`). Renomear/desativar depois não reescreve o livro. Descartado: só o id com JOIN na leitura (renomear
  reescreveria o passado; e todos os leitores do item 3 teriam de mudar).
- **D3 (B263) — os tipos a que o motivo serve ficam numa coluna JSON (`tipos TEXT`, array) na própria linha.**
  Descartado: tabela de junção — sem transação, o PUT que troca a lista (DELETE + INSERTs) pode ficar pela metade e deixar
  um motivo sem tipos; uma linha só é atômica. SQLite 3.44 tem `json_each` (medido); Postgres tem `jsonb`.
- **D4 (B264) — `motivo_id` e `motivo` (texto) juntos são recusados (400)**, em vez de o cadastro "ganhar" calado.
  Ninguém manda `motivo_id` hoje, então a recusa não quebra integração; e relaxar depois para "o cadastro prevalece" não
  quebra ninguém (a direção reversível). O complemento livre vai em `justificativa`.
- **D5 (B265) — gate do CRUD = `configurar`** (ADMINISTRADOR); `GET` só com o gate de módulo (o ALMOXARIFE precisa da
  lista na tela de movimentação). Descartado: ação nova em `ACAO_PERFIS` (mexeria em regra compartilhada sem pedido).
- **D6 (B266) — nome único sem diferenciar maiúsculas** (`COLLATE NOCASE` no índice). Diverge de categorias (que é
  case-sensitive) de propósito: "Avaria" e "avaria" partiriam o relatório por motivo em dois. Descartado: copiar a régua
  de categorias.
- **D7 (B267) — sem seed.** O admin cadastra; com o cadastro vazio a tela se comporta como hoje (só texto). Descartado:
  semear motivos genéricos (dado que o cliente não pediu aparecendo em produção).
- **D8 — `AJUSTE` não casa com `AJUSTE_POSITIVO`/`AJUSTE_NEGATIVO`**: o tipo é comparado exato. O admin marca os três se
  quiser. (Registrar junto da B263.)

## Regras de negócio

- **RN-01 (cadastro)** — motivo de movimentação tem `nome` (trim, obrigatório, único sem diferenciar maiúsculas),
  `tipos` (lista não vazia, sem repetição, cada um ∈ `TIPOS_MOVIMENTO_ROTA`: ENTRADA_COMPRA, ENTRADA_MANUAL,
  ENTRADA_DEVOLUCAO, SAIDA_PRODUCAO, SAIDA_MONTAGEM, SAIDA_ASSISTENCIA, TRANSFERENCIA, AJUSTE_POSITIVO, AJUSTE_NEGATIVO,
  PERDA, RETRABALHO, ENTRADA, SAIDA, AJUSTE, DEVOLUCAO) e `ativo`.
  Cenário: admin cria "Avaria no manuseio" para AJUSTE e PERDA → 201; criar "avaria no manuseio" → 400 duplicado;
  criar com `tipos: ['SUCATA']` → 400 tipo inválido; com `tipos: []` → 400.
- **RN-02 (gate)** — criar/editar/desativar exige `configurar` (só ADMINISTRADOR); listar exige só acesso ao módulo.
  Cenário: ALMOXARIFE POST → 403; ALMOXARIFE GET → 200; ADMINISTRADOR POST → 201 (os dois lados da matriz).
- **RN-03 (desativar não apaga)** — DELETE é soft (`ativo = 0`); o motivo some da lista de ativos e da tela de
  movimentação, continua no `?todos=1` para reativar, e as linhas do livro gravadas com ele continuam com o texto e o id.
  Cenário: movimentar com M, desativar M → o livro ainda mostra "M" naquela linha; reativar pelo PUT `ativo: 1`.
- **RN-04 (auditoria)** — criar/editar/desativar auditam com `entidade: 'motivo_movimentacao'` (rótulo
  "Motivo de movimentação" em `auditLabels.js`), `dados_anteriores`/`dados_novos` simétricos `{nome, tipos, ativo}`;
  desativar já inativo não audita.
- **RN-05 (movimentar com motivo do cadastro)** — a movimentação que traz `motivo_id` válido grava `motivo_id`,
  `motivo` = nome do cadastro **naquele momento** e `justificativa` = nome, ou `"<nome> — <complemento>"` quando
  `justificativa` (complemento) vier preenchida. A justificativa assim preenchida **satisfaz** a regra "exige
  justificativa" do tipo. Cenário: AJUSTE com `motivo_id` de "Avaria no manuseio" e sem texto → 201, livro
  `motivo='Avaria no manuseio'`, `justificativa='Avaria no manuseio'`, `motivo_id` = id; com complemento "caixa amassada"
  → `justificativa='Avaria no manuseio — caixa amassada'`.
- **RN-06 (recusas do motivo do cadastro)** — `motivo_id` inexistente, inativo, ou que não serve ao tipo → 400 com a
  mensagem literal do contrato, **antes** de mexer em estoque (nenhuma linha no livro, saldo intacto). `motivo_id` junto
  com `motivo` (texto não vazio) → 400. Vale em toda porta que chega ao motor com `motivo_id` (v2, `/transferencias`,
  chamada direta de serviço). Cenário: AJUSTE com motivo cadastrado só para PERDA → 400, saldo igual.
- **RN-07 (texto livre continua — metade positiva)** — sem `motivo_id`, tudo como hoje: `motivo`/`justificativa` livres
  gravados como vierem; AJUSTE sem justificativa continua recusado com `'AJUSTE exige justificativa'`; v1 continua com
  `'Motivo é obrigatório para saída e ajuste'`. Cenário: o payload de hoje da tela passa idêntico.
- **RN-08 (leitura)** — livro e extrato mostram o `motivo` e, **quando diferente dele**, a `justificativa` abaixo (vale
  também para as linhas antigas de bloqueio/inventário — surpresa 2). O relatório "Histórico de movimentações" ganha as
  colunas **Motivo** e **Justificativa** (e portanto o CSV) e o filtro opcional `motivo_id`.
  Cenário: filtrar o histórico por `motivo_id = M` traz a linha movimentada com M e não traz a de texto livre igual
  "Avaria no manuseio" digitada à mão (o filtro é pelo cadastro, não pelo texto).
- **RN-09 (tela de movimentação)** — o campo Motivo vira um select com os motivos **ativos do tipo escolhido** +
  "Outro (digitar)"; escolher "Outro" (ou não haver motivo para o tipo) mostra o texto livre de hoje; escolher um do
  cadastro mostra "Complemento (opcional)". Trocar o tipo limpa a escolha. Obrigatoriedade na tela inalterada
  (SAIDA/AJUSTE/PERDA: ou um motivo do cadastro, ou o texto). Payload: com cadastro → `motivo_id` (+ `justificativa` se
  houver complemento), **sem** `motivo`; com "Outro" → exatamente o payload de hoje.

## Contrato (congelado)

### `GET /api/almoxarifado/motivos-movimentacao` — `auth` (gate de módulo), sem perfil
- Query: `?todos=1` inclui inativos; `?tipo=AJUSTE` só os **ativos** que servem ao tipo (ignora `todos`).
- 200: `[{ id, nome, tipos: string[], ativo: 0|1 }]` ordenado por `nome` (`tipos` já como array, nunca a string JSON).

### `POST /api/almoxarifado/motivos-movimentacao` — `auth, requirePermission('configurar')`
- Body: `{ nome: string, tipos: string[] }`.
- 201: `{ id, nome, tipos, ativo: 1 }`.
- 400 `'Nome é obrigatório'` · 400 `'Informe ao menos um tipo de movimentação'` (ausente, não-array ou vazio) ·
  400 `` `Tipo de movimentação inválido para motivo: ${tipo}` `` (primeiro inválido) ·
  400 `'Já existe um motivo de movimentação com este nome'` · 403 `'Sem permissão para esta operação'`.
- Repetidos em `tipos` são removidos em silêncio (ordem preservada).

### `PUT /api/almoxarifado/motivos-movimentacao/:id` — `configurar`
- Body: `{ nome?, tipos?, ativo? }` — preserve-when-omitted nos três.
- 200: `{ id, nome, tipos, ativo }`. 404 `'Motivo de movimentação não encontrado'`; demais 400 iguais ao POST; 403.

### `DELETE /api/almoxarifado/motivos-movimentacao/:id` — `configurar`
- 200 `{ success: true }`; já inativo → 200 `{ success: true, ja_inativo: true }` sem auditar;
  404 `'Motivo de movimentação não encontrado'`; 403.

### `POST /api/almoxarifado/movimentacoes/v2` (e `/transferencias`, e o motor direto)
- Body ganha `motivo_id?: number` (int > 0; `null` = ausente). `MovimentacaoSchema` declara
  `motivo_id: z.number().int().positive().nullable().optional()`.
- Resolução no **motor** (helper chamado no topo de `registrarMovimentacao`, antes de qualquer validação que leia
  `justificativa`): recusas, nesta ordem —
  1. `motivo_id` e `motivo` não vazio → 400 `'Informe o motivo do cadastro (motivo_id) ou o motivo digitado (motivo), não os dois'`
  2. não existe → 400 `'Motivo de movimentação não encontrado'`
  3. inativo → 400 `` `O motivo "${nome}" está desativado` ``
  4. não serve ao tipo → 400 `` `O motivo "${nome}" não serve para movimentação do tipo ${tipo}` ``
- Resposta inalterada. Livro: coluna nova `movimentacoes_almoxarifado.motivo_id INTEGER` (`safeAlter`).
- `POST /movimentacoes` v1: **inalterada** (monta os params à mão; `motivo_id` não chega — falta declarada).

### `GET /api/almoxarifado/relatorios/historico-movimentacoes` (+ `/export`)
- Param novo `motivo_id` (number, opcional) → `AND m.motivo_id = ?`. Colunas ganham, depois de "Referência",
  `{ chave: 'motivo', rotulo: 'Motivo' }` e `{ chave: 'justificativa', rotulo: 'Justificativa' }`.

### Livro / extrato
- `GET /movimentacoes` e `GET /materiais/:id/extrato` já devolvem `m.*` — `motivo_id` chega sem mudança de rota.

## Tasks

- [x] **T1 (tronco) — FEITA** (`de04974`). 17 cenários em
  `motivosMovimentacaoCrud.api.test.js`, entrando pela rota e pelo serviço; suítes: api 243/243 arquivos,
  almoxarifado 42/0, validation, safealter, sqlite verdes. Controle positivo (9 sabotagens, cada uma caiu na asserção
  certa): normalização sem minúsculas → (6)/(7)/(9)/(17); sem `AND ativo = 1` → (11); POST sem `configurar` → (16)
  nomeando os 7 perfis; `?tipo=` respeitando `todos` → (12); `ativo` no molde de categorias → (9); `?tipo=` inválido
  aceito → (12)/(17); sem rótulo → (15) e `auditLabels.api.test.js`; nome numérico aceito → (2).
  **Divergências do texto original (todas da Fase 2):** unicidade por coluna `nome_normalizado` (trim + NFC +
  `toLocaleLowerCase('pt-BR')`) com UNIQUE, não `COLLATE NOCASE`; duas mensagens de duplicado; `ativo` só 0|1;
  `?tipo=` inválido 400 `'Tipo de movimento inválido'`. **Escolhas desta execução (letra B):** a regra mora num
  serviço novo `services/almoxarifado/motivoMovimentacao.js` (as rotas só traduzem HTTP — o molde de categorias tinha a
  regra na rota); lista dos tipos em `GET /motivos-movimentacao/tipos` (descartado: campo extra no GET, que mudaria a
  forma `[{...}]` do contrato); `nome` não-texto (número/objeto) → `'Nome é obrigatório'` (descartado: `String(42)`
  virar nome "42"); ordenação por `localeCompare('pt-BR', base)` em JS (o "Éa" fica entre "ab" e "zz"; descartado
  ORDER BY binário, que joga acentuado para o fim); auditoria da desativação com `{nome, tipos, ativo}` dos dois lados
  (só `ativo` muda). Texto original da task, para referência:
  **T1 (tronco) — cadastro: schema + CRUD + auditoria.** `schema.js`: tabela
  `motivos_movimentacao_almoxarifado (id, nome TEXT NOT NULL, tipos TEXT NOT NULL, ativo INTEGER DEFAULT 1, created_at,
  updated_at)` + `CREATE UNIQUE INDEX idx_motivos_mov_almox_nome ON …(nome COLLATE NOCASE)` (try/catch com aviso, como
  categorias) + `safeAlter` `movimentacoes_almoxarifado.motivo_id INTEGER`. Rotas em `extended.js` logo abaixo das
  categorias (molde: categorias). `auditLabels.js`: `motivo_movimentacao: 'Motivo de movimentação'`.
  Testes `server/tests/api/motivosMovimentacaoCrud.api.test.js`: RN-01 (cada 400 com mensagem literal), RN-02 (matriz
  com os dois lados, nomeando o perfil no vermelho), RN-03 (presença antes da ausência; `?todos=1`; reativar), RN-04
  (trilha com de/para; segundo DELETE não audita), `?tipo=` filtra só ativos do tipo. Controle positivo: trocar o índice
  para case-sensitive → o teste de duplicado "avaria"/"Avaria" fica vermelho; tirar o `AND ativo = 1` → o teste de
  idempotência fica vermelho. `auditLabels.api.test.js` precisa continuar verde (prova o rótulo).
- [x] **T2 (tronco) — FEITA** (commit "Etapa 66 (T2)"; hash na próxima marcação do plano / `git log --grep "Etapa 66 (T2)"`).
  Helper `resolverMotivoDoCadastro(db, params)` em `services/almoxarifado/motivoMovimentacao.js`, chamado como
  `params = await …` na 1ª linha de `stockService.registrarMovimentacao` (antes da desestruturação); `motivo_id` no
  INSERT do livro; `MovimentacaoSchema.motivo_id: z.unknown().optional()`. 11 cenários em
  `motivosMovimentacaoUso.api.test.js` pelas três portas (v2, `/transferencias`, serviço direto) + v1. Suítes: api
  244/244 arquivos, almoxarifado 42/0, validation, safealter, sqlite verdes. Controle positivo (10 sabotagens, cada uma
  na asserção certa): schema sem `motivo_id` → v2 (1)(2)(3)(4)(5)(7)(11) vermelhos e serviço (10) + `/transferencias` (9)
  **verdes** (a prova de fiação que a skill pede); resolver sem reatribuir `params` (o "depois da desestruturação") →
  (1)(2)(3)(9)(10)(11); sem formato → (5)(9)(10); aceitar "os dois" / inativo / tipo que não serve → (4)(9)(10); INSERT
  sem `motivo_id` → (1)(9)(10)(11); julgar o motivo antes do tipo → (6); complemento sem trim → (2); v1 repassando
  `motivo_id` → (8).
  **Divergências / escolhas desta execução (letra B):** (a) a recusa de FORMATO vem antes da de "os dois" (a Fase 2
  acrescentou a de formato sem dizer a posição; formato primeiro porque um id mal formado nem chega a ser "o motivo do
  cadastro"); (b) a resolução só acontece com `tipo` válido — com tipo inválido os params passam intocados e o motor
  recusa com `'Tipo de movimento inválido'` (na v2 o Zod recusa antes, com a mensagem de tipo dedicado/genérica de
  hoje); (c) `motivo_id` não-nulo que não é `number` inteiro > 0 → 400, inclusive `true`, `{}`, `-3`; (d) sem
  `motivo_id` os params voltam com `motivo_id: null` e o texto livre NÃO é trimado (RN-07: "como vierem"); com
  `motivo_id`, `motivo` só com espaços conta como vazio e o complemento é trimado; (e) inexistente é **400** (não 404),
  como o contrato. Texto original da task:
  **T2 (tronco) — motor e v2: `motivo_id` na movimentação.** Helper (ex.: `services/almoxarifado/motivoMovimentacao.js`,
  `resolverMotivoDoCadastro(db, params)` → params novos ou erro 400) chamado no topo de `registrarMovimentacao`;
  `motivo_id` no INSERT; `MovimentacaoSchema.motivo_id`. Depende de T1 (tabela).
  Testes `server/tests/api/motivosMovimentacaoUso.api.test.js`: RN-05 (sem e com complemento; satisfaz "exige
  justificativa" em AJUSTE e PERDA), RN-06 (as 4 recusas com mensagem literal **e** saldo/livro intactos), RN-07 (payload
  de hoje idêntico; AJUSTE sem nada → `'AJUSTE exige justificativa'`; v1 com `motivo_id` no body grava `motivo_id` NULL).
  **Três portas, por exigência da skill (fiação):** pela rota v2 (prova o `MovimentacaoSchema` — controle positivo:
  remover `motivo_id` do schema deixa este cenário vermelho e o de serviço verde), pela `/transferencias` (body cru) e
  pelo serviço direto (`stockService.registrarMovimentacao`).
- [ ] **T3 (galho, servidor) — relatório.** `reportRegistry.js` (param `motivo_id` + colunas Motivo/Justificativa) e
  `reportService.relatorioHistoricoMovimentacoes` (filtro). Teste no `relatoriosRegistro.api.test.js` ou arquivo novo:
  colunas presentes; filtro; export CSV traz o cabeçalho "Motivo". Consome só o contrato de T2 (coluna `motivo_id`).
- [ ] **T4 (galho, tela) — aba "Motivos de Movimentação" em Configurações.** `TabMotivosMovimentacao` em
  `ConfiguracoesAlmoxarifado.js` (molde `TabCategorias`: GET `?todos=1`, criar, renomear, marcar tipos por checkbox,
  desativar/reativar; mensagem do servidor crua no toast). Teste RTL com `api` mockado na fronteira HTTP.
- [ ] **T5 (galho, tela) — movimentação e leitura.** `MovimentacoesAlmoxarifado.js` (RN-09: GET `?tipo=` ao trocar o
  tipo, select + "Outro (digitar)" + complemento, payload) e RN-08 no livro (`:684`) e no `ExtratoMaterialModal.js`
  (`:268`): justificativa abaixo quando diferente do motivo. Testes RTL: payload com cadastro (sem `motivo`), payload com
  "Outro" idêntico ao de hoje, troca de tipo limpa, cadastro vazio mostra só o texto, livro mostra a justificativa
  diferente e não repete a igual.
- [ ] **T6 (integração, cruza galhos) — `server/tests/api/motivosMovimentacaoIntegracao.api.test.js`.** Fluxo pela rota,
  ponta a ponta: admin cadastra "Avaria no manuseio" (AJUSTE, PERDA) → almoxarife lista `?tipo=PERDA` e o vê → almoxarife
  faz PERDA pela v2 com `motivo_id` + complemento → `GET /movimentacoes` mostra `motivo`, `justificativa` e `motivo_id`
  → `GET /relatorios/historico-movimentacoes?motivo_id=` traz a linha e **não** traz uma PERDA de texto livre com o mesmo
  texto → admin renomeia para "Avaria" → o livro continua "Avaria no manuseio" naquela linha → admin desativa → PERDA
  com aquele `motivo_id` recusa com a mensagem de inativo → `?tipo=PERDA` não o lista, `?todos=1` lista → o extrato do
  material mostra a linha antiga. Controle positivo: gravar `motivo` pelo nome atual via JOIN (sabotagem) deixa o passo
  "renomear não reescreve" vermelho.
- [ ] **T7 — verificação, Fase 5 e fechamento** (skill `fechar-etapa`): cinco suítes; spec 01 linha 83 `[x]` com hash e
  o que ficou de fora; mapa; guia (Antes → Agora, roteiro clicável); letras B261–B267.

Ordem: T1 → T2 (tronco, sequencial) → T3, T4, T5 em paralelo (T3 em worktree; T4/T5 são tela contra contrato) → T6 →
T7. T4 e T5 mexem em arquivos diferentes e só consomem o contrato congelado acima.

## O que fica de fora (vira "falta" na spec 01)

- **Motivo do cadastro na v1** (`POST /movimentacoes`, modal rápido de Materiais) — monta params à mão; continua só texto.
- **Bloqueio/desbloqueio, inventário, estorno, NC, devolução** — continuam com rótulo fixo + justificativa livre (a
  devolução tem enum próprio, `returnService.MOTIVOS`). Ligá-los ao cadastro exige decidir tipos que não estão em
  `TIPOS_MOVIMENTO_ROTA` (DESBLOQUEIO colide com `MOTIVO_LIBERACAO_NC`).
- **Tornar obrigatório escolher do cadastro** (por tipo, configurável) — depende de o cadastro existir e ser usado.
- **Motivos de ajuste com regra própria** (ex.: dupla aprovação por motivo — feature 06, decisão B11).
- **Indicador/gráfico "movimentações por motivo"** — o filtro e as colunas do histórico são o mínimo desta etapa.
- **Migrar o texto livre antigo para o cadastro** — de propósito não (mesma decisão das categorias, consulta A6).

## Fase 2 — revisão do plano: 0 críticos, 4 importantes, 9 menores → contrato revisto (vale sobre o texto acima)

- **IMPORTANTE (contrato)** — `motivo_id` mal formado respondia diferente na v2 (Zod: "Expected number…") e na
  `/transferencias` (sem `validate()`: `"7"` aceito, `0` ignorado). → `motivo_id: z.unknown().optional()` no schema
  (precedente da Etapa 56, `codigo_lido_*`) e a checagem de tipo NO HELPER do motor, mensagem literal
  **`motivo_id deve ser um número inteiro positivo`** — a mesma nas duas portas (teste nas duas). `null`/ausente = sem
  motivo do cadastro; `0`, `"7"`, `1.5`, `"abc"` → 400 com essa mensagem.
- **IMPORTANTE (unicidade)** — `COLLATE NOCASE` só dobra ASCII ("Manutenção" × "MANUTENÇÃO" entrariam os dois) e não
  existe no Postgres. → coluna `nome_normalizado` (trim + `toLocaleLowerCase('pt-BR')` + `normalize('NFC')`) com UNIQUE;
  a recusa de duplicado diz se o existente está desativado: **`Já existe um motivo com este nome`** /
  **`Já existe um motivo desativado com este nome — reative-o`**.
- **IMPORTANTE (motor)** — o helper resolve o motivo e **reatribui `params` ANTES da desestruturação** de
  `registrarMovimentacao` (`stockService.js` ~847); ordem fixa: tipo inválido primeiro (a mensagem de hoje), depois o
  motivo.
- **IMPORTANTE (último gesto)** — o relatório por motivo pela tela: o parâmetro `motivo_id` renderiza como input numérico
  genérico (`RelatoriosAlmoxarifado.js` ~421). → o registro do parâmetro declara opções vindas de
  `GET /motivos-movimentacao` (select com os nomes, inclusive desativados — o histórico os tem); se o render genérico não
  suportar opções, T3 estende-o para `tipo: 'select'` com fonte — e testa pela tela.
- **IMPORTANTE (tela, T5)** — trocar de "Outro" para um motivo do cadastro limpa o texto livre (senão 400 pela D4);
  `motivo_id` vai como **número** (`Number(...)`) — teste assertando `motivo_id: 7` numérico.
- Menores: trim em `motivo`/`justificativa` (só espaços = vazio; o complemento vazio não grava "Nome — "); `ativo` no PUT
  só `0|1` (número ou booleano) senão 400 **`ativo deve ser 0 ou 1`** (o molde de categorias aceita `"0"` como 1 — não
  copiar); editar os tipos de um motivo já usado é permitido e não reescreve o livro (a linha antiga mantém `motivo_id`);
  `?tipo=` inválido → 400 **`Tipo de movimento inválido`**; DELETE (desativar) grava de/para `{ativo:1}→{ativo:0}`;
  a lista dos 15 tipos vem do servidor (`GET /motivos-movimentacao/tipos` ou campo no GET) — sem terceira cópia na tela;
  RN-08 pode duplicar `getByText` em testes RTL existentes (ajustar a consulta, não a regra); escolher motivo do cadastro
  satisfaz também "emergencial exige justificativa" e a regra `'qualquer'` da SAIDA (como o texto copiado já faz hoje —
  letra B).
