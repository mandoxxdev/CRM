# 17 — Inventário e Contagem Cíclica

> **Status:** 🟢 no que as duas rodadas se propuseram — Etapa 10 (motor: `AJUSTE_INVENTARIO`
> com guarda de retenção, contagem cega, tolerância+recontagem) + Etapa 10b (escopos de
> contagem combináveis, dupla contagem por duas pessoas, autoria por item, relatório de
> acuracidade, epsilon de divergência como fonte única). Fora, declarado com porquê: contagem
> por endereço, cíclica automática, congelamento, dupla aprovação formal (aguarda a decisão
> B11 do doc de novidades), e-mail · **Spec original:** seção 21 · **Designs:**
> [Etapa 10](../../../docs/superpowers/specs/2026-08-22-almoxarifado-etapa10-inventario-avancado-design.md) ·
> [Etapa 10b](../../../docs/superpowers/specs/2026-08-23-almoxarifado-etapa10b-inventario-avancado-2-design.md)
> **Etapa 31 (2026-08-31, `1e6c9a9..67b6758`) — o NÚMERO deste documento mudou de forma, e só ele.** O `INV-` era montado com os **últimos dígitos** do milissegundo mais um sorteio de 0 a 99, e por isso o carimbo **repetia** a cada **27,78 horas**, e **sem sorteio nenhum**: a colisão em criação simultânea era CERTA. Agora vem do gerador único `services/almoxarifado/numeroDoc.js` (relógio inteiro em base36 + 8 aleatórios), com retry na colisão. **Nada mais desta feature mudou** — nem status, nem checklist, nem comportamento: o número passa de 12–14 caracteres só com dígitos para 20 com letras, os antigos **não** foram migrados e continuam legíveis (RN-05, testada). Furo **C41** das novidades.
> **Última atualização:** 2026-10-09 (**Etapa 97** — a conferência não leva mais o material separado na caixa sem reserva de uma requisição: a caixa entra na guarda de retenção do ajuste (pré-validação e motor, a mesma função) **só quando o ajuste reduz o total** (`3251b014`); a conclusão inteira (pré-validação + aplicação) roda sob a trava de todos os materiais da conferência (`9dbf11c0`) — a corrida entre as duas passadas, a "limitação conhecida" da Etapa 10, deixou de existir; e duas conclusões simultâneas não aplicam o ajuste duas vezes (compare-and-set, `c427bf6d`, **C191**). Range `eb7cd9d8..3fc39310`. Continua 🟢. Ver a seção "Etapa 97" no fim.) Antes: 2026-09-30 (**Etapa 62** — contagem em fração de material com série recusada, e a conclusão lista os materiais com série a regularizar; ver a seção no fim)
> Antes: 2026-08-23 (Etapa 10b fechada, `14f4458..7290481`)
> Antes: 2026-08-22 (Etapa 10, `d644827..8db2671`) · 2026-08-11

## Correção declarada (2026-08-22)

Esta seção, até a Etapa 10, dizia que a conclusão da conferência gravava o saldo **por fora do
motor de estoque**, sem validação nenhuma — "a única exceção conhecida à invariante do motor".
**Isso deixou de ser verdade nesta etapa.** A conclusão agora chama
`stockService.registrarMovimentacao` com um tipo dedicado (`AJUSTE_INVENTARIO`), como qualquer
outra movimentação do módulo — ver "O que existe hoje" abaixo para o caminho atual.

## Objetivo

Inventário geral e contagens cíclicas com listas cegas, recontagem, tolerância, ajuste por
movimentação auditada e relatório de acuracidade. (Contagens por endereço/família/criticidade e
o relatório formal seguem fora do escopo — ver "O que ficou de fora" abaixo.)

## O que existe hoje

- **Tabelas** (`server/services/almoxarifado/schema.js`): `conferencias_almoxarifado` (com
  `modo_cego`, `tolerancia_percentual`, `justificativa_ajuste` — colunas novas da Etapa 10, por
  `safeAlter`), `itens_conferencia_almoxarifado` (com `recontado` — coluna nova).
