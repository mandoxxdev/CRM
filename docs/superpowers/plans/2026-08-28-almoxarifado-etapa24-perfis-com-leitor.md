# Etapa 24 — Perfis com leitor, e a Qualidade com perfil (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** quem administra o módulo passa a atribuir perfil pela interface (hoje só por `curl` ou
banco), e a área de qualidade ganha um perfil que faz o ofício dela sem receber acesso largo.

**Architecture:** o contrato de API **já existe e não muda** — a etapa acrescenta um perfil em
`permissions.js` e a tela que consome as duas rotas prontas.

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
| RN-01 | Existe `QUALIDADE`, com `visualizar`/`inspecionar`/`ver_alertas` e **nada além** | `permissoes` + rota real |
| RN-02 | A tela mostra perfil efetivo e **a origem** (`explicito`/`padrao`/`forcado`) | `AlmoxarifadoPerfis.test.js` |
| RN-03 | Administrador não recebe perfil: a tela não oferece o seletor e o 409 é a rede | tela + `perfisUsuario` |
| RN-04 | Voltar ao padrão é opção explícita (perfil vazio apaga a linha) | tela + `perfisUsuario` |
| RN-05 | Mudar perfil aparece na trilha de auditoria | integração |

## Contratos congelados (JÁ EXISTEM — não invente, confira)

**C1 — `GET /api/almoxarifado/perfis-usuario`** (gate `configurar`, `extended.js:247`)

```json
{ "perfis": ["ADMINISTRADOR","ALMOXARIFE","COMPRAS","PRODUCAO","ENGENHARIA","GESTOR","CONSULTA"],
  "usuarios": [{ "id": 7, "nome": "…", "email": "…",
                 "perfil_explicito": null, "perfil_efetivo": "PRODUCAO", "origem": "padrao" }] }
```
`origem ∈ {'explicito','padrao','forcado'}`. Lista só usuários `ativo = 1` e não-ocultos.
**`perfis` vem de `PERFIS_VALIDOS`**, então `QUALIDADE` entra sozinho quando a Task 1 rodar —
**a tela não pode hardcodar a lista** (se hardcodar, o perfil novo não aparece e o teste da
Task 2 não pega, porque o mock também estaria errado).

**C2 — `PUT /api/almoxarifado/perfis-usuario/:usuarioId`** (mesmo gate, `extended.js:273`)

`{ perfil }` → 200 `{ usuario_id, perfil_explicito, perfil_efetivo, origem }`.
- `perfil` vazio/`null` → **apaga a linha**, devolve `perfil_efetivo: 'PRODUCAO'`, `origem: 'padrao'`.
- usuário forçado → **409** com a literal:
  `'Este usuário já é administrador (superadmin, admin de sistema ou admin do módulo) e tem acesso total ao almoxarifado. Remova essa condição no cadastro de usuário antes de definir um perfil específico.'`
- perfil desconhecido → **400** `` `Perfil inválido. Use um de: ${PERFIS_VALIDOS.join(', ')}` ``.

**Os 11 cenários de `tests/api/perfisUsuario.api.test.js` congelam isto e estão verdes.** Se
algum ficar vermelho, **você mudou contrato** — pare e relate, não conserte o teste.

---

### Task 1 (tronco): o perfil QUALIDADE

**Files:** Modify `server/services/almoxarifado/permissions.js`; Test — acrescente ao arquivo
que já cobre perfis (**procure**: `grep -rln "ACAO_PERFIS\|getPerfilFromUser" server/tests/`) e,
para a prova de ponta, um cenário de rota.

- [ ] **Step 1: teste que falha.** RN-01, com as duas metades:
  - **pode**: `inspecionar`, `visualizar`, `ver_alertas`;
  - **NÃO pode**: `movimentar`, `ajustar_estoque`, `configurar`, `criar_material`,
    `editar_material`, `receber_material`. **Esta é a asserção que importa** — perfil novo que
    herda demais é pior que perfil nenhum, e a lista positiva sozinha não pega isso.
  - **Prova de ponta:** uma das quatro rotas de `inspecionar` chamada com usuário
    `perfil_almoxarifado: 'QUALIDADE'` pelo harness (que roda `requirePermission` real) → **não**
    pode ser 403. E uma rota de `movimentar` com o mesmo usuário → **403**. Sem isso o perfil
    está provado só na tabela, não no gate.
