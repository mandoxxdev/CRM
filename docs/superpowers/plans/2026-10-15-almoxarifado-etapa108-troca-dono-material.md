# Etapa 108 — trocar o dono de um material com histórico exige a permissão de ajustar material de cliente (C213)

> Status: **FECHADA — 2026-10-15.** Plano `68248e73`, T1 `cd7d5118`, T2 `3fe407d9`, T3 `bc415eb6`, Fase 5 `970c0dfb`, fechamento (docs) no
> commit seguinte. Worktree `CRM-wt-e108`, branch `etapa-e108` (de `main` `0bee2b04`). Sem merge e sem
> push (integração pelo André).
> Origem: "Próxima tarefa detalhada — Etapa 108" no fim de
> `docs/superpowers/plans/2026-10-15-almoxarifado-etapa106-estorno-ajuste-cliente.md`; C213.
> Design: `docs/superpowers/specs/2026-10-15-almoxarifado-etapa108-troca-dono-material-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-15): última B **B712**,
> último C **213**, última A **A55**, último G **G87**. Esta etapa: **B713+**, **C214+**, A56 se houver consulta.

## Fase 0 — medido (2026-10-15)

Sonda `server/tests/sonda/e108fase0.js` (não versionada); tabela no design. Resumo: Administrador, Almoxarife e
Engenharia trocam o dono nos três sentidos, com e sem saldo, e com qualquer retenção (18/18 → 200); a única auditoria é
`material`/`ATUALIZACAO`; a posição por cliente segue o dono de hoje (o histórico muda de cliente junto). Portas que gravam
o dono: só o POST (criação) e o PUT. Achados anteriores: C215 (Engenharia cria com saldo inicial), C216 (dono inexistente
aceito). B708 medida (o Gestor estorna a ENTRADA de cliente: 200).

## Regras de negócio

- **RN-01 — trocar o dono de material com histórico exige `ajustar_material_cliente`.** `PUT /materiais/:id` em que o dono
  **muda** (comparado com o gravado) e o material tem histórico (RN-04): sem a permissão → **403** literal **E1**, antes de
  qualquer escrita (dono, os outros campos do corpo, auditoria — nada muda). Os três sentidos: cliente → nosso, nosso →
  cliente, cliente A → cliente B. *Cenários:* Almoxarife e Engenharia → 403 nos três.
- **RN-02 — quem tem a permissão troca.** Administrador por perfil, superadmin e `role: 'admin'` → 200, o dono troca.
- **RN-03 — sem histórico, livre.** Material com total 0, retenções 0 e livro vazio: o Almoxarife troca o dono (200), sem
  `TROCA_DONO` (a `ATUALIZACAO` de sempre).
- **RN-04 — o que é histórico.** `quantidade_atual > 0`, ou `quantidade_reservada`/`quantidade_bloqueada`/
  `quantidade_em_inspecao`/`quantidade_em_terceiros` > 0, ou **qualquer** linha em `movimentacoes_almoxarifado` do material
  (inclusive cancelada). *Cenário:* total 0 com a entrada estornada → 403.
- **RN-05 — mesmo dono não aciona.** Chave omitida, mesmo número, mesmo número em string, `''`/`null` para material nosso:
  o Almoxarife edita o resto do cadastro de material de cliente com saldo (200), sem auditoria `material_cliente`.
- **RN-06 — a ordem.** 404 (material inexistente) antes; o 403 E1 antes das validações de família/subfamília/localização
  e antes do `UPDATE`. *Cenário:* corpo com família inválida e troca de dono pelo Almoxarife → 403 E1 (não 400).
- **RN-07 — a troca autorizada com histórico deixa auditoria nomeando os dois lados.** Depois do `UPDATE`, ao lado da
  `ATUALIZACAO`: `entidade 'material_cliente'`, `acao 'TROCA_DONO'`, `entidade_id` = material, `dados_anteriores
  {proprietario_cliente_id, proprietario_cliente_nome}` (o de antes; `null`/`null` para nosso), `dados_novos
  {proprietario_cliente_id, proprietario_cliente_nome, quantidade_atual}`, `justificativa` `null`. Falha ao gravar não
  derruba a troca (`try/catch`, aviso no log). Rótulo *"Troca de dono"* em `auditLabels.js`.
- **RN-08 — a tela mostra a recusa.** O salvar recusado com 403 mostra a literal E1 no `toast.error` e não navega.
- **RN-09 (Fase 5) — o salvar que leu o dono antes de uma troca não o grava de volta.** O `UPDATE` do PUT só grava se o dono
  gravado ainda é o lido (`proprietario_cliente_id IS ⟨lido⟩`); senão **409** *"O dono do material ⟨código⟩ mudou enquanto
  este cadastro era salvo — nada foi gravado. Recarregue o material e salve de novo."*, sem auditoria.

## Contrato congelado

`server/services/almoxarifado/ownerRules.js` exporta, além do que já exporta:

```js
// true se o material tem saldo, retencao ou qualquer linha no livro (RN-04)
async function materialTemHistorico(db, material) { ... }
// null se o dono nao muda; { deId, paraId, deNome, paraNome, comHistorico } se muda e pode;
// lanca 403 E1 se muda, tem historico e o usuario nao tem ajustar_material_cliente. Nao grava nada.
async function assertTrocaDeDonoPermitida(db, materialGravado, novoDono, user) { ... }
// a linha da RN-07; a rota a chama DEPOIS do UPDATE, so quando troca.comHistorico
async function auditarTrocaDeDono(db, { material, troca, quantidadeAtual, user }) { ... }
```

Normalização dos dois lados: `Number(v) > 0 ? Number(v) : null`.

**E1** (literal; sem acento, no molde das recusas de `ownerRules`; `${perfil}` = `getPerfilFromUser(user)`; cada lado é
`cliente ${nome}` — `razao_social` ou `cliente #<id>` — ou `estoque proprio (material nosso)`):

