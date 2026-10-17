# Etapa 138 (núcleo/propostas): o payload parcial que zera colunas nos `PUT`, o salvamento que nunca respondia (C296) e a renumeração que desfaz no mesmo passo (C294) — plano

> Origem: "Próxima tarefa detalhada — Etapa 138" do plano da 137. Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-17-almoxarifado-etapa138-payload-parcial-nos-put-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-17): última B **B888**, último C
> **C295**, última A **A83**. Esta etapa: **B889+**, **C296+**, **A84+**. Worktree `CRM-wt-e138`, branch `etapa-e138` (a partir da main
> `c70bcaa4`).
>
> **Fase 2 (um revisor fresco, sonda `scratchpad/e138/rev2/sonda-c294b.js`): 1 Critical, 5 Important, 6 Minor — todos aceitos, antes de
> qualquer código de produção.** **C1** o teste da C294 como estava (edições espalhadas durante a renumeração) **não reproduz** no código
> velho: o `exec` do driver é exclusivo e a leitura do `authenticateToken` espera; só a **rajada** junto com a renumeração perde (21–24 de
> 30), e só com `RAISE(ABORT/FAIL)` (`ROLLBACK` no gatilho fecha a transação sozinho) → o teste virou a rajada. **I2** o sufixo `REVnn`
> olha o `cliente_id` do corpo → cliente efetivo. **I3** o registro da revisão compara com o corpo cru → efetivo, com cenário. **I4** o
> `SET` vazio seria erro de SQL → só `updated_at`. **I5** a corrida desconto × status entre duas abas pela API → declarada (D (138)). **I6**
> três consequências das regras pelo efetivo → RN explícitas (RN-05d/e/f). **M7** a ordem das recusas e o "só espaços" → fixados (RN-07).
> **M8** a razão do `html_rendered` estava imprecisa → corrigida no design. **M9** a medição de `/itens/descricoes` tinha um item só →
> refeita com dois. **M10** o `PreviewPropostaEditavel` morto é importado por um teste → dito. **M11** o teste do montador fica em
> `tests/api/` (entra no `test:api`). **M12** o servidor sem a tela deixaria a tela sem apagar o *Tipo* → T2 e T3 num commit.
>
> **Achado da Fase 0 (meu, no vermelho da RN-01a):** `chaveDe is not defined` — todo salvamento de proposta com variável manual **nunca
> responde** desde o `3124b01d` (C296). Entra na T2 (RN-03b).
>
> **Trava de máquina:** `scratchpad/e138-lock.sh` (o diretório `maquina-testes.lock`). Um arquivo de teste de servidor por vez, inclusive
> os revisores; nunca `test:api` junto com o jest nem dois `test:api`.
>
> **Review obrigatório da proposta** (`specs/proposta-editavel/review-proposta.md`): a etapa **não toca** template, paginação nem as rotas
> `/premium`, `/pdf`, cláusulas, customizações; mexe no `PUT /api/propostas/:id` e no `PropostaForm` (`client/src/components/proposta/*`).
> As invariantes rodam antes (linha de base: **20/22** — `propostaSumarioOverflow` e `propostaCapaHero` **já falham na main `c70bcaa4`**,
> antes de qualquer mudança; o jsdom 32/32) e antes de cada commit de código (`scratchpad/e138/review-proposta.sh`).

## Regras de negócio

Literais: **L-RAZAO** = *"Razão social é obrigatória"*; **L-TITULO** = *"Título é obrigatório"* (as duas da criação, hoje); **L-MOTIVO** =
*"Motivo da não venda é obrigatório quando a proposta está perdida/rejeitada."*; **L-DESC** = *"Não é possível alterar o status de uma
proposta com desconto acima de 5% sem aprovação prévia. A proposta deve permanecer como rascunho até que a autorização seja aprovada."*
(as duas de hoje do `PUT`); **L-404P** = *"Proposta não encontrada"*. "Presente" = a chave está no corpo JSON (`hasOwnProperty`, valor
diferente de `undefined`). "Vazio" de obrigatório = `null`, ou texto que fica vazio depois do `trim`.

