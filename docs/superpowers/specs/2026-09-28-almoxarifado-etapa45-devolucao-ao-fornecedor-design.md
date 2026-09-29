# Etapa 45 — A devolução ao fornecedor, e o encaminhamento com status (features 12 + 09)

> **Design.** Escrito em 2026-09-28, depois da Fase 0 medida no código. Paga o **último** item de
> "falta para 🟢" da feature 09 (*encaminhamento com status*) e o item desmarcado da feature 12
> (*devolução ao fornecedor*), e fecha o corte declarado da Etapa 44 (**B174**).
>
> **REVISADO pela Fase 2 — 13 achados, 5 CRITICAL, antes da primeira linha de código.** As seções
> 2, 3, 5 e 7 mudaram por causa deles, e **uma premissa que eu tinha escrito como medida era
> falsa** (F0-4). O que estava errado está corrigido **à vista**, na seção 8.

---

## 1. O problema, em uma frase de galpão

A inspeção reprovou 3 kg e alguém decidiu **devolver ao fornecedor**. O documento fechou dizendo
isso — e **ninguém sabe se a devolução aconteceu**. O material continua bloqueado no galpão e a
única forma de descobrir se a caixa voltou para a transportadora é perguntar para alguém.

## 2. O que a Fase 0 mediu

### F0-1 — ⚠️ Executar na hora da decisão seria ERRADO, e é a diferença desta etapa para a 44

A Etapa 44 fez a decisão **aceitar** executar no mesmo clique, e estava certa: liberar é ato
**administrativo** — o material está no galpão antes e depois, só deixa de estar retido.

**Devolver não é.** O material **sai fisicamente**: alguém embala, emite documento, chama a
transportadora. Se a decisão baixasse o estoque na hora, o sistema afirmaria uma remessa que ainda
não aconteceu — e o galpão teria 3 kg que o sistema diz não existirem.

**Consequência:** são **dois gestos** — decidir (já existe) e **registrar que foi executado**
(novo). É exatamente o que o requisito pede: *"acompanhar se a devolução/análise/substituição **já
foi executada**"*.

> ✔ **A Fase 2 confirmou que a RN-02 se sustenta no código:** `efeitoPrevisto`
> (`nonConformityService.js:553`) testa `DECISOES_QUE_LIBERAM` na **primeira** linha, e `DEVOLVER`
> não alcança `executarLiberacao` por caminho nenhum. Decidir não mexe em saldo.

### F0-2 — O material a devolver está BLOQUEADO, e o motor tem duas guardas contra isso

`stockService.js:790-801`: a do disponível (que **subtrai** o bloqueado) e a explícita
*"Material bloqueado não pode ser utilizado"*.

**Molde exato, medido:** `PERDA_TERCEIRO` / `CONSUMO_TERCEIRO` baixam material **retido** pela
mesma razão. A flag `baixandoTerceiro` (`:598`) desliga a guarda do disponível, e a validação real
acontece **no claim atômico**, com as duas condições no próprio `WHERE`. A devolução ao fornecedor
é a mesma forma, com `quantidade_bloqueada` no lugar.

### F0-3 — A devolução que existe é uma ENTRADA; o fluxo novo não é "mais um destino"

`returnService.DESTINOS = ['ESTOQUE','QUARENTENA','SUCATA','RETRABALHO']` (`:12`), todos gravando
`ENTRADA_DEVOLUCAO`. **A spec 12 já dizia isso** (`:176`) e a medição **a confirma** — raro o
bastante para registrar: aqui não há correção a fazer, há uma afirmação a reusar.

O molde de direção certo é `DEVOLUCAO_CLIENTE` (`schema.js:63`), cujo comentário já avisa que é
**direção oposta** à devolução da Etapa 7.

### F0-4 — ⚠️ ERRADO: eu escrevi que "o cartão cobra a intenção para sempre". Ele não cobra.

**Esta medição estava errada e é a mais importante de corrigir**, porque a RN-08 inteira se apoiava
nela. A Fase 2 leu o código:

- **O cartão tem janela.** `listarReprovados` (`alertRegistry.js:113-126`) filtra
  `i.data_inspecao >= datetime('now','-' || ? || ' days')`, com
  `configDias: { chave: 'alerta_eventos_janela_dias', default: 7 }` (`:447`). Passados 7 dias a
  inspeção **sai do cartão sozinha**, executada ou não.
