# Etapa 235 — a devolução ao cliente de material com série confere e grava o lote das séries (D (233) 3, parte da devolução ao cliente)

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-13-almoxarifado-etapa234-saida-avulsa-lote-das-series.md` (`:176-197`). Estimativa já commitada:
> `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-devolucao-cliente-lote-das-series.txt` (**2h30**, `873c51d9`). Números de
> linha medidos sobre `c6e50dca`. Features: **13** (materiais de clientes) e **10** (lotes e séries).

## Objetivo (em linguagem simples)

Em **Materiais de Clientes → Devolver**, a janela pede só a quantidade e o documento. Material de cliente com número de série **não é
devolvível pela tela** (o servidor exige as séries e a janela não as oferece), e pela rota, com o lote em branco, a série de lote bloqueado
saía e a devolução gravava "sem lote" (o lote ficava com a peça que já saiu). Depois desta etapa a janela lista as séries em estoque para
marcar (as de lote impedido apagadas), diz de qual lote elas saem, e o servidor confere e grava o lote das séries — a mesma régua da saída
avulsa (233 e 234).

## Fase 0 — medido em 2026-11-13 (sobre `c6e50dca`)

1. **Sonda executada** (`createTestApp`, rota real, script `sonda235.js` no scratchpad). Material de cliente com série e **sem** controle de
   lote, A1 em L1, B1 em L2:

   | gesto | resposta | livro | linhas | `/lotes/resumo` |
   |---|---|---|---|---|
   | devolução `[B1]`, lote em branco | 201 | `lote_id` NULL | NULL **−1**, L1 1, L2 1 | `fisico 1, soma_lotes 2, sem_lote_atribuido −1` |
   | idem com o L2 **BLOQUEADO** | **201** (a série de lote bloqueado sai) | NULL | NULL −1 | igual |
   | `[A1, B1]` | 201 | NULL | NULL −2 | `sem_lote_atribuido −2` |
   | sem `serie_ids` (o que a tela manda hoje) | 400 *material com controle de serie: informe 1 serie(s) para 1 unidade(s) — recebidas 0* | — | — | — |
   | material **com** controle de lote, lote em branco | 400 *exige lote* | — | — | — |
2. **A rota** (`extended.js:956-989`) chama `registrarMovimentacao` com `{ exigeLote: true, exigeSerie: true }`, **sem** `lotePelasSeries`.
   O comentário dela (`:984-985`) diz *"a tela da Task 8 oferece seletor de lote e de serie"* — **está errado**: a janela
   (`MateriaisClienteAlmoxarifado.js:84-86`) manda só `material_id`, `quantidade`, `documento_devolucao`. A spec 13 não afirma o seletor
   (só "ganha lote, série…" do material, que é verdade no motor).
3. `DEVOLUCAO_CLIENTE` está em `TIPOS_SAIDA` (`movementTypes.js:69-71`) — a guarda da 233 e a derivação da 234 valem — e **não** em
   `tiposDescarte` (`stockService.js:1154`): lote vencido barra a devolução, igual hoje com o lote escolhido.
4. `GET /materiais-cliente/posicao` (`clienteEstoqueService.js:88-103`) não traz `controle_serie` nem `controle_lote` — a janela não sabe se
   pede série.
5. A lista de séries que a tela de Movimentações usa (`GET /materiais/:id/series?status=EM_ESTOQUE`) já traz `lote_id`, `lote_codigo`,
   `lote_status`, `lote_esta_impedido`, `lote_vencido_sem_liberacao` (`seriesService.js:44-53`). A frase do lote é `fraseDoLoteDasSeries`
   (`MovimentacoesAlmoxarifado.js:142-156`); a situação, `utils/situacaoDoLote.js`.
6. Trava: nenhuma porta nova — a rota já passa pelo motor (`registrarMovimentacao`, sob `naTravaDoMaterial`); a leitura da 233/234 roda
   dentro da seção. Celular: sem devolução ao cliente.

## Caminhos

- **(escolhido)** a rota declara `lotePelasSeries: true` (guarda + derivação com cobertura + recusa de lotes diferentes, tudo do motor); a
  posição ganha `controle_serie`/`controle_lote` (aditivo); a janela, para material com série, lista as séries e manda `serie_ids`.
- **(descartado)** seletor de lote na janela (material com controle de lote): sem ele, o material de cliente com controle de lote continua sem
  devolução pela tela (*exige lote*). Fora do teto; declarado (D (235) 1).
- **(descartado)** pôr `DEVOLUCAO_CLIENTE` em `tiposDescarte` (devolver ao dono o lote vencido): muda a regra de hoje do lote escolhido;
  declarado (B1537), reversível.

## Decisões (letra B — reversíveis; livres B1535 a B1538, C540, A118 — `grep -rl` em `docs` e `specs` = 0; controle `B1534` = 11 no doc de novidades)

- **B1535 — a devolução ao cliente declara `lotePelasSeries`.** A série de lote bloqueado, reprovado ou vencido não sai (mensagem da guarda de
  sempre); com o lote em branco e as séries de um lote só (que cobre a quantidade), grava o lote; lotes diferentes → a recusa da 234. Mensagem
  igual à da saída avulsa (*"faca uma saida para cada lote"*): o motor é um só; descartado parametrizar a palavra por tipo.
- **B1536 — a posição do cliente traz `controle_serie` e `controle_lote` de cada item** (aditivo, `0`/`1`). Descartado: a janela buscar o
  material à parte (mais uma chamada por clique).
- **B1537 — lote vencido continua barrando a devolução ao cliente** (como já barrava com o lote escolhido). Devolver o vencido ao dono pede
  liberar o vencimento na tela Lotes e Séries. Descartado nesta etapa: isentar como a devolução ao fornecedor (mudança de regra; o André
  arbitra).
- **B1538 — a janela de devolução lista as séries** (material com série): as séries `EM_ESTOQUE`, a de lote impedido apagada com a situação,
  o contador, a frase do lote e a parada antes de enviar (lotes diferentes, quantidade de séries diferente da quantidade). Material sem série:
  a janela e o corpo enviado ficam **idênticos** (sem a chave `serie_ids`).
- **C540 (aviso) — o comentário da rota afirmava um seletor que não existia** (`extended.js:984-985`, desde a Etapa 8): corrigido nesta etapa
  e dito aqui.

## Regras de negócio (RN-235.xx)

Cenário-base: material **de cliente**, com série, **sem** controle de lote; A1 em L1, B1/B2 em L2 (ATIVOS). Rota
`POST /api/almoxarifado/materiais-cliente/devolucoes` com `documento_devolucao`.

| RN | Enunciado | Cenário |
|---|---|---|
| RN-235.01 | A devolução com o lote em branco grava o lote das séries | `[B1]` → 201; livro `DEVOLUCAO_CLIENTE` com `lote_id` L2, `lote` `L2`; linha L2 = 1; nenhuma linha "sem lote" negativa; `/lotes/resumo` `sem_lote_atribuido` 0; B1 `ENTREGUE` |
| RN-235.02 | O estorno dela devolve ao lote | estorno da .01 → L2 = 2, ESTORNO com `lote_id` L2, B1 `EM_ESTOQUE` |
| RN-235.03 | Série de lote impedido não sai | L2 BLOQUEADO → 400 `Lote L2 esta bloqueado e nao pode ser utilizado`, nada sai; REPROVADO idem; vencido (sem liberação) → 400 da guarda de vencido (B1537) |
| RN-235.04 | Lotes diferentes: recusa | `[A1, B1]` → 400 `As series escolhidas sao de lotes diferentes (L1, L2): faca uma saida para cada lote`, nada sai; série sem lote + A1 → `(L1, sem lote)` |
| RN-235.05 | O que não muda | lote escolhido (`lote_id` L2) → igual; todas sem lote → 201 com `lote_id` NULL; material com controle de lote e lote em branco → *exige lote*; material sem série → como antes (`materialClienteDevolucao` verde) |
| RN-235.06 | A posição diz se o item pede série/lote | `GET /materiais-cliente/posicao` → cada item com `controle_serie` e `controle_lote` (0/1) |
| RN-235.07 | A janela lista e manda as séries | material com série: `GET /almoxarifado/materiais/:id/series?status=EM_ESTOQUE`; `#dev-series` com um checkbox por série (`data-serie-id`), ` · lote X`; marcar e confirmar → `POST` com `serie_ids`; material sem série → sem lista, corpo idêntico ao de antes |
| RN-235.08 | A janela apaga a série de lote impedido | `lote_esta_impedido === true` → checkbox `disabled`, ` · lote X — <situação>: não sai` (`data-serie-situacao`), e `#dev-series-impedidas` com a frase literal |
| RN-235.09 | A janela diz o lote e para antes de enviar | material sem controle de lote: B1 marcada → `#dev-series-lote-da-devolucao` `As séries marcadas saem do lote L2.`; A1 + B1 → `As séries marcadas são de lotes diferentes (L1, L2): faça uma devolução para cada lote.` e o confirmar para no `toast.error` com essa frase, sem `POST`; séries marcadas ≠ quantidade → `toast.error('Selecione exatamente a quantidade de séries informada')`, sem `POST` |