- **RN-01 — proposta: ausente mantém.** Proposta com cliente, projeto, título, descrição, valor 300, condições, prazo, garantia,
  observações, status *rascunho*, margem 2, tipo *tecnica*, os 3 contatos, idioma, moeda, incoterm, unidade de negócio e 2 itens com uma
  variável manual. (a) `PUT {titulo}` → 200, só o título muda; itens, variável, revisão e número intactos. (b) `PUT {status: 'enviada'}`
  (sem título) → 200, só o status muda (hoje 500). (c) o payload **da tela** (os campos que o `PropostaForm` manda, com `itens`) mantém as
  oito colunas que a tela não carrega (`projeto_id`, 3 contatos, idioma, moeda, incoterm, unidade de negócio).
- **RN-02 — proposta: presente vazio ou nulo limpa, como hoje.** `tipo_proposta: null` → `null`; `data_fechamento: null` (status
  *rascunho*) → `null`; `descricao: ''` → `''`; `condicoes_pagamento: ''` → `''`; `cliente_contato: ''` → `null`; `expira_em: null` →
  `null`; `oportunidade_id: null` → `null`; `origem_busca: ''` → `null`.
- **RN-03 — proposta: itens.** (a) Ausente → nenhum item apagado/reinserido, nenhuma entrada `item_*` no histórico de edições, variáveis
  manuais com o mesmo `item_id`. Presente → o de hoje (mesclagem que preserva campos; `[]` apaga todos). (b) **Presente numa proposta com
  variável manual → 200 (hoje a requisição nunca responde: `chaveDe is not defined`, C296)** e a variável religada ao item novo.
- **RN-04 — proposta: revisão.** Sobe só se `itens` veio e mudou ou `valor_total` veio e mudou: `PUT {titulo}` não sobe; `PUT
  {valor_total: 400}` (sem `cliente_id`) sobe **e o número troca o sufixo para `REV01`** (pelo cliente gravado); o registro em
  `proposta_revisoes` lista **só** *Valor Total* como mudança.
- **RN-05 — proposta: as regras cruzadas pelo efetivo, só quando um dos campos delas veio.** (a) *rejeitada* com motivo: `PUT {titulo}` →
  200, o motivo fica; `PUT {motivo_nao_venda: ''}` → 400 L-MOTIVO; numa *rascunho*, `PUT {status: 'rejeitada'}` → 400 L-MOTIVO, nada
  muda; `{status: 'rejeitada', motivo_nao_venda: 'prazo'}` → grava os dois e a data de hoje. (b) margem 10 gravada, sem aprovação,
  *rascunho*: `PUT {status: 'enviada'}` → **403 L-DESC**, nada muda; `PUT {titulo}` → 200; com a aprovação do desconto, o mesmo status
  passa. (c) `PUT {status: 'aprovada'}` sem data → a data de hoje; `PUT {titulo}` numa *aprovada* com data → data intacta. (d) `PUT
  {status: 'enviada'}` numa *rejeitada* → o motivo vira `null` (como hoje). (e) `PUT {margem_desconto: 10}` numa *enviada* sem aprovação →
  **403 L-DESC** (hoje 200, status apagado). (f) `PUT {status: 'aprovada'}` numa proposta com data de fechamento → a data **fica**.
- **RN-06 — proposta: as exceções.** `PUT {titulo}` → `html_rendered` vira `null`; `probabilidade` ausente ou `null` mantém;
  `responsavel_id` ausente mantém.
- **RN-07 — obrigatório presente e vazio; a ordem.** Proposta `titulo: ''`/`'   '`/`null` → 400 L-TITULO, nada gravado; cliente
  `razao_social: ''`/`'  '`/`null` → 400 L-RAZAO; oportunidade `titulo: ''`/`'  '`/`null` → 400 L-TITULO. Na proposta, a ordem é **404
  L-404P → 400 L-TITULO → 400 L-MOTIVO → 403 L-DESC**.
- **RN-08 — a tela de propostas apaga com `null`.** O payload do `PropostaForm` com *Tipo* "—", *Fechamento* vazio, sem oportunidade e sem
  expiração tem `tipo_proposta: null`, `data_fechamento: null`, `oportunidade_id: null`, `expira_em: null` (as chaves **presentes**); com
  valores, os mesmos de hoje (`Number(oportunidade_id)`); o resto do payload igual ao de hoje (`responsavel_id` vazio continua ausente).
  O servidor, recebendo isso, limpa (RN-02).
- **RN-09 — cliente: ausente mantém.** `PUT {telefone}` → 200, só o telefone muda (hoje 500); `PUT {razao_social}` → só a razão social
  (hoje zerava 13 colunas, logo e status inclusive); o payload da tela (objeto inteiro do `GET` com `email: ''`) → o e-mail vira `''`, o
  resto como mandado; `logo_url: ''` → `null`; transformação de hoje (maiúsculas nas mesmas colunas); `{}` → 200, nada muda.
