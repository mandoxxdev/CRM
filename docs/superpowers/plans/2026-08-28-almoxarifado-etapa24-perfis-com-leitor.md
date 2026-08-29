# Etapa 24 — A Qualidade ganha perfil, e a tela de perfis para de mentir (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

> **ESTE PLANO FOI REESCRITO PELA FASE 2.** A versão anterior mandava **criar** a tela
> `/almoxarifado/perfis`, porque o design afirmava que nenhum componente do client consumia as
> rotas de perfil. **A tela já existe** — é a aba "Perfis de Acesso" em
> `ConfiguracoesAlmoxarifado.js:2545`, está no menu, está no manual e já foi usada (7 linhas de
> auditoria no banco de desenvolvimento). Construir de novo criaria uma **segunda porta** para a
> mesma função. O escopo real é: o perfil que falta, mais **quatro defeitos do que já existe**.

**Goal:** a área de qualidade ganha um perfil que faz o ofício dela sem receber acesso largo; e
a tela que decide quem tem acesso ao módulo passa a deixar rastro do que revoga, a mostrar o
perfil novo com nome, a não oferecer um perfil que evapora sozinho, e a **ter teste** (hoje tem
zero).

**Architecture:** o contrato das rotas de perfil **não muda** (11 cenários verdes o congelam).
Mudam: `permissions.js` (perfil novo), `extended.js` (auditoria da remoção e `dados_anteriores`)
e a aba existente no client.

**Spec:** `docs/superpowers/specs/2026-08-28-almoxarifado-etapa24-perfis-com-leitor-design.md`

## Global Constraints

1. **Use `python3`, nunca `python`** (o alias não existe; heredoc com `python` vira no-op).
   Ou `sed` contando a âncora antes (`grep -cF` = exatamente 1), ou Edit.
2. **COMMITE ANTES DE SABOTAR** — três `git checkout` já apagaram correção não commitada aqui.
3. **Controle positivo com alvo, lendo QUAL asserção caiu.** Falhou **quatro** vezes nesta
   sessão: sabotagem que derruba o cenário certo pela asserção errada deixa sem prova o ponto que
   deveria guardar. `md5sum` antes/depois/restaurado, `git diff --stat` vazio.
4. **Vermelho por asserção, não por erro de setup.** E cuidado com **guarda de setup disparando
   antes da asserção de peso** — aconteceu duas vezes na Etapa 23.
5. **Nunca `git add -A`.** Commit em português, corpo sem acento, `git commit -F`.
6. Testes de API só em `server/tests/api/*.api.test.js` (runner próprio); harness
   `tests/helpers/testApp.js` com `requirePermission` **real**.
7. Cliente: `CI=true` faz warning virar erro. O fuso da suíte é fixado por
   `client/jest.globalSetup.js` — **não** volte a fixar `process.env.TZ` no topo do arquivo de
   teste achando que funciona (é no-op sob Jest; medido na Etapa 22).

## Regras de negócio

| RN | Enunciado | Onde é provada |
|---|---|---|
| RN-01 | Existe `QUALIDADE`, com `visualizar`/`inspecionar` e **nada além** (**`ver_alertas` saiu**: entrega 11 alertas, com `valor_parado`) | `permissoes` + rota real |
| RN-02 | O perfil novo aparece **com rótulo e descrição** (`PERFIS_INFO` no client) | teste da aba |
| RN-03 | Administrador não recebe perfil: a tela não oferece o seletor e o 409 é a rede | teste da aba (comportamento **já existente** — o teste é novo) |
| RN-04 | Voltar ao padrão é opção explícita (perfil vazio apaga a linha) | teste da aba + `perfisUsuario` |
| RN-05 | Mudar perfil aparece na trilha de auditoria | integração |
| RN-06 | **Revogar perfil deixa rastro, e a atribuição grava `dados_anteriores`** | `perfisUsuario` + integração |
| RN-07 | **`ADMINISTRADOR` sai do seletor** (escala por uma porta, evapora por outra) | teste da aba |

