# Etapa 34 (linha `main`) — a ficha do fornecedor

> Design: `docs/superpowers/specs/2026-10-06-crm-lote-compras-outubro-design.md`, seções 1.3 e 4.
> Tasks de origem: nº 7 (dois telefones), 8 (endereço autopreenchido), 9 (CSS). Branch: `main`.
> Baseline antes de começar: `test:api` 170/170; jest do client 44/685 verdes.
>
> **Status: ✅ CONCLUÍDA em 2026-10-06** (branch `c34`, worktree própria). T1 `d151751c` ·
> T2 `a294c3d4` · T3+T4 `977c6022` · T5 = o commit de fechamento (que contém esta marcação e a
> seção da Etapa 34 em `docs/compras-novidades-por-etapa.md`). Final: `test:api` **172/172**
> arquivos; jest **47 suítes / 713 testes**; `CI=true build` compilado sem warning.

## Regras (`grep RN-34`)

- **RN-34.01** `/compras/fornecedores/novo` e `/editar/:id` abrem o `FornecedorForm`; o modal do grupo continua.
- **RN-34.02** `telefone` = Telefone da empresa; **`telefone_vendedor`** = coluna nova; `contato` rotulado "Nome do vendedor"; `celular` intocada.
- **RN-34.03** CNPJ → `GET /api/cnpj/:cnpj` preenche razão, fantasia, e-mail, telefone da empresa, endereço, cidade, estado, CEP; na edição **só vazios**; falha → toast "Não foi possível consultar o CNPJ".
- **RN-34.04** CEP (8 dígitos) → `GET /api/cep/:cep` (ViaCEP) preenche endereço (`logradouro, bairro`), cidade, estado, só vazios; 404 → toast "CEP não encontrado".
- **RN-34.05** POST/PUT gravam as 13 colunas; PUT: **ausente não mexe, `''`/`null` limpa** (grava
  `NULL`). Exceção única: `razao_social` é obrigatória também no PUT (ausente ou `''` → 400).
  `grupo_id`: ausente/`''`/`null` → `NULL` no POST e **limpa** no PUT; inteiro grava **sem validar
  existência** (como hoje); não-inteiro **não vazio** (`'abc'`) → 400 "Grupo inválido".
  ⚠️ Achado da revisão do plano: em `main` o PUT trata `grupo_id: null` como "não mexe"
  (`index.js:20578`), então o botão **"Remover do grupo"** de `FornecedoresDoGrupo.js:191` mostra
  "removido" e **não remove**. A semântica nova conserta isso de tabela — provado pelo cenário (4).
- **RN-34.06** `GET /api/compras/fornecedores/:id` nasce; 404 "Fornecedor não encontrado" (literal já
  usada pelas outras rotas de fornecedor, `index.js:20589`).
- **RN-34.07** 400 "Razão social é obrigatória" (literal existente, `index.js:20559`) / "Status
  inválido" (mesma de `pedidos.js:77`) / "Grupo inválido" (literal **nova**; 'Grupo não encontrado'
  do `index.js:20423` é de outra rota e não se aplica — existência não é validada).
- **RN-34.08** lista mostra os dois telefones.
- **RN-34.09** CSS escopado `.fornecedor-form`, seções Identificação / Contato / Endereço, tokens `--gmp-*`.

## Contratos — ver tabela da seção 4 do design (congelada). Resumo das chaves do fornecedor:
`razao_social*, nome_fantasia, cnpj, inscricao_estadual, contato, email, telefone, telefone_vendedor,
endereco, cidade, estado, cep, grupo_id` (+ `status` no PUT). `GET /:id` devolve também `celular,
foto, created_at, updated_at`, **nunca** `planilha_dados/planilha_nome/planilha_atualizado_em`.

## Ordem: T1 e T2 são **tronco** (servidor, sequenciais, um executor). T3 e T4 são **galhos** contra o contrato (podem rodar em paralelo com T2 se o executor do client mockar o `api` — mock legítimo na fronteira HTTP).

