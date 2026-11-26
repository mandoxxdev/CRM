# Etapa 265 — Transferência de peça com número de série (C76) e Saída de peça com série sai da prateleira da série (C545)

> Itens **10** e **11** da estimativa da semana (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md` — 1h30 + 1h30; não
> refeita: a Fase 0 não mudou o tamanho em 1 h). A "próxima tarefa detalhada" do plano da 264.
> **Fatia visível:** em **Movimentações → Transferência**, material com número de série passa a mostrar a lista de séries (com a prateleira de
> cada uma) para marcar as que mudam de lugar.

## Fase 0 — medido (sonda `scratchpad/sonda265.js`, pela rota v2, sobre `51a5ecee`)

| # | Cenário (material com série, sem lote, padrão *PP* vazia) | Hoje | Certo |
|---|---|---|---|
| S1 | Entrada S1..S3 em *PA*; Transferência v2 de 1 de *PA* para *PB* com `serie_ids [S1]` | 201; linhas *PA* 2, *PB* 1; **as 3 séries continuam em *PA*** (`serie_ids` ignorado) | S1 passa a constar em *PB* |
| S2 | o mesmo pela `POST /transferencias`, **sem** série | 201 (nenhuma série pedida) | recusa: informe 1 série |
| S3 | Entrada S1, S2 em *PA*; S3 em *PB*; Saída v2 de S3 sem origem | 201; **baixa *PA*** (a maior): *PA* 1 com 2 séries, *PB* 1 com 0 séries | baixa *PB* |
| S4 | estorno da Saída de S3 | 200; *PA* volta a 2 (o registro da 257 devolve onde baixou) — a divergência continua | (com S3 certo) *PB* volta a 1 |

- **Causa C76:** o ramo `TRANSFERENCIA` de `registrarMovimentacao` move a linha de saldo e não lê `serie_ids`; `serieObrigatoria` só vale
  para entrada e saída; a `/transferencias` não declara `exigeSerie`; a tela não pede série (comentário em `MovimentacoesAlmoxarifado.js`
  ~85-92, decisão 9 da Etapa 7).
- **Causa C545:** a saída sem origem baixa por `claimSaldoSemLote` / `claimSaldoDoLote` (a padrão, depois a maior), sem olhar o endereço das
  séries escolhidas. O molde da entrega (`fatiasDaSerieSemLote`, Etapa 252) só vale na entrega com guarda (B1583).
- **Achado da medição (fora das causas, entra na etapa):** as `UPDATE`s da transferência rodam **antes** do `try` do livro — se o `INSERT`
  do livro falhar, o catch amplo não devolve as linhas (nenhum rastreador da transferência). Com as séries mudando junto, o desfazer tem de
  devolver as duas coisas.

## Decisões

- **B1624 (item 10, C76)** — a transferência de material com série (pela tela/v2 e pela `/transferencias`, as duas declaram `exigeSerie`)
  pede **uma série por unidade**; cada série tem de ser do material, **presente** (em estoque **ou bloqueada** — mover a peça bloqueada para a
  área de bloqueados é legítimo, a decisão 8 da Etapa 7 para o lote) e do **lote da transferência** (série sem lote só na transferência sem
  lote). **Endereço:** a série registrada na origem ou sem prateleira é aceita; registrada em **outra** prateleira, é recusada quando o
  registro de lá **bate** com o saldo (séries presentes do lote ali ≤ saldo da linha) e aceita quando não bate (o registro é velho — a régua
  da **B1584**). **Descartado:** (a) só séries registradas na origem — o registro velho (as transferências de antes desta etapa) prenderia a
  peça para sempre; (b) aceitar qualquer prateleira — a tela deixaria marcar a série que está em outra prateleira de verdade e o registro
  passaria a mentir dos dois lados; (c) só em estoque — a peça bloqueada não poderia ser levada para a quarentena. **Reversível.**
- **B1625 (item 10)** — cada série transferida fica registrada (tabela nova `transferencia_series_almoxarifado`: movimento, série, de onde,
  para onde), gravada depois do livro e **não-fatal** como os registros das 256/257; o **estorno** da transferência devolve cada série à
  prateleira de onde veio e é recusado se alguma série não está mais presente no destino. Transferência sem registro (antiga ou com o
  registro falhado): o estorno faz o de antes (só o saldo). **Descartado:** guardar a origem na própria série (uma coluna só não aguenta duas
  transferências seguidas). **Reversível.**
- **B1626 (item 11, C545)** — na Saída avulsa (só a porta v2, por opção do chamador `saidaPelaSerie`, nunca do corpo), material com série,
  **sem origem escolhida**, sem saldo negativo permitido: a baixa sai da prateleira de cada série (uma baixa por prateleira, na linha do
  lote da saída), quando **todas** as séries têm prateleira, a prateleira existe e não está bloqueada, a linha dela cobre as séries dali e o
  registro bate com o saldo (B1584, com as séries **presentes** — a bloqueada também ocupa a prateleira). Senão, **como hoje** (a padrão,
  depois a maior). **Descartado:** (a) valer para a entrega — a B1583 escolheu só com guarda; mudaria toda entrega de peça com série sem
  sonda; (b) recusar quando a prateleira da série não serve — a saída de hoje continua possível e a recusa travaria material legado; (c)
  descontar a separação de outra requisição na prateleira da série — a peça escolhida está ali de verdade; a guarda da caixa do **material**
  (Etapa 97) continua valendo. **Reversível:** a opção.

## Regras de negócio

- **RN-265.01 (C76)** Transferência (`POST /movimentacoes/v2` tipo `TRANSFERENCIA`, ou `POST /transferencias`) de material com controle
  de série: quantidade inteira e `serie_ids` com uma série por unidade, antes de qualquer efeito. Literais (as de sempre do motor):
  *"material com controle de serie exige quantidade inteira"*; *"material com controle de serie: informe 2 serie(s) para 2 unidade(s) —
  recebidas 1"*. Material sem série: nada muda (`serie_ids` ignorado, como hoje).
- **RN-265.02** Cada série, antes de qualquer efeito (dentro da trava do material, depois das validações de endereço e da leitura), na ordem
  da lista; a recusa é a da primeira série que falha:
  - repetida → *"serie_ids repetidos na lista informada"*; inexistente → *"serie id 99 nao existe"*; de outro material → *"serie X nao
    pertence a este material"* (as literais do claim da saída);
  - fora do estoque → *"A série X não está no estoque (situação ENTREGUE) — só a peça presente muda de prateleira"*;
  - lote: série do lote *L1* e transferência de outro lote ou sem lote → *"A série X é do lote L1 — escolha o lote L1 na transferência"*;
    série sem lote e transferência com lote → *"A série X não tem lote — deixe o lote em branco na transferência"*.
- **RN-265.03** Endereço da série (B1624): na origem ou sem prateleira → aceita; em outra prateleira *PB* cujo registro bate com o saldo →
  *"A série X está na prateleira PB, não na origem PA — marque as séries que estão em PA"*; em *PB* com mais séries presentes do lote do que
  saldo da linha → aceita.
- **RN-265.04** Efeito: o saldo muda de prateleira como hoje e cada série passa a constar no destino (`series_almoxarifado.localizacao_id`);
  o movimento guarda as séries (B1625). Falha depois do efeito (o livro) → linhas **e** séries voltam (o desfazer das linhas da transferência
  é novo). Série que mudou entre a leitura e a gravação → 409 *"A série X mudou durante a transferência — recarregue e tente de novo"* e
  tudo volta.
- **RN-265.05** Estorno da transferência com registro: a guarda de sempre primeiro (*"Não é possível estornar: o destino não tem mais o
  saldo transferido"*); depois, cada série tem de estar presente na prateleira de destino → senão 400 *"Não é possível estornar: a série X
  não está mais na prateleira PB (saiu ou mudou de lugar depois da transferência)"*; passou → o saldo volta e cada série volta à prateleira
  de onde veio. Falha depois → séries, linhas e o claim voltam. Sem registro → como antes.
- **RN-265.06** A tela (Movimentações → Nova Movimentação → Transferência, material com série): a lista **"Séries a transferir \*"**
  (`#mov-series-transferencia`) com as séries em estoque e bloqueadas, do lote escolhido (todas com o lote em branco), cada uma com a
  prateleira (*"· PA"*, *"· sem prateleira"*, a bloqueada com *"· bloqueada"*); as da origem escolhida primeiro; a frase
  *"Marque as séries que estão mudando de prateleira: cada uma passa a constar no destino."* (`#mov-series-transferencia-dica`); o contador
  *"1/2 série(s) selecionada(s)"* (`#mov-series-transferencia-contador`); o envio com contagem diferente para no toast *"Selecione
  exatamente a quantidade de séries informada"* (sem POST); o POST leva `serie_ids`; a recusa relê a lista.
- **RN-265.10 (C545)** Saída pela v2 (todo tipo de saída do formulário: Saída, Perda), material com série, **sem** `localizacao_origem_id`,
  sem saldo negativo permitido, séries informadas: cada série com prateleira; cada prateleira existe e não está bloqueada; a linha
  (prateleira, lote da saída) cobre as séries dali; séries **presentes** do lote ali ≤ saldo da linha → uma baixa por prateleira, cada uma na
  sua linha. O livro continua com a origem em branco (o registro das linhas da 257 diz de onde saiu — o histórico da 261 mostra).
- **RN-265.11** Qualquer condição da RN-265.10 falhando → como hoje (o claim de sempre). Com origem escolhida → como hoje (a C545 parte
  "conferir as séries na origem" fica — D).
- **RN-265.12** O estorno da Saída da RN-265.10 devolve a cada prateleira o que saiu dela (o registro da 257 — nada novo, provado).
- **RN-265.13 (integração, cruza os dois itens)** Entrada S1..S3 em *PA*; Transferência (v2) de S1 para *PB* → S1 em *PB*; Saída v2 de S1
  sem origem → baixa *PB*; *PA* fica 2 com S2, S3; estorno da Saída → *PB* 1 com S1; estorno da Transferência → S1 de volta em *PA*, *PA* 3.

## Contratos (congelados)

- `POST /api/almoxarifado/movimentacoes/v2` — corpo de sempre; `TRANSFERENCIA` lê `serie_ids` (material com série). Opções do chamador
  (4º argumento): + `saidaPelaSerie: true`. Respostas: 201 / 400 com as literais acima / 409 RN-265.04.
- `POST /api/almoxarifado/transferencias` — + `exigeSerie: true` (4º argumento). Mesmo contrato da transferência v2.
- `POST /api/almoxarifado/movimentacoes/:id/cancelar` — + a recusa da RN-265.05.
- `GET /api/almoxarifado/materiais/:id/series?status=` — **aditivo**: `localizacao_codigo` (o código da prateleira da série, null sem).
- Tabela `transferencia_series_almoxarifado (id, movimentacao_id, serie_id, localizacao_anterior_id, localizacao_nova_id, created_at)`,
  índice por `movimentacao_id`. `CREATE TABLE IF NOT EXISTS` (primeiro boot e banco existente).

## Tasks (sort topológico)

- [ ] **T1 (tronco)** — motor: RN-265.01..05 (+ schema, `/transferencias` com `exigeSerie`, `localizacao_codigo` na listagem). Teste
  `server/tests/api/transferenciaComSerie.api.test.js` (cenários pela rota v2 e pela `/transferencias`; o desfazer com o livro falhando).
- [ ] **T2 (tronco, depois da T1)** — motor: RN-265.10..12 (+ `saidaPelaSerie` na v2). Teste `server/tests/api/saidaDaPrateleiraDaSerie.api.test.js`
  com a **RN-265.13** (integração: transferência → saída → estornos, pela rota) e um cenário pelo **serviço** (`registrarMovimentacao` sem a
  opção → como hoje).
- [ ] **T3 (galho, contra o contrato)** — tela RN-265.06. Teste `client/src/components/almoxarifado/MovimentacoesTransferenciaSeries.test.js`.
- [ ] **T4** — Fase 5, documentos (`fechar-etapa`), suítes.

## Próxima tarefa detalhada

(preencher no fechamento)
