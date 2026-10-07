# Etapa 36 — Recebimento: as duas portas param de aceitar qualquer coisa: implementação

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` para
> executar este plano task a task. Os passos usam checkbox (`- [ ]`). Antes da primeira task, leia
> `.superpowers/sdd/etapa36-fase0-medicao.md` (a medição, com `arquivo:linha` de tudo e duas sondas
> **executadas**) e o design abaixo. **Onde a medição e este plano divergirem, vale a medição** — e
> onde este plano decidiu contra a proposta da medição ou contra a proposta do controlador, está
> dito, com o motivo e o descartado, na seção "Decisões desta etapa" do design.

**Goal:** fechar as **duas portas de escrita** do recebimento, que hoje aceitam qualquer coisa:
`tipo_recebimento: 'BANANA<script>'` entra com **201** (medido), a **mesma NF do mesmo fornecedor**
entra duas vezes e credita **20** em vez de 10 com **2 contas a pagar** (medido), o **excedente** não
tem barreira nenhuma, e o alerta de divergência de quantidade que o manual promete **não tem produtor
alcançável pela tela** porque não existe campo para dizer quanto chegou de verdade. Mais duas dívidas
pequenas: o teste `avancar etapa fora de ordem falha`, exigido pela spec desde 2026-08-11, e a linha
do `loadingDetalhe` em duas telas.

**Architecture:** enum com **fonte única** em `schema.js` validado por **`z.looseObject`** nas duas
rotas; guarda de NF duplicada **no serviço** (`receiptService`), chamada pelos **dois** escritores, com
índice **não único**; ação nova **`autorizar_excedente`** em `ACAO_PERFIS` checada **no serviço** por
`can()` (molde `ownerRules.assertAjustePermitido`), nas duas portas que escrevem quantidade; e, no
client, o **primeiro chamador** de `PUT /recebimentos/:id/conferir`, que destrava o alerta
`DIVERGENCIA_RECEBIMENTO`.

**Tech Stack:** Express + SQLite (`server/`), Zod **4.4.3** (com `z.looseObject`, e mensagem de enum
padrão **em inglês**); React CRA (`client/`), testes com `createRoot` + `act` — ⚠️
`@testing-library/react` **não está instalado** nesta base.

**Spec:** `docs/superpowers/specs/2026-09-16-almoxarifado-etapa36-recebimento-portas-design.md` — leia
junto; as **RN-11 a RN-19**, as 11 decisões (com o descartado) e os 10 riscos estão lá.

---

## Global Constraints

- **Autorização em duas camadas, e o backend decide.** `checkModulePermission('almoxarifado')` abre as
  telas (`routes/almoxarifado.js:282-285`); `ACAO_PERFIS` + `requirePermission` autoriza agir
  (`permissions.js`); `getPerfilFromUser` faz fallback para **`PRODUCAO`**. **`validate(...)` entra
  DEPOIS do `requirePermission`** — 403 antes de 400, como nas rotas de `configurar`
  (`extended.js:478`). `GET /almoxarifado/minhas-permissoes` existe **só** para a UI barrar antes do
  formulário e **falha aberto de propósito**: nenhuma decisão de segurança desta etapa mora no client.
- **Almoxarifado é área física, não filial.** Saldo global por material é correto e intencional. Nada
  aqui propõe seletor de almoxarifado nem segregação de saldo.
- **Testes de servidor só em `server/tests/api/*.api.test.js`** — o runner descobre **apenas** esse
  padrão. Cada arquivo tem **runner próprio** (`test()`, contador `passed`/`failed`, `process.exit`),
  harness `server/tests/helpers/testApp.js` com `requirePermission` **REAL** (`setUser` com usuário
  sem perfil → **403**).
- **Validação é Zod**, via `validate()` de `services/almoxarifado/validation.js`, que **substitui
  `req.body` por `parsed.data`**. Nesta base é **Zod 4.4.3**: `z.looseObject` existe, e enum novo
  **carrega mensagem própria** (o padrão sai em inglês — medido).
- **Enum com fonte única.** `TIPOS_RECEBIMENTO` nasce e é exportado de `schema.js`, no padrão de
  `TIPOS_REQUISICAO`/`TIPOS_MOVIMENTO`. Proibido repetir o array em `schemas.js` ou deixar o literal
  de `receiptService.js:108`.
- **`schemas.js` exporta por LISTA FECHADA.** Esquecer a linha no `module.exports` deixa o binding
  `undefined` e faz a rota morrer em `undefined.safeParse` — **500 com stack**, depois do gate. Está
  escrito no comentário do `AnexoCreateSchema`, e já aconteceu.
- **O comando de teste do client leva CAMINHO, não `-t`.** `-t` é `--testNamePattern` e devolve
  `N skipped, exit 0` — achado nº 1 da Fase 2 da Etapa 32. Use
  `cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/Arquivo.test.js`.
- **Português com acento** no código, nos comentários, nas mensagens de tela e nas literais de erro;
  **sem acento no corpo do commit**.
- **Nunca `git add -A` na raiz** — há artefatos de runtime em `server/data/` e `server/uploads/`. Na
  árvore de abertura desta etapa há também `server/data/database.sqlite.bak`, `server/nodemon.json` e
  `docs/bkp_bancoprod.md` **não versionados**: `git add` só dos caminhos que a task tocou.
- **Um commit por assunto**, em português, explicando **por quê**: qual era o bug, qual a
  consequência, o que foi decidido e o que foi descartado.
- **Nenhum commit com a suíte vermelha.** As rodadas RED existem para **ler o número**, e o commit é
  da task que leva teste + conserto juntos.
- ⚠️ **Harness de sabotagem nesta máquina — duas regras aprendidas por falha:**
  - **`python3` NÃO existe no Git Bash desta máquina.** É o alias da Microsoft Store
    (`/c/Users/User/AppData/Local/Microsoft/WindowsApps/python3`), que imprime *"Python was not found;
    run without arguments to install from the Microsoft Store…"* e **não executa nada** — no-op
    silencioso. Use **`perl -0pi -e`** (`/usr/bin/perl` existe) ou **`sed`**. Se for usar
    interpretador, `command -v` + uma execução trivial (`perl -e 'print 1'`) **antes** da sabotagem.
    A `fechar-etapa` já foi corrigida neste ponto (`b95649c`).
  - **NUNCA restaure com `git checkout -- <arquivo>`** enquanto houver conserto ainda não commitado
    nesse arquivo: as sabotagens rodam **antes** do commit da task, então o `checkout` descarta a
    sabotagem **e o conserto** juntos — e o `git diff --stat` vazio, que a regra manda exigir, passa a
    ser **erro**, não sucesso. Restaure por **perl inverso** ou por **cópia de segurança no
    scratchpad**, e confira que o `md5sum` volta ao valor **pós-conserto**, não ao de HEAD.
  - Antes de cada sabotagem: `grep -cF '<ancora>' arquivo` **tem de dar exatamente 1**. Se der 0 ou
    mais de 1, **aborte** e escolha outra âncora.
  - ⚠️ **(Fase 2) A âncora tem de ser contada DEPOIS do conserto, não no HEAD — e cinco âncoras
    deste plano davam 1 no HEAD e passam a dar 2.** Medido com `grep -cF` no HEAD `8594d8c`:
    `z.looseObject` em `schemas.js` = **0** hoje e **2** depois da T1 (os dois schemas);
    `z.enum(TIPOS_RECEBIMENTO, …)` = **2** depois da T1;
    `quantidade_recebida = COALESCE(?, quantidade_recebida)` em `receiptService.js` = **1** hoje
    (`salvarDadosFiscal`) e **2** depois da T3; `await assertNotaNaoDuplicada(` = **2** depois da T2;
    `assertExcedentePermitido(` = **3** depois da T3 (definição + duas chamadas);
    `setLoadingDetalhe(false)` = **1** hoje em cada tela (o `finally` de `abrirDetalhe`) e **2**
    depois da T6. Em todas essas, a âncora é o **bloco ancorado** que a tabela da task dá — não o
    token solto. Onde a sabotagem é deliberadamente nos **dois** sítios (T1 nº 1 e nº 4), a regra
    lida é **`grep -cF` = 2 e as duas ocorrências são as alvo**, e o `md5sum` pós-sabotagem prova
    que as duas mudaram.
  - `md5sum` **antes**, **depois da sabotagem** e **depois de restaurar**; `git diff --stat` tem de
    voltar com **só** os arquivos da task.
  - **Leia QUAL asserção caiu, não só o placar.** Se a asserção que guarda o achado não caiu, o
    controle **não valeu**: acrescente a sabotagem que a atinge, não troque por outra que funcione.
  - **Sabotagem que não derruba nada é um achado**, não um detalhe — e há dois motivos opostos:
    *falta asserção* (escreva o cenário) ou *o defeito virou inalcançável* (mantenha a forma segura e
    **declare** que a suíte não a protege). A T6 desta etapa é declaradamente do segundo tipo.
- **Scratchpad com nome único por agente** (`msg-<assunto>.txt`, `bkp-<arquivo>-<task>`): o diretório
  é compartilhado, e na Etapa 25 um executor sobrescreveu a mensagem de commit do outro.

---

## ⚠️ O modo de falha desta etapa: o teste que passa provando nada

Esta etapa é quase toda **regra nova em porta aberta**, e por isso o risco não é o vermelho — é o
**verde vazio**. Cinco modos, todos medidos ou nomeados por regra da `fechar-etapa`:

1. **O strip do Zod mata o POST inteiro, e um teste que só cheque o 400 do enum não vê.** Medido: com
   `z.object`, `nota_fiscal` e `itens` **somem** do body e **todo** `POST` válido responde
   `400 "Inclua ao menos um item"`. O cenário que pega isso é o **positivo de quatro colunas** da
   RN-11 — não o negativo.
2. **A asserção de "2 contas a pagar" é vazia por padrão.** `gerarContaPagar` devolve `null` quando a
   tabela não existe (`receiptService.js:648-650`), e **nenhum** dos 169 arquivos de `tests/api/` cria
   `contas_pagar` (`grep -rn contas_pagar server/tests/api/*.api.test.js` → **vazio**; a sonda da Fase
   0 criou a tabela, e é por isso que ela mediu 2 linhas). Sem criar a tabela, `COUNT === 1` passa com
   **0 de cada lado**, antes e depois do conserto. **A T2 cria a tabela e mede o 2 ANTES do conserto.**
3. **Asserção negativa de permissão NÃO fica vermelha na rodada TDD.** Regra explícita da
   `fechar-etapa`: `can()` devolve `false` para ação que não conhece, então "ALMOXARIFE não pode
   `autorizar_excedente`" passa **verde antes de a ação existir**. A prova é o par no **mesmo**
   cenário: **403** do ALMOXARIFE **e 200** do GESTOR.
4. **`toast` é mockado no client** (`RecebimentosAlmoxarifado.test.js:42-44`) — toda asserção tem de
   ser sobre o **DOM** ou sobre `api.put`/`api.post`, nunca sobre o toast.
5. **O fallback do mock de client REJEITA, mas não para tudo.** `/almoxarifado/recebimentos` está
   mapeada e **resolve**; para forçar erro, **sobrescreva** `api.get.mockImplementation` (molde
   `HistoricoInspecoes.test.js:211-216`). E o `PUT /conferir` precisa de mock de `api.put` no
   `beforeEach` — hoje `api.put` é um `jest.fn()` sem implementação, que devolve `undefined` e faz
   `await` em `undefined` passar: **dê-lhe `mockResolvedValue({ data: { success: true } })`**, senão o
   `catch` da tela engole e o cenário fica verde sem o payload.

### Quatro regras herdadas, e valem para TODAS as tasks

**(i) Metade positiva dentro de cada cenário negativo.** "Recusa com 400" passa se a rota recusar
tudo; "não mostra o aviso" passa com a tela vazia. Toda recusa vem acompanhada do caso que **tem** de
passar (o POST válido de quatro colunas, o `recebida === esperada`, a NF de fornecedor diferente, o
GESTOR com 200).

**(ii) Conte as chamadas, não use `toHaveBeenCalledWith` solto.** Ele é satisfeito por 1, 2 ou 10.
Asserção de chamada é `api.put.mock.calls.filter(...)` + `toHaveLength(n)`, e o **payload** é lido de
`api.put.mock.calls[0][1]`.

**(iii) Nenhum id de fixture `1`, nem o primeiro da lista.** No client, Recebimentos `41`/`58`/`77`/
`91`, com o painel dos cenários novos no **58** (item `581`). No servidor, ids vêm do banco em memória
— nos cenários que citam id na mensagem, **leia o id do `INSERT`**, nunca escreva `1`; e o usuário de
teste não é `id: 1` (use `64`/`65`/`66`, como `minhasPermissoes.api.test.js`).

**(iv) Sabotagem que derruba a suíte por `TypeError` não é controle positivo.** Se o componente lança
no primeiro render, **todos** os cenários caem juntos e nenhum provou nada. No servidor o equivalente é
sabotar o `module.exports` de `schemas.js`: derruba **todas** as rotas com 500. Essa sabotagem existe
(T1, nº 3) **de propósito**, e a leitura é "qual arquivo ficou inteiro vermelho", não "qual asserção" —
está dito lá.

---

## Contratos de API congelados

Front e back andam por estes. **Mensagem literal entre aspas é a que vai no código e no manual** — não
aproximar, não reescrever.

### 1. `POST /api/almoxarifado/recebimentos` — `extended.js:973`

| | |
|---|---|
| **Gate** | `auth` + `checkModulePermission('almoxarifado')` + `requirePermission('receber_material')` → `[ADMINISTRADOR, ALMOXARIFE, COMPRAS]` |
| **Validação nova** | `validate(RecebimentoCreateSchema)`, **depois** do `requirePermission` |
| **Payload** | inalterado (`pedido_compra_id`, `pedido_compra_numero`, `tipo_recebimento?`, `nota_fiscal?`, `fornecedor_id?`, `fornecedor_nome?`, `fornecedor_cnpj?`, `observacoes?`, `itens[]`) — o schema é **`looseObject`**, então **nada mais é descartado** |
| **201** | `{ id, numero, status: 'RECEBIDO' }` (inalterado) |
| **400 (enum)** | `{ error: 'Dados inválidos — tipo_recebimento: forma de recebimento inválida (use NOTA_FISCAL ou PEDIDO_COMPRA)' }` |
| **409 (NF duplicada)** | `{ error: 'Nota fiscal <numero da NF> já lançada no recebimento <numero do REC> para este fornecedor' }` |
| ⚠️ **(Fase 2) Chave da duplicata — CORRIGIDA** | `fornecedor_id` **ou** `fornecedor_cnpj` **ou** `UPPER(TRIM(fornecedor_nome))`, nessa ordem de preferência. **Medido:** a tela **nunca envia `fornecedor_id`** — `handleCriar` monta o payload com `tipo_recebimento`, `pedido_compra_id`, `nota_fiscal`, `fornecedor_nome`, `fornecedor_cnpj`, `observacoes`, `itens` (`RecebimentosAlmoxarifado.js:342-354`), e `fornecedor_id` **não existe no `form`** (`:86-93`); o `<select>` de fornecedores (`:761`) copia `razao_social` → `fornecedor_nome` e `cnpj` → `fornecedor_cnpj` (`selecionarFornecedor`, `:315-325`). Com a chave só em `id`/`cnpj`, **a guarda não dispararia pelo caminho real da tela** sempre que o fornecedor não tivesse CNPJ preenchido — a etapa entregaria a regra e ninguém a alcançaria, que é exatamente a classe de defeito que a T5 existe para pagar do outro lado |
| **400 (sem item)** | `{ error: 'Inclua ao menos um item' }` (inalterado, `receiptService.js:126`) |
| **403** | `{ error: 'Sem permissão para esta operação', acao: 'receber_material', perfil: 'PRODUCAO' }` (inalterado) |

### 2. `PUT /api/almoxarifado/recebimentos/:id/fiscal` — `extended.js:1098`

| | |
|---|---|
| **Gate** | idem acima (`receber_material`) |
| ⚠️ **(Fase 2) Status exigido — MEDIDO, e é o que quebrava quatro cenários deste plano** | `salvarDadosFiscal` recusa **antes de tudo** quem não está em `[ENCAMINHADO_FATURAMENTO, EM_ENTRADA_NF, EM_COMPRAS, CONFERIDO_ALMOX, EM_CONFERENCIA]` (`receiptService.js:253-259`). **`RECEBIDO` NÃO está na lista.** Sonda executada contra o harness: `POST /recebimentos` → `PUT /:id/fiscal` no mesmo instante responde **`400 {"error":"Dados fiscais só podem ser editados antes do processamento"}`**, e depois de um `POST /workflow {acao:'iniciar_conferencia'}` responde **200**. **TODO cenário de `/fiscal` deste plano avança primeiro para `EM_CONFERENCIA`** — T1 (2), T2 (6), T3 (3), T7 passo 4. Sem isso o 400 vem do guard de status e o cenário mede outra coisa (T2 (6) e T7 passo 4 ficariam vermelhos **antes e depois** do conserto) |
| **Validação nova** | `validate(RecebimentoFiscalSchema)`, **depois** do `requirePermission` |
| **Payload** | inalterado, mais o campo opcional **`autorizar_excedente: boolean`** |
| **200** | `{ success: true }` (inalterado) |
| **400 (enum)** | **a mesma literal** do POST — constante única no schema |
| **409 (NF duplicada)** | a mesma literal do POST; a busca **exclui o próprio documento** |
| **400 (excedente sem flag)** | `{ error: 'Quantidade recebida (<recebida>) maior que a esperada (<esperada>) no item #<id do item> — a autorização de excedente é de Compras ou do Administrador' }` |
| **403 (flag sem permissão)** | `{ error: 'Autorizar recebimento acima do pedido exige a permissão "autorizar_excedente" (seu perfil: <PERFIL>).' }` |
| **400 (status)** | `{ error: 'Dados fiscais só podem ser editados antes do processamento' }` (inalterado) |

### 3. `PUT /api/almoxarifado/recebimentos/:id/conferir` — `extended.js:980`

| | |
|---|---|
| **Gate** | `requirePermission('receber_material')` — **medido, não suposto** |
| **Payload (congelado para o client)** | `{ status?: <status válido>, autorizar_excedente?: boolean, itens: [{ id, quantidade_recebida, conferencia_quantidade?, conferencia_descricao?, observacoes?, series? }] }` |
| **O que o client manda (T5)** | `{ itens: [{ id, quantidade_recebida: <número>, conferencia_quantidade: <bool> }] }` — **sem `status`**, para não avançar o workflow, e **um objeto por item do painel** |
| **200** | `{ success: true }` (inalterado) |
| **400 (excedente sem flag)** | a mesma literal do `/fiscal` |
| **403 (flag sem permissão)** | a mesma literal do `/fiscal` |
| **400 (status inválido)** | `{ error: 'Status inválido' }` (inalterado) |
| **Mudança de comportamento (T3)** | o `UPDATE` de item passa a usar **`COALESCE`** nas cinco colunas, no molde já escrito em `salvarDadosFiscal` — hoje `quantidade_recebida = ?` e `observacoes = ?` **sobrescrevem com nulo** quem não mandar o campo, e esta rota está ganhando o **primeiro chamador da vida** |
| **Efeito colateral que importa** | ao fim, `avisarDivergenciasDoRecebimento` dispara `DIVERGENCIA_RECEBIMENTO` por item divergente, com dedupe `receb-diverg-<item_id>-<quantidade>` (já existe, `receiptService.js:32-42`) |

### 4. `POST /api/almoxarifado/recebimentos/:id/workflow` — `extended.js:1092` (nenhuma linha muda)

| | |
|---|---|
| **Gate** | `requirePermission('receber_material')` |
| **Payload** | `{ acao: 'iniciar_conferencia' \| 'finalizar_conferencia' \| 'encaminhar_compras' \| 'finalizar_compras' \| 'iniciar_faturamento' \| 'processar' }` |
| **200** | `{ success: true, status, etapa_atual }` |
| **400 (fora de ordem)** | `{ error: 'Não é possível "<acao>" no status atual (<STATUS>)' }` |
| **400 (ação inexistente)** | `{ error: 'Ação de workflow inválida' }` |
| **404** | `{ error: 'Recebimento não encontrado' }` |

### 5. Permissões — `ACAO_PERFIS` (`permissions.js`)

| Ação | Perfis | Onde é checada |
|---|---|---|
| `receber_material` (existente) | `ADMINISTRADOR, ALMOXARIFE, COMPRAS` | `requirePermission` na rota |
| **`autorizar_excedente` (NOVA)** | `ADMINISTRADOR, GESTOR, COMPRAS` | **`can(user, 'autorizar_excedente')` no serviço**, só quando o body traz a flag — molde `ownerRules.assertAjustePermitido` |

A ação entra **de graça** em `GET /almoxarifado/minhas-permissoes` (a rota itera
`Object.keys(ACAO_PERFIS)`), o que é o que permite a UI esconder a caixa de autorização.
**`minhasPermissoes.api.test.js` afirma um booleano para CADA ação** (`:38-40`) — a ação nova entra
nesse laço sem editar o teste; o que a T3 **acrescenta** lá é a linha negativa do ALMOXARIFE.
⚠️ **(Fase 2) e o cenário `admin de sistema pode tudo` (`minhasPermissoes.api.test.js:88-95`) afirma
`true` para TODA ação** — `ADMINISTRADOR` está na lista nova, então ele continua verde. Verificado:
**nenhum** teste congela o conjunto de CHAVES de `ACAO_PERFIS` (os 10 consumidores afirmam listas
por ação, um por ação nova — `planoInspecao:107`, `segundaConferencia:102`, `sucateamento:423`,
`toolFundacao:50`, `remessaTerceiroEstados:249`), logo **acrescentar a ação não quebra nenhum teste
de servidor**. Pelo mesmo costume, a T3 **acrescenta** a asserção de congelamento da lista nova no
arquivo dela (`assert.deepStrictEqual([...ACAO_PERFIS.autorizar_excedente].sort(), ['ADMINISTRADOR','COMPRAS','GESTOR'])`) — é a convenção de toda ação nova desde a Etapa 8, e sem ela a lista muda sem régua.

### ⚠️ (Fase 2) TRÊS pontos de fiação que a ação nova e a auditoria nova QUEBRAM — e que este plano não tinha

Medido por execução, não por leitura. Nenhum deles aparecia nos `Files` da T3, e os dois primeiros
só estourariam **numa task depois** (a T5/T7, que rodam a suíte de client), parecendo regressão alheia:

| # | Arquivo que a T3 TEM de tocar | Teste que cai sem isso | Prova |
|---|---|---|---|
| 1 | **`client/src/utils/permissaoErro.js`** — acrescentar `autorizar_excedente: 'autorizar recebimento acima do pedido'` no mapa `ACOES` | **`client/src/utils/permissaoErro.test.js:44`** — *"toda acao de ACAO_PERFIS tem rotulo proprio — nenhuma cai no fallback"*, que **importa `ACAO_PERFIS` do servidor** (`:46`) e afirma `expect(semRotulo).toEqual([])` | é o **mesmo defeito** do fix-round `7982f18` da Etapa 30, que achou quatro ações sem rótulo; o teste foi escrito exatamente para não deixar acontecer de novo |
| 2 | **`server/services/almoxarifado/auditLabels.js`** — `EXCEDENTE_AUTORIZADO` num grupo de `GRUPOS_ACAO` (rótulo sugerido: `'Excedente autorizado'`) | **`server/tests/api/auditLabels.api.test.js`**, cenário *"as tres fontes cobertas: TODO verbo gravavel tem rotulo"* → `assert.deepStrictEqual(semRotulo, [])`. A varredura é `grep -rhoP "(?<![A-Za-z_])acao: '\K[A-Z_]+"` e **pega o literal novo** | medido: `rotularAcao('EXCEDENTE_AUTORIZADO')` devolve `'EXCEDENTE_AUTORIZADO'` (o próprio verbo = "sem rótulo") |
| 3 | **`auditLabels.js`** — `recebimento_item` em `ROTULOS_ENTIDADE` (rótulo: `'Item do recebimento'`) | o **mesmo arquivo**, cenário *"cobertura das entidades: os 26 literais tem rotulo"* → `assert.deepStrictEqual(semRotulo, [])` | medido: `rotularEntidade('recebimento_item')` devolve `'recebimento_item'`; `'recebimento'` (sem `_item`) já tem rótulo `'Recebimento'`. **Alternativa descartada:** auditar como `entidade: 'recebimento'` com o id do item em `dados_novos` — perde a precisão que a trilha existe para dar, por uma linha de rótulo |

**Logo o Step 4 da T3 passa a rodar TAMBÉM `auditLabels.api.test.js` e a suíte de client de
`permissaoErro`** — está escrito lá.

### 6. Literais de tela (client, T5)

| Situação | Texto literal no DOM |
|---|---|
| rótulo do campo | `Qtd. conferida` |
| esperada ao lado | `Esperada: <n>` |
| divergência **a menos** | `Divergência: <n> a menos que o esperado (<esperada>)` |
| divergência **a mais** | `Divergência: <n> a mais que o esperado (<esperada>)` |
| caixa de autorização (só com `pode('autorizar_excedente')`) | `Autorizo o recebimento acima do pedido` |
| botão | `Salvar Conferência` |

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `server/services/almoxarifado/schema.js` **(modificar)** | `TIPOS_RECEBIMENTO` + export; índice `idx_receb_nf_fornecedor` | 1, 2 |
| `server/services/almoxarifado/schemas.js` **(modificar)** | `RecebimentoCreateSchema` + `RecebimentoFiscalSchema` (`looseObject`), a constante da literal, e as **duas linhas do `module.exports`** | 1 |
| `server/routes/almoxarifado/extended.js` **(modificar)** | `validate(...)` em `:973` e `:1098`, **depois** do `requirePermission` | 1 |
| `server/services/almoxarifado/receiptService.js` **(modificar)** | `assertNotaNaoDuplicada` + chamada nos dois escritores; `assertExcedentePermitido` + chamada nas duas portas de quantidade; `COALESCE` no `UPDATE` de item do `/conferir`; `TIPOS_RECEBIMENTO` no lugar do literal de `:108` | 1, 2, 3 |
| `server/services/almoxarifado/permissions.js` **(modificar)** | ação `autorizar_excedente` com o comentário do critério e da exclusão do ALMOXARIFE | 3 |
| **(Fase 2)** `client/src/utils/permissaoErro.js` **(modificar)** | rótulo da ação nova — sem ele `permissaoErro.test.js:44` fica **vermelho**, e só na T5/T7 | 3 |
| **(Fase 2)** `server/services/almoxarifado/auditLabels.js` **(modificar)** | verbo `EXCEDENTE_AUTORIZADO` + entidade `recebimento_item` — sem eles `auditLabels.api.test.js` fica **vermelho** | 3 |
| `server/tests/api/recebimentoTipoEnum.api.test.js` **(criar)** | RN-11 | 1 |
| `server/tests/api/recebimentoNfDuplicada.api.test.js` **(criar)** | RN-12, RN-13, RN-14 | 2 |
| `server/tests/api/recebimentoExcedente.api.test.js` **(criar)** | RN-18 (nas duas portas, com 403 e 200) | 3 |
| `server/tests/api/recebimentoWorkflowOrdem.api.test.js` **(criar)** | RN-15 | 4 |
| `server/tests/api/minhasPermissoes.api.test.js` **(modificar)** | a linha negativa do ALMOXARIFE para `autorizar_excedente` | 3 |
| `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js` **(modificar)** | campo de quantidade conferida, esperada × recebida, aviso de divergência, caixa de autorização, botão `Salvar Conferência` → `PUT /conferir`; `setLoadingDetalhe(false)` em `fecharDetalhe` | 5, 6 |
| `client/src/components/almoxarifado/RecebimentosAlmoxarifado.test.js` **(modificar)** | fixture `EM_CONFERENCIA`, mock de `api.put`, cenários (m)/(n)/(o) | 5 |
| `client/src/components/almoxarifado/RequisicoesList.js` **(modificar)** | `setLoadingDetalhe(false)` em `fecharDetalhe` (o gêmeo que o `2817054` não pegou) | 6 |
| `server/tests/api/recebimentoPortasIntegracao.api.test.js` **(criar)** | a integração que cruza galhos: um cenário **pela ROTA** e um **pelo SERVIÇO** | 7 |
| `specs/modulo-almoxarifado/08-recebimento/README.md`, `specs/modulo-almoxarifado/README.md`, `docs/almoxarifado-guia-etapas-e-testes.md`, `docs/almoxarifado-novidades-por-etapa.md`, `docs/almoxarifado-manual-do-sistema.md`, este plano, o plano da 35 **(modificar)** | fechamento, e as **seis** correções de doc que a Fase 0 achou | 8 |

---

## Sort topológico

Critério da Fase 3 da skill: **motor, migration, `ACAO_PERFIS` ou regra compartilhada = tronco**;
**tela contra contrato congelado = galho**.

| Task | Tipo | Depende de | Por quê |
|---|---|---|---|
| 1 — enum nas duas portas | **tronco** | — | mexe em `schema.js` (fonte do enum), `schemas.js` (lista fechada de export) e nas **duas** rotas; qualquer task que rode a suíte antes dela veria 500 se o export estiver errado |
| 2 — NF duplicada nas duas portas | **tronco** | 1 | regra compartilhada no `receiptService`, mais índice; toca o **mesmo arquivo** da T1 (`receiptService.js`), logo mesma árvore, sequencial |
| 3 — `autorizar_excedente` + barreira de excedente | **tronco** | 2 | muda **`ACAO_PERFIS`** — tronco por definição do critério. E congela o 400/403 que a T5 (client) vai citar |
| 4 — `avancar etapa fora de ordem falha` | galho **A** | 3 | **zero linhas de produção**: só um arquivo de teste novo. Não toca nada que os outros toquem |
| 5 — quantidade conferida no painel | galho **B** | 3 | tela contra contrato congelado. **É o item de maior valor da 08 hoje** — e maior valor não é critério de tronco, acoplamento é |
| 6 — `setLoadingDetalhe(false)` nas duas telas | galho **C** | — | duas linhas em dois arquivos de client; toca `RecebimentosAlmoxarifado.js`, que é da T5 → **sequencial depois da T5**, mesma árvore |
| 7 — integração que cruza galhos | sequencial | 4, 5, 6 | um cenário pela **rota** e um pelo **serviço**, mais os cinco comandos da suíte |
| 8 — fechamento | sequencial | 7 | specs, mapa, guia, manual, novidades, os dois planos |

### Divergência declarada da skill: os galhos vão SEQUENCIAIS, não em worktrees

A `desenvolver-etapa-almoxarifado` manda rodar galhos paralelos em worktrees isoladas. **Medido e
confirmado nesta etapa:** `node_modules/`, `client/node_modules/` **e `server/node_modules/`** estão no
`.gitignore` (`.gitignore:2-4`), então uma worktree nova **não tem `react-scripts` nem `supertest`** e
não roda nem a suíte de client nem a de API. Isolar exigiria um `npm install` por worktree — a mesma
divergência declarada desde a Etapa 34, e ela continua valendo.

Somando a isso: **há um único galho de servidor** (T4, e ele é zero linha de produção), então não existe
par de galhos de servidor a paralelizar. **Decisão: tudo sequencial, um executor por task**, na ordem
literal **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**. A coluna "Depende de" descreve **acoplamento**, não
permissão para antecipar.

---

### Task 1: o enum nas duas portas — e o trap do strip **(tronco)**

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (junto de `TIPOS_REQUISICAO`/`TIPOS_MOVIMENTO` e do
  `module.exports`)
- Modify: `server/services/almoxarifado/schemas.js`
- Modify: `server/routes/almoxarifado/extended.js:973` e `:1098`
- Modify: `server/services/almoxarifado/receiptService.js:108`
- Create: `server/tests/api/recebimentoTipoEnum.api.test.js`

**Interfaces:** `TIPOS_RECEBIMENTO` (array de string) exportado de `schema.js`;
`RecebimentoCreateSchema` e `RecebimentoFiscalSchema` exportados de `schemas.js`. Nada mais sai.

**Restrições medidas, cada uma com o que cai se violada:**

| Não faça | Por quê | Cai em |
|---|---|---|
| `z.object` em vez de `z.looseObject` | `validate()` troca `req.body` por `parsed.data` e `z.object` descarta `nota_fiscal`/`itens` → **todo** POST válido responde `400 'Inclua ao menos um item'`; no `PUT /fiscal`, **todo campo fiscal some** e o `UPDATE` grava só o tipo | os cenários **(2)**, **(3)**, **(4)** e **(6)** desta task — **(Fase 2)**, o (2) inclusive, porque ele cria um recebimento válido antes de atacar a segunda porta (e, por tabela, `recebimentoCustoMedio`, `alertaEventoJornada`, `recebimentoEntradaAtomica`) |
| tornar `tipo_recebimento` obrigatório | `criarRecebimento` **deriva** o default (`receiptService.js:108`) e dois testes chamam sem o campo | `recebimentoEntradaAtomica.api.test.js:192`, `alertaEventoJornada.api.test.js:82` |
| `validate` **antes** do `requirePermission` | 400 antes de 403 inverte a ordem das camadas | o cenário (5) desta task |
| deixar a mensagem padrão do `z.enum` | sai **em inglês** no Zod 4.4.3 e sem o valor recebido (medido) | o cenário (1), pela literal |
| repetir o array do enum em `schemas.js` | duas definições do mesmo enum divergem na primeira edição | nada cai hoje — é por isso que está **proibido por escrito** |
| esquecer o `module.exports` de `schemas.js` | binding `undefined` → `undefined.safeParse` → **500** depois do gate | sabotagem 3 desta task |

- [x] **Step 1: escrever o teste e ver os cinco cenários** (dois vermelhos, três verdes — leia **qual**)
      — arquivo criado como escrito abaixo, sem desvio (`d02b9f4`).

`server/tests/api/recebimentoTipoEnum.api.test.js`, no molde de formato de
`recebimentoEntradaAtomica.api.test.js` (runner próprio, `test()`, contador, `process.exit`):

```js
/**
 * RN-11 (Etapa 36) — `tipo_recebimento` validado nas DUAS portas de escrita.
 *
 * Antes desta etapa, medido por sonda executada na Fase 0:
 *   POST /recebimentos  com tipo_recebimento 'BANANA<script>'  -> 201, gravado cru
 *   PUT  /:id/fiscal    com tipo_recebimento 'QUALQUER_COISA'  -> 200, gravado
 * A coluna e WRITE-ONLY no servidor (ninguem a le depois — `avancarWorkflow`, `gerarContaPagar`,
 * `reportService` e `alertRegistry` nao a olham), e o unico ramo de comportamento e
 * `receiptService.js:108`: valor invalido se comporta como NOTA_FISCAL, em silencio.
 *
 * O cenario (3) e o que importa, e nao os negativos: `validate()` substitui `req.body` por
 * `parsed.data`, e `z.object` DESCARTA chave nao declarada. Com um `z.object` ingenuo aqui, TODO
 * POST valido passa a responder 400 "Inclua ao menos um item". Por isso os dois schemas sao
 * `z.looseObject` — e por isso este arquivo afirma QUATRO colunas gravadas com o valor enviado.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 64, nome: 'Admin Etapa 36', role: 'admin' };
const SEM_PERFIL = { id: 65, nome: 'Chao de Fabrica', role: 'usuario' };   // cai em PRODUCAO
const LITERAL = 'Dados inválidos — tipo_recebimento: '
  + 'forma de recebimento inválida (use NOTA_FISCAL ou PEDIDO_COMPRA)';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  const material = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, ativo) VALUES ('E36-01','Chapa E36','UN',0,1)`);

  await test('(1) POST com tipo_recebimento fora do enum responde 400 com a literal em portugues', async () => {
    const res = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'BANANA<script>',
      nota_fiscal: 'NF-E36-1',
      itens: [{ material_id: material.lastID, quantidade: 5 }],
    });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, LITERAL);
    // E nao gravou nada: a recusa e ANTES do servico.
    const qtd = await dbGet(db, 'SELECT COUNT(*) AS n FROM recebimentos_material_almoxarifado');
    assert.strictEqual(qtd.n, 0, 'o POST recusado nao pode ter criado documento');
  });

  await test('(2) a SEGUNDA porta: PUT /:id/fiscal recusa o enum e NAO altera a coluna', async () => {
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: 'NF-E36-2',
      itens: [{ material_id: material.lastID, quantidade: 5 }],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const id = criado.body.id;

    // (Fase 2) OBRIGATORIO: `salvarDadosFiscal` recusa status RECEBIDO antes de tudo
    // (`receiptService.js:253-259`). Sem este avanco, o 400 vem do guard de status
    // ("Dados fiscais so podem ser editados antes do processamento") e o cenario nao mede o enum.
    const wf = await request(app).post(`/api/almoxarifado/recebimentos/${id}/workflow`)
      .send({ acao: 'iniciar_conferencia' });
    assert.strictEqual(wf.status, 200, JSON.stringify(wf.body));

    const res = await request(app).put(`/api/almoxarifado/recebimentos/${id}/fiscal`)
      .send({ tipo_recebimento: 'QUALQUER_COISA', nota_serie: '9' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, LITERAL);

    const rec = await dbGet(db,
      'SELECT tipo_recebimento, nota_serie FROM recebimentos_material_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(rec.tipo_recebimento, 'NOTA_FISCAL', 'a coluna tinha de continuar intacta');
    assert.strictEqual(rec.nota_serie, null, 'a recusa e do PUT INTEIRO, nao so do campo invalido');
  });

  await test('(3) CONTROLE DO STRIP: POST valido grava as QUATRO colunas que nao estao no schema', async () => {
    const res = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL',
      nota_fiscal: 'NF-E36-3',
      observacoes: 'Caixa amassada no canto',
      fornecedor_cnpj: '33.333.333/0001-33',
      itens: [{ material_id: material.lastID, quantidade: 5, lote: 'L-E36' }],
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const rec = await dbGet(db, `SELECT tipo_recebimento, nota_fiscal, observacoes, fornecedor_cnpj
      FROM recebimentos_material_almoxarifado WHERE id = ?`, [res.body.id]);
    assert.strictEqual(rec.tipo_recebimento, 'NOTA_FISCAL');
    assert.strictEqual(rec.nota_fiscal, 'NF-E36-3');
    assert.strictEqual(rec.observacoes, 'Caixa amassada no canto');
    assert.strictEqual(rec.fornecedor_cnpj, '33.333.333/0001-33');
    const item = await dbGet(db, `SELECT lote FROM recebimentos_material_itens_almoxarifado
      WHERE recebimento_id = ?`, [res.body.id]);
    assert.strictEqual(item.lote, 'L-E36', 'o `itens` sobreviveu ao parse (looseObject, nao object)');
  });

  await test('(4) sem tipo no body, o default DERIVADO continua vivo', async () => {
    // (Fase 2) MEDIDO: `pedidos_compra` NAO existe no harness — nem `initSchema` nem
    // `testApp.js` a criam (so `itens_pedido_compra`, com FK para ela). Sonda executada:
    // `INSERT INTO pedidos_compra ...` -> "SQLITE_ERROR: no such table: pedidos_compra".
    // Cinco arquivos de tests/api/ a criam no proprio arquivo (molde:
    // `solicitacaoCicloVida.api.test.js:103`); DDL de producao em `server/index.js:19230-19242`,
    // onde `fornecedor_id` e NOT NULL. Sem este CREATE o cenario (4) nasce VERMELHO pelo motivo
    // errado e continua vermelho depois do conserto.
    await dbRun(db, `CREATE TABLE IF NOT EXISTS pedidos_compra (
      id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT UNIQUE, fornecedor_id INTEGER NOT NULL,
      valor_total REAL DEFAULT 0, data_pedido DATE, previsao_entrega DATE,
      status TEXT DEFAULT 'pendente', observacoes TEXT
    )`);
    const forn = await dbRun(db,
      `INSERT INTO fornecedores (razao_social, cnpj) VALUES ('Forn E36','44.444.444/0001-44')`);
    const pedido = await dbRun(db,
      `INSERT INTO pedidos_compra (numero, fornecedor_id, status) VALUES ('PC-E36', ?, 'ABERTO')`,
      [forn.lastID]);
    const res = await request(app).post('/api/almoxarifado/recebimentos').send({
      pedido_compra_id: pedido.lastID,
      itens: [{ material_id: material.lastID, quantidade: 3 }],
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const rec = await dbGet(db,
      'SELECT tipo_recebimento FROM recebimentos_material_almoxarifado WHERE id = ?', [res.body.id]);
    assert.strictEqual(rec.tipo_recebimento, 'PEDIDO_COMPRA');
  });

  await test('(5) 403 vem ANTES do 400: usuario sem perfil nem chega na validacao', async () => {
    setUser(SEM_PERFIL);
    const res = await request(app).post('/api/almoxarifado/recebimentos')
      .send({ tipo_recebimento: 'BANANA', itens: [] });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.strictEqual(res.body.acao, 'receber_material');
    assert.strictEqual(res.body.perfil, 'PRODUCAO');
    setUser(ADMIN);
  });

  // (Fase 2) CENARIO NOVO — a metade POSITIVA da SEGUNDA porta, que faltava.
  // Sem ele, um `z.object` aplicado SO ao RecebimentoFiscalSchema nao derruba nada neste arquivo:
  // o (3) cobre o strip do POST, e nenhum cenario cobria o strip do PUT. A sabotagem 1 da tabela
  // troca os DOIS schemas, mas a regua tem de existir para cada porta separadamente.
  await test('(6) CONTROLE DO STRIP NA SEGUNDA PORTA: PUT /fiscal valido grava os campos que nao estao no schema', async () => {
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: 'NF-E36-6',
      itens: [{ material_id: material.lastID, quantidade: 4 }],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const id = criado.body.id;
    const wf = await request(app).post(`/api/almoxarifado/recebimentos/${id}/workflow`)
      .send({ acao: 'iniciar_conferencia' });
    assert.strictEqual(wf.status, 200, JSON.stringify(wf.body));

    const res = await request(app).put(`/api/almoxarifado/recebimentos/${id}/fiscal`).send({
      tipo_recebimento: 'PEDIDO_COMPRA',
      nota_serie: '7', cfop_nota: '1102', valor_total_nota: 123.45,
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const rec = await dbGet(db, `SELECT tipo_recebimento, nota_serie, cfop_nota, valor_total_nota
      FROM recebimentos_material_almoxarifado WHERE id = ?`, [id]);
    assert.strictEqual(rec.tipo_recebimento, 'PEDIDO_COMPRA');
    assert.strictEqual(rec.nota_serie, '7', 'o PUT sobreviveu ao parse (looseObject, nao object)');
    assert.strictEqual(rec.cfop_nota, '1102');
    assert.strictEqual(rec.valor_total_nota, 123.45);
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
```

⚠️ **(Fase 2) MEDIDO, não "confira":** `resolverPedidoCompra` (`receiptService.js:88-95`) consulta
`pedidos_compra`, e **essa tabela não existe no harness** — o `CREATE TABLE` está agora dentro do
cenário (4), com `fornecedor_id NOT NULL` como em produção (`server/index.js:19230-19242`).
`materiais_almoxarifado` tem `unidade` e `recebimentos_material_almoxarifado` tem `nota_serie`: os
dois `INSERT`/`SELECT` do arquivo foram executados contra o harness e passam.

- [x] **Step 2: rodar e LER os números**

```
cd server && node tests/api/recebimentoTipoEnum.api.test.js
```

Esperado **antes** do conserto: **(1), (2) e o (6)… não** — leia com cuidado, porque a Fase 2
corrigiu esta previsão. **(Fase 2) Previsão medida:** **(1) vermelho** (a rota responde 201, não
400); **(2) vermelho** — mas **na asserção da literal, não na do status**: com o avanço para
`EM_CONFERENCIA` o `PUT` responde **200** hoje, então cai em `assert.strictEqual(res.status, 400)`;
**(3), (4), (5) e (6) verdes**. Se (1) ou (2) já vier verde, **pare**: a rota está recusando por
outro motivo e o cenário mede outra coisa. Cole aqui as duas linhas reais do `✗`.

**RODADA RED REAL — `4 passou, 2 falhou`, a previsão da Fase 2 bateu nos dois cenários e nas duas
asserções.** As duas linhas do `✗`, literais:

```
  ✗ (1) POST com tipo_recebimento fora do enum responde 400 com a literal em portugues: {"id":1,"numero":"REC-MU40KDD87LYG9GMY","status":"RECEBIDO"}
201 !== 400
  ✗ (2) a SEGUNDA porta: PUT /:id/fiscal recusa o enum e NAO altera a coluna: {"success":true}
200 !== 400
```

O corpo do `✗` do (1) é o próprio achado da Fase 0 reproduzido: a rota **criou o documento** com
`tipo_recebimento: 'BANANA<script>'` e devolveu `201` com número. O (2) caiu em
`assert.strictEqual(res.status, 400)` recebendo `200` com `{"success":true}` — ou seja, o `PUT`
**aceitou** `'QUALQUER_COISA'`, que é exatamente o que a Fase 2 previu contra a previsão antiga
("cai na asserção da literal"). **(3), (4), (5) e (6) verdes**, como previsto — e o (4) só é verde
porque o `CREATE TABLE pedidos_compra` está dentro dele.

- [x] **Step 3: implementar**

Em `schema.js`, junto dos outros enums de fonte única, e **na lista do `module.exports`**:

```js
// Etapa 36 (RN-11): fonte UNICA dos valores de `tipo_recebimento`. A coluna existe desde sempre
// (`recebCols`, "tipo_recebimento TEXT DEFAULT 'NOTA_FISCAL'") e aceitava QUALQUER string — medido
// por sonda na Fase 0: 'BANANA<script>' entrava com 201. Mora aqui, e nao em schemas.js, pelo mesmo
// motivo de TIPOS_REQUISICAO/TIPOS_MOVIMENTO: quem grava (receiptService) e quem valida (Zod) tem de
// ler a MESMA lista, senao a etapa cria duas definicoes do mesmo enum.
const TIPOS_RECEBIMENTO = ['NOTA_FISCAL', 'PEDIDO_COMPRA'];
```

Em `schemas.js` (importando `TIPOS_RECEBIMENTO` na linha do `require('./schema')`, `:3`):

```js
// UMA literal para as DUAS portas: escrita a mao duas vezes, ela divergiria na primeira edicao e o
// operador veria texto diferente dependendo de qual porta recusou. A mensagem e propria porque o
// `z.enum` nu do Zod 4.4.3 responde EM INGLES e sem o valor recebido (medido na Fase 0), o que
// quebra a convencao de mensagens em portugues deste modulo.
const TIPO_RECEBIMENTO_INVALIDO = 'forma de recebimento inválida (use NOTA_FISCAL ou PEDIDO_COMPRA)';

// `looseObject`, NUNCA `object`: `validate()` substitui `req.body` por `parsed.data` e `z.object`
// descarta chave nao declarada — com `object`, `nota_fiscal` e `itens` SOMEM e todo POST valido
// responde 400 "Inclua ao menos um item" (`receiptService.js:126`). Quarta encarnacao do defeito
// ja comentado neste arquivo para `reserva_id`, `lote_id` e `series`.
// `.optional()` nao e estilo: `criarRecebimento` DERIVA o tipo quando o body nao traz (`:108`), e
// `recebimentoEntradaAtomica.api.test.js:192` / `alertaEventoJornada.api.test.js:82` chamam sem ele.
const RecebimentoCreateSchema = z.looseObject({
  tipo_recebimento: z.enum(TIPOS_RECEBIMENTO, { message: TIPO_RECEBIMENTO_INVALIDO }).optional(),
});
const RecebimentoFiscalSchema = z.looseObject({
  tipo_recebimento: z.enum(TIPOS_RECEBIMENTO, { message: TIPO_RECEBIMENTO_INVALIDO }).optional(),
});
```

**E as duas linhas no `module.exports`** — o arquivo exporta por lista fechada (ver o comentário do
`AnexoCreateSchema`), e esquecê-las é 500 com stack, não `undefined` silencioso.

⚠️ **São TRÊS lugares de fiação, não dois.** `extended.js:25` importa os schemas por
**desestruturação em lista** (`const { CentroCustoSchema, …, AnexoCreateSchema } = require('…/schemas')`)
e `validate` **já está importado** em `:24` — então os dois nomes novos precisam entrar **naquela
linha** também. Esquecer ali dá o mesmo 500 de `undefined.safeParse`, e o comentário de `:35` do
próprio arquivo registra que binding desestruturado é resolvido no `require` e cacheado.

Nas rotas (`extended.js:973` e `:1098`), **depois** do `requirePermission`:

```js
app.post('/api/almoxarifado/recebimentos', auth, requirePermission('receber_material'),
  validate(RecebimentoCreateSchema), async (req, res) => {
```

```js
app.put('/api/almoxarifado/recebimentos/:id/fiscal', auth, requirePermission('receber_material'),
  validate(RecebimentoFiscalSchema), async (req, res) => {
```

E em `receiptService.js:108`, o literal sai e a constante entra:

```js
const tipo = tipo_recebimento
  || (pedido_compra_id || pedido_compra_numero ? TIPOS_RECEBIMENTO[1] : TIPOS_RECEBIMENTO[0]);
```

> Se `TIPOS_RECEBIMENTO[1]` parecer obscuro, exporte de `schema.js` também
> `TIPO_RECEBIMENTO = { NOTA_FISCAL: 'NOTA_FISCAL', PEDIDO_COMPRA: 'PEDIDO_COMPRA' }` e use os nomes —
> **mas não** reescreva as strings à mão aqui.

⚠️ **DIVERGÊNCIA EXECUTADA (T1, `d02b9f4`) — nem o índice nu nem o segundo export.** O plano dava
duas saídas e a task tomou uma **terceira**, porque as duas tinham custo: `TIPOS_RECEBIMENTO[1]` no
default derivado deixa a reordenação da lista em `schema.js` **inverter o default em silêncio** (e
**nenhum teste de hoje pegaria**, porque a coluna é write-only — é o mesmo modo de falha que esta
etapa existe para matar); e exportar `TIPO_RECEBIMENTO` de `schema.js` contraria o **Interfaces**
desta task, que diz literalmente *"`TIPOS_RECEBIMENTO` … Nada mais sai"*. O que foi escrito
desestrutura **posicionalmente da própria lista**, dentro do `receiptService.js`, sem export novo e
sem string do enum reescrita à mão:

```js
const { TIPOS_RECEBIMENTO } = require('./schema');
const [TIPO_NOTA_FISCAL, TIPO_PEDIDO_COMPRA] = TIPOS_RECEBIMENTO;
```

e as **duas** ocorrências de `:108-110` passaram a usar os nomes (o `const tipo` e o
`if (tipo === TIPO_PEDIDO_COMPRA)` logo abaixo, que o plano não citava e também era literal).
Sem ciclo: `schema.js` requer só `./db`.

- [x] **Step 4: rodar e ver os SEIS verdes** (Fase 2: o (6) é novo), e a suíte de API inteira

```
cd server && node tests/api/recebimentoTipoEnum.api.test.js
cd server && npm run test:api
```

`test:api` tem de ficar **169/169 arquivos OK** (o número da Etapa 35) **+ 1** arquivo novo. Se algum
arquivo que hoje passa ficar vermelho, é quase certo o strip — releia o Step 3.

**REAL:** `6 passou, 0 falhou` no arquivo, e a suíte inteira em **`170/170 arquivos de teste OK`** —
169 da Etapa 35 + este. Nenhum arquivo que passava ficou vermelho.

**A suíte de client de `permissaoErro` NÃO foi rodada nesta task, e é de propósito:**
`permissaoErro.test.js:46` importa `server/services/almoxarifado/permissions.js`, e `permissions.js`
requer **só** `../systemPermissions` — nenhum dos quatro arquivos de produção da T1 (`schema.js`,
`schemas.js`, `extended.js`, `receiptService.js`) está no grafo dele. Quem tem de rodar aquela suíte
é a **T3**, que mexe em `ACAO_PERFIS`.

- [x] **Step 5: CONTROLE POSITIVO — três sabotagens, e leia QUAL asserção cai**

**(Fase 2) A coluna da âncora foi reescrita:** `z.looseObject` dá **2** em `schemas.js` depois da T1,
e a sabotagem 1 é deliberadamente nos dois sítios. Onde a sabotagem é de **um** sítio só, a âncora
é o **bloco ancorado** da coluna, e ela tem de dar **1**.

| # | Sabotagem (`perl -0pi -e`) | Âncora e contagem esperada | O que TEM de cair |
|---|---|---|---|
| 1 | trocar `z.looseObject` por `z.object` nos **dois** schemas | `grep -cF 'z.looseObject' schemas.js` = **2**, as duas alvo | **(Fase 2) previsão corrigida:** cai **(3)** em `assert.strictEqual(res.status, 201)` (recebe **400** `'Inclua ao menos um item'`), cai **(4)** pelo mesmo motivo, cai **(6)** (`nota_serie` volta `null`, porque o `PUT` só levou o tipo) — **e cai também o (2)**, no `assert.strictEqual(criado.status, 201)` do POST de preparação. A previsão anterior (*"os negativos (1) e (2) continuam verdes"*) **estava errada**: o (2) cria um recebimento válido antes de atacar a segunda porta. **Só o (1) e o (5) ficam verdes.** Fora deste arquivo caem `recebimentoCustoMedio`, `alertaEventoJornada` e `recebimentoEntradaAtomica` |
| 1b | **(Fase 2) sabotagem nova:** trocar `z.looseObject` por `z.object` **só no `RecebimentoFiscalSchema`** | `grep -cF 'const RecebimentoFiscalSchema = z.looseObject({' schemas.js` = **1** | **só o (6)**, nas asserções de `nota_serie`/`cfop_nota`/`valor_total_nota`. Sem o cenário (6) esta sabotagem seria **no-op** — era o furo da régua desta task |
| 2 | apagar `validate(RecebimentoFiscalSchema)` da rota do `PUT` (só ela) | `grep -cF 'validate(RecebimentoFiscalSchema)' extended.js` = **1** | **(Fase 2) previsão corrigida:** **só o cenário (2)**, e **na asserção `assert.strictEqual(res.body.error, LITERAL)`** — o status volta **200** (com o avanço para `EM_CONFERENCIA` o serviço aceita o PUT), então é o `assert.strictEqual(res.status, 400)` que cai primeiro. **Não** leia "recebeu 400, logo a guarda está de pé": sem o avanço de status, o 400 sairia do guard `'Dados fiscais só podem ser editados antes do processamento'` e esta sabotagem seria **invisível** |
| 3 | apagar a linha `RecebimentoCreateSchema,` do `module.exports` de `schemas.js` | a âncora é `"\n  RecebimentoCreateSchema,\n"` (com a indentação), porque o identificador nu aparece **3x** no arquivo (declaração, export) e **1x** em `extended.js:25` | **o arquivo INTEIRO fica vermelho com 500** (`undefined.safeParse`). Aqui a leitura é "qual arquivo caiu", não "qual asserção" — e o achado é que a lista fechada de export é fiação sem rede: nenhum teste de hoje falha em *tempo de carga*, só em tempo de requisição |
| 4 | trocar a mensagem própria por `z.enum(TIPOS_RECEBIMENTO).optional()` (padrão do Zod) | `grep -cF '{ message: TIPO_RECEBIMENTO_INVALIDO }' schemas.js` = **2**, as duas alvo | **(1) e (2)**, na asserção da literal. **Medido no `node -e` com o Zod 4.4.3 desta base**, e é a string exata que vai aparecer no `✗`: `Dados inválidos — tipo_recebimento: Invalid option: expected one of "NOTA_FISCAL"\|"PEDIDO_COMPRA"`. Prova que a literal está congelada, e não só o status |

#### RESULTADO EXECUTADO das cinco sabotagens (T1, antes do commit `d02b9f4`)

`perl -e 'print 1'` verificado antes de tudo (`/usr/bin/perl` existe e executa). Restauro por
**cópia de segurança no scratchpad** (`bkp-schemas-t1`, `bkp-extended-t1`) — nunca
`git checkout --`, porque o conserto ainda não estava commitado. `md5sum` **pós-conserto** (o valor
ao qual cada restauro tem de voltar): `schemas.js` **`0a6f01eb79a3a7b31a67e8ab65d4287b`**,
`extended.js` **`29c1df564194ff3f7a320c21421137e6`**. Os cinco restauros voltaram a esses dois
valores, e o `git status` final acusou **só** os 4 modificados + o teste novo.

| # | Âncora (contada **depois** do conserto) | md5 pós-sabotagem | Placar | **Asserção que caiu** |
|---|---|---|---|---|
| 1 | `z.looseObject` = **2** → 0 | `51b1f2f20c750b10c52c4e17e8cacf32` | 2 passou, 4 falhou | **(2)(3)(4)(6)**, as quatro em `assert.strictEqual(status, 201)` recebendo `400 {"error":"Inclua ao menos um item"}`. No (2) é o `criado.status` do POST de **preparação** — a correção da Fase 2 estava certa. **Só (1) e (5) verdes** |
| 1b | `const RecebimentoFiscalSchema = z.looseObject({` = **1** → `z.looseObject` = 1 | `7d474b9730173bf32dba88cb327567ba` | 5 passou, 1 falhou | **só o (6)**, em `assert.strictEqual(rec.nota_serie, '7', 'o PUT sobreviveu ao parse…')` → `null !== '7'`. **A sabotagem que justifica o cenário (6) da Fase 2:** sem ele seria no-op |
| 2 | `validate(RecebimentoFiscalSchema)` em `extended.js` = **1** → 0 | `d788ff139694b2c4c8e649858d0f4e38` | 5 passou, 1 falhou | **só o (2)**, em `assert.strictEqual(res.status, 400)` recebendo `200 {"success":true}` — **e não** na asserção da literal, como a Fase 2 corrigiu |
| 3 | `grep -cx '  RecebimentoCreateSchema,'` = **1** → 0 | `f07c0eeca1d449f2e1f60a89be83d874` | 1 passou, 5 falhou | **(1)(2)(3)(4)(6)** com **500** e `TypeError: Cannot read properties of undefined (reading 'safeParse')` em `validation.js:25`. Leitura por arquivo, como o plano manda |
| 4 | `{ message: TIPO_RECEBIMENTO_INVALIDO }` = **2** → 0 | `bfadc0a1cd0348239aa3cf1803b9a1e7` | 4 passou, 2 falhou | **(1) e (2)**, na asserção da literal, com a string **exatamente** como o plano previu: `'Dados inválidos — tipo_recebimento: Invalid option: expected one of "NOTA_FISCAL"\|"PEDIDO_COMPRA"'` |

**Três correções à coluna "O que TEM de cair", medidas por execução:**

1. **Sabotagem 1 — `recebimentoCustoMedio` NÃO cai.** A tabela prevê que ele caia junto; executado,
   ele deu `5 passed, 0 failed` **com a sabotagem no ar**. Motivo medido:
   `grep -cF "post('/api/almoxarifado/recebimentos')" tests/api/recebimentoCustoMedio.api.test.js`
   = **0** — ele chama `receiptService.criarRecebimento(db, ADMIN, {...})` **direto**
   (`:48` e `:121`), e por isso não passa por `validate` nenhum. Os outros dois da previsão caem:
   `alertaEventoJornada` **0 passed, 5 failed** e `recebimentoEntradaAtomica` **6 passed, 1 failed**.
   **Consequência para a T2 e a T3:** teste que chama o serviço direto **não** é régua de nada que
   more na rota — e a recíproca é o que o design já decidiu (a guarda de NF e a de excedente moram
   **no serviço**, justamente para alcançar os dois caminhos).
2. **Sabotagem 3 — o arquivo não fica *inteiro* vermelho: o (5) sobrevive.** `1 passou, 5 falhou`, e
   o que passou é o **(5)**, porque o **403 do `requirePermission` responde antes** de o `validate`
   quebrado ser alcançado (o stack confirma: `permissions.js:170` chama o `next` que estoura em
   `validation.js:25`). O cenário de ordem das camadas é, por acidente, o **único imune** a um
   export faltando — e isso é mais uma prova de que `validate` ficou **depois** do gate.
3. **Sabotagem 3 — a contagem da âncora no plano está errada, e o método também.** O plano diz
   *"o identificador nu aparece 3x no arquivo"*; medido, `grep -cF 'RecebimentoCreateSchema'
   schemas.js` = **2** (declaração + export) e 1x em `extended.js:25`. Pior: `grep -cF` com `\n`
   embutido na âncora **não mede nada** — é line-based e devolveu **795** (o total de linhas do
   arquivo). A contagem que vale para âncora de linha inteira é **`grep -cx '  Recebimento…,'`** ou
   `perl -0ne 'my $c = () = /…/g'`. **Vale para as próximas tasks desta etapa.**

- [x] **Step 6: commit** (um assunto: o enum) — **`d02b9f4`**, 5 arquivos, 222 inserções.

`git add` só de: `server/services/almoxarifado/schema.js`, `schemas.js`, `receiptService.js`,
`server/routes/almoxarifado/extended.js`, `server/tests/api/recebimentoTipoEnum.api.test.js`.
Corpo em português sem acento: o bug (as duas portas gravavam qualquer string em `tipo_recebimento`,
medido com `'BANANA<script>'` e 201), a consequência (coluna impura para todo relatorio futuro, e o
ramo de pedido de compra pulado em silencio — `'BANANA'` se comporta como `NOTA_FISCAL`), o que foi
decidido (`looseObject` + `.optional()` + literal propria em portugues, enum com fonte unica em
`schema.js`) e o que foi descartado (`z.object`, que derrubaria todo POST valido; mensagem padrao do
Zod, que sai em ingles; repetir o array nos dois schemas).

---

### Task 2: a mesma NF não entra duas vezes — nas duas portas **(tronco)**

**Files:**
- Modify: `server/services/almoxarifado/receiptService.js` (`assertNotaNaoDuplicada`, chamada em
  `criarRecebimento` antes do `inserirComNumeroUnico` e em `salvarDadosFiscal` antes do `UPDATE`)
- Modify: `server/services/almoxarifado/schema.js` (índice `idx_receb_nf_fornecedor`)
- Create: `server/tests/api/recebimentoNfDuplicada.api.test.js`

**Interfaces:** nada novo sai do serviço — `assertNotaNaoDuplicada` é interna (não precisa entrar no
`module.exports`, **a menos** que o cenário "pelo serviço" da T7 a chame direto; nesse caso exporte e
diga por quê).

**Contrato congelado:** `409` com
`Nota fiscal <NF> já lançada no recebimento <numero do REC> para este fornecedor`. **O número do
documento existente vai na mensagem** — sem ele o operador não tem como encontrar onde a nota já está.

⚠️ **O modo de falha número 2 desta etapa vive aqui.** `gerarContaPagar` devolve `null` quando a
tabela `contas_pagar` não existe (`receiptService.js:648-650`), e **nenhum** arquivo de `tests/api/`
cria essa tabela hoje. **Sem criar a tabela, a asserção "1 conta a pagar" passa com 0 de cada lado** —
teste vazio, o quinto desta base. O arquivo cria a tabela com as colunas que `gerarContaPagar` insere:
`descricao`, `fornecedor`, `valor`, `data_vencimento`, `status`, `categoria`, `observacoes`.

- [x] **Step 1: escrever o teste e MEDIR O DANO antes do conserto** — `ffc5f47`, arquivo criado com
      os sete cenários. **Duas divergências declaradas**, as duas medidas por execução:
      **(a)** o `COUNT(*)` do cenário (1) é **escopado pela NF** (`WHERE nota_fiscal = 'NF-DUP-1'`)
      em vez do `COUNT(*)` da tabela inteira — a sensibilidade à sabotagem 3 é idêntica (o documento
      fantasma tem essa NF) e o cenário deixa de depender de ser o **primeiro** do arquivo.
      **(b)** o `PUT /fiscal` do helper de processamento manda também `fornecedor_nome`: os cinco
      campos que o plano lista incluem "fornecedor", mas `validarDadosProcessamento` (`:361`) exige
      `fornecedor_nome` **ou** `fornecedor_cnpj`, e `fornecedor_id` **não** satisfaz. A primeira
      rodada RED caiu em `400 "Preencha antes de processar: fornecedor (CNPJ ou nome)"` — o
      "vermelho pelo motivo errado" que o Step 2 manda parar. A chave da guarda continua o `id`.
      Bônus: as **duas** medidas do dano entram na mensagem da primeira asserção do (2), senão a
      asserção que cai primeiro esconde a outra e metade do dano fica sem número registrado.

Cenários do arquivo (todos com metade positiva):

1. **`(1) dois POST com a mesma NF e o mesmo fornecedor: o segundo e recusado com 409`** — o primeiro
   **201**, o segundo **409** e `res.body.error` **igual** à literal, com o número do primeiro
   documento lido do banco (`SELECT numero ... WHERE id = <primeiro>`), nunca escrito à mão.
   ⚠️ **(Fase 2) acrescente aqui `COUNT(*) FROM recebimentos_material_almoxarifado === 1`** — sem
   essa asserção a **sabotagem 3** (mover a guarda para depois do `inserirComNumeroUnico`) é um
   **no-op**: o documento duplicado é gravado, a recusa acontece, e nem o saldo nem o
   `contas_pagar` do cenário (2) mudam, porque o teste nunca processa o segundo documento.
   Verificado contra o código: não há transação, então o `INSERT` do cabeçalho **persiste** quando
   o `throw` vem depois dele.
2. **`(2) A ASSERCAO QUE MEDE O DANO: saldo 10 e UMA conta a pagar, nao 20 e duas`** — cria os dois
   (o segundo recusado), leva o primeiro pelo workflow até `processar`, e afirma
   `quantidade_atual === 10` **e** `COUNT(contas_pagar) === 1`. **Antes do conserto este cenário mede
   20 e 2** — cole os dois números reais no Step 2.
3. **`(3) mesma NF, fornecedor DIFERENTE: os dois entram`** — 201 e 201 (dois fornecedores emitem nota
   com o mesmo número; barrar seria pior que o furo).
4. **`(4) sem nota fiscal: NULL nao e duplicata`** — dois `POST` sem `nota_fiscal`, mesmo fornecedor,
   201 nos dois.
5. **`(5) fornecedor NAO identificado nao caracteriza duplicata`** — dois `POST` com a mesma NF e
   `fornecedor_id`/`fornecedor_cnpj` **e `fornecedor_nome`** ausentes **(Fase 2: os três, agora que
   o nome entrou na chave)**, 201 nos dois. **Este cenário é o que protege os arquivos existentes**
   que criam recebimento pela rota sem fornecedor.
   ⚠️ **(Fase 2) Regressão re-medida com o nome na chave, arquivo por arquivo:**
   `alertaEventoGanchos` cria pela rota com `nota_fiscal: NF-GAN-${seq}` (**NF única por
   recebimento**, `:60`) e faz os `PUT /fiscal` de `NF-A1-1..4`/`NF-A6`/`NF-RN02` **no mesmo**
   documento → protegidos pelo `AND id <> ?`. `alertaEventoJornada` é o único que repete a mesma
   literal `'NF-JOR17-1'` (`:83` e `:103`) — e é o **mesmo** `recId`, com `fornecedor_nome:
   'Fornecedor Jornada 17'` nos dois: **autoacusação, coberta pela exclusão do próprio documento**.
   `recebimentoCustoMedio`, `inspecao*`, `loteRecebimento` e `serieRecebimento` usam NF única ou
   `INSERT` direto. **Nenhum arquivo de hoje cria DOIS documentos com a mesma NF e o mesmo
   fornecedor pela rota** — grep executado sobre `nota_fiscal` em `server/tests/api/*.api.test.js`.
6b. **`(7) a chave que a TELA usa: mesma NF e mesmo fornecedor_nome, sem id e sem CNPJ`** —
   **(Fase 2) cenário novo**: dois `POST` com `nota_fiscal: 'NF-TELA-1'` e
   `fornecedor_nome: 'Acos Vale Ltda'`, nada mais → **201** e **409**. É o cenário que corresponde
   ao payload real de `handleCriar`, e é a régua da sabotagem 5.
6. **`(6) a SEGUNDA porta: PUT /fiscal nao pode trazer a NF de outro documento`** (RN-14) — A com
   `NF-X`, B sem NF, `PUT /B/fiscal` com `nota_fiscal: 'NF-X'` e o mesmo fornecedor → **409** citando o
   número de **A**; e a metade positiva: `PUT /A/fiscal` com a **própria** `NF-X` → **200** (salvar os
   dados fiscais duas vezes não pode se autoacusar).
   ⚠️ **(Fase 2) BLOQUEANTE se escrito como estava:** os dois documentos nascem em `RECEBIDO`, e
   `salvarDadosFiscal` recusa `RECEBIDO` **antes** de olhar a NF (`receiptService.js:253-259`,
   sonda executada: `400 'Dados fiscais só podem ser editados antes do processamento'`). **A e B
   têm de passar por `POST /workflow {acao:'iniciar_conferencia'}` antes de qualquer `PUT /fiscal`**
   — senão o cenário fica vermelho **antes e depois** do conserto, e a metade positiva
   (`PUT /A/fiscal` → 200) é **inalcançável**.

Preparação obrigatória no topo do arquivo:

```js
// `gerarContaPagar` (`receiptService.js:647-670`) faz `SELECT name FROM sqlite_master ... 'contas_pagar'`
// e devolve NULL se a tabela nao existe — e NENHUM dos arquivos de tests/api a cria (medido na Fase
// 0 desta etapa). Sem este CREATE, a asserção "1 conta a pagar" passaria com ZERO dos dois lados:
// teste vazio, e o dano medido (2 contas para a mesma NF) ficaria sem prova. Subconjunto minimo das
// colunas que o INSERT de `gerarContaPagar` usa.
//
// (Fase 2) O DDL abaixo espelha PRODUCAO (`server/index.js:19299-19311`), inclusive os dois
// NOT NULL — `descricao` e `valor`. O molde do modulo e `server/tests/almoxarifado.test.js:240-243`
// (que JA cria esta tabela, e por isso a afirmacao "nenhum arquivo de teste a cria" vale so para
// `tests/api/`). Manter os NOT NULL importa: sem eles um `valor_total_nota` nulo passaria aqui e
// estouraria em producao, e o teste teria provado o contrario do que existe.
await dbRun(db, `CREATE TABLE IF NOT EXISTS contas_pagar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao TEXT NOT NULL, fornecedor TEXT, valor REAL NOT NULL, data_vencimento DATE,
  data_pagamento DATE, status TEXT DEFAULT 'pendente', categoria TEXT, observacoes TEXT
)`);
```

E um helper que leva um recebimento de `RECEBIDO` a `EM_ENTRADA_NF` **pelo workflow real** (cinco
`POST /workflow`: `iniciar_conferencia`, `finalizar_conferencia`, `encaminhar_compras`,
`finalizar_compras`, `iniciar_faturamento`) mais o `PUT /fiscal` com os cinco campos que
`validarDadosProcessamento` exige (`nota_fiscal`, fornecedor, `data_emissao_nf`, `data_entrada_nf`,
`valor_total_nota`) — sem eles o `processar` recusa com `Preencha antes de processar: …` e o cenário (2)
fica vermelho **pelo motivo errado**.

- [x] **Step 2: rodar e registrar o vermelho, com os números**

```
cd server && node tests/api/recebimentoNfDuplicada.api.test.js
```

Esperado antes do conserto: **(1), (2), (6) e (7) vermelhos**; **(3), (4) e (5) verdes**
(**Fase 2**: o (7) é o cenário do caminho da tela). No (2), a linha do
`✗` tem de trazer **20** (saldo) ou **2** (contas) — cole-a aqui. **Se o (2) vier verde, pare**: quase
certo que a tabela `contas_pagar` não foi criada ou o recebimento não chegou a `processar`.
⚠️ **(Fase 2)** e o (6) tem de cair pela literal do **409**, não por
`'Dados fiscais só podem ser editados antes do processamento'` — se a mensagem do `✗` for essa, o
avanço para `EM_CONFERENCIA` está faltando e o cenário não mede a segunda porta.

**RODADA RED REAL — `3 passou, 4 falhou`, a previsão bateu cenário por cenário: (1), (2), (6) e (7)
vermelhos; (3), (4) e (5) verdes.** As quatro linhas do `✗`, literais:

```
  ✗ (1) dois POST com a mesma NF e o mesmo fornecedor: o segundo e recusado com 409: {"id":2,"numero":"REC-MU4127YLNCYB4H0T","status":"RECEBIDO"}
201 !== 409
  ✗ (2) A ASSERCAO QUE MEDE O DANO: saldo 10 e UMA conta a pagar, nao 20 e duas: a mesma NF nao pode creditar o material duas vezes (documentos processados: 2, contas a pagar novas: 2)
20 !== 10
  ✗ (7) a chave que a TELA usa: mesma NF e mesmo fornecedor_nome, sem id e sem CNPJ: {"id":12,"numero":"REC-MU41280IE6IRIGKB","status":"RECEBIDO"}
201 !== 409
  ✗ (6) a SEGUNDA porta: PUT /fiscal nao pode trazer a NF de outro documento: {"success":true}
200 !== 409
```

**O dano está nos dois números da mesma linha: `documentos processados: 2, contas a pagar novas: 2`
e `20 !== 10`.** As "2 contas a pagar" são prova de verdade, e não o teste vazio de sempre: se o
`CREATE TABLE contas_pagar` do topo não existisse, `gerarContaPagar` devolveria `null` e o número
seria **0** — o `2` é, ele mesmo, o controle positivo de que a tabela do harness é real. E o (6)
caiu por `200 !== 409` com `{"success":true}`, **não** pela literal do status: o avanço para
`EM_CONFERENCIA` está no lugar e o cenário mede a segunda porta.

- [x] **Step 3: implementar a guarda** — `ffc5f47`, como escrito, sem desvio: `assertNotaNaoDuplicada`
      privada (**não** entrou no `module.exports` — nenhum cenário desta task a chama direto; se o
      cenário "pelo serviço" da T7 precisar, exporte lá e diga por quê), chamada nos dois escritores
      e o índice não único em `schema.js` logo depois do `for (const col of recebCols)` (`:1262`).

```js
/**
 * RN-12/13/14 (Etapa 36) — a mesma nota fiscal do mesmo fornecedor nao entra duas vezes.
 *
 * Medido por sonda executada na Fase 0: dois POST com a mesma `nota_fiscal` e o mesmo
 * `fornecedor_id` respondiam 201 + 201; processando as duas, o material era creditado DUAS VEZES
 * (20 em vez de 10) e nasciam DUAS contas a pagar, com descricao identica exceto pelo numero do REC.
 * Ninguem mais no sistema segurava essa porta: `gerarContaPagar` insere sem consultar duplicidade.
 *
 * Mora no SERVICO e e chamada pelos DOIS escritores — `criarRecebimento` e `salvarDadosFiscal` —
 * porque o PUT /fiscal PREENCHE a NF depois, e uma guarda so no POST seria contornavel pelo mesmo
 * caminho que tornava o enum contornavel (RN-11).
 *
 * NAO e `UNIQUE(nota_fiscal, fornecedor_id)` no banco, e isso e decisao reversivel registrada na
 * letra B: producao pode ja ter duplicatas e o indice unico falharia na SUBIDA do servidor (o
 * `numero TEXT UNIQUE` nasceu no CREATE TABLE, nao por safeAlter — nao ha precedente de unico
 * aplicado a acervo aqui); `NULL` nunca colide, entao o indice seria silenciosamente parcial onde
 * mais importa; e a recusa viria como SQLITE_CONSTRAINT, nao como literal legivel. A letra A do
 * fechamento leva a consulta SQL que mede duplicatas em producao ANTES de qualquer deploy.
 *
 * Tres coisas NAO sao duplicata: NF vazia/nula, fornecedor diferente, e fornecedor nao identificado
 * (id, CNPJ e NOME os tres nulos) — sem fornecedor nao existe "mesmo fornecedor" a afirmar.
 *
 * (Fase 2) O `fornecedor_nome` E o terceiro identificador, e nao um detalhe: a TELA nunca manda
 * `fornecedor_id` — `handleCriar` monta o payload sem ele e `form` nao tem esse campo
 * (`RecebimentosAlmoxarifado.js:86-93` e `:342-354`); o `<select>` de fornecedores copia
 * `razao_social` -> `fornecedor_nome` e `cnpj` -> `fornecedor_cnpj` (`selecionarFornecedor`).
 * Com a chave so em id/CNPJ, a guarda ficaria INALCANCAVEL pelo caminho real sempre que o
 * fornecedor nao tivesse CNPJ digitado — regra entregue e porta faltando, a classe de defeito que
 * esta etapa esta pagando do outro lado (a rota /conferir sem chamador). Comparado com
 * UPPER(TRIM(...)) pelo mesmo motivo da NF. Reversivel: e uma clausula do `where`.
 */
