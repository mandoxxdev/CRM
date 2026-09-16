# Etapa 36 — Recebimento: as duas portas param de aceitar qualquer coisa: implementação

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` para
> executar este plano task a task. Os passos usam checkbox (`- [ ]`). Antes da primeira task, leia
> `.superpowers/sdd/etapa36-fase0-medicao.md` (a medição, com `arquivo:linha` de tudo e duas sondas
> **executadas**) e o design abaixo. **Onde a medição e este plano divergirem, vale a medição** — e
> onde este plano decidiu contra a proposta da medição ou contra a proposta do controlador, está
> dito, com o motivo e o descartado, na seção "Decisões desta etapa" do design.

**Goal:** fechar as **duas portas de escrita** do recebimento, que hoje aceitam qualquer coisa:
`tipo_recebimento: 'BANANA<script>'` entra com **201** (medido), a **mesma NF do mesmo fornecedor**
entra duas vezes e credita **20** em vez de 10 com **2 contas a pagar** (medido), o **excedente** não
tem barreira nenhuma, e o alerta de divergência de quantidade que o manual promete **não tem produtor
alcançável pela tela** porque não existe campo para dizer quanto chegou de verdade. Mais duas dívidas
pequenas: o teste `avancar etapa fora de ordem falha`, exigido pela spec desde 2026-08-11, e a linha
do `loadingDetalhe` em duas telas.

**Architecture:** enum com **fonte única** em `schema.js` validado por **`z.looseObject`** nas duas
rotas; guarda de NF duplicada **no serviço** (`receiptService`), chamada pelos **dois** escritores, com
índice **não único**; ação nova **`autorizar_excedente`** em `ACAO_PERFIS` checada **no serviço** por
`can()` (molde `ownerRules.assertAjustePermitido`), nas duas portas que escrevem quantidade; e, no
client, o **primeiro chamador** de `PUT /recebimentos/:id/conferir`, que destrava o alerta
`DIVERGENCIA_RECEBIMENTO`.

**Tech Stack:** Express + SQLite (`server/`), Zod **4.4.3** (com `z.looseObject`, e mensagem de enum
padrão **em inglês**); React CRA (`client/`), testes com `createRoot` + `act` — ⚠️
`@testing-library/react` **não está instalado** nesta base.

**Spec:** `docs/superpowers/specs/2026-09-16-almoxarifado-etapa36-recebimento-portas-design.md` — leia
junto; as **RN-11 a RN-19**, as 11 decisões (com o descartado) e os 10 riscos estão lá.

---

## Global Constraints

- **Autorização em duas camadas, e o backend decide.** `checkModulePermission('almoxarifado')` abre as
  telas (`routes/almoxarifado.js:282-285`); `ACAO_PERFIS` + `requirePermission` autoriza agir
  (`permissions.js`); `getPerfilFromUser` faz fallback para **`PRODUCAO`**. **`validate(...)` entra
  DEPOIS do `requirePermission`** — 403 antes de 400, como nas rotas de `configurar`
  (`extended.js:478`). `GET /almoxarifado/minhas-permissoes` existe **só** para a UI barrar antes do
  formulário e **falha aberto de propósito**: nenhuma decisão de segurança desta etapa mora no client.
- **Almoxarifado é área física, não filial.** Saldo global por material é correto e intencional. Nada
  aqui propõe seletor de almoxarifado nem segregação de saldo.
- **Testes de servidor só em `server/tests/api/*.api.test.js`** — o runner descobre **apenas** esse
  padrão. Cada arquivo tem **runner próprio** (`test()`, contador `passed`/`failed`, `process.exit`),
  harness `server/tests/helpers/testApp.js` com `requirePermission` **REAL** (`setUser` com usuário
  sem perfil → **403**).
- **Validação é Zod**, via `validate()` de `services/almoxarifado/validation.js`, que **substitui
  `req.body` por `parsed.data`**. Nesta base é **Zod 4.4.3**: `z.looseObject` existe, e enum novo
  **carrega mensagem própria** (o padrão sai em inglês — medido).
- **Enum com fonte única.** `TIPOS_RECEBIMENTO` nasce e é exportado de `schema.js`, no padrão de
  `TIPOS_REQUISICAO`/`TIPOS_MOVIMENTO`. Proibido repetir o array em `schemas.js` ou deixar o literal
  de `receiptService.js:108`.
- **`schemas.js` exporta por LISTA FECHADA.** Esquecer a linha no `module.exports` deixa o binding
  `undefined` e faz a rota morrer em `undefined.safeParse` — **500 com stack**, depois do gate. Está
  escrito no comentário do `AnexoCreateSchema`, e já aconteceu.
- **O comando de teste do client leva CAMINHO, não `-t`.** `-t` é `--testNamePattern` e devolve
  `N skipped, exit 0` — achado nº 1 da Fase 2 da Etapa 32. Use
  `cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/Arquivo.test.js`.
- **Português com acento** no código, nos comentários, nas mensagens de tela e nas literais de erro;
  **sem acento no corpo do commit**.
- **Nunca `git add -A` na raiz** — há artefatos de runtime em `server/data/` e `server/uploads/`. Na
  árvore de abertura desta etapa há também `server/data/database.sqlite.bak`, `server/nodemon.json` e
  `docs/bkp_bancoprod.md` **não versionados**: `git add` só dos caminhos que a task tocou.
- **Um commit por assunto**, em português, explicando **por quê**: qual era o bug, qual a
  consequência, o que foi decidido e o que foi descartado.
- **Nenhum commit com a suíte vermelha.** As rodadas RED existem para **ler o número**, e o commit é
  da task que leva teste + conserto juntos.
- ⚠️ **Harness de sabotagem nesta máquina — duas regras aprendidas por falha:**
  - **`python3` NÃO existe no Git Bash desta máquina.** É o alias da Microsoft Store
    (`/c/Users/User/AppData/Local/Microsoft/WindowsApps/python3`), que imprime *"Python was not found;
    run without arguments to install from the Microsoft Store…"* e **não executa nada** — no-op
    silencioso. Use **`perl -0pi -e`** (`/usr/bin/perl` existe) ou **`sed`**. Se for usar
    interpretador, `command -v` + uma execução trivial (`perl -e 'print 1'`) **antes** da sabotagem.
    A `fechar-etapa` já foi corrigida neste ponto (`b95649c`).
  - **NUNCA restaure com `git checkout -- <arquivo>`** enquanto houver conserto ainda não commitado
    nesse arquivo: as sabotagens rodam **antes** do commit da task, então o `checkout` descarta a
    sabotagem **e o conserto** juntos — e o `git diff --stat` vazio, que a regra manda exigir, passa a
    ser **erro**, não sucesso. Restaure por **perl inverso** ou por **cópia de segurança no
    scratchpad**, e confira que o `md5sum` volta ao valor **pós-conserto**, não ao de HEAD.
  - Antes de cada sabotagem: `grep -cF '<ancora>' arquivo` **tem de dar exatamente 1**. Se der 0 ou
    mais de 1, **aborte** e escolha outra âncora.
  - `md5sum` **antes**, **depois da sabotagem** e **depois de restaurar**; `git diff --stat` tem de
    voltar com **só** os arquivos da task.
  - **Leia QUAL asserção caiu, não só o placar.** Se a asserção que guarda o achado não caiu, o
    controle **não valeu**: acrescente a sabotagem que a atinge, não troque por outra que funcione.
  - **Sabotagem que não derruba nada é um achado**, não um detalhe — e há dois motivos opostos:
    *falta asserção* (escreva o cenário) ou *o defeito virou inalcançável* (mantenha a forma segura e
    **declare** que a suíte não a protege). A T6 desta etapa é declaradamente do segundo tipo.
- **Scratchpad com nome único por agente** (`msg-<assunto>.txt`, `bkp-<arquivo>-<task>`): o diretório
  é compartilhado, e na Etapa 25 um executor sobrescreveu a mensagem de commit do outro.

---

## ⚠️ O modo de falha desta etapa: o teste que passa provando nada

Esta etapa é quase toda **regra nova em porta aberta**, e por isso o risco não é o vermelho — é o
**verde vazio**. Cinco modos, todos medidos ou nomeados por regra da `fechar-etapa`:

1. **O strip do Zod mata o POST inteiro, e um teste que só cheque o 400 do enum não vê.** Medido: com
   `z.object`, `nota_fiscal` e `itens` **somem** do body e **todo** `POST` válido responde
   `400 "Inclua ao menos um item"`. O cenário que pega isso é o **positivo de quatro colunas** da
   RN-11 — não o negativo.
2. **A asserção de "2 contas a pagar" é vazia por padrão.** `gerarContaPagar` devolve `null` quando a
   tabela não existe (`receiptService.js:648-650`), e **nenhum** dos 169 arquivos de `tests/api/` cria
   `contas_pagar` (`grep -rn contas_pagar server/tests/api/*.api.test.js` → **vazio**; a sonda da Fase
   0 criou a tabela, e é por isso que ela mediu 2 linhas). Sem criar a tabela, `COUNT === 1` passa com
   **0 de cada lado**, antes e depois do conserto. **A T2 cria a tabela e mede o 2 ANTES do conserto.**
3. **Asserção negativa de permissão NÃO fica vermelha na rodada TDD.** Regra explícita da
   `fechar-etapa`: `can()` devolve `false` para ação que não conhece, então "ALMOXARIFE não pode
   `autorizar_excedente`" passa **verde antes de a ação existir**. A prova é o par no **mesmo**
   cenário: **403** do ALMOXARIFE **e 200** do GESTOR.
4. **`toast` é mockado no client** (`RecebimentosAlmoxarifado.test.js:42-44`) — toda asserção tem de
   ser sobre o **DOM** ou sobre `api.put`/`api.post`, nunca sobre o toast.
5. **O fallback do mock de client REJEITA, mas não para tudo.** `/almoxarifado/recebimentos` está
   mapeada e **resolve**; para forçar erro, **sobrescreva** `api.get.mockImplementation` (molde
   `HistoricoInspecoes.test.js:211-216`). E o `PUT /conferir` precisa de mock de `api.put` no
   `beforeEach` — hoje `api.put` é um `jest.fn()` sem implementação, que devolve `undefined` e faz
   `await` em `undefined` passar: **dê-lhe `mockResolvedValue({ data: { success: true } })`**, senão o
   `catch` da tela engole e o cenário fica verde sem o payload.

### Quatro regras herdadas, e valem para TODAS as tasks

**(i) Metade positiva dentro de cada cenário negativo.** "Recusa com 400" passa se a rota recusar
tudo; "não mostra o aviso" passa com a tela vazia. Toda recusa vem acompanhada do caso que **tem** de
passar (o POST válido de quatro colunas, o `recebida === esperada`, a NF de fornecedor diferente, o
GESTOR com 200).

**(ii) Conte as chamadas, não use `toHaveBeenCalledWith` solto.** Ele é satisfeito por 1, 2 ou 10.
Asserção de chamada é `api.put.mock.calls.filter(...)` + `toHaveLength(n)`, e o **payload** é lido de
`api.put.mock.calls[0][1]`.

**(iii) Nenhum id de fixture `1`, nem o primeiro da lista.** No client, Recebimentos `41`/`58`/`77`/
`91`, com o painel dos cenários novos no **58** (item `581`). No servidor, ids vêm do banco em memória
— nos cenários que citam id na mensagem, **leia o id do `INSERT`**, nunca escreva `1`; e o usuário de
teste não é `id: 1` (use `64`/`65`/`66`, como `minhasPermissoes.api.test.js`).

**(iv) Sabotagem que derruba a suíte por `TypeError` não é controle positivo.** Se o componente lança
no primeiro render, **todos** os cenários caem juntos e nenhum provou nada. No servidor o equivalente é
sabotar o `module.exports` de `schemas.js`: derruba **todas** as rotas com 500. Essa sabotagem existe
(T1, nº 3) **de propósito**, e a leitura é "qual arquivo ficou inteiro vermelho", não "qual asserção" —
está dito lá.

---

## Contratos de API congelados

Front e back andam por estes. **Mensagem literal entre aspas é a que vai no código e no manual** — não
aproximar, não reescrever.

### 1. `POST /api/almoxarifado/recebimentos` — `extended.js:973`

| | |
|---|---|
| **Gate** | `auth` + `checkModulePermission('almoxarifado')` + `requirePermission('receber_material')` → `[ADMINISTRADOR, ALMOXARIFE, COMPRAS]` |
| **Validação nova** | `validate(RecebimentoCreateSchema)`, **depois** do `requirePermission` |
| **Payload** | inalterado (`pedido_compra_id`, `pedido_compra_numero`, `tipo_recebimento?`, `nota_fiscal?`, `fornecedor_id?`, `fornecedor_nome?`, `fornecedor_cnpj?`, `observacoes?`, `itens[]`) — o schema é **`looseObject`**, então **nada mais é descartado** |
| **201** | `{ id, numero, status: 'RECEBIDO' }` (inalterado) |
| **400 (enum)** | `{ error: 'Dados inválidos — tipo_recebimento: forma de recebimento inválida (use NOTA_FISCAL ou PEDIDO_COMPRA)' }` |
| **409 (NF duplicada)** | `{ error: 'Nota fiscal <numero da NF> já lançada no recebimento <numero do REC> para este fornecedor' }` |
| **400 (sem item)** | `{ error: 'Inclua ao menos um item' }` (inalterado, `receiptService.js:126`) |
| **403** | `{ error: 'Sem permissão para esta operação', acao: 'receber_material', perfil: 'PRODUCAO' }` (inalterado) |

### 2. `PUT /api/almoxarifado/recebimentos/:id/fiscal` — `extended.js:1098`

| | |
|---|---|
| **Gate** | idem acima (`receber_material`) |
| **Validação nova** | `validate(RecebimentoFiscalSchema)`, **depois** do `requirePermission` |
| **Payload** | inalterado, mais o campo opcional **`autorizar_excedente: boolean`** |
| **200** | `{ success: true }` (inalterado) |
| **400 (enum)** | **a mesma literal** do POST — constante única no schema |
| **409 (NF duplicada)** | a mesma literal do POST; a busca **exclui o próprio documento** |
| **400 (excedente sem flag)** | `{ error: 'Quantidade recebida (<recebida>) maior que a esperada (<esperada>) no item #<id do item> — marque a autorização de excedente para registrar' }` |
| **403 (flag sem permissão)** | `{ error: 'Autorizar recebimento acima do pedido exige a permissão "autorizar_excedente" (seu perfil: <PERFIL>).' }` |
| **400 (status)** | `{ error: 'Dados fiscais só podem ser editados antes do processamento' }` (inalterado) |

### 3. `PUT /api/almoxarifado/recebimentos/:id/conferir` — `extended.js:980`

| | |
|---|---|
| **Gate** | `requirePermission('receber_material')` — **medido, não suposto** |
| **Payload (congelado para o client)** | `{ status?: <status válido>, autorizar_excedente?: boolean, itens: [{ id, quantidade_recebida, conferencia_quantidade?, conferencia_descricao?, observacoes?, series? }] }` |
| **O que o client manda (T5)** | `{ itens: [{ id, quantidade_recebida: <número>, conferencia_quantidade: <bool> }] }` — **sem `status`**, para não avançar o workflow, e **um objeto por item do painel** |
| **200** | `{ success: true }` (inalterado) |
| **400 (excedente sem flag)** | a mesma literal do `/fiscal` |
| **403 (flag sem permissão)** | a mesma literal do `/fiscal` |
| **400 (status inválido)** | `{ error: 'Status inválido' }` (inalterado) |
| **Mudança de comportamento (T3)** | o `UPDATE` de item passa a usar **`COALESCE`** nas cinco colunas, no molde já escrito em `salvarDadosFiscal` — hoje `quantidade_recebida = ?` e `observacoes = ?` **sobrescrevem com nulo** quem não mandar o campo, e esta rota está ganhando o **primeiro chamador da vida** |
| **Efeito colateral que importa** | ao fim, `avisarDivergenciasDoRecebimento` dispara `DIVERGENCIA_RECEBIMENTO` por item divergente, com dedupe `receb-diverg-<item_id>-<quantidade>` (já existe, `receiptService.js:32-42`) |

### 4. `POST /api/almoxarifado/recebimentos/:id/workflow` — `extended.js:1092` (nenhuma linha muda)

| | |
|---|---|
| **Gate** | `requirePermission('receber_material')` |
| **Payload** | `{ acao: 'iniciar_conferencia' \| 'finalizar_conferencia' \| 'encaminhar_compras' \| 'finalizar_compras' \| 'iniciar_faturamento' \| 'processar' }` |
| **200** | `{ success: true, status, etapa_atual }` |
| **400 (fora de ordem)** | `{ error: 'Não é possível "<acao>" no status atual (<STATUS>)' }` |
| **400 (ação inexistente)** | `{ error: 'Ação de workflow inválida' }` |
| **404** | `{ error: 'Recebimento não encontrado' }` |

### 5. Permissões — `ACAO_PERFIS` (`permissions.js`)

| Ação | Perfis | Onde é checada |
|---|---|---|
| `receber_material` (existente) | `ADMINISTRADOR, ALMOXARIFE, COMPRAS` | `requirePermission` na rota |
| **`autorizar_excedente` (NOVA)** | `ADMINISTRADOR, GESTOR, COMPRAS` | **`can(user, 'autorizar_excedente')` no serviço**, só quando o body traz a flag — molde `ownerRules.assertAjustePermitido` |

A ação entra **de graça** em `GET /almoxarifado/minhas-permissoes` (a rota itera
`Object.keys(ACAO_PERFIS)`), o que é o que permite a UI esconder a caixa de autorização.
**`minhasPermissoes.api.test.js` afirma um booleano para CADA ação** — a ação nova entra nesse laço
sem editar o teste; o que a T3 **acrescenta** lá é a linha negativa do ALMOXARIFE.

### 6. Literais de tela (client, T5)

| Situação | Texto literal no DOM |
|---|---|
| rótulo do campo | `Qtd. conferida` |
| esperada ao lado | `Esperada: <n>` |
| divergência **a menos** | `Divergência: <n> a menos que o esperado (<esperada>)` |
| divergência **a mais** | `Divergência: <n> a mais que o esperado (<esperada>)` |
| caixa de autorização (só com `pode('autorizar_excedente')`) | `Autorizo o recebimento acima do pedido` |
| botão | `Salvar Conferência` |

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `server/services/almoxarifado/schema.js` **(modificar)** | `TIPOS_RECEBIMENTO` + export; índice `idx_receb_nf_fornecedor` | 1, 2 |
| `server/services/almoxarifado/schemas.js` **(modificar)** | `RecebimentoCreateSchema` + `RecebimentoFiscalSchema` (`looseObject`), a constante da literal, e as **duas linhas do `module.exports`** | 1 |
| `server/routes/almoxarifado/extended.js` **(modificar)** | `validate(...)` em `:973` e `:1098`, **depois** do `requirePermission` | 1 |
| `server/services/almoxarifado/receiptService.js` **(modificar)** | `assertNotaNaoDuplicada` + chamada nos dois escritores; `assertExcedentePermitido` + chamada nas duas portas de quantidade; `COALESCE` no `UPDATE` de item do `/conferir`; `TIPOS_RECEBIMENTO` no lugar do literal de `:108` | 1, 2, 3 |
| `server/services/almoxarifado/permissions.js` **(modificar)** | ação `autorizar_excedente` com o comentário do critério e da exclusão do ALMOXARIFE | 3 |
| `server/tests/api/recebimentoTipoEnum.api.test.js` **(criar)** | RN-11 | 1 |
| `server/tests/api/recebimentoNfDuplicada.api.test.js` **(criar)** | RN-12, RN-13, RN-14 | 2 |
| `server/tests/api/recebimentoExcedente.api.test.js` **(criar)** | RN-18 (nas duas portas, com 403 e 200) | 3 |
| `server/tests/api/recebimentoWorkflowOrdem.api.test.js` **(criar)** | RN-15 | 4 |
| `server/tests/api/minhasPermissoes.api.test.js` **(modificar)** | a linha negativa do ALMOXARIFE para `autorizar_excedente` | 3 |
| `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js` **(modificar)** | campo de quantidade conferida, esperada × recebida, aviso de divergência, caixa de autorização, botão `Salvar Conferência` → `PUT /conferir`; `setLoadingDetalhe(false)` em `fecharDetalhe` | 5, 6 |
| `client/src/components/almoxarifado/RecebimentosAlmoxarifado.test.js` **(modificar)** | fixture `EM_CONFERENCIA`, mock de `api.put`, cenários (m)/(n)/(o) | 5 |
| `client/src/components/almoxarifado/RequisicoesList.js` **(modificar)** | `setLoadingDetalhe(false)` em `fecharDetalhe` (o gêmeo que o `2817054` não pegou) | 6 |
| `server/tests/api/recebimentoPortasIntegracao.api.test.js` **(criar)** | a integração que cruza galhos: um cenário **pela ROTA** e um **pelo SERVIÇO** | 7 |
| `specs/modulo-almoxarifado/08-recebimento/README.md`, `specs/modulo-almoxarifado/README.md`, `docs/almoxarifado-guia-etapas-e-testes.md`, `docs/almoxarifado-novidades-por-etapa.md`, `docs/almoxarifado-manual-do-sistema.md`, este plano, o plano da 35 **(modificar)** | fechamento, e as **seis** correções de doc que a Fase 0 achou | 8 |

---

## Sort topológico

Critério da Fase 3 da skill: **motor, migration, `ACAO_PERFIS` ou regra compartilhada = tronco**;
**tela contra contrato congelado = galho**.

| Task | Tipo | Depende de | Por quê |
|---|---|---|---|
| 1 — enum nas duas portas | **tronco** | — | mexe em `schema.js` (fonte do enum), `schemas.js` (lista fechada de export) e nas **duas** rotas; qualquer task que rode a suíte antes dela veria 500 se o export estiver errado |
| 2 — NF duplicada nas duas portas | **tronco** | 1 | regra compartilhada no `receiptService`, mais índice; toca o **mesmo arquivo** da T1 (`receiptService.js`), logo mesma árvore, sequencial |
| 3 — `autorizar_excedente` + barreira de excedente | **tronco** | 2 | muda **`ACAO_PERFIS`** — tronco por definição do critério. E congela o 400/403 que a T5 (client) vai citar |
| 4 — `avancar etapa fora de ordem falha` | galho **A** | 3 | **zero linhas de produção**: só um arquivo de teste novo. Não toca nada que os outros toquem |
| 5 — quantidade conferida no painel | galho **B** | 3 | tela contra contrato congelado. **É o item de maior valor da 08 hoje** — e maior valor não é critério de tronco, acoplamento é |
| 6 — `setLoadingDetalhe(false)` nas duas telas | galho **C** | — | duas linhas em dois arquivos de client; toca `RecebimentosAlmoxarifado.js`, que é da T5 → **sequencial depois da T5**, mesma árvore |
| 7 — integração que cruza galhos | sequencial | 4, 5, 6 | um cenário pela **rota** e um pelo **serviço**, mais os cinco comandos da suíte |
| 8 — fechamento | sequencial | 7 | specs, mapa, guia, manual, novidades, os dois planos |

### Divergência declarada da skill: os galhos vão SEQUENCIAIS, não em worktrees

A `desenvolver-etapa-almoxarifado` manda rodar galhos paralelos em worktrees isoladas. **Medido e
confirmado nesta etapa:** `node_modules/`, `client/node_modules/` **e `server/node_modules/`** estão no
`.gitignore` (`.gitignore:2-4`), então uma worktree nova **não tem `react-scripts` nem `supertest`** e
não roda nem a suíte de client nem a de API. Isolar exigiria um `npm install` por worktree — a mesma
divergência declarada desde a Etapa 34, e ela continua valendo.

Somando a isso: **há um único galho de servidor** (T4, e ele é zero linha de produção), então não existe
par de galhos de servidor a paralelizar. **Decisão: tudo sequencial, um executor por task**, na ordem
literal **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**. A coluna "Depende de" descreve **acoplamento**, não
permissão para antecipar.

---

### Task 1: o enum nas duas portas — e o trap do strip **(tronco)**

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (junto de `TIPOS_REQUISICAO`/`TIPOS_MOVIMENTO` e do
  `module.exports`)
- Modify: `server/services/almoxarifado/schemas.js`
- Modify: `server/routes/almoxarifado/extended.js:973` e `:1098`
- Modify: `server/services/almoxarifado/receiptService.js:108`
- Create: `server/tests/api/recebimentoTipoEnum.api.test.js`

**Interfaces:** `TIPOS_RECEBIMENTO` (array de string) exportado de `schema.js`;
`RecebimentoCreateSchema` e `RecebimentoFiscalSchema` exportados de `schemas.js`. Nada mais sai.

**Restrições medidas, cada uma com o que cai se violada:**

| Não faça | Por quê | Cai em |
|---|---|---|
| `z.object` em vez de `z.looseObject` | `validate()` troca `req.body` por `parsed.data` e `z.object` descarta `nota_fiscal`/`itens` → **todo** POST válido responde `400 'Inclua ao menos um item'` | o cenário positivo de 4 colunas desta task (e, por tabela, `recebimentoCustoMedio`, `alertaEventoJornada`, `recebimentoEntradaAtomica`) |
| tornar `tipo_recebimento` obrigatório | `criarRecebimento` **deriva** o default (`receiptService.js:108`) e dois testes chamam sem o campo | `recebimentoEntradaAtomica.api.test.js:192`, `alertaEventoJornada.api.test.js:82` |
| `validate` **antes** do `requirePermission` | 400 antes de 403 inverte a ordem das camadas | o cenário (5) desta task |
| deixar a mensagem padrão do `z.enum` | sai **em inglês** no Zod 4.4.3 e sem o valor recebido (medido) | o cenário (1), pela literal |
| repetir o array do enum em `schemas.js` | duas definições do mesmo enum divergem na primeira edição | nada cai hoje — é por isso que está **proibido por escrito** |
| esquecer o `module.exports` de `schemas.js` | binding `undefined` → `undefined.safeParse` → **500** depois do gate | sabotagem 3 desta task |

- [ ] **Step 1: escrever o teste e ver os cinco cenários** (dois vermelhos, três verdes — leia **qual**)

`server/tests/api/recebimentoTipoEnum.api.test.js`, no molde de formato de
`recebimentoEntradaAtomica.api.test.js` (runner próprio, `test()`, contador, `process.exit`):

```js
/**
 * RN-11 (Etapa 36) — `tipo_recebimento` validado nas DUAS portas de escrita.
 *
 * Antes desta etapa, medido por sonda executada na Fase 0:
 *   POST /recebimentos  com tipo_recebimento 'BANANA<script>'  -> 201, gravado cru
 *   PUT  /:id/fiscal    com tipo_recebimento 'QUALQUER_COISA'  -> 200, gravado
 * A coluna e WRITE-ONLY no servidor (ninguem a le depois — `avancarWorkflow`, `gerarContaPagar`,
 * `reportService` e `alertRegistry` nao a olham), e o unico ramo de comportamento e
 * `receiptService.js:108`: valor invalido se comporta como NOTA_FISCAL, em silencio.
 *
 * O cenario (3) e o que importa, e nao os negativos: `validate()` substitui `req.body` por
 * `parsed.data`, e `z.object` DESCARTA chave nao declarada. Com um `z.object` ingenuo aqui, TODO
 * POST valido passa a responder 400 "Inclua ao menos um item". Por isso os dois schemas sao
 * `z.looseObject` — e por isso este arquivo afirma QUATRO colunas gravadas com o valor enviado.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 64, nome: 'Admin Etapa 36', role: 'admin' };
const SEM_PERFIL = { id: 65, nome: 'Chao de Fabrica', role: 'usuario' };   // cai em PRODUCAO
const LITERAL = 'Dados inválidos — tipo_recebimento: '
  + 'forma de recebimento inválida (use NOTA_FISCAL ou PEDIDO_COMPRA)';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  const material = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, ativo) VALUES ('E36-01','Chapa E36','UN',0,1)`);

  await test('(1) POST com tipo_recebimento fora do enum responde 400 com a literal em portugues', async () => {
    const res = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'BANANA<script>',
      nota_fiscal: 'NF-E36-1',
      itens: [{ material_id: material.lastID, quantidade: 5 }],
    });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, LITERAL);
    // E nao gravou nada: a recusa e ANTES do servico.
    const qtd = await dbGet(db, 'SELECT COUNT(*) AS n FROM recebimentos_material_almoxarifado');
    assert.strictEqual(qtd.n, 0, 'o POST recusado nao pode ter criado documento');
  });

  await test('(2) a SEGUNDA porta: PUT /:id/fiscal recusa o enum e NAO altera a coluna', async () => {
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: 'NF-E36-2',
      itens: [{ material_id: material.lastID, quantidade: 5 }],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const id = criado.body.id;

    const res = await request(app).put(`/api/almoxarifado/recebimentos/${id}/fiscal`)
      .send({ tipo_recebimento: 'QUALQUER_COISA', nota_serie: '9' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, LITERAL);

    const rec = await dbGet(db,
      'SELECT tipo_recebimento, nota_serie FROM recebimentos_material_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(rec.tipo_recebimento, 'NOTA_FISCAL', 'a coluna tinha de continuar intacta');
    assert.strictEqual(rec.nota_serie, null, 'a recusa e do PUT INTEIRO, nao so do campo invalido');
  });

  await test('(3) CONTROLE DO STRIP: POST valido grava as QUATRO colunas que nao estao no schema', async () => {
    const res = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL',
      nota_fiscal: 'NF-E36-3',
      observacoes: 'Caixa amassada no canto',
      fornecedor_cnpj: '33.333.333/0001-33',
      itens: [{ material_id: material.lastID, quantidade: 5, lote: 'L-E36' }],
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const rec = await dbGet(db, `SELECT tipo_recebimento, nota_fiscal, observacoes, fornecedor_cnpj
      FROM recebimentos_material_almoxarifado WHERE id = ?`, [res.body.id]);
    assert.strictEqual(rec.tipo_recebimento, 'NOTA_FISCAL');
    assert.strictEqual(rec.nota_fiscal, 'NF-E36-3');
    assert.strictEqual(rec.observacoes, 'Caixa amassada no canto');
    assert.strictEqual(rec.fornecedor_cnpj, '33.333.333/0001-33');
    const item = await dbGet(db, `SELECT lote FROM recebimentos_material_itens_almoxarifado
      WHERE recebimento_id = ?`, [res.body.id]);
    assert.strictEqual(item.lote, 'L-E36', 'o `itens` sobreviveu ao parse (looseObject, nao object)');
  });

  await test('(4) sem tipo no body, o default DERIVADO continua vivo', async () => {
    const pedido = await dbRun(db,
      `INSERT INTO pedidos_compra (numero, status) VALUES ('PC-E36','ABERTO')`);
    const res = await request(app).post('/api/almoxarifado/recebimentos').send({
      pedido_compra_id: pedido.lastID,
      itens: [{ material_id: material.lastID, quantidade: 3 }],
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const rec = await dbGet(db,
      'SELECT tipo_recebimento FROM recebimentos_material_almoxarifado WHERE id = ?', [res.body.id]);
    assert.strictEqual(rec.tipo_recebimento, 'PEDIDO_COMPRA');
  });

  await test('(5) 403 vem ANTES do 400: usuario sem perfil nem chega na validacao', async () => {
    setUser(SEM_PERFIL);
    const res = await request(app).post('/api/almoxarifado/recebimentos')
      .send({ tipo_recebimento: 'BANANA', itens: [] });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.strictEqual(res.body.acao, 'receber_material');
    assert.strictEqual(res.body.perfil, 'PRODUCAO');
    setUser(ADMIN);
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
```

⚠️ **Confira o nome real da tabela de pedido de compra e suas colunas obrigatórias antes de rodar** —
`resolverPedidoCompra` (`receiptService.js:88-95`) consulta `pedidos_compra`. Se o `INSERT` do cenário
(4) falhar por coluna `NOT NULL`, **acrescente a coluna ao `INSERT`**; não troque o cenário por um que
não exercite o default derivado.

- [ ] **Step 2: rodar e LER os números**

```
cd server && node tests/api/recebimentoTipoEnum.api.test.js
```

Esperado **antes** do conserto: **(1) e (2) vermelhos** (a rota responde 201/200, não 400), **(3),
(4) e (5) verdes**. Se (1) ou (2) já vier verde, **pare**: a rota está recusando por outro motivo e o
cenário mede outra coisa. Cole aqui as duas linhas reais do `✗`.

- [ ] **Step 3: implementar**

Em `schema.js`, junto dos outros enums de fonte única, e **na lista do `module.exports`**:

```js
// Etapa 36 (RN-11): fonte UNICA dos valores de `tipo_recebimento`. A coluna existe desde sempre
// (`recebCols`, "tipo_recebimento TEXT DEFAULT 'NOTA_FISCAL'") e aceitava QUALQUER string — medido
// por sonda na Fase 0: 'BANANA<script>' entrava com 201. Mora aqui, e nao em schemas.js, pelo mesmo
// motivo de TIPOS_REQUISICAO/TIPOS_MOVIMENTO: quem grava (receiptService) e quem valida (Zod) tem de
// ler a MESMA lista, senao a etapa cria duas definicoes do mesmo enum.
const TIPOS_RECEBIMENTO = ['NOTA_FISCAL', 'PEDIDO_COMPRA'];
```

Em `schemas.js` (importando `TIPOS_RECEBIMENTO` na linha do `require('./schema')`, `:3`):

```js
// UMA literal para as DUAS portas: escrita a mao duas vezes, ela divergiria na primeira edicao e o
// operador veria texto diferente dependendo de qual porta recusou. A mensagem e propria porque o
// `z.enum` nu do Zod 4.4.3 responde EM INGLES e sem o valor recebido (medido na Fase 0), o que
// quebra a convencao de mensagens em portugues deste modulo.
const TIPO_RECEBIMENTO_INVALIDO = 'forma de recebimento inválida (use NOTA_FISCAL ou PEDIDO_COMPRA)';

// `looseObject`, NUNCA `object`: `validate()` substitui `req.body` por `parsed.data` e `z.object`
// descarta chave nao declarada — com `object`, `nota_fiscal` e `itens` SOMEM e todo POST valido
// responde 400 "Inclua ao menos um item" (`receiptService.js:126`). Quarta encarnacao do defeito
// ja comentado neste arquivo para `reserva_id`, `lote_id` e `series`.
// `.optional()` nao e estilo: `criarRecebimento` DERIVA o tipo quando o body nao traz (`:108`), e
// `recebimentoEntradaAtomica.api.test.js:192` / `alertaEventoJornada.api.test.js:82` chamam sem ele.
const RecebimentoCreateSchema = z.looseObject({
  tipo_recebimento: z.enum(TIPOS_RECEBIMENTO, { message: TIPO_RECEBIMENTO_INVALIDO }).optional(),
});
const RecebimentoFiscalSchema = z.looseObject({
  tipo_recebimento: z.enum(TIPOS_RECEBIMENTO, { message: TIPO_RECEBIMENTO_INVALIDO }).optional(),
});
```

**E as duas linhas no `module.exports`** — o arquivo exporta por lista fechada (ver o comentário do
`AnexoCreateSchema`), e esquecê-las é 500 com stack, não `undefined` silencioso.

⚠️ **São TRÊS lugares de fiação, não dois.** `extended.js:25` importa os schemas por
**desestruturação em lista** (`const { CentroCustoSchema, …, AnexoCreateSchema } = require('…/schemas')`)
e `validate` **já está importado** em `:24` — então os dois nomes novos precisam entrar **naquela
linha** também. Esquecer ali dá o mesmo 500 de `undefined.safeParse`, e o comentário de `:35` do
próprio arquivo registra que binding desestruturado é resolvido no `require` e cacheado.

Nas rotas (`extended.js:973` e `:1098`), **depois** do `requirePermission`:

```js
app.post('/api/almoxarifado/recebimentos', auth, requirePermission('receber_material'),
  validate(RecebimentoCreateSchema), async (req, res) => {
```

```js
app.put('/api/almoxarifado/recebimentos/:id/fiscal', auth, requirePermission('receber_material'),
  validate(RecebimentoFiscalSchema), async (req, res) => {
```

E em `receiptService.js:108`, o literal sai e a constante entra:

```js
const tipo = tipo_recebimento
  || (pedido_compra_id || pedido_compra_numero ? TIPOS_RECEBIMENTO[1] : TIPOS_RECEBIMENTO[0]);
```

> Se `TIPOS_RECEBIMENTO[1]` parecer obscuro, exporte de `schema.js` também
> `TIPO_RECEBIMENTO = { NOTA_FISCAL: 'NOTA_FISCAL', PEDIDO_COMPRA: 'PEDIDO_COMPRA' }` e use os nomes —
> **mas não** reescreva as strings à mão aqui.

- [ ] **Step 4: rodar e ver os cinco verdes**, e a suíte de API inteira

```
cd server && node tests/api/recebimentoTipoEnum.api.test.js
cd server && npm run test:api
```

`test:api` tem de ficar **169/169 arquivos OK** (o número da Etapa 35) **+ 1** arquivo novo. Se algum
arquivo que hoje passa ficar vermelho, é quase certo o strip — releia o Step 3.

- [ ] **Step 5: CONTROLE POSITIVO — três sabotagens, e leia QUAL asserção cai**

| # | Sabotagem (`perl -0pi -e`, âncora com `grep -cF` = 1) | O que TEM de cair |
|---|---|---|
| 1 | trocar `z.looseObject` por `z.object` nos **dois** schemas | **o cenário (3)**, na asserção `assert.strictEqual(res.status, 201)` → recebe **400** com `'Inclua ao menos um item'`; e o (4) junto. Os negativos (1) e (2) **continuam verdes** — é exatamente por isso que o (3) existe. Fora deste arquivo, `recebimentoCustoMedio` e `alertaEventoJornada` também caem |
| 2 | apagar `validate(RecebimentoFiscalSchema)` da rota do `PUT` (só ela) | **só o cenário (2)**, na asserção `assert.strictEqual(res.status, 400)` → recebe **200**. É o controle da "segunda porta": se ele não cair, a task fechou só metade |
| 3 | apagar a linha `RecebimentoCreateSchema,` do `module.exports` de `schemas.js` | **o arquivo INTEIRO fica vermelho com 500** (`undefined.safeParse`). Aqui a leitura é "qual arquivo caiu", não "qual asserção" — e o achado é que a lista fechada de export é fiação sem rede: nenhum teste de hoje falha em *tempo de carga*, só em tempo de requisição |
| 4 | trocar a mensagem própria por `z.enum(TIPOS_RECEBIMENTO).optional()` (padrão do Zod) | **(1) e (2)**, na asserção da literal — `Received: 'Dados inválidos — tipo_recebimento: Invalid option: expected one of …'`. Prova que a literal está congelada, e não só o status |

- [ ] **Step 6: commit** (um assunto: o enum)

`git add` só de: `server/services/almoxarifado/schema.js`, `schemas.js`, `receiptService.js`,
`server/routes/almoxarifado/extended.js`, `server/tests/api/recebimentoTipoEnum.api.test.js`.
Corpo em português sem acento: o bug (as duas portas gravavam qualquer string em `tipo_recebimento`,
medido com `'BANANA<script>'` e 201), a consequência (coluna impura para todo relatorio futuro, e o
ramo de pedido de compra pulado em silencio — `'BANANA'` se comporta como `NOTA_FISCAL`), o que foi
decidido (`looseObject` + `.optional()` + literal propria em portugues, enum com fonte unica em
`schema.js`) e o que foi descartado (`z.object`, que derrubaria todo POST valido; mensagem padrao do
Zod, que sai em ingles; repetir o array nos dois schemas).

---

### Task 2: a mesma NF não entra duas vezes — nas duas portas **(tronco)**

**Files:**
- Modify: `server/services/almoxarifado/receiptService.js` (`assertNotaNaoDuplicada`, chamada em
  `criarRecebimento` antes do `inserirComNumeroUnico` e em `salvarDadosFiscal` antes do `UPDATE`)
- Modify: `server/services/almoxarifado/schema.js` (índice `idx_receb_nf_fornecedor`)
- Create: `server/tests/api/recebimentoNfDuplicada.api.test.js`

**Interfaces:** nada novo sai do serviço — `assertNotaNaoDuplicada` é interna (não precisa entrar no
`module.exports`, **a menos** que o cenário "pelo serviço" da T7 a chame direto; nesse caso exporte e
diga por quê).

**Contrato congelado:** `409` com
`Nota fiscal <NF> já lançada no recebimento <numero do REC> para este fornecedor`. **O número do
documento existente vai na mensagem** — sem ele o operador não tem como encontrar onde a nota já está.

⚠️ **O modo de falha número 2 desta etapa vive aqui.** `gerarContaPagar` devolve `null` quando a
tabela `contas_pagar` não existe (`receiptService.js:648-650`), e **nenhum** arquivo de `tests/api/`
cria essa tabela hoje. **Sem criar a tabela, a asserção "1 conta a pagar" passa com 0 de cada lado** —
teste vazio, o quinto desta base. O arquivo cria a tabela com as colunas que `gerarContaPagar` insere:
`descricao`, `fornecedor`, `valor`, `data_vencimento`, `status`, `categoria`, `observacoes`.

- [ ] **Step 1: escrever o teste e MEDIR O DANO antes do conserto**

Cenários do arquivo (todos com metade positiva):

1. **`(1) dois POST com a mesma NF e o mesmo fornecedor: o segundo e recusado com 409`** — o primeiro
   **201**, o segundo **409** e `res.body.error` **igual** à literal, com o número do primeiro
   documento lido do banco (`SELECT numero ... WHERE id = <primeiro>`), nunca escrito à mão.
2. **`(2) A ASSERCAO QUE MEDE O DANO: saldo 10 e UMA conta a pagar, nao 20 e duas`** — cria os dois
   (o segundo recusado), leva o primeiro pelo workflow até `processar`, e afirma
   `quantidade_atual === 10` **e** `COUNT(contas_pagar) === 1`. **Antes do conserto este cenário mede
   20 e 2** — cole os dois números reais no Step 2.
3. **`(3) mesma NF, fornecedor DIFERENTE: os dois entram`** — 201 e 201 (dois fornecedores emitem nota
   com o mesmo número; barrar seria pior que o furo).
4. **`(4) sem nota fiscal: NULL nao e duplicata`** — dois `POST` sem `nota_fiscal`, mesmo fornecedor,
   201 nos dois.
5. **`(5) fornecedor NAO identificado nao caracteriza duplicata`** — dois `POST` com a mesma NF e
   `fornecedor_id`/`fornecedor_cnpj` ausentes, 201 nos dois. **Este cenário é o que protege os
   arquivos existentes** que criam recebimento pela rota sem fornecedor.
6. **`(6) a SEGUNDA porta: PUT /fiscal nao pode trazer a NF de outro documento`** (RN-14) — A com
   `NF-X`, B sem NF, `PUT /B/fiscal` com `nota_fiscal: 'NF-X'` e o mesmo fornecedor → **409** citando o
   número de **A**; e a metade positiva: `PUT /A/fiscal` com a **própria** `NF-X` → **200** (salvar os
   dados fiscais duas vezes não pode se autoacusar).

Preparação obrigatória no topo do arquivo:

```js
// `gerarContaPagar` (`receiptService.js:647-670`) faz `SELECT name FROM sqlite_master ... 'contas_pagar'`
// e devolve NULL se a tabela nao existe — e NENHUM dos arquivos de tests/api a cria (medido na Fase
// 0 desta etapa). Sem este CREATE, a asserção "1 conta a pagar" passaria com ZERO dos dois lados:
// teste vazio, e o dano medido (2 contas para a mesma NF) ficaria sem prova. Subconjunto minimo das
// colunas que o INSERT de `gerarContaPagar` usa.
await dbRun(db, `CREATE TABLE IF NOT EXISTS contas_pagar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao TEXT, fornecedor TEXT, valor REAL, data_vencimento TEXT,
  status TEXT, categoria TEXT, observacoes TEXT
)`);
```

E um helper que leva um recebimento de `RECEBIDO` a `EM_ENTRADA_NF` **pelo workflow real** (cinco
`POST /workflow`: `iniciar_conferencia`, `finalizar_conferencia`, `encaminhar_compras`,
`finalizar_compras`, `iniciar_faturamento`) mais o `PUT /fiscal` com os cinco campos que
`validarDadosProcessamento` exige (`nota_fiscal`, fornecedor, `data_emissao_nf`, `data_entrada_nf`,
`valor_total_nota`) — sem eles o `processar` recusa com `Preencha antes de processar: …` e o cenário (2)
fica vermelho **pelo motivo errado**.

- [ ] **Step 2: rodar e registrar o vermelho, com os números**

```
cd server && node tests/api/recebimentoNfDuplicada.api.test.js
```

Esperado antes do conserto: **(1), (2) e (6) vermelhos**; **(3), (4) e (5) verdes**. No (2), a linha do
`✗` tem de trazer **20** (saldo) ou **2** (contas) — cole-a aqui. **Se o (2) vier verde, pare**: quase
certo que a tabela `contas_pagar` não foi criada ou o recebimento não chegou a `processar`.

- [ ] **Step 3: implementar a guarda**

```js
/**
 * RN-12/13/14 (Etapa 36) — a mesma nota fiscal do mesmo fornecedor nao entra duas vezes.
 *
 * Medido por sonda executada na Fase 0: dois POST com a mesma `nota_fiscal` e o mesmo
 * `fornecedor_id` respondiam 201 + 201; processando as duas, o material era creditado DUAS VEZES
 * (20 em vez de 10) e nasciam DUAS contas a pagar, com descricao identica exceto pelo numero do REC.
 * Ninguem mais no sistema segurava essa porta: `gerarContaPagar` insere sem consultar duplicidade.
 *
 * Mora no SERVICO e e chamada pelos DOIS escritores — `criarRecebimento` e `salvarDadosFiscal` —
 * porque o PUT /fiscal PREENCHE a NF depois, e uma guarda so no POST seria contornavel pelo mesmo
 * caminho que tornava o enum contornavel (RN-11).
 *
 * NAO e `UNIQUE(nota_fiscal, fornecedor_id)` no banco, e isso e decisao reversivel registrada na
 * letra B: producao pode ja ter duplicatas e o indice unico falharia na SUBIDA do servidor (o
 * `numero TEXT UNIQUE` nasceu no CREATE TABLE, nao por safeAlter — nao ha precedente de unico
 * aplicado a acervo aqui); `NULL` nunca colide, entao o indice seria silenciosamente parcial onde
 * mais importa; e a recusa viria como SQLITE_CONSTRAINT, nao como literal legivel. A letra A do
 * fechamento leva a consulta SQL que mede duplicatas em producao ANTES de qualquer deploy.
 *
 * Tres coisas NAO sao duplicata: NF vazia/nula, fornecedor diferente, e fornecedor nao identificado
 * (id e CNPJ os dois nulos) — sem fornecedor nao existe "mesmo fornecedor" a afirmar.
 */
