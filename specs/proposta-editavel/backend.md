# Proposta Editável — Backend

## Novas Tabelas

### `proposta_customizacoes`
Armazena overrides de campos por proposta. Não altera os dados originais do cliente.

```sql
CREATE TABLE proposta_customizacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposta_id INTEGER NOT NULL UNIQUE,
  -- Campos de contato editáveis
  cliente_nome TEXT,
  cliente_email TEXT,
  cliente_telefone TEXT,
  cliente_contato TEXT,
  -- Metadados
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  FOREIGN KEY (proposta_id) REFERENCES propostas(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES usuarios(id)
);
```

### `proposta_clausulas`
Cláusulas customizadas por proposta. Quando existir ao menos uma entrada para uma proposta, as cláusulas padrão (`condicoesNano4You.js`) são ignoradas.

```sql
CREATE TABLE proposta_clausulas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposta_id INTEGER NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proposta_id) REFERENCES propostas(id) ON DELETE CASCADE
);
```

### `proposta_edicoes_log`
Auditoria campo a campo de todas as alterações feitas no preview editável.

```sql
CREATE TABLE proposta_edicoes_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposta_id INTEGER NOT NULL,
  usuario_id INTEGER,
  usuario_nome TEXT,
  tipo TEXT NOT NULL, -- 'campo' | 'clausula_criada' | 'clausula_editada' | 'clausula_removida' | 'clausula_reordenada'
  campo TEXT,         -- ex: 'cliente_email', 'clausula_titulo', 'clausula_conteudo'
  clausula_id INTEGER,
  valor_anterior TEXT,
  valor_novo TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proposta_id) REFERENCES propostas(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
```

---

## Novas Rotas

### Customizações de campos

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/propostas/:id/customizacoes` | Busca customizações salvas da proposta |
| PUT | `/api/propostas/:id/customizacoes` | Salva/atualiza campos customizados |

**Body do PUT:**
```json
{
  "cliente_nome": "Empresa XYZ Ltda",
  "cliente_email": "contato@xyz.com",
  "cliente_telefone": "(11) 99999-9999",
  "cliente_contato": "João Silva"
}
```

### Cláusulas por proposta

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/propostas/:id/clausulas` | Lista cláusulas da proposta (customizadas ou padrão) |
| POST | `/api/propostas/:id/clausulas` | Cria nova cláusula |
| PUT | `/api/propostas/:id/clausulas/:clausulaId` | Edita cláusula existente |
| DELETE | `/api/propostas/:id/clausulas/:clausulaId` | Remove cláusula (soft delete: ativo=0) |
| PUT | `/api/propostas/:id/clausulas/reordenar` | Salva nova ordem das cláusulas |
| POST | `/api/propostas/:id/clausulas/resetar` | Volta para as cláusulas padrão (apaga customizadas) |

