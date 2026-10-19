# Etapa 154 (Comercial): as listas de clientes e de projetos pela régua dos módulos que as leem, e as notificações pelo Comercial (C353, C363) — plano

> Origem: "Próxima tarefa detalhada — Etapa 154" do plano da 153
> (`docs/superpowers/plans/2026-10-19-almoxarifado-etapa153-paineis-relatorios-e-busca-global-pelo-modulo.md`). A etapa é pequena; o design,
> com a Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-19): última B **B994**, último C **C365**,
> última A **A101**. Esta etapa: **B995+**, **C366+**, **A102+**. Worktree `CRM-wt-e154`, branch `etapa-e154` (da main `0386e09e`).
>
> **Trava de máquina:** `scratchpad/e154-lock.sh` (o diretório `maquina-testes.lock` de sempre). Um arquivo de teste de servidor por vez,
> inclusive os revisores. A etapa toca o `index.js` (o portão nas 2 listas, o filtro nas notificações, o aviso do boot), o helper
> `conferirCamadasDoExpress.js` (o nome do portão novo), um teste novo, o teste da 151 (as listas mudam de régua) e, no client, o
> `Notificacoes.js` e o `Atividades.js` (o endereço do clique) com um teste novo. **Não** toca o template da proposta.
>
> **Fase 2 (um revisor fresco, só leitura, ANTES do código): 0 Critical, 1 Important, 8 Minor — todos aceitos.** A régua de 3 módulos foi
> remedida e **confirmada** (literais, templates, `api.get(variável)`, os imports lazy; nenhuma tela de outro módulo chama as listas; o Layout
> importa e não desenha o sino). **I-1** a varredura de tipos do T1 casaria o `tipo: 'aprovacao_desconto'` do objeto das aprovações que **não**
> é devolvido (o devolvido usa `tipo: row.tipo`): a regra passa a ser *os `'<tipo>' as tipo` das consultas = as chaves do mapa*, e o
> `podeVer` se aplica a **cada objeto do array final** (`todasNotificacoes.filter((n) => podeVer(n.tipo))`) — se alguém voltar a juntar as
> aprovações, elas passam pelo filtro (e, sem tipo no mapa, saem). **M-1** o `nome_modulo` congelado: *Comercial ou Almoxarifado ou
> Operacional*. **M-2** o 500 do próprio handler (`{ error: <mensagem do SQLite> }`) entra no contrato, como antes. **M-3** o inventário: o
> `OSFormPage` desenha o `OSDetalhesForm`, que **não** lê as listas (o `OSForm` só abre pelo `OrdensServico`); `OportunidadeForm`,
> `GerarPropostaModal` e o `components/PropostaForm.js` antigo não estão montados (o montado é o `components/proposta/PropostaForm`) — a
> tabela corrigida. **M-4** o mesmo endereço sem o `/comercial` no modal de lembrete das *Atividades* (`Atividades.js:165`) — entra no T4.
> **M-5** o select de cliente das *Reservas* desenha `c.nome`, que a tabela de clientes não tem (opções em branco) — de antes, **C367**.
> **M-6** a Fábrica também **cria** a OS (`POST`), não só edita — o fluxo do T1 faz os dois. **M-7** o fluxo do clique segue até as leituras
> da tela da proposta (`/propostas/:id`, `/clientes?status=ativo`, `/oportunidades`, `/familias`). **M-8** no T3 também o `comercialPermissao0`
> passa a tomar 403 nas listas (a tabela pela decisão dos três já cobre). O aviso do boot foi conferido contra as regex das 145–153: nenhuma
> atravessa o ponto da inserção.

## Fase 0 — medido (antes de qualquer código)

### As rotas (lidas no `index.js`)

| # | Verbo e caminho | Hoje | O que devolve |
|---|---|---|---|
| 1 | `GET /api/clientes` (`index.js:4332`) | só o login (RN-151.03, B983) | `SELECT * FROM clientes` — razão social, CNPJ, telefone, e-mail, endereço, coordenadas…; filtros `status`, `search` |
| 2 | `GET /api/projetos` (`index.js:5362`) | só o login (RN-151.03) | os projetos com `cliente_nome` e `responsavel_nome`; filtros `cliente_id`, `status`, `responsavel_id` |
| 3 | `GET /api/notificacoes` (`index.js:17879`) | só o login | os lembretes (`'lembrete_proposta' as tipo`) das propostas de que o usuário é responsável ou criador, com lembrete vencido, de hoje ou dos próximos 7 dias: número, título, mensagem, cliente. Lê também as aprovações pendentes (a quem tem `pode_aprovar_descontos`) e **não as devolve** (`todasNotificacoes = [...notificacoesLembretes]` — C363 corrigida na 153) |

