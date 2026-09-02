# Etapa 32 — Anexos de documento: a tabela órfã ganha dono

> **Data:** 2026-09-02 · **Feature principal:** 09 (inspeção e qualidade) · **Features
> destravadas:** 01, 04, 08, 09, 12, 14
> **Classificação:** arquitetural — subsistema novo, contrato de API novo, fronteira de download
> autenticado e componente de UI reutilizável.

## Fase 0 — o que foi medido (não suposto)

### 1. A tabela existe e é órfã total

`server/services/almoxarifado/schema.js:1692` cria `anexos_documento_almoxarifado`:

```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
entidade TEXT NOT NULL,
entidade_id INTEGER NOT NULL,
tipo TEXT NOT NULL,
arquivo_path TEXT NOT NULL,
nome_original TEXT,
uploaded_by INTEGER,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
```

Varredura por `anexos_documento_almoxarifado` em todo o repositório (fora de `node_modules`):
**11 ocorrências, todas em documentação** — 6 specs, 3 planos/designs, 1 `estado-atual.md` e a
linha do `CREATE TABLE`. **Zero `INSERT`, zero `SELECT`, zero rota, zero componente.** A tabela
não tem índice, não tem coluna de soft delete e não tem descrição.

O plano da Etapa 31 mandava, com todas as letras, *"medir se a tabela existe antes de desenhar,
porque a spec 09 a cita como 'item próprio de outra spec' e isso não é o mesmo que 'existe'"*.
**Medido: existe como DDL, não existe como funcionalidade.** As duas leituras estavam certas pela
metade, e é por isso que o item nunca andou — cada spec assumia que outra o pagaria.

### 2. Seis specs a nomeiam como pendência

| Feature | Linha | O que está esperando |
|---|---|---|
| 01 Cadastros | `01-cadastros-materiais/README.md:43` | ficha técnica e documentos na tela do material |
| 04 Requisições | `04-requisicoes/README.md:45` e `:59` | desenho/documento na requisição, e o campo no form |
| 08 Recebimento | `08-recebimento/README.md:131` | fotos do recebimento |
| 09 Inspeção | `09-inspecao-qualidade/README.md:107` e `:161` | certificado, relatório dimensional, fotos |
| 12 Devoluções | `12-devolucoes/README.md:144` | fotos da devolução |
| 14 Terceiros | `14-materiais-terceiros/README.md:114` e `:343` | desenho no item da remessa |

