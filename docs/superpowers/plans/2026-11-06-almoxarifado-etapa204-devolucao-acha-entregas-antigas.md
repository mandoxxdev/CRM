# Etapa 204 — a Devolução acha as entregas antigas (C465, parte da lista)

> partida: "Próxima tarefa detalhada" de `docs/superpowers/plans/2026-11-06-almoxarifado-etapa203-exclusao-limpa-a-origem.md` (`:178`
> em diante) — conferida contra o código em `74c6cec1`, bate (os números de linha abaixo foram medidos de novo hoje). Item 5 do 2º pacote
> (`docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas-2.txt:20-22`, **2h30**, estimativa já commitada). Escala reduzida
> da `desenvolver-etapa`: uma rota de leitura e uma tela, sem motor de estoque — sem agente de Fase 2; a revisão "passaria com a feature
> quebrada?" é feita pelo executor (molde da 203).

## Objetivo (em linguagem simples)

Na tela **Devoluções**, ao escolher o material, o campo *"Entrega de origem"* lista as entregas de onde aquele material saiu. Hoje ele
mostra só as **30 mais recentes**. Um material que sai todo dia (parafuso, fita, lixa) passa de 30 entregas em poucas semanas — e a entrega
de três semanas atrás, que é justamente a que a pessoa quer devolver, **não aparece**. Sem ela, a pessoa escolhe *"Devolução avulsa"*: o
material volta sem o vínculo, sem limite de quantidade e **sem herdar o lote**. Depois desta etapa, abaixo da lista aparece **"Carregar
entregas mais antigas"**: cada clique traz as 30 anteriores, até a primeira entrega do material.

## Fase 0 — medido em 2026-11-06 (sobre `74c6cec1`)

### A leitura

- Rota: `GET /api/almoxarifado/devolucoes/saidas-elegiveis?material_id=N` (`server/routes/almoxarifado/extended.js:1466-1472`), só `auth`
  (leitura). `Number(material_id)` falsy → 400 `{ error: 'material_id é obrigatório' }`. **Não repassa nenhum outro parâmetro**:
  `returnService.listarSaidasElegiveis(db, materialId)`.
- Serviço: `listarSaidasElegiveis(db, materialId, { limite = 30 } = {})` (`server/services/almoxarifado/returnService.js:498-538`; comentário
  de cabeça `:480-497`, que diz *"As 30 mais recentes: quem devolve devolve o que saiu ha pouco"*). Material inexistente → `erro400('Material
  não encontrado')`. SQL `:504-518`: tipos `TIPOS_SAIDA_DEVOLVIVEL` (`:26`), `COALESCE(mv.cancelado,0) = 0`, `requisicaoNaoExcluidaSql('mv')`
  (`:105`), fora da entrega de EPI; `quantidade_devolvida` pela régua viva (`DEVOLUCAO_VIVA_SQL`) e `quantidade_reentrada` por
  `seriesQueVoltaramSql('mv.id')` — as duas de `devolucaoViva.js`, sem cópia; `ORDER BY mv.created_at DESC, mv.id DESC LIMIT ?` (`:517-518`).
  No JS: `saldo_devolvivel = max(0, round4(quantidade − devolvida − reentrada))` (`:532`) e `series` (as `ENTREGUE` da saída).
- **Ninguém passa `limite`**: o único chamador de produção é a rota (`extended.js:1470`); nos testes, `oQueJaVoltouIntegracao.api.test.js:138`
  chama o serviço sem opções.
- `created_at` é `DATETIME DEFAULT CURRENT_TIMESTAMP` (`services/almoxarifado/schema.js:546`), texto `AAAA-MM-DD HH:MM:SS`, resolução de
  **segundo** — várias saídas da mesma entrega (material com lote que sai de mais de um lote) caem no mesmo segundo; os testes também
  regravam `created_at` por SQL (`consumoPorOsDevolvido`, `relatorioAjustesPorMotivo`, `relatoriosIndicadores`). Linha legada com
  `created_at` NULL não é impossível (coluna sem `NOT NULL`).

### O defeito — e o brief estava incompleto

