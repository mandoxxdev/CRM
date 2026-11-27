# Etapa 270 — Separar de duas prateleiras (C461, B1313 caminho (b), B1254)

> Itens **19** e **20** da estimativa da semana (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md` — 1h30 + 2h; não
> refeita). É a "próxima tarefa detalhada" do plano da 269.
> **Fatia visível:** o detalhe da requisição mostra *"separado de A-01 (3 UN) · B-02 (2 UN)"*; a janela de entrega diz de onde cada parte sai;
> a entrega de um clique tira as 2 de B-02 (antes: no automático, do endereço padrão).

## Fase 0 — medido (sobre `a70d5408`)

- O item guarda **uma** origem: `itens_requisicao_almoxarifado.origem_separacao_id` + `lote_separacao_id` + `quantidade_origem_separacao`
  (Etapa 196). A rodada de **outro** endereço escolhido sobre item com origem não grava nada além da caixa (`separarSemTrava`,
  `requisitionService.js` ~1956-1970: "outro par, automatico ou so lote nao muda a origem nem a parte"). A rodada fica só no histórico
  (`separacoes_requisicao_almoxarifado.itens_json`, com `localizacao_origem_id`). **Confirmado o C461.**
- Leitores da origem (`grep origem_separacao_id`): ~30 pontos em `requisitionService.js` (todos via `PARTE_ORIGEM_SQL`/`parteDaOrigem` — as
  guardas de "separado para outra requisição": E1 do caso (c), `guardaDosIrmaosNoPar`, `lotesParaOAutomatico`, `claimSemLoteLevaGuarda`,
  `parteGuardadaDeOutras*`, `guardadoNoLote`, a dica da Fila), `stockService.js:1104` (séries), `sugestaoDeColeta.js`, a rota do detalhe
  (`routes/almoxarifado.js` ~4100). Reescrever todos para somar linhas é a etapa inteira de risco — **não** é o caminho (B1643).
- A entrega: o pedaço "com origem" sai da origem guardada (passadas 0/1); o resto (passada 2) vai ao automático (`lotesParaOAutomatico`/
  `fatiasSemLoteParaOAutomatico`/claim do motor), lido **na hora do pedaço**, já descontando as guardas de todas as caixas vivas.
- A tela da entrega, com a quantidade acima da parte da origem, não manda chave nenhuma (`semEscolha`): o servidor aplica a origem até a parte
  e o resto vai ao automático — é aí que a 2ª parte entra.
- Quem diminui a caixa: a entrega (finally, `quantidade_origem_separacao` relativo), a devolução à prateleira (`devolverSemTrava`, a parte
  limitada à caixa — RN-196.08), a exclusão (zera a origem, Etapa 203). Ninguém mais (`grep "SET quantidade_separada"`).

## Decisões

- **B1643** — as outras prateleiras ficam numa **tabela nova** (`partes_separacao_almoxarifado`: item, endereço, lote, quantidade), aditiva;
  a origem do item (as três colunas) **continua sendo a 1ª parte e a única que guarda a prateleira** contra outras requisições. A parte de
  outra prateleira **não entra** em nenhuma conta de "separado para outra requisição" (dica da Fila, "Sai de", limite da janela, E1, automático
  das outras): todas ficam byte a byte como hoje. **Consequência declarada (D):** outra requisição ainda pode separar de B-02 as peças que esta
  separou de lá (como hoje); na entrega, se B-02 não tiver mais as peças livres, a parte sai no automático (como hoje) — sem recusa nova.
  **Descartado:** fazer a 2ª parte guardar a prateleira (todos os ~30 leitores somando linhas — a próxima, se aparecer na operação) e guardar
  todas as partes na tabela nova, inclusive a 1ª (troca a régua de todas as guardas). **Reversível** (a tabela só acrescenta).
- **B1644** — a conta da caixa: as outras partes valem **até o que sobra da caixa depois da parte da origem**, na ordem em que foram separadas.
  Quem tira da caixa sem dizer de onde (devolução à prateleira, entrega no automático) tira primeiro o que não tem prateleira, depois as outras
  partes da **última para a primeira**, por último a origem — a mesma regra da RN-196.08 estendida. A leitura limita sempre (o número gravado só
  sobe na separação, que antes regrava o valor limitado). **Descartado:** decrementar a tabela em toda porta que mexe na caixa (três portas a
  mais para manter; a leitura limitada dá o mesmo número).
- **B1645** — a entrega sem "Sai de" (um clique, ou a janela sem escolha) tira a parte de cada outra prateleira **de lá**, quando a prateleira
  ainda tem essas peças **livres** (o saldo do par menos o que as caixas vivas guardam ali — a mesma régua do automático —, endereço não
  bloqueado, lote que pode sair e sem a peça em inspeção/presa); o que não couber, no automático de hoje. **Não** se aplica com o "Sai de"
  escolhido, com "Qualquer endereço (automático)" escolhido, nem a item com número de série (as séries dizem de onde sai). **Descartado:**
  recusar quando B-02 não tem mais (hoje sai; seria recusa nova sem o almoxarife ter feito nada de errado).

## Regras de negócio

### Item 19 — guardar e mostrar

- **RN-270.01** — Item com origem guardada (A-01, parte 3). Nova rodada de **3 escolhendo B-02** (endereço; lote opcional) → a origem continua
  A-01 parte 3 (RN-196.03) e a tabela ganha `(B-02, lote, 3)`. Sem troca. A rodada **automática** e a de **só lote** (sem endereço) não gravam
  parte (continuam sem prateleira).
- **RN-270.02** — Mesmo par (endereço + lote exatos) soma na mesma linha; par diferente = outra linha. O mesmo item duas vezes no mesmo envio
  (A 3 + B 2, sem origem antes) → origem A 3, parte B 2.
- **RN-270.03** — A parte vale até a caixa que sobra depois da origem, na ordem de separação (B1644). Caixa 8 = A 3 + B 2 + C 2 + automático 1:
  devolver 2 à prateleira → A 3, B 2, C 1; devolver mais 3 → A 3, B 0, C 0; entregar escolhendo outro endereço consome igual.
- **RN-270.04** — O detalhe da requisição (`GET /requisicoes/:id`) devolve, por item, `partes_separacao: [{ localizacao_id,
  localizacao_codigo, lote_id, lote_codigo, quantidade }]` — só as outras partes, já limitadas, as de quantidade 0 fora; `[]` sem nenhuma.
  A tela mostra *"separado de A-01 (3 UN) · B-02 (2 UN)"* (o mesmo endereço+lote somado numa entrada só); sem outras partes, **byte a byte como
  hoje**. Origem zerada (A entregue) com B na caixa → *"separado de B-02 (2 UN)"*.
- **RN-270.05** — Nenhuma conta de outra requisição muda (B1643): R1 com A 3 + B 2; R2 separa de B-02 → vê o livre de B-02 como hoje (as 2 de
  R1 não descontam). Controle: a mesma conta com a parte de A desconta (RN-196.09).
- **RN-270.06** — A exclusão da requisição apaga as partes dos itens (como zera a origem, Etapa 203), depois do UPDATE que venceu.

### Item 20 — a entrega sai de cada uma

- **RN-270.10** — Caixa A 3 + B 2; entrega de um clique 5 → SAÍDA 3 de A-01 (origem estrita) e SAÍDA 2 de B-02 (endereço da fatia); o
  automático não baixa nada. Origem e parte zeram.
- **RN-270.11** — Com lote: A-01/L1 3 + B-02/L2 2 (material com controle de lote) → 3 de (A, L1) e 2 de (B, L2), não o FEFO.
- **RN-270.12** — B-02 sem as peças livres (outra requisição separou de lá com origem guardada, ou saiu numa saída avulsa) → o que B-02 cobre
  sai de lá, o resto no automático de hoje; 200, sem recusa nova. B-02 bloqueado, lote vencido/impedido ou com peça em inspeção → automático.
- **RN-270.13** — Não se aplica com o "Sai de" escolhido, com `origem_automatica`, nem a item com série (B1645): como hoje.
- **RN-270.14** — Entrega parcial: caixa A 3 + B 2 + C 2, um clique 4 → 3 de A, 1 de B; partes depois: B 1, C 2. Um clique 3 → 1 de B, 2 de
  C. O que saiu de cada parte desconta dela; depois a régua da RN-270.03.
- **RN-270.15** — A parte que sai de B-02 pela entrega é uma SAÍDA com o endereço: o estorno da saída, a devolução da saída para Estoque e a
  exclusão da requisição a devolvem para B-02 (o registro por linha das Etapas 257/259) — nada novo a fazer, só provado.
- **RN-270.16** — A janela de entrega (sem "Sai de" escolhido, quantidade acima da parte da origem) diz *"3 UN sai de A-01 (o que foi separado
  de lá); 2 UN de B-02, se ainda estiverem lá; o restante, automático. Se em A-01 não houver mais essa quantidade, a entrega é recusada —
  escolha de onde sai."* Sem outras partes: a frase de hoje, byte a byte. Item sem origem e só com outras partes: *"2 UN sai de B-02, se ainda
  estiverem lá (o que foi separado de lá); o restante, automático."*
- **RN-270.17** — O aviso da janela de separação (outro endereço sobre item com origem) passa a dizer *"Já separado de A-01: 3 UN, que
  continuam saindo de lá. Esta parte fica anotada como separada de B-02 e sai de lá na entrega, se ainda estiver lá (senão, no automático)."*
  — só quando o escolhido é um endereço; com "automático" ou só lote, a frase de hoje.

## Contratos (congelados)

- `PUT /api/almoxarifado/requisicoes/:id/separacao` — nenhum campo novo; grava a parte (RN-270.01/02).
- `GET /api/almoxarifado/requisicoes/:id` — item ganha `partes_separacao` (RN-270.04), aditivo.
- `PUT /api/almoxarifado/requisicoes/:id/entregar` — nenhum campo novo, nenhuma recusa nova; as SAÍDAS da parte de outra prateleira levam
  `localizacao_origem_id` (origem estrita, a mesma `baixar(..., enderecoDaFatia)` do automático).
- `requisitionService.partesEfetivas(item, linhas)` → `[{ ...linha, quantidade }]` (pura, exportada): limita pela caixa − `parteDaOrigem`,
  na ordem do id, tira as zeradas.
- Tabela `partes_separacao_almoxarifado (id, item_requisicao_id, requisicao_id, material_id, localizacao_id NOT NULL, lote_id, quantidade REAL
  NOT NULL, created_at, updated_at)` + índice por item. `CREATE TABLE IF NOT EXISTS` (banco novo e antigo iguais; sem migração — item antigo
  não tem parte, vale como hoje).

## Tasks (sort topológico)

- [ ] **T1 (tronco, servidor, item 19)** — tabela, `partesEfetivas`, gravação na separação, `partes_separacao` no detalhe, limpeza na
  exclusão. Teste `server/tests/api/separarDeDuasPrateleiras.api.test.js` (RN-270.01..06; rota e serviço).
- [ ] **T2 (tronco, servidor, item 20)** — a entrega sem escolha tira de cada parte (RN-270.10..15), decremento no finally. Mesmo arquivo de
  teste; **integração** separar → entregar parcial → entregar o resto → estornar a saída de B → excluir (RN-270.15), pela rota e pelo serviço.
- [ ] **T3 (galho, tela)** — detalhe (RN-270.04), dica da entrega (RN-270.16), aviso da separação (RN-270.17); textos da Fila
  (`coletaTexto.js`) e `FRASE_PARCIAL` que dizem "sai no automático na entrega" ajustados. Teste
  `client/src/components/almoxarifado/RequisicoesDuasPrateleiras.test.js`.
- [ ] **T4** — Fase 5, documentos (`fechar-etapa`), suítes, estimativa.

T3 depende só do contrato (RN-270.04) — galho. T2 depende da T1 (lê a tabela).

## Fase 2 (revisor fresco, uma passada)

(a preencher)
