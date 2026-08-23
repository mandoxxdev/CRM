# Etapa 10 — Inventário avançado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a lacuna nomeada há três etapas — o ajuste de inventário grava saldo por FORA do
motor de estoque, sem validação nenhuma — roteando a conclusão da conferência pelo motor com um
tipo dedicado (`AJUSTE_INVENTARIO`), decidindo de vez o que fazer quando o ajuste bateria de
frente com retenção (B1/B2/B3 do doc de novidades), e entregando contagem cega + tolerância com
recontagem.

**Architecture:** Nenhuma tabela nova. Três colunas por `safeAlter`/DDL direto (schema ainda não
versionado em produção — `CREATE TABLE IF NOT EXISTS`, então `ALTER` é o caminho para as tabelas
já existentes: `conferencias_almoxarifado.modo_cego`, `conferencias_almoxarifado.tolerancia_percentual`,
`itens_conferencia_almoxarifado.recontado`). Um tipo de movimento novo, dedicado, que reusa a
semântica de `AJUSTE` (valor absoluto) já implementada em `stockService.js`. A guarda de retenção
nova mora em UM lugar (`stockService.js`, reusando `COLUNAS_RETENCAO` de `availabilitySql.js`) e
vale para os dois tipos de ajuste ao mesmo tempo — nenhuma segunda fonte.

**Tech Stack:** Express + SQLite (`safeAlter`), Zod não entra nesta etapa (as rotas de
conferência nunca tiveram — ver Task 2, D-decisão de manter validação manual como já é, não
inflar escopo abrindo uma frente nova de Zod numa etapa sobre outra coisa), React CRA.

**Spec:** `docs/superpowers/specs/2026-08-22-almoxarifado-etapa10-inventario-avancado-design.md`
— **RN-01..RN-10** (inclui RN-06b/RN-06c, acrescentadas na Fase 2) e a tabela de contratos
congelados valem como requisito de cada task.

## Global Constraints

- Branch: `desenvolvimento-almoxarifado`. Um commit por task, português sem acento, explicando
  **por quê**. Nunca `git add -A` — pathspec explícito.
- Testes: `cd server && npm run test:api` (só descobre `server/tests/api/*.api.test.js`, runner
  próprio por arquivo). Harness `tests/helpers/testApp.js`, `requirePermission` real. Client:
  `cd client && CI=true npx react-scripts test --watchAll=false` + build `CI=true`.
- **Todo teste novo com controle positivo** — quebrar de propósito e confirmar o vermelho antes
  de restaurar.
- DDL só em `services/almoxarifado/schema.js`, via `safeAlter` para colunas em tabela existente.
- **Overnight:** nunca esperar input; decisão ambígua → caminho reversível + registro na letra B
  de `docs/almoxarifado-novidades-por-etapa.md`; ao fim de CADA task, marcar este plano com o
  estado real; mesmo teste falhando 3 rodadas → parar e reportar aqui.

## Fase 2 — revisão adversarial do plano (2026-08-22, ANTES do dispatch)

Agente fresco (opus) revisou design + plano contra o código real: **10 achados, todos
acatados**, nenhum ruído. Os que quebrariam a execução: a guarda de RN-06 do jeito que o plano
descrevia pegava TAMBÉM o ajuste com localização (o branch de `saldoPosterior` em
`stockService.js` não distinguia — corrigido para checar `!localizacao_destino_id`); o próprio
teste de exemplo da Task 1 quebraria contra a checagem real de `REGRAS_VINCULO` (`AJUSTE` exige
`justificativa`, o teste não mandava — corrigido, e `AJUSTE_INVENTARIO` passou a exigir
justificativa também, RN-06b nova); dois testes REAIS já existentes ficariam vermelhos sem
previsão nenhuma (`devolucaoVinculo.api.test.js` monta de propósito o cenário "bloqueado > total"
que RN-06 agora recusa; `permissoesRotas.api.test.js` tem um helper de conferência com
divergência de 95% sem tolerância configurada, que RN-05 passa a bloquear) — os dois entram como
correção explícita na Task 1/Task 2, não como surpresa da suíte; o caminho principal da etapa
deixava **B3 sem resolver de verdade** (`quantidade_contada` sozinho, sem somar de volta
`quantidade_em_terceiros`, evapora a retenção em terceiros ao aplicar — RN-06c nova, é o próprio
motivo da etapa existir); o design prometia uma mensagem de recusa que a Task 1 implementava
diferente e a Task 2/3 citavam uma terceira — o mesmo padrão **G4** que a revisão final da 9b já
tinha achado (mensagem única congelada agora, RN-06/contratos); o design prometia 403 para
material de cliente e o plano devolvia 400 — resolvido com regra de prioridade explícita (RN-07);
a Task 2 mandava "duplicar a checagem de retenção" no mesmo parágrafo em que D1 proibia duplicar
— resolvido extraindo uma função PURA exportada, chamada duas vezes (não reimplementada duas
vezes) — e a chamada dupla de `assertAjustePermitido` (que audita) foi trocada por uma checagem
leve na pré-validação, deixando a auditoria real só na aplicação; `transformService.js`, citado
como precedente, não existe — o precedente real é `thirdPartyService.registrarTransformacao`;
`AJUSTE_INVENTARIO` ficava cancelável em silêncio (sem ramo em `cancelarMovimentacao`) — RN-10/D11
novas, recusa explícita como `REMESSA_TERCEIRO`. Achados menores acatados: `CAMINHO_TIPO_DEDICADO`
sem entrada para o tipo novo (mensagem de erro genérica errada); `TIPOS_ISENTOS_DONO` sem entrada
declarativa; fallback de tolerância com `||` comendo o valor `0`; asserção vazia na Task 4 por
material sem custo; fórmula de tolerância duplicada no front (servidor agora devolve
`recontagem_necessaria` pronta); resposta do `POST /conferencias` não ecoando os campos novos;
import de `custoUnitarioSql` faltando; localização do bloco `safeAlter` no schema. Correções
aplicadas no design e neste plano em 2026-08-22 — contar na retro como 10 reais / 0 ruído.

## Sort topológico (tronco/galho)

| Task | Tema | Classe |
|---|---|---|
| 1 | Motor: tipo `AJUSTE_INVENTARIO`, guarda de retenção (RN-06), colunas novas | **tronco** |
| 2 | Rota da conferência: criar (modo_cego/tolerância), contar (RN-03/04), concluir (RN-02/05/07/08) via motor | **tronco** |
| 3 | Front: `ConferenciaEstoque.js` contra o contrato congelado | galho (worktree própria, paralelo após Task 2 commitar) |
| 4 | Integração cruzando galhos (`conferenciaAjusteMotor.api.test.js`) | fase 4 — depois do merge |
| 5 | Fechamento: skill `fechar-etapa` + retro de 4 números | fase 6 |

**Por que só duas tasks de tronco backend, e não uma por RN como na Etapa 9b:** as nove RN desta
etapa vivem em DUAS rotas (`POST/PUT/GET /conferencias*`) e UM branch do motor
(`stockService.registrarMovimentacao`, tipo Ajuste) — dividir em mais tasks criaria dependência
sequencial artificial entre elas (a Task 2 não compila sem o tipo que a Task 1 cria). É o mesmo
critério de tronco da skill: se um erro de interpretação numa exigiria retrabalho na outra, não
são independentes.

