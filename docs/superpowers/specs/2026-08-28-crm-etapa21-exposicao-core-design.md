# CRM — Etapa 21: exposição no core (backup, SMTP e configurações) — design

Data: 2026-08-28 · Branch: `desenvolvimento-almoxarifado`
Origem: letra B da Etapa 20 (itens declarados como "core, fora do módulo").

> **Esta é a primeira etapa fora do módulo almoxarifado.** O contrato das etapas anteriores
> ("só `routes/almoxarifado*`") não se aplica; em compensação, o core **não tem harness de
> teste** (`tests/helpers/testApp.js` monta só o almoxarifado, e `server/index.js` tem 23 mil
> linhas, abre banco em disco e faz `listen` no import). Isso molda o escopo: o que dá para
> testar é **função pura extraída**, no mesmo movimento que `systemPermissions` e `dbRecovery`
> já fizeram nesta base.

## Decisão de escopo (Fase 0 — medida em 2026-08-28)

A medição achou três coisas, uma delas bem pior do que o relatado na Etapa 20:

1. **`GET /api/backup` (`server/index.js:3469`) empacota o diretório de dados INTEIRO — e
   isso inclui `.runtime-secrets.json` com o `jwtSecret` em claro.** Quem baixa o zip **forja
   token de superadmin** (`server/index.js:318` usa esse mesmo segredo). Não é vazamento de
   dados: é escalada de privilégio. O zip também carrega `backups/` — **188 MB** de cópias
   históricas do banco. O gate é um token estático de env, aceito **pela query string**,
   comparado com `!==`. Sem `authenticateToken`, sem perfil, sem registro de quem baixou.
   **Fail-closed quando a env não existe** (esse ponto está correto hoje).
2. **Senha de SMTP literal no código** (`server/index.js:2934`), **no git desde 2026-02-05**
   e replicada em `docs/superpowers/plans/2026-08-02-almoxarifado-etapa0-fundacao.md:847`.
   Trocar o arquivo **não remove de clone nenhum** — só rotação na Locaweb resolve.
3. **`GET /api/configuracoes` e `GET /api/configuracoes/:chave`** (`:17941`, `:18384`)
   devolvem `email_smtp_pass` em claro para admin de administrativo **ou comercial** — grupo
   maior que quem precisa da senha. E o `PUT /:chave` (`:18410`) aceita qualquer valor, sem a
   guarda que a rota irmã do almoxarifado tem.

**Não existe rota de restore** (verificado) — e é bom que não exista; a spec registra para
ninguém "consertar" inventando uma.

**Escopo escolhido — o que reduz mais risco por linha alterada:**

- **Backup:** (a) **tirar `.runtime-secrets.json` e `backups/` do zip** — mata a escalada e os
  188 MB; (b) token só por header `Authorization`, comparado com `timingSafeEqual`, exigindo
  comprimento mínimo; (c) registrar no log quem baixou (IP + horário). **O token continua
  sendo caminho válido**: não troco por sessão, porque pode existir cron externo na VPS que
  eu não enxergo daqui — quebrar backup de produção seria pior que o risco que estou fechando.
- **SMTP:** `getEmailConfig` passa a preferir **banco → env → hardcoded**, mas **por
  conjunto** (só usa o banco se `host` **e** `pass` estiverem preenchidos) e com
  `from || user`. Motivo medido: o banco tem `host` diferente do código (`smtplw.com.br` ×
  `smtp.locaweb.com.br`) e `email_from` **não é um remetente — é uma lista de dois
  destinatários**; preferir o banco cegamente colocaria duas caixas no `From` e o SMTP
  tenderia a recusar. O hardcoded fica como último recurso, com comentário dizendo que é
  credencial comprometida à espera de rotação.
