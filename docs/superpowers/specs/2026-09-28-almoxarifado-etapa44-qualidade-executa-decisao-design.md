# Etapa 44 — a QUALIDADE executa a própria decisão (feature 09)

> **Design.** Escrito em 2026-09-28, depois da Fase 0 medida no código. Fecha o furo **C57**:
> a Qualidade decide `ACEITAR` / `ACEITAR_SOB_DESVIO` numa não conformidade e **o material
> continua bloqueado**, porque quem desbloqueia é uma rota gateada por `ajustar_estoque`, que
> não inclui QUALIDADE.
>
> **REVISADO pela Fase 2 em 2026-09-28 — 15 achados, 2 CRITICAL.** As seções 4, 5, 7 e a lista de
> RN mudaram por causa deles. O que estava escrito e **estava errado** está corrigido **à vista**,
> na seção 9, em vez de apagado — é a regra 5 do `CLAUDE.md` aplicada ao próprio design.

---

## 1. O problema, em uma frase de galpão

O inspetor reprovou 3 kg. O sistema bloqueou 3 kg. A Qualidade analisou, decidiu **aceitar sob
desvio**, assinou e justificou — e os 3 kg **continuam bloqueados**. Para usá-los, alguém da
gestão precisa entrar noutra tela e desbloquear na mão, sem nenhum vínculo com a decisão que
acabou de ser tomada. O documento diz uma coisa e o saldo diz outra.

## 2. O que a Fase 0 mediu (e onde isso muda o desenho)

### F0-1 — A saída que a spec 09 prescreve resolve **outro** problema

A spec 09 diz, desde a Etapa 24: *"se um dia bloquear por desvio tiver de caber no perfil, o
caminho limpo é uma ação PRÓPRIA (`bloquear_qualidade`)"*. **Essa frase foi escrita sobre os
botões avulsos** *Bloquear Material* / *Desbloquear Material* da tela de Inspeções
(`InspecoesAlmoxarifado.js:197` e `:202`), que hoje devolvem 403 para a QUALIDADE (**B56**).

O furo **C57** é outro: não é "a Qualidade não tem o botão avulso", é **"a decisão não executa"**.
E para esse, a ação nova é a resposta **errada e mais larga**: `bloquear_qualidade` daria à
QUALIDADE o poder de desbloquear **qualquer quantidade de qualquer material**, a qualquer momento,
sem documento nenhum. O que o furo pede é muito menos: que **o documento que ela acabou de
assinar** produza o efeito que ele declara.

**Decisão: nenhuma ação de perfil nova.** A liberação é **efeito do ato já autorizado**
(`decidir_nao_conformidade`, hoje `[ADMINISTRADOR, QUALIDADE]`) — exatamente o desenho que
`permissions.js:192-193` já escreveu para os ganchos automáticos da Etapa 43: *"rodam SEM
`requirePermission`: são efeito do ato já autorizado"*.

> ⚠️ **A Fase 2 mostrou que "efeito limitado pelo documento" não era verdade, e o conserto é a
> RN-09.** Escrito assim, o desenho tinha uma **porta lateral crítica**: `abrirNaoConformidadeManual`
> (Etapa 43) deixa um usuário QUALIDADE abrir, à mão, uma NC apontando para **qualquer inspeção da
> história**, com qualquer um dos seis tipos — `resolverFato` só exige que a inspeção exista. Ele
> abriria uma NC sobre uma inspeção de março e a decidiria `ACEITAR`, e o sistema desbloquearia a
> quantidade daquela reprovação **contra um bloqueio de origem completamente diferente** (um
> bloqueio avulso de inventário, por exemplo), sem `ajustar_estoque` e sem passar pela rota de
> desbloqueio. O "limitado pelo documento" era falso porque **quem escolhe o documento é o próprio
> usuário**. Fechado pela **RN-09** (só NC automática libera) e pela **RN-03** (backfill).

