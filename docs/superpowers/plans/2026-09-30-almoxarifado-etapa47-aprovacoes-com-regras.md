# Etapa 47 — O motor de aprovações ganha regras, e a requisição de alto valor passa a ser cobrada (plano)

> **Desenho:** `docs/superpowers/specs/2026-09-30-almoxarifado-etapa47-aprovacoes-com-regras-design.md`
> **Feature:** 06 (Motor de aprovações), com efeito em 04 (Requisições) e 19 (E-mails)
> **Fase 0:** no plano da Etapa 46, **com a correção da Fase 1 no fim** — as duas se leem juntas.

---

## O que esta etapa entrega, em uma frase

A requisição travada por valor passa a ser **cobrada enquanto continua travada**, a configuração que
prometia o que não existe sai da tela, e o motor de aprovações ganha **regras configuráveis** com
quem as leia.

---

## Sort topológico

| Task | O que é | Classificação | Por quê |
|---|---|---|---|
| **T1** | o lembrete alcança `AGUARDANDO_APROVACAO_VALOR`, com plateia e mensagem por status | **tronco** | defeito na própria feature; mexe em serviço compartilhado |
| **T2** | `limite_aprovacao_auto` sai do seed e da tela | **tronco** | mexe em `schema.js` e na tela de config |
| **T3** | tabela `regras_aprovacao` + migração | **tronco** | migração |
| **T4** | o avaliador, as N pendências, e a segregação em cada aprovação | **tronco** | regra compartilhada |
| **T5** | aba de configuração das regras | **galho** | contra contrato congelado |
| **T6** | tela da fila de aprovações pendentes | **galho** | contra contrato congelado |
| **T7** | integração cruzando os galhos | **tronco** | serial, por último |

---

## T1 — tronco: o lembrete alcança a requisição de alto valor

**O alvo medido:** `requisitionReminderService.js:248-259` filtra `status = 'PENDENTE'`, e
`resolverDestinatarios` (`:212-223`) resolve a plateia da lane normal. Os dois têm de virar
**por status**.

1. `buscarRequisicoesElegiveis` cobre `PENDENTE` **e** `AGUARDANDO_APROVACAO_VALOR`. **A régua de
   reincidência e a de maturação não mudam** — elas já servem, e mexer nelas mudaria o
   comportamento da lane que funciona.
2. `resolverDestinatarios` escolhe **por status**: `PENDENTE` → o que já faz;
   `AGUARDANDO_APROVACAO_VALOR` → `requisitionValueApprovalService.getEmailsAprovadores` (`:313`),
   que **já existe** e já cai para a lista geral quando não há aprovador configurado.
   ⚠️ **`require` dentro da função, não no topo:** `requisitionValueApprovalService` já faz isso com
   `requisitionNotificationService` (`:318`) — há ciclo entre os dois módulos, e o topo quebraria.
3. `buildMensagemLembrete` (`:77`) ganha a variante do status: *"Aguardando liberação por valor"*,
   com o **valor total** e o **limite** — é o número que explica por que a requisição parou.

**Cenários (`requisicaoLembreteValor.api.test.js`):**
- requisição em `AGUARDANDO_APROVACAO_VALOR` madura **entra** na elegibilidade *(a positiva)*;
- requisição em `PENDENTE` **continua** entrando *(a metade que prova que não quebrei a lane boa)*;
- a plateia do status novo é a dos **aprovadores de valor**, e **não** o `aprovador_id`;
- a plateia de `PENDENTE` **continua** sendo a de antes;
- a mensagem do status novo traz o valor e **não** a frase da lane normal;
- reincidência: enviado hoje, não reenvia antes do intervalo — **nos dois status**;
- sem aprovador de valor configurado, cai para a lista geral (é o que `getEmailsAprovadores` faz);
- o log (`requisicao_lembretes_log`) grava o `dias_aguardando` do status novo.

⚠️ **Controle positivo obrigatório, e a forma importa:** trocar a plateia do status novo pela da lane
normal **passa verde** se o cenário só afirmar "mandou e-mail". A asserção tem de ser **quais
endereços** — e o cenário precisa de um aprovador de valor cujo e-mail **não** esteja na lista geral,
senão as duas plateias coincidem e o teste não distingue nada.

---

## T2 — tronco: a configuração que promete o que não existe

`limite_aprovacao_auto` sai do seed (`schema.js:2348`) e da tela de configurações. **Sem `DELETE` na
migração:** a linha já gravada em produção fica órfã, e isso é deliberado — apagar é irreversível, e
uma chave que **ninguém lê** não faz mal parada. Registrar na letra **B** com o descartado
(implementar aprovação automática por quantidade).