Nenhum outro arquivo do servidor registra esses caminhos; nenhum serviço os chama por HTTP (`grep -rnE "/api/(clientes|projetos|notificacoes)['\"\`?]" server` fora de
`node_modules`: só o `index.js` e dois testes — o `chatSocketInativoNoServidor` usa `"app.get('/api/clientes'"` como âncora de trecho, que não muda).

### Quem chama (client inteiro, `client/src`, pelo literal do caminho — `grep -rnE "['\"\`]/(api/)?(clientes|projetos|notificacoes)(['\"\`?]|\$\{)"`)

**`GET /clientes`** — 11 arquivos, **8 montados** (Fase 2 M-3):

| Tela | Rota do client | Módulo da moldura (`ProtectedModuleRoute`) | O `catch` |
|---|---|---|---|
| `Clientes`, `Atividades`, `CustosViagens`, `ProjetoForm`, `proposta/PropostaForm` (montados) — e `OportunidadeForm`, `GerarPropostaModal`, o `PropostaForm` antigo (**não montados**: sem import, lazy ou rota) | `/comercial/*` | `comercial` | vários (lista vazia ou `console.error`) |
| `MaterialAlmoxarifadoForm` | `/almoxarifado/materiais/novo`, `/editar/:id` | `almoxarifado` | lista vazia calada |
| `ReservasAlmoxarifado` | `/almoxarifado/reservas` | `almoxarifado` | lista vazia calada |
| `OSForm` (só pelo `OrdensServico`; o `OSFormPage` desenha o `OSDetalhesForm`, que não lê as listas) | `/fabrica/ordens-servico` | `operacional` | `console.error` |

**`GET /projetos`** — 8 telas: `Projetos`, `OSComercialForm`, `PropostaForm` (Comercial); `MovimentacoesAlmoxarifado`, `ReservasAlmoxarifado`,
`SobrasAlmoxarifado` (Almoxarifado, todas com `.catch(() => ({ data: [] }))`); `OSForm` (Fábrica / Operacional).

**Os outros módulos — medido, nenhum chama:** Compras (`components/compras`, `Compras.js`, `ComprasSolicitacoesCompra.js`), Financeiro
(`Financeiro.js`), Frota (`components/frotas`), Engenharia (`components/engenharia`, os cálculos), Engenharia / Projetos
(`components/engenhariaProjetos` — lê `/engenharia/materiais-escritorio` e grava `/solicitacoes-compra`), TODOLIST, Configurações (o
`ConfiguracoesAlmoxarifado` embutido não lê as listas), Administração. O `MateriaisClienteAlmoxarifado` lê
`/almoxarifado/materiais-cliente/clientes` — **outra** rota. Cada tela das listas está montada **só** dentro da moldura do módulo dela
(`App.js`: `/comercial` → `comercial`, `/almoxarifado` → `almoxarifado`, `/fabrica` → `operacional`); a Fábrica monta também a
`RequisicoesMaterialNovaPage` com `moduloKey="engenharia_projetos"`, que **não** lê as listas.

**Conclusão:** a régua "algum dos módulos que as leem" = **Comercial, Almoxarifado ou Operacional**. Quem abre qualquer tela que chama as
listas tem um dos três pela régua da tela (`ProtectedModuleRoute` → `hasModuleAccess`, a mesma decisão do `temModuloComoATela`, presa pela
tabela `portaoComoATela.casos.json` desde a 145). Logo, **nenhuma tela que funciona hoje deixa de funcionar** — e o `catch` calado das telas
do Almoxarifado (lista vazia) nunca é alcançado por quem abre a tela. *(O caso de borda: a permissão tirada no meio da sessão — a tela
aberta com o cache velho recebe 403 e mostra a lista vazia calada; de antes, igual em todo portão das 145–153 — vira a **C366**.)*

**`GET /notificacoes`** — **uma** tela: o `Notificacoes` (o sino). **A medição desmente a 153:** a C363 dizia "o sino, na moldura de todos os
módulos". **Estava errado:** o `Layout.js` **importa** o `Notificacoes` (linha 21) e **não o desenha** (nenhum `<Notificacoes` no arquivo); o
único que o desenha é o `Dashboard` (`Dashboard.js:563`), o painel do índice de `/comercial`. Quem não tem o Comercial nunca vê o sino; o
vazamento é só pela API. O clique leva a `/propostas/editar/:id` (sem o `/comercial`): a rota do client é `/comercial/propostas/editar/:id`
(`App.js:281`, dentro de `/comercial`) — o clique cai na tela de rota inexistente, para todos. O mesmo endereço no modal de lembrete das
*Atividades* (`Atividades.js:165`, Fase 2 M-4).

