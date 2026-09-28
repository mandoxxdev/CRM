# Etapa 44 — a QUALIDADE executa a própria decisão (feature 09)

> **Design.** Escrito em 2026-09-28, depois da Fase 0 medida no código. Fecha o furo **C57**:
> a Qualidade decide `ACEITAR` / `ACEITAR_SOB_DESVIO` numa não conformidade e **o material
> continua bloqueado**, porque quem desbloqueia é uma rota gateada por `ajustar_estoque`, que
> não inclui QUALIDADE.

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
`requirePermission`: são efeito do ato já autorizado"*. O efeito fica **limitado pelo documento**:
só a quantidade reprovada daquela inspeção, uma vez só, com rastro no livro e na auditoria.

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

**Consequência de desenho, e é a decisão estrutural desta etapa: a trava de idempotência mora na
INSPEÇÃO, não na NC.** Coluna nova
`inspecoes_recebimento_almoxarifado.liberacao_nc_em`, reivindicada com
`WHERE id = ? AND liberacao_nc_em IS NULL` — o mesmo padrão de claim que
`recebimentos_material_itens_almoxarifado.entrada_estoque_em` já usa para a entrada física.
Colocar a trava na NC (`status = 'DECIDIDA'`) protegeria contra decidir a mesma NC duas vezes, que
já está protegido, e **não** contra duas NCs da mesma inspeção — que é o buraco real.

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

---

## 3. As regras de negócio

| ID | Regra |
|---|---|
| **RN-01** | Decidir uma NC de origem `INSPECAO` com `ACEITAR` ou `ACEITAR_SOB_DESVIO` **libera** a quantidade reprovada daquela inspeção: `DESBLOQUEIO` pelo motor, com a justificativa da decisão e `documento_vinculado` = o número da NC. |
| **RN-02** | A liberação é **FATAL**: se ela falhar, a decisão **não fica gravada**. Decidir "aceito" e o material continuar bloqueado em silêncio é pior que a decisão não ter sido registrada — o documento afirmaria uma coisa e o saldo diria outra. É a **inversão** do critério da Etapa 43 (lá os ganchos são não fatais, porque abrir documento a menos não corrompe saldo), e a inversão é deliberada. |
| **RN-03** | A liberação acontece **uma vez por INSPEÇÃO**, não por NC: claim em `inspecoes_recebimento_almoxarifado.liberacao_nc_em` com `WHERE liberacao_nc_em IS NULL`. Uma segunda NC da mesma inspeção decidida como aceitação **grava a decisão e não libera nada**, informando o efeito `JA_LIBERADA`. |
| **RN-04** | As outras quatro decisões (`DEVOLVER`, `SUBSTITUICAO`, `ANALISE_ENGENHARIA`, `SUCATEAR`) **marcam intenção e não mexem no saldo** — efeito `NENHUMA`. `SUCATEAR` passa pelas duas pernas de aprovação do sucateamento e `DEVOLVER`/`SUBSTITUICAO` são a feature 12. Corte declarado, visível na tela. |
| **RN-05** | NC de origem `RECEBIMENTO` decidida como aceitação **não libera nada** e diz por quê: não há material bloqueado por falta de quantidade. Efeito `SEM_BLOQUEIO`. |
| **RN-06** | Inspeção com `quantidade_reprovada` nula ou zero: efeito `SEM_BLOQUEIO` também — não há o que liberar. |
| **RN-07** | O efeito da decisão **volta na resposta** e a tela **diz o que aconteceu com o saldo**. Decidir e não ver diferença foi exatamente o que criou o furo C57. |
| **RN-08** | Nenhuma ação de perfil nova. Quem pode `decidir_nao_conformidade` executa o efeito da própria decisão; quem não pode continua tomando 403 na porta, antes de qualquer efeito. |

## 4. A ordem das operações — e a compensação

O ponto delicado: o SQLite deste módulo não tem transação envolvendo os três passos, e a etapa
declarou a liberação **fatal**. A ordem tem de garantir as duas coisas ao mesmo tempo:
*duas decisões simultâneas não liberam duas vezes* **e** *decisão gravada ⇒ material liberado*.

