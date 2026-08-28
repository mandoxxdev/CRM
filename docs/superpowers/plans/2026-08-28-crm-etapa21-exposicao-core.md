# CRM Etapa 21 — Exposição no core: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** O zip do backup para de carregar o segredo que permite forjar superadmin, o token
para de trafegar em query string, a senha SMTP sai do código como fonte primária, e os GETs
de configuração do core param de devolver senha em claro.

**Architecture:** três funções puras novas em `server/services/` (o padrão que
`systemPermissions.js` e `dbRecovery.js` já estabeleceram no core), consumidas por
`server/index.js`. **Sem harness de core** — o que é testável é a função pura; a fiação HTTP
fica declarada sem teste, com o motivo escrito.

**Spec:** `docs/superpowers/specs/2026-08-28-crm-etapa21-exposicao-core-design.md`

## Global Constraints

- Os das etapas anteriores (controle positivo obrigatório, commits pt sem acento no corpo,
  `git add` explícito, **commitar antes de sabotar**, script de edição sempre com `assert`).
- **`server/index.js` é um arquivo de 23 mil linhas que roda no import** — nenhuma
  refatoração estrutural nesta etapa. Só acrescentar require e trocar o corpo de 4 pontos.
- **Não criar rota de restore** (a medição confirmou que não existe; inventar uma seria abrir
  o buraco pior).
- **Não reescrever histórico do git** nem tocar em credencial no provedor — declarado.
- Testes novos entram em `server/tests/api/*.api.test.js` porque **é o único lugar que o
  runner enxerga** (`run-all.js`), mesmo sendo teste de serviço — precedente explícito em
  `dbRecoveryBackup.api.test.js:1-6`.

## RN (enunciado no design)

| ID | Resumo |
|---|---|
| RN-01 | O zip não inclui `.runtime-secrets.json` nem o diretório `backups/`; **inclui** `database.sqlite`, `uploads/` e a cópia de backup mais recente |
| RN-02 | `timingSafeEqual` no token; **query string ainda aceita** com aviso de depreciação no log; token curto **avisa**, não recusa |
| RN-03 | Todo download (aceito ou negado) é registrado com horário, `req.ip` **e `x-forwarded-for`** |
| RN-04 | `getEmailConfig`: **env → hardcoded** (banco FORA); `from` cai para `user` |
| RN-05 | Nenhum GET de configuração do core devolve `email_smtp_pass` em claro (plural E singular) |
| RN-06 | `PUT /configuracoes/:chave` recusa com **400** valor vazio ou que **contenha** a máscara |
| RN-07 | A tela nunca envia a máscara: campo nasce vazio, com placeholder; vazio não dispara PUT |
| RN-08 | O zip mantém o fallback de recuperação (a cópia de backup mais recente entra) |

## Contratos congelados

### C1 — `server/services/backupPackage.js` (novo)

```js
// EXCLUSOES: cada uma com o porque, porque backup que exclui demais deixa de ser backup.
const EXCLUIDOS = [
  '.runtime-secrets.json', // jwtSecret + credencial do admin semeado: quem baixa FORJA token
                           // de superadmin (server/index.js:318 assina com esse segredo).
  'backups',               // ~188 MB de copias historicas. NAO some do zip: entra so a MAIS
                           // RECENTE, por backupMaisRecente() — dbRecovery.js:86 manda
                           // restaurar dali, e o cenario do diretorio e justamente
                           // "database.sqlite corrompido", que e o arquivo que vai no zip.
];
// deveIncluirNoBackup(nomeRelativo) -> boolean. Compara o PRIMEIRO segmento do caminho
// (obrigatorio: a revisao verificou que o glob do archiver DESCE dentro de 'backups/' mesmo
// com a entrada do diretorio recusada) e o nome do arquivo.
// backupMaisRecente(dir) -> nome do arquivo mais novo em <dir>/backups, ou null.
```

