# Etapa 155 (núcleo/Comercial/Almoxarifado): as correções técnicas de tela — o seletor de cliente das Reservas, a busca do topo de quem não tem o Comercial, a resposta velha da busca, o código do produto no endereço da OS e a régua do `.use(` (C367, C364, C365, C351) — plano

> Origem: "Próxima tarefa detalhada — Etapa 155" do plano da 154
> (`docs/superpowers/plans/2026-10-19-almoxarifado-etapa154-listas-de-clientes-e-projetos-e-notificacoes-pelo-modulo.md`). A etapa é pequena;
> o design, com a Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-19): última B **B998**, último C **C367**,
> última A **A102**. Esta etapa: **B999+**, **C368+**, **A103+**. Worktree `CRM-wt-e155`, branch `etapa-e155` (da main `9290a984`).
>
> **Trava de máquina:** `scratchpad/e155-lock.sh` (o diretório `maquina-testes.lock` de sempre). Um arquivo de teste de servidor (ou um jest)
> por vez na máquina inteira, inclusive os revisores. **Nada do P.O.**: a lista do fim do plano da 154 continua de fora.
>
> **Fase 2 (um revisor fresco, só leitura, ANTES do código — `scratchpad/e155/fase2-revisao.md`): 0 Critical, 6 Important, 13 Minor — todos
> aceitos.** A Fase 0 foi conferida (C367, C368, as 3 chamadas da C351, os 7 `.use(` não literais, a numeração). **I-1 — a Fase 0 mediu errado
> "o cache está quente quando o `Layout` está montado"**: o cache vence em 5 min e ninguém o renova sem trocar de usuário ou de módulo; a
> RN-155.02 passa a buscar as permissões ao abrir com o cache frio (`fetchUserPermissions`, deduplicado) e a decidir quando ele responder;
> falha aberto só no erro ou no tempo esgotado. **I-2** com o campo desligado o Esc não fechava (o Esc só é ouvido no `<input>`) — o Esc passa a
> ser ouvido no `window` enquanto a busca está aberta. **I-3** o *"Buscando..."* ficaria preso quando o pedido descartado é o último — a
> invalidação (termo curto, fechar, abrir) grava `loading=false` ela mesma. **I-4** fechar não cancelava o atraso de 300 ms — o efeito passa a
> depender de `isOpen` e não busca fechado; abrir também invalida. **I-5** a regex `\b\w+\.use\(` exige o receptor colado (escapam
> `a.use(x).use(y)`, a quebra de linha, `?.use`, `(apelido).use`) — trocada por `\.\s*use\s*\(\s*[^\s'"`)]` (medida pelo revisor sobre o
> servidor real: os mesmos 7). **I-6** a comparação das chaves do `aux/ordens-servico` passaria sobre `[]` (a rota engole o erro) — o teste
> exige linha com `numero_os`. **Minor aceitos:** a coluna *Destino* da OS mostra o `numero_os` sozinho ("OS OS-42" seria redundante — o
> número nasce `OS-001`); o ` — cliente_nome` só quando existe (como as irmãs); o cliente "sem razão social" é a string vazia (`NOT NULL`); a
> OS fora das 300 mais recentes continua "OS #<id>" (declarado); o caminho cru de `E155/A` → 404 do Express, não o produto (`?`/`#` crus não
> servem de controle — o `fetch` os come); o literal `E155%2F` volta ele mesmo (uma decodificação só); o inventário da T3 sem os `*.test.js`;
> o teste da T3 num `test` próprio no fim; a trava da RN-155.02 vale no efeito, não só no campo; o cabeçalho do helper atualizado (o apelido
> no `.use` é visto; nos verbos, `apelido.get(IDENT)`, continua com as camadas); o custo (um `passport.use(...)` novo derruba os 6 testes —
> desejado); a B999 diz que o interruptor `PROPOSTAS_PORTAO_DE_MODULO` deixa de ser a volta da busca para quem não tem o Comercial; a lista das
> telas que leem `/clientes` completada (abaixo). Os mocks do `Layout.modulo.test.js` (sem `hasModuleAccess`) não renderizam o `Layout` —
> registrado. **As RN, as tasks e os contratos abaixo já estão com as correções.**

## Fase 0 — medido (antes de qualquer código)

### C367 — o seletor de cliente das Reservas (confirmado, e um irmão novo)

- `GET /api/clientes` (`index.js:4342`) devolve `SELECT * FROM clientes`: as colunas do `CREATE TABLE` (`index.js:1232` — `id`,
  `razao_social`, `nome_fantasia`, `cnpj`, `segmento`, `telefone`, `email`, `endereco`, `cidade`, `estado`, `cep`, `contato_principal`,
  `observacoes`, `status`, `created_at`, `updated_at`) mais as do `ALTER` (`logo_url`, e as que a medição pelo servidor montado mostrar).
  **Não há `nome`.**