async function assertNotaNaoDuplicada(db, { nota_fiscal, fornecedor_id, fornecedor_cnpj, fornecedor_nome }, recebimentoId = null) {
  const nf = typeof nota_fiscal === 'string' ? nota_fiscal.trim() : nota_fiscal;
  if (!nf) return;                                   // RN-13: sem NF nao ha duplicata
  const nome = typeof fornecedor_nome === 'string' ? fornecedor_nome.trim() : null;
  if (!fornecedor_id && !fornecedor_cnpj && !nome) return;  // RN-13: sem fornecedor, idem

  // Ordem de preferencia: id (canonico) > CNPJ (identidade fiscal) > nome (o que a tela manda).
  let where; let chave;
  if (fornecedor_id) { where = 'fornecedor_id = ?'; chave = fornecedor_id; }
  else if (fornecedor_cnpj) { where = 'UPPER(TRIM(fornecedor_cnpj)) = UPPER(?)'; chave = fornecedor_cnpj; }
  else { where = 'UPPER(TRIM(fornecedor_nome)) = UPPER(?)'; chave = nome; }
  const params = [nf, chave];
  // (Fase 2) O filtro de CANCELADO saiu: `STATUS` do recebimento nao tem 'CANCELADO'
  // (`receiptService.js:43-55` — os 11 status sao RECEBIDO..BLOQUEADO), entao a clausula era
  // codigo morto que fazia o proximo leitor acreditar num cancelamento que nao existe.
  // Se um dia existir, ela volta COM o teste que a exercita.
  let sql = `SELECT id, numero FROM recebimentos_material_almoxarifado
    WHERE UPPER(TRIM(nota_fiscal)) = UPPER(?) AND ${where}`;
  if (recebimentoId) { sql += ' AND id <> ?'; params.push(recebimentoId); }

  const ja = await dbGet(db, `${sql} LIMIT 1`, params);
  if (ja) {
    throw Object.assign(
      new Error(`Nota fiscal ${nf} já lançada no recebimento ${ja.numero} para este fornecedor`),
      { status: 409 },
    );
  }
}
```

**Onde chamar, e por que exatamente ali:**
- em `criarRecebimento`, **depois** de resolver o pedido (o pedido é quem traz `fornecedor_id`) e
  **antes** do `inserirComNumeroUnico` — senão o retry do gerador de número já teria gravado;
- em `salvarDadosFiscal`, **depois** de `resolverPedidoCompra` e **antes** do `UPDATE`, passando
  `recebimentoId` (exclui o próprio documento) e resolvendo o fornecedor com o mesmo
  `pedido?.fornecedor_id ?? fornecedor_id ?? rec.fornecedor_id` que o `UPDATE` usa. ⚠️ **Ponto de
  atenção:** o `UPDATE` usa `COALESCE`, então um `PUT` que manda **só** a NF herda o fornecedor **do
  registro** (`rec`) — a guarda tem de olhar o mesmo valor efetivo, senão ela deixa passar a duplicata
  do caso mais comum. **(Fase 2)** e o **nome** entra no mesmo molde:
  `pedido?.fornecedor_nome ?? fornecedor_nome ?? rec.fornecedor_nome` — é o `??` que
  `receiptService.js:304-306` já usa, e a NF efetiva é `nota_fiscal ?? rec.nota_fiscal`, senão um
  `PUT` que não manda NF se compara com `undefined` e a guarda sai pelo `if (!nf) return`.

Índice em `schema.js`, **dentro do `initSchema`**, logo depois do bloco `recebCols` (`:1255`) — a
forma da casa é `await dbRun(db, 'CREATE INDEX IF NOT EXISTS …')`, uma chamada por índice (molde
`:1450-1451`), **não** um array de strings:

```js
  // Etapa 36: a tabela de recebimentos nao tinha indice NENHUM alem do UNIQUE de `numero`
  // (`grep "INDEX.*recebimentos"` voltava vazio), e a guarda de NF duplicada roda em TODA criacao.
  // NAO e unico, de proposito — ver o comentario de `assertNotaNaoDuplicada`.
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_receb_nf_fornecedor ON recebimentos_material_almoxarifado(nota_fiscal, fornecedor_id)');
```

⚠️ **O índice tem de vir DEPOIS do `safeAlter` de `recebCols`**, porque `fornecedor_id` está no
`CREATE TABLE` mas o bloco de colunas novas roda em `:1255` e a ordem importa para banco antigo. E o
teste `npm run test:safealter` tem de continuar **3/3**.

- [x] **Step 4: rodar o arquivo, `test:api` inteiro e `test:almoxarifado`** — arquivo **7 passou, 0
      falhou**; `npm run test:api` → **`171/171 arquivos de teste OK`**; `test:almoxarifado` →
      **42 passou, 0 falhou**; `test:safealter` → **3 passed, 0 failed** (continua 3/3, como o Step 3
      exige); `test:validation` → 4/0; `test:sqlite` → 5/0. Os três arquivos de atenção nominal
      rodados um a um antes da suíte: `alertaEventoGanchos` **8/0**, `alertaEventoJornada` **5/0**
      (o único que repete a literal `'NF-JOR17-1'`, no **mesmo** `recId` — autoacusação, coberta
      pela exclusão do próprio documento) e `recebimentoTipoEnum` (T1) **6/0**.

Atenção nominal a `alertaEventoGanchos.api.test.js`, que faz **vários** `PUT /fiscal` no **mesmo**
recebimento com NFs diferentes (`NF-A1-1` … `NF-A1-4`) e cria recebimentos pela rota **sem
fornecedor** — é o arquivo que a RN-13 protege. Se ele cair, a guarda está olhando o fornecedor
errado, não o teste.

- [x] **Step 5: CONTROLE POSITIVO — quatro sabotagens** (rodaram **cinco**, mais uma variante) — ver a
      tabela de resultados reais logo depois da tabela de previsões.

**(Fase 2)** As âncoras: `await assertNotaNaoDuplicada(` dá **2** depois do conserto, então cada
sabotagem usa o **bloco ancorado** da função onde ela mora (a linha anterior mais a chamada) e
confere `grep -cF` = **1** desse bloco.

| # | Sabotagem | O que TEM de cair |
|---|---|---|
| 1 | apagar a chamada de `assertNotaNaoDuplicada` em `criarRecebimento` | **(1)** pelo `assert.strictEqual(res2.status, 409)` → **201**, e **(2)** pelo saldo → **20**. Se só o (1) cair, o (2) não está chegando a `processar` |
| 2 | apagar a chamada em `salvarDadosFiscal` (só ela) | **só o (6)** — o controle da segunda porta |
| 3 | **sabotar a POSIÇÃO, não o operador**: mover a chamada em `criarRecebimento` para **depois** do `inserirComNumeroUnico` | **(Fase 2) previsão corrigida:** cai **o `COUNT(*) === 1` do cenário (1)** → **2**. O que a previsão anterior dizia (*"(2) cai, o `COUNT` de recebimentos/contas não fecha"*) **estava errado**: o cenário (2) só processa o **primeiro** documento, então saldo e `contas_pagar` **não mudam** e a sabotagem seria **no-op** sem a asserção nova de contagem. É a regra "numa régua com folga, sabote a posição" — e aqui a folga era da própria régua |
| 4 | tirar o `AND id <> ?` da guarda | **a metade positiva do (6)**: `PUT /A/fiscal` com a própria NF passa a responder **409**. Prova que o documento não se autoacusa |
| 5 | **(Fase 2) sabotagem nova:** tirar o ramo `UPPER(TRIM(fornecedor_nome))` da resolução da chave (voltar à versão só id/CNPJ) | o cenário que entra pelo **caminho da tela** — dois `POST` com a mesma NF, o mesmo `fornecedor_nome` e **sem** `fornecedor_id`/`fornecedor_cnpj` → o segundo volta a **201**. **Acrescente esse cenário ao arquivo** (é o `(7)`): sem ele, a etapa entrega a guarda e a tela não a alcança, e nenhuma régua acusa |

#### Resultado REAL das sabotagens (executadas, `ffc5f47`)

`md5sum` pós-conserto de `receiptService.js` = **`c884f4ec510d1c9c50b379d82794caf7`**, guardado em
`scratchpad/bkp-receiptService-t2.js`. **Todas as restaurações foram por cópia do scratchpad** (nunca
`git checkout --`, que descartaria o conserto ainda não commitado junto com a sabotagem), e o
`md5sum` voltou a `c884f4…` **em todas** as cinco. `git diff --stat` ao fim: só
`receiptService.js`, `schema.js` e este plano. Âncoras contadas **depois** do conserto:
`await assertNotaNaoDuplicada(` = **2** (como a Fase 2 previu), e por isso cada sabotagem usou uma
linha **única** do bloco alvo — `grep -cx '    nota_fiscal,'` = 1 (sítio do `criarRecebimento`),
`grep -cF 'nota_fiscal: nota_fiscal ?? rec.nota_fiscal,'` = 1 (sítio do `salvarDadosFiscal`),
`grep -cF "if (recebimentoId) { sql += ' AND id <> ?'…"` = 1, e
`grep -cF "else { where = 'UPPER(TRIM(fornecedor_nome))…"` = 1. Ferramenta: `perl -0pi -e` (nunca
`python3`, que nesta máquina é o alias da Store e não executa nada).

| # | `md5sum` sabotado | Placar | Asserção que caiu — literal |
|---|---|---|---|
| 1 | `8e1bb51abc278c90f982caf96f567450` | 4/3 | **(1)** `assert.strictEqual(res2.status, 409)` → **201**; **(7)** a mesma; **(2)** caiu no helper: `fiscal do 3: {"error":"Nota fiscal NF-DUP-2 já lançada…"} 409 !== 200`. **(6)** ficou verde, correto (a guarda dele é a outra). ⚠️ **A previsão errou o detalhe do (2):** ele **não** chegou ao saldo **20**, porque com a guarda do `/fiscal` viva o documento duplicado **não consegue ser processado** — a segunda porta o barra no caminho. Não é régua frouxa (o cenário cai, e a mensagem diz exatamente por quê): é **profundidade** — as duas guardas cobrem uma a falha da outra, e só apagando as **duas** o dano de 20 volta a ser alcançável pela rota |
| 2 | `7e0310e431f42abb0e47223f573f5b4c` | 6/1 | **só o (6)**, exatamente como previsto: `assert.strictEqual(dup.status, 409)` → **200** com `{"success":true}` |
| 3 | `98edc9353af09b6a23684e297a1ebbf2` | 2/5 | **Previsão errada em direção, sabotagem pega alto e claro:** movida para depois do `inserirComNumeroUnico` **sem** excluir o próprio id, a guarda passa a **acusar o documento que ela mesma acabou de gravar** — o **primeiro** `POST` já responde 409 e caem (1), (2), (3), (6) e (7), todos em `409 !== 201`. Ou seja: a posição errada não é "o furo continua", é "a porta fecha na cara de todo mundo" |
| 3b | `5498c6ee6dd6cd53178a320df6fda224` | 5/2 | **A variante que isola a régua nova** (mesma mudança de posição, passando `r.lastID` para excluir o próprio documento — o único jeito de a sabotagem de posição ser *silenciosa*): caiu **exatamente** o que a Fase 2 previu, `o segundo POST nao pode ter GRAVADO documento antes de recusar: 2 !== 1` no cenário **(1)**. **É a prova de que a asserção de contagem acrescentada na Fase 2 era necessária** — sem ela, esta variante seria no-op na contagem. E o (2) caiu de arrasto (`fiscal do 3 … 409`): o documento-fantasma gravado **envenena o `/fiscal` do documento legítimo**, que é um dano novo, pior que o original |
| 4 | `e75a735721fb6253eb51271164d7ef0b` | 5/2 | **a metade positiva do (6)**, como previsto: `assert.strictEqual(proprio.status, 200)` → **409** (`PUT /A/fiscal` com a própria `NF-X`). Régua extra não prevista: o **(2)** cai junto, no `/fiscal` do helper — a autoacusação quebra o caminho normal de qualquer recebimento que salve dados fiscais depois de já ter NF |
| 5 | `46c384d59615a29cf61b59015d4900f2` | 6/1 | **só o (7)**, como previsto: `assert.strictEqual(r2.status, 409)` → **201**. Sem o ramo do nome, a guarda existe e a tela **não a alcança** — e o (7) é a única régua que acusa isso |

- [x] **Step 6: commit** — `ffc5f47`, assunto único: a NF duplicada. Corpo com o dano medido (20 em
      vez de 10 e 2 contas a pagar), a decisão (guarda em serviço nos dois escritores + índice não
      único + a terceira perna `fornecedor_nome` porque a tela nunca manda `fornecedor_id`) e o
      descartado (`UNIQUE` no banco, com os três motivos). ⚠️ **Divergência declarada:** a linha de
      `Co-Authored-By` saiu com **`Claude Opus 5 (1M context)`** — o modelo que de fato executou a
      task, conforme a atribuição vigente do harness —, e não a que o briefing desta task
      pré-escreveu. Atribuição é registro de autoria: tem de nomear quem escreveu.

---

### Task 3: excedente com barreira — e a ação de perfil que não existia **(tronco)**

**Files:**
- Modify: `server/services/almoxarifado/permissions.js` (`ACAO_PERFIS`)
- Modify: `server/services/almoxarifado/receiptService.js` (`assertExcedentePermitido`, chamada em
  `conferirRecebimento` e `salvarDadosFiscal`; `COALESCE` no `UPDATE` de item do `/conferir`)
- Modify: `server/tests/api/minhasPermissoes.api.test.js`
- **(Fase 2)** Modify: `client/src/utils/permissaoErro.js` — rótulo `autorizar_excedente`
- **(Fase 2)** Modify: `server/services/almoxarifado/auditLabels.js` — verbo
  `EXCEDENTE_AUTORIZADO` (em `GRUPOS_ACAO`) e entidade `recebimento_item` (em `ROTULOS_ENTIDADE`)
- Create: `server/tests/api/recebimentoExcedente.api.test.js`

⚠️ **(Fase 2) Os três arquivos acima não estavam nesta lista, e sem eles a task deixa DOIS arquivos
de teste vermelhos** — um de servidor (`auditLabels.api.test.js`, duas asserções
`deepStrictEqual(semRotulo, [])`) e **um de client** (`permissaoErro.test.js:44`, que importa
`ACAO_PERFIS` do servidor). O de client só apareceria na T5/T7, parecendo regressão de outra task.
Medido: `rotularAcao('EXCEDENTE_AUTORIZADO')` → `'EXCEDENTE_AUTORIZADO'` e
`rotularEntidade('recebimento_item')` → `'recebimento_item'` (os dois "sem rótulo"), enquanto
`rotularEntidade('recebimento')` → `'Recebimento'`. Ver a tabela dos três pontos de fiação na seção
de contratos.

**MEDIDO: `autorizar_excedente` NÃO existe em `ACAO_PERFIS`** — `grep -rn autorizar_excedente
server/ client/src` não devolve nenhuma ação de permissão. Portanto **esta task é tronco** (mexe em
`ACAO_PERFIS`, regra compartilhada) e vem **antes** do client, invertendo a ordem T4/T5 da proposta do
controlador. O motivo está na tabela de reclassificação do design.

**Contrato congelado (as duas portas, `/conferir` e `/fiscal`):**
- `400` — `Quantidade recebida (<recebida>) maior que a esperada (<esperada>) no item #<id do item> — a autorização de excedente é de Compras ou do Administrador`
- `403` — `Autorizar recebimento acima do pedido exige a permissão "autorizar_excedente" (seu perfil: <PERFIL>).`
- `200` + coluna gravada + auditoria `EXCEDENTE_AUTORIZADO` quando a flag vem **e** o perfil tem a ação.

⚠️ **Modo de falha número 3 desta etapa.** "ALMOXARIFE não pode `autorizar_excedente`" fica **verde
antes de a ação existir**, porque `can()` devolve `false` para ação desconhecida. **A prova é o par no
mesmo cenário:** 403 do ALMOXARIFE **e** 200 do GESTOR. Um sem o outro não prova nada.

- [x] **Step 1: escrever o teste e ver o vermelho certo** — arquivo criado (`f747df4`), com **uma
      divergência declarada e medida**, mais o cenário `(0)` do congelamento da lista.

⚠️ **DIVERGÊNCIA MEDIDA contra o design e contra este plano — a metade positiva é `COMPRAS`, não
`GESTOR`.** O design (`RN-18`, linha 414) e o brief pediam *"com perfil GESTOR → 200"*. **Pela ROTA
isso é inalcançável:** as duas portas são gateadas por `requirePermission('receber_material')`, que é
`[ADMINISTRADOR, ALMOXARIFE, COMPRAS]` (`permissions.js:86`) — **`GESTOR` não está lá**, e toma
`403 { acao: 'receber_material' }` **antes** de o serviço rodar. O único perfil **não-admin** com as
duas coisas é **`COMPRAS`**, e é ele que faz a metade positiva pela rota.

✅ **(fix-round 1, `3e36af4`) RESOLVIDA, e a lista mudou.** A T3 entregou a lista como o design dizia e
apenas *documentou* a divergência; a revisão apontou, com razão, que isso deixava o `GESTOR` como
**configuração morta** — e pior: `GET /minhas-permissoes` devolveria `autorizar_excedente: true` para
ele e a tela **mostraria** a caixa de autorização, que ele marcaria para tomar 403 de outra ação.
**Decisão do controlador: alinhar o mapa com a realidade** →
**`autorizar_excedente: [ADMINISTRADOR, COMPRAS]`**. Regra escrita no comentário de `permissions.js`:
*o mapa não pode listar quem não consegue agir*. O `GESTOR` fica fora **até existir uma porta**.
**Descartado no fix-round, com o custo de cada um:** alargar `receber_material` (daria ao GESTOR o
recebimento inteiro por uma autorização pontual) e abrir rota de exceção (porta nova, com contrato,
tela e auditoria — **questão de design**, foi para a **letra B** como *"GESTOR deve autorizar
excedente? Se sim, precisa de uma porta própria — etapa própria"*). **Custo da escolha:** hoje a
gestão não autoriza excedente. O design foi **corrigido em três pontos, em lugar**, com
*"**(execução)** … estava errado …"* — seção (c), o cenário da RN-18 e a linha 6 da tabela de decisões.

Cenários de `recebimentoExcedente.api.test.js`:

1. **`(1) /conferir com recebida > esperada e sem flag: 400 com a literal`** — `esperada 10`,
   `recebida 999` → 400, literal com o **id real do item** (lido do `INSERT`), e a coluna **inalterada**
   no banco.
2. **`(2) /conferir com a flag mas perfil ALMOXARIFE: 403 — e o GESTOR, no MESMO cenario: 200`** — as
   duas metades **obrigatoriamente juntas** (regra da `fechar-etapa` sobre asserção negativa de
   permissão). No 200, afirmar `quantidade_recebida === 999` **e** a linha de auditoria
   `EXCEDENTE_AUTORIZADO`.
3. **`(3) a SEGUNDA porta: /fiscal repete os tres casos`** — 400 sem flag, 403 com flag e ALMOXARIFE,
   200 com flag e GESTOR. ⚠️ **(Fase 2)** o documento tem de estar em `EM_CONFERENCIA` (ou adiante):
   `salvarDadosFiscal` recusa `RECEBIDO` **antes** de qualquer item (`receiptService.js:253-259`).
   Avance por `POST /workflow {acao:'iniciar_conferencia'}` — sonda executada confirma 200 depois
   disso e 400 do guard de status antes.
4. **`(4) positivos que impedem o excesso de zelo`** — `recebida === esperada` → 200 sem flag;
   `recebida < esperada` → 200 sem flag **e** a divergência **registrada** (chamando
   `alertRegistry.listarDivergenciasRecebimento(db, { recebimentoId })` e afirmando 1 item) — é a
   ponta de servidor da RN-16/RN-17.
5. **`(5) COALESCE: item enviado sem quantidade_recebida nao apaga a quantidade`** — `/conferir` com
   `{ id, conferencia_quantidade: true }` (sem quantidade) → 200 e a quantidade **preservada**. Hoje
   isto **zera a coluna**, e é o defeito que a rota carrega por nunca ter tido chamador.
   ✅ **(Fase 2) medido por sonda executada, e é exatamente isto:** o `/conferir` responde **200** e
   a coluna vai a **`null`** (não a `0`, e não estoura por `undefined` no bind) — item com
   `quantidade_esperada: 10, quantidade_recebida: 10` fica `quantidade_recebida: null` e
   `conferencia_quantidade: 1`. **A asserção é `=== 10`**, e a linha do `✗` antes do conserto vai
   dizer `null`. `observacoes` sofre o mesmo (o parâmetro é `item.observacoes || null`), então
   **acrescente a observação à asserção**: gravar uma observação, reenviar o item sem ela, e afirmar
   que ela sobreviveu — são **duas** colunas apagadas hoje, e a régua do plano só cobria uma.

Em `minhasPermissoes.api.test.js`, acrescentar `autorizar_excedente` à lista negativa do cenário do
ALMOXARIFE (`assert.strictEqual(acoes.autorizar_excedente, false)`) e à positiva do GESTOR — o laço
que exige "um booleano para CADA ação" já cobre a existência sozinho.

**(Fase 2)** E no próprio `recebimentoExcedente.api.test.js`, a asserção de congelamento da lista,
que é a convenção de **toda** ação nova deste módulo desde a Etapa 8 (`planoInspecao:107`,
`segundaConferencia:102`, `sucateamento:423`, `toolFundacao:50`, `remessaTerceiroEstados:249`) e que
o plano não pedia:

```js
const { ACAO_PERFIS, PERFIS } = require('../../services/almoxarifado/permissions');
assert.ok(ACAO_PERFIS.autorizar_excedente,
  'acao ausente de ACAO_PERFIS — o gate cairia em `|| []`, que nega tudo, e o 403 do ALMOXARIFE '
  + 'ficaria verde pelo motivo errado');
assert.deepStrictEqual([...ACAO_PERFIS.autorizar_excedente].sort(),
  ['ADMINISTRADOR', 'COMPRAS', 'GESTOR']);
assert.ok(!ACAO_PERFIS.autorizar_excedente.includes(PERFIS.ALMOXARIFE),
  'a exclusao do ALMOXARIFE e a decisao desta etapa, e sem esta linha ela muda sem regua');
```

- [x] **Step 2: rodar e LER** — **RODADA RED REAL: `1 passou, 5 falhou`.** A previsão bateu em quais
      cenários caem, e **divergiu num ponto que vale registrar**: a metade do **403** do (2) **não**
      nasceu verde. A previsão supunha que `can()` negando ação desconhecida deixaria o 403 verde — mas
      **não existia checagem nenhuma**, então a rota respondeu **200** e a asserção do status caiu
      junto com a do 200. As cinco linhas reais do `✗`:

```
  ✗ (0) autorizar_excedente existe em ACAO_PERFIS com a lista da decisao 6: acao ausente de ACAO_PERFIS — o gate cairia em `|| []`, que nega tudo, e o 403 do ALMOXARIFE ficaria verde pelo motivo errado
  ✗ (1) /conferir com recebida > esperada e sem flag: 400 com a literal: {"success":true}
200 !== 400
  ✗ (2) /conferir com a flag mas perfil ALMOXARIFE: 403 — e COMPRAS, no MESMO cenario: 200: {"success":true}
200 !== 403
  ✗ (3) a SEGUNDA porta: /fiscal repete os tres casos: {"success":true}
200 !== 400
  ✓ (4) positivos que impedem o excesso de zelo
  ✗ (5) COALESCE: item enviado sem quantidade_recebida nao apaga a quantidade: item sem `quantidade_recebida` no payload nao pode APAGAR a quantidade ja conferida
null !== 10
```

O `null !== 10` do (5) é a sonda da Fase 2 reproduzida pelo teste: a coluna vai a **`null`**, não a
`0`. E o `{"success":true}` repetido nos três primeiros é o achado da Fase 0: as duas portas
respondiam **200** para `999` de `10`.

- [x] **Step 3: implementar** — feito como escrito, sem desvio no corpo de `assertExcedentePermitido`
      nem na lista de `ACAO_PERFIS` (`f747df4`). O `require` de `can`/`getPerfilFromUser` **não**
      existia em `receiptService.js` e foi acrescentado no topo (sem ciclo: `permissions.js` requer
      `../systemPermissions` **dentro** de `getPerfilFromUser`). O `UPDATE` do `/conferir` ganhou
      `COALESCE` nas **cinco** colunas, com os dois booleanos virando 0/1 **só quando vieram**
      (`!= null`) — senão `false` e `ausente` seriam a mesma coisa e uma chamada parcial zeraria o que
      a conferência anterior marcou. `autorizar_excedente` **não** precisou de linha em `schemas.js`:
      o `RecebimentoFiscalSchema` é `looseObject` (T1) e o `/conferir` não tem `validate`.

Em `permissions.js`, com o comentário do critério (o módulo documenta **toda** ação nova assim):

```js
  // Etapa 36 (RN-18): aceitar MAIS material do que foi pedido gera CONTA A PAGAR maior que o pedido
  // de compra — risco financeiro, nao risco de prateleira. Mesmo criterio ja escrito acima para
  // ajustar_material_cliente, remessar_terceiro e conferir_separacao: quando a operacao muda a
  // NATUREZA DO RISCO, ela ganha acao propria em vez de pegar carona no gate existente
  // (`receber_material`, que e de quem recebe).
  //
  // O ALMOXARIFE fica FORA de proposito, e essa e a exclusao que precisa de justificativa porque
  // ele e o candidato obvio (tem `receber_material`): quem RECEBE nao autoriza o proprio excedente.
  // Mesmo raciocinio, escrito, de gerenciar_plano_inspecao. COMPRAS entra porque negocia com o
  // fornecedor e responde pelo pedido; GESTOR entra pelo precedente de ajustar_estoque.
  // Reversivel numa linha se o cliente pedir; registrado na letra B do doc de novidades.
  //
  // A checagem NAO e `requirePermission` na rota, e isso e decisao: o gate de rota faria o
  // `PUT /conferir` inteiro exigir a acao, e o ALMOXARIFE — que e quem confere — perderia a
  // conferencia normal. E condicional e mora no SERVICO, molde de
  // `ownerRules.assertAjustePermitido` ("a checagem real acontece no MOTOR, nao em
  // requirePermission na rota"). Entra de graca em GET /almoxarifado/minhas-permissoes — a rota
  // itera Object.keys(ACAO_PERFIS).
  autorizar_excedente: [PERFIS.ADMINISTRADOR, PERFIS.GESTOR, PERFIS.COMPRAS],
```

Em `receiptService.js`:

```js
/**
 * RN-18 (Etapa 36) — recebimento acima do esperado exige autorizacao EXPLICITA e PERMISSAO.
 *
 * Medido por sonda na Fase 0: `quantidade_esperada: 10, quantidade_recebida: 999` entrava com 201 e
 * era gravado. O motor de DETECCAO ja existia inteiro (`alertRegistry.listarDivergenciasRecebimento`
 * + `avisarDivergenciasDoRecebimento` nos dois escritores); o que nao existia era a BARREIRA.
 *
 * Duas condicoes, e as duas importam: a flag e a INTENCAO ("eu sei que estou recebendo a mais"), a
 * permissao e a AUTORIDADE. Só a flag foi descartado no design: flag que qualquer perfil liga nao e
 * barreira, e formulario — o mesmo usuario que digita 999 marca a caixa.
 */
async function assertExcedentePermitido(db, user, recebimentoId, itens, autorizado) {
  const excedentes = [];
  for (const item of itens || []) {
    if (item.quantidade_recebida == null) continue;
    const atual = await dbGet(db, `SELECT id, quantidade_esperada FROM recebimentos_material_itens_almoxarifado
      WHERE id = ? AND recebimento_id = ?`, [item.id, recebimentoId]);
    if (!atual) continue;
    const recebida = parseFloat(item.quantidade_recebida);
    const esperada = parseFloat(atual.quantidade_esperada);
    if (Number.isFinite(recebida) && Number.isFinite(esperada) && recebida > esperada) {
      excedentes.push({ id: atual.id, recebida, esperada });
    }
  }
  if (!excedentes.length) return;

  const e = excedentes[0];
  if (!autorizado) {
    throw Object.assign(new Error(
      `Quantidade recebida (${e.recebida}) maior que a esperada (${e.esperada}) no item #${e.id}`
      + ' — a autorização de excedente é de Compras ou do Administrador'), { status: 400 });
  }
  if (!can(user, 'autorizar_excedente')) {
    throw Object.assign(new Error(
      'Autorizar recebimento acima do pedido exige a permissão "autorizar_excedente"'
      + ` (seu perfil: ${getPerfilFromUser(user)}).`), { status: 403 });
  }
  for (const ex of excedentes) {
    await registrarAuditoria(db, {
      entidade: 'recebimento_item', entidade_id: ex.id, acao: 'EXCEDENTE_AUTORIZADO',
      usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
      dados_anteriores: { quantidade_esperada: ex.esperada },
      dados_novos: { quantidade_recebida: ex.recebida },
    });
  }
}
```

Chamada em `conferirRecebimento` e em `salvarDadosFiscal`, **antes** de qualquer `UPDATE` de item
(recusar depois de gravar é o defeito que a sabotagem 3 da T2 mede), lendo
`data.autorizar_excedente === true`.

E o `UPDATE` de item do `/conferir` passa a usar `COALESCE` nas cinco colunas, **no molde já escrito
em `salvarDadosFiscal`** (`quantidade_recebida`, `conferencia_quantidade`, `conferencia_descricao`,
`observacoes`, `series`), com o comentário dizendo por quê: *esta rota está ganhando o primeiro
chamador da vida, e item sem o campo apagava a quantidade e a observação*.

⚠️ **Confira as importações no topo de `receiptService.js`:** `can` e `getPerfilFromUser` vêm de
`./permissions`. Se o arquivo ainda não os importa, acrescente — e confira que **não** há ciclo
(`permissions.js` requer `../systemPermissions` dentro da função, de propósito).

- [x] **Step 4: rodar o arquivo, `minhasPermissoes`, `auditLabels`, `test:api`, `test:almoxarifado`
      — e a suíte de client de `permissaoErro` (Fase 2)** — **GREEN, números lidos:**
      `recebimentoExcedente` **6 passou, 0 falhou**; `minhasPermissoes` **10 passed, 0 failed**;
      `auditLabels` **14 passed, 0 failed**; `permissaoErro.test.js` (client) **9 passed, 9 total**;
      **`npm run test:api` → `172/172 arquivos de teste OK`**; `npm run test:almoxarifado` →
      **`42 passou, 0 falhou`**. `alertaEventoGanchos` (**8 passed**) e `alertaEventoJornada`
      (**5 passed**) verificados **à parte** também, por serem os nomeados aqui.

```
cd server && node tests/api/recebimentoExcedente.api.test.js
cd server && node tests/api/minhasPermissoes.api.test.js
cd server && node tests/api/auditLabels.api.test.js
cd server && npm run test:api && npm run test:almoxarifado
cd client && CI=true npx react-scripts test --watchAll=false src/utils/permissaoErro.test.js
```

**(Fase 2) O último comando é obrigatório NESTA task**, e não na T5: é a única task que muda
`ACAO_PERFIS`, e `permissaoErro.test.js:44` importa esse mapa do servidor. Rodá-lo só na T5 faria o
vermelho aparecer na task errada.

Atenção nominal a `alertaEventoGanchos.api.test.js` (usa `/conferir` com `recebida 8` de `esperada 10`
e `conferencia_quantidade: 1` — **não** é excedente, tem de continuar verde) e a
`permissoesRotas.api.test.js` / `alertaCentral.api.test.js`, que importam `ACAO_PERFIS`.
**(Fase 2) re-medido:** os dez consumidores de `ACAO_PERFIS` em `server/tests/` afirmam **listas por
ação**, nenhum congela o conjunto de chaves; `minhasPermissoes.api.test.js:88-95` (*"admin de
sistema pode tudo"*) exige `true` para **toda** ação e continua verde porque `ADMINISTRADOR` está na
lista nova. **Nenhum teste de servidor cai pela ação nova** — o que cai é o de client e o dos
rótulos de auditoria.

- [x] **Step 5: CONTROLE POSITIVO — as SEIS sabotagens, executadas** (`perl -0pi -e`, `md5sum`
      antes/depois/restaurado, restauração por perl inverso ou cópia do scratchpad — **nunca**
      `git checkout --`, porque o conserto ainda não estava commitado).

**md5 pós-conserto (o valor a que toda restauração tinha de voltar):**
`receiptService.js` = `36934495c62a71caa18aa779933ce35a`;
`permissions.js` = `32416bdf00f6d512ef32e9a509eda4c2`;
`auditLabels.js` = `faf9849a6f927f7f2d2af07b2bc87b93`.

**Âncoras contadas DEPOIS do conserto, como a Fase 2 exige:** o token
`assertExcedentePermitido(` dá **3** (definição + duas chamadas) e
`quantidade_recebida = COALESCE(?, quantidade_recebida),` dá **2** — logo as sabotagens 1, 2 e 5
usaram o **bloco ancorado** (contado com `perl -0777 -ne 'my $a="…"; my $c=()=/\Q$a\E/g'`, que
entende `\n`, ao contrário de `grep -cF`), e os três blocos deram **1**. As sabotagens 3, 4 e 6
usaram linha única, e `grep -cF` deu **1** em cada.

| # | Sabotagem | md5 pós-sabotagem | Qual asserção caiu (lida, não inferida) |
|---|---|---|---|
| 1 | apagar a chamada em `conferirRecebimento` | `18cac73dde6bf3411c20b7938416527b` | **(1)** em `assert.strictEqual(res.status, 400)` → **200** (`{"success":true}`) **e (2)** na metade do 403 → **200**. `4 passou, 2 falhou`. (3), (4) e (5) **ficaram verdes** — a segunda porta é independente, como a tabela previa |
| 2 | apagar **só** a chamada em `salvarDadosFiscal` | `439971bdc7c4243e679ffda3d03b2fc0` | **só o (3)**, em `assert.strictEqual(res400.status, 400)` → **200**. `5 passou, 1 falhou`. Controle da segunda porta: provado |
| 3 | **`PERFIS.ALMOXARIFE`** na lista de `autorizar_excedente` | `8a42c0cdb50a7a170cb04e2e09a2dece` | **a metade do 403 do (2)** → `200 !== 403`, **a do (3)** → `200 !== 403`, **o (0)** (`deepStrictEqual` da lista, que **nomeia a ação**) e, em `minhasPermissoes.api.test.js`, a linha nova do ALMOXARIFE (`true !== false`). `3 passou, 3 falhou` + `9 passed, 1 failed`. **É o único controle que prova a asserção negativa de permissão**, e provou. `permissaoErro.test.js` ficou **verde** — correto: ele exige *presença de rótulo*, não a lista |
| 4 | `recebida > esperada` → `recebida >= esperada` | `00f6e21a6f5182caae43d67d6778219a` | **o positivo do (4)**: `recebida === esperada` passou a responder `400 "Quantidade recebida (10) maior que a esperada (10) no item #8 …"`. Como a Fase 2 previu, derrubou **também** `alertaEventoGanchos` (**2 de 8**, cenários 2 e 2b, os dois com a mesma literal de `10` de `10`) e `alertaEventoJornada` (**5 de 5** — o cenário 1 é o portão da jornada, e os 4 seguintes caem em cascata dele). **Esperado, não acoplamento**: os três foram lidos, restaurados e voltaram a `8 passed` e `5 passed` |
| 5 | reverter o `COALESCE` de `quantidade_recebida` no `/conferir` (bloco ancorado; o token dá 2) | `4fa8b1bb03907b402539b2ee65488829` | **(5)**, em `assert.strictEqual(depois.quantidade_recebida, 10)` → **`null !== 10`**. `5 passou, 1 falhou`, e `grep -cF` do token caiu de 2 para 1, provando que o sítio sabotado foi o do `/conferir` |
| 6 | apagar a entrada `EXCEDENTE_AUTORIZADO` de `auditLabels.js` | `9f7696152bc913b764172bc9b59ea746` | **`auditLabels.api.test.js`**, cenário *"as tres fontes cobertas: TODO verbo gravavel tem rotulo"*: `verbos gravaveis sem rotulo: ["EXCEDENTE_AUTORIZADO"] — a tela mostraria o verbo cru`. `13 passed, 1 failed`. **Nota de restauração:** o perl inverso recolocou a linha **antes** do comentário em vez de depois, e o `md5sum` não voltou ao valor pós-conserto — a restauração foi refeita pela **cópia do scratchpad** (`bkp-auditLabels-t3`), e só então o md5 bateu. É exatamente para isso que a regra manda conferir o md5 e não o placar |

Depois das seis: `git diff --stat` com **só** os arquivos da task, os três md5 de volta ao valor
pós-conserto, e `recebimentoExcedente` **6/6** + `auditLabels` **14/14** novamente.

| # | Sabotagem | O que TEM de cair |
|---|---|---|
| 1 | apagar a chamada em `conferirRecebimento` | **(1)** pelo `assert.strictEqual(res.status, 400)` → **200**, e **(2)** pela metade do 403 |
| 2 | apagar a chamada em `salvarDadosFiscal` (só ela) | **só o (3)** — o controle da segunda porta |
| 3 | **acrescentar `PERFIS.ALMOXARIFE`** à lista de `autorizar_excedente` | **a metade do 403 do cenário (2)** → **200**. É o **único** controle que prova a lista negativa: sem ele, "ALMOXARIFE não pode" ficaria verde pelo motivo errado (`can()` desconhece a ação) |
| 4 | trocar `recebida > esperada` por `recebida >= esperada` (sabotar a **posição** da régua, não o operador) | **o positivo do (4)**, `recebida === esperada` → passa a responder 400. Prova que a régua está em "maior que", e não em "diferente de". **(Fase 2)** ela derruba **também** `alertaEventoGanchos` (`recebida 10 = esperada 10`, `:152` e `:181`) e `alertaEventoJornada` (`:108`) — é **esperado**, não é acoplamento: leia os três e restaure |
| 5 | reverter o `COALESCE` de `quantidade_recebida` no `/conferir` | **(5)**, pela quantidade que volta a ser apagada (`null`). **(Fase 2) âncora:** `quantidade_recebida = COALESCE(?, quantidade_recebida)` dá **2** em `receiptService.js` depois desta task (o outro é `salvarDadosFiscal:321`) — a âncora é o bloco de cinco colunas do `UPDATE` do `/conferir`, com `conferencia_quantidade` ao lado, que dá **1** |
| 6 | **(Fase 2) sabotagem nova:** apagar a entrada `EXCEDENTE_AUTORIZADO` de `auditLabels.js` | **`auditLabels.api.test.js`**, cenário *"TODO verbo gravavel tem rotulo"*. É o controle de que a fiação de rótulo existe — e ela é a que a Etapa 30 pagou num fix-round por não existir |

- [x] **Step 6: commit** — **`f747df4`** *"Almoxarifado Etapa 36 Task 3: receber 999 de 10 entrava com
      200 e ninguem autorizava nada"*. Seis arquivos: `permissions.js`, `receiptService.js`,
      `auditLabels.js`, `permissaoErro.js` (client), `minhasPermissoes.api.test.js` e o
      `recebimentoExcedente.api.test.js` novo. `git add` por caminho (nunca `-A`): os três não
      versionados da árvore de abertura (`server/data/database.sqlite.bak`, `server/nodemon.json`,
      `docs/bkp_bancoprod.md`) continuam fora, e este plano **não** entra no commit.

- [x] **Fix-round 1 — `3e36af4`** *"Almoxarifado Etapa 36 Task 3 fix 1: o GESTOR estava no mapa de
      autorizar_excedente sem ter porta para agir"*. Um achado **Important** da revisão, atendido pela
      decisão do controlador (revisar a lista, não abrir porta). Três arquivos:
      `permissions.js` (lista → `[ADMINISTRADOR, COMPRAS]` e o comentário dizendo que o GESTOR ficou
      fora por não ter porta), `recebimentoExcedente.api.test.js` (o `deepStrictEqual` do (0), a linha
      nova que afirma o GESTOR **fora**, e o cenário de serviço do (2) **virado de positivo para
      negativo**: `assert.rejects` com 403 e a literal nomeando a ação) e `minhasPermissoes.api.test.js`
      (a metade positiva passou de GESTOR para **COMPRAS**, em cenário próprio que afirma também
      `receber_material` dos dois — a asserção registra o **motivo**, não só o booleano; a fixture
      `COMPRAS` não existia no arquivo).

**Controle positivo do fix-round** (regra: asserção negativa de permissão só é provada por sabotagem;
âncora `grep -cF` = 1; md5 de `permissions.js` pós-fix = `3be0a7721cc63b57b159d5298f9745d6`):

| Sabotagem | md5 | Asserção que caiu |
|---|---|---|
| dar `PERFIS.GESTOR` à lista | `dc3c8f17b809b96a0cfefda8e83d658f` | **(0)** no `deepStrictEqual` **e** na linha nova do GESTOR; **(2)** com `Missing expected rejection: GESTOR nao tem a acao: o servico TEM de recusar, nomeando a acao`; e o cenário novo de `minhasPermissoes` com `true !== false`. `4 passou, 2 falhou` + `10 passed, 1 failed` |
| dar `PERFIS.ALMOXARIFE` à lista (**reexecutada**, porque a lista mudou desde a rodada anterior) | `f5f5021e237e2d728e1c29f636e612c2` | **(0)** e as metades de **403** do **(2)** e do **(3)** (`{"success":true}` no lugar do 403). `3 passou, 3 falhou` |

Restauradas por perl inverso, md5 de volta ao pós-fix. Números do fix-round:
`recebimentoExcedente` **6/6**, `minhasPermissoes` **11/11**, `auditLabels` **14/14**,
`permissaoErro.test.js` (client) **9 passed, 9 total**, `npm run test:api` →
**`172/172 arquivos de teste OK`**.

**Nota de divergência que CONTINUA aberta, para a T8 levar à letra B:**
1. **A barreira fica nas duas portas que o design nomeou — e o `POST /recebimentos` continua aberto.**
   Medido: `criarRecebimento` grava `quantidade_recebida = item.quantidade_recebida || qtd`
   (`receiptService.js:236`), então um `POST` com `quantidade: 10, quantidade_recebida: 999` **entra
   com 201** sem passar por `assertExcedentePermitido`. **Não** foi ampliado aqui de propósito: o
   escopo congelado da RN-18 é `/conferir` e `/fiscal`, a tela não manda `quantidade_recebida` no
   `POST` (`handleCriar` monta o item com `material_id`/`quantidade`), e a T7 é o lugar onde o
   cenário de integração pode cobrir a terceira porta se se decidir fechá-la.

---

### Task 4: `avancar etapa fora de ordem falha` — a linha ⏳ mais barata da spec **(galho A)**

**Files:**
- Create: `server/tests/api/recebimentoWorkflowOrdem.api.test.js`

**Zero linhas de produção.** A medição confirmou por sonda que **o servidor já recusa**:
`400 {"error":"Não é possível \"processar\" no status atual (EM_CONFERENCIA)"}` e
`400 {"error":"Ação de workflow inválida"}`. O que não existe é o **teste**, exigido pela spec 08 desde
2026-08-11 e citado pelo manual 14.2. **Se a execução mostrar que o servidor NÃO recusa, esta task
vira tronco** — pare, escreva aqui o que mediu, e conserte `avancarWorkflow` antes de seguir.

- [x] **Step 1: escrever os três cenários** — `server/tests/api/recebimentoWorkflowOrdem.api.test.js`
      criado com os três cenários exatamente como escritos abaixo (`9d19e7d`). **Acréscimos, todos
      declarados:** (1) fecha com a metade positiva da régua de posição (`iniciar_conferencia` a
      partir de `RECEBIDO` → 200 `EM_CONFERENCIA`) e repete `processar` no status NOVO, afirmando
      `(EM_CONFERENCIA)` na literal — prova que a mensagem acompanha o estado real, não um texto
      fixo; (2) repete `{acao:'inexistente'}` também em `EM_CONFERENCIA` para provar o "antes de
      olhar o status" (se a ordem das checagens invertesse, sairia a mensagem de ordem no lugar da
      genérica); (3) afirma também `etapa_atual` devolvida **e gravada** em cada passo, e fecha com
      `iniciar_conferencia` em `EM_ENTRADA_NF` → 400, provando que a barreira é **de cada
      transição**, não "do `processar`". **Medido e confirmado: o servidor recusa** — a task ficou
      galho A, zero linhas de produção, como previsto.

1. **`(1) processar em RECEBIDO e recusado com a literal do manual`** — `POST /:id/workflow
   {acao:'processar'}` num `RECEBIDO` → 400 e
   `error === 'Não é possível "processar" no status atual (RECEBIDO)'`; e o status no banco
   **inalterado**.
2. **`(2) acao inexistente e recusada antes de olhar o status`** — `{acao:'inexistente'}` → 400 e
   `'Ação de workflow inválida'`; `{acao:'processar'}` num id **inexistente** → **404**
   `'Recebimento não encontrado'` (a ordem das checagens também é contrato).
3. **`(3) POSITIVO: a sequencia completa responde 200 CINCO vezes`** —
   `iniciar_conferencia → finalizar_conferencia → encaminhar_compras → finalizar_compras →
   iniciar_faturamento`, afirmando o `status` devolvido em **cada** passo (`EM_CONFERENCIA`,
   `CONFERIDO_ALMOX`, `EM_COMPRAS`, `ENCAMINHADO_FATURAMENTO`, `EM_ENTRADA_NF`). **Sem isto, um
   `throw` incondicional em `avancarWorkflow` passaria os dois negativos.**

- [x] **Step 2: rodar** — os três têm de ficar **verdes de primeira**, e isso é exatamente o caso em
      que o CLAUDE.md manda desconfiar: o valor desta task está **inteiro** no Step 3.

```
cd server && node tests/api/recebimentoWorkflowOrdem.api.test.js
```

**RODADA REAL — `3 passou, 0 falhou` na PRIMEIRA execução**, como previsto (o servidor já recusava):

```
  ✓ (1) processar em RECEBIDO e recusado com a literal do manual
  ✓ (2) acao inexistente e recusada antes de olhar o status
  ✓ (3) POSITIVO: a sequencia completa responde 200 CINCO vezes
```

Verde de primeira é o caso em que o CLAUDE.md manda desconfiar, então nada aqui está provado
**até** a tabela do Step 3 — e ela provou.

- [x] **Step 3: CONTROLE POSITIVO — três sabotagens em `avancarWorkflow`**

**(Fase 2) âncoras conferidas no HEAD, todas = 1:** `if (!t.de.includes(rec.status))`,
`if (!t) throw`, `Ação de workflow inválida`, `processar: { de: [STATUS.EM_ENTRADA_NF]`.

**CONFERIDO POR EXECUÇÃO no HEAD `3e36af4`** (`grep -cF`, e aqui o HEAD **é** o pós-conserto: esta
task não tem linha de produção, e `git status --short` na abertura não trazia **nenhuma** mudança de
produto — só os três não-versionados de sempre e os dois docs da etapa). As quatro âncoras = **1**.
`perl` verificado antes de sabotar (`/usr/bin/perl`, `perl -e 'print 1'` → `1`); `python3` não foi
usado. Restauro por **cópia de segurança no scratchpad** (`bkp-receiptService-t4.js`), nunca
`git checkout --`.

`md5sum services/almoxarifado/receiptService.js` **antes de tudo e depois de cada restauro:**
`36934495c62a71caa18aa779933ce35a`.

| # | Sabotagem executada | md5 pós-sabotagem | Placar | Asserção que CAIU | Restauro |
|---|---|---|---|---|---|
| 1 | `perl -0pi -e 's/\n  if \(!t\.de\.includes\(rec\.status\)\) \{\n[^\n]*\n  \}\n/\n/'` (âncora 1 → 0 ocorrências) | `1dec6662ac9085182d6904a396bc7f09` | `1 passou, 2 falhou` | **(1)** na **literal**, com o status **ainda 400**: `+ 'Processe a nota somente após entrada no faturamento'` / `- 'Não é possível "processar" no status atual (RECEBIDO)'`. **A previsão da Fase 2 bateu exatamente** — a barreira própria de `processarNota` respondeu 400, logo um cenário que afirmasse só o status seria **no-op**. Caiu também **(3)**, na asserção de fecho (`iniciar_conferencia` em `EM_ENTRADA_NF` devolveu **200 !== 400`**) — bônus previsível: sem a barreira, nenhuma transição está fora de ordem | md5 de volta a `36934495…`, âncora de volta a 1, `git diff --stat -- server/` **vazio** |
| 2 | `perl -0pi -e 's/de workflow inv/de workflow SABOTADA inv/'` (a literal virou `'Ação de workflow SABOTADA inválida'`) | `311f528d3cfc22ac23cc3ffb41c1b220` | `2 passou, 1 falhou` | **(2) SOZINHO**, na **literal** (`+ 'Ação de workflow SABOTADA inválida'` / `- 'Ação de workflow inválida'`), com **(1) e (3) verdes**. O `assert` do status **passou** antes dela (o 400 continua vindo do mesmo `throw`), o que confirma por execução o motivo da troca da Fase 2: aqui a régua é o texto, não o código | idem, md5 `36934495…` |
| 3 | `perl -0pi -e 's/processar: \{ de: \[STATUS\.EM_ENTRADA_NF\]/… \[STATUS.EM_ENTRADA_NF, STATUS.RECEBIDO\]/'` | `427d60d547deadaab01b6eb6f3cbcd70` | `2 passou, 1 falhou` | **(1) SOZINHO, com (2) e (3) VERDES** — o requisito literal da tabela —, e **pela literal**: `+ 'Processe a nota somente após entrada no faturamento'` / `- 'Não é possível "processar" no status atual (RECEBIDO)'`, status ainda 400. É a assinatura pedida: a régua mede o **conjunto `de`**, não um `throw` genérico. Nenhuma outra asserção se moveu | idem, md5 `36934495…` |

**Leitura das três juntas:** as sabotagens 1 e 3 atacam a régua por caminhos diferentes (**existência**
da barreira e **posição** dela) e as duas caem na **mesma** asserção — a literal do cenário (1) —
sempre com o status em 400. Isso fecha, por execução, o ponto que a Fase 2 levantou: **neste arquivo o
status é asserção inútil e a mensagem é a régua inteira.** A sabotagem 2 isola a segunda régua ((2)
sozinho) e a 3 prova que (3) não é colateral de (1).

- ⚠️ **Nenhuma sabotagem produziu 500** — regra (iv) respeitada; foi exatamente para isso que a Fase 2
  trocou a sabotagem 2.

| # | Sabotagem | O que TEM de cair |
|---|---|---|
| 1 | apagar o `if (!t.de.includes(rec.status))` | **(1)**. **(Fase 2) leia a asserção certa:** sem a barreira, `processar` em `RECEBIDO` cai em `processarNota`, que tem barreira PRÓPRIA (`statusPermitidos = [EM_ENTRADA_NF, ENCAMINHADO_FATURAMENTO]`, `receiptService.js:678-681`) e responde **400 `'Processe a nota somente após entrada no faturamento'`** — ou seja **o status continua 400** e só a asserção da **literal** cai. Se o cenário afirmasse apenas o status, esta sabotagem seria **no-op**: é a literal que carrega a régua |
| 2 | ~~apagar o `if (!t)`~~ → **(Fase 2) trocada**: alterar a literal `'Ação de workflow inválida'` para outro texto | **(2)**, na asserção da literal, com o status ainda 400. **Por que a sabotagem anterior não servia:** apagar o `if (!t)` faz `t.de` estourar `TypeError` em `undefined` → `handleError` → **500 garantido**, e a própria tabela admitia que "se foi 500 o cenário está medindo o crash". Sabotagem que só sabe produzir crash não é controle positivo (regra (iv) deste plano) |
| 3 | acrescentar `STATUS.RECEBIDO` ao `de` da transição `processar` (**sabotar a POSIÇÃO da régua**) | **(1)** sozinho, com **(2) e (3) verdes** — **(Fase 2)** e, de novo, **pela literal**, não pelo status: a resposta continua 400, vinda da barreira de `processarNota`. É a assinatura de "a régua está no conjunto `de`", e não num `throw` genérico |

- [x] **Step 4: commit** — assunto único: o teste do workflow. Corpo: a spec exigia este teste desde
      2026-08-11 e o manual 14.2 cita a literal; o servidor ja recusava (medido por sonda), o que
      faltava era a regua — e as tres sabotagens provam que ela mede o conjunto `de`, nao um throw.

**`9d19e7d`** — *"Almoxarifado Etapa 36 Task 4: o workflow do recebimento nunca teve regua de ordem em
teste"*, **1 arquivo, 176 inserções**, `git add` só de
`server/tests/api/recebimentoWorkflowOrdem.api.test.js` (nunca `git add -A`). O corpo carrega o que o
Step 4 pediu, mais o **descartado** (a sabotagem 2 original — apagar o `if (!t)` — e a ideia de
afirmar só o status nos negativos).

**Suíte inteira antes do commit:** `cd server && npm run test:api` → **`173/173 arquivos de teste
OK`** (eram 172 antes desta task; o último arquivo fechou `15 passed, 0 failed`). Árvore pós-commit
de volta ao estado de abertura: os dois docs da etapa modificados e os três não-versionados
(`docs/bkp_bancoprod.md`, `server/data/database.sqlite.bak`, `server/nodemon.json`).

> **Próxima tarefa detalhada — Task 5 (galho B): quantidade conferida no painel de recebimento.**
> É o item de **maior valor** da feature 08 hoje: sem ele, o alerta `DIVERGENCIA_RECEBIMENTO` que o
> manual promete **não tem produtor alcançável pela tela**, porque não existe campo para dizer quanto
> chegou de verdade. A T5 escreve o **primeiro chamador da vida** de `PUT /recebimentos/:id/conferir`.
> **Contrato de API que ela consome — já congelado e já testado pela T3** (seção "Contratos de API
> congelados", item 3): payload `{ itens: [{ id, quantidade_recebida: <número>, conferencia_quantidade:
> <bool> }] }`, **sem `status`** (mandar `status` avançaria o workflow, que não é o que o botão faz), um
> objeto **por item do painel**; `200 {success:true}`; `400` com a literal do excedente sem flag e `403`
> com a literal da flag sem permissão — **as mesmas** do `/fiscal`, e `autorizar_excedente` é
> `[ADMINISTRADOR, COMPRAS]` (o GESTOR saiu no fix 1 da T3: pela rota ele toma 403 de
> `receber_material` antes de chegar ao serviço). **Pontos de atenção medidos:** (a) `api.put` é um
> `jest.fn()` **sem implementação** no `beforeEach` — dê-lhe `mockResolvedValue({ data: { success: true
> } })`, senão o `catch` da tela engole e o cenário fica verde sem payload; (b) `toast` é **mockado**
> (`RecebimentosAlmoxarifado.test.js:42-44`), então toda asserção é sobre o **DOM** ou sobre
> `api.put.mock.calls`; (c) conte as chamadas com `.filter(...)` + `toHaveLength(n)`, nunca
> `toHaveBeenCalledWith` solto (regra (ii)); (d) fixture `EM_CONFERENCIA` no recebimento **58**, item
> **581** (regra (iii)); (e) `@testing-library/react` **não está instalado** — é `createRoot` + `act`;
> (f) o comando de teste do client leva **CAMINHO**, não `-t`. As literais de DOM exigidas estão na
> seção "6. Literais de tela (client, T5)".

---

### Task 5: o campo que faltava — quantidade conferida no painel **(galho B)**

**Files:**
- Modify: `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js` (bloco de itens do painel,
  `:614-670`; `renderAcoes`, `:426-467`; uma função `salvarConferencia`)
- Modify: `client/src/components/almoxarifado/RecebimentosAlmoxarifado.test.js`

**Por que esta task existe, e por que ela é o maior valor da feature 08 hoje.** Medido: **não existe,
em lugar nenhum do client, um campo para digitar quanto chegou de verdade**. `atualizarItemDetalhe` é
chamado em 8 pontos e `quantidade_recebida` **não está** entre os campos; o painel mostra **uma**
quantidade só; no modal de criar, recebida nasce **igual** a esperada; e `PUT /conferir` **não tem
chamador**. Consequência: o alerta `DIVERGENCIA_RECEBIMENTO` tem consumidor, dedupe, e-mail e central —
e **nenhum produtor alcançável pela tela**, enquanto o manual (`:3037` e `:3045`) descreve o alerta e
até o dedupe *"corrigir a quantidade e errar de novo"*, texto que só faz sentido se houvesse onde
corrigir a quantidade.

**Contrato que ela consome (congelado na T3):** `PUT /almoxarifado/recebimentos/:id/conferir`, gate
`receber_material`, payload `{ itens: [{ id, quantidade_recebida, conferencia_quantidade }] }` **sem
`status`** (não avançar o workflow), mais `autorizar_excedente: true` quando a caixa estiver marcada.
Recusas: **400** e **403** com as literais da T3.

**Permissão: o campo e o botão NÃO decidem.** Quem decide é o backend. A UI usa
`useAlmoxPermissoes().pode('autorizar_excedente')` **apenas** para esconder a caixa de autorização, e
esse hook **falha aberto** de propósito. Consequência declarada: quem não tem a ação pode ver a caixa
por um instante e tomar **403 do servidor**, com a literal congelada — é o desenho, não um defeito.

**Pontos de atenção medidos:**
- `api.put` é `jest.fn()` **sem implementação** no `beforeEach` atual: devolve `undefined`, o `await`
  passa, o `catch` não dispara e o cenário fica verde sem payload. **Dê-lhe
  `mockResolvedValue({ data: { success: true } })`.**
- ~~**Fixture nova obrigatória**~~ → **(Fase 2) NÃO É: a fixture já serve, e a frase estava errada.**
  Lido no arquivo: `DETALHES[58]` faz `...RECEBIMENTOS[1]`, cujo `status` é **`EM_CONFERENCIA`**, e
  o item `581` tem `quantidade_esperada: 200` / `quantidade_recebida: 200`, `unidade: 'PC'`,
  `material_id: 9` (que existe em `MATERIAIS`, com `controle_serie: 0` — logo o bloco de séries não
  entra no caminho). **Nada a criar; nada a ajustar.** O que a T5 acrescenta ao `beforeEach` é só o
  `api.put.mockResolvedValue({ data: { success: true } })`.
- **O bloco de itens vive DENTRO do ternário de `loadingDetalhe`**; o bloco de **anexos** vive **fora**
  (fix `c5d9e99`). Não mover nada: o cenário **(g)** trava a identidade do nó de anexos e cai se o
  bloco for tocado.
- `toast` é mockado — asserção no **DOM** ou em `api.put`.

- [x] **Step 1: escrever os cenários (m), (n) e (o) e ver falhar** — escritos como abaixo, mais o
      **(p)** da Fase 2, e mais o `api.put.mockResolvedValue` no `beforeEach` (`e2a23a9`).

- **`(m) digitar a quantidade conferida chama PUT /conferir com o payload literal`**: abrir o painel do
  **58**, achar o input por `[title="Qtd. conferida"]`, `digitar(input, '187')`, clicar
  `Salvar Conferência`; afirmar
  `api.put.mock.calls.filter(([u]) => u === '/almoxarifado/recebimentos/58/conferir')` →
  `toHaveLength(1)` e `api.put.mock.calls[0][1]` **igual** a
  `{ itens: [{ id: 581, quantidade_recebida: 187, conferencia_quantidade: false }] }`
  (`toEqual`, não `toMatchObject` — a ausência de `status` **é** o contrato).
- **`(n) divergencia aparece na tela com as DUAS quantidades`**: com `187` digitado, o painel contém
  `Divergência: 13 a menos que o esperado (200)`, contém `187` e contém `Esperada: 200`. **Metade
  positiva no mesmo cenário:** digitar `200` → o DOM **não** contém `Divergência:` e **continua**
  contendo `Esperada: 200`.
- **`(o) excedente pede a autorizacao, e o 403 do servidor aparece`**: digitar `250`, afirmar
  `Divergência: 50 a mais que o esperado (200)` e a caixa
  `Autorizo o recebimento acima do pedido`; marcar a caixa, clicar `Salvar Conferência` e afirmar
  `api.put.mock.calls[0][1].autorizar_excedente === true`. **Metade negativa do servidor:** com
  `api.put` rejeitando `{ response: { data: { error: 'Autorizar recebimento acima do pedido exige a permissão "autorizar_excedente" (seu perfil: ALMOXARIFE).' } } }`,
  a tela **não** quebra e o painel continua montado (o toast é mock — a asserção é o painel de pé e
  `api.put` chamado **1** vez, nunca a mensagem).

> **CONTROLE POSITIVO do (m), declarado antes de escrever o código:** sem o input, o payload leva
> **200** (a recebida nasce igual à esperada) — é isso que prova que o cenário sabe falhar. Se o (m)
> ficar verde com `187` **antes** de o input existir, o cenário está lendo outro campo.

- [x] **Step 2: rodar e ver os três vermelhos**

```
cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/RecebimentosAlmoxarifado.test.js
```

**RODADA RED REAL — `Tests: 4 failed, 12 passed, 16 total`.** Os **quatro** novos vermelhos
((m), (n), (o) e (p)) e os **doze** das Etapas 34/35 **verdes**. As quatro caíram na MESMA
asserção, a âncora do campo que não existia:

```
  ● (m) digitar a quantidade conferida chama PUT /conferir uma vez, com o payload literal e SEM status
    expect(received).not.toBeNull()
    Received: null
      at Object.<anonymous> (src/components/almoxarifado/RecebimentosAlmoxarifado.test.js:610:21)
