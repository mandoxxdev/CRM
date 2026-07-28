# REVIEW OBRIGATÓRIO — Proposta (template/paginação/edição)

> **Leia e execute ANTES de mesclar qualquer mudança** em `server/templates/propostaPremiumV2.js`,
> `server/clausulasDefault.js`, `server/index.js` (rotas `/premium`, `/pdf`, cláusulas, customizações)
> ou `client/src/components/proposta/*`. Este arquivo é o contrato da feature.

## Invariantes — regras que NUNCA podem quebrar

| # | Invariante | Verificado por |
|---|---|---|
| I1 | **Nenhuma cláusula some.** Toda cláusula presente na fonte (`#proposalSource`) aparece nas páginas geradas — em qualquer formato de dado (default ou banco) | `propostaInvariantes.test.js` |
| I2 | **5.24 (CONSIDERAÇÃO FINAL) sempre DEPOIS da 5.23** (tabela de preços + condição de pagamento) — nunca no meio da lista | `propostaInvariantes.test.js` |
| I3 | **Assinaturas sempre na ÚLTIMA página** (com a 5.24 imediatamente antes/junto) | `propostaInvariantes.test.js` |
| I4 | **Tabela da 5.23 íntegra e em ordem**: todas as linhas (nº itens + TOTAL), montada completa ANTES da condição de pagamento; todo fragmento repetindo o `thead` | `propostaInvariantes.test.js`, `proposta523OrdemCondicao.test.js`, `proposta523TheadRepetido.test.js` |
| I5 | **Numeração `Pág. X/Y` contínua e consistente**, com ou sem sumário (sumário visível ⇔ cabe na página; escondido quando estoura) | `propostaInvariantes.test.js`, `propostaSumarioOverflow.test.js` |
| I6 | **Nada ultrapassa o rodapé** — nenhum bloco além da área útil de nenhuma página gerada | `propostaInvariantes.test.js` + script de overflow |
| I7 | Seção **4**, seção 5, 5.23 e 5.24 iniciam em **página nova** (`data-page-break="before"`). A 4 é verificada nos dois ramos: com itens e sem nenhum item | `propostaQuebras.test.js` |
| I8 | 5.23 (preço/FINAME/fiscais) renderiza nos **dois caminhos** (default e custom/inline), com os **textos editáveis** (abertura e condição de pagamento) e as **tabelas calculadas** | `proposta523Fixa.test.js`, `proposta523Editavel.test.js` |
| I9 | Capa: hero 100% da largura sem faixa branca; nome/**contato**/CNPJ/email/telefone presentes, centralizados e com rótulo em cima | `propostaCapaHero.test.js` (pixel exige `pngjs`), `propostaCapaContatoCadastro.test.js`, `propostaCapaContato.test.js`, `propostaCapaCamposCentralizados.test.js` |
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
7. **Payload parcial nunca pode zerar colunas não enviadas** (bugs históricos: itens perdiam `modelo`/`descritivo_tecnico`; editar nome apagava email). Ver `mesclarItensPreservandoCampos` e `resolverCamposCustomizacao`.
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
13. **O que é `data-clausula-slot="23"`.** Marca os blocos de texto que moram DENTRO da seção de
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
node tests/propostaCustomizacoes.test.js

# Client (jsdom)
cd ../client && CI=true npx react-scripts test src/components/proposta/clausulasInlineEditor.test.js --watchAll=false
```

Critério: **tudo verde**. Qualquer invariante quebrado bloqueia o merge.

## Validação manual complementar (quando mexer em área visual)

- Abrir uma proposta REAL grande (ex.: 288, 30 itens, cláusulas customizadas) no preview editável e percorrer todas as páginas.
- Conferir: capa (hero/campos, incluindo o **contato**) → sumário (presente ou ausente conforme couber) → seções 1–4 → 5.1–5.22 → 5.23 (abertura → tabela completa → condição de pagamento → FINAME/fiscais) → 5.24 + assinaturas na última página.
- Editar os textos da 5.23 no preview, salvar, recarregar e baixar o PDF: o texto novo tem de
  sobreviver nos dois, e a tabela de preços tem de continuar entre a abertura e a condição.
- Baixar o PDF e repetir a conferência (o PDF usa o mesmo paginador).
- Console do navegador sem erros.