- **Motor** (`server/services/almoxarifado/stockService.js`): tipo dedicado
  `AJUSTE_INVENTARIO` (`TIPOS_MOVIMENTO`, `TIPOS_DEDICADOS` — a rota genérica de Movimentações
  nunca aceita), reusa a semântica de `AJUSTE` (valor absoluto). Guarda de retenção nova,
  `motivoRecusaAjustePorRetencao(material, novoTotal)` — função pura, exportada, chamada tanto
  pelo motor quanto pela pré-validação da rota — recusa um ajuste que deixaria
  `quantidade_atual` abaixo da soma das quatro colunas de retenção
  (`availabilitySql.COLUNAS_RETENCAO`) *(desde a Etapa 97 a assinatura é `(material, novoTotal, caixa = 0)`: a
  caixa sem reserva das requisições entra no retido quando o ajuste reduz o total — ver a seção "Etapa 97")*.
  `AJUSTE_INVENTARIO` não é estornável pela rota genérica
  de cancelamento (o caminho de correção é uma nova conferência).
- **Rota** (`server/routes/almoxarifado.js`, bloco `/conferencias`): `POST /conferencias` aceita
  `modo_cego`/`tolerancia_percentual`; `GET /conferencias/:id` omite `quantidade_sistema`/
  `divergencia` em modo cego para quem não pode ajustar estoque, sempre traz
  `recontagem_necessaria` calculado no servidor; `PUT /item` exige a conferência `ABERTO` e marca
  recontagem automaticamente na segunda contagem do mesmo item; `PUT /concluir` exige
  `justificativa_ajuste` quando aplica ajustes, bloqueia a conclusão se algum item divergente
  acima da tolerância não foi recontado, e aplica os ajustes **tudo ou nada** — pré-valida cada
  item (permissão de material de cliente, retenção) antes de aplicar qualquer um; se algum falhar,
  nada é aplicado.
- **Config** `tolerancia_inventario_percentual` (`configuracoes_almoxarifado`, semeada com `2`).
- **Front** `client/src/components/almoxarifado/ConferenciaEstoque.js`: checkbox de contagem
  cega e campo de tolerância na criação, coluna "Recontagem" lida do servidor, modal de concluir
  com campo de justificativa (só quando aplica ajustes) e impacto financeiro no aviso de sucesso.
  `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js`: `AJUSTE_INVENTARIO` com
  rótulo e cor no livro, sem botão de estornar.
- Dado real: conferências anteriores à etapa continuam válidas (`modo_cego`/`tolerancia_percentual`
  nulos caem no default).

**Acréscimos da Etapa 10b (2026-08-23, `14f4458..7290481`):**

- **Escopo combinável** no `POST /conferencias` (RN-01/02 do design da 10b): `familia_id` (só
  raiz), `classe_abc`, `apenas_criticos`, `apenas_de_clientes`, `apenas_em_terceiros` — filtros
  E sobre colunas que o material já tinha; `escopo_descricao` gravada como snapshot da criação.
- **Dupla contagem** (RN-03/04): flag por conferência; recontagem exige outra pessoa; o GET
  esconde a contagem do colega de quem não é o último autor (com ou sem modo cego — Critical da
  revisão final); o primeiro contador corrige a própria contagem enquanto ninguém recontou
  (correção não marca recontagem); autoria por item (`contado_por_*`/`recontado_por_*`) sempre
  gravada.
- **RN-08**: `quantidade_contada` validada no `PUT /item` (número finito ≥ 0; zero vale) — fecha
  o contorno em que valor inválido resetava a sentinela da dupla contagem.
- **Relatório de acuracidade** (`GET /conferencias/relatorio-acuracidade`, gate `inventario`,
  RN-05/06/07): derivado dos itens imutáveis, ponderado, com `recontados` e `contados/total`;
  `impacto_financeiro` persistido na conclusão (sem backfill — nulo = não medido na época).
- **Epsilon de divergência** (`services/almoxarifado/divergencia.js`): fonte única de "é
  divergência de verdade" (1e-9), usada pelo relatório novo, pelo antigo
  (`inventario-divergencias` — que também ganhou gate `inventario` e filtro `CONCLUIDO`; antes
  vazava contagem em andamento para qualquer usuário do módulo), pelo filtro de ajustes e pelo
  gate de recontagem do concluir.
- **Motor de estoque não foi tocado** nesta rodada.

## Checklist

