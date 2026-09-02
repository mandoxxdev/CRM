# Etapa 13 — Relatórios e indicadores — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** registro único de relatórios com gate declarado por chave (mata a classe "relatório
novo esquece o gate", que já entrou 2× por achado de revisão), lista fail-closed para a tela,
exportação XLSX genérica pela MESMA função/gate, indicadores gerenciais pelas fontes únicas,
tela `/almoxarifado/relatorios` e 3 cartões no dashboard.

**Spec:** `docs/superpowers/specs/2026-08-24-almoxarifado-etapa13-relatorios-design.md`
(RN-01..RN-06, D1..D8 — mensagens literais de lá são contrato).

## Global Constraints

- Literais congelados (MEDIDOS no código pela Fase 2): 404 `Relatório não encontrado`; 403
  `{ "error": "Sem permissão para este relatório", "acao": "<acao>" }`; 400 do
  `materiais-cliente` **`informe o cliente_id`** (minúsculo, sem acento —
  clienteEstoqueService.js:62 via handleError); 404 **`Cliente nao encontrado`** do mesmo
  relatório (segundo 404 da família — o teste de tipo inexistente não pode assumir corpo
  único). Novos: 400 do indicadores `Parâmetro "janela_dias" deve ser um número inteiro maior
  que zero`; 400 do export não-tabular `Relatório sem exportação tabular` (nasce na TASK 1).
- **Consumo: uma expressão só (Fase 2, C4 — hoje há QUATRO réguas divergentes, medido 10 vs
  18 no mesmo material).** Criar `services/almoxarifado/consumoSql.js` exportando o fragmento
  que hoje vive embutido em `purchaseService.calcularSugestoes` (purchaseService.js:62-64); a
  Task 2 CONSOME esse fragmento e `purchaseService` passa a chamá-lo (refactor sem mudança de
  comportamento, provado pela regressão de comprasMinimos/reposicaoGerarSolicitacoes/
  reposicaoJornada). DECLARADO (letra E): consumo-os, consumo-periodo e
  materiais-mais-consumidos usam réguas ANTIGAS mais estreitas (só SAIDA*) — unificá-los muda
  número de relatório existente, é letra B; a tela exibe a régua de cada um no rodapé.
- **Janela (Fase 2, I4):** `janela_dias` da querystring; quando omitido, default lido de
  `configuracoes_almoxarifado.reposicao_janela_consumo_dias` (fallback 90, lerConfigNumero da
  E11) — nunca um 90 escrito à mão (senão config em 30 daria dois números para a mesma conta).
  Continua sem config nova. Tela/dashboard exibem a janela efetiva na legenda.
- **A varredura de custo cobre arquivo novo (lê o diretório — medido), MAS só pega
  `COALESCE(cm,cu)` e o CASE replicado (Fase 2, I2):** `SUM(qtd * m.custo_unitario)` PASSA em
  silêncio. Ela não substitui asserção numérica — ver a fixture obrigatória da Task 2.
- Rota medida (Fase 2, M1 — suspeita NEGATIVA): `/relatorios` (lista) NÃO colide com
  `/relatorios/:tipo` no Express 4 em nenhuma ordem de registro; `/relatorios/export` cai no
  dispatcher como tipo "export" → 404 correto. Nada a fazer; registrado para não re-sondar.
- **NENHUM shape de rota existente muda.** O refactor do dispatcher para o registro é interno;
  a prova é a regressão da suíte inteira (116 arquivos) sem tocar nos testes existentes de
  relatório.
- Custo SEMPRE via `custoUnitarioSql`/`valorEstoqueSql` (o `custoUnitarioFonteUnica.api.test.js`
  varre o fonte e JÁ quebra sozinho se alguém ler custo à mão — não desative, obedeça).
  Consumo SEMPRE via `movementTypes.TIPOS_SAIDA`. Disponível via `disponivelSql`.
- Material de cliente (`proprietario_cliente_id IS NOT NULL`) FORA de giro/cobertura/
  rupturas/valor-por-grupo. `materiais-sem-endereco` continua SEM filtro de dono (decisão
  classe C da Etapa 8 — não "corrigir").
- Export: mesma função do registro, mesmos parâmetros; nunca query própria de export.
- Sem config nova (janela via querystring) — nenhuma amarração nova no
  `configuracoesGerais.api.test.js`.
