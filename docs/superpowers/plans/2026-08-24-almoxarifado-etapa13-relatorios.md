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
- [ ] Step 1: teste vermelho — (1) registro completo: as 17 chaves atuais presentes, TODA
  entrada com `acao` declarada (`'acao' in entrada`), categorias válidas; (2) lista como
  ADMIN traz 17+ tipos; como PRODUCAO (sem perfil) NÃO traz os 2 gated e TRAZ os sem gate;
  sem campo `acao` no JSON; (3) paridade dispatcher×lista: para todo tipo da lista, `res.status` ∈ {200, 400} (400 só
  para param obrigatório ausente) — NUNCA 404 e NUNCA ≥ 500; o teste cria stubs
  `ordens_servico` e `projetos` (molde: clientePosicaoTipos.api.test.js:101), senão
  `materiais-cliente` responde 500 no harness e "≠404" o aprova (Fase 2, I3 — medido);
  e o PAR INVERSO: toda chave do mapa `reports` do extended.js existe no registro; (4) gates preservados: PRODUCAO em `inventario-divergencias` → 403
  literal com `acao: 'inventario'`; ADMIN → 200 (par positivo+negativo, idem
  solicitacoes-compra com COMPRAS positivo); (5) export: `estoque-atual` como ADMIN → 200,
  content-type de xlsx, attachment correto, e o BUFFER reaberto com a própria lib `xlsx` tem
  as mesmas LINHAS do JSON do dispatcher E o CABEÇALHO por deepStrictEqual contra os RÓTULOS
  declarados (Fase 2, C2 — paridade de linhas sozinha passa com 64 colunas vazando); exportar
  o MESMO tipo DUAS vezes no mesmo processo → cabeçalhos idênticos e `GET /relatorios` com
  params/colunas inalterados depois (C3 — sem isso a mutação do registro nunca fica
  vermelha); export de `sucata-financeiro` e de `materiais-cliente?cliente_id=N` → 400
  `Relatório sem exportação tabular` (C1); export de tipo gated sem perfil → 403; tipo
  inexistente → 404; `materiais-cliente` sem `cliente_id` → 400 `informe o cliente_id`
  igual ao dispatcher; (6) filtro com os NOMES declarados: `sucata-financeiro` com `de`
  cortando uma de duas sucatas em datas diferentes (I6 — filtro ignorado é indistinguível de
  sem-filtro sem esse par).
- [ ] Step 2: implementação.
- [ ] Step 3: verde + regressão dos testes de relatório existentes + suíte completa (116→117).
- [ ] Step 4: controles positivos — (i) apagar `acao` de uma entrada do registro → teste 1
  cai; (ii) lista deixando de filtrar (`can` → true) → teste 2 cai; (iii) export com query
  própria (trocar `fn` por SELECT direto de outra tabela) → paridade (5) cai; (iv) gate do
  export removido → 403 do export cai.
- [ ] Step 5: suíte + commit.

### Task 2: Indicadores gerenciais (RN-04)

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
- [ ] Step 1: teste vermelho — cenário construído pelo MOTOR REAL (entradas com custo, saídas,
  material 100% de cliente que NÃO pode contaminar nada, material zerado na janela, requisição
  entregue com timestamps controlados): asserts NUMÉRICOS exatos (contra os arredondados —
  I8); janela=1 exclui movimento antigo; `janela_dias=0` → 400 literal; janela OMITIDA usa
  `reposicao_janela_consumo_dias` da config (setar 30 e provar que a janela efetiva muda —
  I4); material de cliente ausente de rupturas/valor_por_grupo (par: o MESMO material como
  próprio aparece). FIXTURE OBRIGATÓRIA de custo (I2): um material custo_medio=0/
  custo_unitario=10 e outro custo_medio=12/custo_unitario=10 — valor_consumido e
  valor_estoque_atual por número exato, para que ler custo_unitario puro (que a varredura NÃO
  pega, medido) fique vermelho.
- [ ] Step 2: implementação (custo/valor SÓ pelas fontes únicas — o teste-varredura pega).
- [ ] Step 3: verde + suíte (117→118).
- [ ] Step 4: controles positivos — (i) trocar mediana por média na cobertura → cai (fixture
  com outlier); (ii) incluir cliente no valor_por_grupo → cai; (iii-a) tipo neutro
  (LIBERACAO_RESERVA) em material zerado NÃO entra na lista nem vira data da 1ª ruptura → sem
  o filtro de tipo, cai; (iii-b) material quantidade_atual=10/reservada=10 NÃO entra (par
  negativo da aproximação declarada — se alguém "consertar" para disponível, cai e a decisão
  volta à mesa); (iii-c) régua para `< 0` → cai.
- [ ] Step 5: suíte + commit.

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
- [ ] Testes (mínimo 9, fixtures com números distintos, asserts por célula): menu só com o
  listado; params obrigatórios bloqueiam consulta; consulta manda querystring certa; tabela
  por célula; indicadores renderiza blocos; export usa a MESMA querystring; 403 → painel;
  rede → painel; botão desabilitado em voo.
- [ ] Sabotagens mínimas: export apontando para o dispatcher (sem /export) → cai; painel de
  erro removido → cai; menu ignorando a lista (hardcode) → cai.
- Rodapé por relatório: a régua/nota declarada no registro (Fase 2, C4 — consumo-os diz 10
  onde indicadores diz 18; os dois números na mesma página precisam da régua escrita) e o
  aviso "mostrando os primeiros N" quando `linhas === limite` (I5).
- [ ] Full client suite + build + `npm run test:api` NA WORKTREE (regra da base). Commit na
  worktree. Reconferir a suíte de client DEPOIS do merge (a Task 4 muda o client na árvore
  principal em paralelo — o número da worktree fica defasado; Fase 2, M7).

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