O brief e o plano da 203 descrevem o corte como *"as já devolvidas por inteiro ocupam vagas e a 31ª, com saldo, some"*. É verdade, mas é o
caso **menor**: a entrega que **nunca** foi devolvida (a maioria — consumo de produção) tem saldo devolvível **cheio** para sempre. Com 31
entregas comuns, nenhuma devolvida, a mais antiga já some. Filtrar "só as com saldo" antes do `LIMIT` (caminho (a)) **não resolve** esse
caso: as 31 têm saldo. O que resolve é poder ir além das 30.

### A escrita não tem limite

`POST /api/almoxarifado/devolucoes` com `movimentacao_saida_id` de qualquer idade passa por `validarSaidaOriginal` (`returnService.js:37-96`)
— só a **lista** esconde. A conta do saldo (régua viva + reentrada, Etapas 117/121) **não muda** nesta etapa, nem a gravação, nem a trava:
a devolução para Estoque continua rodando as pernas sob `naTravaDoMaterial` e relendo dentro da seção o que já voltou (CLAUDE.md, Etapa 121,
B786). A lista é leitura fora de trava, como sempre foi: no pior caso mostra um saldo que a gravação recusa com a literal de sempre.

### A tela

`client/src/components/almoxarifado/DevolucoesAlmoxarifado.js`: estado `saidas` (`:70`); `saidaSelecionada`/`maxDevolvivel` (`:80-81`); o
`useEffect` de `:105-112` busca a lista ao trocar o material, com a guarda `cancelado`; `rotuloSaida` (`:188-205`: data, tipo, quantidade,
requisição ou OS, usuário, lote, *"devolvível N"* / *"já devolvido por inteiro"* / *"N já voltaram ao estoque por outra entrada"*); o
`<select id="dev-saida">` (`:301-307`) lista todas, `disabled` quando `saldo_devolvivel <= 0`; a nota da avulsa (`:308-311`).

### Quem depende do contrato de hoje

- **9 arquivos da API** chamam a rota (`grep -l saidas-elegiveis server/tests/api/*.js`): `devolucaoDoQueVoltou`, `devolucaoVinculo`,
  `devolucaoViva`, `devolucaoVivaFase5`, `devolucaoVivaIntegracao`, `epiEntrega`, `estornoQueFalhaIntegracao`, `oQueJaValeuIntegracao`,
  `oQueJaVoltouIntegracao`. Todos sem `antes_de`, todos com **menos de 30** saídas por material (nenhum asserta o corte: `grep` de `30`/`31`/
  `limite` nos nove não acha o limite), e vários **assertam a linha zerada presente**: `devolucaoVinculo.api.test.js:295` e `:314` (saldo 0),
  `oQueJaVoltouIntegracao.api.test.js:108` (saldo 0, reentrada 2), `epiEntrega.api.test.js:363` (a de EPI ausente).
- **Jest**: `DevolucoesAlmoxarifado.test.js:73` responde a lista para **qualquer** URL que comece com `saidas-elegiveis` (com ou sem query);
  `:189` asserta o rótulo *"já devolvido por inteiro"*.
- **Spec 12** (`specs/modulo-almoxarifado/12-devolucoes/README.md:90-96`): *"as 30 mais recentes"* e *"Linha já devolvida por inteiro
  **volta** na lista com saldo 0 — informação útil, não ruído"*; `:274` lista o teste *"mantem a saida ja devolvida por inteiro"*. O
  caminho (a) contradiria a spec, não só os testes.

## Decisões (letra B — reversíveis; números livres depois de B1362, conferido: o maior hoje é B1362)

- **B1363 — o caminho: "carregar mais" por cursor (b).** Parâmetro novo, opcional, `antes_de=<id da última entrega mostrada>`; o servidor
  devolve as 30 seguintes na **mesma ordem** (`created_at DESC, id DESC`) por *keyset* — `(COALESCE(created_at,'') < c) OR
  (COALESCE(created_at,'') = c AND id < i)`. Sem o parâmetro, a resposta é **byte a byte a de hoje**. **Descartados:** (a) filtrar só as com
  saldo antes do `LIMIT` — não resolve o caso dominante (entrega nunca devolvida tem saldo cheio), contradiz a spec 12 (`:94-96`) e quebraria
  `devolucaoVinculo:295/:314`, `oQueJaVoltouIntegracao:108` e o Jest `:189`; paginação por `offset`/`?pagina=` — uma entrega nova entre dois
  cliques desloca tudo e a página seguinte repete uma linha (ou pula, com um estorno no meio); subir o `LIMIT` — só adia o corte.