async function assertNotaNaoDuplicada(db, { nota_fiscal, fornecedor_id, fornecedor_cnpj }, recebimentoId = null) {
  const nf = typeof nota_fiscal === 'string' ? nota_fiscal.trim() : nota_fiscal;
  if (!nf) return;                                   // RN-13: sem NF nao ha duplicata
  if (!fornecedor_id && !fornecedor_cnpj) return;    // RN-13: sem fornecedor identificado, idem

  const where = fornecedor_id ? 'fornecedor_id = ?' : 'fornecedor_cnpj = ?';
  const params = [nf, fornecedor_id || fornecedor_cnpj];
  let sql = `SELECT id, numero FROM recebimentos_material_almoxarifado
    WHERE UPPER(TRIM(nota_fiscal)) = UPPER(?) AND ${where}
      AND COALESCE(status,'') NOT IN ('CANCELADO')`;
  if (recebimentoId) { sql += ' AND id <> ?'; params.push(recebimentoId); }

  const ja = await dbGet(db, `${sql} LIMIT 1`, params);
  if (ja) {
    throw Object.assign(
      new Error(`Nota fiscal ${nf} já lançada no recebimento ${ja.numero} para este fornecedor`),
      { status: 409 },
    );
  }
}
```

**Onde chamar, e por que exatamente ali:**
- em `criarRecebimento`, **depois** de resolver o pedido (o pedido é quem traz `fornecedor_id`) e
  **antes** do `inserirComNumeroUnico` — senão o retry do gerador de número já teria gravado;
- em `salvarDadosFiscal`, **depois** de `resolverPedidoCompra` e **antes** do `UPDATE`, passando
  `recebimentoId` (exclui o próprio documento) e resolvendo o fornecedor com o mesmo
  `pedido?.fornecedor_id ?? fornecedor_id ?? rec.fornecedor_id` que o `UPDATE` usa. ⚠️ **Ponto de
  atenção:** o `UPDATE` usa `COALESCE`, então um `PUT` que manda **só** a NF herda o fornecedor **do
  registro** (`rec`) — a guarda tem de olhar o mesmo valor efetivo, senão ela deixa passar a duplicata
  do caso mais comum.

Índice em `schema.js`, **dentro do `initSchema`**, logo depois do bloco `recebCols` (`:1255`) — a
forma da casa é `await dbRun(db, 'CREATE INDEX IF NOT EXISTS …')`, uma chamada por índice (molde
`:1450-1451`), **não** um array de strings:

```js
  // Etapa 36: a tabela de recebimentos nao tinha indice NENHUM alem do UNIQUE de `numero`
  // (`grep "INDEX.*recebimentos"` voltava vazio), e a guarda de NF duplicada roda em TODA criacao.
  // NAO e unico, de proposito — ver o comentario de `assertNotaNaoDuplicada`.
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_receb_nf_fornecedor ON recebimentos_material_almoxarifado(nota_fiscal, fornecedor_id)');
```

⚠️ **O índice tem de vir DEPOIS do `safeAlter` de `recebCols`**, porque `fornecedor_id` está no
`CREATE TABLE` mas o bloco de colunas novas roda em `:1255` e a ordem importa para banco antigo. E o
teste `npm run test:safealter` tem de continuar **3/3**.

- [ ] **Step 4: rodar o arquivo, `test:api` inteiro e `test:almoxarifado`**

Atenção nominal a `alertaEventoGanchos.api.test.js`, que faz **vários** `PUT /fiscal` no **mesmo**
recebimento com NFs diferentes (`NF-A1-1` … `NF-A1-4`) e cria recebimentos pela rota **sem
fornecedor** — é o arquivo que a RN-13 protege. Se ele cair, a guarda está olhando o fornecedor
errado, não o teste.

- [ ] **Step 5: CONTROLE POSITIVO — quatro sabotagens**

| # | Sabotagem | O que TEM de cair |
|---|---|---|
| 1 | apagar a chamada de `assertNotaNaoDuplicada` em `criarRecebimento` | **(1)** pelo `assert.strictEqual(res2.status, 409)` → **201**, e **(2)** pelo saldo → **20**. Se só o (1) cair, o (2) não está chegando a `processar` |
| 2 | apagar a chamada em `salvarDadosFiscal` (só ela) | **só o (6)** — o controle da segunda porta |
| 3 | **sabotar a POSIÇÃO, não o operador**: mover a chamada em `criarRecebimento` para **depois** do `inserirComNumeroUnico` | **(1)** continua respondendo 409, **mas (2) cai**: o documento duplicado já foi gravado antes da recusa e o `COUNT` de recebimentos/contas não fecha. É a regra "numa régua com folga, sabote a posição" |
| 4 | tirar o `AND id <> ?` da guarda | **a metade positiva do (6)**: `PUT /A/fiscal` com a própria NF passa a responder **409**. Prova que o documento não se autoacusa |

- [ ] **Step 6: commit** — assunto único: a NF duplicada. Corpo com o dano medido (20 em vez de 10 e
      2 contas a pagar), a decisão (guarda em servico nos dois escritores + indice nao unico) e o
      descartado (`UNIQUE` no banco, com os tres motivos).

---

### Task 3: excedente com barreira — e a ação de perfil que não existia **(tronco)**

**Files:**
- Modify: `server/services/almoxarifado/permissions.js` (`ACAO_PERFIS`)
- Modify: `server/services/almoxarifado/receiptService.js` (`assertExcedentePermitido`, chamada em
  `conferirRecebimento` e `salvarDadosFiscal`; `COALESCE` no `UPDATE` de item do `/conferir`)
- Modify: `server/tests/api/minhasPermissoes.api.test.js`
- Create: `server/tests/api/recebimentoExcedente.api.test.js`

**MEDIDO: `autorizar_excedente` NÃO existe em `ACAO_PERFIS`** — `grep -rn autorizar_excedente
server/ client/src` não devolve nenhuma ação de permissão. Portanto **esta task é tronco** (mexe em
`ACAO_PERFIS`, regra compartilhada) e vem **antes** do client, invertendo a ordem T4/T5 da proposta do
controlador. O motivo está na tabela de reclassificação do design.

**Contrato congelado (as duas portas, `/conferir` e `/fiscal`):**
- `400` — `Quantidade recebida (<recebida>) maior que a esperada (<esperada>) no item #<id do item> — marque a autorização de excedente para registrar`
- `403` — `Autorizar recebimento acima do pedido exige a permissão "autorizar_excedente" (seu perfil: <PERFIL>).`
- `200` + coluna gravada + auditoria `EXCEDENTE_AUTORIZADO` quando a flag vem **e** o perfil tem a ação.

