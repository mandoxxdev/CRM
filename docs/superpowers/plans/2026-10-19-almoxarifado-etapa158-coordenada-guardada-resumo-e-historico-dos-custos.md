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
> `/^\s*-?\d+(\.\d+)?\s*$/` (e vazio/nulo/ausente = 0) — **estava estreita demais** (Fase 5 r1 M1: `".5"` e `"1e3"`, que o banco grava como
> número, continuavam troca falsa); a régua final é a do que o SQLite grava como número, com igualdade exata (RN-158.06). **M8** as trocas reais do legado em C. **M11** T3 cria o próprio custo. **M-mig** a regex do
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
  dois lados são números — número é `number` finito ou texto `/^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/` com valor finito (o que
  o SQLite grava como número numa coluna REAL/INTEGER: `"50.00"` = `50`, `".5"` = `0.5`, `"1e3"` = `1000`, `" 50 "` = `50`; `"0x1A"` não), e a
  igualdade é **exata** (**B1010**); vazio, nulo e ausente = 0, como já era pelo `|| ''`; se um lado não é número, compara como texto (como
  antes). *(Esta RN dizia `/^\s*-?\d+(\.\d+)?\s*$/` com tolerância de 1e-9 — **estava errada** nas duas pontas: a régua deixava `".5"` e `"1e3"`
  como troca falsa (Fase 5 r1 M1) e a tolerância escondia a troca `50 → 50.0000000001` que o banco grava (Fase 5 r2 S1).)* `"50.00"` sobre `50` → **nenhuma** mudança, e, sem nenhuma, **nenhuma linha** no histórico. `"60"` sobre `50` → a
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

- [x] **T1 (`f677e0a6`, Fase 5 `858055df`) (tronco — servidor: migração + serviço + rota) — RN-158.01..04.**
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
- [x] **T2 (`6f050dc9`, com a RN-158.07; Fase 5 `858055df`) (galho — servidor) — RN-158.05.** `index.js`: o `CASE WHEN LOWER(TRIM(tipo_viagem)) = '...'` nos três. Teste no
  `custosViagensPortao.api.test.js`: os três totais do resumo **contra o banco** (`SUM(CASE WHEN LOWER(TRIM(tipo_viagem)) = ...)`) e o
  `custo_ida_volta` > 0 com o custo lançado pela rota (gravado `IDA_E_VOLTA`); mais um custo `IDA` lançado e um legado `'volta'` em minúsculas
  gravado por fora → cada total com o seu.
- [x] **T3 (`af67f3c8`, Fase 5 `858055df`) (galho — servidor) — RN-158.06.** `index.js`: no `PUT /custos-viagens/:id`, `mesmoValor(campo, atual, novo)` — os nove numéricos
  por número (`Number(x)` finito, vazio/nulo = 0), o resto como hoje. Teste no `custosViagensPortao.api.test.js`: com o custo do preparo
  editado, `PUT` com `"350.00"`, `"80.0"` e `numero_pessoas: "1"` sobre 350/80/1 e o resto igual → **nenhuma** linha nova no histórico; `PUT`
  com `custo_transporte: "360"` → **uma** linha, com só `custo_transporte` (50→... valores certos) e **sem** `total_custo` falso
  (o total muda de verdade — entra); o texto não numérico num campo de valor compara como texto.
- [x] **T4 (`f677e0a6`, no mesmo commit da T1 — o cenário RN-158.03 do `coordenadasPrazo`) (integração — cruza T1 e o cadastro do cliente):** no `coordenadasPrazo`, o fluxo de tela pelas rotas: criar o cliente com endereço
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

## Execução (o que divergiu do plano)

