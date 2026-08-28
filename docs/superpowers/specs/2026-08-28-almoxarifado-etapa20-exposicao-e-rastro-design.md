# Almoxarifado — Etapa 20: os três buracos de exposição e rastro (design)

Data: 2026-08-28 · Branch: `desenvolvimento-almoxarifado`
Origem: os 3 itens "fora de escopo, nomeados" que a Etapa 19 deixou na spec 23.

## Decisão de escopo (Fase 0 — medida em 2026-08-28)

Os três são pequenos, da mesma família e **medidos com quebra zero prevista**:

1. **`POST /materiais/:id/foto`** (`routes/almoxarifado.js:646`) — é a **única** das 6 rotas
   multipart do módulo que (a) responde **200 para material inexistente** (o `db.run` não
   consulta `this.changes`), (b) **não limpa o arquivo órfão** em nenhuma saída ≠ 200, e
   (c) apaga a foto anterior por um `db.get` **fire-and-forget** que corre em paralelo com o
   UPDATE, com `fs.unlinkSync` **sem try/catch**. A rota irmã de certificado
   (`almoxarifado.js:672`) faz tudo certo e é o molde. Também não audita — a Etapa 19
   instrumentou os 12 cadastros e esta ficou fora.
2. **`GET /configuracoes`** (`almoxarifado.js:2308`) — devolve `alertas_smtp_pass`,
   `alertas_whatsapp_api_key` e `alertas_whatsapp_webhook_url` **em claro**, enquanto a rota
   irmã de alertas (`:2427`) mascara com `PASSWORD_MASK` (`alertService.js:17`). **Medido:
   nenhum consumidor depende do valor real** — a tela de Configurações Gerais monta o payload
   só com as 18 chaves de `CAMPOS`, que não inclui segredo (e há teste travando isso,
   `ConfiguracoesGerais.test.js:149`); o outro consumidor lê só a tolerância de inventário.
3. **`GET /setores-requisicao/:id/permissoes`** (`extended.js:1552`) — só `auth`: qualquer
   usuário do módulo lê o mapa de acesso de qualquer setor, enquanto **escrever** exige
   admin. O único consumidor é a aba administrativa, já `adminOnly` no menu.

**Decisões que a medição deixou em aberto e que eu tomo aqui** (todas reversíveis, registro
na letra B do fechamento):

- **Forma da máscara no GET genérico:** reusar `PASSWORD_MASK` (`'********'`) — o mesmo que a
  rota irmã já devolve, então a tela vê o mesmo formato nas duas. **Descartado** omitir a
  chave (mudaria a forma da resposta e a tela itera as chaves) e **descartado** um booleano
  `configurado` (formato novo só para este caso).
- **O `PUT /configuracoes` genérico passa a RECUSAR as duas chaves secretas.** Hoje ele
  aceita (são chaves semeadas) e **sem** o `shouldUpdateSecret` que a rota de alertas usa —
  ou seja, mascarar só o GET deixaria a porta meio fechada: quem lesse `'********'` e
  reenviasse pelo PUT genérico gravaria a máscara **como senha**. Recusar com mensagem que
  aponta a rota certa é o conserto honesto.
- **Gate do GET de permissões:** `isSystemAdmin || canConfigureAlmox`, **igual às duas rotas
  de escrita irmãs**. **Descartado** `denyUnlessAlmoxAdmin` (mais estreito, usado nas
  configs): ler e escrever a mesma coisa devem exigir o mesmo, e a assimetria entre os dois
  gates do módulo já está declarada na spec 23 como nota.

**Fica FORA, declarado:**

- **`GET /api/backup` e a credencial SMTP hardcoded** (`server/index.js:2929-2936`,
  `:3469`) — **são do core, não do módulo**, e entrar ali muda o contrato que as etapas
  seguem. Além disso: o backup pode ter rotina externa agendada que eu não enxergo daqui, e a
  credencial exige rotação na Locaweb (operação, não código). **Vai para a letra B com o que
  medi**, incluindo o fato de a senha estar no histórico do git desde março — trocar o
  arquivo não a remove de clones existentes.
