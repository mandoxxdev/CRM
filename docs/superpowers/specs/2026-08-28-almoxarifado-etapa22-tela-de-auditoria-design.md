# Almoxarifado — Etapa 22: a trilha ganha leitor (design)

Data: 2026-08-28 · Branch: `desenvolvimento-almoxarifado`
Origem: **B33** — pendência aberta desde a Etapa 18 e repetida no fechamento da 19 e da 20.

## Decisão de escopo (Fase 0 — medida em 2026-08-28)

Três etapas seguidas (18, 19, 20) instrumentaram a trilha: o ciclo do inventário, os 23
endpoints de cadastro e configuração, e a foto de material. **Nada disso tem leitor.** A
medição confirmou:

1. **`GET /api/almoxarifado/auditoria`** (`routes/almoxarifado/extended.js:1337`) existe, com
   gate `configurar` e paginação que declara o corte (Etapa 18) — mas **filtra só por
   `entidade` e `entidade_id`**. Não dá para perguntar *"quem mexeu nisto ontem?"*, que é a
   pergunta que uma trilha existe para responder. Sem filtro de período, a resposta padrão são
   as 200 linhas mais recentes de uma tabela que cresce por save.
2. **`auditoria_log_almoxarifado` não tem NENHUM índice** — o schema tem 12 índices para outras
   tabelas e zero para esta. É justamente a tabela que mais cresce: o log de `setor_permissao`
   grava o mapa inteiro a cada save (~46 KB, o G8). Ordenar por `created_at DESC` e filtrar por
   período é table scan crescente.
3. **Nenhum componente do client consome a rota** (verificado; o `Logs.js` do core lê
   `/auditoria/logs`, que é outro sistema, do core, com outra tabela). A tela é nova de fato.

**Medição que muda o desenho:** os verbos gravados são **inconsistentes entre si** —
`CRIACAO` **e** `CRIAR`, `EDICAO` **e** `ATUALIZACAO` **e** `ATUALIZAR`, num universo de ~25
entidades e ~45 ações distintas espalhadas por `routes/` e `services/`. Isso já estava nomeado
na spec 23 como "normalização dos verbos antigos" e nunca doeu porque ninguém lia o log. **Uma
tela com filtro de ação faz doer na hora**: o usuário veria duas opções que significam a mesma
coisa e concluiria, corretamente, que o sistema não sabe o que registrou.

**Escopo escolhido:**

- **Backend:** filtros de `usuario_id`, `acao`, `data_inicio` e `data_fim` no GET, com
  **validação que recusa data malformada** (a rota hoje não valida nada); índices na tabela; e
  uma rota `GET /auditoria/opcoes` que devolve os valores **realmente presentes no banco** para
  alimentar os selects — não uma lista hardcoded que envelhece.
- **Rótulos:** `services/almoxarifado/auditLabels.js`, função pura, traduzindo entidade e ação
  para português de usuário e **agrupando os sinônimos na EXIBIÇÃO**.
- **Front:** tela `/almoxarifado/auditoria` com os filtros, paginação que respeita o `truncado`
  que o backend já declara, e o **de/para legível** — a linha expande e mostra só os campos que
  mudaram, não o JSON cru.

**Fica FORA, declarado:**

- **Migrar os verbos no banco** (`UPDATE ... SET acao='CRIACAO' WHERE acao='CRIAR'`). É o
  conserto de verdade, e é **irreversível sobre dado histórico** — reescreve o que o sistema
  afirma ter registrado, que é exatamente o que uma trilha de auditoria não pode sofrer. Esta
  etapa normaliza **na exibição** e deixa o dado intacto; a migração vai para a letra B com o
  mapa pronto. Enquanto isso o filtro por rótulo manda **todos os verbos daquele grupo**, então
  o usuário não perde linha nenhuma por causa da inconsistência.
- **Padronizar os verbos nas escritas NOVAS** — tocar em ~45 call sites em `routes/` e
  `services/` é outra etapa, e feita junto com esta faria a tela e o dado mudarem no mesmo
  commit, sem como saber qual dos dois quebrou se algo quebrasse.
- **Exportar XLSX da trilha** — o módulo já tem export genérico nos relatórios; enxertar aqui
  duplicaria a régua. Se a demanda aparecer, a trilha vira uma chave do `reportRegistry`.