- `ReservasAlmoxarifado.js:138` (`nomeCliente`, a coluna "Destino"), `:505` (o seletor da reserva nova) e `:639` (o da transferência) leem
  `c.nome` → opções em branco e a coluna diz *"Cliente #<id>"*. Confirmado.
- **O teste da tela prova o defeito por omissão:** `ReservasAlmoxarifado.test.js:98` devolve `/clientes` vazio — o seletor nunca foi montado
  com cliente nenhum.
- **Irmão novo (achado da Fase 0): o seletor de OS da mesma tela** (`:496`, `:625`) desenha `o.numero || o.codigo || \`OS #${o.id}\``, e
  `GET /api/almoxarifado/aux/ordens-servico` (`routes/almoxarifado/extended.js:1018`) devolve `id, numero_os, status, cliente_nome` — não há
  `numero` nem `codigo`: toda opção sai *"OS #<id>"* (o número interno, não o da OS). O teste da tela **prova o defeito**: o mock devolve
  `{ id: 42, numero: 'OS-42' }` (`ReservasAlmoxarifado.test.js:97`), um campo que o servidor não manda. A coluna "Destino" diz `OS #<os_id>`.
  As telas irmãs (Movimentações `:1016`, Sobras `:922/1022/1157`) desenham `numero_os — cliente_nome`, certo. Vira **C368** (novo e resolvido
  aqui).
- As outras telas que leem `/clientes` desenham `razao_social` (com ou sem `nome_fantasia`): `OSForm`, `OportunidadeForm`, `ProjetoForm`,
  `GerarPropostaModal`, `CustosViagens`, `MaterialAlmoxarifadoForm`, `PropostaForm.js:944`, `proposta/PropostaForm.js:611`, `Clientes`,
  `ClienteForm`; as `Atividades` passam a lista ao `CalendarioAtividades`, que lê `cliente.nome || cliente.razao_social`. Só as Reservas erram
  (lista completada pela Fase 2).

### C364 — o Ctrl+K de quem não tem o Comercial

- `Layout.js:111-115`: o atalho `busca` sempre abre o `BuscaGlobal`; não há outro gesto que o abra (só o atalho; o rodapé da tela vazia diz
  *"Ctrl + K para abrir busca"*).
- O servidor (`index.js:3065`, `TIPOS_DA_BUSCA_GLOBAL`) filtra os seis tipos pelo Comercial; sem o Comercial, `[]` sem log → a tela diz
  *"Nenhum resultado encontrado"* a toda busca.
- A régua da tela (`ProtectedModuleRoute` → `hasModuleAccess(cache.permissoes, modulo, user)`, com `bypassModuleRestrictions` antes) é a mesma
  do servidor (presa pela tabela `portaoComoATela.casos.json` desde a 145). O cache (`getCachedUserPermissions`) está quente quando o `Layout`
  está montado (o `loadUserGrupos` o carrega); frio → **falha aberto** (o padrão de `ReposicaoAlmoxarifado.js:405-418`).
- O `BuscaGlobal` não usa `useAuth` hoje; o teste dele (`BuscaGlobal.test.js`, 186 linhas) monta sem `AuthProvider`.

### C365 — a resposta velha da busca

- `BuscaGlobal.js:24-55`: o `performSearch` grava `setResults` com a resposta de qualquer pedido, sem conferir se ainda é o termo do campo.
- O `api.js:116-140` repete o 503 por uma chave `método-url` **sem os parâmetros**: com o banco ocupado, o pedido de `ab` espera e repete; o de
  `abc`, com a mesma chave, é **recusado na hora** (`retryCache.has`) → a tela grava `[]` (*"Nenhum resultado encontrado"*); depois a
  repetição de `ab` responde e a tela mostra o resultado de `ab` com `abc` no campo. Também sem 503: duas respostas fora de ordem (a de `ab`
  mais lenta que a de `abc`, possível apesar do atraso de 300 ms).
- **A recusa imediata do pedido irmão vale para qualquer tela** (o interceptor é de todos): dois pedidos ao mesmo endereço com parâmetros
  diferentes durante o 503 — o segundo falha na hora. Fora do escopo desta etapa (núcleo, muda o comportamento de todas as telas): vira **C369**.

### C351 — o código do produto no endereço

- Três chamadas, todas `api.get(\`/produtos/codigo/${...}\`)` cru: `OSComercialForm.js:116`, `OSDetalhesForm.js:96`, `PreviewOSEditavel.js:23`.
  Nenhuma outra no client.
