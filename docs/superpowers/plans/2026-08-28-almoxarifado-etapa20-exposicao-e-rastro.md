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
`fs.unlinkSync` em try/catch **que LOGA** (`console.warn`) — a implementação atual loga
(`extended.js:891-894`) e o C1 promete "nenhuma mudança de comportamento", então extrair
"silencioso" seria a própria mudança (achado A11). **Trocar a mensagem**, que hoje diz
"comprovante de sucata órfão" e já mente para calibração/ocorrência/assinatura — vai mentir
mais ainda para foto de material.

`extended.js` importa **com alias** (`limparUploadOrfaoEm`) ou como módulo — importar com o
mesmo nome colide com a `function limparUploadOrfao` local do arquivo (achado A12). São
**4 rotas / 8 call sites** (`extended.js:915, 923, 1003, 1010, 1090, 1097, 1139, 1152` —
achado A13). `uploadsAlmoxDir` **não é variável de módulo**: é o 4º parâmetro de
`registerExtendedRoutes` (`extended.js:93`), passado por `almoxarifado.js:3449` com o valor
de `almoxarifado.js:146` — o mesmo diretório onde o `uploadAlmox` da rota de foto grava.

### C2 — `POST /materiais/:id/foto` (`routes/almoxarifado.js:646`)

Ordem: gate (já correto, antes do multer) → `SELECT id, codigo, nome, foto` →
ausente: **404** `{ error: 'Material não encontrado' }` **+ limpa órfão** → `UPDATE` →
`unlink` da foto anterior em try/catch (**depois** do UPDATE, molde da rota de certificado,
`almoxarifado.js:691-698`) → auditoria `material`/`ATUALIZACAO` **em try/catch com
`console.error`** (molde no mesmo arquivo: `:574-582` e `:624-633` — achado A8) com
`dados_anteriores: { foto: <anterior> }`, `dados_novos: { foto: <novo>, codigo, nome }` →
`res.json({ foto, foto_url })` (resposta **inalterada**). Erro de banco: 500 **+ limpa órfão**.

### C3 — máscara no `GET /configuracoes` (`almoxarifado.js:2308`)

**PRÉ-REQUISITO (achado A1, BLOQUEANTE):** `routes/almoxarifado.js:48` importa
`const { calcularDiff } = require('.../configDiff')` — **desestruturado**. Escrever
`configDiff.CHAVES_SECRETAS` como o contrato pedia daria **ReferenceError na primeira
request**. Trocar por `const configDiff = require('../services/almoxarifado/configDiff');` e
ajustar a chamada de `calcularDiff` que já existe (`:2409`) para `configDiff.calcularDiff`.
(`alertService` já é namespace em `:10`, então `alertService.PASSWORD_MASK` funciona.)

Na montagem da resposta (`:2313`), por chave:
- `alertas_smtp_pass`, `alertas_whatsapp_api_key` → `valor` vira `PASSWORD_MASK` (`'********'`,
  `alertService.js:17`, exportado em `:814`) quando houver valor não-vazio; `''` quando não
  houver — **idêntico ao que `getAlertSettingsForApi` já devolve** (`alertService.js:162-164`).
- **`alertas_whatsapp_webhook_url` FICA DE FORA da máscara** (decisão do achado A5, registrar
  na letra B). Três razões medidas: (1) a rota irmã de alertas devolve o webhook **em claro**
  sob o **mesmo gate** (`alertService.js:163`), então mascarar num dos dois GETs não reduz
  exposição nenhuma; (2) mascarar o GET **sem** guardar o PUT criaria o pior caso — quem
  lesse `?(credenciais omitidas)` e reenviasse **gravaria a máscara como URL e mataria as
  notificações em silêncio**; (3) a preocupação de fundo (registro permanente) **já está
  resolvida**: o log de auditoria mascara a query string desde a Etapa 19
  (`configDiff.mascararUrl`), e é o log que é imutável — a coluna guarda só o valor atual.
  Descartado também usar `mascararUrl` no GET porque seu fallback devolve `'(alterado)'`
  (`configDiff.js:44,54`), vocabulário de log numa resposta de API (achado A6).
