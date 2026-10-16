# Almoxarifado — Etapa 130: o item que entrou não muda pela nota, e as leituras de usuário (design)

> Origem: "Próxima tarefa detalhada — Etapa 130" do plano da 129
> (`docs/superpowers/plans/2026-10-16-almoxarifado-etapa129-a-conferencia-depois-da-entrada-e-as-perdas-com-valor.md`). Worktree
> `CRM-wt-e130`, branch `etapa-e130` (a partir da main `44bcefac`). Plano:
> `docs/superpowers/plans/2026-10-16-almoxarifado-etapa130-o-item-que-entrou-e-as-leituras-de-usuario.md`.

## Fase 0 — o que foi medido

### (1) C267 pela rota real — sonda `server/tests/sonda/e130fase0.js` (não versionada, sob a trava de máquina)

Material A com controle de lote **e** de série; nota com A (2) e B (1); fluxo até *Em entrada de NF*; `/fiscal` com lote `L-ORIG`,
validade `2027-01-31`, corrida `C1`, séries `S1/S2`, valor unitário 10; B conferido 0; `/processar` → A entra (lote 1 `L-ORIG`, séries
S1/S2 com `recebimento_item_id`, custo médio 10). O status volta a `EM_ENTRADA_NF` por SQL (a nota parcial — o processamento que falha
no meio deixa esse estado).

| Passo | Medido |
|---|---|
| `/fiscal` com o **eco** de todos os campos de todos os itens (o que a tela manda, lido do `GET /recebimentos/:id`) | 200 |
| `/fiscal` com lote `L-NOVO`, validade `2028-12-31`, corrida `C9`, séries `S8/S9`, unitário 99, total 198, ICMS 7 no item A | **200**; o item passa a dizer `L-NOVO`/`S8,S9`/99/198/7 |
| `lotes_almoxarifado` / `series_almoxarifado` / custo médio | continuam `L-ORIG` 2027-01-31 C1 / S1, S2 / **10** |
| `GET /compras/contexto-material/:id` (o painel do comprador) | `ultimo_custo_entrada.valor` = **99** — o custo que o estoque nunca absorveu |
| "Regularizar séries" para trocar S1 por S7 (baixar, cadastrar, os dois numa chamada) | **400** nos três (*"baixe no maximo 0"* / *"cadastre no maximo 0"*): o gesto é de acerto de inventário (físico × presentes), **não** corrige número de série errado |
| Estorno da entrada (`POST /movimentacoes/:id/cancelar`, `ajustar_estoque`) + **Entrada** manual (`/movimentacoes/v2`, lote `L-NOVO`, séries S8/S9) | 200 / 201: S1, S2 `ESTORNADA`; S8, S9 `EM_ESTOQUE` no lote novo; físico 2. **É o caminho que existe** para lote/série digitados errado |

Detalhe medido de passagem: o `valor_total` do item ficou **0** com o unitário 10 — o `/fiscal` sem `valor_total` calcula `qtd × unit`
com a quantidade do payload, que não veio (`NaN || esperada(ausente) || 0`), e `0 || null` mantém o gravado. Consequência para o eco: o
0 do `valor_total` e do `valor_unitario` tem de valer "não informado" (é a régua do próprio comando: `parseFloat(x) || null`).

### (2) Quem lê o item depois da entrada (varredura em `server/services` e `server/routes`, não versionado)

| Campo do item | Quem lê **depois** da entrada |
|---|---|
| `valor_unitario` | o motor **na** entrada (`custo_unitario` → custo médio; o estorno não reverte custo — decisão da Etapa 1) e, **depois**, `purchaseService.contextoMaterial` (`ultimo_custo_entrada`, o par movimentação × item, `ri.valor_unitario > 0`) |
| `valor_total` | ninguém no servidor (só a tela, para mostrar); é `qtd × unit` do mesmo item |
| `valor_icms`, `valor_ipi`, `reducao_icms_percent` | ninguém (só a tela) |
| `gerarContaPagar` | lê o **cabeçalho** (`valor_total_nota`), não o item — fora desta etapa |
| `lote` (texto) | a não conformidade de inspeção (`resolverLoteDaInspecao`): `lote_id` primeiro, o **texto** como reserva quando o `lote_id` falta — com o texto trocado, a devolução/sucata do reprovado debitaria **outro** lote do mesmo código |
| `data_validade_lote`, `data_fabricacao_lote`, `corrida_lote` | ninguém depois da entrada (o lote guarda os seus) — mas o documento passa a contradizer o lote |
| `series` (texto) | ninguém depois da entrada (as séries vivem em `series_almoxarifado` com `recebimento_item_id`) — o documento passa a contradizer o livro |
| `returnService` (devolução) | lê a movimentação (`mv.lote_id`), não o item |
| *(Fase 2, M5)* `client/src/utils/etiquetasPdf.js` (*Imprimir etiquetas*, em `PROCESSADO`/`APROVADO`) | lê `lote`, `data_validade_lote` e `series` do **item** — a etiqueta sai com o que o documento diz |

