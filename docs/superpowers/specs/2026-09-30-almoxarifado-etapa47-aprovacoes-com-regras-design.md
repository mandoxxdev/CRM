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

> ⚠️ **A tabela abaixo foi SUBSTITUÍDA na execução da T1** — a versão original tinha três defeitos
> que a Fase 2 mediu (seção 7.6): o `R$` dobrado, a manchete HTML que não correspondia a string
> nenhuma, e o plural mal descrito. A tabela original está no histórico (`637d9fa`). Estas são as
> literais **que o código escreve**, lidas do arquivo depois da T1:

| Onde | Literal congelada (T1, lida do código) |
|---|---|
| assunto (e `<title>` do HTML) | `Lembrete: Requisição <NUMERO> aguardando liberação por valor há <N> dia`/`dias` — **flexionado**, como o assunto de hoje |
| título (texto) | `LEMBRETE — REQUISIÇÃO AGUARDANDO LIBERAÇÃO POR VALOR` |
| linha nova no corpo texto, logo após `Aguardando há: <N> dia(s)` (**cru**, como já era) | `Valor total: <VALOR> (limite de liberação automática: <LIMITE>)` — `<VALOR>` e `<LIMITE>` saem de `formatMoeda`, que **já emite** `R$ 900,00` |
| linha nova no bloco de dados do HTML, após OS/Referência | `<strong>Valor total:</strong> <VALOR> (limite de liberação automática: <LIMITE>)` |
| manchete HTML (a faixa azul) | `📋 Requisição aguardando liberação por valor há <N> dia`/`dias` |
| chamada no texto | `Acesse o sistema para aprovar ou reprovar a liberação:` — o verbo do e-mail irmão (`notificarAprovadoresValor`: *"aprovar ou reprovar a liberação"*), e não o `aprovar ou rejeitar` da lane normal |

O botão do HTML (`Ver requisições pendentes`) **não muda**: a requisição travada por valor aparece
na mesma tela, e trocar o rótulo seria literal nova sem razão.

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

---

## 7. O que a Fase 2 mudou — 11 achados, 3 CRITICAL, 6 hipóteses refutadas

Revisor fresco, 2026-09-30, com **sonda executada** (script em scratchpad, nenhum arquivo do projeto
tocado). Verifiquei os onze antes de aceitar. **Três derrubam afirmações minhas que este desenho
apresentava como medidas**, e uma delas é uma troca de configuração.

### 7.1 🔴 `getEmailsAprovadores` NÃO está exportado — e a T1, como escrita, derruba a lane que funciona

A seção 5 diz que a função *"já existe"*. Existe como função
(`requisitionValueApprovalService.js:313`) e **não está em `module.exports`** — verificado: o objeto
exportado tem 17 nomes e ela não é um deles.

**E o modo de falha é muito pior que um `TypeError`:** `processarLembretesPendentes`
(`requisitionReminderService.js:301-320`) **não tem `try/catch` por requisição**. Um erro numa
requisição **aborta o lote**, e como `buscarRequisicoesElegiveis` ordena `updated_at ASC`, **uma**
requisição de alto valor antiga mataria o lembrete de **todas** as `PENDENTE` posteriores — de hora
em hora, em silêncio, porque o job engole no `console.warn`.

**Correção:** exportar a função é **passo explícito** da T1, e o cenário *"um erro numa requisição
não aborta o lote"* entra na lista — com o `try/catch` por requisição, que hoje não existe.

### 7.2 🔴 A RN-02 usa `status` como chave da plateia, e esta base tem um arquivo que existe para tornar isso impossível de esquecer

`scrapDisposalStateMachine.js:10-24`, textualmente: *"AS DUAS PERNAS DE APROVAÇÃO NÃO SÃO ESTADOS…
status é um campo só e as pernas são duas assinaturas com nome, id e hora… As pernas são COLUNAS. O
status só vira APROVADO quando a SEGUNDA assinatura chega, e quem decide isso é o `CASE` do claim num
UPDATE único guardado no WHERE."*

E a spec 06 (`:35`) **manda partir dali**: *"Quem for construir o motor de regras desta feature 06
deve PARTIR DAQUI, não do zero."* **Este desenho não citou esse precedente uma única vez**, e a
RN-02 faz exatamente o que aquele arquivo existe para impedir.

