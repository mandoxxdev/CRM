# Etapa 46 — A não conformidade decidida deixa de ser um beco (plano)

> **Desenho:** `docs/superpowers/specs/2026-09-30-almoxarifado-etapa46-nc-destravada-design.md`
> **Feature:** 09 (Inspeção e qualidade), com efeito em 20 (Alertas) e 23 (Perfis)
> **Vem de:** furo **C64** do fechamento da Etapa 45 (dois revisores independentes) + o achado da
> Fase 0 desta etapa: o documento preso **também não cobra ninguém**.

---

## O que esta etapa entrega, em uma frase

Um documento de não conformidade decidido e impossível de executar passa a ter **saída** (cancelar,
com motivo, preservando a decisão) e passa a **cobrar** (alerta próprio de execução pendente).

---

## Sort topológico

| Task | O que é | Classificação | Por quê |
|---|---|---|---|
| **T1** | ação `cancelar_nao_conformidade` em `ACAO_PERFIS` **+** rótulo em `permissaoErro.js` | **tronco** | mexe em regra compartilhada; é o congelamento do gate que T2/T4 consomem |
| **T2** | duas colunas por `safeAlter` + `cancelarNaoConformidade` + rota + RN-05 nos **três** consumidores | **tronco** | migração e regra compartilhada; a RN-05 toca o gancho de quantidade E a exclusão do cartão D6 |
| **T3** | 15ª entrada do alerta + config nova (duas pontas) | **galho** | só consome `status`/`execucao_estado`, que T2 não altera na forma |
| **T4** | tela: botão, modal, toast | **galho** | contra contrato congelado da seção 5 do desenho |
| **T5** | integração cruzando galhos | **tronco** | roda por último, serial |

**T3 e T4 em paralelo**, sem worktree: arquivos disjuntos (`alertRegistry.js` +
`ConfiguracoesAlmoxarifado.js` × `NaoConformidadesAlmoxarifado.js`), e o tronco já congelado.

---

## T1 — tronco: o gate (e a segunda ponta, no mesmo commit)

`permissions.js`: `cancelar_nao_conformidade: [PERFIS.ADMINISTRADOR, PERFIS.QUALIDADE]`, com a
RN-07 escrita no comentário — por que **não** é `decidir_nao_conformidade` e por que **não** é
`executar_encaminhamento`.

`client/src/utils/permissaoErro.js`: `cancelar_nao_conformidade: 'cancelar não conformidade'`.

⚠️ **As duas pontas no MESMO commit.** `permissaoErro.test.js:52` varre `ACAO_PERFIS` e exige
rótulo. **Seria a oitava vez** que este buraco aparece; na sétima (Etapa 45) eu ainda reportei duas
tasks como fechadas citando só números de servidor. **Gate da task: rodar a suíte do client**, não
só a de servidor.

**Controle positivo obrigatório (a lista negativa é a que importa):** a asserção de que COMPRAS e
ALMOXARIFE **não** podem passa **verde antes de a ação existir**, porque `can()` devolve `false`
para o que não conhece. Sabotar **concedendo** a permissão a COMPRAS e confirmar que o cenário cai
**nomeando a ação**.

---

## T2 — tronco: as duas colunas, o serviço, a rota e a RN-05 nos TRÊS consumidores

> **Reescrita depois da Fase 2** (12 achados, 3 CRITICAL). A versão anterior desta task está no
> commit `b09990d`; o que mudou e por quê está na **seção 9 do desenho**.

**(a) Duas colunas por `safeAlter`** — `cancelado_por_id INTEGER` e `cancelado_por_nome TEXT` em
`nao_conformidades_almoxarifado`. **Sem migração de dados**: as NCs canceladas antes desta etapa são
todas automáticas, e `NULL` é exatamente o que as descreve. Completa o quarteto que
`conferencias_almoxarifado` já tem (`schema.js:2311-2314`) e que a NC tinha pela metade.
**`cancelado_por_id IS NOT NULL` é o discriminador** — `decidido_em` **não serve**, e a seção 9.1 do
desenho explica por quê com o cenário medido.

**(b) `cancelarNaoConformidade(db, user, id, { motivo })`:**

1. `String(motivo).trim().length >= 5` → 400 `O motivo do cancelamento deve ter pelo menos 5
   caracteres` (mesma régua e mesmo molde de `routes/almoxarifado.js:1680-1683`);
2. `obterNaoConformidade` → 404 `Não conformidade não encontrada`;
3. `execucao_em IS NOT NULL` → 409 `A execução desta não conformidade já foi registrada — o
   documento não pode ser cancelado`;
4. `status === 'DECIDIDA' && execucao_estado !== 'PENDENTE'` → 409 `A decisão desta não conformidade
   já liberou o material — o documento não pode ser cancelado` **(recusa NOVA — achado 9.3)**;
5. `status === 'CANCELADA'` → 409 `Esta não conformidade já está cancelada`;
6. **claim**: `UPDATE ... SET status = 'CANCELADA', motivo_cancelamento = ?, cancelado_em =
   CURRENT_TIMESTAMP, cancelado_por_id = ?, cancelado_por_nome = ?, updated_at = CURRENT_TIMESTAMP
   WHERE id = ? AND execucao_em IS NULL AND (status = 'ABERTA' OR (status = 'DECIDIDA' AND
   execucao_estado = 'PENDENTE'))`;
7. **`changes === 0` relê a linha e escolhe a literal** (achado 9 da revisão): uma corrida com
   `POST /executar` grava `execucao_em` entre a leitura e o claim, e aí a resposta certa é a do
   passo 3, não *"já está cancelada"*;
8. auditoria `NC_CANCELADA` em `try/catch` com `console.warn`;
9. devolve `{ ...nc, cancelamento: { estado_anterior, execucao_estado_anterior, mensagem } }`.

**O que o claim NÃO faz, e é regra (RN-06):** não zera `execucao_estado`, não apaga `decisao`,
`justificativa`, `decidido_por_*` nem `decidido_em`. **Comentário obrigatório** no código dizendo
que é `cancelado_por_id` — não `decidido_em` — que discrimina, e que a suíte de cancelamento
**não** protege isso: quem "limpar" a coluna num refactor quebra a RN-05 sem nenhum teste de
cancelamento ficar vermelho.

**(c) RN-05 nos TRÊS consumidores** — e são três, não um (achados 9.2 e 7):

| Onde | De | Para |
|---|---|---|
| `getUltimaEncerrada` (`:406`) | `status = 'DECIDIDA'` | `(status = 'DECIDIDA' OR cancelado_por_id IS NOT NULL)` |
| `UPDATE fato_superado_em` (`:524-526`) | `AND status = 'DECIDIDA'` | a **mesma** condição |
| `listarDivergenciasRecebimento`, `semNc` (`alertRegistry.js:211-213`) | `AND nc.status <> 'CANCELADA'` | `AND (nc.status <> 'CANCELADA' OR nc.cancelado_por_id IS NOT NULL)` |

⚠️ **Tocar só o primeiro é o CRITICAL 9.2**: sem o carimbo de fato superado alcançar a linha
cancelada, o item corrigido e quebrado de novo no mesmo valor fica **sem NC e sem cartão** —
silêncio completo. **Tocar só os dois primeiros é o achado 7**: o cartão do D6 passa a cobrar uma
divergência que ninguém pode documentar, porque não há tela de abertura manual.

