# Etapa 146 (propostas): a criação, o salvamento e a cópia da proposta só respondem depois de gravar os itens, e o salvamento confere o cliente (C323, C322, C321) — plano

> Origem: "Próxima tarefa detalhada — Etapa 146" do plano da 145
> (`docs/superpowers/plans/2026-10-18-almoxarifado-etapa145-o-modulo-nas-rotas-da-proposta.md`). O design, com a Fase 0 medida, está neste
> plano (seção "Fase 0 — medido"): a etapa é pequena e o design não justifica um documento à parte.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-18): última B **B951**, último C
> **C326**, última A **A93**. Esta etapa: **B952+**, **C327+**, **A94+**. Worktree `CRM-wt-e146`, branch `etapa-e146` (da main `8f07c16c`).
>
> **Trava de máquina:** `scratchpad/e146-lock.sh` (o diretório `maquina-testes.lock` de sempre). Um arquivo de teste de servidor por vez,
> inclusive os revisores. Revisão obrigatória da proposta: `scratchpad/e146/review-proposta.sh` (23 + editor 39; o teste novo da rota entra
> na lista "pela rota"). A etapa **não** toca o template; toca o `index.js` (o `POST /api/propostas`, o `PUT /api/propostas/:id`, o
> `POST /api/propostas/:id/clone`, a gravação dos itens da geração automática e o portão do `GET /api/comercial/ordens-servico`) e
> `server/propostaItensDiff.js` (as frases).
>
> **Fase 2 (um revisor fresco, só leitura): 0 Critical, 4 Important, 9 Minor — todos aceitos antes do código, com o que mudou:**
> **I-1** o `PUT` tem **dois** testes de número duplicado (o do ramo sem revisão, *"O número da proposta já está em uso por outra proposta."*,
> que roda antes do histórico; e o de dentro da gravação, com o número entre aspas) e dois 500 de leitura do número → o ponto da gravação dos
> novos fica **fixado** (logo depois da leitura dos itens atuais, antes do ramo do número) e **toda** saída depois dele passa por um
> "responde desfazendo" único. **I-2** o histórico de revisão (`proposta_revisoes`) era gravado antes do número e do `UPDATE` — ficava
> uma revisão que não aconteceu em toda recusa posterior → passa para **depois do `UPDATE` valer** (o conteúdo é o mesmo: lido antes); os
> cenários de erro conferem `proposta_revisoes`. **I-3** faltavam cenários: `itens: []`/`null` com o `DELETE` falhando, o **409 da
> guarda** com os novos gravados (provocado por um gatilho `AFTER INSERT` que muda a margem, determinístico) e o 400 do ramo sem revisão →
> entram. **I-4** a RN-146.06 desce um clique: a "Nova OS" e a edição chamam rotas do Operacional (`checkModulePermission('operacional')`) —
> quem passa a ver a lista (grupo ativo sem linha) toma 403 ao criar a OS → **C332**; e a rota ganha o 503 do `SQLITE_BUSY` (o do portão) →
> declarado na RN. **M-5/M-6** a gravação devolve os ids (inclusive na falha); a limpeza dos novos e a exclusão dos antigos pela **lista de
> ids** (`IN` / `NOT IN (SELECT value FROM json_each(?))` — sem limite de variáveis e distinguíveis pelo `FALHA_SQL_INJETADA`), e a
> religação usa os ids devolvidos (sem o `SELECT` depois — com dois `PUT` ao mesmo tempo o `SELECT` podia devolver os do outro).
> **M-7** a T3 prende também `'abc'`, `null`, `0`, `-5` → sem cliente (B954); o `projeto_id`/`responsavel_id` que não existe continua
> 500 cru → **C333**. **M-8** são **16** `db.prepare(`, e as cláusulas do modelo são **4** → corrigido abaixo e na C328 (11 fora da proposta).
> **M-9** as telas vivas: `proposta/PropostaForm` (faz o `PUT` e navega); o `components/PropostaForm.js` e o `PreviewPropostaEditavel`
> antigo são código morto (o `lazyModules` monta o novo); o `salvar()` do preview não chama o `PUT` da proposta. **M-10** a cópia lê os
> itens com `ORDER BY id`; a falha de leitura sai com a frase dos itens (declarado); a cópia não leva variáveis manuais nem
> customizações → **C334**. **M-11** a limpeza que falha depois de uma recusa: a frase dos "itens repetidos" com o **erro da recusa**
> dentro dos parênteses. **M-12** a C331 também alonga a janela da guarda das regras cruzadas (mais 409). **M-13** a T3 é no mesmo arquivo
> da T1 → T1 → T2 → T3 em sequência; a T4 é independente.