- O servidor (`index.js:15447`, `GET /api/produtos/codigo/:codigo`) lê `req.params.codigo` — o Express decodifica o parâmetro (`A%2FB` →
  `A/B`); o caminho codificado casa a rota de um segmento.

### A lacuna do helper da régua do texto (Fase 5 r3 R2 da 154)

- `tests/helpers/reguaDoFonteDoServidor.js`, segunda regex: `\b(app|router|r|\w*[Rr]outer)\.(get|...|use|route)\(\s*[^\s'"\`[)]` — o
  receptor só nesses nomes. `const apelido = app; apelido.use((req, res, next) => ...)` (um middleware **global**, sem caminho) não casa; as
  camadas (`conferirCamadasDoExpress`) também não o acusam, porque um global roda no caminho neutro na mesma posição (é a régua delas).
- **Medido — todo `.use(` do servidor (fora `node_modules`, `tests`, `data`, `uploads`, `backups`), por qualquer receptor, com o 1º argumento
  que não é texto:** os 5 do `index.js` já medidos (`app.use((req, res, next) => {`, `cors`, `express.json`, `express.static(clientBuildPath…)`,
  `rotasModulos`), o comentário de `services/almoxarifado/origemRequisicao.js` (já medido) e **um a mais**: `services/chat/socket.js:97`
  `io.use(criarAuthSocket(jwtSecret, db));` (o socket.io — não é o Express). Nenhum `= app` além do `const app = express()`.
- Os 7 testes que comparam a régua com `REGISTROS_NAO_LITERAIS_MEDIDOS`: `custosViagensPortao`, `familiasListaOsPortao`,
  `listasNotificacoesPortao`, `osModeloContratoPortao`, `paineisBuscaGlobalPortao`, `produtosGruposVariaveisPortao` (e o
  `clientesProjetosPortao`, que tem a régua dele inline, só para os quatro prefixos da 151 — fica como está).

## Regras de negócio

