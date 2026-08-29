# Etapa 27 — Plano de inspeção com medidas (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** a inspeção de recebimento deixa de ter uma caixa "divergência dimensional" marcada à
mão e passa a ter plano, medidas e instrumento — com a divergência **derivada do número**, e com
instrumento descalibrado impedido de medir.

**Architecture:** duas tabelas novas, uma função pura para a régua da tolerância, o CRUD do plano
e a gravação das medidas dentro de `decidirInspecao`.

> **REESCRITO PELA FASE 2** (15 achados, **3 bloqueantes**): a régua reprovava 12,3% das peças no
> limite por ponto flutuante; as recusas novas rodariam **depois** do saldo se mover; e as
> medidas gravadas em laço criariam o ato parcial que a Etapa 23 consertou. Mais: o gate excluía
> quem define tolerância, o modelo de tolerância era invenção minha e não cobria o caso
> unilateral, e faltava contrato de endpoint. Onde diz "ESTAVA ERRADO", vale a versão atual.

**Spec:** `docs/superpowers/specs/2026-08-29-almoxarifado-etapa27-plano-de-inspecao-design.md`

## Global Constraints

1. **Use `python3`, nunca `python`** (o alias não existe). Ou `sed` contando a âncora antes
   (`grep -cF` = exatamente **1**; se der 2, **aborte**), ou Edit.
   **E cuidado com `grep` de raiz truncada em palavra acentuada:** `grep -i "inspec"` devolve
   **zero** para "inspeção". Ao medir ausência, teste a régua contra um caso que você **sabe**
   que existe.
2. **COMMITE ANTES DE SABOTAR** — já apagou correção não commitada 4 vezes nesta sessão.
3. **Controle positivo com alvo, lendo QUAL asserção caiu.** `md5sum` antes/depois/restaurado,
   `git diff --stat` vazio.
4. **Vermelho por asserção, não por erro de setup.** Cuidado com guarda de setup disparando antes
   da asserção de peso.
5. **Não escreva no banco de desenvolvimento** (`server/data/database.sqlite`). Testes usam o
   harness.
6. **Nunca `git add -A`.** Commit em português, corpo sem acento, `git commit -F` **com nome
   único no scratchpad** (é compartilhado entre agentes em paralelo).
7. Testes de API em `server/tests/api/*.api.test.js`; harness `testApp.js` com
   `requirePermission` real. `inspecionar` é de `[ADMINISTRADOR, ALMOXARIFE, QUALIDADE]` desde a
   Etapa 24.

## Regras de negócio

| RN | Enunciado | Onde é provada |
|---|---|---|
| RN-01 | Plano por material, com N características (nome, unidade, nominal, **desvios COM SINAL**) | `planoInspecao` |
| RN-02 | Fora da tolerância reprova — **inclusiva nos extremos, com epsilon `1e-6`** | `tolerancia` (função pura) |
| RN-03 | `divergencia_dimensional` é **derivada** quando há medidas; manual quando não há | `medidasInspecao` (**peso**) |
| RN-04 | Instrumento que exige calibração e está vencido **não mede**; inexistente/inativo → 404 | `medidasInspecao` |
| RN-05 | O plano é **congelado no ato**: editar depois não reescreve inspeção antiga | `medidasInspecao` |
| RN-06 | Medida sem característica do plano é recusada | **`medidasInspecao`** (a versão anterior mapeava para `planoInspecao`, onde a rota nem aceita medida — achado B3) |
| RN-07 | `valor_medido` não numérico é **400**, nunca reprovação com `NULL` gravado | `tolerancia` + `medidasInspecao` |

## Contratos congelados

**C1 — a régua da tolerância** (função pura, arquivo próprio em `services/almoxarifado/`)

```js
const EPS = 1e-6;   // o mesmo do modulo: inspectionService.js:78 e InspecoesAlmoxarifado.js:126
// avaliarMedida({ nominal, desvioInf, desvioSup, medido }) -> { conforme, desvio, motivo }
//   inf = nominal + desvioInf   sup = nominal + desvioSup      [desvios COM SINAL]
//   conforme = medido >= inf - EPS && medido <= sup + EPS      [INCLUSIVO, com folga de EPS]
//   desvio   = medido - nominal
//   medido nao finito (NaN/Infinity/'12,4') -> { conforme:false, motivo:'NAO_NUMERICO' }
//     e quem chama devolve 400 — NUNCA grava (achado A5)
```

