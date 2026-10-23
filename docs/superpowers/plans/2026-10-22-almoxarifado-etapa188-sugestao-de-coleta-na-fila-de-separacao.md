# Etapa 188 — A fila de separação sugere de onde pegar cada item e em que ordem andar

> **Status:** 📝 **plano escrito (2026-10-22), Fase 2 feita (1 Crítico, 3 Importantes, 5 Menores — ver "Emendas da Fase 2"; aplicar no contrato antes de T1).** Nenhuma task executada. Feature **05** (separação e picking),
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

## Emendas da Fase 2

Revisor fresco, 2026-10-22, sobre `7f08cd90`. Leu o plano, a spec 05, `requisitionService.js` (fila, `dividirSeparavel`,
`checarOrigemItem`, separação e entrega), `stockService.js` (claims do motor, `motivoRecusaEndereco`, `resolverAreaEfetiva`,
`sugerirLocalizacaoEntrada`), `lotService.listarLotesDoMaterial`, `seriesService.mudarStatusSerie`, `caixaSql.js`, `schema.js`,
`RequisicoesList.js` (o "Sai de") e `FilaSeparacao.js`. Duas sondas executadas (scratchpad, prefixo `f2r188-`), contra o código
de hoje, simulando à mão o que a regra do plano sugeriria e fazendo os gestos reais.

**Resultado: 1 Crítico, 3 Importantes, 5 Menores. O contrato muda (um código de aviso novo) — T3 só começa depois de T1 aplicar
a emenda C1 no contrato congelado.**

### C1 (Crítico) — a dica manda trocar a origem de quem já separou parte, e o livro sai errado

**Onde:** RN-188.01/02 não olham a origem **planejada** do item. A separação aceita **uma origem por item** enquanto há separado
pendente: rodada com outro par apaga a planejada (`requisitionService.js:1304-1305` e `:1340-1342`, "mista -> nula") e grava
troca `momento = 'SEPARACAO'` (`:1429-1450`). A janela de separação só parte da planejada quando ela cobre
(`RequisicoesList.js:183-188`); senão abre no automático com o aviso de troca.

**Cenário (sonda `f2r188-sonda1.js`, reproduzido):** padrão P com 20, A com 4, B com 10; item de 6. Rodada 1: 3 de A (planejada A).
A fila mostra separável 3. Pela RN-188.03 o livre de A é 4 − 3 = 1 (não cobre); a padrão P cobre → a dica seria **P**. Seguindo a
dica: rodada 2 de 3 em P → `origem_separacao_id = null`, **uma substituição gravada** (`SEPARACAO`, 3, planejada A, saída P), e a
entrega de um clique de 6 sai automática da padrão: **sistema A 4 / P 14; físico A 1 / P 17.** A B1254 foi escrita para evitar a
troca falsa — e a regra reabre a mesma troca pela segunda rodada. O mesmo vale para o `NENHUM_ENDERECO_COBRE`: a frase "pegue Q
aqui e o resto em outro" é literalmente a segunda rodada de outro par.

**Emenda (caminho reversível, escolhido):**
- **RN-188.01a (nova):** item com planejada pendente (`origem_separacao_id` não nulo e separado − entregue > 0) tem **um** candidato
  só: o par planejado, se for sugerível pela RN-188.04. Livre dele (RN-188.03) ≥ separável → `pegar_em` nele, `cobre: true`.
  Livre > 0 e < separável → `pegar_em` nele com `quantidade_sugerida = livre`, `cobre: false`, aviso **novo**
  `"PLANEJADA_NAO_COBRE"`. Livre ≤ 0 ou par não sugerível → `pegar_em: null`, aviso `"PLANEJADA_NAO_COBRE"` também (a tela diz
  o mesmo). Nunca outro par.
- **Contrato:** `pegar_em_aviso` passa a `null | "NENHUM_ENDERECO_COBRE" | "SEM_ENDERECO_SUGERIVEL" | "PLANEJADA_NAO_COBRE"`.
- **RN-188.08, frases literais:** `PLANEJADA_NAO_COBRE` → **"Já separado de ⟨localizacao_codigo da planejada⟩: o resto não cabe
  lá. Separar de outro endereço troca a origem da separação (a entrega passa a sair automática)."**; `NENHUM_ENDERECO_COBRE` passa a
  **"Nenhum endereço tem tudo: pegue ⟨q⟩ aqui. Separar o resto de outro endereço depois troca a origem da separação."**
- **RN-188.01, nenhum cobre:** a dica é o candidato com **maior livre** (empate pela ordem da RN-188.02), não o primeiro da ordem —
  minimiza o resto que vai virar troca. Registrar na B1254 (descartado: o primeiro do FEFO, que podia sugerir 1 de 10).
- **Testes:** T1 `[RN-188.01a] planejada cobre -> ela`, `[RN-188.01a] planejada nao cobre -> ela, PLANEJADA_NAO_COBRE, nunca outro par`
  (com outro endereço que cobriria — controle: tirar a guarda → vermelho), `[RN-188.01] nenhum cobre -> o de maior livre`. T4 pela rota:
  separar 3 de A, listar → `pegar_em` A com `PLANEJADA_NAO_COBRE`; `substituicoes_origem_requisicao` sem linha nova depois de listar.
  T3: as duas frases novas.

