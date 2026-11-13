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

- [x] **T1 (tronco)** — `868887e1` — `utils/situacaoDoLote.js` (extraído, re-export no extrato) + teste `RequisicoesSaiDeLoteImpedido.test.js`
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

## Tasks feitas

- [x] Estimativa `d96da251` · plano e Fase 2 `f9b92d34` · T1 `868887e1` · Fase 5 `aba3f081` e `04308f3f` · fechamento (este e o seguinte).

## Divergências do plano

- A RN-226.10 dizia `PUT …/separar`; a rodada é `PUT /requisicoes/:id/separacao` (Fase 2 M1) — corrigida antes do teste.
- A B1493 do plano isentava a planejada nas duas janelas; ficou só na entrega (Fase 2 I1). A B1497 e a RN-226.12 nasceram na Fase 2; a
  RN-226.13 na Fase 5.

## Próxima tarefa detalhada

*(Escolhida pela ordem do CLAUDE.md: a 226 fecha o D (224); o vizinho aberto de maior valor visível é o **D (225)** — o *Saldo por lote*
mostra o status do lote mas não diz que um lote *Ativo* está vencido. A spec 21 e a 10 continuam 🟢. **Sem estimativa** — começa pela Fase
0.5.)*

**O *Saldo por lote* diz que o lote ativo está vencido (D (225)).**

- **Onde:** `reportService.relatorioSaldoPorLote` (`server/services/almoxarifado/reportService.js:44`) — `SELECT … l.data_validade as
  validade, l.status as status_lote … GROUP BY s.material_id, l.id`, e a linha "Sem lote atribuído" montada em JS depois; o registro
  `'saldo-por-lote'` (`reportRegistry.js:659`, colunas estáticas, nota que já cita "vencidos sem liberação"); a tela e o xlsx seguem o
  registro (genéricos, como na 225).
- **O que fazer:** uma coluna *Situação* (ou trocar o *Status do lote* pela situação) com as palavras do extrato — calculada no servidor com
  a régua (`predicadoLoteImpedidoSql('l')`, `predicadoLoteVencidoSql('l')` de `loteImpedido.js:45-53`, o "hoje" de Brasília), como os
  booleanos da 224 (`stockService.js:4037-4053`). O texto pode ser montado em JS no servidor com a mesma regra de `client/src/utils/
  situacaoDoLote.js` (que é do cliente; o xlsx não roda o cliente) — decidir (B) entre duplicar a função no servidor ou devolver os
  booleanos e deixar a palavra só na tela (a planilha ficaria sem ela).
- **Pontos de atenção:** a linha "Sem lote atribuído" não tem lote (situação vazia); paridade do cabeçalho do xlsx com o registro
  (`relatoriosRegistro [5]`, `relatoriosJornada [3]`); a validade gravada como texto (`31/03/2027`) é "Validade a corrigir" (B1486, Fase 2 M2
  da 224); vencido liberado e que vence hoje → não vencido. Pronto e que não reabre: a régua, os campos da 224, as colunas da 225.
- Outros abertos: a coluna *disponível* da Fila de separação (**D (223)**), C519, C521, C524–C527, C529–C532, C514–C518, C486, C491, C495,
  C497, C498.

## Fase 5 — revisão adversarial (2 revisores frescos em paralelo, junto com o `test:api`)

