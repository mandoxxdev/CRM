# Etapa 14 — Integrações (feature 22, a fatia REAL) — Design

> Fase 0 MEDIDA em 2026-08-24 (a spec 22 manda medir maturidade antes de planejar):
> **Compras: MADURO para integrar** — `pedidos_compra`/`itens_pedido_compra` reais no core;
> `receiptService.resolverPedidoCompra` já liga recebimento→pedido; `processarNota` marca
> `PROCESSADO` (o ponto de gancho); `purchaseService.vincularPedidoCompra` (E11) liga
> solicitação→pedido; e o comentário da posição da E11 JÁ dizia "o fix definitivo (status
> terminal no recebimento)" — esta etapa é esse fix. **Produção: schema MES real**
> (`producao_ops`, etapas, apontamentos, roteiros em `services/producao/`) **mas sem ponte e
> sem uso** (spec: 0 registros). **BOM/Engenharia: não existe em nenhum módulo** (medido).
> **Projetos: tabela core existe, 0 registros em produção; colunas de vínculo
> (`projeto_id`/`os_id`/`centro_custo_id`) já gravadas pelo livro desde a Etapa 3.**

## Problema

A solicitação de compra da E11 nasce e NUNCA morre (só `PENDENTE`→`VINCULADO`; fechar não
existe — o horizonte de 60 dias é a única "saída", e é aproximação; cancelar não existe — B14
aberta). O comprador não vê o contexto do almoxarifado ao comprar. O custo por projeto está
todo no livro e ninguém o soma. BOM/OP não têm o que integrar ainda.

## Decisões

- **D1 — Escopo honesto: só o que tem a outra ponta VIVA.** Entra: ciclo de vida da
  solicitação (RECEBIDA automática + CANCELADA manual — fecha B14), contexto do comprador,
  custo por projeto (leitura do livro). **BLOQUEADO e declarado** (letra D + spec 22 por
  item): BOM (entidade não existe), OP→reserva/kit/consumo (MES sem uso e sem pedido de
  negócio), centro de custo como entidade. Nada disso vira stub.
- **D2 — RECEBIDA é automática e vem do recebimento PROCESSADO.** Gancho no fim de
  `processarNota` (após `status='PROCESSADO'`): toda solicitação `VINCULADO` ao
  `pedido_compra_id` daquele recebimento vira `RECEBIDA` (`recebida_em`, auditada). Sem
  conferência de quantidade item a item — o pedido pode agrupar N solicitações e o
  recebimento é da NF; a régua é "o pedido chegou" (aproximação declarada, letra E). Falha do
  gancho NUNCA derruba o processamento (try/catch, padrão RN-01 da E12).
- **D3 — CANCELADA é manual, gateada e auditada.** `gerenciar_reposicao` (a MESMA ação de quem
  gera — quem pode criar pode desfazer; descartado criar ação nova). Exige justificativa.
  Permitida em `PENDENTE` e `VINCULADO` (o vínculo é informativo; cancelar não mexe no pedido
  do core — declarado). Terminais recusam.
- **D4 — A posição da reposição NÃO muda de código.** A query da E11 já conta
  `status IN ('PENDENTE','VINCULADO')` — os terminais saem da posição automaticamente, e o
  material volta a ser sugerido se ainda faltar. O horizonte de 60 dias CONTINUA como rede de
  segurança para pedido que nunca chega (não é removido).
- **D5 — Contexto do comprador como ENDPOINT + painel na tela que já existe.** A "tela de
  compra" real vive no core (monólito) — não mexer lá. O contexto entra onde quem decide
  compra já trabalha: a tela de Reposição (aba Sugestões/Solicitações) ganha painel por
  material. Gate `gerenciar_reposicao` (dado de pipeline de compra — mesmo racional da E11).
- **D6 — Custo por projeto é RELATÓRIO no registro, gateado.** `custo-por-projeto` computa do
  LIVRO (nada materializado — sempre atual; "saída atualiza custo" e "devolução reduz" da
  spec são satisfeitos por construção). Gate `gerenciar_reposicao` — NASCE fechado
  (reversível em uma linha; contraste deliberado com o histórico de abrir-por-default — a
  lição B18 da E13 foi "abrir expõe mais do que parece"; letra B).
- **D7 — Sem e-mail novo.** Solicitação RECEBIDA/CANCELADA aparece no painel e na auditoria;
  e-mail seria ruído (quem gerencia já recebe o resumo de geração da E12). Corte declarado.
