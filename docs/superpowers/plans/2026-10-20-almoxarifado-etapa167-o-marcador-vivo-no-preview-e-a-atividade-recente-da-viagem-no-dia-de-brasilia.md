# Etapa 167 (Comercial): o marcador que sobrevive ao Salvar do preview editável (C418) e a *Atividade Recente* da viagem no dia de Brasília (C416) — plano

> Origem: "Próxima tarefa detalhada — Etapa 167" do plano da 166
> (`docs/superpowers/plans/2026-10-20-almoxarifado-etapa166-os-relatorios-por-mes-e-a-data-no-texto-da-proposta-no-dia-de-brasilia.md`). Etapa de
> consertos técnicos fora do Almoxarifado; o design, com a Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-20): última B **B1064**, último C **C418**,
> última A **A104**. Esta etapa: **B1065+**, **C419+**, **A105+**. Worktree `CRM-wt-e167`, branch `etapa-e167` (da main `07623dfa`).
>
> **Fase 2 (um revisor fresco, só leitura, ANTES do código): 1 Critical, 3 Important, 5 Minor — todos aceitos; o plano abaixo já está
> corrigido** (sondas em `scratchpad/e167/f2/`). **C1** a busca por regex de grupos (`(.*?)` por marcador) **trava o Salvar** quando o gravado
> não casa (4 marcadores × 1.003 caracteres: 1,2 s; 5 × 1.003: > 100 s, sonda morta) — vira busca **linear** por `indexOf`/`lastIndexOf` (a
> divisão mais à esquerda e a mais à direita; única quando coincidem) e um teste de tempo. **I1** a ordem das regras: `atual === inicial →
> gravado` passa a ser a **primeira** (o gravado é o que gerou o texto da tela) — sem isso a cláusula **intocada** com o valor vazio entre
> parágrafos, com espaço aparado, com nbsp etc. continuava congelando; de quebra a intocada com `{{#if}}` para de congelar. **I2** a B1066
> anunciava a mudança do `lixo` no `MAX` sem cenário que a discriminasse — entra o **K7**. **I3** a A105 sem task e sem as formas da data —
> entra na T4 com o dia de Brasília **e** o dia UTC, cada um também com dia e mês trocados. **Minor:** M1 `restaurarMarcadoresNaLista` nunca
> lança (exceção → o `atual` daquela cláusula); M2 o valor vazio na posição de uma inserção pura fica **depois** do texto inserido (render
> igual); M3 dois limites a mais na C419 (o parágrafo dividido entre páginas e o valor da próxima renderização); M4 o `textosIniciaisRef` é
> **sobrescrito** a cada `onLoad` e os dois mapas seguem a mesma regra em chave repetida (a primeira vence); M5 os clientes da T3 com
> `status = ativo` e proposta. **Sem defeito:** a Fase 0 linha por linha (o `splitTextLeaf`, o `default-${numero}` — as 29 chaves do modelo
> padrão batem —, o `onLoad` como ponto de captura), o fuzz de 200 mil edições aleatórias com **0** casos de render diferente da tela, os
> números K1–K6.

## Fase 0 — medido (antes de qualquer código)

Lido no código nas linhas citadas (o condutor). Base `test:api` rodada antes de qualquer código (`scratchpad/e167/base-api.log`).

### C418 — o preview editável congela o marcador

**O caminho do texto, ponta a ponta:**

1. `GET /api/propostas/:id/premium?embed=1` (`server/index.js:9034`, `omitPrintBar` = `embed`, `:9196`) monta o HTML pelo
   `gerarHTMLPropostaPremiumV2` (`templates/propostaPremiumV2.js:41`), que no **fim** passa o documento **inteiro** por
   `substituirPlaceholdersProposta` (`:2640` → `:15-26`: `prepareCompositionData` + `resolveAdvancedPlaceholders`). Todo `{{caminho}}` simples
   (regex `/\{\{([^{}#/]+)\}\}/g`, `propostaCompositionEngine.js` `resolveAdvancedPlaceholders`) vira o valor — **inclusive dentro do
   `#proposalSource`**, a fonte que o editor lê. Os blocos `{{#if}}`/`{{#unless}}`/`{{#each}}` viram o corpo ou nada.
2. O conteúdo da cláusula entra no template por `conteudoClausulaHtml` (`:866-870`: texto puro → `<p>esc(parágrafo)</p>`; com tag, cru) dentro de
   `[data-clausula-campo="conteudo"]`; o título por `esc(tituloCompleto)` em `[data-clausula-campo="titulo"]` (`:971-996`, `:1180-1181`).
3. O editor (`client/src/components/proposta/PropostaPreviewEditavel.js:138-157`) carrega o HTML e `GET /api/propostas/:id/clausulas` (as
   linhas gravadas **com o marcador**; sem linhas, as do **modelo** da família, `isDefault: true`, `server/index.js` rota `GET …/clausulas`).