## Contratos congelados (JÁ EXISTEM — não invente, confira)

**C1 — `GET /api/almoxarifado/perfis-usuario`** (gate `configurar`, `extended.js:247`)

```json
{ "perfis": ["ADMINISTRADOR","ALMOXARIFE","COMPRAS","PRODUCAO","ENGENHARIA","GESTOR","CONSULTA"],
  "usuarios": [{ "id": 7, "nome": "…", "email": "…",
                 "perfil_explicito": null, "perfil_efetivo": "PRODUCAO", "origem": "padrao" }] }
```
`origem ∈ {'explicito','padrao','forcado'}`. Lista só usuários `ativo = 1` e não-ocultos.
**`perfis` vem de `PERFIS_VALIDOS`**, então `QUALIDADE` entra sozinho na lista quando a Task 1
rodar — e a aba existente **já** lê `data.perfis` em vez de hardcodar (verificado, `:2654`).
**Mas o RÓTULO é outra coisa:** `PERFIS_INFO` (`:2535`) é hardcodado, e sem a entrada nova o
perfil aparece como `QUALIDADE` cru e com `—` na descrição. Por isso a edição do client está na
Task 1, não na Task 3.
**`ADMINISTRADOR` vem nesta lista** e a RN-07 manda a tela **filtrá-lo** — ver a seção 5 do
design.

**C2 — `PUT /api/almoxarifado/perfis-usuario/:usuarioId`** (mesmo gate, `extended.js:273`)

`{ perfil }` → 200 `{ usuario_id, perfil_explicito, perfil_efetivo, origem }`.
- `perfil` vazio/`null` → **apaga a linha**, devolve `perfil_efetivo: 'PRODUCAO'`, `origem: 'padrao'`.
- usuário forçado → **409** com a literal:
  `'Este usuário já é administrador (superadmin, admin de sistema ou admin do módulo) e tem acesso total ao almoxarifado. Remova essa condição no cadastro de usuário antes de definir um perfil específico.'`
- perfil desconhecido → **400** `` `Perfil inválido. Use um de: ${PERFIS_VALIDOS.join(', ')}` ``.
- usuário inexistente → **404** `{ error: 'Usuário não encontrado' }` (`extended.js:279`),
  **que o contrato anterior omitia** (achado A8) — e é testado. Contrato incompleto é como o
  próximo agente inventa comportamento.

**Os 11 cenários de `tests/api/perfisUsuario.api.test.js` congelam isto e estão verdes.** Se
algum ficar vermelho, **você mudou contrato** — pare e relate, não conserte o teste.

---

### Task 1 (tronco): o perfil QUALIDADE, ponta a ponta — ✅ FEITA (`a81e51a`)

**Files:** Modify `server/services/almoxarifado/permissions.js` **e**
`client/src/components/almoxarifado/ConfiguracoesAlmoxarifado.js` (`PERFIS_INFO`, `:2535`);
Test — o arquivo que já cobre perfis (`grep -rln "ACAO_PERFIS" server/tests/`) + uma prova de rota.

**A edição de client é parte DESTA task** (achado A2): `PERFIS_INFO` é hardcodado, então sem ela
o perfil sai como `QUALIDADE` cru no seletor e `—` na coluna "O que isso permite". O design
anterior dizia que o perfil apareceria "sem tocar no front" — verdadeiro para a lista (que vem
do servidor), falso para o texto.

- [x] **Step 1: teste que falha.** RN-01, com as duas metades: `a81e51a`
  - **pode**: `inspecionar`, `visualizar`;
  - **NÃO pode**: `movimentar`, `ajustar_estoque`, `configurar`, `criar_material`,
    `editar_material`, `receber_material`, **`ver_alertas`**. Esta é a asserção que importa —
    perfil novo que herda demais é pior que perfil nenhum.
  - **Prova de ponta** (o harness roda `requirePermission` real): uma das quatro rotas de
    `inspecionar` com usuário `perfil_almoxarifado: 'QUALIDADE'` **não** pode dar 403 (a revisão
    mediu 404, ou seja, passa o gate e morre no "não encontrado"); e `POST /movimentacoes` com o
    mesmo usuário **tem** de dar 403.