⚠️ **Modo de falha número 3 desta etapa.** "ALMOXARIFE não pode `autorizar_excedente`" fica **verde
antes de a ação existir**, porque `can()` devolve `false` para ação desconhecida. **A prova é o par no
mesmo cenário:** 403 do ALMOXARIFE **e** 200 do GESTOR. Um sem o outro não prova nada.

- [ ] **Step 1: escrever o teste e ver o vermelho certo**

Cenários de `recebimentoExcedente.api.test.js`:

1. **`(1) /conferir com recebida > esperada e sem flag: 400 com a literal`** — `esperada 10`,
   `recebida 999` → 400, literal com o **id real do item** (lido do `INSERT`), e a coluna **inalterada**
   no banco.
2. **`(2) /conferir com a flag mas perfil ALMOXARIFE: 403 — e o GESTOR, no MESMO cenario: 200`** — as
   duas metades **obrigatoriamente juntas** (regra da `fechar-etapa` sobre asserção negativa de
   permissão). No 200, afirmar `quantidade_recebida === 999` **e** a linha de auditoria
   `EXCEDENTE_AUTORIZADO`.
3. **`(3) a SEGUNDA porta: /fiscal repete os tres casos`** — 400 sem flag, 403 com flag e ALMOXARIFE,
   200 com flag e GESTOR.
