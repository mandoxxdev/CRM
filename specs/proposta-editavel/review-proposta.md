# REVIEW OBRIGATÓRIO — Proposta (template/paginação/edição)

> **Leia e execute ANTES de mesclar qualquer mudança** em `server/templates/propostaPremiumV2.js`,
> `server/clausulasDefault.js`, `server/index.js` (rotas `/premium`, `/pdf`, cláusulas, customizações)
> ou `client/src/components/proposta/*`. Este arquivo é o contrato da feature.

## Invariantes — regras que NUNCA podem quebrar

> **Numeração (corrigida na Etapa 139 — a tabela abaixo estava velha):** desde `a33dfca1` (28/07/2026) a seção de **preço** (tabela,
> condição de pagamento, FINAME/fiscais) é a **5.24** e a **CONSIDERAÇÃO FINAL** é a **5.25**; a **5.23** é uma cláusula comum (ITENS
> EXCLUSOS no padrão). Onde a tabela diz "5.23" leia **seção de preço (5.24)**; onde diz "5.24 CONSIDERAÇÃO FINAL" leia **5.25**. Os testes
> já usavam a numeração nova; só este texto não.

| # | Invariante | Verificado por |
|---|---|---|
| I1 | **Nenhuma cláusula some.** Toda cláusula **da entrada** (`clausulas_custom`) aparece nas páginas geradas, **uma vez só**, em qualquer formato de dado (default ou banco) — inclusive as **5.25+ que não são a consideração final**, que saem depois da seção de preço e antes da página de assinatura. *Até a Etapa 139 esta linha dizia "toda cláusula presente na fonte (`#proposalSource`)" e o teste media isso — **estava errado**: a cláusula que o template deixa de renderizar some da fonte e das páginas, e comparar uma com a outra não via nada (foi assim que as 5.25+ sumiram de `a33dfca1` à Etapa 139 sem a revisão acusar).* | `propostaInvariantes.test.js` (cenários `banco+inclusao`, `banco+duas`, `banco+preco-legado`), `propostaSumarioOverflow.test.js`, `tests/api/propostaClausulaAlem524.api.test.js` |
| I2 | **5.24 (CONSIDERAÇÃO FINAL) sempre DEPOIS da 5.23** (tabela de preços + condição de pagamento) — nunca no meio da lista | `propostaInvariantes.test.js` |
| I3 | **Assinaturas sempre na ÚLTIMA página** (com a 5.24 imediatamente antes/junto) | `propostaInvariantes.test.js` |
| I4 | **Tabela da 5.23 íntegra e em ordem**: todas as linhas (nº itens + TOTAL), montada completa ANTES da condição de pagamento; todo fragmento repetindo o `thead` | `propostaInvariantes.test.js`, `proposta523OrdemCondicao.test.js`, `proposta523TheadRepetido.test.js` |
| I5 | **Numeração `Pág. X/Y` contínua e consistente**, com ou sem sumário (sumário visível ⇔ cabe na página; escondido quando estoura) | `propostaInvariantes.test.js`, `propostaSumarioOverflow.test.js` |
| I6 | **Nada ultrapassa o rodapé** — nenhum bloco além da área útil de nenhuma página gerada | `propostaInvariantes.test.js` + script de overflow |
| I7 | Seção **4**, seção 5, 5.23 e 5.24 iniciam em **página nova** (`data-page-break="before"`). A 4 é verificada nos dois ramos: com itens e sem nenhum item | `propostaQuebras.test.js` |
| I8 | 5.23 (preço/FINAME/fiscais) renderiza nos **dois caminhos** (default e custom/inline), com os **textos editáveis** (abertura e condição de pagamento) e as **tabelas calculadas** | `proposta523Fixa.test.js`, `proposta523Editavel.test.js` |
| I9 | Capa: hero 100% da largura sem faixa branca; nome/**contato**/CNPJ/email/telefone presentes, centralizados e com rótulo em cima. O hero é medido **com a imagem carregada**, no preview (URL) e no PDF (embutido) — de `b8429e2d` à Etapa 139 o teste acusava "linha branca" porque a imagem não carregava sem um servidor na porta 5000 (o teste estava errado, não a capa) | `propostaCapaHero.test.js` (pixel exige `pngjs`), `propostaCapaContatoCadastro.test.js`, `propostaCapaContato.test.js`, `propostaCapaCamposCentralizados.test.js` |
| I10 | **Tabela DADOS DA CONTRATADA sozinha na página**, e a paginação não muda conforme a imagem carrega (mesmo resultado com imagem presente, ausente/404 ou chegando tarde) | `propostaTabelaContratadaPaginaPropria.test.js` |
| I11 | **PDF abaixo do teto de peso**: fotos entram como JPEG (`DCTDecode`), preview segue em WebP por URL, logos permanecem PNG | `propostaPdfPesoImagens.test.js` |
| I12 | **Número da proposta no cabeçalho**, na mesma linha do título: `PROPOSTA TÉCNICA COMERCIAL: Nº <numero>` (número num `<span class="page-header-num">`) | `propostaHeaderNumero.test.js`, `propostaHeaderPadraoSempre.test.js` |
| I13 | **Round-trip do título de cláusula**: `data-titulo-prefixo` + texto visível = título salvo. Se a soma mudar, o bloco sai do slot 23 e a 5.23 se parte no meio da lista | `proposta523Editavel.test.js` |

