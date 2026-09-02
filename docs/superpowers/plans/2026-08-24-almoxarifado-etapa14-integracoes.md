# Etapa 14 — Integrações (a fatia real) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** fechar o ciclo da solicitação de compra (RECEBIDA automática no recebimento
processado + CANCELADA manual — fecha a B14), dar ao comprador o contexto do almoxarifado, e
somar o custo por projeto a partir do livro. BOM/OP ficam BLOQUEADOS e declarados (medido:
BOM não existe; MES sem uso).

**Spec:** `docs/superpowers/specs/2026-08-24-almoxarifado-etapa14-integracoes-design.md`
(RN-01..RN-06, D1..D8 — literais de lá são contrato).

## Global Constraints

- Literais congelados (RN-02/04 + Fase 2): 400 `Justificativa obrigatória para cancelar a
  solicitação`; 404 `Solicitação não encontrada` (serve cancelar E vincular — um literal só);
  400 `Solicitação já finalizada (RECEBIDA ou CANCELADA) — não pode ser cancelada`; 404
  `Material não encontrado`; 400 do vincular com pedido inexistente:
  `Pedido de compra não encontrado` (REUSADO de receiptService.criarRecebimento:76); literal
  do vincular-em-terminal congelado na Task 1 (família do de cancelar).
- **GATE (Fase 2, C2 — medido):** `/vincular-pedido` e `/verificar-minimos` estão em
  `requirePermission('configurar')` (ADMIN-only) — a Task 1 MUDA os dois para
  `gerenciar_reposicao` (D9; abertura de gate, letra B). Regressão explícita: COMPRAS passava
  403 no vincular, passa 200.
- **MOLDE DO HARNESS (Fase 2, C5 — o grep que o plano original mandava fazer volta VAZIO):**
  `pedidos_compra` NÃO existe no testApp e NENHUM teste de tests/api/ a cria; stub
  obrigatório: `CREATE TABLE IF NOT EXISTS pedidos_compra (id INTEGER PRIMARY KEY
  AUTOINCREMENT, numero TEXT UNIQUE, fornecedor_id INTEGER, valor_total REAL DEFAULT 0,
  status TEXT, data_pedido DATE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`.
  `itens_pedido_compra` JÁ vem do initSchema — não recriar. `projetos`: stub molde
  clientePosicaoTipos:99 (o JOIN só precisa de id/nome). `contas_pagar`: sem stub
  (gerarContaPagar checa sqlite_master e devolve null — medido). Caminho MÍNIMO real até
  PROCESSADO (medido): criarRecebimento({tipo_recebimento:'PEDIDO_COMPRA', pedido_compra_id})
  → avancarWorkflow('encaminhar_compras') → avancarWorkflow('finalizar_compras') →
  salvarDadosFiscal({nota_fiscal, data_emissao_nf, data_entrada_nf, valor_total_nota}) →
  processarNota. Recusas medidas: cedo → 400 `Processe a nota somente após entrada no
  faturamento`; sem dados fiscais → 400 `Preencha antes de processar: número da nota fiscal,
  data de emissão da nota, data de entrada da nota, valor total da nota`. Pedido sem
  fornecedor exige fornecedor_cnpj/nome no salvarDadosFiscal.
- Fontes únicas SEMPRE: `disponivelSql`, `consumoSql`, `custoUnitarioSql`/`valorEstoqueSql`,
  `movementTypes`. A varredura de custo NÃO pega `custo_unitario` puro (lição E13) — fixture
  numérica de custo duplo OBRIGATÓRIA no relatório e no contexto.
- Gancho do recebimento: try/catch + `console.warn`, NUNCA derruba `processarNota` (padrão
  RN-01 da E12); sabotagem obrigatória provando que o try/catch é load-bearing.
- Posição da reposição NÃO muda de código (D4) — a prova é a JORNADA (receber/cancelar →
  material volta à sugestão), não um teste de query.
- Registro de relatórios: entrada nova declara TODOS os campos (acao/exportavel/limite/nota/
  colunas/params com nomes reais) — a varredura da E13 já cobre e vai morder.