- **Configurações:** máscara `PASSWORD_MASK` nos **dois** GETs (plural e singular — mascarar
  só um deixaria a porta aberta) e `shouldUpdateSecret` no `PUT /:chave`, reusando exatamente
  o par que o almoxarifado já usa. **A tela salva campo a campo** (`Configuracoes.js:81-91`),
  então não reenvia a senha ao editar outro campo — risco baixo, e a guarda cobre o caso de o
  admin editar partindo da máscara.

**Fica FORA, declarado:**

- **A rotação da senha na Locaweb** — é operação, não código, e sem ela o item 2 é cosmético.
  Vai para a letra B com o fato de estar no git desde fevereiro.
- **Limpar a senha do histórico do git** (rewrite) — reescrever histórico de repositório
  compartilhado quebra clones de terceiros; decisão de infraestrutura.
- **Harness de core / extrair as rotas de `index.js`** — extrair a rota de backup para um
  registrador testável é o caminho que mais paga, mas é refatoração de arquivo de 23 mil
  linhas; **esta etapa testa as funções puras extraídas** e declara o gate HTTP sem teste.
- **A aba "Backup" da tela de Configurações** — edita 3 chaves que **nenhum leitor do servidor
  consome** (o backup real roda no startup com `keep` fixo em 10, ignorando
  `backup_manter_dias`). É feature morta; nomeada, não consertada aqui.

## Regras de negócio (RN)

- **RN-01 — O zip do backup não carrega segredo de runtime nem backups históricos.**
  `.runtime-secrets.json` e o diretório `backups/` ficam de fora.
- **RN-02 — O token do backup só vale por header**, com comparação em tempo constante e
  comprimento mínimo de 32 caracteres. Query string deixa de ser aceita.
- **RN-03 — Todo download de backup é registrado** (horário, IP, sucesso/negado).
- **RN-04 — `getEmailConfig` prefere banco (conjunto completo) → env → hardcoded**, com
  `from` caindo para `user` quando o configurado não for um endereço único.
- **RN-05 — Nenhum GET de configuração do core devolve `email_smtp_pass` em claro**
  (plural e singular).
- **RN-06 — `PUT /configuracoes/:chave` não grava a máscara nem valor vazio como senha.**

## Arquitetura

Três funções puras novas em `server/services/`, testáveis sem HTTP (o padrão que
`systemPermissions.js` e `dbRecovery.js` já estabeleceram no core):

- **`services/backupPackage.js`** — `deveIncluirNoBackup(nomeRelativo)`: a lista de exclusão e
  o porquê de cada item. A rota passa a filtrar por ela.
- **`services/backupAuth.js`** — `validarTokenBackup(header, tokenEsperado)`:
  `timingSafeEqual`, comprimento mínimo, sem query string. Devolve `{ ok, motivo }`.
- **`services/configSecrets.js`** — `mascararConfig(linha)` e `podeGravarSegredo(valor)`,
  reusando `PASSWORD_MASK` do `alertService` (fonte única — não criar uma segunda máscara).

## Testes

- `backupPackage.api.test.js`: RN-01 (os dois excluídos, o resto incluído, e um caso provando
  que `database.sqlite` **continua** entrando — senão o backup deixaria de ser backup).
- `backupAuth.api.test.js`: RN-02 (header ok, query recusada, token curto recusado, token
  errado recusado, ausência de env recusada).
- `configSecrets.api.test.js`: RN-05/RN-06 (máscara nas duas formas; `podeGravarSegredo`
  recusando vazio e a própria máscara).
- **Declarado sem teste:** o gate HTTP das três rotas e o `getEmailConfig` — não há harness de
  core, e montar um exigiria extrair rotas de um arquivo de 23 mil linhas. As funções puras
  cobrem a régua; a fiação fica declarada.

## O que muda em cada camada

| Camada | Mudança |
|---|---|
| `services/backupPackage.js`, `backupAuth.js`, `configSecrets.js` | novos (funções puras) |
| `server/index.js` | rota de backup (filtro + gate + log), `getEmailConfig`, os 2 GETs e o PUT de configuração |
| `docs/.../etapa0-fundacao.md:847` | a senha replicada na documentação sai |
