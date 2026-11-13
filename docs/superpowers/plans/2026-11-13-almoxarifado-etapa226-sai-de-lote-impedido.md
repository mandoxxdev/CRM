# Etapa 226 — o "Sai de" da separação e da entrega diz qual lote está impedido (D (224))

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-13-almoxarifado-etapa225-relatorios-lote-impedido.md` (`:181-203`). Estimativa já commitada:
> `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-sai-de-lote-impedido.txt` (**2h30**, `d96da251`). Números de linha medidos
> sobre `af6fd736`. A Fase 0.0 (`controle-horas`) não rodou: o pedido desta etapa mandou executá-la inteira (e pular o Passo 7½ e o 8).

## Objetivo (em linguagem simples)

Desde a 224 o extrato diz qual lote está bloqueado, reprovado ou vencido. O "Sai de" da separação e da entrega não: oferece o lote impedido
como qualquer outro e a porta recusa ao confirmar. Depois desta etapa, a opção do lote impedido diz a situação (as mesmas palavras do
extrato), não pode ser escolhida (salvo a planejada do próprio item) e, se estiver escolhida, uma frase sob o "Sai de" diz que nada sai dela.

## Fase 0 — medido em 2026-11-13 (sobre `af6fd736`)

1. `RequisicoesList.js`: `rotuloOrigem(s, propriaNoPar)` (`:172`) monta o texto; `sufixoDoLote` (`:163`, 218) acrescenta "— do lote podem
   sair N (…)" quando `lote_livre` vem. A separação usa em `:2539`, a entrega em `:2683` (só esta tela tem "Sai de" — `grep`).
2. As linhas vêm de `GET /estoque/:materialId/saldos?requisicao_id=` (`:601`); desde a 224 (B1484) trazem `lote_status`, `lote_validade`,
   `lote_vencimento_liberado_em`, `lote_esta_impedido`, `lote_vencido_sem_liberacao`. **Sem servidor.**
3. As palavras: `situacaoDoLote` exportada de `ExtratoMaterialModal.js:62` (B1486), usada só ali (`:262`). Há um `DICA_LOTE_IMPEDIDO` com
   **outro** texto em `TabelaMateriais.js:35` (não é o mesmo; não mexer).
4. **As duas portas recusam o lote impedido escolhido** (`checarOrigemItem`, `requisitionService.js:1354`; separação `:1723`, entrega
   `:2454`): status ≠ ATIVO → `Lote X esta bloqueado e nao pode ser utilizado`; vencido sem liberação → `Lote X vencido em … nao pode sair
   para consumo. …`. Escolher a opção impedida é recusa certa.
5. **Pré-seleções que podem cair num lote impedido:**
   - separação, planejada pendente (`valorPlanejadaNaSeparacao`, `:260`, efeito `:620-633`): pré-seleciona a planejada → a rodada inteira é
     recusada se o lote ficou impedido depois de separar;
   - separação, sugestão da fila (`valorSugeridoNaSeparacao`, `:273`): o servidor da sugestão já pula lote impedido (205), mas a tela não
     confere;
   - entrega, planejada (`:753-776`): pré-seleciona a planejada (manda `localizacao_origem_id` + `lote_id`); a entrega de um clique (sem
     chave) também aplica a planejada no servidor → recusa igual.
6. Sufixo da 218 numa linha impedida: `lote_livre` vem de `situacaoDosLotes` (retido/inspeção), sem olhar o status do lote — num lote
   BLOQUEADO com uma peça em quarentena diria "do lote podem sair 3", falso (nada sai).
7. `<option>` não aceita estilo nem `title` confiáveis: só texto e `disabled`.

## Caminhos

- **(escolhido)** rótulo com a situação + `disabled` nas opções impedidas, menos a planejada do próprio item; a separação não pré-seleciona
  opção impedida; a entrega continua pré-selecionando a planejada impedida; uma frase sob o "Sai de" quando a escolhida está impedida.
- **(descartado)** só mostrar (deixar escolher): leva a uma recusa certa (Fase 0, item 4).
- **(descartado)** desabilitar todas, inclusive a planejada: a planejada impedida ficaria selecionada e, trocada por engano, não voltaria.
- **(descartado)** a entrega trocar a planejada impedida por automático sozinha: as peças da caixa saíram daquele lote; o automático daria
  baixa de outro lote — o livro diverge do físico. Quem decide é o almoxarife (liberar o lote ou escolher outro).

## Decisões (letra B — reversíveis; livres B1492 a B1496, C532, conferido por `grep` em `docs` e `specs`)

- **B1492 — a opção do lote impedido diz a situação.** Quando `lote_esta_impedido === true`, o rótulo é o de hoje sem o sufixo da 218,
  seguido de ` — <situacaoDoLote(s)>: não sai`. O sufixo da 218 sai dessa linha (nada sai de um lote impedido; "podem sair 3" seria falso).
  Sem o campo ou não `true`: o rótulo de hoje, letra por letra.
- **B1493 — a opção impedida é `disabled`; na entrega, menos a planejada do próprio item.** Separação: toda opção impedida `disabled`
  (Fase 2 I1: escolher de volta a planejada impedida faria a rodada inteira ser recusada). Entrega: `disabled` quando impedida e
  `valorOrigem(s) !== valorPlanejada(item)` (ou o item não tem planejada). Descartado: só mostrar; desabilitar a planejada também na entrega.
- **B1494 — pré-seleção.** Separação: `valorPlanejadaNaSeparacao` e `valorSugeridoNaSeparacao` devolvem `''` (automático) quando a opção é
  impedida (a rodada seria recusada; a parte já separada continua com a planejada, 196). Entrega: **continua** pré-selecionando a planejada
  impedida (a frase da B1495 aparece; a porta recusa com a mensagem de hoje). Descartado: a entrega trocar sozinha para automático.
- **B1495 — a frase sob o "Sai de".** Quando a opção selecionada está impedida: `Lote <lote>: <situação>. Nada sai dele até o lote ser
  liberado na tela Lotes e Séries — escolha outro endereço.` (ids `separacao-dica-lote-impedido-<item>` e `entrega-dica-lote-impedido-<item>`).
- **B1497 (Fase 2 I1/I2) — a frase da planejada impedida.** Quando a planejada do item está num lote impedido e o "Sai de" não a escolheu
  — separação em automático; entrega em `''` **sem** `automatico` (o servidor aplica a planejada, ex.: quantidade acima da parte) —, sob o
  "Sai de": `Já separado de <endereço> — lote <lote>: <situação>. Essa parte não sai até o lote ser liberado na tela Lotes e Séries — na
  entrega, escolha outro endereço.` (mesmo `id` da B1495; a frase da escolhida tem precedência). Sem ela, o aviso da 196 ("continuam
  saindo de lá") e a dica da 63 prometiam uma saída que a porta recusa. Na separação, a frase "Sugerido pela fila" some quando a sugerida
  voltou impedida (Fase 2 M2).
- **B1496 — as palavras moram num util.** `client/src/utils/situacaoDoLote.js` exporta `situacaoDoLote` e `DICA_LOTE_IMPEDIDO` (o do
  extrato); `ExtratoMaterialModal.js` importa e re-exporta (os testes da 224 seguem importando dele). Fora: servidor (nada muda), a Fila de
  separação, o `TabelaMateriais.js`, o *Saldo por lote* (D (225)). Sem banco, trava, rota ou perfil.
- **C532 (aviso) — a opção planejada impedida fica escolhível.** A entrega pré-seleciona a planejada mesmo impedida e a porta recusa; a
  frase da B1495 avisa antes. Se o lote for liberado, a entrega sai como planejada.

## Regras de negócio (RN-226.xx)

| RN | Enunciado | Cenário |
|---|---|---|
| RN-226.01 | Separação: o rótulo do lote impedido diz a situação | linhas A-01 sem lote 10; XB-01/L1 ATIVO 4; Z-02/L2 BLOQUEADO 6 → `['Qualquer endereço (automático)', 'A-01 (10)', 'XB-01 — lote L1 (4)', 'Z-02 — lote L2 (6) — Bloqueado: não sai']` |
| RN-226.02 | As palavras são as do extrato | REPROVADO → `— Reprovado: não sai`; ATIVO vencido `2026-11-10` → `— Vencido em 10/11/2026: não sai`; BLOQUEADO + vencido → `— Bloqueado · Vencido em 10/11/2026: não sai`; validade `31/03/2027` → `— Validade a corrigir: 31/03/2027: não sai`; status `X` → `— Impedido: não sai` |
| RN-226.03 | O sufixo da 218 sai da linha impedida; fica na boa; a sobra fica | Z-02/L2 BLOQUEADO com `lote_livre 3, lote_bloqueado 1` → `Z-02 — lote L2 (6) — Bloqueado: não sai`; XB-01/L1 ATIVO com `lote_livre 3, lote_bloqueado 1` → `… — do lote podem sair 3 (1 bloqueada)`; L2 com `separado_outras 1, sobra 5` → `Z-02 — lote L2 (sobra 5 de 6; 1 para outras) — Bloqueado: não sai` |
| RN-226.04 | Servidor sem os campos, ou `lote_esta_impedido` não `true`: o rótulo de hoje | as linhas sem os cinco campos → os rótulos de hoje e nenhuma opção `disabled`; `lote_esta_impedido: 'true'` ou `1` → rótulo de hoje |
| RN-226.05 | Opção impedida desabilitada; a boa não | separação e entrega: `Z-02:L2` `disabled`; `A-01`, `XB-01/L1` e "Qualquer endereço" não |
| RN-226.06 | Entrega: a planejada impedida do próprio item fica habilitada; separação: não | item com planejada Z-02/L2 (BLOQUEADO): na entrega a opção `Z-02 — lote L2 …` está habilitada, com o rótulo da situação, e Z-03/L3 (REPROVADO) desabilitada; na separação as duas desabilitadas |
| RN-226.07 | Separação não pré-seleciona a planejada impedida | `EM_SEPARACAO` com planejada Z-02/L2 BLOQUEADO e saldo cobrindo → o "Sai de" abre em `''`; a mesma com L2 ATIVO → abre em `Z-02:L2` (controle) |
| RN-226.08 | A sugestão da fila não pré-seleciona opção impedida | `valorSugeridoNaSeparacao(item, {pegar_em: {Z-02, L2, cobre: true}}, rows)` → `''`; com L2 ATIVO → `'<loc>:<lote>'` |
| RN-226.09 | Entrega pré-seleciona a planejada impedida e avisa | `PARCIAL` com planejada Z-02/L2 BLOQUEADO → o select abre em `Z-02:L2` e `#entrega-dica-lote-impedido-1` diz `Lote L2: Bloqueado. Nada sai dele até o lote ser liberado na tela Lotes e Séries — escolha outro endereço.`; escolhida A-01 → a frase some |
| RN-226.10 | Integração: a separação não manda o lote impedido | `EM_SEPARACAO` com planejada impedida, confirmar a rodada → o `PUT /requisicoes/55/separacao` vai **sem** `localizacao_origem_id`/`lote_id` para o item (automático); com L2 ATIVO → vai com `localizacao_origem_id 4, lote_id 12` (Fase 2 M1: a URL é `/separacao`, não `/separar`) |
| RN-226.11 | O util e o extrato são a mesma função | `situacaoDoLote` importada de `utils/situacaoDoLote` === a re-exportada por `ExtratoMaterialModal`; os testes da 224 seguem verdes |
| RN-226.12 | A frase da planejada impedida (B1497) | separação `EM_SEPARACAO` com planejada L2 BLOQUEADO: abre em `''` com `Já separado de Z-02 — lote L2: Bloqueado. Essa parte não sai até o lote ser liberado na tela Lotes e Séries — na entrega, escolha outro endereço.`; a opção L2 selecionada (escolha velha) → a frase da B1495; A-01 → volta a da planejada. Entrega com parte 1 e quantidade 3: abre em `''` sem automático → a frase da planejada; A-01 → some; "Qualquer endereço" escolhido (automático) → some. Sem lote impedido → nenhuma frase |

