# Etapa 37 (linha `main`) — subfamílias cadastráveis na aba Famílias

> Origem: task 2 do lote de 2026-10-06 ("árvore de cadastro de categorias para cada família"),
> resolvida pela **opção (ii) da D-36a, escolhida pelo André em 2026-10-07**: a árvore é
> **família → subfamília**, cadastrada na aba *Famílias* (Configurações → Almoxarifado, que a
> Etapa 36 embutiu em `/configuracoes?modulo=almoxarifado&tab=familias`). A pergunta "categoria
> depende de família?" ficou para o P.O. (D-37) e não bloqueia esta etapa.
> Branch: `main`. Baseline: client 53 suítes / 771 testes; `test:api` 172/172; build limpo.

## O que a Fase 0 mediu (contra `34d348ed`)

- **Servidor já completo:** `familias_material_almoxarifado.parent_id` (`schema.js:750`),
  `validateParentFamilia` (`routes/almoxarifado.js:2239-2249`, 2 níveis, pai ativo),
  `POST /familias` aceita `parent_id` (`:2296-2343`), `PUT` preserva `parent_id` omitido e aceita
  `null` explícito (`:2368-2371`), bloqueios de inativar/virar subfamília com filhas ativas
  (`:2399`, `:2402`, `:2421-2455`). `GET /familias` já projeta `parent_id` e `parent_nome`
  (`:2251-2267`). **23 cenários** em `server/tests/api/subfamilias.api.test.js`. Gate: POST/PUT/
  DELETE com `denyUnlessAlmoxAdmin` (403 literal "Acesso restrito — administrador do Almoxarifado
  ou Super Administrador"); `role:'admin'` sozinho **não** passa — os testes usam `is_superadmin`.
- **Tela sem nada disso:** `TabFamilias` (`ConfiguracoesAlmoxarifado.js:458-699`) — form
  `{nome, descricao, codigo, tipo_uso}` sem `parent_id`; lista plana de cartões onde subfamílias
  aparecem como irmãs das raízes, sem indicação. O guia diz com todas as letras: "criar uma
  subfamília ainda não tem tela própria — só via API" (`docs/almoxarifado-guia-etapas-e-testes.md:751`, `:4620`).
- **Três pontas que a tela nova deixaria erradas, porque o material grava `familia_id` = raiz
  e `subfamilia_id` = filha:** (1) `qtd_itens` do `GET /familias` conta `m.familia_id = f.id` →
  subfamília sempre **0**; (2) `GET /familias/:id/itens` filtra `m.familia_id` → expandir uma
  subfamília mostra **vazio**; (3) o filtro de família de `MateriaisAlmoxarifado.js:202-204` lista
  raízes e subfamílias misturadas e manda `familia_id` → escolher uma subfamília devolve **nada**
  (`routes/almoxarifado.js:348-350`). O form de material lê `?familia_id` da URL (`:643` do link
  "Adicionar item") mas não `?subfamilia_id`.
- Código do material vem do prefixo da **raiz** (`materialService.js:114-130`); a subfamília não
  entra no código. Mantido.

## Decisões (caminho reversível; registradas em B13–B15)

- **A árvore é desenhada na própria aba:** cartão da raiz → dentro dele a lista de subfamílias
  (indentada), cada uma com as próprias ações. Subfamília **não** aparece mais como cartão irmão.
- **"Nova subfamília" é um botão no cartão da raiz**, que abre o mesmo formulário inline com o pai
  travado ("Subfamília de: ⟨código — nome⟩"). Campos: nome*, código (opcional, gerado pelo
  servidor como hoje), descrição, tipo de uso. **Descartado:** `<select>` de pai no formulário de
  família nova (permitiria promover/rebaixar por engano; o servidor já cobre esses casos e a UI
  não precisa expô-los nesta etapa — reversível).
- **Mover uma subfamília para outra raiz ou transformar raiz ↔ subfamília: fora da tela**
  (continua possível pela API; o PUT preserva `parent_id` omitido). Declarado em "não cobre".
- **Contagens e itens honestos para subfamília (servidor, 3 toques pequenos):** `qtd_itens`
  conta por `subfamilia_id` quando `f.parent_id IS NOT NULL`; `GET /familias/:id/itens` de uma
  subfamília filtra `m.subfamilia_id`; `GET /materiais` aceita `?subfamilia_id=`. **Descartado:**
  deixar a tela mostrar "0 itens" numa subfamília com itens (mentira visível no dia da demo).
- **"Adicionar item" na subfamília** leva a `/almoxarifado/materiais/novo?familia_id=<raiz>&subfamilia_id=<sub>`
  e o form de material passa a ler `?subfamilia_id` (hoje só lê `familia_id`).
- Docs do almoxarifado em `main` (guia `:751`/`:4620`, manual §2.1, spec 01) são corrigidos
  **aqui**; a branch do almoxarifado tem versões mais novas e precisa da mesma edição no merge (B4).

## Regras (`grep RN-37`)

- **RN-37.01** A aba Famílias mostra **só raízes** como cartões; dentro de cada cartão, a lista
  das subfamílias ativas (código, nome, selo de tipo de uso quando ≠ ambos, contagem de itens,
  ações). Raiz sem subfamília mostra "Nenhuma subfamília" discreto. Ordem: raízes por nome; subs por nome.
- **RN-37.02** Botão **"Nova subfamília"** no cartão da raiz abre o formulário inline com o pai
  travado e o título "Nova subfamília de ⟨CÓDIGO⟩ — ⟨nome⟩". Salvar faz `POST /almoxarifado/familias`
  com `{nome, descricao, codigo, tipo_uso, parent_id: <id da raiz>}`; toast "Subfamília criada!";
  a lista recarrega e a nova aparece dentro da raiz.
- **RN-37.03** Editar uma subfamília usa o mesmo formulário (pai mostrado, não editável); `PUT`
  manda `{nome, descricao, tipo_uso}` (sem `parent_id` — o servidor preserva, `subfamilias.api.test.js:157`).
  Toast "Subfamília atualizada!".
- **RN-37.04** Inativar subfamília: `window.confirm` com o nome, `DELETE /almoxarifado/familias/:id`;
  o servidor passa a **recusar** subfamília com itens ativos (conta `familia_id = ? OR subfamilia_id
  = ?` — hoje deixava passar e tornava os materiais dela ineditáveis), e o 400 ("possui N item(ns)
  ativo(s)") vai para toast. Inativar uma raiz com subfamílias ativas: o servidor recusa com a
  literal existente — a tela **mostra** a literal.
- **RN-37.05** `GET /almoxarifado/familias` devolve `qtd_itens` certo para subfamília (materiais
  ativos com `subfamilia_id = f.id`); para raiz continua `familia_id = f.id` (inclui os das subs,
  como hoje). `GET /almoxarifado/familias/:id/itens` de uma subfamília devolve os materiais com
  `subfamilia_id = :id`; de uma raiz, continua `familia_id = :id`.
- **RN-37.06** `GET /almoxarifado/materiais?subfamilia_id=N` filtra por `m.subfamilia_id`; o filtro
  de família de *Materiais* lista a árvore (raiz; "— sub" indentada) e manda `familia_id` para raiz
  e `subfamilia_id` (+ `familia_id` da raiz) para subfamília.
- **RN-37.07** `/almoxarifado/materiais/novo?familia_id=R&subfamilia_id=S` abre o form de material
  com família R e subfamília S selecionadas (S fora de R → ignorada, sem erro).
- **RN-37.08** Expandir o cartão de uma subfamília mostra os itens dela (RN-37.05); expandir a raiz
  continua mostrando todos (inclusive os das subs — é a contagem que o selo da raiz mostra).
- **RN-37.09** Nenhuma permissão nova: o gate continua `denyUnlessAlmoxAdmin` no servidor; a aba
  só é alcançável por quem já configurava o almoxarifado.

## Contratos (congelados)

| Rota | Mudança | Resposta |
|---|---|---|
| `GET /api/almoxarifado/familias[?ativo=…]` **e** `GET /familias/:id` | `qtd_itens` = subquery correlacionada `COUNT(*) … WHERE m.ativo = 1 AND (m.familia_id = f.id OR m.subfamilia_id = f.id)` — as **duas** rotas têm a mesma subquery (`:2253-2257` e `:2269-2274`), manter iguais. (Revisão: a forma `OR` vale para raiz — `subfamilia_id = R` nunca ocorre — e, para sub, também conta material gravado pela API com `familia_id = S` direto, que o `CASE` deixaria fora.) | mesmas chaves de hoje (`f.*`, `parent_nome`, `qtd_itens`) |
| `GET /api/almoxarifado/familias/:id/itens` | `WHERE (m.familia_id = ? OR m.subfamilia_id = ?) AND m.ativo = 1` com `[id, id]` — uma query só, sem `db.get` prévio; a projeção (`familia_nome` da raiz) continua certa | mesma projeção |
| `GET /api/almoxarifado/materiais?subfamilia_id=N` | `subfamilia_id` entra na desestruturação de `req.query` (`:304`) e o `AND m.subfamilia_id = ?` (`parseInt`) logo após o bloco de `familia_id` (`:348-351`); a rota faz um único `db.all` (`:362`), sem `COUNT` separado | mesma projeção |
| `DELETE /api/almoxarifado/familias/:id` | ⚠️ **muda** (achado da revisão do plano): a contagem de itens ativos (`:2423`) vira `(familia_id = ? OR subfamilia_id = ?)`. Hoje `DELETE /familias/S` com itens **passa** (eles têm `familia_id = R`), a sub some da árvore e todo material dela fica ineditável (400 "Subfamília inválida" em `validateSubfamilia`, que exige `ativo = 1`) | 400 com a literal existente `Não é possível remover: família possui N item(ns) ativo(s)` |
| `POST`/`PUT /familias` | **inalterados** (`PUT ativo:0` não checa itens — a tela não usa; declarado em "não cobre") | — |

Front: `TabFamilias` (`ConfiguracoesAlmoxarifado.js`), `MateriaisAlmoxarifado.js` (filtro),
`MaterialAlmoxarifadoForm.js` (`?subfamilia_id`).

## Tasks

**T1 — tronco (servidor, pequeno):** RN-37.04 (metade servidor), 37.05, 37.06. Teste primeiro em
`server/tests/api/subfamilias.api.test.js` (acrescentar ao fim, mesmo runner). ⚠️ O arquivo é
sequencial com estado compartilhado — ao chegar no fim, `subA` já tem **2** materiais; os cenários
novos criam **raiz e sub próprias** (como os testes de `:157` em diante fazem). Cenários: (a)
material com `familia_id=R, subfamilia_id=S` → `GET /familias` traz `qtd_itens` 1 em R **e** 1 em S
(hoje S = 0 — controle positivo), e `GET /familias/S` idem; (b) `GET /familias/S/itens` traz o
material com `familia_nome` da raiz (hoje vazio); `GET /familias/R/itens` continua trazendo; (c)
`GET /materiais?subfamilia_id=S` traz só ele; `?subfamilia_id=outra` vazio; combinado com
`familia_id=R` idem; (d) material sem subfamília não entra na contagem de S; **(e) `DELETE
/familias/S` com o material ativo → 400 com a literal "possui 1 item(ns) ativo(s)" e a sub continua
`ativo = 1`** (hoje 200 — controle positivo); depois de inativar o material, o DELETE passa.
Implementar em `routes/almoxarifado.js` (`:2253-2257`, `:2269-2274`, `:2282-2289`, `:304` + `:348-351`,
`:2423`). Rodar `subfamilias`, `materialCompleto`, `materialServiceCriacao`, `conferenciaEscopo`
(lê famílias) → verde.

**T2 — galho (client, aba Famílias):** ✅ `49d1c24e` (branch `c37b`). RN-37.01–37.04, 37.08. Teste primeiro, **novo**
`client/src/components/almoxarifado/Familias.test.js` (montagem como `ConfiguracoesGerais.test.js`,
em `/almoxarifado/configuracoes?tab=familias`, `useAuth` mockado como ADMINISTRADOR; `api.get` com
fixture de 2 raízes (uma com 2 subs, uma sem) + `/familias/:id/itens`): (a) só raízes viram
cartões; as subs aparecem dentro da raiz certa, com `qtd_itens` da fixture; raiz sem sub mostra
"Nenhuma subfamília"; (b) clicar "Nova subfamília" na raiz R abre o form com "Nova subfamília de
R" e sem campo de pai editável; salvar → `POST /almoxarifado/familias` com `parent_id: R.id` e as
4 chaves, toast "Subfamília criada!"; (c) editar sub → `PUT` sem `parent_id`; (d) inativar sub →
`confirm` + `DELETE`; 400 do servidor vira toast com a literal; (e) expandir sub → `GET
/familias/S/itens`; (f) "Adicionar item" da sub aponta para `…/novo?familia_id=R&subfamilia_id=S`;
(g) criar família **raiz** continua igual (POST sem `parent_id`). Implementar em `TabFamilias`:
`raizes = familias.filter(parent_id == null)`, `subsDe(id)`, estado `parentForm` (id da raiz ou
null), form reutilizado; estilo inline no padrão da aba (sub-lista indentada 24px com borda
esquerda `rgba(79,172,254,.25)`). ⚠️ Dois cuidados da revisão: (1) o cabeçalho do cartão da raiz
é **inteiro clicável** (`:618-619`, expande/colapsa) e as ações param a propagação (`:642`) — a
sub-lista fica **fora** desse div (irmã dele, dentro do cartão), senão clicar numa ação da sub
expande a raiz; (2) celular (328px úteis): a linha da sub usa `flexWrap: 'wrap'` com as ações numa
linha própria, e a área expandida da sub tem `paddingLeft: 24` (não os 48 da raiz, `:652`) — senão
sobram ~86px para código+nome.

**T3 — galho (client, Materiais):** ✅ `bbabe37c` (branch `c37b`). RN-37.06 (filtro) e RN-37.07 (form).
- Form (`MaterialAlmoxarifadoForm.js`): `subfamilia_id: searchParams.get('subfamilia_id') || ''`
  em `:89`. A revisão traçou os efeitos: o valor **sobrevive** (não há `useEffect` que zere a sub —
  `:385-390` é só o handler do `onChange`); quando `familias` chega, o select mostra S. Mas "S fora
  de R → ignorada" **não acontece sozinho**: o select exibe "— nenhuma —" e o submit manda `S` →
  400. Passo explícito: em `loadFamilias` (`:170-171`), depois do `setFamilias`, se `!isEdit` e o
  `subfamilia_id` atual não estiver em `lista.filter(f => String(f.parent_id) === familia_id)`,
  zerar. **Não** fazer num `useEffect([familias])` sem guarda — rodaria com a lista vazia e
  apagaria o S válido antes da resposta. Testes em `MaterialAlmoxarifadoForm.test.js`: a fixture
  (`:42`) só tem a raiz 5 — acrescentar `{id: 6, parent_id: 5}` e `{id: 8, parent_id: 7}` (sub de
  outra raiz); criar variante de `renderizarNovo` (`:102-111`) com `?familia_id=5&subfamilia_id=6`:
  (i) o select de subfamília mostra 6 e o `POST` manda `subfamilia_id: 6`; (ii) com
  `?familia_id=5&subfamilia_id=8` o `POST` manda `subfamilia_id: null` — **afirmar o payload**, não o
  que o select exibe (a exibição já parece certa hoje e aprovaria a implementação errada).
- Filtro (`MateriaisAlmoxarifado.js`): o `<select>` guarda `String(f.id)` (`:204`) e `GET /familias`
  já traz `parent_id`. Em `loadMateriais` (`:90-94`): `const fam = familias.find(f => String(f.id) ===
  familiaFilter)`; `fam?.parent_id` → `params.familia_id = fam.parent_id; params.subfamilia_id = fam.id`;
  senão `params.familia_id = familiaFilter`. **Sem state novo** (o reset `:213` e a condição `:212`
  continuam valendo). Options: raízes por nome, cada uma seguida das subs com rótulo "— ⟨código⟩ ⟨nome⟩".
  Teste em `MateriaisAlmoxarifado.test.js` (existe): mock de `/almoxarifado/familias` com raiz + sub,
  escolher a sub → `api.get('/almoxarifado/materiais', { params: { familia_id: R, subfamilia_id: S } })`;
  limpar o filtro → sem as duas chaves. Ressalva aceita: `?familia_id=<sub>` vindo da URL antes da
  lista carregar manda só `familia_id` (zero linhas até mexer no filtro).
T2 e T3 tocam arquivos disjuntos; T3 só consome o contrato de T1 (mock do `api` no teste). Mocks
existentes de `GET /almoxarifado/familias` conferidos pela revisão: nenhum quebra.

**T4 — integração e fechamento:** merge; suíte inteira (5 do servidor + jest + build); seção da
Etapa 37 no `docs/compras-novidades-por-etapa.md` (roteiro: Configurações → Almoxarifado →
Famílias → "Nova subfamília" em Rolamentos → ver dentro do cartão → "Adicionar item" → form já
com família e subfamília → voltar e ver o "1 item" na sub → Materiais, filtrar pela sub); B13–B15;
guia `:751`/`:4620` e manual §2.1 corrigidos ("era verdade até a 37"); spec 01 README (main)
item de subfamílias; índice; retro.

## Pontos de atenção
- `qtd_itens` da raiz **inclui** os materiais das subs (eles têm `familia_id` = raiz). Não "corrigir"
  isso: é o total da família, e é o que "Adicionar item"/código por prefixo assumem.
- Gate: `denyUnlessAlmoxAdmin` → `canConfigureAlmox` → `canConfigureModule` do servidor aceita
  superadmin, `admin_modulos` com almoxarifado **ou `perfil_almoxarifado === 'ADMINISTRADOR'`**
  (`systemPermissions.js:72-83`) — a frase "só `is_superadmin` passa" da Fase 0 estava mais
  estrita que o real. Nos testes, `is_superadmin` (como o arquivo já usa) ou o perfil — os dois
  passam no harness. `role:'admin'` sozinho vê a aba (client) e toma 403 ao salvar (G9).
- O form de material, ao salvar, navega para `/almoxarifado/materiais` (`:461`), não de volta à
  aba — o roteiro diz "voltar a Configurações → Almoxarifado → Famílias".
- "Não cobre" (declarar no fechamento): mover sub entre raízes / raiz ↔ sub pela tela; `PUT
  ativo:0` sem checar itens (a tela não usa); `TabMateriaisPorSetor` (`:3089-3107`) continua
  listando famílias planas (sub como irmã); `?familia_id=<sub>` na URL de Materiais antes da lista.
- `ConferenciaEstoque.js:705` filtra só raízes no escopo — não tocar.
- `window.confirm` no teste: `jest.spyOn(window, 'confirm')`.
- Não existe Zod de família — validação à mão na rota, como hoje; não criar.
- Linhas do servidor citadas são de `main` `34d348ed`; conferir antes de editar.

## Retro (preencher no fechamento)
- Rodadas de correção até verde: _T1: preencher_. **T2 (executor B): 1 rodada** — o pai travado
  foi escrito como `<input readOnly>` e o teste (b)/(c) lia `textContent`; trocado por texto
  (o plano dizia "pai mostrado, não editável" — texto é mais honesto que input desabilitado).
  **T3 (executor B): 0 rodadas** — verde na primeira implementação.
- Achados da revisão: _T1: preencher_. **Executor B:** os dois cuidados da revisão para a T2
  eram reais — (e2) prova que clicar numa ação da sub **não** dispara `GET /familias/1/itens`
  (a sub-lista é irmã do cabeçalho); o `flexWrap` + `paddingLeft: 24` entraram como dito. Na T3,
  o aviso "afirmar o payload, não o select" também era real: o cenário (ii) **passa antes** da
  implementação (o form nem lia `?subfamilia_id`), e só fica vermelho com a leitura da URL sem
  a limpeza — é a sabotagem 3 que prova que ele guarda alguma coisa. Ruído: nenhum.
- Paralelismo: T2 e T3 rodaram na worktree `c37b` (derivada de `main`) com **zero linhas de
  servidor** — o `api` é mockado com a forma congelada da tabela "Contratos". T2 e T3 tocam
  arquivos disjuntos (`ConfiguracoesAlmoxarifado.js` vs. `MateriaisAlmoxarifado.js` +
  `MaterialAlmoxarifadoForm.js`) e foram commitadas em sequência na mesma branch.
- Sabotagens (executor B, 4/4 detectadas, restauro por edição): (1) POST sem `parent_id` →
  (b)/(b2) vermelhos; (2) subs como cartões irmãos (`familias.map` em vez de `raizes.map`) →
  (a) vermelho; (3) limpeza do `subfamilia_id` fora da raiz removida → (ii) vermelho; (4) params
  do filtro sem `subfamilia_id` → "escolher a sub" vermelho.
- Decisões pelo caminho reversível (executor B): o cartão da raiz vai cabeçalho → itens da raiz
  expandidos → sub-lista (a sub-lista fica sempre visível no rodapé do cartão, com o botão "Nova
  subfamília" e o título "Subfamílias (N)"); a sub expande pelo próprio chevron (título "Itens da
  subfamília"), não pela linha inteira — menos superfície clicável ao lado das ações.
  Classes `almox-familia-card`, `almox-familia-cabecalho` e `almox-subfamilia-row` existem para
  o teste achar a estrutura (não há CSS atrelado).
- Defeito escapado: preencher na etapa seguinte.

## Como foi executado

_Preencher no fechamento, com o que foi medido de verdade._
