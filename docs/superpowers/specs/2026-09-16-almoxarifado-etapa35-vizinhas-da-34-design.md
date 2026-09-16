# Etapa 35 — O que a revisão da 34 achou nas telas vizinhas (design)

**Data:** 2026-09-16 · **Módulo:** almoxarifado · **Features tocadas:** 04 (requisições), 08
(recebimento) e o CSS compartilhado das tabelas do módulo (11 telas)

**Medição de base:** `.superpowers/sdd/etapa35-fase0-medicao.md` (HEAD `cd6d2ee`, só leitura).
**Onde a medição corrige o plano da 34, vale a medição** — e onde ela corrige a si mesma ou a
proposta do controlador, está registrado aqui como decisão, com o descartado.

## O problema, em uma frase

A revisão adversarial da Etapa 34 achou **cinco** coisas; duas eram defeitos da própria etapa e
foram corrigidas na hora (`a88d715`, `c5d9e99`). As outras três são **pré-existentes, em telas
vizinhas**: uma requisição aberta pelo clique é buscada **duas vezes**, uma falha de rede em
Recebimentos aparece ao operador como **"Nenhum recebimento registrado"**, e a coluna de ações das
tabelas do módulo **não quebra linha** dentro de um contêiner que **corta** o que sobra.

Nenhuma delas é de servidor. **Zero linha de `server/`, zero mudança de contrato de API, zero
mudança em `ACAO_PERFIS`.** É por isso que as três cabem numa etapa só.

## Fase 0 — o que a medição achou, e o que ela derrubou

### O que estava certo no plano da 34

| Afirmação | Confirmado em |
|---|---|
| dois `GET /almoxarifado/requisicoes/:id` por clique | traçado `RequisicoesList.js:812 → :246 → :167-181 → :179 → :239` |
| deep-link puro carrega 1x | `:167-181` + `fromUrl` bloqueando `:246` |
| `loadRecebimentos` cai no estado vazio | `RecebimentosAlmoxarifado.js:80-82` + `:47` (`useState([])`) |
| `abrirDetalhe` de Recebimentos nunca anula `detalhe` | `RecebimentosAlmoxarifado.js:111-143` |
| `.almox-actions` sem `flex-wrap` e `.almox-table-container` com `overflow: hidden` | `Almoxarifado.css:305-309` e `:167-174` (`:171`) |
| Materiais tem 10 botões na coluna de ações | `MateriaisAlmoxarifado.js:312-371` |
| o `toast` é mockado nas duas suítes → conserto que só melhore o toast é invisível | `HistoricoInspecoes.test.js:28-30`, `RecebimentosAlmoxarifado.test.js:42-44` |

### O que a medição derrubou (e vale a medição)

- **A guarda que evitaria o defeito (a) já está escrita e nunca é exercida.**
  `RequisicoesList.js:229` é `if (!force && loadedDetalheIdRef.current === id) return null;` — e
  **nenhum** call site passa `force: false`. É código morto hoje. O plano da 34 não nomeia isso, e
  é o fato que decide o desenho: **não é preciso inventar proteção, é preciso que quem consulte a
  proteção seja o efeito de deep-link, e não o clique**.
- **O `force` não existe para o clique.** `git log -S"force"` devolve `1339601` (o commit que criou
  o arquivo) como origem: o `force` **nasceu junto** com a tela e os commits posteriores (`afff10f`,
  `75b5d3d`) só acrescentaram call sites. Ele serve ao **refetch pós-ação** — recarregar o MESMO id
  depois de um `PUT`, quando `loadedDetalheIdRef` já aponta para ele. Mexer nele é regra
  compartilhada; **o conserto de (a) não o toca**.
- **São 17 call sites, não 18.** A medição (e a proposta do controlador, que a repetiu) diz "os 18
  call sites"; ela lista exatamente **17** linhas, e a contagem executada confirma 17:
  `grep -n "abrirDetalhe(" RequisicoesList.js` devolve 17 linhas (`:179, :266, :274, :298, :303,
  :333, :381, :418, :459, :611, :626, :642, :657, :676, :692, :812, :866`) e `grep -c "force: true"`
  devolve **17** — a definição (`:227`) não casa o padrão porque é `abrirDetalhe = useCallback(`.
  **Off-by-one da própria medição, corrigido aqui.** Irrelevante para o conserto, relevante para
  não repetir o número errado na terceira geração de documento.