**O epsilon não é preciosismo — é 12,3% de erro** (achado A1, medido em 50.000 pares): sem ele,
`nominal 12.3 / tol 0.1 / medido 12.2` calcula o limite como `12.200000000000001` e **reprova a
peça no limite exato**, ligando `divergencia_dimensional` sozinho. Seria a etapa fabricando a
divergência que existe para medir.

**Desvios COM SINAL, não magnitudes** (achado B7): o simétrico é `-0.05 / +0.05`, e o
**unilateral deslocado** (ISO 286, eixo `+0,021 / +0,005`, os dois limites acima do nominal)
passa a ser representável. Validação: `desvioInf <= desvioSup`.

**`valor_medido` não numérico é 400, não reprovação** (achado A5, reproduzido): `Number("12,4")`
— a vírgula decimal de um input pt-BR — é `NaN`; toda comparação com `NaN` é `false`, então a
característica reprovaria, ligaria a divergência e gravaria `valor_medido = NULL`. Uma
**reprovação sem número por trás**.

**C2 — as tabelas** (`schema.js`, padrão `CREATE TABLE IF NOT EXISTS` + `safeAlter`)

```
planos_inspecao_almoxarifado
  id, material_id (FK) NOT NULL, caracteristica TEXT NOT NULL, unidade TEXT,
  valor_nominal REAL NOT NULL,
  desvio_inferior REAL NOT NULL DEFAULT 0, desvio_superior REAL NOT NULL DEFAULT 0,  -- COM SINAL
  ativo INTEGER DEFAULT 1, created_at
  + CREATE UNIQUE INDEX ... ON (material_id, caracteristica) WHERE ativo = 1

medidas_inspecao_almoxarifado
  id, inspecao_id (FK) NOT NULL, plano_id INTEGER NOT NULL,
  caracteristica TEXT, unidade TEXT,
  valor_nominal REAL, desvio_inferior REAL, desvio_superior REAL,   <- CONGELADOS (RN-05)
  valor_medido REAL NOT NULL, conforme INTEGER NOT NULL,
  ferramenta_id INTEGER, ferramenta_nome TEXT, created_at
```

**O índice único** (achado B4) é o que o molde de categorias pressupõe: lá a colisão é detectada
**pelo banco** (`extended.js:200` explica que `SELECT`-antes-do-`INSERT` teria janela de corrida).
Sem ele, um material aceita dois "Diâmetro externo" com nominais diferentes e o payload de
medidas fica ambíguo. Parcial (`WHERE ativo = 1`) porque o delete é soft.

**`plano_id` é `NOT NULL`** (achado B8): o CRUD faz **soft delete**, então o plano **nunca** é
apagado — o comentário anterior ("pode ser null se o plano for apagado") descrevia um desenho que
mudou. E atenção: **a FK não vale no harness** (`PRAGMA foreign_keys = 0` lá, `1` em produção),
então um `plano_id` inexistente **passa no teste e falha em produção** — a validação em código
(400 da RN-06) é a única régua portável.

**C3 — a decisão de inspeção** (`inspectionService.decidirInspecao`, `:46`)

`data` passa a aceitar `medidas: [{ plano_id, valor_medido, ferramenta_id }]` (opcional — sem
elas, tudo segue como hoje).

**ONDE no fluxo é a parte mais importante deste contrato** (achado A2, **bloqueante**).
`decidirInspecao` reivindica o saldo em **duas fases sem transação** (`:35` explica: a atomicidade
vem do `UPDATE` condicional no próprio `WHERE`) e **valida tudo antes da Fase 1 de propósito** —
o comentário de `:74` diz que "o saldo não pode mudar quando isto recusa".

> **Resolver os planos, avaliar por C1 e checar a calibração roda ANTES do claim da linha 90.**
> Postas no lugar natural — junto da gravação das medidas — as três recusas novas produziriam
> **400 depois de o saldo já ter se movido**. Nada disso precisa do `inspecao_id`: a derivação
> de `divergencia_dimensional` é calculada em memória nesse mesmo ponto.

Quando houver medidas (`Array.isArray(medidas) && medidas.length > 0` — **achado A6**: `[]` é
truthy, e com `if (data.medidas)` um array vazio zeraria a flag manual legítima do payload):

