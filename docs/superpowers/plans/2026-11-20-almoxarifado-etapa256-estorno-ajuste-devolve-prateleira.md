# Etapa 256 — o estorno do Ajuste devolve às prateleiras de onde a baixa saiu (C549)

> Item único: o **C549** (letra C das novidades; decisão **B1597** da Etapa 254, achado da Fase 5 dela). Estimativa
> `docs/estimativas/2026-11/estimativa_2026-11-20_almoxarifado-estorno-ajuste-devolve-prateleira.md` (1h30, `f4153785`).
> **Não entram:** os itens 24, 25 e 26 da estimativa de 18/11 (esperam resposta da empresa).
> **Fatia visível:** não há tela nova — o que muda aparece em **Estoque → saldo por localização** depois de **Estornar** um Ajuste (as peças
> voltam à prateleira de onde saíram). Declarado (motor puro).

## Fase 0 — medido (código, 20/11)

- **Reprodução:** `ajusteSemLotePoupaCaixa.api.test.js`, cenário *[D (254), documenta]* — padrão *A* com 4 separadas e *B* 3, Ajuste para 4 →
  *A* 4, *B* 0; **Estornar** → *A* 7, *B* 0 (15/15 verdes hoje; o cenário afirma o defeito).
- **Ida:** `registrarMovimentacaoSemTrava` (sob `naTravaDoMaterial` inteiro, Etapa 97), AJUSTE/AJUSTE_INVENTARIO sem localização →
  `syncSaldoLocalizacaoPadrao(db, m, lote, { drenar: true })` (~`stockService.js:2600`), que **já devolve** as linhas drenadas
  (`[{ id, quantidade }]`, uma entrada por passada — a mesma linha pode vir duas vezes). Ninguém grava. O livro nasce depois
  (`INSERT INTO movimentacoes_almoxarifado`, ~2604), dentro do `try` cuja falha desfaz os efeitos (o drenar do AJUSTE sem série **não** é
  desfeito se o livro falhar — anterior, fora do escopo).
- **Estorno:** `cancelarMovimentacao`, ramo `AJUSTE` sem `localizacao_destino_id` (~3784), sob `trava.naTravaDoMaterial` (~3513, Etapa 118:
  uma seção do efeito ao livro): guarda de retenção → (com lote) recusa do lote → `SET quantidade_atual = saldo_anterior` →
  `syncSaldoLocalizacaoPadrao(…, { drenar: Boolean(lote), drenadas: compensarLinhasClaim })`. O resíduo (total − as outras linhas) cai
  **inteiro** na linha padrão. O desfazer (`desfazerEfeitosDoEstorno`) devolve `compensarLinhasClaim` (soma por id) **antes** de voltar o total
  e re-sincronizar — a ordem certa para linhas mexidas antes do sync.
- **O mesmo defeito com lote:** o Ajuste com lote (Etapa 253) drena o lote em outros endereços; o estorno põe tudo na linha padrão do lote.
  Mesma função, mesma correção (RN-256.02).
- **Banco:** o schema do almoxarifado (`services/almoxarifado/schema.js`) cria tabelas auxiliares com `CREATE TABLE IF NOT EXISTS` (molde:
  `series_entrada_anterior_almoxarifado`, Etapa 119). Tabela nova: nada de `ALTER`. Nenhuma linha de estoque é apagada fora da exclusão do
  material (`materialService.js:459`), então o id da linha é estável.
- **Ordem (Fase 2, achado 4):** a devolução roda dentro do sync, **antes** do drenar; depois dela a padrão tem pelo menos o que tinha (ou 0),
  e o piso da RN-254.01 b (≤ o que a padrão tem) nunca passa disso — o drenar do estorno com lote não reage às linhas recém-devolvidas.
- **Fora do escopo (Fase 2, ruído 6):** o `PUT` do material chama `syncSaldoLocalizacaoPadrao` sem a trava (`routes/almoxarifado.js:1091`),
  sem drenar nem devolver — corrida anterior à etapa.

## Regras de negócio