- **O deep-link é protegido por um inicializador que ninguém documentou.**
  `RequisicoesList.js:99-102` lê `searchParams.get('id')` **no primeiro render**, então
  `selectedIdRef.current` já vale `55` quando o efeito de filtros (`:183-186`) roda
  `syncSearchParams(selectedIdRef.current)` — a query não muda, `:149` não escreve, e o `?id=` não
  é apagado no mount. **Restrição do conserto: não tocar em `:99-102` nem na ordem
  `:167` → `:183`.**
- **Um conserto ingênuo quebra justo isso:** gravar `loadedDetalheIdRef.current = id` *antes* do
  `await` faria o ramo `if (!urlId)` (`:169-175`) **fechar o painel** em qualquer navegação que
  limpe a URL. A gravação fica onde está, em `aplicarDetalhe` (`:191`).
- **Recebimentos é pior do que o plano diz no recarregamento.** O `catch` de `:80-82` não zera a
  lista: um refresh que falha (botão `:409`, ou troca de filtro pela dep de `:85`) deixa a **lista
  antiga** na tela sem nenhuma marca de que os dados são velhos. O estado de erro tem de cobrir os
  **dois** casos — lista vazia **e** lista obsoleta.
- **Já existe botão de recarregar** (`:409`, `onClick={loadRecebimentos}`): o "Tentar de novo" do
  molde reusa a mesma função, não é superfície nova.
- **Recebimentos não tem `fetchSeq`.** `RequisicoesList.js` tem (`:107, :231, :243, :249, :257`);
  Recebimentos não. Dois cliques rápidos deixam duas requisições em voo e **a última a responder
  vence**. Anular `detalhe` na troca de id **não** conserta isso.
- **Materiais não é o pior caso do CSS — Ferramentas é.** `FerramentasAlmoxarifado.js:517-561` põe
  até **5 botões de TEXTO** na mesma célula (`DISPONIVEL` + `exige_calibracao`), contra 10 ícones
  de 32px em Materiais. E `.btn-almox-secondary` tem **`white-space: nowrap`**
  (`Almoxarifado.css:368`) — o que transforma a largura mínima de Ferramentas em **piso duro**, não
  em estimativa. É o fato que permite decidir (c) **sem navegador** (ver abaixo).
- **Off-by-ones de referência, todos corrigidos nesta etapa:** `syncSearchParams` é chamado em
  `:246` (não `:247`); `abrirDetalhe` de Requisições vai de `:228` a `:261` e o `setDetalhe(null)`
  condicional está em `:234-236`; `loadAuxiliares` é `:100-109` (não `:99-108` — `:99` é linha em
  branco), e esse mesmo erro está em `specs/modulo-almoxarifado/08-recebimento/README.md:170` e numa
  **terceira** variante no cabeçalho de `RecebimentosAlmoxarifado.test.js:78-81`; a frase "Nenhum
  recebimento registrado" está em `:448`, dentro do bloco `:446-453`; `abrirDetalhe` de Recebimentos
  termina em `:143`; o comentário de `RequisicoesList.test.js:545-548` aponta `:232-234` quando o
  código está em `:234-236`.

### O que nenhuma spec diz ainda

`specs/modulo-almoxarifado/04-requisicoes/README.md:11, :80-90` e
`specs/modulo-almoxarifado/08-recebimento/README.md:11, :167-175` já nomeiam (a) e (b). **Nenhuma
spec do módulo menciona (c)** nem o item parked da troca de linha — eles só existem no plano da 34
(`:1035-1060`). O fechamento desta etapa leva os dois para as specs (regra 5 do CLAUDE.md).

## A decisão de desenho

Três frentes independentes, uma por arquivo, nenhuma cruzando dado com a outra.

### (a) Requisições: uma **flag de navegação interna por identidade de query**

`syncSearchParams` passa a **dizer o que escreveu**, e `abrirDetalhe` **arma a flag com essa
string** logo depois de escrever. O efeito de deep-link, no topo, **consome** a flag quando a query
atual é exatamente a que esta tela acabou de escrever:

