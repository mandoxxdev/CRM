# Almoxarifado — Etapa 128: o tempo do recebimento, o aviso da retenção e o perfil que não pisca (plano)

> Origem: "Próxima tarefa detalhada — Etapa 128" do plano da 127. Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-16-almoxarifado-etapa128-o-tempo-do-recebimento-e-o-aviso-da-retencao-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-16): última B **B822**, último C
> **C265**, última A **A75**. Esta etapa: **B823+**, **C266+**, **A76+**; a letra E ganha o segundo item (não é numerada). Worktree
> `CRM-wt-e128`, branch `etapa-e128` (a partir da main `652fc416`).
>
> **Ordem da skill:** este plano é revisado (Fase 2) **antes** de qualquer código de produção (os testes das T1..T5 foram escritos e
> rodados **vermelhos** antes — servidor 12/13 e 11/13, cliente 15/21 —, sem tocar produção).
>
> **Fase 2 (um revisor fresco, sonda `e128r-fase2-a.js`, não versionada, rodada sozinha sob a trava): 4 Important e 4 Minor, todos
> aceitos.** **I1** — na própria C209 o "se perdeu" da A2 (*libere da reserva*) não destrava: o material continua na caixa (a entrega
> segue *"Máximo: 0"* e o encerrar recusa *"Esta requisição tem material separado na caixa…"*) → com material separado do material, a A2
> manda **devolver à prateleira na requisição e liberar a reserva**. **I2** — retenção só em terceiros ou em inspeção não tem "reserva ou
> bloqueio" a liberar, e o que está em terceiros **continua no saldo do endereço** (a contagem tem de somá-lo — a mesma B3 da conferência)
> → o "se perdeu" passa a ser **por retenção presente**, e com terceiros a A2 diz que a contagem tem de somá-los. **I3** — `PUT
> /conferir` não confere o status: depois da entrada um item pode ganhar quantidade sem nunca entrar (o reprocessamento recusa) → o
> recebimento viraria "incompleto" para sempre → "espera entrada" só conta com o status fora de `PROCESSADO`/`APROVADO`, e o fim é o
> maior `entrada_estoque_em` de **qualquer** item com a data; o conferir sem guarda vira **C266** (fora do escopo). **I4** — no SQLite
> `'0' > 0` é verdadeiro → `CAST(COALESCE(QTD_DO_ITEM_SQL, 0) AS REAL) > 0` (o precedente de `receiptService.js` ~329) e o caso `'0'`
> na RN-03. **M1** — `data_recebimento` nula fica fora (não entra como 0) e os itens anteriores à Etapa 6 não aparecem: declarados.
> **M2** — o cadastro de usuários lê `/usuarios/:id/grupos` com `api.get` direto (não passa pelo cache): a RN-23 é defesa; o id compara
> por `String()`. **M3** — o ouvinte é chamado depois do `cache.set`, em `try/catch` (um ouvinte que lança não rejeita a busca); o
> `setUser` mantém `prev` quando é `null` ou de outro id; o `localStorage` só quando mudou. **M4** — a A2 diz também quem libera a
> reserva (Administrador ou Almoxarife — o Gestor não, B410).
>
> **Fora (depende do P.O.):** B808, B755, B761/C239, C224, o resto da C225, C228, C219, C230, o reparo da C246/C247, a tabela de
> conversões e o grupo acima de família; na 05, os itens de produto e a C198; na 06, a B11 e a Engenharia; na 21, a valorização por
> cliente e previsto × realizado; na 22, B13, B101/G30, G38.

## Regras de negócio

**Feature 21 — o tempo médio de recebimento.** Testes: `server/tests/api/relatoriosTempoRecebimento.api.test.js` (RN-01..RN-08),
`server/tests/api/tempoRecebimentoIntegracao.api.test.js` (RN-10) e
`client/src/components/almoxarifado/AlmoxarifadoDashboardTempoRecebimento.test.js` (RN-09). "Quantidade do item" =
`QTD_DO_ITEM_SQL` (`receiptNotificationService`: `quantidade_recebida`, ou a esperada quando é `NULL`/`''` legado).

