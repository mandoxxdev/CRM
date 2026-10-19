# Etapa 158 (Comercial): a coordenada do endereço guardada no cadastro do cliente, o resumo por tipo de viagem sem caixa e o histórico sem trocas falsas nos custos de viagem (C377 — e o resumo da D (157) e a M7 da 157) — plano

> Origem: "Próxima tarefa detalhada — Etapa 158" do plano da 157
> (`docs/superpowers/plans/2026-10-19-almoxarifado-etapa157-edicao-do-custo-de-viagem-e-cidades-do-client.md`). Etapa pequena; o design, com a
> Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-19): última B **B1007**, último C **C377**,
> última A **A103**. Esta etapa: **B1008+**, **C378+**, **A104+**. Worktree `CRM-wt-e158`, branch `etapa-e158` (da main `99781bd0`).
>
> **Fase 2 (um revisor fresco, só leitura, ANTES do código — `scratchpad/e158/fase2-revisao.md`): 0 Critical, 5 Important, 13 Minor — todos
> aceitos.** A Fase 0 confere (duas frases frouxas: M9, M10). **I1** esperar o `UPDATE` da memória punha a resposta atrás da fila de escrita
> (até 30 s com o banco ocupado — desfaria o prazo da C361): **responde primeiro e grava sem esperar**, com o erro no log (**B1009**). **I2** o
> erro ao gravar sem teste — cenário com `FALHA_SQL_INJETADA` no `UPDATE` (200 com a coordenada do serviço, o processo vivo, nada gravado, a
> seguinte consulta) e no `SELECT` (o 500 literal). **I3** o filtro *Tipo de viagem* da lista dos custos é ignorado pelo servidor (`GET
> /custos-viagens` nem lê `tipo_viagem`) — entra como **RN-158.07**. **I4** o "nenhuma linha no histórico" passaria vazio (o PUT responde antes
> do INSERT) — um PUT real em seguida e esperar a linha dele. **I5** o `updated_at` passaria vazio (resolução de segundo) — gravar
> `2000-01-01 00:00:00` antes. **M1** o termo mantém a guarda por verdade (`"   "` consulta, como hoje). **M2** a rota lê `SELECT *` (a ALTER que
> falhou não deixa a rota em 500 para sempre). **M3** o POST ecoa o corpo (de antes, C). **M4** a frase do "voltar ao anterior". **M5** a memória
> exige o termo atual não nulo e `geo_termo` texto. **M6** o `UPDATE` da memória só grava se o endereço ainda é o lido. **M7** número é só
> `/^s*-?d+(.d+)?s*$/` (e vazio/nulo/ausente = 0). **M8** as trocas reais do legado em C. **M11** T3 cria o próprio custo. **M-mig** a regex do
> log com `no such column|duplicate column`, o banco antigo com o CREATE exato, controle positivo. **T4** manda o objeto do GET mais um `geo_*`
> forjado e confere o banco.

## Fase 0 — medido (antes de qualquer código)

### C377 — a coordenada do endereço é pedida ao serviço de mapas a cada abertura

- **Um chamador só** de `obterCoordenadasExatas` (a função que consulta o serviço de mapas): `GET /api/custos-viagens/coordenadas-cliente/:cliente_id`
  (`server/index.js:15357`). Os outros nove usos (em seis rotas) de coordenada no `index.js` (próximos, visitas, mapa de clientes, rota, análise) usam só
  `obterCoordenadasCidade` (a lista local, sem rede) — não mudam.
- **Quem chama a rota:** só o client `client/src/utils/coordenadasDoCliente.js` (desde a 157, para todo cliente com id — sem endereço, o
  servidor responde pela cidade sem consultar o serviço). Consumo: a tela dos custos (escolher o cliente, os próximos já vêm com coordenada) e a
  *Preview da Rota*.
- **Os caminhos que gravam o endereço do cliente** (`endereco`, `cidade`, `estado`): `POST /api/clientes` (`index.js:4437`, colunas
  explícitas) e `PUT /api/clientes/:id` (`index.js:5287`, `montarSetParcial` com lista branca — campo fora da lista é ignorado). O logo
  (`POST /clientes/:id/logo`) e o inativar (`DELETE`) não tocam no endereço. **Nenhuma importação de clientes** no servidor (procurado
  `INSERT INTO clientes`/`UPDATE clientes` em `server/` fora dos testes: só esses quatro).
