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

## Fase 1-c — o contrato de T3/T4, e a revisão dele (2026-09-30)

A 8.5 deixou para a T3 a decisão sobre regra desativada e as literais. Escrevi a **seção 9 do
desenho** (`f14f38b`) antes de abrir a T3, e um revisor fresco com sonda a atacou: **3 CRITICAL, 4
IMPORTANT, 4 MINOR, 6 refutadas** — a **9.7** (`7957c3f`). O que mais importa para quem retoma:

- **assinar pendência de regra NÃO muda o status da requisição.** O gate fica no `WHERE` de
  `/aprovar`, `/aprovar-valor` e das auto-aprovações — um `UPDATE` numa linha só, a propriedade que
  o molde de duas pernas tinha e N pendências perderiam;
- **C1:** o gate só no `WHERE` deixava reserva órfã (`/aprovar` reserva ANTES) e a reaprovação
  reservava em dobro — medido. Pré-checagem antes de reservar + rollback **só das reservas desta
  chamada**;
- **C2:** o avaliador falhando deixava zero pendências e o gate passava por vazio. Coluna
  `regras_avaliadas_em`, gravada por último; sem ela o gate fecha;
- **C3:** `valor_minimo` nunca casaria — `valor_total` ainda é 0 no ponto do avaliador.

## ✅ T3 + T4 — feitas juntas (2026-09-30, `d212fb7`)

O plano mandava que fossem um par ("a T3 não fecha sozinha"), e fecharam no mesmo commit.

**O que mudou:**
- `schema.js`: `regras_aprovacao`, `requisicao_aprovacoes_regra` (UNIQUE requisição+regra),
  `regras_avaliadas_em` com carimbo nas requisições que existem quando a coluna **nasce**
  (`PRAGMA` antes, porque `safeAlter` não diz se criou);
- `approvalRulesService.js` (novo): validação com as literais da 9.5, CRUD, avaliador, gate
  (`GATE_SQL` + `exigirSemPendenciaAberta`), fila, contagem, e o claim da assinatura;
- `requisitionCreateService.dispararNotificacoesCriacao`: o avaliador, antes do valor, com falha
  logada e **porta fechada**;
- `/aprovar`: pré-checagem, guarda no `WHERE` (com `status='PENDENTE'`, que fecha também o achado
  anterior de dois `/aprovar` simultâneos), rollback das próprias reservas e 400;
- `aprovarValor`: pré-checagem e guarda, e `changes` conferido — antes o `UPDATE` devolvia sucesso
  sem mudar nada;
- as duas auto-aprovações viraram `tentarAprovacaoAutomatica`, com `dbRun`, gate e `changes`: a
  resposta não afirma mais `APROVADO` sem conferir;
- rotas novas da 9.5 e `pendencias_regra_abertas` em `GET /requisicoes` e `/:id`.

**Cenários (`regrasAprovacao.api.test.js`, 14/14),** todos pela rota: as dez literais do POST; o
avaliador casando duas regras e nenhuma; o `/aprovar` barrado **sem reserva**; a tela com a
contagem; a segregação em cada perna com a metade positiva; o avaliador falhando **fechando** a
porta; a auto-aprovação dos dois lados; a lane de valor barrada e depois liberada; a desativação
obsoletando só a pendência viva; a fila com `pode_assinar`; e **(14) a corrida** — o mesmo admin
assinando as duas pendências ao mesmo tempo, que é a única prova da guarda no `WHERE` (em sequência
a pré-checagem já dá a mensagem).

**Controle positivo — 11 sabotagens, 11 vermelhas, nenhuma NO-OP:**

