# Etapa 250 — a entrega diz quantas peças do lote estão presas (C514, B1440) e a sugestão da Fila lê a conta do lote preso (C517)

> Itens 16 e 17 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`; 16: 45 min,
> fatia de tela; 17: 45 min, fatia). Ponto de partida: a "Próxima tarefa detalhada" do plano da 249. **Estimativa não revisada:** a
> medição confirmou os dois itens no tamanho descrito (16 é só tela sobre campos que o servidor já manda; 17 é uma leitura a mais na fila).
> **Fatia visível:** a frase *"Peças presas que a entrega automática não leva: lote L1 — 1 bloqueada"* na janela de entrega, e o
> *"Pegar em"* da Fila de separação apontando um lote que cobre.

## Fase 0 — medido (código + execução, 19/11)

- **Item 16.** `GET /estoque/:id/saldos` (`server/routes/almoxarifado/extended.js:847`) já traz, por linha de lote com peça presa (retido +
  inspeção > folga, material com controle por lote e sem série), `lote_livre`, `lote_bloqueado`, `lote_inspecao` (Etapa 218). A tela usa os
  três **só no rótulo da opção** do *Sai de* (`RequisicoesList.js` `sufixoDoLote`): com *"Qualquer endereço (automático)"* (a opção vazia)
  nada diz que o lote L1 tem peça presa — a entrega sai do lote seguinte sem dizer por quê (C514). Desde a 249 o bloqueio avulso com lote
  também entra em `lote_bloqueado` (RN-249.06). **Sem campo novo de servidor.**
- **Item 17.** `sugestaoDeColeta.sugerirColeta` (`server/services/almoxarifado/sugestaoDeColeta.js`) calcula o livre do par como
  `quantidade da linha − planejado no par − sugerido aos irmãos`; só o material com série tem teto por lote (as séries EM_ESTOQUE).
  `requisitionService.lerDadosDaColeta` não lê `retidoDoLote`. **Reproduzido por teste** (T1, vermelho antes): L1 4 (validade antes) e L2 4,
  3 bloqueadas em L1 pelo Bloquear com lote → requisição de 2 → a Fila sugere *"Z250-01 — lote L1 · 2"*, e separar 2 de L1 é recusado
  (*"no lote L1 há 4 un, mas só 1 pode sair"*, RN-218.01).

## Regras de negócio

**Item 16 (C514):**

- **RN-250.01** Janela de entrega, item cujo material tem lote com peça presa (linha de `/saldos` com `lote_livre` numérico, lote não
  impedido): com o *Sai de* em *"Qualquer endereço (automático)"* (valor vazio, inclusive quando a janela abre assim) aparece, abaixo do
  campo, `Peças presas que a entrega automática não leva: lote L1 — 1 bloqueada; lote L9 — 1 bloqueada, 2 em inspeção.` Um lote em várias
  prateleiras aparece **uma** vez. Plural/singular como o rótulo da 218 (*bloqueada/bloqueadas*).
- **RN-250.02** Escolhido um endereço (ou *"Escolha de onde sai"*), a frase some (o rótulo da opção já diz o do lote).
- **RN-250.03** Lote impedido (bloqueado, reprovado ou vencido) não entra na frase — a opção dele já diz *"…: não sai"* (Etapa 226).
  Servidor sem os campos (ou todos `null`): nenhuma frase.
- **RN-250.04** A janela de **separação** não ganha a frase: o automático da separação não escolhe lote (a caixa fica sem lote) — o
  rótulo da 218 continua sendo a informação dela.

**Item 17 (C517):**

- **RN-250.10** Material com controle por lote e sem série, lote com peça presa (retido + inspeção > folga — o mesmo gatilho da separação,
  `memoLotesComPecaPresa`): o livre do par na sugestão fica limitado por `livre do lote (situacaoDosLotes) − planejado no lote (todas as
  requisições, a parte da origem) − sugerido aos irmãos no lote`. Cenário: L1 4 (FEFO primeiro) com 3 bloqueadas nele, L2 4; requisição de
  2 → *Pegar em* L2. Separar 2 de L1 seria recusado.
- **RN-250.11** O lote preso que ainda cobre continua sugerido: requisição de 1 → L1 (o livre do lote é 1).
- **RN-250.12** Irmãos do mesmo material na mesma requisição dividem o teto do lote: dois itens de 1 → o primeiro L1, o segundo L2.
- **RN-250.13** A caixa de outra requisição guardada no lote sai do teto: outra requisição separou 1 de (Z250-01, L1) → o livre do lote é 0 →
  requisição de 1 → L2.
- **RN-250.14** Nada muda sem peça presa (lote sem retido e sem inspeção), em material sem controle por lote ou com série; o alerta
  `RETENCAO_NO_MATERIAL` continua como está (é do material).
- **RN-250.15** A rota por requisição (`GET /requisicoes/:id/sugestao-coleta`) devolve o mesmo (mesmo código, Etapa 189).

## Contratos

- `GET /api/almoxarifado/estoque/:materialId/saldos` — **sem mudança** (consumido pela tela do item 16).
- `GET /api/almoxarifado/fila-separacao` e `GET /api/almoxarifado/requisicoes/:id/sugestao-coleta` — **mesmo formato**; muda só o valor
  de `pegar_em` (endereço/lote, `quantidade_no_endereco` = o livre já limitado pelo lote, `cobre`) e, com isso, `pegar_em_aviso`
  (`NENHUM_ENDERECO_COBRE` quando nenhum par cobre).
- Nenhuma recusa nova; nenhuma mensagem nova de servidor.

## Desenho

- Servidor: `lerDadosDaColeta` ganha `lotePreso: Map(chaveLote -> livre do lote)` só para material com controle por lote e sem série e
  lote com retido + inspeção > folga (`retidoDoLote.situacaoDosLotes`, a régua da entrega — **não** a do bloqueio, B1568: a sugestão prevê o
  que a separação/entrega aceita). `sugerirColeta` aplica o teto como faz com as séries (`planejadoPorLote`, `sugeridoPorLote`).
- Tela: função pura `fraseLotePresoNoAutomatico(rows)` em `RequisicoesList.js`, renderizada na janela de entrega quando o valor do *Sai
  de* é vazio. Sem fixture de servidor nova: `/saldos` não muda (a fixture da tela não existe para esta rota; os testes da 218 usam objetos
  literais com o formato do servidor).
- **Sem trava:** a fila só lê (RN-188.07, B1250); motor e travas não mudam.

## Fase 2 — pulada (motivo)

Leitura + tela: a etapa não muda motor, trava, gravação, recusa nem contrato de API (o item 17 só muda **qual** par a dica escolhe, no
mesmo formato; a separação continua decidindo sob a trava). Fluxo traçado aqui até o último gesto: Fila (*Pegar em*) → janela de separação
(pré-seleção da 189, que já não pré-seleciona lote que não cobre — B1449) → separar (recusa do lote da 218) → entrega (automático, B1439 /
*Sai de*). Nenhum gesto posterior recusa o que a dica nova sugere: ela fica **mais** conservadora que antes.

## Tasks

- [x] **T1 (tronco)** `69c3f581` — testes RN-250.10..15 em `server/tests/api/sugestaoColetaLotePreso.api.test.js` (6/8 vermelhos antes) +
  `lerDadosDaColeta.lotePreso` + `sugerirColeta.livreDe`. Controle positivo: 5 sabotagens (sem o teto, sem o planejado do lote, sem o
  sugerido aos irmãos, sem o gatilho, saldo no lugar do livre), cada uma derrubou o cenário que a guarda. **Divergência:** o plano previa que
  ligar o teto sem o gatilho "não derrubaria" — derrubava nada porque faltava o cenário; foi escrito o do legado sobrecomprometido sem peça
  presa (RN-218.11 c), e a sabotagem do gatilho passou a cair.
- [x] **T2 (galho)** `9c85f727` — tela: RN-250.01..04 em `RequisicoesEntregaLotePreso.test.js` (3/5 vermelhos antes; os 2 negativos com
  metade positiva) + `fraseLotePresoNoAutomatico`. Controle positivo: 5 sabotagens (sem deduplicar, com o lote impedido, com origem
  escolhida, sem a inspeção, sem o plural), cada uma caiu.
- [x] **T3** — Fase 5 (um revisor fresco, sonda executada, 6/6 cenários separando a quantidade sugerida pela porta real): servidor não
  refutado. 1 achado real na tela, corrigido com teste vermelho antes: **RN-250.05** (B1573) — com a origem da separação pendente e nada
  escolhido, a frase falava do automático e as peças saíam da origem da separação (`122d7e68`; sabotagem da condição do automático escolhido
  derruba). 3 asserções faltando: lote preso só por inspeção e item com planejada num lote que ficou preso — escritas (`6dfb6905`; gatilho
  só com o retido derruba o da inspeção; sem o teto derruba os dois); material com série — declarado (D (250) 3). 0 ruído.
- [x] **T4** — fechamento (fechar-etapa sem 7½ e 8).

## Pontos de atenção

- A sugestão usa a régua da **entrega** (`situacaoDosLotes`, com o corte da família B1436), não a do Bloquear (B1568) — de propósito: a
  dica tem de prever o que a separação aceita (`memoLotesComPecaPresa` usa a mesma).
- O teto do lote soma o planejado de **todos** os pares do lote (a mesma `planejadoPorLote` das séries) — igual à separação (B1444: outras
  requisições + esta requisição).

## Divergências do plano

- A RN-250.05 não estava no plano (achado da Fase 5, B1573): a frase olhava só "nada escolhido", e nada escolhido com a planejada pendente
  é a origem da separação, não o automático.
- O controle positivo do gatilho (T1) estava previsto como "invisível"; com o cenário do legado sobrecomprometido ele cai.
- Nenhuma linha do `CLAUDE.md` ficou desatualizada (nenhuma trava nem porta de saldo mudou; a fila só lê).

## Verificação (medida, sobre o código final)

- `npm run test:api` sobre o código final (`6dfb6905`): **643/643 arquivos**, rodado sozinho (sem Jest nem build em paralelo), terminou sem morrer.
- `test:almoxarifado` 44/0; `test:validation` 4/0; `test:safealter` 3/0; `test:sqlite` 16/0.
- Jest da tela: **237 suítes, 3207 testes**; `CI=true react-scripts build`: *Compiled successfully*.
- Nenhum clique no navegador (F (250)).

## Retro (4 números)

- Rodadas de correção até verde: 1 (Fase 5: a frase com a planejada).
- Achados: Fase 2 pulada (leitura + tela, motivo acima); Fase 5 — 1 real corrigido com teste vermelho antes + 3 asserções faltando (2
  escritas, 1 declarada), 0 ruído.
- Paralelismo: nenhum galho em paralelo; a Fase 5 rodou enquanto o manual era escrito (sem edição de código).
- Defeito que escapou: (preencher na etapa seguinte). Da 249: nenhum conhecido.

## Próxima tarefa detalhada

Itens 20 e 21 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`; 20: 1h, 21: 1h15,
fatias de tela + leitura). Módulo Almoxarifado, feature 05.