### Banco local (cópia de 09/10, `scratchpad/e153/db`, lida em modo só leitura — `scratchpad/e154/a102run.js`)

Os 10 usuários ativos; os 4 sem o Comercial da A101 (7 Compras + Almoxarifado, 8 Engenharia / Projetos, 12 Almoxarifado, 15 Almoxarifado +
Compras). **Perde as listas: só o 8** (PAULO LEMOS, só `engenharia_projetos`) — nenhuma tela dele as chama. **Lembretes de quem não tem o
Comercial:** 0. Controle (cópia): dado o Operacional ao 8 e tirado o Almoxarifado do 12, a consulta troca o 8 pelo 12.

## Decisão de desenho (vai para a letra B)

- **As 2 listas pela régua da tela de "algum dos três"** — um portão novo,
  `exigirLeitorDasListasDeClientesEProjetos = portaoDasPropostas.exigir(['comercial', 'almoxarifado', 'operacional'])`, como 2º middleware.
- **As notificações pelo filtro por tipo da 153**, `TIPOS_DAS_NOTIFICACOES = { lembrete_proposta: ['comercial'] }` e
  `filtrarNotificacoesPorModulo = portaoDasPropostas.filtrarPorModulo(TIPOS_DAS_NOTIFICACOES, { contexto: 'portao:notificacoes' })`: quem
  não tem o Comercial recebe **200 `[]`**, sem log (o sino recarrega a cada 30 s; um 403 viraria uma linha de *acesso negado* a cada 30 s se
  o sino um dia for desenhado na moldura). Um tipo novo de outro módulo entra no mapa com o módulo dele.
- **O clique do sino** vai a `/comercial/propostas/editar/:id`.
- **Desligado** (`PROPOSTAS_PORTAO_DE_MODULO=desligado`, B946): as listas voltam ao **só login** (como antes da etapa — não à régua antiga:
  antes da etapa elas não tinham régua nenhuma, e desligar não abre mais do que havia antes, nem fecha) e as notificações mostram os lembretes
  a qualquer logado.

## Regras de negócio

- **RN-154.01 — as 2 listas exigem o Comercial, o Almoxarifado ou o Operacional pela régua da tela (C353).** `GET /api/clientes` e
  `GET /api/projetos`: o `exigirLeitorDasListasDeClientesEProjetos` como 2º middleware. Recusa: **403**
  `{ "error": "Acesso negado ao módulo", "modulo": ["comercial", "almoxarifado", "operacional"] }` e a linha `acesso_negado` no log com
  `modulo = 'comercial|almoxarifado|operacional'` (o `nome_modulo` medido no teste). `SQLITE_BUSY` ao ler as linhas → **503**
  (`context: 'portao:propostas'` — o contexto fixo do `exigir`); outro erro → **500** *"Erro ao verificar permissões"*. Super ou role admin
  passam sem ler. O corpo de quem passa não muda (os filtros `status`, `search`, `cliente_id`, `responsavel_id` também).
- **RN-154.02 — as notificações filtram por tipo (C363).** `GET /api/notificacoes` com o `filtrarNotificacoesPorModulo` como 2º middleware.
  Super ou role admin: tudo, sem ler as linhas. Os outros: só os tipos cujo módulo `temModuloComoATela` aceita; nenhum tipo aceito → **200
  `[]`** sem rodar as consultas e sem log. Sem o filtro na rota (`req.tiposPermitidos` indefinido) → `[]` (fecha, como a busca — 153 M-6).
  `SQLITE_BUSY` → **503** (`context: 'portao:notificacoes'`); outro erro → **500** *"Erro ao verificar permissões"* (a tela, no erro, mostra
  o sino sem número — o `catch` põe `[]`). Para quem passa, o corpo, a ordem e a janela (vencido, hoje, 7 dias) não mudam.
- **RN-154.03 — o clique do sino abre a proposta.** `Notificacoes.js`: `navigate('/comercial/propostas/editar/' + proposta_id)`.
- **RN-154.04 — o mesmo interruptor.** Desligado: as 2 listas voltam ao só login e as notificações aos lembretes de qualquer logado (o filtro
  não lê nada). O aviso do boot ganha, logo depois de *"…e as dos custos de viagem NAO exigem o Comercial (só o login)"*, o trecho
  *", e as listas de clientes e de projetos NAO exigem o Comercial, o Almoxarifado ou o Operacional (só o login), e as notificações do sino
  mostram os lembretes das propostas a qualquer logado"* — sem tocar nas frases que os testes da 145–153 prendem (a 153 prende o trecho
  contíguo *"…a qualquer logado; a lista de ordens…"* da busca, que fica igual).