### (3) Quem chama o `/fiscal` com item já entrado — instrumentação da suíte inteira

Um `require` temporário de `scratchpad/e130/instr.js` logo depois de `assertQuantidadeDoItemEntradoIntacta`, logando por item entrado
os campos do payload e as diferenças pela normalização candidata; `test:api` inteira **uma vez** (**435/435** com o log); arquivo
restaurado por cópia (md5 `26e16a9c…` antes e depois). **3 chamadas**, todas em `conferenciaDepoisDaEntrada.api.test.js`: **2 ecos** (o
RN-09 da 129) e **1** que muda o valor (`[RN-09 F5 r3-C5]`: "item entrado sem quantidade no payload (só o valor) passa 200") — **muda à
vista**. `recebimentoChegouZero` não manda item entrado ao `/fiscal`. **Nenhum** teste exercita o eco de lote/série/datas de item entrado
— a etapa escreve esses cenários.

### (4) As leituras de usuário (B836) — agente de exploração, só leitura

`requireManageUsers` = `canManageUsers` = super administrador **ou** `role = 'admin'` (o administrador de módulo e o perfil
Administrador do almoxarifado **não** passam). Chamadores no client:

| # | Onde | Rota | Quem chega | Campos lidos |
|---|---|---|---|---|
| 1 | `Usuarios.js` (aba de Admin) | lista | administrador do sistema | tudo (role, is_superadmin, admin_modulos, grupos, modulos, created_at…) |
| 2 | `Permissoes.js` (aba de Admin) | lista | administrador do sistema | id, nome, email |
| 3 | `ConfiguracoesAlmoxarifado.js` `TabLiberacaoValor` | lista | quem configura o almoxarifado (inclui admin de módulo e perfil Administrador) | id, nome, email, ativo |
| 4 | `TabRegrasAprovacao.js` | lista | quem grava a config do almoxarifado (admin de módulo, perfil Administrador, super) | id, nome, email, ativo |
| 5 | `UsuarioForm.js` | `/:id` | administrador do sistema (redireciona os outros) | os campos do cadastro |
| 6 | `UsuarioForm.js` | `/:id/grupos` | administrador do sistema | grupos, permissões |
| 7 | `permissionsCache.js` | `/:id/grupos` | **todo usuário**, com o **próprio** id | permissões, grupos, `usuario.{role, is_superadmin, admin_modulos, perfil_*}` |

Nenhum teste de servidor chama as três rotas; os testes do client que as tocam usam mock (`ConfiguracoesSomenteLeitura`,
`TabRegrasAprovacao`, `UsuarioForm.modulos`, `permissionsCacheOuvinte`, `AuthContextPerfil*`).

## Decisões

1. **Lote e séries do item entrado só aceitam o eco** (B838). O lote, a validade, a fabricação, a corrida e as séries foram gravados no
   estoque **na** entrada; mudar o texto do item faz o documento contradizer o lote e o livro — e o texto do lote é a reserva da
   devolução do reprovado. Recusa 409 com a literal **L8**, que diz o caminho medido (estornar a entrada + nova Entrada).
   **Descartado:** propagar a mudança para o lote/séries reais (é um "editar lote" que não existe e mexeria em saldo de lote e em
   séries já entregues); aceitar e declarar (o documento mente).
