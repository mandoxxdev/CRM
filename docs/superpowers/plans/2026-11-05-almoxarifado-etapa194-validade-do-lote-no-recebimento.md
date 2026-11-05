# Etapa 194 — Nota com o mesmo lote e outra validade: o recebimento avisa

> **Status:** ✅ **FECHADA em 2026-11-05** — plano `ce606d41`, Fase 2 `e6308090`, T1 `32ff286a`, T2 `e8803937`, T3 `57bdb6b2`,
> Fase 5 `77102677`, fechamento (novidades, specs, mapa, guia, manual e este plano) no commit "Etapa 194: fechamento". Ver "Execução" e
> "Próxima tarefa detalhada" no fim. Letra B usada: **B1300–B1308** (a B1308 nasceu na Fase 5); letra C: **C460** (a C459 não foi aberta).
> Histórico: 📝 **plano escrito (2026-11-05, sobre `0a26e91c`)** — Fases 0 e 1; **Fase 2 feita** (9 achados aplicados no bloco "Fase 2 — correções", que manda sobre o resto). Falta: execução, Fase 5,
> fechamento. Feature **10** (lotes, séries e etiquetas). Fecha a **B1296** da 191, a **B1277** e o **C456** da 190.
> Estimativa enviada à empresa: `docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas.txt`, **item 2, 3h**
> ("Passa a avisar no recebimento, para a pessoa conferir a data antes de gravar"). **Medida desta Fase 0: cabe no limite (3h a 3h30)** —
> ver "Tamanho e risco" no fim. Escopo cortado para caber: aviso, nunca recusa; sem e-mail, sem não conformidade, sem trocar a data de
> lote com saldo.
> **Letra B:** novidades commitada até **B1299** (B1283–B1288 soltas, não usadas aqui). Esta etapa usa **B1300–B1307**. Letra C: **C459**,
> **C460**. Letra A: nenhuma (nada a rodar antes do deploy).
> Tamanho: **P/M**.

## Objetivo (em linguagem simples)

Hoje, quando chega uma nota com um lote que **já existe** no sistema, a validade digitada na nota é **jogada fora, calada**:

- se o lote já tinha validade e a nota traz **outra**, fica a primeira e ninguém sabe que a nota dizia outra coisa;
- se o lote **não tinha** validade (nasceu pela Entrada manual antes da Etapa 190), continua sem — mesmo com a nota trazendo a data.

Depois desta etapa:

1. **Antes de processar:** a janela **Processar nota fiscal** mostra, embaixo do material, um aviso amarelo quando a validade da nota não
   bate com a do lote que já existe — *"O lote L-77 já tem validade 31/03/2027, e a nota informa 30/06/2027. Ao processar, a validade do
   lote é mantida — confira a data da nota em Dados fiscais; …"*. Dá para fechar a janela, conferir e corrigir a data antes de gravar.
2. **Ao processar:** a nota **entra normalmente** (nunca é recusada por isso). O lote mantém a validade que tinha, e a tela mostra o mesmo
   aviso num balão que não some sozinho, apontando para **Lotes e Séries → "Corrigir validade"** (a porta da Etapa 191) se a da nota é
   a certa.
3. **Lote sem validade:** a nota **preenche** a validade do lote (a mesma regra da Entrada manual da 190) e avisa — *"O lote L-77 não tinha
   validade; ela foi gravada agora (30/06/2027) e vale também para o saldo que já estava nele."*
