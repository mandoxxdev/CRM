# Almoxarifado — Etapa 24: quem decide o acesso ganha tela, e a Qualidade ganha perfil (design)

Data: 2026-08-28 · Branch: `desenvolvimento-almoxarifado`
Origem: a perna **Perfis** da spec 23, que o fechamento da Etapa 23 nomeou como o que falta
para a feature virar 🟢 — e que não é decisão de negócio, é funcionalidade não construída.

## Decisão de escopo (Fase 0 — medida em 2026-08-28)

**A Fase 0 desta etapa errou o principal, e a Fase 2 corrigiu.** O que eu media como "backend
pronto sem leitor" já tinha leitor há três semanas. O que sobrou depois da correção é menor em
escopo e melhor em foco: um perfil que falta, e **quatro defeitos na tela que já existe** — um
deles da mesma família que a Etapa 23 acabou de fechar (a trilha mentindo por omissão), bem na
rota que decide quem tem acesso ao módulo.

### 1. ~~Não existe tela para atribuir perfil~~ — **ESTA PREMISSA ERA FALSA, e era a premissa da etapa inteira**

A versão anterior deste documento afirmava que **nenhum componente do client** consome
`perfis-usuario`, e concluía daí que *"todo usuário novo entra como chão de fábrica sem que
ninguém consiga promovê-lo pela interface — só por `curl` ou escrevendo no banco"*.

**A revisão da Fase 2 derrubou isso com quatro provas independentes.** A tela existe:

- **o componente** — `client/src/components/almoxarifado/ConfiguracoesAlmoxarifado.js:2545`,
  a aba `TabPerfisAcesso`, com `api.get('/almoxarifado/perfis-usuario')` (`:2557`) e
  `api.put(...)` (`:2570`), registrada em `TABS` (`:191`) e renderizada em `:265`;
- **o menu** — `Layout.js:393`, `/almoxarifado/configuracoes`, `adminOnly`;
- **o manual deste repo** — `docs/almoxarifado-manual-do-sistema.md:615`, que a descreve com as
  três colunas e a busca por nome/e-mail;