**Rota** em `extended.js`, depois de `/executar`, no formato das duas vizinhas.

**(d) Dois comentários que passam a mentir** (achado 11), corrigidos à vista:
`alertRegistry.js:145-148` afirma *"hoje o único escritor de `CANCELADA` cancela NC `ABERTA`
(`nonConformityService.js:477`)"* — a primeira metade morre nesta etapa, e o `:477` **já está
deslocado** (o `UPDATE` está em `:495-497`). O docblock de `getUltimaEncerrada` (`:396-402`) mantém
a frase sobre o operador que corrigiu, **com a distinção ao lado**.

**Cenários (`ncCancelamento.api.test.js`):** motivo com 4 caracteres; 404; cancelar `ABERTA` (e o
índice parcial liberado); cancelar `DECIDIDA`+`PENDENTE` com a decisão **conferida campo a campo**
depois; `cancelado_por_*` gravados; `execucao_estado` **preservado**; as duas recusas de
encaminhamento-já-executado, **com as duas literais distintas**; RN-04; as duas mensagens de
sucesso; a fila `?execucao=PENDENTE` **não** traz a cancelada; a trilha.

**E os quatro cenários da RN-05, que são o coração desta task:**
1. cancelada-por-pessoa + reenvio de NF sem mudança de fato → **nenhuma NC nova**;
2. cancelada-**automática** + fato divergente de novo → **nasce NC nova** *(controle da mudança: sem
   ele, um `OR` largo em `getUltimaEncerrada` passaria verde)*;
3. cancelada-por-pessoa → **item corrigido** → quebra de novo no mesmo valor → **nasce NC nova**
   *(o CRITICAL 9.2; o guarda que existe, `naoConformidadeRegressao.api.test.js:124-160`, usa NC
   DECIDIDA e continua verde com o furo aberto)*;
4. cancelada-por-pessoa → o item **não** volta ao cartão `DIVERGENCIA_RECEBIMENTO` *(achado 7)*.

---

### ✅ T2 — feita

`ncCancelamento.api.test.js`, **15 cenários, 15/15**. `test:api` **214/214 arquivos** (eram 213 —
o arquivo novo) · almoxarifado **42/0** · validation **4/0** · safealter **3/0** · sqlite **5/0**.

**Divergência do plano, e ela é a que mais importa:** o plano dizia que a suíte de cancelamento
**não** protegeria `cancelado_por_id` — *"quem limpar a coluna num refactor quebra a RN-05 sem
nenhum cenário deste arquivo ficar vermelho"*. **Falso**, e foi a **própria sabotagem** que
derrubou a frase: trocar a escrita da coluna por `NULL` derruba **quatro** cenários. Escrevi isso
no código como aviso, e o aviso estava errado — corrigido à vista no docblock de
`cancelarNaoConformidade`.

#### As sete sabotagens — e a primeira NÃO SABOTOU

| # | Sabotagem | Cai | Asserção |
|---|---|---|---|
| 1 | `getUltimaEncerrada` volta a só `DECIDIDA` (1ª tentativa, **linha 409**) | **nada** | ⚠️ **no-op**: as linhas deslocaram quando eu inseri o docblock, e a 409 virou linha de comentário. `md5sum` igual ao backup denunciou. Refeita contando a âncora (`grep -n`), linha **433** |
| 1b | idem, na linha certa | (12) | *"o gancho devolveu ABERTA — reabriu o que uma pessoa anulou"* |
| 2 | o carimbo `fato_superado_em` volta a só `DECIDIDA` | (14) | *"o carimbo de fato superado NAO alcancou a linha cancelada por pessoa — e o 'silencio completo' do passo seguinte"* |
| 3 | o `semNc` do D6 volta à régua antiga | (15) | *"o item voltou ao cartao como divergencia NAO DOCUMENTADA — e nao existe porta para documenta-la"* |
| 4 | o cancelamento **zera** `execucao_estado` (contra a RN-06) | (5) e (10) | *"o cancelamento ZEROU execucao_estado — a RN-06 proibe: quem exclui da fila e o status"* |
| 5 | tira a recusa `JA_LIBEROU` | (7) | *"ACEITAR caiu na literal errada — e a errada MENTE sobre a causa"* — prova a **literal**, não só a recusa: o claim ainda barra, mas a mensagem passa a mentir |
| 6 | **`OR` largo**: casa qualquer `CANCELADA` em vez de `cancelado_por_id` | (13) | *"a cancelada AUTOMATICA passou a valer como encerramento, e o erro novo ficou sem documento"* — **é o controle que a Fase 2 exigiu**, e ele prova que o teste ancora o DISCRIMINADOR, não um `OR` qualquer |
| 7 | não grava `cancelado_por_id` | (3), (12), (14), (15) | quatro asserções, uma por consumidor — **e é esta que refuta o comentário do plano** |

**A lição da sabotagem 1** é a mesma que a `fechar-etapa` já traz escrita, e eu a repeti de novo:
**contar a âncora antes de aplicar `sed` por número de linha.** Eu tinha inserido um docblock de 23
linhas no mesmo arquivo minutos antes, e usei o número de linha medido **antes** dele. O `md5sum`
pegou — foi para isso que a regra existe.

**O que NÃO tem teste, e fica declarado:** a corrida entre `/cancelar` e `/executar`. O
`changes === 0` relê a linha para escolher a literal certa (achado 9 da Fase 2), mas a corrida não é
reproduzível no harness — o claim fica, e a suíte não o protege. Mesma situação do claim
serializador da Etapa 45, que virou a letra **E+**.

## T3 — galho: o alerta que cobra, a config de TRÊS pontas, e sete contagens

> **Reescrita depois da Fase 2.**

`alertRegistry.js`: `listarNaoConformidadesExecucaoPendente(db, { dias })` —
`WHERE nc.status = 'DECIDIDA' AND nc.execucao_estado = 'PENDENTE' AND julianday('now') -
julianday(nc.decidido_em) > ?`. Janela por **`decidido_em`**, não `created_at`: cobra-se o tempo
desde a **decisão**, e um documento aberto há 60 dias e decidido ontem não está atrasado.

Entrada `NAO_CONFORMIDADE_EXECUCAO_PENDENTE`, título *"Execução pendente"*, `configDias`
`{ chave: 'alerta_nc_execucao_pendente_dias', default: 7 }`, `dedupeChave: nc-exec-<id>`.

**TRÊS pontas, não duas** (achado 12): semear a chave em `schema.js`, a linha em
`ConfiguracoesAlmoxarifado.js` **e** a entrada em `COLUNAS_POR_CHAVE`
(`AlertasAlmoxarifado.js:88`). Sem a terceira, o cartão cai em `colunasGenericas` e mostra os
campos crus da primeira linha — o fallback é declarado de propósito, então **nada quebra**: é
decisão a tomar aqui, não a descobrir na Fase 5.

🔴 **A entrada nova derruba SETE asserções de contagem, em quatro arquivos** (achado 4). Elas estão
listadas porque um executor que rode só `test:almoxarifado` reporta **verde**, e quem rodar
`test:api` vê quatro arquivos vermelhos sem relação aparente com a task:

| Arquivo | Linhas | Asserção |
|---|---|---|
| `alertaNaoConformidade.api.test.js` | 156, 169 | `ALERT_REGISTRY.length === 14` / `alertas.length === 14` |
| `alertaPedidoAtrasado.api.test.js` | 179, 244 | idem |
| `alertaPedidoParcial.api.test.js` | 458, 461, 523 | idem |
| `naoConformidadeIntegracao.api.test.js` | 232 | idem |
| `alertaPedidoParcial.api.test.js` | 535 | `semCompras.length === 12` → **13** (a entrada nova só lê tabelas `*_almoxarifado`, então entra nessa conta) |

**Gate da task: `npm run test:api` inteiro**, não só `test:almoxarifado`. Atualizar cada asserção no
padrão dos comentários que já estão ali (*"13 → 14 na Etapa 43"*).

**Comentário obrigatório na entrada:** por que ela é **separada** de `NAO_CONFORMIDADE_ABERTA` em
vez de a régua daquela ser afrouxada — aquela cobra a **decisão** (dono: Qualidade), esta cobra a
**execução** (dono: Compras). Uma entrada só misturaria dois destinatários e dois prazos no mesmo
cartão. **E corrigir o comentário `:820-821`** daquela entrada, que diz que *"NC decidida ou
cancelada sai da condição sozinha, sem gancho nenhum"* — verdade quando escrita, vencida desde a
Etapa 45 (achado 11).

**Cenários, com a metade positiva obrigatória:** NC decidida e **pendente** aparece; NC decidida e
**executada** não aparece; NC **cancelada** com `PENDENTE` conservado não aparece (a amarração com a
T2, e a razão de a régua exigir `status = 'DECIDIDA'` em vez de só `execucao_estado`).

### ✅ T3 — feita (sem commit; integração pelo tronco)

`alertaExecucaoPendente.api.test.js`, **7 cenários, 7/7**. `test:api` **215/215 arquivos** (eram
214 — o arquivo novo) · almoxarifado **42/0** · validation **4/0** · safealter **3/0** · sqlite
**5/0** · client **52 suítes / 845 testes, 0 falhas** · `CI=true react-scripts build` OK.

**Arquivos tocados:** `server/services/almoxarifado/alertRegistry.js` (função nova, 15ª entrada,
export, e o comentário mentiroso corrigido à vista), `server/services/almoxarifado/schema.js`
(seed), `client/src/components/almoxarifado/ConfiguracoesAlmoxarifado.js` (`CAMPOS`),
`client/src/components/almoxarifado/AlertasAlmoxarifado.js` (`COLUNAS_POR_CHAVE`),
`server/tests/api/alertaExecucaoPendente.api.test.js` (novo) e as contagens em
`alertaNaoConformidade`, `alertaPedidoAtrasado`, `alertaPedidoParcial`,
`naoConformidadeIntegracao`, `alertaReprovadoExecutado` (servidor) +
`client/.../ConfiguracoesGerais.test.js`.

#### 🔴 Três divergências do plano, e duas custaram suíte vermelha

1. **As asserções de contagem eram NOVE, não sete.** As duas que faltavam na lista:
   · `alertaPedidoParcial.api.test.js:480` — `deepStrictEqual(medido, { total: 14, ... })` na
     **carga a FRIO** (`execFileSync`). O plano contou três neste arquivo (`:458`, `:461`, `:523`)
     e são **quatro**;
   · `alertaReprovadoExecutado.api.test.js:120` — `assert.ok(!/nc\.execucao_estado\s*=/.test(fonte))`,
     um guarda de **TEXTO-FONTE** que varria o `alertRegistry.js` **inteiro**. A régua da entrada
     nova tem `nc.execucao_estado = 'PENDENTE'` no próprio SQL, por contrato, então o guarda ficou
     vermelho acusando uma regressão que não existe. **Corrigido à vista e narrado no arquivo:** a
     janela passou a ser o **corpo de `listarReprovados`** — que é o que as duas asserções sempre
     quiseram dizer —, com uma terceira asserção contra vacuidade do corte (se o `slice` viesse
     vazio, a negativa passaria de graça). Falso positivo em guarda de texto é pior que guarda
     ausente: ele treina o próximo a "consertar" o código certo ou a apagar o guarda.

2. **A config tem QUATRO pontas, não três.** A quarta é a **fixture
   `RESPOSTA_DO_SERVIDOR`** de `client/.../ConfiguracoesGerais.test.js`: sem a chave nova ali, o
   guard client-side de `handleSalvar` lê `configs[chave]` undefined, `Number` vira `NaN` e
   **SETE testes de Salvar que nada têm a ver com a chave caem**. A nota da Etapa 43 nessa mesma
   fixture **previa** isso por escrito ("medido: foi exatamente o que aconteceu"); esta task pagou
   de novo. Cenário próprio acrescentado, no molde do da Etapa 43.

3. **O comentário que eu escrevi sobre o dedupe estava errado, e a medição o derrubou.** Eu escrevi
   que o prefixo `nc-exec-` evitava colisão com o `nc-<id>` da irmã. **Falso:** o `hash_dedupe` é
   `sha256(EVENTO|chave)` (`notificationQueueService.js:42`) e os dois eventos são distintos —
   `nc-<id>` cru nos dois **não** bateria no UNIQUE. Corrigido à vista no código, e o cenário (6)
   agora **exige as duas linhas na fila** para a mesma NC. O prefixo fica por legibilidade da
   chave na fila e no log, o que é um motivo menor e está dito como tal.

#### As nove sabotagens — e duas foram NO-OP na primeira tentativa

| # | Sabotagem | Cai | Asserção |
|---|---|---|---|
| 1 | janela por `created_at` em vez de `decidido_em` (1ª tentativa) | (2),(3),(4),(5),(7) | ⚠️ derrubou a **metade positiva** de (2) e a asserção-guarda nunca era alcançada. **O teste foi endurecido**: a positiva passou a ter a ABERTURA envelhecida também, então ela passa nas DUAS réguas |
| 1b | idem, com o teste endurecido | (2) | *"a NC … foi ABERTA ha 60 dias mas decidida AGORA — a janela e por `decidido_em`"* |
| 2 | tira `nc.status = 'DECIDIDA'` da régua | (4) e (7) | *"a NC … foi CANCELADA e continua cobrando execucao"* — **é a amarração com a T2**, e prova que `execucao_estado` sozinho não serve porque a RN-06 conserva a coluna |
| 3 | tira `nc.execucao_estado = 'PENDENTE'` | (3) e (7) | *"a NC … foi EXECUTADA e nao podia continuar cobrando execucao"* |
| 4 | `dedupeChave` sem o prefixo (1ª tentativa) | **nada** | ⚠️ **no-op**: `${linha.id}` dentro de `\Q…\E` foi **interpolado pelo perl** (`\Q` não impede interpolação de variável) e `subs=0` denunciou. Refeita com `\$\Q{…}\E` |
| 4b | idem, na forma certa | (6) | *"esperava 1 linha na fila para NC-…, veio 0"* — guarda a **fórmula** da chave |
| 5 | não semeia `alerta_nc_execucao_pendente_dias` em `schema.js` | (1) | *"alerta_nc_execucao_pendente_dias tinha de estar SEMEADA no schema"* |
| 6 | tira `nc.decisao` do SELECT | (2) e (6) | (2) na linha do cartão e (6) em *"o corpo tem de dizer O QUE ficou combinado"* |
| 7 | registro **sem a 15ª entrada** (`.slice(0, 14)`) | os **4** arquivos de contagem + o novo | `ALERT_REGISTRY.length === 15`, `alertas.length === 15`, `total: 15` na carga a frio, e `res.body.alertas.length === 15`. A `semCompras.length === 13` exigiu **sonda própria** (o cenário cai antes numa asserção anterior) — provada com cópia descartável do arquivo |
| 8 | régua de `listarReprovados` volta a ler `nc.execucao_estado` **mantendo** o carimbo | (1) de `alertaReprovadoExecutado` | *"a regua voltou a medir o ESTADO do documento em vez do movimento"* — prova que o guarda **estreitado** continua guardando o que dizia guardar |
| 9 | tira a linha de `CAMPOS` em `ConfiguracoesAlmoxarifado.js` | 1 de `ConfiguracoesGerais` | o cenário novo da Etapa 46 (a chave existe no banco e fica **ineditável** pela UI) |

