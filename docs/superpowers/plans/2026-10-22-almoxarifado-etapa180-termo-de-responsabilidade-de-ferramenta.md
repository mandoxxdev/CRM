# Etapa 180 — Termo de responsabilidade no empréstimo de ferramenta (RN-D)

> **Status:** ✅ fechada (2026-10-22) — T1 `2092806d`, T2 `11ef2821`, T3 `04b9d2fb` (front — a tela de empréstimo voltou a funcionar), T4 `31fb475f`+`3d161c35` (integração pela rota + a matrícula
> confirmada que a tela imprimia como "1"), **Fase 5** `c40b1f56`, `bcd89a2f`, `003de01b` e o fechamento (ver "Execução" no fim, com o contrato real para o front). **Próxima: Etapa 181** (fim do
> documento). Emendada da "próxima tarefa detalhada" da Etapa 178 (B1169). A 179 é da outra sessão (sem escopo ainda).
> **Origem:** pergunta 3 da usuária (21/10): *"solicitamos a assinatura do colaborador responsável pela utilização ou
> retirada… empréstimo de equipamentos e ferramentas, incluindo o registro da devolução"*; RN-D do design de 16/09: o
> empréstimo guarda **quem aceitou, quando e qual versão do texto**.
> **⚠️ O texto do termo NÃO foi fornecido pela empresa** (os formulários foram pedidos e não chegaram). A etapa entra com
> um **texto provisório marcado como tal** e o administrador troca pela tela — cada troca é uma **versão nova**; o
> empréstimo guarda a versão que o colaborador assinou. Letra B.
> **Fase 0 (medido):** empréstimo grava `colaborador_nome` **digitado** (o `colaborador_id` existe na tabela mas a tela
> nunca o envia); sem transação (claim → INSERT com compensação); `codigo_patrimonio` obrigatório e único, `numero_serie`
> opcional; a cadeia de evidências da 178 é **global** mas `verificarCadeia` só sabe montar o registro de EPI (`epiService.js:515`
> devolve `null` para outro contexto → "registro alterado"); `configuracoes_almoxarifado` sobrescreve (sem versão);
> `/aux/colaboradores` exige `entregar_epi`; a 177 não mexeu no empréstimo; o banco local tem 0 ferramentas.

## Regras

| ID | Regra | Cenário / mensagem literal |
|---|---|---|
| RN-180.01 | **Cadeia multi-contexto (tronco, vai primeiro):** `evidenciaAssinaturaService` ganha um registro de montadores por contexto (`registrarContexto(contexto, montador)`); `verificarCadeia` usa o montador do contexto da linha; contexto sem montador → `{ integro: false, motivo: 'contexto desconhecido' }`. O EPI registra o dele. A rota da cadeia passa a ser `GET /api/almoxarifado/evidencias/cadeia/verificar` (permissão `entregar_epi` **ou** `gerenciar_ferramentas`); `/epi/cadeia/verificar` continua como apelido. | um termo gravado não faz o EPI acusar "registro alterado" |
| RN-180.02 | **Texto do termo versionado:** tabela `termos_responsabilidade_versao` (`tipo`, `versao` int, `texto`, `texto_sha256`, `criado_por`, `criado_por_nome`, `criado_em` do Node; UNIQUE(tipo, versao); triggers append-only). Vigente = maior versão do tipo. Semente v1 (`FERRAMENTA`) com texto que começa por `TEXTO PROVISÓRIO — substituir pelo termo da empresa.` `POST /api/almoxarifado/termos/FERRAMENTA` (só ADMINISTRADOR, ação nova `editar_termos`) cria a próxima versão; texto vazio → 400 `O texto do termo é obrigatório`; igual ao vigente → 400 `O texto é igual ao da versão vigente`. `GET /api/almoxarifado/termos/FERRAMENTA` → `{ vigente: {versao, texto, criado_em, criado_por_nome, provisorio: bool}, historico: [...] }`. | — |
| RN-180.03 | **Empréstimo com colaborador do cadastro:** `colaborador_id` passa a ser **obrigatório** (ativo, régua da 178); `colaborador_nome` vira snapshot do cadastro (o digitado é ignorado). Recusas da 178 (`Colaborador #<id> não encontrado`, `Colaborador <nome> não está ativo`). `/aux/colaboradores` aceita `entregar_epi` **ou** `gerenciar_ferramentas`. | — |
| RN-180.04 | **Termo assinado no ato do empréstimo:** multipart com `assinatura` (PNG, régua da 178), `confirmacao_matricula` (régua da 178) e `termo_versao` (a versão que a tela mostrou; diferente da vigente → 409 `O texto do termo mudou (versão <n>) — releia e assine de novo`). Gravação **numa transação só** (`execEmTransacao`): claim DISPONIVEL→EMPRESTADA + INSERT do empréstimo + evidência `contexto='TERMO_FERRAMENTA'`, `contexto_id = emprestimo.id`. O HMAC cobre: ferramenta (id, `codigo_patrimonio`, `numero_serie`, nome), colaborador (snapshot + matrícula confirmada), `termo_versao` + `texto_sha256`, `data_prevista_devolucao`, quem registrou, `criado_em`, arquivo, ip, user_agent. Idempotência por `chave_idempotencia` (molde 178). | assinatura ausente → 400 `A assinatura do colaborador é obrigatória` |
| RN-180.05 | **Termo do empréstimo recuperável:** `GET /api/almoxarifado/ferramentas/emprestimos/:id/termo` (`gerenciar_ferramentas`) → empréstimo + texto **da versão assinada** + evidência (`arquivo_url`, `registro_sha256`, `confirmado_por_matricula`); `GET …/termo/verificar` → `{ integro }` (molde 178). PDF no navegador (jsPDF, montador puro testável) com o texto, os dados e a assinatura. Empréstimo antigo, sem termo → 404 `Este empréstimo não tem termo assinado (anterior à exigência)`. | — |
| RN-180.06 | Leitura de empréstimos (`GET /emprestimos`) passa a exigir `gerenciar_ferramentas` e devolve `tem_termo` por linha. | PRODUCAO → 403 |

