# Design — Almoxarifado Etapa 5: Quarentena e Bloqueio Efetivos no Saldo (features 08 + 09)

> Specs: `specs/modulo-almoxarifado/08-recebimento/README.md` ·
> `specs/modulo-almoxarifado/09-inspecao-qualidade/README.md`
> Requisitos originais: seções 9 (inspeção) e 13.1 (tipos de saída) de
> `2026-08-02-requisitos-modulo-almoxarifado.md`.
> Contexto de negócio: almoxarifado é área física do mesmo site; saldo global por material.

## O problema central que a etapa fecha

Mesma classe da Etapa 4: a coluna existe, a fórmula do disponível já subtrai, mas o ciclo nunca
fecha. Verificado no código em 2026-08-07:

`receiptService.inspecionarItem` (`receiptService.js:412-416`), na ação `BLOQUEAR`:

```js
UPDATE materiais_almoxarifado
SET quantidade_bloqueada  = COALESCE(quantidade_bloqueada,0)  + ?,
    quantidade_em_inspecao = COALESCE(quantidade_em_inspecao,0) + ?   -- mesma quantidade
WHERE id = ?
```

Quatro defeitos num único statement:

1. **Conta em dobro.** O disponível é `atual − reservada − bloqueada − em_inspecao`. Somar a
   mesma quantidade nas duas colunas tira o dobro do disponível: bloquear 10 remove 20.
2. **Não passa pelo motor.** É `UPDATE` direto, então não gera movimentação — o bloqueio não
   existe no livro, e ninguém consegue responder quem bloqueou, quando e por quê.
3. **Bloqueia saldo que ainda não entrou.** Hoje a inspeção acontece **antes** da entrada
   (`darEntradaEstoque:315-322` recusa aprovar item crítico sem inspeção). Então o incremento
   recai sobre o saldo de *outras* entradas do mesmo material, ou deixa o disponível negativo.
4. **Não há caminho de volta.** Nada no sistema decrementa `quantidade_em_inspecao`. O motor tem
   `BLOQUEIO`/`DESBLOQUEIO` simétricos (`stockService.js:279-286`), mas os dois só mexem em
   `quantidade_bloqueada`. O que entra em inspeção fica preso para sempre.

E a quarentena que a spec 09 descreve — *"entrada inspecionável nasce em_inspecao"* — **não
existe**: material inspecionável entra direto no disponível.

O requisito original é explícito (linha 500): *"Materiais em inspeção, quarentena ou não
conformidade não deverão aparecer como estoque disponível."*

Ninguém usa a inspeção hoje (confirmado com o dono do produto). Não há dado legado a corrigir —
e, como na feature 07, a razão de nunca ter sido usada é que ela não funciona.

## Decisões de escopo

1. **Material inspecionável entra RETIDO, não fica de fora do estoque.** O físico sobe na
   entrada e a quantidade vai para `em_inspecao`, fora do disponível. Alternativa considerada e
   descartada: manter o modelo atual ("não entra até aprovar"). O material está fisicamente no
   galpão desde que o caminhão descarregou; um sistema que diz que ele não existe mente sobre a
   realidade física, e o inventário da Etapa 10 vai encontrar material que o sistema nega. Como
   efeito colateral, isto conserta o defeito 3: quando a inspeção age, o saldo já existe.

2. **Três tipos de movimentação novos**, seguindo a simetria que o motor já usa para
   `BLOQUEIO`/`DESBLOQUEIO` (movimento que mexe em coluna de retenção sem tocar o físico):

   | Tipo | Efeito | Quando |
   |---|---|---|
   | `QUARENTENA` | `em_inspecao += q` | Entrada de item que exige inspeção |
   | `LIBERACAO_INSPECAO` | `em_inspecao −= q` | Inspeção aprova |
   | `REPROVACAO_INSPECAO` | `em_inspecao −= q`, `bloqueada += q` | Inspeção reprova |

   **Reprovar é UM movimento, não dois.** Compor `LIBERACAO_INSPECAO + BLOQUEIO` deixaria o
   material, entre as duas instruções, nem retido nem bloqueado — ou seja, disponível. Uma saída
   concorrente nessa janela consome material reprovado.

3. **Atomicidade pelo padrão do módulo**: `UPDATE` condicional com guarda
   `quantidade_em_inspecao >= ?`, mesmo padrão de `stockService.js:290` e do consumo contra
   reserva. Isso faz a regra que a spec 09 cobra — *"aprovar inspeção duas vezes não duplica
   saldo"* — cair de graça, sem flag de controle nem leitura-antes-de-escrever.

4. **A inspeção vira passo POSTERIOR à entrada.** `darEntradaEstoque` deixa de recusar item
   crítico sem inspeção e passa a dar entrada retendo. A config `inspecao_material_critico`
   sobrevive com significado novo: `1` = retém na entrada (antes: barra a entrada). Não é
   renomeada — o nome ainda descreve o que faz, e renomear config quebraria instalação existente
   sem ganho.

