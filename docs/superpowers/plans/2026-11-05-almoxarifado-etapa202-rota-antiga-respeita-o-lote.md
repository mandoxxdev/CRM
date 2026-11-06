# Etapa 202 — A rota antiga de movimentação respeita o lote informado

> **Tronco só (uma rota + um teste de unidade + um de integração; sem galho de tela).** Estimativa enviada: item 3 de
> `docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas-2.txt` (**2h30**). Fecha o **C458**
> (`docs/almoxarifado-novidades-por-etapa.md`; achado F6 da revisão adversarial da 191, reproduzido em
> `docs/superpowers/plans/2026-10-23-almoxarifado-etapa191-corrigir-validade-de-lote.md:495`). Plano medido sobre `2f3b660c` (linhas abaixo são de hoje).
> Spec: `specs/modulo-almoxarifado/10-lotes-series-etiquetas/README.md` (e `22-integracoes` para a frase de quem chama de fora). Ponto de
> partida: "Próxima tarefa detalhada" de `docs/superpowers/plans/2026-11-05-almoxarifado-etapa201-sai-de-mostra-o-que-sobra.md` (`:289` em
> diante) — conferida linha a linha, bate (uma correção na contagem de testes, abaixo).

## Objetivo (em linguagem simples)

Um sistema de fora lança uma saída no almoxarifado dizendo "tire 1 peça do lote LV". O lote LV está vencido. Hoje o pedido passa: o sistema
**ignora** o lote, tira a peça "de lugar nenhum" e a linha *"Sem lote atribuído"* do relatório de saldo por lote fica em −1, enquanto o LV
continua dizendo 5. A tela **Movimentações** já recusaria ("lote vencido"). Depois desta etapa, o pedido de fora recebe a **mesma** recusa —
e, se o lote estiver bom, a peça sai **do lote** citado.

## Fase 0 — medido em 2026-11-05 (sobre `2f3b660c`)

### A rota antiga (v1)

- `POST /api/almoxarifado/movimentacoes` — `server/routes/almoxarifado.js:1386-1416`. Só `requirePermission('movimentar')` (login e acesso ao
  módulo vêm do prefixo). `:1387` desestrutura **só** `material_id, tipo, quantidade, motivo, referencia, observacoes`; `:1389-1394` recusa
  tipo fora de `ENTRADA/SAIDA/AJUSTE/DEVOLUCAO` (*"Tipo inválido. Use ENTRADA, SAIDA, AJUSTE ou DEVOLUCAO"*) e `SAIDA`/`AJUSTE` sem motivo
  (*"Motivo é obrigatório para saída e ajuste"*). `:1407-1410` chama `stockService.registrarMovimentacao(db, req.user, { material_id, tipo,
  quantidade, motivo, referencia, observacoes, justificativa: motivo || null }, { exigeLote: true, exigeSerie: true })`. `:1411-1415`: 201 com
  `id, material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, referencia, observacoes`; erro `res.status(e.status ||
  500).json({ error: e.message })` (não usa `handleError`).
- **O comentário `:1397-1405`** diz "O contrato v1 nao carrega lote: a recusa e o comportamento certo" — vai ser reescrito (T1).
- `validate` já é importado no arquivo (`:77`); `schemas` também (`:78`, sem `MovimentacaoSchema`).
- **"Exige lote" — confirmado:** material com `controle_lote` sem lote pela v1 → 400 *"O material ⟨codigo⟩ exige lote nesta movimentacao
  (controle por lote ligado)"* (`stockService.js:1352-1357`, porque a v1 passa `exigeLote: true`). Provado hoje por
  `loteControleObrigatorio.api.test.js:95-102` (`[rota v1] o modal rapido…`). Com a etapa, a v1 **sem** lote continua assim; **com** lote
  passa a poder movimentar o material controlado (como a v2).

### O motor (nada muda nele)

- `registrarMovimentacao` (`stockService.js:1104-1107`) roda inteiro sob `trava.naTravaDoMaterial(params.material_id)` (chave
  `Number(materialId)`, `travaPorMaterial.js:150`). A etapa **não** cria porta nova: só repassa chaves a um motor que já pega a trava. A
  validação de forma da v1 roda antes, fora da trava, e não lê estado — como a da v2 (`validate()` antes do handler).