## ⚠️ Armadilhas conhecidas (causas de bugs reais — não repetir)

1. **Cláusulas do banco NÃO têm campo `numero`.** A tabela `proposta_clausulas` guarda o número no PREFIXO do `titulo` ("5.24 CONSIDERAÇÃO FINAL"). Qualquer lógica que dependa de `c.numero` funciona nos testes com defaults e **quebra em produção** (bug da 288: 5.24 "sumiu" do fim do documento). Use extração do prefixo do título como fallback (ver `subNumeroDe` em `clausulasSection`).
2. **Teste com o formato REAL do banco.** Objetos fabricados de `getClausulasDefault()` têm `numero`; linhas reais têm `id/titulo/conteudo/ordem`. O `propostaInvariantes.test.js` roda os DOIS cenários por isso.
3. **Irmãos posteriores no split.** `splitBlockByChildren`/`splitTextLeaf` devem manter irmãos ANTERIORES na 1ª parte e emitir os POSTERIORES na parte final (`montarParteFinalIrmaosPosteriores`) — senão a ordem do documento embaralha (bug: condição de pagamento antes do fim da tabela).
4. **O script do paginador é template literal** — regex dentro dele exige escape duplo (`\\d`, `\\2713`).
5. **Sumário ↔ numeração:** esconder/mostrar `#tocPage` exige renumerar (preencher → medir → decidir → renumerar → repreencher).
6. **`industria40.png` foi aparado** (tinha margem transparente à esquerda). Se substituir a imagem, rodar `propostaCapaHero.test.js` **com `pngjs` instalado**.
7. **Payload parcial nunca pode zerar colunas não enviadas** (bugs históricos: itens perdiam `modelo`/`descritivo_tecnico`; editar nome apagava email; e — até a Etapa 138 — o `PUT /api/propostas/:id` inteiro: só o título zerava valor, cliente, status e **apagava os itens**, e o salvamento do formulário zerava projeto, contatos, idioma, moeda, incoterm e unidade de negócio). Ver `mesclarItensPreservandoCampos`, `resolverCamposCustomizacao` e `montarSetParcial` (`server/atualizacaoParcial.js`): **chave ausente = a coluna nem entra no `UPDATE`; presente (inclusive `null`/`''`) = grava com a transformação de sempre**. Consequência para o client: o formulário que quer **apagar** um campo manda `null`, nunca `undefined` (o JSON omite a chave e o servidor manteria o valor) — ver `montarPayloadProposta` (`client/src/components/proposta/payloadProposta.js`). Exceções de propósito: `html_rendered` é limpo em todo salvamento (o retrato do PDF só é regravado com ele vazio); `probabilidade` e `responsavel_id` vazios mantêm. Testes: `server/tests/api/putParcialMantem.api.test.js`.
8. **Cabeçalho/rodapé por imagem NÃO existe mais.** `header_image_url`/`footer_image_url` continuam
   no banco mas são ignorados pelo template. Não reintroduzir: a imagem escondia o
   `.page-header-inner` inteiro e, com ele, o `Nº da proposta` (bug de produção 24/07/2026 — só
   aparecia em prod, porque o arquivo referenciado não existe no disco local). Ver
   `propostaHeaderPadraoSempre.test.js`.