- **B1364 — a resposta continua um array** (sem envelope `{ itens, tem_mais }`, sem header). A tela deduz *"há mais"* da página **cheia**
  (30 linhas). Preço declarado: quando o total é múltiplo exato de 30, o último clique volta vazio e a tela diz que não há mais. **Descartado:**
  o envelope — muda o contrato para os 9 arquivos e o Jest por um clique.
- **B1365 — o cursor só ancora a posição.** `antes_de` tem de ser inteiro positivo (senão 400) e uma movimentação **deste material** (senão
  400); **não** precisa ser elegível — a entrega que a pessoa via na tela e foi estornada (ou teve a requisição excluída) entre dois cliques
  continua servindo de âncora. **Descartado:** exigir cursor elegível (o "carregar mais" quebraria por causa de um estorno alheio).
- **B1366 — tamanho da página fixo em 30, só no servidor.** A rota não aceita `?limite=`. **Descartado:** `limite` na query (abre a lista
  sem fim que a spec 12 recusou de propósito). A tela tem a constante `30` própria, com comentário apontando para `returnService.js` (ponto de
  atenção: mudar um sem o outro faz o botão sumir cedo ou sobrar).
- **B1367 — corte: a busca (c) fica fora.** Buscar por número da requisição, OS ou data seria mais rápido que clicar "carregar mais" N
  vezes, mas pede parâmetro de texto, `LIKE` sobre `requisicoes_almoxarifado.numero`/`os_id` e um campo na tela — não cabe nas 2h30 junto com
  o cursor. Vira **C477**. O cursor resolve sozinho: toda entrega elegível passa a ser alcançável.

## Regras de negócio

- **RN-204.01 — sem `antes_de`, nada muda.** Material com 35 saídas elegíveis (uma delas devolvida por inteiro, entre as recentes): a
  resposta tem 30 linhas, as 30 mais recentes por `created_at DESC, id DESC`, inclusive a zerada (`saldo_devolvivel` 0), com os mesmos
  campos de hoje. Os 9 arquivos da API e o Jest da tela passam **sem edição**.
- **RN-204.02 — `antes_de` traz as anteriores, com os mesmos filtros e a mesma conta.** Com `antes_de` = id da 30ª linha da primeira página:
  as linhas 31-35, na mesma ordem; uma saída cancelada, uma de requisição excluída e uma de entrega de EPI **mais antigas** que o cursor
  **não** aparecem; a saída antiga com devolução parcial viva traz `quantidade_devolvida` e `saldo_devolvivel` iguais ao que a validação
  aplica (a 31ª citada no `POST` com o saldo + 1 → 400 com a literal *"Devolução acima do entregue: … e restam N"*, N = o `saldo_devolvivel`
  lido da página 2).
- **RN-204.03 — percorrer até o fim alcança cada entrega uma vez só.** 65 saídas, 12 delas no **mesmo segundo** (`created_at` regravado por
  SQL) caindo na divisa entre as páginas, e uma com `created_at` NULL: páginas de 30 + 30 + 5; a união é exatamente o conjunto elegível (65
  ids, nenhum repetido, nenhum faltando), a de `created_at` NULL vem por último; `antes_de` = a última da 3ª página → `[]` (200).
- **RN-204.04 — recusas do cursor** (pela rota e pelo serviço, mesmas literais): `antes_de=abc`, `0`, `-3`, `1.5` → 400 `antes_de inválido —
  informe o id da última entrega da lista`; `antes_de` = id inexistente ou de **outro** material → 400 `Entrega <id> não encontrada neste
  material`. Cursor de saída **estornada** deste material → 200 com as anteriores a ela (B1365). `material_id` ausente continua 400 `material_id
  é obrigatório`, conferido **antes** do cursor.