## Contratos congelados

- `POST /api/almoxarifado/materiais-cliente/devolucoes` — corpo igual (`serie_ids` e `lote_id` já existiam no `DevolucaoClienteSchema`).
  Novas recusas 400 (do motor, literais de sempre): `Lote <c> esta <status> e nao pode ser utilizado`; a do vencido; `As series escolhidas sao
  de lotes diferentes (<codigos em ordem>[, sem lote]): faca uma saida para cada lote`. Resposta 201 igual.
- `GET /api/almoxarifado/materiais-cliente/posicao` — cada item ganha `controle_serie` e `controle_lote` (inteiros 0/1). Nada sai.
- Tela (`MateriaisClienteAlmoxarifado.js`), só com `devTarget.controle_serie === 1`:
  - rótulo `Séries a devolver`, contêiner `#dev-series`, vazio `Nenhuma série disponível em estoque.`;
  - `#dev-series-impedidas`: `Séries de lote bloqueado, reprovado ou vencido vêm apagadas: só saem depois que o lote for liberado na tela Lotes e Séries.`;
  - `#dev-series-lote-da-devolucao` (só com `controle_lote !== 1`): `As séries marcadas saem do lote <L>.` /
    `As séries marcadas são de lotes diferentes (<L1>, <L2>[, sem lote]): faça uma devolução para cada lote.`;
  - `#dev-series-contador`: `<n>/<qtd> série(s) selecionada(s)`.
