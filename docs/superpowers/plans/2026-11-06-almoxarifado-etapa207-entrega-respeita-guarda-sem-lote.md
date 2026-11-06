# Etapa 207 — a entrega respeita a guarda sem lote (almoxarifado)

> **PLANO (Fase 0 + Fase 1), 2026-11-06.** Nada executado ainda. Próximo passo: F2 (revisor fresco do plano), depois T0.

> partida: "Próxima tarefa detalhada" de `docs/superpowers/plans/2026-11-06-almoxarifado-etapa206-entrega-recusa-lote-impedido.md`
> (`:397` em diante), conferida contra o código em `bb6a0c5e` — bate, com **três achados a mais** (abaixo). Aviso **C490** da 206. Estimativa
> já commitada: `docs/estimativas/2026-11/estimativa_2026-11-06_almoxarifado-guarda-sem-lote.txt` (**4h a 4h30**). Mexe em quem tira saldo do
> estoque (a entrega, passada 2) — **tronco**, sob as duas travas que a entrega já segura. Sem tela nova; a fatia visível é o histórico de
> movimentações passar a dizer **de onde** saiu a entrega quando havia peça separada no mesmo material.

## Objetivo (em linguagem simples)

Uma requisição com duas peças do mesmo material sem lote: a peça 2 foi separada da prateleira A; a peça 1 foi separada sem dizer de onde.
Hoje, quando se entrega só a peça 1, o sistema tira do lugar que ele acha melhor — e pode esvaziar justamente a prateleira A. Depois a peça 2
não sai mais (*"a origem da separação (A) não serve mais"*). Depois desta etapa, a entrega da peça 1 pula o que a peça 2 deixou separado em A
(sai de B, e de A só o que sobra livre), e a peça 2 continua saindo de A. Quando não há nenhuma peça separada com local, nada muda.

**Fronteira:** quando o livre fora das peças separadas **não cobre** a entrega, ela sai como hoje (B1398, **C492**). Item com série fica como
hoje (**C493**). A tela não muda (detalhe e fila: B1401).

## Fase 0 — medido em 2026-11-06 (sobre `bb6a0c5e`)

### O cenário, executado (o vermelho de partida)

Rodado com o script do revisor da 206 (`cenSL.tmp.js`, serviço idêntico ao da `main` — `diff -q` vazio em `requisitionService.js` e
`stockService.js`): material **sem** controle de lote, padrão P vazia, A 3, B 2; item 1 de 3 separado sem origem, item 2 de 2 separado de A.

```
SL cl0 antes [s3 e0 -:-][s2 e0 A:2] A/-=3 B/-=2 fis=5
SL cl0 r1 200 S:-/-=3 | [s3 e3 -:-][s2 e0 A:2] B/-=2 fis=2          <- a entrega do item 1 levou os 3 de A (SAIDA sem endereco)
SL cl0 r2 400 C-1: a origem da separação (CZ-A) não serve mais (O saldo em CZ-A (0) não cobre a quantidade (2) — a saída tiraria de ou…
```

Confirmado o C490. Note o livro: a SAIDA do automático vai **sem** `localizacao_origem_id` (D (51)).

### Onde (`server/services/almoxarifado/requisitionService.js`)

- `entregarRequisicao` (`:2132`) = `serializarNaRequisicao` → `comTravaDaRequisicao` → `entregarSemTrava` (`:2137`). Tudo abaixo roda **dentro**
  das duas travas.
- `lotesParaOAutomatico(db, materialId, saiuDaOrigemPorItem, parteQueFicaPorItem)` (`:1915-1973`): a consulta `guardadas` (`:1925-1928`) filtra
  `ir.lote_separacao_id IN (…)` (`:1927`) — guarda sem lote **nunca** entra. A conta de cada guarda (`:1938-1939`: `fica` do mapa, senão
  `parte − saiu`), a ordem do claim (`:1965-1966`: padrão primeiro, depois a maior linha, depois `id`) e o filtro das linhas usáveis (`:1967`:
  com endereço, endereço não bloqueado, livre > folga) são a régua a reusar.
