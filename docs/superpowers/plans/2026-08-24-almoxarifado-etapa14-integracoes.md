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

- [ ] Step 1: teste vermelho — cenário pelo motor real com DOIS projetos (stub `projetos`):
  fixture de custo por VIAS DIFERENTES (Fase 2, I4 — duas saídas do MESMO material têm sempre
  o mesmo custo e não provam nada): M1 custo_medio=8/custo_unitario=99 → vale 8; M2
  custo_medio=0/custo_unitario=5 → vale 5, asserts exatos; devolução reduzindo o líquido PELA
  ROTA REAL com o payload do cliente (I2 — fixture SQL fingiria que funciona); tipos via
  TIPOS_DEVOLUCAO novo; movimentação SEM projeto fora, CLIENTE fora, CANCELADA fora, outro
  projeto não vaza; data_inicio corta; projeto não cadastrado → `Projeto #<id>`; gate 403 par
  +/-; export com cabeçalho deepStrictEqual; a varredura do registro (E13) passa; a NOTA usa
  o texto pronto da Fase 2 (custo ATUAL retroativo — período fechado muda com NF nova).
- [ ] Step 2-5: implementação, verde, controles ((i) incluir sem-projeto → cai; (ii) régua de
  devolução errada (não reduz) → cai; (iii) cliente incluído → cai), suíte (121→122), commit.

### Task 4: Tela (RN-06) — galho, worktree, SÓ após Tasks 1-2

Modify `client/src/components/almoxarifado/ReposicaoAlmoxarifado.js` (+ teste): botão
Cancelar na aba Solicitações (gate, confirm literal do design + justificativa obrigatória —
sem justificativa nem chama a API), badges de estado, painel Contexto do material na aba
Sugestões (RN-04; painel de erro localizado; números por célula com fixtures distintas).
Mínimo 8 testes; sabotagens: POST de cancelar sem justificativa passa → cai; painel de
contexto com URL errada → cai. Client inteiro + build + test:api NA worktree.

### Task 5: Jornada (galho, principal — SÓ após 1-3)

`server/tests/api/integracaoComprasJornada.api.test.js`: sugestão → gerar solicitações (rota
real) → vincular a pedido real → material SOME da sugestão → receber via workflow real até
processar → solicitação RECEBIDA → material com falta VOLTA à sugestão → cancelar outra
solicitação → volta também → relatório custo-por-projeto reflete as saídas da jornada →
contexto-material mostra o último custo da entrada da NF. Sabotagem: gancho do recebimento
neutralizado → elo da RECEBIDA cai. Suíte completa (122/122).

### Task 6: Fechar a etapa
- [ ] `fechar-etapa` completa; spec 22 marcada item a item com os BLOQUEADOS dizendo a
  medição (BOM inexistente; MES sem uso); B14 marcada RESOLVIDA nas novidades; letra B nova
  (gate do custo-por-projeto nasce fechado; cancelar VINCULADO não mexe no pedido do core);
  retro de 4 números.

## Self-review do plano (feito na escrita)

- Tronco 1-3 sequencial de propósito: os três tocam `extended.js` (conflito textual, não de
  regra) — galhos só onde o arquivo é outro (tela) ou test-only (jornada).
- A RECEBIDA por pedido (não por item/quantidade) é a maior aproximação do plano — declarada
  em D2/letra E; a Fase 2 deve atacá-la (recebimento PARCIAL do pedido fecha a solicitação?
  medir o que o workflow permite).
- O harness precisa de `pedidos_compra` reais — os testes de recebimento existentes já criam?
  A Fase 2 confirma o molde exato (grep) antes de os implementadores tropeçarem nisso.