- `descricao` e `id` inalterados.

### C4 — guarda no `PUT /configuracoes` (`almoxarifado.js:2329`)

Ao lado das guardas de prefixo já existentes (`PREFIXOS_DIAS`, `CHAVES_BOOL`): chave em
`configDiff.CHAVES_SECRETAS` → **400**
`{ error: 'Configuração "<chave>" só pode ser alterada em Configurações → Alertas de Estoque' }`,
**antes** de qualquer UPDATE — verificado: o laço de validação vai de `:2376` a `:2390` e o de
UPDATE começa em `:2391`; o comentário que explica a ordem está em `:2338-2339` (não `:2340`,
achado A14). Nenhuma coluna é tocada.

### C5 — gate do `GET /setores-requisicao/:id/permissoes` (`extended.js:1552`)

`if (!isSystemAdmin(req.user) && !canConfigureAlmox(req.user)) return res.status(403).json(...)`
— **copiar literalmente** o bloco do PUT irmão (`extended.js:1559-1561`), incluindo a mensagem.

## Sort topológico

| Task | Tipo | Depende de |
|---|---|---|
| 1. C1 + C2 (uploadCleanup + rota de foto) | **tronco** | — |
| 2. C3 + C4 (segredo no GET e no PUT de configurações) | **tronco** | — (mesmo arquivo da T1 → serializar) |
| 3. C5 (gate do GET de permissões) | **galho** | — (paralela a **T2**; **serializa com a T1**) |

**Correção do achado A4:** a T1 **também** toca `extended.js` (o C1 troca `limparUploadOrfao`
pelo wrapper), então T1‖T3 **não** é seguro — os pares reais de colisão são T1∩T2
(`routes/almoxarifado.js`) e T1∩T3 (`extended.js`). A única combinação paralela segura é
**T2‖T3**. Na prática a T3 já foi executada e commitada (`8c0feff`), então a ordem real é:
T3 (feita) → T1 → T2. Sem task de jornada: as três não compõem um fluxo.

---

### Task 1 (tronco): uploadCleanup + rota de foto

**Files:** Create `server/services/almoxarifado/uploadCleanup.js`; Modify
`server/routes/almoxarifado/extended.js` (passa a importar), `server/routes/almoxarifado.js`
(rota de foto); Test `server/tests/api/fotoMaterialRastro.api.test.js`.

- [x] **Step 1: teste que falha** (`6cb594e`) — RN-01 (404 + **zero** arquivos novos no diretório; o
  helper `contarArquivosUpload` está em `permissoesRotas.api.test.js:108` e depende do
  `uploadsAlmoxDir` que o harness devolve, `tests/helpers/testApp.js:80` — o cenário-molde é
  `:535-549`); RN-03 (trocar a foto de um material que já tem: a antiga some do disco, a nova
  fica, a coluna aponta para a nova); RN-04 (linha `material`/`ATUALIZACAO` com o de/para do
  arquivo); e regressão das rotas que já usavam a limpeza: rodar
  `node tests/api/sucateamentoRotas.api.test.js` (**este é o nome real** — `sucateamentoDestino*`
  não existe, achado A2), `toolCalibracao`, `toolOcorrencia` e `requisicaoAssinaturaEntrega`.

  **RN-02, ramo "erro de banco": FICA SEM TESTE, e o motivo é este** (achado A7 — o CLAUDE.md
  exige dizer o porquê em vez de deixar desmarcado): `almoxarifado.js:35` desestrutura
  `const { dbRun, dbGet, dbAll }`, então o stub não alcança o call site (mesma armadilha
  documentada em `auditoriaConfiguracoes.api.test.js:456-461`). O ramo de 404 cobre a
  limpeza; o de erro de banco fica como código não exercitado, declarado.

  **RN-02, ramo 403: não existe arquivo para limpar** — `requirePermission` roda **antes** do
  multer, então nada foi gravado. O teste existente (`permissoesRotas.api.test.js:535-549`)
  já prova isso e serve de controle; a RN-02 do design está errada ao incluir o 403 e será
  corrigida no fechamento (achado A9).