## Tasks

| # | Task | Tipo |
|---|---|---|
| T1 | RN-180.01 (cadeia multi-contexto) + testes provando que EPI continua íntegro com um contexto alheio gravado. | tronco |
| T2 | RN-180.02..06 backend + testes (inclui corrida: dois empréstimos da mesma ferramenta → um 201, outro 409 do claim, nada órfão; versão trocada no meio → 409). | tronco |
| T3 | Front: modal de empréstimo com colaborador do cadastro, texto vigente exibido (com selo "provisório"), matrícula + assinatura; "Termo" por empréstimo (ver/PDF/verificar); tela do administrador para nova versão do texto com histórico. Mock só na fronteira HTTP. | galho (depois da T2, contrato acima) |
| T4 | Integração pela rota: versão nova → empréstimo assinado → termo PDF/verificar → cadeia íntegra com EPI e termo misturados → devolução. | integração |

## Fora do escopo (letra D)

- RN-C (retirada **definitiva** com baixa em estoque) — contradiz "ferramenta é patrimônio, não estoque"
  (`toolStateMachine.js:3`); precisa de decisão da empresa.
- Assinatura na **devolução** (a devolução continua sem termo).
- Texto jurídico do termo — responsabilidade da empresa.

## Próxima tarefa detalhada

Ver **"Próxima tarefa detalhada — Etapa 181"** no fim (o relatório "EPI por colaborador" passa a ler as entregas de EPI da 178).

---

## Revisão da Fase 2 (2026-10-22) — 3 críticos, 4 importantes; as emendas PREVALECEM

- **C1 — o termo é uma FOTOGRAFIA congelada:** tabela nova append-only `termos_emprestimo_ferramenta` (triggers, sem
  FK; molde `entregas_epi`): `numero` UNIQUE (`TERMO-…`), `emprestimo_id` UNIQUE, snapshot da ferramenta (id,
  `codigo_patrimonio`, `numero_serie`, nome), snapshot do colaborador (id, nome, matrícula, setor), `termo_versao`,
  `texto_sha256`, `data_prevista_devolucao`, `criado_por`, `criado_por_nome`, `criado_em` (Node), `chave_idempotencia`
  UNIQUE. O HMAC cobre **só** essa linha + a evidência (vínculo pelo `numero`, como `camposDoRegistro` do EPI). Nada
  do empréstimo vivo nem da ferramenta viva entra no HMAC (a devolução, a ocorrência e o `PUT /ferramentas/:id` mudam
  esses). A existência da linha é a marca "empréstimo com termo" (o 404 "anterior à exigência" da RN-180.05 sai dela).
- **C2 — claim que falha de verdade dentro do `execEmTransacao`:** os INSERTs condicionados (`INSERT … SELECT … WHERE
  changes() = 1` depois do `UPDATE … WHERE status='DISPONIVEL' AND ativo = 1`, ou `NOT EXISTS` de empréstimo EMPRESTADA
  da ferramenta); depois do COMMIT, **reler pela chave/número** para distinguir 201 de 409 `A ferramenta não está
  disponível` (molde `epiService.js:374-399`); evidência inserida por `SELECT … FROM termos_emprestimo_ferramenta WHERE
  numero = …`.
- **C3 — fila da cadeia:** a gravação do termo roda em `naFilaDaCadeia` com `cabecaDaCadeia` (como a do EPI) — senão
  termo e EPI simultâneos disputam a `sequencia`.
- **I1 — testes existentes:** ~12 arquivos (`tool*.api.test.js`, `auditoriaDoAtoCadastros`, `validadesNoDiaLocal`) e o
  `FerramentasAlmoxarifado.test.js` mandam JSON só com `colaborador_nome` → helper de teste `emprestarComTermo` e
  migração dos testes **na T2**; validação no serviço depois do multer (como a rota de EPI), com coerção de string.
- **I2 — controles extras por contexto:** o registro de contexto (RN-180.01) inclui `extras(db)`; o EPI registra os
  dele ("entrega sem evidência", cauda apagada); o termo registra "termo sem evidência".
- **I3 — idempotência ANTES do claim** (reenvio com a mesma chave devolve o empréstimo gravado, 200).
- **I4 — permissões:** helper `requireAlgumaPermissao([...])` para `/aux/colaboradores` e `/evidencias/cadeia/verificar`
  (`entregar_epi` ou `gerenciar_ferramentas`); `GET /termos/FERRAMENTA` exige `gerenciar_ferramentas`; o POST de versão
  exige `editar_termos` (só ADMINISTRADOR) e aparece em `minhas-permissoes`.
- **Menores:** calibração vencida continua bloqueando, no serviço, antes do claim, com `limparUploadOrfaoEm` em toda saída
  ≠ 201; colaborador **sem matrícula** é recusado no empréstimo (regra nova — letra C); setor do snapshot vem do
  cadastro; a versão vigente é comparada **dentro** da transação; dois admins salvando juntos → 409 `Outra versão do
  termo acabou de ser salva — recarregue`, não 500; tabela de versões **sem FK** para `usuarios`; T1 extrai
  `colaboradorAtivo`, `conferirMatricula`, `conferirPng`, `chaveIdempotencia` para um módulo comum
  (`services/almoxarifado/identificacaoColaborador.js`); a T3 esconde a aba Empréstimos para quem não tem
  `gerenciar_ferramentas`.
