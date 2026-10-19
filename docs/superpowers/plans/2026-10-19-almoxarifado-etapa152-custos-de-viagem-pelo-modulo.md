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

()=>n — montado **só** em `/comercial/custos-viagens` (`App.js`, dentro
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
()=>n
()=>n
| aviso do boot (desligado) | — | — | troca *"…das atividades NAO exigem o Comercial (só o login); a lista de ordens…"* por *"…das atividades NAO exigem o Comercial (só o login), e as dos custos de viagem NAO exigem o Comercial (só o login); a lista de ordens…"* |

As respostas de sucesso das outras 18 não mudam (corpo e status). As frases de validação de sempre (*"Data de viagem é obrigatória"*,
*"Destino é obrigatório"*, *"Viagem não encontrada"*, *"Nenhum arquivo enviado"*, *"Comprovante não encontrado"*, *"Cliente não encontrado"*,
*"Custo de viagem não encontrado"*) só aparecem a quem passa o portão.

## Tasks (sort topológico)

- [ ] **T1 — tronco — o portão nas 19, a ordem do resumo e o aviso do boot (RN-152.01–03).** `index.js`: o portão como 2º middleware nas 19
  (antes do multer no comprovante); o bloco do `GET /api/custos-viagens/resumo` movido para logo antes do `GET /api/custos-viagens/:id`
  (o comentário diz por quê); a frase nova no aviso (só acrescenta). Aplicado por script com âncoras contadas (`scratchpad/e152/t1.js`).
- [ ] **T2 — `tests/api/custosViagensPortao.api.test.js`, escrito ANTES do T1 (vermelho medido), pelo `index.js` real (pasta vazia), molde
  do `clientesProjetosPortao`:**
  - **pelo fonte:** as 19 com o portão como 2º middleware (o comprovante: o multer depois), cada uma registrada uma vez — régua no texto
    inteiro, sem caixa (`/\.(get|post|...|route)\(\s*\[?\s*["'`](\/(?:api\/)?custos-viagens...)/gi`); o resumo antes do `/:id`; nenhum
    registro fora do `index.js` (varredura com dotfiles e `.cjs`/`.mjs`); nenhum `app.use` no prefixo; a régua de todo o servidor (o helper do
()=>n cujo caminho não seja texto literal fora dos 6 medidos; nenhum caminho montado cujo 1º segmento não
    fique fixo fora de `custos-viagens`);
  - **o barrado** (só o Almoxarifado) toma 403 em **cada uma** das 19 e nada muda (retrato de `custos_viagens`, `custos_viagens_anexos`,
    `custos_viagens_historico`, `viagem_clientes`, `logs_autorizacao_viagens`, a pasta `uploads`; o log conta 19 `comercial`); o comprovante
    multipart do barrado não chega ao disco; **a metade positiva:** o mesmo barrado lê `GET /api/clientes` (a lista aberta da 151) — 200;
  - **as metades positivas, pela rota, em fluxo (o vendedor só com o Comercial):** escolhe o cliente na lista (`GET /api/clientes`), confere a
    elegibilidade, os clientes próximos, as coordenadas, calcula a rota → lança (com `clientes_viagem` e `autorizado_sem_regras` + motivo) →
    lista (com filtros `cliente_id`, `status_aprovacao`, `codigo_visita`) → lê por id → edita (o histórico grava) → lê o histórico e os logs de
    autorização → anexa um comprovante (chega ao disco) → lista → baixa (o mesmo conteúdo) → apaga o comprovante (sai do disco) → duplica →
()=>n
  - **a tabela por usuário** (14 perfis, os da 151) com a decisão da tela calculada pelo `temModuloComoATela` e as linhas lidas do
    `GET /api/usuarios/:id/grupos`: uma leitura (`GET /`), o resumo, um `GET /:id`, um `PUT /:id` e o `aprovar` por perfil;
()=>n o `PUT` que grava e o comprovante que chega ao disco; o aviso do boot cita os custos de viagem; ligado de novo, barra;
    o resumo 200 nos dois;
  - **o BUSY/500:** 503 numa leitura e numa escrita, 500 no `PUT`, no `aprovar` e no `DELETE`; o administrador passa sem ler; nada grava.
- [ ] **T3 — galho (em série depois do T1: a sabotagem dele mexe no `index.js` — o I-1 da 151) — a régua de todo o servidor nos testes das
()=>n (`registrosNaoLiterais({ prefixos })`, `REGISTROS_NAO_LITERAIS_MEDIDOS`,
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
()=>n

## Avisos novos (C)

- **C356** — o resumo da tela de custos de viagem nunca respondia (404 pelo `/:id`): os quatro cartões do topo não apareciam. De antes;
  **consertado nesta etapa** (B987).
- **C357** — o `aprovar` do custo de viagem não tem régua própria: quem tem o Comercial aprova ou rejeita qualquer lançamento, inclusive o
  seu. De antes; do P.O.
- **C358** — a aba *Permissões* de **Administração** oferece um módulo *Custos de Viagens* (e *Clientes*, *Projetos*, *Atividades*…) que
  nenhum portão lê: marcar só ele não abre nada. De antes; candidata (remover ou mapear para o Comercial — é decisão de produto, P.O.).

()=>n