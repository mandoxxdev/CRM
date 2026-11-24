# Propostas — Etapa 1: proposta bilíngue (PT-BR + EN/ES), moeda e incoterm

Spec: `specs/proposta-bilingue/README.md` (RN-BI.01 a RN-BI.10). Estimativa: `docs/estimativas/2026-11/estimativa_2026-11-24_proposta-bilingue.txt`
(10h, 6 tarefas). Mapa do código (agente de leitura, 24/11/2026) resumido em "Onde mexer".

## Onde mexer (medido)

- **Template** `server/templates/propostaPremiumV2.js`: capa T:2063-2098, apresentação T:2100-2130 (fixa, fora do paginador),
  cabeçalho/rodapé T:1570-1597, seção 1–3 `secoesIntroHtml` T:998, seção 4 `equipDescritivoHtml` T:814 / `equipItems` T:529-805,
  cláusulas `clausulasSection` T:1177-1262 (o ramo fixo T:1276-1567 é morto em produção: `carregarClausulasDaProposta` sempre devolve
  linhas), preço `sec524PrecoHtml` T:1031-1166 + `tabelaPrecosRows` T:828-888, FINAME T:1075, fiscais T:1105-1166, assinatura T:1173-1259.
- **Paginação** (inline, T:2427): blocos = filhos de `#proposalSource`; `getKeepPair` só olha heading **filho direto**;
  `splitBlockByChildren` divide o elemento com mais filhos; sumário pega **todo h2/h3** numerado.
- **Editor** `client/src/components/proposta/PropostaPreviewEditavel.js` + `clausulasInlineEditor.js`: o conteúdo da cláusula salvo é o
  `innerHTML` de **todos** os `[data-clausula-campo="conteudo"]` da mesma key, achatado por `htmlParaTexto`.
- **Slots de cláusula pelo título PT** (`ehSecaoIntro`, `ehTextoDa524`, `ehConsideracaoFinal`): a tradução **nunca** vai no título gravado.
- **Formulário** roteado: `client/src/components/proposta/PropostaForm.js` (o `components/PropostaForm.js` é morto). O payload espalha
  `...form`; o servidor **já** aceita/grava/devolve `idioma`, `moeda`, `incoterm` (POST/PUT/clonar/GET) — falta só a tela.
- A tabela de dados da CONTRATADA é **imagem** (`dados-contratada.png`): fica como está, só a legenda sai bilíngue (limitação declarada).

## Regras (da spec) e onde cada uma é provada

| RN | Prova |
|---|---|
| RN-BI.01 pt-BR idêntico ao de antes | T3: HTML de `pt-BR`/sem idioma igual ao da base (hash sem imagens) em 3 propostas de teste |
| RN-BI.02 duas colunas | T3: cada bloco de texto vira `.bi-par` com `.bi-pt` + `.bi-tr`; tabela com as duas metades na mesma linha |
| RN-BI.03 par nunca separado | T4: paginador divide por `.bi-par` (nunca dentro dele); teste no navegador com cláusula longa |
| RN-BI.04 dicionário + memória + pendente | T2/T3: sem tradução, `.bi-tr.bi-pendente[data-traduzir]` com o PT |
| RN-BI.05 tradução automática | T6 (jest): pendentes → Translator → `POST /api/traducoes` origem auto → texto preenchido |
| RN-BI.06 correção manual vence | T1: auto depois de manual é ignorada (`ignoradas: 1`); T6: editar `.bi-tr` grava manual |
| RN-BI.07 glossário | T6 (jest): CONTRATANTE→"Contracting Party"/"Contratante" etc., mesmo se o tradutor errar |
| RN-BI.08 moeda | T7: cada coluna formata no padrão da sua língua, na moeda da proposta (ver abaixo) |
| RN-BI.09 incoterm | T7: linha "Incoterm" sob a tabela de preços quando preenchido |
| RN-BI.10 FINAME fora | T7: `en`/`es` sem a tabela FINAME |

**RN-BI.08 detalhada:** a coluna PT formata com `pt-BR` e a moeda da proposta (`US$ 1.000,00`); a coluna EN com `en-US`
(`$1,000.00`); a ES com `es-ES` (`1000,00 US$`). `BRL` em `pt-BR` continua exatamente `R$ 1.000,00`.

## Contratos de API (congelados)

Portão das duas: `authenticateToken` + `exigirComercialNasPropostas` (o mesmo das propostas).