- `dividirPorLotes` (`:1872-1902`), o formato `{ fatias, resto }`.
- `parteQueFicaPorItem` (`:2396-2400`, fixado antes da prévia — correto desde a B1394) e `saiuDaOrigemPorItem` (`:2636-2638`).
- `baixar(plano, baixa, quantidade, loteDaFatia, enderecoDaFatia)` (`:2571`): `enderecoDaFatia` vira `localizacao_origem_id` (`:2593`) e liga
  `origemEstrita` (`:2607`). Já serve para material sem lote sem mudança (é o que a passada 0 da origem planejada sem lote usa).
- **Passada 2** (`:2650-2667`): com `plano.controleLote` (lido em `:2548`) e sem série → `dividirPorLotes(lotesParaOAutomatico(…))` (`:2655`),
  fatias (`:2657-2660`) e o `resto` sem lote **sem endereço** (`:2662`); sem controle de lote → `baixar(plano, baixa, baixa.quantidade, null)`
  (`:2666`). Nos dois `null`, o motor escolhe a linha.

### O motor (`server/services/almoxarifado/stockService.js`)

- `claimSaldoSemLote` (`:467-505`): drena `lote_id IS NULL AND quantidade > 0` na ordem `(localizacao_id IS locPreferida) DESC, quantidade
  DESC, id` — a padrão (ou a origem declarada) primeiro; o resto vai negativo na linha de `locPreferida`. Não sabe de guarda.
- Origem estrita (`:1511-1521`): `opcoes.origemEstrita && localizacao_origem_id` confere `SUM(quantidade)` em `(material, endereço, lote_id IS
  loteIdFinal)` — com lote ausente, `lote_id IS NULL`. Recusa *"O saldo em ⟨end⟩ (n) não cobre a quantidade (q) — a saída tiraria de outros
  endereços"*. É o mecanismo da B1329 e funciona igual sem lote.
- Validação do endereço de saída (`:1459-1460`): `validarEnderecoExplicito` (só existência na origem, `:757-767`) e
  `validarLocalizacaoParaMovimento(resolveLocalizacaoSaida(material, origem))` (`:808`, regra `motivoRecusaEndereco` `:656-672`: **bloqueada**
  recusa; tipo permitido só no destino). Sem origem, valida a **padrão**.
- O livro grava `localizacao_origem_id || null` (`:2333`). O estorno da SAIDA credita `mov.localizacao_origem_id || padrão` (`:3392`); a
  **exclusão da requisição** credita a ENTRADA em `g.origem` (a origem da SAIDA, `requisitionService.js:2816` e `:2828`).

### Achado 1 — a exclusão e o estorno já sabem devolver ao endereço

Como a exclusão (`:2816-2828`) e o estorno (`stockService.js:3392`) usam a origem gravada na SAIDA, a SAIDA fatiada (com endereço) volta ao
endereço de onde saiu — hoje a SAIDA sem endereço volta para a padrão (consolida, D (51)). Melhora só onde há fatia; nada a codar, só a provar
(RN-207.06).

### Achado 2 — sem origem, o motor valida a padrão; com fatia, valida o endereço da fatia

Padrão **bloqueada**: hoje o automático sem lote recusa inteiro (*"Localização P está bloqueada"*, antes de baixar o pedaço). Com fatias, cada
fatia valida o próprio endereço. Se as fatias cobrem tudo, passa (aceita a mais — não é regressão). Se houvesse "fatias + resto livre", o resto
recusaria **depois** das fatias baixadas (entrega pela metade, RN-197.09). É o motivo da B1398: ou as fatias cobrem tudo, ou nada muda.

### Achado 3 — o resto sem lote voltaria ao mesmo poço

Na B1329 (com lote) o que os lotes não cobrem vai para o sem lote — **outro** poço, que não tem a guarda do lote. Sem lote não há outro poço: o
resto sem endereço é drenado pelo mesmo claim e pode levar a guarda de qualquer jeito. Fatiar pela metade só mudaria o livro, não protegeria.
Reforça a B1398.

### O que a 206 deixou como ponto de atenção — medido

1. **Guarda de outra requisição sem lote:** sim, sofre o mesmo (a consulta é por material, não por requisição; a 198 já recusa separar dela,
   `parteGuardadaDeOutras` `:92-104`). Entra junto, mesma consulta (B1399).
