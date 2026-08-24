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

## Fase 2 — achados da revisão adversarial do plano (acatados antes da execução)

Revisor fresco: **3 Critical + 6 Important + 6 Minor; 1 ruído** (a "árvore suja" era o
snapshot do início da sessão — `git status` real está limpo). Correções aplicadas no texto:

1. **[Critical]** `saidaNoLivro` sem `saldo_anterior`/`saldo_posterior` (NOT NULL sem default)
   morria em SQLITE_CONSTRAINT — corrigido com o padrão dos helpers reais da base.
2. **[Critical]** o dedupe `JA_PENDENTE` era inalcançável no caminho normal (a pendência entra
   em `a_caminho` e tira o material da sugestão antes do dedupe rodar) e nocivo no caso raro
   (recusava repor material que continuava faltando). **RN-09 reescrita**: sem dedupe no
   caminho novo — a matemática da posição É o dedupe, e pendência insuficiente gera o
   COMPLEMENTO; `pulada` só existe como `SEM_SUGESTAO` para id explícito.
3. **[Critical]** `a_caminho` sem horizonte: nada no sistema fecha solicitação (verificado —
   só existem PENDENTE e VINCULADO), então uma solicitação de janeiro seguraria a posição para
   SEMPRE e o material sumia da sugestão eternamente (sub-compra silenciosa). RN-03 ganhou o
   horizonte `reposicao_horizonte_solicitacao_dias` (60) — letra E no fechamento.
4. **[Important ×6]** `?tipo=` vazio (o "Todos" do select) tomava 400 → tratado como ausente;
   `material_ids: []` significava "todas" (desmarcar tudo e clicar dispararia o catálogo
   inteiro) → `[]` = nenhuma; `dados_novos` como string seria re-serializado (escape em dobro)
   → objeto, e o teste passa a `JSON.parse` o gravado; configs semeadas eram ineditáveis pela
   tela (o array `CAMPOS` é fixo) → 3 entradas novas na Task 3; a aba Solicitações não
   mostraria as VINCULADAS (o relatório era só PENDENTE) → relatório passa a IN
   ('PENDENTE','VINCULADO'), mudança movida para o tronco (Task 2); índice novo no livro
   (subselects correlacionados por material).
5. **[Minor acatados]** resumo do estoque-parado calculado sobre a lista COMPLETA (semântica
   congelada); asserts globais dos testes 6/8 por delta/`itemDe` (banco compartilhado);
   `if (sugerida <= 0)` era código morto e a regra correspondente saiu do design; D2 corrigido
   DIZENDO que estava errado (`solicitacoes_compra_itens` existe, mas só grava 'escritorio');
   duas interações existentes declaradas (requisitionStateMachine conta PENDENTE;
   requisitionPurchaseNotifyService já e-maila Compras).
6. **Respostas que o plano deixou em aberto, resolvidas pelo revisor:** `custoUnitarioSql`
   ACEITA alias (usar `custoUnitarioSql('m')`); ordem dos placeholders confere nas duas
   queries; `registrarAuditoria` recebe OBJETO; ALMOXARIFE não tem bypass no gate; aritmética
   do RN-04 conferida; `permissoesRotas` não varre rotas; `minhas-permissoes` expõe a ação
   sozinha; nenhum front colide.

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
    // Etapa 11: janela do consumo medio, regua de material parado e horizonte da solicitacao
    // (RN-01/RN-03/RN-07). Semeadas porque PUT /configuracoes so escreve chave que ja existe
    // (licao da Etapa 10) — e as tres tambem entram no array CAMPOS da tela (Task 3), senao
    // continuam ineditaveis pela UI (Fase 2).
    ['reposicao_janela_consumo_dias', '90', 'Janela (dias) do consumo médio para reposição'],
    ['reposicao_dias_sem_consumo', '180', 'Dias sem saída para material contar como parado/obsoleto'],
    ['reposicao_horizonte_solicitacao_dias', '60', 'Dias em que uma solicitação aberta ainda conta como "a caminho"'],