- cada uma é avaliada por C1 com os valores **do plano naquele instante**, gravados congelados;
- `divergencia_dimensional` passa a ser `1` se **alguma** reprovou (RN-03), ignorando o payload;
- `plano_id` inexistente, ou de **outro material** → **400** (RN-06);
- `valor_medido` não finito → **400** (RN-07), **nunca** reprovação com `NULL` gravado;
- `ferramenta_id` inexistente ou `ativo = 0` → **404**, pelo padrão de `toolService.js:64`
  (achado B2: sem isso, `f.exige_calibracao` sobre `undefined` é `TypeError` → **500**);
- ferramenta que `exige_calibracao` sem `calibracaoVigente` → **400**
  `'Ferramenta com calibração vencida ou sem calibração registrada'` — **a literal do vizinho**
  (`toolService.js:70`), que cobre os dois casos. **A RN-04 prometia "desde quando" e foi
  corrigida** (achado B1): `calibracaoVigente` devolve a linha **vigente** ou `undefined`, então
  na recusa não há data para dar.

**A gravação das medidas é um ÚNICO `INSERT` multi-linha** (achado A3, **bloqueante**):
`INSERT INTO medidas_inspecao_almoxarifado (...) VALUES (?,...),(?,...),(?,...)`. Um laço deixa,
se a segunda de três falhar, a inspeção com `divergencia_dimensional = 1` e **uma medida só** — a
flag afirmando uma reprovação cuja prova não está no banco. É o defeito que a Etapa 23 consertou
no `PUT /configuracoes`, e **`BEGIN` não é a saída** (a mesma etapa mediu: conexão única, o
`ROLLBACK` engole escrita de outra requisição em voo).

**C4 — o CRUD do plano** (achado A4: a versão anterior **não tinha contrato de endpoint nenhum**,
e a skill da Fase 1 exige método, payload, resposta, códigos e **mensagem literal**)

| Método | Rota | Gate | Corpo | Resposta |
|---|---|---|---|---|
| GET | `/api/almoxarifado/planos-inspecao?material_id=N[&todos=1]` | `auth` | — | array, `ORDER BY caracteristica` |
| POST | `/api/almoxarifado/planos-inspecao` | `auth` + `requirePermission('gerenciar_plano_inspecao')` | `{material_id, caracteristica, unidade?, valor_nominal, desvio_inferior?, desvio_superior?}` | **201** |
| PUT | `/api/almoxarifado/planos-inspecao/:id` | idem | campos parciais; **omitir `ativo` preserva** | 200 |
| DELETE | `/api/almoxarifado/planos-inspecao/:id` | idem | — | 200 `{success}` ou `{success, ja_inativo}` |

Literais: 400 `'Característica é obrigatória'`, 400 `'Valor nominal é obrigatório'`,
400 `'Já existe esta característica no plano deste material'`, 400
`'O desvio inferior não pode ser maior que o superior'`, 404 `'Material não encontrado'`,
404 `'Característica não encontrada'`. **`material_id` é validado** (o molde de categorias não
tem pai para validar; sem isso cria-se plano para material fantasma, e a FK não segura no
harness).

**O gate é uma ação PRÓPRIA** (achado B6): `gerenciar_plano_inspecao: [ADMINISTRADOR, QUALIDADE,
ENGENHARIA]` em `ACAO_PERFIS`. **A versão anterior assumia `configurar` em silêncio, e
`configurar` é `[ADMINISTRADOR]` sozinho** — o perfil QUALIDADE não poderia cadastrar o que ele
mesmo vai medir, nem a engenharia definir a tolerância que ela especifica. O módulo tem critério
explícito para isso (`permissions.js:35-51`: "quando a operação muda a natureza do risco, ela
ganha ação própria", usado em `ajustar_material_cliente`, `remessar_terceiro`,
`gerenciar_ferramentas`), e a própria spec 09 já aponta esse caminho. `GET /minhas-permissoes`
expõe a ação nova de graça (itera `Object.keys(ACAO_PERFIS)`).

---

### Task 1 (galho — ver nota): a régua da tolerância — FEITA (`bae9350`)

