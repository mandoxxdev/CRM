# Etapa 47 — O motor de aprovações ganha regras, e a requisição de alto valor passa a ser cobrada (desenho)

> **Data:** 2026-09-30 · **Feature:** 06 (Motor de aprovações), com efeito em 04 (Requisições) e 19 (E-mails)
> **Fase 0:** na seção "Fase 0 da Etapa 47" de
> `docs/superpowers/plans/2026-09-30-almoxarifado-etapa46-nc-destravada.md`, **com a correção da
> Fase 1 no fim dela** — leia as duas: a primeira exagera a ausência que a segunda mede.

---

## 1. Por que esta feature, e o que está medido

A feature 06 é a 🟡 **mais antiga sem retorno** (último toque na Etapa 3, 2026-08-05) e a spec dela
carrega **dois achados medidos em 2026-08-29 e nunca consertados**. Reverifiquei os dois em
2026-09-30 e os dois continuam de pé.

| Medição | Resultado |
|---|---|
| `limite_aprovacao_auto` no repositório inteiro | **1 ocorrência: o seed** (`schema.js:2348`). Zero leitores |
| tabela `regras_aprovacao` | **não existe** (`grep -c` → 0) |
| `WHERE` do lembrete de requisição parada | `requisitionReminderService.js:252` → `status = 'PENDENTE'` |
| status da requisição travada por valor | `AGUARDANDO_APROVACAO_VALOR` (`requisitionValueApprovalService.js:14`) |
| a régua de valor que existe | `liberacao_valor_limite`, padrão R$ 500 (`schema.js:2378`) |
| quem é aprovador de valor | `isAprovadorValor` (`:90-95`): **admin** OU id na lista `aprovadorIds` da config |
| aviso na ENTRADA do status | **existe**: `notificarAprovadoresValor` (`:112`, `:322-334`) |
| cobrança RECORRENTE nesse status | **não existe** |

---

## 2. O que esta etapa NÃO é

**Não é "criar notificação para a requisição de alto valor".** Isso existe. A Fase 0 escreveu que
*"a requisição que mais precisa de cobrança é a única que fica sem ela"* — frase que veio da própria
spec 06 — e a medição da Fase 1 mostrou que ela **exagera**: os aprovadores recebem e-mail **no
instante** em que a requisição entra no status.

**O que falta é a COBRANÇA DE PERMANÊNCIA.** O aviso sai **uma vez** e nunca repete; o lembrete
diário, que reincide para `PENDENTE`, não alcança este status. A requisição de alto valor tem
**notificação de nascimento e nenhuma cobrança de permanência**. É a mesma forma do **C64** da Etapa
46 — o estado que mais precisa de superfície é o que nenhuma superfície **continua** cobrando —, mas
uma dobra mais fraca do que a spec afirmava, e o desenho tem de refletir a força real.

**Não reescreve a segregação nem a rejeição justificada.** As duas existem desde a Etapa 3, **nas
duas lanes**, com registro imutável via `auditoria_log_almoxarifado`, e a spec as marca como pagas.

---

## 3. As regras de negócio

**RN-01 — O lembrete alcança `AGUARDANDO_APROVACAO_VALOR`.** `buscarRequisicoesElegiveis`
(`requisitionReminderService.js:248`) passa a cobrir os **dois** status. A régua de reincidência
(`ultimo_lembrete_enviado IS NULL OR <= now - intervalo`) e a de maturação
(`updated_at <= now - intervalo`) **não mudam** — elas já servem.

**RN-02 — A PLATEIA É POR STATUS, e isto é o coração da task.** `resolverDestinatarios`
(`:212-223`) hoje soma a lista de `requisicoes_notificar_emails` ao e-mail do **`aprovador_id`** da
requisição. Para `AGUARDANDO_APROVACAO_VALOR` o destinatário certo é **quem pode liberar por
valor** — `getEmailsAprovadores` (`requisitionValueApprovalService.js:313`), que já existe e já cai
para a lista geral quando não há aprovador configurado.
⚠️ **Não misturar as duas plateias num lembrete só**, e a razão é medida: a Etapa 46 pagou
exatamente essa lição ao criar uma entrada de alerta **por dono e por prazo**, em vez de afrouxar a
régua da vizinha. Quem aprova requisição e quem libera por valor são listas **diferentes por
configuração** — `aprovadorIds` é uma config própria.
*Cenário:* requisição de R$ 900 (limite 500) fica em `AGUARDANDO_APROVACAO_VALOR`; passado o
intervalo, o lembrete sai para os **aprovadores de valor**, e **não** para o `aprovador_id`.

**RN-03 — A mensagem diz QUAL gesto está pendente.** `buildMensagemLembrete` (`:77`) escreve
"aguardando aprovação". Para o status novo ela tem de dizer **liberação por valor**, com o
**valor total** e o **limite** — porque é o número que explica por que a requisição parou.
*Cenário:* o corpo do e-mail traz *"Aguardando liberação por valor"* e o valor, e **não** a frase
da lane normal.