- **A tabela:** `CREATE TABLE IF NOT EXISTS clientes` em `index.js:1234`, **sem callback**, dentro de `initializeDatabase` (antes do
  `db.serialize` da linha 2392). O único `ALTER TABLE clientes` (o `logo_url`, linha 2478) mora no `db.serialize`, solto — funciona hoje
  porque o `serialize` vem depois; o padrão da casa para coluna nova é o ALTER **no callback do CREATE** (memória *prova de primeiro boot*).
- **As leituras que devolveriam colunas novas:** `GET /api/clientes` (`SELECT *`, `index.js:4346` — portão das listas, que admite também o
  Almoxarifado e o Operacional) e `GET /api/clientes/:id` (`SELECT *`, portão do Comercial). Nenhuma outra rota faz `SELECT *`/`c.*` de
  `clientes` (as oito com `FROM clientes c` listam colunas).
- **O termo da consulta** é montado dentro de `geocodificarEndereco`: `` `${endereco}, ${cidade}, ${estado}, Brasil` `` com os espaços repetidos
  num só e as pontas aparadas; a consulta só sai com os três preenchidos. A resposta boa é `[lat, lon]`; a falha (prazo, não 200, não JSON,
  lista vazia, lat/lon não numéricos, erro de rede) é `null`, e aí `obterCoordenadasExatas` cai na cidade.
- **Os testes que tocam na rota:** `coordenadasPrazo.api.test.js` (o `index.js` montado com `NOMINATIM_URL` num servidor local; o cenário de
  integração faz pendurado → responde → 429 **no mesmo cliente** e espera, no 429, a coordenada de Campinas — **com a memória, o 429 deixa de
  ser consultado** e o cenário muda de ordem) e `custosViagensPortao.api.test.js` (clientes sem endereço, sem `NOMINATIM_URL` — nenhuma
  consulta externa).

### O resumo por tipo de viagem

- `GET /api/custos-viagens/resumo` (`index.js:15850`): `SUM(CASE WHEN tipo_viagem = 'ida' ...)`, `'volta'`, `'ida_e_volta'`. O `POST` e o `PUT`
  gravam o tipo por `normalizarMaiusculas` (**`IDA`, `VOLTA`, `IDA_E_VOLTA`**) — então os três totais dão **0** para todo custo gravado pela tela
  hoje; só um legado em minúsculas (ou o padrão `'ida_e_volta'` quando o tipo não vem no corpo) conta. Nenhuma tela lê os três totais (a
  `CustosViagens` usa os quatro cartões: total, geral, médio, clientes) — D (157).

### O histórico falso "50 → 50.00"

- `PUT /api/custos-viagens/:id` (`index.js:16156`) compara cada campo por `String(atual || '') !== String(novo || '')`. As colunas de valor são
  `REAL` (`distancia_km`, `tempo_estimado_horas`, os quatro custos, `total_custo`, `custo_sugerido`) e `INTEGER` (`numero_pessoas`, a 2832); o
  SQLite converte `"50.00"` em `50` ao gravar, mas a comparação vê `"50"` × `"50.00"` e registra uma mudança. **A tela manda texto com duas
  casas** sempre que o recálculo preenche ou o Aplicar põe os valores (`valoresDaRota`, `toFixed(2)` — 157) e quando a pessoa digita
  `50.00` (os campos são `type=number` — Fase 2 M9); o Atualizar sem mexer não gera histórico (os valores vêm do banco como número — 157 r1). Consequência: o *Histórico de
  Alterações* do custo mostra trocas que não aconteceram (e uma linha inteira de histórico quando nada mudou de verdade).
- **De antes, não desta etapa (declarar em C):** sem `tipo_viagem` no corpo, o `PUT` grava `'ida_e_volta'` em minúsculas (o padrão não passa
  pelo `normalizarMaiusculas`) — a tela sempre manda o tipo.

## Regras de negócio

