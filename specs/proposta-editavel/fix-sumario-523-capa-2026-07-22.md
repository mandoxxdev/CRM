# Fix — Sumário/5.23/Capa (2026-07-22)

Status: design aprovado — execução delegada a subagentes com code-review final.

Segunda rodada de correções sobre o template da proposta (`server/templates/propostaPremiumV2.js`).
Rodada anterior: `fix-layout-auditoria-2026-07-21.md` (squash `a322e4f` em `main`).

## Contexto de código (aterrado)

| Região | O quê | Linhas (aprox.) |
|---|---|---|
| `#tocPage` / `#tocList` | Página estática de SUMÁRIO, preenchida via JS **após** a numeração das páginas | 1418–1424 (HTML), 1780–1814 (script) |
| Numeração `Pág. X/Y` | `pages` filtra `display !== 'none'`; roda **antes** do preenchimento do sumário | 1780–1786 |
| `splitTableByRows` | Divide tabela por linhas **repetindo `thead`** em cada parte | 1449–1484 |
| `splitBlockByChildren` | Divide bloco não-tabela pelo container com mais filhos; preserva ancestrais só na **1ª parte** | 1494+ |
| `.cover-hero` | `display:flex; width:100%; height:78mm` + `img { object-fit: cover }` | 1218–1219, 1354 |
| Campos da capa | `cover-client-info`: CONTRATANTE / CNPJ / Email / Emissão | 1373–1377 |
| SELECTs `/premium` e `/pdf` | Trazem `c.razao_social, c.nome_fantasia, c.cnpj, c.logo_url`; **não trazem** `c.telefone`/`c.email` | rota premium e rota pdf em `server/index.js` |

---

## #1 — Sumário que estoura o rodapé → esconder a página do sumário

**Regra (do usuário):** se o conteúdo do sumário exceder a área útil (invadir o rodapé), a página do sumário sai da proposta. Se couber, fica.

**Design:**
- Após preencher `#tocList`, medir overflow do `.page-content` do `#tocPage` (`scrollHeight > clientHeight`).
- Overflow → `tocPage.style.display = 'none'`. Sem overflow → `display = ''`. **Reversível** a cada repaginação (o filtro de páginas já ignora `display:none`): se o usuário remover cláusulas e o sumário voltar a caber, ele reaparece.
- **Interação crítica com a numeração:** hoje a ordem é numerar → preencher sumário. Esconder o sumário depois de numerar deixaria `Pág. X/Y` errado em todas as páginas. Nova ordem: preencher `#tocList` (provisório) → medir → decidir display do `tocPage` → **recoletar** as páginas visíveis → numerar → repreencher o sumário (se visível) com os números finais.

## #2 — Tabela da 5.23 quebrada entre páginas sem repetir cabeçalho

**Causa raiz (aterrada no código):** `splitTableByRows` já repete o `thead` (linha 1457), mas a tabela de preços da 5.23 fica aninhada (`section[data-page-break] > section.allow-break > table`). Quem divide o bloco é `splitBlockByChildren`, que escolhe o container com mais filhos-elemento — o `tbody` — e reconstrói a cadeia de ancestrais preservando irmãos (o `thead`) **apenas na 1ª parte**. Continuações ficam sem cabeçalho.

**Design:** em `splitBlockByChildren`, quando o container escolhido for um `tbody` (ou seja, a divisão está quebrando uma tabela), cada parte da cadeia reconstruída deve incluir também o clone do `thead` (e `colgroup`, se houver) da tabela ancestral — espelhando o comportamento de `splitTableByRows`. Solução geral (vale para qualquer tabela aninhada, não só a 5.23).

## #3 — `industria40.png` da capa com linha branca à esquerda

**Sintoma:** fina linha branca vertical no canto esquerdo do hero, como se a imagem estivesse alinhada à direita; deve preencher 100% da horizontal.

**Design:** investigar por reprodução (screenshot headless da capa) — candidatos: padding/margem herdada no `.cover-hero` ou ancestral, arredondamento do flex, `object-position` default (`center`) cortando assimetricamente. Corrigir com CSS (ex.: `object-position: left center`, `margin/padding: 0` no que estiver vazando, ou largura calculada). Critério de aceite: pixel da coluna x=0 do hero não é branco no screenshot.