## Contratos congelados

Nenhum endpoint muda. A tela consome a linha de `GET /api/almoxarifado/estoque/:materialId/saldos?requisicao_id=` (contrato B1484 da 224):
`lote_status` (texto|null), `lote_validade` (texto|null), `lote_esta_impedido` (booleano), `lote_vencido_sem_liberacao` (booleano). Só
`=== true` conta.

Literais da tela:

- sufixo do rótulo: `` ` — ${situacaoDoLote(s)}: não sai` ``;
- frase: `` `Lote ${s.lote}: ${situacaoDoLote(s)}. Nada sai dele até o lote ser liberado na tela Lotes e Séries — escolha outro endereço.` ``
  em `<div id="separacao-dica-lote-impedido-<item.id>">` / `<div id="entrega-dica-lote-impedido-<item.id>">`.

As recusas das portas não mudam (Fase 0, item 4).

## Fase 2 — revisão do plano (1 revisor fresco)

Rodou junto com a escrita do teste. **Confirmado:** as duas portas recusam o lote impedido escolhido (`checarOrigemItem`,
`requisitionService.js:1372-1378`; a entrega de um clique aplica a planejada em `:2491-2495` e passa pela mesma conferência); a separação com
`''` não manda origem; `rotuloOrigem` só tem os dois usos; nenhuma fixture existente traz `lote_esta_impedido`. **2 importantes, aceitos:**
(I1) na separação a planejada impedida ficava escolhível e o aviso da 196 ("continuam saindo de lá") prometia uma saída recusada → a
separação desabilita **todas** as impedidas (B1493) e ganha a frase da planejada (B1497, RN-226.12); (I2) na entrega com quantidade acima
da parte, a tela abre em `''` sem automático e o servidor aplica a planejada impedida → a mesma frase (B1497). **4 menores:** (M1) a URL da
rodada é `/separacao` → RN-226.10 corrigida; (M2) a sugerida que voltou impedida num detalhe relido seguia com "Sugerido pela fila" → some
(B1497); o máximo separável da tela com a opção impedida **não** muda (a porta recusa antes; registrado); (M3) a frase "Sugestão da fila … não
veio escolhida" pode apontar para uma opção desabilitada — inalcançável hoje (o servidor da sugestão pula lote impedido, 205), fica; (M4) a
opção "Planejada da separação" (busca de saldos falhou) não tem linha: nem rótulo nem frase — fora do alcance (sem dado); a entrega de um
clique não abre janela, logo nada a mostrar; o texto `Validade a corrigir: 31/03/2027: não sai` tem dois-pontos duplos — fixado no teste
(RN-226.02) e aceito (é a palavra do extrato + o sufixo).