| Sabotagem | Ficou vermelho | Leitura |
|---|---|---|
| S1 só sem a pré-checagem do `/aprovar` | (9) | ⚠️ **o (5) fica verde, e é CERTO**: a guarda no `WHERE` + o rollback ainda impedem a reserva órfã. O (9) cai porque a reavaliação mora na pré-checagem |
| S2 sem pré-checagem **e** sem rollback | (5) (9) | prova que o rollback é o que segura a S1 |
| S3 sem pré-checagem **e** sem gate no `WHERE` | (5) (7) (8) (9) | |
| S4 `aprovarValor` sem gate | (11) | |
| S5 auto-aprovação sem gate | (9) (10) (12) (13) (14) | |
| S6 claim sem `NOT EXISTS` | (14) | **só a corrida pega** — em sequência a pré-checagem cobre |
| S7 avaliador lendo `valor_total` da coluna | (3) (5) (6) (7) (11) (13) (14) | o C3 |
| S8 gate sem exigir o carimbo | (9) | o C2 |
| S9 obsolescência sem filtrar requisição viva | (12) | o I2 |
| S10 desativar não obsoleta | (12) | |
| S11 solicitante assina | (7) (8) | |

**Divergência que a suíte pegou:** `auditLabels.api.test.js` ficou vermelho — `regra_aprovacao` e
`APROVACAO_REGRA` nasceram sem rótulo, e a tela de auditoria mostraria o nome cru. Rótulos
acrescentados no mesmo commit; a suíte fecha 219/219.

**Limites declarados:**
- o carimbo da migração (requisições antigas) **não tem cenário**: o harness nasce com banco vazio,
  então a coluna nasce sobre zero linhas. A lógica é três linhas ao lado de um comentário;
- `/api/requisicoes-material` passa pelo avaliador por construção (chama `createRequisicao`), mas
  nenhum cenário entra por ela — vai para a T8 (integração).

---

## ✅ T5 — o lembrete por pendência de regra (2026-09-30, `dbde640`)

**O que mudou** (`requisitionReminderService.js` + duas colunas por `safeAlter`):

- **lane nova, dirigida por PENDÊNCIA** (7.2): `buscarPendenciasRegraElegiveis` (pendência `ABERTA`,
  requisição ainda aguardando, maturação por `created_at` **da pendência** e reincidência pela coluna
  nova `requisicao_aprovacoes_regra.ultimo_lembrete_enviado`);
- **plateia:** o snapshot de aprovadores **menos** o solicitante e quem já assinou outra perna — os
  dois não podem assinar esta, cobrar deles é ruído. Sem ninguém que possa, **cai na lista geral**
  (alguém que resolva: um admin, ou desativar a regra);
- **mensagem:** `buildMensagemLembrete` ganhou um 6º parâmetro opcional `pendencia`. Literais:
  assunto `Lembrete: Requisição <N> aguardando aprovação da regra "<regra>" há <N> dia`/`dias`;
  título `LEMBRETE — REQUISIÇÃO AGUARDANDO APROVAÇÃO DE REGRA`; linha `Regra: <nome>`; chamada
  `Acesse o sistema para assinar a aprovação da regra:`; e a linha `Regra:` no HTML;
- **log:** `requisicao_lembretes_log.pendencia_regra_id` (NULL = lane de status);
- **fiação num ponto só:** `processarLembretesPendentes` chama a lane de regra e devolve
  `lembretes_regra` — o job horário e a rota manual já chamam essa função, então **não há segunda
  fiação para esquecer** (a lição da Etapa 25). Uma falha da lane de regra não apaga o resultado da
  de status.

**🔶 Decisão que o plano não previa — letra B:** enquanto há pendência de regra `ABERTA`, a
requisição **sai da lane de status**. `/aprovar` e `/aprovar-valor` estão barrados pelo gate; a
lane de status cobraria a lista geral (ou os aprovadores de valor) por um gesto que eles **não podem
fazer**. Quando a última pendência é assinada, a lane de status volta. **Descartado:** manter as duas
lanes cobrando ao mesmo tempo (mensagem de "aguardando aprovação" que mente sobre qual gesto falta —
exatamente o que a RN-03 proíbe).

