# Módulo Almoxarifado — Planejamento Mestre

> **Spec original:** [2026-08-02-requisitos-modulo-almoxarifado.md](2026-08-02-requisitos-modulo-almoxarifado.md) (34 seções)
> **Última atualização:** 2026-09-02 (**Etapa 32 fechada — a tabela de anexos, órfã desde a
> Etapa 0, ganhou dono, `e708125..fd71958`. Feature 09, que CONTINUA 🟡.** `anexos_documento_almoxarifado`
> existia como DDL desde 2026-08-03 e **nunca teve um `INSERT`, um `SELECT`, uma rota ou um
> componente**: a varredura do repositório inteiro achava **uma** ocorrência do nome em `server/`,
> o próprio `CREATE TABLE`. **Seis specs (01, 04, 08, 09, 12, 14) a esperavam, e cada uma supunha
> que outra a pagaria** — é por isso que o item atravessou 31 etapas parado.
> **Entregue:** `anexoService.js` (mapa **fechado** de seis entidades com os nomes de tabela LIDOS
> do schema, existência do registro-pai verificada, soft delete auditado); as rotas
> `POST/GET/DELETE /almoxarifado/anexos` e `GET /almoxarifado/anexos/:id/arquivo` com **download
> autenticado**; as ações `anexar_documento` (todos menos CONSULTA) e `remover_anexo`
> (ADMINISTRADOR e ALMOXARIFE); e o componente genérico `AnexosDocumento.js`, plugado na **linha
> expandida da aba Histórico** de Inspeções. **Uma consumidora só, declarado** — as outras cinco
> telas são um plug de poucas linhas cada.
> **A decisão de desenho que a etapa gira em torno:** o arquivo do anexo mora num diretório
> **IRMÃO** de `uploads/almoxarifado`, não numa subpasta — porque `express.static(root)` **serve
> as subpastas de root**, e o instinto óbvio (`uploads/almoxarifado/anexos/`) deixaria todo anexo
> público pelos dois mounts sem autenticação de `routes/almoxarifado.js`. Medido por sabotagem:
> com o diretório como subpasta, os dois mounts respondem **200 deslogado**.
> **O QUE A FASE 2 PEGOU ANTES DE EXECUTAR — 22 achados, 0 ruído, 4 que travariam:** o comando de
> teste do plano usava `-t` (que é `--testNamePattern`, não caminho) e rodava **41 suítes SKIPPED
> com exit 0** — e como o plano mandava PARAR se aquilo passasse, o executor abortaria a etapa por
> alarme falso; `@testing-library/react` **não está instalado** nesta base e a Task 3 mandava
> usá-lo; a Task 4 plugava em `InspecoesAlmoxarifado.js` e em `somenteLeitura`, mas a inspeção só
> ganha `id` **dentro** da decisão — a etapa terminaria com backend inteiro e **zero superfície
> para anexar**; e `AnexoCreateSchema` ficaria fora do `module.exports` por lista fechada,
> matando todo `POST` em `undefined.safeParse`.
> **E o achado que mais ensina foi contra o cenário-bandeira:** a RN-03 — a regra que JUSTIFICA a
> etapa — não pegava o erro que o design existe para evitar. A asserção era
> `GET /api/uploads/almoxarifado/<basename> → 404`; com o diretório como subpasta, esse GET dá 404
> **por caminho errado** enquanto a URL real responde 200 sem autenticação. Treze cenários verdes
> e o furo entregue. A régua certa não é o GET, é a **posição relativa**
> (`path.relative(...).startsWith("..")`) mais o 404 nos **dois** mounts pelo caminho real. É a
> lição da Etapa 31 outra vez: **exemplo prova exemplo, invariante prova a regra.**
> **O que a revisão adversarial achou (2 bloqueantes, 5 importantes, 9 menores, 0 ruído):**
> `ENTIDADES_ANEXO["constructor"]` devolve a **função Object** (truthy), então a guarda não
> lançava e saía `SELECT id FROM function Object() { [native code] }` — **500 com SQL cru no
> corpo**, onde o contrato promete 400 (o teste usava `qualquer_coisa`, que não é chave de
> protótipo: a RN-02 estava marcada como provada **sem estar**); e a listagem **nunca provou o "DA
> entidade pedida"** — com o filtro só por `entidade_id`, as 20 asserções do servidor ficavam
> verdes, e numa tabela polimórfica isso é vazamento entre entidades. Mais o **par que se
> cancelava**: o nome do arquivo chega do busboy em **latin1** e era gravado em mojibake, mas
> corrigir só a gravação daria **500 no download**, porque `res.setHeader` recusa caractere fora
> de latin1 — foram os dois, com `Content-Disposition` em RFC 5987. E **baixar passou a auditar**,
> porque os ids são sequenciais e um laço levava o acervo inteiro sem deixar rastro. Fix-rounds
> `2bad01b` e `fd71958`.
> **Decisões minhas na letra B:** B67 (soft delete mantém o arquivo no disco — descartado apagar
> junto), B68 (download gateado por `visualizar`, com a consequência escrita: qualquer perfil
> baixa qualquer anexo, e por isso o download audita) e B69 (material desativado continua
> aceitando anexo). Furo: **C42** — os seis uploads **legados** seguem públicos sem autenticação,
> defeito **anterior** a esta etapa, com correção própria já desenhada.
> **Números (fechamento, 2026-09-02):** `test:api` **167/167 arquivos** (165 → 167:
> `anexoService` 6, `anexoDocumento` 22), `test:almoxarifado` **42/0**, `test:validation` **4/0**,
> `test:safealter` **3/0**, `test:sqlite` **5/0**; client **648 testes em 42 suítes**
> (`AnexosDocumento` 8, `HistoricoInspecoes` 14), build `CI=true` **Compiled successfully**.
> Antes: 2026-08-31 (**Etapa 31 fechada — os números de documento paravam de ser
> únicos, `1e6c9a9..67b6758`. NÃO é feature: é defeito, não aparece em tela nenhuma, e NENHUMA
> feature muda de cor.** Os quatro números do módulo (`REQ-`, `REC-`, `REM-`, `INV-`) vinham de
> **quatro geradores divergentes**, cada um com `Date.now().toString().slice(-N)` + sorteio 0–99.
> **O defeito não era "mesmo milissegundo", que era como eu o tinha registrado nas Etapas 29 e 30 —
> o carimbo DAVA A VOLTA:** `slice(-6)` repete a cada **16,7 minutos** (`REQ-`) e `slice(-8)` a
> cada **27,78 horas** (os outros três). Não era preciso simultaneidade. E o `INV-`
> (`routes/almoxarifado.js:1108`) **não tinha sorteio nenhum** — colisão em criação simultânea era
> **certa**, não probabilística. Quando colidia, subia `UNIQUE constraint failed` cru ao usuário
> (`handleError` devolve `err.message` sem tradução).
> **Entregue:** `services/almoxarifado/numeroDoc.js` — `carimboTempo(ms)` (base36 do milissegundo
> **inteiro**, sem `slice`), `gerarNumeroDocumento(prefixo)` (carimbo + **8** aleatórios base36,
> ~2,8×10¹² por ms) e `inserirComNumeroUnico(db, prefixo, fn) → { numero, resultado }` com retry
> ×5 e erro traduzido. Os quatro pontos ligados; `gerarNumeroReq` removida. **Nada migrado** (D4):
> os dois formatos convivem, e a RN-05 (formato antigo continua legível) é testada nas quatro
> tabelas.
> **O que a Fase 2 pegou ANTES de executar (8 correções, duas travariam a execução e duas
> deixariam passar defeito silencioso):** *"nos quatro pontos o INSERT é a primeira escrita"* é
> **falso no `REQ`** (`ensureSetoresRequisicao` escreve antes) e o plano mandava **PARAR** nesse
> caso; a receita de forçar a colisão **não podia dar certo** (com `Math.random` preso, as 5
> tentativas geram o mesmo número e o fluxo acaba em erro, não em sucesso);
> `inserirComNumeroUnico` **não devolvia o número**, e os quatro chamadores o usam **depois** do
> INSERT — devolveriam o da 1ª tentativa com o banco guardando o da 3ª (virou a **RN-07**); e a
> Task 2 **não tinha nenhum cenário que caísse**, porque a suíte inteira tinha **uma** asserção
> sobre esses números (`startsWith('REQ-')`), que passa igual com o gerador velho.
> **E duas contas minhas erradas:** base36 dá 8 chars até **2059**, não 5138; e os números ficam
> **mais LONGOS** (12–14 → 20), não mais curtos — esse ia direto para o guia do usuário.
> **O que a revisão adversarial achou (0 bloqueantes, 2 importantes):** a régua do retry casa
> também `pedidos_compra.numero` e `cotacoes.numero` do banco core — hoje inalcançável, mas esses
> números são **digitados** pelo comprador, e embrulhá-los faria o retry reescrever escolha de
> gente (aviso no cabeçalho); e **a defesa do defeito central estava pendurada numa asserção só**.
> **Regra que fica: exemplo prova exemplo; invariante prova a regra.** Sabotar `carimboTempo` para
> um decimal fatiado do **mesmo comprimento** deixava os **quatro** arquivos de fluxo verdes — as
> regexes `/^INV-[0-9A-Z]{16}$/` distinguem o gerador velho (outro comprimento) e **não**
> distinguem base36 de decimal de mesmo tamanho. A correção não foi mais exemplos, foi um
> **invariante**: `parseInt(carimbo, 36) === ms`. "Não perde informação" é o mesmo que "não dá a
> volta", e é **impossível de satisfazer por acidente** — qualquer fatiamento reprova, em qualquer
> base e qualquer comprimento. Fix-round `67b6758`.
> **Decisão que ESPERA VOCÊ:** B66 (numeração sequencial por ano, `REQ-2026-0001`?). Furo: **C41**
> (a partir do deploy os números novos ficam mais longos e com letras; os antigos não mudam).
> **Números (fechamento, 2026-08-31):** `test:api` **165/165 arquivos** (164 → 165:
> `numeroDocumento` 9), `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter`
> **3/0**, `test:sqlite` **5/0**; client **636 testes em 41 suítes** (intocado), build `CI=true`
> **Compiled successfully**.
> Antes: 2026-08-31 (**Etapa 30 fechada — o plano de inspeção sai do `curl` e
> vira tela, `af7adea..7982f18`, feature 09, que CONTINUA 🟡.** O item que o fechamento da 29
> nomeou como o de maior valor está pago: `PlanoInspecaoModal.js` (novo), aberto pelo botão **Plano
> de inspeção** de cada linha de Materiais, com criar/editar/desativar/**reativar** característica
> e a faixa `[nominal+inf ; nominal+sup]` calculada ao lado **enquanto se digita** — via
> `faixaTolerancia.js`, uma cópia só. **Nenhuma linha de backend mudou:** o CRUD existia e estava
> testado desde a Etapa 27; a Task 3 é **um cenário** acrescentado ao arquivo existente (22 → 23),
> a colisão da reativação. **Com esta etapa não falta mais tela nenhuma no ciclo dimensional** —
> cadastrar plano, medir e reler as medidas são todos cliques; os quatro itens que restam para 🟢
> são fluxo de negócio.
> **O que a Fase 2 pegou ANTES de executar (7 correções obrigatórias, e duas teriam custado caro):**
> o plano montava uma armadilha sozinho — o POST tem `?? 0` no desvio e o **PUT não**, e o modal
> edita por PUT, então "desvio em branco vira 0" + "manda só os campos alterados" faria o executor
> enviar `''` e o formulário quebraria ao **limpar um desvio para zerá-lo** (400 *"Desvio
> inválido"*, mensagem que não aparecia no plano nem no design); e a justificativa da Task 3 era
> **factualmente falsa** (o cenário 16 da Etapa 27 já faz `PUT { ativo: 1 }`), o que teria criado
> uma segunda porta para a mesma prova. Mais: o 404 do PUT é *"Característica não encontrada"*, e
> **dois controles positivos prometidos eram no-op** — o do `formatarFaixa` não derruba nada com a
> fixture unilateral, e o do `todos: 1` não derruba as inativas porque o mock padrão desta base
> ignora params.
> **O que a revisão adversarial achou (2 reais, 0 ruído, nenhum bloqueante):** quatro ações de
> `ACAO_PERFIS` **sem rótulo** em `permissaoErro.js`, três já com botão na tela — quem não podia lia
> a chave crua (*"Sem permissão para gerenciar plano inspecao"*); e `faixaTolerancia.js`, que nasceu
> recebendo números do banco, passou a receber **texto de formulário** e errava com espaço colado de
> planilha (`[10.50 ; 10.50]`) e com notação científica (`100 ±1e-3` → `[100 ; 100]`). Fix-round
> `7982f18`.
> **Regra que fica: pedido em comentário não é guarda.** O rótulo faltante é a **quarta** ocorrência
> do mesmo buraco (Etapas 11, 12, 16, 30), e o teste que devia pegá-lo comparava **texto**
> (`not.toContain('_')`) — que o **fallback também satisfaz**, porque ele igualmente troca `_` por
> espaço — sobre uma **lista escrita à mão** cujo comentário pedia "toda ação nova entra aqui". O
> pedido foi ignorado quatro vezes. Agora a lista vem de `ACAO_PERFIS` do servidor, importado no
> teste, e a régua é a **presença** no mapa: ação nova sem rótulo derruba o teste sozinha.
> **Decisão minha na letra B:** B65 (a tela repete a régua de nome duplicado, só pela mensagem —
> e o item explica por que essa repetição é legítima e a da tolerância, proibida pela B60, não é:
> igualdade de texto sobre dados que a tela tem inteiros é exatamente reproduzível; a régua da
> tolerância nunca foi).
> **Números (fechamento, 2026-08-31):** `test:api` **164/164 arquivos** (`planoInspecao` 22 → 23),
> `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite`
> **5/0**; client **636 testes em 41 suítes** (`PlanoInspecaoModal` 12, `MateriaisAlmoxarifado` 11,
> `permissaoErro` 9, `HistoricoInspecoes` 10), build `CI=true` **Compiled successfully**.
> Antes: 2026-08-30 (**Etapa 29 fechada — a tela finalmente MEDE e a medida
> finalmente tem quem LEIA, `d0a9f7c..b20d056`, feature 09, que CONTINUA 🟡.** Os dois itens
> desmarcados do checklist de **frontend** saem, e com eles os furos **C34** e **C35** que a
> Etapa 27 declarou ao entregar a régua sem tela. Entregue: bloco *Medidas do plano* no formulário
> de decisão (campo por característica ativa, faixa somada **com sinal** e formatada pelas casas do
> plano, `input type="text"` porque o valor vai como **string crua**, seletor de instrumento com o
> vencido rotulado e desabilitado); a caixa *Divergência dimensional* **desabilitada e desmarcada**
> com ≥1 medida, com a flag manual fora do payload; e as duas leituras novas `GET
> /inspecoes/historico` e `GET /inspecoes/:id/medidas` (valores **congelados no ato**), consumidas
> pela aba **Histórico**. **Sem plano cadastrado, o formulário é idêntico ao de antes.**
> **B60 cumprida em 2 de 3 partes:** a terceira (pré-visualizar o resultado ao digitar) foi
> **DESCARTADA** — exigiria uma segunda cópia da régua, e a 27 mediu a versão ingênua errar 12,3%
> no limite; o resultado vem do servidor, no toast.
> **O que a revisão adversarial achou (7 reais, 0 ruído, nenhum bloqueante) e mudou o projeto:**
> o Histórico renderizava *"Nenhuma inspeção decidida ainda."* quando a **leitura falhava** — a
> tela afirmando que não há inspeção quando não conseguiu perguntar; `?limite=0.5` passava a guarda
> `n <= 0` e virava `LIMIT 0`, **200 com lista vazia**; a fórmula da faixa estava **duplicada nas
> duas telas e as cópias já divergiam** (unificada em `faixaTolerancia.js`); e duas guardas
> load-bearing (`aberturaRef`, `setMedidas({})`) podiam ser removidas com a suíte inteira verde —
> sem elas, a medida do item A vai no payload do item B. Fix-rounds `f6b0e3d` e `b20d056`.
> **Regra que fica: fixture simétrica ou exatamente representável é teste vazio esperando ser
> descoberto** — `1 dentro / 1 fora` faz `COUNT(=0)` e `COUNT(=1)` empatarem, `12.3 + 0.1` dá
> `12.4` cravado e não exercita o `toFixed`, três flags em `0` não distinguem coluna nenhuma.
> Cinco testes passavam com a feature quebrada, todos por isso.
> **Decisão minha na letra B:** B64 (as duas leituras novas são `auth` sem gate de perfil; decidir
> continua exigindo, provado por teste). Furos: **C39** (o Histórico mostra no máximo 100 e não
> avisa que cortou — paginação ficou fora, declarada) e **C40** (a divergência é derivada das
> medidas **informadas**, não das características do plano: medir só uma, conforme, conclui "sem
> divergência" e apaga a marcação manual).
> **Números (fechamento, 2026-08-30):** `test:api` **164/164 arquivos** (inspecaoHistorico 12,
> inspecaoFluxoMedidas 9), `test:almoxarifado` **42/0**, `test:validation` **4/0**,
> `test:safealter` **3/0**, `test:sqlite` **5/0**; client **619 testes em 40 suítes**
> (InspecoesAlmoxarifado 28, HistoricoInspecoes 9), build `CI=true` **Compiled successfully**.
> Antes: 2026-08-29 (**Etapa 28 fechada — a separação ganha DONO e segunda
> conferência, `9cef003..62cb2b1`, feature 05, que CONTINUA 🟡 (agora "com dono e segunda
> conferência").** Cada rodada de separação vira uma linha própria com autor; a separação e a
> liberação passam a auditar; nasce `PUT /requisicoes/:id/conferir-separacao` com a ação própria
> `conferir_separacao` e a barreira **quem separou em QUALQUER rodada não confere**, repetida no
> `WHERE` do claim (`claimConferencia` exportado e provado direto — o teste de corrida **não** prova
> o `NOT EXISTS`, e isso está escrito). Com material crítico ainda na caixa, a conferência é
> **obrigatória** para `liberar-retirada` **e** `entregar` — o que paga, nessa forma, o último item
> da perna *Segurança* da feature 23 (a B57 segue aberta para as outras operações).
> **O que a revisão adversarial achou e mudou o projeto:** o laço de `separarRequisicao` gravava
> item a item **antes** de validar o próximo (anterior à etapa) — com a barreira apoiada na rodada,
> um payload misto deixava item separado **sem rodada**, e a mesma pessoa separava, conferia e
> entregava; e `maxEntregar` (Etapa 3) soltava o teto do separado depois de entrega parcial — 1
> crítico separado e conferido, 9 entregues sem ninguém olhar. Os dois viraram código no fix-round
> `5a3d593`. **Regra que fica: barreira apoiada num registro só vale se TODO caminho que muda o
> estado grava o registro** — `quantidade_separada` mudava por dois caminhos sem rodada.
> **Decisões minhas na letra B:** B62 (obrigatória só com crítico na caixa) e B63 (conferir só em
> `EM_SEPARACAO`). Furos: C37 (dado legado sem rodada), C38 (almoxarifado de uma pessoa não tira
> crítico). Fragilidade: G9 (`dbGet`+`RETURNING` fora da `writeChain`, pré-existente).
> **Números (fechamento, 2026-08-29):** `test:api` **162/162 arquivos** (159 → 162: `separacaoComDono` 11, `segundaConferencia` 29, `separacaoFluxoCompleto` 3), `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **5/0**; client **593 testes em 39 suítes**, build `CI=true` **Compiled successfully**.
> Antes: 2026-08-29 (**Etapa 26 fechada — a dívida mais ANTIGA do módulo ainda
> aberta foi paga: as categorias de material estavam hardcoded no front desde a Etapa 2
> (2026-08-04), e a B6 esperava resposta desde a 8c. `1bca087..9d86a84`, feature 01, que
> CONTINUA 🟡.** As três telas passaram a ler o catálogo do cliente pelo hook único
> `useCategoriasMaterial.js`, o catálogo virou cadastro editável (com unicidade de nome, soft
> delete e auditoria) e ganhou aba própria em Configurações. **Nada foi migrado, de propósito** —
> os materiais existentes seguem com a categoria antiga (consulta **A6**), e o filtro de categoria
> devolve zero para as novas até o acervo ser remapeado (**C33**). **A Fase 0 desta etapa errou a
> varredura do client tendo a resposta na própria spec 01 — segunda vez seguida; a regra que fica é
> ler a spec da feature ANTES de medir o código.** Ver o bloco "Etapa 26" abaixo.
> Antes: 2026-08-29 (**Etapa 25 fechada — a perna *Segurança* da feature 23
> FECHA como funcionalidade, `6209037..9027c36`. A feature 23 CONTINUA 🟡-forte, e o que falta
> para 🟢 MUDOU DE ITEM PELA QUINTA VEZ: agora é a perna *Perfis*.** Entregue: a movimentação
> passou a registrar **de onde veio** (`ip`, `ip_proxy`, `user_agent`, com `x-forwarded-for`
> tratado porque `trust proxy` não está configurado — sem isso toda linha diria `127.0.0.1` atrás
> do nginx), alcançando os **28** call sites de `registrarMovimentacao` **e** o estorno do
> cancelamento; e a **retenção de backup virou configurável** (`backup_manter_dias` deixou de ser
> dado morto, com piso de 3 cópias e teto de 10, e o prune passou a varrer os acompanhantes
> órfãos `-wal`/`-shm` nos **dois** formatos de nome — 130 dos 132 órfãos reais estão no formato
> antigo).
> **O ACHADO QUE MAIS PESA: a Fase 2 pegou um bloqueante que teria matado o boot de instalação
> nova.** A leitura da configuração estava planejada para `index.js:1013`, que roda **antes** de
> `initializeDatabase` criar a tabela `configuracoes` — no primeiro boot de um volume vazio o
> `SELECT` falha com `no such table: configuracoes`, e o `/health` passa a reportar
> `db_startup_failed` **pelo resto da vida do processo**. Reproduzido no boot real, nos dois
> sentidos, antes de existir a correção.
> **E DUAS linhas da spec 23 estavam ERRADAS, na mesma perna:** *"bloquear lançamento retroativo"*
> **nunca foi tarefa** (`created_at` é `CURRENT_TIMESTAMP` e nenhuma rota aceita data do cliente —
> o retroativo é impossível, então bloqueá-lo também é), e *"justificativa obrigatória em operações
> excepcionais"*, classificada pela Etapa 23 como **"funcionalidade não construída"**, **já estava
> construída em cinco camadas**. Foram reescritas como `[~]` **dizendo que estavam erradas**, não
> apagadas.
> **Regra que fica: as três tasks acharam erro no plano, cada uma na sua** — o contrato C1 sem
> `tetoCopias`, o número da limpeza em produção 4× errado, e o wiring da origem colocado num lugar
> que **não funciona** (`app.use` do prefixo: as rotas redeclaram `auth`, e `req.user = user` apaga
> o `origem` pendurado). Esse último deu o placar que mais ensina da etapa: **12 cenários de
> unidade verdes e 4 de integração vermelhos** — a suíte de unidade sozinha **não pega** feature
> morta por fiação.
> Antes: 2026-08-29 (**Etapa 24 fechada — a perna *Perfis* da feature 23
> COMEÇOU, `a81e51a..4680daa`. A feature 23 CONTINUA 🟡-forte, e o que falta para 🟢 MUDOU DE ITEM
> PELA QUARTA VEZ: agora é a perna Segurança, intacta.** Entregue: o perfil **QUALIDADE**
> (`visualizar` + `inspecionar`, e **nada além** — `ver_alertas` fora de propósito, porque
> `montarCentral` não tem régua por perfil e entregaria 11 alertas, dois deles com valor em R$);
> a **revogação de perfil passando a auditar** (o caminho "voltar ao padrão" retornava **antes**
> do `registrarAuditoria` — tirar o acesso de alguém era invisível na trilha) com o
> `dados_anteriores` nos dois caminhos; **`ADMINISTRADOR` fora do seletor** (escala por
> `hasAlmoxAdminPerfil` e evapora por `syncModuleAdminProfiles`); e os **7 primeiros testes** da
> aba, que tinha zero, mais a integração pela tela-contrato de auditoria.
> **O REGISTRO MAIS IMPORTANTE DAQUI: a Fase 2 derrubou a PREMISSA da etapa.** O design afirmava
> que *"nenhum componente do client consome as rotas de perfil"* e mandava **criar** a tela de
> atribuição. **Ela existe desde 2026-08-05** (`6018f0a`), está no menu, no manual e já tinha sido
> usada sete vezes. O erro nasceu de **duas fontes somadas**: o checklist de Perfis da spec 23
> dava a UI como não construída — **e estava errado há três semanas** —, e a varredura do client
> procurou pelo nome que eu imaginava (`perfil_almoxarifado`) em vez do nome do **CONTRATO**
> (`perfis-usuario`), que vive no arquivo de outra aba. Sem a correção, o módulo teria ganhado
> **uma segunda porta para a mesma função**. **Regra que fica: item desmarcado numa spec não é
> prova de que a funcionalidade não existe — é prova de que ninguém marcou; e medir ausência exige
> procurar pelo nome do contrato.**
> **O item 131 (perfil QUALIDADE) NÃO ficou marcado**, e isso é deliberado: ele pede
> `bloquear/liberar sob desvio`, que usa `ajustar_estoque` e ficou fora — dois dos três botões de
> `/almoxarifado/inspecoes` seguem barrados para o perfil (letra **B56**).
> **Achado metodológico que virou regra na skill de fechamento:** asserção negativa sobre
> permissão **não fica vermelha no TDD** — "QUALIDADE não pode `movimentar`" passa verde **antes**
> de o perfil existir, porque `can()` devolve `false` para o que não conhece; a lista negativa,
> que é a parte que importa, **só tem prova pelo controle positivo**.
> Antes: 2026-08-28 (**Etapa 23 fechada — a trilha para de mentir por omissão e
> por excesso, `0fe8d02..4f1aeb9`. A feature 23 CONTINUA 🟡-forte, e o que falta para 🟢 MUDOU DE
> ITEM PELA TERCEIRA VEZ.** Os **dois buracos de rastro** que a Etapa 22 nomeou como "o que falta
> para 🟢" estão **PAGOS**: `PUT /configuracoes` virou **um `UPDATE` só com `CASE`** (as 18 chaves
> vão juntas ou nenhuma vai — antes, falha no meio deixava parte gravada **e pulava a auditoria**,
> porque o `registrarAuditoria` vinha depois do laço), e excluir o que já está inativo parou de
> gravar um segundo ato, nas **CINCO** rotas — o design e a spec só tinham visto quatro, e a
> quinta era `DELETE /materiais/:id`, a **entidade central do módulo**.
> **A Fase 2 mudou o escopo da etapa e isso é o registro mais importante daqui:** ela reproduziu
> que `services/sqliteConcurrency.js` chamava o callback de quem pediu a escrita em **toda**
> tentativa de retry — então um `SQLITE_BUSY` fazia `await dbRun(...)` **rejeitar**, a rota
> respondia **500 e pulava a auditoria**, e o retry **aplicava a escrita depois**. É o defeito nº 1
> letra por letra, por um caminho que o `UPDATE` único **não fecha**. Virou a Task 0, e sem ela a
> RN-01 seria **promessa falsa**.
> **NADA de `BEGIN`/`COMMIT`/`ROLLBACK`, e a razão é medida:** o CRM tem **uma conexão só**, e
> transação em SQLite é por **conexão** — um `ROLLBACK` por falha ao salvar configuração
> **desfaria a movimentação de estoque de outra pessoa**. `db.serialize()` **não** salva (ordena a
> fila, não dá exclusividade). A ressalva que a Fase 2 acrescentou e que a versão anterior deste
> raciocínio não tinha: a proibição vale para essa **forma**, não para transação em geral — uma
> transação inteira num único `db.exec` é segura, e **o CRM já usa isso duas vezes**
> (`index.js:4479` e `:5700`). Nesses dois, porém, o `ROLLBACK` do `catch` é chamada **separada**:
> mesmo perigo, existindo **hoje**, **fora do escopo** desta etapa por serem rotas do núcleo — vai
> para a letra **C30** das novidades.
> **Cada uma das três tasks achou erro que a revisão do plano deixou passar:** a Task 0, a chamada
> **dupla** do callback em `get`/`all`/`exec` quando o próprio callback lança (com rejeição órfã);
> a Task 1, que é o `WHERE chave IN (…)` — e não o `CASE` — que segura o `ELSE` ausente (sem ele um
> Salvar de 3 chaves gravaria `NULL` em **toda** a tabela, com HTTP 200); a Task 2, um **segundo**
> teste de caracterização que ninguém tinha mapeado (`auditoriaAtosEGate.api.test.js:221`).
> **Pendências fechadas:** os dois buracos de rastro. **O que falta para 🟢 agora:** **não é mais
> auditoria** — a perna de auditoria da feature 23 não tem defeito conhecido. São as pernas de
> **Perfis** (5 itens: perfil QUALIDADE inexistente, UI de atribuição, o fallback para PRODUCAO…)
> e **Segurança** (5 itens: dispositivo/IP na movimentação, lançamento retroativo, dupla
> conferência…), **funcionalidade não construída**, que estão no checklist da spec 23 desde o
> começo e que as duas últimas leituras de cor **não pesaram**. Corrigido em voz alta na spec.
> **Continuam abertas, sem contar para a cor:** **B33** metade (b), **B47**, **G8**, e as duas
> novas **B52** (se o segundo clique em Excluir deve avisar na tela) e **C30**.
> **Números (medidos no fechamento da Etapa 23, 2026-08-28):** `test:api` **150/150 arquivos**
> (147 → 150: três arquivos novos — `configuracoesAtomicidade`, `exclusaoIdempotente`,
> `exclusaoNaTrilha` — e **dois antigos atualizados de propósito** para o comportamento novo, com
> o histórico escrito no cabeçalho em vez de apagado), `test:almoxarifado` **42/0**,
> `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **5/0** (era 3/0); client
> **549 testes em 37 suítes** — e **também 549/549 com `TZ=UTC`** —, build `CI=true`
> **Compiled successfully**.
> Antes: 2026-08-28 (**Etapa 22 fechada — a trilha de auditoria ganha leitor,
> `8c6ffbe..169458d`. A feature 23 CONTINUA 🟡-forte, e o que falta para 🟢 MUDOU DE ITEM.**
> Três etapas (18, 19, 20) instrumentaram 30+ endpoints e **nada disso tinha tela**; agora tem
> `/almoxarifado/auditoria` (gate `configurar`, item de menu `adminOnly`), com filtro de
> entidade, ação, usuário e período, de/para expansível, paginação por offset e truncamento em
> 300 caracteres. O GET ganhou os **quatro filtros** (`acao` como string com vírgulas e **um
> placeholder por valor** — `IN (?)` com `'CRIACAO,CRIAR'` devolve **zero linhas sem erro**),
> validação de data por **ida-e-volta** (`Date.parse` aceita `2026-02-30` e o SQLite rola para
> `2026-03-03`: janela alargada **em silêncio**), **400 de período invertido** e a janela
> convertida para UTC com fuso **constante do módulo** (`FUSO_PADRAO`, nunca `process.env.TZ`:
> a leitura óbvia vira no-op em contêiner `TZ=UTC` e ressuscita a RN-04 em produção com o teste
> verde). Mais `GET /auditoria/opcoes` alimentada por `SELECT DISTINCT` e os **3 índices** que a
> tabela nunca teve (`auditoria_log_almoxarifado` era a única sem nenhum). A régua do de/para é
> **nova e própria** (`auditLabels.alteracoesDaLinha`, união das chaves): `configDiff.calcularDiff`
> **apagaria a troca de segredo mascarada** e fabricaria alteração de campo de contexto — o achado
> mais grave da revisão do plano, com cenário-testemunha congelando o porquê. Revisão do PLANO:
> **10 achados, 2 críticos**, os dois erro de desenho meu. Revisão ADVERSARIAL: **9 achados, 2
> bloqueantes, e o alvo prioritário REFUTADO** — o bloqueante principal era a suíte do cliente
> **vermelha em qualquer máquina em UTC** (`process.env.TZ` em runtime é no-op sob Jest; resolvido
> com `client/jest.globalSetup.js`), ou seja, o placar 546/546 valia só nesta máquina.
> **Pendências fechadas:** **B33 metade (a)** — a trilha tem leitor. **Continuam abertas:** B33
> metade (b) (gate ADMIN-only), **B47** (normalizar os verbos no banco — descartado por ser
> irreversível sobre dado histórico; o mapa de 68 verbos está pronto), **G8** (volume do log de
> permissões) e os **dois buracos de rastro** que agora são o que falta para 🟢 (o ato parcial do
> `PUT /configuracoes` sem transação e sem linha de histórico; `EXCLUSAO` de linha já inativa).
> **Números (medidos no fechamento da Etapa 22, 2026-08-28):** `test:api` **147/147 arquivos**,
> `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**,
> `test:sqlite` **3/0**; client **549 testes em 37 suítes** — e **também 549/549 com `TZ=UTC`**,
> que é o que o `jest.globalSetup.js` existe para garantir —, build `CI=true` **Compiled
> successfully**.
> Antes: 2026-08-28 (**Etapa 21 fechada — exposição no NÚCLEO do CRM,
> `d5c8d3a..07a4b1c`. Nenhuma feature deste mapa mudou de cor**: a etapa é a primeira fora do
> módulo e fecha os itens que a Etapa 20 declarou fora dizendo "são do core". O zip de
> `GET /api/backup` levava `.runtime-secrets.json` — quem baixasse **forjava token de
> superadmin** (escalada de privilégio, não vazamento) — mais ~188 MB de cópias históricas;
> agora exclui o segredo e leva **só a cópia mais recente**, com `-wal`/`-shm` para o fallback
> de `dbRecovery` continuar restaurando com as transações do WAL. Token comparado em tempo
> constante e todo download logado com `req.ip` **e** `x-forwarded-for`; a query string segue
> aceita com aviso de depreciação (B43) e token curto avisa em vez de recusar (B44) — as duas
> para não quebrar cron externo invisível daqui. `getEmailConfig` passa a `env → hardcoded`
> com o **banco fora** (B42, medido no banco: host `smtplw.com.br` ≠ produção e `from` com dois
> endereços); os **dois** GETs de configuração do core param de devolver `email_smtp_pass` em
> claro e o PUT recusa a máscara com 400, com a tela do core corrigida junto (ela salvava a
> cada tecla e gravava `********N` por cima da senha). Revisão do plano: 11 achados, 2
> bloqueantes. Revisão ADVERSARIAL: **11 achados, 4 bloqueantes, 10 refutações reproduzidas** —
> os dois piores eram **testes que não sabiam falhar** (apagar o filtro da rota deixava
> `backupExposicao` 25/25 verde com o segredo de volta no zip; a checagem estática da máscara
> passava mascarando a chave errada). **Continua aberto e não é código:** a rotação da senha na
> Locaweb (letra A3 das novidades; a senha está no git desde 2026-03-17 e trocar o arquivo não
> a remove de clone nenhum). Detalhe no bloco "Etapa 21" da spec 23.
> **Números (medidos no fechamento da Etapa 21, 2026-08-28):** `test:api` **144/144 arquivos**,
> `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**,
> `test:sqlite` **3/0**; client **531 testes em 36 suítes**, build `CI=true` exit 0.
> *(Este cabeçalho pulou a Etapa 20: ele dizia "Etapa 19 fechada" mesmo depois de a 20 ter sido
> entregue — a linha da feature 23 e a lista de etapas abaixo foram atualizadas, o cabeçalho
> não. Dito em voz alta em vez de corrigido em silêncio, porque quem lesse só o topo dataria o
> mapa errado.)*
> Antes: 2026-08-28 (**Etapa 19 fechada — cadastros e configurações
> auditados, `a574b3a..55e4144`. A feature 23 vira 🟡-forte: os 23 endpoints de cadastro e
> configuração passam a deixar rastro.** Cada classe com o tratamento honesto: cadastros com
> de/para completo (6 entidades novas), **configurações com DIFF** (uma linha por PUT, só o
> que mudou — a tela manda 18 chaves a cada save, então auditar por chave seria ruído que
> enterra o sinal), **segredo mascarado sempre** e a URL do webhook sem a query string,
> edição em lote como `material`/`ATUALIZACAO` por material alterado, e `setor_permissao`
> com o mapa de acesso inteiro. Três correções de comportamento vieram junto porque o log as
> exigia: 404 nas 4 rotas que respondiam sucesso para id inexistente, o cascata do rename de
> setor contado (era fire-and-forget e nem sabia quantas linhas mexia) e o import de `audit`
> por objeto no `extended.js`. Revisão do PLANO: 15 achados, 4 bloqueantes — duas armadilhas
> de `this` em arrow function, o diff que percorreria a união (27 chaves de ruído por save) e
> um controle positivo com o resultado invertido. Revisão ADVERSARIAL (trilha + exposição):
> 3 correções de código, todas de log que mentia — regra persistida com 500 e sem rastro,
> diff fabricando 18 mudanças inexistentes quando a leitura do "antes" falhava, e a URL do
> webhook em claro com o token dentro. **Fica declarado:** ~~a trilha segue sem tela (B33)~~ **—
> PAGO na Etapa 22 (`8c6ffbe..169458d`), riscado e não apagado para quem lembrar da pendência
> confirmar que fechou —**, o volume do log de permissões (~46 KB/save, G8) **que segue aberto** e
> o ato parcial sem rastro **que segue aberto e virou o que falta para a feature 23 ficar 🟢**.
> **Números (medidos no fechamento da Etapa 19, 2026-08-28):** `test:api` **138/138**,
> `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**,
> `test:sqlite` **3/0**; client **531 testes em 36 suítes**, build `CI=true` exit 0.
> Antes: 2026-08-28 (**Etapa 18 fechada — a trilha do inventário,
> `adf7233..aee9c9e`. A feature 23 sai de 🟡 para 🟡-forte: o maior buraco de auditoria do
> módulo foi pago.** Abrir, contar, recontar, concluir e cancelar uma conferência passam a
> gravar `entidade='conferencia'` com autor e de/para (5 ações, pós-escrita e best-effort);
> **cancelar exige motivo** (≥5), grava autor/data e só vale em ABERTO, com claim atômico;
> `aprovador_id`/`aprovador_nome` deixaram de ser colunas mortas (preenchidas pelo FATO —
> só com ajuste aplicado); `DELETE /materiais/:id`, cancelar e excluir requisição passam a
> auditar; `GET /auditoria` ganhou gate `configurar` e paginação que **declara o corte**.
> **DUAS SPECS CORRIGIDAS EM VOZ ALTA:** a 03 e a 23 afirmavam que a conclusão de inventário
> escreve `quantidade_atual` fora do motor — isso morreu na Etapa 10 e as specs enganaram por
> seis etapas; e a 23 dizia que "excluir requisição" audita, o que era falso. Revisão
> adversarial (2 lentes): 6 achados reais, 0 ruído — inclusive **regressão da própria etapa**
> (a reescrita do cancelar perdeu o claim atômico e a trilha chegou a fabricar cancelamento
> que não vigorou, medido com `Promise.all`), o de/para nomeando o contador errado da 3ª
> contagem em diante, e a truncagem silenciosa do log em 200 linhas engolindo os atos mais
> velhos. ~~**Fica declarado (B33): a trilha ainda não tem leitor prático** — nenhuma tela a
> consome e o gate é ADMIN-only.~~ **A primeira metade foi PAGA na Etapa 22
> (`8c6ffbe..169458d`): `/almoxarifado/auditoria` consome a rota. A segunda metade CONTINUA
> VERDADE — o gate segue `configurar`, isto é, ADMIN-only.** Riscado em vez de apagado porque
> este parágrafo é registro histórico do que foi declarado na Etapa 18, e apagá-lo faria a
> pendência parecer nunca ter existido.
> **Números (medidos no fechamento da Etapa 18, 2026-08-28):** `test:api` **134/134**,
> `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**,
> `test:sqlite` **3/0**; client **531 testes em 36 suítes**, build `CI=true` exit 0.
> Antes: 2026-08-28 (**Etapa 17 fechada — alertas de evento,
> `d65d81b..e51ca79`. A feature 20 vira 🟢 no que é viável hoje: 17 de 20 alertas. Os 3
> alertas de ATO (material reprovado, divergência de recebimento, divergência de inventário)
> avisam no instante do fato por `dispararAlertaRegistrado`, reusando dedupe/textos da mesma
> entrada do registro, com os `listar` em DUAL-MODE (janela para a central/varredura, id do
> fato para o gancho) — régua única, e a varredura diária vira rede de segurança sem
> duplicar; mais o resumo mensal de lotes sem certificado. Revisão do PLANO evitou dois
> defeitos de produção (o gancho da divergência estava na rota que a UI nunca chama, e a
> janela por `created_at` cegaria recebimento antigo); revisão ADVERSARIAL achou 5 reais e 0
> ruído — dedupe que calava a divergência nova e pior, 1000 e-mails/mês no alerta de lote,
> uma afirmação FALSA na spec (corrigida em voz alta: transição de workflow ressuscita
> divergência antiga — é a rede funcionando, não duplicata) e dois testes que não sabiam
> falhar. Restam da 20 só os 3 com lacuna de dado nas features donas.**
> **Números (medidos no fechamento da Etapa 17, 2026-08-28):** `test:api` **131/131**,
> `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**,
> `test:sqlite` **3/0**; client **527 testes em 36 suítes**, build `CI=true` exit 0.
> Antes: 2026-08-28 (**Etapa 16 fechada — alertas operacionais, a fatia
> real, `d9750ce..ed5f032`. A feature 20 vira 🟡-forte: 13 de 20 alertas, central no front e
> a primeira parcela do motor único (`alertRegistry` — varredura diária, e-mail e a tela
> `/almoxarifado/alertas` leem o MESMO registro); 7 alertas novos (calibração, sem consumo,
> excessivo, quarentena parada, sem endereço com material de cliente DE PROPÓSITO — B29,
> requisição atrasada com status DERIVADO da máquina de estados, reserva parada), 3 janelas
> configuráveis validadas nos dois lados, ação nova `ver_alertas` [ADMIN, ALMOXARIFE,
> GESTOR, COMPRAS — B28]. Dois itens SAÍRAM do checklist da spec 20 dizendo por quê
> (transferência: cortada pelo cliente em 2026-08-12; negativo: regra do motor). Revisão
> adversarial (2 lentes): 4 achados reais, 0 ruído — varredura que silenciava os demais
> alertas num erro e datas DATE exibidas com um dia a menos no fuso do Brasil corrigidos em
> `ed5f032`; relógio da quarentena (created_at do recebimento) e data_necessidade texto-livre
> declarados (C18/C19). Restam da 20: 4 alertas de evento + 3 com lacuna de dado, nomeados.**
> **Onde o desenvolvimento está: o roteiro de etapas acabou na 15; a 16 foi escolhida pelo
> mapa (modo contínuo por instrução do usuário, 2026-08-28). Próxima frente: também pelo
> mapa — candidatas nomeadas no handoff do plano da 16 (fatia 2 da feature 20: os 4 alertas
> de evento; ou o buraco de auditoria da conferência de inventário, feature 23).**
> **Números (medidos no fechamento da Etapa 16, 2026-08-28):** `test:api` **128/128**,
> `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**,
> `test:sqlite` **3/0**; client **522 testes em 36 suítes**, build `CI=true` exit 0.
> Antes: 2026-08-28 (**Etapa 15 fechada — mobilidade, a fatia real,
> `7f74b6c..a82ad43`. Nasce a feature 24 (🟢 no escopo medido): scanner de QR pela câmera
> fechando o ciclo das etiquetas 6c (client-only, RN-01 com filtro de protocolo E de prefixo),
> assinatura digital + responsável pela retirada na entrega de requisição (tabela append-only
> auditada, rota multipart no padrão canônico, opcional por design — RN-02), e o balcão usável
> no celular (a regra CSS que escondia colunas ≥4 morreu; scroll na própria tabela; modais em
> tela cheia). 1D/coletores/app nativo ficaram FORA por medição (nada gera 1D; hardware não
> confirmado; sem demanda offline) — B25-B27 das novidades. Revisão adversarial (2 lentes):
> backend Aprovado com 1 Minor (500 opaco de multer nas 5 rotas de upload — pendência nomeada
> na spec 24); front Needs-fix-round com 1 Important reproduzido (prefixo `/almoxarifado` sem
> exigir barra navegava para tela branca) + 2 Minor — tudo corrigido em `a82ad43`.
> Retomado o desenvolvimento em modo contínuo por instrução do usuário (2026-08-28).**
> **Onde o desenvolvimento está: o roteiro de etapas 0-15 do planejamento mestre está
> completo. A próxima frente sai do mapa abaixo (maior lacuna: feature 20, alertas — central
> no front e ~16 alertas restantes; depois os restos declarados de 21/22/23 e as decisões B
> em aberto).** O handoff está na seção "Próxima tarefa detalhada" do plano
> `docs/superpowers/plans/2026-08-28-almoxarifado-etapa15-mobilidade.md`.
> **Números (medidos no fechamento, 2026-08-28):** `test:api` **125/125 arquivos OK**,
> `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**,
> `test:sqlite` **3/0**; client **513 testes em 35 suítes**, build `CI=true` exit 0.
> Antes: 2026-08-25 (**Etapa 14 fechada — integrações, a fatia real,
> `b276dca..2de7944`. A feature 22 vira 🟡: Compras + custo por projeto entregues;
> BOM/OP/centro-de-custo bloqueados por dependência com a medição escrita na spec.**
> **O que a Etapa 14 entregou:** a medição da Fase 0 provou Compras maduro e BOM/MES sem chão —
> o escopo virou a fatia integrável real: **ciclo de vida da solicitação de compra** (RECEBIDA
> automática quando a nota do pedido vinculado é processada, gancho nos DOIS caminhos do
> recebimento; CANCELADA manual com justificativa obrigatória auditada — **fecha a pendência
> B14** aberta desde a 11; finalizada é terminal, não ressuscita nem re-vincula), **vincular
> validando as duas pontas** (pedido fantasma impossível), **D9** (vincular/verificar-mínimos
> abertos de ADMIN-only para `gerenciar_reposicao` — abertura de gate, letra B21 das
> novidades), verificar-mínimos **auditando o autor** por linha criada, **contexto do
> comprador** (`GET /compras/contexto-material/:id` + painel na tela de Reposição: saldos,
> consumo médio, último custo por NF pelo par movimentação×item, solicitações abertas),
> **relatório custo-por-projeto** (consumido/devolvido/líquido pelo livro, custo atual
> retroativo declarado, gate nasce fechado — D6/B24) com **herança de projeto/OS na devolução**
> nas duas pernas (sucata incluída), e o teste-jornada da integração com **compra parcial**.
> **Revisão final** (2 lentes): ambas Needs-fix-round leve, 0 ruído — convergiram no mesmo
> buraco de rede (CANCELADA não ressuscita não tinha teste) — tudo acatado em `2de7944`;
> matriz de 8 perfis limpa (D9 contido: as 7 rotas `configurar` seguem intactas).
> **Números (medidos no fechamento, 2026-08-25):** `test:api` **123/123 arquivos OK**,
> `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**,
> `test:sqlite` **3/0**; client **487 testes em 33 suítes**, build `CI=true` exit 0.)
> Antes: 2026-08-24 (**Etapa 13 fechada — relatórios e indicadores,
> `4fdda54..8bb5e52`. A feature 21 fica 🟡-forte (grosso entregue; restos declarados).**
> **O que a Etapa 12 entregou:** fila de notificações com retry/backoff/dedupe/claim e
> histórico (a fila é o histórico), gancho pós-commit de movimentação por classes (default
> desligado — decisão B15), três dívidas antigas pagas (lembrete de ferramenta 9b/B7, resumo
> de solicitações 11, devolução parcial 7), alertas de estoque zerado/lote vencendo/remessa
> vencida, painel de notificações gateado e 10 configs novas nos dois lados.
> **O que a Etapa 11 entregou:** motor de **sugestão de reposição** no `purchaseService`
> (consumo médio pela fonte única `TIPOS_SAIDA` em janela configurável; ponto efetivo com **a
> mínima como chão de todas as réguas** — emenda Critical da revisão da Task 1; posição =
> `disponivelSql` + solicitações abertas dentro do **horizonte** configurável de 60 dias, com
> `a_caminho_vencido` exposto; alvo `max(máxima, ponto)` com lote econômico como piso);
> sugestão consolidada por **fornecedor** e valorada pela fonte única de custo; **gerar
> solicitações** com quantidades sempre do servidor (sem dedupe — a matemática da posição é o
> dedupe; pendência insuficiente gera o complemento; auditado; confirm no front); **estoque
> parado** (excesso/sem consumo/obsoleto, flags independentes, valor em reais, resumo do
> estoque inteiro); ação nova **`gerenciar_reposicao`** [ADMIN, GESTOR, COMPRAS — ALMOXARIFE
> fora de propósito, primeiro uso real do perfil COMPRAS]; relatório de solicitações com
> VINCULADO e **gateado** (mesmo remédio da 10b); o **mesmo horizonte** aplicado à máquina de
> estados de requisição; 3 configs semeadas e editáveis com validação ≥ 1 **nos dois lados**;
> índice novo no livro; e a **tela** `/almoxarifado/reposicao` (3 abas, com painel de
> erro/permissão por aba — o Critical da revisão final era um 403 renderizado como "não há
> nada a comprar"). Motor de estoque **não tocado**. **Revisão final** (2 revisores medindo
> com probes): 1 Critical + 7 Important + ~11 Minor, 0 ruído — todos os Critical/Important
> corrigidos em `95fb25b` (backend) e `1ea6ab2` (front).
> **Números (medidos no fechamento, 2026-08-24):** `test:api` **111/111 arquivos OK**,
> `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**,
> `test:sqlite` **3/0**; client **408 testes em 30 suítes**, build `CI=true` exit 0.)
> Antes: 2026-08-23 (**Etapa 10b fechada — inventário avançado parte 2,
> `14f4458..7290481`. A feature 17 vira 🟢 no que as duas rodadas se propuseram.**
> **O que a Etapa 10b entregou:** escopos de contagem **combináveis** (família raiz, classe ABC,
> somente críticos, materiais de clientes, com saldo em terceiros — filtros sobre colunas que o
> material já tinha, gravados como `escopo_descricao`-snapshot); **dupla contagem por duas
> pessoas** (flag por conferência: recontagem exige outra pessoa, o GET esconde a contagem do
> colega de quem não é o último autor — com ou sem modo cego —, o primeiro contador pode corrigir
> o próprio número enquanto ninguém recontou, autoria por item sempre gravada); **RN-08**
> (contagem validada: número finito ≥ 0, zero vale); **relatório de acuracidade** (derivado dos
> itens imutáveis, ponderado, contados/total + recontados, impacto financeiro persistido na
> conclusão sem backfill, gate `inventario`); **epsilon de divergência como fonte única**
> (`divergencia.js` — alcança também o relatório antigo `inventario-divergencias`, que ganhou
> gate e filtro CONCLUIDO: antes vazava contagem em andamento para qualquer usuário do módulo).
> O **motor de estoque não foi tocado**. **Revisão final de branch** (2 revisores em paralelo,
> lentes backend e costura front↔back): **1 Critical + 8 Important + 11 Minor, 0 ruído** — o
> Critical era o strip da contagem do colega existindo só sob modo cego: em dupla contagem sem
> cego, o input do recontador vinha preenchido e um **Tab** certificava a recontagem sem digitar
> nada (medido: saldo reescrito pelo motor com trilha de duas pessoas). Corrigido nas duas pontas
> (strip por dupla_contagem no servidor; front só salva campo digitado na sessão).
> **Números (medidos no fechamento, 2026-08-23):** `test:api` **107/107 arquivos OK**,
> `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**,
> `test:sqlite` **3/0**; client **382 testes em 29 suítes**, build `CI=true` exit 0.)
> Antes: 2026-08-22 (**Etapa 10 fechada — inventário avançado,
> `d644827..8db2671`. A feature 17 vira 🟡 (parcial, com corte declarado — ver abaixo).**
> **O que a Etapa 10 entregou:** fecha uma pendência registrada desde a Etapa 7 (itens B1/B2/B3
> do `docs/almoxarifado-novidades-por-etapa.md`) — a conclusão da conferência de inventário
> gravava saldo **por fora do motor de estoque**, sem validação nenhuma. Agora existe um tipo
> dedicado (`AJUSTE_INVENTARIO`) que passa por `stockService.registrarMovimentacao` como qualquer
> outra movimentação, com uma **guarda de retenção nova** — função pura, uma única fonte, chamada
> tanto pelo motor quanto pela pré-validação da rota — que **decide** (pela primeira vez, depois
> de três etapas sem resposta) recusar um ajuste que deixaria material bloqueado/reservado/em
> inspeção/em terceiro com número negativo. Contagem cega (opcional por conferência), tolerância
> configurável com recontagem obrigatória, aplicação **tudo ou nada** (pré-valida todo item antes
> de aplicar qualquer um) e impacto financeiro no aviso de sucesso. **Revisão final de branch**
> (depois de todas as tasks) achou 1 Critical + 4 Important que nenhum gate por-task pegou:
> `AJUSTE_INVENTARIO` com quantidade **zero** (uma contagem física legítima) era recusado pelo
> motor, mas a pré-validação da rota não sabia disso — aprovava o item e só quebrava na aplicação
> real, **com outros itens já gravados** (tudo-ou-nada furado de verdade, não hipoteticamente); o
> mesmo furo existia para material desativado no meio da contagem; `totalItens` ausente na
> resposta vazia; a config de tolerância nunca tinha sido semeada (nunca configurável de verdade);
> o badge de recontagem não atualizava sem reabrir a conferência; o tipo novo nunca entrou nas
> listas do livro de movimentações. Todos corrigidos, com testes que **forçam a ordem dos itens**
> processados (a primeira tentativa de prova por sabotagem passou por sorte de ordenação
> alfabética — só forçando a ordem vulnerável é que a sabotagem provou algo de verdade). **Corte
> declarado, para uma Etapa 10b:** tipos de contagem avançados, dupla contagem por duas pessoas,
> congelamento de movimentação, fluxo formal de dupla aprovação (existe dupla permissão, não duas
> assinaturas), relatório de acuracidade, e-mail do resultado.
> **Números (medidos no fechamento, 2026-08-22):** `test:api` **103/103 arquivos OK**,
> `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**,
> `test:sqlite` **3/0**; client **373 testes em 29 suítes**, build `CI=true` concluído sem
> warning (exit 0).)
> Antes: 2026-08-22 (**Etapa 9b fechada — ferramentas e calibração,
> `d644827..b8e6f60` + commits de documentação. A feature 16 vira 🟢.**
> **O que a Etapa 9b entregou:** o subsistema de ferramentas (antes: 57 linhas sem teste, sem
> Zod, com corrida SELECT-depois-UPDATE, sem auditoria, gate emprestado do estoque) virou
> patrimônio emprestável completo. Máquina de estados explícita (`toolStateMachine.js`) com toda
> transição por **claim** no WHERE; calibração com vencimento **lida da última calibração** (sem
> coluna-cache) barrando o empréstimo; avaria/perda com foto encerrando o empréstimo aberto no
> mesmo ato; bloqueio/manutenção/reencontro com justificativa auditada; ação de perfil própria
> `gerenciar_ferramentas`; Zod e auditoria em toda escrita; tela `/almoxarifado/ferramentas` com
> três visões. **Revisão final de branch** (depois do merge de todas as tasks) achou 4 Important
> que nenhum gate por-task pegou — todos do mesmo padrão, "contrato congelado honrado por um lado
> só": filtro `busca`/`exige_calibracao` que o front mandava e o backend nunca lia; corrida
> `devolverFerramenta`↔`registrarOcorrencia` que podia corromper o status (UPDATE incondicional de
> um lado, restauração para o estado errado do outro); `PUT`/409 de ferramenta sem nenhum teste; e
> o badge "Vencido" do front comparando instante UTC contra a comparação por-data do servidor —
> todos corrigidos e um re-review escopado confirmou zero residual. **Pendências declaradas, para
> a letra B do fechamento:** job de lembrete de devolução sem canal de notificação (função pura
> pronta, aguarda feature 20/e-mail feature 19); UI de edição de ferramenta (backend testado, só
> falta o formulário — achado da revisão final, D9 do design corrigido).
> **Números (medidos no fechamento, 2026-08-22):** `test:api` **98/98 arquivos OK** (inclui o
> novo `toolFerramentaEdicao.api.test.js`), `test:almoxarifado` **42/0**,
> `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **3/0**; client **357 testes
> em 28 suítes**, build `CI=true` concluído sem warning (exit 0).)
> **O que a etapa entregou:** o retalho virou **estoque de verdade** — material normal no motor,
> creditado pelo tipo novo `ENTRADA_RETALHO` (dedicado, sem custo, nascido nas fontes únicas
> `movementTypes`/`TIPOS_DEDICADOS`), com a tabela `sobras_material_almoxarifado` **reformada**
> como anexo dimensional (colunas novas por `safeAlter`; `POST /sobras` avulso **aposentado**; o
> único caminho de criação é o evento composto `gerarRetalho`, com guarda de dono própria e
> compensação no padrão 8b/8c). E o sucateamento virou **processo com dupla aprovação**: `SUCATA`
> saiu do formulário genérico de Movimentações (entrou em `TIPOS_DEDICADOS` — sem isso o teste
> exigido pela spec, "sucatear sem aprovação falha", seria impossível por construção), e a baixa
> só sai pelo motor na **segunda assinatura** de duas pernas segregadas
> (`aprovar_sucateamento` = ADMINISTRADOR/ALMOXARIFE; `aprovar_sucateamento_gestao` =
> ADMINISTRADOR/GESTOR; solicitante não assina; a mesma pessoa não assina as duas — a barreira
> repetida no WHERE do claim depois que o review provou o TOCTOU; a suíte tem teste de corrida
> determinístico, e a sonda de 500 execuções do fix round — não versionada — mediu 0 furos).
> Destino final VENDIDA (valor + comprovante multipart) ou DESCARTADA; relatório
> `sucata-financeiro` lendo o **livro** (inclui a devolução-destino-sucata da Etapa 7 — o
> consumidor declarado da spec 12), com valoração pelo custo atual e nota de limitação. Tela nova
> `/almoxarifado/sobras` com as visões Retalhos e Sucateamentos, etiqueta de retalho com QR
> (paga a pendência da 6c) e hint não bloqueante de retalho disponível na SAÍDA.
> **Decisão endossada em review (documentada na spec 15):** sem pré-checagem de disponível na
> aprovação final — o motor é o checador e a compensação da assinatura cobre a corrida; repetir a
> conta seria segunda fonte da regra que `availabilitySql.js` unificou.
> **Pendência nova nomeada (spec 15):** não existe guarda automática "todo tipo novo de
> `TIPOS_MOVIMENTO` precisa estar em `movementTypes.TIPOS_ENTRADA`/`TIPOS_SAIDA`" — a sabotagem
> da Task 2 provou que o teste da equação por cliente **não pega** esse esquecimento (ele itera a
> própria lista da fonte única); construir a guarda exige lista de exceções nomeadas, design em
> aberto. Outras pendências registradas na spec 15: coluna `foto` da sobra sem escritor,
> `ENTRADA_RETALHO` sem lote quando o material-retalho controla lote (mesma isenção declarada da
> spec 10), `valor_venda` aceito em DESCARTADA, e-mail → feature 19.
> **Números (medidos no fechamento, 2026-08-16):** `test:api` **90/90 arquivos OK**,
> `test:almoxarifado` **42 passou / 0 falhou**, `test:validation` **4/0**, `test:safealter`
> **3/0**, `test:sqlite` **3/0**; client **344 testes em 27 suítes**, build `CI=true` concluído
> sem warning (exit 0).)
> Antes: 2026-08-13 (**Etapa 8c fechada — transformação no terceiro,
> `753d23b..61c6f52`.** Com ela a **feature 14 fica completa (🟢)**: a 8b entregou a metade em que
> **o mesmo material volta** (galvanização, pintura, tratamento) e a 8c entrega a metade em que
> **volta outra coisa** — corte, dobra, usinagem: sai 1 chapa e voltam N peças mais uma sobra.
> **O que não existia até aqui:** toda movimentação do módulo é sobre **um** `material_id`, e o
> retorno da 8b recusava material diferente por regra explícita. A 8c abriu o caso pelo único
> caminho em que "creditar outro material" não é estoque do nada: a baixa da chapa e o crédito das
> peças acontecem no **mesmo evento** — `CONSUMO_TERCEIRO` tira a chapa do patrimônio **e** da
> retenção no mesmo UPDATE, e o tipo novo **`RETORNO_TRANSFORMACAO`** (`9c7ec75`) credita cada
> resultado. `retornos_remessa_item_almoxarifado` ganhou três colunas
> (`tipo_resultado` `PECA`/`SOBRA`, `custo_unitario_aplicado`, `movimentacao_consumo_id` — o
> agrupador do evento), todas por `safeAlter`, com **`NULL` significando "retorno simples, não é
> transformação"** (não é buraco de migração: é o valor certo, e é o que separa os dois mundos sem
> tabela nova e sem backfill). Custo rateado por função **pura** (`services/almoxarifado/transformCost.js`,
> `ratearCusto`/`calcularRendimento`): **peça recebe rateio, sobra entra a custo ZERO** (tratamento
> conservador de retalho — o patrimônio nunca infla). Rota dedicada
> `POST /remessas-terceiros/:id/transformacoes` (gate `remessar_terceiro`), tipo em
> `TIPOS_DEDICADOS` — **fora** da rota genérica de movimentação —, guarda própria de dono
> (`assertMesmoDonoNaTransformacao`: a peça tem de ter o **mesmo** dono da chapa, senão a
> transformação converteria material de cliente em patrimônio da GMP), e modal de transformação com
> N resultados, classificação e rendimento (`61c6f52`).
> **Três correções de defeito ANTIGO, achadas pela execução e feitas em commits próprios:**
> (1) o **recebimento por NF passou a alimentar o custo médio** (`8cd3fcf`) — até aqui o **único**
> caminho que movia `custo_medio` no sistema inteiro era a movimentação manual com custo digitado à
> mão, e com o custo médio quase nunca alimentado o rateio da 8c distribuiria R$ 0,00; (2) a leitura
> de custo virou **fonte única** (`services/almoxarifado/custoSql.js`, `a644ab7`) porque
> `COALESCE(custo_medio, custo_unitario, 0)` devolvia **0** (a coluna é `REAL DEFAULT 0`, não NULL)
> e **valorava a zero o acervo inteiro** nos relatórios; (3) as listas de tipos que somam/subtraem
> saldo viraram **fonte única** (`services/almoxarifado/movementTypes.js`, `3ef0144`) — eram quatro
> cópias, e o espelho do `clienteEstoqueService` ficou para trás **duas vezes seguidas** (8b e 8c),
> fazendo a posição por cliente mentir sem quebrar teste nenhum. **Números:** `test:api`
> **81/81 arquivos OK**, `test:almoxarifado` **42 passou / 0 falhou**, `test:validation` **4/0**,
> `test:safealter` **3/0**, `test:sqlite` **3/0**; client **283 testes em 25 suítes**, build
> `Compiled successfully.`
> **Pendências que continuam abertas:** "uma remessa não mistura donos" segue **deduzida e sem
> resposta do cliente**; o `AJUSTE` (e o `aplicar_ajustes` da conferência) continua sem reconciliar
> nenhuma das **quatro** retenções — a 8c **não piorou e não ajudou**; as categorias hardcoded do
> front continuam duplicadas (a 8c **encostou** nelas e não resolveu — a sobra usa categoria que já
> existe no seed); e o **rendimento é calculado, mostrado num toast e jogado fora** (não há coluna
> que o guarde — `movimentacao_consumo_id` é o agrupador que um relatório futuro usaria).
> **Próxima etapa da ordem — PRECISA SER DECIDIDA, e este arquivo sozinho não decide.** Pelo
> roteiro abaixo, a próxima da fila é a **Etapa 9 — retalhos e ferramentas** (features 15 e 16), e a
> 8c a aproximou (a sobra já nasce como material normal na categoria "Sucata e sobras
> reaproveitáveis"). Mas o briefing de fecho da 8c
> ([plano](../../docs/superpowers/plans/2026-08-13-almoxarifado-etapa8c-transformacao.md), seção
> final) lista candidatas **concorrentes por dívida acumulada** — a decisão do cliente sobre
> `AJUSTE` × retenção (pergunta de negócio, não código) e as categorias hardcoded. Seguir a ordem
> ou pagar a dívida é escolha de quem pegar; **não presuma a Etapa 9 sem confirmar.**)
> Antes: 2026-08-12 (**Etapa 8b fechada — remessas a terceiros,
> `0a01124..b176212`.** A feature **14 vira 🟡** (ciclo de remessa/retorno completo; a
> **transformação** é a Etapa 8c). O material que a GMP manda beneficiar fora deixou de sumir do
> controle: ganhou a **quarta coluna de retenção** `materiais_almoxarifado.quantidade_em_terceiros`,
> que o tira do **disponível** sem tirá-lo do **patrimônio**.
> **A armadilha central da etapa, e o que se fez com ela:** a conta `atual − reservada − bloqueada −
> em_inspecao` estava **replicada 14 vezes** — a função `getSaldoDisponivel` mais **13 queries
> escritas à mão**, em **8 arquivos**, incluindo `clienteEstoqueService.js` (que *nós* criamos na
> Etapa 8) e `routes/requisicoesMaterial.js` (que **nem pertence ao módulo**). Acrescentar a coluna
> em 13 e esquecer 1 não quebraria nada: o sistema passaria a **recusar pela função e aceitar pelo
> SQL**, com o número errado em silêncio. **O design dizia SETE** e foi corrigido para quatorze
> (`742b9ea`) — segundo erro do mesmo tipo em duas etapas seguidas. A resposta não foi contar
> melhor: a conta passou a existir **num lugar só** (`services/almoxarifado/availabilitySql.js`) e
> o teste **varre o código-fonte** provando que sobrou zero réplica.
> Entregue: conferência de inventário descontando **só** `quantidade_em_terceiros` (as outras três
> continuam somando, porque aquele material **está** na prateleira — "bloqueado" é estado
> administrativo, não ausência física) · três tabelas + `thirdPartyStateMachine.js`
> (`ABERTA → ENVIADA → RETORNO_PARCIAL → ENCERRADA/CANCELADA`) · **quatro tipos de movimento**
> (`REMESSA_TERCEIRO`/`RETORNO_TERCEIRO` retêm; `PERDA_TERCEIRO`/`CONSUMO_TERCEIRO` baixam físico e
> retenção no mesmo UPDATE) · envio **tudo-ou-nada** · retorno parcial com teto por item ·
> encerramento com **destino obrigatório** + justificativa · cancelamento estornando **só o que
> ainda está lá fora** · ação de perfil `remessar_terceiro` · sete rotas + `GET /vencidas` · tela
> `/almoxarifado/remessas-terceiros` + PDF no navegador.
> **Correção declarada de spec:** o checklist da feature 14 dizia *"envio = saída para localização
> virtual 'Em terceiros' (saldo visível mas não disponível)"* — **está errado**: `getSaldoDisponivel`
> calcula sobre o escalar `quantidade_atual`, então material numa localização virtual continuaria
> **disponível para saída**; a solução proposta não entregava o requisito que ela mesma enunciava.
> **Três defeitos que só a execução achou** (leitura e suíte verde não achavam): a pré-checagem do
> envio comparava **cada linha sozinha** e deixava a remessa sair pela metade (medido: 60 retidos,
> item 1 enviado, item 2 não, remessa parada em ABERTA); a mensagem do teto do retorno dizia o
> número **errado** quando o item aparecia em duas linhas; e o encerramento com **vários** itens
> pendentes baixava só o primeiro. **Números:** `test:api` **74/74 arquivos**, `test:almoxarifado`
> **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **3/0**; client
> **268 testes em 24 suítes**, build `Compiled successfully.`
> **Pendências:** o `AJUSTE` não reconcilia retenção — agora em **três** caminhos (bloqueado da
> Etapa 7; `aplicar_ajustes` da conferência, que grava `quantidade_atual` fora do motor; e a coluna
> nova) — a decisão continua sendo **do cliente**; "uma remessa não mistura donos" foi **deduzida** e
> **não confirmada** com a GMP; o Step 11 da Task 9 (cor dos badges e PDF no navegador) **não foi
> executado**; e toda coluna nova de `materiais_almoxarifado` **vaza** para o requisitante até ser
> nomeada em `SENSITIVE_MATERIAL_FIELDS`.
> **Próxima etapa da ordem: Etapa 8c — transformação** (chapa → peças cortadas + sobra). *(Frase da
> época; a 8c foi entregue em 2026-08-13 — ver a entrada mais recente, acima.)*)
> Antes: 2026-08-12 (**Etapa 8 fechada — materiais de clientes,
> `f26b635..5b5eb55`.** A feature **13 vira 🟢**; a **14 é a Etapa 8b**, próxima da ordem. Material
> de cliente deixou de ser ilha (`materiais_cliente_almoxarifado`, texto livre, sem FK, sem motor)
> e virou **material normal com dono**: `materiais_almoxarifado.proprietario_cliente_id`
> (`NULL` = nosso), com lote, série, endereço, extrato, etiqueta e livro. Entregue: auditoria
> nomeada de **40 leituras** da tabela em três classes (A filtra, B leitura por id não filtra,
> C mistura de propósito e ganha selo) · invariante com **controle positivo obrigatório** ·
> guarda do dono na saída, com a **emergencial NÃO furando** (exceção deliberada ao padrão do
> módulo) · ação `ajustar_material_cliente` verificada **dentro do motor**, porque o AJUSTE chega
> por duas rotas · recebimento de material de cliente exige documento · tipo `DEVOLUCAO_CLIENTE`
> com rota dedicada · ilha aposentada (rotas e serviço saem, **tabela fica**) · tela
> `/almoxarifado/materiais-cliente` com posição por cliente e PDF · selo de propriedade **nomeando
> o cliente** em Materiais, Movimentações e Extrato. **Duas correções declaradas de spec:** a spec
> de design mandava auditar o lugar errado (`9d70d8c` — a contagem de 19 varria só o subdiretório
> `routes/almoxarifado/` e deixava de fora o dashboard e o `posicao-estoque`), e a spec 13 exigia
> **projeto na entrada**, o que está errado (o mesmo cliente manda a mesma chapa para dois
> projetos; o projeto é exigido na **saída**). Números: `test:api` **68/68 arquivos**,
> `test:almoxarifado` **42/0** (um a menos que os 43 da Etapa 7 — o teste do serviço da ilha saiu
> junto com o serviço, e isso é correto), `test:validation` **4/0**, `test:safealter` **3/0**,
> `test:sqlite` **3/0**; client **234 testes em 22 suítes**, build `Compiled successfully.`
> **Pendência que precisa ser lida antes do deploy:** a **conferência de inventário**
> (`routes/almoxarifado.js:941`, `aplicar_ajustes`) grava `quantidade_atual` **fora do motor**,
> logo **fora** da permissão `ajustar_material_cliente` — é um caminho real por onde o saldo de
> material de cliente muda sem a autorização especial. E a confirmação de que
> `materiais_cliente_almoxarifado` está vazia **em produção** continua em aberto (a medição de 0
> linhas cobriu só o banco de dev; nenhuma linha é apagada pela etapa).
> **Próxima etapa da ordem: Etapa 8b — materiais em terceiros** (spec 14).)
> Antes: 2026-08-12 (**Etapa 7 fechada — transferências e devoluções,
> `29524fc..0722bfd` + os consertos `eabd848`/`7fc1b7f` e `d117dc2`.** Features **11 e 12 viram
> 🟢**. Backend: `TRANSFERENCIA` em `REGRAS_VINCULO` e guarda de `exigeLote` alcançando o ramo
> próprio do motor; devolução com `movimentacao_saida_id`/`lote_id`, validação do vínculo, herança
> de lote, série nos destinos `ESTOQUE`/`QUARENTENA`, e a rota `GET /devolucoes/saidas-elegiveis`.
> Cliente: `TRANSFERENCIA` entra no formulário de Movimentações e `DEVOLUCAO` sai dele; tela nova
> `/almoxarifado/devolucoes` (code-split em `routes/lazyModules.js`). **Um bug de saldo corrigido em
> commit próprio antes das features:** devolver para sucata baixava o estoque duas vezes — a spec 12
> descrevia o comportamento errado como certo, e a correção da spec diz isso com todas as letras.
> **O "em trânsito" da spec 11 foi CORTADO por decisão do cliente** (site único), não esquecido.
> Números: `test:api` **59/59 arquivos**, `test:almoxarifado` **43/0**, `test:validation` **4/0**,
> `test:safealter` **3/0**, `test:sqlite` **3/0**; client **196 testes em 17 suítes**, build
> `Compiled successfully.` **Duas pendências novas registradas:** `AJUSTE` não reconcilia
> `quantidade_bloqueada` (spec 03) e o `ESTADO_PARCIAL` da devolução não notifica ninguém (spec 12).
> **Próxima etapa da ordem: Etapa 8 — materiais de clientes** (spec 13); a Etapa 8 original foi
> **dividida** em 8 (clientes) e 8b (terceiros).)
> Antes: 2026-08-11 (**Etapa 6c fechada — etiquetas com QR Code em PDF,
> `35967b9..0785119`.** Feature 10 fica **completa por inteiro** (lote + série + etiqueta física
> com QR) — as três partes entregues. Zero mudança de servidor: util client
> `utils/etiquetasPdf.js` (formatos A4/térmica, montadores, renderizador `jspdf`+`qrcode`) + modal
> compartilhado com formato lembrado em `localStorage` + botões em Materiais/Lotes e
> Séries/Recebimentos + deep-link com destaque. Testes client: 11+9+7 novos; suíte client 177/177
> (16 suítes), build CI limpo; suítes de servidor inalteradas (`test:api` 56/56,
> `test:almoxarifado` 43/43, `test:validation` 4/4, `test:safealter` 3/3, `test:sqlite` 3/3) — a
> etapa não tocou uma linha de `server/`. Critério de aceite "rastrear lote e número de série"
> passa a incluir a etiqueta física, atendido por completo. **Próxima etapa da ordem do plano
> mestre: Etapa 7 — transferências e devoluções** (specs 11 e 12, já auditadas em 2026-08-11).)
> Antes: 2026-08-11 (**review final do branch da Etapa 6b**: Critical de costura corrigido — estorno de saída não tinha guarda simétrica à de entrada e corrompia o invariante `COUNT(série)==quantidade_atual` quando a série reentrava manualmente antes do estorno da saída original; guarda adicionada em `cancelarMovimentacao`. Mais 3 afirmações erradas de doc corrigidas: "motor integrado a requisições/inspeção" — não é, os dois são isentos; filtro de texto no seletor de série da saída e coluna "última entrada/saída" na aba Séries — nenhum dos dois existe; hash do teste de recebimento de série corrigido de `597ec82` para `400bb15`)
> Antes: 2026-08-11 (**Etapa 6b fechada** — números de série: backend + UI + docs, `418d617..b46d820`; feature 10 vira 🟢, critério de aceite "rastrear lote e série" atendido, próxima é a Etapa 6c/etiquetas)
> Antes: 2026-08-11 (auditoria spec×código das 24 features — 4 agentes varreram cada README contra o código; specs corrigidas onde mentiam, e o bug de front que a auditoria achou — tela de requisições sem os status de reserva da Etapa 4 — foi corrigido em `92fe236`)
> **Regra de ouro:** toda regra essencial de funcionamento nasce com teste de API. Nenhuma feature é marcada como ✅ sem teste passando.

## Como usar esta pasta

- Cada subpasta = **uma feature**. Dentro dela: `README.md` com status, checklist do que existe/falta, regras essenciais + testes exigidos, e dependências.
- Ao trabalhar numa feature em qualquer sessão: **abrir o README dela, atualizar os checkboxes ao concluir cada item e a data de atualização**. O checklist é a fonte da verdade do progresso.
- Quando uma feature entrar em desenvolvimento, escrever o plano detalhado de implementação (tarefas TDD passo a passo) em `docs/superpowers/plans/` e linkar no README da feature.
- Status: ✅ completo (com testes) · 🟡 parcial · ❌ ausente

## Mapa de features e status atual (2026-08-16)

| # | Feature | Backend | Frontend | Testes | Status |
|---|---------|---------|----------|--------|--------|
| 00 | [Fundação técnica](00-fundacao-tecnica/README.md) | ✅ | ✅ | ✅ | 🟡 quase completa (2026-08-03: Tasks 1-6 entregues). Decisões já tomadas: validação = **Zod** (2026-08-03, express-validator removido), SMTP hardcoded **mantido por decisão do dev**. Auditoria 2026-08-11: o ledger de migrações (item 0.4) estava desmarcado mas em uso desde a Etapa 2; restam **21 `ALTER TABLE` residuais com erro engolido** em `routes/almoxarifado.js` — pendência nomeada na spec |
| 01 | [Cadastros de materiais](01-cadastros-materiais/README.md) | 🟡 | 🟡 | 🟡 | 🟡 Etapa 2 entregue (2026-08-04): campos técnicos/reposição/controles/ABC/unidades, subfamílias (`parent_id`), auditoria de criação/edição, form em 6 seções; falta tabela de conversões, categorias hardcoded do front, `almoxarifadoApi.js`. Correção 2026-08-11: a spec dizia que `controle_lote`/`controle_certificado` não tinham verificação efetiva — têm desde a Etapa 6 (`controle_validade`/`controle_serie`/`controle_corrida` seguem mortas, Etapas 6b/6c). **Etapa 8c, Task 1 (2026-08-13, `028da1e`):** criar material **deixou de ser um `INSERT` inline no handler HTTP** e virou `services/almoxarifado/materialService.createMaterial` (o gate `criar_material` fica na rota, de propósito); e `GET /proximo-codigo` **deixou de usar `ORDER BY id DESC`** — que devolvia o código do registro de maior `id`, **não** o de maior número — passando ao **MAX do sufixo numérico**, com o campo novo `codigo_auto` + retry sob UNIQUE para cadastro em lote. **Etapa 26 (2026-08-29, `1bca087..9d86a84`):** a pendência das **categorias hardcoded no front FECHOU** — estava aberta desde a Etapa 2 e a 8c encostou nela sem resolver. As **três** telas (`MateriaisAlmoxarifado.js`, `MaterialAlmoxarifadoForm.js`, `ConferenciaEstoque.js`) passaram a ler o catálogo pelo hook único `hooks/useCategoriasMaterial.js`; o catálogo virou **cadastro editável** (POST/PUT/DELETE com gate `configurar`, soft delete, `CREATE UNIQUE INDEX` no nome, auditoria com entidade `categoria`) e ganhou a aba **Categorias** em Configurações, com reativar. Dois defeitos achados ao medir: o select **mostrava a primeira opção da lista** para material gravado com categoria fora dela (a tela mentia sobre o banco), e material salvo sem categoria virava `OUTROS` **pelo servidor** (`materialService:179`). **Continua 🟡:** fecha um item do checklist de Frontend; seguem abertos tabela de conversões, grupo acima de família, motivos/transportadoras/tipos de documento, `almoxarifadoApi.js` e anexos na tela. **Nenhum material foi migrado, de propósito** — consulta A6 do documento de apresentação |
| 02 | [Localizações e endereçamento](02-localizacoes-enderecamento/README.md) | 🟡 | 🟡 | 🟡 | 🟡 Etapa 2 entregue (2026-08-04): multi-almoxarifado (entidade raiz + migração ledger), bloqueio/restrição de tipo aplicados no motor, exclusão com saldo bloqueada, consultas de vazias/sem-endereço; falta capacidade/peso enforcement, sugestão de localização, leitura por confirmação. **Decisão de negócio (2026-08-05): almoxarifado é área física de alocação dentro do mesmo site, não filial — o cliente tem uma única filial. Saldo global por material (sem recorte por almoxarifado) é intencional e NÃO é lacuna; não propor segregação de saldo nem seletor de almoxarifado em movimentação/requisição** |
| 03 | [Motor de estoque](03-motor-estoque/README.md) | ✅ | ✅ | ✅ | 🟢 Etapa 1 entregue (2026-08-04); a validação de vencido/lote reprovado que faltava **foi entregue na Etapa 6, Task 3** (`65d78fd`+) e a liberação de vencimento na Task 3b (`556f86d`). **Etapa 8b (2026-08-12):** a fórmula do disponível ganhou a **quarta retenção** (`quantidade_em_terceiros`) e deixou de ser replicada — a conta agora mora só em `services/almoxarifado/availabilitySql.js` (`0a01124`), e quatro tipos de movimento novos entraram no motor (`e0be211`). **Etapa 8c (2026-08-13):** tipo de movimento novo **`RETORNO_TRANSFORMACAO`** (`9c7ec75`) — **entrada**, aceita custo (alimenta a média ponderada do material de destino), em `TIPOS_DEDICADOS` (fora da rota genérica) e em `TIPOS_ISENTOS_DONO`. Mais **duas fontes únicas** criadas por tarefas extras do mesmo dia, ambas nascidas da execução e não do plano: `services/almoxarifado/custoSql.js` (`a644ab7`) — a leitura de custo, que por `COALESCE(custo_medio, custo_unitario, 0)` valorava a **zero** o acervo inteiro (a coluna é `REAL DEFAULT 0`, não NULL) — e `services/almoxarifado/movementTypes.js` (`3ef0144`) — as listas de tipos que somam/subtraem saldo, que eram **quatro** cópias e faziam a posição por cliente mentir sem quebrar teste. Pendência nomeada e ainda aberta: `PUT /conferencias/:id/concluir` escreve `quantidade_atual` por fora do motor (anterior à Etapa 6) — e isso alcança também a retenção nova |
| 04 | [Requisições](04-requisicoes/README.md) | 🟢 | 🟢 | 🟢 | 🟢 Etapa 3 entregue (2026-08-05): ciclo ponta a ponta rascunho→envio→aprovação→separação→retirada→entrega→confirmação→encerramento; entrega/estorno via motor de estoque; máquina de estados explícita; falta lote/série na entrega, anexos e importação de BOM/OP. Correção 2026-08-11 (`92fe236`): a tela não conhecia os status de reserva da Etapa 4 — requisição aprovada com saldo ficava com badge cru, sem "Iniciar Separação" e sem "Cancelar"; corrigido com teste (`RequisicoesList.test.js`) |
| 05 | [Separação e picking](05-separacao-picking/README.md) | 🟡 | 🟡 | 🟡 | 🟡 **com dono e segunda conferência — Etapa 28 (2026-08-29, `9cef003..62cb2b1`):** rodada de separação com autor (append-only), separação/liberação auditando, `conferir-separacao` com barreira por identidade em qualquer rodada (`NOT EXISTS` no `WHERE`), obrigatória para liberar e entregar com crítico na caixa (B62); tudo-ou-nada no laço de separação e teto do separado para crítico na entrega (fix-round `5a3d593`). **Falta para 🟢:** lista de separação como entidade, rota de picking, registro por item (localização/lote), divergência com motivo, kits e localização de kit (enum), tela de fila. Antes: 🟡 básico (spec revisada 2026-08-11 — estava congelada em 2026-08-02: liberar-retirada já existia desde a Etapa 3, e desde a Etapa 4 o disponível baixa na **aprovação** via reserva, não na separação) . **Fase 0 da Etapa 28 (2026-08-29) mediu esta feature e NÃO a mudou de cor — mas corrigiu a spec em dois pontos.** (a) A spec afirmava que `TIPOS_LOCALIZACAO` "já contempla tipos que servem para Reservado/Kit/Aguardando retirada"; **ESTAVA ERRADO** — nenhum dos três existe no enum (`schema.js:21-26`), e o item que depende disso exigiria **estender um contrato de API** (`localizacoes_tipos`), não "validar na implementação". (b) O **bloqueio real** de três itens do checklist não estava nomeado: **a separação não tem autor e não deixa rastro** — `separarRequisicao` não recebe `user`, `handleSeparacao` não repassa `req.user`, `requisitionService.js` tem zero chamadas de auditoria e `auditLabels.js` tem zero verbos de separação (contados). Sem esse campo, "responsável pela separação" e "segunda conferência (conferente ≠ separador)" **não têm como existir**. É o escopo proposto para a **Etapa 28**, com o molde pronto na dupla assinatura do sucateamento |
| 06 | [Motor de aprovações](06-aprovacoes/README.md) | 🟡 | 🟡 | 🟡 | 🟡 Etapa 3 entregue (2026-08-05): segregação (solicitante não aprova a própria), rejeição justificada, emergencial com justificativa, decisões auditadas; falta motor de regras configuráveis por tipo/valor/quantidade/projeto (tabela `regras_aprovacao` + UI — fica para demanda real) . **Fase 0 da Etapa 28 (2026-08-29): a cor NÃO muda — o motor configurável continua adiado por decisão de escopo declarada ("demanda real"), não por esquecimento — mas TRÊS itens do checklist descreviam código que já tinha mudado**, e foram corrigidos dizendo que estavam errados: *material de cliente exige autorização específica* (entregue na Etapa 8, `ajustar_material_cliente`), *sucateamento exige aprovação Almoxarifado + gestão* (entregue na Etapa 9 — **e é o motor de N aprovações que o próprio checklist diz não existir, em forma concreta de dois níveis, com segregação por identidade e fechamento atômico**) e *fila "minhas aprovações pendentes"*, cuja ressalva "hoje só a lista geral filtrada" estava errada (existe fila dedicada para a lane de valor; falta a da lane simples). **Mais dois achados novos:** `limite_aprovacao_auto` é **configuração morta** (uma única ocorrência no repositório, o próprio seed — promete aprovação automática por quantidade que não existe), e o **lembrete de requisição parada nunca alcança `AGUARDANDO_APROVACAO_VALOR`** (o filtro é `WHERE status = 'PENDENTE'`), justo a requisição de alto valor, que é a que mais precisa de cobrança |
| 07 | [Reservas de estoque](07-reservas/README.md) | 🟢 | 🟢 | 🟢 | 🟢 **Etapa 4 completa (backend 2026-08-05, tela 2026-08-06)** — consumo contra reserva (o buraco central: antes reservar tornava o saldo inutilizável até para quem reservou), reserva automática na aprovação com os status PARCIALMENTE/TOTALMENTE_RESERVADA, transferência entre projetos, expiração por endpoint (opt-in), liberação no cancelamento da requisição e tela em `/almoxarifado/reservas`. **Task 6 fechada (2026-08-06)**: `/aprovar-valor` passou a reservar e excluir requisição passou a liberar. Ressalva 2026-08-11: os status de reserva não apareciam na tela de **requisições** (feature 04) — corrigido em `92fe236`; a tela de reservas em si estava correta |
| 08 | [Recebimento](08-recebimento/README.md) | 🟡 | 🟡 | 🟡 | 🟡 **Etapa 5 entregue (2026-08-08)**: entrada de item que exige inspeção deixou de ser barrada — agora entra sempre, retida (`quantidade_em_inspecao`), via movimentação `QUARENTENA` vinculada ao recebimento; review final 2026-08-10 (`6bb455d`): entrada da nota **atômica e idempotente** (reprocessar não duplica estoque) — spec da feature atualizada em 2026-08-11, estava parada em 08-09; falta tipos de entrada (8.1) e conferência física estruturada (fora do escopo, decisão do design) |
| 09 | [Inspeção e qualidade](09-inspecao-qualidade/README.md) | 🟡 | 🟡 | 🟡 | 🟡 **Etapa 5 entregue (2026-08-08)**: decisão de inspeção real (aprovar/reprovar/parcial) com claim atômico em duas fases, bloqueio/desbloqueio avulso com justificativa obrigatória, tela `/almoxarifado/inspecoes`; falta plano de inspeção com medidas, não conformidade formal e desvio autorizado. **Etapa 24 (`a81e51a`) pagou o perfil QUALIDADE**, que esta feature nomeava como pendência desde a Etapa 5: `inspecionar` passou de `[ADMINISTRADOR, ALMOXARIFE]` para `[ADMINISTRADOR, ALMOXARIFE, QUALIDADE]`, e o perfil recebeu **só** `visualizar` e `inspecionar` — as quatro rotas de `inspecionar` foram medidas com um usuário QUALIDADE real no harness. **Ressalva declarada, que esta spec já nomeava desde 2026-08-11:** bloqueio/desbloqueio **avulso** usa `ajustar_estoque`, não `inspecionar`, então os dois botões do topo de `/almoxarifado/inspecoes` seguem barrados para QUALIDADE e `POST /materiais/:id/bloquear` dá 403 — decisão declarada na letra **B56**, e o caminho limpo, se for pedido, é uma ação própria de bloqueio por qualidade. Pendência criada: material reprovado fica bloqueado sem vínculo ao recebimento de origem até a feature 12 consumir o `encaminhamento` registrado. **Etapa 27 (`063f3ce..cdb64a6`) PAGOU OS DOIS PRIMEIROS ITENS DO CHECKLIST DE BACKEND — plano de inspeção e registro de medidas + instrumento — e a feature CONTINUA 🟡.** Entregue: `planos_inspecao_almoxarifado` com CRUD completo e **índice único parcial** `(material_id, caracteristica) WHERE ativo = 1`; `medidas_inspecao_almoxarifado` com os valores do plano **congelados no ato** (RN-05, editar o plano depois não reescreve inspeção antiga); a régua pura `toleranciaInspecao.js`; e `divergencia_dimensional` deixou de ser caixa marcada à mão e passou a ser **derivada** quando há medidas — fora da tolerância liga sozinha, dentro desliga, e a marcação do payload é **ignorada**. A integração com a **feature 16** (que esta spec afirmava não existir, ver correção da Fase 0) foi feita: instrumento que `exige_calibracao` sem `calibracaoVigente` **recusa a medida**, com a literal de `toolService.js:70`. Gate: ação **própria** `gerenciar_plano_inspecao: [ADMINISTRADOR, QUALIDADE, ENGENHARIA]` — `configurar` é `[ADMINISTRADOR]` sozinho e deixaria a QUALIDADE sem cadastrar o que ela mesma mede. **Três achados que a revisão mediu e que mudaram o projeto:** sem epsilon `1e-6`, **12,3% das peças no limite exato reprovariam** por ponto flutuante (6.132 falsos em 50.000 pares) e **cada uma ligaria a divergência sozinha** — a etapa fabricando o defeito que existe para medir; as três recusas novas rodariam **depois** do claim de saldo, contra a promessa explícita do código, e foram levadas para antes; e o `NaN` de `Number('12,4')` **NÃO reprova como o design afirmava — ele APROVA**, com `valor_medido` nulo e a divergência apagada (falsa aprovação, pior que falsa reprovação). **A Etapa 27 entregou SEM TELA** — o formulário de decisão ficou com a caixa manual (**C34**) e as medidas gravadas sem leitor (**C35**, terceira ocorrência do padrão "calculado, gravado e sem quem leia" nesta base). **Etapa 29 (`d0a9f7c..75f183f`) PAGOU OS DOIS ITENS DO CHECKLIST DE FRONTEND e FECHOU C34 e C35 — a feature CONTINUA 🟡.** Entregue: bloco **Medidas do plano** no formulário de decisão (`75f1e24`) — um campo por característica **ativa**, rótulo `caracteristica (unidade) — nominal N · faixa [inf ; sup]` com a faixa somada **COM SINAL** (`inf = nominal + desvio_inferior`; ler como `nominal − |inf|` daria `[9.995 ; 10.021]` no plano unilateral ISO 286 `+0,005/+0,021` e reprovaria peça boa) e formatada pelas **casas decimais do plano** (sem isso, o rótulo sairia `12.200000000000001` — o mesmo ponto flutuante que a Etapa 27 mediu na régua, agora na exibição); `input type="text"` porque **`valor_medido` vai como string crua** (`parseFloat` faria `12,4` virar `12` em silêncio, o oposto do que a 27 construiu); seletor de instrumento com `calibracao_vigente === false` **rotulado "(calibração vencida)" e desabilitado**; **sem plano, o formulário é idêntico ao de antes e não faz chamada a mais**. Leitura nova (`96525d5`): `GET /inspecoes/historico` (decididas, `ORDER BY data_inspecao DESC, id DESC`, filtro `material_id`, `limite` default 100/teto 500, com `medidas_total`/`medidas_nao_conformes`) e `GET /inspecoes/:id/medidas` (valores **congelados no ato**; 404 *"Inspeção não encontrada"*, inclusive para id não numérico), consumidas pela aba **Histórico** (`38e74f4`, `cf49729`). **B60 cumprida em 2 de 3 partes:** a caixa *Divergência dimensional* fica **desabilitada e desmarcada** com ≥1 medida e a flag manual **nem entra no payload**; a terceira parte (pré-visualizar o resultado ao digitar) foi **DESCARTADA de propósito** — exigiria uma segunda cópia da régua, e a versão ingênua erra 12,3% no limite; o resultado vem do servidor no toast (*"Inspeção registrada! Divergência dimensional: sim (2 medidas)"*). **Decisão minha, reversível (B64):** as duas leituras novas são `auth` **sem gate de perfil** — mesma régua de `/planos-inspecao` e `/pendentes` —, e o mesmo usuário sem perfil toma **403** ao decidir, provado por teste. **O que falta para 🟢 (spec 09, seção própria, agora QUATRO + um item novo):** não conformidade formal, liberação sob desvio autorizado, anexos (é o que impede o item "plano/medidas/fotos" de estar inteiro), encaminhamento com status, e **cadastro do plano PELA TELA** — item novo criado pela 29, porque enquanto o plano só nascer por API o bloco de medidas não aparece para ninguém. **Etapa 30 (`af7adea..7982f18`) PAGOU O CADASTRO DO PLANO PELA TELA — a feature CONTINUA 🟡, mas sem nenhum item de UI pendente no ciclo dimensional.** `PlanoInspecaoModal.js` (novo, `dedb208`) aberto pelo botão *Plano de inspeção* de cada linha de Materiais (`6b84107`): criar/editar/desativar/**reativar** característica, faixa `[nominal+inf ; nominal+sup]` calculada ao lado enquanto se digita (via `faixaTolerancia.js` — **uma cópia só**, a Etapa 29 fundiu as duas que divergiam), `valor_nominal: 0` aceito (batimento/planeza), vírgula convertida na tela com mensagem própria para o que não é número, e **nenhum `''`/`null` num campo numérico do PUT** — o POST tem `?? 0` e o PUT **não** (`:329` vs `:377-382`), então `desvio_inferior: ''` daria 400 *"Desvio inválido"* ao limpar um desvio para zerá-lo. **Nenhuma linha de backend mudou:** a Task 3 é **um cenário** no arquivo existente (22 → 23, `41b576c`), a **colisão da reativação** — recriar o nome de uma desativada (201, o índice único é parcial) e reativar a antiga → 400 literal; é o único ponto que os 22 cenários da Etapa 27 não cobriam, e a versão anterior do plano afirmava, **erradamente**, que eles não cobriam reativar (o cenário 16 cobre). **Decisão minha (B65):** a tela repete a régua de **nome duplicado** do servidor, só pela mensagem (o 400 do índice não explica nada sob um botão "Reativar"), com comparação de texto **exata** — sem `toLowerCase`/`normalize` —, porque o índice é **BINARY** e `RUGOSIDADE` ao lado de `Rugosidade` é **aceito**; comparação "amigável" faria a tela barrar o que o servidor aceita. Isso **não** contradiz a B60: igualdade de texto sobre dados que a tela tem inteiros é exatamente reproduzível, e a régua da tolerância nunca foi. **Fix-round `7982f18`, da revisão adversarial:** quatro ações de `ACAO_PERFIS` sem rótulo em `permissaoErro.js` (`gerenciar_plano_inspecao` — inalcançável até esta etapa criar o único botão que a dispara —, `conferir_separacao`, `remessar_terceiro`, `ajustar_material_cliente`), e `faixaTolerancia.js` errando com texto de formulário. **O que falta para 🟢 é fluxo de negócio, não tela:** não conformidade formal, liberação sob desvio autorizado, anexos e encaminhamento com status. **Não contam para a cor:** plano por família (**B59**), instrumento obrigatório (**B61**) e a ressalva do bloqueio avulso (**B56**)  **Etapa 32 (`e708125..fd71958`) PAGOU OS ANEXOS — a feature CONTINUA 🟡, e agora faltam TRÊS itens, todos fluxo de negócio.** Certificado, relatório dimensional e fotos ficam presos à inspeção, na **linha expandida da aba Histórico** — e não no formulário de decisão, como o design afirmava: `inspecoes_recebimento_almoxarifado` só ganha linha **dentro** da decisão (`inspectionService.js:268`), então a fila de pendentes trabalha com `item_id` e não existe `entidade_id` para usar antes disso. O plug **não** é `somenteLeitura`, porque certificado e relatório chegam **depois** da decisão — um plug de leitura deixaria a etapa com backend inteiro e zero superfície para anexar. Consequência declarada: a linha do histórico **sem medidas** passou a expandir (antes não expandia), com a mesma affordance da linha com medidas — prender o anexo à existência de plano dimensional o tornaria inalcançável na maioria das inspeções. **Download é autenticado** (`GET /almoxarifado/anexos/:id/arquivo`, gate `visualizar`) e o arquivo mora em diretório **irmão** de `uploads/almoxarifado`, fora de todo `express.static` — os uploads **legados** continuam públicos, furo **C42**, defeito anterior a esta etapa. **Cada download fica na trilha** (`BAIXAR_ANEXO`, a única leitura auditada do módulo), porque os ids são sequenciais e um laço levaria o acervo inteiro sem rastro. Duas ações novas: `anexar_documento` (todos menos CONSULTA) e `remover_anexo` (ADMINISTRADOR e ALMOXARIFE) — assimetria deliberada, tirar certificado de vista é apagar evidência. **O que falta para 🟢:** não conformidade formal numerada, liberação sob desvio autorizado e encaminhamento com status |
| 10 | [Lotes, séries e etiquetas](10-lotes-series-etiquetas/README.md) | 🟢 | 🟢 | 🟢 | 🟢 **As três partes completas: Etapa 6 + Task 9 (2026-08-09, `b7035dd..9406bff` + `09c75d2`); Etapa 6b — série, backend + UI (2026-08-11, `418d617..b46d820`); Etapa 6c — etiquetas com QR, 100% client (2026-08-11, `35967b9..0785119`).** Lote deixou de ser texto livre: tabela `lotes_almoxarifado` + `lotService` dono do ciclo de vida, saldo referenciando o lote por FK (`lote_id`) e sem as 3 colunas de retenção que nunca tiveram escritor, saída validando status/validade/saldo **do próprio lote** (o bug do −8 em silêncio), `controle_lote` e `controle_certificado` acesas (Etapa 6), lote nascendo no recebimento, FEFO na API e na tela, e liberação de vencimento com justificativa auditada (Task 3b). **Série é entidade real, com UI completa** (Etapa 6b): tabela `series_almoxarifado`, `seriesService` completo (leitura/entrada/saída/reversões/bloqueio/mudança de status), motor integrado a movimentações manuais e recebimento — requisições e inspeção seguem isentos, ver pendências (a)/(b) da 6b na spec 10 —, duas rotas HTTP, e telas — Movimentações (textarea+gerador na entrada, seletor filtrado por lote na saída), Recebimentos (textarea de séries por item), aba "Séries" dentro de "Lotes e Séries" (bloquear/desbloquear com justificativa), hint da flag no formulário de material, KPI no extrato. **A ressalva que sobra:** o modal rápido de entrada/saída da tela de Materiais (rota v1) continua sem campo de série e sempre recusa material controlado — use Movimentações. **A Task 9 fechou a lacuna que a Etapa 6 deixou**: tela `/almoxarifado/lotes` (mudar status, liberar vencimento, anexar certificado — o caso que destravava material preso por `controle_certificado`) e Sucata/Perda selecionáveis na Movimentação. **A Etapa 6c fecha a feature**: PDF de etiqueta (A4 em grade ou térmica 100×50) gerado inteiro no client, com QR que abre a tela do item já filtrada e destacada — código GMP, nome truncado e a linha de lote/série vão para o papel; o resto fica atrás do QR de propósito (overload de informação era o erro a evitar). Zero mudança de servidor. **Faltam:** extrato agregado do lote, as flags `controle_validade`/`controle_corrida` continuam mortas, etiqueta de retalho (aguarda UI da feature 15), etiqueta de localização (cortada de propósito — o mapa já cobre). Pendências abertas: extrato agregado do lote, lote/série automáticos nos 4 fluxos internos + transferência, reprovação por lote/série não ligada à inspeção, reserva por lote/série inexistente, 4 colunas de lote com escritor e sem leitor, compensações do motor não failure-safe (débito arquitetural, resolve na migração Postgres), impressora física do galpão não confirmada, QR lido sem sessão perde o destino depois do login (melhoria global de auth, fora do escopo client da 6c), e 2 decisões de negócio aguardando o cliente — ver a spec 10 |
| 11 | [Transferências](11-transferencias/README.md) | ✅ | ✅ | ✅ | 🟢 **Etapa 7 entregue (2026-08-12, `29524fc..0722bfd`)** — a transferência exige lote em material controlado (exigiu estender a guarda do motor: `TRANSFERENCIA` é **ramo próprio**, fora de `tiposEntrada`/`tiposSaida`, então declarar `exigeLote` na rota não bastava), está declarada em `REGRAS_VINCULO` com `{ vinculo: 'nenhum' }`, e ganhou tela **dentro do formulário de Movimentações** (origem + destino + seletor de lote), não tela dedicada — a transferência *é* uma movimentação origem→destino e o formulário já tinha 90% dela. **O "em trânsito" foi CORTADO por decisão do cliente, não é pendência**: os almoxarifados são áreas físicas do mesmo site, o cliente tem uma filial só, alguém pega a caixa e leva na hora; com ele saíram aprovação, recebimento com conferência e o alerta "não recebida". Intencional e testado: transferência **não** checa status nem vencimento do lote (mover lote reprovado de prateleira é como ele vai parar na área de bloqueados). Fora de escopo declarado: **série na transferência** (o claim de série no motor só existe para entrada e saída; o `localizacao_id` da série é informativo e o saldo real, que a transferência move certo, vive em `estoque_saldo_almoxarifado`) |
| 12 | [Devoluções](12-devolucoes/README.md) | ✅ | ✅ | ✅ | 🟢 **Etapa 7 entregue (2026-08-12, `29524fc..0722bfd` + `eabd848`)** — devolução cita a saída original (vínculo **opcional mas validado**: mesmo material, não cancelada, tipo devolvível, e `quantidade + já devolvido ≤ entregue` com a mensagem **dizendo quanto resta**), herda o `lote_id` da entrega, reativa a série `ENTREGUE → EM_ESTOQUE`, e tem tela dedicada em `/almoxarifado/devolucoes` (começa pelo **material**, porque pela requisição não se alcança saída manual). Duas colunas por `safeAlter` e a rota de leitura `GET /devolucoes/saidas-elegiveis`. **Bug de saldo corrigido em commit próprio (`29524fc`): devolver para sucata baixava o estoque DUAS vezes** — 100 → saída 10 → 90 → devolução 3 para sucata dava **87**; a spec 12 descrevia esse comportamento como se estivesse certo e foi corrigida dizendo que estava errada. Conserto fora do plano (`eabd848`): devolução recusada não deixa mais linha gravada (compensação), porque a linha fantasma encolhia **permanentemente** o devolvível da entrega citada. Fora de escopo declarado: série no **descarte** de devolução (caminho de dois passos, com 400 que ensina o caminho), fotos/anexos, devolução ao fornecedor, estorno de custo de projeto (22), tipos de devolução por origem (13/16) |
| 13 | [Materiais de clientes](13-materiais-clientes/README.md) | ✅ | ✅ | ✅ | 🟢 **Etapa 8 entregue (2026-08-12, `f26b635..5b5eb55`)** — material de cliente virou **material normal com dono** (`proprietario_cliente_id`, `NULL` = nosso) e ganhou tudo que as Etapas 1 a 7 construíram: lote, série, endereço, extrato, etiqueta e livro. **A segregação não foi "lembrar de filtrar"**: 40 leituras da tabela auditadas uma a uma e classificadas em A (estoque próprio → filtra), B (leitura por id → não filtra, senão o motor pararia de funcionar para material de cliente) e C (misturar é o correto → não filtra, e o **selo** é a contrapartida). **Guarda do dono** na saída, com a **emergencial NÃO furando** — única exceção deliberada ao padrão do módulo, porque "regularizo depois" não é resposta para o dono da chapa. **Ajuste** sob a ação nova `ajustar_material_cliente` (só ADMINISTRADOR), verificada **dentro do motor** porque o AJUSTE chega por duas rotas ambas gateadas por `movimentar`. Tipo `DEVOLUCAO_CLIENTE` (saída, rota dedicada, documento obrigatório) — **não confundir com a devolução da Etapa 7**, onde o material volta. Ilha aposentada (rotas e serviço removidos; **tabela preservada**). Tela `/almoxarifado/materiais-cliente` com posição por cliente + PDF no navegador. **Duas correções declaradas de spec:** a spec de design mandava auditar o lugar errado (`9d70d8c`), e o item "entrada exige cliente + **projeto** + documento" estava **ERRADO** quanto ao projeto — a linha diz isso em vez de sumir. **Fora do escopo, declarado:** e-mails (19), sobras (15), perdas/não conformes/valorização por cliente (21), aprovação assíncrona de ajuste (06). **Pendência aberta e grave o bastante para o guia do usuário:** a conferência de inventário (`routes/almoxarifado.js:941`) ajusta `quantidade_atual` fora do motor, logo fora da permissão nova |
| 14 | [Materiais em terceiros](14-materiais-terceiros/README.md) | ✅ | ✅ | ✅ | 🟢 **COMPLETA — as duas metades entregues: Etapa 8b (2026-08-12, `0a01124..b176212`), o MESMO material volta; Etapa 8c (2026-08-13, `753d23b..61c6f52`), volta OUTRA coisa.** **8b** — remessa e retorno do **MESMO** material, ciclo completo. Quarta coluna de retenção `quantidade_em_terceiros` (sai do disponível, **não** do patrimônio) com a conta do disponível **centralizada** em `availabilitySql.js`; conferência de inventário descontando **só ela**; três tabelas + `thirdPartyStateMachine` (`ABERTA → ENVIADA → RETORNO_PARCIAL → ENCERRADA/CANCELADA`); quatro tipos de movimento no motor; envio **tudo-ou-nada** agregando por material; retorno parcial com teto acumulado **por item**; encerramento com **destino obrigatório** (`PERDA_NO_TERCEIRO`/`CONSUMIDO_NO_PROCESSO`) + justificativa; cancelamento com estorno **do que ainda está lá fora**; ação de perfil `remessar_terceiro`; sete rotas + `GET /vencidas`; tela `/almoxarifado/remessas-terceiros` + PDF no navegador. **Correção declarada de spec:** o checklist dizia "envio = saída para localização virtual", e isso **estava errado** — o disponível é calculado sobre o escalar `quantidade_atual`, então localização virtual não tira nada do disponível. **Correção declarada de status:** esta linha dizia *"**Falta a Etapa 8c — transformação**"* — **deixou de ser verdade em 2026-08-13**. **8c** (`753d23b..61c6f52`) — corte, dobra e usinagem: sai 1 chapa e voltam N peças mais uma sobra, no **mesmo evento** (a chapa baixa por `CONSUMO_TERCEIRO`, cada resultado entra pelo tipo novo `RETORNO_TRANSFORMACAO`, `9c7ec75`); três colunas em `retornos_remessa_item_almoxarifado` (`tipo_resultado` `PECA`/`SOBRA`, `custo_unitario_aplicado`, `movimentacao_consumo_id` como agrupador do evento), com `NULL` significando "retorno simples"; rateio de custo em função **pura** (`transformCost.js`) — **peça recebe rateio, sobra entra a custo ZERO**; rota dedicada `POST /remessas-terceiros/:id/transformacoes` (`remessar_terceiro`), tipo em `TIPOS_DEDICADOS` (fora da rota genérica); guarda própria `assertMesmoDonoNaTransformacao` (a peça tem de ter o **mesmo** dono da chapa); modal com N resultados, classificação e rendimento. E-mail (19) e alerta de atraso (20) seguem **fora do escopo**. **Pendência que continua aberta e precisa de resposta do cliente:** "uma remessa não mistura donos" foi **deduzida**, não pedida. Pendência menor da 8c: o **rendimento** é calculado, exibido e **jogado fora** — não há coluna que o guarde |
| 15 | [Retalhos, sobras e sucatas](15-retalhos-sucatas/README.md) | ✅ | ✅ | ✅ | 🟢 **Etapa 9 entregue (2026-08-16, `b727c0a..4ba94e2`)** — retalho é material normal no motor (`ENTRADA_RETALHO` dedicado, sem custo) + anexo dimensional na tabela de sobras reformada (auditada, Zod, `POST /sobras` avulso aposentado); `gerarRetalho` é evento composto com guarda de dono e compensação; `SUCATA` saiu do formulário genérico e virou processo com **dupla aprovação segregada** (duas ações novas de perfil, baixa pelo motor na segunda assinatura, claim anti-corrida), destino VENDIDA/DESCARTADA com comprovante e relatório `sucata-financeiro` lendo o livro; tela `/almoxarifado/sobras` (Retalhos + Sucateamentos), etiqueta de retalho com QR e hint de retalho na SAÍDA. Os 4 testes nomeados da spec existem e passam. **Fora do escopo declarado:** e-mail (→ 19). Pendências nomeadas na spec: guarda geral de tipo novo nas fontes únicas, coluna `foto` sem escritor, lote do material-retalho, `valor_venda` em DESCARTADA |
| 16 | [Ferramentas e calibração](16-ferramentas-calibracao/README.md) | 🟡 | 🟡 | ✅ | 🟢 **Etapa 9b entregue (2026-08-22, `d644827..b8e6f60`)** — ferramenta virou patrimônio emprestável completo: máquina de estados explícita (`toolStateMachine.js`) com toda transição por **claim** (`UPDATE ... WHERE status IN (...)`, sem a janela de corrida SELECT-depois-UPDATE que existia antes), calibração com vencimento **lida da última calibração** (sem coluna-cache) barrando o empréstimo, avaria/perda com foto encerrando o empréstimo aberto no mesmo ato (RN-05), bloqueio/manutenção/reencontro com justificativa auditada, ação de perfil própria `gerenciar_ferramentas` (parou de usar o gate genérico `movimentar`), Zod em todas as rotas (nenhuma tinha antes), auditoria em toda escrita (emprestar/devolver não auditavam antes), e tela `/almoxarifado/ferramentas` com três visões (Ferramentas, Empréstimos, Calibrações). Revisão final de branch achou 4 Important cross-task que os gates por-task não pegam (busca/filtro do contrato ignorados pelo backend; corrida devolver↔ocorrência podendo corromper o status; PUT/409 sem teste; badge de vencimento do front discordando do servidor) — todos corrigidos e re-revisados limpos. **Fora do escopo declarado, com pendência aberta:** job de lembrete de devolução sem canal de notificação (função pura pronta, aguarda feature 20), UI de edição de ferramenta (backend testado, só falta o formulário — achado da revisão final), integração com inspeção (feature 09) |
| 17 | [Inventário e contagem cíclica](17-inventario-contagem/README.md) | 🟢 | 🟢 | ✅ | 🟢 **Etapas 10 + 10b entregues (2026-08-22/23, `d644827..8db2671` e `14f4458..7290481`)** — a 10 resolveu o risco crítico (tipo dedicado `AJUSTE_INVENTARIO` pelo motor, guarda de retenção decidindo a pendência B1/B2/B3, contagem cega, tolerância+recontagem, tudo-ou-nada); a 10b entregou **escopos de contagem combináveis** (família raiz, ABC, críticos, de clientes, em terceiros), **dupla contagem por duas pessoas** (recontagem de outra pessoa, número do colega escondido com ou sem modo cego, correção própria pré-recontagem, autoria por item), **relatório de acuracidade** (ponderado, contados/total + recontados, impacto persistido sem backfill) e o **epsilon de divergência como fonte única** (alcançando o relatório antigo, que ganhou gate + só CONCLUIDO). **Fora, declarado com porquê na spec:** contagem por endereço (+ guarda de retenção com localização), cíclica automática, congelamento (ruling mantido), dupla aprovação formal (aguarda B11), e-mail, tela de conciliação lado a lado |
| 18 | [Reposição e estoque mínimo](18-reposicao-estoque-minimo/README.md) | 🟢 | 🟢 | ✅ | 🟢 **Etapa 11 entregue (2026-08-24, `54e1278..1ea6ab2`)** — motor de sugestão no `purchaseService` (consumo médio por `TIPOS_SAIDA` em janela configurável; ponto efetivo com **a mínima como chão** de todas as réguas; posição = `disponivelSql` + solicitações abertas dentro do **horizonte** configurável, com `a_caminho_vencido` exposto; alvo `max(máxima, ponto)` com lote econômico como piso), `GET /reposicao/sugestoes` consolidado por fornecedor e valorado, `POST /gerar-solicitacoes` (quantidades do servidor, sem dedupe — a posição É o dedupe, complemento em pendência insuficiente, auditado), `GET /estoque-parado` (excesso/sem consumo/obsoleto com valor parado), ação nova `gerenciar_reposicao` [ADMIN, GESTOR, COMPRAS — ALMOXARIFE fora de propósito], relatório de solicitações com VINCULADO e gateado, horizonte compartilhado com a máquina de estados de requisição, 3 configs semeadas+editáveis com validação nos dois lados, índice novo no livro, tela `/almoxarifado/reposicao` (3 abas, painel de erro/permissão por aba). **Fica de fora, declarado:** ~~fechar/cancelar solicitação no recebimento~~ (**entregue na Etapa 14** — RECEBIDA automática + CANCELADA com justificativa, ver feature 22), itens por material (feature 24), alerta ativo de máximo, e-mail (19) |
| 19 | [E-mails e notificações](19-emails-notificacoes/README.md) | 🟢 | 🟢 | ✅ | 🟢 **Etapa 12 entregue (2026-08-24, `c1613c2..d7fee6c`)** — fila `fila_notificacoes_almoxarifado` (dedupe UNIQUE por hash, retry/backoff em JS, claim de envio contra drenos concorrentes, FALHA + aviso ao admin máx. 1), gancho pós-commit no motor por CLASSES (default `'0'`; RESERVA/remessa/retorno/AJUSTE_INVENTARIO fora de propósito; cancelamento suprime a pendente e recusa reenvio), 3 dívidas pagas (lembrete ferramenta 9b/B7, resumo de solicitações 11, devolução parcial 7), painel `/almoxarifado/notificacoes` gateado (`gerenciar_notificacoes` ADMIN/GESTOR; reenvio de ENVIADO com confirm), jobs (worker + varreduras diárias), 10 configs nos dois lados. **Cortes declarados:** matriz evento×destino, templates, digest, PDF, grupos (letra D/B15) |
| 20 | [Alertas operacionais](20-alertas/README.md) | 🟢 | 🟢 | ✅ | 🟢 **17 de 20 (Etapa 16 somou 7 por varredura, `6bed5e2..ed5f032`; Etapa 17 somou 4 no ato/vigília, `d65d81b..e51ca79`)** — registro único `alertRegistry` com DOIS modos: varredura diária pela fila da 19 e **disparo no ato** (`dispararAlertaRegistrado`) para reprovação de material, divergência de recebimento (nos dois escritores reais da quantidade) e divergência de inventário (agregada por conferência, sem valor em reais — B30); `listar` dual-mode dá a régua única para gancho e central. Central `/almoxarifado/alertas` ao vivo gateada por `ver_alertas` (B28); 4 janelas configuráveis nos dois lados. Dois itens SAÍRAM do checklist dizendo por quê (transferência: CORTADA pelo cliente; negativo: regra do motor). **Falta só o que não tem dado:** separado-aguardando-retirada, pedido-parcial e consumo-acima-do-previsto — cada um preso a uma coluna/entidade que a feature dona não tem |
| 21 | [Relatórios e dashboards](21-relatorios-dashboards/README.md) | 🟢 | 🟢 | ✅ | 🟡 **Etapa 13 entregue (2026-08-24, `4fdda54..8bb5e52`)** — `reportRegistry` com 18 chaves e gate DECLARADO por chave (mata a classe "relatório novo esquece o gate", 2 precedentes 10b/11; o processo nem sobe com chave órfã), lista fail-closed servindo exportavel/limite/nota/colunas, export XLSX genérico com projeção (paridade linha+cabeçalho medida; payload objeto → 400 literal), `consumoSql.js` fonte única (4 réguas divergentes DOCUMENTADAS — 10 vs 18 medido, unificar é letra B19), indicadores (giro aproximado declarado, cobertura mediana, rupturas físico+tipo, valor por grupo, atendimento sem janela), tela `/almoxarifado/relatorios` dirigida pelo registro, 3 cartões no dashboard. **Falta para 🟢 pleno:** PDF (corte D), previsto×realizado (depende da 22), % no prazo/fornecedor (features donas), valorização por cliente (letra B) |
| 22 | [Integrações](22-integracoes/README.md) | 🟡 | 🟡 | ✅ | 🟡 **Etapa 14 entregue (2026-08-25, `b276dca..2de7944`)** — a fatia integrável REAL, medida antes de prometida: **Compras** (ciclo de vida da solicitação: RECEBIDA automática no recebimento da nota do pedido vinculado, nos dois caminhos; CANCELADA manual com justificativa auditada — **fecha a B14 da feature 18**; vincular valida as duas pontas; D9 abre vincular/verificar-mínimos para `gerenciar_reposicao`; verificar-mínimos audita o autor; contexto do comprador com último custo por NF) e **custo por projeto** (relatório `custo-por-projeto` computado do livro, consumido/devolvido/líquido, custo atual retroativo declarado, gate nasce fechado; herança de projeto/OS na devolução nas duas pernas). **Falta para 🟢, tudo bloqueado por dependência com a medição escrita na spec:** BOM/Engenharia (inexistente no sistema), OP/Produção (MES sem uso), centro de custo (sem entidade), previsto×realizado, acompanhamento de prazo de pedido, aviso de rejeição da Qualidade ao comprador |
| 23 | [Perfis, segurança e auditoria](23-perfis-seguranca-auditoria/README.md) | 🟢 | 🟡 | ✅ | 🟡-forte **Etapas 18 + 19 pagaram os dois buracos históricos (`adf7233..55e4144`)** — a 18 deu trilha ao ciclo do inventário (5 atos, cancelamento com motivo e autor, `aprovador_*` ressuscitadas); a 19 deu aos **23 endpoints de cadastro e configuração**, com diff nas configurações, segredo mascarado (inclusive a query string da URL do webhook), 404 onde se respondia sucesso, o cascata do rename contado e `setor_permissao` com o mapa de acesso. **Etapa 20 (`1b0f0e9..a3f5135`) pagou os 3 fora-de-escopo que a própria spec nomeava:** a rota de foto (404 `Material não encontrado` + limpeza do órfão em toda saída ≠ 200 + `unlink` da anterior depois do UPDATE + auditoria da troca, `6cb594e`/`05a5c81`), o `GET /configuracoes` (senha de SMTP e chave de API mascaradas; o PUT genérico passou a recusá-las com 400, `a0b19c9`) e o `GET` do mapa de permissões por setor (`isSystemAdmin \|\| canConfigureAlmox`, `8c0feff`). **Etapa 22 (`8c6ffbe..169458d`) pagou a TELA de auditoria**, que era o item que quatro etapas seguidas apontaram como "o que falta para 🟢": `/almoxarifado/auditoria` (menu `adminOnly`) com filtro de entidade, ação, usuário e período, de/para expansível calculado no servidor por régua própria (`auditLabels.alteracoesDaLinha` — `configDiff.calcularDiff` **apagaria a troca de segredo mascarada**), paginação por offset e truncamento em 300 caracteres; mais os 4 filtros no GET com `IN` por placeholder, validação de data por ida-e-volta (`Date.parse` aceita `2026-02-30`), 400 de período invertido, janela em UTC com fuso constante do módulo, `GET /auditoria/opcoes` e os **3 índices** que a tabela nunca teve. **Falta:** ~~a TELA de auditoria (B33)~~ **— PAGA**; o volume do log de permissões (G8), ~~o ato parcial do PUT de configuração sem rastro~~ **— PAGO na Etapa 23**, ~~`EXCLUSAO` de linha já inativa~~ **— PAGO na Etapa 23 (e em CINCO rotas, não quatro)**, a normalização dos verbos antigos (agora normalizados **só na exibição**, B47 — migrar no banco é irreversível sobre dado histórico), o gate ADMIN-only (B33 metade b), a exportação XLSX e a retenção do log; e o que a Etapa 20 declarou fora **com o porquê escrito**: o webhook em claro no GET (B40/C24), `GET /setores-requisicao` com `qtd_permissoes` sem gate (B41, **em aberto**), `GET /configuracoes/liberacao-valor` com nome/e-mail dos aprovadores, e a matriz de leitura do módulo. ~~Para virar 🟢 falta a tela de auditoria — o resto é decisão de negócio declarada.~~ **ESTA FRASE ESTAVA ERRADA por ser incompleta, e a Etapa 22 a corrigiu:** ela classificava TODO o resto como "decisão de negócio declarada", e **dois itens não são** — o ato parcial do `PUT /configuracoes` (grava chave a chave sem transação; falha no meio deixa parte gravada **sem** linha de histórico) e o `EXCLUSAO` de linha já inativa são a **trilha mentindo por omissão e por excesso**, defeitos meus, não escolhas do usuário. **Com a tela entregue, o que falta para 🟢 passou a ser esses dois** — código, etapa curta, nenhuma dependência de resposta. G8, B47, B33(b), XLSX e retenção seguem declarados e **não** contam para a cor. **Etapa 23 (`0fe8d02..4f1aeb9`) PAGOU OS DOIS**: `PUT /configuracoes` virou um `UPDATE` único com `CASE` (atômico por statement, **sem** transação — o CRM tem uma conexão só e `ROLLBACK` desfaria escrita alheia; `b6b7b24`/`d507ccc`), e excluir o que já está inativo parou de auditar nas **cinco** rotas — a quinta, `DELETE /materiais/:id`, o design não tinha visto (`9858bec`); mais a Task 0, **que não estava no plano** e sem a qual a primeira seria promessa falsa: o retry de `SQLITE_BUSY` respondia erro a quem pediu e gravava depois (`0fe8d02`). Provado **pela tela-contrato** em `4f1aeb9`. **E A FRASE ACIMA TAMBÉM ESTAVA INCOMPLETA — o mesmo erro, duas vezes seguidas.** Ela pesou só a perna de AUDITORIA e chamou aquilo de "o que falta para 🟢" da feature inteira. Com os dois pagos, a feature **continua 🟡-forte**: sobram **10 itens** nos checklists de **Perfis** (perfil QUALIDADE inexistente, UI de atribuição de perfil, o fallback `getPerfilFromUser` → PRODUCAO, o mapeamento da spec 28, o default de módulo) e de **Segurança** (dispositivo/IP na movimentação, lançamento retroativo, justificativa em operações excepcionais, dupla conferência, retenção de backup configurável), que **não são decisão de negócio — são funcionalidade não construída**. É isso o que falta para 🟢 agora, e está escrito assim na spec 23 para a próxima leitura não repetir a conta. **Etapa 24 (`a81e51a..4680daa`) COMEÇOU a perna Perfis, e a feature continua 🟡-forte.** Entregue: o perfil **QUALIDADE** (`visualizar` + `inspecionar` e nada mais, com a lista negativa provada por controle positivo — a asserção negativa de permissão passa VERDE antes de o perfil existir, porque `can()` devolve `false` para o que não conhece, então só a sabotagem a prova); a **revogação de perfil passou a auditar** (`EXCLUSAO`, verbo já existente em `GRUPOS_ACAO` para ficar filtrável na tela) e a concessão passou a gravar `dados_anteriores`, com os dois lados na MESMA forma porque a régua de leitura é união de chaves e chave de um lado só fingiria alteração; **`ADMINISTRADOR` saiu do seletor** (escala por `hasAlmoxAdminPerfil` e evapora por `syncModuleAdminProfiles` — as duas coisas juntas são pior que a opção não existir); e a aba, que tinha **zero** teste, ganhou **7** mais a integração ponta a ponta pela tela-contrato de auditoria. **⚠️ E esta spec estava ERRADA num item que custou uma etapa:** o checklist de Perfis dava *"UI de atribuição de perfil por usuário"* como não construída, e **a tela existe desde `6018f0a` (2026-08-05)** — o design da Etapa 24 leu isso, somou a uma varredura incompleta do client (procurou `perfil_almoxarifado`; a rota é `perfis-usuario`) e desenhou a etapa inteira sobre "a tela não existe", mandando construir uma segunda. A Fase 2 derrubou a premissa com quatro provas e o escopo foi reescrito no meio da etapa. **O item 131 (perfil QUALIDADE) NÃO fica marcado**: `bloquear/liberar sob desvio` usa `ajustar_estoque`, que o perfil não recebeu de propósito (**B56**). **O que falta para 🟢 mudou de item pela QUARTA vez e agora é a perna Segurança, intacta** — dispositivo/IP na movimentação, lançamento retroativo, justificativa em operações excepcionais, dupla conferência e retenção de backup. **A Etapa 21 (`d5c8d3a..07a4b1c`) NÃO mexeu nesta feature** — ela é do **núcleo do CRM** e fechou os itens que a Etapa 20 declarou fora por serem "do core" (backup entregando o `jwtSecret`, senha de SMTP no código, os GETs/PUT de configuração do core); registrado no bloco "Etapa 21" da spec, com o que **continua aberto**: a rotação da senha na Locaweb, que é operação. **Etapa 25 (`6209037..9027c36`) FECHOU a perna Segurança como funcionalidade, e a feature continua 🟡-forte.** Entregue: a movimentação registra **de onde veio** (`ip`, `ip_proxy`, `user_agent`; `x-forwarded-for` tratado porque `trust proxy` não está configurado — sem isso toda linha diria `127.0.0.1` atrás do nginx; `user_agent` truncado em 255; campo nulo **não** vai para a trilha, senão toda movimentação sem proxy geraria a linha `ip_proxy: — → —`), alcançando os **28** call sites de `registrarMovimentacao` por `req.user.origem` — 23 deles nascem dentro de serviços que não têm `req` — mais o **ESTORNO do cancelamento**, que faz `INSERT` próprio e não passa pelo motor; e a **retenção de backup virou configurável** (`backup_manter_dias` deixou de ser dado morto, com piso de 3 cópias e teto de 10, valor inválido caindo no padrão de 30 dias com **um** aviso, e o prune varrendo acompanhantes órfãos `-wal`/`-shm` nos **dois** formatos de nome — 130 dos 132 órfãos reais estão no formato antigo, que o teste congelado sozinho não pegava). **O achado que mais pesa:** a leitura da configuração estava planejada para rodar **antes** de a tabela `configuracoes` existir, e no primeiro boot de uma instalação nova isso deixava o `/health` reportando `db_startup_failed` **pelo resto da vida do processo** — reproduzido no boot real antes de existir a correção; o prune foi para dentro de `initializeDatabase` e ficou em `try/catch`, porque limpeza de arquivo velho nunca pode impedir o servidor de subir. **⚠️ E DUAS linhas desta spec estavam ERRADAS, na mesma perna:** *"bloquear lançamento retroativo"* **nunca foi tarefa** (`created_at` é `CURRENT_TIMESTAMP`, não existe coluna de data do movimento, os 3 `INSERT` de produção não a citam e nenhuma rota lê data do body — **o retroativo é impossível, então bloqueá-lo também é**), e *"justificativa obrigatória em operações excepcionais"*, que a Etapa 23 classificou como **"funcionalidade não construída"**, **já estava construída em cinco camadas** (16 dos 33 tipos de movimento recusados pelo motor em `movementRules.js`, 10 `throw` em serviço, 2 schemas Zod cobrindo 4 rotas, 1 validação de rota e 1 `NOT NULL` de tabela). As duas viraram `[~]` **dizendo que estavam erradas**. O que de fato falta na justificativa virou lista nomeada: `QUARENTENA`/`LIBERACAO_INSPECAO` sem regra (assimétricos com `BLOQUEIO`/`DESBLOQUEIO`, que exigem), `RETRABALHO`, `DEVOLUCAO_CLIENTE`, `excluirRequisicao` com default vazio e a falta de tamanho mínimo padronizado. **O que falta para 🟢 mudou de item pela QUINTA vez e agora é a perna *Perfis*** — a metade aberta do item 131 (**B56**) e os dois itens dependentes da spec 28. A perna Segurança sobra com **um** item, dupla conferência em material crítico, e ele é **decisão de negócio** (letra **B**): `material_critico` já é coluna viva e a dupla assinatura por **identidade** já existe testada no sucateamento; falta o cliente dizer *quais* operações a exigem. **Cuidado de operação criado aqui:** a tela de Backup fica com **um** controle vivo e **dois** decorativos — `backup_automatico` e `backup_frequencia` seguem sem leitor no servidor (letra **C**) |
| 24 | [Mobilidade](24-mobilidade/README.md) | ✅ | ✅ | ✅ | 🟢 **Etapa 15 entregue (2026-08-28, `7f74b6c..a82ad43`) — no escopo MEDIDO, que não é a Fase 4 inteira da spec original.** Scanner de QR pela câmera (`/almoxarifado/scanner`, client-only: os QRs da 6c carregam URLs do próprio sistema; `parseQrDestino` só navega para `/almoxarifado/...` com filtro explícito de protocolo E de prefixo-com-barra — o Important da revisão final); assinatura digital + recebedor na entrega de requisição (tabela append-only `assinaturas_entrega_almoxarifado` auditada, `POST /requisicoes/:id/assinatura-entrega` multipart gateado por `separar_emitir`, detalhe expõe `assinaturas_entrega`; **opcional por design** — a entrega nunca depende dela); balcão mobile (a regra CSS que escondia colunas ≥4 — inclusive Ações — morreu; scroll na própria `.almox-table`; modais fullscreen). **Fora por medição, declarado:** 1D (nada gera), coletor (hardware não confirmado), app nativo/PWA/offline, fotografia na saída, flags `requer_assinatura`/`requer_termo` seguem mortas (B26). Pendências nomeadas na spec: 500 opaco de multer nas 5 rotas de upload (**renomeada na Etapa 20, `1b0f0e9..a3f5135`: a rota de foto saiu do conjunto no que era dela — 404, limpeza de órfão e auditoria — e continua no item só pelo 500 opaco, que é do multer e comum às cinco**), teste em aparelho real, flags por tipo. `limparUploadOrfao` mudou de casa na Etapa 20: `services/almoxarifado/uploadCleanup.js`, não mais o closure de `extended.js` |

## Ordem de desenvolvimento sugerida (etapas pequenas)

Cada etapa é pequena, independente e termina com testes passando. **Não pular a Etapa 0** — ela remove os riscos que quebrariam features existentes.

### Etapa 0 — Fundação (obrigatória primeiro) → pasta `00-fundacao-tecnica`
1. Harness de testes de API (supertest + app de teste + SQLite em memória).
2. Eliminar DDL duplicado (schema só em `services/almoxarifado/schema.js`).
3. Unificar movimentações: frontend passa a usar a v2 (com auditoria); v1 vira alias ou é aposentada.
4. `safeAlter` estrito + uso consistente do ledger de migrations.
5. Corrigir inconsistências de permissão conhecidas e tirar SMTP hardcoded do código.

### Etapa 1 — Motor de estoque confiável → `03-motor-estoque`
Saldo físico/reservado/bloqueado/disponível consistente; bloqueio de saldo negativo; estorno com motivo; livro de movimentações completo; vínculo estruturado a projeto/OS/centro de custo (colunas já existem).

### Etapa 2 — Cadastros completos → `01-cadastros-materiais` + `02-localizacoes-enderecamento`
Campos faltantes do material; subfamílias formais; unidades de compra/consumo + fator de conversão; decisão multi-almoxarifado; restrições de endereço.

### Etapa 3 — Requisições ponta a ponta → `04-requisicoes` + `06-aprovacoes`
Status faltantes; validações (quantidade > 0); confirmação de recebimento; encerramento; regras do motor de aprovação (dupla aprovação, solicitante não aprova a própria).

### Etapa 4 — Reservas com UI → `07-reservas`
Reserva automática pós-aprovação, liberação, expiração; integração com requisições.

### Etapa 5 — Recebimento + Inspeção → `08-recebimento` + `09-inspecao-qualidade`
Tipos de entrada; conferência física; quarentena e bloqueio efetivos no saldo.

### Etapa 6 — Lotes → `10-lotes-series-etiquetas`
**Dividida em três em 2026-08-09** — a feature 10 é grande demais para uma etapa, e descrevê-la como item único fazia parecer que ficaria pronta de uma vez:
- **Etapa 6 ✅ ENTREGUE (2026-08-09, `b7035dd..9406bff`)** — tabela `lotes_almoxarifado` com validade/corrida/certificado; regras de saída (vencido, bloqueado, reprovado); FEFO como sugestão; guarda contra saldo negativo por lote; campo de lote no recebimento. Mais uma task que não estava no plano: **3b, liberação de vencimento com justificativa** (`556f86d`) — a guarda tinha sido escrita sem o caminho de liberação que o cliente pedira no design, e mandava o operador "liberar pela tela de lotes", que não existia. [Plano](../../docs/superpowers/plans/2026-08-09-almoxarifado-etapa6-lotes.md) · [design](../../docs/superpowers/specs/2026-08-09-almoxarifado-etapa6-lotes-design.md).
- **Etapa 6b — ✅ ENTREGUE em 2026-08-11** — números de série, backend (Tasks 1-7, `418d617..fc33d59`) + UI (Tasks 8-11, `4836d24..f11a3f0`) + documentação (Task 12). Tabela `series_almoxarifado`, `seriesService` (leitura/entrada/saída/reversões/bloqueio), motor de série integrado a movimentações manuais e recebimento — requisições e inspeção seguem isentos, pendências declaradas —, duas rotas HTTP, e telas: Movimentações (textarea+gerador na entrada, seletor na saída), Recebimentos (textarea por item), aba "Séries" em "Lotes e Séries" (bloqueio justificado), hint da flag, KPI no extrato. O aviso anterior ("ligar `controle_serie` trava o recebimento pela tela") está **superado** desde as Tasks 8-10 — a única ressalva que sobra é o modal rápido v1 da tela de Materiais, que continua sem campo de série (mesmo padrão já existente para lote). Plano completo: [`docs/superpowers/plans/2026-08-11-almoxarifado-etapa6b-series.md`](../../docs/superpowers/plans/2026-08-11-almoxarifado-etapa6b-series.md). **Pendências da 6b** (não bloqueiam a etapa, ver spec 10): extrato agregado do lote, reserva por série, reprovação por série via inspeção não ligada, isenção dos 4 fluxos internos + transferência, compensações do motor não failure-safe (resolve na migração Postgres).
- **Etapa 6c — ✅ ENTREGUE em 2026-08-11** (`35967b9..0785119`) — etiquetas com QR Code em PDF. Util
  client `utils/etiquetasPdf.js` (formatos `A4_GRADE`/`TERMICA_100x50`, montadores puros por
  material/lote/série/recebimento, renderizador `jsPDF`+`qrcode`), `EtiquetasPdfModal`
  compartilhado (formato lembrado em `localStorage`), botões em Materiais, "Lotes e Séries"
  (por linha + bulk das séries em estoque) e Recebimentos (nota processada), e deep-link
  `?material_id=&aba=&lote=/&serie=` com destaque em "Lotes e Séries". **Zero mudança de
  servidor** — decisão de design (jspdf/qrcode no client, `window.location.origin` resolve a
  URL do QR sem base configurada no servidor). Pendências (não bloqueiam a feature, ver spec 10):
  impressora física do galpão a confirmar com o cliente, etiqueta de retalho aguardando UI da
  feature 15, etiqueta de localização cortada de propósito (o mapa já cobre), etiquetas do
  recebimento usam o texto digitado (rota "séries por recebimento_item" fica como robustez
  futura), sem registro de impressão (YAGNI declarado). Plano completo:
  [`docs/superpowers/plans/2026-08-11-almoxarifado-etapa6c-etiquetas.md`](../../docs/superpowers/plans/2026-08-11-almoxarifado-etapa6c-etiquetas.md).

`6b`/`6c` e não `7`/`8` porque as etapas 7 e 8 abaixo já estão ocupadas. **Com a 6c fechada, a
feature 10 ficou completa por inteiro; a Etapa 7 (transferências e devoluções) e a Etapa 8
(materiais de clientes) fecharam em 2026-08-12.** *(Este parágrafo terminava dizendo "e a próxima
da ordem é a Etapa 8b — materiais em terceiros" — **envelheceu**: a 8b fechou em 2026-08-12 e a 8c
em 2026-08-13. A próxima da ordem está discutida no cabeçalho deste arquivo, e **precisa ser
decidida**.)*

### Etapa 7 — ✅ ENTREGUE em 2026-08-12 → `11-transferencias` + `12-devolucoes`
`29524fc..0722bfd`, mais os consertos `eabd848`/`7fc1b7f` (compensação da devolução recusada) e
`d117dc2` (badge de `TRANSFERENCIA` sem cor no livro).

- **Transferência**: exige lote em material controlado, declarada em `REGRAS_VINCULO`
  (`{ vinculo: 'nenhum' }`), e virou tipo do formulário de **Movimentações** com origem, destino e
  seletor de lote. Não checa status nem vencimento do lote — **de propósito, com teste**.
- **Devolução**: cita a saída original com validação de quantidade (a recusa diz **quanto resta**),
  herda o lote, reativa a série, e tem tela dedicada `/almoxarifado/devolucoes`. `DEVOLUCAO` saiu do
  formulário genérico de Movimentações — ali criava lançamento solto e nenhum registro de devolução.
- **Bug de saldo corrigido em commit próprio (`29524fc`)**: devolver para sucata baixava o estoque
  **duas vezes**. A spec 12 descrevia o comportamento errado como se fosse correto — corrigida
  dizendo que estava errada.
- **O estado "em trânsito" da spec 15/11 foi CORTADO por decisão do cliente** (site único; a
  transferência é imediata). **Não é pendência esquecida** — se um dia houver obra externa ou
  segundo prédio, o item volta com justificativa nova.

Plano: [`docs/superpowers/plans/2026-08-12-almoxarifado-etapa7-transferencias-devolucoes.md`](../../docs/superpowers/plans/2026-08-12-almoxarifado-etapa7-transferencias-devolucoes.md) ·
design: [`docs/superpowers/specs/2026-08-12-almoxarifado-etapa7-transferencias-devolucoes-design.md`](../../docs/superpowers/specs/2026-08-12-almoxarifado-etapa7-transferencias-devolucoes-design.md).

### Etapa 8 — ✅ ENTREGUE em 2026-08-12 → `13-materiais-clientes`

**A Etapa 8 foi DIVIDIDA em 2026-08-12**, mesmo precedente da Etapa 6 (que virou 6/6b/6c): clientes
e terceiros são subsistemas independentes, e terceiros é construção do zero (remessa com máquina de
estados, documento, retorno parcial, transformação chapa→peças). Cada um fecha com testes passando
por conta própria. **Clientes = Etapa 8 (entregue); terceiros = Etapa 8b (próxima).**

**Etapa 8 = clientes (feature 13)** — `f26b635..5b5eb55`. Material de cliente deixou de ser ilha
(`materiais_cliente_almoxarifado`: texto livre, sem FK, sem motor, tabela vazia) e virou material
normal com dono: `materiais_almoxarifado.proprietario_cliente_id` (`NULL` = nosso). Ganhou lote,
série, endereço, extrato, etiqueta e livro.

| Task | O quê | Hash |
|---|---|---|
| — | design (spec) · plano · **correção da spec, que mandava auditar o lugar errado** | `f26b635` · `323a5da` · `9d70d8c` |
| 1 | coluna `proprietario_cliente_id` + auditoria nomeada de **40 leituras** (classes A/B/C) | `582bc04` |
| 2 | helper de invariante + teste de segregação com **controle positivo obrigatório** | `faf20e7` |
| 3 | guarda do dono na saída — a **emergencial não fura** | `da8ff21` |
| 4 | ação `ajustar_material_cliente`, verificada dentro do motor | `e171eaf` |
| 5 | seção "Propriedade" no cadastro + documento obrigatório no recebimento | `99c9f28` |
| 6 | tipo `DEVOLUCAO_CLIENTE` com rota dedicada | `27eb9c9` |
| 7 | aposentadoria da ilha (rotas e serviço saem, **tabela fica**) | `4a17921` |
| 8 | posição por cliente + tela `/almoxarifado/materiais-cliente` + PDF | `6e97715` · `5b5eb55` |
| 9 | selo de propriedade (client) + servidor dizendo **de qual** cliente | `4eaba65` · `359a152` |
| 10 | documentação e verificação final | este commit |

- **A segregação não foi "lembrar de filtrar".** O risco da etapa não era quebrar: era **não
  quebrar e o número ficar errado** — uma leitura esquecida faz a chapa do cliente contar como
  nossa em reposição de mínimo, sugestão de compra, valor total do estoque e posição, sem nenhum
  erro visível. Por isso a auditoria nomeada, com a classe **C** (misturar é o correto: ocupação de
  prateleira, materiais bloqueados, materiais sem endereço) que **não existia na spec de design**.
- **A saída emergencial NÃO fura a guarda do dono** — exceção deliberada ao padrão do módulo, onde
  `emergencial: true` bypassa a exigência de vínculo. Está comentada no código para não parecer bug.
- **Duas correções declaradas de spec:** a spec de design contava 19 leituras varrendo só o
  subdiretório `routes/almoxarifado/` e deixava de fora o **dashboard** e o
  **`GET /relatorio/posicao-estoque`** — justamente a rota nomeada pelo teste que ela mesma exigia
  (`9d70d8c`); e a spec 13 exigia **projeto na entrada**, o que está errado (o mesmo cliente manda
  a mesma chapa para dois projetos — o projeto é exigido na **saída**).
- **Pendência declarada, fora do escopo:** `routes/almoxarifado.js:941` (`aplicar_ajustes` da
  conferência de inventário) grava `quantidade_atual` **fora do motor**, logo fora da permissão
  `ajustar_material_cliente`. É a mesma família da pendência já registrada na feature 03. **Está no
  guia do usuário**, porque é um caminho real por onde o saldo de material de cliente muda sem a
  autorização especial.
- **Confirmar produção antes do deploy:** a ilha foi aposentada com base em medição do banco de
  **desenvolvimento** (0 linhas). A tabela **fica** exatamente por isso — nenhuma linha é apagada.
  A consulta e o que fazer com cada resultado estão na spec 13 e no guia.

Design: [`…etapa8-materiais-clientes-design.md`](../../docs/superpowers/specs/2026-08-12-almoxarifado-etapa8-materiais-clientes-design.md) ·
plano: [`…etapa8-materiais-clientes.md`](../../docs/superpowers/plans/2026-08-12-almoxarifado-etapa8-materiais-clientes.md).

### Etapa 8b — ✅ ENTREGUE em 2026-08-12 · Etapa 8c — ✅ ENTREGUE em 2026-08-13 → `14-materiais-terceiros`

> **Correção declarada — esta seção estava DUPLAMENTE ERRADA e ficou assim por um dia.** Ela dizia
> `### Etapa 8b — Materiais em terceiros **(próxima da ordem)**` e, no corpo, *"**Sem design
> aprovado nem tasks quebradas** … Primeira ação de quem pegar: `superpowers:brainstorming` com o
> briefing"*. As duas afirmações estão erradas: a **8b fechou em 2026-08-12** (`0a01124..b176212`),
> e a **8c tem design e plano, ambos escritos e executados** — plano
> [`2026-08-13-almoxarifado-etapa8c-transformacao.md`](../../docs/superpowers/plans/2026-08-13-almoxarifado-etapa8c-transformacao.md)
> (o design foi corrigido em `601436d`, porque se contradizia sobre o invariante de custo). Quem
> lesse esta seção sozinha começaria um brainstorming sobre trabalho já entregue. A frase errada
> fica registrada aqui em vez de sumir.

**8b (`0a01124..b176212`)** — remessas para beneficiamento externo com máquina de estados
(`ABERTA → ENVIADA → RETORNO_PARCIAL → ENCERRADA / CANCELADA`), documento de remessa, retorno
parcial e a quarta coluna de retenção `quantidade_em_terceiros`. É a metade em que **o mesmo
material volta** (galvanizar, pintar, tratar).

**8c (`753d23b..61c6f52`)** — a metade em que **volta outra coisa**: corte, dobra, usinagem. Era o
item sem precedente no módulo — toda movimentação é sobre **um** `material_id`, e aqui sai 1 chapa e
voltam N peças mais uma sobra. Resolvido pelo único caminho em que creditar outro material não é
estoque do nada: baixa e crédito no **mesmo evento** (`CONSUMO_TERCEIRO` + `RETORNO_TRANSFORMACAO`),
por **rota dedicada** (`POST /remessas-terceiros/:id/transformacoes`, gate `remessar_terceiro`), com
o tipo novo em `TIPOS_DEDICADOS` para não cair na rota genérica de movimentação.

| Task / tarefa | O quê | Hash |
|---|---|---|
| — | plano · correção do design que se contradizia sobre o invariante de custo | `d741846` · `601436d` |
| 1 | criar material vira serviço (`materialService.createMaterial`) + `proximo-codigo` pelo **MAX** + `codigo_auto` | `028da1e` |
| 2 | recebimento por NF passa a **alimentar o custo médio** | `8cd3fcf` |
| 3 | `tipo_resultado` na linha de resultado (`TIPOS_RESULTADO` antecipado em `03c7ce5`) | `3e1a8dd` |
| 4 | `RETORNO_TRANSFORMACAO` dentro do motor | `9c7ec75` |
| 5 | a peça cortada tem de ter o **mesmo dono** da chapa | `d791fe2` |
| 6 | rateio de custo — função **pura**, com invariante (`transformCost.js`) | `f6dbe39` |
| 7 | `thirdPartyService.registrarTransformacao` | `a9fe371` |
| 8 | rota, schema Zod e rendimento informativo | `31cf440` |
| 9 | modal de transformação com N resultados, classificação e rendimento | `61c6f52` |
| extra | leitura de custo vira fonte única (`custoSql.js`) — relatório valorava a **ZERO** | `a644ab7` |
| extra | listas de tipos viram fonte única (`movementTypes.js`) — posição por cliente **mentia** | `3ef0144` |

- **As duas tarefas "extra" não estavam no plano** — nasceram da execução das Tasks 4 e 7 e são
  correções de defeito **antigo**, cada uma em commit próprio. Detalhe do mecanismo (e por que a
  suíte verde não achava nenhuma das duas) na spec [03-motor-estoque](03-motor-estoque/README.md).
- **Mudança de comportamento declarada, sem backfill:** material recebido por NF passa a ter custo
  médio real, e **só daqui para frente** — `movimentacoes_almoxarifado` não tem coluna de custo
  nenhuma, então recalcular o passado é impossível; o dado não existe.
- **Pendências abertas que a 8c NÃO resolveu, de propósito:** "uma remessa não mistura donos"
  (deduzida, sem resposta do cliente); `AJUSTE` × retenção, agora com **quatro** colunas; categorias
  hardcoded do front; e o **rendimento** que é calculado, mostrado e jogado fora.

### Etapa 9 — ✅ ENTREGUE em 2026-08-16 → `15-retalhos-sucatas` · Etapa 9b — ✅ ENTREGUE em 2026-08-22 → `16-ferramentas-calibracao`

**A Etapa 9 foi DIVIDIDA no design (2026-08-15)**, mesmo precedente de 6/6b/6c e 8/8b/8c: retalho
é **estoque** (precisa do motor), ferramenta é **patrimônio emprestável** (precisa de cadastro,
empréstimo e calibração com vencimento) — cada subsistema fecha com testes por conta própria.

**Etapa 9 = feature 15 (`b727c0a..4ba94e2`)** — retalho no motor via `ENTRADA_RETALHO` + anexo
dimensional; `gerarRetalho` composto com compensação; sucateamento com dupla aprovação segregada e
baixa na segunda assinatura; destino final com comprovante; relatório `sucata-financeiro` pelo
livro; tela `/almoxarifado/sobras`; etiqueta de retalho com QR. Detalhes, decisões endossadas e
pendências: [spec 15](15-retalhos-sucatas/README.md) e o
[plano da etapa](../../docs/superpowers/plans/2026-08-15-almoxarifado-etapa9-retalhos-sucatas.md).

| Task | O quê | Hash |
|---|---|---|
| 0 | correções declaradas das specs 15 e 16 (afirmavam teste que nunca existiu) | `b727c0a` |
| 1 | sobra reformada — auditoria, Zod, usuário gravado, `POST /sobras` aposentado | `bedce46` · fix `2623b0b` |
| 2 | `ENTRADA_RETALHO` nas fontes únicas | `03b8113` · fix `81c1622` |
| 3 | `gerarRetalho` — evento composto, guarda de dono, compensação | `15dd000` · fix `c3424e4` |
| 4 | rota do evento + retalhos disponíveis por material | `8727ff3` |
| 5 | `SUCATA` sai do formulário genérico (tipo dedicado) | `d5821ac` |
| 6 | sucateamento: tabela, máquina de estados, dupla aprovação, baixa pelo motor | `a30ce6f` · fix `ba545e7` |
| 7 | rotas, comprovante multipart, relatório financeiro pelo livro | `bc34819` |
| 8 | tela Sobras e Retalhos + hint na saída | `e27abe8` |
| 9 | sucateamento na tela + etiqueta de retalho com QR | `b8e8f1a` · fix `4ba94e2` |
| 10 | documentação e verificação final | commits de fechamento |

**Etapa 9b = feature 16 (`d644827..b8e6f60`)** — ferramenta virou patrimônio emprestável completo:
máquina de estados explícita com claim atômico em toda transição, calibração com vencimento lida
da última calibração (sem coluna-cache), avaria/perda com foto fechando o empréstimo aberto no
mesmo ato (RN-05), bloqueio/manutenção/reencontro auditados, ação de perfil própria
`gerenciar_ferramentas`, Zod e auditoria em toda escrita, tela `/almoxarifado/ferramentas` com
três visões. Detalhes, decisões (D1–D12) e correções declaradas:
[spec 16](16-ferramentas-calibracao/README.md), o
[design da etapa](../../docs/superpowers/specs/2026-08-19-almoxarifado-etapa9b-ferramentas-calibracao-design.md)
e o [plano](../../docs/superpowers/plans/2026-08-19-almoxarifado-etapa9b-ferramentas-calibracao.md)
(com a retro de fechamento no final).

| Task | O quê | Hash |
|---|---|---|
| Fase 2 | revisão adversarial do plano — 10 achados acatados, 0 ruído | `d644827` |
| 1 | fundação — tabelas, máquina de estados, ação de perfil | `a62f71a` |
| 2 | empréstimo com claim atômico, calibração barrando, auditoria, gate próprio | `a3d37dd` · fix `718adc3` |
| 3 | calibração com certificado e painel de vencimento | `5e01413` · fix `bdd9848` · fix `40490bc` |
| 7 | tela de ferramentas (galho paralelo, worktree própria) | `96d0879` · fix `0d26c9a` |
| 4 | bloqueio, manutenção e reencontro com claim por transição | `b383b37` · fix `99e5dc7` |
| 5 | avaria e perda com foto — ocorrência fecha empréstimo aberto | `0f89434` · fix `d2adfe6` |
| 6 | empréstimos vencidos — filtro e função pura de lembrete | `f5004df` |
| — | correções declaradas no design durante a execução | `555779d` |
| — | merge do galho paralelo do front | `daffb81` |
| 8 | teste-jornada — calibra, empresta, avaria, conserta, devolve | `d5d949d` |
| — | revisão final de branch: 4 Important (F1–F4, ver spec 16) | fix `60a452e`/`4278d27`/`86090f0`/`b8e6f60` |
| 9 | documentação e verificação final | commits de fechamento |

### Etapa 10 — ✅ ENTREGUE em 2026-08-22 → `17-inventario-contagem`

**Etapa 10 = feature 17, parcial (`d644827..8db2671`)** — o risco crítico registrado desde a
Etapa 7 (ajuste de inventário gravando saldo por fora do motor, sem validação) está resolvido:
tipo dedicado `AJUSTE_INVENTARIO` passa por `stockService.registrarMovimentacao`, com guarda de
retenção nova (função pura, uma fonte, chamada pelo motor e pela pré-validação da rota) que
decide recusar um ajuste que deixaria material bloqueado/reservado/em inspeção/em terceiro com
número negativo — a pendência dos itens B1/B2/B3 do doc de novidades. Contagem cega opcional por
conferência, tolerância configurável com recontagem obrigatória, aplicação tudo-ou-nada. Detalhes,
decisões (D1–D11) e correções declaradas: [spec 17](17-inventario-contagem/README.md), o
[design da etapa](../../docs/superpowers/specs/2026-08-22-almoxarifado-etapa10-inventario-avancado-design.md)
e o [plano](../../docs/superpowers/plans/2026-08-22-almoxarifado-etapa10-inventario-avancado.md)
(com a retro de fechamento no final).

| Task | O quê | Hash |
|---|---|---|
| 1 | motor — tipo AJUSTE_INVENTARIO e guarda de retenção (RN-06) | `4e0fabb` |
| 2 | rota da conferência — contagem cega, tolerância, ajuste tudo-ou-nada via motor | `a30c87e` · fix `d6ea764` |
| — | design e plano (Fase 2: 10 achados acatados, 0 ruído) | `0eced13` |
| 3 | tela de conferência (galho paralelo, worktree própria) | `4f7ed6f` · fix `58f8eb4` |
| — | merge do galho paralelo do front | `314666b` |
| 4 | teste-jornada de integração (14 passos) | `2a8b529` |
| — | revisão final de branch: 1 Critical + 4 Important | fix `38a7afb`/`d3fc0ab`/`8db2671` |
| 5 | documentação e verificação final | commits de fechamento |

**Fora do escopo, declarado — fica para a Etapa 10b:** tipos de contagem avançados (por endereço,
família, cíclica automática por ABC/criticidade, item crítico, surpresa), dupla contagem por duas
pessoas diferentes, congelamento de movimentação durante a contagem, fluxo formal de dupla
aprovação (existe dupla permissão, não duas assinaturas), relatório de acuracidade formal,
e-mail do resultado.

### Etapa 10b — ✅ ENTREGUE em 2026-08-23 → `17-inventario-contagem`

**Etapa 10b = feature 17, segunda rodada (`14f4458..7290481`)** — escopos de contagem
combináveis, dupla contagem por duas pessoas, relatório de acuracidade, RN-08 e o epsilon de
divergência como fonte única. Motor de estoque não tocado. Detalhes, decisões (D1–D12 +
emendas das revisões) e correções declaradas:
[spec 17](17-inventario-contagem/README.md), o
[design da etapa](../../docs/superpowers/specs/2026-08-23-almoxarifado-etapa10b-inventario-avancado-2-design.md)
e o [plano](../../docs/superpowers/plans/2026-08-23-almoxarifado-etapa10b-inventario-avancado-2.md)
(com o registro da revisão final na seção Task 5.5 e a retro no final).

| Task | O quê | Hash |
|---|---|---|
| — | design e plano (Fase 2: 12 achados acatados, 0 ruído) | `14f4458` · `7f78876` · `9f13ad8` |
| 1 | escopo combinável no POST /conferencias (RN-01/02) | `c1ee37b` · fix `7e66d02` |
| 2 | dupla contagem + autoria por item (RN-03/04, RN-08) | `80a7fea` · fix `b16561a` |
| 3 | impacto persistido + relatório de acuracidade (RN-05/06/07) | `78cdbcd` · fix `957d148` |
| 4 | tela (galho paralelo, worktree própria) | `b8490cc` · fix `cfe44bf` · merge `a95db02` |
| 5 | teste-jornada de composição | `f4f2301` |
| — | revisão final de branch: 1 Critical + 8 Important + 11 Minor, 0 ruído | fix `7290481` |
| 6 | documentação e verificação final | commits de fechamento |

**Fora, declarado (sem etapa marcada):** contagem por endereço, cíclica automática,
congelamento, dupla aprovação formal (aguarda B11), e-mail, conciliação lado a lado.

### Etapa 11 — ✅ ENTREGUE em 2026-08-24 → `18-reposicao-estoque-minimo`

**Etapa 11 = feature 18 (`54e1278..1ea6ab2`)** — sugestão de reposição calculada e
consolidada, geração de solicitações, estoque parado e a tela para quem decide compra.
Detalhes, decisões e correções declaradas: [spec 18](18-reposicao-estoque-minimo/README.md),
o [design](../../docs/superpowers/specs/2026-08-23-almoxarifado-etapa11-reposicao-compras-design.md)
e o [plano](../../docs/superpowers/plans/2026-08-23-almoxarifado-etapa11-reposicao-compras.md).

| Task | O quê | Hash |
|---|---|---|
| — | design e plano (Fase 2: 15 achados acatados, 1 ruído) | `54e1278` · `5564d4d` · `b2a5a46` |
| 1 | motor de sugestão + GET /sugestoes (RN-01..06, 08) | `7f04e42` · fix `cd83b1e` |
| 2 | gerar solicitações + estoque parado (RN-07, 09) | `21dde5e` · fix `eec45b8` |
| 3 | tela 3 abas + configs (galho paralelo, worktree) | `a65e501` · fix `8a7208c` · merge `5b861ec` |
| 4 | teste-jornada de composição (10 passos) | `4574963` |
| — | revisão final de branch (2 revisores): 1 Critical + 7 Important, 0 ruído | fixes `95fb25b` (backend) · `1ea6ab2` (front) |
| 5 | documentação e verificação final | commits de fechamento |

### Etapa 12 — Notificações completas → `19-emails-notificacoes` + `20-alertas` — ✅ ENTREGUE (2026-08-24, `c1613c2..d7fee6c`)
Fila com retry/dedupe/histórico; e-mail de movimentação por classes (default OFF); 3 dívidas pagas; 3 alertas novos; painel gateado. Restos da 20 (motor único, central no front, ~16 alertas) ficam com as features donas.

### Etapa 13 — Relatórios e indicadores → `21-relatorios-dashboards` — ✅ ENTREGUE (2026-08-24, `4fdda54..8bb5e52`)
Registro único com gate por chave; tela dirigida pelo registro; export XLSX; indicadores; cartões no dashboard. Restos declarados (PDF, previsto×realizado) com as features donas.

### Etapa 14 — Integrações → `22-integracoes` — ✅ ENTREGUE (2026-08-25, `b276dca..2de7944`)
A Fase 0 mediu a maturidade antes de prometer: Compras maduro (integrado de verdade — ciclo da solicitação fecha no recebimento, cancelar com justificativa, contexto do comprador) + custo por projeto pelo livro com herança de projeto na devolução. BOM/OP/centro-de-custo BLOQUEADOS por dependência, com a medição escrita na spec 22 — não são promessa.

### Etapa 15 — ✅ ENTREGUE em 2026-08-28 → `24-mobilidade` (`7f74b6c..a82ad43`)
A Fase 4 da spec original dizia "código de barras, coletores, app móvel, assinatura digital" — a Fase 0 da etapa **mediu** e entregou a fatia real: scanner de QR pela câmera (fecha o ciclo das etiquetas 6c), assinatura do recebedor na entrega de requisição e o balcão usável no celular. O que ficou fora está declarado com o porquê na spec 24 e nas letras B25-B27/D das novidades. Próxima frente: pelo mapa de status (não há mais roteiro de etapas — ver o cabeçalho).

### Etapa 26 — ✅ ENTREGUE em 2026-08-29 → `01-cadastros-materiais` (`1bca087..9d86a84`)
A dívida mais **antiga** ainda aberta do módulo: as categorias de material estavam hardcoded no front desde a Etapa 2 (2026-08-04), a Etapa 8c encostou nelas e não resolveu, e a **B6** ("qual lista vale?") esperava resposta desde então. A Fase 0 mediu e mostrou que a pergunta estava incompleta: **as duas listas não tinham UMA categoria em comum** — 11 nomes genéricos em MAIÚSCULAS no código do front contra as **27 de metalúrgica** semeadas em `categorias_material_almoxarifado`, estas com **zero materiais usando**. O `GET` já existia e já era consumido; faltavam POST/PUT/DELETE e faltava qualquer formulário de material ler dali. Quatro tasks. Entregue: (1) o **CRUD** em `extended.js` com molde **híbrido por assunto** — gate `requirePermission('configurar')` e auditoria dos **centros de custo** (mesmo arquivo; o `auditarCadastro` de famílias é closure **não exportada**, inalcançável de lá), régua de nome e unicidade dos **setores**, soft delete dos **tipos de material** na versão corrigida pela Etapa 23 — mais `CREATE UNIQUE INDEX idx_categorias_almox_nome`, `?todos=1` no GET e `categoria: 'Categoria'` no `auditLabels`; (2) as **três** telas lendo o catálogo pelo hook único `useCategoriasMaterial.js`, **sem cache de módulo de propósito** (com cache, a categoria recém-criada não apareceria no select até um reload — o mesmo "a tela mente" que a etapa corrige); (3) a aba **Categorias** em Configurações, com **reativar** e o aviso da RN-05 no renomear; (4) integração lida pela **tela-contrato** da auditoria, afirmando **composição** e não total fixo. **Dois defeitos que só apareceram ao medir, e nenhum estava no design:** o `<select>` é controlado por state e o React **não dispara `onChange`** para valor ausente das opções, então a tela exibia `Aço carbono` enquanto o payload mandava `CONSUMÍVEL` — **a tela mentia sobre o banco**, o que é pior que trocar o valor porque não deixa rastro; e `materialService.createMaterial` faz `categoria: categoria || 'OUTROS'`, então "fazer o campo nascer vazio" apenas trocaria "nasce `CONSUMÍVEL`" por "nasce `OUTROS`", escolhido pelo **servidor** e sem passar pela tela (daí a trava de submit *"Selecione a categoria do material"* — **só do vazio**; categoria fora de catálogo continua salvando). **⚠️ E a Fase 0 desta etapa ERROU a varredura tendo a resposta dentro do repositório:** escreveu "3 arquivos" e nomeou **dois**, contando duas linhas do mesmo `MaterialAlmoxarifadoForm.js` como arquivos diferentes e deixando `MateriaisAlmoxarifado.js` de fora — enquanto `01-cadastros-materiais/README.md:52` **já nomeava os três** e já dizia "mexe em três telas". Executado assim, o plano teria violado a própria RN-01 e deixado a pendência impossível de fechar. É a **segunda etapa seguida** (a 24 foi a primeira) em que uma varredura sobre "o que existe no client" falha com a resposta pronta na spec: **a regra que fica é ler a spec da feature ANTES de medir o código**. **A feature 01 continua 🟡** — fecha um item do checklist de Frontend; seguem abertos tabela de conversões, grupo acima de família, motivos/transportadoras/tipos de documento, `almoxarifadoApi.js` e anexos na tela. **Nada foi migrado, de propósito:** os materiais existentes continuam com a categoria antiga (consulta **A6**), renomear não propaga (**B58**), e o filtro de categoria devolve zero para as categorias novas até o acervo ser remapeado (furo **C33**).

### Etapa 24 — ✅ ENTREGUE em 2026-08-29 → `23-perfis-seguranca-auditoria` + `09-inspecao-qualidade` (`a81e51a..4680daa`)
Fatia 6 da feature 23, e **a primeira que não é da perna de auditoria**: as etapas 18-23 fecharam *Auditoria*, esta abre *Perfis*. Quatro tasks. **A Fase 2 derrubou a PREMISSA da etapa** e o plano foi reescrito no meio: o design afirmava que *"nenhum componente do client consome as rotas de perfil"* e mandava **criar** a tela `/almoxarifado/perfis` — a tela **existe** desde `6018f0a` (2026-08-05), é a aba *Perfis de Acesso* de `ConfiguracoesAlmoxarifado.js:2545`, está no menu, no manual e tinha **sete** atribuições registradas no banco de desenvolvimento. O erro nasceu de duas fontes que se somaram: o checklist de Perfis da spec 23 dava a UI como não construída (**e estava errado há três semanas**), e a varredura do client procurou pelo nome que eu imaginava (`perfil_almoxarifado`) em vez do nome do **contrato** (`perfis-usuario`), que vive no arquivo de outra aba. **Sem a correção, o módulo teria ganhado uma segunda porta para a mesma função.** O escopo virou: o perfil que falta + **quatro defeitos do que já existe**. Entregue: (1) perfil **QUALIDADE** com `visualizar` e `inspecionar` e **nada além**, provado no gate real — e `ver_alertas` **excluído de propósito**, corrigindo uma decisão anterior do próprio design cuja justificativa era falsa (`montarCentral` não tem régua por perfil e entrega 11 alertas, dois com `valor_parado`); (2) a **revogação** de perfil passou a auditar — o caminho "voltar ao padrão" retornava **antes** do `registrarAuditoria`, então tirar o acesso de alguém, o ato mais sensível do módulo, era **invisível na trilha** — e a concessão passou a gravar `dados_anteriores`, com os dois lados na **mesma forma** porque `alteracoesDaLinha` é união de chaves e chave de um lado só sairia como `null -> valor` fingindo alteração; (3) **`ADMINISTRADOR` fora do seletor**, porque ele escala (`hasAlmoxAdminPerfil` → `canConfigureModule`, marcado como `explicito`, então o 409 não o protege) **e** evapora (`syncModuleAdminProfiles` apaga a linha no save seguinte do cadastro) — o filtro é da **tela**, não migração, daí a consulta **A4** e o furo **C31**; (4) a aba ganhou os **7 primeiros testes** (tinha zero) e uma integração que dá e tira o perfil pelas rotas reais e lê pela **tela-contrato** de auditoria, afirmando a **composição** dos verbos em vez de um total fixo — o modo de errar que o plano da Etapa 23 cometeu. Achado do fechamento, fora do plano: o mapa de rótulos de perfil do client não tinha `QUALIDADE`, e o 403 dizia *"seu perfil é QUALIDADE"* em caixa alta (`4680daa`). Achado metodológico que virou regra na skill: **asserção negativa sobre permissão não fica vermelha no TDD** — o cenário "não pode movimentar" passa verde antes de o perfil existir, então a lista negativa **só tem prova pelo controle positivo**. Três decisões em **B54-B56** (o fallback `PRODUCAO`, agora viável de apertar — **a única em aberto**; `ver_alertas` fora; `ajustar_estoque` fora). **A feature 23 continua 🟡-forte**, e o que falta para 🟢 mudou de item pela **quarta** vez: agora é a perna **Segurança**, intacta. **A feature 09 avança**: o perfil QUALIDADE, que ela nomeava como pendência desde a Etapa 5, foi pago — com a ressalva, que ela **já nomeava em 2026-08-11**, de que bloqueio avulso usa `ajustar_estoque` e ficou fora.

### Etapa 23 — ✅ ENTREGUE em 2026-08-28 → `23-perfis-seguranca-auditoria` (`0fe8d02..4f1aeb9`)
Fatia 5 da feature 23, e a **primeira que a etapa anterior pediu explicitamente ao fechar**: a Etapa 22 deu tela à trilha e, ao fazê-lo, transformou dois defeitos teóricos em coisa que **quem audita vê**. Sem tela nova — o que a etapa entrega é a **confiança no que a tela da 22 mostra**. Quatro tasks — três de código e uma de integração/fechamento; **a Task 0 não existia no plano e a Fase 2 a acrescentou**, porque sem ela a RN-01 seria promessa falsa: (0) o retry de `SQLITE_BUSY` para de chamar o callback de quem pediu em toda tentativa — antes, a rota respondia 500, pulava a auditoria, e o retry gravava depois; **esta task não estava no plano e sem ela a RN-01 seria promessa falsa**; (1) `PUT /configuracoes` vira **um** `UPDATE` com `CASE … WHERE chave IN (…)`, atômico por statement, **sem transação** (uma conexão só no CRM: `ROLLBACK` desfaria escrita alheia); (2) as **cinco** rotas de exclusão distinguem "não existe" de "já inativa" — `AND ativo = 1` nas quatro de cadastro, e no `DELETE /materiais/:id` muda **só** a condição da auditoria, porque o contrato dela (200 também para id inexistente) é da Etapa 19 e fica inalterado. A prova que dá sentido à etapa é a leitura **pela tela-contrato** (`GET /auditoria?entidade=…&entidade_id=…`), não pelo banco: a trilha mostra **um** ato, não dois. **A feature NÃO virou 🟢** e a decisão está escrita na spec 23 — mas desta vez o motivo é outro: a perna de **auditoria** terminou, e o que bloqueia são as pernas de **Perfis** e **Segurança**, 10 itens de funcionalidade não construída que as duas leituras de cor anteriores não pesaram. Três decisões tomadas no lugar do usuário em **B51-B53** (a transação descartada com o motivo medido; a exclusão idempotente respondendo 200 em vez de 400/409; e a doutrina do log que estava escrita no código e **perdeu** — o comentário defendia registrar "quem tentou desativar de novo"); uma em aberto (**B52**, se a tela deve avisar). Uma afirmação **errada há três etapas** foi corrigida em voz alta no checklist de Segurança da spec: ela dizia que "localizações, setores, famílias e configs seguem sem auditoria", falso desde a Etapa 19.

### Etapa 22 — ✅ ENTREGUE em 2026-08-28 → `23-perfis-seguranca-auditoria` (`8c6ffbe..169458d`)
Fatia 4 da feature 23, e a que quatro etapas seguidas apontaram como "o que falta para 🟢": **a trilha ganha leitor**. Três etapas (18, 19, 20) instrumentaram 30+ endpoints e **nenhuma tela consumia** o resultado — a única leitura possível era consulta técnica ao banco. Entregou `/almoxarifado/auditoria` (menu `adminOnly`, gate `configurar` — o mesmo gate do dado) com filtro de entidade, ação, usuário e período, de/para expansível, paginação por offset e truncamento de valores em 300 caracteres; os quatro filtros no GET com placeholder por valor no `IN`; validação de data por ida-e-volta e 400 de período invertido; a janela convertida para UTC com fuso **constante do módulo**; `GET /auditoria/opcoes` por `SELECT DISTINCT`; e os **3 índices** que `auditoria_log_almoxarifado` nunca teve (era a única tabela do schema sem nenhum). A régua do de/para é **nova e própria**: reusar `configDiff.calcularDiff` apagaria a troca de segredo mascarada e fabricaria alteração a partir de campo de contexto — foi o achado mais grave da revisão do plano, e há cenário-testemunha congelando o porquê. **A feature NÃO virou 🟢**, e a decisão está escrita na spec 23: o que falta mudou de item — são os **dois buracos de rastro** (ato parcial do `PUT /configuracoes` sem transação e sem linha de histórico; `EXCLUSAO` de linha já inativa), que são defeito meu, não decisão do usuário. Quatro decisões tomadas no lugar dele em **B47-B50**; **B33 metade (a) fechada**, metade (b) (gate ADMIN-only) segue em aberto.

### Etapa 21 — ✅ ENTREGUE em 2026-08-28 → **núcleo do CRM, nenhuma feature deste mapa** (`d5c8d3a..07a4b1c`)
**A primeira etapa fora do módulo.** Não mexe em feature nenhuma daqui e por isso **nenhuma cor mudou** — está registrada no mapa para o laço não ficar aberto: foi o design da Etapa 20 que empurrou estes itens para fora dizendo "são do core, não do módulo", e o registro deles vive no bloco "Etapa 21" da spec 23. Entregou: o zip de `GET /api/backup` sem `.runtime-secrets.json` (quem baixava **forjava token de superadmin**) e sem as ~188 MB de cópias históricas, com a cópia mais recente somada de volta para o fallback de `dbRecovery` continuar existindo; `timingSafeEqual` no token e log de todo download com IP real; `getEmailConfig` preferindo o ambiente, com o banco fora por medição; e os dois GETs de configuração do core mascarando `email_smtp_pass`, com o PUT recusando a máscara em 400 e a tela do core corrigida junto. Cinco decisões tomadas no lugar do usuário em **B42-B46**; **nenhuma em aberto**. A única pendência é operação e não código: a **rotação da senha na Locaweb** (letra **A3**, furo **C27**).

### Etapa 20 — ✅ ENTREGUE em 2026-08-28 → `23-perfis-seguranca-auditoria` (`1b0f0e9..a3f5135`)
Fatia 3 da feature 23: os **três** itens que a Etapa 19 tinha deixado escritos como "fora do escopo, nomeados" — e que por isso mesmo tinham de ser pagos antes de a spec envelhecer com eles. Nenhum é tela: a rota de foto de material parou de responder sucesso para material que não existe (e de deixar arquivo órfão, e de apagar a foto anterior em corrida com a gravação, e de não auditar); a leitura das configurações parou de devolver senha de SMTP e chave de API em claro, com o PUT genérico passando a recusá-las; e ler o mapa de permissões por setor passou a exigir o mesmo que escrevê-lo. Quatro decisões tomadas no lugar do usuário estão registradas em B37-B40 das novidades e uma ficou **em aberto** (B41, o buraco irmão que a revisão adversarial achou). Tocou também a spec 24, renomeando o G7 para não continuar chamando a rota de foto de defeituosa.

### Etapa 19 — ✅ ENTREGUE em 2026-08-28 → `23-perfis-seguranca-auditoria` (`a574b3a..55e4144`)
Fatia 2 da feature 23: os 23 endpoints de cadastro e configuração. O trabalho não foi "sair auditando tudo igual" — foi descobrir, por medição, as seis classes que exigiam tratamento diferente (diff, segredo, criação × reativação, rotas sem 404, cascata sem contagem, e lote de material que não é configuração).

### Etapa 18 — ✅ ENTREGUE em 2026-08-28 → `23-perfis-seguranca-auditoria` (`adf7233..aee9c9e`)
Escolhida pelo handoff da 17: o buraco de auditoria mais antigo do mapa. Entregou a trilha do inventário, o cancelamento com motivo e autor, as colunas de aprovador ressuscitadas, três atos vizinhos auditados e o gate do log — mais a correção de duas specs que descreviam um bug morto desde a Etapa 10.

### Etapa 17 — ✅ ENTREGUE em 2026-08-28 → `20-alertas` (`d65d81b..e51ca79`)
Fatia 2 da feature 20, escolhida pelo handoff da 16: os alertas que nascem no ATO (reprovação, divergência de recebimento, divergência de inventário) mais o resumo de lotes sem certificado. O modo evento é aditivo — a mesma entrada do registro serve à central, à varredura e ao gancho.

### Etapa 16 — ✅ ENTREGUE em 2026-08-28 → `20-alertas` (`d9750ce..ed5f032`)
Fora do roteiro original (o roteiro acabava na 15): escolhida pelo mapa como a maior lacuna. Registro de alertas como fonte única, 7 alertas novos pela fila existente e a central ao vivo no front. O que resta da feature 20 está nomeado na spec dela; a próxima frente sai do mapa (ver cabeçalho).

## Critérios de aceite do módulo (spec seção 34)

O módulo só é considerado operacional quando TODOS estes itens forem verdade (feature responsável entre parênteses):

- [ ] Identificar onde está cada material (02, 03)
- [ ] Identificar quantidade física, reservada, bloqueada e disponível (03, 07, 09)
- [ ] Identificar quem movimentou, quando e para qual projeto/OS (03, 23) — nota Etapa 3 (2026-08-05): entrega/estorno de requisição via motor já grava `projeto_id`, `centro_custo_id` e `requisicao_id` na movimentação (verificado em `requisicaoEntregaMotor.api.test.js`); OS continua só como texto livre (`os_referencia` na requisição, sem `os_id` estruturado) — critério ainda não 100% atendido
- [x] **Rastrear lote e número de série (10) — atendido por completo (2026-08-11).** **Lote:** a Etapa 6 entregou a entidade real, o vínculo do saldo e do ledger por `lote_id`, validade/corrida/certificado/status, guardas de saída e FEFO. **Série:** a Etapa 6b entregou `series_almoxarifado` + `seriesService`, motor integrado, rotas HTTP e UI completa (Movimentações, Recebimentos, aba Séries) — `controle_serie` deixou de ser flag morta. **Etiqueta física com QR:** a Etapa 6c fechou o ciclo — cada lote/série pode ser impresso em PDF (A4 ou térmica) com um QR que abre a tela do item já filtrada, ligando o objeto físico no galpão de volta ao registro do sistema. As três pernas do critério — lote, série e a etiqueta que os torna rastreáveis fora da tela — estão entregues. Falta ainda a consulta agregada "tudo que aconteceu com este lote/série" (os dados existem em três tabelas, sem um extrato que os junte) — pendência registrada na spec 10, não bloqueia este critério
- [x] **Separar materiais próprios dos de clientes (13) — atendido (Etapa 8, 2026-08-12).** O
  material de cliente tem dono na própria linha do catálogo (`proprietario_cliente_id`), fica
  **fora** de toda leitura de estoque próprio (dashboard, valor total, reposição de mínimo,
  sugestão de compra, relatório de posição — 40 leituras auditadas e classificadas), **aparece de
  propósito** onde misturar é o correto (ocupação de prateleira, materiais bloqueados, materiais
  sem endereço, e as telas operacionais, sempre com o **selo nomeando o cliente**), só sai com
  OS/projeto do próprio dono, e tem posição consolidada por cliente com PDF. **Ressalva
  registrada:** a conferência de inventário ainda ajusta `quantidade_atual` fora do motor, logo
  fora da permissão dedicada — ver a spec 13
- [x] **Controlar materiais enviados a terceiros (14) — atendido (Etapas 8b + 8c, 2026-08-12/13).**
  O material que sai para beneficiamento externo sai do **disponível** sem sair do **patrimônio**
  (`quantidade_em_terceiros`), tem remessa com máquina de estados, documento, prazo, retorno parcial
  com teto por item e encerramento com destino obrigatório (8b); e quando o que volta **não é o
  mesmo material** — corte, dobra, usinagem — a chapa é baixada e as peças entram no mesmo evento,
  com o custo rateado (8c). **Ressalvas registradas, nenhuma bloqueia o critério:** "uma remessa não
  mistura donos" foi **deduzida** e ainda espera resposta do cliente; e-mail (19) e alerta de atraso
  (20) estão declarados fora do escopo — ver a spec 14
- [ ] Registrar entradas/saídas sem permitir exclusão do histórico (03, 23)
- [ ] E-mail automático de todas as entradas e saídas (19)
- [ ] Inventários e ajustes aprovados (17, 06)
- [ ] Histórico completo de qualquer material (03, 21)
- [~] **Custo e consumo por projeto (22) — parcialmente atendido (Etapa 14, 2026-08-25).**
  O relatório `custo-por-projeto` entrega consumido/devolvido/líquido por projeto computado do
  livro, com a devolução herdando o projeto da saída. **Ressalva que impede o [x] pleno:** o
  custo aplicado é o **atual** do material, retroativo (o livro não guarda custo por
  movimento) — custo histórico exato por movimento exigiria coluna nova no livro, decisão
  registrada na spec 22
- [~] **Bloquear materiais reprovados ou indisponíveis (09, 10) — parcialmente atendido.** Por **material**: sim, desde a Etapa 5 (bloqueio/quarentena/decisão de inspeção). Por **lote**: o status `REPROVADO`/`BLOQUEADO` existe e o motor recusa a saída (Etapa 6), mas `inspectionService.decidirInspecao` ainda bloqueia o material inteiro e não marca o lote — ligar os dois é mudança na feature 09
- [ ] Relatórios gerenciais e de auditoria (21, 23)

## Débitos técnicos críticos (levantados em 2026-08-02 — estado revisado em 2026-08-11)

Esta lista era o retrato de 2026-08-02. A auditoria de 2026-08-11 confirmou que a maioria foi
resolvida pela Etapa 0 e seguintes — manter a lista sem estado fazia parecer que tudo seguia aberto.

1. ✅ **Duas rotas de movimentação** — resolvido (Etapa 0/1): a v1 delega ao motor
   (`stockService.registrarMovimentacao`) com auditoria; o front usa a v2 nas movimentações.
2. 🟡 **DDL duplicado** — `CREATE TABLE` vive só em `schema.js` (com teste guardião), mas restam
   **21 `ALTER TABLE` com erro engolido** em `routes/almoxarifado.js` (achado 2026-08-11, pendência
   nomeada na spec 00).
3. ✅ **Sem testes de API reais** — resolvido (Etapa 0): harness `tests/helpers/testApp.js` +
   supertest; 48 arquivos em `tests/api/` em 2026-08-11.
4. ✅ **`safeAlter` engole qualquer erro** — resolvido (Etapa 0): só engole `duplicate column name`,
   o resto propaga.
5. ✅ **SMTP hardcoded** — decisão do dev dono do projeto (2026-08-05): fica como está. Não mexer
   sem confirmação.
6. ✅ **Permissão inconsistente** (`role !== 'admin'` cru) — resolvido: `canConfigureAlmox`.
7. ✅ **`express-validator` não usado** — resolvido (2026-08-03): removido; padrão é **Zod** via
   `validate(schema)`; rotas novas nascem validadas, antigas migram quando tocadas.

## Convenções de atualização

- Marcou um item feito → confirme que existe **teste passando** antes de marcar `[x]` em "Regras essenciais".
- Mudou o status geral de uma feature → atualizar também a tabela deste README.
- Descobriu requisito novo → adicionar no README da feature (nunca só na cabeça ou no chat).
- Toda sessão de trabalho começa lendo este README + o README da feature alvo.