- **`GET /configuracoes/liberacao-valor`** (`almoxarifado.js:2580`) expõe nome e e-mail dos
  aprovadores a qualquer usuário do módulo, e **não pode ser simplesmente fechada** (a lista
  de requisições depende dela para saber se você é aprovador). Reduzir o payload para
  não-admin é mudança de contrato de API — decisão do usuário, letra B.
- **G7 (erro de multer virando 500 opaco nas 5 rotas de upload)** — a rota de foto é uma
  delas, mas o conserto é um error-handler uniforme + teste de MIME/limite nas cinco;
  dobraria a etapa. Segue nomeado na spec 24.
- **A matriz de leitura do módulo** (dezenas de GETs operacionais com só `auth`) — é dado de
  estoque, não credencial; etapa própria se um dia valer.

## Regras de negócio (RN)

- **RN-01 — Foto de material inexistente falha.** `POST /materiais/:id/foto` com id que não
  existe → **404** `Material não encontrado`, **sem** deixar arquivo no disco.
- **RN-02 — Nenhuma saída ≠ 200 deixa órfão.** Erro de banco, 404 ou 403 apagam o arquivo
  que o multer já gravou.
- **RN-03 — A troca de foto não corre com o UPDATE.** A foto anterior só é apagada **depois**
  de o novo caminho estar gravado, e a falha ao apagar não derruba a resposta (try/catch).
- **RN-04 — Trocar foto deixa rastro** (`material`/`ATUALIZACAO`, de/para do nome do arquivo).
- **RN-05 — O GET genérico não devolve segredo.** `alertas_smtp_pass` e
  `alertas_whatsapp_api_key` saem como `'********'` quando há valor, `''` quando não há —
  idêntico à rota de alertas. `alertas_whatsapp_webhook_url` sai com a query string
  mascarada (mesmo tratamento que o log já dá, `configDiff.mascararUrl`).
- **RN-06 — O PUT genérico recusa as chaves secretas.** 400 com mensagem que aponta a rota
  própria; a coluna não é tocada.
- **RN-07 — Ler o mapa de acesso exige o mesmo que escrevê-lo.** Perfis sem
  `isSystemAdmin || canConfigureAlmox` → 403.

## Arquitetura

Sem serviço novo. Três mudanças pontuais, cada uma copiando um molde que já existe no módulo:

- **Foto:** ordem `SELECT` (404 + foto anterior) → `multer` já rodou → `UPDATE` → `unlink` da
  anterior em try/catch → auditoria pós-escrita. Órfão limpo em toda saída ≠ 200.
  **`limparUploadOrfao` precisa sair do closure de `extended.js:889`** para um módulo
  compartilhado (`services/almoxarifado/uploadCleanup.js`) — hoje não é exportada e
  `routes/almoxarifado.js` não a alcança.
- **GET/PUT de configurações:** máscara na serialização do GET (reusando `PASSWORD_MASK` e
  `configDiff.mascararUrl`) e guarda de chave secreta no PUT, ao lado das guardas de prefixo
  que já existem.
- **Gate do GET de permissões:** a mesma linha das irmãs de escrita.

## Testes

- `fotoMaterialRastro.api.test.js`: RN-01 a RN-04, com contagem de arquivos no diretório
  antes/depois (o molde existe em `permissoesRotas.api.test.js:535-549`).
- `configuracoesSegredo.api.test.js`: RN-05 (as três chaves, com asserção **negativa** de que
  o valor real não aparece no corpo) e RN-06 (400 + coluna intacta).
- `permissoesSetorLeitura.api.test.js`: RN-07, matriz de perfis (o GET **não tem nenhum teste
  hoje** — fechar sem prova seria fechar às cegas).
- Controle positivo obrigatório em cada um.

## O que muda em cada camada

| Camada | Mudança |
|---|---|
| `services/almoxarifado/uploadCleanup.js` | novo (extrai `limparUploadOrfao` do closure) |
| `routes/almoxarifado/extended.js` | passa a usar o módulo extraído; gate no GET de permissões |
| `routes/almoxarifado.js` | rota de foto reescrita; máscara no GET e guarda no PUT de configurações |
| `specs/23` e `specs/24` | itens riscados; o que sobra renomeado |
