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
| I8 | 5.23 (preço/FINAME/fiscais) renderiza nos **dois caminhos** (default e custom/inline) | `proposta523Fixa.test.js` |
| I9 | Capa: hero 100% da largura sem faixa branca; nome/CNPJ/email/telefone presentes | `propostaCapaHero.test.js` (pixel exige `pngjs`), `propostaCapaContatoCadastro.test.js` |
| I10 | **Tabela DADOS DA CONTRATADA sozinha na página**, e a paginação não muda conforme a imagem carrega (mesmo resultado com imagem presente, ausente/404 ou chegando tarde) | `propostaTabelaContratadaPaginaPropria.test.js` |
| I11 | **PDF abaixo do teto de peso**: fotos entram como JPEG (`DCTDecode`), preview segue em WebP por URL, logos permanecem PNG | `propostaPdfPesoImagens.test.js` |

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
node tests/propostaTabelaContratadaPaginaPropria.test.js
node tests/propostaPdfPesoImagens.test.js

# Rápidos (node puro)
node tests/proposta523Fixa.test.js
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
- Conferir: capa (hero/campos) → sumário (presente ou ausente conforme couber) → seções 1–4 → 5.1–5.22 → 5.23 (tabela completa → condição) → 5.24 + assinaturas na última página.
- Baixar o PDF e repetir a conferência (o PDF usa o mesmo paginador).
- Console do navegador sem erros.
