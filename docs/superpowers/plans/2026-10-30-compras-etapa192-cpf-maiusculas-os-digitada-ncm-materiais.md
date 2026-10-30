# Etapa 192 (Compras) + Frota Etapa 10 — CPF e maiúsculas no fornecedor, OS digitada e NCM no pedido, materiais no Compras, Voltar no topo

> Status: **etapa fechada em 2026-10-30** (`14092ab2` estimativa … `3a293902` Fase 5, mais o fechamento). Estimativa: `docs/estimativas/2026-10/estimativa_2026-10-30_compras-fornecedor-pedido-e-frota.md` (`14092ab2`).

Pedido do André de 30/10 (7 itens). O item 7 dele (várias OS no mesmo pedido) **não** é executado aqui: vira o plano
`docs/superpowers/plans/2026-10-30-compras-varias-os-no-pedido-planejamento.md` (o `os_id` do pedido alimenta a reserva do
recebimento, o encerramento da OS e a trava de exclusão da OS, que moram no almoxarifado, pausado desde 23/10).

Numeração: a última etapa global é a 191 (almoxarifado); esta é a **192**, registrada em `docs/compras-novidades-por-etapa.md`.
A parte da Frota é a **Etapa 10 da Frota** (`docs/frotas/novidades-por-etapa.md`).

## Diagnóstico (medido no código)

- **Item 5 — o print:** é a tela **Compras → Pedido de compra → Novo/Editar → item → "detalhes" (IPI, NCM, peso e observação)**,
  `client/src/components/compras/PedidoCompraForm.js:1161`. O texto "o do cadastro do material" é o *placeholder* do NCM e do peso.
  Causa: `GET /api/compras/materiais` (`pedidoCompraService.buscarMateriais`) devolve só `id, codigo, descricao, unidade`, então o item
  nasce com NCM e peso vazios; o servidor completa com o do material **só ao salvar** (RN-39.01). Na edição já vinham preenchidos.
- **Itens 1 e 2:** ficha em `client/src/components/compras/FornecedorFicha.js`; servidor em `server/routes/compras/fornecedores.js`
  (`CAMPOS_TEXTO`, `COLUNAS_FICHA`; o CNPJ **não** é validado no servidor, só na tela). Colunas novas pelo `ALTERS_FORNECEDORES`
  (`server/index.js` ~18961). O modal F2 (`FornecedorModal.js`, Etapa 173) usa a mesma ficha.
- **Item 3:** `client/src/components/frotas/FrotasPortalMotorista.js` — `RegistroForm` (saída e retorno, `:559`) e
  `AbastecimentoForm` (`:661`) têm "Voltar" só no rodapé.
- **Item 4:** `pedidos_compra.os_id` (select de `/compras/aux/ordens-servico`), `pedidoCompraService.js` (`normalizarOsId`,
  `assertOsAceitaCompra`), documento `pedidoDocumentoHtml.js:373` (`OS: <numero>`), lista com `os_numero` e filtro `os_id`
  (`routes/compras.js:159`).
- **Itens 6 e 7:** `POST/PUT /api/almoxarifado/materiais` exigem `criar_material`/`editar_material` = ADMINISTRADOR, ALMOXARIFE,
  ENGENHARIA; o prefixo `/api/almoxarifado` exige o **módulo** almoxarifado, que o comprador pode não ter (`routes/compras.js:447`,
  Etapa 38). O perfil `COMPRAS` existe em `services/almoxarifado/permissions.js`.

## Regras de negócio

### Fornecedor (itens 1 e 2)
- **RN-192.01** — coluna nova `fornecedores.cpf` (TEXT). A ficha ganha o campo **CPF** (máscara `000.000.000-00`), ao lado do CNPJ.
- **RN-192.02** — o servidor valida o CPF pelos dígitos verificadores (11 dígitos, não todos iguais). Inválido → **400
  `CPF inválido. Verifique os dígitos.`** (a mesma frase da tela). Grava só os dígitos formatados (`000.000.000-00`).
- **RN-192.03** — CPF **e** CNPJ preenchidos juntos → **400 `Preencha o CPF ou o CNPJ, não os dois.`** (decisão B, reversível:
  apertar depois de haver dado misturado seria pior que afrouxar).
- **RN-192.04** — a busca de fornecedores (`search`) também procura no CPF; a lista/ficha mostram o CPF onde mostram o CNPJ quando
  o CNPJ está vazio; o documento do pedido mostra `CPF: …` no lugar do `CNPJ: …` do fornecedor que só tem CPF.
- **RN-192.05** — maiúsculas: o **servidor** grava em maiúsculas (`toLocaleUpperCase('pt-BR')`, mantém acento: "são" → "SÃO")
  os textos livres da ficha: `razao_social, nome_fantasia, inscricao_estadual, contato, endereco, cidade, estado` (e qualquer
  outro texto livre da ficha que exista no código — o executor lista). **Não** mexe em: `email` (minúsculo é o normal e não
  atrapalha o envio), telefones, CEP, CNPJ, CPF (só dígitos/máscara). A tela mostra em maiúsculas enquanto digita.