- **O e-mail já saiu.** `dedupeChave: reprovado-<inspecao_id>` (`:451`), com o comentário
  *"Decisão de inspeção é imutável — 1 aviso por inspeção, para sempre"*. O aviso sai **no instante
  da reprovação**, semanas antes de existir execução a registrar. **Não há e-mail a impedir.**
- **E a exclusão que eu propus repetiria um erro já medido.** `listarReprovados` é **dual-mode**:
  com `{ inspecaoId }` é o **gancho do ato** (`:100-106`). O comentário de
  `listarDivergenciasRecebimento` (`:415-425`) registra que a Etapa 43 mediu exatamente isso e
  corrigiu com `excluirComNC` **opt-in**: *"Excluir por DENTRO dela cala o gancho do ato a partir
  da segunda escrita — MEDIDO, não suposto"*.

**O que sobra de verdadeiro, e vira a RN-08:** o cartão dos 7 dias é um **aviso de evento**, não
uma fila de pendências. A fila do que falta executar é a **listagem de NCs com filtro**, que é onde
ela deve nascer (seção 5). O alerta ganha só a exclusão **opt-in**, no modo listagem, e apenas para
`DEVOLVER` **executada** — porque executar uma `SUBSTITUICAO` não devolve nada.

### F0-5 — O documento já existe, e é a NC

A Etapa 43 reusou os três encaminhamentos da inspeção como decisões da NC
(`nonConformityService.js:61`, reuso declarado). *"Encaminhamento com status"* não pede documento
novo: pede que **a decisão da NC ganhe estado de execução**.

### F0-6 — ⚠️ O tipo novo entra na rota genérica POR DEFAULT

`schemas.js:58-60`: `TIPOS_MOVIMENTO_ROTA` é **derivado** —
`TIPOS_MOVIMENTO.filter(t => t !== 'ESTORNO' && !TIPOS_RETENCAO.includes(t) && !TIPOS_DEDICADOS.includes(t))`.
Não há lista a editar: **o opt-out é entrar em `TIPOS_DEDICADOS`** (`schema.js:126-135`), e o modo
de falhar é *esquecer de optar por fora*, com **default aberto**.

Sem isso, um `ALMOXARIFE` (gate `movimentar`, o mais amplo do módulo) manda
`POST /movimentacoes/v2 {tipo:'DEVOLUCAO_FORNECEDOR'}` e **baixa material bloqueado sem documento
nenhum** — as duas guardas estão desligadas pela flag, e o claim só exige que haja bloqueado.

E **`CAMINHO_TIPO_DEDICADO`** (`schemas.js:71`) junto: sem a entrada, a recusa manda o operador
para *"as telas de Reservas e Inspeções"*, e `schemas.js:69` avisa que **o manual cita estas
mensagens literalmente**.

---

## 3. As regras de negócio