Exportar `deveIncluirNoBackup`, `backupMaisRecente` e `EXCLUIDOS`.

### C2 — `server/services/backupAuth.js` (novo)

```js
// validarTokenBackup({ authorization }, tokenEsperado) -> { ok, motivo }
// motivo: 'SEM_TOKEN_CONFIGURADO' | 'AUSENTE' | 'CURTO' | 'INVALIDO' | null
// - tokenEsperado ausente/vazio -> { ok:false, motivo:'SEM_TOKEN_CONFIGURADO' } (fail-closed,
//   comportamento que a rota JA tem hoje e que deve ser preservado)
// - tokenEsperado com menos de 32 chars -> { ok:true, aviso:'CURTO' } — AVISA, nao recusa
//   (achado A4: nao ha .env no repositorio, o comprimento do token real e desconhecido daqui,
//   e recusar um token curto porem CORRETO quebraria o backup de producao)
// - aceita header Authorization: Bearer <t> E query string, esta com { aviso:'QUERY_DEPRECIADA'
//   } — o comentario da propria rota documenta ?token= como o uso (index.js:3468)
// - comparacao com crypto.timingSafeEqual sobre Buffers de MESMO tamanho (comparar tamanho
//   antes, senao timingSafeEqual lanca)
```

**Divergências de C1/C2 assumidas na Task 1** (`d5c8d3a`) — o contrato ficou mais estreito que
a realidade em três pontos:

1. `validarTokenBackup` devolve **`avisos: string[]`** (com `aviso` = `avisos[0]` mantido por
   compatibilidade), não um `aviso` único: `CURTO` e `QUERY_DEPRECIADA` **coocorrem** no caso
   mais provável em produção (token curto chamado por cron pela query string), e um campo só
   perderia justamente o aviso que a RN-02 existe para dar.
2. `motivo` **não** assume `'CURTO'` — o C2 listava `CURTO` no enum de `motivo` e ao mesmo
   tempo mandava `{ ok:true, aviso:'CURTO' }`; as duas coisas não cabem juntas. `motivo` ficou
   com os três casos de recusa (`SEM_TOKEN_CONFIGURADO`, `AUSENTE`, `INVALIDO`) e `null` no
   sucesso.
3. `backupMaisRecente` filtra `database-*.sqlite` (mesmo filtro de
   `dbRecovery.pruneOldBackups`), não "o arquivo mais novo do diretório": um `-wal`/`-shm`
   solto e mais novo não é uma cópia e sozinho não restaura nada. E a **rota** soma os
   acompanhantes `-wal`/`-shm` da cópia escolhida — `.sqlite` sem o `-wal` restaura **sem** as
   transações que só existem no WAL, o bug que `dbRecoveryBackup.api.test.js` congelou. Sem
   isso a RN-08 entregaria um fallback que não abre.

### C3 — `server/services/configSecrets.js` (novo)

```js
// Fonte unica da mascara: reusa PASSWORD_MASK de services/almoxarifado/alertService.js:17
// (exportado em :814) — NAO criar uma segunda constante.
const CHAVES_SECRETAS_CORE = ['email_smtp_pass'];
// mascararValorConfig(chave, valor) -> valor mascarado ('' quando vazio, PASSWORD_MASK quando
//   houver conteudo) ou o valor original quando a chave nao e secreta.
// podeGravarSegredo(valor) -> { ok, motivo }: recusa vazio/espacos (motivo 'VAZIO') e qualquer
//   valor que CONTENHA o PASSWORD_MASK (motivo 'MASCARA') — nao so o exatamente igual (achado
//   A2: '********N' vindo do onChange da tela passaria numa comparacao de igualdade). Regua
//   irma: alertService.shouldUpdateSecret:168-172.
//   CORRECAO deste contrato: ele dizia "-> boolean". ESTAVA ERRADO e o executor seguiu o certo:
//   os dois jeitos de recusar dao a mesma mensagem mas nao sao o mesmo fato, e a rota devolve
//   `motivo` no corpo para que o 400 seja diagnosticavel sem ler log.
// MENSAGEM_SEGREDO_INVALIDO -> a mensagem literal do 400, EXPORTADA pelo servico e nao inline
//   na rota: sem harness de core, e a unica parte da fiacao HTTP que o teste alcanca.
// ehChaveSecretaCore(chave) -> boolean.
```

