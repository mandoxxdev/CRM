# Etapa 34 — Anexos nas cinco telas restantes: implementação

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` para
> executar este plano task a task. Os passos usam checkbox (`- [ ]`).

**Goal:** dar superfície de tela às cinco entidades de anexo que já têm backend testado e permissão
concedida e **nenhum lugar onde anexar**: `material`, `requisicao`, `recebimento`, `devolucao` e
`item_remessa`.

**Architecture:** uma casca de modal reutilizável (`AnexosModal`) para as três telas que **não têm
casa** para o bloco, e bloco inline nos dois painéis de detalhe que já existem. **Nenhuma linha de
`server/` muda.**

**Tech Stack:** React CRA, `react-icons/fi`, `createRoot`/`act` (⚠️ `@testing-library/react` **não
está instalado** nesta base — `LoteSeletor.test.js:10-12` documenta a pegadinha).

**Spec:** `docs/superpowers/specs/2026-09-03-almoxarifado-etapa34-anexos-cinco-telas-design.md`
(commit `6ccaf40`) — leia junto.

## Global Constraints

- **Nenhuma alteração em `server/`.** Se uma task achar que precisa mexer no servidor, **pare e
  reporte**: o mapa de entidades é congelado por `deepStrictEqual` no teste do serviço, e mexer
  nele é tronco de outra etapa.
- **`@testing-library/react` NÃO existe aqui.** Use `createRoot` + `act`, molde
  `PlanoInspecaoModal.test.js` / `HistoricoInspecoes.test.js`.
- **O comando de teste do client leva CAMINHO, não `-t`.** `-t` é `--testNamePattern` e devolve
  `41 skipped, exit 0` — foi o achado nº 1 da Fase 2 da Etapa 32. Use
  `cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/Arquivo.test.js`.
- **Português com acento no código e nas mensagens; sem acento no corpo do commit.**
- **Nunca `git add -A` na raiz** — há artefatos de runtime em `server/data/` e `server/uploads/`.
- **Controle positivo obrigatório** em todo cenário que passar de primeira. Nesta etapa há um modo
  de falha específico e conhecido, descrito na seção abaixo — leia antes de escrever teste.

## ⚠️ O modo de falha desta etapa: o teste que passa com o bloco ausente

Os quatro arquivos de teste existentes têm fallback **`Promise.resolve({ data: [] })`** para URL
desconhecida (`MateriaisAlmoxarifado.test.js:106`, `DevolucoesAlmoxarifado.test.js:69`,
`RemessasTerceirosAlmoxarifado.test.js:106`, `RequisicoesList.test.js:82`). Consequência dupla:

1. **Bom:** plugar o bloco não quebra nenhum teste existente por rede.
2. **Ruim, e é o que importa:** um cenário que só afirme "a tela renderiza sem erro" fica **verde
   com o bloco ausente**. É a forma exata que esta base já pagou quatro vezes.

**A régua de cada plug tem de ser a PRESENÇA da superfície**, com a entidade certa:

- para os três modais: o botão existe na linha → clicar abre `[data-testid="anexos-modal"]` →
  dentro dele existe `[data-testid="anexos-documento"]`, e **`api.get` foi chamado com
  `'/almoxarifado/anexos'` e `params: { entidade: '<chave>', entidade_id: <id> }`**;
- para os dois inline: abrir o painel renderiza `[data-testid="anexos-documento"]` e faz a **mesma
  asserção sobre a chamada**.

**A asserção dos `params` não é zelo — é o único ponto que distingue entidade errada.** Um plug com
`entidade="material"` na tela de devoluções renderiza igual, monta igual e só falharia em produção
com 400 *"Entidade inválida para anexo"*. O teste do servidor não alcança isso porque a escolha da
chave é do client.

**RN-02 tem cenário próprio, e é negativo com metade positiva:** com a lista carregada e nenhum
modal aberto, `api.get` **não** foi chamado com `'/almoxarifado/anexos'` — e no mesmo teste,
depois de clicar, **foi**. Cenário negativo sozinho passa com a tela vazia.

### Três regras que a Fase 2 acrescentou, e valem para TODAS as tasks

**(i) Nunca teste com `entidade_id: 1`, nem com o PRIMEIRO id da fixture.** É o achado mais caro da
revisão. `entidade_id: 1` é **indistinguível** de três defeitos diferentes: `entidadeId={lista[0].id}`
(índice zero), `entidadeId={1}` literal, e estado obsoleto que reabre sempre o primeiro registro.
Em produção o usuário clica o clipe da 3ª linha e recebe os anexos do 1º material — **sem 400, sem
erro**, que é o defeito mais caro possível num módulo de documentos. Onde a fixture já tem id alto,
use-o (Materiais tem `id: 3`; Remessa tem `11`; Requisição tem `55`); onde não tem, **acrescente**
(Devoluções: junte `{ id: 42, ... }`). E onde der, **abra o primeiro, feche, abra o terceiro e
afirme que a ÚLTIMA chamada é a do terceiro** — é o único jeito de pegar estado obsoleto.

**(ii) Conte as chamadas.** A RN-02 diz "**uma** requisição", e `toHaveBeenCalledWith` é satisfeito
por 1, 2 ou 10. Todo cenário positivo leva também:
```js
expect(api.get.mock.calls.filter(([u]) => u === '/almoxarifado/anexos')).toHaveLength(1);
```
Sem isso, um remount por churn de `key` — ou o debounce de 350 ms de Materiais re-renderizando a
lista com o modal aberto — dobra as requisições e nenhum cenário fica vermelho.

**(iii) Sabotagem que derruba a suíte inteira por crash não é controle positivo.** Se a sabotagem
faz o componente lançar `TypeError` no primeiro render, **todos** os cenários caem juntos e nenhum
deles provou nada. A sabotagem tem de deixar os outros cenários verdes e derrubar **um**, pela
asserção que guarda o achado.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `client/src/components/almoxarifado/AnexosDocumento.js` **(modificar)** | pular o `<h4>` quando `titulo` for falsy | 1 |
| `client/src/components/almoxarifado/AnexosModal.js` **(criar)** | casca de modal + `AnexosDocumento` | 1 |
| `client/src/components/almoxarifado/AnexosModal.test.js` **(criar)** | 5 cenários da casca | 1 |
| `client/src/components/almoxarifado/AnexosDocumento.test.js` **(modificar)** | 2 cenários do `titulo` | 1 |
| `MateriaisAlmoxarifado.js` + `.test.js` **(modificar)** | botão de clipe na linha + modal | 2 |
| `DevolucoesAlmoxarifado.js` + `.test.js` **(modificar)** | coluna de ações nova + modal | 3 |
| `RemessasTerceirosAlmoxarifado.js` + `.test.js` **(modificar)** | botão na linha do item + modal | 4 |
| `RequisicoesList.js` + `.test.js` **(modificar)** | bloco inline no painel | 5 |
| `RecebimentosAlmoxarifado.js` **(modificar)** + `.test.js` **(CRIAR)** | bloco inline + a suíte que não existe | 6 |
| `client/src/components/almoxarifado/anexosEntidades.test.js` **(criar)** | integração: as 5 chaves × o mapa do servidor | 7 |

## Sort topológico

| Task | Tipo | Depende de | Por quê |
|---|---|---|---|
| 1 — `AnexosModal` + `titulo` opcional | **tronco** | — | três tasks o consomem, e mexe num componente que a Etapa 32 congelou |
| 2 — Material | galho | 1 | consome a casca contra contrato congelado |
| 3 — Devolução | galho | 1 | idem |
| 4 — Item de remessa | galho | 1 | idem |
| 5 — Requisição | galho | — | inline; não usa a casca |
| 6 — Recebimento | galho | — | inline; não usa a casca |
| 7 — integração + fechamento | sequencial | 2–6 | cruza os galhos pela chave de entidade |

### Divergência declarada da skill: os galhos vão SEQUENCIAIS, não em worktrees

A `desenvolver-etapa-almoxarifado` manda rodar galhos paralelos em worktrees isoladas. **Aqui não
dá, e o motivo foi medido:** `node_modules/`, `client/node_modules/` e `server/node_modules/` estão
no `.gitignore` (`.gitignore:2-4`), então uma worktree nova **não tem `react-scripts`** e não
consegue rodar `CI=true npx react-scripts test`. Isolar exigiria um `npm install` por worktree.

As cinco tasks são pequenas e tocam arquivos disjuntos; o custo de serializá-las é baixo e o risco
de paralelizá-las **na mesma árvore** (dois `git add`, duas execuções concorrentes do jest sobre o
mesmo cache do CRA) é o modo de falha que a Etapa 25 já pagou. **Sequencial, um executor por task.**

---

### Task 1: `AnexosModal` e o `titulo` opcional  **(tronco)**

**Files:**
- Modify: `client/src/components/almoxarifado/AnexosDocumento.js:214`
- Create: `client/src/components/almoxarifado/AnexosModal.js`
- Create: `client/src/components/almoxarifado/AnexosModal.test.js`
- Modify: `client/src/components/almoxarifado/AnexosDocumento.test.js`

**Interfaces:**
- Consumes: `AnexosDocumento({ entidade, entidadeId, titulo, somenteLeitura })` — já pronto,
  contrato da Etapa 32; devolve `null` com `entidadeId` falsy (`AnexosDocumento.js:210`).
- Produces, e as Tasks 2, 3 e 4 dependem destes nomes exatos:
  - `AnexosModal({ titulo, subtitulo, entidade, entidadeId, onClose })` — default export
  - `data-testid="anexos-modal"` no overlay
  - devolve `null` se `entidadeId` for falsy (a mesma RN-01, na casca)
  - fecha por clique no overlay **e** pelo botão `✕`; clique no corpo **não** fecha

**Por que o `titulo` opcional:** dentro do modal o cabeçalho já diz o que é. Sem isso o usuário lê
"📎 Anexos" duas vezes, uma embaixo da outra. A mudança é uma condicional com **default
preservado** (`titulo = 'Anexos'`), então `HistoricoInspecoes.js:246` não muda de comportamento —
e a Task 1 prova isso com cenário próprio, não por inspeção.

- [x] **Step 1: Escrever os cenários que falham** (`AnexosModal.test.js`)

Molde de montagem, **com as faixas corrigidas pela Fase 2** (o boilerplate não está todo no topo):
`AnexosDocumento.test.js:38-58` traz os três `jest.mock` (`api` `:38`, `react-toastify` `:44`,
`useAlmoxPermissoes` com `pode: () => true` `:50-58`), e `:93` + `:117-129` trazem o `let container`
e o `beforeEach` com `createRoot`. **O helper de montagem desta base chama-se `renderizar`** — nos
cinco arquivos, sem exceção; `AnexosDocumento.test.js:142` é o único que aceita `props`.

```jsx
// 1. entidadeId falsy: nao renderiza nada E nao chama a API (RN-01 na casca)
test('sem entidadeId, o modal nao monta e nao consulta', async () => {
  await renderizar({ entidade: 'material', entidadeId: null });
  expect(document.querySelector('[data-testid="anexos-modal"]')).toBeNull();
  expect(api.get).not.toHaveBeenCalledWith('/almoxarifado/anexos', expect.anything());
});