```js
// RequisicoesList.js — junto de `loadedDetalheIdRef` (:106) e `detalheFetchSeqRef` (:107)
const navInternaRef = useRef(null);   // a query que ESTA tela escreveu e ainda nao foi consumida

const syncSearchParams = useCallback((id) => {
  const params = buildSearchParams(id);
  const next = new URLSearchParams(params).toString();
  if (next !== searchParams.toString()) {
    setSearchParams(params, { replace: true });
    return next;      // escreveu: devolve a query escrita
  }
  return null;        // nao escreveu (:149) — nada a consumir
}, [buildSearchParams, searchParams, setSearchParams]);
```

```js
// dentro de abrirDetalhe, no ramo de SUCESSO (hoje :245-247)
aplicarDetalhe(res.data, id);
if (!fromUrl) {
  const escrita = syncSearchParams(id);
  if (escrita !== null) navInternaRef.current = escrita;
}
```

```js
// no topo do efeito de deep-link (hoje :167)
if (navInternaRef.current !== null && navInternaRef.current === searchParams.toString()) {
  navInternaRef.current = null;   // consumo: desarma sempre, antes de qualquer ramo
  return;
}
```

**Por que identidade de query e não booleano.** O ponto de atenção que o controlador levantou é
real: `syncSearchParams` só escreve quando a query muda (`:149`), então um booleano armado
incondicionalmente **fica armado** — clicar na linha já aberta, ou o refetch por foco da janela
(`:268-284`, que chama `abrirDetalhe` com `fromUrl: false` e não muda a query), deixaria a flag de
pé e ela **engoliria o próximo deep-link legítimo**. Com a string, duas coisas passam a ser
verdade de uma vez:

1. **só arma quando escreveu** (a flag recebe `null` quando `:149` decide não escrever); e
2. **só consome a URL que ela mesma escreveu** — qualquer outra query (back/forward, troca de
   filtro, deep-link colado) **não casa** e segue pelo caminho normal.

E o caso degenerado é seguro por construção: se por algum motivo o efeito não rodar depois de
armar, a flag só pode ser consumida por uma query **idêntica** — isto é, pelo mesmo id e pelos
mesmos filtros, um estado em que o detalhe **já está carregado** e pular a carga é o certo.