- **Letra D:** o relatório "EPI por colaborador" (`reportService.js:561`) lê empréstimos de ferramenta `tipo='EPI'` e
  ignora as entregas de EPI da 178 — enganoso, pré-existente, fora desta etapa.

---

## Execução

### T1 (tronco) — ✅ 2026-10-22 — `2092806d`

- [x] `evidenciaAssinaturaService.registrarContexto(ctx, { montador, extras })` (+ `removerContexto`, `contextosRegistrados`):
  `montador(db)` prepara uma vez por verificação e devolve `async (ev) => campos | null`; `extras(db, problemasAteAqui)` devolve
  problemas a acrescentar. `verificarCadeia(db, { dir, segredo })` sem `camposDe` usa o registro: contexto sem montador →
  `'contexto desconhecido'` (não "registro alterado"); os extras de cada contexto entram no fim e derrubam o `integra`.
- [x] O EPI se registra (montador = `camposDoRegistro`; extras = "entrega sem evidência" + cauda apagada de
  `entregas_epi_almoxarifado`); `epiService.verificarCadeia` só delega.
- [x] `GET /api/almoxarifado/evidencias/cadeia/verificar` com `requireAlgumaPermissao(['entregar_epi', 'gerenciar_ferramentas'])`
  (helper novo em `permissions.js`; o 403 traz `acao` = a primeira e `acoes` = a lista); `/epi/cadeia/verificar` é apelido (mesmo
  handler, mesma porta — **divergência:** o apelido também passou a aceitar `gerenciar_ferramentas`, para as duas rotas não
  divergirem; hoje os dois perfis são os mesmos).
- [x] `services/almoxarifado/identificacaoColaborador.js`: `colaboradorAtivo`, `conferirMatricula` (ganhou `{ acao }` só para a frase
  do "digite" — o EPI segue "confirmar o recebimento"), `conferirPng`, `chaveIdempotencia`. Nenhuma mensagem mudou.
- [x] Prova: os 8 `epi*.api.test.js` verdes **sem mudança de asserção** (`epiCadeiaHmac` 13, `epiCompensacao` 6, `epiEntrega` 29,
  `epiIdempotencia` 7, `epiIntegridade` 17, `epiLeituras` 6, `epiMatricula` 9, `epiPontaAPonta` 11); teste novo
  `evidenciaMultiContexto.api.test.js` **8/8** (cadeia EPI → alheio → EPI íntegra pelas duas rotas; `/verificar` do EPI depois
  da alheia íntegro; contexto sem montador → `contexto desconhecido`; extras; a alheia adulterada acusada pelo montador dela;
  PRODUCAO 403; "OU" provado tirando `entregar_epi` do ALMOXARIFE; a extração).
- Controle positivo: despacho sabotado para sempre usar o montador do EPI → 4 vermelhos (o 1º: `registro alterado` na seq. 2);
  `'contexto desconhecido'` trocado por `'registro alterado'` → 1 vermelho, na asserção do motivo. Restaurado por cópia + `cmp`.

### T2 (tronco) — ✅ 2026-10-22 — `11ef2821`

- [x] Schema (`schema.js` `ensureTermoFerramenta`, chamado depois de `ensureEntregaEpi`): `termos_responsabilidade_versao`
  (UNIQUE(tipo, versao), sem FK) e `termos_emprestimo_ferramenta` (C1: `numero` UNIQUE, `emprestimo_id` UNIQUE, snapshot da
  ferramenta e do colaborador, `termo_versao`, `texto_sha256`, `data_prevista_devolucao`, autor, `criado_em` do Node,
  `chave_idempotencia` UNIQUE parcial; sem FK). Triggers append-only nas duas (`RAISE(ABORT, 'termo de responsabilidade nao pode ser
  alterado')`). Semente v1 `FERRAMENTA` (`TEXTO PROVISÓRIO — substituir pelo termo da empresa.` + texto genérico), por
  `INSERT … WHERE NOT EXISTS` — nunca sobrescreve. Prova de boot: `initSchema` duas vezes no mesmo arquivo → 1 versão, 4 triggers.
- [x] Ação `editar_termos: [ADMINISTRADOR]` (letra B: só quem não colhe a assinatura redige o compromisso; reversível numa linha).
  Rótulos de auditoria: entidade `termo_responsabilidade`, verbo `NOVA_VERSAO_TERMO`.
- [x] `services/almoxarifado/termoFerramentaService.js`: `obterTermo`, `criarVersao`, `emprestarComTermo` (C2/C3/I3), `obterTermoDoEmprestimo`,
  `verificarTermo`; registra o contexto `TERMO_FERRAMENTA` (montador pela fotografia, por `emprestimo_id = contexto_id`; extras
  "termo sem evidência", "texto do termo alterado", "termo apagado no fim da tabela"). Gancho de teste `ganchos.antesDaGravacao`.
- [x] Rotas (`extended.js`): o `POST /ferramentas/:id/emprestar` saiu do bloco da 9b (JSON + `EmprestimoSchema`) e foi para o bloco
  do termo (multipart, multer próprio só PNG 2 MB, prefixo `assinatura-termo-`); `toolService.emprestarFerramenta` ficou sem rota
  (comentado como legado). `GET /emprestimos` exige `gerenciar_ferramentas` e devolve `tem_termo`. `/aux/colaboradores` aceita
  `entregar_epi` OU `gerenciar_ferramentas`.