### T1 — tronco: rotas de fornecedor viram módulo + coluna nova + harness (RN-34.02, 05, 06, 07) — ✅ `d151751c`
1. **Harness primeiro**: `server/tests/helpers/testApp.js:46-60` — o stub de `fornecedores` passa a
   espelhar a produção: acrescentar `contato`, `grupo_id INTEGER`, `planilha_dados`, `planilha_nome`,
   `planilha_atualizado_em`, `foto`, **`created_at`/`updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`**
   (o PUT escreve `updated_at` — sem elas o módulo dá "no such column" em todo cenário) e
   **`telefone_vendedor`**. `pedidos.js` é montado em `testApp.js:123` com `(app, db, fakeAuth,
   fakeCheckModulePermission)`; o harness **não** carrega o `index.js`, logo não roda ALTER nenhum —
   montar o módulo novo do mesmo jeito, logo abaixo.
2. **Teste primeiro**: `server/tests/api/comprasFornecedor.api.test.js` (novo, runner próprio como
   `pedidoCompra.api.test.js`). Cenários numerados:
   (1) POST com as 13 colunas → 201 e `SELECT` devolve todas gravadas (inclusive `cidade`, que hoje
   o POST **não grava** — controle positivo natural);
   (2) POST do modal (`razao_social, nome_fantasia, cnpj, grupo_id`) → 201, endereço `NULL`;
   (3) PUT do modal com os 7 textos + `grupo_id` em fornecedor que tinha `cidade` e
   `telefone_vendedor` → os dois **permanecem** (RN-34.05);
   (4) PUT com `telefone_vendedor: ''` → `NULL`; com `null` → `NULL`; **PUT com `grupo_id: null`
   em fornecedor que tinha grupo → `grupo_id` vira `NULL`** (é o corpo exato do "Remover do grupo",
   `FornecedoresDoGrupo.js:191` — hoje no-op; controle positivo: antes do código o teste falha);
   (5) GET `/:id` → 200 com as chaves do contrato e **sem** `planilha_*`; `/9999` → 404 literal;
   (6) POST sem razão → 400 literal; **PUT sem razão e PUT com `razao_social: ''` → 400 literal**;
   PUT `status: 'x'` → 400 "Status inválido"; `grupo_id: 'abc'` → 400 "Grupo inválido";
   `grupo_id: ''` no POST → 201 com `grupo_id NULL`;
   (7) PUT `status: 'inativo'` grava; POST ignora `status`;
   (8) as três rotas exigem `authenticateToken` (`setUser(null)` → 401). ⚠️ **Não** escrever cenário
   de 403 por módulo: `fakeCheckModulePermission` do harness é no-op (`testApp.js:116`) — seria teste
   vazio. O gate de módulo é provado por leitura (o `guard` do módulo) e citado no fechamento.
   Rodar → falha (não há GET `/:id`; POST não grava cidade).
   *(Nota: o `DELETE /api/compras/grupos/:id` sombreado pelo genérico mora no `index.js`, que o harness
   não carrega — não é testável aqui; continua em G do doc de novidades.)*
3. Implementar `server/routes/compras/fornecedores.js` (registrador `module.exports = function (app, db,
   authenticateToken, checkModulePermission)`), com `GET /:id`, `POST`, `PUT`. Validação à mão como
   em `pedidos.js` (em `main` não há Zod em compras). `ALTER TABLE fornecedores ADD COLUMN
   telefone_vendedor TEXT` no `index.js` ao lado dos ALTERs de `celular` (`:19592-19599`, mesmo
   padrão de erro `duplicate` ignorado). Remover o `POST`/`PUT` inline do `index.js:20550-20592` e
   registrar o módulo ao lado do `require('./routes/compras/pedidos')` (mesmo padrão). A ordem em
   relação ao `DELETE` genérico (`:20395`) é **inócua** para este módulo (só GET/POST/PUT; verbos
   diferentes não se sombreiam) — o `DELETE /fornecedores/:id` continua no genérico, como `Compras.js` usa.
   Os textos opcionais gravam `NULL` quando vêm `''` (hoje `nome_fantasia`/`cnpj` gravam `''`;
   nenhum consumidor distingue — `Compras.js:200`, `pedidos.js:280-288` usam `|| null`/`|| ''`).
4. `GET /api/compras/fornecedores` (lista, `index.js:20333`) continua `SELECT *` — não tocar;
   `telefone_vendedor` chega sozinho.
5. Rodar o arquivo novo + `pedidoCompra*.api.test.js` + `comprasMinimos` (o pedido lê fornecedor) → verde.