## Tasks (sort topológico)

- [x] **T1 (tronco)** — `utils/situacaoDoLote.js` (extraído, re-export no extrato) + teste `RequisicoesSaiDeLoteImpedido.test.js`
  (RN-226.01 a .11) vermelho → `rotuloOrigem`, `disabled`, as duas pré-seleções da separação, a frase → verde. Sem galho (um arquivo de tela).
- A RN-226.10 é a integração (pré-seleção → payload da rodada, mock só na fronteira HTTP).

## Sabotagens previstas (controle positivo)

1. tirar o sufixo da situação → .01, .02, .03, .06 caem;
2. manter o sufixo da 218 na linha impedida → .03 cai;
3. `disabled` sempre `false` → .05 cai; `disabled` também na planejada → .06 cai;
4. tirar a guarda da pré-seleção da separação → .07 e .10 caem; da sugestão → .08 cai;
5. `lote_esta_impedido` por verdade (`!!`) em vez de `=== true` → .04 cai;
6. tirar a frase → .09 cai.
7. tirar a frase da planejada → .12 cai; a entrega ignorar o `automatico` na frase → .12 cai.

## Execução e controles (medidos)

- **Vermelho antes do código:** 10/12 caíram (a .04 é de não regressão e passava antes — sua sabotagem é a 5; a .11 passou porque o util
  foi extraído antes de rodar).
- **Verde:** 15/15 (12 + os três cenários da Fase 2).
- **Sabotagens** (script `e226-sabotagem.js` no scratchpad, troca por `split/join` com âncora contada = 1, roda o Jest do arquivo novo e
  restaura; `md5sum` igual antes e depois): (1) sem o sufixo da situação → 5 caem (.01, .02, .03, .05, .06 entrega); (2) sufixo da 218 na
  impedida → .03; (3a) `disabled={false}` na separação → .05 e .06 separação; (3b) planejada desabilitada também na entrega → .06 entrega;
  (4a) sem a guarda da pré-seleção da planejada → .07, .10 e .12 separação; (4b) sem a guarda da sugestão → .08; (5) verdade em vez de
  `=== true` → .04; (6) sem a frase da escolhida → .09 e .12 separação; (7) sem a frase da planejada → as duas .12; (8) a entrega ignorar o
  `automatico` → .12 entrega. **10/10 sabotagens derrubadas.**
- **Vizinhos:** `RequisicoesList*`, `Requisicoes*` e `Extrato*` — 23 suítes, 396 testes, verdes.