4. **`(4) positivos que impedem o excesso de zelo`** — `recebida === esperada` → 200 sem flag;
   `recebida < esperada` → 200 sem flag **e** a divergência **registrada** (chamando
   `alertRegistry.listarDivergenciasRecebimento(db, { recebimentoId })` e afirmando 1 item) — é a
   ponta de servidor da RN-16/RN-17.
5. **`(5) COALESCE: item enviado sem quantidade_recebida nao apaga a quantidade`** — `/conferir` com
   `{ id, conferencia_quantidade: true }` (sem quantidade) → 200 e a quantidade **preservada**. Hoje
   isto **zera a coluna**, e é o defeito que a rota carrega por nunca ter tido chamador.

Em `minhasPermissoes.api.test.js`, acrescentar `autorizar_excedente` à lista negativa do cenário do
ALMOXARIFE (`assert.strictEqual(acoes.autorizar_excedente, false)`) e à positiva do GESTOR — o laço
que exige "um booleano para CADA ação" já cobre a existência sozinho.

- [ ] **Step 2: rodar e LER** — esperado: (1), (2), (3) e (5) vermelhos, (4) verde. Atenção: no (2), a
      metade do **403** pode nascer **verde** (ação inexistente ⇒ `can()` falso) enquanto a do **200**
      nasce vermelha — **é esse o padrão esperado**, e ele é a razão de as duas estarem no mesmo `test()`.
      Cole as linhas reais.