- [x] **Step 2: implementar** (perfil em `PERFIS`, duas entradas de `ACAO_PERFIS`, entrada em
  `PERFIS_INFO` com rótulo "Qualidade" e descrição do que permite); verde. `a81e51a`
- [x] **Step 3: controle positivo** (commitar antes): acrescente `QUALIDADE` a `movimentar` → o
  cenário da asserção **negativa** cai nomeando `movimentar`. Se nada cair, a lista negativa não
  está sendo exercida — é achado.
  **Feito, duas vezes.** `movimentar` → o cenário negativo caiu com
  `QUALIDADE recebeu acao que NAO devia ter: movimentar`, e a prova de ponta caiu junto (201 em
  vez de 403). Repetido com **`ver_alertas`** — a permissão que a etapa exclui de propósito —, e
  caiu nomeando `ver_alertas`. `md5sum` 09f82107 antes e depois do restauro, `git diff --stat`
  vazio.
- [x] **Step 4: `npm run test:api`; commit.** 150/150 arquivos, `test:almoxarifado` 42/42,
  cliente 549/549 em 37 suítes e `CI=true build` limpo. Commit `a81e51a`.

---

### Task 2 (tronco): a revogação de perfil deixa rastro — ✅ FEITA (`9f7c309`)

**Files:** Modify `server/routes/almoxarifado/extended.js:273-315`;
Test `server/tests/api/perfisUsuario.api.test.js` (o que já existe, 11 cenários).

**O defeito** (achado A3, reproduzido): `:294-297` retorna **antes** do `registrarAuditoria` de
`:309` — apagar o perfil de alguém **não audita nada**. E o `registrarAuditoria` grava só
`dados_novos`, então a concessão aparece na tela de auditoria **sem o "de"**. É a mesma família
que a Etapa 23 fechou, na rota que decide quem tem acesso ao módulo.

- [x] **Step 1: teste que falha,** `9f7c309` — acrescentado ao arquivo existente: atribuir → 1 linha com
  `dados_anteriores` refletindo o perfil anterior (`null` na primeira vez); trocar de perfil →
  `dados_anteriores` traz o **anterior**; **remover** → **uma linha nova**, com `dados_novos`
  dizendo que o perfil saiu. **Asserção de peso: a CONTAGEM de linhas** — hoje remover deixa a
  contagem parada, e uma asserção sobre "a última linha" passaria com o bug.
  Os três cenários entraram no arquivo existente (11 → **14**), com a **contagem** como asserção
  de peso e o estado semeado com valor conhecido (usuário 106 novo, `DELETE` da trilha dele antes
  da guarda, para que a guarda de setup não seja o que derruba a asserção de peso).
- [x] **Step 2: implementar.** `9f7c309`. O `SELECT` do usuário ganhou o mesmo `LEFT JOIN` do
  `GET` (traz `perfil_explicito`), e os **dois** caminhos auditam: `ATUALIZAR` na atribuição/troca,
  **`EXCLUSAO`** na remoção (verbo que já está em `GRUPOS_ACAO`, então a revogação fica filtrável
  na tela como "Exclusão"). Pós-escrita, best-effort, `.catch()` mantido.
  **Decisão registrada:** os dois lados gravam a **mesma forma**
  (`{usuario, perfil, perfil_efetivo, origem}`, espelhando o corpo do C2), porque
  `auditLabels.alteracoesDaLinha` é **união de chaves** — chave presente só de um lado sairia na
  tela como `null -> valor` fingindo alteração. E a remoção audita **mesmo quando não havia perfil
  explícito**: registra-se o ATO, não o diff (omitir por "não mudou nada" é a família de defeito
  que a etapa fecha).