**A consequência medida:** requisição que passa do limite **e** casa duas regras tem `status` = um
gesto e pendências abertas = três. Sob a RN-02 o lembrete sai **só** para os aprovadores de valor, e
os dois aprovadores de regra **nunca** são cobrados — a forma do **C64** que este desenho afirma
estar fechando. E como a T1 é tronco e vem primeiro, ela **cimentaria** a régua que a T4 teria de
desmontar: o retrabalho que o sort topológico existe para evitar.

**Correção, e ela separa duas coisas que eu havia misturado:**

- **A liberação por valor NÃO é uma regra.** É mecanismo próprio, anterior, com colunas próprias
  (`aprovador_valor_id`, `data_aprovacao_valor`) e plateia própria por configuração. Para **ela**, o
  `status` é chave legítima — é o mecanismo que o define.
- **As N aprovações de regra são outra coisa**, e o `status` **nunca** é a chave delas. Elas são
  **linhas de uma tabela filha**, com assinatura (id, nome, hora) por perna, e o `status` da
  requisição só muda na **última** — pelo `CASE` num claim único, como o molde manda.
- **O lembrete de pendência de regra é, portanto, OUTRO lembrete**, dirigido **por pendência** e não
  por status. A T1 cobre o da liberação por valor; o de regra nasce com a T4. **Escrito aqui para a
  T1 não cimentar nada.**

### 7.3 🔴 `AGUARDANDO_APROVACAO_VALOR` tem DUAS procedências, e a literal congelada mente numa delas

`verificarBloqueioLiberacao` é chamada de `requisitionService.js:387` (**separar**) e `:533`
(**entregar**) — verificado. Ou seja: uma requisição **já aprovada**, com `aprovador_id` preenchido,
`data_aprovacao` preenchida e **reserva viva**, pode cair em `AGUARDANDO_APROVACAO_VALOR` quando
alguém liga a liberação por valor depois. O `UPDATE` é cru e **não passa** por `validarTransicao` —
e a máquina de estados **proíbe** todas essas transições.

Nesse caminho, o lembrete novo cobraria requisição já aprovada e possivelmente **parcialmente
entregue**; `diasAguardando` contaria do **descarrilamento**, não do pedido; e a literal
*"aguardando liberação por valor há N dias"* **mente**.

**Correção:** a elegibilidade do status novo ganha **`AND data_aprovacao IS NULL`** — a T1 cobre a
procedência de **nascimento**. A procedência de **descarrilamento** fica **fora de escopo,
declarada**, e o bypass da máquina de estados vai para a letra **C** como achado próprio: ele é
anterior a esta etapa.

### 7.4 🔴 A RN-04 tinha a premissa FALSA, e eu troquei as duas configurações

A seção 3 afirmava que `limite_aprovacao_auto` *"aparece na tela prometendo 'Quantidade máxima para
aprovação automática por item'"*. **Verificado: ela tem ZERO ocorrências na tela de configurações.**
A lista `CAMPOS` é fixa e a chave não está nela; ela só aparece na **listagem da API**
(`GET /configuracoes`, que é `SELECT *`).

**E a troca é o que mais ensina:** quem **aparece na tela** é `aprovacao_automatica`
(`ConfiguracoesAlmoxarifado.js:2921`) — a config que fica **uma linha acima** no mesmo bloco de seed
(`schema.js:2347`) e que, ao contrário da outra, **tem leitores reais** (`routes:3084` e `:3149`).
Eu olhei o bloco do seed, vi duas chaves vizinhas de aprovação, e atribuí à morta a superfície da
viva.

**Correções:**
- a RN-04 para de alegar promessa em tela;
- a T2 **entregava zero mudança mensurável** como estava (sem `DELETE`, a API continua devolvendo a
  chave, e não havia tela de onde tirá-la). **Escolhido:** lista de exclusão no
  `GET /configuracoes`, que é reversível e mensurável. **Descartado:** o `DELETE` (irreversível) e o
  "não fazer nada" (que era o efeito real do plano anterior);
- **e a spec 06 estava CERTA** onde eu escalei: ela diz *"aparece na listagem de configurações do
  módulo"* — que é a API. Foi o desenho que virou "tela".

### 7.5 🔴 A RN-06/07 não foi traçada até `aprovacao_automatica` — e ela contorna a segregação inteira