```

E o **índice** (Fase 2 — as queries novas fazem subselects correlacionados por material sobre
o livro), junto dos outros `CREATE INDEX`/`safeAlter` do schema:

```js
  // Etapa 11: primeiro shape de consulta do modulo com subselect correlacionado por material
  // sobre o livro inteiro (consumo medio, ultima entrada/saida) — sem indice e N x full scan.
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_mov_almox_material_tipo
    ON movimentacoes_almoxarifado (material_id, cancelado, tipo)`);
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
  // saldo_anterior/saldo_posterior sao NOT NULL sem default (Fase 2, Critical 1); nada da
  // reposicao le essas colunas — 0 como fixture, mesmo padrao de materialClienteSeloProprietario.
  await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
      (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, usuario_id, cancelado, created_at)
     VALUES (?,?,?,0,0,1,?, datetime('now', ?))`,
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
   Trocar para `'FECHADO'` (status **inexistente de propósito** — só PENDENTE/VINCULADO são
   escritos no sistema, verificado pela Fase 2; o teste prova o IN-list, e a falta de status
   terminal é exatamente o motivo do horizonte abaixo) → volta a aparecer.
   **E o horizonte (Critical 3 da Fase 2):** voltar o status para `'PENDENTE'` e backdatear
   `UPDATE solicitacoes_compra_almoxarifado SET created_at = datetime('now', '-90 days')
   WHERE id = ?` → o material **volta a aparecer** (solicitação com 90 dias não segura mais a
   posição; horizonte default 60).
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
           ${custoUnitarioSql('m')} AS custo_unitario,
           COALESCE((SELECT SUM(mv.quantidade) FROM movimentacoes_almoxarifado mv
                     WHERE mv.material_id = m.id AND mv.cancelado = 0
                       AND mv.tipo IN (${placeholders})
                       AND mv.created_at >= datetime('now', '-' || ? || ' days')), 0) AS consumo_janela,
           COALESCE((SELECT SUM(sc.quantidade) FROM solicitacoes_compra_almoxarifado sc
                     WHERE sc.material_id = m.id AND sc.status IN ('PENDENTE','VINCULADO')
                       AND sc.created_at >= datetime('now', '-' || ? || ' days')), 0) AS a_caminho
    FROM materiais_almoxarifado m
    LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
    WHERE m.ativo = 1 AND m.proprietario_cliente_id IS NULL`,
    [...TIPOS_SAIDA, janela, horizonte]);
```

(com `const horizonte = await lerConfigNumero(db, 'reposicao_horizonte_solicitacao_dias', 60);`
junto da janela. **Ordem dos placeholders re-contada:** 10 de `TIPOS_SAIDA` + 1 da janela no
subselect de consumo, depois 1 do horizonte no de a_caminho — `[...TIPOS_SAIDA, janela,
horizonte]` = 12. `custoUnitarioSql` ACEITA alias — `custoUnitarioSql('m')`, resposta da
Fase 2.)