- [x] Testes novos: `termoFerramentaVersao` **10/10**, `termoFerramentaEmprestimo` **12/12**, `termoFerramentaVerificacao` **14/14**;
  helper `tests/helpers/termoFerramenta.js` (`emprestarComTermo`, `colaboradorDoCadastro`, `PNG_1PX`).
- [x] **Testes migrados (I1)** — mandavam JSON só com `colaborador_nome`, que deixou de existir como entrada (RN-180.03: o colaborador
  é do cadastro; a rota é multipart com termo). O helper cria/reusa um colaborador ativo **com esse nome** e manda o multipart; as
  asserções sobre `colaborador_nome` continuam valendo porque o snapshot é o nome do cadastro:
  `toolCalibracao`, `toolEmprestimo`, `toolEmprestimoVencido`, `toolFerramentaEdicao`, `toolIntegracao`, `toolManutencao`,
  `toolManutencaoRetorno`, `toolOcorrencia`, `auditoriaDoAtoCadastros`, `validadesNoDiaLocal` (10 arquivos). **Duas asserções
  mudaram, e por quê:** (1) `toolEmprestimo` "corrida": o perdedor era sempre 400; agora é 400 (chegou depois do vencedor — a
  literal de sempre com o status) **ou** 409 `A ferramenta não está disponível` (passou das conferências junto e perdeu o claim na
  transação, C2) — a corrida determinística com gancho está em `termoFerramentaEmprestimo`; (2) `toolEmprestimo` "Zod: sem
  `colaborador_nome` → 400 Dados inválidos" virou "sem `colaborador_id` → 400 `O colaborador é obrigatório`" (o Zod saiu: a
  validação é do serviço, depois do multer, I1). `toolFerramentaEdicao` RN-175.08 só ganhou o `db` no destructuring.
  **Não migrado (fora do escopo desta sessão — só server):** `client/src/…/FerramentasAlmoxarifado.test.js` (mocka o HTTP, não
  quebra) — **a tela real de empréstimo fica quebrada entre a T2 e a T3** (ela manda JSON → 400 `A assinatura do colaborador é
  obrigatória`); a T3 é quem a conserta.
- Controles positivos (sabotar `termoFerramentaService.js` → vermelho na asserção certa → restaurar por cópia + `cmp`):
  S1 sem os dois `WHERE changes() = 1` → a corrida dá 201/201 e a versão-no-meio dá 201; S2 sem a versão no `UPDATE` do claim →
  só a versão-no-meio fica vermelha (201 ≠ 409); S3 contexto do termo não registrado → 6 vermelhos (`contexto desconhecido` na
  cadeia mista); S4 idempotência depois do claim → `expected 200, got 400 … (status atual: EMPRESTADA)`; S5a sem a checagem lida
  da `versao_base` → **verde** (o `INSERT … WHERE MAX = base` e o UNIQUE recusam sozinhos); S5c sem as três guardas da versão →
  vermelho nos dois testes de 409 (o UNIQUE vira 500).
- Suítes (uma por vez): `test:api` **516/516 arquivos OK**; `test:almoxarifado` **44/0**; `test:validation` **4/0**; `test:safealter` **3/0**; `test:sqlite` **16/0**. (O rótulo de auditoria de `termo_responsabilidade`/`NOVA_VERSAO_TERMO` entrou durante a rodada do `test:api`; `auditLabels.api.test.js` re-rodado sozinho depois: 14/0.) Client e build **não** rodados (esta sessão é só server).

#### Contrato real para o front (T3)

- **`GET /api/almoxarifado/termos/FERRAMENTA`** (`gerenciar_ferramentas`) → `200 { vigente: { versao, texto, criado_em,
  criado_por_nome, provisorio }, historico: [ {mesma forma}, … ] }` (mais recente primeiro; `provisorio` = o texto começa por
  `TEXTO PROVISÓRIO`). Tipo ≠ `FERRAMENTA` → 404 `Tipo de termo desconhecido: <tipo>`.
- **`POST /api/almoxarifado/termos/FERRAMENTA`** (`editar_termos`, só ADMINISTRADOR) — JSON `{ texto, versao_base? }` (mande a
  `vigente.versao` que a tela mostrou) → `201 { versao, texto, criado_em, criado_por_nome, provisorio }`. 400 `O texto do termo é
  obrigatório` (vazio/espaços) · 400 `O texto do termo deve ter no máximo 20000 caracteres` · 400 `O texto é igual ao da versão
  vigente` · 409 `Outra versão do termo acabou de ser salva — recarregue` (base velha ou dois admins juntos) · 400 `Versão base inválida`.