### I1 (Importante) — a B1251 está errada: o automático nunca escolhe lote, e a dica sem a pré-seleção desalinha livro e físico

**Onde:** `stockService.js:467-500` (`claimSaldoSemLote`, "Linha de LOTE nunca é tocada aqui (B204: a entrega não escolhe lote)") e
`:1287-1326` (fluxos internos isentos de `exigeLote`). A B1251 diz "a dica e o automático apontam para o mesmo lugar, exceto quando o
FEFO manda outro lote".

**Cenário (sonda `f2r188-sonda2.js`, reproduzido):** material com `controle_lote`, L1 (vence 10/11) 6 em C, L2 (vence 20/12) 9 na
padrão P. A dica seria C/L1. Separar 5 no automático (o padrão da janela hoje, B1257) e entregar de um clique → **200**, e o saldo
fica L1 6, L2 9 e uma linha **sem lote −5 na padrão**. Para material com lote, a dica e o automático **nunca** concordam. Sem lote,
também divergem quando a padrão não cobre: "o primeiro que cobre" é um endereço só; o motor drena a padrão e completa com o maior.

**Consequência:** com a pré-seleção adiada para a 189, quem segue a dica fisicamente e deixa o "Sai de" no automático faz o
sistema baixar de outro endereço/lote. A dica não piora a porta, mas passa a ser a orientação oficial do separador.

**Emenda:** (1) reescrever a B1251: "o automático não escolhe lote (B204) e, sem lote, divide começando pela padrão; a dica só vale
se o separador a escolher no 'Sai de'". (2) RN-188.08: a linha passa a terminar com **" — escolha este endereço no 'Sai de' ao
separar"** (literal; T3 testa). (3) Guia do usuário, "o que não cobre": separar no automático depois de pegar da dica deixa o
estoque do endereço/lote errado até a Etapa 189. (4) Na "Próxima tarefa detalhada", subir a pré-seleção a item 1 da 189 (ela é o que
torna a dica verdadeira), mantendo a regra "a dica nunca sobrescreve a planejada" (C1).

### I2 (Importante) — a B1255 só desconta o separado que tem origem planejada

**Onde:** RN-188.03 lê `origem_separacao_id`. O separado no automático (planejada nula — o padrão da janela, e o resultado de
qualquer rodada mista) não tem endereço gravado em lugar nenhum: separar não move estoque.

**Cenário:** requisição R1 separa 6 de B-01 no automático (o separador foi à B-01 pela dica); R2 do mesmo material lista a fila e
recebe B-01 com livre 6 — a prateleira está vazia. Não recusa nada (a porta e o separável global continuam certos), mas a dica
mente. **Emenda:** sem mudança de código; a B1255 passa a dizer "desconta o que foi separado **com origem escolhida**; o separado no
automático não tem endereço e não é descontado" e o guia repete no "o que não cobre". Some quando a 189 pré-selecionar.

### I3 (Importante) — material com série: a dica pode mandar para um lote cujas séries não saem

**Onde:** bloquear série (`seriesService.js:357-390`) só muda `series_almoxarifado.status` — não mexe no saldo da linha nem na
retenção do material, então o livre do par e o separável contam a série bloqueada. A entrega com planejada exige séries do **lote
planejado** (`requisitionService.js:1724-1729`: *"a origem da separação não serve mais (as series escolhidas nao sao do lote dela)"*).
O endereço da série não é confiável (`stockService.js:2108` grava a padrão do material na entrada manual), então só o lote serve
de régua.

**Cenário:** material com série e lote; L1 (vence antes) 2 em C, as duas séries BLOQUEADA; L2 5 em A. Item de 2: a dica é C/L1
(FEFO, cobre). Separar seguindo a dica → 200 e planejada C/L1; na entrega não há série EM_ESTOQUE de L1; escolher séries de L2 →
400 com a literal acima, ou troca registrada. **Emenda:** RN-188.03 — para `controle_serie = 1`, o livre do par é limitado também
por `COUNT(series EM_ESTOQUE do material com lote_id IS <lote do par>)` menos o planejado pendente de **todos** os pares desse lote
(o mesmo conjunto da RN-188.03 somado por lote). Uma consulta a mais em T2 (agrupada por material e lote, só dos materiais com série
da fila: **cinco** consultas por chamada). T1: `[RN-188.03] serie: lote com series bloqueadas nao e sugerido`; controle: tirar o
limite → vermelho.

### Menores

- **M1 — RN-188.03 e T2 passo 2 citam "item ativo", e `itens_requisicao_almoxarifado` não tem coluna `ativo`** (`schema.js:627` e os
  ALTER de `:2886-2891`): escrever `ir.ativo` dá `no such column`. E o molde da `:1325-1330` usa `COALESCE(ir.quantidade_entregue,0)`,
  sem o legado `quantidade_atendida` que `getEntregue` (`requisitionService.js:38`) e `caixaSemReservaSql` (`caixaSql.js:36`) usam.
  **Emenda:** T2 usa `MAX(COALESCE(ir.quantidade_separada,0) - COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0), 0)` e
  `COALESCE(r.ativo,1) = 1 AND r.status IN (STATUS_COM_CAIXA)` (a régua da caixa), não "item ativo".