| ID | Regra |
|---|---|
| **RN-01** | A decisão da NC ganha **estado de execução**: `PENDENTE` quando exige ato externo (`DEVOLVER`, `SUBSTITUICAO`, `ANALISE_ENGENHARIA`, `SUCATEAR`), `NAO_SE_APLICA` para as duas de aceitação, que já se executaram na Etapa 44. |
| **RN-02** | **Registrar a execução é gesto próprio e posterior**, nunca automático na decisão (F0-1). |
| **RN-03** | Registrar a execução de **`DEVOLVER`** baixa o material: `DEVOLUCAO_FORNECEDOR` pelo motor, tirando de `quantidade_atual` **e** de `quantidade_bloqueada` no **mesmo** `UPDATE`, com as duas guardas no `WHERE`. |
| **RN-04** | `SUBSTITUICAO`, `ANALISE_ENGENHARIA` e `SUCATEAR` **não movem estoque** — marcam data, autor e observação. Corte declarado. |
| **RN-05** | A execução é idempotente em **DOIS níveis**: claim em `inspecoes_recebimento_almoxarifado.devolucao_fornecedor_em` (o que impede **duas NCs da mesma inspeção** baixarem o mesmo material duas vezes) **e** `execucao_em` na NC (409 por documento). ⚠️ **A trava por inspeção não é escolha nova:** a spec 09 já a escreveu, com a razão, no fechamento da 44 — o índice único da NC é parcial **e por tipo**, então a mesma inspeção carrega mais de um documento. |
| **RN-06** | **Só baixa saldo a NC ABERTA AUTOMATICAMENTE, de origem `INSPECAO`.** NC aberta à mão, ou de origem `RECEBIMENTO`, registra a execução com efeito `NENHUMA` e literal própria. É a irmã da RN-09 da Etapa 44, e **aqui ela pesa mais**: lá a porta lateral liberava retenção; aqui **apagaria patrimônio**. |
| **RN-07** | Só NC **decidida** pode ter execução registrada. `ABERTA` ou `CANCELADA` recusa. |
| **RN-08** | O **cartão de reprovados** (janela de 7 dias) deixa de listar a inspeção cuja NC de `DEVOLVER` foi executada — por flag **opt-in**, e **só** no modo listagem, nunca no gancho do ato (F0-4). A **fila real** do que falta executar é a listagem de NCs com `?execucao=PENDENTE`. |
| **RN-09** | A movimentação carrega o número da NC em `documento_vinculado` e o motivo *"Devolução ao fornecedor"*. |
| **RN-10** | A execução **não é estornável pelo livro** — casando por **`tipo`**, que é dedicado (mais forte que casar por motivo, como a RN-12 da 44 teve de fazer). |
| **RN-11** | **Três estados conhecidos registram a execução sem mover saldo**, em vez de recusar: bloqueado insuficiente, **físico insuficiente** (estado alcançável — `stockService.js:1509-1511` documenta `bloqueada > atual`) e material inativo. É a lição da RN-11 da Etapa 44: a recusa fatal cria documento que nunca fecha. |
| **RN-12** | **O lote é resolvido e passado ao motor.** Sem ele, o débito cai na linha de saldo de lote `NULL` e a fica **negativa**, com a linha do lote devolvido continuando a mostrar saldo. Se não for resolvível em material com `controle_lote`, **recusa com literal própria** em vez de cair em `NULL`. |
| **RN-13** | **Material com `controle_serie` recusa a execução**, com literal própria. Baixar `quantidade_atual` sem baixar as séries quebra o invariante `COUNT(série presente) == quantidade_atual` da Etapa 6b, e deixaria a peça devolvida **entregável** pela tela de Movimentações. Corte declarado — resolver série aqui é etapa própria. |

**Ordem de precedência do efeito** (a primeira que casar vence):

1. decisão de aceitação → **400** *"Esta decisão não tem execução a registrar"* (RN-01)
2. NC não `DECIDIDA` → **400** (RN-07)
3. `execucao_em` já preenchido → **409** (RN-05)
4. decisão ≠ `DEVOLVER` → **`NENHUMA`** (RN-04)
5. NC não automática, ou origem ≠ `INSPECAO` → **`NENHUMA`** com literal própria (RN-06)
6. material com `controle_serie` → **400** (RN-13)
7. `controle_lote` sem lote resolvível → **400** (RN-12)
8. material inativo · bloqueado insuficiente · físico insuficiente → **`SEM_SALDO`** (RN-11)
9. claim da inspeção não casou → **`JA_DEVOLVIDA`** (RN-05)
10. caso contrário → `DEVOLUCAO_FORNECEDOR` → **`BAIXADA`** (RN-03)

## 4. Quem registra a execução — ação PRÓPRIA, ao contrário da Etapa 44

Lá, liberar era **efeito do ato já autorizado**: mesmo gesto, mesmo instante, mesma pessoa. Aqui é
**outro ato, outro dia, outra pessoa** — quem trata com o fornecedor é **Compras**, que está
**fora** de `decidir_nao_conformidade` de propósito (**B169**).

**`executar_encaminhamento: [ADMINISTRADOR, QUALIDADE, COMPRAS]`.**