- **RN-01 — a régua:** por recebimento, horas = (o **maior** `entrada_estoque_em` dos itens que a têm − `data_recebimento`) × 24 (Fase 2,
  I3: sem filtro de quantidade — o item entrado e depois reescrito para 0 não some do fim). `data_recebimento` nula → fora (M1).
  Cenário: cabeçalho às `T`, item A entrou em `T+2h`, item B em `T+6h` → **6** (não 2, não 4).
- **RN-02 — só o completo:** pelo menos um item entrou e **nenhum** item "espera entrada" — quantidade > 0 (`CAST(COALESCE(QTD_DO_ITEM_SQL,
  0) AS REAL)`), `entrada_estoque_em` NULL **e** o recebimento com status fora de `PROCESSADO`/`APROVADO` (Fase 2, I3: depois da
  entrada nada mais entra por ele). O que entrou em parte (a nota que falhou no meio, `EM_ENTRADA_NF`) fica fora da média e conta em
  `incompletos`; o `APROVADO` cujo item ganhou quantidade depois (C266) conta como completo.
- **RN-03 — o item sem quantidade não conta:** item com quantidade 0 e sem entrada não torna o recebimento incompleto; item com
  `quantidade_recebida` `''` (legado) e esperada 5 sem entrada **torna** (a quantidade é a esperada); `'0'` texto **não** torna (Fase 2, I4).
- **RN-04 — janela pelo fim:** entra quem tem o fim (o maior `entrada_estoque_em`) `>= datetime('now', '-N days')`; o incompleto também
  pela última entrada. Fim antes da janela → fora (nem em `incompletos`). Recebimento sem entrada nenhuma → fora.
- **RN-05 — os números:** `media_horas` e `mediana_horas` (a `mediana()` que já existe; par = média dos dois do meio) arredondadas a 2
  casas; `considerados` e `incompletos` inteiros. **Sem considerado → `media_horas: null`, `mediana_horas: null`** (B823), mesmo com
  incompletos. Cenário: durações 1, 2, 10 → média 4,33, mediana 2; com mais uma de 3 → média 4, mediana 2,5.
- **RN-06 — quem entra:** material de cliente e material inativado entram (B824); a entrada **estornada** continua contando (o estorno
  não limpa a data — declarado, D (128)).
- **RN-07 — o parâmetro:** `janela_dias` é o de sempre (400 *"Parâmetro "janela_dias" deve ser um número inteiro maior que zero"*
  inalterado); sem ele, a janela padrão.
- **RN-08 — a régua escrita:** a `nota` do registro `indicadores` ganha a frase literal
  *"Tempo de recebimento: da chegada da nota no sistema à última entrada no estoque dos itens, só os recebimentos que entraram
  inteiros e cuja última entrada está na janela; os que entraram em parte são contados à parte (incompletos) e os que ainda não
  entraram não aparecem; a inspeção depois da entrada não conta; materiais de clientes entram; entrada estornada continua contando."*
- **RN-09 — o cartão** (`AlmoxarifadoDashboard.js`): com o bloco, um quinto cartão **"Tempo médio de recebimento"** com
  `media_horas.toFixed(2)` + `h` (`data-testid="kpi-tempo-recebimento"`), a legenda *"Janela de ⟨N⟩ dias · da chegada à entrada no
  estoque · mediana ⟨M⟩h"*; `media_horas` `null` → `—` e *"sem recebimentos concluídos no período"* (sem a mediana); `incompletos > 0`
  → *"⟨n⟩ com entrada incompleta, fora da conta"*. Sem o bloco (servidor antigo) → os quatro cartões de antes, sem erro.
