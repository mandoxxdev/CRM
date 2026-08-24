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
- [x] Testes: 16 (acima do mínimo 9), fixtures com números distintos, asserts por célula: menu
  só com o listado (2 testes, incluindo lista reduzida por gate); params obrigatórios bloqueiam
  consulta sem chamada; nomes de parâmetro do registro (sucata-financeiro usa `de`/`ate`);
  consulta manda querystring certa (vazios omitidos); tabela por célula + data UTC-safe
  cruzando meia-noite; payload objeto com escalar+objeto aninhado+array aninhado; aviso de
  limite aparece com 10 linhas e NÃO aparece com 9 (par positivo+negativo); export usa a MESMA
  querystring e só existe para payload array, e não antes da 1ª consulta; 403 na lista →
  painel com retry; rede na consulta → painel mantendo menu; botão desabilitado em voo (sem
  segunda chamada no duplo clique).
- [x] Sabotagens mínimas confirmadas vermelhas e restauradas por edição reversa (NUNCA
  `git checkout`), md5 antes/depois/depois-de-restaurar batendo: export apontando para o
  dispatcher (sem `/export`) → caiu o teste de export; menu com item hardcoded fora da lista
  (`abaixo-minimo` sempre injetado em "Estoque") → caiu o teste de menu; aviso de limite
  forçado a não renderizar (`{false && atingiuLimite && (...)}`) → caiu o teste de limite com
  10 linhas.
- Rodapé por relatório: a régua/nota declarada no registro (Fase 2, C4 — consumo-os diz 10
  onde indicadores diz 18; os dois números na mesma página precisam da régua escrita) e o
  aviso "mostrando os primeiros N" quando `linhas === limite` (I5) — implementado pela decisão
  2 acima (tabela local espelhando o registro, já que a lista não traz `limite`). A "régua/
  nota" textual por relatório (ex.: "consumo-os conta só SAIDA*") **não foi implementada**: a
  lista também não traz nenhum campo de nota/régua (não existe em `reportRegistry.js` nem no
  RN-05), então não há dado para exibir sem inventar texto estático por tipo — decisão: deixar
  de fora, sem gambiarra por nome de tipo, e registrar aqui como corte.
- [x] Full client suite (452/452 = 436 base + 16 novos) + build limpo (`Compiled successfully`)
  + `npm run test:api` NA WORKTREE (117/117 — nada de servidor muda nesta task, mas a regra da
  base manda rodar). Commit na worktree `59fb871` (branch
  `worktree-agent-aabb04d3e82023d0d`, em cima de `39a684c`, HEAD da Task 1 no momento em que
  esta worktree foi aberta). Reconferir a suíte de client DEPOIS do merge (a Task 4 muda o
  client na árvore principal em paralelo — o número da worktree fica defasado; Fase 2, M7) —
  **ainda não feito, é o merge desta worktree para a árvore principal, que não é parte desta
  task** (a task pediu caminho da worktree + branch + hash, sem merge).

### Task 4: Dashboard + teste-jornada (galho, árvore principal — SÓ após Tasks 1-2)

**Files:** Modify `client/src/components/almoxarifado/AlmoxarifadoDashboard.js` (+ teste);
Create `server/tests/api/relatoriosJornada.api.test.js`.

- Dashboard: 3 cartões (giro, rupturas, tempo médio de atendimento) do endpoint
  `relatorios/indicadores`, com legenda da janela; falha do endpoint → erro localizado nos 3
  cartões, KPIs existentes intactos (teste com mock rejeitando SÓ o indicadores).
- Jornada (servidor, motor real): semear estoque/movimentações/requisição → lista como GESTOR
  contém `indicadores` e `solicitacoes-compra`; como PRODUCAO não contém os gated → consultar
  `indicadores` (números batem com o semeado) → exportar `estoque-atual` e conferir paridade
  de linhas com o dispatcher → 403 do export gated como PRODUCAO → 404 de tipo inventado.
  Sabotagem da jornada: gate do export removido → elo do 403 cai.
- [ ] Commit (arquivos explícitos).

### Task 5: Fechar a etapa
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