9. **`<img>` sem `width`/`height` mede 0px até baixar.** A paginação decide as páginas medindo o
   DOM; um `<img>` carregado por URL (o caso do preview, que não usa base64) só tem altura depois
   que os bytes chegam. Sem os atributos, o bloco "cabe" numa fração da página, o paginador puxa
   os blocos seguintes para junto dele e, quando a imagem materializa a altura real, esse conteúdo
   vai para baixo do rodapé e o `overflow:hidden` o corta — **sem erro nenhum no console**. Foi o
   bug da proposta 87 (27/07/2026): as seções 1–4 iam parar na página da tabela DADOS DA CONTRATADA
   e o documento parecia pular da 1 direto para a 5. Toda `<img>` que participa da paginação precisa
   de `width`/`height` reais (ver `dimensoesImg`), e blocos que devem ser donos da página usam
   `data-page-break-after="true"` em vez de depender da altura medida.
10. **WebP/PNG fotográfico infla o PDF ~10x.** O Chrome só copia JPEG para dentro do PDF sem
    recomprimir; WebP e PNG viram bitmap Flate. Ao trocar/adicionar uma FOTO em
    `server/assets/proposta/`, gere também o gêmeo `.jpg` (o template o usa sozinho no PDF, ver
    `versaoParaPdf`). Não faça isso com logo (perde transparência) nem com `dados-contratada.png`
    (texto borraria). Ver `propostaPdfPesoImagens.test.js`.
11. **Medições de altura acontecem ANTES da edição inline injetar UI** — controles de edição devem ficar fora do fluxo (`position:absolute`) e `min-height` via CSS `:empty` (bug histórico `2a69dbc`).
12. **Número de cláusula NÃO identifica a CONSIDERAÇÃO FINAL.** Antes de o slot 23 ser reservado,
    o `/clausulas/inicializar` gravava a consideração final como **`5.23 CONSIDERAÇÃO FINAL`** — e
    existe proposta assim em produção (74). Como o slot 23 agora é dos TEXTOS da 5.23, classificar
    só pelo número fazia essa cláusula tomar o lugar da abertura da 5.23: a **CONDIÇÃO DE PAGAMENTO
    sumia inteira** do documento e a consideração final subia para antes da tabela de preços
    (violando I2). O template usa `ehConsideracaoFinal()` (título sem acento/caixa começando por
    "consideracao final") para mandá-la sempre para a página de assinatura, qualquer que seja o
    número salvo. Travado em `proposta523Editavel.test.js`.
13. **O que é `data-clausula-slot="24"`** *(este item dizia `"23"` — **estava velho**: desde `a33dfca1` a seção de preço é a 5.24 e o atributo é `"24"`; corrigido na Etapa 139)*. Marca os blocos de texto que moram DENTRO da seção de
    preço (entre a tabela de preços e as tabelas fiscais). Eles são cláusulas de verdade — editáveis
    e persistidas — mas ficam de fora da renumeração, da contagem 5.1…5.22/5.24, da reordenação e
    da barra de controles inline. Mover uma cláusula "para dentro" desse grupo quebraria a ordem
    tabela completa → condição de pagamento (I4). Ver `clausulasInlineEditor.js`
    (`CLAUSULA_EDITAVEL_SELECTOR`) e `clausulasInlineEditor.test.js`.
14. **Estilo inline em texto de cláusula não sobrevive ao primeiro save.** O conteúdo é gravado
    como TEXTO (`htmlParaTexto`) e volta re-embrulhado em `<p>`; qualquer `style="..."` dos
    parágrafos padrão se perde. Foi por isso que o `line-height: 26px` da condição de pagamento
    virou regra de classe no container (`.clausula-523-condicao > p`) — se ficasse inline, a altura
    medida pelo paginador mudaria depois da primeira edição do usuário.
15. **`clientes.contato_principal` não está nos SELECTs de `/premium` e `/pdf`.** O contato da capa
    cai para `cliente_contato_cadastro`/`contato_principal`, mas **nenhuma** das 56 propostas do
    banco tem `propostas.cliente_contato` preenchido — sem acrescentar
    `c.contato_principal as cliente_contato_cadastro` às duas queries de `server/index.js`, a capa
    mostra `—` para todas. Ver a nota em `template.md`.

16. **Cláusula 5.25+ que não é a CONSIDERAÇÃO FINAL é cláusula de verdade.** A renumeração do editor (`renumerarClausulas`) pula o 24
    (a seção de preço): incluir **uma** cláusula numa proposta padrão já gera uma **5.25** normal e empurra a consideração final para
    5.26. O template as renderiza depois da seção de preço e antes da página de assinatura (`clausulasPos525NormalHtml`). **Nunca as
    filtre sem renderizar:** de `a33dfca1` à Etapa 139 o filtro ficou e a renderização saiu — elas sumiam do preview e do PDF e, como o
    salvamento do preview marca como removida toda cláusula do banco ausente do `#proposalSource`, a edição seguinte as **apagava**
    (`ativo = 0`). E o editor não põe nada depois da CF (`naPaginaDeAssinatura`), senão a ordem impressa sai 5.24 → 5.26 → 5.25.
