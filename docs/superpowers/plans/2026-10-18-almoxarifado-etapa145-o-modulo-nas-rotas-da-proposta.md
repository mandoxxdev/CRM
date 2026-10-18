# Etapa 145 (propostas): as rotas da proposta exigem o módulo Comercial, a geração automática responde depois de gravar e o cliente que não existe é recusado (C317, C318, C315) — plano

> Origem: "Próxima tarefa detalhada — Etapa 145" do plano da 144
> (`docs/superpowers/plans/2026-10-18-almoxarifado-etapa144-produto-inexistente-na-geracao.md`). O design, com a Fase 0 medida, está neste
> plano (seção "Fase 0 — medido"): a etapa é pequena e o design não justifica um documento à parte.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-18): última B **B943**, último C
> **C318**, última A **A92**. Esta etapa: **B944+**, **C319+**, **A93+**. Worktree `CRM-wt-e145`, branch `etapa-e145` (da main `38520b4e`).
>
> **Trava de máquina:** `scratchpad/e145-lock.sh` (o diretório `maquina-testes.lock` de sempre). Um arquivo de teste de servidor por vez,
> inclusive os revisores. Revisão obrigatória da proposta: `scratchpad/e145/review-proposta.sh` (23 + editor 39; o teste novo da rota entra
> na lista "pela rota"). A etapa **não** toca o template; toca o `index.js` (as 49 rotas `/api/propostas*`, a geração automática e o
> `POST /api/propostas`), um serviço novo `server/services/portaoDasPropostas.js` e `server/services/modulosSistema.js` (uma lista).
>
> **Fase 2 (um revisor fresco, só leitura): 0 Critical, 4 Important, 7 Minor — todos aceitos antes do código, com o que mudou:**
> **I-1** são **49** rotas, não 50 (a 50ª da minha contagem era a listagem da raiz `/api`, texto) e **três** com `multer`, não cinco → corrigido
> em todo o plano. **I-2** o portão respondia 500 ao `SQLITE_BUSY` — o client só repete o 503, e o `salvar()` do preview faz quatro chamadas
> → BUSY vira **503** pelo `respondDbError` (o do login), com cenário injetado. **I-3** a tabela compartilhada provava só a função pura, não a
> consulta que monta as linhas (um `grupo_id = 0` ou um grupo inativo contado passaria verde) → o teste pela rota confere, **para cada
> usuário do cenário**, que a decisão do portão é a mesma que a função pura dá sobre as `permissoes` que o `GET /api/usuarios/:id/grupos`
> (a fonte da tela) devolve; casos novos: direta com `grupo_id = 0`, grupo apagado com o vínculo órfão. **I-4** faltava a task da **A93** →
> T5. **M-5** a seção da sonda estava vazia → preenchida. **M-6** a outra rota do Comercial (`GET /api/comercial/ordens-servico`) segue a
> régua antiga → **C321** (não mexida: muda o acesso de outra tela). **M-7** o barrado ainda lê dados de proposta por outras rotas (busca
> global, painéis, aprovações, OS do Operacional, notificações) → **C320**; a B944 diz "pelas rotas `/api/propostas*`". **M-8** o `PUT` da
> proposta aceita cliente que não existe, e o `POST /api/propostas` grava os itens sem conferir o erro (o defeito da C318) → **C322** e
> **C323**. **M-9** a limpeza com só uma das exclusões falhando → os itens saem primeiro; se falharem, a proposta **não** é apagada e a
> mensagem é a da incompleta; a janela da B948 é de segundos com milhares de itens, não milissegundos. **M-10** o portão depois do `multer`
> responderia o mesmo 403 com o arquivo já gravado → o cenário manda multipart de verdade e confere que nenhum arquivo novo aparece nas
> pastas de upload. **M-11** sabotagem do `index.js` não roda em paralelo com outra task → tudo em sequência, por mim. *Uma afirmação do
> revisor não confere com a sonda:* ele leu que o `POST` com `numero_proposta` e cliente que não existe dá **200**; a sonda mediu **500** (a
> chave estrangeira, que o servidor liga) — vale o medido.

## Fase 0 — medido (antes de qualquer código)

### O módulo e as duas réguas que já existem (lido no código)

- **A tela abre Propostas pelo módulo `comercial`**: `client/src/App.js` monta todas as rotas `/comercial/propostas*` (lista, detalhe,
  formulário, preview editável, configuração e editor do template) dentro de `<ProtectedModuleRoute modulo="comercial">`.
- **A régua da TELA** (`hasModuleAccess`, `client/src/services/permissionsCache.js`, dados de `GET /api/usuarios/:id/grupos`):
  super ou `role` admin → entra; **se o usuário tem alguma linha de permissão** (as dos grupos **ativos** + as diretas com `grupo_id IS NULL`),
  entra só se uma delas for `modulo = 'comercial'` com `permissao = 1`; **sem nenhuma linha**, entra em `comercial` e `frota`
  (`MODULOS_LIBERADOS_SEM_PERMISSAO_PORTAO`, B63).