`routes:3083-3090` (criar) e `:3148-3155` (enviar rascunho) fazem
`UPDATE … status='APROVADO', aprovador_nome='Sistema (automático)'` — **sem `aprovador_id`, sem
`validarTransicao`, sem segregação**. Com a chave ligada e urgência ≠ CRÍTICO, a requisição à qual a
T4 acabou de criar duas pendências é posta em `APROVADO` **na mesma requisição HTTP**, deixando as
pendências **órfãs e abertas** — e é a requisição **do próprio solicitante**, aprovada por um
`UPDATE` que não tem usuário.

**Correção:** a RN-06 declara a interação — **auto-aprovação não se aplica quando há pendência de
regra aberta** —, e o plano diz **onde** o avaliador roda: a auto-aprovação está na **rota**, depois
do serviço, então gancho só no `requisitionCreateService` é **sobrescrito**.

### 7.6 As três correções do contrato congelado da seção 6

| Defeito medido | Correção |
|---|---|
| `Valor total: R$ <VALOR>` com `formatMoeda`, que **já emite** `"R$ 900,00"` → sairia **"R$ R$ 900,00"**. O e-mail irmão escreve `Valor total: ${valorFmt}`, sem "R$" extra | a literal perde o `R$` explícito |
| `<LIMITE>` é **inalcançável**: `buildMensagemLembrete` é **síncrona** e exportada, e o limite só existe no `getConfig` (async) | **escolhido:** `getReminderSettings` passa a carregar o limite, porque ela já é o lugar das configurações do lembrete e assim nenhuma assinatura exportada muda |
| minha nota sobre o plural estava **meio errada** (o corpo texto escreve `dia(s)` **cru**), e a tabela **não congelou** a única manchete HTML visível — a linha "título (HTML)" do meu contrato **não correspondia a string nenhuma do arquivo** | as duas corrigidas na Fase 1-b, lendo as cinco strings que mudam |

**O modo de falha da Etapa 45 — congelar seis literais e terminar com oito — já havia começado
dentro da minha própria tabela congelada.**

### 7.7 A refutação que vale mais que os achados

O revisor tentou derrubar *"a RN-02 quebra a plateia de hoje da lane `PENDENTE`"* e **achou coisa
melhor**: uma requisição `PENDENTE` **nunca tem `aprovador_id`** — ele só é escrito por rotas que
tiram o status de `PENDENTE` (sonda: `COUNT(*) WHERE status='PENDENTE' AND aprovador_id IS NOT NULL`
= **0**). Logo o ramo `if (requisicao.aprovador_id)` de `resolverDestinatarios` é **inalcançável
hoje**, e a seção 5 deste desenho descreve *"hoje soma a lista ao e-mail do `aprovador_id`"* —
**código que nunca roda**.