- **O volume do log de permissões (G8)** — a tela vai *exibir* essas linhas de 46 KB, e isso
  torna o problema visível, que é um progresso. Reduzir o que se grava é mudança de contrato de
  auditoria (o que deixa de ser registrado?), decisão da letra B.
- **Retenção/expurgo do log** — sem política definida pelo cliente, apagar trilha é a última
  coisa que se implementa por conta própria.

## Regras de negócio (RN)

- **RN-01 — A trilha tem tela, com o mesmo gate do dado.** `/almoxarifado/auditoria` só
  responde para quem passa em `requirePermission('configurar')`; quem não passa vê o painel de
  sem-permissão do módulo, não uma tela vazia (vazia é indistinguível de "não há registros").
- **RN-02 — Quatro filtros novos, combináveis:** `usuario_id`, `acao`, `data_inicio`,
  `data_fim`. Combinados por `AND` com os dois que já existem.
- **RN-03 — Data inválida é 400, não filtro ignorado.** `data_inicio=ontem`,
  `data_inicio=2026-13-45` **e `data_fim=2026-02-30`** → **400**
  `'Data inválida: use uma data real no formato AAAA-MM-DD'`. Hoje a rota aceita qualquer coisa
  e o SQLite compara string com string: `'ontem'` não casa nada e a tela mostraria "nenhum
  registro", que é a **resposta errada mais perigosa numa auditoria** — parece prova de que
  nada aconteceu.
  **O 30 de fevereiro entrou aqui pela revisão da Fase 2, que reproduziu o segundo modo de
  falha:** `Date.parse('2026-02-30')` é **válido** em JS (rola para 02/03), e o SQLite também
  rola — `date('2026-02-30','+1 day')` = `'2026-03-03'`. Não dá lista vazia, dá **janela
  alargada em silêncio**: uma consulta de fevereiro devolvendo três dias de março. A régua que
  fecha é o ida-e-volta: `new Date(v + 'T00:00:00Z').toISOString().slice(0,10) === v`.
  A mensagem fala em "data real" porque `2026-13-45` **está** no formato pedido — a versão
  anterior mentia para metade dos casos que ela mesma listava.
- **RN-04 — O período é inclusivo nos dois extremos, no fuso de quem pergunta.**
  `data_fim=2026-08-28` inclui o dia 28 inteiro **do horário de Brasília**.
  **CORREÇÃO — esta RN consertava metade do problema e a metade errada.** Ela dizia que bastava
  `< data_fim + 1 dia` porque a coluna é DATETIME. Isso está certo como comparação de string, e
  a revisão da Fase 2 reproduziu que **não basta**: `created_at DATETIME DEFAULT
  CURRENT_TIMESTAMP` grava em **UTC** (medido: `date` = 19:45 -03, `CURRENT_TIMESTAMP` =
  `'2026-08-28 22:45:51'`). O dia recortado seria o dia **UTC**, então um ato registrado às
  **21:30 de 28/08** vira `'2026-08-29 00:30'` e **não aparece** num filtro de 28/08 — o
  sintoma exato que a RN dizia estar corrigindo, sobrevivendo à correção por outra causa. Três
  horas de todo fim de expediente sumiriam da trilha.
  A régua é converter os dois limites de dia local para instante UTC **antes** do SQL, em
  função pura (`janelaUtc`), e a coluna é comparada com esses limites. O teste **fixa o
  `created_at` do arranjo** em vez de usar `CURRENT_TIMESTAMP` — senão o cenário fica verde de
  dia e vermelho entre 21h e meia-noite, e a próxima sessão vai depurar o SQL em vez do fuso.
  **PRECISÃO DA EXECUÇÃO (Task 2) — esta RN dizia "fuso de quem pergunta" sem dizer de onde ele
  sai, e a leitura óbvia teria refeito o defeito.** `new Date(ano, mes-1, dia)` usa o fuso do
  **processo**, o que passa em qualquer máquina de dev brasileira e vira **no-op num contêiner
  com `TZ=UTC`** — o default da maioria dos deploys. O fuso do recorte é o do **negócio** (site
  único, no Brasil) e por isso é constante do módulo (`FUSO_PADRAO`), com terceiro parâmetro
  opcional; o offset sai do `Intl`, então horário de verão é respeitado por data em vez de
  tabela fixa. Há cenário que troca o `TZ` do processo para `UTC` e `Asia/Tokyo` e exige a mesma
  janela.