**`POST /api/traducoes/consultar`** — `{ idioma: 'en'|'es', textos: string[] }` →
`200 { traducoes: { [texto_origem]: { texto: string, origem: 'auto'|'manual' } } }` (só os que existem).
Recusas: `400 { error: 'Idioma inválido. Use en ou es.' }`; `400 { error: 'Envie a lista de textos (até 500).' }`.

**`POST /api/traducoes`** — `{ idioma: 'en'|'es', origem: 'auto'|'manual', itens: [{ texto_origem, texto_traduzido }] }` →
`200 { gravadas: n, ignoradas: n }`. `auto` **não** sobrescreve linha `manual` (conta em `ignoradas`); `manual` sobrescreve qualquer uma.
Recusas: `400 { error: 'Idioma inválido. Use en ou es.' }`; `400 { error: 'Origem inválida. Use auto ou manual.' }`;
`400 { error: 'Envie os itens (até 500), cada um com texto_origem e texto_traduzido.' }`.

**Chave do texto:** `texto_origem` normalizado — `trim` + espaços em sequência viram um. Tabela
`traducoes (id, idioma, texto_origem, texto_traduzido, origem, updated_at, UNIQUE(idioma, texto_origem))`.

**Template:** `templateConfig.idioma` (`'pt-BR'`|`'en'`|`'es'`), `templateConfig.traducoes` (`{ [texto_origem]: texto }`),
`templateConfig.moeda`, `templateConfig.incoterm` — preenchidos pelo `/premium` e pelo `/pdf` a partir da proposta (+ memória do idioma).

**Marcação no documento bilíngue:**
`<div class="bi-par"><div class="bi-pt">…PT…</div><div class="bi-tr" lang="en" data-tr-origem="<PT>">…EN…</div></div>`;
sem tradução: `.bi-tr.bi-pendente` com `data-traduzir="<PT>"` e o PT dentro. O PT editável da cláusula continua com
`data-clausula-key`/`data-clausula-campo` como hoje; o título traduzido é `<p class="bi-tr bi-tr-titulo">`, nunca h2/h3 (sumário).

## Tarefas (ordem topológica)

- [ ] **T1 — tronco: memória de tradução no servidor.** Tabela `traducoes`, as duas rotas, `carregarTraducoes(idioma)`; `/premium` e `/pdf`
  passam `idioma/traducoes/moeda/incoterm` ao template. Teste API (servidor real): contratos, recusas literais, auto não vence manual, portão.
- [ ] **T2 — tronco: `server/propostaBilingue.js`** (puro): dicionário EN/ES dos textos fixos; `segmentarHtml(conteudo)` (p/ul/ol/li/texto
  puro em parágrafos); `parBilingue(ptHtml, idioma, traducoes)`; formatação de moeda por coluna. Teste unitário.
- [ ] **T3 — template em duas colunas** (capa, apresentação, cabeçalho/rodapé, 1–3, seção 4, cláusulas, preço, fiscais, assinatura).
  pt-BR intocado (RN-BI.01 por hash). Teste de template.
- [ ] **T4 — paginação e editor.** `getKeepPair` e o divisor tratam `.bi-par` como unidade; o editor tira `.bi-tr` antes de salvar a
  cláusula; `.bi-tr` editável grava `manual`. Teste jest do editor + verificação no navegador.
- [ ] **T5 — galho: formulário.** Idioma, moeda, incoterm (código + local) no `PropostaForm`. Teste jest.
- [ ] **T6 — galho: tradução no Chrome.** `glossarioTraducao.js` (puro) + preenchimento dos pendentes no preview via `Translator`
  (só no Chrome; sem ele, nada acontece e a coluna fica para correção manual). Teste jest com Translator falso.
- [ ] **T7 — moeda, incoterm e FINAME** no bloco de preço.
- [ ] **T8 — integração (cruza galhos):** proposta `en` pela rota `/premium` → pendentes → `POST /api/traducoes` → `/premium` de novo traz
  a tradução, sem pendente daquele texto; a mesma proposta trocada para `pt-BR` sai igual à base.

## Fase 2 — revisão independente (24/11/2026): 4 críticos, o plano acima foi REVISTO por esta seção

O revisor (agente sem o contexto de quem escreveu) achou 21 pontos; os que mudam o plano:

- **C1/C2/C3 — tradução dentro do documento editável corrompe o salvamento.** Atributos de salvamento duplicados na cópia pendente
  (variáveis manuais PPE:385-453, descrição da tabela, `data-edit`); a foto inicial das cláusulas (CIE:329) com o inglês dentro desliga o
  `restaurarMarcadores` (volta o bug da RN-167: `{{marcador}}` salvo resolvido); backspace no começo da `.bi-tr` funde o inglês no PT.
  **Mudança:** o **editor continua só em PT, intocado**. O documento bilíngue é **outra renderização, somente leitura** (`/premium?bilingue=1`
  e o `/pdf` de proposta `en`/`es`), aberta por um botão "Ver em duas colunas" no preview. A tradução é revisada num **painel "Traduções"**
  (lista PT | tradução editável), nunca no documento. Some a T4 "editor"; some a "correção na coluna".
- **C4 — o divisor entra no `.bi-par`.** **Mudança:** no modo bilíngue o `splitBlockByChildren` não escolhe contêiner dentro de `.bi-par` nem
  o próprio, e `splitTextLeaf` não corta dentro dele; um `.bi-par` maior que uma página fica inteiro (raro, declarado). Prova: teste
  Puppeteer (Edge do Windows via `PUPPETEER_EXECUTABLE_PATH`, já que esta máquina não tem o Chrome do Puppeteer) que confere que todo
  `.bi-pt` está na mesma `.proposal-page` que o seu `.bi-tr`.
- **I5 — chave do servidor ≠ chave do cliente.** Os marcadores `{{…}}` são resolvidos **depois** do template. **Mudança:** a chave é o texto
  **antes** da substituição (com o marcador), texto puro normalizado (`\s+`, cobre NBSP); o painel recebe as chaves do **servidor**
  (`GET /api/propostas/:id/traducoes`) e devolve as mesmas. O tradutor protege `{{…}}` (troca por ficha antes, devolve depois).
- **I6 — contratos.** `texto_traduzido` vazio → 400 *"A tradução não pode ficar vazia."*; cada texto até 5.000 caracteres; não-texto →
  400 dos itens; repetido no mesmo pedido → vale o último. `idioma`/`moeda` validados no POST/PUT da proposta: 400 *"Idioma inválido. Use
  pt-BR, en ou es."* / *"Moeda inválida. Use BRL, USD ou EUR."* (vazio = padrão). O template normaliza de novo (nunca `RangeError`).
- **I7 — título com número.** A chave do título é **sem** o prefixo numérico; o número vem do PT.
- **I8/I9 — keep-together e sumário.** O título bilíngue é **um** `h2`/`h3` com duas metades (`<span class="bi-pt">`/`<span class="bi-tr">`);
  o sumário, no bilíngue, lê só a metade PT. pt-BR não muda.
- **I11 — Translator exige clique na primeira vez.** O painel tem o botão **"Traduzir pendentes"** (o gesto), roda na janela do app (o preview
  é iframe sandbox), e mostra a contagem de pendentes.
- **I12 — PDF com pendente.** Pendente imprime o PT em itálico com *"(tradução pendente)"*; o `/pdf` devolve `X-Traducoes-Pendentes` e a
  tela avisa. Dados da capa (empresa, contato, e-mail, CNPJ) **não** são traduzidos.
- **I13 — apresentação cortada.** No bilíngue a imagem sai e o texto vai em duas colunas com fonte menor.
- **I14 — prova da RN-BI.01.** Todo código novo do template e do script de paginação só é emitido no modo bilíngue → o HTML pt-BR continua
  **byte a byte** igual (hash da base, `tests/helpers/propostaBaseHtml.js`).
- **I16 — pt-BR com USD.** A moeda vale em qualquer idioma (RN-BI.08 vence); RN-BI.01 = "pt-BR **em real** idêntico".
- **I18 — maiúsculas.** Texto todo em maiúsculas é traduzido em minúsculas e volta em maiúsculas; o glossário usa fronteira de palavra
  (SUBCONTRATADA não casa CONTRATADA).
- **I19 — prova da RN-BI.02.** O teste Puppeteer percorre os nós de texto do documento `en` e exige que estejam em `.bi-pt`/`.bi-tr` ou numa
  lista de exceções (números, códigos, nomes, rodapé).