- **M2 — a frase de `SEM_ENDERECO_SUGERIVEL` omite endereço bloqueado e inativo**, que a RN-188.04 também exclui. **Emenda:**
  "Sem endereço para sugerir (o saldo está sem endereço, em endereço bloqueado ou inativo, em área especial ou em lote
  bloqueado/vencido)."
- **M3 — a padrão em área especial deixa de ser sugerida**, e na Etapa 68 a padrão não passa pelo filtro de área
  (`stockService.js:845`, "A PADRAO nao passa por aqui"). Material próprio com padrão numa área de expedição nunca recebe dica
  na padrão. Aceitável (a dica de origem é outra pergunta que a de destino), mas a B1253 tem de dizer que diverge do molde da 68
  nesse ponto.
- **M4 — requisição em `APROVACAO_VALOR` recebe "Pegar em"** (o separável é > 0, só a alçada barra). Emenda: T2 devolve `pegar_em:
  null` e `ordem_coleta: []` quando `bloqueioValor` (aviso `null`) — a tela não manda andar para separar o que o separar recusa com 403.
- **M5 — `caminho` não é o rótulo do "Sai de"** (`RequisicoesList.js:125`: `codigo — lote L (q)`) nem o `endereco_completo` da
  Etapa 53 (que inclui setor). O separador lê "ALM1 / A-01 / A-03" e procura "A-03" na lista. Emenda T3: "Pegar em ⟨localizacao_codigo⟩
  (⟨caminho⟩)" quando o caminho tem mais de um segmento; a frase literal da RN-188.08 muda junto.

### As quatro perguntas

1. **Contrato:** cobre os casos de hoje, mas faltava o do item com planejada pendente (C1, código novo) e as frases precisam das
   emendas C1/I1/M2. O JSON bate com o que o código produziria: o par vem de uma linha de `estoque_saldo_almoxarifado` (índice único
   `(material, localizacao, lote)`, `schema.js:1165`), `Q.qtd` já existe, `itens` filtrado continua contendo todo item com
   separável > 0 (ele tem `a_separar > 0`). A literal da dica velha em T4 confere com `checarOrigemItem:1102-1104` mais o prefixo
   `${material_nome}: ` da `:1335`. A saída avulsa de T4 é de material com lote: tem de mandar `lote` (rota manual declara `exigeLote`).
2. **RN × spec/B821/65/68:** B821 preservada (a ordem da `:898` e de `itens` não muda; `ordem_coleta` é campo novo) — a correção
   B1256 da spec 05 (`README.md:63`) está **certa**. Etapa 65: furada pela C1. Etapa 68: segue `vagaComum` (`stockService.js:850-853`),
   com a ressalva M3. B1251 errada (I1).
3. **Independência:** T1 → T2 tronco de verdade; T3 só depende do contrato (mock na fronteira) e não lê regra do servidor — galho
   legítimo, **depois** de o contrato emendado (C1) ser congelado de novo; T4 depende de T2. Sem conflito de arquivo com a 187.
4. **Até o último gesto:** fila → separar do sugerido (aceito: a régua da dica é mais estrita que `checarOrigemItem`, que só desconta
   o pendente desta requisição) → planejada gravada → entrega de um clique sai dela (`:1714-1718`). Quebra em três pontos: (i) a
   segunda rodada de outro par (C1, reproduzido); (ii) separar no automático depois de seguir a dica (I1, reproduzido; I2);
   (iii) séries do lote (I3).
   - **(a)** A tabela é `itens_requisicao_almoxarifado` (`origem_separacao_id`, `lote_separacao_id`, separado − entregue). Descontar
     todas as requisições, a própria incluída, é o certo: `checarOrigemItem` semeia o pendente da própria (`:1236-1244`) e a régua da
     divergência soma o das outras (`:1323-1327`); a dica nunca propõe o que a porta recusa. Ver M1 e I2.
   - **(b)** Série: I3. Inteiro: o saldo de material com série é inteiro e `min(separavel, livre)` também.
   - **(c)** Dono: mora no **material** (`schema.js:1374`), e o saldo é por `material_id` — só aparecem endereços do mesmo dono por
     construção; a regra de `MATERIAIS_CLIENTE` é a da 68. Sem achado.
   - **(d)** Desempenho: 3 consultas de hoje + 1 `avaliarRequisicaoValor` por requisição com alçada (já existia) + **4** novas (5 com
     a I3), por chamada. A função pura deve memoizar o caminho por `localizacao_id` (um `Map`), senão sobe a árvore por candidato.
   - **(e)** Leitura sem trava: aceitável pelo CLAUDE.md — exibir não reserva nem limita o que outra porta lê para reservar; a
     separação relê tudo sob `comTravaDaRequisicao`. As quatro leituras não são um retrato único; o pior caso é a dica velha que a porta
     recusa (T4).

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
