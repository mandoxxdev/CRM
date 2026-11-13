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
- **RN-211.04** — Quem tem o módulo Compras mas não o administra vê em Compras → Famílias **só o aviso** de quem pode cadastrar
  (**corrigido na Fase 5:** dizia "só para consulta" — a leitura pelo Compras é de quem cadastra, como em Compras → Materiais, então
  não há árvore para mostrar; B88) (`AVISO_SEM_ACESSO`, o mesmo de Compras → Materiais); o servidor recusa as gravações com o 403 de `exigir`.
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
| T1 | Servidor: extrair os 4 handlers; `portaCompras.cadastro`; `recusarFamiliasNoAlmoxarifado` (+ aviso de boot); rotas do Compras; mensagem da RN-211.05; teste `familiasNoCompras.api.test.js` (RN-211.01/02/04/05) com controle positivo; chave ligada nos testes antigos que preparam família pela rota do almoxarifado | tronco | feita `d5f9743b` (`familiasNoCompras` 8/8, depois 9/9 com a camada do módulo; sabotagens na Fase 5) |
| T2 | Tela: `TabFamilias` vira `FamiliasDeMaterial.js` (props: rotas da API, `podeGravar`, aviso, link do item); Almoxarifado sempre só consulta (RN-211.03); `FamiliasCompras.js` + rota `/compras/familias` + item de menu; testes da tela movidos para o Compras + o de consulta do almoxarifado | galho (contrato acima) | feita `d5f9743b` + testes `079b6fb6` (os 32 testes da tela ajustados; `FamiliasCompras.test.js` novo 2/2) |
| T3 | Integração pela rota: família criada pelo Compras → material criado pelo Compras nela → aparece na lista e nos itens da família pelo Almoxarifado; e pelo Almoxarifado a gravação recusa | integração | parcial: o cenário [RN-211.01] dos itens da família pelo Compras (material na sub aparece na sub e na raiz) e o [RN-211.02] da recusa pelo Almoxarifado; o caminho "criar pelo Compras → consultar pelo Almoxarifado" não tem cenário próprio |
| T4 | Fechamento (`fechar-etapa`), manual, novidades, fila do Compras | — | feito |

## Execução (retomada em 2026-11-13)

- Pausada em 12/11 (o cliente pediu fornecedores primeiro, Etapas 212–214); retomada com rebase na `main` sem conflito.
- **Testes da tela:** os de gravar família (`Familias`, `FamiliasEditarLidos`) montam a aba pelas portas do Compras com quem grava; os de
  consulta (`FamiliasSomenteLeitura`, `ConfiguracoesSomenteLeitura`) passam a esperar a frase do Compras para **todos** — o perfil
  Administrador, que via os botões (RN-17 da 125), agora só consulta. As sondas do perfil retirado (Etapas 127 e 128:
  `AuthContextPerfilRetirado`, `AuthContextPerfilSemPiscar`) usavam a aba Famílias, que não mostra mais o perfil: foram para a aba
  **Setores e áreas** (configuração física, fica no Almoxarifado).
- **Controle positivo:** servidor — porta do cadastro sem `exigir`, POST e DELETE do almoxarifado sem a recusa, porta com o módulo errado:
  vermelhos. Tirar o `comoCompras` **não derruba nada**: as rotas de família não leem o perfil (inalcançável; mantido pela uniformidade).
  Tela — a aba do Almoxarifado gravando, o Compras gravando para todos e o aviso da órfã (sem o lugar / sempre com o lugar): vermelhos.
- **Fase 5 (revisor fresco, 4 lentes):** sem achado grave. Aplicados: o aviso da subfamília órfã na aba de consulta diz onde reativar
  (`e03538fc`); a RN-211.04 do plano estava errada (acima); o teste não provava a camada do módulo (cenário novo, `e03538fc`).
- **Verificação (medida):** servidor — `test:api` 607/608 (o que caiu, `listasNotificacoesPortao`, prepara família pela rota do
  almoxarifado: ganhou a chave e passa sozinho, 10/0), `test:almoxarifado` 44/0, validation 4/0, safealter 3/0, sqlite 16/0. Tela — a
  **suíte inteira rodou** (com `--maxWorkers=2`): 2974/2975; o que caiu (`Configuracoes.almoxEmbutido`, usava o botão *Nova Família* como
  marcador da aba) foi ajustado e passa sozinho (2/2). Build OK. As duas suítes inteiras **não** foram repetidas depois dos dois ajustes.

## Retro (4 números)

- Rodadas de correção até verde: 2 (testes da tela; sondas do perfil das 127/128 achadas só na suíte inteira).
- Achados da Fase 5: 3 reais (aviso, RN no plano, teste da camada), 0 ruído.
- Paralelismo: nenhum. Defeito que escapou: — (preencher depois).

## Próxima tarefa detalhada

Fila do Compras, linha 2: **Categorias e Tipos de Material cadastrados no Compras** (estimativa `cadastros-so-no-compras`, item 2, 3h),
no mesmo molde desta etapa: extrair as abas Categorias e Tipos de Material de `ConfiguracoesAlmoxarifado.js` para componentes
compartilhados (props `rotas`, `podeGravar`), rotas `/api/compras/materiais/...` com `portaCompras.cadastro`, recusa no Almoxarifado com
a chave `ALMOX_CADASTRO_MATERIAL`, telas Compras → Categorias e Compras → Tipos de Material (ou uma tela com duas abas). Medir antes:
as rotas de categoria e de tipo (`/api/almoxarifado/categorias`, `/tipos-material`?), quem as lê (o formulário de material lê
categorias por qual rota no Compras?) e os testes da tela que gravam por elas. Depois, linha 3 (Tipo de Material de uma lista).

## Fora (declarado)

- Categorias e Tipos de Material continuam no Almoxarifado — são a linha 2 da fila (estimativa própria).
- "Adicionar item" a partir da família no Compras não volta (saiu na 193); o material novo é criado em Compras → Materiais.
- Famílias do Comercial (`/api/familias`, produtos da proposta) são outra coisa e não mudam.