> **Entregue.** 18 asserções, `test:api` 156/156. Vermelho inicial 8/10 contra stub ingênuo.
> Epsilon `1e-6` validado com folga: o pior erro de ponto flutuante na varredura de 50.000 pares
> foi `7,1e-15` — o epsilon é **1,4e8×** maior —, e ele só domina em faixa total abaixo de
> `~1e-6` mm, três ordens abaixo do melhor instrumento do cadastro (comparador, 0,0001 mm).
>
> **DUAS CORREÇÕES QUE ESTA TASK FEZ NO PLANO, e a segunda muda a Task 3:**
>
> **1. O controle positivo (a) deste plano não derrubava nada.** Trocar `<=` por `<` mantendo o
> `+ EPS` é **semanticamente invisível**: nenhuma medida cai exatamente em `sup + 1e-6`. O que o
> teste ancora é a **posição do limite**, não o operador — movendo o limite de fato, caem 6
> cenários, todos do lado sabotado. Quem prescrever "troque `<=` por `<`" como sabotagem em
> régua com epsilon está prescrevendo um no-op.
>
> **2. `NaN` NÃO reprova sozinho — ele APROVA.** O design e este plano afirmavam que, sem guarda,
> `Number('12,4')` faria a característica reprovar. Isso só vale na forma positiva
> (`conforme = m >= inf && m <= sup`). Na forma de **guardas de rejeição** — que é a natural
> quando se quer devolver motivo específico, e é a que foi escrita — o `NaN` não dispara guarda
> nenhuma e sai **conforme**. Medido: `"12,4" foi aceito como medida conforme`.
> **É pior que o previsto:** não é falsa reprovação, é falsa **aprovação**, com `valor_medido`
> nulo e a divergência apagada. **A Task 3 NÃO pode se apoiar em "NaN reprova sozinho"** — a
> validação explícita é obrigatória, e `paraNumeroFinito` está exportada para ela reusar.
> (Também: `Number(null)`, `Number('')`, `Number('  ')` e `Number([])` são **0**, e passariam por
> `Number.isFinite` como "medida zero".)

**Files:** Create `server/services/almoxarifado/toleranciaInspecao.js`;
Test `server/tests/api/toleranciaInspecao.api.test.js`.

> **Nota de classificação** (achado C2): esta task **não é tronco** — cria um arquivo isolado e
> um teste novo, sem tocar migration, motor ou `ACAO_PERFIS`. Ela e a Task 2 são disjuntas e
> **poderiam ir em paralelo** (em worktrees). Serializar é barato porque a Task 1 é minúscula,
> mas o rótulo importa: é ele que a Fase 3 usa para decidir paralelismo nas próximas etapas.

- [ ] **Step 1: teste que falha** — só bordas, e **com os valores que hoje falham**:
  `nominal 0.7 / desvios ±0.1 / medido 0.8` e `nominal 2.675 / ±0.005 / medido 2.68` — os dois
  **reprovam** sem epsilon (medido pela Fase 2). **Não use `12.3/±0.1/12.4`**: esse par passa por
  acidente aritmético, e com ele o Step 1 fica **verde antes da implementação certa** e o
  controle positivo do Step 3 não distingue nada.
  Mais: limite inferior e superior exatos → conforme; um passo além → não; **desvio zero** com
  medida igual ao nominal → conforme; **desvio unilateral** (`+0.005 / +0.021`, os dois acima do
  nominal) → o nominal puro **reprova**; medida e nominal negativos; `desvio` com sinal certo;
  e **`valor_medido` não numérico** (`'12,4'`, `NaN`, `Infinity`) → `motivo: 'NAO_NUMERICO'`,
  nunca `conforme: true`.
- [ ] **Step 2: implementar; verde.**
- [ ] **Step 3: controle positivo** (commitar antes), **três**: (a) troque `<=` por `<` num dos
  extremos → cai o cenário **daquele** limite, e só ele; (b) **remova o epsilon** → caem os
  cenários de `0.7/±0.1/0.8` e `2.675/±0.005/2.68`, nomeando o limite calculado
  (`0.7999999999999999`); (c) aceite não-numérico → cai o cenário do `'12,4'`. A (b) é a que
  prova que o teste não é vazio.
- [ ] **Step 4:** `npm run test:api`; commit.

---

### Task 2 (tronco): o plano de inspeção — FEITA (`a15ac3b`)