- [x] **Step 3: controle positivo**, commitado antes, **três** sabotagens com alvo: (a) auditoria
  do caminho de remoção desligada → caiu **só** o cenário da contagem, com
  `a remoção do perfil não gerou linha de auditoria: a trilha tinha 2 e continuou com 2`;
  (b) `dados_anteriores` fora da atribuição → caíram os dois cenários do "de"
  (`dados_anteriores ficou nulo…`); (c) `perfilAnterior` lido **depois** da escrita → caíram os
  três, nomeando o valor errado (`veio "GESTOR"` na troca). `md5sum` `47ea57ea` antes e depois do
  restauro, `git diff --stat` vazio.
- [x] **Step 4:** `test:api` **150/150 arquivos**, `test:almoxarifado` **42/42**, `perfisUsuario`
  **14/14** (os 11 congelados verdes — contrato HTTP intacto). Commit `9f7c309`.

---

### Task 3 (galho): a aba existente — `ADMINISTRADOR` fora do seletor, e o primeiro teste — ✅ FEITA (`b13de4a`)

**Files:** Modify `client/src/components/almoxarifado/ConfiguracoesAlmoxarifado.js`
(`TabPerfisAcesso`, `:2545-2680`); Create/Modify o teste da aba.

**CORREÇÃO DO PLANO — `ConfiguracoesAlmoxarifado.test.js` NÃO existe.** Este plano afirmava que
sim, e mandava "acrescentar sem quebrar". O que existe é
`client/src/components/almoxarifado/ConfiguracoesGerais.test.js`, que cobre a aba **"geral"** do
**mesmo** componente (renderiza `ConfiguracoesAlmoxarifado` com `?tab=geral`). Ou seja: a
convenção do diretório é **um arquivo de teste por aba**, com o nome da aba — não um arquivo com
o nome do componente. O teste novo seguiu essa convenção: **`PerfisAcesso.test.js`**. Um arquivo
chamado `ConfiguracoesAlmoxarifado.test.js` sugeriria cobrir o componente inteiro (dez abas) e
esconderia que `ConfiguracoesGerais.test.js` cobre o mesmo componente.

**Hoje a aba tem ZERO teste** (varredura da revisão: nenhum `.test.js` menciona
`TabPerfisAcesso` nem `perfis-usuario`). Os cenários abaixo cobrem comportamento que **já
funciona** — escrevê-los não é redundância, é a rede que não existe.

- [x] **Step 1: teste que falha** (contra o mock do C1/C2, fronteira HTTP): `b13de4a`.
  Sete cenários em `PerfisAcesso.test.js`; **um nasceu vermelho** (RN-07) e os outros seis são a
  rede que faltava. Cada cenário negativo carrega **a metade positiva no mesmo teste**:
  - as três origens aparecem, e a **origem** é visível, não só o perfil (o `explicito` vem com o
    select **posicionado** em GESTOR; o `padrao` vem vazio **e a opção vazia diz "padrão"** — sem
    essa palavra, "Produção" é indistinguível de escolha deliberada; o `forcado` mostra o estado);
  - `origem: 'forcado'` → **sem seletor**, com o motivo na linha (RN-03) — e o **mesmo teste**
    afirma que as outras duas origens **têm** seletor, senão "não há seletor" passaria com a
    tabela vazia;
  - escolher perfil → `PUT /almoxarifado/perfis-usuario/22` com `{ perfil: 'ALMOXARIFE' }` (o id
    da **linha**, não o do primeiro da lista);
  - "Produção (padrão)" → `PUT` com perfil **vazio**, e explicitamente **não** `'PRODUCAO'`
    (RN-04) — mandar `'PRODUCAO'` gravaria perfil explícito e a origem ficaria `explicito`;
  - 409 → a **literal do servidor** aparece (`toBe(MSG_409)`, e **não** a genérica
    'Erro ao alterar o perfil'), com `toast.success` **não** chamado;
  - **RN-07: `ADMINISTRADOR` não aparece entre as opções**, mesmo vindo em `data.perfis` (a
    fixture manda `PERFIS_VALIDOS` inteiro **de propósito**) — e o **mesmo teste** afirma que
    ALMOXARIFE, GESTOR, QUALIDADE, CONSULTA, ENGENHARIA e COMPRAS **estão** lá, senão a ausência
    passaria com um seletor vazio;
  - o rótulo de `QUALIDADE` aparece (RN-02) — `toBe('Qualidade')` e **não** `'QUALIDADE'`, que é
    o que liga esta task à Task 1.
