# Etapa 111 — o log de acesso negado com o nome do módulo; as listas parciais de módulo derivadas da fonte (G17)

> Frente **Compras/core**, worktree `CRM-wt-e111`, branch `etapa-e111` (de `main` `0686c3a8`). Design (Fase 0 medida):
> `docs/superpowers/specs/2026-10-15-crm-etapa111-listas-parciais-de-modulo-design.md`. Em paralelo com a Etapa 110 do
> almoxarifado — não toca material, família nem os quatro documentos do almoxarifado ("Para o integrador" no fim).

> **Estado (2026-10-15):** 🟢 fechada — T1–T7 feitas; commits e números medidos no fim.

## Regras de negócio

### Log de acesso negado do servidor (`services/acessoNegadoLog.js`, `services/modulosSistema.js`)
- **RN-111.01** Uma rota do servidor que nega o módulo grava em `logs_auditoria` (`tipo = 'acesso_negado'`) a coluna
  `nome_modulo` com o nome da fonte única (`MODULOS_SISTEMA[].nome`): comercial "Comercial", compras "Compras",
  financeiro "Financeiro", operacional "Operacional", engenharia "Cálculos de Engenharia", engenharia_projetos
  "Engenharia / Projetos", almoxarifado "Almoxarifado", frota "Frota", todolist "TODOLIST", administrativo
  "Administrativo", admin "Administração", relatorios "Relatórios". Os 7 que já tinham nome ficam **iguais**; os 4
  (engenharia_projetos, almoxarifado, frota, todolist) deixam de ir crus. Cenário: banco de verdade com a DDL de
  `logs_auditoria`, uma chamada por chave → a linha tem `modulo` = a chave e `nome_modulo` = o nome.
- **RN-111.02** A combinação do `checkAnyModulePermission` (`'engenharia|engenharia_projetos'`) grava
  `nome_modulo = 'Cálculos de Engenharia ou Engenharia / Projetos'` (era a chave crua); chave desconhecida continua
  crua (`'xyz'` → `'xyz'`), e na combinação a parte desconhecida também. A coluna `modulo` não muda. Usuário, e-mail,
  IP, agente e `tipo` como antes (nome do usuário do banco; sem usuário no banco → `req.user.email`).
- **RN-111.03** (fiação) `index.js` não tem mais mapa de nomes próprio: `registrarTentativaAcessoNegado` chama o serviço.

### Nome do módulo no cliente (`client/src/constants/modulosMeta.js`)
- **RN-111.04** `NOMES_MODULO` (objeto literal, 11 chaves, os nomes do acesso negado de hoje — admin "Administração").
  Teste cruzado: `NOMES_MODULO[k]` = `nome` do servidor para as 11 chaves de `MODULOS_ORDEM`; e cada
  `<ProtectedModuleRoute modulo="k" nomeModulo="N">` do `App.js` tem `N = NOMES_MODULO[k]` (11 de 11).
- **RN-111.05** `ProtectedModuleRoute` usa `NOMES_MODULO` no lugar do mapa próprio (o fallback quando a rota não passa
  `nomeModulo`); sem mudança visível. Teste de tela: acesso negado de `almoxarifado` sem `nomeModulo` mostra
  "Almoxarifado", de `admin` mostra "Administração".
- **RN-111.06** `ModuleLoading` lê `NOMES_MODULO`; `sistema` e chave desconhecida → "Orion" (como antes). **Única mudança
  visível da etapa:** engenharia passa de "Carregando Engenharia..." a **"Carregando Cálculos de Engenharia..."** (B62).
  Teste: as 11 + `sistema` + desconhecida.

- **RN-111.09** (entrou na Fase 2, M1) o filtro "Todos os Módulos" da tela **Logs de Auditoria** oferece os 11 módulos
  de `MODULOS_ORDEM`, rotulados por `NOMES_MODULO` (valor = a chave; filtra `modulo` por igualdade, como antes). Muda o
  que a tela mostra: entram Cálculos de Engenharia, Engenharia / Projetos, Almoxarifado, Frota, TODOLIST; "Admin" passa
  a "Administração" (B62). Teste de tela: as 12 opções (com "Todos os Módulos") e escolher Almoxarifado manda
  `modulo=almoxarifado`.

