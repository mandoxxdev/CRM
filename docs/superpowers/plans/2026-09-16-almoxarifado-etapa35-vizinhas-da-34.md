# Etapa 35 — O que a revisão da 34 achou nas telas vizinhas: implementação

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` para
> executar este plano task a task. Os passos usam checkbox (`- [ ]`). Antes da primeira task, leia
> `.superpowers/sdd/etapa35-fase0-medicao.md` (a medição, com `arquivo:linha` de tudo) e o design
> abaixo. **Onde a medição e este plano divergirem, vale a medição** — e onde este plano corrigiu a
> medição, está dito com o número certo e o motivo.

**Goal:** fechar os três defeitos **pré-existentes** que a revisão da Etapa 34 achou nas telas
vizinhas: a requisição buscada **duas vezes** por clique, a falha de rede de Recebimentos
disfarçada de **"Nenhum recebimento registrado"** (mais o painel que mostra o registro anterior sob
o id novo e a resposta fora de ordem que vence), e a coluna de ações **cortada** pelo contêiner das
tabelas do módulo.

**Architecture:** três frentes que não cruzam dado — uma flag de navegação interna por identidade de
query em `RequisicoesList.js`; estado de erro no DOM + `selectedId`/`idCarregadoRef`/`fetchSeq` em
`RecebimentosAlmoxarifado.js`; `flex-wrap` medido por aritmética de piso duro em
`Almoxarifado.css`. **Nenhuma linha de `server/` muda.**

**Tech Stack:** React CRA; testes com `createRoot` + `act` (⚠️ `@testing-library/react` **não está
instalado** nesta base — `RequisicoesList.test.js:12-14` e `RecebimentosAlmoxarifado.test.js:33-35`
são os moldes).

**Spec:** `docs/superpowers/specs/2026-09-16-almoxarifado-etapa35-vizinhas-da-34-design.md` — leia
junto; as RN-01 a RN-10 e as sete decisões (com o descartado) estão lá.

## Global Constraints

- **Nenhuma alteração em `server/`.** Se uma task achar que precisa, **pare e reporte**. Os três
  itens são de client; não há contrato de API novo, nem mudança em `ACAO_PERFIS`, nem migration.
- **A autorização em duas camadas não é tocada.** `checkModulePermission` abre a tela;
  `services/almoxarifado/permissions.js` + `requirePermission` deixa agir; `getPerfilFromUser` cai
  em `PRODUCAO`. Em particular, o gate de `warehouseMode` do bloco de anexos (fix `a88d715`,
  travado por `RequisicoesList.test.js:560-577`) **não pode ser afrouxado** por nenhum conserto.
- **Almoxarifado é área física, não filial.** Saldo global por material é correto e intencional;
  nada aqui sugere seletor de almoxarifado.
- **`@testing-library/react` NÃO existe aqui.** `createRoot` + `act`, com
  `global.IS_REACT_ACT_ENVIRONMENT = true` no `beforeEach`.
- **O comando de teste do client leva CAMINHO, não `-t`.** `-t` é `--testNamePattern` e devolve
  `N skipped, exit 0` — achado nº 1 da Fase 2 da Etapa 32. Use
  `cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/Arquivo.test.js`.
- **Português com acento no código, nos comentários e nas mensagens de tela; sem acento no corpo do
  commit.**
- **Nunca `git add -A` na raiz** — há artefatos de runtime em `server/data/` e `server/uploads/`.
  Nesta etapa há também `server/data/database.sqlite.bak`, `server/nodemon.json` e
  `docs/bkp_bancoprod.md` **não versionados** na árvore (vistos no `git status` de abertura):
  `git add` só dos caminhos que a task tocou.
- **Nenhum commit com a suíte vermelha.** A T1 existe para **ver o vermelho** e registrá-lo no
  plano; o commit é da T2, que leva teste + conserto juntos (decisão 7 do design).
- ⚠️ **Harness de sabotagem nesta máquina: `python3` NÃO existe no Git Bash.** É o alias da
  Microsoft Store (`/c/Users/User/AppData/Local/Microsoft/WindowsApps/python3`), que imprime
  *"Python was not found; run without arguments to install from the Microsoft Store…"* e **não
  executa nada** — o no-op silencioso exato que a regra da `fechar-etapa` quer evitar, só pela
  causa oposta à que ela descreve. **Medido nesta sessão.** Use `perl -0pi -e` ou `sed` para aplicar
  a sabotagem, `grep -cF '<ancora>'` (tem de dar **exatamente 1**) antes, `md5sum` antes / depois da
  sabotagem / depois de restaurar, e `git diff --stat` vazio no fim. A T7 registra isso na letra B e
  propõe a correção do texto da skill.
- ⚠️ **(Fase 2) Em `Almoxarifado.css` NENHUMA declaração isolada serve de âncora.** Medido nesta
  revisão: `grep -cF 'gap: 6px'` = **5**, `white-space: nowrap` = **9**, `overflow: hidden` = **7**,
  `flex-wrap: wrap` = **6** (antes do conserto), `width: 32px` = **2**. A regra "âncora = 1" ficaria
  **insatisfazível** e um `perl -0pi` sem `/g` acertaria a **primeira** ocorrência, que está noutra
  regra — a "sabotagem aplicada na tabela errada" que a `fechar-etapa` descreve. **A âncora do CSS é
  sempre o SELETOR ancorado em início de linha**, contado com `grep -cE '^\.almox-actions \{'` (= 1),
  `'^\.almox-btn-icon \{'` (= 1), `'^\.almox-table-container \{'` (= 1) e
  `'^\.btn-almox-secondary \{'` (= **1**; `grep -cF '.btn-almox-secondary {'` dá **2**, porque
  `:1486` é `.almox-mapa-page .btn-almox-secondary {`). As sabotagens da T5 foram reescritas com
  `perl -0pi -e` **por bloco**, não por declaração.

## ⚠️ O modo de falha desta etapa: o teste que já passa com o defeito de pé

Esta etapa não pluga nada novo — ela endurece réguas em cima de código que **hoje passa verde com o
defeito**. Os três modos de falha, todos medidos:

1. **A régua de (a) pode ficar verde de primeira.** O cenário do clique
   (`RequisicoesList.test.js:528-553`) conta anexos (`:550`), **não** conta o GET do detalhe. Se a
   asserção nova
   (`api.get.mock.calls.filter(([u]) => u === '/almoxarifado/requisicoes/55')` → `toHaveLength(1)`)
   **não** ficar vermelha com `Received 2` **antes** do conserto, o cenário não está passando pelo
   caminho do clique e o teste é vazio. **O número esperado antes do fix é 2.** É por isso que a T1
   é uma task inteira.
2. **Conserto de (b) que só melhore o toast é invisível.** `toast` é mockado
   (`RecebimentosAlmoxarifado.test.js:42-44`) — a mensagem tem de ir para o **DOM**, e o cenário
   afirma o **texto renderizado**, no molde `HistoricoInspecoes.test.js:219-222`, incluindo o
   `not.toContain('Nenhum recebimento registrado')`.
3. **O fallback do mock de Recebimentos REJEITA, mas não para a lista.** `:133` rejeita **URL
   inesperada**; `/almoxarifado/recebimentos` está mapeada em `:120` e **resolve**. O cenário de
   rede caída tem de **sobrescrever** `api.get.mockImplementation` (molde exato:
   `HistoricoInspecoes.test.js:211-216`) — contar com o fallback não derruba nada.

### Quatro regras herdadas, e valem para TODAS as tasks

**(i) Metade positiva dentro de cada cenário negativo.** "Não mostra a lista" passa com a tela
vazia; "não consulta anexos" passa sem linha nenhuma. Em Recebimentos a metade positiva é o
cabeçalho `Recebimentos NF` (`RecebimentosAlmoxarifado.js:404`) ou a contagem de linhas contra a
fixture; em Requisições é `REQ-055` no painel.

**(ii) Conte as chamadas, não use `toHaveBeenCalledWith` solto.** `toHaveBeenCalledWith` é satisfeito
por 1, 2 ou 10 — e o defeito desta etapa **é** o número. Toda asserção de carga é
`filter(...)` + `toHaveLength(n)` ou `.length` + `toBe(n)`.

**(iii) Nenhum id de fixture `1`, nem o primeiro da lista.** Já está respeitado nas duas suítes
(Requisição `55`; Recebimentos `41`/`58`/`77`/`91`, com o painel dos cenários no **58**) — os
cenários novos usam os mesmos.

**(iv) Sabotagem que derruba a suíte por `TypeError` não é controle positivo.** Se o componente
lança no primeiro render, **todos** os cenários caem juntos e nenhum provou nada. Em Recebimentos
isso é um risco concreto: o cabeçalho do painel desreferencia `detalhe.numero` (`:489`) — por isso a
T4 troca por `detalhe?.numero || '...'` **antes** de anular `detalhe`.

> ⚠️ **(Fase 2) A versão original desta regra listava só `:489` — e era exatamente por isso que o
> plano continha a sabotagem acidental que ele mesmo proíbe.** Trocando o gate do painel para
> `{selectedId && (` (`:485`), o `detalhe` nulo é desreferenciado em **três** lugares, não um:
> (1) o cabeçalho `:489-491`; (2) o corpo inteiro a partir de `:501` (`detalhe.nota_fiscal`,
> `detalhe.itens`, `detalhe.status`), que hoje só é protegido pelo ternário `loadingDetalhe ?` de
> `:496`; e (3) — o que ninguém tinha visto — **o bloco de anexos de `:607-609`**, que o fix
> `c5d9e99` da Etapa 34 tirou de dentro do ternário de `loadingDetalhe` e que lê
> `entidadeId={detalhe.id}` **fora de qualquer guarda**. Com o gate em `selectedId` e `detalhe`
> nulo, `detalhe.id` estoura no **primeiro clique de qualquer cenário** — (b), (c), (d), (e), (f),
> (g), (k) e (l) caem juntos por `TypeError`. A T4 corrige os três pontos; ver a tabela de render
> lá, que passou de cinco para **sete** linhas.

## Contratos congelados — os contratos de TESTE

Não há API nova nesta etapa, então o que se congela são as réguas. Cada RN tem cenário nomeado,
asserção literal e o mock que a torna observável.

| RN | Cenário (nome literal do `test(`) | Arquivo | Asserção que guarda o achado | Mock que a torna observável |
|---|---|---|---|---|
| RN-01 | `RN-02: sem detalhe aberto não consulta anexos; abrir a requisição consulta` (o que já existe, `:528`) | `RequisicoesList.test.js` | `expect(cargasDoDetalhe()).toHaveLength(1)` | o `beforeEach` de `:84-95`, com `renderizarSemDetalhe()` (`:121-129`) e `container.querySelector('tbody tr').click()` (`:535`) |
| RN-02 | `o painel de detalhe mostra os anexos DA REQUISIÇÃO aberta` (`:503`) | `RequisicoesList.test.js` | `expect(cargasDoDetalhe()).toHaveLength(1)` **acrescentada** ao cenário existente | `renderizar()` (`:110-118`), com `?id=55` na URL |
| RN-03 | `integração: clique, foco, troca de filtro e VOLTA do filtro — uma carga por gesto` (novo) **(Fase 2: 4 passos, não 3)** | `RequisicoesList.test.js` | `toHaveLength(1)` → `(2)` → `(3)` → **`(4)`** nos quatro passos | `window.dispatchEvent(new Event('focus'))` e o **único** `input[type="checkbox"]` da tela (`RequisicoesList.js:778`), clicado duas vezes (molde `:583-614`) |
| RN-04 | `(h) a lista que NAO carregou mostra erro, nunca "Nenhum recebimento registrado"` (novo) | `RecebimentosAlmoxarifado.test.js` | `expect(container.textContent).not.toContain('Nenhum recebimento registrado')` **+ (Fase 2)** clicar `Tentar de novo` com o mock restaurado e ver as 3 linhas voltarem (molde `HistoricoInspecoes.test.js:227-242`) | **sobrescrever** `api.get.mockImplementation` rejeitando `/almoxarifado/recebimentos` com `{ response: { data: { error: 'Sem acesso ao módulo' } } }` |
| RN-05 | `(i) refresh que falha nao deixa a lista velha na tela` (novo) | `RecebimentosAlmoxarifado.test.js` | `expect(linhas()).toHaveLength(0)` **e** `toContain('Não foi possível carregar os recebimentos.')` | render com a fixture de 3 linhas, **depois** trocar o mock para rejeitar e clicar o botão de refresh (`:409`) |
| RN-06 | `(j) falha ao carregar materiais aparece DENTRO do modal de novo recebimento` (novo) | `RecebimentosAlmoxarifado.test.js` | `toContain('Não foi possível carregar a lista de materiais.')` **e** `expect(container.querySelector('input.almox-search-input')).not.toBeNull()` | mock rejeitando **só** `/almoxarifado/materiais`; a lista continua resolvendo (prova que um erro não contamina o outro) |
| RN-07 | `(k) trocar de linha nao mostra o recebimento anterior sob o id novo` (novo) | `RecebimentosAlmoxarifado.test.js` | `expect(painel().textContent).not.toContain('REC-2026-058')` **e** `expect(blocoAnexos()).toBeNull()` com o GET do 41 em voo | GET de `/almoxarifado/recebimentos/41` **suspenso** numa promessa manual (molde `:351-359`) |
| RN-08 | `(l) resposta fora de ordem nao vence — o ULTIMO clique manda` (novo) | `RecebimentosAlmoxarifado.test.js` | `expect(painel().textContent).toContain('REC-2026-041')` **depois** de liberar o 58 atrasado | GET do 58 suspenso, clique no 41 resolvendo, `liberar58()` por último |
| RN-09 | `(g) refetch do detalhe por acao de workflow NAO desmonta o bloco nem repete a consulta` (**já existe**, `:340`) | `RecebimentosAlmoxarifado.test.js` | `expect(blocoAnexos()).toBe(antes)` — identidade de nó | o GET do refetch deferido à mão (`:351-359`); **não mexer nisso** |
| RN-10 | `as premissas da medicao do clipe continuam valendo` (novo) | `almoxActionsCss.test.js` | `expect(/\.almox-actions\s*\{[^}]*flex-wrap:\s*wrap/.test(css)).toBe(true)` + 4 premissas | `fs.readFileSync` de `Almoxarifado.css` (molde: `anexosEntidades.test.js` lê fonte com `fs`) |

**Helpers que os cenários novos reusam (já existem, não reescreva):**
`RecebimentosAlmoxarifado.test.js:163-170` — `linhas()`, `linhaDe(numero)`, `painel()`,
`blocoAnexos()`, `chamadasAnexos()`, `chamadasDetalhe(id)`, `botaoPorTexto(texto)`; `:150-153`
`clicar(el)`; `:142` `esperarEfeitos()`. Em `RequisicoesList.test.js`, `chamadasDeAnexos()` e
`blocoDeAnexos()` estão em `:500-501`; **acrescente** ali
`const cargasDoDetalhe = () => api.get.mock.calls.filter(([u]) => u === '/almoxarifado/requisicoes/55');`.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `client/src/components/almoxarifado/RequisicoesList.test.js` **(modificar)** | a régua vermelha da RN-01 + a da RN-02 + o cenário de integração da RN-03; reescrever o comentário de `:540-548` (linhas erradas e fato vencido) | 1, 2, 6 |
| `client/src/components/almoxarifado/RequisicoesList.js` **(modificar)** | `navInternaRef`; `syncSearchParams` devolvendo a query escrita (`:146-152`); arme em `:246`; consumo no topo do efeito (`:167`) | 2 |
| `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js` **(modificar)** | estado `erro` + `erroMateriais` + ramo de erro no ternário de `:445`; `selectedId` + `idCarregadoRef` + `detalheFetchSeqRef` em `abrirDetalhe` (`:111-143`); comentário de `:600` reescrito | 3, 4 |
| `client/src/components/almoxarifado/RecebimentosAlmoxarifado.test.js` **(modificar)** | cenários (h) a (l); corrigir o off-by-one do cabeçalho (`:78-81`) | 3, 4 |
| `client/src/components/almoxarifado/Almoxarifado.css` **(modificar)** | `flex-wrap: wrap` em `.almox-actions` (`:305-309`) | 5 |
| `client/src/components/almoxarifado/almoxActionsCss.test.js` **(criar)** | congela as cinco premissas da medição e **diz o que não prova** | 5 |
| `specs/modulo-almoxarifado/04-requisicoes/README.md`, `.../08-recebimento/README.md`, `specs/modulo-almoxarifado/README.md`, `docs/almoxarifado-guia-etapas-e-testes.md`, `docs/almoxarifado-novidades-por-etapa.md`, este plano **(modificar)** | fechamento | 7 |

## Sort topológico

| Task | Tipo | Depende de | Por quê |
|---|---|---|---|
| 1 — a régua vermelha da RN-01 | **tronco** | — | é o único jeito de saber que a T2 conserta algo; sem o vermelho medido, a T2 não tem prova |
| 2 — o conserto de (a) | galho **A** | 1 | só `RequisicoesList.js`/`.test.js`; regra local, nenhum contrato compartilhado |
| 3 — erro visível em Recebimentos | galho **B** | — | só `RecebimentosAlmoxarifado.js`/`.test.js` |
| 4 — painel que não mente + fetchSeq | galho **B** | 3 | **mesmo arquivo** da T3 → mesma árvore, sequencial dentro do galho |
| 5 — o clipe da coluna de ações | galho **C** | — | só CSS + um teste novo; não toca JS de tela nenhuma |
| 6 — integração que cruza os gestos | sequencial | 2, 4 | conta as cargas em três gestos seguidos e roda a suíte inteira + `build` |
| 7 — fechamento e correção das specs | sequencial | 6 | specs, guia, mapa, plano, letra B |

### Divergência declarada da skill: os galhos vão SEQUENCIAIS, não em worktrees

A `desenvolver-etapa-almoxarifado` manda rodar galhos paralelos em worktrees isoladas. **Aqui não
dá, e o motivo foi medido na Etapa 34 e continua valendo:** `node_modules/`,
`client/node_modules/` e `server/node_modules/` estão no `.gitignore` (`.gitignore:2-4`), então uma
worktree nova **não tem `react-scripts`** e não roda `CI=true npx react-scripts test`. Isolar
exigiria um `npm install` por worktree.

Os galhos A, B e C tocam arquivos disjuntos, mas as três tasks são pequenas e o risco de
paralelizá-las **na mesma árvore** (dois `git add` concorrentes, duas execuções do jest sobre o
mesmo cache do CRA) é o modo de falha que a Etapa 25 já pagou. **Sequencial, um executor por
task** — e é também o que a Etapa 34 mediu: 0 galhos em paralelo, 0 retrabalho por paralelismo.

> **(Fase 2) A ordem de execução é literalmente 1 → 2 → 3 → 4 → 5 → 6 → 7**, e a coluna
> "Depende de" acima descreve **acoplamento de arquivo**, não permissão para antecipar. Importa
> porque a **T1 deixa a árvore VERMELHA de propósito e não commita**: qualquer task que rode
> `CI=true npx react-scripts test --watchAll=false` inteiro antes de a T2 fechar vai ver esse
> vermelho e concluir errado. A T5, Step 4, é a única que roda a suíte inteira antes da T6 — e por
> isso só pode rodar **depois** da T4.

---

### Task 1: a régua vermelha — ver os DOIS GETs com os próprios olhos **(tronco)**

**Files:**
- Modify: `client/src/components/almoxarifado/RequisicoesList.test.js:499-553`

**Interfaces:** nenhuma. Esta task **não** toca produto e **não** commita — o arquivo de teste vai
no commit da T2 (decisão 7 do design: um commit com a suíte vermelha faria o histórico mentir).

**Por que ela existe sozinha.** O fato "2 GETs por clique" está registrado em três lugares
(`RequisicoesList.test.js:540-543`, `04-requisicoes/README.md:81-85`, o plano da 34) e **provado
por traçado de código**, nunca por execução. A medição da Fase 0 foi explícita: *"a prova executada
é a T1 — e é obrigatória antes da T2"*. Se a asserção nova nascer verde, o conserto da T2 seria
escrito contra um defeito que o cenário não alcança.

**(Fase 2) Confirmado por releitura do mock, ponto a ponto** — a régua vermelha realmente fica
vermelha, e em 2:
- o mock aceita **as duas** URLs no MESMO ramo (`RequisicoesList.test.js:89`,
  `url === '/almoxarifado/requisicoes/55' || url === '/requisicoes-material/55'`), mas o `beforeEach`
  fixa `mockWarehouseMode = true` (`:82`) e `apiPrefix` (`RequisicoesList.js:82`) vira
  `/almoxarifado/requisicoes` — então o componente só emite a URL do almoxarifado e o helper, que
  filtra por **igualdade**, conta exatamente ela. O único cenário com `/requisicoes-material/55` é o
  F1 (`:560-577`), e ele **não** usa o helper novo;
- a chamada é `api.get('/almoxarifado/requisicoes/55', { params: { _t }, headers: {…} })`
  (`RequisicoesList.js:239-242`): o 1º argumento é a URL crua, então o `filter(([u]) => u === …)`
  casa apesar do 2º argumento;
- o traçado do clique em `renderizarSemDetalhe()` (URL sem query): `buildSearchParams(55)` devolve
  `{ id: '55' }` (`filtroMinha` nasce `false` porque `searchParams.get('minha') !== '1'`,
  `RequisicoesList.js:97-99`), `next = 'id=55'` ≠ `''` → **escreve** → efeito `:167` reacende →
  GET #2. **2, não 1 e não 3.**

- [ ] **Step 1: acrescentar o helper e a asserção**

Em `RequisicoesList.test.js`, junto de `chamadasDeAnexos` e `blocoDeAnexos` (`:500-501`):

```js
// A carga do DETALHE, que nenhum cenário contava até a Etapa 35 — e era onde estava o defeito:
// o clique disparava DUAS (clique → `syncSearchParams` reescreve `?id=` → efeito de deep-link →
// `abrirDetalhe` de novo). Medido vermelho em 2 antes do conserto, na T1 da Etapa 35.
const cargasDoDetalhe = () => api.get.mock.calls.filter(([u]) => u === '/almoxarifado/requisicoes/55');
```

No fim do cenário do clique (`:528-553`), **depois** da asserção de anexos:

```js
  // RN-01 da Etapa 35: um clique, UMA carga do detalhe.
  expect(cargasDoDetalhe()).toHaveLength(1);
```

E no cenário de deep-link (`:503-513` — **(Fase 2)** o plano dizia `:503-518`, que invade o cenário
seguinte; o `test(` do deep-link abre em `:503` e fecha em `:513`), a régua da RN-02 — que já é verde hoje e **tem de continuar**
(é o que impede "consertar" a RN-01 matando o deep-link):

```js
  // RN-02: deep-link puro carrega UMA vez — verde antes e depois do conserto.
  expect(cargasDoDetalhe()).toHaveLength(1);
```

- [ ] **Step 2: rodar e LER o número**

```
cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/RequisicoesList.test.js
```

Esperado: **um** cenário vermelho — o do clique —, com `Expected length: 1 / Received length: 2`. O
cenário de deep-link tem de ficar **verde** no mesmo rodada.

- [ ] **Step 3: registrar o vermelho neste plano**, colando a linha real do `Received`. Se vier
      `Received length: 1`, **pare**: o cenário não está passando pelo caminho do clique (confira
      que ele usa `renderizarSemDetalhe()` e `container.querySelector('tbody tr').click()`), e a
      T2 não pode começar. Se vier 3 ou mais, também pare e reporte — o traçado da medição prevê
      exatamente 2.
- [ ] **Step 4: NÃO commitar.** Deixe a árvore com a asserção nova e siga para a T2.

---

### Task 2: o conserto de (a) — flag de navegação interna por identidade de query **(galho A)**

**Files:**
- Modify: `client/src/components/almoxarifado/RequisicoesList.js:106-107, :146-152, :167-181, :245-247`
- Modify: `client/src/components/almoxarifado/RequisicoesList.test.js:540-548` (o comentário)

**Interfaces:** nada sai do arquivo. `abrirDetalhe` mantém a assinatura
`(id, { fromUrl = false, force = true })` e os **17** call sites (`:179, :266, :274, :298, :303,
:333, :381, :418, :459, :611, :626, :642, :657, :676, :692, :812, :866`) continuam passando
`{ force: true }` — **nenhum muda**. (A medição diz "18"; a contagem executada é **17**: a definição
`:227` é `abrirDetalhe = useCallback(`, que não casa `abrirDetalhe(`. Off-by-one corrigido.)

**Restrições medidas, cada uma com o teste que cai se violada:**

| Não faça | Por quê | Cai em |
|---|---|---|
| guarda de "mesmo id" no efeito (`:176-179`) | mata o refetch por troca de filtro | `RequisicoesList.test.js:612-613` (`toBeGreaterThan(1)`) |
| `force: false` no clique (`:812`) | o `force` serve ao refetch pós-ação (origem `1339601`), é regra compartilhada dos 17 call sites | suíte de separação/entrega/assinatura, `:244-490` |
| gravar `loadedDetalheIdRef.current = id` antes do `await` | o ramo `if (!urlId)` (`:169-175`) passa a **fechar o painel** em navegação que limpa a URL | nenhum cenário cobre — é por isso que está proibido por escrito |
| mexer em `:99-102` ou na ordem `:167` → `:183` | é o inicializador que impede o mount de apagar o `?id=` | `:503-526` (deep-link) |

- [ ] **Step 1: implementar** — três edições cirúrgicas.

Junto de `loadedDetalheIdRef` (`:106`) e `detalheFetchSeqRef` (`:107`):

```js
  // Etapa 35 (RN-01): a query que ESTA tela acabou de escrever na URL, aguardando o efeito de
  // deep-link consumi-la. Existe porque `abrirDetalhe` chama `syncSearchParams`, que reescreve
  // `?id=`, e isso reacende o efeito de `:167` — que chamava `abrirDetalhe` de novo: DOIS
  // `GET /almoxarifado/requisicoes/:id` por clique, desde que o deep-link existe.
  //
  // Guarda a STRING, e não um booleano, por um motivo medido: `syncSearchParams` só escreve
  // quando a query muda (`:149`), então um booleano armado incondicionalmente (clique na linha já
  // aberta, refetch por foco da janela) FICARIA armado e engoliria o próximo deep-link legítimo
  // (back/forward). Com a string, a flag só é consumida pela query que ela mesma escreveu.
  const navInternaRef = useRef(null);
```

`syncSearchParams` (`:146-152`) passa a **dizer o que escreveu** — quem arma é o chamador, nunca ela
(o efeito de filtros de `:183-186` e `fecharDetalhe` de `:290` também a chamam, e esses **não**
podem armar nada):

```js
  const syncSearchParams = useCallback((id) => {
    const params = buildSearchParams(id);
    const next = new URLSearchParams(params).toString();
    if (next !== searchParams.toString()) {
      setSearchParams(params, { replace: true });
      return next;     // escreveu: devolve a query escrita, para quem quiser marcar navegacao interna
    }
    return null;       // nao escreveu — nada a consumir, e nada a armar
  }, [buildSearchParams, searchParams, setSearchParams]);
```

No ramo de sucesso de `abrirDetalhe` (`:245-247`):

```js
      aplicarDetalhe(res.data, id);
      if (!fromUrl) {
        // Marca a navegação como INTERNA só quando a URL realmente mudou: o efeito de `:167` vai
        // reacender por causa DESTA escrita, e não há segundo detalhe para buscar.
        const escrita = syncSearchParams(id);
        if (escrita !== null) navInternaRef.current = escrita;
      }
      return res.data;
```

E no topo do efeito de deep-link (`:167`), **antes de qualquer ramo**:

```js
  useEffect(() => {
    // Consumo da flag: se a query atual é EXATAMENTE a que esta tela acabou de escrever, o detalhe
    // já foi carregado pelo clique e um segundo GET é desperdício puro. Este é o ÚNICO ponto de
    // desarme — e ele só desarma quando CASA. Uma flag que não casa SOBREVIVE ao ciclo do efeito
    // (medido na Fase 2 da Etapa 35), e é exatamente por isso que armar sem ter escrito é um
    // defeito de verdade e não um detalhe: a flag velha fica esperando a query voltar a ser aquela
    // (trocar o filtro e destrocar) para engolir um refetch legítimo. Quem garante que isso não
    // acontece é o `if (escrita !== null)` do `abrirDetalhe`, não este bloco.
    if (navInternaRef.current !== null && navInternaRef.current === searchParams.toString()) {
      navInternaRef.current = null;
      return;
    }
    const urlId = searchParams.get('id');
    // … resto igual a hoje …
```

- [ ] **Step 2: reescrever o comentário de `RequisicoesList.test.js:540-548`**, que está duplamente
      vencido: ele aponta `RequisicoesList.js:232-234` para o `setDetalhe(null)` condicional (hoje
      `:234-236`) e narra o fato dos 2 GETs como se ele fosse permanente. O novo texto diz o que
      passou a valer (uma carga por clique, RN-01), **o que estava errado** (a linha) e o que a
      contagem de anexos continua guardando.
- [ ] **Step 3: rodar o arquivo inteiro e ver passar**

```
cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/RequisicoesList.test.js
```

Tem de ficar verde **tudo**, com atenção nominal a quatro cenários que são os guardas do conserto:
`:503-526` (deep-link, `toHaveLength(1)` de anexos **e** de detalhe), `:528-553` (o clique, agora 1),
`:583-600` (foco da janela, `toBe(cargasAntes + 1)`), `:602-614` (troca de filtro,
`toBeGreaterThan(1)`).

- [ ] **Step 4: CONTROLE POSITIVO — três sabotagens, e leia QUAL asserção cai**

| # | Sabotagem (`perl -0pi -e`, com `grep -cF` da âncora dando 1) | O que TEM de cair |
|---|---|---|
| 1 | apagar a linha `if (escrita !== null) navInternaRef.current = escrita;` | **só** o cenário do clique (`:528`), pela asserção `expect(cargasDoDetalhe()).toHaveLength(1)` → `Received 2`. É o controle que prova que o conserto é o que faz o número cair. Os outros três cenários guardas ficam verdes. |
| 2 | trocar o par "identidade + arma-se-escreveu" pela versão frouxa: consumo `if (navInternaRef.current) { navInternaRef.current = null; return; }` **e** arme incondicional (`navInternaRef.current = new URLSearchParams(buildSearchParams(id)).toString();` sem checar o retorno) | o cenário de **integração da T6**, no terceiro passo (`expect(cargas()).toBe(3)` → `Received 2`): o refetch por foco não escreve, deixa o booleano armado, e a troca de filtro seguinte é **engolida**. É o controle positivo do R2 da medição — e a razão de o desenho não usar booleano. |
| 3 | fazer `syncSearchParams` devolver `next` **sempre** (mesmo quando não escreve), mantendo a comparação por identidade | ⚠️ **(Fase 2) A previsão original ("NADA cai, o defeito é inalcançável") estava ERRADA, e a revisão do plano pegou.** O defeito É alcançável, e o cenário de integração da T6 o pega **no Passo 4** (`expect(cargasDoDetalhe()).toHaveLength(4)` → `Received 3`). Traçado: o consumo só zera a flag **dentro** do ramo que casa, então uma flag armada sem escrita **sobrevive indefinidamente**; o foco da janela (Passo 2) não escreve e passa a armar `'id=55'`; a troca de filtro (Passo 3) escreve `'minha=1&id=55'`, **não** casa e **não** desarma; e a VOLTA do filtro (Passo 4) escreve exatamente `'id=55'` — que casa a flag velha e **engole** um refetch legítimo. Era por isso que a sequência "clique → filtro → foco" não pegava nada: **o gesto que não escreve tem de vir ANTES do par de trocas de filtro que volta à mesma query.** É o controle positivo da decisão 2 do design (desarme só no consumo), e o motivo de o Passo 4 existir. |

Regras do harness: `grep -cF` da âncora = 1, `md5sum` antes / depois / depois de restaurar,
`git diff --stat` vazio no fim. **Se a sabotagem 1 não derrubar o cenário do clique**, o cenário
está medindo outra coisa — conserte o cenário, não troque a sabotagem.

- [ ] **Step 5: commit** (leva a T1 junto)

```bash
git add client/src/components/almoxarifado/RequisicoesList.js \
        client/src/components/almoxarifado/RequisicoesList.test.js
```

Mensagem, em português e sem acento no corpo: o bug (dois GET do detalhe por clique desde que o
deep-link existe, furo **C45**), a consequencia (latencia dobrada e o piscar de "Carregando" em
toda abertura pela lista), o que foi decidido (flag de navegacao interna por identidade de query,
armada so quando `syncSearchParams` escreve) e o que foi descartado (guarda de mesmo id no efeito,
que mataria o refetch por troca de filtro; e `force: false` no clique, que e regra compartilhada de
17 call sites).

---

### Task 3: erro de carga que o operador VÊ **(galho B)**

**Files:**
- Modify: `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js:47-56, :71-109, :445-453, :678-683`
- Modify: `client/src/components/almoxarifado/RecebimentosAlmoxarifado.test.js`

**Interfaces:** nenhuma para fora. Reusa `loadRecebimentos` (`:71`) e `loadMateriais` (`:93`) como
`onClick` dos "Tentar de novo" — o botão de refresh do cabeçalho (`:409`) já faz isso, não é
superfície nova.

**Molde medido (`HistoricoInspecoes.js` pós-Etapa 29):** `:56` o estado, `:63` o `setErro(null)` na
entrada, `:69-74` o `catch` (mensagem do servidor → toast → lista vazia → `setErro`), `:106-116` o
ramo de erro **antes** do ramo de lista vazia, com `.almox-table-container` + `.almox-empty` e
**nenhuma classe nova** (não existe `.almox-error` no CSS do módulo).

- [ ] **Step 1: escrever os três cenários e ver falhar**

```js
/* ── (h) RN-04: rede caida NAO pode virar "Nenhum recebimento registrado" ────────────────────
 * O `catch` de `:80-82` so dispara um toast — e o toast e MOCKADO aqui (`:42-44`), some em
 * segundos no navegador e nao deixa rastro no DOM. Com `recebimentos` em `[]` (`:47`), a tela
 * renderiza a frase de `:448` e o operador conclui que nao ha recebimento nenhum.
 * O fallback do mock NAO serve para este cenario: `/almoxarifado/recebimentos` esta mapeada em
 * `:120` e RESOLVE. Tem de sobrescrever (molde `HistoricoInspecoes.test.js:211-216`).
 */
test('(h) a lista que NAO carregou mostra erro, nunca "Nenhum recebimento registrado"', async () => {
  const original = api.get.getMockImplementation();
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos') {
      return Promise.reject({ response: { data: { error: 'Sem acesso ao módulo' } } });
    }
    return original(url);
  });
  await renderizar();

  // Metade POSITIVA: a tela montou (senao este cenario passaria com a tela vazia).
  expect(container.textContent).toContain('Recebimentos NF');
  // O que TEM de estar la:
  expect(container.textContent).toContain('Não foi possível carregar os recebimentos.');
  expect(container.textContent).toContain('Sem acesso ao módulo');
  expect(container.textContent).toContain('Tentar de novo');
  // E o que NAO pode estar — a frase que faz o operador concluir que a lista esta vazia:
  expect(container.textContent).not.toContain('Nenhum recebimento registrado');

  // (Fase 2) O botao tem de FUNCIONAR, nao so existir: sem isto, um <button> sem `onClick` passa
  // verde e a metade util do estado de erro fica sem prova. Molde: `HistoricoInspecoes.test.js:227-242`
  // (o cenario (8) de la), que a medicao da Fase 0 pediu e o plano tinha deixado cair.
  api.get.mockImplementation(original);
  await clicar(botaoPorTexto('Tentar de novo'));
  expect(linhas()).toHaveLength(RECEBIMENTOS.length);
  expect(container.textContent).not.toContain('Não foi possível carregar os recebimentos.');
});

/* ── (i) RN-05: a lista OBSOLETA e o segundo caso, e o plano da 34 nao o nomeava ───────────────
 * O `catch` nao zera `recebimentos`: um refresh que falha (botao `:409`, ou troca de filtro pela
 * dep de `:85`) deixava as linhas antigas na tela sem nenhuma marca de que os dados sao velhos —
 * pior que a lista vazia, porque parece fresco.
 */
test('(i) refresh que falha nao deixa a lista velha na tela', async () => {
  await renderizar();
  expect(linhas()).toHaveLength(RECEBIMENTOS.length);      // metade positiva: carregou mesmo

  const original = api.get.getMockImplementation();
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos') {
      return Promise.reject({ response: { data: { error: 'Timeout do servidor' } } });
    }
    return original(url);
  });
  // O botao de refresh do cabecalho (`:409`) e so um icone, sem texto nem nome acessivel — o
  // Step 1b abaixo lhe da `title="Atualizar lista"` no produto, que e o que torna este seletor
  // possivel (e o botao, anunciavel por leitor de tela).
  await clicar(container.querySelector('[title="Atualizar lista"]'));
  expect(container.textContent).toContain('Não foi possível carregar os recebimentos.');
  expect(container.textContent).toContain('Timeout do servidor');
  expect(linhas()).toHaveLength(0);
});

/* ── (j) RN-06: o `catch` silencioso de `loadMateriais` (`:97`) ────────────────────────────────
 * Ele alimenta a busca de material do modal "Novo Recebimento". Falhando em silencio, o operador
 * digita o nome de um material que EXISTE e conclui que nao esta cadastrado. E a falha de um
 * carregamento nao pode contaminar o outro: a lista continua resolvendo neste cenario.
 */
test('(j) falha ao carregar materiais aparece DENTRO do modal de novo recebimento', async () => {
  const original = api.get.getMockImplementation();
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais') return Promise.reject(new Error('rede'));
    return original(url);
  });
  await renderizar();
  // Metade positiva dupla: a lista carregou e NAO esta em estado de erro.
  expect(linhas()).toHaveLength(RECEBIMENTOS.length);
  expect(container.textContent).not.toContain('Não foi possível carregar os recebimentos.');

  await clicar(botaoPorTexto('Novo Recebimento'));
  expect(container.querySelector('input.almox-search-input')).not.toBeNull();   // o modal montou
  expect(container.textContent).toContain('Não foi possível carregar a lista de materiais.');
});
```

- [ ] **Step 1b: resolver o seletor do botão de refresh antes de rodar o (i).** O botão de `:409`
      **não tem texto** — é só `<FiRefreshCw size={13} />` dentro de `btn-almox-secondary`, então
      `botaoPorTexto` não o acha (é o `TODO` marcado com ⚠ no trecho acima). Duas saídas, escolha a
      primeira que funcionar e **diga qual usou**: (1) dar `title="Atualizar lista"` ao botão no
      produto — é uma melhoria de acessibilidade legítima, o mesmo padrão do botão de refresh do
      detalhe de requisições (`RequisicoesList.js:863`, `title="Atualizar detalhe e saldos"`) — e
      selecionar por `container.querySelector('[title="Atualizar lista"]')`; ou (2) selecionar pelo
      índice dentro do `AlmoxPageHeader` (`actions` tem dois botões, o refresh é o primeiro).
      **Prefira (1)**: o seletor fica legível e o botão passa a ter nome acessível, que hoje não
      tem. **(Fase 2) Este Step é uma edição de PRODUTO e tem de acontecer ANTES do Step 2** — sem
      o `title`, `container.querySelector('[title="Atualizar lista"]')` devolve `null` e
      `clicar(null)` estoura `Cannot read properties of null (reading 'dispatchEvent')`: o (i) ficaria
      vermelho **pelo motivo errado** e a rodada TDD não provaria nada. O precedente citado é
      `RequisicoesList.js:864` (não `:863` — **(Fase 2)** off-by-one), `title="Atualizar detalhe e
      saldos"`.
- [ ] **Step 2: rodar e ver falhar** — os três cenários vermelhos, cada um pela frase que ainda não
      existe no DOM (e o (h) também pelo `not.toContain`, que hoje encontra a frase).

```
cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/RecebimentosAlmoxarifado.test.js
```

- [ ] **Step 3: implementar**

Estados novos, junto de `loading` (`:51`):

```js
  // Etapa 35 (RN-04/RN-05): falha de carga NAO pode virar estado vazio. "Nenhum recebimento
  // registrado" (`:448`) e indistinguivel de "nao ha recebimento", e o toast (`:81`) some em
  // segundos — no teste ele e mockado, no navegador o operador ja saiu da tela. Mesma regua que a
  // Etapa 29 aplicou em `HistoricoInspecoes.js:56`, achado da revisao adversarial de la.
  const [erro, setErro] = useState(null);
  // (RN-06) A lista de materiais alimenta a busca do modal de novo recebimento: falhando em
  // silencio (`:97`, `catch { /* ignore */ }`), o operador digita um material que existe e conclui
  // que nao esta cadastrado.
  const [erroMateriais, setErroMateriais] = useState(null);
```

`loadRecebimentos` (`:71-85`) e `loadMateriais` (`:93-98`), no molde de `HistoricoInspecoes.js:63-74`:

```js
  const loadRecebimentos = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      /* … params iguais … */
      setRecebimentos(res.data || []);
    } catch (err) {
      const msg = err.response?.data?.error || 'Erro ao carregar recebimentos';
      toast.error(msg);
      setRecebimentos([]);
      setErro(msg);
    } finally {
      setLoading(false);
    }
  }, [filtroStatus, filtroEtapa]);
```

```js
  const loadMateriais = async () => {
    setErroMateriais(null);
    try {
      const res = await api.get('/almoxarifado/materiais');
      setMateriais(res.data || []);
    } catch (err) {
      setErroMateriais(err.response?.data?.error || 'Erro ao carregar materiais');
    }
  };
```

E `loadAuxiliares` (`:100-109`) **não** ganha estado — ganha o motivo escrito, que é o que o
`/* ignore */` não diz:

```js
    } catch {
      // Tolerado de propósito (Etapa 35, decisão 5): pedidos de compra e fornecedores alimentam
      // dois `<select>` OPCIONAIS (`:635-641` e `:651-657`), e os dois têm entrada manual ao lado
      // — o recebimento pode ser registrado inteiro sem eles. Um terceiro estado de erro aqui
      // pagaria o custo de uma superfície nova para uma falha que não bloqueia ninguém. O que era
      // errado era o `/* ignore */` sem explicação, que fazia parecer esquecimento.
    }
```

No ternário de `:445`, o ramo de erro **entre** `loading` e `recebimentos.length === 0` — a ordem
**é** a regra (com o ramo depois, a rede caída volta a mostrar "Nenhum recebimento registrado"):

```jsx
          {loading ? <SkeletonTable rows={8} columns={6} /> : erro ? (
            <div className="almox-empty">
              <p>Não foi possível carregar os recebimentos.</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{erro}</p>
              <button type="button" className="btn-almox-secondary" onClick={loadRecebimentos}>
                Tentar de novo
              </button>
            </div>
          ) : recebimentos.length === 0 ? (
```

E dentro do modal, acima da busca (depois do `<label>Materiais recebidos</label>` de `:678`, antes do `.almox-search-wrapper` de `:679-683`):

```jsx
                    {erroMateriais && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--gmp-error)', margin: '0 0 8px' }}>
                        Não foi possível carregar a lista de materiais.{' '}
                        <button type="button" className="almox-link-btn" onClick={loadMateriais}>
                          Tentar de novo
                        </button>
                      </p>
                    )}
```

- [ ] **Step 4: rodar e ver passar** — o arquivo inteiro, com atenção ao **(a)** (`:177`), que
      afirma `not.toContain('Nenhum recebimento registrado')` e conta linhas: ele prova que o
      caminho feliz não virou estado de erro.
- [ ] **Step 5: CONTROLE POSITIVO — três sabotagens**

| # | Sabotagem | O que TEM de cair |
|---|---|---|
| 1 | apagar `setErro(msg)` do `catch` (deixando o `toast.error`) | **(h)** pela **primeira** asserção que encontra o DOM sem a frase: `toContain('Não foi possível carregar os recebimentos.')`. **(Fase 2)** o plano dizia "as duas, e é isso que prova…" — **errado sobre o harness**: o `expect` do Jest lança na primeira falha, então `not.toContain('Nenhum recebimento registrado')` **não chega a rodar**. Quem prova que o conserto é o DOM e não o toast é o par de asserções existir no mesmo cenário, não as duas caírem juntas. **(i)** também cai. |
| 2 | **sabotagem de POSIÇÃO:** mover o ramo `erro ?` para **depois** de `recebimentos.length === 0 ?` | **(h)** cai pela frase de erro ausente. ⚠️ **(Fase 2) a previsão para o (i) estava ERRADA:** o plano dizia "(i) cai por `linhas()` — com a lista velha em memória, a tabela volta a renderizar", mas a própria implementação desta task põe `setRecebimentos([])` no `catch`, então a lista **não** é velha, é **vazia** — o (i) cai por `toContain('Não foi possível carregar os recebimentos.')`, três linhas **antes** de `linhas()`. É o achado nº 34 ("cair pela asserção errada deixa a que interessa sem prova"): sozinha, esta sabotagem **não exercita** `linhas()`. |
| **2b** | **(Fase 2, NOVA — é a que faz `linhas()` valer:)** sabotagem de posição **combinada** com apagar `setRecebimentos([])` do `catch` | **(i)** por `expect(linhas()).toHaveLength(0)` → `Received 3`: só com as duas juntas a lista velha sobrevive **e** chega a renderizar, que é literalmente o defeito que a RN-05 nomeia ("a lista obsoleta passando por fresca"). Sem esta combinação, a régua de `linhas()` do (i) nunca é exercida por controle positivo nenhum. |
| 3 | apagar `setErroMateriais` do `catch` de `loadMateriais` | **(j)**, e **só** o (j) — os outros cenários seguem verdes (o risco de a sabotagem derrubar tudo por `TypeError` não existe aqui). |
| — | apagar `setRecebimentos([])` do `catch`, **sozinho** | **previsão: nada cai**, porque o ramo `erro ?` precede a tabela e a lista velha nunca chega a renderizar. **Mantenha** (é o molde de `HistoricoInspecoes.js:72` e a defesa em profundidade de RN-05) e **declare que a suíte não o protege sozinho** — caso (2) da regra da `fechar-etapa`. **(Fase 2)** o que a suíte protege é o PAR: a sabotagem 2b acima é a prova de que as duas linhas juntas são o conserto. |

- [ ] **Step 6: commit**

```bash
git add client/src/components/almoxarifado/RecebimentosAlmoxarifado.js \
        client/src/components/almoxarifado/RecebimentosAlmoxarifado.test.js
```

Corpo: o bug (fragilidade **G10** — tres `catch` de carga engolindo o erro; rede caida virava
"Nenhum recebimento registrado" e refresh falho deixava lista velha passando por fresca), a
consequencia (o operador conclui que nao ha recebimento, ou opera sobre dado velho), o decidido
(estado de erro no DOM no molde da Etapa 29, mais erro de materiais dentro do modal) e o descartado
(terceiro estado de erro para `loadAuxiliares`, que alimenta selects opcionais com entrada manual
ao lado).

---

### Task 4: o painel que não mente, e o último clique manda **(galho B)**

**Files:**
- Modify: `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js:53-56, :111-143, :443, :469, :485, :489-494, :496, :588-609`
- Modify: `client/src/components/almoxarifado/RecebimentosAlmoxarifado.test.js`

**Interfaces:** nenhuma para fora. O bloco de anexos continua
`<AnexosDocumento entidade="recebimento" entidadeId={detalhe.id} titulo="Anexos" />`, e continua
gatilhado por **`detalhe`** — mas ⚠️ **(Fase 2) isso deixa de ser automático nesta task**: hoje ele
herda o gate `{detalhe && …}` de `:485`, e esta task troca esse gate por `{selectedId && …}`. Ou o
bloco ganha **o seu próprio** `{detalhe && ( … )}` em `:607-609`, ou `detalhe.id` é desreferenciado
com `detalhe` nulo. É **por isso** que anular `detalhe` conserta o defeito: o bloco sai de cena com o
id antigo em vez de ficar oferecendo upload para o registro errado — mas só sai de cena se o gate
dele existir.

⚠️ **Leia a regra (iv) antes de escrever código — e leia a correção da Fase 2 que está lá.** A
frase original desta task (*"anular sem trocar o gate por `selectedId` e sem o `?.` no cabeçalho
lança `TypeError` no primeiro render"*) **estava ERRADA nos dois pedaços**: mantendo
`{detalhe && …}` não há `TypeError` nenhum (o painel só some), e o estouro não é "no primeiro
render", é **na troca de linha**, quando `detalhe` fica nulo com `selectedId` de pé. O que de fato
estoura, com o gate em `selectedId`, são **três** pontos: `:489-491` (cabeçalho), o corpo a partir
de `:501` — hoje protegido só pelo ternário `loadingDetalhe ?` de `:496` — e **`:608`**
(`entidadeId={detalhe.id}`), que o fix `c5d9e99` tirou de dentro daquele ternário. O molde completo
é `RequisicoesList.js`: `selectedId` (`:100-103`) setado sincronamente em `abrirDetalhe` (`:232`),
painel por `{selectedId &&` (`:852`), corpo por `loadingDetalhe || !detalhe` (`:876`) e cabeçalho
`detalhe?.numero || '...'` (`:856`).

- [ ] **Step 1: escrever os dois cenários e ver falhar** (molde do GET deferido: `:351-359`, cujo
      porquê está escrito em `:326-338` — sem segurar a resposta, o `act` coalesce o commit
      intermediário e a janela **nunca chega ao DOM**; foi assim que o (g) passou provando nada)

```js
/* ── (k) RN-07: trocar de linha nao pode mostrar o registro anterior sob o id novo ─────────────
 * `abrirDetalhe` nunca anulava `detalhe` (`:111-143`): so chamava `setLoadingDetalhe(true)` e
 * `setDetalhe(res.data)` no SUCESSO. Com o bloco de anexos FORA do ternario de `loadingDetalhe`
 * (fix `c5d9e99` da Etapa 34), clicar em B deixava o painel exibindo A inteiro — cabecalho, itens
 * e `AnexosDocumento` com o `entidade_id` de A — ate o GET de B chegar. Um arquivo escolhido
 * nessa janela era anexado a A.
 */
test('(k) trocar de linha nao mostra o recebimento anterior sob o id novo', async () => {
  await renderizar();
  await clicar(linhaDe('REC-2026-058'));
  const blocoDo58 = blocoAnexos();
  expect(blocoDo58).not.toBeNull();                       // metade positiva
  expect(chamadasAnexos()).toHaveLength(1);

  const original = api.get.getMockImplementation();
  let liberar41;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos/41') {
      return new Promise((resolve) => { liberar41 = () => resolve({ data: DETALHES[41] }); });
    }
    return original(url);
  });

  await clicar(linhaDe('REC-2026-041'));
  expect(liberar41).toBeInstanceOf(Function);             // ancora: o GET do 41 esta EM VOO

  // A janela que o usuario vive: o painel existe (nao pisca — `selectedId` o sustenta), mas nao
  // mostra mais o 58, e o bloco de anexos do 58 saiu de cena.
  expect(painel()).not.toBeNull();
  expect(painel().querySelector('.almox-loading')).not.toBeNull();
  expect(painel().textContent).not.toContain('REC-2026-058');
  expect(blocoAnexos()).toBeNull();
  expect(chamadasAnexos()).toHaveLength(1);               // e nenhuma consulta nova ainda

  // Metade positiva do outro lado: quando o 41 chega, o bloco volta com o id DELE.
  await act(async () => { liberar41(); });
  await esperarEfeitos();
  expect(painel().textContent).toContain('REC-2026-041');
  expect(blocoAnexos()).not.toBeNull();
  expect(chamadasAnexos().at(-1)[1].params).toEqual({ entidade: 'recebimento', entidade_id: 41 });
});

/* ── (l) RN-08: resposta fora de ordem ────────────────────────────────────────────────────────
 * Anular `detalhe` fecha a janela do painel mentiroso, mas NAO a corrida: sem contador de
 * sequencia, dois cliques rapidos deixam duas requisicoes em voo e a ULTIMA A RESPONDER vence.
 * Se o 58 (clicado primeiro) responder depois do 41, o painel termina no 58 com o usuario tendo
 * clicado no 41 — e o `AnexosDocumento` anexaria ao 58. Molde: `RequisicoesList.js:231/:243/:249/:257`.
 */
test('(l) resposta fora de ordem nao vence — o ULTIMO clique manda', async () => {
  await renderizar();
  const original = api.get.getMockImplementation();
  let liberar58;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos/58') {
      return new Promise((resolve) => { liberar58 = () => resolve({ data: DETALHES[58] }); });
    }
    return original(url);
  });

  await clicar(linhaDe('REC-2026-058'));     // fica em voo
  await clicar(linhaDe('REC-2026-041'));     // resolve normalmente
  expect(painel().textContent).toContain('REC-2026-041');    // metade positiva
  expect(liberar58).toBeInstanceOf(Function);

  await act(async () => { liberar58(); });   // a resposta ATRASADA do 58 chega por ultimo
  await esperarEfeitos();

  expect(painel().textContent).toContain('REC-2026-041');
  expect(painel().textContent).not.toContain('REC-2026-058');
  expect(painel().querySelector('.almox-loading')).toBeNull();   // o `finally` fora de ordem nao deixa o painel girando
  expect(chamadasAnexos().at(-1)[1].params).toEqual({ entidade: 'recebimento', entidade_id: 41 });
});
```

- [ ] **Step 2: rodar e ver falhar.** Previsão: **(k)** vermelho em
      `not.toContain('REC-2026-058')` (o painel segue mostrando o 58) e **(l)** vermelho em
      `toContain('REC-2026-041')` depois do `liberar58()` (o 58 atrasado venceu). Se **(k)** ficar
      verde de primeira, confira que o `liberar41` realmente segurou o GET — sem a suspensão a
      janela não existe no DOM e o cenário mede outra coisa.
- [ ] **Step 3: implementar** — `abrirDetalhe` no molde de `RequisicoesList.js`, mais os cinco
      pontos do `selectedId`

```js
  const [selectedId, setSelectedId] = useState(null);
  // Etapa 35 (RN-07/RN-08). `idCarregadoRef`: qual id esta REALMENTE no `detalhe` — e a guarda que
  // faz `setDetalhe(null)` acontecer so na TROCA de linha, nunca no refetch do mesmo id (que
  // desmontaria o bloco de anexos e jogaria fora o arquivo ja escolhido — o fix F2 da Etapa 34,
  // travado pelo cenario (g)). `detalheFetchSeqRef`: duas requisicoes em voo, e a ultima a
  // responder vencia. Molde: `RequisicoesList.js:106-107, :231, :243, :249, :257`.
  const idCarregadoRef = useRef(null);
  const detalheFetchSeqRef = useRef(0);

  const abrirDetalhe = async (id) => {
    const seq = ++detalheFetchSeqRef.current;
    setSelectedId(id);
    setLoadingDetalhe(true);
    if (idCarregadoRef.current !== id) setDetalhe(null);
    try {
      const res = await api.get(`/almoxarifado/recebimentos/${id}`);
      if (seq !== detalheFetchSeqRef.current) return;   // chegou atrasada: outro clique venceu
      setDetalhe(res.data);
      idCarregadoRef.current = id;
      setFiscalForm({ /* … igual a hoje … */ });
    } catch {
      if (seq !== detalheFetchSeqRef.current) return;
      toast.error('Erro ao carregar recebimento');
      setSelectedId(null);
      setDetalhe(null);
      idCarregadoRef.current = null;
    } finally {
      if (seq === detalheFetchSeqRef.current) setLoadingDetalhe(false);
    }
  };

  const fecharDetalhe = () => {
    ++detalheFetchSeqRef.current;   // descarta a resposta em voo: fechar e fechar
    setSelectedId(null);
    setDetalhe(null);
    idCarregadoRef.current = null;
  };
```

Os **sete** pontos de render — ⚠️ **(Fase 2) o plano listava CINCO e os dois que faltavam eram os
que derrubam a suíte inteira por `TypeError`** (regra iv), inclusive nos cenários (b), (c), (d),
(e), (f) e (g), que não têm nada a ver com esta task. Todos mecânicos; **nenhum** pode ficar de
fora:

| # | Linha de hoje | Passa a ser | Por que não dá para pular |
|---|---|---|---|
| 1 | `:443` `gridTemplateColumns: detalhe ? '1fr 420px' : '1fr'` | `selectedId ? '1fr 420px' : '1fr'` | o painel em carga precisa da coluna de 420px |
| 2 | `:469` `background: detalhe?.id === r.id ? …` | `background: selectedId === r.id ? …` | a linha clicada continua marcada enquanto carrega |
| 3 | `:485` `{detalhe && (` | `{selectedId && (` | é a troca que faz o painel não piscar — **e é a que torna 4, 5 e 6 obrigatórios** |
| 4 | `:489-491` `{detalhe.numero}` e a badge | `{detalhe?.numero \|\| '...'}` e `{detalhe && <span className={…}>…</span>}` | `detalhe.numero` com `detalhe` nulo é `TypeError` |
| **5** | **`:496` `{loadingDetalhe ? (…loading…) : (…corpo…)}`** | **`{loadingDetalhe \|\| !detalhe ? (…loading…) : (…corpo…)}`** | **(Fase 2)** o corpo desreferencia `detalhe.nota_fiscal` (`:501`), `detalhe.itens` (`:512`, `:519`) e `detalhe.status` (`:514`, `:528`). O design já mandava (`o corpo pelo par loadingDetalhe \|\| !detalhe`); **o plano tinha perdido** |
| **6** | **`:607-609`** `<div style={{padding:'0 20px 20px'}}><AnexosDocumento … entidadeId={detalhe.id} …/></div>` | **`{detalhe && (<div style={{padding:'0 20px 20px'}}><AnexosDocumento … entidadeId={detalhe.id} …/></div>)}`** | **(Fase 2) É O BLOQUEADOR.** O fix `c5d9e99` da Etapa 34 tirou este bloco do ternário de `loadingDetalhe` de propósito; com o gate de `:485` virando `selectedId`, ele fica **sem guarda nenhuma** e `detalhe.id` estoura no **primeiro clique de qualquer cenário**. E é ele que a RN-07 afirma como `expect(blocoAnexos()).toBeNull()` — ou seja, a guarda não é só defesa, é a régua |
| 7 | `:494` `onClick={() => setDetalhe(null)}` | `onClick={fecharDetalhe}` | fechar tem de zerar `selectedId`, `idCarregadoRef` e **bumpar a seq** |

**Por que o ponto 6 não quebra a RN-09 (cenário (g)):** o refetch do **mesmo** id não anula
`detalhe`, então o `{detalhe && …}` continua verdadeiro entre os dois commits e o React reconcilia o
mesmo elemento na mesma posição — `blocoAnexos()` continua sendo o **mesmo nó** (`toBe(antes)`).
Verificado por leitura de `:588-611` contra o cenário `:340-378`.

- [ ] **Step 4: reescrever o comentário de `:588-606`** (**(Fase 2)** o bloco de comentário vai de
      `:588` a `:606`; `:607-609` já é o JSX do bloco de anexos, que o ponto 6 da tabela acima
      envolve em `{detalhe && …}` — diga no comentário novo que a guarda agora é explícita e por
      quê). Ele diz hoje: *"o `id` não muda durante o
      refetch (`abrirDetalhe` nunca zera `detalhe`), então o bloco não remonta"* — e a partir desta
      task `abrirDetalhe` **zera**, quando o id muda. A justificativa do F2 continua valendo, mas
      **por outro motivo**: a guarda `idCarregadoRef.current !== id`. Diga o que mudou e por quê;
      deixar a frase velha é plantar a terceira geração de referência errada nesta base.
- [ ] **Step 5: rodar e ver passar** — o arquivo inteiro. Atenção nominal a **(e)** (`:268-282`, a
      troca de linha que afirma `.at(-1)`: continua verde, e agora com o painel honesto no meio) e
      a **(g)** (`:340-378`, identidade de nó no refetch do mesmo id: é a RN-09, e é o cenário que
      distingue "anular quando troca" de "anular sempre").
- [ ] **Step 6: CONTROLE POSITIVO — três sabotagens, e a nº 3 é a que interessa**

| # | Sabotagem | O que TEM de cair |
|---|---|---|
| 1 | apagar `if (idCarregadoRef.current !== id) setDetalhe(null);` | **(k)**, por `not.toContain('REC-2026-058')` e por `expect(blocoAnexos()).toBeNull()`. **(l)** segue verde — prova que os dois defeitos são independentes e que cada um tem sua régua. |
| 2 | apagar as duas linhas `if (seq !== detalheFetchSeqRef.current) return;` | **(l)**, por `toContain('REC-2026-041')` depois do `liberar58()`. **(k)** segue verde. |
| 3 | **sabotagem de CONDIÇÃO:** trocar a guarda por `setDetalhe(null)` **incondicional** | **(g)** (`:340`), por `expect(blocoAnexos()).toBe(antes)` — o refetch do mesmo id volta a desmontar o bloco e a perder o arquivo já escolhido. É o controle que prova que a régua ancora **onde** a guarda está, não que ela existe; e é a regressão que esta task mais facilmente causaria. |

`md5sum` antes / depois / depois de restaurar; `git diff --stat` vazio no fim.

**(Fase 2) As três sabotagens foram conferidas contra a ORDEM das asserções** (achado nº 34: cair
pela asserção errada não vale). Na 1, o (k) chega intacto até `not.toContain('REC-2026-058')`, que é
a terceira asserção depois do clique — `painel()` não é nulo e `.almox-loading` está lá nos dois
mundos, então nenhuma delas cai antes. Na 3, o (g) passa por `:370`
(`.almox-loading` presente) e cai em `:371`, `expect(blocoAnexos()).toBe(antes)` — que é a asserção
do achado F2. Nenhuma das três derruba a suíte por `TypeError`, **desde que os pontos 5 e 6 da
tabela de render tenham sido feitos**; sem eles, as três "caem" por crash e não provam nada.

- [ ] **Step 7: commit**

```bash
git add client/src/components/almoxarifado/RecebimentosAlmoxarifado.js \
        client/src/components/almoxarifado/RecebimentosAlmoxarifado.test.js
```

Corpo: o bug (o painel de recebimento mostrava o registro ANTERIOR sob o id novo enquanto o novo
carregava, e duas requisicoes em voo deixavam a ultima a responder vencer), a consequencia (um
arquivo escolhido nessa janela era anexado ao recebimento errado, sem erro nenhum na tela), o
decidido (anular `detalhe` so na troca de id + `selectedId` sincrono no molde de Requisicoes +
contador de sequencia) e o descartado (manter `{detalhe && …}` e aceitar o painel piscando, com duas
reflows do grid por clique e nenhum estado "carregando").

---

### Task 5: o clipe da coluna de ações — a aritmética decide **(galho C)**

**Files:**
- Modify: `client/src/components/almoxarifado/Almoxarifado.css:305-309`
- Create: `client/src/components/almoxarifado/almoxActionsCss.test.js`

**Interfaces:** `.almox-actions` é **global do módulo** — 11 telas, **17** ocorrências
(**(Fase 2)** a medição e o plano diziam **18**; a contagem executada agora,
`grep -rn "almox-actions" --include=*.js client/src | wc -l`, dá **17**, e a própria tabela da
medição soma 1+1+3+3+2+1+1+2+1+1+1 = 17. Off-by-one da medição, corrigido aqui: o número certo
importa porque é o que diz quantas telas o `wrap` muda). Nenhuma tela ganha classe nova.

**Não há navegador nesta sessão**, e a medição da Fase 0 previa que a task pudesse virar "documentar
o que medir e deixar para o F12". **Ela não vira, e o motivo é uma linha de CSS:**
`.btn-almox-secondary` tem `white-space: nowrap` (`Almoxarifado.css:368`) — a largura mínima dos 5
botões de texto de Ferramentas é **piso duro**, não estimativa. Em 769px a largura útil é
`769 − 48 = 721px` (`.almox-page` padding, `:7-9`) e a célula de ações **sozinha** pede
**≈683,5px** (textos a 6,5px/char + 5 × [padding 32 + borda 2 + ícone 13 + gap interno 7] + 4 ×
gap 6 + `td` padding 32). ⚠️ **(Fase 2) o plano e o design diziam "≈685px" e "sobram 36px";
o script da conta, rodado nesta revisão, devolve `683.5` e `38`** — o 685 vinha de arredondar cada
botão para cima antes de somar. A conclusão não muda em nada, mas o número tem de bater com a saída
que a Step 1 manda colar, senão a próxima sessão vai achar que o script está errado. Sobram
**38px** para as seis outras colunas de
`FerramentasAlmoxarifado.js:481-484`, cujo `td` padding já soma 192px antes de qualquer texto.
**Não cabe nem derrubando a estimativa de caractere pela metade** — e entre 769px e a largura em que
tudo couber não existe `overflow-x` em lugar nenhum (`:1030` só vale até 768px), então o
`overflow: hidden` de `:171` **corta**. O último botão ("Calibração") fica inalcançável, sem barra
de rolagem e sem sintoma.

Ou seja: a condição do R8 da medição ("se **nenhuma** tela clipa, não mudar e registrar") **não se
cumpre**. Uma tela clipa por aritmética.

- [ ] **Step 1: rodar a aritmética por script e guardar a saída** (é a medição, e ela vai para o
      design/guia; `perl`, não `python3` — ver Global Constraints)

```bash
# Le os numeros REAIS do CSS em vez de confiar na memoria do plano.
cd client/src/components/almoxarifado
grep -n -A 6 '^\.almox-actions {'      Almoxarifado.css   # display/gap/flex-wrap
grep -n -A 4 '^\.almox-btn-icon {'     Almoxarifado.css   # 32x32
grep -n -A 14 '^\.btn-almox-secondary {' Almoxarifado.css # padding/border/nowrap
grep -n -A 8 '^\.almox-table-container {' Almoxarifado.css
grep -n 'max-width: 768px' -A 8       Almoxarifado.css
perl -e 'my @t=(9,8,18,10,10); my $c=6.5; my $fix=32+2+13+7;
  my $cel=0; $cel += $_*$c + $fix for @t; $cel += 6*(scalar(@t)-1) + 32;
  printf("celula de acoes (Ferramentas, pior caso): %.1fpx\n", $cel);
  for my $v (769,820,900,1024,1100,1280,1400) {
    my $util = ($v > 1400 ? 1400 : $v) - 48;
    printf("viewport %4dpx -> util %4dpx -> sobra para 6 colunas: %.0fpx (padding sozinho pede 192px)\n",
      $v, $util, $util - $cel);
  }'
```

Cole a saída neste plano. **Se a sobra der positiva e maior que ~600px em algum viewport**, esse
viewport não clipa — e a faixa medida passa a ser só até ali.

**(Fase 2) A saída, já medida nesta revisão** (cole a sua e confirme que bate; se divergir, foi o
CSS que mudou e a conta inteira tem de ser refeita):

```
celula de acoes (Ferramentas, pior caso): 683.5px
viewport  769px -> util  721px -> sobra para 6 colunas:  38px
viewport  820px -> util  772px -> sobra para 6 colunas:  88px
viewport  900px -> util  852px -> sobra para 6 colunas: 168px
viewport 1024px -> util  976px -> sobra para 6 colunas: 292px
viewport 1100px -> util 1052px -> sobra para 6 colunas: 368px
viewport 1280px -> util 1232px -> sobra para 6 colunas: 548px
viewport 1400px -> util 1352px -> sobra para 6 colunas: 668px
```

E os números do CSS que a conta usa, confirmados linha a linha nesta revisão: `.almox-actions`
`:305-309` com `gap: 6px` em `:307` e **sem** `flex-wrap`; `.almox-btn-icon` `:311` com
`width: 32px` em `:312`; `.btn-almox-secondary` `:355-369` com `gap: 7px` (`:358`),
`padding: 9px 16px` (`:359`), `border: 1px` (`:362`) e `white-space: nowrap` em **`:368`**;
`.almox-table td` com `padding: 12px 16px` em `:194`; `.almox-table-container` `:167-173` com
`overflow: hidden` em `:171`; `@media (max-width: 768px)` em `:1025` e a linha que salva a tabela em
`:1030`. **Ferramentas tem mesmo 5 botões simultâneos** em `DISPONIVEL` + `exige_calibracao`
(`FerramentasAlmoxarifado.js:519, :529, :539, :553, :557`), todos `btn-almox-secondary` com ícone
`size={13}`, e a tabela tem 7 colunas (`:482-483`) — 6 além de "Ações".

- [ ] **Step 2: escrever o teste de drift e ver falhar**

```js
/**
 * Etapa 35 (RN-10) — as PREMISSAS da medição do clipe da coluna de ações.
 *
 * O QUE ESTE TESTE NAO PROVA, e precisa estar escrito aqui para a proxima sessao nao o tratar
 * como guarda do layout: ele NAO prova que nenhum botao e cortado. jsdom nao faz layout
 * (`offsetWidth` e sempre 0), e nao havia navegador na sessao que escreveu a Etapa 35. A prova
 * visual e o roteiro de F12 em `docs/almoxarifado-guia-etapas-e-testes.md`.
 *
 * O que ele PROVA: que os cinco numeros em que a medicao se apoiou continuam no CSS. Se alguem
 * trocar o `gap`, o tamanho do botao de icone, o `nowrap` do botao de texto ou o `overflow`, a
 * conta documentada deixa de valer — e este teste cai apontando para a medicao, em vez de a
 * documentacao envelhecer em silencio (foi o que aconteceu com tres referencias de linha que a
 * Etapa 35 teve de corrigir).
 */
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, 'Almoxarifado.css'), 'utf8');
// (Fase 2) `^` + flag 'm': sem a ancora de inicio de linha, `.btn-almox-secondary` tambem casa
// dentro de `.almox-mapa-page .btn-almox-secondary {` (`:1486`). Hoje a regra do modulo vem antes e
// o `match` acerta por sorte; com a ancora, acerta por construcao.
const bloco = (seletor) => {
  const m = css.match(new RegExp(`^\\${seletor}\\s*\\{([^}]*)\\}`, 'm'));
  return m ? m[1] : null;
};

test('guarda da guarda: o CSS do modulo foi mesmo lido', () => {
  // Sem isto, um caminho errado devolveria string vazia e TODAS as assercoes abaixo passariam
  // provando nada — a forma de teste vazio que esta base ja pagou cinco vezes.
  expect(css.length).toBeGreaterThan(20000);
  expect(bloco('.almox-actions')).not.toBeNull();
});

test('as premissas da medicao do clipe continuam valendo', () => {
  // 1. O conserto da Etapa 35: a coluna de acoes quebra linha em vez de ser cortada.
  expect(bloco('.almox-actions')).toMatch(/flex-wrap:\s*wrap/);
  // 2. O gap que entra na conta da largura minima.
  expect(bloco('.almox-actions')).toMatch(/gap:\s*6px/);
  // 3. Os 32px do botao de icone (Materiais: 10 deles = 320px + 9 gaps).
  expect(bloco('.almox-btn-icon')).toMatch(/width:\s*32px/);
  // 4. O PISO DURO que decidiu a etapa: botao de texto nao encolhe.
  expect(bloco('.btn-almox-secondary')).toMatch(/white-space:\s*nowrap/);
  // 5. O motivo de o corte ser invisivel — e que fica, porque existe pelo `border-radius`.
  expect(bloco('.almox-table-container')).toMatch(/overflow:\s*hidden/);
  // 6. Abaixo de 768px quem salva e a propria tabela; acima dela, ninguem salvava.
  expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.almox-table\s*\{[^}]*overflow-x:\s*auto/);
});
```

Rodar: `cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/almoxActionsCss.test.js`.
Esperado: **vermelho na asserção 1** (`flex-wrap: wrap` ainda não existe) e verde nas outras cinco —
que é a prova de que o teste sabe ler o arquivo antes de mandar mudar nada.

**(Fase 2) As seis asserções foram executadas contra o `Almoxarifado.css` real** (fora do Jest, com
`node` e o mesmo `bloco()`), e o resultado é exatamente esse: `css.length` = **39606** (folga
confortável sobre o `> 20000` da guarda-da-guarda), asserção 1 **false** hoje, asserções 2 a 6
**true**. Se ao rodar no Jest algo além da 1 vier vermelho, foi o CSS que mudou depois desta
revisão — não conserte o teste, refaça a medição.

- [ ] **Step 3: aplicar o conserto** — uma linha, com o porquê ao lado

```css
/* ── Ações de tabela ── */
.almox-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  /* Etapa 35: sem `flex-wrap`, a celula de acoes estourava a largura da tabela e o
     `overflow: hidden` de `.almox-table-container` (:171, que existe pelo `border-radius`)
     CORTAVA o excedente — sem barra de rolagem e sem sintoma. Acima de 768px nao ha
     `overflow-x` em lugar nenhum (a regra de :1030 so vale abaixo). Pior caso medido:
     Ferramentas com 5 botoes de TEXTO (`FerramentasAlmoxarifado.js:517-561`), que por serem
     `white-space: nowrap` (:368) tem piso duro de ~684px numa largura util de 721px em 769px —
     "Calibracao" ficava inalcancavel. Medicao e faixa em
     docs/superpowers/specs/2026-09-16-almoxarifado-etapa35-vizinhas-da-34-design.md. */
  flex-wrap: wrap;
}
```

- [ ] **Step 4: rodar o teste de drift e a suíte de client inteira** — o `wrap` muda a altura
      possível das linhas em 11 telas, então rode **tudo** (`cd client && CI=true npx react-scripts
      test --watchAll=false`) e o `build`. Nenhum cenário desta base afirma altura de linha, então
      a previsão é verde; se cair algo, é achado e vai para o relatório, não para um `snapshot`
      atualizado às pressas.
- [ ] **Step 5: CONTROLE POSITIVO — três sabotagens, uma por premissa que decide algo**

⚠️ **(Fase 2) As três sabotagens originais eram INAPLICÁVEIS pela própria regra do harness** — e o
plano não tinha percebido. Medido: `grep -cF 'flex-wrap: wrap'` = **6** (antes do conserto),
`'gap: 6px'` = **5**, `'white-space: nowrap'` = **9**. Com "âncora = 1" o executor abortaria as
três; ignorando a regra, um `perl -0pi -e 's/gap: 6px/gap: 8px/'` (sem `/g`) acertaria a **primeira**
ocorrência do arquivo, que está **noutra regra** — a "sabotagem aplicada na tabela errada" que a
`fechar-etapa` documenta, com a suíte verde e nenhuma prova. **A âncora é o seletor, ancorado em
início de linha, e o `perl` opera sobre o BLOCO:**

| # | Sabotagem (âncora contada antes; `md5sum` nos três momentos) | O que TEM de cair |
|---|---|---|
| 1 | `grep -cE '^\.almox-actions \{' Almoxarifado.css` → **1**; depois `perl -0pi -e 's/(^\.almox-actions \{[^}]*?)\n  flex-wrap: wrap;/$1/ms' Almoxarifado.css` (remove a linha **dentro do bloco**, deixando o comentário) | asserção 1 — é o controle de que o teste guarda o conserto, e não uma frase sobre ele |
| 2 | `grep -cE '^\.almox-actions \{'` → **1**; depois `perl -0pi -e 's/(^\.almox-actions \{[^}]*?gap: )6px/${1}8px/ms' Almoxarifado.css` | asserção 2. Sem ela, a conta documentada (683,5px) envelheceria em silêncio |
| 3 | `grep -cE '^\.btn-almox-secondary \{'` → **1** (⚠️ `grep -cF '.btn-almox-secondary {'` dá **2**, por causa de `:1486`); depois `perl -0pi -e 's/(^\.btn-almox-secondary \{[^}]*?)\n  white-space: nowrap;/$1/ms' Almoxarifado.css` | asserção 4 — a premissa que **decidiu** a etapa. Se ela cair e ninguém notar, a próxima sessão lê a medição como se ainda fosse piso duro |

Depois de cada `perl`, **confirme que o md5 MUDOU** (uma regex que não casou é o no-op silencioso
que esta regra existe para pegar) e, ao restaurar com `git checkout -- Almoxarifado.css`, que ele
voltou ao valor inicial. `git diff --stat` vazio no fim.

- [ ] **Step 6: commit**

```bash
git add client/src/components/almoxarifado/Almoxarifado.css \
        client/src/components/almoxarifado/almoxActionsCss.test.js
```

Corpo: o bug (a coluna de acoes nao quebrava linha e o contêiner com `overflow: hidden` cortava o
excedente entre 769px e ~1100-1355px; em Ferramentas o ultimo botao ficava inalcancavel), como foi
medido SEM navegador (o `white-space: nowrap` do botao de texto torna a largura minima um piso duro
calculavel), o decidido (`flex-wrap: wrap` global + teste que congela as premissas) e o descartado
(`overflow-x: auto` por classe modificadora, que esconde o botao atras de barra que o usuario nao
ve; e nao mudar nada, que mantem um defeito certo). Registrar tambem o risco residual: com `wrap`,
o `table-layout: auto` redistribui largura e linhas que hoje cabem podem passar a quebrar — efeito
cosmetico, verificacao visual no roteiro de F12.

---

### Task 6: integração — os três gestos em sequência, contando as cargas **(sequencial)**

**Files:**
- Modify: `client/src/components/almoxarifado/RequisicoesList.test.js`

**Por que este teste existe.** Os galhos desta etapa não cruzam dado — são três arquivos e três
regras. O que **cruza** é o tempo: a flag de navegação interna da T2 vive entre um gesto e o
seguinte, e os três gestos que a tocam (clique, foco da janela, troca de filtro) têm hoje um
cenário **cada um**, isolado, com o componente remontado no meio. Nenhum deles vê a flag
**sobrevivendo** de um gesto para o outro — que é exatamente o modo de falha do R2 da medição e o
que a sabotagem 2 da T2 explora. Este é o cenário que só existe em integração.

- [ ] **Step 1: escrever o cenário**

```js
/* ── Integração da Etapa 35: os três gestos em sequência, no MESMO componente montado ──────────
 * Os cenários de `:583-600` (foco) e `:602-614` (filtro) remontam a tela antes de medir, então
 * nenhum deles vê o estado que a flag de navegação interna deixa para o gesto seguinte. O defeito
 * que este cenário pega: uma flag booleana armada no refetch por foco (que NÃO escreve na URL,
 * `:149`) fica de pé e ENGOLE a troca de filtro seguinte — o detalhe deixa de recarregar e nada
 * mais nesta suíte reclama. Por isso a contagem é por PASSO, e não no fim.
 */
test('integração: clique, foco, troca de filtro e VOLTA do filtro — uma carga por gesto', async () => {
  detalheDoBanco = baseRequisicao('APROVADO');
  await renderizarSemDetalhe();

  // Passo 0 — metade positiva: a lista montou e nada foi buscado ainda.
  expect(container.textContent).toContain('REQ-055');
  expect(cargasDoDetalhe()).toHaveLength(0);

  // Passo 1 — o clique (RN-01): UMA carga, e não duas.
  await act(async () => { container.querySelector('tbody tr').click(); });
  expect(cargasDoDetalhe()).toHaveLength(1);
  expect(blocoDeAnexos()).not.toBeNull();

  // Passo 2 — o foco da janela (RN-03): o refetch pós-diálogo continua existindo. Ele NÃO muda a
  // URL, então `syncSearchParams` devolve `null` e a flag NÃO é armada.
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  expect(cargasDoDetalhe()).toHaveLength(2);

  // Passo 3 — a troca de filtro (RN-03): escreve `minha=1` na URL, o efeito de deep-link reacende
  // e o detalhe É recarregado. É aqui que uma flag BOOLEANA armada no passo 2 apareceria
  // (sabotagem 2 da T2: `Received 2`).
  const checkMinha = [...container.querySelectorAll('input[type="checkbox"]')][0];
  expect(checkMinha).toBeTruthy();
  await act(async () => { checkMinha.click(); });
  expect(cargasDoDetalhe()).toHaveLength(3);

  // Passo 4 (Fase 2) — a VOLTA do filtro, que devolve a URL a `id=55`: exatamente a query que o
  // passo 1 escreveu. É o único passo que pega a flag armada SEM escrita (sabotagem 3 da T2): uma
  // flag que não casa NÃO é desarmada, fica esperando a query voltar a ser aquela, e engole este
  // refetch (`Received 3`). Sem este passo, a sabotagem 3 é um falso "nada cai".
  await act(async () => { checkMinha.click(); });
  expect(cargasDoDetalhe()).toHaveLength(4);

  // E o bloco de anexos atravessou os quatro gestos sem remontar nem reconsultar (F2 da Etapa 34).
  expect(blocoDeAnexos()).not.toBeNull();
  expect(chamadasDeAnexos()).toHaveLength(1);
});
```

**(Fase 2) Onde este cenário mora:** dentro do `describe('Etapa 34: anexos da requisição no painel
de detalhe')` (`RequisicoesList.test.js:499`), porque ele usa `blocoDeAnexos()`,
`chamadasDeAnexos()` (`:500-501`) e o `cargasDoDetalhe()` que a T1 acrescenta ali. Fora do
`describe`, os três helpers não existem e o arquivo nem compila.

- [ ] **Step 2: rodar e ver passar.** Se o passo 3 devolver 2, a flag sobreviveu ao passo 2 — é o
      defeito do R2 e o conserto da T2 não está completo (confira que `syncSearchParams` devolve
      `null` quando não escreve **e** que a comparação do efeito é por igualdade de string). Se o
      **passo 4** devolver 3, a flag foi armada sem escrita e sobreviveu ao passo 3 — mesmo
      diagnóstico, outro sintoma.
- [ ] **Step 3: reexecutar as sabotagens 2 **e 3** da T2 contra ESTE cenário** (**(Fase 2)** a 3
      entrou nesta lista: ela é alcançável e este é o único cenário que a pega). A 2 tem de derrubar
      o **passo 3** (`Expected length: 3 / Received length: 2`); a 3 tem de derrubar o **passo 4**
      (`Expected length: 4 / Received length: 3`). São os dois controles positivos que a T2 não podia
      ter sozinha, porque o cenário não existia ainda. Se alguma delas **não** derrubar o passo que
      lhe cabe, o cenário está medindo outra coisa — conserte o cenário, não troque a sabotagem.
- [ ] **Step 4: a suíte inteira, os cinco comandos da `fechar-etapa`**, com os números lidos da
      saída (a Etapa 34 fechou em 169/169 arquivos, 42 do almoxarifado, 4/3/5 e 46 suítes / 690
      testes de client):

```
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```

O client tem de subir de **46 suítes / 690 testes** para **47 suítes / 698 testes**: +1 em
`RequisicoesList.test.js` (o de integração — as réguas da RN-01 e da RN-02 entram em cenários que
já existem e não somam contador), +3 em `RecebimentosAlmoxarifado.test.js` na T3, +2 na T4, e a
suíte nova do CSS com +2. **Confira os números reais e registre**, sem confiar nesta previsão. Os
comandos de `server/` têm de ficar **idênticos** aos da 34 — qualquer mudança ali significa que uma
task tocou o servidor, o que a Global Constraint proíbe. Prove com
`git diff --stat <hash da T1..T6> -- server/` **vazio**.

- [ ] **Step 5: commit** do cenário de integração, com os números reais da suíte no corpo.

---

### Task 7: fechamento — as specs param de mentir **(sequencial)**

**Files:**
- Modify: `specs/modulo-almoxarifado/04-requisicoes/README.md` (topo `:11` e o parágrafo `:80-90`)
- Modify: `specs/modulo-almoxarifado/08-recebimento/README.md` (topo `:11`, `:167-175`, e o
  off-by-one de `:170`)
- Modify: `specs/modulo-almoxarifado/README.md` (linhas das features 04 e 08 no mapa)
- Modify: `docs/almoxarifado-guia-etapas-e-testes.md` (cabeçalho "Onde o desenvolvimento está" +
  seção da Etapa 35 + roteiro de F12 do clipe)
- Modify: `docs/almoxarifado-novidades-por-etapa.md` (seção da Etapa 35, letra B, **a letra C
  (C45 fechado, C46/C47 novos)**, **a letra F (item F12)**, **a letra G (G10 fechado)** e a seção
  final "Onde estamos e o que vem a seguir")
- Modify: **`docs/almoxarifado-manual-do-sistema.md`** — ⚠️ **(Fase 2) estava FALTANDO nesta lista.**
  É o **artefato 7** da `fechar-etapa` (`.claude/skills/fechar-etapa/SKILL.md`, "### 7"), e não é
  opcional. O que entra dele nesta etapa: a tela de Recebimentos passa a **dizer quando não
  conseguiu carregar** (com a frase literal *"Não foi possível carregar os recebimentos."* e o botão
  *"Tentar de novo"*), a busca de material do cadastro de recebimento avisa quando a lista não
  carregou (*"Não foi possível carregar a lista de materiais."*), e ao trocar de recebimento o painel
  **não mostra mais os dados do anterior**. Sem número de etapa, sem hash, sem nome de arquivo, sem
  "antes era assim" — é a regra do arquivo.
- Modify: este plano (tasks marcadas, números reais, **próxima tarefa detalhada — Etapa 36**)

Use a skill **`fechar-etapa`**; ela é a versão executável do contrato. O que é específico desta
etapa:

- [ ] **Step 1: as duas specs.** 04 fecha o furo **C45** (dois GETs por clique) — o aviso do topo
      (`:11`) sai e o parágrafo `:80-90` passa a dizer **como** foi consertado, com a asserção que
      trava. 08 fecha a fragilidade **G10** e ganha os dois itens que **nenhuma spec tinha**: o
      painel que mostrava o registro anterior (RN-07) e a resposta fora de ordem (RN-08).
- [ ] **Step 2: dizer que a spec estava errada.** `08-recebimento/README.md:170` aponta
      `loadAuxiliares` em `:99-108`; o certo é **`:100-109`** (`:99` é linha em branco). Corrija
      **dizendo que estava errado** — a regra 5 do CLAUDE.md existe porque apagar em silêncio faz o
      próximo confiar de novo. Mesma coisa no cabeçalho de `RecebimentosAlmoxarifado.test.js:78-81`
      (terceira variante do mesmo off-by-one) e em `RequisicoesList.test.js:545-548`
      (`:232-234` → `:234-236`), se a T2 não os tiver pegado.
- [ ] **Step 3: o item (c) entra na documentação, que hoje não o tem em lugar nenhum.** Nem
      `04-requisicoes`, nem `08-recebimento`, nem o mapa mencionam o clipe de `.almox-actions`; ele
      só existia no plano da 34 (`:1035-1060`) como letra F. Vai para o **guia** (roteiro de F12) e
      para o **mapa**, com a faixa medida e o risco residual do `table-layout: auto`.
- [ ] **Step 4: o roteiro de F12 no guia**, clicável e específico: larguras **769, 820, 900, 1024,
      1100, 1280, 1400** px × **Ferramentas** (`:517`, uma ferramenta `DISPONIVEL` com
      `exige_calibracao = 1` — é o pior caso), **Materiais** (`:312`, 10 ícones) e **Remessas a
      Terceiros** (`:547`, 6 botões); em cada uma, conferir se o **último** botão da célula está
      **inteiro** (um botão cortado ao meio ainda "aparece") e se
      `document.querySelector('.almox-table-container').scrollWidth > clientWidth`. Dizer que **a
      mudança de CSS já foi feita** e que o roteiro serve para (1) confirmar o teto da faixa e (2)
      olhar as linhas que passaram a quebrar em duas fileiras.
- [ ] **Step 5: letra B** do `almoxarifado-novidades-por-etapa.md` com as **sete** decisões do
      design (a última decisão registrada é a **B71**, então esta etapa começa em **B72**), cada uma
      com o que foi escolhido e o que foi descartado. Marcar **C45** e **G10** como fechados, e
      numerar os dois itens novos que não tinham número (o painel mentiroso e a resposta fora de
      ordem) a partir do próximo livre (**C46**, **C47** — confira com
      `grep -o "C4[0-9]" docs/almoxarifado-novidades-por-etapa.md | sort -u`). **(Fase 2) conferido
      nesta revisão:** a última decisão é mesmo a **B71** (`:6236`), **C45** existe (`:6206`),
      **G10** existe (`:2368`), e os números de C em uso hoje são C40, C42, C43, C44, C45 — logo
      C46/C47 estão livres.
- [ ] **Step 5b (Fase 2, faltava): atualizar o item F12 da letra F.** Ele diz hoje
      (`docs/almoxarifado-novidades-por-etapa.md:6237-6238`): *"a verificação manual **F12**, de dois
      minutos: conferir se o clipe de **Materiais** fica cortado com a janela do navegador em meia
      tela"*. Depois desta etapa isso está **duplamente vencido**: (1) a tela do pior caso é
      **Ferramentas**, não Materiais (5 botões de texto com `white-space: nowrap` contra 10 ícones
      de 32px), e (2) **a mudança de CSS já foi feita** — o que resta medir no navegador não é "se
      corta", é o **teto da faixa** (entre ~1100px e ~1355px) e as linhas que passaram a quebrar em
      duas fileiras. Reescreva o F12 dizendo isso, e **diga que a redação anterior estava errada na
      tela** (regra 5 do CLAUDE.md), em vez de trocar o texto em silêncio.
- [ ] **Step 6: registrar a divergência do harness** na letra B: **`python3` não existe no Git Bash
      desta máquina** (é o alias da Microsoft Store, que imprime a mensagem da loja e não executa
      nada), enquanto `.claude/skills/fechar-etapa/SKILL.md:165-170` manda usar `python3` e explica
      que o problema era o alias `python`. A regra da skill está **certa no princípio e errada nesta
      máquina**: o que importa é que o interpretador exista. Propor a correção do texto da skill
      (`perl`/`sed` + `md5sum` como caminho padrão aqui) — e **não** editar a skill dentro desta
      task sem dizer que editou.
- [ ] **Step 7: a próxima tarefa detalhada — Etapa 36**, no fim deste plano, no molde da seção
      equivalente do plano da 34: o que sobrou nomeado (os três arquivos grandes; modal fiscal,
      workflow e etiquetas de Recebimentos sem teste; o teto da faixa do clipe pendente de F12; os
      furos C43/C44 da Etapa 33), com `arquivo:linha`, a régua de cada um e o que **não** reabrir.
- [ ] **Step 8: o checklist final da `fechar-etapa`**, com os cinco comandos e os números **lidos
      da saída**, mais `git merge-base --is-ancestor <hash> HEAD` para cada hash citado nos
      documentos.
- [ ] **Step 9: commit** dos documentos (um commit, assunto único: fechamento da etapa).

---

## Self-review do plano

- **Cobertura RN ↔ task ↔ sabotagem.** RN-01 → T1 (vermelho medido) + T2 (verde) + sabotagem 1 da
  T2; RN-02 → asserção acrescentada na T1 ao cenário `:503`, guarda contra "consertar matando o
  deep-link"; RN-03 → T6 passos 2, 3 **e 4** + sabotagens 2 **e 3** da T2 (que só podem ser
  exercidas contra o cenário da T6 — está dito na T6, Step 3); RN-04 → T3 cenário (h) + sabotagens 1
  e 2; RN-05 → T3 cenário (i) + sabotagem 2 (posição) **e 2b (posição + lista não zerada, a única
  que exercita `linhas()`)**; RN-06 → T3 cenário (j) + sabotagem 3; RN-07 → T4 cenário (k)
  + sabotagem 1; RN-08 → T4 cenário (l) + sabotagem 2; RN-09 → cenário (g) **já existente** + T4
  sabotagem 3 (condição); RN-10 → T5 seis asserções + três sabotagens. **Nenhuma RN sem sabotagem
  nomeada, e nenhuma sabotagem sem a asserção que ela tem de derrubar.**
- ⚠️ **(Fase 2) das duas sabotagens previstas como "nada cai", UMA estava errada.** A T2 nº 3
  (armar sem ter escrito) **é alcançável** e agora tem controle positivo: o Passo 4 do cenário de
  integração da T6. Sobra **uma** declarada como caso (2) da `fechar-etapa` — apagar
  `setRecebimentos([])` **sozinho** —, e mesmo essa ganhou a sabotagem **2b** da T3, que prova o par
  (posição + zerar a lista) pela asserção `linhas()`. Nenhuma "nada cai" ficou sem exame.
- **Nenhum cenário negativo sem metade positiva.** (h) tem `Recebimentos NF`; (i) tem a contagem de
  linhas antes de falhar; (j) tem a lista carregada **e** o modal montado; (k) tem o bloco do 58
  antes e o do 41 depois; (l) tem o painel no 41 antes de liberar o 58; o de integração abre com
  `REQ-055` e `toHaveLength(0)`; o de CSS tem a guarda-da-guarda (`css.length > 20000`). **(Fase 2)**
  o (h) ganhou também a metade positiva do **outro lado**: "Tentar de novo" restaura a lista — sem
  ela, um botão sem `onClick` passava verde.
- **Nenhum `entidade_id` nem id de fixture `1`.** Requisição `55` (e `555` no cenário que separa
  `detalhe.id` de `selectedId`); Recebimentos `41`/`58`/`77`/`91`, com o painel dos cenários novos
  no **58** e a troca para o **41** — nem o primeiro da lista, nem `1`.
- **Sem placeholders:** todo passo de código traz o código. A única decisão deixada em aberto é o
  seletor do botão de refresh (T3, Step 1b), com as duas saídas escritas, a recomendada marcada e a
  obrigação de dizer qual foi usada.
- **Consistência de tipos e nomes:** `syncSearchParams` passa a devolver `string | null` e é chamada
  em três lugares (`abrirDetalhe` `:246`, efeito de filtros `:184`, `fecharDetalhe` `:290`) — só o
  primeiro usa o retorno, e está escrito por quê. `navInternaRef` é `string | null`;
  `idCarregadoRef` é `number | null`; `detalheFetchSeqRef` é `number`. Nada é exportado, nada cruza
  arquivo.
- **O que este plano NÃO garante, dito de frente:** nenhum teste desta etapa prova que um botão está
  visível em pixels — jsdom não faz layout. A RN-10 congela premissas e o guia carrega o roteiro de
  F12; está escrito dentro do próprio arquivo de teste, no molde do commit `054f727`.

---

## Fase 2 — o que a revisão do plano pegou ANTES de executar

Revisor fresco, só leitura de código, HEAD `2e24971`. Todas as correções estão **no lugar**, marcadas
com **(Fase 2)** no texto da task que muda. **11 achados: 4 travariam a execução, 5 silenciosos,
2 de ruído.**

### Os que TRAVARIAM a execução

**1. A T4 continha a sabotagem acidental que o próprio plano proíbe — `TypeError` na suíte inteira.**
A tabela de render da T4 mandava trocar o gate do painel para `{selectedId && (` (`:485`) e listava
**cinco** pontos, guardando só o cabeçalho (`:489-491`). Faltavam dois, e os dois desreferenciam
`detalhe` nulo:

- `RecebimentosAlmoxarifado.js:496` — o ternário `loadingDetalhe ?` é hoje o **único** protetor do
  corpo do painel (`detalhe.nota_fiscal` `:501`, `detalhe.itens` `:512`, `detalhe.status` `:514`).
  O design mandava `loadingDetalhe || !detalhe`; o plano tinha perdido a linha.
- `RecebimentosAlmoxarifado.js:607-609` — **o bloco de anexos**, que o fix `c5d9e99` da Etapa 34
  tirou de dentro daquele ternário de propósito, lê `entidadeId={detalhe.id}` **sem guarda nenhuma**
  e só sobrevive hoje porque herda o `{detalhe && …}` de `:485`. Trocando esse gate, `detalhe.id`
  estoura no **primeiro clique de qualquer cenário**: (b), (c), (d), (e), (f), (g), (k) e (l) caem
  juntos por `TypeError`, e nenhum controle positivo prova coisa nenhuma.

Pior: a task **afirmava** o contrário no parágrafo "Interfaces" (*"o bloco continua dentro de
`{detalhe && …}`"*), contradizendo a própria tabela três parágrafos abaixo. Corrigido: a tabela tem
**sete** linhas, o parágrafo diz que a guarda passa a ser **explícita**, e a regra (iv) lá em cima
lista os três pontos em vez de um.

**2. As três sabotagens da T5 eram inaplicáveis pela regra de âncora do próprio plano.**
Medido: `grep -cF 'flex-wrap: wrap'` = **6**, `'gap: 6px'` = **5**, `'white-space: nowrap'` = **9**
em `Almoxarifado.css`. Com "âncora = 1" o executor abortaria as três; ignorando a regra, um
`perl -0pi` sem `/g` acertaria a **primeira** ocorrência do arquivo — que está noutra regra —, e a
sabotagem viraria no-op ou atingiria a tabela errada, exatamente o caso que a `fechar-etapa`
documenta. As três foram reescritas para ancorar no **seletor em início de linha** e operar sobre o
**bloco** (`grep -cE '^\.almox-actions \{'` = 1 etc.), com o detalhe de que
`grep -cF '.btn-almox-secondary {'` dá **2** por causa de `:1486`
(`.almox-mapa-page .btn-almox-secondary`).

**3. A sabotagem nº 3 da T2, declarada "provavelmente inalcançável", é alcançável — e nada a pegava.**
O consumo da flag só a zera **dentro** do ramo que casa, então uma flag armada sem escrita
**sobrevive indefinidamente**. Sequência que a pega: clique → **foco da janela** (não escreve, arma
`'id=55'`) → filtro liga (`'minha=1&id=55'`, não casa, **não desarma**) → filtro desliga
(`'id=55'`, casa a flag velha e **engole um refetch legítimo**). A ordem sugerida no enunciado
("clique → filtro → foco") **não** pega. Corrigido: o cenário de integração da T6 ganhou o
**Passo 4** (`toHaveLength(4)`), a sabotagem 3 virou controle positivo de verdade, e o comentário do
produto que dizia *"desarma sempre aqui… a flag nunca sobrevive a um ciclo do efeito"* foi reescrito
porque era falso.

**4. A T3, Step 1b, é uma edição de PRODUTO e estava sem ordem declarada.**
Sem o `title="Atualizar lista"` no botão de `:409`, o cenário (i) faz
`clicar(container.querySelector('[title="Atualizar lista"]'))` sobre `null` e estoura
`Cannot read properties of null` — vermelho **pelo motivo errado**, rodada TDD sem valor. Declarado
que o Step 1b precede o Step 2.

### Os silenciosos (passariam verdes, provando menos do que parece)

**5. A sabotagem de POSIÇÃO da T3 não exercitava `linhas()`.** O plano previa que o (i) cairia
"por `linhas()` — com a lista velha em memória"; mas a implementação desta mesma task põe
`setRecebimentos([])` no `catch`, então a lista fica **vazia**, não velha, e o (i) cai três linhas
antes, pela frase de erro. É o achado nº 34 (*"cair pela asserção errada deixa a que interessa sem
prova"*) repetido. Acrescentada a sabotagem **2b** — posição **combinada** com apagar
`setRecebimentos([])` —, a única que faz `linhas()` ficar `Received 3` e prova a metade "lista
obsoleta" da RN-05.

**6. O "Tentar de novo" era afirmado só por texto.** A RN-04 mandava
`toContain('Tentar de novo')` e mais nada: um `<button>` sem `onClick` passaria verde. A medição da
Fase 0 tinha pedido o cenário do molde (`HistoricoInspecoes.test.js:227-242`) e o plano o deixou
cair. Acrescentado ao próprio (h), sem somar contador de teste.

**7. A T7 não listava `docs/almoxarifado-manual-do-sistema.md`.** É o **artefato 7** da
`fechar-etapa`, não opcional, e é o documento de quem **usa** o sistema — as três mudanças desta
etapa são todas visíveis em tela. Acrescentado, com o que entra e a regra do arquivo (sem etapa, sem
hash, sem nome de arquivo).

**8. O item F12 da letra F ficaria vencido em silêncio.** Ele diz hoje *"conferir se o clipe de
**Materiais** fica cortado"* (`docs/almoxarifado-novidades-por-etapa.md:6237-6238`) — e esta etapa
prova que o pior caso é **Ferramentas** e já muda o CSS. Acrescentado o Step 5b à T7, com a
obrigação de **dizer que a redação anterior estava errada**.

**9. A ordem de execução vs. a coluna "Depende de".** T3 e T5 aparecem sem dependência, mas a T1
deixa a árvore **vermelha e não commitada**: qualquer task que rode a suíte inteira antes de a T2
fechar lê esse vermelho como regressão. Declarado que a ordem é literalmente 1 → 7 e que o Step 4 da
T5 (suíte inteira) só roda depois da T4.

### O que a revisão CONFIRMOU (e por isso pode executar)

- **A régua vermelha da T1 fica vermelha, e em 2.** O mock aceita as duas URLs no mesmo ramo
  (`RequisicoesList.test.js:89`), mas `mockWarehouseMode = true` (`:82`) faz o componente emitir só
  `/almoxarifado/requisicoes/55`; o `filter(([u]) => u === …)` casa apesar do 2º argumento
  (`{ params: { _t }, headers }`, `RequisicoesList.js:239-242`); e em `renderizarSemDetalhe()` a
  query vai de `''` para `'id=55'`, o que **escreve** e reacende o efeito de `:167`. **2, não 1 e
  não 3.** O cenário de deep-link (`:503-513`) fica verde na mesma rodada.
- **A guarda de `RequisicoesList.js:229` É código morto.** Contagem executada: `abrirDetalhe(` = 17
  linhas, `force: true` = **17**, `force: false` = **0**. A correção do plano (17, não 18) está
  certa.
- **O piso duro de Ferramentas fecha.** Ferramentas tem mesmo **5** botões simultâneos em
  `DISPONIVEL` + `exige_calibracao` (`:519, :529, :539, :553, :557`), todos `btn-almox-secondary`
  com ícone `size={13}`; `white-space: nowrap` está em `:368`; `gap: 7px` em `:358`;
  `padding: 9px 16px` em `:359`; `border: 1px` em `:362`; `.almox-actions` `gap: 6px` em `:307`;
  `td` padding `12px 16px` em `:194`; `.almox-table-container` `overflow: hidden` em `:171`; a regra
  de 768px em `:1025`/`:1030`. Conclusão intacta: em 769px a célula pede ~684px de 721px úteis.
- **O teste de drift da T5 funciona hoje.** As seis asserções foram executadas fora do Jest contra o
  CSS real: `css.length` = 39606, asserção 1 **false**, asserções 2-6 **true**.
- **Nenhuma linha de `server/`, nenhum `ACAO_PERFIS`, nenhum contrato de API** em nenhuma das sete
  tasks. A única edição de produto fora dos três arquivos declarados é o `title` do botão de refresh
  (T3, Step 1b), que é client e é acessibilidade.
- **A divergência da skill está declarada** (galhos sequenciais na mesma árvore, `node_modules` fora
  do git) e **`python3` não aparece como ferramenta em passo nenhum** — `perl`/`sed` + `md5sum` +
  âncora contada, com a correção de contagem do achado 2.

### Os dois de ruído (corrigidos, sem consequência de execução)

- **Números de linha e de tamanho:** `:863` → `:864` (o `title` do refresh de Requisições);
  `:503-518` → `:503-513` (o cenário de deep-link fecha em `:513`); "18 ocorrências" de
  `.almox-actions` → **17**; `≈685px` / `36px` → **683,5px** / **38px** (o plano arredondava cada
  botão antes de somar, e a saída do script que a T5 manda colar diria 683.5).
- **"As duas asserções caem":** o `expect` do Jest lança na primeira falha, então uma sabotagem
  derruba **uma** asserção, não duas. O texto da T3 foi corrigido — o que prova que o conserto é o
  DOM e não o toast é as duas existirem no mesmo cenário, não caírem juntas.

**Veredito:** com as 11 correções aplicadas, **o plano está pronto para executar**. Sem o achado 1,
a T4 derrubaria a suíte inteira de Recebimentos por `TypeError` e nenhum controle positivo da etapa
teria valor.