- **RN-10 — oportunidade: ausente mantém.** `PUT {etapa}` → 200, só a etapa (maiúscula, como hoje); `PUT {titulo}` → só o título; `{foo:
  1}` → 200, nada muda.
- **RN-11 — a renumeração que falha não desfaz o que os outros gravaram (C294).** Propostas no padrão fora de ordem e um gatilho que recusa
  (`RAISE(ABORT)`) o último `UPDATE` da renumeração; uma **rajada** de 30 edições de cliente mandada junto com ela, 3 rodadas. Depois: a
  renumeração respondeu 500, nenhum número mudou, **toda** edição que respondeu 200 está no banco, e uma gravação seguinte grava. Sem a
  falha: renumera.
- **RN-12 — integração pela rota e pelo serviço.** RN-01..RN-07, RN-09..RN-11 pela rota (o `index.js` real, pasta vazia); o montador do
  `SET` parcial (`server/atualizacaoParcial.js`) e o payload da tela (RN-08, função pura do client) pelo serviço.

## Contrato congelado

- `PUT /api/propostas/:id`: chave ausente = coluna intacta; presente = a transformação de hoje. `itens` ausente = itens intactos. Novo
  **400 L-TITULO**. A ordem: 404 → L-TITULO → L-MOTIVO → L-DESC (o 404 vem antes do L-MOTIVO, hoje era depois). L-MOTIVO e L-DESC olham o
  efetivo e rodam quando um dos campos delas veio. Resposta de sucesso igual.
- `PUT /api/clientes/:id`: ausente = intacta; novo **400 L-RAZAO**; corpo sem coluna conhecida → 200. Sucesso igual (`{message: 'Cliente
  atualizado com sucesso'}`).
- `PUT /api/oportunidades/:id`: ausente = intacta; novo **400 L-TITULO**; corpo sem coluna conhecida → 200. Sucesso igual.
- `POST /api/propostas/renumerar`: payload, sucesso e 403 iguais; a falha continua 500 `{error}`, agora sem desfazer escrita alheia.
- `server/atualizacaoParcial.js`: `presente(corpo, chave)` → boolean; `montarSetParcial(corpo, mapa)` → `{ colunas: string[], params:
  any[], sql: 'a = ?, b = ?' }` só com as chaves presentes, na ordem do `mapa`, cada valor passado pela transformação do mapa (`sql: ''`
  sem nenhuma).
- Client: `client/src/components/proposta/payloadProposta.js` `montarPayloadProposta({ form, itens, statusSalvar, valorTotal, maxDesc,
  exigeMotivo })` → o objeto que o `PropostaForm` manda (extraído do `handleSubmit`, com os quatro `|| undefined` → `|| null`).

## Tasks (sort topológico)

- [x] **T1 — o montador (tronco)** — `server/atualizacaoParcial.js` + `server/tests/api/atualizacaoParcial.api.test.js` (RN-12).
- [x] **T2 — proposta (tronco: rota)** — `PUT /api/propostas/:id` (RN-01..RN-07) e o `chaveDe` (RN-03b) +
  `server/tests/api/putParcialMantem.api.test.js` (cenários de proposta). Vermelho antes.
- [x] **T3 — a tela de propostas** — `payloadProposta.js` + `payloadProposta.test.js` + o `PropostaForm` usando-o (RN-08). Vermelho antes.
- [x] **T4 — clientes e oportunidades** — os dois `PUT` (RN-07, RN-09, RN-10), cenários no mesmo arquivo de teste.
- [x] **T5 — C294** — `POST /api/propostas/renumerar` por `db.execEmTransacao` (RN-11) + `server/tests/api/propostaRenumerarFalha.api.test.js`.
  Vermelho antes.
- [x] **T6 — fechamento** — novidades (B889+, C294 resolvida e corrigida, C296 nova e resolvida, C297 nova, D (138), F (138), a seção da
  etapa, cabeçalho), spec da proposta editável (`review-proposta.md` armadilha 7, `CHECKLIST…:115`, `backend.md`), mapa, guia, manual,
  este plano (retro, "Próxima tarefa detalhada — Etapa 139"), o "defeito que escapou" da retro da 137.