- **`POST /api/almoxarifado/ferramentas/:id/emprestar`** (`gerenciar_ferramentas`) — **multipart**: `colaborador_id`,
  `confirmacao_matricula`, `termo_versao` (a `vigente.versao` exibida), `data_prevista_devolucao?` (data parseável),
  `observacoes?` (≤ 1000), `chave_idempotencia?` (`[A-Za-z0-9-]{8,100}`, uuid por tentativa), arquivo **`assinatura`** (PNG ≤ 2 MB).
  `colaborador_nome`/`setor` enviados são **ignorados** (snapshot do cadastro).
  - `201 { id, termo: { numero: 'TERMO-…', versao, evidencia: { id, arquivo_url, arquivo_sha256, registro_sha256, criado_em } } }`;
    reenvio com a mesma chave → `200` com a mesma forma + `reutilizada: true`.
  - Recusas, nesta ordem: 400 `A assinatura do colaborador é obrigatória` · 400 `A assinatura deve ser uma imagem PNG` (MIME ou
    bytes) · 400 `Chave de idempotência inválida` · 409 `Chave de idempotência já usada em outro empréstimo` · 404 `Ferramenta não
    encontrada` · 400 `O colaborador é obrigatório` · 400 `Colaborador #<id> não encontrado` · 400 `Colaborador <nome> não está
    ativo` · 400 `Colaborador <nome> sem matrícula cadastrada — não é possível confirmar a identidade` · 400 `O colaborador deve
    digitar a própria matrícula para assinar o termo` · 400 `A matrícula informada não confere com a do colaborador` · 400 `A versão
    do termo é obrigatória` · 409 `O texto do termo mudou (versão <n>) — releia e assine de novo` (recarregar o termo e reassinar) ·
    400 `Data prevista de devolução inválida` · 400 `Observações deve ter no máximo 1000 caracteres` · 400 `Ferramenta com calibração
    vencida ou sem calibração registrada` · 400 `Ferramenta não está disponível (status atual: <STATUS>)` · 409 `A ferramenta não
    está disponível` (perdeu a corrida) · 500 `Não foi possível gravar o empréstimo — nada foi gravado. Pode tentar de novo. (…)`.
    Em toda saída ≠ 2xx o PNG é apagado (menos o 500 pós-COMMIT, que diz "foi gravado, … confira a lista").
- **`GET /api/almoxarifado/emprestimos`** (`gerenciar_ferramentas` — PRODUCAO agora 403; a T3 esconde a aba) → cada linha ganha
  `tem_termo: boolean`.
- **`GET /api/almoxarifado/ferramentas/emprestimos/:id/termo`** (`gerenciar_ferramentas`) → `200 { emprestimo: { id,
  ferramenta_id, ferramenta_nome, codigo_patrimonio, status, data_retirada, data_prevista_devolucao, data_devolucao_real },
  termo: { numero, versao, texto (da versão ASSINADA), texto_sha256, provisorio, ferramenta: { id, codigo_patrimonio,
  numero_serie, nome } (fotografia), colaborador: { id, nome, matricula, setor }, data_prevista_devolucao, criado_por_nome,
  criado_em }, evidencia: { id, arquivo_url, arquivo_sha256, registro_sha256, confirmado_por_matricula, criado_em, sequencia } }`.
  404 `Empréstimo não encontrado` · 404 `Este empréstimo não tem termo assinado (anterior à exigência)`.
- **`GET …/termo/verificar`** → `{ integro: true }` ou `{ integro: false, motivo }`, motivo ∈ `arquivo ausente`, `arquivo alterado`,
  `registro alterado`, `texto do termo alterado`, `registro anterior apagado`, `elo com o anterior quebrado`, `registro posterior
  apagado`, `elo com o posterior quebrado`. Mesmos 404.
- **`GET /api/almoxarifado/evidencias/cadeia/verificar`** (`entregar_epi` OU `gerenciar_ferramentas`; `/epi/cadeia/verificar` é
  apelido) → `{ integra, total, cabeca, problemas: [{ sequencia, evidencia_id, numero, motivo }] }`; motivos novos: `contexto
  desconhecido`, `termo sem evidência`, `texto do termo alterado`, `termo apagado no fim da tabela`.
- **`GET /api/almoxarifado/aux/colaboradores`** — `entregar_epi` OU `gerenciar_ferramentas` → `[{ id, nome, matricula, setor }]`.
- **`GET /api/almoxarifado/minhas-permissoes`** → `acoes.editar_termos` (true só ADMINISTRADOR); `acoes.gerenciar_ferramentas` para
  a aba Empréstimos e o botão Termo.
- **Letra D (declarado):** o `emprestimo_id`/`contexto_id` fica fora do HMAC (não existe antes do INSERT, como o `id` no EPI); o vínculo
  provado é o `numero`. Quem derruba o trigger e re-aponta a fotografia para outro empréstimo não é pego pelo HMAC.

### T3 (galho, front) — ✅ 2026-10-22 — `04b9d2fb`

- [x] Modal de empréstimo (`FerramentasAlmoxarifado.js`): colaborador do cadastro (`/aux/colaboradores`, carregado uma vez), texto
  **vigente** do termo (`GET /termos/FERRAMENTA` a cada abertura) com rolagem e selo "Texto provisório", data prevista, observações,
  `AssinaturaCanvas`, matrícula digitada pelo colaborador; multipart do contrato (`montarFormDataEmprestimo` em
  `client/src/utils/termoFerramenta.js`: `colaborador_id`, `confirmacao_matricula`, `termo_versao` = a versão exibida,
  `data_prevista_devolucao?`, `observacoes?`, `chave_idempotencia` por tentativa, `assinatura` PNG; **não** manda `colaborador_nome`).
  409 `O texto do termo mudou…` → recarrega o texto, descarta a assinatura e avisa `O texto do termo mudou — releia e assine de novo`
  (toast + aviso no modal). Demais recusas literais; sem resposta → a chave fica (reenvio não duplica); 200 `reutilizada` avisa.
- [x] **Divergência (letra B):** o seletor mostra `nome (setor)`, **sem** a matrícula — o pedido da T3 dizia "nome — matrícula", mas é
  ela que o colaborador digita para assinar (precedente da 178, Fase 5: mostrada ao lado, a confirmação não prova nada). Reversível
  em `rotuloColaboradorEmprestimo`.