- [x] **Step 2: implementar** `b13de4a`: `perfis.filter((p) => p !== 'PRODUCAO' && p !== 'ADMINISTRADOR')`
  mais um parágrafo na aba com o porquê visível ao usuário (administrador do módulo se define no
  **cadastro de usuário**; concedido aqui, seria apagado no próximo salvamento daquele cadastro).
  A aba **não** foi reescrita — está correta no resto, e reescrever criaria risco onde não há
  defeito.
- [x] **Step 3: controle positivo com alvo**, commitado antes, **três** sabotagens, lendo qual
  asserção caiu: (a) `ADMINISTRADOR` de volta ao seletor → caiu **só** a RN-07, nomeando a opção
  (`Received array: ["", "ADMINISTRADOR", …]`); (b) `forcado = false` → caiu a RN-03 no
  `expect(selectDe('fatima@ex.com')).toBeNull()`, **e junto** o cenário da origem visível
  (`Expected pattern: /Administrador/` — a linha forçada perdeu o badge, que é exatamente a
  origem deixando de ser visível: colateral correto, não ruído); (c) `PERFIS_INFO` sem a entrada
  `QUALIDADE` → caiu **só** a RN-02, com `Expected: "Qualidade" / Received: "QUALIDADE"`,
  provando que a Task 1 tem guarda no client. `md5sum` `604ea5d6` antes e depois dos três
  restauros, `git diff --stat` vazio.
- [x] **Step 4:** cliente **556/556 em 38 suítes** (eram 549/37 na Task 1 — as 7 novas) e
  `CI=true npx react-scripts build` **limpo**. Commit `b13de4a`.

---

### Task 4: integração e fechamento

- [ ] **Step 1:** atribuir **e depois revogar** um perfil pelas rotas reais e ler pela
  tela-contrato (`GET /auditoria?entidade=perfil_almoxarifado_usuario`), conferindo que **os
  dois** atos aparecem, com autor e com o de/para que a Task 2 passou a gravar (RN-05 + RN-06).
  **Guarda anti-teste-vazio:** afirme que a leitura trouxe ao menos o primeiro ato antes de
  afirmar qualquer coisa sobre o segundo. E **não** espere `total === N` sem antes ver o que mais
  aquele `entidade_id` acumula — o plano da Etapa 23 errou exatamente assim.
- [ ] **Step 2:** os cinco comandos da suíte + cliente com `TZ=UTC`, números **lidos**.
- [ ] **Step 3:** skill `fechar-etapa` inteira. Na spec 23, a perna **Perfis** perde itens — mas
  **o item 131 NÃO fica integralmente pago** (bloquear/liberar usa `ajustar_estoque`, que
  QUALIDADE não tem: dois dos três botões da tela de inspeções ficam barrados, e
  `POST /materiais/:id/bloquear` dá 403). Diga isso em vez de marcar `[x]`.
  Letra **B**: o fallback `PRODUCAO` (agora viável de apertar, com a tela existente); a central
  de alertas sem filtro por perfil (é o que destrava `ver_alertas` para QUALIDADE);
  `ajustar_estoque` para bloqueio de qualidade.
  Letra **C**: `ADMINISTRADOR` explícito é apagado por `syncModuleAdminProfiles` no próximo save
  do cadastro — quem já tiver esse perfil hoje deve ser conferido.

## Próxima tarefa detalhada