**Cenários (`lembreteRegra.api.test.js`, 7/7)** pelo caminho real do job, com `alertService.enviarEmail`
substituído por um coletor: elegibilidade (madura sim; nova, já lembrada, de requisição rejeitada e
obsoleta não) + reincidência marcada; plateia por endereço exato; fallback para a lista geral; as
literais; o log com a pendência; a lane de status calada com pendência aberta **e de volta sem ela**
(metade positiva); e um erro numa pendência não abortando o lote.

**Controle positivo — 9 sabotagens, 9 vermelhas, nenhuma NO-OP:** sem reincidência → (1); sem filtro
de requisição viva → (1); plateia = snapshot cru → (2)(3); sem fallback → (3); mensagem da lane de
status → (1)–(4)(6)(7); log sem pendência → (5); lane de status cobrando requisição bloqueada →
(5)(6); sem `try/catch` → (7); lane não fiada no job → (1)–(5)(7).

**Suítes:** `lembreteRegra` 7/7 · `requisicaoLembreteValor` 9/9 (a T1 continua) · `test:api` **220/220** ·
`test:almoxarifado` 42/42 · validation/safealter verdes.

---

## ✅ T6 + T7 — as telas (2026-09-30, `2b1d0f6`)

Rodaram **em série**, como a Fase 2 mandou (7.8): as duas compartilham a decisão sobre pendência
obsoleta, e ela ficou numa tela só — a T6 pergunta e avisa, a T7 mostra `Obsoleta (regra desativada)`.

**T6 — `TabRegrasAprovacao.js`** (arquivo próprio, plugado em `ConfiguracoesAlmoxarifado.js` como a
aba `regras-aprovacao`): lista com critérios em linguagem de usuário e quem assina; criar/editar com
o payload do contrato; recusa do backend com a literal dele; **desativar com pendência pede
confirmação e avisa quantas deixaram de bloquear**, desativar sem pendência não pergunta.
`projeto_id` **fora da tela** (e dentro da API): o formulário de requisição não grava projeto, então
a regra por projeto nunca casaria com requisição criada pela tela — **letra B**.

**T7 — `AprovacoesRegra.js`** (dois componentes) na `RequisicoesList`: o painel *"Aprovações de regra
aguardando você"* (só `pode_assinar`); o bloco das pendências no detalhe com o *Assinar* (espelho da
RN-07); e os três botões de aprovar **desabilitados com o motivo** enquanto houver pendência. Tudo
**só no modo almoxarifado** (o F1 da Etapa 34).

**Nenhuma ação nova em `ACAO_PERFIS`** — o lado do aprovador é por identidade (8.4) —, então o buraco
do rótulo em `permissaoErro.js` que o plano temia **não se abriu**.

**Cenários e sabotagens:** `TabRegrasAprovacao.test.js` 5/5, 5 sabotagens vermelhas (payload como
string, erro genérico, sem confirmação, confirmação sempre, sem aviso de obsoletas).
`RequisicoesList.test.js` ganhou 7 (42/42), 7 sabotagens vermelhas (botão sem gate, solicitante
assinando, duas pernas, fila sem filtro, fila fora do almoxarifado, lane de valor sem gate, URL errada).
**Client 859/859; build com `CI=true` limpo.**

## ✅ T8 — integração cruzando tudo (2026-09-30, `7fe7d6b`)

`integracaoAprovacoesRegra.api.test.js`, 7/7, num fluxo só: entra pela **segunda rota de criação**
(`/api/requisicoes-material`, que nenhuma task cobria) com uma requisição que casa **duas regras e
passa do limite de valor** → a liberação é barrada pelas regras → o job cobra **cada pendência da
sua plateia** e **cala** a lane de valor → o admin assina uma perna e é recusado na outra, a Bia
assina a segunda → o job volta a cobrar a liberação **da plateia dela** (só o Caio) → a liberação
passa, reserva, e a auditoria tem as duas `APROVACAO_REGRA` + a `APROVACAO_VALOR`. E entra também
**pelo serviço** (`createRequisicao` direto) — as duas portas que a skill manda exercitar.

