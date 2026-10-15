# Etapa 109 — o vínculo a grupo desativado não perde mais a corrida (B52); a lista de módulos numa fonte só (G7)

> Frente **Compras/core**, worktree `CRM-wt-e109`, branch `etapa-e109` (de `main` `019fc244`). Design (Fase 0 medida por
> sonda e por varredura): `docs/superpowers/specs/2026-10-15-crm-etapa109-corrida-do-grupo-e-lista-de-modulos-design.md`.
> Em paralelo com a Etapa 108 do almoxarifado — esta etapa não toca material (rotas, serviço, formulário) nem os quatro
> documentos do almoxarifado (texto para eles em "Para o integrador").

> **Estado (2026-10-15):** 🟢 fechada — T1–T5 feitas; commits e números medidos no fim.

## Regras de negócio

### B52 — conferir o grupo e gravar o vínculo são o mesmo comando (`routes/compras/fornecedores.js`)
- **RN-109.01** `POST /api/compras/fornecedores` e `PUT /api/compras/fornecedores/:id` com grupo **novo** (o mesmo
  critério da RN-103.08) só gravam se o grupo está ativo **no comando que grava**. Cenário: as duas requisições
  (vincular e `DELETE /api/compras/grupos/:id`) disparadas juntas, 20 rodadas, nas duas ordens (POST) e com o vínculo
  primeiro (PUT) → em nenhuma rodada o fornecedor é gravado com o grupo **depois** do comando que desativou o grupo
  (ordem de término dos comandos na conexão, anotada pelo teste). Cada rodada termina em 201/200 (gravado antes) ou
  400 L-G (nada gravado).
- **RN-109.02** (a janela, determinística) grupo desativado **entre** a conferência prévia e a gravação → **400** L-G
  `Grupo desativado — reative o grupo em Fornecedores homologados antes de vincular fornecedores`; nada gravado. No PUT
  é tudo ou nada: nenhum outro campo da ficha é gravado (como na recusa prévia da 103).
- **RN-109.03** fornecedor apagado entre a conferência e a gravação do PUT → **404** `Fornecedor não encontrado`.
- **RN-109.04** (metade positiva, inalterado) sem corrida, grupo ativo grava (POST 201, PUT 200, `'7'` = 7); vincular e
  **depois** desativar mantém o vínculo (B45); repetir o grupo desativado já gravado → 200 (B52); `null` limpa; POST
  sem grupo 201; trocar para outro grupo ativo grava os outros campos junto.

### G7 — servidor com uma fonte (`server/services/modulosSistema.js`)
- **RN-109.10** `MODULOS_SISTEMA` — uma linha por módulo: `{ chave, tipoPadrao ('administrativo'|'industrial'|null),
  aceitaAdminDeModulo }`. `MODULE_ADMIN_KEYS` = chaves com `aceitaAdminDeModulo`, `DEFAULT_MODULOS_TIPO` = chaves com
  `tipoPadrao` → **exatamente** os valores de antes, na mesma ordem:
  `MODULE_ADMIN_KEYS = [comercial, compras, financeiro, operacional, engenharia, engenharia_projetos, almoxarifado, frota,
  relatorios, administrativo, admin]` e `DEFAULT_MODULOS_TIPO = { comercial: adm, compras: adm, financeiro: adm,
  operacional: ind, engenharia: adm, engenharia_projetos: adm, almoxarifado: adm, administrativo: adm, admin: adm,
  frota: ind, todolist: adm }` (ordem das chaves inclusa). Os dois módulos continuam exportando os mesmos nomes.

### G7 — cliente com uma fonte (`client/src/constants/modulosMeta.js`)
- **RN-109.11** a tela de seleção de módulos mostra os **mesmos 11 cartões, na mesma ordem** (comercial, frota, compras,
  financeiro, operacional, administrativo, engenharia, engenharia_projetos, almoxarifado, todolist, admin), com os mesmos
  nomes, descrições, rotas, ícones e cores de antes — agora lidos de `MODULOS_META` na ordem `MODULOS_ORDEM_SELECAO`.
- **RN-109.12** o cadastro de usuário mostra os **mesmos 12 cartões**, na mesma ordem (`MODULOS_CONCEDIVEIS`: as 11 +
  `relatorios` antes de `administrativo`), com as mesmas descrições; o rótulo de `engenharia` passa de "Engenharia" a
  **"Cálculos de Engenharia"** (o nome do módulo em todo o resto — B60); "Administrador do módulo" continua não aparecendo
  só no cartão Admin (`MODULOS_SEM_ADMIN_DE_MODULO_NA_TELA = ['admin']`). Badges e barra de Configurações inalteradas
  (continuam lendo `MODULOS_ORDEM`).

