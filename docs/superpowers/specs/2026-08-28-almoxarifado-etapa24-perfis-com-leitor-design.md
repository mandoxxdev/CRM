# Almoxarifado — Etapa 24: quem decide o acesso ganha tela, e a Qualidade ganha perfil (design)

Data: 2026-08-28 · Branch: `desenvolvimento-almoxarifado`
Origem: a perna **Perfis** da spec 23, que o fechamento da Etapa 23 nomeou como o que falta
para a feature virar 🟢 — e que não é decisão de negócio, é funcionalidade não construída.

## Decisão de escopo (Fase 0 — medida em 2026-08-28)

Os dois itens medidos são da mesma família do B33 que a Etapa 22 pagou: **backend pronto, sem
leitor** — e desta vez o buraco é operacional, não de auditoria.

### 1. Não existe tela para atribuir perfil. O backend inteiro existe.

`GET /api/almoxarifado/perfis-usuario` e `PUT /api/almoxarifado/perfis-usuario/:usuarioId`
(`routes/almoxarifado/extended.js:247` e `:273`) estão prontos, com gate `configurar`, auditoria,
validação, **409 para usuário que já é administrador** e remoção do perfil (voltar ao padrão).
Têm **11 cenários de teste** verdes (`tests/api/perfisUsuario.api.test.js`).

**Nenhum componente do client os consome** (verificado). Ou seja: o módulo inteiro é gateado por
perfil, `getPerfilFromUser` faz **fallback para `PRODUCAO`**, e portanto **todo usuário novo
entra como chão de fábrica sem que ninguém consiga promovê-lo pela interface** — só por
`curl` ou escrevendo no banco. É o mesmo padrão da trilha sem leitor, com uma diferença que o
torna mais urgente: aqui a ausência da tela **bloqueia a operação**, não só a leitura.

### 2. O perfil QUALIDADE não existe

`services/almoxarifado/permissions.js:6-14` tem **sete** perfis e nenhum é QUALIDADE. A pendência
está nomeada em **duas** features — na 09 (inspeção) desde a Etapa 5, e na 23 (perfis) — e nunca
foi paga.

Medido o que ele precisa poder fazer: `inspecionar` gateia **quatro** rotas, e as quatro são
atos de qualidade — decidir a inspeção do item recebido
(`extended.js:.../itens/:itemId/inspecionar`), liberar vencimento de lote, mudar status de lote e
mudar status de série. Hoje só `ADMINISTRADOR` e `ALMOXARIFE` as alcançam, o que obriga a área
de qualidade a pedir para o almoxarifado decidir — ou a receber um perfil largo demais.

## Escopo escolhido

- **`QUALIDADE` com três ações: `visualizar`, `inspecionar` e `ver_alertas`.** As duas primeiras
  são o ofício; `ver_alertas` entra porque três dos alertas do registro são de qualidade
  (material reprovado, divergência de recebimento, lote sem certificado) e sem ele o perfil veria
  a tela de alertas vazia — pior que não ter acesso, porque parece que não há nada pendente.
  **Descartado** dar `receber_material` (anexar certificado é ato de recebimento, e o certificado
  chega com a nota) e **descartado** `bloquear`/`ajustar_estoque` (mexer em saldo não é qualidade;
  quem reprova gera o bloqueio pelo próprio fluxo de inspeção).
- **A tela `/almoxarifado/perfis`**, consumindo o contrato que já existe, `adminOnly` no menu.

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

- **RN-01 — Existe o perfil `QUALIDADE`,** com `visualizar`, `inspecionar` e `ver_alertas`, e
  **sem** `movimentar`, `ajustar_estoque`, `configurar` ou qualquer ação de cadastro.
- **RN-02 — Quem administra o módulo enxerga e muda o perfil de cada usuário** em
  `/almoxarifado/perfis`: nome, e-mail, perfil efetivo e **de onde ele vem** (`explicito`,
  `padrao` ou `forcado`).
- **RN-03 — Administrador não recebe perfil, e a tela explica em vez de falhar.** O backend já
  responde **409** com a mensagem literal
  `'Este usuário já é administrador (superadmin, admin de sistema ou admin do módulo) e tem
  acesso total ao almoxarifado. Remova essa condição no cadastro de usuário antes de definir um
  perfil específico.'` A tela **não oferece o seletor** para quem tem `origem === 'forcado'` —
  mostra o motivo. O 409 continua sendo a rede, porque o gate de verdade é o backend.
- **RN-04 — Voltar ao padrão é uma opção explícita.** Escolher "Padrão (Produção)" manda perfil
  vazio, o backend **apaga a linha**, e a origem volta a `padrao`. Sem isso, um perfil atribuído
  por engano só sairia pelo banco.
- **RN-05 — Mudar perfil deixa rastro legível.** Já é auditado
  (`entidade: 'perfil_almoxarifado_usuario'`); com a Etapa 22, aparece na tela de auditoria.
  Esta etapa **confere que aparece** em vez de supor — é o teste que cruza as duas etapas.

## Arquitetura

Sem serviço novo. O contrato **já existe e não muda**:

- `GET /perfis-usuario` → `{ perfis: string[], usuarios: [{ id, nome, email, perfil_explicito,
  perfil_efetivo, origem }] }`, com `origem ∈ {'explicito','padrao','forcado'}`.
- `PUT /perfis-usuario/:usuarioId` `{ perfil }` → 200 `{ usuario_id, perfil_explicito,
  perfil_efetivo, origem }`; **409** para forçado; **400** para perfil inválido; perfil vazio
  apaga a linha.

Muda: `permissions.js` (o perfil novo em `PERFIS` e nas três ações) e o front
(`AlmoxarifadoPerfis.js` + rota lazy + `<Route>` + item de menu `adminOnly`).

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
| `client/.../AlmoxarifadoPerfis.js` | novo (tela) |
| `client/src/App.js`, `routes/lazyModules.js`, `components/Layout.js` | rota + menu (`adminOnly`) |
| `specs/23` | a perna Perfis perde 2 dos 5 itens |