## Contratos de API (congelados)

| Rota | Caso | Status | Corpo / mensagem literal |
|---|---|---|---|
| as 2 listas | sem nenhum dos três pela régua da tela | 403 | `{ "error": "Acesso negado ao módulo", "modulo": ["comercial", "almoxarifado", "operacional"] }` |
| as 2 listas | `SQLITE_BUSY` ao ler as permissões | 503 | `{ "error": "Banco temporariamente ocupado. Tente novamente em alguns segundos.", "code": "SQLITE_BUSY", "retryAfter": 3, "context": "portao:propostas" }` |
| as 2 listas | outro erro ao ler as permissões | 500 | `{ "error": "Erro ao verificar permissões" }` |
| notificações | sem o Comercial pela régua da tela | 200 | `[]` (sem log de acesso negado) |
| notificações | com o Comercial (ou super/admin) | 200 | como antes: `[{ id, tipo: 'lembrete_proposta', titulo, mensagem, data, prioridade, proposta_id, cliente_nome, numero_proposta }]` |
| notificações | `SQLITE_BUSY` ao ler as permissões | 503 | o mesmo corpo, com `"context": "portao:notificacoes"` |
| notificações | outro erro ao ler as permissões | 500 | `{ "error": "Erro ao verificar permissões" }` |
| as 3 | erro na consulta do próprio handler (inclusive um BUSY ali) | 500 | `{ "error": <a mensagem do SQLite> }` — como antes (Fase 2 M-2) |
| as 2 listas | o log do 403 | — | `logs_auditoria`: `modulo = 'comercial|almoxarifado|operacional'`, `nome_modulo = 'Comercial ou Almoxarifado ou Operacional'` (Fase 2 M-1) |
| as 3 | `PROPOSTAS_PORTAO_DE_MODULO=desligado` | — | como antes da etapa (só o login; os lembretes a qualquer logado) |
| aviso do boot (desligado) | — | — | o trecho da RN-154.04, depois do dos custos de viagem |

## Tasks (sort topológico)

- [x] **T1 — `fa41db01` (+ Fase 5 `073b330c`) — tronco — `tests/api/listasNotificacoesPortao.api.test.js`, escrito ANTES do T2 (vermelho medido), pelo `index.js` real (pasta
  vazia), molde do `paineisBuscaGlobalPortao`:**
  - **pelo fonte:** as 2 listas com `authenticateToken, exigirLeitorDasListasDeClientesEProjetos, ` e a definição do portão com os três
    módulos; as notificações com `authenticateToken, filtrarNotificacoesPorModulo, `, registrada uma vez (régua no texto inteiro, sem caixa),
    nenhum registro fora do `index.js`, nenhum `app.use` no prefixo, a régua de todo o servidor (`regua.registrosNaoLiterais`); o mapa
    `TIPOS_DAS_NOTIFICACOES` (chaves e valores) é igual aos `'<tipo>' as tipo` das consultas do corpo, e o array final passa por
    `.filter((n) => podeVer(n.tipo))` (Fase 2 I-1);
  - **as camadas** das notificações (prefixo `/api/notificacoes`, cadeia `['authenticateToken', 'filtro:lembrete_proposta=comercial']`) —
    as das listas ficam com o teste da 151 (o dono do prefixo, T3);
  - **o barrado** (só Engenharia / Projetos — o perfil do usuário 8 —, só Compras, só Financeiro): 403 nas 2 listas (com e sem os filtros que
    as telas mandam), o corpo literal, o log com o módulo do portão e nada gravado; as notificações dele, **com um lembrete de hoje numa
    proposta dele**, devolvem `[]` e não gravam log; **a metade positiva:** o vendedor com o mesmo tipo de lembrete o recebe;
  - **os fluxos pela rota (integração com as 149 e 151):** o Almoxarifado faz os gestos das quatro telas dele (o material escolhe o
    cliente na lista e grava com ele; a reserva, a movimentação e a sobra leem os projetos), o Operacional abre a OS da Fábrica (as 2
    listas), **cria** uma OS com o cliente e o projeto escolhidos nelas (`POST`) e edita outra (`PUT /api/operacional/ordens-servico/:id`)
    (Fase 2 M-6), o vendedor recebe o lembrete e **segue o clique** até as leituras da tela que ele abre (`GET /api/propostas/:id`,
    `/clientes?status=ativo`, `/oportunidades`, `/familias` → 200; Fase 2 M-7);
  - **a tabela por usuário** (os perfis da 151 + só Compras, só Financeiro, só Frota, só Engenharia): a decisão da tela calculada pelo
    `temModuloComoATela` com os três módulos e com o Comercial, sobre as linhas do `GET /api/usuarios/:id/grupos`, contra as 2 listas e as
    notificações (o lembrete aparece ou não);
  - **o desligado:** as 2 listas abrem ao barrado com o conteúdo, as notificações lhe mostram o lembrete; o aviso do boot traz o trecho;
    ligado de novo, barra;
  - **o BUSY/500:** 503 nas listas (`portao:propostas`) e nas notificações (`portao:notificacoes`); 500 nas duas; o administrador passa sem ler.
