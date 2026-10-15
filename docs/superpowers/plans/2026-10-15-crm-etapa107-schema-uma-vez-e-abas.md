# Etapa 107 — o schema do almoxarifado roda uma vez no boot (G16); as barras de abas usam `ui/Tabs` (G8)

> Frente **Compras/cadastros e dívidas do core**, worktree `CRM-wt-e107`, branch `etapa-e107` (de `main` `e963449f`).
> Design (Fase 0 medida por sonda): `docs/superpowers/specs/2026-10-15-crm-etapa107-schema-uma-vez-e-abas-design.md`.
> Em paralelo: Etapa 106 do almoxarifado em `CRM-wt-e106` (servidor + talvez Movimentações). Esta etapa não toca
> os quatro docs do almoxarifado — o texto para eles está em **"Para o integrador"** no fim.

> **Estado (2026-10-15):** 🟢 fechada — T1–T8 feitas, Fase 5 incorporada; commits e números medidos no fim.

## Regras de negócio

### G16 — uma execução do schema por conexão
- **RN-107.01** Duas chamadas **simultâneas** de `initSchema(db)` na mesma conexão compartilham **uma** execução:
  as duas resolvem; banco novo termina com categorias **27/27** (linhas/nomes distintos), famílias 3, unidades 12,
  tipos 8, localizações 8, setores 8, `ALM-GERAL` 1, o índice `idx_categorias_almox_nome` **existe**, e nenhum
  `console.warn`/`console.error` sai do schema. (Antes: categorias 54/27 e índice ausente em 6 de 14 boots.)
- **RN-107.02** Terminada a execução, a chamada seguinte roda **de novo** (idempotente, como hoje): um segundo
  `initSchema` sobre o banco já pronto não muda nenhuma contagem e não loga erro — o banco existente não muda.
- **RN-107.03** Execução que **falha** não fica guardada: as chamadas que pegaram carona nela recebem o mesmo erro;
  a próxima chamada começa uma execução **nova** e, se o motivo passou, termina com o banco completo (o retry da
  extended continua valendo).
- **RN-107.04** (fiação) Registrar `routes/almoxarifado.js` num banco novo — a chamada direta do registrador e o
  `runInitSchemaWithRetry` da extended, o caminho do boot — produz uma execução só: nenhum
  `Erro schema almoxarifado v3`, nenhum aviso `Nao foi possivel criar idx_categorias_almox_nome`, contagens da
  RN-107.01.
- **RN-107.05** (prova de boot real, manual, citada com número) `CRM_DATA_DIR` vazio + `node index.js`, processo
  morto: N de N boots sem `UNIQUE constraint`/`tentativa`/aviso do índice, categorias 27/27, índice presente, admin
  criado; 2º boot do mesmo banco sem erro. Banco que **já nasceu** com categorias em dobro continua avisando — a
  correção não o conserta (consulta **A9**).

### G8 — as barras de abas usam `ui/Tabs`
- **RN-107.10** `Tabs` aceita `aba.badge` (opcional). Número **> 0** ou texto não vazio → `<span class="ui-tab-badge">`
  logo depois do rótulo, dentro do botão; `0`, `undefined`, `null`, `''` → nada. Sem `badge`, o HTML do `Tabs`
  é o de hoje (Configurações não muda).
- **RN-107.11** Admin (`/admin`): abas Usuários · Permissões · Logs, nessa ordem, com ícone; começa em Usuários;
  clicar troca o conteúdo (Usuários/Permissões/Logs) — o "Preparando painel…" antes do primeiro quadro continua.
  Sem URL (como hoje). O painel é `role="tabpanel"` rotulado pela aba ativa.
- **RN-107.12** Minha Conta: abas "Informações pessoais" · "Alterar senha"; começa em Informações pessoais;
  clicar em Alterar senha mostra o formulário de senha e esconde o de perfil (e volta).
- **RN-107.13** OS comercial (`/comercial/ordens-servico`): abas "Propostas Aprovadas" · "Ordens de Serviço";
  contador ao lado de cada uma **só quando > 0** (propostas aprovadas sem OS / total de OS); começa em Propostas;
  "Ordens de Serviço" mostra os cartões de estatística e a lista de OS. Muda só o visual: o rótulo deixa de sair
  em maiúsculas (era `text-transform` da `.os-tab`) e fica no padrão do `Tabs` (B58).
