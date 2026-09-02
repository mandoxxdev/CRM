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

- [x] **Step 1: teste que falha** (`a0b19c9`) — RN-05 com **asserção negativa explícita** para as **2**
  chaves secretas (o webhook saiu do escopo — C3). **A asserção negativa só vale se o segredo
  estiver MESMO na coluna** (achado A3: gravá-lo pelo PUT genérico daria 400 depois do C4, a
  coluna ficaria `''` — a semente é `''`, `schema.js:1799-1803` — e o teste passaria provando
  zero). Gravar por `PUT /configuracoes/alertas-estoque` **ou** `dbRun` direto, **assertar a
  coluna antes** (molde exato: `auditoriaConfiguracoes.api.test.js:281-282`) e só então checar
  o GET. Idem RN-06: pôr valor não-vazio ANTES do 400, senão "coluna intacta" compara `''`
  com `''`. Mais: asserção positiva de que `descricao`/`id` e as 18 chaves da tela continuam iguais; RN-06
  (400 com a mensagem literal + a coluna intacta depois); e o **controle de compatibilidade**:
  a rota de alertas continua devolvendo `'********'` e o `shouldUpdateSecret` continua
  funcionando (reenviar a máscara pela rota de alertas **não** grava).
- [x] **Step 2: rodar e ver falhar; implementar; verde** (`a0b19c9`) — **vermelho: 7 passed, 6
  failed**. Caíram: a máscara do GET (a senha saiu em claro, com o valor no diff do assert), os
  4 cenários da RN-06 (o PUT genérico respondia `{"success":true}` e gravava) e — por
  consequência honesta — o de compatibilidade, porque o cenário anterior tinha acabado de gravar
  `''` por cima da senha pelo PUT genérico, que é exatamente o defeito. Os 7 que já passavam
  passavam por motivo declarado: as duas guardas anti-teste-vazio, o caso da coluna VAZIA
  (`''` continua `''` com ou sem máscara), a forma do corpo (`descricao`/`id` e as 18 chaves
  da tela — prova que a asserção de shape estava certa ANTES), o webhook em claro (decisão A5,
  já era o comportamento) e o 200 do PUT do webhook.
  **Implementação:** pré-requisito A1 primeiro (`configDiff` vira namespace, as 3 chamadas de
  `calcularDiff` trocadas por script com assert de contagem — 3 antes, 3 depois, zero nuas);
  C3 na montagem da resposta do GET; C4 no laço de VALIDAÇÃO do PUT (não no de UPDATE).
  **Verde: 13 passed, 0 failed.**
- [x] **Step 3: controle positivo** (`a0b19c9`) — **três** sabotagens por script com
  `assert` de que o alvo existia (no-op silencioso já aconteceu nesta base), todas **depois** do
  commit e revertidas com `git checkout`:
  (1) máscara do GET desligada → **11 passed, 2 failed**. **Correção de uma frase errada deste
  plano** (achado A5 da revisão, reproduzido): a versão anterior narrava **uma** queda e dizia
  "os demais seguiram verdes" na mesma linha em que registrava `2 failed` — contradição própria.
  Caem **dois**: `[RN-05] com valor na coluna, o GET devolve a mascara e NUNCA o segredo` **e**
  `[compat] a rota de alertas continua mascarando e o shouldUpdateSecret continua valendo`, este
  porque o cenário termina relendo o GET genérico. Dois cenários medindo a máscara por caminhos
  diferentes é resultado melhor do que um — o que não pode é o plano contar errado;
  (2) guarda do PUT removida → **8 passed, 5 failed** (os 4 da RN-06 + a compatibilidade, que cai
  porque sem a guarda o PUT genérico apaga a senha);
  (3) import de volta a desestruturado → o processo **nem chega a rodar cenário**:
  `ReferenceError: configDiff is not defined`. Confirma que o achado A1 era bloqueante de
  verdade, e não uma precaução: sem a troca, a primeira request das TRÊS rotas de configuração
  morria.
  **Placares:** `npm run test:api` **141/141 arquivos OK**; rodados explicitamente —
  `configuracoesGerais` 15/0, `auditoriaConfiguracoes` 23/0 (inclusive o `:426-453`, que exige
  **200** e a URL inteira no PUT do webhook — a decisão A5 é o que o mantém verde),
  `auditoriaCadastros` 24/0, `auditoriaExtended` 15/0, `auditoriaAtosEGate` 19/0,
  `auditoriaConfiguracaoJornada` 8/0.
