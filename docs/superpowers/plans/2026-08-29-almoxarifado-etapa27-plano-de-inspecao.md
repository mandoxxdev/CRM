# Etapa 27 — Plano de inspeção com medidas (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** a inspeção de recebimento deixa de ter uma caixa "divergência dimensional" marcada à
mão e passa a ter plano, medidas e instrumento — com a divergência **derivada do número**, e com
instrumento descalibrado impedido de medir.

**Architecture:** duas tabelas novas, uma função pura para a régua da tolerância, o CRUD do plano
e a gravação das medidas dentro de `decidirInspecao`.

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
| RN-01 | Plano por material, com N características (nome, unidade, nominal, tol. inf./sup.) | `planoInspecao` |
| RN-02 | Fora da tolerância reprova — régua **inclusiva** nos dois extremos | `tolerancia` (função pura) |
| RN-03 | `divergencia_dimensional` é **derivada** quando há medidas; manual quando não há | `medidasInspecao` (**peso**) |
| RN-04 | Instrumento que exige calibração e está vencido **não mede** — a rota recusa | `medidasInspecao` |
| RN-05 | O plano é **congelado no ato**: editar depois não reescreve inspeção antiga | `medidasInspecao` |
| RN-06 | Medida sem característica do plano é recusada | `planoInspecao` |

## Contratos congelados

**C1 — a régua da tolerância** (função pura, arquivo próprio em `services/almoxarifado/`)

```js
// avaliarMedida({ nominal, tolInf, tolSup, medido }) -> { conforme: boolean, desvio: number }
//   conforme  = medido >= (nominal - tolInf) && medido <= (nominal + tolSup)   [INCLUSIVO]
//   desvio    = medido - nominal   (negativo abaixo, positivo acima)
// `tolInf` e `tolSup` sao MAGNITUDES nao-negativas (0.05 significa 0,05 para baixo/para cima),
// nao limites absolutos. Tolerancia zero e valida: exige o nominal exato.
```
**Inclusivo é decisão, não detalhe:** peça exatamente no limite da tolerância **é conforme** —
é o que tolerância significa em metrologia. O teste prova os dois extremos.

**C2 — as tabelas** (`schema.js`, padrão `CREATE TABLE IF NOT EXISTS` + `safeAlter`)

```
planos_inspecao_almoxarifado
  id, material_id (FK), caracteristica TEXT NOT NULL, unidade TEXT,
  valor_nominal REAL NOT NULL, tolerancia_inferior REAL NOT NULL DEFAULT 0,
  tolerancia_superior REAL NOT NULL DEFAULT 0, ativo INTEGER DEFAULT 1, created_at

medidas_inspecao_almoxarifado
  id, inspecao_id (FK inspecoes_recebimento_almoxarifado), plano_id (FK, pode ser null se o
  plano for apagado depois), caracteristica TEXT, unidade TEXT,
  valor_nominal REAL, tolerancia_inferior REAL, tolerancia_superior REAL,   <- CONGELADOS (RN-05)
  valor_medido REAL NOT NULL, conforme INTEGER NOT NULL,
  ferramenta_id INTEGER, ferramenta_nome TEXT, created_at
```
**Os campos do plano são copiados para a medida, não referenciados** — é a RN-05. `plano_id`
serve para rastrear a origem, não para ler o critério.

**C3 — a decisão de inspeção** (`inspectionService.decidirInspecao`, `:46`)

`data` passa a aceitar `medidas: [{ plano_id, valor_medido, ferramenta_id }]` (opcional — sem
elas, tudo segue como hoje). Quando houver medidas:
- cada uma é avaliada por C1 com os valores **do plano naquele instante**, e o resultado é
  gravado congelado;
- `divergencia_dimensional` do registro de inspeção passa a ser `1` se **alguma** reprovou
  (RN-03), ignorando o que veio no payload;
- `plano_id` que não existe, ou que é de **outro material**, → **400** (RN-06);
- `ferramenta_id` que `exige_calibracao` e não tem `calibracaoVigente` (`toolService.js:57`) →
  **400**, com mensagem nomeando o instrumento (RN-04).

---

### Task 1 (tronco): a régua da tolerância

**Files:** Create `server/services/almoxarifado/toleranciaInspecao.js`;
Test `server/tests/api/toleranciaInspecao.api.test.js`.

- [ ] **Step 1: teste que falha** — só bordas, porque o meio é fácil:
  **exatamente** no limite inferior (`nominal - tolInf`) → conforme; **exatamente** no superior →
  conforme; um passo além de cada → não conforme; tolerância **zero** com medida igual ao nominal
  → conforme, e qualquer desvio → não; medida e nominal **negativos**; `desvio` com sinal certo
  nos dois lados. **Nada de ponto flutuante ingênuo:** `0.1 + 0.2 !== 0.3` em JS — se a régua
  usar comparação direta, diga no relatório como tratou (epsilon, ou arredondamento declarado).
