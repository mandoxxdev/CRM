# Etapa 30 — Cadastro do plano de inspeção pela tela (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** o plano de inspeção deixa de nascer por `curl`. A lista de **Materiais** ganha a ação
*Plano de inspeção*, que abre um modal onde se cria, edita, desativa e reativa característica —
com a faixa resultante à vista enquanto se digita.

**Architecture:** **nenhuma linha de backend novo.** O CRUD existe, testado, desde a Etapa 27
(`planoInspecao.api.test.js`, 22 cenários). Esta etapa é **só front**: um componente novo
`PlanoInspecaoModal.js` e uma ação por linha em `MateriaisAlmoxarifado.js`.

**Spec:** `docs/superpowers/specs/2026-08-30-almoxarifado-etapa30-cadastro-plano-inspecao-design.md`.
Feature: `specs/modulo-almoxarifado/09-inspecao-qualidade/README.md` (item 5 de "O que falta
para 🟢", criado no fechamento da Etapa 29).

> **REESCRITO PELA FASE 2** (7 correções obrigatórias + 4 melhorias, todas medidas contra o código
> pelo revisor): (1) a mensagem do 404 do PUT/DELETE é ***"Característica não encontrada"***, não
> "Plano de inspeção não encontrado"; (2) faltavam **três** recusas do PUT, uma delas
> (***"Desvio inválido"***) inexistente no plano inteiro; (3) **"desvio em branco vira 0" é FALSO
> no PUT** — o POST tem `?? 0`, o PUT **não**, e o modal edita por PUT: `desvio_inferior: ''` dá
> **400**; (4) a RN-06 não dizia com que comparação a tela barra, e o índice do SQLite é
> **BINARY** — qualquer `toLowerCase`/`normalize` faria a tela barrar o que o servidor aceita;
> (5) a justificativa da Task 3 era **factualmente falsa** (o cenário 16 da Etapa 27 **já**
> reativa) e o arquivo novo duplicaria ~80% de um existente; (6) o controle positivo do
> `formatarFaixa` é **no-op** com a fixture unilateral — as duas somas dão idêntico; (7) o
> controle positivo do `todos: 1` **não derruba as inativas**, porque o mock desta base ignora
> params. Onde diz "ESTAVA ERRADO", vale a versão atual.

## Global Constraints

1. `python3`, nunca `python`; `sed` só com âncora contada (`grep -cF` = 1); `grep` de raiz
   truncada em palavra acentuada devolve zero — teste a régua contra um caso que existe.
2. **COMMITE ANTES DE SABOTAR.** Controle positivo com alvo, `md5sum` antes/depois/restaurado
   (**restaure por CÓPIA, nunca `git checkout --`** — na Etapa 29 o checkout engoliu junto uma
   correção que ainda não estava commitada), `git diff --stat` vazio, lendo **qual asserção** caiu.
3. Não escreva no banco de desenvolvimento. Nunca `git add -A`. Commit em português, corpo sem
   acento, `git commit -F` com nome único no scratchpad.
4. Front: `MateriaisAlmoxarifado.test.js` e `InspecoesAlmoxarifado.test.js` são o molde de mock
   (`api`, `toast`, `useAlmoxPermissoes`); mock **só** na fronteira HTTP.
5. **A faixa vem de `formatarFaixa` em `client/src/components/almoxarifado/faixaTolerancia.js`.**
   Não recopiar: a Etapa 29 acabou de fundir duas cópias que **já divergiam**. Soma **COM SINAL**,
   casas decimais do plano.
6. **Nenhuma comparação de tolerância no client.** Exibir a faixa é aritmética; decidir conforme
   é do servidor. (Isto **não** contradiz o D3: o que a B60 proibiu foi pré-visualizar o
   **veredito**, não a faixa.)
7. **Fixture assimétrica em toda dimensão que o código diferencia.** É a lição medida da Etapa 29:
   cinco testes passavam com a feature quebrada por fixture simétrica ou exatamente representável.
   Duas características com desvios iguais, ou um de/para que muda um campo só, não ancoram nada.
   **Concretamente aqui:** a fixture do cenário que ancora a faixa **tem de conter `1.1 ±0.1`** —
   a Fase 2 mediu que `10 +0.005/+0.021`, `10 ±0.05` e `0/0/0` dão **idêntico** com e sem
   `toFixed`, ou seja, o controle positivo prometido sobre a unilateral era **no-op**.
8. **O mock de `api.get` desta etapa é PARAMS-AWARE.** O molde da base
   (`MateriaisAlmoxarifado.test.js:75`, `InspecoesAlmoxarifado.test.js:94`) é
   `mockImplementation((url) => …)` e **ignora os params** — com ele, tirar o `todos: 1` não muda
   uma linha renderizada, e o controle positivo prometido não prova nada. Aqui o mock **tem de
   filtrar**: devolver só `ativo === 1` quando `params.todos !== 1`. É essa forma que prova a
   RN-02.
9. **Cenário negativo carrega a metade positiva NO MESMO teste.** "O modal não abre" passa igual
   se o botão não existir, se o `onClick` estiver vazio ou se o componente nunca tiver sido
   montado — é o buraco que o cabeçalho de `planoInspecao.api.test.js` já documenta ("matriz que
   só afirma 403 passa com a rota morta").

## Regras de negócio

| RN | Enunciado | Onde é provada |
|---|---|---|
| RN-01 | A ação *Plano de inspeção* aparece em toda linha da lista de Materiais e abre o modal **daquele** material; sem `gerenciar_plano_inspecao`, `bloquearSeNaoPode` barra **antes** do formulário e o modal **não abre** | Jest `MateriaisAlmoxarifado` |
| RN-02 | O modal lê com **`?todos=1`** e mostra ativas e inativas separadas, cada uma com a faixa `[nominal+inf ; nominal+sup]` | Jest `PlanoInspecaoModal` |
| RN-03 | Criar exige característica e valor nominal; **`0` é nominal VÁLIDO** (não pode ser recusado pela tela); campo de desvio **em branco vira o número `0`, nunca `''`** (ver RN-09); recusa do servidor vai **literal** ao toast e a linha **continua preenchida** | Jest (**peso**: o cenário do nominal `0`) |
| RN-04 | Editar manda **só os campos alterados**; a faixa é validada pelo servidor sobre a **mistura**, e um `desvio_inferior` sozinho que inverta a faixa recusa com *"O desvio inferior não pode ser maior que o superior"* | Jest |
| RN-09 | **A tela nunca envia `''` nem `null` num campo numérico.** O POST tem `?? 0` e o PUT **não** — no PUT, `desvio_inferior: ''` responde **400 *"Desvio inválido"***. Campo de desvio limpo vira `0` (numérico) ou é **omitido**; `valor_nominal` limpo é bloqueado **na tela**, porque o 400 que o servidor devolve (*"Valor nominal é obrigatório"*) é enganoso na frente de um campo preenchido | Jest (**peso**: o PUT com desvio limpo) |
| RN-10 | **Vírgula decimal é convertida pela tela antes de enviar** (`10,5` → `10.5`), porque `paraNumeroFinito` **não** troca vírgula e devolveria *"Valor nominal é obrigatório"* com o campo preenchido na frente do usuário — enquanto a faixa ao lado já mostraria `[10.4 ; 10.6]`, porque `formatarFaixa` **troca**. Se depois da troca ainda não for número finito, a tela **recusa com mensagem própria** e não chama a API | Jest |
| RN-05 | Desativar chama `DELETE`, a linha migra para o bloco de inativas **sem recarregar a lista inteira**, e `{ ja_inativo: true }` não é tratado como erro | Jest |
| RN-06 | Reativar (`PUT { ativo: 1 }`, com `1` **numérico** — `'0'` string reativaria, porque a rota faz `req.body.ativo ? 1 : 0`) é **barrado na tela** se já houver uma **ativa** com o mesmo nome, com mensagem que **nomeia** o conflito e **sem chamar a API**; se a corrida acontecer mesmo assim, o **400 do servidor** aparece literal. **A comparação é `===` sobre a string como está armazenada — sem `toLowerCase`, sem `normalize`, sem `localeCompare`, sem re-trim.** Medido na Fase 2: o índice do SQLite é **BINARY**, então `"RUGOSIDADE x"` ao lado de `"Rugosidade x"` é **aceito** (201), e `média`/`media` também; só as pontas coincidem, e porque a **rota** faz `trim` (dos dois lados). Qualquer comparação "amigável" faz a tela **barrar o que o servidor aceitaria** — e aí a régua duplicada deixa de ser exatamente reproduzível e vira a mesma classe de defeito da B60 | Jest (**peso**: as duas metades **e** o caso maiúsculas) |
| RN-07 | A faixa exibida usa `formatarFaixa`; `10 +0.005/+0.021` → `[10.005 ; 10.021]`, `1.1 ±0.1` → `[1.0 ; 1.2]` | Jest |
| RN-08 | Falha ao carregar o plano **não** vira "plano vazio": estado de erro com a mensagem do servidor e **Tentar de novo** (a régua que a Etapa 29 teve de aprender no Histórico) | Jest |

## Contratos congelados (LIDOS no código, não deduzidos)

**C1 — `GET /api/almoxarifado/planos-inspecao?material_id=&todos=1`** (`extended.js:292`, `auth`
só). Sem `material_id`: **400 `{ error: 'Material é obrigatório' }`**. `?todos=1` **omite** o
`AND ativo = 1`; qualquer outro valor filtra as ativas. `ORDER BY caracteristica`. Devolve
`SELECT *`: `{ id, material_id, caracteristica, unidade, valor_nominal, desvio_inferior,
desvio_superior, ativo, created_at }`.

**C2 — `POST /api/almoxarifado/planos-inspecao`** (`:312`, gate `gerenciar_plano_inspecao`).
Corpo `{ material_id, caracteristica, unidade?, valor_nominal, desvio_inferior?, desvio_superior? }`.
**201** com o registro. Recusas, literais:

| Situação | Código | Mensagem |
|---|---|---|
| `material_id` ausente/não numérico | 400 | *"Material é obrigatório"* |
| Material inexistente | 404 | *"Material não encontrado"* |
| Característica vazia | 400 | *"Característica é obrigatória"* |
| `valor_nominal` ausente/não numérico | 400 | *"Valor nominal é obrigatório"* |
| `desvio_inferior > desvio_superior` | 400 | *"O desvio inferior não pode ser maior que o superior"* |
| Nome já ativo naquele material | 400 | *"Já existe esta característica no plano deste material"* |

**`0` é nominal legítimo** — a checagem é `=== null`, não falsy (comentário no próprio código:
batimento, planeza, folga). **Desvio omitido vira `0`**, e os dois zerados é faixa de largura zero,
**válida**.

**C3 — `PUT /api/almoxarifado/planos-inspecao/:id`** (`:360`, mesmo gate).

> **Este bloco dizia `404 "Plano de inspeção não encontrado"`. ESTAVA ERRADO** — a constante é
> `PLANO_NAO_ENCONTRADO = 'Característica não encontrada'` (`extended.js:290`), medido:
> `PUT /planos-inspecao/999888` → `404 {"error":"Característica não encontrada"}`. **O C4 (DELETE)
> usa a MESMA constante** — o que o plano também não dizia, e um executor inventaria outra.

**404 *"Característica não encontrada"***. **Preserve-when-omitted nos SEIS campos que a rota
escreve** (`caracteristica`, `unidade`, `valor_nominal`, `desvio_inferior`, `desvio_superior`,
`ativo`) — **nenhum foge da regra** —, logo `{ ativo: 1 }` **reativa** e `{ valor_nominal: 9 }`
**não** ressuscita uma inativa. **`material_id` NÃO é editável, de propósito.** A faixa é validada
sobre a **mistura** (enviado + preservado).

**Recusas do PUT — três delas faltavam no plano, e a primeira não aparecia em lugar nenhum:**

| Situação | Código | Mensagem | Onde |
|---|---|---|---|
| `desvio_*` **presente** e não numérico (inclui `''` e `null`) | 400 | ***"Desvio inválido"*** | `:380-382` |
| `caracteristica` enviada vazia ou só espaços | 400 | *"Característica é obrigatória"* | `:370` |
| `valor_nominal` enviado e não numérico | 400 | *"Valor nominal é obrigatório"* | `:374` |
| Faixa invertida na mistura | 400 | *"O desvio inferior não pode ser maior que o superior"* | `:386` |
| Nome já ativo naquele material | 400 | *"Já existe esta característica no plano deste material"* | `catch UNIQUE` |

> **⚠️ A armadilha que o plano anterior montava sozinho.** O POST tem `paraNumeroFinito(...) ?? 0`
> (`:329`); **o PUT não tem** (`:377-382`). Medido lado a lado:
> `POST desvio_inferior: ''` → **201** com `desvio_inferior: 0`; `PUT desvio_inferior: ''` →
> **400 *"Desvio inválido"***. Como a RN-03 dizia "desvio em branco vai como 0" e a RN-04 dizia
> "manda só os campos alterados", o executor mandaria `''` num PUT e o formulário quebraria no
> caso mais banal: limpar um desvio para zerá-lo. Virou a **RN-09**.

**Bordas medidas na Fase 2, para a tela não descobrir em produção:** `unidade: ''` é gravado como
**`null`** (renderizar `null`, nunca a string `"null"`); `ativo: '0'` **string** no PUT
**reativa** (`req.body.ativo ? 1 : 0`) — mandar número; **POST e PUT não devolvem `created_at`**
(o objeto de resposta é montado à mão), e o GET ordena `ORDER BY caracteristica`, então **inserir
a resposta do POST no fim da lista deixa a linha fora da ordem** que um reload mostraria — ordenar
localmente depois de inserir; `GET material_id=abc` → 400.

**C4 — `DELETE /api/almoxarifado/planos-inspecao/:id`** (`:429`, mesmo gate). **Soft delete**
(`ativo = 0`) porque `medidas_inspecao_almoxarifado.plano_id` é `NOT NULL` e apagar deixaria medida
órfã. Inexistente → **404 *"Característica não encontrada"*** (a mesma constante do PUT);
**já inativa → 200 `{ success: true, ja_inativo: true }`**, sem auditar. **A tela não pode tratar
`ja_inativo` como erro.**

**C5 — Front, `PlanoInspecaoModal.js`** (novo). Props: **o OBJETO** `material`
(`{ id, codigo, nome, unidade }`) e `onClose`.

> **Isto DIVERGE do molde da base de propósito, e a divergência tem de estar dita aqui** ou a
> Task 2 vira retrabalho: `ExtratoMaterialModal` e mais cinco modais desta base
> (`MateriaisAlmoxarifado.js:415`, `ReservasAlmoxarifado.js:615`, `SobrasAlmoxarifado.js:1228`,
> `MovimentacoesAlmoxarifado.js:943`) recebem `materialId` **escalar**. Aqui é o objeto porque o
> cabeçalho do modal mostra **código, nome e unidade** — e a linha da lista já os tem
> (`MateriaisAlmoxarifado.js:284`). Um agente que "segue o molde" escreveria `materialId`. Abre chamando C1 com `{ params: { material_id, todos: 1 } }`. Renderiza: bloco
**Ativas** (linhas editáveis, cada uma com a faixa e os botões *Salvar* e *Desativar*), a **linha
nova** em branco no fim (botão *Adicionar*), e o bloco **Inativas** (colapsado, com *Reativar*).
Erro do C1 → RN-08.

**C6 — Front, `MateriaisAlmoxarifado.js`**: mais um `almox-btn-icon` na coluna de ações, com
`title="Plano de inspeção"`, `onClick={(e) => { if (!bloquearSeNaoPode('gerenciar_plano_inspecao', e)) return; setPlanoMaterial(m); }}` — o mesmo molde de `extratoMaterialId`/`etiquetas`.

## Sort topológico

| # | Task | Tipo | Depende |
|---|---|---|---|
| 1 | `PlanoInspecaoModal.js` + `PlanoInspecaoModal.test.js` (C5, RN-02..08) | **galho** — arquivo novo | contratos C1–C4 (já existem) |
| 2 | Ação na linha de Materiais (C6, RN-01) + Jest em `MateriaisAlmoxarifado.test.js` | **galho** — arquivo distinto | contrato C5 (prop `material`) |
| 3 | **Um cenário (23)** acrescentado a `planoInspecao.api.test.js`: a **colisão da reativação** | **tronco** curto | — |

As 1 e 2 são arquivos disjuntos e rodam em paralelo (com C5 fixado como objeto, acima). A 3 é
backend puro e independente das duas.

> **A Task 3 dizia: "arquivo novo `planoInspecaoTela.api.test.js`, porque nenhum dos 22 cenários
> da Etapa 27 exercita reativar nem a colisão da reativação". A JUSTIFICATIVA ERA FALSA** e a
> Fase 2 mediu: o cenário **(16)** (`planoInspecao.api.test.js:376`) faz exatamente
> `PUT { ativo: 1 }` e afirma 200. E o roteiro proposto era quase inteiro re-execução —
> `?todos=1`/desativar/some/volta é o cenário **(17)**; `PUT { valor_nominal: 9 }` não ressuscita
> é o **(16)**; `DELETE` de inativa → `ja_inativo` **sem linha nova de auditoria** é o **(18)**,
> que já conta as linhas; 403/200 por perfil é o **(22)**. Os dois controles positivos prometidos
> cairiam **também** no arquivo da Etapa 27 — ou seja, não provariam o arquivo novo. Um arquivo
> novo aqui seria **uma segunda porta para a mesma prova**.
> **O que é genuinamente novo é UM cenário**, e ele é real (medido): recriar o nome de uma
> desativada (**201**) e então reativar a antiga → **400 *"Já existe esta característica no plano
> deste material"***.
> **Correção adicional:** o plano dizia "403 nas **quatro** escritas". São **três** rotas de
> escrita (POST, PUT, DELETE).

## Task 1 — `PlanoInspecaoModal` (galho)

Arquivos novos: `client/src/components/almoxarifado/PlanoInspecaoModal.js` e `.test.js`.
Jest: (1) abre chamando C1 com `todos: 1` e lista ativas e inativas separadas, com as faixas;
(2) **nominal `0` é aceito pela tela** e chega ao payload como `0` (não some, não vira `''`);
(3) desvio em branco vai como `0`; (4) recusa do servidor vai literal ao toast e a linha continua
preenchida; (5) editar manda **só** o campo alterado; (6) desativar chama `DELETE` e a linha migra
para inativas; `{ ja_inativo: true }` **não** é erro; (7) reativar com nome já ativo é barrado na
tela, com a mensagem nomeando o conflito, **e sem chamar o `PUT`**; (8) reativar sem conflito
chama `PUT { ativo: 1 }`; (9) o 400 do servidor na reativação (corrida) aparece literal;
(10) RN-08: falha do C1 mostra o estado de erro e **Tentar de novo**, nunca "plano vazio".
(11) RN-09: limpar o campo de desvio numa linha existente envia **`0` numérico**, nunca `''`
(o PUT responderia 400 *"Desvio inválido"*); (12) RN-10: digitar `10,5` no nominal chega ao
payload como `"10.5"`/`10.5`, e um valor que não vira número (`10,5,5`) **não chama a API** e
mostra mensagem própria.

**Controles positivos — dois dos prometidos na versão anterior eram NO-OP, e a Fase 2 provou:**

| Sabotagem | Cai em | Observação |
|---|---|---|
| `formatarFaixa` → soma crua sem `toFixed` | (1) | **Só se a fixture contiver `1.1 ±0.1`.** Medido: `[10, 0.005, 0.021]`, `[10, -0.05, 0.05]` e `[0,0,0]` dão **idêntico** nas duas formas — a fixture unilateral que o plano destacava **não derruba nada** |
| tirar o `todos: 1` da chamada | (1), nas **inativas** | **Só com o mock params-aware** (Global Constraint 8). Com o molde da base, que ignora params, as inativas continuam vindo e o que cai é a asserção de params — asserção diferente da que guarda o achado |
| tratar `ja_inativo` como erro | (6) | — |
| remover a checagem da RN-06 | (7) | tem de cair **na ausência da chamada ao `PUT`**, não só no toast |
| comparar nomes com `toLowerCase()` | (7), caso maiúsculas | prova que a régua é `===` cru |
| enviar `''` em vez de `0` no desvio limpo | (11) | — |

Commit: `Almoxarifado Etapa 30 Task 1: o plano de inspecao ganha tela de cadastro`.

## Task 2 — A ação na lista de Materiais (galho)

Arquivo: `client/src/components/almoxarifado/MateriaisAlmoxarifado.js` + `.test.js`.
Jest: (1) o botão aparece em toda linha e abre o modal **do material da linha** (afirmar o
`material_id` que chegou ao C1 — com **duas** linhas na fixture, materiais diferentes, senão o
cenário passa com o id errado); (2) sem permissão, `bloquearSeNaoPode` barra e o modal **não**
abre — **com a metade positiva no mesmo teste** (Global Constraint 9): o botão **existe** e
`bloquearSeNaoPode` **foi chamado com `'gerenciar_plano_inspecao'`**, senão o cenário passa igual
com o botão ausente, com o `onClick` vazio ou com o modal nunca montado.

> **Trabalho não previsto na versão anterior:** o `jest.mock('../../hooks/useAlmoxPermissoes')` de
> `MateriaisAlmoxarifado.test.js:34-38` é factory **estática** (`bloquearSeNaoPode: () => true`).
> Testar a metade negativa exige torná-la **variável por teste**, o que toca os 5 cenários já
> existentes do arquivo. Está dito aqui para não ser descoberto no meio da task.

Controle positivo: passar `m` fixo em vez do da linha → (1) cai; devolver `true` sempre no
`bloquearSeNaoPode` variável → (2) cai.

Commit: `Almoxarifado Etapa 30 Task 2: a lista de materiais abre o plano de inspecao`.

## Task 3 — A colisão da reativação, pela rota (tronco curto)

**Arquivo EXISTENTE**, não um novo: um cenário **(23)** em
`server/tests/api/planoInspecao.api.test.js` (22 → 23). Tudo por HTTP:

criar *"Rugosidade"* → `DELETE` (soft) → **recriar *"Rugosidade"*** (201 — o índice é parcial e o
nome ficou livre) → **`PUT { ativo: 1 }` na antiga** → **400 *"Já existe esta característica no
plano deste material"*** → e a metade positiva no mesmo cenário: `GET ?todos=1` mostra a antiga
**ainda `ativo: 0`** e a nova `ativo: 1` (senão o 400 poderia vir de qualquer outra coisa).

**Controle positivo:** tirar o `WHERE ativo = 1` do índice único parcial (em `schema.js`, num
banco de teste) → a **recriação** passa a falhar antes, e o cenário cai **na criação**, não na
reativação — o que **não** serve; a sabotagem certa é fazer o `catch` do `UNIQUE` do PUT devolver
500 em vez do 400 literal, e o cenário tem de cair **na mensagem**. Se a primeira sabotagem for
usada por engano, o vermelho aparece no lugar errado — exatamente o modo de falha que a
`fechar-etapa` descreve ("leia QUAL asserção caiu, não só o placar").

Commit: `Almoxarifado Etapa 30 Task 3: a colisao da reativacao de caracteristica, pela rota`.

## Fechamento

`fechar-etapa`: novidades (seção da Etapa 30; a correção da afirmação errada do plano da 29 **fica
à vista**; decisões D1/D2/D4 na letra B se alguma virar escolha reversível relevante), spec 09
(item 5 de "falta para 🟢" marcado com hash; **a feature pode virar 🟢?** — medir: sobram não
conformidade formal, desvio autorizado, anexos e encaminhamento com status, então **não**), mapa,
guia (roteiro **sem nenhum `curl`** — é o ponto da etapa), manual (§15.2.1: "o cadastro do plano
ainda não tem tela" **deixa de valer** e tem de ser reescrito, não anotado), retro.