A 09 é a única que diz explicitamente que **este item é o que impede um item já quase pago de
estar inteiro** (`:162`: *"É o que impede o item 'form de inspeção com plano/medidas/fotos' de
estar inteiro"*). Por isso a feature 09 é a consumidora desta etapa.

### 3. A infraestrutura de upload já existe — seis vezes

`multer` aparece em **seis** instâncias no módulo, todas com o mesmo molde:

| Instância | Arquivo | Prefixo do filename |
|---|---|---|
| `uploadAlmox` (foto de material) | `routes/almoxarifado.js:198` | `material-` |
| `uploadCertificado` (lote) | `routes/almoxarifado.js:209` | `certificado-` |
| `uploadComprovanteSucata` | `routes/almoxarifado/extended.js:134` | *(comprovante)* |
| `uploadCertificadoCalibracao` | `routes/almoxarifado/extended.js:1353` | `calibracao-` |
| `uploadFotoOcorrencia` | `routes/almoxarifado/extended.js:1441` | `ocorrencia-` |
| `uploadAssinatura` | `routes/almoxarifado/extended.js:1489` | `assinatura-` |

Todas gravam **flat** em `uploadsAlmoxDir`, com `<prefixo>-<Date.now()>-<Math.round(random*1e9)><ext>`,
`limits: 10 MB`, e usam `limparUploadOrfaoEm(req, dir)` (`services/almoxarifado/uploadCleanup.js`)
em toda saída ≠ sucesso. A ordem canônica de middlewares está escrita no código
(`extended.js:1369`): **`auth` → `requirePermission` → `multer` → `safeParse` manual**, com o
precedente provado em `tests/api/permissoesRotas.api.test.js:515-534` (o 403 sai **antes** de o
multer gravar). **Nada disso precisa ser inventado nesta etapa — precisa ser reusado.**

### 4. ⚠️ O furo de segurança que a medição encontrou

`server/routes/almoxarifado.js:229-230`:

```js
app.use('/api/uploads/almoxarifado', require('express').static(uploadsAlmoxDir));
app.use('/uploads/almoxarifado',     require('express').static(uploadsAlmoxDir));
```

E só na **linha 232** vem `app.use('/api/almoxarifado', ...almoxMiddleware)`. Os dois mounts
estáticos estão em **prefixo diferente** do autenticado: não passam por `authenticateToken` nem
por `checkModulePermission`. **Qualquer pessoa, deslogada, com a URL na mão, baixa qualquer
arquivo de upload do almoxarifado** — inclusive o comprovante de sucateamento, o certificado do
fornecedor e a **imagem de assinatura de entrega**. A defesa hoje é o nome do arquivo
(`Date.now()` + `random*1e9`): obscuridade, não controle.

**Duas consequências para o desenho, e a segunda é a que quase passou:**

1. Tirar os mounts **quebra tela**. O client aponta `<img src>` e `<a href>` direto para eles —
   `client/src/utils/resolveMaterialPhotoUrl.js:14-19`, `LotesAlmoxarifado.js:11`, e os testes
   `LotesAlmoxarifado.test.js:298` e `RequisicoesList.test.js:155,289` congelam essas URLs. Não é
   fix de uma linha; é etapa própria, com migração do client para download autenticado.
2. **`express.static(root)` serve as subpastas de `root` também.** Guardar os anexos novos em
   `uploads/almoxarifado/anexos/` — o instinto óbvio — os deixaria **igualmente públicos**, com a
   etapa fabricando exatamente o problema que ela existe para não ter. Os anexos vão para um
   diretório **irmão**, `uploads/almoxarifado-anexos/`, que nenhum `express.static` alcança.

## Decisões de desenho

### D1 — Diretório irmão, criado no boot

`PERSISTENT_DATA_DIR/uploads/almoxarifado-anexos/`, criado com `fs.mkdirSync(..., {recursive:true})`
junto de `uploadsAlmoxDir`. Explícito porque **o multer não cria diretório** — está escrito no
código (`extended.js:1350`, decisão D3 da Etapa 9b: o primeiro upload numa subpasta inexistente dá
`ENOENT` → 500). O harness de teste passa o seu próprio diretório
(`tests/helpers/testApp.js:80`), então o caminho é **parâmetro**, nunca constante do módulo — a
armadilha já documentada em `uploadCleanup.js`.

**Fiação, e é onde esta base já matou uma feature.** `uploadsAlmoxDir` nasce em
`routes/almoxarifado.js:187` a partir do **parâmetro** `PERSISTENT_DATA_DIR` (4º argumento do
registrador) e é **passado adiante** para `registerExtendedRoutes(app, db, auth, uploadsAlmoxDir)`
— o comentário de `almoxarifado.js:3695` proíbe, com todas as letras, re-derivar de
`config/paths.js`, porque no harness o diretório seria o errado. `uploadsAnexosDir` segue
exatamente o mesmo caminho e vira o **5º parâmetro** da extended. Se ele não for passado, o
`destination` do multer recebe `undefined` e a rota morre em runtime **com toda a suíte de unidade
verde** — é o modo de falha exato da Etapa 25 (12 cenários de unidade verdes, 4 de integração
vermelhos). Por isso o cenário de integração **entra pela rota**, não pelo serviço, e o harness
(`tests/helpers/testApp.js`) passa a expor `uploadsAnexosDir` junto de `uploadsAlmoxDir`.

### D2 — Download autenticado, e o `basename` é a guarda

`GET /api/almoxarifado/anexos/:id/arquivo` vive **dentro** do prefixo `/api/almoxarifado`, então
herda `authenticateToken` + `checkModulePermission`, e ganha `requirePermission('visualizar')` por
cima. O arquivo é resolvido como `path.join(anexosDir, path.basename(row.arquivo_path))` —
`basename` mata travessia de caminho mesmo se a coluna for adulterada por outra via. Arquivo
ausente no disco com linha viva no banco → **404 `"Arquivo do anexo não encontrado"`**, não 500:
é estado esperado (restore de banco sem restore de uploads).

### D3 — Duas ações novas, e a assimetria é a decisão

- **`anexar_documento`**: `[ADMINISTRADOR, ALMOXARIFE, COMPRAS, PRODUCAO, ENGENHARIA, GESTOR, QUALIDADE]`
  — todos menos `CONSULTA`. Quem opera anexa o documento da própria operação: compras anexa a NF
  do recebimento, qualidade anexa o certificado e o relatório dimensional, produção anexa o
  desenho da requisição. `CONSULTA` fica de fora porque leitura pura é a definição do perfil.
- **`remover_anexo`**: `[ADMINISTRADOR, ALMOXARIFE]` — estreita de propósito. Tirar um certificado
  de vista é apagar evidência de qualidade; é risco de natureza diferente de anexar, e o critério
  "quando a operação muda a natureza do risco, ela ganha ação própria" já é o desta base
  (`permissions.js`, ações `ajustar_material_cliente`, `remessar_terceiro`, `conferir_separacao`).

As duas entram de graça em `GET /almoxarifado/minhas-permissoes` (a rota itera
`Object.keys(ACAO_PERFIS)`) e **precisam de rótulo em `client/src/utils/permissaoErro.js`** —
seria a **quinta** ocorrência do buraco corrigido na Etapa 30. A Etapa 30 trocou a régua daquele
teste por **presença no mapa `ACAO_PERFIS` importado do servidor**; então, se aquela correção
está viva, **o teste do client tem de falhar sozinho** ao ver as duas ações novas sem rótulo.
Isso não é só uma pendência a cumprir: é o **controle positivo grátis** de que a régua da 30
funciona, e a etapa vai medi-lo nessa ordem — rodar o teste do client **antes** de escrever o
rótulo, e registrar o vermelho.

### D4 — Régua de entidade fechada, com existência verificada

```js
const ENTIDADES_ANEXO = {
  material:         'materiais_almoxarifado',
  requisicao:       'requisicoes_almoxarifado',
  recebimento:      'recebimentos_material_almoxarifado',
  inspecao:         'inspecoes_recebimento_almoxarifado',
  devolucao:        'devolucoes_material_almoxarifado',
  lote:             'lotes_almoxarifado',
  remessa_terceiro: 'remessas_terceiro_almoxarifado',
  item_remessa:     'itens_remessa_terceiro_almoxarifado',
};
```

Oito entidades, uma por pendência medida na Fase 0 (a feature 14 pede o anexo no **item** da
remessa, não na remessa — `14-materiais-terceiros/README.md:114`, por isso as duas entram). Os
nomes das tabelas foram lidos do `CREATE TABLE` de `schema.js`, não imaginados: `recebimento` é
`recebimentos_material_almoxarifado` e `inspecao` é `inspecoes_recebimento_almoxarifado` — os dois
nomes que a intuição erraria.

**A régua tem duas metades, e a segunda é a que importa:**

1. `entidade` fora do mapa → **400 `"Entidade inválida para anexo"`**. Mapa fechado, e não string
   livre, porque `entidade` alimenta a listagem: string livre deixa o anexo pendurado num nome que
   nenhuma tela consulta — invisível, e ninguém descobre.
2. `entidade_id` que **não existe** na tabela correspondente → **404 `"Registro não encontrado
   para anexar"`**, com o upload limpo. Sem esta metade, a etapa entrega uma tabela cujas linhas
   apontam para o nada — o mesmo defeito que ela veio consertar, só que por linha em vez de por
   tabela.

### D5 — Remoção é soft delete, e o arquivo fica

`DELETE /anexos/:id` grava `ativo = 0`, `deleted_by`, `deleted_at`, audita, e **não apaga o
arquivo do disco**. Documento de qualidade some da tela, não do sistema: com o arquivo apagado, a
linha de auditoria vira promessa vazia — ela diz que existiu algo que ninguém pode mais ver.

**Alternativa descartada (letra B):** apagar o arquivo junto, o que economiza disco e é
irreversível. Fica registrada porque é a escolha oposta e defensável, e é do André arbitrar. A
retenção/expurgo de uploads continua **fora**, como corte já declarado pela feature 23
(`23-perfis-seguranca-auditoria/README.md:352`).

### D6 — Limite e tipos, iguais aos seis que já existem

10 MB e `application/pdf | image/(jpeg|jpg|png|webp)`, o mesmo par do `uploadCertificado` e do
`uploadCertificadoCalibracao`. Mensagem literal: **`"Anexo deve ser PDF ou imagem"`**. Planilha e
documento do Office ficam fora — YAGNI até haver pedido, e ampliar depois é uma linha na regex.

### D7 — Uma consumidora nesta etapa, e as outras declaradas

Componente `client/src/components/almoxarifado/AnexosDocumento.js`, genérico por props
(`entidade`, `entidadeId`, `titulo`, `somenteLeitura`), plugado **num lugar só**: o formulário de
decisão de inspeção (feature 09), que é o item nomeado por `09-inspecao-qualidade/README.md:161`.
As outras cinco telas (material, requisição, recebimento, devolução, item de remessa) ficam
**declaradas como próximas**, não entregues — cada uma é um plug de poucas linhas depois que o
componente existe, e prometer cinco telas nesta etapa é o jeito conhecido de entregar seis coisas
pela metade.

**A diferença real com o legado, e que precisa estar no guia:** como a rota é autenticada, o
download **não pode** ser `<img src>` nem `<a href>` direto. O componente faz `fetch` com o token,
recebe `blob`, cria `URL.createObjectURL` e dispara um `<a download>` que ele mesmo revoga. É mais
código que o legado — e é exatamente o preço de o arquivo não ser público.

## Contratos de API (congelados)

Todos sob `/api/almoxarifado`, portanto já com `authenticateToken` + `checkModulePermission`.

### `POST /anexos` — multipart

Ordem obrigatória: `auth` → `requirePermission('anexar_documento')` → `upload.single('arquivo')`
→ `safeParse` manual. Campos do body: `entidade`, `entidade_id`, `tipo`, `descricao` (opcional).

| Saída | Código | Corpo |
|---|---|---|
| sucesso | 201 | `{ id, entidade, entidade_id, tipo, descricao, nome_original, tamanho_bytes, mime_type, uploaded_by, uploaded_by_nome, created_at }` |
| sem perfil | 403 | `{ error: "Sem permissão para anexar documento", acao: "anexar_documento" }` — **antes** do multer, sem arquivo em disco |
| sem arquivo | 400 | `{ error: "Arquivo é obrigatório" }` |
| tipo recusado | 400 | `{ error: "Anexo deve ser PDF ou imagem" }` |
| acima de 10 MB | 400 | `{ error: "Arquivo excede o limite de 10 MB" }` |
| Zod | 400 | `{ error: "Dados inválidos — <campo>: <msg>" }` + `limparUploadOrfaoEm` |
| entidade fora do mapa | 400 | `{ error: "Entidade inválida para anexo" }` + `limparUploadOrfaoEm` |
| `entidade_id` inexistente | 404 | `{ error: "Registro não encontrado para anexar" }` + `limparUploadOrfaoEm` |

### `GET /anexos?entidade=&entidade_id=`

Gate `visualizar`. Só `ativo = 1`, `ORDER BY created_at DESC, id DESC`. `entidade` fora do mapa →
400 com a mesma literal. Devolve a lista de linhas **sem** `arquivo_path` — o nome no disco não
sai para o client, que só precisa do `id` para baixar.

### `GET /anexos/:id/arquivo`

Gate `visualizar`. `Content-Disposition: attachment; filename="<nome_original>"`, `Content-Type`
do `mime_type` gravado. 404 `"Anexo não encontrado"` (linha ausente ou `ativo = 0`); 404
`"Arquivo do anexo não encontrado"` (linha viva, arquivo fora do disco). `id` não numérico → 404,
não 500.

### `DELETE /anexos/:id`

Gate `remover_anexo`. 200 `{ ok: true }`. 404 `"Anexo não encontrado"` para id inexistente **e
para já removido** — remover duas vezes não é sucesso silencioso.

## Regras de negócio

| ID | Enunciado | Cenário que a prova |
|---|---|---|
| **RN-01** | Anexo só existe preso a um registro que existe | `entidade_id` de material apagado → 404, e a tabela não ganha linha |
| **RN-02** | Entidade vem de mapa fechado, nunca de string livre | `entidade: 'qualquer_coisa'` → 400, upload limpo do disco |
| **RN-03** | O arquivo do anexo **não** é servido estaticamente | `GET /api/uploads/almoxarifado/<nome do anexo>` → 404, com o mesmo arquivo baixando 200 pela rota autenticada |
| **RN-04** | Sem `anexar_documento`, o arquivo não chega ao disco | 403 com `fs.readdirSync(dir)` do tamanho de antes |
| **RN-05** | Remover é soft delete: some da lista, sobrevive na auditoria e no disco | `DELETE` → lista vazia, `SELECT` com `ativo=0` acha a linha, arquivo ainda existe |
| **RN-06** | Toda saída ≠ 201 do `POST` limpa o upload | os quatro caminhos (Zod, entidade, registro, erro) medidos por contagem de arquivos no diretório |
| **RN-07** | Ação nova sem rótulo em `permissaoErro.js` derruba o teste do client | as duas ações novas, medidas **antes** de escrever o rótulo |

## Testes

- `server/tests/api/anexoDocumento.api.test.js` — RN-01 a RN-06, pela rota, com `supertest`
  `.attach('arquivo', Buffer.from('%PDF-1.4'), 'cert.pdf')`, molde de
  `tests/api/toolCalibracao.api.test.js:84`.
- **Controle positivo obrigatório em RN-03**, que é a regra fácil de fingir: o teste tem de provar
  que a régua **sabe reprovar** — com o arquivo movido para `uploadsAlmoxDir`, o `GET` estático
  responde 200. Sem esse controle, "404 no estático" passa com o arquivo simplesmente não
  existindo em lugar nenhum, e a etapa inteira seria um teste vazio — o quinto desta base.
- Integração cruzando galhos: anexar → listar → baixar (conferindo o **conteúdo** do corpo, não só
  o 200) → remover → listar vazio.
- Client: `AnexosDocumento.test.js` (lista, upload, erro de tipo, download por blob, remoção com
  `somenteLeitura` escondendo o botão) e o plug em `InspecoesAlmoxarifado.test.js`.

## O que esta etapa NÃO cobre (declarado)

1. **O furo do estático legado continua aberto.** Foto de material, certificado de lote,
   comprovante de sucateamento, certificado de calibração, foto de ocorrência e assinatura de
   entrega seguem públicos por URL. Vira **furo na letra C** com o caminho nomeado: migrar as seis
   para download autenticado + trocar os `<img src>`/`<a href>` do client por blob, o que é etapa
   própria porque mexe em duas telas e nos testes que congelam as URLs.
2. **Cinco das seis telas consumidoras** (material, requisição, recebimento, devolução, item de
   remessa) — o componente existe e é genérico; o plug é a próxima etapa.
3. **Migração de dado:** as colunas legadas (`foto`, `certificado_path`, etc.) continuam onde
   estão. Nada é reescrito para a tabela de anexos.
4. **Expurgo/retenção de anexo** — corte já declarado pela feature 23.