**Onde a flag é desarmada** (a pergunta que o controlador mandou responder): **no próprio efeito, ao
consumi-la** — e em nenhum outro lugar. O segundo ponto de desarme que ele sugeriu ("em
`syncSearchParams`, quando ele decide NÃO escrever") foi **descartado com motivo**: quem chama
`syncSearchParams` não é só `abrirDetalhe` — o efeito de sincronização de filtros (`:183-186`) e
`fecharDetalhe` (`:290`) também chamam. Desarmar ali é desarmar por conta de terceiros, e a
comparação por identidade já entrega a mesma garantia sem esse acoplamento.

**Descartado: guarda de "mesmo id" no efeito** (`if (numId === loadedDetalheIdRef.current) return;`
em `:176-179`). Mata o segundo GET **e também** o refetch por troca de filtro, que hoje é verde em
`RequisicoesList.test.js:612-613` (`toBeGreaterThan(1)`). Escolher isso obriga a reescrever um teste
verde de comportamento desejado.

**Descartado: `force: false` no clique (`:812`).** Só funcionaria se o `force` do efeito (`:179`)
caísse também, e aí o refetch pós-ação — a razão de o `force` existir — volta a ser o problema. A
guarda morta de `:229` continua sendo a peça certa; quem tem de consultá-la é o efeito, não o
clique.

### (b) Recebimentos: erro **no DOM**, painel que não mente, e o último clique manda

Três consertos no mesmo arquivo, um por sintoma.

**b.1 — Estado de erro visível, molde `HistoricoInspecoes` pós-Etapa 29.** O molde medido é
`HistoricoInspecoes.js:56` (`const [erro, setErro] = useState(null)`), `:63` (`setErro(null)` no
início), `:69-74` (`msg` do servidor → `toast.error(msg)` + `setHistorico([])` + `setErro(msg)`) e
`:106-116` (o ramo de erro **antes** do ramo de lista vazia). Classes reusadas, **nenhuma nova**:
`.almox-table-container` (`Almoxarifado.css:167`) e `.almox-empty` (`:995`). **Não existe
`.almox-error` no CSS do módulo** — o molde é deliberadamente "estado vazio com texto de erro", e
este conserto o segue em vez de inventar classe. O "Tentar de novo" reusa `loadRecebimentos`, que
já é o `onClick` do botão de refresh (`:409`).

Diferença de forma em relação ao molde: `HistoricoInspecoes` usa *early return* (`if (erro) return
…`), e Recebimentos renderiza a lista dentro de um ternário inline (`:445`). O ramo entra **no
ternário, antes do teste de lista vazia**:

```jsx
{loading ? <SkeletonTable rows={8} columns={6} /> : erro ? (
  <div className="almox-empty">
    <p>Não foi possível carregar os recebimentos.</p>
    <p style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{erro}</p>
    <button type="button" className="btn-almox-secondary" onClick={loadRecebimentos}>Tentar de novo</button>
  </div>
) : recebimentos.length === 0 ? ( /* … "Nenhum recebimento registrado" … */ ) : ( /* tabela */ )}
```

**A ordem é a regra, não um detalhe de escrita:** com o ramo depois do teste de lista vazia, a rede
caída volta a mostrar "Nenhum recebimento registrado" e o conserto some. É o que a sabotagem de
posição prova (RN-04/RN-05).

**b.2 — Os outros dois `catch`.** `loadMateriais` (`:93-98`) alimenta a busca de material do modal
"Novo Recebimento": falhar em silêncio ali faz o operador digitar o nome de um material que existe
e concluir que **não está cadastrado**. Ganha `erroMateriais` e uma linha visível **dentro do
modal**, acima da busca, com "Tentar de novo" reusando `loadMateriais` (RN-06). `loadAuxiliares`
(`:100-109`) alimenta dois `<select>` **opcionais** (pedidos de compra e fornecedores, ambos com
entrada manual ao lado, `:635-641` e `:651-657`): fica com `catch` tolerante, mas **com o comentário que diz por
que é tolerável** — em vez do `/* ignore */` que não diz nada. Declarado como decisão, não como
esquecimento.

**b.3 — O painel não mostra mais o registro anterior sob o id novo.** Molde
`RequisicoesList.js:234-236` (`if (loadedDetalheIdRef.current !== id) setDetalhe(null);`), mais o
contador de sequência de `:231/:243/:249/:257`:

```js
const idCarregadoRef = useRef(null);
const detalheFetchSeqRef = useRef(0);

const abrirDetalhe = async (id) => {
  const seq = ++detalheFetchSeqRef.current;
  setSelectedId(id);
  setLoadingDetalhe(true);
  if (idCarregadoRef.current !== id) setDetalhe(null);   // trocou de linha: o painel nao mente
  try {
    const res = await api.get(`/almoxarifado/recebimentos/${id}`);
    if (seq !== detalheFetchSeqRef.current) return;      // resposta fora de ordem nao vence
    setDetalhe(res.data);
    idCarregadoRef.current = id;
    setFiscalForm({ /* … igual a hoje … */ });
  } catch {
    if (seq !== detalheFetchSeqRef.current) return;
    toast.error('Erro ao carregar recebimento');
    setSelectedId(null); setDetalhe(null); idCarregadoRef.current = null;
  } finally {
    if (seq === detalheFetchSeqRef.current) setLoadingDetalhe(false);
  }
};
```

**O que o controlador chamou de "mudança mínima" não é mínima, e a diferença importa.** Hoje o
painel inteiro é `{detalhe && (…)}` (`:485`) e o cabeçalho desreferencia `detalhe.numero` **sem
guarda** (`:489-491`). Anular `detalhe` sem mais nada faz **duas** coisas erradas: o painel e a
coluna de 420px do grid (`:443`) **piscam para fora** e voltam, e — pior — qualquer guarda mal
posta ali derruba a suíte inteira por `TypeError`, que é a forma de sabotagem que o plano da 34
proibiu (regra iii). O molde de Requisições resolve isso com um **`selectedId`** setado
**sincronamente** em `abrirDetalhe`: o painel é gatilhado por ele, o corpo pelo par
`loadingDetalhe || !detalhe`, e o cabeçalho usa `detalhe?.numero || '...'`. Então a etapa leva
também o `selectedId` — cinco pontos, todos mecânicos:

| Hoje | Passa a ser | Por quê |
|---|---|---|
| `:443` `gridTemplateColumns: detalhe ? '1fr 420px' : '1fr'` | `selectedId ? …` | senão o painel aberto em carga não tem coluna |
| `:469` `background: detalhe?.id === r.id ? …` | `selectedId === r.id ? …` | a linha clicada continua marcada enquanto carrega |
| `:485` `{detalhe && (` | `{selectedId && (` | o painel não pisca na troca de linha |
| `:489-491` `{detalhe.numero}` / badge | `{detalhe?.numero \|\| '...'}` e `{detalhe && <badge/>}` | sem isso, `detalhe` nulo é `TypeError` |
| `:494` `onClick={() => setDetalhe(null)}` | `onClick={fecharDetalhe}` | fechar tem de zerar `selectedId`, `idCarregadoRef` e **bumpar a seq** (resposta em voo não reabre o painel) |

**Descartado:** manter `{detalhe && …}` e aceitar o piscar. É mais barato de escrever e mais caro de
olhar — duas reflows do grid por troca de linha —, e deixa o painel sem estado "carregando" logo no
caso em que o usuário mais precisa de um.

**O que não pode regredir:** o cenário (g) de `RecebimentosAlmoxarifado.test.js:340-378` trava, por
**identidade de nó**, que o refetch do **mesmo** id (workflow, fiscal, processar) **não** desmonta o
bloco de anexos — foi o fix F2 da 34 (`c5d9e99`). A guarda é `idCarregadoRef.current !== id`
justamente por isso: mesmo id, nada é anulado. Anular sempre passa a suíte de RN-07 e **derruba o
(g)** — e é exatamente essa a sabotagem de posição desta etapa.

**Comentário do produto que fica falso e tem de ser reescrito:**
`RecebimentosAlmoxarifado.js:600` diz "o `id` não muda durante o refetch (`abrirDetalhe` nunca zera
`detalhe`)". Depois desta etapa `abrirDetalhe` **zera** — quando o id muda. A justificativa do F2
continua verdadeira, mas por outro motivo (a guarda por id), e o comentário tem de dizer isso. Não
corrigi-lo é plantar a terceira geração de referência errada nesta base.

