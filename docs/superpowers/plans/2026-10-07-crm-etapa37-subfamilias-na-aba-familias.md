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
  o 400 do servidor ("possui N item(ns) ativo(s)") vai para toast como hoje. Inativar uma raiz com
  subfamílias ativas: o servidor recusa com a literal existente — a tela **mostra** a literal.
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
| `GET /api/almoxarifado/familias[?ativo=…]` | `qtd_itens`: `CASE WHEN f.parent_id IS NULL THEN COUNT(familia_id=f.id) ELSE COUNT(subfamilia_id=f.id)` (materiais ativos) | mesmas chaves de hoje (`f.*`, `parent_nome`, `qtd_itens`) |
| `GET /api/almoxarifado/familias/:id/itens` | se a família é subfamília, `WHERE m.subfamilia_id = ? AND m.ativo = 1`; senão como hoje | mesma projeção |
| `GET /api/almoxarifado/materiais?subfamilia_id=N` | novo filtro `AND m.subfamilia_id = ?` (combinável com `familia_id`) | mesma projeção |
| `POST`/`PUT`/`DELETE /familias` | **inalterados** | — |

Front: `TabFamilias` (`ConfiguracoesAlmoxarifado.js`), `MateriaisAlmoxarifado.js` (filtro),
`MaterialAlmoxarifadoForm.js` (`?subfamilia_id`).

## Tasks

**T1 — tronco (servidor, pequeno):** RN-37.05, 37.06. Teste primeiro em
`server/tests/api/subfamilias.api.test.js` (acrescentar ao fim, mesmo runner): (a) material com
`familia_id=R, subfamilia_id=S` → `GET /familias` traz `qtd_itens` 1 em R **e** 1 em S (hoje S = 0
— controle positivo); (b) `GET /familias/S/itens` traz o material (hoje vazio); `GET /familias/R/itens`
continua trazendo; (c) `GET /materiais?subfamilia_id=S` traz só ele; `?subfamilia_id=outra` vazio;
(d) material sem subfamília não entra na contagem de S. Implementar em `routes/almoxarifado.js`
(`:2251-2267`, `:2281-2294`, `:348-350`). Rodar `subfamilias`, `materialCompleto`,
`materialServiceCriacao`, `conferenciaEscopo` (lê famílias) → verde.

**T2 — galho (client, aba Famílias):** RN-37.01–37.04, 37.08. Teste primeiro, **novo**
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
esquerda `rgba(79,172,254,.25)`).

**T3 — galho (client, Materiais):** RN-37.06 (filtro) e RN-37.07 (form). Testes: em
`MaterialAlmoxarifadoForm.test.js` acrescentar "abre com `?familia_id=R&subfamilia_id=S`
selecionados" e "S fora de R é ignorada"; em `MateriaisAlmoxarifado.test.js` (existe? se não,
criar mínimo) "o filtro lista a árvore e escolher uma sub manda `subfamilia_id`". T2 e T3 tocam
arquivos disjuntos; T3 só consome o contrato de T1 (mock do `api` no teste).

**T4 — integração e fechamento:** merge; suíte inteira (5 do servidor + jest + build); seção da
Etapa 37 no `docs/compras-novidades-por-etapa.md` (roteiro: Configurações → Almoxarifado →
Famílias → "Nova subfamília" em Rolamentos → ver dentro do cartão → "Adicionar item" → form já
com família e subfamília → voltar e ver o "1 item" na sub → Materiais, filtrar pela sub); B13–B15;
guia `:751`/`:4620` e manual §2.1 corrigidos ("era verdade até a 37"); spec 01 README (main)
item de subfamílias; índice; retro.

## Pontos de atenção
- `qtd_itens` da raiz **inclui** os materiais das subs (eles têm `familia_id` = raiz). Não "corrigir"
  isso: é o total da família, e é o que "Adicionar item"/código por prefixo assumem.
- Gate dos testes de servidor: usuário com `is_superadmin` (como `subfamilias.api.test.js` faz).
- `ConferenciaEstoque.js:705` filtra só raízes no escopo — não tocar.
- `window.confirm` no teste: `jest.spyOn(window, 'confirm')`.
- Não existe Zod de família — validação à mão na rota, como hoje; não criar.
- Linhas do servidor citadas são de `main` `34d348ed`; conferir antes de editar.

## Retro (preencher no fechamento)
- Rodadas de correção até verde: _preencher_
- Achados da revisão: _preencher_ (reais vs. ruído)
- Paralelismo: _preencher_
- Defeito escapado: preencher na etapa seguinte.

## Como foi executado

_Preencher no fechamento, com o que foi medido de verdade._