- **Tudo em sequência, aqui** (como o plano previa): T1 (com a T4 no mesmo arquivo de teste) → T2 (com a RN-158.07, que a Fase 2 acrescentou) →
  T3. **0** retrabalho entre tasks. Os testes foram escritos antes do código (vermelhos medidos: `coordenadasPrazo` 14/6 — *"no such column:
  geo_lat"*; a migração 0/4; o portão 8/2 — o resumo com `custo_ida_volta` sem o lançado e o histórico com *"numero_pessoas 1 → 1.0"*).
- **Divergências:** (1) a RN-158.01 previa "espera o `UPDATE` e responde" — a Fase 2 I1 inverteu antes do código (responde e grava depois,
  **B1009**); (2) o teste do `updated_at` (i) foi feito com o `2000-01-01 00:00:00` gravado por fora (Fase 2 I5); (3) o "nenhuma linha no
  histórico" com a troca real em seguida (Fase 2 I4); (4) o T3 cria o próprio custo (M11); (5) o cenário do `SELECT` que falha (Fase 2 I2) **não
  foi escrito na T1** — a Fase 5 achou (r1 M3, r3 R22) e ele entrou na correção.
- **Controles positivos (K1–K16, todos caíram pela asserção certa):** K1 sem ler a memória → 4 cenários; K2 sem a guarda do endereço no
  `UPDATE` → o M6; K3 com `updated_at` no `UPDATE` → o (i); K4/K4b sem a checagem dos números (lat; só lon) → o lixo; **K5c** sem as duas guardas
  do termo → o M5 (*"a memória sem termo valeu"*) — K5 e K5b sozinhas são **equivalentes** (uma cobre a outra); K6/K7 as listas com a linha
  inteira → *"lista mostra geo_lat"*; K8 sem as `ALTER`s → os 4 da migração; K9 o erro de gravação sem log (lançando) → *"o erro não foi para o
  log"* (o processo não cai: o invólucro do banco engole a exceção do callback — **declarado**); K10/K14 o resumo sem `LOWER`/sem `TRIM`; K11/K15
  o filtro exato/sem `TRIM`; K12 a comparação por texto de antes; K16 o sugerido fora da lista.
- **A prova de primeiro boot:** pasta vazia antes da etapa (`boot0`) — 0 `no such table|no column named`; os dois avisos de `duplicate column`
  de `materiais_escritorio` são de antes (fora da régua do teste, que conta só `no such table|no column named|no such column` e as linhas com
  `geo_*`). Depois: o teste de migração prova pasta vazia, banco antigo (o `CREATE` exato de `99781bd0`, sem `logo_url`), segundo boot, o
  `UPDATE` que falha, as `ALTER`s que falham e a leitura que falha.
- **Nenhuma consulta A nova** (as colunas entram sozinhas no primeiro boot; nenhum dado gravado muda).

## Fase 5 — revisão adversarial (três revisores frescos, em paralelo, sob a trava)

- **r1 (regra) — 0 Critical, 0 Important, 3 Minor, reproduzidos.** **M1** *".5"* e *"1e3"* (o banco grava 0,5 e 1000) continuavam troca falsa
  no histórico — a régua da Fase 2 M7 **estava estreita demais**; **M2** um ponto absurdo do serviço (`lat 999`) ficava guardado para sempre;
  **M3** o cenário do `SELECT` que falha (Fase 2 I2) não existia. Conferido certo: a memória, a corrida, o contrato, o resumo, o filtro, nenhuma
  troca real perdida. **Incidente:** o r1 apagou por engano a trava do r3 por volta das 16:03 (o `rmdir` depois de desistir de esperar) — os
  resultados do r3 dessa janela foram verdes e o r3 não relatou falha por prazo; nenhum achado dependeu dela.
- **r2 (autorização) — 0 achados de acesso + 1 Minor reproduzido.** Sonda no `index.js` montado (339 GETs com um marcador em `geo_*`): o ponto só
  sai por `coordenadas-cliente` (Comercial); sem login 401, só Almoxarifado 403, nenhum pedido ao serviço de mapas nem gravação pelo barrado;
  `geo_*` do corpo nunca grava; o filtro é parametrizado (injeção, array, repetido → lista vazia). **S1** a tolerância de 1e-9 escondia do
  histórico a troca `50 → 50.0000000001`, que o banco grava. Observação (de antes): o usuário sem nenhuma permissão passa no portão do Comercial
  como já passava no `PUT /clientes` (o desenho do portão — testes da 152).
- **r3 (sabotagem, worktree própria `CRM-wt-e158-r3`) — 47 sabotagens: 17 caíram, 24 sobreviveram por falta de asserção (todas provadas por
  sonda; R43 só por fora), 5 equivalentes (R09, R13, R14, R26, R28), 1 sobrevivente inalcançável (R12 — as `ALTER`s fora do callback funcionam
  hoje porque o driver executa na ordem; a forma no callback fica, **declarada como não protegida pela suíte**).** As faltas: a tela que não espera
  a gravação (R23 — 24 ms × 4.108 ms com o banco preso); o `volta` em maiúsculas sem `LOWER` (R32 — o mais grave do T2: o teste sobrescrevia o
  único `VOLTA`), os tipos com espaço (R31, R33), o filtro com espaço (R35, R36); a migração que falha (R18 sem o log, R21 as colunas explícitas →
  500 para sempre); o `SELECT` que falha (R22); a cidade e o estado mudados no meio (R25); a régua (R40–R42, R45, R50) e o nulo legado (R43); as
  guardas do termo (R02–R05) e a memória infinita (R08). **Mudaram de natureza com a correção:** R44/R46 (a tolerância do total) — a igualdade
  agora é exata (r2 S1), então o total que muda só no arredondamento entra no histórico (é mudança do valor gravado — **B1010**, custo
  declarado); R47 (`&&` → `||`) ficou **equivalente** com a igualdade exata.
- **Correção da Fase 5 (`858055df`):** a régua do número é a do SQLite com igualdade exata (r1 M1, r2 S1 — **B1010**); o ponto fora da faixa não
  é guardado nem vale da memória (`coordenadaPlausivel` — r1 M2); e as asserções: o banco preso (R23), a cidade e o estado no meio (R25), as
  guardas do termo e a memória infinita (R02–R05, R08), as `ALTER`s que falham (R18, R21), o `SELECT` que falha (R22, r1 M3), o resumo e o
  filtro com fixtures em maiúsculas e com espaço (R31–R36), a régua e o nulo legado (R40–R43, R45, R50), a troca mínima (r2 S1), o ponto
  absurdo (r1 M2). **Controles (todos caíram pelo cenário deles, `scratchpad/e158/controles-f5.out`):** R02, R03, R04, R05 → o das guardas; M2a
  (sem a faixa), M2b (a rota grava sem conferir), **M2c** (a memória sem a faixa) → o do ponto absurdo; R23 → *"a abertura esperou a escrita da
  memoria: 3032 ms"*; R25 → *"gravou o termo velho depois de mudar cidade"*; R18 → *"a falha da coluna geo_lat nao foi para o log"*; R21 → as
  `ALTER`s que falham (500) e a leitura; R22 → *"404"* no lugar do 500; R31, R32, R33 → o resumo; R35 → *"o filtro com espaco"*; R36 → *"o filtro
  so de espacos filtrou"*; R40, R50 → a linha do hexadecimal (só o total); R41, R42 → *"as formas do mesmo numero gravaram historico"*; M1r1 (a
  régua da Fase 2) → os dois do histórico; R45 → a hospedagem; R43 → *"o \"0.00\" sobre o nulo gravou historico"*; S1r2 (a tolerância) → *"a troca
  minima nao gravou historico"*.