## Fase 0 — medido (antes de qualquer código)

### Sonda pela rota (`server/tests/sonda/e146.js`, não versionada; `index.js` real em pasta vazia; a falha é REAL)

A falha do item é provocada por um **gatilho do SQLite** gravado por fora (`BEFORE INSERT ON proposta_itens WHEN NEW.descricao LIKE
'FALHA%' → RAISE(ABORT)`): passa por **qualquer** caminho de gravação (o `stmt.run` do statement preparado e o `db.run`), ao contrário do
`FALHA_SQL_INJETADA`, que só intercepta `Database.prototype` (o ponto de atenção do plano da 145). O mesmo gatilho prova o "antes" e o
"depois" nos testes novos.

| Sonda | Rota | Medido (árvore da main `8f07c16c`) |
|---|---|---|
| P1 | `POST /api/propostas` com 5 itens, o 3º falhando | **200**, a proposta criada com **4** itens (A, B, D, E) — o que falhou sumiu calado |
| P2 | `PUT /api/propostas/:id` (X, Y, Z gravados) com X2, FALHA, Z2 | **200**, a proposta ficou com **X2, Z2**: os três antigos apagados, o que falhou sumiu, a revisão e o número andaram (REV01) |
| P4 | `POST /api/propostas/:id/clone` de uma proposta com C1, FALHA C, C3 | **201**, a cópia com **2** itens |
| P5 | `POST /api/propostas` com 2 000 itens, sem falha | 200 com os 2 000 no banco no instante da resposta (o `finalize` com callback espera os `run` da fila do statement) — **a criação não responde antes; ela só engole o erro** |
| — | log do servidor nas três | `[FATAL GUARD] uncaughtException: [Error: SQLITE_CONSTRAINT: falha do gatilho]` — o erro do `stmt.run` sem callback vira evento `error` do statement, sem ouvinte, e cai na guarda do processo; o servidor segue vivo |
| P3 | `PUT` com `cliente_id: 99999` | **500** *"Erro ao atualizar proposta: SQLITE_CONSTRAINT: FOREIGN KEY constraint failed"*, nada gravado |
| P3b/c | `PUT` com `cliente_id: 'abc'` / `null` | **200**, a proposta fica **sem cliente** (`cliente_id` NULL) — a transformação de sempre, presa de propósito pelo teste X09b da Etapa 138 (`cliente_id: ''` grava null) |

**A C322 estava errada como foi escrita** ("o `PUT` com `cliente_id` que não existe **grava**"): com as chaves estrangeiras que o servidor liga
(`sqliteConcurrency.js`, `PRAGMA foreign_keys = ON`) e a tabela `propostas` declarando a chave para `clientes` (conferido também na cópia do
banco local de 09/10), o `PUT` com cliente que não existe dá **500** com a mensagem crua do SQLite e **não grava** — o mesmo erro que a 145
mediu no `POST` com `numero_proposta`. O que de fato grava é o cliente vazio/texto/nulo → proposta sem cliente (acima), que é contrato da
138 e não entra aqui (B954).

### O mesmo padrão em outras rotas (contado: `db.prepare(` no `index.js`, **16** ocorrências — *dizia 15; estava errado (Fase 2 M-8)*)

- **Na proposta, com itens:** o `POST /api/propostas` (C323), o `PUT /api/propostas/:id` (P2 — **pior** que a C323: apaga os itens
  antigos antes, então o que falha some **e** o que havia também), o `POST /api/propostas/:id/clone` (P4 — e responde 201 **sem esperar**
  o `finalize`, como a geração automática antes da 145). As três entram.
- **Na proposta, cláusulas:** `POST /:id/clausulas/inicializar` e `PUT /:id/clausulas/reordenar` — `stmt.run` sem callback e o `finalize`
  com callback; a mesma guarda engole o erro de uma linha → **C327** (não entram: cláusula não é item, e o reordenar é idempotente).
- **Fora da proposta (11):** cláusulas do modelo (4), materiais do escritório, variáveis técnicas, viagem × clientes (2), listas de preço,
  solicitações de material e de compra (2) → **C328** (registro; outros módulos).

### O `PUT` — o que a Etapa 142 fez e não pode quebrar (lido no código)