- [x] Lista de empréstimos: coluna Termo (`tem_termo`); "Termo" → modal com o texto **da versão assinada**, a fotografia
  (ferramenta, colaborador), a matrícula digitada, a assinatura e o código de verificação; "Verificar integridade" (selo Íntegro /
  `Adulterado: <motivo>`) e "PDF do termo" (`client/src/utils/termoFerramentaPdf.js`: montador puro `montarTermoFerramenta`, com a
  quebra do texto `quebrarTexto` pura, + `gerarTermoFerramentaPdf`; relê o termo antes de gerar — se a releitura falha, não gera).
  Sem termo: "Anterior à exigência do termo"; o 404 do servidor aparece literal.
- [x] Aba Empréstimos só com `gerenciar_ferramentas` (e a escolhida volta para Ferramentas se a permissão some); aba "Texto do termo"
  só com `editar_termos`: vigente + histórico (com "Ver texto"), "Salvar nova versão" com `{ texto, versao_base }`; recusas
  antecipadas com a frase do servidor (vazio, igual — aparado, como o `textoLimpo` do servidor, 20000); 409 de outro administrador
  recarrega a vigente e o histórico **sem** apagar o rascunho.
- [x] Tela de EPI: "Verificar cadeia" chama `/evidencias/cadeia/verificar` (o apelido `/epi/cadeia/verificar` continua no servidor).
- [x] `permissaoErro.js`: rótulo de `editar_termos` — a T2 criou a ação sem ele e a suíte do client ficou **vermelha** em
  `permissaoErro.test.js:52` (`semRotulo = ["editar_termos"]`), o mesmo buraco da 178 com `entregar_epi`. Achado ao rodar a suíte
  inteira da T3.
- [x] Testes: `FerramentasAlmoxarifado.test.js` **52** (os 2 de empréstimo JSON reescritos para o multipart; novos: modal, provisório,
  payload, sem matrícula, sem assinatura/colaborador, versão trocada com reenvio na v2, recusas literais 409/400, rede caída com a
  mesma chave + reutilizada, termo não carregado; termo do empréstimo ver/verificar/PDF/releitura falha/404; abas por permissão;
  tela de versões); `termoFerramentaPdf.test.js` **7** (montador, quebra, renderizador, regras puras). Mock só no HTTP, no canvas do
  jsdom e no binário do jspdf.
- Controle positivo (restaurado por cópia + `cmp`): S1 sem `termo_versao` no FormData → 3 vermelhos (`montarFormDataEmprestimo`,
  "envio", "versão trocada"); S2 aba Empréstimos visível sem permissão → 1 vermelho (`Received: <button…>Empréstimos</button>`).
- Suítes (uma por vez): client **180 suítes / 2353 testes verdes**; `CI=true npx react-scripts build` **ok**.
- ~~**Falta:** T4~~ (feita, abaixo).

### T4 (integração pela rota) — ✅ 2026-10-22 — `31fb475f` (teste) e `3d161c35` (front)

- [x] `server/tests/api/termoFerramentaPontaAPonta.api.test.js` **12/12**, tudo pela rota: admin cria a v2 (`versao_base` 1, texto
  aparado) → `GET /termos/FERRAMENTA` (o que o modal lê) → `POST /ferramentas` → colaborador ativo (SQL direto: tabela core, molde
  `epiPontaAPonta`) → `/aux/colaboradores` → `POST /emprestar` multipart com **PNG real** 240x80, matrícula `' m-t4-77 '`, `termo_versao` 2
  e `colaborador_nome` digitado (ignorado) → `GET /emprestimos` (`tem_termo`, nome do cadastro) → `GET …/termo` (texto da v2, chaves
  congeladas das três partes) → `GET arquivo_url` (200 `image/png`, mesmos bytes; sem/errada a `sig` → 404) → `/verificar` íntegro →
  `PUT /ferramentas/:id` com `numero_serie` novo (a viva mudou; o termo mostra a fotografia e segue íntegro) → devolução (íntegro,
  DEVOLVIDA) → entrega de EPI pela rota → cadeia íntegra, `total` 2, sequências `[TERMO_FERRAMENTA, ENTREGA_EPI]` → 1 byte do PNG do termo
  → `/verificar` e cadeia acusam `arquivo alterado` só no termo (o EPI segue íntegro) → restaurado, íntegro → v3 salva com a tela na v2 →
  409 `O texto do termo mudou (versão 3) — releia e assine de novo`, sem PNG órfão, ferramenta DISPONIVEL → relida a v3 → 201 (o novo termo
  tem a v3 e a série de agora; o velho segue v2 e a série original) → cadeia íntegra com 3, só 3 PNGs novos em disco.
- Controle positivo (restaurado por cópia + `cmp`): montador e `/verificar` lendo `numero_serie` da ferramenta **viva** (join em
  `ferramentas_almoxarifado`) → 5 vermelhos, o **primeiro no passo do PUT** (`{ integro: false, motivo: 'registro alterado' }`).
