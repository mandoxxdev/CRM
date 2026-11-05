# Etapa 196 — Separar em duas vezes: a parte separada primeiro continua saindo de onde foi separada

> **Tronco (motor da requisição).** Estimativa enviada: item 4 de `docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas.txt`
> (**4h**: análise 1h, execução ~1h, teste 2h) — **revisada para 6h** em `db5147ba` (a medida deste plano: execução ~3h; ver "Cabe em 4h?"). Fecha a parte "o local de onde
> sai" do **C453**; a parte "material com lote" (o pedaço automático sai da linha *sem lote*, **C451**/**B204**) é o item 5 (outra etapa).
> Plano medido sobre `7a02c149`. Spec: `specs/modulo-almoxarifado/05-separacao-picking/README.md`.

## Objetivo (em linguagem simples)

O almoxarife separa 3 de uma requisição de 6 no endereço que a fila sugeriu (XB-01, lote L1). O resto chega depois em outro endereço e ele
separa os outros 3, sem ter entregue os primeiros. Hoje o sistema "esquece" de onde vieram os primeiros 3: grava uma **troca** no bloco
**Substituições** e, na entrega, tira os 6 no automático. Passa a lembrar: os 3 primeiros saem de XB-01/L1; os outros 3 saem como saíam
(automático), sem troca registrada.

## Fase 0 — medido em 2026-11-05 (sobre `7a02c149`)

### Onde a origem é escolhida e gravada — `server/services/almoxarifado/requisitionService.js`

- Entrada `separarRequisicao` (`:1281-1284`): `serializarNaRequisicao` → `comTravaDaRequisicao` → `separarSemTrava` (`:1286`). As duas
  travas já cercam tudo o que esta etapa escreve (separação, entrega `:1689`→`entregarSemTrava` `:1694`, devolução à prateleira `:2435-2438`).
- Retrato antes da rodada: `planejadaAntes` (`:1336-1343`, `pend` = separado − entregue); o mesmo pendente semeia `pedidoSeparacao`
  (`:1344-1347`, o comprometido do par para `checarOrigemItem`).
- Par da rodada: `entrada.localizacao_origem_id`/`lote_id` (`:1400-1401`), `pendenteAntes` (`:1402`), `mesmoPar` (`:1407-1408`).
- Régua da divergência, `outras` (`:1420-1424`): separado − entregue de **outras** requisições no mesmo par.
- **A regra "mista → nula"** (`:1441-1444`); gravada em memória (`:1451-1452`) e no banco (`:1514-1516`).
- **Troca SEPARACAO** registrada para todo item com `planejadaAntes` que terminou sem origem (`:1537-1555`).
- Entrega: a planejada vale até `pendenteSep` = separado − entregue (`:1811`, `:1813-1821`, `qtdComOrigem = min(qty, pendenteSep)`); a
  substituição da entrega usa o mesmo `pendenteSep` (`:1839-1850`); a baixa já se divide em pedaço "com origem" (estrito) + automático
  (`:2007-2024`, Etapa 63); a origem zera quando a caixa esvazia (`:2133-2140`, no `finally`).
- Devolução à prateleira: `devolverSemTrava` (`:2442`), reduz o separado (`:2496`) e zera a origem só com a caixa vazia (`:2516-2521`).
- Fila/sugestão: `planejados` (`:321-326`, soma separado − entregue por par planejado) → `planejadoPorPar` (`:347-348`); `lerDadosDaColeta`
  passa `separado_pendente` = separado − entregue (`:1036-1039`) e `sugestaoDeColeta.js:191-205` sugere o par planejado (RN-188.01a).
- `lotService.js:463-471` conta **itens** com `lote_separacao_id` e caixa > 0 (contagem, não quantidade).
- Escritores das quantidades do item: só três — separação `:1514`, entrega `:2105`, devolução `:2496` (grep de `SET quantidade_separada` e
  `quantidade_entregue =` em `services/` e `routes/`; controle: o grep acha as três linhas conhecidas).
- `ir.*` em `:365`, `:945` e `routes/almoxarifado.js:3942`: coluna nova no item aparece sozinha no detalhe e na fila (aditivo).

### O caso real (a reprodução da 189) e a correção do plano da 195

