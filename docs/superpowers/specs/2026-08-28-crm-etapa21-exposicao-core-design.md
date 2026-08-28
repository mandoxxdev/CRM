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
2. **Senha de SMTP literal no código** (`server/index.js:2934`), **no git desde 2026-03-17**
   e replicada em `docs/superpowers/plans/2026-08-02-almoxarifado-etapa0-fundacao.md:847`.
   Trocar o arquivo **não remove de clone nenhum** — só rotação na Locaweb resolve.
3. **`GET /api/configuracoes` e `GET /api/configuracoes/:chave`** (`:17941`, `:18384`)
   devolvem `email_smtp_pass` em claro para admin de administrativo **ou comercial** — grupo
   maior que quem precisa da senha. E o `PUT /:chave` (`:18410`) aceita qualquer valor, sem a
   guarda que a rota irmã do almoxarifado tem.

**Não existe rota de restore** (verificado) — e é bom que não exista; a spec registra para
ninguém "consertar" inventando uma.

**Escopo escolhido — o que reduz mais risco por linha alterada:**

- **Backup:** (a) **tirar `.runtime-secrets.json` do zip e substituir o diretório `backups/`
  pela cópia mais recente** — mata a escalada de privilégio e os 188 MB **sem** remover o
  fallback de recuperação que `dbRecovery.js:86` manda usar (RN-08); (b) `timingSafeEqual` no
  token, com **query string ainda aceita** e aviso de depreciação no log, e token curto
  avisando em vez de recusar (RN-02 — a versão anterior deste bloco quebrava o backup de
  produção por dois caminhos, contradizendo o próprio parágrafo seguinte); (c) registrar quem
  baixou — **IP e `x-forwarded-for`**, porque não há `trust proxy` configurado e atrás do
  nginx o `req.ip` vira `127.0.0.1`, tornando o log inútil justamente em produção.
  **O token continua sendo caminho válido**: não troco por sessão, porque pode existir cron
  externo na VPS que eu não enxergo daqui — quebrar backup de produção seria pior que o risco
  que estou fechando.
- **SMTP:** `getEmailConfig` passa a preferir **env → hardcoded**. **O banco fica FORA da
  precedência** — correção de um erro deste próprio design (achado A1 da revisão): a versão
  anterior mandava usar o banco "quando `host` e `pass` estiverem preenchidos", e os dois
  **estão** preenchidos hoje. Aquilo não era salvaguarda, era interruptor que dispararia: o
  host de produção sairia de `smtp.locaweb.com.br` (que funciona) para `smtplw.com.br`, outro
  produto com outro esquema de credencial, e o `from` viraria uma lista de DOIS destinatários.
  O objetivo da etapa — tirar a senha do código como fonte primária — é cumprido por
  `env → hardcoded` **sem trocar host em produção**. Adotar o banco exigiria envio real
  verificado contra aquele host, impossível daqui; fica declarado na letra B. O hardcoded
  permanece como último recurso, com comentário dizendo que é credencial comprometida à
  espera de rotação.
- **Configurações:** máscara `PASSWORD_MASK` nos **dois** GETs (plural e singular), guarda no
  `PUT /:chave` **e a tela ajustada junto**. **Correção de afirmação FALSA desta spec**
  (achado A2, reproduzido): a versão anterior dizia que "a guarda cobre o caso de o admin
  editar partindo da máscara" — **não cobre**. A tela do core salva a cada tecla
  (`Configuracoes.js:54-80` + `:82-92`) e amarra o valor do servidor direto no input; com a
  máscara no campo, o admin que clicar e digitar manda `********N`, que **não é** a máscara,
  passa em qualquer guarda de igualdade e **sobrescreve a senha real com lixo** — e como o GET
  seguinte mascara de novo, o estrago fica invisível. Um backspace acidental grava `*******` e
  mata o SMTP em silêncio. Por isso o escopo inclui `client/src/components/Configuracoes.js`:
  campo de senha com `value=''` e placeholder condicional (molde do almoxarifado,
  `ConfiguracoesAlmoxarifado.js:2193-2195`), sem PUT quando vazio. E a guarda do servidor
  recusa qualquer valor que **contenha** a máscara, não só o exatamente igual.