- Sem config nova. Auditoria com `dados_novos` OBJETO. Sabotagem: âncora única NOS DOIS
  SENTIDOS (contar ANTES — 5 reincidências na sessão), edição reversa (NUNCA git checkout),
  md5 antes/durante/depois. Commits pt-BR sem acento, git add explícito.
- Baseline: 119/119 api; client 471/471 (33 suítes).

## Sort topológico

| Task | O quê | Classe |
|---|---|---|
| 1 | ciclo da solicitação (safeAlter + cancelar + guarda no vincular + gancho no processarNota) | tronco |
| 2 | contexto do comprador | tronco curto |
| 3 | relatório custo-por-projeto | tronco curto |
| 4 | tela (cancelar + badges + contexto) | galho (worktree) |
| 5 | jornada | galho (principal) |
| 6 | fechar-etapa | — |

---

### Task 1: Ciclo de vida da solicitação (RN-01, RN-02, RN-03)

**Files:** Modify `server/services/almoxarifado/schema.js` (safeAlter: `recebida_em`,
`cancelada_em`, `cancelada_por`, `cancelamento_motivo` em `solicitacoes_compra_almoxarifado`),
`server/services/almoxarifado/purchaseService.js` (`cancelarSolicitacao`,
`fecharSolicitacoesDoPedido`, guarda de terminal em `vincularPedidoCompra`),
`server/services/almoxarifado/receiptService.js` (gancho pós-PROCESSADO em `processarNota`),
`server/routes/almoxarifado/extended.js` (rota cancelar).
**Test:** `server/tests/api/solicitacaoCicloVida.api.test.js` (novo).

- [x] Step 1/2: teste + implementação (110d8ce) — (1) cancelar PENDENTE: 200, status CANCELADA,
  colunas preenchidas, auditoria com objeto; sem motivo → 400 literal; id inexistente → 404
  literal; (2) cancelar VINCULADO: 200 (o vínculo é informativo — o pedido do core NÃO muda,
  declarado); (3) cancelar CANCELADA/RECEBIDA → 400 literal; vincular valida as DUAS pontas
  (RN-01b, Fase 2 C3 — hoje solicitação E pedido inexistentes respondem 200): inexistente →
  404 `Solicitação não encontrada`; terminal → 400 (literal nasce aqui); pedido inexistente →
  400 `Pedido de compra não encontrado`; (4) gates par positivo+negativo nas TRÊS rotas do
  pipeline (cancelar, vincular-pedido, verificar-minimos): ALMOXARIFE 403, COMPRAS 200 — e a
  regressão explícita de que vincular deixou de ser ADMIN-only (D9); (5) RECEBIDA automática
  pelo caminho MÍNIMO real do Global Constraints (stub de pedidos_compra dali) → solicitação
  RECEBIDA com `recebida_em`, auditada; PENDENTE não vinculada do MESMO material NÃO fecha;
  (5b) recebimento de pedido aprovado por `POST /recebimentos/:id/aprovar` (SEM processarNota
  — Fase 2 C4, medido) TAMBÉM fecha; segundo recebimento do mesmo pedido: 0 novas auditorias
  (I1 — o AND status='VINCULADO' é o dedupe); (6) gancho não derruba: monkeypatch de
  `fecharSolicitacoesDoPedido` lançando → processarNota conclui PROCESSADO E aprovar conclui
  APROVADO; (7) posição: após RECEBIDA o material com falta volta à sugestão
  (`calcularSugestoes`) — idem após CANCELADA. Dois casos ALÉM do previsto, achados na
  execução dos controles (não hipotetizados no plano): (i-controle) falha em
  `darEntradaEstoque` não pode fechar a solicitação antes da hora — medido: o (i) do Step 4
  como descrito ("gancho movido para ANTES do PROCESSADO") NÃO derrubava teste nenhum do
  conjunto original (o try/catch mascara a ordem, e nada mais lia `rec.pedido_compra_id`
  depois); caso novo adicionado e comprovado vermelho sob a sabotagem; (I6-espião) o dedupe
  `AND status='VINCULADO'` esconde uma chamada REDUNDANTE do número de auditorias — o teste
  do ramo delegante teve de virar espião de CHAMADAS (contagem de invocações), não de efeito,
  para provar (vii) de verdade.