- Validade informada (`:1266-1277`): `lotService.validarDataValidade(params.data_validade)`; informada fora de entrada →
  `MSG_VALIDADE.SO_ENTRADA`; sem lote → `MSG_VALIDADE.SEM_LOTE` (literais em `lotService.js:42-50`).
- Resolução do lote (`:1278-1300`): `lote_id` ganha de `lote`. `lote_id` inexistente → *"Lote nao encontrado"*; de outro material → *"O lote
  informado pertence a outro material"* (comparação **estrita** `loteResolvido.material_id !== material_id`, `:1282`); `lote` (código, com
  `trim`) inexistente: em **entrada** cria (`criarOuObterLote`, com a validade informada), em saída → *"Lote nao encontrado para este
  material: ⟨L⟩"*. `lote` vazio/só espaços = sem lote.
- Saída com lote (`:1543-1583`): status ≠ `ATIVO` → *"Lote ⟨L⟩ esta ⟨status em minúsculas⟩ e nao pode ser utilizado"*; vencido sem liberação
  (fora dos tipos de descarte) → *"Lote ⟨L⟩ vencido em ⟨data_validade⟩ nao pode sair para consumo. Libere o vencimento do lote (PUT
  /api/almoxarifado/lotes/:id/liberar-vencimento) com justificativa, ou baixe por SUCATA/PERDA ou corrija por AJUSTE."*. Depois, o débito
  do lote é `claimSaldoDoLote` (`:2216-2238`; insuficiente → *"Saldo insuficiente no lote ⟨L⟩. Disponível: ⟨n⟩ ⟨unidade⟩"*, com o físico
  revertido). Sem lote (`:2239`) drena os endereços — é por aí que a linha sem lote fica negativa (o C458).
- `AJUSTE` não está em `TIPOS_SAIDA` (`movementTypes.js:69-71`): ajuste com lote não passa pela guarda de vencido — **igual à v2** (o motor
  é um só); `DEVOLUCAO` está em `TIPOS_ENTRADA` (`:44-45`) e cria lote como a entrada.
- Retorno do motor (`:2597-2602`): `id, saldo_anterior, saldo_posterior` + `aviso_caixa`/`aviso_retencao`/`aviso_validade` opcionais. A v1
  hoje descarta os avisos.

### A rota nova a imitar (v2)

- `POST /api/almoxarifado/movimentacoes/v2` — `server/routes/almoxarifado/extended.js:853-867`: `auth`, `requirePermission('movimentar')`,
  `validate(MovimentacaoSchema)`, repassa `req.body` inteiro com `{ exigeLote: true, exigeSerie: true }`.
- `MovimentacaoSchema` — `server/services/almoxarifado/schemas.js:87-146`: `lote: z.string().optional()` (`:104`), `lote_id:
  z.number().int().positive().optional()` (`:107`), `data_validade: z.unknown().optional()` (`:136`, sem tipo: quem julga é o motor). O
  objeto tem `superRefine` → **`.pick()` lança** (*".pick() cannot be used on object schemas containing refinements"*, medido com zod
  **4.4.3**); `.shape.lote` e `.shape.lote_id` funcionam (medido).
- Literais do zod 4.4.3 pela régua `formatZodError` (`validation.js:16-21`), medidas hoje com `MovimentacaoSchema.shape`:
  - `lote_id: "12"` → `Dados inválidos — lote_id: Invalid input: expected number, received string`
  - `lote_id: 0` → `Dados inválidos — lote_id: Too small: expected number to be >0`
  - `lote_id: 1.5` → `Dados inválidos — lote_id: Invalid input: expected int, received number`
  - `lote: 5` → `Dados inválidos — lote: Invalid input: expected string, received number`
  - `lote_id: null` → `… expected number, received null`; `lote: null` → `… expected string, received null` (a v2 recusa `null`)
  - `lote: ""` → aceito (o motor trata como sem lote)

### Quem chama a v1

- `client/`: **só** `client/src/components/almoxarifado/MateriaisAlmoxarifado.js:153-159` (modal rápido Entrada/Saída da tela **Materiais**):
  `material_id, tipo, quantidade, motivo, referencia` — **sem lote**, sem `data_validade`. A tela não muda.
- Servidor: nenhum serviço chama a rota; não há chave de API nem porta de integração no repositório — "integração" é quem chama com o token
  de um usuário.
