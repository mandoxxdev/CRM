# Almoxarifado Etapa 20 — Exposição e rastro: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** A rota de foto para de mentir sucesso e de deixar órfão, o `GET /configuracoes` para
de devolver segredo em claro (e o `PUT` genérico para de aceitar segredo), e ler o mapa de
permissões passa a exigir o mesmo que escrevê-lo.

**Architecture:** três mudanças pontuais, cada uma copiando molde que já existe no módulo.
`limparUploadOrfao` sai do closure de `extended.js` para um módulo compartilhado.

**Spec:** `docs/superpowers/specs/2026-08-28-almoxarifado-etapa20-exposicao-e-rastro-design.md`

## Global Constraints

- Os das etapas 16-19 (harness real, testes em `server/tests/api/*.api.test.js`, controle
  positivo obrigatório, commits pt sem acento no corpo, `git add` explícito).
- **Commitar ANTES de sabotar** (3 ocorrências de `git checkout` apagando correção não
  commitada no histórico do módulo).
- Script de edição de documento **sempre com `assert`** (no-op silencioso já aconteceu).
- Auditoria pós-escrita, best-effort, `audit.registrarAuditoria` **por objeto**.
- **Harness:** `denyUnlessAlmoxAdmin`/`canConfigureAlmox` NÃO aceitam `role:'admin'` puro —
  usar `is_superadmin: 1` ou `perfil_almoxarifado: 'ADMINISTRADOR'`.

## RN (enunciado no design)

| ID | Resumo |
|---|---|
| RN-01 | Foto em material inexistente → 404 `Material não encontrado`, sem arquivo no disco |
| RN-02 | Nenhuma saída ≠ 200 deixa órfão |
| RN-03 | Foto anterior só é apagada DEPOIS do UPDATE, em try/catch |
| RN-04 | Trocar foto audita (`material`/`ATUALIZACAO`, de/para do arquivo) |
| RN-05 | `GET /configuracoes` mascara os 3 valores sensíveis |
| RN-06 | `PUT /configuracoes` recusa as 2 chaves secretas (400, coluna intacta) |
| RN-07 | `GET` do mapa de permissões exige `isSystemAdmin \|\| canConfigureAlmox` |

## Contratos congelados

### C1 — `services/almoxarifado/uploadCleanup.js` (novo)

Extrai o corpo de `limparUploadOrfao` (hoje em `extended.js:889-895`, dentro do closure e não
exportada). Assinatura: `limparUploadOrfao(req, dir)` — `req.file?.filename` + `path.join`,
`fs.unlinkSync` em try/catch silencioso. `extended.js` passa a importar e a sua função local
vira um wrapper de uma linha com `uploadsAlmoxDir` (o dir vem por parâmetro do closure).
**Nenhuma mudança de comportamento nas 4 rotas que já a usam** — o teste delas prova.

### C2 — `POST /materiais/:id/foto` (`routes/almoxarifado.js:646`)

Ordem: gate (já correto, antes do multer) → `SELECT id, codigo, nome, foto` →
ausente: **404** `{ error: 'Material não encontrado' }` **+ limpa órfão** → `UPDATE` →
`unlink` da foto anterior em try/catch (**depois** do UPDATE, molde da rota de certificado,
`almoxarifado.js:691-698`) → auditoria `material`/`ATUALIZACAO` com
`dados_anteriores: { foto: <anterior> }`, `dados_novos: { foto: <novo>, codigo, nome }` →
`res.json({ foto, foto_url })` (resposta **inalterada**). Erro de banco: 500 **+ limpa órfão**.

### C3 — máscara no `GET /configuracoes` (`almoxarifado.js:2308`)

Na montagem da resposta (`:2313`), por chave:
- `alertas_smtp_pass`, `alertas_whatsapp_api_key` → `valor` vira `PASSWORD_MASK` (`'********'`,
  `alertService.js:17`) quando houver valor não-vazio; `''` quando não houver — **idêntico ao
  que `getAlertSettingsForApi` já devolve** (`alertService.js:162-164`).
- `alertas_whatsapp_webhook_url` → `configDiff.mascararUrl(valor)` (mantém host e caminho,
  troca a query string por `(credenciais omitidas)`).
- `descricao` e `id` inalterados.

### C4 — guarda no `PUT /configuracoes` (`almoxarifado.js:2329`)

Ao lado das guardas de prefixo já existentes (`PREFIXOS_DIAS`, `CHAVES_BOOL`): chave em
`configDiff.CHAVES_SECRETAS` → **400**
`{ error: 'Configuração "<chave>" só pode ser alterada em Configurações → Alertas de Estoque' }`,
**antes** de qualquer UPDATE (a rota já valida tudo antes de gravar qualquer coisa — o
comentário em `:2340` explica o porquê). Nenhuma coluna é tocada.

### C5 — gate do `GET /setores-requisicao/:id/permissoes` (`extended.js:1552`)