2. **`cabeDoAutomaticoPeloLote` (`:1995-2013`) soma o sem lote positivo inteiro:** a régua nova muda **de onde** sai, não **quanto** sai do
   sem lote positivo — a conta da conferência continua exata. Nada a mudar (B1401).
3. **Endereço bloqueado e linha sem endereço:** fora das fatias (a origem estrita precisa de endereço; a bloqueada o motor recusa).
4. **`permite_saldo_negativo`:** só pesa quando o livre não cobre → como hoje (B1398).
5. **Detalhe e Fila:** nenhuma recusa nova, então nada que a tela precise refletir (B1401).
6. **Trava:** nenhuma nova (B1403).
7. **C491:** vizinho, mas é da conta do teto com lote impedido, não desta régua — fica fora (custo e risco de misturar).

### Quem depende do comportamento de hoje

- `entregaAutomaticaPeloLote.api.test.js` `[RN-197.04]` (`:245`, material sem controle com saldo em lote: o automático sem lote −3) — **sem**
  guarda sem lote: continua verde (controle da fronteira, RN-207.02).
- `[RN-197.11]` (`:311`, `:319`, `:327`) e `[Fase 5 M1, S1]` (`:431`) — guarda **com** lote: verdes (a régua do lote não muda).
- `entregaLoteImpedido.api.test.js` `[RN-206.14 a/b]` (`:470-471`, `guardaDoProprio`) — verdes.
- Etapa 136 V1 (A 3, B 2, item 1 sem origem, item 2 de A, **na mesma entrega**): a passada 0 tira 2 de A, a guarda que fica é 0, sem guarda →
  uma baixa como hoje, livro igual.
- Não medido por varredura: teste que afirma o livro sem endereço de uma entrega com guarda sem lote viva de **outro** item. A T1 roda o
  `test:api` inteiro; quebra fora desta lista entra no plano **antes** de editar o teste.

## Decisões (letra B — reversíveis; livres depois de B1395, conferido por `grep` em `docs` e `specs`: nenhuma B1396+; C a partir de C492)

- **B1396 — o caminho: a régua da guarda (B1329) estendida às linhas sem lote.** Uma função nova lê a guarda **sem lote**
  (`lote_separacao_id IS NULL`) das caixas vivas do material (todas as requisições), desconta-a por endereço das linhas sem lote com saldo e,
  se o livre por endereço cobre a parte automática, devolve fatias `{ localizacao_id, quantidade }` na ordem do claim; cada fatia vai ao motor com
  `localizacao_origem_id` e origem estrita (o `baixar` de hoje, `enderecoDaFatia`). A conta de cada guarda (`fica` ou `parte − saiu`) é **extraída**
  de `lotesParaOAutomatico` (`:1938-1939`) para um helper que as duas usam — uma régua só. **Descartados:** (a) opção nova no motor para o claim
  excluir endereços — todas as portas de saída leem o motor (já descartado na 136); (b) reordenar itens/passadas — o cenário é em **duas**
  entregas, a ordem não ajuda; (c) recusar a entrega do item 1 — recusaria o que cabe (2 de B + 1 livre de A).
- **B1397 — sem guarda sem lote viva no material: uma baixa só, sem endereço, como hoje.** Livro idêntico (mesma SAIDA, mesmo claim). O D (51)
  continua valendo para esses casos. **Descartado:** fatiar sempre — mudaria o livro e o estorno de toda entrega comum (RN-207.02 a pega).
- **B1398 — o livre por endereço não cobre: uma baixa só, como hoje (nunca recusa nova).** Tudo ou como hoje: fatias só quando cobrem a parte
  inteira. **Descartados:** (a) recusar com literal nova — recusaria entregas que hoje saem (linha legada sem endereço, endereço bloqueado,
  negativo permitido) — o "isto ainda aceita o que o anterior aceitou?" responde não; (b) fatias + resto livre (a forma da B1329) — o resto volta
  ao mesmo poço e leva a guarda do mesmo jeito (Achado 3) e, com a padrão bloqueada, recusaria depois das fatias baixadas (Achado 2). O que fica
  desprotegido → **C492**.
- **B1399 — a guarda sem lote de OUTRAS requisições entra junto.** Mesma consulta (a com lote já contava todas, RN-197.11); custo zero; a 198 já
  recusa separar dela. **Descartado:** só a da mesma requisição — duas réguas diferentes para o mesmo automático.