```js

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
    let sugerida = alvo - posicao;                                   // sempre > 0 aqui:
    if (r.lote_economico > 0) sugerida = Math.max(sugerida, r.lote_economico);
    // (posicao < ponto <= alvo garante sugerida > 0 — o guard "<= 0" era codigo morto, Fase 2)

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
- Modify: `server/services/almoxarifado/reportService.js` (relatório de solicitações ganha
  VINCULADO — Fase 2, movido do galho para o tronco)
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

1. `RN-09: gera com a quantidade DO SERVIDOR e audita como OBJETO` — material `minima: 5,
   maxima: 20, qtd: 0, custo: 10`; POST `{}` → `criadas` tem `{ material_id, quantidade: 20 }`;
   linha em `solicitacoes_compra_almoxarifado` com `motivo = 'PONTO_REPOSICAO'` e `status =
   'PENDENTE'`; e a auditoria: `SELECT dados_novos FROM auditoria_log_almoxarifado WHERE
   entidade = 'solicitacao_compra' AND entidade_id = ?` → **`JSON.parse(dados_novos).quantidade
   === 20`** (Fase 2: passar string re-serializava e gravava escape em dobro; contar linha não
   pegava — o parse pega).
2. `RN-09: segundo POST sem ids responde vazio-legivel, sem duplicar` — POST `{}` duas vezes:
   a pendência do 1º entra em `a_caminho`, a posição cobre o ponto, o material some da
   sugestão → a 2ª responde `{ criadas: [], puladas: [] }` e COUNT continua 1. (Fase 2,
   Critical 2: era este cenário que o "JA_PENDENTE" do plano original afirmava e nunca poderia
   acontecer.)
3. `RN-09: pendencia INSUFICIENTE gera o COMPLEMENTO` — material `minima: 100, qtd: 0` com
   solicitação PENDENTE de 10 (inserida direto): posição 10 < 100 → ainda sugerido com
   `quantidade_sugerida 90`; POST `{}` cria a segunda solicitação **de 90** (o complemento —
   o dedupe antigo recusaria repor o que falta). COUNT = 2, soma das quantidades = 100.
4. `RN-09: id fora das sugestoes vira SEM_SUGESTAO` — POST `{ material_ids: [999999] }` →
   `puladas` com motivo `SEM_SUGESTAO`, `criadas` vazio. E id de material cuja posição já
   cobre o ponto → mesmo motivo.
5. `RN-09: selecao parcial cria SO os pedidos; lista VAZIA nao cria NADA` — dois materiais
   sugeridos: POST `{ material_ids: [um] }` → 1 criada, o outro segue em GET /sugestoes;
   POST `{ material_ids: [] }` → `{ criadas: [], puladas: [] }` e NENHUMA linha nova (Fase 2:
   "[] = todas" dispararia o catálogo inteiro ao desmarcar tudo).
6. `RN-09: body invalido recusa 400 literal` — `{ material_ids: 'abc' }` e
   `{ material_ids: [1, 'x'] }` → 400 `Lista de materiais inválida`; nada criado.
7. `RN-08: gate — PRODUCAO e ALMOXARIFE 403, COMPRAS 200` (par positivo+negativo).
8. `[CONTROLE] a quantidade do body e IGNORADA` — POST `{ material_ids: [id],
   quantidades: { [id]: 99999 } }` (campo inventado) → a criada tem a quantidade calculada.
9. `relatorio solicitacoes-compra traz PENDENTE e VINCULADO` — criar uma de cada (a VINCULADO
   via rota legada de vincular) → `GET /almoxarifado/relatorios/solicitacoes-compra` traz as
   duas (Fase 2: era só PENDENTE, e a VINCULADO — que esconde o material da sugestão — ficava
   invisível na tela inteira).

`reposicaoEstoqueParado.api.test.js`:

1. `RN-07: excesso = atual > maxima > 0` — `qtd: 100, maxima: 50` → `excesso true`; material
   com `maxima: 0` e qtd alta → `excesso false`.
2. `RN-07: sem_consumo = nenhuma saida ha N dias (ou nunca)` — material com saída há 200 dias
   → `sem_consumo true`; com saída há 10 dias → ausente das flags (ou `sem_consumo false`);
   material que NUNCA saiu → `true`.
3. `RN-07: obsoleto exige tambem nenhuma entrada no periodo` — sem saída há 200 dias e COM
   entrada há 30 → `obsoleto false, sem_consumo true`; sem nada há 200 → `obsoleto true`.
4. `RN-07: filtro por tipo, tipo VAZIO e 400 literal` — `?tipo=EXCESSO` só traz excessos;
   `?tipo=` (string vazia — o "Todos" do select) → **200 com tudo** (Fase 2);
   `?tipo=QUALQUER` → 400 `Tipo inválido (use EXCESSO, SEM_CONSUMO ou OBSOLETO)`.
   E o resumo é da lista COMPLETA: com `?tipo=EXCESSO`, `resumo.sem_consumo` continua contando
   os sem-consumo do estoque inteiro (semântica congelada).
5. `RN-07: valor parado e resumo` — `qtd: 100, custo: 2` → `valor_parado 200`;
   `resumo.valor_parado_total` soma; contadores por flag batem.
6. `RN-07: material de cliente e material zerado ficam fora` — cliente com excesso → ausente;
   `qtd: 0` sem consumo → ausente (a régua é "ocupa prateleira").
7. `RN-08: gate positivo e negativo` (COMPRAS 200 / ALMOXARIFE 403 / PRODUCAO 403).

- [ ] **Step 2: rodar e ver falhar.**

- [ ] **Step 3: implementação**

**(a) `gerarSolicitacoesDaSugestao`** em `purchaseService.js`:

```js
// RN-09 (reescrita pela Fase 2): o servidor calcula, o cliente so escolhe QUAIS materiais —
// ausente = todas as sugestoes do momento; [] = NENHUMA (desmarcar tudo nao dispara o
// catalogo). NAO ha dedupe aqui: a pendencia entra em a_caminho (RN-03), entao material
// coberto nem e sugerido, e pendencia INSUFICIENTE gera o COMPLEMENTO (a quantidade sugerida
// ja desconta o que esta a caminho) — recusar seria negar reposicao a material que continua
// faltando. O dedupe por PENDENTE segue existindo SO no legado verificar-minimos (D10).
async function gerarSolicitacoesDaSugestao(db, usuario, materialIds) {
  const sugestao = await calcularSugestoes(db);
  const porMaterial = new Map();
  for (const g of sugestao.fornecedores) for (const i of g.itens) porMaterial.set(i.material_id, i);

  const alvos = Array.isArray(materialIds) ? materialIds : [...porMaterial.keys()];

  const criadas = []; const puladas = [];
  for (const materialId of alvos) {
    const item = porMaterial.get(materialId);
    if (!item) { puladas.push({ material_id: materialId, motivo: 'SEM_SUGESTAO' }); continue; }
    const r = await dbRun(db, `INSERT INTO solicitacoes_compra_almoxarifado
        (material_id, quantidade, motivo) VALUES (?,?,'PONTO_REPOSICAO')`,
      [materialId, item.quantidade_sugerida]);
    // dados_novos como OBJETO — audit.js serializa; string aqui viraria escape em dobro
    // (Fase 2, verificado nos 11 chamadores reais).
    await registrarAuditoria(db, {
      entidade: 'solicitacao_compra', entidade_id: r.lastID, acao: 'CRIAR',
      usuario_id: usuario.id, usuario_nome: usuario.nome || usuario.email,
      dados_novos: { material_id: materialId, quantidade: item.quantidade_sugerida, motivo: 'PONTO_REPOSICAO' },
    });
    criadas.push({ material_id: materialId, solicitacao_id: r.lastID, quantidade: item.quantidade_sugerida });
  }
  return { criadas, puladas };
}
```

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

  const todos = rows.map((r) => {
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

  // Resumo sobre a lista COMPLETA, antes do filtro por tipo e do teto (semantica congelada
  // pela Fase 2): o resumo e o retrato do estoque parado inteiro; `itens` e a janela.
  const resumo = {
    excesso: todos.filter((i) => i.excesso).length,
    sem_consumo: todos.filter((i) => i.sem_consumo).length,
    obsoleto: todos.filter((i) => i.obsoleto).length,
    valor_parado_total: Number(todos.reduce((s, i) => s + i.valor_parado, 0).toFixed(2)),
  };

  let itens = todos;
  if (tipo) {
    const chave = { EXCESSO: 'excesso', SEM_CONSUMO: 'sem_consumo', OBSOLETO: 'obsoleto' }[tipo];
    itens = itens.filter((i) => i[chave]);
  }
  itens.sort((a, b) => b.valor_parado - a.valor_parado);
  itens = itens.slice(0, 500);

  return { dias_sem_consumo: dias, itens, resumo };
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
      // `tipo` VAZIO e o "Todos" do select da tela — trata como ausente, nao como erro
      // (Fase 2: `?tipo=` tomava 400 e a propria tela nova quebrava).
      if (tipo && !['EXCESSO', 'SEM_CONSUMO', 'OBSOLETO'].includes(tipo)) {
        return res.status(400).json({ error: 'Tipo inválido (use EXCESSO, SEM_CONSUMO ou OBSOLETO)' });
      }
      res.json(await purchaseService.estoqueParado(db, tipo || undefined));
    } catch (e) { handleError(res, e); }
  });
```