A ordem de hoje: lê a proposta → recusas (404, título, margem, itens inválidos, motivo, "desconto aprovado", responsável com pedido
pendente 409, desconto 403) → **histórico de revisão** (`proposta_revisoes`, só se itens ou valor mudaram) → número duplicado (400) →
**`UPDATE propostas`** (guarda das regras cruzadas → 409) → `itens` ausente responde aqui → `materializarVariaveisManuais` (o reparo das
órfãs vira gravação, RN-142.11) → **`DELETE` de todos os itens** → `INSERT` por `stmt.run` dos itens **mesclados**
(`mesclarItensPreservandoCampos`: o item pareado preserva do seu gravado os campos que o corpo não trouxe) → o histórico de edições dos
itens (`diffItensParaLog`, disparado **sem esperar** os `INSERT` — o comentário "só APÓS … persistidos com sucesso" **não confere com o
código**) → espera o `finalize` → **religa** as variáveis manuais (`planoReligacao` sobre os ids lidos por `SELECT … ORDER BY id`; se a
contagem não bate, não religa nem aposenta — D (142)) → 200.

### O `GET /api/comercial/ordens-servico` (C321)

Uma só rota `/api/comercial/ordens-servico` no servidor, com `checkModulePermission('comercial')`; uma só tela a chama
(`OrdensServicoComercial`, dentro de `/comercial`, duas chamadas). As outras `/api/comercial/*` (listas de preço, 5) só pedem o login →
**C329**. Trocar pela régua da tela (`exigirComercialNasPropostas`) muda o resultado só para quem as duas réguas tratam diferente (B63 /
plano da 145): quem a tela já barra do Comercial (perde a lista pela API — já não via a tela) e quem está num grupo ativo sem nenhuma linha
(a tela abre o Comercial e a lista dava 403 — passa a ver).

### Banco local (cópia de 09/10, no scratchpad)

57 propostas, 112 itens, **0** sem cliente, **0** com cliente que não existe. A **A94** é a mesma consulta para produção.

**Linha de base** (a árvore da main `8f07c16c`, antes de qualquer código): `test:api` **465/465**. *(As outras suítes da base são as do
fechamento da 145, sobre a mesma árvore: `test:almoxarifado` 44/0, `validation`/`safealter`/`sqlite` 16/0, client 143/1845, build ok.)*

## Regras de negócio

- **RN-146.01 — a criação responde depois de gravar os itens, e o item que falha desfaz a proposta (C323).** O `POST /api/propostas`
  grava os itens **um depois do outro** (`db.run`) e só responde `200` depois do último (o corpo de resposta é o de sempre:
  `{ id, numero_proposta, ...corpo }`). Falha num item → apaga os itens já gravados e depois a proposta (só com os itens fora) → **500**
  *"Erro ao gravar os itens da proposta (<mensagem do banco>). Nenhuma proposta foi criada — tente de novo."*; se uma das exclusões falhar
  → **500** *"Erro ao gravar os itens da proposta (<mensagem do item>). A proposta <número> ficou incompleta — exclua-a e gere de novo."*
  (as frases da RN-145.05, as mesmas, de propósito — B953). A coluna `acessorios` continua gravada (`serializarAcessorios`).
- **RN-146.02 — o salvamento grava os itens novos ANTES de mexer em qualquer outra coisa, e só apaga os antigos depois (C323 no `PUT`).**
  No `PUT /api/propostas/:id` com `itens` lista não vazia, depois de todas as recusas e da conferência do cliente (RN-146.04), a primeira
  gravação é a dos itens **novos** (os mesclados, um por um). Falha num deles → apaga os novos já gravados → **500** *"Erro ao gravar os
  itens da proposta (<mensagem>). Nada foi alterado — tente salvar de novo."* — e nada mudou mesmo: cabeçalho, número, revisão, histórico de
  revisão, histórico de edições, variáveis manuais e os itens antigos (mesmos ids). O ponto (Fase 2 I-1): **logo depois da leitura dos itens
  atuais**, antes do ramo do número. Com os novos gravados: número duplicado (os dois testes) → `UPDATE` → **histórico de revisão** (passou
  para depois do `UPDATE` valer — Fase 2 I-2) → reparo das variáveis → **apaga os antigos** (todo item da proposta que não é um dos novos,
  pela lista de ids) → histórico de edições dos itens → religação **pelos ids devolvidos** → **200** (o corpo de sempre). Qualquer recusa
  ou erro **depois** dos novos gravados e antes do `UPDATE` valer (os dois 400 e os dois 500 do número, o 400 do `UNIQUE`, o 500 do
  `UPDATE`, o 409 da guarda) apaga os novos antes de responder **a mesma resposta de antes**. Falha
  ao apagar os antigos → apaga os novos → **500** *"Erro ao gravar os itens da proposta (<mensagem>). Os outros dados da proposta foram
  salvos, mas os itens continuam os de antes — confira e salve de novo."*. Falha de qualquer limpeza dos novos → **500** *"Erro ao gravar
  os itens da proposta (<mensagem da falha original>). A proposta <número gravado> ficou com itens repetidos — recarregue, confira os itens
  e salve de novo."*. `itens: []` ou `null` (contrato da 138: apaga todos): sem novos para gravar; a falha do `DELETE` responde a frase dos
  "itens continuam os de antes". `itens` ausente: nada muda (138). **A Etapa 142 continua:** os campos preservados pela mesclagem e a
  religação das variáveis pelo pareamento (os ids novos lidos depois de apagar os antigos — a mesma lista de antes).
