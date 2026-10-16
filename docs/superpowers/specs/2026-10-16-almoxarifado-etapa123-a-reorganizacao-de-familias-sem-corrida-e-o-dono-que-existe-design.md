# Almoxarifado — Etapa 123: a reorganização de famílias sem corrida, e o dono que existe (design)

> Origem: "Próxima tarefa detalhada — Etapa 123" do plano da 122 (**C221**, **C216**, e a **C223** se coubesse — coube).
> Worktree `CRM-wt-e123`, branch `etapa-e123` (a partir da main `7279adb2`). Numeração conferida com `grep -oE` em
> `docs/almoxarifado-novidades-por-etapa.md` (2026-10-16): última B **B792**, último C **C257**, última A **A71** → esta etapa
> **B793+**, **C258+**, **A72+**.

## Fase 0 — medido (sonda `server/tests/sonda/e123fase0.js`, não versionada)

Janela injetada (molde `familiaMaterialCorrida.api.test.js`, da C218): o teste embrulha `db.get` e, logo depois da
conferência citada, faz a escrita do outro lado direto no banco.

| # | Porta (contrato) | Janela | Hoje (medido) |
|---|---|---|---|
| S1 | `POST /familias` com `parent_id` (criar subfamília) | depois de `validateParentFamilia`, a raiz é inativada | **201**, subfamília **ativa sob raiz inativa** |
| S2 | `PUT /familias/:id` `{ativo: 1}` (reativar subfamília) | depois da leitura do pai (`conferirReativacao`), a raiz é inativada | **200**, subfamília ativa sob raiz inativa |
| S3 | `PUT /familias/:id` `{parent_id: R2}` (raiz vira subfamília) | depois da contagem de materiais, um material é cadastrado nela | **200**, a família virou subfamília **com material gravado como raiz** (`familia_id` = a sub) |
| S4 | `PUT` de subfamília `{parent_id: R2}` (muda de raiz) | idem, material com o par (R1, S) | **200**, material com par **R1/S** enquanto S está sob R2 |
| S5 | `PUT` raiz vira subfamília | depois da contagem de subfamílias **ativas**, nasce uma subfamília nela | **200**, **três níveis** |
| S5b | idem | depois da contagem das **inativas** | **200**, três níveis |
| S6 | `PUT` de subfamília para a raiz R2 | depois de `validateParentFamilia`, R2 é inativada | **200**, subfamília ativa sob raiz inativa |
| S7 | idem | depois de `validateParentFamilia`, R2 vira subfamília de R3 | **200**, três níveis |

Corrida real pela rota (30 rodadas, as duas requisições disparadas juntas, nas duas ordens): **criar subfamília × "Inativar" a
raiz** 18/30 e 22/30 com subfamília ativa sob raiz inativa; **reativar subfamília × "Inativar" a raiz** 9/30 e 3/30.

**A C221 estava certa e incompleta:** ela nomeava "mudar o nível (… material)" e "criar/reativar subfamília (… raiz ativa)". As
janelas S5/S5b/S7 (o terceiro nível) e S6 (mudar para uma raiz sendo inativada) são a mesma forma e não estavam escritas.

**C216 (medido):** `POST /materiais` com `proprietario_cliente_id: 99999` → **201**, gravado 99999; `PUT` com 88888 → **200**,
gravado. `clientes` não tem `DELETE` em lugar nenhum do sistema (só `status = 'inativo'`, `index.js` ~5550) e o seletor da tela
(`GET /api/clientes`) lista todos, inclusive os inativos.

**C223 (medido) — a C223 estava errada:** ela diz "legado de antes da Etapa 103 (o "0" gravado como pai)". **Não é só legado**: a
103 fechou o `PUT` (`/^[1-9]\d*$/`), mas o **`POST /familias` continua gravando**: `parent_id: "0"` → **201 com `parent_id = 0`**;
`"abc"` → 201 como raiz (calado); `"1.5"` → 201 como **subfamília da família 1**; `-1` → 400. Como cada leitor vê o pai 0: a aba
Famílias trata como raiz (`ehRaiz`), o cadastro de material recusa (*"A família escolhida é uma subfamília — …"*), e criar
subfamília debaixo dela recusa (*"Subfamília não pode ter filhos (máximo 2 níveis)"*).