**A lição da sabotagem 4** é nova e vale escrita: **`\Q…\E` do perl NÃO impede interpolação de
variável.** Um padrão com `${...}` dentro de `\Q` casa zero e o `-i` grava o arquivo intacto —
sabotagem no-op com aparência de sabotagem. O detector aqui **não** foi o `md5sum` (o arquivo não
mudou, então o hash bate com o backup e parece "restaurado"), foi o **contador de substituições**
`warn "subs=$n"`. Contar substituições é mais forte que comparar hash: ele distingue "não mudou
porque restaurei" de "não mudou porque não achei".

**O que NÃO tem teste, e fica declarado:** o cartão da tela (`COLUNAS_POR_CHAVE`) não tem cenário
de render próprio — `AlertasAlmoxarifado` não tem suíte de componente, e o fallback
`colunasGenericas` faz a ausência da entrada **não quebrar nada**. A entrada foi posta agora
justamente porque o defeito seria invisível; quem a apagar num refactor não fica vermelho.

---

## T4 — galho: a tela

> **Reescrita depois da Fase 2.**

Botão **Cancelar** em `ABERTA` ou `DECIDIDA`+`PENDENTE`, escondido por
`pode('cancelar_nao_conformidade')`. Modal com motivo **obrigatório de 5 caracteres** (botão
desabilitado abaixo disso) e o aviso de que a decisão **não** é apagada. Toast
`Não conformidade <NUMERO> cancelada! <mensagem>`.

🔴 **A coluna Execução passa a mentir na linha cancelada** (achado 5): `:532-533` renderiza o badge
**Pendente** por `nc.execucao_estado === 'PENDENTE'` **sem olhar `status`**, e a RN-06 preserva esse
estado de propósito. A linha ficaria com badge de status **Cancelada** ao lado de execução
**Pendente**, contradizendo o toast que acabou de dizer *"a execução deixa de ser cobrada"*. A
coluna tem de tratar `status === 'CANCELADA'` — e isso é contrato de tela, com cenário próprio em
`NaoConformidadesAlmoxarifado.test.js`.

🔴 **Largar só o filtro de execução NÃO devolve a linha** (achado 8): `trocarExecucao` **força**
`statusFiltro = 'DECIDIDA'` ao ligar a fila (`:335`), e a NC cancelada não casa `DECIDIDA`. E o
padrão do status é `'ABERTA'` (`:207`), então cancelar uma NC aberta também faz a linha sumir junto
com o toast. **Largar OS DOIS filtros**, com o molde de `:296` e `:367`. É o irmão do achado 11 da
Etapa 43 e do da T4 da Etapa 45 — terceira aparição do mesmo padrão.

## T5 — tronco: integração cruzando galhos

Fluxo por rota, ponta a ponta: receber crítico → reprovar → NC nasce → decidir `DEVOLVER` em
material **com série** → execução recusada com 400 → **conferir que a NC está na fila e no cartão
novo** → cancelar com motivo → **conferir que saiu da fila E do cartão**, que a decisão continua
legível e que o saldo **não** se moveu em nenhum dos passos.

**É a única prova de que as partes compõem:** T2 prova o cancelamento, T3 prova o cartão, e nenhuma
das duas prova que cancelar **cala** o cartão.

**Contrato que a T3 entregou, e que a T5 consome** (congelado — a T5 não deve redescobrir por
leitura de código):

- `GET /api/almoxarifado/alertas/central` → `alertas[14]`, `chave:
  'NAO_CONFORMIDADE_EXECUCAO_PENDENTE'`, `titulo: 'Execução pendente'`, `dias` vindo de
  `alerta_nc_execucao_pendente_dias` (semeada em `7`).
- Cada linha traz `id, numero, origem, tipo, status, decisao, decidido_em, execucao_estado,
  material_id, material_codigo, material_nome, material_unidade, recebimento_id,
  recebimento_numero, nota_fiscal, quantidade_esperada, quantidade_recebida, divergencia,
  dias_pendente`. **Sem** `justificativa` e **sem** `*_por_nome` (B30).
- Régua: `status = 'DECIDIDA' AND execucao_estado = 'PENDENTE' AND julianday('now') -
  julianday(decidido_em) > dias`. Ordem `decidido_em ASC, id ASC`. Dedupe `nc-exec-<id>`.
- **Ponto de atenção para a T5:** o fluxo ponta a ponta precisa **envelhecer `decidido_em`** (a
  janela é por decisão, não por abertura) para a NC entrar no cartão antes do cancelamento —
  envelhecer `created_at` **não** a coloca lá. Depois de cancelar, ela sai do cartão porque a
  régua exige `status = 'DECIDIDA'`, e **não** porque `execucao_estado` mudou: a RN-06 conserva a
  coluna em `PENDENTE`.
- Helpers prontos para copiar: `itemComNc`, `decidirComExecucaoPendente`, `envelhecerDecisao` e
  `envelhecerAbertura` em `server/tests/api/alertaExecucaoPendente.api.test.js`.

---

### ✅ T5 — feita

`ncBecoIntegracao.api.test.js`, **5 cenários, 5/5**.

**O fluxo dela É o cenário real do furo C64**, e isso não é detalhe de fixture: peça com
**número de série**, decidida `DEVOLVER`, execução recusada com 400 fatal. Se o cancelamento só
funcionasse em NC sem série, a etapa teria passado ao lado do problema que a originou.

**A composição que nenhuma task prova sozinha:** a T2 prova o cancelamento, a T3 prova que o cartão
cobra, e nenhuma das duas prova que **cancelar cala o cartão**. O cenário (1) afirma **presença nas
duas superfícies antes** de afirmar ausência — sem essa metade positiva, *"saiu do cartão"* passaria
com um cartão vazio. E o saldo é comparado com valor **exato** em cada passo (`10` e `3`), nunca
"não mudou".

Dois detalhes de método que o arquivo carrega escritos:

- **O cartão é consultado com janela negativa** (`dias: -1`). O SQL usa `> ?` e a NC acabou de ser
  decidida; com janela positiva o cenário mediria o **prazo**, não a régua, e passaria verde de graça.
- **O cenário (2) prende o gate pela ROTA**, e tem a metade positiva no mesmo corpo: COMPRAS toma
  **403 com a ação nomeada** ao cancelar **e continua tomando 400 ao executar**. Sem a segunda
  metade, passaria com um perfil COMPRAS que perdeu tudo — o modo de falha que a Etapa 45 documentou.

#### As quatro sabotagens