- **RN-146.03 — a cópia responde depois de gravar os itens (C323 no clone).** `POST /api/propostas/:id/clone` grava os itens da cópia um
  por um e só responde **201** `{ message: 'Proposta clonada', id, numero_proposta }` depois do último; falha num item, ou na leitura dos
  itens da origem → apaga o que gravou e a cópia → **500** com as frases da RN-146.01 (a "incompleta" com o número da cópia).
- **RN-146.04 — o salvamento confere o cliente que mudou (C322).** No `PUT /api/propostas/:id`, quando o corpo traz `cliente_id`, o número
  lido (`parseInt`) é inteiro positivo **e difere do gravado**, o cliente tem de existir: senão **400** *"Cliente não encontrado (id 99999).
  Atualize a lista de clientes e tente de novo."* (a frase da criação, `msgClienteNaoEncontrado`) e nada é gravado (antes **500** com a
  mensagem da chave estrangeira); erro ao ler → **500** *"Erro ao verificar o cliente: <mensagem>"*. Cliente ausente, igual ao gravado, ou
  vazio/texto/nulo (que grava a proposta sem cliente — X09b da 138) não lê nada e segue como antes (B954). Inativo conta como achado (B947).
- **RN-146.05 — a ordem das recusas do `PUT`.** 404 → título → margem → itens inválidos → motivo → "desconto aprovado" (403) → responsável
  com pedido pendente (409) → desconto sem aprovação (403) → **cliente não encontrado (400)** → (os itens novos) → número duplicado (400).
- **RN-146.06 — a lista de OS do Comercial pela régua da tela (C321).** `GET /api/comercial/ordens-servico` passa pelo portão das propostas
  (`exigirComercialNasPropostas`) no lugar do `checkModulePermission('comercial')`. Recusa **403** `{ "error": "Acesso negado ao módulo",
  "modulo": "comercial" }` (o mesmo corpo) e o log `acesso_negado`. A chave `PROPOSTAS_PORTAO_DE_MODULO=desligado` (B946) também a libera. Novo nesta rota (o do portão): `SQLITE_BUSY` ao ler as
  permissões → **503** (`context: 'portao:propostas'`); outro erro → 500 *"Erro ao verificar permissões"*.

## Contratos de API (congelados)

| Rota | Caso | Status | Corpo / mensagem literal |
|---|---|---|---|
| `POST /api/propostas` | falha num item | 500 | `Erro ao gravar os itens da proposta (<msg>). Nenhuma proposta foi criada — tente de novo.` |
| `POST /api/propostas` | falha e a limpeza falha | 500 | `Erro ao gravar os itens da proposta (<msg>). A proposta <número> ficou incompleta — exclua-a e gere de novo.` |
| `POST /api/propostas/:id/clone` | falha num item / na leitura dos itens | 500 | as duas acima (o número da cópia) |
| `PUT /api/propostas/:id` | falha num item novo | 500 | `Erro ao gravar os itens da proposta (<msg>). Nada foi alterado — tente salvar de novo.` |
| `PUT /api/propostas/:id` | falha ao apagar os antigos | 500 | `Erro ao gravar os itens da proposta (<msg>). Os outros dados da proposta foram salvos, mas os itens continuam os de antes — confira e salve de novo.` |
| `PUT /api/propostas/:id` | a limpeza dos novos falha | 500 | `Erro ao gravar os itens da proposta (<msg>). A proposta <número> ficou com itens repetidos — recarregue, confira os itens e salve de novo.` |
| `PUT /api/propostas/:id` | cliente que mudou e não existe | 400 | `Cliente não encontrado (id <id>). Atualize a lista de clientes e tente de novo.` |
| `PUT /api/propostas/:id` | falha ao ler o cliente | 500 | `Erro ao verificar o cliente: <msg>` |
| `GET /api/comercial/ordens-servico` | sem o Comercial pela régua da tela | 403 | `{ "error": "Acesso negado ao módulo", "modulo": "comercial" }` |

As respostas de sucesso não mudam (corpo e status).

## Tasks (sort topológico)