- **Regras e gestos:** **3 achados reproduzidos** (Jest temporário, apagado), todos de texto — nada mudava o que vai ao servidor: (R1) na
  separação com a origem num lote impedido, a frase nova (*"Essa parte não sai"*) aparecia **junto** do aviso da 196 (*"…que continuam saindo
  de lá"*); (R2) na entrega acima da parte, junto da dica da 63 (*"1 PC sai de Z-02 — lote L2 …"*); (R3) a frase *"Sugestão da fila … não veio
  escolhida; confira o saldo no 'Sai de' antes de escolher"* convidava a escolher a opção desabilitada (só com dado inconsistente: o servidor
  da sugestão já pula lote impedido). Os três avisos calam quando contradiriam → **RN-226.13**, `aba3f081`, cada guarda derrubada pela sua
  sabotagem. **Resistiu:** irmão do mesmo material (a exceção é por item); linhas sem lote impedido idênticas a antes (`disabled={false}` não
  vira atributo); lote sem código (impossível: `lote_esta_impedido` exige o lote); a opção sem saldos; o vencido (o servidor decide);
  detalhe relido (os saldos só voltam com a chave; a escolha velha desabilitada mostra a frase da B1495).
- **Força dos testes:** 10 mutações novas (numa cópia do `client/` fora da worktree — dentro de `.claude/worktrees` o Jest ignora pastas com
  ponto e acharia **zero** testes; o revisor percebeu). 4 mortas; **3 sobreviviam com comportamento errado de verdade** — (A) a exceção da
  planejada comparando só o endereço; (C) a frase da planejada sem `temPlanejada` (frase falsa com a origem toda entregue); (K) a guarda da
  pré-seleção só para `BLOQUEADO` (reprovado/vencido pré-selecionados e a rodada recusada). O código já estava certo; faltava a asserção →
  três cenários, `04308f3f`, as quatro mutações (A, C, K na planejada, K na sugestão) caem. **Lacuna aceita:** a guarda que tira o
  *"Sugerido pela fila"* quando a sugerida volta impedida num detalhe relido (Fase 2 M2) não tem teste (montagem cara: os saldos só são
  buscados de novo quando a chave muda). **Ruído:** (B) tirar `temPlanejada` da exceção — com algo a entregar há sempre separado > entregue;
  (H) `lote_vencido_sem_liberacao` por verdade — o servidor já converte para booleano (224).

## Verificação (medida, serial)

Servidor sem mudança nesta etapa (o `test:api` rodou com `868887e1` e terminou depois de `04308f3f`; os commits da Fase 5 só tocam o
cliente). Cliente sobre `04308f3f` (código final):

- `npm run test:api` — **620/620 arquivos OK**.
- `npm run test:almoxarifado` — **44 passou, 0 falhou**.
- `npm run test:validation` — **4/4**; `npm run test:safealter` — **3/3**; `npm run test:sqlite` — **16/16**.
- Cliente: `CI=true npx react-scripts test --watchAll=false --maxWorkers=2` — **225/225 suítes, 3059/3059 testes**
  (`RequisicoesSaiDeLoteImpedido` 21/21); `CI=true npx react-scripts build` — **Compiled successfully**.

## Retro (4 números)

- **Rodadas até verde:** 1 na T1; a Fase 2 mudou a regra antes do código (B1493, B1497) e a Fase 5 acrescentou guardas e cenários.
- **Achados reais:** Fase 2: 2 importantes + 4 menores (aceitos; 2 declarados fora). Fase 5: 3 de regra (texto contraditório, corrigidos),
  3 lacunas de teste (fechadas), 1 lacuna aceita, 2 ruídos.
- **Paralelismo:** sem galhos (um arquivo de tela); a Fase 2 rodou junto com a escrita do teste; os 2 revisores da Fase 5 junto com as
  suítes do servidor (o de testes numa worktree — onde o Jest acha zero testes, por causa do `.claude` no caminho; ele copiou o `client/`).
- **Defeito que escapou da 225:** nenhum achado.

## Fechamento

- [x] Fechamento (`fechar-etapa`, sem o Passo 7½ e o 8, por pedido do André) — novidades (B1492–B1497, C532, D (226), F (226), D (224)
  resolvida, seção, topo e "onde estamos"), spec 05 (topo e bloco 226), spec 10 (o "Fora" da 224), mapa (linhas 05 e 10 e última
  atualização), guia (seção e cabeçalho), manual (7.5 e 10.2) e a estimativa.