**O que fica descartado, e por quê:** `bloquear_qualidade` como ação de perfil, e com ela a
promessa da Etapa 24. **B56 continua aberta** — os botões avulsos continuam fora da QUALIDADE. Se
o cliente quiser dar-lhe o bloqueio avulso, aí sim a ação própria é o caminho, e ela é uma linha.
Registrar na **letra B**.

### F0-2 — ⚠️ O risco de **liberar duas vezes** existe, e não é teórico

O índice único é **parcial e por tipo**:

```sql
CREATE UNIQUE INDEX idx_nc_almox_aberta
  ON nao_conformidades_almoxarifado(origem, referencia_tipo, referencia_id, tipo)
  WHERE status = 'ABERTA'
```

Ou seja: a **mesma inspeção** pode carregar mais de uma NC, desde que o `tipo` seja diferente — e
`abrirNaoConformidadeManual` (Etapa 43) permite abrir uma **à mão** apontando para
`referencia_tipo: 'INSPECAO'` e o mesmo `referencia_id`. Duas NCs da mesma inspeção, ambas
decididas `ACEITAR`, liberariam `quantidade_reprovada` **duas vezes**.

O motor recusa liberar mais do que está bloqueado — mas o bloqueado é um **pool do material**. Se
o material tiver outro bloqueio de outra origem, a segunda liberação **passa**, e o sistema devolve
ao disponível um material que ninguém liberou.

**Consequência de desenho: a trava de idempotência mora na INSPEÇÃO, não na NC.** Coluna nova
`inspecoes_recebimento_almoxarifado.liberacao_nc_em`, reivindicada com
`WHERE id = ? AND liberacao_nc_em IS NULL` — o mesmo padrão de claim que
`recebimentos_material_itens_almoxarifado.entrada_estoque_em` já usa para a entrada física.
Colocar a trava na NC (`status = 'DECIDIDA'`) protegeria contra decidir a mesma NC duas vezes, que
já está protegido, e **não** contra duas NCs da mesma inspeção — que é o buraco real.

> **A RN-09 fecha o mesmo buraco por outro lado** (só NC automática libera, e o gancho abre no
> máximo uma por inspeção). **As duas ficam**, de propósito: a RN-09 depende de raciocínio sobre
> quantas NCs automáticas podem existir, e a coluna não depende de raciocínio nenhum. A coluna
> também é o que torna o **backfill** possível, e sem backfill o "não retroage" da seção 7 é uma
> promessa vazia.

### F0-3 — `quantidade_reprovada` **não** está no fato congelado da NC

A NC congela `quantidade_esperada`, `quantidade_recebida` e `divergencia` **do item de
recebimento**. A quantidade **reprovada** mora só em
`inspecoes_recebimento_almoxarifado.quantidade_reprovada`. Logo a liberação lê a inspeção na hora
de executar (`getInspecao` já devolve `i.*` + `material_id`, `nonConformityService.js:141`).

Isso seria frágil se a inspeção fosse editável — **não é**: *"inspeção decidida não pode ser
reaberta nem corrigida"* é limitação declarada da spec 09. O valor é estável. **Escrito aqui para
que ninguém "conserte" a imutabilidade da inspeção sem lembrar que esta etapa passou a depender
dela.**

### F0-4 — O pool é do material; a exatidão é por convenção

`materiais_almoxarifado.quantidade_bloqueada` (`schema.js:787`) é agregado **por código de
material**. Não existe vínculo entre *"os 3 kg que esta inspeção reprovou"* e *"os 3 kg
bloqueados"*. Liberar o que esta NC aceitou é **decrementar o pool pela quantidade reprovada
daquela inspeção** — e a exatidão é por convenção, não por rastro.

**Isto não é para consertar, é para declarar** — mesma natureza do saldo global que o `CLAUDE.md`
declara intencional. O que a etapa **melhora** é o rastro: a movimentação de liberação carrega
`documento_vinculado = 'NC-0007'` (campo que `registrarMovimentacao` já aceita,
`stockService.js:524`), então o livro passa a dizer **qual documento** soltou aquele bloqueio.
Antes desta etapa, o livro só tinha *"Desbloqueio avulso"*.