## Decisões

- **D1 — C221: a condição de cada conferência vai para dentro do comando que grava (o molde da C218).**
  - `POST /familias` com pai: `INSERT … SELECT … WHERE EXISTS (pai ativo e raiz)`.
  - `PUT /familias/:id`: o `UPDATE` ganha, conforme o que a rota conferiu — pai ativo e raiz (quando valida o pai: mudar de pai,
    ou reativar subfamília); `NOT EXISTS` material pela família ou subfamília (quando o nível muda); `NOT EXISTS` subfamília
    (qualquer, quando vira subfamília).
  - Do outro lado nada muda: o "Inativar" já tem `NOT EXISTS (subfamília ativa)` no comando (110) e o cadastro de material já
    exige `parent_id IS NULL` / `parent_id = família` no comando (110). Uma conexão SQLite executa um comando inteiro antes ou
    depois do outro: um dos dois sempre vê o outro.
  - **Não gravou → relê** pelas mesmas conferências, na mesma ordem (o mesmo código da primeira passada — não uma cópia), e
    responde **a literal de hoje**. Se a releitura passar (desfeito na janela), tenta **uma** vez mais; não gravou de novo → 409.
  - **Descartado:** uma trava em memória por família (a `travaPorMaterial` é por material e a família não tem uma; criar uma
    trava nova para isto tocaria as seis portas da Etapa 91 sem necessidade — a condição no comando basta, como bastou na 110);
    transação `BEGIN IMMEDIATE` (o banco é uma conexão só compartilhada por todas as rotas: uma transação aberta numa rota engole
    os comandos das outras — a razão de o motor compensar sem transação, ver a memória da migração para Postgres).
- **D2 — C216: `POST`/`PUT /materiais` com um dono que não está em Clientes → 400**, literal nova (no plano). Só a **existência**
  (o cliente inativo continua aceito — o seletor o oferece). No `PUT`, só quando o dono **muda** para um id (o material cujo
  cliente sumiu continua editável — o `nomeDoCliente` já trata "cliente #⟨n⟩"), e **depois** da guarda de troca de dono (403
  primeiro: autorização antes de validação, B715). **Conferência antes do comando, sem condição no comando:** nenhuma porta do
  sistema apaga cliente, então não há o que correr. **Descartado:** a condição no `INSERT`/`UPDATE` (protegeria contra um `DELETE`
  que não existe, ao custo de mais um ramo de releitura nas duas rotas mais carregadas do módulo); recusar cliente inativo (a tela
  o oferece — a recusa apareceria só ao salvar).
- **D3 — C223: o `POST /familias` ganha a régua do `PUT` (103)** — `parent_id` informado e não vazio só inteiro positivo; o resto
  → 400 *"Família pai não encontrada"* (a literal que o `PUT` já usa). E um **reparo no boot**: `parent_id = 0` → `NULL`
  (vira a raiz que a aba Famílias já mostra), com ledger `reparo_familia_pai_zero`. **Descartado:** reparar também pai que aponta
  para id inexistente (famílias não são apagadas pelo sistema — `DELETE` é inativar; o caso não foi medido em lugar nenhum, fica
  para a A73 mostrar); aceitar `"1.5"` como 1 (o `parseInt` de hoje) — é o mesmo "calado" que a 103 fechou no `PUT`.
- **D4 — Legado:** **A72** (materiais com dono que não está em Clientes), **A73** (famílias com pai 0, antes do reparo; e pai
  inexistente), **A74** (o que as corridas da C221 deixaram: subfamília ativa sob raiz inativa, terceiro nível, material com o par
  família/subfamília que não bate). Todas somente leitura.
- **Compras:** nenhuma linha de código do Compras muda — `grep familias` em `server/routes/compras*`, `server/services/compras` e
  nas telas de Compras dá zero; as famílias só aparecem lá na **B61** (onde a C218 foi medida, na Etapa 109 de Compras). Registro
  em `docs/compras-novidades-por-etapa.md` não se aplica a código; a B61 de lá já remete à C218 resolvida.