**Fica FORA, declarado:**

- **A rotação da senha na Locaweb** — é operação, não código, e sem ela o item 2 é cosmético.
  Vai para a letra B com o fato de estar no git desde 2026-03-17.
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
- **RN-02 — O token do backup é comparado em tempo constante.** **Query string continua
  aceita nesta etapa, com aviso de depreciação no log** (correção do achado A4: o design se
  contradizia — prometia não quebrar backup de produção e removia o caminho documentado no
  comentário da própria rota, além de exigir 32+ caracteres, o que recusaria token curto porém
  correto; não há `.env` no repositório e o comprimento real é desconhecido daqui). Token
  curto passa a **avisar no log**, não a recusar.
- **RN-03 — Todo download de backup é registrado** (horário, IP, sucesso/negado).
- **RN-04 — `getEmailConfig` prefere env → hardcoded** (banco fora, achado A1), com `from`
  caindo para `user` quando o configurado não for um endereço único.
- **RN-05 — Nenhum GET de configuração do core devolve `email_smtp_pass` em claro**
  (plural e singular).
- **RN-06 — `PUT /configuracoes/:chave` recusa com 400** valor vazio ou que contenha a
  máscara. **400, não 200 silencioso** (achado A3): o análogo real é o PUT genérico do
  almoxarifado, que devolve 400 com decisão congelada em teste; o 200 silencioso é da rota
  dedicada, que só funciona porque a tela dela nunca reenvia a máscara. Com a tela corrigida
  (RN-07), 400 é o coerente — e evita o pior caso atual: a tela dizer "salvo com sucesso" para
  gravação que não aconteceu.
- **RN-07 — A tela nunca envia a máscara.** Campo de senha nasce vazio, com placeholder
  dizendo que já está configurada; vazio não dispara PUT.
- **RN-08 — O backup mantém o fallback de recuperação.** O zip exclui `backups/` **mas inclui
  a cópia mais recente** — `dbRecovery.js:86` manda restaurar dali, e excluir o diretório
  inteiro removeria o fallback exatamente no cenário "banco corrompido", único motivo de ele
  existir (achado A7).

## Arquitetura

Três funções puras novas em `server/services/`, testáveis sem HTTP (o padrão que
`systemPermissions.js` e `dbRecovery.js` já estabeleceram no core):

- **`services/backupPackage.js`** — `deveIncluirNoBackup(nomeRelativo)`: a lista de exclusão e
  o porquê de cada item, mais `backupMaisRecente(dir)` (RN-08). A rota filtra pelo **terceiro
  argumento de `archive.directory(dir, false, fn)`** — a revisão verificou que é essa a API do
  `archiver@7.0.1` (`entries` é só contador de progresso) e que o glob **desce** dentro de
  `backups/` mesmo com a entrada do diretório recusada, o que torna a regra de primeiro
  segmento obrigatória.
- **`services/backupAuth.js`** — `validarTokenBackup(header, tokenEsperado)`:
  `timingSafeEqual`, comprimento mínimo, sem query string. Devolve `{ ok, motivo }`.
- **`services/configSecrets.js`** — `mascararValorConfig(chave, valor)` e
  `podeGravarSegredo(valor)` → `{ ok, motivo }`, reusando `PASSWORD_MASK` do `alertService`
  (fonte única — não criar uma segunda máscara), mais `MENSAGEM_SEGREDO_INVALIDO` e
  `ehChaveSecretaCore`.
  **Esta linha dizia `mascararConfig(linha)` e `podeGravarSegredo(valor) → boolean`: ESTAVA
  ERRADA** — ficou para trás do contrato C3 do plano, corrigido na Fase 2, e do que foi
  entregue. A assinatura recebe `(chave, valor)` porque quem chama itera linhas do banco e
  precisa decidir **por chave**; e o retorno é `{ ok, motivo }` porque a rota distingue os dois
  jeitos de recusar (`VAZIO` e `MASCARA`), que dão a mesma mensagem mas não são o mesmo fato.
  A mensagem literal mora no serviço, não inline na rota: é a única parte da fiação HTTP que o
  teste alcança sem harness de core.

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