```
Trocar o dono do material ${codigo} (de ${de} para ${para}) exige a permissao "ajustar_material_cliente" (seu perfil: ${perfil}). O material ja tem saldo ou movimentacao, e a troca leva o saldo e o historico de um dono para o outro - mexe no numero que o cliente vai cobrar.
```

Rota `PUT /api/almoxarifado/materiais/:id` (gate `editar_material` inalterado): depois de montar `merged` e antes da
validação da família, `ownerRules.assertTrocaDeDonoPermitida(db, current, merged.proprietario_cliente_id, req.user)`;
erro → `res.status(e.status || 500).json({ error: e.message })`. Depois da auditoria `ATUALIZACAO`, se
`troca?.comHistorico`, `ownerRules.auditarTrocaDeDono` em `try/catch`. Resposta de sucesso inalterada.

Cliente: nenhuma mudança de código.

## Fase 2 — revisão do plano (agente fresco, 2026-10-15) — 0 trava, 2 correções, notas

O revisor leu o código e rodou a sonda `server/tests/sonda/e108rv-schema.js` (o `MaterialUpdateSchema`, a normalização e o
`can()`). A T1 estava sendo escrita em paralelo; ele revisou o plano.

1. **(correção) A E1 com cliente apagado.** `nomeDoCliente` já devolve *"cliente #⟨id⟩"* quando o cliente não existe; a E1
   sairia *"de cliente cliente #99999 para …"*. **Corrigido:** o lado é *"cliente #⟨id⟩"* sem repetir a palavra; teste novo
   (controle: o prefixo de volta derruba só ele). A auditoria `TROCA_DONO` grava o nome que `nomeDoCliente` devolve.
2. **(correção) O cenário da RN-06 precisa de família bem formada e inexistente** (`familia_id: 987654`): `abc` ou `0`
   caem no 400 do `validate` antes do handler (e antes do 404). O teste já usava um id bem formado — mantido; anotado aqui.