17. **Teste de navegador da proposta serve os próprios assets.** O preview pede hero, logos e **fontes** por URL
    (`${baseURL}/api/assets/...`, padrão `http://localhost:5000`). Abrir o HTML como arquivo sem servidor mede com imagem quebrada e
    fonte de reserva — o resultado muda conforme haja ou não um `npm run dev` de pé. Use `tests/helpers/servirAssetsProposta.js` (com
    **CORS**: `@font-face` de outra origem é bloqueada sem ele, imagem não) e passe `baseURL` como 5º argumento do template.

18. **O total do documento mora em `server/totalDocumentoProposta.js`** (Etapa 141). O `/premium` e o `/pdf` tinham duas cópias da mesma
    conta ("mexeu num, mexa no outro"); agora as duas rotas e o pedido de aprovação do desconto usam `subtotalDosItens`/`totalDoDocumento`.
    E as duas rotas recusam (403) a proposta com desconto acima de 5% sem aprovação que case **antes** de montar o documento — os testes de
    navegador desta revisão chamam o template direto e não passam por essa recusa; a rota é provada em `tests/api/propostaDocumentoDesconto.api.test.js`.

19. **O item da proposta é reconhecido pelo `id` que a tela manda** (Etapa 142, C298/C308/C309). O `PUT /api/propostas/:id` apaga e
    reinsere os itens; `parearItens` (`server/propostaItensDiff.js`) diz qual gravado cada item do corpo é — pelo `id` quando a tela o manda
    (`montarPayloadProposta` + o carregamento do `proposta/PropostaForm.js`), senão pela posição entre os iguais. A mesclagem dos campos
    preservados e a religação das variáveis manuais usam **o mesmo** pareamento; a variável do item que saiu é **aposentada**
    (`item_removido_em`), nunca apagada; o reparo da leitura (`server/variaveisManuaisItens.js`, do `/premium` e do `/pdf`) agrupa por item
    velho e só preenche item sem variável viva. **Nunca volte a um `Map` por `chaveDe`**: com o mesmo produto duas vezes ele guarda só o
    último, e todo salvamento copiava a descrição da tabela, a tag e os acessórios do último para os outros (C308).

20. **O produto do item se junta por um texto só, e no máximo um por item** (Etapa 143, C311). `JOIN_PRODUTO_DO_ITEM`
    (`server/totalDocumentoProposta.js`) é o `LEFT JOIN produtos` do `/premium`, do `/pdf` e da conta do pedido de aprovação (`ITENS_SQL`):
    o produto de código igual ao do item, senão o de código igual **aparado** de menor id; item sem código (ou só espaços) não junta nada.
    **Nunca volte a `TRIM(a) = TRIM(b)` puro**: o `UNIQUE` de `produtos.codigo` é do texto cru e o cadastro não apara — com `'PJ1'` e
    `'PJ1 '` o item saía duas vezes no documento (e o total do pedido de aprovação, em dobro), e com um produto de código só de espaços todo
    item manual juntava esse produto. Na mesma etapa: o `PUT`/`POST` de `/api/propostas` e a geração automática recusam (400) o item que
    não é objeto, ou cujo campo (fora `acessorios`) é objeto ou lista, **antes** de gravar (`validarItensDoCorpo`, C310, B934) — `[null]`
    e `[{ descricao: {} }]` faziam o `PUT` nunca responder; e o histórico de itens
    (`diffItensParaLog`) pareia pelo mesmo `parearItens` da armadilha 19.

## Como rodar a validação (obrigatório antes de merge)

```bash
cd server
# Suite de invariantes (a mais importante — cobre I1..I6 nos dois formatos de dado)
node tests/propostaInvariantes.test.js

# Regressões específicas (puppeteer)
node tests/proposta523OrdemCondicao.test.js
node tests/proposta523TheadRepetido.test.js
node tests/propostaQuebras.test.js
node tests/propostaSumarioOverflow.test.js
node tests/propostaCapaHero.test.js
node tests/propostaCapaCamposCentralizados.test.js
node tests/propostaTabelaContratadaPaginaPropria.test.js
node tests/propostaPdfPesoImagens.test.js

# Rápidos (node puro)
node tests/proposta523Fixa.test.js
node tests/proposta523Editavel.test.js
node tests/propostaCapaContato.test.js
node tests/propostaClausulasInline.test.js
node tests/propostaCapaContatoCadastro.test.js
node tests/propostaDescritivoOrdem.test.js
node tests/propostaHeaderNumero.test.js
node tests/propostaHeaderPadraoSempre.test.js
node tests/propostaCapaLogoCliente.test.js
node tests/propostaFonteEmbed.test.js
node tests/propostaDiffItens.test.js
node tests/propostaItensPreservar.test.js
node tests/propostaItensIguais.test.js        # Etapa 142: itens iguais — o pareamento, a mesclagem, a religação e o reparo
node tests/propostaCustomizacoes.test.js

# Client (jsdom)
cd ../client && CI=true npx react-scripts test src/components/proposta/clausulasInlineEditor.test.js --watchAll=false
```