- **RN-10 — integração (rota e serviço):** recebimento criado pela rota (`POST /recebimentos`) e entrado pela rota (`POST
  /recebimentos/:id/aprovar` e `/processar` com status `EM_ENTRADA_NF`), as datas reescritas no banco para horas conhecidas →
  `GET /relatorios/indicadores` **e** `reportService.relatorioIndicadores(db, { janela_dias })` dão o mesmo bloco, com a conta da RN-01;
  e a nota que falhou no meio (o segundo item recusado pelo motor depois de o primeiro entrar) aparece em `incompletos` e, reprocessada,
  passa a `considerados`.

**C209 — o aviso da retenção (feature 03/17, motor).** Testes: `server/tests/api/ajusteEnderecoRetencao.api.test.js` (RN-11..RN-17),
`server/tests/api/ajusteEnderecoRetencaoIntegracao.api.test.js` (RN-20) e
`client/src/components/almoxarifado/MovimentacoesAvisoRetencao.test.js` (RN-18).

Literal **A2** (contrato; refeita na Fase 2, I1/I2/M4):
`Ajuste gravado, mas o disponível de ⟨código⟩ ficou negativo: o estoque (⟨total⟩ ⟨un⟩) é menor que o retido (⟨partes⟩, total retido:
⟨retido⟩ ⟨un⟩), e nada dele sai pela entrega de requisição enquanto for assim.⟨terceiros⟩ Se o material existe e a contagem não o incluiu,
estorne o ajuste que baixou o estoque (⟨quem⟩); se ele se perdeu, ⟨ações⟩.`
— `⟨partes⟩` = as da M6 sem a caixa (`reservada: 4`, `bloqueada: 3`, `em inspeção: …`, `em terceiros: …`, na ordem de
`COLUNAS_RETENCAO`, só as > 0); `⟨retido⟩` = a soma; `⟨total⟩` = `quantidade_atual` depois do ajuste; `⟨terceiros⟩` = ` O que está em
terceiros continua no saldo do endereço: a contagem tem de somá-lo.` só com terceiros > 0; `⟨quem⟩` = *"perfil Administrador ou Gestor do
almoxarifado"* (nosso) ou *"perfil Administrador do almoxarifado"* (de cliente, B707); `⟨ações⟩` = uma por retenção presente, na mesma
ordem, juntas por vírgula e " e " no fim: reservada → *"libere a reserva (perfil Administrador ou Almoxarife)"*, ou, com material
separado não entregue do material **coberto por reserva** (`caixaSql.lerCaixaComReserva` = o separado não entregue menos a caixa
sem reserva — *divergência da execução:* a primeira versão deste plano dizia "a caixa total"; com caixa só sem reserva, quem destrava
a outra requisição é liberar a reserva dela, e a devolução da caixa sem reserva já é o que o `aviso_caixa` manda), *"devolva-o à prateleira na requisição e
libere a reserva (perfil Administrador ou Almoxarife)"*; bloqueada → *"desbloqueie o que se perdeu (perfil Administrador ou Gestor)"*; em
inspeção → *"decida a inspeção"*; em terceiros → *"resolva a remessa ao terceiro"*. `⟨un⟩` com o filtro do `aviso_caixa`.

- **RN-11 — a C209:** físico 4 no A, requisição de 4 aprovada (reserva 4) e separada; `AJUSTE` "0 no A" → **201**, `aviso_retencao` =
  A2 com estoque 0, `reservada: 4`, retido 4 e a ação *"devolva-o à prateleira na requisição e libere a reserva…"*; **sem**
  `aviso_caixa` (a caixa está coberta pela reserva); o saldo gravou (0).
- **RN-12 — reserva sem caixa:** físico 4, reserva 3 não separada; "1 no A" → A2 com estoque 1, `reservada: 3`, retido 3.
- **RN-13 — bloqueado:** físico 4, bloqueado 3; "1 no A" → A2 com `bloqueada: 3`. Duas retenções (reservada 2 + bloqueada 2, físico 4,
  "3 no A") → `reservada: 2, bloqueada: 2`, retido 4, na ordem.