---

### Task 1: Motor — tipo `AJUSTE_INVENTARIO` e guarda de retenção (tronco)

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (`TIPOS_MOVIMENTO`, `TIPOS_DEDICADOS`,
  colunas novas por `safeAlter` — o bloco de `safeAlter` desta tabela já existe em
  `schema.js:1688-1693`, acrescentar ao lado, NÃO junto do `CREATE TABLE` de `:312-335`)
- Modify: `server/services/almoxarifado/stockService.js` (`tiposAjuste`,
  `motivoRecusaAjustePorRetencao` nova função exportada, guarda de retenção, ramo novo em
  `cancelarMovimentacao`)
- Modify: `server/services/almoxarifado/ownerRules.js` (`TIPOS_AJUSTE_DONO`, `TIPOS_ISENTOS_DONO`)
- Modify: `server/services/almoxarifado/movementRules.js` (`REGRAS_VINCULO.AJUSTE_INVENTARIO`)
- Modify: `server/services/almoxarifado/schemas.js` (`CAMINHO_TIPO_DEDICADO`)
- Modify: `server/tests/api/devolucaoVinculo.api.test.js` (achado da Fase 2: o par
  BLOQUEIO(8)/AJUSTE(1) que o teste monta de propósito passa a ser recusado por RN-06 — inverter
  a ordem para AJUSTE(1) primeiro, BLOQUEIO(8) depois, preservando o que o teste mede)
- Test: `server/tests/api/ajusteRetencao.api.test.js`

**Interfaces (Produces):**
- `TIPOS_MOVIMENTO` ganha `'AJUSTE_INVENTARIO'`; `TIPOS_DEDICADOS` idem (rota genérica de
  Movimentações nunca aceita — via `MovimentacaoSchema`/`CAMINHO_TIPO_DEDICADO`,
  `schemas.js:58-81`); `TIPOS_AJUSTE_DONO`/`TIPOS_ISENTOS_DONO` (`ownerRules.js`) idem;
  `REGRAS_VINCULO.AJUSTE_INVENTARIO = { vinculo: 'nenhum', justificativa: true }` — MESMA
  exigência que `AJUSTE` já tem, não um caso novo.
- `stockService.motivoRecusaAjustePorRetencao(material, novoTotal)` → `string | null` — função
  PURA, sem I/O, exportada. `registrarMovimentacao` a chama no branch de ajuste sem localização;
  a Task 2 a importa direto para a pré-validação de RN-07 (mesma fórmula, duas chamadas — D1 do
  design proíbe reescrever a fórmula, não reusar a função).
- Colunas novas: `conferencias_almoxarifado.modo_cego INTEGER DEFAULT 0`,
  `conferencias_almoxarifado.tolerancia_percentual REAL`,
  `itens_conferencia_almoxarifado.recontado INTEGER DEFAULT 0`. A coluna
  `conferencias_almoxarifado.justificativa_ajuste` **já existe** (`schema.js:1693`, nunca usada
  até agora) — RN-06b passa a gravá-la de verdade.
- Config nova (chave em `configuracoes_almoxarifado`, sem linha obrigatória —
  `tolerancia_inventario_percentual`, lida via `stockService.getConfig`, default `2` quando
  ausente/vazia/não-numérica — a leitura do default fica na Task 2, aqui só a tabela aceita a
  chave).

- [ ] **Step 1: Teste falhando** — `tests/api/ajusteRetencao.api.test.js` (copiar o esqueleto de
  runner de `saldoEmTerceiros.api.test.js`):

```js
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

// runner test()/passed/failed identico aos outros arquivos da suite

test('RN-06: AJUSTE que deixaria bloqueado > total e recusado', async () => {
  const { db, close } = await createTestApp();
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, quantidade_bloqueada, ativo) VALUES
    ('MAT-BLQ', 'Material bloqueado', 'UN', 10, 8, 1)`);
  const materialId = r.lastID;
  await assert.rejects(
    // AJUSTE exige justificativa por REGRAS_VINCULO (achado da Fase 2 — sem isto o motivo do
    // 400 seria "AJUSTE exige justificativa", nao a guarda de retencao, e o assert do
    // regex/mensagem abaixo estouraria dentro do proprio validador do assert.rejects).
    stockService.registrarMovimentacao(db, { id: 1, nome: 'Teste' },
      { material_id: materialId, tipo: 'AJUSTE', quantidade: 5, motivo: 'contagem', justificativa: 'inventario' }),
    (err) => {
      assert.strictEqual(err.status, 400);
      assert.ok(/bloqueada/.test(err.message) && /8/.test(err.message), err.message);
      return true;
    });
  const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [materialId]);
  assert.strictEqual(m.quantidade_atual, 10, 'ajuste recusado nao pode ter mudado o saldo');
  await close();
});

test('RN-06: AJUSTE_INVENTARIO tem a MESMA guarda (nao e segunda implementacao)', async () => {
  const { db, close } = await createTestApp();
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, quantidade_em_terceiros, ativo) VALUES
    ('MAT-TER', 'Material em terceiros', 'UN', 20, 15, 1)`);
  const materialId = r.lastID;
  await assert.rejects(
    stockService.registrarMovimentacao(db, { id: 1, nome: 'Teste' },
      { material_id: materialId, tipo: 'AJUSTE_INVENTARIO', quantidade: 10, motivo: 'conferencia', justificativa: 'conferencia INV-1' }),
    (err) => { assert.strictEqual(err.status, 400); return true; });
  await close();
});

test('[CONTROLE POSITIVO] AJUSTE_INVENTARIO para valor >= retencao total passa normalmente', async () => {
  const { db, close } = await createTestApp();
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, quantidade_reservada, ativo) VALUES
    ('MAT-OK', 'Material ok', 'UN', 10, 3, 1)`);
  const materialId = r.lastID;
  const res = await stockService.registrarMovimentacao(db, { id: 1, nome: 'Teste' },
    { material_id: materialId, tipo: 'AJUSTE_INVENTARIO', quantidade: 3, motivo: 'conferencia', justificativa: 'conferencia INV-1' });
  assert.ok(res.id, 'ajuste valido tem de passar e devolver a movimentacao');
  const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [materialId]);
  assert.strictEqual(m.quantidade_atual, 3);
  await close();
});

test('AJUSTE COM localizacao continua passando mesmo com retencao (guarda so no branch SEM localizacao)', async () => {
  // achado 1 da Fase 2: no codigo real (stockService.js:726-727) o branch de saldoPosterior nao
  // distinguia com/sem localizacao — sem o qualificador, este teste cairia (a guarda recusaria
  // uma contagem por endereco legitima). Prova o D1/D7 do design: a guarda de retencao NAO se
  // aplica ao ajuste com localizacao (fora do escopo desta etapa).
  const { db, close } = await createTestApp();
  // precedente exato: ajusteLocalizacao.api.test.js:28 — colunas sao codigo/descricao, nao "tipo"
  const loc = await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('LOC-1', 'Prateleira 1')`);
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, quantidade_reservada, ativo) VALUES
    ('MAT-LOC', 'Material com localizacao', 'UN', 10, 8, 1)`);
  const materialId = r.lastID;
  // ajuste de uma linha de localizacao para 2 (abaixo da retencao 8) tem de PASSAR: a guarda de
  // retencao nao olha para este branch de proposito.
  const res = await stockService.registrarMovimentacao(db, { id: 1, nome: 'Teste' },
    { material_id: materialId, tipo: 'AJUSTE', quantidade: 2, localizacao_destino_id: loc.lastID, justificativa: 'contagem por localizacao' });
  assert.ok(res.id, 'ajuste com localizacao nao pode ser barrado pela guarda de retencao (fora do escopo)');
  await close();
});

