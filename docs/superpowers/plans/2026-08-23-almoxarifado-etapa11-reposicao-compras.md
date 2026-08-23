# Etapa 11 — Reposição e compras — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** motor de sugestão de reposição (consumo médio + ponto efetivo + posição), sugestão
consolidada por fornecedor, geração de solicitações e saúde do estoque — cruzando dados que já
existem, pelas fontes únicas, sem tocar no motor de estoque.

**Architecture:** o cálculo vive no `purchaseService` (o serviço de compra é UM); as três rotas
novas ficam em `routes/almoxarifado/extended.js` sob a ação nova `gerenciar_reposicao`
(primeiro uso real do perfil COMPRAS); a tela nova é um componente lazy no padrão do módulo.
`disponivelSql`/`custoUnitarioSql`/`TIPOS_SAIDA`/`TIPOS_ENTRADA` são consumidos, nunca
reescritos.

**Tech Stack:** Express + SQLite (`dbAll`/`dbGet`/`dbRun`), harness `tests/helpers/testApp.js`
(runner próprio por arquivo, `requirePermission` real), React CRA.

**Spec:** `docs/superpowers/specs/2026-08-23-almoxarifado-etapa11-reposicao-compras-design.md`
(RN-01..RN-09, D1..D11 — as mensagens literais deste plano vêm de lá e são contrato).

## Global Constraints

- Mensagens literais congeladas: 400 do POST `Lista de materiais inválida`; 400 do
  estoque-parado `Tipo inválido (use EXCESSO, SEM_CONSUMO ou OBSOLETO)`; grupo sem fornecedor
  `Sem fornecedor definido`.
- Material de cliente (`proprietario_cliente_id IS NOT NULL`) fora de TUDO (sugestão,
  geração, estoque parado).
- Nenhuma fórmula nova de disponível/custo/tipos: `disponivelSql()` (availabilitySql.js),
  `custoUnitarioSql()` (custoSql.js), `TIPOS_SAIDA`/`TIPOS_ENTRADA` (movementTypes.js).
- Rotas legadas (`verificar-minimos`, `vincular-pedido`) intocadas (gate `configurar`).
- Colunas/configs só por seed no `schema.js` (config não semeada nunca é configurável —
  lição da Etapa 10). Nenhuma coluna nova é necessária nesta etapa.
- Sabotagem: âncora única NOS DOIS SENTIDOS, restauração por sed reverso (nunca
  `git checkout` em árvore suja), md5 antes/depois. Teste de conjunto força o cenário.
- Commits em português, corpo sem acento, um assunto por commit, `git add` explícito.
- `cd server && npm run test:api` antes de cada commit de backend (baseline atual: 107/107).

## Sort topológico

| Task | O quê | Classe |
|---|---|---|
| 1 | ação `gerenciar_reposicao` + configs + motor de sugestão + GET /sugestoes (RN-01..06, 08) | **tronco** |
| 2 | POST /gerar-solicitacoes (RN-09) + GET /estoque-parado (RN-07) | **tronco** (depois da 1) |
| 3 | tela `/almoxarifado/reposicao` (3 abas) | **galho** (worktree, após 2) |
| 4 | teste-jornada de integração | **galho** (árvore principal, paralelo à 3) |
| 5 | fechar-etapa | final |

Tasks 1–2 mexem nos mesmos arquivos (`permissions.js`, `schema.js`, `purchaseService.js`,
`extended.js`) — tronco sequencial. O par paralelo real é Task 3 (client, worktree) × Task 4
(teste server, árvore principal) — zero interseção de arquivos.

---

### Task 1: Motor de sugestão + GET /reposicao/sugestoes (RN-01..RN-06, RN-08)

**Files:**
- Modify: `server/services/almoxarifado/permissions.js` (ACAO_PERFIS)
- Modify: `server/services/almoxarifado/schema.js` (bloco `configs`)
- Modify: `server/services/almoxarifado/purchaseService.js`
- Modify: `server/routes/almoxarifado/extended.js` (bloco "── Compras" ~linha 1071)
- Test: `server/tests/api/reposicaoSugestao.api.test.js` (novo)

**Interfaces:**
- Consumes: `disponivelSql('m')`, `custoUnitarioSql()` (com alias? — conferir a assinatura no
  arquivo: ela gera SQL sobre colunas sem alias; usar no SELECT de `materiais_almoxarifado m`
  exige o mesmo padrão que `reportService` já usa — copie de lá), `TIPOS_SAIDA`,
  `stockService.getConfig`.
- Produces: `purchaseService.calcularSugestoes(db)` → `{ janela_dias, fornecedores: [...],
  resumo: {...} }` (shape exato do contrato congelado no design) — a Task 2 chama a MESMA
  função para gerar; a Task 3 consome o JSON pela rota.

- [ ] **Step 1: ação nova em ACAO_PERFIS**

Em `permissions.js`, depois de `remessar_terceiro` (ou junto do bloco de ações da 9b — seguir
a ordem do arquivo), com comentário no padrão da casa:

```js
  // Etapa 11 (D9 do design): decidir COMPRA e gestao/compras, nao operacao de balcao — o
  // ALMOXARIFE conta e movimenta, nao decide pedido; fica fora DE PROPOSITO (primeira acao do
  // modulo sem ele — reversivel, uma linha, registrado na letra B do doc de novidades).
  // Primeiro uso real do perfil COMPRAS.
  gerenciar_reposicao: [PERFIS.ADMINISTRADOR, PERFIS.GESTOR, PERFIS.COMPRAS],
```

- [ ] **Step 2: configs semeadas**

Em `schema.js`, no array `configs` existente (junto de `tolerancia_inventario_percentual`):

```js
    // Etapa 11: janela do consumo medio e regua de material parado (RN-01/RN-07). Semeadas
    // porque PUT /configuracoes so escreve chave que ja existe (licao da Etapa 10).
    ['reposicao_janela_consumo_dias', '90', 'Janela (dias) do consumo médio para reposição'],
    ['reposicao_dias_sem_consumo', '180', 'Dias sem saída para material contar como parado/obsoleto'],
```

- [ ] **Step 3: teste vermelho — `reposicaoSugestao.api.test.js`**

Harness padrão (copiar cabeçalho de `conferenciaEscopo.api.test.js`). Usuários: `ADMIN`,
`GESTOR` (id 2), `COMPRAS = { id: 5, nome: 'Comprador', role: 'usuario',
perfil_almoxarifado: 'COMPRAS', email: 'compras@test.com' }`, `ALMOXARIFE` (id 3) e
`PRODUCAO` (id 9, sem perfil). Helpers:

```js
let seq = 0;
async function novoMaterial(db, over = {}) {
  seq += 1;
  const m = { codigo: `REP-${seq}`, nome: `Material Rep ${seq}`, unidade: 'UN', qtd: 0,
    minima: 0, maxima: 0, ponto: 0, lote: 0, prazo: 0, fornecedor_id: null, cliente_id: null,
    custo: 0, ...over };
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, quantidade_minima, quantidade_maxima,
       ponto_reposicao, lote_economico, prazo_reposicao_dias, fornecedor_id,
       proprietario_cliente_id, custo_unitario)
     VALUES (?,?,?,?,1,?,?,?,?,?,?,?,?)`,
    [m.codigo, m.nome, m.unidade, m.qtd, m.minima, m.maxima, m.ponto, m.lote, m.prazo,
     m.fornecedor_id, m.cliente_id, m.custo]);
  return { id: r.lastID, codigo: m.codigo };
}
async function saidaNoLivro(db, materialId, quantidade, { diasAtras = 1, tipo = 'SAIDA', cancelado = 0 } = {}) {
  await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
      (material_id, tipo, quantidade, cancelado, created_at)
     VALUES (?,?,?,?, datetime('now', ?))`,
    [materialId, tipo, quantidade, cancelado, `-${diasAtras} days`]);
}
async function sugestoes(app) { return request(app).get('/api/almoxarifado/reposicao/sugestoes'); }
function itemDe(res, materialId) {
  for (const g of res.body.fornecedores) {
    const it = g.itens.find((i) => i.material_id === materialId);
    if (it) return it;
  }
  return undefined;
}
```

(Se alguma coluna do INSERT não existir com esse nome, LEIA o schema e ajuste o teste — não
invente coluna; `movimentacoes_almoxarifado` aceita INSERT direto nos testes, padrão usado
pelas suítes de relatório.)

Testes:

1. `RN-01: consumo medio vem da janela — saida velha e cancelada ficam fora` — material com
   `prazo: 10`; 3 saídas de 30 dentro da janela (dias 1, 10, 80), uma de 900 há 200 dias
   (fora), uma de 900 cancelada há 5 dias. Config default 90 → `consumo_medio_diario === 1`
   (90/90). Item presente porque ponto CALCULADO = 10 > posição 0.
2. `RN-02: origem do ponto — CADASTRADO vence CALCULADO vence MINIMO; sem regua nao sugere` —
   quatro materiais: (a) `ponto: 50, prazo: 10` + consumo → `origem_ponto 'CADASTRADO'`,
   `ponto_efetivo 50`; (b) só `prazo: 10` + consumo 1/dia → `'CALCULADO'`, 10; (c) só
   `minima: 5` → `'MINIMO'`, 5; (d) tudo zero e sem consumo → **ausente** da resposta.
3. `RN-03: solicitacao aberta entra na posicao e tira o material da sugestao` — material
   `minima: 5, qtd: 0`; primeiro aparece (`posicao 0`); inserir
   `INSERT INTO solicitacoes_compra_almoxarifado (material_id, quantidade, status) VALUES (?, 10, 'PENDENTE')`
   → some da resposta (posição 10 ≥ 5). Trocar status para `'VINCULADO'` → continua fora.
   Trocar para `'CANCELADO'`... (não há status cancelado no legado — usar `'ATENDIDO'`? LEIA
   os status usados; se só PENDENTE/VINCULADO existem, use um literal qualquer diferente,
   ex.: `'FECHADO'`) → volta a aparecer.
4. `RN-03: reserva NAO e descontada duas vezes` — material `qtd: 10, minima: 8` com
   `quantidade_reservada = 4` (UPDATE direto): disponível = 6 < 8 → sugere com
   `disponivel === 6` e `posicao === 6` (se alguém reescrever a conta descontando reserva de
   novo, disponivel viraria 2 — o assert pega).
5. `RN-04: alvo e o maior entre maxima e ponto; lote economico e piso` — (a) `minima: 5,
   maxima: 20, qtd: 0` → sugerida 20; (b) `minima: 5, maxima: 2` (dado ruim) → alvo 5,
   sugerida 5; (c) `minima: 5, lote: 50, qtd: 0` → sugerida 50; (d) posição já cobre o alvo →
   ausente.
6. `RN-04: valor estimado pela fonte unica de custo` — `custo: 10`, sugerida 20 →
   `valor_estimado === 200`; e o `valor_total` do grupo soma.
7. `RN-05: agrupamento por fornecedor, alfabetico, sem-fornecedor por ultimo` — criar 2
   fornecedores (`INSERT INTO fornecedores (razao_social) VALUES ('Zeta Acos')` / `('Alfa
   Parafusos')`), materiais em cada um + um sem fornecedor → ordem dos grupos: Alfa, Zeta,
   `Sem fornecedor definido` (com `fornecedor_id: null`).
8. `RN-06: risco de parada = critico com disponivel <= 0` — crítico `qtd: 0, minima: 5` →
   `risco_parada true` e `resumo.riscos_parada` conta; crítico `qtd: 3, minima: 5` (disponível
   3 > 0) → `false`; não-crítico zerado → `false`.
9. `RN-01: material de cliente fica fora` — material com `cliente_id` válido (INSERT em
   clientes) e `minima: 5, qtd: 0` → ausente.
10. `RN-08: gate positivo e negativo` — `setUser(PRODUCAO)` → 403; `setUser(ALMOXARIFE)` →
    **403 também** (fora de propósito, D9); `setUser(COMPRAS)` → 200; `setUser(GESTOR)` → 200.

- [ ] **Step 4: rodar e ver falhar** — 404 na rota nova.

- [ ] **Step 5: implementação**

**(a) `purchaseService.js`** — acrescentar (imports novos no topo:
`const { disponivelSql } = require('./availabilitySql'); const { custoUnitarioSql } =
require('./custoSql'); const { TIPOS_SAIDA, TIPOS_ENTRADA } = require('./movementTypes');
const { getConfig } = ...` — getConfig vive no stockService; para não importar o motor
inteiro, leia a config com um dbGet local igual ao dele):

```js
async function lerConfigNumero(db, chave, fallback) {
  const row = await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [chave]);
  const n = parseFloat(row?.valor);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Etapa 11 (RN-01..RN-06): a sugestao de reposicao. Fontes unicas: disponivelSql (disponivel
// JA desconta reservado/bloqueado/inspecao/terceiros — NAO descontar reserva de novo, RN-03),
// custoUnitarioSql (valor), TIPOS_SAIDA (consumo = tudo que debita patrimonio, D6).
// Material de cliente fora de tudo (nao se compra material dos outros).
async function calcularSugestoes(db) {
  const janela = await lerConfigNumero(db, 'reposicao_janela_consumo_dias', 90);
  const placeholders = TIPOS_SAIDA.map(() => '?').join(',');

  const rows = await dbAll(db, `
    SELECT m.id AS material_id, m.codigo, m.nome, m.unidade,
           m.quantidade_minima, m.quantidade_maxima, m.ponto_reposicao, m.lote_economico,
           m.prazo_reposicao_dias, m.material_critico, m.fornecedor_id,
           f.razao_social AS fornecedor_nome,
           ${disponivelSql('m')} AS disponivel,
           ${custoUnitarioSql()} AS custo_unitario,
           COALESCE((SELECT SUM(mv.quantidade) FROM movimentacoes_almoxarifado mv
                     WHERE mv.material_id = m.id AND mv.cancelado = 0
                       AND mv.tipo IN (${placeholders})
                       AND mv.created_at >= datetime('now', '-' || ? || ' days')), 0) AS consumo_janela,
           COALESCE((SELECT SUM(sc.quantidade) FROM solicitacoes_compra_almoxarifado sc
                     WHERE sc.material_id = m.id AND sc.status IN ('PENDENTE','VINCULADO')), 0) AS a_caminho
    FROM materiais_almoxarifado m
    LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
    WHERE m.ativo = 1 AND m.proprietario_cliente_id IS NULL`,
    [...TIPOS_SAIDA, janela]);

  const itens = [];
  for (const r of rows) {
    const consumoDiario = r.consumo_janela / janela;
    let pontoEfetivo = 0; let origemPonto = null;
    if (r.ponto_reposicao > 0) { pontoEfetivo = r.ponto_reposicao; origemPonto = 'CADASTRADO'; }
    else if (consumoDiario > 0 && r.prazo_reposicao_dias > 0) {
      pontoEfetivo = consumoDiario * r.prazo_reposicao_dias; origemPonto = 'CALCULADO';
    } else if (r.quantidade_minima > 0) { pontoEfetivo = r.quantidade_minima; origemPonto = 'MINIMO'; }
    if (pontoEfetivo <= 0) continue;                     // RN-02: sem regua, nunca sugere

    const posicao = r.disponivel + r.a_caminho;          // RN-03
    if (posicao >= pontoEfetivo) continue;

    const alvo = Math.max(r.quantidade_maxima || 0, pontoEfetivo);   // RN-04
    let sugerida = alvo - posicao;
    if (r.lote_economico > 0) sugerida = Math.max(sugerida, r.lote_economico);
    if (sugerida <= 0) continue;

    itens.push({
      material_id: r.material_id, codigo: r.codigo, nome: r.nome, unidade: r.unidade,
      fornecedor_id: r.fornecedor_id, fornecedor_nome: r.fornecedor_nome,
      disponivel: r.disponivel, a_caminho: r.a_caminho, posicao,
      consumo_medio_diario: Number(consumoDiario.toFixed(4)),
      prazo_reposicao_dias: r.prazo_reposicao_dias || 0,
      ponto_efetivo: Number(pontoEfetivo.toFixed(4)), origem_ponto: origemPonto,
      quantidade_sugerida: Number(sugerida.toFixed(4)),
      valor_estimado: Number((sugerida * (r.custo_unitario || 0)).toFixed(2)),
      // RN-06/D7: critico sem disponivel = risco de parada — solicitacao a caminho nao
      // segura producao, por isso a flag olha o DISPONIVEL, nao a posicao.
      risco_parada: !!r.material_critico && r.disponivel <= 0,
    });
  }

  // RN-05: grupos por fornecedor, alfabetico, sem-fornecedor SEMPRE por ultimo.
  const porFornecedor = new Map();
  for (const item of itens) {
    const chave = item.fornecedor_id == null ? 'null' : String(item.fornecedor_id);
    if (!porFornecedor.has(chave)) {
      porFornecedor.set(chave, {
        fornecedor_id: item.fornecedor_id,
        fornecedor_nome: item.fornecedor_id == null ? 'Sem fornecedor definido' : item.fornecedor_nome,
        itens: [], total_itens: 0, valor_total: 0,
      });
    }
    const g = porFornecedor.get(chave);
    const { fornecedor_id, fornecedor_nome, ...itemLimpo } = item;
    g.itens.push(itemLimpo);
    g.total_itens += 1;
    g.valor_total = Number((g.valor_total + item.valor_estimado).toFixed(2));
  }
  const fornecedores = [...porFornecedor.values()].sort((a, b) => {
    if (a.fornecedor_id == null) return 1;
    if (b.fornecedor_id == null) return -1;
    return String(a.fornecedor_nome).localeCompare(String(b.fornecedor_nome));
  });

  return {
    janela_dias: janela,
    fornecedores,
    resumo: {
      materiais_sugeridos: itens.length,
      valor_total: Number(itens.reduce((s, i) => s + i.valor_estimado, 0).toFixed(2)),
      riscos_parada: itens.filter((i) => i.risco_parada).length,
    },
  };
}
```

Exportar `calcularSugestoes` (e manter os dois legados).

**Atenção `custoUnitarioSql()`**: leia a assinatura real em `custoSql.js` — se ela aceitar
alias (como `disponivelSql`), use `custoUnitarioSql('m')`; se não, confirme que o SQL gerado
resolve as colunas de `m` sem ambiguidade no JOIN (o `reportService` tem o padrão de uso —
copie de lá). Não chute: esse detalhe quebra a query inteira.

**(b) rota em `extended.js`** (no bloco "── Compras", depois de vincular-pedido):

```js
  // ── Reposição (Etapa 11) — RN-01..RN-08 do design. Gate proprio: decidir compra e
  // gestao/compras (ALMOXARIFE fora de proposito, D9).
  app.get('/api/almoxarifado/reposicao/sugestoes', auth, requirePermission('gerenciar_reposicao'), async (req, res) => {
    try { res.json(await purchaseService.calcularSugestoes(db)); }
    catch (e) { handleError(res, e); }
  });
```

- [ ] **Step 6: rodar até verde** — o arquivo novo inteiro.

- [ ] **Step 7: controles positivos** — três sabotagens (âncoras conferidas nos DOIS
  sentidos): (i) trocar `AND mv.cancelado = 0` por `AND 1=1` → teste 1 cai; (ii) trocar
  `r.disponivel + r.a_caminho` por `r.disponivel` → teste 3 cai; (iii) inverter o sort do
  sem-fornecedor (`return -1`/`return 1` trocados) → teste 7 cai. Restaurar por sed reverso,
  md5 idêntico após cada uma.

- [ ] **Step 8: suíte + commit**

```bash
cd server && npm run test:api
git add server/services/almoxarifado/permissions.js server/services/almoxarifado/schema.js server/services/almoxarifado/purchaseService.js server/routes/almoxarifado/extended.js server/tests/api/reposicaoSugestao.api.test.js
git commit -m "Almoxarifado Etapa 11 Task 1: motor de sugestao de reposicao e GET /reposicao/sugestoes"
```

---

### Task 2: POST /gerar-solicitacoes (RN-09) + GET /estoque-parado (RN-07)

**Files:**
- Modify: `server/services/almoxarifado/purchaseService.js`
- Modify: `server/routes/almoxarifado/extended.js`
- Test: `server/tests/api/reposicaoGerarSolicitacoes.api.test.js` e
  `server/tests/api/reposicaoEstoqueParado.api.test.js` (novos)

**Interfaces:**
- Consumes: `calcularSugestoes` (Task 1), `registrarAuditoria` (audit.js),
  `TIPOS_ENTRADA`/`TIPOS_SAIDA`, `custoUnitarioSql`, config `reposicao_dias_sem_consumo`.
- Produces: `purchaseService.gerarSolicitacoesDaSugestao(db, usuario, materialIds)` →
  `{ criadas, puladas }`; `purchaseService.estoqueParado(db, tipo)` → `{ dias_sem_consumo,
  itens, resumo }` — shapes congelados no design.

- [ ] **Step 1: testes vermelhos (os DOIS arquivos)**

`reposicaoGerarSolicitacoes.api.test.js` (helpers da Task 1 copiados):

1. `RN-09: gera com a quantidade DO SERVIDOR e audita` — material `minima: 5, maxima: 20,
   qtd: 0, custo: 10`; POST `{}` → `criadas` tem `{ material_id, quantidade: 20 }`; a linha
   existe em `solicitacoes_compra_almoxarifado` com `motivo = 'PONTO_REPOSICAO'` e
   `status = 'PENDENTE'`; `SELECT * FROM auditoria_log_almoxarifado WHERE entidade =
   'solicitacao_compra' AND entidade_id = ?` tem 1 linha com a ação de criação.
2. `RN-09: dedupe — material com PENDENTE vira pulada JA_PENDENTE` — POST duas vezes: a
   segunda responde `puladas: [{ material_id, motivo: 'JA_PENDENTE' }]` e NÃO cria segunda
   linha (COUNT = 1).
3. `RN-09: id fora das sugestoes vira SEM_SUGESTAO` — POST `{ material_ids: [999999] }` →
   `puladas` com motivo `SEM_SUGESTAO`, `criadas` vazio.
4. `RN-09: selecao parcial cria SO os pedidos` — dois materiais sugeridos, POST com um id →
   1 criada, e o outro material continua aparecendo em GET /sugestoes.
5. `RN-09: body invalido recusa 400 literal` — `{ material_ids: 'abc' }` e
   `{ material_ids: [1, 'x'] }` → 400 `Lista de materiais inválida`; nada criado.
6. `RN-08: gate — PRODUCAO e ALMOXARIFE 403, COMPRAS 200` (par positivo+negativo).
7. `[CONTROLE] a quantidade do body e IGNORADA` — POST `{ material_ids: [id],
   quantidades: { [id]: 99999 } }` (campo inventado) → a criada tem a quantidade calculada,
   não 99999.

`reposicaoEstoqueParado.api.test.js`:

1. `RN-07: excesso = atual > maxima > 0` — `qtd: 100, maxima: 50` → `excesso true`; material
   com `maxima: 0` e qtd alta → `excesso false`.
2. `RN-07: sem_consumo = nenhuma saida ha N dias (ou nunca)` — material com saída há 200 dias
   → `sem_consumo true`; com saída há 10 dias → ausente das flags (ou `sem_consumo false`);
   material que NUNCA saiu → `true`.
3. `RN-07: obsoleto exige tambem nenhuma entrada no periodo` — sem saída há 200 dias e COM
   entrada há 30 → `obsoleto false, sem_consumo true`; sem nada há 200 → `obsoleto true`.
4. `RN-07: filtro por tipo e 400 literal` — `?tipo=EXCESSO` só traz excessos;
   `?tipo=QUALQUER` → 400 `Tipo inválido (use EXCESSO, SEM_CONSUMO ou OBSOLETO)`.
5. `RN-07: valor parado e resumo` — `qtd: 100, custo: 2` → `valor_parado 200`;
   `resumo.valor_parado_total` soma; contadores por flag batem.
6. `RN-07: material de cliente e material zerado ficam fora` — cliente com excesso → ausente;
   `qtd: 0` sem consumo → ausente (a régua é "ocupa prateleira").
7. `RN-08: gate positivo e negativo` (COMPRAS 200 / ALMOXARIFE 403 / PRODUCAO 403).

- [ ] **Step 2: rodar e ver falhar.**

- [ ] **Step 3: implementação**

**(a) `gerarSolicitacoesDaSugestao`** em `purchaseService.js`:

```js
// RN-09: o servidor calcula, o cliente so escolhe QUAIS materiais. Recalcula as sugestoes na
// hora (nao confia em quantidade vinda de fora) e reusa o dedupe do legado: material com
// PENDENTE nao ganha outra solicitacao. Auditada — a geracao legada por minimo nunca foi
// (D10: legado intocado).
async function gerarSolicitacoesDaSugestao(db, usuario, materialIds) {
  const sugestao = await calcularSugestoes(db);
  const porMaterial = new Map();
  for (const g of sugestao.fornecedores) for (const i of g.itens) porMaterial.set(i.material_id, i);

  const alvos = (materialIds && materialIds.length > 0)
    ? materialIds : [...porMaterial.keys()];

  const criadas = []; const puladas = [];
  for (const materialId of alvos) {
    const item = porMaterial.get(materialId);
    if (!item) { puladas.push({ material_id: materialId, motivo: 'SEM_SUGESTAO' }); continue; }
    const pendente = await dbGet(db,
      "SELECT id FROM solicitacoes_compra_almoxarifado WHERE material_id = ? AND status = 'PENDENTE'",
      [materialId]);
    if (pendente) { puladas.push({ material_id: materialId, motivo: 'JA_PENDENTE' }); continue; }
    const r = await dbRun(db, `INSERT INTO solicitacoes_compra_almoxarifado
        (material_id, quantidade, motivo) VALUES (?,?,'PONTO_REPOSICAO')`,
      [materialId, item.quantidade_sugerida]);
    await registrarAuditoria(db, {
      entidade: 'solicitacao_compra', entidade_id: r.lastID, acao: 'CRIAR',
      usuario_id: usuario.id, usuario_nome: usuario.nome || usuario.email,
      dados_novos: JSON.stringify({ material_id: materialId, quantidade: item.quantidade_sugerida, motivo: 'PONTO_REPOSICAO' }),
    });
    criadas.push({ material_id: materialId, solicitacao_id: r.lastID, quantidade: item.quantidade_sugerida });
  }
  return { criadas, puladas };
}
```

(Confira a assinatura real de `registrarAuditoria` em `audit.js` — os campos acima vêm dela;
se `dados_novos` esperar objeto em vez de string, siga o padrão dos chamadores existentes.)

**(b) `estoqueParado`**:

```js
// RN-07: excesso / sem consumo / obsoleto — flags INDEPENDENTES (um material pode ser excesso
// E obsoleto). So material ativo, nosso, com saldo (a regua e "ocupa prateleira"). LIMIT 500,
// maior valor parado primeiro.
async function estoqueParado(db, tipo) {
  const dias = await lerConfigNumero(db, 'reposicao_dias_sem_consumo', 180);
  const phSaida = TIPOS_SAIDA.map(() => '?').join(',');
  const phEntrada = TIPOS_ENTRADA.map(() => '?').join(',');

  const rows = await dbAll(db, `
    SELECT m.id AS material_id, m.codigo, m.nome, m.unidade,
           m.quantidade_atual, m.quantidade_maxima,
           ${custoUnitarioSql()} AS custo_unitario,
           (SELECT MAX(mv.created_at) FROM movimentacoes_almoxarifado mv
            WHERE mv.material_id = m.id AND mv.cancelado = 0 AND mv.tipo IN (${phSaida})) AS ultima_saida,
           (SELECT MAX(mv.created_at) FROM movimentacoes_almoxarifado mv
            WHERE mv.material_id = m.id AND mv.cancelado = 0 AND mv.tipo IN (${phEntrada})) AS ultima_entrada
    FROM materiais_almoxarifado m
    WHERE m.ativo = 1 AND m.proprietario_cliente_id IS NULL AND m.quantidade_atual > 0`,
    [...TIPOS_SAIDA, ...TIPOS_ENTRADA]);

  const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  const antigaOuNunca = (d) => d == null || new Date(`${String(d).replace(' ', 'T')}Z`).getTime() < limite;

  let itens = rows.map((r) => {
    const sem_consumo = antigaOuNunca(r.ultima_saida);
    return {
      material_id: r.material_id, codigo: r.codigo, nome: r.nome, unidade: r.unidade,
      quantidade_atual: r.quantidade_atual, quantidade_maxima: r.quantidade_maxima,
      ultima_entrada: r.ultima_entrada || null, ultima_saida: r.ultima_saida || null,
      valor_parado: Number((r.quantidade_atual * (r.custo_unitario || 0)).toFixed(2)),
      excesso: r.quantidade_maxima > 0 && r.quantidade_atual > r.quantidade_maxima,
      sem_consumo,
      obsoleto: sem_consumo && antigaOuNunca(r.ultima_entrada),
    };
  }).filter((i) => i.excesso || i.sem_consumo || i.obsoleto);

  if (tipo) {
    const chave = { EXCESSO: 'excesso', SEM_CONSUMO: 'sem_consumo', OBSOLETO: 'obsoleto' }[tipo];
    itens = itens.filter((i) => i[chave]);
  }
  itens.sort((a, b) => b.valor_parado - a.valor_parado);
  itens = itens.slice(0, 500);

  return {
    dias_sem_consumo: dias,
    itens,
    resumo: {
      excesso: itens.filter((i) => i.excesso).length,
      sem_consumo: itens.filter((i) => i.sem_consumo).length,
      obsoleto: itens.filter((i) => i.obsoleto).length,
      valor_parado_total: Number(itens.reduce((s, i) => s + i.valor_parado, 0).toFixed(2)),
    },
  };
}
```

**(c) rotas** (depois do GET de sugestões):

```js
  app.post('/api/almoxarifado/reposicao/gerar-solicitacoes', auth, requirePermission('gerenciar_reposicao'), async (req, res) => {
    try {
      const { material_ids } = req.body || {};
      if (material_ids !== undefined
          && (!Array.isArray(material_ids) || material_ids.some((x) => typeof x !== 'number'))) {
        return res.status(400).json({ error: 'Lista de materiais inválida' });
      }
      res.json(await purchaseService.gerarSolicitacoesDaSugestao(db, req.user, material_ids));
    } catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/reposicao/estoque-parado', auth, requirePermission('gerenciar_reposicao'), async (req, res) => {
    try {
      const { tipo } = req.query;
      if (tipo !== undefined && !['EXCESSO', 'SEM_CONSUMO', 'OBSOLETO'].includes(tipo)) {
        return res.status(400).json({ error: 'Tipo inválido (use EXCESSO, SEM_CONSUMO ou OBSOLETO)' });
      }
      res.json(await purchaseService.estoqueParado(db, tipo));
    } catch (e) { handleError(res, e); }
  });
```

Exportar as duas funções novas.

- [ ] **Step 4: rodar até verde + regressão** — os 3 arquivos novos +
  `node tests/api/reposicaoSugestao.api.test.js`.

- [ ] **Step 5: controles positivos** — (i) no gerar, trocar `item.quantidade_sugerida` do
  INSERT por `99999` → teste 1 cai (quantidade errada); (ii) remover o `await
  registrarAuditoria(...)` (comentar via sed com âncora única) → teste 1 cai (auditoria
  ausente); (iii) no estoqueParado, trocar `sem_consumo && antigaOuNunca(r.ultima_entrada)`
  por `sem_consumo` → teste 3 cai. Sed reverso + md5.

- [ ] **Step 6: suíte + commit**

```bash
cd server && npm run test:api
git add server/services/almoxarifado/purchaseService.js server/routes/almoxarifado/extended.js server/tests/api/reposicaoGerarSolicitacoes.api.test.js server/tests/api/reposicaoEstoqueParado.api.test.js
git commit -m "Almoxarifado Etapa 11 Task 2: gerar solicitacoes da sugestao e estoque parado"
```

---

### Task 3: Tela `/almoxarifado/reposicao` (galho, worktree)

**Files:**
- Create: `client/src/components/almoxarifado/ReposicaoAlmoxarifado.js`
- Create: `client/src/components/almoxarifado/ReposicaoAlmoxarifado.test.js`
- Modify: `client/src/routes/lazyModules.js` (export + entrada no mapa de rotas)
- Modify: `client/src/App.js` (import lazy + `<Route path="reposicao" ...>`)
- Modify: `client/src/components/Layout.js` (item de menu do módulo almoxarifado)

**Interfaces (contrato congelado — mock de HTTP nos testes):**
- `GET /almoxarifado/reposicao/sugestoes` → shape do design (fornecedores/itens/resumo).
- `POST /almoxarifado/reposicao/gerar-solicitacoes` body `{ material_ids }` → `{ criadas,
  puladas }`.
- `GET /almoxarifado/reposicao/estoque-parado?tipo=` → shape do design.
- `GET /almoxarifado/relatorios/solicitacoes-compra` → lista de solicitações (aba
  Solicitações, leitura pura — conferir o shape real chamando o reportService antes de
  mockar).
- Gate na UI: `bloquearSeNaoPode('gerenciar_reposicao', e)` no botão Gerar (padrão
  `useAlmoxPermissoes` dos irmãos).

- [ ] **Step 1: testes vermelhos** (RTL, mock do módulo `api`, padrões de
  `ConferenciaEstoque.test.js` — `esperarEfeitos`, `botao`, `linhaMaterial`; cada controle
  novo em `.almox-field` com `<label>` se houver formulário):

1. `sugestoes agrupadas por fornecedor com resumo` — mock com 2 grupos + sem-fornecedor;
   renderiza cabeçalhos com nome/valor (R$ pt-BR), linhas com posição/ponto/origem/sugerida,
   resumo com `materiais_sugeridos` e `riscos_parada`; badge "Risco de parada" na linha com
   flag.
2. `gerar solicitacoes envia SO os ids marcados` — desmarcar um checkbox, clicar Gerar →
   `api.post` chamado com `{ material_ids: [<os marcados>] }`; resposta com `puladas` mostra
   os motivos.
3. `aba Estoque Parado renderiza flags e traço em datas nulas` — mock com item excesso+
   obsoleto → dois badges na mesma linha; `ultima_saida: null` → `—`.
4. `filtro por tipo refaz a chamada` — selecionar EXCESSO → `api.get` chamado com
   `tipo=EXCESSO`.
5. `aba Solicitacoes lista pendentes` — mock do relatório → linhas renderizadas.
6. `payload vazio nao explode` — mocks `{ fornecedores: [], resumo: {...} }` → estado vazio
   com mensagem, sem `undefined`/`NaN` no texto.

- [ ] **Step 2: rodar e ver falhar.**

- [ ] **Step 3: implementação** — seguir os padrões visuais do módulo (`almox-page`,
  `almox-table`, abas como em `SobrasAlmoxarifado`/`FerramentasAlmoxarifado`; ler um deles
  antes). Checkboxes por `checked` (nunca value-string). Valores `toLocaleString('pt-BR',
  { style: 'currency', currency: 'BRL' })`; nulos → `—`. Rota/menu no padrão exato de
  `/almoxarifado/sobras` (lazyModules linha ~156/207, App.js ~111/495, Layout).

- [ ] **Step 4: suíte + build** — `CI=true npx react-scripts test --watchAll=false
  ReposicaoAlmoxarifado` e depois a suíte client INTEIRA (o Layout/App mudaram) +
  `CI=true npx react-scripts build`.

- [ ] **Step 5: controle positivo** — sabotagem: enviar todos os ids ignorando os checkboxes
  → teste 2 cai. Sed reverso + md5.

- [ ] **Step 6: commit (na worktree)** — só os 5 arquivos.

---

### Task 4: Teste-jornada de integração (galho, árvore principal)

**Files:**
- Test: `server/tests/api/reposicaoJornada.api.test.js` (novo — zero produção)

Jornada (um `test` longo, motor real, padrão `inventarioEscopoJornada.api.test.js`):

1. Seed: fornecedor `Aços Jornada`; M1 (`minima 5, maxima 20, custo 10, fornecedor, critico,
   qtd 20` via `stockService.registrarMovimentacao` tipo ENTRADA — usar o motor REAL, não
   INSERT, para a jornada provar a composição com o livro).
2. Consumir pelo motor: SAIDA de 18 (fica 2, disponível 2 < mínimo 5).
3. `GET /reposicao/sugestoes` (COMPRAS) → M1 aparece, `origem_ponto 'MINIMO'`,
   `quantidade_sugerida 18` (alvo 20 − posição 2), `risco_parada false` (disponível 2 > 0).
4. SAIDA de 2 (zera) → sugestão recalcula: `risco_parada true`, resumo conta 1.
5. `POST /gerar-solicitacoes {}` → 1 criada com quantidade 20 (alvo 20 − posição 0);
   auditoria existe.
6. `GET /sugestoes` de novo → M1 **sumiu** (a_caminho 20 ≥ ponto 5).
7. POST de novo → `puladas: [{ motivo: 'JA_PENDENTE' }]`... **atenção**: M1 não está mais nas
   sugestões (posição coberta), então o motivo REAL é `SEM_SUGESTAO` — afirmar o
   comportamento VERDADEIRO (o design diz: dedupe JA_PENDENTE só se ainda sugerido; leia o
   código da Task 2 e afirme o que ele faz; se divergir do esperado de negócio, é achado).
8. Vincular pedido pela rota legada (ADMIN, gate `configurar`):
   `POST /compras/solicitacoes/:id/vincular-pedido { pedido_compra_id: 1 }` → status
   VINCULADO; sugestão continua sem M1 (VINCULADO também conta em a_caminho).
9. M2 parado: entrada pelo motor há muito tempo não é possível (created_at é NOW) — para o
   estoque-parado, inserir M2 com qtd via motor e **backdatear** a movimentação com UPDATE
   direto no teste (`UPDATE movimentacoes_almoxarifado SET created_at = datetime('now',
   '-200 days') WHERE material_id = ?`) → `GET /estoque-parado` → M2 com `sem_consumo` e
   `obsoleto` true, `valor_parado` certo.
10. Gate: PRODUCAO → 403 nas três rotas novas; ALMOXARIFE → 403; COMPRAS → 200.

Controle positivo da jornada: sabotagem no serviço (trocar `disponivel + a_caminho` por
`disponivel`) → o passo 6 cai (M1 continuaria aparecendo). Sed reverso + md5; anotar qual
suíte unitária cai junto.

Suíte completa antes do commit; `git add` só o arquivo novo.

---

### Task 5: Fechar a etapa

- [ ] Merge da worktree (`git merge --no-ff`), suíte serial completa, revisão final de branch
  (revisores frescos, lentes backend e costura front↔back, sabotagens MEDIDAS).
- [ ] Skill **`fechar-etapa`** inteira (7 artefatos; letra B: D9/gate sem ALMOXARIFE, D2/proxy
  de pedidos abertos → letra E, D5/máximo sem alerta, D7/risco simples; manual: seção nova de
  reposição).
- [ ] Retro de 4 números no fim deste arquivo.

---

## Self-review do plano (feito na escrita)

- **Cobertura do design:** RN-01..06+08 → Task 1; RN-07+09 → Task 2; tela → Task 3; composição
  → Task 4. D1..D11 são cortes/decisões → documentação (Task 5).
- **Tipos consistentes:** `calcularSugestoes`/`gerarSolicitacoesDaSugestao`/`estoqueParado` e
  os shapes batem entre Tasks 1/2 (produtor), 3 (consumidor via HTTP) e 4 (jornada).
- **Armadilhas nomeadas:** assinatura de `custoUnitarioSql` (alias?) a conferir no código;
  status reais de `solicitacoes_compra_almoxarifado`; passo 7 da jornada afirma o
  comportamento REAL do dedupe (JA_PENDENTE vs SEM_SUGESTAO quando a posição já cobre);
  backdate de movimentação só em teste; `registrarAuditoria` com os campos do padrão real.