- [x] **T2 — `fa41db01` — tronco — o código (RN-154.01/02/04).** `index.js`: o portão e o filtro definidos junto dos outros (com o comentário da etapa),
  as 2 listas e as notificações com eles, o retorno `[]` antecipado no handler das notificações e o `podeVer('lembrete_proposta')`, o
  trecho do aviso. `tests/helpers/conferirCamadasDoExpress.js`: `PORTAO_NO_DESPEJO.exigirLeitorDasListasDeClientesEProjetos =
  'portao:comercial|almoxarifado|operacional'`. Aplicado por script com âncoras contadas.
- [x] **T3 — `fa41db01` — tronco (depende do T2) — o teste da 151 (`clientesProjetosPortao`) muda a régua das listas.** RN-151.03 → "as listas pela régua
  da 154": o fonte (a cadeia nova), as camadas (`cadeiaDoPortao('exigirLeitorDasListasDeClientesEProjetos')`), o cenário do barrado (o
  `soAlmox` continua lendo), a integração (`soAlmox` e `soOperacional` leem; o `soEngProjetos` passa a tomar 403 nas duas), a tabela por
  usuário (as listas pela decisão dos três — também o `comercialPermissao0` passa a 403, Fase 2 M-8), o BUSY ("as listas nem leem" → as listas leem: 503 ao barrado, 200 ao administrador), o
  desligado (as listas abrem ao `soEngProjetos`). Os comentários "aberta desde a 151" das 152/153 passam a dizer "a régua da 154".
- [x] **T4 — `a5b9365e` (+ Fase 5 `073b330c`) — galho (só depende do contrato) — o client.** `Notificacoes.js:55` e `Atividades.js:165` (Fase 2 M-4) com o `/comercial`;
  `Notificacoes.test.js` novo: o clique numa notificação navega a `/comercial/propostas/editar/<id>`, e o endereço é uma rota montada dentro
  de `/comercial` no `App.js` (com controle positivo: o endereço antigo derruba).
- [x] **T5 — controle positivo (sabotagens com âncora contada, sob a trava) e a suíte inteira.**

## Decisões (vão para a letra B)

- **B995** — as 2 listas pela régua da tela de **algum dos três** (Comercial, Almoxarifado, Operacional). Descartado: (a) só o Comercial —
  trancaria fora o Almoxarifado (4 telas) e a Fábrica (a OS); (b) a régua antiga (`checkAnyModulePermission`) — libera o Comercial a todo
  usuário sem grupo (B63) e lê a direta com `grupo_id = 0`, que a tela não lê; (c) deixar só o login (B983) — a lista entrega CNPJ, telefone,
  e-mail e endereço de todo cliente a quem nenhuma tela mostra (C353); (d) incluir Compras, Financeiro, Frota ou Engenharia — medido, nenhuma
  tela deles lê as listas. **Muda o acesso de quem usa a API sem tela:** no banco medido, 1 pessoa (o 8, só Engenharia / Projetos) — a A102.
- **B996** — as notificações pelo **filtro por tipo** (200 `[]`), não pelo portão (403). Descartado: o `exigirComercialNasPropostas` — hoje
  só o painel do Comercial desenha o sino, então o 403 não apareceria a ninguém; mas o sino recarrega a cada 30 s e o `Layout` já o importa:
  desenhado na moldura, cada 30 s de quem não tem o Comercial viraria uma linha de *acesso negado*. O filtro protege o mesmo dado sem isso.
- **B997** — o desligado volta as listas ao **só login** (o de antes da etapa), não à régua antiga; o mesmo da 145–153 para rota que antes só
  tinha o login (a lista de OS da 149 volta à régua antiga porque **tinha** a régua antiga).
- **B998** — a próxima etapa (155).

## Avisos novos (C)

- **C366** — com a permissão tirada no meio da sessão, as telas do Almoxarifado que leem as listas (material, reservas, movimentações,
  sobras) mostram a lista de clientes ou de projetos **vazia, calada** (o `catch` põe `[]`) em vez da mensagem de acesso negado, até a
  pessoa recarregar. De antes (vale para todo portão desde a 145); só aparece a quem perdeu os três módulos com a tela aberta.