### (c) CSS: a medição por script decide, porque `nowrap` é piso duro

Não há navegador nesta sessão, e renderizar é o único jeito de saber a largura de min-content de uma
coluna de texto. **Mas um caso não precisa de render:** `.btn-almox-secondary` tem
`white-space: nowrap` (`Almoxarifado.css:368`), `padding: 9px 16px` e `border: 1px`
(`:359, :362`), e `.almox-actions` tem `gap: 6px` (`:307`). Isso torna a largura mínima da célula de
ações de **Ferramentas** um **piso duro**, calculável:

| Botão (`DISPONIVEL` + `exige_calibracao`) | Texto | Fixo (pad 32 + borda 2 + ícone 13 + gap 7) | Mínimo |
|---|---|---|---|
| Emprestar | ~59px | 54px | ~113px |
| Bloquear | ~52px | 54px | ~106px |
| Iniciar manutenção | ~118px | 54px | ~172px |
| Ocorrência | ~65px | 54px | ~119px |
| Calibração | ~65px | 54px | ~119px |
| **soma + 4 × gap 6px + `td` padding 32px (`:194`)** | | | **≈ 685px** |

Estimativa de texto a **6,5px/caractere** (conservadora para 14px = `0.875rem`; a real fica entre
7,0 e 7,5). Largura útil da página: `min(viewport, 1400px) − 48px` de padding
(`.almox-page`, `:7-9`).

**A conclusão que não depende de estimativa nenhuma:** no piso do intervalo desktop — **769px** — a
largura útil é **721px**, e a célula de ações **sozinha** pede ~685px. Sobram **36px** para as
**seis** outras colunas da tela (`Código`, `Nome`, `Status`, `Série`, `Localização`, `Calibração` —
`FerramentasAlmoxarifado.js:481-484`), cujo `td` padding já soma 6 × 32 = 192px **antes** de
qualquer texto. Mesmo derrubando a estimativa de caractere pela metade, a tabela não cabe. Abaixo
de 768px nada clipa, porque `:1030` dá `overflow-x: auto` à própria tabela; **entre 769px e a
largura em que tudo couber não existe `overflow-x` em lugar nenhum e o `overflow: hidden` de `:171`
corta.** O último botão ("Calibração") fica **inalcançável**, sem barra de rolagem e sem sintoma.

