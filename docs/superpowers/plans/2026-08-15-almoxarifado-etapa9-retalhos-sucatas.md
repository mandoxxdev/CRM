# Etapa 9 — Retalhos, sobras e sucatas — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retalho vira estoque de verdade (material normal no motor + anexo dimensional) e
sucateamento vira processo com dupla aprovação — nada de saldo mudando fora do livro.

**Architecture:** Evento composto `gerarRetalho` (SAIDA do original + tipo novo `ENTRADA_RETALHO`
+ linha dimensional em `sobras_material_almoxarifado` reformada), com compensação no padrão
8b/8c. Sucateamento com máquina de estados própria (`scrapDisposalStateMachine`), duas pernas de
aprovação segregadas e baixa `SUCATA` pelo motor na aprovação final; `SUCATA` sai da rota
genérica (vira `TIPOS_DEDICADOS`, precedente DEVOLUCAO/Etapa 7). Tela nova `/almoxarifado/sobras`
+ etiqueta de retalho 100% client.

**Tech Stack:** Express + SQLite (`server/`), Zod via `validate(schema)`, React CRA (`client/`),
jspdf/qrcode já instalados.

**Design aprovado:** [`docs/superpowers/specs/2026-08-15-almoxarifado-etapa9-retalhos-sucatas-design.md`](../specs/2026-08-15-almoxarifado-etapa9-retalhos-sucatas-design.md)
— as decisões numeradas de lá mandam; este plano só as executa.

## Global Constraints

- Branch: `desenvolvimento-almoxarifado`. Um commit por task, mensagem em português sem acento,
  explicando **por quê**. Nunca `git add -A` na raiz.
- Testes: `cd server && npm run test:api` (runner descobre só `server/tests/api/*.api.test.js`;
  cada arquivo tem runner próprio com `test()`, contador e `process.exit`). Harness:
  `server/tests/helpers/testApp.js` — roda o `requirePermission` REAL (`setUser` sem
  `perfil_almoxarifado` vira PRODUCAO, não "sem acesso"). Client: `cd client && CI=true npx
  react-scripts test --watchAll=false` e build com `CI=true`.
- **Todo teste novo precisa de controle positivo** (provar que sabe falhar) — o projeto já teve
  três testes vazios. Cada task lista a SABOTAGEM: o que quebrar de propósito e quais testes TÊM
  de cair (e rodar a sabotagem de verdade, não só declarar).
- Validação de payload: Zod em `server/services/almoxarifado/schemas.js` +
  `validate(schema)` de `validation.js`. Rotas novas nascem validadas.
- Colunas novas: `safeAlter` (só engole `duplicate column name`). DDL só em
  `services/almoxarifado/schema.js`.
- Fontes únicas — proibido replicar: tipos que somam/subtraem = `movementTypes.js`; disponível =
  `availabilitySql.js`; custo = `custoSql.js` (`custoUnitarioSql`/`valorEstoqueSql`).
- Auditoria: `registrarAuditoria(db, { entidade, entidade_id, acao, usuario_id, usuario_nome,
  dados_anteriores, dados_novos, justificativa })` de `audit.js`.
- Sem transação no módulo: pré-checagem → claim no WHERE → compensação (moldes:
  `thirdPartyService.js` e `returnService.js`).
- Almoxarifado é área física, não filial — nada de segregar saldo por almoxarifado.
- Front: idioma lista+modal das telas recentes (`RemessasTerceirosAlmoxarifado.js` é o molde:
  `.almox-header`, `SkeletonTable`, `.almox-modal-overlay` com guard `if (!saving)`,
  `useAlmoxPermissoes().bloquearSeNaoPode`, `SeloProprietario`, `let cancelado` em fetch
  dependente, `import './Almoxarifado.css'`).

---

### Task 0: Correções declaradas das specs 15 e 16 (elas mentem hoje)

**Files:**
- Modify: `specs/modulo-almoxarifado/15-retalhos-sucatas/README.md`
- Modify: `specs/modulo-almoxarifado/16-ferramentas-calibracao/README.md`

Duas afirmações falsas verificadas por grep (zero ocorrências de
scrapService/criarSobra/toolService/criarFerramenta em `server/tests/`):

- [ ] **Step 1:** Na spec 15 (linha ~13), a frase "Teste de serviço existe" sobre o
  `scrapService` — substituir por correção declarada no molde do projeto: a afirmação estava
  **errada**, não existe teste nenhum de `scrapService`/rotas `/sobras` (verificado em
  2026-08-15), e a Etapa 9 os cria. Não apagar em silêncio: dizer que estava errada.
- [ ] **Step 2:** Na spec 16: mesma correção para o `toolService` ("Teste de serviço existe" é
  falso) e atualizar as referências mortas: `schema.js:555/569` → `schema.js:1303/1317`,
  `extended.js:247-269` → `extended.js:672-698`, com nota de que estavam desatualizadas.
- [ ] **Step 3:** Commit: `Almoxarifado: specs 15 e 16 afirmavam teste de servico que nunca
  existiu — corrigidas dizendo que estavam erradas` (corpo: grep vazio como evidência, regra 5
  do CLAUDE.md).

---