- [x] Step 3: verde + regressão (reposicao*, recebimento*, comprasMinimos) + suíte (119→120,
  110d8ce). Regressão adicional achada e corrigida: `reposicaoGerarSolicitacoes` e
  `reposicaoJornada` vinculavam a `pedido_compra_id: 1` sem tabela `pedidos_compra` no
  harness — a checagem nova de RN-01b (pedido tem de existir) quebrava as duas com
  "no such table: pedidos_compra"; corrigido com o mesmo stub desta task nos dois arquivos.
- [x] Step 4: controles positivos (110d8ce, todos sabotados e revertidos manualmente — nunca
  `git checkout` — com vermelho provado antes de restaurar) — (i) gancho movido para ANTES de
  `darEntradaEstoque`/UPDATE PROCESSADO → NÃO derrubava o conjunto original (medido); teste
  novo adicionado prova a ordem (falha em `darEntradaEstoque` não pode fechar a solicitação);
  (ii) WHERE sem `status='VINCULADO'` → teste 5b cai (não o 5 — o 5 não repete recebimento);
  (iii) try/catch removido → teste 6 cai; (iv) guarda de terminal do cancelar removida →
  teste 3 cai; (v) checagem de existência do pedido removida → pedido fantasma cai (C3);
  (vi) gancho removido de `aprovarRecebimento` → teste 5b cai (C4); (vii) gancho TAMBÉM no
  ramo delegante de aprovar → contagem de auditorias NÃO cai (dedupe esconde o efeito);
  espião de chamadas adicionado e prova vermelho de verdade.
- [x] Step 5: suíte completa (120/120 arquivos) + test:almoxarifado (42/42) + test:validation
  (4/4) + test:safealter (3/3) + test:sqlite (3/3) + commit 110d8ce.

### Task 2: Contexto do comprador (RN-04)

**Files:** Modify `server/services/almoxarifado/purchaseService.js` (`contextoMaterial`),
`server/routes/almoxarifado/extended.js` (rota). **Test:**
`server/tests/api/compraContextoMaterial.api.test.js` (novo).

- [x] Step 1/2: teste + implementação (e78bc09) — `contextoMaterial` em purchaseService.js +
  `GET /compras/contexto-material/:id` (gate `gerenciar_reposicao`) em extended.js. 9 testes:
  (1) shape completo com números EXATOS (disponível/reservado/em_terceiros/consumo/
  solicitações abertas) pelo motor real; (2) `ultimo_custo_entrada` da NF real, DISTINTO de
  `custo_medio` (fixture com DUAS entradas reais — 10@10 depois 10@25 — custo_medio pondera
  para 17.5, ≠ 25 do último e ≠ 999 do decoy de cadastro); (3) duas entradas no MESMO
  `created_at` (fixture crua, backdate) → `mv.id DESC` decide; (4) entrada CANCELADA não é o
  último custo — cancela a movimentação da 2ª NF real via `stockService.cancelarMovimentacao`
  e o custo da 1ª volta; (5) consumo/`janela_dias` mudam com a config
  (`reposicao_janela_consumo_dias`); (6) `solicitacoes_abertas` só PENDENTE/VINCULADO
  (CANCELADA/RECEBIDA fora); (7) material de cliente → 200 com `proprietario_cliente:
  {id, razao_social}` e `solicitacoes_abertas: []` (por construção — nenhum código
  especial-caseado, a mesma query de sempre não encontra nada porque nada no módulo gera
  solicitação para material de cliente); (8) id inexistente → 404 `Material não encontrado`;
  (9) gates par ALMOXARIFE 403 / COMPRAS 200. Stub de `pedidos_compra` ENDURECIDO (N-2 da
  revisão da Task 1): `fornecedor_id INTEGER NOT NULL`, `status TEXT DEFAULT 'pendente'`.
- [x] Step 3: verde + regressão — suíte completa 121/121 arquivos (120→121), test:almoxarifado
  42/42, test:validation 4/4, test:safealter 3/3, test:sqlite 3/3.
