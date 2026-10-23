# Etapa 188 — A fila de separação sugere de onde pegar cada item e em que ordem andar

> **Status:** 📝 **plano escrito (2026-10-22), Fase 2 ainda não feita.** Nenhuma task executada. Feature **05** (separação e picking),
> item `specs/modulo-almoxarifado/05-separacao-picking/README.md:63` — *"Sugestão de rota (ordenar itens pela hierarquia de
> localizações)"*.
> Antes: Etapa 187 (ferramenta baixada) — **não tocar** nos arquivos dela (outra sessão revisa a 187 em paralelo). Esta etapa mexe em
> `requisitionService.js` (só `listarFilaSeparacao` e uma função pura nova), num serviço novo e em `FilaSeparacao.js`; a 187 não toca
> nenhum deles.
> Tamanho: **M**. O PDF "Imprimir lista de coleta" e a pré-seleção do "Sai de" na janela de separação ficam para a **Etapa 189** (ver
> "Próxima tarefa detalhada" e **B1257**).

## Objetivo (em linguagem simples)

Hoje a Fila de separação diz **o que** separar ("a separar 5, separável agora 5"), mas não diz **onde está**. O almoxarife abre a
requisição, olha o "Sai de" e procura a prateleira. Só depois de separar a fila mostra "separado de A-01".

Depois desta etapa, cada item da fila mostra **"Pegar em A-01-03 — lote L7 (vence 10/11/2026) · 5 un"**, e cada requisição mostra a
**ordem de coleta**: os endereços na ordem em que se anda pelo almoxarifado (corredor A antes do B, prateleira 2 antes da 10).

É só uma **dica**. Ninguém reserva a prateleira, ninguém trava nada, e a separação continua aceitando outro endereço. Se a dica ficou
velha (alguém tirou o material no meio), a separação recusa como sempre recusou e a fila, recarregada, sugere de novo.

Analogia: é a lista de mercado escrita na ordem dos corredores. Ela não segura o leite na gôndola; só evita voltar duas vezes ao
corredor 1.

## Fase 0 (medido em 2026-10-22, sobre `122d4ca1`)

**A fila (o que muda)**

