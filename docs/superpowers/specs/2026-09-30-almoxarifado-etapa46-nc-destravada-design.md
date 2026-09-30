# Etapa 46 — A não conformidade decidida deixa de ser um beco (desenho)

> **Data:** 2026-09-30 · **Feature:** 09 (Inspeção e qualidade), com efeito em 20 (Alertas)
> **Vem de:** o furo **C64** declarado no fechamento da Etapa 45, achado por **dois revisores
> independentes** na Fase 5 dela. Medições de abertura na seção "Fase 0 da Etapa 46" de
> `docs/superpowers/plans/2026-09-28-almoxarifado-etapa45-devolucao-ao-fornecedor.md`.

---

## 1. O problema, medido

A Etapa 45 separou **decidir** de **executar**. A recusa da execução nos níveis 6 e 7 da
precedência é **fatal e correta**:

- `controle_serie` → 400 *"Material com controle de série não pode ser devolvido por aqui — dê baixa
  pela tela de Movimentações"*;
- `controle_lote && !lote` → 400 *"Não foi possível identificar o lote do material devolvido"*.

**O que sobra depois da recusa é o beco.** A NC fica `status = 'DECIDIDA'`,
`execucao_estado = 'PENDENTE'`, e **nada no sistema a tira de lá**:

| Porta | O que faz hoje | Medido em |
|---|---|---|
| `POST /nao-conformidades/:id/decidir` | claim `WHERE id = ? AND status = 'ABERTA'` → **409** *"Esta não conformidade já foi encerrada"* | `nonConformityService.js:763` |
| `POST /nao-conformidades/:id/executar` | claim `WHERE ... execucao_em IS NULL`; a recusa de série/lote é **anterior** ao claim e repete para sempre | `:1075` |
| cancelamento | **existe um só**, dentro de `sincronizarNaoConformidadeQuantidade`, automático, só para NC de **quantidade** `aberto_automaticamente`, com `WHERE id = ? AND status = 'ABERTA'` | `:496` |
| rota de cancelar | **não existe**, para estado nenhum — só 5 rotas de NC | `extended.js:1051,1073,1085,1097,1117` |

E o documento preso **não cobra ninguém**: o alerta de documento parado
(`listarNaoConformidadesParadas`, `alertRegistry.js:253-265`) filtra `WHERE nc.status = 'ABERTA'`. O
comentário da entrada diz que *"NC decidida ou cancelada sai da condição sozinha, sem gancho
nenhum"* — o que estava **certo** quando foi escrito, porque decidir era o último gesto, e **deixou
de valer na Etapa 45**. Então a NC presa mora apenas num filtro que alguém precisa escolher na tela.

**É o beco "atrasado para sempre" da Etapa 42 em terceira roupa.** A segunda foi a NC fantasma que a
RN-05 da Etapa 43 fechou.

---

## 2. O que esta etapa NÃO é

**Não é "redecidir".** A Etapa 43 estabeleceu que a decisão é **imutável e auditada**, com autor,
justificativa e data congelados. Apagar isso de uma decisão que **aconteceu** é apagar evidência.

⚠️ **E o mecanismo de reverter JÁ EXISTE, o que torna a tentação concreta:** `:838-842` faz
`status = 'ABERTA'`, decisão/justificativa/autor/`decidido_em` a `NULL` e `execucao_estado = NULL`,
com o `WHERE status = 'DECIDIDA'` certo, e já é exercitado por teste. **Ele pode fazer isso porque
ali a decisão FALHOU INTEIRA** — é o rollback de `executarLiberacao`, e nada foi gravado no livro
nem na trilha. Reusá-lo para o gesto humano desta etapa seria usar um rollback como se fosse um
"editar".

**O caminho é CANCELAR**: status novo, motivo obrigatório, autor e data — com a **decisão
preservada** no documento. Quem precisar de outro encaminhamento abre documento novo.

---

## 3. A colisão semântica do `CANCELADA`, e o discriminador

> 🔴 **A SEÇÃO 9 SUBSTITUI O DISCRIMINADOR DESTA SEÇÃO.** `decidido_em` é exclusivo (medido) mas
> **não é suficiente**: ele não distingue o cancelamento humano de uma NC `ABERTA`. Leia a 9 antes
> de implementar. O texto abaixo fica porque o raciocínio da colisão está certo, e é ele que
> sustenta a seção 9.