3. **(nota) O que o schema faz com o dono:** `` → chave ausente (preserva o dono); `null` → nosso; `5` → 5; `0`, `-1`,
   `abc`, `1.5` → 400. A guarda só recebe inteiro positivo, `null` ou `undefined` pela rota. Por isso a rota passa
   `req.body.proprietario_cliente_id` (já coerido) e não o `merged`: `undefined` = chave omitida, sem consultar nada
   (**divergência do contrato**, que dizia `merged`; o efeito é o mesmo).
4. **(nota) RN-02 sem o admin do módulo** — `can()` já o cobre; caso novo no teste (admin do módulo com perfil Almoxarife
   gravado troca).
5. **(nota) Portas:** só as duas da Fase 0 em todo o servidor (nenhum outro módulo nem script escreve em
   `materiais_almoxarifado`; o `DELETE /api/clientes/:id` só inativa o cliente).
6. **(nota) Compromisso pendente não conta como histórico** — material nosso sem saldo nem livro, com pedido de compra
   aberto: o Almoxarife passa o dono ao cliente e a compra que a GMP pagou entra na posição do cliente. Registrado na B714
   como descartado.
7. **(nota) Depois de uma troca autorizada**, remessa aberta continua nomeando o dono antigo e uma requisição reservada do
   projeto do dono antigo deixa de entregar (guarda do dono). Consequência da troca autorizada; a E1 avisa e a
   `TROCA_DONO` registra (C214).
8. **(nota) Uma entrada cancelada já trava a correção do dono para quem não é Administrador** (B714); e o retalho/
   transformação com destino de outro dono e histórico deixa de poder ser "corrigido" pelo Almoxarife no cadastro (sobra a
   outra saída da mensagem: escolher outro material). Guia.
9. **(nota)** T2 é galho de verdade e passa de primeira (o `toast.error` já existe) — o controle positivo é a prova.

## Tasks (sort topológico)

- [x] **T1 (tronco) — a guarda e a auditoria.** RN-01..RN-07. `ownerRules.js`, `routes/almoxarifado.js` (PUT),
  `auditLabels.js`. Teste novo `server/tests/api/trocaDonoMaterial.api.test.js`. Controle positivo: conceder
  `ajustar_material_cliente` ao ALMOXARIFE (cai nomeando a ação); tirar o livro do histórico; tirar uma retenção; comparar
  sem normalizar (RN-05 cai); guarda depois do UPDATE; sem a auditoria / sem o `try`.
- [x] **T2 (galho, contra o contrato) — a tela.** RN-08. Caso novo em `MaterialAlmoxarifadoForm.test.js`: `api.put` rejeita
  com 403 `{ error: E1 }` → `toast.error(E1)`, sem navegar. Controle: trocar a mensagem pelo fallback.
- [x] **T3 (integração, depois de T1–T2) — o documento até o fim, pela rota E pelo serviço.**
  `server/tests/api/trocaDonoMaterialIntegracao.api.test.js`: (K1) pela rota — o furo da C213 fechado: material do cliente
  A com entrada 10; o Almoxarife ajusta → 403 (Etapa 8); tira o dono → 403 E1; edita o nome reenviando o dono → 200; o
  ajuste continua 403; o Administrador passa A → B → 200 com `TROCA_DONO`; a posição de B mostra o material com `recebido`
  10 e a de A não. (K2) pelo serviço — `ownerRules.assertTrocaDeDonoPermitida` com o Almoxarife → 403 E1, com o
  Administrador → objeto. (K3) material recém-criado sem saldo: o Almoxarife corrige o dono (200).
- [x] **T4 — Fase 5 e fechamento.** — ver abaixo.

## Execução (2026-10-15)