- **RN-155.01 (C367, C368)** — Nas *Reservas*, o cliente aparece pela **razão social** (o nome fantasia quando não houver razão social; *"Cliente
  #<id>"* só quando o cliente não está na lista), no seletor da reserva nova, no da transferência e na coluna *Destino*. A OS aparece pelo
  **número da OS** seguido do cliente quando houver (*"OS-150 — CLIENTE X"*, igual a Movimentações e Sobras; sem cliente, só *"OS-150"*), nos
  dois seletores; na coluna *Destino*, o número da OS (*"OS-150"*) quando a OS está na lista (as 300 mais recentes), *"OS #<id>"* quando não.
  *Cenário:* cliente "ACME LTDA" (fantasia "ACME") → a opção diz "ACME LTDA"; cliente com a razão social vazia (`''`, só pelo banco) → "ACME";
  reserva com `cliente_id` = ACME → coluna "ACME LTDA"; OS 42 `OS-42` do cliente ACME → opção "OS-42 — ACME LTDA" e coluna "OS-42"; OS 43
  `OS-43` sem cliente → opção "OS-43".
- **RN-155.02 (C364, B999)** — A busca do topo continua abrindo pelo *Ctrl+K* para todos; para quem a régua da tela **não** dá o Comercial (o
  único módulo dos tipos da busca), ela **diz por quê e não busca**: o campo fica desligado e a área de resultados mostra *"A busca do topo
  procura clientes, projetos, propostas, atividades e produtos do Comercial, e você não tem acesso ao Comercial."* — nenhum pedido ao
  servidor; o Esc, o X e o clique fora fecham. Com o cache de permissões frio, a busca **pergunta as permissões ao abrir** (a mesma leitura
  da moldura, deduplicada) e decide quando a resposta chega — até lá, o que se digita espera; se a leitura **falhar** (ou o tempo esgotar),
  **falha aberto** (busca como antes; o servidor filtra). Sem usuário, administrador e quem passa pelas restrições: sempre buscam. O servidor
  não muda.
- **RN-155.03 (C365)** — A busca só mostra a resposta do **último** pedido feito: a resposta de um pedido anterior (outro termo, ou o mesmo
  termo pedido de novo) é descartada, inclusive o "carregando" dela. Apagar o termo (menos de 2 letras), fechar ou abrir a busca descarta o
  pedido em voo **e desliga o "carregando"**; fechada, a busca não pede nada (o atraso de 300 ms de um termo digitado antes de fechar não
  dispara). Um pedido que **falha** mostra *"Não foi possível buscar agora. Tente de novo em instantes."* em vez de *"Nenhum resultado
  encontrado"*.
- **RN-155.04 (C351)** — As três telas da OS (a OS do Comercial, o detalhe da OS, o preview editável) pedem o produto com o código
  **codificado** (`encodeURIComponent`): o código com `/`, `?`, `#`, `%` ou espaço acha o produto dele. Uma função só monta o endereço; o
  client não tem outro `/produtos/codigo/`.
- **RN-155.05 (Fase 5 r3 R2 da 154)** — A régua do texto acusa **todo `.use(`** do servidor, por **qualquer** receptor ou sem receptor colado
  (apelido de `app`, parâmetro com outro nome, `io`, o encadeado `a.use(x).use(y)`, a quebra de linha antes do `.use`, `?.use`,
  `(apelido).use`), cujo primeiro argumento não é texto literal (função, identificador, chamada, lista) — regex `\.\s*use\s*\(\s*[^\s'"`)]`.
  A lista medida ganha o `io.use` do socket. Um `.use('<caminho literal>', ...)` por apelido continua com as camadas (o prefixo pendurado
  aparece lá) — **isto estava errado para `'/'`, `''`, `'*'` e `'/api'`** (Fase 5 r1/r2 A1: esses rodam no caminho neutro das camadas, na
  mesma posição, e escapavam das duas réguas; a régua do texto passou a acusá-los, com os 5 `app.use('/api', ...)` de hoje na lista medida); um verbo por apelido com caminho em identificador (`apelido.get(IDENT)`) também (as camadas o acusam). Custo declarado: um
  `.use(` novo de biblioteca (`passport.use(new …)`) derruba os 6 testes — de propósito (alguém confere e acrescenta à lista medida).

## Contratos (nenhum endpoint novo nem mudado)

- `GET /api/clientes` — inalterado; a tela passa a ler `razao_social`/`nome_fantasia`. **Fixture do client = o corpo real:** as chaves de uma
  linha de `GET /api/clientes` do servidor montado são as do `client/src/components/almoxarifado/__fixtures__/clienteDoServidor.json` (o teste
  do servidor compara as chaves); idem `GET /api/almoxarifado/aux/ordens-servico` ↔ `__fixtures__/osDoAuxDoServidor.json`.
- `GET /api/busca-global?q=` — inalterado (o filtro da 153). O client deixa de chamar quando não tem o Comercial.
- `GET /api/produtos/codigo/:codigo` — inalterado; recebe o código codificado. `200` com o produto; `404 { error: 'Produto não encontrado' }`.
- Mensagens literais novas (só do client): *"A busca do topo procura clientes, projetos, propostas, atividades e produtos do Comercial, e você
  não tem acesso ao Comercial."*; *"Não foi possível buscar agora. Tente de novo em instantes."*

## Tasks (sort topológico)

- [x] **T1 (`d3ef595a`) (galho — client + teste do servidor) — RN-155.01.** `ReservasAlmoxarifado.js`: `rotuloCliente(c)` = `c.razao_social ||
  c.nome_fantasia || \`Cliente #${c.id}\``; `rotuloOS(o)` = `o.numero_os || \`OS #${o.id}\`` + `— cliente_nome`; o `destinoLabel` da OS pelo
  `numero_os` da lista. Os dois fixtures JSON. `ReservasAlmoxarifado.test.js`: o mock de `/clientes` e o de `aux/ordens-servico` pelos
  fixtures; cenário que abre "Nova reserva" e lê as opções; cenário da coluna *Destino* (cliente e OS); o mock antigo `{ numero: 'OS-42' }`
  sai. **Servidor:** no `listasNotificacoesPortao` (cenário de integração da 154, depois de a Fábrica criar a OS), as chaves da linha de
  `/clientes` e de `aux/ordens-servico` = as dos fixtures — exigindo **ao menos uma linha**, a do cliente do preparo com `razao_social`, e a
  OS criada com `numero_os` preenchido (a rota engole o erro em `[]`, Fase 2 I-6). Controle positivo: voltar `c.nome` / `o.numero` derruba o
  client; trocar uma chave do fixture derruba o servidor.
- [x] **T2 (`287e6157`; Fase 5 em `96da430a`) (galho — client + teste do servidor) — RN-155.02/03.** `client/src/utils/buscaGlobalAcesso.js`: `MODULOS_DA_BUSCA_GLOBAL =
  ['comercial']` e `podeUsarBuscaGlobal(user, cached)` (sem usuário → true; `bypassModuleRestrictions` → true; cache nulo → true; senão
  algum módulo por `hasModuleAccess`; devolve `null` com o cache frio). `BuscaGlobal.js`: `useAuth` + `getCachedUserPermissions`; ao abrir
  com o cache frio, `fetchUserPermissions(user.id)` → decide (erro → aberto); estado `acesso` (`verificando`/`sim`/`nao`); sem acesso → campo
  desligado + a frase, sem pedido; o Esc no `window` enquanto aberta; o efeito da busca depende de `[query, isOpen, acesso]` e só pede aberto e
  com acesso; o número do pedido (`useRef`) — só o último grava resultado e "carregando"; termo curto/fechar/abrir invalidam e desligam o
  "carregando"; o `catch` → a frase do erro. `BuscaGlobal.test.js`: mock do `AuthContext` e do cache; cenários: sem o Comercial (a frase, o
  campo desligado, **0** chamadas, o Esc fecha — e a metade positiva: com o Comercial busca); cache frio → a leitura sem o Comercial dá a
  frase e 0 buscas, a leitura com o Comercial busca, a leitura que falha busca; resposta velha descartada (a de `ab` resolvida depois da de
  `abc`); o mesmo com a de `ab` falhando depois; o erro mostra a frase; apagar o termo durante o voo (volta *"Digite pelo menos 2
  caracteres"*); Esc antes dos 300 ms → 0 pedidos; fechar com pedido em voo, reabrir, a resposta chega → nada aparece. **Servidor:** no
  `paineisBuscaGlobalPortao`, o conjunto dos módulos de `TIPOS_DA_BUSCA_GLOBAL` (lido do `index.js`) = `MODULOS_DA_BUSCA_GLOBAL` (lido do
  client). Controles: tirar a conferência do número derruba o da resposta velha; `podeUsarBuscaGlobal` sempre true derruba o sem-Comercial;
  `MODULOS` com outro módulo derruba o do servidor.
- [x] **T3 (`92178609`) (galho — client + teste do servidor) — RN-155.04.** `client/src/utils/produtoPeloCodigo.js`: `caminhoDoProdutoPeloCodigo(codigo)`;
  as três telas o usam. Teste do client: a função (com `/`, `?`, `#`, `%`, espaço, número) e o inventário (nenhum arquivo do client fora dela,
  e fora dos `*.test.js`, cita `/produtos/codigo/`). **Servidor (integração), num `test` próprio no fim do `produtosGruposVariaveisPortao`:**
  o Comercial cria produtos com códigos `E155/A`, `E155?B`, `E155#C`, `E155%D`, `E155 E`, `E155%2F` e lê cada um pelo caminho codificado →
  `200` com o id dele (o `E155%2F` volta ele mesmo: uma decodificação só); o caminho cru de `E155/A` → `404` sem o produto (o finalhandler do
  Express). Controle: a função sem `encodeURIComponent` derruba o client.
- [x] **T4 (`ff02028b`; Fase 5 em `96da430a`) (galho — só teste) — RN-155.05.** O helper: a 2ª regex sem o `use`; uma regex nova `\.\s*use\s*\(\s*[^\s'"\`)]` (qualquer receptor
  ou nenhum colado; a lista `[` conta); `REGISTROS_NAO_LITERAIS_MEDIDOS` com o `io.use`; o cabeçalho do helper atualizado. O controle do
  próprio helper (`custosViagensPortao`, fontes sintéticas): o apelido, o parâmetro renomeado, a lista, o encadeado, a quebra de linha, o
  `?.use`, o `(apelido).use` e o `io.use` acusados; o `.use('/x', mw)` por apelido não. Controle real: um `const apelido155 = app;
  apelido155.use((req, res, next) => next());` no `index.js` derruba os 6 testes da régua.
- [x] **T5 (integração — a bateria antes dos commits e depois da Fase 5) —** a bateria inteira serial; os cenários de integração das T1/T3 cruzam client (fixture/função) e servidor (corpo real
  / rota real).

Independência: as quatro tocam arquivos e regras disjuntas (T1 Reservas; T2 BuscaGlobal; T3 telas da OS; T4 helper). O único ponto comum é a
suíte do servidor (a T4 muda a lista medida que os 6 testes comparam — se outra task acrescentasse um `.use(` não literal, cairia; nenhuma
acrescenta). Executadas em sequência por um executor (pequenas demais para worktrees).

## Pontos de atenção

1. O inventário da 154 (`listasNotificacoesPortao`, cenário 9) lê quem cita `/clientes`: os fixtures são `.json` (o inventário lê
   `.js/.jsx/.ts/.tsx`) e não citam o caminho.
2. A frase de RN-155.02 aparece só a quem a tela não dá o Comercial; ela **não** muda o servidor (com `PROPOSTAS_PORTAO_DE_MODULO=desligado`
   o servidor devolveria os tipos, mas os resultados levam a telas do Comercial, que a moldura barra — a frase continua verdadeira).
3. `useAuth` lança fora do `AuthProvider`: o `BuscaGlobal` só é montado pelo `Layout` (dentro do provider); o teste mocka o contexto.

## Execução (o que divergiu do plano)

- **T1–T4 executadas em sequência, por um executor só** (pequenas demais para worktrees; o plano já dizia). Os testes novos passaram de
  primeira (as quatro tasks) — por isso cada um tem controle positivo: **K-T1** `rotuloCliente` → `c.nome` e `rotuloOS`/`numeroDaOS` →
  `o.numero` derrubam 2 cenários do client cada (o da Nova Reserva pelas opções; o da Transferência pela coluna); trocar `razao_social` ou
  `numero_os` num fixture derruba o do servidor (pelas chaves). **K-T2** 9 sabotagens (a régua sempre verdadeira; sem conferir o número no
  `try` e no `catch`; invalidar sem desligar o "carregando"; buscar fechada; abrir sem invalidar; o cache frio sem ler; sem o Esc no `window`;
  sem a frase do erro) — todas caíram pelo cenário delas; `MODULOS_DA_BUSCA_GLOBAL` com outro módulo e a leitura fria só num comentário
  derrubam o do servidor. **K-T3** a função sem `encodeURIComponent` e uma tela crua derrubam o client; o servidor decodificando duas vezes
  derruba o da rota (pelo `E155%2F`). **K-T4** a regex antiga derruba o controle do helper e a lista medida; um `apelido155.use(...)` no
  `index.js` derruba os **6** testes da régua, cada um pela mensagem dela.
- **A chave dos fixtures saiu certa de primeira** (o `SELECT *` de clientes = as 16 colunas do `CREATE` + o `logo_url` do `ALTER`); o controle
  confirmou que o teste sabe falhar.
- **A consulta A103** rodada na cópia de 09/10: **0** de 23 produtos; controle numa cópia com um código terminado em `/1` e outro em `%`: os
  dois apareceram (`scratchpad/e155/a103run.js`).
- **Divergência do plano (RN-155.03):** o plano dizia "a tela deve comparar o termo da resposta com o do campo"; foi feito pelo **número do
  pedido** (mais estrito: cobre o mesmo termo pedido de novo e o fechar/abrir). E o termo curto passou a descartar o pedido **na hora**, não
  depois do atraso (Fase 5 r1 A3).

## Fase 5 — revisão adversarial (três revisores frescos, em paralelo, sob a trava)

- **r1 (regra) — 4 achados reproduzidos.** **A1 (Important)** `apelido.use('/api', fn)` e `app.use('/', fn)` não eram acusados nem pelo texto
  nem pelas camadas (o caminho neutro `/api/zz-neutro-NNN` também passa por eles, na mesma posição) — a RN-155.05 dizia que "o `.use` com
  caminho literal continua com as camadas": **estava errado para `'/'`, `''`, `'*'` e `'/api'`**. **A2 (Minor, regressão da 155)** com a ajuda
  (F1) aberta por cima da busca, um Esc fechava as duas (o ouvinte novo no `window`). **A3 (Minor, de antes)** apagar o termo com a resposta
  chegando nos 300 ms mostrava a lista velha com *"Digite pelo menos 2 caracteres"*. **A4 (Minor)** reabrir com acesso depois de uma abertura
  sem acesso deixava o campo sem foco. Conferido certo: os rótulos, os tipos dos ids, a régua igual à do servidor (sem linha, admin, super,
  permissão 0), a leitura fria deduplicada, o Ctrl+K com a busca aberta, quem tem o Comercial igual a antes (setas, Enter, clique, frases), o
  503, as 3 telas da OS (código vazio nunca chega à função), a régua com 7 registros no servidor real.
- **r2 (autorização) — 2 achados reproduzidos.** **A1** o mesmo do r1 (com 10 variantes num app sintético: `'/'`, `'/api'`, `'*'`, `''`,
  `use?.(`, `.use.bind`, o nome montado, o comentário no meio). **A2 (Minor)** com o cache frio, a decisão usava o usuário do contexto e não o
  que a leitura trouxe — quem virou administrador no meio da sessão via a frase até reabrir. Conferido certo: **44** perfis × 2 modos = **88**
  casos no `index.js` real, **0** divergências da tela com o servidor com o portão ligado; o servidor não mudou (o diff de `server/` só toca
  `tests/`); as Reservas não mostram dado novo; **72** pedidos crus ao produto pelo código (24 formas × 3 usuários) — nenhum 200 a quem não
  tem o Comercial nem o Operacional. Observação: desligado, o aviso do boot sobre a busca vale só para a integração (escrito na B999).
- **r3 (sabotagem, worktree própria `CRM-wt-e155-r3`) — 37 sabotagens novas: 23 caíram pela asserção certa, 14 sobreviveram — 11 de falta de
  asserção, 3 equivalentes.** As de falta de asserção, todas reais (provadas por uma sonda de 7 cenários): **B6** sem o `vivo`, a leitura fria
  de uma abertura anterior vencia a decisão nova; **B10/B14/B17** o Esc no campo fechando duas vezes, o ouvinte vazado, o Esc com a busca
  fechada; **B7/B8** o erro velho nos 300 ms; **B2** o texto da frase nunca conferido; **B11/B12** setas e Enter sem teste (de antes); **P3**
  o inventário da T3 contando comentário e não vendo o caminho em partes; **G3/G4** os dois `\s*` da regex sem caso sintético. Equivalentes
  (mantidos e declarados): **B15** o bypass do administrador em `podeUsarBuscaGlobal` (o `hasModuleAccess` já o faz), **B16** o `data || {}`,
  **P2** o `String()`.
- **Correção da Fase 5 (`96da430a`):** a régua do texto acusa também o `.use` com `'/'`, `''`, `'*'`, `'/api'` (qualquer aspa e caixa), o
  `use?.(` e o `.use.bind(`; a lista medida ganha os 5 `app.use('/api', ...)` de hoje; o controle do helper ganha essas formas e as do G3/G4.
  O Esc só fecha a busca quando teclado dentro dela (ou sem foco em lugar nenhum); o foco volta ao campo quando ele liga; o termo curto
  descarta o pedido em voo na hora; a decisão usa o usuário efetivo (o do contexto com o cadastro que a leitura trouxe). **9** cenários novos
  no `BuscaGlobal.test.js` (a frase; o Esc no campo, fechada e reaberta; o Esc da ajuda por cima; o foco; o usuário efetivo frio e quente; a
  leitura velha; o erro velho; o termo apagado nos 300 ms; as setas e o Enter); o inventário da T3 sem comentários e com o caminho em partes.
  Controles: **K1–K10** (sem o `vivo`; o Esc também no campo; o ouvinte vazado; o Esc de qualquer alvo; o termo curto sem descartar; sem o
  foco ao ligar; o frio e o quente sem o usuário efetivo; as setas) — todos caíram pelo cenário deles, **menos K5** (abrir sem o `setErro(false)`
  — equivalente agora: o termo vazio da abertura já limpa o erro na hora); as três regex novas tiradas uma a uma derrubam o controle do helper;
  um sexto `app.use('/api', ...)` no `index.js` derruba a lista medida; a tela montando o caminho em partes (com a função citada num
  comentário) derruba o inventário.

## Suítes (lidas na saída, `scratchpad/e155/bateria-*.log`)

- **Antes dos commits `d3ef595a`..`ff02028b`:** `test:api` **476/476** arquivos; `test:almoxarifado` **44/0**; `test:validation`/`safealter`/
  `sqlite` **4/0, 3/0, 16/0**; revisão obrigatória da proposta **23/23** + editor **39/39**; client **145** suítes / **1872** testes;
  `CI=true build` *Compiled successfully*.
- **Antes de `96da430a` (depois da Fase 5 — também a do fechamento; depois só mudaram documentos):** `test:api` **476/476**
  (`listasNotificacoesPortao` **10/0**, `paineisBuscaGlobalPortao` **9/0**, `produtosGruposVariaveisPortao` **12/0**, `custosViagensPortao`
  **8/0**); `test:almoxarifado` **44/0**; `4/0, 3/0, 16/0`; proposta **23/23** + editor **39/39**; client **145** suítes / **1881** testes
  (`BuscaGlobal` **27**, `ReservasAlmoxarifado` **25**, `produtoPeloCodigo` **2**); `CI=true build` *Compiled successfully*.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** — a Fase 5 (a régua do `.use` em toda a API, o Esc, o foco, o termo curto, o usuário efetivo e as
   9 asserções). As quatro tasks ficaram verdes na primeira aplicação (com controle positivo cada). Testes antigos mudados: **2** (o mock das
   Reservas que provava o defeito; o controle do helper, que ganhou as formas novas).
2. **Achados da revisão:** Fase 2 — **6 Important + 13 Minor, reais** (o I-1 desmentiu a medição do cache quente). Fase 5 — r1 **4** reais (1
   Important — o mesmo do r2 —, 3 Minor); r2 **2** reais (1 em comum com o r1); r3 **11** de falta de asserção, todas reais (provadas por sonda)
   + **3** equivalentes declaradas; **0** ruído. **O que mais pesou:** uma régua "por posição em relação a um caminho neutro" não vê o que roda
   no próprio neutro — o `/api` inteiro; e um ouvinte novo no `window` precisa de um teste com outra janela por cima.
3. **Paralelismo:** **0** galhos de código em paralelo (as quatro tasks em sequência — pequenas); **1** revisor na Fase 2 (antes do código),
   **3** em paralelo na Fase 5 sob a trava (o r3 em worktree própria); **0** retrabalho.
4. **Defeito que escapou:** **nenhum do código da 155** achado na Etapa 156 (medição, Fase 2 e os três revisores da Fase 5 passaram
   pelas Reservas, pela busca e pela camada de comunicação). O que a 156 achou é de antes: a cidade do cadastro nunca achada (**C370**), o `+` no
   endereço (**C371**), o recálculo ao editar um custo (**C372**) e o token velho na repetição do 503 (**C373**). *(Preenchido na Etapa 156.)*

## Próxima tarefa detalhada — Etapa 156

*(A série desta etapa foi B999–B1000, C368–C369, A103 — a 156 começa em **B1001**, **C370**, **A104**; confira com `grep -oE` antes.)*

**Escolhida: as candidatas técnicas que sobraram, nenhuma do P.O.** (1) **C369** — a camada de comunicação do client (`client/src/services/
api.js`, o ramo do 503) reconhece "o mesmo pedido" por `método-url` **sem os parâmetros**: o segundo pedido ao mesmo endereço com outros
filtros, feito enquanto o primeiro espera o banco, é recusado na hora (`retryCache.has(requestKey)` → `Promise.reject(error)`). Candidata:
a chave com os parâmetros (`config.params` serializado; e o `data` nos verbos que gravam? — medir quem repete POST/PUT pelo 503 antes: repetir
gravação é outra conversa) e, no lugar de recusar o irmão, esperá-lo com a mesma repetição; teste do interceptor (há `api.test.js`? medir) com
dois pedidos de filtros diferentes durante o 503 — os dois repetem; e o mesmo pedido duas vezes — um só espera. É do núcleo: muda todas as
telas — registrar em B o que foi escolhido. (2) **C366** — as telas do Almoxarifado que leem as listas de clientes e de projetos
(`MaterialAlmoxarifadoForm`, `ReservasAlmoxarifado`, `MovimentacoesAlmoxarifado`, `SobrasAlmoxarifado`) engolem o 403 (`.catch(() => ({ data:
[] }))`) e mostram o seletor vazio, calado, a quem perdeu os três módulos com a tela aberta: dizer o motivo (o `formatarErroPermissao` de
`utils/permissaoErro`?) — medir o padrão das telas antes. (3) **C361** — `geocodificarEndereco` (`server/index.js:6798`, o Nominatim) sem
prazo: um `AbortSignal.timeout` e o recuo pela cidade, com teste que injeta a demora (o `atrasoSqlInjetado` não serve — é HTTP de saída;
medir como os testes isolam a rede).
**Pontos de atenção:** (1) a C369 mexe no núcleo — o `test:api` não a vê; a prova é de client (jest com o axios real e um adaptador falso);
(2) a régua das provas de portão agora acusa todo `.use` não literal e o `.use` em toda a API: uma rota nova com `app.use('/api', ...)` cai nos
6 testes da régua de propósito — é o lugar de conferir; (3) os fixtures das Reservas (`__fixtures__/*.json`) são o corpo real do servidor — uma
coluna nova em `clientes` derruba o `listasNotificacoesPortao` (é só acrescentar ao fixture).

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 152 — **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o
resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela de conversões e o grupo acima de família, a régua do
tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens de
produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**, **B101**/G30,
**G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62, a **C348**; nas propostas, a verificação do dono da proposta (Fase
12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a Frente B da lentidão, a **C297** (**B924**), a **B926**,
a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**; no Operacional, a **C332**; do Comercial, a **C354**, a
**C357**/**B988**, a **C359**/**B989** (e a **C360** junto), a **C358**; do núcleo, a **C362**. Pendem de Postgres: **C98**, **C110**. **Nada novo
do P.O. nesta etapa** (a **B999** é reversível e está na letra B).

**O que já está pronto e não precisa reabrir:** os rótulos das Reservas pelo corpo real (`d3ef595a`); a busca do topo pela régua da moldura,
com o usuário efetivo, o Esc, o foco e só o último pedido (`287e6157`, `96da430a`); o produto da OS pelo código codificado (`92178609`); a régua
do texto com o `.use` em toda a API (`ff02028b`, `96da430a`).
