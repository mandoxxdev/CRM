# Etapa 156 (núcleo/Almoxarifado/Comercial): a repetição do pedido com os filtros, a lista recusada que diz o motivo, e o prazo da consulta de endereço (C369, C366, C361 — e C370, C371 achados na medição) — plano

> Origem: "Próxima tarefa detalhada — Etapa 156" do plano da 155
> (`docs/superpowers/plans/2026-10-19-almoxarifado-etapa155-correcoes-tecnicas-de-tela.md`). Etapa pequena; o design, com a Fase 0 medida,
> está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-19): última B **B1000**, último C **C369**,
> última A **A103**. Esta etapa: **B1001+**, **C370+**, **A104+**. Worktree `CRM-wt-e156`, branch `etapa-e156` (da main `dd84d941`).
>
> **Trava de máquina:** `scratchpad/e156-lock.sh` (o diretório `maquina-testes.lock`). Um arquivo de teste de servidor (ou um jest) por vez na
> máquina inteira, inclusive os revisores. **Nada do P.O.**: a lista do fim do plano da 155 continua de fora.
>
> **Fase 2 (um revisor fresco, só leitura, ANTES do código — `scratchpad/e156/fase2-revisao.md`): 0 Critical, 4 Important, 12 Minor — todos
> aceitos.** A Fase 0 foi conferida (a chave do 503, os 503 do servidor, os 10 seletores, o corpo do 403, os 0/28 de 53). **A Fase 0 mediu
> errado "344 chaves, 0 colisões"**: mediu depois de o JavaScript colapsar o literal — no fonte são **570 entradas** para 344 chaves, e
> `'Rio Branco'` aparece como a capital do Acre e depois como Rio Branco do MT (vale a última); e "o banco não tem acento" — um tem
> (`"RIBEIRÃO PRETO "`). **I1** com a cidade achada só pelo nome, o cliente de *RIO BRANCO/AC* iria para o MT (1.500 km) e *SANTA MARIA/RN*
> para o RS — a RN-156.04 passa a aceitar a cidade só quando ela fica a até 1.000 km do centro do estado informado (o literal fica como está,
> a última vence). **I2** a correção muda os números que se veem e se gravam (o valor da visita de *RIBEIRAO PRETO* de R$ 104 para R$ 735; a
> rota de SBC a *CAMPINAS* de 19,9 para 103,8 km; editar um custo antigo recalcula e sobrescreve os custos) — declarado na **B1002** e no
> guia, um cenário do relatório de visitas no T3, e o recálculo na edição vira **C372** (de antes). **I3** com a lista recusada, o seletor que
> já tem valor (a transferência de uma reserva com projeto; o material com dono) mostra "—"/"GMP" e grava o escondido, sem deixar limpar — o
> seletor passa a desenhar a opção do valor atual (*"Projeto #12 — fora da lista"*). **I4** o T4 não cruzava o T1 (`/clientes` e `/projetos`
> já tinham chaves diferentes) — passa a trocar o filtro das Reservas com o primeiro pedido esperando o 503. **Minor aceitos:** o 500 *"Não
> foi possível obter coordenadas"* é inalcançável sempre (o centro do Brasil), e falta o 500 do banco no contrato; quem espera recebe uma
> cópia dos dados (não o mesmo objeto) e a chave da leitura conta o `responseType`; a carga (cada filtro, uma cadeia de até 4 pedidos) na
> B1001; os chamadores não citados (o mapa das máquinas, a lista de custos) e a mesma cidade com e sem acento nos próximos (D); com o
> serviço parado o client deixa de usar a coordenada dele (o servidor responde em 5 s com a cidade/estado) — declarado; o `retryAfter: 0`
> vira 3 s (o teste usa 0,01), (d) conta 5 chamadas, prazo explícito contra a recursão, `undefined`/`null` na chave; o teste antigo do
> Material com `new Error('403')` passa ao fixture; o `error` terminado em ponto não duplica; os testes leem a frase por `within` do campo;
> as variáveis novas apagadas no `subir()`, o prazo pequeno no `spawn`, a `NOMINATIM_URL` malformada → o padrão, lidas a cada chamada; os
> espaços repetidos viram um (como antes), e o servidor local lê o `q` por `URLSearchParams`. **As RN, as tasks e os contratos abaixo já
> estão com as correções.**