### Auditoria

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/propostas/:id/edicoes-log` | Lista histórico de edições da proposta |

---

## Salvar a proposta: `PUT /api/propostas/:id` (Etapa 138)

O corpo pode ser **parcial**. Regra por chave (`montarSetParcial`, `server/atualizacaoParcial.js`):

| Chave no corpo | Efeito |
|---|---|
| ausente | a coluna nem entra no `UPDATE` (fica como está) |
| presente, inclusive `null`/`''` | grava com a transformação de sempre (`|| ''` nos textos de condição/prazo/garantia/observações, `|| null` nos outros, `|| 0` em valor e margem) |
| `itens` ausente | os itens não são tocados (nem apagados, nem reinseridos, nem auditados) |
| `itens` presente | grava os itens **novos** (com `mesclarItensPreservandoCampos`) **antes** de tudo e só apaga os antigos depois do `UPDATE`, religa as variáveis manuais (`[]`/`null` apaga todos) — desde a Etapa 142 pelo **pareamento** abaixo. *(Esta linha dizia "apaga e reinsere" — **ficou velha na Etapa 146** (RN-146.02): a ordem passou a ser grava os novos → … → apaga os antigos, abaixo.)* |
| `itens` presente que não é lista nem `null` (objeto, texto, número) | **400** *"Itens inválidos: os itens da proposta devem ser enviados como uma lista."*, nada gravado (Etapa 143, B930 — antes apagava os itens com 200) |
| `itens` com elemento que não é objeto (`null`, número, texto, lista), ou com um campo (fora `acessorios`) objeto ou lista (Fase 5, B934) | **400** *"Item inválido: cada item da proposta deve ser um objeto."*, nada gravado (Etapa 143, C310 — antes `[null]` fazia o `PUT` nunca responder e, com o corpo de tamanho diferente do gravado, depois de apagar os itens e regravar a proposta). `{}` passa (item sem descrição, o de sempre). Mesma guarda (`validarItensDoCorpo`, `server/propostaItensDiff.js`) no `POST /api/propostas` e nos `produtos` do `POST /api/propostas/gerar-automatica` |

Exceções: `html_rendered` é sempre limpo (o retrato do PDF só é regravado com ele vazio); `probabilidade` nula/vazia mantém (`COALESCE`); `responsavel_id` vazio/ausente = o gravado, ou quem salva; `numero_proposta`, `revisao` e `responsavel_id` só entram quando mudam. A revisão sobe só se `itens` ou `valor_total` vieram e mudaram; o sufixo `REVnn` e o `proposta_revisoes` usam os valores efetivos (o do corpo, senão o gravado). Trocar `cliente_id` apaga `cliente_contato`/`cliente_telefone`/`cliente_email`/`projeto_id` que não vieram.

Recusas, nesta ordem: 404 *"Proposta não encontrada"* → 400 *"Título é obrigatório"* (título presente vazio ou só espaços) → 400 *"Margem de desconto inválida: informe um número de 0 a 100, com ponto como separador decimal."* (Etapa 139, só quando a margem veio) → 400 dos itens (Etapa 143, as duas mensagens da tabela acima) → 400 *"Motivo da não venda é obrigatório quando a proposta está perdida/rejeitada."* → 403 "desconto aprovado" só pela aprovação e 409 do responsável trocado com pedido pendente (Etapa 140 — *esta lista não os tinha; estava velha, corrigida na Etapa 143*) → 403 *"Não é possível alterar o status de uma proposta com desconto acima de 5% sem aprovação prévia. A proposta deve permanecer como rascunho até que a autorização seja aprovada."* → 400 *"Cliente não encontrado (id 99999). Atualize a lista de clientes e tente de novo."* (Etapa 146, só quando o `cliente_id` do corpo é um número diferente do gravado) → (na gravação) 400 dos dois testes de número duplicado → 409 `PROPOSTA_ALTERADA` *"A proposta foi alterada por outra gravação no mesmo instante. Recarregue a proposta e salve de novo."* quando o corpo traz status, margem, motivo ou data de fechamento e um desses que **não** veio mudou entre a leitura e a gravação. As regras do motivo, do desconto e da data de fechamento automática usam o valor efetivo e só rodam quando um dos campos delas veio.

### Itens iguais: o item reconhecido pelo `id` e as variáveis manuais (Etapa 142, C298/C308/C309)

O `PUT` regrava os itens (ids novos, AUTOINCREMENT — desde a Etapa 146 grava os novos antes e apaga os antigos depois). Quem diz qual item gravado é cada item do corpo é
`parearItens(atuais, corpo)` (`server/propostaItensDiff.js`), usado **pela mesclagem e pela religação**:

| Corpo | Pareamento |
|---|---|
| pelo menos um `itens[].id` que vale (inteiro — número ou texto de dígitos —, de um item atual ainda não usado, mesma identidade; ou os dois sem código) | **por id**: cada item com `id` que vale fica com o seu; os outros são novos; o atual que ninguém reclamou **saiu** |
| nenhum `id` que vale | **por posição**: o k-ésimo item de identidade P com o k-ésimo atual de identidade P; saem os que sobram |

Identidade = código do produto, senão descrição, senão nome — cada parte aparada, em caixa alta (`identidadeDe`). O formulário
(`proposta/PropostaForm.js` + `montarPayloadProposta`) manda o `id` do item gravado; o item incluído na tela vai sem.

- **Mesclagem** (`CAMPOS_PRESERVAR`): o pareado preserva do **seu** atual; o sem par, do último atual da mesma identidade (mesmo que tenha
  saído). *(Até a Etapa 142 um `Map` por `chaveDe` guardava só o último igual, e todo salvamento copiava os campos dele para os outros —
  **C308**.)*
- **Religação** (`variaveisManuaisItens.planoReligacao`): as variáveis do atual pareado vão para a linha nova do mesmo índice; as do
  atual que saiu são **aposentadas** (`proposta_variaveis_manuais.item_removido_em`, coluna da Etapa 142) — nunca apagadas. Contagem de
  linhas novas diferente do corpo: nada.
- **Antes de parear**, o `PUT` grava o reparo da leitura contra os atuais (`planoMaterializacao`): a órfã que o reparo põe num item passa a
  apontar para ele; a que não cabe é aposentada. O `PUT .../variaveis-manuais` faz o mesmo antes do upsert, e ignora `item_id` que não é
  inteiro ou não é item da proposta. *(Esta frase dizia "resposta `{ ok: true }` igual" — **ficou velha na Etapa 144**: a resposta passou
  a ser `{ ok: true, ignorados: N }`, N = as entradas com `item_id` e `chave` que não gravaram por o item não ser desta proposta — o
  preview numa aba velha, D (142), RN-144.04. O `PUT .../itens/descricoes` usa a mesma régua — `idInteiro` + os ids da proposta, B942 — e
  responde igual; seus `UPDATE` vão em sequência com o erro no callback — 500 que chega, Fase 5 r2.)*
- **Reparo da leitura** (`/premium` e `/pdf`, `repararVariaveisManuais`): a órfã viva com `item_chave` vai, agrupada pelo item velho
  (ordem numérica), para um item atual da mesma identidade **sem nenhuma variável viva**; a aposentada nunca. *(Até a Etapa 142 o reparo
  contava a posição por linha — dividia as variáveis de um item entre dois iguais, **C309** — e punha órfã em item que já tinha a mesma
  chave.)*
- A variável do item que saiu **não volta** quando o produto é incluído de novo (**B926**) — a correção de 30/07/2026 (`9aae799d`)
  prometia o contrário; a promessa foi revogada pela Etapa 142, de propósito.
- Sem `id` (integração antiga), a C298 continua: tirar o primeiro de dois iguais deixa no que ficou a variável do primeiro (D (142)).

Testes: `tests/propostaItensIguais.test.js` (revisão obrigatória), `tests/api/propostaItensIguais.api.test.js` (rota, `/premium`, `/pdf`,
banco antigo, falha injetada), `variaveisManuaisReligar`/`variaveisManuaisIdentidade` (com as funções reais desde a 142).

### O histórico de itens e o produto de cada item (Etapa 143, C311)

- **Histórico** (`diffItensParaLog`, `proposta_edicoes_log`): pelo **mesmo** `parearItens` da mesclagem e da religação. Item do corpo com par →
  "editado" se mudou algum de descrição (aparada, sem caixa), quantidade, unidade, valor unitário, total, família ou região; sem par →
  "adicionado"; atual que saiu → "removido". Tirar o primeiro de dois iguais (com o `id` do que ficou) registra só "removido". *(Até a
  Etapa 143 o histórico pareava por posição dentro do grupo de iguais e registrava "editado" no primeiro + "removido" no segundo; e não
  comparava a descrição.)*
- **O produto do item** (`JOIN_PRODUTO_DO_ITEM`, `server/totalDocumentoProposta.js`): o `/premium`, o `/pdf` e a conta do pedido de
  aprovação (`ITENS_SQL`) juntam a cada item **no máximo um** produto — o de código igual ao do item, senão o de código igual aparado de
  menor id (ativo ou não, como antes); item sem código ou só de espaços não junta nenhum. *(Até a Etapa 143 o `JOIN` comparava aparado contra
  um `UNIQUE` cru: `'PJ1'` e `'PJ1 '` duplicavam o item no documento e no total do pedido; um produto de código só de espaços juntava em
  todo item manual.)* O `GET /api/propostas/:id` junta por igualdade crua (um produto no máximo pelo `UNIQUE`).

### A geração automática — o produto de cada linha (Etapa 144, C313)

`POST /api/propostas/gerar-automatica` (sem tela desde `7a8c7242` — C316; só pela API). Cada `produtos[i].id` tem de ser inteiro positivo
seguro — número, ou texto só de dígitos (aparado; `"5"` vale como 5, B938) — senão **400** *"Produto inválido: cada produto da proposta
deve trazer o id de um produto cadastrado."*; e tem de existir no cadastro (inativo vale, B936), senão **400** *"Produto não encontrado (id
99999, 88888). Atualize a lista de produtos e tente de novo."* (os ids que faltam, sem repetir, na ordem; mais de 10 → os 10 primeiros e
*" e mais N"*). Nenhuma proposta nasce em nenhuma recusa (`idsDosProdutos`, `msgProdutoNaoEncontrado` em `server/propostaItensDiff.js`).
O mesmo id repetido = um item por ocorrência (B937). A busca é `IN (SELECT value FROM json_each(?))` (sem o limite de 32 766 variáveis).
Ordem das recusas: *"Cliente e produtos são obrigatórios"* → *"Item inválido…"* (143) → margem → 403 do desconto → **produto sem id** →
**produto não encontrado** → *"Cliente inválido"* → *"Responsável inválido"* → *"Usuário inválido"* → **cliente não encontrado** (Etapa 145)
→ 500 do número. Teste: `server/tests/api/propostaProdutoInexistente.api.test.js`. *(Esta frase terminava em "→ 500 do número" logo depois
de "Usuário inválido" — **ficou velha na Etapa 145**: o cliente que não existe passou a ser 400 antes do número, abaixo.)*

### O portão do Comercial nas rotas da proposta e da aprovação (Etapa 145, C317)

Plano: `docs/superpowers/plans/2026-10-18-almoxarifado-etapa145-o-modulo-nas-rotas-da-proposta.md`. As **49** rotas `/api/propostas*` e as
**5** `/api/aprovacoes*` do `index.js` têm, logo depois do `authenticateToken` (antes do `multer` nas três de upload), o portão
`exigirComercialNasPropostas` (`server/services/portaoDasPropostas.js`); o `GET /api/propostas/:id` usa `exigirComercialOuOperacionalNaProposta`
(a OS do Operacional busca nele os itens — B945). **A régua é a do portão de rota da tela** (`hasModuleAccess` do client), sobre as mesmas
linhas que o `GET /api/usuarios/:id/grupos` devolve (as dos grupos **ativos** + as diretas com `grupo_id IS NULL`): super ou `role` admin
passa sem ler; com alguma linha, passa só com `modulo = 'comercial'` (ou `'operacional'` no par) e `permissao === 1`; sem nenhuma linha,
passa em `MODULOS_LIBERADOS_SEM_LINHA_NA_TELA` (`['comercial', 'frota']`, B63 — ver B949). **Não** é o `checkModulePermission` (que
libera o Comercial a todo usuário sem grupo ativo — B944). Recusa **403** `{ error: 'Acesso negado ao módulo', modulo: 'comercial' }` (o par:
`modulo: ['comercial', 'operacional']`) e uma linha `acesso_negado` em `logs_auditoria`; `SQLITE_BUSY` → **503** pelo `respondDbError`
(`context: 'portao:propostas'`); outro erro → **500** *"Erro ao verificar permissões"*. `PROPOSTAS_PORTAO_DE_MODULO=desligado` (ambiente,
lido no boot) desliga (B946). A mesma tabela de casos (`server/tests/fixtures/portaoComoATela.casos.json`) roda contra o servidor e contra o
`hasModuleAccess`. Testes: `tests/api/propostaPortaoModulo.api.test.js` (cada rota pela rota, 17 perfis), o cruzado
`modulosClienteServidor.api.test.js` e `client/src/services/permissionsCache.portaoComoATela.test.js`. Fora do portão (declarado):
`/api/proposta-template*`, `/api/proposta-blocos*`, `/api/proposta-texto-biblioteca*` (C319) e as rotas de outros prefixos que leem
proposta (C320). *(Desde a Etapa 147 as do modelo e as das listas de preço passam por um portão — ver a seção da 147 abaixo; a C320 continua.)*

### A geração automática grava antes de responder; o cliente que não existe (Etapa 145, C318, C315)

`POST /api/propostas/gerar-automatica` grava os itens **um por um** (`gravarItensDaGeracaoAutomatica`, `db.run` em sequência) e só responde
depois do último (a resposta continua `{ id, numero_proposta, valor_total, itens }`). No primeiro erro: apaga os itens, depois a proposta, e
**500** *"Erro ao gravar os itens da proposta (<erro do item>). Nenhuma proposta foi criada — tente de novo."*; se uma das duas exclusões
falhar (a proposta só é apagada com os itens fora), **500** *"… A proposta <número> ficou incompleta — exclua-a e gere de novo."*. Sem
transação (B948). **Cliente:** na geração automática (depois de *"Usuário inválido"*) e no `POST /api/propostas` (depois do 403 dos 5 %, com
ou sem `numero_proposta`), `SELECT id FROM clientes WHERE id = ?` pelo número lido (`parseInt`) → **400** *"Cliente não encontrado (id
99999). Atualize a lista de clientes e tente de novo."* (`msgClienteNaoEncontrado`); erro de leitura → **500** *"Erro ao verificar o
cliente: <msg>"*; inativo vale (B947). Teste: `tests/api/propostaGeracaoGrava.api.test.js` (com `FALHA_SQL_PULAR` e `FALHA_SQL_MSGS` do
`tests/helpers/falhaSqlInjetada.js`). O `PUT /api/propostas/:id` não confere o cliente (C322) e o `POST /api/propostas` grava os itens sem
conferir o erro de cada um (C323). *(Esta frase **ficou velha na Etapa 146**: as duas foram fechadas — seção abaixo. E a C322 estava
errada como foi escrita: o `PUT` com cliente que não existe não gravava — dava 500 com a mensagem da chave estrangeira.)*

### Os itens gravados antes de responder — criação, salvamento e cópia; o cliente do salvamento (Etapa 146, C323, C322, C321)

Plano: `docs/superpowers/plans/2026-10-18-almoxarifado-etapa146-os-itens-gravados-antes-de-responder.md`. As quatro portas que gravam
`proposta_itens` (a geração automática, o `POST /api/propostas`, o `PUT /api/propostas/:id` e o `POST /api/propostas/:id/clone`) gravam
por `gravarItensEmSequencia` (`db.run` um a um; devolve o erro **e** os ids já gravados). *(Até a Etapa 146 as três últimas usavam
`db.prepare` + `stmt.run` sem callback: o erro virava evento `error` do statement, sem ouvinte, e caía na guarda do processo
(`uncaughtException`) — a rota respondia sucesso sem o item; o `PUT` às vezes nem respondia; a cópia respondia 201 antes de gravar.)*

- **Criação e cópia** (`gravarItensDaPropostaNova` + `desfazerPropostaCriada`, as mesmas da geração automática): resposta só depois do
  último item (corpo de sempre: `{ id, numero_proposta, ...corpo }` e `201 { message: 'Proposta clonada', id, numero_proposta }`). Falha →
  apaga os itens, depois a proposta → **500** *"Erro ao gravar os itens da proposta (<msg>). Nenhuma proposta foi criada — tente de novo."*;
  uma exclusão que falha → *"… A proposta <número> ficou incompleta — exclua-a e gere de novo."* (B953). A cópia lê os itens da origem com
  `ORDER BY id`; a leitura que falha desfaz a cópia com a mesma frase.
- **Salvamento** (`PUT`, RN-146.02): logo depois da leitura dos itens atuais, **antes** do ramo do número, os itens novos (mesclados) são
  gravados. Falha → os novos já gravados saem (`apagarItensNovos`, `id IN (SELECT value FROM json_each(?))`) → **500** *"Erro ao gravar os
  itens da proposta (<msg>). Nada foi alterado — tente salvar de novo."* (`msgItensNaoSalvos`, `server/propostaItensDiff.js`). Depois: os
  dois testes de número → `UPDATE` (guarda 409) → **`proposta_revisoes`** (passou para depois do `UPDATE` valer — antes era gravado antes
  do número e ficava em toda recusa posterior) → reparo das variáveis → apaga os antigos (**os ids lidos** no começo, `id IN (SELECT value FROM json_each(?))` — *a primeira versão era
  `NOT IN` os novos e, com dois `PUT` ao mesmo tempo, cada um apagava os novos do outro: 0 itens, os dois 200 — Fase 5 r1/r2*) →
  histórico de edições dos itens (antes era disparado antes de os `INSERT` terminarem) → religação pelos **ids devolvidos** (antes um
  `SELECT` depois do `DELETE`) → 200. Toda recusa entre os novos gravados e o `UPDATE` valer (os dois 400 e os dois 500 do número, o 400 do
  `UNIQUE`, o 500 do `UPDATE`, o 409) passa por `responderDesfazendo`: os novos saem e a resposta é a de antes. Os antigos que não saem →
  os novos saem → **500** *"… Os outros dados da proposta foram salvos, mas os itens continuam os de antes — confira e salve de novo."*;
  a limpeza dos novos que falha → **500** *"… A proposta <número> ficou com itens repetidos — recarregue, confira os itens e salve de
  novo."* (com o erro da recusa nos parênteses). Sem transação (B948/B952); entre os novos e a saída dos antigos a proposta mostra os
  itens duas vezes, e dois `PUT` simultâneos podem deixar os itens dos dois (C331).
- **O cliente do salvamento** (RN-146.04, C322): `cliente_id` do corpo que o `parseInt` lê como inteiro positivo **diferente do gravado**
  → `conferirClienteDaProposta` (400 *"Cliente não encontrado (id 99999). …"* / 500 *"Erro ao verificar o cliente: <msg>"*), depois de
  todas as recusas e antes de qualquer gravação. Ausente, igual, vazio/texto/zero/negativo/nulo (grava sem cliente — X09b da 138) não lê
  (B954, C330).
- **A lista de OS do Comercial** (`GET /api/comercial/ordens-servico`, RN-146.06, C321): `exigirComercialNasPropostas` no lugar do
  `checkModulePermission('comercial')` (B956).

Testes: `tests/api/propostaSalvarGrava.api.test.js` (a falha real por um **gatilho do SQLite** gravado por fora — passa por qualquer
caminho de gravação — e as limpezas pelo `FALHA_SQL_INJETADA`), `tests/api/propostaPortaoModulo.api.test.js` (o cenário da RN-146.06).

### O portão no modelo da proposta e nas listas de preço; as cláusulas gravadas antes de responder (Etapa 147, C319, C329, C327)

Plano: `docs/superpowers/plans/2026-10-18-almoxarifado-etapa147-o-modulo-no-modelo-e-nas-listas.md`. Commits `2f558a3e` (o portão, as cláusulas) e `e8a76073` (Fase 5).

- **O modelo da proposta** (as **20** rotas `/api/proposta-template*`, `/api/proposta-blocos*`, `/api/proposta-texto-biblioteca*`, inclusive o
  download `GET /api/proposta-template/contrato-anexo/:arquivo`): `exigirComercialNoModeloDaProposta` logo depois do `authenticateToken` (antes
  do `multer` nos 5 uploads) = `portaoDasPropostas.exigir('comercial', { tambemAdminDoModuloCom: { admin: 'comercial', tela: 'administrativo' } })`
  — a régua da tela da 145 **ou** o segundo caminho por onde a tela abre o modelo (`ConfigTemplateProposta` embutido em `/configuracoes`, aba
  Comercial → Template de proposta: o Administrativo pela régua da tela **e** `admin_modulos` com `comercial` — `passaPeloCaminhoDeConfiguracoes`,
  RN-147.01, B958). O caminho de Configurações abre também `/list`, `/:id`, `save-as`, `restore-default`, os blocos e a biblioteca, que a
  tela embutida não chama (B958, o mesmo dado); ninguém no client chama os blocos nem a biblioteca (B959).
- **As listas de preço** (as **5** `/api/comercial/listas-precos*`): `exigirComercialNasPropostas` (RN-147.02; a tela só existe no Comercial).
- O mesmo corpo de recusa, o log `acesso_negado`, o 503 do BUSY e o interruptor `PROPOSTAS_PORTAO_DE_MODULO=desligado` da 145 (B960).
- **O documento não chama o modelo por HTTP** (RN-147.04): o `/premium` e o `/pdf` leem `proposta_template_config` direto do banco (só as
  margens e o mapa de variáveis por família entram no `gerarHTMLPropostaPremiumV2`); as imagens saem por `/api/uploads` e `/api/assets`
  (`express.static`, fora do portão). **O template não usa** `logo_url`/`header_image_url`/`footer_image_url`/`cover_image_url` — só as funções
  mortas `gerarHTMLPropostaFromComponentes`/`gerarHTMLPropostaPremium` usavam (C339).
- **As cláusulas da proposta** (C327): o `POST /api/propostas/:id/clausulas/inicializar` grava as do modelo por `gravarItensEmSequencia`
  (`SQL_CLAUSULA_DA_PROPOSTA`) — falha numa → apaga as gravadas pelos ids → 500 *"Erro ao copiar as cláusulas da proposta (<msg>). Nenhuma
  cláusula foi gravada — salve de novo."* (limpeza que falha: *"… A proposta ficou com parte das cláusulas — use Resetar cláusulas e salve de
  novo."*); o erro de banco em `resolverModeloClausulas`/`carregarClausulasDoModelo` (que agora devolvem o erro no 1º argumento — os outros
  chamadores o ignoram, como antes) recusa com a frase "Nenhuma"; o `PUT .../clausulas/reordenar` lê a ordem atual, grava em sequência e, na
  falha, devolve a ordem lida às que já mudaram (*"Erro ao gravar a nova ordem das cláusulas (<msg>). A ordem anterior foi mantida — salve de
  novo."* / *"… A ordem ficou misturada — confira as cláusulas antes de enviar a proposta e salve de novo."* / leitura: *"… A ordem não foi
  alterada — salve de novo."*). `SQLITE_BUSY` com o desfazer feito → 503 `context: 'propostas:clausulas'` (o `api.js` do client repete).
  Frases em `msgClausulasNaoCopiadas`/`msgOrdemNaoGravada` (`index.js`).
- **O preview mostra a frase do servidor** quando o `salvar()` falha (`mensagemDaFalhaDoSalvar`, `client/src/components/proposta/avisoValoresIgnorados.js`,
  RN-147.07, B962).
- **O preview não relaciona pela posição as cláusulas que o servidor já tinha** (RN-147.08, B963, Fase 5 r1 I-1): com `jaInicializado` no
  `salvarClausulas`, as cláusulas não são gravadas, o `salvar()` grava o resto, mostra `AVISO_CLAUSULAS_JA_GRAVADAS`, recarrega e devolve `false`.

Testes: `tests/api/propostaModeloPortao.api.test.js` (as 25 rotas pelo fonte e uma a uma, 17 perfis, o PDF pela rota, o desligado, o BUSY),
`tests/api/propostaClausulasGrava.api.test.js` (o gatilho do SQLite como falha real; o modelo e o BUSY pelo `FALHA_SQL_INJETADA`),
`tests/api/uploadsProtegidos.api.test.js` (o registro do download do contrato), `client/src/components/proposta/avisoValoresIgnorados.test.js`.

### A OS pelo número e o modelo de contrato por família no portão; a proposta que não existe nas cláusulas (Etapa 148, C335, C341, C342)

Plano: `docs/superpowers/plans/2026-10-18-almoxarifado-etapa148-o-modulo-na-os-e-no-modelo-de-contrato.md`. Commits `d69a5cf6` (o portão), `9149c024` (a proposta que não existe) e `9dccf0dd` (Fase 5).

- **A OS pelo número** (as **5** `GET /api/operacional/ordens-servico/:id`, `/:id/itens`, `/:id/pdf`, `POST /:id/gerar-pdf`,
  `GET /api/operacional/os-itens/:os_id`): `exigirComercialOuOperacionalNaOS = portaoDasPropostas.exigir(['comercial', 'operacional'])` logo
  depois do `authenticateToken` (RN-148.02, B965) — a régua da tela das duas telas que montam o `OSFormPage`/`OSDetalhesForm`
  (`/comercial/ordens-servico/editar/:id` e `/fabrica/ordens-servico/editar/:id`). Recusa: 403 `{ error: 'Acesso negado ao módulo', modulo:
  ['comercial', 'operacional'] }`, log `modulo = 'comercial|operacional'`. O `gerar-pdf` só busca por HTTP interno `/api/uploads/produtos/` e o
  logo de reserva (estáticos, fora do portão — RN-148.04). As vizinhas (lista, `proximo-numero`, `POST`/`PUT`/`DELETE` da OS e dos itens)
  ficam com a régua antiga (B969, C277, C332, C345).
- **O modelo de contrato por família** (as **3** `GET /api/clausulas-modelos`, `GET /api/clausulas-modelos/:id/clausulas`,
  `PUT /api/familias/:id/clausulas-modelo`): `exigirComercialNasPropostas` (RN-148.01, B966 — o `ModalFamiliaForm` só é montado em
  `/comercial/produtos/grupo/:grupoId`). O `resolverModeloClausulas` acha o modelo pelo **nome** da família dos itens; renomear a família
  (`PUT /api/familias/:id`, só login) muda o modelo efetivo (C343).
- O mesmo 503 do BUSY, o 500 *"Erro ao verificar permissões"* e o interruptor `PROPOSTAS_PORTAO_DE_MODULO=desligado` (B967); o aviso do boot
  cita as 8.
- **A proposta que não existe nas cláusulas** (C342, RN-148.05, B968): o middleware `propostaDasClausulasExiste(responderErro, soSe)` no
  `inicializar` e no `reordenar` (depois do portão; no `reordenar`, só com `ordem` lista — o 400 do corpo continua antes):
  `SELECT id AS proposta_das_clausulas FROM propostas WHERE id = ?` sem linha → 404 `{ error: 'Proposta não encontrada' }`; erro → a frase
  "Nenhuma cláusula foi gravada" (`inicializar`) / "A ordem não foi alterada" (`reordenar`), 503 no BUSY. A inativa (`ativo = 0`) existe.

Testes: `tests/api/osModeloContratoPortao.api.test.js` (as 8 pelo fonte e uma a uma, 15 perfis contra a decisão da tela, o PDF da OS pela
rota para o Comercial e para o Operacional, o desligado, o BUSY), `tests/api/propostaClausulasGrava.api.test.js` (os cenários RN-148.05),
`tests/api/uploadsProtegidos.api.test.js` (o registro do PDF da OS) e 3 casos novos em `tests/fixtures/portaoComoATela.casos.json`.

### O cadastro de família de produto e a lista de OS do Operacional no portão; a lista de preço em blocos (Etapa 149, C343, C345, C341)

Plano: `docs/superpowers/plans/2026-10-18-almoxarifado-etapa149-o-cadastro-de-familia-e-a-lista-de-os-pelo-modulo.md`. Commits `9f49aa02` (o portão), `c98a45be` (a lista de preço) e `e387a330` (Fase 5: os blocos, a coluna ilegível, as asserções do r3).

- **O cadastro de família** (as **21**: 20 `/api/familias*` + os apelidos `GET`/`POST /familias`; o `POST /:id/clonar` fica de fora, `isAdminUser`
  — B973): **13** com `exigirComercialNasPropostas` (as que só as telas do `/comercial` chamam — RN-149.01) e **8** com
  `exigirComercialNaFamiliaPorConfiguracoes = portaoDasPropostas.exigir('comercial', { tambemAdminDoModuloCom: { admin: 'comercial', tela:
  'administrativo' } })` — `GET /todas`, `GET /:id`, `GET /:familiaId/variaveis`, `GET /:familiaId/opcoes-variaveis` e o CRUD
  `/:familiaId/variaveis/:variavelChave/opcoes[/:id]`, as que o `ConfigTemplateProposta` embutido e o `OpcoesPorFamilia` de Configurações
  chamam (RN-149.02, B971). O portão vem antes do multer (foto e esquemático). Recusa: 403 `{ error: 'Acesso negado ao módulo', modulo:
  'comercial' }`, log `modulo = 'comercial'`. Renomear (`PUT /:id`) passa a exigir o Comercial — o atalho da C343 para mudar o modelo de
  contrato efetivo fecha; o efeito do nome continua.
- **A lista de OS do Operacional** (`GET /api/operacional/ordens-servico`): `exigirOperacionalNaListaDeOS = PORTAO_DAS_PROPOSTAS_DESLIGADO ?
  checkModulePermission('operacional') : portaoDasPropostas.exigir('operacional')` (RN-149.04/05, B974) — a régua da tela da Fábrica; desligado,
  a régua antiga (não o só login). Recusa: o mesmo 403 de antes (`modulo: 'operacional'`); BUSY → 503 `portao:propostas`.
- O aviso do boot (desligado) cita o cadastro de família e diz que a lista de OS volta à régua antiga.
- **A lista de preço** (`POST /api/comercial/listas-precos`, RN-149.06, B975): as colunas e as linhas são lidas **antes** de gravar a lista
  (400 *"A coluna|linha N da planilha não pôde ser lida (…). A lista não foi criada."*); as linhas vão por `gravarLinhasDaListaEmBlocos` (blocos
  de `LINHAS_POR_BLOCO_DA_LISTA` = 100, um `INSERT` multi-linha por bloco, em sequência); o bloco que falha → `desfazerListaDePrecosCriada`
  (as linhas, depois a lista) → 500 *"Erro ao gravar as linhas da lista de preços (<msg>). A lista não foi criada — importe a planilha de
  novo."*, 503 `listas-precos` no BUSY; o desfazer que falha → *"… A lista "<nome aparado>" ficou incompleta — exclua-a e importe a planilha de
  novo."* (sem 503). O BUSY ao gravar a lista → 503. Medido pela rota: 100 000 linhas em 0,9 s (antes 7,3 s; uma por uma, 16,5 s).

Testes: `tests/api/familiasListaOsPortao.api.test.js` (as 21 + a lista pelo fonte e uma a uma, 17 perfis contra a decisão da tela, o cadastro
pelo Comercial, as opções pelo caminho de Configurações, a lista pelo Operacional, o clonar, o desligado, o BUSY) e
`tests/api/listaPrecosGrava.api.test.js` (o gatilho do SQLite como falha real, em bloco; o BUSY pelo `FALHA_SQL_INJETADA`).

### Grupos de produto, produtos e variáveis técnicas no portão (Etapa 150, C346, C347)

Plano: `docs/superpowers/plans/2026-10-18-almoxarifado-etapa150-grupos-produtos-e-variaveis-pelo-modulo.md`. Commits `d74ad876` (o portão e o teste) e `481ee23a` (Fase 5: as asserções do r3).

- **Grupos de produto** (as **8**: 7 `/api/grupos*` + o apelido `GET /grupos`) e **9** das 11 de **produtos** (`verificar-existente`, `GET`,
  `proximo-codigo`, `GET /:id`, `POST`, `PUT /:id`, `DELETE /:id`, `zerar-modelo-antigo`, `POST /:id/imagem`) com `exigirComercialNasPropostas`
  (RN-150.01, B977) — só as telas do `/comercial` as chamam; o portão antes do multer nas duas multipart (`uploadGrupo`, `uploadProduto`).
- **`GET /api/produtos/codigo/:codigo`** com `exigirComercialOuOperacionalNaOS` (RN-150.02, B978): o `OSDetalhesForm` (montado em
  `/comercial/ordens-servico/editar/:id` e `/fabrica/ordens-servico/editar/:id`) busca nele cada item. Recusa: 403 `{ error: 'Acesso negado ao
  módulo', modulo: ['comercial', 'operacional'] }`, log `comercial|operacional`.
- **`POST /api/produtos/:id/clonar`** sem portão (`isAdminUser`, *"Apenas administradores podem clonar produtos"* — RN-150.03, B980).
- **Variáveis técnicas** (as **7** `/api/variaveis-tecnicas*`) com `exigirComercialNasVariaveisTecnicas = portaoDasPropostas.exigir('comercial',
  { tambemAdminDoModuloCom: { admin: 'comercial', tela: 'administrativo' } })` (RN-150.04, B979): o Comercial (ProdutoForm, ModalFamiliaForm,
  SelecaoProdutosPremium) ou o caminho de Configurações (VariaveisTecnicas, ConfigTemplateProposta embutido), leitura e escrita.
- O aviso do boot (desligado) só acrescenta a frase dos grupos, produtos, variáveis e do produto pelo código.
- **A busca global** (`GET /api/busca-global`) lê a tabela `produtos` direto e **não** passa por estas rotas — o plano da 149 a listava como
  leitora de `/api/produtos`; **estava errado** (só monta o link `/comercial/produtos/editar/:id`). Continua só com o login (**C352**).

Testes: `tests/api/produtosGruposVariaveisPortao.api.test.js` (as 25 + o clonar pelo fonte — todos os registros no texto inteiro, nenhum
caminho montado — e uma a uma, 17 perfis contra a decisão da tela, o catálogo e as variáveis pelo Comercial, as variáveis pelo caminho de
Configurações, a OS da Fábrica lendo o produto pelo código, o clonar, o desligado com as exclusões, o BUSY).

### As listas de clientes e de projetos pelos três módulos que as leem, e as notificações filtradas por tipo (Etapa 154, C353, C363)

Plano: `docs/superpowers/plans/2026-10-19-almoxarifado-etapa154-listas-de-clientes-e-projetos-e-notificacoes-pelo-modulo.md`. Commits `fa41db01`,
`a5b9365e` e `073b330c`.

- **`GET /api/clientes` e `GET /api/projetos`** com `exigirLeitorDasListasDeClientesEProjetos` (`portaoDasPropostas.exigir(['comercial',
  'almoxarifado', 'operacional'])`) como 2º middleware (RN-154.01, B995). Recusa 403 `{ error: 'Acesso negado ao módulo', modulo:
  ['comercial', 'almoxarifado', 'operacional'] }`, log `comercial|almoxarifado|operacional` / *Comercial ou Almoxarifado ou Operacional*; BUSY
  → 503 `portao:propostas`. Telas medidas (`client/src`, literal do caminho): Comercial — `Clientes`, `Atividades`, `CustosViagens`,
  `ProjetoForm`, `proposta/PropostaForm`, `Projetos`, `OSComercialForm` (e `OportunidadeForm`, `GerarPropostaModal`, o `PropostaForm` antigo,
  não montados); Almoxarifado — `MaterialAlmoxarifadoForm`, `ReservasAlmoxarifado`, `MovimentacoesAlmoxarifado`, `SobrasAlmoxarifado`;
  Operacional — `operacional/OSForm` (pelo `OrdensServico`). **A RN-151.03 (*"as duas listas continuam só com o login"*) deixou de valer** — era
  decisão (B983), não erro; a seção da 151 abaixo foi marcada.
- **`GET /api/notificacoes`** com `filtrarNotificacoesPorModulo` (`filtrarPorModulo(TIPOS_DAS_NOTIFICACOES, { contexto:
  'portao:notificacoes' })`, `TIPOS_DAS_NOTIFICACOES = { lembrete_proposta: ['comercial'] }`) como 2º middleware (RN-154.02, B996): sem tipo
  permitido (ou sem o filtro na rota) → `[]` sem consultar e sem log; o array devolvido passa por `podeVer(n.tipo)` objeto a objeto. O sino
  (`Notificacoes`) é desenhado **só** pelo `Dashboard` (índice de `/comercial`) — o `Layout` o importa e não o desenha (**a C363 dizia "na
  moldura de todos os módulos": estava errado**).
- **O clique** (`Notificacoes.js`, `Atividades.js` — RN-154.03): `/comercial/propostas/editar/:id` (era `/propostas/editar/:id`, rota
  inexistente).
- **Desligado** (`PROPOSTAS_PORTAO_DE_MODULO=desligado`, B997): as listas voltam ao só login e o sino a todos os tipos; o aviso do boot
  acrescenta *"…, e as listas de clientes e de projetos NAO exigem o Comercial, o Almoxarifado ou o Operacional (só o login), e as
  notificações do sino mostram os lembretes das propostas a qualquer logado, …"* logo depois do trecho dos custos de viagem.

Testes: `tests/api/listasNotificacoesPortao.api.test.js` (9: o fonte — o portão com os três módulos, o mapa igual aos tipos das consultas, o
array filtrado —, o inventário de quem cita `/clientes`, `/projetos` e `/notificacoes` no client (com o módulo da moldura; só o `Dashboard`
desenha o sino), as camadas do prefixo `/api/notificacoes`, o barrado (Engenharia / Projetos, Compras, Financeiro) com um lembrete dele, o
recorte por responsável **ou** criador, o Almoxarifado gravando o material com o cliente da lista, a Fábrica salvando a OS com o cliente e o
projeto das listas, o vendedor seguindo o clique até as leituras da proposta, 19 perfis, o desligado, o BUSY/500); `clientesProjetosPortao`
(o dono dos prefixos `/api/clientes` e `/api/projetos`: as listas com a cadeia nova nas camadas); `client/src/components/Notificacoes.test.js`
(o clique e a rota `propostas/editar/:id` → `PropostaForm` no bloco `/comercial` do `App.js`).

### Os filtros e as buscas da Fábrica, os cadastros que respondem o gravado e o segmento do cliente (Etapa 160, C388–C392, C394)

Plano: `docs/superpowers/plans/2026-10-19-almoxarifado-etapa160-filtros-da-fabrica-e-do-almoxarifado.md`. Commits `eaf682e9`, `59e3972c`,
`a0268282`, `d5cd52ea`, `93c1dace` e `ff3e7d78` (a correção da revisão). Status: entregue; nenhuma rota nova, nenhuma coluna nova; a resposta
dos `POST` de projetos, oportunidades, atividades e propostas passa a ser o registro gravado. (As listas do Almoxarifado da mesma etapa estão
nas features `01`, `04`, `06`, `08`, `15`, `16`, `21` e `23` do mapa do almoxarifado.)

- [x] **RN-160.01 (C390, B1018)** — `GET /api/operacional/ordens-servico?prioridade=` e `GET /api/comercial/ordens-servico?prioridade=`:
  `UPPER(TRIM(os.prioridade))` contra o valor aparado e em maiúsculas (`prioridadeDoFiltro`); não texto/vazio = sem filtro — `eaf682e9`
  (o gravado com espaço, Fase 5 `ff3e7d78`). A lista das OS da Fábrica descarta a resposta de um pedido que não é o último e o selo usa a
  classe em minúsculas; o formulário de edição da lista escolhe a opção do tipo e da prioridade gravados (`opcaoQueCasa`); a ficha da OS
  (`OSDetalhesForm`, a tela que a rota de edição monta) e a prévia da OS do Comercial com o selo em minúsculas — `a0268282`, `ff3e7d78`.
- [x] **RN-160.02 (C391, B1018)** — o kanban (`GET /api/operacional/producao/kanban`) deixa de fora o status (sem caixa, aparado, o nulo
  como vazio) `concluida`, `cancelada`, `encerrada`, `concluido`, `cancelado`; a ordem por `UPPER(TRIM(prioridade))` — `eaf682e9`.
- [x] **RN-160.03 (C392, B1019)** — as buscas de `GET /api/operacional/ordens-servico`, `/colaboradores`, `/equipamentos` e o
  `buildSearchWhere` da produção (OPs, máquinas, roteiros) pela `condicaoDeBusca` (as colunas de antes) — `eaf682e9`.
- [x] **RN-160.05 (C394, B1021)** — o painel da produção com `refresh=1` no Atualizar e depois de cada invalidação (só a resposta da última
  busca grava o cache); as paradas em andamento do pedido `em_andamento=1`; a busca das Atividades dos colaboradores e das Horas extras no
  navegador — `a0268282`, `ff3e7d78`.
- [x] **RN-160.07 (C388, B1022)** — `POST /api/projetos`, `/oportunidades`, `/atividades`, `/propostas` respondem a linha relida
  (`responderGravado`; a proposta sem itens e com o número **gravado** — antes o corpo sobrescrevia o número gerado); a releitura que falha
  → `200 { id }` (`{ id, numero_proposta }`) e o log `Erro ao reler <o projeto|a oportunidade|a atividade|a proposta> cadastrad<o|a> <id>:
  <mensagem>` — `59e3972c`. O ramo da releitura que não acha a linha é inalcançável pela suíte (a mesma conexão acabou de gravá-la — Fase 5
  r3 S44): fica, declarado.
- [x] **RN-160.08 (C389, B1023)** — o *Segmento* do formulário do cliente pela `opcaoQueCasa`; o desconhecido como opção a mais; o vazio
  em *"Selecione..."* — `93c1dace`.
- [ ] **Fora (de antes, registrados):** as outras listas sem descarte da resposta velha (C396), as datas em UTC (C397), os seletores
  incompletos (C399), as sobras menores (C400) — candidatos da Etapa 161; ignorar o acento (B1013) — do P.O.

### Os filtros e as buscas do Comercial, a busca com letra acentuada e o cadastro que responde o gravado (Etapa 159, C381, C382, C384–C387)

Plano: `docs/superpowers/plans/2026-10-19-almoxarifado-etapa159-filtros-do-comercial-que-o-servidor-ignorava.md`. Commits `531f3576`, `68869661`, `303841a2`, `6bc42a36`, `650b8395` e `49909fa2` (a correção da revisão).
Status: entregue; nenhuma rota nova; um parâmetro novo (`busca` em `GET /api/custos-viagens`); a resposta do `POST /api/clientes` passa a ser
o cliente gravado.

- [x] **RN-159.01 (C384, B1012)** — `GET /api/clientes?segmento=` filtra (no JavaScript, depois da consulta: o segmento aparado em
  maiúsculas pelo `toUpperCase`; não texto = sem filtro) — `531f3576`; a tela descarta a resposta velha — `6bc42a36`.
- [x] **RN-159.02 (C385, B1013)** — `server/services/buscaSemCaixa.js` (`formasDoTermo`, `condicaoDeBusca`: o termo aparado como veio, em
  maiúsculas e em minúsculas, `COALESCE(col, '') LIKE ?` por forma e coluna) em `GET /api/clientes`, `/api/propostas`,
  `/api/comercial/ordens-servico`, `/api/produtos` e `/api/busca-global` — `531f3576`; as telas das OS e das sugestões dos custos aparam —
  `6bc42a36`, `68869661`.
- [x] **RN-159.03 (C386, B1014)** — `GET /api/custos-viagens?busca=` (o código, o cliente principal e os adicionais, o destino e a cidade);
  a tela com a pausa de 300 ms, o contador da lista e os filtros de distância/valor — `68869661`.
- [x] **RN-159.04 (C387)** — `paramsDoFiltro` nos cinco recarregamentos das Atividades — `650b8395`.
- [x] **RN-159.05 (C381, B1015)** — `POST /api/clientes` responde o cliente relido (sem `geo_*`); a releitura que falha → `{ id }` com o
  log — `303841a2`.
- [x] **RN-159.06 (C382 em parte, B1016)** — `tipoDaViagemGravado`: o tipo aparado, o ausente/vazio → `IDA_E_VOLTA` — `303841a2`.
- [ ] **O resto da C382** (a origem padrão e o tipo legado no histórico) — **fora**: são gravações de verdade; escondê-las é regra (B1016).
- [ ] **O eco dos outros `POST`** (projetos, propostas, oportunidades, atividades) — **fora** (C388, de antes).
- [ ] **O seletor Segmento do formulário** (C389, de antes) — **fora**: é da tela do formulário, não um filtro.

*A Fase 0 do plano dizia que o `Produtos.js` não era montado por rota nenhuma — **estava errado** (Fase 2 I1): `/comercial/produtos/familia/:id`
monta `ProdutosPorFamilia`, que desenha o `Produtos.js`; a busca dele entrou na RN-159.02.*

Testes: `server/tests/api/filtrosDoComercial.api.test.js` (novo, 10: a função, as cinco buscas, o segmento, a busca dos custos, a resposta do
cadastro, o tipo, o fluxo de tela e a releitura que falha num segundo boot); `client/src/components/Clientes.filtroSegmento.test.js` (3),
`CustosViagensBusca.test.js` (4), `Atividades.filtroTodos.test.js` (2), `OrdensServicoComercial.busca.test.js` (1) — o `api.js` real com o
adaptador falso (as OS com o `api` simulado, como o teste das abas).

### A coordenada do endereço guardada no cadastro, o resumo, o filtro e o histórico dos custos de viagem (Etapa 158, C377, C378, C379, C380)

Plano: `docs/superpowers/plans/2026-10-19-almoxarifado-etapa158-coordenada-guardada-resumo-e-historico-dos-custos.md`. Commits `f677e0a6`,
`6f050dc9`, `af67f3c8` e `858055df` (a correção da revisão). Status: entregue; nenhum endpoint novo; contratos iguais (o resumo e a lista com
os números certos; o filtro `tipo_viagem` passa a valer).

- [x] **RN-158.01/02 (C377, B1009)** — `clientes.geo_lat`, `geo_lon`, `geo_termo`; `termoDaConsulta` (a mesma função da consulta e da
  memória) e `coordenadaGuardada` em `server/services/coordenadas.js`; a rota `coordenadas-cliente` lê por `SELECT *`, responde a memória do
  termo atual, senão consulta e grava **depois de responder**, sem `updated_at`, com `WHERE` no endereço, na cidade e no estado lidos; a falha
  e o ponto fora da faixa não gravam (`coordenadaPlausivel`) — `f677e0a6`, `858055df`.
- [x] **RN-158.03 (B1008)** — `semCoordenadaGuardada` em `GET /api/clientes` e `/api/clientes/:id`; `POST`/`PUT` já ignoravam (lista
  branca) — `f677e0a6`.
- [x] **RN-158.04** — as três colunas por `ALTER` encadeado no callback do `CREATE TABLE clientes`; provado em pasta vazia, sobre o banco
  com o `CREATE` de antes, no segundo boot e com as `ALTER`s falhando (a rota segue sem memória) — `f677e0a6`, `858055df`.
- [x] **RN-158.05 (C379, era D (157))** — o resumo por `LOWER(TRIM(tipo_viagem))` — `6f050dc9`, `858055df` (fixtures com espaço).
- [x] **RN-158.06 (C380, B1010, era D (157))** — `mesmoValorDoCusto`: os nove campos de valor comparam o número (a régua do que o SQLite
  grava como número; igualdade exata) — `af67f3c8`, `858055df` (a régua da Fase 2 M7 **estava estreita demais**: deixava *".5"* e *"1e3"*
  como troca falsa — r1 M1; e a tolerância de 1e-9 escondia a troca mínima — r2 S1).
- [x] **RN-158.07 (C378, achado na Fase 2)** — o filtro `tipo_viagem` do `GET /api/custos-viagens`, sem caixa e sem espaço — `6f050dc9`.
- [ ] **Os clientes próximos com o ponto do endereço** — **fora**: continuam pela cidade (C383, de antes); usar a memória neles mudaria a
  distância de todos os próximos — é decisão de regra, não conserto.

Testes: `tests/api/coordenadasPrazo.api.test.js` (+10: a memória, a invalidação por cada campo e por fora, a falha, o lixo e o ponto
absurdo, a corrida com endereço/cidade/estado, o banco preso, as listas e o `PUT` da tela), `tests/api/coordenadaGuardadaMigracao.api.test.js`
(novo, 6: pasta vazia, banco antigo, segundo boot, o `UPDATE` que falha, as `ALTER`s que falham, a leitura que falha),
`tests/api/custosViagensPortao.api.test.js` (+3: o resumo e o filtro com fixtures, o histórico, a régua do número).

### A edição do custo de viagem, os valores da rota e a localização pelo servidor (Etapa 157, C372, C374, C375, C376)

Plano: `docs/superpowers/plans/2026-10-19-almoxarifado-etapa157-edicao-do-custo-de-viagem-e-cidades-do-client.md`. Commits `4c9de31d`, `00dbce2b`, `a04ab574`, `10b6f756` e `fab87f82` (a
correção da revisão). Status: entregue; nenhum endpoint novo nem mudado no contrato.

- [x] **RN-157.01 (C372, B1004)** — abrir para editar só sugere a rota (`assinaturaDaRota` sobre o objeto normalizado; a primeira mudança
  num dos sete campos apaga a assinatura para sempre na edição); o contador descarta a resposta velha (resposta, erro, `finally`); o Aplicar
  aéreo marca a passagem — `00dbce2b`, `fab87f82`.
- [x] **RN-157.02 (C374)** — `client/src/utils/valoresDaRota.js`, uma função para o automático, a confirmação e o Aplicar; a taxa no modal —
  `4c9de31d`.
- [x] **RN-157.03 (C375, B1005, B1006)** — `client/src/utils/coordenadasDoCliente.js`; as listas de cidades saíram da `CustosViagens` e da
  `PreviewRota`; a resposta de um cliente que já não é o escolhido não vale; o escolhido entra na lista e tem as regras pedidas na hora; o
  Salvar do cadastro espera as regras — `a04ab574`, `fab87f82`.
- [x] **RN-157.04 (D (156))** — `clientes-proximos`: a mesma cidade e o endereço por `normalizarNome`, o estado sem caixa — `10b6f756`.
- [x] **C376 (Fase 5)** — `calcular-rota` compara o `tipo_viagem` sem caixa (o POST/PUT o gravam em maiúsculas); a edição o põe em
  minúsculas — `fab87f82`.
- [ ] **O resumo por tipo** (`GET /api/custos-viagens/resumo`, `CASE WHEN tipo_viagem = 'ida'`) — **fora, de propósito**: nenhuma tela usa
  `custo_ida`/`custo_volta`/`custo_ida_volta`; mudar a consulta mudaria números que ninguém vê (D (157)). *(Feito na Etapa 158 — `6f050dc9`: o resumo dava 0 para todo custo da tela, **C379**.)*
- [ ] **A coordenada do endereço guardada** (C377) — **fora**: é do cadastro de clientes, e a frequência de consultas não mudou nesta etapa. *(Feito na Etapa 158 — `f677e0a6`.)*

Testes: `client/src/components/CustosViagensEdicao.test.js` (a tela com o `api.js` real e o adaptador falso: 32 cenários),
`client/src/components/PreviewRota.test.js` (3, o `react-leaflet` simulado), `client/src/utils/valoresDaRota.test.js` (3),
`client/src/utils/coordenadasDoCliente.test.js` (5); no servidor, `tests/api/coordenadasPrazo.api.test.js` (+3: os próximos de São Paulo
dos dois lados e o tipo em maiúsculas).

### A repetição do 503 com os filtros, e o prazo e a cidade das coordenadas (Etapa 156, C369, C361, C370, C371)

Plano: `docs/superpowers/plans/2026-10-19-almoxarifado-etapa156-repeticao-listas-recusadas-e-prazo-do-mapa.md`. **Nenhuma rota muda.** Commits `03ecf059`, `438ab108`, `02545473` e a correção da revisão `95fed61a`.

- **A repetição do 503** (`client/src/services/api.js`, `client/src/utils/chaveDoPedido.js` — RN-156.01, C369, B1001): a leitura (GET/HEAD) é
  reconhecida por método, endereço, `params` (ordenados só pela chave — a ordem dos valores repetidos conta; `undefined`/`null` fora; objeto pelo
  JSON) e `responseType`; a repetição é uma promessa guardada na chave (sai antes de repetir — o 503 da própria repetição abre outra); o mesmo
  pedido de novo espera a promessa e recebe uma cópia funda dos dados (o Blob/ArrayBuffer, o mesmo objeto). Gravação: a chave `metodo-url` e o
  irmão recusado na hora, como antes. A repetição apaga `Authorization`/`X-Auth-Token` do config e o interceptor do pedido põe o token de
  agora (Fase 5 r2: quem saiu no meio repetia com o token velho — **C373**).
- **As coordenadas** (`server/services/coordenadas.js` — RN-156.03/04, C361, C370, C371, B1002): as três funções saíram do `index.js` (os
  chamadores não mudam). `geocodificarEndereco`: prazo `NOMINATIM_PRAZO_MS` (padrão 5000; inválido ou acima de 2³¹−1 → 5000) do pedido
  inteiro, com `req.destroy`; não 200 / não JSON / vazio → `null`; `NOMINATIM_URL` (http/https; senão o padrão
  `https://nominatim.openstreetmap.org/search`), lidas a cada consulta; o `q` por `URLSearchParams` (sem o `+` literal). `obterCoordenadasCidade`:
  a lista `CIDADES` com a UF de cada cidade (345 linhas; o literal antigo tinha 570 entradas para 344 nomes, e o Rio Branco do AC se perdia
  sob o do MT); nome sem caixa/acento/espaço nas pontas; com o estado conhecido, só a cidade **desse** estado, senão o centro dele; sem estado,
  a última com o nome. **A primeira versão (um raio de 1.000 km do centro do estado) estava errada** — deixava passar o homônimo de estado
  vizinho (Fase 5 r1: *RIO CLARO/RJ* → Rio Claro/SP).

Testes: `client/src/services/apiRepeticao503.test.js` (o axios real, o adaptador falso), `server/tests/api/coordenadasPrazo.api.test.js` (o
serviço contra um servidor de mapas local; o `index.js` montado com `NOMINATIM_URL`), `ReservasListaRecusadaApiReal.test.js`.

### A busca do topo na tela, o produto da OS pelo código codificado, e a régua do `.use` (Etapa 155, C364, C365, C351)

Plano: `docs/superpowers/plans/2026-10-19-almoxarifado-etapa155-correcoes-tecnicas-de-tela.md`. **Nenhuma rota muda.**

- **A busca do topo** (`client/src/components/BuscaGlobal.js`, `client/src/utils/buscaGlobalAcesso.js` — RN-155.02/03, B999): decide se busca
  pela régua da moldura (`podeUsarBuscaGlobal(user, getCachedUserPermissions(user.id))` → `hasModuleAccess` em algum de
  `MODULOS_DA_BUSCA_GLOBAL = ['comercial']`, os módulos de `TIPOS_DA_BUSCA_GLOBAL`); com o cache frio, `fetchUserPermissions(user.id)` ao abrir
  (erro → busca, falha aberto); sem acesso, o campo desligado e *"A busca do topo procura clientes, projetos, propostas, atividades e produtos
  do Comercial, e você não tem acesso ao Comercial."*, sem pedido; o Esc no `window`. Só o último pedido (`pedidoRef`) grava resultado, erro e
  "carregando"; termo curto, fechar e abrir invalidam; o erro → *"Não foi possível buscar agora. Tente de novo em instantes."*. O filtro do
  servidor (Etapa 153) continua decidindo. `C364` dizia "candidata: desligar o atalho" — a escolha foi abrir e dizer por quê (B999).
- **O produto pelo código** (`client/src/utils/produtoPeloCodigo.js` — RN-155.04, C351): `caminhoDoProdutoPeloCodigo(codigo)` =
  `/produtos/codigo/${encodeURIComponent(String(codigo))}`, usado pelo `OSComercialForm`, `OSDetalhesForm` e `PreviewOSEditavel`; o
  `GET /api/produtos/codigo/:codigo` lê o parâmetro decodificado uma vez pelo Express.
- **A régua do texto** (`server/tests/helpers/reguaDoFonteDoServidor.js` — RN-155.05): `\.\s*use\s*\(\s*[^\s'"`)]` acusa todo `.use(` não
  literal por qualquer receptor (o middleware global por apelido escapava do texto e das camadas); e (Fase 5 r1/r2 A1) o `.use` com um
  caminho literal que vale para toda a API (`'/'`, `''`, `'*'`, `'/api'`, qualquer aspa e caixa), o `use?.(` e o `.use.bind(` —
  `REGISTROS_NAO_LITERAIS_MEDIDOS` com o `io.use` do socket e os 5 `app.use('/api', ...)` de hoje. O plano dizia que o `.use` com caminho
  literal "continua com as camadas": **estava errado** para esses quatro caminhos (rodam no caminho neutro, na mesma posição).
- **O Esc e o usuário efetivo** (Fase 5): o Esc só fecha a busca teclado dentro dela (ou sem foco) — a ajuda do F1 por cima fecha só ela; a
  decisão usa `mergeUserPermissions(user, cached?.usuario)` (quente) e `mergeUserPermissions(user, data?.usuario)` (frio).

Testes: `client/src/components/BuscaGlobal.test.js` (27: 9 de antes + 18 da 155), `client/src/utils/produtoPeloCodigo.test.js` (2: a função
e o inventário), `paineisBuscaGlobalPortao` (o conjunto do client = o do servidor), `produtosGruposVariaveisPortao` (seis códigos especiais
pela rota real; o cru com barra → 404), `custosViagensPortao` (o controle do helper com as oito formas do `.use`).

### O painel, os relatórios e o mapa no portão, e a busca global filtrada por tipo (Etapa 153, C355, C352)

Plano: `docs/superpowers/plans/2026-10-19-almoxarifado-etapa153-paineis-relatorios-e-busca-global-pelo-modulo.md`. Commits `09424106`, `654df671` e `b1918f1a`.

- **As 7 leituras** — `GET /api/dashboard`, `/api/dashboard/historico`, `/api/dashboard/avancado`, `/api/dashboard/vendas`,
  `/api/relatorios/executivo`, `/api/relatorios/visitas-tecnicas`, `/api/mapa/maquinas-vendidas` — com `exigirComercialNasPropostas` como 2º
  middleware (RN-153.01, B991). Telas: o índice de `/comercial` (`Dashboard`, `DashboardVendas`), `/comercial/relatorios` (`Relatorios`),
  `/comercial/maquinas-vendidas` (`MaquinasVendidas`). Os painéis dos outros módulos leem outras rotas (`/financeiro/dashboard`,
  `/operacional/dashboard`, `/operacional/dashboard-mes`, `/almoxarifado/*`, `/frotas/*`, `/producao/dashboard`).
- **`GET /api/busca-global`** com `filtrarBuscaGlobalPorModulo` como 2º middleware (RN-153.02, B992): `portaoDasPropostas.filtrarPorModulo(
  TIPOS_DA_BUSCA_GLOBAL, { contexto: 'portao:busca-global' })` pendura `req.tiposPermitidos` (`null` = todos: desligado, super ou role
  admin, sem ler; senão o `Set` dos tipos cujo módulo `temModuloComoATela` aceita sobre `SQL_LINHAS_DA_TELA`); o handler só empurra o tipo
  permitido (`podeVer`) e, sem tipo nenhum ou sem o filtro na rota, responde `[]` sem consultar. Os seis tipos → `['comercial']` (todo
  resultado abre uma tela do Comercial). Sem log de acesso negado. BUSY → 503 `context: 'portao:busca-global'`; outro erro → 500 *"Erro ao
  verificar permissões"* (o filtro roda antes da conferência do `q`).
- **De fora, de propósito (B993):** `/api/reports` e `/api/workflows*` (stubs; o client os chama como `/api/api/...` — 404, **C362**),
  `/api/auditoria/*` (a `tentativa-acesso` é do próprio barrado; os `logs` com `canManageUsers`), `/api/notificacoes` (os lembretes das
  propostas do próprio usuário; as aprovações são lidas e **não** devolvidas — **C363**; a Etapa 154 as filtrou por tipo — ver acima).
- O aviso do boot (desligado) acrescenta *"…, e as dos painéis, dos relatórios e do mapa do Comercial NAO exigem o Comercial (só o login), e a
  busca global mostra todos os tipos de resultado a qualquer logado; …"*.

Testes: `tests/api/paineisBuscaGlobalPortao.api.test.js` (8: o fonte — com o mapa cobrindo chaves e valores de todo tipo do corpo —, as
camadas do Express, o controle do helper, o barrado, o vendedor seguindo cada resultado até a leitura da tela dele, 15 perfis, o desligado com
o conteúdo, o BUSY/500 com o administrador e o super). **As camadas do Express montado** passaram a ser conferidas pelo helper
`tests/helpers/conferirCamadasDoExpress.js` (o preload `despejaCamadasDoExpress.js` despeja o despacho das amostras, as rotas que as casam e
**todas** as rotas da pilha; `nomeDaCamada.js` dá o nome de cada handler) em todos os testes de portão — 145/146, 147, 148, 149, 150, 151, 152 e
153: só as rotas da etapa (e as de outra etapa no mesmo prefixo, ditas no teste) atendem os prefixos dela, com o login e o portão na frente,
os middlewares de antes iguais aos de todo pedido pela posição na pilha, nenhum router, nenhum `app.param`, nenhuma rota com caminho em
regexp. A régua do texto (`reguaDoFonteDoServidor.js`) passou a acusar também o registro por `.call`/`.apply`.

### Os custos de viagem no portão, e o resumo antes do `/:id` (Etapa 152, C350, C356)

Plano: `docs/superpowers/plans/2026-10-19-almoxarifado-etapa152-custos-de-viagem-pelo-modulo.md`. Commits `9ddd5dfe`, `0bf06b57` e `cc70ee9e`.

- **As 19 `/api/custos-viagens*`** com `exigirComercialNasPropostas` como 2º middleware (RN-152.01, B986) — `POST /:id/comprovante` com o
  portão **antes** do multer `uploadComprovante`. Única tela: `/comercial/custos-viagens` (`CustosViagens` — 18 delas; o `GET /:id` não tem
  chamador, a edição usa a linha da lista — e `PreviewRota`, que só ela abre, no `coordenadas-cliente`). A linha `custos_viagens` da aba
  antiga **Administração → Permissões** (`Permissoes.js`) não abre nada (C358).
- **`GET /api/custos-viagens/resumo` registrado antes do `GET /:id`** (RN-152.02, B987, **C356**): registrado depois, o `/:id` o atendia
  com `id = 'resumo'` → 404 *"Custo de viagem não encontrado"* e a tela escondia os cartões. Num banco vazio as somas e a média saem `null`
  (a tela usa `|| 0`). O teste prende que nenhum `GET` de um segmento literal fica depois do `/:id`.
- **De antes, sem mudança:** `DELETE /:id` do custo editado ou autorizado sem regras → 500 `SQLITE_CONSTRAINT: FOREIGN KEY` (o
  `custos_viagens_historico` e o `logs_autorizacao_viagens` sem `ON DELETE CASCADE` — **C359**, B989); o arquivo do comprovante fica no disco
  ao apagar o custo (**C360**); `aprovar` sem régua própria (**C357**, B988); `geocodificarEndereco` sem prazo (**C361**); `aprovar` e
  `DELETE` com id inexistente → 200.
- O aviso do boot (desligado) acrescenta *"…, e as dos custos de viagem NAO exigem o Comercial (só o login); …"*.

Testes: `tests/api/custosViagensPortao.api.test.js` (as 19 pelo fonte — todos os registros no texto inteiro sem caixa, a régua de todo o
servidor do helper `tests/helpers/reguaDoFonteDoServidor.js`, o resumo antes do `/:id` — e uma a uma; 15 perfis contra a decisão da tela; a
viagem inteira pelo vendedor com o resumo conferido contra o banco; o desligado com as 19 para o barrado e para o grupo sem o Comercial; o
BUSY/500). O helper passou também aos testes das 148/149/150 (a régua sem caixa, o caminho que não é texto literal, o montado fora do
`index.js`, os arquivos com ponto e `.cjs`/`.mjs`).

### Clientes, projetos, oportunidades e atividades no portão (Etapa 151, C349)

Plano: `docs/superpowers/plans/2026-10-19-almoxarifado-etapa151-clientes-projetos-oportunidades-atividades-pelo-modulo.md`. Commits `49fdb035` (o portão e o teste) , `fa87c828` (a régua do fonte das 148/149 no texto inteiro) e `615f6a2b` (Fase 5: as listas com filtro, o registro com caminho que não é texto literal, o desligado contra a régua antiga).

- **18 das 20** com `exigirComercialNasPropostas` (RN-151.01/02, B983/B984): as **13 escritas** (`POST`/`PUT`/`DELETE /api/clientes`,
  `POST /api/clientes/:id/logo` — o portão antes do multer `uploadClienteLogo` —, `POST`/`PUT`/`DELETE` de `/api/projetos`,
  `/api/oportunidades` e `/api/atividades`) e as **5 leituras que só as telas do `/comercial` fazem** (`GET /api/clientes/logos` — Dashboard,
  MaquinasVendidas —, `GET /api/clientes/:id` — ClienteForm —, `GET /api/projetos/:id` — ProjetoForm —, `GET /api/oportunidades` —
  PropostasList, proposta/PropostaForm — e `GET /api/atividades` — Atividades, CustosViagens; com `todos=1` traz os lembretes de todas as
  propostas).
- **`GET /api/clientes` e `GET /api/projetos` só com o login** (RN-151.03, **C353**): o Almoxarifado (MaterialAlmoxarifadoForm,
  ReservasAlmoxarifado, MovimentacoesAlmoxarifado, SobrasAlmoxarifado) e a OS da Fábrica (`operacional/OSForm`) as leem. *(**Mudou na
  Etapa 154** — RN-154.01, B995: o `exigirLeitorDasListasDeClientesEProjetos`, o Comercial, o Almoxarifado ou o Operacional. Era decisão
  — B983 —, não erro.)*
- **Sem chamador vivo, com o portão:** `DELETE /api/projetos/:id` e as três escritas de oportunidade (`Oportunidades`/`OportunidadeForm` são
  código morto — não há rota `/comercial/oportunidades`; o `OportunidadeForm` chama `GET /api/oportunidades/:id`, que **não existe** — **C354**).
- O aviso do boot (desligado) só acrescenta *"…, e as dos clientes, dos projetos, das oportunidades e das atividades NAO exigem o Comercial
  (só o login); …"*.

Testes: `tests/api/clientesProjetosPortao.api.test.js` (as 18 + as 2 listas pelo fonte — todos os registros no texto inteiro, nenhum caminho
montado, nenhum registro com caminho que não seja texto literal — e uma a uma; 14 perfis contra a decisão da tela; os quatro cadastros inteiros pelo Comercial; o cliente e o projeto criados pelo
Comercial lidos nas listas pelo Almoxarifado, pelo Operacional e por Engenharia, e a OS editada pela Fábrica com eles; o desligado com as 18;
o BUSY/500).

### A margem de desconto (Etapa 139, C299/C300)

Uma régua só, `lerMargemDesconto` (`server/margemDesconto.js`), em **quatro** portas: `POST /api/propostas`, `PUT /api/propostas/:id`
(só quando a chave veio), `POST /api/propostas/gerar-automatica` e `POST /api/aprovacoes` (`valor_desconto`).

| Valor | Resultado |
|---|---|
| ausente no `POST`/geração, `null`, `''`, só espaços | **0** (número) |
| número finito de 0 a 100 (`-0` vira 0) | o número |
| texto que é número com ponto (`" 10.5 "`), de 0 a 100 | o número |
| qualquer outra coisa — `"10,5"`, `"10abc"`, `"1e2"`, `".5"`, `-1`, `101`, `true`, `false`, lista, objeto, `NaN`, `Infinity` | **400** *"Margem de desconto inválida: informe um número de 0 a 100, com ponto como separador decimal."*, nada gravado |

O corpo do `PUT` é normalizado (texto → número) **antes** de tudo que lê a margem (a regra dos 5 %, o `montarSetParcial`, o registro da
revisão). A **margem gravada** que a régua não lê (texto de antes desta régua, ou fora de 0 a 100) conta como **acima de 5** na regra do
desconto do `PUT` — enviar sem aprovação dá 403. Ordem no `POST`: título → margem → motivo → cliente → desconto. Na geração automática:
cliente/produtos → margem → **403** com a mensagem do `POST` (*"Não é possível salvar uma proposta com desconto acima de 5% sem aprovação
prévia. A proposta deve ser salva como rascunho até que a autorização seja aprovada."*) quando a margem passa de 5 e o `status` veio e não é
rascunho; margem acima de 5 sem status → rascunho. *(Esta seção dizia "Não coberto (C301–C303): /enviar não olha a margem, o PUT aceita
desconto_aprovado por conta própria, e as aprovações não conferem quem aprova" — resolvido na Etapa 140, abaixo.)*

### A autorização do desconto acima de 5 % (Etapa 140, C301–C303)

Plano com as RN e os contratos: `docs/superpowers/plans/2026-10-17-almoxarifado-etapa140-a-autorizacao-do-desconto.md`. Regras em
`server/aprovacaoDesconto.js` (as mensagens literais em `MSG`); rotas no `index.js`. Teste: `tests/api/aprovacaoDescontoAutorizacao.api.test.js`
(duas subidas; a segunda com `tests/helpers/atrasoSqlInjetado.js`, que atrasa o callback de um SQL escolhido para abrir a janela entre leitura
e gravação).

- **Aprovador** = `pode_aprovar_descontos = 1` **ou** `is_superadmin = 1`, lido do banco na hora (o `req.user` não traz a coluna). Admin de
  papel não basta. **Dono do pedido** = `solicitado_por`, `propostas.responsavel_id` e `propostas.created_by` — o dono não decide, nem o super.
- **`PUT /api/aprovacoes/:id`** (aprovar ou rejeitar): 400 status/motivo → 404 → 403 *sem permissão* → 403 *dono* → 409 *já decidida* (pendente
  = `'pendente'`, vazio ou nulo) → (aprovar desconto) 400 *valor fora da régua* → 404 proposta → 409 *proposta saiu* (só rascunho e
  `desconto_aprovado` aceitam). `aprovado_por` = `req.user`. **Ordem das gravações ao aprovar:** a proposta primeiro (`WHERE status IN
  ('rascunho','desconto_aprovado') AND EXISTS (pedido pendente)`), depois o pedido (`WHERE pendente`); se o pedido foi decidido no meio, a
  proposta volta ao status e à margem lidos (`WHERE status = 'desconto_aprovado' AND margem IS <a gravada>`) e 409. Tudo antes da resposta.
- **`POST /api/aprovacoes`**: `status` e `solicitado_por` do corpo ignorados (nasce `pendente`, de `req.user`); 400 sem `proposta_id` → 400 régua
  → 404 proposta → 400 sem aprovador → 400 só donos aprovam. A atividade vai para o primeiro aprovador ativo não dono (não oculto, com a
  coluna, menor id).
- **`GET /api/aprovacoes`**: cada linha com `pode_decidir` (pendente e aprovador e não dono); `tipo=recebida` com a mesma regra.
- **`PUT /api/propostas/:id`**: 403 ao **entrar** em `desconto_aprovado` (depois do motivo, antes do desconto); 409 ao trocar o
  `responsavel_id` com pedido de desconto pendente; a regra dos 5 % vale para todo status que não é rascunho, inclusive `desconto_aprovado`
  (com a mensagem própria).
- **`POST /api/propostas/:id/enviar`** e **`/assinar`**: margem gravada (ilegível = acima de 5) acima de 5 só com aprovação que casa; a gravação
  confere a margem (`IS`) e, no envio, o status — senão 409 `PROPOSTA_ALTERADA`. A assinatura grava o status antes da assinatura.
- **Casar** (`casaComAprovacao`): aprovação `aprovado`, tipo `desconto`, com `aprovado_por` não nulo e diferente de `solicitado_por`, valor pela
  régua da margem, diferença < 0,01 ponto depois de arredondar a duas casas. Só pelo percentual (**B910**).
- **`GET /premium` (com ou sem `embed`) e `GET /pdf`** (Etapa 141, **C304** resolvido): margem gravada acima de 5 (ou ilegível) sem aprovação
  que case → 403 `MSG.DOCUMENTO`, em **qualquer** status — logo depois do 404, com a margem da linha que gera o documento, antes de gravar o
  retrato e de abrir o navegador. Erro de banco na conferência: `/premium` 503 (busy/locked, `retryAfter: 2`) ou 500 *"Erro ao verificar
  aprovação de desconto"*; `/pdf` 500 pelo `catch`. *(Esta linha dizia "Não coberto: `/premium` e `/pdf` não barram rascunho nem
  `desconto_aprovado`" — o furo era o do desconto, não o do status; resolvido.)* Teste: `tests/api/propostaDocumentoDesconto.api.test.js`.
- **`POST /api/aprovacoes`** grava `valor_total`, `valor_desconto_rs` e `valor_com_desconto` da conta do documento
  (`server/totalDocumentoProposta.js` — a mesma do `/premium` e do `/pdf`), ignorando o corpo (Etapa 141, **C306** resolvido).
- **Não coberto:** quem edita a proposta de outro (Fase 12, **C305**); as aprovações antigas decididas pelo responsável ou pelo criador
  continuam casando (**C307**).

O formulário (`client/src/components/proposta/PropostaForm.js`) monta o corpo em `montarPayloadProposta` (`payloadProposta.js`) e manda `null` — não `undefined` — para *Tipo*, *Data de fechamento*, oportunidade e expiração vazios.

## Lógica de Renderização

### Preview (`/api/propostas/:id/premium`)
Ao gerar o HTML, verificar se existem customizações:
1. Buscar `proposta_customizacoes` para a proposta
2. Se existir, sobrescrever os campos de contato com os valores customizados
3. Verificar se existem entradas em `proposta_clausulas` para a proposta
4. Se existir, usar as cláusulas customizadas em vez das do `condicoesNano4You.js`

### PDF (`/api/propostas/:id/pdf`)
Aplicar a mesma lógica acima e gerar o PDF no servidor com **Puppeteer** (o mesmo HTML do preview, com as imagens embutidas). *(Esta linha
dizia "via PDFKit" — **estava errada**: o PDF da proposta é gerado pelo Chrome headless desde antes desta spec ser revista; corrigida na
Etapa 141.)* Desde a Etapa 141 as duas rotas recusam o desconto não liberado (acima) antes de qualquer coisa.

---

## Lógica de Auditoria
Toda vez que `PUT /customizacoes` ou qualquer rota de cláusula for chamada:
- Comparar valor anterior (busca antes de salvar) com valor novo
- Inserir uma entrada em `proposta_edicoes_log` por campo alterado
- Registrar `usuario_id` e `usuario_nome` do token JWT da requisição

---

## Inicialização de Cláusulas
Quando o usuário editar cláusulas pela primeira vez em uma proposta que ainda não tem customizações:
- Copiar todas as cláusulas **do modelo de contrato da proposta** para `proposta_clausulas` — o modelo da família dos itens
  (`resolverModeloClausulas`: equipamento prevalece; sem modelo próprio, o modelo padrão `clausulas_modelo.is_padrao = 1`; sem modelo
  nenhum, `getClausulasDefault()`), **uma por uma, tudo ou nada** (Etapa 147, RN-147.05). *(Esta linha dizia "copiar todas as cláusulas
  padrão de `condicoesNano4You.js`" — **estava errado** desde a escolha do modelo pela família; corrigido na Etapa 147.)*
- A partir daí, usar apenas as da tabela para aquela proposta
