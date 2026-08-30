# Etapa 29 — A tela das medidas de inspeção (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** o formulário de decisão de inspeção ganha os campos de medida do plano do material
(com a caixa *Divergência dimensional* virando somente leitura e explicada — B60), e as medidas
gravadas ganham quem as leia: aba **Histórico** na tela de Inspeções, alimentada por dois
endpoints de leitura novos.

**Architecture:** dois `GET` aditivos em `inspectionService`/`extended.js`; o modal de decisão de
`InspecoesAlmoxarifado.js` lendo `GET /planos-inspecao` e `GET /ferramentas` ao abrir; aba
Histórico na mesma tela.

**Spec:** `docs/superpowers/specs/2026-08-29-almoxarifado-etapa29-tela-das-medidas-design.md`.
Feature: `specs/modulo-almoxarifado/09-inspecao-qualidade/README.md` (itens `:118` e `:121`).

## Global Constraints

1. `python3`, nunca `python`; `sed` só com âncora contada (`grep -cF` = 1); `grep` de raiz
   truncada em palavra acentuada devolve zero — teste a régua contra um caso que existe.
2. **COMMITE ANTES DE SABOTAR.** Controle positivo com alvo, `md5sum` antes/depois/restaurado,
   `git diff --stat` vazio, lendo **qual asserção** caiu.
3. Não escreva no banco de desenvolvimento. Nunca `git add -A`. Commit em português, corpo sem
   acento, `git commit -F` com nome único no scratchpad.
4. Testes de API em `server/tests/api/*.api.test.js` (harness `testApp.js`, `requirePermission`
   real). Front: `RequisicoesList.test.js`/`InspecoesAlmoxarifado.test.js` são o molde de mock
   (`api`, `toast`, `useAlmoxPermissoes`); mock **só** na fronteira HTTP.
5. **Nunca `parseFloat` no valor medido** — `'12,4'` viraria `12` em silêncio. Vai como string.
6. **Nenhuma régua de tolerância no client.** A derivação é do servidor.

## Regras de negócio

| RN | Enunciado | Onde é provada |
|---|---|---|
| RN-01 | Modal com plano ativo mostra um campo por característica (nome, unidade, nominal, faixa `[inf; sup]`); **sem plano, o modal é idêntico ao de hoje** | Jest `InspecoesAlmoxarifado` |
| RN-02 | Com ≥1 medida preenchida, a caixa *Divergência dimensional* fica **desabilitada** com o texto *"Derivada das medidas ao salvar — fora da tolerância liga sozinha"*, e o payload **não** leva `divergencia_dimensional` | Jest (**peso**) |
| RN-03 | Payload leva só linhas com valor preenchido, como **string crua**; recusa do servidor vai literal ao toast e o modal continua aberto com os valores | Jest |
| RN-04 | Instrumento com `calibracao_vigente === false` aparece *"(calibração vencida)"* e desabilitado; `null` aparece normal | Jest |
| RN-05 | `GET /inspecoes/historico`: decididas, ordem `data_inspecao DESC`, filtro `material_id`, `medidas_total` e `medidas_nao_conformes`; `GET /inspecoes/:id/medidas`: valores **congelados** (editar o plano depois não muda a resposta); 404 *"Inspeção não encontrada"* | `inspecaoHistorico.api.test.js` |
| RN-06 | Aba Histórico lista e expande as medidas com conforme/não conforme e instrumento | Jest |
| RN-07 | O toast de sucesso, quando houve medidas, diz *"Inspeção registrada! Divergência dimensional: sim (2 medidas)"* / *"…: não (N medidas)"*; sem medidas, *"Inspeção registrada!"* como hoje | Jest |

## Contratos congelados

**C1 — `GET /api/almoxarifado/inspecoes/historico?material_id=&limite=`** (`auth`, sem gate
novo; `limite` default 100, teto 500). Resposta: array de
```
{ id, recebimento_item_id, recebimento_id, recebimento_numero, nota_fiscal,
  material_id, material_codigo, material_nome, material_unidade,
  quantidade_aprovada, quantidade_reprovada, conforme, divergencia_quantidade,
  divergencia_dimensional, certificado_ausente, dano_fisico, material_incorreto,
  encaminhamento, observacoes, responsavel_nome, data_inspecao,
  medidas_total, medidas_nao_conformes }
```
SQL: `inspecoes_recebimento_almoxarifado i JOIN recebimentos_material_itens_almoxarifado ri ON
i.recebimento_item_id = ri.id JOIN materiais_almoxarifado m JOIN recebimentos_material_almoxarifado r`,
subselects para as contagens. **Registrar ANTES de qualquer `/inspecoes/:id`** (Express casa
`historico` como `:id`, lição da Etapa 10b em `routes/almoxarifado.js:967`).

**C2 — `GET /api/almoxarifado/inspecoes/:id/medidas`** (`auth`). 404 `{ error: 'Inspeção não
encontrada' }`. Resposta: array de
`{ id, plano_id, caracteristica, unidade, valor_nominal, desvio_inferior, desvio_superior,
   valor_medido, conforme, ferramenta_id, ferramenta_nome, created_at }` em ordem de `id`.