```

(idem nas linhas `638` do (n), `678` do (o) e `735` do (p)). O **controle positivo declarado** do
(m) — "sem o input o payload levaria 200" — foi medido pela **sabotagem 1** do Step 5, que é o
único jeito de observá-lo com o botão existindo: o guard `expect(input).not.toBeNull()` estoura
antes, e de propósito, para o vermelho ser legível.

- [x] **Step 3: implementar no painel**

No bloco de itens, **substituindo** a linha que hoje mostra uma quantidade só
(`{item.quantidade_recebida || item.quantidade_esperada} {item.unidade}`), as **duas** quantidades; e,
quando o status é `RECEBIDO` ou `EM_CONFERENCIA`, o input mais o aviso:

```jsx
{/* Etapa 36 (RN-16/RN-17): ate aqui o painel mostrava UMA quantidade — `recebida || esperada` —,
    e nao havia campo nenhum para dizer quanto chegou de verdade. Consequencia medida na Fase 0:
    `recebida` nunca diferia de `esperada` por gesto de tela, e o alerta DIVERGENCIA_RECEBIMENTO
    tinha consumidor, dedupe, e-mail e central, com ZERO produtor alcancavel. */}
<div style={{ textAlign: 'right' }}>
  <div style={{ fontWeight: 700 }}>{item.quantidade_recebida ?? item.quantidade_esperada} {item.unidade}</div>
  <div style={{ color: 'var(--gmp-text-light)', fontSize: '0.7rem' }}>Esperada: {item.quantidade_esperada}</div>
