# Etapa 139 (propostas): as duas invariantes vermelhas da revisão da proposta e a margem que não é número (C299) — plano

> Origem: "Próxima tarefa detalhada — Etapa 139" do plano da 138. Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-17-almoxarifado-etapa139-as-invariantes-da-proposta-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-17): última B **B898**, último C
> **C299**, última A **A84**. Esta etapa: **B899+**, **C300+**, **A85+**. Worktree `CRM-wt-e139`, branch `etapa-e139` (a partir da main
> `b3f4732d`).
>
> **Resultado da Fase 0 (resumo):** `propostaSumarioOverflow` vermelho desde **`a33dfca1`** = **regressão real do documento** (as
> cláusulas 5.25+ que não são a consideração final deixaram de ser renderizadas — e o salvamento do preview as apaga depois);
> `propostaCapaHero` vermelho desde **`b8429e2d`** = **régua do teste** (o hero vem por URL de `localhost:5000`; sem servidor, não carrega).
>
> **Fase 2 (um revisor fresco, sonda `scratchpad/e139/rev2/sonda1.js`): 7 Important + 4 Minor, todos reais — aceitos antes de qualquer
> código de produção.** **I1** a I1 "título contido no texto" não acha `5.24.1 CONDIÇÃO DE PAGAMENTO:` (o prefixo mora no
> `data-titulo-prefixo`) → o teste compara o título **sem** o prefixo x.y.z (já estava assim no teste escrito; dito na RN). **I2** "+
> cláusula" **na própria consideração final** põe a nova **depois** dela (dentro da página de assinatura): o editor numera CF 5.25 e a nova
> 5.26, e com a T1 o documento sairia 5.24 → 5.26 → 5.25 (o mesmo ao descer uma cláusula para depois da CF) → **RN-139.07 e T5c** (o editor
> inclui antes da página de assinatura e não move nada para depois da CF; o dado já gravado assim **não** se conserta no próximo
> salvamento — *esta frase dizia "se conserta no próximo salvamento do preview, que renumera"; estava errada (r1 da Fase 5): o salvamento
> não renumera, só incluir, mover ou remover renumeram* — D (139), A85). **I3** `POST /:id/enviar` envia sem olhar a margem, e trocar a margem
> numa *desconto_aprovado* pula a regra → **C301** (anterior, não corrigido nesta etapa; candidato da 140). **I4** `POST /api/aprovacoes`
> grava `valor_desconto` cru, e a aprovação o copia para a margem → **RN-139.06** (a mesma régua). **I5** dado legado: margem gravada
> `"10,5"` passa na regra dos 5 % pelo efetivo (`PUT {status:'enviada'}` sem margem) → **RN-139.04d** (margem gravada que a régua não lê
> conta como acima de 5); 150 gravado faz o salvamento do formulário dar 400 e `"10,5"` gravado vira 0 em silêncio pelo formulário → A86 +
> guia + D (139). **I6** a metade sumário da T2 depende da T1 e o controle "template antigo" na mesma árvore é sabotagem concorrente →
> **T2a** (hero) / **T2b** (sumário); o controle do template antigo foi o **vermelho medido antes da T1** (56 cláusulas sumidas), e toda
> sabotagem roda editar → rodar → restaurar dentro de **uma** aquisição da trava. **I7** o `propostaInvariantes` também mede com fonte de
> reserva sem o `npm run dev` → usa o helper. **M8** a A85 também lista as 5.25+ já apagadas pelo salvamento (`ativo = 0`). **M9** o
> `typeof real` não discrimina (a coluna `REAL` já converte `"10.5"`) → os controles são os 400. **M10** `false` inválido; ausente no
> `POST` e na geração = 0; ordem na geração: cliente/produtos → margem → desconto; no `PUT` a margem do corpo é normalizada **antes** de
> calcular `margemEf`, a recusa sai depois do título. **M11** `primeiraClausula` sai sem os filtros (a CF como primeira cláusula da seção 5
> sairia duas vezes) → D (139), anterior.
>
> **Trava de máquina:** `scratchpad/e139-lock.sh` (o diretório `maquina-testes.lock`). Um arquivo de teste de servidor por vez, inclusive
> os revisores; nunca `test:api` junto com o jest nem dois `test:api`. Revisão obrigatória: `scratchpad/e139/review-proposta.sh`.
>
> **Review obrigatório da proposta:** a etapa **toca o template** (`server/templates/propostaPremiumV2.js`, ramo das cláusulas
> customizadas — não o paginador) e o `index.js` (rotas de proposta). As 22 + o jsdom rodam antes de cada commit de código.