- **o uso real** — commit `6018f0a` (2026-08-05, *"tela para atribuir perfil de acesso por
  usuario"*), **sete** linhas de auditoria em `perfil_almoxarifado_usuario` e dois perfis
  atribuídos no banco de desenvolvimento, o mais recente em 2026-08-25.

E ela **já cumpre** o que este design ia mandar construir: origem `forcado` sem seletor e com o
motivo na linha, "Produção (padrão)" mandando perfil vazio, lista de perfis vinda de
`data.perfis` (não hardcodada), mensagem do servidor no 409, e ainda busca e invalidação do
cache de permissões.

**Como o erro aconteceu, para não repetir:** procurei no client por `perfil_almoxarifado` e por
`perfis-almoxarifado` — e a rota é `perfis-usuario`, dentro de um arquivo de outra aba. Uma
varredura incompleta virou a afirmação "não existe", que é a forma mais cara de errar num
documento que outra sessão lê primeiro. **Medir ausência exige procurar pelo nome do
contrato, não pelo nome que eu imagino que o consumidor usaria.**

**O que sobra de verdade nesta perna**, medido pela revisão e agora o escopo real da etapa:

1. **A tela existente não tem teste nenhum** — zero `.test.js` cobrindo `TabPerfisAcesso`.
2. **`PERFIS_INFO` é hardcodado no client**, então um perfil novo nasce sem rótulo (seção 3).
3. **Voltar ao padrão não deixa rastro**, e a auditoria de perfil não grava `dados_anteriores`
   (seção 4).
4. **`ADMINISTRADOR` é oferecido no seletor** e concedê-lo é frágil e perigoso (seção 5).

### 2. O perfil QUALIDADE não existe

`services/almoxarifado/permissions.js:6-14` tem **sete** perfis e nenhum é QUALIDADE. A pendência
está nomeada em **duas** features — na 09 (inspeção) desde a Etapa 5, e na 23 (perfis) — e nunca
foi paga.

Medido o que ele precisa poder fazer: `inspecionar` gateia **quatro** rotas, e as quatro são
atos de qualidade — decidir a inspeção do item recebido
(`extended.js:.../itens/:itemId/inspecionar`), liberar vencimento de lote, mudar status de lote e
mudar status de série. Hoje só `ADMINISTRADOR` e `ALMOXARIFE` as alcançam, o que obriga a área
de qualidade a pedir para o almoxarifado decidir — ou a receber um perfil largo demais.

### 3. `PERFIS_INFO` é hardcodado no client

`ConfiguracoesAlmoxarifado.js:2535` mapeia rótulo e descrição dos sete perfis **à mão**. A lista
do seletor vem do servidor, mas o **texto** não: um perfil novo aparece como `QUALIDADE` cru na
opção e como `—` na coluna "O que isso permite". O design anterior dizia que "QUALIDADE aparece
sozinho sem tocar no front" — **verdadeiro para a lista, falso para o texto**.

### 4. Tirar o perfil de alguém é invisível na trilha

`extended.js:294-297` retorna **antes** do `registrarAuditoria` de `:309`: o caminho "voltar ao
padrão" apaga a linha e **não audita nada**. E o `registrarAuditoria` grava só `dados_novos` —
`dados_anteriores` é sempre `null`, então a tela de auditoria da Etapa 22 não tem "de" para
mostrar. Reproduzido pela revisão: atribuir → 1 linha; remover → **continua 1 linha**.

É exatamente a família de defeito que a Etapa 23 fechou (a trilha mentindo por omissão), na
rota que decide **quem tem acesso ao módulo** — o ato mais sensível que existe aqui.

### 5. `ADMINISTRADOR` no seletor: escala por uma porta e evapora por outra

`PERFIS_VALIDOS = Object.values(PERFIS)` inclui `ADMINISTRADOR`, e o seletor o oferece. Medido
pela revisão, duas consequências que ninguém declarou:

- **Escalada:** `hasAlmoxAdminPerfil` faz `canConfigureModule('almoxarifado')` valer para quem
  tem `perfil_almoxarifado === 'ADMINISTRADOR'`. Quem recebe esse perfil pela tela passa a
  configurar o módulo e **a promover outros**. E `classificarPerfil` o marca como `explicito`,
  não `forcado` — então nem o 409 nem a RN-03 o protegem.
- **Silêncio:** `syncModuleAdminProfiles` roda em **todo save de usuário** e executa
  `DELETE FROM perfil_almoxarifado_usuario WHERE usuario_id = ? AND perfil = 'ADMINISTRADOR'`
  quando `admin_modulos` não contém `almoxarifado`. O perfil concedido pela tela **é apagado no
  próximo save daquele cadastro** — o mesmo "pareceu ter funcionado" que o 409 existe para
  evitar, entrando pela porta do lado.

## Escopo escolhido

- **`QUALIDADE` com duas ações: `visualizar` e `inspecionar`.**
  **`ver_alertas` FICA DE FORA — correção de uma decisão que este design tomou com justificativa
  falsa** (achados A4 e A5). A justificativa era que "sem ele o perfil veria a tela de alertas
  vazia, que parece que não há nada pendente": **falso** — a tela não chama o GET sem a permissão
  e mostra o painel de sem-permissão (o bug do "vazio mentindo estado operacional" foi corrigido
  na Etapa 11). E o custo real é o oposto do que eu supunha: `montarCentral` percorre o registro
  **inteiro**, sem régua por perfil, então `ver_alertas` entrega **11** alertas — incluindo
  `ESTOQUE_SEM_CONSUMO` e `ESTOQUE_EXCESSIVO`, que carregam `valor_parado` (**custo**). A Etapa
  16 excluiu PRODUCAO/ENGENHARIA/CONSULTA da central **de propósito**, por esse mesmo motivo.
  Dar `ver_alertas` à Qualidade entregaria valor de estoque a quem não precisa dele.
  **Fica declarado:** os **quatro** alertas de qualidade (material reprovado, divergência de
  recebimento, lote sem certificado e — o mais próprio de todos, que eu não tinha contado —
  `QUARENTENA_PARADA`, a fila de itens aguardando inspeção) seguem invisíveis para o perfil até
  a central saber filtrar por perfil. Essa é a tarefa que destrava, e vai para a letra B.
  **Descartado** `receber_material` (anexar certificado é ato de recebimento) e
  **descartado** `ajustar_estoque` — com a consequência agora medida e declarada no item 5.
- **Os quatro consertos do que já existe** (seções 1 e 3 a 5). **Nenhuma tela nova, nenhuma
  rota nova.**

### 6. O que a Etapa 24 NÃO paga do item 131 da spec 23, e por quê

O checklist da spec 23 pede o perfil QUALIDADE com "`inspecionar`, aprovar/reprovar,
**bloquear/liberar sob desvio**". Bloquear/desbloquear usa `ajustar_estoque`, não `inspecionar`
— a spec 09 já tinha medido isso. Consequência concreta, medida pela revisão: na tela
`/almoxarifado/inspecoes`, **dois dos três botões ficam barrados** para QUALIDADE
(`InspecoesAlmoxarifado.js:197` e `:202`), e `POST /materiais/:id/bloquear` responde **403**.
Mantenho `ajustar_estoque` fora — mexer em saldo não é ofício de qualidade —, mas **o item 131
não fica integralmente pago**, e o fechamento tem de dizer isso em vez de marcá-lo `[x]`.

**Fica FORA, declarado:**

- **Mudar o fallback `PRODUCAO`** (`getPerfilFromUser`). Está na spec 23 como item da perna
  Perfis, mas é decisão de negócio com efeito imediato em todo mundo que hoje opera sem perfil
  explícito: mudar para `CONSULTA` "trancaria" o chão de fábrica no dia do deploy. Vai para a
  letra B com a medição, agora que a tela torna a alternativa viável (dar perfil explícito a
  quem precisa **antes** de apertar o padrão).
- **O mapeamento da spec 28 e o default de módulo** — os outros dois itens da perna Perfis;
  dependem daquela spec, não desta.
- **A perna Segurança** (dispositivo/IP na movimentação, retroativo, dupla conferência): cinco
  itens, etapa própria.

## Regras de negócio (RN)

- **RN-01 — Existe o perfil `QUALIDADE`,** com `visualizar` e `inspecionar`, e **sem**
  `movimentar`, `ajustar_estoque`, `configurar`, `ver_alertas` ou qualquer ação de cadastro.
  A revisão confirmou, com um usuário QUALIDADE real no harness, que **nenhuma** das quatro
  rotas de `inspecionar` faz outra checagem que o barraria (as quatro devolvem 404 de
  "não encontrado", ou seja, passam o gate), e que o perfil **não herda nada** por comparação
  direta de string em nenhum lugar do servidor.
- **RN-02 — O perfil novo aparece com rótulo e descrição na tela existente.** `PERFIS_INFO`
  (`ConfiguracoesAlmoxarifado.js:2535`) ganha a entrada de QUALIDADE. Sem isso o perfil aparece
  como `QUALIDADE` cru no seletor e `—` na coluna que explica o que ele permite.
- **RN-06 — Tirar o perfil de alguém deixa rastro, e o rastro tem "de".** A remoção passa a
  auditar, e a atribuição passa a gravar `dados_anteriores` com o perfil que havia antes
  (`null` quando não havia). Sem as duas metades, a tela de auditoria da Etapa 22 mostra a
  concessão de acesso sem o "de" e **não mostra a revogação**.
- **RN-07 — `ADMINISTRADOR` sai do seletor.** A tela deixa de oferecê-lo, com a razão visível:
  administrador do módulo se define no cadastro de usuário, e o perfil explícito
  `ADMINISTRADOR` é apagado no próximo save daquele cadastro. **Descartado** deixá-lo e apenas
  avisar: a concessão parece funcionar, dá poder de promover outros, e some sozinha depois —
  as três coisas juntas são pior que a ausência da opção.
- **RN-03 — Administrador não recebe perfil, e a tela explica em vez de falhar.** O backend já
  responde **409** com a mensagem literal
  `'Este usuário já é administrador (superadmin, admin de sistema ou admin do módulo) e tem
  acesso total ao almoxarifado. Remova essa condição no cadastro de usuário antes de definir um
  perfil específico.'` A tela **não oferece o seletor** para quem tem `origem === 'forcado'` —
  mostra o motivo. O 409 continua sendo a rede, porque o gate de verdade é o backend.
- **RN-04 — Voltar ao padrão é uma opção explícita.** Escolher "Padrão (Produção)" manda perfil
  vazio, o backend **apaga a linha**, e a origem volta a `padrao`. Sem isso, um perfil atribuído
  por engano só sairia pelo banco.
- **RN-05 — Mudar perfil aparece na tela de auditoria.** O verbo (`ATUALIZAR`) e a entidade já
  estão no `auditLabels`, e as opções do filtro vêm do banco — a revisão confirmou que a leitura
  funciona. Esta etapa **confere que aparece** em vez de supor.
  **A versão anterior desta RN dizia "já é auditado" e parava aí — estava incompleta**, e o
  próprio plano se contradizia três linhas adiante ao avisar que a rota grava só `dados_novos`.
  A parte que faltava virou a RN-06.

## Arquitetura

Sem serviço novo. O contrato **já existe e não muda**:

- `GET /perfis-usuario` → `{ perfis: string[], usuarios: [{ id, nome, email, perfil_explicito,
  perfil_efetivo, origem }] }`, com `origem ∈ {'explicito','padrao','forcado'}`.
- `PUT /perfis-usuario/:usuarioId` `{ perfil }` → 200 `{ usuario_id, perfil_explicito,
  perfil_efetivo, origem }`; **409** para forçado; **400** para perfil inválido; perfil vazio
  apaga a linha.

Muda: `permissions.js` (o perfil novo em `PERFIS` e nas **duas** ações), `extended.js` (a
auditoria da remoção e o `dados_anteriores`) e a aba que **já existe** em
`ConfiguracoesAlmoxarifado.js` (`PERFIS_INFO` e o seletor sem `ADMINISTRADOR`).
**Nenhuma tela nova, nenhuma rota nova** — a versão anterior deste design mandava criar
`AlmoxarifadoPerfis.js` com rota e menu próprios, o que teria feito uma segunda porta para uma
função que já tem porta.

**`PERFIS_VALIDOS` vem do próprio `permissions.js`** e a rota já o devolve no `GET` — então a
tela **não** hardcoda a lista de perfis, e QUALIDADE aparece nela sem tocar no front.

## Testes

- `permissions` (no arquivo que já cobre perfis): RN-01 — `QUALIDADE` **pode** `inspecionar`,
  `visualizar` e `ver_alertas`, e **não pode** `movimentar`, `ajustar_estoque`, `configurar`,
  `criar_material`. A asserção negativa é a que importa: um perfil novo que herda demais é pior
  que perfil nenhum.
- Uma das quatro rotas de `inspecionar` exercitada **com um usuário QUALIDADE de verdade** pelo
  harness (que roda `requirePermission` real) — sem isso, o perfil está provado só na tabela.
- `AlmoxarifadoPerfis.test.js`: lista com as três origens; o seletor **não aparece** para
  `forcado`; escolher um perfil manda o `PUT` certo; "Padrão (Produção)" manda vazio; o 409
  mostra a mensagem do servidor.
- **Integração cruzando com a Etapa 22:** mudar o perfil de alguém e ler pela tela-contrato
  (`GET /auditoria?entidade=perfil_almoxarifado_usuario`), conferindo que o ato aparece com o
  de/para.

## O que muda em cada camada

| Camada | Mudança |
|---|---|
| `services/almoxarifado/permissions.js` | perfil `QUALIDADE` + 3 ações |
| `routes/almoxarifado/extended.js` | audita a remoção; grava `dados_anteriores` |
| `client/.../ConfiguracoesAlmoxarifado.js` | `PERFIS_INFO` + seletor sem `ADMINISTRADOR` |
| `client/.../ConfiguracoesAlmoxarifado.test.js` | **primeiro teste** da aba (hoje: zero) |
| `specs/23` | a perna Perfis perde 2 dos 5 itens |