4. No *Salvar* (`:1269-1316`), `lerClausulasDoSource` (`clausulasInlineEditor.js:60-77`) lê o título (`textContent`) e o conteúdo (`innerHTML`
   → `htmlParaTexto`) **resolvidos**; `diffClausulas` (`:176-195`) compara com o gravado (`htmlParaTexto(original.conteudo)`, o título cru):
   a cláusula com marcador **sempre** sai "alterada" → `PUT /api/propostas/:id/clausulas/:cid` com a data escrita. No ramo `isDefault`
   (`:1280-1309`) a comparação posicional também acusa mudança → `inicializar` copia o modelo (com o marcador) → o diff contra as
   recém-copiadas grava a data escrita do mesmo jeito.
5. **Não é só a data:** qualquer marcador simples (`{{proposal.number}}`, `{{client.name}}`, …) congela igual. A C418 nomeava a data porque
   foi onde apareceu (Etapa 166); o mecanismo é de todos os marcadores simples.

**Os dois caminhos que o plano da 166 sugeria, medidos:**

- *(a) o motor marcar o valor com `<span data-marcador>`* — **mexe na paginação.** O `splitTextLeaf` do paginador (`propostaPremiumV2.js:2325-2337`)
  escolhe como folha o elemento **sem filhos elemento** de maior texto: um `<p>` com um `<span>` dentro deixa de ser folha. Com o valor
  < 40 caracteres o parágrafo **não se divide mais** entre páginas (o preview passa a paginar diferente do PDF, e um parágrafo maior que a página
  estoura o rodapé — I6); com o valor ≥ 40 (um nome de cliente longo) o `<span>` **vira a folha** e o `mkShell` clona o `<p>` raso — **o texto
  do parágrafo em volta do marcador some da página** (I1). Descartado.
- *(b) o `embed=1` entregar o marcador cru* — o preview mostraria `{{proposal.date}}` em vez da data (o preview deixa de ser o documento) e a
  largura das linhas muda (17 caracteres no lugar de 10) — a paginação do preview diverge da do PDF. Descartado.

**O caminho escolhido (c) — reconciliação no editor, sem tocar no servidor nem no template:** o editor já tem as três versões de cada
cláusula: a **gravada** (com o marcador, do `GET …/clausulas`), a **inicial** (o texto resolvido que o `#proposalSource` tinha ao carregar) e a
**atual** (o que vai salvar). Da gravada contra a inicial sai **onde** está o valor de cada marcador no texto; da inicial contra a atual sai
**o trecho que o usuário mexeu** (o prefixo e o sufixo comuns). Marcador cujo valor ficou **inteiro fora** do trecho mexido volta a ser o
marcador; o que ficou dentro (o usuário editou a própria data) vai como escrito. O paginador, o template e as 23 + 39 da revisão ficam
intocados por construção (nenhuma mudança no HTML).

### C416 — a *Atividade Recente* da elegibilidade de viagem

`GET /api/custos-viagens/verificar-elegibilidade/:cliente_id` (`server/index.js:15996-16090`): `MAX(p.created_at)` (o instante UTC sem fuso)
→ `new Date(...)` (lido como hora **local** — em produção `TZ=America/Sao_Paulo`, `Dockerfile:47`: 3 h depois do real) → `Math.floor((agora −
isso) / 24 h)` → `atividadeRecente = dias <= 90`; `regras.atividade_recente.dias` = esse número (a tela, `client/src/components/CustosViagens.js:1937-1939`:
*"Última proposta há {dias} dias"*); `resumo.atividade_recente` = o mesmo booleano. É duração em períodos de 24 h, não dia de calendário, e
discorda das *Visitas Técnicas* (RN-166.03: `date(created_at, mod) >= date(hoje, '-90 days')`) perto da borda.

**Quem lê:** só a tela de Custos de Viagem (o cartão da regra e o resumo). `regrasRecomendadasAtendidas` usa o `atendida` (o selo
*todas_recomendadas_atendidas*); `pode_registrar` depende só das obrigatórias — **não muda**. Testes antigos: `custosViagensPortao.api.test.js:361`
(o portão: 200 e a forma) — não muda.

**Portas de saldo, trava e permissão:** nenhuma. O portão (`exigirComercialNasPropostas`) não muda. Nenhum valor gravado muda.

## Decisões (letra B — reversíveis)

- **B1065 — o *Salvar* do preview editável devolve o marcador ao texto gravado (C418).** O caminho (c) acima: reconciliação de três versões
  no editor. **Muda:** salvar pelo preview **sem mexer** na cláusula que usa um marcador não regrava mais nada nela (antes: gravava o valor
  escrito no lugar do marcador — a data, o número, o nome); mexer **em outro trecho** dela grava o texto novo **com o marcador** no lugar;
  mexer **no próprio valor** (apagar ou reescrever a data impressa) grava o que o usuário escreveu, sem o marcador (é a intenção dele). Vale
  para o título e para o conteúdo, nos dois ramos (cláusulas já gravadas e o primeiro salvamento, que copia o modelo). **Descartado:** (a) o
  `<span>` do motor e (b) o marcador cru no `embed` — os dois mexem na paginação (medido acima); (d) comparar só "o texto resolvido do gravado
  = o atual" (resolve a cláusula intocada, mas a primeira edição em qualquer outro trecho dela congelaria o marcador de novo).