**A Fase 2 já rodou** (9 achados; o A1 derrubou a premissa da etapa e o plano foi reescrito por
causa dele). **A Task 1 está FEITA** (`a81e51a`): `QUALIDADE` existe em `PERFIS`, entra em
`visualizar` e `inspecionar`, tem rótulo e descrição em `PERFIS_INFO`, e está provado no gate
real (404 em `PUT /lotes/:id/status`, 403 em `POST /movimentacoes`).

**A Task 2 está FEITA** (`9f7c309`): o caminho "voltar ao padrão" audita (`EXCLUSAO`) e a
atribuição grava `dados_anteriores`. O contrato C2 **não mudou** — os 11 cenários congelados
seguem verdes, e o arquivo foi a 14.

**A Task 3 está FEITA** (`b13de4a`): `ADMINISTRADOR` saiu do seletor com a razão visível na aba
(RN-07), e a aba ganhou o primeiro teste — `client/src/components/almoxarifado/PerfisAcesso.test.js`,
**7 cenários**, mock em `api.get`/`api.put`. O componente **não** foi reescrito: mudaram duas
coisas, o `filter` do `<select>` e um parágrafo de explicação.

O próximo passo é a **Task 4** — integração e fechamento. O que ela pode assumir da Task 3:

- **a aba tem rede.** Mexer em `TabPerfisAcesso` sem rodar
  `CI=true npx react-scripts test src/components/almoxarifado/PerfisAcesso --watchAll=false`
  agora é escolha, não descuido. O arquivo guarda o formato do `PUT` (URL do usuário da linha,
  `{ perfil }`, **vazio** no voltar-ao-padrão) — se a Task 4 precisar mudar o contrato C2, **este
  arquivo cai junto** com `perfisUsuario.api.test.js`, e isso é o sinal, não o obstáculo;
- **a RN-02 tem guarda no client.** Provado por sabotagem: tirar `QUALIDADE` de `PERFIS_INFO`
  derruba o cenário do rótulo. A Task 1 não pode mais regredir em silêncio pelo lado da tela;
- **`ADMINISTRADOR` não é mais oferecido.** A letra **C** do fechamento continua valendo e fica
  *mais* importante, não menos: quem já tiver `perfil_almoxarifado = 'ADMINISTRADOR'` explícito
  no banco **continua com ele** — o filtro é da tela, não uma migração. Esse perfil segue sendo
  apagado por `syncModuleAdminProfiles` no próximo save daquele cadastro, e agora não há como
  reconceder pela tela (que é o ponto). Confira o banco do cliente antes de fechar.

Ponto de atenção que sobreviveu: o fuso da suíte do client é fixado por
`client/jest.globalSetup.js` — não refixe `process.env.TZ` no topo de um arquivo de teste.

O que a Task 2 acrescentou ao que a Task 3/4 pode assumir: cada `PUT` de perfil grava **uma**
linha em `auditoria_log_almoxarifado` (`entidade = 'perfil_almoxarifado_usuario'`,
`entidade_id = usuario_id`), com `acao` `ATUALIZAR` ou `EXCLUSAO` e os dois lados no formato
`{usuario, perfil, perfil_efetivo, origem}`. A Task 4 lê isso pelo
`GET /auditoria?entidade=perfil_almoxarifado_usuario` — **note que agora um par
atribuir+revogar rende DUAS linhas**, então não espere `total === 1`.

O que a Fase 2 **refutou** e não precisa ser reaberto: nenhuma das quatro rotas de `inspecionar`
faz checagem além do `requirePermission` (medido com usuário QUALIDADE real — as quatro devolvem
404, ou seja, passam o gate); o perfil não herda nada por comparação direta de string em lugar
nenhum do servidor; `adminOnly` do menu e `pode('configurar')` cobrem **o mesmo conjunto** de
usuários; os 11 cenários de `perfisUsuario` sobrevivem ao perfil novo (nenhum afirma a lista
inteira); e o volume não pede paginação (13 usuários ativos, e a aba já tem busca).

O que a Fase 2 **não** verificou e segue em aberto: a suíte completa; a aparência real no
navegador; e se o banco do cliente difere do de desenvolvimento nos números.