O **teto** do intervalo é que depende de estimativa, e por isso vai declarado como faixa: somando
às ~685px da célula de ações o min-content das outras seis (≈370px no cenário otimista, ≈620px no
pessimista), a tabela pede entre ~1055px e ~1305px, ou seja um viewport entre **~1100px e
~1355px**. O plano da 34 chutou "769px até ≈1100px"; a aritmética diz que a borda superior pode ser
bem mais alta. **É esse teto — e só ele — que o roteiro de F12 vai medir.**

**Conclusão:** a condição do risco R8 da medição ("se **nenhuma** tela clipa, não mudar o CSS") **não
se cumpre** — uma tela clipa por aritmética de piso duro. Então:

- entra **`flex-wrap: wrap`** em `.almox-actions` (`:305-309`);
- entra um **teste de drift** que congela as premissas da medição (o `nowrap`, o `gap: 6px`, os
  32px do `.almox-btn-icon`, o `overflow: hidden` do contêiner, a regra de 768px) — e que **diz no
  próprio arquivo o que ele não prova**, no molde de `054f727`;
- **não** entra mudança em `.almox-table-container`: o `overflow: hidden` existe pelo
  `border-radius: 12px` (`:170-171`) e tirá-lo abre serrilhado nos quatro cantos de 11 telas.

**O risco residual, dito sem maquiagem:** `flex-wrap: wrap` **não** é neutro para as linhas que
hoje cabem. Com `wrap`, a largura de min-content da célula cai do total dos botões para o **maior
botão isolado**, e o algoritmo `table-layout: auto` redistribui: colunas de texto ganham espaço e a
coluna de ações pode passar a quebrar **onde hoje não quebra**. O efeito é cosmético (altura de
linha variável nas listas longas — Materiais e Movimentações), nunca funcional: nenhum botão fica
inalcançável por quebrar linha, e hoje **fica** por ser cortado. Fica na letra B como decisão, com
o roteiro de F12 no guia do usuário para a confirmação visual que só o navegador dá.

**Descartado: `overflow-x: auto` numa classe modificadora só nas telas afetadas.** Troca um botão
cortado por um botão **atrás de uma barra de rolagem horizontal que o usuário não vê** (a barra
nasce no rodapé de uma tabela de 20 linhas), exige classe nova em 3 telas hoje e em todas as que
ganharem um botão amanhã, e briga com o `border-radius` do contêiner. **Descartado: não mudar nada
e deixar só o roteiro manual.** Era o resultado correto **se** a medição fosse inconclusiva; com o
piso duro de `nowrap` medido, "não mudar" é escolher o defeito certo em vez do risco cosmético.

## Regras de negócio

- **RN-01 — um clique, uma carga.** Clicar numa linha da lista de requisições dispara **exatamente
  um** `GET /almoxarifado/requisicoes/:id`. *Cenário:* lista aberta sem `?id=`, clique na linha da
  REQ-055 → `api.get.mock.calls.filter(([u]) => u === '/almoxarifado/requisicoes/55')` tem
  **1** (hoje: **2**).
- **RN-02 — deep-link, uma carga, e continua abrindo.** Entrar com `?id=55` na URL carrega o detalhe
  **uma** vez e abre o painel. *Cenário:* render com `initialEntries=['/almoxarifado/requisicoes?id=55']`
  → painel com `REQ-055`, contagem do detalhe **1**, contagem de `/almoxarifado/anexos` **1**. (Verde
  hoje; é a metade positiva que impede "consertar" a RN-01 matando o deep-link.)
- **RN-03 — os refetches legítimos sobrevivem.** Foco/visibilidade da janela (`:268-284`) e troca de
  filtro (`:183-186` → `:167-181`) continuam recarregando o detalhe. *Cenário:* clique → 1;
  `window.dispatchEvent(new Event('focus'))` → 2; clicar o checkbox de filtro → 3. Uma carga por
  gesto, e nenhuma flag armada sobrando.