- **RN-158.01 (C377)** — `GET /custos-viagens/coordenadas-cliente/:id` do cliente com **endereço, cidade e estado** preenchidos: se o cadastro
  guarda uma coordenada (`geo_lat`, `geo_lon` números finitos) **e** o termo que a gerou (`geo_termo`) é **igual** ao termo do endereço atual,
  responde a guardada **sem consultar o serviço de mapas**. Senão consulta; a resposta boa é **gravada** no cadastro (as três colunas) e
  respondida; **a falha não grava** (responde a coordenada da cidade, como antes, e a próxima abertura consulta de novo). O cliente sem um dos
  três (por verdade, como hoje — `"   "` consulta, Fase 2 M1) não consulta nem grava, e a memória antiga não vale para ele (M5). Gravar a
  coordenada **não** mexe no `updated_at` do cliente (é memória, não edição) e **não atrasa a resposta**: a rota responde e grava depois, sem
  esperar (Fase 2 I1, **B1009**); o `UPDATE` só grava se o endereço, a cidade e o estado ainda são os lidos (M6). Um erro ao gravar não muda a
  resposta (fica no log, o processo segue — I2). A rota lê o cliente por `SELECT *` (M2: se a migração tiver falhado, ela funciona sem memória).
- **RN-158.02 (C377)** — **A memória vale só para o endereço que a gerou.** O termo é o mesmo que vai ao serviço de mapas (uma função só,
  `termoDaConsulta`); qualquer mudança no endereço, na cidade ou no estado — pelo `PUT /clientes/:id`, ou por fora — muda o termo e a próxima
  abertura consulta de novo (e regrava). Mudar outro campo (telefone, razão social...) mantém a memória. Só a **última coordenada gravada** é lembrada:
  voltar a um endereço consulta de novo se outro já foi gravado depois (Fase 2 M4). Espaços repetidos no endereço não mudam o termo (como não mudam a consulta).
- **RN-158.03 (contrato)** — Nada muda para quem chama: `coordenadas-cliente` continua `200 { coordenadas, lat, lon }` (da memória ou não), `403`
  do portão, `404 { error: 'Cliente não encontrado' }`, `500 { error }` só com erro do banco na leitura. As colunas novas **não saem** em
  `GET /clientes` nem em `GET /clientes/:id` (as duas com `SELECT *`) — a coordenada do endereço fica atrás do portão do Comercial, como a rota
  que a produz (**B1008**). `POST /clientes` e `PUT /clientes/:id` **ignoram** `geo_lat`/`geo_lon`/`geo_termo` no corpo (lista branca — nenhum
  campo novo gravável).
- **RN-158.04 (migração)** — As três colunas (`geo_lat REAL`, `geo_lon REAL`, `geo_termo TEXT`) entram por `ALTER TABLE clientes ADD COLUMN` **no
  callback do `CREATE TABLE IF NOT EXISTS clientes`**, em sequência; "duplicate column" é ignorado. Prova: primeiro boot em **pasta vazia** e
  boot sobre um **banco antigo** (a tabela `clientes` sem as colunas, com um cliente com endereço) — 0 `no such table`/`no column named` no log,
  as três colunas no `PRAGMA table_info`, o cliente intacto, e um **segundo boot** na mesma pasta sem erro (idempotente). O dado novo é só
  memória: apagá-lo (pôr `NULL`) só faz a próxima abertura consultar de novo.
- **RN-158.05 (D (157))** — O resumo (`GET /custos-viagens/resumo`) soma `custo_ida`, `custo_volta` e `custo_ida_volta` pelo tipo **sem caixa e
  sem espaço nas pontas** (`LOWER(TRIM(tipo_viagem))`): o custo gravado como `IDA_E_VOLTA` conta em `custo_ida_volta` (antes, 0); o legado em
  minúsculas continua contando. Os outros campos do resumo não mudam.
- **RN-158.06 (M7 da 157)** — No `PUT /custos-viagens/:id`, os campos de valor (`numero_pessoas`, `distancia_km`, `tempo_estimado_horas`,
  `custo_transporte`, `custo_hospedagem`, `custo_alimentacao`, `custo_outros`, `total_custo`, `custo_sugerido`) comparam **como número** quando os
  dois lados são números — número é `number` finito ou texto `/^s*-?d+(.d+)?s*$/` (`"50.00"` = `50`; `"0x1A"`, `"1e3"` não — Fase 2 M7);
  vazio, nulo e ausente = 0, como já era pelo `|| ''`; se um lado não é número, compara
  como texto (como antes). `"50.00"` sobre `50` → **nenhuma** mudança, e, sem nenhuma, **nenhuma linha** no histórico. `"60"` sobre `50` → a
  mudança registrada (`valor_anterior` 50, `valor_novo` "60"). Os outros campos comparam como antes. O que se grava no custo não muda.

