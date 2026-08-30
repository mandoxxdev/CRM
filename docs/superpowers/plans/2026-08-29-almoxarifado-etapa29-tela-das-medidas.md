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

> **REESCRITO PELA FASE 2** (12 achados, 4 importantes, todos meus): (1) o rótulo da faixa
> `[nominal+inf ; nominal+sup]` em JS dá `12.200000000000001` — o mesmo fenômeno que a Etapa 27
> mediu na régua, agora na exibição; e "inf" sem fórmula podia ser lido como `nominal − |inf|`,
> errado para o plano ISO 286 `+0,005/+0,021`; (2) o teste da B60 era **vazio**: o payload de hoje
> já omite flag desmarcada, então "sem `divergencia_dimensional`" passava sem lógica nova — e a
> caixa marcada + `disabled` ficaria **marcada e travada** com o servidor gravando 0; (3) o
> controle positivo "trocar a ordem das rotas" é **no-op**, provado com Express real: não existe
> nenhuma `/inspecoes/:id`; (4) "B60 cumprida à risca" é falso — a B60 pede pré-visualização ao
> digitar, que o design **descarta**; vira 2 de 3 partes, dito. Onde diz "ESTAVA ERRADO", vale a
> versão atual.

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
6. **Nenhuma COMPARAÇÃO de tolerância no client.** A derivação (conforme/não conforme) é do
   servidor. **Somar para exibir a faixa é permitido** — com formatação decimal derivada do plano
   (achado 1): `casas = max(casas(valor_nominal), casas(desvio_inferior), casas(desvio_superior))`
   lidas das strings, e `(nominal + desvio).toFixed(casas)`. **`inf = nominal + desvio_inferior`,
   `sup = nominal + desvio_superior`, COM SINAL** — `nominal − |inf|` está ERRADO para o plano
   unilateral `+0,005/+0,021`.

## Regras de negócio