## Fase 0 — medido (antes de qualquer código)

### C369 — a repetição do 503 reconhece o pedido sem os filtros

- `client/src/services/api.js:118-148`: `requestKey = \`${method}-${url}\`` — **sem `params` e sem corpo**. Com a chave em `retryCache`, o
  segundo pedido é recusado na hora (`Promise.reject(error)`, o erro 503 dele). A dona espera `retryAfter` s (padrão 3), apaga a chave e repete
  (até 3 vezes; depois `Error('Banco de dados não está disponível. Tente recarregar a página.')`).
- **Quem responde 503 no servidor:** o `checkDatabaseReady` (`index.js:645/652`, antes de qualquer rota — banco não inicializado / `DB_STARTING`),
  os `if (!db)` das rotas, o portão por módulo com `SQLITE_BUSY` ao ler as permissões (antes do corpo), o `tratarErroGlobalApi`
  (`services/errosApi.js:98`, erro de lock **em qualquer ponto do corpo**), o `respondDbError` (`services/sqliteConcurrency.js:311`) e o
  `leituraDeUsuarios`. **O `tratarErroGlobalApi` e o `respondDbError` podem responder 503 depois de o corpo já ter gravado parte** — a camada **já** repete POST/PUT/DELETE
  pelo 503 hoje (desde antes desta etapa). Repetir gravação "é outra conversa" (plano da 155): esta etapa **não muda nada nas gravações**.
- O interceptor nunca teve teste do ramo 503. `apiSessaoEncerrada.test.js` mocka a fábrica do axios. **Medido:** o jest do CRA (jest 27) carrega o
  axios real por `jest.requireActual('axios/dist/browser/axios.cjs')` e um adaptador falso em `api.defaults.adapter` passa pelo interceptor
  real (sonda `zzSonda156`, apagada: 503 → repetição → 200, 2 chamadas ao adaptador).

### C366 — as telas do Almoxarifado engolem a recusa das listas

- Quatro telas, cinco leituras (medido com `grep` de `'/clientes'`/`'/projetos'` em `components/almoxarifado`, fora dos testes):
  `MaterialAlmoxarifadoForm.js:196` (`/clientes`, `.catch(() => setClientes([]))`), `ReservasAlmoxarifado.js:124/126` (`/projetos`,
  `/clientes`, `.catch(() => ({ data: [] }))`), `MovimentacoesAlmoxarifado.js:476` (`/projetos`), `SobrasAlmoxarifado.js:210` (`/projetos`).
  Bate com a lista da C366 (o dono do material, as reservas, as movimentações e as sobras).
- Os seletores que cada lista alimenta: Material — *Proprietário* (`:776`); Reservas — o filtro *Todos os projetos* (`:339`), *Projeto* e
  *Cliente* da reserva nova (`:497`, `:515`) e da transferência (`:626`, `:649`); Movimentações — *Projeto* (`:1026`); Sobras — *Projeto da saída*
  (`:932`), *Projeto de origem* do retalho (`:1012`) e da sucata (`:1147`). **Dez seletores.**
- O 403 das duas listas (`portaoDasPropostas.exigir`, `services/portaoDasPropostas.js:77`) tem o corpo `{ error: 'Acesso negado ao módulo',
  modulo: ['comercial', 'almoxarifado', 'operacional'] }` (o `NEGADO_LISTAS` do `listasNotificacoesPortao`). `formatarErroPermissao` só
  reescreve o 403 **de perfil** (com `acao` e `perfil`) — este passa intacto pelo interceptor. O 503 (`SQLITE_BUSY` no portão) chega à tela,
  depois das 3 repetições, como `Error` sem `response`.
- As outras leituras auxiliares das mesmas telas (`centros-custo`, `aux/ordens-servico`, `localizacoes`, `estoque`, `materiais`) também
  engolem o erro — são do próprio Almoxarifado (quem perde o Almoxarifado perde a tela inteira no próximo pedido). **Fora** (declarado em D).

### C361 — a consulta de endereço sem prazo (e dois achados da medição)

