# Etapa 72 — a solicitação de compra que fecha quando o material dela chega, não na primeira nota (feature 18, com a 08)

> Status: **PLANO (Fases 0 e 1 feitas, 2026-10-02).** Próximo passo: Fase 2 (revisão do plano por agente fresco), depois
> T0 → T1 → T2 (tronco), T3 (galho) em paralelo à T2 depois da T1, T4 (integração), T5 (fechamento).
> Feature 18 (reposição), com a 08 (o gancho mora no recebimento). Origem: "Próxima tarefa detalhada — Etapa 72" de
> `docs/superpowers/plans/2026-10-01-almoxarifado-etapa71-pedido-reabre.md:651-691`. Decisão revogada (em parte):
> **B22(a)** (`docs/almoxarifado-novidades-por-etapa.md:1552-1563`, "fecha na primeira nota, mesmo parcial") e a
> metade "a solicitação fica `RECEBIDA`" da **B334/D6** da Etapa 71.

**Escopo desta etapa:** a solicitação de compra do almoxarifado (`solicitacoes_compra_almoxarifado`) vinculada a um
pedido deixa de virar `RECEBIDA` na **primeira** nota processada do pedido. Ela fecha quando **o material dela** está
completo no pedido, ou quando o que chegou desse material já cobre o que ela pediu. Enquanto não fecha, ela continua
`VINCULADO` e entra no "a caminho" da sugestão de reposição **só pelo que ainda falta chegar**, sem contar de novo o que
já entrou. Pedido encerrado (recebido, cancelado ou rejeitado) não traz mais nada. O `verificar-minimos` passa a não abrir
uma segunda solicitação para material que já tem compra vinculada a um pedido em andamento. O estorno da entrada (Etapa 71)
**reabre** a solicitação que a entrada estornada tinha fechado. A aba Solicitações da tela de Reposição mostra
"chegou X de Y". **Fora:** máquina de estados da requisição (`AGUARDANDO_COMPRA`, C116), o teto do "a caminho" pelo saldo
do pedido (B344), o backfill das solicitações fechadas cedo no passado (B349, consulta A36), qualquer linha do módulo
Compras. Detalhes em "O que fica de fora".

**Toque em Compras (declarado):** **nenhuma linha** de `server/routes/compras.js` ou `server/services/compras/*` muda.
A etapa **lê** `pedidos_compra.status` e `itens_pedido_compra` (`material_id`, `quantidade`, `quantidade_recebida`, esta
última criada pelo `schema.js` do almoxarifado na Etapa 37) e escreve só em `solicitacoes_compra_almoxarifado`, que é
tabela do almoxarifado.

## Fase 0 — medido (2026-10-02)

Réguas testadas contra caso conhecido antes de medir ausência: `grep -rn "solicitacoes_compra_almoxarifado" server
--include=*.js` (fora de `tests/`) acha **18** linhas em 6 arquivos (entre elas `purchaseService.js:27,115,194,230,238`,
`reportService.js:495`, `requisitionStateMachine.js:137`, `pedidoCompraService.js:249`). Ou seja, a régua enxerga quem
lê a tabela. `grep -rn "recebida_em"` acha só a escrita (`purchaseService.js:116`) e o `safeAlter`
(`schema.js:2269`). **Nenhum leitor**.

### 1. Quem fecha a solicitação, e quando

| Onde | O que faz |
|---|---|
| `purchaseService.js:113-126` `fecharSolicitacoesDoPedido(db, user, pedidoCompraId)` | `UPDATE ... SET status = 'RECEBIDA', recebida_em = CURRENT_TIMESTAMP WHERE pedido_compra_id = ? AND status = 'VINCULADO' RETURNING id` + auditoria `RECEBIDA` por linha (`dados_novos: { pedido_compra_id }`). **Não olha material nem quantidade** |
| `receiptService.js:1714` (fim de `processarNota`) e `:1761` (fim de `concluirAprovacaoDireta`) | os dois chamadores, cada um com `try/catch` próprio e não-fatal, **depois** de `darEntradaEstoque` (que já somou `itens_pedido_compra.quantidade_recebida`, `:1506-1508`) |
| `purchaseService.js:46` `STATUS_TERMINAIS = ['RECEBIDA','CANCELADA']` | lido por `vincularPedidoCompra` (`:55`) e `cancelarSolicitacao` (`:87`): os dois recusam terminal com literal própria |
| `pedidoCompraService.js:245-251` `liberarSolicitacoesDoPedido` | apagar o pedido devolve a solicitação para `PENDENTE`, **exceto** `RECEBIDA`/`CANCELADA` |