- **C367** — nas *Reservas* do Almoxarifado, o seletor de cliente (destino da reserva e da transferência) mostra as opções **em branco** e a
  coluna mostra *"Cliente #<id>"*: a tela desenha o campo `nome`, que o cadastro de clientes não tem (tem razão social e nome fantasia).
  De antes (Fase 2 M-5); candidata técnica da tela.

## Execução

- **Linha de base:** a da main `0386e09e` (a 153 fechou com `test:api` **475/475**).
- **Fase 2 antes do código** (sem a divergência da 153): o revisor terminou antes de qualquer linha de código; o plano foi corrigido com os
  9 achados e só então o T1 foi escrito.
- **TDD, vermelho medido:** `listasNotificacoesPortao` contra o `index.js` da main **1 passed, 7 failed** (o fonte sem o portão e o filtro;
  as camadas com `authenticateToken, <anonima>`; o barrado lia as listas e recebia o lembrete; a tabela por usuário inteira em 200 e com o
  lembrete; o aviso sem o trecho; o BUSY respondia 200 — o que passou foi o fluxo do Almoxarifado e da Fábrica, a metade positiva, que já
  funcionava). Com o T2: **8/0**. O T3 (a 151) direto **8/0**.
- **Divergências do plano:** (1) o T1 prevê que o Operacional **cria** a OS (`POST`, Fase 2 M-6): a OS nasce pelo administrador, com o
  cliente e o projeto que o Operacional leu nas listas, porque o `POST` da OS responde 500 a quem não é administrador num banco novo (**C277**,
  de antes, do P.O.; a 151 mediu o mesmo) — o Operacional edita (`PUT`) e relê; (2) o T4 rodou em sequência, por mim (era galho, mas pequeno
  demais para uma worktree); (3) a Fase 5 acrescentou ao T1 um cenário (o 9º — o inventário de quem chama, no client) e o recorte do sino.
- [x] **T1/T2/T3 — `fa41db01`**; [x] **T4 — `a5b9365e`**; [x] **Fase 5 — `073b330c`**.
- **Controles K1–K11 (servidor, `scratchpad/e154/k/sabota.js`, sob a trava, âncora contada, restauro por cópia, md5 conferido — `27bc314a`
  antes e depois de cada um):** caíram **11/11**, cada um pela asserção certa. K1 uma lista sem o portão (154: o fonte, o barrado, a tabela, o
  desligado, o BUSY; 151: o fonte, as camadas, a integração, a tabela, o BUSY); K2 o portão sem o Operacional (154 também o fluxo da Fábrica);
  K3 o portão com a Engenharia / Projetos; K4 as notificações sem o filtro (7 cenários — o sino fecha para todos, 153 M-6); K6 o mapa com o
  Almoxarifado (o fonte, as camadas pelo nome do filtro, a tabela); K7 o contexto do 503 (o BUSY); K8 o aviso (o desligado); K10 um registro
  escondido por `apelido154['get']` (as camadas, a régua do texto nas duas); K11 `podeVer` sempre verdadeiro sem o retorno antecipado (5
  cenários). **K5** (o array final sem o filtro) e **K9** (sem o retorno antecipado) caem **só pelo fonte**: com um tipo só, o conjunto é "todos
  ou nenhum" e as duas proteções cobrem uma à outra — declarado (o mesmo K2/K15 da 153).
- **Controles do client (Notificacoes.test.js):** o endereço antigo no sino e nas Atividades derruba os dois cenários.
- **A102** rodada no banco local (cópia de 09/10, só leitura): **1** — o 8 (PAULO LEMOS, só `engenharia_projetos`, 0 lembretes); controle
  numa cópia (o Operacional dado ao 8, o Almoxarifado tirado do 12): o 8 saiu, o 12 entrou (`scratchpad/e154/a102run.js`).

## Fase 5 — três revisores frescos em paralelo, sob a trava

- **Regra (r1): 0 achados.** O `index.js` de `0386e09e` e o da etapa, cada um numa pasta vazia, ligado e desligado, sobre o mesmo banco (6
  clientes com status variados e acento/`%`/`_`, 6 projetos com cliente inexistente/nulo, 10 propostas do vendedor em toda a janela do
  lembrete, um lembrete de hoje para cada um): **31** chamadores × **29** URLs de lista + HEAD + 2 do sino. As listas: **580** respostas
  idênticas byte a byte para quem a tela admite, **319** viram 403 — exatamente os 11 que nenhum dos três admite, com o corpo literal; o log
  `comercial|almoxarifado|operacional` (11 × 30, nenhum das notificações); as notificações iguais (corpo e ordem) para os 9 com o Comercial e
  `[]` sem log para os 20 outros; desligado, **31 × 31** iguais ao de antes; o último gesto de cada tela (o material com o cliente da lista, a OS
  da Fábrica, o clique do sino até as leituras da proposta) igual.