- **B1400 — material COM controle de lote: o `resto` sem lote passa pela mesma função** (a guarda numa linha sem lote, `lote_separacao_id` NULL).
  Cobre → fatias sem lote com endereço; não cobre → `baixar(…, resto, null)` como hoje (`:2662`, inclusive o negativo do C485).
- **B1401 — conferência da 206, detalhe e Fila não mudam.** A régua troca de onde sai, não quanto: `cabeDoAutomaticoPeloLote` continua exato e
  nenhuma porta passa a recusar o que a tela oferece.
- **B1402 — o livro: a SAIDA fatiada grava o endereço de onde saiu de fato.** Uma SAIDA por fatia (como a B1329), cada uma com o `reserva_id` do
  pedaço. A exclusão e o estorno devolvem a cada endereço (Achado 1). É a fatia visível: o histórico de movimentações mostra a origem.
- **B1403 — sem trava nova.** A função lê dentro das duas travas da entrega (passada 2). Separação de outra requisição pega as mesmas travas.
- **B1404 — item com série: como hoje** (`:2666` com série). A série decide a peça; a linha que o claim drena é outra conversa → **C493**.
- **B1405 — corte se estourar 4h30 em mais de 30 min:** sai a RN-207.03 (a variante com lote, B1400) e a passada 2 com lote fica como hoje →
  **C494**. A régua sem controle de lote, a fronteira (RN-207.02), o livro (RN-207.06) e o sorteio ficam.

### Fora (C novos)

- **C492** — quando o livre por endereço fora das guardas não cobre a parte automática (linha sem endereço legada, endereço bloqueado, guarda
  maior que a linha), a entrega sai como hoje e pode levar a guarda do irmão; a próxima entrega dele toma *"não serve mais"* (B1398).
- **C493** — item **com série** em material sem lote: o claim escolhe a linha sem saber da guarda (B1404).
- **C494** — reservado para o corte da B1405.

## Regras de negócio

Montagem padrão (molde `cenSL.tmp.js` e `entregaAutomaticaPeloLote.api.test.js`): material **sem** controle de lote, sem série, não crítico,
unidade `un`, `localizacao_padrao_id` = P **vazia**, saldo por Entrada v2 com `localizacao_destino_id`; requisição `APROVADO` (por SQL, como
o molde, ou pela rota na T3); separação por `separarRequisicao` (com `localizacao_origem_id` para a guarda). Livro = `[tipo, endereço, lote,
quantidade]` das SAIDAs da requisição, na ordem do `id`.

- **RN-207.01 — a entrega pula a guarda do irmão (o C490).** A 3, B 2; item 1 (3) sem origem, item 2 (2) de A. Entrega do item 1 (3) → 200,
  livro `[['SAIDA', 'A', null, 1], ['SAIDA', 'B', null, 2]]` (a ordem do claim: A tem a linha maior), A 2, B 0. Entrega do item 2 (2, um clique)
  → 200, `['SAIDA', 'A', null, 2]`, A 0. **Controle positivo:** a função devolvendo `null` → a 2ª entrega 400 *"… a origem da separação (A) não
  serve mais …"* (o de hoje).
- **RN-207.02 — sem guarda sem lote, nada muda (B1397).** (a) A 3, B 2, um item de 3 sem origem → 200, livro `[['SAIDA', null, null, 3]]`, A 0,
  B 2 (o claim de hoje); (b) `[RN-197.04]` e `[RN-197.11]` verdes sem tocar; (c) item com série no material sem lote, com guarda sem lote do
  irmão → o livro de hoje (B1404). **Controle positivo:** fatiar sempre (tirar o "sem guarda → null") → (a) vermelho com
  `[['SAIDA', 'A', null, 3]]`.
- **RN-207.03 — material com controle de lote, guarda numa linha sem lote (B1400).** L1 1 em A (Entrada v2); linhas sem lote A 2 e B 2 por SQL
  (estoque de antes do controle, `quantidade_atual` acertado); item 2 (2) separado de (A, sem lote), item 1 (3) sem origem. Entrega do item 1 →
  200, `[['SAIDA', null, 'L1', 1], ['SAIDA', 'B', null, 2]]`; entrega do item 2 → 200 de A. **Controle:** o `resto` direto no `baixar(…, null)`
  → a 2ª entrega 400 "não serve mais".