| Sabotagem | Cai | Asserção |
|---|---|---|
| a rota de cancelar pendurada em `executar_encaminhamento` | (2) | *"COMPRAS cancelou: 200"* — é a prova de que o gate da rota é o próprio, e não um vizinho onde ADMINISTRADOR e QUALIDADE também estão |
| a entrada nova do cartão para de olhar `status` | (1) **e** (4) | *"a cancelada continua no cartao — cancelar nao calou a cobranca"* |
| o cancelamento **apaga** a decisão (o rollback usado como "editar") | (3) | *"a decisao sumiu da leitura — o cancelamento apagou evidencia"* |
| tira o nível 6 da precedência (a recusa de série) | (1) | o 400 não vem — **o beco deixa de existir e o cenário perde o objeto** |

⚠️ **Uma imprecisão de disciplina, registrada porque passou perto:** na sabotagem da decisão o
`grep -cF` da âncora devolveu **2**, e a regra manda abortar fora de 1. O `perl` estava **ancorado**
(`^` + indentação exata de 4 espaços) e atingiu só a linha certa — a segunda ocorrência é o
cancelamento **automático**, com 6 espaços. Ou seja: **a contagem e o padrão mediam réguas
diferentes**, e foi sorte a contagem ser a mais larga das duas. A regra a acrescentar: **contar com
o MESMO padrão que a sabotagem usa**, não com uma versão solta dele.

---

## Fase 5 — revisão adversarial: 3 lentes, 23 achados reais, 29 hipóteses refutadas

Três revisores frescos e independentes, instruídos a refutar e a **trabalhar em cópia** (a instrução
nasceu do risco de processo registrado na retro da Etapa 44, em que uma lente sabotou a árvore).
Zero ruído: todo achado veio com cenário concreto, `arquivo:linha`, e a maioria com **sonda
executada** — uma das lentes construiu um harness de sabotagem **em memória** (intercepta
`Module.prototype._compile` e **aborta se a contagem de substituições não for 1**), que é a resposta
direta à lição da sabotagem 4 da T3.

**Duas lentes convergiram, por caminhos diferentes, num CORTE DE ESCOPO que eu não tinha visto.**

### 🔴 CRITICAL — o "silêncio completo" continuava aberto por um ramo que a suíte não cobria

O carimbo de `fato_superado_em` vivia **dentro** do ramo `!divergente` de
`sincronizarNaoConformidadeQuantidade`, que só é alcançado quando **não** existe NC `ABERTA` —
todos os ramos do `if (aberta)` retornam antes. Sonda: com qualquer NC aberta no instante em que o
operador corrige a quantidade, o documento **encerrado** do mesmo fato nunca era carimbado; quando
o fato voltava igual, `getUltimaEncerrada` o achava, `mesmoFato` batia e **nada nascia**. Falta real
e viva, zero NC no módulo e zero cartão.

**Duas coisas doem aqui.** A Fase 2 declarou essa classe **fechada** (seção 9.2 do desenho), e o
cenário (14) que a "provava" passava verde porque usa **um** documento só. E o furo é **anterior à
etapa** — reproduz também com a NC encerrada por **decisão**, sem cancelamento nenhum. A 46 declarou
fechado o que fechava pela metade.

**Conserto:** o carimbo virou `carimbarFatoSuperado` e roda sempre que `!divergente`, **antes** do
`if (aberta)`; é idempotente e só alcança documentos já encerrados. E a condição de "encerrado"
virou **uma constante só** (`SQL_ENCERRADA`), porque as duas pontas têm de andar juntas: se uma
considera encerrado o que a outra não considera, o silêncio volta.

**Controle positivo, e ele é o mais informativo da etapa:** restaurar a **posição antiga** do
carimbo derruba **só o (16)** e deixa o (14) passar — prova de que o cenário que existia era verde
com o furo aberto.

### 🔴 A RN-01 morreu — cancelar NC `ABERTA` silenciava divergência VIVA

Duas lentes, independentes. O documento morria **sem decisão**, o item saía do cartão D6, o gancho
não reabria (a RN-05 o tratava como encerramento) e **não existe tela de abertura manual**. Uma
lente mediu com o motivo *"nao quero ver isso na lista"*, que passa a régua de 5 caracteres.

**E a outra fechou o argumento:** o beco que a etapa existe para resolver é **só** `DECIDIDA` +
`PENDENTE` — a **RN-01 era escopo que eu acrescentei**, e era ela que abria a porta.

**Conserto:** cancelar exige `DECIDIDA` + `PENDENTE`. `ABERTA` recusa com literal que **ensina o
caminho** (*"decida o documento, ou corrija a quantidade conferida"*), e o cenário (3) prova que o
caminho indicado funciona. `SQL_ENCERRADA` ganhou `decidido_em IS NOT NULL` junto de
`cancelado_por_id` — redundante hoje, e é o que impede o silêncio de voltar se o escopo se alargar.

### 🔴 Três mensagens que afirmavam fato que não houve

| Mentia | Medido | Virou |
|---|---|---|
| `JA_LIBEROU`: *"a decisão já liberou o material"* | **falso** em NC de origem `RECEBIMENTO` decidida `ACEITAR` e em NC manual: zero movimentação, `liberacao_nc_em` nulo, bloqueado intacto. A régua era de **classe de decisão** | `NAO_DECIDIDA` e `SEM_PENDENCIA` — régua de **estado**, verdadeiras em todos os casos que cobrem |
| `/executar` em documento cancelado: *"a execução já foi registrada"* | `execucao_em` NULL e status `CANCELADA`. **Mesma classe de mentira** que o achado 9 da Fase 2 corrigiu no lado do cancelamento, intacta deste lado | literal própria no nível 2 da precedência |
| nível 2: *"Só é possível registrar a execução de uma não conformidade decidida"* | sobre um documento que **FOI** decidido — a frase mandava decidir o que já estava decidido | idem |

### 🔴 A trilha creditava o cancelamento a quem tem 403 nele

Os **dois** escritores de `CANCELADA` usam o mesmo verbo `NC_CANCELADA`, e nenhum gravava o
discriminador. Sonda: o **COMPRAS**, que toma 403 em `/cancelar`, aparecia como autor ao disparar o
cancelamento **automático** por `/conferir`. Agora os dois gravam `cancelado_por_id` e
`automatico: true|false` em `dados_novos`.

### As outras correções

| Achado | Conserto |
|---|---|
| o cartão novo cobra o **COMPRAS**, que não tem porta de saída (403 no cancelar), e a **QUALIDADE**, que cancela, está fora de `ver_alertas` | a descrição e o corpo do e-mail **nomeiam a saída**. **Descartado:** pôr a QUALIDADE em `ver_alertas` — alargar permissão é menos reversível, e a central carrega o **valor em dinheiro** do estoque parado, que é a razão registrada de ela estar fora. Letra **B** |
| a coluna Execução dizia *"Deixou de ser cobrada"* na NC cancelada que **nunca foi decidida** (o cancelamento automático) — cobrança que nunca existiu | o ramo ganhou `execucao_estado === 'PENDENTE'`; cenário **(39b)** novo, e o (39) sozinho passava verde com a contradição viva |
| o discriminador estrutural era gravado por um `user?.id \|\| null` de campo de auditoria; com id ausente ou `0` a linha **significava o oposto** | `AND ? IS NOT NULL` no claim |
| o fallback do `changes === 0` do cancelamento caía em *"já está cancelada"* quando a linha mudou **duas** vezes | literal `CONCORRENCIA` própria |
| a tela nunca mostrava **quem** cancelou, embora a projeção carregasse o nome desde a T2 | mostra |
| o corpo do e-mail saía com `Tipo: undefined` / `Origem: undefined`, com 7 cenários verdes | `\|\| '-'` nos dois |
| um comentário do nível 2 dizia que `CANCELADA` significa "a divergência sumiu" | corrigido — **terceira** ocorrência desta classe na etapa |

