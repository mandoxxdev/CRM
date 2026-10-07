# Etapa 56 — etiqueta de localização e confirmação do endereço por leitura

> Status: **FECHADA (2026-09-30)** — T1 `75cbea1`, T2 `298ffd9`, fix-round da Fase 5 22e00aa.
> Feature 02, item "Confirmação de localização por leitura" — entregue, **opcional** (B223). A 02 continua 🟡 (falta
> áreas especiais com semântica). Próxima: **Etapa 57** (ver o fim deste plano).

## Fase 0 — medido (2026-09-30)

- **Não existe etiqueta de localização.** `utils/etiquetasPdf.js` tem descritores para material, lote,
  série e sobra (e o recebimento); `EtiquetasPdfModal` é a moeda comum (`{ codigo, nome, linhaControle, qrUrl }`).
- O scanner (Etapa 15, `ScannerAlmoxarifado.js`) é 100% cliente: lê QR = navega, via
  `parseQrDestino`, que só aceita URL http(s) com path `/almoxarifado/...`.
- O Mapa (`/almoxarifado/mapa`) já seleciona uma localização por `?loc=<id>`.
- `codigo_lido` não existe em lugar nenhum (servidor ou tela). O schema da v2 é `z.object` — chave
  não declarada é **descartada em silêncio** (lição da Etapa 4 com `reserva_id`).

## Regras de negócio

- **RN-01 (etiqueta)** — Configurações → Localizações ganha "Etiquetas" (por linha e para as
  selecionadas/filtradas): descritor `{ codigo, nome: endereço completo, linhaControle: tipo/setor, qrUrl: <origin>/almoxarifado/mapa?loc=<id>&codigo=<codigo> }`.
  Ler a etiqueta pelo scanner abre a localização no Mapa (sem mudança no scanner).
- **RN-02 (motor)** — `registrarMovimentacao` aceita `codigo_lido_origem` e `codigo_lido_destino`
  (opcionais, texto). Quando informado, compara (sem espaços nas pontas, sem diferenciar
  maiúsculas) com o código da localização **efetiva** daquele papel — a informada, ou a padrão na
  entrada/saída sem endereço — ANTES de qualquer efeito:
  - não confere → 400 `Endereço lido ({lido}) não confere com a localização de {papel} ({codigo})`;
  - o movimento não tem localização naquele papel → 400 `Endereço lido ({lido}), mas o movimento não tem localização de {papel}`.
  Ausente → nada muda (a confirmação é opcional; tornar obrigatória é decisão do P.O., letra B).
- **RN-03 (leitura de URL)** — a tela aceita no campo de confirmação tanto o código puro (leitor
  de código de barras que "digita") quanto a URL da etiqueta (extrai `codigo` da query); o servidor
  recebe sempre o código.
- **RN-04 (tela de Movimentações)** — campo opcional "Confirmar endereço lido" para o destino
  (entradas, transferência) e a origem (saídas, transferência), mandando `codigo_lido_*`.

## Tasks

- [x] **T1 (tronco)** — `75cbea1` — schema + motor (RN-02). Testes `server/tests/api/confirmacaoLeituraLocalizacao.api.test.js`:
  confere (201), não confere (400 literal e nada gravado), sem localização no papel, padrão efetiva
  na entrada sem destino, transferência com os dois, maiúsculas/espaços, ausente = comportamento de hoje.
- [x] **T2 (galho, front)** — `298ffd9` — etiqueta de localização (RN-01) + campo de confirmação (RN-03/04). Testes do componente.
- [x] **T3** — verificação, Fase 5, fechamento — fix-round 22e00aa.

## Fase 2 — revisão do plano: 2 críticos, 5 importantes, 3 menores → contrato congelado

- **CRÍTICO 1** — a saída sem lote (e a de lote) **drena vários endereços** (`claimSaldoSemLote` /
  `claimSaldoDoLote`): "confirmar a origem A" com A:10 e uma saída de 40 tirava 30 de B. →
  confirmar a origem **exige** `localizacao_origem_id` explícito e **saldo naquele endereço** (do lote,
  quando houver) que cubra a quantidade.
