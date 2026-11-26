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

- [x] **T1 (tronco)** — `c2db75d4` — motor: RN-265.01..05 (+ schema, `/transferencias` com `exigeSerie`, `localizacao_codigo` na listagem). Teste
  `server/tests/api/transferenciaComSerie.api.test.js` (cenários pela rota v2 e pela `/transferencias`; o desfazer com o livro falhando).
- [x] **T2 (tronco, depois da T1)** — `7a7c8a71` — motor: RN-265.10..12 (+ `saidaPelaSerie` na v2). Teste `server/tests/api/saidaDaPrateleiraDaSerie.api.test.js`
  com a **RN-265.13** (integração: transferência → saída → estornos, pela rota) e um cenário pelo **serviço** (`registrarMovimentacao` sem a
  opção → como hoje).
- [x] **T3 (galho, contra o contrato; um executor em paralelo com a T2)** — `2ddb325d` — tela RN-265.06. Teste `client/src/components/almoxarifado/MovimentacoesTransferenciaSeries.test.js`.
- [x] **T4** — Fase 5 `30070e78`; fechamento — Fase 5, documentos (`fechar-etapa`), suítes.


## Fase 2 (revisor fresco, uma passada, sobre o plano `06db5594`)

- **(A) importante** — com o lote em branco a tela mostraria séries de lote que o servidor recusa. → **consertado na tela** (T3): lote em branco
  mostra só as sem lote, com *"Há séries em lote: escolha o lote para vê-las."* (B1624 d: não derivar o lote no motor).
- **(B) importante** — o estorno devolvia cada série ao `localizacao_anterior_id` (NULL ou registro velho) com o saldo voltando à origem. →
  **consertado**: volta à **origem** do movimento; a coluna fica como histórico (B1625 a).
- **(C) importante, fora do diff** — a entrega que sai como antes e a exclusão dela podem deixar o registro fora do saldo de novo e prender o
  estorno de uma transferência anterior. → **declarado** (D (265) 2).
- **menores:** frase da série sem lote no material com controle de lote (→ frase própria); "presente" = em estoque ou bloqueada (→ explícito);
  régua da entrega (só em estoque) × desta (presentes) (→ D (265) 4).

## Fase 5 (dois revisores frescos, sondas `scratchpad/f5a-265-*.js`, `f5b-265-*.js`, sobre `7a7c8a71`)

1. **[importante, reproduzido]** Transferência de série sem prateleira/registro velho com a origem já com série para cada peça: PA saldo 1
   com S1, transferir S2 → PA saldo 0 com S1 registrada. → **consertado** (`30070e78`): de fora da origem, só até `saldo − séries presentes
   registradas` na origem; recusa *"A série X não consta na prateleira A — todas as peças de A já têm série registrada; marque as séries que
   estão em A"*. Sabotagem S14.
2. **[importante, reproduzido]** A Saída da série levava a única peça da prateleira separada (com origem) para uma requisição e a entrega
   recusava *"a origem da separação (PB) não serve mais"* — a premissa da B1626 c falhava. → **consertado**: a fatia desconta a parte separada
   (`parteOrigemSql` + caixa viva); não cobrindo, como antes. Sabotagem S29.
3. **[menor, reproduzido]** O Ajuste negativo pela v2 também mudava. → **consertado**: só Saída e Perda. Sabotagem S30.
4. **[importante, testes]** Nenhuma fatia com n ≥ 2; o cenário do livro falhando passava com a opção desligada. → cenários novos e controle
   no mesmo cenário; sabotagem S28 (baixa 1 em vez de n) agora cai.
- Tentado e não quebrou: falhas forçadas no meio (livro, 2ª série, estorno), duas transferências da mesma série ao mesmo tempo, origem =
  destino, `serie_ids` em texto, lote por código, série bloqueada, estorno da entrada depois da transferência, reserva, Perda, lote derivado,
  histórico da 261, autorização (gates mantidos; a opção só do 4º argumento).

## Divergências do plano

