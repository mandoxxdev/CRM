# Etapa 151 (Comercial): clientes, projetos, oportunidades e atividades exigem o Comercial na escrita e na leitura que só ele faz (C349) — plano

> Origem: "Próxima tarefa detalhada — Etapa 151" do plano da 150
> (`docs/superpowers/plans/2026-10-18-almoxarifado-etapa150-grupos-produtos-e-variaveis-pelo-modulo.md`). A etapa é pequena; o design, com a
> Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-19): última B **B982**, último C **C352**,
> última A **A98**. Esta etapa: **B983+**, **C353+**, **A99+**. Worktree `CRM-wt-e151`, branch `etapa-e151` (da main `f5dddae1`).
>
> **Trava de máquina:** `scratchpad/e151-lock.sh` (o diretório `maquina-testes.lock` de sempre). Um arquivo de teste de servidor por vez,
> inclusive os revisores. A etapa **não** toca o template nem o client; toca o `index.js` (o portão em 18 rotas e o aviso do boot) e os
> testes das 148/149 (a régua do fonte).
>
> **Fase 2 (um revisor fresco, só leitura): 0 Critical, 1 Important, 6 Minor — todos aceitos antes do código.** A medição refeita (literal,
> template, `fetch`/`axios`, URL em variável, serviços, hooks, componentes embutidos, servidor por HTTP e puppeteer) **confirmou** a Fase 0:
> fora do Comercial só as duas listas são lidas. **I-1** o controle positivo do T3 sabota o `index.js` que o T1 edita — o T3 roda **depois**
> do T1, em série, sob a trava, com restauro por cópia do pós-T1 conferida por md5 (nunca durante o T1). **M-1** a frase nova do aviso do boot
> congelada no contrato (abaixo). **M-2** o logo inválido do barrado toma 403 (o portão vem antes do filtro de imagem) — linha nova no contrato.
> **M-3** *"Nome do projeto é obrigatório"* vale só no `POST` (o `PUT` sem nome grava NULL — de antes, sem mudança). **M-4** o T2 não cria a
> OS pelo Operacional: o `POST` da OS responde 500 a quem não é administrador num banco novo (**C277**, de antes) — a OS nasce pelo
> administrador e o Operacional a **edita** com o cliente e o projeto escolhidos nas listas (o `PUT` do `OSForm`); o botão *Nova OS* do
> Operacional fica sem prova pela C277. **M-5** o desligado roda o laço das 18 inteiro (não só os `GET` e algumas escritas). **M-6** a
> coluna "tela" da tabela por usuário vem do `temModuloComoATela` do servidor; a amarração com o client é a fixture
> `portaoComoATela.casos.json` (RN-145.04) — o `esperado` está escrito à mão, então não é teste vazio.

## Fase 0 — medido (antes de qualquer código)

### As rotas (lidas no `index.js`; nenhuma fora dele — `routes/`, `services/` não registram estes caminhos)

**20 registros, todos só com `authenticateToken`** (a contagem da 150 bate):

- **Clientes — 7:** `GET /api/clientes`, `GET /api/clientes/logos` (registrada antes de `/:id`), `GET /api/clientes/:id`, `POST /api/clientes`,
  `PUT /api/clientes/:id`, `POST /api/clientes/:id/logo` (multer `uploadClienteLogo`), `DELETE /api/clientes/:id` (desativa).
- **Projetos — 5:** `GET /api/projetos`, `GET /api/projetos/:id`, `POST`, `PUT /:id`, `DELETE /:id` (desativa).
- **Oportunidades — 4:** `GET /api/oportunidades`, `POST`, `PUT /:id`, `DELETE /:id`. **Não existe** `GET /api/oportunidades/:id` (o
  `OportunidadeForm` o chama — código morto, abaixo).
- **Atividades — 4:** `GET /api/atividades` (com `todos=1` devolve também os lembretes de **todas** as propostas: número, título, cliente),
  `POST`, `PUT /:id`, `DELETE /:id` (apaga de verdade).

O `GET /api` (raiz, sem login) só **cita** `/api/clientes` e `/api/projetos` num objeto — não é registro. O `chatSocketInativoNoServidor`
recorta o fonte entre `app.delete('/api/usuarios/:id'` e `app.get('/api/clientes'` — a linha do `GET /api/clientes` não pode mudar de forma
(ela não muda: a lista fica só com o login, B983).