- **RN-207.04 — a guarda de outra requisição (B1399).** A 3, B 2; R1 item (2) separado de A; R2 item (3) sem origem. Entrega de R2 (3) → 200,
  `[['SAIDA', 'A', null, 1], ['SAIDA', 'B', null, 2]]`; entrega de R1 (2) → 200 de A. **Controle:** a consulta filtrando `ir.requisicao_id = ?`
  → R1 400.
- **RN-207.05 — o livre por endereço não cobre: como hoje (B1398).** (a) A 3 (item 2 guarda 2 de A), linha **sem endereço** +2 por SQL; item 1
  (3) sem origem → livre por endereço 1 < 3 → 200, `[['SAIDA', null, null, 3]]` (o claim de hoje — o C492 visível: A 0 e a 2ª entrega do item 2
  recusa, afirmado para o próximo saber); (b) A 3 (guarda 2), B 2 **bloqueada** → idem, 200 e o livro de hoje. **Controle positivo:** fatiar o
  que der e mandar o resto sem endereço → (a) muda o livro (`['SAIDA', 'A', null, 1]` + `[…, null, null, 2]`), vermelho.
- **RN-207.06 — o livro e o desfazer (B1402, Achado 1).** Depois da RN-207.01 (só a 1ª entrega): `DELETE /api/almoxarifado/requisicoes/:id`
  (exclusão, admin, justificativa) → A volta a 3 (2 da guarda + 1) e B a 2 — cada ENTRADA do estorno com `localizacao_destino_id` = a origem da
  SAIDA; P continua 0. **Controle positivo:** o mesmo com a RN-207.02 (a) (SAIDA sem endereço) → a ENTRADA volta para P (prova que o teste
  distingue).
- **RN-207.07 — a guarda que fica desta entrega (a B1394, sem lote).** A 5, B 1; item 1 (3) separado de A, item 2 (3) sem origem. Entrega item 1
  2 (um clique, sai da origem) + item 2 3 → 200, livro `[['SAIDA', 'A', null, 2], ['SAIDA', 'A', null, 2], ['SAIDA', 'B', null, 1]]`, A 1; a 2ª
  entrega do item 1 (1) → 200 de A. **Controle positivo:** chamar a função sem `parteQueFicaPorItem` (a guarda relida do banco depois da baixa
  vira 0) → `['SAIDA', 'A', null, 3]` e a 2ª entrega 400 "não serve mais".
- **RN-207.08 — sorteio com invariantes (o fuzz da 196/197/206).** Ver T4.

## Contrato (congelado)

### Rota

`PUT /api/almoxarifado/requisicoes/:id/entregar` — payload, 200, códigos e literais **sem mudança**. **Nenhuma recusa nova** (B1398). A
literal *"⟨material⟩: a origem da separação (⟨end⟩) não serve mais (…) — entregue escolhendo de onde sai"* continua byte a byte (é o que a
RN-207.01 deixa de provocar, não o que muda).

### Serviço (`requisitionService.js`, perto de `lotesParaOAutomatico`)

```js
// Extraido de lotesParaOAutomatico :1938-1939, SEM mudar a conta: a parte de uma guarda que o automatico tem de pular.
function guardaQueConta(g /* { id, q } — q = PARTE_ORIGEM_SQL */, saiuDaOrigemPorItem /* Map */, parteQueFicaPorItem /* Map | undefined */) {
  const fica = parteQueFicaPorItem ? parteQueFicaPorItem.get(Number(g.id)) : undefined;
  return fica !== undefined ? fica : Math.max(0, (Number(g.q) || 0) - (saiuDaOrigemPorItem.get(Number(g.id)) || 0));
}

// Etapa 207 (B1396-B1399): as fatias por endereco da parte automatica SEM lote. So le; dentro das duas travas da entrega.
// null = sem guarda sem lote viva (> folga) no material (B1397) OU o livre usavel nao cobre `quantidade` (B1398) -> o chamador baixa como hoje.
// Senao [{ localizacao_id, quantidade }], soma === Q.qtd(quantidade), cada fatia > Q.QTD_FOLGA.
async function fatiasSemLoteParaOAutomatico(db, materialId, quantidade, saiuDaOrigemPorItem, parteQueFicaPorItem)
```