- RN-265.05 dizia "volta à prateleira de onde veio" — **errado** para a série sem prateleira/registro velho (Fase 2 B): volta à origem.
- RN-265.03 aceitava qualquer série de registro velho — faltava o limite das peças sem série na origem (Fase 5, 1).
- B1626 c ("não descontar a separação") — **errado** quando a única peça da prateleira está separada (Fase 5, 2).
- RN-265.10 valia para "todo tipo de saída do formulário"; o código pegava também o Ajuste negativo da v2 — limitado a Saída e Perda.
- Testes antigos que provavam a decisão 9 (transferenciaRegras, MovimentacoesAlmoxarifado.test) e o cenário RN-252.21 d (que usava a
  transferência para criar registro velho) foram reescritos — a decisão foi revista.
- **CLAUDE.md:** nenhuma linha ficou errada — tudo roda dentro da seção do motor/estorno (`naTravaDoMaterial`); nenhuma porta nova lê o livre
  para reservar; o bloquear série já pegava a mesma trava.

## Próxima tarefa detalhada

Os itens **12 e 13** da estimativa de 23/11 (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md`):

1. **Item 12 — Entrega confere o lote das séries antes de começar (C486; 1h15, motor).** `requisitionService.entregarRequisicao`
   (~2414, ~2543): o item com série fica fora da conferência de lote impedido feita antes da 1ª baixa; o motor só recusa na baixa daquele
   item, depois de outros itens já terem saído. Conferir, antes de qualquer baixa (dentro das duas travas da entrega), o lote de cada série
   marcada pela régua `loteImpedido` (bloqueado, reprovado, vencido sem liberação) e recusar com a frase da 232/233. Atenção: a entrega roda
   sob a trava por requisição e, por dentro, a por material (`comTravaDaRequisicao`).
2. **Item 13 — Dica da Fila não manda duas requisições ao mesmo lugar (D (250) 4, B1255, C449; 1h15, leitura).** `sugestaoDeColeta.js`
   (RN-188.03): os irmãos da mesma requisição descontam o sugerido; entre requisições, não. Descontar na ordem de urgência da Fila. Função
   pura — teste de unidade + a rota da Fila.
- **O que já está pronto e não reabre:** a transferência com série e a Saída pela prateleira da série (esta etapa).
- Candidatos fora da estimativa: conferir as séries na origem escolhida (D (265) 1); o estorno do Desbloquear com lote (C504).

## Verificação (medida sobre o código final, `30070e78`; os documentos não mudam código)

- `npm run test:api` (sozinho, `NODE_OPTIONS=--max-old-space-size=4096`): **673/675 arquivos OK** — os 2 que falham são os já conhecidos de
  proposta, de outra máquina (`propostaBilingueTemplate`, `propostaPdfExigeLogin`); o mais lento: `propostaClausulasGrava`, 85,5 s.
- `npm run test:almoxarifado`: **44 passou, 0 falhou**. `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **16/0**.
- Jest da tela (`--maxWorkers=2`, sobre `2ddb325d` — a tela não mudou depois): **256/256 suítes, 3363/3363 testes**. `CI=true npx react-scripts
  build`: **Compiled successfully.**
- `transferenciaComSerie` 18/18; `saidaDaPrateleiraDaSerie` 15/15; `MovimentacoesTransferenciaSeries` 12/12. Sabotagens S1-S14 e S20-S30
  (harness `scratchpad/sab-265.sh`: âncora contada = 1, cópia, md5 sabotado ≠ original e restaurado = original) e seis da tela: cada uma
  derruba o cenário certo, menos S27 (linha cobre), redundante com o registro que bate — ficou como defesa.
- Primeiro boot: a tabela nova é `CREATE TABLE IF NOT EXISTS` no `initSchema` (o harness cria o banco do zero em cada arquivo). Nenhum clique
  no navegador (F (265)).

## Retro (4 números)

- Rodadas de correção até verde: 2 (Fase 2 — o estorno à origem, a frase do lote, o filtro da tela; Fase 5 — a origem com série para cada
  peça, a separação na prateleira da série, o Ajuste negativo, os cenários).
- Achados: Fase 2 — 2 importantes consertados, 1 importante fora do diff declarado, 3 menores; Fase 5 — 2 importantes e 1 menor consertados,
  1 lacuna de teste consertada, 1 ruído (comentário).
- Paralelismo: 1 galho (a tela) em paralelo com a T2, sem retrabalho; os revisores rodaram enquanto os documentos eram escritos.
- Defeito que escapou: (preencher na etapa seguinte). Da 264: nenhum apontado.