### C4 — os 4 pontos em `server/index.js`

> **Os números de linha desta tabela são os da Fase 0 e JÁ ANDARAM** — a Task 1 inseriu dois
> `require` e o corpo da rota de backup, a Task 2 mexeu nas três de configuração. Posições
> reais medidas depois da Task 2: `getEmailConfig` **:2936**, `GET /api/configuracoes`
> **:17989**, `GET /:chave` **:18437**, `PUT /:chave` **:18471**. **Ache por padrão, não por
> número** — os números abaixo ficam só como registro de onde a medição encontrou cada coisa.

| # | Ponto | Mudança |
|---|---|---|
| 1 | `GET /api/backup` :3469-3489 | gate por `backupAuth.validarTokenBackup` (401 com o mesmo corpo de hoje; **avisos vão para o log, não para a resposta**); log de `req.ip` **e `x-forwarded-for`** + resultado + motivo (RN-03/A6 — sem `trust proxy`, atrás do nginx o `req.ip` é `127.0.0.1`); filtro **verificado** pela revisão: `archive.directory(dir, false, (entry) => deveIncluirNoBackup(entry.name) ? entry : false)` — é o 3º argumento de `Archiver.prototype.directory` (`archiver@7.0.1`, `lib/core.js:605,624-626,658-672`); `entries` **não** é API de filtro. Somar `archive.file()` do `backupMaisRecente()` (RN-08) |
| 2 | `getEmailConfig` :2928-2937 | **env (`SMTP_*`) → hardcoded. Banco FORA** (achado A1: os dois campos da condição estão preenchidos hoje, então o banco venceria e trocaria o host de produção de `smtp.locaweb.com.br` para `smtplw.com.br`, e o `from` viraria lista de 2 destinatários). `from = from válido ?? user`; comentário dizendo que o hardcoded é **credencial comprometida à espera de rotação** |
| 3 | `GET /api/configuracoes` :17941 e `GET /:chave` :18384 | aplicar `mascararValorConfig` na montagem (os **dois**) |
| 4 | `PUT /api/configuracoes/:chave` :18410 | chave secreta com `!podeGravarSegredo(valor)` → **400** (achado A3: o análogo real é o PUT genérico do almoxarifado, que devolve 400 com decisão congelada em teste — `configuracoesSegredo.api.test.js:200-231`; o 200 silencioso é da rota dedicada e só funciona porque a tela dela nunca reenvia a máscara). Com a tela corrigida no ponto 5, 400 é o coerente — e evita a tela dizer "salvo com sucesso" para gravação que não houve |
| 5 | `client/src/components/Configuracoes.js` (:54-80, :82-92, :325-329) | **NOVO no escopo** (achado A2): campo de senha com `value=''` + placeholder condicional (molde `ConfiguracoesAlmoxarifado.js:2193-2195`); `updateConfig` não dispara PUT para chave secreta vazia. Sem isso, o admin que digitar partindo da máscara manda `********N` — que passa em guarda de igualdade e **sobrescreve a senha real** |

## Sort topológico

| Task | Tipo | Depende de |
|---|---|---|
| 1. C1 + C2 + ponto 1 (backup) | **tronco** | — |
| 2. C3 + pontos 3 e 4 (configuração) | **galho** | — (mesmo arquivo do ponto 1 → **serializar**) |
| 3. Ponto 2 (`getEmailConfig`) | **galho** | — (mesmo arquivo → serializar) |

