# Etapa 51 — A saída baixa o endereço de onde o material sai (plano)

> **Desenho:** `docs/superpowers/specs/2026-09-30-almoxarifado-etapa51-saida-por-localizacao-design.md`

## T1 — `claimSaldoSemLote` (RN-01/02)

- Uma função nova no molde de `claimSaldoDoLote`:
  - drena as linhas `lote_id IS NULL AND quantidade > 0` do material, pela ordem `(localizacao_id IS locSaida) DESC, quantidade DESC, id`, com débito condicional;
  - o que sobrar vai para a linha `(locSaida, NULL)`, via `getOrCreateSaldo`;
  - devolve **todas** as linhas debitadas, para as compensações (`saldoLinhasSaidaParaReverter`, catch amplo).
- **Onde:** o ramo `else` da saída (`stockService.js` ~1330). Vale para material que permite negativo? **Sim**: a regra é de endereço, não de saldo. Com lote, o ramo `claimSaldoDoLote` não muda.
- **Cenários** (`saidaPorLocalizacao.api.test.js`):
  - entrada de 100 em A e entrega sem origem de 100 → A:0;
  - saída com origem vazia B → B não negativa, e A cede;
  - A:60 e B:40, saída de 70 sem origem → a maior primeiro, as linhas somam 30, nenhuma negativa;
  - material sem nenhuma linha (legado): a saída sem origem se comporta como hoje;
  - série e compensação: a saída de material serializado cuja série é recusada **devolve** as linhas drenadas.

## T2 — AJUSTE absoluto para baixo (RN-03)

- `syncSaldoLocalizacaoPadrao` (só para `loteId` nulo): se o resíduo da linha alvo ficaria < 0, drena as linhas sem lote positivas (a alvo primeiro, depois as maiores) até cobrir, e só então negativa o que faltar.
- **Cenários:**
  - A30 e B20, ajuste para 5 → soma 5, nenhuma negativa;
  - ajuste para cima → vai para a padrão/NULL, como hoje;
  - o estorno do AJUSTE continua coerente no total.

## T3 — a guarda do AJUSTE com localização (RN-04)

- Achar onde o AJUSTE com localização recalcula `quantidade_atual` pela soma (`syncMaterialTotals`), e recusar **antes** de aplicar quando o total resultante for < 0 e o material não permitir negativo.
- **Cenários:** o caso −25 da sonda é recusado com a literal; com `permite_saldo_negativo = 1` passa.

## T4 — integração

Os oito cenários da sonda pelas rotas reais, incluindo a entrega de requisição por aprovar (outro usuário) → separar → entregar. Em cada passo, a soma das linhas é igual a `quantidade_atual` e **nenhuma linha fica negativa** em material que não permite. E o mapa (`GET /mapa/localizacoes`) mostra o endereço **vazio** depois da entrega.

## Fase 2 — o revisor ataca (com sonda: é o motor)

1. Quem mais escreve em `estoque_saldo` com `lote_id NULL` e lê "a linha da padrão" como verdade (reconciliação de estorno, contagem de inventário, transferência, reserva)? A drenagem por endereço quebra alguma dessas leituras?
2. Concorrência: duas saídas simultâneas sem origem do mesmo material. O claim com débito condicional segura? (Suíte `test:sqlite`.)
3. As compensações (série recusada, INSERT do ledger falhando) devolvem as N linhas?
4. A RN-04 recusa algo que hoje passa legitimamente (contagem de inventário que zera um endereço com o total ainda positivo)?
5. O estorno de uma saída drenada de várias linhas deixa o endereço coerente? (A letra D declara que não fica exato; medir o quanto diverge.)

## Estado

- [x] Fase 0 (sonda, seção 1 do desenho) · [x] Fase 1
- [x] Fase 2 (1 CRITICAL, 3 IMPORTANT, 2 MINOR — seção 5 do desenho) · [x] T1–T4 (`606f1d0`) · [x] Fase 5 (fix-round `5fdc68a`) · [x] Fase 6 (verificação final medida: `test:api` 228/228 · `test:almoxarifado` 42/42 · validation 4/4 · safealter 3/3 · sqlite 5/5 · client 881/881 em 53 suítes · build `CI=true` limpo)

