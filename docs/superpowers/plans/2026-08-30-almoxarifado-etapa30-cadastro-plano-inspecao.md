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

## Regras de negócio

| RN | Enunciado | Onde é provada |
|---|---|---|
| RN-01 | A ação *Plano de inspeção* aparece em toda linha da lista de Materiais e abre o modal **daquele** material; sem `gerenciar_plano_inspecao`, `bloquearSeNaoPode` barra **antes** do formulário e o modal **não abre** | Jest `MateriaisAlmoxarifado` |
| RN-02 | O modal lê com **`?todos=1`** e mostra ativas e inativas separadas, cada uma com a faixa `[nominal+inf ; nominal+sup]` | Jest `PlanoInspecaoModal` |
| RN-03 | Criar exige característica e valor nominal; **`0` é nominal VÁLIDO** (não pode ser recusado pela tela); desvio em branco vai como `0`; recusa do servidor vai **literal** ao toast e a linha **continua preenchida** | Jest (**peso**: o cenário do nominal `0`) |
| RN-04 | Editar manda **só os campos alterados**; a faixa é validada pelo servidor sobre a **mistura**, e um `desvio_inferior` sozinho que inverta a faixa recusa com *"O desvio inferior não pode ser maior que o superior"* | Jest |
| RN-05 | Desativar chama `DELETE`, a linha migra para o bloco de inativas **sem recarregar a lista inteira**, e `{ ja_inativo: true }` não é tratado como erro | Jest |
| RN-06 | Reativar (`PUT { ativo: 1 }`) é **barrado na tela** se já houver uma **ativa** com o mesmo nome, com mensagem que **nomeia** o conflito; se a corrida acontecer mesmo assim, o **400 do servidor** aparece literal | Jest (**peso**: as duas metades) |
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

**C3 — `PUT /api/almoxarifado/planos-inspecao/:id`** (`:360`, mesmo gate). **404
*"Plano de inspeção não encontrado"***. **Preserve-when-omitted em todos os campos, `ativo`
incluído** — logo `{ ativo: 1 }` **reativa** e `{ valor_nominal: 9 }` **não** ressuscita uma
inativa. **`material_id` NÃO é editável, de propósito.** A faixa é validada sobre a **mistura**
(enviado + preservado). Colisão de nome → 400 *"Já existe esta característica no plano deste
material"*.

**C4 — `DELETE /api/almoxarifado/planos-inspecao/:id`** (`:429`, mesmo gate). **Soft delete**
(`ativo = 0`) porque `medidas_inspecao_almoxarifado.plano_id` é `NOT NULL` e apagar deixaria medida
órfã. Inexistente → **404**; **já inativa → 200 `{ success: true, ja_inativo: true }`**, sem
auditar. **A tela não pode tratar `ja_inativo` como erro.**

**C5 — Front, `PlanoInspecaoModal.js`** (novo). Props: `material` (`{ id, codigo, nome, unidade }`)
e `onClose`. Abre chamando C1 com `{ params: { material_id, todos: 1 } }`. Renderiza: bloco
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
| 3 | Integração pela rota: `planoInspecaoTela.api.test.js` — criar/editar/desativar/**reativar** e a **colisão de reativação**, tudo por HTTP, mais a leitura `?todos=1` | **tronco** | — |

As 1 e 2 são arquivos disjuntos e rodam em paralelo. A 3 é backend puro e independente das duas —
ela existe porque **nenhum dos 22 cenários da Etapa 27 exercita reativar nem a colisão da
reativação**, que é justamente a RN-06 desta etapa. Medir isso é a diferença entre a RN-06 estar
provada e estar suposta.

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
Controle positivo: trocar `formatarFaixa` por soma sem `toFixed` → (1) cai; tirar o `todos: 1` →
(1) cai nas inativas; tratar `ja_inativo` como erro → (6) cai; remover a checagem da RN-06 →
(7) cai **na ausência da chamada**, não só no toast.

Commit: `Almoxarifado Etapa 30 Task 1: o plano de inspecao ganha tela de cadastro`.

## Task 2 — A ação na lista de Materiais (galho)

Arquivo: `client/src/components/almoxarifado/MateriaisAlmoxarifado.js` + `.test.js`.
Jest: (1) o botão aparece em toda linha e abre o modal **do material da linha** (afirmar o
`material_id` que chegou ao C1 — com **duas** linhas na fixture, materiais diferentes, senão o
cenário passa com o id errado); (2) sem permissão, `bloquearSeNaoPode` barra e o modal **não**
abre. Controle positivo: passar `m` fixo em vez do da linha → (1) cai.

Commit: `Almoxarifado Etapa 30 Task 2: a lista de materiais abre o plano de inspecao`.

## Task 3 — Reativar e a colisão, pela rota (tronco)

Arquivo novo: `server/tests/api/planoInspecaoTela.api.test.js`. Tudo por HTTP:
criar duas características → `?todos=1` traz as duas → desativar uma → sem `todos` some, com
`todos=1` continua com `ativo: 0` → **reativar** com `PUT { ativo: 1 }` → volta às ativas →
**recriar o nome de uma desativada** e tentar reativar a antiga → **400 literal** → `PUT
{ valor_nominal: 9 }` numa inativa **não** a ressuscita (preserve-when-omitted) → `DELETE` de
inativa → `200 { ja_inativo: true }`, **sem linha nova na Auditoria** → usuário sem
`gerenciar_plano_inspecao` toma **403** nas quatro escritas e **200** na leitura.
Controle positivo: fazer o `ativo` do PUT cair para 1 quando omitido → o cenário do
`valor_nominal: 9` cai; tirar o `AND ativo = 1` do DELETE → o cenário do `ja_inativo` cai.

Commit: `Almoxarifado Etapa 30 Task 3: reativar caracteristica e a colisao do nome, pela rota`.

## Fechamento

`fechar-etapa`: novidades (seção da Etapa 30; a correção da afirmação errada do plano da 29 **fica
à vista**; decisões D1/D2/D4 na letra B se alguma virar escolha reversível relevante), spec 09
(item 5 de "falta para 🟢" marcado com hash; **a feature pode virar 🟢?** — medir: sobram não
conformidade formal, desvio autorizado, anexos e encaminhamento com status, então **não**), mapa,
guia (roteiro **sem nenhum `curl`** — é o ponto da etapa), manual (§15.2.1: "o cadastro do plano
ainda não tem tela" **deixa de valer** e tem de ser reescrito, não anotado), retro.