- **RN-192.06** — os fornecedores já cadastrados **não** são convertidos (decisão B: conversão em massa é irreversível; passam a
  maiúsculas quando forem salvos de novo). Vale para **toda** porta que grava fornecedor no Compras (POST/PUT da ficha, modal F2
  e qualquer outra rota de criação que o executor achar — listar no relatório).

### Pedido de compra (itens 4 e 5)
- **RN-192.07** — coluna nova `pedidos_compra.os_texto` (TEXT, até 60 caracteres). No formulário, junto do select de OS, a
  opção **"OS não cadastrada — digitar"** abre um campo de texto. `os_id` e `os_texto` são **exclusivos**: os dois juntos → **400
  `Escolha a OS da lista ou digite, não os dois.`**; texto acima de 60 → **400 `OS digitada: no máximo 60 caracteres.`**
- **RN-192.08** — a OS digitada é **só texto**: não reserva material no recebimento, não entra no encerramento da OS nem na trava
  de exclusão da OS (é o que "não está cadastrada" quer dizer). Aparece no documento (`OS: <texto>`), na lista (coluna OS) e na
  busca/filtro textual da lista se houver. PUT: chave ausente não mexe; `''`/`null` limpa (mesma semântica do `os_id`).
- **RN-192.09** — `GET /api/compras/materiais` passa a devolver também `ncm` e `peso_unitario`; o item novo do pedido nasce com
  eles preenchidos. O comprador continua podendo mudar no item. Placeholder: só aparece quando o material não tem NCM/peso.

### Materiais no Compras (itens 6 e 7)
- **RN-192.10** — o módulo Compras ganha a aba/tela **Materiais** (lista + incluir + editar), reaproveitando o formulário do
  almoxarifado (`MaterialAlmoxarifadoForm`), por rotas do próprio Compras: `GET/POST /api/compras/materiais/cadastro`,
  `PUT /api/compras/materiais/:id` (ou nome equivalente que não colida com a busca `GET /api/compras/materiais`), gate
  `checkModulePermission('compras')` + `requirePermission('criar_material'|'editar_material')`, chamando o **mesmo serviço** que
  as rotas do almoxarifado (mesma validação, mesmas mensagens). Excluir, foto e saldo **não** entram (ficam no almoxarifado).
- **RN-192.11** — `criar_material` e `editar_material` passam a incluir o perfil **COMPRAS** ("quem administra o Compras").
  Decisão B: o executor mede como o perfil do usuário é atribuído; se houver noção de "administrador do módulo Compras", usa
  ela e registra; senão usa o perfil COMPRAS e registra na letra A que quem administra o Compras precisa ter esse perfil.

### Frota (item 3)
- **RN-F10.01** — `RegistroForm` (saída e retorno) e `AbastecimentoForm` ganham um **"Voltar"** no topo, ao lado do título, com o
  mesmo comportamento do de baixo (desabilitado enquanto salva). O de baixo continua.

## Tasks (todas galho — arquivos e regras independentes; worktrees separadas)

| Task | Itens | Onde | Estado |
|---|---|---|---|
| F1 | 1, 2 (RN-192.01–06) | worktree `CRM-wt-192f` | ✅ `ad99f567` CPF, `e8bd4374` maiúsculas (merge `8965ccbf`) |
| P1 | 4, 5 (RN-192.07–09) | worktree `CRM-wt-192p` | ✅ `003a73fb` OS digitada, `3235fdbe` NCM (merge `c8c264c0`) |
| M1 | 6, 7 (RN-192.10–11) | worktree `CRM-wt-192m` | ✅ `bcbd4ed2` tela/rotas, `950c70d8` acesso (merge `4f7118e4`) |
| V1 | 3 (RN-F10.01) | `main` | ✅ `79aad18f`, docs `19d26c6c` |
| O1 | planejamento várias OS | plano separado (sem código) | ✅ `633efbd4` (25 h, 8 partes) |
| I1 | integração: fornecedor só com CPF num pedido com OS digitada → documento mostra `CPF:` e `OS:`; material criado pelo Compras aparece na busca do pedido com NCM | `main`, depois do merge | ✅ `8c1db785` (5 passos; controle positivo: NCM fora da busca derruba o 2, documento sempre com CNPJ derruba o 5) |

Pontos de conflito previstos no merge: `pedidoDocumentoHtml.js` (F1 e P1), `routes/compras.js` (P1 e M1), `Compras.js` (M1).

## Fase 5 — revisão adversarial (3 revisores frescos: regra, autorização, força dos testes)