- **Autorização (r2): 0 achados.** **49** perfis (direta, grupo ativo/inativo/vazio, permissão 0/2/`'1'`/`'sim'`, `grupo_id` 0, sem linha,
  super, role admin com variações, `admin_modulos`, rebaixado/grupo desativado/permissão retirada com o token antigo, desativado e apagado)
  contra uma cópia independente do `hasModuleAccess` do client: **0** divergências (as mudanças depois do login → 403 no pedido seguinte;
  desativado e apagado → 401). Caminhos e métodos (caixa, barra final, `.json`, `//`, `%2F`, `%2e`, query repetida, HEAD, OPTIONS, sete
  verbos): **0** vazamentos. As rotas vizinhas que leem clientes, projetos ou lembretes: todas com portão ou filtro (18 → 403 ao barrado; a
  busca e o stub de relatórios → `[]`). O inventário das telas conferiu com o da Fase 0.
- **Sabotagem (r3, worktree própria `CRM-wt-e154-r3`, removida): 15 sabotagens novas — 9 caíram pela asserção certa, 6 sobreviveram: 3
  achados reais, 3 sem defeito alcançável.** **A1 (Important)** — nenhum teste prendia o inventário de quem chama as listas no client: uma
  linha `api.get('/clientes')` no Compras passava com a suíte verde (a premissa da B995 só medida por grep). **A2 (Minor)** — o teste do client
  lia a rota do `App.js` como texto: aceitava a rota comentada e o componente errado. **A3 (Minor, de antes)** — o recorte do sino por
  responsável **ou** criador não tinha teste (o preparo gravava os dois iguais). Sem defeito: o clique com `notificacao.id` (hoje igual ao
  `proposta_id` — o teste passou a separar os dois); as Atividades com o endereço certo só num comentário (o teste passou a tirar os
  comentários); um middleware **global** registrado por receptor apelidado (`apelido.use(...)` sem caminho) escapa da régua do texto e das
  camadas e caiu só pelo comportamento — a lacuna é do helper das 152/153 (fica para a 155).
- **Correções da Fase 5 (`073b330c`):** o cenário do inventário (o client inteiro lido como texto: quem cita `/clientes`, `/projetos` e
  `/notificacoes` = a lista medida, com o módulo da moldura; só o `Dashboard` desenha o sino) — controles: a linha no Compras e o
  `<Notificacoes />` no Layout derrubam; o teste do client sem comentários e com o par `propostas/editar/:id` → `PropostaForm`, o id da
  notificação diferente do da proposta, o das Atividades em qualquer forma — controles: rota comentada, outro componente, o `id`, a
  concatenação com o template num comentário, todos caem; o recorte do sino com a proposta atribuída e a criada — controle: `responsavel_id`
  trocado por `created_by` derruba.
- **Suíte antes de `073b330c` (também a do fechamento — depois só mudaram documentos):** `test:api` **476/476**
  (`listasNotificacoesPortao` **9/0**, `clientesProjetosPortao` **8/0**); `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite`
  **4/0, 3/0, 16/0**; revisão obrigatória da proposta **23/23** + editor **39/39**; client **144** suítes / **1858** testes; `CI=true build`
  *Compiled successfully*. (Antes de `fa41db01`/`a5b9365e`, a mesma bateria: 476/476, 44/0, 4/3/16, 23/23, 39/39, 144/1858, build ok.)

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** — a Fase 5 (o inventário, o teste do client, o recorte do sino). O T2 deixou o teste novo verde
   na primeira aplicação; a 151 ficou verde com o T3 direto. Testes antigos mudados: **3** (o da 151, de propósito — a RN-151.03 mudou; os
   comentários da 152 e da 153).
2. **Achados da revisão:** Fase 2 — **1 Important + 8 Minor, reais** (o I-1 travaria o T1). Fase 5 — r1 **0**; r2 **0**; r3 **3** reais (1
   Important, 2 Minor) + 3 sobreviventes sem defeito; **0** ruído. **O que mais pesou:** a régua de acesso que depende de "quem chama, no
   client" precisa de uma prova que leia o client — a medição por grep vale no dia, não no dia seguinte.
3. **Paralelismo:** **0** galhos de código em paralelo (o T4, galho, feito em sequência — pequeno demais); **1** revisor na Fase 2 (antes do
   código), **3** em paralelo na Fase 5 sob a trava; **0** retrabalho.