**(d) `reportService.relatorioSolicitacoesCompraPendentes`** — trocar `WHERE s.status =
'PENDENTE'` por `WHERE s.status IN ('PENDENTE','VINCULADO')`, com comentário: a VINCULADA é
exatamente a que esconde o material da sugestão (a_caminho conta as duas) e ficava invisível
na tela inteira (Fase 2). Manter o nome da função (renomear tocaria o dispatcher à toa) e
anotar no comentário que o nome ficou histórico.

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
  `/almoxarifado/sobras` (lazyModules linha ~156/207, App.js ~111/495, Layout). **E as três
  configs novas entram no array `CAMPOS` de `ConfiguracoesAlmoxarifado.js`** (Fase 2: a tela
  renderiza lista fixa — chave fora dela é ineditável pela UI):
  `reposicao_janela_consumo_dias` (label `Janela do Consumo Médio (dias)`),
  `reposicao_dias_sem_consumo` (label `Dias Sem Consumo (estoque parado)`),
  `reposicao_horizonte_solicitacao_dias` (label `Horizonte da Solicitação (dias)`), tipo
  number, descrições do design — com um teste RTL de que os três campos aparecem e entram no
  payload do salvar (modificar também `ConfiguracoesAlmoxarifado.test.js` se existir; senão,
  cobrir no teste da tela nova? NÃO — campo de outra tela se testa na tela dela; se não houver
  arquivo de teste, criar um mínimo só para os campos novos).

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
7. POST `{}` de novo → `{ criadas: [], puladas: [] }` (M1 coberto pela pendência não é
   sugerido — resposta vazia-legível, comportamento congelado pela Fase 2); e POST
   `{ material_ids: [M1] }` → `puladas: [{ motivo: 'SEM_SUGESTAO' }]`. COUNT de solicitações
   continua 1.
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