## Regras de negócio

Literais: **L-MARGEM** = *"Margem de desconto inválida: informe um número de 0 a 100, com ponto como separador decimal."*;
**L-DESC-POST** = *"Não é possível salvar uma proposta com desconto acima de 5% sem aprovação prévia. A proposta deve ser salva como
rascunho até que a autorização seja aprovada."* (a de hoje do `POST`); **L-DESC-PUT** = a de hoje do `PUT` (*"Não é possível alterar o
status..."*).

- **RN-139.01 — I1: nenhuma cláusula da entrada some.** Cláusulas no formato do banco: os padrões com a consideração final renumerada para
  `5.26 CONSIDERAÇÃO FINAL` e uma `5.25 CLAUSULA INCLUIDA PELO USUARIO` antes dela (o que o editor grava ao incluir uma cláusula). (a) o
  título `5.25 CLAUSULA INCLUIDA PELO USUARIO` aparece no `#proposalSource` **e** nas páginas geradas; (b) a página dela é **≥** a última
  página da tabela de preços e **≤** a da CONSIDERAÇÃO FINAL; (c) assinaturas na última página, 5.24 íntegra (I2–I6 inteiros neste
  cenário). Com duas (5.25 e 5.26 normais, CF 5.27): as duas, nessa ordem. A I1 de todos os cenários do `propostaInvariantes` passa a
  comparar **a entrada** (`clausulas_custom`) com as páginas — título da entrada (com o número, no formato do banco; `numero + titulo` no
  default) contido no texto das páginas; as do slot 24 (preço/condição) e as intro (1., 2., 3.) também contam.
- **RN-139.02 — I5: sumário que estoura some.** O cenário grande do `propostaSumarioOverflow` (3× os padrões, 87 cláusulas) → `tocVisivel
  false`, numeração consistente; o pequeno → visível, sem overflow. O teste ganha a I1 do cenário grande (todo título da entrada nas
  páginas), para nunca mais ficar verde/vermelho por cláusula sumida.
- **RN-139.03 — I9: o hero, medido com a imagem carregada.** O teste serve `assets/proposta` e `assets/fonts` num servidor efêmero
  (`tests/helpers/servirAssetsProposta.js`, mesmas rotas do `index.js`) e passa a URL dele ao template. (a) Preview (URL): `img.complete &&
  naturalWidth > 0`, senão falha com *"imagem do hero não carregou"* (nunca "linha branca"); geometria x/largura = página (±0,6 px);
  coluna 0 com **≤ 50 %** de brancos. (b) PDF (`forPdfServer`): as mesmas três. O teste não depende mais de nada na porta 5000.
- **RN-139.04 — margem lida por uma régua só (C299).** `lerMargemDesconto(valor)`: `null`, `''` ou só espaços → **0**; número finito em
  [0, 100] → ele; texto que é número com ponto (regex `^\s*\d+(\.\d+)?\s*$`) e em [0, 100] → `Number`; **qualquer outra coisa** (`"10,5"`,
  `"10abc"`, `-1`, `"-1"`, `101`, `true`, `[]`, `{}`, `NaN`, `Infinity`) → inválida. Inválida no corpo → **400 L-MARGEM**, nada gravado.
  (a) `POST /api/propostas` com `"10,5"` → 400, nenhuma proposta criada; com `"10.5"` e status rascunho → 201, gravada **10.5 numérico**
  (`typeof` no SQLite `real`); (b) `PUT /api/propostas/:id` com `"10abc"` → 400, nada muda (nem título que veio junto); com `-1` → 400; com
  `"7"` numa rascunho → 200 gravada 7; **ausente → mantém** (Etapa 138); `null` → 0. (c) a regra dos 5 % usa o número lido: `PUT
  {margem_desconto: "10,5", status: "enviada"}` numa rascunho sem aprovação → **400 L-MARGEM** (hoje **200**: `"10,5" > 5` é falso, a
  proposta fica *enviada* com o texto gravado); `PUT {margem_desconto: "10.5", status: "enviada"}` → **403 L-DESC-PUT**, nada muda. Ordem das recusas no `PUT`: 404 → título → **margem** → motivo →
  desconto. No `POST`: título → **margem** → motivo → cliente → desconto.