- **A régua do SERVIDOR** (`checkModulePermission`, `server/services/portaoDeModulo.js`): super ou `role` admin → passa; linha direta
  (`grupo_id IS NULL OR 0`) do módulo → passa; **sem grupo ativo nenhum → passa em `comercial`** (`MODULOS_LIBERADOS_SEM_GRUPO`, B63) —
  **mesmo que tenha linhas diretas de outros módulos**; em grupo ativo → passa só com a linha do grupo. Admin de módulo (`admin_modulos`)
  não passa por nenhuma das duas.
- **As duas divergem** (congelado na 111 — B63): (1) quem tem só linhas diretas de outros módulos e nenhum grupo — a tela **barra** o
  Comercial, o servidor **libera**; (2) quem está num grupo ativo **sem linha nenhuma** e não tem direta — a tela **libera** (zero linhas), o
  servidor **barra**; (3) a direta com `grupo_id = 0` — o servidor conta, a tela não (mas sem outra linha a tela libera de qualquer jeito);
  (4) a direta do Comercial com `permissao = 0` e sem grupo — a tela barra, o servidor libera.

### As rotas (contadas)

- **49** registros `app.<verbo>('/api/propostas…', authenticateToken, …)` no `index.js` (5411 a 18944), **todos** só com `authenticateToken`;
  nenhum em `routes/` nem `services/`; nenhum registro multilinha (as linhas com `'/api/propostas` são 50: as 49 + a listagem da raiz
  `/api`, que é texto — *este item dizia "50 registros" e "cinco com `multer`"; **estava errado** (Fase 2 I-1)*). **Três** têm `multer`
  depois do `authenticateToken` (fotos, cotação, PDF anexo).
- Fora do escopo (contados, não tocados): **20** rotas `/api/proposta-template*`, `/api/proposta-blocos*`, `/api/proposta-texto-biblioteca*`,
  também só com `authenticateToken` → **C319**.

### Quem chama além da tela de propostas (lido no client e no servidor)

- **Comercial** (dentro de `/comercial`): `PropostasList`, `PropostaDetalhe`, `PropostaForm` (novo e legado), `PropostaPreviewEditavel`,
  `PreviewPropostaEditavel`, `HistoricoEdicoes`, `Aprovacoes`, `Atividades` (lembrete), `CustosViagens`, `OrdensServicoComercial`,
  `OSComercialForm`, `Propostas` (legado).
- **Fora do Comercial — um só:** `OSDetalhesForm` (montado por `OSFormPage`, que está em `/comercial/ordens-servico/editar/:id` **e** em
  `/operacional/ordens-servico/editar/:id`) chama `GET /api/propostas/:id` para buscar os itens quando a OS não tem itens próprios (falha
  é engolida: `console.error`, a OS abre sem itens). Um usuário do Operacional sem o Comercial perderia isso calado.
- `Notificacoes` (no `Layout` de todos os módulos) só **navega** para a proposta (não chama a API de proposta). `gerarPDFProposta.js` e
  `GerarPropostaModal` não têm quem os importe (C316).
- **Servidor:** nenhuma chamada interna HTTP às rotas de proposta (o PDF é gerado no próprio processo; os `localhost:${PORT}` do
  `index.js` são das imagens do template e de outro módulo).

### Sonda pela rota (`server/tests/sonda/e145.js`, não versionada; `index.js` real em pasta vazia)

Seis usuários `role: 'usuario'` criados pela API (o `POST /api/usuarios` não põe ninguém em grupo) e os grupos gravados por fora: G-com (ativo,
com o Comercial), G-op (ativo, só o Operacional), G-vazio (ativo, sem linha), G-inat (inativo, com o Comercial).

| Usuário | `GET /propostas` | `GET /propostas/:id` | `PUT …/variaveis-manuais` | `POST …/gerar-automatica` |
|---|---|---|---|---|
| sem grupo, sem linha | 200 | 200 | passa (400 do corpo) | 200 |
| grupo com Comercial | 200 | 200 | passa | 200 |
| **grupo só com Operacional** | **200** | 200 | passa | **200** |
| **grupo ativo sem linha** | 200 | 200 | passa | 200 |
| só em grupo inativo | 200 | 200 | passa | 200 |
| grupo Operacional + direta do Comercial | 200 | 200 | passa | 200 |

**C318** — geração automática com 200 itens: **200** com **34** itens no banco no instante da resposta (os 200 três segundos depois);
com 5 000 itens: **200** com **4** gravados na resposta (os 5 000 depois). A resposta sai antes de gravar.

**C315** — `cliente_id: 99999`: geração automática **500** *"Erro ao gerar número da proposta: Número não gerado"*; `POST /api/propostas`
**500** *"Não foi possível gerar o número da proposta"*; `POST /api/propostas` **com `numero_proposta`** **500** *"Erro ao salvar proposta:
SQLITE_CONSTRAINT: FOREIGN KEY constraint failed"* (o servidor liga as chaves estrangeiras na conexão dele). Nenhuma proposta criada nos três.