- **RN-107.14** Almoxarifado → Configurações: as 13 abas na ordem de `TABS`; `?tab=` escolhe (inválida/ausente →
  Tipos); clicar grava `?tab=<id>` com `replace` (preservando `?modulo=almoxarifado` quando embutida); quem não é
  administrador do almoxarifado vê "Acesso restrito" e **nenhuma** aba. Embutida: `tamanho="sm"`; sozinha: `md`.
- **RN-107.15** O contraste da aba ativa no celular (`app-glass.css`) vale para `.ui-tab-ativa` (claro `#1D4ED8`,
  escuro `#4FACFE`), no lugar da regra de `.os-tab.active`.
- **RN-107.16** Compras, Financeiro e Operacional **não** têm barra de abas (o G8 estava errado): o array `tabs`
  sem leitor em `Compras.js`/`Financeiro.js` e os seletores `.module-tab*`/`.operacional-tabs` sem elemento são
  apagados; nenhuma tela muda.

## Contratos congelados
- `initSchema(db)` — mesma assinatura e mesma promise de resultado; novo: chamada durante execução em andamento
  devolve **a mesma** promise (`initSchema(db) === initSchema(db)` enquanto em voo). Chave: o objeto `db`
  (`WeakMap`). Nenhuma rota muda.
- `Tabs` — `abas: [{ id, label, icon?, badge? }]`; o resto inalterado (`ativa`, `onChange`, `ariaLabel`, `tamanho`,
  `painelId`). Classe nova `.ui-tab-badge` (sem 'header'/'toolbar'/'barra'/'actions').
- `ariaLabel` por tela: Admin `"Administração"`, Minha Conta `"Minha conta"`, OS `"Ordens de serviço"`,
  almoxarifado `"Configurações do almoxarifado"`.

## Tasks (todas `tronco`, um executor, em ordem — a etapa é pequena e as telas compartilham o `Tabs`)
- [x] **T1 (G16)** `services/almoxarifado/schema.js`: single-flight por `db`. Teste novo
  `tests/api/schemaAlmoxUmaVez.api.test.js` (RN-107.01–04). Controles: tirar o single-flight (01 e 04 vermelhos);
  guardar a promise rejeitada para sempre (03 vermelho); nunca soltar a vaga (02 — o 2º run não roda: provar com
  contador de execuções). Prova de boot real (RN-107.05). Comentários de `schema.js:520` e
  `routes/almoxarifado.js:4461` atualizados.
- [x] **T2 (G8)** `ui/Tabs.js` + CSS: `badge` (RN-107.10) + casos em `Tabs.test.js`. Controle: badge sempre / nunca.
- [x] **T3** Admin: teste de comportamento **antes** (`Admin.test.js`, verde no código antigo), migração, CSS morto.
- [x] **T4** Minha Conta: idem (`MinhaConta.abas.test.js`).
- [x] **T5** OS comercial: idem (`OrdensServicoComercial.abas.test.js`), `app-glass.css` (RN-107.15).
- [x] **T6** Código morto de Compras/Financeiro/Operacional (RN-107.16).
- [x] **T7** Almoxarifado → Configurações (última): teste antes (estende `ConfiguracoesEmbedded.test.js` ou novo),
  migração.
- [x] **T8** Integração: `Configuracoes.test.js` + o teste da T7 com a tela embutida (dois `Tabs` de Configurações +
  o do almoxarifado na mesma página, ids `ui-tab-*` sem colisão); suíte completa; revisão adversarial; fechamento.

O teste "antes" de cada tela usa só o que não muda na migração (texto do rótulo, conteúdo que aparece, URL),
para ser verde no código antigo **e** no novo — é ele que prova "o comportamento ficou igual". As asserções novas
(`role="tab"`, `aria-selected`) entram depois da migração.

## Fase 2 — revisão do plano (agente fresco, 2026-10-15) e o que mudou
**0 altos, 2 médios, 7 baixos; nenhum invalidou o desenho. Incorporados (as emendas valem sobre o texto acima):**
- **(M1) contraste do contador no celular.** A regra antiga `.os-tab.active span { color: #1D4ED8 }` já pintava o
  `.tab-badge` de azul sobre o fundo azul (o contador da aba ativa ficava ilegível no celular). Emenda à RN-107.15: a
  regra nova mira `.ui-tab-ativa` e `.ui-tab-ativa .ui-tab-rotulo` — o `.ui-tab-badge` fica fora (branco sobre azul).