- **Testes (correção da contagem do plano da 201):** **22** arquivos de `server/tests/api/` citam a URL v1, mas **16** fazem `POST` nela
  (`configuracoesGerais`, `epiPontaAPonta`, `loteControleObrigatorio`, `materialClienteAjuste`, `minhasPermissoes`,
  `motivosMovimentacaoUso`, `movimentacaoV1Permissao`, `movimentacoes`, `movimentoRegras`, `pedidoReabreIntegracao`, `perfisUsuario`,
  `permissoesRotas`, `portasAvulsasCaixaIntegracao`, `recebimentoAvisoEntradaIntegracao`, `serieControleObrigatorio`,
  `termoFerramentaPontaAPonta`); os outros 6 só fazem `GET` do livro. **Nenhum** dos 16 manda `lote`, `lote_id` ou `data_validade` (grep do
  corpo de cada `post(…/movimentacoes')` + 3 linhas; controle positivo da régua: ela acha o `motivo: 'sem lote'` de
  `loteControleObrigatorio:98`). **Nenhum muda de propósito.**

## Decisões (letra B — reversíveis; números livres depois de B1349)

- **B1350 — repassar, não recusar.** A v1 passa a repassar `lote`, `lote_id` e `data_validade` ao motor. Descartado: recusar com 400
  *"use a v2"* quando vier lote — quebraria a integração que hoje manda um lote **bom** e recebe 201 (passaria a 400 sem motivo de estoque),
  e a regra pedida é "a mesma da tela Movimentações", que **aceita** lote. Descartado também: continuar aceitando em silêncio (é o C458).
  Efeito para quem chama de fora: saída citando lote inexistente, de outro material, bloqueado, vencido ou sem saldo no lote, que hoje dava
  201 "sem lote", passa a 400 com a literal do motor — é a correção, não quebra.
- **B1351 — validar a forma reaproveitando o schema da v2, só nas duas chaves.** Novo `LoteDaMovimentacaoV1Schema = z.object({ lote:
  MovimentacaoSchema.shape.lote, lote_id: MovimentacaoSchema.shape.lote_id })` em `schemas.js` (o `.pick()` não serve, ver Fase 0). Descartado:
  `validate(MovimentacaoSchema)` inteiro na v1 — mudaria as recusas de `quantidade`/`material_id`/`tipo` que os 16 testes e o modal conhecem
  (ex.: quantidade em texto, mensagem *"Tipo inválido…"*). `data_validade` não entra no schema: na v2 ela é `z.unknown()`, quem julga é o
  motor — a v1 repassa crua e ganha as mesmas mensagens.
- **B1352 — `null` e ausente são "sem lote" na v1.** `lote: null`/`lote_id: null` (e `data_validade: null`) são tirados do corpo **antes** do
  schema: hoje um sistema de fora que manda `"lote": null` recebe 201 e continuaria recebendo. A v2 recusa `null`; a v1 não passa a recusar.
  Descartado: igualar à v2 também no `null` (quebraria quem serializa campos vazios como `null`, sem ganho de estoque).
- **B1353 — entrada com código novo cria o lote, como na v2.** `ENTRADA`/`DEVOLUCAO` com `lote` inexistente cria o lote (com a validade, se
  informada). Descartado: na v1 só aceitar lote existente — seria uma regra que a tela **Movimentações** não tem, e a integração que dá entrada
  de um lote novo ficaria sem porta (ou cairia de novo no "sem lote").
- **B1354 — a validade vai junto (`data_validade`).** Sem ela, o lote criado pela v1 nasceria sem validade — o C450 (190) de novo, por outra
  porta. Corte possível, se o tempo apertar: tirar `data_validade` (o lote nasce sem validade, como na v2 com o campo em branco) e registrar.
- **B1355 — localização, séries, reserva e o resto do schema da v2 ficam fora.** A v1 continua sem `localizacao_origem_id/destino_id`,
  `series/serie_ids`, `reserva_id`, `custo_unitario`… A saída com lote sem endereço já é atendida pelo `claimSaldoDoLote` (conjunto das linhas
  do lote). Endereço abriria `validarEnderecoExplicito`, `origemEstrita` e leitura de código — outra etapa, se alguém pedir. Material com
  `controle_serie` continua recusado na v1 (`exigeSerie`).