4. **A mesma nota com duas linhas do mesmo lote e datas diferentes:** a janela avisa antes (*"Esta nota traz o lote L-77 com validades
   diferentes (…)"*); ao processar, o lote fica com a da primeira linha e a segunda gera o aviso de divergência.

Analogia: a caixa já tem etiqueta de validade. Chega outra caixa do mesmo lote com outra data na nota. Antes, o almoxarife guardava sem
olhar. Agora o sistema diz "olha, as datas não batem" **antes** de guardar — e não troca a etiqueta sozinho.

## Fase 0 (medido em 2026-11-05, sobre `0a26e91c`)

**As portas que dão entrada da nota no estoque** — todas passam por `darEntradaEstoque` (`receiptService.js:1616`), que só roda dentro de
`comSecaoDaNota` (`:2115`, `trava.comLockDosMateriais(mats, …)` em `:2120`, com `mats` = todos os materiais da nota, `materiaisDaNota`
`:2093`):

| Rota | Caminho | Resposta hoje |
|---|---|---|
| `POST /recebimentos/:id/processar` (`routes/almoxarifado/extended.js:1377`, `receber_material`) | `processarNota` `:2063` → `concluirProcessamentoNota` `:2131` → `…SobTrava` `:2137` | `{ success: true, status, contas_pagar_id }` (`:2184`) |
| `POST /recebimentos/:id/workflow` com `acao: 'processar'` (`extended.js:1360`) | `avancarWorkflow` → `processarNota` (`receiptService.js:1215`) | a mesma |
| `POST /recebimentos/:id/aprovar` (`extended.js:1354`) | `aprovarRecebimento` `:2187` → em `EM_ENTRADA_NF`/`ENCAMINHADO_FATURAMENTO` delega a `processarNota`; senão `concluirAprovacaoDireta` `:2208` → `…SobTrava` `:2214` | `{ success: true }` (`:2239`) |

**O bloco do lote** (`receiptService.js:1747-1777`, dentro do claim por item `entrada_estoque_em IS NULL`, `:1735-1738`): `let loteId = null`
(`:1748`); `if (item.lote && String(item.lote).trim())` (`:1749`) → `lotService.criarOuObterLote(db, user, { …, data_validade:
item.data_validade_lote, … })` (`:1755-1773`) → `loteId = lote.id` (`:1774`). O motor vem depois: `registrarMovimentacao(… { lote_id:
loteId, … })` (`:1781`) **sem** `data_validade` no payload — por isso a régua da 190 no motor (`stockService.js:1300-1316`, decide
PREENCHER/REDEFINIR/CONFLITO só quando `validadeInformada.informada`) **não roda** no recebimento. `entrouFisicamente = true` em `:1826`.
`darEntradaEstoque` **não devolve nada** (termina em `:1964` com o fechamento do pedido).

**`criarOuObterLote`** (`lotService.js:122`): `getLotePorCodigo` (`:112`, `material_id` + `codigo` aparado) → se existe, `return existente`
**sem tocar** (comentário `:118-120`: "o segundo recebimento do mesmo lote nao pode reescrever a validade que veio no primeiro"). Lote novo:
`INSERT` com `dados.data_validade || null` — **sem validar formato** (o item do recebimento é `looseObject`; a 191 achou `"31/03/2027"`
gravado em lote). **Não muda nesta etapa** (outros chamadores, e o "não reescreve" é a regra certa — quem decide é o recebimento).

**O que a 190/191 já deixaram pronto em `lotService.js`:** `dataValidadeBR` (`:35`, troca campos sem `new Date`; não-ISO sai como gravado),
`MSG_VALIDADE` (`:42`, com `AVISO_PREENCHIDA` e `AVISO_FALHA` reaproveitáveis), `validarDataValidade` (`:87`, FORMATO + ANO 2000–2100),
`preencherValidadeSeVazia` (`:171`, `UPDATE … WHERE id = ? AND data_validade IS NULL RETURNING id`, auditoria `VALIDADE_PREENCHIDA` com
`movimento_id`; **não pega trava** — próprio para rodar dentro da seção da nota), `validadeNormalizada` (`:340`, `''`/`null` → `null`, senão
`slice(0, 10)`), `corrigirValidadeDoLote` (`:432`, **pega** `naTravaDoMaterial` — proibido de dentro de `comSecaoDaNota`: a trava não é
reentrante).

**O teste que fixa o comportamento de hoje:** `validadeLoteEntradaManual.api.test.js:402`, cenário `[B1277] recebimento intacto: lote nascido
sem validade pela Entrada continua sem depois da nota com validade` — `processarNota` direto e `assert … data_validade, null, 'o recebimento
mudou de comportamento (B1277 — e a 191)'`. **Muda de propósito nesta etapa** (RN-194.04).

**Testes que comparam a resposta inteira** (medido: `grep deepStrictEqual` nas suítes de recebimento) — quebram se a resposta ganhar campo
sempre presente:
- `recebimentoAvisoEntradaRotas.api.test.js:81` — `{ success: true, status: 'PROCESSADO', contas_pagar_id: null }`;
- `recebimentoReservaChegada.api.test.js:359-360` — o mesmo, e `{ success: true }` no `/aprovar`;
- `recebimentoVinculoMovimentacao.api.test.js:154` — `{ success: true }`.
Os três usam lotes sem divergência → com o campo **só quando há aviso** (B1304) ficam verdes sem mudança.

**A tela** (procurada pelo contrato `data_validade_lote` e por `/processar`, não pelo nome): `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js`.
- A validade do lote é digitada no modal **Dados fiscais** (`:1293-1296`, `type="date"`) e salva por `PUT /recebimentos/:id/fiscal`
  (`salvarFiscal`, `:461-499`, envia `data_validade_lote` em `:477`); depois de salvar, `abrirDetalhe(detalhe.id)` relê o detalhe.
- O modal **Processar nota fiscal** (`:1812-1880`, `data-testid="modal-processar"`) lista `itensQueVaoEntrar(detalhe.itens)` (`:148`, a mesma
  regra do servidor) numa tabela Material/Quantidade/Destino; já tem um aviso amarelo por item (`aviso-padrao-${it.id}`, `:1866-1871`, estilo
  `almox-hint`, `color: '#b45309'`) — **é o molde** da prévia. O material sai em `:1843`.
- `processarNota` (`:629-660`) faz `api.post(…/processar, { destinos })` e `toast.success` (`:637-639`); a resposta não é lida além de
  `contas_pagar_id`. **Não há canal de aviso** hoje no recebimento: nem na resposta, nem na tela.
- Molde do aviso persistente: `LotesAlmoxarifado.js:339` (`(r.data?.avisos || []).forEach((a) => toast.warn(a, { autoClose: false }))`, 191)
  e `MovimentacoesAlmoxarifado.js:627` (`aviso_validade`, 190).
- O detalhe vem de `GET /recebimentos/:id` (`extended.js:1066`, só `auth` + camada do módulo) → `receiptService.getRecebimento`
  (`receiptService.js:3082`, `SELECT ri.*` dos itens — `data_validade_lote` já vem).
- O cliente **não** chama `/aprovar`; o `workflow()` da tela (`:446`) só usa as quatro transições antes do faturamento. Mesmo assim o
  servidor devolve os avisos nas três portas (consumidor de API).

**Concorrência medida:** a prévia é leitura sem trava (só informa); a decisão de verdade é refeita **dentro** da seção da nota, contra o lote
lido sob a trava. `corrigirValidadeDoLote` (191) pega a trava do material → serializa com a seção da nota (a nota espera a correção ou
vice-versa); `preencherValidadeSeVazia` tem a guarda `IS NULL` no `WHERE`.

**Cruzamento com a spec** (`specs/modulo-almoxarifado/10-lotes-series-etiquetas/README.md` e mapa `README.md:1367`): o mapa diz "falta (fora do
🟢, declarado): o recebimento avisar quando a nota traz outra validade para um lote existente (B1296, candidata à Etapa 194)" — bate com o
código. Nenhuma afirmação errada encontrada.

## Regras

| ID | Regra | Cenário que prova |
|---|---|---|
| **RN-194.01** | **A régua única** — `lotService.avaliarValidadeDaNota(lote, valorNota)` (pura, sem banco), nesta ordem: (1) `validadeNormalizada(valorNota)` é `null` → `NADA`; (2) `validadeNormalizada(lote.data_validade)` é `null` → `validarDataValidade(nota normalizada)` passa → `PREENCHER { data }`; recusa → `INVALIDA`; (3) as duas normalizadas iguais → `NADA`; (4) senão → `DIVERGENTE`. Lote novo (acabou de nascer com a data da nota) cai em (3). | unidade da função: os 4 ramos + `"2027-03-31 00:00:00"` × `"2027-03-31"` = NADA + lote `''` legado = ramo (2) |
| **RN-194.02** | **Prévia antes de gravar** — `GET /recebimentos/:id` devolve em **cada** item `avisos_validade_lote: string[]`. Só itens que vão entrar (`quantidadeDoItem > 0`, sem `entrada_estoque_em`) e com lote; o lote é lido por `getLotePorCodigo(material_id, lote)`. Lote existe → `PREVIA_DIVERGENTE`, `PREVIA_PREENCHER` ou `NOTA_INVALIDA` conforme a RN-194.01; lote não existe → nada (fora a RN-194.03). Os demais itens: `[]`. Leitura sem trava. | prévia de cada ramo; item já entrado e item de quantidade 0 → `[]` |
| **RN-194.03** | **Duas linhas do mesmo lote na mesma nota** — entre os itens que vão entrar, agrupar por `material_id` + lote aparado; havendo **duas ou mais** validades normalizadas não-nulas **diferentes**, cada item do grupo ganha `PREVIA_DUAS_NA_NOTA` (datas distintas em ordem crescente). Soma-se à prévia da RN-194.02 (um item pode ter dois avisos). | nota com L-X em duas linhas (2027-03-31 / 2027-06-30), lote inexistente → os dois itens com o aviso; processar → o lote nasce com a da 1ª linha a entrar e a resposta traz `NOTA_DIVERGENTE` da 2ª |
| **RN-194.04** | **Lote sem validade: preenche** — no processamento, item com `PREENCHER` → `preencherValidadeSeVazia(db, user, loteId, data, { movimentoId: movEntrada.id })` **depois** de `entrouFisicamente = true`, num `try/catch` próprio, **não-fatal** (molde I-1 da 190: a entrada já valeu). `preenchida` → aviso `AVISO_PREENCHIDA` (190); não casou ou exceção → `AVISO_FALHA` (190) + `console.warn`. Auditoria `VALIDADE_PREENCHIDA` com `movimento_id`. O cenário `[B1277]` muda para esperar a data gravada. | `[B1277]` (agora RN-194.04) — lote sem validade + nota 2030-06-30 → lote 2030-06-30, aviso, auditoria; controle: lote `''` legado → `AVISO_FALHA`, lote continua `''` |
| **RN-194.05** | **Divergente: mantém e avisa, nunca recusa** — `DIVERGENTE` → a validade do lote **não muda** (com saldo **ou vazio** — B1302), a nota entra, a resposta traz `NOTA_DIVERGENTE(lote, loteISO, notaISO)`. A data da nota continua gravada no item (`data_validade_lote`). | lote 2027-03-31 com saldo + nota 2027-06-30 → 200, físico somado, lote 2027-03-31, aviso literal; lote vazio (estornado) idem |
| **RN-194.06** | **Data da nota inválida num lote sem validade** — `INVALIDA` → não preenche, a nota entra, aviso `NOTA_INVALIDA`. Lote **novo** com data inválida continua como hoje (nasce com o texto — D (194)). | nota `"31/03/2027"` + lote sem validade → 200, lote `null`, aviso; ano `1999-01-01` idem |
| **RN-194.07** | **Resposta aditiva nas três portas** — `processarNota` (e portanto `/processar`, `/workflow` `processar` e `/aprovar` que delega) e o ramo direto de `/aprovar` ganham `avisos_validade: string[]` **só quando há aviso** (B1304), na ordem dos itens processados. Sem aviso, a resposta é **idêntica** à de hoje. | as três portas com divergência → campo; sem divergência → os três `deepStrictEqual` de hoje verdes |
| **RN-194.08** | **Tela** — no modal **Processar nota fiscal**, cada aviso de `it.avisos_validade_lote` aparece embaixo do material (`data-testid="aviso-validade-${it.id}"`, um `<div>` por aviso, molde `aviso-padrao`). Depois do `toast.success`, cada `res.data.avisos_validade` vira `toast.warn(a, { autoClose: false })`. O botão **Processar** continua habilitado (aviso, não trava). Textos vêm do servidor. | client: prévia renderizada; sem campo → nada; toast.warn persistente por aviso; ausência do campo → só o sucesso |
| **RN-194.09** | **Trava** — tudo o que grava validade no processamento roda **dentro** de `comSecaoDaNota` (já sob `comLockDosMateriais` dos materiais da nota) e **sem pegar trava nova**: proibido chamar `corrigirValidadeDoLote` ou `naTravaDoMaterial` de dentro (não reentrante → deadlock). A prévia não pega trava. | integração: `PUT /lotes/:id/validade` disparado durante a seção da nota espera (molde "espera a trava" da 191); sabotagem com `corrigirValidadeDoLote` no lugar do preencher → o teste trava/expira |
| **RN-194.10** | **O que não muda** — `criarOuObterLote` (devolve sem tocar), o motor (`registrarMovimentacao` continua sem `data_validade` no recebimento), a Entrada manual da 190, a correção da 191, as recusas de pré-checagem da nota, `PUT /fiscal`, nenhuma migration, nenhum e-mail. | suítes da 190/191, `lotes`, `loteRecebimento`, `fiscalItemEntrado*` e `recebimento*` verdes sem mudança (exceto o `[B1277]`) |