- Guardas: `itens_requisicao_almoxarifado ir JOIN requisicoes_almoxarifado r` com `ir.material_id = ? AND ir.origem_separacao_id IS NOT NULL
  AND ir.lote_separacao_id IS NULL AND caixaVivaSql('r')`, `q = PARTE_ORIGEM_SQL`; cada uma por `guardaQueConta`, somada por endereço.
- Linhas: `estoque_saldo_almoxarifado s LEFT JOIN localizacoes_almoxarifado lc` com `s.lote_id IS NULL AND s.quantidade > 0`; `livre =
  max(0, quantidade − guarda do endereço)`; ordem `:1965-1966` (padrão, `quantidade` DESC, `id`); usáveis = `:1967` (endereço não nulo, não
  bloqueado, livre > folga). Fatias gulosas nessa ordem; `Σ livre usável + Q.QTD_FOLGA < quantidade` → `null`.
- `lotesParaOAutomatico` passa a chamar `guardaQueConta` no lugar das linhas `:1938-1939` — resultado idêntico (RN-197.11, M1, RN-206.14 verdes).

### Passada 2 (`:2650-2667`)

```js
const baixarSemLote = async (plano, baixa, q) => {
  const fs = await fatiasSemLoteParaOAutomatico(db, plano.item.material_id, q, saiuDaOrigemPorItem(), parteQueFicaPorItem());
  if (!fs) return baixar(plano, baixa, q, null);                         // B1397/B1398: como hoje
  for (const f of fs) await baixar(plano, baixa, f.quantidade, null, f.localizacao_id); // B1402: origem estrita, endereco no livro
};
// com controleLote e sem serie: as fatias por lote de hoje; `if (resto > folga) await baixarSemLote(plano, baixa, resto)` (B1400)
// sem controleLote e sem serie (novo ramo): `await baixarSemLote(plano, baixa, baixa.quantidade)`
// com serie: `baixar(plano, baixa, baixa.quantidade, null)` como hoje (B1404)
```

## Tasks

Todas **tronco** e sequenciais: T1 mexe na régua que o automático e a conferência da 206 compartilham; T2–T4 só a provam. Sem worktree, sem
galho (os testes batem no mesmo motor; nenhum é independente de regra).

- **T0 (tronco) — o vermelho de partida.** `server/tests/api/entregaGuardaSemLote.api.test.js` (novo, runner próprio do molde) com RN-207.01,
  .03, .04 e .07 — vermelhos hoje (a 2ª entrega 400). RN-207.02 (a), .05 e .06 (controle) **verdes** hoje (fixam a fronteira antes do código).
  ~20 min.
- **T1 (tronco) — a régua.** `guardaQueConta` (extração), `fatiasSemLoteParaOAutomatico`, `baixarSemLote` na passada 2 (os três ramos do
  contrato). T0 verde. **Controles positivos** (sabotagem, restaurar por `git checkout` do arquivo — não por cópia): (i) `return null` no começo
  da função → RN-207.01/.03/.04/.07 vermelhos; (ii) tirar o "sem guarda → null" → RN-207.02 (a) vermelho; (iii) fatiar o que der + resto livre →
  RN-207.05 (a) vermelho; (iv) filtro por requisição → RN-207.04 vermelho; (v) sem `parteQueFicaPorItem` → RN-207.07 vermelho. Depois
  `npm run test:api` inteiro — quebra fora da lista da Fase 0 vai para o plano antes de editar. ~1h.
- **T2 (tronco) — o livro e o desfazer.** RN-207.06 no mesmo arquivo (exclusão pela **rota** `DELETE /requisicoes/:id`; controle com a SAIDA sem
  endereço). ~20 min.