**Achada na Fase 1, e ela muda o desenho.** Hoje `CANCELADA` tem **um** significado só, e há código
que depende disso:

```
getUltimaEncerrada (nonConformityService.js:406)
  WHERE ... AND status = 'DECIDIDA' AND fato_superado_em IS NULL
```

O docblock dela (`:398-401`) diz, textualmente: *"`CANCELADA` NÃO entra. Documento cancelado é a
divergência que o operador **CORRIGIU**; se ela voltar, é erro NOVO e precisa de documento novo."*

**Etapa 46 acrescenta um segundo significado** — *"uma pessoa anulou um documento decidido porque
não havia como executá-lo"* —, e nesse caso o problema **não** foi corrigido: ele continua de pé. Se
os dois significados compartilharem o mesmo `status`, o gancho de quantidade passa a abrir um
documento **novo** para o mesmo fato no próximo toque em `quantidade_recebida`, tratando um
cancelamento humano como se a divergência tivesse desaparecido.

**O discriminador existe e NÃO precisa de migração:** `decidido_em`. Ele é escrito **só** pelo claim
da decisão (`:762`) e limpo **só** pelo rollback (`:840`), que devolve o status a `ABERTA` no mesmo
`UPDATE`. Portanto:

| Estado | Significa | Como se reconhece |
|---|---|---|
| `CANCELADA` + `decidido_em IS NULL` | a divergência **desapareceu**; o sistema anulou sozinho | é o único caminho que o cancelamento automático alcança (`WHERE status = 'ABERTA'`) |
| `CANCELADA` + `decidido_em IS NOT NULL` | **uma pessoa** anulou um documento **decidido**; o problema continua | só a rota nova desta etapa produz |

**RN-05 usa isso** (abaixo). A alternativa descartada era um `status` novo (`ANULADA`): mexe no enum
`NC_STATUS`, no filtro de status da tela, no índice parcial e em todo texto que hoje diz "três
estados" — custo alto para informação que duas colunas existentes já carregam.

---

## 4. Regras de negócio

> 🔴 **RN-01, RN-02, RN-03 e RN-05 foram CORRIGIDAS na seção 9** (revisão da Fase 2: 12 achados, 3
> CRITICAL). As versões abaixo ficam à vista. RN-04, RN-06, RN-07, RN-08 e RN-09 valem como estão.

**RN-01 — Cancelar NC `ABERTA` por pessoa.** Com motivo obrigatório. Libera o índice parcial
`idx_nc_almox_aberta(origem, referencia_tipo, referencia_id, tipo) WHERE status = 'ABERTA'`
(`schema.js:1504-1506`), então abrir um documento novo do mesmo tipo para o mesmo fato passa a ser
possível — **e é isso que se quer**, porque o motivo do cancelamento diz por que o anterior morreu.

**RN-02 — Cancelar NC `DECIDIDA` cuja execução está `PENDENTE`.** Com motivo obrigatório. A
**decisão é preservada** (`decisao`, `justificativa`, `decidido_por_*`, `decidido_em` intactos);
`execucao_estado` **também é preservado** — ver RN-06.
*Cenário:* NC de inspeção, material com número de série, decidida `DEVOLVER`. A execução é recusada
com 400 para sempre. Cancelar com motivo *"devolução dada baixa em Movimentações, série 4471"* tira
o documento da fila e deixa o rastro de por quê.

**RN-03 — NC com execução JÁ REGISTRADA não cancela.** `execucao_em IS NOT NULL` → **409**. O ato
aconteceu; anular o documento depois dele deixaria o livro apontando para um documento morto.

**RN-04 — NC já `CANCELADA` não cancela de novo** → **409**, pelo claim.

**RN-05 — O gancho de quantidade distingue os dois cancelamentos.** `getUltimaEncerrada` passa a
considerar **também** `CANCELADA + decidido_em IS NOT NULL` como "encerrada, fato ainda documentado",
para **não** abrir um segundo documento automático sobre um fato que uma pessoa acabou de anular
deliberadamente. `CANCELADA + decidido_em IS NULL` continua **fora**, como o docblock dela manda.
*Cenário:* recebimento com falta de 4 kg → NC de QUANTIDADE nasce → decidida → cancelada por pessoa
→ alguém reenvia os dados fiscais. **Não** nasce um segundo documento.