### Rota → módulo (`moduloDaRota`)
- **RN-111.07** `moduloDaRota(path)` devolve a chave do módulo cuja `MODULOS_META.rota` é prefixo de `path`
  (`startsWith`, sem fronteira — como hoje), o prefixo **mais longo** primeiro; nenhum → `null`. Tabela de
  caracterização, verde nos três consumidores **antes** da troca: `/comercial`, `/comercial/clientes`, `/frota/x`,
  `/todolist`, `/compras/pedidos`, `/financeiro`, `/fabrica/os`, `/configuracoes`, `/admin/usuarios`,
  `/engenharia-projetos/os`, `/engenharia`, `/engenharia/tampo`, `/almoxarifado/requisicoes`, `/chat`, `/`,
  `/minha-conta`. `ProtectedModuleRoute.getModuloFromPath` e `lazyModules.prefetchModuleByRoute` passam a usá-la;
  `Layout.getActiveModuleFromPath` = `moduloDaRota` com `comercial` e `null` → `'crm'`. Mesmo resultado para toda a
  tabela.

### "Sem nenhuma linha de permissão" — congelado, não alinhado (B63)
- **RN-111.08** As três regras ficam como estão, nomeadas: cliente `MODULOS_LIBERADOS_SEM_PERMISSAO_PORTAO =
  ['comercial', 'frota']` (`hasModuleAccess`), `MODULOS_LIBERADOS_SEM_PERMISSAO_SELECAO = ['comercial']`
  (`TipoSelecao`, nos quatro pontos em que libera Comercial por falta de permissão); servidor
  `MODULOS_LIBERADOS_SEM_GRUPO = ['comercial']` (`checkModulePermission` e `checkAnyModulePermission`, só quando não há
  grupo ativo). Testes: `hasModuleAccess([], k)` → true só para comercial e frota (das 11), `admin` → false; com uma
  linha qualquer → só o módulo da linha; seleção com `permissoes: []` → só Comercial disponível. Teste cruzado: portão −
  servidor = `['frota']`, seleção = servidor; cai (e manda atualizar a B63) se alguém alinhar; fiação (`index.js` usa a
  constante nos dois portões, sem `=== 'comercial'`).

## Contratos congelados
- Nenhuma rota nova, nenhuma resposta muda. `POST /api/auditoria/tentativa-acesso` inalterado.
- `logs_auditoria.nome_modulo` das linhas **novas** de 403 do servidor: os nomes da RN-111.01/02 (linhas antigas ficam
  como estão — não há migração; A10 dá a consulta para ver quantas existem com chave crua).
- Literal de tela que muda: `Carregando Cálculos de Engenharia...` (era `Carregando Engenharia...`). Nenhuma outra.

## Tasks (todas `tronco`, em série — cada uma lê a fonte que a anterior criou)
- [x] **T1** (`965abd13`) servidor: `nome` em `MODULOS_SISTEMA`, `nomeDoModulo`, `services/acessoNegadoLog.js`, `index.js` chama;
  teste `acessoNegadoLog.api.test.js` (RN-111.01–03) vermelho antes nos 4 + combinação. Controles: nome do almoxarifado
  trocado; `nomeDoModulo` devolvendo a chave; o mapa literal de volta no `index.js`.
- [x] **T2** (`49b80c84`) cliente: `NOMES_MODULO` + `ProtectedModuleRoute`; cruzado (RN-111.04) e tela (RN-111.05).
- [x] **T3** (`cd438336`) cliente: `ModuleLoading` (RN-111.06).
- [x] **T3b** (`d40f4659`) cliente: filtro de módulo da tela Logs (RN-111.09).
- [x] **T4** (`c29331e5`) cliente: `moduloDaRota` + os três consumidores (RN-111.07), caracterização antes. **Divergência:** um commit para os três, não um por consumidor — a tabela de caracterização cobre os três no mesmo arquivo.
- [x] **T5** (`05f4c34f`; o lado do servidor em `965abd13`) congelar o "sem linha" (RN-111.08): listas nomeadas nos dois lados, testes de comportamento antes, cruzado.
- [x] **T6 (integração cruzando as pontas)** o teste cruzado roda os três conjuntos juntos (nomes servidor x
  `NOMES_MODULO` x `App.js`; rotas `MODULOS_META.rota` = prefixos de `moduloDaRota`; "sem linha" nos três portões) e o
  `acessoNegadoLog` grava pela mesma função que o `index.js` chama (fiação + execução).
- [x] **T7** fechamento: suítes, revisão adversarial, docs.