### Os cenários que faltavam, e um deles refuta uma declaração minha

**(17) a corrida `cancelar × cancelar`.** O fechamento da T2 declarou *"a corrida não é reproduzível
no harness"* — **verdade para `cancelar × executar`, falso para esta**. Uma lente mediu com
`Promise.all`: sem o claim, **dois** sucessos e **duas** linhas de trilha, com o segundo chamador
recebendo 200 sobre documento já cancelado. O claim **inteiro** era apagável com 39 cenários verdes.
Custou 6 linhas de teste. A declaração estava mais frouxa que o fato.

**(18) `/executar` sobre documento cancelado** — o estado que **esta etapa criou**, e o único
cenário de `CANCELADA` que existia forjava o estado por `UPDATE` cru numa NC **nunca decidida**.

**(39b)** e **(41)** no client: a coluna na cancelada-nunca-decidida, e **o motivo vazando de um
documento para o outro** — uma lente provou por execução que remover o reset do campo deixava os 43
cenários verdes, e o defeito é caro: abrir a NC A, digitar, clicar Voltar, abrir a NC B e o campo
vem preenchido com 5+ caracteres, **botão habilitado**.

### Uma sabotagem minha atingiu o botão errado

No controle do corte de escopo, o `perl` casou a condição do botão de **execução** em vez do de
cancelamento. Os testes seguiram **verdes**, porque a condição sabotada ficou mais **larga**, não
mais estreita — e eu só vi pelo `git diff`. Corrigi as duas explicitamente e refiz o controle.
**A lição some se não for escrita:** `md5sum` prova que o arquivo mudou, e **não** prova que mudou
onde se queria. O `git diff` do arquivo sabotado é a única leitura que responde isso.

### Números do fix-round

Cenários: `ncCancelamento` **15 → 18**, `NaoConformidades` (client) **43 → 44**,
`encaminhamentoExecucao` **24** (um cenário reescrito com a literal nova).
`test:api` **216/216 arquivos** · almoxarifado **42/0** · validation **4/0** · safealter **3/0** ·
sqlite **5/0** · client **52 suítes / 846 testes** (eram 845) · build **Compiled successfully**.

## Fase 2 — o que o revisor do plano achou (12 itens, 3 CRITICAL, 8 refutados)

Revisor fresco, 2026-09-30. **Zero ruído**: todo achado veio com cenário concreto e `arquivo:linha`,
e as oito hipóteses que ele levantou e **refutou sozinho** estão registradas na seção 9.7 do
desenho — cada uma custaria trabalho se tivesse sido aceita sem medir.

**Os três CRITICAL mudaram o DESENHO, não a execução** (verificados por leitura das linhas citadas
antes de entrar aqui):

1. **O discriminador `decidido_em` é exclusivo e NÃO é suficiente.** Uma NC `ABERTA` cancelada por
   pessoa tem `decidido_em IS NULL` — a mesma assinatura do cancelamento automático. O gancho de
   quantidade reabriria, a cada salvamento de NF, o documento que a pessoa acabou de anular. Trocado
   por `cancelado_por_id`, com duas colunas novas por `safeAlter` — **e o precedente é literal no
   schema**: `conferencias_almoxarifado` tem o quarteto completo e a NC tinha só a metade. Paga de
   graça o achado 6 (a seção 2 prometia "autor" e **não havia coluna de autor**).
2. **A RN-05 reintroduzia o "silêncio completo".** O carimbo `fato_superado_em` só alcança
   `status = 'DECIDIDA'`, então a NC cancelada por pessoa nunca o recebe: item corrigido e quebrado
   de novo no mesmo valor ficaria **sem NC e sem cartão**. É o CRITICAL que o comentário de
   `:512-527` narra, em terceira roupa — e o guarda que existe usa NC **DECIDIDA**, logo continua
   verde com o furo aberto.
3. **O claim deixava cancelar uma NC de ACEITAÇÃO já liberada.** Ela é `DECIDIDA` +
   `NAO_SE_APLICA` + `execucao_em NULL`, **e o saldo já se moveu**. O contrato ganhou a sexta
   recusa, com literal própria: a da RN-03 fala de "execução já registrada", que é **falsa** aqui, e
   sem literal nova o caso cairia no 409 de "já está cancelada", que **mente**.

**O achado que mais mudou a forma da etapa foi o 7**, IMPORTANTE e não CRITICAL: a RN-05 e a
exclusão do cartão D6 passariam a aplicar réguas **opostas** ao mesmo `CANCELADA`, que é
literalmente o defeito que o docblock de `getUltimaEncerrada` foi escrito para não repetir. Ele
forçou a régua a ficar **coerente em vez de meia**: *"cancelado por pessoa" é um ENCERRAMENTO, como
decidir*, e os **três** consumidores do estado passam a tratá-lo assim. A T2 tocava um; agora toca
três.

**O que sobrou de aprendizado sobre a Fase 2:** a pergunta que pegou o CRITICAL 1 foi a **quarta**
(*"cada RN foi traçada até o último gesto?"*), que existe no fluxo desde a Etapa 36 justamente
porque faltou uma vez. A pergunta 3, que eu escrevi para desafiar o discriminador, foi respondida
com *"sim, é exclusivo"* — e o furo estava em **suficiência**, que eu não pensei em perguntar.
Exclusividade não é suficiência, e essa é a linha a acrescentar no próximo prompt de revisão.

---

## Estado

- [x] Fase 0 — medida (no plano da Etapa 45, com **uma correção**: seção 7 do desenho)
- [x] Fase 1 — desenho e plano
- [x] Fase 2 — revisão do plano por agente fresco: **12 achados, 3 CRITICAL, 8 refutados** — desenho e plano corrigidos antes da primeira linha de código
- [x] T1 — gate + rotulo, as duas pontas no mesmo commit — `a625fb7` · [x] T2 — colunas, servico, rota e RN-05 nos tres consumidores — `2afb944` · [x] T3 — 15ª entrada, config de **quatro** pontas e **nove** contagens (executada sem commit; hash a preencher na integração) · [ ] T4 · [x] T5 — integracao cruzando os galhos — `7812823`
- [x] Fase 5 — revisão adversarial: 3 lentes, 23 achados, 1 CRITICAL, 29 refutados + fix-round
- [x] Fase 6 — `fechar-etapa`: os 7 artefatos + a retro acima

---

## Retro de 4 números — Etapa 46

**1. Rodadas de correção até verde: uma** (o fix-round da Fase 5), e nenhuma task precisou de segunda
rodada depois de integrada. **Mas o número honesto é outro:** a Fase 2 mudou o desenho **antes** da
primeira linha de código (3 CRITICAL), e a Fase 5 mudou o **escopo** depois de tudo entregue. Ou
seja: **duas reescritas de desenho, zero retrabalho de integração.** O sort topológico segurou — o
tronco congelou o contrato e os dois galhos rodaram em paralelo sem se tocar.