// 2. com id: monta a casca E o bloco dentro dela, com a entidade pedida
test('com entidadeId, monta o bloco e consulta a entidade certa', async () => {
  await renderizar({ entidade: 'material', entidadeId: 7 });
  expect(document.querySelector('[data-testid="anexos-modal"]')).not.toBeNull();
  expect(document.querySelector('[data-testid="anexos-documento"]')).not.toBeNull();
  expect(api.get).toHaveBeenCalledWith('/almoxarifado/anexos',
    { params: { entidade: 'material', entidade_id: 7 } });
});

// 3. o titulo do modal aparece, e o <h4> interno NAO se repete
test('o cabecalho do modal nao duplica o titulo do bloco', async () => {
  await renderizar({ entidade: 'material', entidadeId: 7, titulo: 'Anexos do material' });
  expect(document.body.textContent).toContain('Anexos do material');
  expect(document.querySelectorAll('.almox-anexos-titulo').length).toBe(0);
});

// 4. fecha pelo X e pelo overlay
test('fecha pelo X e pelo overlay, mas nao pelo corpo', async () => { /* 3 cliques, 2 chamadas */ });

// 5. subtitulo opcional aparece quando dado
```

- [x] **Step 2: Rodar e ver falhar**

```
cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/AnexosModal.test.js
```
Esperado: `Cannot find module './AnexosModal'`.

- [x] **Step 3: Escrever `AnexosModal.js`**

```jsx
import React from 'react';
import { FiPaperclip } from 'react-icons/fi';
import AnexosDocumento from './AnexosDocumento';
import './Almoxarifado.css';

/**
 * Casca de modal para o bloco de anexos (Etapa 34).
 *
 * Existe porque TRÊS telas do módulo não têm onde receber o bloco inline: Materiais e Devoluções
 * não têm linha expansível nem painel de detalhe, e o item de remessa vive numa tabela de N linhas
 * dentro do painel — inline ali seria N requisições ao abrir a remessa (RN-02).
 *
 * A alternativa descartada foi a linha expansível. Ela exige a affordance INTEIRA — cursor,
 * `title`, chevron nos dois ramos e `aria-expanded` — e foi uma affordance pela metade que custou
 * o fix-round 2 da Etapa 32. Repetir isso em três marcações de tabela diferentes é triplicar a
 * chance do mesmo defeito; um botão com `title` é affordance completa por construção.
 *
 * NÃO decide permissão. Quem só tem `visualizar` precisa poder ver e baixar — decisão B68 da
 * Etapa 32, escrita. Gatear a abertura por `anexar_documento` a contradiria em silêncio. Quem
 * esconde o formulário e a lixeira é o `AnexosDocumento` (`:104-106`).
 */
function AnexosModal({ titulo = 'Anexos', subtitulo, entidade, entidadeId, onClose }) {
  // Mesma RN-01 do bloco, aplicada na casca: sem registro no banco não há o que listar.
  if (!entidadeId) return null;
  return (
    <div className="almox-modal-overlay" onClick={onClose} data-testid="anexos-modal">
      <div className="almox-modal" onClick={(e) => e.stopPropagation()}>
        <div className="almox-modal-header">
          {/* `h2` e nao `h3`: os 44 cabeçalhos de modal desta base usam `h2`, e o CSS estiliza
              **só** `.almox-modal-header h2` (`Almoxarifado.css:432`). Com `h3` o título cai no
              default do navegador (`margin: 1em 0`), empurra o header `flex`/`sticky` e desalinha
              o `✕` — achado da Fase 2, que nenhum cenário desta etapa pegaria. */}
          <h2><FiPaperclip /> {titulo}</h2>
          <button className="almox-modal-close" onClick={onClose} title="Fechar">✕</button>
        </div>
        <div className="almox-modal-body">
          {subtitulo && (
            <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--gmp-text-light)' }}>
              {subtitulo}
            </p>
          )}
          {/* `titulo={null}`: o cabeçalho acima já diz o que é. Sem isso o usuário lê
              "Anexos" duas vezes, uma embaixo da outra. */}
          <AnexosDocumento entidade={entidade} entidadeId={entidadeId} titulo={null} />
        </div>
      </div>
    </div>
  );
}

export default AnexosModal;
```

E em `AnexosDocumento.js`, trocar a linha do `<h4>` por:

```jsx
      {/* Etapa 34: o título é opcional. Dentro do `AnexosModal` o cabeçalho do modal já o diz, e
          repetir "Anexos" duas vezes seguidas é ruído. O default segue 'Anexos', então
          `HistoricoInspecoes.js:246` não muda — e há cenário provando isso. */}
      {titulo && <h4 className="almox-anexos-titulo"><FiPaperclip /> {titulo}</h4>}
```

- [x] **Step 4: Acrescentar os 2 cenários do `titulo` em `AnexosDocumento.test.js`**

```jsx
test('por padrao o titulo aparece — e e o que HistoricoInspecoes usa', async () => {
  await renderizar({});   // sem passar titulo
  expect(document.querySelector('.almox-anexos-titulo').textContent).toContain('Anexos');
});
test('com titulo nulo o cabecalho some, mas a lista continua', async () => {
  await renderizar({ titulo: null });
  expect(document.querySelector('.almox-anexos-titulo')).toBeNull();
  expect(document.querySelector('[data-testid="anexos-documento"]')).not.toBeNull();
});
```

- [x] **Step 5: Rodar os dois arquivos e ver passar**

```
cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/AnexosModal.test.js src/components/almoxarifado/AnexosDocumento.test.js src/components/almoxarifado/HistoricoInspecoes.test.js
```

- [x] **Step 6: CONTROLE POSITIVO — três sabotagens, e leia QUAL asserção cai**

| # | Sabotagem | Cenário que TEM de cair |
|---|---|---|
| 1 | trocar `if (!entidadeId) return null;` por `if (false) return null;` | cenário 1, **só** pela asserção do `querySelector`. A do `api.get` **não cai**, e isso não é falha do cenário: a guarda própria de `AnexosDocumento.js:117` já barra a requisição. A guarda da casca serve para não desenhar overlay vazio, não para evitar a chamada — **não reporte cobertura que não existe** (correção da Fase 2). |
| 2 | trocar `titulo={null}` por `titulo="Anexos"` na chamada interna | cenário 3, pela asserção `.almox-anexos-titulo.length === 0` |
| 3 | trocar `{titulo && <h4...>}` por `<h4...>` (sem a guarda) | cenário do `titulo` nulo em `AnexosDocumento.test.js` |

Regras do harness: `md5sum` antes / depois da sabotagem / depois de restaurar; `git diff --stat`
tem de voltar vazio. **Se a sabotagem 2 não derrubar o cenário 3, o cenário está medindo outra
coisa** — conserte o cenário, não troque a sabotagem.

- [x] **Step 7: Commit** — feito: `746a106`

```bash
git add client/src/components/almoxarifado/AnexosModal.js \
        client/src/components/almoxarifado/AnexosModal.test.js \
        client/src/components/almoxarifado/AnexosDocumento.js \
        client/src/components/almoxarifado/AnexosDocumento.test.js