**RN-06 — A fila de execução já exclui a cancelada, e isso NÃO é acidente.**
`listarNaoConformidades` cola `AND nc.status = 'DECIDIDA'` no filtro `?execucao=` e o comentário
(`:1213-1220`) diz por que, **antecipando exatamente esta etapa**: *"Uma NC cancelada DEPOIS de
decidida conserva o `PENDENTE` que a decisão gravou (cancelar não limpa a coluna), e apareceria na
fila cobrando execução de um documento morto. A cláusula é a regra; o NULL é a coincidência."*
**Logo: o cancelamento NÃO deve zerar `execucao_estado`.** Zerar apagaria a informação de que havia
execução pendente no momento do cancelamento, que é justamente o que o motivo explica.
⚠️ **A Fase 0 desta etapa afirmou o CONTRÁRIO** — ver a correção na seção 7.

**RN-07 — Gate de perfil próprio: `cancelar_nao_conformidade`.** ADMINISTRADOR e QUALIDADE.
**Não** é `decidir_nao_conformidade` (quem decidiu não deve poder apagar o próprio rastro sem uma
ação nomeada) e **não** é `executar_encaminhamento` (senão o COMPRAS limparia a própria fila, que é
o incentivo errado — B176 deu a ele executar, não anular).
*Cenário:* COMPRAS tenta cancelar → 403 *"Sem permissão para cancelar não conformidade — seu perfil
é Compras. Solicite acesso a um administrador."*

**RN-08 — O alerta cobra a execução pendente.** 15ª entrada do registro,
`NAO_CONFORMIDADE_EXECUCAO_PENDENTE`, janela própria `alerta_nc_execucao_pendente_dias` (default 7),
medindo `status = 'DECIDIDA' AND execucao_estado = 'PENDENTE'` por `decidido_em`. Sem ela, o
documento decidido e não executado continua só num filtro que alguém precisa escolher.

**RN-09 — Trilha.** Verbo `NC_CANCELADA`, que **já existe** e **já tem rótulo**
(*"Não conformidade cancelada"*, `auditLabels.js:187`). `dados_anteriores` carrega o `status` e o
`execucao_estado` de antes; `dados_novos`, `status: 'CANCELADA'`; `justificativa`, o motivo.

---

## 5. Contratos congelados

> 🔴 **A seção 9 acrescenta a SEXTA e a SÉTIMA recusa e aperta a régua do motivo.** A tabela abaixo
> está incompleta.

### `POST /api/almoxarifado/nao-conformidades/:id/cancelar`

Gate: `requirePermission('cancelar_nao_conformidade')`.

**Payload:** `{ "motivo": "texto" }` — obrigatório, com **pelo menos 5 caracteres** depois do
`trim()`. ~~`trim()` não vazio~~ — a régua apertou na seção 9.4, para casar com o precedente do
módulo (`PUT /conferencias/:id/cancelar`).

**Resposta 200:** o documento inteiro (mesma projeção de `obterNaoConformidade`) mais
`{ cancelamento: { estado_anterior, execucao_estado_anterior, mensagem } }`, espelhando a forma
`{ ...nc, liberacao }` da decisão e `{ ...nc, execucao }` da execução.

**As recusas, literais congeladas:**

| Código | Mensagem literal | Quando |
|---|---|---|
| ~~400~~ | ~~`O motivo do cancelamento é obrigatório`~~ | 🔴 **SUBSTITUÍDA na 9.5** por `O motivo do cancelamento deve ter pelo menos 5 caracteres`. A executora da T4 apontou que quem lê esta tabela antes da 9 é enganado — e estava certa. Riscada, não apagada. |
| 404 | `Não conformidade não encontrada` | id inexistente |
| 409 | `A execução desta não conformidade já foi registrada — o documento não pode ser cancelado` | RN-03 |
| 409 | `A decisão desta não conformidade já liberou o material — o documento não pode ser cancelado` | 🔴 **ACRESCENTADA na 9.5** (achado 9.3) — faltava nesta tabela |
| 409 | `Esta não conformidade já está cancelada` | RN-04 |
| 403 | *(corpo padrão de `requirePermission`)* | RN-07 |