### G7 — cliente x servidor (não compartilham código)
- **RN-109.13** `server/tests/api/modulosClienteServidor.api.test.js` lê `modulosMeta.js` como texto e confere:
  (a) `MODULOS_ORDEM` (cliente) = chaves com `tipoPadrao` (servidor), como conjunto; (b) `MODULOS_CONCEDIVEIS` = todas as
  chaves do servidor; (c) admin de módulo — o que a tela oferece (`MODULOS_CONCEDIVEIS − MODULOS_SEM_ADMIN_DE_MODULO_NA_TELA`)
  x o que o servidor aceita (`MODULE_ADMIN_KEYS`): a divergência conhecida está **congelada** (`todolist` só na tela,
  `admin` só no servidor — B60). Qualquer divergência nova, ou a conhecida sumindo, derruba o teste com a diferença no texto.
  O teste falha também se não achar as listas no arquivo (régua contra teste vazio).

## Contratos congelados
- `POST /api/compras/fornecedores` / `PUT /api/compras/fornecedores/:id` — **sem resposta nova**: as mesmas 201/200,
  400 `Grupo não encontrado` / L-G, 404 `Fornecedor não encontrado` da 103; o que muda é **quando** a recusa vale.
  Quando a gravação condicional não grava: relê o grupo → `Grupo não encontrado` se sumiu, L-G se desativado, L-G também
  se ele já foi reativado no meio (a gravação não aconteceu; a resposta diz o que impediu).
- Nenhuma rota nova; `GET /api/config/modulos-tipo` responde o mesmo mapa.
- Literais de tela: `Cálculos de Engenharia` (cadastro de usuário, cartão de engenharia). Nenhuma outra muda.

## Tasks
- [x] **T1 (tronco, servidor)** — `083384ea`. RN-109.01–04: `comprasGrupoDesativadoCorrida.api.test.js` (vermelho antes) + gravação
  condicional nas duas portas. Controles: condição sempre verdadeira (POST e PUT), só o PUT sem condição, só o POST sem
  condição, PUT "não gravou" sempre 404, literal trocada, conferência prévia removida (o teste tem de acusar que a
  injeção não rodou).
- [x] **T2 (servidor)** — `0c4da131` (com T3/T4: um assunto só, o teste cruzado precisa das duas pontas). RN-109.10: `modulosSistema.js` + derivação nos dois serviços + caracterização em
  `modulosClienteServidor.api.test.js`. Controles: tirar `relatorios` da linha de admin, ligar admin no `todolist`, trocar o
  tipo de `frota`, trocar a ordem.
- [x] **T3 (cliente)** — `0c4da131`. RN-109.11/12: teste de comportamento **antes** (renderiza a seleção como admin e o cadastro de
  usuário novo; passa no código antigo — exceto o rótulo de engenharia, que nasce vermelho) → derivação. Controles: ordem
  da seleção, descrição trocada, `relatorios` fora dos concedíveis, toggle de admin oferecido no Admin.
- [x] **T4 (cruzado)** — `0c4da131`. RN-109.13 no mesmo arquivo de T2. Controles: tirar um módulo só do cliente, só do servidor; ligar o
  admin do `todolist` no servidor (a divergência conhecida some → vermelho); regex que não acha a lista.
- [x] **T5** suíte completa, revisão adversarial (agentes frescos), fechamento.

Integração (cruza galhos): T1 já entra pela **rota** (HTTP) e pela janela injetada no `db`; T4 é o cruzamento cliente x
servidor de T2/T3.

## Fase 2 — revisão do plano (agente fresco, 2026-10-15) e o que mudou
**1 alto, 3 médios, 3 baixos; todos reais e incorporados (as emendas valem sobre o texto acima). T1 sem achado de código.**
- **(A1) O teste da seleção "como admin" não pegaria a derivação mais provável de errar.** A tela decide quem abre cada
  cartão por `mod.modulo`, guarda recentes e o tipo por `mod.id` e busca por `mod.descricao` — e o `MODULOS_META` não
  tinha nenhum dos três; para admin tudo é liberado e um `modulo` esquecido passa. Emenda à RN-109.11: o objeto derivado
  é `{ id, modulo, nome, descricao, icon, rota, gradient }`, e o teste renderiza também um **usuário comum** com
  permissão (Compras + Almoxarifado) e a **busca por descrição**.