## Execução — T1 a T4 (`606f1d0`)

- **T1:** `claimSaldoSemLote` no ramo `!loteIdFinal` da saída, com **releitura** quando o débito condicional não casa (Fase 2, IMPORTANT 2).
- **T2:** `syncSaldoLocalizacaoPadrao({ drenar })`, com `drenar` ligado só no AJUSTE de ida.
- **T3:** a RN-04 **absorve** (`absorverNegativosSemLote`) em vez de recusar, com a checagem **antes** de escrever. O estorno do AJUSTE com localização absorvia também; a Fase 5 mudou isso para recusa.
- **T4:** `saidaPorLocalizacao.api.test.js` com 13 cenários: os 8 da sonda da Fase 0, o P2 com lote, a transferência de endereço esvaziado, a corrida e o mapa.
- **Controle positivo:** 5 sabotagens, todas vermelhas, inclusive a da releitura (a corrida é exercitada de verdade).
- **Suítes:** `test:api` **228/228**, `test:almoxarifado` 42/42, `test:sqlite` 5/5. **Nenhum teste antigo dependia da regra velha.**

## Fase 5 — dois revisores, fix-round (`5fdc68a`)

**Correção (sonda `f551-sonda.js`, com `f551-old.js` rodando a mesma sonda contra o motor anterior):**
- **IMPORTANT — estorno de ENTRADA depois de saída drenada deixava ENDEREÇO REAL negativo.** Entradas de 100 em A e em B, saída de 100 que drenou A, estorno da entrada de A: o resultado era `A:−100, B:100` com o físico em 0. Antes da etapa, o negativo ficava na linha sem endereço; com o claim, passou a cair num endereço real, e o outro aparecia ocupado. **Correção:** sem lote e sem negativo, quando a linha da entrada não comporta a reversão, o estorno debita como saída (`claimSaldoSemLote`), e a compensação (`compensarLinhasClaim`) devolve as N linhas pelo id.
- **MINOR — o estorno de AJUSTE com localização que absorvia registrava no livro quantidade que não se moveu** (estorno de 50 com 45 sumindo na absorção). **Correção:** recusa, com *"Não é possível estornar: o saldo já foi consumido (o estorno deixaria o material negativo)"*.
- **Refutadas por sonda:**
  - estorno de saída drenada em 3 linhas;
  - série recusada e ledger falhando (as N linhas voltam);
  - entrega de requisição reservada;
  - PERDA, AJUSTE_NEGATIVO, SUCATA e as demais saídas dedicadas;
  - físico negativo por transferência, zod ou ajuste de lote;
  - permite-negativo;
  - desempenho: 2000 endereços em 220 ms.
- **Declarada, sem reprodução:** a releitura desiste após 3 tentativas sob contenção extrema. Vai para a D (51).

**Força dos testes (worktree isolada): 11 de 13 sabotagens verdes, contra os 13 cenários originais.**
- **Lacunas IMPORTANT:**
  - o `throw` da RN-04 nunca era exercitado;
  - `!loteIdFinal`;
  - a compensação sem a linha do resto;
  - o estorno do AJUSTE sem absorção;
  - a absorção também em material que permite negativo.
- **Lacunas MINOR:**
  - a ordem e o filtro de lote da absorção;
  - `drenar` só sem lote;
  - a ordem da drenagem;
  - EPS;
  - o resto indo para a origem declarada.
- **Equivalente, e não lacuna:** `excluirId` trocado por `null`. A linha excluída nunca é negativa, então o parâmetro é defensivo.

**Fechadas com os cenários (14) a (23) e o (19b).** Fix-round: **12 sabotagens, 12 vermelhas.** ⚠️ **A Y7 (tirar o filtro `lote_id IS NULL` da absorção) ficou VERDE no primeiro teste.** Ali, a linha sem endereço cobria todo o déficit antes de a ordem chegar à linha de lote. Foi preciso o cenário (19b), em que o déficit exige a linha B, com endereço, que ordena **depois** da `NULL/L`. Resultado: `saidaPorLocalizacao` **24/24**.