2. **Valor unitário e total do item entrado só aceitam o eco; ICMS, IPI e redução continuam aceitos** (B839). Pela medição: o unitário
   alimentou o custo médio na entrada **e** é lido depois (o *último custo de entrada* do painel de Compras) → recusa (L9); o total é
   `qtd × unit` do mesmo item — aceitá-lo com o unitário congelado deixaria o documento contradizer a si mesmo → recusa junto; ICMS, IPI
   e redução **ninguém lê** depois da entrada → aceitos, declarado em D. O 0, o vazio e o ilegível no unitário/total valem "não
   informado" (a régua do comando). **Descartado:** recusar os cinco (o ICMS da linha não move nada medido); aceitar os cinco (o
   comprador veria um custo que o estoque não tem).
3. **A comparação do eco normaliza** — texto por `trim` (NULL = vazio); datas pelos 10 primeiros caracteres `AAAA-MM-DD` (e
   `DD/MM/AAAA` convertido); séries como **conjunto** (texto uma por linha, texto JSON de lista ou lista; `trim`, sem vazias, ordem não
   importa); números com folga de 1e-6 (NULL = 0). Campo ausente (`undefined`/`null`) não é mudança (o `COALESCE` mantém).
4. **A defesa no comando** — as sete colunas (`lote`, `data_validade_lote`, `data_fabricacao_lote`, `corrida_lote`, `series`,
   `valor_unitario`, `valor_total`) ganham o `CASE WHEN entrada_estoque_em IS NULL THEN COALESCE(?, col) ELSE col END` que a
   quantidade já tem (RN-09 da 129): o item que ganha a entrada entre a guarda e o `UPDATE` mantém o que entrou.
5. **A tela trava os campos do item que já entrou** (B840) — no painel de detalhe (Faturamento), o item com `entrada_estoque_em` mostra
   *Vlr. unit.*, *Lote*, *Validade*, *Fabricação*, *Corrida* e *Séries* desabilitados, com a frase *"Já deu entrada no estoque — lote,
   séries e valor unitário não mudam mais por aqui."* O ICMS e a redução continuam editáveis. Sem isso, a pessoa editaria, salvaria e
   perderia o modal inteiro numa recusa.
6. **As leituras de usuário (núcleo, B841)** — `GET /api/usuarios/:id` e `/:id/grupos`: só o **próprio** usuário ou quem gerencia
   usuários (`canManageUsers`); os outros, 403 com a literal **L10**, antes de ler o banco (não diz se o id existe). `GET /api/usuarios`
   (a lista): quem gerencia recebe tudo, como hoje; os outros recebem só `id`, `nome`, `email` e `ativo` — o que as duas abas do
   almoxarifado leem (#3 e #4). As três rotas saem do `index.js` para `services/leituraDeUsuarios.js` (registradas no mesmo ponto, depois
   de `/usuarios/comercial`, `/filtrar` e `/por-modulo`), junto com `getUsuarioModuleContext`, para que o teste rode as rotas de verdade.
   **Descartado:** 403 na lista (quebraria as duas abas do almoxarifado para o administrador do módulo); projeção maior (setor, cargo,
   departamento — nenhum chamador lê); filtrar ocultos (`is_oculto`) — muda o que as abas mostram, fica declarado.

## Literais

- **L8** = `Item já deu entrada no estoque — o lote e as séries dele ficaram registrados no estoque com o que a nota tinha na entrada e não mudam mais pela nota; para corrigir o estoque, o Administrador do almoxarifado estorna a entrada e dá a entrada de novo (o documento da nota continua como entrou, e o pedido de compra e a reserva de quem esperava voltam a esperar)`
- **L9** = `Item já deu entrada no estoque — o valor unitário e o total dele não mudam mais: a entrada no estoque já foi feita com o valor que a nota tinha`
- **L10** = `Acesso negado — apenas o próprio usuário ou administradores do sistema`

## Fora (depende do P.O.)

B808, B755, B761/C239, C224, o resto da C225, C228, C219, C230, o reparo da C246/C247, a tabela de conversões, o grupo acima de família,
a régua E2, a C268 (o custo é sigiloso?); na 05, os itens de produto e a C198; na 06, a B11 e a Engenharia; na 21, a valorização por
cliente e previsto × realizado; na 22, B13, B101/G30, G38.