- **B1066 — a *Atividade Recente* da viagem em dias de calendário de Brasília (C416).** `dias` = os dias de calendário entre o dia de
  Brasília de hoje (`diaLocal.hojeLocalISO()`) e o dia de Brasília da última proposta ativa (`MAX(date(p.created_at, mod))`, `mod` =
  `diaLocal.modificadorDoFuso()`, os dois como `?` posicional); `atendida` = `dias <= 90` — a mesma régua das *Visitas Técnicas* (RN-166.03).
  **Muda:** perto da borda dos 90 dias e das 21h à meia-noite: a proposta das 22h30 do dia D−91 deixa de contar como recente (antes contava:
  91 dias de calendário, 90 períodos de 24 h), e o *"Última proposta há N dias"* passa a contar dias de calendário (a proposta das 23h de
  D−90 mostra 90; antes 88 em produção). Proposta com `created_at` ilegível deixa de entrar no máximo (antes, `'lixo' > '2026-…'` no `MAX`
  de texto fazia a regra sair *não atendida* com `dias` nulo mesmo havendo proposta recente válida). **Descartado:** manter os períodos de
  24 h e só ler o instante como UTC (continuaria discordando das Visitas Técnicas na borda — a C416 é exatamente essa discordância).
- **B1067 — as cláusulas que já guardaram o valor escrito no lugar do marcador NÃO são reescritas.** Não há como distinguir, no banco, a data
  que o usuário escreveu à mão da que o editor congelou. A **A105** (somente leitura) lista as candidatas — o texto que contém a data de
  emissão da própria proposta (`DD/MM/AAAA` do dia de Brasília do `created_at`, e a forma com dia e mês trocados dos dias 1–12); quem decide é o
  usuário, cláusula por cláusula, pelo próprio preview (apagar a data e digitar o marcador). A **A104** já acha as que guardaram *Invalid Date*.
  **Descartado:** um `UPDATE` em massa trocando a data pelo marcador (reescreveria datas escritas de propósito).
- **B1068 — a próxima etapa (168).**

## Regras de negócio

- **RN-167.01 (B1065)** — `restaurarMarcadores(gravado, inicial, atual)` (texto, não HTML): **primeiro**, se `atual === inicial` → `gravado`
  (Fase 2 I1 — a cláusula intocada volta ao que a gerou, em qualquer caso, inclusive com bloco ou com o gravado que não casa). Depois: se o `gravado` não tem marcador simples
  `{{caminho}}` → `atual`. Se tem bloco (`{{#…}}` ou `{{/…}}`) → `atual` (declarado, C419). Se o `gravado` não descreve o `inicial` (o padrão
  "literais do gravado + qualquer coisa no lugar de cada marcador", ancorado nas duas pontas, não casa) → `atual`. Se a divisão do `inicial`
  pelos marcadores **não é única** (a divisão mais à esquerda e a mais à direita diferem — o valor de um marcador contém o literal vizinho) → `atual`
  (declarado, C419). Senão: `p` = prefixo comum de `inicial` e `atual`, `q` = sufixo comum (com
  `p + q <= min(len)`); cada marcador cujo valor `[s, e)` no `inicial` está **inteiro** no prefixo (`e <= p`) ou **inteiro** no sufixo
  (`s >= len(inicial) − q`) volta a ser `{{caminho}}` (o texto exato do gravado) na posição correspondente do `atual`; o resto do `atual`
  vai como está. Valor vazio (marcador sem dado: `[s, s)`) na fronteira: fica no prefixo se `s < p`, no sufixo se `s >= len − q` (numa
  inserção pura na posição dele, fica **depois** do texto inserido — Fase 2 M2); só some quando a edição o cobre. **A busca é linear** (Fase 2
  C1): os literais entre os marcadores são procurados por `indexOf` da esquerda (a divisão mais à esquerda) e por `lastIndexOf` da direita (a
  mais à direita); casa se o primeiro literal é prefixo, o último é sufixo e os do meio cabem em ordem; é única se as duas divisões coincidem.
- **RN-167.02 (B1065)** — o *Salvar* aplica a RN-167.01 ao **título** e ao **conteúdo** de cada cláusula da lista lida do `#proposalSource` que
  tem par no gravado: ramo das gravadas pela chave `String(id)`; ramo `isDefault` pela chave `default-${numero}` (a mesma que o código já usa
  para relacionar as recém-copiadas), com o título gravado `${numero} ${titulo}` (o que o ramo já compara). O `inicial` é o texto lido do
  `#proposalSource` no `onLoad` do iframe (antes de qualquer digitação), no mesmo formato do salvamento (título aparado; conteúdo por
  `htmlParaTexto`). Cláusula nova (`temp-…`) e as sem par → como hoje.
- **RN-167.03 (B1065)** — consequência no diff: a cláusula intocada (`atual === inicial`) volta exatamente ao gravado → `diffClausulas` não a
  marca como alterada → nenhum `PUT` para ela; no ramo `isDefault`, o salvamento sem nenhuma edição real não chama o `inicializar`.