- **(M2) a integração da T8 não via as duas barras juntas.** `Configuracoes.test.js` troca o almoxarifado por stub e
  `ConfiguracoesEmbedded.test.js` o renderiza sozinho. Emenda: arquivo novo `Configuracoes.almoxEmbutido.test.js` com a
  tela **real** embutida (clicar aba interna grava `?tab=` mantendo `?modulo=`; ids `ui-tab-*` únicos; painel rotulado).
- **(B1)** RN-107.01 com `Promise.allSettled` + contagens (com `Promise.all` o código antigo caía pela rejeição antes
  de mostrar o 54/27). Controle refeito: sem o single-flight o cenário cai em *"o seed entrou mais de uma vez"*.
- **(B2) o design errava uma tabela:** `tipos_material_almoxarifado.nome` também não tem `UNIQUE` (o seed fica num
  `try/catch`) — numa defasagem diferente os tipos também dobrariam, sem log. Nos 14 boots medidos tipos ficou 8/8.
  A consulta **A9** conta categorias **e** tipos.
- **(B3) a frase do harness estava imprecisa:** em `createTestApp`, depois do `await initSchema`, a chamada do
  registrador e a da extended correm em fundo e o app volta com elas em voo. Com o single-flight, um teste que chame
  `await initSchema(db)` logo no começo pega carona nessa execução em vez de rodar outra. Hoje inofensivo
  (`pedidoSaldoRecebido`, `loteMigracaoSaldo`, `transformacaoTerceiro` só conferem idempotência; o "DROP COLUMN e
  initSchema" de `regrasAprovacao` roda bem depois). Declarado no comentário do código.
- **(B4)** `initSchema(null)` lança `TypeError` na hora (o `WeakMap`), em vez de promise rejeitada — sem efeito
  prático (o registrador já quebra antes com `db` nulo).
- **(B5) as setas do teclado passam a trocar de aba** (o `Tabs` tem ← → Home End; as barras antigas não). Na OS
  comercial cada seta recarrega a lista, no almoxarifado monta outra aba — é o comportamento da troca por clique,
  agora também pelo teclado. Declarado (B58).
- **(B6)** o nome acessível da aba da OS inclui o contador ("Propostas Aprovadas 2") — como antes (o contador já era
  texto dentro do botão).
- **(B7) a lista de exceções estava incompleta:** `operacional/OSForm.js` (`.sections-sidebar`, navegação vertical
  de seções do formulário de OS) e os botões de alternância de `Dashboard.js`, `Atividades.js`,
  `operacional/Colaboradores.js` e `Aprovacoes.js` entram em B57 (e "O que a etapa NÃO cobre"). A conclusão "quatro barras reais" se mantém.
Conferido sem achado: a identidade do `db` (o `wrapDatabase` muda o objeto no lugar), nenhuma migração depende de duas
execuções (a reconstrução de `migrateSaldoLoteId`, com `PRAGMA foreign_keys` da conexão inteira, deixa de poder
intercalar — ganho), o link `?tab=familias` de `MaterialAlmoxarifadoForm`, o "Config. template" de PropostasList,
nenhum CSS/teste de fora usa as classes apagadas, nenhum e2e no repositório.

## Execução — o que foi feito em cada task (divergências incluídas)
Baseline: a 105 fechou com `test:api` 352/352 e client 100 suítes / 1542 testes; esta branch parte de `e963449f` (main
com a 104 e a 105 mescladas).
- [x] **T1 (G16)** — `1fff24f4`. Medição antes (14 boots em pasta nova, sonda `boot-e107-medir.js`, processo morto aos
  22–25 s): categorias **54/27 e índice ausente** em a1, a8, a10, a11, a12, a14 (6 de 14; log: 3×
  `UNIQUE … categorias.nome` do índice + `UNIQUE … familias.codigo (tentativa 1/3)`); só `UNIQUE … setores.nome
  (tentativa 1/3)` em a2, a3, a4, a5, a7, a9, a13 (7); limpo em a6 (1); `tentativa 2/3` em nenhum;
  `Schema almoxarifado v3 inicializado` **2×** por boot. Banco existente: 2º boot de um banco limpo sem erro; 2º boot do
  banco duplicado (a1) repete o aviso do índice 2×. `schemaAlmoxUmaVez.api.test.js` (4): na rodada TDD 3 vermelhos sobre
  o código antigo (RN-107.02 é metade positiva e passou). Controles (3, todos na asserção certa): sem o `if (emVoo)` →
  01, 03 e 04 vermelhos (01 por *"o seed entrou mais de uma vez"* depois da emenda B1 da Fase 2; 04 por *"3 execucoes
  do schema no boot"*); `.finally` → `.then` (falha guardada) → 03; nunca soltar a vaga → 02 (*"a vaga nao foi
  solta"*) e 03. **Prova de boot real depois (RN-107.05):** d1–d8, **8 de 8** com 0 linha de
  `UNIQUE`/`tentativa`/`idx_categorias`/`Erro no schema`, categorias 27/27, índice presente, admin criado,
  `inicializado` **1×**; 2º boot de d1: 0; 3º boot do banco duplicado a1: o aviso do índice **1×** (era 2×) — continua,
  como previsto (A9).
- [x] **T2** — `c48efd13`. 3 casos novos em `Tabs.test.js` (2 vermelhos na rodada TDD; o "sem badge, HTML igual" é
  metade positiva). Controles: badge sempre (`b != null`) → 1 vermelho; nunca → 2.
- [x] **T3** — `1e49c8aa`. `Admin.abas.test.js`: 4 cenários escritos antes, verdes no código antigo; 1 de
  acessibilidade depois. Controle: `onChange={() => {}}` → 2 vermelhos. (O plano dizia `Admin.test.js`; o arquivo é
  `Admin.abas.test.js`, no padrão dos outros.)
- [x] **T4** — `617b122b`. `MinhaConta.abas.test.js`: 2 antes + 1 depois. Controle: `onChange` vazio → 2 vermelhos.
- [x] **T5** — `7af44575`. `OrdensServicoComercial.abas.test.js`: 3 antes + 1 depois. `app-glass.css`: a regra mira
  `.ui-tab-ativa` e `.ui-tab-ativa .ui-tab-rotulo` (M1 da Fase 2). Controle: contador fixo em 7 → 3 vermelhos.
- [x] **T6** — `6abdee95`. Arrays `tabs` de `Compras.js`/`Financeiro.js` (e os ícones `FiPackage`/`FiFileText` que só
  ele usava em Compras), `.module-tab*` de `Compras.css`/`Financeiro.css`, `.operacional-tabs`. Sem teste novo (nada
  renderizava); provado pela suíte e pelo build.
- [x] **T7** — `c52024d9`. `ConfiguracoesAlmoxarifado.abas.test.js` (2 antes + 1 depois). **Divergência:** o cenário da
  Etapa 36 em `ConfiguracoesEmbedded.test.js` que conferia o estilo inline da rolagem (`barra.style.overflowX`) foi
  reescrito para a classe `.ui-tabs` + a regra lida de `Tabs.css` (o jsdom não aplica CSS). Controles: `onChange`
  vazio → 3 vermelhos; `tamanho="md"` fixo → 1; uma aba com o id de um módulo (`almoxarifado`) → o cenário de ids únicos
  da T8 cai (22 ids, 21 distintos).
- [x] **T8** — `Configuracoes.almoxEmbutido.test.js` (2, no commit da T7): verdes no código antigo e no novo.
  Suíte completa medida antes do commit da T7 — ver "Medido na árvore final".

## Fase 5 — revisão adversarial final (dois agentes frescos em paralelo, 2026-10-15)
**G16: 0 altos, 0 médios, 2 baixos reais (latentes, reproduzidos), corrigidos em `e6b69780`.**
1. (Baixa) o `createTestApp` devolvia o app com a execução de fundo em voo (35–100 ms); com o single-flight, um teste
   de migração logo no começo ("DROP COLUMN e initSchema") pegaria carona e não reaplicaria — reproduzido pela sonda do
   revisor com atrasos de 4 a 24 ms. Nenhum teste atual caía nisso. **Corrigido:** o harness espera
   `initSchemaEmVoo(db)` (exportado para isso). Cenário novo com asserção determinística (nada em voo quando o app volta) —
   **o DROP COLUMN sozinho passou verde no código sem a correção** (dependia de onde a execução de fundo estava), por isso a
   asserção sobre o estado em voo.
2. (Baixa) "por conexão" não estava preso: chave global no `WeakMap` passava os 4 cenários. **Corrigido:** cenário de duas
   conexões simultâneas (execuções distintas, dois bancos completos); a chave global o derruba.
   Ruído conferido: sem rejeição solta pelo `.finally`; o retry da extended continua (uma falha é logada duas vezes —
   registrador e extended —, cosmético); nenhum serviço chama este `initSchema` em tempo de execução. Sabotagens novas do
   revisor: soltar a vaga no `setImmediate` → RN-107.04 vermelha; carona engolindo a falha → 01, 03 e 04 vermelhas. O
   revisor refez a prova de boot: **3 de 3** em pasta nova com 27/27, índice presente, log limpo.
**G8: 0 altos, 1 médio (teste), 2 baixos; os dois de teste corrigidos em `72f01b83`, o terceiro declarado.**
3. (Média, teste) tirar o `{ replace: true }` da escrita de `?tab=` passava os 5 arquivos de Configurações — o cabeçalho
   de `ConfiguracoesAlmoxarifado.abas.test.js` afirmava que `ConfiguracoesEmbedded.test.js` o prendia, e não prendia
   (o código estava certo). **Corrigido:** cenário que lê o tipo de navegação (`REPLACE`) nos dois modos.
4. (Baixa, teste) a RN-107.15 (`app-glass.css`) não tinha teste. **Corrigido:** cenário que lê o CSS (controles:
   `.ui-tab-ativa span` e `.os-tab.active` derrubam).
5. (Baixa, declarado) o `Tabs` só põe a aba ativa no Tab do teclado (roving tabindex) — antes o Tab passava por todos os
   botões. É o padrão de abas acessíveis da Etapa 36; entrou na B58.
   Ruído conferido: contador da OS (os dois valores são números, `temBadge` repete o `> 0`); nenhuma classe apagada é
   usada em outro lugar; nenhum `[class*=…]` com "tab"; ids `ui-tab-*` sem colisão; nenhuma barra antiga dentro de
   `<form>` (o `type="button"` não muda nada); `?modulo=` preservado (o `almoxEmbutido` pega).

## Retro (4 números)
- Rodadas de correção até verde: **2** (a Fase 2 mudou testes e o seletor do contraste antes do código das telas; a Fase 5,
  dois commits de teste + harness).
- Achados de revisão: Fase 2 **9** (2 médios, 7 baixos), todos reais e incorporados ou declarados; Fase 5 **5 reais**
  (1 médio de teste, 4 baixos — 4 corrigidos, 1 declarado), ruído conferido sem mudança.
- Paralelismo: **0 galhos em paralelo** na execução (tronco único: as telas dividem o `Tabs`); as duas revisões da Fase 5
  em paralelo, sem retrabalho. Uma colisão de leitura: os revisores viram o `docs/compras-novidades-por-etapa.md` sendo
  editado por mim durante a revisão e acharam que era outro agente — não era.
- Defeito escapado: preencher na próxima etapa de Compras. (Da 105: o G16 que ela achou estava subestimado — "a 2ª tentativa
  passa" escondia as categorias em dobro em 6 de 14 boots.)

## Commits (branch `etapa-e107`)
- `1fff24f4` G16 — o schema do almoxarifado roda uma vez por conexão no boot.
- `c48efd13` G8 — `ui/Tabs` ganha o contador (`badge`).
- `1e49c8aa` G8 — Administração · `617b122b` Minha Conta · `7af44575` OS comercial (+ `app-glass.css`).
- `6abdee95` G8 — apaga as barras que não existiam (Compras/Financeiro/Operacional).
- `c52024d9` G8 — Almoxarifado → Configurações (+ a integração `Configuracoes.almoxEmbutido`).
- `72f01b83` Fase 5 — testes do `replace` e do contraste.
- `e6b69780` Fase 5 — o harness espera o schema de fundo; "por conexão" preso.
- docs — este plano, o design, `compras-novidades-por-etapa.md`, `specs/modulo-compras/README.md`.

**Medido na árvore final** (servidor depois de `e6b69780`; client depois de `72f01b83` — o último commit não toca o
client): `test:api` **357/357**; `test:almoxarifado` **44/44**; `test:validation` 4/4, `test:safealter` 3/3,
`test:sqlite` **10/10**; client **107 suítes / 1574 testes**; `CI=true react-scripts build` **Compiled successfully**.
Boot real em pasta nova com `1fff24f4`: **8 de 8** limpos (+ 3 de 3 pelo revisor).

## Para o integrador — texto pronto para os quatro docs do almoxarifado
Esta etapa **não** tocou `docs/almoxarifado-novidades-por-etapa.md`, `docs/almoxarifado-guia-etapas-e-testes.md`,
`docs/almoxarifado-manual-do-sistema.md` nem `specs/modulo-almoxarifado/README.md` (a 106 os edita em paralelo). O que
cabe neles:

1. **`docs/almoxarifado-novidades-por-etapa.md`, letra A** (consulta antes do deploy) — uma linha remetendo à de Compras:
   > **A(107) — Categorias (ou tipos de material) em dobro desde a instalação.** Consulta e limpeza em
   > `docs/compras-novidades-por-etapa.md`, **A9** (G16 da frente Compras/core, Etapa 107). Sinal no log de todo boot:
   > *"Nao foi possivel criar idx_categorias_almox_nome … ha categorias com nome repetido"*. Enquanto houver duplicata,
   > Configurações → Categorias aceita nome repetido.
2. **`docs/almoxarifado-manual-do-sistema.md`** — nenhuma regra muda para quem usa. Uma frase opcional na seção das
   Configurações do almoxarifado (onde o manual descreve as abas): *"A barra de abas rola de lado quando não cabe na tela
   e aceita as setas do teclado (← →, Home, End) para trocar de aba; a aba aberta fica no endereço da página, então
   recarregar ou compartilhar o link abre na mesma aba."* (A última metade já era verdade desde a Etapa 36 — confira se o
   manual já diz isso antes de repetir.)
3. **`docs/almoxarifado-guia-etapas-e-testes.md`** — sem seção nova (a etapa é da frente Compras/core). Se o guia tiver
   roteiro que mande "olhar a cor azul-claro da aba ativa" nas Configurações do almoxarifado, a cor agora é o azul do
   sistema (B58 de Compras).
4. **`specs/modulo-almoxarifado/README.md`** — nada no mapa de features; se houver seção de dívidas de infraestrutura do
   módulo, o G16 passa a "corrigido na Etapa 107 (`1fff24f4`)".

## Próxima de Compras: a definir
Candidatas medidas que restam, sem prioridade decidida:
- **G7** — as quatro listas de módulos (`client/src/constants/modulosMeta.js`, `TipoSelecao.todosModulos`,
  `MODULE_ADMIN_KEYS` em `server/services/systemPermissions.js`, `DEFAULT_MODULOS_TIPO` em
  `server/services/modulosTipoConfigService.js`). Unificar é etapa própria: contrato de API de permissões no meio
  (D-36d: criar `GET /api/modulos` ou só reusar `modulosMeta` no cliente). Nesta etapa não foi reconferido.
- **B52 / B54 (concorrência declarada)** — vincular fornecedor e desativar o grupo no mesmo instante ainda deixa vínculo
  novo em grupo desativado; inativar família no mesmo instante em que alguém cadastra material nela também passa
  (conferência e gravação não atômicas). A 107 mostrou o padrão que resolve a classe **dentro de um processo**: o
  single-flight / trava em memória (como a `travaPorMaterial` do almoxarifado, premissa de um processo). Ponto de
  atenção: medir antes se a janela é alcançável pela tela (dois cliques de usuários diferentes) — a 105 não mediu.
- **Limpeza das duplicatas do G16** (se a A9 der linha em produção): script de migração que funde as cópias de categoria
  repassando os vínculos (`materiais_almoxarifado.categoria_id`/`subcategoria_id`, `familias_material_almoxarifado.
  categoria_id`, `setor_material_permitido.categoria_id`) e depois cria o índice. Só vale se a consulta mostrar caso real.
- **Botões de alternância → abas?** (fora do G8, B57) — decisão de produto, não dívida: Ferramentas, Inspeções, Lotes,
  Reposição, Sobras, Relatórios da Produção, Veículos, Dashboard, Atividades, Colaboradores, Aprovações; e o menu vertical
  de seções de `operacional/OSForm.js`. Se o P.O. quiser, cada um vira `ui/Tabs` com o mesmo roteiro desta etapa (teste do
  comportamento antes, um commit por tela).
- **B45** — Variáveis técnicas apontando para grupo desativado continuam oferecendo os fornecedores dele (decisão de P.O.).
- **G15** — só se o P.O. aceitar mostrar o total gravado com nota de "pedido anterior à 39".

Pontos de atenção para quem pegar: `initSchema(db)` agora devolve **a mesma promise** enquanto uma execução está em voo
(o `createTestApp` já espera a execução de fundo assentar antes de devolver o app — `initSchemaEmVoo`; quem montar
outro harness tem de fazer o mesmo, senão um "DROP COLUMN e initSchema" logo no começo pega carona e não reaplica); `ui/Tabs` tem `badge` e é a única barra de abas do sistema — tela nova com abas usa ele.