- [ ] **Step 3: implementar**

Em `permissions.js`, com o comentário do critério (o módulo documenta **toda** ação nova assim):

```js
  // Etapa 36 (RN-18): aceitar MAIS material do que foi pedido gera CONTA A PAGAR maior que o pedido
  // de compra — risco financeiro, nao risco de prateleira. Mesmo criterio ja escrito acima para
  // ajustar_material_cliente, remessar_terceiro e conferir_separacao: quando a operacao muda a
  // NATUREZA DO RISCO, ela ganha acao propria em vez de pegar carona no gate existente
  // (`receber_material`, que e de quem recebe).
  //
  // O ALMOXARIFE fica FORA de proposito, e essa e a exclusao que precisa de justificativa porque
  // ele e o candidato obvio (tem `receber_material`): quem RECEBE nao autoriza o proprio excedente.
  // Mesmo raciocinio, escrito, de gerenciar_plano_inspecao. COMPRAS entra porque negocia com o
  // fornecedor e responde pelo pedido; GESTOR entra pelo precedente de ajustar_estoque.
  // Reversivel numa linha se o cliente pedir; registrado na letra B do doc de novidades.
  //
  // A checagem NAO e `requirePermission` na rota, e isso e decisao: o gate de rota faria o
  // `PUT /conferir` inteiro exigir a acao, e o ALMOXARIFE — que e quem confere — perderia a
  // conferencia normal. E condicional e mora no SERVICO, molde de
  // `ownerRules.assertAjustePermitido` ("a checagem real acontece no MOTOR, nao em
  // requirePermission na rota"). Entra de graca em GET /almoxarifado/minhas-permissoes — a rota
  // itera Object.keys(ACAO_PERFIS).
  autorizar_excedente: [PERFIS.ADMINISTRADOR, PERFIS.GESTOR, PERFIS.COMPRAS],
```

Em `receiptService.js`:

```js
/**
 * RN-18 (Etapa 36) — recebimento acima do esperado exige autorizacao EXPLICITA e PERMISSAO.
 *
 * Medido por sonda na Fase 0: `quantidade_esperada: 10, quantidade_recebida: 999` entrava com 201 e
 * era gravado. O motor de DETECCAO ja existia inteiro (`alertRegistry.listarDivergenciasRecebimento`
 * + `avisarDivergenciasDoRecebimento` nos dois escritores); o que nao existia era a BARREIRA.
 *
 * Duas condicoes, e as duas importam: a flag e a INTENCAO ("eu sei que estou recebendo a mais"), a
 * permissao e a AUTORIDADE. Só a flag foi descartado no design: flag que qualquer perfil liga nao e
 * barreira, e formulario — o mesmo usuario que digita 999 marca a caixa.
 */
async function assertExcedentePermitido(db, user, recebimentoId, itens, autorizado) {
  const excedentes = [];
  for (const item of itens || []) {
    if (item.quantidade_recebida == null) continue;
    const atual = await dbGet(db, `SELECT id, quantidade_esperada FROM recebimentos_material_itens_almoxarifado
      WHERE id = ? AND recebimento_id = ?`, [item.id, recebimentoId]);
    if (!atual) continue;
    const recebida = parseFloat(item.quantidade_recebida);
    const esperada = parseFloat(atual.quantidade_esperada);
    if (Number.isFinite(recebida) && Number.isFinite(esperada) && recebida > esperada) {
      excedentes.push({ id: atual.id, recebida, esperada });
    }
  }
  if (!excedentes.length) return;

  const e = excedentes[0];
  if (!autorizado) {
    throw Object.assign(new Error(
      `Quantidade recebida (${e.recebida}) maior que a esperada (${e.esperada}) no item #${e.id}`
      + ' — marque a autorização de excedente para registrar'), { status: 400 });
  }
  if (!can(user, 'autorizar_excedente')) {
    throw Object.assign(new Error(
      'Autorizar recebimento acima do pedido exige a permissão "autorizar_excedente"'
      + ` (seu perfil: ${getPerfilFromUser(user)}).`), { status: 403 });
  }
  for (const ex of excedentes) {
    await registrarAuditoria(db, {
      entidade: 'recebimento_item', entidade_id: ex.id, acao: 'EXCEDENTE_AUTORIZADO',
      usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
      dados_anteriores: { quantidade_esperada: ex.esperada },
      dados_novos: { quantidade_recebida: ex.recebida },
    });
  }
}
```

Chamada em `conferirRecebimento` e em `salvarDadosFiscal`, **antes** de qualquer `UPDATE` de item
(recusar depois de gravar é o defeito que a sabotagem 3 da T2 mede), lendo
`data.autorizar_excedente === true`.

E o `UPDATE` de item do `/conferir` passa a usar `COALESCE` nas cinco colunas, **no molde já escrito
em `salvarDadosFiscal`** (`quantidade_recebida`, `conferencia_quantidade`, `conferencia_descricao`,
`observacoes`, `series`), com o comentário dizendo por quê: *esta rota está ganhando o primeiro
chamador da vida, e item sem o campo apagava a quantidade e a observação*.

⚠️ **Confira as importações no topo de `receiptService.js`:** `can` e `getPerfilFromUser` vêm de
`./permissions`. Se o arquivo ainda não os importa, acrescente — e confira que **não** há ciclo
(`permissions.js` requer `../systemPermissions` dentro da função, de propósito).

- [ ] **Step 4: rodar o arquivo, `minhasPermissoes`, `test:api` e `test:almoxarifado`**

Atenção nominal a `alertaEventoGanchos.api.test.js` (usa `/conferir` com `recebida 8` de `esperada 10`
e `conferencia_quantidade: 1` — **não** é excedente, tem de continuar verde) e a
`permissoesRotas.api.test.js` / `alertaCentral.api.test.js`, que importam `ACAO_PERFIS`.

- [ ] **Step 5: CONTROLE POSITIVO — quatro sabotagens**

| # | Sabotagem | O que TEM de cair |
|---|---|---|
| 1 | apagar a chamada em `conferirRecebimento` | **(1)** pelo `assert.strictEqual(res.status, 400)` → **200**, e **(2)** pela metade do 403 |
| 2 | apagar a chamada em `salvarDadosFiscal` (só ela) | **só o (3)** — o controle da segunda porta |
| 3 | **acrescentar `PERFIS.ALMOXARIFE`** à lista de `autorizar_excedente` | **a metade do 403 do cenário (2)** → **200**. É o **único** controle que prova a lista negativa: sem ele, "ALMOXARIFE não pode" ficaria verde pelo motivo errado (`can()` desconhece a ação) |
| 4 | trocar `recebida > esperada` por `recebida >= esperada` (sabotar a **posição** da régua, não o operador) | **o positivo do (4)**, `recebida === esperada` → passa a responder 400. Prova que a régua está em "maior que", e não em "diferente de" |
| 5 | reverter o `COALESCE` de `quantidade_recebida` no `/conferir` | **(5)**, pela quantidade que volta a ser apagada |

- [ ] **Step 6: commit** — assunto único: a barreira de excedente e a ação de perfil. Corpo: o dano
      (999 de 10 entrava com 201), a decisão (acao propria `autorizar_excedente`, checada no servico,
      ALMOXARIFE fora de proposito, `COALESCE` no `/conferir`) e o descartado (so a flag no payload,
      que nao e barreira; `requirePermission` na rota, que quebraria a conferencia normal).

---

### Task 4: `avancar etapa fora de ordem falha` — a linha ⏳ mais barata da spec **(galho A)**

**Files:**
- Create: `server/tests/api/recebimentoWorkflowOrdem.api.test.js`

**Zero linhas de produção.** A medição confirmou por sonda que **o servidor já recusa**:
`400 {"error":"Não é possível \"processar\" no status atual (EM_CONFERENCIA)"}` e
`400 {"error":"Ação de workflow inválida"}`. O que não existe é o **teste**, exigido pela spec 08 desde
2026-08-11 e citado pelo manual 14.2. **Se a execução mostrar que o servidor NÃO recusa, esta task
vira tronco** — pare, escreva aqui o que mediu, e conserte `avancarWorkflow` antes de seguir.

- [ ] **Step 1: escrever os três cenários**

1. **`(1) processar em RECEBIDO e recusado com a literal do manual`** — `POST /:id/workflow
   {acao:'processar'}` num `RECEBIDO` → 400 e
   `error === 'Não é possível "processar" no status atual (RECEBIDO)'`; e o status no banco
   **inalterado**.
2. **`(2) acao inexistente e recusada antes de olhar o status`** — `{acao:'inexistente'}` → 400 e
   `'Ação de workflow inválida'`; `{acao:'processar'}` num id **inexistente** → **404**
   `'Recebimento não encontrado'` (a ordem das checagens também é contrato).
3. **`(3) POSITIVO: a sequencia completa responde 200 CINCO vezes`** —
   `iniciar_conferencia → finalizar_conferencia → encaminhar_compras → finalizar_compras →
   iniciar_faturamento`, afirmando o `status` devolvido em **cada** passo (`EM_CONFERENCIA`,
   `CONFERIDO_ALMOX`, `EM_COMPRAS`, `ENCAMINHADO_FATURAMENTO`, `EM_ENTRADA_NF`). **Sem isto, um
   `throw` incondicional em `avancarWorkflow` passaria os dois negativos.**

- [ ] **Step 2: rodar** — os três têm de ficar **verdes de primeira**, e isso é exatamente o caso em
      que o CLAUDE.md manda desconfiar: o valor desta task está **inteiro** no Step 3.

```
cd server && node tests/api/recebimentoWorkflowOrdem.api.test.js
```

- [ ] **Step 3: CONTROLE POSITIVO — três sabotagens em `avancarWorkflow`**

| # | Sabotagem | O que TEM de cair |
|---|---|---|
| 1 | apagar o `if (!t.de.includes(rec.status))` | **(1)**, pelo `assert.strictEqual(res.status, 400)` → 200/500 |
| 2 | apagar o `if (!t)` (`'Ação de workflow inválida'`) | **(2)**, na primeira asserção — e leia se caiu pela literal ou por um 500: se foi 500, o cenário está medindo o crash, não a recusa |
| 3 | acrescentar `STATUS.RECEBIDO` ao `de` da transição `processar` (**sabotar a POSIÇÃO da régua**) | **(1)** sozinho, com **(2) e (3) verdes**. É a assinatura de "a régua está no conjunto `de`", e não num `throw` genérico |

- [ ] **Step 4: commit** — assunto único: o teste do workflow. Corpo: a spec exigia este teste desde
      2026-08-11 e o manual 14.2 cita a literal; o servidor ja recusava (medido por sonda), o que
      faltava era a regua — e as tres sabotagens provam que ela mede o conjunto `de`, nao um throw.

---

### Task 5: o campo que faltava — quantidade conferida no painel **(galho B)**

**Files:**
- Modify: `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js` (bloco de itens do painel,
  `:614-670`; `renderAcoes`, `:426-467`; uma função `salvarConferencia`)
- Modify: `client/src/components/almoxarifado/RecebimentosAlmoxarifado.test.js`

**Por que esta task existe, e por que ela é o maior valor da feature 08 hoje.** Medido: **não existe,
em lugar nenhum do client, um campo para digitar quanto chegou de verdade**. `atualizarItemDetalhe` é
chamado em 8 pontos e `quantidade_recebida` **não está** entre os campos; o painel mostra **uma**
quantidade só; no modal de criar, recebida nasce **igual** a esperada; e `PUT /conferir` **não tem
chamador**. Consequência: o alerta `DIVERGENCIA_RECEBIMENTO` tem consumidor, dedupe, e-mail e central —
e **nenhum produtor alcançável pela tela**, enquanto o manual (`:3037` e `:3045`) descreve o alerta e
até o dedupe *"corrigir a quantidade e errar de novo"*, texto que só faz sentido se houvesse onde
corrigir a quantidade.

**Contrato que ela consome (congelado na T3):** `PUT /almoxarifado/recebimentos/:id/conferir`, gate
`receber_material`, payload `{ itens: [{ id, quantidade_recebida, conferencia_quantidade }] }` **sem
`status`** (não avançar o workflow), mais `autorizar_excedente: true` quando a caixa estiver marcada.
Recusas: **400** e **403** com as literais da T3.

**Permissão: o campo e o botão NÃO decidem.** Quem decide é o backend. A UI usa
`useAlmoxPermissoes().pode('autorizar_excedente')` **apenas** para esconder a caixa de autorização, e
esse hook **falha aberto** de propósito. Consequência declarada: quem não tem a ação pode ver a caixa
por um instante e tomar **403 do servidor**, com a literal congelada — é o desenho, não um defeito.

**Pontos de atenção medidos:**
- `api.put` é `jest.fn()` **sem implementação** no `beforeEach` atual: devolve `undefined`, o `await`
  passa, o `catch` não dispara e o cenário fica verde sem payload. **Dê-lhe
  `mockResolvedValue({ data: { success: true } })`.**
- **Fixture nova obrigatória:** nenhum `DETALHES` de hoje tem status `EM_CONFERENCIA` com item — o
  **58** é `EM_CONFERENCIA` na lista e tem item `581` com `quantidade_esperada: 200` / `recebida: 200`.
  Confirme no arquivo e ajuste a fixture se o status do detalhe do 58 divergir do da lista.
- **O bloco de itens vive DENTRO do ternário de `loadingDetalhe`**; o bloco de **anexos** vive **fora**
  (fix `c5d9e99`). Não mover nada: o cenário **(g)** trava a identidade do nó de anexos e cai se o
  bloco for tocado.
- `toast` é mockado — asserção no **DOM** ou em `api.put`.

- [ ] **Step 1: escrever os cenários (m), (n) e (o) e ver falhar**

- **`(m) digitar a quantidade conferida chama PUT /conferir com o payload literal`**: abrir o painel do
  **58**, achar o input por `[title="Qtd. conferida"]`, `digitar(input, '187')`, clicar
  `Salvar Conferência`; afirmar
  `api.put.mock.calls.filter(([u]) => u === '/almoxarifado/recebimentos/58/conferir')` →
  `toHaveLength(1)` e `api.put.mock.calls[0][1]` **igual** a
  `{ itens: [{ id: 581, quantidade_recebida: 187, conferencia_quantidade: false }] }`
  (`toEqual`, não `toMatchObject` — a ausência de `status` **é** o contrato).
- **`(n) divergencia aparece na tela com as DUAS quantidades`**: com `187` digitado, o painel contém
  `Divergência: 13 a menos que o esperado (200)`, contém `187` e contém `Esperada: 200`. **Metade
  positiva no mesmo cenário:** digitar `200` → o DOM **não** contém `Divergência:` e **continua**
  contendo `Esperada: 200`.
- **`(o) excedente pede a autorizacao, e o 403 do servidor aparece`**: digitar `250`, afirmar
  `Divergência: 50 a mais que o esperado (200)` e a caixa
  `Autorizo o recebimento acima do pedido`; marcar a caixa, clicar `Salvar Conferência` e afirmar
  `api.put.mock.calls[0][1].autorizar_excedente === true`. **Metade negativa do servidor:** com
  `api.put` rejeitando `{ response: { data: { error: 'Autorizar recebimento acima do pedido exige a permissão "autorizar_excedente" (seu perfil: ALMOXARIFE).' } } }`,
  a tela **não** quebra e o painel continua montado (o toast é mock — a asserção é o painel de pé e
  `api.put` chamado **1** vez, nunca a mensagem).

> **CONTROLE POSITIVO do (m), declarado antes de escrever o código:** sem o input, o payload leva
> **200** (a recebida nasce igual à esperada) — é isso que prova que o cenário sabe falhar. Se o (m)
> ficar verde com `187` **antes** de o input existir, o cenário está lendo outro campo.

- [ ] **Step 2: rodar e ver os três vermelhos**

```
cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/RecebimentosAlmoxarifado.test.js
```

- [ ] **Step 3: implementar no painel**

No bloco de itens, **substituindo** a linha que hoje mostra uma quantidade só
(`{item.quantidade_recebida || item.quantidade_esperada} {item.unidade}`), as **duas** quantidades; e,
quando o status é `RECEBIDO` ou `EM_CONFERENCIA`, o input mais o aviso:

```jsx
{/* Etapa 36 (RN-16/RN-17): ate aqui o painel mostrava UMA quantidade — `recebida || esperada` —,
    e nao havia campo nenhum para dizer quanto chegou de verdade. Consequencia medida na Fase 0:
    `recebida` nunca diferia de `esperada` por gesto de tela, e o alerta DIVERGENCIA_RECEBIMENTO
    tinha consumidor, dedupe, e-mail e central, com ZERO produtor alcancavel. */}
<div style={{ textAlign: 'right' }}>
  <div style={{ fontWeight: 700 }}>{item.quantidade_recebida ?? item.quantidade_esperada} {item.unidade}</div>
  <div style={{ color: 'var(--gmp-text-light)', fontSize: '0.7rem' }}>Esperada: {item.quantidade_esperada}</div>
</div>
```

```jsx
{['RECEBIDO', 'EM_CONFERENCIA'].includes(detalhe.status) && (
  <div style={{ marginTop: 6 }}>
    <input className="almox-input" type="number" step="0.01" min="0"
      title="Qtd. conferida" placeholder="Qtd. conferida"
      value={item.quantidade_recebida ?? ''}
      style={{ fontSize: '0.75rem', padding: '4px 6px', maxWidth: 160 }}
      onChange={(e) => atualizarItemDetalhe(item.id, 'quantidade_recebida', e.target.value)} />
    {avisoDivergencia(item)}
  </div>
)}
```

`avisoDivergencia(item)` devolve `null` quando as quantidades batem (ou quando o campo está vazio) e,
quando diferem, o texto literal congelado — **`a menos`** ou **`a mais`**, com a diferença e a esperada
entre parênteses. Use `Math.abs` e formate a diferença sem casas sobrando (`Number(diff.toFixed(2))`),
para que `13` não apareça como `13.000000000000001`.

A caixa de autorização, **só** quando existe algum item com `recebida > esperada`:

```jsx
{temExcedente && pode('autorizar_excedente') && (
  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.78rem', marginTop: 8 }}>
    <input type="checkbox" checked={autorizarExcedente}
      onChange={(e) => setAutorizarExcedente(e.target.checked)} />
    Autorizo o recebimento acima do pedido
  </label>
)}
```

⚠️ `RecebimentosAlmoxarifado.js` **não importa** `useAlmoxPermissoes` hoje (só o `AnexosDocumento`
importa). Acrescente o import — e note que a suíte **já mocka o hook**, então nenhum cenário existente
quebra. Escreva no código que o hook **falha aberto** e que a decisão é do backend.

O botão, em `renderAcoes`, para `RECEBIDO` e `EM_CONFERENCIA`, **antes** do botão de workflow (salvar a
contagem é o gesto anterior a finalizar a conferência):

```jsx
<button type="button" className="btn-almox-secondary" style={{ width: '100%', justifyContent: 'center' }}
  onClick={salvarConferencia} disabled={saving}>
  <FiCheck size={14} /> Salvar Conferência