**Ordem:** T1 → T2 → T3 → T4 → T5 → T6, em série, eu mesmo. Commits: **T1+T2+T3** (o montador, a proposta e a tela — um assunto, Fase 2
M12), T4, T5, a Fase 5, o fechamento. **Galhos em paralelo: 0** (o mesmo `index.js` e o "um teste de servidor por vez").

**Trava por material:** não toca — o CLAUDE.md **não** muda. **Boot:** mexe em rotas do `index.js`, não no boot; os testes sobem o
`index.js` real em pasta vazia, e o boot com pasta vazia é rodado à mão. **Migração:** nenhuma.

**Controles positivos previstos** (âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia): o `presente` sempre verdadeiro
(RN-01 cai); o `SET` com todas as colunas (RN-01); `itens` ausente apagando (RN-03a); o `chaveDe` fora do import (RN-03b); a revisão sem o
`tem('valor_total')` (RN-04); o sufixo pelo `cliente_id` do corpo (RN-04); `dadosNovos` pelo corpo (RN-04 registro); a regra do desconto
pelo corpo (RN-05b/e); `html_rendered` dentro do parcial (RN-06); o 400 L-TITULO fora (RN-07); o client de volta ao `|| undefined`
(RN-08); clientes/oportunidades com o `UPDATE` antigo (RN-09/10); a renumeração de volta ao `db.exec` com `ROLLBACK` no `catch` (RN-11).

## Execução — o que aconteceu

- **Fase 0** — medida por mim: `scratchpad/e138/sonda-f0.js` (o `index.js` real em pasta vazia, um campo por `PUT`, o banco lido por fora)
  e um agente de medição (só leitura) para o que cada tela manda. Três dos nove `PUT` zeravam (proposta, cliente, oportunidade); as cinco do
  preview e a de produto já mantinham. **Achado fora do escopo, no vermelho da RN-01a:** `chaveDe is not defined` — o salvamento de proposta
  com variável manual nunca respondia desde o `3124b01d` (C296), conserto de uma linha na T2.
- **Fase 2 antes do código de produção:** 1 Critical + 5 Important + 6 Minor, todos aceitos (ver o topo). O teste da C294 virou a rajada
  (vermelho no código velho: 15/13/7 de 30 perdidas); o plano ganhou RN-04 (sufixo e registro pelo efetivo), RN-05d/e/f, a ordem das recusas
  e o corpo sem coluna.
- **Vermelhos antes do código:** `putParcialMantem` 14/15 vermelhos (o verde: o payload da tela do cliente, que já gravava como hoje —
  fixação); `propostaRenumerarFalha` 1/2 vermelho (o caminho feliz verde — fixação); `atualizacaoParcial` e `payloadProposta` sem o módulo.
- **Commits:** T1+T2+T3+T4 `f755896e`; T5 `6eec66f9`; Fase 5 `43980b9b`; fechamento — o commit de documentação (ver `git log`). O commit
  `f755896e` foi montado com `git apply --cached` de parte do diff do `index.js` (sem os dois blocos da renumeração), conferido com
  `node --check` no arquivo do índice; a suíte rodou na árvore com os dois.
- **Divergências do plano:** (1) **T4 entrou no commit da T1–T3** — o mesmo assunto e o mesmo arquivo de teste (o plano previa um commit
  só para T4). (2) **O teste da C294 mudou duas vezes:** a primeira versão (edições espalhadas durante a renumeração) passava no código velho
  — confirmando o C1 da Fase 2 —; uma tentativa intermediária com um preload que gravava durante o `exec` foi descartada pela rajada, que é o
  caso real. (3) **A Fase 5 mudou o design da decisão 1:** a corrida desconto × status deixou de ser limitação declarada e virou a guarda
  `AND col IS ?` com 409 (B896). (4) **A troca de cliente** (B897) não estava no plano — achado do revisor de regra.
- **Controles positivos** (âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia; `scratchpad/e138/bateria.js`,
  `bateria-f5.js`, `bateria-x.js`): **T1–T5** S1–S15 com S10a/b/c e S11a/b/c — **19 caem** (as S10 "sobreviveram" na primeira rodada por uma
  régua minha errada: o jest no Windows marca falha com `×`, não `✕`; refeitas, caem; a S12 abortou na primeira rodada com a âncora contada
  2 — a exclusão de usuário usa o mesmo `execEmTransacao(stmts.join(...))` —, refeita com contexto, cai). **Fase 5** F1–F6 — **6 caem**; e
  10 das sabotagens sobreviventes do revisor r3 reaplicadas contra os cenários novos — **10 caem**.