- **RN-167.04 (B1066)** — elegibilidade de viagem: `dias` = `julianday(hoje) − julianday(MAX(date(p.created_at, mod)))` sobre as propostas
  ativas do cliente (inteiro; nulo sem proposta com data legível); `atividade_recente.atendida` = `dias != null && dias <= 90`;
  `resumo.atividade_recente` = o mesmo. O resto da resposta igual.

## Contratos (congelados)

- **Navegador, `clausulasInlineEditor.js`:** `export function restaurarMarcadores(gravado, inicial, atual) → string` (RN-167.01);
  `export function lerTextosIniciaisDasClausulas(doc) → Map<key, { titulo, conteudo }>` (o mesmo formato do salvamento: `titulo` aparado,
  `conteudo` por `htmlParaTexto`); `export function restaurarMarcadoresNaLista(listaAtual, iniciais, gravadosPorKey) → listaAtual'`
  (RN-167.02; `gravadosPorKey: Map<key, { titulo, conteudo }>` em texto). **Nunca lança** (Fase 2 M1): exceção numa cláusula → o `atual`
  dela. Chave repetida nos dois mapas: a **primeira** vence (Fase 2 M4). Nenhuma mudança nas funções existentes.
- **`PropostaPreviewEditavel.js`:** `textosIniciaisRef` **sobrescrito** a cada `onLoad` do iframe (antes do `ativarEdicaoClausulas`); o `salvarClausulas`
  aplica `restaurarMarcadoresNaLista` logo depois de montar a `listaAtual` (antes do `houveMudanca` e do `diffClausulas`). Rotas chamadas:
  as mesmas (`POST …/clausulas/inicializar`, `GET/POST/PUT/DELETE …/clausulas`, `PUT …/clausulas/reordenar`), com os mesmos corpos — só o
  texto muda.
- **`GET /api/custos-viagens/verificar-elegibilidade/:cliente_id`** — mesma forma, mesmos códigos (404 *"Cliente não encontrado"*, 500 com
  `err.message`); `regras.atividade_recente.{atendida, dias}` e `resumo.atividade_recente` pela RN-167.04. Nenhuma recusa nova.
- **Servidor da proposta:** nada muda (`/premium`, `/pdf`, o template, o motor).

## Tasks (sort topológico)

- [x] **T1 (galho, navegador) — a reconciliação (RN-167.01 a .03).** — `07bb9894` (Fase 5: `1b3718ce`). `clausulasInlineEditor.js` (as três funções) e
  `PropostaPreviewEditavel.js` (o `ref`, a captura no `onLoad`, a chamada no `salvarClausulas`). Testes novos:
  - `client/src/components/proposta/marcadorVivoNoPreview.test.js` — **unitário** da `restaurarMarcadores`: intocado → gravado; edição antes,
    depois e **entre** dois marcadores (os dois voltam); edição adjacente (digitar logo depois da data — volta); edição **no valor** (vai
    escrito); o valor vazio na fronteira, numa inserção pura (fica depois) e coberto pela edição (some); bloco `{{#if}}` editado → atual e
    intocado → gravado; gravado que não casa editado → atual e intocado → gravado (os casos da Fase 2 I1: o valor vazio entre parágrafos, o
    espaço aparado, o nbsp); divisão ambígua → atual; título com o prefixo renumerado (`5.3 ` → `5.4 `) e o marcador no fim — volta; **tempo**:
    10 marcadores, 5.000 caracteres, gravado que não casa, < 50 ms (Fase 2 C1); a `restaurarMarcadoresNaLista` com um item que faz a função
    lançar → o atual (M1).
  - **o fluxo inteiro no jsdom** (no mesmo arquivo): o `PropostaPreviewEditavel` renderizado de verdade (rota `/propostas/:id/preview` com
    `MemoryRouter`), o `api` simulado **só na fronteira HTTP** (o `GET …/premium?embed=1` devolve o HTML gerado pelo **template real do
    servidor** — `require('../../../../server/templates/propostaPremiumV2')`, com `CRM_DATA_DIR` numa pasta temporária — com a cláusula
    gravada `{{proposal.date}}` e a `dataEmissao` `'20/10/2026'`; o `GET …/clausulas` devolve as linhas gravadas com o marcador). O HTML é
    escrito no `contentDocument` do iframe (o jsdom ignora o `srcdoc`; o `document.write` roda o script do paginador) e o `load` disparado.
    Guarda: o `#proposalSource` do iframe **tem** `20/10/2026` e **não tem** `{{` (a cláusula chegou resolvida — senão o cenário não prova
    nada). Cenários: (F1) editar **outra** cláusula pela página gerada (o `input`) → *Salvar* → um `PUT` só, o da outra; nenhum para a do
    marcador (antes: os dois, o da data com `20/10/2026`); (F2) acrescentar texto no fim da cláusula do marcador → o `PUT` dela leva
    `{{proposal.date}}` e o texto novo, e **não** leva `20/10/2026`; (F3) reescrever a data para `21/10/2026` → o `PUT` leva `21/10/2026` e não
    leva o marcador; (F4) o ramo `isDefault` (o modelo com o marcador, nenhuma linha gravada): editar outra cláusula → o `inicializar`, e os
    `PUT` não levam `20/10/2026` em lugar nenhum (a do marcador não é regravada).
  Controle positivo: o `salvarClausulas` sem a chamada (o código de `07623dfa`) derruba F1, F2 e F4 pela asserção do `PUT`.
