# Etapa 109 — corrida do vínculo a grupo desativado (B52) e a lista de módulos numa fonte só (G7) — design

> Frente **Compras/core**, worktree `CRM-wt-e109`, branch `etapa-e109` (de `main` `019fc244`). Feita em paralelo com a
> Etapa 108 do almoxarifado (troca do dono/cliente de material — formulário e rotas de material), por isso esta etapa
> **não** toca `materialService.js` nem as rotas de material (ver a corrida da família, abaixo).
> Plano: `docs/superpowers/plans/2026-10-15-crm-etapa109-corrida-do-grupo-e-lista-de-modulos.md`.

## Fase 0 — o que foi medido

### B52 — vincular fornecedor x "Remover grupo" no mesmo instante
`routes/compras/fornecedores.js` (as portas que respondem; as de `routes/compras.js` são sombreadas — B18) confere o
grupo com `SELECT ativo FROM grupos_compras` e grava o fornecedor num **segundo** comando. `DELETE /api/compras/grupos/:id`
é um `UPDATE … SET ativo = 0` só. Sonda (`createTestApp`, duas requisições HTTP disparadas juntas, 30 rodadas por caso):

| Caso | Vínculo gravado **depois** do `ativo = 0` |
|---|---|
| POST, o vínculo sai primeiro | **30 de 30** |
| POST, a desativação sai primeiro | 1 de 30 |
| PUT, nas duas ordens | 0 de 30 — o PUT lê o fornecedor antes do grupo, e essa leitura a mais deixa a desativação passar na frente; a janela existe (provada por injeção determinística no teste) |

**O que a medição mostrou de diferente do B52.** O B52 dizia que a corrida "ainda deixa vínculo novo em grupo
desativado". É verdade, mas o **estado** que ela deixa é o mesmo de "vincular um instante antes e desativar depois" — e
desativar **não** desvincula (B45). O "Remover grupo" não lê fornecedor nenhum, então a história é serializável: não existe
estado proibido no banco. O que a corrida quebra é a **ordem**: o vínculo é gravado depois de o "Remover grupo" já ter
respondido "Grupo desativado". É isso que a etapa fecha (a gravação condicional faz a conferência e a gravação serem o mesmo
comando). Ver B59.

### "B54" do plano da 107 — inativar família x cadastrar material no mesmo instante (só medido)
O plano da 107 junta a esta a corrida da família (que ele chama de B54; a B54 do documento de novidades é outra coisa — a
literal do PUT). Sonda: `POST /api/almoxarifado/materiais` numa família x `DELETE /api/almoxarifado/familias/:id`,
30 rodadas por ordem → **30 de 30 nas duas ordens** terminam com **família inativa e material ativo dentro dela**. Aqui o
estado **é** proibido (o "Inativar" recusa família com material ativo; o cadastro recusa família inativa) — é *write skew*
de verdade, mais grave que o B52. **Não corrigido nesta etapa:** fechar exige mexer nos dois lados (o `INSERT` de
`materialService.createMaterial`, o `PUT` de material que troca de família, e o `DELETE`/`PUT` de família), e o lado do
material é a área da Etapa 108 em paralelo. Fica como a primeira candidata da próxima (B61).

### G7 — a lista de módulos
O G7 dizia "a lista de módulos existe em **quatro** lugares". **Estava errado:** a varredura (subagente, termos
`engenharia_projetos`, `'todolist'`, `'relatorios'`, `todosModulos`, `MODULE_LABELS`, `nomesModulos`, os nomes das
constantes) achou **15** listas com chaves de módulo. As cinco que são "a lista de módulos" de verdade (chave + nome, e
alguém decide algo por ela):

| Lista | Chaves | Quem lê |
|---|---|---|
| A `client/src/constants/modulosMeta.js` (`MODULOS_META` + `MODULOS_ORDEM`) | 11 | badges do rodapé do menu e da lista de usuários (`modulosDoUsuario`), nível de acesso, barra de módulos de Configurações |
| B `TipoSelecao.todosModulos` | 11 (outra ordem) | os cartões da tela de seleção de módulos |
| C `UsuarioForm.todosModulos` (**a quinta, que o G7 não citava**) | **12** (+ `relatorios`) | os cartões "Módulos de Acesso" do cadastro de usuário — é quem **grava** `permissoes.modulo` e `admin_modulos` |
| D `MODULE_ADMIN_KEYS` (`server/services/systemPermissions.js`) | 11 (**sem `todolist`**, com `relatorios`) | filtra o `admin_modulos` ao salvar usuário |
| E `DEFAULT_MODULOS_TIPO` (`server/services/modulosTipoConfigService.js`) | 11 (sem `relatorios`) | semeia `modulos_tipo_config`; `GET /api/config/modulos-tipo` |