## Contrato (congelado)

### Literais novas em `lotService.MSG_VALIDADE` (o manual cita estas frases)

```js
// ── Etapa 194 — a validade da nota no recebimento (RN-194.02/03/05/06) ──
PREVIA_PREENCHER: (codigo, notaISO) => `O lote ${codigo} não tem validade; ao processar, ele recebe a validade da nota `
  + `(${dataValidadeBR(notaISO)}). Confira a data antes de processar.`,
PREVIA_DIVERGENTE: (codigo, loteISO, notaISO) => `O lote ${codigo} já tem validade ${dataValidadeBR(loteISO)}, e a nota informa `
  + `${dataValidadeBR(notaISO)}. Ao processar, a validade do lote é mantida — confira a data da nota em Dados fiscais; se a do lote `
  + 'está errada, corrija-a em Lotes e Séries → "Corrigir validade".',
PREVIA_DUAS_NA_NOTA: (codigo, datasISO) => `Esta nota traz o lote ${codigo} com validades diferentes `
  + `(${datasISO.map(dataValidadeBR).join(', ')}). O lote fica com uma só — confira as datas em Dados fiscais antes de processar.`,
NOTA_DIVERGENTE: (codigo, loteISO, notaISO) => `O lote ${codigo} já tinha validade ${dataValidadeBR(loteISO)}; a nota informou `
  + `${dataValidadeBR(notaISO)}. A validade do lote foi mantida — se a da nota é a certa, corrija-a em Lotes e Séries → `
  + '"Corrigir validade".',
NOTA_INVALIDA: (codigo, valor) => `A validade da nota para o lote ${codigo} (${valor}) não é uma data válida; o lote continua sem `
  + 'validade — informe-a em Lotes e Séries → "Corrigir validade".',
```

Reaproveitadas da 190, sem mudar o texto: `AVISO_PREENCHIDA(codigo, dataISO)`, `AVISO_FALHA(codigo, dataISO)`.
Nos literais, `codigo` é o código **do lote gravado** (`lote.codigo`); `loteISO` é `lote.data_validade` como gravado; `notaISO` é a
normalizada da nota (`slice(0, 10)`); `valor` em `NOTA_INVALIDA` é o texto da nota **como gravado** no item.

### Função nova (exportada)

`lotService.avaliarValidadeDaNota(lote, valorNota)` → `{ acao: 'NADA' } | { acao: 'PREENCHER', data } | { acao: 'DIVERGENTE', loteISO,
notaISO } | { acao: 'INVALIDA', valor }`. Pura. `lote` pode ser `undefined` (→ trata como "não existe": devolve `NADA`; a prévia só a chama
com lote existente).

### `GET /api/almoxarifado/recebimentos/:id` (aditivo)

Cada elemento de `itens` ganha `avisos_validade_lote: string[]` (sempre presente; `[]` quando nada). Nenhum outro campo muda. Sem nova
recusa. A prévia é calculada em `getRecebimento` (`receiptService.js:3082`) — leitura, sem trava.

### `POST /recebimentos/:id/processar`, `POST /recebimentos/:id/workflow` (`processar`), `POST /recebimentos/:id/aprovar` (aditivo)

- Com pelo menos um aviso: `{ …resposta de hoje, avisos_validade: string[] }` — `NOTA_DIVERGENTE`, `NOTA_INVALIDA`, `AVISO_PREENCHIDA` ou
  `AVISO_FALHA`, um por item no máximo, na ordem do laço de `darEntradaEstoque`.
- Sem aviso: **exatamente** a resposta de hoje (`{ success: true, status: 'PROCESSADO', contas_pagar_id }` / `{ success: true }`).
- Códigos e recusas: **nenhum novo**. Nenhuma divergência de validade recusa a nota.
- Falha no meio do laço (item N recusa pelo motor): a nota parcial segue como hoje (recusa 400/409 com a literal de hoje); os avisos dos
  itens que já entraram **se perdem** na resposta de erro (o preenchimento deles já foi gravado e auditado) — D (194).

### Interno

- `darEntradaEstoque` passa a devolver `{ avisosValidade: string[] }`; `concluirProcessamentoNotaSobTrava` e
  `concluirAprovacaoDiretaSobTrava` espalham `...(avisos.length ? { avisos_validade: avisos } : {})` no retorno.