Os três tocam `server/index.js`: **execução serial**, T1 → T2 → T3. Sem paralelismo nesta
etapa — o ganho não compensa conflito num arquivo desse tamanho.

---

### Task 1 (tronco): backup

**Files:** Create `server/services/backupPackage.js`, `server/services/backupAuth.js`;
Modify `server/index.js` (rota de backup); Test
`server/tests/api/backupExposicao.api.test.js`.

**Feito em `d5c8d3a`** (2026-08-28). Suíte: `backupExposicao.api.test.js` **25/25**;
`npm run test:api` **142/142** (três execuções seguidas — a primeira, ainda com o servidor de
prova recém-derrubado na máquina, deu 137/142 sem nenhum `✗`, ou seja, arquivos que
abortaram, não asserções que falharam; as três execuções seguintes vieram limpas).

- [x] **Step 1: teste que falha** — RN-01: `deveIncluirNoBackup` recusa
  `.runtime-secrets.json` e qualquer coisa sob `backups/`, **e aceita** `database.sqlite`,
  `database.sqlite-wal`, `uploads/almoxarifado/x.png`, `variaveis-base.json` (o caso positivo
  é o que impede "excluir demais"); RN-02: `validarTokenBackup` — header válido ok, query
  string ignorada (passar objeto sem `authorization` → `AUSENTE`), token esperado curto →
  `CURTO`, token errado de MESMO tamanho → `INVALIDO` (prova o `timingSafeEqual`), token
  errado de tamanho diferente → `INVALIDO` **sem lançar**, env ausente →
  `SEM_TOKEN_CONFIGURADO`.
- [x] **Step 2: rodar e ver falhar.** Módulo inexistente é vermelho fraco (só `MODULE_NOT_FOUND`),
  então os dois serviços foram criados como **stubs permissivos** (`deveIncluirNoBackup` sempre
  `true`, `validarTokenBackup` sempre `{ok:true}`) para o vermelho ser por asserção:
  **9 passed, 16 failed**.
- [x] **Step 3: implementar** (as duas funções puras; depois a rota). API do `archiver@7.0.1`
  reconferida no código instalado antes de mexer na rota: `lib/core.js:605,624-672` — o 3º
  argumento de `directory()` recebe `entryData` com `name = match.relative` e devolver `false`
  pula a entrada. Confere com o C4 ponto 1.
- [x] **Step 4: verde + controle positivo** (commitado antes, em `d5c8d3a`) — comentar
  `.runtime-secrets.json` em `EXCLUIDOS` derrubou 2 cenários (**23 passed, 2 failed**: o da
  RN-01 e o que congela o conteúdo de `EXCLUIDOS`); revertido com `git checkout`, verde de
  novo. `npm run test:api` **142/142**.
- [x] **Step 5: prova manual do zip** (não versionada). Rota real, servidor de pé com
  `CRM_DATA_DIR` apontado para pasta temporária (**não** o `server/data` real) e
  `BACKUP_TOKEN` de teste. Conteúdo do zip: `database.sqlite`, `variaveis-base.json`,
  `uploads/**` e **uma única** entrada sob `backups/` — a cópia mais recente e seu `-wal`.
  **Sem `.runtime-secrets.json`** (que existia na pasta) e **sem** as 3 cópias antigas. Log:
  `[Backup] NEGADO ip=… xff=- motivo=AUSENTE`, `motivo=INVALIDO` (token errado do mesmo
  tamanho), `[Backup] ACEITO ip=… xff=203.0.113.9 fallback=database-…sqlite` e
  `avisos=QUERY_DEPRECIADA` no acesso por query string.
- [x] **Step 6: commit** — `d5c8d3a`.

### Task 2 (galho): máscara e guarda nas configurações do core

**Files:** Create `server/services/configSecrets.js`; Modify `server/index.js` (3 rotas);
Test `server/tests/api/configSecretsCore.api.test.js`.