- **Plano** `68248e73` (design, plano, Fase 2 — a seção da Fase 2 entrou no fechamento).
- **T1** `cd7d5118` — `ownerRules.materialTemHistorico`, `assertTrocaDeDonoPermitida`, `auditarTrocaDeDono`; a chamada no PUT
  depois do 404 e antes da validação da família; a auditoria depois da `ATUALIZACAO`; rótulo *"Troca de dono"*. Teste novo
  `trocaDonoMaterial` (**24**; 16 vermelhos antes da implementação na primeira versão de 22 casos; os 2 da Fase 2 — admin do
  módulo e cliente apagado — entraram depois). **Controle:** 11 sabotagens, todas vermelhas na asserção certa — conceder ao
  ALMOXARIFE (11 casos), sem o livro (2), sem a bloqueada (1), sem normalizar (o caso de serviço com string), sem o critério
  de histórico (RN-03), a recusa que não interrompe (13), sem a auditoria, a auditoria lançando dentro do `try`, sem o nome
  de antes (RN-07), sem o `try` (o processo do teste cai com a rejeição não tratada), o prefixo duplo do cliente apagado.
  **Uma sabotagem foi no-op na primeira tentativa** (âncora com indentação errada): o md5 igual ao da cópia denunciou;
  refeita. **Divergência:** a rota passa `req.body.proprietario_cliente_id` (já coerido pelo schema), não o `merged` — Fase 2,
  nota 3.
- **T2** `3fe407d9` — 1 caso novo em `MaterialAlmoxarifadoForm.test.js` (43). **Controle:** a mensagem trocada pelo fallback
  derruba este caso.
- **T3** `bc415eb6` — `trocaDonoMaterialIntegracao` (K1–K3). **Controle:** sem a chamada na rota cai K1; com a guarda
  desligada caem K1 e K2.

## Fase 4 — integração serial (2026-10-15)

Sem worktree de galho (T2 é só teste). Suíte na árvore com T1–T3 (antes dos commits): `test:api` **360/360** arquivos
(EXIT 0); `test:almoxarifado` **44/44**; `test:validation` **4/4**; `test:safealter` **3/3**; `test:sqlite` **10/10**;
cliente jest **102 suítes / 1554 testes**; `CI=true react-scripts build` EXIT 0.

## Fase 5 — revisão adversarial do código (2026-10-15) — 1 defeito real (corrida), 2 asserções faltando, 1 frase do manual

Dois revisores frescos em worktrees próprias (`CRM-wt-e108rv1`, `CRM-wt-e108rv2`, HEAD `bc415eb6`, junção; removidas).

- **Revisor 1 (RN, perfil, último gesto)** — sondas `e108rv1-matriz/depois/inativo`. Passou: oito perfis × três sentidos
  (admin do módulo com `admin_modulos` em string JSON e perfil Almoxarife gravado → 200; Gestor e sem perfil → 403 do gate);
  formatos (`"1"`, ``, omitido, `1.0`, `" 1 "` = mesmo dono; `null`, `99999`, `"2"` → 403 e nada gravado; `0`, `true`,
  `[1]`, `"abc"` → 400 do schema); material inativo com livro só cancelado → 403; saldo `0.0001` → 403; corpo misto
  → 403 sem gravar; nenhuma outra porta grava o dono. **Achados:** (1) **real — corrida:** um PUT do Almoxarife sem a chave do
  dono, parado entre a leitura e o `UPDATE`, regravava o dono antigo depois de o Administrador trocar A → B (200 nos dois;
  `TROCA_DONO` dizendo B, cadastro dizendo A). O inverso da corrida declarada no design (item 7), que não a cobria.
  **Corrigido:** o `UPDATE` grava só `WHERE proprietario_cliente_id IS ⟨lido⟩`; senão **409** literal *"O dono do material
  ⟨código⟩ mudou enquanto este cadastro era salvo — nada foi gravado. Recarregue o material e salve de novo."* (RN-09, B720),
  com teste que reproduz a pausa (controle: sem a condição cai na asserção do 409). (2) **frase do manual meio certa:** a
  requisição só deixa de sair quando o material passa a outro cliente (ou de nosso para cliente); passar para nosso não trava;
  a remessa aberta pode ficar com itens de dois donos — **reescrita** no manual, na C214 e no guia. (3) **anterior:** inativar
  material de cliente com saldo o tira da posição do cliente (**C217**). Ruído: `quantidade_atual` negativa com livro vazio
  (o motor não produz).