**Resposta à pergunta 1 do handoff:** sim, a solicitação vira `RECEBIDA` **na primeira nota, parcial ou não, e mesmo
quando o material dela nem chegou** (sonda, cenário C abaixo). Era decisão consciente da Etapa 14 (**B22(a)**: "5 de 20
entregues já fecham; o que faltar reaparece na sugestão"). O motivo do descarte da época, "exigiria amarrar item de nota
a solicitação (vínculo que o schema não tem)", **deixou de valer na Etapa 37**. Desde ela, `itens_pedido_compra` tem
`material_id` e o acumulador `quantidade_recebida`, que o estorno da 71 também desconta. A ligação passa pelo **material**
dentro do pedido (`solicitacao.pedido_compra_id` + `solicitacao.material_id` → linhas do pedido daquele material).

### 2. Quem lê o status

| Leitor | Lê | Efeito de `RECEBIDA` cedo |
|---|---|---|
| `calcularSugestoes` `a_caminho` (`purchaseService.js:229-232`) | `SUM(sc.quantidade)` de `PENDENTE`/`VINCULADO` dentro do horizonte | o que ainda vem **some**. A sugestão manda comprar de novo |
| `a_caminho_vencido` (`:238-240`) | idem, fora do horizonte | idem |
| `contextoMaterial.solicitacoes_abertas` (`:192-196`) | `PENDENTE`/`VINCULADO` | o painel "Ver contexto" diz que não há compra aberta |
| `relatorioSolicitacoesCompraPendentes` (`reportService.js:493-498`) → aba Solicitações (`ReposicaoAlmoxarifado.js:836-850`) | `PENDENTE`/`VINCULADO` | a linha some da aba |
| `verificarEstoqueMinimo` dedupe (`purchaseService.js:26-28`) | **só `PENDENTE`** | abre solicitação nova. **E já abria antes de qualquer nota** (Surpresa 1) |
| `calcularStatusPosAprovacao` (`requisitionStateMachine.js:136-140`) | **só `PENDENTE`** | requisição sem saldo com compra **vinculada** vai para `AGUARDANDO_ESTOQUE`, não `AGUARDANDO_COMPRA` (Surpresa 3, **fora**) |
| `vincularPedidoCompra` / `cancelarSolicitacao` | `STATUS_TERMINAIS` | `RECEBIDA` não re-vincula nem cancela |
| `liberarSolicitacoesDoPedido` | exclui `RECEBIDA`/`CANCELADA` | `RECEBIDA` não volta à fila |

**`RECEBIDA` não é terminal por nenhuma outra razão além da Etapa 14.** O único escritor é o gancho, e ninguém lê
`recebida_em`. Então reabrir no estorno (RN-08) é seguro: os três gestos que recusam terminal continuam recusando o que
estiver `RECEBIDA` no momento.

**A armadilha de "só manter `VINCULADO`":** o `a_caminho` soma `sc.quantidade` **inteira**. Se a solicitação de 10
ficasse `VINCULADO` depois da nota de 4, a posição seria `disponível 4 + a caminho 10 = 14`, e os 4 que chegaram
contariam **duas vezes**. Com consumo no meio (recebe 9 de 10, consome 9), a posição ficaria 10 com só 1 a caminho, e a
sugestão **esconderia** a falta. Por isso o fechamento por material vem **junto** com a troca do `a_caminho`
(RN-05), na mesma task (T1). Separadas, a primeira entregaria um defeito novo.

### 3. O estorno da Etapa 71

`estornarEntradaNoPedido` (`receiptService.js:2249-2348`) desconta a linha (`:2273`), reabre o **pedido** quando a régua
deixa de fechar (`:2287-2297`) e devolve `pedido_compra`. **Não toca a solicitação** (D6/B334 da 71, pela Surpresa 4
dela: "reabrir a solicitação no estorno não teria critério"). Com o fechamento por material, **o critério passa a existir**:
a solicitação fechou porque o material completou, e o estorno faz a conta deixar de fechar. Sonda, cenário B:
depois do estorno a solicitação **continua `RECEBIDA`** com a linha do pedido em 0.

### 4. A régua do "completo"

`SOMA_POR_PEDIDO_SQL` (`receiptService.js:1921-1930`) já agrega **por (pedido, material)** no nível interno
(`total_material`, `recebida_material`, `material_id IS NOT NULL`) antes de somar por pedido, e `SQL_PEDIDO_COMPLETO`
(`:1938-1940`) é "pedida > 0 e saldo por material ≤ `EPSILON_DIVERGENCIA`". **"O pedido completa o material da
solicitação" é exatamente o nível interno dessa régua**, recortado a um material. É implementável com o que existe, sem
coluna nova. **Mas** `purchaseService` não pode requerer `receiptService` (ciclo: `receiptService.js:12` requer
`purchaseService` no topo). → **T0 extrai o nível por material para um módulo próprio** que os dois requerem, para não
escrever uma segunda régua.

### 5. Os testes que prendem o fechamento de hoje

| Teste | Prende | Com a regra nova |
|---|---|---|
| `solicitacaoCicloVida.api.test.js` (5), (5b), (6), (6b), (7a) | `RECEBIDA` depois de receber **o pedido inteiro** (`criarRecebimento` sem `itens` copia as linhas) | **verde sem edição**. O material completa (RN-01 metade positiva) |
| idem (I-1) | `fecharSolicitacoesDoPedido` chamado direto num pedido **sem linhas** fecha as duas | **verde sem edição** pela RN-04 (legado: material sem linha no pedido fecha na nota) |
| idem (7a) e `integracaoComprasJornada` passo 4 | solicitação de 100/20 com pedido de 5 **segura a posição inteira** enquanto `VINCULADO` | **verde sem edição**: o `a_caminho` novo é `Σ solicitado − Σ recebido` sem teto pelo pedido (B344) |
| `integracaoComprasJornada` passos 6-7 | nota de 5 de 5 → `RECEBIDA` → volta à sugestão com 15 | **verde**: o material completou no pedido |
| `recebimentoAvisoEntradaIntegracao` `:253-254` | `RECEBIDA` depois de 7 de 7 | **verde** |
| `compraContextoMaterial` (6) | `RECEBIDA` fora de `solicitacoes_abertas` | **verde** (fixture direta) |

**Nenhum teste existente prende o fechamento na nota PARCIAL.** O guia do usuário prende, em texto
(`docs/almoxarifado-guia-etapas-e-testes.md:3626`: *"Vale também para entrega parcial: a primeira nota fecha"*), e a spec
22 também (`specs/modulo-almoxarifado/22-integracoes/README.md:325-326`). Os dois mudam no fechamento **dizendo** que a
regra mudou.

### 6. O que a spec 18 diz, e onde está errada

`specs/modulo-almoxarifado/18-reposicao-estoque-minimo/README.md:110-113` ("O que ficou de fora") ainda afirma
*"Fechar/cancelar solicitação no recebimento — o módulo Compras não tem o elo por material ... não existe cancelamento
(B14)"*, e o cabeçalho (`:4-6`) repete. **Está errado desde a Etapa 14** (`110d8ce`: `RECEBIDA` automática e `CANCELADA`
manual). O mapa (`specs/modulo-almoxarifado/README.md:1336`) já risca o item, mas a spec da feature nunca foi corrigida.
A tabela de regras (`:101`) diz *"Vincular pedido fecha a solicitação (status VINCULADO)"*, outra frase que mistura
vincular com fechar. **A correção da spec é parte da T5** (regra 5 do CLAUDE.md), dizendo que estava errada.

### Sonda executada (scratchpad `sonda72-parcial.js`, harness real, pelas rotas)