- [x] **T2 (galho, servidor) — a *Atividade Recente* (RN-167.04).** — `5fc7ea5f` (Fase 5: `1b3718ce`). `server/index.js` (a consulta e o cálculo da rota). Teste novo
  `server/tests/api/atividadeRecenteDaViagemNoDiaLocal.api.test.js` pelo `index.js` real em pasta vazia, o molde da 166 com **uma diferença
  deliberada:** o filho sobe com `TZ=America/Sao_Paulo` (o de produção — é nele que o `new Date` antigo lê o instante como local; em UTC a
  leitura antiga sairia certa e o cenário K5 não discriminaria) e o relógio às **22h de Brasília** de HOJE (= 01h UTC de HOJE+1). Guarda: o
  relógio do filho perto do alvo; o `date('now')` do SQLite semanas antes. Massa por fora (`created_at` escolhido), um cliente por borda, com
  `I90 = date(HOJE, '-90 days')` calculado pelo SQLite:

  | Cliente | Última proposta (Brasília) | Esperado `atendida`, `dias` | O código antigo (produção) |
  |---|---|---|---|
  | K1 | I90 00:30 | `true`, 90 | `true`, 90 |
  | K2 | I90−1 22:30 | **`false`, 91** | `true`, 90 (lida como local: 3 h depois) |
  | K3 | I90 12:00 | `true`, 90 | `true`, 90 (com o hoje UTC — HOJE+1 — daria 91, `false`) |
  | K4 | I90+1 23:00 (D−89) | `true`, **89** | `true`, 88 (lida como local: 88 d 20 h) |
  | K5 | — (só uma proposta com `created_at` `'lixo'`) | `false`, `null` | `false`, `null` |
  | K6 | HOJE 22:30 | `true`, **0** | `true`, **−1** (`Math.floor` de −0,15 dia → *"há -1 dias"*) |
  | K7 | uma `'lixo'` e uma válida de HOJE−10 12:00 (Fase 2 I2) | `true`, **10** | `false`, `null` (o `'lixo'` vence o `MAX` de texto) |

  *(K6: a proposta das 22h30 com o relógio às 22h é 30 min no futuro e, lida como local, 3 h 30 min — a massa é por fora; com o código antigo `Math.floor(−0,15) = −1`. Se o
  executor medir outro valor antigo, registra a divergência; o esperado novo é 0.)* Asserções: `atendida` e `dias` de cada um,
  `resumo.atividade_recente` = `atendida`; **e a integração (T3).** Controle positivo: o `index.js` de `07623dfa` derruba K2, K4, K6 e K7 pela asserção do cenário; a sabotagem "hoje UTC" (`new Date().toISOString().slice(0,10)`) derruba K1/K3; o `date('now')` real derruba
  todos os que têm data.
- [x] **T3 (integração — cruza a régua nova com a das Visitas Técnicas; mora no arquivo da T2):** — `5fc7ea5f`. para K1–K7 (clientes `status = ativo`, Fase 2 M5), o `atendida` da elegibilidade
  de viagem = o `regras.atividadeRecente.passou` de `GET /api/relatorios/visitas-tecnicas` do mesmo cliente (cada um lido na fonte, sem
  atalho) — a C416 era a discordância das duas.
- [x] **T4 (documentação) — a A105 (B1067).** — no fechamento (o SQL na letra A; `scratchpad/e167/a105.js`). O SQL literal, somente leitura: as cláusulas ativas de proposta cujo título ou conteúdo contém a
  data de emissão da própria proposta em qualquer das formas que o marcador já imprimiu — o dia de Brasília (`strftime('%d/%m/%Y',
  created_at, '-180 minutes')`) e o dia UTC (`strftime('%d/%m/%Y', created_at)` — antes da 165 a emissão das 21h à meia-noite saía no dia
  seguinte), cada um também com dia e mês trocados quando o dia é ≤ 12. Declara: os outros marcadores congelados (`{{proposal.number}}`,
  `{{client.name}}`) ficam fora; a lista é de **candidatas** (a data pode ter sido escrita à mão). Rodada na cópia local com controle.

*(T1 e T2 são galhos independentes de verdade — arquivos e regras disjuntos; nenhuma interpretação de uma afeta a outra. Rodam em sequência
pelo condutor ou em paralelo em worktrees; o `test:api` serializado pela trava de máquina.)*

## Pontos de atenção

1. A trava de máquina: um `test:api` por vez (`scratchpad/trava-test-api.d`, `mkdir` atômico; quem pegou apaga).
2. `?` posicional, na ordem do SQL: `[hoje, mod, cliente_id]` (o `julianday(?)` e o `date(…, ?)` no SELECT antes do `WHERE c.id = ?`). `?` a
   menos liga NULL calado — o K1 com `dias` nulo é o sintoma.
3. A revisão obrigatória da proposta (23 + editor 39) é critério: o editor muda (`clausulasInlineEditor.js` é o arquivo do editor 39);
   o template e a paginação não. O `clausulasInlineEditor.test.js` tem de continuar 39/39 sem mudar.