- **RN-04 — falha de carga da lista é visível e distinguível de lista vazia.** *Cenário:* mock de
  `/almoxarifado/recebimentos` rejeitando com `{ response: { data: { error: 'Sem acesso ao módulo' } } }`
  → o DOM contém `Não foi possível carregar os recebimentos.`, contém `Sem acesso ao módulo`, contém
  `Tentar de novo`, **não** contém `Nenhum recebimento registrado`; e a metade positiva:
  `Recebimentos NF` (o cabeçalho, `:404`) está na tela.
- **RN-05 — um recarregamento que falha não deixa a lista obsoleta passando por fresca.** *Cenário:*
  lista carrega com 3 linhas → a rota passa a rejeitar → clique no botão de refresh (`:409`) → o DOM
  mostra o estado de erro e **nenhuma** linha de tabela (`.almox-table tbody tr` → 0).
- **RN-06 — falha ao carregar materiais é visível onde ela atrapalha.** *Cenário:*
  `/almoxarifado/materiais` rejeita → abrir "Novo Recebimento" → o modal contém
  `Não foi possível carregar a lista de materiais.` e o campo de busca (metade positiva: o modal
  montou), e a lista de recebimentos **não** está em estado de erro (a falha de um não contamina o
  outro).
- **RN-07 — trocar de linha nunca mostra o registro anterior sob o id novo.** *Cenário:* abrir o
  REC-2026-058, clicar no REC-2026-041 com o GET do 041 **suspenso** → o painel existe, **não**
  contém `REC-2026-058`, o bloco de anexos está ausente e a contagem de `/almoxarifado/anexos`
  continua **1**; ao liberar o GET, o painel mostra `REC-2026-041` e a última consulta de anexos é
  `{ entidade: 'recebimento', entidade_id: 41 }`.
- **RN-08 — resposta fora de ordem não vence.** *Cenário:* clicar no 058 com o GET dele suspenso,
  clicar no 041 (que resolve), depois liberar o 058 → o painel continua em `REC-2026-041`, sem
  `.almox-loading` pendurado, e a última consulta de anexos é a do 41.
- **RN-09 — refetch do MESMO id não desmonta o bloco de anexos** (não-regressão do F2 da Etapa 34).
  *Cenário:* o (g) que já existe (`RecebimentosAlmoxarifado.test.js:340-378`), por **identidade de
  nó** (`toBe(antes)`) e contagem de anexos **1**.
- **RN-10 — a coluna de ações quebra linha em vez de ser cortada, e as premissas da medição são
  congeladas.** *Cenário:* o teste de drift afirma, lendo `Almoxarifado.css`: `.almox-actions` tem
  `flex-wrap: wrap` e `gap: 6px`; `.almox-btn-icon` tem `width: 32px`; `.btn-almox-secondary` tem
  `white-space: nowrap`; `.almox-table-container` tem `overflow: hidden`; e a regra de
  `max-width: 768px` mantém `overflow-x: auto` em `.almox-table`. O teste **não** prova que nenhum
  botão é cortado — isso só o navegador prova, e o roteiro está no guia.

## Decisões desta etapa (vão para a letra B do doc de novidades)

| # | Decisão | Descartado, e por quê |
|---|---|---|
| 1 | flag de navegação interna **por identidade de query**, armada só quando `syncSearchParams` escreveu | booleano (fica armado quando `:149` não escreve); guarda de "mesmo id" no efeito (mata o refetch por filtro, teste verde `:612-613`); `force: false` no clique (mexe na regra compartilhada dos 17 call sites) |
| 2 | desarme **só no consumo**, dentro do efeito de deep-link | desarmar também em `syncSearchParams` quando ele não escreve — ele é chamado por três lugares, e a identidade de query já garante o mesmo |
| 3 | `selectedId` em Recebimentos, no molde de Requisições, junto com a anulação de `detalhe` | manter `{detalhe && …}` e aceitar o painel piscando (duas reflows do grid por clique, e nenhum estado "carregando") |
| 4 | somar `fetchSeq` no **mesmo** commit da anulação | deixar a corrida para depois: anular `detalhe` fecha a janela do painel mentiroso mas **não** a da resposta atrasada, e são 6 linhas do molde já provado |
| 5 | `loadAuxiliares` fica tolerante, **com o motivo escrito** | terceiro estado de erro para dois `<select>` opcionais que já têm entrada manual ao lado |
| 6 | `flex-wrap: wrap` global em `.almox-actions`, com teste de drift e roteiro de F12 | `overflow-x: auto` por classe modificadora (esconde o botão atrás de barra invisível); não mudar nada (mantém um defeito certo em Ferramentas) |
| 7 | nenhum commit com a suíte vermelha: a régua da RN-01 (T1) viaja no commit do conserto (T2) | commitar o vermelho "para registrar a medição" — o histórico passaria a ter um ponto onde `npm test` mente |