- [ ] **Step 2: implementar; verde.**
- [ ] **Step 3: controle positivo** (commitar antes): troque `<=` por `<` num dos extremos → o
  cenário **daquele** limite cai, e só ele. Se cair o outro também, a régua não é a que você
  pensa.
- [ ] **Step 4:** `npm run test:api`; commit.

---

### Task 2 (tronco): o plano de inspeção

**Files:** Modify `server/services/almoxarifado/schema.js` (as duas tabelas),
`server/routes/almoxarifado/extended.js` (CRUD do plano);
Test `server/tests/api/planoInspecao.api.test.js`.

**Molde:** o CRUD de **categorias** da Etapa 26 (`extended.js`, POST/PUT/DELETE com
`requirePermission('configurar')`, `auditar(db, payload, contexto)` + `autorDe(req)`, soft delete
com `WHERE id = ? AND ativo = 1`). É o cadastro mais recente e já traz as correções das etapas
23 e 26. **Não** copie famílias.

- [ ] **Step 1: teste que falha** — RN-01 (criar/listar/editar/desativar característica de um
  material), gate (matriz de perfis com a **asserção negativa**), e **listar por material**
  (o plano de um material não aparece no de outro — guarda anti-teste-vazio: afirme que **há**
  plano no material A antes de afirmar que não há no B).
- [ ] **Step 2: implementar** as tabelas e o CRUD; auditoria com entidade nova.
  **Acrescente o rótulo em `auditLabels.js`** — há um teste de cobertura de vocabulário
  (`auditLabels.api.test.js:235`) que fica **vermelho** se a entidade nova não tiver rótulo. Ele
  é o controle positivo natural deste item.
- [ ] **Step 3: controle positivo** (commitar antes): (a) gate removido → a matriz cai nomeando
  o perfil; (b) filtro por material removido → o cenário do B cai.
- [ ] **Step 4:** `npm run test:api`; commit.

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
  - **Regressão:** inspeção **sem** medidas continua funcionando exatamente como hoje, incluindo
    a flag manual (os testes de inspeção existentes não podem quebrar — rode-os).
- [ ] **Step 2: implementar.**
- [ ] **Step 3: controle positivo** (commitar antes), lendo qual asserção caiu:
  (a) ignore o resultado da avaliação e use a flag do payload → o cenário RN-03 cai **dizendo que
  a divergência não foi derivada**; (b) remova a checagem de calibração → o cenário RN-04 cai
  nomeando o instrumento; (c) grave `plano_id` em vez dos valores congelados → o cenário RN-05
  cai mostrando o nominal novo na inspeção antiga.
- [ ] **Step 4:** `npm run test:api` e `npm run test:almoxarifado`; commit.

---

### Task 4: integração e fechamento

- [ ] **Step 1:** integração ponta a ponta — criar plano, receber material, inspecionar com
  medida fora da tolerância, e **ler pela tela-contrato da auditoria** conferindo que o ato
  aparece. **Não** espere total fixo; afirme a composição.
- [ ] **Step 2:** os cinco comandos da suíte + o cliente com `TZ=UTC`, números **lidos**.
- [ ] **Step 3:** skill `fechar-etapa` inteira, **incluindo o Passo 8**.
  - **Spec 09:** os dois primeiros itens do checklist saem; **e a afirmação de que a feature 16
    "não existe ainda" já foi corrigida na Fase 0 — confira que a correção está lá** e diga se a
    feature muda de cor.
  - **Letra C:** a tela de inspeção **ainda não tem** campo de medidas — esta etapa entrega o
    backend e a régua; quem inspeciona pela tela segue com a flag manual até a etapa da UI.
    **Isso precisa estar claro**, senão o usuário procura o campo e não acha.
  - **Letra B:** plano por **família** (herança), que ficou fora de propósito.

## Próxima tarefa detalhada

Se parar aqui: **Fase 2** — agente fresco com plano + design e três perguntas (os contratos
cobrem os erros? as RN batem com o código? as tasks são mesmo tronco?). Atenção especial a:
**`decidirInspecao` tem transação ou é sequência de escritas?** (se for sequência, gravar medidas
no meio cria o mesmo ato-parcial que a Etapa 23 consertou no `PUT /configuracoes` — e a Global
Constraint da 23 proíbe `BEGIN` com `await` no meio, porque a conexão é única);
**a tela de inspeção manda payload que quebraria com campo novo?**; e se `calibracaoVigente` é
alcançável de `inspectionService` sem import circular.