4. O `heredoc` do Bash come contrabarra — scripts com regex pelo Write, nunca por `cat <<EOF`.
5. A busca do `restaurarMarcadores` é **linear** (`indexOf`/`lastIndexOf` dos literais — Fase 2 C1): nada de regex construída do texto do
   usuário (o `(.*?)` por marcador trava a aba quando o gravado não casa).
6. O teste do fluxo **não** mocka o editor nem o template — só o `api` (a fronteira HTTP); o HTML vem do template real.
7. Nenhuma porta de permissão muda; nenhum valor gravado muda por migração (só o que o usuário salva, e para melhor).

## Execução — o que divergiu do plano

- **Paralelismo 0:** T1 e T2 eram galhos independentes, mas o condutor as fez em sequência (cada uma é pequena; o `test:api` é serial pela
  trava de máquina) — nenhum retrabalho.
- **T1 verde de primeira** (17/17) — por isso o controle positivo: sem a chamada `restaurarMarcadoresNaLista` no `salvarClausulas` **os 4
  cenários do fluxo caem** pela asserção do `PUT` (F1: o `PUT` da 12 com *20/10/2026*; F2/F3: o título *5.2 EMISSAO 20/10/2026*; F4: o `PUT`
  da 101 com a data), md5 restaurado. O teste do fluxo **é viável no jsdom**, ao contrário do que os comentários dos testes antigos do editor
  diziam (o jsdom ignora o `srcdoc`, mas o `document.write` no `contentDocument` roda o script do paginador — a Fase 2 confirmou: 6 páginas
  geradas).
- **T2 verde de primeira** (5/5) — controle (`scratchpad/e167/sabota-t2.sh`, `sabota-t2.txt`): o `index.js` de `07623dfa` (K2 `true/90`,
  K4 `88`, K6 `-1`, K7 `false/null` — exatamente a coluna "antigo" da tabela), o hoje UTC, o `date('now')`, o dia UTC do `created_at` e a
  borda `< 90`: **5/5 caem** pela asserção da tabela e pela da T3; md5 restaurado ao pós-conserto.
- **A105** rodada na cópia local (09/10): **0** linhas; controle numa cópia com três cláusulas plantadas na proposta 3 (a data de Brasília, a
  trocada e *31/12/1999*): achou as duas primeiras, não a terceira.
- **Testes antigos mudados: 0.**

## Fase 5 — revisão adversarial (três revisores frescos, em paralelo)

- **r1 (regra) — 0 achados.** Fuzz da função **real** contra o pipeline real (o gravado → o template do servidor → o texto da tela → uma
  edição aleatória → a restauração → a nova renderização), 3.300 tentativas com valores vazios, marcadores repetidos, `{{ x }}` com espaços e
  literais feitos de pedaços dos valores: **0** divergências de render e **0** edições reais perdidas (controle: trocar um marcador no
  resultado dá 14/200). Os gestos depois do Salvar (mover/adicionar/remover, renumeração, o ramo do modelo, Emitir revisão, recarregar): sem
  regressão. C416: as duas réguas (a viagem e as Visitas Técnicas) em 4.543 casos (24 formas de `created_at`, `ativo` 1/0/NULL, 7 instantes
  em volta da meia-noite de Brasília): **0** divergências (controle `-89 days`: 1.023).
- **r2 (autorização) — 0 Critical/Important; 1 Minor de antes, registrado (C420).** A cadeia de middleware e os códigos HTTP iguais à base
  (401/401/403/200, as mesmas 6 chaves) pelo `index.js` real, HEAD × `07623dfa`; 8 payloads de injeção no `cliente_id`: os mesmos
  resultados; o fuzz de 300 mil casos: a reconciliação **nunca** cria marcador que não estivesse no gravado ou no que o usuário digitou
  (controle: a restauração sabotada que acrescenta `{{raw.proposal.custo}}` é acusada). **Minor (C420, de antes):** o contexto dos
  marcadores expõe `raw` (a linha crua da proposta e dos itens) — `{{raw.proposal.margem_lucro}}` numa cláusula imprime o número; e um
  marcador gravado num cadastro (o nome fantasia) era congelado e resolvido na impressão seguinte pelo Salvar antigo — a 167 fecha esse
  segundo caminho na cláusula não mexida. Restringir `raw` é produto.
- **r3 (sabotagem, worktree própria `CRM-wt-e167-r3`) — 45 sabotagens novas: 34 caíram pela asserção certa, 11 sobreviveram — 5 faltas de
  asserção reais, 6 equivalentes/inalcançáveis provadas.** As 5: capturar o texto inicial só se o mapa estiver vazio (C01 — dois Salvar
  seguidos), o `gravadosPorKey` sem `htmlParaTexto` (C06), o sufixo comum sem o `− p` (C18), o `MAX` trocado por `MIN` (S05) e sem o
  filtro `ativo` (S12). As equivalentes: a captura depois do `ativarEdicaoClausulas` (nenhum dos dois escreve no `#proposalSource`), a
  checagem de bloco sozinha (o regex dos marcadores já exclui `#`/`/`), três checagens da busca linear que se cobrem (fuzz de 300 mil: igual
  ao original), o `ROUND` (diferença de `julianday` de dois `date()` é inteira exata). **Achado de código:** a coluna
  `MAX(date(created_at, ?)) as ultimo_dia_local` não era lida e gastava um `?` — removida.