### T2 — tronco: proxy de CEP (RN-34.04) — ✅ `a294c3d4`
1. **Teste primeiro** `server/tests/api/cep.api.test.js`: montar `server/routes/cep.js` no app de
   teste com um `fetch` injetado (o módulo recebe `{ fetchImpl }` opcional para o teste; produção
   usa o `fetch` global). Cenários: 8 dígitos com hífen → 200 `{cep, logradouro, bairro, cidade,
   estado}`; ViaCEP responde `{erro: true}` → 404 "CEP não encontrado"; `fetch` rejeita/timeout →
   502 "Serviço de CEP indisponível"; 7 dígitos → 400 "CEP deve ter 8 dígitos"; sem token → 401.
2. Implementar `server/routes/cep.js` (`GET /api/cep/:cep`, `authenticateToken`, timeout 8s com
   `Promise.race` como o de CNPJ) e registrá-lo no `index.js` ao lado do `/api/cnpj/:cnpj` (`:3487`).

### T3 — galho: `FornecedorForm` (RN-34.01, 02, 03, 04, 07, 09) — ✅ `977c6022`
1. **Teste primeiro** `client/src/components/compras/FornecedorForm.test.js` (mock de
   `../../services/api` e **`react-toastify`** — é a única lib de toast de `main`
   (`client/package.json:25`; `react-hot-toast` NÃO existe aqui); montar com `MemoryRouter` + `Routes` para
   `/compras/fornecedores/novo` e `/editar/:id`). Cenários:
   (a) `/novo` renderiza as três seções e os campos (testids `fornecedor-razao, -fantasia, -cnpj, -ie,
   -contato, -email, -telefone, -telefone-vendedor, -endereco, -cidade, -estado, -cep, -grupo`; `-status` só na edição);
   (b) submit sem razão → `role="alert"` com "Razão social é obrigatória" e **nenhum** POST;
   (c) POST exato com as 13 chaves (`grupo_id: ''` → "Sem grupo") + toast "Fornecedor salvo" + navigate `/compras/fornecedores`;
   (d) edição: GET `/compras/fornecedores/:id` → campos preenchidos → PUT com as 13 + `status`;
   (e) CNPJ: digitar 14 dígitos válidos e sair do campo em `/novo` → GET `/cnpj/<digitos>` → razão, fantasia, endereço, cidade, estado, CEP, telefone preenchidos; na edição com cidade já digitada, a cidade **não** muda;
   (f) CNPJ: `api.get` rejeita → toast de erro, campos intactos;
   (g) CEP: sair do campo com `01310-100` → GET `/cep/01310100` → endereço "Avenida Paulista, Bela Vista", cidade, estado; CEP 404 → toast "CEP não encontrado";
   (h) máscara: digitar `11987654321` no telefone do vendedor mostra `(11) 98765-4321`;
   (i) erro 400 do servidor no submit vai para `role="alert"`.
   Rodar → falha (o componente não existe).
2. Implementar `client/src/components/compras/FornecedorForm.js` + `FornecedorForm.css`:
   - cabeçalho com título "Novo fornecedor"/"Editar fornecedor" e botão Voltar;
   - `<form className="fornecedor-form">` com `.form-section > h2` (Identificação: razão*, fantasia,
     CNPJ com lupa `.btn-buscar-cnpj`, IE, grupo `<select>` de `GET /compras/grupos`, status na edição;
     Contato: nome do vendedor, telefone da empresa, telefone do vendedor, e-mail; Endereço: CEP com
     busca, endereço (full-width), cidade, estado `<select>` com as 27 UFs);
   - `client/src/utils/cnpj.js` **novo**: `somenteDigitos`, `formatarCNPJ`, `validarCNPJ` (dígitos
     verificadores — copiar a lógica de `ClienteForm.js:168`, com teste `cnpj.test.js`),
     `camposDaConsultaCNPJ(data)` → `{razao_social, nome_fantasia, email, telefone, endereco, cidade,
     estado, cep}` montando `endereco` como o ClienteForm (`logradouro, numero - complemento, bairro`);
   - preenchimento "só vazios" na edição: função pura `mesclarSoVazios(form, novos)` no mesmo util, testada;
   - CSS escopado em `.fornecedor-form` com tokens (`--gmp-surface`, `--gmp-border`, `--gmp-text`,
     `--radius-md`, `--shadow-sm`), grid `repeat(auto-fit, minmax(260px, 1fr))`, `@media (max-width:
     640px)` uma coluna, foco com anel `rgba(79,172,254,.15)`, botão primário no gradiente azul da GMP
     (ver `ClienteForm.css:109-121`). **Não** definir `.form-group`/`.form-grid` globais — só sob
     `.fornecedor-form`.