- [x] **T1 — `b4856722` (Fase 5: `917f3683`) — tronco — a gravação em sequência (RN-146.01/03).** `gravarItensEmSequencia(sql, linhas, feito(err, ids))` (o laço do
  `gravarItensDaGeracaoAutomatica`, devolvendo os ids) e `desfazerPropostaCriada(propostaId, numero, erro, feito)` (a limpeza da 145);
  `gravarItensDaGeracaoAutomatica` passa a ser a composição das duas (a geração automática não muda de comportamento — os 8 cenários da 145
  continuam verdes); o `POST /api/propostas` e o clone usam as mesmas duas com o SQL deles (24 e 25 colunas). Testes:
  `tests/api/propostaSalvarGrava.api.test.js` (molde do `propostaGeracaoGrava`, mais o **gatilho** como falha real): P1 e P4 → 500 literal,
  nenhuma proposta nem item a mais; 2 000 itens no `POST` e 300 no clone → todos no instante da resposta; a limpeza que falha
  (`FALHA_SQL_INJETADA` agora alcança) → a frase da incompleta; a metade positiva com `acessorios`, `descricao_tabela` copiados no clone.
- [x] **T2 — `b4856722` (Fase 5: `917f3683`) — galho (depende de T1) — o `PUT` (RN-146.02).** A reordenação acima. Testes no mesmo arquivo: P2 (gatilho) → 500 "Nada foi
  alterado" e **tudo** igual (ids dos itens, cabeçalho, número, revisão, `proposta_revisoes`, `proposta_edicoes_log`, variáveis manuais);
  a falha no 3º de 5 (`FALHA_SQL_PULAR`); a limpeza dos novos que falha → "itens repetidos"; o `DELETE` dos antigos que falha → "continuam
  os de antes" (cabeçalho salvo, itens antigos, nenhum novo); o `UPDATE` que falha e o número duplicado → a resposta de antes e os itens
  antigos intactos; 2 000 itens → só os novos na resposta; **a 142 continua**: campo preservado (`modelo`/`descritivo_tecnico` gravados por
  fora e ausentes do corpo) e a variável manual do item do meio religada ao id novo; o histórico de edições só no sucesso.
- [x] **T3 — `b4856722` (Fase 5: `917f3683`) — galho — o cliente do `PUT` (RN-146.04/05).** 99999 → 400 literal, nada gravado (antes 500 da chave); o mesmo cliente e outro
  que existe → 200 (o contato sai — 138); vazio continua gravando null (X09b); a ordem (o 403 do desconto vem antes; o 404 antes de tudo);
  a falha de leitura injetada → 500. T2 e T3 dividem o `PUT` e o arquivo → em sequência, por mim.
- [x] **T4 — `b4856722` (Fase 5: `917f3683`) — galho — a lista de OS do Comercial (RN-146.06).** A troca do portão. Testes no arquivo do portão da 145
  (`propostaPortaoModulo.api.test.js`, um cenário novo): o barrado (só Operacional por direta) → 403 + log; o grupo ativo sem linha → 200
  (antes 403); o vendedor e o super → 200; a régua pelo fonte confere o portão no registro.
- [x] **T5 — `b4856722` — integração (cruza T1, T2, T3).** O vendedor cria pelo `POST` (3 itens), preenche a variável manual do 2º, salva pelo `PUT`
  trocando o cliente para outro que existe e acrescentando um item, copia pelo clone: cada passo responde com tudo gravado e a cópia tem os
  4 itens; o `PUT` seguinte com cliente que não existe e um item que falha → o 400 do cliente (vem antes dos itens) e nada muda.
- [x] **T6 — no documento de novidades (fechamento) — a consulta A94** (propostas sem cliente ou com cliente que não existe; e as
  propostas cujo número de itens não bate com o histórico de edições não dá para medir — declarado).

## Decisões (vão para a letra B)

- **B952** — o `PUT` grava os itens novos **antes** de tudo e apaga os antigos **depois** (não por transação, B948). Descartado: (a) manter
  "apaga e reinsere" e, na falha, reinserir os antigos pelos dados lidos (a reinserção falha pelo mesmo motivo que a inserção, e aí os
  itens somem de vez); (b) gravar os itens depois do `UPDATE` (a falha deixaria valor, revisão e número novos com os itens antigos).
  Consequência: entre os novos gravados e os antigos apagados, quem lê a proposta vê os itens **duas vezes** (segundos, com milhares).
- **B953** — as frases da criação e da cópia são as da geração automática (RN-145.05), inclusive o *"gere de novo"*. Descartado: uma frase
  por porta (três textos para o mesmo fato; o vendedor não sabe por qual porta a tela salvou).
