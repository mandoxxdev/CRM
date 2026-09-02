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
| 1 | C1 + C2 no backend + `inspecaoHistorico.api.test.js` — ✅ `96525d5` | **tronco** | — |
| 2 | Modal de medidas (C3, RN-01..04, RN-07, RN-08) + Jest em `InspecoesAlmoxarifado.js` — ✅ `75f1e24` | **galho** | contrato da Etapa 27 (já existe) |
| 3 | **Componente novo** `HistoricoInspecoes.js` + `HistoricoInspecoes.test.js` (C4, RN-06), recebendo `materialFilter` por prop — ✅ `38e74f4` | **galho** — arquivo próprio, paralelo à 2 (achado 8 da revisão) | contrato C1/C2 |
| 3b | Abas *Pendentes* / *Histórico* em `InspecoesAlmoxarifado.js` (~10 linhas; a aba Histórico **não** renderiza a tabela de pendentes — os helpers do teste selecionam `.almox-table tbody tr` sem discriminar) | galho curto, **depois** da 2 e da 3 | 2, 3 |
| 4 | Integração: decidir com medidas pela rota → `historico` traz `medidas_total` → `/:id/medidas` traz os valores; editar o plano depois → resposta inalterada (congelado) — ✅ `dbde88b` | tronco | 1 |

Tasks 1, 2 e 3 rodam em paralelo (arquivos disjuntos). A 3 mocka C1/C2 na fronteira HTTP.

## Task 1 — Leitura de inspeção decidida (tronco) — ✅ FEITA (`96525d5`)

> **Fechamento (2026-08-30).** Entregue como previsto: `inspectionService.listarHistorico(db,
> { material_id?, limite? })` e `listarMedidasDaInspecao(db, inspecaoId)` (→ `null` se a inspeção
> não existe, `[]` se decidida sem medida — a rota distingue 404 de "sem medida"); rotas
> `GET /inspecoes/historico` e `GET /inspecoes/:id/medidas` em `extended.js`, `auth` sem gate novo
> (D6), registradas logo após `/pendentes` com o comentário preventivo de ordem (achado 3: hoje não
> há colisão; **não** há controle positivo de ordem, como o plano manda). Exporta também
> `HISTORICO_LIMITE_PADRAO` (100) e `HISTORICO_LIMITE_TETO` (500).
> Teste `inspecaoHistorico.api.test.js`: **11 cenários** (os 7 do plano + 4 de borda: decidida sem
> medida no histórico com `medidas_total 0`; item pendente **não** aparece; `/:id/medidas` de
> decidida sem medida → `[]` não 404; ordem principal por data antes do id), vermelhos por
> asserção nos 11 antes das rotas (0/11: `404 !== 200`). O empate de `data_inspecao` é **forçado
> por UPDATE** no setup; o teto 500 é provado com `db` falso lendo o último parâmetro do SQL
> (`[9999, ausente, 'abc', 0, -5] → [500, 100, 100, 100, 100]`), não criando 501 inspeções.
> Placar: `test:api` **163/163** arquivos (inspecaoHistorico 11/11, medidasInspecao 21/21,
> planoInspecao 22/22); `test:almoxarifado` 42/42.
>
> **Controles positivos** (md5 `06fbdef9…` antes/restaurado nos dois, `git diff --stat -- server`
> vazio): (a) leitura das medidas trocada por `JOIN planos_inspecao_almoxarifado` lendo
> `p.caracteristica/p.valor_nominal/...` → cai **"caracteristica congelada no ato, nao a
> renomeada"** (10/11); (b) `ORDER BY` sem `i.id DESC` → cai **"empate em data_inspecao tem de
> desempatar por id DESC; veio [3,4]"** e, de brinde, "com limite, quem entra e a mais recente"
> (as três decisões do cenário de limite caem no mesmo segundo) — 9/11. O desempate **não** é
> teste vazio.
>
> **Divergências/decisões (reversíveis):** `material_id` não numérico no histórico é **ignorado**
> (lista tudo, 200) em vez de 400 — mesma régua de `/pendentes`, que passa `req.query` direto;
> `limite` inválido/zero/negativo cai no default 100, nunca 400. O cenário de D6 afirma também o
> contraste: o mesmo usuário sem perfil toma **403** na decisão — D6 é "sem gate NOVO na leitura",
> não "sem gate". Contrato C1 checado campo a campo e C2 com `Object.keys` exato, para o mock da
> Task 3 não inventar nome.
>
> **Para a Task 4:** decidir pela rota exige `encaminhamento` do enum
> `['DEVOLVER','ANALISE_ENGENHARIA','SUBSTITUICAO']` (texto livre dá 400 — o primeiro cenário
> desta task caiu nisso); o `PUT /planos-inspecao/:id` precisa de `gerenciar_plano_inspecao`
> (ADMIN do harness com `role: 'admin'` serve); o helper `itemRetido`/`novoPlano`/`decidir` deste
> arquivo é o molde. O fluxo da Task 4 já está coberto ponta a ponta pelo cenário "congelado"
> daqui — a Task 4 acrescenta a **suíte serial** e a leitura pelo `historico` após o PUT.


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