- Aceitos e declarados: fotos posicionadas por página podem mudar de lugar no bilíngue (I17); a página de assinatura com a consideração final
  dobrada pode passar de uma página (I20, conferir visualmente); a memória é global — regerar o PDF de proposta já enviada pode mudar o texto
  traduzido (I21).
- **Donos únicos (I15):** formato do incoterm = `COD – local` (congelado em `client/src/components/proposta/idiomaProposta.js`, o template só
  imprime o texto); formatação de moeda só em `server/propostaBilingue.js`. T3 e T7 são tronco (mesmo `sec524PrecoHtml`), em sequência.

### Tarefas revistas

- [x] **T2 — `server/propostaBilingue.js`** (dicionário, segmentação, pares, moeda) + `tests/api/propostaBilingueModulo.api.test.js` 6/6
  (controle positivo: sem o `\s+` da chave, BI-M03 cai).
- [x] **T5 — formulário** (idioma, moeda, incoterm `COD – local`) — `PropostaForm.idioma.test.js` 4/4. Controle positivo: com o `trim` do
  local de volta, o teste de digitação **passou** — simulava a digitação somando a uma variável do teste; reescrito para somar ao valor do
  campo, aí acusou ("PortodeValencia").
- [x] **T1 — servidor:** tabela `traducoes` (`services/traducoes.js`); `POST /api/traducoes`; validação de idioma/moeda no POST/PUT;
  `/premium` (bilíngue só com `?bilingue=1`; cabeçalho `X-Proposta-Idioma`) e `/pdf` (bilíngue em `en`/`es`; `X-Traducoes-Pendentes`).
  **Mudou do plano:** sem `GET /api/propostas/:id/traducoes` — o painel lê as chaves do próprio documento bilíngue (`data-tr-origem`
  escrito pelo servidor; chaves `{ }` como entidade para a troca de marcadores não alcançar). `traducoesProposta.api.test.js` 6/6 (servidor
  real; controle: sem o `WHERE` que protege a manual, BI-A03 cai).
- [x] **T3+T7 — template bilíngue** (tudo atrás de `bi`), moeda, incoterm, FINAME; guardas da paginação. `propostaBilingueTemplate` 8/8
  (controle: a troca do sumário vazando para o pt-BR derruba BI-T01/T08). Defeitos achados medindo no navegador e corrigidos: a linha da
  tabela de preços partida entre páginas (o divisor escolhia a linha de 10 células — guarda `TR`); a tabela de 10 colunas vazando pela
  direita (largura fixa por coluna); valores invadindo a célula vizinha (o `nowrap` e a fonte 11pt do estilo base vencendo a regra da
  tabela — fonte nas células); título com o número dentro da chave (correção do painel sairia "1. 1. TÍTULO" — chave num span interno).
- [x] **T6 — painel "Traduções" + "Ver em duas colunas"** — `traducaoChrome.js` (glossário com fronteira de palavra, fichas ⟦n⟧, recusa se
  o tradutor perder ficha, maiúsculas), `PainelTraducoes.js`. Jest 12/12 (controle: sem a entrada CONTRATANTE do glossário, 3 caem).
  Defeito achado pelo teste: título em maiúsculas com `{{marcador}}` minúsculo não era reconhecido como maiúsculo — protege antes de testar.
- [x] **T8 — integração e Puppeteer** — `traducoesProposta` BI-A05 (rota → pendente → grava → traduzido) e `propostaBilinguePaginacao.test.js`
  (Chrome instalado via `PUPPETEER_EXECUTABLE_PATH`): 7 cenários, pares inteiros, nada vazando, nenhuma linha partida, todo texto numa
  metade, sumário só PT. **Declarado:** o BI-P03 (linha partida) não foi provado isoladamente — sem a guarda, o teste cai pelo BI-P02
  (célula vazando), mas o caso exato (poucas linhas numa quebra de página) não se reproduziu de forma determinística.

## Fase 5 — revisão adversarial do código (24/11/2026): 1 crítico, 5 importantes, 3 menores — todos tratados

Revisor fresco, instruído a refutar; cada achado com cenário e, quando possível, reprodução por script (o revisor reproduziu 1, 2, 3, 5, 8).