### Task 1: Sobra reformada — colunas, Zod, auditoria, usuário gravado, POST avulso aposentado

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (bloco de `safeAlter`s; a tabela está em
  `schema.js:1283-1300`)
- Modify: `server/services/almoxarifado/scrapService.js` (37 linhas hoje — reescrever)
- Modify: `server/services/almoxarifado/schemas.js` (schemas novos)
- Modify: `server/routes/almoxarifado/extended.js:656-670` (rotas `/sobras`)
- Test: `server/tests/api/sobras.api.test.js` (novo)

**Interfaces (Produces):**
- Colunas novas em `sobras_material_almoxarifado` (todas por `safeAlter`, NULL = sobra legada):
  `norma TEXT`, `diametro REAL`, `largura REAL`, `comprimento REAL`, `foto TEXT`,
  `criado_por_id INTEGER`, `criado_por_nome TEXT`, `lote_origem_id INTEGER`,
  `material_retalho_id INTEGER`, `movimentacao_baixa_id INTEGER`,
  `movimentacao_entrada_id INTEGER`. (A coluna `material_id` existente passa a ser lida como
  **material de ORIGEM** — documentar no comentário do safeAlter.)
- `scrapService.listarSobras(db, filters)` ganha filtros `material_id` (origem) e `q` (LIKE em
  dimensões/norma/descricao), mantém `status`/`disponivel`.
- `scrapService.atualizarSobra(db, user, id, data)` — **assinatura muda** (ganha `user`): grava
  auditoria (`entidade: 'sobra'`, `acao: 'atualizar'`, com `dados_anteriores`/`dados_novos`) e
  aceita `status` só do enum `['DISPONIVEL','CONSUMIDA','SUCATEADA']` (validado no Zod).
- `SobraUpdateSchema` em schemas.js (status enum acima, `localizacao_id` int nullable,
  `observacoes` string nullable, `reutilizavel` boolean opcional).
- `criarSobra` **deixa de ser exportado/rota**: o único caminho de criação passa a ser
  `gerarRetalho` (Task 3). A rota `POST /sobras` é removida de `extended.js` (zero consumidores
  no front, zero testes — verificado).

- [ ] **Step 1:** Escrever `sobras.api.test.js` (falhando): GET /sobras lista com filtros novos;
  PUT /sobras/:id com payload inválido (status fora do enum) → 400; PUT válido grava auditoria
  (SELECT em `auditoria_log_almoxarifado` WHERE entidade='sobra') e persiste; PUT sem perfil
  (PRODUCAO) → 403 (`requirePermission('movimentar')` real); POST /sobras → 404 (rota
  aposentada). Controle positivo: asserção de auditoria falha se ninguém gravar (rodar antes de
  implementar e ver falhar).
- [ ] **Step 2:** Rodar e ver falhar (`node tests/api/sobras.api.test.js` direto ou
  `npm run test:api`).
- [ ] **Step 3:** Implementar: safeAlters + scrapService reescrito + schemas + rotas (GET
  mantém só-auth como as leituras do módulo; PUT `requirePermission('movimentar')` +
  `validate(SobraUpdateSchema)`; POST removido). Manter o relatório `sobras-disponiveis`
  (`extended.js:807`) funcionando.
- [ ] **Step 4:** Rodar `npm run test:api` inteiro (o arquivo novo E os antigos) — verde.
- [ ] **Step 5:** SABOTAGEM: comentar a chamada de `registrarAuditoria` em `atualizarSobra` →
  o teste de auditoria TEM de cair. Reverter.
- [ ] **Step 6:** Commit: `Almoxarifado Etapa 9 Task 1: sobra reformada — auditoria, Zod,
  usuario gravado e POST avulso aposentado` (corpo: paga a pendência nomeada da spec 23 — único
  serviço de cauda sem auditoria; POST avulso recriaria a ilha).

---

### Task 2: `ENTRADA_RETALHO` — tipo novo, nascido nas fontes únicas

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (`TIPOS_MOVIMENTO` ~linha 97 e
  `TIPOS_DEDICADOS` linha 147 — com comentário no molde dos vizinhos: por que não reusar
  ENTRADA, por que dedicado)
- Modify: `server/services/almoxarifado/movementTypes.js` (`TIPOS_ENTRADA` linha 41)
- Modify: `server/services/almoxarifado/movementRules.js` (`REGRAS_VINCULO`:
  `ENTRADA_RETALHO: { vinculo: 'nenhum', justificativa: true }` — mesma forma e razão do
  RETORNO_TRANSFORMACAO: a resposta a "de onde veio?" tem de estar escrita; o vínculo mora na
  linha da sobra)
- Modify: `server/services/almoxarifado/ownerRules.js` (`TIPOS_ISENTOS_DONO` linha 57, com
  comentário: o evento composto tem guarda própria de dono — Task 3)
- Test: `server/tests/api/retalhoTipo.api.test.js` (novo, no molde de
  `transformacaoMotor.api.test.js:50-70`)