| RN | Enunciado | Onde é provada |
|---|---|---|
| RN-01 | Modal com plano ativo mostra um campo por característica (nome, unidade, nominal, faixa `[inf; sup]`); **sem plano, o modal é idêntico ao de hoje** | Jest `InspecoesAlmoxarifado` |
| RN-02 | Com ≥1 medida preenchida, a caixa *Divergência dimensional* fica **desabilitada E desmarcada** (`checked={false}` independentemente do estado — achado 2) com o texto *"Derivada das medidas ao salvar — fora da tolerância liga sozinha"*, e o `forEach` das flags **pula** `divergencia_dimensional`; ao limpar todas as medidas, a caixa volta ao estado que tinha | Jest (**peso**: marcar → preencher → afirmar → limpar) |
| RN-03 | Payload leva só linhas com valor preenchido, como **string crua**; recusa do servidor vai literal ao toast e o modal continua aberto com os valores | Jest |
| RN-04 | Instrumento com `calibracao_vigente === false` aparece *"(calibração vencida)"* e desabilitado; `null` aparece normal | Jest |
| RN-05 | `GET /inspecoes/historico`: decididas, ordem `data_inspecao DESC, id DESC` (desempate — achado 5), filtro `material_id`, `medidas_total` e `medidas_nao_conformes`; `GET /inspecoes/:id/medidas`: valores **congelados** (editar o plano depois não muda a resposta); 404 *"Inspeção não encontrada"* (também para `id` não numérico, via `paraNumeroFinito`); **leitura sem perfil → 200** (D6, documentada por teste) | `inspecaoHistorico.api.test.js` |
| RN-06 | Aba Histórico lista e expande as medidas com conforme/não conforme e instrumento | Jest |
| RN-07 | O toast de sucesso, quando `res.data?.medidas_registradas > 0`, diz *"Inspeção registrada! Divergência dimensional: sim (2 medidas)"* / *"…: não (N medidas)"*; senão, *"Inspeção registrada!"* como hoje (o mock atual não traz os campos — achado 6) | Jest (com `api.post` sobrescrito) |
| RN-08 | Falha ao carregar o plano **não** vira "sem plano" em silêncio: `toast.warn('Não foi possível carregar o plano de inspeção')` e o modal abre sem o bloco (achado 9) | Jest |

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
i.recebimento_item_id = ri.id JOIN materiais_almoxarifado m JOIN recebimentos_material_almoxarifado r`
(molde: `alertRegistry.js:117-126`), subselects para as contagens, `ORDER BY i.data_inspecao DESC,
i.id DESC`. Registrar antes de `/inspecoes/:id/medidas` com um comentário preventivo para quem
criar `/inspecoes/:id` no futuro — **mas hoje não há colisão possível** (achado 3: nenhuma
`/inspecoes/:id` existe; segmentos de 2 vs 3 nunca casam; provado com Express real). **Não há
controle positivo de ordem** — a versão anterior prometia um, e ele era no-op.

**C2 — `GET /api/almoxarifado/inspecoes/:id/medidas`** (`auth`). 404 `{ error: 'Inspeção não
encontrada' }`. Resposta: array de
`{ id, plano_id, caracteristica, unidade, valor_nominal, desvio_inferior, desvio_superior,
   valor_medido, conforme, ferramenta_id, ferramenta_nome, created_at }` em ordem de `id`.

**C3 — Front, modal de decisão** (`InspecoesAlmoxarifado.js`): ao abrir o modal,
`api.get('/almoxarifado/planos-inspecao', { params: { material_id } })` (falha → RN-08) e, **só se
vier ≥1 característica**, `api.get('/almoxarifado/ferramentas')`. Bloco **"Medidas do plano"**
abaixo de *Problemas identificados*: por característica, `label` = `caracteristica (unidade) —
nominal N · faixa [inf ; sup]` com **inf/sup somados COM SINAL e formatados pelas casas do plano**
(Global Constraint 6; Jest obrigatório: `+0.005/+0.021` sobre 10 → `[10.005 ; 10.021]`;
`12.3 ±0.1` → `[12.2 ; 12.4]`), `input type="text" inputMode="decimal"` com placeholder
*"ex.: 12.40 (ponto decimal)"* (achado 7), `select` de instrumento (opção vazia *"— sem
instrumento —"*). Estado `medidas: { [plano_id]: { valor, ferramenta_id } }`.
No submit: linhas com `valor.trim() !== ''` viram `{ plano_id, valor_medido: valor /*string
crua*/, ferramenta_id? }`; **a chave `medidas` só entra no payload se houver ≥1 linha** (achado
12); se houver, o `forEach` das flags **pula** `divergencia_dimensional` e a caixa é renderizada
`checked={false} disabled` com o texto da RN-02. Erro → `toast.error(err.response?.data?.error ||
'Erro ao registrar inspeção')`, modal **aberto**. Sucesso → RN-07.
Texto de ajuda fixo abaixo do bloco (achado 8): *"Com medidas preenchidas, a divergência
dimensional é calculada só pelas características do plano. Divergência em algo que o plano não
mede vai em Observações."*

**C4 — Front, aba Histórico**: a tela ganha duas abas (*Pendentes* — a de hoje — e *Histórico*).
Histórico chama C1 (filtro de material reaproveitando o `materialFilter` existente), lista
`data · material · aprovada/reprovada · flags · responsável · medidas (N, k fora)`, e ao expandir
uma linha chama C2 e mostra a tabela `característica | nominal | faixa | medido | conforme |
instrumento`. Linha com `medidas_total === 0` mostra *"Sem medidas registradas"*.

## Sort topológico

| # | Task | Tipo | Depende |
|---|---|---|---|
| 1 | C1 + C2 no backend + `inspecaoHistorico.api.test.js` | **tronco** | — |
| 2 | Modal de medidas (C3, RN-01..04, RN-07, RN-08) + Jest em `InspecoesAlmoxarifado.js` | **galho** | contrato da Etapa 27 (já existe) |
| 3 | **Componente novo** `HistoricoInspecoes.js` + `HistoricoInspecoes.test.js` (C4, RN-06), recebendo `materialFilter` por prop | **galho** — arquivo próprio, paralelo à 2 (achado 8 da revisão) | contrato C1/C2 |
| 3b | Abas *Pendentes* / *Histórico* em `InspecoesAlmoxarifado.js` (~10 linhas; a aba Histórico **não** renderiza a tabela de pendentes — os helpers do teste selecionam `.almox-table tbody tr` sem discriminar) | galho curto, **depois** da 2 e da 3 | 2, 3 |
| 4 | Integração: decidir com medidas pela rota → `historico` traz `medidas_total` → `/:id/medidas` traz os valores; editar o plano depois → resposta inalterada (congelado) | tronco | 1 |

Tasks 1, 2 e 3 rodam em paralelo (arquivos disjuntos). A 3 mocka C1/C2 na fronteira HTTP.

## Task 1 — Leitura de inspeção decidida (tronco)

Arquivos: `server/services/almoxarifado/inspectionService.js` (`listarHistorico`,
`listarMedidasDaInspecao`), `server/routes/almoxarifado/extended.js` (as duas rotas, C1 antes de
qualquer `/inspecoes/:id`), `server/tests/api/inspecaoHistorico.api.test.js` (novo).

TDD (molde: `server/tests/api/planoInspecao.api.test.js` e `medidasInspecao.api.test.js` para
montar recebimento → item retido → decidir com medidas): `[RN-05] historico lista a decidida com
medidas_total e nao_conformes`, `[RN-05] duas decididas no mesmo segundo saem em ordem de id
DESC`, `[RN-05] filtro material_id`, `[RN-05] limite`, `[RN-05] medidas da inspecao com
tolerancia CONGELADA (PUT no plano depois nao muda)`, `[RN-05] 404 inspecao inexistente e 404
para id nao numerico (nao 500)`, `[RN-05/D6] usuario sem perfil (fallback PRODUCAO) le historico
e medidas -> 200`. Controle positivo: trocar a leitura das medidas para JOIN no plano atual → o
congelado cai; tirar o `i.id DESC` → o desempate cai (se não cair, o teste é vazio — pare e
reporte).

Commit: `Almoxarifado Etapa 29 Task 1: a inspecao decidida e as medidas ganham leitura`.

## Task 2 — Medidas no modal, B60 cumprida (galho)

Arquivo: `client/src/components/almoxarifado/InspecoesAlmoxarifado.js` + `.test.js`.
Jest: (1) sem plano (`[]`), modal idêntico (nenhum "Medidas do plano", nenhuma chamada a
`/ferramentas`); (2) com plano, N campos com faixa — **rótulos `[10.005 ; 10.021]` e
`[12.2 ; 12.4]`**; (3) **peso, nesta ordem**: marcar a caixa *Divergência dimensional* → preencher
`'12,4'` numa medida → afirmar `disabled === true`, `checked === false`, texto presente →
salvar → `api.post` com `expect.not.objectContaining({ divergencia_dimensional: true })` e
`medidas[0].valor_medido === '12,4'` (string) → limpar a medida → caixa habilitada e **marcada de
novo**; (4) linha vazia: payload **sem a chave** `medidas`; (5) instrumento vencido desabilitado e
rotulado *"(calibração vencida)"*; (6) erro do servidor → toast literal e modal aberto; (7) RN-07
com `api.post` sobrescrito para `{ divergencia_dimensional: 1, medidas_registradas: 2 }` → toast
*"…: sim (2 medidas)"*, e com o mock padrão → *"Inspeção registrada!"*; (8) RN-08 `toast.warn` se
`/planos-inspecao` rejeitar.
Controle positivo: trocar `valor_medido: valor` por `parseFloat(valor)` → (3) cai na string;
remover o `disabled` da caixa → (3) cai; trocar `checked={false}` pelo estado → (3) cai no
`checked`; trocar a soma com sinal por `nominal − Math.abs(inf)` → (2) cai no `10.005`.

Commit: `Almoxarifado Etapa 29 Task 2: o formulario de inspecao ganha as medidas do plano`.

## Task 3 — Componente `HistoricoInspecoes` (galho, paralelo à 2)

Arquivos novos: `client/src/components/almoxarifado/HistoricoInspecoes.js` (props:
`materialFilter`) e `HistoricoInspecoes.test.js`. Jest: (1) lista com contagem de medidas e
*"k fora"*; (2) expandir chama `/:id/medidas` e mostra a tabela com conforme/não conforme e
instrumento; (3) `medidas_total === 0` mostra *"Sem medidas registradas"* sem chamar C2; (4)
`materialFilter` vai como `material_id` na chamada.

Commit: `Almoxarifado Etapa 29 Task 3: a aba Historico mostra as medidas de cada inspecao`.

## Task 3b — As abas (após 2 e 3)

`InspecoesAlmoxarifado.js`: estado `aba` (`pendentes`|`historico`), duas abas no topo, e a aba
Histórico renderiza `<HistoricoInspecoes materialFilter={materialFilter} />` **no lugar** da
tabela de pendentes (nunca junto). Jest: trocar de aba esconde a tabela de pendentes e mostra o
componente; os 11+8 testes anteriores continuam verdes.

Commit: `Almoxarifado Etapa 29 Task 3b: a tela de Inspecoes ganha as abas Pendentes e Historico`.

## Task 4 — Integração pela rota

`inspecaoFluxoMedidas.api.test.js`: plano → recebimento → decidir com 2 medidas (1 fora) pela
rota → `historico` (`medidas_total 2`, `nao_conformes 1`, `divergencia_dimensional 1`) →
`/:id/medidas` (2 linhas, `conforme` 0/1) → `PUT /planos-inspecao/:id` mudando o nominal →
`/:id/medidas` **inalterado**. Suíte completa serial.

## Fechamento

`fechar-etapa`: novidades (seção; C34 e C35 **fechados**, riscados no lugar; **B60 cumprida em 2
de 3 partes** — somente leitura e explicada, sim; **pré-visualização ao digitar, DESCARTADA** de
propósito porque duplicaria a régua que a 27 mediu errar 12,3% no limite; o resultado vem no toast
— achado 4), spec 09 (`:118` e `:121` marcados com hash; `:119` dizendo que a exigência de
pré-visualização foi descartada; o que falta: cadastro do plano pela tela, fotos), mapa, guia
(roteiro com plano cadastrado por API + tela; **vírgula dá recusa, ponto decimal**; característica
desativada some do modal; com medidas não se flaga característica fora do plano), manual
(§15.2.x), retro.

## Próxima tarefa detalhada

(preencher no fechamento)
