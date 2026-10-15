# Almoxarifado — Etapa 110: o Saldo Inicial do cadastro passa pelo motor, e a corrida da família fecha (plano)

> Origem: "Próxima tarefa detalhada — Etapa 110" do plano da 108 (**C215**) e a **B61** de Compras / **C218** (plano da
> 109, "Próxima de Compras"). Design: `docs/superpowers/specs/2026-10-15-almoxarifado-etapa110-saldo-inicial-e-corrida-da-familia-design.md`
> (a Fase 0 medida está lá).
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-15): última B **B720**,
> último C **218** (a corrida, gravada pela 109), última A **A56**, último G **G87**. Esta etapa: **B721+**, **C219+**,
> **A57+**. A 111 (Compras/core) roda em paralelo na `CRM-wt-e111` — não tocar `modulosSistema.js`/`modulosMeta.js`.

## Regras de negócio

### C215 — o Saldo Inicial

- **RN-01 — saldo inicial exige `movimentar`.** `POST /api/almoxarifado/materiais` com `quantidade_atual` > 0 (depois de
  arredondar a 1e-6) por quem não tem `movimentar` → **403** literal **E1**, depois do schema (Zod: corpo mal formado
  continua 400) e antes de qualquer outra validação do corpo (família, localização, flags) e de gravar. *Cenários:* Engenharia com 5 → 403 E1, nenhum material; Engenharia com
  0 / sem a chave → 201 (como hoje).
- **RN-02 — material com controle que o cadastro não informa não nasce com saldo.** Com `quantidade_atual` > 0 e qualquer
  de `controle_lote`, `controle_serie`, `requer_inspecao` verdadeiros ou `proprietario_cliente_id` informado → **400**
  literal **E2**, nomeando todos os motivos na ordem fixa, antes da validação da família e de gravar. *Cenários:* lote; série;
  inspeção; cliente; lote + cliente (dois motivos); a mesma coisa com saldo 0 → 201.
- **RN-03 — o saldo inicial permitido é uma Entrada do motor.** Material nosso, sem lote/série/inspeção, por quem
  movimenta: o material é gravado com `quantidade_atual` 0 e o saldo entra por `stockService.registrarMovimentacao(db,
  user, { material_id, tipo: 'ENTRADA', quantidade, motivo: 'Saldo inicial de cadastro', localizacao_destino_id: ⟨padrão,
  quando há⟩ }, { exigeLote: true, exigeSerie: true })`. Resultado: `quantidade_atual` = q; **uma** linha `ENTRADA` no livro com `saldo_anterior` 0, `saldo_posterior`
  q, motivo `Saldo inicial de cadastro`, `usuario_id`, `unidade`, e `localizacao_destino_id` = a localização padrão (quando
  houver; NULL sem padrão); a **origem** (ip/user_agent) na auditoria `movimentacao`/`ENTRADA` (o livro não tem coluna de
  origem — Fase 2, achado 2); a linha de saldo por localização na padrão. Resposta
  201 igual à de hoje (a linha do material, com `quantidade_atual` q). *Cenários:* Almoxarife com 5 sem localização; com
  localização padrão; 2,5 em PC (a Entrada aceita); o custo unitário do cadastro não muda.
- **RN-04 — a Entrada que falha não deixa material pela metade.** Se o motor recusar ou falhar depois do `INSERT`, o
  material recém-criado é apagado (e suas linhas de saldo por localização), e a resposta é o erro do motor com o status
  dele. Nenhuma auditoria `CRIACAO`. *Cenário (serviço, injetado):* motor lança 400 → 400 com a mensagem, 0 materiais com
  o código, 0 auditorias `CRIACAO`; criar de novo com o mesmo código → 201 (não "Código já existe").
- **RN-05 — sem saldo, nada muda.** `quantidade_atual` 0, `''`, omitido, ou que arredonda a 0 (1e-7; antes gravava 1e-7) → o fluxo de hoje (nenhuma linha no livro), para
  qualquer perfil com `criar_material`, com qualquer flag. Remessas/Sobras (não mandam a chave) inalteradas.

### B61 / C218 — a corrida da família