**Mensagem de sucesso (`cancelamento.mensagem`), duas literais:**

| Valor | Quando |
|---|---|
| `Documento cancelado — ele não estava decidido, e nada foi executado` | estado anterior `ABERTA` |
| `Documento cancelado — a decisão fica registrada, e a execução deixa de ser cobrada` | estado anterior `DECIDIDA` |

**Toast da tela:** `Não conformidade <NUMERO> cancelada! <mensagem>` — mesmo padrão de
`Execução de <NUMERO> registrada! <mensagem>`.

### Nada muda em `decidir` e `executar`

As duas rotas ficam intactas. **Em particular, a recusa de série/lote continua fatal** — esta etapa
não a afrouxa; ela dá saída ao documento que a recusa deixou preso.

---

## 6. O que a tela ganha

Botão **Cancelar** na linha, visível em NC `ABERTA` **ou** `DECIDIDA`-com-execução-`PENDENTE`, e
**escondido** por `pode('cancelar_nao_conformidade')` — igual ao de execução, e pelo mesmo motivo
escrito lá: quem não pode não deve ver um convite a uma recusa. Modal com **motivo obrigatório** e o
aviso de que a decisão **não** é apagada.

⚠️ **Ação nova em `ACAO_PERFIS` é mudança de DUAS PONTAS:** rótulo em
`client/src/utils/permissaoErro.js` no **mesmo commit**, senão `permissaoErro.test.js:52` fica
vermelho. **Seria a oitava vez** que este buraco aparece nesta base — a sétima foi a Etapa 45, e lá
eu ainda reportei duas tasks como fechadas sem medir a suíte do client.

**E a config nova é de duas pontas também:** semear em `schema.js:~2397` **e** a linha da tela em
`ConfiguracoesAlmoxarifado.js:~2952`. Sem a segunda, a janela do alerta existe e ninguém a regula.

---

## 7. Correção de uma medição minha, à vista

**A Fase 0 desta etapa (escrita no plano da Etapa 45, item 5) afirmou:** *"A fila
`?execucao=PENDENTE` não exclui `CANCELADA` hoje — e isso é uma armadilha plantada… no instante em
que a Etapa 46 permitir cancelar uma NC decidida, essa NC carrega `execucao_estado = 'PENDENTE'` e
passa a casar o filtro, reaparecendo na fila do Compras."*

**Está ERRADO.** O filtro já tem `AND nc.status = 'DECIDIDA'` colado (`:1217-1219`), e o comentário
ao lado descreve **este cenário exato** como a razão de a cláusula existir. Eu li o comentário,
citei-o, e concluí o oposto do que ele diz.

**O que muda:** a armadilha **não existe**, a régua já está pronta, e a decisão que eu apresentei
como "reversível" (*"o filtro passa a excluir `CANCELADA` explicitamente"*) **já está tomada no
código desde a Etapa 45**. O que sobra é a RN-06 na forma de uma **proibição**: não zerar
`execucao_estado` no cancelamento.

Fica escrito porque a versão errada esteve **commitada e empurrada** (`4143318`), e porque ela
mandaria a execução mexer num filtro que está certo.

---

## 8. Fora de escopo, declarado

1. **Não redecide.** Documento decidido não muda de decisão; cancela-se e abre-se outro.
2. **Não afrouxa a recusa de série.** Devolver material serializado continua fora desta tela.
3. **Não resolve o lote `BLOQUEADO`/`REPROVADO`** recusado pela guarda de status do motor, com
   mensagem fora do contrato congelado — achado da Fase 5 da Etapa 45, ainda aberto.
4. **Não fecha o caso geral do pool agregado** (**C65**): contabilidade de retenção por origem é
   tronco de motor, com migração, e continua sendo etapa própria.
5. **Não cria botão de abrir NC à mão.** Continua sem tela (B171 da Etapa 43).

---

## 9. O que a Fase 2 mudou — 12 achados, 3 CRITICAL, 8 hipóteses refutadas