## Fora (declarado no design): splash, prefetch de chunk, requisição por módulo/e-mail (almoxarifado), setores semeados,
árvore de rotas e menus, `isProtectedModuleRoute` (tem `/chat`); B60 (P.O.).

## Fase 2 — revisão do plano (agente fresco, 2026-10-15) e o que mudou
Equivalência da RN-111.07 conferida **por execução** (sonda com 82 caminhos nos três consumidores: 0 divergências;
controle sem ordenar pelo prefixo mais longo derruba `/engenharia-projetos*`). Achados:
- **(M1) a medição deixou de fora o filtro de módulo da tela Logs de Auditoria** (`Logs.js`): 6 opções escritas à mão
  (comercial, compras, financeiro, operacional, administrativo, admin **"Admin"**), filtrando `modulo` por igualdade —
  justamente a tela que esta etapa muda: o 403 de almoxarifado passa a aparecer "Almoxarifado" na coluna e o filtro
  não o seleciona. **Entrou: T3b** — o filtro deriva de `MODULOS_ORDEM` + `NOMES_MODULO` (11 opções; admin passa a
  "Administração", o nome da coluna). **RN-111.09**. A combinação `engenharia|engenharia_projetos` não casa com
  igualdade nenhuma (antes e depois) — declarado.
- **(M2) mais dois mapas rota → módulo em `ModuleSplash.js`** (`getModuleFromPath`, 6 módulos, `/admin` →
  `administrativo`; `isProtectedRoute`, cópia do `isProtectedModuleRoute` com `/chat`). Sem efeito visível hoje (o
  `isProtectedRoute` sai antes). Fora, declarado; a contagem do design foi corrigida (seis mapas, não quatro).
- **(M3) fiação da RN-111.08 incompleta:** `checkAnyModulePermission` usa `mods.includes('comercial')` e a lista vazia
  cai em `checkModulePermission('comercial')` (`index.js`). A fiação proíbe `'comercial'` dentro do corpo dos dois
  portões; a linha da lista vazia **fica** (é o portão de comercial, não o "sem grupo") e é declarada.
- **(B) erro de fato:** "almoxarifado (8 rotas)" — o 8 contou testes; o portão real é **um** `app.use('/api/almoxarifado')`
  sobre o router inteiro (como frota). Corrigido no design.
- **(B)** "Preparando {nome}" (o `ModuleLoading` cheio) também muda para engenharia — sem caminho que o desenhe com
  `engenharia` hoje (só `sistema`/`operacional`); entrou no contrato. A mudança aparece também no `RouteLoading` do
  `Layout` (roteiro manual).
- **(B)** formato de `NOMES_MODULO` fixado (`chave: 'Nome',`, aspas simples) — escrito no comentário do objeto.
- **(B)** T6: a conferência "rotas = prefixos de `moduloDaRota`" seria tautológica e não roda no servidor — tirada; a
  tabela de comportamento fica no jest do cliente.
- **(B)** `nomeDoModulo(null)` devolve `null` (o mapa antigo, `undefined`) — os dois viram NULL; sem efeito.

## Execução — o que foi feito (divergências incluídas)
- **T1** (`965abd13`) — teste do log escrito antes (vermelho: o serviço não existia). Controles: nome do almoxarifado
  trocado, `nomeDoModulo` devolvendo a chave, o mapa literal de volta no `index.js` — todos vermelhos na asserção
  certa, md5 conferido na volta. **Divergência (Fase 5, M1):** os portões de módulo saíram do `index.js` para
  `services/portaoDeModulo.js` (mesmo corpo; `db` → `getDb()`, o log por parâmetro), porque nenhum teste os executava.
  `portaoDeModulo.api.test.js` (11) roda os dois portões com banco de verdade; controles (5): `includes` → `.length`
  (quem não tem grupo ganha tudo), chamada do log apagada, `join('|')` → `[0]`, `some` → `every`, grupo inativo contando
  — todos vermelhos. Prova de boot (`node index.js`, pasta de dados vazia, JWT de teste): 403 em `/api/frotas/veiculos`,
  `/api/almoxarifado/materiais`, `/api/engenharia/materiais-escritorio` e o log com "Frota", "Almoxarifado",
  "Cálculos de Engenharia ou Engenharia / Projetos" (sonda `msg-e111-boot.js` no scratchpad da sessão).
- **T2** (`49b80c84`) — tela verde no código antigo (2 de 3; o de `NOMES_MODULO` nasceu vermelho). Controles: nome no
  `App.js`, em `NOMES_MODULO` e no servidor trocados — cruzado vermelho nomeando a chave.