- **D9 (EMENDA DA FASE 2, C2 — medido com a rota real): uniformizar o gate do pipeline de
  compra.** `/compras/solicitacoes/:id/vincular-pedido` e `/compras/verificar-minimos` estão
  em `requirePermission('configurar')` (SÓ ADMINISTRADOR) — COMPRAS gera a solicitação
  (gerenciar_reposicao) e NÃO consegue vinculá-la ao pedido, o passo seguinte do próprio
  comprador (herança da E11). A Etapa 14 muda os DOIS para `gerenciar_reposicao` — é ABERTURA
  de gate (GESTOR e COMPRAS passam a poder), letra B obrigatória. Descartado: manter e testar
  só com ADMIN (perpetua a inconsistência); descartado: fechar tudo em `configurar`
  (quebraria a tela de Reposição para COMPRAS).
- **D8 — Fontes únicas obrigatórias**: `disponivelSql` (disponível), `consumoSql`
  (consumo médio), `custoUnitarioSql`/`valorEstoqueSql` (custo — e a varredura NÃO protege
  sozinha, lição E13: fixture numérica obrigatória), `TIPOS_SAIDA`/tipos de devolução via
  `movementTypes`.

## Regras de negócio

### RN-01 — Ciclo de vida da solicitação
Estados: `PENDENTE` → `VINCULADO` (E11, inalterado) → `RECEBIDA` (automática, D2) |
`CANCELADA` (manual, D3, de PENDENTE ou VINCULADO). Terminais são FINAIS: vincular, cancelar
ou receber uma solicitação terminal → 400. Colunas novas via safeAlter:
`recebida_em DATETIME`, `cancelada_em DATETIME`, `cancelada_por TEXT`,
`cancelamento_motivo TEXT`.

### RN-01b — Vincular valida as duas pontas (EMENDA DA FASE 2, C3 — medido: hoje solicitação
inexistente E pedido inexistente respondem 200, gravando pedido fantasma que o gancho da
RN-03 NUNCA fechará)
`vincularPedidoCompra` passa a validar, na ordem: (1) solicitação inexistente → 404
`Solicitação não encontrada` (MESMO literal da RN-02 — um literal só); (2) terminal → 400
(literal congelado na Task 1, família do da RN-02); (3) pedido inexistente em
`pedidos_compra` → 400 `Pedido de compra não encontrado` (literal REUSADO de
receiptService.criarRecebimento:76 — não inventar outro). **Declarado (revisão da Task 1,
N-3):** re-vincular uma solicitação VINCULADO a OUTRO pedido responde 200 e SOBRESCREVE o
vínculo (herança da E11, coerente com RN-01b que só proíbe terminais) — consequência: a
chegada do pedido antigo deixa de fechá-la; o novo fecha. Intencional; mudar é decisão de
negócio.

### RN-02 — Cancelamento manual
`POST /api/almoxarifado/compras/solicitacoes/:id/cancelar` (gate `gerenciar_reposicao`).
Payload `{ motivo }` obrigatório → sem motivo: 400
`Justificativa obrigatória para cancelar a solicitação`. Id inexistente: 404
`Solicitação não encontrada`. Terminal: 400
`Solicitação já finalizada (RECEBIDA ou CANCELADA) — não pode ser cancelada`.
Sucesso: 200 `{ success: true, status: 'CANCELADA' }`, audita
(`entidade 'solicitacao_compra'`, ação `CANCELAMENTO`, `dados_novos` objeto com motivo).
Efeito imediato na posição: o material volta à sugestão se ainda faltar (D4).

### RN-03 — Recebimento fecha as solicitações do pedido
**EMENDA DA FASE 2 (C4, medido):** o fechamento é acionado nos **DOIS** pontos em que um
recebimento chega a CONCLUIDO com estoque dado: no fim de `processarNota` (após
`status='PROCESSADO'`) **E** no fim de `aprovarRecebimento` no ramo que grava
`status='APROVADO'` direto (receiptService:672 — `POST /recebimentos/:id/aprovar` dá entrada
no estoque de recebimento de PEDIDO_COMPRA sem tocar em processarNota, medido). Um só helper
`fecharSolicitacoesDoPedido(db, user, pedidoCompraId)` chamado nos dois lugares, cada chamada
com o seu try/catch; o ramo de aprovar que DELEGA para processarNota NÃO chama de novo (o
gancho já rodou lá — I6). `UPDATE ... SET status='RECEBIDA', recebida_em=CURRENT_TIMESTAMP
WHERE pedido_compra_id = ? AND status = 'VINCULADO'` + UMA auditoria por solicitação
efetivamente fechada (a auditoria fica DENTRO do laço das linhas fechadas — o
`AND status='VINCULADO'` É o dedupe do segundo recebimento, I1). Recebimento SEM pedido:
no-op. PENDENTE nunca vinculada não fecha (letra E). **Aproximação DECLARADA (I1, medida):**
um pedido pode ter N recebimentos parciais (o workflow não guarda "pedido já recebido" — dois
recebimentos do mesmo pedido processam os dois e creditam estoque duas vezes); **o PRIMEIRO
recebimento concluído fecha todas as solicitações VINCULADO do pedido**, mesmo parcial.
Fechamento por quantidade é etapa nova. Falha do gancho não derruba nada (try/catch + warn).