- `client/src/utils/loteDasSeries.js` — `fraseDoLoteDasSeries(series, ids, gesto = 'saída')` extraída de Movimentações (as literais da 234
  não mudam).

## Tasks (sort topológico)

- [ ] **T1 (tronco, servidor)** — `server/tests/api/devolucaoClienteLoteDasSeries.api.test.js` (RN-235.01 a .06) vermelho → rota declara
  `lotePelasSeries` + comentário corrigido; posição com as duas colunas → verde; `materialClienteDevolucao`, `materialClientePosicao`,
  `saidaAvulsaLoteDasSeries` continuam verdes.
- [ ] **T2 (galho, tela, contra o contrato acima)** — `client/src/components/almoxarifado/MateriaisClienteDevolucaoSeries.test.js` (RN-235.07
  a .09) vermelho → `utils/loteDasSeries.js` + `MateriaisClienteAlmoxarifado.js` → verde; `MovimentacoesSaidaLoteDasSeries` e
  `MateriaisClienteAlmoxarifado.test.js` verdes.
- Integração: .01/.02 entram pela rota real (devolução e `/cancelar`); a posição pela rota real.

## Sabotagens previstas (controle positivo)

1. servidor: sem `lotePelasSeries` na rota → .01, .03, .04 caem; sem as colunas na posição → .06 cai.
2. tela: sem a lista → .07 cai; sem `disabled` na impedida → .08 cai; sem a parada de lotes diferentes → .09 cai; sem a conferência da
   quantidade → .09 cai; mandar `serie_ids` para material sem série → .07 cai.

## Próxima tarefa detalhada

*(preencher no fechamento)*