### Backend
- [x] **Ajuste como movimentação específica (v2, tipo AJUSTE_INVENTARIO)** — `4e0fabb` (Task 1,
      tipo + guarda de retenção), `a30c87e` (Task 2, rota via motor). **Corte declarado:**
      "dupla aprovação" (feature 06, no sentido de duas pessoas assinando o mesmo processo, como
      o sucateamento) **não foi construída** — o que existe é dupla **permissão** (quem conta ≠
      quem homologa), mais barato e já existente antes desta etapa. Ver letra B do fechamento.
- [x] **Contagem cega**: contador não vê a quantidade do sistema — `a30c87e` (Task 2, RN-02).
- [x] **Recontagem obrigatória acima da tolerância** (config de tolerância %) — `a30c87e`
      (Task 2, RN-04/RN-05).
- [x] **Impacto financeiro do ajuste** (quantidade × custo) — `a30c87e` (D8 do design).
- [x] **Tipos de contagem** (spec 21) — **entregues na Etapa 10b** (`c1ee37b` + fix `7e66d02`):
      por família (raiz), curva ABC, item crítico, materiais de cliente, materiais em terceiros —
      combináveis entre si e com a categoria que já existia. **Continuam fora, declarados** (D2,
      D3, D4, D12 do design da 10b): por endereço (a conferência é por material; ajuste com
      localização é o corte D2), cíclica automática (sem infra de agendamento), surpresa (não é
      artefato de software), por divergência (a recontagem obrigatória da Etapa 10 já é isso) e
      subfamília (o material vincula a raiz; oferecer subfamília criava conferência vazia —
      achado da revisão final).
- [ ] Plano de contagem cíclica (frequência por criticidade/ABC) + geração automática — **fora
      do escopo** (D3 da 10b): sem infra de job; o filtro por classe entrega a prática manual.
- [x] **Dupla contagem: contadores diferentes** — **entregue na Etapa 10b** (`80a7fea` + fixes
      `b16561a`/`7290481`): flag por conferência, recontagem exige outra pessoa, o número do
      colega fica escondido para a segunda contagem ser independente (com ou sem modo cego),
      correção própria permitida pré-recontagem, autoria por item. A comparação lado a lado das
      duas contagens (tela de conciliação) não existe — o que há é o valor final + autoria dos
      dois contadores.
- [ ] Congelar movimentações do escopo durante a contagem — **fora do escopo, declarado**: mesmo
      raciocínio da Transferência sem "em trânsito" (Etapa 7) — site único, baixo valor, alto
      custo.
- [x] **Relatório de acuracidade** — **entregue na Etapa 10b** (`78cdbcd` + fix `957d148` +
      revisão final `7290481`): `GET /conferencias/relatorio-acuracidade` (gate `inventario`),
      derivado dos itens, ponderado, com contados/total, recontados e impacto financeiro
      persistido. **Correção declarada:** este item dizia "fica para a feature de relatórios" —
      a 10b o trouxe para cá porque os dados já eram do inventário; a feature 21 continua dona
      da tela geral de relatórios.
- [ ] E-mail do resultado (feature 19) — **fora do escopo**, mesmo corte de todas as etapas
      anteriores.