- **RN-06 — o cadastro de material só grava com a família ativa no mesmo comando.** O `INSERT` de `createMaterial` vira
  `INSERT … SELECT … WHERE EXISTS (SELECT 1 FROM familias_material_almoxarifado WHERE id = ⟨familia⟩ AND ativo = 1 AND
  parent_id IS NULL) AND (⟨sub⟩ IS NULL OR EXISTS (… id = ⟨sub⟩ AND parent_id = ⟨familia⟩ AND ativo = 1))`, em **todas**
  as tentativas do `codigo_auto`. Não gravou (0 linhas, sem erro) → relê com `validateFamiliaAtiva` + `validateSubfamilia`
  e responde **400** com a literal de hoje (`Família inativa — não é possível vincular novos itens`, `Subfamília inválida
  para a família selecionada`, `Família não encontrada`, a da subfamília no lugar da família); se a releitura passar
  (desfeito na janela), tenta **uma** vez mais; não gravou de novo → relê outra vez (a literal de agora) e, só se a
  releitura passar de novo (a família virou duas vezes), **409** literal **E3**. *(Divergência da execução: o plano dizia
  "não gravou de novo → E3" direto; a segunda releitura responde o motivo verdadeiro na maioria dos casos — teste dos dois.)*
  A decisão é por \`changes\`, nunca por \`lastID\` (Fase 2, achado 4: o \`INSERT … SELECT\` que não grava devolve o \`lastID\`
  do comando anterior da conexão). Nunca `Código já existe` por
  causa da família.
- **RN-07 — o `PUT` de material que troca família ou subfamília também.** Quando a rota valida a família (informada e
  mudou) ou a subfamília (informada e mudou, ou a família mudou) — as condições de hoje —, o `UPDATE` ganha as mesmas
  condições de RN-06 ao lado da do dono (RN-09 da 108). Não gravou → relê: dono mudou → o 409 da 108; família/subfamília
  não valem mais → 400 com a literal de hoje; senão → **409** literal **E4**. Nada gravado (nem os outros campos), sem
  auditoria.
- **RN-08 — inativar família só grava sem material ativo e sem subfamília ativa, no mesmo comando.** `DELETE
  /familias/:id`: o `UPDATE … SET ativo = 0 WHERE id = ? AND ativo = 1` ganha `AND NOT EXISTS (SELECT 1 FROM
  materiais_almoxarifado WHERE (familia_id = ? OR subfamilia_id = ?) AND ativo = 1) AND NOT EXISTS (SELECT 1 FROM
  familias_material_almoxarifado WHERE parent_id = ? AND ativo = 1)`. Não gravou → relê, na ordem de hoje (Fase 2,
  achado 7 — o plano punha o 404 primeiro): itens ativos → 400 `Não é possível remover: família possui N item(ns)
  ativo(s)`; subfamílias ativas → 400 `Não é possível remover: família possui N subfamília(s) ativa(s)`; não existe → 404
  `Família não encontrada`; senão (já inativa) → 200 `{ success: true, ja_inativo: true }` sem auditoria.
- **RN-09 — o `PUT` de família na transição 1 → 0 também.** Quando `inativa` (era ativa, `ativo` informado 0), o `UPDATE`
  ganha as mesmas duas condições `NOT EXISTS` e `AND ativo = 1`. Não gravou → relê: itens ativos → 400 a literal dos itens;
  subfamílias ativas → 400 `Não é possível inativar: família possui subfamília(s) ativa(s)`; não existe → 404; já inativa
  por outro → grava o resto do corpo sem a condição (o estado proibido não pode nascer: com a família inativa o cadastro
  de material já recusa) e responde como hoje, com a auditoria `EDICAO` dizendo o "de" **de agora** (já inativa), não o
  lido antes da corrida (Fase 2, achado 8). Ordem da releitura: itens → subfamílias → não existe.
- **RN-10 — a corrida real não produz mais o estado proibido.** Os quatro pares da Fase 0, 30 rodadas, nas duas ordens:
  nunca família (ou subfamília) inativa com material ativo nela; cada requisição recusada com a literal de hoje.

### Tela

- **RN-11 — o cadastro avisa antes.** No cadastro **novo**, com lote, série, inspeção ou cliente marcados, aparece sob o
  campo *Saldo Inicial* a frase **E5**. Na edição, nada muda. O backend decide (a frase não trava o campo).

## Contrato congelado

`server/services/almoxarifado/materialService.js` exporta, além do que já exporta:

```js
// [] se pode; senao a lista de motivos na ordem fixa (RN-02). Nao le o banco.
function motivosSaldoInicialRecusado(data) { ... }   // ['tem controle por lote', 'tem controle por número de série', 'exige inspeção', 'é de cliente']
const SALDO_INICIAL_MOTIVO = 'Saldo inicial de cadastro';
// E2 montada
function mensagemSaldoInicialRecusado(codigo, motivos) { ... }
// SQL das condicoes de familia (RN-06), para o PUT reutilizar
function condicaoFamiliaSql() { ... }   // devolve { sql, params(familiaId, subfamiliaId) }
```

A rota `POST /api/almoxarifado/materiais` (gate `criar_material` inalterado) checa RN-01 antes de chamar o serviço
(`can(req.user, 'movimentar')`); o serviço checa RN-02 primeiro (antes da família), RN-06 no `INSERT`, RN-03/RN-04 depois.

**E1** (403; `${perfil}` = `getPerfilFromUser(req.user)`):
```
Cadastrar material com saldo inicial exige a permissão "movimentar" (seu perfil: ${perfil}) — o saldo inicial é uma entrada no estoque. Cadastre com saldo 0 e peça a quem movimenta o estoque para lançar a Entrada em Movimentações.
```
**E2** (400; motivos unidos por `, `):
```
O material ${codigo} não pode nascer com saldo inicial: ${motivos}. Cadastre com saldo 0 e lance a entrada depois — em Movimentações (Entrada, com o lote e as séries) ou pelo Recebimento (inspeção e material de cliente).
```
**E3** (409, RN-06):
```
A família do material mudou enquanto ele era cadastrado — nada foi gravado. Tente de novo.
```
**E4** (409, RN-07):
```
O cadastro do material ${codigo} mudou enquanto era salvo — nada foi gravado. Recarregue o material e salve de novo.
```
**E5** (tela, RN-11):
```
Material com lote, série, inspeção ou de cliente nasce com saldo 0 — a entrada é lançada depois, em Movimentações ou pelo Recebimento.
```

Literais de hoje que continuam valendo (lidas do código): `Família inativa — não é possível vincular novos itens`;
`Subfamília inválida para a família selecionada`; `Família não encontrada`; `A família escolhida é uma subfamília — escolha
a família principal e use a subfamília no campo Subfamília`; `Não é possível remover: família possui ${n} item(ns)
ativo(s)`; `Não é possível remover: família possui ${n} subfamília(s) ativa(s)`; `Não é possível inativar: família possui
subfamília(s) ativa(s)`; `Código já existe`; o 409 do dono da 108.

## Tasks (sort topológico)

- [x] **T1 (tronco) — o saldo inicial pelo motor.** RN-01..RN-05. `materialService.js` (motivos, E2, INSERT com 0, Entrada
  pelo motor, compensação), `routes/almoxarifado.js` (POST: E1). Teste novo `server/tests/api/saldoInicialCadastro.api.test.js`.
  Controle positivo: conceder `movimentar` à ENGENHARIA (cai RN-01 nomeando); tirar cada motivo (cai o cenário dele); voltar
  ao `INSERT` direto do livro (cai RN-03 na origem/destino); sem a compensação (cai RN-04).
- [x] **T2 (tronco, depois de T1) — o lado do material.** RN-06, RN-07. `materialService.createMaterial` (INSERT
  condicional, releitura, E3), `routes/almoxarifado.js` (PUT de material: condição no UPDATE, releitura, E4). Teste novo
  `server/tests/api/familiaMaterialCorrida.api.test.js` com a janela injetada (embrulha `db.get` da conferência da família e
  inativa entre a conferência e a gravação). Controle: tirar a condição do INSERT / do UPDATE.
- [x] **T3 (tronco, depois de T2) — o lado da família.** RN-08, RN-09, RN-10. `routes/almoxarifado.js` (DELETE e PUT de
  família). No mesmo arquivo de teste: janela injetada (material gravado entre a contagem e o UPDATE) e a corrida real dos
  quatro pares nas duas ordens (30 rodadas). Controle: tirar cada `NOT EXISTS`.
- [x] **T4 (galho, contra o contrato) — a tela.** RN-11. `MaterialAlmoxarifadoForm.js` + caso novo no
  `MaterialAlmoxarifadoForm.test.js` (a frase aparece com cada flag e com cliente no cadastro novo; não aparece sem flag nem
  na edição). Controle: trocar a condição.
- [x] **T5 (integração, depois de T1–T4) — o documento até o fim, pela rota E pelo serviço.**
  `server/tests/api/saldoInicialFamiliaIntegracao.api.test.js`: (K1) pela rota — a Engenharia cadastra com saldo → 403; com
  0 → 201; o Almoxarife lança a Entrada pela v2 → saldo; o Almoxarife cadastra outro com saldo 5 → o extrato do material
  (`GET /materiais/:id/historico`) mostra a Entrada; o **estorno** dessa Entrada (`POST /movimentacoes/:id/cancelar`) leva
  a 0; o Administrador inativa a família com material ativo → 400; inativa o material e depois a família → 200; cadastrar na
  família inativa → 400. (K2) pelo serviço — `materialService.createMaterial` direto com saldo e lote → 400 E2; com família
  inativada na janela → 400 a literal. (K3) material de cliente cadastrado com 0 e a entrada pelo Recebimento continua
  exigindo documento (a mensagem da Etapa 8).
- [ ] **T6 — Fase 5 e fechamento.**

## Fase 2 — revisão do plano (agente fresco, 2026-10-15) — 1 trava, 7 correções, 6 notas

O revisor leu o código e rodou quatro sondas (`server/tests/sonda/e110rv-*.js`, não versionadas; uma delas carrega o
`materialService` do HEAD para medir o comportamento de antes). A T1 já estava aplicada na árvore quando ele mediu.

1. **(TRAVA) O destino no livro.** O motor grava no livro o `localizacao_destino_id` **informado**, não o resolvido: sem
   passá-lo, a linha do saldo inicial ficava sem destino com o saldo na padrão. **Corrigido:** a chamada passa a padrão
   quando há; teste novo (destino = padrão; NULL sem padrão).
2. **(correção) A origem não fica no livro** (a tabela não tem coluna de ip/user_agent) — vai para a auditoria
   `movimentacao`/`ENTRADA`. RN-03 reescrita; o teste já lia a auditoria.
3. **(correção) 400 novo do motor:** padrão **bloqueada** (ou que não aceita o tipo do material) com saldo inicial → 400
   *"Localização ⟨código⟩ está bloqueada"* (antes 201) e o material desfeito; sem saldo continua 201. Aceito com a literal
   do motor (B723); teste novo.
4. **(correção) `lastID` engana** no `INSERT … SELECT` que não grava — a implementação decide por `changes` (RN-06).
5. **(nota)** 1e-7 arredonda a 0 → sem saldo (RN-05 nomeia); custo não muda; nasce ativo; E1 vem depois do Zod (RN-01
   reescrita); efeitos novos da Entrada pelo motor: a fila de notificação de movimentação (quando ligada) e uma auditoria
   `movimentacao` a mais.
6. **(correção) A condição de RN-06 e as três entradas do serviço:** sub `0`/`''` → `subfamilia_id || null` (já era a
   forma da implementação); sem família pelo serviço → sem condição de família (`1 = 1`), como a validação de hoje;
   `parent_id = 0` é raiz para as rotas de família e subfamília para o cadastro (anterior — **C223**, nota).
7. **(correção) A ordem da releitura do DELETE** é itens → subfamílias → 404 (o plano punha o 404 primeiro). Corrigido.
8. **(correção) A condição do PUT de material separada em duas** (família, subfamília) — a implementação já recebia
   `{ familia, sub }`; e a auditoria do "já inativa por outro" do PUT de família dizia o "de" lido antes. Corrigido, com
   asserção.
9. **(nota)** T4 é galho de verdade; T1→T2→T3 seriais com razão.
10. **(correção) A RN-02 se contorna em dois gestos:** cadastrar com saldo sem controle (201) e depois o `PUT` ligar lote,
    série, inspeção ou o cliente (200) — inclusive pela Engenharia, quebrando "séries = saldo". **Anterior** à etapa; vira
    **C222** (declarado, não corrigido aqui — mexe na edição de material com saldo, outra regra). *(Medido de novo no
    fechamento, sonda `e110c222.js`: o **cliente** já é 403 pela regra da 108; lote, série e inspeção passam com 200, e
    depois a saída do saldo antigo é recusada pela falta de lote/séries — a C222 ficou com os três.)*
11. **(nota)** Estorno da Entrada do saldo inicial → 0 (como antes); reativar material na família inativa pelo `PUT`
    (`ativo: 1`) produz o estado proibido sem corrida (**C220**, já nomeada).
12. **(nota)** Remessas/Sobras/transformação 8c não mandam `quantidade_atual` e mandam `codigo_auto: 1` — a RN-06 entra
    em toda tentativa. O formulário manda `quantidade_atual` no PUT, que a ignora.
13. **(nota) Canto da compensação:** se o motor falhar **depois** de gravar a linha do livro (na auditoria dele), o
    `DELETE` do material esbarra na chave estrangeira; o erro é engolido com log e o material fica com o saldo atrás de um
    400. Declarado (**D (110)**); a recusa comum (padrão bloqueada) desfaz de fato.
14. **(correção) Um teste existente quebra:** `materialServiceCriacao` "grava a movimentacao de saldo inicial igual a
    rota" — o corpo completo tem lote e inspeção. Reescrito com o material sem esses dois controles.

## Execução (2026-10-15)

- **Plano** `233f4787` (design, plano, Fase 2 incorporada).
- **T1** `a5173c00` — `materialService` (motivos, E1/E2, `quantidadeSaldoInicial`, INSERT com 0, Entrada pelo motor com o
  destino da padrão, compensação), rota (E1 antes do serviço). Teste novo `saldoInicialCadastro` (**20**; 13 vermelhos
  antes da implementação — os 6 verdes eram as metades positivas e a padrão que já caía na A-01). `materialServiceCriacao`
  ajustado (Fase 2, achado 14). **Controle:** `movimentar` para ENGENHARIA (2 caem, nomeando), cada um dos quatro motivos
  tirado (5, 2, 2, 4 caem), o INSERT direto de volta (RN-03 cai pela unidade e RN-04), sem o DELETE da compensação (RN-04),
  a família validada antes do RN-02 (o cenário da ordem). Todas na asserção certa.
- **T2+T3** `96f28b29` — um commit (a correção é uma só, dos dois lados; o teste de corrida real só prova com os dois).
  `familiaMaterialCorrida` (**31**: janela injetada em cada porta + a corrida real dos quatro pares nas duas ordens).
  **Controle:** sem a condição do INSERT (8 caem), do PUT de material (3), da sub (2), do DELETE (9 — inclusive as seis
  corridas reais do DELETE), do PUT de família (4, inclusive as duas corridas do PUT), do `NOT EXISTS` da sub (2), a
  auditoria do "de" lido antes (1). **Achado do controle:** sem a condição do INSERT as corridas reais **não** caíram em 30
  rodadas — o lado da família sozinho já fecha a ordem que a HTTP produz; o lado do material só é provado pela janela
  injetada (que caiu). **Divergência do plano:** E3 só depois de duas releituras (RN-06).
- **T4** `28907d0d` — `AVISO_SALDO_INICIAL` + a frase; 8 casos novos no `MaterialAlmoxarifadoForm.test.js` (51).
  **Controle:** tirar o lote da condição, e mostrar também na edição — 1 caso cai em cada.
- **T5** `7c578b56` — `saldoInicialFamiliaIntegracao` (K1–K3). **Controle:** sem o gate da rota cai K1; sem o motivo do
  cliente cai K3; sem a condição do DELETE nada cai (esperado — a integração não tem corrida; a unidade a cobre).

## Fase 4 — integração serial (2026-10-15)

Sem worktree de galho (T4 é tela contra a frase do contrato, na mesma árvore). Suíte na árvore com T1–T5 (antes dos
commits): `test:api` **366/366** arquivos (EXIT 0); `test:almoxarifado` **44/44**; `test:validation` **4/4**;
`test:safealter` **3/3**; `test:sqlite` **10/10**; cliente jest **109 suítes / 1591 testes**; `CI=true react-scripts
build` EXIT 0. (Uma rodada anterior, com só a T1, deu 363/364 — o `materialServiceCriacao` do achado 14.)

## Fase 5 — revisão adversarial do código (2026-10-15) — 2 defeitos reais (1 da etapa, 1 anterior), 11 asserções faltando

Dois revisores frescos em worktrees próprias (`CRM-wt-e110rv1`, `CRM-wt-e110rv2`, HEAD `7c578b56`, junção; removidas).

- **Revisor 1 (RN, perfil, último gesto)** — sondas `e110rv1-saldo/motor/familia/literais`. Passou: oito perfis × saldo;
  formatos (`"5"`, 5.0000001, `"1e-7"`, `''`, -1, null, true, `"abc"`, [5]); flags e dono em todos os formatos;
  `codigo_auto` com colisão e saldo (a Entrada vai para o material novo); padrão bloqueada com notificação ligada (nada
  sobra em tabela nenhuma); o 409 do dono da 108 vence a família na mesma janela; DELETE de família com ids malformados → 404;
  E1–E5 byte a byte. **Achados:** (1) **real, da etapa** — o "já inativada por outro" do PUT de família regravava `ativo = 0`
  sem condição (reativação + material na releitura → estado proibido). **Corrigido:** a 2ª tentativa leva o `NOT EXISTS`;
  falhou de novo → relê, e 409 *"A família mudou enquanto era salva — nada foi gravado. Recarregue a família e salve de
  novo."* se nada impede. (2) **real, anterior** — o PUT de família sem `ativo` regravava o `ativo` lido (renomear desfazia
  um Inativar concorrente, ou reinativava com material novo). **Corrigido:** `ativo = COALESCE(?, ativo)` com null quando
  omitido (B727). (3)(4) **anteriores** — reativar subfamília e criar subfamília × inativar a raiz deixam sub ativa sob raiz
  inativa: reproduzidos, **declarados** (C221).
- **Revisor 2 ("o teste passaria com a feature quebrada?") — 45 sabotagens: 32 vermelhas, 13 verdes.** Equivalentes ou
  inalcançáveis: S07 (`exigeLote:false` — o RN-02 recusa antes), R15 (família apagada: o código nunca apaga), R20
  (`familiaOmitted` redundante). Falta de asserção: P1–P9 (condição em toda tentativa do `codigo_auto`; família que vira
  sub e sub que muda de pai na janela; **troca de família e sub juntas — caso feliz, nenhum teste fazia**; família com sub
  inativa inativando de fato; E1 depois do Zod; RN-01/RN-02 pelo arredondado; a compensação apagando o saldo por
  localização) — viraram `saldoInicialFamiliaFase5.api.test.js` (**9**); R06 (dono × família na mesma janela) coberto pela
  sonda do rv1, sem teste (baixo valor).
- **Commit** `e5584a85`. **Controle:** sem a condição na 2ª tentativa cai o cenário do achado 1; gravando o `ativo` lido cai
  o do achado 2; quatro sabotagens do rv2 (sub sem `ativo`, compensação sem o saldo, sub com a família atual, condição só na
  1ª tentativa) derrubam P5, P9, P4 e P1. Uma rodada deu EADDRINUSE (o rv2 rodando suítes em paralelo) — repetida verde.
- **Suíte depois da Fase 5:** `test:api` **367/367**; `test:almoxarifado` **44/44**; `test:validation` **4/4**;
  `test:safealter` **3/3**; `test:sqlite` **10/10**; jest **109 / 1591**; build EXIT 0.

## Retro de 4 números

- **Rodadas de correção até verde:** 3 — Fase 2 (a trava do destino + 7 correções, com a T1 já escrita), a do controle
  positivo da T2 (o E3 que o plano descrevia mentia na maioria dos casos — virou a segunda releitura) e a Fase 5 (os dois
  defeitos do PUT de família + 9 testes). Nenhum teste vermelho em duas rodadas seguidas.
- **Achados de revisão:** Fase 2 — 1 trava + 7 correções **reais**, 6 notas. Fase 5 — rv1: **2 reais** de código (1 da etapa,
  1 anterior), **2** anteriores declarados; rv2: 45 sabotagens, **11 reais** (asserção faltando), **2 ruído** (equivalentes).
- **Paralelismo:** 0 galho de código em paralelo (T4 é tela, foi feita na mesma árvore). Em paralelo: a revisão do plano × a
  T1; os dois revisores da Fase 5 × a documentação. **Um EADDRINUSE** (o rv2 × a minha rodada do controle) — refeita.
- **Defeito que escapou:** *(preencher na Etapa 112.)*

## O que fica de fora (declarado)

- A Entrada manual sem documento de cliente e sem retenção de inspeção (**C219**).
- Reativar material em família inativa (**C220**); mudar o nível de família e criar subfamília sob raiz sendo inativada
  (**C221**); ligar lote/série/inspeção em material com saldo (**C222**) — **B726**.
- `parent_id = 0` raiz × subfamília (**C223**, nota).
- O canto da compensação quando o motor falha depois de gravar o livro (**D (110)**, B724).

## Próxima tarefa detalhada — Etapa 112

*(A 111 é da frente de Compras/core — as listas parciais de módulo, G17. A série desta etapa foi B721–B726, C219–C223,
A57–A58 — a 112 começa em **B727**, **C224**, **A59**; confira com `grep -oE` antes, porque a 111 pode escrever no
documento do almoxarifado.)*

**Como foi escolhida (mapa `specs/modulo-almoxarifado/README.md` e os C abertos, medidos em 2026-10-15):** as features 🟡
continuam 00, 01, 05, 06, 21, 22 e 23. Candidatos:

1. **C222 — ligar lote, série ou inspeção num material com saldo trava a saída** (feature 01 com a 10 e a 09). **Medido**
   (sonda `server/tests/sonda/e110c222.js`, não versionada): material nosso com saldo 5 cadastrado pelo Administrador; o
   Almoxarife **e a Engenharia** fazem `PUT /materiais/:id` com `controle_lote: 1` / `controle_serie: 1` /
   `requer_inspecao: 1` → **200** nos três; depois a `SAIDA` de 1 pela v2 → 400 *"O material Z1 exige lote nesta
   movimentacao (controle por lote ligado)"* / *"material com controle de serie: informe 1 serie(s) para 1 unidade(s) —
   recebidas 0"* — o saldo antigo fica preso (sem lote, sem séries). O **cliente** já é 403 (regra da 108). É o caminho de
   dois passos que contorna a RN-02 desta etapa.
2. **C219 — a Entrada manual sem documento de cliente e sem retenção de inspeção** (features 03, 09, 13). Muda a tela de
   Movimentações e uma decisão da Etapa 8 (o material de cliente entra pelo Recebimento) — é decisão de P.O. antes de
   código.
3. **C217** (inativar material de cliente com saldo o tira da posição), **C216** (dono inexistente pela API), **C209**
   (aviso da contagem abaixo do reservado), **C220/C221** (as outras escritas de família).

**Escolhida: a C222.** É integridade com consequência medida (a saída trava), fecha o contorno da regra desta etapa e mexe
só na edição de material.

**Tema: ligar um controle que o saldo não tem não deixa o saldo preso.**

**Fase 0 (medir antes de prometer):**
1. Reproduzir a sonda com os perfis que editam (Administrador, Almoxarife, Engenharia) e com retenções (reservado,
   bloqueado, em inspeção, em terceiros), e o caminho de volta (desligar o controle com lotes/séries já existentes).
2. Medir o que **já** existe para regularizar: `seriesService.regularizarSeries` (séries) e se existe algum caminho
   para dar lote ao saldo sem lote (não conferido nesta etapa)
   (`routes/almoxarifado/extended.js:1311`, Etapa 6b) — se o Administrador consegue, depois de ligar a série, cadastrar
   as séries do saldo antigo; se sim, a regra pode ser "liga, mas só quem pode regularizar" em vez de "recusa".
3. Consulta A59: materiais com `controle_lote = 1` e saldo sem lote (`estoque_saldo_almoxarifado.lote_id IS NULL` com
   quantidade > 0) e `controle_serie = 1` com séries presentes ≠ saldo (a régua já usada na conferência, `routes/almoxarifado.js:1819`).

**Contrato candidato (decisão — letra B, caminho reversível):**
- **(a)** `PUT /materiais/:id` que liga `controle_lote`/`controle_serie`/`requer_inspecao` (0 → 1, comparado com o
  gravado) num material com saldo ou retenção → 400 nomeando o controle e o caminho (*"zere o saldo ou regularize em
  Lotes"*), antes de gravar; desligar continua livre (medir se desligar série com séries presentes deixa lixo).
- **(b)** Permitir só ao Administrador (permissão nova ou `ajustar_estoque`) e mandar regularizar — mais flexível, mas
  depende da regularização existir para lote.
Decidir medindo; registrar o descartado.

**Pontos de atenção:** o `PUT` de material já tem duas condições no `UPDATE` (dono, Etapa 108; família, Etapa 110) — a
nova é **antes** de gravar, não precisa de condição de corrida se o saldo for lido no mesmo `UPDATE` (`AND quantidade_atual
= 0` quando liga — avaliar); a tela (`MaterialAlmoxarifadoForm.js`, seção Controles) mostra a recusa no toast (o T2 da 108
prova o caminho); o manual §2.7 (os controles).

**O que já está pronto e não precisa reabrir:** o Saldo Inicial pelo motor e as recusas dele (esta etapa); a corrida da
família (esta etapa); a guarda do dono (108).