- **RN-139.05 — geração automática (C300).** `POST /api/propostas/gerar-automatica`: margem pela régua da RN-139.04 (400 L-MARGEM);
  margem > 5 com `status` presente e diferente de rascunho → **403 L-DESC-POST**, nada criado; margem > 5 sem status ou rascunho → criada
  como **rascunho**. O corpo da tela (`GerarPropostaModal`, sem margem nem status) → 200 como hoje. Ordem: cliente/produtos → margem →
  desconto.
- **RN-139.04d — a margem GRAVADA que a régua não lê conta como acima de 5 na regra do desconto (Fase 2, I5).** Proposta com `"10,5"`
  gravado (dado de antes desta etapa), rascunho, sem aprovação: `PUT {status: 'enviada'}` → **403 L-DESC-PUT**, nada muda (hoje 200). O
  título sozinho continua passando (a regra só roda quando status ou margem vieram).
- **RN-139.06 — a solicitação de aprovação usa a mesma régua (Fase 2, I4).** `POST /api/aprovacoes` com `valor_desconto` presente, não
  nulo e não vazio que a régua não lê (`"10,5"`, `500`, `-3`) → **400 L-MARGEM**, nada criado; `12.5` → criada como hoje.
- **RN-139.07 — o editor do preview não põe cláusula depois da consideração final (Fase 2, I2).** (a) "+ cláusula" na CF (a última
  editável, dentro da página de assinatura) insere a nova **antes da página de assinatura** — a renumeração dá 5.25 à nova e 5.26 à CF,
  a ordem salva fica [..., nova, CF]; (b) "descer" uma cláusula que está imediatamente antes da CF não faz nada; (c) "subir" a CF não faz
  nada. As outras inclusões e movimentos ficam como hoje.

## Contratos (congelados)

| Rota | Mudança | Respostas novas |
|---|---|---|
| `POST /api/propostas` | margem pela régua | 400 `{ error: L-MARGEM }` |
| `PUT /api/propostas/:id` | margem pela régua (só se presente) | 400 `{ error: L-MARGEM }` |
| `POST /api/propostas/gerar-automatica` | régua + regra dos 5 % | 400 L-MARGEM; 403 L-DESC-POST |
| `PUT /api/propostas/:id` | margem gravada ilegível conta como > 5 | 403 `{ error: L-DESC-PUT }` |
| `POST /api/aprovacoes` | `valor_desconto` pela régua (se não nulo/vazio) | 400 `{ error: L-MARGEM }` |
| `GET /api/propostas/:id/premium` e `/pdf` | as cláusulas 5.25+ normais aparecem | — |

Nenhuma migração. Nenhuma mudança de permissão.

## Tasks (sort topológico)

- [x] `f903440a` **T1 · tronco — o template volta a renderizar as cláusulas 5.25+ (RN-139.01).** Teste primeiro: `propostaInvariantes.test.js` ganha
  o cenário `banco+inclusao` (e `banco+duas`), e a I1 de todos os cenários passa a medir a entrada. Vermelho na `b3f4732d` (controle
  positivo: o cenário novo falha; os dois antigos continuam verdes com a I1 nova). Conserto: em `propostaPremiumV2.js`, ramo
  `clausulas_custom`, `clausulasPos525NormalHtml` = `demaisClausulas` com `subNumeroDe >= 25`, não consideração final e não texto da 5.24,
  renderizadas (`renderClausulaCustom`) entre `sec524PrecoHtml` e a página de assinatura; o comentário ao lado corrigido. Sem tocar no
  paginador (armadilha 4 não se aplica; armadilha 5 não muda — o sumário já renumera).
- [x] `56e35b99` **T5c · galho (client, depois da T1) — RN-139.07** em `clausulasInlineEditor.js` (`adicionarClausulaAoSource`,
  `moverClausulaNoSource`) com os cenários no `clausulasInlineEditor.test.js` (jsdom). Controle positivo: desfazer a guarda → vermelho.