## Task 2 — Medidas no modal, B60 cumprida (galho) — ✅ FEITA (`75f1e24`)

> **Fechamento (2026-08-30).** 20/20 no `InspecoesAlmoxarifado.test.js`. Divergências do
> enunciado, todas deliberadas: o toast da RN-07 flexiona o plural — *"(1 medida)"* /
> *"(2 medidas)"*; se `GET /ferramentas` rejeitar, `toast.warn('Não foi possível carregar os
> instrumentos')` e o modal abre com o seletor vazio (mesma régua da RN-08, que o enunciado só
> previa para o plano); guarda de corrida `aberturaRef` para o plano de um modal já fechado não
> pousar no modal seguinte; o rótulo da característica mostra `nominal N` cru (sem `toFixed`) —
> a faixa `[inf ; sup]` é que é formatada com as casas do plano; o teste (3) usa `api.post`
> **rejeitando** para conseguir limpar a medida depois de ler o payload (com o mock resolvendo,
> o modal fecha e a caixa some antes da asserção "marcada de novo").


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

## Task 3 — Componente `HistoricoInspecoes` (galho, paralelo à 2) — ✅ FEITA (`38e74f4`)

> **Fechamento (2026-08-30).** 7/7 no `HistoricoInspecoes.test.js`. O componente rende **só** o
> `almox-table-container` (sem cabeçalho nem filtro próprios — quem envolve é a tela da 3b);
> flags da inspeção viram badges; erro do C2 ao expandir → toast literal **e a linha recolhe**
> (não fica um "carregando" eterno); exporta `formatarFaixa` como named export. Há **duas
> implementações equivalentes** da faixa `[inf ; sup]` (esta e a do modal da Task 2) — unificar
> é opcional e fica para quem tocar as duas de novo.


Arquivos novos: `client/src/components/almoxarifado/HistoricoInspecoes.js` (props:
`materialFilter`) e `HistoricoInspecoes.test.js`. Jest: (1) lista com contagem de medidas e
*"k fora"*; (2) expandir chama `/:id/medidas` e mostra a tabela com conforme/não conforme e
instrumento; (3) `medidas_total === 0` mostra *"Sem medidas registradas"* sem chamar C2; (4)
`materialFilter` vai como `material_id` na chamada.

Commit: `Almoxarifado Etapa 29 Task 3: a aba Historico mostra as medidas de cada inspecao`.

## Task 3b — As abas (após 2 e 3) — ✅ FEITA (`cf49729`)

> **Fechamento (2026-08-30).** Estado `aba` (`pendentes`|`historico`), duas abas em
> `.almox-abas` (hook de teste), e a aba Histórico renderiza `<HistoricoInspecoes
> materialFilter={materialFilter} />` **no lugar** da tabela de pendentes. **Divergências
> deliberadas:** o título da tela passou de *Inspeção de Recebimento* para **Inspeções**, com
> subtítulo por aba (*"Inspeções decididas e as medidas registradas em cada uma"* no Histórico);
> o botão de recarregar a fila só aparece na aba Pendentes. 4 cenários novos; os 20+7 anteriores
> continuaram verdes.




`InspecoesAlmoxarifado.js`: estado `aba` (`pendentes`|`historico`), duas abas no topo, e a aba
Histórico renderiza `<HistoricoInspecoes materialFilter={materialFilter} />` **no lugar** da
tabela de pendentes (nunca junto). Jest: trocar de aba esconde a tabela de pendentes e mostra o
componente; os 11+8 testes anteriores continuam verdes.