- **B954** — o `PUT` só confere o cliente **que mudou para um número**; vazio/texto/nulo continua gravando a proposta sem cliente
  (contrato preso pelo X09b da 138). Descartado: recusar como a criação (*"Cliente é obrigatório"* / *"Cliente inválido"*) — muda o que a
  138 decidiu manter; vai como **C330** para o P.O.
- **B955** — a cópia entra no escopo (o plano nomeava o `POST` e o `PUT`). Descartado: deixá-la como C (é a mesma falha, na mesma tabela, e
  a cópia respondia 201 **antes** de gravar, como a geração automática da 145).
- **B956** — a lista de OS do Comercial pela régua da tela (C321). Descartado: deixar a régua antiga (a tela e a API discordam para quem
  está num grupo sem linha — a tela abre e a lista dava 403).
- **B957** — a próxima etapa (147).

## Avisos novos (C)

- **C327** — as cláusulas da proposta (inicializar, reordenar) gravam por statement sem conferir o erro de cada linha.
- **C328** — o mesmo padrão fora da proposta (11 statements, de outros módulos e das cláusulas do modelo).
- **C329** — as 5 rotas `/api/comercial/listas-precos*` só pedem o login.
- **C330** — o `PUT` com cliente vazio/texto/nulo grava a proposta sem cliente (B954, P.O.).
- **C331** — entre os itens novos gravados e os antigos apagados, a proposta mostra os itens duas vezes (B952); e a janela entre a leitura e a
  gravação do cabeçalho fica maior (mais 409 da guarda com milhares de itens — Fase 2 M-12).
- **C332** — a tela de OS do Comercial chama rotas do Operacional (número, itens da OS) com a régua antiga: quem passa a ver a lista pela
  RN-146.06 (grupo ativo sem linha) toma 403 ao criar a OS (Fase 2 I-4).
- **C333** — o `PUT` com `projeto_id` ou `responsavel_id` que não existe responde 500 com a mensagem crua da chave estrangeira (Fase 2 M-7).
- **C334** — a cópia da proposta não leva as variáveis manuais nem as customizações do documento (Fase 2 M-10).
- **C335** — a leitura de uma OS pelo número (e os itens e o PDF dela) só pede o login (Fase 5 r2 I-2; anterior).
- **C336** — o `cliente_id` de 20 dígitos sai arredondado na frase do cliente não encontrado (Fase 5 r2 M-4; cosmético).

## Execução

- **TDD, vermelho medido:** o arquivo novo `propostaSalvarGrava.api.test.js` rodado contra a árvore da main deu **5 passed, 12 failed** —
  inclusive o `PUT` com o item que falha **sem resposta em 60 s** (a sonda tinha medido 200; com o corpo do teste — título + valor + 4
  itens — a rota pendurou: o `error` do statement na guarda e o `finalize` sem seguir). Os 5 verdes eram as metades positivas.
- **Divergências do plano:** (1) as RN e os testes foram ajustados antes do código pelos achados da Fase 2 (acima); (2) a T6 (A94) não é
  código — foi para o documento de novidades, rodada no banco local (0/0) e num controle (achou as duas); (3) T1–T4 num commit só
  (`b4856722`): dividem o `index.js` e o git desta máquina não faz *add* parcial sem modo interativo; (4) o teste do acessório nasceu com
  o formato errado (`{ nome }` — o `lerAcessorios` descarta sem `descricao`) e foi corrigido antes do commit (**não** era defeito);
  (5) o primeiro teste do número duplicado esperava a frase do teste de dentro da gravação, e a rota respondia a do ramo sem revisão —
  exatamente o I-1 da Fase 2; o cenário passou a cobrir os dois ramos.
- **Controles K1–K16 (14, rodados por `scratchpad/e146/sabota.js`, um por vez sob a trava):** a criação ignorando o erro; o `PUT` seguindo
  depois do erro; o `responderDesfazendo` sem desfazer; o histórico de revisão de volta antes do `UPDATE`; apagar todos (inclusive os
  novos); religar sem os ids; sem conferir o cliente; a cópia respondendo antes; os antigos que não saem sem tirar os novos; a régua antiga
  na lista de OS; a frase "nada" trocada; a gravação sem devolver os ids; o cliente conferido só quando igual; a geração automática
  ignorando o erro — **todos caíram** pela asserção do ponto; md5 restaurado em todos.
- **Suíte antes de `b4856722`:** `test:api` **466/466**; `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` verdes
  (16/0); revisão obrigatória da proposta **23/23** + as rotas (21/0, 11/0, **11/0**, 8/0, **18/0**) + editor **39/39**; client **143**
  suítes / **1845** testes; `CI=true build` *Compiled successfully*.

