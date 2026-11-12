# Etapa 211 (Compras) — famílias e subfamílias cadastradas no Compras

> Pedido do setor de Compras (12/11/2026): o Almoxarifado não faz nenhum cadastro (regra permanente no `CLAUDE.md`, "cadastro é do
> Compras; o Almoxarifado só movimenta"). Estimativa `docs/estimativas/2026-11/estimativa_2026-11-12_cadastros-so-no-compras.md`,
> item 1 (4h). Fila: `specs/modulo-compras/README.md`, "A fazer", linha 1. Molde: Etapa 193 (material só no Compras).

## Medido antes (Fase 0)

- Gravação de família só por `/api/almoxarifado/familias` — `POST` (`routes/almoxarifado.js:3003`), `PUT /:id` (`:3076`, edita,
  reativa com `ativo: 1`, muda de nível com `parent_id`, `campos_lidos`), `DELETE /:id` (`:3373`, inativa). Os três são handlers
  inline com `denyUnlessAlmoxAdmin` (perfil `configurar` do almoxarifado: `canConfigureAlmox`) na primeira linha. Usam `req.user`
  só na auditoria (`auditarCadastro`).
- Leitura pelo Compras já existe: `GET /api/compras/materiais/aux/familias` (`portaCompras.leitura`, `listarFamilias`). Não existe
  a dos itens da família (`GET /api/almoxarifado/familias/:id/itens`).
- `services/compras/cadastroDeMaterial.js`: `criarPortaCompras` (base = token + módulo `compras`; `exigir(ACOES_DO_CADASTRO)` =
  admin do módulo Compras ou do sistema; `comoCompras` roda o handler com o usuário no perfil COMPRAS), `recusarCadastroNoAlmoxarifado`
  (403 para todos, chave de reversão `ALMOX_CADASTRO_MATERIAL=liberado`).
- Tela: `TabFamilias` dentro de `ConfiguracoesAlmoxarifado.js` (linhas ~496-1000), com modo somente leitura (Etapa 125,
  `podeGravarConfigAlmox`, `AvisoSomenteLeitura`). Testes da tela: `Familias.test.js`, `FamiliasEditarLidos.test.js`,
  `FamiliasSomenteLeitura.test.js`.
- 44 arquivos de teste do servidor gravam família pela rota do almoxarifado (preparação de cenário). Precedente da 193: esses
  arquivos ligam `ALMOX_CADASTRO_MATERIAL=liberado` no topo (53 já ligam).
- Mensagem que manda reativar família no lugar antigo: `services/almoxarifado/requisicaoMaterialInativo.js:120`
  ("Reative … em Configurações → Famílias (Administrador do almoxarifado) …"). Link do formulário de material:
  `MaterialAlmoxarifadoForm.js:721` (só com `linksConfiguracao`, que o Compras não tem).

## Regras de negócio

- **RN-211.01** — Famílias e subfamílias são criadas, editadas, inativadas e reativadas em **Compras → Famílias** (tela nova no menu
  do Compras, ao lado de Materiais), com os mesmos gestos e as mesmas regras de hoje (dois níveis, código gerado, pai travado na
  subfamília, `campos_lidos`, recusa de inativar com itens/subfamílias ativas). Quem grava: o administrador do módulo Compras e os
  administradores do sistema (a mesma régua do cadastro de material, `cadastroDeMaterial.pode`).
- **RN-211.02** — Pelo Almoxarifado, gravar família (POST, PUT, DELETE de `/api/almoxarifado/familias`) é recusado para **todos**,
  superadmin inclusive: 403 `O cadastro de famílias é feito em Compras → Famílias.` — antes do perfil. A chave
  `ALMOX_CADASTRO_MATERIAL=liberado` devolve as três rotas ao que eram (o `denyUnlessAlmoxAdmin` decide).
- **RN-211.03** — Almoxarifado → Configurações → Famílias continua listando famílias, subfamílias e itens, **só para consulta**, para
  todos, com o aviso `O cadastro de famílias é feito em Compras → Famílias.` e sem os botões Nova família, Nova subfamília, Editar,
  Inativar e Reativar.
- **RN-211.04** — Quem tem o módulo Compras mas não o administra vê Compras → Famílias só para consulta, com o aviso de quem pode
  cadastrar (`AVISO_SEM_ACESSO`, o mesmo de Compras → Materiais); o servidor recusa as gravações com o 403 de `exigir`.
- **RN-211.05** — As mensagens que mandam reativar família apontam o lugar novo: `Compras → Famílias (administrador do módulo Compras)`.

## Contratos (novos)

| Método e caminho | Porta | Handler | Respostas |
|---|---|---|---|
| `POST /api/compras/materiais/familias` | `portaCompras.cadastro` | `criarFamilia` (o do POST do almoxarifado, extraído) | as mesmas de hoje (201, 400 literais, 409) + 403 `{ error: 'Sem permissão para esta operação', acao, perfil }` |
| `PUT /api/compras/materiais/familias/:id` | idem | `editarFamilia` | idem (inclui reativar `{ ativo: 1 }` e 409 de `campos_lidos`) |
| `DELETE /api/compras/materiais/familias/:id` | idem | `inativarFamilia` | idem |
| `GET /api/compras/materiais/aux/familias/:id/itens` | `portaCompras.leitura` | `listarItensDaFamilia` (extraído) | o mesmo array de hoje |

`portaCompras.cadastro` = `[...base, exigir(ACOES_DO_CADASTRO), comoCompras]` (novo em `criarPortaCompras`).
Rotas do almoxarifado: `[recusarFamiliasNoAlmoxarifado, exigirAdminAlmox, handler]` — mesmo handler, recusa antes.

## Tasks

| # | Task | Tipo | Estado |
|---|---|---|---|
| T1 | Servidor: extrair os 4 handlers; `portaCompras.cadastro`; `recusarFamiliasNoAlmoxarifado` (+ aviso de boot); rotas do Compras; mensagem da RN-211.05; teste `familiasNoCompras.api.test.js` (RN-211.01/02/04/05) com controle positivo; chave ligada nos testes antigos que preparam família pela rota do almoxarifado | tronco | — |
| T2 | Tela: `TabFamilias` vira `FamiliasDeMaterial.js` (props: rotas da API, `podeGravar`, aviso, link do item); Almoxarifado sempre só consulta (RN-211.03); `FamiliasCompras.js` + rota `/compras/familias` + item de menu; testes da tela movidos para o Compras + o de consulta do almoxarifado | galho (contrato acima) | — |
| T3 | Integração pela rota: família criada pelo Compras → material criado pelo Compras nela → aparece na lista e nos itens da família pelo Almoxarifado; e pelo Almoxarifado a gravação recusa | integração | — |
| T4 | Fechamento (`fechar-etapa`), manual, novidades, fila do Compras | — | — |

## Fora (declarado)

- Categorias e Tipos de Material continuam no Almoxarifado — são a linha 2 da fila (estimativa própria).
- "Adicionar item" a partir da família no Compras não volta (saiu na 193); o material novo é criado em Compras → Materiais.
- Famílias do Comercial (`/api/familias`, produtos da proposta) são outra coisa e não mudam.