- [x] `47a012a7` (T2a) e `f903440a` (T2b) **T2 (dividida na Fase 2 em T2a — hero, galho — e T2b — sumário, depois da T1) · os testes que medem o preview servem os próprios
  assets (RN-139.02, RN-139.03); o `propostaInvariantes` também.** `tests/helpers/servirAssetsProposta.js`
  (`express.static` das duas pastas, `listen(0,'127.0.0.1')`, devolve `{ baseURL, fechar }`). `propostaCapaHero`: os dois caminhos,
  `naturalWidth`. `propostaSumarioOverflow`: a URL do helper e a I1 do grande. Controle positivo do hero: sabotar o CSS do hero
  (`.cover-hero img { ... margin-left: 12px }` ou `width: 97%`) → vermelho por pixel/geometria; apontar o helper para pasta vazia →
  vermelho "não carregou". Controle do sumário: com o template da `b3f4732d` (antes da T1) → vermelho pela I1 e pelo sumário.
- [x] `5b6e9ef6` **T3 · galho — a margem (RN-139.04, RN-139.05).** `server/margemDesconto.js` + uso nas três rotas. Teste:
  `tests/api/propostaMargemInvalida.api.test.js` (molde: `putParcialMantem` — `index.js` de verdade em pasta vazia, porta livre) com os
  cenários a–c da RN-139.04 e os da RN-139.05, e uma unidade da régua no mesmo arquivo. Controle positivo: tirar a chamada no `PUT` →
  vermelho; trocar a regex por `parseFloat` → vermelho em `"10abc"`.
- [x] `f903440a` **T4 · integração (cruza a rota e o template) — a cláusula incluída pela rota sobrevive.** Em `tests/api/propostaClausulaAlem524.api.test.js`
  (mesmo molde): cria cliente e proposta; `POST /clausulas/inicializar`; renomeia a CF para `5.26 CONSIDERAÇÃO FINAL` (`PUT
  /clausulas/:id`); `POST /clausulas {titulo: '5.25 CLAUSULA DA ROTA'}`; `PUT /clausulas/reordenar` com ela antes da CF; `GET /premium`
  → o HTML contém `5.25 CLAUSULA DA ROTA` dentro do `#proposalSource` (o que o `diffClausulas` do preview lê — fora dele, o próximo
  salvamento a apagaria). E pelo serviço: a mesma lista chamando `gerarHTMLPropostaPremiumV2` direto (é o T1). Controle positivo: com o
  template da `b3f4732d` → vermelho.
- [x] `9189d7d0` **T5 · Fase 5** — três revisores frescos em paralelo sob a trava (regra, autorização, sabotagem).
- [x] **T6 · fechamento** (o commit de documentação) — skill `fechar-etapa`; `review-proposta.md` (I1 corrigida: era medida contra o `#proposalSource`; numeração
  das invariantes I2/I4/I7/I8 estava velha — hoje 5.24 é a seção de preço e 5.25 a consideração final; armadilha nova 16), specs da
  proposta editável, guia, manual (`GUIA_TREINAMENTO_COMPLETO.md`), novidades (A85 consulta das propostas com cláusula 5.25+ que reaparece;
  A86 consulta das margens fora da régua), a retro da 138.

## Pontos de atenção

- O `PUT` lê `margem_desconto` também para a regra dos 5 % pelo efetivo (`margemEf`): a régua normaliza o corpo **antes** (`corpo.margem_desconto
  = número`), para a regra, o `montarSetParcial` e o `proposta_revisoes` verem o número.
- O `POST` do formulário manda `margem_desconto: maxDesc` (número): nada muda para a tela.
- A A85 tem de vir junto: depois do deploy, as propostas que hoje escondem uma cláusula 5.25+ passam a mostrá-la (inclusive em PDF
  regerado de proposta já enviada).

## Execução (2026-10-17)

- **Fase 0** medida (o design tem a tabela): `propostaSumarioOverflow` vermelho desde **`a33dfca1`** (o caso grande: 40 páginas em
  `5485822f`, 19 em `a33dfca1`) = **regressão real de I1**; `propostaCapaHero` vermelho desde **`b8429e2d`** (0,0 % em `da2086c9`, 94,6 %
  em `b8429e2d`) = **régua do teste**. Rodado numa worktree própria (`CRM-wt-e139-old1`, junção de `node_modules`), um commit por vez sob a
  trava. O conserto da T1 aplicado à mão na `b3f4732d` devolveu o caso grande a **40** páginas e o sumário escondido.