- **B1356 — a resposta 201 da v1 não muda.** Mesmas chaves; não ecoa `lote_id`/`lote` nem os avisos do motor (nenhum leitor hoje). Descartado:
  acrescentar `lote_id`/`lote_codigo` (o motor não os devolve; teria de ler o livro — custo sem leitor).

**Aviso novo (C a partir de C474):**

- **C474 — `material_id` em texto + `lote_id` na v1.** A v1 não tipa `material_id`; o motor compara o dono do lote com `!==` (`:1282`), então
  `material_id: "7"` com `lote_id` do material 7 responde *"O lote informado pertence a outro material"* — mensagem errada para um tipo errado.
  Não é estoque errado (recusa, nada gravado). Fica registrado, não consertado nesta etapa (mexer no `material_id` da v1 muda o eco da
  resposta e o tipo que o motor recebe em todo caminho). O teste RN-202.09 documenta o comportamento de hoje.

## Regras de negócio

- **RN-202.01 — Saída pela v1 citando lote vencido é recusada.** Material **sem** controle de lote, lote LV vencido com 5, sem liberação. `POST
  /movimentacoes` `{ tipo:'SAIDA', quantidade:1, motivo, lote_id: LV }` (e o mesmo com `lote: 'LV'`) → 400 com a literal do vencido; nada
  gravado: físico 5, linha do LV 5, linha sem lote igual, nenhuma linha nova no livro.
- **RN-202.02 — Saída pela v1 citando lote bom sai do lote.** Mesmo cenário, lote LB ativo e dentro da validade com 5 → 201; físico 4, LB 4, a
  linha sem lote **não** fica negativa (igual ao antes); o livro grava `lote_id = LB` e `lote = 'LB'`. Por código e por id.
- **RN-202.03 — As recusas de lote do motor chegam pela v1.** Saída com `lote` inexistente → *"Lote nao encontrado para este material: X"*;
  `lote_id` inexistente → *"Lote nao encontrado"*; `lote_id` de outro material → *"O lote informado pertence a outro material"*; lote
  `BLOQUEADO` → *"Lote ⟨L⟩ esta bloqueado e nao pode ser utilizado"*; mais do que o lote tem → *"Saldo insuficiente no lote ⟨L⟩. Disponível:
  ⟨n⟩ ⟨un⟩"*. Todas 400, nada gravado.
- **RN-202.04 — A forma do lote é a da v2; `null`/vazio é sem lote.** `lote_id: "12"`, `0`, `1.5` e `lote: 5` → 400 com as literais do zod
  (Fase 0). `lote: null`, `lote_id: null`, `lote: ''`, `lote: '  '` → tratado como sem lote (201 no material sem controle, igual a hoje).
- **RN-202.05 — Material com controle de lote.** Sem lote pela v1 → continua 400 *"exige lote…"* (o teste `loteControleObrigatorio:95` fica
  intocado); com `lote` numa ENTRADA → 201, cria o lote, saldo no lote; com `lote_id` numa SAIDA → 201, sai do lote.
- **RN-202.06 — Entrada pela v1 com lote novo cria o lote, com a validade informada.** `{ tipo:'ENTRADA', lote:'LN', data_validade:'2027-03-31'
  }` → 201, lote LN com `data_validade = '2027-03-31'`. `data_validade: '31/03/2027'` → 400 `MSG_VALIDADE.FORMATO`, nada criado;
  `data_validade` numa SAIDA → 400 `MSG_VALIDADE.SO_ENTRADA`; `data_validade` sem lote → 400 `MSG_VALIDADE.SEM_LOTE`.
- **RN-202.07 — Sem lote no corpo, tudo igual.** O corpo do modal (`material_id, tipo, quantidade, motivo, referencia`) → mesmas respostas de
  hoje; os 16 arquivos que fazem `POST` na v1 verdes **sem mudança**.
- **RN-202.08 — A resposta 201 da v1 não muda.** Chaves exatamente `id, material_id, tipo, quantidade, saldo_anterior, saldo_posterior,
  motivo, referencia, observacoes` (com lote citado ou não).
- **RN-202.09 — (documenta o C474)** `material_id` em texto com `lote_id` do próprio material → 400 *"O lote informado pertence a outro
  material"*, nada gravado. Se um dia mudar, este teste muda junto (e o C474 fecha).