- [x] Step 4: controles positivos (e78bc09, todos sabotados e revertidos manualmente — nunca
  `git checkout` —, md5 idêntico ao original antes/depois de cada um) — (i) régua lendo
  `custo_medio` do cadastro → testes (1) e (2) caem; (ii) régua lendo
  `materiais.custo_unitario` → especificamente o teste (4) do cancelamento cai (custo_unitario
  não reverte); (iii) `ORDER BY` sem `mv.id DESC` → teste (3) do empate no mesmo segundo cai
  (e (2)/(4) também, por tabela); (iv) `solicitacoes_abertas` sem o filtro de status → testes
  (1) e (6) caem (terminais vazam).
- [x] Step 5: commit único e78bc09 (server/services/almoxarifado/purchaseService.js,
  server/routes/almoxarifado/extended.js, server/tests/api/compraContextoMaterial.api.test.js).

### Task 3: Relatório custo-por-projeto (RN-05)

**Files:** Modify `server/services/almoxarifado/reportService.js`,
`server/services/almoxarifado/reportRegistry.js`, `server/routes/almoxarifado/extended.js`
(fn no mapa), `server/services/almoxarifado/movementTypes.js` (**TIPOS_DEVOLUCAO novo — I3:
['ENTRADA_DEVOLUCAO','DEVOLUCAO']; DEVOLUCAO_CLIENTE é SAÍDA e NÃO entra**),
`server/services/almoxarifado/returnService.js` (**herança de projeto_id/os_id da saída
citada quando o chamador não informa — I2, molde da herança de lote em :80; sem isso
`devolvido` é estruturalmente zero em produção, medido**).
**Test:** `server/tests/api/relatorioCustoProjeto.api.test.js` (novo). Regressão
obrigatória: devolucao*/requisicaoDevolucao* (a herança só preenche colunas antes nulas).

- [x] Step 1/2: teste + implementação (8bc58ec) — `relatorioCustoProjeto` em reportService.js
  le o livro por fontes UNICAS (`custoUnitarioSql`, `TIPOS_SAIDA`/`TIPOS_DEVOLUCAO` novo em
  movementTypes.js). `TIPOS_DEVOLUCAO = ['ENTRADA_DEVOLUCAO','DEVOLUCAO']` — DEVOLUCAO_CLIENTE
  fica fora (e SAIDA, ja em TIPOS_SAIDA, soma em `consumido` nao em `devolvido`). Registro novo
  `custo-por-projeto` em reportRegistry.js (gate `gerenciar_reposicao`, D6, nasce fechado) + fn
  ligada em extended.js. `liquido` e recalculado por SQL repetindo as expressoes de
  consumido/devolvido (SQL nao deixa referenciar alias de outra coluna na mesma SELECT) — sem
  isso a varredura de relatoriosRegistro.api.test.js acusaria `liquido` como coluna inexistente
  no SQL real. 7 testes em relatorioCustoProjeto.api.test.js: (1) DOIS projetos, fixture de
  custo por VIAS DIFERENTES (M1 custo_medio=8/custo_unitario=99 → vale 8; M2
  custo_medio=0/custo_unitario=5 → vale 5), devolucao PELA ROTA REAL (payload identico ao de
  DevolucoesAlmoxarifado.js:160-170, sem origem_projeto_id/origem_os_id) reduz o liquido do
  projeto certo, movimentacao sem projeto/de cliente/cancelada nao vazam, outro projeto isolado;
  (2) DEVOLUCAO legado soma devolvido, DEVOLUCAO_CLIENTE soma consumido e NAO devolvido; (3)
  projeto nao cadastrado → `Projeto #<id>`; (4) data_inicio corta (a linha do projeto some por
  inteiro quando a unica movimentacao fica de fora); (5) gate ALMOXARIFE 403/COMPRAS 200/GESTOR
  200; (6) export com cabecalho deepStrictEqual; (7) nota com o texto ATUAL/retroativo/
  DEVOLUCAO_CLIENTE e gate fechado por padrao.
  **Achado real da task (I2, confirmado por execucao):** a devolucao NUNCA gravava projeto_id em
  producao — o payload da tela nao envia origem_projeto_id/origem_os_id — entao `devolvido`
  seria estruturalmente zero sem correcao. `returnService.registrarDevolucao` passa a HERDAR
  projeto_id/os_id da saida CITADA quando o chamador nao informa (mesmo molde da heranca de lote
  ja existente ali, returnService.js:80); devolucao avulsa (sem saida citada) continua sem
  projeto, declarado. Provado pela ROTA REAL (POST /devolucoes), nao por fixture SQL.