- **T3** (`cd438336`) / **T3b** (`d40f4659`) — nasceram vermelhos (engenharia; filtro com 6). Controle: o
  `ModuleLoading` mostrando a chave → 3 vermelhos.
- **T4** (`c29331e5`) — caracterização rodada **no código antigo** (as três funções do HEAD, só com `export`): verde.
  Controles: sem ordenar pelo prefixo (3 vermelhos), Layout sem o `comercial → crm`, prefetch que não aquece — vermelhos.
- **T5** (`05f4c34f`) — comportamento verde no antigo (`hasModuleAccess`, seleção sem linha / com falha / sem id).
  Controles: portão concedendo Compras, seleção concedendo Frota, os literais de volta (servidor e cliente), servidor
  alinhado com Frota — vermelhos. **Divergência:** o teste "sem usuário → só Comercial" acrescentado na Fase 5 estava
  **errado** — sem usuário a tela só mostra "Carregando..." (os dois pontos sem usuário não têm efeito visível); o
  teste prende isso, e o "usuário sem id" prende o outro ponto (controle: aquele ponto com `false` → vermelho).

## Fase 5 — revisão adversarial final (dois agentes frescos em paralelo, 2026-10-15)
**Servidor: 0 altos, 1 médio, 1 baixo — os dois reais e corrigidos; 3 conferidos sem achado.**
1. (Média, reproduzido) a regra do "sem grupo" sem teste de comportamento: trocar a condição por
   `MODULOS_LIBERADOS_SEM_GRUPO.length` (quem não tem grupo ganha todos os módulos) passava a suíte inteira — o
   `testApp` usa um portão falso e a fiação só contava o nome. **Corrigido:** portões extraídos e executados (T1).
2. (Baixa, reproduzido) as chamadas do log dentro dos portões sem teste (apagar a do "sem grupo", `join` → `[0]`).
   **Corrigido** pelo mesmo teste.
3. Conferidos: o registro grava o mesmo de antes exceto `nome_modulo`; `some` ≡ `includes` com a lista de um item;
   entradas estranhas de `nomeDoModulo` sem efeito real (todas as chamadas usam chave literal; a chave `constructor`
   agora volta crua, antes daria a função `Object`).
**Cliente: 0 altos, 0 médios, 3 baixos — 1 corrigido, 1 ruído, 1 declarado.**
4. (Baixa) os dois pontos sem usuário do `TipoSelecao` sem teste — teste acrescentado (e a medição mostrou que não têm
   efeito visível; ver T5).
5. (Baixa) "o `objetoDoCliente` lê comentário" — **ruído:** o teste tira os comentários antes de procurar; comentar a
   linha da engenharia em `NOMES_MODULO` derruba 2 cenários (conferido).
6. (Baixa, declarado) o regex do `App.js` só conta a forma `modulo="x" nomeModulo="Y"`; uma 12ª rota sem `nomeModulo` não
   entra (usaria o fallback `NOMES_MODULO` — inofensivo).
Conferido sem achado: 155 caminhos nos três mapas antigos x `moduloDaRota` (0 diferenças), sem ciclo de import, mudança
visível só a declarada.

## Retro (4 números)
- Rodadas de correção até verde: **2** (Fase 2 — plano, T3b e a fiação; Fase 5 — extração dos portões e um teste).
- Achados de revisão: Fase 2 **9** (3 médios, 6 baixos), todos reais e incorporados; Fase 5 **8** (1 médio e 7
  baixos; 4 corrigidos, 1 declarado, 1 ruído, 2 conferidos), 0 altos.
- Paralelismo: **0 galhos** (T1→T5 em série — todas leem a fonte que a anterior criou); a revisão da Fase 2 rodou em
  paralelo com o teste vermelho da T1, as duas da Fase 5 em paralelo entre si e com a suíte; sem retrabalho.
- Defeito escapado: preencher na próxima etapa de Compras. (Da 109: nenhum conhecido.)

## Commits (branch `etapa-e111`)
- `965abd13` log de acesso negado com o nome; portões de módulo em `services/portaoDeModulo.js`; `MODULOS_LIBERADOS_SEM_GRUPO`.
- `49b80c84` `NOMES_MODULO` + `ProtectedModuleRoute`; cruzado nomes servidor x cliente x `App.js`.
- `cd438336` `ModuleLoading`.
- `d40f4659` filtro de módulo da tela Logs.
- `c29331e5` `moduloDaRota` e os três consumidores.
- `05f4c34f` "sem nenhuma linha" congelado (cliente + cruzado).
- docs — este plano, o design, `compras-novidades-por-etapa.md`, `specs/modulo-compras/README.md`.