- **RN-202.10 — Paridade v1 × v2.** Para os mesmos corpos de RN-202.01/03/06 (formato da validade), a v1 e a v2 dão o **mesmo status e a
  mesma mensagem** (fora as recusas de forma, onde a v1 só olha `lote`/`lote_id`).

## Contrato congelado

`POST /api/almoxarifado/movimentacoes` (v1) — **o que muda**:

- **Payload:** os de hoje (`material_id, tipo, quantidade, motivo, referencia, observacoes`) **+** opcionais `lote` (string), `lote_id`
  (inteiro positivo), `data_validade` (texto `AAAA-MM-DD`, julgado pelo motor). `null` em qualquer dos três = ausente.
- **Ordem das recusas:** (1) tipo inválido → 400 *"Tipo inválido. Use ENTRADA, SAIDA, AJUSTE ou DEVOLUCAO"* (igual); (2) motivo → 400
  *"Motivo é obrigatório para saída e ajuste"* (igual); (3) **novo** forma do lote → 400 `Dados inválidos — <campo>: <mensagem do zod>`
  (literais da Fase 0); (4) o motor, sob a trava, com as literais de RN-202.03/05/06 e as de sempre.
- **Resposta 201:** inalterada (RN-202.08). **Erro:** `{ error }` com `e.status || 500`, inalterado.
- **Permissão:** inalterada (`requirePermission('movimentar')`).

Esboço da rota (o executor pode ajustar a forma, não o efeito):

```js
const { material_id, tipo, quantidade, motivo, referencia, observacoes } = req.body;
const loteCru = {};
for (const k of ['lote', 'lote_id', 'data_validade']) if (req.body[k] !== undefined && req.body[k] !== null) loteCru[k] = req.body[k];
// ... tipo e motivo como hoje ...
const forma = LoteDaMovimentacaoV1Schema.safeParse({ lote: loteCru.lote, lote_id: loteCru.lote_id });
if (!forma.success) return res.status(400).json({ error: `Dados inválidos — ${formatZodError(forma.error)}` });
const result = await stockService.registrarMovimentacao(db, req.user, {
  material_id, tipo, quantidade, motivo, referencia, observacoes, justificativa: motivo || null, ...loteCru,
}, { exigeLote: true, exigeSerie: true });
```

(`formatZodError` sai de `services/almoxarifado/validation.js`, já exportado. Cuidado: `safeParse` com chave `undefined` — passar só as que
existem, para o zod 4 não reclamar.)

## Tasks (sort topológico)

Tudo é **tronco**: uma rota só, e os dois testes dependem dela. Sem galho (nada de tela: o modal não manda lote; a fatia visível é o relatório
*Saldo por lote* que deixa de ficar negativo por esse caminho — mostrada no roteiro manual do guia, não em código novo).

- **T0 — Fase 2: revisão do plano** por agente fresco (as quatro perguntas da `desenvolver-etapa`, incluindo seguir cada RN até o último gesto:
  saída v1 com lote → livro → relatório saldo por lote → estorno da saída pelo livro → devolução citando a saída). Corrigir o plano antes de T1.
- **T1 — tronco: a v1 repassa o lote.** TDD. Arquivo novo `server/tests/api/movimentacaoV1Lote.api.test.js` (runner próprio, `test()`,
  contador, `process.exit`; harness `testApp.js`), cenários `[RN-202.01]` a `[RN-202.09]`, vermelho primeiro (RN-202.01/02/03/05-com-lote/06
  falham hoje; RN-202.04-null, 07, 08 passam hoje — são de regressão, e o controle positivo deles é o (c) abaixo). Depois:
  `schemas.js` exporta `LoteDaMovimentacaoV1Schema`; `routes/almoxarifado.js:1386-1416` como o esboço; reescrever o comentário `:1397-1405`
  (a v1 agora carrega lote; a exigência continua para quem não cita). Fixtures: lote vencido por `UPDATE lotes … SET data_validade =
  '2020-01-01'` ou `criarOuObterLote` com data passada; saldo do lote por `registrarMovimentacao` ENTRADA com `lote_id` (como
  `loteControleObrigatorio:75-77`); linha sem lote lida em `estoque_saldo_almoxarifado WHERE lote_id IS NULL`.