`if (!isSystemAdmin(req.user) && !canConfigureAlmox(req.user)) return res.status(403).json(...)`
— **copiar literalmente** o bloco do PUT irmão (`extended.js:1559-1561`), incluindo a mensagem.

## Sort topológico

| Task | Tipo | Depende de |
|---|---|---|
| 1. C1 + C2 (uploadCleanup + rota de foto) | **tronco** | — |
| 2. C3 + C4 (segredo no GET e no PUT de configurações) | **tronco** | — (mesmo arquivo da T1 → serializar) |
| 3. C5 (gate do GET de permissões) | **galho** | — (`extended.js`, arquivo diferente) |

T3 roda em paralelo com T2. Sem task de jornada: as três são independentes entre si e não
compõem um fluxo — a integração já é coberta pelas suítes existentes.

---

### Task 1 (tronco): uploadCleanup + rota de foto

**Files:** Create `server/services/almoxarifado/uploadCleanup.js`; Modify
`server/routes/almoxarifado/extended.js` (passa a importar), `server/routes/almoxarifado.js`
(rota de foto); Test `server/tests/api/fotoMaterialRastro.api.test.js`.

- [ ] **Step 1: teste que falha** — RN-01 (404 + **zero** arquivos novos no diretório,
  contando antes/depois no molde de `permissoesRotas.api.test.js:535-549`); RN-02 (erro de
  banco: sabotar? não — usar id inexistente já cobre a limpeza; acrescentar caso de **403**
  provando que o gate roda antes do multer, que já existe e serve de controle);
  RN-03 (trocar a foto de um material que já tem: a antiga some do disco, a nova fica, e a
  coluna aponta para a nova); RN-04 (linha `material`/`ATUALIZACAO` com o de/para do arquivo);
  e um caso provando que **as 4 rotas que já usavam `limparUploadOrfao` continuam limpando**
  (rodar `node tests/api/sucateamentoDestino*.api.test.js` e as de ferramenta/assinatura).
- [ ] **Step 2: rodar e ver falhar.**
- [ ] **Step 3: implementar** (C1 primeiro, depois C2).
- [ ] **Step 4: verde + controle positivo** — remover a limpeza do caminho de 404 e ver o
  cenário de contagem de arquivos falhar; reverter (**commitar antes**). `npm run test:api`.
- [ ] **Step 5: commit.**

### Task 2 (tronco): segredo no GET e no PUT de configurações

**Files:** Modify `server/routes/almoxarifado.js`; Test
`server/tests/api/configuracoesSegredo.api.test.js`.

- [ ] **Step 1: teste que falha** — RN-05 com **asserção negativa explícita** (o valor real
  gravado no banco **não** aparece em nenhum lugar do corpo do GET) para as 3 chaves, e
  asserção positiva de que `descricao`/`id` e as 18 chaves da tela continuam iguais; RN-06
  (400 com a mensagem literal + a coluna intacta depois); e o **controle de compatibilidade**:
  a rota de alertas continua devolvendo `'********'` e o `shouldUpdateSecret` continua
  funcionando (reenviar a máscara pela rota de alertas **não** grava).
- [ ] **Step 2: rodar e ver falhar; implementar; verde.**
- [ ] **Step 3: controle positivo** — desligar a máscara e ver o cenário negativo falhar;
  reverter (**commitar antes**). `npm run test:api`, com
  `node tests/api/configuracoesGerais.api.test.js` e os 4 de auditoria rodados explicitamente
  (todos usam o GET para montar payload).
- [ ] **Step 4: commit.**

### Task 3 (galho): gate do GET de permissões

**Files:** Modify `server/routes/almoxarifado/extended.js`; Test
`server/tests/api/permissoesSetorLeitura.api.test.js`.

- [ ] **Step 1: teste que falha** — matriz de perfis no GET (o endpoint **não tem nenhum teste
  hoje**): superadmin → 200, admin de módulo → 200, `role:'admin'` → 200 (o gate aceita),
  ALMOXARIFE/GESTOR/COMPRAS/PRODUCAO/CONSULTA e sem-perfil → **403** com a mensagem do PUT
  irmão; e que o 200 devolve a mesma forma de antes.
- [ ] **Step 2: implementar; verde; controle positivo** (remover o gate → matriz falha;
  reverter, **commitar antes**). `npm run test:api`; commit.

---

## Execução (estado)

- [ ] Fase 2 — revisão do plano por agente fresco
- [ ] Task 1 · [ ] Task 2 · [ ] Task 3
- [ ] Fase 4 — suíte completa serial
- [ ] Fase 5 — revisão adversarial (2 lentes)
- [ ] Fase 6 — fechar-etapa + retro

## Retro (preencher no fechamento)

- Rodadas de correção até verde: —
- Achados da revisão: reais — / ruído —
- Paralelismo real: —
- Defeito que escapou: —
