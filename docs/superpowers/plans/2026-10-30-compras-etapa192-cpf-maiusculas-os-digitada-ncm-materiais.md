# Etapa 192 (Compras) + Frota Etapa 10 — CPF e maiúsculas no fornecedor, OS digitada e NCM no pedido, materiais no Compras, Voltar no topo

> Status: **em execução** (2026-10-30). Estimativa: `docs/estimativas/2026-10/estimativa_2026-10-30_compras-fornecedor-pedido-e-frota.md` (`14092ab2`).

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
| F1 | 1, 2 (RN-192.01–06) | worktree `CRM-wt-192f` | — |
| P1 | 4, 5 (RN-192.07–09) | worktree `CRM-wt-192p` | — |
| M1 | 6, 7 (RN-192.10–11) | worktree `CRM-wt-192m` | — |
| V1 | 3 (RN-F10.01) | `main` | — |
| O1 | planejamento várias OS | plano separado (sem código) | — |
| I1 | integração: fornecedor só com CPF num pedido com OS digitada → documento mostra `CPF:` e `OS:`; material criado pelo Compras aparece na busca do pedido com NCM | `main`, depois do merge | — |

Pontos de conflito previstos no merge: `pedidoDocumentoHtml.js` (F1 e P1), `routes/compras.js` (P1 e M1), `Compras.js` (M1).
