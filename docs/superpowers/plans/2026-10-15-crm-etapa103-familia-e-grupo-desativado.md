# Etapa 103 — família com material não muda de nível; grupo de fornecedores desativado se reativa e não recebe vínculo

> Frente **Compras (core)** + `PUT /api/almoxarifado/familias/:id` (G10b), worktree `CRM-wt-e103`, branch
> `etapa-e103` (de `main` `ab400bbd`). Design (Fase 0 medida por sonda):
> `docs/superpowers/specs/2026-10-15-crm-etapa103-familia-e-grupo-desativado-design.md`.

> **Estado (2026-10-15):** 🟢 fechada — T1–T6 feitas; commits e números medidos no fim. Baseline (`ab400bbd`): `test:api` 344/349 — os 5 vermelhos eram `EADDRINUSE` (porta efêmera disputada com a suíte da Etapa 102 rodando ao mesmo tempo na máquina), não asserção; client e build não medidos no baseline.

## Regras de negócio

### G10b — família com material não muda de nível (rota do almoxarifado, só servidor)
- **RN-103.01** `PUT /api/almoxarifado/familias/:id` com `parent_id` **informado e diferente do gravado**
  (comparação por valor: `'5'` e `5` são iguais; `null`/`''`/ausente-com-gravado-null são "raiz") numa família
  que tem **material** — `materiais_almoxarifado` com `familia_id = :id OR subfamilia_id = :id`, **qualquer
  `ativo`** — → **400**, nada gravado, com a literal:
  - família hoje **raiz** (vai virar sub): **L-F1** `Não é possível transformar em subfamília: a família tem ${n} material(is) cadastrado(s) (contando os inativos)`
  - família hoje **subfamília** (vai para outra família principal ou virar raiz): **L-F2**
    `Não é possível mudar a família principal desta subfamília: ela tem ${n} material(is) cadastrado(s) (contando os inativos)`
  Cenários: raiz com material ativo → sub: L-F1; raiz só com material inativo → sub: L-F1 com n=1; sub com
  material → outra raiz: L-F2; sub com material → `parent_id: null`: L-F2.
- **RN-103.02** (dois níveis) `PUT` com `parent_id` **novo** (diferente do gravado) numa raiz que tem
  subfamília **inativa** (e nenhuma ativa) → **400** **L-F3**
  `Família com subfamília(s) inativa(s) não pode virar subfamília — elas ficariam num terceiro nível`.
  A recusa de subfamília **ativa** (`Família com subfamília(s) ativa(s) não pode virar subfamília`) não muda.
- **RN-103.03** (metade positiva, inalterado) raiz sem material e sem filhas → sub: **200**; sub com material
  renomeada omitindo `parent_id` → **200**; repetindo o mesmo `parent_id` → **200**.
- **Ordem das recusas do PUT:** nome vazio → 404 → pai de si mesma → inativar com filhas ativas → virar sub com
  filhas ativas → **virar sub com filhas inativas (L-F3)** → **material (L-F1/L-F2)** → pai inválido
  (`validateParentFamilia`).

### Reativar grupo de fornecedores
- **RN-103.04** `POST /api/compras/grupos/:id/reativar` (gate `authenticateToken` + `checkModulePermission('compras')`,
  igual às outras rotas de grupo) → **200** `{ message: 'Grupo reativado' }` e `ativo = 1`; grupo já ativo → **200**
  com a mesma mensagem (idempotente, como o DELETE); id inexistente → **404** `{ error: 'Grupo não encontrado' }`.
  Não mexe em `fornecedores.grupo_id` (os fornecedores que ficaram ligados voltam com o grupo — B45).
- **RN-103.05** `GET /api/compras/grupos?incluir_inativos=1` → todos os grupos, **ativos primeiro**, depois a
  ordem de sempre (`numero`, `ordem`, `nome`), cada linha com `ativo`. `GET /api/compras/grupos/:id?incluir_inativos=1`
  → a linha mesmo desativada (com `ativo: 0`); inexistente → 404 `'Grupo não encontrado'`. **Sem o parâmetro,
  os dois GET não mudam** (só ativos; desativado → 404).
