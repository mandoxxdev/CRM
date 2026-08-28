# Almoxarifado Etapa 15 — Mobilidade: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scanner de QR pela câmera (fecha o ciclo das etiquetas 6c), assinatura digital +
responsável pela retirada na entrega de requisição, e balcão usável no celular.

**Architecture:** Scanner é 100% client (os QRs da 6c codificam URLs do próprio sistema — ler
= navegar; função pura decide o destino). Assinatura é tabela append-only nova +
rota multipart no padrão canônico da casa (`auth → requirePermission → multer → safeParse` +
`limparUploadOrfao`), opcional por design (nunca bloqueia a entrega). Mobile é CSS: matar a
regra que esconde colunas ≥4 e dar scroll horizontal à `.almox-table`.

**Tech Stack:** Express + SQLite (sem ORM), multer, Zod, supertest; React CRA, react-router
v6, `jsqr` (dep nova do client), canvas + pointer events (sem lib de assinatura).

**Spec:** `docs/superpowers/specs/2026-08-28-almoxarifado-etapa15-mobilidade-design.md`
(o plano argumenta a partir dela; executores leem as duas).

## Global Constraints

- Autorização em duas camadas: `checkModulePermission` abre tela; `requirePermission` real
  decide ação — o harness `server/tests/helpers/testApp.js` roda o middleware REAL
  (`setUser` sem perfil → fallback PRODUCAO).
- Testes de API descobertos SÓ em `server/tests/api/*.api.test.js`, runner próprio por
  arquivo (`test()`, contadores, `process.exit(failed ? 1 : 0)`).
- Todo teste novo que passar de primeira exige **controle positivo** (sabotar a implementação
  e ver o vermelho) antes de valer.
- Commits em português, sem acento no corpo, explicando o porquê; um assunto por commit;
  NUNCA `git add -A` na raiz.
- Upload: diretório flat `uploadsAlmoxDir` (o multer NÃO cria subpasta — ENOENT);
  `limparUploadOrfao(req)` em toda saída ≠ 200.
- Mensagens de erro literais dos contratos abaixo — teste compara o texto exato.
- Client: `CI=true` faz warning virar erro no build — zero warning novo.

## Regras de negócio (RN)

| ID | Enunciado | Cenário de prova |
|---|---|---|
| RN-01 | Scanner só navega para caminho `/almoxarifado/...`; qualquer outro conteúdo é exibido, nunca navegado | QR `https://evil.com/x`, `javascript:alert(1)`, texto solto → `parseQrDestino` devolve `null` |
| RN-02 | Assinatura nunca bloqueia a entrega — contrato do `PUT /entregar` intocado; etapa posterior opcional com "Pular" | Entrega sem assinatura conclui normal; Pular não faz POST |
| RN-03 | Assinatura só em requisição `ENTREGUE`/`PARCIALMENTE_ATENDIDA`/`ENCERRADA`; fora disso 409 com mensagem literal | Requisição APROVADA → 409, zero linhas, upload órfão apagado |
| RN-04 | Assinatura é append-only e auditada (`criado_por` + auditoria padrão; sem UPDATE/DELETE) | 2 entregas parciais → 2 assinaturas, ambas no detalhe |
| RN-05 | Escrita gateada por `separar_emitir` (ADMINISTRADOR, ALMOXARIFE); leitura junto da requisição, sem gate novo | Matriz de 8 perfis no POST; PRODUCAO → 403 e órfão inexistente |
| RN-06 | Mobile não esconde dado: nenhuma coluna some por posição; acesso por scroll horizontal | A 375px, regra `nth-child(n+4){display:none}` não existe mais; `.almox-table` rola |

## Contratos congelados

### C1 — `POST /api/almoxarifado/requisicoes/:id/assinatura-entrega` (multipart)

Ordem: `auth → requirePermission('separar_emitir') → uploadAssinatura.single('assinatura') → safeParse`.

Campos: `recebedor_nome` (string 1..120, obrigatório), `assinatura` (arquivo image/png|jpeg|webp, máx 2MB, obrigatório).

