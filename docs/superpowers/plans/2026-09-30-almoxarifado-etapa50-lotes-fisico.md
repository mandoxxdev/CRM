# Etapa 50 — A tela de Lotes mostra o físico e o "sem lote atribuído" (plano)

> **Desenho:** `docs/superpowers/specs/2026-09-30-almoxarifado-etapa50-lotes-fisico-design.md`

## T1 — helper, rota e o relatório na mesma régua

- **`lotService`:** a função pura `residualSemLote(fisico, somaLotes)` (`EPS_SALDO = 1e-9`, arredondada a 6 casas) e `resumoLotesDoMaterial(db, materialId)`, com 404 se o material não existir.
- **`reportService.relatorioSaldoPorLote`:** usa `residualSemLote` em vez da conta própria.
- **Rota `GET /materiais/:id/lotes/resumo`**, registrada **antes** de qualquer rota com `:id` que possa capturar `resumo`.
- **Cenários** (`lotesResumo.api.test.js`):
  - a entrega sem lote dá `{ fisico: 70, soma_lotes: 100, sem_lote_atribuido: -30 }`;
  - com tudo atribuído, o resíduo é 0;
  - material inexistente devolve 404 com a literal;
  - PRODUCAO recebe 200 (gate `visualizar`);
  - **o relatório da 49 continua verde**, e `relatoriosSaldos` precisa seguir 16/16.

## T2 — a tela

`LotesAlmoxarifado.js` busca o resumo junto com os lotes e renderiza o bloco da RN-03 só com o resíduo diferente de zero.

**Cenários** (`LotesAlmoxarifado.test.js`):
- com o resíduo em −30, o bloco aparece com os valores e o texto;
- com o resíduo em zero, o bloco **não** aparece (e a tabela continua);
- sem material selecionado, nenhum GET de resumo.

## T3 — integração

Entrada no lote A, entrega de requisição **pela rota real** (aprovar → separar → entregar) e resumo. Prova que o caminho de consumo de verdade produz o resíduo que a tela mostra.

## Fase 2 — o revisor ataca

1. Existe rota que capture `/materiais/:id/lotes/resumo` antes da nova?
2. Trocar a conta do relatório pelo helper muda algum número dele?
3. A tela: o `materialSelecionado` tem `controle_lote`? Um material sem controle de lote pode ter resíduo diferente de zero (lotes antigos)?

## Fase 2 — feita: 0 CRITICAL, 1 IMPORTANT, 3 MINOR (sondas `rev50-probe*.js`)

**IMPORTANT — do jeito que o plano estava escrito, a tela e o relatório divergiriam.** Duas formas:
- **(a)** material **sem** controle de lote e **sem** lote nenhum: o resumo ingênuo daria `sem_lote_atribuido` = o físico inteiro, e o relatório não mostra nada;
- **(b)** o legado **com** controle e sem lote nenhum: o relatório mostra o físico inteiro como sem lote, mas a tela cai em *"Nenhum lote cadastrado"* **antes** da tabela — um bloco "abaixo da tabela" sumiria justo nesse caso.

**Correção (entrou na T1/T2):** o helper usa **o critério do relatório** para decidir se informa o resíduo — ativo **e** (saldo em lote existente **ou** controle de lote com físico ≠ 0) —, e a soma é a do relatório (`JOIN lotes`, pelo material do saldo). O bloco fica **fora** do ternário da tabela.

**Respostas:** (1) nenhuma rota captura `/lotes/resumo` — refutado; (2) o helper só muda o relatório na faixa degenerada de resíduo entre 1e-9 e 5e-7 (MINOR: arredonda **antes** de comparar, aceito de propósito); (3) material sem controle **com** lote antigo tem resíduo, e o bloco aparece independente de `controle_lote` — está no critério.

**MINOR:** o texto do bloco só explicava o resíduo negativo — ganhou o positivo (entrada sem lote); o GET do resumo usa a mesma guarda `cancelado` e o mesmo `reloadToken`, e a falha dele não derruba a tabela nem dispara o toast dos lotes; material inativo segue o `ativo = 1` do relatório. **A T3 exigiu outro usuário para aprovar** — quem pede não aprova a própria requisição (403).