- **Fase 2** (acima, no cabeçalho): 7 Important + 4 Minor, todos aceitos antes do código de produção; viraram RN-139.04d, 06, 07, a T5c,
  a divisão da T2 e a C301.
- **T1 · T2b · T4 — `f903440a`.** Testes antes: o cenário `banco+inclusao` vermelho (1 sumida), `banco+duas` (2), o sumário grande com
  **56** cláusulas sumidas, a rota com *"a 5.25 incluida sumiu do #proposalSource"*. Depois do conserto: verdes. Controles positivos: os três
  vermelhos com o template da `b3f4732d` (na worktree antiga — o sumário com **53** sumidas pela régua sem número); a posição invertida (as
  5.25+ antes da seção de preço) derruba o RN-139.01 (3) e o teste da rota. **Divergência:** a I1 do sumário compara o título **sem** o
  número — os blocos de texto da seção de preço depois do primeiro imprimem o número num atributo (`data-titulo-prefixo`), e o teste grande
  tem três deles; os títulos do teste são únicos pelo sufixo `VARIANTE k-i`.
- **T5c — `56e35b99`.** 4 cenários jsdom; sem as duas guardas, 3 caem.
- **T2a — `47a012a7`.** Controles: pasta de assets vazia → *"imagem do hero não carregou"*; hero com 97 % e margem → geometria e pixel
  vermelhos nos dois caminhos.
- **T3 — `5b6e9ef6`.** 11 cenários; tirar as cinco guardas das rotas → 8 vermelhos; a regex trocada por `parseFloat` → 7.
- **Suíte antes dos quatro commits** (a árvore com os quatro): `test:api` **458/458**; `test:almoxarifado` **44/0**; `test:validation` 4/0,
  `test:safealter` 3/0, `test:sqlite` 16/0; client **134** suítes / **1790** testes; `CI=true build` *Compiled successfully*; revisão
  obrigatória da proposta **22/22** + editor **36/36** (a primeira vez inteira verde desde julho).

## Fase 5 — três revisores frescos em paralelo, sob a trava

- **Regra (r1): 1 desta etapa + 1 afirmação errada do plano + 2 anteriores, todos Minor e reproduzidos.** (1) **"+ cláusula" na CF salvo sem
  preencher** deixava a CF gravada como 5.26 sem 5.25 (o salvamento descartava a nova vazia mas não desfazia a renumeração) — a RN-139.07
  abriu esse caminho no gesto mais natural; o mesmo buraco já abria no meio da lista (anterior). **Corrigido** em `9189d7d0`
  (`descartarClausulasNovasVazias`: tira a nova intocada do `#proposalSource` e, se tirou, renumera, antes de ler; o salvamento comum não
  muda título nenhum — **B904**). (2) **A frase deste plano "o dado já gravado assim se conserta no próximo salvamento" estava errada**: o
  salvamento não renumera (só incluir, mover ou remover renumeram) — corrigida no cabeçalho da Fase 2 e na D (139); a A85 lista essas
  propostas. (3) `PUT /api/aprovacoes/:id` copia para a margem o `valor_desconto` de uma aprovação **antiga** fora da régua (anterior;
  a A86 lista as aprovações fora da régua — entra na C303). (4) o editor mostra a numeração fora de ordem até salvar (anterior, D (139)).
- **Autorização (r2): 0 desta etapa; 2 High + 1 Important + 2 Minor anteriores, reproduzidos pela rota** com um vendedor sem permissão de
  aprovar: **o vendedor aprova o próprio desconto** (`PUT /api/aprovacoes/:id` não confere `pode_aprovar_descontos` nem quem pediu —
  **C302**); **a aprovação já nasce aprovada** (`POST /api/aprovacoes` grava o `status` e o `solicitado_por` do corpo — **C303**); o **C301**
  é mais largo do que a Fase 2 escreveu: `PUT {status: 'desconto_aprovado', margem_desconto: 50}` numa rascunho sem aprovação → 200, depois
  `/enviar` → enviada com 50 % (o texto do C301 já sai com isto); a tolerância de 0,01 do casamento com a aprovação deixa passar até ~0,015
  ponto (D (139)); `POST /api/aprovacoes` com proposta inexistente → 500 cru de chave estrangeira (D (139)). **Verificado e correto:** a
  corrida status × margem (10 de 10 com 409), a régua nas portas tocadas, nenhuma cláusula de outra proposta ou inativa no documento, o
  helper só em `127.0.0.1`, a ordem das recusas não vaza nada.