test('AJUSTE_INVENTARIO nao e aceito pela rota generica de Movimentacoes (tipo dedicado)', async () => {
  const { app, db, close } = await createTestApp();
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, ativo) VALUES ('MAT-DED', 'Material', 'UN', 10, 1)`);
  const request = require('supertest');
  const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: r.lastID, tipo: 'AJUSTE_INVENTARIO', quantidade: 5, motivo: 'x', justificativa: 'x' });
  assert.strictEqual(res.status, 400);
  await close();
});

test('material de cliente com divergencia exige ajustar_material_cliente (Etapa 8, decisao 7)', async () => {
  const { db, close } = await createTestApp();
  // clientes usa razao_social, nao nome (achado ao verificar o schema antes do dispatch)
  const cli = await dbRun(db, `INSERT INTO clientes (razao_social) VALUES ('Cliente Teste LTDA')`);
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, proprietario_cliente_id, ativo) VALUES
    ('MAT-CLI', 'Material cliente', 'UN', 10, ?, 1)`, [cli.lastID]);
  await assert.rejects(
    stockService.registrarMovimentacao(db, { id: 9, nome: 'Gestor', perfil_almoxarifado: 'GESTOR' },
      { material_id: r.lastID, tipo: 'AJUSTE_INVENTARIO', quantidade: 8, motivo: 'conferencia', justificativa: 'conferencia INV-1' }),
    (err) => { assert.strictEqual(err.status, 403); return true; });
  await close();
});