## Execução — T1 a T3 (`1f335b4`)

- **T1:** `lotService.residualSemLote` + `resumoLotesDoMaterial` (fonte única), `GET /materiais/:id/lotes/resumo` (gate `visualizar`, 404 *"Material não encontrado"*), e o `relatorioSaldoPorLote` passando a usar `residualSemLote`.
- **T2:** o bloco na `LotesAlmoxarifado.js`, fora do ternário da tabela, só com resíduo ≠ 0.
- **T3:** a entrega **pela rota real** (criar → aprovar com outro usuário → separar → entregar) produz o −30 que a tela e o relatório mostram — cenário (10) de `lotesResumo`.
- **Divergência do plano:** o critério de exibição **e** a soma mudaram para os do relatório (Fase 2).

## Fase 5 — um revisor, as duas lentes, numa worktree isolada

**Correção — três casos em que tela e relatório ainda divergiam, todos reproduzidos:**
- **I1 (IMPORTANT) — defeito que ESCAPOU da Etapa 49:** o `relatorioSaldoPorLote` agrupava por `l.id`; uma linha de saldo de **outro** material com o `lote_id` do lote de X somava no lote de X (LX 17 e sem lote −7 em X; Y sumia). **A tela estava certa; o relatório errava.** Corrigido: `GROUP BY s.material_id, l.id`. Registrado no retro da Etapa 49.
- **M1:** lote apagado (`lote_id` órfão) — o resumo fazia `JOIN lotes` e o "nunca teve lote" do relatório testava só `s.lote_id IS NOT NULL`. Agora os dois exigem lote **existente**.
- **M2:** arredondamento duplo — o resumo arredondava a soma antes do resíduo; divergia na 7ª casa. Agora a soma crua vai para o resíduo, e só o campo devolvido é arredondado.
- **M3 (tela):** na troca de material, o bloco do anterior ficava à mostra enquanto o novo carregava. Agora o efeito zera o resumo antes do GET.

**Força dos testes — o que o revisor mostrou verde com o código quebrado, e agora fica vermelho:** o critério do lote existente (s3), o arredondamento/EPS (s4), a aba Séries (c1), a guarda `cancelado` (c2), o `reloadToken` (c3). Mais os da própria correção: o agrupamento (i1), o arredondamento duplo (m2) e o M3 — **este exigiu um teste NOVO**: o de "resposta atrasada" já existia e passava sem o conserto, porque a guarda `cancelado` descartava a resposta velha; o M3 é outra janela (**enquanto o novo não responde**).

**Placar:** `lotesResumo` **13/13**, `LotesAlmoxarifado.test` **37/37**, `relatoriosSaldos` 16/16. Sabotagens do fix-round **7/7 vermelhas**. ⚠️ **Uma primeira versão da s3 quebrou a sintaxe do SQL** — ficou vermelha por **erro**, não pela regra, e **não valeu**; refeita com a troca exata, e aí derrubou só o cenário (12), o certo.

## Retro de 4 números — Etapa 50

1. **Rodadas de correção até verde: 1** (Fase 5). Mais a correção do plano na Fase 2, antes do código.
2. **Achados reais:** Fase 2 — 1 IMPORTANT + 3 MINOR; Fase 5 — 1 IMPORTANT + 3 MINOR + 5 lacunas de teste. **Ruído: 0** (o revisor rodou numa worktree com o estado não commitado aplicado).
3. **Paralelismo:** nenhum galho em paralelo (a etapa é pequena e a T2 dependia do contrato da T1). A verificação completa rodou em paralelo com a revisão — e a correção do servidor só entrou depois de os testes terminarem, e a do client só depois do build, para não contaminar a rodada.
4. **Defeito que escapou:** *preencher na Etapa 51.* **Da 49 para cá: 1** — o `GROUP BY l.id` do Saldo por lote (registrado no retro da 49).

## Próxima tarefa detalhada — Etapa 51: medir o saldo por LOCALIZAÇÃO antes de dar tela às "vazias" (feature 02)