- **RN-204.05 — a entrega antiga achada devolve com o vínculo.** Material com lote: 31 entregas (a mais antiga do lote L1, as outras do L2),
  nenhuma devolvida. Página 1 não tem a do L1; página 2 tem. `POST /devolucoes` citando-a, destino Estoque, quantidade 2 → 201, a devolução
  grava `movimentacao_saida_id` e herda `lote_id` = L1 (o saldo de L1 sobe 2); a página 2 lida de novo mostra `quantidade_devolvida` 2 e o
  saldo diminuído de 2. (Integração: lista → grava → lista; e o mesmo pelo serviço: `listarSaidasElegiveis(db, m, { antesDeId })` →
  `registrarDevolucao` → `listarSaidasElegiveis` dão os mesmos números.)
- **RN-204.06 — a tela oferece "Carregar entregas mais antigas".** A primeira página veio com 30 → aparece o botão *"Carregar entregas mais
  antigas"* abaixo do campo *Entrega de origem*. Clique → `GET …/saidas-elegiveis?material_id=<m>&antes_de=<id da última da lista>`; as novas
  entram **no fim** do `<select>`, sem repetir id, e a escolha atual do campo não se perde. Página com menos de 30 → o botão some; se o
  clique trouxe alguma coisa ou nada, a nota *"Não há entregas mais antigas deste material."* aparece só depois de um clique (na primeira
  página curta, nem botão nem nota). Enquanto carrega, o botão fica desabilitado com *"Carregando…"*.
- **RN-204.07 — trocar de material zera a paginação.** Com o "carregar mais" em voo, trocar de material: a resposta atrasada **não** entra na
  lista do material novo (mesma guarda do `cancelado` de `:105-112`), o botão e a nota voltam ao estado da primeira página do material novo.
- **RN-204.08 — falha ao carregar mais não apaga a lista.** O `GET` com `antes_de` rejeita → toast *"Erro ao carregar entregas mais
  antigas"*; as linhas já mostradas e a escolha ficam; o botão volta a ficar clicável.

## Contrato (congelado)

### `GET /api/almoxarifado/devolucoes/saidas-elegiveis` — aditivo

| Query | Antes | Agora |
|---|---|---|
| `material_id` (obrigatório) | igual | igual |
| `antes_de` (opcional) | ignorado | id de movimentação do material; devolve as 30 anteriores a ela |

- Autorização: só `auth` (igual).
- 200: **array** (igual), no máximo 30 linhas, mesmos campos (`id, tipo, quantidade, created_at, lote_id, lote, requisicao_id, os_id,
  projeto_id, usuario_nome, requisicao_numero, quantidade_devolvida, quantidade_reentrada, saldo_devolvivel, series`), ordem `created_at DESC,
  id DESC` (NULL por último). `antes_de` vazio (`?antes_de=`) = ausente.
- 400 `{ error: 'material_id é obrigatório' }` — igual, conferido primeiro.
- 400 `{ error: 'Material não encontrado' }` — igual (do serviço).
- 400 `{ error: 'antes_de inválido — informe o id da última entrega da lista' }` — não casa `^[1-9][0-9]*$` (inclui repetido: `?antes_de=1&antes_de=2`
  chega como array → `String` → `"1,2"` → recusa).
- 400 `{ error: 'Entrega <id> não encontrada neste material' }` — `SELECT id, created_at FROM movimentacoes_almoxarifado WHERE id = ? AND
  material_id = ?` vazio. Sem filtro de cancelado/tipo/EPI (B1365).

### Serviço

`listarSaidasElegiveis(db, materialId, { limite = 30, antesDeId } = {})` — `antesDeId` cru (string da query ou número); `undefined`, `null` e
`''` = ausente. As recusas são `erro400` com as literais acima (o `handleError` da rota já repassa o `status`). Constantes exportadas:
`MSG_ANTES_DE_INVALIDO` e a função da literal do não encontrado, para os testes não redigitarem. Os subselects de `quantidade_devolvida` e
`quantidade_reentrada` **não mudam** (régua de `devolucaoViva.js`, sem cópia); só entram o predicado do cursor no `WHERE` e o `COALESCE` no
`ORDER BY`.

### Tela

`DevolucoesAlmoxarifado.js`: botão `data-testid="dev-saidas-mais-antigas"`, texto *"Carregar entregas mais antigas"* / *"Carregando…"*;
nota `data-testid="dev-saidas-fim"` com *"Não há entregas mais antigas deste material."*; toast *"Erro ao carregar entregas mais antigas"*.
Constante `PAGINA_SAIDAS = 30` com comentário apontando para `returnService.js` (B1366).

