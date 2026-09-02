# Etapa 28 — A separação ganha dono e segunda conferência (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** a separação de requisição passa a registrar **quem** separou (por rodada, append-only),
a deixar rastro na trilha, e ganha uma **segunda conferência** em que **quem separou não confere**
— com a barreira repetida no `WHERE` do claim, como no sucateamento.

**Architecture:** uma tabela nova (`separacoes_requisicao_almoxarifado`), três colunas novas em
`requisicoes_almoxarifado` (`conferido_por_id/_nome/_em`), `separarRequisicao` recebendo `user`,
uma rota nova (`PUT /requisicoes/:id/conferir-separacao`), uma ação de perfil nova
(`conferir_separacao`), dois verbos e uma entidade em `auditLabels`, e a tela de requisições
mostrando as rodadas e o botão de conferir.

**Spec:** `docs/superpowers/specs/2026-08-29-almoxarifado-etapa28-separacao-com-dono-design.md`
(commit `de8c36d`). Feature: `specs/modulo-almoxarifado/05-separacao-picking/README.md`.

> **REESCRITO PELA FASE 2** (12 achados, **2 bloqueantes**, os dois erro de desenho meu):
> (1) a barreira de material crítico estava só no `liberar-retirada`, mas **`PUT /entregar` sai
> direto de `EM_SEPARACAO`** (`PODE_ENTREGAR`, `requisitionStateMachine.js:79`; botão "Confirmar
> Entrega" em `RequisicoesList.js:1083`) — a barreira era opcional para quem entregasse sem
> liberar; (2) o teste de corrida `separar(B)×conferir(B)` **não prova o `NOT EXISTS`**: com a D3
> o estado final é seguro em quase toda intercalação mesmo sem ele, então sabotar o `WHERE`
> deixaria o teste verde. Mais: RN-01 quebrava quatro chamadores existentes do serviço sem
> `user`; o UPDATE de status ficou ambíguo para `itens_separados=[]`; o harness tem **um**
> `currentUser` global, então corrida pela rota é sempre o mesmo usuário. Onde diz "ESTAVA
> ERRADO", vale a versão atual.

## Decisões da Fase 1 (o design deixou em aberto; medidas em 2026-08-29)

**D1 — A conferência é uma ROTA PRÓPRIA, não um campo no `liberar-retirada`.** Medido: a tela
chama `PUT /liberar-retirada` de um confirm dialog sem corpo (`RequisicoesList.js:622`), e o
almoxarife que separa é hoje o mesmo que libera. Fundir "conferir" com "liberar" faria um
almoxarifado com **uma pessoa só** não conseguir liberar nada — mudança de comportamento do fluxo
inteiro, irreversível de manhã. Rota própria é aditiva.

**D2 — A conferência é OBRIGATÓRIA só quando há material crítico SEPARADO E AINDA NÃO ENTREGUE**
(`material_critico`, `schema.js:776`, existe desde a Etapa 2; universo = itens com
`material_critico = 1` **e** `quantidade_separada − quantidade_entregue > 0` — "crítico ainda na
caixa": item crítico aguardando estoque não está na caixa (achado 7), e crítico já entregue **saiu**
dela (fix-round 1, F5 — a versão original dizia só `quantidade_separada > 0` e estava errada:
crítico entregue continuava exigindo conferência para entregar o comum).
Sem material crítico ela é opcional e fica registrada. É a primeira resposta concreta à **B57**
("quais operações exigem duas assinaturas"): **sair com material crítico** — e "sair" são **duas
rotas**, `liberar-retirada` **e** `entregar` (achado 1, bloqueante: a entrega sai direto de
`EM_SEPARACAO` sem passar pela liberação; barreira só na liberação era barreira que ninguém é
obrigado a passar). A régua mora numa função só (`conferenciaObrigatoria(itens)`), para virar
"sempre" ou "nunca" com uma linha. **Descartado** "sempre obrigatória" (trava
almoxarifado de uma pessoa) e "nunca obrigatória" (barreira que ninguém é obrigado a passar não é
barreira). Registrar como **B62**.

**D3 — Uma rodada nova de separação LIMPA a conferência.** A conferência atesta o conteúdo de uma
caixa; se a caixa mudou, precisa ser atestada de novo. A conferência anterior **não some**: vai para
`dados_anteriores` da auditoria da separação. E isso fecha a corrida "B separa e B confere ao mesmo
tempo" sem segundo `WHERE`: em qualquer ordem, o estado final nunca é "conferida por B com rodada de
B" (ver RN-03b). **Descartado** recusar separação depois de conferida: a requisição volta de
`PARCIALMENTE_ATENDIDA` para `EM_SEPARACAO` por desenho (Etapa 3), e recusar quebraria a segunda
rodada de uma entrega parcial.

**D4 — `liberar-retirada` passa a auditar** (verbo `LIBERACAO_RETIRADA`). É a mesma lacuna da
separação, no mesmo arquivo, a duas linhas de distância; deixar para depois seria a Etapa 24
outra vez.

**D5 — A rodada guarda o detalhe por item** (`itens_json`), além de `itens_tocados`. "Quem separou
ESTE item?" é a pergunta real quando falta material na caixa; contar itens sem dizer quais não
responde. Uma coluna, aditiva.

## Global Constraints

1. **Use `python3`, nunca `python`**. Ou `sed` contando a âncora antes (`grep -cF` = exatamente
   **1**; se der 2, **aborte**), ou Edit. **`grep` de raiz truncada em palavra acentuada devolve
   zero** (`grep -i "separac"` não acha "separação"): ao medir ausência, teste a régua contra um
   caso que você **sabe** que existe.
2. **COMMITE ANTES DE SABOTAR.**
3. **Controle positivo com alvo, lendo QUAL asserção caiu.** `md5sum` antes/depois/restaurado,
   `git diff --stat` vazio. **Numa barreira com checagem JS E `WHERE`, sabote os dois
   separadamente** e diga o que caiu em cada um — remover só a checagem JS pode ser no-op para o
   teste sequencial.
4. **Vermelho por asserção, não por erro de setup.**
5. **Não escreva no banco de desenvolvimento** (`server/data/database.sqlite`).
6. **Nunca `git add -A`.** Commit em português, corpo sem acento, `git commit -F` com nome
   **único** no scratchpad (`msg-<assunto>.txt`).
7. Testes de API em `server/tests/api/*.api.test.js`; harness `testApp.js` com
   `requirePermission` real; `setUser` troca o usuário entre chamadas. `separar_emitir` é de
   `[ADMINISTRADOR, ALMOXARIFE]`.
8. **A separação NÃO move saldo** (a reserva é na aprovação, Etapa 4). Não inventar movimentação.
9. **`auditLabels.api.test.js` varre `entidade: '<nome>'` e `acao: '<VERBO>'` literais** em
   `routes/` e `services/` e exige rótulo. Escreva os literais **literalmente** (não monte a string).

## Regras de negócio

| RN | Enunciado | Onde é provada |
|---|---|---|
| RN-01 | Separar exige identidade: `separarRequisicao(db, id, itens, user)`; sem `user.id` lança **400** e **não grava nada** (nem item, nem rodada). **Os 4 chamadores existentes sem `user` passam a passar um** (`tests/almoxarifado.test.js:283,348,665`, `tests/api/serieControleObrigatorio.api.test.js:119`) | `separacaoComDono` |
| RN-02 | Cada rodada de separação vira **uma linha** em `separacoes_requisicao_almoxarifado`; duas rodadas por pessoas diferentes = duas linhas, nenhuma apaga a outra; rodada **sem item efetivo** (todas as quantidades 0, ou `[]`) **não** gera linha — mas o **UPDATE de status para `EM_SEPARACAO` continua incondicional**, como hoje (`:237`): "Iniciar Separação" com quantidades zeradas é caminho real da tela | `separacaoComDono` |
| RN-03 | **Quem separou não confere**: a conferência recusa (403) quem aparece em **qualquer** rodada da requisição, não só a última; a barreira se repete no `WHERE` do claim, e **o claim é exportado e provado direto** (`claimConferencia`) | `segundaConferencia` (**peso**: separador da PRIMEIRA rodada; e o claim com rodada do mesmo usuário → `undefined`) |
| RN-03b | Corrida separar×conferir pelo mesmo usuário: em qualquer ordem, o estado final nunca é "conferida por X **e** rodada de X" — **prova a D3 (estado final), não o `NOT EXISTS`** | `segundaConferencia` (`Promise.allSettled` no **serviço**) |
| RN-04 | A separação deixa rastro: `entidade:'requisicao'`, `acao:'SEPARACAO'`, `dados_novos` com `rodada_id`, `itens` e, se limpou conferência, `dados_anteriores.conferencia` | `separacaoComDono` |
| RN-05 | Conferir é ato com dono: exige `conferir_separacao` (perfil) **e** `user.id`; grava `conferido_por_*`; só em `EM_SEPARACAO` com ≥1 item separado; **uma vez** (segunda conferência → 409) | `segundaConferencia` |
| RN-06 | `liberar-retirada` **e `entregar`** exigem conferência quando há material crítico **separado e ainda não entregue** (fix-round 1, F5: era "separado"); sem crítico, seguem como hoje. **E material crítico não sai além do separado** (`qty > separado − entregue` → 400, fix-round 1, F2); comum mantém a Etapa 3 | `segundaConferencia` (as duas rotas; F2 e F5 com nome) |
| RN-07 | Nova rodada **com item efetivo** **limpa** `conferido_por_*` (a caixa mudou) e registra a conferência apagada em `dados_anteriores` — **relida imediatamente antes do UPDATE**, não do SELECT inicial (achado 6; não é atômico, e isso fica escrito no código) | `separacaoComDono` |
| RN-08 | `liberar-retirada` audita (`LIBERACAO_RETIRADA`) e `conferir-separacao` audita (`CONFERENCIA_SEPARACAO`) — pós-escrita, best-effort | `separacaoComDono` + `segundaConferencia` |
| RN-09 | `GET /requisicoes/:id` devolve `separacoes[]`, `conferencia` (ou `null`) e `conferencia_obrigatoria` — leitura sem gate novo, como `assinaturas_entrega` (Etapa 15) | `segundaConferencia` |

## Contratos congelados

**C1 — Schema** (em `schema.js`, no bloco das colunas de `requisicoes_almoxarifado`, `:1810-1823`,
e a tabela junto de `assinaturas_entrega_almoxarifado`):

```sql
CREATE TABLE IF NOT EXISTS separacoes_requisicao_almoxarifado (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requisicao_id INTEGER NOT NULL REFERENCES requisicoes_almoxarifado(id),
  usuario_id INTEGER NOT NULL,
  usuario_nome TEXT,
  itens_tocados INTEGER NOT NULL DEFAULT 0,
  itens_json TEXT,                -- [{item_id, material_id, quantidade}]
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_separacoes_req ON separacoes_requisicao_almoxarifado(requisicao_id);
-- safeAlter:
ALTER TABLE requisicoes_almoxarifado ADD COLUMN conferido_por_id INTEGER;
ALTER TABLE requisicoes_almoxarifado ADD COLUMN conferido_por_nome TEXT;
ALTER TABLE requisicoes_almoxarifado ADD COLUMN conferido_em DATETIME;
```

**C2 — `requisitionService`**

```js
// nomeDoUsuario(user) = user?.nome || user?.email || null   (molde: scrapDisposalService.js:96)
//
// separarRequisicao(db, requisicaoId, itensSeparados = [], user)
//   sem user?.id -> Error 400 'Separação exige usuário identificado'  (ANTES de qualquer escrita)
//   grava itens como hoje;
//   UPDATE requisicao SET status='EM_SEPARACAO', updated_at, ultimo_lembrete_enviado=NULL — SEMPRE (como hoje)
//   se >=1 item efetivo (qty > 0 e item existente):
//     INSERT rodada; reler conferido_por_* ; e o MESMO UPDATE acima leva também
//     conferido_por_id=NULL, conferido_por_nome=NULL, conferido_em=NULL
//   retorna { success:true, status:'EM_SEPARACAO', rodada_id: <id|null>, itens_tocados: n }
//   auditoria pós-escrita (best-effort, console.warn em falha):
//     { entidade:'requisicao', entidade_id, acao:'SEPARACAO', usuario_id, usuario_nome,
//       dados_anteriores: conferenciaAnterior ? { conferencia: {...} } : undefined,
//       dados_novos: { rodada_id, itens_tocados, itens:[{item_id, quantidade}] } }
//
// conferirSeparacao(db, requisicaoId, user)
//   sem user?.id -> 400 'Conferência exige usuário identificado'
//   404 'Requisição não encontrada'
//   400 'Só é possível conferir uma requisição em separação (status atual: <STATUS>)'
//   400 'Nenhum item separado'
//   403 'Quem separou não confere: você registrou a rodada de separação #<n> desta requisição.
//        A segunda conferência tem de ser de outra pessoa.'  (checagem JS, pela MENSAGEM)
//   claim: UPDATE requisicoes_almoxarifado SET conferido_por_id=?, conferido_por_nome=?,
//          conferido_em=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
//          WHERE id=? AND status='EM_SEPARACAO' AND conferido_por_id IS NULL
//            AND NOT EXISTS (SELECT 1 FROM separacoes_requisicao_almoxarifado s
//                            WHERE s.requisicao_id = requisicoes_almoxarifado.id AND s.usuario_id = ?)
//          RETURNING id, conferido_em
//          params: [user.id, nomeDoUsuario(user), requisicaoId, user.id]
//   claim vazio -> 409 'Esta requisição não pode ser conferida agora: já foi conferida, saiu de
//        EM_SEPARACAO, ou você separou uma rodada dela — outra pessoa (ou outra aba sua) agiu
//        enquanto esta tela estava aberta. Recarregue e confira o estado atual.'
//   O claim vive em claimConferencia(db, requisicaoId, user) -> row | undefined, EXPORTADO,
//   porque e a unica forma de provar o NOT EXISTS de forma deterministica (achado 2).
//   '#<n>' na mensagem 403 = `rodada.id`.
//   retorna { success:true, conferencia:{ usuario_id, usuario_nome, em } }
//   auditoria: { entidade:'requisicao', acao:'CONFERENCIA_SEPARACAO', dados_novos:{ conferido_por_id, conferido_por_nome } }
//
// conferenciaObrigatoria(itens) -> itens.some(i => Number(i.material_critico) === 1 && (separado(i) - entregue(i)) > 0)
//   (fix-round 1, F5: era `num(i.quantidade_separada) > 0`; crítico já entregue não está na caixa)
// assertConferidaSeObrigatorio(reqRow, itens) -> lanca 400 com a MENSAGEM de RN-06 (abaixo) quando
//   conferenciaObrigatoria(itens) && !reqRow.conferido_por_id. Chamada em liberar-retirada E em
//   entregarRequisicao (antes de qualquer escrita, depois da checagem de status).
// listarSeparacoes(db, requisicaoId) -> [{ id, usuario_id, usuario_nome, itens_tocados, itens:[...], created_at }] ASC
```

**C3 — Rotas** (`routes/almoxarifado.js`, junto de `handleSeparacao`)

| Rota | Gate | Comportamento |
|---|---|---|
| `PUT /requisicoes/:id/separacao` e `/separar` | `separar_emitir` | passa `req.user`; resposta ganha `rodada_id` e `itens_tocados` |
| `PUT /requisicoes/:id/conferir-separacao` | **`conferir_separacao`** (novo, `[ADMINISTRADOR, ALMOXARIFE]`) | C2; corpo vazio |
| `PUT /requisicoes/:id/liberar-retirada` | `separar_emitir` | **novo 400** antes do UPDATE (`assertConferidaSeObrigatorio`): `'Esta requisição tem material crítico separado e ainda não passou pela segunda conferência. Peça a outra pessoa do almoxarifado para conferir a separação antes de liberar ou entregar.'`; audita `LIBERACAO_RETIRADA` com `dados_anteriores:{status}` e `dados_novos:{status, conferido_por_id}` |
| `PUT /requisicoes/:id/entregar` | `separar_emitir` | **novo 400**, mesma mensagem, dentro de `entregarRequisicao` após a checagem de `PODE_ENTREGAR` e **antes de qualquer baixa** (achado 1). Itens do universo: os da requisição (`carregarItensRequisicao` já traz `quantidade_separada`; precisa trazer `material_critico`) |
| `GET /requisicoes/:id` | (como hoje) | `+ separacoes: [...]`, `+ conferencia: { usuario_id, usuario_nome, em } \| null`, `+ conferencia_obrigatoria: bool`; o SELECT dos itens ganha `ma.material_critico` |

**C4 — `permissions.js`**: `conferir_separacao: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE]`, com o
comentário do critério (ação própria para PODER restringir sem reescrever; a barreira de
identidade mora no serviço porque perfil não sabe quem separou). Entra de graça em
`GET /minhas-permissoes`.

**C5 — `auditLabels.js`**: em `GRUPOS_ACAO`, bloco "Requisição / aprovação":
`{ rotulo: 'Separação', verbos: ['SEPARACAO'] }`, `{ rotulo: 'Conferência da separação', verbos: ['CONFERENCIA_SEPARACAO'] }`,
`{ rotulo: 'Liberação para retirada', verbos: ['LIBERACAO_RETIRADA'] }`. Entidade continua
`requisicao` (já tem rótulo) — **não** criar entidade nova: a rodada é evento da requisição.

**C6 — Front (`RequisicoesList.js`, galho, contra C3)**: no modal de detalhe, em `warehouseMode`:
- bloco "Separação" listando `separacoes` (`usuario_nome · dd/mm HH:mm · N itens`), abaixo dos itens;
- linha "Conferida por X em …" quando `conferencia`; quando `null` e status `EM_SEPARACAO`, botão
  **"Conferir separação"** (gate `pode('conferir_separacao')` via `bloquearSeNaoPode`), que chama
  `PUT /conferir-separacao`, `toast.success('Separação conferida!')`, erro → `toast.error(err.response?.data?.error)`;
- o botão "Conferir separação" só aparece com ≥1 item separado, e fica **desabilitado com
  `title`** para quem aparece em `separacoes[].usuario_id` (o backend dá 403 de qualquer jeito);
- quando `conferencia_obrigatoria && !conferencia`, os botões "Liberar para Retirada" **e**
  "Confirmar Entrega" ficam **desabilitados** com `title` explicando (o backend recusa de qualquer jeito);
- usar `(detalhe.separacoes || [])`: no modo não-warehouse o detalhe vem de
  `/requisicoes-material/:id` (`RequisicoesList.js:81`) sem os campos novos.

## Sort topológico

| # | Task | Tipo | Depende de |
|---|---|---|---|
| 1 | Schema + `separarRequisicao(user)` + rodada + auditoria + rota passando `req.user` + labels + `listarSeparacoes` + GET | **tronco** | — |
| 2 | `conferirSeparacao` + rota + `conferir_separacao` + RN-06 no `liberar-retirada` + auditoria da liberação | **tronco** | 1 |
| 3 | Front C6 + testes Jest | **galho** | contrato C3 (pode começar após a Task 1 commitada; roda em worktree) |
| 4 | Integração: separar (A) → separar (B) → conferir (A) 403 → conferir (C) 200 → liberar; e o caminho crítico sem conferência → 400 | **tronco** | 2 |

Só a Task 3 é galho; as três de backend mexem na mesma regra (RN-03/RN-07 cruzam separação e
conferência) e vão em sequência.

---

## Task 1 — A separação ganha dono, rodada e rastro (tronco) — ✅ FEITA (`f298536`)

> **Fechamento (2026-08-30).** Entregue como previsto: C1, C2 (parte de separação), C3
> (`handleSeparacao` passa `req.user`; `GET /requisicoes/:id` devolve `separacoes`, `conferencia`,
> `conferencia_obrigatoria` e `ma.material_critico` nos itens), C5 (os **três** rótulos, para a
> Task 2 não reabrir `auditLabels.js`). Exportados de `requisitionService`: `separarRequisicao`
> (agora com `user`), `listarSeparacoes(db, requisicaoId)`, `conferenciaObrigatoria(itens)`,
> `nomeDoUsuario(user)`. Os 4 chamadores sem `user` passaram a passar `userAlmox`/`ADMIN`.
> Teste `separacaoComDono.api.test.js`: 9 cenários, vermelhos por asserção nos 9 antes do
> serviço (o schema entrou primeiro justamente para o vermelho não ser "no such table").
> Placar: `test:api` 160/160 arquivos (separacaoComDono 9/9, auditLabels 14/14,
> requisicaoEstados 25/25, serieControleObrigatorio 8/8); `test:almoxarifado` 42/42.
>
> **Controles positivos** (md5 `bffed7cf…` antes/restaurado, `git diff --stat` vazio):
> (a) guarda de `user` removida → RN-01 cai, mas por `TypeError` no `user.id` do INSERT
> (asserção `status 400` com `status undefined`); por isso rodei também **(a2)** guarda removida
> **+** `user?.id || 0` no INSERT e na auditoria (o `|| null` silencioso que a RN-01 proíbe) →
> cai a asserção "esperava erro sem usuario, mas separou" — é esta que prova a regra.
> (b) INSERT da rodada vira no-op (`rodadaId = 1`) → caem RN-02 ("ids diferentes"), RN-01 pela
> rota ("rodada gravada") e RN-09 (`separacoes.length`). (c) `conferido_por_*=NULL` fora do
> UPDATE → cai RN-07 ("conferido_por_id tem de voltar a NULL: a caixa mudou").
>
> **Divergências do previsto:** nenhuma de contrato. Dois detalhes que a Task 2 precisa saber:
> (1) a rodada é inserida **antes** da releitura da conferência e do UPDATE (ordem do C2), então
> `claimConferencia` do mesmo usuário já encontra a rodada dele no `NOT EXISTS` mesmo se o UPDATE
> de status ainda não rodou; (2) `conferenciaObrigatoria` aceita `material_critico`/`quantidade_separada`
> como texto do SQLite (`Number(...)`), e o teste fixa isso — `carregarItensRequisicao` ainda **não**
> traz `ma.material_critico` (é a Task 2 que acrescenta, para o `assertConferidaSeObrigatorio`
> em `entregarRequisicao`).


**Arquivos:** `server/services/almoxarifado/schema.js`, `requisitionService.js`, `auditLabels.js`,
`routes/almoxarifado.js` (`handleSeparacao`, `GET /requisicoes/:id`),
`server/tests/api/separacaoComDono.api.test.js` (novo), **e os quatro chamadores existentes sem
`user`** — `server/tests/almoxarifado.test.js:283,348,665` e
`server/tests/api/serieControleObrigatorio.api.test.js:119` — passam a passar um usuário (senão
`:665` recebe 400 onde espera 403 e `:348` quebra).

**TDD — escreva o teste primeiro** (`separacaoComDono.api.test.js`, molde:
`requisicaoEstados.api.test.js` — `criarRequisicao` por INSERT direto, `criarMaterial` pela rota):

- `[RN-01] separar sem user lança 400 e nao grava item nem rodada` (chamar o **serviço**
  direto com `user` undefined; conferir `quantidade_separada` continua 0 e `COUNT(*)` da tabela = 0).
- `[RN-01] pela ROTA, req.user chega ao servico` (rota com `setUser(ALMOX)` → rodada com `usuario_id`
  do ALMOX; é o cenário de fiação que a Etapa 25 ensinou).
- `[RN-02] duas rodadas, duas pessoas, duas linhas` (A separa 1, B separa 1; `listarSeparacoes`
  devolve 2 em ordem, ids diferentes, `itens_json` de cada uma).
- `[RN-02] rodada sem item efetivo nao gera linha, mas o status vira EM_SEPARACAO` (`[]` e
  `[{item_id, quantidade_separada: 0}]`; conferência preexistente **fica**).
- `[RN-04] a trilha mostra SEPARACAO` com `dados_novos.rodada_id`.
- `[RN-07] rodada nova limpa a conferencia` (UPDATE direto `conferido_por_id=99` no setup; separar;
  colunas voltam `NULL`; `dados_anteriores.conferencia.usuario_id === 99`).
- `[RN-09] GET /requisicoes/:id devolve separacoes, conferencia null, conferencia_obrigatoria`
  (um material com `material_critico=1` → `true`; sem → `false`).
- **`auditLabels.api.test.js` deve continuar verde** (o verbo novo tem rótulo).

**Implementação:** C1, C2 (parte de separação), C3 (`handleSeparacao` + GET), C5. No GET, adicione
`ma.material_critico` ao SELECT dos itens e monte `conferencia` a partir de `req_row.conferido_por_id`.

**Controle positivo:** (a) remover a guarda de `user` → RN-01 cai; (b) trocar o INSERT da rodada por
no-op → RN-02 cai; (c) remover o `conferido_por_id=NULL` do UPDATE → RN-07 cai. Restaurar, `git
diff --stat` vazio.

**Commit:** `Almoxarifado Etapa 28 Task 1: a separacao passa a ter dono, rodada e rastro`.

## Task 2 — Segunda conferência com barreira no WHERE (tronco) — ✅ FEITA (`174d388`)

> **Fechamento (2026-08-30).** Entregue como previsto: C2 (`conferirSeparacao`, com os seis erros
> na ordem e nas mensagens literais do contrato; `claimConferencia` **exportado**;
> `assertConferidaSeObrigatorio`), C3 (rota `PUT /requisicoes/:id/conferir-separacao` com
> `requirePermission('conferir_separacao')`; `liberar-retirada` com o 400 da RN-06 depois do
> `'Nenhum item separado'` e antes do UPDATE, auditando `LIBERACAO_RETIRADA` pós-escrita via
> `audit.registrarAuditoria`; `entregarRequisicao` chama `assertConferidaSeObrigatorio` depois de
> `PODE_ENTREGAR`/`verificarBloqueioLiberacao` e **antes de qualquer baixa**), C4
> (`conferir_separacao: [ADMINISTRADOR, ALMOXARIFE]` com o comentário de critério; nenhum teste
> conta as ações — `minhasPermissoes` itera `Object.keys(ACAO_PERFIS)`, então a ação nova entra
> de graça). `carregarItensRequisicao` passou a trazer `ma.material_critico`.
> Teste `segundaConferencia.api.test.js`: **26 cenários**, vermelhos por asserção nos 19 que
> dependiam do serviço (200 !== 400, 0 !== 1, função ausente) antes da implementação.
> Placar: `test:api` **161/161** arquivos (segundaConferencia 26/26, separacaoComDono 9/9,
> requisicaoEstados 25/25, minhasPermissoes 10/10, permissoesRotas 51/51, auditLabels 14/14);
> `test:almoxarifado` **42/42**.
>
> **Controles positivos com alvo triplo** (md5 `fe988e72…` antes/restaurado nos três,
> `git diff --stat` vazio):
> (a) só a checagem JS da RN-03 removida → 25/26; cai **só** `[RN-03] PESO` com
> "A deveria levar 403, veio 409" — o `WHERE` segurou (A não conferiu), a mensagem piorou. É o
> no-op parcial que a Global Constraint 3 previu, e por isso a asserção é pela mensagem/status.
> (b) só o `NOT EXISTS` removido do `WHERE` (e o 4º param) → 25/26; cai **só**
> `[RN-03] o claim sozinho segura` com "o claim de quem separou passou: {id, conferido_em}". O
> sequencial e a corrida RN-03b **continuaram verdes** — exatamente o achado 2: sem o teste
> direto do claim, o `WHERE` seria invisível. **Não está vazio.**
> (c) `assertConferidaSeObrigatorio` removido de `entregarRequisicao` → 24/26; cai o cenário do
> achado 1 pela **asserção de saldo**: "a entrega baixou o saldo sem conferencia (50 -> 48);
> resposta 200" (a asserção de saldo foi posta ANTES da de status de propósito, para ser ela a
> falar), e cai também o de `PARCIALMENTE_ATENDIDA` sem conferência.
>
> **Divergências do previsto:** nenhuma de contrato. Três coisas que a Task 4 precisa saber:
> (1) **conferir só em `EM_SEPARACAO`** (C2, à risca). Consequência medida e testada: requisição em
> `PARCIALMENTE_ATENDIDA` com crítico separado e **sem** conferência (ex.: entregue antes desta
> etapa) leva 400 na entrega **e** 400 ao conferir ("status atual: PARCIALMENTE_ATENDIDA"). O
> caminho de saída é "Iniciar Separação" sem quantidade — o UPDATE de status é incondicional
> (RN-02) e a requisição volta a `EM_SEPARACAO` **sem rodada nova** (a conferência, se houvesse,
> ficaria), e aí outra pessoa confere. Descartado abrir a conferência em outros status antes de a
> Task 4 medir o fluxo pela rota; **registrar no fechamento** (letra B) e no guia.
> (2) A ordem dos erros no `liberar-retirada` é 404 → transição → `'Nenhum item separado'` →
> RN-06; na conferência é 400 user → 404 → 400 status → 400 sem item → 403 rodada → 409 claim. A
> Task 4 tem de conferir **rota+status**, não só a mensagem (`'Nenhum item separado'` existe nas
> duas, achado 10).
> (3) O 403 da RN-03 cita a **primeira** rodada do usuário (`ORDER BY id ASC LIMIT 1`), não a
> última — quem separou duas vezes vê o `#` da primeira.

**Arquivos:** `requisitionService.js` (`conferirSeparacao`, `conferenciaObrigatoria`),
`permissions.js`, `routes/almoxarifado.js` (rota nova + `liberar-retirada`),
`server/tests/api/segundaConferencia.api.test.js` (novo).

**TDD:**
- `[RN-05] PRODUCAO (sem conferir_separacao) -> 403 do requirePermission` (**controle positivo
  natural**: passa verde antes da ação existir? NÃO — sem a ação em `ACAO_PERFIS`, `can()` devolve
  `false` para **todos**, inclusive ALMOXARIFE; o teste que prova é o do caminho feliz do ALMOXARIFE).
- `[RN-05] ALMOXARIFE que nao separou confere -> 200, conferido_por_* gravados, auditoria CONFERENCIA_SEPARACAO`.
- `[RN-05] status fora de EM_SEPARACAO -> 400 citando o status`; `sem item separado -> 400`.
- `[RN-05] segunda conferencia -> 409`.
- **`[RN-03] PESO: separador da PRIMEIRA rodada tenta conferir -> 403`** (A separa; B separa; A
  confere → 403 com a mensagem citando `#<rodada.id>`; B confere → 403; C confere → 200).
- **`[RN-03] o claim sozinho segura`**: `claimConferencia(db, id, A)` com rodada de A já inserida
  (INSERT direto) → `undefined` e colunas continuam `NULL`; `claimConferencia(db, id, C)` → linha.
  **É este teste que fica vermelho quando o `NOT EXISTS` sai** (achado 2 — o de corrida não fica).
- `[RN-03b] estado final da corrida` (prova a **D3**, não o `WHERE`): `Promise.allSettled([
  requisitionService.separarRequisicao(db, id, itens, B), requisitionService.conferirSeparacao(db, id, B)])`
  **10 vezes** → em nenhuma iteração `conferido_por_id = B` **com** rodada de B. **No serviço**, não
  pela rota: o harness tem **um** `currentUser` global (`testApp.js:57-62`), corrida pela rota é
  sempre o mesmo usuário (achado 3).
- `[RN-05] duas conferencias simultaneas (C, D) no servico -> exatamente 1 cumprida, a outra 409`
  — prova o `conferido_por_id IS NULL` do `WHERE`, não o `NOT EXISTS`.
- `[RN-06] liberar-retirada com material critico SEPARADO e sem conferencia -> 400 mensagem literal`;
  `com conferencia -> 200`; `sem critico e sem conferencia -> 200` (comportamento de hoje, e
  `requisicaoEstados.api.test.js` continua verde); **`critico com quantidade_separada = 0` + comum
  separado → 200** (universo, achado 7).
- **`[RN-06] entregar direto de EM_SEPARACAO com critico separado e sem conferencia -> 400 e
  saldo intacto`** (o cenário do achado 1); `com conferencia -> 200 e baixa`; e em
  `PARCIALMENTE_ATENDIDA` **sem rodada nova** a conferência continua valendo → 200.
- `[RN-08] liberar-retirada audita LIBERACAO_RETIRADA`.

**Controle positivo com alvo duplo:** (a) remover só a checagem JS da RN-03 → o teste sequencial
**continua verde** (o `WHERE` segura) mas a **mensagem** muda de 403 para 409 → a asserção da
mensagem cai; diga isso. (b) remover só o `NOT EXISTS` do `WHERE` → o teste sequencial continua
verde (JS segura) e **o teste direto do claim** cai. Se ele **não** cair em (b), está vazio — pare
e reporte. (c) remover o `assertConferidaSeObrigatorio` de `entregarRequisicao` → o cenário do
achado 1 cai **com saldo baixado** (leia a asserção de saldo).

**Commit:** `Almoxarifado Etapa 28 Task 2: quem separou nao confere, e a barreira vive no WHERE`.

## Task 3 — Tela: rodadas, conferência e o botão (galho, worktree) — ✅ FEITA (`75b5d3d`)

> **Fechamento.** Entregue em worktree contra o contrato C3, **antes** das Tasks 1 e 2 no
> histórico (`75b5d3d` precede `f298536`): `RequisicoesList.js` + `RequisicoesList.test.js`.
> Client **593/593** em 39 suítes, `CI=true` build ok.
> **Divergência do C6:** o botão **"Confirmar Entrega"** em `PARCIALMENTE_ATENDIDA` **não ganhou o
> gate** `conferencia_obrigatoria && !conferencia` na tela — só o de `EM_SEPARACAO`. O backend
> recusa de qualquer jeito (Task 2, `assertConferidaSeObrigatorio` em `entregarRequisicao`, cenário
> `[RN-06] em PARCIALMENTE_ATENDIDA ... SEM conferencia -> 400`), então o usuário vê o
> `toast.error` com a mensagem da RN-06 em vez do botão desabilitado. Fica para o fechamento
> decidir se vale um commit de tela (é um `disabled`+`title` a mais) — registrar na letra B.

**Arquivos:** `client/src/components/almoxarifado/RequisicoesList.js`, `RequisicoesList.test.js`.
Contrato C3/C6. Mock **só** na fronteira HTTP (`api.get/put`), como os testes existentes do arquivo.

**Testes Jest:** (1) modal lista as rodadas com nome e contagem; (2) botão "Conferir separação"
aparece em `EM_SEPARACAO` sem conferência e chama `PUT .../conferir-separacao`; (3) com
`conferencia` preenchida mostra "Conferida por"; (4) `conferencia_obrigatoria && !conferencia`
desabilita "Liberar para Retirada"; (5) sem `pode('conferir_separacao')` o botão bloqueia (padrão
`bloquearSeNaoPode`).

`CI=true npx react-scripts test --watchAll=false` e `CI=true npx react-scripts build`.

**Commit:** `Almoxarifado Etapa 28 Task 3: a tela mostra quem separou e permite conferir`.

## Task 4 — Integração cruzando as rotas (tronco) — ✅ FEITA (`9b2f180`)

> **Fechamento (2026-08-30).** `server/tests/api/separacaoFluxoCompleto.api.test.js`, **3
> cenários** (Fluxo 1, Fluxo 2, Fluxo 3), tudo pela rota com `setUser` entre chamadas: a
> requisição nasce por `POST /requisicoes` (PRODUCAO, rascunho) → `POST /enviar` (PRODUCAO) →
> `PUT /aprovar` (ALMOX A, ≠ solicitante) com **reserva real** (`TOTALMENTE_RESERVADA`, 2
> reservas); os `item_id` vêm do `GET /requisicoes/:id`. Só saldo inicial e `material_critico`
> continuam UPDATE direto no material (não há rota de escrita para eles no harness).
> Verdes de primeira — e o controle positivo abaixo prova que o teste sabe cair.
>
> **O que o Fluxo 2 mediu, na ordem** (o roteiro do plano, sem desvio): A separa crítico 2 +
> comum 2; B separa comum 1 → `GET` com 2 `separacoes` (A, B), `conferencia: null`,
> `conferencia_obrigatoria: true`; A confere → 403 citando `#<rodada de A>`; B → 403 `#<rodada de
> B>`; `entregar` → 400 **mensagem literal da RN-06** e saldo 50 intacto; `liberar-retirada` →
> 400 mesma mensagem; C confere → 200 e `GET conferencia.usuario_id === C`; liberar → 200
> `PRONTA_PARA_RETIRADA`; trilha em ordem de id = `SEPARACAO(A), SEPARACAO(B),
> CONFERENCIA_SEPARACAO(C), LIBERACAO_RETIRADA(A)`; entrega parcial (crítico 1) →
> `PARCIALMENTE_ATENDIDA`, saldo 49; `entregar` de novo **sem rodada nova** (comum 1) → 200 e a
> conferência de C continua no `GET`; A separa crítico +1 → `EM_SEPARACAO`, `conferencia: null`
> (RN-07), 3 rodadas; `entregar` → 400 de novo, saldo 49; **C confere de novo → 200** (não é
> 409: a conferência anterior foi apagada pela rodada, então o claim volta a passar); entrega o
> resto (crítico 3, comum 4) → `ENTREGUE`, saldos 46/45; trilha final com 6 linhas.
> Fluxo 1: crítico com `quantidade_separada = 0` + comum separado → `entregar` direto 200
> (`PARCIALMENTE_ATENDIDA`), `GET conferencia_obrigatoria: false`. Fluxo 3: PRODUCAO → 403 do
> `requirePermission` (`acao: conferir_separacao` / `separar_emitir`) numa requisição **sem
> rodada** — se a regra falasse antes do perfil, viria 400 — e nada gravado.
>
> **Placar** (suíte completa serial): `test:api` **162/162** arquivos (novo 3/3);
> `test:almoxarifado` **42/42**; `test:validation` 4/4; `test:safealter` 3/3; `test:sqlite` 5/5;
> client **593/593** em 39 suites; `CI=true build` limpo.
>
> **Controle positivo** (md5 `feaf1caa…` antes/restaurado, `git diff --stat` vazio):
> `assertConferidaSeObrigatorio` removido **só da rota `liberar-retirada`** → 2/3; cai o Fluxo 2
> na asserção `liberar: esperava 400, veio 200: {"success":true,"status":"PRONTA_PARA_RETIRADA"}`
> — o passo anterior (`entregar → 400`) **continuou verde**, porque essa barreira mora no serviço.
> É a prova de que as duas saídas são guardadas separadamente, e de que o teste distingue uma da
> outra.
>
> **Divergências / achados de integração: nenhuma de contrato.** O backend das Tasks 1 e 2 bateu
> com o roteiro do plano sem ajuste de código. Duas medições que a Task 2 pediu, agora feitas
> pela rota: (1) depois de `PARCIALMENTE_ATENDIDA`, a conferência **continua valendo** para a
> entrega seguinte sem rodada nova (D3 só limpa com rodada), e uma rodada nova devolve a requisição
> a `EM_SEPARACAO` com `conferencia: null` — onde a conferência é possível de novo, sem cair no
> "só em `EM_SEPARACAO`"; (2) conferir de novo depois da limpeza é 200, não 409 — o `IS NULL` do
> claim é sobre o estado atual, não sobre "já houve conferência um dia". Fica para o fechamento
> (letra B): a conferência **repetida** (mesma pessoa C nas duas rodadas) é aceita — o critério é
> "não separou", não "não conferiu antes".

Arquivo próprio `separacaoFluxoCompleto.api.test.js`, **tudo pela rota** (`setUser` entre
chamadas): material crítico + material comum na mesma requisição, aprovada por reserva real (rota
`/aprovar`), A separa **só o comum** → liberar → 200? **Não**: primeiro `entregar` direto → 200
(sem crítico separado, RN-06 não vale) — volta para o começo com requisição nova; A separa os
dois, B separa mais, A confere → 403, **entregar → 400 e liberar → 400** (crítico separado sem
conferência; conferir **rota+status**, não só a mensagem — `'Nenhum item separado'` existe em duas
rotas, achado 10), C confere → 200, liberar → 200 + auditoria com `SEPARACAO`×2,
`CONFERENCIA_SEPARACAO`, `LIBERACAO_RETIRADA` em ordem; entrega parcial → `PARCIALMENTE_ATENDIDA`
→ entregar de novo **sem rodada nova → 200** (conferência vale) → A separa de novo → conferência
**limpa** (RN-07) → entregar → 400 de novo.

Suíte completa serial (os cinco comandos da `fechar-etapa`).

## Fix-round 1 (Fase 5) — ✅ FEITO (`5a3d593`)

> **Contexto (2026-08-30).** Dois revisores adversariais (scripts `refuta28.js` e `repro28.js`)
> acharam **seis** furos, um bloqueante. **A raiz comum dos dois graves:** `quantidade_separada`
> mudava por **dois caminhos sem rodada** — a escrita parcial de `separarRequisicao` (F1) e a
> entrega de crítico além do separado (F2). A barreira RN-03 e a régua RN-06 apoiam-se na rodada;
> sem rodada, não há dono, e a conferência vira teatro. TDD em cada achado: vermelho **por
> asserção** antes do fix (F1 "item válido gravado apesar do 400, quantidade_separada = 3"; F4
> "dados_anteriores = null"; F2 "saldo 40; resposta 200"; F5 pelo GET e pela régua unitária), verde
> depois. F3 e F6 já passavam com o código certo — são sobre **mutação**, provados nos controles.

| # | Gravidade | Achado | Fix | Teste (nome) |
|---|---|---|---|---|
| F1 | **bloqueante** | laço de `separarRequisicao` gravava item a item e lançava 400 no meio: item válido gravado **sem rodada**; depois `[]` → `EM_SEPARACAO`, quem separou conferia (200) e entregava | duas passadas: validar **todas** as entradas (calcular `max` de cada) antes de qualquer escrita | `separacaoComDono` `[RN-01] payload misto valido+invalido -> 400 e NADA gravado` (serviço **e** rota) |
| F2 | importante | `maxEntregar` (Etapa 3) solta o teto do separado após entrega parcial: crítico 10/sep 1/conf/ent 1 → `entregar 9` = 200 `ENTREGUE` sem rodada nem conferência | guarda em `entregarRequisicao`, só `material_critico = 1`, antes de qualquer baixa: `qty > max(0, separado − entregue)` → 400 `'<nome>: material crítico só sai depois de separado e conferido — <qty> excede o separado ainda não entregue (<n>). Separe o restante e peça a segunda conferência.'` | `segundaConferencia` `[RN-06] critico nao sai alem do separado na segunda entrega -> 400 e saldo intacto` + `material COMUM na mesma situacao ... -> 200 (Etapa 3 preservada)` |
| F3 | importante | `itens_tocados` sem teste: mutação "sempre 1 no INSERT" sobrevivia 38/38 | (teste) contagens lidas do **GET** | `separacaoFluxoCompleto` Fluxo 2 |
| F4 | importante | "releitura antes do UPDATE" não provada (mutação "usar `reqRow` inicial" sobrevivia) e janela real: conferência entre releitura e UPDATE apagada com `dados_anteriores: null` | **compare-and-clear**: `UPDATE ... WHERE id=? AND conferido_por_id IS <relido>`; `changes = 0` → relê e repete (máx. 3; depois limpa sem compare com `console.warn` — o estado seguro é "limpa") | `separacaoComDono` `[RN-07] compare-and-clear: conferencia que entra ENTRE a releitura e o UPDATE ...` (hook one-shot em `db.get`) |
| F5 | menor | universo "crítico separado" incluía crítico **já entregue**: crítico 1 sep/conf/ent + rodada nova só de comum → `conferencia_obrigatoria: true`, entregar comum → 400 | `conferenciaObrigatoria` = `crítico && (separado − entregue) > 0`; D2 e RN-06 corrigidas acima | `segundaConferencia` `[RN-06] critico ja ENTREGUE nao esta mais na caixa ...` + régua unitária em `separacaoComDono` |
| F6 | menor | RN-03b aceitava "B conferiu com sucesso" sem exigir que a rodada de B registrasse a conferência apagada | (teste) quando `conferir(B)` é fulfilled, a auditoria `SEPARACAO` de B tem `dados_anteriores.conferencia.usuario_id === B` | `segundaConferencia` `[RN-03b]` |

**O Fluxo 2 mudou de propósito** (cabeçalho de `separacaoFluxoCompleto.api.test.js` explica):
entregava 3 críticos com 2 separados-não-entregues e afirmava 200 — agora afirma o **400** de F2
com saldos intactos, entrega só o separado (crítico 2 + comum 4 → `PARCIALMENTE_ATENDIDA`) e fecha
em `ENTREGUE` por uma rodada a mais (A separa +1, C confere, entrega 1). Saldos finais iguais
(46/45); trilha final com **8** linhas.

**Scripts dos revisores depois do fix:** A1 crítico fica 0, conferir → 400 "Nenhum item separado",
entregar → 400, saldo 50→50, GET sem conferência; A2 crítico 1→1, entregar 6 → 400, saldo intacto;
A3/R2 `entregar 9` → 400, saldo 49→49, item 1/1; A9 `conferencia_obrigatoria: false`, comum sai
200 `ENTREGUE`; R1 D recusado (400, sem item separado), trilha vazia; R1b conferência de C fica
(a caixa **não** mudou — nada foi gravado) e `entregar 6` → 400 "excede o separado ainda não
entregue (1)"; R3 `conferido_por_id` final NULL **e** a rodada de B traz
`dados_anteriores.conferencia.usuario_id = 43` (o "409" que o script imprime é a **segunda**
chamada do hook dele, que não é one-shot: a primeira conferência de C passou e está na trilha).

**Placar** (suíte completa serial): `test:api` **162/162** arquivos (separacaoComDono **11/11**, segundaConferencia **29/29**, separacaoFluxoCompleto **3/3**); `test:almoxarifado` **42/42**; `test:validation` 4/4; `test:safealter` 3/3; `test:sqlite` 5/5; client **593/593** em 39 suítes; `CI=true build` compilado (o front não mudou).

**Controles positivos** (depois do commit; md5 antes/sabotado/restaurado, `git diff --stat` vazio
nos quatro): md5 `9a8d9b44…` antes/restaurado nos quatro. (1) laço a uma passada só (UPDATE do item dentro da passada 1) → separacaoComDono 10/11, cai **F1** com "o item valido foi gravado apesar do 400 (quantidade_separada = 3)". (2) guarda de crítico removida de `entregarRequisicao` → segundaConferencia 28/29, cai **F2** pela asserção de **saldo** ("o critico saiu sem ser separado (saldo 40); resposta 200"), e o Fluxo 2 cai em "o critico saiu alem do separado (resposta 200)". (3) `itens_tocados` sempre 1 no INSERT → Fluxo 2 cai em "a rodada de A tocou 2 itens; a coluna diz 1" — e separacaoComDono **continua 11/11** (é exatamente a mutação que sobrevivia antes de F3). (4) `reqRow` inicial na limpeza (a releitura acontece, mas é ignorada) → separacaoComDono cai **F4** com "a conferencia de C foi apagada sem aparecer na trilha (dados_anteriores = null)" **e** segundaConferencia cai **F6** (RN-03b, "B conferiu (fulfilled) mas a rodada de B nao registrou a conferencia apagada: null") — F6 não é vazio.

**Dois achados que NÃO viraram código** (para o fechamento, letra B):
- (a) requisição com item separado **antes** da Etapa 28 não tem rodada — qualquer ALMOXARIFE
  confere, **inclusive quem separou**. Fato de migração; recusar travaria crítico legado, porque
  `maxSeparar` é 0 (tudo já separado) e não há como abrir rodada nova. Fica escrito no guia.
- (b) `dbGet` com `UPDATE ... RETURNING` (`claimConferencia`) roda **fora** da `writeChain` do
  `sqliteConcurrency`, e um erro de `finalize` não chega ao callback — padrão pré-existente de
  todo `get` da base, fora do escopo desta etapa.

## Fechamento (Fase 6) — ✅ FEITO (2026-08-29)

Os 7 artefatos: novidades (seção Etapa 28, "Onde estamos", **B62** = D2, **B63** = conferir só em
`EM_SEPARACAO`, nota na **B57**, furos **C37**/**C38**, fragilidade **G9**), spec 05 (status,
checklist com hash, bloco "Etapa 28"), spec 23 (item da dupla conferência marcado "pago nesta
forma"), mapa (cabeçalho + linha 05), guia (cabeçalho + seção com roteiro de dois logins), este
plano, manual (§5.5 linha nova, §7.5 teto do crítico, §10.1-10.4 reescritos, §10.5 renumerado).
O "C36" que esta seção previa **não foi criado**: C36 já existia (Etapa 27) e "a conferência não
tem tela de fila" não é furo — a conferência mora no detalhe da requisição, onde a separação já
morava. Os números da verificação final estão no commit de fechamento e no mapa.

### Retro de 4 números

1. **Rodadas de correção até verde:** 1 (fix-round único com seis achados; nenhum teste repetiu
   vermelho em rodadas seguidas).
2. **Achados da revisão:** Fase 2 (plano): 12, **2 bloqueantes reais** (barreira só na
   liberação; teste de corrida vazio para o `NOT EXISTS`), 10 importantes/menores, todos
   incorporados. Fase 5 (código): 11 achados de dois revisores, **6 reproduzidos e corrigidos**
   (A1/A2 escrita parcial, A3 teto do crítico, A4 releitura, A5 universo, F3/F6 mutações
   sobreviventes), **2 declarados sem código** (C37 legado, G9 `RETURNING` fora da fila),
   **3 refutados/não-achados** (tipos de id, perfil, cópia). Ruído: 0 — todo achado veio com
   reprodução.
3. **Paralelismo:** 2 galhos rodaram em paralelo de fato (Task 1 backend × Task 3 front, na
   mesma árvore, diretórios disjuntos), sem retrabalho; Tasks 2 e 4 sequenciais por dependerem
   das funções da 1. A Task 3 trabalhou contra o contrato congelado antes de o backend existir e
   **nada precisou mudar** quando ele chegou.
4. **Defeito que escapou:** a preencher na Etapa 29.

## Próxima tarefa detalhada

### A etapa escolhida: 29 — a tela das medidas de inspeção (feature 09, furos C34/C35, alerta B60)

**Por quê esta:** é a "próxima tarefa detalhada" que a Etapa 27 deixou — ela entregou plano de
inspeção, medidas e divergência derivada **sem tela**, e nomeou C34 (formulário sem campos de
medida) e C35 (medidas gravadas sem quem as leia) como o que falta. A feature 05 acabou de ser
tocada e o que resta nela (lista de separação, picking, kits) é fluxo inteiro novo, não
fechamento. As outras 🟡 do mapa (00, 02, 06, 08, 21, 22) estão em "adiado por decisão" ou
"segunda porta" (medido nas Fases 0 das Etapas 27 e 28).

**Contrato que a tela consome (entregue na Etapa 27, `063f3ce..cdb64a6`):**
- `GET /api/almoxarifado/planos-inspecao?material_id=<id>` → características ativas do material
  (`id`, `caracteristica`, `unidade`, `valor_nominal`, `desvio_inferior`, `desvio_superior`).
  Sem `material_id` → 400 *"Material é obrigatório"*.
- `POST /api/almoxarifado/recebimentos/itens/:id/inspecionar` aceita
  `medidas: [{ plano_id, valor_medido, ferramenta_id? }]` junto da decisão; responde
  `divergencia_dimensional` (derivada) e `medidas_registradas`. Recusas literais: *"Valor medido
  inválido para "<caracteristica>": informe um número (use ponto decimal)"*, *"Ferramenta com
  calibração vencida ou sem calibração registrada (<nome>)"*, e medida de característica fora do
  plano. Nenhuma recusa move saldo.
- Gate `inspecionar` (ADMINISTRADOR, ALMOXARIFE, QUALIDADE); plano gerenciado por
  `gerenciar_plano_inspecao` (ADMINISTRADOR, QUALIDADE, ENGENHARIA).

**Pontos de atenção para a Fase 0 (medir antes de desenhar):**
- **B60 é a regra da etapa:** com medidas na tela, a caixa *Divergência dimensional* tem de virar
  **somente leitura e explicada** ("derivada das medidas") — senão a tela mostra uma coisa e o
  banco grava outra. Sem plano para o material, a caixa continua manual.
- **C35 pede leitura:** medir se existe `GET` das medidas de uma inspeção concluída. Pela Etapa 27
  provavelmente **não existe** — e a fila `/inspecoes/pendentes` só traz o não decidido. Se não
  houver, a etapa precisa do endpoint de leitura (aditivo) antes da tela de histórico.
- **Instrumento:** o seletor precisa vir do cadastro de ferramentas com calibração (feature 16);
  medir qual rota lista ferramentas e se ela expõe `calibracao_vencida`/próxima calibração — a
  tela deve **mostrar** vencido, não só receber o 400.
- **Plano por família (B59) continua aberta** — a tela não deve assumir herança.
- **`InspecoesAlmoxarifado.js`** já tem `EPS` próprio (`:126`, citado no plano da 27): não
  duplicar a régua no client; a derivação é do servidor, a tela só mostra o resultado.
- Ler `specs/modulo-almoxarifado/09-inspecao-qualidade/README.md` e o bloco "Etapa 27" **antes**
  de varrer o client — regra da skill: a spec já mediu.