- [x] Step 3: verde + regressao — suite completa 121→122 arquivos, todos verdes;
  test:almoxarifado 42/42, test:validation 4/4, test:safealter 3/3, test:sqlite 3/3. Regressao
  de devolucao rodada a parte (devolucaoDestinos, devolucaoVinculo, materialClienteDevolucao,
  sucataDedicada, sucateamentoRotas, notificacaoDividas, bloqueioGuardas,
  loteControleObrigatorio, materialClienteIlhaAposentada, materialClientePosicao) — nenhuma
  cita origem_projeto_id/origem_os_id nem seta projeto_id/os_id na saida testada, entao a
  heranca nova nao move nenhum assert existente. Regressao adicional achada e corrigida: a nova
  entrada gated no registro (3o gate, alem de inventario-divergencias/solicitacoes-compra)
  quebrava contagens hardcoded em relatoriosRegistro.api.test.js (18→19 chaves) e
  relatoriosJornada.api.test.js (PRODUCAO via `RELATORIOS.length - 2`, agora `- 3`) — as duas
  atualizadas.
- [x] Step 4: controles positivos (8bc58ec, todos sabotados e revertidos manualmente — nunca
  `git checkout` —, md5 identico antes/depois de cada um) — (i) tirar
  `mv.projeto_id IS NOT NULL` do WHERE → movimentacao sem projeto vaza, teste (1) cai; (ii)
  trocar a subtracao por soma no `liquido` → cai em dois projetos diferentes (teste 1 e 2: 42
  em vez de 26 e de 18); (iii) tirar o filtro de `m.proprietario_cliente_id IS NULL` → material
  de cliente vaza (1000034 em vez de 34), teste (1) cai; (iv) remover a heranca de
  projeto_id/os_id do returnService (`origemProjetoFinal = origem_projeto_id || null`, sem
  fallback para `saidaOriginal`) → `devolvido` cai de 8 para 0 na devolucao pela rota real,
  teste (1) cai (prova que a heranca do Step 1/2 e load-bearing, nao decorativa).
- [x] Step 5: commit unico 8bc58ec (server/services/almoxarifado/movementTypes.js,
  reportRegistry.js, reportService.js, returnService.js;
  server/routes/almoxarifado/extended.js; server/tests/api/relatorioCustoProjeto.api.test.js
  novo; relatoriosJornada.api.test.js e relatoriosRegistro.api.test.js corrigidos).

### Task 4: Tela (RN-06) — galho, worktree, SÓ após Tasks 1-2

Modify `client/src/components/almoxarifado/ReposicaoAlmoxarifado.js` (+ teste): botão
Cancelar na aba Solicitações (gate, confirm literal do design + justificativa obrigatória —
sem justificativa nem chama a API), badges de estado, painel Contexto do material na aba
Sugestões (RN-04; painel de erro localizado; números por célula com fixtures distintas).
Mínimo 8 testes; sabotagens: POST de cancelar sem justificativa passa → cai; painel de
contexto com URL errada → cai. Client inteiro + build + test:api NA worktree.