## Tasks

- [ ] **T1 (tronco)** — `server/tests/api/devolucaoEntregasAntigas.api.test.js` com RN-204.01 a .04 pela **rota** e RN-204.04 também pelo
  **serviço** (mesmas literais), vermelho; depois o cursor em `listarSaidasElegiveis` e o repasse de `req.query.antes_de` na rota
  (`extended.js:1470`); verde. Atualizar o comentário de `returnService.js:480-497` ("as 30 mais recentes" → "páginas de 30, cursor
  `antes_de`"). Rodar os 9 arquivos isolados: verdes **sem edição** (RN-204.01). Semear as saídas pelo motor (`registrarMovimentacao` ou a
  rota de saída) e regravar `created_at` por SQL só onde o cenário pede empate/NULL.
- [ ] **T2 (galho — depende só do contrato acima, não do código de T1)** — `DevolucoesAlmoxarifado.test.js` com RN-204.06 a .08 (o mock de
  `:73` passa a distinguir `antes_de` na URL **só nos testes novos**; os de hoje continuam com o mock genérico e < 30 linhas, sem botão), vermelho;
  depois o componente; verde. Jest completo da tela e `CI=true npx react-scripts build`.
- [ ] **T3 (integração, cruza rota e serviço)** — RN-204.05 no arquivo de T1: (i) pela rota: `GET` página 1 → `GET` página 2 → `POST
  /devolucoes` citando a 31ª → `GET` página 2 de novo; (ii) pelo serviço, o mesmo encadeamento, com os mesmos números. Prova de que a página 2
  não é uma leitura à parte que diverge da validação.
- [ ] **T4** — controles positivos (abaixo), revisão "passaria com a feature quebrada?", as cinco suítes em série, fechamento
  (`fechar-etapa`): spec 12 `:90-96` (dizia "as 30 mais recentes" — passa a "páginas de 30 com 'carregar mais'", **dizendo** que a frase
  antiga ficou velha) e checklist, mapa, guia (Antes → Agora: *"a entrega antiga não aparecia — agora 'Carregar entregas mais antigas'"*),
  manual, novidades (B1363-B1367, C477) e este plano.

Escala: um executor, T1 → T2 → T3 → T4 (T2 poderia ir em paralelo, mas não vale a worktree numa etapa deste tamanho).

### Controles positivos previstos (perl `-0pi` sobre base LF, restauro por cópia, md5 antes/depois)

| # | Sabotagem | Tem de cair |
|---|---|---|
| (a) | ignorar `antesDeId` | RN-204.02, .03, .05 (a página 2 = a página 1) |
| (b) | cursor sem desempate (`created_at < c` só) | RN-204.03 (as do mesmo segundo somem) |
| (c) | desempate com `<=` | RN-204.03 (repete a do cursor) |
| (d) | sem `COALESCE` no cursor/ordem | RN-204.03 (a de `created_at` NULL nunca vem) |
| (e) | cursor exigindo saída não cancelada | RN-204.04 (cursor estornado → 400) |
| (f) | front sem dedupe / sem guarda de material | RN-204.06 / .07 |
| (g) | front com `setSaidas([])` no `catch` do "carregar mais" | RN-204.08 |

## Cabe nas 2h30?

Sim, com o corte da busca (B1367): análise/plano 30 min; T1 ~45 min; T2 ~35 min; T3 ~15 min; T4 + fechamento ~25 min. Testes ≈ 1h30
dentro disso (T1, T3 e o Jest de T2), como a estimativa previa.

## Pontos de atenção

- **Não tocar a conta do saldo** nem a gravação: a lista e a validação continuam a mesma régua (`devolucaoVinculo` *"[duas pontas]"*, `:267`).
- O cursor compara com o **mesmo** `COALESCE(created_at,'')` do `ORDER BY` — senão formato misto (`T` × espaço) ou NULL quebram a costura
  das páginas. Comparação lexical é coerente com a ordem porque é a mesma expressão nas duas.