- **RN-14 — o que não avisa:** disponível exatamente 0 ("3 no A" com reserva 3) → sem `aviso_retencao`; disponível positivo → sem;
  material sem retenção → sem; `ENTRADA`, `SAIDA` e `TRANSFERENCIA` → sem; o `AJUSTE` **sem** localização no mesmo estado continua
  **400** com a literal da Etapa 10 (inalterada); físico negativo sem retenção (material que permite negativo) → sem.
- **RN-15 — material de cliente:** o `⟨quem⟩` é *"perfil Administrador do almoxarifado"*.
- **RN-16 — os dois avisos juntos:** caixa sem reserva de uma requisição (4) **e** reserva de outra (2) no mesmo material, físico 6 no A,
  "1 no A" → `aviso_caixa` (a A1 da 104, *"ficou em 0 PC"*) **e** `aviso_retencao` (estoque 1, `reservada: 2`, retido 2).
- **RN-17 — a recusa do ajuste sem endereço não muda** (`motivoRecusaAjustePorRetencao`, byte a byte — a extração das partes não pode
  mexer na literal): os testes da Etapa 10/97 (`ajusteRetencao`, `ajusteRetencaoCaixa`…) continuam verdes, e um cenário de unidade prende
  a literal com caixa e com as quatro retenções.
- **RN-18 — a tela** (`MovimentacoesAlmoxarifado.js`): `aviso_retencao` texto → `toast.warn(texto, { autoClose: false })`, **depois** do
  `aviso_caixa` quando os dois vêm; ausente ou não-texto → só o sucesso.
- **RN-19 — a leitura que falha não derruba** (o `try/catch` do `aviso_caixa`): o ajuste gravado responde 201 sem o aviso. Declarado
  (sem teste de falha de leitura — o mesmo da 104).
