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

## ✅ T1 — feita (2026-09-30, `4f53292`)

**O que mudou** (`requisitionReminderService.js` + uma linha de export em
`requisitionValueApprovalService.js`):

1. `buscarRequisicoesElegiveis` cobre `PENDENTE` **ou** `AGUARDANDO_APROVACAO_VALOR` **com
   `data_aprovacao IS NULL`** (só a procedência de nascimento — 7.3). Maturação e reincidência
   intocadas.
2. `resolverDestinatarios` escolhe por status: no status de valor devolve **só**
   `getEmailsAprovadores` (que agora está **exportada**), sem somar a lista geral. Exportada também
   `resolverDestinatarios`, que o teste mede por endereço.
3. `getReminderSettings` carrega `limiteValor`; `buildMensagemLembrete` ganhou um 5º parâmetro
   **opcional** `settings` — os chamadores de quatro argumentos continuam valendo
   (`tests/almoxarifado.test.js:589` é um deles, e a suíte dele segue 42/42).
4. `processarLembretesPendentes` ganhou `try/catch` por requisição: a que lança aparece no
   resultado com `enviado: false` e `erros`, e o lote segue.
5. As literais estão na **seção 6 do desenho, reescrita** com o que o código escreve.

**Divergências do previsto:**

- **O `require` foi no topo, não dentro da função**, ao contrário do que o plano mandava. Medido: o
  ciclo que o plano citava é entre o serviço de **valor** e o de **notificação**; o de valor
  **não** importa o de lembrete, então não há ciclo aqui. A chamada é pela propriedade do módulo,
  o que é o que deixa o cenário (8) patchear.
- **🔴 Defeito ANTERIOR achado pelo cenário (9), e corrigido:** `diasAguardando` fazia
  `new Date(updated_at)` com a string do SQLite (`YYYY-MM-DD HH:MM:SS`, UTC, **sem `Z`**), que o
  Node lê como hora **local**. No servidor em UTC-3 o lembrete contava 3h a menos — 50h de espera
  saíam como *"há 2 dias"*. Valia para a lane `PENDENTE` também, desde que o lembrete existe.
  Correção com o mesmo padrão de `alertRegistry.maisVelhoQueDias` e `purchaseService`
  (acrescenta `Z` só quando não há `T`). ⚠️ **O cenário (9) só distingue em máquina fora de UTC** —
  num servidor em UTC as duas leituras coincidem e ele passaria com o defeito. Esta máquina é
  UTC-3, e a S7 abaixo ficou vermelha aqui.
- **Cenário (9) novo**, que o plano pedia e o teste não tinha: o log grava a tentativa com o
  destinatário certo e `dias_aguardando` contado da criação.

**Controle positivo — 8 sabotagens, 8 vermelhas, nenhuma NO-OP** (conferido com `cmp` antes de
cada rodada):

| Sabotagem | Ficou vermelho |
|---|---|
| S1 elegibilidade só `PENDENTE` | (1) (2) (8) |
| S2 sem `data_aprovacao IS NULL` | (2) |
| S3 plateia do status novo = lista geral | (4) (9) |
| S4 plateia = geral **somada** à de valor | (4) (9) |
| S5 mensagem sempre da lane normal | (6) |
| S6 sem `try/catch` por requisição | (8) |
| S7 `diasAguardando` volta a ler hora local | (9) |
| S8 `R$` dobrado na linha do valor | (6) |

**Suítes:** `requisicaoLembreteValor` 9/9 · `test:almoxarifado` 42/42 · `test:validation` 4/4 ·
`test:safealter` 3/3 · `test:sqlite` 5/5 · `test:api` **218/218** (rodada limpa, depois das sabotagens).

**Para a letra C do fechamento:** o bypass da máquina de estados em `verificarBloqueioLiberacao`
(7.3) e o defeito de fuso de `diasAguardando` (corrigido aqui, mas existiu em produção).

---

## ✅ T2 — feita (2026-09-30, `dc1c3f8`)

**Medido no momento da task** (o ⚠️ do plano): `git grep limite_aprovacao_auto` fora de `docs/` e
`specs/` devolve **uma** linha — o seed (`schema.js:2348`). Nenhum leitor; a task não mudou de
natureza.

**O que mudou — três camadas, porque uma só entregava zero:**

1. o seed para de criar a chave (instalação nova não a tem);
2. `configDiff.CHAVES_APOSENTADAS = ['limite_aprovacao_auto']` — o `GET /configuracoes` pula a
   linha órfã dos bancos antigos;
3. o `PUT /configuracoes` a trata como **desconhecida**: `400` com a literal que a rota já tinha,
   `Configuração desconhecida: limite_aprovacao_auto`. **Divergência do plano:** o plano só falava
   da listagem. Sem esta camada a chave sumia da listagem e continuava **gravável com 200** — a
   mesma classe de defeito que a própria rota documenta (chave que se grava e ninguém lê).

**Sem `DELETE`** — a linha de produção fica intacta, e o cenário (3) prova isso **pelo caminho do
PUT**. ⚠️ **Limite declarado:** um `DELETE` posto no `schema.js` rodaria na inicialização, **antes**
de o teste inserir a linha de produção, e passaria despercebido. Proteger isso exigiria reinicializar
o schema sobre um banco já povoado dentro do teste; não fiz, porque a regra está no comentário do seed
e na constante, e a sabotagem seria alguém escrever um `DELETE` contra o texto que está ao lado dele.

**Letra B do fechamento:** escolhido aposentar (reversível: tirar da constante e voltar a semear);
descartados o `DELETE` (irreversível) e implementar aprovação automática por quantidade (regra que
ninguém pediu).

**Controle positivo — 3 sabotagens, 3 vermelhas:** seed volta → (1); GET sem filtro → (2); PUT sem
filtro → (3).

---

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
- [x] Fase 1-b — a resposta da 7.9 está na **seção 8 do desenho**: a pendência é a verdade, o `status` é cache re-derivável, e quem cobra NUNCA lê o `status`. As literais de T3/T4/T5 continuam fora, agora com a razão certa: dependem da escolha da T3 sobre regra desativada
- [x] Fase 2 — revisão do plano: **11 achados, 3 CRITICAL, 6 refutados** — o plano NAO estava executavel; desenho e plano corrigidos
- [x] Fase 1-c — seção 9 do desenho: a assinatura de regra NÃO vira o status (o gate fica no `WHERE` de `/aprovar` e `/aprovar-valor`), 8.5 resolvida como `OBSOLETA`, contratos e literais de T3/T4 congelados. **Em revisão por agente fresco.**
- [x] T1 (`4f53292`) · [x] T2 (`dc1c3f8`) · [ ] T3 · [ ] T4 · [ ] T5 · [ ] T6 · [ ] T7 · [ ] T8 *(oito, e todas tronco — ver a Fase 2)*
- [ ] Fase 5 — revisão adversarial
- [ ] Fase 6 — `fechar-etapa`