- **Revisor 2 ("o teste passaria com a feature quebrada?") — 30 sabotagens: 25 vermelhas, 5 verdes.** Equivalentes ou
  inalcançáveis pela rota: s13 (perfil lido de `perfil_almoxarifado`), s17 (saldo relido = lido; o PUT não mexe em saldo),
  s23 (`merged` em vez do corpo). **Falta de asserção no contrato direto:** s02 (``/`0` como "nosso") e s27 (sem histórico
  devolver `comHistorico: false`) — **asserções novas** no caso de serviço (controle: as duas sabotagens derrubam).
  `test:api` na árvore do revisor: 360/360.

## Retro de 4 números

- **Rodadas de correção até verde:** 2 — a da Fase 2 (o prefixo do cliente apagado, antes da suíte) e a da Fase 5 (a corrida e
  as duas asserções). A suíte inteira passou de primeira nas duas vezes. Nenhum teste vermelho em duas rodadas seguidas.
- **Achados de revisão:** Fase 2 — 2 correções **reais** (1 de código, 1 de cenário já certo) + 7 notas. Fase 5 — rv1: **1 real**
  de código (corrida), **1 real** de documento, **1** anterior (C217), 1 ruído; rv2: 30 sabotagens, **2 reais** (s02, s27),
  **3 ruído** (equivalentes/inalcançáveis).
- **Paralelismo:** 0 galho de código em paralelo. Em paralelo: a revisão do plano × a T1; os dois revisores da Fase 5 × a
  documentação. Nenhum EADDRINUSE.
- **Defeito que escapou:** *(preencher na Etapa 110.)*

## O que fica de fora (declarado)

- Compromisso pendente (pedido de compra, requisição) como histórico (B714).
- Motivo escrito da troca (B716); travar o seletor na tela (B717).
- Os estornos de entrada e outros de material de cliente pelo Gestor (B708, medido de novo — B718).
- C215 (Saldo Inicial do cadastro fora do motor — a próxima), C216 (dono inexistente pela API), C217 (inativar material de
  cliente com saldo o tira da posição).
- O atropelo dos **outros** campos do cadastro por dois salvares simultâneos (comportamento de sempre; só o dono ganhou a
  condição — B720).

## Próxima tarefa detalhada — Etapa 110

*(A 109 é da frente de Compras. A série desta etapa foi B713–B720, C214–C217, A56 — a 110 começa em **B721**, **C218**,
**A57**, **G88**; confira com `grep -oE` antes, porque a 109 pode escrever no documento do almoxarifado.)*

**Como foi escolhida (mapa `specs/modulo-almoxarifado/README.md`, medido em 2026-10-15):** as features 🟡 são 00, 01, 05,
06, 21, 22 e 23; a 13 é 🟢. Candidatos medidos:

1. **C215 — o Saldo Inicial do cadastro entra fora do motor de estoque** (features 01, 03, 13, 23). **Medido** (sonda
   `server/tests/sonda/e108c215.js`, não versionada): `POST /api/almoxarifado/materiais` com `quantidade_atual` > 0 →
   **201** e `materialService.createMaterial` (`:285`–`:290`) faz `INSERT INTO movimentacoes_almoxarifado (…'ENTRADA'…,
   'Saldo inicial de cadastro')` direto, sem `registrarMovimentacao`: (a) a **Engenharia** (`criar_material`, **sem**
   `movimentar`) cria com saldo 5 — nosso e de cliente; (b) material **de cliente** entra sem `documento_vinculado` (a
   Entrada da tela exige documento para material de cliente — Etapa 8); (c) `controle_lote: 1` → saldo 5 e **0** lotes;
   (d) `controle_serie: 1` → saldo 3 e nenhuma série; (e) `requer_inspecao: 1` → saldo 4 **disponível** (`em_inspecao` 0);
   (f) sem localização padrão → linha de saldo com `localizacao_id NULL`; (g) 2.5 em `PC` aceito. A linha do livro não tem
   `localizacao_destino_id` nem a origem da requisição (ip/user_agent, Etapa 25).
2. **C209 — a contagem abaixo do reservado não avisa** (feature 05; desenho no plano da 104). Aviso (B711).
3. **C216 — dono inexistente aceito pela API** — barato, mas a tela não alcança.

**Escolhida: a C215.** É autorização (um perfil sem `movimentar` põe saldo) **e** integridade (lote, série, inspeção e
documento do cliente pulados); a C209 é aviso.

**Tema: o Saldo Inicial do cadastro passa pelas regras da Entrada.**

**Fase 0 (medir antes de prometer):**
1. Reproduzir a sonda pela rota com Administrador, Almoxarife e Engenharia; conferir o que o formulário manda
   (`MaterialAlmoxarifadoForm.js:833`, campo *Saldo Inicial*, `disabled` na edição) e se alguma outra porta cria material
   com saldo (Remessas e Sobras criam o material de destino pelo `POST` — `RemessasTerceirosAlmoxarifado.js:318`,
   `SobrasAlmoxarifado.js:322` — e **não** mandam `quantidade_atual`, medido por `grep` nesta etapa; reconfirmar).
2. Medir quantos materiais em produção nasceram assim (consulta A57: `movimentacoes_almoxarifado` com `motivo = 'Saldo
   inicial de cadastro'`, por perfil de hoje de quem criou, por `controle_lote`/`controle_serie`/`requer_inspecao`/dono).
3. Ler `stockService.registrarMovimentacao` para ENTRADA: o que ela exige (documento de cliente, lote para `controle_lote`,
   série, localização, quarentena por `requer_inspecao`) e se dá para chamá-la de dentro de `createMaterial` depois do
   `INSERT` (a trava por material, a auditoria, a origem).

**Contrato candidato (decisão — letra B, caminho reversível):** duas opções a medir.
- **(a)** O saldo inicial passa a exigir `movimentar` e vira `registrarMovimentacao(ENTRADA)` real, com as mesmas recusas
  da Entrada; material com lote/série/inspeção/cliente → recusar o saldo inicial (*"Cadastre com saldo 0 e lance a Entrada
  em Movimentações: …"*) em vez de montar lote/série no cadastro.
- **(b)** Remover o saldo inicial do cadastro (o campo some; `quantidade_atual` no `POST` → 400 ou ignorado) — mais simples,
  muda a tela (o campo existe desde a Etapa 2).
Decidir medindo; registrar o descartado. Em qualquer uma: material **sem** controle, nosso, por quem movimenta, continua
nascendo com saldo se a medição mostrar que o cadastro em lote depende disso (importação inicial).

**Pontos de atenção:** o `POST` é usado por Remessas/Sobras para criar o material de destino (sem saldo hoje); o
teste da tela `MaterialAlmoxarifadoForm.test.js` (campo *Saldo Inicial*); o manual §2 (cadastro) e §6 (Entrada); a
sincronização `syncSaldoLocalizacaoPadrao` que hoje cria a linha de saldo sem localização; não mexer na barra de abas
(Compras/`ui/Tabs`).

**O que já está pronto e não precisa reabrir:** a guarda do dono na troca (esta etapa), a do ajuste (Etapa 8) e a do
estorno (Etapa 106); o gate `criar_material`; a auditoria `CRIACAO` do material.