- **RN-05 — Os selects vêm do banco.** `GET /auditoria/opcoes` devolve
  `{ entidades: [], acoes: [], usuarios: [{id, nome}] }` com os valores **distintos realmente
  presentes**. Lista hardcoded envelheceria no primeiro `entidade` novo — e as etapas 18-20
  criaram seis.
- **RN-06 — Sinônimo não divide a lista.** `CRIACAO` e `CRIAR` aparecem como **uma** opção
  ("Criação"); ao filtrar, o backend recebe os dois valores e devolve as linhas dos dois.
  A tela **não esconde** que o dado é inconsistente: a linha exibe o verbo real como legenda
  secundária.
- **RN-07 — O de/para mostra o que mudou, não o JSON.** A linha expande e lista uma entrada por
  campo (`nome: "Parafuso" → "Parafuso M8"`), calculada **no servidor** e entregue no item como
  `alteracoes: [{ campo, de, para }]`.
  **CORREÇÃO — esta RN mandava calcular com `configDiff.calcularDiff`, "fonte única". ESTAVA
  ERRADA, e era o defeito mais grave deste design; a revisão da Fase 2 reproduziu os três
  modos de falha.** `calcularDiff` foi escrita para o `PUT /configuracoes`, onde `anteriores` é
  a tabela inteira e `novos` é o payload; o cabeçalho dela (`configDiff.js:9-13`) diz que itera
  `Object.keys(novos)` e **ignora de propósito** chave que existe só em `anteriores`. As linhas
  de auditoria não têm essa forma — `dados_novos` mistura campos mudados com campos de
  contexto, e `dados_anteriores` é um recorte às vezes disjunto. Reproduzido:
  1. **Some com a mudança do segredo.** A Etapa 19 já grava o diff mascarado, então quando a
     senha muda os **dois** lados valem `'(alterado)'`; rediffar cai no `if (String(bruto) ===
     String(novo)) continue` e a chave **desaparece**. A tela mostraria `dias: 30 → 45` e
     esconderia que a senha foi trocada — o oposto exato da RN-08.
  2. **Inventa ato que não houve.** Numa exclusão de requisição
     (`ant={status:PENDENTE}`, `nov={numero:REQ-1, estornos:2}`) sai
     `numero: — → REQ-1` e `estornos: — → 2` como se fossem alterações, e o `status` anterior
     — o único de/para real da linha — é **descartado**. Numa trilha de auditoria, isso é
     afirmar que a pessoa fez algo que ela não fez.
  3. **Sujeira no próprio alvo do teste de integração.** A foto de material grava
     `dados_novos: { foto, codigo, nome }`, então dois campos que não mudaram apareceriam como
     alteração.
  A régua de **leitura** é outra, e é dela que a etapa precisa: **união das chaves dos dois
  lados**, `null` explícito para "ausente", **nenhum remascaramento**, e lista vazia quando os
  dois lados são vazios (há call sites que gravam nenhum dos dois — `receiptService.js:236-239`,
  os 5 verbos de transição). `configDiff` continua sendo fonte única **da gravação**; leitura e
  gravação são problemas diferentes e forçá-las na mesma função foi o erro.
- **RN-08 — Segredo não desmascara na tela.** O log já grava `'(alterado)'` para as chaves
  secretas e a URL do webhook sem a query string (Etapa 19). A tela **exibe o que está
  gravado** e não tenta embelezar — se um dia alguém gravar segredo cru, o lugar de consertar é
  a escrita, não a leitura.
- **RN-09 — A trilha é somente leitura.** Nenhuma rota de edição ou exclusão de linha de
  auditoria, e a tela não oferece nenhuma. Dito aqui porque é o tipo de "faltou CRUD" que uma
  sessão futura poderia achar que é lacuna.

## Arquitetura