- **RN-256.01** O **AJUSTE** (tipo `AJUSTE`, não o `AJUSTE_INVENTARIO`, que não é estornável) sem localização que drenou prateleiras grava,
  por movimento, cada linha drenada e quanto (`ajuste_linhas_drenadas_almoxarifado`: `movimentacao_id`, `saldo_id`, `quantidade`, na ordem
  da drenagem). Grava **depois** do livro (o id dele), ainda dentro da seção do material, num `INSERT` só com todas as linhas (tudo ou nada —
  Fase 2, achado 2). **Falha ao gravar não derruba o Ajuste** (o livro já valeu — o padrão C250 da Etapa 120): log, nenhuma linha gravada, e
  o estorno desse Ajuste faz o de antes (tudo na padrão). Ajuste que não drenou: nenhuma linha. O registro fica depois do estorno (histórico,
  não estado: o Ajuste não estorna duas vezes).
- **RN-256.02** O estorno do AJUSTE sem localização (com ou sem lote), depois de voltar o total, **devolve primeiro às linhas drenadas**, na
  ordem da drenagem, até a quantidade drenada de cada uma, **limitado ao que iria a mais para a linha padrão**: o total devolvido ≤
  max(0, resíduo − o que a padrão tem agora). O resto continua indo para a padrão (resíduo). Cenário C549: *A* 4 (separadas), *B* 3, Ajuste
  para 4 → *A* 4, *B* 0; estorno → **A 4, B 3**, total 7 (antes: *A* 7, *B* 0). Sem caixa (Etapa 51): *P* padrão, *A* 30, *B* 20, Ajuste
  para 5 → *A* 0, *B* 5; estorno → *A* 30, *B* 20, *P* 0.
- **RN-256.03** O limite (a padrão não desce por causa da devolução): movimento no meio. *P* padrão, *A* 5, *B* 3, Ajuste para 2 → *A* 0,
  *B* 2, *P* 0 (drenou *A* 5 e *B* 1); Entrada de 3 em *P* (*P* 3, total 5); estorno → total 8 (o SET absoluto de sempre), resíduo sem
  devolver 6, a padrão tem 3 → devolve 3 (a *A*, a primeira drenada) → *A* 3, *B* 2, *P* 3. Resíduo sem devolver ≤ o que a padrão tem →
  devolve 0, como hoje. **Padrão negativa** (legado, ou material que permite negativo — Fase 2, achado 3): conta como 0 no limite —
  *P* −2, resíduo 3, 6 drenadas → devolve 3, *P* 0 (com a padrão contada em −2 devolveria 5 e *P* ficaria −2).
- **RN-256.04** Linha drenada que **é hoje a linha padrão** (o endereço padrão do material mudou para ela) ou que não existe mais: pulada — a
  parte dela vai para o resíduo (na padrão). Ajuste **antigo** (sem registro) ou cujo registro falhou: como hoje (tudo na padrão). Declarado.
- **RN-256.05** Desfazer: se o estorno falhar depois da devolução (o livro do estorno — a recusa do lote roda **antes** de qualquer efeito;
  corrigido na Fase 2, achado 1: esta linha citava a recusa do lote), as linhas devolvidas voltam
  (subtraem) **antes** de voltar o total e re-sincronizar, dentro da seção (`compensarLinhasClaim` — a mesma lista do drenar do estorno com
  lote). Depois do desfazer: estado idêntico ao de antes do estorno; o estorno de novo, sem a falha, devolve certo.
- **RN-256.06** O que não muda: o Ajuste com localização (não drena, não grava); a ida do Ajuste (as linhas finais são byte a byte as de
  hoje — só ganha o registro); o estorno com lote continua drenando quando o resíduo fica abaixo do piso (Etapa 254, RN-254.01 b) — depois da
  devolução, que nunca deixa a padrão abaixo do que ela tem. O `SET` absoluto do total no estorno sem localização (de sempre): dois Ajustes
  estornados fora de ordem dão o total do primeiro (Fase 2, ruído 5 — anterior, fora do escopo; na ordem inversa as linhas voltam exatas).

## Contratos

- Rotas: **nenhuma muda.** `POST /api/almoxarifado/movimentacoes/v2` (AJUSTE) — resposta igual. `POST /api/almoxarifado/movimentacoes/:id/cancelar`
  — resposta igual; mensagens de recusa iguais (nenhuma nova).
- `syncSaldoLocalizacaoPadrao(db, materialId, loteId, { drenar, drenadas, devolver = [], devolvidas = null })` — `devolver`:
  `[{ id, quantidade }]` (as linhas a devolver, na ordem); cada devolução aplicada entra em `devolvidas` (se dado) como
  `{ id, quantidade: -q }` (o formato do rastreador `compensarLinhasClaim`: o desfazer **soma** `quantidade`). Antes do drenar. Os outros
  chamadores, sem mudança.