- [x] **A conferência não leva a caixa sem reserva de uma requisição; a conclusão sob trava e com
      compare-and-set (Etapa 97)** — a caixa na guarda do ajuste `9dbf11c0` (corrigida para "só
      quando reduz o total" em `3251b014`), a conclusão sob `comLockDosMateriais` `9dbf11c0`, o
      compare-and-set da conclusão `c427bf6d` (C191). Ver a seção "Etapa 97" no fim.

### Frontend
- [x] Modo contagem cega na tela — `4f7ed6f` (Task 3).
- [x] Fluxo de recontagem — `4f7ed6f` (Task 3, badge lido do servidor), `d3fc0ab` (fix: badge
      atualiza ao salvar uma contagem, sem precisar reabrir a conferência).
- [x] **Escopo, dupla contagem, autoria e visão Acuracidade na tela** — Etapa 10b, `b8490cc` +
      fix `cfe44bf` (merge `a95db02`) + revisão final `7290481` (só campo digitado na sessão
      salva — tabular por input preenchido não conta; valor recusado sai da tela; contador do
      cabeçalho por autoria; família só raiz; contados/total e recontados na tabela).
- [ ] Contagem por endereço (hoje categoria + os escopos da 10b) — **fora do escopo, declarado**
      (mesmo item do backend acima).

## Regras essenciais + testes de API exigidos

O design da etapa numerou as regras RN-01..RN-10 (algumas com sufixo, RN-06b/RN-06c, acrescentadas
depois de uma revisão adversarial do plano). Lista completa no design; resumo com o teste que
prova cada uma:

| Regra | Teste | Arquivo |
|-------|-------|---------|
| Contagem cega não expõe `quantidade_sistema`/`divergencia` para quem não pode ajustar | `RN-02: modo_cego omite quantidade_sistema...` | `conferenciaContagemCega.api.test.js` |
| Divergência acima da tolerância exige recontagem, com ou sem aplicar ajustes | `RN-05: divergencia acima da tolerancia sem recontagem bloqueia concluir` | `conferenciaTolerancia.api.test.js` |
| Ajuste sem retenção suficiente é recusado (motor E pré-validação da rota) | `RN-06: AJUSTE que deixaria bloqueado > total e recusado` | `ajusteRetencao.api.test.js` |
| Ajuste gera movimentação auditável no motor, nunca UPDATE direto | `concluir com aplicar_ajustes grava movimentacao AJUSTE_INVENTARIO auditada` | `conferenciaMotorAjuste.api.test.js` |
| Aplicação é tudo ou nada — item recusado bloqueia toda a conclusão | `RN-07: um item recusado por retencao bloqueia TODA a conclusao` | `conferenciaMotorAjuste.api.test.js` |
| `quantidade_em_terceiros` soma de volta ao aplicar (fecha a pendência de 3 etapas) | `RN-06c: material com quantidade_em_terceiros soma de volta ao aplicar` | `conferenciaMotorAjuste.api.test.js` |
| Histórico de contagens é imutável (conferência concluída não edita, não conclui de novo) | `PUT /item em conferencia CONCLUIDA/CANCELADA recusa 400`; `concluir uma conferencia JA CONCLUIDA recusa 400` | `conferenciaTolerancia`/`conferenciaMotorAjuste.api.test.js` |
| Jornada completa (cega + tolerância + recontagem + bloqueio + tudo-ou-nada + estorno recusado) | teste-jornada, 14 passos | `inventarioIntegracao.api.test.js` |
| Contar zero e material inativo não quebram o tudo-ou-nada (achado da revisão final) | achados da revisão final | `ajusteRetencao.api.test.js`, `conferenciaMotorAjuste.api.test.js` |
| **(10b)** Escopo combinável filtra e grava a descrição literal | `RN-01/RN-02: ...` (8 testes) | `conferenciaEscopo.api.test.js` |
| **(10b)** Dupla contagem: outra pessoa reconta, colega não vê o número, correção própria pré-recontagem | `RN-03/RN-04/RN-08: ...` (11 testes) | `conferenciaDuplaContagem.api.test.js` |
| **(10b)** Acuracidade: métricas derivadas, agregado ponderado, impacto persistido, gate positivo+negativo, epsilon | `RN-05/RN-06/RN-07: ...` (13 testes) | `conferenciaAcuracidade.api.test.js` |
| **(10b)** Jornada de composição (escopo + dupla + cego + concluir + relatório + vazamentos fechados) | teste-jornada, 12+ passos | `inventarioEscopoJornada.api.test.js` |
| **(97)** A conferência que conta abaixo da caixa sem reserva recusa na pré-validação, tudo ou nada; contar acima no legado conclui | `[97 RN-01] inventario pela rota…`, `[97 RN-09] inventario tudo ou nada com a caixa…`, `[97 F5-1] legado (caixa 4 > fisico 0): a conferencia que conta 2 (sistema 0) conclui aplicando…` | `portasAvulsasCaixa.api.test.js` |
| **(97)** A conclusão inteira sob a trava dos materiais; duas conclusões simultâneas aplicam uma vez; falha no meio volta a ABERTO | `[97 T2] (Fase 2, menor 3) a conclusao inteira (pre-validacao + aplicacao) roda sob comLockDosMateriais…`, `[97 F5-3] duas conclusoes SIMULTANEAS da mesma conferencia…`, `[97 F5-3] falha no meio da aplicacao…` | `portasAvulsasCaixa.api.test.js` |

## O que ficou de fora (declarado — estado pós-10b)

A lista anterior desta seção mandava tudo "para uma Etapa 10b"; **a 10b aconteceu** (2026-08-23)
e entregou tipos de contagem, dupla contagem e o relatório de acuracidade. O que **continua**
fora, agora sem etapa marcada:

- **Contagem por endereço** (e a guarda de retenção para ajuste com localização específica —
  são o mesmo corte, D2 da 10b: abrir endereço reabriria a decisão da 8b sobre o esperado).
- **Contagem cíclica automática** (plano por ABC/criticidade com geração agendada) — sem infra
  de job; o escopo por classe entrega a prática manual.
- **Congelamento de movimentação durante a contagem** — ruling do cliente-proxy mantido (site
  único, baixo valor, alto custo). Consequência operacional documentada no doc de novidades
  (item C7: não contar o escopo em-terceiros com remessa em andamento).
- **Fluxo formal de dupla aprovação** (duas assinaturas, como o sucateamento) — aguarda a
  decisão **B11** do doc de novidades; existe dupla permissão + dupla contagem, não duas
  assinaturas no mesmo processo.
- **E-mail do resultado** (feature 19).
- **Tela de conciliação lado a lado das duas contagens** — a dupla contagem guarda o valor
  final e a autoria dos dois contadores, não as duas quantidades separadas.

## Dependências

- 03 (ajuste via movimentação — **atendido nesta etapa**) · 06 (dupla aprovação formal — ainda
  não construída) · 01 (classe ABC — para contagem cíclica automática, fora do escopo).

## Etapa 62 (2026-09-30) — material com série no inventário

`327703d` (servidor), `b242545` (tela), fix-round `1080491`.

- [x] **Contagem em fração de material com série é recusada** na pré-validação da conclusão (tudo ou nada):
  `Ajuste bloqueado: {codigo}: material com controle de serie exige contagem inteira` — a regularização das séries nunca
  fecharia uma diferença fracionária.
- [x] **A conclusão devolve `series_a_regularizar: [{ material_id, codigo, fisico, presentes }]`** — os materiais com
  série ajustados cujas séries presentes ficaram diferentes do físico. A tela (`ConferenciaEstoque.js`) mostra o aviso
  fixo *"Estes materiais com série ficaram com séries presentes diferentes do físico — regularize em Lotes e Séries:"*
  com o link de cada material (abre em outra aba).
- **Não mudou (decisão B247):** o `AJUSTE_INVENTARIO` continua ajustando só o número — a contagem não diz quais peças
  foram contadas. Pedir as séries na contagem é outra etapa, se quiserem.
- Testes: `server/tests/api/ajusteComSerie.api.test.js` (os dois cenários de inventário) e
  `client/src/components/almoxarifado/ConferenciaSeriesARegularizar.test.js`.

## Etapa 97 (2026-10-09) — a conferência não leva a caixa de uma requisição; a conclusão sob trava e com compare-and-set

Plano: `docs/superpowers/plans/2026-10-09-almoxarifado-etapa97-portas-avulsas-respeitam-a-caixa.md` (`eb7cd9d8`, Fase 2
`4a9cf5c1`). Range `eb7cd9d8..3fc39310`. A régua da caixa sem reserva está na feature 03.

**O que estava errado:**
- **Fase 0 (P1):** com 4 separados na caixa sem reserva de uma requisição A (físico 4, reservado 0), uma conferência que
  contava 0 concluía aplicando (`AJUSTE_INVENTARIO` para 0) → 200, físico 0, e A ficava presa: entregar → 400 *"Máximo:
  0"*. A guarda de retenção (`motivoRecusaAjustePorRetencao`) só somava reservado, bloqueado, em inspeção e em terceiros.
- **Fase 5, achado 1 (regressão da própria 97, pega antes do fechamento):** com a caixa em toda guarda de ajuste, no
  legado (caixa 4 sobre físico 0) o ajuste **para cima** (0 → 2) recusava — a conferência que contava 2 travava o
  inventário inteiro (tudo-ou-nada).
- **Fase 5, achado 3 (anterior à etapa, 9/9):** duas conclusões simultâneas da mesma conferência aplicavam o ajuste
  duas vezes (**C191**).

**Entregue:**
- [x] **A caixa na guarda do ajuste, só quando reduz o total** — `9dbf11c0` (a pré-validação lê a caixa e passa a
  `motivoRecusaAjustePorRetencao` — a **mesma** função e a mesma leitura que o motor usa, D1 da Etapa 10), `3251b014`
  (`stockService.caixaParaGuardaDoAjuste`: a caixa entra no retido só se o novo total < físico atual; o que conta mais
  que o sistema nunca é recusado pela caixa; as retenções de sempre continuam nos dois sentidos, RN-06 da Etapa 10).
  Recusa: *"Ajuste bloqueado: ⟨cod⟩: Ajuste para ⟨t⟩ ⟨un⟩ deixaria o disponível negativo (⟨partes⟩, mínimo aceitável:
  ⟨m⟩ ⟨un⟩). Resolva a retenção antes de ajustar para menos, ou ajuste para um valor maior ou igual ao mínimo."* — a
  parte nova é *"separada na caixa de requisição: ⟨c⟩"* (depois de "em terceiros"); vários materiais separados por `; `.
  Nenhum item é ajustado (tudo ou nada); a conferência fica aberta.