- [ ] **Step 1: teste que falha** — RN-05: `mascararValorConfig('email_smtp_pass', 'x')` →
  `PASSWORD_MASK`; com `''` → `''`; chave não-secreta → valor intacto; e **asserção de fonte
  única**: a constante usada é a mesma exportada por `alertService` (importar as duas e
  comparar). RN-06: `podeGravarSegredo` recusa `''`, `'   '` e `PASSWORD_MASK`; aceita valor
  real.
- [ ] **Step 2: rodar e ver falhar; implementar; verde; controle positivo** (commitar antes):
  fazer a máscara devolver o valor e ver o cenário falhar; reverter.
- [ ] **Step 3: `npm run test:api`; commit.**

### Task 3 (galho): `getEmailConfig`

**Files:** Modify `server/index.js`; Test — **declarado sem teste automatizado**, com o
motivo: a função lê o banco de produção real via `db` do módulo e o único consumidor é uma
rota que não tem harness. A prova é manual (Step 2).

- [ ] **Step 1: implementar** a precedência do C4 ponto 2 (**env → hardcoded, banco FORA**),
  com o comentário sobre a credencial comprometida e sobre por que o banco não entra.
- [ ] **Step 2: prova manual** (não versionada): script que carrega a função com `SMTP_*`
  definidas → usa env; sem elas → cai para o hardcoded; `SMTP_FROM` com duas caixas → cai
  para `SMTP_USER`. Registrar a saída no relato.
- [ ] **Step 3: commit.**

### Task 4 (limpeza de documentação)

- [ ] Remover a senha replicada em
  `docs/superpowers/plans/2026-08-02-almoxarifado-etapa0-fundacao.md:847`, substituindo por
  `(credencial removida — ver Etapa 21)`. **Não** reescrever histórico; a linha sai do estado
  atual e o fato fica declarado.

## Execução (estado)

- [x] Fase 2 — revisão do plano por agente fresco (2026-08-28): **11 achados, 2 bloqueantes,
  todos acatados.** (A1) a precedência do SMTP trocaria o **host de produção** — os dois
  campos da condição estão preenchidos hoje, então "usar o banco se estiver completo" não era
  salvaguarda, era interruptor; banco saiu da precedência. (A2) a spec afirmava que a guarda
  cobria o admin editando a partir da máscara — **falso e reproduzido**: a tela salva a cada
  tecla, `********N` passa em guarda de igualdade e sobrescreve a senha real, com o estrago
  invisível porque o GET mascara de novo; a tela entrou no escopo. Mais: 400 em vez de 200 no
  PUT (A3, o precedente citado era o da rota errada); a RN-02 quebrava o backup de produção
  por dois caminhos, contradizendo o próprio design (A4); a API de filtro do `archiver` que o
  plano citava **não existe** — a real foi verificada e congelada (A5); o IP do log seria o do
  proxy (A6); tirar `backups/` inteiro removeria o fallback que `dbRecovery` manda usar (A7);
  a data da senha no git era 2026-03-17, não 02-05 (A8). O revisor confirmou os três fatos
  centrais, inclusive que o zip entrega o `jwtSecret`.
- [x] **Task 1 (tronco): backup** — `d5c8d3a` (2026-08-28). 25/25 no arquivo novo,
  `npm run test:api` 142/142, controle positivo 23/25 com a sabotagem. Três divergências do
  contrato assumidas e documentadas acima (avisos em lista, `motivo` sem `CURTO`,
  acompanhantes do backup no zip).
- [ ] Task 2 · [ ] Task 3 · [ ] Task 4
- [ ] Fase 4 — suíte completa serial
- [ ] Fase 5 — revisão adversarial (2 lentes)
- [ ] Fase 6 — fechar-etapa + retro

## Retro (preencher no fechamento)

- Rodadas de correção até verde: —
- Achados da revisão: reais — / ruído —
- Paralelismo real: —
- Defeito que escapou: —