```

---

### Task 2: Material — o clipe na linha da lista  **(galho)**

**Files:**
- Modify: `client/src/components/almoxarifado/MateriaisAlmoxarifado.js` (imports `:1-10`; estados
  `:31-53`; botões da linha `:330-355`; montagem dos modais `:424-434`)
- Modify: `client/src/components/almoxarifado/MateriaisAlmoxarifado.test.js`

**Interfaces:** consome `AnexosModal` da Task 1, chave de entidade **`material`**.

**Ponto de atenção (é o achado que decidiu o desenho):** o botão **NÃO** passa por
`bloquearSeNaoPode`. `editar_material` é de três perfis e `anexar_documento` é de sete — gatear
aqui deixaria COMPRAS, PRODUÇÃO, GESTOR e QUALIDADE com a permissão e sem superfície. Todos os
outros botões da linha usam `bloquearSeNaoPode`; **este é a exceção, e o comentário tem de dizer
por quê**, senão o próximo o "corrige".

- [x] **Step 1: Escrever os cenários que falham**

⚠️ `renderizar()` deste arquivo **avança 350 ms de debounce** (`MateriaisAlmoxarifado.test.js:118-123`)
— não o reescreva achando que é `await` comum.

A fixture tem três materiais: `id 1`, `id 2`, `id 3` (`MateriaisAlmoxarifado.test.js:103`). **Use o
3, nunca o 1** — regra (i) do topo: com `id: 1` a asserção não distingue o plug certo de
`entidadeId={materiais[0].id}` nem de um literal.

```jsx
test('o clipe abre o modal de anexos DO MATERIAL da linha — e nao do primeiro', async () => {
  await renderizar();
  const clipe = document.querySelector('[data-testid="anexos-material-3"]');   // o TERCEIRO
  expect(clipe).not.toBeNull();
  await act(async () => { clipe.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(document.querySelector('[data-testid="anexos-modal"]')).not.toBeNull();
  expect(api.get).toHaveBeenCalledWith('/almoxarifado/anexos',
    { params: { entidade: 'material', entidade_id: 3 } });   // a chave E o id certo
  expect(api.get.mock.calls.filter(([u]) => u === '/almoxarifado/anexos')).toHaveLength(1);
});

// Estado obsoleto: abrir o 1, fechar, abrir o 3 — a ULTIMA chamada tem de ser a do 3.
// Sem este cenario, um `anexosMaterial` que nao se atualiza passa em tudo acima.
test('reabrir em outra linha consulta a linha nova, nao a anterior', async () => {
  await renderizar();
  const abrir = (id) => act(async () => {
    document.querySelector(`[data-testid="anexos-material-${id}"]`)
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await abrir(1);
  await act(async () => { document.querySelector('.almox-modal-close')
    .dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await abrir(3);
  const chamadas = api.get.mock.calls.filter(([u]) => u === '/almoxarifado/anexos');
  expect(chamadas[chamadas.length - 1][1].params.entidade_id).toBe(3);
});

// RN-02: negativo COM a metade positiva no mesmo teste
test('a lista sozinha nao consulta anexos; so o clique consulta', async () => {
  await renderizar();
  expect(api.get).not.toHaveBeenCalledWith('/almoxarifado/anexos', expect.anything());
  await act(async () => { document.querySelector('[data-testid="anexos-material-3"]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(api.get).toHaveBeenCalledWith('/almoxarifado/anexos', expect.anything());
});
```

- [x] **Step 2: Rodar e ver falhar** (esperado: `clipe` é `null`)
- [x] **Step 3: Implementar** — `FiPaperclip` no import de ícones; estado
  `const [anexosMaterial, setAnexosMaterial] = useState(null);`; o botão **antes** do de editar:

```jsx
{/* Etapa 34 — anexos do material (ficha técnica, certificado, desenho).
    SEM `bloquearSeNaoPode`, de propósito e ao contrário dos vizinhos: `anexar_documento` é de
    sete perfis e `editar_material` de três, e quem só tem `visualizar` precisa poder BAIXAR
    (decisão B68 da Etapa 32). Gatear aqui daria a COMPRAS, PRODUÇÃO, GESTOR e QUALIDADE a
    permissão sem nenhuma superfície. Quem esconde enviar/remover é o próprio bloco. */}
<button className="almox-btn-icon" title="Anexos e documentos deste material"
  data-testid={`anexos-material-${m.id}`}
  onClick={() => setAnexosMaterial(m)}>
  <FiPaperclip />
</button>
```

e, junto dos outros modais (`:424-434`):

```jsx
{anexosMaterial && (
  <AnexosModal
    titulo="Anexos do material"
    subtitulo={`${anexosMaterial.codigo} — ${anexosMaterial.nome}`}
    entidade="material" entidadeId={anexosMaterial.id}
    onClose={() => setAnexosMaterial(null)} />
)}
```

- [x] **Step 4: Rodar e ver passar**
- [x] **Step 5: CONTROLE POSITIVO** — troque `entidade="material"` por `entidade="requisicao"`.
      **TEM de cair o primeiro cenário, na asserção dos `params`.** Se cair só o segundo, o
      primeiro não está provando a chave — conserte.
- [x] **Step 6: Commit** — feito: `eb89b5e`

---

### Task 3: Devolução — a coluna de ações que não existia  **(galho)**

**Files:**
- Modify: `client/src/components/almoxarifado/DevolucoesAlmoxarifado.js` (`:4` ícones; `:69`
  estados; `:208` `SkeletonTable`; `:213-215` cabeçalho; `:223-233` linha; `:240` modais)
- Modify: `client/src/components/almoxarifado/DevolucoesAlmoxarifado.test.js`

**Interfaces:** consome `AnexosModal`, chave **`devolucao`**.

**Pontos de atenção medidos:**
1. A tabela **não tem coluna de ações**. Esta task cria a primeira — cabeçalho `<th></th>` e célula.
2. **`SkeletonTable rows={6} columns={8}` em `:208` precisa virar `columns={9}`**, senão o
   esqueleto de carregamento fica mais estreito que a tabela carregada.
3. A devolução é **imutável** — não há PUT nem DELETE, e a tabela não tem `status` (`schema.js:1306-1329`).
   Logo **não há `somenteLeitura`**: anexar em devolução antiga é legítimo (é onde o comprovante
   chega). Não invente gate por idade.

- [x] **Step 1: Escrever os cenários** — o mesmo trio da Task 2 com `entidade: 'devolucao'`, **mais
      o do esqueleto** (abaixo). Antes de tudo, **acrescente uma segunda devolução à fixture**:
      `DevolucoesAlmoxarifado.test.js:49-53` hoje tem **uma** linha, `id: 1`, e a regra (i) do topo
      proíbe testar com ela. Junte `{ id: 42, material_codigo: 'TUB-2', material_nome: 'Tubo 2"',
      quantidade: 3, motivo: 'SOBRA', condicao: 'BOM', destino: 'ESTOQUE', created_at: ... }` e
      faça as asserções com **42**.

      **O cenário do esqueleto** (achado da Fase 2: sem ele, esquecer o `columns={9}` fica verde
      **para sempre** — o arquivo não tem nenhuma referência a `SkeletonTable`, `columns` ou
      contagem de `<th>`). `SkeletonLoader.js:21-27` renderiza um `.skeleton-table-header-cell` por
      coluna, então dá para amarrar as duas pontas sem fixar número nenhum:

```js
test('o esqueleto tem tantas colunas quanto a tabela carregada', async () => {
  let liberar;
  const original = api.get.getMockImplementation();
  api.get.mockImplementation((url, cfg) => (url === '/almoxarifado/devolucoes'
    ? new Promise((r) => { liberar = () => r({ data: DEVOLUCOES }); })
    : original(url, cfg)));
  await renderizar();
  const cols = container.querySelectorAll('.skeleton-table-header-cell').length;
  expect(cols).toBeGreaterThan(0);                       // metade positiva
  await act(async () => { liberar(); await new Promise((r) => setTimeout(r, 0)); });
  expect(container.querySelectorAll('.almox-table thead th')).toHaveLength(cols);
});
```

- [x] **Step 2: Rodar e ver falhar**
- [x] **Step 3: Implementar** — `FiPaperclip` em `:4`; `const [anexosDevolucao, setAnexosDevolucao] = useState(null);`;
      `<th></th>` no fim de `:215`; a célula no fim da linha; `columns={9}`; o modal com
      `subtitulo={`${d.material_codigo} — ${d.material_nome} · ${formatData(d.created_at)}`}`.
- [x] **Step 4: Rodar e ver passar**
- [x] **Step 5: CONTROLE POSITIVO** — duas sabotagens:
      (a) troque `entidade="devolucao"` por `entidade="material"` → cai pela asserção dos `params`;
      (b) volte o `columns={9}` para `columns={8}` → **tem de cair o cenário do esqueleto**, na
      comparação final. Se não cair, o cenário está medindo outra coisa — conserte o cenário.
- [x] **Step 6: Commit** — feito: `67f2389`

---

### Task 4: Item de remessa — o clipe na linha do item  **(galho)**

**Files:**
- Modify: `client/src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js` (`:4` ícones; `:89`
  estados; `:594-600` cabeçalho da tabela de itens; `:612-625` linha do item; fim do componente)
- Modify: `client/src/components/almoxarifado/RemessasTerceirosAlmoxarifado.test.js`

**Interfaces:** consome `AnexosModal`, chave **`item_remessa`**.

**Pontos de atenção medidos:**
1. **`entidade_id` é `i.id`** — o id da linha de `itens_remessa_terceiro_almoxarifado`, que o
   servidor devolve por `i.*` (`thirdPartyService.js:303-307`). **Nunca o `id` da remessa** (RN-05).
   A fixture do teste já traz `{ id: 11, ... }` (`RemessasTerceirosAlmoxarifado.test.js:57`).
2. O teste usa `.almox-remessa-detalhe tbody tr` como `linhasDetalhe()` (`:123-124`). Acrescentar
   **coluna** não muda a contagem de linhas; acrescentar **linha** mudaria. Só coluna.
3. Itens em digitação (`itensNovos`, `:215-226`) **não têm `id`** e são renderizados noutra tabela
   (`:734`). **Não** ponha o clipe lá — é a RN-01.

- [x] **Step 0 (ACHADO DA FASE 2 — sem isto o Step 1 é impossível): a fixture tem UM item, não dois.**
      `RemessasTerceirosAlmoxarifado.test.js:53-61` — `DETALHE_1.itens` tem **um** item (`id: 11`);
      `LISTA[0].itens_total: 2` é só o contador da linha da lista, não o array. O terceiro cenário
      exige dois. Acrescente a `DETALHE_1.itens`:

```js
{ id: 12, material_id: 102, material_codigo: 'TUB-2', material_nome: 'Tubo 2"',
  unidade: 'M', quantidade: 5, quantidade_retornada: 0, pendente: 5, peso: null }
```

      Medido como seguro: `linhasDetalhe()` (`:124`) só é usado como `[0]` em `:322` e `:333`, e
      `celula(tr, 'retornado'|'transformado'|'baixado')` continua casando por `data-col`.

- [x] **Step 1: Escrever os cenários** — o par da Task 2 com `entidade: 'item_remessa'` e
      `entidade_id: 11` (mais a contagem `toHaveLength(1)` da regra (ii)), **mais um terceiro**:
      abrir o painel de uma remessa com 2 itens **não** chama `/almoxarifado/anexos` nenhuma vez.

      ⚠️ **O terceiro cenário precisa da metade positiva no MESMO teste** (achado da Fase 2: como
      está, ele fica verde se o clique na linha da remessa falhar em silêncio e o painel nunca
      abrir). Antes do negativo:
      `expect(linhasDetalhe()).toHaveLength(2)` e
      `expect(document.querySelector('[data-testid="anexos-item-11"]')).not.toBeNull()`;
      depois do negativo, clicar o clipe e afirmar a chamada com `entidade_id: 11`.
- [x] **Step 2: Rodar e ver falhar**
- [x] **Step 3: Implementar** — `FiPaperclip` no import de `:4`;
      `const [anexosItem, setAnexosItem] = useState(null);`; `<th></th>` no cabeçalho; a célula com
      `data-testid={`anexos-item-${i.id}`}`; o modal com
      `subtitulo={`${anexosItem.material_codigo} — ${anexosItem.material_nome}`}`.
- [x] **Step 4: Rodar e ver passar** (rode **também** `RemessasTerceirosTransformacao.test.js`)
- [x] **Step 5: CONTROLE POSITIVO** — duas sabotagens, e as duas importam:

      **(a)** `entidadeId={aberta.id}` em vez de `{i.id}` → tem de cair pela asserção do
      `entidade_id: 11` (`aberta.id` é 1, `i.id` é 11 — valores distintos, confirmado). É a RN-05,
      e **é o defeito que produção mostraria como 400 numa remessa e silêncio noutra**.

      **(b)** ⚠️ **A sabotagem original ("mover o bloco para fora do `{aberta && ...}`") era NO-OP
      e a Fase 2 pegou.** O modal é montado sob `{anexosItem && ...}`, condicionado ao **estado**,
      não a `aberta`: com `anexosItem === null` no cenário 3 ele não renderiza dentro nem fora, e
      o cenário ficava verde nos dois casos — e a regra do harness mandaria o executor "consertar"
      um cenário saudável. **A sabotagem certa é trocar o botão+modal por bloco inline na linha do
      item**: `<AnexosDocumento entidade="item_remessa" entidadeId={i.id} titulo={null} />` dentro
      do `map` de `:602`. Com dois itens são duas chamadas, e o cenário 3 cai pelo motivo certo.
- [x] **Step 6: Commit** — feito: `dd6e4c5` (divergência: o teste do PDF também contava itens, `toHaveLength(1)` → `2`; o Step 0 não previu)

---

### Task 5: Requisição — bloco inline no painel de detalhe  **(galho)**

**Files:**
- Modify: `client/src/components/almoxarifado/RequisicoesList.js` (import; inserir **depois** do
  bloco de Assinaturas que fecha em `:1031` e **antes** de "Ações — aprovação de valor" em `:1033`)
- Modify: `client/src/components/almoxarifado/RequisicoesList.test.js`

**Interfaces:** consome `AnexosDocumento` **direto** (não a casca), chave **`requisicao`**.

**Pontos de atenção medidos:**
1. O painel inteiro é `{selectedId && (...)}` (`:848`), então o bloco já nasce montado só com um
   detalhe aberto — a RN-02 sai de graça, **mas o cenário tem de existir mesmo assim**.
2. `entidadeId={detalhe.id}` — **não** `selectedId`. ⚠️ **A justificativa que eu havia escrito aqui
   estava ERRADA, e a Fase 2 a derrubou.** Eu disse que `selectedId` "existe antes de o detalhe
   carregar, então dispararia a consulta com o painel vazio". **Isso não pode acontecer:** o ponto
   de inserção está dentro do ramo `else` de `RequisicoesList.js:874`
   (`{loadingDetalhe || !detalhe ? <loading> : <corpo>}`), então o bloco não renderiza enquanto
   `detalhe` for `null`. E o `catch` de `abrirDetalhe` (`:246-252`) zera `selectedId` **e** `detalhe`
   juntos — **não existe estado alcançável em que os dois divirjam**. `detalhe.id` continua sendo o
   certo (é a leitura do dado carregado, não da URL), mas por higiene, não por defeito evitado.
3. O teste renderiza sempre com `?id=55` (`:95-103`), então o painel já abre.
4. **Rascunho não muda nada aqui:** um rascunho salvo JÁ é linha no banco, e o formulário
   (`RequisicaoForm.js`) não tem `id` nenhum — por isso o form **não** recebe bloco (RN-01).

- [x] **Step 1: Escrever os cenários**
```jsx
test('o painel de detalhe mostra os anexos DA REQUISICAO aberta', async () => {
  await renderizar();     // ja renderiza com ?id=55
  expect(document.querySelector('[data-testid="anexos-documento"]')).not.toBeNull();
  expect(api.get).toHaveBeenCalledWith('/almoxarifado/anexos',
    { params: { entidade: 'requisicao', entidade_id: 55 } });
});
```
- [x] **Step 2: Rodar e ver falhar**
- [x] **Step 3: Implementar**
```jsx
{/* Etapa 34 — anexos da requisição (desenho, documento). Mesmo molde dos dois blocos aditivos
    acima (Separação `:973`, Assinaturas `:1007`): leitura junto da requisição, sem gate novo.
    `detalhe.id` e NÃO `selectedId`: o segundo vem da URL e existe antes de o detalhe carregar,
    o que dispararia a consulta com o painel ainda vazio. */}
<div style={{ marginTop: 16 }}>
  <AnexosDocumento entidade="requisicao" entidadeId={detalhe.id} titulo="Anexos" />
</div>
```
- [x] **Step 4: Rodar e ver passar**
- [x] **Step 5: CONTROLE POSITIVO** — troque `entidade="requisicao"` por `entidade="material"`:
      tem de cair pelos `params`.

      **E trave a distinção `detalhe.id` vs `selectedId` em vez de declará-la como furo** — é o
      conserto barato que a Fase 2 achou e que a versão anterior deste plano não viu (ela mandava
      "registrar que a suíte não protege", o que faria a próxima sessão caçar um risco inexistente).
      Force a divergência **na fixture**, sem tocar em produção: num cenário próprio, faça
      `/almoxarifado/requisicoes/55` (`RequisicoesList.test.js:78`) devolver
      `{ ...baseRequisicao('APROVADO'), id: 555 }` e afirme
      `{ entidade: 'requisicao', entidade_id: 555 }`. Com `detalhe.id` fica verde; com `selectedId`
      (55) fica vermelho. Uma linha, e documenta "o bloco lê do detalhe carregado, não da URL".
- [x] **Step 6: Commit** — feito: `d5578e6` (achado: abrir detalhe pelo clique carrega 2x — pré-existente, `syncSearchParams` reacende o deep-link; o cenário RN-02 afirma `anexos === cargas do detalhe`)

---

### Task 6: Recebimento — o bloco inline e a suíte que não existe  **(galho)**

**Files:**
- Modify: `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js` (import; inserir no fim
  do painel de detalhe, **depois** do banner de contas a pagar `:577-582`)
- Create: `client/src/components/almoxarifado/RecebimentosAlmoxarifado.test.js`

**Interfaces:** consome `AnexosDocumento` direto, chave **`recebimento`**.

**Esta é a maior task da etapa, e a razão é medida:** `RecebimentosAlmoxarifado.js` tem 799 linhas
e **nenhum arquivo de teste** — varredura do repositório inteiro confirma. Não há mock a herdar.

**Pontos de atenção medidos:**
1. O painel é `{detalhe && (...)}` (`:484`), carregado por `abrirDetalhe(id)` (`:110-114`).
   `entidadeId={detalhe.id}`.
2. **O `id` também existe logo após o POST**: `handleCriar` faz `abrirDetalhe(res.data.id)` em
   `:303`. Ou seja, quem acabou de registrar um recebimento cai no painel e **já pode anexar a nota
   fiscal** — é o caso de uso real, e merece cenário.
3. A tela **não renderiza foto** (grep vazio) — o ponto de atenção da Etapa 33 não se aplica.
4. O molde é `HistoricoInspecoes.test.js` — e são **quatro** faixas, não uma (correção da Fase 2,
   que mediu duas dependências obrigatórias que a citação original omitia):
   - **`:18` e `:103` — `MemoryRouter`.** `RecebimentosAlmoxarifado.js:6` renderiza
     `AlmoxPageHeader`, que usa `<Link>` incondicional (`AlmoxPageHeader.js:2,13,20`). **Sem o
     wrapper a suíte nova nem monta** — e o erro apareceria como falha do cenário, não da fiação.
   - **`:33` — `jest.mock('../../hooks/useAlmoxPermissoes')`.** `RecebimentosAlmoxarifado.js` não
     importa o hook, mas o `AnexosDocumento` importa. Com o fallback que rejeita (abaixo), o hook
     real dispararia `/almoxarifado/minhas-permissoes` contra uma rejeição.
   - **`:85-95` — o `api.get.mockImplementation`.**
5. **Escreva o fallback que REJEITA** (`Promise.reject(new Error('URL inesperada no teste: ' + url))`)
   e liste as rotas explicitamente: `/almoxarifado/recebimentos`, `/almoxarifado/recebimentos/:id`,
   `/almoxarifado/materiais`, `/almoxarifado/recebimentos-aux/pedidos-compra`,
   `/almoxarifado/recebimentos-aux/fornecedores` (`RecebimentosAlmoxarifado.js:77,94,102,103,113`)
   **e `/almoxarifado/anexos`** — exatamente como `HistoricoInspecoes.test.js:91` faz, com o
   comentário do porquê. É a suíte nova, então não há legado a preservar, e o fallback que resolve
   é exatamente o que deixa esta etapa cega nas outras quatro telas.

6. ⚠️ **O mock precisa de igualdade + regex, nunca `startsWith`.** `/almoxarifado/recebimentos` é
   **prefixo** de `/almoxarifado/recebimentos/:id` (`:77` e `:113`). Com `startsWith`, `abrirDetalhe`
   recebe o **array da lista**, `setDetalhe([...])`, o painel renderiza sem `id`, e o `Number()` de
   `AnexosDocumento.js:124` manda `entidade_id: NaN`. Use
   `url === '/almoxarifado/recebimentos'` e `/^\/almoxarifado\/recebimentos\/\d+$/.test(url)`,
   nessa ordem — molde `AnexosDocumento.test.js:112-125`.
7. ⚠️ **O fallback que rejeita NÃO é ruidoso nesta tela — a Fase 2 mediu.** Os três `catch` de
   `RecebimentosAlmoxarifado.js:74-84`, `:92-96` e `:99-108` **engolem** a rejeição (o `toast` é
   mockado). Com uma URL mal escrita no mock, `recebimentos` fica `[]`, a tela renderiza
   `"Nenhum recebimento registrado"` (`:447-455`), e os cenários (a) e (d) passam **com a tela
   vazia**. Por isso o (a) tem de **contar linhas** e o (d) tem de ter metade positiva.

- [x] **Step 1: Criar o arquivo com os cenários** — mínimo 4, com as correções da Fase 2:
      **(a)** a lista renderiza — e **conta linhas**:
      `expect(container.querySelectorAll('.almox-table tbody tr')).toHaveLength(<n da fixture>)`,
      nunca só "renderizou sem erro";
      **(b)** clicar numa linha abre o painel;
      **(c)** o painel mostra `anexos-documento` e consulta
      `{ entidade: 'recebimento', entidade_id: <id> }` — **use um id que não seja 1 nem o primeiro
      da fixture** (regra (i)), mais `toHaveLength(1)` da regra (ii);
      **(d)** a lista sozinha não consulta anexos — **com a metade positiva no mesmo teste**:
      depois do `not.toHaveBeenCalledWith`, clicar uma linha e afirmar que passou a chamar.
- [x] **Step 2: Rodar e ver falhar**
- [x] **Step 3: Implementar o plug**
- [x] **Step 4: Rodar e ver passar**
- [x] **Step 5: CONTROLE POSITIVO** — duas sabotagens:
      **(a)** troque a chave; tem de cair pelos `params`.
      **(b)** ⚠️ **A sabotagem original ("remova o `{detalhe && ...}` do painel") estava errada e a
      Fase 2 pegou** — sem a guarda, o corpo desreferencia `detalhe.numero` (`:487`) no primeiro
      render e lança `TypeError`, derrubando os **quatro** cenários juntos. Isso viola a regra (iii)
      do topo: sabotagem que quebra tudo não prova nada. **Sabote só o bloco:** tire o
      `<AnexosDocumento>` de dentro de `{detalhe && ...}` e pendure-o na lista, logo depois do
      `</table>` (`:558`), com `entidadeId={recebimentos[0]?.id}`. Aí (a), (b) e (c) continuam
      verdes e **o (d) cai sozinho** — que é o que a RN-02 precisa provar.
- [x] **Step 6: Commit** — feito: `01dd3ce` (6 cenários, não 4: (e) troca de linha → última chamada é o 2º id; (f) o formulário É dirigível no harness e cobre o pós-criação. Divergência: a sabotagem (b) derruba (c) **e** (d), porque (c) fixa `painel().contains(bloco)` — guarda mais forte que o plano supunha)

---

### Task 7: Integração — as cinco chaves contra o mapa do servidor  **(sequencial)**

**Files:**
- Create: `client/src/components/almoxarifado/anexosEntidades.test.js`

**Por que este teste existe.** Cada task prova a **sua** chave. Nenhuma prova que as cinco, juntas,
são exatamente as que o servidor aceita — e a chave é escolhida no client, então uma errada só
apareceria em produção como 400 *"Entidade inválida para anexo"*. É o cruzamento de galhos que a
Fase 3 exige, e a forma é a mesma que `permissaoErro.test.js:45-46` já usa nesta base: **importar
o módulo do servidor no teste do client**, com guarda-da-guarda.

- [x] **Step 1: Escrever o teste**

```jsx
const fs = require('fs');
const path = require('path');

// Molde medido: `client/src/utils/permissaoErro.test.js:45-46` importa o modulo do SERVIDOR para
// que a lista deixe de ser escrita a mao. Aqui vale o mesmo: se o mapa mudar, este teste cai.
// eslint-disable-next-line global-require, import/no-unresolved
const { ENTIDADES_ANEXO } = require('../../../../server/services/almoxarifado/anexoService');

const TELAS = {
  'MateriaisAlmoxarifado.js': 'material',
  'RequisicoesList.js': 'requisicao',
  'RecebimentosAlmoxarifado.js': 'recebimento',
  'DevolucoesAlmoxarifado.js': 'devolucao',
  'RemessasTerceirosAlmoxarifado.js': 'item_remessa',
  'HistoricoInspecoes.js': 'inspecao',      // a consumidora da Etapa 32, para fechar as SEIS
};

test('guarda da guarda: o mapa do servidor foi mesmo importado', () => {
  // Sem isto, um import quebrado devolveria `undefined` e todo o resto passaria provando nada —
  // e essa e a forma exata de teste vazio que esta base ja pagou quatro vezes.
  expect(Object.keys(ENTIDADES_ANEXO || {}).length).toBe(6);
});

test('as seis telas usam chaves que o servidor aceita, e cobrem o mapa inteiro', () => {
  const dir = __dirname;
  const usadas = new Set();
  for (const [arquivo, esperada] of Object.entries(TELAS)) {
    const src = fs.readFileSync(path.join(dir, arquivo), 'utf8');
    const achadas = [...src.matchAll(/entidade=["']([a-z_]+)["']/g)].map((m) => m[1]);
    expect(achadas.length).toBeGreaterThan(0);          // metade positiva: o plug existe
    for (const chave of achadas) {
      expect(Object.keys(ENTIDADES_ANEXO)).toContain(chave);   // e valida no servidor
      usadas.add(chave);
    }
    expect(achadas).toContain(esperada);                // e e a chave DAQUELA tela
  }
  // Nenhuma entidade do mapa ficou sem tela — e a Etapa 34 existe justamente para isso.
  expect([...usadas].sort()).toEqual(Object.keys(ENTIDADES_ANEXO).sort());
});
```

- [x] **Step 2: Rodar e ver passar**
- [x] **Step 3: CONTROLE POSITIVO — quatro sabotagens, e a nº 4 é a que interessa**

| # | Sabotagem | O que TEM de cair |
|---|---|---|
| 1 | trocar uma chave por **`"material_x"`** (inválida, **toda minúscula**) | `toContain(chave)` — o ramo que valida contra o mapa do servidor |
| 2 | trocar a chave de Devoluções por `"material"` (chave **válida**, tela errada) | `expect(achadas).toContain('devolucao')` |
| 3 | apagar o plug de uma tela | `achadas.length > 0` |
| 4 | apagar uma entrada de `ENTIDADES_ANEXO` no servidor | a guarda-da-guarda (`=== 6`) |

⚠️ **A sabotagem nº 1 dizia `"materialX"` e estava ERRADA — a Fase 2 pegou.** A regex é
`/entidade=["']([a-z_]+)["']/g`: `[a-z_]+` não casa o `X` maiúsculo e a classe exige a aspa
**imediatamente** depois, então `entidade="materialX"` não dá match nenhum. `achadas` sairia `[]` e
o teste morreria em `achadas.length > 0` — **a mesma asserção da sabotagem nº 3**, deixando o ramo
`toContain(chave)` sem controle positivo nenhum. Com `"material_x"` (minúscula) o match acontece,
`length > 0` passa, e a falha cai onde deve.

A nº 2 é a que separa este teste de um `grep`: chave **válida** na tela **errada** passa por
qualquer varredura de validade e só falha em produção.

⚠️ **A nº 4 é a ÚNICA exceção autorizada à Global Constraint "nenhuma alteração em `server/`"** —
ela existe para provar a guarda-da-guarda, e sem ela um import quebrado devolveria `undefined` e
todo o resto passaria provando nada. Regras: temporária, `md5sum` antes/depois, `git diff --stat`
de volta vazio, e **não rode a suíte do servidor enquanto ela estiver aplicada** (o
`deepStrictEqual` que congela o mapa quebraria e viraria ruído).

- [x] **Step 4: Suíte completa e fechamento** — feito em `656467c`: api 169/169 arquivos · almoxarifado 42/42 · validation 4, safealter 3, sqlite 5 · client 46 suítes / 686 testes · build limpo — os cinco comandos da `fechar-etapa`, números reais.

---

## Self-review do plano

- **Cobertura da spec:** RN-01 → Tasks 1 (casca), 4 (itens novos) e 5 (rascunho); RN-02 → cenário
  negativo-com-metade-positiva nas Tasks 2, 3, 4 e 6; RN-03 → Task 2 (o comentário do porquê) e
  Task 1 (a casca não decide permissão); RN-04 → Task 7; RN-05 → Task 4, sabotagem (a).
- **Sem placeholders:** todo passo de código tem o código.
- **Consistência de tipos:** `AnexosModal` é declarado uma vez (Task 1) e consumido com os mesmos
  cinco nomes de prop nas Tasks 2, 3 e 4. As Tasks 5 e 6 **não** o usam — usam `AnexosDocumento`
  direto, com as quatro props da Etapa 32.

---

## Fase 2 — o que a revisão do plano pegou ANTES de executar

Dois revisores frescos em paralelo, lentes distintas (o código pronto do plano roda? / este teste
passaria com a feature quebrada?). **14 achados, 0 ruído.** Placar: **2 travariam a execução**,
**9 deixariam passar defeito silencioso**, 3 menores. Tudo reproduzido lendo ou rodando código.

### Os dois que travariam

1. **Os nomes dos helpers de montagem eram inventados.** O plano usava `montarLista()`,
   `montarComDetalhe()` e `montar()`; nos cinco arquivos o helper chama-se **`renderizar`**
   (`MateriaisAlmoxarifado.test.js:121`, `Devolucoes:83`, `RemessasTerceiros:117`,
   `RequisicoesList:95`, `AnexosDocumento:142`). Seriam quatro `ReferenceError` — e o veneno é que
   **cada task manda "rodar e ver falhar"**: a falha esperada viria substituída pelo
   `ReferenceError`, e o executor poderia aceitá-la como "falhou como previsto". É assim que o
   vermelho vira ruído.
2. **A fixture da Task 4 tem UM item, e o cenário exigia dois.** `DETALHE_1.itens` tem só o
   `id: 11` (`RemessasTerceirosAlmoxarifado.test.js:53-61`); `LISTA[0].itens_total: 2` é o contador
   da linha da lista, não o array. O executor degradaria o cenário para 1 item — perdendo
   justamente a demonstração de "N itens ⇒ 0 requisições" que a RN-02 existe para provar.

### O achado que mais ensina: quatro das sabotagens não sabotavam

Esta base tem três casos documentados de sabotagem que derruba o cenário certo **pela asserção
errada**, deixando o achado sem prova. A revisão achou **quatro** de uma vez neste plano:

- **Task 7, nº 1:** a régua é `/entidade=["']([a-z_]+)["']/g`, e a sabotagem prescrita era
  `"materialX"`. `[a-z_]+` **não casa maiúscula**, então não haveria match, `achadas` sairia `[]` e
  o teste morreria em `achadas.length > 0` — **a mesma asserção da sabotagem nº 3**. O ramo que
  valida a chave contra o mapa do servidor ficaria **sem controle positivo nenhum**. Corrigida para
  `"material_x"`.
- **Task 4, (b):** "mover o bloco para fora do `{aberta && ...}`" é **no-op** — o modal é montado
  sob `{anexosItem && ...}`, condicionado ao **estado**, e com `anexosItem === null` não renderiza
  dentro nem fora. Verde nos dois casos, e a regra do harness mandaria o executor "consertar" um
  cenário saudável.
- **Task 6, (b):** remover o `{detalhe && ...}` faz o corpo desreferenciar `detalhe.numero`
  (`:487`) e lançar `TypeError` no primeiro render — **os quatro cenários caem juntos**, e nenhum
  provou nada. Virou regra geral no topo do plano: *sabotagem que quebra tudo não é controle
  positivo*.
- **Task 1, nº 1:** o plano prometia que ela cairia "pela asserção do `querySelector` **e** pela do
  `api.get`". A segunda metade é **falsa** — a guarda própria de `AnexosDocumento.js:117` já barra
  a requisição, então aquela asserção nunca cai. Reportar as duas seria reportar cobertura
  inexistente.

### O defeito silencioso mais caro: `entidade_id: 1` não distingue nada

Nenhuma tela testava um id que não fosse "o primeiro da fixture, que por acaso é 1". Um plug com
`entidadeId={materiais[0].id}`, com `entidadeId={1}` literal, ou com estado obsoleto que reabre
sempre o primeiro registro **passaria em todos os cenários do plano**. Em produção o usuário clica
o clipe da 3ª linha e recebe os anexos do 1º material — **sem 400, sem erro**, que é o defeito mais
caro possível num módulo de documentos.

Virou a **regra (i)** do topo: nunca testar com id 1 nem com o primeiro da fixture; onde a fixture
já tem id alto usá-lo (Materiais tem `3`, Remessa `11`, Requisição `55`), onde não tem
**acrescentar** (Devoluções ganhou `id: 42`); e onde der, abrir o primeiro, fechar, abrir o
terceiro e afirmar que a **última** chamada é a do terceiro — o único jeito de pegar estado
obsoleto.

### Os outros silenciosos, agrupados

- **A RN-02 dizia "uma requisição" e nada contava chamadas.** `toHaveBeenCalledWith` é satisfeito
  por 1, 2 ou 10 — e o debounce de 350 ms de Materiais re-renderiza a lista com o modal aberto.
  Virou a regra (ii): todo positivo leva `filter(([u]) => u === '/almoxarifado/anexos')` com
  `toHaveLength(1)`.
- **O fallback que rejeita NÃO é ruidoso na tela de Recebimentos.** Os três `catch` de
  `RecebimentosAlmoxarifado.js:74-84`, `:92-96`, `:99-108` **engolem** a rejeição, a tela renderiza
  "Nenhum recebimento registrado", e os cenários (a) e (d) passariam **com a tela vazia** — a forma
  exata de teste vazio que esta etapa diz combater. O (a) passou a contar linhas; o (d) ganhou
  metade positiva.
- **`/almoxarifado/recebimentos` é PREFIXO de `/almoxarifado/recebimentos/:id`.** Um mock com
  `startsWith` faria `abrirDetalhe` receber o array da lista, e o `Number()` de
  `AnexosDocumento.js:124` mandaria `entidade_id: NaN`. Igualdade + regex, nessa ordem.
- **O `columns={8}→{9}` do esqueleto ficaria sem cobertura para sempre** — o arquivo não tem
  nenhuma referência a `SkeletonTable`, `columns` ou contagem de `<th>`. Ganhou cenário que amarra
  as duas pontas (`.skeleton-table-header-cell` × `thead th`) sem fixar número nenhum.
- **O `<h3>` do modal.** Os **44** cabeçalhos de modal desta base usam `<h2>`, e o CSS estiliza só
  `.almox-modal-header h2` (`Almoxarifado.css:432`). Com `h3` o título cai no `margin: 1em 0` do
  navegador e desalinha o `✕` — e nenhum cenário do plano olhava a tag.
- **A citação do molde da Task 6 omitia duas dependências obrigatórias:** o `MemoryRouter` (sem ele
  a suíte nova **nem monta**, porque `AlmoxPageHeader` usa `<Link>` incondicional) e o mock do
  `useAlmoxPermissoes`.
- **A sabotagem nº 4 da Task 7 violava a Global Constraint do próprio plano** ("nenhuma alteração
  em `server/`"). Ficou declarada como a única exceção autorizada, com o cuidado de não rodar a
  suíte do servidor enquanto aplicada.

### E uma justificativa MINHA que era impossível

O plano afirmava que usar `selectedId` em vez de `detalhe.id` "dispararia a consulta com o painel
ainda vazio". **Não pode acontecer:** o ponto de inserção está dentro do ramo `else` de
`RequisicoesList.js:874`, então o bloco não renderiza enquanto `detalhe` for `null`; e o `catch` de
`abrirDetalhe` (`:246-252`) zera os dois juntos. Não existe estado alcançável em que divirjam.

Pior: o plano mandava **registrar isso como furo de cobertura**, o que faria a próxima sessão
gastar tempo caçando um risco inexistente. E havia um conserto barato que eu não tinha visto —
forçar a divergência **na fixture** (`id: 555` no detalhe, `55` na URL), que trava a distinção com
uma linha e sem tocar em produção.

### O que os dois confirmaram, e sustenta o plano

O teste de integração da Task 7 **roda** — verificado por execução, não por dedução: o `require` de
quatro níveis resolve, `anexoService.js:199-201` exporta `ENTIDADES_ANEXO` com as seis chaves, e a
cadeia não puxa `sqlite3` (`db.js` é promisificação pura, `audit.js` só requer `./db`). O
precedente `permissaoErro.test.js` foi **rodado**: 9 passed. A regex foi medida contra
`entidade={variavel}` — ignora a forma com chaves, sem falso negativo para as chaves literais. As
cinco classes CSS do modal existem. Nenhum `data-testid` colide. Acrescentar coluna não quebra
suíte nenhuma (`linhasDetalhe()` conta linhas; `celula()` usa `data-col`). A forma dos `params` que
o plano assere é exatamente a de `AnexosDocumento.js:124`. Baseline dos seis arquivos tocados:
**6 suítes / 93 testes**, verde.

---

## Fase 4/5 — Integração e revisão adversarial (2026-09-16)

As sete tasks foram aprovadas **de primeira** na revisão de task (zero rodadas de correção por
task). A revisão final rodou com **três revisores em paralelo**, lentes distintas e sem conversa
entre eles:

| Revisor | Lente |
|---|---|
| 1 | **O gate da Task 7** — o teste de integração prova mesmo que as seis chaves do client batem com `ENTIDADES_ANEXO`, ou é vacuidade com outra roupa? |
| 2 | **Regras de negócio e vacuidade** — RN-01 a RN-05 realmente travadas; cenário negativo com metade positiva; contagem de chamadas |
| 3 | **Autorização e UX** — quem vê o botão, quem consegue agir, e o que a tela faz quando o backend nega |

**5 achados, 0 ruído** (nenhum não reproduzido). Os dois Important estavam em caminhos que
**nenhum teste exercitava** — não era asserção fraca, era ausência de cenário.

1. **IMPORTANT (dois revisores acharam, independentes) — o bloco da requisição nascia SEM gate de
   `warehouseMode`.** `RequisicoesList.js` é a mesma tela de `/almoxarifado/requisicoes` e de
   `/<modulo>/requisicoes-material` em **seis** módulos (comercial, frota, compras, financeiro,
   fábrica, engenharia), que **não** têm permissão do módulo almoxarifado. Fora do almoxarifado,
   abrir o painel disparava `GET /api/almoxarifado/anexos`, que está atrás de
   `checkModulePermission('almoxarifado')`: **403 "Acesso negado ao módulo"** em vermelho dentro do
   painel, formulário de upload **morto** (o hook de `minhas-permissoes` falha **aberto** de
   propósito) e **uma linha de auditoria de acesso negado por painel aberto**. Todos os outros
   blocos daquele painel já eram gateados (`RequisicoesList.js:976`, `:1047`, `:1066`) — o novo era
   a exceção.
2. **IMPORTANT — o corpo dos dois painéis desmonta a cada refetch.** `RequisicoesList.js:876` e
   `RecebimentosAlmoxarifado.js:496`: o bloco nasceu **dentro** do ternário de `loadingDetalhe`.
   Qualquer refetch — foco da janela (**que é exatamente o que acontece ao FECHAR o diálogo de
   escolher arquivo**), troca de filtro, ação de workflow ou fiscal — volta ao estado
   "Carregando…", desmonta o bloco e leva junto o arquivo recém-escolhido no seletor, mais um
   `GET /almoxarifado/anexos` a cada volta.
3. **MINOR — o teste de integração da Task 7 lê TEXTO.** Um plug **comentado** continua casando com
   a regex. Quem guarda o plug de verdade são os testes de montagem por tela; o de integração
   guarda só a **coerência das chaves**.
4. **MINOR (parked, → letra F) — o 10º ícone de Materiais pode ficar clipado.** `.almox-actions`
   (`Almoxarifado.css:305`) não tem `flex-wrap` e `.almox-table-container` (`:167`) é
   `overflow: hidden`; numa faixa de largura de desktop (≈769px até a largura em que a tabela
   cabe) o ícone pode sair do contêiner. **Pré-existente**, agravado pelo clipe novo, e o
   breakpoint **NÃO foi medido** — não há navegador neste ambiente. Parked de propósito: mudar o
   CSS de todas as tabelas do módulo sem medir é pior que a falha.
5. **MINOR (parked) — o bloco da requisição ficava acima dos botões de ação.** Resolvido **de
   graça** pelo fix do achado 2: fora do ternário, o bloco cai depois de tudo.

### A onda única de correção — três commits, e o que cada um PROVA

| Commit | Achado | O que o cenário novo prova |
|---|---|---|
| `a88d715` | 1 | Cenário `warehouseMode: false` — o painel abre (**metade positiva**: `REQ-055` na tela, `GET /requisicoes-material/55` feito), e **nada** vai para `/almoxarifado/anexos`: bloco ausente e contagem 0 |
| `c5d9e99` | 2 (e 5) | **Identidade do nó DOM** antes e depois do refetch (é o **mesmo** elemento, não um recriado) **e** contagem de `GET /almoxarifado/anexos` `=== 1`. Com isso a **regra (ii) estrita** — uma consulta por painel aberto — voltou a valer também no cenário do clique de `RequisicoesList`, onde antes o comentário precisava relaxá-la para "uma por carga do detalhe" |
| `054f727` | 3 | Nada de novo no código: um comentário no teste de integração dizendo **o que ele não prova**, para que a próxima sessão não o trate como guarda do plug |

### Teste VAZIO pego antes do commit — o 5º caso documentado nesta base

O cenário **(g)** de `RecebimentosAlmoxarifado.test.js` ("refetch por ação de workflow não desmonta
o bloco nem repete a consulta") **passou de primeira contra a colocação ANTIGA** — isto é, provava
nada. Causa: o `act` coalescia o commit de `loadingDetalhe = true` com o da resposta, e a janela em
que o painel mostra "Carregando…" **nunca chegava ao DOM**; o nó nunca era desmontado porque o
React nunca renderizou o estado intermediário. A solução foi **adiar o GET do refetch** (resolver a
promessa só depois da asserção), tornando a janela observável. Só então a colocação antiga ficou
vermelha e a nova, verde. Regra que fica: **quando o cenário mede montagem/desmontagem, quem decide
se o teste é vazio é o agendamento, não a asserção.**

### Defeitos PRÉ-EXISTENTES descobertos (não são desta etapa, e continuam abertos)

- **`RequisicoesList.js` — abrir o detalhe pelo CLIQUE carrega a requisição 2x.** `abrirDetalhe`
  chama `syncSearchParams`, que reescreve `?id=`, e isso reacende o efeito de deep-link
  (`:166-181`), que chama `abrirDetalhe` de novo. **Dois `GET` de detalhe por clique**, desde que o
  deep-link existe. Com `c5d9e99` o bloco de anexos não remonta mais, mas o detalhe continua vindo
  2x. → **item (a) da Etapa 35**.
- **`RecebimentosAlmoxarifado.js` — os três `catch` de carga engolem o erro.**
  `loadRecebimentos` (`:72-85`) só dispara um toast e cai no estado vazio; `loadMateriais`
  (`:93-97`) e `loadAuxiliares` (`:99-108`) têm `catch { /* ignore */ }` literal. Falha de rede ou
  500 aparece ao operador como **"Nenhum recebimento registrado"** — o mesmo pecado que a Etapa 29
  corrigiu em `HistoricoInspecoes`. Modal fiscal, workflow e etiquetas desta tela seguem sem teste.
  → **item (b) da Etapa 35**.
- **Três arquivos grandes**, sem falha concreta — nota de manutenção:
  `RemessasTerceirosAlmoxarifado.js` ≈1015 linhas com 5 modais, `RequisicoesList.js` ≈1575,
  `RecebimentosAlmoxarifado.js` ≈814.

### A Global Constraint "nenhuma alteração em `server/`" NÃO foi contradita

Ela fica como está escrita. A Task 7 **lê** `server/` (o `require` de `ENTIDADES_ANEXO`) e o
controle positivo dela sabotou o mapa do servidor **temporariamente**, restaurando-o — dois usos
que o próprio plano autoriza. O que vale é o resultado, e ele foi medido:
`git diff --stat 746a106^..054f727 -- server/` volta **vazio**.

---

## Fechamento — números medidos

Os cinco comandos da skill `fechar-etapa`, rodados **depois** da onda de correção, com os números
lidos da saída:

| Comando | Resultado |
|---|---|
| `cd server && npm run test:api` | **169/169 arquivos OK** |
| `cd server && npm run test:almoxarifado` | **42 passou, 0 falhou** |
| `cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite` | **4/4 · 3/3 · 5/5** |
| `cd client && CI=true npx react-scripts test --watchAll=false` | **46 suítes / 690 testes**, todos passando |
| `cd client && CI=true npx react-scripts build` | compilou **sem warning virar erro** |

Na Task 7 o client marcava **686** testes; a onda de correção acrescentou **4** cenários — daí 690.

---

## Retro de 4 números

1. **Rodadas de correção até verde: 0 por task** — as 7 tasks passaram de primeira na revisão de
   task — e **1 onda** de correção depois da revisão final, com 3 commits (`a88d715`, `c5d9e99`,
   `054f727`).
2. **Achados da revisão final: 5** — 2 Important **reais** e 3 Minor; **ruído (não reproduzido):
   0**. O dado que mais ensina: **os dois Important estavam em caminhos que nenhum teste
   exercitava** (`warehouseMode: false`, foco da janela, refetch pós-ação) — não foram asserções
   fracas, foram cenários ausentes.
3. **Paralelismo: 0 galhos em paralelo.** Foi decisão **medida** do plano (mesma árvore, jest/CRA
   compartilhados) e não omissão. Os **revisores** rodaram em paralelo, 3 de uma vez. **Nenhum
   retrabalho por paralelismo.**
4. **Defeito que escapou do fechamento: a preencher na Etapa 35.**

---

## Próxima tarefa detalhada — Etapa 35

**Tema:** o que a revisão da 34 achou nas telas vizinhas. Três itens, todos **pré-existentes**,
todos medidos com `file:line`, **nenhuma linha de servidor** e **nenhuma mudança de contrato de
API** — por isso cabem numa etapa só.

### (a) `RequisicoesList.js` — o clique carrega o detalhe 2x

- **Hoje:** `abrirDetalhe` chama `syncSearchParams`, que reescreve `?id=` na URL; isso reacende o
  efeito de deep-link em **`RequisicoesList.js:166-181`**, que chama `abrirDetalhe` de novo. Dois
  `GET /almoxarifado/requisicoes/:id` por clique.
- **Régua (o teste que hoje passa COM o defeito):** `RequisicoesList.test.js:528`, cenário *"RN-02:
  sem detalhe aberto não consulta anexos; abrir a requisição consulta"*. Ele já exercita o caminho
  do clique e já trava a contagem de **anexos** em `=== 1`. O que ele **não** conta é o `GET` do
  **detalhe** — hoje **2**, fato registrado no comentário do próprio cenário. **Endurecer é
  acrescentar `api.get.mock.calls.filter(([u]) => u === '/almoxarifado/requisicoes/55')` com
  `toHaveLength(1)`**; esse `expect` tem de ficar **vermelho antes** do conserto — se ficar verde de
  primeira, o cenário não está passando pelo caminho do clique e o teste é vazio.
- **Molde do conserto (reversível, sem contrato novo):** um `ref` com o "último id aberto" lido
  dentro do efeito de deep-link, ou marcar a navegação como **interna** antes de chamar
  `syncSearchParams`. Não trocar o deep-link por outra coisa.
- **Já pronto, não reabrir:** o cenário do clique existe e mede; os cenários de deep-link (URL
  colada) existem e hoje carregam **1x** — são a metade positiva que impede "consertar" matando o
  deep-link. O bloco de anexos já saiu do ternário de loading (`c5d9e99`).
- **Pontos de atenção:** o deep-link tem **dois consumidores** (URL colada e clique) e o cenário de
  URL colada **tem de continuar carregando 1x**; e o cenário RN-02 já afirma a contagem de anexos
  `=== 1` — ela não pode regredir.

### (b) `RecebimentosAlmoxarifado.js` — os três `catch` silenciosos viram erro visível

- **Hoje:** `loadRecebimentos` (**`:72-85`**) chama `toast.error('Erro ao carregar recebimentos')`
  e cai no estado vazio; `loadMateriais` (**`:93-97`**) e `loadAuxiliares` (**`:99-108`**) têm
  `catch { /* ignore */ }` literal. Rede caída ou 500 aparece como **"Nenhum recebimento
  registrado"** — indistinguível de "não há recebimento".
- **Régua (pronta desde a Task 6):** o mock de `api.get` de `RecebimentosAlmoxarifado.test.js` tem
  **fallback que REJEITA** (`:126` e `:133`) — basta um cenário "a rede falha" que hoje vê "Nenhum
  recebimento registrado" e passa a ter de ver a **mensagem de erro**.
- **Molde:** `HistoricoInspecoes` depois da Etapa 29 — estado de erro no componente, com botão de
  tentar de novo se couber.
- **Já pronto, não reabrir:** a suíte da tela existe (7 cenários) e o harness de fixtures também;
  nada do bloco de anexos precisa ser tocado.
- **Ponto de atenção que mata o cenário se ignorado:** **o `toast` é mockado nos testes** — um
  conserto que só melhore o toast passa despercebido e não ajuda o operador. A mensagem tem de ir
  para o **DOM**, e o cenário tem de afirmar o texto renderizado, não a chamada do toast. Vale a
  metade positiva no mesmo teste (a tela montou, o cabeçalho está lá), senão "não mostra a lista"
  passa com a tela vazia.

- **Terceiro item, achado na re-revisão da onda de correção (parked, minor):** `abrirDetalhe`
  (`:111-141`) **nunca anula `detalhe`**, nem ao **trocar de linha**. Com o bloco de anexos fora do
  ternário de loading (fix `c5d9e99`), durante a carga do recebimento B o bloco continua mostrando
  os anexos de A — mesmo padrão pré-existente do cabeçalho do painel. Janela pequena (latência da
  rede), mas nela um arquivo escolhido "para A" seria enviado a B. Conserto no mesmo molde de
  `RequisicoesList.js:227-235` (anular `detalhe` quando o id muda), com cenário: clicar A, clicar B
  com o GET de B em suspenso, afirmar que o bloco de A **sumiu** antes de B chegar.

### (c) Verificação manual do clipe de Materiais entre 769px e ≈1100px (letra F)

- **Hoje:** `.almox-actions` (`Almoxarifado.css:305`) sem `flex-wrap`, `.almox-table-container`
  (`:167`) com `overflow: hidden`, e Materiais passou a ter **10** ícones na coluna de ações.
- **O que fazer:** abrir no navegador e varrer a faixa; **se** clipar, `flex-wrap: wrap` em
  `.almox-actions`, com **screenshot antes/depois**.
- **Por que não foi feito na 34:** o breakpoint não é dedutível sem renderizar, e mudar o CSS de
  todas as tabelas do módulo sem medir troca um defeito possível por um certo.
- **Ponto de atenção:** a mesma classe é usada por **todas** as tabelas do módulo — o antes/depois
  precisa incluir pelo menos mais uma tela além de Materiais.