Material com mínimo 10, saldo 0, máxima 0, fornecedor; tudo pelas rotas (`verificar-minimos`, `POST /api/compras/pedidos`
com `solicitacao_id`, recebimento pelas seis portas, `/movimentacoes/:id/cancelar`, `GET /reposicao/sugestoes`,
`GET /compras/contexto-material/:id`, `GET /relatorios/solicitacoes-compra`):
```
A0 sugestao antes de tudo                     {"a_caminho":0,"disponivel":0,"posicao":0,"sugerida":10}
A1 verificar-minimos (1a)                     [{"material_id":1,"solicitacao_id":1,"quantidade":10}]
A2 sugestao com PENDENTE                      "NAO SUGERIDO"
A3 solicitacao                                {"id":1,"status":"VINCULADO","quantidade":10,"pedido_compra_id":1}
A4 sugestao com VINCULADO                     "NAO SUGERIDO"
A5 verificar-minimos com VINCULADO (sem nota) [{"material_id":1,"solicitacao_id":2,"quantidade":10}]   <- Surpresa 1
A6 nota de 4 processada; saldo                4      pedido "pendente", linha recebida 4
A6 solicitacao apos nota PARCIAL              {"id":1,"status":"RECEBIDA",...,"recebida_em":"2026-10-02 03:13:37"}
A7 sugestao apos nota parcial                 {"a_caminho":0,"disponivel":4,"posicao":4,"sugerida":6}  <- compra de novo os 6
A7 contexto-material solicitacoes_abertas     []
A8 verificar-minimos apos nota parcial        [{"material_id":1,"solicitacao_id":3,"quantidade":10}]   <- compra 10 de novo
A9 relatorio solicitacoes-compra              ["3:PENDENTE"]   (a solicitacao 1 sumiu da aba)
B1 estorno da nota de 4                       200, pedido_compra.situacao PARCIAL -> ABERTO, saldo 10
B1 solicitacao apos estorno                   {"id":1,"status":"RECEBIDA",...}   linha recebida 0
C  pedido X(5)+Y(5), sol X e sol Y vinculadas, nota so de X (5)
C2 sol X                                      RECEBIDA
C2 sol Y (nada de Y chegou)                   RECEBIDA          <- Surpresa 2
C3 sugestao Y                                 {"a_caminho":0,"disponivel":0,"posicao":0,"sugerida":5}
D  requisicao sem saldo: PENDENTE -> AGUARDANDO_COMPRA; VINCULADO -> AGUARDANDO_ESTOQUE   <- Surpresa 3
```
**O defeito reproduz pelas rotas:** depois da nota de 4 de 10, a sugestão manda comprar 6 (o que ainda vem pelo
pedido) e o `verificar-minimos` abre solicitação de 10.

### Surpresas da medição

1. **O `verificar-minimos` duplica antes de qualquer nota (defeito anterior, da Etapa 14).** O dedupe olha só `PENDENTE`
   (`purchaseService.js:27`). Assim que o comprador gera o pedido (`VINCULADO`), o material continua abaixo do mínimo e
   a próxima verificação abre **outra** solicitação da mesma quantidade (A5). A sugestão nova não tem esse defeito
   (`a_caminho` conta `VINCULADO`), só o legado. Corrigido nesta etapa (RN-07, C114).
2. **A solicitação de um material que NÃO chegou também fecha.** Pedido X+Y, nota só de X: a de Y vira `RECEBIDA` (C2) e
   Y volta inteiro à sugestão com 5 a comprar, com o pedido de 5 ainda em aberto. É o mesmo defeito em versão pior: não
   é "parcial", é "nada". Corrigido pela RN-02 (C115).