**RN-04 — `limite_aprovacao_auto` SAI do seed.** A configuração aparece na tela prometendo
*"Quantidade máxima para aprovação automática por item"*, e **aprovação automática por quantidade
não existe**. A spec 06 manda escolher: *"ou ganha leitor, ou sai do seed"*.
**Escolhido: sair.** **Descartado:** implementar aprovação automática por quantidade — é regra de
negócio que ninguém pediu, e criá-la para justificar uma linha de seed é a cauda abanando o
cachorro. Remover a promessa é **reversível**; criar a regra não.
⚠️ **E remover config exige cuidado medido:** a linha do seed some, mas **a linha já gravada no banco
de produção permanece**. A T2 tem de decidir e declarar: `DELETE` na migração (destrutivo, mas de
uma chave sem leitor) **ou** deixá-la órfã no banco e fora da tela. **A reversível é tirar da tela e
do seed, sem `DELETE`** — dado que ninguém lê não faz mal, e apagar é irreversível.

**RN-05 — `regras_aprovacao` como entidade.** Tabela com critérios combináveis: tipo de requisição,
criticidade do material, valor, quantidade, projeto/centro de custo. Uma requisição pode casar **N
regras** e portanto exigir **N aprovações**.

**RN-06 — O avaliador roda no ENVIO e gera a lista de pendências.** Sem ele a tabela é a mesma
`limite_aprovacao_auto` de novo: escrita, configurável na tela, e sem quem leia. **Nenhuma regra
entra sem leitor no mesmo commit.**

**RN-07 — A segregação da Etapa 3 vale em CADA aprovação.** O solicitante não aprova a própria
requisição, e isso não pode enfraquecer porque agora há N aprovações: **cada uma** passa pela mesma
barreira, e a mesma pessoa **não** satisfaz duas regras diferentes.
*Cenário:* requisição que casa duas regras precisa de **duas pessoas distintas**.

---

## 4. Sort topológico

| Task | O que é | Classificação |
|---|---|---|
| **T1** | RN-01/02/03 — o lembrete alcança o status, com plateia e mensagem por status | **tronco** |
| **T2** | RN-04 — `limite_aprovacao_auto` sai do seed e da tela | **tronco** |
| **T3** | RN-05 — tabela `regras_aprovacao` + migração | **tronco** |
| **T4** | RN-06/07 — o avaliador, as N pendências e a segregação por aprovação | **tronco** |
| **T5** | a aba de configuração das regras | **galho** |
| **T6** | a tela da fila de aprovações pendentes | **galho** |
| **T7** | integração cruzando os galhos | **tronco** |

**T1 e T2 vêm primeiro de propósito:** são defeitos **na própria feature** que a etapa constrói.
Empilhar regras configuráveis sobre um lembrete que não alcança metade dos estados, e ao lado de uma
config que promete o que não existe, seria construir em cima de furo conhecido — e esta base tem o
precedente medido: a Etapa 46 descobriu que a 43 havia fechado uma classe **pela metade**.

---

## 5. Fora de escopo, declarado

1. **Material fora da lista técnica → aprovação da Engenharia** — depende da feature 22.
2. **Dupla aprovação de ajuste de estoque** — depende da feature 17.
3. **Não mexe na régua de valor existente** (`liberacao_valor_limite`): ela funciona, tem tela e
   tem plateia. As regras novas **somam**, não substituem.

---

## 6. Contratos congelados — as literais da T1

O lembrete de hoje (medido em `requisitionReminderService.js:79` e `:106`) escreve:

- assunto: `Lembrete: Requisição <NUMERO> aguardando aprovação há <N> dia(s)`
- título do corpo texto: `LEMBRETE — REQUISIÇÃO AGUARDANDO APROVAÇÃO`

**A variante do status novo espelha a forma e troca o gesto**, porque é o gesto que muda de dono:

| Onde | Literal congelada |
|---|---|
| assunto | `Lembrete: Requisição <NUMERO> aguardando liberação por valor há <N> dia(s)` |
| título (texto) | `LEMBRETE — REQUISIÇÃO AGUARDANDO LIBERAÇÃO POR VALOR` |
| linha nova no corpo | `Valor total: R$ <VALOR> (limite de liberação automática: R$ <LIMITE>)` |
| título (HTML) | `Aguardando liberação por valor` |

**Por que a linha do valor é obrigatória e não enfeite:** ela é **o número que explica por que a
requisição parou**. Sem ela o aprovador de valor recebe um lembrete idêntico ao da lane normal e não
sabe se o que falta é a aprovação dele ou a de outra pessoa — e ele é, por configuração, uma
**plateia diferente**.

**O plural de `dia(s)`** segue a forma que já existe (`dia${dias === 1 ? '' : 's'}`), e não
`dia(s)` cru: o assunto atual já é flexionado, e trocar isso mudaria e-mail que funciona.

### O que NÃO ganha literal nova na T1

**Nada de recusa.** A T1 não acrescenta porta HTTP nem validação: ela estende uma varredura que já
roda e uma resolução de destinatário que já existe. **Se durante a execução aparecer necessidade de
uma recusa nova, isso é sinal de que a task cresceu além do desenho** — pare e registre, em vez de
inventar literal fora do contrato.

### As literais de T3/T4 ficam para a Fase 1-b

A tabela de regras e o avaliador **têm** recusas (regra sem critério nenhum, regra que exige
aprovação de quem não existe, requisição que casa regra desativada com pendência em aberto), e elas
**não estão congeladas aqui de propósito**: o desenho delas depende do formato final dos critérios,
que a T3 fixa. **Congelar literal antes de o formato existir é como a Etapa 45 congelou seis
mensagens e terminou com oito** — duas nasceram na execução, e a tabela do design ficou defasada até
o fechamento.

**A Fase 2 tem de cobrar essa tabela**, e o plano já manda o revisor exigi-la.