- **Boot:** a etapa mexe em rotas do `index.js`, não no boot; os testes sobem o `index.js` real em pasta vazia, e o boot à mão com
  `CRM_DATA_DIR` vazio (`scratchpad/e138/boot.sh`) subiu duas vezes na mesma pasta (*"Banco de dados totalmente inicializado"*, login 200; os
  dois avisos `duplicate column` de `materiais_escritorio` no primeiro boot são de antes desta etapa). **Migração:** nenhuma.
- **Review obrigatório da proposta:** linha de base (main `c70bcaa4`, antes de qualquer mudança) **20/22** + jsdom 32/32 —
  `propostaSumarioOverflow` (*"sumário estourado deveria estar escondido"*) e `propostaCapaHero` (*"coluna x=0 majoritariamente branca"*)
  **já falhavam**; antes de cada commit de código, o mesmo 20/22 + 32/32. A etapa não toca o template. Registrado na letra F (138) e
  escolhido para a 139.
- **CLAUDE.md:** a seção da trava por material **não mudou** (a etapa não toca saldo).
- **Suíte antes de cada commit de código:** antes de `f755896e`/`6eec66f9` (a árvore com os dois): `test:api` **456/456**;
  `test:almoxarifado` **44/0**; `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 16/0; client **134** suítes / **1784** testes;
  `CI=true build` *Compiled successfully*; review 20/22 + 32/32. Antes de `43980b9b`: `test:api` **456/456**; `test:almoxarifado` 44/0; 4/0,
  3/0, 16/0; client **134** / **1786**; build *Compiled successfully*; review 20/22 + 32/32.
- **Fase 5** — três revisores frescos em paralelo sob a trava de máquina; o de sabotagem na worktree própria `CRM-wt-e138-r3` (removida, com
  as junções desfeitas antes, e a branch `etapa-e138-r3` apagada).
  - **Regra (r1): 1 Important desta etapa** — a troca de cliente com o contato da proposta do cliente anterior na capa (**corrigido**,
    `43980b9b`, B897); **anteriores:** as variáveis manuais trocadas com dois itens iguais (**C298**), a revisão sem sufixo sem cliente
    (D (138)), os itens que não são lista apagando (D (138)).
  - **Permissão (r2): 1 High desta etapa** — duas gravações parciais simultâneas furando o desconto (5/6; 6/6 com a tela) e a de rejeitar
    sem motivo (5/6) (**corrigidas**, `43980b9b`, B896); o número regravado com o lido desfazendo a renumeração (**corrigido**);
    **anteriores:** a margem com vírgula passando pelos 5 % (**C299**), os itens do `db.prepare` dentro da janela da renumeração (D (137),
    D (138)); a injeção de nome de coluna pelo corpo **refutada** (as colunas vêm só do mapa).
  - **Sabotagem (r3): 90** sabotagens novas, **36** caíram, **54** sobreviveram: **51** por falta de cenário (viraram os cenários X01–X17 no
    `putParcialMantem` e 2 no `payloadProposta.test.js` — K05 o `...form`, K06/K07 a chamada do `PropostaForm`, presa pelo texto porque
    nenhum teste o renderiza), **3** equivalentes provadas (P08, P21, R02; e a K04).
- **T6 — fechamento** (o commit de documentação): novidades (cabeçalho, A84, B889–B898, C294 resolvida e corrigida, C296 resolvida, C297–C299,
  D (138), F (138), a seção da etapa, "Onde estamos"), spec da proposta editável (`review-proposta.md` armadilha 7, `CHECKLIST…:115` marcado,
  `auditoria.md`, `backend.md`), o design (a seção da Fase 5), o mapa (a linha do topo — nenhuma feature do mapa muda), guia (cabeçalho,
  seção, roteiro), **manual**: o comportamento foi enxertado no **`docs/GUIA_TREINAMENTO_COMPLETO.md`** (3.2.2 Cadastro de Cliente, 3.3.3
  Edição de Proposta, 3.4.2 Oportunidade) — o `docs/almoxarifado-manual-do-sistema.md` **não** foi tocado porque ele declara não cobrir
  Clientes nem os outros módulos (seção 24); este plano; o "defeito que escapou" da retro da 137.

## Tasks — estado

- [x] **T1** · [x] **T2** · [x] **T3** · [x] **T4** `f755896e` (Fase 5 `43980b9b`) · [x] **T5** `6eec66f9` · [x] **T6** — o commit de
  documentação.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** (Fase 5: a guarda das regras cruzadas com 409, o número/revisão/responsável só quando mudam, a
   troca de cliente, e os 20 cenários do r3). Testes antigos mudados: **0**.
2. **Achados da revisão:** Fase 2 — **1 Critical + 5 Important + 6 Minor, todos reais** (o Critical medido por sonda). Fase 5 — r1 **1** desta
   etapa (corrigido) + **3** anteriores; r2 **2** desta etapa reproduzidos (corrigidos) + **2** anteriores + 1 refutado; r3 **51**
   sobreviventes reais (viraram cenários) + **3** equivalentes; **0** ruído.
3. **Paralelismo:** **0** galhos em paralelo (o mesmo `index.js` e o "um teste de servidor por vez"), **0** retrabalho; **1** agente de
   medição (só leitura) na Fase 0, **1** revisor na Fase 2, **3** em paralelo na Fase 5 sob a trava.
4. **Defeito que escapou:** **0** (medido na Etapa 139). Nada do que a 139 achou nasceu na 138: a cláusula 5.25+ que sumia (desde `a33dfca1`, 28/07/2026), o teste do hero errado (desde `b8429e2d`), a geração automática sem a regra dos 5 % (C300) e a autorização da aprovação do desconto (C301–C303) são anteriores; a C299, que a 138 registrou, foi fechada na 139. A 138 tinha razão ao registrar os dois vermelhos da revisão como anteriores a ela — mas o diagnóstico "já falhavam" escondia um defeito real de produção desde julho.

## Próxima tarefa detalhada — Etapa 139

*(A série desta etapa foi B889–B898, C296–C299, A84 — a 139 começa em **B899**, **C300**, **A85**; confira com `grep -oE` antes.)*

**Escolhida: as duas invariantes vermelhas da revisão obrigatória da proposta** (`specs/proposta-editavel/review-proposta.md`): a revisão é
o portão de qualquer mudança no template e na paginação, e hoje ela **não fica verde nem na main** — `propostaSumarioOverflow` (*"sumário
estourado deveria estar escondido"*: a proposta grande mostra `tocVisivel: true, tocOverflow: false` com 19 visíveis) e `propostaCapaHero`
(*"coluna x=0 majoritariamente branca (linha branca presente)"*, 94,6 % de pixels brancos na coluna 0). **Fase 0 (medir antes de prometer):**
descobrir **desde quando** cada uma falha (`git log` do template e dos dois testes; rodar os dois em commits antigos numa worktree — a
`propostaCapaHero` exige `pngjs`) e se é **regressão do documento** (o sumário que devia sumir e não some; a faixa branca voltou) ou **régua
do teste que ficou velha** (a proposta de exemplo mudou de tamanho; o screenshot depende de fonte/escala da máquina). **Se for regressão,
corrigir no template com as 13 invariantes rodando; se for régua, corrigir o teste dizendo que estava errado.** Ponto de atenção: o
paginador é template literal (escape duplo de regex, armadilha 4) e o sumário exige renumerar (armadilha 5). **Junto, pequena:** a **C299** (a
margem que não é número recusada com 400 no `PUT` e no `POST` de proposta — hoje `"10,5"` passa pelos 5 %). **Alternativa se a medição achar
que as duas são de ambiente:** o índice e a paginação da lista de propostas (`specs/lentidao-api-propostas/2026-07-21-lentidao-api-propostas.md`,
Frente B), ou a **C297** (a classificação de área do produto que não se apaga — decidir a regra do vazio).

**Dependem do P.O. — NÃO implemente:** **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**,
**C219**, **C230**, o reparo da **C246** (e a **C247**), a tabela de conversões e o grupo acima de família, a **régua do tempo de
recebimento (E2)**, a **C268**, a **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens
de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**,
**B101**/G30, **G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62; nas propostas, a verificação do dono da proposta
(Fase 12 de `specs/proposta-editavel/tasks.md`) e o filtro por permissão do histórico (`auditoria.md`). Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** `montarSetParcial`/`presente` (`server/atualizacaoParcial.js`) — reutilizável em qualquer
`PUT` novo; o `PUT /api/propostas/:id` com a guarda das regras cruzadas (409 `PROPOSTA_ALTERADA`) e as colunas calculadas só quando mudam;
`montarPayloadProposta` no client (o formulário manda `null` para apagar); `db.execEmTransacao` na renumeração; o harness
`putParcialMantem.api.test.js` (40 cenários, com as corridas) como molde.