- [x] **A conclusão inteira sob a trava dos materiais** — `9dbf11c0` (Fase 2, menor 3): a pré-validação **e** a
  aplicação rodam dentro de `comLockDosMateriais(materiais ajustados)`; o motor ali dentro roda direto (a seção segura
  cada material). **A "limitação conhecida" da Etapa 10 — a corrida entre a pré-validação e a aplicação, em que uma
  separação, reserva ou bloqueio entre as duas passadas fazia o motor recusar o segundo item depois de ajustar o
  primeiro — deixou de existir para os materiais da conferência.** Esta spec não a afirmava (ela vivia no plano da
  Etapa 10 e no comentário da rota `PUT /conferencias/:id/concluir`, que agora diz "Resolvida na Etapa 97"); quem a ler
  no plano da Etapa 10 deve saber que deixou de valer.
- [x] **Compare-and-set da conclusão** — `c427bf6d` (C191, B501): `UPDATE conferencias_almoxarifado SET status =
  'CONCLUIDO' WHERE id = ? AND status = 'ABERTO'`; com ajustes ele roda dentro da trava, **depois** da pré-validação e
  **antes** de aplicar — só uma conclusão aplica; a outra recebe 400 *"Conferência não está aberta (status atual:
  CONCLUIDO)"*. Falha no meio da aplicação devolve a conferência a `ABERTO` (concluir de novo é seguro: o
  `AJUSTE_INVENTARIO` é absoluto). Descartado: o CAS antes da pré-validação (a recusa teria de desfazer o status).