### F0-5 — A NC de origem `RECEBIMENTO` não tem nada bloqueado

Falta de quantidade no recebimento não bloqueia material nenhum. Pedir execução numa NC dessas
tem de ser **recusa explícita com mensagem**, nunca silêncio que parece sucesso.

### F0-6 — O teto já existe no motor, e a etapa não o contorna

`stockService.js:816-827`: o ramo `DESBLOQUEIO` decrementa com
`WHERE ... COALESCE(quantidade_bloqueada,0) >= ?` e **recusa com 400**
*"Quantidade bloqueada insuficiente: N"*. A etapa passa por `registrarMovimentacao`, nunca por
`UPDATE` direto.

> **E o ramo `BLOQUEIO` NÃO tem guarda** (`stockService.js:812-814`, um `+ ?` puro). Medição da
> Fase 2, e é a razão de a seção 4 ter sido reescrita: qualquer desenho que precise "devolver o
> bloqueio" por compensação pode criar **retenção sem lastro físico** se algo consumiu o material
> no meio. O desenho novo não usa compensação de estoque nenhuma.

---

## 3. As regras de negócio

| ID | Regra |
|---|---|
| **RN-01** | Decidir uma NC de origem `INSPECAO` com `ACEITAR` ou `ACEITAR_SOB_DESVIO` **libera** a quantidade reprovada daquela inspeção: `DESBLOQUEIO` pelo motor, com a justificativa da decisão e `documento_vinculado` = o número da NC. |
| **RN-02** | A liberação é **FATAL**: se ela falhar, a decisão **não fica gravada**. Decidir "aceito" e o material continuar bloqueado em silêncio é pior que a decisão não ter sido registrada — o documento afirmaria uma coisa e o saldo diria outra. É a **inversão** do critério da Etapa 43 (lá os ganchos são não fatais, porque abrir documento a menos não corrompe saldo), e a inversão é deliberada. |
| **RN-03** | A liberação acontece **uma vez por INSPEÇÃO**, não por NC: claim em `inspecoes_recebimento_almoxarifado.liberacao_nc_em` com `WHERE liberacao_nc_em IS NULL`. Uma segunda NC da mesma inspeção decidida como aceitação **grava a decisão e não libera nada**, informando o efeito `JA_LIBERADA`. **A migração faz BACKFILL da coluna em todas as inspeções existentes**, com id próprio em `schema_migrations_almoxarifado`: sem ele, cada reprovação da história vira um vale-desbloqueio no valor da própria reprovada. |
| **RN-04** | As outras quatro decisões (`DEVOLVER`, `SUBSTITUICAO`, `ANALISE_ENGENHARIA`, `SUCATEAR`) **marcam intenção e não mexem no saldo** — efeito `NENHUMA`. `SUCATEAR` passa pelas duas pernas de aprovação do sucateamento e `DEVOLVER`/`SUBSTITUICAO` são a feature 12. Corte declarado, visível na tela. |
| **RN-05** | NC de origem `RECEBIMENTO` decidida como aceitação **não libera nada** e diz por quê: não há material bloqueado por falta de quantidade. Efeito `SEM_BLOQUEIO`. |
| **RN-06** | Inspeção com `quantidade_reprovada` nula ou zero, ou sem material resolvível: efeito `SEM_BLOQUEIO` — não há o que liberar. |
| **RN-07** | O efeito da decisão **volta na resposta** e a tela **diz o que aconteceu com o saldo**. Decidir e não ver diferença foi exatamente o que criou o furo C57. |
| **RN-08** | Nenhuma ação de perfil nova. Quem pode `decidir_nao_conformidade` executa o efeito da própria decisão; quem não pode continua tomando 403 na porta, antes de qualquer efeito. |
| **RN-09** | **Só NC aberta AUTOMATICAMENTE libera** (`aberto_automaticamente = 1`). NC aberta à mão sobre uma inspeção grava a decisão e devolve `SEM_BLOQUEIO` com mensagem própria. **É esta regra que torna verdadeiro o "efeito limitado pelo documento"** — sem ela, quem decide escolhe qual documento decidir, e portanto quanto desbloquear, entre todas as inspeções da história (achado CRITICAL da Fase 2). |
| **RN-10** | **Material inativo não trava o documento.** Se o material foi desativado, o motor recusaria com *"Material inativo não pode ser movimentado"* e, pela RN-02, a NC **nunca fecharia** — ficando presa para sempre no alerta de NC parada. Então material inativo é `SEM_BLOQUEIO` com mensagem própria: a decisão é gravada, o saldo não muda, e a tela diz por quê. |