| Caso | Status | Corpo |
|---|---|---|
| ok | 201 | `{ success: true, assinatura: { id, recebedor_nome, arquivo_url, criado_em, criado_por_nome } }` |
| sem arquivo | 400 | `{ error: "Assinatura é obrigatória — envie a imagem no campo 'assinatura'." }` |
| Zod inválido | 400 | `{ error: "Dados inválidos — <formatZodError>" }` |
| status errado | 409 | `{ error: "Só é possível registrar assinatura de entrega em requisição entregue (total ou parcialmente). Status atual: <STATUS>." }` |
| id inexistente | 404 | `{ error: "Requisição não encontrada" }` (sem ponto — padrão da casa) |
| sem perfil | 403 | padrão do `requirePermission` |

`arquivo_url` = `/api/uploads/almoxarifado/<filename>`; filename com prefixo `assinatura-`.
Auditoria: `entidade: 'requisicao'`, `entidade_id: reqId`, `acao: 'ASSINATURA_ENTREGA'`,
`dados_novos: { recebedor_nome, arquivo }`.

### C2 — `GET /api/almoxarifado/requisicoes/:id` (mudança aditiva)

Resposta ganha `assinaturas_entrega: [{ id, recebedor_nome, arquivo_url, criado_em,
criado_por_nome }]` (array vazio quando não há; ordenado por `criado_em` ASC, `id` ASC).

### C3 — `parseQrDestino(texto, origin)` → `string | null`

`client/src/utils/scannerDestino.js`. Devolve `path + search` relativo quando o texto é URL
válida cujo `pathname` começa com `/almoxarifado` (QUALQUER host — o identificador útil está
no path; etiqueta impressa em outro ambiente continua útil). Qualquer outra coisa → `null`.
**Atenção (achado da revisão):** `new URL('javascript:alert(1)')` faz parse SEM lançar — o
parse NÃO filtra protocolo. A função DEVE verificar explicitamente
`['http:','https:'].includes(url.protocol)`; o teste com `javascript:` é o controle disso.

### C4 — `<AssinaturaCanvas onConfirm={(blob) => ...} height={180} />`

`client/src/components/almoxarifado/AssinaturaCanvas.js`. Canvas com pointer events
(mouse+toque), botões "Limpar" e "Confirmar assinatura"; Confirmar desabilitado até existir
traço; `onConfirm` recebe `Blob` PNG via `canvas.toBlob`.

## Sort topológico

| Task | Tipo | Depende de |
|---|---|---|
| 1. Backend assinatura (schema + serviço + rotas + testes) | **tronco** | — |
| 2. Scanner QR (client) | **galho** | — (client-only, zero backend) |
| 3. Assinatura no front (canvas + fluxo de entrega) | **galho** | contratos C1/C2 (congelados aqui; motor real na integração) |
| 4. CSS mobile do balcão | **galho** | — |
| 5. Integração: jornada entregar→assinar (API real) | integração | Task 1 |

Galhos 2/3/4 em worktrees isoladas (arquivos client distintos; merge serial na Fase 4).

---

### Task 1 (tronco): backend da assinatura de entrega

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (junto das outras `CREATE TABLE IF NOT EXISTS`, ~linha 1698)
- Create: `server/services/almoxarifado/deliverySignatureService.js`
- Modify: `server/routes/almoxarifado/extended.js` (multer novo + rota POST)
- Modify: `server/routes/almoxarifado.js:2144-2185` (detalhe expõe `assinaturas_entrega`)
- Test: `server/tests/api/requisicaoAssinaturaEntrega.api.test.js`

**Interfaces:**
- Consumes: `registrarAuditoria(db, {...})` de `services/almoxarifado/audit.js`;
  `dbRun/dbGet/dbAll` de `services/almoxarifado/db.js`; `requirePermission` de
  `services/almoxarifado/permissions.js`; `limparUploadOrfao`/`uploadsAlmoxDir` já em
  `extended.js`; padrão multer de `extended.js:79-93`.