## Suítes (lidas na saída, `scratchpad/e158/`)

- **Base (antes de qualquer código, `base-api.log`):** `test:api` **477/477**.
- **Bateria 1 — antes dos commits `38e189ca`..`af67f3c8` (`b1-*.log`):** `test:api` **478/478** arquivos; `test:almoxarifado` **44/0**;
  `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; revisão obrigatória da proposta **23/23** + editor **39/39**; client **152** suítes /
  **1956** testes; `CI=true build` *Compiled successfully*. Entre os commits da T1, T2 e T3 (estados intermediários), os três arquivos da etapa:
  20/0, 4/0, 8/0 (T1); 9/0 (T2); 10/0 (T3).
- **Bateria 2 — antes de `858055df` (depois da Fase 5 — também a do fechamento; depois só mudaram documentos, `b2-*.log`):** `test:api` **478/478** arquivos (uma primeira rodada deu **477/478**: o `superPadraoNoBoot` caiu com `SQLITE_READONLY` — o intermitente de antes registrado na Etapa 141 —, passou **14/14** três vezes sozinho e a rodada cheia repetida deu 478/478; `coordenadasPrazo` **24/0**, `coordenadaGuardadaMigracao` **6/0**, `custosViagensPortao` **11/0**); `test:almoxarifado` **44/0**; **4/0, 3/0, 16/0**; proposta **23/23** + editor **39/39**; client **152** suítes / **1956** testes; `CI=true build` *Compiled successfully*.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** — a Fase 5 (a régua do número, o ponto fora da faixa e 24 asserções). As três tasks ficaram verdes na
   primeira aplicação, com controle positivo cada. Testes antigos mudados: **1** (o cenário de integração da 156 mudou de ordem — o 429 depois
   do responde passaria a sair da memória).
2. **Achados da revisão:** Fase 2 — **0 Critical + 5 Important + 13 Minor**, todos reais (nenhum ruído; um — a I2 do `SELECT` — aceito e não
   executado na T1, pego pela Fase 5). Fase 5 — r1 **3** reais; r2 **0** de acesso + **1** real; r3 **24** faltas de asserção reais (provadas) + **5**
   equivalentes + **1** inalcançável; **0** ruído. **O que mais pesou:** uma régua escrita pelo que *parecia* número (Fase 2) em vez de pelo que o
   banco *grava* como número — as duas revisões a mexeram em direções opostas (estreitar, depois alargar e tirar a tolerância), e só a sonda no
   SQLite decidiu; e um teste de resumo que sobrescrevia o único caso que provava a regra (o `VOLTA` da tela).
3. **Paralelismo:** **0** galhos de código em paralelo (três tasks pequenas de servidor — o plano decidiu assim); **1** revisor na Fase 2 (antes do
   código), **3** em paralelo na Fase 5 sob a trava (o r3 em worktree própria) — **1** incidente de trava (o r1 apagou a do r3; sem efeito medido).
4. **Defeito que escapou:** **0** no que ela entregou (preenchido na Etapa 159: a medição da 159 percorreu todas as telas do Comercial e
   achou o mesmo padrão do C378 em outras — o filtro *Segmento* (C384), a busca dos custos (C386), o *Remover Lembrete* das Atividades (C387)
   — e a busca com letra acentuada (C385), todos **de antes** da 158; a parte técnica da C382, que a 158 declarou, foi feita na 159).

## Próxima tarefa detalhada — Etapa 159

*(A série desta etapa foi B1008–B1011, C377 resolvido, C378–C383, nenhuma A — a 159 começa em **B1012**, **C384**, **A104**; confira com
`grep -oE` antes.)*

**Escolhida: os filtros que as telas do Comercial mandam e o servidor ignora — medir antes, nenhuma regra do P.O.** O C378 (o filtro *Tipo de
viagem* que o servidor nem lia) sugere um padrão: a tela monta `params`/query e a rota não lê. (1) **Medir** (Fase 0): para cada tela do
Comercial com filtros (`CustosViagens` — `loadCustos` monta cliente, datas, código, criado por, status, ordenação; `Propostas`, `Atividades`,
`Clientes`, `Oportunidades`, os relatórios do Comercial), listar cada chave que a tela manda e conferir no `req.query` da rota se ela é lida e
como compara (caixa, espaço, tipo). Medir pelo nome do **contrato** (a chave na URL), não pelo nome que se imagina. (2) Consertar os ignorados
com a régua da RN-158.07 (parametrizado, sem caixa onde o dado é gravado em maiúsculas por `normalizarMaiusculas`/`toUpper`), cada um com
teste pela rota do `index.js` montado e fixture que separa (o caso em maiúsculas **e** o legado — a lição do R32). (3) As sobras desta etapa:
**C382** a parte técnica — o `POST`/`PUT /custos-viagens` sem `tipo_viagem` gravam `'ida_e_volta'` em minúsculas (o padrão não passa pelo
`normalizarMaiusculas`): passar o padrão a `IDA_E_VOLTA` (registrar em B; a tela sempre manda o tipo); **C381** — o `POST /clientes` responder
o cliente gravado (lido do banco, sem `geo_*`) em vez do eco do corpo: medir antes quem lê a resposta (`ClienteForm` usa `response.data.id`?) —
se só o `id` é lido, é reversível (B).
**Pontos de atenção:** (1) a trava de máquina (um `test:api` por vez); (2) o `custosViagensPortao` tem cenários que contam custos e histórico —
custos novos por cenário e apagar no fim; (3) `normalizarMaiusculas` no `POST`/`PUT` dos custos e `toUpper` no cadastro de clientes: o dado
gravado está em maiúsculas — a comparação do filtro tem de saber disso; (4) nunca chamar o Nominatim de verdade (`NOMINATIM_URL` local).

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 152 — **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o
resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela de conversões e o grupo acima de família, a régua do
tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens de
produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**, **B101**/G30,
**G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62, a **C348**; nas propostas, a verificação do dono da proposta (Fase
12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a Frente B da lentidão, a **C297** (**B924**), a **B926**,
a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**; no Operacional, a **C332**; do Comercial, a **C354**, a
**C357**/**B988**, a **C359**/**B989** (e a **C360** junto), a **C358**, e **novo desta etapa: usar o ponto guardado do endereço nos clientes
próximos e na rota (C383)** — muda a distância de todos os próximos e o custo sugerido, é regra; do núcleo, a **C362**. Pendem de Postgres:
**C98**, **C110**. **Nada novo do P.O. nesta etapa além da C383** (a **B1008** a **B1010** são reversíveis e estão na letra B).

**O que já está pronto e não precisa reabrir:** o ponto guardado do endereço, a invalidação pelo termo, a gravação depois da resposta, a
migração (`f677e0a6`, `858055df`); o resumo e o filtro por tipo sem caixa (`6f050dc9`); o histórico pelo número com a régua do SQLite
(`af67f3c8`, `858055df`).