- `server/services/almoxarifado/requisitionService.js:877` — `listarFilaSeparacao(db, user)`. Uma consulta de requisições, **uma** de
  itens (`:887-898`) e uma de separadores — sem N+1. Os itens saem `ORDER BY ir.requisicao_id, ir.id` (`:898`, comentário "Etapa 127
  (B821): a ordem do pedido, a da divisao"). Essa ordem alimenta `dividirSeparavel` (`:924`, definida em `:285-299`): o primeiro item
  do material leva o que dá, o segundo o que sobra. **B821: essa ordem não pode mudar** — nem a da consulta, nem a do array `itens` da
  resposta. Por isso a ordem de percurso vai num campo **novo** (`ordem_coleta`), e `itens` continua na ordem do pedido.
- A linha do item (`:938-953`) já devolve `origem_separacao_codigo` e `lote_separacao_codigo` (o par planejado **depois** de separar).
- Rota: `GET /api/almoxarifado/fila-separacao` (`server/routes/almoxarifado.js:4546`), gate `requirePermission('separar_emitir')`.
- Tela: `client/src/components/almoxarifado/FilaSeparacao.js` — `descricaoItem` (`:74-89`); o "separado de …" é a `:87`; a linha do item
  é desenhada na `:179`. Teste: `FilaSeparacao.test.js`. Testes de API da fila: `server/tests/api/filaSeparacao.api.test.js` (11
  cenários); a divisão B821: `server/tests/api/separavelDividido.api.test.js` (`[127 RN-10]` a `[127 RN-17]`).

**O que a separação e a entrega já fazem com endereço e lote (para não duplicar)**

- **Etapa 59:** a rodada de separação aceita `localizacao_origem_id` e `lote_id` por item; o par vira a **origem planejada** do item
  (`itens_requisicao_almoxarifado.origem_separacao_id`/`lote_separacao_id`) e a entrega de um clique sai dele.
- A regra única de "este item pode sair deste par" é `checarOrigemItem` (`requisitionService.js:1067-1110`): endereço existe
  (`validarEnderecoExplicito`), não bloqueado (`validarLocalizacaoParaMovimento` → `motivoRecusaEndereco`, `stockService.js:656`:
  `"Localização X está bloqueada"`), lote do material, lote `status = 'ATIVO'`, lote vencido só com vencimento liberado, e o saldo do
  par cobre (a rodada + o separado pendente **desta** requisição no mesmo par). **Endereço inativo não é recusado como origem**
  (`validarEnderecoExplicito` só recusa inativa como destino).
- A régua da divergência (Etapa 60, `:1325-1330`) desconta também o separado pendente de **outras** requisições no mesmo par. A sugestão
  usa essa régua, a mais estrita (ver RN-188.03).
- **Uma origem por rodada por item** (Etapa 60, Fase 2; Etapa 65): rodada com outro par sobre separado pendente **apaga** a planejada e
  **grava troca** em `substituicoes_origem_requisicao` (`momento = 'SEPARACAO'`, `:1341`, `:1429-1450`). Consequência para esta etapa:
  sugerir **dois** endereços para o mesmo item faria o separador que segue a dica gerar uma "substituição" falsa na segunda rodada.
  Decide a **B1254**.
- **Etapa 58/63:** "Sai de" na entrega e substituições na entrega. As opções do "Sai de" (separação e entrega) vêm de
  `GET /api/almoxarifado/estoque/:materialId/saldos` (`server/routes/almoxarifado/extended.js:824`, `stockService.consultarSaldosPorLocalizacao`,
  `:3851`), filtradas na tela (`RequisicoesList.js:126`, `opcoesOrigem`: endereço não nulo e quantidade > 0). Todo par que esta etapa
  sugerir **aparece** nessas opções (mesma fonte: linha de `estoque_saldo_almoxarifado` com endereço e saldo).
- **O motor, sem origem escolhida** (`stockService.js:403` `claimSaldoDoLote` e `:467` `claimSaldoSemLote`): drena
  `ORDER BY (localizacao_id IS <padrão>) DESC, quantidade DESC, id` — **a padrão primeiro, depois a maior**.
- **FEFO já existe** em `lotService.listarLotesDoMaterial` (`server/services/almoxarifado/lotService.js:202-245`): elegíveis primeiro
  (`status = 'ATIVO'` e não vencido ou vencido liberado), depois `data_validade` crescente com nulo por último, depois `codigo`. É o
  seletor de lote da movimentação manual. Vencido pela régua `isVencido` (`:29`, dia de Brasília) e `vencimentoLiberado` (`:160`).

**Busca por sugestão de origem que já existisse:** `grep -i "fefo\|sugest\|origem_sugerida\|validade"` em `requisitionService.js`,
`stockService.js` e nas rotas. Achados: `sugerirLocalizacaoEntrada` (`stockService.js:826`, Etapa 53/68) — sugestão de **destino** para
ENTRADA, não de origem; `reposicao/sugestoes` (compras); FEFO só no `lotService`. **Não existe sugestão de origem para separação.**
Controle positivo da régua: o mesmo grep acha `sugerirLocalizacaoEntrada` e `listarLotesDoMaterial`, que sei que existem.
`lista_separacao`/`ordem_coleta`: zero ocorrências em `server/` e `client/src/`.

**Base de localização**

- `localizacoes_almoxarifado` (`schema.js:598`: `codigo UNIQUE NOT NULL`, `descricao`, `setor`, `ativo`) + `tipo`, `almoxarifado_id`,
  `parent_id` (`schema.js:1432-1434`), `bloqueada` (`:1444`). **Não há coluna de ordem** nem caminho gravado. O código é gerado como
  `<prefixo>-NN` (`localizacaoCodigo.js:17-73`: filhas do mesmo pai incrementam o número do código do pai) — **não é hierárquico por
  si** (a filha de `A-01` pode ser `A-02`). O caminho tem de vir da árvore (`parent_id`).
- `estoque_saldo_almoxarifado` (`schema.js:1489`): `material_id`, `localizacao_id` (pode ser NULL — "sem localização atribuída"),
  `lote_id`, `quantidade`. Retenção **não** mora aqui (comentário `schema.js:1446-1449`): bloqueado/em inspeção são do material, não do
  endereço.
- Áreas especiais (Etapa 68): `AREAS_ESPECIAIS` (`schema.js:34-55`, chaves `QUARENTENA`, `EXPEDICAO`, `SUCATA`, `DEVOLUCOES`,
  `MATERIAIS_CLIENTE`) e a área **efetiva** pela árvore, `resolverAreaEfetiva` (`stockService.js:696`, sobe até o ancestral mais
  próximo que é área; ancestral inativo encerra; guarda de ciclo). A semântica da 68 é **sugestão e aviso, nenhuma recusa**: material
  guardado na quarentena "continua disponível". A sugestão de entrada **não propõe** área especial como vaga comum, exceto área de
  cliente para material de cliente (`vagaComum`, `stockService.js:850-856`). Esta etapa segue o mesmo molde (RN-188.04).

**Trava**

- CLAUDE.md, "Trava por material": pega a trava quem põe saldo no disponível e distribui, quem **lê o disponível para reservar**, ou
  quem lê **para limitar o que outra porta lê para reservar**. A sugestão só **exibe**: não grava, não reserva, não limita porta
  nenhuma (a separação recalcula tudo sob a própria trava, `comTravaDaRequisicao`). **Não pega trava** — nem por material, nem por
  requisição. Pior caso: a dica fica velha e a separação recusa com a literal de sempre (RN-188.07).

### Divergências e achados da Fase 0

1. **A spec diz "ordenar itens pela hierarquia de localizações" — e isso, ao pé da letra, quebraria a B821.** Os itens da fila são a
   ordem da divisão do separável (Etapa 127). A etapa **não** reordena `itens`; a ordem de percurso é o campo novo `ordem_coleta`. O
   fechamento corrige o texto do item da spec (regra 5 do CLAUDE.md: dizer que estava impreciso, não apagar).
2. **Endereço inativo é aceito como origem pela separação** (`validarEnderecoExplicito` só recusa inativa como destino). A sugestão não
   o propõe (o Mapa não o mostra; mandar o separador a um endereço que não está no mapa é a armadilha da Etapa 54). Não é defeito desta
   etapa; registrado na **B1253**, sem mudar a porta.
3. O separado pendente de **outras** requisições no mesmo par entra na régua da divergência mas **não** no `checarOrigemItem`. A
   sugestão usa a régua estrita (desconta os dois). Não muda nenhuma porta.

## Regras

| ID | Regra | Cenário |
|---|---|---|
| **RN-188.01** | Cada item da fila com `separavel > 0` ganha `pegar_em`: **um** par (endereço, lote) — o primeiro, na ordem da RN-188.02, cujo livre cobre o `separavel` do item. Se nenhum cobre sozinho, o primeiro da ordem com livre > 0, com `cobre: false` e `pegar_em_aviso = 'NENHUM_ENDERECO_COBRE'`. Item com `separavel = 0` tem `pegar_em: null` e `pegar_em_aviso: null`. | Material sem lote: A-01 com 3, B-02 com 10, separável 5 → `pegar_em` B-02, quantidade_sugerida 5, `cobre: true`. Separável 12 → B-02, quantidade_sugerida 10, `cobre: false`, aviso `NENHUM_ENDERECO_COBRE`. |
| **RN-188.02** | Ordem de escolha dos pares candidatos (a do motor com FEFO na frente): (1) lote elegível com `data_validade` mais próxima primeiro, lote sem validade e linha sem lote por último (FEFO de `listarLotesDoMaterial`); (2) a localização padrão do material primeiro (o `ORDER BY` do motor); (3) livre maior primeiro; (4) a ordem de percurso da RN-188.05; (5) `localizacao_id`, depois `lote_id` (nulo por último). | Lote L1 vence 10/11 com 6 em C-01; lote L2 vence 20/12 com 9 em A-01; separável 5 → C-01/L1 (FEFO), mesmo A-01 sendo a padrão. Separável 7 → A-01/L2 (L1 não cobre; RN-188.01). |
| **RN-188.03** | Livre do par = saldo da linha (`estoque_saldo_almoxarifado`, endereço e lote) − o separado pendente (`quantidade_separada − quantidade_entregue`, > 0) de **todo** item ativo de **qualquer** requisição ativa planejado no mesmo par (`origem_separacao_id`, `lote_separacao_id IS`). Dentro da **mesma** requisição, itens do mesmo material consomem o livre na ordem do pedido (`ir.id`, a ordem da B821): o segundo item vê o par já descontado do que foi sugerido ao primeiro. Entre requisições diferentes **não** desconta o sugerido (cada uma é separada sozinha). | A-01 com 10; outra requisição separou 4 de A-01 e não entregou → livre 6. Dois itens do mesmo material, separáveis 4 e 4, A-01 livre 6 e B-01 livre 5 → 1º: A-01 4; 2º: A-01 tem 2, não cobre → B-01 4. |
| **RN-188.04** | Nunca é candidato: linha sem endereço (`localizacao_id IS NULL`); saldo ≤ 0 (depois da RN-188.03); endereço `bloqueada = 1`, inativo ou de almoxarifado inativo; endereço em área especial **efetiva** (`resolverAreaEfetiva`) — exceto `MATERIAIS_CLIENTE` para material de cliente (`proprietario_cliente_id` não nulo), o molde `vagaComum` da Etapa 68; lote com `status <> 'ATIVO'`; lote vencido sem vencimento liberado. Se o item tem `separavel > 0` e **nenhum** candidato sobra, `pegar_em: null` e `pegar_em_aviso = 'SEM_ENDERECO_SUGERIVEL'`. | Material com 5 só na área de quarentena e separável 5 → `pegar_em: null`, aviso `SEM_ENDERECO_SUGERIVEL`, e a fila continua dizendo "Separar" (a porta aceita; só não é sugerido). |
| **RN-188.05** | Ordem de percurso: pelo **caminho na árvore**. Caminho = `[código do almoxarifado, código do ancestral raiz, …, código do pai, código do endereço]` (subindo por `parent_id`, guarda de ciclo). Compara segmento a segmento com `localeCompare('pt-BR', { numeric: true, sensitivity: 'base' })`; prefixo vem antes do descendente; endereço sem almoxarifado vai depois dos que têm. Desempate: `localizacao_id`. | `A-2` antes de `A-10`; `ALM1 / A-01` antes de `ALM1 / A-01 / A-03`; `ALM1 / B-01` antes de `ALM2 / A-01`. |
| **RN-188.06** | `ordem_coleta` da requisição: uma parada por item com `pegar_em`, na ordem da RN-188.05 do endereço sugerido; empate (mesmo endereço) pela ordem do pedido (`ir.id`), depois `lote_id`. Item sem `pegar_em` não entra. **`itens` continua na ordem do pedido (B821)** — a resposta não reordena nada que já existia. | Itens do pedido: #1 em B-01, #2 em A-01, #3 em A-01 → `ordem_coleta` = #2, #3, #1; `itens` = #1, #2, #3. |
| **RN-188.07** | A sugestão é **só leitura**: não grava, não reserva, não pega trava, não muda status nem a etapa (`etapas`) nem nenhum campo que já existia. A separação continua decidindo: separar do par sugerido é aceito (a sugestão nunca propõe o que `checarOrigemItem` recusaria, no momento da leitura); separar de outro par continua aceito como antes. | Listar a fila 2× não muda nenhuma linha de nenhuma tabela. Separar o `separavel` do `pegar_em` → 200; o par fica planejado. |
| **RN-188.08** | A tela mostra, por item com `pegar_em`, **"Pegar em ⟨caminho⟩"** (+ " — lote ⟨código⟩", + " (vence DD/MM/AAAA)" quando há validade) **" · ⟨quantidade_sugerida⟩ ⟨un⟩"**; com `cobre: false`, o aviso **"Nenhum endereço tem tudo: pegue ⟨q⟩ aqui e o resto em outro."**; com `SEM_ENDERECO_SUGERIVEL`, **"Sem endereço para sugerir (o saldo está sem endereço, em área especial ou em lote bloqueado/vencido)."** Por requisição com ≥ 2 paradas, a lista **"Ordem de coleta"** numerada. | Ver T3. |

## Contrato (congelado)

`GET /api/almoxarifado/fila-separacao` — **sem mudança** de método, gate (403 de `separar_emitir`), ordem das requisições, ordem e
conteúdo dos campos que existem. Só **acrescenta**:

Em cada elemento de `itens[]`:

```json
"pegar_em": {
  "localizacao_id": 12,
  "localizacao_codigo": "A-03",
  "caminho": "ALM1 / A-01 / A-03",
  "lote_id": 7,
  "lote_codigo": "L7",
  "lote_validade": "2026-11-10",
  "quantidade_no_endereco": 6,
  "quantidade_sugerida": 5,
  "cobre": true
},
"pegar_em_aviso": null
```

- `pegar_em`: objeto acima ou `null`. `lote_id`, `lote_codigo`, `lote_validade` são `null` na linha sem lote. `caminho` são os códigos
  da RN-188.05 unidos por `" / "` (sem almoxarifado: começa no código raiz). `quantidade_no_endereco` = o livre do par pela RN-188.03 **visto por este item**
  (já descontado do que foi sugerido aos irmãos anteriores do mesmo material) — o número que ele pode pegar ali. `quantidade_sugerida = Q.qtd(min(separavel, quantidade_no_endereco))`. `cobre = quantidade_sugerida + 1e-9 >= separavel`.
  Quantidades com `Q.qtd` (6 casas).
- `pegar_em_aviso`: `null` | `"NENHUM_ENDERECO_COBRE"` | `"SEM_ENDERECO_SUGERIVEL"`. Código, não frase: a frase é da tela (RN-188.08).

Em cada requisição (ao lado de `itens`):

```json
"ordem_coleta": [
  { "item_id": 31, "material_codigo": "MAT-9", "localizacao_id": 12, "localizacao_codigo": "A-03",
    "caminho": "ALM1 / A-01 / A-03", "lote_codigo": "L7", "quantidade_sugerida": 5 }
]
```

- Sempre array (vazio quando nenhum item tem `pegar_em`). Ordem da RN-188.06.

Nenhum endpoint novo, nenhuma mensagem de erro nova (a sugestão não recusa nada). Função pura nova, exportada para teste:
`sugestaoDeColeta.sugerirColeta({ itens, candidatosPorMaterial, planejadoPorPar, arvore, material })` — ver T1.

## Tasks

Ordem: **T1 → T2 → (T3 ∥ T4)**. T1 e T2 são tronco (regra nova e a resposta da fila); T3 é galho de tela contra o contrato congelado
acima (mock só na fronteira HTTP); T4 é a integração. T3 e T4 podem rodar em paralelo **em worktrees separadas** só se T4 não sabotar
produção ao mesmo tempo que T3 roda a suíte do client (memória "sabotagem concorrente contamina a suíte": T3 não roda a suíte do server,
então o risco é baixo; ainda assim, rode os controles de T4 depois de T3 commitar).

### T1 (tronco) — a regra pura: candidatos, ordem e escolha

Arquivo novo: `server/services/almoxarifado/sugestaoDeColeta.js`. **Pura** (sem `db`): recebe dados já lidos e devolve
`Map(item_id → { pegar_em, pegar_em_aviso })` e a `ordem_coleta`. Funções exportadas:

- `caminhoDaLocalizacao(arvore, localizacaoId)` → array de códigos (RN-188.05), com guarda de ciclo (molde `resolverAreaEfetiva`).
- `compararCaminho(a, b)` → comparador da RN-188.05.
- `candidatoSugerivel(linha, { arvore, material, hojeISO })` → bool (RN-188.04). Reusa `stockService.resolverAreaEfetiva`,
  `stockService.motivoRecusaEndereco(loc, material, 'origem')` (a mesma régua da porta — se a porta apertar, a sugestão aperta junto),
  `lotService.isVencido` e `lotService.vencimentoLiberado`. **Não** reimplementar o FEFO: a ordem por validade usa a mesma chave do
  `listarLotesDoMaterial` (`data_validade || '9999-12-31'`).
- `sugerirColeta(...)` → RN-188.01/02/03/06.

Teste: `server/tests/api/sugestaoDeColeta.api.test.js` (runner próprio, `test()`, contador, `process.exit`). Cenários, cada um com o
ID no nome:

1. `[RN-188.01] cobre sozinho -> o primeiro que cobre`; `[RN-188.01] nenhum cobre -> o primeiro com livre, cobre false, NENHUM_ENDERECO_COBRE`.
2. `[RN-188.02] FEFO: o lote que vence antes ganha da padrao`; `[RN-188.02] sem lote: a padrao antes da maior`; `[RN-188.02] empate de tudo -> menor localizacao_id`.
3. `[RN-188.03] o separado pendente de outra requisicao no par desconta`; `[RN-188.03] dois irmaos do mesmo material: o segundo ve o par descontado`; `[RN-188.03] requisicoes diferentes nao descontam o sugerido uma da outra`.
4. `[RN-188.04]` um cenário por exclusão: sem endereço, bloqueada, inativa, almoxarifado inativo, quarentena efetiva (pelo pai), área de cliente com material próprio (fora) e com material de cliente (dentro), lote BLOQUEADO, lote vencido, lote vencido **liberado** (dentro); e `tudo excluido -> SEM_ENDERECO_SUGERIVEL`.
5. `[RN-188.05] A-2 antes de A-10; pai antes do filho; sem almoxarifado por ultimo; ciclo em parent_id nao trava`.
6. `[RN-188.06] ordem_coleta pelo caminho, empate pela ordem do pedido; itens fora sem pegar_em`.

**Controles positivos prescritos** (quebrar, ver vermelho, desfazer — com `perl -0pi`, base LF, nunca `\r\n`):
(a) trocar `localeCompare(..., { numeric: true })` por comparação de string crua → `A-2 antes de A-10` tem de ficar vermelho;
(b) tirar o desconto de `planejadoPorPar` → o cenário 3a vermelho; (c) remover o teste de área especial de `candidatoSugerivel` → o de
quarentena vermelho; (d) trocar "primeiro que cobre" por "primeiro da ordem" → `[RN-188.01] cobre sozinho` vermelho (com o FEFO
montado de forma que o primeiro não cubra). Registrar no plano o vermelho de cada um.

### T2 (tronco) — a fila devolve a sugestão

`requisitionService.listarFilaSeparacao`: depois de montar `linhas` (sem tocar na consulta de itens, no `ORDER BY` da `:898` nem em
`dividirSeparavel`), lê **uma vez** para a fila inteira:

1. as linhas de saldo dos materiais da fila com `localizacao_id IS NOT NULL AND quantidade > 0`, com o lote (`codigo`, `status`,
   `data_validade`, `vencimento_liberado_em`);
2. o planejado pendente por par: `SELECT ir.material_id, ir.origem_separacao_id, ir.lote_separacao_id, SUM(MAX(sep − ent, 0))` de
   itens de requisições ativas com `origem_separacao_id` não nulo, agrupado (molde da `:1325-1330`, sem o `requisicao_id <>`);
3. a árvore: `SELECT id, parent_id, codigo, tipo, ativo, bloqueada, almoxarifado_id` + `almoxarifados.codigo, ativo`;
4. `localizacao_padrao_id` e `proprietario_cliente_id` dos materiais (acrescentar à consulta de itens só como **colunas**, sem mudar
   `WHERE`/`ORDER BY`; ou consulta separada — o executor escolhe, mas a ordem da `:898` fica byte a byte).

Chama `sugerirColeta` por requisição e acrescenta `pegar_em`, `pegar_em_aviso` em cada linha e `ordem_coleta` na requisição. Sem N+1:
**quatro** consultas a mais por chamada, não por requisição.

Teste: `server/tests/api/filaSugestaoColeta.api.test.js`, pela rota `GET /fila-separacao` com `testApp.js` (`requirePermission` real):

- `[RN-188.01] material em A-01 (3) e B-02 (10), separavel 5 -> pegar_em B-02 5 cobre`;
- `[RN-188.04] so na quarentena -> pegar_em null, SEM_ENDERECO_SUGERIVEL, etapa continua SEPARAR`;
- `[RN-188.06] tres itens em dois enderecos -> ordem_coleta pelo caminho e itens na ordem do pedido`;
- `[RN-188.07] listar duas vezes nao muda nenhuma tabela` (contagem e `MAX(updated_at)` de requisições, itens, saldos, reservas antes e depois);
- `[B821] a divisao nao mudou`: o cenário `[127 RN-10] C1` (4 livres, dois itens de 4) → `separavel` 4 e 0 **e** `itens` na ordem do pedido, com `pegar_em` só no primeiro;
- `Gate: sem separar_emitir -> 403` (não muda).

**Controles positivos:** (e) mudar o `ORDER BY` da `:898` para `ir.id DESC` → `[B821]` vermelho (e `separavelDividido.api.test.js`
`[127 RN-10]` também — rodar os dois); (f) não acrescentar `ordem_coleta` → `[RN-188.06]` vermelho; (g) passar a ordenar `itens` pela
ordem de coleta → `[RN-188.06]` vermelho na parte "itens na ordem do pedido".

Rodar também, sem mudança esperada: `filaSeparacao.api.test.js`, `separavelDividido.api.test.js`, `separacaoOrigemPorItem.api.test.js`.

### T3 (galho) — a tela

`client/src/components/almoxarifado/FilaSeparacao.js`: abaixo da descrição do item (`:179`), a linha **"Pegar em …"** da RN-188.08
(data pelo `fmtData` que já existe, sem `new Date`); o aviso de `cobre: false` e o de `SEM_ENDERECO_SUGERIVEL` com as frases literais;
por requisição com `ordem_coleta.length >= 2`, a lista **"Ordem de coleta"** (`<ol>`, cada `<li>`: `caminho` — `material_codigo` ·
quantidade, e o lote). Com 1 parada, só a linha do item (a lista repetiria). A ordem dos itens na tela **não** muda.

Teste: `FilaSeparacao.test.js`, com o JSON do contrato (mock na fronteira HTTP): `[RN-188.08]` linha com lote e validade; sem lote;
`cobre false` com a frase; `SEM_ENDERECO_SUGERIVEL` com a frase; ordem de coleta com 2 paradas na ordem do JSON (a tela não reordena);
com 1 parada não aparece a lista; resposta antiga **sem** os campos novos não quebra (não aparece nada novo). **Controles:** (h) tirar
o `>= 2` → o de 1 parada vermelho; (i) trocar a frase → o teste da frase vermelho. Build com `CI=true`.

### T4 — integração pela rota e pelo serviço

`server/tests/api/filaSugestaoColetaIntegracao.api.test.js`:

- **Pela rota (o fluxo inteiro):** cadastrar ALM1 com `A-01` (pai) › `A-03` (filha) e `B-01`; receber o material com **lote** L1
  (vence antes) 6 em `B-01` e L2 9 em `A-03` pela entrada do motor/nota; criar a requisição de 5 (rota de criação); aprovar (rota);
  `GET /fila-separacao` → `pegar_em` = `B-01`/L1, 5, `cobre: true`; `PUT /requisicoes/:id/separacao` com
  `localizacao_origem_id`/`lote_id` do `pegar_em` e quantidade `quantidade_sugerida` → 200; o item fica com
  `origem_separacao_id = B-01`, `lote_separacao_id = L1`; `GET /fila-separacao` de novo → a requisição em ENTREGAR com
  `origem_separacao_codigo = 'B-01'` e o item **sem** `pegar_em` (separável 0); e uma **segunda** requisição do mesmo material agora vê
  `B-01`/L1 com livre 1 (6 − 5 planejados) e recebe `A-03`/L2 para 5 (RN-188.03 pela porta real).
- **Pela rota, dica velha** (cenário novo, banco limpo, mesmo cadastro): depois de listar, uma saída avulsa tira 4 de `B-01`; separar 5 do par sugerido → 400 com a literal de
  sempre de `checarOrigemItem` (`O saldo em B-01 (2) não cobre a quantidade (5) — a saída tiraria de outros endereços`, prefixada pelo
  nome do material); listar de novo → sugere `A-03`. Prova que a sugestão não trava e que a porta continua decidindo (RN-188.07).
- **Pelo serviço:** `requisitionService.listarFilaSeparacao(db, user)` direto, mesmo cenário do primeiro → o mesmo `pegar_em` e a
  mesma `ordem_coleta` que a rota (a sugestão não depende de fiação de rota; a prova é que os dois caminhos coincidem).
- **B821 pela integração:** dois itens do mesmo material de 4 com 4 livres → `separavel` 4 e 0 na ordem do pedido, igual ao
  `[127 RN-10]`; separar 4+0 do sugerido → 200.

**Controle:** (j) fazer `sugerirColeta` ignorar `planejadoPorPar` → a segunda requisição recebe `B-01` (livre 6) e o cenário fica
vermelho.

### Fechamento (skill `fechar-etapa`)

Spec 05 (item da `:63`: marcar `[x]` com os hashes **e corrigir o texto** — "ordenar itens" virou "a ordem de coleta ao lado dos itens,
que continuam na ordem do pedido (B821)"; dizer que o texto estava impreciso), mapa, guia do usuário (seção da etapa, "Antes → Agora",
roteiro clicável, o que **não** cobre: PDF, pré-seleção no "Sai de", combinação de endereços), novidades (letra B abaixo), este plano
(Execução e próxima tarefa).

## Letra B proposta (para `docs/almoxarifado-novidades-por-etapa.md`)

*(B1249 fica livre; a Etapa 188 usa B1250 a B1259.)*

- **B1250 (NOVA, da Etapa 188) — a sugestão de coleta é só de leitura e não pega trava.** Não reserva, não segura endereço, não grava.
  A trava por material é de quem lê o disponível **para reservar** ou para limitar o que outra porta reserva; exibir não é nenhum dos
  dois. A separação continua recalculando tudo sob a trava dela. Pior caso: a dica fica velha e a separação recusa com a frase de
  sempre. **Descartado:** reservar o endereço sugerido (mudaria a reserva, que hoje é global por material, "área física, não filial") e
  pegar a trava na leitura da fila (serializaria a tela mais aberta do almoxarife sem proteger nada). **Reversível.**
- **B1251 (NOVA, da Etapa 188) — o critério: FEFO primeiro, depois o que o motor já faz.** Lote que vence antes primeiro (a régua do
  seletor de lote da movimentação, `listarLotesDoMaterial`); depois a localização padrão; depois o endereço com mais saldo — a ordem em
  que o motor tira quando ninguém escolhe. Assim a dica e o "automático" apontam para o mesmo lugar, exceto quando o FEFO manda outro
  lote. **Descartado:** "o endereço mais perto" (não há distância gravada; só a árvore) e "só o maior" (deixaria o lote vencer).
  **Reversível.**
- **B1252 (NOVA, da Etapa 188) — a ordem de percurso é a da árvore, com número como número.** Almoxarifado, depois cada nível da árvore
  de localizações, comparando `A-2` antes de `A-10`; pai antes do filho; empate pelo id. **Descartado:** ordenar pelo código cru (põe
  `A-10` antes de `A-2`) e por `pos_x`/`pos_y` do mapa (nem toda localização tem desenho). **Reversível.**
- **B1253 (NOVA, da Etapa 188) — nunca é sugerido: sem endereço, bloqueado, inativo, área especial, lote bloqueado/vencido.** Área
  especial pelo mesmo molde da sugestão de entrada (Etapa 68): quarentena, expedição, sucata e devoluções nunca; área de cliente só
  para material de cliente. A porta **continua aceitando** separar dali (a 68 é aviso, não recusa) — só não é a dica. Endereço inativo
  é aceito como origem pela separação hoje; a sugestão não o propõe, e a porta **não muda** nesta etapa. **Descartado:** sugerir a área
  especial com um aviso (mandaria o separador à quarentena quando há material na prateleira comum). **Reversível.**
- **B1254 (NOVA, da Etapa 188) — um endereço por item, nunca a combinação.** Quando nenhum endereço tem tudo, a dica é o primeiro com
  saldo e um aviso "pegue X aqui e o resto em outro". **Por quê:** a separação aceita uma origem por item por rodada, e a segunda rodada
  com outro endereço apaga a planejada e grava uma **substituição** (Etapa 65). Sugerir dois endereços faria quem segue a dica gerar
  troca falsa. **Descartado:** devolver a combinação (fica para quando a separação aceitar mais de uma origem por item sem chamar isso de
  troca). Por isso também "o primeiro que cobre" ganha do FEFO estrito: com o L1 de 2 e o L2 de 10 para 5, a dica é L2. **Reversível.**
- **B1255 (NOVA, da Etapa 188) — o livre do endereço desconta o que já foi separado de lá e não entregue, de qualquer requisição.** É a
  régua da divergência (Etapa 60), a mais estrita das duas da separação. Dentro da mesma requisição, o segundo item do mesmo material vê
  o endereço já descontado do que foi sugerido ao primeiro, na ordem do pedido (B821). Entre requisições, não desconta a dica de uma da
  outra. **Descartado:** descontar a dica entre requisições (a fila de outra pessoa mudaria a minha dica). **Reversível.**
- **B1256 (NOVA, da Etapa 188) — os itens continuam na ordem do pedido; a ordem de coleta é um campo novo.** A spec pedia "ordenar
  itens pela hierarquia"; isso mudaria a divisão do separável (B821). O texto da spec estava impreciso e foi corrigido.
- **B1257 (NOVA, da Etapa 188) — o PDF "Imprimir lista de coleta" e a pré-seleção no "Sai de" ficam para a Etapa 189.** O PDF tem regra
  própria de largura medida (`client/src/utils/pdfTexto.js`, Etapa 186) e merece etapa sua; a pré-seleção muda o que a janela de
  separação grava como planejada por padrão (hoje o padrão é "automático"), que é decisão à parte. Esta etapa fica M.

## Execução

*(vazia — nenhuma task executada.)*

## Próxima tarefa detalhada

**Etapa 189 — "Imprimir lista de coleta" e a dica no "Sai de" da janela de separação.**

1. **PDF da lista de coleta** (galho de tela): botão na Fila de separação, por requisição (e, se couber, das requisições com etapa
   SEPARAR marcadas). Consome **só** `ordem_coleta` e `itens[].pegar_em`/`pegar_em_aviso` deste contrato — nenhum campo novo no server.
   Usar `client/src/utils/pdfTexto.js` (Etapa 186) e as regras de largura medida dela (a coluna "Pegar em" com `caminho` longo quebra
   linha dentro da célula; nada passa da margem). Colunas: nº, caminho, material, lote/validade, quantidade, caixinha de "peguei".
   Itens sem `pegar_em` vão num bloco "Sem endereço sugerido" no fim, com o aviso.
2. **Dica no "Sai de" da janela de separação** (`RequisicoesList.js`, `valorPlanejadaNaSeparacao`/`origensSeparacao`, `:166-200` e
   `:456-473`): a janela não lê a fila; ou o detalhe da requisição passa a trazer `pegar_em` (campo novo em `GET /requisicoes/:id`,
   reusando `sugerirColeta`), ou a tela mostra a dica sem pré-selecionar. **Ponto de atenção:** pré-selecionar muda o padrão de
   "automático" para um par — a rodada grava planejada, e a entrega de um clique passa a sair dali; item com planejada pendente
   **continua** partindo da planejada (Etapa 65, Fase 2, crítico 2) — a dica nunca sobrescreve a planejada.
3. Pontos de atenção herdados: B821 (não reordenar itens), B1254 (um endereço por item), e o teste de "listar não escreve" (RN-188.07)
   tem de continuar verde.