- [x] Feito (worktree `.claude/worktrees/agent-a4474bfc544b3da0b`, branch
  `worktree-agent-a4474bfc544b3da0b`, resetada para 58d45cf antes de começar — o HEAD da
  worktree estava em outro trabalho não relacionado). Botão **Cancelar** por linha na aba
  Solicitações: `window.confirm` com o literal congelado do design, depois
  `window.prompt` para a justificativa (vazia ou só espaço não chama a API — pré-checagem
  local do mesmo contrato que o servidor recusaria, sem viagem de rede); sucesso recarrega a
  lista (`reloadSolic`); erros do servidor (400 terminal, 404 inexistente) aparecem em toast
  com o literal exato; gate `gerenciar_reposicao` via `bloquearSeNaoPode`; botão fica
  "Cancelando..." e desabilitado durante o POST (defesa contra duplo clique). Badges
  PENDENTE/VINCULADO já existiam prontas da Etapa 11 (o relatório `solicitacoes-compra`
  só lista o pipeline aberto — RECEBIDA/CANCELADA somem sozinhas, nenhuma listagem nova
  necessária). Painel expansível **Contexto do material** na aba Sugestões: botão "Ver
  contexto"/"Ocultar contexto" por linha, UM painel aberto por vez, cache por
  `material_id`; células disponível/reservado/em terceiros/consumo médio (com a janela na
  legenda)/último custo (valor+data ou '—')/solicitações abertas/proprietário do cliente
  quando presente; erro → painel localizado reaproveitando `PainelErroCarga` com retry,
  nunca silêncio.
  **Desvio registrado:** no início da task a worktree estava em `5dadd59` (branch de outro
  agente, não descendente de `58d45cf`) — resetada com `git reset --hard 58d45cf` conforme
  a instrução da task, e `node_modules` (raiz/client/server) recriados como symlink para a
  árvore principal por estarem ausentes na worktree.
  **Contrato do galho confirmado:** o endpoint `GET /compras/contexto-material/:id`
  continuava inexistente no servidor no momento desta task (Task 2 do tronco ainda não
  aterrissada) — os testes mockam a fronteira HTTP com o shape RN-04 congelado; nenhum
  ajuste de shape foi necessário na tela em si, só o realinhamento pendente é confirmar
  contra o endpoint real quando a Task 2 aterrissar.
  12 testes novos (36 no arquivo, mínimo pedido era 8): badges de estado, cancelar
  (sucesso+recarrega, confirm recusado, justificativa vazia, justificativa nula, erro 400,
  erro 404, gate, duplo clique desabilitado), contexto (URL exata + células exatas com
  toggle, último custo null + proprietário do cliente, erro com retry). As três sabotagens
  mínimas pedidas foram executadas manualmente (edição reversa, nunca `git checkout`, com
  md5 antes/durante/depois): justificativa vazia sem o guard → cai (teste de justificativa
  vazia vermelho); URL do contexto errada → cai (as 3 assertivas de contexto vermelhas,
  inclusive a de URL exata); literal do confirm alterado → cai (teste de "confirma com o
  literal" vermelho). Client 483/483 (33 suítes, era 471/471 — os 12 testes a mais batem
  com os 12 adicionados líquidos, a suíte da tela foi de 24 para 36); build limpo
  (`CI=true`); `test:api` do servidor 120/120 (nenhuma rota tocada por esta task).
- [x] Fix-round (revisão adversarial devolveu Needs-fix-round: shape correto contra o
  servidor real, mas 1 bug vivo + 3 mutações de uma linha sobreviviam 36/36). **Bug vivo
  corrigido:** o cache `contextoPorMaterial` nunca invalidava — depois de "Gerar
  solicitações" ou do botão "Atualizar" (os dois incrementam `reloadSugestoes`), reabrir o
  painel de um material já visto mostrava números de ANTES da ação que acabou de mudá-los
  (disponível, solicitações abertas). Fix: `useEffect` novo com dep `[reloadSugestoes]`
  zera o cache inteiro e, se havia um painel aberto no momento, refaz a chamada dele na
  hora (painel continua aberto, só os números mudam); `contextoAbertoId` é lido do closure
  do próprio render que disparou o efeito, dispensando `ref`. **3 mutações agora cobertas:**
  (1) tirar o `+Z` de `formatData` — as fixtures anteriores só usavam horário seguro
  (≥09:00 UTC); fixture nova com `02:18:00 UTC` (madrugada, vira dia anterior em
  America/Sao_Paulo, timezone da máquina de teste) morde. (2) `Object.values(cache)[0]` no
  lugar de `cache[material_id]` — com cache de UMA entrada os dois são a mesma coisa por
  acidente; teste novo abre o material 10, fecha, abre o 20 (cache com DUAS entradas) e
  prova que o painel mostra o material certo, cobrindo também o cache-hit declarado
  (reabrir sem nova chamada). (3) asserts de `solicitacoes_abertas` trocados de substring
  (`toContain`) para exato por `<li>` (quantidade e data). Comentário de uma linha
  acrescentado no painel explicando que `d.material` do contrato é deliberadamente não lido
  (a linha da tabela já mostra código/nome). 3 testes novos (39 no arquivo). As 3 mutações
  do revisor reproduzidas manualmente (edição reversa, nunca `git checkout`, md5
  antes/durante/depois) caem cada uma no teste certo e nenhuma outra; revertidas com o md5
  original confirmado. Client 486/486 (era 483/483); build limpo; `test:api` não roda de
  novo nesta rodada (nenhuma rota tocada, já confirmado 120/120 na entrega anterior).