- [x] **Conferência do front campo a campo (formas impressas com `TERMO_T4_FORMAS=1`) — 1 divergência, corrigida:**
  `evidencia.confirmado_por_matricula` é a **flag `1`** (a matrícula digitada não é gravada — só se confere), mas a T3 a imprimia como
  "Matrícula digitada" na tela e no PDF: na tela real saía `Matrícula digitada: 1`. Os mocks da T3 tinham `'M-900'` nesse campo, por isso
  o teste não via. Agora `matriculaConfirmadaTexto` (`utils/termoFerramenta.js`): flag 1 → `Sim — digitou <matrícula da fotografia>
  (confere com o cadastro)`; senão `Não registrada`; rótulo `Matrícula confirmada pelo colaborador` no modal e no PDF; fixtures com a forma
  real. Controle: o modal de volta ao campo cru → 1 vermelho, `Received … Matrícula confirmada pelo colaborador: 1`. O resto bate
  (201 do empréstimo, `reutilizada`, linha de `/emprestimos` com `data_retirada` `AAAA-MM-DD HH:MM:SS`, `termo`/`evidencia`/`emprestimo`
  do GET do termo, `vigente`/`historico`, `arquivo_url` relativo assinado que o `resolveMaterialPhotoUrl` resolve).
- Suítes (uma por vez): `test:api` **517/517 arquivos OK**; `test:almoxarifado` **44/0**; client **180 suítes / 2354 testes verdes**; `CI=true npx react-scripts build` **ok**.
- ~~**Falta:** o fechamento~~ (feito, abaixo).

### Fase 5 — revisão adversarial (2026-10-22) — 1 importante + 2 menores, corrigidos — `c40b1f56`, `bcd89a2f`, `003de01b`

Revisor independente com sonda executada (`scratchpad/rev-180/probe1.js`, reproduzida antes e depois da correção).

- [x] **I1 (importante, reproduzido) — reenvio com a MESMA chave enquanto o primeiro grava → 409 mentiroso.** O reenvio passava pela
  consulta da chave antes de haver o que achar, esperava na fila da cadeia, perdia o claim para a própria primeira tentativa, o COMMIT saía
  vazio e o ramo `!gravado` de `emprestarComTermo` respondia 409 `A ferramenta não está disponível` — o front trata 409 como recusa, apaga a
  chave e diz que não emprestou. **Correção:** o ramo `!gravado` relê `emprestimoDaChave` antes de decidir; achou → 200 `reutilizada` (a rota
  já apaga o PNG do reenvio). Teste novo em `termoFerramentaEmprestimo` (13/13): os dois gestos com a mesma chave disparados do contexto do
  teste, o gancho só segura (molde do CLAUDE.md) → `[200, 201]`, mesmo `id` e `numero`, nada a mais gravado (nem PNG). Sonda depois:
  `200 | 201` com o mesmo empréstimo. `c40b1f56`.
- [x] **I2 (menor, reproduzido) — empréstimo vivo reapontado continuava "íntegro".** O HMAC cobre só a fotografia (C1) e a tabela de
  empréstimos não é append-only: a sonda trocou `colaborador_id`/`ferramenta_id` do empréstimo por UPDATE direto — `/verificar` íntegro,
  cadeia íntegra, a lista mostrava *BETO* com "Termo" num papel assinado pela *ANA*. **Correção:** `/termo/verificar` (depois do texto, antes
  dos elos) e os extras do contexto `TERMO_FERRAMENTA` comparam os dois campos do empréstimo vivo com os da fotografia → `{ integro: false,
  motivo: 'empréstimo reapontado' }`. Testes em `termoFerramentaVerificacao` (16/16): reapontar o colaborador e depois a ferramenta →
  acusado nas duas rotas, restaurado → íntegro; **ocorrência PERDA** encerrando o empréstimo → íntegro (PUT e devolução já eram testados:
  nenhum dos três muda esses campos). **Divergência:** o teste da ocorrência usa o `emp2` (ainda EMPRESTADA) e não um empréstimo novo — um
  novo viraria a cauda da cadeia e o teste já existente da "cauda apagada" mudaria de motivo (medido: o primeiro rascunho derrubou ele).
  `bcd89a2f`.
- [x] **M3 (menor) — os contextos só existiam quando o módulo dono era carregado.** Um script que carregasse só o `epiService` veria cada
  termo como `contexto desconhecido` (e vice-versa). **Correção:** `evidenciaAssinaturaService.verificarCadeia` carrega `DONOS_DE_CONTEXTO`
  (`./epiService`, `./termoFerramentaService`) antes de percorrer — `require` tardio, porque os donos requerem o serviço no topo (ciclo).
  **Descartado:** um índice novo que requeresse os dois (outro arquivo para lembrar de usar). Teste em `evidenciaMultiContexto` (9/9):
  processo **filho** carregando só `epiService`, só `termoFerramentaService` e nenhum → os dois contextos registrados e os dois motivos
  `registro alterado` (nenhum `contexto desconhecido`). `003de01b`.
- [x] **Letra B** (registrado no fechamento): `/aux/colaboradores` entrega a matrícula na resposta da rede ao almoxarife — o seletor não a
  mostra, então o ganho é **só de tela** (precedente da 178); o seletor mostra `nome (setor)` (T3); a "Matrícula digitada: 1" (T4).
- Controles positivos (restauro por cópia + `cmp`; md5 pós-conserto `255cca1f…`/`a02e69eb…` conferido no fim): S1 os extras sem o
  reapontado → 1 vermelho, **na asserção da cadeia** (`+ [] - [[TERMO-…, 'empréstimo reapontado']]`) — a rodada TDD tinha caído só no
  `/verificar`, que vem antes; S2 o `/verificar` sem a checagem → 1 vermelho (`integro: true`); S3 sem a releitura da chave → 1 vermelho
  (409 no lugar do 200; o `grep -cF` da âncora multilinha deu 20 — conta linhas, não blocos —, a aplicação foi conferida pelo md5 e pelo
  vermelho); S4 sem a carga dos donos → 1 vermelho (`contextos: ['ENTREGA_EPI']`, o filho via `contexto desconhecido`).