**Sabotagens de fiação:** avaliador desfiado do envio → (1)(4)(5)(6)(7); lane de regra desfiada do
job → (3); lane de status sem calar → (3); `aprovarValor` **só** sem a pré-checagem → **verde, e é
certo**: a guarda no `WHERE` ainda recusa com a mesma literal (a defesa em profundidade da 9.7/C1).

⚠️ **Teste vazio meu, pego antes de valer:** a primeira rodada destas sabotagens deu **quatro NO-OP**.
O harness tinha uma função `restore` com `for f in …` que **sobrescrevia a variável `f` global** de
`sab` — a sabotagem ia para o arquivo errado e o `cmp` comparava o arquivo errado. Sexto caso desta
forma na base; corrigido com `local`, e a rodada que vale é a de cima.

---

## Fase 5 — revisão adversarial: 3 lentes, 1 fix-round, tudo reproduzido antes de corrigir

Três revisores frescos em paralelo (regras de negócio, autorização, força dos testes), instruídos a
**refutar**. O que mudou no contrato está na **9.8 do desenho**; aqui fica o placar e o que cada
achado custou.

| Lente | Achados reais | O que era |
|---|---|---|
| Regras de negócio | **2 IMPORTANT, 2 MINOR** (todos por sonda) | a regra de quantidade era contornável pelo **próprio solicitante** com linhas repetidas — **o desenho (9.3) estava errado**; a migração carimbava **rascunho**, e o envio dele com o avaliador falhando passava pelo gate vazio; não dava para desativar regra de aprovador inativo; a contagem dos GETs contava requisição morta |
| Autorização | **1 IMPORTANT, 3 MINOR** (sonda) | o superadmin que cria a regra não conseguia destravá-la (`role === 'admin'` herdado da liberação por valor); usuário desativado assinava; "Assinar" em requisição rejeitada; a fila inteira ia a qualquer usuário do módulo |
| Força dos testes | **27 sabotagens, 21 verdes** — **2 defeitos reais** + lacunas | editar pela tela **apagava `projeto_id` e zerava `ordem`**; o nome da regra saía **cru** na manchete do HTML; e o rollback de `/aprovar` na corrida, os critérios de tipo/CC, a fronteira `>=`, a migração, o `obsoleta_por_nome`, o `valor_total` da fila e quatro gestos do client **nunca eram exercitados** |

**Ruído: 1.** O revisor de autorização viu o `>=` de quantidade virar `>` em disco — era sabotagem
**temporária** do revisor de testes, rodando ao mesmo tempo na mesma árvore. Conferido: `git diff
-- server client` vazio quando os três terminaram. **Lição:** revisor que sabota e revisor que lê
na mesma árvore se enxergam; da próxima vez, o que sabota vai para worktree.

**As correções:** soma por material no avaliador; `/enviar` zera `regras_avaliadas_em` e a migração
não carimba rascunho; `idsJaNaRegra` no `PUT`; contagem dos GETs filtrada; `isAdmin` = `role admin`
**ou** `canConfigureAlmox` (servidor e tela); recusa de usuário inativo (literal nova); fila filtrada
no servidor; `podeAssinar` olha o status da requisição; escape na manchete; a tela preserva
`projeto_id`/`ordem`. E o texto de ajuda do lembrete na aba de Alertas, que o fork da documentação
achou dizendo "só PENDENTE", foi reescrito.

**Os cenários que fecham os achados:** `regrasAprovacao` 14 → **24** (quantidade por material,
fronteira, tipo/CC, superadmin, fila filtrada, inativo + desativar, contagem, **a corrida de dois
`/aprovar`** — que é a única prova do rollback —, `/enviar` zerando o carimbo, e **a migração
reexecutada com `DROP COLUMN`**, que prova o carimbo no nascimento, o rascunho de fora e o boot
seguinte sem carimbar nada); `lembreteRegra` 7 → **9** (escape nas três ocorrências, aprovador
inativo); `TabRegrasAprovacao` 5 → **7**; `RequisicoesList` +4.