- Banco: `ajuste_linhas_drenadas_almoxarifado (id INTEGER PK AUTOINCREMENT, movimentacao_id INTEGER NOT NULL, saldo_id INTEGER NOT NULL,
  quantidade REAL NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)` + índice em `movimentacao_id`. Sem consulta de produção
  necessária (tabela nova, vazia; ajuste antigo = comportamento de hoje) — **não** vai para a letra A.

## Desenho

- **Ida:** `const drenadasAjuste = await syncSaldoLocalizacaoPadrao(..., { drenar: true })`; depois do `INSERT` do livro (fora do `try` dos
  efeitos, como o vínculo de série), se `tipo === 'AJUSTE'` e houver drenadas: um `INSERT` só (todas as linhas, `VALUES (…), (…)`), em `try/catch` com `console.warn`.
- **Estorno:** no ramo sem localização, antes do sync: lê `SELECT saldo_id, SUM(quantidade) q, MIN(id) o FROM ajuste_linhas_drenadas_almoxarifado
  WHERE movimentacao_id = ? GROUP BY saldo_id ORDER BY o`; `compensarLinhasClaim = []` (sempre, não só com lote); passa `devolver` e
  `devolvidas: compensarLinhasClaim` ao sync. Dentro do sync: depois de calcular `novaLinha` e `atualLinha`, para cada `devolver` com
  `id !== saldo.id`: `tira = min(q, novaLinha − max(0, atualLinha))`; se > 0, `UPDATE … + tira WHERE id = ? AND material_id = ?` (0 mudanças →
  pula); `devolvidas.push({ id, quantidade: -tira })`; `novaLinha -= tira`.
- **Travas:** nada novo — a ida e o estorno já rodam na seção do material; a gravação e a leitura do registro ficam dentro dela. Não
  reentrante: nenhuma chamada nova de trava.

## Fase 2 (revisor fresco, 20/11) — 4 menores reais, 3 ruídos; nenhum importante

Sondas executadas numa cópia do HEAD com o diff do T1 aplicado (9 cenários): os números das RN-256.02 e 256.03 conferem; o desfazer volta o
estado exato (*A* 4, *B* 0, total 4, `cancelado = 0`) e o estorno de novo dá *A* 4, *B* 3; a entrega e o estorno de uma transferência
*A*→*B* depois do estorno saem (200). Nenhuma outra porta drena sem gravar (`drenar: true` só na ida e no estorno; o `AJUSTE_INVENTARIO`
não estorna; nenhum `compensacao: true` estorna Ajuste; `registrarMovimentacaoSemTrava` só pelo invólucro com trava).

1. **[menor]** RN-256.05 citava a recusa do lote como falha depois da devolução — ela roda antes. → RN corrigida.
2. **[menor]** gravação linha a linha + `DELETE` no catch: se o `DELETE` falhasse, registro pela metade. → um `INSERT` só (atômico); teste
   com a falha na 2ª linha.
3. **[menor]** padrão negativa: o limite a mantinha negativa. → `max(0, atual)`; teste novo.
4. **[menor]** a ordem devolução → drenar não estava escrita. → Fase 0.
5. **[ruído]** dois Ajustes estornados fora de ordem (SET absoluto de sempre) → RN-256.06. 6. **[ruído]** `PUT` do material com sync sem
   trava (anterior) → Fase 0. 7. **[ruído]** o registro fica depois do estorno → RN-256.01.

## Tasks

- [ ] **T1 (tronco, motor)** tabela + gravação na ida + devolução no estorno + desfazer. Teste novo
  `estornoAjusteDevolvePrateleira.api.test.js` (RN-256.01..06, rota e serviço) e o *[documenta]* da 254 virando a prova (A 4, B 3).
  Sabotagens com controle positivo.
- [ ] **T2** integração — no T1: ajuste pela rota → entrega da requisição → estorno pela rota → linhas; e um cenário pelo serviço
  (`registrarMovimentacao` + `cancelarMovimentacao`).
- [ ] **T3** prova de primeiro boot (`CRM_DATA_DIR` vazio, `node index.js`, `no such table` = 0, duas vezes).
- [ ] **T4** Fase 5 — revisor fresco com sonda executada.
- [ ] **T5** fechamento (fechar-etapa sem 7½ e 8).