- No laço (`:1749-1777`): depois de `criarOuObterLote`, `const decisaoValidade = lotService.avaliarValidadeDaNota(lote,
  item.data_validade_lote)`. `DIVERGENTE`/`INVALIDA` → aviso já (não depende do motor). `PREENCHER` → grava **depois** de
  `entrouFisicamente = true` (`:1826`), no `try/catch` próprio (RN-194.04). Recusa do motor → nada é preenchido (o preencher não chegou a
  rodar — molde B1274).

## Tasks

Ordem topológica: **T1 (tronco)** ‖ **T2 (galho, tela contra o contrato acima)** → **T3 (integração, depois de T1)** → **T4 (fechamento)**.

### T1 — servidor: régua, prévia, preenchimento e avisos (**tronco**)

Arquivos: `server/services/almoxarifado/lotService.js`, `server/services/almoxarifado/receiptService.js`,
`server/tests/api/validadeLoteRecebimento.api.test.js` (novo), `server/tests/api/validadeLoteEntradaManual.api.test.js` (só o `[B1277]`).

1. Primeiro passo: remedir as linhas citadas (`git log -1 -- receiptService.js lotService.js` tem de ser ≤ `0a26e91c`; se mudou, remedir
   `:1747-1777`, `:1826`, `:2137-2239`, `:3082`).
2. Testes primeiro (TDD), arquivo novo com runner próprio, nomes com o ID:
   - `[RN-194.01]` os quatro ramos da função + hora no texto + `''` legado + `undefined`;
   - `[RN-194.02]` prévia: divergente (lote com saldo), preencher, inválida, lote inexistente `[]`, item já entrado `[]`, quantidade 0 `[]`;
   - `[RN-194.03]` duas linhas do mesmo lote (prévia nos dois; processar → lote com a da 1ª, resposta com `NOTA_DIVERGENTE` da 2ª);
   - `[RN-194.04]` preencher pelo `processarNota` + auditoria `VALIDADE_PREENCHIDA` com `movimento_id` = o `movimentacao_entrada_id` do item;
     `''` legado → `AVISO_FALHA`; preencher que lança (monkeypatch pelo objeto do módulo) → 200 + `AVISO_FALHA`, físico creditado;
   - `[RN-194.05]` divergente com saldo e com lote vazio → 200, validade intacta, aviso literal, `data_validade_lote` do item intacta;
   - `[RN-194.06]` `"31/03/2027"` e `1999-01-01` num lote sem validade → 200, lote `null`, `NOTA_INVALIDA`;
   - `[RN-194.07]` sem aviso → `deepStrictEqual` da resposta de hoje (as duas formas); `aprovarRecebimento` ramo direto com divergência →
     `{ success: true, avisos_validade: [...] }`;
   - recusa do motor no item (ex.: destino inválido depois da pré-checagem não dá — usar monkeypatch de `registrarMovimentacao` que lança
     no item com PREENCHER) → lote continua sem validade (B1274).
3. `[B1277]` em `validadeLoteEntradaManual.api.test.js:402`: renomear para `[B1277 → RN-194.04] o recebimento preenche o lote nascido sem
   validade pela Entrada`, esperar `'2030-06-30'`, mensagem de asserção citando a 194.
4. Implementar (contrato acima). **Não** tocar `criarOuObterLote`, `preencherValidadeSeVazia` nem o motor.
5. **Controles positivos** (quebrar, ver vermelho, restaurar — medir CR com `git ls-files --eol` antes e depois):
   (a) régua sem `validadeNormalizada` na nota (compara o texto cru) → cai "hora no texto";
   (b) preencher **antes** do motor → cai "recusa do motor não preenche";
   (c) `avisos_validade` sempre presente → caem os `deepStrictEqual` de RN-194.07 (e os três de hoje);
   (d) prévia sem o filtro `entrada_estoque_em` → cai "item já entrado `[]`";
   (e) agrupamento sem aparar o lote (`' L-X'` × `'L-X'`) → cai RN-194.03 (montar o dado com espaço);
   (f) `NOTA_DIVERGENTE` trocando a ordem dos argumentos → cai o literal.
6. Suítes: o arquivo novo, `validadeLoteEntradaManual` (26, o `[B1277]` mudado), `validadeLoteEntradaManualIntegracao`, `corrigirValidadeLote*`,
   `lotes`, `loteRecebimento`, `loteRotas`, `recebimentoAvisoEntradaRotas`, `recebimentoReservaChegada`, `recebimentoVinculoMovimentacao`,
   `recebimentoProcessamentoConcorrente`, `fiscalItemEntrado*`, `travaPorMaterial`; no fim `npm run test:api` inteiro.
7. Commit `Etapa 194 T1: …`. Marcar este plano.

### T2 — tela: prévia no modal Processar e avisos depois (**galho** — contrato HTTP congelado; mock só na fronteira HTTP)

Arquivos: `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js`,
`client/src/components/almoxarifado/RecebimentosValidadeLote.test.js` (novo; molde `RecebimentosProcessarDestino.test.js`).

1. Testes primeiro: `[RN-194.08]` (i) item com `avisos_validade_lote: [A, B]` → dois `aviso-validade-${id}` com o texto literal, botão
   **Processar** habilitado; (ii) item com `[]` e item **sem** o campo (servidor antigo) → nenhum; (iii) resposta com `avisos_validade: [X,
   Y]` → `toast.success` e depois `toast.warn(X, { autoClose: false })`, `toast.warn(Y, …)`, em ordem; (iv) resposta sem o campo → só o
   sucesso, nenhum `toast.warn`.
2. Implementar: no `<td>` do material (`:1842-1844`), `(it.avisos_validade_lote || []).map(...)` com o estilo de `aviso-padrao`
   (`:1866-1871`); em `processarNota` (`:636-639`), depois do `toast.success`, o `forEach` do molde da 191.
3. Controles: (a) `autoClose` padrão → cai (iii); (b) renderizar só o primeiro aviso → cai (i); (c) ler `res.data.avisos` → cai (iii).
4. `CI=true npx react-scripts test --watchAll=false` (inteiro) e `CI=true npx react-scripts build`. Commit `Etapa 194 T2: …`.

T2 não depende de T1 (só do contrato); pode rodar em paralelo, na mesma árvore (não toca servidor nem o SQLite dos testes).

### T3 — integração cruzando as portas (**depois de T1**; tronco por ser a prova da fiação)

Arquivo: `server/tests/api/validadeLoteRecebimentoIntegracao.api.test.js` (novo).

1. **Pela rota, o fluxo inteiro do usuário:** criar recebimento com lote existente (validade 2027-03-31, saldo) → `PUT /fiscal` com
   `data_validade_lote: '2027-06-30'` → `GET /recebimentos/:id` traz `PREVIA_DIVERGENTE` → `PUT /fiscal` corrige para `'2027-03-31'` → `GET`
   traz `[]` (a prévia acompanha a correção, "conferir antes de gravar") → `PUT /fiscal` volta a `'2027-06-30'` → `POST /processar` → 200 +
   `NOTA_DIVERGENTE` → `PUT /lotes/:id/validade` (191) com `validade_vista: '2027-03-31'`, nova `'2027-06-30'`, justificativa → 200 →
   `GET /lotes?…` mostra 2027-06-30. Cruza `/fiscal` → `GET` → `/processar` → `/lotes/:id/validade`.