- Produces: contratos C1 e C2 acima; serviço
  `registrarAssinatura(db, user, requisicaoId, { recebedor_nome, arquivo })` → objeto da
  resposta C1; `listarAssinaturas(db, requisicaoId)` → array C2.

- [x] **Step 1: escrever o teste que falha** — `requisicaoAssinaturaEntrega.api.test.js` no
  molde de `requisicaoEntregaMotor.api.test.js` (helpers `criarMaterial`/`criarRequisicao`
  copiados) + multipart no molde de `toolOcorrencia.api.test.js`. Cenários:

```js
// PNG 1x1 válido para anexar sem depender de arquivo em disco
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

// 1. feliz: requisição ENTREGUE → POST com .field('recebedor_nome','José da Silva')
//    .attach('assinatura', PNG_1PX, 'assinatura.png') → 201, body.assinatura.arquivo_url
//    começa com /api/uploads/almoxarifado/assinatura-, arquivo existe no disco
//    (fs.existsSync(path.join(uploadsDir, filename))), linha na tabela, auditoria
//    ASSINATURA_ENTREGA com recebedor em dados_novos
// 2. RN-03: status APROVADA → 409 com a mensagem literal C1 (Status atual: APROVADA),
//    tabela vazia, e NENHUM arquivo assinatura-* novo no diretório (órfão apagado)
// 3. RN-03: PARCIALMENTE_ATENDIDA e ENCERRADA → 201 (os dois aceitos)
// 4. sem arquivo → 400 mensagem literal C1
// 5. recebedor_nome vazio → 400 "Dados inválidos — ..." e órfão apagado
// 6. id inexistente → 404 "Requisição não encontrada" (SEM ponto — padrão da casa,
//    almoxarifado.js:2147)
// 7. RN-05 matriz: para cada um dos 8 perfis (ADMINISTRADOR, ALMOXARIFE ok; COMPRAS,
//    PRODUCAO, ENGENHARIA, GESTOR, CONSULTA, sem-perfil→fallback 403).
//    ARMADILHA (achado da revisão): os usuários da matriz NÃO podem carregar
//    role:'admin' — getPerfilFromUser resolve role admin ANTES de perfil_almoxarifado
//    (permissions.js:87) e a matriz passaria vazia (falso verde). Molde:
//    permissoesRotas.api.test.js — setUser({ id: 60+i, nome, role: 'usuario',
//    email, perfil_almoxarifado: P }); conferir 201/403; nos 403, zero órfão
// 8. RN-04: segunda assinatura na mesma requisição → 201, detalhe traz as DUAS em ordem
// 9. C2: GET /requisicoes/:id → assinaturas_entrega presente ([] quando não há)
```

- [x] **Step 2: rodar e ver falhar** — `cd server && node tests/api/requisicaoAssinaturaEntrega.api.test.js` → 404 nas rotas novas / campo ausente no detalhe. (Vermelho medido: 0/9 — POST cai no 404 default do Express sem corpo JSON, detalhe sem `assinaturas_entrega`.)
- [x] **Step 3: schema** — em `schema.js`, junto das outras tabelas:

```sql
CREATE TABLE IF NOT EXISTS assinaturas_entrega_almoxarifado (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requisicao_id INTEGER NOT NULL REFERENCES requisicoes_almoxarifado(id),
  recebedor_nome TEXT NOT NULL,
  arquivo TEXT NOT NULL,
  criado_por INTEGER NOT NULL,
  criado_por_nome TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assinaturas_entrega_req
  ON assinaturas_entrega_almoxarifado(requisicao_id);
```

- [x] **Step 4: serviço** — `deliverySignatureService.js`:

```js
const STATUS_ASSINAVEIS = ['ENTREGUE', 'PARCIALMENTE_ATENDIDA', 'ENCERRADA'];
// registrarAssinatura: dbGet da requisição (COALESCE(ativo,1)=1; ausente → erro 404
// { status: 404, message: 'Requisição não encontrada' } no padrão handleError da casa);
// status fora da lista → { status: 409, message: `Só é possível registrar assinatura de
// entrega em requisição entregue (total ou parcialmente). Status atual: ${row.status}.` };
// INSERT; registrarAuditoria(...ASSINATURA_ENTREGA...); devolve o objeto C1 com
// arquivo_url montado com o MESMO prefixo de materialPhoto.js
// ('/api/uploads/almoxarifado/'). listarAssinaturas: dbAll ordenado criado_em ASC, id ASC.
```

  (conferir como `extended.js` sinaliza status de erro dos serviços — seguir o padrão
  existente de `handleError`/erros com `status`, não inventar um novo.)

- [x] **Step 5: rota** — em `extended.js`: multer `uploadAssinatura` (prefixo `assinatura-`,
  filtro `image/(png|jpeg|jpg|webp)`, 2MB, mesmo `diskStorage`/dir flat); Zod
  `AssinaturaEntregaFormSchema = z.object({ recebedor_nome: z.string().trim().min(1).max(120) })`;
  rota na ordem canônica com `safeParse` manual (NÃO o middleware `validate()` — deixa órfão)
  e `limparUploadOrfao` em TODA saída ≠ 201; `!req.file` → 400 literal C1.
- [x] **Step 6: detalhe C2** — em `almoxarifado.js:2177`, antes do `res.json`, buscar
  `listarAssinaturas` e incluir `assinaturas_entrega` na resposta.
  **Atenção (achado da revisão):** o ponto de inserção fica dentro de callback aninhado
  `db.all(..., (err2, itens) => {...})` que NÃO é async — `await` colado ali é SyntaxError.
  Tornar o callback interno `async (err2, itens) =>` (ou encadear `.then/.catch` com 500 no
  catch), no estilo já misto do arquivo; erro da busca de assinaturas → 500, não engolir.
- [x] **Step 7: rodar o teste até verde; controle positivo** — sabotar `STATUS_ASSINAVEIS`
  (incluir `'APROVADA'`) e ver o cenário 2 falhar; reverter. Rodar `npm run test:api` inteiro.
  (Feito: verde 9/9; com a sabotagem o cenário RN-03 ficou vermelho — 8/9, o POST em APROVADA
  devolveu 201 — revertido e verde 9/9 de novo. Suíte inteira: 124/124 arquivos OK.)
- [x] **Step 8: commit** — `Almoxarifado Etapa 15 Task 1: assinatura digital de entrega no backend` (por que: spec secao 5/13.2 pedia; RN-02 justifica opcional). Commit `fa119c8`.

### Task 2 (galho): scanner QR pela câmera

**Files:**
- Create: `client/src/utils/scannerDestino.js` + `client/src/utils/scannerDestino.test.js`
- Create: `client/src/components/almoxarifado/ScannerAlmoxarifado.js`
- Modify: `client/src/routes/lazyModules.js` (~linha 160), `client/src/App.js` (bloco
  462-506), `client/src/components/Layout.js` (~linha 329, item novo no topo do menu),
  `client/package.json` (dep `jsqr`)

**Interfaces:**
- Consumes: C3; padrão `page(() => import(...))` de `lazyModules.js`; padrão de item de menu
  `{ path, icon, label }` de `Layout.js:328`.
- Produces: rota `/almoxarifado/scanner`; nada consumido por outras tasks.

- [ ] **Step 1: teste da função pura (falha primeiro)** — cenários RN-01:

```js
const { parseQrDestino } = require('./scannerDestino');
// mesmo origin → '/almoxarifado/lotes?material_id=3&aba=LOTES&lote=L1'
// origin ALHEIO com path do módulo → mesmo resultado (etiqueta de outro ambiente)
// 'https://evil.com/phishing' → null ; 'javascript:alert(1)' → null
// 'texto solto' → null ; '' → null ; query preservada byte a byte
```

- [ ] **Step 2: implementar `parseQrDestino`** — `new URL(texto)` em try/catch; aceitar só
  `http:`/`https:`; `url.pathname.startsWith('/almoxarifado')` → `url.pathname + url.search`;
  senão `null`. Rodar o teste (`CI=true npx react-scripts test scannerDestino --watchAll=false`).
- [ ] **Step 3: `npm install jsqr` no client** (dep exata, sem outras).
- [ ] **Step 4: tela `ScannerAlmoxarifado.js`** — estados: `pedindo` (getUserMedia
  `{video:{facingMode:'environment'}}`), `lendo` (loop `requestAnimationFrame` com throttle
  ~150ms: video → canvas offscreen → `jsQR(imageData.data, w, h)`), `lido` (para o stream,
  `navigator.vibrate?.(80)`, `navigate(destino)`; conteúdo não navegável → mostra o texto
  lido + botão copiar + "Ler outro"), `erro` (câmera negada/`!navigator.mediaDevices` →
  instrução + input de colagem manual que passa pelo MESMO `parseQrDestino`). Cleanup do
  stream no unmount. Moldura de mira via CSS inline + classes `almox-*` existentes.
- [ ] **Step 5: rota + menu** — `lazyModules.js` export `ScannerAlmoxarifado`; `App.js` route
  `scanner`; `Layout.js` item `{ path: '/almoxarifado/scanner', icon: FiCamera, label: 'Scanner' }`
  logo após o Dashboard.
- [ ] **Step 6: suíte client + build** — `CI=true npx react-scripts test --watchAll=false` e
  `CI=true npx react-scripts build` (zero warning).
- [ ] **Step 7: commit** — `Almoxarifado Etapa 15 Task 2: scanner de QR pela camera fecha o ciclo das etiquetas 6c`.

### Task 3 (galho): assinatura no front

**Files:**
- Create: `client/src/components/almoxarifado/AssinaturaCanvas.js` + `AssinaturaCanvas.test.js`
- Modify: `client/src/components/almoxarifado/RequisicoesList.js` (modal de entrega
  linhas ~1275-1330; `handleConfirmarEntrega` ~443; detalhe da requisição)
- Test: acrescentar cenários em `client/src/components/almoxarifado/RequisicoesList.test.js`

**Interfaces:**
- Consumes: C1/C2 (mock de fronteira HTTP é LEGÍTIMO aqui — contrato congelado), C4,
  `useAlmoxPermissoes().pode('separar_emitir')`, padrão FormData de
  `FerramentasAlmoxarifado.js:348-368`.
- Produces: C4 (componente reutilizável).

- [ ] **Step 1: teste do canvas (falha primeiro)** — render, simular pointerdown/move/up,
  "Confirmar assinatura" habilita e chama `onConfirm` com Blob (mockar
  `HTMLCanvasElement.prototype.toBlob`); "Limpar" desabilita Confirmar de novo.
- [ ] **Step 2: implementar `AssinaturaCanvas`** — pointer events com `setPointerCapture`,
  traço `lineWidth 2.5/round`, fundo branco, flag `temTraco`.
- [ ] **Step 3: teste do fluxo (falha primeiro)** — em `RequisicoesList.test.js`: após entrega
  bem-sucedida aparece a etapa "Colher assinatura do recebedor" (nome + canvas + "Pular");
  Pular fecha sem POST de assinatura; confirmar com nome → POST multipart para
  `/almoxarifado/requisicoes/:id/assinatura-entrega` (mockar `api.post` e inspecionar
  FormData); detalhe com `assinaturas_entrega` renderiza nome/data/thumbnail
  (`arquivo_url`); botão "＋ Assinatura de entrega" só em status
  ENTREGUE/PARCIALMENTE_ATENDIDA/ENCERRADA e sob `pode('separar_emitir')`.
- [ ] **Step 4: implementar o fluxo** — estado `assinaturaPos` `{reqId, recebedor}`; abre após
  `entregarItens` ok (RN-02: nunca bloqueia — falha no POST de assinatura mostra toast e
  NÃO desfaz a entrega); botão avulso no detalhe; lista de assinaturas no detalhe.
- [ ] **Step 5: suíte client + build; commit** — `Almoxarifado Etapa 15 Task 3: colher assinatura do recebedor na entrega`.

### Task 4 (galho): balcão no celular (CSS)

**Files:**
- Modify: `client/src/components/almoxarifado/Almoxarifado.css` (bloco `@media (max-width: 768px)`, linha ~1025)

**Interfaces:** nenhuma (CSS puro; sem teste automatizado — a prova é o build + os cenários
manuais no guia do usuário).

- [ ] **Step 1: matar o esconde-colunas** — remover
  `.almox-table th:nth-child(n+4), .almox-table td:nth-child(n+4) { display: none; }`.
- [ ] **Step 2: scroll horizontal SEM tocar nas telas** — no mesmo bloco 768px:

```css
.almox-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
.almox-modal, .almox-modal-sm { width: 100vw; max-width: 100vw; height: 100dvh; max-height: 100dvh; border-radius: 0; }
.almox-modal-overlay { padding: 0; }
```

  (`display:block` numa `<table>` a torna o próprio contêiner de scroll — nenhuma tela
  precisa de wrapper novo; RN-06 atendida na folha única.)
- [ ] **Step 3: build `CI=true` + commit** — `Almoxarifado Etapa 15 Task 4: mobile para de esconder colunas da tabela` (por que: nth-child(n+4) escondia dados E acoes).

### Task 5 (integração): jornada entregar → assinar, cruzando rotas reais

**Files:**
- Test: `server/tests/api/requisicaoAssinaturaJornada.api.test.js`

**Interfaces:** Consumes: rotas reais `PUT /entregar` (existente), `POST /assinatura-entrega`
e `GET /requisicoes/:id` (Task 1) — motor e serviço REAIS, zero mock.

- [x] **Step 1: escrever a jornada** — molde de `requisicaoEntregaMotor.api.test.js`:
  requisição EM_SEPARACAO com 1 item separado 10 → entregar 4 (PARCIALMENTE_ATENDIDA) →
  assinar ("Maria Recebedora") → entregar 6 (ENTREGUE) → assinar de novo ("João Turno 2") →
  `GET /requisicoes/:id` traz 2 assinaturas em ordem → `PUT /encerrar` → terceira assinatura
  ainda aceita (ENCERRADA, RN-03) → total 3 no detalhe. Conferir também que o saldo do
  material terminou 40 (as entregas passaram pelo motor de verdade).
- [x] **Step 2: rodar; controle positivo** (sabotar a ordem do `listarAssinaturas` para DESC
  e ver o teste da ordem falhar; reverter).
- [x] **Step 3: `npm run test:api` inteiro; commit** — `Almoxarifado Etapa 15 Task 5: jornada de integracao entregar-assinar`.

---

## Self-review do plano (feito na escrita)

- Cobertura da spec: scanner (T2), assinatura (T1/T3/T5), balcão mobile (T4) — os três itens
  do escopo; RN-01..06 todas com task e teste nomeados.
- Task 1 é tronco único porque schema+serviço+rota+detalhe compartilham a mesma regra
  (RN-03/RN-04) — dividir criaria retrabalho entre executores. T2/T3/T4 tocam arquivos
  client disjuntos (App/Layout/lazy só na T2; RequisicoesList só na T3; CSS só na T4) —
  paralelizáveis em worktrees, merge serial.
- Mock de fronteira HTTP só na T3 (contrato congelado C1/C2) — a prova contra o motor real
  é a T5, como manda a regra do módulo.
- Risco declarado: a T3 mexe em `RequisicoesList.js` (arquivo grande, modal em inline
  style) — o executor deve seguir o estilo local, não refatorar.
- A spec da feature (`specs/modulo-almoxarifado/24-mobilidade/README.md`) já nasceu
  (commit `52170f2`); o checklist dela é marcado com hashes na Fase 6 (fechar-etapa) — não
  é task de executor.

## Execução (estado)

- [x] Fase 2 — revisão do plano por agente fresco (2026-08-28): 8 achados, 0 bloqueante de
  estrutura. Acatados: spec dizia 200 no POST (corrigida para 201, precedente da casa);
  spec mandava wrapper `.almox-table-wrap` por tela (corrigida para `display:block` na
  própria classe); C3 afirmava que `new URL` filtra protocolo (falso — filtro explícito
  exigido); aviso de callback não-async no Step 6 da T1; matriz RN-05 sem `role:'admin'`
  (senão falso verde); 404 sem ponto final; posição do menu alinhada; nota sobre a spec da
  feature. Independência dos galhos confirmada no código (arquivos disjuntos).
- [x] Task 1 (tronco) — commit `fa119c8` (2026-08-28). TDD: vermelho inicial 0/9; verde 9/9;
  controle positivo da sabotagem de `STATUS_ASSINAVEIS` derrubou o cenário RN-03 (8/9) e foi
  revertido; `npm run test:api` completo: 124/124 arquivos OK. Nenhuma divergência
  plano × código — os três avisos da revisão (callback async no detalhe, matriz sem
  `role:'admin'`, 404 sem ponto) foram seguidos como escritos.
- [x] Task 2 (galho) — commit `866d740`, merge `d92d0ae`. TDD com vermelho medido
  (`Cannot find module './scannerDestino'`); `parseQrDestino` com filtro explícito de
  protocolo (achado C3 da revisão); tela com estados pedindo/lendo/lido/erro + fallback de
  colagem manual; 8/8 na função, suíte client 495/495 na worktree, build zero warning.
  Divergência registrada: `client/package-lock.json` está no `.gitignore` do repo — não foi
  versionado como o Step 7 pedia.
- [x] Task 3 (galho) — commit `afff10f`, merge `2c03959`. Vermelhos medidos (canvas e 10/12
  cenários do fluxo); C1/C2/C4 fiéis (FormData no molde da casa, RN-02: falha do POST não
  desfaz entrega); suíte client 504/504 na worktree, build zero warning. Achado de harness
  documentado nos testes: CRA roda jest com `resetMocks: true` — mock de protótipo
  (`getContext`/`toBlob`) tem de nascer em `beforeEach`, não `beforeAll`.
- [x] Task 4 (galho) — commit original `3ac777d` (base errada), aplicado na etapa por
  cherry-pick `ad4165d`; regra `nth-child(n+4)` removida e scroll na própria `.almox-table`
  conferidos no arquivo evoluído (linha ~1030); revalidado pela suíte da Fase 4 abaixo.
- [x] Task 5 (integração) — commit `0cf94e1` (2026-08-28). Jornada verde de primeira (9/9);
  controle positivo obrigatório: `listarAssinaturas` sabotado para DESC derrubou os dois
  passos de ordem (7/9), revertido, verde 9/9 de novo. `npm run test:api` completo:
  125/125 arquivos OK (124 anteriores + a jornada nova).
- [x] Fase 4 — merge serial (`d92d0ae` T2, `2c03959` T3, `ad4165d` T4) + suíte completa
  serial na branch (2026-08-28): `test:api` **125/125**, `test:almoxarifado` **42/0**,
  `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **3/0**; client
  **512 testes em 35 suítes**, build `CI=true` exit 0. Incidente de infraestrutura
  registrado: as worktrees dos galhos nasceram da `main` (5dadd59) em vez do HEAD da etapa —
  T2/T3 resetaram para a base certa ANTES de implementar; T4 tinha commitado na base velha e
  entrou por cherry-pick com revalidação. Zero retrabalho de código entre galhos.
- [ ] Fase 5 — revisão adversarial (2 lentes)
- [ ] Fase 6 — fechar-etapa + retro

## Retro (4 números — preencher no fechamento)

- Rodadas de correção até verde: —
- Achados da revisão: reais — / ruído —
- Paralelismo real: —
- Defeito que escapou (preencher na etapa seguinte): —