**Dois corolários:**
1. o cenário que eu escrevi como metade positiva (*"a plateia de `PENDENTE` continua sendo a de
   antes"*) **não prova nada**;
2. **na configuração de fábrica a RN-02 é um NO-OP**: com `liberacao_valor_ativo='0'` e
   `liberacao_valor_aprovadores='[]'`, `getEmailsAprovadores` cai em
   `getRequisicaoNotificationEmails` — **exatamente a plateia de `PENDENTE`**. O cenário tem de
   **ligar** a config, e o desenho tem de parar de justificar a RN-02 com *"listas diferentes por
   configuração"* como se fosse fato medido: são diferentes **quando configuradas**.

### 7.8 E os galhos NÃO são independentes

*"Regra desativada com pendência em aberto"* é costura compartilhada: a desativação acontece na tela
da **T5**, a pendência órfã se exibe na tela da **T6**, e "bloqueia / cascateia / fica obsoleta" é
**uma** decisão com UI nos dois lados. O mesmo vale para perfil→pessoa. Pelo critério desta base —
*se um erro de interpretação num agente exigiria retrabalho no outro, não é independente* — **T5 e
T6 deixam de ser galhos** e viram tronco depois da T4.

### 7.9 A pergunta que a Fase 1 deixou sem resposta, e que a Fase 1-b tem de responder

**"Qual é o registro de uma aprovação pendente, e o que `status` guarda enquanto k de N assinaram?"**

Hoje o estado de aprovação é `status` + duas colunas **singulares**, e `TRANSICOES` não tem estado de
aprovação parcial. Sem resposta, quebram quatro coisas: a plateia do lembrete, qual dos N aprovadores
vai em `aprovador_id`, a fila da T6 (que não sabe o que falta) e a auditoria (uma linha por lane
hoje, N sem discriminador de regra depois).

**O precedente existe e a spec manda usá-lo:** pernas são **linhas**, não estados; o `status` muda só
na última assinatura, por `CASE` num claim único. Para **N configurável** isso vira **tabela filha +
contagem de faltantes no `CASE`** — e o desenho anterior não dizia uma palavra sobre isso.

---

## 8. Fase 1-b — o registro da pendência, e por que o molde não se copia inteiro

A pergunta da 7.9 — *"qual é o registro de uma aprovação pendente, e o que `status` guarda enquanto
k de N assinaram?"* — tem uma resposta que **o molde de duas pernas não dá**, e é preciso dizer por
quê antes de copiá-lo.

### 8.1 O molde funciona porque as duas pernas moram na MESMA LINHA

`scrapDisposalService.js:375-381`: o claim é **um** `UPDATE`, e ele faz duas coisas ao mesmo tempo —
assina a perna e decide o status:

```sql
SET <perna>_id = ?, <perna>_nome = ?, <perna>_em = CURRENT_TIMESTAMP,
    status = CASE WHEN <outra_perna>_id IS NOT NULL THEN 'APROVADO' ELSE status END
WHERE id = ? AND status = 'SOLICITADO' AND <perna>_id IS NULL
  AND (<outra_perna>_id IS NULL OR <outra_perna>_id <> ?)
```

**Isso só é possível porque as duas assinaturas e o status são colunas da mesma linha.** O módulo
**não tem transação** — é a primeira frase do docblock daquele arquivo — e o padrão inteiro dele
(pré-checagem para a mensagem, claim no `WHERE` para a garantia) depende de a escrita ser **atômica
por ser uma linha só**.

**Com N configurável isso acaba.** A pendência vira **linha de tabela filha**, e "assinar a pendência"
e "virar o status da requisição" passam a ser **duas tabelas** — portanto **dois `UPDATE`**, sem
transação para uni-los. Copiar o molde inteiro aqui seria copiar a forma e perder a propriedade que
a torna segura.

### 8.2 A resposta: a pendência é a VERDADE, e o `status` é cache re-derivável

**RN-08 — quem cobra NUNCA lê o `status`.** O lembrete de pendência de regra, a fila da tela e a
contagem do que falta leem a **tabela filha**. O `status` da requisição é **derivado** dela.

**Por que esta é a escolha certa aqui, e não preguiça de não achar um claim atômico:** se o processo
morrer entre o `UPDATE` da pendência e o do status, o pior caso é **o status ficar atrasado** — e
como nada que cobra lê o status, **nada é silenciado**. O estado converge na próxima leitura que
re-derivar. A alternativa (status como verdade) tem o pior caso invertido: status dizendo "aprovado"
com pendência aberta, e **ninguém cobrando** — que é literalmente o furo C64 desta linhagem inteira.

**Escolhido:** verdade na pendência, status derivado.
**Descartado:** (a) manter pendências em colunas — impossível para N configurável; (b) status como
verdade com compensação escrita à mão — o pior caso é silêncio, e silêncio é o defeito que estas
seis etapas pagaram para eliminar; (c) contador desnormalizado na requisição — tem o mesmo problema
de duas escritas e acrescenta um número que pode divergir da contagem real, sem ninguém para
conferir.

### 8.3 As três barreiras continuam, e a terceira MUDA de forma

| Barreira | No molde de 2 pernas | Com N pendências |
|---|---|---|
| 1 — perfil | duas ações distintas separam os balcões | a **regra** nomeia quem assina; ver 8.4 |
| 2 — solicitante | `user.id` ≠ `solicitante_id` | **igual**, e continua no serviço |
| 3 — identidade entre pernas | `<outra_perna>_id IS NULL OR <> ?` no `WHERE` | vira `NOT EXISTS (SELECT 1 FROM pendencias WHERE requisicao_id = ? AND aprovador_id = ?)` no `WHERE` do claim da pendência |

⚠️ **A barreira 3 é a que o molde ensina a não esquecer, e ela é TOCTOU.** O comentário de
`:381-388` conta o caso: duas requisições simultâneas do **mesmo ADMINISTRADOR**, uma em cada perna,
leem as duas vazias, passam na pré-checagem, e o `CASE` fecha com **uma pessoa carimbando os dois
lados**. Com N pendências o caso é o mesmo e **mais fácil de alcançar** (há mais pernas para clicar),
então a condição **tem de estar no `WHERE`**, não só na pré-checagem. A pré-checagem existe **pela
mensagem**; o `WHERE` existe pela **garantia**.

### 8.4 O lado do aprovador, que a RN-05 tinha cortado

A base tem **três** modelos de autorização de aprovação, medidos: ação de perfil via
`requirePermission`; lista de ids em configuração (a liberação por valor, **sem ação em
`ACAO_PERFIS`**); e duas ações de perfil + segregação por identidade (sucateamento).

**A regra precisa nomear quem assina, e a RN-07 ("a mesma pessoa não satisfaz duas regras") só tem
sentido se esse lado for resolvível por IDENTIDADE.** Um modelo que diga só "perfil GESTOR" não
responde *quem* — e a spec 06 registra exatamente essa lacuna ("não sabe resolver perfil → pessoa").

**Escolhido:** a regra nomeia um **conjunto de identidades** (lista de ids), como a liberação por
valor já faz — é o único dos três modelos que resolve pessoa, já existe na base, já tem tela de
configuração e já tem fallback documentado.
**Descartado:** ação de perfil por regra — exigiria uma ação nova em `ACAO_PERFIS` **por regra
criada**, o que é impossível para regra configurável em runtime; e perfil como conjunto, que devolve
o problema de resolver perfil → pessoa sem resolver a RN-07.

### 8.5 O que fica para a T3 decidir, e está nomeado

**Regra desativada com pendência em aberto** (a costura que tirou T5/T6 de galho). Três opções, e a
T3 escolhe com a tela na mão: a pendência **fica** (a regra valia quando a requisição entrou), a
pendência **some** (a regra deixou de valer), ou a pendência fica **marcada como obsoleta** e deixa
de bloquear sem sumir do histórico. **A reversível é a terceira** — não destrói registro e não
trava requisição —, mas a decisão é da T3 porque ela depende do formato final da tabela.

**As literais de recusa de T3/T4/T5 continuam NÃO congeladas**, e agora com a razão certa: elas
dependem desta escolha e do formato dos critérios. **A Fase 1-b fecha a pergunta estrutural, não o
contrato de mensagem** — e o plano já registra que congelar antes do formato existir foi como a
Etapa 45 terminou com duas mensagens fora da tabela.

---

## 9. Fase 1-c — a escolha da 8.5, e os contratos congelados de T3/T4 (2026-09-30)

Escrita **depois** de T1 e T2 fecharem, e antes de a T3 abrir — que é o momento que a 8.5 marcou.
Medido de novo antes de escrever: `material_critico` existe em `materiais_almoxarifado`;
`TIPOS_REQUISICAO` é lista fechada em `schema.js:40`; `projeto_id` e `centro_custo_id` são colunas da
requisição; `isAprovadorValor` aceita `role = 'admin'` **ou** id na lista de config.

### 9.1 A decisão estrutural que simplifica a 8.1: a assinatura de regra NÃO vira o status

A 8.1 mostrou que "assinar a pendência" e "virar o status" viram **dois `UPDATE`** sem transação. A
saída é **não ligar os dois**: assinar uma pendência de regra **não muda o status** da requisição.
Ela continua `PENDENTE` (ou `AGUARDANDO_APROVACAO_VALOR`) até o gesto que já existe — `/aprovar` ou
`/aprovar-valor` — e **esse gesto passa a ser barrado enquanto houver pendência de regra aberta**,
com a condição **no `WHERE` do `UPDATE` que aprova** (`AND NOT EXISTS (… status = 'ABERTA')`).

**Por que isso é melhor que o `CASE` do molde:** a garantia volta a ser **um `UPDATE` só, numa linha
só** — a propriedade que a 8.1 disse que se perdia. As regras **somam** aprovações à aprovação normal
(a 5.3 já dizia "as regras novas somam, não substituem"); não substituem a aprovação normal.
**Descartado:** a última assinatura de regra aprovar a requisição sozinha — exigiria os dois `UPDATE`
da 8.1 **e** tiraria da aprovação normal a reserva de saldo (`reservarItensAprovacao`), que só a rota
`/aprovar` faz.

**RN-08 revisada:** quem cobra e quem conta o que falta lê a **tabela filha**. O `status` da
requisição é lido **só** para excluir requisição já decidida (rejeitada/cancelada) da cobrança — e o
caso perigoso (status "aprovado" com pendência aberta) fica **impossível** pelo `WHERE` do gate, não
por disciplina de quem lê.

### 9.2 A escolha da 8.5 — regra desativada com pendência aberta

**Escolhido: a pendência vira `OBSOLETA`** no mesmo gesto que desativa a regra — deixa de bloquear,
não some do histórico, e a resposta do `PUT` devolve quantas foram obsoletadas. **Descartados:**
"fica" (requisição travada por regra que o administrador acabou de desligar, sem saída na tela) e
"some" (apaga o registro de que a regra valia quando a requisição entrou). Reativar a regra **não**
reabre as obsoletas — a requisição já pode ter sido aprovada no intervalo.

### 9.3 Tabelas

```
regras_aprovacao
  id, nome TEXT NOT NULL, ativo INTEGER DEFAULT 1, ordem INTEGER DEFAULT 0,
  -- critérios: NULL = não filtra; a regra casa quando TODOS os não-NULL casam (E, não OU)
  tipo_requisicao TEXT,          -- um de TIPOS_REQUISICAO
  material_critico INTEGER,      -- 1 = casa se ALGUM item é material_critico
  valor_minimo REAL,             -- casa se valor_total >= valor_minimo
  quantidade_minima REAL,        -- casa se ALGUM item tem quantidade_solicitada >= quantidade_minima
  centro_custo_id INTEGER, projeto_id INTEGER,   -- igualdade
  aprovadores TEXT NOT NULL,     -- JSON de ids de usuarios (8.4)
  criado_por_id, criado_por_nome, created_at, updated_at

requisicao_aprovacoes_regra
  id, requisicao_id, regra_id,
  regra_nome TEXT, aprovadores TEXT,        -- SNAPSHOT no envio: editar a regra depois não
                                            -- muda quem pode assinar a requisição que já entrou
  status TEXT NOT NULL DEFAULT 'ABERTA',    -- ABERTA | APROVADA | OBSOLETA
  aprovador_id, aprovador_nome, aprovado_em,
  obsoleta_em, obsoleta_por_nome,
  created_at,
  UNIQUE (requisicao_id, regra_id)
```

### 9.4 RN novas desta fase

- **RN-09 — o avaliador roda em `dispararNotificacoesCriacao`**, que é o ponto por onde passam os
  **dois** caminhos de envio (criação direta e `/enviar` de rascunho) e as **duas** rotas de criação
  (`/api/almoxarifado/requisicoes` e `/api/requisicoes-material`). Roda **antes** da avaliação de
  valor. Rascunho não passa por ali, e é certo: rascunho não foi enviado.
- **RN-10 — auto-aprovação não se aplica com pendência de regra aberta** (7.5). As duas rotas que
  fazem o `UPDATE … 'Sistema (automático)'` ganham o mesmo `NOT EXISTS` no `WHERE`; a requisição
  fica `PENDENTE`, e a resposta diz `status: 'PENDENTE'` — não mente `APROVADO`.
- **RN-11 — o gate vale nas duas lanes:** `/aprovar` e `/aprovar-valor` recusam enquanto houver
  pendência `ABERTA`. Sem a segunda, a liberação por valor (que leva direto a `APROVADO`) contornaria
  todas as regras.
- **RN-07, concretizada:** quem assina uma pendência tem de (a) não ser o solicitante; (b) estar no
  snapshot `aprovadores` da pendência **ou** ser `role = 'admin'` (mesmo critério da liberação por
  valor); (c) **não ter assinado outra pendência da mesma requisição** — no `WHERE` do claim
  (`NOT EXISTS`), por ser TOCTOU (8.3). A aprovação normal **não** conta como pendência: quem assina
  uma regra pode dar o `/aprovar` depois. *(Escolha reversível; ver letra B.)*

### 9.5 Contratos congelados — rotas e literais

Nenhuma ação nova em `ACAO_PERFIS`: o lado do aprovador é por identidade (8.4). A configuração das
regras usa o gate de configuração do módulo (`denyUnlessAlmoxAdmin`), como `/configuracoes`.

| Rota | Sucesso | Recusas (código — literal) |
|---|---|---|
| `GET /api/almoxarifado/regras-aprovacao` | 200 `[regra]` com `aprovadores` como array de ids e `pendencias_abertas` (contagem) | 403 — `Acesso restrito — administrador do Almoxarifado ou Super Administrador` |
| `POST /api/almoxarifado/regras-aprovacao` | 201 `regra` | 400 — `Regra precisa de um nome` · 400 — `Regra precisa de pelo menos um critério` · 400 — `Regra precisa de pelo menos um aprovador` · 400 — `Aprovador inexistente ou inativo: <ids>` · 400 — `Tipo de requisição inválido: <valor>` · 400 — `<campo> deve ser um número maior que zero` (valor_minimo, quantidade_minima) · 403 — a do gate |
| `PUT /api/almoxarifado/regras-aprovacao/:id` | 200 `{ regra, pendencias_obsoletadas }` | as mesmas do POST · 404 — `Regra não encontrada` |
| `GET /api/almoxarifado/requisicoes/:id/aprovacoes-regra` | 200 `[pendencia]` | 404 — `Requisição não encontrada` |
| `GET /api/almoxarifado/aprovacoes-regra/pendentes` | 200 `[pendencia + numero, solicitante_nome, valor_total, pode_assinar]` — só `ABERTA` de requisição em `PENDENTE`/`AGUARDANDO_APROVACAO_VALOR` | — |
| `PUT /api/almoxarifado/requisicoes/:id/aprovacoes-regra/:pid/aprovar` | 200 `{ success: true, pendencias_abertas }` | 404 — `Aprovação de regra não encontrada` · 403 — `Solicitante não pode aprovar a própria requisição` · 403 — `Você não está entre os aprovadores desta regra` · 403 — `Você já assinou outra aprovação de regra desta requisição` · 400 — `Esta aprovação de regra não está mais aberta` · 400 — `Requisição não está aguardando aprovação` |
| `PUT …/aprovar` e `PUT …/aprovar-valor` (existentes) | inalterado | **nova:** 400 — `Requisição tem aprovação de regra pendente: <nomes separados por vírgula>` |

**Ordem das checagens do claim** (a mensagem certa para o caso certo): 404 → requisição não
aguardando → pendência não aberta → solicitante → fora da lista → já assinou outra. A pré-checagem
dá a mensagem; o `WHERE` do `UPDATE` dá a garantia, e se ele pegar `changes = 0` a rota relê e
devolve a mensagem da condição que falhou.

### 9.6 O que continua fora

O lembrete **por pendência** (T5) e as telas (T6/T7) consomem estes contratos e não os mudam. Se uma
delas precisar de campo novo, é contrato novo, registrado no plano — não edição silenciosa desta
tabela.

### 9.7 O que a revisão da Fase 1-c mudou — 3 CRITICAL, 4 IMPORTANT, 4 MINOR, 6 hipóteses refutadas

Revisor fresco com duas sondas executadas (`rev1c-probe.js`, `rev1c-claim.js`, no scratchpad).
Conferi no código os pontos em que a correção depende de detalhe antes de aceitar.

**🔴 C1 — o gate só no `WHERE` deixava reserva órfã, e a reaprovação reservava em dobro (medido:
item de 10, duas reservas de 10).** `/aprovar` reserva **antes** do `UPDATE`, e `saldoDisponivelParaItem`
devolve a reserva da própria requisição ao disponível. E em `/aprovar-valor` a rota grava o status
de reserva num segundo `UPDATE` **sem guarda** — o gate seria contornado sempre que houvesse saldo.
**Correção, nas duas rotas:** (1) **pré-checagem** das pendências **antes** de reservar — é ela que dá
a literal; (2) o `UPDATE` que aprova ganha a guarda no `WHERE` e `changes === 0` vira 400;
(3) nesse ramo, **libera só as reservas que ESTA chamada criou** (os `reserva_id` que
`reservarItensAprovacao` devolve), via `stockService.liberarReserva`. ⚠️ **Não**
`liberarReservasDaRequisicao`, que o revisor sugeriu: ela solta **todas** as reservas da requisição,
inclusive as de um `/aprovar` concorrente que venceu.
E o `/aprovar` ganha `AND status = 'PENDENTE'` no `WHERE` — o achado anterior à etapa que o revisor
mediu (dois `/aprovar` simultâneos respondem 200 os dois e o segundo reserva de novo) sai de graça com
a mesma guarda.

**🔴 C2 — o avaliador falhando deixava a requisição SEM pendência, e o gate passava por vazio.**
**Correção: coluna `regras_avaliadas_em`**, gravada **só depois** de todas as pendências inseridas.
- falha no avaliador: é logada, a coluna fica `NULL` e **a requisição fecha, não abre**;
- o gate de `/aprovar`, de `/aprovar-valor` e das duas auto-aprovações exige `regras_avaliadas_em IS NOT NULL`;
- `/aprovar` e `/aprovar-valor` com a coluna `NULL` **reavaliam na pré-checagem**. O avaliador é idempotente por `UNIQUE (requisicao_id, regra_id)`. Se a reavaliação falhar de novo, a resposta é 500 com a mensagem do erro, e nada é aprovado;
- **migração:** as requisições que já existem quando a coluna **nasce** recebem `CURRENT_TIMESTAMP`, porque foram enviadas antes de existir regra. `safeAlter` não diz se criou a coluna, então a migração checa `PRAGMA table_info` antes.

**🔴 C3 — `valor_minimo` nunca casaria:** na ordem da RN-09, `valor_total` ainda é 0 (só
`atualizarValorRequisicao` o grava). **Correção:** o avaliador calcula com `calcularValorTotal`.

**I1 — a frase absoluta da 9.1 era falsa** (janela entre o envio e a gravação das pendências). A
coluna do C2 fecha a janela: sem ela preenchida o gate recusa. A frase fica: *impossível enquanto o
gate exigir as duas condições*.

**I2 — pendência de requisição morta.** Contagem (`pendencias_abertas`), fila e obsolescência passam a
filtrar pela requisição em `PENDENTE`/`AGUARDANDO_APROVACAO_VALOR`: desativar a regra **não reescreve**
o histórico de requisição rejeitada ou cancelada.

**I3 — o contrato do POST/PUT, fechado:**
- `material_critico` só filtra quando é `1`/`true`. `0`, `false` e `null` significam "não filtra" e **não contam** como critério;
- `aprovadores` que não seja array não vazio de inteiros recebe a mesma literal de *pelo menos um aprovador*;
- `centro_custo_id`/`projeto_id` precisam ser inteiros > 0: `<campo> deve ser um número maior que zero`. **Não** há checagem de existência, porque as tabelas são do núcleo e o harness não as tem (declarado);
- `ativo` é coagido a `0`/`1`;
- a validação é escrita no serviço, **não** no Zod, e as literais saem **sem** o prefixo `Dados inválidos —`.

**I4 — a tela de requisições precisa saber.** `GET /requisicoes` e `GET /requisicoes/:id` ganham
`pendencias_regra_abertas` (inteiro). Contrato congelado agora, não na T6.

**Os MINOR, declarados:**
- **M1:** as auto-aprovações passam a `dbRun` com checagem de `changes`, porque o callback arrow não alcança `this.changes`;
- **M2:** duas regras com o mesmo único aprovador exigem uma segunda pessoa, e a saída é um admin ou desativar uma das regras. O avaliador não recusa, e o manual avisa;
- **M3:** `valor_minimo` é `>=`, enquanto a liberação por valor é `>`. São réguas de mecanismos diferentes;
- **M4:** urgência e material de cliente, listados na spec 06, **ficam fora** desta etapa. Coluna nova depois, e não há decisão irreversível nisso.

**As refutações que valem registro:** o claim com `NOT EXISTS` correlacionado deu **0** duplas em 200
rodadas concorrentes, e o controle sem ele deu `changes=2`. Nenhum outro caminho leva a requisição de
`PENDENTE` a aprovado. Itens não são editáveis depois do envio. `/copiar` cria rascunho. A rota de
`requisicoesMaterial.js` passa pelo avaliador.