**2. Achados: 35 reais, 4 CRITICAL, zero ruído.** 12 na Fase 2 (plano, antes de codar — 3 CRITICAL)
e 23 na Fase 5 (três lentes — 1 CRITICAL), mais **29 hipóteses** que os revisores levantaram e
**refutaram sozinhos** antes de reportar.

**Três números que ensinam mais que o total:**

- **Duas das três lentes chegaram sozinhas ao MESMO corte de escopo**, por caminhos diferentes — e o
  que elas cortaram (a RN-01) era coisa que **eu** havia acrescentado ao desenho. Convergência
  independente é o sinal mais forte que este fluxo produz; quando duas lentes cegas apontam o mesmo
  lugar, não é questão de gosto.
- **O CRITICAL não era desta etapa.** O "silêncio completo" que a Etapa 43 fechou continuava aberto
  por um ramo que a suíte não cobria — reproduzido **sem cancelamento nenhum**, com a NC encerrada
  por decisão. **Terceira vez** nesta linhagem que uma etapa descobre que a anterior fechou pela
  metade (a 45 achou o épsilon da 44; a 44 achou a atomicidade do motor; a 46 acha o carimbo da 43).
  O padrão não é descuido de uma etapa: é que **o fechamento declara** classes inteiras como
  resolvidas a partir do caminho que ele testou.
- **Um terço dos achados da Fase 5 foi sobre a própria suíte**, que estava verde: o claim inteiro do
  cancelamento era apagável com 39 cenários passando, o e-mail saía com `undefined` com 7 cenários
  passando, e o motivo vazava entre modais com 43 cenários passando. A lente que mediu isso construiu
  um harness de sabotagem **em memória** que **aborta se a substituição não acontecer** — que é a
  resposta direta a uma lição da T3 desta etapa, aplicada no mesmo dia.

**3. Paralelismo: 2 galhos em paralelo (T3 e T4) + 3 lentes em paralelo + 2 agentes de documentação.**
Nenhum retrabalho por conflito — os arquivos eram disjuntos e o tronco estava congelado. **E o
paralelismo ACHOU coisa que serial não acharia:** a T4, rodando o gate do client, topou com **sete
falhas** causadas pela config nova da T3 e **fez certo em não tocar** arquivo do outro executor —
foi assim que a "quarta ponta" da configuração apareceu, que o plano não previa.

⚠️ **O risco de processo das Etapas 44/45 NÃO se repetiu:** as três lentes receberam, por escrito, a
instrução de trabalhar em **cópia**, e nenhuma tocou a árvore. `git status` limpo ao fim das três.

**4. Defeito que escapou:** a preencher pela Fase 0 da etapa seguinte. **Quatro candidatos
declarados**, todos com o cenário já escrito:

- **(a)** a corrida `cancelar × executar` não tem teste (**G74**) — e a lição é que a declaração
  anterior de "não é reproduzível" estava **frouxa**: a irmã `cancelar × cancelar` era reproduzível
  em 6 linhas, e sem ela a reserva inteira era apagável;
- **(b)** a condição de "encerrou o fato" é **copiada à mão** no cartão D6 (**G75**), guardada por
  teste mas ainda cópia — e este é o **terceiro** fechamento seguido em que uma revisão acha
  meia-régua nesse mesmo ponto;
- **(c)** o estado do **C67**: documento cancelado sem ninguém ter dado baixa deixa material retido
  **sem nenhuma superfície cobrando** — é o único estado novo que a etapa cria e não cobra;
- **(d)** o bloco de aviso de permissão **dentro** do modal de cancelar é inalcançável (o botão que
  abre o modal já esconde por perfil). Inerte hoje, e é o padrão *"superfície que promete o que não
  existe"* que esta base já pagou três vezes — declarado para ninguém escrever teste para ele.

---

## Próxima tarefa detalhada — escolha e medição de abertura

**A cadeia recebimento → inspeção → não conformidade → devolução → destravamento está FECHADA.** A
feature 09 está 🟢, a 12 perdeu a ressalva, a 20 ganhou a 15ª entrada, e o furo C64 — o único que
esta cadeia deixou como beco — está pago. **Não há "próximo item" pendente dentro dela**; o que
sobra são os furos declarados (C65, C67) e as fragilidades (G74, G75), nenhum deles bloqueando
operação.

**Logo a escolha volta ao mapa** (`specs/modulo-almoxarifado/README.md`), pela regra 3 do CLAUDE.md:
a feature 🔴/🟡 de maior valor, **medindo antes de prometer**. As 🟡 no mapa hoje: **00** (fundação),
**01** (cadastros), **02** (localizações), **05** (separação e picking), **06** (motor de
aprovações), **08** (recebimento), **21** (relatórios) e **22** (integrações).

**⚠️ A Fase 0 da próxima etapa TEM de começar medindo, e esta base tem três cicatrizes disso:** na
Etapa 24 eu afirmei que uma tela não existia — existia, estava no menu e no manual; na 26 contei "3
arquivos" e nomeei dois, enquanto a spec já nomeava os três corretamente; e na 45 eu afirmei que um
cartão "cobra para sempre", quando ele tem janela de 7 dias. **A regra que saiu dessas três:** ler o
que a spec já mediu **antes** de medir, e quando os dois discordarem, tratar isso como **achado** em
vez de escolher a própria medição.

**E o candidato mais provável, sem prometer nada antes de medir:** a **05 (separação e picking)** é
a 🟡 mais antiga da lista que não recebeu etapa nenhuma desde a 28, e o fluxo dela é vizinho direto
do que acabou de ser construído (requisição → separação → entrega). A **08 (recebimento)** foi
tocada pelas Etapas 42/43 e o "falta para 🟢" dela precisa ser **relido**, não assumido. **A decisão
sai da Fase 0 da próxima etapa, com a spec na mão.**

---

## Fase 0 da Etapa 47 — medida em 2026-09-30, com a spec na mão

**A cadeia da Etapa 42 à 46 está fechada** e não tem item pendente dentro dela. A escolha voltou ao
mapa, pela regra 3 do CLAUDE.md. As 🟡: **00, 01, 02, 05, 06, 08, 21, 22**.

**Escolhida: a feature 06 (Motor de aprovações).** Três razões medidas, não impressões:

1. **É a 🟡 mais antiga sem retorno** — último toque na **Etapa 3** (2026-08-05). Quinze etapas
   depois, a única coisa que ela ganhou foram itens pagos por OUTRAS features (material de cliente
   na 8, sucateamento na 9).
2. **A spec dela já traz DOIS achados medidos e NÃO consertados**, registrados na Fase 0 da Etapa 28
   (2026-08-29) e intactos treze meses de commits depois. Reverifiquei os dois hoje, e os dois
   continuam de pé.
3. **O checklist dela tem a lacuna mais estrutural do módulo**: não existe tabela de regras de
   aprovação. Confirmado: `grep -c "regras_aprovacao" schema.js` → **0**.

### O que eu medi hoje, com o resultado