**C3 — Front, modal de decisão** (`InspecoesAlmoxarifado.js`): ao abrir o modal,
`api.get('/almoxarifado/planos-inspecao', { params: { material_id } })` e, **só se vier ≥1
característica**, `api.get('/almoxarifado/ferramentas')`. Bloco **"Medidas do plano"** abaixo de
*Problemas identificados*: por característica, `label` = `caracteristica (unidade) — nominal N,
faixa [inf ; sup]`, `input type="text" inputMode="decimal"` para o valor, `select` de instrumento
(opção vazia *"— sem instrumento —"*). Estado `medidas: { [plano_id]: { valor, ferramenta_id } }`.
No submit: `payload.medidas = [{ plano_id, valor_medido: valor, ferramenta_id? }]` só com `valor`
não vazio (`trim() !== ''`); se `payload.medidas.length > 0`, **não** incluir
`divergencia_dimensional`. Erro → `toast.error(err.response?.data?.error || 'Erro ao registrar
inspeção')`, modal **aberto**. Sucesso → RN-07 usando `res.data.divergencia_dimensional` e
`res.data.medidas_registradas`.

**C4 — Front, aba Histórico**: a tela ganha duas abas (*Pendentes* — a de hoje — e *Histórico*).
Histórico chama C1 (filtro de material reaproveitando o `materialFilter` existente), lista
`data · material · aprovada/reprovada · flags · responsável · medidas (N, k fora)`, e ao expandir
uma linha chama C2 e mostra a tabela `característica | nominal | faixa | medido | conforme |
instrumento`. Linha com `medidas_total === 0` mostra *"Sem medidas registradas"*.

## Sort topológico

| # | Task | Tipo | Depende |
|---|---|---|---|
| 1 | C1 + C2 no backend + `inspecaoHistorico.api.test.js` | **tronco** | — |
| 2 | Modal de medidas (C3, RN-01..04, RN-07) + Jest | **galho** | contrato da Etapa 27 (já existe) |
| 3 | Aba Histórico (C4, RN-06) + Jest | **galho**, **mesmo arquivo da Task 2** → roda **depois** da 2, não em paralelo | 1 e 2 |
| 4 | Integração: decidir com medidas pela rota → `historico` traz `medidas_total` → `/:id/medidas` traz os valores; editar o plano depois → resposta inalterada (congelado) | tronco | 1 |

Tasks 1 e 2 podem rodar em paralelo (diretórios disjuntos, `server/` × `client/`).

## Task 1 — Leitura de inspeção decidida (tronco)

Arquivos: `server/services/almoxarifado/inspectionService.js` (`listarHistorico`,
`listarMedidasDaInspecao`), `server/routes/almoxarifado/extended.js` (as duas rotas, C1 antes de
qualquer `/inspecoes/:id`), `server/tests/api/inspecaoHistorico.api.test.js` (novo).

TDD (molde: `server/tests/api/planoInspecao.api.test.js` e o teste de medidas da Etapa 27 para
montar recebimento → item retido → decidir com medidas): `[RN-05] historico lista a decidida com
medidas_total e nao_conformes`, `[RN-05] filtro material_id`, `[RN-05] limite`, `[RN-05] medidas
da inspecao com tolerancia CONGELADA (PUT no plano depois nao muda)`, `[RN-05] 404 inspecao
inexistente`, `[RN-05] rota historico nao e engolida por /:id` (chamar `/inspecoes/historico`
e receber array, não 404 de id). Controle positivo: trocar a ordem de registro das rotas → o
último cai; trocar a leitura das medidas para JOIN no plano atual → o congelado cai.

Commit: `Almoxarifado Etapa 29 Task 1: a inspecao decidida e as medidas ganham leitura`.

## Task 2 — Medidas no modal, B60 cumprida (galho)

Arquivo: `client/src/components/almoxarifado/InspecoesAlmoxarifado.js` + `.test.js`.
Jest: (1) sem plano, modal idêntico (snapshot leve: nenhum campo "Medidas do plano"); (2) com
plano, N campos com faixa; (3) **peso**: preencher uma medida desabilita a caixa e mostra o
texto; payload sem `divergencia_dimensional` e com `medidas` de **string crua** (`'12,4'` chega
como `'12,4'`); (4) linha vazia não vai; (5) instrumento vencido desabilitado e rotulado; (6)
erro do servidor → toast literal e modal aberto; (7) RN-07 toast com sim/não.
Controle positivo: trocar `valor_medido: valor` por `parseFloat(valor)` → (3) cai na string;
remover o `disabled` da caixa → (3) cai.

Commit: `Almoxarifado Etapa 29 Task 2: o formulario de inspecao ganha as medidas do plano`.

## Task 3 — Aba Histórico (galho, após a 2)

Mesmo arquivo. Jest: (1) aba lista com contagem de medidas; (2) expandir chama `/:id/medidas` e
mostra a tabela; (3) `medidas_total === 0` mostra o texto; (4) filtro de material propaga.

Commit: `Almoxarifado Etapa 29 Task 3: a aba Historico mostra as medidas de cada inspecao`.

## Task 4 — Integração pela rota

`inspecaoFluxoMedidas.api.test.js`: plano → recebimento → decidir com 2 medidas (1 fora) pela
rota → `historico` (`medidas_total 2`, `nao_conformes 1`, `divergencia_dimensional 1`) →
`/:id/medidas` (2 linhas, `conforme` 0/1) → `PUT /planos-inspecao/:id` mudando o nominal →
`/:id/medidas` **inalterado**. Suíte completa serial.

## Fechamento

`fechar-etapa`: novidades (seção; C34 e C35 **fechados**, riscados no lugar; B60 cumprida), spec 09
(`:118` e `:121` marcados com hash; o que falta: cadastro do plano pela tela, fotos), mapa, guia
(roteiro com plano cadastrado por API + tela), manual (§15.2.x), retro.

## Próxima tarefa detalhada

(preencher no fechamento)
