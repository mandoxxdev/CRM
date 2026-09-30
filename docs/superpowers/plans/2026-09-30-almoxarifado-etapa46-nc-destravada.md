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

---

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
- [x] T1 — gate + rotulo, as duas pontas no mesmo commit — `a625fb7` · [ ] T2 · [ ] T3 · [ ] T4 · [ ] T5
- [ ] Fase 5 — revisão adversarial
- [ ] Fase 6 — `fechar-etapa`