**Cenários:** a chave **não** aparece na listagem de configurações do módulo; e — a metade positiva —
as chaves vizinhas de aprovação **continuam** aparecendo.
⚠️ **Medir antes de remover:** confirmar de novo, no momento da task, que o `grep` do repositório
inteiro devolve **só** o seed. Se aparecer leitor, a task muda de natureza e vira a outra metade da
escolha.

---

## T3 — tronco: `regras_aprovacao`

Tabela por `safeAlter`/`CREATE TABLE IF NOT EXISTS` no padrão do módulo, com critérios combináveis
(tipo de requisição, criticidade do material, valor, quantidade, projeto/centro de custo), `ativo`,
e ordem de avaliação. **Nada de enum novo sem lista fechada** — o precedente é `NC_ORIGENS`.

⚠️ **O risco desta task é nascer sem leitor**, que é exatamente o defeito que a T2 remove. **Gate:
a T3 não fecha sozinha** — ela e a T4 são um par, e o plano as separa só para o commit ficar legível.

---

## T4 — tronco: o avaliador e as N aprovações

O avaliador roda no **envio** da requisição e grava a lista de pendências. A **segregação da Etapa 3
vale em cada aprovação**, e a mesma pessoa **não** satisfaz duas regras diferentes.

**Cenário que é o coração:** requisição que casa **duas** regras exige **duas pessoas distintas** —
com a metade positiva de que **uma** pessoa satisfaz **uma** regra.

---

## T5 e T6 — galhos

A aba de configuração das regras e a tela da fila de pendências, contra o contrato congelado.
⚠️ **Se qualquer das duas precisar de ação nova em `ACAO_PERFIS`, o rótulo em
`client/src/utils/permissaoErro.js` entra no MESMO commit** — seria a **oitava** vez que esse buraco
aparece nesta base, e a sétima custou uma suíte de client vermelha que eu não medi.

---

## T7 — tronco: integração

Requisição que dispara duas regras **e** passa do limite de valor: as pendências das regras, a
liberação por valor, o lembrete de cada plateia, e a segregação valendo em cada assinatura.

---

---

## Fase 2 — 11 achados, 3 CRITICAL, 6 refutados: o plano NÃO estava executável

Revisor fresco com sonda executada. **Os detalhes e as correções estão na seção 7 do desenho**; aqui
fica o que muda **neste plano**, e por que a ordem das tasks tinha de mudar.

### O sort topológico estava errado, e o erro era estrutural

A T1 era tronco e vinha **primeiro**. Mas ela dirige a plateia do lembrete **por `status`**, e a
T4 precisa dirigir **por pendência** — então a T1, como escrita, **cimentaria a régua que a T4 teria
de desmontar**. Isso é exatamente o retrabalho que o sort topológico existe para evitar, e eu o
plantei na primeira task.

**A saída não foi reordenar: foi SEPARAR dois mecanismos que eu havia misturado.** A liberação por
valor **não é uma regra** — é mecanismo anterior, com colunas próprias e plateia própria. Para ela o
`status` é chave legítima. As N aprovações de regra são **linhas de tabela filha**, e o lembrete
delas é **outro lembrete**, dirigido por pendência. Com isso a T1 volta a poder vir primeiro, **sem
cimentar nada** — mas só porque o desenho agora diz isso por escrito.

### O sort topológico revisado

| Task | O que é | Classificação | O que mudou |
|---|---|---|---|
| **T1** | o lembrete da **liberação por valor** alcança o status, só na procedência de **nascimento** | **tronco** | ganhou o **export** que faltava, o `try/catch` por requisição, o `AND data_aprovacao IS NULL` e o limite em `getReminderSettings` |
| **T2** | `limite_aprovacao_auto` sai da **listagem da API** | **tronco** | mudou de natureza: **não havia tela** de onde tirá-la, e sem isso a task entregava **zero** |
| **T3** | `regras_aprovacao` **+ a tabela filha das pendências** | **tronco** | ganhou a tabela filha, que é a resposta à pergunta 7.9 |
| **T4** | o avaliador, o `CASE` do claim único, a segregação por perna, **e o gate da auto-aprovação** | **tronco** | ganhou a interação com `aprovacao_automatica`, que contorna a segregação inteira |
| **T5** | o lembrete **por pendência** de regra | **tronco** | **task nova** — era o que a RN-02 misturava com a T1 |
| **T6** | aba de configuração das regras | **tronco** *(era galho)* | deixou de ser galho: a costura "regra desativada com pendência aberta" tem UI nos dois lados |
| **T7** | tela da fila de pendências | **tronco** *(era galho)* | idem, mais a questão perfil→pessoa |
| **T8** | integração cruzando tudo | **tronco** | — |