- **RN-158.07 (Fase 2 I3)** — `GET /api/custos-viagens?tipo_viagem=ida|volta|ida_e_volta` (o filtro *Tipo de viagem* da lista, que a tela já
  manda e o servidor ignorava): filtra pelo tipo **sem caixa e sem espaço** (`LOWER(TRIM(cv.tipo_viagem)) = LOWER(TRIM(?))`); vazio ou ausente,
  sem filtro (como hoje).

## Contratos

- `GET /api/custos-viagens/coordenadas-cliente/:cliente_id` — **inalterado** (ver RN-158.03). Novo só o efeito: grava `geo_lat`, `geo_lon`,
  `geo_termo` no cliente quando consulta e a consulta responde.
- `GET /api/clientes`, `GET /api/clientes/:id` — inalterados (as colunas novas são tiradas da resposta).
- `GET /api/custos-viagens/resumo` — mesmo formato; `custo_ida`/`custo_volta`/`custo_ida_volta` passam a somar o tipo gravado em maiúsculas.
- `PUT /api/custos-viagens/:id` — mesma resposta (`200 { message: 'Custo de viagem atualizado com sucesso' }`, `404 { error: 'Viagem não
  encontrada' }`, `500`); muda só o que entra no histórico.
- `GET /api/custos-viagens` — mesmo formato; `tipo_viagem` passa a filtrar (RN-158.07).
- **Nenhuma mensagem nova.** Nenhuma tela muda.

## Tasks (sort topológico)

- [ ] **T1 (tronco — servidor: migração + serviço + rota) — RN-158.01..04.**
  `server/services/coordenadas.js`: `termoDaConsulta(endereco, cidade, estado)` → o termo (ou `null` sem um dos três), usado por
  `geocodificarEndereco` (a mesma string de hoje — o teste do C371 prende) e exportado; `coordenadaGuardadaValida(cliente, termo)`.
  `server/index.js`: as três colunas no callback do `CREATE` de `clientes`; a rota lê `id, endereco, cidade, estado, geo_lat, geo_lon,
  geo_termo`; com termo e memória válida → responde; com termo → `geocodificarEndereco`; boa → `UPDATE clientes SET geo_lat = ?, geo_lon = ?,
  geo_termo = ? WHERE id = ?` (sem `updated_at`), espera o `UPDATE` e responde; falha → a cidade, sem gravar; `GET /clientes` e `/clientes/:id`
  tiram as três colunas da resposta (um helper `semCoordenadaGuardada`).
  Teste no `coordenadasPrazo.api.test.js` (o `index.js` montado, `NOMINATIM_URL` local — **nunca** o Nominatim de verdade): (a) duas chamadas
  no mesmo cliente com o serviço respondendo → **1** pedido à fronteira, as duas respostas iguais, o banco com as três colunas e o termo da
  consulta; (b) `PUT /clientes/:id` só com o telefone → a próxima chamada **0** pedidos; (c) `PUT` com outro endereço → **1** pedido com o
  termo novo, a coordenada nova gravada; a seguinte **0**; (d) voltar ao endereço anterior → **1** pedido; (e) endereço mudado **por fora**
  (`UPDATE` no banco) → **1** pedido; (f) o serviço pendurado, 429, lista vazia: a cidade, **nada gravado** (as três colunas `NULL` no banco) e
  a chamada seguinte consulta de novo (1 pedido em cada); (g) o cliente sem endereço → 0 pedidos e nada gravado; (h) `GET /clientes` e
  `/clientes/:id` sem `geo_lat`/`geo_lon`/`geo_termo` (e com a razão social — a metade positiva), e o `PUT`/`POST` com `geo_lat` no corpo não
  grava; (i) o `updated_at` do cliente não muda ao gravar a memória; (j) a memória com `geo_lat` não numérico (gravada por fora) não vale →
  consulta. O cenário de integração da 156 muda de ordem (pendurado → 429 → responde, num cliente sem memória) — **divergência declarada**: o
  429 depois do responde hoje passaria a ser da memória.
  Migração: `coordenadaGuardadaMigracao.api.test.js` (arquivo novo): sobe o `index.js` (a) numa pasta vazia → as três colunas no `PRAGMA`, 0
  `no such table|no column named|SQLITE_ERROR` no log; (b) numa pasta com um `database.sqlite` antigo (só `clientes`, sem as colunas, com um
  cliente com endereço e um `updated_at` conhecido) → as colunas entram, o cliente intacto (todos os campos de antes iguais), log limpo; a rota
  responde e grava a memória; (c) um segundo boot na mesma pasta → log limpo, a memória ainda lá e a chamada não consulta (0 pedidos).