</div>
```

```jsx
{['RECEBIDO', 'EM_CONFERENCIA'].includes(detalhe.status) && (
  <div style={{ marginTop: 6 }}>
    <input className="almox-input" type="number" step="0.01" min="0"
      title="Qtd. conferida" placeholder="Qtd. conferida"
      value={item.quantidade_recebida ?? ''}
      style={{ fontSize: '0.75rem', padding: '4px 6px', maxWidth: 160 }}
      onChange={(e) => atualizarItemDetalhe(item.id, 'quantidade_recebida', e.target.value)} />
    {avisoDivergencia(item)}
  </div>
)}
```

`avisoDivergencia(item)` devolve `null` quando as quantidades batem (ou quando o campo está vazio) e,
quando diferem, o texto literal congelado — **`a menos`** ou **`a mais`**, com a diferença e a esperada
entre parênteses. Use `Math.abs` e formate a diferença sem casas sobrando (`Number(diff.toFixed(2))`),
para que `13` não apareça como `13.000000000000001`.

A caixa de autorização, **só** quando existe algum item com `recebida > esperada`:

```jsx
{temExcedente && pode('autorizar_excedente') && (
  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.78rem', marginTop: 8 }}>
    <input type="checkbox" checked={autorizarExcedente}
      onChange={(e) => setAutorizarExcedente(e.target.checked)} />
    Autorizo o recebimento acima do pedido
  </label>
)}
```

⚠️ `RecebimentosAlmoxarifado.js` **não importa** `useAlmoxPermissoes` hoje (só o `AnexosDocumento`
importa). Acrescente o import — e note que a suíte **já mocka o hook**, então nenhum cenário existente
quebra. Escreva no código que o hook **falha aberto** e que a decisão é do backend.

O botão, em `renderAcoes`, para `RECEBIDO` e `EM_CONFERENCIA`, **antes** do botão de workflow (salvar a
contagem é o gesto anterior a finalizar a conferência):

```jsx
<button type="button" className="btn-almox-secondary" style={{ width: '100%', justifyContent: 'center' }}
  onClick={salvarConferencia} disabled={saving}>
  <FiCheck size={14} /> Salvar Conferência