⚠️ **Esta etapa perdeu o paralelismo, e isso é resultado da medição, não pessimismo.** O critério
desta base é *"se um erro de interpretação num agente exigiria retrabalho no outro, não é
independente"* — e as duas telas compartilham **duas** decisões (o que fazer com pendência órfã, e
como a regra nomeia quem assina). Fingir independência aqui custaria mais que rodar serial.

### As cinco correções da T1, que era a task "pequena"

1. **`getEmailsAprovadores` não está exportado** — passo explícito, e o cenário
   *"um erro numa requisição não aborta o lote"* entra na lista, com o `try/catch` por requisição
   que **hoje não existe**. Sem isso, uma requisição ruim mataria o lembrete de **todas** as
   `PENDENTE` posteriores, de hora em hora, em silêncio.
2. **`AND data_aprovacao IS NULL`** na elegibilidade — o status tem **duas** procedências, e na
   segunda a literal mente.
3. **O limite vai para `getReminderSettings`** — `buildMensagemLembrete` é síncrona **e exportada**,
   então o limite não é alcançável de dentro dela.
4. **A literal perde o `R$` explícito** — `formatMoeda` já o emite, e a minha versão sairia
   *"Valor total: R$ R$ 900,00"*.
5. **O cenário tem de LIGAR a configuração.** Na configuração de fábrica a RN-02 é **no-op**: sem
   aprovador de valor cadastrado, a plateia cai na lista geral, que é a **mesma** de `PENDENTE`.

### E a metade positiva que eu escrevi não provava nada

Eu havia escrito *"requisição em `PENDENTE` continua entrando — a metade que prova que não quebrei a
lane boa"*. O revisor mediu: **`PENDENTE` nunca tem `aprovador_id`**, então o ramo que eu dizia estar
preservando é **inalcançável hoje**. A metade positiva tem de ser outra: **os endereços exatos** da
lane `PENDENTE` antes e depois, com um aprovador de valor cujo e-mail **não** esteja na lista geral.

### O que sai desta etapa e vira achado próprio

O **bypass da máquina de estados** em `verificarBloqueioLiberacao`: ele grava
`AGUARDANDO_APROVACAO_VALOR` por `UPDATE` cru, a partir de seis status que `TRANSICOES` **proíbe**.
É **anterior** a esta etapa, não é o que ela veio resolver, e consertá-lo aqui abriria escopo de
máquina de estados. **Vai para a letra C** com o cenário medido.

## Fase 2 — o que o revisor do plano tem de atacar

1. Os contratos cobrem os casos de erro e as **mensagens literais**? (o desenho ainda **não**
   congelou literais — a Fase 1 continua nisso; o revisor tem de exigir a tabela completa)
2. As RN batem com a spec 06 e com o código? Em especial: a RN-02 não quebra a plateia da lane
   `PENDENTE`, e a RN-07 não enfraquece a segregação da Etapa 3?
3. Cada `galho` é independente de verdade?
4. **Cada RN foi traçada até o último gesto do usuário?** Depois de N pendências: o que a tela de
   requisições mostra, o que o lembrete cobra, o que a segregação recusa, e **o que acontece quando
   uma regra é desativada com pendência em aberto**?
5. **Exclusividade não é suficiência** — a lição da Fase 2 da Etapa 46. Ao propor qualquer
   discriminador de estado, perguntar se ele cobre **todos** os caminhos que produzem o estado, e
   não só se ele é único.

---

## Estado

- [x] Fase 0 — medida, **com correção da própria medição** (`06e3b00` + `d716c47`)
- [x] Fase 1 — desenho e plano (`637d9fa`), **corrigidos pela Fase 2**: ver a seção 7 do desenho
- [ ] Fase 1-b — as literais de T3/T4/T5 e a resposta da 7.9 (o registro da pendência), ANTES de despachar qualquer task
- [x] Fase 2 — revisão do plano: **11 achados, 3 CRITICAL, 6 refutados** — o plano NAO estava executavel; desenho e plano corrigidos
- [ ] T1 · [ ] T2 · [ ] T3 · [ ] T4 · [ ] T5 · [ ] T6 · [ ] T7 · [ ] T8 *(oito, e todas tronco — ver a Fase 2)*
- [ ] Fase 5 — revisão adversarial
- [ ] Fase 6 — `fechar-etapa`