**O que o revisor de correção NÃO testou:** o estorno de entrada com lote depois de saída sem lote (fora do escopo da RN-01).

## Retro de 4 números — Etapa 51

1. **Rodadas de correção até verde: 1** (Fase 5). A Fase 2 corrigiu o plano antes do código: o CRITICAL da RN-04 como "recusar" teria virado código.
2. **Achados reais:**
   - Fase 0: a medição que **mudou o escopo** da etapa (a tela de vazias mentiria);
   - Fase 2: 1 CRITICAL, 3 IMPORTANT e 2 MINOR;
   - Fase 5: 1 IMPORTANT e 1 MINOR de correção, mais 10 lacunas de teste (5 IMPORTANT).
   - **Ruído: 0.** O revisor de testes rodou numa worktree, e o de correção só depois de os testes pararem de sabotar a árvore principal.
3. **Paralelismo:** nenhum galho. É motor de estoque, na mesma função. Os dois revisores da Fase 5 rodaram juntos, e o fix-round de testes esperou o revisor de correção terminar para não sabotar a árvore que ele sondava.
4. **Defeito que escapou:** *preencher na Etapa 52.* **Da 50 para cá: 0.**

## Próxima tarefa detalhada — Etapa 52: a tela de localizações vazias (feature 02)

**Escolha:** é o que a 50 nomeou e a 51 destravou. O saldo por endereço passou a ser confiável para material **sem** lote.

**Medido hoje, pelo nome do contrato:**
- **A rota existe:** `GET /api/almoxarifado/localizacoes/vazias` (`routes/almoxarifado/extended.js:2115`).
  - Só exige `auth`, **sem** `requirePermission`.
  - Decide "vazia" por `NOT EXISTS (… s.localizacao_id = l.id AND s.quantidade > 0)`.
  - Monta `endereco_completo` em JS.
  - **Não tem consumidor no client.**
- **O mapa decide ocupação com um FALLBACK que a rota de vazias não tem** (`MAPA_LOCALIZACOES_SQL`, `stockService.js`). O material com `localizacao_padrao_id`, `quantidade_atual > 0` e **nenhuma** linha endereçada positiva conta como ocupando a padrão. Com isso, as duas rotas **se contradizem** no legado: o **S8 da Fase 0** mediu o mapa com `LEG=40` e a rota de vazias listando LEG como vazia.
- **O registro de relatórios** (`reportRegistry.js`) já tem `materiais-sem-endereco` (acao `null`), que é o molde. Uma chave nova entra com a função no dispatcher (`extended.js`, mapa `reports`), com `categoria`, `colunas` e `nota`. A varredura do registro (`relatoriosRegistro.api.test.js`) confere as colunas contra o SQL real e a contagem fixa de chaves, que hoje é 22.

**Contrato proposto (a Fase 1 da 52 congela):**
- chave **`localizacoes-vazias`** no registro, categoria **Estoque**, `acao: null`, com colunas código, endereço completo, almoxarifado, tipo e bloqueada;
- **fonte única:** a condição de "vazia" extraída para um helper que a rota antiga e a chave nova usam. Ela inclui o **fallback do mapa**: endereço padrão de material legado com físico > 0 **não** está vazio;
- a **`nota`** declara o **C72**: em material **com lote**, um endereço pode aparecer ocupado depois de a entrega de requisição tirar o material;
- decidir na Fase 1 se a rota antiga ganha `requirePermission('visualizar')`, alinhando-a ao registro. Mudança reversível; registrar na letra B.

**Pontos de atenção:**
- endereço **bloqueado** vazio deve aparecer? Hoje aparece, e o mapa o marca 🔒. Declarar na nota;
- localização **inativa** fica fora, como hoje (`l.ativo = 1`);
- o **fallback** do mapa soma `quantidade_atual` do material na padrão só quando não há linha endereçada **positiva**. Material com linha endereçada zerada e físico > 0 (tudo em "sem localização atribuída") some das duas. Medir isso na Fase 0 da 52.