## #4 — Capa com nome, e-mail e telefone da empresa (do cadastro)

**Design:**
- SELECTs de `/premium` e `/pdf` passam a trazer `c.telefone AS cliente_telefone_cadastro` e `c.email AS cliente_email_cadastro`.
- **Correção pós-review:** a afirmação original de que os SELECTs "não traziam" telefone/email do cadastro estava errada — `COALESCE(p.cliente_telefone, c.telefone)` / `COALESCE(p.cliente_email, c.email)` já existiam nessas duas rotas desde o commit inicial. As colunas `_cadastro` e o fallback `||` no template são, portanto, redundantes no fluxo real (decisão consciente: mantidos como defesa contra valores legados `''` — que o COALESCE não cobre — e para testabilidade unitária do template sem passar pela query). O que este fix efetivamente adiciona de novo é a **linha de Telefone na capa**, que não existia.
- Capa (`cover-client-info`):
  - Nome: já existe (razao_social) — sem mudança.
  - Email: já existe; passa a usar fallback `proposta.cliente_email || cliente_email_cadastro || '—'` (override da proposta continua valendo; segue editável inline).
  - **Telefone (novo):** linha `<p class="cover-field-telefone"><strong>Telefone:</strong> <span data-edit="cliente_telefone">…</span></p>` com `proposta.cliente_telefone || cliente_telefone_cadastro || '—'`. **Editável inline e salvável, igual a nome/email** (pedido do usuário pós-entrega; originalmente era estático). A infra já existia: `CAMPOS` do `PropostaPreviewEditavel` já listava `cliente_telefone`, o `PUT /customizacoes` já o persistia e os overlays de `/premium` (linha ~8373) e `/pdf` (linha ~8834) já o aplicavam — faltava só o `data-edit` no template.
- PDF e preview usam o mesmo template — sem trabalho extra.

## Resultado do code-review (4 revisores paralelos + triagem)

Nenhum issue bloqueante. Registros:
- **#3 foi corrigido no ASSET, não no CSS**: `industria40.png` tinha 9px de margem transparente na borda esquerda (resíduo de crop) — a imagem foi aparada (983x490→973x488) e o CSS ficou intocado. ⚠️ Se essa imagem for substituída no futuro, conferir que a nova não tem margem transparente — a regressão voltaria sem nenhum sinal no código. O teste `propostaCapaHero.test.js` pega isso **desde que `pngjs` esteja instalado** (adicionado como devDependency do server pós-review; sem ele o teste degrada para geometria e não detecta).
- Redundância `_cadastro` (ver correção no #4 acima) — mantida conscientemente.
- Código morto pré-existente (backlog, não deste diff): caminho `table[data-split-table="true"]` no paginador nunca é ativado e tem filosofia oposta ao fix novo (remove thead em vez de repetir) — se reativado um dia, conflita; candidato a remoção.
- Pré-existente em `main`, não tocado: overflow de ~3px no `.page-content` da página APRESENTAÇÃO.
- Verificação empírica extra dos revisores: stress com sumário estourado + tabela quebrada simultâneos → zero overflow, numeração consistente; `tocPage` não interage com o MutationObserver da edição inline (só observa `childList` de páginas geradas).

## Fora de escopo
- Sumário multi-página (a regra escolhida é esconder, não paginar).

- Qualquer mudança nas tabelas FINAME/fiscais além da repetição de cabeçalho na quebra.

## Testes
- **#1:** headless — proposta com MUITAS cláusulas (títulos suficientes pra estourar o sumário) → `#tocPage` invisível e `Pág. X/Y` consistente (sem buraco na numeração); proposta pequena → sumário visível e numerado.
- **#2:** headless — proposta com muitos itens → tabela de preços da 5.23 dividida; cada fragmento de tabela nas páginas de continuação contém `thead` (ITEM/DESCRIÇÃO/QUANT./PREÇO/TOTAL).
- **#3:** screenshot da capa → coluna x=0 do hero não-branca; largura do `<img>` == largura da página.
- **#4:** unit (node) — HTML contém Telefone com valor do cadastro quando proposta não tem override; fallback '—' sem dado; email usa cadastro quando proposta.cliente_email vazio.
- Regressão: bateria existente (`server/tests/*.test.js` + jsdom) verde; overflow do rodapé zero.