## Riscos herdados da medição, e onde o desenho os fecha

| # | Risco | Fechado por |
|---|---|---|
| R1 | conserto de (a) mata o refetch por troca de filtro (`:612-613`) | decisão 1 (flag no `abrirDetalhe`, não guarda no efeito) + RN-03 no cenário de integração |
| R2 | flag fica armada quando `syncSearchParams` não escreve | decisão 1 (arma só com o retorno não nulo) + identidade de query |
| R3 | gravar `loadedDetalheIdRef` antes do `await` fecha o painel no ramo `!urlId` | restrição explícita: a gravação fica em `aplicarDetalhe` (`:191`) |
| R4 | a asserção nova do clique ficar verde de primeira (teste vazio) | T1 é uma task só para ver **2**, antes de qualquer conserto |
| R5 | conserto de (b) que só melhore o toast passa despercebido | RN-04/05/06 afirmam **DOM**, no molde `HistoricoInspecoes.test.js:219-222` |
| R6 | cenário de erro passar "com a tela vazia" | metade positiva dentro de cada cenário negativo (cabeçalho, modal montado, linhas contadas) |
| R7 | anular `detalhe` não fecha a corrida | RN-08 + decisão 4 |
| R8 | `flex-wrap` global sem medição | medição por piso duro de `nowrap`, com o residual nomeado e o roteiro de F12 |
| R9 | Ferramentas, a tela mais exposta, não tem suíte | o teste de drift congela as premissas; o roteiro manual cobre o visual; e está dito que o teste não prova o pixel |
| R10 | drift de linha em comentários e specs | T7 corrige `RequisicoesList.test.js:545-548`, `RecebimentosAlmoxarifado.js:600`, o cabeçalho `RecebimentosAlmoxarifado.test.js:78-81` e `08-recebimento/README.md:170`, **dizendo que estavam errados** |

## O que esta etapa NÃO cobre

- **Nada em `server/`.** Zero rota, zero serviço, zero `ACAO_PERFIS`, zero migration. A autorização
  em duas camadas (`checkModulePermission` abre a tela; `permissions.js` + `requirePermission`
  deixa agir; `getPerfilFromUser` cai em `PRODUCAO`) **não é tocada**, e o gate de `warehouseMode`
  do bloco de anexos (fix `a88d715`, travado por `RequisicoesList.test.js:560-577`) **não é
  afrouxado** por nenhum dos consertos.
- **Nenhuma segregação de saldo por almoxarifado.** Almoxarifado é área física, não filial; saldo
  global por material segue correto e intencional.
- **A guarda morta de `RequisicoesList.js:229`** continua morta. Ela é a peça certa **para o
  efeito**, não para o clique, e ligá-la exigiria mexer no `force` dos 17 call sites — regra
  compartilhada, tronco de outra etapa. Esta etapa neutraliza o segundo passe **sem** tocar nela.
- **Modal fiscal, workflow e etiquetas de Recebimentos continuam sem teste.** A suíte da tela nasceu
  na Etapa 34 com o foco em anexos; esta etapa acrescenta erro de carga e troca de painel. O resto
  fica.
- **Os três arquivos grandes** (`RemessasTerceirosAlmoxarifado.js` ≈1015 linhas,
  `RequisicoesList.js` ≈1575, `RecebimentosAlmoxarifado.js` ≈814) não são quebrados aqui.
- **A verificação visual do clipe em navegador.** Fica como roteiro de F12 no guia do usuário, com
  as sete larguras e as três telas. O que esta etapa entrega é a aritmética, a mudança de CSS e o
  congelamento das premissas — não o screenshot.
- **Os furos C43 e C44** da Etapa 33 seguem abertos; nada aqui os toca.