- **CRÍTICO 2** — o Mover renumera o código e mantém o id: etiqueta impressa fica velha. → a URL leva
  `loc` e `codigo`; o Mapa avisa "etiqueta desatualizada"; a recusa diz "reimprima a etiqueta".
- Importantes: AJUSTE (destino informado, sem padrão); TRANSFERÊNCIA (só o informado);
  `/transferencias` não passa pelo Zod → o motor valida o tipo; **rastro**: colunas
  `codigo_lido_origem`/`codigo_lido_destino` no livro; posição = dentro do bloco de validação de endereço,
  depois de `validarEnderecoExplicito`.
- Menores: `encodeURIComponent` no código da etiqueta (teste com `A&B#1+2`); leitor com layout de
  teclado errado estraga a URL → a tela cai no texto cru; `?loc` de localização inativa no Mapa → aviso.

### Contrato do motor (T1)
`codigo_lido_origem` / `codigo_lido_destino` (opcionais). Normalização: `String(x).trim()`; vazio =
ausente; não-string ou > 100 caracteres → 400 `Endereço lido inválido`. Comparação sem diferenciar
maiúsculas. Localização efetiva do papel:
- destino: ENTRADA (família) = informada ou padrão; TRANSFERÊNCIA e AJUSTE com endereço = só a informada;
- origem: só a **informada** (SAIDA família e TRANSFERÊNCIA) — sem ela: 400 `Para confirmar a origem pela leitura, informe a localização de origem`;
- tipo/papel sem localização → 400 `Endereço lido ({lido}), mas o movimento não tem localização de {papel}`.
Recusas (400, antes de qualquer efeito):
- `Endereço lido ({lido}) não confere com a localização de {papel} ({codigo}) — se a etiqueta é antiga, reimprima`;
- origem confirmada sem saldo que cubra: `O saldo em {codigo} ({saldo}) não cobre a quantidade ({q}) — a saída tiraria de outros endereços`.
Gravado no livro: `codigo_lido_origem`/`codigo_lido_destino` com o código **da localização** (não o texto lido).
Chamadores internos (recebimento, requisição, devolução…) montam params explícitos e ignoram o campo.

### Contrato da tela (T2)
- Etiqueta: `qrUrl = <origin>/almoxarifado/mapa?loc=<id>&codigo=<encodeURIComponent(codigo)>`, `codigo`, `nome` = endereço completo.
- Mapa: com `?loc` e `?codigo` e o código atual diferente → aviso `Etiqueta desatualizada: {codigo da etiqueta} → {codigo atual}. Reimprima.`; `?loc` que não está no mapa → aviso `Localização não encontrada ou inativa`.
- Movimentações: campo "Confirmar endereço lido" (origem e/ou destino conforme o tipo); aceita código puro ou URL da etiqueta (extrai `codigo`); URL estragada → manda o texto cru.

## Execução — o que foi feito, e onde divergiu do plano

- [x] **T1 (tronco)** — `75cbea1`: `normalizarCodigoLido` + `conferirLeitura` e o bloco da RN-02 dentro do bloco de
  validação de endereço do motor (depois de `validarEnderecoExplicito`, antes de qualquer efeito); colunas
  `codigo_lido_origem`/`codigo_lido_destino` no livro (`schema.js`, `safeAlter`); o schema da v2 declara os dois
  campos como `z.unknown()` — **sem tipo no Zod de propósito**: quem valida é o motor, que também recebe o body cru
  de `/transferencias`, e assim as duas rotas dão a mesma literal. `confirmacaoLeituraLocalizacao.api.test.js` 8/8,
  10 sabotagens vermelhas (passou de primeira — controle positivo feito para cada regra).