- `server/tests/api/preSelecaoColetaIntegracao.api.test.js:206-236` (`[T4 rota, I1 da Fase 2] duas rodadas sem entregar`): L1 3 em XB-01,
  requisição de 6, 1ª rodada de XB-01/L1 com 3; chega L2 3 em XP-01; a sugestão vem `pegar_em: null`, `PLANEJADA_NAO_COBRE`; **a 2ª rodada
  vai sem "Sai de"** (automático). Resultado: 1 troca `['SEPARACAO', 3, 1]`, XB-01/L1 fica com 3, XP-01/L2 com 3, linha sem lote **−6**.
- **O plano da 195 estava errado num ponto** ("na tela, a 2ª rodada do item com separado pendente não é pré-selecionada"): ela **é**
  pré-selecionada com a planejada desde a Etapa 65 (`client/src/components/almoxarifado/RequisicoesList.js:534-550`,
  `valorPlanejadaNaSeparacao` `:201-206`) — **quando a planejada cobre** a quantidade. No caso real ela **não** cobre (o resto não está lá),
  então a janela abre no automático. Quem não pré-seleciona é a sugestão da 189 (`:595`, `:221`), de propósito (M2). Fica registrado aqui e
  no fechamento (regra 5 do CLAUDE.md).
- Consequência para a escolha: **"o automático herdar a planejada" (caminho c) não resolve o caso real** — a entrega aplicaria a planejada
  ao pendente inteiro (6) num par que só tem 3 e recusaria (*"a origem da separação (XB-01) não serve mais (…)"*, `:1794`). Herdar só
  funciona se o sistema souber **quanto** do pendente é daquele par.

### Telas que leem a planejada — `RequisicoesList.js`

`temPlanejada` `:160`, `pendenteSeparado` `:163`, `trocaDaPlanejada` `:177-183`, `trocaNaSeparacao` `:192-198`, `jaNoParDosIrmaos`
`:235-238`, `FRASE_PARCIAL` `:242`, `:267-268` (máximo na tela), efeito da entrega `:670-693` (**`qtd > pendenteSeparado(item)` decide se
pré-seleciona a planejada**, `:679`), `:982`, linha "separado de" `:1723-1725`, aviso de troca `:2480-2483`, dica da entrega `:2608-2611`.
`FilaSeparacao.js:79-80` (só o código). Testes que afirmam a troca na separação: `server/tests/api/trocaSeparacao.api.test.js` (12 testes;
`:63`, `:82`, `:93`, `:109` mudam), `preSelecaoColetaIntegracao.api.test.js:221`, `client/.../RequisicoesTrocaSeparacao.test.js`
(`:259-334`, os de aviso/motivo da separação).

### Caminhos pesados

| Caminho | O que faz | Medida | Decisão |
|---|---|---|---|
| (a) entrega dividir pelas rodadas (`itens_json`) | deriva a caixa por par repassando rodadas, entregas e devoluções à prateleira em ordem | não há "quando a caixa esvaziou" gravado; precisaria de um replay dos três escritores; frágil | **descartado** |
| (b) tabela de origens por item (vários pares) | cada rodada guarda seu par e quantidade; entrega baixa de cada um | todos os leitores acima mudam; a entrega passa a ter N pedaços estritos por item; série exige um lote só (`:1777`); ~4-5h só de execução | **descartado agora** — é o "mais de uma origem por item" que a B1254 já deixou para depois |
| (c) automático herda a planejada | 2ª rodada sem "Sai de" mantém a planejada | não resolve o caso real (acima); com escolha explícita a Etapa 65 já pré-seleciona | **descartado** |
| **(d) a planejada ganha QUANTIDADE** | o item continua com **um** par, mais `quantidade_origem_separacao` (quanto da caixa é daquele par); a rodada de outro par não apaga, só não soma | um `ALTER`, as contas trocam "separado − entregue" por "a parte da origem" nos leitores; a entrega já sabe dividir (Etapa 63) | **escolhido** |

## Regras

- **RN-196.01** — O item guarda, além do par (endereço, lote) da separação, **quanto** da caixa saiu dele: `quantidade_origem_separacao`.
  Rodada de um par sobre item **sem** origem guardada (com ou sem caixa pendente): o par vira a origem e a quantidade é a da rodada.
  *Cenário:* sem nada separado, separa 3 de A → origem A, 3. Com 2 na caixa sem origem, separa 3 de B → origem B, 3 (antes: nula).