- **RN-103.06** (tela `GruposFornecedores`) carrega com `incluir_inativos=1`; a grade mostra **só os ativos**,
  como antes. Se houver desativados aparece o botão **`Mostrar grupos desativados (N)`** (vira
  **`Ocultar grupos desativados`**); cada cartão desativado tem o selo **`Desativado`** e o botão **`Reativar`**.
  Reativar → `POST …/reativar` → toast **`Grupo reativado`** → recarrega (o grupo volta à grade). Erro → toast com
  `err.response.data.error` ou **`Erro ao reativar grupo`**. O "Número do grupo" do modal conta só os ativos.

### `FornecedoresDoGrupo` por URL de grupo desativado
- **RN-103.07** (tela) pede `GET /compras/grupos/:id?incluir_inativos=1`.
  - `ativo === 0`: aviso **`Este grupo está desativado — reative-o para vincular fornecedores.`** com o botão
    **`Reativar grupo`**; os botões **Vincular fornecedor** e **Novo fornecedor** (cabeçalho e o do estado vazio)
    **não aparecem**. Editar e "Remover do grupo" continuam. Reativar → `POST …/reativar` → toast `Grupo reativado`
    → recarrega (botões voltam).
  - GET **404**: título **`Fornecedores – Grupo não encontrado`**, aviso **`Grupo não encontrado.`**, sem os
    botões de vincular/novo.
  - outro erro (rede/500): como hoje (título "Grupo", botões disponíveis — o servidor decide, RN-103.08).
- **RN-103.08** (servidor — `routes/compras/fornecedores.js`, as portas que respondem; as de `routes/compras.js`
  são sombreadas desde a B18) `grupo_id` inteiro **novo** apontando para grupo inexistente → **400**
  **`Grupo não encontrado`**; para grupo desativado → **400** **L-G**
  `Grupo desativado — reative o grupo em Fornecedores homologados antes de vincular fornecedores`. Nada gravado.
  - `POST /api/compras/fornecedores`: todo `grupo_id` inteiro é novo.
  - `PUT /api/compras/fornecedores/:id`: só quando `grupo_id` vem no corpo e é **diferente do gravado**; o
    **mesmo** valor (inclusive de grupo desativado ou que não existe mais) → 200 (B52); `null`/`''` limpam
    como antes; `'abc'` → 400 `Grupo inválido` como antes. Fornecedor inexistente → **404**
    `Fornecedor não encontrado` (antes da checagem do grupo).
- **RN-103.09** (integração, pela ROTA) criar grupo → vincular fornecedor A (200) → `DELETE` grupo → vincular
  fornecedor B ao grupo → 400 L-G → salvar A repetindo o `grupo_id` → 200 → `GET ?incluir_inativos=1` mostra o
  grupo com `ativo: 0` → `POST reativar` → vincular B → 200 → `GET /grupos` (sem parâmetro) lista o grupo.

## Contratos congelados
- `PUT /api/almoxarifado/familias/:id` — novos 400 `{ error: L-F1 | L-F2 | L-F3 }`. Resto inalterado.
- `POST /api/compras/grupos/:id/reativar` — 200 `{ message: 'Grupo reativado' }` | 404 `{ error: 'Grupo não encontrado' }` | 500 `{ error }`.
- `GET /api/compras/grupos[?incluir_inativos=1]`, `GET /api/compras/grupos/:id[?incluir_inativos=1]` — forma da
  linha inalterada (`SELECT *`, já inclui `ativo`).
- `POST/PUT /api/compras/fornecedores[/:id]` — novos 400 `{ error: 'Grupo não encontrado' }` e `{ error: L-G }`.
- Textos de tela (literais): `Mostrar grupos desativados (N)`, `Ocultar grupos desativados`, `Desativado`,
  `Reativar`, `Reativar grupo`, `Grupo reativado`, `Erro ao reativar grupo`,
  `Este grupo está desativado — reative-o para vincular fornecedores.`, `Grupo não encontrado.`,
  `Fornecedores – Grupo não encontrado`.