### Task 5: Jornada (galho, principal — SÓ após 1-3)

`server/tests/api/integracaoComprasJornada.api.test.js`: sugestão → gerar solicitações (rota
real) → vincular a pedido real → material SOME da sugestão → receber via workflow real até
processar → solicitação RECEBIDA → material com falta VOLTA à sugestão → cancelar outra
solicitação → volta também → relatório custo-por-projeto reflete as saídas da jornada →
contexto-material mostra o último custo da entrada da NF. Sabotagem: gancho do recebimento
neutralizado → elo da RECEBIDA cai. Suíte completa (122/122).

- [x] Feita (`806b7bd`) — jornada 1/1 contínua, com uma **divergência deliberada do previsto**:
  a compra é **PARCIAL** (pedido entrega 5 de 20) para provar de uma vez a aproximação D2 — a
  solicitação fecha RECEBIDA na primeira nota e o material **volta à sugestão pela falta
  residual**; o custo lido no relatório é o `custo_medio` que a PRÓPRIA NF da jornada gravou
  (nada semeado à mão). Suíte 123/123 (não 122 — a Task 3 já tinha somado um arquivo a mais
  que o previsto). Sabotagem do gancho: só o elo da RECEBIDA + a unidade da T1 caíram
  (121/123, cirúrgico). RULING registrado no ledger: test-only sem revisor dedicado
  (precedente E12/E13); a revisão final da Fase 5 recebeu a ênfase.

### Task 6: Fechar a etapa
- [x] Feita (2026-08-25) — `fechar-etapa` completa: novidades (seção da etapa + visão geral
  atualizada até a 14, que estava parada na 11; B14 marcada RESOLVIDA; B21-B24 novas com o
  descartado — B21 é o destaque D9; C15-C17; letra D com os bloqueados medidos; F9; bloco G
  da etapa com o ticket do initSchema); spec 22 reescrita com hash por item, bloqueados
  dizendo a medição e a correção declarada do "atualizado a cada saída" → computado do livro;
  mapa de specs (linha da 22 → 🟡, header com pausa, critério de aceite "custo por projeto"
  → [~]); guia (header com a pausa + roteiro da Etapa 14); manual do sistema (seções de
  reposição e relatórios); retro de 4 números abaixo. Verificação medida em 2026-08-25:
  `test:api` 123/123, `test:almoxarifado` 42/0, `test:validation` 4/0, `test:safealter` 3/0,
  `test:sqlite` 3/0, client 487/487 (33 suítes), build `CI=true` limpo.

## Retro da etapa (4 números, medidos)

1. **Rodadas de correção até verde:** 5 fix-rounds no total (1 por task revisada — T1
   `7afa90e`, T2 `14feaf8`, T3 `6e8c36c`, T4 `fac3f11` — + 1 da revisão final `2de7944`).
   Nenhum teste falhou 3 rodadas seguidas; nenhuma task precisou de segunda rodada.
2. **Achados de revisão — reais vs. ruído:** Fase 2: 5 Critical + 6 Important, **0 ruído**
   (destaque: RN-04 era inimplementável como escrita — o livro não tem custo — e o gate real
   era outro). Revisões de task: todos os achados reproduzidos antes de corrigir (o pior: o
   cache do contexto que nunca invalidava, bug vivo na T4). Fase 5: 2 lentes, ambas
   Needs-fix-round leve, **0 ruído**, e as duas **convergiram independentes** no mesmo buraco
   (CANCELADA-não-ressuscita sem teste) — sinal de achado real.
