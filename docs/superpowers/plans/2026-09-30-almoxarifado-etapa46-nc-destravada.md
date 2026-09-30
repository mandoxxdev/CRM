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
| **T2** | `cancelarNaoConformidade` no serviço + rota + RN-05 em `getUltimaEncerrada` | **tronco** | escreve no serviço que T3/T4/T5 leem; RN-05 toca o gancho de quantidade |
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

## T2 — tronco: o serviço, a rota e a RN-05

**`cancelarNaoConformidade(db, user, id, { motivo })`:**

1. `motivo` obrigatório (`trim()`) → 400 `O motivo do cancelamento é obrigatório`;
2. `obterNaoConformidade` → 404 `Não conformidade não encontrada`;
3. `execucao_em IS NOT NULL` → 409 `A execução desta não conformidade já foi registrada — o
   documento não pode ser cancelado` (RN-03);
4. `status === 'CANCELADA'` → 409 `Esta não conformidade já está cancelada` (RN-04);
5. **claim**: `UPDATE ... SET status = 'CANCELADA', motivo_cancelamento = ?, cancelado_em =
   CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('ABERTA',
   'DECIDIDA') AND execucao_em IS NULL` → `changes === 0` recai no 409 da RN-04;
6. auditoria `NC_CANCELADA` em `try/catch` com `console.warn` (mesmo padrão da execução);
7. devolve `{ ...nc, cancelamento: { estado_anterior, execucao_estado_anterior, mensagem } }`.

**O que o claim NÃO faz, e é regra (RN-06):** não zera `execucao_estado`, não apaga `decisao`,
`justificativa`, `decidido_por_*` nem `decidido_em`. **Comentário obrigatório no código** dizendo
que `decidido_em` preservado é o **discriminador** da seção 3 do desenho — quem "limpar" isso num
refactor futuro quebra a RN-05 sem quebrar teste nenhum de cancelamento.

**RN-05 em `getUltimaEncerrada`:** passa a casar
`(status = 'DECIDIDA' OR (status = 'CANCELADA' AND decidido_em IS NOT NULL))`, mantendo
`fato_superado_em IS NULL`. **Atualizar o docblock dela dizendo que a exclusão do `CANCELADA`
continua valendo para o cancelamento AUTOMÁTICO e deixou de valer para o humano** — a frase atual
("documento cancelado é a divergência que o operador CORRIGIU") fica, com a distinção ao lado.

**Rota** em `extended.js`, depois de `/executar`, no mesmo formato das duas vizinhas.

**Cenários (arquivo `ncCancelamento.api.test.js`):** motivo vazio; 404; cancelar ABERTA (e o índice
parcial liberado — abrir outra do mesmo tipo passa a funcionar); cancelar DECIDIDA-PENDENTE com a
decisão **conferida campo a campo** depois; `execucao_estado` **preservado** em `PENDENTE`; RN-03;
RN-04; as duas literais de sucesso; a fila `?execucao=PENDENTE` **não** traz a cancelada; RN-05 nos
dois sentidos (cancelada-por-pessoa **não** reabre; cancelada-automática **reabre**); trilha com
`dados_anteriores` carregando os dois campos.

⚠️ **O cenário da RN-05 "cancelada-automática reabre" é o controle da mudança**: sem ele, trocar a
condição de `getUltimaEncerrada` por um `OR` largo passaria verde.

---

## T3 — galho: o alerta que cobra, e a config de duas pontas

`alertRegistry.js`: `listarNaoConformidadesExecucaoPendente(db, { dias })` —
`WHERE nc.status = 'DECIDIDA' AND nc.execucao_estado = 'PENDENTE' AND julianday('now') -
julianday(nc.decidido_em) > ?`. Janela por **`decidido_em`**, não `created_at`: o que se cobra é o
tempo desde a **decisão**, e um documento aberto há 60 dias e decidido ontem não está atrasado.

Entrada `NAO_CONFORMIDADE_EXECUCAO_PENDENTE`, título *"Execução pendente"*, `configDias`
`{ chave: 'alerta_nc_execucao_pendente_dias', default: 7 }`, `dedupeChave: nc-exec-<id>`.

**Duas pontas:** semear a chave em `schema.js` (junto de `alerta_nc_parada_dias`) **e** acrescentar
a linha em `ConfiguracoesAlmoxarifado.js`. Sem a segunda, a janela existe e ninguém a regula — e há
teste de varredura de config na tela, então a suíte acusa.

**Comentário obrigatório na entrada:** por que ela é **separada** de `NAO_CONFORMIDADE_ABERTA` em
vez de a régua daquela ser afrouxada — aquela cobra a **decisão** (dono: Qualidade), esta cobra a
**execução** (dono: Compras). Uma entrada só misturaria dois destinatários e dois prazos no mesmo
cartão.

**Cenário negativo com metade positiva:** NC decidida **e executada** não aparece; NC decidida e
pendente **aparece** — as duas no mesmo teste. E a NC **cancelada** com `PENDENTE` conservado
também não aparece, que é a amarração com a T2.

---

## T4 — galho: a tela

Botão **Cancelar** em `ABERTA` ou `DECIDIDA`+`PENDENTE`, escondido por
`pode('cancelar_nao_conformidade')`. Modal com motivo **obrigatório** (botão desabilitado com o
campo vazio) e o aviso de que a decisão **não** é apagada. Toast
`Não conformidade <NUMERO> cancelada! <mensagem>`.

⚠️ **Irmão do achado 11 da Etapa 43 e do da T4 da Etapa 45:** com a fila `Pendentes de execução`
ligada, a NC cancelada **deixa de casar o filtro** e a linha some junto com o toast. Largar o filtro
depois do cancelamento, como a T4 da 45 fez com a execução.

---

## T5 — tronco: integração cruzando galhos

Fluxo por rota, ponta a ponta: receber crítico → reprovar → NC nasce → decidir `DEVOLVER` em
material **com série** → execução recusada com 400 → **conferir que a NC está na fila e no cartão
novo** → cancelar com motivo → **conferir que saiu da fila E do cartão**, que a decisão continua
legível e que o saldo **não** se moveu em nenhum dos passos.

**É a única prova de que as partes compõem:** T2 prova o cancelamento, T3 prova o cartão, e nenhuma
das duas prova que cancelar **cala** o cartão.

---

## Fase 2 — o que o revisor do plano tem de atacar

1. O discriminador `decidido_em` é **realmente** exclusivo? Existe outro caminho que grave
   `decidido_em` sem `status = 'DECIDIDA'`, ou que cancele sem passar pela rota nova?
2. A RN-05 abre porta lateral? Cancelar por pessoa passa a **impedir** a reabertura automática —
   isso esconde uma divergência que voltou?
3. Cada RN foi traçada até o **último gesto**? Depois de cancelar: a tela mostra o quê, o alerta
   cobra o quê, o gancho de quantidade faz o quê no próximo toque?
4. `idx_nc_almox_aberta` liberado pelo cancelamento cria duplicata indesejada em alguma porta?

---

## Estado

- [x] Fase 0 — medida (no plano da Etapa 45, com **uma correção**: seção 7 do desenho)
- [x] Fase 1 — desenho e plano
- [ ] Fase 2 — revisão do plano por agente fresco
- [ ] T1 · [ ] T2 · [ ] T3 · [ ] T4 · [ ] T5
- [ ] Fase 5 — revisão adversarial
- [ ] Fase 6 — `fechar-etapa`
