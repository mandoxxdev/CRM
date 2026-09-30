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

### `POST /api/almoxarifado/nao-conformidades/:id/cancelar`

Gate: `requirePermission('cancelar_nao_conformidade')`.

**Payload:** `{ "motivo": "texto" }` — obrigatório, `trim()` não vazio.

**Resposta 200:** o documento inteiro (mesma projeção de `obterNaoConformidade`) mais
`{ cancelamento: { estado_anterior, execucao_estado_anterior, mensagem } }`, espelhando a forma
`{ ...nc, liberacao }` da decisão e `{ ...nc, execucao }` da execução.

**As recusas, literais congeladas:**

| Código | Mensagem literal | Quando |
|---|---|---|
| 400 | `O motivo do cancelamento é obrigatório` | `motivo` ausente ou só espaço |
| 404 | `Não conformidade não encontrada` | id inexistente |
| 409 | `A execução desta não conformidade já foi registrada — o documento não pode ser cancelado` | RN-03 |
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