</button>
```

`salvarConferencia` monta **um objeto por item** com `id`, `quantidade_recebida` numérico
(`Number(...)`, não string — o input devolve string e o servidor faz `parseFloat`, mas o **contrato
congelado diz número** e o cenário (m) compara com `toEqual`) e
`conferencia_quantidade: <recebida === esperada>`; acrescenta `autorizar_excedente: true` **só** quando
a caixa está marcada; chama `api.put`, e no sucesso faz `abrirDetalhe(detalhe.id)` +
`loadRecebimentos()` — o **mesmo** molde de `salvarFiscal`, que é o que mantém o cenário (g) verde
(refetch do mesmo id não desmonta o bloco de anexos).

⚠️ **(Fase 2) CAMPO VAZIO NÃO PODE VIRAR ZERO.** `Number('')` é **0**, e o input nasce
`value={item.quantidade_recebida ?? ''}` — então limpar o campo e salvar mandaria
`quantidade_recebida: 0`, que o servidor grava (0 < esperada, sem excedente, **200**) e que
**dispara o alerta de divergência** com "0 recebidos". `salvarConferencia` tem de **omitir** o campo
quando o valor é `''`/`null`/não-finito — é exatamente o caso que o `COALESCE` da T3 existe para
preservar, e o par (omitir + `COALESCE`) é o que faz "não digitei" ser diferente de "chegou zero".
`avisoDivergencia(item)` devolve `null` no mesmo caso. **Cenário obrigatório no arquivo, o `(p)`:**
limpar o campo, clicar `Salvar Conferência`, e afirmar que
`api.put.mock.calls[0][1].itens[0]` **não tem** a chave `quantidade_recebida`
(`expect('quantidade_recebida' in payload.itens[0]).toBe(false)`) — `toEqual` com o objeto
`{ id: 581, conferencia_quantidade: false }`, que é a forma mais legível.

⚠️ **(Fase 2) A troca da linha de quantidade tem âncora de DUAS ocorrências.**
`grep -cF 'item.quantidade_recebida || item.quantidade_esperada'` em
`RecebimentosAlmoxarifado.js` dá **2**: a linha da quantidade em negrito **e** o
`quantidadeEsperada` do contador de séries. Troque **só** a primeira — a âncora que dá 1 é
`{item.quantidade_recebida || item.quantidade_esperada} {item.unidade}` (com o `{item.unidade}`).
E note que `??` no lugar de `||` **muda comportamento** quando a recebida é `0`: passa a mostrar
`0` em vez da esperada, que é o certo, e é o que o cenário `(p)` protege por outro lado.

⚠️ **(Fase 2) A asserção de "contém 187" lê o texto em NEGRITO, não o input.** `textContent` não
inclui `value` de `<input>`; o `187` só aparece no DOM porque `atualizarItemDetalhe` atualiza
`detalhe.itens` (`:372-377`) e a linha da quantidade em negrito re-renderiza com ele. Escreva isso
no cabeçalho do cenário (n), senão a próxima sessão "conserta" a asserção achando que ela lia o
input.

### Divergência declarada da T5 contra o Step 3: a recusa fica NA TELA, não só no toast

O Step 3 acima previa, para a metade negativa do (o), asseverar só "o painel continua de pé e
`api.put` foi chamado uma vez", porque *"o toast é mock"*. **Executado diferente, e o plano estava
fraco nisto:** a implementação ganhou um estado `erroConferencia` e um aviso `role="alert"` dentro
do painel, e o cenário (o) afirma **a literal do 403 no DOM**. Motivo: as duas recusas desta porta
trazem literal que **diz quem resolve** ("a autorização de excedente é de Compras ou do
Administrador" — **(revisão final)** esta literal dizia "marque a autorização de excedente para
registrar", e **estava errada**: mandava um gesto impossível para o ALMOXARIFE, que nunca vê a
caixa; ver F3 no bloco da onda de correção —,
"exige a permissão `autorizar_excedente`"), e num toast de cinco segundos elas não chegam a ser
lidas — o operador fica com "não salvou" e nenhum motivo. É **a mesma régua** que a Etapa 35
aplicou à lista que não carregou (RN-04/RN-05), na mesma tela. **Descartado:** deixar só no toast
(o que o plano dizia) — mais barato, e reproduz exatamente o defeito que a RN-04 fechou a três
commits de distância.

Duas consequências menores, também deliberadas: `abrirDetalhe` e `fecharDetalhe` zeram
`erroConferencia` **e** `autorizarExcedente` (senão a caixa marcada em A viajaria para B, e a
mensagem de A acusaria B); e o aviso entra **depois** do `renderAcoes()`, antes do banner de
contas a pagar — o cenário (c), que mede a ordem `banner → bloco de anexos`, continua verde.

- [x] **Step 4: rodar o arquivo inteiro** — os 12 cenários existentes (a)–(l) **mais** (m), (n), (o)
      **e (p) (Fase 2)**.
      Atenção nominal ao **(g)** (identidade do nó do bloco de anexos) e ao **(k)**/**(l)** (troca de
      linha e resposta fora de ordem): se algum deles cair, o bloco de itens foi movido de lugar.

**GREEN REAL — `Tests: 16 passed, 16 total`**, com o (g), o (k) e o (l) nominalmente verdes: o
bloco de itens ficou onde estava (dentro do ternário de `loadingDetalhe`) e o de anexos não foi
tocado. Saída limpa — só os ruídos pré-existentes (React Router future flags e o canvas do jsdom
vindo do `jspdf` via `EtiquetasPdfModal`).

- [x] **Step 5: CONTROLE POSITIVO — três sabotagens** → **cinco rodadas** (as quatro da tabela
      mais uma acrescentada para o (p), que é cenário da Fase 2 e não tinha controle declarado).
      `md5sum` pós-conserto: `bb4aa14fd9a91aaa438160c378138bf0`; toda restauração conferida contra
      ele e contra `diff -q` com a cópia do scratchpad (`bkp-RecebimentosAlmoxarifado-t5.js`) —
      **nenhum `git checkout --`**, que descartaria o conserto junto com a sabotagem.

| # | Âncora (`grep -cF` = 1 **pós-conserto**) | md5 pós-sabotagem | Caiu | ASSERÇÃO que caiu |
|---|---|---|---|---|
| 1 | `title="Qtd. conferida"` → `title="Quantidade"` | `cf510a64…` | **(m), (n), (o), (p)**; (a)–(l) **verdes** | `expect(input).not.toBeNull()` — `Received: null` nas quatro. Derrubar as quatro é o previsto: todas dependem do campo. Nenhum cenário da 34/35 caiu |
| 2 | `...(autorizarExcedente ? { autorizar_excedente: true } : {}),` (injeta `status: 'EM_CONFERENCIA',` antes) | `343a7c25…` | **(m), (o), (p)** | `expect(api.put.mock.calls[0][1]).toEqual(...)`, com o diff `+ "status": "EM_CONFERENCIA"`. É o alvo da tabela (o (m)) mais os dois outros que comparam payload por inteiro — "sem `status`" é contrato, não descuido |
| 3 | `Divergência: {diff} {sentido} que o esperado ({esperada})` → `Quantidade divergente` | `fec55128…` | **(n)** e **(o)** | `expect(painel().textContent).toContain('Divergência: 13 a menos que o esperado (200)')` (e a de `50 a mais` no (o)). O `Received string` do (n) mostra `187 PCEsperada: 200Quantidade divergente` — prova, de lambuja, que as DUAS quantidades chegam ao DOM |
| 4 | ` && pode('autorizar_excedente')` (removido) | `6625a4b8…` | **NADA — 16/16 verdes** | **Achado, declarado e não forjado:** a suíte mocka o hook com `pode: () => true`, então os dois lados são idênticos e ela **não protege o esconder-por-permissão**. A condição **fica** (a barreira real é o 403 do servidor, travado na T3 por `recebimentoExcedente.api.test.js`), e está escrito no cabeçalho do cenário (o) |
| 5 *(acrescentada)* | `...(preenchida ? { quantidade_recebida: recebida } : {}),` → `quantidade_recebida: recebida,` | `0058734c…` | **(p)**, e só ele | `expect('quantidade_recebida' in payload.itens[0]).toBe(false)` — `Expected: false / Received: true`. É o controle do dano NOVO que a task poderia ter criado: com a chave sempre presente, `Number('')` mandaria **0** e o servidor gravaria "chegou zero" onde o operador só não digitou |

**O previsto (escrito antes da execução), para comparar com a tabela de resultado acima:**

| # | Sabotagem | O que TEM de cair |
|---|---|---|
| 1 | trocar `title="Qtd. conferida"` do input por outro texto | **(m)**, por `clicar(null)`/input não encontrado. ⚠️ Se isto derrubar **também** (n) e (o), está **certo** — os três dependem do input; o que **não** pode acontecer é derrubar (a)–(l) |
| 2 | no `salvarConferencia`, mandar `status: 'EM_CONFERENCIA'` junto | **(m)**, pelo `toEqual` do payload — é o controle de que "sem `status`" é contrato, e não descuido. O cenário existe porque avançar o workflow no gesto de salvar a contagem seria mudança de comportamento invisível |
| 3 | trocar o texto do aviso por "Quantidade divergente" | **(n)**, pela literal. Prova que a mensagem está congelada e é a mesma que vai para o manual |
| 4 | remover o `&& pode('autorizar_excedente')` da caixa | **nada cai** — e isso é **esperado e declarado**: a suíte mocka o hook com `pode: () => true`, então os dois lados são idênticos. **O achado:** a suíte **não** protege o esconder-por-permissão. Não forje vermelho e **não** remova a condição: escreva isso no cabeçalho do cenário (o backend é quem decide, e o 403 do servidor está travado pela T3) |

- [x] **Step 6: `build` e commit** — commit **`e2a23a9`**, *"Almoxarifado Etapa 36 Task 5: nao havia
      onde dizer quanto chegou de verdade, e o alerta de divergencia nao tinha produtor"*, com os
      **dois** arquivos de client e nada mais (`git add` por caminho, nunca `-A`).

```
cd client && CI=true npx react-scripts build
```

**Números reais, antes do commit:**

| Comando | Resultado |
|---|---|
| `test --watchAll=false src/.../RecebimentosAlmoxarifado.test.js` | **16 passed, 16 total** (1 suite) |
| `test --watchAll=false` (suíte de client inteira) | **703 passed, 703 total**, **47 suites**, 7.9 s |
| `build` com `CI=true` | **`Compiled successfully.`** — nenhum warning virou erro |

- [x] **Fix-round 1 — `d02744a`** *"Almoxarifado Etapa 36 Task 5 fix 1: salvar a contagem de um
      item DESMARCAVA a conferencia de outro"* — um achado **Importante** da revisão, e ele é o
      **mesmo tipo** do `(p)`: dano novo criado pelo primeiro chamador da rota.

**O defeito.** `salvarConferencia` mandava `conferencia_quantidade` **sempre**, com booleano
concreto, **fora** do spread condicional que já protegia a quantidade. Então o `COALESCE` que a T3
pôs nessa coluna (`receiptService.js`, `conferirRecebimento`: o parâmetro só vira 0/1 quando o
campo vem `!= null`) estava **morto para este chamador** — e este chamador é o único que existe.
Caminho: item gravado com `conferencia_quantidade = 1`; o operador reabre o painel, limpa (ou
nunca digita) o campo **daquele** item e salva para gravar a contagem de **outro** — a quantidade
era preservada pelo COALESCE, mas o `false` que ia junto **sobrescrevia o `1`**. A conferência se
desmarcava sozinha, em silêncio, por um save que não era sobre aquele item.

**O conserto.** O booleano sai pela **mesma porta** da quantidade: campo vazio não manda
quantidade **nem** veredicto sobre ela; campo preenchido manda as duas chaves. É a regra que o
`COALESCE` da T3 existe para exercer, dos dois lados — omitir aqui, preservar lá.

**Régua nova, cenário `(q)`.** A fixture do recebimento **41** passou a ter **dois** itens, o
`412` com `conferencia_quantidade: true` gravado. Limpar o campo dele e salvar → objeto **sem
nenhuma** das duas chaves (`'conferencia_quantidade' in item412` → `false`); **metade positiva no
mesmo save**, o item `411` com o campo preenchido levando as duas
(`{ id: 411, quantidade_recebida: 50, conferencia_quantidade: true }`). Sem a metade positiva,
omitir *sempre* os dois campos passaria o cenário e quebraria a task inteira em silêncio. O 41 e
não o 58 porque (m)/(n)/(o)/(p) leem `api.put.mock.calls[0][1]` com `toEqual` e um segundo item no
58 os quebraria; os cenários da 34/35 que usam o 41 ((e), (k), (l)) não contam itens nem inputs —
e ficaram verdes.

**O `(p)` teve a expectativa APERTADA no mesmo movimento:** o payload do campo limpo era
`{ id: 581, conferencia_quantidade: false }` e agora é `{ id: 581 }`. Não é ajuste cosmético: é a
mesma regra medida pelo outro lado.

| | |
|---|---|
| **RED** | `Tests: 2 failed, 15 passed, 17 total`. `(q)` em `expect('conferencia_quantidade' in item412).toBe(false)` → `Received: true`; `(p)` no `toEqual` do payload → `+ "conferencia_quantidade": false` |
| **GREEN** | `Tests: 17 passed, 17 total` |
| **Sabotagem 6** (âncora `conferencia_quantidade: recebida === Number(item.quantidade_esperada),`, `grep -cF` = 1; md5 `cb107adf…` → `58f9a97c…` → `cb107adf…`) | volta a mandar o booleano incondicionalmente: derruba **`(q)`** na asserção da chave **e `(p)`** no `toEqual`, e **mais nada** (15 verdes). A revisão previa "só o cenário novo"; caem **dois** porque o fix-round apertou o `(p)` — é mais régua, não menos |
| **Suíte de client** | **704 passed, 704 total**, 47 suites |
| **`build`** | `Compiled successfully.` |

⚠️ Restauro por **cópia do scratchpad** (`bkp-RecebimentosAlmoxarifado-t5fix1.js`), nunca
`git checkout --`: a sabotagem rodou **antes** do commit do fix, e o checkout levaria os dois.

`CI=true` faz warning virar erro — variável não usada no bloco novo quebra o build. Commit com assunto
único: o campo de quantidade conferida. Corpo: o alerta de divergencia tinha consumidor e nenhum
produtor alcancavel (manual `:3037`/`:3045` prometia o que a tela nao permitia), a rota `/conferir`
existia sem chamador desde sempre (achado Critico de `alertaEventoGanchos`), a decisao (`/conferir` e
nao `/fiscal`, com os tres motivos) e o descartado (`/fiscal`, que so renderiza no Faturamento e
deixaria a rota morta).

---

### Task 6: `setLoadingDetalhe(false)` nas duas telas — declaradamente SEM régua **(galho C)**

**Files:**
- Modify: `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js` (`fecharDetalhe`, `:198-203`)
- Modify: `client/src/components/almoxarifado/RequisicoesList.js` (`fecharDetalhe`, `:320-326`)

**Duas correções, e a segunda é a que o plano da 35 errou.** Aquele plano dizia *"molde exato: o irmão
em Requisições, `2817054`"* — **está errado**: aquele commit acrescentou o **bump da sequência** e o
`syncSearchParams(null)`, e **não** zerou `loadingDetalhe`. O defeito é **gêmeo, não moldado**: fechar
só Recebimentos deixaria o irmão aberto, e a próxima sessão leria o plano da 35 e "consertaria" o mesmo
lado de novo.

**Declarada SEM régua automatizável, com a razão rastreada** (não presumida): nas duas telas, **todo**
consumidor de `loadingDetalhe` só renderiza com o painel aberto, e abrir o painel passa por
`abrirDetalhe`, que liga a flag na entrada — em qualquer id, inclusive o mesmo. Em Requisições o botão
de refresh (`disabled={loadingDetalhe}`) está sob `{detalhe && (...)}`, que é `null` depois do ✕.
**Não existe sequência de gestos em que a flag pendurada apareça no DOM.** Isto é o **caso 2** da
`fechar-etapa`: manter a forma segura e declarar que a suíte não a protege. A régua que o plano da 35
propunha (*"reabrir e ver se nasce em Carregando…"*) **não funciona**, e escrevê-la produziria o teste
vazio que o CLAUDE.md manda desconfiar.

**Descartado (c2 da medição):** dar a Recebimentos o botão de atualizar o detalhe que Requisições tem,
só para a flag ganhar consumidor. É **feature**, não régua — e mesmo com ele a flag continua
inobservável depois do ✕, porque o botão morre com o painel. Não amarrar as duas coisas.

- [x] **Step 1: as duas linhas, com o comentário que explica o silêncio**

```js
  const fecharDetalhe = () => {
    ++detalheFetchSeqRef.current;
    setSelectedId(null);
    setDetalhe(null);
    idCarregadoRef.current = null;
    // Etapa 36 (RN-19): fechar tem de desligar o "carregando" TAMBEM. O `finally` de `abrirDetalhe`
    // so desliga a flag quando a sequencia ainda e a dele, entao fechar com um GET em voo a deixava
    // pendurada em `true` para sempre.
    //
    // SEM CENARIO DE TESTE, e isso e declaracao, nao esquecimento (caso 2 da skill fechar-etapa):
    // todo consumidor de `loadingDetalhe` nesta tela so renderiza com o painel aberto, e abrir o
    // painel passa por `abrirDetalhe`, que liga a flag na entrada — logo nao existe sequencia de
    // gestos em que a flag pendurada apareca no DOM. Qualquer assercao escrita hoje passaria antes
    // e depois desta linha (o controle positivo e um NO-OP declarado). A linha fica porque a forma
    // segura e barata e porque o proximo consumidor de `loadingDetalhe` — um botao de atualizar o
    // detalhe, por exemplo — herdaria o defeito em silencio.
    setLoadingDetalhe(false);
  };
