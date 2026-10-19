# Etapa 152 (Comercial): os custos de viagem exigem o Comercial, e o resumo da tela volta a responder (C350) — plano

> Origem: "Próxima tarefa detalhada — Etapa 152" do plano da 151
> (`docs/superpowers/plans/2026-10-19-almoxarifado-etapa151-clientes-projetos-oportunidades-atividades-pelo-modulo.md`). A etapa é pequena;
> o design, com a Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-19): última B **B985**, último C **C355**,
> última A **A99**. Esta etapa: **B986+**, **C356+**, **A100+**. Worktree `CRM-wt-e152`, branch `etapa-e152` (da main `5512bd64`).
>
> **Trava de máquina:** `scratchpad/e152-lock.sh` (o diretório `maquina-testes.lock` de sempre). Um arquivo de teste de servidor por vez,
> inclusive os revisores. A etapa **não** toca o template nem o client; toca o `index.js` (o portão em 19 rotas, a ordem do resumo e o aviso
> do boot), um teste novo, um helper de teste novo e os testes das 148/149/150 (a régua de todo o servidor).
>
> **Fase 2 (um revisor fresco, só leitura, com uma sonda do fluxo inteiro da tela sob a trava): 1 Critical, 2 Important, 6 Minor — todos
> aceitos antes do código.** A medição de quem chama foi refeita por fora e **confirmou** a Fase 0 (ninguém fora do Comercial); o 404 do
> resumo reproduzido. **C-1** apagar um custo **editado** ou lançado *autorizado sem regras* responde **500** `SQLITE_CONSTRAINT: FOREIGN KEY
> constraint failed` (o histórico e o log de autorização apontam para o custo sem `ON DELETE CASCADE`) — de antes; vira a **C359** e a
> **B989** (não consertado: apagar o histórico junto é decisão do P.O.); o `DELETE` do teste vai num custo **virgem**, e a integração prende o
> 500 do editado. **I-1** o helper da régua nasce no **T2** (o teste novo o usa); o T3 só migra as 148/149/150 para ele. **I-2** o
> `coordenadas-cliente` com endereço chama o Nominatim **sem prazo** (o único caminho que a tela usa — ela só chama com endereço): o teste usa
> clientes sem endereço (o recuo pela cidade) e declara que o caminho real da tela fica sem teste — **C361**. **M-1** o `GET /:id` não tem
> chamador (a tela edita pela linha da lista) — 18 chamadas, não 19. **M-2** o `POST`, o `PUT` e o duplicar gravam os filhos **depois** de
> responder — o teste espera antes de ler. **M-3** o resumo num banco vazio sai com as somas **null** (a tela usa `|| 0`). **M-4** apagar o
> custo deixa o arquivo do comprovante no disco — **C360**. **M-5** sem o upload real de 41 MB (o cliente pode tomar ECONNRESET): o arquivo
> pequeno prova o mesmo. **M-6** `aprovar` e `DELETE` com id inexistente respondem 200 — de antes, o teste não espera 404.

## Fase 0 — medido (antes de qualquer código)

### As rotas (lidas no `index.js`; nenhuma fora dele — `grep -rn "custos-viagens\|custos_viagens"` no `server/` fora de `node_modules`/`tests` só acha o `index.js`)

**19 registros `/api/custos-viagens*`, todos só com `authenticateToken`** (a contagem da 151 bate), na ordem do arquivo:

| # | Verbo e caminho | O que faz |
|---|---|---|
| 1 | `GET /coordenadas-cliente/:cliente_id` | lê endereço/cidade/UF do cliente e geocodifica (rede externa só se o cliente tem endereço) |
| 2 | `GET /clientes-proximos/:cliente_id` | **todos** os clientes ativos num raio (razão social, fantasia, cidade, UF, endereço) |
| 3 | `GET /calcular-rota` | cálculo puro (cidades), sem banco |
| 4 | `GET /` | a lista (até 500), com filtros `cliente_id`, `proposta_id`, `data_inicio`, `data_fim`, `codigo_visita`, `created_by`, `status_aprovacao`, `ordenar_por`, `ordem` |
| 5 | `GET /:id` | um custo |
| 6 | `GET /verificar-elegibilidade/:cliente_id` | propostas e valor aprovado do cliente |
| 7 | `POST /` | lança (e grava `viagem_clientes` e o log de autorização sem regras) |
| 8 | `PUT /:id` | edita (e grava o histórico) |
| 9 | `POST /:id/aprovar` | aprova/rejeita — **sem régua própria no corpo** (qualquer um que passe aprova, inclusive o próprio lançamento) |
| 10 | `GET /:id/logs-autorizacao` | os logs de autorização sem regras |
| 11 | `POST /:id/duplicar` | duplica |
| 12 | `POST /:id/comprovante` | multer `uploadComprovante` (disco, 40 MB, qualquer tipo) — hoje o multer roda **antes** de qualquer portão |
| 13 | `GET /:id/comprovantes` | lista os anexos |
| 14 | `GET /:id/comprovante/:anexo_id` | baixa o anexo (dado pessoal — sem estático desde a Etapa 81) |
| 15 | `DELETE /:id/comprovante/:anexo_id` | apaga o anexo (banco e disco) |
| 16 | `GET /:id/historico` | o histórico de alterações |
| 17 | `DELETE /:id` | apaga o custo |
| 18 | `GET /analise/cliente` | custo × vendas por cliente (top 50) |
| 19 | `GET /resumo` | totais gerais |

