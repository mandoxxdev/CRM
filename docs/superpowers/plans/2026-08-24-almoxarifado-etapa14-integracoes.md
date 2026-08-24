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

- Literais congelados (RN-02/04): 400 `Justificativa obrigatória para cancelar a solicitação`;
  404 `Solicitação não encontrada`; 400
  `Solicitação já finalizada (RECEBIDA ou CANCELADA) — não pode ser cancelada`; 404
  `Material não encontrado`. Confirmar na Fase 2 os literais REAIS de vincular (a guarda de
  terminal nova em `vincularPedidoCompra` precisa de literal próprio, congelar na revisão).
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

- [ ] Step 1: teste vermelho — (1) cancelar PENDENTE: 200, status CANCELADA, colunas
  preenchidas, auditoria com objeto; sem motivo → 400 literal; id inexistente → 404 literal;
  (2) cancelar VINCULADO: 200 (o vínculo é informativo — o pedido do core NÃO muda,
  declarado); (3) cancelar CANCELADA/RECEBIDA → 400 literal; vincular em terminal → 400 (o
  literal nasce aqui — congelar no teste); (4) gates par positivo+negativo (ALMOXARIFE 403,
  COMPRAS 200 — `gerenciar_reposicao` tem COMPRAS); (5) RECEBIDA automática: criar
  solicitação → vincular a um pedido de compra REAL (INSERT em `pedidos_compra` no harness,
  molde dos testes de recebimento existentes — descobrir com grep `pedidos_compra`
  tests/api/) → criar recebimento com `pedido_compra_id` → conduzir o workflow REAL até
  `processarNota` (usar o caminho dos testes de recebimento existentes) → solicitação
  RECEBIDA com `recebida_em`, auditada; solicitação PENDENTE (não vinculada) do MESMO
  material NÃO fecha; (6) gancho não derruba: monkeypatch de `fecharSolicitacoesDoPedido`
  lançando → `processarNota` ainda conclui PROCESSADO (padrão do teste RN-01 da E12);
  (7) posição: após RECEBIDA, o material com falta volta à sugestão (chamar
  `calcularSugestoes` e ver o material) — o mesmo após CANCELADA.
- [ ] Step 2: implementação.
- [ ] Step 3: verde + regressão (reposicao*, recebimento*, comprasMinimos) + suíte (119→120).
- [ ] Step 4: controles positivos — (i) gancho movido para ANTES do PROCESSADO (falha de
  processamento fecharia solicitação) → teste 5/6 cai; (ii) WHERE do fechar sem
  `status='VINCULADO'` (fecharia PENDENTE alheia) → teste 5 cai; (iii) try/catch do gancho
  removido → teste 6 cai; (iv) guarda de terminal do cancelar removida → teste 3 cai.
- [ ] Step 5: suíte + commit.

### Task 2: Contexto do comprador (RN-04)

**Files:** Modify `server/services/almoxarifado/purchaseService.js` (`contextoMaterial`),
`server/routes/almoxarifado/extended.js` (rota). **Test:**
`server/tests/api/compraContextoMaterial.api.test.js` (novo).

- [ ] Step 1: teste vermelho — shape completo com números EXATOS pelo motor real (entradas
  com custo distinto do cadastro → `ultimo_custo_entrada` é o do LIVRO, não o `custo_medio`
  nem o `custo_unitario` do cadastro — fixture de custo duplo); consumo pela janela da config
  (mudar a config muda `janela_dias` e o consumo); solicitações abertas SÓ
  PENDENTE/VINCULADO (uma CANCELADA na fixture fica fora); entrada CANCELADA não é o último
  custo; material de cliente responde normalmente? — DECIDIR: contexto de material de
  cliente é 404 ou dados? (comprador não compra material de cliente → material com dono
  responde 404 `Material não encontrado`? NÃO — o material existe; decidir 200 com os dados
  e SEM sugestão implícita; registrar). Gates par positivo+negativo; 404 literal.
- [ ] Step 2-5: implementação, verde+regressão, controles ((i) último custo lendo
  `custo_medio` → fixture cai; (ii) solicitações incluindo terminais → cai), suíte (120→121),
  commit.

### Task 3: Relatório custo-por-projeto (RN-05)

**Files:** Modify `server/services/almoxarifado/reportService.js`,
`server/services/almoxarifado/reportRegistry.js`, `server/routes/almoxarifado/extended.js`
(fn no mapa). **Test:** `server/tests/api/relatorioCustoProjeto.api.test.js` (novo).

- [ ] Step 1: teste vermelho — cenário pelo motor real com DOIS projetos (INSERT em
  `projetos` do core — stub no harness, molde clientePosicaoTipos): saídas com projeto_id e
  custos distintos (fixture de custo duplo), devolução reduzindo o líquido, movimentação SEM
  projeto fora, material de CLIENTE fora, movimentação CANCELADA fora, saída de OUTRO
  projeto não vaza (asserts exatos por projeto); filtro data_inicio corta; projeto não
  cadastrado → rótulo `Projeto #<id>`; gate 403 par +/-; export XLSX com cabeçalho por
  deepStrictEqual; a varredura do registro (E13) passa com a entrada nova.
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