- **(M1) A RN-109.10 pedia duas ordens que uma lista filtrada não dá** (`MODULE_ADMIN_KEYS` tem frota antes de
  administrativo; `DEFAULT_MODULOS_TIPO`, depois). Nada depende de nenhuma das duas ordens (`.includes` e
  `INSERT OR IGNORE`/leitura por chave). Mantida a caracterização exata, com o campo `ordemTipo` em cada linha
  (documentado em `modulosSistema.js`) — custo de um campo para a unificação provar que não muda nada.
- **(M2) T2, T3 e T4 não são independentes** (o arquivo de T2 já tem os cenários de T4, que dependem das listas que T3
  cria) → série T2 → T3 → T4; e o formato que o teste lê fica escrito no cabeçalho de `modulosMeta.js` (array literal,
  aspas simples, `export const X = [ … ];`).
- **(M3) O rótulo de engenharia muda num segundo lugar:** o painel "permissões dos grupos" do cadastro de usuário
  (`<strong>{modulo.label}</strong>`) também passa a dizer "Cálculos de Engenharia". Só exibição (o valor gravado é a
  chave). Entrou na B60.
- **(B1)** a releitura depois da corrida tinha dois ramos sem teste: grupo **apagado** na janela (→ 400
  `Grupo não encontrado`; antes, com a FK de produção, seria 500) e desativado **e reativado** na janela (o comando vê
  ativo e grava). Cenário novo (RN-109.03).
- **(B2)** a corrida real do PUT não sabe falhar (0 de 30 pela HTTP); quem prova a condição do PUT é a janela injetada
  (RN-109.02) — o controle "só o PUT sem condição" tem de derrubar **ela**.
- **(B3)** o build com `CI=true` não roda o ESLint (`DISABLE_ESLINT_PLUGIN=true` no `client/.env`); a lista no escopo do
  módulo fica estável e fora das dependências dos efeitos. A conta `modulosSelecionados.length === todosModulos.length`
  do cadastro só continua certa com os **12** (`MODULOS_CONCEDIVEIS`), não com os 11.

## Fase 5 — revisão adversarial final (dois agentes frescos em paralelo, 2026-10-15)
**B52: 0 altos, 0 médios, 3 baixos (todos de teste ou de texto, declarados).** O revisor rodou a rota antiga (HEAD) e a
nova sobre a DDL de produção com a FK ligada, 26 requisições em cada (POST/PUT com grupo novo, igual, desativado, `null`,
``, `abc`, `0`, `1.5`, `ativo NULL`, status inválido, fornecedor inexistente): **0 diferenças** de status, corpo e
tabela. Placeholders conferidos ramo a ramo. Trocando a rota pela antiga via `require.cache`, o teste da 109 cai em 4 de 8
(RN-109.01 POST com 19 de 20 violações, RN-109.02 POST e PUT, RN-109.03 grupo apagado). Nenhuma outra porta grava
`fornecedores.grupo_id` (as de `routes/compras.js` são sombreadas — ordem de registro conferida no `index.js`).
1. (Baixa, teste) com a correção a corrida do POST termina **0 gravados / 20 recusados** nas duas ordens — a metade
   "gravou antes da desativação" do RN-109.01 nunca é observada numa rodada verde (o teste sabe falhar — controle com a
   rota antiga —, mas o ramo 201 dele não roda). A metade positiva está no RN-109.04, sem corrida. Declarado.
2. (Baixa, teste) três cenários passam também no código antigo (corrida do PUT, POST com a desativação primeiro, 404 do
   PUT) — são guardas de regressão; quem prova a condição do PUT é a janela injetada (RN-109.02). Declarado (= B2 da Fase 2).