- `geocodificarEndereco` (`index.js:6798`): `https.get` sem `timeout` nem prazo; o único chamador é `obterCoordenadasExatas` → `GET
  /api/custos-viagens/coordenadas-cliente/:cliente_id` (`index.js:16024`), que a tela de **Custos de viagem** e a **Prévia da rota** chamam
  para cada cliente com endereço (`CustosViagens.js:582`, `PreviewRota.js:65`; o client desiste em 30 s — o `timeout` do axios — e usa a
  coordenada aproximada dele). Nenhum teste chama a rota com um cliente com endereço (`custosViagensPortao` cria os dois clientes **sem**
  endereço de propósito).
- **C370 (novo, medido) — o recuo pela cidade nunca acha a cidade.** `obterCoordenadasCidade` (`index.js:6864`) procura
  `coordenadasCidades[cidade]` **exato** ('Campinas', 'São Bernardo do Campo'); o cadastro de clientes grava a cidade em maiúsculas
  (`toUpper(body.cidade)`, `index.js:4428`) e o banco medido não tem acento: **0 de 53** clientes acham a cidade hoje — todos caem no centro do
  estado (o `cidadeNormalizada` é calculado e nunca usado). Com a comparação sem caixa e sem acento: **28 de 53** (cópia local do banco de
  09/10, `scratchpad/e156/cidades2.js`; o mapa tem 344 cidades — **Fase 2: no fonte são 570 entradas para 344 chaves, e `'Rio Branco'` tem duas
  coordenadas (AC e MT, vale a última); um cliente tem acento, `"RIBEIRÃO PRETO "`**). Efeito de hoje: todo cliente de SP
  fica no mesmo ponto (os *clientes próximos* de um cliente de SP são todos os de SP, a 0 km), e a distância, o valor recomendado da visita
  (`calcularValorVisita`), o mapa do painel e a rota partem do centro do estado. A rota sugerida (`calcular-rota`) acha a cidade quando a tela
  manda a grafia do mapa e não acha quando manda a do cadastro.
- **C371 (novo, lido no código) — a consulta de endereço vai com `+` literal.** `query.replace(/\s+/g, '+')` e depois `encodeURIComponent`:
  o `+` vira `%2B` e o serviço recebe *"RUA+DAS+FLORES,+CAMPINAS..."*. O efeito no serviço **não foi medido** (os testes não o chamam).
- **Como os testes isolam a rede:** não isolam — nenhum teste chega ao `https.get`. Os testes do servidor montado sobem o `index.js` por
  `spawn` com variáveis de ambiente (`custosViagensPortao`, `subir()`); um servidor HTTP local no processo do teste é a fronteira simulável.

## Regras de negócio

- **RN-156.01 (C369)** — Com o banco ocupado (503), a camada de comunicação reconhece **o mesmo pedido de leitura** pelo método, pelo
  endereço **e pelos filtros** (`params`, sem depender da ordem das chaves; os valores vazios — `undefined`/`null` — não contam, como o axios
  não os manda). Dois pedidos de leitura ao mesmo endereço **com filtros diferentes** esperam e repetem **cada um** (os dois respondem); o
  **mesmo** pedido de leitura feito de novo enquanto o primeiro espera **espera a mesma repetição** e recebe a mesma resposta (um pedido só
  ao servidor — cada um com a sua cópia dos dados), ou o mesmo erro; o `responseType` faz parte da chave. **As gravações (POST, PUT, PATCH, DELETE) ficam como estavam** — a chave sem os filtros e o irmão recusado na
  hora (**B1001** — e, com o banco ocupado, cada filtro diferente é uma cadeia de até 4 pedidos). *Cenário:* `GET /busca-global?q=ab` e `?q=abc` com o banco ocupado → os dois esperam e mostram cada um o seu; `GET
  /almoxarifado/estoque` duas vezes → o servidor recebe 3 pedidos (2 + 1 repetição), as duas telas recebem a lista.