```

O comentário do gêmeo em `RequisicoesList.js` diz **o mesmo** mais a frase que corrige o plano da 35:
*o `2817054` acrescentou o bump da sequência e o `syncSearchParams(null)`, e **não** zerou a flag —
o resíduo era gêmeo, não moldado*.

- [x] **Step 2: rodar as DUAS suítes inteiras** (nenhum cenário novo — o que se prova aqui é
      **não-regressão**) — **executado**: `RecebimentosAlmoxarifado.test.js` 17/17,
      `RequisicoesList.test.js` 35/35, os dois verdes com a linha no lugar.

```
cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/RecebimentosAlmoxarifado.test.js
cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/RequisicoesList.test.js
```

⚠️ **(Fase 2) A âncora de `setLoadingDetalhe(false)` NÃO dá 1 depois do conserto.** Medido no HEAD:
`grep -cF 'setLoadingDetalhe(false)'` dá **1** em cada tela **hoje** — e esse 1 é o `finally` de
`abrirDetalhe` (`RecebimentosAlmoxarifado.js:192`; em Requisições, o equivalente). Depois da T6 dá
**2**, e apagar "a" linha por token solto pode apagar **o `finally`**, que é o conserto da Etapa 34
e derrubaria cenários de verdade — dando um falso "achado". Use o **bloco ancorado**, que dá 1:
em Recebimentos `"idCarregadoRef.current = null;\n    setLoadingDetalhe(false);"`
(⚠️ `idCarregadoRef.current = null;` sozinho dá **2** — ele também está no `catch` de
`abrirDetalhe`), e em Requisições `"syncSearchParams(null);\n    setLoadingDetalhe(false);"`
(ou a ordem que o conserto tiver adotado).

- [x] **Step 3: CONTROLE POSITIVO declarado como NO-OP, e executado de qualquer forma.** Apague a linha
      `setLoadingDetalhe(false);` de **cada** tela (uma por vez, `grep -cF` do **bloco ancorado** = 1
      — ver o ⚠️ acima —, `md5sum`
      antes/depois/depois-de-restaurar, restauro por **perl inverso** — **nunca** `git checkout --`,
      que levaria o conserto embora junto) e rode as duas suítes. **Esperado: nada cai, nas duas.**
      Registre aqui o placar idêntico dos dois lados — é isso que transforma "não testei" em "não é
      testável com este harness, e aqui está a prova". **Se algo cair, é achado**: existe consumidor
      observável que o rastreamento não achou; escreva o cenário e mude esta task para "com régua".

  **Executado.** Bloco ancorado real (o comentário do Step 1 mudou o texto antes do
  `setLoadingDetalhe(false);` — a âncora de código usada foi o fim do comentário mais a linha e o
  `};`, `grep -cF`/perl deram 1 nas duas telas). Removida a linha, uma tela por vez, restaurada por
  script perl inverso (nunca `git checkout --`):

  | Tela | md5 antes | md5 sem a linha (suíte) | resultado | md5 depois de restaurar |
  |---|---|---|---|---|
  | RecebimentosAlmoxarifado.js | `9dbcc643a4d57c1a37778ae7c0a22378` | (removida) | **17/17 verde** — nada cai | `9dbcc643a4d57c1a37778ae7c0a22378` (idêntico ao antes) |
  | RequisicoesList.js | `5c0d7d9dce2c1d28de9ee4109b3bffa1` | (removida) | **35/35 verde** — nada cai | `5c0d7d9dce2c1d28de9ee4109b3bffa1` (idêntico ao antes) |

  Placar idêntico nas duas rodadas (com e sem a linha): nenhum achado novo, confirmando que o
  suite não protege esta linha (declarado, caso 2).

- [x] **Step 4: commit** — assunto único: o resíduo do `loadingDetalhe`. Corpo: o resíduo era GEMEO
      (`RequisicoesList.js` tinha o mesmo, e o plano da Etapa 35 afirmava que o `2817054` servia de
      molde — **estava errado**), por que nao ha cenario (todo consumidor da flag so renderiza com o
      painel aberto) e que o controle positivo e um no-op declarado, com o placar.

  **Commit:** `5ce3fdf` — "Almoxarifado Etapa 36 Task 6: loading do detalhe ficava pendurado apos
  fechar o painel com um GET em voo". Build do client (`CI=true react-scripts build`) sem warnings.

---

### Task 7: integração — as duas portas em sequência, pela ROTA e pelo SERVIÇO **(sequencial)**

**Files:**
- Create: `server/tests/api/recebimentoPortasIntegracao.api.test.js`

**Por que este teste existe.** Verde por unidade não prova que as partes compõem, e nesta etapa há três
guardas novas em **cinco** pontos de chamada (duas em `criarRecebimento`/`salvarDadosFiscal`, duas em
`conferirRecebimento`/`salvarDadosFiscal`, mais o `validate` das duas rotas). O que **cruza** é a
ordem: a guarda de NF mora no **serviço**, o `validate` mora na **rota**, e a de excedente mora no
serviço mas depende de `req.user`, que a rota injeta. **A regra da Fase 3 é explícita**: onde existem os
dois caminhos, exija um cenário que entre **pela rota** e outro que entre **pelo serviço**.

> ✅ **TASK 7 COMPLETA** — commit **`aa39155`** *"Almoxarifado Etapa 36 Task 7: nada provava que as
> tres guardas novas COMPOEM, nem em que camada cada uma mora"* (1 arquivo, +424, **zero linha de
> produção**). `cd server && node tests/api/recebimentoPortasIntegracao.api.test.js` → **4 passou,
> 0 falhou**.
>
> **O fluxo da rota ficou em TRÊS blocos, não em um `test()` único** — divergência deliberada contra
> o Step 1, exigida pelo próprio Step 4: as duas sabotagens de controle precisam cair em pontos
> **diferentes**, e num bloco único a primeira asserção a estourar esconderia a outra (o arquivo
> viraria controle no-op). O bloco **(A)** é o território da guarda de NF (passos 0–4, com a
> contagem de documentos); **(B)** é o do excedente (passos 5–8b, documento próprio); **(C)** é o da
> camada 2 (passo 9, documento próprio); **(D)** é o cenário pelo serviço. Verificado por execução
> que o corte funciona — ver o Step 4.

- [x] **Step 1: o cenário pela ROTA — o fluxo inteiro, na ordem, contando os documentos**

```
test('integracao pela ROTA: enum, NF duplicada nas duas portas, conferencia, divergencia e excedente')
```

Passos, cada um com a sua asserção (e a contagem de documentos no fim de cada bloco):

| # | Gesto | Esperado |
|---|---|---|
| 0 | `POST /recebimentos` com `tipo_recebimento: 'BANANA'` | **400** com a literal do enum, e `COUNT(recebimentos) === 0` |
| 1 | `POST /recebimentos` válido, `nota_fiscal: 'NF-INT-1'`, `fornecedor_id: F1`, item esperado **10** | **201**; `COUNT === 1` |
| 2 | `POST /recebimentos` com a **mesma** NF e o mesmo fornecedor | **409** citando o número do documento do passo 1; `COUNT` continua **1** |
| 3 | `POST /recebimentos` com a mesma NF e **F2** | **201**; `COUNT === 2` (a metade positiva dentro do fluxo) |
| 4 | **(Fase 2)** `POST /<doc do passo 3>/workflow {acao:'iniciar_conferencia'}` → **200**; só então `PUT /<doc do passo 3>/fiscal` com `nota_fiscal: 'NF-INT-1'` e **F1** | **409** — a segunda porta, citando o número do passo 1. **Sem o avanço de status o passo responde 400 `'Dados fiscais só podem ser editados antes do processamento'`** (medido) e o cenário fica vermelho antes e depois do conserto |
| 5 | `PUT /<doc do passo 1>/conferir` com `quantidade_recebida: 7` | **200**; coluna **7** no banco; `listarDivergenciasRecebimento` lista **1** item |
| 6 | `PUT /<doc do passo 1>/conferir` com `quantidade_recebida: 99`, sem flag | **400** com a literal do excedente; a coluna **continua 7** |
| 7 | idem, com `autorizar_excedente: true`, `setUser(ALMOXARIFE)` | **403** com a literal da permissão; a coluna **continua 7** |
| 8 | ~~idem, com `autorizar_excedente: true`, `setUser(GESTOR)` → **200**~~ **(execução) O BRIEF ESTAVA OBSOLETO:** o passo 8 é **`setUser(COMPRAS)`** → **200**; coluna **99**; auditoria `EXCEDENTE_AUTORIZADO` presente. O fix 1 da T3 (`3e36af4`) reduziu `autorizar_excedente` a `[ADMINISTRADOR, COMPRAS]` porque o GESTOR não atravessa `receber_material` (`[ADMINISTRADOR, ALMOXARIFE, COMPRAS]`) e portanto **não tinha porta**; COMPRAS é o único perfil não-admin com a porta **e** a ação |
| **8b** | **(execução, acrescentado)** idem, com a flag, `setUser(GESTOR)` | **403** da **CAMADA 2**: `body.acao === 'receber_material'` e `body.perfil === 'GESTOR'`, **antes** do serviço; a coluna continua **7**. O par 7 + 8b é o mapa de **qual camada recusou o quê** — os dois são 403 e dizem coisas diferentes |
| 9 | `setUser(SEM_PERFIL)` e qualquer um dos gestos acima | **403** de `receber_material` — a camada 2 continua na frente de tudo. **(execução)** os **três** gestos no mesmo cenário, cada um com payload **inválido** de propósito: se a camada 2 saísse da frente a resposta seria 400, não 200, então afirmar **403 + a ação + `perfil: 'PRODUCAO'`** é o que prova que o gate veio antes do `validate` e antes do serviço |

**A ordem 6 → 7 → 8b → 8 é o ponto do cenário:** o mesmo gesto, no mesmo item, com **quatro**
respostas diferentes, mudando **só** a flag e o perfil — 400 (falta intenção), 403 do **serviço**
(falta autoridade para a ação), 403 da **rota** (falta a porta do módulo) e 200. Nenhum teste de
unidade cobre isso, porque cada um deles monta o seu próprio usuário.

- [x] **Step 2: o cenário pelo SERVIÇO — porque as duas guardas MORAM no serviço**

```
test('integracao pelo SERVICO: as guardas nao dependem da rota para existir')
```

Chamando `receiptService.criarRecebimento(db, USER, {...})` e
`receiptService.conferirRecebimento(db, USER, id, {...})` **direto**, sem `supertest`:

- criar com a mesma NF/fornecedor duas vezes → a segunda **rejeita** com `err.status === 409` e a
  literal (`assert.rejects` com a regex da mensagem, ou `try/catch` afirmando `e.status`);
- conferir com excedente e sem flag → `err.status === 400`;
- conferir com flag e um `user` de perfil `ALMOXARIFE` → `err.status === 403`;
- **a metade positiva:** conferir com `recebida < esperada` → resolve, e a coluna muda.

**Por que isto não é redundante com o cenário da rota:** se alguém, amanhã, mover a guarda de NF para a
**rota** (por parecer mais simples), o cenário da rota **continua verde** e este fica **vermelho** — e o
achado é justamente que o `PUT /fiscal` e o `criarRecebimento` têm outros chamadores potenciais
(importador, script de migração, a própria `processarNota`). É o inverso do defeito da Etapa 25, onde 12
cenários de unidade verdes esconderam a feature morta.

**(execução) O cenário do serviço ficou com SEIS metades, três além do Step 2:**
1. as quatro pedidas — NF duplicada rejeitando com `status 409` + a literal (e a **contagem** de
   documentos inalterada, provando que a recusa é antes do INSERT); excedente sem flag → 400;
   flag + `ALMOXARIFE` → 403 nomeando a ação; e a positiva (`recebida < esperada` resolve e a
   coluna muda para 6);
2. **o `GESTOR` pelo serviço → 403 `autorizar_excedente`** — é a **única** forma de exercitar
   `can(GESTOR, 'autorizar_excedente')`, porque pela rota ele para no gate de `receber_material`.
   A mesma recusa do passo 8b, pela **outra** camada;
3. **o positivo do `can()` nesta camada**: `ADMIN` com a flag resolve, grava 99 e deixa **uma**
   linha de `EXCEDENTE_AUTORIZADO` — sem isso um `throw` incondicional passaria as três rejeições
   com louvor;
4. ⚠️ **A ASSIMETRIA DELIBERADA, agora AFIRMADA — achado de integração desta task.** O enum **não**
   é checado no serviço: `criarRecebimento` chamado direto aceita `tipo_recebimento: 'BANANA'` e
   **grava cru** (verificado por asserção, não por leitura). As duas guardas de NF/excedente moram
   no serviço; o `validate` mora só na rota. Consequência escrita no arquivo: **um importador ou
   script de migração que chame o serviço direto passa pelo enum e NÃO passa pela NF nem pelo
   excedente.** Se um dia o enum descer para o serviço, essa asserção fica vermelha e é ali que se
   lê o porquê. **Não foi "consertado" em silêncio** — é decisão de camada, e vai para a letra B.

- [x] **Step 3: rodar os cinco comandos da `fechar-etapa` e LER os números**

```
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```

Baseline da Etapa 35, para comparar: `test:api` **169/169 arquivos OK**; almoxarifado **42 passou, 0
falhou**; validation/safealter/sqlite **4/3/5**; client **47 suítes / 699 testes**; build limpo.
**Previsão desta etapa:** `test:api` **174/174** (+5 arquivos: enum, NF duplicada, excedente, workflow,
integração — **169 confirmado no HEAD `8594d8c` por `ls tests/api/*.api.test.js | wc -l`**), client
**47 suítes / 703 testes** (**Fase 2:** +4 cenários em `RecebimentosAlmoxarifado.test.js` — (m), (n),
(o) e o **(p)** do campo vazio —, nenhuma suíte nova; `permissaoErro.test.js` ganha rótulo, não
cenário). **Confira os números reais e registre — não confie nesta previsão.**

**(execução) OS CINCO NÚMEROS REAIS, lidos da saída — a previsão errou dois:**

| Comando | Real | Previsão | |
|---|---|---|---|
| `npm run test:api` | **174/174 arquivos de teste OK** (`15 passed, 0 failed` no arquivo agregador) | 174/174 | ✅ bateu. O controlador da T7 previu **175**; o HEAD `5ce3fdf` tinha **173** (`ls tests/api/*.api.test.js \| wc -l`), e este arquivo é o **174º** |
| `npm run test:almoxarifado` | **42 passou, 0 falhou** | 42 | ✅ |
| `test:validation` / `test:safealter` / `test:sqlite` | **4 passed** / **3 passed** / **`sqliteConcurrency: 5 passed`** | 4/3/5 | ✅ |
| client `test --watchAll=false` | **`Test Suites: 47 passed, 47 total` / `Tests: 704 passed, 704 total`** | 47 / **703** | ⚠️ **704**, um a mais: a T6 acrescentou o cenário do `loadingDetalhe` que a previsão da Fase 2 não contava |
| client `build` | **`Compiled successfully.`** (nenhum warning de app; só o `DeprecationWarning` do `fs.F_OK` do CRA) | limpo | ✅ |

- [x] **Step 4: reexecutar contra ESTE arquivo as sabotagens que a T2 e a T3 registraram como "cai só
      no arquivo dela"** — em particular a nº 3 da T2 (posição da guarda de NF) e a nº 3 da T3
      (ALMOXARIFE na lista). As duas têm de derrubar **também** este arquivo, e no passo certo (2 e 7,
      respectivamente). Se derrubarem o arquivo inteiro por um erro anterior, o cenário está acoplado
      demais: separe os passos.

**(execução)** Harness: `perl -0777 -pi -e` (`/usr/bin/perl` verificado com `perl -e 'print
"perl-ok"'`; `python3` **não** foi usado). `git status --short` **antes**: nenhuma mudança de
produto não commitada — só os dois `.md` de plano/design e os três artefatos de runtime já
conhecidos. Cópias de segurança no scratchpad (`bkp-receiptService-t7.js`, `bkp-permissions-t7.js`),
**restauração sempre por cópia**, nunca `git checkout --`. md5 pós-conserto (alvo de toda
restauração, e igual ao que a T2/T3 registraram): `receiptService.js` =
**`36934495c62a71caa18aa779933ce35a`**; `permissions.js` = **`3be0a7721cc63b57b159d5298f9745d6`**.
Âncoras contadas **neste HEAD**, todas **1**: `grep -cx '    nota_fiscal,'`,
`grep -cF '    user.id, user.nome || user.email, observacoes || null,'` e
`grep -cF '  autorizar_excedente: [PERFIS.ADMINISTRADOR, PERFIS.COMPRAS],'`.

| # | Sabotagem | md5 sabotado | Placar | Onde caiu (lido) |
|---|---|---|---|---|
| **T2 nº 3** (literal) | mover a chamada de `assertNotaNaoDuplicada` do `criarRecebimento` para **depois** do `inserirComNumeroUnico` | `38269e1144c638f9493ced3fd5fb8c46` | **0/4** | Cai no **passo 1**, não no 2: `409 !== 201`, com a guarda **acusando o documento que ela mesma acabou de gravar**. Derruba os quatro blocos, cada um na sua própria criação. **Não é acoplamento do cenário** — é a forma **catastrófica** já registrada pela T2 (achado 2 da T2): *nenhum* cenário pode alcançar o passo 2, porque a criação do passo 1 é que falha. Separar mais os passos não mudaria nada: qualquer bloco tem de criar documento antes de duplicá-lo |
| **T2 nº 3b** (a forma **silenciosa** — a que o Step 4 realmente precisa) | a mesma mudança de posição, passando `r.lastID` (exclui o próprio documento, então o 409 correto continua saindo) | `026a13385c1f56213647ac48f61dc5e4` | **2/2** | **Exatamente no passo 2**, na contagem: `passo 2: o POST recusado nao pode ter GRAVADO documento antes de recusar` → **`2 !== 1`**. E no bloco **(D)**, na asserção equivalente do serviço (`a recusa do servico e ANTES do INSERT do cabecalho` → `6 !== 5`). **(B) e (C) ficaram VERDES** — o corte em três blocos funcionou |
| **T3 nº 3** | dar `PERFIS.ALMOXARIFE` a `autorizar_excedente` | `f5f5021e237e2d728e1c29f636e612c2` | **2/2** | **Exatamente no passo 7**: `200 !== 403` (`{"success":true}` onde o teste exige o 403 de `autorizar_excedente`). E no bloco **(D)**: `Missing expected rejection: ALMOXARIFE nao tem a acao: o servico TEM de recusar, nomeando a acao`. **(A) e (C) ficaram VERDES** |

Depois das três: md5 de volta aos dois valores pós-conserto, `git diff --stat` com **só** os dois
`.md` de documentação e o arquivo novo no `git status` — e a rodada limpa de novo em **4 passou, 0
falhou**. **É a prova de que este arquivo sabe falhar**: ele passou de primeira, e a regra do
CLAUDE.md manda desconfiar de teste que nasce verde.

- [x] **Step 5: commit** — assunto único: o cenário de integração. Corpo: por que ele existe (tres
      guardas em cinco pontos, com a de NF e a de excedente no SERVICO e o `validate` na ROTA), e o que
      o cenario do servico pega que o da rota nao pega.

**(execução)** Commit **`aa39155`**, um arquivo (`git add` por caminho; **nunca** `git add -A`). O
corpo explica as três guardas nos cinco pontos, os quatro blocos, o que o cenário do serviço pega
que o da rota não pega, a divergência do GESTOR e os cinco números reais. `Co-Authored-By: Claude
Fable 5.1` conforme a atribuição vigente desta execução.

**Divergências desta task, para a letra B da T8:**
1. **O passo 8 do brief (`GESTOR → 200`) estava obsoleto** desde `3e36af4` e foi corrigido para
   COMPRAS, com o passo **8b** novo registrando o 403 de `receber_material` do GESTOR. O brief não
   foi seguido ao pé da letra **de propósito**: seguir teria produzido um teste que afirma o
   contrário do código.
2. **O fluxo da rota em três blocos** em vez de um `test()` único (motivo no cabeçalho do Step 1 e
   provado no Step 4).
3. **O enum não é checado no serviço** — assimetria de camada agora afirmada por asserção. Decisão
   de escopo, não bug: **não** foi consertado nesta task.
4. **A "terceira porta" continua aberta:** `POST /recebimentos` ainda aceita
   `quantidade_recebida: 999` de um item com `quantidade_esperada: 10` sem passar por
   `assertExcedentePermitido` (`receiptService.js:241`, `item.quantidade_recebida || qtd`). A T3
   deixou a decisão para a T7; **a T7 decidiu NÃO fechar**, porque fechar é mudança de
   comportamento de produto (a tela não manda esse campo no POST, mas um importador manda) e a
   RN-18 congelou o escopo em `/conferir` + `/fiscal`. Fica **declarado** na letra B como etapa
   própria, com o `arquivo:linha` acima.

---

### Task 8: fechamento — e as seis coisas que a documentação dizia errado **(sequencial)**

**Files:**
- Modify: `specs/modulo-almoxarifado/08-recebimento/README.md` (topo, checklist, tabela de testes, e as
  três refs de linha apodrecidas)
- Modify: `specs/modulo-almoxarifado/README.md` (linha 917, a da feature 08)
- Modify: `docs/almoxarifado-guia-etapas-e-testes.md` (cabeçalho "onde o desenvolvimento está" + seção
  da Etapa 36 + roteiro de teste manual)
- Modify: `docs/almoxarifado-novidades-por-etapa.md` (seção da etapa; **letra A** com a consulta SQL de
  produção; **letra B** a partir de **B80**; **letra C** com os itens novos a partir de **C48**)
- Modify: `docs/almoxarifado-manual-do-sistema.md` (seções 14.1/14.2/**14.4**/14.8 e o trecho dos
  alertas em `:3037`/`:3045`)
- Modify: `docs/superpowers/plans/2026-09-16-almoxarifado-etapa35-vizinhas-da-34.md` (a tabela final e
  o item (c) da "próxima tarefa detalhada")
- Modify: este plano (tasks marcadas, números reais, **próxima tarefa detalhada — Etapa 37**)

Use a skill **`fechar-etapa`** — ela é a versão executável do contrato.

> **Divergência de execução declarada: a T8 foi partida entre DOIS redatores em paralelo**, pelo
> mesmo critério da Etapa 35 (dois públicos, zero arquivo compartilhado). **Redator de
> desenvolvimento:** `specs/modulo-almoxarifado/08-recebimento/README.md`,
> `specs/modulo-almoxarifado/README.md`, **este plano** e a correção no plano da Etapa 35.
> **Redator de usuário:** `docs/almoxarifado-novidades-por-etapa.md` (letras A/B/C/D/G),
> `docs/almoxarifado-guia-etapas-e-testes.md` e `docs/almoxarifado-manual-do-sistema.md`. Os Steps
> abaixo estão marcados **por redator**, e o que não é do redator de desenvolvimento fica
> desmarcado **com o dono escrito** — não é esquecimento. O **Step 7** (os cinco comandos) e o
> **Step 8** (commit) são do **controlador**, depois de os dois redatores fecharem.
> **Nota de histórico:** uma primeira tentativa desta T8 foi morta pelo limite de uso **antes de
> escrever qualquer linha** (`git status` dos docs ficou limpo), e os redatores foram
> re-despachados depois do reset. Está registrado porque o ledger tem a linha e um leitor futuro
> veria duas passagens sem entender a segunda.

- [x] **Step 1: a spec 08 — status, checklist item por item, com hash** — feito (redator de
      desenvolvimento). Marcados com hash: *Tipos de entrada* (**`[x]` parcial**, com o recorte
      escrito: o enum nas duas portas é `d02b9f4`; os dez tipos da spec 8.1 continuam **decisão de
      negócio**), *Duplicidade* (`ffc5f47` + `c5f14c8`), *Recebimento excedente* (`f747df4`,
      `3e36af4`, `230baf6`, `2d7787d`), o item **novo** *Itens do POST validados* (`d90853d`) e,
      no frontend, *Campos de conferência física + fotos* (`e2a23a9`, `d02744a`, `e287a06`).
      Na tabela de testes, três linhas saíram de **⏳** para **✅** com o nome do arquivo (NF
      duplicada, excedente, workflow fora de ordem) e **duas** linhas novas entraram (enum + itens
      do POST; integração das três guardas). **Continuam ⏳ duas**, cada uma com o motivo na
      própria linha. Todos os itens desmarcados receberam o **porquê** — conferido por
      `grep -n -- "- \[ \]"`, 7 ocorrências, 7 com explicação.
      - `Tipos de entrada` → o enum fechado e validado nas duas portas (**`[x]` parcial explicado**: o
        campo e a validação estão feitos; **ampliar para os dez tipos da spec 8.1 continua sendo decisão
        de negócio**, e as features 11–15 🟢 já são a porta dos outros tipos — se ficar desmarcado, o
        **por quê** vai escrito ali, senão parece esquecimento);
      - `Duplicidade: mesma NF+fornecedor não entra duas vezes` → **`[x]`** com o hash, mais as três
        exceções (NF vazia, fornecedor diferente, fornecedor não identificado) e o **`UNIQUE`
        descartado com motivo**;
      - `Recebimento excedente só com autorização` → **`[x]`** com o hash, a ação nova e a exclusão do
        ALMOXARIFE;
      - `Campos de conferência física + fotos` (frontend) → **parcialmente**: a **quantidade** conferida
        existe agora; contagem/pesagem/medição/checklist **não** — e isso vai dito na mesma linha;
      - tabela de testes: as linhas `recebimento com NF duplicada falha`,
        `recebimento excedente sem autorizacao falha` e `avancar etapa fora de ordem falha` saem de
        **⏳** para **✅** com o nome do arquivo; `recebimento parcial atualiza saldo pendente do pedido`
        e `processar recebimento cria movimentacao v2 vinculada` **continuam ⏳**, e o primeiro ganha o
        motivo medido (coluna nova + escritor + Compras).