- [x] **T2 (galho, front)** — `298ffd9`, em paralelo com o T1 contra o contrato congelado, sem retrabalho.
  Divergências do plano, todas registradas:
  - **AJUSTE não ganhou campo** na tela: o modal não mostra select de localização nesse tipo (o motor aceita) — D (56);
  - **"Etiquetas (N)" imprime todas as listadas**: a aba não tem filtro, então "as filtradas" é a lista inteira;
  - o Mapa **não afirma "não encontrada"** se a própria carga do mapa falhou (o erro já vai no toast) — acréscimo;
  - o **Enter** que o leitor manda no fim da leitura é anulado no campo (senão enviava o formulário antes da
    conferência) — acréscimo;
  - `extrairCodigoLido` só trata como URL o que é **http/https** (`COR:01` passaria como URL válida) — acréscimo;
  - 17 sabotagens na tela, 16 vermelhas; a 17ª (o filtro por tipo na montagem do POST) é **inalcançável pela tela**
    (a troca de tipo já limpa o campo) — mantida como segunda barreira e declarada.
- [x] **T3** — Fase 5 e fix-round 22e00aa, verificação e fechamento.

## Fase 5 — revisão adversarial (um revisor, três lentes): 0 CRITICAL

| # | Achado | Classe | Destino |
|---|---|---|---|
| I-1 | **Corrida**: a checagem de saldo da origem conferida roda antes do claim, com vários `await` no meio. **Reproduzido por sonda**: A:10, B:50, duas saídas de 10 conferidas em A ao mesmo tempo → as duas 201, a segunda drenava B gravando `codigo_lido_origem = A` | Importante | **Corrigido**: confere **depois** do claim que todas as linhas debitadas são da origem; senão 400 *"O saldo em ⟨código⟩ mudou durante a saída e não cobre mais a quantidade — confira e tente de novo"*, e o catch amplo compensa. Teste concorrente (estável em 3 rodadas), sabotagem vermelha |
| I-2 | Saída **com lote** sem cenário: trocar `lote_id IS ?` por "qualquer lote" deixava a suíte verde | Importante (teste) | **Corrigido**: cenário lote L1 com 2 em A + 50 sem lote em A; sabotagem vermelha |
| M-1 | TRANSFERÊNCIA com origem lida e saldo curto recebia *"a saída tiraria de outros endereços"* — ela nunca drena outros endereços | Menor | **Corrigido**: a checagem não se aplica à transferência; fica *"Saldo insuficiente na localização de origem"*. Sabotagem vermelha |
| M-2 | O aviso do Mapa dependia só da URL: fechar a seleção (ou abrir outra) deixava *"Etiqueta desatualizada…"* ao lado de outra localização | Menor | **Corrigido**: o aviso é da localização **da etiqueta**. Teste fechando a seleção (clicar noutra célula não dá: o Mapa filtra pelo setor da etiqueta e a outra não é desenhada); sabotagem vermelha |
| M-3 | Série ignora a origem conferida (`claimSaidaSeries` não filtra endereço) | Menor | **Declarado** — pré-existente, **C76** |
| M-4 | A etiqueta confere pelo código, não pelo id: Mover + código reusado → etiqueta velha confirma outra | Menor | **Declarado** — **C77** (o Mapa pega pelo id) |
| M-5 | URL longa de outra etiqueta no campo → *"Endereço lido inválido"* em vez de *"não confere"* | Menor | **Declarado** — **D (56)** |
| — | XSS pelo código na URL do aviso | — | **Refutado** pelo revisor: texto escapado pelo JSX, código com `encodeURIComponent` |

Testes após o fix-round: `confirmacaoLeituraLocalizacao.api.test.js` **11/11** (10 + 3 sabotagens),
`MapaEtiquetaLocalizacao.test.js` **7/7** (+1 sabotagem).

## Retro — 4 números

1. **Rodadas de correção até verde:** 1 fix-round.
2. **Achados:** Fase 2 — 10 (2 CRITICAL, que mudaram o contrato: origem conferida exige origem + saldo; etiqueta leva
   `loc` e `codigo`). Fase 5 — 2 IMPORTANT + 2 MINOR corrigidos, 3 declarados, **0 ruído** (o XSS foi verificado e
   refutado pelo próprio revisor).