- [ ] **T2 (galho — servidor) — RN-158.05.** `index.js`: o `CASE WHEN LOWER(TRIM(tipo_viagem)) = '...'` nos três. Teste no
  `custosViagensPortao.api.test.js`: os três totais do resumo **contra o banco** (`SUM(CASE WHEN LOWER(TRIM(tipo_viagem)) = ...)`) e o
  `custo_ida_volta` > 0 com o custo lançado pela rota (gravado `IDA_E_VOLTA`); mais um custo `IDA` lançado e um legado `'volta'` em minúsculas
  gravado por fora → cada total com o seu.
- [ ] **T3 (galho — servidor) — RN-158.06.** `index.js`: no `PUT /custos-viagens/:id`, `mesmoValor(campo, atual, novo)` — os nove numéricos
  por número (`Number(x)` finito, vazio/nulo = 0), o resto como hoje. Teste no `custosViagensPortao.api.test.js`: com o custo do preparo
  editado, `PUT` com `"350.00"`, `"80.0"` e `numero_pessoas: "1"` sobre 350/80/1 e o resto igual → **nenhuma** linha nova no histórico; `PUT`
  com `custo_transporte: "360"` → **uma** linha, com só `custo_transporte` (50→... valores certos) e **sem** `total_custo` falso
  (o total muda de verdade — entra); o texto não numérico num campo de valor compara como texto.
- [ ] **T4 (integração — cruza T1 e o cadastro do cliente):** no `coordenadasPrazo`, o fluxo de tela pelas rotas: criar o cliente com endereço
  (`POST /clientes`) → abrir a coordenada (1 pedido) → abrir de novo (0) → editar o cadastro pela rota da tela (`PUT /clientes/:id` com o objeto
  inteiro que o `GET /clientes/:id` devolveu, endereço trocado) → abrir (1 pedido, o termo novo) — o objeto do `GET` não pode trazer as colunas
  de volta no `PUT` (RN-158.03). E o serviço direto: `termoDaConsulta` = o `q` que chega à fronteira.
  Depois a bateria inteira, serial.

Independência: T2 e T3 são regiões disjuntas do `index.js` com regras próprias, mas a etapa é pequena — tudo executado aqui, em sequência (T1 →
T2 → T3 → T4); um executor paralelo em worktree não se paga em três trocas de servidor.

## Pontos de atenção

1. **Nunca** subir o `index.js` num cenário com endereço sem `NOMINATIM_URL` local; o teste de migração também (o cliente antigo tem endereço).
2. A trava de máquina: um `test:api` por vez — os dois arquivos sobem o `index.js` (porta livre, pastas temporárias próprias).
3. O `coordenadasPrazo` tem cenários que dependem da ordem (o 156 da integração, o próximo de SP). Clientes novos por cenário para a memória não
   vazar de um para o outro.
4. A primeira boa resposta grava; duas aberturas simultâneas do mesmo cliente sem memória consultam as duas (aceito — memória, não fila; D).
5. **Declarar em D:** a memória não expira por tempo (o endereço não mudou → a coordenada não muda); quem quiser forçar nova consulta põe
   `NULL` nas colunas (A, se o P.O. pedir — nenhuma consulta obrigatória antes do deploy); duas aberturas simultâneas consultam as duas.