### RN-04 — Contexto do comprador
`GET /api/almoxarifado/compras/contexto-material/:id` (gate `gerenciar_reposicao`) → 200
`{ material: { id, codigo, nome, unidade }, disponivel, reservado, em_terceiros,
consumo_medio_diario, janela_dias, ultimo_custo_entrada: { valor, data } | null,
solicitacoes_abertas: [{ id, status, quantidade, pedido_compra_id, created_at }] }`.
Réguas: disponível/reservado/em_terceiros das colunas+`disponivelSql`; consumo pela
`consumoSql` com a janela da config (mesma da Reposição); `ultimo_custo_entrada` — **EMENDA DA FASE 2 (C1): a régua original ("custo gravado no livro")
era INIMPLEMENTÁVEL — `movimentacoes_almoxarifado` NÃO TEM coluna de custo (medido; o próprio
receiptService.js:515 e schema.js:1324 dizem).** A régua real é o par (movimentação de entrada
não-cancelada × item de recebimento):
`SELECT ri.valor_unitario AS valor, mv.created_at AS data FROM movimentacoes_almoxarifado mv
JOIN recebimentos_material_itens_almoxarifado ri ON ri.recebimento_id = mv.recebimento_id AND
ri.material_id = mv.material_id WHERE mv.material_id = ? AND mv.cancelado = 0 AND mv.tipo IN
(<TIPOS_ENTRADA>) AND ri.valor_unitario > 0 ORDER BY mv.created_at DESC, mv.id DESC LIMIT 1`.
O `mv.id DESC` no desempate é OBRIGATÓRIO (created_at tem resolução de segundo — duas entradas
do mesmo teste caem no mesmo segundo, medido; sem ele o teste é intermitente). NUNCA usar
`materiais.custo_unitario` (é o último custo de compra mas não tem data e NÃO reverte no
cancelamento — medido). **Declarado (letra E):** entrada MANUAL com custo digitado fora de
recebimento não aparece (não deixa item de recebimento) — o comprador quer o preço da última
NF; `null` quando não há nenhuma. **Emenda I5 (decisão da Fase 2):** material com
`proprietario_cliente_id` responde **200 com os dados** (404 mentiria) — o payload ganha
`proprietario_cliente: { id, razao_social } | null`, e quando não-nulo `solicitacoes_abertas`
vem `[]` — **a versão desta frase dizia "por construção"; ESTAVA ERRADA (revisão da Task 2,
A2, medido): `verificarEstoqueMinimo` só ganhou o filtro de cliente na Etapa 8, banco antigo
pode ter PENDENTE legada viva de material de cliente, e nada as fecha; o `[]` é garantido por
FILTRO explícito no serviço, com teste que insere a linha legada e prova que não vaza.**
**Emendas A1/A3 (medidas):** o desempate do último custo ganha `ri.id DESC` (duas linhas do
MESMO material no recebimento = produto cartesiano; a última linha da NF vence
deterministicamente — no degenerado com estorno parcial, o custo é o da última linha enquanto
houver movimentação viva; limitação declarada, sem vínculo item↔movimentação; a tela bloqueia
duplicado, a API aceita); `disponivel` com COALESCE (quantidade_atual nullable — senão 500 de
toFixed); material INATIVO responde 200 (declarado). 404 `Material não encontrado` fica SÓ
para id inexistente. 404
`Material não encontrado` para id inexistente.