- Sabotagem: âncora única NOS DOIS SENTIDOS, restauração por edição reversa (NUNCA
  `git checkout` — queimou 2× na Etapa 12), md5 antes/durante/depois; par positivo+negativo
  em todo gate. Commits pt-BR sem acento, `git add` explícito.
- Baseline: `npm run test:api` = 116/116; client 436/436.

## Sort topológico

| Task | O quê | Classe |
|---|---|---|
| 1 | registro + refactor dispatcher + lista + export | tronco |
| 2 | indicadores | tronco (usa o registro) |
| 3 | tela | galho (worktree) |
| 4 | dashboard + jornada | galho (principal, após 1-2) |
| 5 | fechar-etapa | — |

---

### Task 1: Registro, lista fail-closed e export XLSX (RN-01, RN-02, RN-03)

**Files:** Create `server/services/almoxarifado/reportRegistry.js`;
Modify `server/routes/almoxarifado/extended.js` (dispatcher consome o registro; rotas novas
lista + export); Test `server/tests/api/relatoriosRegistro.api.test.js` (novo).

- `reportRegistry.js` exporta `RELATORIOS`: para CADA uma das 17 chaves atuais,
  `{ titulo, categoria ('Estoque'|'Movimentações'|'Gestão'|'Terceiros e clientes'), acao
  (string|null EXPLÍCITO), params: [{ nome, rotulo, tipo: 'date'|'number'|'text',
  obrigatorio }], colunas: [{ chave, rotulo }] | null, fn: null }`. As funções são LIGADAS no
  `extended.js` (o registro não importa serviços — evita ciclo e mantém o registro puro de
  metadados; o dispatcher valida na subida que TODA chave do registro ganhou `fn`).
  Gates atuais preservados: `inventario-divergencias` → `'inventario'`,
  `solicitacoes-compra` → `'gerenciar_reposicao'`, resto `null`. TODA entrada declara também
  **`exportavel: true|false`** (Fase 2, C1: `materiais-cliente` e `sucata-financeiro` devolvem
  OBJETO — medido, o xlsx explode com TypeError; os dois entram `exportavel: false`, e
  `indicadores` na Task 2 é o terceiro) e **`limite`** (Fase 2, I5: historico-movimentacoes e
  inventario-divergencias têm LIMIT 500 na query, materiais-mais-consumidos LIMIT 10 — o
  export herda o teto; declarar `limite: 500|10|null` e a tela avisa "mostrando os primeiros
  N" quando `linhas === limite`; aumentar/remover LIMIT é letra B). `colunas` é OBRIGATÓRIA
  quando `exportavel: true` (Fase 2, I9: com resultado vazio e sem colunas, o xlsx gera
  planilha de zero colunas — o "só cabeçalho" não existe sem declaração). Params com os NOMES
  REAIS de cada função: `sucata-financeiro` usa **`de`/`ate`** (não data_inicio/data_fim —
  Fase 2, I6: nome errado não erra, é IGNORADO e devolve o período inteiro parecendo
  filtrado); `reservado-os` NÃO marca os_id obrigatório (Fase 2, M8: sem ele o relatório
  devolve todas as reservas ativas HOJE — obrigar seria mudança de comportamento disfarçada);
  o único obrigatório real é `cliente_id` do materiais-cliente. **Par inverso obrigatório:**
  além de "toda chave do registro tem fn", validar que toda chave do mapa `reports` existe no
  registro — senão um relatório fica servível e FORA da lista/gate, a classe que a etapa mata.
- Dispatcher `GET /relatorios/:tipo`: resolve `fn` e `acao` PELO REGISTRO (apaga os dois ifs
  inline; os literais 403/404 idênticos). `GET /relatorios` (lista): filtra por
  `acao === null || can(req.user, acao)`, devolve `{ relatorios: [...] }` SEM o campo `acao`.
  `GET /relatorios/:tipo/export` (Fase 2, C1/C2/C3/I9/I10 — tudo medido): gate →
  `await fn(db, req.query)` → se `exportavel === false` OU o payload não for `Array.isArray`,
  400 `Relatório sem exportação tabular` — e SÓ DEPOIS disso qualquer `setHeader` (I10: header
  antes do await estoura ERR_HTTP_HEADERS_SENT no 400/403/404). O export **NÃO passa linhas
  cruas ao json_to_sheet**: projeta primeiro —
  `const linhas = dados.map(r => Object.fromEntries(colunas.map(c => [c.rotulo, r[c.chave]])))`
  e `json_to_sheet(linhas, { header: colunas.map(c => c.rotulo) })`. Motivo medido (C2):
  `header` NÃO descarta chave não declarada (6 declaradas → 64 colunas em estoque-atual, com
  custo_medio/proprietario_cliente_id vazando; inventario-divergencias re-exporia ic.* e
  desfaria o gate da 10b em planilha). E **NUNCA** passar `RELATORIOS[tipo].colunas` direto
  como header (C3, medido): json_to_sheet faz PUSH no array — o registro singleton fica
  corrompido e a rota da lista passa a servir as colunas vazadas até reiniciar; sempre
  `.map()` novo. Attachment `<tipo>-<AAAA-MM-DD>.xlsx`; resultado vazio → planilha só com a
  linha de cabeçalho dos rótulos (200).
- [x] Step 1: teste vermelho — `server/tests/api/relatoriosRegistro.api.test.js` (15 casos)
  cobre os 6 itens: (1) registro completo (17 chaves, `acao` em toda entrada, categorias
  válidas, `colunas` obrigatória quando `exportavel:true`); (2) lista ADMIN (17) e PRODUCAO
  (15, sem os 2 gated), sem campo `acao`; (3) paridade dispatcher×lista com stubs
  `ordens_servico`/`projetos` (molde clientePosicaoTipos.api.test.js:101) e o PAR INVERSO
  (`registerExtendedRoutes.__reportKeys`, propriedade exposta só para este teste); (4) gates
  preservados (inventario-divergencias, solicitacoes-compra) com par positivo+negativo;
  (5) export com paridade de linhas e cabeçalho por `deepStrictEqual`, export 2x provando
  registro inalterado (C3), 400 de payload não-tabular (C1), 403 do export gated, 404 de
  tipo inexistente; (6) filtro `de`/`ate` da sucata cortando uma de duas, e nome errado
  (`data_inicio`) provado como ignorado.
- [x] Step 2: implementação — `server/services/almoxarifado/reportRegistry.js` (novo, 17
  chaves, metadados puros sem `fn`) + `server/routes/almoxarifado/extended.js` (dispatcher
  refatorado para resolver `fn`/gate pelo registro com validação de paridade nos dois
  sentidos na subida; `GET /relatorios` lista fail-closed; `GET /relatorios/:tipo/export`
  novo, projeção de colunas via `.map()` novo — nunca o array do registro).
- [x] Step 3: verde (15/15) + regressão dos 9 arquivos que consomem `relatorios/`
  (conferenciaAcuracidade, enderecamento, materialClienteIlhaAposentada,
  materialClientePosicao, materialClienteSegregacao, reposicaoGerarSolicitacoes,
  reposicaoJornada, sobras, sucateamentoRotas — todos verdes) + suíte completa 116→117
  (117/117 OK).
- [x] Step 4: controles positivos aplicados por edição reversa (nunca `git checkout`), md5
  conferido antes/depois de cada um — todos vermelhos como esperado, depois restaurados: (i)
  apagar `acao: null` de `estoque-atual` → derrubou os testes 1, 2 (ADMIN e PRODUCAO) e 5, e
  também 3 (a entrada some da lista e da paridade); (ii) `filter(...|| true)` na lista → só o
  teste de PRODUCAO caiu (17 em vez de 15), como esperado — a lista do ADMIN não muda; (iii)
  export com query própria (`reportService.relatorioAbaixoMinimo(db)` fixo em vez de
  `entrada.fn`) → derrubou a paridade de linhas (5) e o literal 400 do `materiais-cliente`
  (a função errada nunca lança o erro de `cliente_id`); (iv) gate do export removido →
  derrubou exatamente "export de tipo gated sem perfil: 403" (200 em vez de 403).
- [x] Step 5: suíte (117/117) + commit `781c784` ("Almoxarifado Etapa 13 Task 1: registro de
  relatorios + lista fail-closed + export XLSX (RN-01/02/03)").

### Task 2: Indicadores gerenciais — ✅ FEITA (`4f8e3fc` + fix-round no fechamento da revisão)

> Revisão: código certo em todos os casos adversariais (paridade do consumoSql provada por
> IGUALDADE de SQL+payload contra a versão pré-refactor), mas 11 mutações de uma linha
> passavam verdes — cross-asserts baratos adicionados (cliente/cancelado/ativo/janela/MIN
> provados em todos os blocos); a `nota` passou a declarar os desvios (atendimento sem
> janela; rupturas por evento físico; cliente fora); assimetria querystring×config declarada
> em comentário. Desvios do implementador aceitos pelo revisor: atendimento sem janela
> (leitura literal do design — REJEITADA só a omissão na nota, corrigida), mediana
> arredondada, ativo=1 nas 4 queries.

**Files:** Modify `server/services/almoxarifado/reportService.js` (função
`relatorioIndicadores`), `server/services/almoxarifado/reportRegistry.js` +
`extended.js` (chave `indicadores`, categoria 'Gestão', `acao: null` — D5, `exportavel:
false`/`colunas: null` — o 400 do export já nasceu na Task 1);
Create `server/services/almoxarifado/consumoSql.js` (fonte única de consumo — Global
Constraints/C4) e Modify `server/services/almoxarifado/purchaseService.js` (passa a consumir
o fragmento; regressão comprasMinimos/reposicaoGerarSolicitacoes/reposicaoJornada intacta);
Test `server/tests/api/relatoriosIndicadores.api.test.js` (novo).

- Régua (RN-04, shape congelado no design): giro (valor consumido na janela via saídas ×
  `custoUnitarioSql` ÷ `valorEstoqueSql` atual, com os DOIS operandos no payload), cobertura
  (mediana dos dias por material com consumo; `materiais_sem_consumo` contados à parte),
  rupturas (Fase 2, C5 — régua CORRIGIDA: materiais próprios ativos com movimentação
  `cancelado = 0` na janela, `saldo_posterior <= 0` **E `tipo` em `TIPOS_SAIDA` ou
  `AJUSTE_INVENTARIO`** — tipos neutros como LIBERACAO_RESERVA/BLOQUEIO gravam
  saldo_posterior = saldo_anterior (stockService.js:554) e num material já zerado atribuiriam
  a 1ª ruptura a lançamento burocrático, medido; DECLARADO letra E: régua olha o saldo
  FÍSICO, não o disponível — 100% reservado não aparece, medido; contagem de EVENTO, não de
  estado — zerado antes da janela sem movimento nela não entra; AJUSTE_INVENTARIO que zera
  por contagem CONTA, por decisão; lista com codigo/nome/data da 1ª ruptura), valor por
  grupo (`valorEstoqueSql` GROUP BY `COALESCE(categoria,'Sem categoria')` — só próprios),
  atendimento (Fase 2, I7: `AVG((julianday(data_entrega) - julianday(created_at)) * 24)`
  **com `WHERE data_entrega IS NOT NULL`** e `total_consideradas = COUNT(*)` DENTRO desse
  WHERE — sem o filtro o COUNT conta requisição não entregue, medido 3 vs 2; DECLARADO:
  data_entrega tem UM escritor (requisitionService.js:376) e só na entrega COMPLETA — parcial
  e ENCERRADA sem completar ficam fora). Arredondamento (I8, medido: julianday devolve
  6.499999992549419 para 6h30): `media_horas` e `indice` do giro saem `Number(x.toFixed(2))`;
  asserts exatos contra o arredondado; monetários com `Math.abs(a-b) < 1e-9`.
- `janela_dias`: default 90; inválido → 400 literal da Global Constraint.
- [x] Step 1: teste vermelho — cenário construído pelo MOTOR REAL (entradas com custo, saídas,
  material 100% de cliente que NÃO pode contaminar nada, material zerado na janela, requisição
  entregue com timestamps controlados): asserts NUMÉRICOS exatos (contra os arredondados —
  I8); janela=1 exclui movimento antigo; `janela_dias=0` → 400 literal; janela OMITIDA usa
  `reposicao_janela_consumo_dias` da config (setar 30 e provar que a janela efetiva muda —
  I4); material de cliente ausente de rupturas/valor_por_grupo (par: o MESMO material como
  próprio aparece). FIXTURE OBRIGATÓRIA de custo (I2): um material custo_medio=0/
  custo_unitario=10 e outro custo_medio=12/custo_unitario=10 — valor_consumido e
  valor_estoque_atual por número exato, para que ler custo_unitario puro (que a varredura NÃO
  pega, medido) fique vermelho.
- [x] Step 2: implementação (custo/valor SÓ pelas fontes únicas — o teste-varredura pega).
- [x] Step 3: verde + suíte (117→118).
- [x] Step 4: controles positivos — (i) trocar mediana por média na cobertura → cai (fixture
  com outlier); (ii) incluir cliente no valor_por_grupo → cai; (iii-a) tipo neutro
  (LIBERACAO_RESERVA) em material zerado NÃO entra na lista nem vira data da 1ª ruptura → sem
  o filtro de tipo, cai; (iii-b) material quantidade_atual=10/reservada=10 NÃO entra (par
  negativo da aproximação declarada — se alguém "consertar" para disponível, cai e a decisão
  volta à mesa); (iii-c) régua para `< 0` → cai.
- [x] Step 5: suíte + commit.

### Task 3: Tela `/almoxarifado/relatorios` (galho, worktree)

**Files:** Create `client/src/components/almoxarifado/RelatoriosAlmoxarifado.js` + `.test.js`;
Modify `lazyModules.js`, `App.js`, `Layout.js` (menu, ícone ≠ dos usados).

- Contrato: os 3 endpoints da Task 1 + o shape de `indicadores` (mock HTTP). Menu agrupado
  por `categoria` SÓ com o que a lista devolveu; formulário de `params` por declaração
  (date/number/text, obrigatório marcado); tabela genérica (colunas do payload; datas
  UTC-safe; `—` para nulos); tipo `indicadores` renderiza os 5 blocos como cards/tabelas (não
  a tabela genérica); botão **Exportar XLSX** (window.open/anchor para a rota de export com a
  MESMA querystring; oculto para `indicadores`); painel de erro por estado com retry (403/erro
  de rede NUNCA viram lista vazia — lição da 11); duplo clique de consulta desabilita botão.

  > **DIVERGÊNCIA MEDIDA na execução (contrato real ≠ premissa acima):** o handler real de
  > `GET /api/almoxarifado/relatorios` (`extended.js`) só mapeia
  > `{ tipo, titulo, categoria, params }` — SEM `exportavel`, `limite` nem `colunas` (RN-02 já
  > dizia isso; o parágrafo acima, herdado do design, presumia que a tela lia esses campos
  > direto da lista, e não dá). Duas decisões tomadas e registradas no cabeçalho de
  > `RelatoriosAlmoxarifado.js`:
  > 1. **Botão Exportar XLSX** não usa um campo `exportavel` (não existe na lista) — usa
  >    `Array.isArray(payload da última consulta)` como proxy. É seguro porque o próprio
  >    registro do servidor GARANTE a equivalência (Task 1: `colunas` obrigatória quando
  >    `exportavel:true`; export 400 quando o payload não é array — hoje só
  >    `materiais-cliente`/`sucata-financeiro` são objeto e `exportavel:false`).
  > 2. **Aviso "mostrando os primeiros N"** não lê um `limite` da lista (não existe) — usa uma
  >    tabela local em `RelatoriosAlmoxarifado.js` que ESPELHA os 3 valores hoje declarados em
  >    `reportRegistry.js` (historico-movimentacoes: 500, inventario-divergencias: 500,
  >    materiais-mais-consumidos: 10). **Risco de desalinhamento registrado**: se o registro
  >    mudar um desses limites (letra B), esta tabela local não muda sozinha — não há como a
  >    tela descobrir isso pela lista sem alterar o contrato congelado, fora do escopo de uma
  >    task de galho (só front).
  > 3. O download do export usa `api.get(..., { responseType: 'blob' })` + link temporário
  >    (o mesmo padrão já usado em PropostaForm.js/PropostasList.js/CustosViagens.js), não
  >    `window.open`/anchor direto na rota como o parágrafo acima sugeria: a autenticação deste
  >    app é por Bearer token em header (`services/api.js`), que uma navegação crua do browser
  >    não carrega (o servidor até aceita `?token=` como fallback em `authenticateToken`, mas
  >    isso vazaria o token na URL/histórico — nenhum outro download do app faz isso).
  > 4. `indicadores` não foi testado com fixture de "5 blocos" fixos porque a Task 2 (que cria
  >    esse relatório) ainda não existe nesta worktree — a fixture de teste usa uma forma
  >    realista e menor (`janela_dias` escalar, `giro` objeto aninhado, `rupturas.materiais`
  >    array aninhado) para provar que a renderização é GENÉRICA (recursiva por shape, nunca
  >    por nome de chave) e vai funcionar com o shape real da Task 2 sem precisar de ajuste.
  >
  > **ISTO FOI CORRIGIDO — os itens 1 e 2 acima ESTAVAM CERTOS no momento em que foram escritos
  > (contrato medido de verdade), mas deixaram de valer.** O fix-round da revisão da Task 1
  > (commit `cfdbbe5`, "varredura do registro + lista alargada") ALARGOU
  > `GET /api/almoxarifado/relatorios` para devolver também `exportavel`, `limite` e `nota` por
  > relatório — exatamente os três campos cuja ausência forçou os contornos 1/2 acima. Depois de
  > `git rebase cfdbbe5` nesta worktree:
  > - **Botão Exportar XLSX** passou a ler `entradaSelecionada.exportavel` da lista (fonte),
  >   não mais `Array.isArray(payload)` como proxy — o `Array.isArray` continua como guarda
  >   extra (defesa em profundidade), mas não decide mais sozinho. Prova: fixture nova
  >   `diagnostico-consistencia` (`exportavel:false`) devolvendo payload ARRAY não mostra mais
  >   o botão — o caso exato que o proxy antigo acertava por acidente e que passaria a errar se
  >   o registro algum dia tivesse `exportavel:false` com payload tabular.
  > - **Tabela local `LIMITE_CONHECIDO` (500/500/10) foi APAGADA** — `atingiuLimite` lê
  >   `entradaSelecionada.limite` direto. Prova: a mesma fixture `diagnostico-consistencia` usa
  >   `limite:3`, valor que nunca existiu em nenhuma tabela hardcoded desta tela; o aviso só
  >   aparece com exatamente 3 linhas se o campo estiver sendo lido de verdade.
  > - **Nota/régua deixou de ser corte** — `entradaSelecionada.nota` (quando não-nula) renderiza
  >   logo abaixo do título do relatório, com o texto EXATO que vem da lista.
  > - O ponto 3 (download via `api.get`+blob, não `window.open`/anchor) e o ponto 4
  >   (`indicadores` genérico) continuam válidos — não eram sobre o shape da lista.
- [x] Testes: 20 (16 da primeira rodada + 4 do realinhamento pós-`cfdbbe5`), fixtures com
  números distintos, asserts por célula: menu só com o listado (2 testes, incluindo lista
  reduzida por gate); params obrigatórios bloqueiam consulta sem chamada; nomes de parâmetro do
  registro (sucata-financeiro usa `de`/`ate`); consulta manda querystring certa (vazios
  omitidos); tabela por célula + data UTC-safe cruzando meia-noite; payload objeto com
  escalar+objeto aninhado+array aninhado; aviso de limite aparece com 10 linhas (materiais-
  mais-consumidos) e NÃO aparece com 9 (par positivo+negativo), MAIS o par com limite atípico
  (3, `diagnostico-consistencia`) provando que é o campo, não uma tabela local; nota aparece
  com o texto exato da lista (e some quando `nota:null`); export usa a MESMA querystring
  quando `exportavel:true`, NÃO existe antes da 1ª consulta, NÃO existe para payload objeto, e
  NÃO existe para payload array quando `exportavel:false` (o caso do proxy); 403 na lista →
  painel com retry; rede na consulta → painel mantendo menu; botão desabilitado em voo (sem
  segunda chamada no duplo clique).
- [x] Sabotagens mínimas confirmadas vermelhas e restauradas por edição reversa (NUNCA
  `git checkout`), md5 antes/depois/depois-de-restaurar batendo: export apontando para o
  dispatcher (sem `/export`) → caiu o teste de export; menu com item hardcoded fora da lista
  (`abaixo-minimo` sempre injetado em "Estoque") → caiu o teste de menu; aviso de limite
  forçado a não renderizar (`{false && atingiuLimite && (...)}`) → caiu os DOIS testes de
  limite (10 linhas E o limite atípico 3) — reconfirmado após o realinhamento pós-`cfdbbe5`.
- Rodapé por relatório: a régua/nota declarada no registro (Fase 2, C4 — consumo-os diz 10
  onde indicadores diz 18; os dois números na mesma página precisam da régua escrita) e o
  aviso "mostrando os primeiros N" quando `linhas === limite` (I5) — **ambos implementados
  lendo `exportavel`/`limite`/`nota` direto da lista** (não mais tabela local nem corte; ver
  bloco "ISTO FOI CORRIGIDO" acima).
- [x] Full client suite (456/456 = 452 anterior + 4 novos) + build limpo
  (`Compiled successfully`) + `npm run test:api` NA WORKTREE (117/117 — o fix-round `cfdbbe5`
  já está no HEAD após o rebase). Commits na worktree (`git rebase cfdbbe5` trocou os hashes
  originais `59fb871`/`c6a3dca` pelos equivalentes reaplicados `a69a40a`/`8ec85a9`), mais
  `3e13632` ("Task 3: realinha com a lista alargada (cfdbbe5)", o realinhamento dos 3
  contornos) por cima. Branch `worktree-agent-aabb04d3e82023d0d`. Reconferir a
  suíte de client DEPOIS do merge (a Task 4 muda o client na árvore principal em paralelo — o
  número da worktree fica defasado; Fase 2, M7) — **ainda não feito, é o merge desta worktree
  para a árvore principal, que não é parte desta task** (a task pediu caminho da worktree +
  branch + hash, sem merge).

### Task 4: Dashboard + teste-jornada — ✅ FEITA

**Files:** Modify `client/src/components/almoxarifado/AlmoxarifadoDashboard.js`;
Create `client/src/components/almoxarifado/AlmoxarifadoDashboard.test.js` (7 casos),
`server/tests/api/relatoriosJornada.api.test.js` (6 casos).

- Dashboard: 3 cartões (giro, rupturas, tempo médio de atendimento) do endpoint
  `relatorios/indicadores`, com legenda da janela; falha do endpoint → erro localizado nos 3
  cartões, KPIs existentes intactos (teste com mock rejeitando SÓ o indicadores).
- Jornada (servidor, motor real): semear estoque/movimentações/requisição → lista como GESTOR
  contém `indicadores` e `solicitacoes-compra`; como PRODUCAO não contém os gated → consultar
  `indicadores` (números batem com o semeado) → exportar `estoque-atual` e conferir paridade
  de linhas com o dispatcher → 403 do export gated como PRODUCAO → 404 de tipo inventado.
  Sabotagem da jornada: gate do export removido → elo do 403 cai.
- [x] Step 1: dashboard — busca `relatorios/indicadores` UMA vez, em `useEffect`/estado ISOLADOS
  do `loadDashboard` (nunca dentro do mesmo try/catch), com painel de erro próprio (com retry)
  nos 3 cartões novos. Cartão de atendimento não janelado — legenda "todo o histórico" (desvio
  já declarado na `nota` do registro, Task 2). 7 testes (client): valor exato dos 3 cartões,
  janela efetiva na legenda dos 2 janelados, ausência da legenda de janela no de atendimento,
  UMA chamada só, 403/rede isolados sem derrubar KPIs existentes, retry funcional. Controle
  positivo aplicado por edição reversa (md5 antes/depois, nunca `git checkout`): trocar a
  legenda do atendimento por "Janela de X dias" derrubou 2/7 — restaurado, hash confere.
- [x] Step 2: jornada (servidor) — semeia 3 materiais + 1 requisição ENTREGUE via
  `PUT /requisicoes/:id/entregar` (motor real, mesma rota de `requisicaoEntregaMotor.api.
  test.js`). Achado durante a escrita: a entrega da requisição TAMBÉM é uma SAIDA pelo motor —
  os números esperados de giro (`valor_consumido`/`valor_estoque_atual`) tiveram de somar essa
  saída junto com a do material dedicado, não só este último (o indicador agrega o módulo
  inteiro, não um recorte). 6 casos: lista GESTOR (18/18, com `indicadores` e
  `solicitacoes-compra`) e PRODUCAO (16/18, paridade 200/400 nos dois papéis); indicadores com
  asserts exatos (`giro.indice=0.25`, `atendimento_requisicoes.media_horas` computado dos
  timestamps reais gravados pelo motor, não hardcoded); export `estoque-atual` com paridade de
  linhas E cabeçalho (rótulos declarados) por `deepStrictEqual`; `solicitacoes-compra/export`
  403 PRODUCAO / 200 ADMIN; tipo inventado 404 no dispatcher e no export.
- [x] Step 3: sabotagem — gate do export removido (o `if (entrada.acao !== null && !can(...))`
  de DENTRO da rota `/export`, não o do dispatcher) → só o elo `[4]` (403 PRODUCAO) caiu, os
  outros 5 continuaram verdes; restaurado por edição reversa, md5 de
  `routes/almoxarifado/extended.js` idêntico antes/depois.
- [x] Step 4: regressão — client 436/436 → **443/443** (32 suítes); build CI=true OK;
  `npm run test:api` 118/118 → **119/119**.
- [x] Step 5: commit "Almoxarifado Etapa 13 Task 4: dashboard + teste-jornada (RN-06)" (arquivos
  explícitos: `AlmoxarifadoDashboard.js`, `AlmoxarifadoDashboard.test.js`,
  `relatoriosJornada.api.test.js`, este plano). Hash a registrar no fechamento da etapa
  (Task 5) junto com o README da feature e o mapa de status.

### Task 5: Fechar a etapa — ✅ FEITA (commits de fechamento; ver retro abaixo)
- [ ] `fechar-etapa` completa (7 artefatos + verificação medida + retro de 4 números).
- [ ] Corrigir a spec 21 DIZENDO que estava errada (Fase 2, M3): ela afirma "15 tipos no mapa"
  e "eram 16" — são 17 (medido); e o design desta etapa dizia "2 consumidos no front" — são 3
  (dashboard: consumo-os e materiais-mais-consumidos; ReposicaoAlmoxarifado: o GATED
  solicitacoes-compra — a regressão do refactor tem de cobrir esse consumidor).

## Self-review do plano (feito na escrita)

- O refactor do dispatcher é o único ponto que toca comportamento existente — blindado por
  "nenhum shape muda" + regressão da suíte inteira + literais congelados copiados do código.
- Registro sem `fn` (metadados puros) evita ciclo de require e deixa a Task 3 consumir a
  lista sem carregar serviço nenhum.
- Indicadores com asserts numéricos exatos e cenário pelo motor real — a lição de TODAS as
  etapas: teste que aceita `>= 0` não sabe falhar.
- Export com paridade MEDIDA (reabrir o XLSX e comparar linhas) — senão a sabotagem (iii) da
  Task 1 não teria como ficar vermelha.


---

## Retro de 4 números (Fase 6)

1. **Rodadas de correção até verde:** 4 fix-rounds (T1, T2+carona-C1-da-T3, T3, final) — todas
   fechadas em UMA rodada; nenhum teste falhou 3 vezes seguidas. A T3 teve ainda 1 rodada de
   REALINHAMENTO de contrato (não era defeito: o shape alargou sob ela — custo do paralelismo,
   pago com rebase limpo).
2. **Achados de revisão:** Fase 2 = 23 (5C+10I+8M, 2 suspeitas refutadas e registradas);
   revisões de task = ~30; revisão final = 2×Approve com 10 itens leves. **0 ruído** em todas
   — cada achado veio com medição.
3. **Paralelismo:** 3 pares reais (revisão-T1 ∥ implementação-T3; fix-T3 ∥ implementação-T2…
   na prática T2-review ∥ T3-realinhamento; T4 ∥ fix-T3). UM retrabalho estrutural: a T3
   construiu contra o shape estreito e realinhou — previsto e barato (a tela é dirigida pela
   lista). Zero conflito de merge.
4. **Defeito que escapou do fechamento:** preencher na Etapa 14. (Da 12 para cá: nenhum
   reportado até este fechamento.)

**Incidentes de processo:** 1 âncora de sabotagem com 3 ocorrências corrompeu 7 entradas do
registro na restauração — a varredura recém-criada apontou as 7 pelo nome e o md5 acusou
(lição G5, 5ª reincidência da sessão); 1 fixture de sabotagem no material errado (mediana não
se movia) — trocada pelo material que segura a mediana, com o erro registrado no comentário.

## Próxima tarefa detalhada — Etapa 14 (integrações, feature 22)

- **Fase 0 OBRIGATÓRIA antes de qualquer design:** a spec 22 sempre disse "depende da
  maturidade dos outros módulos". MEDIR (não presumir): existe BOM em Engenharia? OP em
  Produção? O módulo Compras tem pedido/recebimento reais? `ls specs/` dos vizinhos + grep de
  rotas. Sem maturidade → a etapa vira a fatia integrável REAL: **fechar/cancelar solicitação
  de compra no recebimento** (a ponta que a 11 declarou — B14 aberta) e integração de custo
  por projeto se os dados existirem; o resto fica ESCRITO como bloqueado por dependência.
- **O que está pronto e a 14 não reabre:** solicitações de compra (purchaseService, estados
  PENDENTE/VINCULADO da 11), consumoSql/custoSql/disponivelSql (fontes únicas), a fila de
  notificações da 12 (se integração quiser avisar, enfileira — canal pronto), o
  reportRegistry da 13 (relatório novo de integração = 1 entrada declarada).
- **Regras vivas:** B11/B14 abertas — a 14 é a candidata natural a FECHAR a B14 (cancelar
  solicitação), decidir na Fase 1; B18-B20 da 13 abertas; almoxarifado é área física.