3. Rotas: `client/src/App.js` — acrescentar `fornecedores/novo` e `fornecedores/editar/:id` ao lado
   das rotas de `pedidos/novo` (o React Router 6 ranqueia por especificidade; a posição em relação ao
   `path="*"` **não** importa — o que importa é a rota existir, como o comentário em `App.js:348-349`
   diz); `lazyModules.js`
   — `export const FornecedorForm = page(() => import('../components/compras/FornecedorForm'))`.
4. Jest do arquivo → verde; `CI=true build` limpo.

### T4 — galho: lista mostra os dois telefones (RN-34.08) — ✅ `977c6022` (mesmo commit da T3)
`client/src/components/Compras.js:205` — célula Telefone vira `cell-primary` (empresa) +
`cell-secondary` (vendedor, se houver); exportação para Excel ganha a coluna "Telefone vendedor".
Teste: se existir `Compras.test.js` em `main` (não existe — criar `Compras.fornecedores.test.js`
mínimo: lista com um fornecedor com os dois telefones mostra os dois).

### T5 — integração e fechamento — ✅ (commit de fechamento)
Suíte inteira (cinco comandos do servidor + jest + build). Marcar este plano; seção da Etapa 34 no
`docs/compras-novidades-por-etapa.md`; ~~`specs/modulo-compras/README.md`~~. Um commit por assunto (T1,
T2, T3+T4 podem ser três commits), sem trailer.
> **Divergência do plano:** `specs/modulo-compras/README.md` **não** foi tocado nesta worktree por
> instrução do orquestrador do lote (as três etapas rodam em worktrees paralelas e o índice do
> módulo é editado uma vez só, na integração — evita conflito de merge no mesmo arquivo).

## Divergências e decisões tomadas sem perguntar (caminho reversível)

- **Lupa do CNPJ na edição valida os dígitos antes de consultar.** RN-34.03 diz "ao clicar na
  lupa (sempre)"; com CNPJ de dígito verificador errado a lupa mostra toast "CNPJ inválido.
  Verifique os dígitos." e **não** chama o proxy (que devolveria 400/404 de qualquer jeito).
  Reversível: tirar a checagem em `buscarCNPJ`.
- **ViaCEP devolve `{"erro": "true"}` como STRING**, não `{erro: true}` como o plano escreveu.
  O proxy aceita os dois (teste para cada um). O plano estava impreciso nesse detalhe.
- **`routes/cep.js` aceita `timeoutMs`** além de `fetchImpl` (o plano só previa `fetchImpl`):
  sem isso o cenário de timeout esperaria 8 s. Produção continua 8 s.
- **Cenários além dos numerados em T1:** `PUT /9999` → 404; `grupo_id: '4'` (string numérica)
  grava 4; textos opcionais `''` no POST gravam `NULL` (o plano previa só a mudança, não o teste);
  `POST grupo_id: 'abc'` → 400 (o plano só citava o PUT).
- **Resposta do POST:** `nome_fantasia` volta `null` quando vazio (antes voltava `''`). Nenhum
  consumidor lê esse campo da resposta (`FornecedoresDoGrupo.js` recarrega a lista).
- **CEP no cadastro novo também é "só vazios"** (RN-34.04 diz "só os vazios" sem distinguir
  novo/edição — mantido literal). O CNPJ no cadastro novo preenche tudo que a consulta trouxe.
- **Sem `requestSubmit`/testing-library:** os testes do client seguem o padrão da base
  (`createRoot` + `act` + eventos nativos), como `Categorias.test.js`.

## Pontos de atenção
- **Semântica do PUT muda.** Hoje (`index.js:20568-20592`): `nome_fantasia`/`cnpj` ausentes viram
  `''`, `contato/email/telefone/endereco` ausentes viram `NULL`, e `grupo_id` ausente **ou `null`**
  não mexe. O único consumidor do PUT em `main` é o modal de `FornecedoresDoGrupo.js`: os três
  `api.put` (`:131`, `:167`, `:191`) mandam exatamente 8 chaves (os 7 textos + `grupo_id`), nenhum
  manda `status`. Com a semântica nova o único comportamento visível que muda é o "Remover do grupo"
  (`:191`, `grupo_id: null`), que passa a funcionar. Cenários (3) e (4). Registrar em B2.