**Ordem de precedência do efeito** (a primeira que casar vence — a Fase 2 mediu que sem isto
`RECEBIMENTO` + `DEVOLVER` casava duas regras ao mesmo tempo):

1. decisão fora de `['ACEITAR','ACEITAR_SOB_DESVIO']` → **`NENHUMA`** (RN-04)
2. `origem <> 'INSPECAO'` ou `referencia_tipo <> 'INSPECAO'` → **`SEM_BLOQUEIO`** (RN-05)
3. `aberto_automaticamente <> 1` → **`SEM_BLOQUEIO`** (RN-09)
4. inspeção inexistente, `quantidade_reprovada <= 0`, ou `material_id` nulo → **`SEM_BLOQUEIO`** (RN-06)
5. material inativo → **`SEM_BLOQUEIO`** (RN-10)
6. claim de `liberacao_nc_em` não casou → **`JA_LIBERADA`** (RN-03)
7. caso contrário → `DESBLOQUEIO` → **`LIBERADA`** (RN-01)

## 4. A ordem das operações — reescrita pela Fase 2

O ponto delicado: o SQLite deste módulo não tem transação envolvendo os passos, e a etapa declarou
a liberação **fatal**. A ordem tem de garantir as duas coisas ao mesmo tempo:
*duas decisões não liberam duas vezes* **e** *decisão gravada ⇒ material liberado*.

```
1. Validar e resolver, SEM ESCREVER    (NC existe, ABERTA, decisão do enum, justificativa;
                                        resolver inspeção/material/quantidade e CALCULAR o efeito
                                        previsto pela precedência da seção 3)
2. Claim da DECISÃO                    UPDATE ... SET status='DECIDIDA', decisao=?, ...
                                        WHERE id = ? AND status = 'ABERTA'
                                        -> não casou = 409, ANTES DE QUALQUER EFEITO (nada a desfazer)
3. Se o efeito previsto é LIBERADA:
   Claim da INSPEÇÃO                   UPDATE ... SET liberacao_nc_em = CURRENT_TIMESTAMP
                                        WHERE id = ? AND liberacao_nc_em IS NULL
                                        -> não casou = JA_LIBERADA, pula o passo 4
4. DESBLOQUEIO pelo motor              registrarMovimentacao(...)
                                        -> falhou = DESFAZ o claim da inspeção (coluna -> NULL) E
                                           DESFAZ o claim da decisão (status -> 'ABERTA', decisao/
                                           justificativa/decidido_* -> NULL, WHERE id=? AND
                                           status='DECIDIDA'), e PROPAGA o erro
5. Auditoria + retorno com o efeito
```

**Por que esta ordem, e não a que este design trazia antes** (liberar primeiro, gravar depois):

- **O 409 pós-efeito deixa de existir.** Na ordem anterior, duas decisões simultâneas da mesma NC
  podiam chegar ao motor, e a perdedora precisava **estornar o desbloqueio**. Com o claim da
  decisão em primeiro lugar, a perdedora morre antes de tocar em saldo.