- **Sabotagem (r3): 50 sabotagens, 36 caíram, 14 sobreviveram — 10 por falta de cenário (viraram cenários) e 4 equivalentes** (provadas no
  relatório dele). Os cenários novos, cada um com o controle rodado **por mim** com a mesma mutação dele: **F01** (a CF duas vezes — sem
  `!ehConsideracaoFinal` no filtro) → o `propostaInvariantes` passa a exigir cada título da entrada **uma** vez, chaves únicas no
  `#proposalSource` e a CF só na página de assinatura (15 vermelhos); **F02** (o texto de preço legado com prefixo 5.25+ duplicado) →
  cenário `banco+preco-legado` (2 vermelhos); **F06** (as 5.25+ em ordem invertida na mesma página) → a ordem pela posição no texto (1
  vermelho); **B03/C01/D06/E02** (a margem crua gravada — `"   "` não vira REAL no SQLite) → cenário "só espaços grava o número 0" nas
  quatro portas (cada mutação cai na sua asserção); **B05/D03** (`>=` no lugar de `>`) → exatamente 5 % com *enviada* passa no `POST` e na
  geração; **A06** (`-0`) → `[-0, 0]` nos aceitos. **H02** (a rota das fontes errada no helper) **achou um defeito do próprio helper**: com
  a rota certa as fontes **também** davam `ERR_FAILED` — `@font-face` de outra origem exige CORS, imagem não; o helper servia o hero mas as
  medidas continuavam com a fonte de reserva. Corrigido (o helper usa o `cors()`, como o `index.js`) e o hero confere `document.fonts`
  (Century Gothic carregada, nenhuma com erro); com a rota errada, vermelho.

- **Suíte antes de `9189d7d0`** (o commit da Fase 5): `test:api` **458/458**; `test:almoxarifado` **44/0**; `test:validation` 4/0,
  `test:safealter` 3/0, `test:sqlite` 16/0; client **134** suítes / **1793** testes; `CI=true build` *Compiled successfully*; revisão
  obrigatória **22/22** (agora com as fontes carregadas) + editor **39/39**.
- **T6 — fechamento** (o commit de documentação): novidades (cabeçalho, A85, A86, B899–B905, C299 resolvida, C300–C303, D (139), F (139),
  a seção da etapa, "Onde estamos"); `review-proposta.md` (a numeração das invariantes estava velha, a I1 estava cega, a armadilha 13
  dizia slot 23 — corrigidas dizendo que estavam erradas; armadilhas 16 e 17), `backend.md` (a régua da margem), `template.md` (a tabela
  das seções chamava a seção de preço de 5.23 — corrigida); o design (o que a Fase 2 e a 5 mudaram); o mapa (a linha do topo); o guia
  (cabeçalho, seção, roteiro); **manual**: `docs/GUIA_TREINAMENTO_COMPLETO.md`, 3.3.3 (a margem, a geração automática, onde cada cláusula
  aparece) — o `docs/almoxarifado-manual-do-sistema.md` não foi tocado (declara não cobrir os outros módulos); este plano; o "defeito que
  escapou" da retro da 138.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** (a Fase 5: o descarte da nova vazia, o CORS do helper e os 10 cenários do r3). Testes antigos
   mudados: **3** (`propostaCapaHero` e `propostaSumarioOverflow`, que estavam errados ou cegos — dito no cabeçalho de cada um; o
   `propostaInvariantes`, que ganhou a I1 pela entrada).