**Medido na árvore final** (código de `05f4c34f`; servidor e build medidos antes da última correção, que só tocou um
teste do cliente — `TipoSelecao.modulos.test.js`): `test:api` **365/365**; `test:almoxarifado` verde (EXIT 0);
`test:validation` 4/4, `test:safealter` 3/3, `test:sqlite` **10/10**; client **115 suítes / 1602 testes** (depois da
correção); `CI=true react-scripts build` **Compiled successfully**.

## Próxima de Compras: a definir
Candidatas medidas que restam:
- **Depende do P.O.:** **B63** (a regra do "sem nenhuma linha de permissão" — um commit pequeno em
  `modulosMeta.js`/`modulosSistema.js` + os cenários do cruzado e do `portaoDeModulo.api.test.js`); **B62** (o Admin com
  um nome só?); **B60** (TODOLIST/Admin/Relatórios no admin de módulo); **G9** (`canConfigureModule` cliente x
  servidor); **B57** (botões de alternância → abas?); **G15**; **D-35/D-37**.
- **Depende de dado de produção (ação do André, não do P.O.):** limpeza das duplicatas do **G16** se a **A9** der linha;
  **A10** (opcional, só o texto do log).
- **Já em andamento fora de Compras:** **B61** (corrida família x material) — Etapa 110 do almoxarifado.
- **Sem dependência, valor baixo (medido aqui):** `ModuleSplash.getModuleFromPath` (6 módulos, `/admin` →
  `administrativo`, diferente dos outros mapas) e `isProtectedRoute` (cópia do `isProtectedModuleRoute` do `App.js`,
  com `/chat`) — sem efeito visível hoje (o `isProtectedRoute` sai antes); derivar exige caracterizar a splash do Layout.
  E a combinação `engenharia|engenharia_projetos` sem opção no filtro da tela Logs.
**Conclusão:** em Compras/core não resta trabalho de valor que não dependa do P.O. ou de dado de produção — só a
limpeza de baixo valor do `ModuleSplash`.

Pontos de atenção para quem pegar: nome de módulo novo entra em `MODULOS_SISTEMA[].nome` (servidor) **e**
`NOMES_MODULO` (cliente) — o cruzado cai se só um lado mudar; rota de módulo nova entra só em `MODULOS_META.rota`
(`moduloDaRota` deriva); qualquer mudança no portão de módulo do servidor se prova em `portaoDeModulo.api.test.js`
(o `testApp` continua com o portão falso).

## Para o integrador — texto para os quatro docs do almoxarifado
Esta etapa **não** tocou `docs/almoxarifado-novidades-por-etapa.md`, `docs/almoxarifado-guia-etapas-e-testes.md`,
`docs/almoxarifado-manual-do-sistema.md` nem `specs/modulo-almoxarifado/README.md` (a 110 os edita em paralelo), e não
editou a entrada **B61** de `docs/compras-novidades-por-etapa.md`. O que cabe:
1. **`docs/almoxarifado-manual-do-sistema.md`** — se houver seção sobre acesso ao módulo ou auditoria: "Quando alguém sem
   acesso tenta abrir o Almoxarifado (pela tela ou por uma operação), a tentativa aparece em Administração → Logs de
   Auditoria com o módulo **Almoxarifado**, e o filtro de módulo daquela tela permite selecioná-lo." Sem número de etapa.
2. **`docs/almoxarifado-novidades-por-etapa.md`** — nada obrigatório; se quiser uma linha: "Logs de Auditoria: as
   negações do almoxarifado registradas pelo servidor passam a aparecer como 'Almoxarifado' (antes `almoxarifado`) e
   podem ser filtradas (Etapa 111 de Compras, B62/A10)."
3. **`docs/almoxarifado-guia-etapas-e-testes.md`** e **`specs/modulo-almoxarifado/README.md`** — sem mudança.
4. **Conflito possível no merge:** `server/index.js` (a 111 trocou o corpo dos portões de módulo e do registro de acesso
   negado por chamadas a serviços; a 110 mexe em rotas de material/família) e `server/services/modulosSistema.js`. Se a
   110 tiver mexido nos portões, o corpo agora mora em `server/services/portaoDeModulo.js`.