- **Correção da Fase 5 (`1b3718ce`):** os cinco cenários (dois Salvar seguidos, a gravada com quebra no fim, o caractere repetido, K8 e K9) e
  a coluna morta fora. **Controles:** no cliente K01–K03 **3/3 caem** pelo cenário delas (`sabota-f5.txt`); no servidor MIN e sem o `ativo`
  **2/2 caem** pela tabela e pela T3 (`sabota-f5-srv.txt`); md5 restaurado.

## Suítes (lidas na saída, `scratchpad/e167/`)

- **Base (antes de qualquer código, `base-api.log`):** `test:api` **487/487**.
- **Bateria 1 — antes de `07bb9894`/`5fc7ea5f` (`b1-*.log`):** `test:api` **488/488** arquivos (`atividadeRecenteDaViagemNoDiaLocal` **5/0**);
  `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; client **169** suítes / **2139** testes
  (`marcadorVivoNoPreview` **17/17**); `CI=true build` *Compiled successfully*; revisão obrigatória da proposta **23/23** scripts com saída 0
  (*"TODOS OS INVARIANTES OK"*) + editor **39/39**.
- **Bateria 2 — antes de `1b3718ce` (`b2-*.log`):** `test:api` **488/488** arquivos (`atividadeRecenteDaViagemNoDiaLocal` **5/0**, com K8 e K9);
  `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; client **169** suítes / **2142** testes
  (`marcadorVivoNoPreview` **20/20**); `CI=true build` *Compiled successfully*; proposta **23/23** + editor **39/39**.