3. **Paralelismo:** 1 galho real em worktree (T4, front) em paralelo com o tronco T2/T3 — sem
   retrabalho de merge (shape do mock conferido campo a campo contra o servidor no fechamento
   da T2). A jornada (T5) rodou na árvore principal por ser test-only. O tronco 1-2-3 foi
   sequencial de propósito (os três tocam `extended.js`).
4. **Defeito que escapou do fechamento anterior (E13), descoberto nesta etapa:** o título de
   um teste da E13 mentia o cenário (M-3 da revisão da T3, corrigido dizendo) e os counts de
   registro 18→19/-2→-3 precisaram de emenda — ambos custo baixo. Desta etapa, preencher na
   próxima: nada descoberto até o fechamento.
   **Incidentes de harness (para a média histórica):** 0 âncoras de sed não-únicas nesta
   etapa (a disciplina do `grep -cF == 1` antes de aplicar segurou), md5 limpo em todas as
   sabotagens; 1 intermitência de teardown observada uma vez (120/121) e não reproduzida em
   8 execuções — virou o ticket do initSchema (letra E do ledger / bloco G das novidades).

## Próxima tarefa detalhada — Etapa 15 (Mobilidade) ⏸️ NÃO INICIADA

**O desenvolvimento foi PAUSADO aqui por instrução explícita do usuário (2026-08-25, "termina
essa e pode dar uma parada").** Nada da Etapa 15 foi começado; este bloco é o handoff para a
sessão que retomar.

- **Escopo da spec:** Fase 4 do planejamento mestre — código de barras, coletores, app móvel,
  assinatura digital (`specs/modulo-almoxarifado/README.md`, seção "Etapa 15").
- **Fase 0 obrigatória (lição das etapas 13/14 — medir antes de prometer):** o QR das
  etiquetas (6c) já aponta para telas do sistema; medir o que "mobilidade" significa aqui de
  verdade (a tela responsiva já resolve? existe coletor físico no galpão? qual hardware?)
  antes de desenhar. Não há NENHUMA infraestrutura de app móvel no repo — provável que a
  etapa vire "fluxos de balcão otimizados para celular + leitura de QR pela câmera" em vez de
  app nativo. Validar com o usuário ANTES de abrir o design (não é decisão reversível de
  madrugada: é escopo).
- **O que está pronto e a 15 não reabre:** etiquetas QR (6c) com URLs que abrem a tela certa
  filtrada; autorização em duas camadas estável; `reportRegistry` para qualquer relatório
  novo; fila de notificações (12) para qualquer aviso novo; fontes únicas
  (`disponivelSql`/`custoUnitarioSql`/`consumoSql`/`movementTypes` com
  TIPOS_SAIDA/TIPOS_ENTRADA/TIPOS_DEVOLUCAO).
- **Tickets abertos que a próxima sessão herda (letra E do ledger da E14):** initSchema de
  `extended.js` sem await (corrida pré-existente, ruído raro de teardown nos testes);
  estado parcial só-por-API da devolução-sucata; meia-sucata estornada inflando o consumido
  do custo-por-projeto (declarado no rodapé do relatório).
- **Decisões B em aberto esperando o usuário:** B5, B6, B8, B9, B11, B12, B13, B15-B17,
  B18-B20, **B21-B24** (as da E14 — B21 é abertura de gate já em vigor).

## Self-review do plano (feito na escrita)

- Tronco 1-3 sequencial de propósito: os três tocam `extended.js` (conflito textual, não de
  regra) — galhos só onde o arquivo é outro (tela) ou test-only (jornada).
- A RECEBIDA por pedido (não por item/quantidade) é a maior aproximação do plano — declarada
  em D2/letra E; a Fase 2 deve atacá-la (recebimento PARCIAL do pedido fecha a solicitação?
  medir o que o workflow permite).
- O harness precisa de `pedidos_compra` reais — os testes de recebimento existentes já criam?
  A Fase 2 confirma o molde exato (grep) antes de os implementadores tropeçarem nisso.