- [ ] **Step 2: implementar** (o perfil em `PERFIS` e em três entradas de `ACAO_PERFIS`); verde.
- [ ] **Step 3: controle positivo** (commitar antes): acrescente `QUALIDADE` a `movimentar` → o
  cenário da asserção **negativa** tem de cair nomeando `movimentar`. Se nada cair, a lista
  negativa não está sendo exercida — é achado.
- [ ] **Step 4: `npm run test:api`; commit.**

---

### Task 2 (galho): a tela `/almoxarifado/perfis`

**Files:** Create `client/src/components/almoxarifado/AlmoxarifadoPerfis.js` e
`AlmoxarifadoPerfis.test.js`; Modify `client/src/routes/lazyModules.js`, `client/src/App.js`,
`client/src/components/Layout.js`.

**Interfaces:** consome C1 e C2 (mock de JSON na fronteira HTTP). Molde:
`AuditoriaAlmoxarifado.js` (Etapa 22) para estrutura, estados de erro e gate visual.

- [ ] **Step 1: teste que falha:**
  - lista com as **três** origens, e a origem é visível (não só o perfil);
  - `origem: 'forcado'` → **sem seletor**, com o motivo na linha;
  - escolher um perfil → `PUT` com `{ perfil: 'X' }` na URL do usuário certo;
  - escolher "Padrão (Produção)" → `PUT` com perfil **vazio** (RN-04);
  - 409 → a **mensagem do servidor** aparece na tela (não uma genérica);
  - a lista de perfis do seletor vem de `data.perfis`, **não** de constante do front — sabote o
    mock trocando `perfis` e o teste tem de acompanhar.
- [ ] **Step 2: implementar.** Gate visual por `useAlmoxPermissoes` (`configurar`), painel de
  sem-permissão como nas telas irmãs; o gate real é o backend.
- [ ] **Step 3:** rota lazy + `<Route path="perfis">` + item de menu **`adminOnly`**.
- [ ] **Step 4: controle positivo com alvo:** faça o seletor aparecer também para `forcado` → o
  cenário da RN-03 tem de cair. `CI=true` test e build; commit.

---

### Task 3: integração e fechamento

- [ ] **Step 1:** mudar o perfil de um usuário pela rota real e **ler pela tela-contrato**
  (`GET /api/almoxarifado/auditoria?entidade=perfil_almoxarifado_usuario`), conferindo que o ato
  aparece com autor e de/para (RN-05). **Guarda anti-teste-vazio:** afirme que a leitura trouxe
  ao menos esse ato antes de afirmar qualquer coisa sobre o conteúdo.
  **Atenção:** a auditoria dessa rota grava só `dados_novos` (`{ usuario, perfil }`) — confira no
  código antes de escrever a expectativa, e **não** espere `total === 1` sem antes ver o que mais
  aquele `entidade_id` acumula (na Etapa 23 o plano errou exatamente assim, ignorando que a
  criação também audita).
- [ ] **Step 2:** os cinco comandos da suíte + o cliente com `TZ=UTC`, números **lidos**.
- [ ] **Step 3:** skill `fechar-etapa` inteira. Na spec 23, a perna **Perfis** perde 2 dos 5
  itens; diga o que sobra e se a cor muda. O **fallback `PRODUCAO`** vai para a letra B com a
  medição e com a observação de que a tela agora torna viável apertá-lo.

## Próxima tarefa detalhada

Se parar aqui: **Fase 2** — agente fresco com plano + design e três perguntas (contratos cobrem
erro e mensagem literal? as RN batem com o código? a Task 2 é galho de verdade?). Peça atenção
especial a: o `ver_alertas` para QUALIDADE é mesmo necessário (ou o registro de alertas já filtra
por outra régua?); e se alguma das quatro rotas de `inspecionar` faz **outra** checagem além do
`requirePermission` que barraria QUALIDADE assim mesmo — se fizer, a RN-01 está incompleta.