- Também achado ao ler, **não** corrigido (letra D, ponto da 181): o relatório **Ferramentas emprestadas** (`reportRegistry.js`,
  `acao: null`) mostra colaborador e ferramenta a todo usuário do módulo, enquanto `GET /emprestimos` passou a exigir `gerenciar_ferramentas`
  — a restrição da RN-180.06 vale para a tela e o termo, não para o relatório (que não traz matrícula nem assinatura).

### Verificação final (medida, uma suíte por vez, depois da Fase 5)

`test:api` **517/517 arquivos OK**; `test:almoxarifado` **44/0**; `test:validation` **4/0**; `test:safealter` **3/0**; `test:sqlite` **16/0**;
client **180 suítes / 2354 testes verdes**; `CI=true npx react-scripts build` **Compiled successfully**. A consulta da **A108** rodada contra o
schema real (servidor de teste): vazia antes, 1 linha com o empréstimo na v1, e o empréstimo na v2 **não** entra (controle). Nenhum clique no
navegador (**F (180)**).

### Retro

- **O que a revisão pegou e a suíte não:** os três achados são do tipo "dois caminhos para o mesmo estado" — a mesma chave por dois caminhos
  (antes e depois do claim), o mesmo empréstimo por duas tabelas (fotografia × vivo), o mesmo registro de contexto por dois carregamentos. A
  sonda executada achou o I1 e o I2 em minutos; a leitura do plano não.
- **O plano acertou** o tronco (T1 antes de tudo) e a fotografia congelada (C1): nenhum teste da 9b precisou mudar de intenção.
- **O plano errou** em deixar a conferência do front contra a forma real para a T4 — a "Matrícula digitada: 1" só apareceu lá (os mocks da
  T3 tinham a forma imaginada). Para a próxima: a T3 imprime as formas reais (`TERMO_T4_FORMAS=1` virou o molde) antes de escrever fixture.

## Próxima tarefa detalhada — Etapa 181: o relatório "EPI por colaborador" passa a ler as entregas de EPI

**Por quê.** Em **Relatórios → Gestão → EPI por colaborador** (`reportRegistry.js` `'epi-colaborador'`, `acao: null`; função
`reportService.relatorioEPIPorColaborador`, ~561) o sistema lê **empréstimos de ferramenta** com `ferramentas_almoxarifado.tipo = 'EPI'` e
`status = 'EMPRESTADA'` — e ignora as **entregas de EPI da 178** (`entregas_epi_almoxarifado`), que são a fonte de verdade desde então. Quem
abre o relatório vê vazio (ou só o legado) com a ficha de EPI cheia na outra tela. É o furo declarado na Fase 2 da 180 (letra D).

**O que fazer.**
1. Fonte nova: `entregas_epi_almoxarifado` (append-only, triggers) com o join da evidência (`evidencias_assinatura_almoxarifado`,
   `contexto = 'ENTREGA_EPI'`, `contexto_id = entrega.id`). Colunas por linha: **data** (`criado_em` da entrega, dia de Brasília —
   `diaLocal`), **colaborador** (snapshot da entrega: nome, matrícula, setor), **EPI** (código + nome do snapshot), **CA** e **validade do CA**
   (snapshot), **quantidade**, **tamanho**, **motivo**, **quem entregou** (`criado_por_nome`), **número** da entrega. **Integridade:** NÃO
   recalcular HMAC por linha no relatório (custo e segredo no export XLSX) — mostrar só o **número** e remeter à verificação da tela de EPI;
   se quiser uma coluna, que seja "tem evidência" (EXISTS), declarada como tal.
2. **Permissão:** o relatório passa a exigir `entregar_epi` (`acao: 'entregar_epi'` no registro) — a ficha de EPI é restrita desde a 178
   (B1165); relatório aberto vazaria o que a tela esconde. Conferir `RelatoriosAlmoxarifado` (a tela filtra pela `acao` do registro?) e o export
   (mesmo gate, RN-03 da 13).
3. **Parâmetros:** período (`data_inicio`/`data_fim`, dia de Brasília, molde dos outros relatórios), colaborador, EPI.
4. **Legado:** empréstimos de ferramenta `tipo = 'EPI'` — medir primeiro no banco local e na cópia de produção (`SELECT COUNT(*) FROM
   ferramentas_almoxarifado WHERE tipo = 'EPI'`). Se houver, decidir (letra B): mostrar numa seção/aba "Empréstimos de ferramenta tipo EPI
   (legado)" ou só remeter ao relatório de ferramentas; **não** misturar as duas fontes na mesma tabela (uma é consumo entregue, a outra
   patrimônio que volta).
5. **Aproveitar:** o relatório **Ferramentas emprestadas** (`acao: null`) mostra colaborador a todos, enquanto `GET /emprestimos` exige
   `gerenciar_ferramentas` (RN-180.06) — alinhar a `acao` (decisão reversível, letra B).

**Contrato que consome:** `GET /api/almoxarifado/relatorios/epi-colaborador` e `/export` (dispatcher genérico, `extended.js:~2577`, gate pela
`acao` do registro). **Pontos de atenção:** o `reportRegistry` tem teste de forma (`colunas` × chaves da função); data no dia de Brasília
(C406/B1041); a entrega cancelada pela devolução no meio (B1168) não tem linha — nada a filtrar. **Pronto e não reabrir:** a entrega de EPI, a
cadeia multi-contexto e o termo de ferramenta (178/180).