### Quem chama (client inteiro, `client/src` — `.js` só, não há `.jsx`/`.ts`; servidor)

| Rota | Telas que chamam | Onde estão montadas (portão da tela) |
|---|---|---|
| **`GET /clientes`** | `Clientes`, `Atividades`, `CustosViagens`, `OportunidadeForm`*, `ProjetoForm`, `proposta/PropostaForm` (Comercial); **`almoxarifado/MaterialAlmoxarifadoForm`** (seção Propriedade), **`almoxarifado/ReservasAlmoxarifado`**; **`operacional/OSForm`** (aberto pelo `OrdensServico`) | `/comercial/*` (Comercial); **`/almoxarifado/materiais/novo` e `/editar/:id`, `/almoxarifado/reservas` (Almoxarifado)**; **`/fabrica/ordens-servico` (Operacional)** |
| `GET /clientes/logos` | `Dashboard` (índice do Comercial), `MaquinasVendidas` | `/comercial`, `/comercial/maquinas-vendidas` |
| `GET /clientes/:id` | `ClienteForm` | `/comercial/clientes/editar/:id` |
| `POST`/`PUT /clientes`, `POST /:id/logo` | `ClienteForm` | `/comercial/clientes/novo` e `/editar/:id` |
| `DELETE /clientes/:id` | `Clientes` | `/comercial/clientes` |
| **`GET /projetos`** | `Projetos`, `OSComercialForm` (Comercial); **`almoxarifado/MovimentacoesAlmoxarifado`**, **`ReservasAlmoxarifado`**, **`SobrasAlmoxarifado`**; **`operacional/OSForm`** | `/comercial/*`; **`/almoxarifado/movimentacoes`, `/reservas`, `/sobras`**; **`/fabrica/ordens-servico`** |
| `GET /projetos/:id`, `POST`, `PUT /:id` | `ProjetoForm` | `/comercial/projetos/novo` e `/editar/:id` |
| `DELETE /projetos/:id` | **ninguém** (o `Projetos` não apaga) | — |
| `GET /oportunidades` | `proposta/PropostasList`, `proposta/PropostaForm` (`?status=ativa`) | `/comercial/propostas`, `/nova`, `/editar/:id` |
| `POST`/`PUT`/`DELETE /oportunidades` | **ninguém vivo** (só o `OportunidadeForm`/`Oportunidades`, mortos) | — |
| `GET`/`POST`/`PUT`/`DELETE /atividades` | `Atividades` (todas); `CustosViagens` (`GET`) | `/comercial/atividades`, `/comercial/custos-viagens` |