3. **Requisição com compra VINCULADA cai em `AGUARDANDO_ESTOQUE`** (D2): `calcularStatusPosAprovacao` conta só
   `PENDENTE` (`requisitionStateMachine.js:136-140`). Assim que o comprador gera o pedido, uma requisição nova do
   material sem saldo é aprovada como "aguardando estoque" em vez de "aguardando compra". **Fora desta etapa** (C116): é a
   máquina de estados da requisição, e o candidato natural da Etapa 73 ("requisição `AGUARDANDO_COMPRA` liberada quando o
   material chega") mexe no mesmo lugar.
4. **A spec 18 está errada desde a Etapa 14** (Fase 0 §6), e a regra B22(a) dizia que o fechamento por quantidade
   "travaria solicitação aberta para sempre em pedidos que nunca completam". **Medido:** o pedido que nunca completa é
   encerrado pelo comprador (`PATCH .../status` para `cancelado`/`recebido`, auditado desde a 71). A RN-06 trata esse
   pedido como "não traz nada". E o horizonte de 60 dias continua cortando a solicitação velha do `a_caminho`
   (`purchaseService.js:232`). O medo da B22 tem saída nos dois casos.
5. **O estorno da 71 não tocava a solicitação** (B1), o que estava certo com o fechamento da época, sem critério. Com o
   fechamento por material, o estorno da entrada que completou o material tem de reabrir, senão o defeito volta pelo
   estorno: a solicitação fica `RECEBIDA` com o material faltando.

## Decisões reversíveis (letra B do documento de novidades; última usada: B342)

- **D1 (B343) — a solicitação `VINCULADO` fecha (`RECEBIDA`) quando, para o material dela no pedido vinculado, (a) o
  pedido completa o material** (Σ pedida do material > 0 e Σ pedida − Σ recebida ≤ `EPSILON_DIVERGENCIA`, o nível por
  material da régua única) **OU (b) o que chegou do material cobre o que as solicitações dele pediram** (Σ recebida do
  material no pedido ≥ Σ `quantidade` das solicitações `VINCULADO` daquele (pedido, material) − epsilon). Todas as
  solicitações do mesmo (pedido, material) fecham juntas. Revoga a **B22(a)**. Descartados: (a) **fechar na primeira
  nota** (o defeito); (b) **fechar quando o pedido INTEIRO completa** (a solicitação de X ficaria aberta esperando Y,
  sem nada de X a caminho; e pedido com linha de texto livre não completa nunca); (c) **só a condição (a)** (solicitação
  de 10 num pedido de 15 com 12 recebidos ficaria aberta com o pedido dela atendido); (d) **vínculo item de nota ↔
  solicitação** (coluna nova sem necessidade: o material dentro do pedido já é a chave).
- **D2 (B344) — o "a caminho" de uma solicitação `VINCULADO` é `MAX(0, Σ solicitado − Σ recebido do material no pedido)`
  por (pedido, material), sem teto pelo saldo do pedido.** `PENDENTE` continua contando `quantidade` inteira. Descartado:
  **teto pelo saldo do pedido** (`MIN(..., pedida − recebida)`). Seria mais fiel quando o comprador pede menos do que a
  solicitação (100 pedidos, 5 comprados), mas muda o que (7a) da Etapa 14 e o passo 4 da jornada prendem ("o `VINCULADO`
  segura a posição inteira") e é uma regra de negócio diferente (a sugestão passaria a pedir o complemento do que o
  comprador escolheu não comprar). Registrado como evolução possível.
- **D3 (B345) — pedido encerrado não traz nada.** Para `pedidos_compra.status` (minúsculo) em `recebido`, `cancelado` ou
  `rejeitado`, o `a_caminho` das solicitações `VINCULADO` dele é **0** e elas **não** seguram o dedupe do
  `verificar-minimos`. A solicitação **não é fechada** por isso: continua `VINCULADO` na aba, marcada "pedido encerrado"
  (RN-10), e o comprador cancela ou re-vincula. Mesma lista de "status decidido" da decisão 5 de `fecharPedidosCompletos`
  (`receiptService.js`, Etapa 42). Descartados: (a) **fechar a solicitação quando o comprador encerra o pedido**
  (gancho no `PATCH` do Compras, que esta etapa não toca); (b) **cancelar em cascata** (B22(b) da Etapa 14); (c)
  **ignorar o status** (o pedido cancelado com entrega parcial seguraria a posição por 60 dias, regressão em relação a
  hoje, que fecha na primeira nota).
- **D4 (B346) — material da solicitação sem linha no pedido vinculado: regra de hoje.** Fecha na primeira nota processada
  do pedido, e o `a_caminho` conta `quantidade` inteira enquanto `VINCULADO`. O caso existe porque o `vincular-pedido`
  manual não exige que o pedido tenha o material, e linhas de texto livre têm `material_id NULL`. Descartados: (a) **nunca
  fechar** (ficaria eterna até o horizonte); (b) **fechar quando o pedido inteiro completa** (pedido só de texto livre tem
  total 0 na régua e nunca completa).
- **D5 (B347) — o `verificar-minimos` deduplica contra `PENDENTE` e contra `VINCULADO` de pedido vivo** (D3), sem
  horizonte (o legado nunca teve) e sem complemento (complemento é papel da sugestão, D10 da Etapa 11). Corrige a
  Surpresa 1. Descartado: deduplicar contra "aberta com `a_caminho` > 0" (uma `VINCULADO` com tudo recebido e pedido
  ainda aberto já fechou pela D1(b), então o caso não existe na prática).
- **D6 (B348) — o estorno reabre a solicitação.** Dentro do gancho da 71 (`estornarEntradaNoPedido`), **depois** da
  reabertura do pedido: para o (pedido, material) da linha descontada, as solicitações `RECEBIDA` voltam a `VINCULADO`
  (`recebida_em = NULL`) quando a condição da D1 deixou de valer **e** o pedido está vivo depois do passo do pedido. Uma
  trilha `REABERTA` por solicitação. Não-fatal (try próprio). Revoga em parte a **B334/D6** da 71. Descartados: (a)
  **gancho separado no motor** (o estorno já chama um gancho só, que conhece a linha e o pedido); (b) **reabrir com o
  pedido encerrado** (com a D3 ela não contaria nada, e só sujaria a aba); (c) **reabrir a `CANCELADA`** (decisão humana,
  nunca).
- **D7 (B349) — sem backfill automático.** As solicitações que a regra antiga fechou cedo continuam `RECEBIDA`. A
  consulta **A36** lista quais e traz o `UPDATE` pronto para quem decidir reabrir. Descartado: migração no boot (escrita
  em produção sem ninguém olhar, sobre dado que o comprador pode já ter resolvido com outra solicitação).
- **D8 (B350) — a requisição (`AGUARDANDO_COMPRA` × `VINCULADO`, Surpresa 3) fica fora.** Vira C116 e o primeiro item
  da próxima tarefa detalhada. Descartado: trocar `status = 'PENDENTE'` por `IN ('PENDENTE','VINCULADO')` aqui. É uma
  linha, mas muda o status em que requisições nascem, e a Etapa 73 vai mexer na mesma regra.
- **D9 (B351) — T0 extrai o nível por material da régua do pedido para um módulo próprio**
  (`server/services/almoxarifado/pedidoCompraSaldoSql.js`). `receiptService` passa a montar `SOMA_POR_PEDIDO_SQL` em
  cima dele, e `purchaseService` o requer sem ciclo. Descartado: escrever a soma por material de novo em
  `purchaseService` (a segunda régua, exatamente o que a Etapa 71 corrigiu no fechamento do pedido).

## Regras de negócio

- **RN-01 (nota parcial não fecha)** — solicitação de 10 vinculada a pedido de 10 do material; nota de 4 processada →
  continua `VINCULADO`, `recebida_em NULL`, **sem** trilha `RECEBIDA`. *Metade positiva:* nota de 6 → `RECEBIDA`, trilha
  `RECEBIDA` com `dados_novos.regra = 'MATERIAL_COMPLETO'`. Pelo `/processar` **e** pelo `/aprovar` direto.
- **RN-02 (só a do material que chegou)** — pedido X(5)+Y(5), solicitação de X e de Y vinculadas; nota só de X (5) → X
  `RECEBIDA`, Y `VINCULADO`. *Positiva:* nota de Y (5) → Y `RECEBIDA`.
- **RN-03 (o que ela pediu chegou)** — solicitação de 10, pedido de 15, notas de 12 (em duas: 7 + 5) → depois da de 7
  `VINCULADO`; depois da de 5 `RECEBIDA` com `regra = 'SOLICITADO_RECEBIDO'`, com o pedido ainda `PARCIAL` (3 faltando).
  *E* duas solicitações (6 + 4) do mesmo material no mesmo pedido de 10: nota de 6 → as duas `VINCULADO` (6 < 10); nota
  de 4 → as duas `RECEBIDA`, duas trilhas.
- **RN-04 (legado sem linha)** — solicitação vinculada a pedido sem linha do material dela → a primeira nota processada
  do pedido a fecha (`regra = 'SEM_LINHA_NO_PEDIDO'`), como hoje. O (I-1) da Etapa 14 continua verde sem edição.
- **RN-05 (a caminho é o que falta)** — mínimo 15, solicitação de 10 vinculada, pedido de 10, nota de 4 → a sugestão traz
  o material com `a_caminho: 6` (**não** 10, e **não** 0), `disponivel: 4`, `posicao: 10`, `quantidade_sugerida: 5`.
  *E* com mínimo 10 o material **não** é sugerido (4 + 6 cobre). O mesmo para `a_caminho_vencido` fora do horizonte.
- **RN-06 (pedido encerrado não traz nada)** — com a nota de 4 do RN-05, o comprador marca o pedido `cancelado`
  (`PATCH /api/compras/pedidos/:id/status`) → `a_caminho: 0`, `quantidade_sugerida: 11`. O mesmo com `recebido` à mão e
  com `rejeitado`. *Positiva:* `enviado`/`aprovado`/`pendente`/`em_analise` continuam contando.
- **RN-07 (verificar-minimos não duplica o que está vindo)** — material abaixo do mínimo com solicitação `VINCULADO` a
  pedido vivo → `criadas: []`. Também depois da nota parcial. *Positiva:* com o pedido `cancelado` → abre a nova.
  `PENDENTE` continua deduplicando (comportamento antigo).
- **RN-08 (o estorno reabre)** — solicitação de 10, pedido de 10, nota de 10 → `RECEBIDA` → estorno da entrada pela
  rota → `VINCULADO`, `recebida_em NULL`, trilha `REABERTA`, resposta com `pedido_compra.solicitacoes_reabertas: [id]`,
  e a sugestão volta a contar `a_caminho: 10`. Nova nota de 10 → `RECEBIDA` de novo (segunda trilha `RECEBIDA`).
  *Negativas:* estorno de nota parcial (solicitação ainda `VINCULADO`) → `solicitacoes_reabertas: []`; pedido
  `cancelado` antes do estorno → não reabre (`[]`); solicitação `CANCELADA` → nunca reabre; estorno de nota de 10 num
  pedido de 10 em que outra nota de 10 do mesmo material já cobria a solicitação (Σ recebido continua ≥ solicitado) →
  não reabre. Pela **rota** e pelo **serviço** (`stockService.cancelarMovimentacao`).
- **RN-09 (best-effort)** — `purchaseService.reabrirSolicitacoesDoMaterial` lançando (monkeypatch) → o estorno responde
  200, a linha do pedido é descontada, o pedido reabre e sai `console.warn` com a literal do contrato.
  `fecharSolicitacoesDoPedido` lançando continua não derrubando a nota (o (6) da Etapa 14, sem edição).
- **RN-10 (a aba mostra quanto chegou)** — `GET /relatorios/solicitacoes-compra`: cada linha `VINCULADO` traz
  `recebido_no_pedido`, `a_caminho` e `pedido_encerrado`. A aba Solicitações mostra `chegou 4 de 10` e, com o pedido
  encerrado, `pedido encerrado — nada a caminho`. `PENDENTE` não mostra nenhum dos dois.

## Contrato (congelado)

### Módulo novo `server/services/almoxarifado/pedidoCompraSaldoSql.js` (T0)

```
SOMA_POR_MATERIAL_SQL  // SELECT pedido_id, material_id,
                       //   SUM(COALESCE(quantidade,0)) AS total_material,
                       //   SUM(COALESCE(quantidade_recebida,0)) AS recebida_material
                       // FROM itens_pedido_compra WHERE material_id IS NOT NULL GROUP BY pedido_id, material_id
STATUS_PEDIDO_ENCERRADO = ['recebido', 'cancelado', 'rejeitado']
```
`receiptService.SOMA_POR_PEDIDO_SQL` passa a ser `SELECT pedido_id, SUM(total_material) ..., SUM(MAX(0, total_material -
recebida_material)) ... FROM (${SOMA_POR_MATERIAL_SQL}) GROUP BY pedido_id`, com **texto de resultado idêntico**. O
módulo só requer `./divergencia` (se precisar do epsilon), nada de `receiptService`/`purchaseService`.

### `purchaseService.fecharSolicitacoesDoPedido(db, user, pedidoCompraId)` (T1, mesma assinatura e chamadores)

Para cada `material_id` distinto das solicitações `VINCULADO` do pedido:
1. `soma` = linha de `SOMA_POR_MATERIAL_SQL` do (pedido, material); `solicitado` = Σ `quantidade` das `VINCULADO` do par.
2. Regra: sem linha (`soma` nula ou `total_material` 0) → `SEM_LINHA_NO_PEDIDO`; `total − recebida ≤ ε` →
   `MATERIAL_COMPLETO`; `recebida ≥ solicitado − ε` → `SOLICITADO_RECEBIDO`; senão nada.
3. `UPDATE solicitacoes_compra_almoxarifado SET status = 'RECEBIDA', recebida_em = CURRENT_TIMESTAMP
   WHERE pedido_compra_id = ? AND material_id = ? AND status = 'VINCULADO' AND <condição repetida sobre
   itens_pedido_compra> RETURNING id`. A condição no `WHERE` lê **só** `itens_pedido_compra` (com `solicitado` como
   parâmetro), para ser atômica contra um estorno no meio, e nunca a própria tabela que o `UPDATE` escreve.
4. Trilha por linha fechada: `acao 'RECEBIDA'`, `dados_novos: { pedido_compra_id, material_id, regra,
   recebido_no_pedido, solicitado }` (aditivo: `pedido_compra_id` continua lá, o (5) da Etapa 14 lê).

Retorno: `[{ id, material_id, regra }]` (hoje retorna `undefined`; nenhum chamador lê).

### `purchaseService.calcularSugestoes` — `a_caminho` / `a_caminho_vencido` (T1)

Shape da resposta **inalterado**. Cálculo: `PENDENTE` = Σ `quantidade` (como hoje); `VINCULADO` = por (pedido, material),
`0` se `LOWER(pedidos_compra.status)` ∈ `STATUS_PEDIDO_ENCERRADO`, `Σ quantidade` se o par não tem linha (D4), senão
`MAX(0, Σ quantidade − recebida_material)`. Mesmo recorte de horizonte por `sc.created_at` de hoje. Implementação
livre (subquery por material **ou** uma consulta agregada por (material, pedido) somada em JS), desde que **uma**
função (`aCaminhoPorMaterial(db, horizonte)` ou equivalente, exportada) seja a fonte para `calcularSugestoes` e para o
relatório da T3. Pedido apagado (vínculo para id inexistente): conta como sem linha (D4). O `DELETE` do pedido já devolve
a solicitação a `PENDENTE`, então o caso só existe em dado legado.

### `purchaseService.verificarEstoqueMinimo` (T1)

Dedupe: `SELECT id FROM solicitacoes_compra_almoxarifado sc LEFT JOIN pedidos_compra p ON p.id = sc.pedido_compra_id
WHERE sc.material_id = ? AND (sc.status = 'PENDENTE' OR (sc.status = 'VINCULADO' AND LOWER(COALESCE(p.status,'')) NOT
IN ('recebido','cancelado','rejeitado')))`. A lista vem de `STATUS_PEDIDO_ENCERRADO`, interpolada. Sem tabela
`pedidos_compra` (banco do almoxarifado sem o core): só `PENDENTE`, como hoje (guarda de `sqlite_master`, padrão do
módulo). Resposta e auditoria inalteradas.

### `purchaseService.reabrirSolicitacoesDoMaterial(db, user, { pedidoId, materialId, movimentacaoId })` (T2, exportada)

1. Pedido não existe ou `LOWER(status)` ∈ `STATUS_PEDIDO_ENCERRADO` → `[]`.
2. `UPDATE solicitacoes_compra_almoxarifado SET status = 'VINCULADO', recebida_em = NULL WHERE pedido_compra_id = ? AND
   material_id = ? AND status = 'RECEBIDA' AND NOT (<condição da D1 sobre itens_pedido_compra, com o `solicitado` das
   RECEBIDA do par>) RETURNING id`. Par sem linha → nunca reabre (o estorno sempre vem de uma linha com material, então o
   caso não acontece pela porta real).
3. Trilha por linha: `entidade 'solicitacao_compra'`, `acao 'REABERTA'`, `dados_anteriores: { status: 'RECEBIDA' }`,
   `dados_novos: { status: 'VINCULADO', pedido_compra_id, material_id, movimentacao_id, recebido_no_pedido }`,
   `justificativa: 'Estorno da movimentação #<movimentacaoId> reabriu a solicitação'`. Cada trilha no seu try.
4. Retorno: array de ids reabertos.

### Gancho em `receiptService.estornarEntradaNoPedido` (T2)

Depois do passo (2) do status do pedido e antes das trilhas do pedido:
```
let solicitacoesReabertas = [];
try {
  solicitacoesReabertas = await purchaseService.reabrirSolicitacoesDoMaterial(db, user,
    { pedidoId: pedido.id, materialId: mov.material_id, movimentacaoId: mov.id });
} catch (e) {
  console.warn(`[recebimento] reabertura das solicitacoes do pedido ${pedido.id} no estorno falhou: ${e.message}`);
}
```
O objeto de retorno ganha `solicitacoes_reabertas: [ids]` (**sempre presente** quando `pedido_compra` existe; `[]` sem
reabertura). Chamado pelo **objeto** `purchaseService` (já é assim no arquivo, para o monkeypatch do RN-09).

`POST /api/almoxarifado/movimentacoes/:id/cancelar`: gate, payload, recusas e literais **inalterados**. A resposta 200
ganha `pedido_compra.solicitacoes_reabertas`. A tela de Movimentações **não muda** (o toast da 71 segue igual).

### Rótulo de auditoria (`auditLabels.js`, T2)

`{ rotulo: 'Solicitação reaberta (estorno)', verbos: ['REABERTA'] }`. Antes de criar, conferir por `grep -n "'REABERTA'"
services/almoxarifado/auditLabels.js` que o verbo não está agrupado em outro rótulo. Se estiver, rótulo próprio por
entidade não existe: registrar como divergência e reusar.

### Relatório `solicitacoes-compra` (T3, `reportService.relatorioSolicitacoesCompraPendentes`)

Linhas e filtro (`PENDENTE`, `VINCULADO`) inalterados. Cada linha ganha três campos, aditivos:
`recebido_no_pedido` (número, 6 casas limpas; `null` em `PENDENTE` ou par sem linha), `a_caminho` (número, a mesma fonte da
T1, por solicitação: num par com várias solicitações, a parte de cada uma é `MAX(0, quantidade − recebido rateado em
ordem de id)`) e `pedido_encerrado` (boolean; `false` em `PENDENTE`).

### Tela (`ReposicaoAlmoxarifado.js`, aba Solicitações, T3)

Ao lado do selo `VINCULADO`: se `pedido_encerrado` → texto `pedido encerrado — nada a caminho`; senão, se
`recebido_no_pedido > 0` → `chegou <recebido_no_pedido> de <quantidade>` (números com `formatNum`). `PENDENTE`: nada
novo. O comentário de `:836-838` ("RECEBIDA/CANCELADA somem") ganha a nota da 72 (a nota parcial não some mais).

### O que não muda (contratos que não se reabrem)

O fechamento e a reabertura do **pedido** (Etapas 42/71, régua única: só o **lugar** da soma por material muda na T0); a
entrada atômica da nota e o claim `processando_em`; o motor de estorno (recusas, literais, claim); o
`verificarEstoqueMinimo` só para material próprio (Etapa 8); as literais de terminal de `vincular`/`cancelar`; o
`liberarSolicitacoesDoPedido` do Compras; a sugestão (`gerar-solicitacoes`, piso 0.001, chão da mínima); a máquina de
estados da requisição (C116); **todo o módulo Compras**.

## Tasks

Ordem topológica: **T0 → T1 → T2** (tronco, sequenciais, um executor: régua compartilhada, fechamento, `a_caminho`,
gancho do estorno); **T3** (galho: relatório + tela, consome a fonte do `a_caminho` da T1; worktree, em paralelo à
T2); **T4** (integração) depois de T2 e T3; **T5** fechamento. Executores de galho **não** marcam este plano.

- [x] **T0 (tronco) — a soma por material num módulo só.** *(feita — hash no commit seguinte da T1. Suíte sem
  edição de teste: `test:api` 265/265, almoxarifado 44/0, validation 4, safealter 3, sqlite 5. Controle positivo:
  `material_id IS NOT NULL` → `1=1` derrubou o **(5)** de `comprasPedidoSituacaoFonte` (texto livre), **não** o (1c)/(10)
  que o plano previa — a previsão estava errada: esse recorte é o do texto livre. Para (1c)/(10) a sabotagem certa é
  tirar o nível por material (`GROUP BY pedido_id` só): derrubou (1c) de `comprasPedidoSituacaoFonte` e (10) de
  `comprasPedidoStatusAutomatico`. Carga fria nas duas ordens sem ciclo.)* Criar `pedidoCompraSaldoSql.js` com `SOMA_POR_MATERIAL_SQL` e
  `STATUS_PEDIDO_ENCERRADO`; `receiptService.SOMA_POR_PEDIDO_SQL` montada em cima dele; o comentário de
  `fecharPedidosCompletos` (decisão 5) aponta para a constante. **Sem mudança de comportamento.** Prova: a suíte inteira
  verde **sem edição de teste** (`test:api`, `test:almoxarifado`, validation, safealter, sqlite), com os da 42/71 em
  destaque (`comprasPedidoSituacaoFonte`, `comprasPedidoStatusAutomatico`, `pedidoReabreNoEstorno`,
  `pedidoReabreIntegracao`). Controle positivo: trocar `material_id IS NOT NULL` por `1=1` no módulo novo → (1c)/(10) da
  42/71 caem (prova que a régua passa pelo módulo novo e não por uma cópia). Sonda de carga fria: `node -e
  "require('./services/almoxarifado/purchaseService'); require('./services/almoxarifado/receiptService')"` nas duas
  ordens, sem ciclo.
- [ ] **T1 (tronco) — fecha por material, "a caminho" é o que falta, mínimo não duplica.** `fecharSolicitacoesDoPedido`,
  a fonte do `a_caminho` (+ `a_caminho_vencido`) e o dedupe do `verificarEstoqueMinimo` (contrato). Teste novo
  `server/tests/api/solicitacaoFechaPorMaterial.api.test.js`, **pelas rotas** (pedido por `POST /api/compras/pedidos` com
  `solicitacao_id`, nota pelas seis portas, `/aprovar` direto num cenário, sugestão por `GET /reposicao/sugestoes`):
  RN-01 a RN-07, e mais um cenário **pelo serviço** chamando `fecharSolicitacoesDoPedido` direto com a linha somada à
  mão. A suíte inteira tem de passar **sem edição** nos testes da Etapa 14 (`solicitacaoCicloVida`,
  `integracaoComprasJornada`, `compraContextoMaterial`, `reposicao*`) e no `recebimentoAvisoEntradaIntegracao`. Se algum
  mudar, é achado e vai para o plano com o porquê. Controle positivo (cada um derruba o cenário certo): (a) voltar o
  `UPDATE` sem `material_id` → RN-01/RN-02; (b) só a condição (a) da D1 → RN-03; (c) `a_caminho` com `quantidade`
  inteira no `VINCULADO` → RN-05 (`a_caminho` 10); (d) sem o recorte de pedido encerrado → RN-06; (e) dedupe só `PENDENTE`
  → RN-07; (f) sem o ramo `SEM_LINHA_NO_PEDIDO` → RN-04 **e** o (I-1) da 14.
- [ ] **T2 (tronco) — o estorno reabre a solicitação.** `reabrirSolicitacoesDoMaterial` + o gancho em
  `estornarEntradaNoPedido` + rótulo. Teste novo `server/tests/api/solicitacaoReabreNoEstorno.api.test.js`: RN-08 e RN-09,
  **pela rota** `/movimentacoes/:id/cancelar` **e pelo serviço** `stockService.cancelarMovimentacao` (regra da skill:
  o estorno entra por mais de uma porta). O `pedidoReabreNoEstorno` da 71 passa **sem edição**, salvo os `deepStrictEqual`
  do objeto `pedido_compra`, se houver, que ganham a chave nova **dizendo** que o contrato cresceu. Medir antes com `grep
  -n "deepStrictEqual" tests/api/pedidoReabre*.js`. Controle positivo: (a) não chamar o gancho → RN-08; (b) reabrir
  sem olhar o pedido encerrado → negativa do `cancelado`; (c) reabrir sem a condição → negativa do "outra nota já cobria";
  (d) `throw` fora do try → RN-09.
- [ ] **T3 (galho, backend do relatório + cliente) — a aba mostra quanto chegou.** Os três campos no relatório (consumindo
  a fonte da T1, nunca uma terceira conta) + os dois textos na aba. Testes: em `reposicaoJornada.api.test.js` **ou**
  arquivo novo `relatorioSolicitacoesChegou.api.test.js` (preferir novo; o da jornada é da 11), os três campos em
  `PENDENTE`, `VINCULADO` parcial, `VINCULADO` com pedido `cancelado`; no `ReposicaoAlmoxarifado.test.js`, as duas literais
  e a ausência em `PENDENTE`. Controle positivo: trocar as literais → cai; `a_caminho` recalculado à parte no relatório
  (em vez da fonte da T1) → o cenário de duas solicitações no mesmo par diverge da sugestão (ter um assert que compara os
  dois). `CI=true` build do client.
- [ ] **T4 (integração, cruza galhos) — a jornada do comprador.** `server/tests/api/solicitacaoFechaPorMaterialIntegracao.api.test.js`,
  só pelas portas reais: material com mínimo → `verificar-minimos` → `POST /api/compras/pedidos` com `solicitacao_id`
  (dois materiais, X 10 e Y 5, cada um com a sua solicitação) → nota de 4 de X → **a sugestão não sugere X**
  (`a_caminho` 6), `verificar-minimos` → `[]`, relatório com `chegou 4 de 10`, contexto-material com a solicitação em
  `solicitacoes_abertas`, Y intocado → nota de 6 de X → X `RECEBIDA`, sai do relatório, pedido continua `pendente` (Y
  falta) → estorno da entrada de 6 → X `VINCULADO`, `solicitacoes_reabertas: [X]`, `a_caminho` 6 de novo → nota de 6
  outra vez + nota de 5 de Y → as duas `RECEBIDA`, pedido `recebido`, trilha das solicitações pela `GET /auditoria`
  na ordem (`RECEBIDA`, `REABERTA`, `RECEBIDA` para X) com o rótulo novo. Segundo cenário: pedido cancelado pelo
  `PATCH` com entrega parcial → material volta à sugestão com o que falta e o `verificar-minimos` abre solicitação nova.
- [ ] **T5 — fechamento (skill `fechar-etapa`).** Spec 18: **corrigir o "O que ficou de fora" e o cabeçalho, dizendo que
  estavam errados desde a Etapa 14**; regra nova na tabela; RN-01..RN-10. Spec 22 (`:322-327`): a "aproximação
  declarada" da B22 vira a regra nova. Mapa (linhas 18 e 22). Guia do usuário: a seção da Etapa 14 (`:3623-3627`)
  recebe a nota de que a frase "a primeira nota fecha" **deixou de valer na 72**, e seção nova com Antes → Agora e
  roteiro clicável (pedido de 10 → nota de 4 → aba Solicitações mostra "chegou 4 de 10" e a sugestão não pede de novo).
  Novidades: seção da 72, **B343–B351**, **B22** e **B334** corrigidas à vista, **C114** (verificar-minimos duplicava),
  **C115** (fechava solicitação de material que não chegou), **C116** (requisição com compra vinculada em
  `AGUARDANDO_ESTOQUE`, não corrigido), **C117** (solicitação `VINCULADO` de pedido encerrado fica na aba até o
  comprador cancelar), **A36**, D (72), F (72). Manual do sistema: a regra de fechamento. Retro de 4 números.

## Letra A — consulta para produção (A36)

As solicitações que a regra antiga fechou cedo: `RECEBIDA` cujo pedido ainda está vivo e tem saldo do material dela, e
cujo recebido não cobre o que ela pediu.
```sql
SELECT s.id, s.material_id, s.quantidade, s.pedido_compra_id, p.numero, p.status, s.recebida_em,
       SUM(COALESCE(ip.quantidade,0)) AS pedida, SUM(COALESCE(ip.quantidade_recebida,0)) AS recebida
FROM solicitacoes_compra_almoxarifado s
JOIN pedidos_compra p ON p.id = s.pedido_compra_id
JOIN itens_pedido_compra ip ON ip.pedido_id = s.pedido_compra_id AND ip.material_id = s.material_id
WHERE s.status = 'RECEBIDA' AND LOWER(COALESCE(p.status,'')) NOT IN ('recebido','cancelado','rejeitado')
GROUP BY s.id
HAVING SUM(COALESCE(ip.quantidade,0)) - SUM(COALESCE(ip.quantidade_recebida,0)) > 1e-9
   AND SUM(COALESCE(ip.quantidade_recebida,0)) < s.quantidade - 1e-9;
```
Para reabrir as que o comprador confirmar (não automático, B349), `UPDATE solicitacoes_compra_almoxarifado SET status =
'VINCULADO', recebida_em = NULL WHERE id IN (...)`. Antes, conferir se uma solicitação **nova** do mesmo material já foi
aberta depois (`verificar-minimos`/sugestão): se foi, reabrir a antiga duplica o "a caminho".

## O que fica de fora (declarado — e por quê)

- **Requisição `AGUARDANDO_COMPRA` × solicitação `VINCULADO`** (Surpresa 3, C116): máquina de estados da requisição,
  candidata da 73 (B350).
- **Teto do "a caminho" pelo saldo do pedido** (B344): regra de negócio diferente, quebraria o que a Etapa 14 prende.
- **Backfill** (B349, A36).
- **Fechar a solicitação quando o comprador encerra o pedido** (B345): gancho no Compras. A solicitação fica
  `VINCULADO` com "pedido encerrado" na aba (C117).
- **Re-vincular sobrescreve o vínculo** (B22(c), furo C15): inalterado.
- **Painel "Ver contexto"** (`contextoMaterial`): a lista `solicitacoes_abertas` já mostra a `VINCULADO` (que agora
  sobrevive à nota parcial). O "chegou X de Y" vai só na aba (T3), e o contexto ganha o mesmo campo numa etapa que
  precisar.

## Próxima tarefa detalhada — Etapa 73 (preencher no fechamento)

Candidata medida nesta Fase 0: **a requisição que espera compra** (feature 04, com a 18). (1) `calcularStatusPosAprovacao`
(`requisitionStateMachine.js:136-140`) conta só `PENDENTE`, então com o pedido gerado a requisição nasce
`AGUARDANDO_ESTOQUE` (C116). (2) `AGUARDANDO_COMPRA`/`AGUARDANDO_ESTOQUE` só saem por `EM_SEPARACAO`/`CANCELADO`
(`requisitionStateMachine.js:48-49`): nada as move quando o material chega. O aviso ao solicitante da 70 existe, o
status não. Alternativas do mapa se a medição não sustentar: OS/projeto no modal de sucateamento de material de cliente;
a corrida C98.

## Fase 2 — revisão do plano: 0 críticos, 5 importantes, 12 menores → plano revisto (vale sobre o texto acima)

- **IMPORTANTE (raiz comum) — o recebido do par não é atribuído a cada solicitação.** → **T1 congela UMA função por
  solicitação** (`posicaoDasSolicitacoes(db, { solicitacao_ids? , material_id? })`), devolvendo por solicitação VINCULADO:
  `{ solicitacao_id, material_id, pedido_id, solicitado, recebido_atribuido, a_caminho, pedido_encerrado }`, com o
  recebido do par (pedido, material) **rateado em ordem de id** entre as solicitações VINCULADO do par (cada uma leva até
  a sua quantidade; o resto passa à próxima). A sugestão de reposição soma `a_caminho` por material e o corte de
  horizonte é aplicado pelo `created_at` DA SOLICITAÇÃO sobre essa saída (sem descontar duas vezes); o relatório lê por
  linha. Sem terceira conta — a T3 só consome.
- **IMPORTANTE — recebido ANTES do vínculo** (pedido lançado no Compras com parte recebida, solicitação ligada depois por
  `vincular-pedido`): → coluna nova **`solicitacoes_compra.recebido_no_vinculo`** (`safeAlter`), gravada no vínculo
  (gerar pedido → 0; `vincular-pedido` → o recebido do par naquele momento). O recebido do par que conta para as
  solicitações é `recebido_do_par − SUM(recebido_no_vinculo)`… mais simples e congelado: **cada solicitação só enxerga o
  recebido do par acima do `recebido_no_vinculo` dela**, rateado como acima. Legado (NULL) = 0, declarado (letra C). A
  afirmação da D5 "o caso não existe na prática" estava errada — corrigida.
- **IMPORTANTE — "chegou X de Y" com duas solicitações no par**: a aba mostra `recebido_atribuido` (rateado), não o
  recebido do par.
- **IMPORTANTE — D6 reabria sem saber se foi este estorno** (legado fechado cedo reabriria e inflaria a posição): →
  reabre só a solicitação cuja condição de fechamento **valia antes** do estorno (com o `recebidaAntes` que o gancho já
  tem) **e deixou de valer** depois. Legado fechado cedo pela regra antiga não reabre.
- **IMPORTANTE — T3 não é independente**: roda depois da T1 (contra a função congelada), em paralelo à T2.
- Menores: os dois `deepStrictEqual(pedido_compra)` da 71 (`pedidoReabreNoEstorno:146`, `pedidoReabreIntegracao:182`)
  mudam na T2, citados no commit; campos novos só na aba (export/tela de Relatórios inalterados — declarado); unidade
  diferente pedido×solicitação (anterior — declarado); material em inspeção some dos dois lados (anterior — declarado);
  pedido cancelado que volta a enviado dobra a posição (letra C); nota contra pedido cancelado fecha a solicitação
  antiga (C); "Ver contexto" sem o aviso de pedido encerrado (declarado fora); dedupe do verificar-minimos SEM horizonte
  pode bloquear para sempre com pedido esquecido → **alinhado ao horizonte da requisição** (VINCULADO fora do horizonte
  não bloqueia); pedido apagado (LEFT JOIN) = "sem linha" também no dedupe; gancho usa `linha.material_id` (o SELECT
  passa a trazê-lo); a condição do fechamento relê o solicitado no próprio UPDATE.