Revisor fresco, 2026-09-30, com o plano + o desenho + os oito arquivos que eles tocam. **Os três
CRITICAL mudam o desenho, não a execução**, e os três foram reproduzidos por leitura das linhas
citadas antes de entrar aqui.

### 9.1 🔴 O discriminador `decidido_em` é exclusivo, e NÃO é suficiente

**A seção 3 está certa no diagnóstico e errada na solução.** `decidido_em` é exclusivo — varredura
confirmou: escrito só em `:762`, limpo só em `:840`, e o backfill da Etapa 45 (`schema.js:681-694`)
toca **apenas** `execucao_estado`. **Mas ele não cobre a RN-01:** uma NC `ABERTA` cancelada por
pessoa tem `decidido_em IS NULL`, que é exatamente a assinatura que a tabela da seção 3 atribui a
*"a divergência desapareceu; o sistema anulou sozinho"*. **O cancelamento humano produz as DUAS
linhas daquela tabela.**

*Cenário:* a QUALIDADE cancela a NC `ABERTA` de quantidade (*"balança descalibrada, divergência
improcedente"*). O índice parcial libera o slot. Alguém **reenvia os dados fiscais** —
`salvarDadosFiscal` reenvia a quantidade de **todos** os itens e é um dos dois escritores
enganchados. O gancho: `getAbertaDe` não acha nada → ainda divergente → `getUltimaEncerrada` **não**
casa → nasce **NC nova, automática, numerada**, sobre o mesmo fato, sem mudança de fato nenhuma.
**E repete a cada salvamento de NF.** A RN-10 não segura, porque a régua dela é o resultado de
`getUltimaEncerrada`.

**O discriminador passa a ser `cancelado_por_id IS NOT NULL`**, com duas colunas novas por
`safeAlter`: `cancelado_por_id INTEGER` e `cancelado_por_nome TEXT`. **O precedente é literal no
próprio schema:** `conferencias_almoxarifado` tem o quarteto
`cancelado_por_id` / `cancelado_por_nome` / `cancelado_em` / `motivo_cancelamento`
(`schema.js:2311-2314`); a tabela de NC tem só os **dois últimos**. Esta etapa completa o quarteto.

**E isso paga o achado 6 de graça:** a seção 2 prometia *"motivo obrigatório, autor e data"*, e
**não havia coluna de autor**. Sem ela, um cancelamento cuja trilha falhasse (o `try/catch` com
`console.warn`) ficaria **sem autor em lugar nenhum**, e a tela nunca poderia mostrar quem cancelou
— ao contrário do que ela já faz para conferência.

### 9.2 🔴 A RN-05 reintroduzia o "silêncio completo" que `fato_superado_em` existe para matar

O carimbo de fato superado é escrito por um `UPDATE` com **`AND status = 'DECIDIDA'`**
(`nonConformityService.js:524-526`). Uma NC cancelada por pessoa **nunca** recebe o carimbo.

*Cenário:* item de 10, conferido 8 → NC automática nasce → decidida → pessoa cancela → operador
**corrige para 10** (o `UPDATE` de `:524` não toca a linha, porque ela é `CANCELADA`) → a falta
volta **igualzinha**, 8 de 10 → `getUltimaEncerrada` (com a RN-05) devolve a NC cancelada,
`mesmoFato(-2, -2)` é verdadeiro, e o serviço retorna `NENHUMA`. **Falta real e viva, zero NC no
módulo.** É o CRITICAL que o comentário de `:512-527` narra, em terceira roupa.

**O guarda que existe não pega:** `naoConformidadeRegressao.api.test.js:124-160` usa uma NC
**DECIDIDA** — ele continua verde com o furo aberto.

**Correção:** o `UPDATE` de `:524-526` recebe a **mesma** condição da RN-05, e o cenário-controle
*"cancelada por pessoa → corrige → quebra de novo → nasce documento NOVO"* entra em
`ncCancelamento.api.test.js`.

### 9.3 🔴 O claim deixava cancelar uma NC de ACEITAÇÃO já liberada

Uma NC decidida `ACEITAR`/`ACEITAR_SOB_DESVIO` fica `DECIDIDA` com
`execucao_estado = 'NAO_SE_APLICA'` e **`execucao_em NULL`** (o claim da decisão, `:758-765`, nunca
escreve `execucao_em`) — **e o saldo já se moveu**: houve `DESBLOQUEIO` no motor com
`documento_vinculado = NC-…` e `liberacao_nc_em` carimbado na inspeção. O claim proposto
(`status IN ('ABERTA','DECIDIDA') AND execucao_em IS NULL`) **aceita**, e a resposta imprime
*"a decisão fica registrada, e a execução deixa de ser cobrada"* — execução que nunca foi cobrada,
sobre um documento cuja linha de livro passa a apontar para documento morto. **É palavra por palavra
o que a RN-03 proíbe.**

**Correção:** o ramo `DECIDIDA` do claim exige `execucao_estado = 'PENDENTE'`, e o contrato ganha a
**sexta recusa**, com literal própria — a da RN-03 fala de *"execução já registrada"*, que é **falsa**
aqui. Sem literal nova o caso cai no 409 da RN-04 (*"já está cancelada"*), que **mente**.

### 9.4 As RN corrigidas

**RN-01 (corrigida) — Cancelar NC `ABERTA` por pessoa.** Motivo com **pelo menos 5 caracteres**
(régua do módulo: `PUT /conferencias/:id/cancelar`, `routes/almoxarifado.js:1680-1683`, justificada
com *"cancelar um inventário é tão destrutivo quanto aplicar o ajuste dele"*). Grava
`cancelado_por_id`/`_nome`. O índice parcial é liberado, **mas o gancho automático NÃO reabre** —
ver RN-05.

**RN-02 (corrigida) — Cancelar NC `DECIDIDA` com `execucao_estado = 'PENDENTE'`.** Só esse estado. A
decisão é preservada; `execucao_estado` é preservado (RN-06).

**RN-03 (corrigida) — Encaminhamento que JÁ produziu efeito não cancela.** Duas portas, **duas
literais**, porque as causas são diferentes: `execucao_em IS NOT NULL` (a execução foi registrada) e
`execucao_estado = 'NAO_SE_APLICA'` (a decisão de aceitação **liberou material no próprio clique**).

**RN-05 (corrigida) — "Cancelado por pessoa" é um ENCERRAMENTO, como decidir.** Os dois consumidores
do estado passam a tratá-lo assim, e é isso que torna a régua coerente em vez de meia:

| Consumidor | Hoje | Depois |
|---|---|---|
| `getUltimaEncerrada` (`:406`) | `status = 'DECIDIDA' AND fato_superado_em IS NULL` | `+ OR (cancelado_por_id IS NOT NULL)` — não reabre sozinho sobre fato que uma pessoa encerrou |
| o `UPDATE` de `fato_superado_em` (`:524-526`) | `AND status = 'DECIDIDA'` | a mesma condição — **fato que muda ainda gera documento novo** |
| `listarDivergenciasRecebimento`, exclusão do D6 (`alertRegistry.js:211-213`) | `AND nc.status <> 'CANCELADA'` | `AND (nc.status <> 'CANCELADA' OR nc.cancelado_por_id IS NOT NULL)` |

⚠️ **A terceira linha é o achado 7 da revisão, e sem ela a etapa nasce incoerente.** Hoje o D6
exclui do cartão o item que tem NC **não cancelada**, com o comentário dizendo que NC cancelada é *"a
divergência que o operador CORRIGIU"*. Depois da RN-05, a NC cancelada-por-pessoa significa o
**oposto**: o fato continua de pé, e **nenhum documento novo pode nascer sobre ele**. Sem ajustar o
D6, o item volta ao cartão como divergência **não documentada** e não existe porta para documentá-la
(a abertura manual não tem tela). Seria exatamente a simetria que o docblock de `getUltimaEncerrada`
foi escrito para não repetir: *"as duas metades da etapa aplicavam réguas OPOSTAS ao mesmo estado"*.

**O que isso significa em uma frase:** `CANCELADA + cancelado_por_id` passa a se comportar como
`DECIDIDA` para os dois consumidores. A única diferença é que não há decisão a executar. **E o cancelamento AUTOMÁTICO continua NÃO sendo encerramento**:
`CANCELADA + cancelado_por_id IS NULL`
segue fora dos três, como os comentários atuais mandam.

### 9.5 O contrato congelado, completo (substitui a tabela da seção 5)

| Código | Mensagem literal | Quando |
|---|---|---|
| 400 | `O motivo do cancelamento deve ter pelo menos 5 caracteres` | RN-01/RN-02 |
| 404 | `Não conformidade não encontrada` | id inexistente |
| 409 | `A execução desta não conformidade já foi registrada — o documento não pode ser cancelado` | `execucao_em IS NOT NULL` |
| 409 | `A decisão desta não conformidade já liberou o material — o documento não pode ser cancelado` | **NOVA** — `execucao_estado = 'NAO_SE_APLICA'` (9.3) |
| 409 | `Esta não conformidade já está cancelada` | RN-04 |
| 403 | *(corpo padrão de `requirePermission`)* | RN-07 |

**No `changes === 0` do claim (achado 9):** **reler a linha** e escolher a literal, em vez de recair
sempre na da RN-04. Uma corrida com `POST /executar` grava `execucao_em` entre a leitura e o claim, e
aí a resposta certa é a primeira, não *"já está cancelada"*.

### 9.6 Os achados que mudam TASK, não desenho

| # | Achado | Task |
|---|---|---|
| 4 | a entrada nova de alerta derruba **sete** asserções de contagem (`ALERT_REGISTRY.length === 14` e `alertas.length === 14`) em `alertaNaoConformidade.api.test.js:156,169`, `alertaPedidoAtrasado.api.test.js:179,244`, `alertaPedidoParcial.api.test.js:458,461,523`, `naoConformidadeIntegracao.api.test.js:232`, **mais** `semCompras.length === 12` em `alertaPedidoParcial.api.test.js:535` (a entrada nova só lê tabelas `*_almoxarifado`, então entra nessa conta) | **T3**, com gate `npm run test:api` inteiro |
| 5 | a tela mostraria badge de status **Cancelada** ao lado de execução **Pendente** (`NaoConformidadesAlmoxarifado.js:532-533` não olha `status`), contradizendo o toast | **T4** |
| 8 | largar só o filtro de execução não devolve a linha: `trocarExecucao` **força** `statusFiltro = 'DECIDIDA'` (`:335`), e o padrão é `'ABERTA'` (`:207`) — a T4 larga **os dois** | **T4** |
| 11 | dois comentários passam a mentir: `alertRegistry.js:145-148` (*"o único escritor de `CANCELADA` cancela NC `ABERTA`"*, e o `:477` que ele cita já está deslocado — o `UPDATE` está em `:495-497`) e `alertRegistry.js:820-821` (*"NC decidida ou cancelada sai da condição sozinha"*) | **T2** e **T3** |
| 12 | `COLUNAS_POR_CHAVE` (`AlertasAlmoxarifado.js:88`) é a **terceira ponta** da config/entrada nova; sem entrada, o cartão cai em `colunasGenericas` e mostra campos crus | **T3** |

### 9.7 As oito hipóteses que o revisor levantou e refutou

Valem registro porque cada uma custaria trabalho se tivesse sido aceita sem medir:
terceiro escritor de `decidido_em` (**não existe**); colisão da literal 409 com a da execução (os
três consumidores comparam por igualdade exata); a config nova derrubando `CHAVES_TELA.length === 18`
(aquelas listas são escritas à mão e **já estão defasadas**; a varredura real é
`configuracoesGerais.api.test.js:40-52`, e as duas pontas bastam); a ação nova derrubando a contagem
de `permissaoErro.test.js` (o guarda é `toBeGreaterThanOrEqual(24)` — o que derruba é só a ausência
do rótulo); cancelar e depois executar (recusado por **dois** trancos); cancelar NC de inspeção e
redecidir a inspeção (comportamento pré-existente, não regressão); o alerta diário continuar
cobrando (os dois filtros e os dois dedupes não colidem); e *"não há filtro de Canceladas na tela"*
(**há** — `STATUS_FILTROS` tem `{ valor: 'CANCELADA', rotulo: 'Canceladas' }`, e o motivo já é
renderizado na linha expandida).
