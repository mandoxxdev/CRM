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

**D2 — A conferência é OBRIGATÓRIA só quando há material crítico SEPARADO** (`material_critico`,
`schema.js:776`, existe desde a Etapa 2; universo = itens com `material_critico = 1` **e**
`quantidade_separada > 0` — item crítico ainda aguardando estoque não está na caixa, achado 7).
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
| RN-06 | `liberar-retirada` **e `entregar`** exigem conferência quando há material crítico **separado**; sem crítico, seguem como hoje | `segundaConferencia` (as duas rotas) |
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
// conferenciaObrigatoria(itens) -> itens.some(i => Number(i.material_critico) === 1 && num(i.quantidade_separada) > 0)
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

## Task 1 — A separação ganha dono, rodada e rastro (tronco)

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

## Task 2 — Segunda conferência com barreira no WHERE (tronco)

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

## Task 3 — Tela: rodadas, conferência e o botão (galho, worktree)

**Arquivos:** `client/src/components/almoxarifado/RequisicoesList.js`, `RequisicoesList.test.js`.
Contrato C3/C6. Mock **só** na fronteira HTTP (`api.get/put`), como os testes existentes do arquivo.

**Testes Jest:** (1) modal lista as rodadas com nome e contagem; (2) botão "Conferir separação"
aparece em `EM_SEPARACAO` sem conferência e chama `PUT .../conferir-separacao`; (3) com
`conferencia` preenchida mostra "Conferida por"; (4) `conferencia_obrigatoria && !conferencia`
desabilita "Liberar para Retirada"; (5) sem `pode('conferir_separacao')` o botão bloqueia (padrão
`bloquearSeNaoPode`).

`CI=true npx react-scripts test --watchAll=false` e `CI=true npx react-scripts build`.

**Commit:** `Almoxarifado Etapa 28 Task 3: a tela mostra quem separou e permite conferir`.

## Task 4 — Integração cruzando as rotas (tronco)

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

## Fechamento (Fase 6)

Skill `fechar-etapa`: novidades (B62 = D2; C36 = "a conferência não existe para requisição sem
tela de fila"; furos), spec 05 (marcar "responsável" e "segunda conferência", dizer o que fica),
spec 23 (perna Segurança: dupla conferência em material crítico **pago** nesta forma), mapa, guia
(seção Etapa 28 com roteiro: precisa de **dois** usuários com perfil ALMOXARIFE), retro de 4 números.

## Próxima tarefa detalhada

(preencher no fechamento)