**Controle positivo do fix-round:** servidor **17 sabotagens, 17 vermelhas** (X1–X17, cada uma no
cenário certo); client **6, 6 vermelhas** (C1–C6). Nenhuma NO-OP.

**Detector de esteira:** nenhum teste falhou em duas rodadas seguidas. Uma rodada de correção.

**Verificação final (medida, depois do fix-round):** `test:api` **221/221** · `test:almoxarifado` **42/42** ·
`test:validation` 4/4 · `test:safealter` 3/3 · `test:sqlite` 5/5 · client **865/865** (53 suítes) · build com
`CI=true` **Compiled successfully**. Fix-round `e4ee27c`.

## Retro de 4 números — Etapa 47

1. **Rodadas de correção até verde: 1** na Fase 5. Mas o número honesto inclui as duas revisões de
   **contrato** antes do código (Fase 2 do plano: 11 achados, 3 CRITICAL; Fase 1-c: 11 achados, 3
   CRITICAL). Os três CRITICAL da 1-c — reserva em dobro, porta aberta com o avaliador falhando,
   `valor_minimo` que nunca casaria — **teriam sido código** se a 1-c não existisse.
2. **Achados da revisão do código: 12 reais, 1 ruído** (o `>=` visto no meio de uma sabotagem
   alheia). Mais **21 lacunas de teste** provadas por sabotagem, das quais **2 escondiam defeito
   real**.
3. **Paralelismo: 0 galhos de implementação em paralelo** — a Fase 2 tirou T5/T6 de galho (a decisão
   sobre pendência obsoleta tem UI nos dois lados) e todas as oito tasks rodaram em série. **Sem
   retrabalho por isso.** O paralelismo desta etapa foi de **revisão** (3 lentes) e de
   **documentação** (um fork escrevendo os artefatos enquanto a Fase 5 rodava) — e o segundo pegou
   um texto de ajuda desatualizado que o código não tinha visto.
4. **Defeito que escapou:** *preencher na Etapa 48.* Da Etapa 46 para cá: nenhum defeito da 46 foi
   achado nesta etapa. **Da própria 47, antes de fechar:** o harness de sabotagem da T8 deu quatro
   NO-OP (variável global sobrescrita) — pego antes de valer, registrado na T8.

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
- [x] Fase 1-c — seção 9 do desenho: a assinatura de regra NÃO vira o status (o gate fica no `WHERE` de `/aprovar` e `/aprovar-valor`), 8.5 resolvida como `OBSOLETA`, contratos e literais de T3/T4 congelados. Revisada: 9.7 (`7957c3f`).
- [x] T1 (`4f53292`) · [x] T2 (`dc1c3f8`) · [x] T3 + T4 (`d212fb7`) · [x] T5 (`dbde640`) · [x] T6 + T7 (`2b1d0f6`) · [x] T8 (`7fe7d6b`) *(oito, e todas tronco — ver a Fase 2)*
- [x] Fase 5 — revisão adversarial: 12 achados reais, 1 ruído, fix-round `e4ee27c`
- [x] Fase 6 — `fechar-etapa`: novidades, specs 04/06 e mapa, guia, manual e esta retro; verificação final medida (221/221, 865/865, build limpo)

---

## Próxima tarefa detalhada — Etapa 48: a feature 06 fecha o que não depende de ninguém

**Escolha, pela ordem do CLAUDE.md.** A 06 continua 🟡 com quatro pendências. **Duas não são
executáveis agora**, e foram medidas antes de dizer isso:
- a **dupla aprovação de ajuste** aguarda a decisão **B11**, que continua em aberto na letra B. A spec
  17 está 🟢 e diz, na `:168`, que o fluxo formal *"aguarda a decisão"*;
