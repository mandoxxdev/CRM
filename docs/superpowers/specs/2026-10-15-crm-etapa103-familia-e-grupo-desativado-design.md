# Etapa 103 — família que muda de nível com materiais, e grupo de fornecedores desativado (design)

> Frente **Compras (core)** + uma rota do almoxarifado (G10b). Origem: as três candidatas que a Etapa 100
> mediu e deixou na seção "Próxima de Compras" do plano dela
> (`docs/superpowers/plans/2026-10-15-crm-etapa100-dividas-de-compras.md`). Base: `main` `ab400bbd`,
> worktree `CRM-wt-e103`, branch `etapa-e103`. G15 fica fora (depende do P.O.).

## Fase 0 — o que a medição achou (antes de prometer)

Medido por sonda executada contra o harness real (`tests/helpers/testApp.js`, rotas de produção), não
por leitura.

| Candidata | O plano da 100 dizia | Medido no código / pela sonda | Decisão |
|---|---|---|---|
| **G10b** raiz com material vira sub | `PUT /familias/:id` com `parent_id` em família com materiais recria o legado do G10 | **Confirmado**: raiz com material ativo → `parent_id` = outra raiz → **200**; o material fica com `familia_id` = (agora) subfamília. Com material só **inativo** → também 200 | Recusar (RN-103.01) |
| **G10b** — mais dois casos que a frase não nomeava | — | Subfamília **com material** trocando de família principal → **200**, e o material fica com `familia_id` = raiz antiga e `subfamilia_id` = sub que agora é filha de outra (o filtro pela raiz nova não o acha). Subfamília com material virando **raiz** (`parent_id: null`) → **200**, e o material fica com `subfamilia_id` apontando para uma raiz | Recusar também (RN-103.01): a regra é "família com material não muda de nível", não só "raiz não vira sub" |
| **G10b** dois níveis | "medir: família que já tem subfamílias recebendo parent_id" | Com subfamília **ativa** → **já recusa** (400 `Família com subfamília(s) ativa(s) não pode virar subfamília`, desde a Etapa 2). Com subfamília só **inativa** → **200**; reativar depois a sub (`PUT {ativo: 1}`, pai preservado não é revalidado) → **200** e o banco fica com **três níveis** (sub → sub → raiz), o que a regra "máximo 2 níveis" proíbe | Recusar (RN-103.02) |
| **G10b** sem material | — | raiz sem material e sem filhas → sub: 200; sub com material renomeada (sem `parent_id` ou com o mesmo) → 200 | Inalterado (metade positiva) |
| Tela das famílias | — | `ConfiguracoesAlmoxarifado.js` **nunca** manda `parent_id` no `PUT` (RN-37.03); o manual diz "mover subfamília / transformar em subfamília — só pela API" | G10b é **só servidor**; nenhuma tela muda |
| **Reativar grupo** | "hoje só desativa — medir como e onde" | `DELETE /api/compras/grupos/:id` é soft (`ativo = 0`). Não existe rota de reativação; `GET /compras/grupos` e `GET /compras/grupos/:id` filtram `ativo = 1` (o segundo responde **404** para o desativado). `PUT /grupos/:id` não lê nem escreve `ativo`. Tela: `GruposFornecedores.js` lista só ativos; o modal só tem "Remover grupo" | Rota nova `POST /grupos/:id/reativar` + `?incluir_inativos=1` nos dois GET (padrão inalterado) + seção "grupos desativados" na tela |
| **`FornecedoresDoGrupo` por URL de grupo desativado** | "hoje vincula fornecedor a grupo desativado" | **Confirmado.** A tela pede `GET /compras/grupos/:id` (404 → título "Grupo", sem aviso) e "Vincular" / "Novo fornecedor" mandam `PUT`/`POST /compras/fornecedores` com `grupo_id` = o da URL. As portas que respondem (`routes/compras/fornecedores.js`, Etapa 34 — as de `routes/compras.js` são **sombreadas**, B18) gravam `grupo_id` **sem validar existência nem `ativo`** (comentário do arquivo: "como sempre foi"). Id de grupo **inexistente** também grava | Servidor recusa grupo inexistente ou desativado quando o valor é **novo**; tela mostra o estado e esconde os botões de vincular |

> **Correção da medição (revisão do plano, M1):** "id de grupo **inexistente** também grava" vale **só no harness**,
> que monta `fornecedores` sem a FK. Em produção a coluna é `grupo_id INTEGER REFERENCES grupos_compras(id)`
> (`ALTERS_FORNECEDORES`) com `foreign_keys = ON` (`sqliteConcurrency.js`): ali o `POST` com grupo inexistente dava
> **500** (FOREIGN KEY constraint failed), e um `PUT` que **regravava** um `grupo_id` órfão com ele mesmo também
> falhava. Por isso o `PUT` novo não põe o grupo igual no `SET` — provado em `comprasGrupoDesativado.api.test.js`
> sobre a DDL de produção com a FK ligada.

## Decisões (letra B de `docs/compras-novidades-por-etapa.md`, B49–B52)

**Numeração:** o doc de Compras tem série própria (B1–B48; a Etapa 100 usou B45–B48, números que no doc do
almoxarifado já eram de outras decisões). A série **não é compartilhada** na prática; continuo B49+ no doc de
Compras. A Etapa 102 (em paralelo) escreve no doc do almoxarifado, na faixa B53x — sem colisão de arquivo nem
de faixa.

- **B49 (G10b)** Família com material (qualquer `ativo`, por `familia_id` **ou** `subfamilia_id`) não muda de
  nível pelo `PUT`: raiz→sub, sub→outra raiz e sub→raiz são recusados. **Descartado:** mover os materiais
  junto (`UPDATE materiais SET familia_id = …` em cascata — muda dado de muitos itens calado e não tem volta
  pela tela); contar só materiais ativos como o `DELETE` (o inativo reativado viraria o legado do G10).
- **B50 (G10b, dois níveis)** Raiz com subfamília **inativa** não vira subfamília. **Descartado:** permitir e
  revalidar o pai na reativação da sub (deixa o banco num estado proibido esperando alguém reativar).
- **B51 (reativar)** Rota própria `POST /api/compras/grupos/:id/reativar` e `?incluir_inativos=1` opcional nos
  dois GET. **Descartado:** `ativo` no `PUT /grupos/:id` (o PUT exige nome e é o do modal de edição — misturaria
  editar e reativar); devolver inativos por padrão (B46 já descartou: muda as três telas que consomem a lista).
- **B52 (vincular)** O servidor recusa `grupo_id` de grupo inexistente ou desativado **só quando o valor muda**;
  repetir o gravado (fornecedor que já está num grupo desativado, ou o modal de edição dentro da tela do grupo)
  continua 200. **Descartado:** recusar sempre (travaria salvar a ficha do fornecedor de grupo desativado —
  contra B45/B46). **Muda o contrato da Etapa 34** ("inteiro grava sem validar existência").