Commit: `Almoxarifado Etapa 29 Task 3b: a tela de Inspecoes ganha as abas Pendentes e Historico`.

## Task 4 — Integração pela rota — ✅ FEITA (`dbde88b`)

`inspecaoFluxoMedidas.api.test.js`: plano → recebimento → decidir com 2 medidas (1 fora) pela
rota → `historico` (`medidas_total 2`, `nao_conformes 1`, `divergencia_dimensional 1`) →
`/:id/medidas` (2 linhas, `conforme` 0/1) → `PUT /planos-inspecao/:id` mudando o nominal →
`/:id/medidas` **inalterado**. Suíte completa serial.

> **Fechamento (2026-08-30).** 9/9, **tudo por HTTP** (nenhum INSERT nem chamada de serviço):
> `PUT /configuracoes` + `POST /materiais` crítico → `POST /planos-inspecao` ×2 (simétrica
> `12.3 ±0.1` e unilateral `10 +0.005/+0.021`) → `POST /ferramentas` ×2 exigindo calibração +
> `POST /:id/calibracoes` (multipart, `.field`) com uma vigente e uma **vencida** (registrada, não
> ausente) → `GET /ferramentas` rotula `calibracao_vigente` `true`/`false` (RN-04 da tela) →
> `POST /recebimentos` + `/aprovar`, item lido de `GET /inspecoes/pendentes` (`item_id`,
> `quantidade_retida`) → decisão com 2 medidas sem a flag no payload → resposta
> `divergencia_dimensional 1`, `medidas_registradas 2` → `historico` 2/1/1 → `/:id/medidas` com
> `conforme` 1/0 e `ferramenta_nome` → `PUT` no plano mudando nominal **e** característica, e as
> duas leituras saem `JSON.stringify` iguais ao snapshot → segundo item: instrumento vencido → 400
> literal, `historico` sem linha nova e o item **continua na fila**; `'12,4'` → 400 literal, nada
> gravado; sem medidas com `divergencia_dimensional: true` → `historico` com flag 1 e
> `medidas_total 0`, `/:id/medidas` → `[]`.
>
> **Controle positivo** (commit antes; md5 `06fbdef9…` → sabotado → `06fbdef9…` restaurado;
> `git diff --stat -- server` vazio), em duas rodadas porque a primeira caiu **antes** do
> previsto: (a) `conforme: aval.conforme ? 1 : 0` → `conforme: 1` no `resolverMedidas` derruba
> primeiro o cenário da **decisão** (a resposta vem `divergencia_dimensional: 0` — a derivação
> lê o mesmo `conforme`), e o do `historico` cai na guarda; (b) forçar `1` só no **INSERT** das
> medidas (derivação intacta) derruba o cenário do `historico` exatamente em
> `medidas_nao_conformes` (`0 !== 1`) e o de `/:id/medidas` em *"10.03 esta acima de 10.021"*
> (`1 !== 0`). Os dois caminhos de fuga estão cobertos.
>
> **Achado de integração:** o backend se comportou como a tela assume em tudo — nenhuma linha de
> produção mudou. Única surpresa foi de nome: a fila de pendentes chama a coluna de
> `quantidade_retida`, não `quantidade_em_inspecao`.
>
> **Placar da suíte serial:** `test:api` 163/164 arquivos na primeira rodada — a única falha,
> `remessaTerceiroCiclo` (*UNIQUE constraint failed: remessas_terceiro_almoxarifado.numero*),
> passa 53/53 isolada; é flake preexistente de `thirdPartyService.gerarNumero()`
> (`REM-` + 8 dígitos de `Date.now()` + aleatório 0..99: duas remessas no mesmo milissegundo com
> o mesmo sorteio colidem). Fora do escopo desta task; candidato a correção própria (sequência
> ou `INSERT` com retry). `test:almoxarifado` 42/42, `test:validation` 4/4, `test:safealter`
> 3/3, `test:sqlite` 5/5; client 40 suítes / 613 testes verdes e `CI=true build` compilou.

## Fase 5 — Revisão adversarial (2026-08-30) — ✅ FEITA, e ela mudou a etapa