## Execução — estado final (2026-08-24, etapa FECHADA)

| Task | Estado | Hash | Divergências do plano |
|---|---|---|---|
| 1 | ✅ | `7f04e42` + fix `cd83b1e` | 0 desvios do implementer (caiu no limite de sessão e foi retomado do zero com árvore verificada). Revisão: 17 sabotagens, 9 passavam; 1 **Critical de regra** — a RN-02 como desenhada fazia prazo preenchido ESCONDER material do alerta; a mínima virou o chão de todas as réguas (design corrigido dizendo que estava errado) |
| 2 | ✅ | `21dde5e` + fix `eec45b8` | 0 desvios; revisão achou 2 Important de escrita medidos (fantasma de quantidade 0 por resíduo de float; ids repetidos multiplicando) + resumo congelado sem teste |
| 3 | ✅ | `a65e501` + fix `8a7208c`, merge `5b861ec` | Revisão: 5 Important (4 sabotagens de célula verdes — G4 de novo; POST default sem teste; geração em massa sem confirm; 403 mudo; resumo sem rótulo) — todos re-provados vermelhos |
| 4 | ✅ | `4574963` | 0 desvios; sem revisor dedicado (test-only + controle positivo real, precedente das etapas anteriores); sabotagem derrubou o passo 6 + 2 testes unitários |
| Final | ✅ | `95fb25b` (backend) + `1ea6ab2` (front) | Revisão final com 2 revisores MEDINDO: B (costura) 1 Critical (403 virava "não há nada a comprar") + 4 Important; A (backend) 0 Critical + 3 Important (duplicação em dobro legado×novo com o design afirmando o contrário; riscos_parada zerando no clique; horizonte ausente na máquina de requisição). O agente do front caiu por conexão e foi retomado do disco |
| 5 | ✅ | commits de fechamento | — |

## Próxima tarefa detalhada — Etapa 12 (notificações completas, features 19 + 20)