- **Crítico 1 — a correção manual gravava o dado do cliente na memória global.** O painel partia do texto VISÍVEL, em que o `{{cliente.nome}}`
  já virou "ACME SA"; a correção ia para a memória e sairia na proposta de outro cliente. **Correção:** o servidor escreve a tradução crua (antes
  da troca) em `data-tr-texto` e o painel parte dela; o `POST /api/traducoes` **recusa** tradução cujos marcadores diferem dos do PT — mensagem
  nova no contrato: *"A tradução tem de manter os mesmos marcadores {{…}} do texto em português."* (BI-A02, BI-M08, BI-T07, jest).
- **2 — parágrafo vazio** (`<p><br></p>` do editor) virava pendente eterno, sem como resolver. Blocos e itens vazios saem (BI-M04).
- **3 — blocos aninhados colavam frases** ("Primeiro.Segundo."). Fim de bloco vira espaço; `div` com blocos é segmentado de novo (BI-M04).
- **4 — memória global sem rastro e sem prova do portão.** Coluna `traducoes.updated_by` + linha no log; teste do 403 para usuário sem o
  Comercial e do autor gravado (BI-A07).
- **5 — BI-T06 nunca falhava** (achava `bi-tabela-precos` no CSS do `<head>`). Procura a tabela.
- **6 — BI-P05 escondia texto cortado:** um par maior que a página ficava inteiro e o overflow da página cortava o texto no PDF. **Correção:**
  parágrafo de texto puro acima de 1.200 caracteres vira vários pares, por frase (`LIMITE_PARAGRAFO`); o teste exige nenhuma página
  transbordando e as 140 frases em ordem (BI-M07, BI-P05). Parágrafo longo **com tag dentro** continua inteiro (não se corta HTML) — declarado.
- **7 (menor) — item acima de 5.000 caracteres derrubava o lote inteiro** e a mensagem culpava o Chrome. O painel deixa o item pendente e
  mostra o erro do servidor.
- **8 (menor) — glossário:** "nota fiscalizada" virava "invoiceizada" (fronteira só numa alternativa). Termo em grupo (jest).
- **9 (menor) — espanhol repetido** ("CNPJ / CNPJ:"). Rótulo igual sai uma vez.
- **Não tratado, declarado:** `{{#if}}…{{/if}}` que atravesse dois parágrafos de uma cláusula, no bilíngue, pode apagar através da marcação dos
  pares quando a condição é falsa (não reproduzido; os modelos de hoje não usam).

## Ajustes depois da entrega (24/11/2026, tarde) — defeitos vistos pelo usuário no uso

- **A apresentação passava do rodapé** (PDF em espanhol). A página é fixa (fora do paginador) e o `.pres-text p/li` do estilo base fixa 12pt
  em cada parágrafo, vencendo os 9pt postos só no bloco. Fonte nas linhas. **E o teste não via:** o `propostaBilinguePaginacao` só media
  as páginas geradas; agora mede as fixas também (falhou nos 6 cenários antes da correção).
- **Espaçamento "totalmente errado"**: o gap das pilhas (`.stack-sm/.stack-md`) somava com a margem entre pares — lista de 5 itens saía como
  5 parágrafos; e o justificado em meia largura abria buracos. Pilha com pares sem gap; 2,4mm entre parágrafos, 0,8mm entre itens; à esquerda.
- **"A tradução não está automática!!!!!"**: o plano tinha feito a tradução depender do clique em **Traduzir pendentes** (o Chrome exige
  gesto na 1ª vez). Agora ela roda sozinha ao **Salvar**, **Ver em duas colunas** e **Baixar PDF** (o tradutor nasce dentro do clique) e,
  sem clique, ao abrir o preview quando a língua já está baixada. `traduzirPendentesDaProposta` + `linguaJaBaixada` em `traducaoChrome.js`.
- **O Projeto Conceitual segue a proposta de origem** (*"Somente nesse caso, o restante das propostas não mexa"*): ramo `propostaDeServico`
  no `clausulasSection` — cláusulas 1 a 20 numeradas pela posição, sem seção 4 de equipamento, sem FINAME/fiscais, quadro "Valor Total dos
  Serviços" no 16, 19 e 20 na página de assinatura. Modelo renumerado (`clausulasProjetoConceitual.js`) e **ressincronizado no boot**
  (`sincronizarModeloClausulas`) — nenhuma tela edita modelo. Equipamento e peças: hash igual ao de antes da etapa (`BI-T01`); o hash do
  Projeto Conceitual foi regerado de propósito. Achado no caminho: no formato gravado na proposta ("19. CONSIDERAÇÃO FINAL"), o
  `ehConsideracaoFinal` geral não tira o número com ponto — o ramo de serviço usa o seu.