- **RN-20 — integração (rota e serviço):** para RN-11 e RN-12, `POST /movimentacoes/v2` **e** `stockService.registrarMovimentacao`
  chamado direto devolvem o mesmo `aviso_retencao`; depois, a entrega da requisição recusa com *"Máximo: 0"* (o "nada dele sai pela
  entrega" da A2 é verdade); e os dois caminhos da A2 levados até o fim (Fase 2, I1): **existe** — o Gestor estorna o ajuste e a entrega
  passa; **se perdeu** — o Almoxarife devolve à prateleira e libera a reserva, e o disponível deixa de ser negativo (um ajuste seguinte
  não avisa mais).

**O perfil que não pisca (núcleo).** Testes: `client/src/services/permissionsCacheOuvinte.test.js` (RN-21) e
`client/src/context/AuthContextPerfilSemPiscar.test.js` (RN-22..RN-24), com o `AuthProvider` e o `permissionsCache` **reais**; só o HTTP
mockado.

- **RN-21 — o ouvinte:** `onPermissoesGravadas(fn)` (exportada de `permissionsCache.js`, devolve a função de cancelar) é chamada com
  `(userId, data)` quando uma busca real de `/usuarios/:id/grupos` grava o cache; **não** é chamada pelo `seedPermissionsFromAuthUser`, pela
  leitura do cache válido, pela busca de geração velha (invalidada no meio) nem pela que falhou; cancelada, não é mais chamada.
- **RN-22 — sem piscar:** usuário comum com `ADMINISTRADOR` no contexto; o `/usuarios/:id/grupos` diz `null` → depois da busca,
  `getEffectiveUser(user do contexto)` é `null` **e continua** `null` depois de o cache vencer (relógio avançado 5 min + 1); a tela de
  Configurações → Famílias mostra *"Acesso restrito — administrador do Almoxarifado"* nos dois instantes; o `localStorage` guarda `null`.
  Metade positiva: antes da busca, *Nova Família* lá.
- **RN-23 — só o próprio** (defesa — Fase 2, M2: o cadastro de usuários lê com `api.get` direto, sem o cache): a busca de
  `/usuarios/99/grupos` pelo cache com `perfil_almoxarifado: null` não muda o contexto do logado; o id compara por `String()`.
- **RN-24 — sem mudança, sem regravar:** a busca que devolve os mesmos perfis não troca o objeto do contexto (contador de renderização de
  um consumidor não sobe; o `localStorage` não é reescrito).

## Contrato congelado

**`GET /api/almoxarifado/relatorios/indicadores`** — ganha `tempo_recebimento: { media_horas: number|null, mediana_horas: number|null,
considerados: int, incompletos: int }` (RN-01..RN-07). Nenhum outro bloco muda de valor; a `nota` do registro ganha a frase da RN-08.

**`POST /api/almoxarifado/movimentacoes/v2`** (e qualquer chamador de `stockService.registrarMovimentacao`) — o `AJUSTE` com localização
ganha `aviso_retencao` (A2) na resposta 201 quando o disponível depois dele `< -QTD_FOLGA` **e** o retido (sem a caixa) `> QTD_FOLGA`.
Chave ausente no resto. Nenhuma recusa nova; `aviso_caixa` inalterado. **`stockService.partesDaRetencao(material, caixa)`** (nova,
pura): `{ partes: string[], retido: number }` — a que `motivoRecusaAjustePorRetencao` passa a usar; e
**`stockService.avisoRetencaoDoAjuste(material)`** (pura; `material` = a linha relida depois do ajuste): A2 ou `null`.

**Núcleo (cliente):** `permissionsCache.onPermissoesGravadas(fn) → cancelar`; `AuthProvider` assina no `useEffect` do montar e, para o
`userId` do usuário do contexto com `data.usuario`, faz `setUser(prev => igual ? prev : merge)` + `localStorage`, onde `merge =
mergeUserPermissions(prev, data.usuario)` e `igual` compara `role`, `is_superadmin`, `admin_modulos`, `perfil_almoxarifado`,
`perfil_frota` do `merge` com os do `prev` normalizados.

## Tasks (sort topológico)

- [ ] **T1 — tronco (servidor, relatório)** — `reportService.relatorioIndicadores` (o bloco) + `reportRegistry` (a nota) +
  `relatoriosTempoRecebimento.api.test.js`. RN-01..RN-08.
- [ ] **T2 — galho (tela, dashboard)** — `AlmoxarifadoDashboard.js` + `AlmoxarifadoDashboardTempoRecebimento.test.js`, contra o
  contrato (mock HTTP). RN-09. Depende só do contrato da T1.
- [ ] **T3 — tronco (motor)** — `stockService` (`partesDaRetencao`, `avisoRetencaoDoAjuste`, a chave no retorno) +
  `ajusteEnderecoRetencao.api.test.js`. RN-11..RN-17, RN-19 (declarada).
- [ ] **T4 — galho (tela, movimentações)** — `MovimentacoesAlmoxarifado.js` + `MovimentacoesAvisoRetencao.test.js`. RN-18.
- [ ] **T5 — tronco (núcleo, cliente)** — `permissionsCache.js` (o ouvinte) + `AuthContext.js` (a assinatura) + os dois testes.
  RN-21..RN-24. Independente de T1..T4 (outra regra, outro arquivo).
- [ ] **T6 — integração** — `tempoRecebimentoIntegracao.api.test.js` (RN-10) e `ajusteEnderecoRetencaoIntegracao.api.test.js` (RN-20),
  rota **e** serviço.
- [ ] **T7 — fechamento** — novidades (B823+, C209 resolvida, D (128), E segundo item, F se houver), specs 21, 03/17 (C209) e 23 (o
  pisca), mapa, guia, manual, plano (retro e "Próxima tarefa detalhada — Etapa 129"), o "defeito que escapou" da retro da 127.
  CLAUDE.md só se a trava mudar (não deve: o aviso só **lê**, dentro da trava que já existe).

A suíte inteira roda **uma por vez**; revisores rodam só os próprios arquivos, sob a trava de máquina, nunca junto com a suíte (nem dois
arquivos de servidor ao mesmo tempo, nem jest junto).

## Execução — o que aconteceu

*(preencher)*