| # | Achado (reproduzido) | Correção |
|---|---|---|
| X1 | Médio — quem tem o módulo Compras e um perfil antigo do Almoxarifado (ALMOXARIFE/ADMINISTRADOR) **sem** o módulo Almoxarifado lançava saldo inicial (ENTRADA 5) e ligava lote pelas rotas do Compras | `7b2143fd`: saldo inicial pelo Compras → 400 `Saldo inicial é lançado no Almoxarifado.` para todos; o handler compartilhado roda com uma cópia do usuário com perfil COMPRAS (sem superadmin/admin), mantendo id/nome para a auditoria. G1: o harness aceita `checkModulePermission` e o teste prova o módulo `compras` nas 10 rotas |
| X2 | Médio — as maiúsculas quebraram a busca com acento ("aços" não achava "AÇOS") em pedidos, cotações e recebimento | `3be6487d`: `condicaoDeBusca` nas 4 buscas (inclui a de fornecedores, no lugar da feita à mão) |
| X3 | Médio-baixo — corrida: duas edições ao mesmo tempo deixavam CPF **e** CNPJ (16/30) | `ef5ca142`: exclusividade no `WHERE` do `UPDATE`; teste com gancho no `db.get` + 20 rodadas reais |
| X4 | Médio-baixo — NCM do material com mais de 10 caracteres agora travava o pedido novo (400 do schema do item) | `18b1bfc4`: a tela só copia NCM de até 10 |
| X5 | Baixo — recebimento mostrava `CNPJ —` para fornecedor só com CPF | `18b1bfc4`: CPF no painel do pedido, na lista de fornecedores e no campo `CNPJ / CPF do Fornecedor` |
| X6 | Exibição — o formulário no Compras chamava `/clientes`, recusado a quem só tem Compras | `2acd4dcc`: Proprietário só leitura no Compras (`O proprietário é definido no Almoxarifado.`) |
| G2–G13 | 13 sabotagens que não derrubavam nada (1º dígito do CPF, PUT dos 7 campos, busca por nome fantasia, CPF na lista/Excel, CSS, importação, 60 emoji, `os_texto` inválido, CPF com letra, OS digitada vazia, Voltar da Saída enquanto salva, OS digitada fora do encerramento) | `3a293902` (+ G1 em `7b2143fd`, G4/G7 em `3be6487d`, G11 em `18b1bfc4`) |

## Fechamento (2026-10-30)

**Verificação final na `main` (`0aba7241`, depois do merge da Fase 5):** `test:api` 574/574 arquivos · `test:almoxarifado` 44/0 ·
`test:validation` 4/0 · `test:safealter` 3/0 · `test:sqlite` 16/0 · tela 208 suítes, 2863/2863 testes · build *Compiled successfully*.

**Divergências do plano (o plano estava errado ou incompleto):**
- RN-192.04 não previa **congelar o CPF no pedido** — o documento lê o retrato do fornecedor; nasceu `snap_fornecedor_cpf` (B69).
- RN-192.05 não previa que **maiúsculas quebram a busca com acento** no SQLite — achado de F1 (busca de fornecedores e importação) e da
  Fase 5 (pedidos, cotações, recebimento).
- RN-192.09 dizia "a busca não traz NCM"; era só isso — a tela já copiava. Mas copiar trouxe o NCM longo (X4).
- RN-192.10 punha as rotas em `routes/compras.js`; ficaram em `routes/almoxarifado.js`/`extended.js` ao lado dos handlers que reusam
  (os testes de portão exigem caminho literal).
- **RN-192.11 estava errada:** mandava pôr o perfil COMPRAS em `criar_material`/`editar_material`. `editar_material` também guarda
  **excluir** e **foto** no Almoxarifado; todo comprador ganharia isso. O certo: o **administrador do módulo Compras** (`admin_modulos`),
  só nas portas do Compras (B71), e pelo Compras nunca se mexe em estoque (B72).
- Fase 2 (revisor fresco do plano) **não rodou** como passada separada: cada executor foi instruído a rastrear a RN até o último gesto e
  reportar divergência (foi o que achou o erro da RN-192.11). A Fase 5 achou 6 defeitos reais — a Fase 2 provavelmente teria pegado X1.

**Retro (4 números):** rodadas de correção até verde: **1**; achados da revisão: **6 reais + 13 lacunas de teste, 0 ruído**; paralelismo:
**3 galhos + 1 planejador** em paralelo, sem retrabalho (merges sem conflito); defeito que escapou: — (preencher na próxima etapa).

## Próxima tarefa detalhada

1. **Várias OS no mesmo pedido** — só depois de a empresa responder às perguntas de
   `docs/superpowers/plans/2026-10-30-compras-varias-os-no-pedido-planejamento.md` e de o André liberar o Almoxarifado (pausado): as
   partes 5–8 mexem na reserva do recebimento sob a trava por material. Começar pela parte 1 (OS por item, migração que copia a OS do
   cabeçalho), contrato no plano. A `os_texto` desta etapa vira por item lá.
2. **A11** — o André marca o administrador do módulo Compras no cadastro de usuário (sem isso a tela Materiais do Compras mostra o aviso).
3. Pendências pequenas declaradas: ~~NCM/peso no pedido aberto pela Reposição~~ — **feito em `44ac519b`** (2026-10-30, pela busca
   por código, sem porta nova); CPF na **remessa** do Almoxarifado (pausado).
4. Antes de apresentar: clicar os roteiros da Etapa 192 (`docs/compras-novidades-por-etapa.md`) e da Etapa 10 da Frota.
