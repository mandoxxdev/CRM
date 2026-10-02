# Etapa 69 — sucatear o material reprovado na inspeção (feature 15, com a 09)

> Status: **Fases 0 e 1 feitas (2026-10-01) — plano escrito, aguardando a Fase 2 (revisão do plano por agente fresco).**
> Nenhuma linha de produção escrita; nada commitado.
> Feature 15 (sucateamento) com a 09 (NC de inspeção). Requisito: especificação original seção 19 (*"quarentena →
> inspeção → reprovar → sucatear"*, `specs/modulo-almoxarifado/2026-08-02-requisitos-modulo-almoxarifado.md:816-848`) e
> o corte declarado **B174** da Etapa 44 (`specs/modulo-almoxarifado/09-inspecao-qualidade/README.md:248-249`: *"as
> outras quatro decisões (`DEVOLVER`, `SUBSTITUICAO`, `ANALISE_ENGENHARIA`, `SUCATEAR`) continuam marcando intenção sem
> tocar no saldo"* — a 45 pagou o `DEVOLVER`; esta etapa paga o `SUCATEAR`). Próxima tarefa detalhada de origem:
> `docs/superpowers/plans/2026-10-01-almoxarifado-etapa68-areas-especiais.md:431-471`.

**Escopo desta etapa:** a NC de inspeção decidida **Sucatear** ganha o caminho que faltava: um gesto na própria NC
(*Solicitar sucateamento*) abre um sucateamento **ligado ao documento**, com material, quantidade (a reprovada inteira)
e lote **derivados** da inspeção; as **duas assinaturas** da Etapa 9 continuam iguais; a segunda assinatura baixa a
`SUCATA` **do bloqueado** (físico e retenção juntos, molde da `DEVOLUCAO_FORNECEDOR` da Etapa 45), carimba a inspeção
(idempotência no nível da inspeção, como a 44 e a 45) e registra a execução da NC. O estorno dessa baixa é recusado
(molde da 45). As três portas sobre o mesmo bloqueado (liberar — 44, devolver — 45, sucatear — 69) passam a olhar os
três carimbos. Mais a task pequena **G79** (fixture do `test:almoxarifado`). **Fora:** sucatear parte da reprovada,
série, mudar o sucateamento comum (do disponível) — ver "O que fica de fora".

## Fase 0 — medido (2026-10-01)

Réguas testadas contra o que existe antes de medir ausência: `grep -n "SUCATEAR"` casa em
`nonConformityService.js:61` e em 5 arquivos de teste; `grep "sucateamento_em\|sucateado_em" server/` → **zero**
(nenhum carimbo de sucateamento na inspeção); `grep "nao_conformidade_id" server/services/almoxarifado/schema.js` →
**zero** (o sucateamento não sabe de NC). A palavra acentuada foi buscada pela raiz sem acento (`sucate`, `inspec`)
**e** pelo identificador do contrato (`SUCATEAR`, `quantidade_bloqueada`), nunca pelo nome imaginado.

### 1. Inspeção reprovada → bloqueio → NC

| Onde | O que faz |
|---|---|
| `server/services/almoxarifado/inspectionService.js:182-281` | `decidirInspecao`: claim do retido do ITEM (`:256-263`), depois **um** `DECISAO_INSPECAO` no motor que tira o retido de `quantidade_em_inspecao` e soma a reprovada em `quantidade_bloqueada` (`:269-281`). **Não toca em lote** (pendência antiga da 09, "reprovar por lote não está ligado à inspeção") |
| `inspectionService.js:43` | `ENCAMINHAMENTOS = ['DEVOLVER','ANALISE_ENGENHARIA','SUBSTITUICAO']` — **não há `SUCATEAR` na inspeção**; ele só existe como **decisão da NC** |
| `inspectionService.js:357` | `abrirNaoConformidadeDeInspecao` — a NC automática nasce da reprovação (`aberto_automaticamente = 1`) |
| `nonConformityService.js:61` | `NC_DECISOES` inclui `SUCATEAR`; `:91` só `ACEITAR`/`ACEITAR_SOB_DESVIO` liberam (44); `:115` `DECISOES_COM_EXECUCAO` (as outras quatro nascem `PENDENTE`); `:118` `DECISAO_QUE_DEVOLVE = 'DEVOLVER'` é a **única** que move saldo |
| `nonConformityService.js:273-279` | `getInspecao` traz `quantidade_reprovada`, `material_id`, `lote_id`/`lote` do item — **a NC sabe o lote** pela cadeia `nc.referencia_id → inspeção → item` |
| `nonConformityService.js:950-964` | `resolverLoteDaInspecao` (Etapa 45) — reaproveitável |
| `schema.js:1393`, `:1413` | carimbos da inspeção: `liberacao_nc_em` (44, com backfill) e `devolucao_fornecedor_em` (45, sem backfill). Nenhum de sucateamento |

### 2. O sucateamento (`scrapDisposalService.js`)

| Onde | O que faz |
|---|---|
| `:174-279` `solicitar` | recusas antecipadas: justificativa (`:189`), inativo (`:200`), **série** (`:205`), lote obrigatório se `controle_lote` (`:213`), dono (`ownerRules`, `:236`), e o **disponível** (`:239-245`): *"Saldo disponivel insuficiente para sucatear ⟨cód⟩: disponivel ⟨n⟩ ⟨un⟩, solicitado ⟨q⟩. O disponivel ja desconta reservado, bloqueado, em inspecao e em poder de terceiros — sucatear alem dele apagaria material que esta comprometido com outra OS."* |
| `:355-497` `aprovar` | barreiras de perfil/solicitante/mesma pessoa (`:367-389`), claim com `CASE` que fecha em `APROVADO` (`:409-415`), e **só a segunda perna** emite a `SUCATA` (`:427-460`), com `exigeLote`/`exigeSerie` e a origem da área de sucata (Etapa 68, `:430`, `origemEstrita`); falha → `compensarAssinatura` (`:298-316`) e re-lança o erro do motor |
| `schema.js:2009-2043` | tabela `sucateamentos_almoxarifado` — **sem** coluna de NC/inspeção |
| `routes/almoxarifado/extended.js:1419` | `POST /sucateamentos` com `requirePermission('movimentar')` (ADMINISTRADOR, ALMOXARIFE — `permissions.js:25`) |
| `permissions.js:64-65` | pernas: `aprovar_sucateamento` (ADMIN, ALMOXARIFE), `aprovar_sucateamento_gestao` (ADMIN, GESTOR) |

### 3. O molde: a devolução ao fornecedor (Etapa 45) baixa do bloqueado

| Onde | O que faz |
|---|---|
| `stockService.js:1036` | `const baixandoBloqueado = tipo === 'DEVOLUCAO_FORNECEDOR'` — **um tipo só**, dedicado (`schema.js:273`) |
| `stockService.js:1338`, `:1347` | a flag desliga a guarda do disponível e a guarda "Material bloqueado não pode ser utilizado" |
| `stockService.js:1684-1710` | claim **num UPDATE só**: `quantidade_atual -= q`, `quantidade_bloqueada -= q`, `WHERE bloqueada >= q - ε AND atual >= q - ε`; recusa *"Devolução acima do que está bloqueado: há ⟨b⟩ ⟨un⟩ bloqueado(s) (físico: ⟨a⟩)"* |
| `stockService.js:1563-1576` | compensação devolve os **dois** (físico e bloqueado), sem `retencaoAplicada` (senão compensaria em dobro) |
| `stockService.js:1291` | lote fora de `ATIVO` recusa **qualquer** saída, inclusive descarte e a devolução (deliberado na 45: "reabilitar o lote é outro gesto") |
| `stockService.js:2216-2219` | **estorno recusado**: *"Devolução ao fornecedor não pode ser estornada pelo livro — o material voltaria bloqueado com o documento dizendo que foi devolvido"* |
| `nonConformityService.js:980-1114` | `efeitoExecucaoPrevisto` — precedência pura de 10 níveis; o nível 4 (`:1015`) faz `SUCATEAR` = `NENHUMA` *"Esta execução não altera o saldo"* |
| `nonConformityService.js:1235-1320` | `executarDevolucao`: claim da **inspeção** (`devolucao_fornecedor_em IS NULL`, `:1239-1241`), origem = endereço de entrada do item (Etapa 57, `:1261-1271`, **não estrita**), motor com `exigeLote`/`exigeSerie`, rollback dos dois claims |
| **As duas assinaturas?** | **Não.** A devolução tem **uma** assinatura de decisão (QUALIDADE, `decidir_nao_conformidade`) e **um** registro de execução (`executar_encaminhamento`: ADMIN, QUALIDADE, COMPRAS — `permissions.js:229`). As duas assinaturas segregadas são só do sucateamento (contrato 20.2 que não se reabre) |

### 4. O estorno

- `SUCATA` comum é estornável: cai no ramo `tiposSaida` (`stockService.js:2469`) e devolve **ao disponível**. Para a
  sucata do bloqueado isso **liberaria material condenado**.
- A spec 15 já declara *"Estorno da baixa SUCATA não reconcilia o processo"* (sucateamento continua `APROVADO`
  apontando para movimentação cancelada).

### 5. Telas

- **Não Conformidades** (`client/.../NaoConformidadesAlmoxarifado.js`): decisão `SUCATEAR` oferecida (`:148`); botão
  *Registrar execução* para **qualquer** `DECIDIDA + PENDENTE` com `executar_encaminhamento` (`:711-716`); o modal diz,
  para tudo que não é `DEVOLVER`, *"Esta decisão **não movimenta estoque**"* (`:926-937`). Nenhum caminho para o
  sucateamento.
- **Sobras e Retalhos › Sucateamentos** (`SobrasAlmoxarifado.js`): formulário livre (material, lote, quantidade,
  justificativa — `:409-450`); a fila não mostra NC; deep-link só `?sobra_id=` (`:133`, `:161`).
- **Cartão "Material reprovado"** (`alertRegistry.js:176`): exclui só `i.devolucao_fornecedor_em IS NOT NULL`.

### 6. G79

`server/tests/almoxarifado.test.js:38-50` cria `materiais_almoxarifado` à mão **sem** `localizacao` (a coluna existe no
schema real, `schema.js:366`); `alertService.verificarAlertaPorMaterialId` lê `localizacao` (`alertService.js:783`)
dentro do `try` do motor (`stockService.js:2134-2140`), que só faz `console.warn`. **Medido rodando
`npm run test:almoxarifado`:** 42/0 verde e **19** linhas *"[almoxarifado-alertas] Falha ao verificar alerta
pós-movimentação: SQLITE_ERROR: no such column: localizacao"*. **Achado a mais, mesma classe:** *"[recebimento] status
automatico do pedido de compra falhou (recebimento 2): SQLITE_ERROR: no such column: status"* — o `pedidos_compra` da
fixture (`:247-249`) também não tem `status`. O efeito observável do alerta é a linha em
`alertas_estoque_material_almoxarifado` (`alertService.js:499`, `:570`, `:585`).

### Sonda executada (`sonda69-cadeia.js` no scratchpad, pelas rotas reais do harness)

Material crítico, recebe 10, a QUALIDADE reprova **3** (aprova 7), NC decidida `SUCATEAR`:

```
inspecionar 201 {"quantidade_atual":10,"quantidade_bloqueada":3}
decidir SUCATEAR 200 liberacao= NENHUMA execucao_estado= PENDENTE
POST /sucateamentos 3 -> 201                       ← ACEITO (disponível = 7)
pernas 200 200 true
saldo apos sucatear 3 {"quantidade_atual":7,"quantidade_bloqueada":3,"livre":4}   ← sucateou 3 BONS
executar SUCATEAR 200 EXECUTADA {"efeito":"NENHUMA",...,"mensagem":"Esta execução não altera o saldo"}
saldo apos executar {"quantidade_atual":7,"quantidade_bloqueada":3}
na fila PENDENTE? false                            ← a fila limpou com o condenado no bloqueado
cartao MATERIAL_REPROVADO lista a inspecao? true
```

### Surpresas da medição

1. **A cadeia não está só "quebrada" — no caso parcial ela funciona ERRADO, em silêncio.** O plano da 68 (e a letra
   D (68)) descreve a recusa *"disponivel 0"*: ela só acontece quando **toda** a quantidade retida é reprovada. Na
   reprovação **parcial** (o caso comum), o operador que pede o sucateamento dos 3 citando a NC é **aceito**, e as duas
   assinaturas baixam 3 do **disponível** — material **aprovado** vai para a caçamba e o reprovado continua bloqueado no
   galpão. Medido pela sonda. Vira **letra C nova** e a consulta **A33** (produção pode já ter isso).
2. **Registrar a execução de `SUCATEAR` limpa a fila sem mover nada** (`nonConformityService.js:1015`): a NC sai de
   *Pendentes de execução* com o material condenado ainda bloqueado. É o silêncio do C57 na quarta decisão — a tela
   avisa que "não movimenta estoque", mas o efeito na fila é afirmar cumprido o que não foi.
3. **As duas assinaturas não são da devolução** — a devolução tem decisão + execução; o "molde" a copiar é o do
   **motor** (baixa do bloqueado) e da **idempotência na inspeção**, não o do gesto. O gesto continua sendo o
   processo de sucateamento (20.2).
4. **A liberação da 44 não olha a devolução da 45** (`nonConformityService.js:892-897`: claim só em
   `liberacao_nc_em IS NULL`). A 45 olha a liberação (`:1073`), a 44 não olha a devolução. Alcançável só com dois
   documentos **automáticos** da mesma inspeção (raro — B175), mas é a mesma família das "duas portas" e a terceira
   porta desta etapa obriga a escrever a regra uma vez para as três.
5. **Citação errada em documento (regra 5):** o plano da 68 (`:437`) e a letra D (68) (`novidades:6339`) citam **C93**
   para "desbloquear para sucatear deixa o material livre". **C93 é outra coisa** (`novidades:5584`: "as outras saídas
   ainda tiram da área de sucata"). Corrigir à vista no fechamento.
6. **G79 tem irmão** na mesma fixture (`pedidos_compra` sem `status`) — mesma classe de teste vazio; entra na mesma task.
7. Lote `REPROVADO` à mão (rota de status do lote) faria a segunda assinatura tomar *"Lote ⟨L⟩ esta reprovado e nao pode
   ser utilizado"* (`stockService.js:1291-1294`) — descoberto só depois de duas assinaturas. Precisa de pré-checagem na
   solicitação.

## Decisões reversíveis (letra B do documento de novidades; última usada: B295)

- **D1 (B296) — o gesto é uma rota própria na NC: `POST /nao-conformidades/:id/solicitar-sucateamento`.** Ela cria o
  sucateamento `SOLICITADO` com material, quantidade e lote **derivados** da inspeção. Descartados: (a) campo
  `nao_conformidade_id` opcional em `POST /sucateamentos` — o Zod do caminho comum teria de tornar `material_id` e
  `quantidade` opcionais (reabre o contrato da Etapa 9 por nada); (b) `/executar` abrir a solicitação — o gate é
  `executar_encaminhamento` (inclui COMPRAS, que não tem `movimentar`) e acoplaria a execução ao processo de outra
  feature.
- **D2 (B297) — o tipo continua `SUCATA`; a baixa do bloqueado é uma opção interna do motor (`doBloqueado: true`, 4º
  argumento, nunca no body).** Descartados: tipo novo `SUCATA_REPROVADO` (sumiria do relatório `sucata-financeiro`, que
  lê `tipo = 'SUCATA'` — `extended.js:2228` —, e exigiria as cinco fontes únicas); reusar `DEVOLUCAO_FORNECEDOR` (o livro
  mentiria). A `SUCATA` continua em `TIPOS_DEDICADOS`: a v2 segue recusando.
- **D3 (B298) — o estorno dessa `SUCATA` é RECUSADO** (molde da 45). Discriminador exato: existe
  `sucateamentos_almoxarifado` com `movimentacao_sucata_id = mov.id AND nao_conformidade_id IS NOT NULL`. Descartados:
  (a) **devolver ao bloqueado** (o que o plano da 68 sugeria em `:469`) — a inspeção continua carimbada, a NC
  `EXECUTADA` e o sucateamento `APROVADO`: o material voltaria bloqueado **sem nenhuma porta** (as três olham o carimbo),
  e desfazer carimbos obrigaria o motor a conhecer NC e inspeção; (b) casar pelo `motivo` (o `returnService` grava
  `SUCATA` com o **motivo digitado pelo usuário** na devolução — colisão possível). Correção de um sucateamento
  indevido = `AJUSTE` com justificativa, como na devolução.
- **D4 (B299) — a quantidade é a reprovada INTEIRA da inspeção**; material e lote também derivados. Descartado:
  sucatear parte (a idempotência é por inspeção — uma inspeção "meio sucateada" não tem coluna para o resto, e o pool é
  agregado).
- **D5 (B300) — idempotência na INSPEÇÃO (`sucateamento_em`), e as três portas olham os três carimbos.** A liberação
  (44) e a devolução (45) ganham o carimbo novo no claim e um nível na precedência; a porta nova olha os três. É
  **reabertura declarada** dos contratos 44/45 (uma condição no `WHERE` de cada claim e uma literal nova em cada), pelo
  motivo do achado 4: três portas sobre o mesmo bloqueado agregado. Descartado: só a porta nova olhar (a devolução
  posterior baixaria de novo o que já foi para a caçamba, contra a retenção de outra origem).
- **D6 (B301) — `/executar` de `SUCATEAR` passa a RECUSAR quando o sucateamento do reprovado é viável**, ensinando o
  caminho; quando **não** é viável (retenção já saiu, série, lote não identificável, inativo, NC manual), registra
  **como hoje** (sem beco — a lição RN-11 da 44). A viabilidade é **uma** função pura, consumida pelas duas rotas (não
  dá para divergirem). Reabre a RN-04 da 45 **só para `SUCATEAR`**. Descartado: manter "registrar sem mover" (Surpresa
  2: a fila limpa com o condenado no bloqueado).
- **D7 (B302) — legado: NC `SUCATEAR` já `EXECUTADA` sem movimentação continua aceita pela solicitação** (critério:
  `execucao_movimentacao_id IS NULL`, não `execucao_em IS NULL`); ao baixar, grava `execucao_movimentacao_id` e preserva
  `execucao_em`/`execucao_por_*` já registrados. Descartado: exigir `PENDENTE` (o legado ficaria sem porta, só
  desbloquear + sucatear — o furo da D (68)).
- **D8 (B303) — NC `CANCELADA` não sucateia**: a solicitação recusa; a segunda assinatura recusa **com compensação** se
  a NC foi cancelada entre a solicitação e ela. Descartado: sucatear documento cancelado (o cancelamento da 46 encerra a
  cobrança; não é autorização de baixa).
- **D9 (B304) — origem**: (1) área de sucata quando **uma** localização dela cobre tudo e não há lote (B289, estrita —
  `origemAreaDeSucata` como está); senão (2) o endereço de entrada do item da inspeção (o helper da 57, **extraído** de
  `executarDevolucao` sem mudar comportamento: ativo, não bloqueado, **não estrito**, como a devolução); senão (3) sem
  origem. Descartado: estrito no endereço de entrada (divergiria do molde por um caso raro; o risco — livro com origem
  de entrada e parte vinda de outro endereço — fica declarado em C, o mesmo da devolução).
- **D10 (B305) — lote fora de `ATIVO` recusa NA SOLICITAÇÃO** (Surpresa 7). Motor intocado. Descartado: o motor aceitar
  lote `REPROVADO` em `SUCATA` (reabre a guarda de status, deliberada na 45).
- **D11 (B306) — gate da solicitação = `movimentar`** (ADMIN, ALMOXARIFE), sem ação nova: a QUALIDADE decide, o
  almoxarifado solicita, almoxarifado + gestão assinam (o solicitante não assina — barreira 2 da Etapa 9). Descartado:
  ação nova para a QUALIDADE solicitar (quem decide também pediria; e a QUALIDADE não tem `movimentar` em lugar nenhum).
- **D12 (B307) — o sucateamento comum (do disponível) NÃO muda**, nem ganha recusa para material com reprovado
  pendente — sucatear disponível pode ser legítimo. A Surpresa 1 vira aviso operacional (C) e consulta (A33).
  Descartado: recusar o comum quando há NC `SUCATEAR` pendente (recusa nova numa porta que a etapa não é dona; e o
  operador que sucateia sobra legítima do mesmo material seria barrado).
- **D13 (B308) — G79: acrescentar as colunas que faltam à montagem à mão** (`localizacao` em materiais, `status` em
  `pedidos_compra`), não trocar a fixture por `initSchema` puro. Descartado: reescrever a montagem de 700 linhas (risco
  de mudar o que os 42 testes provam).

## Regras de negócio

- **RN-01 (motor — baixa do bloqueado)** — `registrarMovimentacao(db, user, { tipo: 'SUCATA', … }, { doBloqueado: true })`
  baixa `quantidade_atual` **e** `quantidade_bloqueada` no mesmo `UPDATE` (guardas `bloqueada >= q - ε` e
  `atual >= q - ε`), sem a guarda do disponível nem a de "Material bloqueado"; recusa com a literal da SUCATA (contrato).
  Sem a opção, `SUCATA` é exatamente a de hoje. `doBloqueado` com tipo ≠ `SUCATA` → 400. *Cenário:* material 10 físico,
  3 bloqueado → SUCATA 3 `doBloqueado` → físico 7, bloqueado 0, disponível 7 (intacto); **e** (metade positiva) material
  3/3 bloqueado, SUCATA 3 **sem** a opção → 400 *"Saldo insuficiente. Disponível: 0 KG"* como hoje; **e** bloqueado 2 <
  3 → 400 com os dois números, nada muda; **e** a v2 com `{tipo:'SUCATA'}` continua recusada.
- **RN-02 (estorno recusado)** — `cancelarMovimentacao` de `SUCATA` cujo sucateamento tem `nao_conformidade_id` → 400
  literal, nada muda (nem `cancelado`). *Cenário:* depois da RN-05, estornar a SUCATA → 400; físico e bloqueado iguais;
  **e** (metade positiva) a SUCATA de um sucateamento **comum** continua estornável e volta ao disponível.
- **RN-03 (viabilidade, pura)** — `sucateamentoDoReprovadoPrevisto(nc, insp, material, lote, solicitadoAberto)` devolve
  `{ efeito: 'SUCATEAVEL', quantidade, material_id, lote_id }` ou `{ efeito: 'RECUSA', status, mensagem }` pela
  precedência congelada no contrato. *Cenário:* um caso por nível, cada um com a literal; **e** a NC viável → `SUCATEAVEL`
  com a reprovada.
- **RN-04 (solicitar)** — `POST /nao-conformidades/:id/solicitar-sucateamento` cria `SOLICITADO` com material,
  quantidade e lote derivados, `nao_conformidade_id`, justificativa do payload; **não move estoque**; segunda solicitação
  com uma `SOLICITADO` aberta → 409. *Cenário:* reprovada 3 → sucateamento com `quantidade` 3, `material_id` da inspeção,
  `lote_id` do item; físico 10 e bloqueado 3 **intactos**; **e** a segunda solicitação → 409 literal; **e** depois de
  rejeitada a primeira, uma nova é aceita.
- **RN-05 (duas assinaturas baixam do bloqueado)** — a segunda perna emite a `SUCATA` com `doBloqueado`, `motivo`
  *"Sucateamento de material reprovado"*, `documento_vinculado` = número da NC, `referencia` `SUC-⟨id⟩`, `lote_id` e
  origem (RN-09); carimba `inspecoes.sucateamento_em`; grava na NC `execucao_estado = 'EXECUTADA'`,
  `execucao_em`/`execucao_por_*` (= quem fechou a segunda perna, preservados se já existiam — D7) e
  `execucao_movimentacao_id`. A primeira perna não move nada. *Cenário:* pernas almoxarifado → gestão (usuários
  distintos) → bloqueado 0, físico 7, disponível 7 (**o aprovado não foi tocado**), livro com a SUCATA do lote, NC fora
  de `?execucao=PENDENTE`; **e** o mesmo com as pernas na ordem inversa; **e** as três barreiras da Etapa 9 continuam
  (solicitante não assina; mesma pessoa não assina as duas).
- **RN-06 (compensação)** — se entre a solicitação e a segunda assinatura a retenção da inspeção saiu (outro carimbo),
  a NC foi cancelada ou o motor recusou: a segunda perna devolve 400/409 literal, a assinatura é desfeita
  (`SOLICITADO`), o carimbo `sucateamento_em` volta a `NULL`, a NC fica como estava e o livro não ganha linha.
  *Cenário:* solicitar → desbloqueio avulso de 2 (bloqueado 1) → segunda perna → 400 *"Sucateamento acima do que está
  bloqueado…"*, `SOLICITADO`, `sucateamento_em` nulo; **e** solicitar → cancelar a NC (46) → segunda perna → 400 literal
  de NC cancelada, `SOLICITADO`.
- **RN-07 (três portas, três carimbos)** — liberação (44), devolução (45) e sucateamento (69) recusam/registram-sem-mover
  quando a retenção da inspeção já saiu por **qualquer** das outras duas. *Cenário:* depois da RN-05, uma NC `DEVOLVER`
  da mesma inspeção executada → `SEM_SALDO` *"O material desta inspeção já havia sido sucateado — a execução foi
  registrada sem mover saldo"*, saldo intacto; **e** inspeção devolvida → `solicitar-sucateamento` 400 *"O material desta
  inspeção já havia sido devolvido ao fornecedor"*; **e** inspeção liberada → 400 *"…já havia sido liberado…"*; **e**
  (metade positiva) os testes das Etapas 44/45 continuam verdes.
- **RN-08 (`/executar` de SUCATEAR)** — NC automática de inspeção decidida `SUCATEAR`, `execucao` pendente: se a RN-03
  diz `SUCATEAVEL` (ou há sucateamento `SOLICITADO` aberto para ela), `/executar` → 400 literal que ensina o caminho;
  senão registra **como hoje** (mensagem `SEM_SALDO`/`NENHUMA` correspondente). NC manual: `NENHUMA_MANUAL` como hoje.
  As outras três decisões: como hoje. *Cenário:* NC viável → 400, NC continua `PENDENTE`; **e** a mesma NC depois de
  desbloqueio avulso de tudo → 200 `EXECUTADA` com `SEM_SALDO_BLOQUEIO`; **e** `SUBSTITUICAO` → 200 `NENHUMA` como hoje.
- **RN-09 (origem)** — D9. *Cenário:* sem lote, reprovado transferido inteiro para a área de sucata S → origem S
  (estrita); **e** sem área, entrada do item no endereço E → origem E; **e** com lote → origem E (a área não se aplica).
- **RN-10 (cartão)** — `MATERIAL_REPROVADO` também exclui `i.sucateamento_em IS NOT NULL`. *Cenário:* depois da RN-05
  a inspeção some do cartão; **e** (metade positiva) antes da segunda assinatura ela continua lá.
- **RN-11 (fila de sucateamentos)** — `GET /sucateamentos` devolve, a mais, `nao_conformidade_id` e
  `nao_conformidade_numero` (LEFT JOIN). *Cenário:* o ligado traz o `NC-…`; o comum traz `null`.
- **RN-12 (tela da NC)** — linha `DECIDIDA` + `SUCATEAR` + execução pendente + automática de inspeção: botão
  *Solicitar sucateamento* (`pode('movimentar')`) que abre o modal (justificativa pré-preenchida com a da decisão,
  classificação, peso, observações) e, no sucesso, o toast diz o `SUC-⟨id⟩` e aponta para *Sobras e Retalhos ›
  Sucateamentos*; o modal de *Registrar execução* deixa de dizer "não movimenta estoque" para `SUCATEAR` e passa a
  dizer que a baixa é a aprovação do sucateamento. *Cenário:* RTL com mock HTTP.
- **RN-13 (tela de Sobras)** — a fila mostra a coluna/selo *NC-…* do sucateamento ligado; `?aba=sucateamentos` abre a
  aba. *Cenário:* RTL com mock HTTP.
- **RN-14 (G79)** — `test:almoxarifado` roda o alerta pós-movimentação: zero `[almoxarifado-alertas] Falha` no log da
  suíte e um teste que prova o efeito do alerta (linha em `alertas_estoque_material_almoxarifado` depois de uma
  movimentação). *Cenário:* controle positivo — tirar a coluna da fixture derruba o teste novo.

## Contrato (congelado)

### Schema (migração por `safeAlter`, sem backfill)

- `inspecoes_recebimento_almoxarifado.sucateamento_em DATETIME` — irmão de `devolucao_fornecedor_em`. **Sem backfill**
  (mesma razão da 45: carimbar o passado trancaria material ainda bloqueado).
- `sucateamentos_almoxarifado.nao_conformidade_id INTEGER` (NULL = sucateamento comum).
- `CREATE UNIQUE INDEX IF NOT EXISTS ux_sucateamento_nc_solicitado ON sucateamentos_almoxarifado(nao_conformidade_id)
  WHERE nao_conformidade_id IS NOT NULL AND status = 'SOLICITADO'` — a guarda real da RN-04 contra duas solicitações
  concorrentes (a pré-checagem é para a mensagem).

### Motor (`stockService.registrarMovimentacao`, 4º argumento)

- `opcoes.doBloqueado === true` só com `tipo === 'SUCATA'`; senão 400 `"doBloqueado só vale para SUCATA"`.
- `baixandoBloqueado = tipo === 'DEVOLUCAO_FORNECEDOR' || (tipo === 'SUCATA' && opcoes.doBloqueado === true)`.
- Recusa do claim: `DEVOLUCAO_FORNECEDOR` mantém a literal de hoje; `SUCATA`: **"Sucateamento acima do que está
  bloqueado: há ⟨b⟩ ⟨un⟩ bloqueado(s) (físico: ⟨a⟩)"**.
- `cancelarMovimentacao`, logo depois da recusa da `DEVOLUCAO_FORNECEDOR`: `SUCATA` com sucateamento ligado a NC →
  400 **"Sucateamento de material reprovado não pode ser estornado pelo livro — o material voltaria ao estoque
  disponível com a não conformidade dizendo que foi sucateado"**.

### `POST /api/almoxarifado/nao-conformidades/:id/solicitar-sucateamento` — nova

- Gate: `auth` + `requirePermission('movimentar')`. Schema Zod `SucateamentoDoReprovadoSchema`:
  `{ justificativa: string trim min 1 ("justificativa é obrigatória para sucatear"), classificacao?: string|null,
  peso_estimado?: number ≥ 0|null, projeto_origem_id?: int>0|null, os_origem_id?: int>0|null, observacoes?: string|null }`
  — `material_id`, `quantidade`, `lote_id`, `status` e aprovadores **não existem** no schema (descartados em silêncio,
  como no `SucateamentoCreateSchema`).
- 201 → a linha de `sucateamentos_almoxarifado` (com `nao_conformidade_id`).
- Precedência das recusas (a ordem é contrato — `sucateamentoDoReprovadoPrevisto` e o serviço), literais:
  1. id não inteiro ou NC inexistente → 404 **"Não conformidade não encontrada"**
  2. `status = 'CANCELADA'` → 400 **"Esta não conformidade foi cancelada — não há sucateamento a solicitar"**
  3. `status ≠ 'DECIDIDA'` → 400 **"Só é possível sucatear o material de uma não conformidade decidida"**
  4. `decisao ≠ 'SUCATEAR'` → 400 **"A decisão desta não conformidade não é Sucatear — o material reprovado só vai para o sucateamento por essa decisão"**
  5. `execucao_movimentacao_id` não nulo → 409 **"O material desta não conformidade já saiu do estoque"**
  6. NC manual ou fora de `INSPECAO` → 400 **"Só a não conformidade aberta pela reprovação da inspeção sucateia material reprovado"**
  7. inspeção ausente ou `quantidade_reprovada` ≤ 0 → 400 **"Esta não conformidade não tem material reprovado para sucatear"**
  8. `insp.sucateamento_em` → 409 **"O material desta inspeção já foi sucateado"**
  9. `insp.devolucao_fornecedor_em` → 400 **"O material desta inspeção já havia sido devolvido ao fornecedor"**
  10. `insp.liberacao_nc_em` → 400 **"O material desta inspeção já havia sido liberado por outra não conformidade"**
  11. material inativo → 400 (literal de hoje do `solicitar`) **"O material ⟨cód⟩ esta inativo e nao pode ser movimentado — reative o cadastro antes de sucatear"**
  12. `controle_serie` → 400 **"Material com controle de série não pode ser sucateado por aqui — dê baixa pela tela de Movimentações"**
  13. `controle_lote` e lote não resolvível → 400 **"Não foi possível identificar o lote do material reprovado"**
  14. lote com `status ≠ 'ATIVO'` → 400 **"O lote ⟨L⟩ está ⟨status⟩ — o estoque não baixa lote fora de ATIVO, nem para sucata. Mude o status do lote antes de sucatear"**
  15. bloqueado < reprovada (`menosQue`) → 400 **"O material já havia saído do bloqueio — há ⟨b⟩ ⟨un⟩ bloqueado(s), a reprovação foi de ⟨r⟩"**
  16. físico < reprovada (`menosQue`) → 400 **"Não há saldo físico deste material para sucatear — físico ⟨a⟩ ⟨un⟩, reprovado ⟨r⟩"**
  17. `SOLICITADO` aberto para a NC (pré-checagem, e o `UNIQUE` como garantia) → 409 **"Já existe um sucateamento solicitado para esta não conformidade (SUC-⟨id⟩) — aprove ou rejeite esse antes"**
  18. dono do material (`ownerRules.assertSaidaPermitida(…, 'SUCATA', …)`) → a literal da guarda, como hoje
  19. justificativa vazia (serviço chamado direto) → a literal de hoje do `solicitar`
- Auditoria `entidade: 'sucateamento'`, `acao: 'solicitar'`, `dados_novos` com `nao_conformidade_id`/`numero`,
  `inspecao_id`, `bloqueado_na_solicitacao`.

### `POST /sucateamentos/:id/aprovar-almoxarifado` e `/aprovar-gestao` — payload e respostas iguais

Muda só a segunda perna de um sucateamento **com** `nao_conformidade_id`, dentro do `try` que já compensa:
1. relê a NC: `CANCELADA` → 400 **"A não conformidade ⟨NC⟩ foi cancelada — o sucateamento não baixa material de documento cancelado"**;
2. claim da inspeção: `UPDATE … SET sucateamento_em = CURRENT_TIMESTAMP WHERE id = ? AND sucateamento_em IS NULL AND
   devolucao_fornecedor_em IS NULL AND liberacao_nc_em IS NULL` → 0 linhas = 409 **"O material desta inspeção já saiu do estoque por outro caminho — a assinatura foi desfeita"**;
3. origem (D9) e motor com `{ exigeLote: true, exigeSerie: true, doBloqueado: true, origemEstrita: !!origemArea }`;
   falha → `sucateamento_em = NULL` (`WHERE … IS NOT NULL`) e re-lança;
4. em qualquer falha de 1–3: `compensarAssinatura` (como hoje) e o erro original sobe;
5. depois do motor: `movimentacao_sucata_id` (como hoje) e a NC: `UPDATE … SET execucao_estado = 'EXECUTADA',
   execucao_em = COALESCE(execucao_em, CURRENT_TIMESTAMP), execucao_por_id = COALESCE(execucao_por_id, ?),
   execucao_por_nome = COALESCE(execucao_por_nome, ?), execucao_movimentacao_id = ? WHERE id = ? AND
   execucao_movimentacao_id IS NULL`, + trilha `NC_EXECUTADA` (não fatal, como a 45).
Sucateamento **sem** NC: nada muda (a Etapa 68 e a 9 continuam).

### `POST /nao-conformidades/:id/executar` — muda só para `SUCATEAR`

Novo nível na precedência de `efeitoExecucaoPrevisto`, depois do nível 5 (manual) e só para `decisao = 'SUCATEAR'`:
se `sucateamentoDoReprovadoPrevisto` = `SUCATEAVEL` **ou** há `SOLICITADO` aberto → RECUSA 400 **"O sucateamento
decidido nesta não conformidade se executa pelas duas aprovações do sucateamento — use Solicitar sucateamento"**; senão,
o efeito registrado é o `SEM_SALDO` correspondente (mensagens de hoje, com as duas novas abaixo) ou `NENHUMA` (série,
lote não identificável). `DEVOLVER`, `SUBSTITUICAO`, `ANALISE_ENGENHARIA`: inalterados.

### Literais novas nas portas 44 e 45 (RN-07)

- 45 (`EFEITO_EXEC_MSG.SEM_SALDO_JA_SUCATEADA`): **"O material desta inspeção já havia sido sucateado — a execução foi
  registrada sem mover saldo"** — nível logo antes do `liberacao_nc_em` (`:1073`); claim da devolução ganha
  `AND sucateamento_em IS NULL`.
- 44 (`EFEITO_MSG.SEM_BLOQUEIO_JA_SAIU`): **"O material desta inspeção já saiu do estoque — a decisão foi registrada
  sem liberar saldo"** — nível depois do inativo; claim da liberação ganha `AND devolucao_fornecedor_em IS NULL AND
  sucateamento_em IS NULL` (Surpresa 4).

### `GET /api/almoxarifado/sucateamentos` — aditivo

Cada linha ganha `nao_conformidade_id` e `nao_conformidade_numero`.

### Rotas e contratos que não mudam

`POST /sucateamentos` (Zod, recusas, gate `movimentar`), as três barreiras e o claim das pernas, `rejeitar`, `cancelar`,
`destino`, a origem da área de sucata (B289); decisões da NC (44/45/46) fora do `SUCATEAR`; `cancelarNaoConformidade`;
retenções como colunas do material (o bloqueado **não** vira saldo por endereço); `DEVOLUCAO_FORNECEDOR` (literal e
estorno).

## Tasks

Ordem topológica: **T1 → T2 → T3** (tronco, sequenciais, um executor); **T4 e T5** (galhos de cliente, paralelos,
depois da T3 — contrato congelado acima); **T6** (G79, galho de teste, independente — pode rodar em worktree em paralelo
com qualquer task; toca **só** `server/tests/almoxarifado.test.js`); **T7** (integração) depois de T1–T3; **T8**
fechamento. Executores de galho **não** marcam este plano (o fio principal marca — lição da 68).

- [x] **T1 (tronco) — motor e schema.** *Feita (2026-10-01, `99bbce4`): `sucataBloqueadoMotor.api.test.js` 10/0; as cinco
  sabotagens (a)-(e) vermelhas na asserção certa (a: (1)(3)(4)(8)(10); b: (1)(7)(8)(10); c: (7) "bloqueado 6"; d:
  (8); e: (9)); api 254/254, almoxarifado 42/0, validation 4/0, safealter 3/0, sqlite 5/0. Divergência: a guarda de
  tipo recusa `doBloqueado` truthy (não só `=== true`) com tipo ≠ SUCATA; a baixa só liga com `=== true`.*
  Texto original: `schema.js`: as duas colunas e o índice parcial. `stockService.js`:
  `doBloqueado` (RN-01) com a guarda de tipo, a literal da SUCATA no claim, a compensação do ramo `baixandoBloqueado`
  valendo para os dois tipos (sem `retencaoAplicada` — conferir que não compensa em dobro), e a recusa do estorno
  (RN-02) consultando `sucateamentos_almoxarifado`. Teste novo `server/tests/api/sucataBloqueadoMotor.api.test.js`
  (molde de `devolucaoFornecedorMotor.api.test.js`): baixa exata dos dois; bloqueado insuficiente (literal com os dois
  números); físico insuficiente; sem a opção = hoje (metade positiva); opção com tipo errado → 400; v2 recusa; falha
  depois do claim devolve os dois sem dobrar; estorno ligado recusado **e** estorno comum aceito; `exigeSerie`.
  Controle positivo: (a) `baixandoBloqueado` só para DEVOLUCAO → cenário da baixa cai; (b) claim baixando só o físico →
  "bloqueado > físico" detectado; (c) compensação com `retencaoAplicada` também → bloqueado volta em dobro; (d) recusa
  do estorno desligada → o estorno ligado devolve ao disponível (vermelho); (e) recusa casando todo `SUCATA` → o estorno
  comum cai.
- [x] **T2 (tronco) — o lado da NC.** *Feita (2026-10-01, `db8fa69`): `sucateamentoReprovadoRegra.api.test.js` 13/0;
  `encaminhamentoExecucao` (9) sem o SUCATEAR + (9b) novo, (16) e `encaminhamentoRotas` (7) com SUBSTITUICAO — 25/0 e
  8/0. Sabotagens: nível 15 depois do 16 → (1) "nivel 15" e (6); ordem dos carimbos no helper → (1) "nivel 8"; carimbo
  fora do claim da 45 → (9); RN-08 recusando o drenado → (6) com 409; sem carregar a inspeção para SUCATEAR → (2)-(7);
  claim da 44 sem os carimbos → (11); `motivo_sem_baixa` ignorado → (5); exclusão do cartão → (12). **Sobreviveu (por
  desenho):** tirar o nível 5b da precedência da 44 — o claim da 44, que relê os carimbos, dá o mesmo efeito e a mesma
  literal (a precedência é a mensagem; o claim é a garantia). api 255/255, almoxarifado 42/0, validation 4/0,
  safealter 3/0, sqlite 5/0. Decisões reversíveis da execução (para a letra B no fechamento):
  (i) `/executar` de SUCATEAR em NC MANUAL registra `NENHUMA` "Esta execução não altera o saldo" (como antes), e não o
  `NENHUMA_MANUAL` (cuja literal diz "devolve material") — descartado: a literal da devolução numa decisão de sucatear;
  (ii) o 409 do lote vale para QUALQUER status fora de ATIVO, com a literal `O lote <L> está <status minúsculo>
  (<status_motivo ou "sem motivo registrado">): …` — para BLOQUEADO é exatamente a literal da Fase 2;
  (iii) `motivo_sem_baixa` só abre o caminho do lote fora de ATIVO (efeito `SEM_BAIXA`, literal "A execução foi
  registrada sem baixa, pelo motivo informado — o material continua bloqueado"); NÃO abre o viável nem o SOLICITADO
  aberto; é gravado em `execucao_observacoes` como "… — Registrada sem baixa: <motivo>"; (iv) duas literais novas de
  SEM_SALDO para o SUCATEAR não viável (`SEM_SALDO_SEM_REPROVADA_SUCATEAR`, `SEM_SALDO_JA_DEVOLVIDA`) — as de hoje
  diziam "devolver"; (v) o SOLICITADO aberto recusa o `/executar` ANTES da viabilidade (com o bloqueio drenado e um
  SOLICITADO aberto, o caminho é rejeitar o sucateamento e então registrar).*
  Texto original: `nonConformityService.js`: `sucateamentoDoReprovadoPrevisto` (pura, RN-03,
  exportada); helper `retencaoDaInspecaoJaSaiu(insp)` usado pelas três portas; nível novo em `efeitoExecucaoPrevisto`
  (RN-08) e em `efeitoPrevisto` (44); claims de liberação e devolução com os carimbos (RN-07); extrair a origem de
  entrada de `executarDevolucao` para `origemDaEntradaDaInspecao(db, insp, nc, materialId, loteId)` **sem mudar
  comportamento** (os testes da 57 provam). `alertRegistry.js:176`: exclusão de `sucateamento_em` (RN-10).
  **Testes existentes que mudam (reabertura declarada, D6):** `encaminhamentoExecucao.api.test.js` (9) — o `SUCATEAR`
  sai do laço "registram sem mover" e ganha cenário próprio (viável → 400; drenado → `SEM_SALDO`); (16) e
  `encaminhamentoRotas.api.test.js` (7) — trocar a NC `SUCATEAR` "executada" por `SUBSTITUICAO` (o que eles provam é
  "executada sai da fila", não o `SUCATEAR`); conferir `NaoConformidadesAlmoxarifado.test.js` (texto do modal). Teste
  novo `server/tests/api/sucateamentoReprovadoRegra.api.test.js`: um caso por nível da precedência (pela função pura e
  pelo `/executar`), RN-07 nas três direções, RN-10. Controle positivo: trocar dois níveis de ordem (o cenário do nível
  cai); tirar o carimbo novo do claim da 45 (a devolução depois do sucateamento baixa — vermelho); RN-08 recusando
  também o não viável (o cenário "drenado" cai com 400 — prova a ausência de beco).
- [x] **T3 (tronco) — o lado do sucateamento e a rota.** *Feita (2026-10-01, `419b5a7`): `sucateamentoReprovado.api.test.js`
  16/0 (pela rota com cinco usuários distintos — QUALIDADE decide, ALMOX1 solicita, ALMOX2 e GESTOR assinam — e pelo
  serviço; o típico é o crítico com `controle_certificado` e lote, cujo lote nasce BLOQUEADO e a solicitação recusa no
  nível 14 até a QUALIDADE mudar o status); `sucateamento*.api.test.js` e `sucataDedicada` verdes. Sabotagens: sem
  `doBloqueado` → (2)(3)(5)(9)-(12) — **divergência do previsto:** a 2ª perna NÃO toma "Saldo insuficiente" na
  reprovação parcial, ela BAIXA do disponível (é a Surpresa 1) e o vermelho é "o reprovado continua bloqueado"; sem o
  carimbo no claim → (2) e (11) (a devolução da outra NC baixa de novo); sem desfazer o carimbo na falha → (5) "beco";
  sem `COALESCE` → (10) "o legado perdeu a data"; fila sem o JOIN → (2) RN-11; área sem o lote → (7c); sem a
  pré-checagem da NC cancelada → (6). api 256/256, almoxarifado 42/0, validation 4/0, safealter 3/0, sqlite 5/0.
  Decisões reversíveis (letra B): (vi) NC cancelada — a perna que NÃO fecha recusa antes do claim com a literal da Fase
  2 ("A não conformidade foi cancelada — recuse este sucateamento."); a que fecha relê depois do claim com a literal do
  contrato e compensa; (vii) perda do claim da inspeção relê os carimbos: "…já foi sucateado / já havia sido devolvido ao
  fornecedor / já havia sido liberado por outra não conformidade — a assinatura foi desfeita" (409), e a literal do
  contrato fica de fallback; (viii) a compensação nomeia a causa real na auditoria (`compensarAssinatura` ganhou
  `causa`); (ix) a SUCATA do reprovado NÃO leva `recebimento_id` ao motor (não está no contrato; a devolução leva) —
  descartado: herdar da 45 sem saber o que a coluna dispara em relatórios de recebimento; (x) a colisão do UNIQUE
  parcial vira 409 no SERVIÇO (não na rota), para o chamador direto receber o mesmo.*
  Texto original: `scrapDisposalService.js`: `solicitarDoReprovado(db, user,
  ncId, payload)` (RN-04, reusa o INSERT/auditoria do `solicitar` — extrair a escrita para uma função interna, as
  recusas comuns continuam no `solicitar`); `aprovar` com os passos 1–5 do contrato (RN-05, RN-06, RN-09); `listar` com
  o LEFT JOIN (RN-11). `schemas.js`: `SucateamentoDoReprovadoSchema`. `extended.js`: a rota nova, perto de
  `/executar`, `UNIQUE` → 409 literal. Teste novo `server/tests/api/sucateamentoReprovado.api.test.js` **pela rota**
  (pernas em ordens diferentes, três usuários distintos) **e** um cenário **pelo serviço** (o chamador direto também
  baixa do bloqueado): RN-04, RN-05, RN-06 (desbloqueio avulso no meio; NC cancelada no meio; motor recusando por
  injeção natural), RN-09 (área, entrada, lote), barreiras da Etapa 9 intactas, 403 para COMPRAS/QUALIDADE na rota nova,
  o sucateamento **comum** igual (metade positiva — `sucateamento*.api.test.js` verdes). Controle positivo: sem
  `doBloqueado` na chamada (a 2ª perna toma "Saldo insuficiente" — mostra que a flag é o que faz a cadeia fechar); sem o
  claim da inspeção (`sucateamento_em` fica nulo: a devolução de outra NC da mesma inspeção baixa de novo depois do
  sucateamento — o cenário RN-07 fica vermelho; uma segunda solicitação **não** serve de prova, porque o nível 5 já a
  recusa pela `execucao_movimentacao_id`); sem desfazer `sucateamento_em` na falha do motor (a retentativa toma 409 — beco); NC gravando
  `execucao_em` sem `COALESCE` (legado perde a data — D7).
- [ ] **T4 (galho, cliente) — tela de Não Conformidades** (RN-12). *Nota do tronco: o teste (33) de
  `NaoConformidadesAlmoxarifado.test.js` afirma "não movimenta estoque" no modal de execução de SUCATEAR — é a T4 que
  o muda (o backend agora recusa o SUCATEAR viável com 409 e aceita `motivo_sem_baixa`; contrato final no relatório
  do tronco e nas decisões (i)-(x) acima).* `NaoConformidadesAlmoxarifado.js`: botão,
  modal, toast, texto do modal de execução para `SUCATEAR`; `data-testid="btn-solicitar-sucateamento"`. Testes no
  `NaoConformidadesAlmoxarifado.test.js` (mock só na fronteira HTTP, com as literais do contrato): botão só nas linhas
  certas e só com `movimentar`; payload enviado; toast; erro 409 mostrado literal; o modal de execução não diz mais "não
  movimenta estoque" para `SUCATEAR`. Sabotagens no corpo do commit.
- [ ] **T5 (galho, cliente) — tela de Sobras** (RN-13). Coluna/selo `NC-…` na fila de sucateamentos e
  `?aba=sucateamentos`. Testes em `SobrasAlmoxarifado.test.js`. Sabotagens no corpo do commit.
- [x] **T6 (galho, teste) — G79** (RN-14). *Feita (2026-10-01, `9a45c31`): `test:almoxarifado` 44/0 (era 42/0), zero
  `no such column` no log (eram 19 avisos). **Divergência do plano:** o teste novo usa material **sem** mínimo (caminho
  do zerado), não "com mínimo" — o caminho do mínimo só grava em `alertas_estoque_material_almoxarifado` depois de envio
  real (`marcarAlertaEnviado`), então sem SMTP não deixa rastro; o zerado enfileira e grava `estado_zerado`. Exige
  `ZERADO` + carimbo + exatamente um `ESTOQUE_ZERADO` na fila. `pedidos_compra` ganhou `status` **e** `updated_at`
  (`fecharPedidosCompletos` grava os dois); "Workflow NF" segue verde. Espião olha `warn` e `error`. Sabotagens: sem
  `localizacao` → teste novo + espião vermelhos (42/2); sem `status` → espião vermelho (43/1); motor sem a chamada
  `verificarAlertaPorMaterialId` → teste novo vermelho (43/1). `test:api` 255/256 — `indicadoresSpec27Integracao`
  intermitente na rodada cheia (8/0 isolado), não tocado. Sobra da mesma classe, fora: seed de
  `tipos_material_almoxarifado` ignorado (fixture sem `descricao`, "has no column named", fora do padrão do espião).*
  `server/tests/almoxarifado.test.js`: `localizacao TEXT` na montagem de
  `materiais_almoxarifado` e `status TEXT` em `pedidos_compra`; espião de `console.warn` que **falha a suíte** se
  aparecer `[almoxarifado-alertas] Falha` ou `no such column`; teste novo *"Alerta pós-movimentação roda no motor"* —
  material com mínimo configurado, `registrarMovimentacao` que o leva ao zero (ou abaixo do mínimo) e a linha em
  `alertas_estoque_material_almoxarifado` existindo (o executor confirma por leitura de `alertService.js:483-600` qual
  estado o caminho escolhido grava, e escreve o porquê no teste). **Controle positivo obrigatório:** tirar a coluna
  `localizacao` da fixture → o teste novo **e** o espião ficam vermelhos; tirar `status` → o espião fica vermelho
  (prova que o espião sabe falhar). Divergência esperada: se o recebimento com `status` passar a mudar o pedido para
  RECEBIDO, conferir que o teste "Workflow NF" não dependia da falha.
- [ ] **T7 (integração, cruza T1–T3) — `server/tests/api/sucateamentoReprovadoIntegracao.api.test.js`, tudo pela rota.**
  (1) material crítico **com lote**, recebe 10 (retido), QUALIDADE reprova 3 → NC nasce sozinha → decide `SUCATEAR`
  (nada move; NC `PENDENTE`); (2) `/executar` → 400 literal da RN-08 (NC continua na fila); (3) ALMOXARIFE solicita →
  201, físico 10 / bloqueado 3 intactos, a linha de `/sucateamentos` traz `NC-…`; (4) perna gestão (GESTOR) → nada move;
  perna almoxarifado (outro ALMOXARIFE) → bloqueado **0**, físico **7**, disponível **7**, a linha do **lote** debitada
  em 3, `GET /movimentacoes` com a `SUCATA` (motivo, documento NC, `SUC-…`), NC `EXECUTADA` com
  `execucao_movimentacao_id`, fora de `?execucao=PENDENTE`, inspeção fora do cartão `MATERIAL_REPROVADO`, o relatório
  `sucata-financeiro` contando a linha; (5) estorno pela rota do livro → 400 literal, saldos iguais; (6) segunda NC
  (`DEVOLVER`, aberta para a mesma inspeção via fixture de NC automática) executada → `SEM_SALDO_JA_SUCATEADA`, nada
  move; (7) **a Surpresa 1 fixada**: o `POST /sucateamentos` comum de 3 continua aceito e baixa do disponível (corte
  declarado D12 — teste para ninguém "consertar" sem ler a decisão). Passa de primeira? Controle positivo, cada um
  vermelho num passo nomeado: T1 desligada (o (4) toma "Saldo insuficiente"); recusa do estorno desligada → (5); carimbo
  fora do claim da 45 → (6); exclusão do cartão tirada → (4).
- [ ] **T8 — fechamento** (skill `fechar-etapa`): spec 15 (item novo `[x]` "sucatear o reprovado"), spec 09 (B174 pago
  para o `SUCATEAR`; o cabeçalho diz que a decisão `SUCATEAR` agora executa; a frase do `nonConformityService.js:20`
  sobre o `SUCATEAR` corrigida à vista), mapa de status, guia (69), manual (NC e sucateamento), novidades: seção da
  etapa, **A33**, **B296–B308**, **C** novas (Surpresa 1; origem não estrita herdada da 45; o legado), D (69), F (69);
  **corrigir à vista** a citação de C93 no plano da 68 (`:437`) e na D (68) (`novidades:6339`) (Surpresa 5); retro.

## Letra A — consulta para produção (A33)

```sql
-- (a) NCs decididas SUCATEAR cujo reprovado ainda está retido (o que a etapa passa a resolver)
SELECT nc.numero, nc.execucao_estado, nc.execucao_em, m.codigo AS material, i.quantidade_reprovada,
       m.quantidade_bloqueada, m.quantidade_atual
  FROM nao_conformidades_almoxarifado nc
  JOIN inspecoes_recebimento_almoxarifado i ON i.id = nc.referencia_id
  JOIN recebimentos_material_itens_almoxarifado ri ON ri.id = i.recebimento_item_id
  JOIN materiais_almoxarifado m ON m.id = ri.material_id
 WHERE nc.referencia_tipo = 'INSPECAO' AND nc.decisao = 'SUCATEAR' AND nc.status = 'DECIDIDA'
   AND nc.aberto_automaticamente = 1 AND nc.execucao_movimentacao_id IS NULL
   AND i.liberacao_nc_em IS NULL AND i.devolucao_fornecedor_em IS NULL
 ORDER BY nc.decidido_em;

-- (b) a Surpresa 1: sucateamento COMUM do mesmo material depois de uma NC SUCATEAR, com o bloqueado ainda de pé
SELECT s.id AS sucateamento, s.status, s.quantidade, s.created_at, m.codigo, nc.numero, m.quantidade_bloqueada
  FROM sucateamentos_almoxarifado s
  JOIN materiais_almoxarifado m ON m.id = s.material_id
  JOIN nao_conformidades_almoxarifado nc ON nc.material_id = s.material_id
       AND nc.decisao = 'SUCATEAR' AND nc.decidido_em <= s.created_at
 WHERE COALESCE(m.quantidade_bloqueada, 0) > 0
 ORDER BY s.created_at;
```

**Como ler:** (a) com linhas — são os documentos que, depois do deploy, ganham *Solicitar sucateamento*; os que estão
`EXECUTADA` foram "executados" sem baixa (Surpresa 2) e continuam aceitos (D7). (b) com linhas — **possível material
bom sucateado no lugar do reprovado**: confira cada caso; se o reprovado ainda está bloqueado e o aprovado foi para a
caçamba, a correção é um AJUSTE (positivo do bom, com justificativa) e depois o sucateamento pela NC.

## O que fica de fora (vira "falta" ou "fora por decisão", com o motivo)

- **Sucatear parte da reprovada** — fora (D4).
- **Material com série** — recusado, como na devolução e no sucateamento comum (o processo não tem seletor de série).
- **Recusa no sucateamento comum** de material com reprovado pendente — fora (D12); vira aviso C e consulta A33 (b).
- **Lote reprovado sem passar por `ATIVO`** — fora (D10): mudar o status do lote é outro gesto.
- **Estorno com reversão** — fora (D3); a correção é AJUSTE.
- **Contabilidade de retenção por origem** (o pool agregado) — continua fora, como na 45 (C65).
- **Reprovar por lote ligado à inspeção** — pendência antiga da 09, intocada.
- **E-mail do sucateamento** — continua da feature 19.

## Pontos de atenção para a Fase 2 (revisor: siga cada RN até o último gesto)

- **RN-05 × destino final:** depois da baixa do bloqueado, `POST /sucateamentos/:id/destino` (VENDIDA/DESCARTADA) tem de
  aceitar o sucateamento ligado exatamente como o comum — conferir que nada no destino lê a quantidade do disponível.
- **RN-06 × compensação:** a ordem dentro do `try` (NC → claim da inspeção → origem → motor) e o que cada falha desfaz;
  erro de banco **depois** do motor (gravar a NC) **não** pode compensar a assinatura (a baixa valeu) — mesma inversão
  deliberada da 45 (trilha não fatal; a NC gravada com `UPDATE` simples logo depois do `movimentacao_sucata_id`).
- **RN-08 × tela:** a NC `SUCATEAR` viável recusa o *Registrar execução* — o botão continua visível; o toast mostra a
  literal. Conferir que o alerta `NAO_CONFORMIDADE_EXECUCAO_PENDENTE` continua cobrando enquanto o sucateamento está
  `SOLICITADO` (é o comportamento desejado: a cobrança termina quando o material sai).
- **RN-07 × 44:** a literal nova da liberação entra **depois** do nível do inativo e **antes** do drenado; conferir os
  testes da 44 (`naoConformidadeLiberacao*.api.test.js`).
- **D7 × cancelamento (46):** `cancelarNaoConformidade` exige `execucao_em IS NULL`; a NC legada `EXECUTADA` sem
  movimentação não é cancelável (hoje também não) — e é aceita pela solicitação. Conferir que nada mais lê
  `execucao_em` como "o material saiu".
- **Material de cliente reprovado:** `SUCATA` exige OS/projeto do dono (`ownerRules`); a rota nova aceita
  `projeto_origem_id`/`os_origem_id` e a recusa é a da guarda. Seguir até a segunda perna.
- `doBloqueado` só existe no 4º argumento: conferir que nenhuma rota repassa opções vindas do body.

## Fase 2 — revisão do plano: 0 críticos, 5 importantes, 8 menores → plano revisto (vale sobre o texto acima)

- **IMPORTANTE — D7 × RN-12 (NC antiga sem botão).** O botão "Solicitar sucateamento" passa a depender de
  **`execucao_movimentacao_id == null`** (decisão SUCATEAR, NC não CANCELADA, sem SOLICITADO aberto) — não de
  `execucao_estado === 'PENDENTE'`; a NC antiga EXECUTADA sem baixa alcança o gesto pela tela.
- **IMPORTANTE — onde a regra nova do `/executar` entra.** O nível 4 (`nonConformityService.js:1015`) devolve NENHUMA para
  tudo que não é DEVOLVER antes do nível 5: **T2 divide o nível 4 para SUCATEAR** e **carrega inspeção/material/lote
  também para SUCATEAR** (hoje só para DEVOLVER, `:1152`) — sem isso a função nova veria inspeção vazia, diria "não
  viável" e registraria calada. Mapeamento de cada nível do `/executar` de SUCATEAR:
  - viável → **recusa** 409 **`Esta não conformidade pede sucateamento: o almoxarifado registra em "Solicitar sucateamento" (duas aprovações) — a execução fica registrada na segunda aprovação.`**;
  - já há sucateamento SOLICITADO desta NC → **recusa** 409 **`Já existe o sucateamento SUC-<id> desta não conformidade aguardando aprovação no almoxarifado.`**;
  - lote BLOQUEADO (o típico com `controle_certificado` — sonda `sonda69r-lote.js`) → **recusa** 409 **`O lote <codigo> está bloqueado (<motivo>): libere o lote para sucatear o reprovado, ou registre a execução sem baixa informando o motivo.`** — e o registro sem baixa passa a exigir `motivo_sem_baixa` explícito no body (o `/executar` não fecha calado);
  - inviável por saldo (já saiu do bloqueio/físico) → registra como hoje (sem baixa), com a mensagem de hoje.
- **IMPORTANTE — lote + área de sucata (sonda B).** No caminho `doBloqueado`, a origem pela área de sucata considera o
  **lote** (`lote_id IS ?`) — com lote e o reprovado transferido para a área, a baixa sai da área. O sucateamento comum
  (B289) não muda.
- **IMPORTANTE — bloqueado é um pool por material**: a baixa `doBloqueado` pode consumir o bloqueio de OUTRA inspeção
  (janela solicitação→2ª assinatura). Declarado na letra C (agrava a C65); a auditoria da solicitação grava
  `bloqueado_na_solicitacao`.
- **IMPORTANTE — sem botão para a NC antiga** (coberto acima) e **NC cancelada com sucateamento aberto**: a 1ª assinatura
  checa a NC não CANCELADA (recusa **`A não conformidade foi cancelada — recuse este sucateamento.`**); o passo 5 grava
  com `status <> 'CANCELADA'`; o texto de compensação da auditoria diz a causa real.
- Menores: a ordem das 19 recusas vale **depois do Zod** (justificativa vazia → 400 do Zod; os dois literais
  documentados); recusa do estorno ancorada em **`referencia = 'SUC-'||id` + `nao_conformidade_id IS NOT NULL`**
  (escritos atômicos com o livro), não em `movimentacao_sucata_id`; as três portas (liberar 44, devolver 45, sucatear)
  checam **os três carimbos** no claim, e a perda do claim relê os carimbos para nomear a causa certa; SUCATA infla
  giro/consumo/sugestão de reposição como a DEVOLUCAO_FORNECEDOR — declarado (letra D); o toast da T4 é só texto (sem
  link para a aba — sem dependência da T5).
