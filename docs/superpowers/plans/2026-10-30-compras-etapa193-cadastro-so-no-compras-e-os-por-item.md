# Etapa 193 (Compras) — cadastro de material só no Compras; OS por item do pedido

> Status: **em execução** (2026-10-30). Estimativa: `docs/estimativas/2026-10/estimativa_2026-10-30_compras-unico-cadastro-e-os-por-item.md` (`ae1c519f`).

Pedido do André (30/10), depois da Etapa 192:
- *"7 - Apenas compras cadastra materiais, almoxarifado só visualiza e libera. Então vamos retirar a tela de cadastro de materiais do
  almoxarifado e apenas o compras fará isso."*
- *"8 - como sugestão, podemos incluir manualmente em cada item, pois teremos as informações da OS na liberação do material. Precisamos
  da informação no pedido, apenas para justificar a compra"* — **substitui** o plano de 25 h
  (`2026-10-30-compras-varias-os-no-pedido-planejamento.md`, que fica como histórico): sem reserva por OS no recebimento, não toca o
  almoxarifado (pausado).

## Diagnóstico (medido)

- Cadastro no Almoxarifado: `MateriaisAlmoxarifado.js` (Novo `:238`, Editar `:433`, Inativar `:139` DELETE, Reativar `:153` PUT `ativo:1`),
  `MaterialAlmoxarifadoForm.js` (foto `:587`), atalhos em `AlmoxarifadoDashboard.js:227/238` e `ConfiguracoesAlmoxarifado.js:723/866/925`.
  Rotas: `POST/PUT/DELETE /api/almoxarifado/materiais`, `POST /materiais/:id/foto` (`routes/almoxarifado.js:656/1032/1064/1146`).
- **O Almoxarifado cria material na operação** — `SobrasAlmoxarifado.js:320` (retalho) e `RemessasTerceirosAlmoxarifado.js:314` —
  pelo mesmo `POST /api/almoxarifado/materiais`. Esses fluxos **ficam**: não são o "cadastro" que o André tirou.
- Compras (Etapa 192): `/api/compras/materiais/cadastro*` com gate `services/compras/cadastroDeMaterial.js` (admin do módulo Compras **ou**
  Almoxarife/Engenharia/Administrador do almoxarifado), handler roda como perfil COMPRAS (X1), sem foto, sem inativar (`ativo` → 400),
  Proprietário só leitura (X6).
- Pedido: `itens_pedido_compra` (em `services/almoxarifado/schema.js`), cabeçalho com `os_id`/`os_texto` (171, 192).

## Regras de negócio

### Cadastro só no Compras (pedido 7)
- **RN-193.01** — **Almoxarifado → Materiais** só consulta: sem *Novo Material*, *Editar*, *Inativar*, *Reativar* nem foto. Cada linha tem
  **Ver**, que abre a ficha do material **só para leitura** (o mesmo formulário com tudo desligado e sem *Salvar*, ou uma ficha de leitura —
  o executor escolhe e justifica). `/almoxarifado/materiais/novo` não cadastra (leva à lista com o aviso). Os atalhos de novo material do
  painel e das configurações do Almoxarifado saem; o lápis de material nas configurações vira **Ver**. Um aviso na lista: *"O cadastro de
  materiais é feito em Compras → Materiais."*
- **RN-193.02** — o servidor também decide (CLAUDE.md): `PUT /api/almoxarifado/materiais/:id`, `DELETE /api/almoxarifado/materiais/:id` e
  `POST /api/almoxarifado/materiais/:id/foto` recusam com **403 `O cadastro de material é feito em Compras → Materiais.`** O
  `POST /api/almoxarifado/materiais` **continua** (sobra/retalho e remessa para terceiros criam material na operação). Se a recusa no
  servidor quebrar muitos testes antigos que usam essas rotas só como preparação de cenário, o executor ajusta os testes (preparação direto
  no banco/serviço); se for inviável, declara e deixa só a tela (letra B).
- **RN-193.03** — **só o Compras cadastra**: o gate das rotas `/api/compras/materiais/cadastro*` passa a aceitar só o **administrador do
  módulo Compras** (`isModuleAdmin(user,'compras')`) e os administradores do sistema (superadmin / admin). Almoxarife, Engenharia e o
  Administrador **do almoxarifado** deixam de entrar (decisão B, reversível). Aviso de sem acesso atualizado (sem citar perfis do
  almoxarifado).
- **RN-193.04** — o Compras ganha **foto** (`POST /api/compras/materiais/cadastro/:id/foto`, mesmo handler) e **inativar/reativar**
  (`DELETE /api/compras/materiais/cadastro/:id` inativa com as mesmas regras e mensagens do Almoxarifado; reativar pelo PUT com `ativo: 1`
  ou rota equivalente — a recusa *"Inativar ou reativar material é feito no Almoxarifado."* sai). A lista do Compras mostra inativos com
  filtro e os botões Inativar/Reativar; o formulário mostra a foto.
- **RN-193.05** — **Proprietário**: medir se o dono do material só se define no cadastro. Se sim, o formulário do Compras volta a ter o
  campo (lista de clientes pela rota que o usuário alcança, ou uma leitura mínima `id, razão social` no Compras sob o mesmo gate); se não,
  continua só leitura. Registrar a escolha.
- **RN-193.06** — continua valendo B72 (X1): pelo Compras **não** se lança saldo inicial nem se liga lote/série em material com saldo
  (isso é estoque). Consequência a declarar (letra C): com o Almoxarifado só consultando, ligar lote/série num material que já tem saldo
  fica sem tela — medir se é isso e declarar.

### OS por item (pedido 8)
- **RN-193.07** — coluna nova `itens_pedido_compra.os_texto` (TEXT, até 60). Cada item do pedido tem um campo **OS** (texto, opcional),
  com sugestões das OS cadastradas (lista que o formulário já carrega), mas aceita qualquer texto. Acima de 60 → **400 `OS do item: no
  máximo 60 caracteres.`** (com o índice do item se o padrão de mensagens do item fizer isso).
- **RN-193.08** — a OS do item é **só justificativa**: não reserva material, não entra no recebimento, no encerramento nem na exclusão de
  OS. A OS do **cabeçalho** (lista ou digitada, 171/192) continua como está.
- **RN-193.09** — aparece no documento impresso (coluna **OS** nos itens, só quando algum item tem OS), no Excel exportado e na edição; a
  busca da lista acha pela OS do item. Pedido que nasce de cotação ou da Reposição: itens sem OS. Importação por planilha: medir e decidir
  (ler a coluna "OS" se a planilha tiver; senão, declarar).

## Tasks (galhos em worktrees)

| Task | Itens | Onde | Estado |
|---|---|---|---|
| K1 | RN-193.01–06 | `CRM-wt-193k` | — |
| O1 | RN-193.07–09 | `CRM-wt-193o` | — |
| I1 | integração: admin do Compras cadastra e põe foto; Almoxarifado só lê (PUT 403); pedido com 2 itens de OS diferentes → documento com as duas | `main` | — |