## Tasks (executor único em série — ver retro; T1/T2/T3 são regras disjuntas, T4/T5 consomem T2/T3)
- [x] **T1 (G10b, galho)** `routes/almoxarifado.js` PUT famílias: RN-103.01/02/03. Teste novo
  `tests/api/familiaMudaDeNivel.api.test.js`. Controles: tirar a contagem de material; contar só ativos; tirar o
  ramo de filhas inativas; comparar `parent_id` por identidade (`'5' !== 5`).
- [x] **T2 (servidor de grupo, tronco de T4/T5)** `routes/compras.js`: `POST /grupos/:id/reativar` + `incluir_inativos`
  nos dois GET (RN-103.04/05). Cenários em `comprasPedidosRotas.api.test.js` (onde moram os de grupo).
- [x] **T3 (servidor de vínculo, tronco de T5)** `routes/compras/fornecedores.js` (RN-103.08) + cenários em
  `comprasFornecedor.api.test.js` (passa a criar `grupos_compras` — os ids 2/3/4/7 que ele usava sem tabela viram
  grupos reais; dizer no commit). Integração RN-103.09 no mesmo arquivo.
- [x] **T4 (tela `GruposFornecedores`)** RN-103.06 + teste novo `GruposFornecedores.test.js`.
- [x] **T5 (tela `FornecedoresDoGrupo`)** RN-103.07 + teste novo `FornecedoresDoGrupo.test.js`.
- [x] **T6** suíte completa, revisão adversarial (agente fresco), fechamento.

## Fase 2 — revisão do plano (agente fresco, 2026-10-15) e o que mudou
**5 médios, 7 baixos; todos reais e incorporados (as emendas valem sobre o texto acima):**
- **(M1) A medição "grupo inexistente também grava" valia só no harness.** Em produção `fornecedores.grupo_id`
  tem `REFERENCES grupos_compras(id)` com `foreign_keys = ON`: o `POST` com grupo inexistente dava 500, e um
  `PUT` que **regrava** um `grupo_id` órfão com ele mesmo também falha. Emenda à RN-103.08: o grupo **igual** ao
  gravado não entra no `SET` (além de pular a checagem). Provado sobre a DDL de produção com a FK ligada
  (`comprasGrupoDesativado.api.test.js`, parte 2, com controle positivo). O design ganhou a correção da medição.
- **(M2)** T3 (integração RN-103.09) e T5 dependem de T2 — execução em série, sem efeito.
- **(M3) Ordem das recusas do `PUT /fornecedores/:id`**: razão vazia 400 → `Grupo inválido` 400 → `Status inválido`
  400 → id não numérico 404 → fornecedor inexistente 404 → grupo novo (`Grupo não encontrado` / L-G). A comparação
  com o gravado é feita **depois** do `parseGrupoId` (o "Editar" da tela do grupo manda `'7'`).
- **(M4) `parent_id` não numérico ou `'0'`**: `'abc'` virava NaN, pulava a validação e o sqlite gravava NULL (a sub
  virava raiz calada); `'0'` gravava pai 0. Emenda **RN-103.01b**: `parent_id` informado e não vazio que não é inteiro
  positivo → 400 `Família pai não encontrada` (antes do 404 da família). A ordem do PUT fica: nome vazio → parent_id
  inválido → 404 → ….
- **(M5) Zero grupos ativos**: o botão `Mostrar grupos desativados (N)` tem de existir também no estado vazio, que
  passa a dizer **`Nenhum grupo ativo.`** quando há desativados (senão não sobra caminho para reativar).
- **(Baixas)** os **dois** carregamentos de `GruposFornecedores` (efeito e `onSaved` do modal) pedem
  `incluir_inativos`; o cartão desativado **abre** a tela do grupo e não tem o lápis; só `incluir_inativos=1` liga o
  parâmetro; "desativado" = `ativo` diferente de 1 nos dois lados (tela e servidor); no 404 da RN-103.07, Editar e
  "Remover do grupo" continuam; checagem e gravação **não são atômicas** (declarado, B52); um teste antigo cria
  `grupos_compras` sem `updated_at` (não afeta — a checagem só lê `ativo`).