**Duas lentes, dois revisores frescos em paralelo** (backend: exposição sob D6, bordas de
`limite`/`material_id`, correção do SQL, congelamento, "este teste passaria com a feature
quebrada?"; front: B60 na prática, formatação da faixa, corridas do modal, aba Histórico, mesma
última pergunta). **Uma primeira tentativa, na véspera, morreu com `rate_limit` nos dois agentes e
não produziu achado nenhum** — está dito aqui porque a alternativa seria a Fase 5 parecer feita.

**Nenhum achado BLOQUEANTE nos dois.** Sete achados importantes viraram trabalho, em dois
fix-rounds:

### Fix-round backend — `f6b0e3d`

| # | Achado | Virou |
|---|---|---|
| 1 | `limiteHistorico` guardava com `n <= 0`; `?limite=0.5` passava e `Math.floor` dava `LIMIT 0` — **200 com lista vazia**, o servidor afirmando "não há histórico" para quem tem | código (`n < 1`) + cenário na fronteira do SQL **e** pela rota |
| 2 | **Teste vazio:** todo cenário com medida era simétrico (1 dentro / 1 fora), então `COUNT(conforme = 0)` e `= 1` davam o mesmo número — trocar o operador deixava 20 cenários verdes. É o número que a aba imprime (`2 (1 fora)`, badge vermelho) | cenário **assimétrico** (3 medidas, 1 fora) |
| 3 | **Teste vazio:** `divergencia_quantidade`, `dano_fisico` e `material_incorreto` valiam 0 em todo lugar — cruzar as colunas no SELECT era invisível | três decisões com os padrões `1/0/0`, `0/1/0`, `0/0/1` |
| 4 | Sem paginação, offset, janela de data ou sinal de truncamento: > 500 inspeções de um material deixa as antigas inalcançáveis, e a tela nem manda `limite` (teto prático 100) | **não virou código** — furo **C39** nas novidades, com o que foi descartado |

**Não confirmados (e isso vale registrar):** exposição sob D6 — `GET /movimentacoes` já devolve
`SELECT m.*` com `usuario_nome` e a `justificativa` (que **é** o `observacoes` da inspeção) ao
mesmo público; nenhum campo do C1 é mais sensível que o que já sai. Bordas: ~20 formas de
`limite` e `material_id` (array, objeto, `1e999`, `"1 OR 1=1"`) → 200 sem 500, tudo parametrizado;
`:id` idem → 404 limpo. `conforme` NULL é impossível (`NOT NULL`). JOIN não duplica (três N:1 por
PK). Sombreamento de rota: não existe `/inspecoes/:id` de dois segmentos.

### Fix-round front — `b20d056`

| # | Achado | Virou |
|---|---|---|
| 1 | Falha do C1 no Histórico renderizava *"Nenhuma inspeção decidida ainda."* — o toast some em segundos e a tela fica **afirmando que não há inspeção**. É o pecado que a RN-08 evita no modal; o teste (7) tinha *"sem virar lista vazia em silêncio"* no título e afirmava **só o toast** | estado de erro com mensagem do servidor + **Tentar de novo**, 2 cenários |
| 2 | **A fórmula da faixa estava duplicada nas duas telas e as cópias já divergiam** (`null` → uma inventa `[10.000 ; …]`, a outra `—`; `'0,005'` → uma dá `NaN`) | módulo `faixaTolerancia.js`, uma cópia só |
| 3 | **Teste vazio:** `.toFixed(casas)` não estava ancorado em **nenhum** dos dois arquivos — as fixtures (`12.3 ±0.1`, `10 +0.005/+0.021`) são exatamente representáveis | fixture `1.1 ±0.1` (`1.1 + 0.1` = `1.2000000000000002`) |
| 4 | **Duas guardas load-bearing sem teste:** tirar `aberturaRef` ou `setMedidas({})` deixava 24/24 verde. O efeito real é medida do item A indo no payload do item B (mesmo material, `plano_id` válido — o servidor aceita) | 2 cenários |
| 5 | Plano com 2 características e 1 medida conforme: a caixa trava, a flag manual some, o servidor deriva 0 — a divergência que o inspetor viu **desaparece** | **a régua NÃO mudou** (o servidor deriva por medida, não por característica; mudar seria contrato novo). Virou texto de ajuda nomeando o caso + cenário que congela a decisão + furo **C40** |
| 6 | `unidade` é nullable e o modal renderizava `Diâmetro ()` | guarda |
| 7 | `valor_medido` vai sem `trim` enquanto o filtro usa `.trim()` | **não virou código** — assimetria, não bug (`paraNumeroFinito` faz trim no servidor) |