- **Nenhuma compensação passa pelo motor.** E isso importa porque o ramo `BLOQUEIO` **não tem
  guarda** (F0-6): se algo consumisse o material entre o desbloqueio e a compensação, o `BLOQUEIO`
  de volta criaria **disponível negativo** — retenção sem lastro físico, que trava todo claim
  posterior até um ajuste de inventário. A Fase 2 reproduziu esse caminho.
- **Todo rollback é escrita de coluna em linha que esta requisição possui com exclusividade.** A NC
  já está `DECIDIDA` (ninguém mais entra), e nenhum outro escritor toca NC `DECIDIDA` de origem
  `INSPECAO` — `sincronizarNaoConformidadeQuantidade` só escreve em `RECEBIMENTO_ITEM`/`QUANTIDADE`.
- **O risco residual é menor.** Queda do processo entre os passos 2 e 4 deixa NC `DECIDIDA` com
  material ainda bloqueado — ruim, mas **destravável** por desbloqueio administrativo. O residual
  da ordem anterior trancava `liberacao_nc_em` para sempre: a inspeção nunca mais poderia ser
  liberada pelo fluxo, e a próxima decisão devolveria 200 dizendo *"já havia sido liberado"* com o
  material preso — silencioso e irrecuperável.

## 5. Contratos de API

### `POST /api/almoxarifado/nao-conformidades/:id/decidir` — **aditivo**

Payload **inalterado**: `{ decisao, justificativa }`. Permissão **inalterada**:
`decidir_nao_conformidade`.

Resposta: o objeto da NC como hoje, **mais** o campo aditivo `liberacao`, **sempre presente**, com
`quantidade` e `material_id` em **`null`** quando não houve liberação (forma congelada — T2 e T3
rodam em paralelo contra ela):

```json
{ "...": "campos atuais da NC",
  "liberacao": { "efeito": "LIBERADA", "quantidade": 3, "material_id": 12,
                 "mensagem": "3 liberado(s) do bloqueio" } }
```

| `efeito` | Quando | `mensagem` **literal congelada** |
|---|---|---|
| `LIBERADA` | RN-01 | `"{q} liberado(s) do bloqueio"` |
| `JA_LIBERADA` | RN-03 | `"O material desta inspeção já havia sido liberado"` |
| `SEM_BLOQUEIO` | RN-05 / RN-06 | `"Esta não conformidade não tem material bloqueado para liberar"` |
| `SEM_BLOQUEIO` | RN-09 | `"Não conformidade aberta manualmente não libera saldo"` |
| `SEM_BLOQUEIO` | RN-10 | `"Material inativo — a decisão foi registrada sem liberar saldo"` |
| `NENHUMA` | RN-04 | `"Esta decisão não altera o saldo"` |

Erros — todos **antes** de qualquer efeito:

| Código | Mensagem literal | Quando |
|---|---|---|
| 400 | `"Decisão inválida"` | fora do enum (já existe) |
| 400 | `"Justificativa é obrigatória para decidir a não conformidade"` | já existe |
| 400 | `"Quantidade bloqueada insuficiente: {n}"` | do motor, RN-02 — a decisão **não** é gravada |
| 404 | `"Não conformidade não encontrada"` | já existe |
| 409 | `"Esta não conformidade já foi encerrada"` | já existe — e agora sempre **antes** de efeito |

## 6. A tela

`NaoConformidadesAlmoxarifado.js`, `submeterDecisao`: o toast de sucesso passa a dizer o efeito.

- `LIBERADA` → `"Não conformidade NC-0007 decidida! 3 liberado(s) do bloqueio"`
- os outros três efeitos → o toast atual **mais** a `mensagem` do efeito, para que
  `NENHUMA` seja uma informação e não um silêncio.
- resposta **sem** o campo `liberacao` (servidor antigo) → o toast atual, sem `undefined`.

Nenhum campo novo no formulário. Nenhuma permissão nova a esconder.

## 7. O que esta etapa NÃO cobre

