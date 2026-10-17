# Etapa 139 (propostas): as duas invariantes vermelhas da revisão da proposta e a margem que não é número (C299) — design

> Origem: "Próxima tarefa detalhada — Etapa 139" do plano da 138
> (`docs/superpowers/plans/2026-10-17-almoxarifado-etapa138-payload-parcial-nos-put.md`). Worktree `CRM-wt-e139`, branch `etapa-e139`
> (a partir da main `b3f4732d`). Plano: `docs/superpowers/plans/2026-10-17-almoxarifado-etapa139-as-invariantes-da-proposta.md`.

## Fase 0 — o que foi medido (2026-10-17)

Linha de base na `b3f4732d`: revisão obrigatória **20/22** + jsdom 32/32. As duas vermelhas:

| Teste | Saída hoje | Desde quando (rodado em worktree `CRM-wt-e139-old1`) | Diagnóstico |
|---|---|---|---|
| `propostaSumarioOverflow` | `grande: tocVisivel true, tocOverflow false, 19 visíveis` | verde em `5485822f` (**40** páginas visíveis), vermelho a partir de **`a33dfca1`** (28/07/2026, "Atualizacao completa 9:28", da outra máquina) — **19** páginas | **Regressão do documento (I1), não do sumário.** |
| `propostaCapaHero` | `94,6 %` brancos na coluna 0 | verde em `da2086c9` (0,0 %), vermelho a partir de **`b8429e2d`** (22/07/2026, "assets por URL") | **Régua do teste (ambiente):** o hero carrega de `http://localhost:5000`; sem o servidor de pé, a imagem não carrega e o screenshot é o texto alternativo sobre branco. |

### 1. O sumário: as cláusulas a partir da 5.25 somem do documento (regressão de I1, desde `a33dfca1`)

O `a33dfca1` trocou `ehPos524`/`ehPos524Normal` por `ehPos525` e **apagou o `clausulasPos524NormalHtml`**, que renderizava depois da
seção de preço as cláusulas numeradas **5.25 ou mais que não são a CONSIDERAÇÃO FINAL**. O filtro ficou (`demaisSem524e525` as tira da
lista), a renderização não — o comentário ao lado ainda diz "as >= 24 vêm DEPOIS dele". Resultado: **toda cláusula 5.25+ que não é a
consideração final some do preview, do PDF e do `#proposalSource`.**

Isto não é caso de laboratório. A numeração do editor (`renumerarClausulas`, `clausulasInlineEditor.js:214`) **pula o 24** (reservado à
seção de preço): com os padrões (5.1–5.23 + 5.25 CONSIDERAÇÃO FINAL), **incluir uma única cláusula** faz a 24ª editável virar **5.25** e
a consideração final **5.26**. Sonda (`scratchpad/e139-sonda-toc.js` e o script em linha do design): cláusulas no formato do banco, padrões
+ `5.25 CLAUSULA NOVA DO USUARIO` + `5.26 CONSIDERAÇÃO FINAL` → `nova presente: false`, `CF presente: true`.

**E a perda vira apagamento.** O salvamento do preview (`salvarClausulas` → `diffClausulas`, `clausulasInlineEditor.js:174`) marca como
**removida** toda cláusula da lista do banco (`GET /clausulas`) que não está no `#proposalSource`. Como a 5.25 não é renderizada, a
próxima edição salva no preview manda `DELETE /clausulas/<id>` dela — a cláusula que o usuário incluiu é apagada do banco sem ele ter
pedido (lido no código; o teste de integração da etapa reproduz pela rota).

**Por que a revisão não pegou:** a I1 do `propostaInvariantes.test.js` compara o `#proposalSource` com as páginas — a cláusula sumida não
está em nenhum dos dois. E os dois cenários dele (padrão e banco) não têm cláusula 5.25 normal. Quem pegou foi o sumário, por tabela: com
3× os padrões, 21 páginas de cláusulas sumiam e o sumário passou a caber.

**Fase 0 do sumário em si:** com o conserto aplicado à mão na sonda, o caso grande volta a 40 páginas e o sumário estoura e some (o mesmo
resultado do `5485822f`). O mecanismo do sumário (preencher → medir → decidir → renumerar → repreencher) **não** regrediu.

### 2. O hero: o teste dependia do servidor na porta 5000 (régua, desde `b8429e2d`)

Desde o `b8429e2d` o preview pede as imagens e as fontes por URL (`${baseURL}/api/assets/proposta/...`, `baseURL` = `API_URL` ou
`http://localhost:5000`). O teste gera o HTML do preview e o abre como arquivo: sem o `npm run dev` de pé, o `<img>` do hero não carrega
(`naturalWidth 0`), o screenshot é o texto alternativo "Indústria 4.0" sobre branco e a coluna 0 dá 94,6 % branca. Prova (sonda
`scratchpad/e139/sonda-hero.js`): servindo `assets/proposta` e `assets/fonts` num servidor local efêmero com as mesmas rotas do
`index.js:17509-17510` e passando a URL dele, o hero do **preview** dá `naturalWidth 973`, **0,0 %** branco; o do **PDF** (`forPdfServer`,
JPEG embutido) dá **0,0 %** também. **O documento está certo; o teste media o ambiente.** O teste também nunca disse que a imagem não
carregou — acusou "linha branca", que mandaria alguém aparar a imagem de novo (armadilha 6).