> **Entregue.** 22 cenários, vermelho inicial 0/22, `test:api` 157/157.
> **O C4 estava INCOMPLETO em cinco pontos** (não errado) — as decisões que a execução teve de
> tomar e que o contrato não cobria: GET sem `material_id` → **400 `'Material é obrigatório'`**
> (descartado devolver tudo, que vaza plano alheio, e `[]`, que mente); **`material_id` não é
> editável pelo PUT** (mover a característica de material deixaria as medidas congeladas contando
> a história do material antigo); literal nova **400 `'Desvio inválido'`** para desvio não
> numérico (cair no `?? 0` viraria "desvio zero" em silêncio); `material_id` validado por
> **existência**, não por `ativo = 1` (o alvo é o material fantasma); e **sem `try/catch` no
> índice** — ao contrário da Etapa 26, aqui a tabela nasce com ele.
>
> **E o controle positivo precisou de cinco sabotagens, não duas.** A que quase virou no-op:
> retirar **só o `WHERE ativo = 1`** do índice (deixando-o total) **passa verde** no cenário da
> duplicada — só quebra na recriação após desativar. Sem esse cenário específico, a sabotagem não
> distinguiria nada. Mesma lição da Task 1: numa régua com folga, sabotar o operador é invisível;
> o que o teste ancora é a **posição** da régua. — FEITA (`a15ac3b`)

> **Entregue.** 22 asserções em `planoInspecao.api.test.js`, vermelho inicial **0/22** (todas por
> rota/tabela ausente, nenhuma por erro de setup). `test:api` **157/157**, `test:almoxarifado`
> **42/42**, `test:validation` 4/4, `test:safealter` 3/3, `test:sqlite` 5/5.
>
> **Sobre o gate:** nenhum teste conta as ações de `ACAO_PERFIS` — `minhasPermissoes.api.test.js`
> itera `Object.keys` e não tem asserção de `length` (verificado). A ação nova entrou sem ajuste
> em teste nenhum.
>
> **CINCO DECISÕES QUE O C4 NÃO COBRIA, tomadas aqui e declaradas:**
>
> 1. **GET sem `material_id` é 400 `'Material é obrigatório'`.** O C4 dizia "filtro obrigatório"
>    sem dar código nem literal. Escolhido 400 e não "devolve tudo" (vazaria plano alheio para a
>    tela de qualquer material) nem `[]` (mentira: existe plano, só não foi pedido).
> 2. **`material_id` NÃO é editável pelo PUT.** "Campos parciais" não dizia se o pai entrava.
>    Mover a característica de material deixaria as medidas congeladas (RN-05) contando a história
>    do material antigo. Quem errou o material desativa e cria — é o caminho reversível.
> 3. **Literal nova: 400 `'Desvio inválido'`** para desvio não numérico no PUT (`'abc'`, `null`).
>    A lista do C4 não tinha mensagem para esse caso, e cair no `?? 0` transformaria lixo em
>    "desvio zero" em silêncio.
> 4. **`material_id` é validado por EXISTÊNCIA, não por `ativo = 1`.** O molde de ferramentas usa
>    `WHERE id = ? AND ativo = 1`, mas aqui o alvo declarado é o material *fantasma*; exigir ativo
>    impediria corrigir o plano de um material temporariamente desativado.
> 5. **Sem `try/catch` no `CREATE UNIQUE INDEX`**, ao contrário da Etapa 26. Lá o índice foi
>    acrescentado a uma tabela **que já tinha dados** e podia colidir, derrubando o `initSchema`
>    inteiro. Aqui a tabela **nasce** com o índice: não existe base legada com plano duplicado.
>
> **O Step 3 deste plano previa duas sabotagens; foram precisas CINCO** — e a terceira é a que
> quase virou no-op, exatamente o defeito que a Task 1 descreveu:
>
> - (a) gate removido → cai só o (22), nomeando `ALMOXARIFE`/`GESTOR`/`COMPRAS`/`CONSULTA`/
>   `PRODUCAO` **verbo a verbo** (`POST 201`, `PUT 200`, `DELETE 200`);
> - (b) filtro por material removido → caem (9) e (4). **Medido com cuidado:** a guarda
>   `every(material_id === MAT_A)` dispara **antes** da asserção do B, então a asserção do B foi
>   medida em separado (guarda neutralizada só para a medição) e cai nomeando a característica que
>   vazou — `"So do A ..." apareceu no plano do material B`;
> - (c) índice único removido → caem (11), (15) e (21);
> - **(c2) índice deixa de ser PARCIAL** (só o `WHERE ativo = 1` retirado) → caem (13) e (21).
>   **Sem o cenário (13), esta sabotagem passaria verde:** um índice total satisfaz o teste de
>   duplicada e só quebra na *recriação após desativar*, que é o caso do usuário corrigindo um
>   cadastro errado. É a mesma lição da Task 1 — sabotar o operador sem mover o comportamento;
> - (d) rótulo removido de `auditLabels.js` → cai a cobertura de vocabulário
>   (`entidades sem rotulo: ["plano_inspecao"]`) **e** o (19) deste arquivo.
>
> `md5sum` antes/depois/restaurado idênticos nos três arquivos, `git diff --stat` vazio.
>
> **Correção de documento:** o título do teste de cobertura de entidades dizia "os 25 literais";
> agora são 26. A asserção é `>= 25` de propósito (entidade nova não pode derrubar o teste por
> contagem, só por falta de rótulo), mas o título mentindo faria o próximo achar que a varredura
> parou de ver algo. Corrigido, com a razão escrita ao lado.
>
> **Fica para a Task 4** (fechamento), não esquecido: `specs/`, o guia do usuário e a letra B do
> doc de novidades — inclusive a exclusão deliberada do `ALMOXARIFE` do gate.