- **T2 — tronco: integração cruzando rotas.** Arquivo novo `server/tests/api/movimentacaoV1LoteIntegracao.api.test.js`:
  (a) **pela rota v1** do começo ao fim: ENTRADA v1 com `lote:'LV'` e `data_validade` passada → SAIDA v1 `lote:'LV'` → 400 vencido →
  `PUT /lotes/:id/liberar-vencimento` com justificativa → SAIDA v1 → 201 → `GET` do relatório de saldo por lote (a rota que a tela **Lotes e
  Séries**/*Saldo por lote* usa — o executor mede qual em `extended.js` antes) mostra LV com 4 e nenhuma linha sem lote negativa →
  estorno da saída pelo livro (rota de cancelar movimentação) devolve ao LV;
  (b) **paridade v1 × v2** (RN-202.10): os mesmos corpos nas duas rotas, mesmo status e mensagem;
  (c) **pelo serviço**: o mesmo corpo da (a) chamado direto em `stockService.registrarMovimentacao` com `exigeLote` dá o mesmo resultado
  que a rota (prova que a rota não filtra nada que o motor aceitaria).
- **T3 — suíte completa + controles positivos** (perl, base LF, md5 antes/depois, um de cada vez):
  (a) tirar `lote_id` do repasse → RN-202.01 por id e RN-202.02 por id ficam vermelhos;
  (b) tirar a remoção de `null` → RN-202.04 (null) fica vermelho;
  (c) tirar `data_validade` do repasse → RN-202.06 fica vermelho; (d) trocar o schema por `z.any()` → RN-202.04 (forma) fica vermelho;
  (e) trocar a ordem (forma antes do tipo) → um cenário de "tipo inválido com lote_id texto" fica vermelho (pôr esse cenário em T1).
  Depois: os cinco comandos do CLAUDE.md, serial.
- **T4 — Fase 5: revisão adversarial** (lentes: RN × motor; "este teste passaria com a feature quebrada?"; quem chama de fora — contrato).
- **T5 — fechamento** (`fechar-etapa`): novidades (seção da 202, B1350–B1356, C458 resolvido, C474), spec 10 (**a tabela `:217` e o
  parágrafo `:757-759` dizem que a v1 "não carrega lote" — corrigir e dizer que estava assim até a 202**), spec 22 se citar a v1, mapa, guia
  (Antes → Agora; roteiro: chamar a v1 com um cliente HTTP e ver a recusa; o relatório *Saldo por lote*), manual (frase com RN-202.01/02),
  estimativa (estimado × gasto).

**Cabe em 2h30?** Sim, apertado: análise já feita (este plano), T1 ~1h (10 cenários de um padrão só), T2 ~40 min, T3 ~20 min, a mudança de
código ~15 linhas. **Corte, se estourar:** primeiro a parte (c) da integração (o serviço já é provado pelos testes do motor); depois a
`data_validade` (B1354 → o lote nasce sem validade, registrado como C novo).

## Pontos de atenção

- Não usar `validate(MovimentacaoSchema)` na v1 (B1351) — o `validate()` **troca** `req.body` e mudaria as recusas de quem já chama.
- `lote` só com espaços é "sem lote" no motor (`String(lote).trim()`); o schema aceita string vazia — não "corrigir" para `min(1)` (a v2 aceita).
- O teste de corrida não é necessário: nenhuma leitura nova de saldo fora do motor; o motor já serializa pela trava (Etapa 97, B494).
- Cuidado com teste vazio: conferir `lote_id` gravado no livro (`movimentacoes_almoxarifado.lote_id`), não só o status 201 — hoje a saída com
  lote bom **também** dá 201 (sai sem lote); só o livro e a linha do lote distinguem.

## Fase 2 — correções do revisor fresco (2026-11-06) — **MANDAM sobre o texto acima onde divergem**

Revisor fresco sobre `681d7f4a`: 0 trava, 2 importantes, 3 menores, todos aceitos. Confirmado: v1 (`routes/almoxarifado.js:1387`) e v2
(`extended.js:853`) têm o mesmo `requirePermission('movimentar')`; o motor já pega `naTravaDoMaterial`; estorno da saída volta à linha do lote
(`stockService.js:3390-3398`); devolução herda o lote (`returnService.js:140-141`); lote novo nasce mesmo com `controle_lote = 0` (`:1290-1295`);
nenhum dos 16 testes que fazem POST na v1 manda lote/lote_id/data_validade.

1. **[IMPORTANTE] AJUSTE com lote deixa a linha do lote negativa** (medido pela v2, mesmo motor: LB 5 + 3 sem lote, AJUSTE 1 com LB → 201, LB −2;
   `syncSaldoLocalizacaoPadrao`, `:551-580`, só drena sem lote; chamada com o lote em `:2318`). **Decisão (B nova, reversível):** a v1 **não repassa**
   lote/lote_id/data_validade quando o tipo é `AJUSTE` — fica igual a hoje; o defeito do AJUSTE com lote (v2 desde a Etapa 6) vira **C475**, registrado,
   não consertado. A frase de `:52` ("AJUSTE com lote … igual à v2") sai. Teste: v1 AJUSTE com `lote_id` → mesmas linhas de hoje (sem lote), e a v2 no
   mesmo cenário documenta o C475.
2. **[IMPORTANTE] B1350 incompleta** — acrescentar: "Também passam a 400: lote/lote_id com tipo errado (zod) e data_validade em formato errado, fora
   de entrada, sem lote ou em conflito com a validade de um lote vivo (regras da 190: `MSG_VALIDADE.FORMATO`/`SO_ENTRADA`/`SEM_LOTE`/`CONFLITO`,
   `lotService.js:146-152`, `stockService.js:1266-1277`). É a mesma recusa da tela Movimentações." Cada uma com um cenário na T1.
3. **[MENOR] B1356 / RN-202.08:** a resposta 201 da v1 ecoa `...(result.aviso_validade ? { aviso_validade: result.aviso_validade } : {})`
   (`stockService.js:2522`, `:2601`); RN-202.08 = "as 9 chaves de hoje + `aviso_validade` só quando o motor avisa".
4. **[MENOR]** `lote: '  '` → descartar no `loteCru` o `lote` vazio depois do `trim`; o teste asserta `lote IS NULL` no livro.
5. **[MENOR] C474 consertado aqui (uma linha):** `stockService.js:1282` → `Number(loteResolvido.material_id) !== Number(material_id)` (protege também
   `/transferencias`). Teste: `material_id` em texto com `lote_id` → 201; controle: sem o `Number` → cai.

## Execução

- [ ] T0 — Fase 2: revisão do plano
- [ ] T1 — tronco: a v1 repassa o lote (`movimentacaoV1Lote.api.test.js`, `schemas.js`, `routes/almoxarifado.js`)
- [ ] T2 — tronco: integração v1 → liberar vencimento → relatório → estorno; paridade v1 × v2; serviço
- [ ] T3 — suíte completa + controles positivos (a)–(e)
- [ ] T4 — Fase 5: revisão adversarial
- [ ] T5 — fechamento (`fechar-etapa`)

## Próxima tarefa detalhada

**Item 4 do 2º pacote** (`docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas-2.txt`, **1h15**): **"Requisição excluída
deixa de guardar o local separado"** — o **C467** (listado no plano da 199, `docs/superpowers/plans/2026-11-05-almoxarifado-etapa199-virgula-e-espacos-do-termo.md:134`:
*"a requisição excluída guarda a origem nos itens: pequeno, sem efeito hoje (coberto por teste nas duas portas); limpar na exclusão é
higiene"*). Ponto de partida a medir na Fase 0 da 203: a exclusão é `requisitionService.excluirSemTrava` (`server/services/almoxarifado/
requisitionService.js:2531`, roda por dentro de `comTravaDaRequisicao` e da trava por requisição — ordem requisição → material); as colunas
de origem separada dos itens (procurar em `server/services/almoxarifado/schema.js` as colunas que a separação grava por item — a régua
`separacaoSeparadoDeOutras` já exclui a requisição `ativo = 0`, RN-198.03, então nenhuma conta muda). Pontos de atenção: a gravação que
perde depois de mexer em estoque **não** tenta de novo (B447/B452) — limpar a origem tem de vir no mesmo passo que marca a requisição como
excluída, ou depois dele, nunca antes do estorno; os testes que cobrem o C467 (*"[RN-198.03 excluida, C467]"*) passam a assertar a origem
**limpa**.