2. **Pelo serviço e pelas outras portas:** `POST /workflow` `{ acao: 'processar' }` com lote sem validade → `AVISO_PREENCHIDA` e lote
   preenchido; `/aprovar` ramo direto (status `RECEBIDO`/`CONFERIDO_ALMOX`, molde `recebimentoVinculoMovimentacao`) com divergência →
   `{ success: true, avisos_validade }`.
3. **Trava (RN-194.09):** segurar a seção da nota (gancho no `preencherValidadeSeVazia` só **sinalizando** e esperando — o gesto concorrente
   disparado **do contexto do teste**, nunca de dentro do gancho: regra do CLAUDE.md, molde `exclusaoSerieQueVoltou` RN-15) e disparar
   `PUT /lotes/:id/validade` do mesmo material → ele só termina depois que a nota soltar; e a correção usa o lote já preenchido como
   `validade_vista` (senão 409 `MUDOU`). Controle: (a) chamar `corrigirValidadeDoLote` no lugar do preencher → o cenário expira (deadlock —
   timeout curto no teste); (b) tirar o material da nota de `materiaisDaNota` (sabotagem) → a correção termina antes.
4. Commit `Etapa 194 T3: …`.

### T4 — fechamento (skill `fechar-etapa`)

Novidades (seção da 194, B1300–B1307, C456 resolvido, C459/C460, D (194), F (194); `[B1277]`/B1296 anotadas como resolvidas na 194), spec 10
(checklist com hashes), mapa (linha da feature 10: tira o "falta… B1296"), guia (cabeçalho, seção com "Antes → Agora" e roteiro clicável:
Dados fiscais → data diferente → Processar → aviso amarelo → processar → balão → Lotes e Séries → Corrigir validade), manual (a seção de
Recebimento cita as cinco literais), este plano (Execução + próxima tarefa: item 3 da estimativa, a separação que perde as quantidades —
C454), estimado × gasto da estimativa.

## Letra B proposta (para `docs/almoxarifado-novidades-por-etapa.md`)

- **B1300 (NOVA, da Etapa 194) — avisar, nunca recusar.** A nota fiscal é um documento que entra de qualquer jeito; recusar por validade
  divergente travaria o processamento (conta a pagar, pedido, reserva de quem espera) por um dado que a Qualidade decide depois. A
  estimativa enviada prometeu aviso. **Descartado:** recusa 400 como a `CONFLITO` da Entrada manual (lá o operador digita a data e pode
  apagá-la; aqui a data é da nota); recusa com "forçar". Reversível: virar recusa é um `throw` no lugar do `push`.
- **B1301 (NOVA) — lote sem validade é preenchido pela nota.** Mesma regra da Entrada manual da 190 (RN-190.05) — a B1277 já dizia "com a
  mesma regra de preenchimento". A nota é a melhor fonte que existe para a data; deixar o lote sem validade com a data na mão era o C456.
  Com aviso e auditoria `VALIDADE_PREENCHIDA` (com `movimento_id`). **Descartado:** só avisar (obrigaria a Qualidade a redigitar uma data
  que o sistema já tem). Reversível: tirar o ramo PREENCHER; o que foi gravado tem a correção da 191.
- **B1302 (NOVA) — lote vazio com outra validade: só avisa, não redefine.** A 190 troca a data do lote vazio na Entrada manual (RN-190.06b).
  No recebimento, o lote só é lido **antes** do motor (`criarOuObterLote`), e decidir "vazio" exigiria `loteEstaVazio` antes do claim e
  `redefinirValidadeDoLoteVazio` depois — mais um ramo para um caso raro (lote de nota estornada) que a correção da 191 já resolve com um
  clique. **Descartado:** redefinir como a 190. Reversível: um ramo a mais na régua.
- **B1303 (NOVA) — a prévia sai no `GET` do detalhe e aparece no modal Processar.** "Conferir antes de gravar" pede o aviso **antes** do
  clique; o detalhe já é relido depois de salvar os Dados fiscais, e o modal Processar é o último gesto antes de gravar. **Descartado:**
  só depois de processar (não cumpre "antes de gravar"); rota nova de prévia (mais contrato para o mesmo dado); conferir ao digitar no
  modal Dados fiscais (consulta por tecla, ~+1h — candidata se pedirem); e-mail à Qualidade ou não conformidade automática (outro dono,
  outro tamanho). Reversível: o campo é aditivo.
- **B1304 (NOVA) — `avisos_validade` só aparece quando há aviso.** Três suítes comparam a resposta inteira (`recebimentoAvisoEntradaRotas:81`,
  `recebimentoReservaChegada:359`, `recebimentoVinculoMovimentacao:154`); a forma de hoje fica intacta para quem não tem divergência.
  **Descartado:** sempre presente (`[]`) — mudaria três testes e o contrato de quem compara a resposta. Reversível. Na prévia
  (`avisos_validade_lote`) o campo é sempre presente: nenhum teste compara o item inteiro e a tela fica mais simples.
- **B1305 (NOVA) — sem auditoria nova para a divergência.** A data da nota fica no item (`data_validade_lote`) e a do lote no lote: a
  divergência é reconstituível. **Descartado:** ação `VALIDADE_DIVERGENTE_NOTA` na auditoria do lote (rótulo novo em `auditLabels`, filtro,
  manual — custo sem leitor hoje). Reversível.
- **B1306 (NOVA) — data da nota inválida não preenche; lote novo com data inválida segue como hoje.** O preenchimento usa a régua da 190
  (`validarDataValidade`: formato e ano 2000–2100); o que não passa vira `NOTA_INVALIDA`. O lote **novo** continua nascendo com o texto da
  nota (`criarOuObterLote` não valida) — mudar isso é mexer no `INSERT` compartilhado e decidir o que fazer com nota ruim. **Descartado:**
  validar no `criarOuObterLote` (outros chamadores). Ver D (194). Reversível.
- **B1307 (NOVA) — duas linhas do mesmo lote na mesma nota: avisa antes, a primeira vence.** O laço processa na ordem dos itens; a
  primeira linha cria o lote com a data dela e a segunda cai em `DIVERGENTE`. A prévia avisa as duas linhas antes. **Descartado:** recusar
  a nota (B1300); escolher a data mais próxima de vencer (o sistema escolheria pela Qualidade). Reversível.

**Letra C:**
- **C456 → resolvido na 194** (o recebimento preenche o lote sem validade).
- **C459 (NOVO) — a nota com validade já vencida não avisa** (lote novo ou preenchido): a Entrada manual avisa (`AVISO_VENCIDO`, 190); o
  recebimento não. A saída barra normalmente. Candidato a etapa futura (reaproveita a literal).
- **C460 (NOVO, anterior — Etapa 190) — lote com `data_validade = ''` (legado) na Entrada manual:** o motor (`stockService.js:1309`, `atual
  == null`) trata `''` como validade gravada → lote vivo dá 400 `CONFLITO` com a data em branco ("já tem validade ."). Só lote legado (a 191,
  Fase 5 F3, achou `''`). Não corrigido aqui (o recebimento trata `''` como sem validade e cai em `AVISO_FALHA`).