## Fase 5 — três revisores frescos em paralelo, sob a trava

- **Regra (r1): 0 Critical, 1 Important da etapa, 0 Minor.** Comparou **28** cenários entre a árvore da main e a da etapa, pelo `index.js`
  real (itens iguais com e sem `id`, item tirado e incluído de novo, variáveis manuais, acessórios `'[]'`, `descricao_tabela`, `itens`
  `null`/`[]`/ausente, sequência de revisões com o `proposta_revisoes` por dentro, `POST` sem itens, cópia sem itens, `cliente_id` em 11
  formas, a ordem das recusas): **idênticos** fora o que a etapa muda (o 99999 → 400, e sem a linha de revisão que a árvore antiga deixava).
  **I** — dois `PUT` simultâneos com `itens` na mesma proposta deixavam **0 itens** e os dois 200 (2 de 3 com 3 itens, 6 de 6 com 20; a
  árvore antiga duplicava): o `NOT IN` os novos de cada um apagava os novos do outro. **Corrigido:** os antigos saem pela lista dos **lidos**
  (`id IN`), o pior caso volta a duplicar. O comentário do código dizia o contrário ("um PUT simultâneo não leva os novos deste") — corrigido.
- **Autorização (r2): 0 Critical, 2 Important (1 da etapa — o mesmo do r1, reproduzido 5 de 5; 1 anterior), 2 Minor.** **I-2** (anterior) a
  leitura de OS pelo número, os itens e o PDF dela só pedem o login (um usuário só do Almoxarifado leu os 56 campos) → **C335**. **M-3** o
  fluxo seguinte da OS do Comercial (número, itens, criação) falha para quem só tem o Comercial → somado à **C332**. **M-4** o `cliente_id`
  de 20 dígitos sai arredondado na frase → **C336** (cosmético). **Verificado e correto, executado:** a tabela de quem ganha e quem perde a
  lista de OS; maiúsculas, barra final, query, `/./`; o BUSY → 503; o cliente não é oráculo (o portão vem antes); os ids injetados não tocam
  outra proposta (a limpeza usa os `lastID` do servidor); 50 000 itens no `PUT` em 4,6 s e 170 000 (14,3 MB) em 15,9 s, sem derrubar o
  servidor nem segurar as outras rotas; 25 corpos estranhos sem pendurar.
- **Sabotagem (r3, worktree própria `CRM-wt-e146-r3`): 27 sabotagens novas — 8 caíram, 13 sobreviventes reais, 6 equivalentes; 0 defeitos.**
  Sobreviventes → cenários: **R1–R3** o ramo de limpeza falhando dentro do `responderDesfazendo` (resposta, número, detalhe); **R4/R5** o
  ramo "repetidos" depois dos antigos que não saem; **R9** a revisão gravada sem mudança; **R10** o histórico de itens no ramo dos antigos;
  **R14** os acessórios no `PUT`; **R17a/b** o cliente conferido por régua diferente da que grava (`'99999abc'`, `'0x1869F'`); **R20** o 400 do
  `UNIQUE`; **R21** o 500 da leitura do número (os dois ramos); **R22** a cópia cuja leitura dos itens falha. Equivalentes provados: os dois
  atalhos de lista vazia, o `ORDER BY id` do clone (a ordem do índice), conferir o cliente igual ao gravado, o `Number()` do gravado, o
  `proposta_id` redundante na limpeza pelos `lastID`. Duas sabotagens do r3 (R8, R13) só caíram por suítes de etapas anteriores
  (`putParcialMantem`, `propostaItensIguais`) — declarado.
- **Controles da Fase 5, rodados por mim** (`scratchpad/e146/sabotagens-f5.json`): **F1** (os antigos de volta pelo `NOT IN` os novos — o simultâneo caiu: 0 itens na rodada 0) e **S1–S22** (as sobreviventes do r3, 13 —
  S1, S2, S3, S4, S5, S9, S10, S14, S17a, S17b, S20, S21, S22) — **todos caíram pela asserção do ponto**, md5 restaurado.
- **Fase 5 — `917f3683`.** O teste passou de 18 para **26** cenários (o simultâneo, a revisão sem mudança, os acessórios, o cliente pela
  régua da gravação e os quatro ramos de limpeza por falha injetada).
- **Suíte antes de `917f3683`:** `test:api` **466/466**; `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` verdes (16/0);
  revisão obrigatória da proposta **23/23** + as rotas (21/0, 11/0, 11/0, 8/0, **26/0**) + editor **39/39**; client **143** suítes /
  **1845** testes; `CI=true build` *Compiled successfully*. É também a verificação do fechamento (depois dela só mudaram documentos).

