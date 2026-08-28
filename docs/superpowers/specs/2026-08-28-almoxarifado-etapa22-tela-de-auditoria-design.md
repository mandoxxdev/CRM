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
- **RN-03 — Data malformada é 400, não filtro ignorado.** `data_inicio=ontem` ou
  `data_inicio=2026-13-45` → **400** `'Data inválida: use o formato AAAA-MM-DD'`. Hoje a rota
  aceita qualquer coisa e o SQLite compara string com string: `'ontem'` não casa nada e a tela
  mostraria "nenhum registro", que é a **resposta errada mais perigosa numa auditoria** —
  parece prova de que nada aconteceu.
- **RN-04 — O período é inclusivo nos dois extremos.** `data_fim=2026-08-28` inclui o dia 28
  inteiro. A coluna é DATETIME (`'2026-08-28 14:30:00'`), então comparar com `<= '2026-08-28'`
  excluiria o dia todo — a régua é `< '2026-08-29'`, ou seja, `data_fim` mais um dia.
  (Este é o mesmo tipo de erro de fuso/limite que a Etapa 16 corrigiu na exibição de datas
  DATE-only; aqui ele apareceria como "o ato de hoje não está na trilha".)
- **RN-05 — Os selects vêm do banco.** `GET /auditoria/opcoes` devolve
  `{ entidades: [], acoes: [], usuarios: [{id, nome}] }` com os valores **distintos realmente
  presentes**. Lista hardcoded envelheceria no primeiro `entidade` novo — e as etapas 18-20
  criaram seis.
- **RN-06 — Sinônimo não divide a lista.** `CRIACAO` e `CRIAR` aparecem como **uma** opção
  ("Criação"); ao filtrar, o backend recebe os dois valores e devolve as linhas dos dois.
  A tela **não esconde** que o dado é inconsistente: a linha exibe o verbo real como legenda
  secundária.
- **RN-07 — O de/para mostra o que mudou, não o JSON.** A linha expande e lista uma entrada por
  campo alterado (`nome: "Parafuso" → "Parafuso M8"`), calculada com o mesmo
  `configDiff.calcularDiff` que a Etapa 19 usa para *gravar* o diff das configurações — fonte
  única, não uma segunda régua de comparação.
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
  `rotularAcao(verbo)`, `verbosDoGrupo(rotulo)`. Testável sem HTTP. **O mapa é a fonte única**:
  a tela não repete tradução nenhuma, recebe do servidor.
- **`extended.js:1337`** — os quatro filtros, a validação de data e o `LEFT JOIN`/`DISTINCT`
  da rota de opções. A forma da resposta (`{total, limite, offset, truncado, itens}`)
  **não muda** — foi congelada na Etapa 18 e agora ganha o primeiro consumidor.
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