**D (194) — limitações:** avisos dos itens que já entraram se perdem quando a nota falha no meio (o preenchimento deles foi gravado e
auditado); lote novo com data inválida nasce com o texto; o aviso não é enviado por e-mail; a prévia é do momento da leitura (a decisão
final é refeita sob a trava).

## Tamanho e risco

Medido sobre o código de hoje: servidor ~70 linhas (5 literais, função pura, ~20 linhas no laço, 2 retornos, prévia em `getRecebimento`),
tela ~15 linhas, três arquivos de teste. Execução T1 ~1h, T2 ~25 min (em paralelo), T3 ~30 min, Fase 2 + Fase 5 + fechamento ~1h, mais
estas Fases 0/1. **Cabe nas 3h informadas no limite; o mais provável é 3h a 3h30.** O que estoura: a Fase 5 achar algo na prévia (a
leitura fora da trava) ou a T3 de trava pedir mais de uma rodada. Se pedirem o aviso também enquanto digitam no modal Dados fiscais
(B1303), +1h.

## Fase 2 — correções do revisor fresco (2026-11-05) — **MANDAM sobre o texto acima onde divergem**

Revisor fresco sobre `ce606d41`: 9 achados (1 trava, 5 importantes, 3 menores), todos aceitos. Executor: onde uma RN, contrato ou
controle acima contradiz este bloco, vale **este bloco**. Cada item tem o nº do achado para rastrear.

1. **[TRAVA] RN-194.09 e o controle (a) da T3 partiam de premissa falsa.** `naTravaDoMaterial` chamado de dentro de uma seção que já
   segura o material **passa direto** (`travaPorMaterial.js:153`: `if (secao && secao.materiais.has(m)) return fn();`) — não há deadlock.
   Quem prende a si mesmo é `comLockDoMaterial`/`comLockDosMateriais` direto (`:71-73`). **RN-194.09 passa a ser:** o preenchimento roda
   dentro de `comSecaoDaNota` (o material do lote está em `materiaisDaNota`, `receiptService.js:2093`, travado em `:2120`) e não pega
   trava; proibido é `comLockDoMaterial` direto. **Controle (a) da T3, novo:** mover o preencher para depois de `comSecaoDaNota` → um
   `PUT /lotes/:id/validade` (191) cabe no meio e o teste cai. O controle (b) fica.
2. **[IMPORTANTE] A régua comparava o texto cru da nota.** O `/fiscal` grava cru (`receiptService.js:1452,1463`; `' 2027-01-31 '` e
   `31/01/2027` passam). **RN-194.01:** os dois lados passam por `dataDoItem` (`receiptService.js:1254` — apara, aceita hora e DD/MM/AAAA);
   PREENCHER grava o ISO resultante. **RN-194.06:** `31/03/2027` vira PREENCHER `2027-03-31`; INVALIDA fica para o que `dataDoItem` não
   reconhece e para ano fora de 2000–2100. Controle novo na T1: `' 2027-01-31 '` × `2027-01-31` = NADA (sabotar a normalização → cai).
3. **[IMPORTANTE] Lote legado com `''`:** a prévia prometia preencher e o processar dava AVISO_FALHA (a guarda é `data_validade IS NULL`,
   `lotService.js:173`). **RN-194.01 (2)** vale só para `null`; `''` vira a ação **`LEGADO`**, com
   `PREVIA_LEGADO: (codigo) => \`O lote ${codigo} tem a validade em branco (cadastro antigo) e a nota não consegue preenchê-la — informe-a em Lotes e Séries → "Corrigir validade".\``.
   No processar, `LEGADO` emite `AVISO_FALHA` sem chamar o preencher. (A 191 já trata `''` como sem validade na correção.)
4. **[IMPORTANTE] Preencher com data já vencida bloqueia o saldo antigo calado.** **RN-194.04:** se `isVencido({ data_validade: data })`,
   a resposta empurra também `AVISO_VENCIDO`; se `contarSeparadoPendenteDoLote > 0`, também `AVISO_SEPARACAO` (leituras; podem rodar na
   seção). A prévia de PREENCHER ganha o fim `' Essa data já venceu: o saldo do lote fica bloqueado para consumo.'` quando vencida. Isso
   **resolve a C459 proposta** (a nota com validade vencida passa a avisar) — não abrir a C459.
5. **[IMPORTANTE] A etiqueta do recebimento contradiz o lote na divergência** (`client/src/utils/etiquetasPdf.js:120` lê
   `item.data_validade_lote`). `NOTA_DIVERGENTE` (e a prévia correspondente) termina com
   `' A etiqueta do recebimento sai com a data da nota — imprima a do lote em Lotes e Séries.'`. Limitação em D (194).
6. **[IMPORTANTE] Estorno:** o preenchimento **fica** quando a entrada é estornada (`cancelarMovimentacao` não toca validade — mesma regra
   da 190). Registrar na **B1301** (complemento): a data se corrige pela 191. Passo novo na T3: estornar → o lote mantém a data e a
   auditoria `VALIDADE_PREENCHIDA` aponta o `movimento_id` estornado.
7. **[MENOR] A prévia não simulava o laço.** A prévia percorre os itens **na ordem do laço** com um mapa local lote→validade efetiva (lote
   novo nasce com a data da linha; PREENCHER atualiza o mapa). `ORDER BY ri.id` nos dois SELECTs (`receiptService.js:1617-1626`,
   `:3085-3088`) — "a 1ª linha vence" passa a ter ordem definida. Cenário: lote sem validade + linhas A e B → prévia e processar dizem o
   mesmo (PREENCHER(A) e NOTA_DIVERGENTE(A,B)).
8. **[MENOR] Posição no laço:** o preencher vai logo depois de `entrouFisicamente = true` (`receiptService.js:1826`), antes dos rastros e
   da QUARENTENA (material crítico que lança erro depois do motor não pode deixar o lote sem a data e a resposta sem aviso).
9. **[MENOR] Concorrência e lote mudando entre a prévia e o Processar** — teste na T3: (i) duas `/processar` concorrentes do mesmo lote
   inexistente (uma sem data, outra com), nas duas ordens → lote final e avisos de cada uma conferem (a decisão é refeita sob a trava);
   (ii) prévia DIVERGENTE → Corrigir validade (191) para a data da nota → `/processar` devolve exatamente a resposta de hoje
   (`deepStrictEqual`).

**Tamanho:** os itens 2, 3, 4 e 7 somam régua e cenários; a medida vai de 3h–3h30 para **3h30–4h**. Diferença < 1 h e < 50% da
estimativa enviada (3h): sem reestimar agora; se o realizado passar, a conclusão diz por quê (a revisão do plano achou casos que a
estimativa não via).

## Execução