| Medição | Resultado |
|---|---|
| `limite_aprovacao_auto` no repositório inteiro (`server/` + `client/`, `*.js`) | **1 ocorrência: o próprio seed** (`schema.js:2348`). Zero leitores. A configuração aparece na tela prometendo *"Quantidade máxima para aprovação automática por item"* — e **não existe aprovação automática por quantidade** |
| o `WHERE` do lembrete de requisição parada | `requisitionReminderService.js:252` → `WHERE status = 'PENDENTE'` |
| o status que a aprovação por valor grava | `requisitionValueApprovalService.js:146` → `STATUS_AGUARDANDO`, que é **`AGUARDANDO_APROVACAO_VALOR`** (`:14`) |
| o que a aprovação por valor faz com o campo do lembrete | **limpa `ultimo_lembrete_enviado`** no mesmo `UPDATE` (`:107`, `:146`, `:198`, `:240`) |
| tabela `regras_aprovacao` | **não existe** |
| a régua de valor que EXISTE | `liberacao_valor_limite`, padrão R$ 500 (`schema.js:2378`) |

### 🔴 O defeito vivo, e ele tem a MESMA FORMA do furo que a Etapa 46 acabou de fechar

A requisição travada por liberação de valor fica em `AGUARDANDO_APROVACAO_VALOR`. O lembrete de
requisição parada filtra `status = 'PENDENTE'` — **e portanto nunca a alcança**. E a ironia é
medida: a própria aprovação por valor **limpa `ultimo_lembrete_enviado`** ao entrar nesse status,
ou seja, **prepara o campo para um lembrete que nunca dispara**.

**A requisição que mais precisa de cobrança — a que passou do limite em reais — é a única que fica
sem ela.** É "escrita sem leitor" na forma mais cara, e é exatamente a forma do **C64**: o estado
que mais precisa de uma superfície é o que nenhuma superfície cobra.

### O escopo, e a ordem tem razão

**Tronco primeiro, e não é escolha de conveniência:** os dois achados de 2026-08-29 são defeitos
**na própria feature** que a etapa vai construir. Construir regras configuráveis sobre um lembrete
que não alcança metade dos estados seria empilhar em cima de furo conhecido.

1. **T1 (tronco) — o lembrete alcança a requisição de alto valor.** E aqui há uma decisão de desenho
   a tomar com medida: o lembrete de `PENDENTE` cobra **quem aprova**; o de
   `AGUARDANDO_APROVACAO_VALOR` cobra **quem libera por valor** — podem ser plateias e prazos
   diferentes, e a Etapa 46 acabou de pagar essa lição (uma entrada de alerta por dono e por prazo,
   nunca uma que mistura dois). **Medir antes:** quem são os destinatários de cada um hoje.
2. **T2 (tronco) — `limite_aprovacao_auto`: ou ganha leitor, ou sai do seed.** A spec manda escolher.
   **O caminho reversível é TIRAR do seed** (a configuração promete na tela o que não existe, e
   remover a promessa é reversível; implementar aprovação automática por quantidade é regra de
   negócio que ninguém pediu). Registrar na letra B com o descartado.
3. **T3 (tronco) — `regras_aprovacao`**: tabela, critérios (tipo de requisição, criticidade do
   material, valor, quantidade, projeto/centro de custo), e **N aprovações** por requisição.
4. **T4 (tronco) — o avaliador** no envio da requisição, gerando a lista de pendências.
5. **T5/T6 (galhos) — a aba de configuração das regras** e **a tela da fila de aprovações**.
6. **T7 (tronco) — integração** cruzando os galhos: requisição que dispara duas regras, aprovada por
   duas pessoas diferentes, com a segregação da Etapa 3 valendo em cada uma.

### ⚠️ O que a Fase 1 NÃO pode assumir

**A segregação e a rejeição justificada JÁ EXISTEM** (Etapa 3, nas duas lanes) e **não** devem ser
reescritas — a spec marca as duas como pagas, e eu confirmei o registro imutável via
`auditoria_log_almoxarifado`. **E a spec 06 tem três itens que dependem de OUTRAS features**
(material fora da lista técnica → feature 22; dupla aprovação de ajuste → feature 17; e a config de
regras, que depende da tabela). Os dois primeiros ficam fora, declarados.

### ⚠️ CORREÇÃO DA MINHA PRÓPRIA FASE 0, medida na Fase 1 (2026-09-30)

**O que eu escrevi acima, e o que a spec 06 diz desde 2026-08-29:** *"o lembrete de requisição
parada NUNCA alcança a requisição de alto valor"* — e eu acrescentei *"a requisição que mais precisa
de cobrança é a única que fica sem ela"*.

**A primeira frase está certa. A segunda está EXAGERADA, e a diferença muda o desenho da T1.**

Medido em `requisitionValueApprovalService.js:112` e `:322-334`: existe
**`notificarAprovadoresValor`**, chamada **no instante em que a requisição entra em
`AGUARDANDO_APROVACAO_VALOR`**, que manda e-mail para os aprovadores de valor configurados —
assunto *"Aprovação de valor necessária"*, com o limite formatado. Ou seja: **os aprovadores SÃO
avisados**, uma vez, na entrada.

**O que realmente falta é a COBRANÇA RECORRENTE.** O aviso sai uma vez e nunca repete; o lembrete
diário — que existe e reincide para `PENDENTE` — não alcança este status. A requisição de alto valor
tem **notificação de nascimento e nenhuma cobrança de permanência**.

**Por que isso importa para o desenho, e não é detalhe de redação:**

1. **A plateia já está resolvida e medida.** `isAprovadorValor` (`:90-95`) é `admin` **ou** id na
   lista `aprovadorIds` da configuração, e `getEmailsAprovadores` já converte isso em e-mails. A T1
   **não** precisa inventar destinatário — e a pergunta que a Fase 0 mandou medir ("quem são os
   destinatários de cada um") **já tem resposta**: são plateias **diferentes** de propósito (o
   lembrete de `PENDENTE` vai para quem aprova requisição; este vai para a lista de aprovadores de
   valor). Isso **confirma** a decisão de não misturar os dois num lembrete só.
2. **O campo `ultimo_lembrete_enviado` sendo limpo na entrada deixa de ser ironia e passa a ser
   coerência**: ele é zerado porque o relógio da cobrança recomeça ali. O defeito não é a limpeza —
   é **não existir quem leia** o campo nesse status.
3. **E a T1 encolhe:** não é "criar notificação para um estado que ninguém vê", é **estender o
   alcance do lembrete que já existe**, com a plateia que já existe. Bem menor, e com risco menor.

**Fica escrito, e não corrigido em silêncio, por três motivos.** O texto errado esteve **commitado e
empurrado** (`06e3b00`). Ele faria a Fase 1 desenhar uma notificação do zero, duplicando
`notificarAprovadoresValor`. E é a **sexta** vez nesta base que uma medição minha sobre "o que já
existe" exagerou uma ausência — a mais recente foi a **B180** da Etapa 45, em que eu afirmei que um
cartão "cobra para sempre" quando ele tinha janela de 7 dias. **O padrão é sempre o mesmo:** eu
descrevo o que **imagino** que o código faz em vez de ler, e o erro cai sempre no mesmo lado —
**ausência exagerada**, nunca subestimada.

⚠️ **E isto também é um achado sobre a SPEC 06**, não só sobre mim: o achado 2 dela, escrito em
2026-08-29, diz *"a requisição que mais precisa de cobrança é a única que fica sem ela"* — a mesma
frase exagerada, na fonte. A spec será corrigida no fechamento da Etapa 47, dizendo o que ela
afirmava e o que está certo.