- **Fora do Comercial, só as duas listas** (`GET /api/clientes` e `GET /api/projetos`) são lidas — pelo Almoxarifado (4 telas) e pela OS do
  Operacional. Nenhuma tela de fora do Comercial chama as outras 18. **Compras, Financeiro, Engenharia / Projetos, o resto da Fábrica (MES,
  apontamentos, `AtividadesColaboradores` — chama `/operacional/atividades-colaboradores`, outra rota), Configurações e a busca global não
  chamam nenhuma das 20** (grep no `client/src` inteiro por literal `'/clientes'`, `` `/clientes/ ``, idem para os outros três, e por
  endpoint montado com `` `/${` ``: nada). A **busca global** (`GET /api/busca-global`) lê a tabela `clientes` direto no banco — não muda
  (C352, de antes). O `MateriaisClienteAlmoxarifado` chama `/almoxarifado/materiais-cliente/clientes` (outra rota, do módulo).
- **Código morto:** `Oportunidades` e `OportunidadeForm` (ninguém importa; não há rota `/comercial/oportunidades` no `App.js`),
  `components/PropostaForm.js` e o `PreviewPropostaEditavel` que só ele importa, `proposta/GerarPropostaModal` (ninguém importa). O
  `HelpGuide` só tem texto e seletores `[href="/clientes"]` — não chama a API. O app antigo da raiz (`src/`) e o `backend/` ficam fora do deploy
  (o `Dockerfile` só copia `client/` e `server/`).
- **Servidor:** nenhum serviço, template ou rota busca estas rotas por HTTP (grep no `server/` fora de `tests/`); o PDF da proposta e o da OS
  leem `clientes` direto no banco. O logo sai pelo estático `/api/uploads/logos`, fora de portão.
- **Os perfis do Almoxarifado** (`services/almoxarifado/permissions.js`) não entram: é acesso a módulo, não ação.

### Banco local (cópia de 09/10 do `CRM/server/data`, lida numa cópia no scratchpad — `scratchpad/e151/medir.js`)

**10** usuários ativos, **4** super/admin (2, 5, 13, 14), **0** grupos de permissão, **0** `admin_modulos`. Com o Comercial: 3, 9 (e os
super). Sem o Comercial: **7** (Compras + Almoxarifado), **8** (Engenharia / Projetos), **12** (Almoxarifado), **15** (Almoxarifado +
Compras) — os mesmos 4 da A93–A98. **53** clientes (45 com logo), **0** projetos, **0** oportunidades, **2** atividades. Com o desenho
abaixo: o 7, o 12 e o 15 continuam lendo as duas listas (as telas do Almoxarifado); **nenhum** dos quatro perde uma tela — a tela já os barra
do Comercial.

## Decisão de desenho (vai para a letra B)

**Separar leitura de escrita, e fechar a leitura só onde a medição provou que ninguém de fora do Comercial lê.**

- **As 13 escritas** (cliente criar/editar/logo/apagar, projeto, oportunidade e atividade criar/editar/apagar) → o Comercial pela régua da tela
  (`exigirComercialNasPropostas`, o mesmo portão da 145–150).
- **As 5 leituras que só o Comercial faz** (`GET /api/clientes/logos`, `GET /api/clientes/:id`, `GET /api/projetos/:id`, `GET /api/oportunidades`,
  `GET /api/atividades`) → o mesmo portão.
- **As 2 listas** (`GET /api/clientes`, `GET /api/projetos`) → **continuam só com o login** (o Almoxarifado e a OS da Fábrica as leem; um
  leitor que a varredura não viu trancaria alguém fora). Vira o aviso **C353** e a candidata da próxima.

## Regras de negócio

- **RN-151.01 — as 13 escritas exigem o Comercial pela régua da tela (C349).** O `exigirComercialNasPropostas` logo depois do
  `authenticateToken` (antes do multer no logo — o arquivo do barrado não chega ao disco). Recusa: **403** `{ "error": "Acesso negado ao
  módulo", "modulo": "comercial" }` e a linha `acesso_negado` no log (`modulo = 'comercial'`). `SQLITE_BUSY` ao ler as linhas → **503**
  (`context: 'portao:propostas'`); outro erro → **500** *"Erro ao verificar permissões"*. Nada é gravado (nem o arquivo do logo).
- **RN-151.02 — as 5 leituras que só o Comercial faz exigem o Comercial.** Mesmo portão, recusa e erros da RN-151.01.
- **RN-151.03 — as duas listas continuam só com o login.** `GET /api/clientes` e `GET /api/projetos` respondem a qualquer logado (o
  Almoxarifado nas telas de material, reservas, movimentações e sobras; o Operacional na OS da Fábrica; e, sem tela, quem só tem outro módulo).
- **RN-151.04 — o mesmo interruptor.** `PROPOSTAS_PORTAO_DE_MODULO=desligado` (B946): as 18 voltam a pedir só o login. O aviso do boot cita os
  clientes, os projetos, as oportunidades e as atividades, mantendo as frases que os testes da 147–150 prendem.

## Contratos de API (congelados)

| Rota | Caso | Status | Corpo / mensagem literal |
|---|---|---|---|
| as 18 (13 escritas + 5 leituras) | sem o Comercial pela régua da tela | 403 | `{ "error": "Acesso negado ao módulo", "modulo": "comercial" }` |
| as 18 | `SQLITE_BUSY` ao ler as permissões | 503 | `{ "error": "Banco temporariamente ocupado. Tente novamente em alguns segundos.", "code": "SQLITE_BUSY", "retryAfter": 3, "context": "portao:propostas" }` |
| as 18 | outro erro ao ler as permissões | 500 | `{ "error": "Erro ao verificar permissões" }` |
| as 18 | `PROPOSTAS_PORTAO_DE_MODULO=desligado` | — | como antes da etapa (só o login) |
| `GET /api/clientes`, `GET /api/projetos` | qualquer logado | 200 | sem mudança |
| `POST /api/clientes/:id/logo` | barrado com arquivo que não é imagem ou maior que 5 MB | 403 | o do portão (antes: a frase do filtro de imagem) — Fase 2 M-2 |
| aviso do boot (desligado) | — | — | acrescenta *"…, e as dos clientes, dos projetos, das oportunidades e das atividades NAO exigem o Comercial (só o login); …"* (Fase 2 M-1) |

As respostas de sucesso não mudam (corpo e status). As frases de validação de sempre (*"Razão social é obrigatória"*, *"Nome do projeto é
obrigatório"* (só no `POST`; Fase 2 M-3), *"Título é obrigatório"*, *"Nenhum arquivo enviado"*, *"Cliente não encontrado"*, *"Projeto não encontrado"*) só aparecem a quem
passa o portão.

## Tasks (sort topológico)

- [x] **T1 — `49fdb035` — tronco — o portão nas 18 e o aviso do boot (RN-151.01–04).** `index.js`: o portão como 2º middleware nas 18 (antes do multer no
  logo); as duas listas intactas; a frase nova no aviso (só acrescenta).
- [x] **T2 — `49fdb035` + Fase 5 `615f6a2b` (escrito antes do T1, vermelho medido) — `tests/api/clientesProjetosPortao.api.test.js`, pelo `index.js` real (pasta vazia), molde
  do `produtosGruposVariaveisPortao`:** pelo fonte (as 18 com o portão como 2º middleware, as 2 listas exatamente `authenticateToken, (req,
  res) => {`, cada uma registrada uma vez — régua no texto inteiro, nenhum caminho montado, nenhum registro fora do `index.js`, nenhum
  `app.use` nos prefixos); o barrado (só o Almoxarifado) toma 403 em **cada uma** das 18 e nada muda (retrato de `clientes`, `projetos`,
  `oportunidades`, `atividades`, a pasta `uploads`; o log conta 18 `comercial`) — **e lê as duas listas (200)**; o logo multipart do barrado não
  chega ao disco; a tabela por usuário com a decisão da tela calculada pelo `temModuloComoATela`; **as metades positivas, pela rota, em
  fluxo:** o Comercial faz o cliente (criar → logo → editar → ler → logos → lista), o projeto (criar → ler → editar → lista → apagar), a
  oportunidade (criar → lista → editar → apagar) e a atividade (criar → lista → editar → apagar), e apaga o cliente; **o cruzamento
  (integração):** o cliente e o projeto criados pelo Comercial aparecem nas listas para quem só tem o Almoxarifado e para quem só tem o
  Operacional, e o Operacional edita a OS com eles (a OS nasce pelo administrador — C277; `PUT /api/operacional/ordens-servico/:id` com `cliente_id`/`projeto_id` escolhidos nas listas → `GET` da OS; Fase 2 M-4) — e o
  mesmo toma 403 no cliente por id, nos logos e nas escritas; ninguém que passa vira "acesso negado" no log; o desligado (as 18 abrem ao
  barrado, inclusive um `DELETE` que apaga de verdade; ligado de novo barra); o BUSY/500.
- [x] **T3 — `fa87c828` — galho (rodou em série depois do T1 — Fase 2 I-1) — a régua do fonte das 148 e 149 no texto inteiro** (retro da 150): `osModeloContratoPortao` e `familiasListaOsPortao`
  ganham a contagem de **todos** os registros no texto inteiro (o `\s` atravessa a quebra de linha; um segundo registro na mesma linha, um
  registro em duas linhas ou um caminho em lista aparecem) e a recusa de caminho montado. Controle positivo: um segundo registro na mesma linha
  de um já existente, e um registro quebrado em duas linhas, têm de derrubar a asserção nova (a antiga não os via).

**Tabela por usuário (T2)** — colunas: as 18 / as 2 listas:

| Usuário | As 18 | As listas |
|---|---|---|
| sem nada (sem linha) | 200 | 200 |
| direta do Comercial | 200 | 200 |
| grupo ativo com o Comercial | 200 | 200 |
| grupo ativo sem linha | 200 | 200 |
| super / role admin (com só a direta do Almoxarifado) | 200 | 200 |
| Comercial só num grupo inativo (+ direta do Almoxarifado) | 403 | 200 |
| Comercial com permissão 0 | 403 | 200 |
| Comercial com `grupo_id = 0` (+ direta do Almoxarifado) | 403 | 200 |
| só a direta do Almoxarifado | 403 | 200 |
| só a direta do Operacional | 403 | 200 |
| só a direta de Engenharia / Projetos | 403 | 200 |
| administrador do módulo Comercial + direta do Administrativo | 403 | 200 |
| grupo ativo só com o Almoxarifado (a régua antiga também barra — Fase 5 S23) | 403 | 200 |

## Decisões (vão para a letra B)

- **B983** — as 13 escritas e as 5 leituras que só o Comercial faz pelo Comercial pela régua da tela; as 2 listas só com o login. Descartado:
  (a) a lista com uma régua dos três módulos que a leem (Comercial **ou** Almoxarifado **ou** Operacional) — no banco medido não tiraria nada
  de ninguém (o 8 não tem tela que as leia), mas uma tela que a varredura não viu trancaria alguém fora sem aviso; a lista de clientes tem
  CNPJ, telefone e e-mail — fica a **C353**; (b) proteger **só** a escrita — a medição provou que as 5 leituras só o Comercial faz, e o
  `GET /api/atividades?todos=1` devolve os lembretes de todas as propostas a qualquer logado; (c) a régua antiga (`checkModulePermission`,
  libera o Comercial a todo usuário sem grupo — no banco medido não mudaria nada).
- **B984** — as escritas sem chamador vivo (`DELETE /api/projetos/:id`, `POST`/`PUT`/`DELETE /api/oportunidades`) com o portão, não apagadas.
  Descartado: apagar as rotas (não medido em produção; quem configura por fora perderia sem aviso); deixá-las só com o login (quem a tela barra
  apagaria pela API).
- **B985** — a próxima etapa (152).

## Avisos novos (C)

- **C353** — `GET /api/clientes` e `GET /api/projetos` respondem a qualquer logado (B983): quem só tem Compras, Financeiro ou Engenharia lê a
  lista de clientes com CNPJ, telefone e e-mail pela API. Candidata: a régua dos três módulos que a leem.
- **C354** — o `OportunidadeForm` (morto) chama `GET /api/oportunidades/:id`, que não existe — se a tela de oportunidades voltar ao menu, a
  edição abre vazia (404). De antes.

## Execução

- **Linha de base** (a árvore da main `f5dddae1`, antes de qualquer código): `test:api` **472/472**.
- **TDD, vermelho medido:** `clientesProjetosPortao` contra o `index.js` da main **1 passed, 6 failed** (o barrado tomava **200** nas 18 — o
  cliente criado, editado e apagado —, o Operacional lia o cliente por id, a tabela por usuário inteira em 200, o aviso do boot não citava as
  rotas, o BUSY respondia 200 e gravava; o verde era o fluxo do Comercial, que vale antes e depois). Com o T1: **7/0**.
- **Divergências do plano:** (1) as RN e os contratos ajustados pela Fase 2 antes do código (acima); (2) T1 e T2 num commit só (o teste é a
  prova do portão; o T1 aplicado por script com âncoras contadas — `scratchpad/e151/t1.js`); (3) a integração **edita** a OS pelo Operacional
  em vez de criá-la (Fase 2 M-4, C277); (4) o T3 rodou **depois** do T1, em série (Fase 2 I-1).
- [x] **T1 — `49fdb035`**; [x] **T2 — `49fdb035`** (e as asserções da Fase 5 em `615f6a2b`); [x] **T3 — `fa87c828`**.
- **Controles K1–K12 (antes dos commits, `scratchpad/e151/sabota.js`, sob a trava, restauro por cópia do pós-T1, md5 conferido):** K1 a lista
  de clientes com portão (caiu no fonte — "uma lista ganhou middleware" —, no barrado — "lista de clientes: 403" —, na integração, na tabela,
  no desligado e no BUSY); K2 o multer antes do portão ("o logo do barrado chegou ao disco"); K3 o `DELETE` das atividades e K4 o cliente por
  id sem portão (o fonte, o barrado, a tabela); K5 um segundo registro na mesma linha (caiu por "sumiu do fonte" — refeito como **K5b** num
  fecho de bloco: caiu pela régua do texto inteiro); K6 um registro em duas linhas (a régua do texto inteiro); K7 o aviso sem a frase; K8 a
  régua antiga no `PUT`; K9–K12 as 148/149 (abaixo). md5 restaurado em todos.
- **T3:** K10 (segundo registro da OS na mesma linha) e K11 (modelo de contrato em duas linhas) caíram pela asserção nova da 148; K12 (família
  em duas linhas) pela nova da 149; K9 (segundo registro de família na mesma linha) caiu antes por "sumiu do fonte" e **K9b** (num fecho de
  bloco) pela régua **antiga** por linha — a nova foi conferida à parte sobre o fonte sabotado do K9 (a antiga via 23, a nova 24).
- **Suíte antes de `49fdb035`/`fa87c828`** (a árvore com T1–T3): `test:api` **473/473**; `test:almoxarifado` **44/0**;
  `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; revisão obrigatória da proposta **23/23** + as rotas (21/0, 11/0, 11/0, 8/0,
  26/0, 15/0, 7/0, 8/0) + editor **39/39**; client **143** suítes / **1856** testes; `CI=true build` *Compiled successfully*.
- **A99** rodada no banco local (cópia de 09/10): os **4** de sempre (7, 12, 15 com "as listas … continuam, pelas telas do Almoxarifado ou da
  OS da Fábrica"; 8 com "… só pela API"); controle numa cópia com o 8 ganhando o Operacional e o 15 o Comercial: o 15 saiu, o 8 mudou de
  frase.

## Fase 5 — três revisores frescos em paralelo, sob a trava

- **Regra (r1): 0 achados.** Cada chamada do client traçada até o portão de tela; o fluxo inteiro das telas pelo `index.js` real com o portão
  ligado e desligado — **10** usuários × **26** gestos = **260** chamadas por rodada: os 6 que a tela admite, 156/156 em 200 e corpos iguais
  ligado × desligado (só o nome do arquivo do logo difere — o controle positivo da comparação); os 4 barrados, 22×403 e as 2 listas em 200;
  desligado, 0×403; o logo do barrado não chega ao disco.
- **Autorização (r2): 0 achados novos; 1 de antes reproduzido (C325) e 2 informativos.** **30** perfis × 18 rotas (permissão `'1'`/`1.0`/0/2/
  `'true'`/NULL/-1/1.5, `grupo_id` 0 e 999, grupo `ativo` 2/NULL/`'1'`, módulo `'Comercial'`/`'comercial '`, `admin_modulos` malformado, super
  `'1'`/2/`'true'`, role `'ADMIN'`/`'admin '`/vazia; rebaixado, desativado, apagado com token válido) contra a decisão da tela — só a **C325**
  (permissão de grupo gravada com `id = 0`, de antes) diverge; **52** variações de caminho — nada vaza. Informativos: a lista de clientes
  traz as mesmas colunas do cliente pelo número (registrado na **B983** — fechar o "pelo número" não esconde dado enquanto a lista estiver
  aberta); a busca global, o painel e o relatório executivo mostram oportunidades e atividades (**C355**, de antes).
- **Sabotagem (r3, worktree própria `CRM-wt-e151-r3`, removida): 27 sabotagens — 19 caíram, 6 sobreviveram (falta de asserção), 2 inválidas
  refeitas.** **S02/S03** a lista fechada só quando há filtro (`?cliente_id`, `?status`, `?search`) — o teste só lia a lista pura; **S05** rota
  nova com o caminho num identificador, **S24** num router com outro nome e caminho concatenado, **S25** num arquivo que começa com ponto — a
  régua do fonte não os via; **S16** o `PUT` do desligado respondendo 200 sem gravar; e **S23** (caiu só pela régua do fonte) o desligado
  voltando à régua antiga — o barrado do teste não tinha grupo, então a antiga e o só login eram iguais para ele.
- **Correções da Fase 5 (`615f6a2b`), no teste:** as listas com os filtros que as telas mandam, para o Almoxarifado, o Operacional e Engenharia
  (S02/S03); a régua do fonte em todo o servidor: nenhum `app[...]`, nenhum registro de app/router cujo primeiro argumento não seja texto
  literal (fora 6 medidos: 4 middlewares sem caminho, o router dos módulos e um comentário), nenhum caminho montado em **qualquer** receptor
  cujo começo não fixe um segmento fora dos quatro (os routers de frotas e produção montam `/api/frotas/${base}`), a régua do texto inteiro
  sem diferenciar a caixa, a varredura com arquivos com ponto e `.cjs`/`.mjs` (S05/S08/S09/S24/S25); o desligado também para quem a régua
  antiga barra (um grupo ativo sem o Comercial — S23); o gravado do `PUT` de cliente e de projeto no desligado (S16). O teste segue com 7
  cenários.
- **Controles da Fase 5, rodados por mim (`scratchpad/e151/sab4.js`, as definições do r3):** S02 e S03 caíram por "as listas com filtro" e
  "uma lista com filtro barrou"; S05 e S24 por "um registro com o caminho que nao e texto literal"; S25 por "rota registrada fora do
  index.js"; S08 pela régua do texto inteiro (agora sem caixa) e pelo barrado; S16 por "um PUT do desligado respondeu 200 sem gravar"; S23
  pelo fonte e por "galm PUT /api/clientes/:id: 403" no desligado; S06 e S09 de novo pela régua nova e pelo comportamento; S04b
  (`app['post']`) conferido sobre o texto (a regex nova acusa; o `index.js` não tem nenhum). md5 restaurado em todos.
- **Suíte antes de `615f6a2b`** (a árvore com a Fase 5): `test:api` **473/473**; `test:almoxarifado` **44/0**;
  `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; revisão obrigatória da proposta **23/23** + as rotas (21/0, 11/0, 11/0, 8/0,
  26/0, 15/0, 7/0, 8/0) + os portões 149–151 (9/0, 10/0, 7/0) + editor **39/39**; client **143** suítes / **1856** testes; `CI=true build`
  *Compiled successfully*. É também a verificação do fechamento (depois dela só mudaram documentos).

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** — a Fase 5 (as asserções do r3). Antes do primeiro commit, **0** (o T1 por script com âncoras
   contadas ficou verde na primeira; o vermelho de antes era o esperado). Testes antigos mudados: **2** (as 148/149, de propósito — o T3).
2. **Achados da revisão:** Fase 2 — **0 Critical + 1 Important + 6 Minor, todos reais**. Fase 5 — r1 **0**; r2 **0** novos + 1 de antes
   (C325) + 2 informativos reais (B983, C355); r3 **6** sobreviventes reais + 1 fraqueza (S23) + 2 inválidas (dele, refeitas); **0** ruído.
   **O que mais pesou:** a régua do fonte "todo registro" ainda não via o caminho que não é texto literal — o mesmo molde da 150 e das
   148/149 (fica para a próxima que usar o molde: a régua de todo o servidor desta etapa).
3. **Paralelismo:** **0** galhos em paralelo de fato (o T3 sabota o `index.js` do T1 — em série, Fase 2 I-1); **0** retrabalho; **1** revisor
   na Fase 2, **3** em paralelo na Fase 5 sob a trava (o r3 numa worktree própria, removida).
4. **Defeito que escapou:** *(preenchido na Etapa 152)* **0 de código; 0 de documento desta etapa.** A Etapa 152 refez a medição das
   listas de clientes e projetos ao medir os custos de viagem (a tela de custos lê `GET /api/clientes` e `GET /api/atividades` — a lista
   aberta e a leitura que a 151 fechou para o Comercial; o vendedor continua lendo as duas) e nada da 151 mudou. **Herdado, achado na 152:** a
   **A93** (Etapa 145) mandava dar o Comercial pela aba **Administração → Permissões**, que não oferece o Comercial (**C358**) — corrigido. **E
   a fraqueza da régua do fonte era maior do que esta retro dizia:** a régua de todo o servidor desta etapa ainda é texto — o r3 da 152 achou
   oito formas de registro que ela não lê (a 152 passou a ler as camadas do Express montado).

## Próxima tarefa detalhada — Etapa 152

*(A série desta etapa foi B983–B985, C353–C355, A99 — a 152 começa em **B986**, **C356**, **A100**; confira com `grep -oE` antes.)*

**Escolhida: a C350 — os custos de viagem pelo módulo.** No `index.js`, só com `authenticateToken`, **19** registros `/api/custos-viagens*`:
`GET coordenadas-cliente/:cliente_id`, `GET clientes-proximos/:cliente_id`, `GET calcular-rota`, `GET /` (a lista), `GET /:id`,
`GET verificar-elegibilidade/:cliente_id`, `POST /`, `PUT /:id`, `POST /:id/aprovar`, `GET /:id/logs-autorizacao`, `POST /:id/duplicar`,
`POST /:id/comprovante` (multer `uploadComprovante` — o portão antes dele), `GET /:id/comprovantes`, `GET /:id/comprovante/:anexo_id`,
`DELETE /:id/comprovante/:anexo_id`, `GET /:id/historico`, `DELETE /:id`, `GET analise/cliente`, `GET resumo`. Confira a contagem com a régua de
todo o servidor desta etapa (texto inteiro, sem caixa, nenhum caminho que não seja texto literal — `clientesProjetosPortao`, o primeiro teste).
**Pontos de atenção:** (1) **meça** se o `GET /api/custos-viagens/resumo` (registrado **depois** do `GET /:id`) é atendido pelo `/:id` com
`id = 'resumo'` — se for, é um defeito de antes (a tela do resumo não funcionaria): registre como C e não conserte calado; (2) quem chama:
grep achou só o `CustosViagens` (Comercial, `/comercial/custos-viagens`) e o `PreviewRota` — confira se o `PreviewRota` está montado noutro
módulo, e se o Financeiro (que aprova reembolso?) ou o `aprovar` têm tela fora do Comercial; (3) o `aprovar` e os logs de autorização podem
ter uma régua própria no corpo (leia antes); (4) o comprovante é arquivo — o barrado não pode chegar ao disco. **Regra do usuário:** não
trancar fora quem usa hoje — se a medição achar leitor fora do Comercial, separe leitura de escrita como na 151 (B983). Molde de teste:
`clientesProjetosPortao.api.test.js` (a régua de todo o servidor, as listas com filtro, o desligado também para quem a régua antiga barra, o
gravado do desligado). Uma consulta **A100** no molde da A99 se houver gente que perde. Se couber: levar a régua de todo o servidor desta etapa
para os testes das 148, 149 e 150 (a mesma fraqueza — retro desta etapa).

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 150 (que já inclui as das 145 a 149 e a **C330**) — **B853**/**C279**,
**B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela
de conversões e o grupo acima de família, a régua do tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**,
**C117**/**C118**, **C139**, **C278**; na 05, os itens de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por
cliente e previsto × realizado; na 22, **B13**, **B101**/G30, **G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62; nas
propostas, a verificação do dono da proposta (Fase 12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a
Frente B da lentidão, a **C297** (**B924**), a **B926**, a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**; no
Operacional, a **C332**. Pendem de Postgres: **C98**, **C110**. Do Compras: a **C348**. **Novo nesta etapa, do P.O.:** a **C354** (a tela de
oportunidades volta ao menu?). *(As decisões B983 e B984 são reversíveis e estão na letra B; a **C353** — a régua dos três módulos nas listas —
é candidata reversível, não do P.O.)*

**O que já está pronto e não precisa reabrir:** o portão nas 18 desta etapa (`exigirComercialNasPropostas`), as duas listas abertas
(RN-151.03, B983); o teste `clientesProjetosPortao` (7); a régua do fonte das 148/149 no texto inteiro. Candidatas menores para encaixar se
sobrar: **C351** (o `encodeURIComponent` nas três telas da OS), **C352**/**C355** (a busca global e o painel filtrando pelo módulo — medir
antes) e a **C353**.