## Verificação (sobre o código final: `40cb21ff`, `b8bd5add`, `6f80f20c`)

- `propostaBilingueModulo` 8/8 · `propostaBilingueTemplate` 8/8 · `traducoesProposta` 7/7 (servidor real; PDF com o Chrome instalado via
  `PUPPETEER_EXECUTABLE_PATH`) · `propostaBilinguePaginacao` (puppeteer) 7 cenários, 0 failed.
- 15 testes de template/proposta já existentes (capa, 5.23/5.24, cláusulas inline, variáveis, `modeloClausulasPorFamilia`…): 0 failed.
- Jest, pasta `src/components/proposta`: 11 suítes, 114/114. `CI=true npx react-scripts build`: **Compiled successfully**.
- Jest completo (`--maxWorkers=2`, antes das correções da Fase 5 no cliente): 3.182/3.182 testes, mas **9 suítes não rodaram** nesta máquina —
  todas por o Jest não conseguir ler `node_modules/axios/index.js` (módulo ES): Frotas, EPI, coleta, `moduloDaRota`, `Configuracoes.almox…`.
  Nenhuma importa arquivo desta etapa; é o `node_modules` desta máquina (na do André eram 244/244). **Não rodado aqui:** `npm run test:api`
  inteiro (660 arquivos, cada um sobe o servidor em mais de 60 s nesta pasta do OneDrive), `test:almoxarifado`, `test:validation`,
  `test:safealter`, `test:sqlite` — esta etapa não toca nenhum deles.
- **Nenhum clique de usuário real.** O `Translator` do Chrome só foi exercitado por um falso nos testes: no navegador embutido ele existe
  (Chrome 156), mas exige gesto do usuário na primeira vez e não foi acionado. A paginação foi conferida no navegador com amostras.

## Correção de 24/11/2026, noite — tradução em qualquer navegador e espaçamento (`a9fab2fb`, `749b0fc6`)

Estimativa `docs/estimativas/2026-11/estimativa_2026-11-24_traducao-qualquer-navegador.md`.

- [x] Tradutor no servidor: `server/services/tradutorWeb.js` + `POST /api/traducoes/automatica` (contrato: corpo `{ idioma: 'en'|'es',
  textos: [até 500, cada um até 5.000] }` → `{ traducoes: [texto|null] }`, mesma ordem; 400 corpo inválido; 502 serviço fora do ar). Não
  grava — o cliente confere as fichas e grava em `POST /api/traducoes` como `auto`. `TRADUTOR_WEB_URL` troca o serviço (os testes usam um
  falso). `a9fab2fb`
- [x] Tela: `traduzirPendentesDaProposta` usa o servidor; `traduzirComReserva` cai no Chrome só no painel Traduções. O preview traduz ao
  abrir, salvar, ver em duas colunas e baixar PDF, sem clique (o `tradutorDoClique` saiu). `a9fab2fb`
- [x] Espaçamento: medido na proposta em português (título → texto 15px, parágrafo 12px, item 0) e copiado; as duas metades com o mesmo
  recuo e o filete como sombra; pendente só com cor e fundo. `749b0fc6`
- Testes: `tests/tradutorWeb.test.js` 6/6 (+ rede real com `TRADUTOR_WEB_REAL=1`: fichas intactas em en/es); `traducaoAutomaticaServidor`
  API 3/3; `traducaoChrome.test.js` 15/15; paginação bilíngue 0 falhas; template 8/8 (hash pt-BR igual); módulo 8/8. Controle positivo:
  sem a inicial maiúscula no lote e sem a reserva do Chrome, um teste de cada lado falha.
- Não feito: clique real de um vendedor em outro navegador; o negrito dentro do parágrafo continua não indo para a tradução.

## Rodada de 24/11/2026, noite (2) — simetria, assinaturas, negrito, termos fixos, edição e cores

Estimativa `docs/estimativas/2026-11/estimativa_2026-11-24_colunas-simetricas.md` (revisada para 6h45, 7 tarefas). Pedidos chegaram um a
um, com print; cada um teve commit próprio.

- [x] Simetria: `equalizarPares` no template (só `bi`), chamada no `addNode` do paginador; `compensarEntrelinha`; cache `data-eq` pela
  largura. Apresentação: foto de volta e `ajustarApresentacaoBi` (maior letra que cabe, depois a foto cresce). `0bc9f116`