- **RN-156.02 (C366)** — Nas quatro telas, quando a lista de clientes ou a de projetos volta **recusada**, cada seletor que ela alimenta mostra,
  logo abaixo, o motivo: com o 403 do servidor, *"Sem acesso à lista de clientes: Acesso negado ao módulo. Recarregue a página para conferir
  suas permissões."* (o `error` do corpo; sem `error`, *"Sem acesso à lista de clientes. Recarregue a página para conferir suas
  permissões."*); com qualquer outra falha (banco ocupado depois das repetições, rede, 500), *"Não foi possível carregar a lista de clientes.
  Recarregue a página para tentar de novo."* (idem *"projetos"*). O seletor continua com as opções que não dependem da lista (*"GMP (estoque
  próprio)"*, *"—"*); a tela continua funcionando. Com a lista carregada, nada aparece. Uma função só monta a frase; um componente só a
  desenha. **O seletor que já tem valor** (a transferência de uma reserva com projeto ou cliente; o material com dono) e cujo valor não está na
  lista desenha a opção dele — *"Projeto #12 — fora da lista"*, *"Cliente #7 — fora da lista"* — marcada; assim a tela diz o que vai gravar e
  o *"—"*/*"GMP (estoque próprio)"* volta a ser escolhível para limpar (Fase 2 I3). Se o `error` do servidor terminar em ponto, a frase não o
  duplica.
- **RN-156.03 (C361, C371)** — A consulta do endereço ao serviço de mapas tem **prazo**: 5 s (`NOMINATIM_PRAZO_MS`, inteiro positivo; outro
  valor → 5 s), contados do pedido inteiro — conexão, resposta e corpo. Esgotado o prazo, a consulta é abortada e a coordenada sai pela
  cidade (RN-156.04) — `GET /custos-viagens/coordenadas-cliente/:id` responde **200** com ela. A resposta que não é **200**, o corpo que não é
  JSON e a lista vazia também caem na cidade. O endereço do serviço é `https://nominatim.openstreetmap.org/search` (`NOMINATIM_URL` troca —
  `http:` ou `https:`; outro protocolo ou endereço malformado → o padrão; as duas variáveis lidas a cada consulta), e o termo vai com os
  espaços como espaços (*"RUA DAS FLORES 10, CAMPINAS, SP, Brasil"*, sem `+`; espaços repetidos viram um, como antes). Os parâmetros, o `User-Agent` (`GMP-CRM/1.0`) e o resultado (a primeira linha, `lat`/`lon`) não mudam.
- **RN-156.04 (C370)** — A coordenada pela cidade compara o nome **sem caixa, sem acento e sem espaço nas pontas** (*"SAO BERNARDO DO CAMPO"* =
  *"São Bernardo do Campo"*); sem a cidade no mapa, o centro do estado (o estado também sem caixa); sem os dois, o centro do Brasil — como
  antes. **A cidade só vale quando fica a até 1.000 km do centro do estado informado** (Fase 2 I1: o mapa é só por nome — *RIO BRANCO/AC*
  acharia Rio Branco do MT, *SANTA MARIA/RN* a do RS; fora do raio, o centro do estado, como hoje); sem estado conhecido, a cidade pelo nome.
  Vale para todo chamador (os clientes próximos, a rota, o valor da visita do relatório de visitas técnicas, o mapa do painel, o mapa das
  máquinas vendidas, a lista de custos, o recuo da RN-156.03) — **os números mudam** para quem é de cidade do mapa (**B1002**).

## Contratos (nenhum endpoint novo nem mudado)

- `GET /api/custos-viagens/coordenadas-cliente/:cliente_id` — inalterado: `200 { coordenadas: [lat, lon], lat, lon }`; `404 { error: 'Cliente
  não encontrado' }`; `500 { error: <mensagem do banco> }` (erro na leitura do cliente); o `500 { error: 'Não foi possível obter coordenadas' }`
  é inalcançável (sem cidade nem estado sai o centro do Brasil — Fase 2 M2). Agora responde em **até ~5 s** com o serviço parado.
- `GET /api/clientes`, `GET /api/projetos` — inalterados; o corpo do 403 (`{ error: 'Acesso negado ao módulo', modulo: [...] }`) passa a ter
  fixture no client: `client/src/components/almoxarifado/__fixtures__/recusaDaListaDoServidor.json`, conferido pelo teste do servidor.
- Variáveis de ambiente novas (opcionais): `NOMINATIM_URL`, `NOMINATIM_PRAZO_MS`.
- Mensagens literais novas (só do client): *"Sem acesso à lista de {clientes|projetos}: {error}. Recarregue a página para conferir suas
  permissões."*; *"Sem acesso à lista de {…}. Recarregue a página para conferir suas permissões."*; *"Não foi possível carregar a lista de
  {…}. Recarregue a página para tentar de novo."*; as opções *"Projeto #<id> — fora da lista"* e *"Cliente #<id> — fora da lista"*.

## Tasks (sort topológico)

- [ ] **T1 (galho — client) — RN-156.01.** `client/src/utils/chaveDoPedido.js`: `chaveDoPedido(config)` — leitura (`get`/`head`):
  `metodo url ?params-ordenados responseType` (sem `undefined`/`null`); gravação: `metodo-url` (a de antes). `api.js`: no 503, leitura com a
  chave em espera → espera **a mesma promessa** da repetição e recebe uma cópia dos dados; gravação com a chave em espera → recusa na hora (como antes); a repetição é uma promessa guardada na chave (apagada
  antes de repetir, como antes). Teste `client/src/services/apiRepeticao503.test.js` com o axios real e o adaptador falso: (a) dois GET, filtros
  diferentes → os dois 200 com o seu filtro, 4 chamadas; (b) o mesmo GET duas vezes → os dois 200 com dados iguais (`toEqual`) e objetos
  distintos, 3 chamadas; (c) o mesmo GET com as chaves de `params` em outra ordem conta como o mesmo; (d) o mesmo GET com o banco sempre
  ocupado → os dois rejeitam com *"Banco de dados não está disponível..."*, **5** chamadas (A, B e 3 repetições), com prazo explícito no teste
  (a recursão travada falha legível); `retryAfter: 0.01` (o `0` vira 3 s); (e) dois POST ao mesmo endereço → o segundo recusado na hora com o 503 dele (a metade que **não**
  muda), o primeiro repete; (f) `chaveDoPedido` unitário (`{q:'a', x: undefined, y: null}` = `{q:'a'}`; `''` conta). Controle: a chave sem os
  `params` derruba (a); recusar o mesmo GET derruba (b); apagar a chave depois de repetir derruba (d) pelo prazo.
- [ ] **T2 (galho — client + teste do servidor) — RN-156.02.** `client/src/utils/listaRecusada.js` (`motivoDaListaRecusada(erro, nome)`);
  `components/almoxarifado/AvisoDaListaRecusada.js` (`<small role="alert">`, nada sem motivo); as quatro telas guardam o erro de cada lista e
  desenham o aviso sob os dez seletores; `OpcaoForaDaLista` (a opção do valor atual que não está na lista) no *Proprietário* do Material e nos
  *Projeto*/*Cliente* da transferência. Testes: a função (403 com e sem `error`, 503/Error, 500); em cada uma das quatro telas, a lista
  recusada pelo fixture → a frase sob o seletor **e** a metade positiva (as outras opções do seletor, e a outra lista carregada); com a lista
  carregada, nenhuma frase (lidas por `within` do campo — até 6 avisos nas Reservas); a transferência de uma reserva com projeto, com
  `/projetos` recusada → a opção *"Projeto #12 — fora da lista"* marcada, e escolher *"—"* manda o projeto vazio; o material com dono e
  `/clientes` recusada → *"Cliente #7 — fora da lista"* marcada, e *GMP* manda `null`. O teste antigo do Material que rejeita com `new
  Error('403')` passa ao fixture. **Servidor:** no `listasNotificacoesPortao` (o cenário dos barrados), o corpo do 403 das duas listas = o fixture.
  Controle: a tela sem guardar o erro derruba a dela; trocar o `error` do fixture derruba o servidor.