⚠️ **A concessão a COMPRAS é CONDICIONADA à RN-06, e o comentário em `permissions.js` tem de dizer
isso.** Compras tem `registrar_nao_conformidade`; sem a RN-06, a combinação das duas ações lhe daria
metade de uma porta para **apagar estoque** (abrir NC manual sobre inspeção antiga + executar).
Com a RN-06, o alcance cai para *"confirmar que a devolução que a qualidade já decidiu saiu"*, que
é o que esta seção promete. **Quem afrouxar a RN-06 estará mexendo na razão da concessão.**

## 5. Contratos de API

### `POST /api/almoxarifado/nao-conformidades/:id/executar` — **novo**

Permissão `executar_encaminhamento`. Payload: `{ "observacoes": "…" }` (opcional).

Resposta: a NC, **mais** `execucao`, com a forma congelada (`quantidade`/`material_id` em `null`
quando não baixa — molde da Etapa 44, cujo achado 14 foi exatamente este):

| `efeito` | Quando | `mensagem` **literal congelada** |
|---|---|---|
| `BAIXADA` | RN-03 | `"{q} devolvido(s) ao fornecedor"` |
| `JA_DEVOLVIDA` | RN-05, outra NC da mesma inspeção já baixou | `"O material desta inspeção já havia sido devolvido"` |
| `SEM_SALDO` | RN-11, bloqueado insuficiente | `"O material já havia saído do bloqueio — a execução foi registrada sem mover saldo"` |
| `SEM_SALDO` | RN-11, físico insuficiente | `"Não há saldo físico deste material — a execução foi registrada sem mover saldo"` |
| `SEM_SALDO` | RN-11, material inativo | `"Material inativo — a execução foi registrada sem mover saldo"` |
| `NENHUMA` | RN-04 | `"Esta execução não altera o saldo"` |
| `NENHUMA` | RN-06 | `"Só a não conformidade aberta pela reprovação da inspeção devolve material"` |
| `SEM_SALDO` | RN-11, **sem reprovada** | `"Esta não conformidade não tem material reprovado para devolver"` |

> ⚠️ **A última linha foi ACRESCENTADA na T2, e esta tabela tinha seis.** Eu escrevi "a tabela
> está congelada" e ela estava **incompleta**: a NC automática nasce só com `reprovada > 0`, mas a
> **decisão da inspeção é reescrevível**, então a reprovada pode virar zero depois de o documento
> existir. Sem literal própria esse caso caía no `NENHUMA` genérico — *"esta execução não altera o
> saldo"* —, que é verdade e **não diz nada** justamente no único caso em que o operador esperava
> ver a baixa acontecer. Fica à vista em vez de emendada em silêncio.

Erros:

| Código | Mensagem literal |
|---|---|
| 404 | `"Não conformidade não encontrada"` |
| 400 | `"Só é possível registrar a execução de uma não conformidade decidida"` |
| 400 | `"Esta decisão não tem execução a registrar"` |
| 400 | `"Material com controle de série não pode ser devolvido por aqui — dê baixa pela tela de Movimentações"` |
| 400 | `"Não foi possível identificar o lote do material devolvido"` |
| 409 | `"A execução desta não conformidade já foi registrada"` |

### `GET /api/almoxarifado/nao-conformidades` — **aditivo**

Ganha `execucao_estado` e `execucao_em` na projeção e o filtro `?execucao=PENDENTE`. **É a fila do
que falta executar** — e, depois da F0-4, é ela que cumpre o papel que eu atribuí ao alerta.

## 6. A tela

Coluna **Execução**, filtro *Pendentes de execução*, botão **Registrar execução** nas linhas
decididas sem execução.

⚠️ **O parágrafo do modal de decisão muda, e há armadilha.** O cenário `(21)` de
`NaoConformidadesAlmoxarifado.test.js:536-537` tem duas asserções **negativas**
(`not.toContain('continua bloqueado')` e `not.toContain('ajustar_estoque')`) que a Etapa 44 deixou
para o furo C57 não voltar. A redação natural do texto novo — *"o material continua bloqueado até a
execução ser registrada"* — **derruba a asserção**. **Mantenha as duas negativas e redija sem essas
palavras** (ex.: *"segue retido até a execução ser registrada"*). Apagar a negativa para "consertar"
o teste seria desfazer a proteção da etapa anterior.

## 7. O que esta etapa NÃO cobre — os cortes, todos declarados