- [x] **Step 2 (correções 1, 2, 3 e 4 — as de spec/plano): feitas.** As correções **5** e **6**
      (manual 14.4 e os alertas de `:3037`/`:3045`) são do redator de usuário. **E a execução achou
      mais correções do que as seis previstas — elas estão na spec 08, ditas como erro:** (a) o
      **design desta etapa** afirmava *"GESTOR → 200"* e estava errado por inconsistência interna —
      ele mediu o gate `receber_material` e escreveu o contrário (`3e36af4`); (b) a **regra de
      excedente escrita na T3** comparava o payload com a esperada e nada mais, e por isso travava
      o fiscal de todo documento já autorizado — **incompleta**, corrigida em `230baf6`+`2d7787d`;
      (c) a **chave de fornecedor escrita na T2** comparava **uma perna só** e rodava em SQL —
      **incompleta**, corrigida em `c5f14c8`. Total: **sete** afirmações corrigidas dizendo que
      estavam erradas, em quatro documentos.
      **O enunciado original do Step 2 fica abaixo, sem corte** — é o índice das seis correções
      previstas e diz, de cada uma, o dono:
      (regra 5 do CLAUDE.md; apagar a afirmação errada sem dizer faz o próximo confiar nela de novo):
      1. **spec 08, item "Ao aprovar … + gerar etiqueta":** *"Continuam faltando a etiqueta"* —
         **errado**. A etiqueta foi entregue em 2026-08-11, Etapa 6c, **`4ebd1ce`**; o botão está em
         `RecebimentosAlmoxarifado.js` (*"Imprimir etiquetas dos itens"*, status `PROCESSADO`/
         `APROVADO`), o montador em `client/src/utils/etiquetasPdf.js` e a **spec 10 já registra**. O
         que **de fato** falta neste item é a **sugestão de localização** (feature 02) e a etiqueta
         **automática ao aprovar** (decisão de negócio, não ausência).
      2. **plano da Etapa 35, tabela final:** repete "etiqueta" como falta da 08 — **mesmo erro**,
         corrigir lá também.
      3. **spec 08, três refs de linha apodrecidas:** `extended.js:765` → **`:973`** (`:765` é a
         `POST /movimentacoes/v2`); `schema.js:1147` → **`:1229`**; `receiptService.js:281` → **`:286`**.
         Trocar por **nome de rota/função**, que é o que sobrevive a um commit — o mesmo movimento que a
         Etapa 35 fez no F3.
      4. **plano da Etapa 35, item (c) da próxima tarefa:** *"molde exato: o irmão em Requisições,
         `2817054`"* — **errado**: aquele commit **não** zerou `loadingDetalhe` e
         `RequisicoesList.js:320-326` tinha o **mesmo** resíduo; e a régua que ele propunha (*"reabrir e
         ver se nasce em Carregando…"*) **não funciona**, porque `abrirDetalhe` liga a flag em toda
         abertura. O resíduo era **gêmeo, não moldado**.
      5. **manual 14.4:** o título *"Reprocessar a mesma nota não duplica estoque"* é verdade **por
         documento** (idempotência por item, via `entrada_estoque_em`) e **era falso entre
         documentos** — medido: a mesma NF em dois recebimentos creditava **20** em vez de 10 e gerava
         **2** contas a pagar. **Depois desta etapa passa a valer entre documentos**, e a seção tem de
         ser **reescrita** dizendo as duas coisas: o que já valia (por documento) e o que passou a valer
         (por fornecedor + número). A 14.8, escrita na Etapa 35, já avisava do risco de *"registrar de
         novo uma nota que já existe"* — agora o sistema **barra**, e isso entra lá.
      6. **manual `:3037`/`:3045`:** prometiam o alerta de divergência de quantidade e até o dedupe por
         valor corrigido, mas **nenhum gesto de tela** produzia `recebida ≠ esperada`. **Depois da T5
         passa a existir** — reescrever descrevendo **onde** se digita a quantidade conferida e **qual**
         frase aparece.
      > **Regras do manual:** sem número de etapa, sem hash, sem nome de arquivo/função/tabela, sem
      > "antes era assim"; regra explicada com precisão técnica; **mensagem literal lida do código**,
      > entre aspas; português com acento. E o que **bloqueia** (409 da NF, 400/403 do excedente)
      > separado do que só **avisa** (o alerta de divergência).
- [ ] **Step 3 — DONO: redator de usuário** (`docs/almoxarifado-novidades-por-etapa.md`). Fica
      desmarcado aqui de propósito: quem escreve este plano não toca aquele arquivo. **Duas coisas
      que a execução mudou no enunciado abaixo e que o redator de usuário tem de aplicar:** (i) a
      consulta ganhou a perna do **nome** do fornecedor, porque o formulário nunca manda
      `fornecedor_id` (a versão medida está no relatório da onda e é a **A9**); (ii) a consulta
      **SUB-REPORTA** duplicatas de nome acentuado, porque o `UPPER` do SQLite é ASCII-only — o
      número dela é **piso**, não total, e isso tem de estar escrito **ao lado** dela. Mais **A10**
      (`tipo_recebimento` fora do enum) e **A11** (recebimentos abertos com `recebida > esperada`,
      a população que o F1 travaria).
- [ ] **Step 3: letra A com a CONSULTA SQL de produção** — é a contrapartida de ter descartado o
      `UNIQUE`, e sem ela a decisão fica sem prazo:

```sql
-- Duplicatas de NF por fornecedor ANTES de considerar UNIQUE(nota_fiscal, fornecedor_id).
SELECT nota_fiscal, fornecedor_id, COUNT(*) AS documentos,
       GROUP_CONCAT(numero, ' | ') AS recebimentos
  FROM recebimentos_material_almoxarifado
 WHERE TRIM(COALESCE(nota_fiscal,'')) <> ''
 GROUP BY UPPER(TRIM(nota_fiscal)), fornecedor_id
HAVING COUNT(*) > 1
 ORDER BY documentos DESC;
```

Dizer na letra A: **zero linhas** ⇒ o `UNIQUE` pode subir numa etapa futura sem migração de dado;
**qualquer linha** ⇒ decidir o que fazer com o acervo **antes**, e a guarda em serviço continua sendo a
resposta certa até lá.

- [x] **Step 4 — metade do MAPA: feita** (a metade do **guia** é do redator de usuário).
      `specs/modulo-almoxarifado/README.md`: o cabeçalho ganhou o bloco da Etapa 36 **na frente**,
      com a 35 passando a "Antes:"; a linha da feature **08** ganhou a frase da etapa e o **"o que
      falta para 🟢" atualizado** (que mudou de item: agora é o parcial/excedente contra o pedido,
      a conferência estruturada e a divergência formal — e **não** mais "etiqueta", que estava
      errado nos dois documentos); e a linha da feature **23** ganhou a ação nova
      `autorizar_excedente` `[ADMINISTRADOR, COMPRAS]`, dizendo que a cor dela **não** muda.
      *(A "linha 917" citada abaixo era o número medido na Fase 1; ele já se deslocou — a linha é a
      da feature 08 na tabela de status, procurada pelo nome.)*
- [ ] **Step 4: mapa e guia.** Linha 917 do mapa com as duas portas fechadas, a ação nova e o campo de
      conferência; e o guia com a seção da Etapa 36 em **linguagem de usuário**: tabela
      **Antes → Agora** (NF repetida entrava / agora recusa dizendo em qual recebimento ela está;
      quantidade conferida não existia / agora existe com o aviso de divergência; excedente entrava
      calado / agora exige autorização de quem tem a permissão), **roteiro de teste manual clicável**
      (registrar uma NF, tentar registrar a mesma, abrir o painel de um recebimento em conferência,
      digitar menos, ver o aviso, salvar, digitar mais, ver a caixa de autorização, salvar com um perfil
      sem a permissão e ver a recusa) e **o que a etapa NÃO cobre** (recebimento parcial, conferência
      física estruturada, divergência formal numerada, `UNIQUE` no banco).
- [ ] **Step 5 — DONO: redator de usuário.** Desmarcado aqui de propósito. **O que a execução
      acrescentou às decisões do design e tem de entrar:** **B80** guarda de NF no serviço **sem
      `UNIQUE`** (produção pode ter duplicatas) e **não airtight** (check-then-insert, sem
      transação, até o Postgres); **B81** a terceira perna por `fornecedor_nome`, hoje comparada em
      JS por **qualquer** perna; **B82** `autorizar_excedente = [ADMINISTRADOR, COMPRAS]` com o
      GESTOR fora por não ter porta (**pergunta ao negócio**); **B83** o campo de conferência pela
      rota `/conferir` e não pela `/fiscal`; **B84** a terceira porta declarada fora; **B85** sem
      backfill do acervo de `tipo_recebimento`. E a **letra C** a partir de **C48**, com o item que
      nenhuma spec tinha e que esta etapa resolveu: *"a mesma NF entrava duas vezes e dobrava o
      estoque"*.
- [ ] **Step 5: letra B a partir de B80** com as **11 decisões** do design, cada uma com o escolhido e o
      descartado; e **letra C a partir de C48** para os itens que nenhuma spec tinha: o alerta de
      divergência sem produtor alcançável, a rota `/conferir` sem chamador, o `UPDATE` de item do
      `/conferir` sem `COALESCE`, e o resíduo gêmeo do `loadingDetalhe`. Confira os números livres com
      `grep -o "\*\*B[0-9]\+" docs/almoxarifado-novidades-por-etapa.md | sort -u | tail -3` e
      `grep -o "C[0-9]\+" ... | sort -u | tail -5` (medido nesta Fase 1: último **B79**, último
      **C47**).
- [x] **Step 6: feita** — a seção `## Próxima tarefa detalhada — Etapa 37` está no fim deste
      arquivo. **Divergência do enunciado abaixo, e ela é grande:** a lista de candidatas (a)–(f)
      foi **substituída por uma Fase 0 comparativa medida** (`.superpowers/sdd/etapa37-fase0-candidatos.md`),
      e a etapa **já está decidida, desenhada, planejada e commitada** — design `5f03afc`, plano
      `9790b07`. A candidata **(a)** do enunciado (recebimento parcial) é a que venceu, e por um
      motivo que a lista não sabia: a candidata que parecia mais urgente (os 21 `ALTER TABLE`) teve
      a premissa **desmontada** pela medição. Detalhe na seção final.
- [ ] **Step 6: a próxima tarefa detalhada — Etapa 37**, no fim deste plano, com `arquivo:linha`, o
      contrato que cada uma consome e o que **não** reabrir. Candidatas medidas, em ordem de valor:
      (a) **recebimento parcial** (coluna `quantidade_recebida` em `itens_pedido_compra` + escritor +
      decisão de quando o pedido fecha — atravessa Compras, **etapa própria**); (b) **divergência formal
      numerada**, que agora tem dado de entrada; (c) o **`UNIQUE` da NF** depois da consulta da letra A;
      (d) o campo de `tipo_recebimento` **no modal fiscal** (hoje o modal reescreve o valor sem
      mostrá-lo); **(d2) (Fase 2) o `<select>` de fornecedores passar a mandar `fornecedor_id` no
      payload do `POST`** — hoje `handleCriar` manda só nome e CNPJ
      (`RecebimentosAlmoxarifado.js:342-354`), e é por isso que a chave da duplicata precisou da
      perna do nome; com o id, a perna do nome vira retaguarda;
      (e) a limpeza das ~15 citações por linha em `RecebimentosAlmoxarifado.test.js`
      (achado da T7 da 35); (f) o **teto da faixa do clipe** (F12, exige navegador) e os furos
      **C43/C44** da Etapa 33.
- [ ] **Step 7 e Step 8 — DONO: o controlador**, depois de os dois redatores fecharem. Os números
      da última medição estão na seção `## Fechamento — números medidos` no fim deste arquivo, e os
      **16 hashes** citados nos documentos de desenvolvimento foram conferidos um por um com
      `git merge-base --is-ancestor <hash> HEAD` (**16/16 ancestrais**, mais `4ebd1ce`, `2817054`,
      `5f03afc` e `9790b07` citados nas correções: **20/20**).
- [ ] **Step 7: o checklist final da `fechar-etapa`** — os cinco comandos, com os números **lidos da
      saída**, `git status` limpo (fora os três artefatos não versionados conhecidos), e
      `git merge-base --is-ancestor <hash> HEAD` para **cada** hash citado nos documentos.
- [ ] **Step 8: commit** — um commit, assunto único: o fechamento da etapa.

---

## Self-review do plano

- **Cobertura RN ↔ task ↔ sabotagem.** RN-11 → T1 cenários (1)(2)(3)(4)(5) + sabotagens 1 (strip), 2
  (segunda porta), 3 (export), 4 (literal); RN-12 → T2 (1)(2) + sabotagens 1 e 3 (**posição**);
  RN-13 → T2 (3)(4)(5) + sabotagem 4; RN-14 → T2 (6) + sabotagem 2; RN-15 → T4 (1)(2)(3) + sabotagens 1,
  2 e 3 (**posição**, no conjunto `de`); RN-16 → T5 (m) + T3 (4) [ponta de servidor] + sabotagens 1 e 2
  da T5; RN-17 → T5 (n) + sabotagem 3; RN-18 → T3 (1)(2)(3)(4) + sabotagens 1, 2, 3 (**a lista
  negativa**) e 4 (**posição**, `>` vs `>=`) + T5 (o); RN-19 → T6, **declaradamente sem régua**, com o
  no-op executado e registrado. **Nenhuma RN sem sabotagem nomeada, e nenhuma sabotagem sem a asserção
  que ela tem de derrubar.**
- **As duas sabotagens previstas como "nada cai", ditas de frente.** T5 nº 4 (remover o
  `pode('autorizar_excedente')`) e o controle da T6 — as duas são caso 2 da `fechar-etapa` (defeito
  inalcançável pelo harness: o hook é mockado com `pode: () => true`; a flag não tem consumidor
  observável). Nos dois casos a instrução é **manter a forma segura e declarar**, nunca forjar vermelho
  nem remover a proteção. A prova que existe está do outro lado: o **403 do servidor** (T3) e o cenário
  do passo 7 da integração.
- **Nenhum cenário negativo sem metade positiva.** T1: o POST válido de quatro colunas + o default
  derivado; T2: fornecedor diferente, NF nula, fornecedor não identificado, e o `PUT` da própria NF;
  T3: `recebida === esperada`, `recebida < esperada`, e o **200 do GESTOR** no mesmo `test()` do 403;
  T4: a sequência de cinco `200`; T5: `Esperada: 200` no DOM nos dois lados e o painel de pé no 403;
  T7: o passo 3 (mesma NF, outro fornecedor) dentro do fluxo.
- **Nenhum id de fixture `1`.** Client: `41`/`58`/`77`/`91`, item `581`. Servidor: ids lidos do
  `INSERT`/do `res.body`, **nunca escritos à mão** — e as literais que citam id (`item #<id>`,
  `recebimento <numero>`) são montadas a partir do banco. Usuários de teste `64`/`65`/`66`.
- **Mensagens literais congeladas, e em um lugar só.** A do enum vive numa constante
  (`TIPO_RECEBIMENTO_INVALIDO`) consumida pelos dois schemas; as do excedente vivem em
  `assertExcedentePermitido`, consumidas pelas duas portas; a da NF duplicada vive em
  `assertNotaNaoDuplicada`. **Nenhuma literal é escrita duas vezes no código de produção** — os testes
  as repetem de propósito (é o que os torna régua) e o manual as copia lidas do código.
- **Contratos completos:** os quatro endpoints tocados têm método, gate, payload, resposta e **todos** os
  códigos de recusa com a literal; as duas ações de `ACAO_PERFIS` estão na tabela, com **onde** cada uma
  é checada (rota vs serviço).
- **Consistência de nomes e tipos:** `TIPOS_RECEBIMENTO` é `string[]` exportado de `schema.js`;
  `assertNotaNaoDuplicada(db, dados, recebimentoId?)` e
  `assertExcedentePermitido(db, user, recebimentoId, itens, autorizado)` são internas do
  `receiptService` (exportar **só** se a T7 chamar direto, e então dizer por quê); no client,
  `quantidade_recebida` sai do input como **string** e é convertido com `Number(...)` **antes** do
  `api.put`, porque o contrato congelado diz número e o cenário (m) compara com `toEqual`.
- **Sem placeholders:** todo passo que muda produção traz o código ou a literal exata. As duas únicas
  coisas deixadas para a execução medir estão marcadas com ⚠️ e com a instrução do que fazer: as colunas
  obrigatórias de `pedidos_compra` no cenário (4) da T1, e o status real do detalhe do **58** na fixture
  da T5.
- **O que este plano NÃO garante, dito de frente:** (1) nenhum teste desta etapa prova que a caixa de
  autorização **esconde** de quem não tem a permissão — a suíte mocka o hook, e a decisão real é o 403
  do servidor; (2) nada aqui mede duplicatas de NF **em produção** — é o que a consulta da letra A
  existe para fazer, **antes** de qualquer decisão sobre o `UNIQUE`; (3) o `tipo_recebimento` inválido
  que já estiver gravado continua sem caminho de correção pela tela (o modal fiscal não tem o campo), e
  isso está na próxima tarefa detalhada, não escondido.

---

## Fase 2 — o que a revisão do plano pegou ANTES de executar

> Revisor **fresco**, HEAD `8594d8c`, **só leitura de produção**. Editados apenas este plano e o
> design. Ferramentas: leitura do código citado, `grep -cF` de cada âncora, **três sondas de Zod no
> `node -e`** com o Zod real da base (4.4.3), **uma sonda executada contra o harness**
> (`server/tests/helpers/testApp.js`, `requirePermission` real, SQLite `:memory:` — nunca o banco de
> dev) e **uma rodada de `node tests/api/recebimentoEntradaAtomica.api.test.js`** para confirmar o
> harness (**7 passed, 0 failed**). Total: **17 achados** — **7 travariam a execução**, **7
> silenciosos** (verde vazio, previsão errada de qual asserção cai, ou defeito novo introduzido pelo
> conserto), **3 de ruído**. E **9 afirmações do plano confirmadas**.

### A. Os 7 que travariam a execução

| # | Achado | Onde | Por que travava |
|---|---|---|---|
| **F1** | **`PUT /fiscal` recusa o status `RECEBIDO` antes de olhar qualquer coisa.** `salvarDadosFiscal` só aceita `[ENCAMINHADO_FATURAMENTO, EM_ENTRADA_NF, EM_COMPRAS, CONFERIDO_ALMOX, EM_CONFERENCIA]` | `server/services/almoxarifado/receiptService.js:253-259`; sonda: `POST` → `PUT /fiscal` = `400 {"error":"Dados fiscais só podem ser editados antes do processamento"}`, e `200` depois de `iniciar_conferencia` | **quatro** cenários do plano criavam o documento e atacavam a segunda porta na hora: **T1 (2)**, **T2 (6)**, **T3 (3)**, **T7 passo 4**. O T2 (6) e o T7 passo 4 ficariam **vermelhos antes e depois** do conserto (esperam 409/200, recebem 400), e a metade positiva do T2 (6) era **inalcançável**. Corrigido: todo cenário de `/fiscal` avança por `POST /workflow {acao:'iniciar_conferencia'}` |
| **F2** | **`pedidos_compra` NÃO existe no harness** — nem `initSchema` nem `testApp.js` a criam; só `itens_pedido_compra`, com FK para ela | `server/services/almoxarifado/schema.js:1301` (só a FK); DDL real em `server/index.js:19230-19242`; sonda: `INSERT INTO pedidos_compra` → `SQLITE_ERROR: no such table` | o cenário **T1 (4)** fazia `INSERT` direto e era **previsto verde**. Nasceria vermelho e **continuaria** vermelho depois do conserto. O ⚠️ do plano falava em "coluna NOT NULL", que é o sintoma errado. Corrigido: `CREATE TABLE` no cenário, com `fornecedor_id NOT NULL` como em produção (molde: `solicitacaoCicloVida.api.test.js:103`) |
| **F3** | **`ACAO_PERFIS` nova quebra a suíte de CLIENT.** `permissaoErro.test.js` importa `ACAO_PERFIS` do servidor e exige rótulo próprio para **toda** ação | `client/src/utils/permissaoErro.test.js:44-53` (`expect(semRotulo).toEqual([])`); mapa em `client/src/utils/permissaoErro.js:15+` | a T3 **não tocava** `permissaoErro.js` e **não rodava** suíte de client. O vermelho apareceria na **T5 ou T7**, parecendo regressão do client. É o mesmo defeito do fix-round `7982f18` da Etapa 30 |
| **F4** | **a auditoria nova quebra `auditLabels.api.test.js` — em DUAS asserções.** A varredura com guarda de fronteira (`grep -rhoP "(?<![A-Za-z_])acao: '\K[A-Z_]+"`) pega o literal `EXCEDENTE_AUTORIZADO`, e a de entidades pega `recebimento_item` | `server/tests/api/auditLabels.api.test.js`, cenários *"TODO verbo gravavel tem rotulo"* e *"cobertura das entidades"*, os dois com `deepStrictEqual(semRotulo, [])`. Medido: `rotularAcao('EXCEDENTE_AUTORIZADO')` → o próprio verbo; `rotularEntidade('recebimento_item')` → o próprio nome; `rotularEntidade('recebimento')` → `'Recebimento'` | a T3 não tocava `auditLabels.js` nem rodava esse arquivo isoladamente. Corrigido: os dois rótulos entraram nos `Files` e o arquivo entrou no Step 4 |
| **F5** | **T2 sabotagem 3 (posição da guarda) é NO-OP com a régua como estava escrita** | a régua do cenário (2) é `quantidade_atual === 10` + `COUNT(contas_pagar) === 1`; o segundo documento **nunca é processado** (o POST devolveu 409), então nem o saldo nem as contas mudam quando o `INSERT` do cabeçalho passa a acontecer antes da recusa | a sabotagem que o plano chamava de "a regra 'sabote a posição'" não derrubaria nada. Corrigido: o cenário (1) ganhou `COUNT(*) FROM recebimentos_material_almoxarifado === 1`, que é a asserção que a sabotagem 3 derruba |
| **F6** | **cinco âncoras de sabotagem dão 2 (ou 3) DEPOIS do conserto, e a regra do plano manda abortar quando dá mais de 1** | contado com `grep -cF` no HEAD: `z.looseObject` em `schemas.js` **0→2**; `{ message: TIPO_RECEBIMENTO_INVALIDO }` **→2**; `quantidade_recebida = COALESCE(?, quantidade_recebida)` **1→2**; `await assertNotaNaoDuplicada(` **→2**; `assertExcedentePermitido(` **→3**; `setLoadingDetalhe(false)` **1→2** em cada tela | pior caso, o **T6**: `setLoadingDetalhe(false)` dá 1 **hoje** e esse 1 é o `finally` de `abrirDetalhe` (`:192`). Apagar "a linha" por token solto apagaria o **conserto da Etapa 34** e derrubaria cenários de verdade, produzindo um falso achado num controle declarado como no-op. Corrigido: bloco ancorado por sabotagem, contagem esperada explícita, e a nota de que a contagem é **pós-conserto** |
| **F7** | **T4 sabotagem 2 só sabe produzir 500.** Apagar `if (!t)` faz `t.de.includes(...)` estourar `TypeError` em `undefined` | `receiptService.js:221-225`; o próprio plano admitia "se foi 500, o cenário está medindo o crash" | viola a regra (iv) deste plano ("sabotagem que derruba por `TypeError` não é controle positivo"). Corrigido: a sabotagem passou a alterar a **literal** `'Ação de workflow inválida'` |

### B. Os 7 silenciosos (passariam verdes, ou mediriam outra coisa)

| # | Achado | Evidência |
|---|---|---|
| **S1** | **a guarda de NF duplicada seria INALCANÇÁVEL pelo caminho real da tela.** `handleCriar` **nunca** manda `fornecedor_id`, e o `<select>` de fornecedores só copia nome e CNPJ — com a chave em id/CNPJ, todo lançamento por nome sem CNPJ digitado passa em silêncio | `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js:86-93` (o `form`, sem `fornecedor_id`), `:342-354` (o payload), `:315-325` (`selecionarFornecedor`). **Decisão tomada e registrada na letra B:** terceira perna `UPPER(TRIM(fornecedor_nome))`, cenário `(7)` novo na T2 e sabotagem 5 que o prova. **Descartado:** mandar `fornecedor_id` no payload (acopla tronco de servidor a client, e não cobre o acervo). Regressão re-medida arquivo por arquivo: **nenhum** teste de hoje cria dois documentos com a mesma NF e o mesmo fornecedor pela rota — `alertaEventoJornada` repete `'NF-JOR17-1'` (`:83`/`:103`) no **mesmo** `recId`, coberto pelo `AND id <> ?` |
| **S2** | **T1 não tinha metade positiva na SEGUNDA porta.** O cenário (3) cobre o strip do `POST`; **nenhum** cobria o strip do `PUT /fiscal`. Um `z.object` aplicado só ao `RecebimentoFiscalSchema` não derrubaria nada no arquivo | corrigido: cenário **(6)** (PUT válido grava `nota_serie`/`cfop_nota`/`valor_total_nota`) e sabotagem **1b** que o exercita |
| **S3** | **previsão errada de qual asserção cai, em cinco sabotagens.** T1 nº1 dizia "(1) e (2) continuam verdes" — o **(2) cai**, porque cria um recebimento válido antes de atacar a segunda porta. T1 nº2 dizia que o status vira 200 — vira, mas só **com** a correção de F1. T4 nº1 e nº3 dizem "cai pelo status" — **caem pela literal**: `processarNota` tem barreira própria (`statusPermitidos`, `:678-681`) e devolve 400 de qualquer jeito. T2 nº3, ver F5 | `receiptService.js:678-681`; as cinco previsões foram reescritas com a asserção nomeada correta. É o mesmo tipo de achado que a Fase 2 da Etapa 35 pegou |
| **S4** | **campo de conferência limpo gravaria ZERO.** `Number('')` é `0`, e o input nasce `value={item.quantidade_recebida ?? ''}`: limpar e salvar mandaria `quantidade_recebida: 0`, que o servidor grava (200) e que **dispara** `DIVERGENCIA_RECEBIMENTO` com "0 recebidos" | defeito **novo**, introduzido pela T5. Corrigido: `salvarConferencia` omite o campo vazio, `avisoDivergencia` devolve `null`, e o cenário **(p)** afirma que a chave não está no payload |
| **S5** | **o `/conferir` apaga DUAS colunas hoje, não uma.** Sonda executada: item enviado com `{ id, conferencia_quantidade: true }` responde **200** e deixa `quantidade_recebida = null` **e** `observacoes = null` (o parâmetro é `item.observacoes \|\| null`) | `receiptService.js:189-197`; a régua do T3 (5) só media a quantidade. Corrigido: a observação entrou na asserção. **Confirmado de passagem:** não estoura por `undefined` no bind, e o valor vira `null`, não `0` — a literal do `✗` vai dizer `null` |
| **S6** | **a asserção "o painel contém 187" lê o texto em negrito, não o input.** `textContent` não inclui `value` de `<input>`; o `187` só aparece porque `atualizarItemDetalhe` atualiza `detalhe.itens` e a linha da quantidade re-renderiza | `RecebimentosAlmoxarifado.js:372-377` e `:622`. Passaria — mas a próxima sessão "consertaria" a asserção achando que ela lia o input. Escrito no cabeçalho do cenário (n) |
| **S7** | **a convenção de congelar a lista da ação nova não estava pedida.** Toda ação nova deste módulo desde a Etapa 8 ganha um `deepStrictEqual` da lista no arquivo dela | `planoInspecao.api.test.js:107`, `segundaConferencia:102`, `sucateamento:423`, `toolFundacao:50`, `remessaTerceiroEstados:249`. Sem isso a lista `[ADMINISTRADOR, GESTOR, COMPRAS]` e a **exclusão do ALMOXARIFE** (a decisão 7 do design) mudam sem régua. Corrigido: as três asserções entraram no T3 |

### C. O que a revisão CONFIRMOU (nove afirmações, medidas)

1. **A literal do enum sai exatamente como o plano congelou.** Sonda no `node -e` com o Zod da base:
   `Dados inválidos — tipo_recebimento: forma de recebimento inválida (use NOTA_FISCAL ou PEDIDO_COMPRA)`.
   E o padrão do `z.enum` sai em inglês, palavra por palavra:
   `Invalid option: expected one of "NOTA_FISCAL"|"PEDIDO_COMPRA"`. Zod **4.4.3**, `z.looseObject` é
   `function`.
2. **O strip é real e o `looseObject` resolve.** `z.object(...).safeParse({tipo, nota_fiscal, itens})`
   → `{"tipo_recebimento":"NOTA_FISCAL"}`; `z.looseObject(...)` → o payload inteiro.
3. **O formato do 400 é `{ error }`, não `{ erros: [] }`** — `validation.js:26-28`,
   `` `Dados inválidos — ${formatZodError(...)}` ``, e `formatZodError` junta `caminho: mensagem`
   com `'; '`. As asserções do plano batem.
4. **`can(user, acao)` recebe o USUÁRIO**, não o perfil (`permissions.js:162-166`), e os dois
   escritores já recebem `req.user` (`extended.js:980` e `:1098`) — nenhuma assinatura muda.
   `receiptService.js` ainda **não** importa `permissions`, e o `require` novo **não** fecha ciclo.