### Task 2 (tronco): o plano de inspeção

**Files:** Modify `server/services/almoxarifado/schema.js` (as duas tabelas),
`server/routes/almoxarifado/extended.js` (CRUD do plano);
Test `server/tests/api/planoInspecao.api.test.js`.

**Molde:** o CRUD de **categorias** da Etapa 26 (`extended.js`, POST/PUT/DELETE, `auditar(db,
payload, contexto)` + `autorDe(req)`, soft delete com `WHERE id = ? AND ativo = 1`, colisão
detectada **pelo banco** via índice único). É o cadastro mais recente e já traz as correções das
etapas 23 e 26. **Não** copie famílias.

**Três coisas que o molde NÃO cobre e que o C4 acrescenta**, porque plano é *filho de um
material* e não catálogo global: o **filtro obrigatório por material** no GET; a **validação de
que `material_id` existe** (o molde não tem pai para validar, e a FK não segura no harness); e o
**índice único composto** `(material_id, caracteristica) WHERE ativo = 1`.

**O gate NÃO é `configurar`** — é a ação nova `gerenciar_plano_inspecao` (C4). `configurar` é
`[ADMINISTRADOR]` sozinho, e deixaria o perfil QUALIDADE sem poder cadastrar o que ele mesmo vai
medir.

- [x] **Step 1: teste que falha** — RN-01 (criar/listar/editar/desativar característica de um
  material), gate (matriz de perfis com a **asserção negativa**), e **listar por material**
  (o plano de um material não aparece no de outro — guarda anti-teste-vazio: afirme que **há**
  plano no material A antes de afirmar que não há no B).
- [x] **Step 2: implementar** as tabelas e o CRUD; auditoria com entidade nova.
  **Acrescente o rótulo em `auditLabels.js`** — há um teste de cobertura de vocabulário
  (`auditLabels.api.test.js:235`) que fica **vermelho** se a entidade nova não tiver rótulo. Ele
  é o controle positivo natural deste item.
- [x] **Step 3: controle positivo** (commitar antes): (a) gate removido → a matriz cai nomeando
  o perfil; (b) filtro por material removido → o cenário do B cai.
- [x] **Step 4:** `npm run test:api`; commit.

---

### Task 3 (tronco): medidas na decisão de inspeção

**Files:** Modify `server/services/almoxarifado/inspectionService.js` (`decidirInspecao`, `:46`);
Test `server/tests/api/medidasInspecao.api.test.js`.

**Depende das Tasks 1 e 2** — serialize.

- [ ] **Step 1: teste que falha** — os quatro cenários, nesta ordem de importância:
  - **RN-03, o de peso:** inspeção com uma medida **fora** da tolerância → o registro sai com
    `divergencia_dimensional = 1` **sem que o payload tenha marcado nada**. E o irmão: todas
    dentro → `0`, mesmo que o payload mande `1` (a derivação **vence** o manual quando há
    medidas). Sem esse par, a RN-03 não está provada.
  - **RN-04:** ferramenta que `exige_calibracao` **sem** calibração vigente → **400** com a
    mensagem literal; **com** vigente → aceita; ferramenta que **não** exige → aceita.
  - **RN-05:** gravar a inspeção, **editar o plano** (mudar o nominal), reler a medida → os
    valores congelados são os **antigos**. É a asserção que impede o plano de reescrever a
    história.
  - **RN-06:** `plano_id` inexistente → 400; `plano_id` de **outro material** → 400.
  - **RN-07 e A6, os dois que o payload traz de graça:** `valor_medido: '12,4'` → **400**, e
    **nada** gravado (não uma reprovação com `NULL`); `medidas: []` → a flag **manual do payload
    é preservada** (array vazio não ativa a derivação).
  - **A2 — a ordem no fluxo, que é bloqueante:** com `plano_id` inválido, além do 400, afirme que
    o item **manteve** `quantidade_em_inspecao` — ou seja, que a recusa aconteceu **antes** do
    claim de saldo. Sem essa asserção, o 400 pode estar saindo depois de o saldo ter se movido e
    o teste não perceber.
  - **B2:** `ferramenta_id` inexistente → **404**, não 500.
  - **Regressão:** inspeção **sem** medidas continua funcionando exatamente como hoje, incluindo
    a flag manual (os testes de inspeção existentes não podem quebrar — rode-os).