**Linha de base** (a árvore da main `38520b4e`, antes de qualquer código): `test:api` **463/463**; `test:almoxarifado` **44/0**;
`test:validation`/`safealter`/`sqlite` verdes (16/0); client **142** suítes / **1829** testes; `CI=true build` *Compiled successfully*;
revisão obrigatória **23/23** + as rotas da 143 e da 144 + editor **39/39**.

### O banco local (cópia de 09/10 do `CRM/server/data`, lida numa cópia no scratchpad)

**10** usuários ativos, **4** super/admin, **0** grupos (`grupos_permissoes` vazia) — todo o acesso é por **permissão direta**. Os 4
usuários que criaram/editaram proposta nos últimos 90 dias são 3 super e 1 usuário com a direta do Comercial. Os outros 4 usuários comuns
(ids 7, 8, 12, 15) têm diretas **sem** o Comercial — a tela **já os barra** do Comercial, e o servidor (sem grupo) os libera.

**Consequência para o desenho (achado da Fase 0):** pôr `checkModulePermission('comercial')` nas rotas (o desenho sugerido no plano da 144)
**não mudaria nada neste banco** — sem grupo, todo mundo passa no Comercial. E a reprodução do r2 da 144 ("usuário sem grupo **nem
permissão** gera proposta") **continua passando com qualquer das duas réguas**: as duas liberam o Comercial a quem não tem linha nenhuma
(B63, decisão do P.O.). O que dá para fechar sem o P.O. é **a API concordar com a tela**: quem a tela barra do Comercial, a API barra.

## Regras de negócio

- **RN-145.01 — as rotas da proposta exigem o Comercial pela régua da tela.** Toda rota `/api/propostas*` (as 49), depois do login e antes
  de tudo (inclusive do upload), passa pelo portão das propostas: super ou `role` admin passa; com alguma linha de permissão (grupos ativos
  + diretas com `grupo_id IS NULL`), passa só com a linha `comercial` de `permissao = 1`; sem nenhuma linha, passa (a regra da tela — B63).
  Recusa: **403** `{ "error": "Acesso negado ao módulo", "modulo": "comercial" }` (o mesmo corpo do portão de módulo de sempre) e uma linha
  `acesso_negado` em `logs_auditoria` com o nome *Comercial*. Nada é lido nem gravado na proposta.
- **RN-145.02 — o `GET /api/propostas/:id` aceita também o Operacional** (a OS do Operacional busca os itens da proposta): passa com a
  linha `comercial` **ou** `operacional` (mesma régua). Recusa: **403** `{ "error": "Acesso negado ao módulo", "modulo": ["comercial",
  "operacional"] }`, log *Comercial ou Operacional*.
- **RN-145.03 — a chave de desligar.** Com a variável de ambiente `PROPOSTAS_PORTAO_DE_MODULO=desligado` no servidor, o portão passa
  todos (o de antes desta etapa) e o boot escreve um aviso no log. Qualquer outro valor (ou ausente) = ligado. Reverter sem deploy.
- **RN-145.04 — a régua do portão é a da tela, uma só.** A decisão é uma função pura no servidor
  (`temModuloComoATela(user, linhas, modulos)`), e os mesmos casos (tabela compartilhada `server/tests/fixtures/portaoComoATela.casos.json`)
  são rodados contra ela **e** contra o `hasModuleAccess` do client — se uma das duas mudar sozinha, um dos testes cai. A lista "sem linha
  nenhuma" do servidor (`MODULOS_LIBERADOS_SEM_LINHA_NA_TELA`, `modulosSistema.js`) é conferida contra a do client pelo teste cruzado.
- **RN-145.05 — a geração automática responde depois de gravar os itens (C318).** Os itens são gravados **um depois do outro** e a resposta
  `200` só sai depois do último. Falha num item → apaga os itens já gravados e depois a proposta (Fase 2 M-9: se os itens não saírem, a proposta fica), e responde **500** *"Erro ao gravar os itens da
  proposta (<mensagem do banco>). Nenhuma proposta foi criada — tente de novo."*. Se a limpeza também falhar → **500** *"Erro ao gravar os
  itens da proposta (<mensagem>). A proposta <número> ficou incompleta — exclua-a e gere de novo."*.
- **RN-145.06 — o cliente que não existe é recusado nas duas portas (C315).** `POST /api/propostas/gerar-automatica` e `POST /api/propostas`
  com `cliente_id` inteiro positivo que não está em `clientes` → **400** *"Cliente não encontrado (id 99999). Atualize a lista de clientes
  e tente de novo."*, antes de gerar o número e de criar (nenhuma proposta nasce). Vale também no `POST` com `numero_proposta` informado
  (antes **500** com a mensagem da chave estrangeira do SQLite — medido). Cliente **inativo** conta como achado (B947). Falha ao ler →
  **500** *"Erro ao verificar o cliente: <mensagem>"*.
- **RN-145.08 — o pedido de aprovação do desconto passa pelo mesmo portão (Fase 5, r2 I-1).** As 5 rotas `/api/aprovacoes*` (criar,
  listar, ler, decidir, excluir), depois do login e antes de tudo, com `exigirComercialNasPropostas`; recusa igual à da RN-145.01. Quem a
  tela barra do Comercial criava o pedido pela API, e o pedido aprovado muda a margem e o status da proposta (B950).
- **RN-145.07 — a ordem das recusas.** Portão (403) → as da geração automática da RN-144.03 até *"Usuário inválido"* → **cliente não
  encontrado** (no lugar do 500 do número). No `POST /api/propostas`: título → margem → item → motivo → *"Cliente é obrigatório"* →
  *"Cliente inválido"* → responsável/usuário → 403 dos 5 % → **cliente não encontrado** → número.

## Contratos de API (congelados)

| Rota | Mudança | Status | Corpo / mensagem literal |
|---|---|---|---|
| as 49 `/api/propostas*` (menos o `GET /:id`) e as 5 `/api/aprovacoes*` (Fase 5) | sem o Comercial pela régua da tela | 403 | `{ "error": "Acesso negado ao módulo", "modulo": "comercial" }` |
| `GET /api/propostas/:id` | sem Comercial nem Operacional | 403 | `{ "error": "Acesso negado ao módulo", "modulo": ["comercial", "operacional"] }` |
| todas | erro ao ler as permissões | 500 | `{ "error": "Erro ao verificar permissões" }` |
| todas | `SQLITE_BUSY` ao ler as permissões (Fase 2 I-2) | 503 | `{ "error": "Banco temporariamente ocupado. Tente novamente em alguns segundos.", "code": "SQLITE_BUSY", "retryAfter": 3, "context": "portao:propostas" }` |
| `POST /api/propostas/gerar-automatica` | falha ao gravar um item | 500 | `Erro ao gravar os itens da proposta (<msg>). Nenhuma proposta foi criada — tente de novo.` |
| `POST /api/propostas/gerar-automatica` | falha e a limpeza falha | 500 | `Erro ao gravar os itens da proposta (<msg>). A proposta <número> ficou incompleta — exclua-a e gere de novo.` |
| `POST /api/propostas/gerar-automatica`, `POST /api/propostas` | cliente não existe | 400 | `Cliente não encontrado (id <id>). Atualize a lista de clientes e tente de novo.` |
| as duas | falha ao ler o cliente | 500 | `Erro ao verificar o cliente: <msg>` |

## Tasks (sort topológico)

- [x] **T1 — tronco — `68227035` (Fase 5: `b7848925`) — o portão (RN-145.01 a 04).** `services/portaoDasPropostas.js` (puro `temModuloComoATela` + fábrica do middleware com
  `getDb`, `registrar`, `desligado`); a lista em `modulosSistema.js`; as 49 rotas com o portão logo depois do `authenticateToken` (por
  `perl`, âncora contada; o `GET /:id` com o par). Testes: `tests/api/propostaPortaoModulo.api.test.js` (pasta vazia, `index.js` real):
  (a) **régua pelo fonte** — todo `app.<verbo>('/api/propostas` do `index.js` tem o portão como 2º middleware, e a contagem bate com uma
  régua independente (controle: a contagem de `'/api/propostas` em linhas de `app.`); (b) **pela rota, as 49** — o usuário barrado
  (só o Operacional, por direta, sem grupo — o caso 7/8/12/15 do banco local) toma o 403 com o corpo em **cada uma** das 49 (os `:id` trocados
  por uma proposta real), e nada muda na proposta (linha e itens lidos por fora); o `GET /:id` passa com o Operacional; (c) a metade positiva
  — super, admin, a direta do Comercial, o grupo ativo com Comercial, o sem linha nenhuma (B63), o só em grupo inativo (zero linhas) e o grupo
  ativo **sem linha** (a tela libera — o servidor de antes barraria) passam em rotas de leitura e escrita; (d) o log `acesso_negado`;
  (e) a chave desligada (novo boot) deixa o barrado passar; (f) o puro contra a tabela compartilhada; (g) **a mesma decisão da tela** —
  para cada usuário do cenário, o status do portão bate com `temModuloComoATela` sobre as `permissoes` do `GET /api/usuarios/:id/grupos`
  (Fase 2 I-3), com a direta de `grupo_id = 0` e o vínculo órfão de grupo apagado entre eles; (h) o BUSY injetado → 503; (i) as três
  rotas de upload com multipart de verdade → 403 e nenhum arquivo novo nas pastas (Fase 2 M-10). Client: o
  `permissionsCache.portaoComoATela.test.js` roda a mesma tabela no `hasModuleAccess`. O cruzado `modulosClienteServidor` confere a lista.
  Controles: o portão fora de uma rota; o portão depois do `multer`; a régua do servidor (`checkModulePermission`) no lugar; o fallback
  vazio; a direta com `grupo_id` qualquer; o grupo inativo contado; a chave sempre desligada; o par do `GET /:id` tirado.
- [x] **T2 — `68227035` (Fase 5: `b7848925`) — galho (servidor, só a geração automática) — C318 (RN-145.05).** Os itens por `db.run` em sequência, parando no primeiro erro;
  a limpeza; a resposta no fim. `tests/helpers/falhaSqlInjetada.js` ganha `FALHA_SQL_PULAR=N` (deixa passar as N primeiras que casam).
  Cenários no arquivo novo `tests/api/propostaGeracaoGrava.api.test.js`: 3 000 itens → no instante do 200, os 3 000 no banco; a falha no
  1º item e no 3º de 5 (com `PULAR=2`) → 500 literal, nenhuma proposta e nenhum item a mais; a falha da limpeza (`DELETE FROM propostas`
  também injetado) → 500 da proposta incompleta. Controles: responder antes do fim; não apagar os itens; não apagar a proposta; seguir depois do erro.
- [x] **T3 — `68227035` (Fase 5: `b7848925`) — galho (servidor, as duas portas) — C315 (RN-145.06/07).** No mesmo arquivo da T2: as duas portas com 99999 → 400 literal e a
  contagem igual; o `POST` com `numero_proposta` → 400 (antes 500 da chave estrangeira); o inativo passa; `cliente_id: "abc"` continua *"Cliente inválido"*; o
  produto que não existe vem antes do cliente; a falha injetada na leitura → 500. Controles: tirar cada recusa; recusar o inativo.
- [x] **T5 — no documento de novidades (fechamento) — a consulta A93** (Fase 2 I-4; ampliada na Fase 5 com as aprovações) — pela régua da tela: usuários ativos, não super nem admin, que criaram, editaram ou mudaram o
  status de proposta nos últimos 90 dias, têm alguma linha de permissão e nenhuma do Comercial; e a lista de todos os ativos que passam a
  ser barrados. Rodada no banco local e numa cópia com controle positivo.
- [x] **T4 — `68227035` — integração (cruza T1, T2, T3).** No arquivo da T2: o vendedor do grupo com Comercial gera pela geração automática (200, itens
  gravados), o usuário só do Operacional lê a proposta pelo `GET /:id` (200) e toma 403 no preview e na geração; o mesmo usuário com
  cliente que não existe toma o **403** (o portão vem antes do 400).

T2 e T3 dividem a rota da geração automática e o arquivo de teste → em sequência, por mim; T1 é o tronco (muda as 49 rotas).

## Decisões (vão para a letra B)

- **B944** — o portão das propostas usa **a régua da tela**, não a do servidor. Descartado: `checkModulePermission('comercial')` (o
  sugerido) — no banco medido (0 grupos) não mudaria nada, e deixaria os usuários que a tela já barra do Comercial gerando proposta pela API;
  descartado também a régua estrita (sem o "sem linha nenhuma entra") — trancaria quem hoje abre o Comercial sem nenhuma linha (B63).
  Consequência: ninguém que **abre** o Comercial na tela perde nada nas rotas `/api/propostas*`; perde quem só chegava a elas pela API
  (outras rotas ainda mostram dados de proposta a quem a tela barra — C320; a outra rota do Comercial segue a régua antiga — C321).
- **B945** — o `GET /api/propostas/:id` aceita o Operacional (a OS do Operacional lê os itens da proposta). Descartado: só o Comercial (a
  OS do Operacional abriria sem itens, calada) e liberar o `GET /:id` a todos (deixaria a proposta inteira, com valores, a qualquer logado).
- **B946** — a chave `PROPOSTAS_PORTAO_DE_MODULO=desligado`. Descartado: só o revert do código (exige deploy, e a A93 pode errar por uma
  forma de uso que a consulta não vê — ex.: uma integração com usuário sem histórico de proposta).
- **B947** — cliente inativo conta como achado (o de sempre; a regra do produto inativo, B936). Descartado: recusar o inativo (regra nova
  sem pedido).
- **B948** — a geração automática desfaz pela limpeza (apaga itens e proposta), não por transação. Descartado: `BEGIN/COMMIT` na conexão
  única (outras requisições no meio entrariam na transação — a mesma razão do motor de estoque). Consequência: entre a proposta e o último
  item, outra tela pode ler a proposta sem todos os itens (segundos, com milhares de itens — Fase 2 M-9).
- **B949** *(Fase 5, r2 I-2 — EM ABERTO, P.O.)* — o usuário sem nenhuma linha de permissão entra no Comercial (B63, herdada de propósito
  pela régua da tela): o recém-criado e o que teve o último módulo revogado. Não mudado (muda quem acessa o quê no sistema inteiro);
  opções na letra B. *(Este item era "B949 — a próxima etapa"; a numeração andou na Fase 5.)*
- **B950** *(Fase 5, r2 I-1)* — as 5 rotas de aprovação com o mesmo portão (RN-145.08). Descartado: deixar para outra etapa (escrita na
  proposta pelo mesmo furo).
- **B951** — a próxima etapa (146), abaixo.

## Avisos novos (C)

- **C319** — as 20 rotas do modelo da proposta, dos blocos e da biblioteca de textos só pedem o login (o barrado cria bloco — r2).
- **C320** — outras rotas mostram dados de proposta a quem a tela barra (busca global, painéis, relatório executivo, mapa de máquinas
  vendidas, custos de viagem, notificações, OS do Operacional) — só leitura.
- **C321** — o `GET /api/comercial/ordens-servico` segue a régua antiga (`checkModulePermission`).
- **C322** — o `PUT /api/propostas/:id` aceita cliente que não existe.
- **C323** — o `POST /api/propostas` grava os itens sem conferir o erro de cada um (o defeito da C318).
- **C324** — o Operacional lê a proposta inteira pelo `GET /:id` (consequência da B945 — r1 R1).
- **C325** — a permissão gravada com `id = 0` some do `GET /api/usuarios/:id/grupos` (`if (row.perm_id)`) e o portão a conta (r1 M1;
  anterior, do núcleo).
- **C326** — o log `acesso_negado` sem teto nem corte do `user_agent` (r2 M-1; anterior).

## Execução

- **Linha de base** (a árvore da main `38520b4e`, antes de qualquer código): `test:api` **463/463**; `test:almoxarifado` **44/0**;
  `test:validation`/`safealter`/`sqlite` verdes (16/0); client **142** suítes / **1829** testes; `CI=true build` *Compiled successfully*;
  revisão obrigatória **23/23** + as rotas da 143 (21/0) e da 144 (11/0) + editor **39/39**.
- **T1–T5 num commit só — `68227035`.** Divergência do plano: o plano previa um commit por task; T1, T2 e T3 dividem o `index.js` (as linhas
  de registro e o corpo da geração automática) e o git desta máquina não faz *add* parcial sem modo interativo — um commit, com o porquê de
  cada C no corpo. A T5 (a consulta) não é código: entrou no documento de novidades (**A93**), com a régua da tela copiada e rodada no banco
  local (cópia de 09/10: 0 linhas na 1, 4 na 2) e num controle positivo (achou exatamente os esperados). Outras divergências: (1) a limpeza
  apaga os itens antes da proposta, mas o `proposta_itens` tem `ON DELETE CASCADE` com as chaves estrangeiras ligadas — apagar a proposta já
  levaria os itens; a ordem fica para o caso de as chaves estarem desligadas (e a frase "incompleta" depende dela — G2/G5 provam); (2) o
  teste cruzado novo (`modulosClienteServidor`) nasceu com a régua sem as barras invertidas (`.includes(m)` vira grupo de regex) e passou de
  primeira provando nada — **a suíte pegou** (1 vermelho), corrigido e com controle (a lista escrita à mão no serviço derruba) antes do commit.
  Controles **K1–K15** (portão: fora de uma rota, depois do `multer`, a régua do `checkModulePermission`, o "sem linha" vazio, o `grupo_id = 0`,
  o grupo inativo, o vínculo órfão, a chave sempre desligada, o par do `GET /:id`, o BUSY como 500, sem log, `permissao ==`, sem
  `trim`/`toLowerCase`, o client com `==`, a lista divergente) e **G1–G10** (geração/cliente: responder antes, não apagar itens, não apagar a
  proposta, seguir depois do erro, a limpeza parcial, sem conferir o cliente em cada porta, recusar o inativo, o erro de leitura engolido, o
  `FALHA_SQL_PULAR` ignorado) — **todos caíram**; G2 e G5 caíram por asserção vizinha da prevista (a "sem itens" da M-9 e a frase), as duas do
  mesmo cenário; md5 restaurado em todos.
- **Suíte antes de `68227035`:** `test:api` **465/465** (a primeira rodada deu 464/465 — o cruzado acima); `test:almoxarifado` **44/0**;
  `test:validation`/`safealter`/`sqlite` verdes (16/0); client **143** suítes / **1845** testes; `CI=true build` *Compiled successfully*;
  revisão obrigatória **23/23** + as rotas (21/0 da 143, 11/0 da 144, **8/0** e **8/0** desta) + editor **39/39**.

## Fase 5 — três revisores frescos em paralelo, sob a trava

- **Regra (r1): 0 Critical, 0 Important da etapa; 1 Minor anterior; 1 registro.** Comparou **27** perfis de usuário (`permissao` NULL, 2,
  `'1'`, `' 1'`, `1.0`; módulo com espaço e maiúscula; linha com usuário e grupo; grupo inativo, `ativo` NULL e `'1'`; `grupo_id = 0`; `role`
  `' admin'`/`'ADMIN'`; `is_superadmin` `'1'`, `1.0`, `'true'`, 2) entre a decisão da tela (cópia do `hasModuleAccess` sobre o `/auth/me` e o
  `/usuarios/:id/grupos` reais) e o portão pela rota: iguais em todos menos um — **M1** a permissão gravada com `id = 0` some da leitura da
  tela (`if (row.perm_id)`) e o portão a conta → **C325** (anterior, do núcleo; só com id 0 à mão). **R1** o Operacional lê a proposta
  inteira, de qualquer número → **C324** (consequência da B945). A geração automática no caso válido (5 produtos, repetido, id em texto,
  preço 0) sai **idêntica** à da `38520b4e` (a versão antiga exportada por `git archive`); a ordem das recusas e o número que não é gasto
  conferem.
- **Autorização (r2): 2 Important (1 anterior corrigido, 1 decisão), 2 Minor (anteriores).** **I-1** o barrado criava o pedido de
  aprovação do desconto (`POST /api/aprovacoes` → 200) que, aprovado, muda a margem e o status da proposta → **corrigido** (RN-145.08,
  **B950**): as 5 rotas `/api/aprovacoes*` com o mesmo portão; controles F1/F2 caíram. **I-2** o usuário sem nenhuma linha entra — o
  recém-criado (`POST /api/usuarios` não grava linha) e o que teve o último módulo revogado (o `rotasDePermissoes` apaga a linha) → **B949**
  (em aberto, P.O.). **M-1** o log de acesso negado sem teto (10 000 negados com `User-Agent` de 8 KB: +81 MB) → **C326**. **M-2** as leituras
  fora das 49 rotas (busca global, painéis, relatório executivo, mapa de máquinas vendidas, custos de viagem) e a escrita em
  `/api/proposta-blocos` → **C319**/**C320** ampliadas. **Verificado e correto, executado:** maiúsculas, barra final, barra dupla, `%2F`, `;`,
  `/./`, `/../`, HEAD, OPTIONS, override de método — nenhum caminho; o portão antes do `multer` nas três; o token de admin rebaixado toma
  403 e o de desativado 401; o 503 repete no máximo 3 vezes; 100 000 itens em 9,2 s sem bloquear as outras rotas (8 ms); o "Cliente não
  encontrado" não é oráculo para o barrado (o 403 vem antes).
- **Sabotagem (r3, worktree própria `CRM-wt-e145-r3`): 29 sabotagens novas — 19 caíram, 8 sobreviventes reais, 2 equivalentes; 0
  defeitos.** (A primeira rodada do r3 não executou teste nenhum — caminho `/c/...` no `require` de um `node -e` —; ele pôs a guarda "SEM
  TESTE RODADO" e refez.) Sobreviventes → cenários: **R6** a direta do Comercial com `permissao = 0`; **R7** a direta de outra `acao`; **R8**
  o admin do módulo Comercial; **R9** o super que não é `role` admin (e o `role` admin que não é super) sob o BUSY; **R16** a rota escrita
  com aspas duplas (a régua pelo fonte conta qualquer aspa e varre `routes/` e `services/`); **R24** a frase da incompleta com o erro da
  limpeza (o helper ganha `FALHA_SQL_MSGS`); **R28** o `cliente_id` com lixo depois dos dígitos. Equivalentes provados: `UNION` no lugar de
  `UNION ALL` (a decisão só usa existência), a limpeza por número (`numero_proposta` é `UNIQUE`), o BUSY sem `return` (o segundo `res` é
  engolido pela guarda do processo; só o log mente).
- **Controles da Fase 5, rodados por mim:** **S6, S7, S8, S9, S16, S24, S24b, S28** (as sobreviventes reaplicadas com as âncoras novas) e
  **F1/F2** (o portão tirado do `POST` e do `PUT` de aprovações) — **todos caíram pela asserção certa**, md5 restaurado.
- **Fase 5 — `b7848925`.** O teste do portão passou de 8 para **10** cenários (17 perfis); o da geração ganhou os casos do r3.
- **Suíte antes de `b7848925`:** `test:api` **465/465**; `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` verdes (16/0);
  client **143** suítes / **1845** testes; `CI=true build` *Compiled successfully*; revisão obrigatória da proposta **23/23** + as rotas
  (21/0 da 143, 11/0 da 144, **10/0** e **8/0** desta) + editor **39/39**. É também a verificação do fechamento (depois dela só mudaram
  documentos).

## Retro (4 números)

1. **Rodadas de correção até verde:** **2** — a régua do teste cruzado (pega pela suíte antes do primeiro commit) e a Fase 5. Testes antigos
   mudados: **1** (`modulosClienteServidor` ganhou um cenário; nenhum existente foi alterado).
2. **Achados da revisão:** Fase 2 — **0 Critical + 4 Important + 7 Minor, todos reais** (o Important que mais pesou: a contagem 50 → 49) + 1
   afirmação do revisor que a sonda desmentiu (o `POST` com número e cliente que não existe dava 500, não 200). Fase 5 — r1 **0** da etapa +
   **1** anterior (C325) + **1** registro (C324); r2 **1** Important anterior **corrigido** (B950) + **1** decisão (B949) + **2** Minor
   anteriores; r3 **8** sobreviventes reais (viraram cenários) + **2** equivalentes; **0** ruído. **A Fase 0 foi a que mais rendeu:** o
   desenho sugerido pelo plano da 144 (`checkModulePermission('comercial')`) não mudaria nada no banco medido.
3. **Paralelismo:** **0** galhos em paralelo de fato (T2/T3 eram galhos; feitas em sequência — dividem a rota e o arquivo de teste, e a
   sabotagem do `index.js` da T1 não pode rodar junto); **0** retrabalho; **1** revisor na Fase 2, **3** em paralelo na Fase 5 sob a trava
   (o r3 numa worktree própria, removida).
4. **Defeito que escapou:** *(preenchido na Etapa 146)* **0 de código** da 145; **1 afirmação errada de documento** — a **C322** dizia que o
   `PUT` com cliente que não existe **grava**; a Fase 0 da 146 mediu **500** com a mensagem da chave estrangeira (a mesma correção que a
   145 fez para o `POST` com número, não estendida ao `PUT`). E **1 subestimação**: a **C323** foi descrita só na criação — o `PUT`
   (que apaga os antigos antes) perdia também os itens que havia, e às vezes nem respondia; e a cópia respondia antes de gravar
   (anteriores à 145; fechados na 146).

## Próxima tarefa detalhada — Etapa 146

*(A série desta etapa foi B944–B951, C319–C326, A93 — a 146 começa em **B952**, **C327**, **A94**; confira com `grep -oE` antes.)*

**Escolhida: a C323 + a C322 (das propostas) — a criação grava os itens sem conferir o erro, e o salvamento aceita um cliente que não
existe.** São as duas portas que a 145 deixou declaradas ao lado das que fechou. **C323:** o `POST /api/propostas` (`index.js`, procure
`// Inserir itens` dentro do `processarProposta`) grava os itens por `db.prepare` + `stmt.run` sem callback dentro de `try/catch` por item
(o erro do SQLite vem no callback, não em exceção — o `catch` nunca pega), e responde no `finalize`: um item que não grava some e a
proposta é criada com sucesso. **Desenho sugerido:** reusar `gravarItensDaGeracaoAutomatica` (generalizar o SQL — o `POST` grava a coluna
`acessorios`, `serializarAcessorios`), com a mesma limpeza e as mesmas frases (RN-145.05). **Fase 0 obrigatória:** medir pela rota, com
`FALHA_SQL_INJETADA` (o `stmt.run` **não** passa pelo helper — ele só intercepta `Database.prototype`; a falha só aparece depois de trocar
para `db.run`, então a prova do "antes" é por leitura, ou injetando no `Statement.prototype`), e ler o `PUT /api/propostas/:id`, que **apaga e
reinsere** os itens (procure o mesmo padrão lá — se tiver, entra no escopo, com o cuidado da Etapa 142: o `PUT` preserva campos e liga as
variáveis manuais pelo `id_anterior`; não quebrar isso). **C322:** o `PUT /api/propostas/:id` com `cliente_id` que não existe grava; usar
`conferirClienteDaProposta` só quando o corpo traz `cliente_id` (o `PUT` é parcial — `montarSetParcial`, chave ausente não muda) e ele
difere do gravado; a ordem das recusas do `PUT` está no `backend.md`. Testes no molde de `tests/api/propostaGeracaoGrava.api.test.js` (os
helpers `FALHA_SQL_PULAR`/`FALHA_SQL_MSGS`). **Se couber:** a **C321** (alinhar o `GET /api/comercial/ordens-servico` à régua da tela —
`exigirComercialNasPropostas` no lugar do `checkModulePermission('comercial')`; medir antes quem a chama: a aba de OS do Comercial e a
`OrdensServicoComercial`).

**Dependem do P.O. — NÃO implemente:** **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**,
**C219**, **C230**, o reparo da **C246** (e a **C247**), a tabela de conversões e o grupo acima de família, a **régua do tempo de
recebimento (E2)**, a **C268**, a **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens
de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**,
**B101**/G30, **G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62; nas propostas, a verificação do dono da proposta
(Fase 12 de `specs/proposta-editavel/tasks.md`; também a **C305**), o filtro por permissão do histórico (`auditoria.md`), a **B910**, a
**C307**, a Frente B da lentidão das propostas (`specs/lentidao-api-propostas/...`, marcada "não executar"), a **C297** (**B924**), a
pergunta da **B926**, a **C312**, a **C316**, a régua de quantidade da **C314** e agora a **B949** (o usuário sem nenhuma permissão entra no
Comercial — mudar a lista "sem linha" da tela e do servidor muda quem acessa o quê no sistema inteiro). A **C324** (o que o Operacional
recebe da proposta) e a **C320** (as outras rotas que leem proposta) não são do P.O., mas cada uma tem usuários legítimos fora do
Comercial — medir antes de prometer. Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** `services/portaoDasPropostas.js` (`temModuloComoATela`, `criarPortaoDasPropostas`,
`SQL_LINHAS_DA_TELA`) e as 49 + 5 rotas com o portão (`exigirComercialNasPropostas`, `exigirComercialOuOperacionalNaProposta`); a lista
`MODULOS_LIBERADOS_SEM_LINHA_NA_TELA` (`modulosSistema.js`) e a tabela compartilhada `tests/fixtures/portaoComoATela.casos.json`;
`gravarItensDaGeracaoAutomatica` e `conferirClienteDaProposta` (`index.js`), `msgClienteNaoEncontrado` e `msgItensNaoGravados`
(`propostaItensDiff.js`); os helpers `FALHA_SQL_PULAR` e `FALHA_SQL_MSGS` (`tests/helpers/falhaSqlInjetada.js`); os testes
`propostaPortaoModulo.api.test.js` (10 cenários) e `propostaGeracaoGrava.api.test.js` (8). A **A93** está escrita e precisa ser rodada em
produção **antes** do deploy desta etapa.