5. **`autorizar_excedente` não existe em `ACAO_PERFIS`** (lidas as 27 ações, `permissions.js:21-150`),
   e **nenhum teste de servidor congela o conjunto de chaves** — os dez consumidores afirmam listas
   por ação. `minhasPermissoes.api.test.js:38-40` (booleano para cada ação) e `:88-95` (*"admin pode
   tudo"*) continuam verdes com `ADMINISTRADOR` na lista nova. **A afirmação do plano estava certa.**
6. **`PUT /conferir` é gateada por `receber_material`** — `extended.js:980`, lido, não suposto. E o
   `UPDATE` de item **não tem `COALESCE`** em `quantidade_recebida`/`conferencia_*`/`observacoes`
   (`:189-197`), só em `series`; o molde com `COALESCE` está em `salvarDadosFiscal:320-342`.
7. **O workflow já recusa etapa fora de ordem** (`if (!t.de.includes(rec.status))`, `:223-225`), o
   404 vem **antes** da validação da ação (`:207-208` vs `:222`), e a sequência positiva dá
   exatamente os cinco status que o plano lista (`:211-216`). A T4 **nasce verde e prova algo** —
   com as sabotagens corrigidas para nomear a **literal**.
8. **A fixture do client já serve** (isto derruba a frase "fixture nova obrigatória" do plano, ver
   R1 abaixo), `api.put` é `jest.fn()` sem implementação, `useAlmoxPermissoes` é mockado com
   `pode: () => true`, `toast` é mock, e os helpers `digitar`/`botaoPorTexto`/`painel` existem —
   logo a **T5 sabotagem 4 é mesmo no-op**, como o plano declara.
9. **T6 é mesmo inalcançável.** `loadingDetalhe` tem 3 usos em Recebimentos (`:70`, `:192`, `:591`)
   e 4 em Requisições (`:105`, `:902`, `:904`, `:911`), e **todos** vivem sob o painel aberto —
   `RequisicoesList.js:902` (`disabled={loadingDetalhe}`) está no bloco que morre com o ✕.
   `fecharDetalhe` de Requisições (`:320-326`) de fato **não** zera a flag: o defeito é **gêmeo**, e
   a correção do plano da 35 está certa. **Não há render que leia `loadingDetalhe` com
   `selectedId === null`.**
   E os números de doc conferem: último **B79**, último **C47**, a linha da 08 no mapa é a **917**,
   `tests/api/*.api.test.js` = **169**, e a T8 lista os **7** artefatos.

### D. Ruído (mudado, mas não era defeito de contrato)

- **R1** — *"fixture nova obrigatória: nenhum `DETALHES` tem `EM_CONFERENCIA` com item"*: **falso**.
  `DETALHES[58]` herda `status: 'EM_CONFERENCIA'` de `RECEBIMENTOS[1]` e tem o item `581`
  (`esperada: 200`, `recebida: 200`, `unidade: 'PC'`, `material_id: 9` com `controle_serie: 0`).
  Nada a criar. Deixado escrito porque o plano mandava "confirmar e ajustar", e a próxima sessão
  gastaria o ciclo.
- **R2** — o `AND COALESCE(status,'') NOT IN ('CANCELADO')` da guarda: **código morto**. Não existe
  status `'CANCELADO'` de recebimento (`STATUS`, `receiptService.js:43-55`). Removido, com o motivo.
- **R3** — *"nenhum arquivo de teste cria `contas_pagar`"*: verdadeiro para `tests/api/`, mas
  **`server/tests/almoxarifado.test.js:240-243` cria** — e é o molde. O DDL do plano também omitia
  os dois `NOT NULL` de produção (`descricao`, `valor`, `server/index.js:19299-19311`), o que
  deixaria o teste aceitar um `valor` nulo que produção rejeita. Alinhado com produção.

### E. Veredito

**O plano está pronto para executar**, com as correções acima aplicadas **neste arquivo e no
design**. Nada foi mudado em código de produção. O único ponto que continua sendo **decisão
reversível registrada** (letra B, sem consultar ninguém, como manda o CLAUDE.md) é a **terceira
perna da chave de duplicata** (`fornecedor_nome`): escolhida porque sem ela a regra não é
alcançável pela tela; descartada a alternativa de mandar `fornecedor_id` no payload, que acopla a T2
tronco à T5 galho e não cobre o acervo. O item "o `<select>` passar a mandar `fornecedor_id`" entrou
nas candidatas da **Etapa 37**.

## Onda de correção da revisão final

Onda única, executada depois do fechamento da Fase 2, sobre `b1c9b18..aa39155`. Dois revisores:
o primeiro pela branch inteira (F1–F4), o segundo pela lente das RNs (R2–R7). **Um commit por
achado, TDD em cada um (literal RED antes, GREEN depois), sabotagem com `md5` antes/depois/restore.**
**Nove commits, não oito:** a **re-revisão da onda** achou um Important que a própria onda criou
(**F5**, último da tabela) — é o dado mais forte desta etapa a favor de re-revisar conserto de
CRÍTICO, porque nenhuma das duas lentes originais o teria visto: ele **não existia** quando elas
rodaram.

| # | Commit | O que estava errado, e o que o cenário prova |
|---|---|---|
| **F1** Crítico | `230baf6` | Recebimento com excedente **autorizado** nunca mais salvava dados fiscais: o modal de NF não tem campo de quantidade nem caixa, e reenvia `quantidade_recebida` de todos os itens → 400 eterno, e o `processar` seguinte morria em `validarDadosProcessamento` (documento **preso**). Também atingiria toda linha de acervo com `recebida > esperada` no deploy. Cenários (6)(7)(8) de `recebimentoExcedente`: ecoar 999 sem flag → 200; 999→1000 sem flag → 400; acervo sem trilha ecoado → 200 e sem auditoria inventada. RED: (6) e (8) em `400 !== 200` |
| **F2** Alto | `41df1cb` | `fiscalForm` carregava `tipo_recebimento` e `salvarFiscal` o espalhava no PUT — sem nenhum controle na tela: linha de acervo fora do enum da RN-11 tomava **400 em toda gravação fiscal**, sem saída. O campo saiu do `EMPTY_FISCAL` e do `abrirDetalhe`. Cenário (r) do client: `'tipo_recebimento' in payload === false` com fixture 84 (`'legado'`), metade positiva no mesmo save. RED: `Expected false / Received true` |
| **F3** Médio | `8d7e3b1` | A literal do 400 mandava *"marque a autorização de excedente"* a quem **nunca vê a caixa** (ALMOXARIFE; a ação é de `[ADMINISTRADOR, COMPRAS]`). Literal nova, mesmas variáveis: `Quantidade recebida (<recebida>) maior que a esperada (<esperada>) no item #<id> — a autorização de excedente é de Compras ou do Administrador`. Cópias congeladas atualizadas nos dois testes, no comentário do client e **neste plano e no design** |
| **F4** Baixo | `d585d13` | O comentário do enum afirmava que a desestruturação posicional é segura à reordenação — é o **oposto**. Reescrito para dizer o que a forma garante e o que não garante. Só comentário: **sem régua nova, e isso é declaração** (qualquer asserção passaria dos dois lados) |
| **R2** Importante | `2d7787d` | Mesma raiz na **primeira** porta: depois de um excedente autorizado, todo "Salvar Conferência" 400ava (o ALMOXARIFE não salvava a contagem de **nenhum** outro item) e remarcar a caixa gravava **uma linha nova de `EXCEDENTE_AUTORIZADO` por save**. Regra unificada nas duas portas: barra só quando `recebida > esperada` **E** `recebida > gravada` (aumento). `> gravada`, não `!== gravada`: baixar 25→20 num item de 10 não pede autorização. Cenários (9)(10)(11) + (s) no client (400 → marcar → retry → 200) |
| **R3/R4/R5** Importantes | `c5f14c8` | A chave de fornecedor da guarda de NF era contornável de três jeitos: `UPPER` do SQLite é **ASCII-only** (acento criava documento novo); a **ordem de preferência** fazia identificação mista (só nome × nome+CNPJ) nunca se encontrar; e o CNPJ trimava a coluna, não o parâmetro. Comparação saiu do SQL: candidatos pela NF normalizada + **qualquer perna** em JS (id, CNPJ só-dígitos, nome NFD/upper/trim/espaços colapsados). Cenários (8)(9)(10) de `recebimentoNfDuplicada` |
| **R6** Menor | `d90853d` | `quantidade_esperada: 'abc'` era gravado como **texto** e a barreira da RN-18 dava `continue` — mandar `'abc'` era a forma de **desligar a RN-18** para aquele item. `RecebimentoCreateSchema` ganhou `itens` (`z.looseObject` com `quantidade` positiva e `quantidade_esperada` opcional positiva, `z.coerce`). Cenário (7) de `recebimentoTipoEnum` |
| **R7** Menor | `e287a06` | O aviso dizia *"Divergência: 0 a mais que o esperado (200)"* para `200.001` — a tela afirmando zero enquanto o servidor barrava o save. Abaixo de meio centésimo o aviso mostra até 4 casas. Cenário (t) do client |

### Fix-round 2 — a quebra que a onda introduziu

A re-revisão deu os oito achados como **endereçados** e apontou **uma quebra nova**, criada pela
própria regra correta do R2:

| # | Commit | O que a regra nova destapou |
|---|---|---|
| **F5** Importante | `17c4130` | **A RN-18 ficou contornável de ponta a ponta pela porta de CRIAÇÃO**, que nunca teve barreira: `criarRecebimento` grava `quantidade_recebida = item.quantidade_recebida \|\| qtd` e nunca chamou `assertExcedentePermitido` — a regra tinha **duas** portas, não três. Antes da onda, o `/fiscal` parava esse documento **por acidente** (era o F1: ecoar 999 sobre esperada 10 dava 400, e era isso que travava o documento). Com `> gravada`, ecoar deixou de barrar e o bloqueio acidental caiu junto. Sonda como ALMOXARIFE: `POST` com `quantidade: 10, quantidade_recebida: 999` → **201**, sem trilha, e depois `/fiscal` 200, `/conferir` 200, `finalizar_conferencia` 200. **Não** alcançável pela tela (`handleCriar` manda `recebida = quantidade`); basta um payload de API de qualquer portador de `receber_material`, e a conta a pagar sai maior que o pedido. Fechada onde o item nasce, com as mesmas duas metades; na criação **não há id de item**, então o `#` da literal leva a **posição no payload (1-based)**. As duas literais e a escrita da trilha saíram para **helpers compartilhados pelas três portas**. Cenários (12)(13)(14)(15) de `recebimentoExcedente` |

**Verificação do fix-round 2:** `recebimentoExcedente` **16 passou, 0 falhou**; os 9 arquivos
vizinhos que criam recebimento pela rota, verdes; `npm run test:api` → **174/174 arquivos OK**.
**Sabotagem:** trocada a chamada da barreira por `const excedentesDaCriacao = []` → **(12)(13)(14)
caem** (`13 passou, 3 falhou`; md5 `deb35494 → 9664e569 → deb35494`).

**Ledger da re-revisão, sem ação nesta onda:** `PUT /conferir` **não tem `validate()`** —
pré-existente, `quantidade_recebida: 'abc'` responde 200 e a coluna vira texto (a porta gêmea do R6,
que fechou só a criação). Fica registrado como item **G** para o fechamento.
| **F5** Importante — **achado pela RE-REVISÃO da onda** | `17c4130` (onda de correção; hash no `git log`) | **O conserto certo do CRÍTICO removeu um bloqueio ACIDENTAL, e a régua nova não viu.** Com a regra `recebida > esperada` **E** `recebida > gravada`, um recebimento **criado por API** já com `quantidade_recebida > quantidade_esperada` passa a ter a quantidade **como gravada**: `POST` 999/10 → **201**, `PUT /fiscal` → **200**, `PUT /conferir` → **200**, e o documento fica **processável** — **sem flag, sem permissão e sem uma linha de trilha**. Antes do F1/R2 o `/fiscal` barrava isso **por acidente** (tratava o eco como ato novo), e esse acidente era a única coisa que segurava o caminho. A tela **nunca** produz esse payload, e é justamente por isso que nenhum cenário de client o pegaria. **Conserto:** a barreira passa a valer também em **`criarRecebimento`** — 400 com a literal do excedente sem a flag, 403 nomeando a ação e o perfil sem a permissão, e **201 + trilha por item** quando autorizado. A regra continua sendo a mesma função nas **três** portas |

### Achados da própria onda (o que o controle positivo mostrou e ninguém tinha previsto)

1. **A sabotagem que o revisor previu para R3 não derrubava nada.** Com o cenário (8) escrito só
   com o par acentuado × MAIÚSCULO, remover o strip de diacríticos deixava a suíte **verde**: em JS,
   `'José'.toUpperCase()` e `'JOSÉ'` casam sem strip nenhum (o `toUpperCase` do JS é Unicode-aware;
   o `UPPER` do SQLite **não** é, e era esse o bug). A régua do strip só existe com o par **sem
   acento × com acento**, que foi adicionado ao (8). Sem essa linha, a normalização NFD estaria no
   código sem nenhum teste a exercitá-la.
2. **A primeira sabotagem do cenário (s) do client foi NO-OP**, e está registrada como tal:
   `setAutorizarExcedente(false)` no `catch` não derruba (s), porque a caixa é marcada **depois**
   do erro. A que vale é `abrirDetalhe(detalhe.id)` no `catch` — o refetch "por segurança" apaga a
   quantidade digitada e a recusa da tela, e derruba (s) **e** (o).
3. **Consequência assumida da R3, que tem de chegar ao fechamento:** a consulta da **letra A** que
   mede duplicatas em produção roda em SQL e **não** consegue remover acento em SQLite — ela
   **sub-reporta** as duplicatas por acento. Está dito no design (RN-12) e no relatório da onda.

### Verificação final da onda

`cd server && npm run test:api` → **174/174 arquivos OK**, `15 passed, 0 failed` no último arquivo.
Suíte do client → **47 suites, 707 testes, todos passando**. `CI=true npx react-scripts build` →
**build concluído** (warning-as-error ligado, nenhum warning novo).

> **Estes números são os dos OITO primeiros commits da onda (HEAD `e287a06`).** O **F5** é
> posterior e acrescenta cenários de servidor à porta `criarRecebimento`, então a contagem de
> `test:api` muda — os números finais da etapa são os medidos no commit do fechamento e estão na
> seção `## Fechamento — números medidos`, com a data e o HEAD de cada leitura. Não estão
> **deduzidos** aqui de propósito: a regra zero da `fechar-etapa` é medir.

### Próxima tarefa detalhada

Fechar a etapa pela skill `fechar-etapa`: doc de novidades (letra A com a consulta SQL de
duplicatas **e a ressalva de sub-report por acento**; letra B com as decisões desta onda),
`specs/modulo-almoxarifado/08-*/README.md` com os 8 hashes, a linha do mapa de status, e a seção da
Etapa 36 no `docs/almoxarifado-guia-etapas-e-testes.md` com "Antes → Agora" e roteiro clicável.
Contratos que o fechamento consome, já congelados: o 400 de excedente (F3), as duas literais de
quantidade de item (R6) e o texto de divergência com 4 casas (R7).

---

## Fase 4/5 — Integração e revisão adversarial (2026-09-16)

**Quem revisou, e com que lente.** **Treze passagens** de revisão, nenhuma delas do executor da
própria task:

| Passagem | Quantas | Lente |
|---|---|---|
| **Gate de task** | **7** (T1 a T7) | a task fez o que o plano manda, a régua ficou vermelha antes e verde depois, e o controle positivo derrubou **a asserção que guarda o achado** — não outra |
| **Re-review de task depois de fix-round** | **3** | T3 (`3e36af4`), T5 (`d02744a`) e o gate da T7 |
| **Revisão final de branch** | **2 lentes em paralelo**, sem conversa entre elas | (1) **UX e dados** — o que o operador vê em cada janela, e o que o documento faz depois de recusado; (2) **RN e vacuidade** — RN-11 a RN-19 realmente travadas, cenário negativo com metade positiva, sabotagem que derruba a asserção certa |
| **Re-review da onda de correção** | **1** | releu os oito commits da onda contra o código final — e **achou o F5**, um Important que a própria onda **criou** |

**Veredito das duas lentes finais: NEEDS FIXES nas duas, com 0 ruído** — nenhum achado deixou de
reproduzir, e as duas **convergiram no CRÍTICO** (F1 = R1), cada uma pelo seu caminho. A tabela por
commit, com o vermelho literal de cada sabotagem, está na seção `## Onda de correção da revisão
final` acima; aqui fica o índice com severidade e onde. **As refs de linha abaixo são do HEAD da
revisão (`aa39155`) e já se deslocaram** — a função é o nome que sobrevive, e por isso vem ao lado:

| # | Sev. | Onde (nome + linha no HEAD da revisão) | O quê |
|---|---|---|---|
| **F1 = R1** | **CRÍTICO — as DUAS lentes, independentes** | `client/.../RecebimentosAlmoxarifado.js`, `salvarFiscal` (`:261-288`) → `receiptService.js`, `salvarDadosFiscal` | o modal de NF reenvia `quantidade_recebida` de **todos** os itens e **não tem caixa de autorização**; a barreira tratava o **eco** como ato novo, então o documento com excedente **já autorizado e auditado** tomava 400 para sempre e morria no `processar` — **documento preso** —, e toda linha de acervo com `recebida > esperada` travaria no primeiro deploy. Sonda: COMPRAS autoriza 25/10 → 200; "Salvar Dados Fiscais" com o payload real da tela → 400; "Processar" → 400; ADMIN idem |
| **R2** | Important | `receiptService.js`, `assertExcedentePermitido` (pela porta `/conferir`) | **mesma raiz na primeira porta:** depois do primeiro excedente autorizado, **todo** "Salvar Conferência" seguinte tomava 400 (o payload leva todos os itens), e o ALMOXARIFE não salvava a contagem de **nenhum** outro item do documento; remarcar a caixa gravava **uma linha nova de `EXCEDENTE_AUTORIZADO` por save** |
| **F2** | Important (High) | `RecebimentosAlmoxarifado.js`, `EMPTY_FISCAL` + `abrirDetalhe` (`:195`/`:278`) | o modal ecoava um `tipo_recebimento` que **não consegue editar**: linha de acervo fora do enum da RN-11 tomaria 400 em **toda** gravação fiscal, sem saída pela tela |
| **R3/R4/R5** | Important (R3, R4) + Minor (R5) | `receiptService.js`, `assertNotaNaoDuplicada` | a chave de fornecedor era contornável de **três** jeitos: `UPPER` do SQLite é **ASCII-only** (acento criava documento novo e dobrava estoque); a comparação de **uma perna só** deixava identificação mista passar; CNPJ trimado na coluna e não no parâmetro |
| **F5** | Important — **achado pela re-revisão da onda** | `receiptService.js`, `criarRecebimento` | o conserto certo do CRÍTICO **removeu um bloqueio acidental**: `POST` 999/10 → 201 → fiscal 200 → conferir 200 → processável, **sem flag, sem permissão e sem trilha**. A tela nunca produz esse payload, e por isso nenhum cenário de client o alcançaria |
| **R6** | Minor | `schemas.js`, `RecebimentoCreateSchema` | `quantidade_esperada: 'abc'` era gravado como **texto** e a barreira dava `continue` — mandar `'abc'` era a forma de **desligar a RN-18** para aquele item |
| **F3** | Minor (Medium) | `receiptService.js`, a literal do 400 | mandava *"marque a autorização de excedente"* a quem **nunca vê a caixa** — o ALMOXARIFE, que é quem mais toma esse 400. Gesto impossível |
| **R7** | Minor | `RecebimentosAlmoxarifado.js`, `avisoDivergencia` | *"Divergência: 0 a mais que o esperado (200)"* para `200.001`: a tela afirmando zero enquanto o servidor barrava o save |
| **F4** | Low | `receiptService.js:4-9`, comentário do enum | afirmava que a desestruturação posicional é segura à reordenação — é o **oposto** |

### A lição desta etapa: a Fase 2 não traçou o fluxo do usuário até o fim

O CRÍTICO não é um defeito de implementação de task nenhuma: **cada task fez o que o plano mandou,
e o plano estava certo por porta e errado no fluxo.** A T3 congelou a RN-18 na porta em que o
excedente é autorizado (`/conferir`) e na porta seguinte (`/fiscal`), mas **ninguém seguiu o mesmo
documento até `processar`** — e é no passo seguinte que o payload da tela reaparece **sem** a caixa
de autorização. A Fase 2 revisou 17 achados, sondou Zod, rodou o harness, e ainda assim mediu
**porta por porta**. Três consequências registradas:

1. **A Fase 2 da Etapa 37 já foi instruída a traçar cada RN até o ÚLTIMO gesto do usuário**, não
   até a porta onde a regra mora. Está escrito no despacho da 37, e o design dela nasceu com o
   fluxo traçado até o fim — foi o motivo declarado de a 37 ter design próprio antes de a 36 fechar.
2. **Re-revisar o conserto de um CRÍTICO não é zelo, é a única forma de achar o F5**: o defeito que
   a re-revisão pegou **não existia** quando as duas lentes rodaram. Conserto certo, efeito
   colateral novo.
3. **"A tela nunca manda esse payload" não é defesa.** Os três achados mais graves desta etapa
   (F1, F5 e o R6) vivem exatamente no espaço entre o que a tela manda e o que a porta aceita, e a
   suíte de client, por construção, não olha para lá.

### Parked — foram para a letra G, de propósito

- **A guarda de NF não é airtight**: check-then-insert sem transação; dois `POST` simultâneos com a
  mesma NF passam os dois. Só fecha na migração para Postgres.
- **O enum não é checado no serviço**: `criarRecebimento` chamado direto grava `tipo_recebimento`
  cru. Afirmado por asserção de **caracterização** na T7 — ela congela um comportamento
  **indesejado** e ficará vermelha no dia em que a fronteira for consertada; está rotulada assim no
  próprio teste.
- **A suíte do client mocka `pode: () => true`**, então "esconder por permissão" fica **sem régua** —
  a prova real é o 403 do servidor.
- **`PUT /conferir` não tem `validate()`**: quantidade em **texto** é aceita pela rota (a barreira
  usa `parseFloat` + `isFinite`, então não quebra, mas grava o que vier). Pré-existente, e o R6
  fechou só o lado do `POST`.
- **Resíduo do R7**: diferença abaixo de `0,00005` continua exibindo `0` — o piso agora é 4 casas,
  não infinito.
- **`fornecedor_id` `'0'` casaria coluna nula** na comparação por id (`Number('0') === Number(null)`
  dá `0 === 0`). **Inalcançável pela UI** (não existe fornecedor com id 0), registrado para não ser
  descoberto como surpresa.
- **O 409 do `/fiscal` não chega ao DOM** — só toast, assimétrico com a conferência, que tem
  `role="alert"`.
- **O input "Qtd. conferida" não tem label visível** — só `title`.
- **O 400 do excedente nomeia só o PRIMEIRO item**, enquanto a trilha grava um por item.

---

## Fechamento — números medidos

Os cinco comandos da `fechar-etapa`, com os números **lidos da saída**:

| Comando | Resultado | Quando |
|---|---|---|
| `cd server && npm run test:api` | **174/174 arquivos OK** (169 da Etapa 35 + 5 novos: enum, NF duplicada, excedente, workflow, integração) | onda de correção, HEAD `e287a06` |
| `cd server && npm run test:almoxarifado` | **42 passou, 0 falhou** | T7 (`aa39155`) — o serviço do almoxarifado não foi tocado depois |
| `cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite` | **4/4 · 3/3 · 5/5** | T7 (`aa39155`) |
| `cd client && CI=true npx react-scripts test --watchAll=false` | **47 suítes / 707 testes**, todos passando | onda de correção, HEAD `e287a06` |
| `cd client && CI=true npx react-scripts build` | build concluído, warning-as-error ligado, **nenhum warning novo** | onda de correção, HEAD `e287a06` |

> **Duas ressalvas honestas, em vez de um `[x]` folgado.** (1) Estes números são de **`e287a06`**,
> o oitavo commit da onda; o **F5** é posterior e acrescenta cenários de servidor, então
> `test:api` muda — os números do F5 foram lidos pelo controlador no fechamento, em HEAD `17c4130`:
> `cd server && npm run test:api` → **174/174 arquivos de teste OK** (mesmo total: o F5 acrescentou
> cenários ao arquivo `recebimentoExcedente`, não arquivo novo). O client não foi tocado pelo F5. (2) Os comandos de `server/` que não foram re-rodados na onda estão
> com a data da última execução **e o motivo** escrito na coluna: `test:almoxarifado`,
> `validation`, `safealter` e `sqlite` não têm arquivo tocado pela onda.

**De onde vem o delta.** `test:api`: **169 → 174 arquivos**, os cinco criados por esta etapa
(`recebimentoTipoEnum`, `recebimentoNfDuplicada`, `recebimentoExcedente`,
`recebimentoWorkflowOrdem`, `recebimentoPortasIntegracao`). Client: **699 → 707 testes** na mesma
suíte de 47 — os cenários `(m)(n)(o)(p)(q)` da T5 mais `(r)`, `(s)` e `(t)` da onda, todos em
`RecebimentosAlmoxarifado.test.js`, que foi de 12 para **20 cenários**.

**Hashes citados nos documentos de desenvolvimento, todos conferidos** com
`git merge-base --is-ancestor <hash> HEAD`: `d02b9f4` (T1), `ffc5f47` (T2), `f747df4` + `3e36af4`
(T3 + fix 1), `9d19e7d` (T4), `e2a23a9` + `d02744a` (T5 + fix 1), `5ce3fdf` (T6), `aa39155` (T7),
`230baf6`, `41df1cb`, `8d7e3b1`, `d585d13`, `2d7787d`, `c5f14c8`, `d90853d`, `e287a06` (a onda) —
**16/16 ancestrais de HEAD**. Mais os quatro citados nas correções e no apontamento da próxima
etapa: `4ebd1ce` (etiqueta, Etapa 6c), `2817054` (o "molde" que não era molde), `5f03afc` e
`9790b07` (design e plano da 37) — **20/20**. O hash do **F5** entra quando o commit existir
(marcado como `17c4130` na tabela da onda).

---

## Retro de 4 números

1. **Rodadas de correção até verde: 7 tasks, 5 aprovadas de primeira.** Dois fix-rounds, um em cada
   tronco tocado por revisão: **T3 fix 1** (`3e36af4`, o GESTOR que estava na lista sem ter porta)
   e **T5 fix 1** (`d02744a`, o campo vazio que mandava `conferencia_quantidade: false` e
   desmarcava a conferência de outro item). Depois da revisão final, **uma onda** de correção —
   **oito commits**, um por achado — e **um nono** vindo da re-revisão dessa onda (**F5**). Nenhuma
   task passou de dois rounds.
2. **Achados reais da revisão final: 9 (+1 da re-revisão) = 10.** **1 Critical** (achado pelas
   **duas** lentes independentes), **4 Important** (R2, F2, o par R3/R4 de raiz única, e o **F5** da
   re-revisão), **4 Minor** (R5, R6, F3, R7) e **1 Low** (F4, comentário). **Ruído: 0** — nenhum
   achado deixou de reproduzir, nas duas lentes. **Parked: 9**, todos nomeados na seção acima e
   endereçados à letra G. O dado que mais ensina: **os três achados mais graves vivem no espaço
   entre o payload que a tela manda e o que a porta aceita** — não eram asserções fracas, eram
   fluxos sem cenário.
3. **Paralelismo: 0 galhos em paralelo** — decisão **declarada** no sort topológico desta etapa
   (o tronco T1→T2→T3 compartilha `receiptService.js` e `schemas.js`; mesma árvore, `node_modules`
   fora do git, jest/CRA compartilhados), não omissão. Em paralelo rodaram os **revisores** (2
   lentes finais simultâneas) e, no fechamento, **2 redatores** de documentação (desenvolvimento ×
   usuário), que não compartilham arquivo nenhum. **0 retrabalho por paralelismo.**
4. **Defeito que escapou do fechamento da Etapa 35 e foi pego aqui: as refs de linha.** Três da
   spec 08 (`extended.js:765`, `schema.js:1147`, `receiptService.js:281`) estavam apodrecidas — e a
   primeira **passou a apontar para outra rota**, ou seja, virou mentira e não só velharia. A
   Etapa 35 já tinha corrigido refs assim no seu F3 e **não varreu o resto do arquivo**; a nota da
   T4 desta etapa achou uma quarta (`processarNota` em `receiptService.js:852-855`, e o plano dizia
   `:678-681`). É a **terceira** etapa seguida em que ref de linha aparece como defeito documental,
   e a resposta passou a ser estrutural: citar **nome** de rota, função e `CREATE TABLE`. **E
   dentro desta etapa, o que escapou ao próprio plano:** o design afirmava *"GESTOR → 200"* medindo
   o gate e escrevendo o contrário, e a Fase 2 mediu **porta por porta** em vez de seguir o fluxo
   até o fim — os dois estão ditos de frente, na spec 08 e na seção da Fase 4/5.

---

## Próxima tarefa detalhada — Etapa 37

**Já decidida, desenhada, planejada e COMMITADA** — não há o que escolher no começo da próxima
sessão. A escolha saiu de uma **Fase 0 comparativa medida** entre duas candidatas
(`.superpowers/sdd/etapa37-fase0-candidatos.md`), e não da lista de intuições que o Step 6 deste
plano previa:

- **Design:** `docs/superpowers/specs/2026-09-16-almoxarifado-etapa37-recebimento-contra-pedido-design.md`
  (commit **`5f03afc`**).
- **Plano:** `docs/superpowers/plans/2026-09-16-almoxarifado-etapa37-recebimento-contra-pedido.md`
  (commit **`9790b07`**, já com a **Fase 2** anexada e os briefs gerados).
- **Escopo:** **Etapa 37 — recebimento parcial e excedente CONTRA O PEDIDO DE COMPRA** (feature
  08), com a limpeza dos **21 `ALTER TABLE`** como galho final de risco zero. **8 tasks**: as duas
  colunas + índice + `pedidos_compra` no harness; a barreira de saldo na porta `POST`; o
  acumulador na entrada física; a situação do pedido derivada na leitura; a tela carregando os
  itens do pedido; os 21 `ALTER`; integração; fechamento.
- **Por que B e não A, e isto é o que mais vale reler:** a medição **desmontou a premissa que
  elegia a candidata A**. Os 21 `ALTER TABLE` de `routes/almoxarifado.js:1776-1796` são **todos
  mortos** (o `schema.js` já cria todas as colunas; banco real de 161 MB: **0 colunas ausentes**), e
  o modo de falha real é outro — `initSchema` **não é awaited** (`:238`), então os 21 falham em
  **todo boot** com o erro engolido (`no such table` em banco novo, `duplicate column` em banco
  migrado). Risco de deploy: **zero**; é cleanup de legibilidade, não urgência. Já a candidata B é
  **furo de dado alcançável por HTTP**: um pedido de 10 recebeu 25 em três recebimentos e ficou
  `ABERTO` com `quantidade = 10`; `itens_pedido_compra` tem 8 colunas, **1 leitor e 0 escritores**;
  e a tela **nunca** carrega os itens do pedido, logo o parcial é impossível pela tela. Acervo com
  `COUNT = 0` nas três tabelas — **sem migração de dado**.

**O que a 37 consome desta etapa, já congelado — não reabrir:**

- **`assertExcedentePermitido(db, user, recebimentoId, itens, autorizado)`** em
  `server/services/almoxarifado/receiptService.js`, com a regra unificada `recebida > esperada`
  **E** `recebida > gravada`, a literal do 400
  (*"Quantidade recebida (N) maior que a esperada (E) no item #ID — a autorização de excedente é de
  Compras ou do Administrador"*), o 403 nomeando a ação e o perfil, e a trilha
  `EXCEDENTE_AUTORIZADO` (entidade `recebimento_item`) escrita **só** quando a barreira disparou e
  foi autorizada. A 37 **reusa** esta função na barreira de saldo; não escrever uma segunda.
- **A ação `autorizar_excedente` = `[ADMINISTRADOR, COMPRAS]`** em `ACAO_PERFIS`, com rótulo em
  `client/src/utils/permissaoErro.js` e o verbo em `server/services/almoxarifado/auditLabels.js`.
  **Não alargar `receber_material`** e **não** recolocar o GESTOR: isso é a decisão **B82**, e se o
  negócio disser sim ela pede **rota própria**, etapa própria.
- **`assertNotaNaoDuplicada`** e a normalização de fornecedor (qualquer perna: id, CNPJ só-dígitos,
  nome NFD/upper/trim/espaços colapsados). A 37 não toca nisso — e **não** deve "melhorar" a
  consulta A9 tentando remover acento em SQL: não dá, e a limitação está declarada.
- **Os schemas Zod das portas** (`RecebimentoCreateSchema`, `RecebimentoFiscalSchema`,
  `RecebimentoItemSchema`), todos **`z.looseObject`**. Trocar por `z.object` faz *strip* e quebra
  todo o `POST` — o defeito já apareceu **cinco** vezes neste arquivo e está comentado nele.
- **A barreira do excedente vale nas TRÊS portas** depois do F5 (`criarRecebimento`, `/conferir`,
  `/fiscal`). O que a 37 acrescenta é coisa **diferente**: o saldo **contra o pedido de compra**,
  que é comparação com `itens_pedido_compra` e não com a `quantidade_esperada` do próprio
  documento. **Não confundir as duas regras** — a literal da 37 é outra (*"… maior que o saldo do
  pedido (4) para o material …"*), e o F5 **não** torna a 37 desnecessária: ele fecha o excedente
  sobre a esperada do próprio documento, não o saldo do pedido.

**Specs erradas que a Fase 0 da 37 já achou e que a 37 tem de corrigir DIZENDO que estavam
erradas:** `specs/modulo-almoxarifado/00-*/README.md:31` aponta `~1018-1038` (hoje são rotas de
conferência) e diz que *"vários duplicam"* quando são **todos** os 21; a premissa *"o `ALTER` é
origem única → 500 em produção"* é **falsa**; e o manual (14.1) promete itens do pedido *"já
preenchidos"* que a tela **não mostra**.