- **RN-196.02** — Rodada do **mesmo** par (régua exata da Etapa 65, `mesmoPar`): a quantidade soma. *Cenário:* A 3, depois A 2 → A 5.
- **RN-196.03** — Rodada de **outro** par, ou **sem** "Sai de", ou só de lote, sobre item com origem guardada e caixa pendente: a origem e
  a quantidade **ficam**; a parte nova fica sem origem (sai no automático na entrega). *Cenário (o real):* XB-01/L1 3, depois automático 3 →
  origem XB-01/L1, 3; caixa 6.
- **RN-196.04** — A separação **não grava mais troca** (`momento 'SEPARACAO'`): a origem guardada não muda numa rodada. As linhas antigas
  ficam e continuam aparecendo em **Substituições**. A troca da **entrega** (Etapa 63) continua igual, com a quantidade limitada à parte da
  origem (RN-196.06).
- **RN-196.05** — Várias entradas do mesmo item na mesma rodada: a primeira com par vira a origem (RN-196.01) e as outras seguem
  RN-196.02/03. *Cenário:* sem origem, rodada com A 1, A 1, B 2 → origem A, 2; caixa 4.
- **RN-196.06** — Entrega sem escolha (um clique, ou "Planejada da separação"): sai **da origem guardada até a parte dela**
  (`qtdComOrigem = min(qty, parte)`), o resto no automático — a divisão que já existe. *Cenário:* XB-01/L1 3 + automático 3, entrega 6 →
  3 de XB-01/L1 (estrito), 3 automático; 0 trocas.
- **RN-196.07** — Toda entrega do item consome **primeiro** a parte da origem: `parte = max(0, parte − entregue nesta entrega)`; chegando a
  0 (ou com a caixa vazia, a regra de hoje), a origem e a quantidade zeram. Vale também quando a entrega sai de outro endereço (a troca da
  Etapa 63 registra `min(qty, parte)`).
- **RN-196.08** — Devolver à prateleira tira **primeiro** a parte sem origem: depois da devolução, `parte = min(parte, caixa)`; caixa 0 →
  zera (a regra de hoje).
- **RN-196.09** — Quem conta o comprometido do par conta **a parte**, não a caixa: `pedidoSeparacao` (`:1344-1347`), `outras` da régua
  (`:1420-1424`), `planejados` da fila (`:321-326`) e o `separado_pendente` que vai à sugestão (`:1038`). A conta é
  `COALESCE(quantidade_origem_separacao, separado − entregue)`.
- **RN-196.10** — Dado antigo (origem guardada sem quantidade, `NULL`) vale **a caixa inteira**, como hoje — sem migração. Ninguém mais
  grava origem sem quantidade.
- **RN-196.11** — Tela: o que a janela compara com "o pendente da planejada" passa a usar a parte (`pendentePlanejado(item)` =
  `quantidade_origem_separacao ?? pendenteSeparado(item)`) — `:238`, `:267-268`, `:679`, `:2608`. Sem isto a janela de entrega
  pré-selecionaria a planejada para os 6 e o servidor recusaria (estrito 6 num par com 3).
- **RN-196.12** — Tela: na separação, escolher outro par (ou automático) sobre item com origem guardada **não é mais troca**: some o campo
  "Motivo da troca" e o aviso vira a literal abaixo; `FRASE_PARCIAL` também muda. A linha "separado de" do detalhe ganha a quantidade
  (fatia visível).
- **RN-196.13** (fronteira com o item 5) — Em material com lote, o pedaço **automático** continua saindo da linha *sem lote* (B204); esta
  etapa não toca o motor nem `claimSaldoSemLote`. No caso real o negativo cai de −6 para −3 (só a parte automática). O par guardado inclui o
  lote — o item 5 parte daqui sem desfazer nada.

## Contrato congelado

Nenhuma rota nova; payloads iguais.