4. **Defeito que escapou:** *(preenchido na Etapa 155)* **0** de código da 154 (os três revisores da 155 executaram as listas, o sino e o
   clique de novo — nada); **0** de documento (a C367 estava certa; a medição da 155 achou o irmão dela, o seletor de OS das Reservas — **C368**,
   de antes, que nenhuma etapa tinha visto); **1** de prova, herdado das 152/153 e usado pela 154: a régua das provas de portão deixava passar,
   além do middleware global por apelido (o R2 que a 154 nomeou), o `.use` registrado em **toda a API** (`'/api'`, `'/'`, `'*'`, `''`) por
   qualquer nome — ele roda no caminho neutro das camadas, na mesma posição (Fase 5 r1/r2 A1 da 155; corrigido lá).

**Retro da 153 — o defeito que escapou (preenchido aqui):** **0** de código; **1** de documento — a **C363** dizia *"o sino (na moldura de
todos os módulos)"*: **estava errado** — o `Layout` importa o `Notificacoes` e não o desenha; só o painel do Comercial o mostra (medido na
Fase 0 da 154, confirmado pela Fase 2 e pelos r1/r2); **1** de prova — o helper das camadas da 153 não vê um middleware global registrado por
receptor apelidado sem caminho (Fase 5 r3 da 154, R2 — caiu pelo comportamento; fica para a 155).

## Próxima tarefa detalhada — Etapa 155

*(A série desta etapa foi B995–B998, C366–C367, A102 — a 155 começa em **B999**, **C368**, **A103**; confira com `grep -oE` antes.)*

**Escolhida: as candidatas técnicas de tela que as 150–154 deixaram, nenhuma do P.O.** (1) **C367** — o seletor de cliente das *Reservas*
(destino da reserva e da transferência) desenha `c.nome`, que a tabela `clientes` não tem: as opções saem em branco e a coluna diz *"Cliente
#<id>"* (`ReservasAlmoxarifado.js:138, 505, 639`) — trocar por `razao_social` (com `nome_fantasia` de reserva), com teste de tela que monte o
seletor com o corpo real de `GET /api/clientes`; (2) **C364** — o *Ctrl+K* abre a busca para quem não tem nenhum tipo (a busca sempre volta
`[]`): a tela pode não abrir (ou dizer por quê) quando o usuário não tem o Comercial pela régua da tela (`hasModuleAccess`, a mesma do filtro
`TIPOS_DA_BUSCA_GLOBAL`); (3) **C365** — a busca descartar a resposta de um termo anterior (o interceptor repete o BUSY por uma chave sem o
termo; a tela deve comparar o termo da resposta com o do campo); (4) **C351** — `encodeURIComponent` no código do produto nas três telas da OS;
(5) a lacuna do helper (Fase 5 r3 R2 da 154): a régua do texto (`reguaDoFonteDoServidor.registrosNaoLiterais`) passar a acusar `.use(` por
qualquer receptor apelidado de `app` (hoje só `app|router|r|*Router`), medindo antes os falsos positivos.
**Pontos de atenção:** (1) **C367** é do Almoxarifado — a tela de Reservas tem teste (`ReservasAlmoxarifado.test.js`); confira se o mock
dele usa `nome` (o teste estaria provando o defeito); (2) a **C364** muda o que a tela mostra para quem não tem o Comercial — registre em B;
(3) o inventário de quem chama as listas (`listasNotificacoesPortao`, cenário 9) cai se uma tela nova citar `/clientes` — é o lugar de
conferir a régua.

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 152 — **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o
resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela de conversões e o grupo acima de família, a régua do
tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens de
produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**, **B101**/G30,
**G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62, a **C348**; nas propostas, a verificação do dono da proposta (Fase
12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a Frente B da lentidão, a **C297** (**B924**), a **B926**,
a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**; no Operacional, a **C332**; do Comercial, a **C354**, a
**C357**/**B988**, a **C359**/**B989** (e a **C360** junto), a **C358**; do núcleo, a **C362**. Pendem de Postgres: **C98**, **C110**. **Nada novo
do P.O. nesta etapa** (as decisões B995–B997 são reversíveis e estão na letra B).

**O que já está pronto e não precisa reabrir:** as duas listas pelo `exigirLeitorDasListasDeClientesEProjetos` (os três módulos); o filtro
das notificações (`TIPOS_DAS_NOTIFICACOES`, o array final filtrado); o clique do sino e do lembrete das Atividades; os testes
`listasNotificacoesPortao` (9, com o inventário do client) e `clientesProjetosPortao` (8, dono das cadeias das listas) e o
`Notificacoes.test.js` (2). Candidatas menores para encaixar se sobrar: **C361** (um prazo na geocodificação), **C366** (a lista vazia calada
quando a permissão sai no meio da sessão — de todos os portões).
