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