- [ ] **Step 2: implementar.** **Toda a resolução/validação ANTES do claim da linha 90** (C3) —
  se um 400 seu sair depois de o saldo ter se movido, o conserto não é mover o `catch`, é mover a
  validação. E as medidas num **único `INSERT` multi-linha**, nunca em laço.
- [ ] **Step 3: controle positivo** (commitar antes), lendo qual asserção caiu:
  (a) ignore o resultado da avaliação e use a flag do payload → o cenário RN-03 cai **dizendo que
  a divergência não foi derivada**; (b) remova a checagem de calibração → o cenário RN-04 cai
  nomeando o instrumento; (c) grave `plano_id` em vez dos valores congelados → o cenário RN-05
  cai mostrando o nominal novo na inspeção antiga.
- [ ] **Step 4:** `npm run test:api` e `npm run test:almoxarifado`; commit.

---

### Task 4: integração e fechamento

- [ ] **Step 1:** integração ponta a ponta — criar plano, receber material, inspecionar com
  medida fora da tolerância, conferir que `divergencia_dimensional` saiu `1` **sem o payload
  marcar**, e que as medidas gravadas trazem os valores congelados.
  **A auditoria a conferir é a do CRUD do plano, NÃO a da inspeção** (achado B5): a versão
  anterior mandava "ler pela tela-contrato da auditoria conferindo que o ato aparece", e
  **`inspectionService.js` não audita nada** — não há `registrarAuditoria` nem `auditar` entre os
  `require` dele. O único ato auditável desta etapa é a criação/edição do plano. **Não** espere
  total fixo; afirme a composição.
- [ ] **Step 2:** os cinco comandos da suíte + o cliente com `TZ=UTC`, números **lidos**.
- [ ] **Step 3:** skill `fechar-etapa` inteira, **incluindo o Passo 8**.
  - **Spec 09:** os dois primeiros itens do checklist saem; **e a afirmação de que a feature 16
    "não existe ainda" já foi corrigida na Fase 0 — confira que a correção está lá** e diga se a
    feature muda de cor.
  - **Letra C:** a tela de inspeção **ainda não tem** campo de medidas — esta etapa entrega o
    backend e a régua; quem inspeciona pela tela segue com a flag manual até a etapa da UI.
    **Isso precisa estar claro**, senão o usuário procura o campo e não acha.
  - **Letra B:** plano por **família** (herança), que ficou fora de propósito. **E o alerta para
    a etapa da UI**, enquanto o raciocínio está fresco: quando a tela ganhar campos de medida, a
    caixa "Divergência dimensional" tem de virar **somente leitura, derivada e explicada** — se
    ficar clicável ao lado dos campos, o usuário marca, o servidor ignora (RN-03) e a tela passa
    a mostrar uma coisa enquanto o banco guarda outra. É exatamente o defeito da Etapa 26.

## Próxima tarefa detalhada

Se parar aqui: **Fase 2** — agente fresco com plano + design e três perguntas (os contratos
cobrem os erros? as RN batem com o código? as tasks são mesmo tronco?). Atenção especial a:
**`decidirInspecao` tem transação ou é sequência de escritas?** (se for sequência, gravar medidas
no meio cria o mesmo ato-parcial que a Etapa 23 consertou no `PUT /configuracoes` — e a Global
Constraint da 23 proíbe `BEGIN` com `await` no meio, porque a conexão é única);
**a tela de inspeção manda payload que quebraria com campo novo?**; e se `calibracaoVigente` é
alcançável de `inspectionService` sem import circular.