5. **Encaminhamentos registráveis na inspeção** (requisito original linha 493: *"Solicitar
   análise da Engenharia / Solicitar devolução ao fornecedor / Solicitar substituição"*). A
   coluna `acao` de `inspecoes_recebimento_almoxarifado` já existe e o código já usa `'DEVOLVER'`.
   Reprovar aceita um encaminhamento, que fica registrado junto ao bloqueio. **A execução da
   saída fica fora** — é a feature 12 (Devoluções) e o tipo de saída da seção 13.1. O requisito
   original separa "solicitar" de "executar"; esta etapa entrega só o primeiro.

6. **Bloqueio avulso de material em prateleira**, com motivo obrigatório. O motor já faz o
   trabalho (`BLOQUEIO`/`DESBLOQUEIO`); falta expor por rota e botão. Sem isso, peça achada com
   defeito continua sendo consumida.

7. **Aprovação parcial entra** (requisito original linha 488: *"Aprovar parcialmente"*). Recebeu
   100 e 10 vieram amassadas é o caso comum; sem ela o inspetor precisa reprovar o lote inteiro
   ou aprovar peça ruim. O custo é baixo — as duas colunas de quantidade e a divisão do saldo
   entre `LIBERACAO_INSPECAO` e `REPROVACAO_INSPECAO`, que já são os dois movimentos existentes.
   A guarda é que aprovado + reprovado tem de fechar com o que estava retido, senão sobra saldo
   preso em quarentena sem ninguém dono dele.

## Ponto de atenção: `acao = 'DEVOLVER'` muda de significado

`darEntradaEstoque:321` hoje faz:

```js
if (insp && insp.acao === 'DEVOLVER') continue;   // item marcado para devolução NÃO entra
```

Com a inspeção acontecendo depois da entrada, essa linha nunca mais dispararia — o material já
entrou quando alguém decide devolver. Precisa mudar de "não dá entrada" para "reprova e registra
o encaminhamento", deixando o material em `bloqueada` aguardando a saída da feature 12.

Deixar como está criaria uma linha morta que silenciosamente nunca executa — exatamente a classe
de bug do `reserva_id` que o Zod descartava (Etapa 4) e do `expira_em` que ninguém populava.

## Ponto de atenção: justificativa em BLOQUEIO

Bloquear material sem dizer por quê é como estorno sem motivo. `movementRules.js` ganha
`justificativa: true` para `BLOQUEIO`, `DESBLOQUEIO` e `REPROVACAO_INSPECAO`.

**Existe um chamador atual**: `returnService.js:31` cria `BLOQUEIO` com
`motivo: 'Devolução para quarentena'`. `motivo` e `justificativa` são campos distintos — sem
ajustar esse chamador, a mudança quebra a devolução para quarentena. A task correspondente tem de
tratá-lo, e há teste de regressão para isso.

## Dados

`inspecoes_recebimento_almoxarifado` (safeAlter):
`encaminhamento TEXT` (`DEVOLVER` | `ANALISE_ENGENHARIA` | `SUBSTITUICAO` | null) ·
`quantidade_aprovada REAL` · `quantidade_reprovada REAL` (a spec original prevê "aprovar
parcialmente"; sem as duas colunas, aprovação parcial não teria onde ser registrada).

`TIPOS_MOVIMENTO` (`schema.js:47`) ganha `QUARENTENA`, `LIBERACAO_INSPECAO`,
`REPROVACAO_INSPECAO`.

Nenhuma tabela nova. Nenhuma coluna nova em `materiais_almoxarifado` — `quantidade_em_inspecao` e
`quantidade_bloqueada` já existem e já entram na fórmula do disponível.

## Regras essenciais (cada uma nasce com teste de API)

| Regra | Por que importa |
|---|---|
| Entrada de material que exige inspeção soma ao físico e ao `em_inspecao`, e o disponível NÃO sobe | o contrato da quarentena |
| Material em quarentena não pode sair | quarentena que não barra saída é decorativa |
| Aprovar inspeção move para o disponível **exatamente uma vez** | cobrada pela spec 09; o UPDATE condicional é quem garante |
| Aprovar duas vezes → 400, saldo inalterado | idempotência |
| Reprovar move de `em_inspecao` para `bloqueada` num único movimento | sem janela de "disponível" no meio |
| Saída de material bloqueado falha | cobrada pela spec 09 |
| Bloquear/desbloquear avulso exige justificativa e gera movimentação | rastro — hoje o bloqueio não existe no livro |
| Desbloquear devolve ao disponível e não passa do que estava bloqueado | espelha o guarda da liberação de reserva |
| Aprovação parcial: aprovado vai ao disponível, reprovado ao bloqueado, soma = recebido | a spec original prevê "aprovar parcialmente" |
| Reprovar com encaminhamento registra o destino pretendido | é o "solicitar devolução" do requisito 493 |
| Material NÃO inspecionável entra direto no disponível (regressão) | o caminho comum não pode ser afetado |
| `returnService` continua bloqueando na devolução para quarentena (regressão) | o chamador existente de BLOQUEIO |

## Frontend

- **Fila de inspeções pendentes** (`InspecoesAlmoxarifado.js`, nova): o que está retido, de qual
  recebimento, há quanto tempo; aprovar (total ou parcial), reprovar com motivo e encaminhamento.
- **Material**: ação de bloquear/desbloquear com motivo, no padrão de permissões do módulo
  (`bloquearSeNaoPode('inspecionar' | 'ajustar_estoque')`).
- **Extrato do material**: `em_inspecao` já aparece como cartão de saldo; passa a listar o que
  está retido e por qual recebimento.

Sem tela, isto repete o erro da feature 07 — backend correto que ninguém usa, e a etapa seguinte
descobre que a feature "existia" só no banco.

## Fora do escopo (registrar na spec)

Planos de inspeção com medidas e instrumento (feature 16) · não conformidade formal numerada ·
liberação sob desvio autorizado · execução da devolução ao fornecedor (feature 12) · perfil
QUALIDADE separado de ALMOXARIFE · tipos de entrada da spec 8.1 · conferência física estruturada
com contagem/pesagem/fotos.

**Pendência conhecida que esta etapa cria:** material reprovado fica bloqueado até alguém
desbloquear e dar baixa manual, sem vínculo ao recebimento de origem. O encaminhamento registrado
é o que permitirá à feature 12 montar a fila do que precisa voltar ao fornecedor. Registrar na
spec 09 como pendência, no formato usado na Etapa 4.