As outras dez são espelhos parciais com outro propósito (requisição de material por módulo e o link do e-mail de
recebimento, setores semeados, nomes do "acesso negado" no log do servidor, rótulos de carregamento, splash, prefetch,
rotas do `App.js`, menus do `Layout`) — medidas e **fora** desta etapa (G17).

**Divergências entre as cinco e o efeito visível:**
1. **`todolist` falta em `MODULE_ADMIN_KEYS`.** O cadastro de usuário oferece "Administrador do módulo" para TODOLIST;
   ao salvar, o servidor descarta calado — recarregando, o botão volta desligado. Nenhum código pergunta "é admin do
   todolist?", então hoje isso não muda o que ninguém pode fazer. **Mantido** (unificar faria o servidor passar a gravar
   admin de módulo do todolist — mudança de permissão; B60).
2. **`admin`: o servidor aceita admin de módulo, a tela não oferece** (o cartão Admin não tem o botão) — só pela API.
   Mantido (B60).
3. **`relatorios` só existe no cadastro de usuário e no servidor de admin de módulo.** Dá para marcar; grava uma linha
   `permissoes.modulo = 'relatorios'`; nenhuma tela, rota ou checagem usa (não há cartão, nem badge, nem
   `checkModulePermission('relatorios')`). Mantido — tirar mudaria o que o salvar do usuário grava (B60, G17).
4. **Nome de `engenharia`:** "Cálculos de Engenharia" no cartão da seleção, nas badges e na rota; "Engenharia" no cadastro
   de usuário. Unificado para "Cálculos de Engenharia" (B60).
5. Ordem: a seleção de módulos tem ordem própria (comercial, frota, compras, …); badges e cadastro usam a outra. Mantidas
   as duas — é desenho de tela, não divergência de lista.
6. Fora das cinco, para registro: o menu do comercial chama o módulo de `crm` internamente (sem efeito hoje); o acesso sem
   nenhuma linha de permissão cai em "comercial" na seleção, em "comercial **ou frota**" no `hasModuleAccess` do cliente e
   em "comercial, se não estiver em grupo nenhum" no servidor (G17 — é de permissão, não de lista).

**D-36d** (criar `GET /api/modulos` ou reusar `modulosMeta` no cliente): esta etapa **não** cria endpoint — cliente e
servidor continuam com uma fonte cada, e um teste do servidor lê a do cliente e falha se elas divergirem. Reversível; um
endpoint é contrato novo sem consumidor que precise dele (o cliente precisa de ícone e cor, que o servidor não tem).

## Decisões (entregues: B52 `083384ea`, G7 `0c4da131`)
- **B52 → gravação condicional (CAS), não trava em memória.** `INSERT … SELECT … WHERE EXISTS (grupo ativo)` e
  `UPDATE … WHERE id = ? AND EXISTS (grupo ativo)`; a conferência prévia fica (é ela que dá a mensagem no caso comum);
  quando a gravação condicional não grava, a rota relê e responde a mesma literal da 103. Descartado: trava em memória
  (premissa de um processo e mais código; um comando só já é atômico no SQLite), e conferir **depois** de gravar e desfazer
  (deixa o vínculo visível por um instante).
- **G7 servidor:** `server/services/modulosSistema.js` com uma linha por módulo (`tipoPadrao`, `aceitaAdminDeModulo`);
  `MODULE_ADMIN_KEYS` e `DEFAULT_MODULOS_TIPO` derivados, **com os mesmos valores e a mesma ordem** (teste de
  caracterização).
- **G7 cliente:** `modulosMeta.js` passa a ter, por módulo, rota e as duas descrições (a do cartão de seleção e a do
  cadastro de usuário), e as listas `MODULOS_ORDEM_SELECAO`, `MODULOS_CONCEDIVEIS`, `MODULOS_SEM_ADMIN_DE_MODULO_NA_TELA`.
  `TipoSelecao` e `UsuarioForm` derivam dele. Texto visível muda em um ponto só (o rótulo de engenharia no cadastro).