## Execução — o que foi feito em cada task (divergências incluídas)
- [x] **T1 (G10b)** — `2e3a09eb`. Teste novo `familiaMudaDeNivel.api.test.js` (11 na entrega; 14 depois da Fase 5).
  Controles (6, todos vermelhos na asserção certa): sem a contagem de material (5 vermelhos), só ativos, sem o ramo
  da sub inativa, nível por identidade crua (`parent_id !== current.parent_id` derruba os dois "mesmo pai"), sem o
  parse estrito (**a 1ª tentativa desta sabotagem não sabotou nada** — a âncora casou 0 vez e o harness abortou;
  refeita com âncora menor), literais trocadas.
- [x] **T2 + T3 (servidor de grupo e vínculo)** — `28b90f06`. **Divergência:** os cenários foram para um arquivo
  novo, `comprasGrupoDesativado.api.test.js` (9), e não para `comprasPedidosRotas`/`comprasFornecedor` — o primeiro é a
  régua da extração da 38 e o segundo a da ficha da 34; misturar a regra nova em qualquer um dos dois esconderia a RN.
  `comprasFornecedor.api.test.js` passou a criar `grupos_compras` com os ids 2/3/4/7/9 que já usava sem tabela (sem
  isso, 10 cenários caíam com "no such table" — medido). Controles (9, todos vermelhos): sem a rota, lista e GET :id
  ignorando o parâmetro, sem ativos primeiro, POST sem checagem, PUT comparando texto com número, PUT regravando o
  grupo igual (só a parte da FK cai — é a prova do M1), só existência sem `ativo`, sem o 404 antes do grupo.
- [x] **T4 + T5 (telas)** — `98d4653f`. `GruposFornecedores.test.js` (7 na entrega; 9 depois da Fase 5) e
  `FornecedoresDoGrupo.test.js` (8). Controles (8, todos vermelhos): lista sem o parâmetro, grade com todos, botão
  sumindo com zero ativos, reativar sem recarregar, grupo sem o parâmetro, sempre pode vincular, 404 como erro
  qualquer, estado vazio oferecendo vincular.
- [x] **T6** — revisão adversarial (abaixo), suíte completa, fechamento.

## Fase 5 — revisão adversarial final (dois agentes frescos, 2026-10-15)
Servidor e telas em paralelo. **0 altos, 0 médios; 4 baixos reais (reproduzidos), todos corrigidos; 4 ruídos.**
1. (Baixa, servidor) Sub com `ativo` fora de 0/1 (o PUT grava `ativo` cru: `'false'` fica texto) não entrava em
   nenhuma das duas contagens — a raiz virava sub e o 3º nível voltava. **Corrigido:** inativa = `COALESCE(ativo, 0) <> 1`.
2. (Baixa, servidor) Legado com `parent_id = 0` recebia a literal de sub (L-F2) — **corrigido:** `eraRaiz = !parent_id`,
   como no cálculo de "nível muda".
3. (Teste, servidor) Nenhum cenário provava sub **sem** material virando raiz com 200 — **acrescentado**.
4. (Baixa, tela) A seção de desativados não fechava ao reativar o último — o próximo "Remover grupo" a reabria
   sozinha. **Corrigido** (efeito que fecha quando não há desativados) + cenário; e o "Número do grupo conta só os
   ativos" ganhou cenário (estava sem teste).
Controles da onda (4): inativa só por `ativo = 0`, `eraRaiz` por `=== null`, recusar toda ida para raiz, não fechar a
seção — os quatro vermelhos no cenário novo. Ruído (conferido, sem mudança): a mensagem de material vem antes de
"Família pai não encontrada" (ordem documentada); array no corpo (`[5]`) é aceito como o id (nenhum chamador manda);
mock que ignora `params` (compensado por asserção explícita da chamada); duplo clique em "Reativar" (botão desabilitado
e rota idempotente).