**Escolha, pela ordem do CLAUDE.md** (a próxima desta etapa → o que ficou para 🟢 → o mapa). As 🟡 do mapa, **medidas** nesta sessão:

| Feature | O que falta para 🟢 | Depende de |
|---|---|---|
| **02** Localizações | código de endereço gerado, capacidade/peso (fora por decisão do design), sugestão de localização, confirmação por leitura, e a **tela de vazias** | **nada** para a tela; leitura depende de código de barras |
| **05** Separação | lista de separação como entidade, rota de picking | nada, mas é a maior |
| **08** Recebimento | conferência física estruturada (**fora de escopo por decisão do design**), localização na entrada, e-mail de entrada confirmada, pedido que reabre no estorno (**B161**) | decisão (B161) |
| **23** Perfis/auditoria | XLSX e retenção do log, gate ADMIN-only (**B33** metade b), matriz de leitura, `qtd_permissoes` sem gate (**B41, em aberto**) | **decisão sua** (B41, em aberto; o gate ADMIN-only que o mapa chama de "B33 metade b" — a B33 em si está resolvida) |

**Medido hoje, pelo nome do contrato:**
- `GET /api/almoxarifado/localizacoes/vazias` (`routes/almoxarifado/extended.js:2115`) **existe e não tem consumidor nenhum no client** (grep em `client/src` pelo caminho: zero);
- o "sem endereço" **já tem** consumidor: o relatório `materiais-sem-endereco` aparece na tela de Relatórios, que é dirigida pelo registro (o grep pelo nome no client dá zero **porque a tela lê a lista do servidor**, não porque falte — a armadilha da Etapa 24);
- a "ocupação" **já tem** tela: o **Mapa de localizações** (`MapaLocalizacoesAlmoxarifado.js`) mostra *"ocupação e alertas de estoque por localização"*, com `quantidade_total`.

**⚠️ O que a Fase 0 da 51 TEM de medir antes de prometer tela:** a rota de vazias decide "vazia" por `estoque_saldo_almoxarifado.localizacao_id` com `quantidade > 0`, e a Etapa 49 declarou (**D (49)**) que a **confiabilidade do saldo por localização não foi medida**. É o mesmo tipo de armadilha da 49: a entrega de requisição grava na linha **sem lote** — ela grava também **sem localização**? Se sim, uma localização "com 100" pode estar fisicamente vazia, e a tela de vazias **mentiria ao contrário** (esconde a vazia). **Sonda obrigatória:** entrada com localização, entrega de requisição, transferência, ajuste e devolução; comparar `SUM(quantidade) GROUP BY localizacao_id` com o que está de fato em cada endereço.

**Se a sonda confirmar que o saldo por localização é confiável:** a entrega é **chave nova no registro** (`localizacoes-vazias`, categoria *Estoque*, sem tela nova), reaproveitando a query da rota — ou um filtro "só vazias" no Mapa. **Se não for:** a 51 é o **conserto da atribuição de localização** (ou a declaração, como a 49/50 fizeram com o lote, de uma linha "sem localização atribuída"), e a tela de vazias espera.

**Não reabrir:** o saldo global por material é **intencional** (almoxarifado é área física, não filial) — nada de saldo segregado por almoxarifado nem seletor de almoxarifado em movimentação.

**Dependem de você (letra B), e por isso ficam fora da escolha automática:** a **23** (B41 em aberto) e o pedido que reabre no estorno da **08** (B161).

## Estado

- [x] Fase 0 · [x] Fase 1 (`22dd761`)
- [x] Fase 2 (1 IMPORTANT, 3 MINOR — corrigidos antes do código) · [x] T1 · [x] T2 · [x] T3 (`1f335b4`)
- [x] Fase 5 (1 IMPORTANT + 3 MINOR + 5 lacunas; 7/7 sabotagens) · [x] Fase 6 (verificação final medida: `test:api` 227/227 · `test:almoxarifado` 42/42 · validation 4/4 · safealter 3/3 · sqlite 5/5 · client 881/881 em 53 suítes · build `CI=true` limpo)