**Interfaces (Produces):** o tipo `'ENTRADA_RETALHO'` aceito por
`stockService.registrarMovimentacao` como entrada (credita `quantidade_atual`), recusado pela
rota genérica v2 (deriva de `TIPOS_DEDICADOS` — `schemas.js:54-56`, nada a editar lá), coberto
pela equação da posição por cliente (deriva de `movementTypes.js`).

- [ ] **Step 1:** Escrever `retalhoTipo.api.test.js` (falhando): (a) declaração — tipo em
  `TIPOS_MOVIMENTO`, `TIPOS_DEDICADOS` e `movementTypes.TIPOS_ENTRADA`; (b) rota genérica v2
  recusa `{tipo:'ENTRADA_RETALHO'}` (Zod 400); (c) motor credita: `registrarMovimentacao` com o
  tipo + justificativa soma `quantidade_atual`; (d) sem justificativa → recusa
  (`avaliarRegrasVinculo`); (e) custo: movimentar com o tipo **não altera** `custo_medio` do
  material (o serviço nunca passa custo; asserção com material de `custo_medio` preexistente).
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar as quatro edições de lista + comentários.
- [ ] **Step 4:** `npm run test:api` inteiro — atenção especial a
  `clientePosicaoTipos.api.test.js` (a equação passa a exercitar o tipo novo sozinha) e
  `transformacaoMotor.api.test.js`.
- [ ] **Step 5:** SABOTAGEM: remover `'ENTRADA_RETALHO'` só de `movementTypes.TIPOS_ENTRADA`
  (deixando em TIPOS_MOVIMENTO) → `clientePosicaoTipos` E o teste novo TÊM de cair — é
  exatamente o esquecimento que aconteceu duas vezes (8b, 8c). Reverter.
- [ ] **Step 6:** Commit: `Almoxarifado Etapa 9 Task 2: ENTRADA_RETALHO nasce nas fontes unicas`.

---

### Task 3: `gerarRetalho` — o evento composto, com guarda de dono e compensação

**Files:**
- Modify: `server/services/almoxarifado/scrapService.js`
- Modify: `server/services/almoxarifado/schemas.js` (`GerarRetalhoSchema`)
- Test: `server/tests/api/retalhoGeracao.api.test.js` (novo)

**Interfaces:**
- Consumes: `stockService.registrarMovimentacao(db, user, params, opcoes)` e
  `stockService.cancelarMovimentacao` (compensação — molde:
  `thirdPartyService.compensarTransformacao`); `ownerRules.assertMesmoDonoNaTransformacao`
  (reusar se a assinatura servir; senão espelhar como `assertMesmoDonoNoRetalho` com o MESMO
  texto de erro adaptado).
- Produces: `scrapService.gerarRetalho(db, user, payload)` → `{ sobra, movimentacao_baixa_id,
  movimentacao_entrada_id }`. Payload (validado por `GerarRetalhoSchema`):

```js
{
  material_origem_id: int,            // obrigatório, tem de existir
  material_retalho_id: int,           // obrigatório, tem de existir — o serviço NÃO cria material
  quantidade_retalho: number > 0,     // default 1
  baixar_original: boolean,           // os dois modos do design (decisão 2)
  quantidade_baixa: number > 0,       // obrigatório se baixar_original
  lote_origem_id: int|null,           // OBRIGATÓRIO se baixar_original e origem tem controle_lote
  localizacao_id: int|null,           // onde o retalho fica
  // vínculo da SAIDA (só no modo baixar_original — REGRAS_VINCULO de SAIDA: 'qualquer'):
  projeto_id, os_id, centro_custo_id, justificativa,
  // anexo dimensional:
  dimensoes_originais, dimensoes_restantes, norma, espessura, diametro, largura,
  comprimento, peso_aproximado, material_descricao, observacoes,
  projeto_origem_id, os_origem_id,
}
```

Regras (do design, decisões 2/4/5): dono do `material_retalho` TEM de ser o mesmo do
`material_origem` (guarda própria; recusa nomeando os dois donos); `ENTRADA_RETALHO` emitida SEM
custo (justificativa montada pelo serviço: `Retalho gerado de <codigo origem> (sobra #<id>)` —
gravada também na SAIDA quando o operador não deu justificativa própria); ordem das pernas no
modo `baixar_original`: pré-checagens → SAIDA (perna 1) → ENTRADA_RETALHO (perna 2) → INSERT
sobra (perna 3); falha na 2 compensa a 1; falha na 3 compensa 2 e 1. Auditoria
(`entidade:'sobra'`, `acao:'gerar_retalho'`) com os ids das movimentações em `dados_novos`.

- [ ] **Step 1:** Escrever `retalhoGeracao.api.test.js` (falhando), casos com os NOMES da spec:
  - `consumo parcial gera retalho na mesma transacao`: modo `baixar_original` — saldo origem cai,
    saldo retalho sobe, sobra criada com os 2 ids de movimentação preenchidos, tudo no mesmo
    chamado.
  - `retalho referencia lote original`: origem com `controle_lote` → sem `lote_origem_id` recusa;
    com lote → sobra.lote_origem_id gravado. Controle positivo: origem sem controle_lote passa
    sem lote.
  - Modo `baixar_original: false`: só ENTRADA_RETALHO + sobra (`movimentacao_baixa_id` NULL).
  - Dono: origem do cliente X + retalho sem dono → recusa; retalho do cliente X → passa
    (controle positivo).
  - Custo: `custo_medio` do material-retalho intacto após o evento.
  - Compensação: forçar falha da perna 2 **naturalmente** — `material_retalho` com
    `controle_lote = 1` (a entrada exige lote que o payload não tem como dar) → o motor recusa a
    perna 2 → asserção: saldo do original RESTAURADO e nenhuma sobra criada. (Mesma técnica de
    injeção natural dos testes da 8b.)
  - Saldo insuficiente na origem → recusa antes de qualquer perna.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar `gerarRetalho` + `GerarRetalhoSchema`.