- **Não emite documento fiscal de saída** — é o que impede a feature 12 de fechar. **Letra B.**
- **Não avisa o fornecedor por e-mail.**
- **Não cria a reposição da `SUBSTITUICAO`.**
- **Não desfaz a execução** (RN-10).
- ⚠️ **Não reabre o pedido de compra.** `fecharPedidosCompletos` soma `quantidade_recebida`, que
  **só sobe** — decisão declarada em `receiptService.js:1755-1760`. O pedido de 10 kg com 3
  devolvidos continua *Recebido*, fora dos pendentes e dos atrasados, e o comprador só descobre
  lendo a NC. **A Etapa 45 cria um segundo gesto dessa família e o declara**, no mesmo formato.
- ⚠️ **Não toca em `contas_pagar`.** A nota é paga integralmente por material que voltou. Nota de
  crédito é processo fiscal, fora do módulo.
- ⚠️ **Não reabre a solicitação de reposição.**
- **Não devolve material com controle de série** (RN-13).
- **Não retroage sozinha:** NCs decididas antes do deploy nascem `PENDENTE` se a decisão pedir
  execução. É o **oposto** do backfill da Etapa 44, e de propósito: lá a marca retroativa impedia
  uma porta de abuso; aqui a fila retroativa é **útil** e **nada acontece sozinho** — alguém precisa
  clicar. Consulta para a **letra A**.

## 8. O que a Fase 2 mudou, e o que eu tinha escrito errado

**13 achados, 5 CRITICAL, antes da primeira linha de código.**

1. **CRITICAL — eu mandei deixar o tipo "fora de `TIPOS_MOVIMENTO_ROTA`", que é uma lista
   DERIVADA.** Não há o que editar: o opt-out é `TIPOS_DEDICADOS`. Escrito como estava, o
   implementador entregaria o tipo **aberto na rota genérica** — e o modo de falhar era esquecer de
   optar por fora. Virou F0-6.
2. **CRITICAL — eu pedi `retencaoAplicada` E o claim dentro do `try`. São mutuamente exclusivos.**
   `retencaoAplicada` serve aos ramos que rodam **fora** do `try`; uma saída que baixa retenção
   **dentro** do claim usa `reverterFisicoDaSaida`. Os dois juntos compensariam **em dobro**:
   bloqueada voltaria a 6 para uma reprovação de 3 — retenção sem lastro, e todo ajuste de
   inventário seguinte recusado. É a mesma classe do "liberação em dobro" da 44.
3. **CRITICAL — a trava de idempotência estava na NC, e a spec 09 já escreveu que tem de estar na
   inspeção**, com a razão. Eu tinha acabado de escrever aquela frase e não a apliquei. Virou RN-05.
4. **CRITICAL — faltava a irmã da RN-09 da 44.** NC manual sobre inspeção antiga + execução =
   **baixa de patrimônio** contra um bloqueio de outro fato. Virou RN-06, e é o que sustenta a
   concessão a COMPRAS.
5. **CRITICAL — a F0-4 estava falsa.** O cartão tem janela de 7 dias, o e-mail já saiu com dedupe
   por inspeção, e a exclusão que eu propus calaria o gancho do ato — erro **já medido** na
   Etapa 43. Reescrita, e a RN-08 com ela.
6. **IMPORTANT — lote e série.** O plano não citava nenhum dos dois. Sem lote, o débito cai em
   saldo de lote `NULL` **negativo**; com série, quebra o invariante da 6b e a peça devolvida
   continua entregável. Viraram RN-12 e RN-13.
7. **IMPORTANT — três arquivos fora da lista** (`movementTypes.js`, `ownerRules.js`, `schemas.js`),
   e um efeito colateral que ninguém teria decidido: `TIPOS_SAIDA` é derivada em
   `clienteEstoqueService.TIPOS_CONSUMO`, então material **de cliente** devolvido ao fornecedor
   passaria a contar como *consumido* na posição dele. E `ownerRules` avisa em maiúsculas que quem
   cria tipo de saída **tem de decidir** se ele entra na lista de dono.
8. **IMPORTANT — faltavam literais** para NC de origem `RECEBIMENTO` decidida `DEVOLVER` (o caso
   **mais comum** do backfill) e para o físico insuficiente.