- [x] **Step 2: rodar e ver falhar** (`6cb594e`) — **vermelho: 4 passed, 5 failed + o processo
  ABORTADO** no último cenário: `EISDIR: illegal operation on a directory, unlink` subindo de
  `almoxarifado.js:657` dentro de um callback do sqlite3, sem catch nenhum acima. O defeito 3
  do design (`unlinkSync` sem try/catch em fire-and-forget) não é só "não derruba a resposta":
  derruba o **processo**. Os 4 que passavam no vermelho passavam por motivo honesto — a troca de
  foto já apagava a anterior, o 400 sem arquivo já existia, e o "404 não audita" passava vazio
  (não havia auditoria nenhuma), que é justamente por que o cenário de auditoria tem asserção de
  `chamado`.
- [x] **Step 3: implementar** (`6cb594e`) — C1: `services/almoxarifado/uploadCleanup.js`,
  `limparUploadOrfao(req, dir)` com o `console.warn` preservado e mensagem genérica; `extended.js`
  importa com alias `limparUploadOrfaoEm` e os **8 call sites / 4 rotas** trocados por script com
  `assert` de contagem (8 antes, 8 depois, zero chamadas da forma antiga). C2: SELECT antes → 404
  + limpeza → UPDATE → unlink da anterior em try/catch → auditoria em try/catch com
  `console.error` → resposta inalterada.
- [x] **Step 4: verde + controle positivo** (`6cb594e`) — **10 passed, 0 failed**. Controle
  positivo: limpeza removida do caminho de 404 por script com `assert` → **9 passed, 1 failed**,
  e o que caiu foi exatamente `[RN-01/RN-02] o 404 nao deixa arquivo no disco` (só ele — os
  outros 9 continuaram verdes, então a asserção de disco é a que mede a limpeza e não pega
  carona em nada). Revertido com `git checkout` **depois** do commit. `npm run test:api`:
  **140/140 arquivos OK**. Regressão das 4 rotas que já usavam a limpeza, rodadas
  explicitamente: `sucateamentoRotas` 15/0, `toolCalibracao` 10/0, `toolOcorrencia` 9/0,
  `requisicaoAssinaturaEntrega` 9/0, e `permissoesRotas` 46/0 (o controle do ramo 403).
- [x] **Step 5: commit** (`6cb594e`).

  **Divergência do contrato, declarada:** o C1 dizia "importar com alias **ou como módulo**" e
  enumerava os 8 call sites. Escolhida a extração COMPLETA (função local apagada, call sites
  passando `uploadsAlmoxDir` explícito) em vez de deixar um wrapper local de 1 argumento: com o
  wrapper, os 8 call sites não mudariam e enumerá-los no achado A13 não teria sentido. O comentário
  longo que explicava a função continua em `extended.js`, apontando para o módulo novo.

  **Acrescentado ao previsto:** um cenário para o try/catch do unlink da anterior (foto anterior =
  **diretório** → `fs.existsSync` true, `unlinkSync` EISDIR) e um para "auditoria que lança não
  derruba o ato" (stub em `audit.registrarAuditoria` com flag `chamado`, senão uma rota que não
  auditasse passaria verde). O cenário do diretório é o **último do arquivo de propósito**: no
  vermelho ele leva o runner junto, e os demais já reportaram.

### Task 2 (tronco): segredo no GET e no PUT de configurações

**Files:** Modify `server/routes/almoxarifado.js`; Test
`server/tests/api/configuracoesSegredo.api.test.js`.

- [ ] **Step 1: teste que falha** — RN-05 com **asserção negativa explícita** para as **2**
  chaves secretas (o webhook saiu do escopo — C3). **A asserção negativa só vale se o segredo
  estiver MESMO na coluna** (achado A3: gravá-lo pelo PUT genérico daria 400 depois do C4, a
  coluna ficaria `''` — a semente é `''`, `schema.js:1799-1803` — e o teste passaria provando
  zero). Gravar por `PUT /configuracoes/alertas-estoque` **ou** `dbRun` direto, **assertar a
  coluna antes** (molde exato: `auditoriaConfiguracoes.api.test.js:281-282`) e só então checar
  o GET. Idem RN-06: pôr valor não-vazio ANTES do 400, senão "coluna intacta" compara `''`
  com `''`. Mais: asserção positiva de que
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