- O proxy de CNPJ (`index.js:3487`) devolve `{success, source, data}` — o client lê `resp.data.data`;
  o `data` já traz `cidade` e `estado` normalizados (`:3530-3533`), além de `municipio`/`uf`.
- `ClienteForm.js` **não é tocado** (o comercial não está no lote).
- Só a ViaCEP precisa de normalização: `localidade` → cidade, `uf` → estado.
- `mascararTelefoneCompleto` ao carregar na edição (o ClienteForm faz; o form antigo da branch não fazia).

## Retro

- **Rodadas de correção até verde: 0.** Cada task ficou verde na primeira implementação após o
  vermelho do teste — por isso cada uma foi **sabotada** de propósito para provar que o teste
  sabe falhar (números abaixo).
- **Achados da revisão:** a revisão do plano (antes da execução) já tinha achado o real — o
  "Remover do grupo" no-op; o cenário (4) o provou vermelho→verde. Durante a execução, um achado
  pequeno e real: a ViaCEP devolve `erro` como string `"true"` — um proxy que checasse só o
  booleano responderia 200 com endereço vazio para CEP inexistente. Nenhum ruído.
- **Paralelismo:** nenhum dentro da etapa — um executor só, T1→T2→T3→T4 em sequência (as três
  suítes finais rodaram em paralelo em background). O paralelismo do lote é entre etapas
  (worktrees `c33`/`c34`/`c35`).
- **Defeito escapado (achado pela revisão adversarial do lote, antes do push):** **F1** — a carga
  da edição mascarava o CNPJ com a função **progressiva** (`formatarCNPJ`), que corta em 14 dígitos
  e descarta letras: fornecedor gravado com `"ISENTO"` abria com o campo vazio e o Salvar gravava
  `NULL`; `"12345678901"` virava `"12.345.678/901"`. Nenhum dos 16 cenários do form usava CNPJ
  fora do padrão. Corrigido na onda abaixo.

## Onda de correção — revisão adversarial do lote (2026-10-06, em `main`)

Revisor fresco em worktree própria (`review-lote`), 7/7 sabotagens pegas pelos testes
(PUT substituição total 19/22; `grupo_id null` no-op 21/22; `INSERT` com `data_entrega` 24/25;
leitura projetando `data_entrega` 23/25 + 9/10; proxy ignorando `erro:"true"` 7/8; CNPJ
sobrescrevendo na edição 15/16; `unidade_consumo` de volta ao payload 21/22). Achados reais, todos
reproduzidos antes de corrigir:

| # | Sev. | Achado | Correção | Prova |
|---|---|---|---|---|
| F1 | Major | `formDoServidor` usava `formatarCNPJ` (progressiva) na carga → CNPJ legado fora de 14 dígitos corrompido/apagado ao salvar sem tocar | `formatarCNPJCompleto` em `utils/cnpj.js` (só mascara com exatamente 14 dígitos e nenhuma letra; senão devolve como veio — regra de `formatarCEP`/`mascararTelefoneCompleto`), usada só na carga; a progressiva fica no `onChange` | `cnpj.test.js` (ISENTO, 11 dígitos, `DE123…`, `A11222333000181`); `FornecedorForm.test.js` (j): editar `"ISENTO"` + Salvar → PUT com `"ISENTO"`; 14 dígitos crus abrem mascarados. Sabotagem (voltar à progressiva): **1 vermelho**; regex `\D`→`D`: **1 vermelho** |
| F2 | Minor | Cadastro novo: segundo blur no **mesmo** CNPJ re-consultava e sobrepunha o endereço que o usuário tinha corrigido | `useRef` com o último CNPJ consultado; o blur só consulta quando mudou; a lupa continua sempre | `FornecedorForm.test.js` (j): 2 blurs → 1 consulta, endereço corrigido preservado. Sabotagem: **2 vermelhos** |
| F3 | Major | `index.js`: os `ALTER TABLE fornecedores` são `db.run` soltos (fora de `db.serialize`) e em banco **novo** chegam antes do `CREATE` — medido no log do primeiro boot do container (`no such table: fornecedores` para `grupo_id`, `planilha_*`, `foto`); `telefone_vendedor` tinha a mesma exposição. Até reiniciar, `POST` e `GET /:id` do módulo novo → 500 | `ALTERS_FORNECEDORES` roda no **callback** do `CREATE` (ordem garantida); os dois blocos soltos viraram ponteiros | Não há teste de boot no harness (o `index.js` não é carregado). Prova: rebuild da imagem `crm-gmp:local` + container com volume **novo** → log sem `no such table: fornecedores` — ver "Como foi executado" |
| F4 | — | A imagem `crm-gmp:local` que o André subiu era anterior ao lote (sem `routes/compras/fornecedores.js`) | Rebuild no fechamento | — |