**Não confirmados no front:** a B60 no payload e na caixa (mutar qualquer um dos dois mata o
cenário 3); faixa com sinal; string crua; a guarda de corrida **funciona** de fato; toda a aba
Histórico (cache por id, `medidas_total === 0` não chama C2, `materialFilter`, substituir a
tabela); e os contratos batem com o backend **real**, não só com o mock.

### Lição da etapa, para a próxima

**Fixture simétrica ou exatamente representável é teste vazio esperando ser descoberto.** Três dos
sete achados são a mesma causa: `1 dentro / 1 fora` faz `COUNT(=0)` e `COUNT(=1)` empatarem;
`12.3 + 0.1` dá `12.4` cravado e não exercita o `toFixed`; três flags em `0` não distinguem coluna
nenhuma. **A fixture tem de ser assimétrica em toda dimensão que o código diferencia** — e essa
pergunta ("o que nesta fixture é igual e não deveria ser?") custa segundos ao escrever o teste.

## Fechamento

`fechar-etapa`: novidades (seção; C34 e C35 **fechados**, riscados no lugar; **B60 cumprida em 2
de 3 partes** — somente leitura e explicada, sim; **pré-visualização ao digitar, DESCARTADA** de
propósito porque duplicaria a régua que a 27 mediu errar 12,3% no limite; o resultado vem no toast
— achado 4), spec 09 (`:118` e `:121` marcados com hash; `:119` dizendo que a exigência de
pré-visualização foi descartada; o que falta: cadastro do plano pela tela, fotos), mapa, guia
(roteiro com plano cadastrado por API + tela; **vírgula dá recusa, ponto decimal**; característica
desativada some do modal; com medidas não se flaga característica fora do plano), manual
(§15.2.x), retro.

## Retro de 4 números (2026-08-30)

1. **Rodadas de correção até verde: 2** (um fix-round por lente, nenhuma rodada repetida). Nenhum
   teste falhou duas vezes seguidas; o detector de esteira não chegou a ser exercitado.
2. **Achados da revisão: 7 reais, 0 ruído.** Os dois revisores reproduziram **tudo** que
   reportaram (sabotagem com `md5sum`, ou probe com o mutante aplicado), e os dois disseram
   explicitamente o que **tentaram refutar e não conseguiram** — que é o que dá para confiar no
   "nenhum bloqueante". **1 achado (paginação) e 1 assimetria (`trim`) NÃO viraram código**, com o
   motivo escrito. **Custo:** a primeira tentativa dos dois revisores morreu em `rate_limit` e
   produziu zero — a Fase 5 real rodou um dia depois.
3. **Paralelismo: 3 galhos em paralelo de fato** (Tasks 1, 2 e 3, arquivos disjuntos), mais 2
   revisores em paralelo. **Zero retrabalho** por conflito entre galhos: a Task 4 (integração pela
   rota) achou que "o backend se comportou como a tela assume em tudo — nenhuma linha de produção
   mudou". O congelamento de contrato da Fase 2 pagou.
4. **Defeito que escapou:** preencher na etapa seguinte. Candidatos conhecidos e declarados:
   paginação do Histórico (**C39**) e a derivação por medida vs. por característica (**C40**).

**Quinto número, não previsto pela retro mas que a etapa produziu:** **5 testes passavam com a
feature quebrada** e só foram descobertos na Fase 5 — todos por fixture simétrica ou exatamente
representável. É a maior fonte de falso verde desta base até agora, e virou lição escrita acima.

## Próxima tarefa detalhada — Cadastro do plano de inspeção PELA TELA

**Por que esta, e não outra.** É o item que o fechamento da 29 nomeou como *"o que falta para 🟢"*
de maior valor na feature 09, e é o único que é **só front**: enquanto o plano nascer por API, o
bloco *Medidas do plano* que a 29 entregou **não aparece para ninguém** — a etapa inteira fica
inalcançável por quem opera. É também a Fase 0 já meio medida: os contratos abaixo foram lidos no
código durante a 29.

**O que já está pronto e NÃO precisa ser reaberto** (Etapa 27, testado em
`server/tests/api/planoInspecao.api.test.js`, 22 cenários):