```
1. Validar e resolver           (NC existe, ABERTA, decisão do enum, justificativa não vazia;
                                 resolver origem/inspeção/material/quantidade)
2. Claim da INSPEÇÃO            UPDATE ... SET liberacao_nc_em = CURRENT_TIMESTAMP
                                 WHERE id = ? AND liberacao_nc_em IS NULL
                                 -> não casou = JA_LIBERADA (segue para o passo 4 sem liberar)
3. DESBLOQUEIO pelo motor        registrarMovimentacao(...)
                                 -> falhou = DESFAZ o claim do passo 2 e PROPAGA o erro
                                    (a decisão ainda não foi gravada: nada a desfazer nela)
4. Claim da DECISÃO              UPDATE ... SET status='DECIDIDA' ... WHERE id=? AND status='ABERTA'
                                 -> não casou = alguém decidiu no meio: DESFAZ o claim do passo 2,
                                    ESTORNA o desbloqueio e recusa com 409
5. Auditoria + retorno com o efeito
```

**Por que a liberação vem ANTES da gravação da decisão, e não depois:** se a decisão fosse gravada
primeiro, uma falha na liberação deixaria o documento dizendo "aceito" com o material preso — que
é precisamente o estado que a RN-02 existe para proibir. Invertendo, a pior falha possível é o
inverso: material liberado e decisão não gravada. Isso é **visível** (a NC continua ABERTA e volta
a cobrar no alerta) e **recuperável** (decidir de novo, que agora vê `JA_LIBERADA`), enquanto o
estado oposto é silencioso.

**O passo 4 é a janela restante** e está fechada pelo claim `WHERE status = 'ABERTA'`, que já
existe desde a Etapa 43. O estorno do passo 3, nesse caminho, é um `BLOQUEIO` compensatório pelo
motor — não um `UPDATE` direto e não `cancelarMovimentacao` (que recusa movimento de inspeção por
decisão da Etapa 5; ver "Limitações" da spec 09).

> **Ponto explícito para a Fase 2 revisar:** este é o desenho de maior risco da etapa. Se o
> revisor achar uma sequência mais simples com as mesmas duas garantias, ela ganha.

## 5. Contratos de API

### `POST /api/almoxarifado/nao-conformidades/:id/decidir` — **aditivo**

Payload **inalterado**: `{ decisao, justificativa }`. Permissão **inalterada**:
`decidir_nao_conformidade`.

Resposta: o objeto da NC como hoje, **mais** o campo aditivo `liberacao`:

```json
{ "...": "campos atuais da NC",
  "liberacao": {
    "efeito": "LIBERADA | JA_LIBERADA | SEM_BLOQUEIO | NENHUMA",
    "quantidade": 3,
    "material_id": 12,
    "mensagem": "3 liberados do bloqueio"
  } }
```

| `efeito` | Quando | `mensagem` literal |
|---|---|---|
| `LIBERADA` | RN-01 cumprida | `"{q} liberado(s) do bloqueio"` |
| `JA_LIBERADA` | RN-03: outra NC da mesma inspeção já liberou | `"O material desta inspeção já havia sido liberado"` |
| `SEM_BLOQUEIO` | RN-05 e RN-06 | `"Esta não conformidade não tem material bloqueado para liberar"` |
| `NENHUMA` | RN-04: decisão que não é de aceitação | `"Esta decisão não altera o saldo"` |

Erros — todos **antes** de qualquer efeito, exceto o 409 do passo 4:

| Código | Mensagem literal | Quando |
|---|---|---|
| 400 | `"Decisão inválida"` | fora do enum (já existe) |
| 400 | `"Justificativa é obrigatória para decidir a não conformidade"` | já existe |
| 400 | `"Quantidade bloqueada insuficiente: {n}"` | do motor, RN-02 — a decisão **não** é gravada |
| 404 | `"Não conformidade não encontrada"` | já existe |
| 409 | `"Esta não conformidade já foi encerrada"` | já existe |

## 6. A tela

`NaoConformidadesAlmoxarifado.js`, `submeterDecisao`: o toast de sucesso passa a dizer o efeito.

- `LIBERADA` → `"Não conformidade NC-0007 decidida! 3 liberado(s) do bloqueio"`
- os outros três efeitos → o toast atual **mais** a `mensagem` do efeito, para que
  `NENHUMA` seja uma informação e não um silêncio.

Nenhum campo novo no formulário. Nenhuma permissão nova a esconder.

## 7. O que esta etapa NÃO cobre

- **Não dá à QUALIDADE o bloqueio/desbloqueio avulso** (B56 continua aberta).
- **Não executa `SUCATEAR`, `DEVOLVER` nem `SUBSTITUICAO`** (RN-04).
- **Não liga a liberação ao lote** — o bloqueio continua sendo pool do material (F0-4).
- **Não retroage**: NCs de inspeção já decididas antes do deploy não liberam nada. Consulta de
  produção para a **letra A**.