- **Bateria 3 — o fechamento, depois de `1b3718ce` (`b3-*.log`; depois dela só mudaram documentos):** `test:api` **488/488** arquivos;
  `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; client **169** suítes / **2142** testes; `CI=true build`
  *Compiled successfully*; revisão obrigatória da proposta **23/23** scripts com saída 0 (*"TODOS OS INVARIANTES OK"*) + editor **39/39**. O
  intermitente conhecido do `superPadraoNoBoot` não apareceu em nenhuma das três baterias.

## Fora desta etapa (declarado)

- **C419 (novo)** — os limites da reconciliação: o marcador de bloco (`{{#if}}`, `{{#each}}`) continua congelando ao salvar a cláusula que
  o usa; marcador cujo valor fica **entre duas edições** separadas da mesma cláusula (o trecho mexido vai da primeira à última) vai como
  escrito; a divisão ambígua (o valor de um marcador contém o texto vizinho — dois nomes iguais lado a lado) vai como escrito; a cláusula
  que o servidor já guardou com o valor escrito não se conserta sozinha (**A105**/**A104**); na cláusula de um parágrafo só que o paginador
  divide entre páginas, a edição sincroniza as duas partes como dois parágrafos e o ponto de corte conta como uma segunda edição (o marcador
  entre a edição e o corte vai como escrito — a quebra de parágrafo em si é de antes); o marcador restaurado mostra o valor da **próxima**
  renderização (trocar a Razão Social no mesmo Salvar faz o `{{client.name}}` da cláusula mostrar o nome novo — é o desejado, Fase 2 M3).
- **C420 (novo, Fase 5 r2 — de antes)** — o `{{raw.…}}` lê campo interno da proposta (margem, custo); restringir é produto.
- Tudo o que depende do P.O. (a lista do fim do plano da 166 — inclusive a **C417** e o atalho no fuso de Brasília).

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** — a Fase 5 (cinco asserções e uma coluna morta; nenhum defeito de comportamento). As tasks
   ficaram verdes na primeira aplicação. **Testes antigos mudados: 0.**
2. **Achados da revisão:** Fase 2 — **1 Critical + 3 Important + 5 Minor**, todos reais (o mais caro: a busca por regex que **travaria a
   aba** no Salvar com o gravado que não casa — 5 marcadores × 1.000 caracteres > 100 s; e a ordem das regras, sem a qual a cláusula
   **intocada** continuaria congelando nos casos de espaço e valor vazio). Fase 5 — r1 **0**; r2 **1** Minor de antes (C420); r3 **5** faltas
   de asserção reais + 1 coluna morta + 6 equivalentes provadas; **0** ruído. **O que mais pesou:** de novo a **fiação sem prova** (a
   recaptura a cada `load` — nada provava o segundo Salvar) e **a régua do "último"** (o `MAX` e o `ativo` sem cenário que os distinguisse).
3. **Paralelismo:** **0** galhos de código em paralelo (dois galhos pequenos feitos em sequência pelo condutor); **1** revisor na Fase 2, **3**
   em paralelo na Fase 5 (o r3 na worktree própria, 45 sabotagens; o r2 numa worktree temporária da base) — **0** incidente de trava, **0**
   retrabalho.
4. **Defeito que escapou:** *(preenchido na Etapa 168)* **0 de código** — nenhum defeito do que a 167 entregou apareceu na 168 (a 168
   não reabriu o editor nem a elegibilidade; os testes da 167, a revisão da proposta 23 + 39 e o `test:api` passaram nas baterias da 168). **1 de
   documento:** a próxima tarefa que a 167 escreveu estava **incompleta** — nomeava nove linhas em cinco telas e deixava de fora a data do modelo
   salvo da proposta, a coluna *Data* da lista de Custos de Viagem (a véspera) e o filtro de datas dos Logs (o gesto seguinte); a Fase 0 e a
   Fase 2 da 168 os acharam. Ela própria avisava "medido por `grep`, não a fundo".

## Próxima tarefa detalhada — Etapa 168

*(A série desta etapa foi B1065–B1068, C416 e C418 resolvidos, C419 e C420 novos, A105 — a 168 começa em **B1069**, **C421**, **A106**;
confira com `grep -oE` antes.)*

**Escolhida: a hora de criação mostrada no fuso universal nas telas do núcleo, de Custos de Viagem e das Solicitações de Compra.** Medido
nesta etapa (por `grep`, **não a fundo** — a Fase 0 da 168 confirma cada um e procura os que faltam): estas telas fazem
`new Date(<created_at do banco>).toLocale…` — o `'AAAA-MM-DD HH:MM:SS'` UTC lido como hora **local** do navegador: das 21h à meia-noite
mostram o dia seguinte e, onde mostram a hora, 3 h adiantada. **Todas roteadas** (o import em `routes/lazyModules.js` ou no `Admin.js`):
`Clientes.js:80` (*Cadastrado em* da planilha exportada), `Usuarios.js:140` e `:292` (*Cadastrado em* na planilha e na lista),
`Logs.js:50` e `:194` (a *Data/Hora* dos logs do sistema, na planilha e na tela), `CustosViagens.js:1978`, `:2362` e `:2413` (o histórico
da viagem, o *Enviado por … em* do comprovante e a data do item), `MinhasSolicitacoesCompra.js:62` (a criação da solicitação). **Sem uso
(C414, não mexer):** `components/Propostas.js:719`, `components/PropostaForm.js:1598`, `utils/gerarPDFProposta.js:107` (nenhum import). A
ferramenta já existe: `client/src/utils/dataLocal.js` — `lerInstanteDoBanco`, `lerDataDoBanco`, `formatarDataDoBanco(valor, vazio,
opcoes)` (a 165/166); conferir antes se o `created_at` dessas tabelas chega cru (`'AAAA-MM-DD HH:MM:SS'`) ou já ISO com `Z` (aí o
`new Date` já está certo e não há defeito — **medir antes de prometer**). **Teste:** o molde de `datasDoComercialNoDiaLocal.test.js` (o fuso
do `jest.globalSetup.js` com guarda, o relógio parado às 22h30) — **o comportamento na tela**, não o texto do fonte; uma linha por tela com
`created_at` às 01h30 UTC (= 22h30 de Brasília do dia anterior). **Pontos de atenção:** (1) a trava de máquina; (2) nenhuma porta de
permissão muda; (3) a revisão da proposta não é critério (nenhum arquivo da proposta), a não ser que a Fase 0 ache algo nela; (4) o
`heredoc` come contrabarra — scripts com regex pelo Write.

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 166 (da 152 em diante: **B853**/**C279**, **B808**, **B755**, **B761**/**C239**,
**C224**, o resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela de conversões e o grupo acima de família, a
régua do tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens
de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**, **B101**/G30,
**G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62, a **C348**; nas propostas, a verificação do dono da proposta (Fase
12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a Frente B da lentidão, a **C297** (**B924**), a **B926**,
a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**; no Operacional, a **C332**, ligar o painel antigo (*Dashboard
MES*, **C403**) e **ligar a edição de atividades e decidir o que ela grava** (**C408**); do Comercial, a **C354**, a **C357**/**B988**, a
**C359**/**B989** (e a **C360** junto), a **C358**, a **C383**, ignorar também o acento nas buscas (**B1013**, **B1019**) e o resto da **C382**
(**B1016**); do núcleo, a **C362**; da 160, a **C398** e a **C399**; da C400, a descrição da OS na busca das OPs; da 162, a **B1036**; da 163, o
`referencia` das remessas com 400 e o `horas_reais: 0`; da 164, a **C411**, a **C412** e o `mes` fora de 1–12 com 400; da 165, congelar a
emissão (**B1057**), imprimir a validade, unificar *hoje* × *vencido* do lembrete e o `validade_dias` fora de faixa com 400; da 166, a **C417**,
as janelas no dia 1 do mês e os atalhos no fuso de Brasília (**B1061**); **desta etapa**, restringir o `{{raw.…}}` ou escapar `{{` nos valores
(**C420** — muda o que o marcador aceita) e reescrever em massa as cláusulas congeladas (**B1067**). Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** o `diaLocal.js` do servidor e o `dataLocal.js` do navegador; a reconciliação dos marcadores
do editor (`restaurarMarcadores`, `07bb9894`, `1b3718ce`) e a *Atividade Recente* da viagem (`5fc7ea5f`, `1b3718ce`).