E pela rota (o `index.js` real, em pasta vazia — entra no `npm run test:api`):

```bash
cd server && node tests/api/propostaClausulaAlem524.api.test.js   # a 5.25 incluída pelas rotas sai no preview (I1)
cd server && node tests/api/propostaItensIguais.api.test.js       # Etapa 142: itens iguais pelo PUT, o /premium e o preview
cd server && node tests/api/propostaItemInvalido.api.test.js     # Etapa 143: o item que não é objeto (C310), o histórico e um produto por item (C311)
cd server && node tests/api/propostaProdutoInexistente.api.test.js  # Etapa 144: o produto que não existe na geração automática (C313) e o preview numa aba velha (ignorados)
cd server && node tests/api/propostaPortaoModulo.api.test.js       # Etapa 145: o portão do Comercial nas 49 rotas da proposta e nas 5 de aprovação (C317)
cd server && node tests/api/propostaGeracaoGrava.api.test.js       # Etapa 145: a geração automática grava antes de responder (C318) e o cliente que não existe (C315)
cd server && node tests/api/propostaSalvarGrava.api.test.js       # Etapa 146: criação, salvamento e cópia gravam os itens antes de responder (C323) e o cliente do salvamento (C322)
cd server && node tests/api/propostaClausulasGrava.api.test.js    # Etapa 147: inicializar e reordenar as cláusulas gravam em sequência, tudo ou nada (C327)
cd server && node tests/api/propostaModeloPortao.api.test.js      # Etapa 147: o portão no modelo da proposta e nas listas de preço (C319, C329) e o PDF pela rota
cd server && node tests/api/osModeloContratoPortao.api.test.js    # Etapa 148: o portão na OS pelo número e no modelo de contrato por família (C335, C341) e o PDF da OS pela rota
cd server && node tests/api/familiasListaOsPortao.api.test.js    # Etapa 149: o portão no cadastro de família (as famílias que o template lê) e na lista de OS (C343, C345)
cd server && node tests/api/produtosGruposVariaveisPortao.api.test.js  # Etapa 150: o portão nos produtos e nas variáveis técnicas que a proposta lê (C346, C347)
cd server && node tests/api/clientesProjetosPortao.api.test.js   # Etapa 151: o portão nos clientes, projetos e oportunidades que a proposta lê (C349)
```

Critério: **tudo verde**. Qualquer invariante quebrado bloqueia o merge. *(De julho à Etapa 138 a revisão rodava com dois vermelhos
conhecidos — `propostaSumarioOverflow` e `propostaCapaHero`; a Etapa 139 achou que o primeiro era uma regressão real de I1 e o segundo
um teste errado, e a revisão voltou a 22/22. A Etapa 142 acrescentou o `propostaItensIguais.test.js`: **23/23**.)*

## Validação manual complementar (quando mexer em área visual)

- Abrir uma proposta REAL grande (ex.: 288, 30 itens, cláusulas customizadas) no preview editável e percorrer todas as páginas.
- Conferir: capa (hero/campos, incluindo o **contato**) → sumário (presente ou ausente conforme couber) → seções 1–4 → 5.1–5.23 → 5.24 (abertura → tabela completa → condição de pagamento → FINAME/fiscais) → as 5.25+ incluídas pelo usuário, se houver → consideração final + assinaturas na última página.
- Incluir uma cláusula pelo "+ cláusula" da consideração final, salvar, recarregar: a nova aparece (5.25) depois da seção de preço e a consideração final vira 5.26.
- Editar os textos da 5.23 no preview, salvar, recarregar e baixar o PDF: o texto novo tem de
  sobreviver nos dois, e a tabela de preços tem de continuar entre a abertura e a condição.
- Baixar o PDF e repetir a conferência (o PDF usa o mesmo paginador).
- Console do navegador sem erros.