- **T3 (integração, rota E serviço) — `server/tests/api/entregaGuardaSemLoteIntegracao.api.test.js`.** Pela **rota**: Entrada v2 A 3 e B 2 →
  `POST /requisicoes` com dois itens do mesmo material (3 e 2; item repetido é aceito, B521) → aprovar → `PUT /requisicoes/:id/separacao` (item 1
  sem origem, item 2 de A) → `GET /requisicoes/:id` (os entregáveis de hoje: 3 e 2 — B1401) → `PUT /entregar` item 1 (200, A 1 + B 2 no livro, com
  endereço) → `PUT /entregar` item 2 (200, A 2) → nenhuma linha negativa, físico = soma das linhas, requisição atendida → `GET` do histórico de
  movimentações do material mostra a origem das duas primeiras SAIDAs (a fatia visível). O **mesmo** pelo **serviço** (`prepararPosAprovacao`
  sob `comTravaDaRequisicao` → `separarRequisicao` → `entregarRequisicao` ×2), mesmos números e mesmo livro. A reserva da aprovação sai inteira
  (as duas fatias citam o `reserva_id` do pedaço). ~25 min.
- **T4 (sorteio, RN-207.08) — no arquivo da T0, `[RN-207.08, sorteio]`.** PRNG com semente fixa (o `mulberry32` do `fuzz206g.tmp.js`), **120**
  casos: material sem lote (70%) ou com lote + linhas sem lote por SQL (30%); 2–3 endereços **com** endereço e não bloqueados + padrão; 0–1
  guarda de outra requisição; 2–3 itens com guarda (60%) ou sem; 1ª entrega aleatória às vezes; depois uma entrega aleatória (como o modo G do
  revisor, com `origem_automatica` e origem planejada às vezes). Invariantes, depois de cada entrega **aceita**:
  - **G** — toda guarda viva (par endereço/lote, **inclusive lote nulo**: tirar o `if (g.lote == null) continue` do revisor) que cobria antes
    cobre depois;
  - **N** — a próxima entrega de cada item com guarda, num clique, não toma "não serve mais" (fora o lote impedido, que este gerador não monta);
  - **L** — material sem guarda sem lote viva antes da entrega: nenhuma SAIDA com `lote_id` nulo **e** `localizacao_origem_id` não nulo (B1397);
  - **F** — físico = soma das linhas.
  Premissas afirmadas: ≥ 30 casos com guarda sem lote viva na entrega e ≥ 20 casos do L. **Controles positivos** (sabotagem de produção, uma de
  cada vez): (i) `return null` → G+N ≥ 5; (ii) fatiar sempre → L ≥ 5. Números de cada rodada no plano. ~35 min.
- **F2 — revisor fresco** antes da T0, com as quatro perguntas da `desenvolver-etapa` (a quarta: cada RN até o último gesto — separar → entregar
  parte → entregar o irmão → devolver → estornar a SAIDA fatiada → excluir a requisição).