- `GET /api/almoxarifado/planos-inspecao?material_id=` (`extended.js:292`) — `auth` só; **400
  *"Material é obrigatório"*** sem o parâmetro; **`?todos=1` traz as inativas** (é o que a tela de
  cadastro precisa, e a tela de decisão **não** usa).
- `POST /api/almoxarifado/planos-inspecao` (`extended.js:312`, gate **`gerenciar_plano_inspecao`**
  = `[ADMINISTRADOR, QUALIDADE, ENGENHARIA]`). Corpo: `{ material_id, caracteristica, unidade?,
  valor_nominal, desvio_inferior?, desvio_superior? }`. Recusas literais: *"Material é
  obrigatório"*, *"Material não encontrado"* (404), *"Característica é obrigatória"*, *"Valor
  nominal é obrigatório"*, *"O desvio inferior não pode ser maior que o superior"*, *"Já existe
  esta característica no plano deste material"*. **Zero é nominal legítimo** (batimento, planeza) —
  a checagem é `=== null`, não falsy; a tela **não pode** recusar 0. Desvio omitido vira **0**, e
  plano com os dois zerados é faixa de largura zero, que é **válido**.
- `PUT /api/almoxarifado/planos-inspecao/:id` (`:360`) e `DELETE .../:id` (`:429`, **soft delete** —
  `ativo = 0`; desativar **libera o nome** para ser recriado, por causa do índice único parcial
  `(material_id, caracteristica) WHERE ativo = 1`).
  > **Esta linha dizia "Não há rota de REATIVAR — medir isso na Fase 0 antes de prometer o botão".
  > ESTAVA ERRADO**, e a Fase 0 da Etapa 30 mediu (2026-08-30, `af7adea`): o **`PUT` aceita
  > `ativo`** (`extended.js:393`), com *preserve-when-omitted* declarado no próprio código —
  > omitir mantém o valor atual, e `{ ativo: 1 }` **reativa**. Corrigido à vista em vez de apagado:
  > foi a própria instrução "meça antes de prometer" que pegou o erro.
  > **O que era verdade por trás da frase errada:** reativar **pode colidir**. Como o índice é
  > parcial, desativar *Diâmetro* libera o nome; se alguém recriar *Diâmetro*, reativar a antiga
  > responde **400 *"Já existe esta característica no plano deste material"*** — mensagem que, sob
  > um botão "Reativar", não explica nada. Virou a RN-06 do design da Etapa 30.
- As três operações **deixam rastro na Auditoria**, entidade *Plano de inspeção*, com de/para.

**Pontos de atenção, todos aprendidos na 29:**

1. **A faixa exibida no formulário de cadastro tem de importar `formatarFaixa` de
   `client/src/components/almoxarifado/faixaTolerancia.js`.** Não reescrever: esta etapa acabou de
   fundir duas cópias que já divergiam. E **nenhuma comparação de tolerância no client**.
2. **Desvio COM SINAL, e o formulário tem de deixar isso óbvio.** O caso unilateral
   (`+0,005/+0,021`) é o que quebra a intuição de "±". Um rótulo que mostre a faixa resultante ao
   digitar (`[10.005 ; 10.021]`) resolve — e aqui pré-visualizar é **legítimo**, ao contrário da
   B60, porque é aritmética de exibição, não a régua de conformidade.
3. **Onde pendurar a tela.** O cadastro é **por material**, então o lugar natural é a ficha do
   material (`MateriaisAlmoxarifado`), não a tela de Inspeções — mas **medir antes**: uma sessão
   desta base já desenhou uma etapa inteira sobre "esta tela não existe" e a tela existia. Procure
   pelo nome do **contrato** (`planos-inspecao`), não pelo nome que você imagina.
4. **Gate na tela e no botão.** `gerenciar_plano_inspecao` **não** é `inspecionar`: quem decide
   inspeção (Almoxarife) **não** cadastra plano, e quem cadastra (Engenharia) **não** decide. A UI
   tem de barrar antes do formulário via `useAlmoxPermissoes`, e o backend recusa de qualquer jeito.
5. **Fixture assimétrica** — a lição da 29. Ao testar a lista do plano, não use duas características
   com os mesmos desvios; ao testar o de/para da edição, não mude só um campo.
6. **O que fica de fora, e diga que fica:** plano por família (**B59**), importar plano de outro
   material, e anexar desenho técnico (depende do módulo de anexos).