- **Specs:** `specs/modulo-almoxarifado/19-emails-notificacoes/README.md` e
  `specs/modulo-almoxarifado/20-alertas/README.md` — ler as duas ANTES de desenhar; o mapa diz
  "sem fila/cobertura total" e "2 de ~20 alertas".
- **A fila de dívidas que as etapas alimentaram** (grep "feature 19" e "feature 20" no
  novidades): e-mail de sucateamento (9), lembrete de devolução de ferramenta com função
  pronta sem canal (9b, item B7), e-mail do resultado de inventário (10/10b), e-mail de
  sugestão/solicitação de compra (11), alerta de risco de parada com canal (11, D8), estado
  parcial da devolução-sucata sem notificação (7).
- **O que já existe e NÃO reabrir:** `alertService` (máquina ACIMA/ABAIXO com debounce,
  e-mail+WhatsApp, histórico) — é o modelo de canal; `requisitionPurchaseNotifyService`
  (e-mail a Compras por requisição sem estoque); SMTP hardcoded é **decisão do dev** (não
  mexer sem confirmação — CLAUDE.md).
- **Pontos de atenção:** fila com retry/dedupe/histórico é infra nova — decidir tabela própria
  vs reuso do histórico de alertas; B11/B14 continuam abertas (não construir aprovação nem
  cancelamento sobre elas); horizonte/configs da 11 são o precedente de config validada nos
  dois lados.

## Retro (fechamento)

Quarta etapa completa sob a skill (9b, 10, 10b, 11). Base da 10b: 5 rodadas de fix, 42 achados
reais/0 ruído, 1 par paralelo sem retrabalho.

**1. Rodadas de correção até verde.** 5: uma por task (T1–T3) e uma onda final em duas partes
(backend + front). Nenhuma bateu o limite de 3 rodadas na mesma falha.

**2. Achados reais vs. ruído.** Fase 2: 15 reais / 1 ruído (a "árvore suja" era snapshot velho
— primeiro ruído em quatro etapas). Revisões de task: T1 1 Critical de regra + 4 buracos; T2
2 Important + 1 semântica; T3 5 Important; T4 sem revisor. Revisão final: 1 Critical + 7
Important + ~11 Minor, 0 ruído. **Total ≈ 47 achados reais / 1 ruído.** Padrão consolidado: os
três achados mais graves da etapa (regra do chão da mínima, duplicação em dobro, 403-vira-vazio)
vieram de revisores **instruídos a medir com probe** — quarta etapa seguida em que rodar vale
mais que argumentar.

**3. Paralelismo de fato.** Um par real (T3 worktree × T4 árvore principal), zero conflito,
merge limpo. **Resiliência nova medida:** dois agentes morreram no meio (limite de sessão na
T1, queda de conexão no fix do front) e os dois foram **retomados do disco sem perda** — o
estado em ledger/plano/commits pagou o custo que ele existe para pagar.

**4. Defeito que escapou.** Nenhum descoberto após o fechamento (preencher na próxima etapa).
Para vigiar: a dupla contagem de caminhos de compra (item C9 do novidades) até o Compras
ganhar o elo; e o quinto leitor privado de config (`lerConfigNumero`) — se aparecer um sexto,
unificar.

## Self-review do plano (feito na escrita)

- **Cobertura do design:** RN-01..06+08 → Task 1; RN-07+09 → Task 2; tela → Task 3; composição
  → Task 4. D1..D11 são cortes/decisões → documentação (Task 5).
- **Tipos consistentes:** `calcularSugestoes`/`gerarSolicitacoesDaSugestao`/`estoqueParado` e
  os shapes batem entre Tasks 1/2 (produtor), 3 (consumidor via HTTP) e 4 (jornada).
- **Armadilhas nomeadas:** assinatura de `custoUnitarioSql` (alias?) a conferir no código;
  status reais de `solicitacoes_compra_almoxarifado`; passo 7 da jornada afirma o
  comportamento REAL do dedupe (JA_PENDENTE vs SEM_SUGESTAO quando a posição já cobre);
  backdate de movimentação só em teste; `registrarAuditoria` com os campos do padrão real.