- **`PUT /api/almoxarifado/requisicoes/:id/separar`** (`routes/almoxarifado.js:4655`) — payload igual. Resposta igual. Recusas iguais,
  literais intocadas (ex.: *"⟨material⟩: não é possível separar ⟨X⟩ ⟨un⟩. Máximo: ⟨m⟩ (pendente: …, disponível: …)"* `:1388-1394`;
  *"⟨material⟩: O saldo em ⟨end⟩ (⟨s⟩) não cobre a quantidade (⟨q⟩) — a saída tiraria de outros endereços"* `:1207-1208`, agora com o
  comprometido pela parte). `motivo_substituicao` na separação passa a ser **ignorado** (sem troca não há onde gravar) — aceito sem 400.
- **`PUT /api/almoxarifado/requisicoes/:id/entregar`** (`:4758`) — igual; recusas iguais (*"⟨material⟩: a origem da separação (⟨end⟩) não
  serve mais (⟨motivo⟩) — entregue escolhendo de onde sai"* `:1794`), agora só para a parte.
- **`PUT /api/almoxarifado/requisicoes/:id/devolver-separado`** (`:4660`) — igual.
- **`GET /api/almoxarifado/requisicoes/:id`** e a fila — cada item ganha `quantidade_origem_separacao` (número ou `null`), aditivo, via `ir.*`.
- **Banco:** `ALTER TABLE itens_requisicao_almoxarifado ADD COLUMN quantidade_origem_separacao REAL` (safeAlter, ao lado de
  `schema.js:2893-2894`).
- **Literais novas da tela** (`RequisicoesList.js`):
  - aviso na separação (substitui `:2483`): *"Já separado de ⟨end⟩⟨ — lote L⟩: ⟨q⟩ ⟨un⟩, que continuam saindo de lá. Esta parte sai no
    automático na entrega."*, `id="separacao-aviso-origem-${item.id}"`;
  - `FRASE_PARCIAL` (`:242`): *" Se o resto vier de outro endereço, esta parte continua saindo daqui; o resto sai no automático na entrega."*;
  - linha do detalhe (`:1723-1725`): *"separado de ⟨end⟩ (⟨q⟩ ⟨un⟩)"* quando há quantidade; sem ela, como hoje.

## Tasks (sort topológico)

- **T0 — tronco — coluna e helper.** `safeAlter` da coluna; helper `parteDaOrigem(item)` e o fragmento SQL `PARTE_ORIGEM_SQL` em
  `requisitionService.js`. Teste: primeiro boot em pasta vazia (`CRM_DATA_DIR`) e a coluna existe. *Controle:* sem o `ALTER`, o teste cai.
- **T1 — tronco — separação (RN-196.01..05, 196.09 na própria rodada).** `:1336-1347` (retrato e `pedidoSeparacao` pela parte), `:1420-1424`
  (`outras` pela parte), `:1441-1452` (a regra nova no lugar do "mista → nula", guardando a quantidade em memória), `:1514-1516` (grava a
  quantidade), remove `:1537-1555`. Testes em `server/tests/api/origemSeparacaoEmDuasVezes.api.test.js` (novo, `[RN-196.xx]` no nome) e
  reescrita de `trocaSeparacao.api.test.js:63/82/93/109` (dizem a regra velha). *Controles:* (1) voltar o "mista → nula" → caem RN-196.03 e
  RN-196.05; (2) somar a parte também com outro par → cai RN-196.03 (parte 6 em vez de 3); (3) `pedidoSeparacao` pela caixa → cai o cenário
  "3ª rodada de XB-01 com 2 livres lá" (recusa falsa).
- **T2 — tronco — entrega e devolução (RN-196.06..08, 196.10).** `:1811-1821` e `:1839-1850` pela parte; no `finally` (`:2133-2140`)
  `UPDATE … SET quantidade_origem_separacao = MAX(0, COALESCE(quantidade_origem_separacao, ?) - ?)` relativo e zera origem+quantidade ≤ folga;
  devolução `:2516-2521`: `parte = MIN(parte, caixa)`. *Controles:* (1) entrega com `pendenteSep` → cai RN-196.06 (400 estrito 6 em 3);
  (2) sem decrementar → cai RN-196.07 (entrega 3 e depois 3: a segunda sai estrita de XB-01 vazio); (3) devolução sem `MIN` → cai RN-196.08;
  (4) `COALESCE` tirado → cai RN-196.10 (dado antigo `NULL` sai todo automático).
- **T3 — tronco — leitores da fila (RN-196.09).** `:321-326` e `:1038` pela parte; `lotService.js:466` fica (conta itens; a origem zera com a
  parte — NO-OP declarado). *Controle:* fila pela caixa → cai o cenário "outra requisição vê XB-01 com 3 comprometidos, não 6".
- **T4 — galho (contra o contrato acima) — tela (RN-196.11, 196.12).** `pendentePlanejado` e as quatro trocas; `trocaNaSeparacao` só para a
  dica nova (sem motivo); literais novas; linha do detalhe. Teste novo `RequisicoesOrigemEmDuasVezes.test.js` e ajuste de
  `RequisicoesTrocaSeparacao.test.js:259-334` e das suítes da 189 que leem `FRASE_PARCIAL`. *Controles:* `:679` com `pendenteSeparado` →
  cai "entrega com parte 3 e caixa 6 abre no automático, sem chave"; aviso velho → cai a literal.
- **T5 — integração (cruza T1, T2, T3), pela ROTA e pelo SERVIÇO** — em `origemSeparacaoEmDuasVezes.api.test.js`:
  - **rota:** o caso real da 189 (material com lote: XB-01/L1 3, chega XP-01/L2 3, 2ª rodada sem "Sai de") → 0 trocas, origem XB-01/L1 parte
    3 → entrega de um clique 6 → XB-01/L1 0, a parte automática sai como hoje (sem lote −3, RN-196.13) → **excluir a requisição** → o estorno
    devolve 3 a XB-01/L1 e 3 de onde o automático tirou (por movimento: `movimento_estorno_id` gravado nas duas saídas) → nenhum saldo
    diferente do de antes da 1ª entrada;
  - **rota:** material sem lote, A 3 + B 3 escolhido de propósito → origem A, 3 → entrega parcial 2 (sai de A, parte 1) → devolução de
    saída de 1 citando a saída de A volta a A → separar mais 1 de A (RN-196.02, parte 2) → entrega do resto;
  - **rota:** separação parcial que fica pendente: requisição de 10, A 3 + automático 2, item continua `EM_SEPARACAO` com 5 a separar → 3ª
    rodada de A (cabe pela parte) → a fila sugere A para o resto com o comprometido 3+…;
  - **serviço:** `requisitionService.separarRequisicao` + `entregarRequisicao` direto (sem rota) no caso real — a mesma conta;
  - a reprodução da 189 (`preSelecaoColetaIntegracao.api.test.js:221`) é **reescrita** para o novo número (0 trocas, −3) — e o título diz
    que o −3 é o item 5.
  *Controle:* T1 sabotado (mista → nula) → os cenários de rota e serviço caem juntos.

Ordem: T0 → T1 → T2 → T3 → T5; T4 em paralelo a T2/T3 (só tela, contra o contrato). Sem teste de corrida novo: nenhuma porta nova lê o
saldo para reservar; os três escritores da parte já rodam sob `serializarNaRequisicao` → `comTravaDaRequisicao` (ordem requisição →
material), e a parte só muda dentro dessas seções.

## Letra B proposta (para `docs/almoxarifado-novidades-por-etapa.md`)

- **B1313** — Caminho (d): **um** par por item com a **quantidade** que saiu dele. **Descartado:** (a) dividir pela trilha das rodadas
  (precisa repassar rodadas, entregas e devoluções; frágil); (b) vários pares por item (todos os leitores, N pedaços estritos, série de um
  lote só; fica para "mais de uma origem por item", B1254); (c) o automático herdar a planejada (não resolve o caso real: a planejada não
  cobre o resto e a entrega recusaria).
- **B1314** — A separação deixa de gravar troca: separar não move estoque, então a parte já separada não muda de lugar; a troca da Etapa 65
  era efeito de o item só guardar um par sem quantidade. **Revoga a regra da Etapa 65 na separação** (a da entrega fica). **Descartado:**
  gravar uma "troca de 0" para manter o histórico (registro sem fato).
- **B1315** — A entrega consome primeiro a parte da origem; a devolução à prateleira tira primeiro a parte sem origem. **Descartado:** a
  ordem inversa (perderia a origem conhecida antes da desconhecida).
- **B1316** — 2ª rodada com **outro endereço escolhido de propósito**: a parte dela sai no automático, não do endereço escolhido (a janela
  avisa). **Descartado:** trocar a origem guardada pela nova (perde a primeira, que é o caso medido); recusar a rodada (bloqueia gesto
  legítimo); guardar as duas (é o (b)).
- **B1317** — Origem antiga sem quantidade vale a caixa inteira; sem migração de dados. **Descartado:** preencher a coluna no boot (a
  conta já é a da leitura).
- **B1318** — `motivo_substituicao` na separação passa a ser ignorado sem 400 (telas antigas abertas continuam mandando). **Descartado:**
  recusar (quebraria a janela aberta durante a atualização).

## Letra C proposta

- **C461** — Separar a 2ª vez de outro endereço **escolhido** faz essa parte sair no automático na entrega (B1316). O que fazer: escolher o
  endereço no **Sai de** da entrega para essa parte, ou entregar a 1ª parte antes. Conserto: vários pares por item (caminho b).
- **C453** — fica **reduzido**: a 1ª parte não perde mais a origem; em material com lote a parte automática ainda sai da linha sem lote
  (item 5, C451/B204).

## O que não cobre

- O item 5: o pedaço automático em material com lote (linha *sem lote* negativa), as baixas antigas com essa linha.
- Mais de uma origem por item (C461).
- Material com série: sem mudança de regra (a série já exige um lote só por entrega).

## Cabe em 4h?

**Não.** A execução medida, com as reescritas obrigatórias de teste (12 do `trocaSeparacao`, a reprodução da 189, ~8 do
`RequisicoesTrocaSeparacao`), é **~3h** (T0 15 min, T1 45 min, T2 40 min, T3 15 min, T4 40 min, T5 30 min, reescritas dentro), contra ~1h da
estimativa. Nenhum corte coerente cabe em 1h: sem T3 a fila conta a caixa inteira no par e recusa a 3ª rodada legítima; sem T4 (`:679`) a
janela de entrega passa a recusar o que hoje entrega. **Proposta:** reestimar o item 4 para **6h** (análise 1h, execução 3h, teste 2h) pela
`estimativa-de-tarefas` antes do primeiro commit de código. **Corte que fica em 4h, se a empresa não aceitar:** a etapa inteira acima com o
teste do André reduzido a **um roteiro** (o caso real: separar 3 do sugerido, 3 no automático, entregar, conferir Substituições e o saldo de
XB-01) — 1h + 3h com o teste dentro da execução — e o cenário B1316 conferido só pela suíte.

## Fase 2 — correções do revisor fresco (2026-11-05) — **MANDAM sobre o texto acima onde divergem**

Revisor fresco sobre `4c602925`: nenhuma trava, 2 importantes, 3 menores, todos aceitos. Confirmado: os três únicos escritores da parte
(separação `requisitionService.js:1514`, entrega `:2105`/`finally :2137`, devolução `:2496`) já rodam com a trava por requisição por fora e
a por material por dentro (`:1281-1284`, `:1689-1691`, `:2435-2437`); migração no padrão (`schema.js:627` → `:2893`); exclusão, estorno e
devolução da saída não escrevem no item; cancelar/encerrar com caixa já são recusados (`routes/almoxarifado.js:4843-4845`, `:4990`).

1. **[IMPORTANTE] RN-196.07 contradizia a B1315 e gravava troca falsa.** Caixa 6, parte 3 (origem XB-01/L1); o almoxarife entrega 3 escolhendo
   XP-01/L2 → `:1839-1850` registrava substituição de 3 que não aconteceu (as 3 de L1 continuam na caixa) e a parte zerava. **RN-196.07 passa a
   ser:** entrega que sai da origem guardada (planejada aplicada pelo servidor, ou o mesmo par escolhido): `parte = max(0, parte − o que saiu
   dela)`. Entrega que sai de outro par ou do automático pedido consome **primeiro a parte sem origem**: a troca registrada é
   `max(0, min(qty, caixa) − (caixa − parte))`, e **não grava linha quando dá 0**. Depois, `parte = min(parte, caixa depois)`. Chegando a 0, ou
   com a caixa vazia, origem e quantidade zeram. *Cenário:* caixa 6, parte 3, entrega 3 de XP-01 → 0 trocas, parte 3. **T2:** em `:1849`,
   `quantidade: Math.max(0, Math.min(qty, pendenteSep) - (pendenteSep - parte))` e pular o `substituicoes.set` quando der 0. **Controle:** voltar
   para "consome primeiro a parte" → cai o cenário (com série e sem série).
2. **[IMPORTANTE] RN-196.10 sem materializar: dado antigo herdava a parte nova.** Item antigo com origem A, quantidade `NULL`, caixa 3; 2ª rodada
   de 3 no automático → `COALESCE(NULL, separado − entregue)` = 6 → a entrega de um clique pede 6 de A, que só tem 3 → 400 `não serve mais`
   (`:1794`). **RN-196.10 passa a ser:** toda rodada sobre item com origem guardada **grava** a quantidade: `parte = COALESCE(parte,
   pendenteAntes)`, mais `qty` se for o mesmo par (RN-196.02), ou igual se for outro par (RN-196.03). Ninguém deixa `NULL` com origem depois de
   uma rodada. **Controle no T1:** item antigo `NULL` + rodada automática → entrega de um clique 200, 3 de A e 3 no automático.
3. **[MENOR] Decremento no `finally` com falha no meio:** usar o que **foi baixado** com origem (soma dos `pedacos` com origem que geraram
   movimento), não `qtdComOrigem` — senão a parte cai mais do que saiu. Cenário no T2 com a passada 2 forçada a falhar.
4. **[MENOR] Cenário 2 do T5 inviável:** a devolução da saída não mexe em `quantidade_entregue`, então "separar mais 1 de A" toma `não é possível
   separar 1 un. Máximo: 0` (`:1388`). Usar requisição de **7** (ou 2ª rodada com 2). No cenário 1, "antes da 1ª entrada" → "antes da 1ª
   **entrega**".
5. **[MENOR] Contagens e spec:** `trocaSeparacao.api.test.js` afirma a troca da separação também em `:142`, `:170`, `:192`, `:210`, `:223`, `:242`
   (não só as quatro linhas do T1); o `:223` (falha do INSERT da troca) fica sem objeto — apagar com justificativa no commit e no plano; o T1
   diz "10 de 12". No fechamento, a spec 05 muda à vista na linha 68 (o "motivo (1) pago" da Etapa 65) e na 96: "revogado pela 196 (B1314)".
   RN-196.01 diz "**par com endereço**" (só lote não vira origem, `:1443`). O `separado_pendente` de `:1038` só serve ao teste `> 0`
   (`sugestaoDeColeta.js:192`): trocar pela parte é NO-OP, declarar. A RN-188.01a continua de propósito (sugerir B na 3ª rodada levaria ao
   C461). Na tela (T4), por defesa, `min(parte, pendenteSeparado)`.

## Execução

- [x] Plano — `4c602925`.
- [x] Fase 2 — revisor fresco: 0 trava, 2 importantes, 3 menores, no bloco "Fase 2 — correções" (que manda sobre o resto).
- [x] **T0** — `4cf2b6dd`. `safeAlter` da coluna (ao lado de `lote_separacao_id`), `parteDaOrigem`/`parteOrigemSql`/`PARTE_ORIGEM_SQL`.
  Testes [T0] 2/2. Controle: ALTER com nome sabotado → cai "[T0] banco novo". Primeiro boot em pasta vazia (`CRM_DATA_DIR`, `node index.js`)
  duas vezes: coluna `REAL` presente, 0 `no such table`/`no column named` (o 1º boot mostra 2 `duplicate column` de `materiais_escritorio`,
  resíduo antigo, fora desta etapa).
- [x] **T1** — `aecaadd3`. Regra nova no lugar do "mista → nula"; grava a parte; troca da separação removida; `motivo_substituicao` ignorado.
  `trocaSeparacao.api.test.js`: 10 de 12 reescritos, o `:223` (falha do INSERT da troca) **apagado** — sem INSERT, sem objeto; 11/11.
  Controles (todos caíram): mista → nula → RN-196.03/04/05/09/10 e o do serviço; somar com outro par → RN-196.03 (parte 6); `pedidoSeparacao`
  pela caixa → a 3ª rodada de A (400 "saldo em A (0)"); `outras` pela caixa → a régua (máximo 0, não divergente); NULL preservado → RN-196.10.
  *Divergência:* o teste da régua (`outras`) passava antes da T1 (a regra velha apagava a origem de R1); vale pelo controle. Entre T1 e T2,
  dois do `trocaSeparacao` e a reprodução da 189 ficaram vermelhos (dependiam da entrega pela parte) — dito no commit.
- [x] **T2** — `83abf7eb`. Entrega pela parte; decremento pelo **baixado** com origem (`baixadoComOrigem`); outro par consome primeiro a parte
  sem origem (troca `max(0, min(qty, caixa) − (caixa − parte))`, sem linha quando 0); devolução `MIN(parte, caixa)`; reprodução da 189
  (`preSelecaoColetaIntegracao`) reescrita aqui (0 trocas, XB-01/L1 0, sem lote −3 — o resto é o item 5), não na T5.
  Controles (todos caíram): entrega pelo pendente da caixa → RN-196.06/10 e o da falha no meio; sem decremento → RN-196.07 (3 em vez de 0/1);
  devolução sem MIN → RN-196.08; COALESCE tirado → RN-196.10 (e o [T0]); "consome primeiro a parte" → os três de outro par (com e sem série);
  decremento por `qtdComOrigem` → o da falha no meio (origem zerada com 1 dela na caixa).
- [x] **T3** — `425acd91`. `planejados` da fila por `PARTE_ORIGEM_SQL`; `separado_pendente` por `parteDaOrigem`. Controle: fila pela caixa → cai
  "Pegar em A com 2" (vai para C com 10). `separado_pendente` pela caixa → **nada cai**: NO-OP declarado no plano (só o `> 0`), confirmado.
  `lotService.js:466` intocado (NO-OP declarado).
- [x] **Vizinho fora do plano** — `f4ba735c`. `separacaoOrigemPorItem.api.test.js` RN-02 afirmava "planejada nula" (regra da 59) e a Fase 0 não o
  listou; reescrito (A fica com 3; entrega tira 3 de A, padrão 20 → 17). Vizinhos (separação, entrega, troca, devolução, fila, sugestão,
  exclusão, travas, gestos concorrentes): todos verdes. `test:api` **582/582**; `test:almoxarifado` **44/44**.
- Contrato: inalterado (`quantidade_origem_separacao` número ou `null`, via `ir.*`).
- [x] T4 — `e3f9b929`. Tela: `pendentePlanejado(item)` = `min(parte, separado − entregue)` (null = caixa) nos quatro pontos da RN-196.11; literais novas do aviso, `FRASE_PARCIAL` e "separado de … (q un)". RequisicoesOrigemEmDuasVezes 13 testes (10 vermelhos antes); `Requisicoes*` 18 / 339; tela 212 / 2905; build ok. Controles: `:679` pela caixa → cai "entrega com parte 3 e caixa 6 abre no automático"; aviso velho da 65 → caem 3 + 2; sem o `min` → cai "min(9, 6) = 6". Divergências: a separação parou de mandar `motivo_substituicao` (campo removido; 4 testes de motivo apagados com justificativa); a dica `entrega-dica-pendente` ficou com o texto antigo (Fase 5, K4).
- [x] T5 — `1eca71f1`. origemSeparacaoEmDuasVezesIntegracao 9/9; test:api 583/583. Cenários: caso real da 189 pela rota até a exclusão (saldos voltam); pedido de 7 com entrega parcial, devolução da saída e exclusão; pedido de 10 com a 3ª rodada de A pela fila; dado antigo NULL; pelo serviço; controles "sem a feature" com os números de antes. Sabotagens: "mista → nula" → caem 1–5; entrega pela caixa → 1–5; fila pela caixa → 3. Defeitos: nenhum. Divergências: arquivo próprio de integração; a exclusão lança ENTRADA por saída (não grava `movimento_estorno_id`); a ENTRADA do estorno do automático vai para o endereço padrão (D (51), já declarado) — por isso o automático tira da padrão nos cenários 2 e 4.
- [ ] Fase 5 · [ ] Fechamento.