3. (Baixa, texto) desativado e **reativado** entre a gravação condicional e a releitura → 400 L-G com o grupo ativo (nada
   gravado; a resposta diz o motivo que existia no instante da gravação). Está no contrato ("L-G também se ele já foi
   reativado no meio"); sem cenário (janela de dois saltos).
**G7: 0 altos, 1 médio (teste), 3 baixos; o médio e um baixo corrigidos, os outros declarados.** Diff campo a campo das
listas antigas (HEAD) contra as derivadas: iguais (nome, descrição, rota, ícone, cor, ordem; `sempreDisponivel` já era
indefinido); nenhum consumidor de `MODULOS_META` itera as chaves; `aceitaAdminDeModulo` = a regra antiga; sem ciclo de
`require`.
4. (Média, teste) **nada provava que as duas telas leem `modulosMeta`** — os testes de tela comparam com literais, então
   uma cópia reescrita à mão dentro da tela passava, e um módulo novo no `modulosMeta` passaria justamente porque a tela
   não está ligada. **Corrigido:** cenário de fiação no teste cruzado (import, `const todosModulos = <função>();`, sem lista
   escrita à mão). Controle: a lista de volta em `TipoSelecao` → vermelho nomeando o arquivo.
5. (Baixa, teste) o regex lia a primeira ocorrência, **inclusive comentada** (cópia comentada antes da lista real que
   perdeu `frota` passava). **Corrigido:** comentários tirados antes da leitura. Controle: o mesmo caso → (b) e (c)
   vermelhos, "só no servidor: frota". (A 1ª tentativa deste controle não sabotou nada — o `perl` sem `/g` trocou a
   ocorrência do comentário, não a da lista; refeito com âncora na lista real.)
6. (Baixa) o cruzado não compara `MODULOS_ORDEM_SELECAO` nem as chaves de `MODULOS_META` com o servidor — hoje os testes
   de tela as prendem por literal (e agora estão ligados, item 4). Declarado.
7. (Baixa, texto) o cabeçalho do `modulosMeta.js` não citava o painel de permissões dos grupos — corrigido (mesmo texto da
   B60).
Ruído conferido: o `Permissoes.js` tem a lista de submódulos do comercial para grupos (fora do G7); `endpoints.relatorios`
do `GET /api` é informativo; `relatorios` de `requirePermission` em frotas/produção é ação de perfil, não módulo.

## Execução — o que foi feito (divergências incluídas)
- **T1** — `083384ea`. Teste vermelho antes (4 de 7 na 1ª versão: corrida do POST com 19 de 20 violações, janelas do POST
  e do PUT); 8 cenários na entrega (o da releitura entrou pela Fase 2, B1). Controles (6), todos vermelhos na asserção
  certa — **a 1ª versão de dois deles não valeu**: trocar a condição por `WHERE 1` tirava um parâmetro e derrubava os
  cenários com `SQLITE_RANGE` (500), não com o vínculo; refeitos trocando a condição por `(? IS NOT NULL)`, que mantém a
  contagem. **Divergência:** a corrida real do PUT passa também no código antigo (a janela não abre pela HTTP) — a prova da
  condição do PUT é a janela injetada.
- **T2/T3/T4** — `0c4da131`, um commit (o teste cruzado depende das duas pontas). Testes de tela escritos antes e verdes
  no código antigo menos o rótulo de engenharia (os 2 cenários que o comparam nasceram vermelhos só por ele). O jest do CRA
  roda com `resetMocks`: a 1ª versão do teste da seleção punha a implementação do mock na fábrica e caía por `undefined`
  — movida para o `beforeEach`. Controles: servidor/cruzado 8 + fiação 1 + comentário 1, seleção 5, cadastro 2 — todos
  vermelhos.

## Retro (4 números)
- Rodadas de correção até verde: **2** (Fase 2 — plano e um cenário novo antes de T2; Fase 5 — dois de teste).
- Achados de revisão: Fase 2 **7** (1 alto, 3 médios, 3 baixos), todos reais e incorporados; Fase 5 **10 reais** (1 médio
  de teste e 9 baixos — 3 corrigidos, 7 declarados), 0 altos; ruído conferido sem mudança.
- Paralelismo: **0 galhos em paralelo** na execução (T2→T3→T4 em série, M2 da Fase 2); a medição do G7 (subagente) rodou
  em paralelo com a T1; as duas revisões da Fase 5 em paralelo, sem retrabalho.
- Defeito escapado: preencher na próxima etapa de Compras. (Da 107: nenhum conhecido.)

## Commits (branch `etapa-e109`)
- `083384ea` B52 — vínculo novo só grava com o grupo ativo no próprio comando.
- `0c4da131` G7 — `modulosSistema.js` no servidor, `modulosMeta.js` no cliente, teste cruzado.
- docs — este plano, o design, `compras-novidades-por-etapa.md`, `specs/modulo-compras/README.md`.

**Medido na árvore final** (depois de `0c4da131`, antes do commit de docs): `test:api` **361/361**; `test:almoxarifado` **44/44**; `test:validation` 4/4, `test:safealter` 3/3, `test:sqlite` **10/10**; client **109 suítes / 1582 testes**; `CI=true react-scripts build` **Compiled successfully**.

## Próxima de Compras: a definir
Candidatas medidas que restam, sem prioridade decidida:
- **B61 — a corrida da família (a mais grave medida aqui).** `POST /api/almoxarifado/materiais` x
  `DELETE /api/almoxarifado/familias/:id` disparados juntos: **30 de 30** nas duas ordens terminam com família inativa e
  material ativo (sonda `sonda-e109-b54.js` no scratchpad da sessão; refazer no teste). Fechar dos **dois** lados (só um
  não fecha *write skew*): (a) o `INSERT` de `materialService.createMaterial` (e o `PUT` de material quando a família
  ou a subfamília **mudam**, e a importação, que usa o mesmo `createMaterial`) condicional a família ativa (e subfamília
  ativa filha dela) — `INSERT … SELECT … WHERE EXISTS`; (b) o `UPDATE … SET ativo = 0` do `DELETE` e do `PUT` de família
  (transição 1 → 0) condicional a `NOT EXISTS` material ativo (`familia_id` ou `subfamilia_id`) e subfamília ativa. Quando
  não grava, reler e responder as literais de hoje (`Família inativa — não é possível vincular novos itens`,
  `Subfamília inválida para a família selecionada`, `Não é possível remover: família possui N item(ns) ativo(s)`).
  Pontos de atenção: o `createMaterial` tem retentativa por `UNIQUE` de código — a condição tem de ir em todas as
  tentativas e "não gravou por família" não pode virar "Código já existe"; a 108 mexe no formulário e nas rotas de
  material — começar **depois** de ela entrar na main; mesmo padrão de teste desta etapa (corrida real + janela injetada no
  `db.get` da conferência).
- **B60 (decisão de P.O.)** — TODOLIST oferece admin de módulo que o servidor descarta; Admin aceito só pela API;
  Relatórios concedível sem uso. Qualquer decisão é um commit pequeno em `modulosSistema.js`/`modulosMeta.js` + o
  cenário (c) do teste cruzado.
- **G17** — as dez listas parciais de módulo (carregamento, splash, prefetch, nomes do acesso negado no cliente e no log
  do servidor, requisição por módulo, setores, rotas, menus); a mais útil é o log de acesso negado do servidor gravar a
  chave crua para 4 dos 11 módulos. E a divergência de permissão do "sem nenhuma linha de permissão" (seleção: Comercial;
  portão de rota do cliente: Comercial ou Frota; servidor: Comercial se sem grupo) — perto do G9.
- **Limpeza das duplicatas do G16** (se a A9 der linha em produção), **botões de alternância → abas?** (B57), **B45**,
  **G15** — como no plano da 107.

Pontos de atenção para quem pegar: lista de módulo nova (ou módulo novo) entra em `server/services/modulosSistema.js` **e**
`client/src/constants/modulosMeta.js` — o `modulosClienteServidor.api.test.js` cai se só um lado mudar, e as listas do
cliente têm de continuar no formato literal (`export const X = [ 'a', … ];`) que ele lê.

## Para o integrador — texto para os quatro docs do almoxarifado
Esta etapa **não** tocou `docs/almoxarifado-novidades-por-etapa.md`, `docs/almoxarifado-guia-etapas-e-testes.md`,
`docs/almoxarifado-manual-do-sistema.md` nem `specs/modulo-almoxarifado/README.md` (a 108 os edita em paralelo). O que cabe:

1. **`docs/almoxarifado-novidades-por-etapa.md`, letra C (furo conhecido em operação)** — a corrida da família é do
   cadastro do almoxarifado:
   > **C(109) — Inativar uma família no mesmo instante em que alguém cadastra material nela deixa a família inativa com o
   > material ativo dentro.** Medido na Etapa 109 de Compras (30 de 30 rodadas, nas duas ordens, com as duas requisições
   > disparadas juntas). As duas regras proíbem esse estado ("Inativar" recusa família com material ativo; o cadastro
   > recusa família inativa), mas cada uma confere e grava em passos separados. Não corrigido — fechar exige mexer no
   > cadastro/edição de material (área da Etapa 108). Detalhe e contrato da correção em
   > `docs/compras-novidades-por-etapa.md`, **B61**, e no plano da 109 ("Próxima de Compras").
2. **`docs/almoxarifado-manual-do-sistema.md`** — nada muda para quem usa o almoxarifado.
3. **`docs/almoxarifado-guia-etapas-e-testes.md`** — sem seção nova.
4. **`specs/modulo-almoxarifado/README.md`** — se houver seção de dívidas do cadastro de famílias/materiais, acrescentar a
   corrida acima como dívida aberta (B61 de Compras).