## Para o integrador — texto pronto para `docs/almoxarifado-manual-do-sistema.md` §2.1
Esta etapa **não** tocou o manual (a 102 do almoxarifado o edita em paralelo). A regra nova das famílias mora no fim
da §2.1, onde hoje está a frase *"O que a tela **não** faz: mover uma subfamília para outra família, ou transformar
família em subfamília (e vice-versa) — só pela API."*. Substituir essa frase por:

> O que a tela **não** faz: mover uma subfamília para outra família, ou transformar família em subfamília (e
> vice-versa) — só pela API. E mesmo pela API o sistema só aceita essas mudanças de nível em família **sem
> material** (ativo ou inativo, cadastrado nela como família ou como subfamília) e, para virar subfamília, sem
> subfamílias próprias (ativas ou inativas — a hierarquia nunca passa de dois níveis):
>
> | Situação | Resultado |
> |---|---|
> | Família com material passando a ser subfamília | Recusado: *"Não é possível transformar em subfamília: a família tem N material(is) cadastrado(s) (contando os inativos)"* |
> | Subfamília com material indo para outra família principal, ou virando família principal | Recusado: *"Não é possível mudar a família principal desta subfamília: ela tem N material(is) cadastrado(s) (contando os inativos)"* |
> | Família com subfamília ativa passando a ser subfamília | Recusado: *"Família com subfamília(s) ativa(s) não pode virar subfamília"* |
> | Família com subfamília inativa passando a ser subfamília | Recusado: *"Família com subfamília(s) inativa(s) não pode virar subfamília — elas ficariam num terceiro nível"* |
> | Família pai informada que não é um número de família | Recusado: *"Família pai não encontrada"* |
>
> Renomear ou editar a família sem mudar o pai continua livre, com ou sem material.

## Próxima de Compras: a definir
Candidatas medidas aqui, sem prioridade decidida: **G10c** (`PUT /familias/:id` com `ativo: 0` inativa família com
materiais ativos — aplicar a contagem do `DELETE` quando `ativo` passa de 1 para 0; rota do almoxarifado, API só);
`VariaveisTecnicas` que aponta para grupo desativado continua oferecendo os fornecedores dele (B45 — decidir se a
variável deve avisar); **G15** só se o P.O. aceitar mostrar o total gravado com nota de "pedido anterior à 39".
Pontos de atenção para quem pegar: as rotas de POST/PUT de fornecedor que respondem moram em
`routes/compras/fornecedores.js` (as de `routes/compras.js` são sombreadas — B18); `grupos_compras` não existe no
harness (cada teste cria); a FK de `grupo_id` só existe em produção (ver o M1 acima).

## Retro (4 números)
- Rodadas de correção até verde: **2** (a Fase 2 mudou o PUT de fornecedor antes de ele existir — M1/M4; a Fase 5,
  4 correções baixas).
- Achados de revisão: Fase 2 **12** (5 médios reais — incluindo a medição que só valia no harness —, 7 baixos);
  Fase 5 **4 reais, 4 ruídos**, 0 altos/médios.
- Paralelismo: **0 galhos em paralelo** na execução (um executor em série — a etapa é pequena e T3/T5 dependem de T2);
  as duas revisões da Fase 5 rodaram em paralelo, sem retrabalho.
- Defeito escapado: preencher na etapa seguinte de Compras.

## Commits (branch `etapa-e103`)
- `2e3a09eb` G10b — família com material não muda de nível; `parent_id` não numérico recusado.
- `28b90f06` servidor de grupo — reativar, `incluir_inativos`, vínculo a grupo novo desativado/inexistente recusado.
- `98d4653f` telas — seção de desativados com "Reativar"; tela do grupo desativado/inexistente.
- `b168775f` onda da Fase 5 (4 baixos).
- docs — este plano, o design, `compras-novidades-por-etapa.md`, `specs/modulo-compras/README.md`, as notas de
  "mudou na 103" no plano da Etapa 34 e no design do lote de outubro.

**Medido na árvore final (antes do commit de docs, depois de `b168775f`):** `test:api` **351/351**;
`test:almoxarifado` **44/44**; `test:validation` 4/4, `test:safealter` 3/3, `test:sqlite` 5/5; client
**100 suítes / 1542 testes**; `CI=true react-scripts build` **Compiled successfully**.