- a **lista técnica → Engenharia** depende da feature 22, e a spec 22 (`:98` e `:162`) mede que
  *"BOM não existe em lugar nenhum do sistema"*.

**As outras duas, mais uma costura de texto que a Etapa 47 deixou, cabem numa etapa e não dependem
de decisão:**

1. **Urgência e material de cliente como critério de regra.** Pontos de atenção:
   - a urgência é **texto livre** no servidor (`schemas.js:325`, `urgencia: z.string().nullable()`);
   - os valores que a tela usa são `NORMAL`, `URGENTE` e `CRITICO` (`RequisicoesList.js:69-72`, `URGENCIA_INFO`);
   - **nada de critério sobre enum aberto:** fechar a lista é parte da task, no molde de `TIPOS_REQUISICAO`/`NC_ORIGENS` (`schema.js:40`), e a decisão sobre requisição antiga com valor fora da lista vai para a letra B;
   - "material de cliente" = algum item com `materiais_almoxarifado.proprietario_cliente_id IS NOT NULL` (`schema.js:994`; a feature 13 está 🟢 e define `NULL` = nosso);
   - consome: `regras_aprovacao` (novas colunas por `safeAlter`), `approvalRulesService.validarRegra`/`regraCasa`/`avaliarRequisicao`, e a query de itens do avaliador, que precisa trazer `m.proprietario_cliente_id`;
   - literal nova a congelar: a recusa de urgência fora da lista, no formato de `Tipo de requisição inválido: <valor>`.
2. **A fila da aprovação SIMPLES** — o item `[~]` do Frontend da spec 06, *"falta a equivalente para a lane SIMPLES"*. **Não precisa de rota nova**, e isto foi medido: `GET /almoxarifado/requisicoes` já devolve `status`, `solicitante_id` e, desde a Etapa 47, `pendencias_regra_abertas`. A fila é o recorte:
   - `status = 'PENDENTE'`;
   - `solicitante_id ≠ eu`;
   - `pendencias_regra_abertas = 0`;
   - e o usuário tem `pode('aprovar_requisicao')`, que vem de `GET /almoxarifado/minhas-permissoes` (`extended.js:527`) e falha **aberto** de propósito.

   Pontos de atenção:
   - o painel da Etapa 47 (`FilaAprovacoesRegra`, em `AprovacoesRegra.js`) é o molde;
   - **só no modo almoxarifado** (F1 da Etapa 34);
   - decidir se a lista mora num painel ou num botão de filtro, como o de *Aprovações de valor* em `RequisicoesList.js`.
3. **O texto de ajuda do lembrete, que a Etapa 47 tornou meia-verdade.** Fica em
   `ConfiguracoesAlmoxarifado.js`, `TabAlertasEstoque`, no bloco *"Lembretes de requisições
   pendentes"*, e diz *"Envia e-mail diário quando uma requisição permanece com status PENDENTE… Usa
   os mesmos destinatários configurados acima"*. Depois da T1 e da T5, a travada por valor e cada
   assinatura de regra também são cobradas, e **não** por esses destinatários. É a F(47) item 5 das
   novidades. Uma linha de texto, e ela entra com cenário que afirma a frase.

**O que NÃO reabrir:** o gate (9.1/9.7), a segregação por perna, os dois lembretes e as telas da
Etapa 47 estão fechados e com sabotagem. O furo **C68** (o `UPDATE` cru de `verificarBloqueioLiberacao`
fora da máquina de estados) **não entra nesta etapa**: é mudança de máquina de estados com efeito em
separar e entregar, e merece Fase 0 própria.

**Depois da 48, a 06 só vira 🟢 com a B11 respondida e a feature 22 existindo.** Se a 48 fechar, a
escolha seguinte volta ao mapa (🔴/🟡 de maior valor, medida antes de prometer).