- [ ] **T3 (galho — servidor) — RN-156.03/04.** `server/services/coordenadas.js` com `geocodificarEndereco`, `obterCoordenadasExatas` e
  `obterCoordenadasCidade` (o mapa vai junto, uma chave normalizada por cidade); o `index.js` passa a importá-los (nenhum chamador muda).
  Teste `server/tests/api/coordenadasPrazo.api.test.js`: **unitário** contra um servidor HTTP local (nunca o Nominatim): o que pendura → `null`
  no prazo (300 ms; tempo entre o prazo e prazo + 1 s); o que manda o cabeçalho e pinga um byte a cada 50 ms → `null` no prazo (prova que o prazo
  é do pedido inteiro, não da conexão ociosa); 429, corpo não JSON, `[]` → `null`; o que responde → `[lat, lon]`; o pedido que chegou tem
  `q` = *"RUA DAS FLORES 10, CAMPINAS, SP, Brasil"*, `format=json`, `limit=1`, `countrycodes=br` e o `User-Agent`; o padrão (sem a variável)
  é o endereço do Nominatim (lido, não chamado); `NOMINATIM_PRAZO_MS` inválido → 5000; `NOMINATIM_URL` malformada ou `ftp:` → o padrão;
  o servidor local lê o `q` por `URLSearchParams`; `obterCoordenadasCidade` com caixa e acento (*SAO BERNARDO DO CAMPO*, *"RIBEIRÃO PRETO "*),
  o homônimo (*RIO BRANCO/AC* → o centro do AC; *RIO BRANCO/MT* → o do MT; *SANTA MARIA/RN* → o centro do RN), sem estado.
  **Integração (o `index.js` montado, `NOMINATIM_URL` no servidor local):** o administrador cadastra um cliente com endereço em *Campinas*;
  servidor local pendurado → `coordenadas-cliente` 200 com a coordenada de Campinas (não a do centro de SP) em menos de 3 s, e o servidor local
  recebeu 1 pedido; respondendo → a coordenada dele; os *clientes próximos* de Campinas (raio 100) trazem o de *JUNDIAI* e não o de *RIBEIRAO
  PRETO* (hoje os dois, a 0 km); a rota para *CAMPINAS* = a rota para *Campinas*; o relatório de visitas técnicas com o cliente de Campinas
  (distância ≈ 104 km, não a do centro de SP). O `spawn` com `NOMINATIM_PRAZO_MS=400` (o "< 3 s" não cabe nos 5 s do padrão); `subir()` apaga
  `NOMINATIM_URL`/`NOMINATIM_PRAZO_MS` herdadas. Controles: sem o prazo (ou só `req.setTimeout`) derruba o
  pendurado / o pingado; a comparação exata de volta derruba a cidade; sem o raio de 1.000 km derruba o homônimo.