## Retro (4 números)

1. **Rodadas de correção até verde:** **2** — antes do primeiro commit (o formato do acessório e a frase do ramo sem revisão, ambos do
   teste) e a Fase 5 (o simultâneo e os cenários do r3). Testes antigos mudados: **1** (`propostaPortaoModulo` ganhou um cenário; nenhum
   existente alterado).
2. **Achados da revisão:** Fase 2 — **0 Critical + 4 Important + 9 Minor, todos reais** (o que mais pesou: os dois testes de número
   duplicado e o histórico de revisão gravado antes da recusa). Fase 5 — r1 **1** Important da etapa; r2 o **mesmo** Important + **1**
   anterior + **2** Minor; r3 **13** sobreviventes reais (viraram 8 cenários) + **6** equivalentes; **0** ruído. **O defeito que importou
   (dois salvamentos ao mesmo tempo apagando tudo) nasceu da correção da Fase 2 M-6** — a troca para "apagar o que não é meu" foi feita
   para proteger contra o PUT simultâneo e fez o contrário; só uma sonda executada achou (dois revisores, independentes).
3. **Paralelismo:** **0** galhos em paralelo de fato (T1–T4 dividem o `PUT` e o arquivo de teste); **0** retrabalho; **1** revisor na Fase
   2, **3** em paralelo na Fase 5 sob a trava (o r3 numa worktree própria, removida).
4. **Defeito que escapou:** *(preencher na Etapa 147)*.

## Próxima tarefa detalhada — Etapa 147

*(A série desta etapa foi B952–B957, C327–C336, A94 — a 147 começa em **B958**, **C337**, **A95**; confira com `grep -oE` antes.)*

**Escolhida: a C319 + a C329 (do Comercial) — o portão nas rotas que ainda só pedem o login.** As **20** rotas `/api/proposta-template*`,
`/api/proposta-blocos*`, `/api/proposta-texto-biblioteca*` (o modelo da proposta, os blocos, a biblioteca de textos — o r2 da 145 mostrou
que o barrado **cria bloco**) e as **5** `/api/comercial/listas-precos*`. **Desenho sugerido:** `exigirComercialNasPropostas` logo depois do
`authenticateToken` (o mesmo da 145; a régua pelo fonte do `propostaPortaoModulo` estendida a esses prefixos). **Fase 0 obrigatória:** medir
quem chama (no client: `ConfigTemplateProposta`, `EditorTemplateProposta` e `ListaPrecos`, todas dentro de `/comercial`; o
`PreviewPropostaEditavel` antigo é código morto; `baixarContratoAnexo`), e **no servidor**: o `/premium` e o `/pdf` montam o documento com
imagens buscadas em `http://localhost:${PORT}` (`index.js`, procure `logoBaseURL` e `const baseURL = process.env.API_URL`) — se alguma for
`/api/proposta-template/...` sem token, o portão quebra o PDF calado; e se o Operacional (a OS) ou outro módulo lê o modelo. Uma consulta
**A95** no molde da A93 (quem editou o modelo/blocos/listas nos últimos 90 dias e perde o acesso) se houver histórico para isso. **Se
couber:** a **C327** (as cláusulas da proposta — inicializar e reordenar — em sequência com o erro conferido, no molde de
`gravarItensEmSequencia`) e a **C335** (as rotas `/api/operacional/ordens-servico/:id*` que só pedem o login — medir antes quem as chama: a
OS do Comercial e a do Operacional).

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 145 (**B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**,
o resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela de conversões e o grupo acima de família, a
régua do tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05,
os itens de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**,
**B101**/G30, **G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62; nas propostas, a verificação do dono da proposta
(Fase 12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a Frente B da lentidão, a **C297** (**B924**), a
**B926**, a **C312**, a **C316**, a régua de quantidade da **C314** e a **B949**), **mais a C330** (a proposta pode ficar sem cliente?).
Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** `gravarItensEmSequencia`, `desfazerPropostaCriada`, `gravarItensDaPropostaNova`,
`apagarItensNovos` e os `SQL_ITEM_*` (`index.js`); `msgItensNaoSalvos` (`propostaItensDiff.js`); o `PUT` com os itens novos antes, o
`responderDesfazendo`, o histórico de revisão depois do `UPDATE` e os antigos pela lista dos lidos; o cliente do `PUT`; a lista de OS do
Comercial com o portão; o teste `propostaSalvarGrava.api.test.js` (26 cenários — o gatilho do SQLite como falha real é o molde para
qualquer porta que grave por statement preparado).