</button>
```

`salvarConferencia` monta **um objeto por item** com `id`, `quantidade_recebida` numérico
(`Number(...)`, não string — o input devolve string e o servidor faz `parseFloat`, mas o **contrato
congelado diz número** e o cenário (m) compara com `toEqual`) e
`conferencia_quantidade: <recebida === esperada>`; acrescenta `autorizar_excedente: true` **só** quando
a caixa está marcada; chama `api.put`, e no sucesso faz `abrirDetalhe(detalhe.id)` +
`loadRecebimentos()` — o **mesmo** molde de `salvarFiscal`, que é o que mantém o cenário (g) verde
(refetch do mesmo id não desmonta o bloco de anexos).

- [ ] **Step 4: rodar o arquivo inteiro** — os 12 cenários existentes (a)–(l) **mais** (m), (n), (o).
      Atenção nominal ao **(g)** (identidade do nó do bloco de anexos) e ao **(k)**/**(l)** (troca de
      linha e resposta fora de ordem): se algum deles cair, o bloco de itens foi movido de lugar.

- [ ] **Step 5: CONTROLE POSITIVO — três sabotagens**

| # | Sabotagem | O que TEM de cair |
|---|---|---|
| 1 | trocar `title="Qtd. conferida"` do input por outro texto | **(m)**, por `clicar(null)`/input não encontrado. ⚠️ Se isto derrubar **também** (n) e (o), está **certo** — os três dependem do input; o que **não** pode acontecer é derrubar (a)–(l) |
| 2 | no `salvarConferencia`, mandar `status: 'EM_CONFERENCIA'` junto | **(m)**, pelo `toEqual` do payload — é o controle de que "sem `status`" é contrato, e não descuido. O cenário existe porque avançar o workflow no gesto de salvar a contagem seria mudança de comportamento invisível |
| 3 | trocar o texto do aviso por "Quantidade divergente" | **(n)**, pela literal. Prova que a mensagem está congelada e é a mesma que vai para o manual |
| 4 | remover o `&& pode('autorizar_excedente')` da caixa | **nada cai** — e isso é **esperado e declarado**: a suíte mocka o hook com `pode: () => true`, então os dois lados são idênticos. **O achado:** a suíte **não** protege o esconder-por-permissão. Não forje vermelho e **não** remova a condição: escreva isso no cabeçalho do cenário (o backend é quem decide, e o 403 do servidor está travado pela T3) |

- [ ] **Step 6: `build` e commit**

```
cd client && CI=true npx react-scripts build
```

`CI=true` faz warning virar erro — variável não usada no bloco novo quebra o build. Commit com assunto
único: o campo de quantidade conferida. Corpo: o alerta de divergencia tinha consumidor e nenhum
produtor alcancavel (manual `:3037`/`:3045` prometia o que a tela nao permitia), a rota `/conferir`
existia sem chamador desde sempre (achado Critico de `alertaEventoGanchos`), a decisao (`/conferir` e
nao `/fiscal`, com os tres motivos) e o descartado (`/fiscal`, que so renderiza no Faturamento e
deixaria a rota morta).

---

### Task 6: `setLoadingDetalhe(false)` nas duas telas — declaradamente SEM régua **(galho C)**

**Files:**
- Modify: `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js` (`fecharDetalhe`, `:198-203`)
- Modify: `client/src/components/almoxarifado/RequisicoesList.js` (`fecharDetalhe`, `:320-326`)

**Duas correções, e a segunda é a que o plano da 35 errou.** Aquele plano dizia *"molde exato: o irmão
em Requisições, `2817054`"* — **está errado**: aquele commit acrescentou o **bump da sequência** e o
`syncSearchParams(null)`, e **não** zerou `loadingDetalhe`. O defeito é **gêmeo, não moldado**: fechar
só Recebimentos deixaria o irmão aberto, e a próxima sessão leria o plano da 35 e "consertaria" o mesmo
lado de novo.

**Declarada SEM régua automatizável, com a razão rastreada** (não presumida): nas duas telas, **todo**
consumidor de `loadingDetalhe` só renderiza com o painel aberto, e abrir o painel passa por
`abrirDetalhe`, que liga a flag na entrada — em qualquer id, inclusive o mesmo. Em Requisições o botão
de refresh (`disabled={loadingDetalhe}`) está sob `{detalhe && (...)}`, que é `null` depois do ✕.
**Não existe sequência de gestos em que a flag pendurada apareça no DOM.** Isto é o **caso 2** da
`fechar-etapa`: manter a forma segura e declarar que a suíte não a protege. A régua que o plano da 35
propunha (*"reabrir e ver se nasce em Carregando…"*) **não funciona**, e escrevê-la produziria o teste
vazio que o CLAUDE.md manda desconfiar.

**Descartado (c2 da medição):** dar a Recebimentos o botão de atualizar o detalhe que Requisições tem,
só para a flag ganhar consumidor. É **feature**, não régua — e mesmo com ele a flag continua
inobservável depois do ✕, porque o botão morre com o painel. Não amarrar as duas coisas.

- [ ] **Step 1: as duas linhas, com o comentário que explica o silêncio**

```js
  const fecharDetalhe = () => {
    ++detalheFetchSeqRef.current;
    setSelectedId(null);
    setDetalhe(null);
    idCarregadoRef.current = null;
    // Etapa 36 (RN-19): fechar tem de desligar o "carregando" TAMBEM. O `finally` de `abrirDetalhe`
    // so desliga a flag quando a sequencia ainda e a dele, entao fechar com um GET em voo a deixava
    // pendurada em `true` para sempre.
    //
    // SEM CENARIO DE TESTE, e isso e declaracao, nao esquecimento (caso 2 da skill fechar-etapa):
    // todo consumidor de `loadingDetalhe` nesta tela so renderiza com o painel aberto, e abrir o
    // painel passa por `abrirDetalhe`, que liga a flag na entrada — logo nao existe sequencia de
    // gestos em que a flag pendurada apareca no DOM. Qualquer assercao escrita hoje passaria antes
    // e depois desta linha (o controle positivo e um NO-OP declarado). A linha fica porque a forma
    // segura e barata e porque o proximo consumidor de `loadingDetalhe` — um botao de atualizar o
    // detalhe, por exemplo — herdaria o defeito em silencio.
    setLoadingDetalhe(false);
  };
```

O comentário do gêmeo em `RequisicoesList.js` diz **o mesmo** mais a frase que corrige o plano da 35:
*o `2817054` acrescentou o bump da sequência e o `syncSearchParams(null)`, e **não** zerou a flag —
o resíduo era gêmeo, não moldado*.

- [ ] **Step 2: rodar as DUAS suítes inteiras** (nenhum cenário novo — o que se prova aqui é
      **não-regressão**)

```
cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/RecebimentosAlmoxarifado.test.js
cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/RequisicoesList.test.js
```

- [ ] **Step 3: CONTROLE POSITIVO declarado como NO-OP, e executado de qualquer forma.** Apague a linha
      `setLoadingDetalhe(false);` de **cada** tela (uma por vez, `grep -cF` = 1, `md5sum`
      antes/depois/depois-de-restaurar, restauro por **perl inverso** — **nunca** `git checkout --`,
      que levaria o conserto embora junto) e rode as duas suítes. **Esperado: nada cai, nas duas.**
      Registre aqui o placar idêntico dos dois lados — é isso que transforma "não testei" em "não é
      testável com este harness, e aqui está a prova". **Se algo cair, é achado**: existe consumidor
      observável que o rastreamento não achou; escreva o cenário e mude esta task para "com régua".

- [ ] **Step 4: commit** — assunto único: o resíduo do `loadingDetalhe`. Corpo: o resíduo era GEMEO
      (`RequisicoesList.js` tinha o mesmo, e o plano da Etapa 35 afirmava que o `2817054` servia de
      molde — **estava errado**), por que nao ha cenario (todo consumidor da flag so renderiza com o
      painel aberto) e que o controle positivo e um no-op declarado, com o placar.

---

### Task 7: integração — as duas portas em sequência, pela ROTA e pelo SERVIÇO **(sequencial)**

**Files:**
- Create: `server/tests/api/recebimentoPortasIntegracao.api.test.js`

**Por que este teste existe.** Verde por unidade não prova que as partes compõem, e nesta etapa há três
guardas novas em **cinco** pontos de chamada (duas em `criarRecebimento`/`salvarDadosFiscal`, duas em
`conferirRecebimento`/`salvarDadosFiscal`, mais o `validate` das duas rotas). O que **cruza** é a
ordem: a guarda de NF mora no **serviço**, o `validate` mora na **rota**, e a de excedente mora no
serviço mas depende de `req.user`, que a rota injeta. **A regra da Fase 3 é explícita**: onde existem os
dois caminhos, exija um cenário que entre **pela rota** e outro que entre **pelo serviço**.

- [ ] **Step 1: o cenário pela ROTA — o fluxo inteiro, na ordem, contando os documentos**

```
test('integracao pela ROTA: enum, NF duplicada nas duas portas, conferencia, divergencia e excedente')
```

Passos, cada um com a sua asserção (e a contagem de documentos no fim de cada bloco):

| # | Gesto | Esperado |
|---|---|---|
| 0 | `POST /recebimentos` com `tipo_recebimento: 'BANANA'` | **400** com a literal do enum, e `COUNT(recebimentos) === 0` |
| 1 | `POST /recebimentos` válido, `nota_fiscal: 'NF-INT-1'`, `fornecedor_id: F1`, item esperado **10** | **201**; `COUNT === 1` |
| 2 | `POST /recebimentos` com a **mesma** NF e o mesmo fornecedor | **409** citando o número do documento do passo 1; `COUNT` continua **1** |
| 3 | `POST /recebimentos` com a mesma NF e **F2** | **201**; `COUNT === 2` (a metade positiva dentro do fluxo) |
| 4 | `PUT /<doc do passo 3>/fiscal` com `nota_fiscal: 'NF-INT-1'` e **F1** | **409** — a segunda porta, citando o número do passo 1 |
| 5 | `PUT /<doc do passo 1>/conferir` com `quantidade_recebida: 7` | **200**; coluna **7** no banco; `listarDivergenciasRecebimento` lista **1** item |
| 6 | `PUT /<doc do passo 1>/conferir` com `quantidade_recebida: 99`, sem flag | **400** com a literal do excedente; a coluna **continua 7** |
| 7 | idem, com `autorizar_excedente: true`, `setUser(ALMOXARIFE)` | **403** com a literal da permissão; a coluna **continua 7** |
| 8 | idem, com `autorizar_excedente: true`, `setUser(GESTOR)` | **200**; coluna **99**; auditoria `EXCEDENTE_AUTORIZADO` presente |
| 9 | `setUser(SEM_PERFIL)` e qualquer um dos gestos acima | **403** de `receber_material` — a camada 2 continua na frente de tudo |

**A ordem 6 → 7 → 8 é o ponto do cenário:** o mesmo gesto, três respostas diferentes, mudando **só** a
flag e o perfil. Nenhum teste de unidade cobre isso, porque cada um deles monta o seu próprio usuário.

- [ ] **Step 2: o cenário pelo SERVIÇO — porque as duas guardas MORAM no serviço**

```
test('integracao pelo SERVICO: as guardas nao dependem da rota para existir')
```

Chamando `receiptService.criarRecebimento(db, USER, {...})` e
`receiptService.conferirRecebimento(db, USER, id, {...})` **direto**, sem `supertest`:

- criar com a mesma NF/fornecedor duas vezes → a segunda **rejeita** com `err.status === 409` e a
  literal (`assert.rejects` com a regex da mensagem, ou `try/catch` afirmando `e.status`);
- conferir com excedente e sem flag → `err.status === 400`;
- conferir com flag e um `user` de perfil `ALMOXARIFE` → `err.status === 403`;
- **a metade positiva:** conferir com `recebida < esperada` → resolve, e a coluna muda.

**Por que isto não é redundante com o cenário da rota:** se alguém, amanhã, mover a guarda de NF para a
**rota** (por parecer mais simples), o cenário da rota **continua verde** e este fica **vermelho** — e o
achado é justamente que o `PUT /fiscal` e o `criarRecebimento` têm outros chamadores potenciais
(importador, script de migração, a própria `processarNota`). É o inverso do defeito da Etapa 25, onde 12
cenários de unidade verdes esconderam a feature morta.

- [ ] **Step 3: rodar os cinco comandos da `fechar-etapa` e LER os números**

```
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```

Baseline da Etapa 35, para comparar: `test:api` **169/169 arquivos OK**; almoxarifado **42 passou, 0
falhou**; validation/safealter/sqlite **4/3/5**; client **47 suítes / 699 testes**; build limpo.
**Previsão desta etapa:** `test:api` **174/174** (+5 arquivos: enum, NF duplicada, excedente, workflow,
integração), client **47 suítes / 702 testes** (+3 cenários em `RecebimentosAlmoxarifado.test.js`,
nenhuma suíte nova). **Confira os números reais e registre — não confie nesta previsão.**

- [ ] **Step 4: reexecutar contra ESTE arquivo as sabotagens que a T2 e a T3 registraram como "cai só
      no arquivo dela"** — em particular a nº 3 da T2 (posição da guarda de NF) e a nº 3 da T3
      (ALMOXARIFE na lista). As duas têm de derrubar **também** este arquivo, e no passo certo (2 e 7,
      respectivamente). Se derrubarem o arquivo inteiro por um erro anterior, o cenário está acoplado
      demais: separe os passos.

- [ ] **Step 5: commit** — assunto único: o cenário de integração. Corpo: por que ele existe (tres
      guardas em cinco pontos, com a de NF e a de excedente no SERVICO e o `validate` na ROTA), e o que
      o cenario do servico pega que o da rota nao pega.

---

### Task 8: fechamento — e as seis coisas que a documentação dizia errado **(sequencial)**

**Files:**
- Modify: `specs/modulo-almoxarifado/08-recebimento/README.md` (topo, checklist, tabela de testes, e as
  três refs de linha apodrecidas)
- Modify: `specs/modulo-almoxarifado/README.md` (linha 917, a da feature 08)
- Modify: `docs/almoxarifado-guia-etapas-e-testes.md` (cabeçalho "onde o desenvolvimento está" + seção
  da Etapa 36 + roteiro de teste manual)
- Modify: `docs/almoxarifado-novidades-por-etapa.md` (seção da etapa; **letra A** com a consulta SQL de
  produção; **letra B** a partir de **B80**; **letra C** com os itens novos a partir de **C48**)
- Modify: `docs/almoxarifado-manual-do-sistema.md` (seções 14.1/14.2/**14.4**/14.8 e o trecho dos
  alertas em `:3037`/`:3045`)
- Modify: `docs/superpowers/plans/2026-09-16-almoxarifado-etapa35-vizinhas-da-34.md` (a tabela final e
  o item (c) da "próxima tarefa detalhada")
- Modify: este plano (tasks marcadas, números reais, **próxima tarefa detalhada — Etapa 37**)

Use a skill **`fechar-etapa`** — ela é a versão executável do contrato.

- [ ] **Step 1: a spec 08 — status, checklist item por item, com hash**
      - `Tipos de entrada` → o enum fechado e validado nas duas portas (**`[x]` parcial explicado**: o
        campo e a validação estão feitos; **ampliar para os dez tipos da spec 8.1 continua sendo decisão
        de negócio**, e as features 11–15 🟢 já são a porta dos outros tipos — se ficar desmarcado, o
        **por quê** vai escrito ali, senão parece esquecimento);
      - `Duplicidade: mesma NF+fornecedor não entra duas vezes` → **`[x]`** com o hash, mais as três
        exceções (NF vazia, fornecedor diferente, fornecedor não identificado) e o **`UNIQUE`
        descartado com motivo**;
      - `Recebimento excedente só com autorização` → **`[x]`** com o hash, a ação nova e a exclusão do
        ALMOXARIFE;
      - `Campos de conferência física + fotos` (frontend) → **parcialmente**: a **quantidade** conferida
        existe agora; contagem/pesagem/medição/checklist **não** — e isso vai dito na mesma linha;
      - tabela de testes: as linhas `recebimento com NF duplicada falha`,
        `recebimento excedente sem autorizacao falha` e `avancar etapa fora de ordem falha` saem de
        **⏳** para **✅** com o nome do arquivo; `recebimento parcial atualiza saldo pendente do pedido`
        e `processar recebimento cria movimentacao v2 vinculada` **continuam ⏳**, e o primeiro ganha o
        motivo medido (coluna nova + escritor + Compras).
- [ ] **Step 2: dizer que a documentação estava errada — as SEIS correções, nenhuma em silêncio**
      (regra 5 do CLAUDE.md; apagar a afirmação errada sem dizer faz o próximo confiar nela de novo):
      1. **spec 08, item "Ao aprovar … + gerar etiqueta":** *"Continuam faltando a etiqueta"* —
         **errado**. A etiqueta foi entregue em 2026-08-11, Etapa 6c, **`4ebd1ce`**; o botão está em
         `RecebimentosAlmoxarifado.js` (*"Imprimir etiquetas dos itens"*, status `PROCESSADO`/
         `APROVADO`), o montador em `client/src/utils/etiquetasPdf.js` e a **spec 10 já registra**. O
         que **de fato** falta neste item é a **sugestão de localização** (feature 02) e a etiqueta
         **automática ao aprovar** (decisão de negócio, não ausência).
      2. **plano da Etapa 35, tabela final:** repete "etiqueta" como falta da 08 — **mesmo erro**,
         corrigir lá também.
      3. **spec 08, três refs de linha apodrecidas:** `extended.js:765` → **`:973`** (`:765` é a
         `POST /movimentacoes/v2`); `schema.js:1147` → **`:1229`**; `receiptService.js:281` → **`:286`**.
         Trocar por **nome de rota/função**, que é o que sobrevive a um commit — o mesmo movimento que a
         Etapa 35 fez no F3.
      4. **plano da Etapa 35, item (c) da próxima tarefa:** *"molde exato: o irmão em Requisições,
         `2817054`"* — **errado**: aquele commit **não** zerou `loadingDetalhe` e
         `RequisicoesList.js:320-326` tinha o **mesmo** resíduo; e a régua que ele propunha (*"reabrir e
         ver se nasce em Carregando…"*) **não funciona**, porque `abrirDetalhe` liga a flag em toda
         abertura. O resíduo era **gêmeo, não moldado**.
      5. **manual 14.4:** o título *"Reprocessar a mesma nota não duplica estoque"* é verdade **por
         documento** (idempotência por item, via `entrada_estoque_em`) e **era falso entre
         documentos** — medido: a mesma NF em dois recebimentos creditava **20** em vez de 10 e gerava
         **2** contas a pagar. **Depois desta etapa passa a valer entre documentos**, e a seção tem de
         ser **reescrita** dizendo as duas coisas: o que já valia (por documento) e o que passou a valer
         (por fornecedor + número). A 14.8, escrita na Etapa 35, já avisava do risco de *"registrar de
         novo uma nota que já existe"* — agora o sistema **barra**, e isso entra lá.
      6. **manual `:3037`/`:3045`:** prometiam o alerta de divergência de quantidade e até o dedupe por
         valor corrigido, mas **nenhum gesto de tela** produzia `recebida ≠ esperada`. **Depois da T5
         passa a existir** — reescrever descrevendo **onde** se digita a quantidade conferida e **qual**
         frase aparece.
      > **Regras do manual:** sem número de etapa, sem hash, sem nome de arquivo/função/tabela, sem
      > "antes era assim"; regra explicada com precisão técnica; **mensagem literal lida do código**,
      > entre aspas; português com acento. E o que **bloqueia** (409 da NF, 400/403 do excedente)
      > separado do que só **avisa** (o alerta de divergência).
- [ ] **Step 3: letra A com a CONSULTA SQL de produção** — é a contrapartida de ter descartado o
      `UNIQUE`, e sem ela a decisão fica sem prazo:

```sql
-- Duplicatas de NF por fornecedor ANTES de considerar UNIQUE(nota_fiscal, fornecedor_id).
SELECT nota_fiscal, fornecedor_id, COUNT(*) AS documentos,
       GROUP_CONCAT(numero, ' | ') AS recebimentos
  FROM recebimentos_material_almoxarifado
 WHERE TRIM(COALESCE(nota_fiscal,'')) <> ''
 GROUP BY UPPER(TRIM(nota_fiscal)), fornecedor_id
