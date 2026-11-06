# Almoxarifado — Etapa 208: o "Sai de" da entrega respeita a guarda do irmão da mesma requisição

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-06-almoxarifado-etapa207-entrega-respeita-guarda-sem-lote.md` (`:397` em diante), conferida contra o
> código em `0f1fb344` — bate, com **dois achados a mais** (abaixo). Aviso **C496** (achado S6 da Fase 5 da 207), que é o mesmo assunto do
> **C472** da Etapa 200. Estimativa já commitada: `docs/estimativas/2026-11/estimativa_2026-11-06_almoxarifado-escolha-do-irmao.txt`
> (**4h**, `0f1fb344`). Mexe numa conferência da entrega que **só lê** e recusa antes de qualquer baixa — **tronco** (regra compartilhada
> da E1), sob as duas travas que a entrega já segura. Fatia visível: a recusa nova na janela de entrega e o rótulo do **Sai de** da entrega
> passando a mostrar o que as outras peças desta requisição separaram ali.

## Objetivo (em linguagem simples)

Uma requisição com duas peças do mesmo material: a peça 2 foi separada da prateleira A. Hoje, quem entrega a peça 1 e escolhe à mão
"Sai de: A" pode levar o que estava separado para a peça 2 — o sistema só olha o que **outras requisições** separaram ali. Depois a peça 2
não sai mais (*"a origem da separação (A) não serve mais"*). Depois desta etapa, a entrega da peça 1 é recusada na hora, com a conta: quanto
há em A, quanto está separado para a outra peça e quanto sobra. Se a peça 2 sai na **mesma** entrega, nada é recusado por causa dela.

## Fase 0 — medido em 2026-11-06 (sobre `0f1fb344`)

### O cenário (o do revisor `rev207b`, Fase 5 da 207 — não re-executado nesta fase; a T0 o fixa como vermelho)

Material sem lote, A 3, B 5; item 1 separado 1 de A + 1 sem origem (caixa 2, parte 1); item 2 separado 2 de A. Entregar 2 do item 1
escolhendo A → 200 e A fica 1; o item 2, num clique → 400 *"⟨material⟩: a origem da separação (A) não serve mais (O saldo em A (1) não
cobre a quantidade (2) — a saída tiraria de outros endereços) — entregue escolhendo de onde sai"*. Segunda forma: um item **sem** origem
guardada escolhendo no Sai de o endereço que o irmão separou.

### Onde (`server/services/almoxarifado/requisitionService.js`)

- `entregarRequisicao` (`:2209`) = `serializarNaRequisicao` → `comTravaDaRequisicao` → `entregarSemTrava` (`:2212`). Tudo abaixo roda
  **dentro** das duas travas.
- O laço de validação de origem (`:2329-2402`): `parte = min(parteDaOrigem, pendenteSep)` (`:2341`); `qtdComOrigem = qty` (`:2346`), e só a
  planejada (caso a) limita a `min(qty, parte)`; `saiDaOrigem` nasce `planejada` (`:2377`) e vira `true` quando o par escolhido é o da
  origem guardada (`:2387`, caso b). A marca do caso (c) é `!!origemId && !saiDaOrigem` (`:2401`). **1ª forma:** o caso (b) com
  `qtdComOrigem > parte` (o mesmo par **acima** da parte) nem entra no caso (c) — é também o **C470** (que vale para outras requisições).
- `origemGuardada` (`:2397`): por item com origem, `{ saiDaOrigem, caixaAntes, parteQueFica, parte }` — `parteQueFica` só no `outroPar`
  (`:2388`, `parte − troca`).
- A passada do caso (c) (`:2403-2428`): `memoParteGuardadaDeOutras(db, requisicaoId)` (`:2406`, definida em `:135`) lê
  `parteGuardadaDeOutras` (`:96-107`), que filtra `ir.requisicao_id <> ?` (`:101`) — a guarda dos **irmãos** nunca conta. **2ª forma.**
  `ja = pedidoPorOrigem(par) − qtdComOrigem` (`:2415`), `saldo = físico − ja` (`:2416`), E1 se `saldo − outrasQ < qtdComOrigem` (`:2417`);
  `if (outrasQ <= 1e-9) continue` (`:2411`).
- `mensagemSeparadoDeOutras` (`:149-160`) — a frase única da C1 (separação) e da E1 (entrega).
- `parteQueFicaPorItem` (`:2471-2475`) — **declarada depois** da passada (c) (`const` com arrow: TDZ se chamada antes). Lê só
  `origemGuardada` e `origemPorItem`, que o laço já encheu na passada (c) (os do só lote não usam `origemPorItem`: são `outroPar`).
- `guardaQueConta(g, saiu, fica)` (`:1906-1909`, Etapa 207) — a régua de "a guarda que fica" de um item, já usada por
  `lotesParaOAutomatico` (`:1948`) e `fatiasSemLoteParaOAutomatico` (`:2008`). **Reusar, não duplicar.**

### A tela (`client/src/components/almoxarifado/RequisicoesList.js`)

- `rotuloOrigem(s, propriaNoPar = 0)` (`:158-168`): com separado de outras ou da própria, *"A (sobra N de F; X para outras, Y desta)"*.
- Na **separação** é chamado com `propriaNoPar(detalhe.itens, …)` (`:2505`; `propriaNoPar` `:282-284` soma `pendentePlanejado` dos itens do
  material com a planejada naquele par — o próprio item incluído, porque a C1 conta o já pedido).
- Na **entrega** é chamado **sem** `propriaNoPar` (`:2649`): mostra só a sobra das outras. Se a porta passa a descontar os irmãos, a janela
  ofereceria *"A (3)"* e o servidor recusaria — incoerente (o ponto de atenção da 207).
- A pré-seleção da entrega (`:725-742`) só põe a planejada quando `qtd ≤ pendentePlanejado(item)` (`:730`): a tela **nunca** manda o caso (b)
  acima da parte sozinha — só escolhendo à mão.
- `GET /api/almoxarifado/estoque/:materialId/saldos?requisicao_id=` (`server/routes/almoxarifado/extended.js:835-852`): `separado_outras` e
  `sobra` por linha, excluindo esta requisição (`parteGuardadaDeOutrasPorPar`, `:115`). **Não muda** (B1411).

### Achado 1 — o excesso sobre a parte, pela álgebra, é a mesma conta da E1

Para o caso (b) com parte `p` e pedido `q > p`: conferir só o excesso (`físico − ja − p − G < q − p`) é o mesmo que `físico − ja − G < q` —
a parte própria cancela. Então o item (b) acima da parte entra na mesma passada com `qtdComOrigem = q` e a mesma literal, com números que o
usuário reconhece (*"há 3 … 2 para outra peça … sobra 1 … quantidade (2)"*). **Mas só quando `q − p > folga`:** com `q = p` a mesma conta
recusaria o dado antigo sobrecomprometido (4 + 4 em 6 — o que a B1338 evitou, RN-200.04 b).

### Achado 2 — o RN-200.06 (i) afirma o C472 de propósito

`server/tests/api/entregaSaiDeRespeitaSeparado.api.test.js:292-300`: R1 guardou 2, R2 item 1 guardou 2, item 2 (automático) entrega 3 com
Sai de XB-01/L1 → **200**, com o comentário *"contando o irmao, 6 - 4 = 2 nao cobriria — C472, B1340"*. Não é teste errado: é a decisão
B1340 da 200 que esta etapa reverte. Reescrito na T0 (a nova expectativa: 400 com a literal mista), registrado como **reversão da B1340**,
não em silêncio.

### O C472 da Etapa 200 — o que foi decidido e por quê

B1340 (`docs/superpowers/plans/2026-11-05-almoxarifado-etapa200-entrega-a-mao-respeita-separado.md:184-186`): "a própria requisição não é
'outra': itens dela no mesmo par somam pelo já pedido nesta entrega; a parte guardada de um irmão que não sai agora não é protegida (C472).
**Descartado:** semear o já pedido com a parte dos irmãos (tem de excluir o próprio item e muda a conta dos casos a/b — mais cenários do que
cabe)". Foi corte de **tamanho**, não de regra. Esta etapa fecha o C472 (= C496) sem semear o já pedido: a guarda dos irmãos entra como
uma **terceira parcela** só na passada (c), que não toca (a) nem (b) sem excesso. E fecha o **C470** junto (Achado 1: a conta do excesso é
a mesma e já desconta as outras).

### Pontos de atenção da 207 — medidos

1. **O irmão da mesma entrega (a V1 da 136):** o irmão que sai da origem nesta entrega já está no `ja` (`pedidoPorOrigem`) pelo que pede; a
   guarda que fica dele (`parteQueFicaPorItem`: `parte − qtdComOrigem`, `:2473-2474`) é o resto. `ja + fica = parte` — conta uma vez só. O
   irmão que sai de **outro** par nesta entrega fica com `parteQueFica = parte − troca` (`:2388`) — se a troca leva a parte toda, 0. Ler a
   parte do banco sem o `fica` recusaria o que o irmão entrega na mesma entrega (RN-208.03, controle).
2. **B1394 (a guarda do próprio item uma vez só):** o próprio item é excluído da soma dos irmãos (`ir.id <> ?`); no caso (b) a parte dele
   está dentro do `qtdComOrigem`.
3. **A 201 (o rótulo):** ver "A tela" acima — B1411.
4. **Trava:** nenhuma nova. A leitura nova é dentro das duas travas da entrega; a separação de outro item da mesma requisição pega a mesma
   trava por requisição (B1412).
5. **Nada gravado na recusa:** a passada (c) roda antes do só lote, da prévia e da alçada (`:2403` < `:2433` < `:2476`), como na 200.

### Quem depende do comportamento de hoje

- `entregaSaiDeRespeitaSeparado.api.test.js` `[RN-200.06 (i)]` (`:292`) — **muda** (Achado 2). `(ii)` (`:302`, sem guarda de irmão) e
  `(iii)` (`:313-324`, o irmão B sai inteiro da origem na mesma entrega: `fica` 0) — **verdes sem tocar** (controle da RN-208.03).
  `[RN-200.04 a/b/b']` (dado antigo, sem excesso) — verdes.
- `entregaGuardaSemLote.api.test.js` sorteio `[RN-207.08]` (`:420-423`): exclui de G/N a "origem ESCOLHIDA alem da parte guardada do item"
  (`explicitaAlem`) — é este caso. A T4 tira a exclusão.
- Não medido por varredura: teste que entrega com Sai de = a origem do item **acima** da parte com outra guarda viva no par. A T1 roda o
  `test:api` inteiro; quebra fora desta lista entra no plano **antes** de editar o teste.

## Caminhos

- **Escolhido — a guarda que fica dos irmãos como terceira parcela da passada (c), e o caso (b) acima da parte entrando nela pelo
  excesso.** Reusa `guardaQueConta` com o `parteQueFicaPorItem` da própria entrega (uma régua só com o automático da 206/207) e a literal da
  E1 estendida (uma frase só). Reversível: uma condição a mais na marca do (c) e uma parcela a mais na conta, sem dado novo.
- **Descartado — semear o `pedidoPorOrigem` com a parte dos irmãos** (a forma que a B1340 descartou): mudaria a literal **física** e os
  casos (a)/(b) — o irmão do caso (b) passaria a ver a própria parte em dobro.
- **Descartado — tirar o `requisicao_id <> ?` de `parteGuardadaDeOutras`:** mudaria a C1 da separação e o `/saldos` da 201 (as duas leem a
  mesma régua) e contaria o próprio item.
- **Descartado — contar os irmãos em todo caso (b):** recusaria o dado antigo entre irmãos (4 + 4 em 6, o primeiro pela tela) — a armadilha
  que a B1338 evitou.

## Decisões (letra B — reversíveis; livres depois de B1406, conferido por `grep` em `docs` e `specs`: nenhuma B1407+; C a partir de C497)

- **B1407 — o caminho: a guarda que FICA dos irmãos desta requisição entra na conta da E1.** Na passada (c), para o par escolhido, soma-se a
  guarda de cada **outro** item desta requisição com origem guardada **no mesmo par** (`material`, `origem_separacao_id`, `lote_separacao_id
  IS ?`), cada uma por `guardaQueConta(g, new Map(), parteQueFicaPorItem())` (nada baixado ainda: `saiu` vazio), só as > folga. Recusa se
  `físico − ja − outras − irmãos < qtdComOrigem`. **Descartados:** ver "Caminhos".
- **B1408 — o mesmo par acima da própria parte entra na passada (c) pelo excesso, e conta as outras requisições também (fecha o C470).**
  Marca do (c): `!!origemId && (!saiDaOrigem || qtdComOrigem − parte > Q.QTD_FOLGA)`, com `parte` do `origemGuardada` (antes da baixa).
  A conta é a mesma (Achado 1). **Descartados:** (a) só os irmãos no excesso — duas réguas para o mesmo excesso, e o C470 ficaria; (b)
  conferir o (b) sempre — o dado antigo (B1338).
- **B1409 — a literal: a E1 estendida, byte a byte sem irmãos.** Sem guarda de irmão, a E1 e a C1 saem idênticas (as 19 + 2 da 200 e as 23 da
  198 sem edição, fora a RN-200.06 (i)). Com irmão: *"para outra peça desta requisição"* (sem número de requisição — é a mesma) e, misto, as
  duas parcelas unidas por *" e "*. **Descartados:** (a) frase própria separada — duplicaria a conta do "sobra"; (b) identificar a peça pela
  posição no pedido — a tela não mostra número de item estável.
- **B1410 — o par é exato, como a E1:** a guarda do irmão conta quando `origem_separacao_id` e `lote_separacao_id IS ?` batem com o par
  escolhido. A guarda **sem lote** de um irmão (planejada "qualquer lote em A") num material com lote não conta quando o Sai de é (A, L1)
  — o mesmo limite que a E1 já tem para outras requisições → **C498**.
- **B1411 — a tela: o Sai de da entrega desconta a parte dos irmãos.** `rotuloOrigem(s, irmaosNoPar(detalhe.itens, item, valorOrigem(s)))`,
  com `irmaosNoPar` = `propriaNoPar` sem o próprio item → *"A (sobra 1 de 3; 2 desta)"*, a mesma forma da separação. O número é `sobra −
  Σ pendentePlanejado(irmãos no par)` — o que a porta usa quando o irmão não sai nesta entrega (quando sai, a porta conta o que ele pede: o
  rótulo é estático e pode prometer menos, nunca mais). **Descartados:** (a) campo novo no `/saldos` (mudança de contrato; o cliente já tem
  os itens); (b) não mudar — ofereceria o que a porta recusa.
- **B1412 — sem trava nova.** Leitura dentro das duas travas da entrega (CLAUDE.md, "Trava por material"; a entrega já segura a por
  requisição e a por material desde a 95).
- **B1413 — o RN-200.06 (i) reescrito: a B1340 revertida** (Achado 2). Escrito no fechamento como reversão, com o porquê (a B1340 foi corte
  de tamanho, não regra).
- **B1414 — corte se estourar 4h em mais de 30 min:** sai a tela (B1411 → **C499**, o rótulo fica como hoje e a recusa é a fatia visível);
  depois, a T4 fica só com a exclusão tirada (sem modo novo no gerador). O servidor, a RN-208.01-08 e a integração ficam.

### Fora (C novos)

- **C496** e **C472** → **resolvidos**; **C470** → **resolvido** (B1408).
- **C497** — na mesma entrega, item 1 com Sai de à mão no par que o item 2 guardou e o item 2 num clique: quando o físico não cobre os dois, a
  recusa **física** (precedência de hoje, RN-200.03) cai no item 2 como *"a origem da separação (A) não serve mais"*, embora quem pediu a mais
  foi o item 1. Anterior a esta etapa; não muda.
- **C498** — a guarda sem lote de outro item (desta ou de outra requisição) num material com lote não conta quando o Sai de escolhe um lote
  no mesmo endereço (B1410).
- **C499** — reservado para o corte da B1414.

## Regras de negócio

Montagem padrão (molde `entregaGuardaSemLote.api.test.js`: helpers `material`, `entrar`, `reqDireta`, `separar`, `entregar`, `livro`,
`retrato`): material **sem** controle de lote, sem série, não crítico, `un`, padrão P **vazia**; saldo por Entrada v2 com endereço;
requisição `APROVADO` por SQL; separação por `separarRequisicao` (com `localizacao_origem_id` e quantidade para a guarda; o "1 de A + 1 sem
origem" = separar 1 com origem, depois 1 sem — a parte fica 1, RN-196.12). "Nada gravado" = status, `quantidade_entregue`, saldos, livro,
`substituicoes` e alçada iguais antes/depois (o `recusaSemGravar` da 200).

- **RN-208.01 — o mesmo par acima da parte (a 1ª forma do C496).** A 3, B 5; item 1 (2): 1 de A + 1 sem origem; item 2 (2): 2 de A.
  Entregar item 1 2 com Sai de A → **400** *"⟨mat⟩: em A há 3 para esta entrega, mas 2 já está separado dali para outra peça desta
  requisição; sobra 1, que não cobre a quantidade (2). Escolha outro endereço ou deixe "Qualquer endereço (automático)""*, nada gravado.
  Depois: item 1 1 com Sai de A → 200 (sem excesso, não confere); item 2 num clique → 200, A 0. **Controle positivo:** tirar o
  `|| qtdComOrigem − parte > folga` da marca → a 1ª entrega 200 e a do item 2 400 *"não serve mais"* (o de hoje).
- **RN-208.02 — item sem origem escolhendo o par do irmão (a 2ª forma).** A 3, B 5; item 1 (2) separado sem origem; item 2 (2) de A. Item 1
  2 com Sai de A → 400 (a mesma literal: há 3, 2, sobra 1, quantidade 2). Item 1 1 com Sai de A → 200; item 2 num clique → 200, A 0.
  *Fronteira:* A 3,000001 → a 1ª entrega passa (folga `1e-9` de hoje). **Controle positivo:** a soma dos irmãos devolvendo 0 → 200 e o item 2
  400 *"não serve mais"*.
- **RN-208.03 — o irmão que sai nesta entrega não guarda mais.** (a) A 4: item 1 (2, sem origem) Sai de A 2 **e** item 2 (2 de A) num
  clique, na mesma entrega → 200, A 0 (`ja` 2 + `fica` 0). (b) A 3, B 5: item 1 (2, sem origem) Sai de A 2 **e** item 2 (2 de A) com Sai de B 2
  → 200 (`parteQueFica` 0), A 1, B 3, uma troca de 2 registrada no item 2. (c) `[RN-200.06 (iii)]` verde sem tocar. **Controle positivo:**
  ler a parte dos irmãos do banco sem o `fica` (`guardaQueConta(g, new Map(), undefined)`) → (a) e (b) 400.
- **RN-208.04 — sem excesso, nada muda (a B1338 entre irmãos).** (a) item 1 (1 de A + 1 sem origem) entrega 1 com Sai de A → 200 (não
  confere, o item 2 continua cabendo: A 2). (b) Dado antigo entre irmãos, por SQL: A 6, item 1 parte 4, item 2 parte 4. Item 1 Sai de A 4 →
  200 (quem entrega primeiro leva, como a RN-200.04 b); item 2 depois → 400 *"não serve mais"*. **Controle positivo:** marcar o (b) sempre
  (`!!origemId`) → (b) vira 400.
- **RN-208.05 — o excesso desconta as outras requisições também (o C470).** A 4, B 5; R1 guardou 2 em A; R2 item (3): 2 de A + 1 sem origem.
  R2 entrega 3 com Sai de A → 400 **E1 de hoje, byte a byte** (*"em A há 4 para esta entrega, mas 2 já está separado dali para outra
  requisição (⟨R1⟩); sobra 2, que não cobre a quantidade (3). …"*); R2 entrega 2 com Sai de A → 200; R1 num clique → 200, A 0.
  `[RN-200.04 a/b/b']` verdes sem tocar.
- **RN-208.06 — misto e plural.** (a) `[RN-200.06 (i)]` reescrito: R1 guardou 2 em XB-01/L1 (6); R2 item 1 guardou 2 ali; item 2 (automático)
  Sai de XB-01/L1 3 → 400 *"⟨mat⟩: em XB-01, lote L1 há 6 para esta entrega, mas 2 já está separado dali para outra requisição (⟨R1⟩) e 2 para
  outra peça desta requisição; sobra 2, que não cobre a quantidade (3). …"*; com 2 → 200. (b) Dois irmãos com guarda no par (1 + 1) →
  *"… mas 2 já estão separados dali para outras peças desta requisição; …"*. (c) `contando`: um terceiro item da mesma entrega no par →
  *"(já contando N desta entrega)"* como hoje.
- **RN-208.07 — com lote, o par é exato (B1410).** Material com lote: A/L1 4, A/L2 3; item 2 guardou 2 de (A, L1); item 1 (sem origem) Sai de
  (A, L1) 3 → 400 (há 4, 2, sobra 2); Sai de (A, L2) 3 → 200 (outro par: não conta). Item 2 guardou (A, L2) e item 1 escolhe (A, L1) → não
  conta.
- **RN-208.08 — precedência.** Físico não cobre (item 1 Sai de A 4 com A 3) → a literal física de hoje, inalterada; status, crítico e séries
  antes, como na 200.
- **RN-208.09 — a tela (B1411).** No teste do cliente (`RequisicoesSaiDeSobra.test.js`): com o item 2 guardando 2 em A (3) e sem outras, o
  Sai de **do item 1** na janela de entrega mostra *"A (sobra 1 de 3; 2 desta)"*; o do **item 2** mostra *"A (3)"* (o próprio não conta);
  com outras 1 → item 1 *"A (sobra 0 de 3; 1 para outras, 2 desta)"*. A separação não muda (os testes de hoje sem edição).
- **RN-208.10 — sorteio (G/N cobrem a escolha à mão).** No `[RN-207.08]`: tirar a exclusão `explicitaAlem` (`:422-423`); G e N passam a valer
  também quando a origem escolhida passa da parte. Premissa nova afirmada: ≥ 10 casos com `explicitaAlem`. **Controle positivo:** a marca do
  (c) sem o excesso → G ou N ≥ 3 casos.
- **RN-208.11 — ponta a ponta (integração, rota E serviço).** Ver T3.

## Contrato (congelado)

### Rota

`PUT /api/almoxarifado/requisicoes/:id/entregar` (`server/routes/almoxarifado.js:4787`) — payload, perfis, 200 e as outras literais **sem
mudança**. Recusa nova: a **E1 estendida**, 400 (`error`), só no caso (c) e no (b) com excesso, depois da conferência física:

```js
// mensagemSeparadoDeOutras({ gesto, cod, saldo, jaPedido, outrasQ, numeros = [], qty, irmaosQ = 0, irmaosN = 0 })
const out = outrasQ > 1e-9;
const irm = irmaosQ > 1e-9;
const fraseOutras = `${r6(outrasQ)} ${plural ? 'já estão separados dali para outras requisições' : 'já está separado dali para outra requisição'} (${numeros.join(', ')})`;
const fraseIrmaos = out
  ? `${r6(irmaosQ)} para ${irmaosN > 1 ? 'outras peças' : 'outra peça'} desta requisição`
  : `${r6(irmaosQ)} ${irmaosN > 1 ? 'já estão separados dali para outras peças desta requisição' : 'já está separado dali para outra peça desta requisição'}`;
// `em ${cod} há ${r6(saldo)}${contando} para esta entrega, mas ${[out && fraseOutras, irm && fraseIrmaos].filter(Boolean).join(' e ')}; `
// + `sobra ${r6(Math.max(0, saldo - outrasQ - irmaosQ))}, que não cobre a quantidade (${qty}). Escolha outro endereço ou deixe "Qualquer endereço (automático)"`
```

- Sem irmãos (`irmaosQ ≤ 1e-9`): a E1 e a C1 **byte a byte** como hoje (`fraseOutras` é o texto de `:155-157`).
- Exemplos congelados: só irmão — *"E208-1: em A há 3 para esta entrega, mas 2 já está separado dali para outra peça desta requisição; sobra
  1, que não cobre a quantidade (2). Escolha outro endereço ou deixe "Qualquer endereço (automático)""*; misto — *"E200-1: em XB-01, lote L1
  há 6 para esta entrega, mas 2 já está separado dali para outra requisição (REQ-0001) e 2 para outra peça desta requisição; sobra 2, que não
  cobre a quantidade (3). Escolha outro endereço ou deixe "Qualquer endereço (automático)""*.
- `irmaosQ` e `irmaosN` só no gesto `'entrega'`; a separação (C1) nunca os passa.
- **Precedência:** física primeiro (no laço, inalterada); E1 só na passada (c); antes do só lote, da prévia/`Máximo:` e da alçada.

### Serviço (`requisitionService.js`)

```js
// Etapa 208 (B1407): a guarda que FICA dos irmaos desta requisicao no par — a regua da 206/207 (guardaQueConta), nada baixado ainda.
// So le; dentro das duas travas da entrega. -> { q, n } (n = irmaos com guarda > folga).
async function guardaDosIrmaosNoPar(db, requisicaoId, itemId, materialId, origemId, loteId, parteQueFicaPorItem)
//   SELECT ir.id, ${PARTE_ORIGEM_SQL} as q FROM itens_requisicao_almoxarifado ir
//   WHERE ir.requisicao_id = ? AND ir.id <> ? AND ir.material_id = ? AND ir.origem_separacao_id = ? AND ir.lote_separacao_id IS ?
//   cada g: guardaQueConta(g, new Map(), parteQueFicaPorItem); soma as > Q.QTD_FOLGA
```

- `parteQueFicaPorItem` (`:2471-2475`) **sobe** para antes da passada (c), sem mudar o corpo (a 206/207 continuam lendo o mesmo).
- A marca do laço (`:2401`): `!!origemId && (!saiDaOrigem || (item.origem_separacao_id && qtdComOrigem − parte > Q.QTD_FOLGA))`.
- A passada (c) (`:2407-2428`): `irm = await guardaDosIrmaosNoPar(…, parteQueFicaPorItem())`; `if (outrasQ + irm.q <= 1e-9) continue`;
  recusa se `saldo − outrasQ − irm.q + 1e-9 < c.qtdComOrigem`; a mensagem com `irmaosQ: irm.q, irmaosN: irm.n`.
- Exportar `guardaDosIrmaosNoPar` (prova de unidade na T1, e a equivalência com a soma do cliente na T2).

### Tela (`RequisicoesList.js`)

```js
// Etapa 208 (B1411): na ENTREGA, o separado pelas outras pecas desta requisicao no par (o proprio item fora) — a E1 desconta.
const irmaosNoPar = (itens, item, valor) => propriaNoPar((itens || []).filter((i) => Number(i.id) !== Number(item.id)), item.material_id, valor);
// :2649 -> {rotuloOrigem(s, irmaosNoPar(detalhe.itens, item, valorOrigem(s)))}
```

## Tasks

Todas **tronco** e sequenciais exceto a T2 (tela), que é **galho** contra o contrato congelado (só o rótulo; teste do cliente, sem servidor).
Sem worktree: a T2 é pequena e não bate no SQLite; roda depois da T1 na mesma árvore (os testes de cliente não tocam o banco).

- **T0 (tronco) — o vermelho de partida.** `server/tests/api/entregaSaiDeGuardaDoIrmao.api.test.js` (novo, runner próprio, moldes da 207 e
  o `recusaSemGravar` da 200): RN-208.01, .02, .03 (a, b), .05, .06 (b), .07 — vermelhos hoje; RN-208.04, .08 e o (c) da .03 **verdes** hoje
  (fixam a fronteira). Reescrever `[RN-200.06 (i)]` (`entregaSaiDeRespeitaSeparado.api.test.js:292`) para a RN-208.06 (a), com comentário
  "B1340 revertida (B1413)". ~40 min.
- **T1 (tronco) — a conta.** `mensagemSeparadoDeOutras` com `irmaosQ/irmaosN`; `guardaDosIrmaosNoPar`; `parteQueFicaPorItem` sobe; marca do
  laço; passada (c). T0 verde. **Controles positivos** (perl `-0pi` sobre base LF, âncora `grep -cF` = 1, md5 antes → sabotado → restaurado
  igual, **por cópia** se o conserto não estiver commitado; um por vez, suíte só depois de restaurar): (i) sem o excesso na marca →
  RN-208.01 e .05; (ii) `irm.q` = 0 → .01, .02, .06, .07; (iii) `fica` indefinido → .03 (a, b); (iv) marca `!!origemId` → .04 (b) e
  `[RN-200.04 b]`; (v) `fraseIrmaos` sempre na forma "só irmão" → .06 (a). Depois `npm run test:api` inteiro e `test:almoxarifado` — quebra
  fora da lista da Fase 0 vai para o plano antes de editar. ~40 min.
- **T2 (galho) — a tela.** `irmaosNoPar` e a chamada de `:2649`; RN-208.09 em `client/src/components/almoxarifado/RequisicoesSaiDeSobra.test.js`.
  Controle: sem o filtro do próprio item → o "A (3)" do item 2 vira "sobra 1 de 3; 2 desta" (vermelho). `CI=true npx react-scripts test` e
  `build`. ~20 min.
- **T3 (integração, rota E serviço) — `server/tests/api/entregaSaiDeGuardaDoIrmaoIntegracao.api.test.js`.** Pela **rota**: Entrada v2 A 3 e
  B 5 → `POST /requisicoes` com dois itens do mesmo material (2 e 2; B521) → aprovar → `PUT /requisicoes/:id/separacao` (item 1: 1 de A, depois
  1 sem origem; item 2: 2 de A) → `GET /estoque/:mat/saldos?requisicao_id=` (o `sobra` de A continua 3 — B1411: o servidor não muda) →
  `PUT /entregar` item 1 2 com `localizacao_origem_id` A (o payload de `montarItensEntrega`) → 400 com a literal do RN-208.01, nada gravado →
  `PUT /entregar` item 1 2 com Sai de B → 200 (troca de 1) → `PUT /entregar` item 2 num clique → 200, A 1, B 3; nenhuma linha negativa,
  físico = soma das linhas, requisição atendida. O **mesmo** pelo **serviço** (`prepararPosAprovacao` sob `comTravaDaRequisicao` →
  `separarRequisicao` → `entregarRequisicao` ×3), mesmos números e mesma literal. ~25 min.
- **T4 (sorteio, RN-208.10).** No `[RN-207.08]` de `entregaGuardaSemLote.api.test.js`: tirar a exclusão `explicitaAlem` de G/N, contar os
  casos, afirmar ≥ 10. Controle (i) da T1 aplicado ao sorteio → G/N ≥ 3. Números no plano. ~15 min.
- **F2 — revisor fresco** antes da T0, com as quatro perguntas da `desenvolver-etapa` (a quarta: cada RN até o último gesto — separar →
  recusa → entregar o que sobra → entregar o irmão → devolver → excluir a requisição; e a janela: o que o rótulo oferece a porta aceita?).
- **Fase 5** — revisão adversarial (correção da conta com `ja` + `fica`; "passaria com a feature quebrada?" sobre os controles e o sorteio).
- **T5 — fechamento** (`fechar-etapa`): novidades (B1407–B1414, C470/C472/C496 resolvidos, C497–C499, a B1340 revertida, D (208), F (208)),
  specs `05-separacao-picking` (a entrega) — a frase da 200 que diz que a própria requisição não é protegida **estava certa e deixa de
  valer** —, mapa, guia (Antes → Agora: *"escolher à mão de onde sai podia levar o que a outra peça separou"*; roteiro clicável com duas
  peças), manual (RN-208.xx), este plano, estimado × gasto.

## Cabe nas 4h?

Análise e plano ~1h (esta). Execução: T0 40 + T1 40 + T2 20 + T3 25 + T4 15 ≈ **2h20**, das quais ~1h40 são testes; código ~40 min. Com F2,
Fase 5 e fechamento apertados (~40 min), fecha em **~4h a 4h20** — no teto. Risco: a suíte achar teste além da RN-200.06 (i) que afirma o
caso (b) acima da parte com guarda viva no par (o C470 não tem teste: `grep -rl C470 server/tests` = 0, medido). Se
estourar em mais de 30 min: corte da B1414 (a tela → C499; depois a T4 mínima).

## Pontos de atenção

- **`ja` e `fica` juntos.** O irmão que sai da origem nesta entrega aparece no `ja` pelo que pede e no `fica` pelo resto; nunca somar a parte
  do banco (`PARTE_ORIGEM_SQL`) sem o `fica` (RN-208.03 controle). `saiu` é um `Map` vazio na validação (nada baixado).
- **`parte` do `origemGuardada`, não do item relido.** A marca do excesso usa a `parte` calculada no laço (`:2341`), antes de qualquer baixa.
- **O próprio item fora** (`ir.id <> ?`) — senão o (b) desconta a própria parte e recusa o que cabe.
- **Plural por irmão, não por quantidade:** `irmaosN` conta itens com guarda > folga.
- **A C1 não muda:** `separacaoSeparadoDeOutras` 23/23 sem edição prova; a separação nunca passa `irmaosQ`.
- **Teste de corrida:** nenhum gesto novo concorrente (B1412). Sem gancho.
- **Restauro da sabotagem** por cópia com md5 (ou `git checkout -- <arquivo>` se o conserto já estiver commitado), um controle por vez.

## Fase 2 — correções do revisor fresco (2026-11-06) — **MANDAM sobre o texto acima onde divergem**

Revisor fresco sobre `025d7109`: 1 trava (conta errada no plano), 3 importantes, 3 menores, todos aceitos. Confirmado: sem irmão a E1 e a C1
saem idênticas às de hoje (RN-200.06 (ii)/(iii) verdes); o irmão que sai na mesma entrega não conta em dobro (`ja` + `fica` = a parte dele); a
álgebra do excesso está certa; NULL vale a caixa inteira; `parteQueFicaPorItem` só lê o que o laço já preencheu; "só lote" cai em `outroPar`; T2 é
galho de verdade; T0 → T1 → T3/T4.

1. **[TRAVA] RN-208.02, fronteira corrigida:** "A 4 → 200 (sobra 2 cobre 2); A 3,999999 → 400 (sobra 1,999999)" (a regra é
   `saldo − outrasQ − irm.q + 1e-9 < qtdComOrigem`, `requisitionService.js:2417`; o exemplo de 3,000001 estava errado — não mexa no código por ele).
2. **[IMPORTANTE] As duas peças juntas (o jeito normal da tela):** a pré-seleção (`RequisicoesList.js:725-742`) manda o item 2 com A explícito (caso (b));
   a conferência física percorre por id (`requisitionService.js:2329-2402`) e a recusa caía no item 2, que a pessoa não mexeu. **Decisão (B nova,
   reversível): na T1, adiar a chamada de `validarOrigemDaEntrega` dos itens marcados (c) para depois do laço** — os (a)/(b) sem excesso garantem o
   físico primeiro e a recusa cai em quem escolheu à mão; nenhuma literal muda. **RN-208.12 — as duas peças juntas:** (a) A 4: item 1 Sai de A 2 + item 2
   com A explícito 2 → 200, A 0; (b) A 3, a mesma entrega → 400 **no item 1** (a E1 estendida, "para outra peça desta requisição"), nada gravado; nas duas
   ordens de id (molde `caso3` da RN-200.06 (iii)). Controle: sem o adiamento → na ordem item1 < item2 a recusa cai no item 2 com a literal física. Se o
   adiamento mudar outra recusa existente (teste da 200/198 vermelho), PARE nele, registre como C e siga com o C497 declarado (guia "o que não cobre").
3. **[IMPORTANTE] RN-200.06 (i) reescrito** ganha, depois do `entOk(… 2 …)`: item 1 num clique 2 → 200; R1 num clique 2 → 200; XB-01/L1 = 0.
4. **[IMPORTANTE] O sorteio (T4) cobre a 2ª forma:** no gerador, `else if (md < 0.4) { const ir = its.find((x) => x.id !== i.id && x.origem_separacao_id && x.material_id === i.material_id); if (ir) { e.localizacao_origem_id = ir.origem_separacao_id; if (ir.lote_separacao_id) e.lote_id = ir.lote_separacao_id; } }`;
   premissa ≥ 10 casos desse modo; o controle (ii) (`irm.q` = 0) com G ou N ≥ 3.
5. **[MENOR]** No contrato da literal, manter os ramos `entrega ? … : …` de hoje; trocar só o trecho entre `mas ` e `; sobra` (`requisitionService.js:149-160`).
6. **[MENOR] RN-208.09:** "item 1 sem origem"; mais o caso com o item 1 guardando 1 de A → o item 2 mostra "A (sobra 2 de 3; 1 desta)"; renomear
   `[RN-201.07/06] … rotula sem "desta"` (`RequisicoesSaiDeSobra.test.js:266`) para "(item único)".
7. **[MENOR]** RN-208.03 (a) e a T3 com a variante do item 2 com `localizacao_origem_id` = a origem dele (o que a tela manda).

## Execução

- [ ] **F2** — revisor fresco sobre o commit deste plano.
- [ ] **T0** — vermelho de partida + RN-200.06 (i) reescrito.
- [ ] **T1** — a conta, controles (i)–(v), `test:api` e `test:almoxarifado` inteiros.
- [ ] **T2** — a tela (galho), teste e build do cliente.
- [ ] **T3** — integração rota e serviço.
- [ ] **T4** — sorteio sem a exclusão.
- [ ] **Fase 5** — revisão adversarial.
- [ ] **T5** — fechamento (`fechar-etapa`), estimado × gasto.

## Próxima tarefa detalhada

**Os itens 8 e 9 do 2º pacote — peça em quarentena com lote (C466)**, já estimados em
`docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas-2.txt` (`:32-38`): *"1ª parte: o bloqueio passa a saber o lote"*
(4h30 a 5h30) e *"2ª parte: a entrega não tira a peça bloqueada"* (4h a 5h). Fazer a 1ª parte primeiro; a 2ª depende dela.

**Medida mínima (2026-11-06, sobre `0f1fb344`):** o bloqueio mora **só no material** — `materiais_almoxarifado.quantidade_bloqueada`, sem
lote. Quem escreve: `server/services/almoxarifado/stockService.js` (29 ocorrências; as escritas em `:1670`, `:1679`, `:1688`, `:1712`,
`:1740`, `:1872`, `:2005`, `:2373`, `:3152`, `:3517`, `:3532` — bloqueio, desbloqueio, devolução para quarentena, sucata e os estornos),
`nonConformityService.js` (10) e `inspectionService.js` (3). Quem lê para descontar: `loteImpedido.js:57` (`loteImpedidoSql` tira o bloqueado
do **total** do material, não do lote — por isso o desconto pode ficar menor que o real, D (206)), `availabilitySql.js`, `lotService.js`,
`materialService.js` e a rota (1 cada). A 1ª parte precisa de um registro por lote do que está bloqueado (tabela ou coluna nova — **migration**
com o ALTER no callback do CREATE, memória "prova de primeiro boot") e de cada uma dessas escritas gravar o lote; a 2ª troca o desconto do
`loteImpedidoSql`/`lotesParaOAutomatico` (`requisitionService.js:1925`) pelo bloqueado **do lote**. **Antes de planejar:** contar os caminhos
de bloqueio/liberação que conhecem o lote de origem (a devolução para quarentena cita a SAIDA, que tem `lote_id`; o bloqueio manual por
movimentação talvez não) — é o que decide o 4h30 ou o 5h30. Mexe no motor → tronco, sob a trava por material (todas essas portas já pegam,
Etapas 97/116-121). Vizinhos baratos que seguem abertos: **C491**, **C478**, **C486**, **C495**, **C497**, **C498**.