Refutados pelo revisor (tentou e não quebrou): RN-34.05 com os corpos exatos dos três `api.put`
do modal; RN-33.03/05 pedido antigo; RN-35.01 pela rota; RN-34.03/04 ordem CNPJ×CEP; autorização
das rotas novas (`guard` real, inline antigas removidas, sem rota duplicada).

## Como foi executado

Worktree `CRM-wt-c34`, branch `c34` a partir de `main` (`9188c2c2`). TDD estrito por task.

| Task | Commit | Teste | Vermelho antes | Controle positivo (sabotagem) | Verde |
|---|---|---|---|---|---|
| T1 | `d151751c` | `comprasFornecedor.api.test.js` | `MODULE_NOT_FOUND`; depois, contra um **porte literal do código antigo** do `index.js`: **13 vermelhos de 22** (cidade/IE não gravadas, PUT zerando cidade, `grupo_id: null` no-op, GET /:id 404, status/grupo sem validação, GET sem 401) | (o porte do código antigo foi o controle) | 22/22 |
| T2 | `a294c3d4` | `cep.api.test.js` | `MODULE_NOT_FOUND` | cidade lendo `dados.cidade` + `erro` string ignorado → **2 vermelhos de 8** | 8/8 |
| T3 | `977c6022` | `cnpj.test.js` | `Cannot find module` | 2º dígito verificador ignorado + `mesclarSoVazios` sobrescrevendo → **2 vermelhos de 10** | 10/10 |
| T3 | `977c6022` | `FornecedorForm.test.js` | `Cannot find module` | edição sem "só vazios" + PUT sem `status` + razão vazia liberada → **3 vermelhos de 16** | 16/16 |
| T4 | `977c6022` | `Compras.fornecedores.test.js` | **2 vermelhos de 2** (célula sem `.cell-primary`; Excel sem a coluna) | (o vermelho natural foi o controle) | 2/2 |

Suítes depois de cada tronco: `pedidoCompra*` 24+10+13+10 e `comprasMinimos` 1/1 verdes com o
stub de `fornecedores` ampliado (T1).

Final, tudo medido nesta worktree:
- `cd server && npm run test:api` → **172/172 arquivos de teste OK** (170 existentes + 2 novos).
- `npm run test:almoxarifado` 42/0 · `test:validation` 4/0 · `test:safealter` 3/0 · `test:sqlite` 5/0.
- `cd client && CI=true npx react-scripts test --watchAll=false` → **47 suítes / 713 testes**
  (era 44/685: +3 suítes, +28 testes = 10 + 16 + 2).
- `CI=true npx react-scripts build` → "Compiled successfully", exit 0, sem warning de lint.
- `git ls-files --eol` / `perl` → 0 linhas com CR em todos os arquivos tocados.

Gate de módulo (não testável no harness — `fakeCheckModulePermission` é no-op): provado por
leitura — `routes/compras/fornecedores.js` monta `guard = [authenticateToken,
checkModulePermission('compras')]` nas três rotas; `routes/cep.js` usa `authenticateToken`
(mesmo gate do `/api/cnpj`, que também não exige módulo).

### Próxima tarefa detalhada

Não há T6 nesta etapa. O que fica declarado para depois (ver "O que a etapa NÃO cobre" no doc
de novidades): o modal de `FornecedoresDoGrupo.js` continua com 7 campos (pode consumir o
`GET /:id` + os 13 campos — contrato na seção 4 do design); `GET /api/compras/fornecedores`
(lista) continua `SELECT *` com `planilha_dados` (G2 — a projeção `COLUNAS_FICHA` do módulo é o
modelo); `specs/modulo-compras/README.md` recebe a linha desta etapa na integração do lote.