- **`services/almoxarifado/auditLabels.js`** (novo, função pura — o padrão de `alertRegistry` e
  `configDiff`): `ROTULOS_ENTIDADE`, `GRUPOS_ACAO` (rótulo → lista de verbos crus),
  `rotularAcao(verbo)`, `verbosDoGrupo(rotulo)`, e `alteracoesDaLinha(anteriores, novos)` — a
  régua de **leitura** da RN-07 (união das chaves, `null` para ausente, sem remascarar).
  Testável sem HTTP.
- **`services/almoxarifado/auditFiltros.js`** (novo, função pura): `validarData(v)` e
  `janelaUtc(dataInicio, dataFim)` → `{ de, ate }` já em UTC (RN-03 e RN-04). Separado dos
  rótulos porque é outro assunto — um traduz vocabulário, o outro resolve fuso.
- **`extended.js:1337`** — os quatro filtros, a validação de data e o `DISTINCT` da rota de
  opções. A forma da resposta **não muda** (`{total, limite, offset, truncado, itens}`,
  congelada na Etapa 18), mas **cada item ganha três campos derivados**: `acao_rotulo`,
  `entidade_rotulo` e `alteracoes`. Isso é o que cumpre de verdade a promessa de que **a tela
  não repete tradução nenhuma** — a versão anterior deste design afirmava isso e entregava um
  item sem rótulo nenhum, obrigando a tela a remontar o mapa a partir de `/opcoes` (achado A9).
  Com o cálculo no servidor, a régua de leitura tem **um** dono e é testável sem React.
- **`schema.js`** — três índices `CREATE INDEX IF NOT EXISTS` (padrão desta base, idempotente,
  sem ledger): `(created_at)`, `(entidade, entidade_id)` e `(usuario_id)`.
- **`client/src/components/almoxarifado/AuditoriaAlmoxarifado.js`** — tela, molde de
  `AlertasAlmoxarifado.js` (Etapa 16); rota lazy em `routes/lazyModules.js`, `<Route>` em
  `App.js`, item de menu em `Layout.js`. **Com `adminOnly`** no menu — ao contrário de
  alertas/notificações/relatórios, aqui o gate do backend é `configurar`, que é admin de fato;
  deixar o item visível para o chão de fábrica só produziria 403.

## Testes

- `auditLabels.api.test.js`: RN-06 (sinônimos no mesmo grupo, ida e volta `rotular`/`verbosDo`),
  e a asserção de **cobertura**: todo verbo que aparece em `routes/` e `services/` tem grupo —
  se alguém criar um verbo novo sem rótulo, este teste cai (é o molde do `alertRegistry`, que
  já mata "alerta novo esquece o registro").
- `auditoriaFiltros.api.test.js`: RN-02 (cada filtro isolado e dois combinados), RN-03 (400 nas
  duas formas de data inválida, **com asserção de que a coluna não foi consultada com lixo** —
  ou seja, 400 e não 200 vazio), RN-04 (**ato gravado hoje aparece com `data_fim` = hoje** — o
  cenário que pega o erro de limite), RN-05 (opções refletem o que foi gravado no teste).
- **Integração cruzando galhos:** gravar por uma rota REAL de escrita (trocar a foto de um
  material, que a Etapa 20 instrumentou) e **ler pela tela-contrato** com filtro de usuário +
  período, conferindo o de/para. Verde por unidade não prova que a trilha fecha ponta a ponta.
- `AuditoriaAlmoxarifado.test.js` (client): filtro dispara nova busca; `truncado` mostra o
  aviso de corte; expandir mostra o de/para.
- Controle positivo obrigatório em cada um, **commitado antes de sabotar**.

## O que muda em cada camada

| Camada | Mudança |
|---|---|
| `services/almoxarifado/auditLabels.js` | novo (rótulos + grupos de sinônimo, função pura) |
| `services/almoxarifado/schema.js` | 3 índices na tabela de auditoria |
| `routes/almoxarifado/extended.js` | 4 filtros + validação de data no GET; rota `/auditoria/opcoes` |
| `client/.../AuditoriaAlmoxarifado.js` | novo (tela) |
| `client/src/App.js`, `routes/lazyModules.js`, `components/Layout.js` | rota + menu (`adminOnly`) |
| `specs/23` | B33 sai de pendência aberta para entregue |