- [ ] **Step 4:** `npm run test:api` inteiro — verde.
- [ ] **Step 5:** SABOTAGEM: comentar a compensação da perna 1 → o teste de compensação TEM de
  cair (saldo do original ficaria baixado à toa). Reverter.
- [ ] **Step 6:** Commit: `Almoxarifado Etapa 9 Task 3: gerarRetalho — evento composto com
  guarda de dono e compensacao`.

---

### Task 4: Rotas do retalho + retalhos disponíveis por material

**Files:**
- Modify: `server/routes/almoxarifado/extended.js` (junto das rotas `/sobras`)
- Test: `server/tests/api/retalhoRotas.api.test.js` (novo)

**Interfaces:**
- Consumes: `scrapService.gerarRetalho` (Task 3), `availabilitySql.js` (a conta do disponível —
  NÃO escrever a fórmula à mão).
- Produces:
  - `POST /api/almoxarifado/sobras/gerar-retalho` — `requirePermission('movimentar')` +
    `validate(GerarRetalhoSchema)`; 201 com `{ sobra, movimentacao_baixa_id,
    movimentacao_entrada_id }`.
  - `GET /api/almoxarifado/materiais/:id/retalhos-disponiveis` — só auth (leitura, padrão do
    módulo): sobras do material de origem `:id` com `status='DISPONIVEL'`, `reutilizavel=1` E
    disponível do `material_retalho_id` > 0 (JOIN com `materiais_almoxarifado` usando
    `availabilitySql`); resposta com dimensões, localização e o disponível.

- [ ] **Step 1:** Escrever `retalhoRotas.api.test.js` (falhando): 403 para PRODUCAO no POST;
  400 Zod (sem material_origem_id); happy 201; `retalhos-disponiveis` devolve a sobra recém
  criada e **para de devolvê-la** quando o saldo do material-retalho zera (fazer a SAIDA e
  reconsultar — controle positivo do filtro de disponibilidade).
- [ ] **Step 2:** Rodar e ver falhar. **Step 3:** Implementar. **Step 4:** Suíte verde.
- [ ] **Step 5:** Commit: `Almoxarifado Etapa 9 Task 4: rota do evento e retalhos disponiveis
  por material`.

---

### Task 5: `SUCATA` sai da rota genérica — vira tipo dedicado (precedente DEVOLUCAO/Etapa 7)

**Files:**
- Modify: `server/services/almoxarifado/schema.js:147` (`TIPOS_DEDICADOS` += `'SUCATA'`, com
  comentário no molde dos vizinhos: o teste exigido pela spec 15 — "sucatear sem aprovação
  falha" — é impossível com a v2 aceitando SUCATA no gate `movimentar`; caminhos legítimos:
  processo de sucateamento (Task 6/7) e devolução destino sucata, que chama o motor por dentro)
- Modify: `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js:17-24`
  (`TIPOS_FORM`: remover SUCATA; `TIPOS` do filtro/livro linhas 32-36 MANTÉM — o livro continua
  exibindo; revisar os conjuntos derivados linhas 51-88 para SUCATA não sobrar em conjunto de
  FORM)
- Test: `server/tests/api/sucataDedicada.api.test.js` (novo)
- Test client: ajustar o teste existente da tela de Movimentações se ele listar SUCATA no form.

- [ ] **Step 1:** Escrever `sucataDedicada.api.test.js` (falhando): (a) v2 genérica recusa
  `{tipo:'SUCATA'}` com 400; (b) declaração: `'SUCATA'` em `TIPOS_DEDICADOS`; (c) regressão
  guiada: devolução com destino SUCATA continua funcionando (o par
  ENTRADA_DEVOLUCAO+SUCATA — já coberto por `devolucaoDestinos.api.test.js`, que TEM de
  continuar verde; citar no cabeçalho do teste novo). Verificar também que a rota v1 (modal
  rápido de Materiais) não aceita SUCATA — se aceitar, incluí-la na recusa.
- [ ] **Step 2:** Rodar e ver falhar. **Step 3:** Implementar servidor + front.
- [ ] **Step 4:** `npm run test:api` + suíte client + build CI — verdes.
- [ ] **Step 5:** SABOTAGEM: tirar `'SUCATA'` de `TIPOS_DEDICADOS` → (a) do teste novo cai.
  Reverter.
- [ ] **Step 6:** Commit: `Almoxarifado Etapa 9 Task 5: SUCATA sai do formulario generico — sem
  isso a dupla aprovacao seria decorativa` (corpo: precedente DEVOLUCAO da Etapa 7; PERDA fica).