**Fica de fora (declarado):** a contagem por endereço e o `AJUSTE` com localização (D2 da 10b; B495 da 97 — o `AJUSTE`
com localização de ida continua podendo levar a caixa, C186); travas em memória, um processo (C132).

**Testes:** `portasAvulsasCaixa.api.test.js` — *"[97 RN-01] inventario pela rota: conta 0 na montagem e conclui
aplicando -> 400 "Ajuste bloqueado:" + M6 com a caixa; nada muda, conferencia aberta; A entrega 4"*, *"[97 RN-09]
inventario tudo ou nada com a caixa: o primeiro sem caixa (conta 3 de 5), o segundo com caixa (conta 0) -> 400 da pre-
validacao e NENHUM item ajustado"*, *"[97 T2] (Fase 2, menor 3) a conclusao inteira (pre-validacao + aplicacao) roda sob
comLockDosMateriais (…)"*, *"[97 F5-3] duas conclusoes SIMULTANEAS da mesma conferencia: uma conclui, a outra recebe
"nao esta aberta" — UM AJUSTE_INVENTARIO no livro (…)"*, *"[97 F5-3] falha no meio da aplicacao (o motor estoura no
segundo item): a conferencia volta a ABERTO e concluir de novo conclui (…)"*, *"[97 F5-1] legado (caixa 4 > fisico 0):
o ajuste PARA CIMA nao e recusado pela caixa (…)"*, *"[97 F5-1] legado (caixa 4 > fisico 0): a conferencia que conta 2
(sistema 0) conclui aplicando — um material do legado nao trava o inventario inteiro"*;
`portasAvulsasCaixaIntegracao.api.test.js` — *"[97 T3 C1]"* (a conferência que conta 0 recusa e, depois da entrega,
conclui). `test:api` 338/338 (4163 ✓). Continua 🟢.