- [x] **Step 4: commit** (`a0b19c9`).

  **Acrescentado ao previsto:** (a) um cenário travando a decisão A5 — o webhook SAI EM CLARO do
  GET, de propósito — para que uma "melhoria" futura tenha de derrubar um teste que diz o porquê
  em vez de mascarar e quebrar as notificações; (b) o caso da coluna VAZIA (`''` não vira
  `'********'`), porque responder a máscara para senha inexistente MENTIRIA "já configurado" —
  é o que a tela lê para decidir o placeholder; (c) o lote misto (`aprovacao_automatica` +
  segredo), provando que a recusa vem antes de QUALQUER UPDATE — sem transação, recusar no meio
  do laço deixaria metade do formulário aplicada; (d) chave secreta com valor `''` também é
  recusada — não há "apagar a senha por atalho" pelo PUT genérico.

  **Divergência do contrato: nenhuma.** C3 e C4 saíram como escritos, inclusive a decisão A5
  (webhook fora da máscara) e a mensagem literal do 400.

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

- [x] Riscar `specs/modulo-almoxarifado/23-perfis-seguranca-auditoria/README.md:73-76` (os 3
  "fora de escopo, nomeados" que esta etapa paga) e renomear o que sobra em
  `specs/modulo-almoxarifado/24-mobilidade/README.md:64-70` (G7 continua aberto). Step próprio
  porque o histórico desta base registra "código entregue e as specs continuaram dizendo que a
  feature não existia".

  **Feito no fechamento** (commit de documentação da Fase 6). Os três itens da spec 23 foram
  **riscados com `~~`, não apagados**, cada um com o hash que o pagou (`6cb594e`+`05a5c81`,
  `a0b19c9`, `8c0feff`), e a spec ganhou um bloco de checklist próprio da Etapa 20 — com os
  `[ ]` do que ficou fora **e o porquê** (webhook em claro, `qtd_permissoes` sem gate,
  `liberacao-valor`, o 500 do multer). Na spec 24 a pendência 1 foi **renomeada**: a rota de foto
  saiu do conjunto de rotas defeituosas no que era dela e continua no item **só** pelo 500 opaco
  do multer, que é comum às cinco — a redação anterior fazia o próximo leitor reabrir trabalho
  pronto. A dependência "`limparUploadOrfao` de `extended.js`" também foi corrigida na spec 24:
  a função mudou de casa em `6cb594e`.

  **Divergência: os números de linha do plano estavam certos, o resto do texto não.** A spec 24
  falava das cinco rotas em bloco ("rotas de upload defeituosas"); renomear só o título teria
  deixado o corpo mentindo. Foi reescrito o parágrafo inteiro, com a mudança declarada dentro
  dele. Acrescentado ao previsto: o mapa de status (`specs/modulo-almoxarifado/README.md`)
  também citava os 3 fora-de-escopo na linha da feature 23 e chamava a rota de foto de
  defeituosa na linha da 24 — os dois foram corrigidos, senão a spec ficaria certa e o mapa
  errado.

---

## Fix-round (revisão adversarial → `05a5c81` + `a3f5135`)

A etapa passou por revisão adversarial depois das três tasks. **5 achados reais (A1-A5) e 11
refutações reproduzidas** (o revisor tentou derrubar 11 afirmações do plano/entrega e mediu que
elas se sustentavam). Dois achados viraram código, três viraram documentação:

- **A4 (código, `05a5c81`) — a rota de foto AINDA respondia 200 para material inexistente.**
  O comentário escrito na Task 1 dizia, com todas as letras, "o conserto aqui não é ler
  `changes`: é o SELECT antes". O SELECT resolve o caso comum e continua sendo a leitura que dá
  `dados_anteriores` e o nome do arquivo a apagar — **mas não fecha a janela entre ele e o
  UPDATE**: com a linha sumindo no meio, o UPDATE casava zero linhas e a rota devolvia
  `{ foto }` com o arquivo em disco para um material que não existe. `dbRun` já devolve
  `{ changes }` (`services/almoxarifado/db.js:5-12`), então custou uma linha. Alcance real
  baixo (o DELETE de material é soft), mas **responder 200 a uma escrita que não aconteceu é o
  próprio defeito que a etapa foi consertar**.
- **A2 (código+teste, `05a5c81`) — o teste declarava intestável um ramo que era testável.**
  O cabeçalho de `fotoMaterialRastro.api.test.js` afirmava que o ramo "erro de banco" da RN-02
  não tinha como ser exercitado porque `routes/almoxarifado.js:35` desestrutura `dbRun`/`dbGet`
  no `require` e o binding cacheado não alcança um stub no módulo. **A premissa é verdadeira; a
  conclusão estava errada** — o alvo não precisa ser o módulo: `dbGet(db, ...)`/`dbRun(db, ...)`
  recebem a **instância** como 1º argumento e o harness entrega essa mesma instância ao teste,
  então patchar `db.get`/`db.run` na instância (restaurando no `finally`) exercita os dois ramos
  sem tocar produção. **Descartado** manter a declaração: teste que se declara impossível sem
  que seja verdade deixa de ser decisão e vira ponto cego permanente. **10 → 13 cenários.**
