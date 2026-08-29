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

### Task 1 (tronco): o perfil QUALIDADE, ponta a ponta

**Files:** Modify `server/services/almoxarifado/permissions.js` **e**
`client/src/components/almoxarifado/ConfiguracoesAlmoxarifado.js` (`PERFIS_INFO`, `:2535`);
Test — o arquivo que já cobre perfis (`grep -rln "ACAO_PERFIS" server/tests/`) + uma prova de rota.

**A edição de client é parte DESTA task** (achado A2): `PERFIS_INFO` é hardcodado, então sem ela
o perfil sai como `QUALIDADE` cru no seletor e `—` na coluna "O que isso permite". O design
anterior dizia que o perfil apareceria "sem tocar no front" — verdadeiro para a lista (que vem
do servidor), falso para o texto.

- [ ] **Step 1: teste que falha.** RN-01, com as duas metades:
  - **pode**: `inspecionar`, `visualizar`;
  - **NÃO pode**: `movimentar`, `ajustar_estoque`, `configurar`, `criar_material`,
    `editar_material`, `receber_material`, **`ver_alertas`**. Esta é a asserção que importa —
    perfil novo que herda demais é pior que perfil nenhum.
  - **Prova de ponta** (o harness roda `requirePermission` real): uma das quatro rotas de
    `inspecionar` com usuário `perfil_almoxarifado: 'QUALIDADE'` **não** pode dar 403 (a revisão
    mediu 404, ou seja, passa o gate e morre no "não encontrado"); e `POST /movimentacoes` com o
    mesmo usuário **tem** de dar 403.
- [ ] **Step 2: implementar** (perfil em `PERFIS`, duas entradas de `ACAO_PERFIS`, entrada em
  `PERFIS_INFO` com rótulo "Qualidade" e descrição do que permite); verde.
- [ ] **Step 3: controle positivo** (commitar antes): acrescente `QUALIDADE` a `movimentar` → o
  cenário da asserção **negativa** cai nomeando `movimentar`. Se nada cair, a lista negativa não
  está sendo exercida — é achado.
- [ ] **Step 4: `npm run test:api`; commit.**

---

### Task 2 (tronco): a revogação de perfil deixa rastro

**Files:** Modify `server/routes/almoxarifado/extended.js:273-315`;
Test `server/tests/api/perfisUsuario.api.test.js` (o que já existe, 11 cenários).

**O defeito** (achado A3, reproduzido): `:294-297` retorna **antes** do `registrarAuditoria` de
`:309` — apagar o perfil de alguém **não audita nada**. E o `registrarAuditoria` grava só
`dados_novos`, então a concessão aparece na tela de auditoria **sem o "de"**. É a mesma família
que a Etapa 23 fechou, na rota que decide quem tem acesso ao módulo.

- [ ] **Step 1: teste que falha,** acrescentado ao arquivo existente: atribuir → 1 linha com
  `dados_anteriores` refletindo o perfil anterior (`null` na primeira vez); trocar de perfil →
  `dados_anteriores` traz o **anterior**; **remover** → **uma linha nova**, com `dados_novos`
  dizendo que o perfil saiu. **Asserção de peso: a CONTAGEM de linhas** — hoje remover deixa a
  contagem parada, e uma asserção sobre "a última linha" passaria com o bug.
- [ ] **Step 2: implementar.** Ler o perfil anterior **antes** de escrever (a rota já faz
  `SELECT` do usuário; o `perfil_explicito` precisa vir junto), e auditar nos **dois** caminhos.
  Mantenha o padrão do módulo: pós-escrita, best-effort, `.catch()` que não derruba a resposta.
- [ ] **Step 3: controle positivo** (commitar antes): remova a auditoria do caminho de remoção →
  o cenário da contagem cai **dizendo que a remoção não gerou linha**.
- [ ] **Step 4: `npm run test:api`; commit.**

---

### Task 3 (galho): a aba existente — `ADMINISTRADOR` fora do seletor, e o primeiro teste

**Files:** Modify `client/src/components/almoxarifado/ConfiguracoesAlmoxarifado.js`
(`TabPerfisAcesso`, `:2545-2680`); Create/Modify o teste da aba
(`ConfiguracoesAlmoxarifado.test.js` já existe — **confira** antes se cobre outra aba, e
acrescente sem quebrar o que houver).

**Hoje a aba tem ZERO teste** (varredura da revisão: nenhum `.test.js` menciona
`TabPerfisAcesso` nem `perfis-usuario`). Os cenários abaixo cobrem comportamento que **já
funciona** — escrevê-los não é redundância, é a rede que não existe.

- [ ] **Step 1: teste que falha** (contra o mock do C1/C2, fronteira HTTP):
  - as três origens aparecem, e a **origem** é visível, não só o perfil;
  - `origem: 'forcado'` → **sem seletor**, com o motivo na linha (RN-03);
  - escolher perfil → `PUT` com `{ perfil }` na URL do usuário certo;
  - "Produção (padrão)" → `PUT` com perfil **vazio** (RN-04);
  - 409 → a **mensagem do servidor** aparece (não uma genérica);
  - **RN-07: `ADMINISTRADOR` NÃO aparece entre as opções**, mesmo vindo em `data.perfis`;
  - o rótulo de `QUALIDADE` aparece (RN-02) — liga esta task à Task 1.
- [ ] **Step 2: implementar** só o que falta: filtrar `ADMINISTRADOR` do seletor, com o porquê
  visível ao usuário (administrador do módulo se define no cadastro de usuário). **Não reescreva
  a aba** — ela está correta no resto.
- [ ] **Step 3: controle positivo com alvo:** deixe `ADMINISTRADOR` voltar ao seletor → cai o
  cenário da RN-07 nomeando a opção. E faça o seletor aparecer para `forcado` → cai o da RN-03.
- [ ] **Step 4:** `CI=true` test e build (o fuso é fixado por `client/jest.globalSetup.js`);
  commit.

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
causa dele). O próximo passo é executar a **Task 1**.

O que a Fase 2 **refutou** e não precisa ser reaberto: nenhuma das quatro rotas de `inspecionar`
faz checagem além do `requirePermission` (medido com usuário QUALIDADE real — as quatro devolvem
404, ou seja, passam o gate); o perfil não herda nada por comparação direta de string em lugar
nenhum do servidor; `adminOnly` do menu e `pode('configurar')` cobrem **o mesmo conjunto** de
usuários; os 11 cenários de `perfisUsuario` sobrevivem ao perfil novo (nenhum afirma a lista
inteira); e o volume não pede paginação (13 usuários ativos, e a aba já tem busca).

O que a Fase 2 **não** verificou e segue em aberto: a suíte completa; a aparência real no
navegador; e se o banco do cliente difere do de desenvolvimento nos números.
