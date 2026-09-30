# Etapa 56 — etiqueta de localização e confirmação do endereço por leitura

> Status: **Fase 0-1** (design + plano). Feature 02, item "Confirmação de localização por leitura".

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

- **T1 (tronco)** — schema + motor (RN-02). Testes `server/tests/api/confirmacaoLeituraLocalizacao.api.test.js`:
  confere (201), não confere (400 literal e nada gravado), sem localização no papel, padrão efetiva
  na entrada sem destino, transferência com os dois, maiúsculas/espaços, ausente = comportamento de hoje.
- **T2 (galho, front)** — etiqueta de localização (RN-01) + campo de confirmação (RN-03/04). Testes do componente.
- **T3** — verificação, Fase 5, fechamento.

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