---

### Task 6: Sucateamento — tabela, máquina de estados, ações de perfil e serviço

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (CREATE TABLE nova)
- Create: `server/services/almoxarifado/scrapDisposalStateMachine.js`
- Create: `server/services/almoxarifado/scrapDisposalService.js`
- Modify: `server/services/almoxarifado/permissions.js:16-47` (duas ações novas)
- Modify: `server/services/almoxarifado/schemas.js` (`SucateamentoCreateSchema`,
  `SucateamentoDestinoSchema`)
- Test: `server/tests/api/sucateamento.api.test.js` + `server/tests/api/sucateamentoAprovacao.api.test.js`

**Interfaces (Produces):**

Tabela `sucateamentos_almoxarifado` (DDL em `schema.js`, molde das vizinhas):

```sql
CREATE TABLE IF NOT EXISTS sucateamentos_almoxarifado (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL,
  lote_id INTEGER,                    -- obrigatório no serviço se o material exige lote
  sobra_id INTEGER,                   -- opcional: sucatear um retalho registrado
  quantidade REAL NOT NULL,
  classificacao TEXT,                 -- texto livre com sugestões no front (pergunta ao cliente)
  peso_estimado REAL,
  projeto_origem_id INTEGER, os_origem_id INTEGER,
  justificativa TEXT NOT NULL,        -- o motor exige na baixa; nasce obrigatória aqui
  status TEXT NOT NULL DEFAULT 'SOLICITADO',
  solicitante_id INTEGER, solicitante_nome TEXT,
  aprovador_almox_id INTEGER, aprovador_almox_nome TEXT, aprovado_almox_em DATETIME,
  aprovador_gestao_id INTEGER, aprovador_gestao_nome TEXT, aprovado_gestao_em DATETIME,
  rejeitado_por_id INTEGER, rejeitado_por_nome TEXT, motivo_rejeicao TEXT, rejeitado_em DATETIME,
  movimentacao_sucata_id INTEGER,     -- a baixa emitida na 2a aprovação
  valor_venda REAL, comprovante_arquivo TEXT,
  destino_registrado_por_id INTEGER, destino_registrado_por_nome TEXT, destino_registrado_em DATETIME,
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

`scrapDisposalStateMachine.js` — molde LITERAL de `thirdPartyStateMachine.js` (objeto
declarativo + `validarTransicao` com mensagem que nomeia atual e permitidos):

```js
const STATUS_SUCATEAMENTO = ['SOLICITADO', 'APROVADO', 'VENDIDA', 'DESCARTADA', 'REJEITADO', 'CANCELADO'];
const TRANSICOES = {
  SOLICITADO: ['APROVADO', 'REJEITADO', 'CANCELADO'],
  APROVADO: ['VENDIDA', 'DESCARTADA'],   // a baixa já aconteceu; falta o destino final
  VENDIDA: [], DESCARTADA: [], REJEITADO: [], CANCELADO: [],
};
```

(As duas pernas de aprovação NÃO são estados: são colunas. O status só vira APROVADO quando a
segunda perna assina — o diagrama do design, decisão 9.)

`permissions.js` — ações novas com comentário no critério documentado ("quando a operação muda a
natureza do risco, ela ganha ação"; entram de graça em `GET /minhas-permissoes`):

```js
aprovar_sucateamento: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE],
aprovar_sucateamento_gestao: [PERFIS.ADMINISTRADOR, PERFIS.GESTOR],
```

`scrapDisposalService.js`:
- `solicitar(db, user, payload)` — valida material existe; lote obrigatório se `controle_lote`
  (e o lote tem de ser do material); pré-checa disponível (via `availabilitySql`) ≥ quantidade;
  material de cliente: exige `projeto_origem_id`/`os_origem_id` (a baixa SUCATA está em
  `TIPOS_SAIDA_COM_DONO` — a guarda do motor vai exigir vínculo do dono na execução; recusar JÁ
  na solicitação, com a mensagem da guarda, em vez de deixar quebrar na aprovação). Audita
  (`entidade:'sucateamento'`, `acao:'solicitar'`).
- `aprovar(db, user, id, perna)` — `perna ∈ {'almoxarifado','gestao'}`. Segregação ANTES do
  claim: solicitante não aprova nenhuma perna; quem assinou uma perna não assina a outra
  (comparar `user.id` com `solicitante_id` e com o aprovador da outra perna). Claim em UPDATE
  ÚNICO guardado no WHERE (anti-corrida, o padrão da base):

```sql
UPDATE sucateamentos_almoxarifado
   SET aprovador_almox_id = ?, aprovador_almox_nome = ?, aprovado_almox_em = CURRENT_TIMESTAMP,
       status = CASE WHEN aprovador_gestao_id IS NOT NULL THEN 'APROVADO' ELSE status END,
       updated_at = CURRENT_TIMESTAMP
 WHERE id = ? AND status = 'SOLICITADO' AND aprovador_almox_id IS NULL