### 3. A margem que não é número (C299) e a geração automática

`POST /api/propostas` e `PUT /api/propostas/:id` recebem `margem_desconto` sem conferir o tipo: `"10,5"` e `"10abc"` não são `> 5` para o
JavaScript, passam pela regra do desconto e são gravados como texto; negativo e acima de 100 também passam (a tela limita 0–100 no
`<input type="number" min="0" max="100">` e manda número). **Achado da medição (C300):** `POST /api/propostas/gerar-automatica` grava
`status` e `margem_desconto` do corpo **sem** a regra dos 5 % — uma proposta *enviada* com 50 % de desconto sem aprovação nasce por ela. A
tela (`GerarPropostaModal`) não manda nem um nem outro.

## Decisões de design

- **D1 — as cláusulas 5.25+ voltam a ser renderizadas depois da seção de preço (5.24) e antes da página de assinatura**, na ordem salva —
  o lugar que tinham até `a33dfca1` e o que a numeração do editor (5.23 → pula 24 → 5.25) promete. **Descartado:** antes da seção de
  preço (contradiria o número impresso: 5.25 antes de 5.24); renumerar no servidor (mudaria títulos gravados). Consequência a avisar:
  propostas que têm hoje cláusula 5.25+ escondida passam a mostrá-la (consulta **A85**). Reversível (`git revert`).
- **D2 — a I1 passa a ser medida contra a ENTRADA**, não contra o `#proposalSource`: todo título de cláusula do `clausulas_custom` aparece
  nas páginas geradas. Novo cenário no `propostaInvariantes`: formato do banco com uma cláusula incluída pelo editor (5.25 + CF 5.26).
- **D3 — os testes que medem o preview servem os próprios assets.** Helper `tests/helpers/servirAssetsProposta.js` (express, porta 0, as
  duas rotas estáticas do `index.js`), usado pelo `propostaCapaHero` e pelo `propostaSumarioOverflow`. O hero passa a falhar com mensagem
  própria quando a imagem não carrega e mede os **dois** caminhos (preview por URL e PDF embutido). A invariante não afrouxa (o limite de
  50 % fica). **Descartado:** subir o `index.js` inteiro (lento, banco); passar `forPdfServer` só (deixaria o preview sem prova).
- **D4 — margem: um leitor só** (`server/margemDesconto.js`, `lerMargemDesconto`): ausente → não é lida (o `PUT` mantém); `null`/`''` → 0
  (como hoje); número finito ou texto com número com ponto (`"10.5"`, com espaços em volta) entre 0 e 100 → o número; qualquer outra coisa
  (`"10,5"`, `"10abc"`, `-1`, `101`, `true`, objeto, `NaN`) → **400** com a mensagem literal L-MARGEM, nada gravado. Vale no `POST`, no
  `PUT` e na geração automática. **Descartado:** aceitar vírgula convertendo (`"10,5"` → 10,5) — adivinhar formato de quem integra; a
  tela manda número. Reversível.
- **D5 — geração automática com a regra dos 5 % do `POST`** (C300): margem > 5 com status diferente de rascunho → **403** com a mensagem
  do `POST`; margem > 5 sem status → rascunho. Reversível.

## O que a Fase 2 e a Fase 5 mudaram neste design

- **D1 dizia "na ordem salva" — não valia para um caso (Fase 2, I2):** "+ cláusula" na própria consideração final punha a nova depois dela
  e o documento sairia 5.24 → 5.26 → 5.25. O editor passou a incluir antes da página de assinatura e a não mover nada para depois da CF
  (RN-139.07, B904). O dado já gravado nessa ordem **não** se conserta sozinho no salvamento (a Fase 2 dizia que sim — a Fase 5 mostrou
  que o salvamento não renumera); a A85 lista essas propostas.
- **D3 estava incompleta (Fase 5, sabotagem H02):** servir os assets não bastava para as fontes — `@font-face` pedida de outra origem exige
  CORS, e o helper não o dava: o hero carregava e as fontes davam `ERR_FAILED`. O helper usa o `cors()` (como o `index.js`) e o teste do hero
  confere `document.fonts`.
- **D4 ganhou duas portas (Fase 2):** a margem gravada ilegível conta como acima de 5 na regra do desconto (RN-139.04d) e a solicitação de
  aprovação usa a mesma régua (RN-139.06).
- **Fora do escopo, registrado:** a autorização da aprovação de desconto (C301 ampliada, C302, C303) — a próxima etapa.