3. **Paralelismo:** 1 galho (tela) em paralelo com o tronco (motor), sem retrabalho.
4. **Defeito que escapou da Etapa 55:** nenhum conhecido. **Mas o fechamento da Etapa 54 quebrou a linha da feature 02
   no mapa** (`specs/modulo-almoxarifado/README.md`: `ee7723e` apagou o começo `| 02 | [Localizações e endereçamento]…`
   e a feature sumiu da tabela; o fechamento da 55 não percebeu) — **restaurada neste fechamento**, com nota visível.

## Próxima tarefa detalhada — Etapa 57: o destino do material no processamento do recebimento (feature 08)

**Por que esta.** A feature 02 ficou a **um** item de 🟢 (áreas especiais com semântica), e ele é o menos operacional.
A feature 08 (Recebimento, 🟡) tem dois itens abertos que tocam exatamente o que as Etapas 51–56 construíram:
*"Ao aprovar: definir localização (sugestão da feature 02) + gerar etiqueta"* e *"Definição de localização na entrada"*
(`specs/modulo-almoxarifado/08-recebimento/README.md`), e a **D (53)** diz que a tela de recebimento não tem campo de
endereço. Hoje a nota inteira entra no **padrão** de cada material, sem o usuário poder escolher — e desde a Etapa 54 o
padrão inativo de legado é aceito em silêncio nesse caminho (B218).

**O que já existe (medido no fechamento da 56 — não reabrir):**
- `POST /api/almoxarifado/recebimentos/:id/processar` (`routes/almoxarifado/extended.js:1226`,
  `requirePermission('receber_material')`) repassa `req.body` a `receiptService.processarNota(db, user, id, { localizacao_id })`
  (`receiptService.js:1430`) → `darEntradaEstoque` (`:1104`), que já valida o destino **informado** uma vez antes do laço
  (`validarEnderecoExplicito`, Etapa 54) e o de cada item (`validarLocalizacaoParaMovimento`), e credita com
  `localizacao_destino_id: localizacao_id` (`:1271`).
- **A tela manda `{}`**: `RecebimentosAlmoxarifado.js:481` (`processarNota`). O `localizacao_id` é **um só para a nota
  inteira**.
- Dois outros caminhos chamam `processarNota`/`darEntradaEstoque`: o workflow (`receiptService.js:897`, **sem** opts) e
  o de aprovação (`:1485`, com opts).
- A sugestão por material existe: `GET /api/almoxarifado/materiais/:id/sugestao-localizacao` (Etapa 53).
- A etiqueta do recebimento existe (`montarEtiquetasDoRecebimento`, `utils/etiquetasPdf.js`).

**Fase 0 da 57 — medir antes de prometer:**
1. **Um destino por nota ou por item?** A spec fala em "definir localização" por material; o contrato de hoje é por
   nota. Medir quantos itens uma nota típica tem e se `recebimentos_material_itens_almoxarifado` tem coluna de destino
   (provavelmente não). Por item exige coluna (migration → tronco) e muda a pré-validação.
2. **Quem processa**: o perfil do faturamento tem `receber_material`? A tela da conferência (Etapa 36) é outro perfil —
   o destino deveria ser escolhido na **conferência física** (quem está no galpão) e só usado no processamento?
   Seguir o fluxo **conferir → fiscal → processar** até o último gesto (lição da Etapa 36).
3. **Item com inspeção** entra retido (`QUARENTENA`, Etapa 5): o destino vale para ele também, ou vai para a área de
   quarentena? Medir o que `darEntradaEstoque` faz hoje com o destino nesse caso.
4. **Workflow sem opts** (`:897`): continua caindo no padrão — decidir se a tela nova cobre os dois caminhos.

**Pontos de atenção.** Um destino **inativo** informado recusa a nota inteira (Etapa 54, literal *"Nao foi possivel dar
entrada no estoque: Localização X está inativa"*) — a tela tem de oferecer só ativos. A confirmação por leitura
(Etapa 56) pode entrar aqui depois; não é desta etapa.
