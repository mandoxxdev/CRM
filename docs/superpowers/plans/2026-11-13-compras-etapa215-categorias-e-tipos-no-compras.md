# Etapa 215 (Compras) — Categorias e Tipos de Material cadastrados no Compras

> Regra permanente (CLAUDE.md, 12/11/2026): cadastro é do Compras; o Almoxarifado só movimenta. Estimativa
> `docs/estimativas/2026-11/estimativa_2026-11-12_cadastros-so-no-compras.md`, item 2 (3h). Fila do Compras, linha 2. Molde: Etapa 211.

## Medido antes (Fase 0)

- **Categorias** (`server/routes/almoxarifado/extended.js:220-305`): `GET /api/almoxarifado/categorias` (`?todos=1` traz as
  inativas), `POST`, `PUT /:id` (renomear; `{ativo:1}` reativa), `DELETE /:id` (desativa). Gravação: `requirePermission('configurar')`.
  O Compras já lê pela `GET /api/compras/materiais/aux/categorias` (`portaCompras.leitura`, Etapa 192).
- **Tipos de Material** (`server/routes/almoxarifado.js:2317-2395`): `GET/POST/PUT/DELETE /api/almoxarifado/tipos-material[/:id]`;
  gravação `denyUnlessAlmoxAdmin`. Nenhuma leitura pelo Compras.
- Tela: `TabTiposMaterial` (`ConfiguracoesAlmoxarifado.js:329`, já com `podeGravar` e a frase `FRASES_CONFIG.tipos`) e
  `TabCategorias` (`:525`, sem modo consulta). Consumidores de leitura (material, conferência, filtros) não mudam.

## Regras de negócio

- **RN-215.01** — Categorias e Tipos de Material são criados, editados, desativados e reativados em **Compras → Categorias** e
  **Compras → Tipos de Material** (telas novas do menu do Compras), com os mesmos gestos, mensagens e regras de hoje. Grava quem
  cadastra material (admin do módulo Compras ou do sistema, `portaCompras.cadastro`).
- **RN-215.02** — Pelo Almoxarifado, gravar (POST, PUT, DELETE) é recusado para todos: 403
  `O cadastro de categorias é feito em Compras → Categorias.` e `O cadastro de tipos de material é feito em Compras → Tipos de Material.`
  — antes do perfil. `ALMOX_CADASTRO_MATERIAL=liberado` devolve as rotas ao que eram.
- **RN-215.03** — Almoxarifado → Configurações → Categorias e → Tipos de Material listam **só para consulta**, para todos, com a
  frase respectiva (a mesma literal do 403) e sem Nova/Renomear/Editar/Desativar/Excluir/Reativar.
- **RN-215.04** — Quem tem o módulo Compras mas não o administra vê nas duas telas só o aviso
  `Seu acesso não permite cadastrar categorias e tipos de material. Peça a um administrador do sistema para marcar você como administrador do módulo Compras.`

## Contratos (congelados)

| Método e caminho | Porta | Corpo / resposta |
|---|---|---|
| `GET /api/compras/materiais/aux/categorias[?todos=1]` | `portaCompras.leitura` | já existe — o mesmo array |
| `POST /api/compras/materiais/categorias` | `portaCompras.cadastro` | o mesmo handler do POST do almoxarifado (201 `{id,nome,ativo}`; 400 `Nome é obrigatório`, `Já existe uma categoria com este nome`) |
| `PUT /api/compras/materiais/categorias/:id` | idem | idem (404 `Categoria não encontrada`) |
| `DELETE /api/compras/materiais/categorias/:id` | idem | idem |
| `GET /api/compras/materiais/aux/tipos-material` | `portaCompras.leitura` | o mesmo array do almoxarifado (só ativos) |
| `POST /api/compras/materiais/tipos-material` | `portaCompras.cadastro` | o mesmo handler (201 a linha; 400 `Nome obrigatório`) |
| `PUT /api/compras/materiais/tipos-material/:id` | idem | idem (404 `Tipo de material não encontrado`) |
| `DELETE /api/compras/materiais/tipos-material/:id` | idem | idem |

Recusa da porta do Compras: 403 `{ error: 'Sem permissão para esta operação', acao, perfil }` (de `exigir`).

**Tela (contrato da T2):** componentes `CategoriasDeMaterial.js` e `TiposDeMaterial.js` (em `components/almoxarifado/`, como
`FamiliasDeMaterial`), props `rotas` (`{ lista, criar, item(id) }`), `podeGravar`, `aviso`. Rotas do Almoxarifado e do Compras exportadas
dos próprios arquivos. Páginas `components/compras/CategoriasCompras.js` (`/compras/categorias`) e `TiposMaterialCompras.js`
(`/compras/tipos-material`), no molde de `FamiliasCompras.js` (permissões por `ROTAS_COMPRAS.api.permissoes`).

## Tasks

| # | Task | Tipo | Estado |
|---|---|---|---|
| T1 | Servidor: handlers nomeados; recusa no Almoxarifado; rotas do Compras; teste `categoriasETiposNoCompras.api.test.js` com controle positivo; chave nos testes antigos que gravam pelo almoxarifado | tronco | feita `79a24f48` (7/7; sabotagens: sem a recusa no POST de categoria e no DELETE de tipo, sem a porta no POST de tipo e na leitura de tipos — vermelhos; trocar a porta de cadastro pela de leitura não derruba nada, as duas aceitam as mesmas pessoas) |
| T2 | Tela: extrair as duas abas; Almoxarifado só consulta; duas páginas do Compras, rotas e menu; testes | galho (contrato acima) | feita `1cec6bc2`, em paralelo por agente (Compras 4/4 + 4/4; 5 sabotagens vermelhas) |
| T3 | Integração pela rota: categoria criada pelo Compras aparece na leitura do Almoxarifado e do Compras; gravação pelo Almoxarifado recusada | integração | feita em `79a24f48` (cenário [RN-215.01 integracao]) |
| T4 | Fechamento | — | feito |

## Execução (2026-11-13)

- Servidor e tela em paralelo (tela por agente, contra o contrato congelado), sem retrabalho. Os testes antigos que gravavam pelo
  almoxarifado já tinham a chave desde a 211.
- Fase 2 e Fase 5 não despachadas: mesmo molde da 211, cuja revisão não achou nada grave nas portas; registrado como divergência.
- **Verificação (medida):** `test:api` 609/609, `test:almoxarifado` 44/0, validation 4/0, safealter 3/0, sqlite 16/0; **tela inteira
  222/222 suítes, 2986/2986 testes**; build OK.

## Retro (4 números)

- Rodadas de correção até verde: 1 (auditoria lida da tabela errada no teste novo). Achados: sem revisão. Paralelismo: 1 galho (tela)
  em paralelo ao tronco, sem retrabalho. Defeito que escapou da 211: nenhum até aqui.

## Próxima tarefa detalhada

Fila do Compras, linha 3: **Tipo de Material escolhido de uma lista** no formulário de material (estimativa revisada para 2h30).
A lista vem de `GET /api/compras/materiais/aux/tipos-material` (Compras) ou `/almoxarifado/tipos-material`. **Ponto de atenção medido:**
a restrição de endereço (`stockService.motivoRecusaEndereco`) compara `material.tipo_material` por igualdade exata com as chaves de
`TIPOS_MATERIAL_ENUM` (`consumivel`, `epi`…), e o cadastro de tipos tem nomes (`Consumível`, `EPI`…): a comparação precisa ser
normalizada (sem acento, sem caixa, espaço = `_`), senão escolher da lista quebra a restrição. O valor antigo que não está na lista
aparece como opção, para não sumir.