- A rota continua registrada colada ao `GET /devolucoes` (`extended.js:1463-1465`, comentário sobre `/devolucoes/:id`).
- A tela seleciona por `String(s.id)`: as páginas novas entram no mesmo array `saidas`, então `saidaSelecionada`/`maxDevolvivel` funcionam
  para a entrega antiga sem mudança.

## Fase 2 — correções do revisor fresco (2026-11-06) — **MANDAM sobre o texto acima onde divergem**

Revisor fresco sobre `3eddf0a5`: 0 trava, 2 importantes, 4 menores, todos aceitos. Confirmado: a ordem é `mv.created_at DESC, mv.id DESC`
(`returnService.js:517`); nenhum caminho grava data retroativa (o `INSERT` do motor, `stockService.js:2324-2329`, não passa `created_at`); cursor
composto (data + id) com `COALESCE` não pula nem repete; trocar o `ORDER BY` para `COALESCE(created_at,'') DESC` não muda a ordem de hoje; a rota segue
com `auth` (`extended.js:1466`); a spec 12 (`README.md:91`) e o comentário de `returnService.js:483-484` mudam na T4, dizendo que estavam velhos;
`validarSaidaOriginal` (`:37-96`) não tem limite de idade; T2 é galho de verdade.

1. **[IMPORTANTE] RN-204.07, a guarda do "carregar mais":** é um `useRef` de **geração**, incrementado no `useEffect` de `DevolucoesAlmoxarifado.js:105-112`
   a cada troca de material (inclusive para vazio); o mesmo efeito zera `carregando`, `fim` e o estado do botão. O handler guarda a geração antes do `GET`
   e descarta `then`, `catch` e `finally` se ela mudou. Teste: A → carregar mais pendente → trocar para '' → A de novo → a resposta velha não altera lista
   nem botão.
2. **[IMPORTANTE] RN-204.06, depois de devolver:** depois do 201 o modal fecha (`:179`); reabrir começa da página 1 (`FORM_VAZIO`, `:125`), sem a nota de
   fim nem páginas antigas. Se o `POST` falhar, o modal fica aberto com as páginas já carregadas; o servidor é a autoridade e a literal vem no toast. **Não**
   reler só a página 2.
3. **[MENOR] Contrato > 400:** a âncora é lida como `SELECT id, COALESCE(created_at,'') AS c …` e `c` vai como parâmetro, nunca `null`.
4. **[MENOR] RN-204.04, ordem das recusas:** `material_id é obrigatório` → `Material não encontrado` → `antes_de inválido…` → `Entrega <id> não encontrada…`.
5. **[MENOR] Nota de fim:** aparece quando a página trazida por clique tem **menos de 30** linhas (inclusive 0); página de 30 mantém o botão (B1364: com
   exatamente 30, o clique traz `[]` e a tela diz "Não há entregas mais antigas deste material.").
6. **[MENOR]** o `antes_de` é o id da última linha da **resposta** anterior, não do array deduplicado.

## Execução

- [ ] Plano — este commit (antes do código).
- [ ] T1
- [ ] T2
- [ ] T3
- [ ] T4

## Próxima tarefa detalhada

Depois da 204, o **item 6 do 2º pacote** (`docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas-2.txt:24-26`, **4h30 a
5h**): *"Lote bloqueado, reprovado ou vencido — 1ª parte: aprovação e separação"* — a aprovação e a separação contam como disponível o saldo
de lote que não pode sair. A Fase 0 da 205 tem de medir, antes de prometer: quantas contas de disponível existem hoje (aprovação —
`requisitionService` sob `comTravaDaRequisicao`; separação — o teto da caixa; o automático da entrega), qual régua de "lote que pode sair" já
existe (`lotService` — elegibilidade usada pela entrega e pela devolução, `materiais/:id/lotes?com_saldo=1` devolve `elegivel`), e quantas
telas de saldo leem a mesma conta (é o que faz a estimativa variar de 4h30 a 5h). Ponto de atenção: o disponível é lido para **reservar**,
então a conta nova roda sob a trava por material (CLAUDE.md, seção da trava) — e a aprovação automática também.

Se a 204 fechar com sobra, a **C477** (busca da entrega por número da requisição/OS na tela Devoluções) é aditiva ao cursor desta etapa:
mais um parâmetro opcional no mesmo `WHERE`, sem mudar a ordem nem a página.