2. **Achados da revisão:** Fase 2 — **7 Important + 4 Minor, todos reais**. Fase 5 — r1 **1** desta etapa (corrigido) + **1** afirmação
   errada do plano (corrigida) + **2** anteriores; r2 **0** desta etapa + **5** anteriores (C301 ampliada, C302, C303, 2 em D); r3 **10**
   sobreviventes reais (viraram cenários, um deles achou o CORS) + **4** equivalentes; **0** ruído.
3. **Paralelismo:** **0** galhos em paralelo de fato (a mesma árvore e o "um teste de servidor por vez"); **0** retrabalho; **1** revisor na
   Fase 2, **3** em paralelo na Fase 5 sob a trava (o r3 na worktree própria `CRM-wt-e139-r3`, removida, com a branch apagada).
4. **Defeito que escapou:** *(preencher na Etapa 140)*.

## Próxima tarefa detalhada — Etapa 140

*(A série desta etapa foi B899–B905, C300–C303, A85–A86 — a 140 começa em **B906**, **C304**, **A87**; confira com `grep -oE` antes.)*

**Escolhida: a autorização do desconto acima de 5 % — C302, C303 e C301** (das propostas). A régua da margem desta etapa fechou a porta do
formato; a revisão mostrou que **qualquer vendedor libera o próprio desconto** por três caminhos, todos reproduzidos pela rota real:
(1) `PUT /api/aprovacoes/:id {status: 'aprovado'}` pelo próprio solicitante, sem `pode_aprovar_descontos` → a proposta vira
`desconto_aprovado` e é enviada; (2) `POST /api/aprovacoes {..., status: 'aprovado'}` já nasce aprovada (e `solicitado_por` é livre);
(3) `PUT /api/propostas/:id {status: 'desconto_aprovado', margem_desconto: 50}` numa rascunho sem aprovação → 200, e `POST
/api/propostas/:id/enviar` (que não olha a margem) → enviada. **Fase 0:** medir quem chama cada rota pela tela (`Aprovacoes.js`,
`PropostaForm.js` — o formulário cria a aprovação e o aprovador a decide), quem tem `pode_aprovar_descontos` em produção (consulta A), e se
o administrador/super aprova hoje sem a coluna. **Desenho reversível sugerido:** decidir aprovação exige `pode_aprovar_descontos = 1` (ou
super) e **não** ser o solicitante; a criação grava sempre *pendente* e o `solicitado_por` de quem pede (`req.user`); `desconto_aprovado` só
pela aprovação (o `PUT` da proposta recusa entrar nele por conta própria); `/enviar` e a troca de margem numa *desconto_aprovado* passam pela
regra dos 5 % pelo efetivo (com a mesma aprovação que casa). **Pontos de atenção:** a guarda `CAMPOS_CRUZADOS` da 138 e o 409; as mensagens
literais novas; `ACAO_PERFIS` **não** cobre propostas (a autorização aqui é por coluna do usuário — confirmar na Fase 0); a A86 desta etapa
(aprovações antigas fora da régua). **Se a medição achar que é regra do P.O.** (quem pode aprovar o próprio desconto é regra de negócio):
escolher o caminho reversível e registrar em B, não parar. **Alternativa:** o índice e a paginação da lista de propostas
(`specs/lentidao-api-propostas/2026-07-21-lentidao-api-propostas.md`, Frente B), ou a **C297**.

**Dependem do P.O. — NÃO implemente:** **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**,
**C219**, **C230**, o reparo da **C246** (e a **C247**), a tabela de conversões e o grupo acima de família, a **régua do tempo de
recebimento (E2)**, a **C268**, a **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens
de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**,
**B101**/G30, **G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62; nas propostas, a verificação do dono da proposta
(Fase 12 de `specs/proposta-editavel/tasks.md`) e o filtro por permissão do histórico (`auditoria.md`). Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** `lerMargemDesconto`/`MSG_MARGEM_INVALIDA` (`server/margemDesconto.js`) — a régua única da
margem, nas quatro portas; a margem gravada ilegível conta como acima de 5 no `PUT`; o helper `tests/helpers/servirAssetsProposta.js`
(assets e fontes, com CORS) para qualquer teste de navegador da proposta; a revisão obrigatória da proposta **22/22 verde** — mantê-la verde
é critério de toda etapa que tocar template, cláusulas ou rotas de proposta; os moldes `propostaMargemInvalida.api.test.js` e
`propostaClausulaAlem524.api.test.js`.