```

  (espelho para a perna gestão). Se o UPDATE pegou 0 linhas → 409 explicando (já aprovada essa
  perna, ou não está mais SOLICITADO). Se essa assinatura completou as duas → emitir a baixa
  `SUCATA` pelo motor (`registrarMovimentacao` com a justificativa da solicitação + lote); se o
  motor recusar (saldo mudou desde a solicitação), **compensar o claim** (UPDATE devolvendo
  status='SOLICITADO' e limpando a perna recém-assinada) e devolver o erro do motor. Sucesso:
  gravar `movimentacao_sucata_id`. Audita cada aprovação.
- `rejeitar(db, user, id, motivo)` — exige motivo; permitido a quem pode aprovar QUALQUER perna;
  claim `WHERE status='SOLICITADO'`. Audita.
- `cancelar(db, user, id)` — só o solicitante, só em SOLICITADO. Audita.
- `registrarDestino(db, user, id, { destino, valor_venda, comprovante_arquivo })` — destino
  `'VENDIDA'` exige `valor_venda > 0`; `'DESCARTADA'` não; claim `WHERE status='APROVADO'`.
  Audita.
- `listar(db, filters)` — status, material_id; JOIN nome do material + `SeloProprietario` data
  (`proprietario_cliente_id` no SELECT).

- [ ] **Step 1:** Escrever os dois arquivos de teste (falhando):
  - `sucateamento.api.test.js`: solicitar happy; sem justificativa → Zod 400; lote obrigatório
    com `controle_lote`; disponível insuficiente → recusa; material de cliente sem projeto/os →
    recusa nomeando a guarda do dono (controle positivo: com projeto passa); cancelar pelo
    solicitante; cancelar por outro → recusa; auditoria de solicitar/cancelar.
  - `sucateamentoAprovacao.api.test.js` (o teste da spec: `sucatear sem aprovacao falha` +
    `material sucateado fora do disponivel`): uma perna só NÃO baixa (saldo intacto, status
    SOLICITADO); solicitante tenta aprovar → 403/recusa; mesmo usuário nas duas pernas →
    recusa; segunda perna (usuário distinto, perfil certo) → status APROVADO, movimentação
    SUCATA no livro, `quantidade_atual` e disponível caem; perfil PRODUCAO em
    `/aprovar-*` → 403 (gate real); aprovar perna já assinada → 409; rejeitar com motivo;
    compensação: entre solicitação e 2ª aprovação, consumir o saldo por SAIDA → 2ª aprovação
    falha E o claim volta (status SOLICITADO, perna limpa) — controle positivo da compensação.
- [ ] **Step 2:** Rodar e ver falhar. **Step 3:** Implementar tudo acima.
- [ ] **Step 4:** Suíte inteira verde.
- [ ] **Step 5:** SABOTAGEM (duas): (a) remover a checagem "mesmo usuário nas duas pernas" → o
  teste de segregação TEM de cair; (b) remover a compensação do claim → o teste de compensação
  TEM de cair. Reverter.
- [ ] **Step 6:** Commit: `Almoxarifado Etapa 9 Task 6: sucateamento com dupla aprovacao
  segregada e baixa pelo motor na segunda assinatura`.

---

### Task 7: Rotas do sucateamento, upload de comprovante e relatório financeiro

**Files:**
- Modify: `server/routes/almoxarifado/extended.js` (bloco novo de rotas + chave nova no
  dispatcher de relatórios ~linha 807)
- Modify: `server/routes/almoxarifado.js` (multer do comprovante — molde `uploadCertificado`
  em `routes/almoxarifado.js:65-72`: PDF+imagem, nome `comprovante-sucata-<ts>-<rand><ext>`,
  mesmo diretório de uploads; apagar o comprovante anterior órfão ao substituir, espelhando a
  rota de certificado `:520-540`) — OU manter o multer em `extended.js` se for onde as rotas
  moram; seguir onde `uploadCertificado` está e não duplicar config.
- Modify: `server/services/almoxarifado/reportService.js` (relatório)
- Test: `server/tests/api/sucateamentoRotas.api.test.js` (novo)

**Interfaces (Produces):**
- `POST /api/almoxarifado/sucateamentos` — `requirePermission('movimentar')` +
  `validate(SucateamentoCreateSchema)`.
- `GET /api/almoxarifado/sucateamentos?status=&material_id=` — só auth.
- `POST /api/almoxarifado/sucateamentos/:id/aprovar-almoxarifado` —
  `requirePermission('aprovar_sucateamento')`.
- `POST /api/almoxarifado/sucateamentos/:id/aprovar-gestao` —
  `requirePermission('aprovar_sucateamento_gestao')`.
- `POST /api/almoxarifado/sucateamentos/:id/rejeitar` — middleware inline: passa se
  `can(user,'aprovar_sucateamento') || can(user,'aprovar_sucateamento_gestao')` (403 senão).
- `POST /api/almoxarifado/sucateamentos/:id/cancelar` — `requirePermission('movimentar')`
  (o serviço restringe ao solicitante).
- `POST /api/almoxarifado/sucateamentos/:id/destino` — `requirePermission('movimentar')`,
  multipart opcional `comprovante` + campos `destino`/`valor_venda`
  (`validate(SucateamentoDestinoSchema)` nos campos).
- Relatório `sucata-financeiro` no dispatcher (`reportService.relatorioSucataFinanceiro(db,
  { de, ate })`): movimentações `SUCATA` no período (quantidade, material, valor estimado =
  quantidade × `custoUnitarioSql('m')` — **fonte única**, com a nota de limitação: valoração
  pelo custo ATUAL, movimentação não guarda custo histórico — decisão 10 da 8c) + sucateamentos
  `VENDIDA` (valor_venda somado) + total por classificação.

- [ ] **Step 1:** Escrever `sucateamentoRotas.api.test.js` (falhando): 403s por rota (PRODUCAO
  em aprovar-almoxarifado; ALMOXARIFE em aprovar-gestao — perfil errado na perna errada);
  destino VENDIDA sem valor → 400; destino com valor → estado final; relatório: criar uma
  SUCATA via processo E uma via devolução-destino-sucata → as DUAS aparecem no total (prova que
  o relatório lê o LIVRO — o consumidor declarado da spec 12); valor estimado bate com
  `custoUnitarioSql` (material com `custo_medio > 0` para o CASE morder — a lição das fixtures
  da 8c: incluir também material só com `custo_unitario`, que o COALESCE antigo zerava).
- [ ] **Step 2:** Rodar e ver falhar. **Step 3:** Implementar. **Step 4:** Suíte verde.
- [ ] **Step 5:** Commit: `Almoxarifado Etapa 9 Task 7: rotas do sucateamento, comprovante e
  relatorio financeiro lendo o livro`.

---

### Task 8: Tela "Sobras e Retalhos" — retalhos + gerar retalho + hint na saída

**Files:**
- Create: `client/src/components/almoxarifado/SobrasAlmoxarifado.js` (+ estilos no
  `Almoxarifado.css` existente se precisar)
- Modify: `client/src/routes/lazyModules.js:130-155` (export lazy + prefetch)
- Modify: `client/src/App.js:457-495` (rota `sobras` no bloco `/almoxarifado`)
- Modify: `client/src/components/Layout.js:326-350` (`almoxarifadoMenuItems` — label
  "Sobras e Retalhos"; respeitar a disciplina de rótulos vizinhos comentada em `:338-344`)
- Modify: `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js` (badge/cor do tipo
  `ENTRADA_RETALHO` no livro — a lição do `d117dc2`; e o hint: ao selecionar material em SAIDA,
  `GET /materiais/:id/retalhos-disponiveis` com guard `let cancelado` → aviso não bloqueante
  "Existem N retalhos deste material — considere usá-los" com link para `/almoxarifado/sobras`)
- Test: `client/src/components/almoxarifado/SobrasAlmoxarifado.test.js` (novo, RTL no molde dos
  testes das telas recentes)

**Conteúdo da tela (visão Retalhos):** lista (`GET /sobras` com filtros material origem/`q`/
status) com colunas código origem→retalho, dimensões restantes, peso, localização, status,
`SeloProprietario` do material-retalho; modal "Gerar retalho" com os DOIS modos
(`baixar_original` checkbox controla os campos de baixa/vínculo), atalho "criar material do
retalho" (molde `RemessasTerceirosAlmoxarifado.js:289-294` — POST de material herdando
`proprietario_cliente_id` E `categoria` do original, gate `criar_material` via
`bloquearSeNaoPode`); edição de status/localização/observações (PUT); ações gateadas por
`useAlmoxPermissoes`.

- [ ] **Step 1:** Escrever o teste RTL (falhando): renderiza lista com dados mockados
  (fetch mock), abre o modal de gerar retalho, alterna `baixar_original` e vê os campos de
  vínculo aparecerem/sumirem, submissão chama `POST /sobras/gerar-retalho` com o payload
  esperado.
- [ ] **Step 2:** Rodar suíte client e ver falhar. **Step 3:** Implementar tela + rota + menu +
  hint + badge. **Step 4:** Suíte client + `CI=true` build — verdes.
- [ ] **Step 5:** Commit: `Almoxarifado Etapa 9 Task 8: tela Sobras e Retalhos, gerar retalho e
  a sugestao de retalho na saida`.

---

### Task 9: Sucateamento na tela + etiqueta de retalho (paga a pendência da 6c)

**Files:**
- Modify: `client/src/components/almoxarifado/SobrasAlmoxarifado.js` (aba/visão Sucateamentos)
- Modify: `client/src/utils/etiquetasPdf.js` (montador novo)
- Test: `client/src/utils/etiquetasPdf.test.js` (casos novos no arquivo existente de testes do
  util, se houver; senão criar) e ampliar `SobrasAlmoxarifado.test.js`

**Interfaces:**
- `montarEtiquetaRetalho(sobra, materialRetalho)` → descritor `{ codigo, nome, linhaControle,
  qrUrl }` (o contrato-moeda de `etiquetasPdf.js:2`): `codigo` = código do material-retalho;
  `linhaControle` = dimensões restantes + peso (ex.: `1200x800x3mm · ~18kg`); `qrUrl` =
  `${window.location.origin}/almoxarifado/sobras?sobra_id=<id>`.
- Deep-link: `SobrasAlmoxarifado` lê `?sobra_id=` no mount e destaca a linha (molde do destaque
  de `?material_id=` das telas da 6c).
- Aba Sucateamentos: lista com badges por status (cores no CSS existente), "Solicitar
  sucateamento" (modal — material, quantidade, lote quando exigido, classificação com
  `datalist` de sugestões `aço carbono, inox, alumínio, cobre, cavaco, misto`, peso,
  justificativa), botões Aprovar (um por perna, visíveis conforme `minhas-permissoes` e
  escondidos para o próprio solicitante — o backend barra de qualquer jeito), Rejeitar (motivo
  obrigatório), Registrar destino (VENDIDA exige valor; upload de comprovante multipart),
  Cancelar (só solicitante em SOLICITADO). Botão "Sucatear" também na linha do retalho
  (pré-preenche `sobra_id`/material).

- [ ] **Step 1:** Testes (falhando): montador — conteúdo do descritor e truncagem na
  `TERMICA_100x50` (linhaControle longa não estoura — mesma asserção dos montadores vizinhos);
  tela — fluxo de solicitar e visibilidade dos botões de aprovar conforme permissões mockadas.
- [ ] **Step 2:** Ver falhar. **Step 3:** Implementar. **Step 4:** Suíte client + build CI
  verdes; `EtiquetasPdfModal` recebendo `null`/`[]` conforme o contrato (null fecha, [] abre
  desabilitado).
- [ ] **Step 5:** Commit: `Almoxarifado Etapa 9 Task 9: fluxo de sucateamento na tela e
  etiqueta de retalho com QR`.

---

### Task 10: Documentação e verificação final (skill `fechar-etapa`)

**Files:** os cinco de sempre + manual:
- `specs/modulo-almoxarifado/15-retalhos-sucatas/README.md` (status, checklist item a item com
  hash; item de e-mail marcado como fora de escopo → feature 19, dito ali)
- `specs/modulo-almoxarifado/README.md` (cabeçalho nova entrada + linha da feature 15 no mapa;
  registrar a decisão 9b para a feature 16)
- `docs/almoxarifado-guia-etapas-e-testes.md` (cabeçalho "onde parou" + seção da Etapa 9 com
  Antes→Agora — DESTAQUE para a mudança de comportamento: SUCATA sumiu do formulário de
  Movimentações — e roteiro clicável com 2 usuários para a dupla aprovação)
- `docs/almoxarifado-novidades-por-etapa.md` (seção da etapa no molde: Em uma frase / Novo
  visível / Por baixo do capô / Antes→Agora, com cenários demonstráveis ao vivo)
- `docs/almoxarifado-manual-sistema.md` (ou o nome real do manual criado em `fff42a4` —
  verificar; seção de sobras/sucateamento em linguagem de operador)
- este plano (tasks marcadas, achados registrados)

- [ ] **Step 1:** Invocar a skill `fechar-etapa` e seguir o checklist dela por inteiro.
- [ ] **Step 2:** Rodar TODAS as suítes e citar números reais no commit e nos docs
  (`test:api`, `test:almoxarifado`, `test:validation`, `test:safealter`, `test:sqlite`, client,
  build CI).
- [ ] **Step 3:** Commit final de documentação.

**Pendencia registrada na execucao (Task 2):** nao existe guarda automatica que garanta "todo tipo
novo em `schema.js` `TIPOS_MOVIMENTO` tem de estar em `movementTypes.TIPOS_ENTRADA` ou
`TIPOS_SAIDA`, salvo excecao nomeada (AJUSTE/ESTORNO/TRANSFERENCIA/retencoes...)". A sabotagem da
Task 2 provou que `clientePosicaoTipos.api.test.js` NAO pega esse esquecimento — desde a 8c ele
itera a propria lista `movementTypes.TIPOS_ENTRADA`/`TIPOS_SAIDA`, entao um tipo ausente dali fica
invisivel para aquele teste; so o teste de DECLARACAO do tipo novo pega. Nao foi construida agora
porque exige uma lista de excecoes mantida (design em aberto, nao achado a corrigir em Task 2) —
Task 10/9b precisa levar isto para as pendencias da spec da feature 15.

---

## Self-review do plano (feito na escrita)

- **Cobertura da spec 15:** auditoria do CRUD (T1), consumo parcial atômico (T3), vínculo
  lote/corrida (T3), campos completos (T1), etiqueta (T9), disponibilidade sugerindo retalho
  (T4+T8), retalho de cliente (T3), classificação (T6), dupla aprovação (T6/T7), transferência
  para área de sucata (já existe — guia, T10), venda/descarte com comprovante (T6/T7),
  relatório financeiro (T7), e-mail (fora de escopo declarado, T10), telas (T8/T9). Os 4 testes
  nomeados da spec: T3 (2), T6 (2).
- **Tipos consistentes:** `gerarRetalho(db, user, payload)` (T3) é o que T4 consome;
  `aprovar(db, user, id, perna)` (T6) é o que T7 consome; o descritor de etiqueta (T9) segue o
  contrato-moeda existente.
- **Sem placeholders:** cada task tem arquivos exatos, contratos, casos de teste concretos e
  sabotagem executável.