- [x] **Step 1: teste que falha** (`8c0feff`) — `permissoesSetorLeitura.api.test.js`, matriz de
  perfis no GET (o endpoint **não tinha nenhum teste**): superadmin, admin de módulo,
  `role:'admin'` e perfil `ADMINISTRADOR` → 200; ALMOXARIFE/GESTOR/COMPRAS/PRODUCAO/CONSULTA e
  sem-perfil → **403** com a mensagem do PUT irmão. Acrescentado ao previsto: a forma do 200
  congelada nas **13 chaves** de `getPermissoesSetor` (o gate não pode "passar" mudando o
  corpo), um caso que assere `deepStrictEqual` entre o corpo do 403 do GET e o do PUT (a cópia
  literal não pode divergir depois) e a asserção de que o 403 não vaza nome de material/família.
  **Vermelho: 6 passed, 7 failed** — os 6 perfis que hoje recebem 200 + a paridade de mensagem;
  o caso de forma já passava (prova que a asserção de shape estava certa ANTES da mudança).
- [x] **Step 2: implementar; verde; controle positivo** (`8c0feff`) — gate copiado literalmente
  do PUT irmão. **13 passed, 0 failed**. Controle positivo: gate removido por script com
  `assert` → **6 passed, 7 failed** (mesmo vermelho do Step 1); revertido com `git checkout`
  **depois** do commit. `npm run test:api`: **139/139 arquivos OK**; `permissoesSetores` 4/0 e
  `auditoriaExtended` 15/0 rodados explicitamente.
  **Sem impacto de UI:** o único consumidor do GET é `ConfiguracoesAlmoxarifado.js:2884`, já
  atrás de `ProtectedAlmoxConfigRoute` (`client/src/App.js:508`).

---

### Task 4 (fechamento de spec — não é código)

- [ ] Riscar `specs/modulo-almoxarifado/23-perfis-seguranca-auditoria/README.md:73-76` (os 3
  "fora de escopo, nomeados" que esta etapa paga) e renomear o que sobra em
  `specs/modulo-almoxarifado/24-mobilidade/README.md:64-70` (G7 continua aberto). Step próprio
  porque o histórico desta base registra "código entregue e as specs continuaram dizendo que a
  feature não existia".

## Execução (estado)

- [x] Fase 2 — revisão do plano por agente fresco (2026-08-28): **16 achados, 4 bloqueantes,
  todos acatados.** (A1) `configDiff` está **desestruturado** no arquivo que os contratos
  mandavam usar como namespace — daria `ReferenceError` na primeira request; (A2) o plano
  citava `sucateamentoDestino*.api.test.js`, arquivo que **não existe**; (A3) a asserção
  negativa da RN-05 passaria **vazia** se o segredo não estivesse na coluna — e o próprio C4
  impede gravá-lo pelo caminho óbvio; (A4) o sort dizia que a T3 era paralela por estar em
  arquivo diferente, mas a **T1 também toca `extended.js`**. Mais: a decisão do webhook
  (A5/A6) tomada aqui — fica FORA da máscara, com as três razões medidas; o ramo de erro de
  banco declarado sem teste e por quê (A7); auditoria em try/catch explícita (A8); a RN-02 do
  design está **errada** sobre o 403 (A9, corrigir no fechamento); e as notas de extração
  (A11-A13). O revisor rodou 10 arquivos de teste: **todos verdes**, e mediu que o escopo
  escrito não quebra nenhum — com uma quebra latente que a decisão do A5 justamente evita
  (`auditoriaConfiguracoes.api.test.js:426-453` exige 200 no PUT do webhook).
- [x] Task 1 (`6cb594e`) · [ ] Task 2 · [x] Task 3 (`8c0feff`)
- [ ] Fase 4 — suíte completa serial
- [ ] Fase 5 — revisão adversarial (2 lentes)
- [ ] Fase 6 — fechar-etapa + retro

## Retro (preencher no fechamento)

- Rodadas de correção até verde: —
- Achados da revisão: reais — / ruído —
- Paralelismo real: —
- Defeito que escapou: —