- [x] Fase 2 — `e6308090`: 9 achados (1 trava, 5 importantes, 3 menores), no bloco "Fase 2 — correções".
- [x] T1 — `32ff286a`. validadeLoteRecebimento 19/19 (2 de 18 verdes antes); validadeLoteEntradaManual 26/26 com o `[B1277 → RN-194.04]` mudado de propósito; 42 vizinhos verdes; test:api 579/580 (caiu `auditLabels`: os valores `acao: "NADA"`… lidos como verbos — trocados pela constante `DECISAO_VALIDADE`, auditLabels 14/14; suíte inteira a rerodar na T3). Controles (a) texto cru, a2 sem `trim`, (b) preencher antes do motor, (c) campo sempre presente, (d) prévia sem filtro de item entrado, (e) lote sem aparar, (f) argumentos trocados — cada um derrubou o cenário esperado. Divergências: `dataDoItem` mudou para `lotService.dataDoTextoDoItem` (uma régua só com o `/fiscal`); `LEGADO` devolve `{ acao, data }`; a 2ª linha do mesmo lote recebe na prévia divergência + duas validades; `/workflow processar` só sai de `EM_ENTRADA_NF`; `contarSeparadoPendenteDoLote` exportada. Contrato: nenhum campo mudou; só os fins de frase da Fase 2.
- [x] T2 — `e8803937`. RecebimentosValidadeLote 4 cenários ((iv) verde antes, esperado: ausência do campo); filtro Recebimento 6 suítes / 62; tela inteira 210 / 2886; build ok. Controles (a) `autoClose` padrão → (iii); (b) só o 1º aviso → (i) e (ii); (c) `res.data.avisos` → (iii). Divergência: o botão do modal é **Confirmar** (`confirmar-processar`), não "Processar".
- [x] T3 — `57bdb6b2`. validadeLoteRecebimentoIntegracao 7/7 (fiscal → prévia → corrige → Processar; /workflow + estorno mantém a data, achado 6; /aprovar direto; a trava contra o Corrigir validade da 191; duas /processar concorrentes nas duas ordens; prévia → correção → resposta de hoje com `deepStrictEqual`). Controles (a) preencher fora da seção → cai o 4 (409 no meio); (b) `materiaisDaNota` sem o material → caem o 4 e os de concorrência; (c) `/aprovar` sem `avisos_validade` → cai o 3; (d) GET sem prévia → caem os 4 que leem a prévia. Defeito de produção: nenhum. Divergências: nota criada no banco (validade pelo `/fiscal`); a correção da 191 roda com ADMIN.
- [x] Fase 4 — sobre `57bdb6b2`: test:api 581/581, almoxarifado 44/0, validation 4/0, safealter 3/0, sqlite 16/0; tela 210 / 2886 e build ok na T2.
- [x] Fase 5 — `77102677`. Dois revisores frescos em paralelo (RN e trava; "o teste passaria com a feature quebrada?"), por execução.
  Seis achados reais, ruído 0:
  - **G1** (importante, B1308): o lote **novo** nascido no recebimento gravava a validade crua (`criarOuObterLote` faz `data_validade ||
    null`): nota com lote novo e `'15/12/2030'` → prévia `[]`, processar 200 sem aviso, o lote ficava `'15/12/2030'` e a saída recusava
    *"Lote LZ vencido em 15/12/2030"* (a `isVencido` compara texto); `'lixo'` nascia sem aviso. Agora `validadeDoLoteNovo`
    (`receiptService.js`): ISO por `lotService.dataDoTextoDoItem` quando `validarDataValidade` aceita, senão `null` — e a régua dá
    `NOTA_INVALIDA`. A prévia simula igual. **Só o recebimento normaliza** — descartado mexer em `criarOuObterLote` (outros chamadores; a
    Entrada da 190 já valida antes). O comentário da régua em `lotService.js` dizia "o lote novo nasce com o texto da nota" — certo sobre o
    código, **errado como regra**; reescrito dizendo que mudou.
  - **G3** (fechado pelo G1): lote nascido nesta nota com `'   '` ficava `''` e a 2ª linha tomava o `LEGADO` falso; agora nasce `null` e a 2ª
    linha preenche.
  - **G4** (menor, B1304): lote 31/03/2027 + duas linhas com 30/06/2027 → duas strings idênticas em `avisos_validade` e dois toasts fixos
    iguais. `darEntradaEstoque` devolve sem repetição, na ordem da 1ª ocorrência; a prévia continua por item. Descartado: deduplicar na tela.
  - **G2** (teste, achado 8 da Fase 2): material crítico com a QUARENTENA forçada a lançar (trigger) e o 1º rastro lançando → processar
    rejeita, mas o lote já tem a validade e a auditoria. Mover o preencher para depois dos rastros/quarentena agora cai.
  - **G5** (testes): validade = hoje num lote sem validade (só `AVISO_PREENCHIDA`, prévia sem "já venceu" — `<=` na `isVencido` cai);
    `{ preenchida: false }` → `AVISO_FALHA` (`!r` sozinho cai); mesmo código de lote em dois materiais → prévia `[[], []]` (chave sem
    material cai).
  - **G6** (declarado, **não consertado** → D (194)): se **outro** item da mesma nota falha no motor (ex.: item 2 com série já em estoque), o
    `throw` descarta a lista de avisos; o lote do item 1 já foi preenchido (e auditado) e o reprocessar responde sem aviso. Reproduzido por
    sonda. Consertar pede devolver os avisos junto do erro (contrato de erro novo nas três portas) — fora do tamanho.
  Controles positivos: 8 sabotagens por perl, âncora única, md5 restaurado; cada uma derruba o teste novo correspondente.
  Placares finais: `test:api` **581/581** arquivos (sobre `77102677`); `validadeLoteRecebimento` 28/0, `validadeLoteRecebimentoIntegracao`
  7/0, `validadeLoteEntradaManual` 26/0; `test:almoxarifado` 44/0, `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 16/0 (sobre
  `57bdb6b2` — a Fase 5 só mexeu no recebimento e nos testes dele); tela 210 suítes / 2886 testes e build ok (T2 — a Fase 5 não tocou a
  tela).
- [x] T4 — fechamento: commit "Etapa 194: fechamento - novidades, specs, mapa, guia, manual e planos": novidades (cabeçalho, seção da 194
  com Antes → Agora e 6 cenários clicáveis com as literais lidas de `lotService.MSG_VALIDADE` e de `RecebimentosAlmoxarifado.js`; B1300 a
  B1307 do plano reescritas pelo que o código faz — a B1306 mudou pela Fase 2 (achado 2) e pela Fase 5 —, e a **B1308** nova do G1; B1277 e
  B1296 anotadas; **C456** resolvido; **C460** novo; a C459 proposta **não** foi aberta (resolvida pela Fase 2, achado 4 — o número fica
  sem uso, dito no C460); D (194) com o G6; F (194)), spec 10 (linha no topo, seção com checklist e hashes, a correção à vista do "nasce
  com o texto"), mapa, guia (cabeçalho e seção com roteiro de 7 passos), manual (4.3d nova "A validade da nota no Recebimento"; 4.1, 4.3c e
  14.5 reescritos onde diziam que o recebimento não avisava), este plano, o plano da 191 (o "defeito que escapou" da retro) e o cabeçalho
  do plano da pausa. Verificação final e estimado × gasto: fora deste commit (feitos por quem fecha a etapa).

**Divergências do plano, em resumo:** (1) a régua lê a nota por `dataDoTextoDoItem` (Fase 2, achado 2) — a RN-194.06 do texto acima
("`31/03/2027` → INVALIDA") **não vale**: `DD/MM/AAAA` vira data; (2) ação `LEGADO` nova (achado 3), que devolve `{ acao, data }`;
(3) os fins de frase de vencida e de etiqueta nos literais (achados 4 e 5) e a C459 resolvida antes do código; (4) o botão do modal é
**Confirmar**, não "Processar" (T2); (5) o controle (a) da trava da T3 trocado (achado 1 — `naTravaDoMaterial` passa direto); (6) a
"D (194) — lote novo com data inválida nasce com o texto" do plano **caiu** na Fase 5 (G1, B1308); (7) os avisos saem sem repetição (G4),
o contrato dizia "um por item no máximo"; (8) `/workflow processar` só sai de `EM_ENTRADA_NF` (T1).

**Retro (4 números):** rodadas de correção até verde: **1** (o fix-round da Fase 5); achados reais da Fase 5: **6** (G1–G5 consertados +
G6 declarado), ruído **0**; paralelismo: T1 e T2 em paralelo, T3 com os dois revisores em paralelo, **sem retrabalho**; defeito que escapou
da 191: **nenhum conhecido** (anotado também na retro da 191).

## Próxima tarefa detalhada

**"Separação: as quantidades digitadas não se perdem"** — item 3 da fila da estimativa
`docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas.md` (ajuste de tela, **1h** informado: análise 15 min, execução
30 min, teste 15 min). Fecha o **C454** (novidades, da revisão adversarial da 189) e leva junto o **C452** (código morto na mesma tela).
Só tela: `client/src/components/almoxarifado/RequisicoesList.js`; nenhum contrato de API muda, nenhum servidor.

**O que acontece hoje (medido em 2026-11-05, sobre `77102677`, sem consertar):**
- **O recarregamento ao voltar para a aba:** `useEffect` em `RequisicoesList.js:762-776` — com `warehouseMode && selectedId`, registra
  `refetchDetalhe` em `window` `focus` **e** em `document` `visibilitychange`; se `document.visibilityState === 'visible'`, chama
  `abrirDetalhe(selectedIdRef.current, { force: true })`. Não olha se há janela aberta.
- **Onde as quantidades são zeradas:** `abrirDetalhe` (`:715-754`) → `aplicarDetalhe(res.data, id)` (`:678-684`), que faz **sempre**
  `setDetalhe(data)`, `setQuantidadesEntrega(quantidadesIniciaisEntrega(data.itens))` e
  `setQuantidadesSeparacao(quantidadesIniciaisSeparacao(data.itens))` (`quantidadesIniciaisSeparacao` em `:277`). É a causa do C454:
  com `showSeparar` aberto, o foco volta, o detalhe é relido e o estado da janela (`quantidadesSeparacao`, `:380`) volta ao inicial
  (digitado 3 → 5, medido na 189). A janela de entrega usa o mesmo caminho (`quantidadesEntrega`, `:363`) — o C454 diz "não medido".
- **Por que a origem não se perde:** `origensSeparacao` (`:379`) não é tocado por `aplicarDetalhe`; os efeitos da pré-seleção (`:521-533`,
  `:571-600`) só preenchem item **sem** chave em `origensSeparacao` (`hasOwnProperty`, RN-189.05). As quantidades não têm essa guarda.
- **Outros que zeram as quantidades (de propósito):** `abrirModalSeparacao` (`:871-877`, ao abrir a janela), `abrirModalEntrega`
  (`:1050-1062`) e `handleConfirmarEntrega` (`:1064-…`). Esses ficam.
- **C452, o código morto:** `handleCompletarEntrega` (`:1096-1109`) tem o ramo `precisaSeparar` → `setEntregaAposSeparar(true)` +
  `abrirModalSeparacao()`; e `handleSeparacao` (`:916-920`) lê `entregaAposSeparar` para abrir a entrega depois de separar (também
  `:933`, no erro). O botão **Completar Entrega** (`:2104-2108`) só renderiza com `podeEntregar = temPendenteComEstoque(detalhe.itens)`
  (`:2096`), e `temPendenteComEstoque` = `temEntregavel` (`:120-122`) — a mesma condição do primeiro `if` de `handleCompletarEntrega`.
  Logo o ramo de separar nunca roda, e o estado `entregaAposSeparar` (`:392`) é sempre `false`.

**Caminho provável (a confirmar na Fase 0/2):**
- Em `aplicarDetalhe`, preservar as quantidades **já digitadas** quando a janela correspondente está aberta e o detalhe é o mesmo id
  (refetch do mesmo detalhe): só repor o inicial para itens que não estão no estado (ou que mudaram de forma — ex.: item novo/sumido, ou o
  máximo separável caiu abaixo do digitado; decidir se limita ao novo teto ou mantém e deixa a validação de hoje recusar). Alternativa a
  pesar: o `refetchDetalhe` não recarregar com janela aberta — **descartável**, porque o recarregamento existe para mostrar o que outra
  pessoa mudou e as guardas de teto (`maxSeparavelNaTela`, `:898`) dependem do detalhe fresco.
- `aplicarDetalhe` é `useCallback([])` — ler `showSeparar`/`showEntregar` por ref (como `selectedIdRef`), ou mover a decisão para quem
  chama; não aumentar as dependências sem medir (o efeito do listener depende de `abrirDetalhe`, que depende de `aplicarDetalhe`).
- C452: remover o ramo `precisaSeparar`, o estado `entregaAposSeparar` e as leituras em `handleSeparacao` (`:916-920`, `:933`), deixando o
  `else` com o `toast.error('Aguardando reposição de estoque para itens pendentes.')` se ainda for alcançável (medir: com o botão gated por
  `temEntregavel`, o `else` também é inalcançável pela tela). Atualizar o C452 dizendo que o código foi removido, não "consertado".

**Pontos de atenção:**
- **Molde de teste que já dispara o foco:** `RequisicoesSeparacaoPreSelecao.test.js:371`, `:423`, `:442`
  (`window.dispatchEvent(new Event('focus'))` dentro de `act`) — o teste novo digita uma quantidade, dispara o foco (e o
  `visibilitychange`), espera o GET do detalhe e confere que o campo manteve o digitado; metade positiva: o detalhe fresco **foi** aplicado
  (ex.: um campo que o servidor mudou aparece). Controle positivo: voltar `aplicarDetalhe` a repor sempre → cai.
- **Entrega também:** decidir se a mesma guarda vale para `quantidadesEntrega` (o C454 diz "não medido") — medir primeiro com o mesmo teste.
- Telas e regras da 189 (pré-seleção, `origensSeparacao`) e da 135 (dividido entre irmãos, `quantidadesIniciais*`) não podem mudar: rodar
  as suítes `RequisicoesSeparacao*`, `RequisicoesEntrega*`, `RequisicoesPreSelecaoFluxo`, `RequisicoesSeparavelDividido`,
  `RequisicoesEntregavelDividido` e `RequisicoesList.test.js`.
- **Fatia visível:** a própria correção é visível (a quantidade digitada fica); para o relatório, o roteiro "digite 3, troque de aba, volte".

**O que já está pronto e não precisa reabrir:** o servidor da separação e da entrega (trava por requisição e por material, Etapas 93/95);
a pré-seleção do **Sai de** (189) e a guarda dela contra o recarregamento; os tetos da tela (`maxSeparavelNaTela`).