HAVING COUNT(*) > 1
 ORDER BY documentos DESC;
```

Dizer na letra A: **zero linhas** ⇒ o `UNIQUE` pode subir numa etapa futura sem migração de dado;
**qualquer linha** ⇒ decidir o que fazer com o acervo **antes**, e a guarda em serviço continua sendo a
resposta certa até lá.

- [ ] **Step 4: mapa e guia.** Linha 917 do mapa com as duas portas fechadas, a ação nova e o campo de
      conferência; e o guia com a seção da Etapa 36 em **linguagem de usuário**: tabela
      **Antes → Agora** (NF repetida entrava / agora recusa dizendo em qual recebimento ela está;
      quantidade conferida não existia / agora existe com o aviso de divergência; excedente entrava
      calado / agora exige autorização de quem tem a permissão), **roteiro de teste manual clicável**
      (registrar uma NF, tentar registrar a mesma, abrir o painel de um recebimento em conferência,
      digitar menos, ver o aviso, salvar, digitar mais, ver a caixa de autorização, salvar com um perfil
      sem a permissão e ver a recusa) e **o que a etapa NÃO cobre** (recebimento parcial, conferência
      física estruturada, divergência formal numerada, `UNIQUE` no banco).
- [ ] **Step 5: letra B a partir de B80** com as **11 decisões** do design, cada uma com o escolhido e o
      descartado; e **letra C a partir de C48** para os itens que nenhuma spec tinha: o alerta de
      divergência sem produtor alcançável, a rota `/conferir` sem chamador, o `UPDATE` de item do
      `/conferir` sem `COALESCE`, e o resíduo gêmeo do `loadingDetalhe`. Confira os números livres com
      `grep -o "\*\*B[0-9]\+" docs/almoxarifado-novidades-por-etapa.md | sort -u | tail -3` e
      `grep -o "C[0-9]\+" ... | sort -u | tail -5` (medido nesta Fase 1: último **B79**, último
      **C47**).
- [ ] **Step 6: a próxima tarefa detalhada — Etapa 37**, no fim deste plano, com `arquivo:linha`, o
      contrato que cada uma consome e o que **não** reabrir. Candidatas medidas, em ordem de valor:
      (a) **recebimento parcial** (coluna `quantidade_recebida` em `itens_pedido_compra` + escritor +
      decisão de quando o pedido fecha — atravessa Compras, **etapa própria**); (b) **divergência formal
      numerada**, que agora tem dado de entrada; (c) o **`UNIQUE` da NF** depois da consulta da letra A;
      (d) o campo de `tipo_recebimento` **no modal fiscal** (hoje o modal reescreve o valor sem
      mostrá-lo); (e) a limpeza das ~15 citações por linha em `RecebimentosAlmoxarifado.test.js`
      (achado da T7 da 35); (f) o **teto da faixa do clipe** (F12, exige navegador) e os furos
      **C43/C44** da Etapa 33.
- [ ] **Step 7: o checklist final da `fechar-etapa`** — os cinco comandos, com os números **lidos da
      saída**, `git status` limpo (fora os três artefatos não versionados conhecidos), e
      `git merge-base --is-ancestor <hash> HEAD` para **cada** hash citado nos documentos.
- [ ] **Step 8: commit** — um commit, assunto único: o fechamento da etapa.

---

## Self-review do plano

- **Cobertura RN ↔ task ↔ sabotagem.** RN-11 → T1 cenários (1)(2)(3)(4)(5) + sabotagens 1 (strip), 2
  (segunda porta), 3 (export), 4 (literal); RN-12 → T2 (1)(2) + sabotagens 1 e 3 (**posição**);
  RN-13 → T2 (3)(4)(5) + sabotagem 4; RN-14 → T2 (6) + sabotagem 2; RN-15 → T4 (1)(2)(3) + sabotagens 1,
  2 e 3 (**posição**, no conjunto `de`); RN-16 → T5 (m) + T3 (4) [ponta de servidor] + sabotagens 1 e 2
  da T5; RN-17 → T5 (n) + sabotagem 3; RN-18 → T3 (1)(2)(3)(4) + sabotagens 1, 2, 3 (**a lista
  negativa**) e 4 (**posição**, `>` vs `>=`) + T5 (o); RN-19 → T6, **declaradamente sem régua**, com o
  no-op executado e registrado. **Nenhuma RN sem sabotagem nomeada, e nenhuma sabotagem sem a asserção
  que ela tem de derrubar.**
- **As duas sabotagens previstas como "nada cai", ditas de frente.** T5 nº 4 (remover o
  `pode('autorizar_excedente')`) e o controle da T6 — as duas são caso 2 da `fechar-etapa` (defeito
  inalcançável pelo harness: o hook é mockado com `pode: () => true`; a flag não tem consumidor
  observável). Nos dois casos a instrução é **manter a forma segura e declarar**, nunca forjar vermelho
  nem remover a proteção. A prova que existe está do outro lado: o **403 do servidor** (T3) e o cenário
  do passo 7 da integração.
- **Nenhum cenário negativo sem metade positiva.** T1: o POST válido de quatro colunas + o default
  derivado; T2: fornecedor diferente, NF nula, fornecedor não identificado, e o `PUT` da própria NF;
  T3: `recebida === esperada`, `recebida < esperada`, e o **200 do GESTOR** no mesmo `test()` do 403;
  T4: a sequência de cinco `200`; T5: `Esperada: 200` no DOM nos dois lados e o painel de pé no 403;
  T7: o passo 3 (mesma NF, outro fornecedor) dentro do fluxo.
- **Nenhum id de fixture `1`.** Client: `41`/`58`/`77`/`91`, item `581`. Servidor: ids lidos do
  `INSERT`/do `res.body`, **nunca escritos à mão** — e as literais que citam id (`item #<id>`,
  `recebimento <numero>`) são montadas a partir do banco. Usuários de teste `64`/`65`/`66`.
- **Mensagens literais congeladas, e em um lugar só.** A do enum vive numa constante
  (`TIPO_RECEBIMENTO_INVALIDO`) consumida pelos dois schemas; as do excedente vivem em
  `assertExcedentePermitido`, consumidas pelas duas portas; a da NF duplicada vive em
  `assertNotaNaoDuplicada`. **Nenhuma literal é escrita duas vezes no código de produção** — os testes
  as repetem de propósito (é o que os torna régua) e o manual as copia lidas do código.
- **Contratos completos:** os quatro endpoints tocados têm método, gate, payload, resposta e **todos** os
  códigos de recusa com a literal; as duas ações de `ACAO_PERFIS` estão na tabela, com **onde** cada uma
  é checada (rota vs serviço).
- **Consistência de nomes e tipos:** `TIPOS_RECEBIMENTO` é `string[]` exportado de `schema.js`;
  `assertNotaNaoDuplicada(db, dados, recebimentoId?)` e
  `assertExcedentePermitido(db, user, recebimentoId, itens, autorizado)` são internas do
  `receiptService` (exportar **só** se a T7 chamar direto, e então dizer por quê); no client,
  `quantidade_recebida` sai do input como **string** e é convertido com `Number(...)` **antes** do
  `api.put`, porque o contrato congelado diz número e o cenário (m) compara com `toEqual`.
- **Sem placeholders:** todo passo que muda produção traz o código ou a literal exata. As duas únicas
  coisas deixadas para a execução medir estão marcadas com ⚠️ e com a instrução do que fazer: as colunas
  obrigatórias de `pedidos_compra` no cenário (4) da T1, e o status real do detalhe do **58** na fixture
  da T5.
- **O que este plano NÃO garante, dito de frente:** (1) nenhum teste desta etapa prova que a caixa de
  autorização **esconde** de quem não tem a permissão — a suíte mocka o hook, e a decisão real é o 403
  do servidor; (2) nada aqui mede duplicatas de NF **em produção** — é o que a consulta da letra A
  existe para fazer, **antes** de qualquer decisão sobre o `UNIQUE`; (3) o `tipo_recebimento` inválido
  que já estiver gravado continua sem caminho de correção pela tela (o modal fiscal não tem o campo), e
  isso está na próxima tarefa detalhada, não escondido.