- **Item 20 — quanto cada item pode entregar quando dividem o mesmo lote (C489, B1395).** Com lote impedido, o "entregável" do detalhe e da
  Fila é o de cada item **sozinho** (`requisitionService.tetoDaEntregaPeloLote` → `cabeDoAutomaticoPeloLote`, anotado pela rota do detalhe e
  lido pela Fila, `requisitionService.js` ~1147 e ~2274): dois itens do mesmo material que disputam o mesmo lote bom mostram, cada um, o
  máximo; entregando os dois juntos pelo máximo a conferência recusa sem baixar (*"faltam N un … ou entregue N un a menos"*). Conserto previsto
  (B1395 descartou na época): dividir o teto entre os irmãos **na tela**, na ordem do pedido, como a separação já faz (Etapa 127,
  `maxSeparavelNaTela`/`itensDaReq` em `RequisicoesList.js`). **Medir antes:** sonda com dois itens do mesmo material, L1 impedido e L2 3 —
  o que o detalhe e a janela de entrega mostram e o que a entrega dos dois juntos responde.
- **Item 21 — quanto pode ser entregue quando o lote da separação ficou bloqueado (C491 + C518).** O teto da B1395 soma a **parte guardada**
  do item sem olhar o lote dela: item separado de (A, L1) e depois L1 bloqueado/vencido (C491) ou com peça presa que o lote não cobre (C518) —
  o detalhe e a Fila ainda oferecem a parte, e a entrega de um clique recusa com *"… a origem da separação (A) não serve mais (…) — entregue
  escolhendo de onde sai"*. Conserto previsto: `tetoDaEntregaPeloLote` não contar a parte cujo lote está impedido, nem o que o lote com peça
  presa não deixa sair (`memoLotesComPecaPresa`/`situacaoDosLotes` + `guardadoNoLoteDeOutras`, a régua desta etapa e da 218). **Medir:**
  sonda com a separação de (A, L1) e depois o Bloquear com lote em L1 (Etapa 249) — o entregável do detalhe antes e depois.
- **Pontos de atenção:** o teto é leitura (sem trava) — a conferência da entrega continua decidindo; a Fila lê a anotação do detalhe; fixture
  da tela regravada se o formato do detalhe mudar; a régua da entrega e a do bloqueio diferem de propósito (B1568, B1574).
- **O que já está pronto e não reabre:** a frase das peças presas na entrega e a sugestão da Fila (esta etapa); o *Sai de* com lote (218); o
  bloqueio com lote (249).