- [ ] **T4 (integração — cruza T1 e T2, e a bateria) —** `client/src/components/almoxarifado/ReservasListaRecusadaApiReal.test.js`: a tela das
  Reservas com o `api.js` **real** (axios real, adaptador falso na fronteira HTTP): `/clientes` 503 → repete → 403 com o corpo do fixture → a
  frase com *"Acesso negado ao módulo"* sob o seletor; `/projetos` 503 → repete → 200 → as opções; e (Fase 2 I4 — o cruzamento com o T1) a
  lista de reservas (`/almoxarifado/reservas` com `params`) pedida com um filtro e, enquanto espera o 503, com outro → as duas respostas
  chegam e a tabela fica com a do filtro novo. Controle: a chave sem `params` derruba. Depois a bateria inteira, serial.

Independência: T1 (`api.js`, util novo), T2 (quatro telas, util e componente novos, `listasNotificacoesPortao`), T3 (`index.js`, serviço
novo, teste novo) tocam arquivos e regras disjuntas. T4 depende de T1 e T2. **T2 vai a um executor em worktree própria
(`CRM-wt-e156-t2`)** enquanto T1 e T3 rodam aqui; os testes de todos passam pela trava.

## Pontos de atenção

1. A régua do texto das provas de portão (`reguaDoFonteDoServidor`) lê o `index.js`: tirar funções dele não acrescenta `.use(` nem rota — mas o
   inventário dos registros só no `index.js` continua valendo (o serviço novo não registra rota).
2. O `listasNotificacoesPortao` inventaria quem cita `/clientes` e `/projetos` no client (`.js/.jsx/.ts/.tsx`): o util e o componente novos não
   citam os caminhos; o fixture é `.json`.
3. O teste do servidor montado sobe o `index.js` com `NOMINATIM_URL` — **nunca** sem ela num cenário que tenha cliente com endereço.
4. `custosViagensPortao` (os clientes próximos com raio 100 entre *Campinas* e *Jundiai*): com a cidade achada, ficam a ~40 km — continua
   dentro do raio.

## Execução (o que divergiu do plano)

*(preencher)*