- [x] Assinaturas do Projeto Conceitual em duas colunas: 19 e 20 no texto, campos + assinaturas num bloco `avoid-break`. `b737fe0d`
- [x] Filete da coluna traduzida: `::before` de 1px (o `box-shadow inset` fracionário deixava fio nos 4 lados). `89186c1e`
- [x] `TERMOS_FIXOS` (cliente e servidor) + espaço em volta da ficha + `limparTraducoesSemTermoFixo` no boot; "DWG versão 2010" fora do
  modelo. `cc7d407e`
- [x] Negrito: 33 trechos do DOCX no modelo (script sobre os runs `w:b`); `aplicarNegrito` em `propostaBilingue.js`. `c8ef5543`
- [x] Edição na tela de duas colunas: `data-pt-html` no `<p>/<li>` do PT; `client/.../edicaoBilingue.js` (`ativarEdicaoBilingue`,
  `lerEdicoesBilingue`, `aplicarEdicoesNasClausulas`); `salvarBilingue` no preview (inicializar se padrão → GET cláusulas → PUT de cada
  uma alterada → traduzir → recarregar). `ada37734`
- [x] Cores: tradução #1f5f8b, título traduzido #1a7f9c, filete sob o h2. `6cdbd928`
- Testes novos: `propostaBilingueSimetria` (BI-S01..04), `propostaBilingueNegrito` (NG-01..05), `traducoesTermoFixo`, `edicaoBilingue`
  (4) + integração no documento real (204 trechos editados, 204 gravados). Hash pt-BR do Projeto Conceitual regerado duas vezes, de
  propósito (DWG e negritos do modelo) — com o modelo anterior, bate com a base; equipamento e peças nunca mudaram.
- Não feito: clique real de um vendedor; editar título de cláusula na tela de duas colunas; o piso de 88% deixa a letra de um lado até
  12% menor — visível em parágrafo de uma linha só.

## Retro (4 números)

- Rodadas de correção até verde: 4 (Fase 2 — redesenho para o editor só PT; navegador — linha partida, tabela vazando, célula invadida;
  Fase 5 — 9 achados; portão do BI-A07, cujo teste modelava errado o "usuário sem Comercial").
- Achados: Fase 2 — 21 (4 críticos, todos reais); Fase 5 — 9 reais (5 reproduzidos pelo revisor), 0 ruído; 1 declarado sem correção
  (`{{#if}}` atravessando parágrafos).
- Paralelismo: nenhum galho em paralelo (um executor só, em sequência); os dois revisores e o agente de mapa rodaram em paralelo com o
  trabalho. O controle positivo que regrava o template em segundo plano obrigou a esperar para editar o mesmo arquivo.
- Defeito que escapou: (preencher na próxima etapa).

## Próxima tarefa detalhada

**Teste de clique com o Comercial** (o que falta para 🟢): uma proposta real em inglês em qualquer navegador — idioma/moeda/incoterm no
formulário → salvar → abrir o preview (traduz sozinho pelo servidor, `POST /api/traducoes/automatica`) → revisar em **Traduções** → **Ver em
duas colunas** → **Baixar PDF** (o aviso de pendentes tem de zerar). Conferir que o servidor da produção alcança `translate.googleapis.com`
(sem isso: 502 e o aviso "não respondeu agora"). Pontos de atenção: a qualidade da tradução nos textos dos contratos (o glossário
cobre só os termos de contrato); fotos posicionadas à mão mudam de página no bilíngue; marcadores de valor `{{…}}` nas cláusulas continuam
em real. Depois disso, a próxima candidata é a **tributação de exportação** nas tabelas fiscais do bilíngue (hoje saem as alíquotas do Brasil).

## Decisões registradas

- Tradução só depois de salvar/recarregar o preview (editar o PT não retraduz na hora) — o mais simples; o pedido foi "algo simples".
- Sumário e cabeçalho de página: PT + tradução curta no mesmo elemento ("PROPOSTA TÉCNICA COMERCIAL / TECHNICAL COMMERCIAL PROPOSAL").
- Fiscais continuam (tributação de exportação é outra etapa); FINAME sai.
- Inline (`<strong>`) dentro de um parágrafo não é preservado na tradução automática (traduz o texto do parágrafo inteiro).