- **Não dá à QUALIDADE o bloqueio/desbloqueio avulso** (B56 continua aberta).
- **Não executa `SUCATEAR`, `DEVOLVER` nem `SUBSTITUICAO`** (RN-04).
- **Não liga a liberação ao lote** — o bloqueio continua sendo pool do material (F0-4).
- ⚠️ **O STATUS DO LOTE É UM SEGUNDO PORTÃO, e a liberação NÃO o abre.** Achado da Fase 2: num
  material com controle de lote, se a Qualidade pôs o lote em `REPROVADO`
  (`PUT /lotes/:id/status`, gate `inspecionar`, que ela **tem**), a liberação devolve o material ao
  pool disponível e mesmo assim a saída responde **400** *"Lote X esta reprovado e nao pode ser
  utilizado"* (`stockService.js:719-723`). A tela diria "3 liberado(s) do bloqueio" e a produção
  não conseguiria retirar. **É comportamento correto do código e precisa estar no guia**: liberar
  a NC não reabilita o lote; isso é um gesto separado, na tela de lotes. T4 fixa o comportamento
  por teste para ninguém "consertar" como regressão.
- ⚠️ **Duas NCs da mesma inspeção com decisões contraditórias:** a primeira aceitação libera a
  quantidade reprovada **inteira** da inspeção, mesmo que outra NC da mesma inspeção tenha sido
  decidida `DEVOLVER`. A RN-09 reduz muito o caso (só a automática libera, e o gancho abre uma
  por inspeção), mas não o elimina. **Descartado:** recusar a liberação enquanto existir outra NC
  `ABERTA` da mesma inspeção — criaria o beco "documento que nunca fecha" que a RN-10 existe para
  evitar. Registrar na **letra B**.
- **Não retroage**: inspeções anteriores ao deploy nascem com `liberacao_nc_em` preenchido pelo
  backfill (RN-03) e portanto **nunca liberam**. Consulta de produção para a **letra A**.

## 8. O que a Fase 2 mudou neste design

15 achados, 2 CRITICAL, todos com cenário concreto. Os que mudaram o desenho:

1. **CRITICAL — a porta lateral da NC manual** (achado 10): virou a **RN-09** + o backfill da
   RN-03. Sem os dois, a etapa entregaria à QUALIDADE um desbloqueio de pool sem `ajustar_estoque`.
2. **CRITICAL — a compensação incondicional no caminho `JA_LIBERADA`** (achado 1) e o **claim órfão
   permanente** (achado 2): resolvidos pela reordenação da seção 4.
3. **O `BLOQUEIO` compensatório podia criar disponível negativo** (achado 4) e tinha modo de falha
   próprio (achado 5): a compensação de estoque **deixou de existir**.
4. **O portão do lote** (achado 7) e **o material inativo** (achado 8): seção 7 e RN-10.
5. **Precedência e literais do contrato** (achado 14): fixadas na seção 3 e na 5.

## 9. Correções ao que este design afirmava — à vista, não apagadas

- **"não `cancelarMovimentacao` (que recusa movimento de inspeção por decisão da Etapa 5)"** —
  **ESTAVA FACTUALMENTE ERRADO.** `cancelarMovimentacao` recusa `QUARENTENA`,
  `LIBERACAO_INSPECAO`, `REPROVACAO_INSPECAO` e `DECISAO_INSPECAO` (`stockService.js:1440-1444`);
  o movimento em questão é um **`DESBLOQUEIO`**, que **não** está na lista e **tem** ramo de
  reversão (`:1756-1758`). A frase toda saiu porque a compensação saiu, mas fica registrada aqui:
  quem a lesse acreditaria que `DESBLOQUEIO` não é estornável, e não é isso que o código faz.
- **"o efeito fica limitado pelo documento: só a quantidade reprovada daquela inspeção, uma vez
  só"** (F0-1) — **era uma promessa sem implementação** até a RN-09 e o backfill existirem. A frase
  continua na F0-1 com a ressalva ao lado, porque o raciocínio dela é o que justifica não criar
  ação de perfil nova; o que faltava era o mecanismo.