- **A1 (doc, `a3f5135`) — o design contradizia a entrega.** A RN-05 afirmava que o webhook sairia
  do GET com a query string mascarada; o código faz o **oposto**, de propósito, e há teste
  travando o oposto. A decisão existia só no plano e no cabeçalho do teste — quem lesse o design
  era **ativamente enganado**. Reescrita dizendo que estava errada, com o motivo e a consequência
  aceita.
- **A3 (doc, `a3f5135`) — o buraco irmão declarado.** `GET /setores-requisicao` devolve
  `qtd_permissoes` por setor sem gate nenhum: o mesmo usuário que o C5 agora barra continua
  sabendo quais setores têm lista explícita. Declarado em "Fica FORA" (e, no fechamento, na letra
  B41 como **decisão em aberto**) em vez de consertado, porque a consumidora é a tela de
  requisição, não-admin — fechar exige decidir o que ela passa a receber.
- **A5 (doc, `a3f5135`) — o plano contradizia a si mesmo.** O Step 3 da Task 2 narrava **uma**
  queda de sabotagem e dizia "os demais seguiram verdes" na mesma linha em que registrava
  `2 failed`. Corrigido com os dois nomes.

**Correção de mais uma afirmação, medida no fechamento (Fase 6):** a RN-05 corrigida por
`a3f5135` diz que "**quem tem acesso ao módulo** lê o token embutido na query string do webhook".
**Isso é mais amplo do que a verdade.** As duas rotas que devolvem o webhook —
`GET /configuracoes` (`almoxarifado.js:2406-2407`) e `GET /configuracoes/alertas-estoque`
(`:2542-2543`) — passam por `denyUnlessAlmoxAdmin`, ou seja, `canConfigureAlmox`. Quem lê o token
é **administrador do Almoxarifado ou super administrador**, não qualquer usuário do módulo. A
letra C24 das novidades já foi escrita com a versão medida, e o design foi corrigido junto.
*(A rota que de fato expõe dado a qualquer usuário do módulo é outra:
`GET /configuracoes/liberacao-valor`, `:2695`, sem gate — nome e e-mail dos aprovadores.)*

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
- [x] Task 1 (`6cb594e`) · [x] Task 2 (`a0b19c9`) · [x] Task 3 (`8c0feff`) · [x] Task 4 (fechamento)
- [x] Fase 4 — suíte completa serial (`npm run test:api`: **142/142 arquivos OK**)
- [x] Fase 5 — revisão adversarial: **5 achados reais (A1-A5), 11 refutações reproduzidas**;
  fix-round commitado em `05a5c81` (código+teste) e `a3f5135` (documentação)
- [x] Fase 6 — fechar-etapa + retro (este documento, mais os 6 artefatos da skill)

## Verificação final da Fase 6 (medida em 2026-08-28, não presumida)

| Comando | Resultado lido |
|---|---|
| `cd server && npm run test:api` | **142/142 arquivos de teste OK** (exit 0) |
| `cd server && npm run test:almoxarifado` | **42 passou, 0 falhou** |
| `cd server && npm run test:validation` | **4 passed, 0 failed** |
| `cd server && npm run test:safealter` | **3 passed, 0 failed** |
| `cd server && npm run test:sqlite` | **3 passed, 0 failed** |
| `cd client && CI=true npx react-scripts test --watchAll=false` | **36 suites / 531 testes, 0 falhas** |
| `cd client && CI=true npx react-scripts build` | **compilou** (exit 0), sem warning virando erro |

O 142 confere com o esperado: a Task 3 fechou com 139 arquivos, a Task 1 com 140 (mais
`fotoMaterialRastro`), a Task 2 com 141 (mais `configuracoesSegredo`) — e o 142º é da Etapa 21,
que rodava em paralelo em outra worktree (`d5c8d3a`). Nenhum arquivo desta etapa foi perdido.

## Próxima tarefa detalhada (para quem retomar sem reler o código)

**A frente natural é a TELA de auditoria do almoxarifado** — é o item que mantém a feature 23 em
🟡-forte, e as Etapas 18/19/20 só aumentaram o custo de não tê-la (a trilha ficou rica e não tem
leitor). Antes de começar, três coisas já estão medidas e **não precisam ser reabertas**:

- **O contrato de API já existe e já tem gate:** `GET /api/almoxarifado/auditoria`
  (`routes/almoxarifado/extended.js`) aceita filtro por `entidade` e devolve `{ total, itens }`,
  avisando quando a resposta foi cortada. O gate é a ação `configurar` — que aceita
  **administrador do sistema**, grupo ligeiramente mais amplo do que o `canConfigureAlmox` da
  tela de configurações. Essa assimetria está declarada na spec 23 como nota, não como bug.
- **Duas dívidas têm de ser resolvidas ANTES da tela, não depois:** (1) o volume do histórico de
  `setor_permissao`, que grava a lista inteira duas vezes por salvamento (**~46 KB medidos com
  200 famílias**, letra G8) — uma consulta sem filtro montaria resposta de dezenas de MB; (2) a
  decisão **B33**, que é do usuário: a leitura fica só com Administrador, abre para Gestor, ou a
  tela nasce filtrada por conferência/entidade para o Gestor ver o que é dele sem ver o resto.
- **O vocabulário do log é inconsistente de propósito** (`CRIACAO`/`CRIAR`,
  `EDICAO`/`ATUALIZACAO`/`ATUALIZAR`, mais `REATIVACAO` e `INCLUSAO_EM_LOTE`): a Etapa 19 fixou a
  regra como "consistência dentro da entidade" e **não** normalizou as antigas, porque isso
  mexeria em log histórico. A tela tem de exibir os verbos como estão, não presumir um conjunto
  fechado.

**Alternativa menor, se o objetivo for fechar dívida barata:** o **G7** — error-handler de multer
uniforme nas 5 rotas de upload (`foto`, `certificado`, `comprovante de sucata`, `calibração`,
`assinatura`), transformando o 500 genérico de `index.js:22971` em 400 com motivo, mais teste de
MIME/limite em cada uma. Ponto de atenção: o handler global fica em `server/index.js`, que é
arquivo do núcleo — o conserto mais seguro é um middleware de erro **por rota** (ou montado no
router do almoxarifado), não mexer no handler global.

**O que NÃO é próxima tarefa:** o B41 e o `liberacao-valor` só voltam à mesa **depois** de o
usuário responder — os dois são mudança de contrato de tela, não linha de gate.

## Retro (preenchida no fechamento — 2026-08-28)

- **Rodadas de correção até verde: 1 por task, mais 1 fix-round da etapa inteira.** Cada uma das
  3 tasks foi vermelho→verde em uma passada (T1: 4 passed/5 failed **+ processo abortado** → 10
  passed, e 13 depois do fix-round; T2: 7/6 → 13 passed; T3: 6/7 → 13 passed) e não houve segunda
  rodada dentro da task.
  A rodada extra veio depois, da revisão adversarial: **A4 e A2, os dois sobre afirmações minhas
  que estavam erradas** — um comentário que descartava explicitamente a checagem que faltava, e
  um cabeçalho de teste que declarava intestável o que era testável.
- **Achados da revisão: 5 reais / 0 ruído — com 11 refutações reproduzidas.** Nenhum dos 5 foi
  descartado. O revisor ainda tentou derrubar 11 afirmações do plano e da entrega e **mediu que
  se sustentavam** — o que é o resultado mais barato possível: 16 verificações, 5 mudanças. Some
  a isso os 16 achados da revisão do plano (4 bloqueantes, todos acatados), dos quais o A1 era
  bloqueante de verdade: sem a troca do `require` de `configDiff`, a **primeira** request das três
  rotas de configuração morria com `ReferenceError` — provado por sabotagem, não deduzido.
- **Paralelismo real: 1 galho em paralelo, zero retrabalho.** A ordem executada foi T3 → T1 → T2,
  e não T1‖T3 como o sort original previa: o achado A4 da revisão do plano mostrou que a T1
  **também** toca `extended.js`, então a única combinação segura era T2‖T3. Como a T3 já estava
  commitada quando o plano foi revisado, o paralelismo efetivo foi zero e **isso foi barato** —
  três tasks pequenas, duas delas no mesmo arquivo. Custo de serializar: minutos. Custo de ter
  paralelizado T1‖T3 sem o A4: conflito em `extended.js` no meio da extração de
  `limparUploadOrfao`, com 8 call sites em jogo.
- **Defeito que escapou: a preencher na etapa seguinte.** Nada foi reportado até o fechamento; o
  campo fica aberto de propósito — quem fizer a Etapa 21+ escreve aqui o que a Etapa 20 deixou
  passar, ou "nenhum" se a etapa sobreviver intacta. O candidato mais provável, dito na frente:
  o ramo `changes === 0` da rota de foto é praticamente inalcançável na operação real (o DELETE
  de material é soft), então ele é cinto — se algum dia aparecer um `DELETE FROM
  materiais_almoxarifado` no código, é aqui que a hipótese muda.