**O resumo nunca é atendido (medido, `scratchpad/e152/sonda-resumo.js`, o `index.js` da main numa pasta vazia):** o `GET /:id` (#5) é
registrado **antes** do `GET /resumo` (#19) e casa `/api/custos-viagens/resumo` com `id = 'resumo'` → **404** `{ "error": "Custo de viagem
não encontrado" }`, com um custo lançado no banco. A tela (`CustosViagens.loadResumo`) engole o erro (`console.error`) e os quatro cartões do
topo (*total de viagens*, *custo total*, *custo médio*, *clientes visitados*) **nunca aparecem**. É defeito de antes — vira a **C356**, e o
conserto (mover o registro para antes do `/:id`) vai declarado na **B987**. Os outros caminhos de dois segmentos registrados depois do `/:id`
(`verificar-elegibilidade/:cliente_id`, `analise/cliente`) não casam com o `/:id` (um segmento) — medidos: `analise/cliente` → 200 `[]`,
`verificar-elegibilidade/1` → 404 *"Cliente não encontrado"* (a dela).

### Quem chama (client inteiro, `client/src` — `grep -rn "custos-viagens\|custos_viagens\|CustosViagens\|PreviewRota"`)

- **`CustosViagens`** (18 das 19 — inclusive o resumo, a análise e o comprovante; o `GET /:id` não tem chamador, a edição usa a linha da lista — Fase 2 M-1) — montado **só** em `/comercial/custos-viagens` (`App.js`, dentro
  do `ProtectedModuleRoute` do Comercial; item do menu do Comercial no `Layout`; `lazyModules`).
- **`PreviewRota`** (`GET coordenadas-cliente/:id`) — importado **só** pelo `CustosViagens` (o modal da rota). Não está montado noutro módulo.
- **`BuscaGlobal`** só tem o link `custo: /comercial/custos-viagens` — o servidor da busca global (`GET /api/busca-global`) não lê
  `custos_viagens` (medido: nenhum `custo` no corpo dela). Não chama nenhuma das 19.
- **`Permissoes`** (aba *Permissões* de `/admin`) tem um módulo `custos_viagens` na lista de módulos de grupo — **nenhum portão de tela ou de
  API o lê** (a tela de `/comercial/*` exige a linha `comercial`); no banco medido, **0** linhas com módulo de custo/viagem.
- **Financeiro, Frota, Compras, Fábrica, Almoxarifado, Engenharia, Configurações: nenhuma tela chama** (o palpite "o Financeiro aprova
  reembolso?" da 151 — medido: não há tela de aprovação fora do Comercial; o `aprovar` só é chamado pelo `CustosViagens`).
- **Servidor:** nenhum serviço, template ou rota busca estas rotas por HTTP; nenhum relatório, painel ou busca lê `custos_viagens` fora das 19
  (`grep "FROM custos_viagens"`: só as linhas das 19).

### Banco local (cópia de 09/10 do `CRM/server/data`, lida numa cópia no scratchpad — `scratchpad/e152/medir.js`)

**10** usuários ativos, **4** super/admin (2, 5, 13, 14), **0** grupos, **0** `admin_modulos`. Com o Comercial: 3, 9 (e os super). Sem o
Comercial: **7** (Compras + Almoxarifado), **8** (Engenharia / Projetos), **12** (Almoxarifado), **15** (Almoxarifado + Compras) — os mesmos 4
da A93–A99. **0** custos de viagem, **0** anexos, **0** históricos, **0** `viagem_clientes`, **0** logs de autorização. Com o desenho abaixo:
os 4 perdem as 19 **pela API** — nenhum deles tem tela que as chame (a tela já os barra do Comercial), e nenhum lançou viagem.

## Decisão de desenho (vai para a letra B)

**As 19 pelo Comercial pela régua da tela** (o `exigirComercialNasPropostas` da 145–151). A medição não achou **nenhum** leitor fora do
Comercial — não há leitura de muitos módulos para separar (a regra do usuário: proteger primeiro a escrita se a leitura for de muitos
módulos; aqui não é). O interruptor é o mesmo **`PROPOSTAS_PORTAO_DE_MODULO=desligado`** (B946) — o módulo é o Comercial.

## Regras de negócio

- **RN-152.01 — as 19 exigem o Comercial pela régua da tela (C350).** O `exigirComercialNasPropostas` como 2º middleware, logo depois do
  `authenticateToken` (no comprovante, **antes** do multer — o arquivo do barrado não chega ao disco). Recusa: **403** `{ "error": "Acesso
  negado ao módulo", "modulo": "comercial" }` e a linha `acesso_negado` no log (`modulo = 'comercial'`). `SQLITE_BUSY` ao ler as linhas →
  **503** (`context: 'portao:propostas'`); outro erro → **500** *"Erro ao verificar permissões"*. Nada é gravado (nem o arquivo do comprovante,
  nem o histórico, nem o log de autorização, nem a aprovação).
- **RN-152.02 — o resumo responde (C356).** `GET /api/custos-viagens/resumo` registrado **antes** do `GET /api/custos-viagens/:id`: devolve
  **200** com `total_viagens`, `total_custo_geral`, `custo_medio_viagem`, `clientes_visitados`, `propostas_relacionadas`, `custo_ida`,
  `custo_volta`, `custo_ida_volta` (o corpo de sempre da rota, que nunca era atendida). O `GET /:id` com um número continua igual (e o
  `/:id` com um id que não existe continua 404 *"Custo de viagem não encontrado"*).
- **RN-152.03 — o mesmo interruptor.** `PROPOSTAS_PORTAO_DE_MODULO=desligado` (B946): as 19 voltam a pedir só o login. O aviso do boot
  acrescenta os custos de viagem, mantendo as frases que os testes da 147–151 prendem. O resumo responde ligado e desligado (RN-152.02 não
  depende do interruptor).

## Contratos de API (congelados)

| Rota | Caso | Status | Corpo / mensagem literal |
|---|---|---|---|
| as 19 | sem o Comercial pela régua da tela | 403 | `{ "error": "Acesso negado ao módulo", "modulo": "comercial" }` |
| as 19 | `SQLITE_BUSY` ao ler as permissões | 503 | `{ "error": "Banco temporariamente ocupado. Tente novamente em alguns segundos.", "code": "SQLITE_BUSY", "retryAfter": 3, "context": "portao:propostas" }` |
| as 19 | outro erro ao ler as permissões | 500 | `{ "error": "Erro ao verificar permissões" }` |
| as 19 | `PROPOSTAS_PORTAO_DE_MODULO=desligado` | — | como antes da etapa (só o login) — exceto o resumo, que passa a responder (RN-152.02) |
| `GET /resumo` | quem passa | 200 | `{ total_viagens, total_custo_geral, custo_medio_viagem, clientes_visitados, propostas_relacionadas, custo_ida, custo_volta, custo_ida_volta }` — num banco vazio `total_viagens: 0` e as somas/média `null` (Fase 2 M-3) (antes: 404 `{ "error": "Custo de viagem não encontrado" }`) |
| `DELETE /:id` | o custo editado ou autorizado sem regras | 500 | `{ "error": "SQLITE_CONSTRAINT: FOREIGN KEY constraint failed" }` — de antes, sem mudança (**C359**, Fase 2 C-1) |
| `POST /:id/aprovar`, `DELETE /:id` | id que não existe | 200 | a frase de sucesso — de antes, sem mudança (Fase 2 M-6) |
| `POST /:id/comprovante` | barrado (qualquer arquivo) | 403 | o do portão (o multer não roda; provado com arquivo pequeno — Fase 2 M-5) |
| aviso do boot (desligado) | — | — | troca *"…das atividades NAO exigem o Comercial (só o login); a lista de ordens…"* por *"…das atividades NAO exigem o Comercial (só o login), e as dos custos de viagem NAO exigem o Comercial (só o login); a lista de ordens…"* |

As respostas de sucesso das outras 18 não mudam (corpo e status). As frases de validação de sempre (*"Data de viagem é obrigatória"*,
*"Destino é obrigatório"*, *"Viagem não encontrada"*, *"Nenhum arquivo enviado"*, *"Comprovante não encontrado"*, *"Cliente não encontrado"*,
*"Custo de viagem não encontrado"*) só aparecem a quem passa o portão.

## Tasks (sort topológico)

- [x] **T1 — `9ddd5dfe` — tronco — o portão nas 19, a ordem do resumo e o aviso do boot (RN-152.01–03).** `index.js`: o portão como 2º middleware nas 19
  (antes do multer no comprovante); o bloco do `GET /api/custos-viagens/resumo` movido para logo antes do `GET /api/custos-viagens/:id`
  (o comentário diz por quê); a frase nova no aviso (só acrescenta). Aplicado por script com âncoras contadas (`scratchpad/e152/t1.js`).
- [x] **T2 — `9ddd5dfe` + Fase 5 `cc70ee9e` — `tests/api/custosViagensPortao.api.test.js`, escrito ANTES do T1 (vermelho medido), pelo `index.js` real (pasta vazia), molde
  do `clientesProjetosPortao`:**
  - **pelo fonte:** as 19 com o portão como 2º middleware (o comprovante: o multer depois), cada uma registrada uma vez — régua no texto
    inteiro, sem caixa (`/\.(get|post|...|route)\(\s*\[?\s*["'`](\/(?:api\/)?custos-viagens...)/gi`); o resumo antes do `/:id`; nenhum
    registro fora do `index.js` (varredura com dotfiles e `.cjs`/`.mjs`); nenhum `app.use` no prefixo; a régua de todo o servidor (o helper do
    T2 — Fase 2 I-1: nenhum registro de app/router cujo caminho não seja texto literal fora dos 6 medidos; nenhum caminho montado cujo 1º segmento não
    fique fixo fora de `custos-viagens`);
  - **o barrado** (só o Almoxarifado) toma 403 em **cada uma** das 19 e nada muda (retrato de `custos_viagens`, `custos_viagens_anexos`,
    `custos_viagens_historico`, `viagem_clientes`, `logs_autorizacao_viagens`, a pasta `uploads`; o log conta 19 `comercial`); o comprovante
    multipart do barrado não chega ao disco; **a metade positiva:** o mesmo barrado lê `GET /api/clientes` (a lista aberta da 151) — 200;
  - **as metades positivas, pela rota, em fluxo (o vendedor só com o Comercial):** escolhe o cliente na lista (`GET /api/clientes`), confere a
    elegibilidade, os clientes próximos, as coordenadas, calcula a rota → lança (com `clientes_viagem` e `autorizado_sem_regras` + motivo) →
    lista (com filtros `cliente_id`, `status_aprovacao`, `codigo_visita`) → lê por id → edita (o histórico grava) → lê o histórico e os logs de
    autorização → anexa um comprovante (chega ao disco) → lista → baixa (o mesmo conteúdo) → apaga o comprovante (sai do disco) → duplica →
    aprova → análise por cliente → **resumo (200, os totais batem com o lançado)** → apaga o duplicado (sai do banco) e o lançado, editado,
    **não** apaga (500 — **C359**, preso como é hoje); os clientes sem endereço (Fase 2 I-2); espera antes de ler o que grava depois de
    responder (M-2);
  - **a tabela por usuário** (14 perfis, os da 151) com a decisão da tela calculada pelo `temModuloComoATela` e as linhas lidas do
    `GET /api/usuarios/:id/grupos`: uma leitura (`GET /`), o resumo, um `GET /:id`, um `PUT /:id` e o `aprovar` por perfil;
  - **o desligado:** as 19 abrem ao barrado e ao grupo ativo sem o Comercial (a régua antiga também o barraria), inclusive o `DELETE` que
    apaga de verdade (num custo **virgem** — Fase 2 C-1), o `PUT` que grava e o comprovante que chega ao disco; o aviso do boot cita os custos de viagem; ligado de novo, barra;
    o resumo 200 nos dois;
  - **o BUSY/500:** 503 numa leitura e numa escrita, 500 no `PUT`, no `aprovar` e no `DELETE`; o administrador passa sem ler; nada grava.
- [x] **T3 — `0bf06b57` — galho (em série depois do T1: a sabotagem dele mexe no `index.js` — o I-1 da 151) — a régua de todo o servidor nos testes das
  148, 149 e 150** (retro da 151): o `registrosNaoLiterais` e a varredura do `clientesProjetosPortao` viram um helper
  `tests/helpers/reguaDoFonteDoServidor.js` (**nasce no T2** — Fase 2 I-1) (`registrosNaoLiterais({ prefixos })`, `REGISTROS_NAO_LITERAIS_MEDIDOS`,
  `arquivosDoServidor()`); os testes das 148/149/150 e o novo da 152 o chamam com os seus prefixos (148: `clausulas-modelo`,
  `familias`, `operacional`; 149: `familias`, `operacional`; 150: `grupos`, `produtos`, `variaveis-tecnicas`); a régua "todo registro"
  delas passa a não diferenciar a caixa (`/gi`); a varredura "fora do index.js" delas passa a ver arquivos com ponto e `.cjs`/`.mjs`. O teste
  da 151 **não** muda (já tem a régua inline). Controle positivo: um registro com o caminho num identificador, um `router.get` com o caminho
  montado de um prefixo da etapa, e um registro com caixa diferente, cada um tem de derrubar a asserção nova de cada teste (a antiga não os
  via).

**Tabela por usuário (T2)** — colunas: as 19:

| Usuário | As 19 |
|---|---|
| sem nada (sem linha) | 200 |
| direta do Comercial | 200 |
| grupo ativo com o Comercial | 200 |
| grupo ativo sem linha | 200 |
| super / role admin (com só a direta do Almoxarifado) | 200 |
| Comercial só num grupo inativo (+ direta do Almoxarifado) | 403 |
| Comercial com permissão 0 | 403 |
| Comercial com `grupo_id = 0` (+ direta do Almoxarifado) | 403 |
| só a direta do Almoxarifado | 403 |
| só a direta do Operacional | 403 |
| só a direta de Engenharia / Projetos | 403 |
| administrador do módulo Comercial + direta do Administrativo | 403 |
| grupo ativo só com o Almoxarifado | 403 |
| só a linha `custos_viagens` (a aba antiga de Permissões) | 403 |

## Decisões (vão para a letra B)

- **B986** — as 19 pelo Comercial pela régua da tela, leitura e escrita. Descartado: (a) separar leitura de escrita como na 151 (B983) — a
  medição não achou leitor fora do Comercial, e as leituras trazem o que mais importa esconder (a lista dos clientes próximos com endereço, a
  análise custo × vendas, os comprovantes — dado pessoal); (b) a régua antiga (`checkModulePermission`, libera o Comercial a todo usuário sem
  grupo — no banco medido não mudaria nada); (c) aceitar a linha `custos_viagens` da aba antiga de Permissões — nenhuma tela a aceita (a tela de
  `/comercial/*` exige a linha `comercial`), e aceitá-la abriria a API a quem a tela barra; (d) um interruptor próprio — o módulo é o Comercial,
  o `PROPOSTAS_PORTAO_DE_MODULO=desligado` já é a chave dele.
- **B987** — o resumo consertado (registrado antes do `/:id`), declarado. Descartado: (a) só registrar (deixar os quatro cartões do topo da
  tela sumidos — a tela foi feita para mostrá-los e o servidor tinha a rota; o conserto é mover o registro, reversível); (b) tratar `resumo`
  dentro do `/:id` (esconde a rota de quem lê a lista de rotas). **Muda o que a tela mostra:** os cartões aparecem para quem abre a tela —
  com os totais de **todos** os lançamentos (como a lista, que também não filtra por quem lançou).
- **B988** — o `aprovar` continua sem régua própria (qualquer um com o Comercial aprova, inclusive o próprio lançamento) — é a **C357**, do
  P.O. (quem aprova reembolso?). Descartado: restringir ao administrador ou proibir aprovar o próprio — é regra de negócio, não acesso.
- **B989** — o `DELETE` do custo editado ou autorizado sem regras continua dando 500 (**C359**, de antes): consertar pede decidir se o
  histórico e o log de autorização somem junto (perde a trilha) ou se o custo com trilha não se apaga (a tela diria por quê) — do P.O.
  Descartado: apagar os filhos em cascata (irreversível nos dados — a trilha de auditoria some).
- **B990** — a próxima etapa (153).

## Avisos novos (C)

- **C356** — o resumo da tela de custos de viagem nunca respondia (404 pelo `/:id`): os quatro cartões do topo não apareciam. De antes;
  **consertado nesta etapa** (B987).
- **C357** — o `aprovar` do custo de viagem não tem régua própria: quem tem o Comercial aprova ou rejeita qualquer lançamento, inclusive o
  seu. De antes; do P.O.
- **C358** — a aba *Permissões* de **Administração** oferece um módulo *Custos de Viagens* (e *Clientes*, *Projetos*, *Atividades*…) que
  nenhum portão lê: marcar só ele não abre nada. De antes; candidata (remover ou mapear para o Comercial — é decisão de produto, P.O.).

- **C359** — apagar um custo de viagem **editado** (ou lançado *autorizado sem regras*) responde 500 e a tela mostra *"Erro ao deletar custo
  de viagem"*: o histórico e o log de autorização prendem o custo. De antes; do P.O. (B989).
- **C360** — apagar um custo de viagem deixa os arquivos dos comprovantes no disco (a linha sai em cascata, o arquivo não). De antes.
- **C361** — as coordenadas de um cliente **com endereço** consultam um serviço de mapas externo sem prazo: se a rede travar, o pedido fica
  pendurado (a tela de custos e a prévia da rota esperam). De antes; o teste só cobre o recuo pela cidade.

## Execução

- **Linha de base** (a árvore da main `5512bd64`, antes de qualquer código): `test:api` **473/473**.
- **TDD, vermelho medido:** `custosViagensPortao` contra o `index.js` da main **0 passed, 6 failed** (o fonte sem o portão nas 19; o barrado
  tomava **200** — o resumo **404** —; o fluxo do vendedor caía no resumo 404; a tabela por usuário inteira em 200 com o resumo 404; o aviso
  do boot sem os custos; o BUSY respondia 404/200 e gravava). Com o T1: **5/1** — a asserção do motivo do log de autorização esperava
  minúsculas (o servidor grava em maiúsculas; erro do teste, corrigido) — e então **6/0**.
- **Divergências do plano:** (1) a Fase 2 ajustou o T2 antes do código (o `DELETE` num custo virgem — C-1; o helper nasce no T2 — I-1; os
  clientes sem endereço — I-2; esperar as gravações que terminam depois da resposta — M-2; sem o upload de 41 MB — M-5); (2) T1 e T2 num commit
  só (o teste é a prova do portão; o T1 aplicado por script com âncoras contadas — `scratchpad/e152/t1.js`); (3) o T3 por script
  (`scratchpad/e152/t3.js`), em série depois do T1; (4) a Fase 5 acrescentou um preload novo (`despejaCamadasDoExpress.js`) e uma linha no
  `portaoDasPropostas.js` (a função leva os módulos) — fora do plano, pedido pelo r3.
- [x] **T1 — `9ddd5dfe`**; [x] **T2 — `9ddd5dfe`** (e as asserções da Fase 5 em `cc70ee9e`); [x] **T3 — `0bf06b57`**.
- **Controles K1–K9 (T1/T2, `scratchpad/e152/sabota.js`, sob a trava, restauro por cópia do pós-T1, md5 conferido):** K1 o multer antes do
  portão (caiu no fonte e em "o comprovante do barrado chegou ao disco"); K2 o resumo de volta para depois do `/:id` (o fonte — "um GET de um
  segmento registrado depois do /:id" —, o fluxo, a tabela, o desligado); K3 sem portão no `DELETE` do comprovante e K4 na análise (o fonte, o
  barrado, a integração); K5 um registro com outra caixa (a régua sem caixa); K6 um caminho montado e K9 num identificador (a régua de todo o
  servidor); K7 o aviso sem a frase; K8 a régua antiga na lista (o fonte, o barrado, a tabela, o desligado).
- **Controles K10–K18 (T3, `scratchpad/e152/sabota3.js`):** verde 148 **8/0**, 149 **9/0**, 150 **10/0**; K10 família com outra caixa e K13
  contrato com outra caixa (a régua sem caixa); K12 a OS com o caminho num identificador (o helper); K14 produto num arquivo com ponto e K15
  família num `.cjs` (a varredura nova); K11 e K16 (montados dentro do `index.js`) caíram pela régua antiga, por linha — K17 (produto montado
  num router fora do `index.js`) e K18 (família montada num template fora dele) provam o que só a nova vê.
- **Suíte antes de `9ddd5dfe`/`0bf06b57`:** `test:api` **474/474**; `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite`
  **4/0, 3/0, 16/0**; revisão obrigatória da proposta **23/23** + as rotas (21/0, 11/0, 11/0, 8/0, 26/0, 15/0, 7/0, 8/0) + os portões 148–152
  (8/0, 9/0, 10/0, 7/0, 6/0) + editor **39/39**; client **143** suítes / **1856** testes; `CI=true build` *Compiled successfully*.
- **A100** rodada no banco local (cópia de 09/10): os **4** de sempre (15, 8, 7, 12), zero nas três colunas; controle numa cópia com uma viagem
  lançada pelo 8, outra aprovada pelo 12 e o Comercial dado ao 15: o 15 saiu, o 8 com 1 lançada, o 12 com 1 aprovada (`scratchpad/e152/a100run.js`).

## Fase 5 — três revisores frescos em paralelo, sob a trava

- **Regra (r1): 0 achados.** Cada chamada do client traçada até o portão de tela; o fluxo inteiro da tela (32 gestos, com o paralelismo
  real — a abertura, o formulário, as seis coordenadas da prévia, um anexo de 25 MB) com **13** usuários que a tela admite, ligado e
  desligado: **416** gestos, 0×403, 0×503, **0** diferenças de corpo ou status; os 2 barrados, 31×403 em 32 (o 32º é a lista de clientes, aberta
  desde a 151) — o controle positivo da comparação. O resumo num banco vazio: 0 e R$ 0,00, sem quebrar o render. Informativos: o cache de
  permissões da tela (5 minutos, de sempre); o resumo soma tudo e ignora os filtros (registrado na **B987**).
- **Autorização (r2): 0 achados.** **43** perfis × 19 rotas contra a decisão da tela — **0** divergências (19/19 ou 0/19 em cada); os **24**
  barrados não gravaram nada (banco e disco iguais; controle: os 19 autorizados mudaram os dois); rebaixado, des-super, desativado e apagado com
  token válido barrados no pedido seguinte; **38** variações de caminho (caixa, barra final, `%2F`, `/./`, `.json`, `;x`, `%20`, `..%2F`, HEAD,
  PATCH, OPTIONS) — nada chega a um handler sem o portão. Informativo (de antes): `/api/custos-viagens/69.0` acha o custo 69 (o SQLite converte).
- **Sabotagem (r3, worktree própria `CRM-wt-e152-r3`, removida): 33 sabotagens válidas — 7 caíram, 26 sobreviveram; 4 inválidas refeitas.**
  **A1** oito formas de registro que a régua do fonte (texto) não lê — receptor apelidado com caminho em regex, `app[verbo]`, `app.get.call`, o
  verbo `search`, arquivo em `tests/`, sem extensão ou `.JS`, caminho com padrão (`custos-viagen(s)`) — S05–S12, e o mesmo nas 148–150
  (S28–S30); **A2** o resumo só prendia dois dos quatro cartões (S13, S14); **A3** o desligado só conferia o status (S15, S16); **A4** o portão
  que abrisse com o filtro da tela (S01); **A5** o helper sem controle positivo próprio (S20–S27, S32b); **A6** o `app.param` antes do login.
- **Correções da Fase 5 (`cc70ee9e`):** o preload `tests/helpers/despejaCamadasDoExpress.js` (simula o despacho do Express 4 depois do `listen` e
  despeja as camadas) e o cenário novo "as camadas do Express montado" (só as 19 atendem `/api/custos-viagens*` em qualquer verbo; login e
  portão do Comercial na frente de cada uma; nenhum middleware só do prefixo; nenhum `app.param`) — A1/A6; o portão leva os módulos na função
  (`modulosDoPortao`, `services/portaoDasPropostas.js` — não muda a decisão); o cenário do helper sobre fontes sintéticas (com raiz própria) e a
  varredura que prova as subpastas — A5; os quatro cartões contra o banco — A2; o conteúdo das leituras e a aprovação gravada no desligado —
  A3; o barrado com a query da tela e sem ela — A4. O teste passa a ter **8** cenários.
- **Controles da Fase 5, rodados por mim com o harness do r3 (`scratchpad/e152/r3/sab.js`, sobre a worktree dele com as correções):** as 22
  sobreviventes que a etapa cobre — **S01, S05–S16, S20–S27, S32b** — caem todas, cada uma pela asserção nova (S05–S12 pelas camadas; S13/S14
  pelo fluxo do vendedor; S15/S16 pelo desligado; S01 pelo barrado; S20–S22, S27, S32b pelo cenário do helper; S23/S25 pela varredura das
  subpastas). **S24** (a caixa do montado) e **S26** (o registro depois dos 4 KB) sobreviveram à primeira versão do cenário do helper — dois
  casos sintéticos a mais. **E a primeira rodada deles caiu pela asserção errada:** o caso novo da caixa também é acusado pela varredura "fora do
  index.js" (corretamente), e a lista esperada não o tinha — o cenário falhava com ou sem sabotagem (a suíte inteira o mostrou: 473/474).
  Corrigida a lista, o cenário ficou verde e os dois caíram pela asserção certa (S24 pela lista dos montados, S26 pela dos de fora). **Declarados, não cobertos:** S28–S30 (os testes das 148–150 não leem as camadas — a próxima tarefa).
- **Suíte antes de `cc70ee9e`:** `test:api` **473/474** na primeira rodada — o arquivo que caiu era o próprio `custosViagensPortao` (a lista esperada do cenário do helper,
acima) — e **474/474** depois da correção; `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; revisão
obrigatória da proposta **23/23** + as rotas (21/0, 11/0, 11/0, 8/0, 26/0, 15/0, 7/0, 8/0) + os portões 148–151 (8/0, 9/0, 10/0, 7/0) +
editor **39/39**; client **143** suítes / **1856** testes; `CI=true build` *Compiled successfully*; o `custosViagensPortao` sozinho **8/0**.
É também a verificação do fechamento (depois dela só mudaram documentos).

## Retro (4 números)

1. **Rodadas de correção até verde:** **3** — o motivo em maiúsculas (antes do primeiro commit), a Fase 5 (as asserções do r3) e a lista
   esperada do cenário do helper (o controle de S24/S26 que caía pela asserção errada — leia QUAL asserção caiu). Testes antigos mudados: **3** (as 148/149/150, de propósito — o T3).
2. **Achados da revisão:** Fase 2 — **1 Critical + 2 Important + 6 Minor, todos reais** (o Critical e três Minor viraram C de antes:
   C359–C361). Fase 5 — r1 **0**; r2 **0**; r3 **26** sobreviventes reais (6 famílias A1–A6) + 4 inválidas (dele, refeitas); **0** ruído.
   **O que mais pesou:** a régua do fonte, por mais que cresça, é texto — a prova que fecha a família é ler o Express montado.
3. **Paralelismo:** **0** galhos em paralelo de fato (o T3 em série depois do T1, Fase 2 da 151 I-1); **0** retrabalho; **1** revisor na Fase
   2, **3** em paralelo na Fase 5 sob a trava (o r3 numa worktree própria, removida).
4. **Defeito que escapou:** *(preencher na Etapa 153)*.

## Próxima tarefa detalhada — Etapa 153

*(A série desta etapa foi B986–B990, C356–C361, A100 — a 153 começa em **B991**, **C362**, **A101**; confira com `grep -oE` antes.)*

**Escolhida: os painéis e relatórios que mostram dado do Comercial a qualquer logado (C355, e a C352 da busca global junto).** No
`index.js`, só com `authenticateToken`: `GET /api/dashboard`, `/api/dashboard/historico`, `/api/dashboard/avancado`, `/api/dashboard/vendas`,
`GET /api/relatorios/executivo`, `GET /api/relatorios/visitas-tecnicas`, `GET /api/mapa/maquinas-vendidas` e `GET /api/busca-global` (lida com
`grep -nE "^app\.(get|post|put|patch|delete)\('/api/(dashboard|relatorios|mapa|busca-global)[^']*', authenticateToken, (async )?\(req" index.js`).
**ATENÇÃO — leitura de muitos módulos:** o `Financeiro.js`, o `DashboardOperacional`, o MES e o Almoxarifado aparecem num grep por
`/dashboard` e `/relatorios` — **meça** chamador por chamador (o `/dashboard` do Comercial pode ser o mesmo que outra tela lê). A regra do
usuário: não trancar fora quem usa hoje; se a leitura for de muitos módulos, a régua é "algum dos módulos que a leem" (ou filtrar o
conteúdo por módulo, como a C352 pede para a busca), não só o Comercial. A busca global (C352/C355) filtra cada tipo de resultado pelo
módulo dele — o que mudar na tela do topo para quem tem só um módulo é perceptível: registre em B. O `/api/workflows*` (4), `/api/reports`
(2) e `/api/auditoria/*` (2) também só pedem o login — meça e decida se entram ou viram C.
**Pontos de atenção:** (1) os testes de portão das 145–151 ainda **não** leem as camadas do Express (S28–S30 do r3 da 152) — leve o preload
`tests/helpers/despejaCamadasDoExpress.js` para eles (um cenário por teste, as amostras dos prefixos de cada etapa; o `portaoDasPropostas`
já leva `modulosDoPortao`); (2) o molde é o `custosViagensPortao` (8 cenários: o fonte, as camadas, o helper sintético, o barrado com e sem a
query da tela, o fluxo inteiro com o conteúdo conferido contra o banco, a tabela por usuário, o desligado com o conteúdo, o BUSY); (3) uma
consulta **A101** no molde da A100 se houver gente que perde.

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 151 (que inclui as das 145 a 150 e a **C330**) — **B853**/**C279**,
**B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela
de conversões e o grupo acima de família, a régua do tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**,
**C117**/**C118**, **C139**, **C278**; na 05, os itens de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por
cliente e previsto × realizado; na 22, **B13**, **B101**/G30, **G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62; nas
propostas, a verificação do dono da proposta (Fase 12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a
Frente B da lentidão, a **C297** (**B924**), a **B926**, a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**; no
Operacional, a **C332**; do Comercial, a **C354**. Pendem de Postgres: **C98**, **C110**. Do Compras: a **C348**. **Novos nesta etapa, do
P.O.:** a **C357**/**B988** (quem aprova reembolso de viagem), a **C359**/**B989** (apagar o custo editado — e a **C360**, o comprovante no
disco, junto), a **C358** (a aba antiga de Permissões: tirar ou trocar a lista). *(A **C361** — um prazo na geocodificação — é candidata
técnica, não do P.O.; as decisões B986 e B987 são reversíveis e estão na letra B.)*

**O que já está pronto e não precisa reabrir:** o portão nas 19 dos custos de viagem; o resumo antes do `/:id`; o teste
`custosViagensPortao` (8); o helper `reguaDoFonteDoServidor` (com raiz própria) nos testes das 148–152; o preload
`despejaCamadasDoExpress`; o `modulosDoPortao` no portão. Candidatas menores para encaixar se sobrar: **C351** (o `encodeURIComponent` nas
três telas da OS), **C353** (a régua dos três módulos nas listas de clientes e projetos) e a **C361**.