- **Fase 5** — revisão adversarial (correção da RN; "passaria com a feature quebrada?" sobre o sorteio e os controles).
- **T5 — fechamento** (`fechar-etapa`): novidades (B1396–B1405, C492–C494, C490 fechado, D (207) — o D (51) melhora só com fatia —, F (207)),
  specs `05-separacao-picking` (a entrega) e `10-lotes-series-etiquetas` (o livro sem lote com endereço), mapa, guia (Antes → Agora: *"entregar
  uma peça podia levar o material que a outra peça tinha separado"*; roteiro clicável com duas peças), manual, este plano, estimado × gasto.

## Cabe nas 4h–4h30?

Análise e plano ~1h (esta). Execução: T0 20 + T1 1h + T2 20 + T3 25 + T4 35 ≈ **2h40**, das quais ~1h40 são testes; código ~1h. Com F2, Fase 5 e
fechamento apertados (~40 min), fecha em **~4h20 a 4h40** — no teto. O risco é a T4 (o gerador com lote + sem lote e a premissa). Se estourar em
mais de 30 min: corta a RN-207.03 e o ramo com lote (B1405 → C494); o sorteio cai para só material sem controle de lote.

## Pontos de atenção

- **Byte a byte sem guarda.** A função tem de devolver `null` **antes** de qualquer leitura de linhas quando não há guarda sem lote > folga
  (barato e a prova da B1397). A RN-207.02 e o L do sorteio pegam o contrário.
- **`fica` e `saiu` são os mesmos mapas** de `lotesParaOAutomatico` (`parteQueFicaPorItem()` e `saiuDaOrigemPorItem()`, relidos a cada pedaço da
  passada 2 — o 2º item vê o que o 1º baixou). Nunca reler a parte do banco sem o `fica` (RN-207.07, o R2 da 206).
- **A ordem do claim** decide o livro das RN (A antes de B porque a linha A é maior). Não reordene pelo livre: o livro esperado das RN segue a
  ordem `:1965-1966`, a mesma da B1329.
- **Linha guardada maior que a linha** (a guarda passa do saldo do endereço — p.ex. uma saída avulsa tirou dali): `livre = max(0, …)`; o que falta
  cai no B1398. Registrar no C492 se o sorteio achar.
- **Padrão bloqueada** (Achado 2): com fatias, cada SAIDA valida o próprio endereço — passa onde hoje recusa. Aceitável (aceita a mais); citar no
  D (207).
- **Reserva:** cada fatia leva o `reserva_id` do pedaço (como a B1329, `[Fase 5 M2]`); a T3 confere a reserva consumida inteira.
- **Devolução** que cita uma SAIDA fatiada: cita uma das SAIDAs (cada uma com a sua quantidade) — o que já vale para as fatias por lote. Não
  muda; a Fase 5 olha.
- **Teste de corrida:** nenhum gesto novo concorrente (B1403). Sem gancho.
- **Restauro da sabotagem por `git checkout -- <arquivo>`**, um controle por vez, suíte só depois de restaurar (memória: sabotagem concorrente
  contamina a suíte).

## Execução

- [ ] F2 — revisor fresco do plano (antes da T0)
- [ ] T0 — o vermelho de partida (`entregaGuardaSemLote.api.test.js`: RN-207.01/.03/.04/.07 vermelhos; .02 a, .05, .06 controle verdes)
- [ ] T1 — `guardaQueConta` + `fatiasSemLoteParaOAutomatico` + `baixarSemLote` na passada 2; controles (i)–(v); `test:api` inteiro
- [ ] T2 — RN-207.06 (exclusão devolve a cada endereço; controle com a SAIDA sem endereço)
- [ ] T3 — integração pela rota e pelo serviço (`entregaGuardaSemLoteIntegracao.api.test.js`)
- [ ] T4 — sorteio RN-207.08 (G/N/L/F, premissas, controles (i) e (ii) com os números)
- [ ] Fase 5 — revisão adversarial
- [ ] T5 — fechamento (`fechar-etapa`) e as cinco suítes, serial

## Próxima tarefa detalhada

**A T0 desta etapa** (e, ao fechar, o que vem depois dela, abaixo). Medido sobre `bb6a0c5e`:

- **Comece pelo F2**: o revisor recebe este plano + `requisitionService.js:1872-1973` (`dividirPorLotes`, `lotesParaOAutomatico`), `:2396-2400`,
  `:2571-2667` (`baixar`, passadas) e `stockService.js:467-505` (`claimSaldoSemLote`), `:1511-1521` (origem estrita). Pergunta extra: a B1398
  ("tudo ou como hoje") deixa algum caso **comum** desprotegido que a forma da B1329 protegeria sem o problema do Achado 2?
- **T0:** o arquivo novo segue o molde de `entregaAutomaticaPeloLote.api.test.js` (helpers `material`, `entrar`, `req`, `sep`, `livro`,
  `linhas`) — copie os helpers, não importe. O cenário da RN-207.01 é o `cenSL.tmp.js` (scratchpad do revisor da 206,
  `…/rev206b/server/tests/cenSL.tmp.js`), o gerador do sorteio é o `fuzz206g.tmp.js` da mesma pasta (modo G, sem o modo E).
- **Contrato que a T1 consome:** `guardaQueConta(g, saiu, fica)` e `fatiasSemLoteParaOAutomatico(db, materialId, quantidade, saiu, fica) →
  null | [{ localizacao_id, quantidade }]`; `baixar(plano, baixa, q, null, endereco)` já existe (`:2571`).
- **Depois desta etapa:** os itens **8** e **9** do 2º pacote (`docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas-2.txt`,
  já estimados: *"Peça em quarentena — 1ª parte: o bloqueio passa a saber o lote"*, 4h30 a 5h30; *"2ª parte: a entrega não tira a peça
  bloqueada"*, 4h a 5h) — **C466**. Vizinhos baratos: **C491** (o teto que conta a parte da própria origem cujo lote ficou impedido), **C478**,
  **C486**.