test('AJUSTE_INVENTARIO nao e cancelavel pela rota generica (RN-10)', async () => {
  const { app, db, close } = await createTestApp();
  const request = require('supertest');
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, ativo) VALUES ('MAT-CANC', 'Material', 'UN', 10, 1)`);
  const mov = await stockService.registrarMovimentacao(db, { id: 1, nome: 'Teste' },
    { material_id: r.lastID, tipo: 'AJUSTE_INVENTARIO', quantidade: 7, motivo: 'conferencia', justificativa: 'conferencia INV-1' });
  // CancelamentoSchema exige `motivo` (schemas.js:139-141) — mandar preenchido, senao o 400
  // provaria o Zod, nao a recusa de RN-10 que este teste existe para cobrir.
  const res = await request(app).post(`/api/almoxarifado/movimentacoes/${mov.id}/cancelar`).send({ motivo: 'engano' });
  assert.strictEqual(res.status, 400);
  assert.ok(/nova conferência/.test(res.body.error), res.body.error);
  await close();
});
```

- [ ] **Step 2: Rodar e ver falhar** — `AJUSTE_INVENTARIO` não existe em `TIPOS_MOVIMENTO`
  (`"Tipo de movimento inválido"`); a guarda de retenção não existe (o primeiro teste passaria
  DO JEITO ERRADO — o ajuste seria aceito — por isso o assert de saldo inalterado é quem prova).
- [ ] **Step 3: Implementar.**

Em `schema.js`, junto de `TIPOS_MOVIMENTO` (perto de `'AJUSTE'`, comentário citando a Etapa):

```js
  // Etapa 10: o ajuste que a conclusao da conferencia de inventario emite. Semantica IDENTICA a
  // AJUSTE (valor absoluto, ver stockService) — tipo SEPARADO so para poder ser DEDICADO
  // (TIPOS_DEDICADOS abaixo): a rota generica de Movimentacoes nunca aceita, so a conclusao da
  // conferencia (routes/almoxarifado.js) chama o motor direto com este tipo. Resolve a lacuna
  // nomeada desde a Etapa 7/8/8b (docs/almoxarifado-novidades-por-etapa.md, itens B1-B3): o
  // ajuste da conferencia passa a ter a MESMA guarda de retencao do AJUSTE avulso, em vez de
  // gravar por fora do motor sem validacao nenhuma.
  'AJUSTE_INVENTARIO',
```

(inserir na lista, próximo de `'AJUSTE'`). E em `TIPOS_DEDICADOS`:

```js
const TIPOS_DEDICADOS = ['DEVOLUCAO_CLIENTE', 'PERDA_TERCEIRO', 'CONSUMO_TERCEIRO',
  'RETORNO_TRANSFORMACAO', 'ENTRADA_RETALHO', 'SUCATA', 'AJUSTE_INVENTARIO'];
```

Colunas novas, no bloco de `safeAlter` já existente para esta tabela (`schema.js:1688-1693`):

```js
  await safeAlter(db, "ALTER TABLE conferencias_almoxarifado ADD COLUMN modo_cego INTEGER DEFAULT 0");
  await safeAlter(db, "ALTER TABLE conferencias_almoxarifado ADD COLUMN tolerancia_percentual REAL");
  await safeAlter(db, "ALTER TABLE itens_conferencia_almoxarifado ADD COLUMN recontado INTEGER DEFAULT 0");
```

Em `movementRules.js`, junto de `AJUSTE` (achado da Fase 2 — sem isto, `ownerRules.js:166-168`
mente ao afirmar que todo `AJUSTE*` exige justificativa, e a auditoria de material de cliente
grava `justificativa: null` para o tipo novo):

```js
  AJUSTE_INVENTARIO: { vinculo: 'nenhum', justificativa: true },
```

Em `ownerRules.js`, DUAS listas (achado da Fase 2 — `TIPOS_ISENTOS_DONO` é declarativa, entrar
nela documenta a ausência de efeito em vez de deixar parecer esquecimento):

```js
const TIPOS_AJUSTE_DONO = ['AJUSTE', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'AJUSTE_INVENTARIO'];
// ... e, junto de TIPOS_ISENTOS_DONO (perto de AJUSTE_POSITIVO/RETORNO_TRANSFORMACAO/ENTRADA_RETALHO):
//   AJUSTE_INVENTARIO — nao e saida (nao entra em TIPOS_SAIDA_COM_DONO), entao assertSaidaPermitida
//   sai cedo de qualquer forma; entra aqui so para a ausencia ser LIDA, nao presumida.
```

Em `schemas.js`, `CAMINHO_TIPO_DEDICADO` (achado da Fase 2 — sem entrada, a rota genérica devolve
a mensagem genérica errada, "vá em Reservas ou Inspeções", regressão do que a Etapa 9 já
corrigiu para os outros tipos dedicados):

```js
  AJUSTE_INVENTARIO: 'a tela de Inventário (conclua uma conferência com ajustes aplicados)',
```

Em `stockService.js`, a lista de tipos-ajuste (linha ~533):

```js
  const tiposAjuste = ['AJUSTE', 'AJUSTE_INVENTARIO'];
```

Uma função pura nova, perto de `getSaldoDisponivel` (não dentro de `registrarMovimentacao` — tem
de ser importável pela Task 2 sem chamar o motor inteiro):

```js
/**
 * RN-06 (Etapa 10): decide, para as tres instancias registradas desde a Etapa 7
 * (docs/almoxarifado-novidades-por-etapa.md, itens B1-B3), o que o Ajuste faz quando o novo
 * total ficaria menor que alguma retencao. Escolhida a opcao (b) das tres possiveis: nunca
 * aceitar — um ajuste que deixaria o disponivel negativo e inconsistencia interna dos dados
 * (bloqueei/reservei/mandei pra terceiro mais do que digo que existe), categoria diferente de
 * "aceito vender mais do que tenho fisicamente" (permite_saldo_negativo, que NAO bypassa esta
 * guarda de proposito).
 *
 * FUNCAO PURA — sem I/O, sem throw. So se aplica ao ajuste SEM localizacao: com localizacao o
 * novo total so e conhecido depois do syncMaterialTotals somar todas as linhas — verificar a
 * retencao contra um total ainda-nao-existente fica fora do escopo desta etapa (D1/D7 do
 * design). Exportada para a rota da conferencia (Task 2) poder pre-validar VARIOS itens antes
 * de aplicar qualquer um (RN-07, tudo-ou-nada) SEM reescrever esta formula — D1 do design proibe
 * duplicar a formula, nao proibe chamar esta funcao duas vezes.
 *
 * @returns {string|null} mensagem de recusa, ou null se o ajuste pode prosseguir.
 */
function motivoRecusaAjustePorRetencao(material, novoTotal) {
  const retido = COLUNAS_RETENCAO.reduce((soma, col) => soma + (material[col] || 0), 0);
  if (novoTotal >= retido) return null;
  const LABELS = {
    quantidade_reservada: 'reservada', quantidade_bloqueada: 'bloqueada',
    quantidade_em_inspecao: 'em inspeção', quantidade_em_terceiros: 'em terceiros',
  };
  const partes = COLUNAS_RETENCAO
    .filter((col) => (material[col] || 0) > 0)
    .map((col) => `${LABELS[col]}: ${material[col]}`);
  return `Ajuste para ${novoTotal} ${material.unidade} deixaria o disponível negativo `
    + `(${partes.join(', ')}, mínimo aceitável: ${retido} ${material.unidade}). Resolva a `
    + 'retenção antes de ajustar para menos, ou ajuste para um valor maior ou igual ao mínimo.';
}
```

E o uso dela, **no branch de ajuste SEM localização** (linha ~726-727 — é o
`saldoPosterior = parseFloat(quantidade)`; a guarda entra ANTES dessa atribuição, para lançar
antes de qualquer efeito). **Atenção ao achado 1 da Fase 2:** esse branch, no código real, NÃO
distingue com/sem localização — o qualificador `&& !localizacao_destino_id` é obrigatório, senão
a guarda recusa contagens por endereço legítimas:

```js
  } else if (tiposAjuste.includes(tipo) && !localizacao_destino_id) {
    const motivoRecusa = motivoRecusaAjustePorRetencao(material, parseFloat(quantidade));
    if (motivoRecusa) throw Object.assign(new Error(motivoRecusa), { status: 400 });
    saldoPosterior = parseFloat(quantidade);
  } else if (tiposAjuste.includes(tipo)) {
    // AJUSTE/AJUSTE_INVENTARIO COM localizacao: comportamento de sempre, guarda de retencao
    // fora do escopo desta etapa (D1/D7 do design) — o branch original de :726-727 muda de
    // lugar para aqui embaixo, sem nenhuma alteracao de comportamento.
    saldoPosterior = parseFloat(quantidade);
```

Exportar `motivoRecusaAjustePorRetencao` em `module.exports` (junto de `getSaldoDisponivel`).

Por fim, em `cancelarMovimentacao` (achado 10 da Fase 2 — perto de `:1601`, onde
`mov.tipo === 'AJUSTE'` já tem ramo funcional; `AJUSTE_INVENTARIO` cai fora do `if`-chain inteiro
sem isto, virando cancelável em silêncio sem reverter nada, mesma classe de "assimetria
silenciosa" que os comentários do arquivo já descrevem):

```js
  } else if (mov.tipo === 'AJUSTE_INVENTARIO') {
    // RN-10/D11 (Etapa 10): AJUSTE_INVENTARIO representa uma contagem fisica HOMOLOGADA — nao
    // e um delta que faz sentido reverter para saldo_anterior (AJUSTE comum ja faz isso no ramo
    // acima; este e NOVO de proposito, nao reusa aquele ramo). Recusa explicita, mesmo
    // precedente de REMESSA_TERCEIRO (linha ~1401): o caminho de correcao e uma contagem nova.
    throw Object.assign(new Error(
      'Ajuste de inventário não pode ser estornado por aqui — o caminho de correção é uma '
      + 'nova conferência de inventário.'), { status: 400 });
```

- [x] **Step 3b: Corrigir o teste existente que a Fase 2 achou (faz parte desta task, não da
  Task 4):**
  - `server/tests/api/devolucaoVinculo.api.test.js:634-638` — o par `BLOQUEIO(8)` seguido de
    `AJUSTE(1)` passa a ser recusado por RN-06 (o teste conta com o estado ruim "bloqueado > total"
    para provar outra coisa mais abaixo). Inverter a ordem: `AJUSTE(1)` primeiro, `BLOQUEIO(8)`
    depois — o ramo `BLOQUEIO` (`stockService.js:735-737`) não checa disponível, então o cenário
    "bloqueado > total" continua alcançável, só por outro caminho. Atualizar o comentário que
    descreve o par. **Feito em `4e0fabb`.**

  > **Correção pós-implementação (achado do próprio implementador da Task 1, verificado
  > antes/depois — 46/46 igual nos dois momentos):** `server/tests/api/permissoesRotas.api.test.js`
  > NÃO quebra nesta task — `PUT /conferencias/:id/concluir` ainda grava por SQL direto até a
  > Task 2 reescrever a rota; RN-05 (tolerância) só existe a partir de lá. **Movido para o Step 3b
  > da Task 2** (abaixo), onde o helper `criarConferencia` (divergência 95% sem tolerância
  > configurada) realmente vai colidir com RN-05 assim que a rota passar a validar.

- [x] **Step 4: Verde + suíte inteira** (`npm run test:api` — 99/99 arquivos OK; `test:almoxarifado`
  42/42, `test:validation` 4/4, `test:safealter` 3/3, `test:sqlite` 3/3).
- [x] **Step 5: SABOTAGEM (controle positivo):** em `motivoRecusaAjustePorRetencao`, trocar
  `novoTotal >= retido` por `novoTotal >= 0` → os testes RN-06 (bloqueado, terceiros) TÊM de
  continuar recusando, mas por um motivo agora incoerente com o teste `[CONTROLE POSITIVO]`
  (retenção 3, ajuste para 3 — 3 >= 0 sempre verdadeiro, então esse teste passaria mesmo com a
  guarda quebrada). Usar o teste mais simples para a sabotagem: `return null;` logo no topo da
  função (guarda sempre desligada) e confirmar que os testes RN-06 (bloqueado, terceiros, cliente)
  caem. Restaurar (`md5sum` antes/depois/restaurado; `git diff --stat` vazio).
- [x] **Step 6: Commit** — `4e0fabb` —
  `Almoxarifado Etapa 10 Task 1: tipo AJUSTE_INVENTARIO e guarda de retencao no motor (RN-06)`.
  **Divergiu do plano (verificado, não suposto):** `permissoesRotas.api.test.js` não entrou no
  commit — o implementador rodou o arquivo antes e depois das mudanças da Task 1 (46/46 nos dois
  momentos) e confirmou que ele só vai quebrar quando a Task 2 conectar a rota ao motor; ver a
  nota no Step 3b acima e o Step 3b da Task 2 abaixo.

---

### Task 2: Rota da conferência — criar, contar, concluir pelo motor (tronco)

**Files:**
- Modify: `server/routes/almoxarifado.js` (bloco `/conferencias`, linhas ~682-877; import de
  `custoUnitarioSql` de `./services/almoxarifado/custoSql` — hoje só `valorEstoqueSql` está
  importado; import de `motivoRecusaAjustePorRetencao` de `stockService`)
- Modify: `server/tests/api/permissoesRotas.api.test.js` (movido da Task 1 — ver Step 3b abaixo)
- Test: `server/tests/api/conferenciaMotorAjuste.api.test.js`,
  `server/tests/api/conferenciaContagemCega.api.test.js`,
  `server/tests/api/conferenciaTolerancia.api.test.js`

**Interfaces:**
- Consumes: Task 1 (`AJUSTE_INVENTARIO`, `motivoRecusaAjustePorRetencao`, colunas novas,
  `stockService.getConfig`).
- Produces: os três endpoints do contrato congelado (design, tabela de contratos). `POST
  /conferencias` aceita `modo_cego`/`tolerancia_percentual`, ecoa os dois na resposta. `GET
  /conferencias/:id` omite `quantidade_sistema`/`divergencia` conforme RN-02, sempre traz
  `recontagem_necessaria` calculada no servidor. `PUT /item` exige `ABERTO` (RN-03) e marca
  recontagem (RN-04). `PUT /concluir` exige `justificativa_ajuste` com `aplicar_ajustes` (RN-06b),
  valida tolerância (RN-05), aplica via motor tudo-ou-nada com a quantidade CORRIGIDA por
  `quantidade_em_terceiros` (RN-06c — fecha B3 de verdade), soma impacto financeiro (D8), e
  prioriza 403 sobre 400 quando os dois motivos de bloqueio coexistem (RN-07).

**Mensagens literais (congeladas no design, não parafrasear):**
- RN-03: `"Conferência não está aberta (status atual: <status>)"`
- RN-05: `"Recontagem necessária antes de concluir: <lista 'código - divergência% (limite X%)'>"`
- RN-06b: `"Justificativa deve ter pelo menos 5 caracteres"` (mesma mensagem da spec de
  `JustificativaSchema` de outros módulos — se não houver Zod aqui, ainda assim usar o TEXTO
  igual, por consistência de UX)
- RN-07 (retenção, 400): `"Ajuste bloqueado: <código>: <motivoRecusaAjustePorRetencao>[; <código>: <motivo>...]"`
- RN-07 (dono, 403): `"Ajuste bloqueado — os seguintes materiais são de cliente e exigem a permissão \"ajustar_material_cliente\": <código> (<nome do cliente>)[, <código> (<cliente>)...]"`

- [x] **Step 1: Testes falhando.** Três arquivos, um por bloco de regra (mais fácil de isolar
  falha). Casos principais:

`conferenciaMotorAjuste.api.test.js`:
```js
test('concluir com aplicar_ajustes grava movimentacao AJUSTE_INVENTARIO auditada, nao UPDATE cru', async () => {
  const { app, db, close } = await createTestApp();
  // cria material COM custo_unitario > 0 (senao a asercao de impactoFinanceiro fica vazia —
  // achado da Fase 2), cria conferencia, conta divergente, conclui com aplicar_ajustes E
  // justificativa_ajuste (RN-06b — sem ela, 400 antes de tentar aplicar nada)
  // ...
  const mov = await dbAll(db, "SELECT * FROM movimentacoes_almoxarifado WHERE tipo = 'AJUSTE_INVENTARIO'");
  assert.strictEqual(mov.length, 1);
  // a auditoria real vem de dentro do stockService/ownerRules — so precisa existir, nao mais o INSERT manual sem auditoria
});

test('RN-06c: material com quantidade_em_terceiros soma de volta ao aplicar (fecha B3)', async () => {
  // material quantidade_atual=100, quantidade_em_terceiros=30 -> quantidade_sistema=70 (Etapa 8b)
  // contar 65 (divergencia -5, dentro da tolerancia) -> concluir com aplicar_ajustes
  // AJUSTE_INVENTARIO tem de mandar quantidade=95 (65+30) ao motor, NAO 65
  // assert final: material.quantidade_atual === 95 (fisico correto), quantidade_em_terceiros continua 30
});

test('RN-07: um item recusado por retencao bloqueia TODA a conclusao (tudo ou nada), 400', async () => {
  // material A: divergencia normal dentro da tolerancia; material B: bloqueado, ajuste deixaria retencao > total
  // concluir com aplicar_ajustes: 400 "Ajuste bloqueado: <codigo B>: ...", NENHUM dos dois materiais muda,
  // conferencia continua ABERTO, nenhuma movimentacao AJUSTE_INVENTARIO gravada (nem para o material A)
});

test('RN-07: item de material de cliente sem ajustar_material_cliente vira 403 (prioridade sobre 400)', async () => {
  // material A: bloqueado (motivo 400); material CLIENTE: divergencia, usuario e GESTOR (sem ajustar_material_cliente)
  // concluir com aplicar_ajustes: 403 (o motivo de permissao GANHA do motivo de retencao na mesma resposta)
});

test('sem aplicar_ajustes continua so fechando, sem tocar saldo (comportamento antigo preservado)', async () => { /* ... */ });
```

`conferenciaContagemCega.api.test.js`:
```js
test('RN-02: modo_cego omite quantidade_sistema para quem nao tem ajustar_estoque, mostra para quem tem', async () => {
  // GET com usuario ALMOXARIFE (tem inventario, NAO tem ajustar_estoque): item sem quantidade_sistema/divergencia
  // GET com usuario GESTOR (tem ajustar_estoque): item completo, incluindo recontagem_necessaria
});
test('modo_cego=false (default): comportamento identico ao de hoje para todo mundo', async () => { /* controle */ });
test('conferencia CONCLUIDA sempre mostra quantidade_sistema, mesmo modo_cego (e o registro historico)', async () => { /* ... */ });
test('POST /conferencias ecoa modo_cego e tolerancia_percentual na resposta 201', async () => { /* ... */ });
```

`conferenciaTolerancia.api.test.js`:
```js
test('RN-05: divergencia acima da tolerancia sem recontagem bloqueia concluir (com ou sem aplicar_ajustes)', async () => { /* ... */ });
test('RN-04: segunda chamada de PUT /item marca recontado=1 automaticamente', async () => { /* ... */ });
test('apos recontar, concluir passa qualquer que seja o novo valor', async () => { /* ... */ });
test('RN-03: PUT /item em conferencia CONCLUIDA/CANCELADA recusa 400', async () => { /* ... */ });
test('RN-06b: aplicar_ajustes sem justificativa_ajuste recusa 400 antes de tocar em qualquer material', async () => { /* ... */ });
test('tolerancia_percentual=0 na criacao NAO cai no default 2 (achado da Fase 2, cuidado com ||)', async () => { /* ... */ });
```

- [x] **Step 2: Rodar e ver falhar.**
- [x] **Step 3: Implementar.** Reescrever o bloco `/conferencias` de
  `routes/almoxarifado.js:682-877`:

  - `POST /conferencias`: acrescentar `modo_cego` (bool→0/1) e `tolerancia_percentual` (number;
    se ausente, ler `await stockService.getConfig(db, 'tolerancia_inventario_percentual')`) no
    INSERT, e ecoar os dois na resposta 201. **Atenção (achado da Fase 2):**
    `configuracoes_almoxarifado.valor` é `TEXT` — `getConfig` devolve string ou `undefined`,
    nunca número, e `0` é um valor válido de tolerância. Usar
    `Number.isFinite(parseFloat(x)) ? parseFloat(x) : 2` — **nunca** `parseFloat(x) || 2`
    (`parseFloat('0') || 2` devolve `2`, silenciosamente).
  - `GET /conferencias/:id`: depois de montar `itens`, calcular `recontagem_necessaria` em CADA
    item (`Math.abs(divergencia) / Math.max(quantidade_sistema, 1) * 100 > toleranciaEfetiva &&
    !item.recontado` — só quando `quantidade_contada != null`) e acrescentar ao objeto do item
    ANTES de decidir omitir campos. Se
    `conf.modo_cego && conf.status === 'ABERTO' && !can(req.user, 'ajustar_estoque')`, mapear os
    itens removendo `quantidade_sistema`/`divergencia` (mas mantendo `recontagem_necessaria` —
    quem só conta precisa saber que precisa recontar, mesmo sem ver o número).
  - `PUT /item/:itemId`: primeiro `SELECT status FROM conferencias_almoxarifado WHERE id = ?`;
    se `status !== 'ABERTO'`, 400 `"Conferência não está aberta (status atual: <status>)"`.
    Recontagem: antes do UPDATE, checar se `item.quantidade_contada !== null` (já tinha
    contagem) — se sim, o UPDATE também seta `recontado = 1`; resposta ecoa
    `recontagem: item.quantidade_contada !== null`.
  - `PUT /concluir`: se `aplicar_ajustes`, `justificativa_ajuste` é obrigatória (mín. 5
    caracteres) — 400 imediato, ANTES de qualquer outra validação, se faltar. Gravar
    `justificativa_ajuste` na conferência. Depois, calcular a tolerância
    (`Math.abs(divergencia) / Math.max(quantidade_sistema, 1) * 100 > toleranciaEfetiva`) para
    cada item com `quantidade_contada != null`; se algum exceder **e** `recontado === 0`, 400
    listando `"<código> - divergência <D>% (limite <T>%)"` por item, **sem tocar em nada** (nem
    fechar a conferência — RN-05 vale mesmo sem `aplicar_ajustes`). Passada a validação de
    tolerância: se `aplicar_ajustes`, **pré-validar** cada item divergente ANTES de aplicar
    qualquer um — para cada item, buscar o `material` atual, checar (a) se `material.proprietario_cliente_id`
    existe e o usuário não tem `can(req.user, 'ajustar_material_cliente')` → falha de PERMISSÃO
    (checagem leve, sem chamar `ownerRules.assertAjustePermitido` aqui — essa função audita como
    efeito colateral, e chamá-la na pré-validação gravaria auditoria duplicada quando a aplicação
    real rodar depois; achado da Fase 2); (b) senão, chamar
    `stockService.motivoRecusaAjustePorRetencao(material, item.quantidade_contada +
    (material.quantidade_em_terceiros || 0))` (a soma é RN-06c — fecha B3) → falha de RETENÇÃO se
    devolver string. Se **qualquer** item falhar por permissão, responder 403 com a lista desses
    materiais (mensagem congelada acima), IGNORANDO falhas de retenção nesta resposta (RN-07,
    prioridade). Senão, se algum falhar por retenção, 400 com a lista (mensagem congelada acima).
    Só se **nenhum** item falhar, aplicar de verdade, **sequencialmente** (não `Promise.all` —
    precisa poder abortar sem deixar metade aplicada; o precedente real de pré-checagem-depois-
    efeito-item-a-item é `thirdPartyService.registrarTransformacao`, **não** um arquivo
    `transformService.js` — esse nome não existe no código), chamando
    `stockService.registrarMovimentacao(db, req.user, { material_id, tipo: 'AJUSTE_INVENTARIO',
    quantidade: item.quantidade_contada + (material.quantidade_em_terceiros || 0), motivo:
    \`Ajuste de conferência ${conf.numero}\`, referencia: conf.numero, justificativa:
    justificativa_ajuste })` para cada um (a pré-validação já rodou a mesma
    `motivoRecusaAjustePorRetencao`, então a aplicação real não deveria lançar de novo — se
    lançar mesmo assim, é corrida entre a pré-validação e a aplicação; documentar isso como
    limitação conhecida no plano, não tentar resolver com transação composta que o motor não
    tem). Some `divergencia_absoluta × custoUnitarioSql` (query com `custoSql.custoUnitarioSql`)
    para o `impactoFinanceiro` da resposta.
  - Remover o `INSERT` manual em `movimentacoes_almoxarifado` e o `UPDATE` direto —
    substituídos pela chamada ao motor.

- [x] **Step 3b: Corrigir `server/tests/api/permissoesRotas.api.test.js`** (movido da Task 1 —
  o implementador daquela task verificou, antes/depois, que o arquivo só quebra a partir daqui,
  quando a rota passa a validar RN-05 de verdade). O helper `criarConferencia` (`:77-91`) grava
  `quantidade_sistema=100, quantidade_contada=5` (divergência 95%, sem tolerância configurada) →
  RN-05 bloqueia a conclusão nos testes `:209` e `:235`, que medem PERFIL, não a regra de
  tolerância. Ajustar o helper para uma divergência dentro do default (2%) OU marcar
  `recontado = 1` no INSERT, preservando o que os dois testes realmente verificam. **Divergiu do
  plano:** RN-06b (justificativa) quebrou um SEGUNDO teste do mesmo arquivo, não previsto no
  plano ("GESTOR com aplicar_ajustes -> 200") — corrigido no mesmo passo (mandar
  `justificativa_ajuste`).
- [x] **Step 4: Verde + suíte inteira** (`npm run test:api` completo — 102/102 arquivos;
  `test:almoxarifado` 42/0, `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 3/0).
- [x] **Step 5: SABOTAGEM:** no `concluir`, trocar a validação-antes-de-aplicar por aplicar direto
  em `Promise.all` de novo (voltar ao tudo-em-paralelo) → o teste RN-07 (tudo ou nada) TEM de
  cair (algum item passaria mesmo com outro recusado, ou o erro do `Promise.all` deixaria estado
  parcial). Restaurar.
- [x] **Step 6: Commit** — `a30c87e` —
  `Almoxarifado Etapa 10 Task 2: conclusao da conferencia passa pelo motor — contagem cega, tolerancia e ajuste tudo-ou-nada`.
  **Divergiu do plano (achado durante a implementação, não previsto):** `ajustesAplicados` na
  resposta do `concluir` — o código antigo devolvia `ajustes.length` incondicionalmente (mesmo
  sem `aplicar_ajustes`), bug pré-existente sem teste. A implementação nova devolve a contagem
  REAL de itens aplicados (0 quando `aplicar_ajustes` é falso). Sem regressão (nenhum teste
  dependia do valor antigo), registrado por não estar listado como mudança no design.

**Review (opus, diff 4e0fabb..a30c87e): Needs fixes — 1 Important.** Todas as mensagens literais
(RN-03/05/06b/07×2) bateram caractere a caractere contra o contrato congelado — checado
explicitamente porque o front (Task 3) casa contra elas em paralelo. O achado real: `PUT
/concluir` não tinha gate de status — concluir de novo uma conferência já `CONCLUIDO`/`CANCELADO`
fabricava uma **segunda** movimentação `AJUSTE_INVENTARIO` auditada por item (e uma segunda
auditoria de material de cliente, quando aplicável), ou ressuscitava uma cancelada. **Fix
aplicado direto pelo controlador** (2 linhas, reusa a mensagem já congelada de RN-03 — `PUT /item`
já usa a mesma frase), com sabotagem provada: 2 testes novos ficam vermelhos sem o gate
(`false && conf.status !== 'ABERTO'`), verdes com ele restaurado — commit `d6ea764`. 6 minors
deferidos (fórmula de tolerância duplicada entre GET e concluir, `nomeDoCliente` duplicado
inline, N+1 na leitura de custo, `totalItens` ausente na resposta vazia, sem guard null em
`proprietario_cliente_id`, contradição interna do design sobre o formato de RN-05 — corrigida no
design junto com a semântica de `impactoFinanceiro` como soma **absoluta**, não líquida).

---

### Task 3: Front — `ConferenciaEstoque.js` contra o contrato congelado (GALHO PARALELO — worktree própria)

> Pode começar assim que a Task 2 commitar (contrato congelado desde o design). Mock de fetch no
> teste RTL — mock de JSON na fronteira HTTP é o único mock legítimo (skill, Fase 3).

**Files:**
- Modify: `client/src/components/almoxarifado/ConferenciaEstoque.js`
- Modify/Create: `client/src/components/almoxarifado/ConferenciaEstoque.test.js`

**Conteúdo:**
- Criação: checkbox **"Contagem cega"** (`modo_cego`) e campo **"Tolerância (%)"**
  (`tolerancia_percentual`, placeholder mostrando o default se vazio).
- Lista de itens: quando o GET não trouxer `quantidade_sistema`/`divergencia` (contagem cega para
  quem não pode ajustar), mostrar `—` no lugar, sem quebrar o cálculo de divergência local (que
  já existe no front, `divergenciaItem`) — se o dado não veio, a coluna cliente-side também
  precisa saber que não deve calcular.
- Badge **"Recontagem necessária"** lido DIRETO do campo `recontagem_necessaria` que o GET agora
  devolve por item (RN-02/RN-05 do design) — **não recalcular a fórmula de tolerância no front**
  (achado da Fase 2: duas implementações da mesma fórmula em lados opostos do contrato é o mesmo
  padrão que a revisão final da Etapa 9b já pegou — servidor calcula, front só exibe).
- Campo **"Justificativa do ajuste"** (`justificativa_ajuste`) no modal de concluir, obrigatório
  só quando "Aplicar ajustes" está marcado — RN-06b.
- **Concluir**: tratar as mensagens de recusa exibindo a lista completa no toast (não só a
  primeira linha) — são mensagens multi-item (RN-05 e RN-07/400 do design, mensagens literais
  congeladas na Task 2); tratar também o **403** de RN-07 (material de cliente sem
  `ajustar_material_cliente`) como um caso distinto do 400 de retenção — mensagens e status
  diferentes, não cair os dois no mesmo `catch` genérico.
- Resposta de sucesso do concluir: mostrar `impactoFinanceiro` (ex.: "Ajustes aplicados: 3 —
  impacto financeiro: R$ 1.234,56").

- [x] **Step 1: Testes RTL falhando** — 11/11 (arquivo de teste novo, componente não tinha
  nenhum teste antes desta task).
- [x] **Step 2: Ver falhar. Step 3: Implementar. Step 4:**
  `CI=true npx react-scripts test --watchAll=false` verde (368/368 na suíte completa) +
  `CI=true npx react-scripts build` sem warning.
- [x] **Step 5: SABOTAGEM:** catch genérico no lugar do tratamento por status (400/403) → 3 dos
  11 testes caíram (exatamente os de mensagem de recusa: RN-05, RN-07/400, RN-07/403). Restaurado.
- [x] **Step 6: Commit** — `4f7ed6f` (branch `etapa10-task3-front`) —
  `Almoxarifado Etapa 10 Task 3: tela de conferencia — contagem cega, tolerancia e impacto financeiro do ajuste`.
  **Divergiu do plano (decisão da implementação, documentada):** o botão "Concluir" usava
  `window.confirm` puro; como o brief pede um campo de justificativa "no modal de concluir" e não
  havia modal nenhum, virou um modal de verdade (mesmo padrão visual do modal de criar) — mudança
  de UX sem teste anterior cobrindo o `window.confirm`, sem regressão. O placeholder de
  "Tolerância (%)" mostra o default hard-coded do servidor (`2`), não uma leitura ao vivo da
  config (não existe endpoint de leitura exposto ao client, fora do escopo desta task) —
  registrado como aproximação honesta, não descoberta silenciosa.

---

### Task 4: Integração cruzando galhos (fase 4 — depois do merge)

**Files:**
- Test: `server/tests/api/inventarioIntegracao.api.test.js`

**Interfaces:** Consumes TUDO (Tasks 1-3, backend). Teste-jornada:

```
criar material com custo_unitario=10 (obrigatorio: sem custo, o impactoFinanceiro fica 0 e a
  asercao final nao prova nada — achado da Fase 2), quantidade_atual=100, quantidade_bloqueada=0
criar conferencia com modo_cego=true, tolerancia_percentual=5
GET conferencia com usuario ALMOXARIFE (sem ajustar_estoque) -> item SEM quantidade_sistema,
  COM recontagem_necessaria (calculada no servidor, mesmo sem ver o numero)
contar material: quantidade_contada=90 (divergencia -10%, acima da tolerancia 5%)
concluir SEM justificativa_ajuste, com aplicar_ajustes=true -> 400 RN-06b (falta antes de
  qualquer outra validacao)
concluir com justificativa_ajuste, aplicar_ajustes=false -> 400 RN-05 (tolerancia bloqueia mesmo
  sem aplicar ajuste), lista o item, nada muda
recontar o MESMO item: quantidade_contada=88 de novo -> recontado=1
bloquear 95 unidades do material (fora da conferencia, via rota de bloqueio) -- deixa retencao > 88
concluir com aplicar_ajustes=true + justificativa_ajuste -> 400 (RN-07/RN-06, motivo de RETENCAO,
  nao de permissao — so 400), "Ajuste bloqueado: <codigo>: ...", conferencia continua ABERTO,
  quantidade_atual continua 100 (tudo ou nada, nao aplicou nada, nenhuma movimentacao gravada)
desbloquear o material
concluir com aplicar_ajustes=true + justificativa_ajuste de novo -> 200, movimentacao
  AJUSTE_INVENTARIO no livro, auditoria existe, impactoFinanceiro = 12 * 10 = 120
  (quantidade_atual final = 88, sem quantidade_em_terceiros neste cenario — o teste de RN-06c
  fica isolado na Task 2, aqui so confirma que o caminho feliz aplica o numero certo)
GET /conferencias/:id concluida -> mostra quantidade_sistema mesmo com modo_cego (historico)
PUT /item numa conferencia ja CONCLUIDA -> 400 RN-03
POST /movimentacoes/:id/cancelar na movimentacao AJUSTE_INVENTARIO recem-criada -> 400 RN-10
```

- [x] **Step 1: Escrever o fluxo completo como UM teste-jornada + asserções intermediárias.**
  14 passos, batendo em `supertest(app)` do início ao fim (bloqueio/desbloqueio pela rota REAL
  dedicada, não a genérica — a genérica recusa `BLOQUEIO`/`DESBLOQUEIO` por design, achado ao
  rodar a primeira tentativa).
- [x] **Step 2: Rodar** — passou de primeira (Tasks 1-3 já revisadas e corrigidas
  individualmente antes desta task; sem defeito de costura vivo — ver Step 4).
- [x] **Step 3: Suíte completa serial** — `test:api` 103/103 arquivos, `test:almoxarifado` 42/0,
  `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 3/0, client 369/369, build limpo.
- [x] **Step 4: SABOTAGEM:** escolhida uma costura REAL entre Task 1 e Task 2 (não hipotética):
  filtrar `!i.recontado` junto de `divergencia !== 0` na lista de ajustes — conflando a isenção
  de RN-04 (recontagem isenta da checagem de *tolerância*) com a guarda de RN-06/07 (retenção),
  que são regras independentes nascidas em tasks diferentes. Resultado: o teste-jornada CAIU
  (esperava 400, recebeu 200 aplicando o ajuste indevidamente), e os DOIS arquivos unitários da
  Task 2 (`conferenciaMotorAjuste`, `conferenciaTolerancia`) continuaram 100% verdes — nenhum dos
  dois combina recontagem com retenção no mesmo item. Prova real de que só o teste de integração
  cobre essa composição. Restaurado (`git diff --stat` vazio antes do commit).
- [x] **Step 5: Commit** — `2a8b529` —
  `Almoxarifado Etapa 10 Task 4: teste-jornada — contagem cega, tolerancia, recontagem e ajuste tudo-ou-nada`.
  Nenhum código de produção alterado — só o arquivo de teste novo.

---

### Task 4.5: Revisão final de branch + fixes (não estava no plano original — exigida pela skill `desenvolver-etapa-almoxarifado`, Fase 5)

Depois do merge do galho front e da Task 4, revisor externo (opus, range `9062a18..2a8b529`, o
branch inteiro da etapa) rodou o review whole-branch que os gates por-task não conseguem ver.
Veredito: **"No — 1 fix crítico antes de fechar"**, 1 Critical + 4 Important + 6 Minor:

- **Critical** — `AJUSTE_INVENTARIO` com `quantidade=0` (uma contagem física legítima — "achei
  zero na prateleira") era recusado pela validação de entrada do motor, mas a pré-validação da
  rota não sabia disso e aprovava o item na primeira passada. O motor só recusava na hora de
  aplicar de verdade — com outros itens da mesma conferência **já gravados**, quebrando o
  tudo-ou-nada de RN-07 de verdade (não hipoteticamente: reproduzido com ordem de itens forçada).
  Pior, como a conferência ficava `ABERTO`, cada retry duplicava a movimentação do item que já
  tinha aplicado certo. Regressão real contra o caminho antigo (`UPDATE` cru nunca teve esse
  problema).
- **Important (4)** — `material.ativo=0` entre a contagem e a conclusão tinha o mesmo furo de
  pré-validação incompleta do achado Critical (mesma família de bug, corrigido junto);
  `POST /conferencias` não ecoava `totalItens` na resposta vazia (front lia `undefined`); a
  chave de config `tolerancia_inventario_percentual` nunca tinha sido semeada em `schema.js`,
  então `PUT /configuracoes` (que só grava chave já semeada) nunca conseguia configurar um valor
  diferente do fallback fixo; o badge "Recontagem necessária" só chegava na tela ao ABRIR a
  conferência — salvar uma contagem não atualizava, e quem contava só descobria a recontagem
  exigida no 400 da conclusão; `AJUSTE_INVENTARIO` nunca foi acrescentado às listas do livro de
  movimentações (`TIPOS`/`TIPOS_SEM_ESTORNO`) — mesmo padrão "N lugares pra atualizar, um
  esquecido" que `ENTRADA_RETALHO` já tinha documentado na Etapa 9.
- **Minor (6, todos deferidos)** — modo cego vaza o número escondido através da mensagem de
  RN-05 (a fórmula é reversível a partir da % e da tolerância — D4 já declara que a blindagem
  não é perfeita, registrar no manual); mensagem de retenção malformada quando não há retenção
  nenhuma e a quantidade é negativa (upstream: `PUT /item` não valida negativos — pré-existente,
  fora do escopo desta etapa); RN-10 lança depois do claim em `cancelarMovimentacao`, não antes
  (mesma decisão do Task 1 reviewer, confirmada ainda segura — a compensação reverte tudo); config
  de tolerância pré-etapa aplica 2% retroativamente a conferências já abertas (intencional por
  RN-05, mas efeito de migração de dado não nomeado antes); comentário desatualizado citando
  "listar" como consumidor de `toleranciaEfetiva` quando não é; branches 400/else redundantes no
  front (estrutural, sem diferença de comportamento).

**Todos os achados Critical/Important corrigidos direto pelo controlador**, cada um com teste
novo + sabotagem provada (a primeira tentativa de sabotagem do achado Critical passou por sorte
de ordenação alfabética dos materiais — corrigido forçando a ordem nos testes antes de aceitar
qualquer verificação como válida). Commits: `38a7afb` (Critical + os dois Important de backend),
`d3fc0ab` (badge de recontagem), `8db2671` (wiring do livro de movimentações). Suite completa
re-verificada depois de todos os fixes: `test:api` 103/103, `test:almoxarifado` 42/0,
`test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 3/0, client 373/373, build limpo.

---

### Task 5: Fechamento (fase 6)

- [ ] Usar a skill **`fechar-etapa`** inteira: novidades-por-etapa (bloco ⚠️ com as decisões
  D1-D9 que esperam arbitragem, e a resolução FINAL de B1/B2/B3 — não é mais pendência, é
  decisão tomada e implementada, registrar como tal), spec 17 (status, checklist com hash por
  item, os cortes D7 nomeados), mapa de status, guia do usuário, manual do sistema (RN em
  linguagem de operador, mensagens literais conferidas no código), este plano (tasks marcadas +
  divergências).
- [ ] **Retro de 4 números** no fim deste arquivo.

---

## Self-review do plano (feito na escrita)

- **Cobertura da spec 17:** contagem cega (RN-02), tolerância+recontagem (RN-04/05), ajuste pelo
  motor (RN-06/07/09), imutabilidade pós-conclusão (RN-03/D9). Tipos de contagem avançados,
  dupla contagem por duas pessoas, congelamento de movimentação, acuracidade e e-mail: fora,
  declarado (D7 do design) — Etapa 10b.
- **Consistência de tipos:** `COLUNAS_RETENCAO` (Task 1) é a mesma constante que `availabilitySql`
  já usa em 14 lugares — nenhuma lista nova. `AJUSTE_INVENTARIO` reusa o branch de `AJUSTE` do
  motor (Task 1), não cria caminho paralelo.
- **Sem placeholder:** cada task tem código ou instrução executável com precedente file:line.