### RN-05 — Relatório custo por projeto
Chave `custo-por-projeto` no registro (categoria 'Gestão', `acao: 'gerenciar_reposicao'` —
D6, `exportavel: true` com colunas declaradas, `limite: null`, `nota` com a régua). Params:
`data_inicio`/`data_fim` (opcionais). Linhas por projeto (JOIN `projetos` do core; projeto
inexistente na tabela → rótulo `Projeto #<id>`): `consumido` = Σ(saídas com `projeto_id`,
`TIPOS_SAIDA`, não canceladas × custo da fonte única); `devolvido` = Σ(entradas de devolução
com `projeto_id` × custo) — **EMENDAS DA FASE 2:** (I3) os tipos de devolução exigem export
NOVO `TIPOS_DEVOLUCAO = ['ENTRADA_DEVOLUCAO', 'DEVOLUCAO']` em `movementTypes.js` (não existe
hoje; lista literal no reportService seria a 4ª cópia; `DEVOLUCAO` legado entra — o livro é
imutável; **`DEVOLUCAO_CLIENTE` NÃO entra — apesar do nome é SAÍDA**, e sai pelo filtro de
cliente por construção, dito na nota); (I2, medido) a devolução NÃO grava `projeto_id` em
produção (o payload do client não envia `origem_projeto_id` e o serviço não deriva) —
**decisão: a devolução passa a HERDAR projeto_id/os_id da saída citada** quando o chamador
não os informa (mesmo molde da herança de lote em returnService:80); sem isso `devolvido` é
estruturalmente zero. Teste obrigatório PELA ROTA REAL com o payload do cliente, não fixture
SQL. Devolução avulsa (sem saída citada) continua sem projeto — declarado; (I4, medido) o
custo é o ATUAL do material aplicado retroativamente (o livro não guarda custo por movimento)
— o valor de período fechado MUDA quando chega NF nova; dito na nota; e a fixture de custo
precisa de DOIS MATERIAIS por vias diferentes (M1 custo_medio=8/custo_unitario=99 → vale 8;
M2 custo_medio=0/custo_unitario=5 → vale 5) — duas saídas do MESMO material têm sempre o
mesmo custo e não provam nada; `liquido = consumido - devolvido`; `movimentacoes` (contagem).
Materiais de clientes FORA (patrimônio alheio). Movimentação sem projeto FORA (o relatório é
por projeto — o total geral é o valor consumido do indicador de giro, régua distinta e
declarada na nota).

### RN-06 — Tela: cancelar + contexto
Na tela de Reposição: aba Solicitações ganha botão **Cancelar** por linha (gate
`bloquearSeNaoPode('gerenciar_reposicao')`, confirm com o literal
`Cancelar esta solicitação de compra? A justificativa ficará registrada.` + prompt/campo de
justificativa) e badges para os 4 estados quando visíveis; aba Sugestões ganha painel
expansível **Contexto do material** consumindo RN-04 (disponível/reservado/em
terceiros/consumo/último custo/solicitações abertas). Falhas → painel de erro localizado,
nunca silêncio.

## Contratos de API (congelados)

- `POST /compras/solicitacoes/:id/cancelar` → RN-02 (códigos e literais lá).
- `GET /compras/contexto-material/:id` → RN-04 (shape e 404 lá).
- `GET /relatorios/custo-por-projeto` e `/export` → via registro (RN-05); 403 do dispatcher
  com `acao: 'gerenciar_reposicao'`.
- NENHUMA rota existente muda shape. O relatório `solicitacoes-compra` (E11) continua
  listando SÓ o pipeline aberto (PENDENTE+VINCULADO) — terminais somem da lista, que é o
  comportamento natural da aba.

## Tasks (sort topológico)

| Task | O quê | Classe |
|---|---|---|
| 1 | ciclo da solicitação: safeAlter + cancelar + gancho no processarNota | **tronco** |
| 2 | contexto do comprador (endpoint) | **tronco curto** (mesmo extended.js; leitura pura) |
| 3 | relatório custo-por-projeto (registro + fn) | **tronco curto** (idem) |
| 4 | tela: botão cancelar + badges + painel de contexto | **galho** (worktree) |
| 5 | teste-jornada: sugerir→gerar→vincular→RECEBER→posição rearma; cancelar→rearma | **galho** (principal) |
| 6 | fechar-etapa | — |

## Interações verificadas (Fase 0)

- `processarNota` (receiptService:628) seta PROCESSADO na :645 — gancho entra após.
- Posição (purchaseService:63/71) já filtra `IN ('PENDENTE','VINCULADO')` — D4 de graça,
  provado por teste da jornada (receber → material re-sugerido).
- `vincularPedidoCompra` não valida status atual (VINCULADO de novo?) — a Task 1 acrescenta a
  guarda de terminal SEM mudar o contrato do caminho feliz.
- `configuracoesGerais`: nenhuma config nova (janela do contexto reusa a da Reposição).
- Auditoria: `registrarAuditoria` com `dados_novos` OBJETO (lição E11).
